// -----------------------------------------------------------------------------
// UniFi Network Integration for Gladys Assistant
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { UniFiClient } from './src/api/unifi-client.js';
import { UniFiWebSocket } from './src/api/unifi-ws.js';
import { buildDiscoveredDevices, handleTestConnectionAction } from './src/devices/index.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
let unifiClient = null;
let unifiWs = null;
let presenceTimers = new Map();
let knownPresenceStates = new Map();

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

  knownPresenceStates.set(mac, state);
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
    knownPresenceStates.set(mac, 0);
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
  await gladys.publishDiscoveredDevices(devices);
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
    const parts = extId.split(':');
    const isAccess = extId.endsWith(':access');
    const macIndex = parts.indexOf(isAccess ? 'client-internet' : 'client') + 1;
    const mac = parts[macIndex];

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
      await gladys.publishState(feature.external_id, value);
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to change internet access state for MAC ${mac}:`,
        err?.response?.data || err.message,
      );
      throw err;
    }
    return;
  }

  // 2. Wi-Fi SSID Switch (unifi:wifi:<wlanId>:state)
  if (extId.includes(':wifi:') && extId.endsWith(':state')) {
    const parts = extId.split(':');
    const wlanId = parts[parts.indexOf('wifi') + 1];
    try {
      logger.info(`[UniFi Action] Setting Wi-Fi WLAN ${wlanId} state = ${value === 1 ? 'enabled' : 'disabled'}`);
      const res = await unifiClient.setWlanState(wlanId, value === 1);
      logger.info(`[UniFi Action Response] Wi-Fi WLAN ${wlanId}:`, res);
      await gladys.publishState(feature.external_id, value);
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to set Wi-Fi WLAN ${wlanId} state:`,
        err?.response?.data || err.message,
      );
      throw err;
    }
    return;
  }

  // 3. PoE Port Switch (unifi:poe:<deviceMac>:<portIdx>:power)
  if (extId.includes(':poe:') && extId.endsWith(':power')) {
    const parts = extId.split(':');
    const deviceMac = parts[parts.indexOf('poe') + 1];
    const portIdx = parseInt(parts[parts.indexOf('poe') + 2], 10);
    const mode = value === 1 ? 'auto' : 'off';
    try {
      logger.info(`[UniFi Action] Setting PoE port ${portIdx} on switch ${deviceMac} = ${mode}`);
      const res = await unifiClient.setPortPoeMode(deviceMac, [{ port_idx: portIdx, poe_mode: mode }]);
      logger.info(`[UniFi Action Response] PoE port ${portIdx} on ${deviceMac}:`, res);
      await gladys.publishState(feature.external_id, value);
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to set PoE mode on ${deviceMac} port ${portIdx}:`,
        err?.response?.data || err.message,
      );
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
        const internetFeatureId = gladys.externalId(`client-internet:${mac}:access`);
        await gladys.publishState(internetFeatureId, isBlocked ? 0 : 1).catch(() => {});

        if (!activeMacs.has(mac)) {
          if (!presenceTimers.has(mac)) {
            knownPresenceStates.set(mac, 0);
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
    for (const dev of devices) {
      if (!dev.mac) continue;
      const mac = dev.mac.toLowerCase();
      const isGateway =
        dev.is_gateway ||
        dev.type === 'ugw' ||
        dev.type === 'udm' ||
        dev.type === 'ucg' ||
        dev.type === 'gateway' ||
        dev.type === 'gw' ||
        (dev.model && /ucg|udm|ugw|usg|uxg|gateway/i.test(dev.model));

      // Publish Status for ALL infrastructure devices (U6+, U6 Pro, Switches, Gateways)
      const statusFeatureId = gladys.externalId(`gateway:${mac}:status`);
      await gladys.publishState(statusFeatureId, dev.state === 1 ? 1 : 0).catch(() => {});

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
  } catch (err) {
    logger.warn('Polling UniFi state error:', err.message);
  } finally {
    isPolling = false;
  }
}

gladys.onPoll(async () => {
  await pollAllStates();
});

// --- Manifest Action (Test Connection) ---------------------------------------
gladys.onAction('test_connection', async () => {
  return await handleTestConnectionAction(gladys, unifiClient);
});

// --- Configuration Updates ---------------------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await initUniFiConnection();
  const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
  await gladys.publishDiscoveredDevices(devices);
  await pollAllStates();
});

// --- Lifecycle Connection ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await initUniFiConnection();
    const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
    await gladys.publishDiscoveredDevices(devices);
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
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting Gladys UniFi Integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed:', err);
  process.exit(1);
});
