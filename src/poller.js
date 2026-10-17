// -----------------------------------------------------------------------------
// Polling and presence: what the console says, turned into Gladys states.
//
// Every state goes through the publisher (src/statePublisher.js): only the
// features of devices created in Gladys, only the changes. The presence and
// the snapshot are kept for every client, created or not: the widgets read
// them.
// -----------------------------------------------------------------------------

import { logger } from '@gladysassistant/integration-sdk';
import { isGatewayDevice } from './devices/gateway.js';
import { isWireGuardServer, vpnClientKey, vpnClientName, vpnClientsOf } from './vpn.js';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  VPN_CONNECTED: 'vpn_client_connected',
  VPN_DISCONNECTED: 'vpn_client_disconnected',
});

// The poll runs on the container's own timer: Gladys 5.2.0 never polls the
// devices of this integration (they are published with `poll_frequency` but
// without `should_poll`, see GladysAssistant/Gladys#3198, and the devices
// already created would not get it anyway).
export const POLL_INTERVAL_MS = 30 * 1000;

/**
 * @param {object} deps
 * @param {object} deps.gladys the SDK object (external ids)
 * @param {object} deps.publisher createStatePublisher(gladys)
 * @param {() => object|null} deps.getUnifiClient the current UniFi client
 * @param {() => object} deps.getConfig the current configuration
 * @param {() => object} deps.getSnapshot the snapshot of the widgets
 * @param {() => void} [deps.onPresenceChanged] a client came or left
 * @param {() => void} [deps.onVpnChanged] the VPN server or its clients changed
 */
export function createPoller({
  gladys,
  publisher,
  getUnifiClient,
  getConfig,
  getSnapshot,
  onPresenceChanged = () => {},
  onVpnChanged = () => {},
}) {
  /** The connected clients of each WireGuard server at the last poll: id → Map(key → client). */
  const vpnClients = new Map();
  let vpnSignature = null;
  const presenceTimers = new Map();
  const knownPresenceStates = new Map();
  let isPolling = false;
  let pollTimer = null;
  // A failing poll is logged once, and its recovery once: not every 30 s.
  let pollFailing = false;

  const presenceId = (mac) => gladys.externalId(`client:${mac.toLowerCase()}:presence`);

  /** Remember the presence of a client; a change calls onPresenceChanged. */
  function setPresence(mac, state) {
    const changed = knownPresenceStates.get(mac) !== state;
    knownPresenceStates.set(mac, state);
    if (changed) {
      onPresenceChanged();
    }
  }

  /** Update client presence with immediate 1 (online). */
  async function updateClientPresence(mac, state) {
    if (presenceTimers.has(mac)) {
      clearTimeout(presenceTimers.get(mac));
      presenceTimers.delete(mac);
    }
    setPresence(mac, state);
    await publisher.publish(presenceId(mac), state);
  }

  /** Schedule client offline (0) with configured hysteresis delay. */
  function scheduleClientOffline(mac) {
    if (presenceTimers.has(mac)) {
      clearTimeout(presenceTimers.get(mac));
    }
    const delayMs = (getConfig().presence_offline_delay || 120) * 1000;
    const timer = setTimeout(async () => {
      logger.debug(`Presence offline delay elapsed for ${mac}. Setting presence to 0.`);
      setPresence(mac, 0);
      await publisher.publish(presenceId(mac), 0);
      presenceTimers.delete(mac);
    }, delayMs);
    presenceTimers.set(mac, timer);
  }

  /**
   * A real-time event of the console's WebSocket: EVT_WU_Connected /
   * EVT_LU_Connected (Wi-Fi or wired client connected), EVT_WU_Disconnected /
   * EVT_LU_Disconnected.
   */
  async function handleEvent(event) {
    if (!event || !event.key || !event.user) return;
    const mac = String(event.user).toLowerCase();
    if (event.key.includes('Connected')) {
      logger.debug(`UniFi event: Client connected -> ${mac}`);
      await updateClientPresence(mac, 1);
    } else if (event.key.includes('Disconnected')) {
      logger.debug(`UniFi event: Client disconnected -> ${mac}`);
      scheduleClientOffline(mac);
    }
  }

  async function pollAllStates() {
    const unifiClient = getUnifiClient();
    if (!unifiClient || isPolling) return;
    isPolling = true;
    const snapshot = getSnapshot();

    try {
      // 1. Poll active clients presence
      const activeClients = await unifiClient.getClients();
      snapshot.clients = activeClients;
      // The widgets have something to show from here on, whatever the later
      // steps do (a restricted API key may fail stat/device every time).
      snapshot.polled = true;
      const activeMacs = new Set(activeClients.map((c) => c.mac.toLowerCase()));

      for (const client of activeClients) {
        if (!client.mac) continue;
        await updateClientPresence(client.mac.toLowerCase(), 1);
      }

      // 2. Poll known clients for authoritative internet access (blocked state) & offline presence
      try {
        const knownClients = await unifiClient.getKnownClients();
        for (const kClient of knownClients) {
          if (!kClient.mac) continue;
          const mac = kClient.mac.toLowerCase();

          const accessValue = kClient.blocked ? 0 : 1;
          await publisher.publish(gladys.externalId(`client:${mac}:access`), accessValue);
          await publisher.publish(gladys.externalId(`client-internet:${mac}:access`), accessValue);

          if (!activeMacs.has(mac) && !presenceTimers.has(mac)) {
            setPresence(mac, 0);
            await publisher.publish(presenceId(mac), 0);
          }
        }
      } catch {
        // Ignore if getKnownClients fails
      }

      // 3. Poll Infrastructure devices (Gateways, APs, Switches)
      const devices = await unifiClient.getDevices();
      snapshot.devices = devices;
      for (const dev of devices) {
        if (!dev.mac) continue;
        const mac = dev.mac.toLowerCase();

        // Status for ALL infrastructure devices (U6+, U6 Pro, Switches, Gateways)
        await publisher.publish(
          gladys.externalId(`gateway:${mac}:status`),
          dev.state === 1 ? 1 : 0,
        );

        // PoE port status on Switches/Gateways (on whichever device owns the
        // feature: the hardware device, or the v1.5.2 "Switch PoE" device)
        if (Array.isArray(dev.port_table)) {
          for (const port of dev.port_table) {
            if (port.poe_caps && port.poe_caps > 0 && port.port_idx) {
              const isPoeOn = Boolean(port.poe_mode && port.poe_mode !== 'off');
              await publisher.publish(
                gladys.externalId(`poe:${mac}:${port.port_idx}:power`),
                isPoeOn ? 1 : 0,
              );
            }
          }
        }

        if (isGatewayDevice(dev)) {
          const rxRate =
            dev.stat?.gw?.wan_rx_bytes_r ??
            dev.stat?.wan_rx_bytes_r ??
            dev.uplink?.rx_bytes_r ??
            dev.uplink?.rx_rate ??
            dev.wan1?.rx_bytes_r ??
            0;
          const txRate =
            dev.stat?.gw?.wan_tx_bytes_r ??
            dev.stat?.wan_tx_bytes_r ??
            dev.uplink?.tx_bytes_r ??
            dev.uplink?.tx_rate ??
            dev.wan1?.tx_bytes_r ??
            0;

          const rxSpeedMbps = Math.round((rxRate * 8) / 1000000);
          const txSpeedMbps = Math.round((txRate * 8) / 1000000);

          await publisher.publish(gladys.externalId(`gateway:${mac}:wan-down`), rxSpeedMbps);
          await publisher.publish(gladys.externalId(`gateway:${mac}:wan-up`), txSpeedMbps);
        }
      }

      // 4. Poll Wi-Fi SSID Networks state
      try {
        const wlans = await unifiClient.getWlans();
        snapshot.wlans = wlans;
        for (const wlan of wlans) {
          if (!wlan._id && !wlan.name) continue;
          const wlanId = String(wlan._id || wlan.name);
          const isEnabled = wlan.enabled !== false;
          await publisher.publish(gladys.externalId(`wifi:${wlanId}:state`), isEnabled ? 1 : 0);
        }
      } catch {
        // Ignore if getWlans fails
      }

      // 5. The WireGuard server(s) of the gateway: state, connected clients,
      // and a scene event per client that comes or goes (none at the first
      // reading: what was the state before?).
      try {
        const networks = (await unifiClient.getNetworks()).filter(isWireGuardServer);
        snapshot.vpns = networks;
        await pollVpn(networks, activeClients);
      } catch (err) {
        logger.debug('UniFi getNetworks failed:', err.message);
      }

      // 6. Subsystem health (Internet state of the network widget)
      try {
        const health = await unifiClient.getHealth();
        snapshot.health = Array.isArray(health?.data) ? health.data : [];
      } catch {
        // Ignore if getHealth fails
      }
      if (pollFailing) {
        pollFailing = false;
        logger.info('Polling UniFi state works again.');
      }
    } catch (err) {
      if (pollFailing) {
        logger.debug('Polling UniFi state error (still failing):', err.message);
      } else {
        pollFailing = true;
        logger.warn('Polling UniFi state error:', err.message);
      }
    } finally {
      isPolling = false;
    }
  }

  async function pollVpn(networks, activeClients) {
    const summary = [];
    for (const network of networks) {
      const id = String(network._id);
      const enabled = network.enabled !== false;
      const clients = enabled ? vpnClientsOf(network, activeClients) : [];
      await publisher.publish(gladys.externalId(`vpn:${id}:state`), enabled ? 1 : 0);
      await publisher.publish(gladys.externalId(`vpn:${id}:clients`), clients.length);
      const now = new Map(clients.map((client) => [vpnClientKey(client), client]));
      const before = vpnClients.get(id);
      if (before) {
        const device = gladys.externalIds('vpn', id).device;
        const data = (client) => ({
          vpn_device: device,
          vpn: String(network.name || 'WireGuard'),
          client: vpnClientName(client),
        });
        for (const [key, client] of now) {
          if (!before.has(key)) {
            logger.debug(`VPN client connected: ${vpnClientName(client)}`);
            await fire(TRIGGERS.VPN_CONNECTED, data(client));
          }
        }
        for (const [key, client] of before) {
          if (!now.has(key)) {
            logger.debug(`VPN client disconnected: ${vpnClientName(client)}`);
            await fire(TRIGGERS.VPN_DISCONNECTED, data(client));
          }
        }
      }
      vpnClients.set(id, now);
      summary.push([id, enabled, [...now.keys()].sort()]);
    }
    const signature = JSON.stringify(summary);
    if (signature !== vpnSignature) {
      vpnSignature = signature;
      onVpnChanged();
    }
  }

  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.debug(`Scene event ${key} refused: ${err.message}`);
    }
  }

  /** Poll every `intervalMs` from the container's own timer (restarts it). */
  function start(intervalMs = POLL_INTERVAL_MS) {
    stop();
    pollTimer = setInterval(() => {
      pollAllStates().catch((err) => logger.debug('Poll failed:', err.message));
    }, intervalMs);
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /**
   * `onPoll` of the core, kept as a fallback should a future Gladys poll the
   * devices: nothing to do while the internal timer runs (one poll covers
   * every device, so N devices polled by the core would mean N polls).
   */
  async function onCorePoll() {
    if (pollTimer) {
      return;
    }
    await pollAllStates();
  }

  function clearTimers() {
    stop();
    for (const timer of presenceTimers.values()) {
      clearTimeout(timer);
    }
    presenceTimers.clear();
  }

  return {
    knownPresenceStates,
    updateClientPresence,
    scheduleClientOffline,
    handleEvent,
    pollAllStates,
    start,
    stop,
    onCorePoll,
    isRunning: () => pollTimer !== null,
    clearTimers,
  };
}
