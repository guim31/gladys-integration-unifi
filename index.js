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
import { legacyPoeSwitchBlueprint } from './src/devices/poePort.js';
import { createStatePublisher } from './src/statePublisher.js';
import { createPoller, POLL_INTERVAL_MS } from './src/poller.js';
import { MESSAGES, VPN_READ_ONLY } from './src/messages.js';
import {
  WIDGET,
  buildNetworkContent,
  buildPresenceContent,
  buildWifiContent,
  buildVpnContent,
  emptySnapshot,
} from './src/widgets.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
let unifiClient = null;
let unifiWs = null;
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

// Every state goes through the publisher: only the features of devices
// created in Gladys, only the changes (see src/statePublisher.js).
const publisher = createStatePublisher(gladys);
const poller = createPoller({
  gladys,
  publisher,
  getUnifiClient: () => unifiClient,
  getConfig: () => config,
  getSnapshot: () => snapshot,
  onPresenceChanged: () => nudgeWidget(WIDGET.PRESENCE),
  onVpnChanged: () => nudgeWidget(WIDGET.VPN),
});
const { pollAllStates } = poller;

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
    unifiWs.on('event', (event) => poller.handleEvent(event));
    unifiWs.connect();

    await gladys.setConnectionStatus(true);
    logger.info('UniFi integration connected and active.');
    startInternalPolling();
  } catch (err) {
    logger.error('Failed to initialize UniFi connection:', err.message);
    await gladys.setConnectionStatus(false, MESSAGES.connectionFailed(err.message)).catch(() => {});
  }
}

// --- Discovery ---------------------------------------------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing UniFi discovered devices');
  const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
  await publishDiscoveredDevicesInChunks(gladys, devices);
});

// A device just created (or updated) in Gladys: its states are published
// right away, whatever was published before (the SDK has already added it to
// `gladys.devices`).
async function publishDeviceStates(device) {
  publisher.forget((device?.features || []).map((f) => f.external_id));
  await pollAllStates();
}
gladys.onDeviceCreated(publishDeviceStates);
gladys.onDeviceUpdated(publishDeviceStates);

// The user deleted the v1.5.2 "Switch PoE" device of a hardware: its PoE
// ports go back on the hardware device, so publish the discovery again.
gladys.onDeviceDeleted(async (device) => {
  if (!legacyPoeSwitchBlueprint.macOf(gladys, device?.external_id)) {
    return;
  }
  logger.info(`Legacy PoE switch ${device.external_id} deleted -> publishing UniFi discovery`);
  const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
  await publishDiscoveredDevicesInChunks(gladys, devices);
});

// --- Command Execution -------------------------------------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.debug(`onSetValue <- ${feature.external_id} = ${value}`);
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
    await publisher.publish(feature.external_id, value, { force: true });

    try {
      if (isAccess) {
        // 1 = Access Authorized (Unblocked), 0 = Access Cut (Blocked)
        if (value === 1) {
          logger.info(`[UniFi Action] Unblocking internet access for MAC ${mac}`);
          const res = await unifiClient.unblockClient(mac);
          logger.debug(`[UniFi Action Response] Unblock MAC ${mac}:`, res);
        } else {
          logger.info(`[UniFi Action] Blocking internet access for MAC ${mac}`);
          const res = await unifiClient.blockClient(mac);
          logger.debug(`[UniFi Action Response] Block MAC ${mac}:`, res);
        }
      } else {
        // Legacy block switch: 1 = Blocked, 0 = Unblocked
        if (value === 1) {
          logger.info(`[UniFi Action] Blocking internet access (legacy) for MAC ${mac}`);
          const res = await unifiClient.blockClient(mac);
          logger.debug(`[UniFi Action Response] Block MAC ${mac}:`, res);
        } else {
          logger.info(`[UniFi Action] Unblocking internet access (legacy) for MAC ${mac}`);
          const res = await unifiClient.unblockClient(mac);
          logger.debug(`[UniFi Action Response] Unblock MAC ${mac}:`, res);
        }
      }
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to change internet access state for MAC ${mac}:`,
        err?.response?.data || err.message,
      );
      // Rollback UI toggle if operation failed
      await publisher.publish(feature.external_id, value === 1 ? 0 : 1, { force: true });
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
    await publisher.publish(feature.external_id, value, { force: true });

    try {
      logger.info(
        `[UniFi Action] Setting Wi-Fi WLAN ${wlanId} state = ${value === 1 ? 'enabled' : 'disabled'}`,
      );
      const res = await unifiClient.setWlanState(wlanId, value === 1);
      logger.debug(`[UniFi Action Response] Wi-Fi WLAN ${wlanId}:`, res);
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to set Wi-Fi WLAN ${wlanId} state:`,
        err?.response?.data || err.message,
      );
      // Rollback UI toggle if operation failed
      await publisher.publish(feature.external_id, value === 1 ? 0 : 1, { force: true });
      throw err;
    }
    return;
  }

  // 3. WireGuard server (unifi:vpn:<network _id>:state), only when allowed
  if (extId.includes(':vpn:') && extId.endsWith(':state')) {
    if (!config.allow_vpn_control) {
      throw new Error(VPN_READ_ONLY);
    }
    const tag = ':vpn:';
    const networkId = extId.slice(extId.indexOf(tag) + tag.length, extId.lastIndexOf(':state'));
    const network = (await unifiClient.getNetworks()).find((n) => String(n._id) === networkId);
    if (!network) {
      throw new Error(`Unknown VPN network ${networkId}`);
    }
    await publisher.publish(feature.external_id, value, { force: true });
    try {
      logger.info(
        `[UniFi Action] Setting VPN ${network.name || networkId} = ${value === 1 ? 'enabled' : 'disabled'}`,
      );
      // The answer may echo the network (its private key): never logged.
      await unifiClient.setNetworkEnabled(network, value === 1);
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to set VPN ${networkId} state:`,
        err?.response?.status ?? err.message,
      );
      await publisher.publish(feature.external_id, value === 1 ? 0 : 1, { force: true });
      throw err;
    }
    nudgeWidget(WIDGET.VPN);
    return;
  }

  // 4. PoE Port Switch (unifi:poe:<deviceMac>:<portIdx>:power)
  if (extId.includes(':poe:') && extId.endsWith(':power')) {
    const tag = ':poe:';
    const suffix = ':power';
    const middle = extId.slice(extId.indexOf(tag) + tag.length, extId.lastIndexOf(suffix));
    const lastColon = middle.lastIndexOf(':');
    const deviceMac = middle.slice(0, lastColon);
    const portIdx = parseInt(middle.slice(lastColon + 1), 10);
    const mode = value === 1 ? 'auto' : 'off';

    // Optimistic UI state update so Gladys UI toggle moves instantly without lag
    await publisher.publish(feature.external_id, value, { force: true });

    try {
      logger.info(`[UniFi Action] Setting PoE port ${portIdx} on switch ${deviceMac} = ${mode}`);
      const res = await unifiClient.setPortPoeMode(deviceMac, [
        { port_idx: portIdx, poe_mode: mode },
      ]);
      logger.debug(`[UniFi Action Response] PoE port ${portIdx} on ${deviceMac}:`, res);
    } catch (err) {
      logger.error(
        `[UniFi Action Error] Failed to set PoE mode on ${deviceMac} port ${portIdx}:`,
        err?.response?.data || err.message,
      );
      // Rollback UI toggle if operation failed
      await publisher.publish(feature.external_id, value === 1 ? 0 : 1, { force: true });
      throw err;
    }
    return;
  }

  throw new Error(`Unsupported feature command for ${feature.external_id}`);
});

// The container polls on its own timer (Gladys 5.2.0 never polls these
// devices, see src/poller.js); `onPoll` is only a fallback.
function startInternalPolling() {
  logger.info(
    `Starting internal UniFi polling timer (every ${POLL_INTERVAL_MS / 1000} seconds)...`,
  );
  poller.start(POLL_INTERVAL_MS);
}

gladys.onPoll(async () => {
  await poller.onCorePoll();
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
    presence: poller.knownPresenceStates,
    settings,
  });
});

gladys.onWidgetGet(WIDGET.WIFI, async ({ settings }) => {
  return buildWifiContent({ snapshot, settings, externalIds });
});

gladys.onWidgetGet(WIDGET.VPN, async ({ settings }) => {
  return buildVpnContent({
    snapshot,
    settings,
    externalIds,
    allowControl: config.allow_vpn_control,
  });
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
  publisher.reset();
  await initUniFiConnection();
  const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
  await publishDiscoveredDevicesInChunks(gladys, devices);
  await pollAllStates();
});

// --- Lifecycle Connection ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    // Gladys may have restarted: publish every state again.
    publisher.reset();
    await initUniFiConnection();
    const devices = await buildDiscoveredDevices(gladys, config, unifiClient);
    await publishDiscoveredDevicesInChunks(gladys, devices);
    await pollAllStates();
  } catch (err) {
    // The message only: an HTTP error object carries the request headers
    // (API key, session cookie).
    logger.error('Post-connection initialization failed:', err.message);
  }
});

gladys.on('disconnected', () => {
  poller.stop();
  if (unifiWs) unifiWs.close();
});

// --- Graceful Shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  if (unifiWs) unifiWs.close();
  poller.clearTimers();
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
