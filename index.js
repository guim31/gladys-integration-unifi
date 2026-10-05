// -----------------------------------------------------------------------------
// UniFi Network Integration for Gladys Assistant
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { UniFiClient } from './src/api/unifi-client.js';
import { UniFiWebSocket } from './src/api/unifi-ws.js';
import {
  buildDiscoveredDevices,
  handleTestConnectionAction,
  publishDiscoveredDevicesInChunks,
} from './src/devices/index.js';
import {
  WIDGET,
  buildNetworkContent,
  buildPresenceContent,
  buildWifiContent,
  emptySnapshot,
  isGatewayDevice,
} from './src/widgets.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
let unifiClient = null;
let unifiWs = null;
let presenceTimers = new Map();
let knownPresenceStates = new Map();
// The last poll, kept for the dashboard widgets: rendering one never calls
// the controller.
let snapshot = emptySnapshot();

// Gladys drops a second widget refresh within 10 s: a nudge sent while the
// window is open is sent again at its end, so the dashboard never misses the
// last change.
const WIDGET_NUDGE_MS = 10 * 1000;
const widgetNudges = new Map();

/**
 * Ask the dashboards to re-pull a widget now, or at the end of the current
 * 10 s window (never fatal).
 */
function nudgeWidget(key) {
  const entry = widgetNudges.get(key) || { last: 0, timer: null };
  widgetNudges.set(key, entry);
  if (entry.timer) {
    return;
  }
  const send = () => {
    entry.timer = null;
    entry.last = Date.now();
    try {
      gladys.requestWidgetRefresh(key);
    } catch (err) {
      logger.debug(`Widget refresh (${key}) failed: ${err.message}`);
    }
  };
  const wait = entry.last + WIDGET_NUDGE_MS - Date.now();
  if (wait <= 0) {
    send();
  } else {
    entry.timer = setTimeout(send, wait);
    entry.timer.unref?.();
  }
}

/**
 * Remember the presence of a client; a change nudges the presence widget.
 */
function setPresence(mac, state) {
  const changed = knownPresenceStates.get(mac) !== state;
  knownPresenceStates.set(mac, state);
  if (changed) {
    nudgeWidget(WIDGET.PRESENCE);
  }
}

/**
 * Initialize or re-initialize UniFi connection clients.
 */
async function initUniFiConnection() {
  if (unifiWs) {
    unifiWs.close();
    unifiWs = null;
  }

  unifiClient = new UniFiClient(config);

  try {
    if (config.unifi_auth_type === 'credentials') {
      await unifiClient.login();
    }

    // Start WebSocket for real-time presence/network events
    unifiWs = new UniFiWebSocket(config, unifiClient);
    unifiWs.on('event', (event) => handleUniFiEvent(event));
    unifiWs.connect();

    await gladys.setConnectionStatus(true);
    logger.info('UniFi integration connected and active.');
    startInternalPolling();
  } catch (err) {
    logger.error('Failed to initialize UniFi connection:', err.message);
    await gladys
      .setConnectionStatus(false, {
        en: `Connection failed: ${err.message}`,
        fr: `Échec de connexion : ${err.message}`,
      })
      .catch(() => {});
  }
}

/**
 * Handle real-time WebSocket events from UniFi.
 */
async function handleUniFiEvent(event) {
  if (!event || !event.key) return;

  // EVT_WU_Connected (Wireless client connected), EVT_LU_Connected (LAN connected)
  if (event.key.includes('Connected') && event.user) {
    const mac = event.user.toLowerCase();
    logger.info(`UniFi event: Client connected -> ${mac}`);
    updateClientPresence(mac, 1);
  }
  // EVT_WU_Disconnected, EVT_LU_Disconnected
  else if (event.key.includes('Disconnected') && event.user) {
    const mac = event.user.toLowerCase();
    logger.info(`UniFi event: Client disconnected -> ${mac}`);
    scheduleClientOffline(mac);
  }
}

/**
 * Update client presence with immediate 1 (online).
 */
async function updateClientPresence(mac, state) {
  if (presenceTimers.has(mac)) {
    clearTimeout(presenceTimers.get(mac));
    presenceTimers.delete(mac);
  }

  setPresence(mac, state);
  const featureId = gladys.externalId(`client:${mac.toLowerCase()}:presence`);
  await gladys.publishState(featureId, state).catch(() => {});
}

/**
 * Schedule client offline (0) with configured hysteresis delay.
 */
function scheduleClientOffline(mac) {
  if (presenceTimers.has(mac)) {
    clearTimeout(presenceTimers.get(mac));
  }

  const delayMs = (config.presence_offline_delay || 120) * 1000;
  const timer = setTimeout(async () => {
    logger.info(`Presence offline delay elapsed for ${mac}. Setting presence to 0.`);
    setPresence(mac, 0);
    const featureId = gladys.externalId(`client:${mac.toLowerCase()}:presence`);
    await gladys.publishState(featureId, 0).catch(() => {});
    presenceTimers.delete(mac);
  }, delayMs);

  presenceTimers.set(mac, timer);
}

// --- Discovery ---------------------------------------------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing UniFi discovered devices');
  const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
  await publishDiscoveredDevicesInChunks(gladys, devices);
});

// --- Command Execution -------------------------------------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  if (!unifiClient) {
    throw new Error('UniFi client is not connected.');
  }

  const extId = feature.external_id;

  // 1. Internet Access switch (unifi:client-internet:<mac>:access OR unifi:client:<mac>:block)
  if (
    (extId.includes(':client-internet:') && extId.endsWith(':access')) ||
    (extId.includes(':client:') && extId.endsWith(':block'))
  ) {
    const isAccess = extId.endsWith(':access');
    const tag = isAccess ? ':client-internet:' : ':client:';
    const suffix = isAccess ? ':access' : ':block';
    const mac = extId.slice(extId.indexOf(tag) + tag.length, extId.lastIndexOf(suffix));

    // Optimistic UI state update so Gladys UI toggle moves instantly without lag
    await gladys.publishState(feature.external_id, value).catch(() => {});

    try {
      if (isAccess) {
        // 1 = Access Authorized (Unblocked), 0 = Access Cut (Blocked)
        if (value === 1) {
          logger.info(`[UniFi Action] Unblocking internet access for MAC ${mac}`);
          const res = await unifiClient.unblockClient(mac);
          logger.info(`[UniFi Action Response] Unblock MAC ${mac}:`, res);
        } else {
          logger.info(`[UniFi Action] Blocking internet access for MAC ${mac}`);
          const res = await unifiClient.blockClient(mac);
          logger.info(`[UniFi Action Response] Block MAC ${mac}:`, res);
        }
      } else {
        // Legacy block switch: 1 = Blocked, 0 = Unblocked
        if (value === 1) {
          logger.info(`[UniFi Action] Blocking internet access (legacy) for MAC ${mac}`);
          const res = await unifiClient.blockClient(mac);
          logger.info(`[UniFi Action Response] Block MAC ${mac}:`, res);
        } else {
          logger.info(`[UniFi Action] Unblocking internet access (legacy) for MAC ${mac}`);
          const res = await unifiClient.unblockClient(mac);
          logger.info(`[UniFi Action Response] Unblock MAC ${mac}:`, res);
        }
      }
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to change internet access state for MAC ${mac}:`,
        err?.response?.data || err.message,
      );
      // Rollback UI toggle if operation failed
      await gladys.publishState(feature.external_id, value === 1 ? 0 : 1).catch(() => {});
      throw err;
    }
    return;
  }

  // 2. Wi-Fi SSID Switch (unifi:wifi:<wlanId>:state)
  if (extId.includes(':wifi:') && extId.endsWith(':state')) {
    const tag = ':wifi:';
    const suffix = ':state';
    const wlanId = extId.slice(extId.indexOf(tag) + tag.length, extId.lastIndexOf(suffix));

    // Optimistic UI state update so Gladys UI toggle moves instantly without lag
    await gladys.publishState(feature.external_id, value).catch(() => {});

    try {
      logger.info(
        `[UniFi Action] Setting Wi-Fi WLAN ${wlanId} state = ${value === 1 ? 'enabled' : 'disabled'}`,
      );
      const res = await unifiClient.setWlanState(wlanId, value === 1);
      logger.info(`[UniFi Action Response] Wi-Fi WLAN ${wlanId}:`, res);
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to set Wi-Fi WLAN ${wlanId} state:`,
        err?.response?.data || err.message,
      );
      // Rollback UI toggle if operation failed
      await gladys.publishState(feature.external_id, value === 1 ? 0 : 1).catch(() => {});
      throw err;
    }
    return;
  }

  // 3. PoE Port Switch (unifi:poe:<deviceMac>:<portIdx>:power)
  if (extId.includes(':poe:') && extId.endsWith(':power')) {
    const tag = ':poe:';
    const suffix = ':power';
    const middle = extId.slice(extId.indexOf(tag) + tag.length, extId.lastIndexOf(suffix));
    const lastColon = middle.lastIndexOf(':');
    const deviceMac = middle.slice(0, lastColon);
    const portIdx = parseInt(middle.slice(lastColon + 1), 10);
    const mode = value === 1 ? 'auto' : 'off';

    // Optimistic UI state update so Gladys UI toggle moves instantly without lag
    await gladys.publishState(feature.external_id, value).catch(() => {});

    try {
      logger.info(`[UniFi Action] Setting PoE port ${portIdx} on switch ${deviceMac} = ${mode}`);
      const res = await unifiClient.setPortPoeMode(deviceMac, [
        { port_idx: portIdx, poe_mode: mode },
      ]);
      logger.info(`[UniFi Action Response] PoE port ${portIdx} on ${deviceMac}:`, res);
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to set PoE mode on ${deviceMac} port ${portIdx}:`,
        err?.response?.data || err.message,
      );
      // Rollback UI toggle if operation failed
      await gladys.publishState(feature.external_id, value === 1 ? 0 : 1).catch(() => {});
      throw err;
    }
    return;
  }

  throw new Error(`Unsupported feature command for ${feature.external_id}`);
});

let pollIntervalTimer = null;
let isPolling = false;

function startInternalPolling() {
  if (pollIntervalTimer) clearInterval(pollIntervalTimer);
  logger.info('Starting internal UniFi polling timer (every 30 seconds)...');
  pollIntervalTimer = setInterval(async () => {
    await pollAllStates();
  }, 30000);
}

// --- Periodic & Initial Polling ------------------------------------------------
async function pollAllStates() {
  if (!unifiClient || isPolling) return;
  isPolling = true;

  try {
    // 1. Poll active clients presence
    const activeClients = await unifiClient.getClients();
    snapshot.clients = activeClients;
    const activeMacs = new Set(activeClients.map((c) => c.mac.toLowerCase()));

    for (const client of activeClients) {
      if (!client.mac) continue;
      const mac = client.mac.toLowerCase();
      await updateClientPresence(mac, 1);
    }

    // 2. Poll known clients for authoritative internet access (blocked state) & offline presence
    try {
      const knownClients = await unifiClient.getKnownClients();
      for (const kClient of knownClients) {
        if (!kClient.mac) continue;
        const mac = kClient.mac.toLowerCase();

        const isBlocked = Boolean(kClient.blocked);
        const accessValue = isBlocked ? 0 : 1;
        const internetFeatureId = gladys.externalId(`client:${mac}:access`);
        const legacyInternetFeatureId = gladys.externalId(`client-internet:${mac}:access`);
        await gladys.publishState(internetFeatureId, accessValue).catch(() => {});
        await gladys.publishState(legacyInternetFeatureId, accessValue).catch(() => {});

        if (!activeMacs.has(mac)) {
          if (!presenceTimers.has(mac)) {
            setPresence(mac, 0);
            const featureId = gladys.externalId(`client:${mac}:presence`);
            await gladys.publishState(featureId, 0).catch(() => {});
          }
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
      const isGateway = isGatewayDevice(dev);

      // Publish Status for ALL infrastructure devices (U6+, U6 Pro, Switches, Gateways)
      const statusFeatureId = gladys.externalId(`gateway:${mac}:status`);
      await gladys.publishState(statusFeatureId, dev.state === 1 ? 1 : 0).catch(() => {});

      // Publish PoE port status on Switches/Gateways
      if (Array.isArray(dev.port_table)) {
        for (const port of dev.port_table) {
          if (port.poe_caps && port.poe_caps > 0 && port.port_idx) {
            const portIdx = port.port_idx;
            const poeFeatureId = gladys.externalId(`poe:${mac}:${portIdx}:power`);
            const isPoeOn = Boolean(port.poe_mode && port.poe_mode !== 'off');
            await gladys.publishState(poeFeatureId, isPoeOn ? 1 : 0).catch(() => {});
          }
        }
      }

      if (isGateway) {
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

        await gladys
          .publishState(gladys.externalId(`gateway:${mac}:wan-down`), rxSpeedMbps)
          .catch(() => {});
        await gladys
          .publishState(gladys.externalId(`gateway:${mac}:wan-up`), txSpeedMbps)
          .catch(() => {});
      }
    }

    // 4. Poll Wi-Fi SSID Networks state
    try {
      const wlans = await unifiClient.getWlans();
      snapshot.wlans = wlans;
      for (const wlan of wlans) {
        if (!wlan._id && !wlan.name) continue;
        const wlanId = String(wlan._id || wlan.name);
        const featureId = gladys.externalId(`wifi:${wlanId}:state`);
        const isEnabled = wlan.enabled !== false;
        await gladys.publishState(featureId, isEnabled ? 1 : 0).catch(() => {});
      }
    } catch {
      // Ignore if getWlans fails
    }

    // 5. Subsystem health (Internet state of the network widget)
    try {
      const health = await unifiClient.getHealth();
      snapshot.health = Array.isArray(health?.data) ? health.data : [];
    } catch {
      // Ignore if getHealth fails
    }

    snapshot.polled = true;
  } catch (err) {
    logger.warn('Polling UniFi state error:', err.message);
  } finally {
    isPolling = false;
  }
}

gladys.onPoll(async () => {
  await pollAllStates();
});

// --- Dashboard widgets (Gladys 5.1+) -----------------------------------------
const externalIds = (type, platformId) => gladys.externalIds(type, platformId);

/** The devices the user created in Gladys ([] when the host does not answer). */
async function gladysDevices() {
  try {
    return await gladys.getDevices();
  } catch (err) {
    logger.warn('getDevices failed:', err.message);
    return [];
  }
}

gladys.onWidgetGet(WIDGET.NETWORK, async ({ settings }) => {
  return buildNetworkContent({ snapshot, settings, externalIds });
});

gladys.onWidgetGet(WIDGET.PRESENCE, async ({ settings }) => {
  return buildPresenceContent({
    gladysDevices: await gladysDevices(),
    presence: knownPresenceStates,
    settings,
  });
});

gladys.onWidgetGet(WIDGET.WIFI, async ({ settings }) => {
  return buildWifiContent({ snapshot, settings, externalIds });
});

// --- Manifest Action (Test Connection) ---------------------------------------
gladys.onAction('test_connection', async () => {
  return await handleTestConnectionAction(gladys, unifiClient);
});

// --- Configuration Updates ---------------------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  // Another console or site: the widgets must not show the previous one.
  snapshot = emptySnapshot();
  await initUniFiConnection();
  const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
  await publishDiscoveredDevicesInChunks(gladys, devices);
  await pollAllStates();
});

// --- Lifecycle Connection ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await initUniFiConnection();
    const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
    await publishDiscoveredDevicesInChunks(gladys, devices);
    await pollAllStates();
  } catch (err) {
    logger.error('Post-connection initialization failed:', err);
  }
});

gladys.on('disconnected', () => {
  if (pollIntervalTimer) clearInterval(pollIntervalTimer);
  if (unifiWs) unifiWs.close();
});

// --- Graceful Shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  if (pollIntervalTimer) clearInterval(pollIntervalTimer);
  if (unifiWs) unifiWs.close();
  for (const timer of presenceTimers.values()) {
    clearTimeout(timer);
  }
  presenceTimers.clear();
  for (const entry of widgetNudges.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  widgetNudges.clear();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting Gladys UniFi Integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed:', err);
  process.exit(1);
});
