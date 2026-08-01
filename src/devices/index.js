// -----------------------------------------------------------------------------
// UniFi Device Registry & Discovery Engine
// -----------------------------------------------------------------------------

import { logger } from '@gladysassistant/integration-sdk';
import { gatewayBlueprint } from './gateway.js';
import { clientBlueprint } from './clientPresence.js';
import { poePortBlueprint } from './poePort.js';
import { wifiNetworkBlueprint } from './wifiNetwork.js';

export const DEVICE_BLUEPRINTS = [
  gatewayBlueprint,
  clientBlueprint,
  poePortBlueprint,
  wifiNetworkBlueprint,
];

/**
 * Perform dynamic scan of all UniFi infrastructure devices, clients, PoE ports, and WLANs.
 */
export async function buildDiscoveredDevices(gladys, config, unifiClient) {
  if (!unifiClient) {
    logger.warn('UniFi client not connected, skipping device discovery.');
    return [];
  }

  // Ensure client is logged in before scan
  if (!unifiClient.isLoggedIn) {
    try {
      await unifiClient.login();
    } catch (err) {
      logger.error('Failed to log in during UniFi discovery scan:', err.message);
      return [];
    }
  }

  const discovered = [];
  const addedMacs = new Set();

  try {
    // 1. Infrastructure Devices (Gateways, Switches & Access Points)
    if (config?.discover_infrastructure !== false) {
      const devices = await unifiClient.getDevices();
      logger.info(`UniFi getDevices returned ${devices.length} infrastructure device(s).`);
      for (const dev of devices) {
        if (dev.mac) {
          discovered.push(gatewayBlueprint.buildDevice(gladys, dev));
          addedMacs.add(dev.mac.toLowerCase());

          // PoE ports on Switches/Gateways
          if (Array.isArray(dev.port_table)) {
            for (const port of dev.port_table) {
              if (port.poe_caps && port.poe_caps > 0) {
                discovered.push(poePortBlueprint.buildDevice(gladys, dev, port));
              }
            }
          }
        }
      }
    } else {
      logger.info('Infrastructure discovery is disabled in configuration.');
    }

    // 2. Network Clients (Presence Trackers & Internet Access Switches)
    if (config?.discover_clients !== false) {
      const activeClients = await unifiClient.getClients();
      let knownClients = [];

      if (config?.only_active_clients === false) {
        knownClients = await unifiClient.getKnownClients();
        logger.info(
          `UniFi getClients returned ${activeClients.length} active client(s), getKnownClients returned ${knownClients.length} known client(s).`,
        );
      } else {
        logger.info(
          `UniFi getClients returned ${activeClients.length} active client(s). Known clients skipped (only_active_clients = true).`,
        );
      }

      const allClients = [...activeClients, ...knownClients];
      const connectionType = config?.client_connection_type ?? 'all';
      const allowedSsids = Array.isArray(config?.allowed_ssids) ? config.allowed_ssids : [];

      for (const client of allClients) {
        if (!client.mac || addedMacs.has(client.mac.toLowerCase())) {
          continue;
        }

        // Connection Type filter (Wi-Fi / Wired)
        const isWired = Boolean(client.is_wired);
        if (connectionType === 'wifi_only' && isWired) {
          continue;
        }
        if (connectionType === 'wired_only' && !isWired) {
          continue;
        }

        // SSID filter (for wireless clients)
        if (!isWired && allowedSsids.length > 0) {
          const clientEssid = client.essid ? String(client.essid).trim() : '';
          if (!allowedSsids.includes(clientEssid)) {
            continue;
          }
        }

        addedMacs.add(client.mac.toLowerCase());
        discovered.push(clientBlueprint.buildDevice(gladys, client));
      }
    } else {
      logger.info('Network client discovery is disabled in configuration.');
    }

    // 3. Wi-Fi SSID Networks
    if (config?.discover_infrastructure !== false) {
      const wlans = await unifiClient.getWlans();
      logger.info(`UniFi getWlans returned ${wlans.length} wlan(s).`);
      for (const wlan of wlans) {
        discovered.push(wifiNetworkBlueprint.buildDevice(gladys, wlan));
      }
    }

    logger.info(
      `UniFi Discovery scan completed successfully: ${discovered.length} device(s) found.`,
    );
  } catch (err) {
    logger.error('Error during UniFi discovery scan:', err.message, err);
  }

  return discovered;
}

/**
 * Safely publish discovered devices to Gladys in batches to avoid API payload limits (max 200 devices per call).
 */
export async function publishDiscoveredDevicesInChunks(gladys, devices, chunkSize = 100) {
  if (!Array.isArray(devices) || devices.length === 0) {
    return;
  }
  for (let i = 0; i < devices.length; i += chunkSize) {
    const chunk = devices.slice(i, i + chunkSize);
    logger.info(
      `Publishing discovered devices chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(
        devices.length / chunkSize,
      )} (${chunk.length} device(s))...`,
    );
    await gladys.publishDiscoveredDevices(chunk);
  }
}

/**
 * Handle action from Configuration screen.
 */
export async function handleTestConnectionAction(gladys, unifiClient) {
  if (!unifiClient) {
    throw new Error('Le client UniFi n’est pas initialisé. Veuillez enregistrer la configuration.');
  }

  const res = await unifiClient.testConnection();
  return {
    en: res.message,
    fr: res.message,
  };
}
