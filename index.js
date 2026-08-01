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

  // 1. Internet Block switch (unifi:client:<mac>:block)
  if (extId.includes(':client:') && extId.endsWith(':block')) {
    const parts = extId.split(':');
    const mac = parts[parts.indexOf('client') + 1];
    if (value === 1) {
      await unifiClient.blockClient(mac);
    } else {
      await unifiClient.unblockClient(mac);
    }
    await gladys.publishState(feature.external_id, value);
    return;
  }

  // 2. Wi-Fi SSID Switch (unifi:wifi:<wlanId>:state)
  if (extId.includes(':wifi:') && extId.endsWith(':state')) {
    const parts = extId.split(':');
    const wlanId = parts[parts.indexOf('wifi') + 1];
    await unifiClient.setWlanState(wlanId, value === 1);
    await gladys.publishState(feature.external_id, value);
    return;
  }

  // 3. PoE Port Switch (unifi:poe:<deviceMac>:<portIdx>:power)
  if (extId.includes(':poe:') && extId.endsWith(':power')) {
    const parts = extId.split(':');
    const deviceMac = parts[parts.indexOf('poe') + 1];
    const portIdx = parseInt(parts[parts.indexOf('poe') + 2], 10);

    const mode = value === 1 ? 'auto' : 'off';
    await unifiClient.setPortPoeMode(deviceMac, [{ port_idx: portIdx, poe_mode: mode }]);
    await gladys.publishState(feature.external_id, value);
    return;
  }

  throw new Error(`Unsupported feature command for ${feature.external_id}`);
});

// --- Periodic & Initial Polling ------------------------------------------------
async function pollAllStates() {
  if (!unifiClient) return;

  try {
    // 1. Poll active clients presence
    const activeClients = await unifiClient.getClients();
    const activeMacs = new Set(activeClients.map((c) => c.mac.toLowerCase()));

    for (const client of activeClients) {
      if (!client.mac) continue;
      const mac = client.mac.toLowerCase();
      await updateClientPresence(mac, 1);
    }

    // 2. Poll known clients to publish 0 for inactive ones
    try {
      const knownClients = await unifiClient.getKnownClients();
      for (const kClient of knownClients) {
        if (!kClient.mac) continue;
        const mac = kClient.mac.toLowerCase();
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
    logger.debug('Polling UniFi state error:', err.message);
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
  if (unifiWs) unifiWs.close();
});

// --- Graceful Shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
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
