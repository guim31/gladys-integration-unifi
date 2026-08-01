// -----------------------------------------------------------------------------
// UniFi Device Registry & Discovery Engine
// -----------------------------------------------------------------------------

import { logger } from '@gladysassistant/integration-sdk';
import { gatewayBlueprint } from './gateway.js';
import { clientPresenceBlueprint } from './clientPresence.js';
import { poePortBlueprint } from './poePort.js';
import { wifiNetworkBlueprint } from './wifiNetwork.js';

export const DEVICE_BLUEPRINTS = [
  gatewayBlueprint,
  clientPresenceBlueprint,
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

    // 2. Network Clients (Active Connected & Known Devices)
    const activeClients = await unifiClient.getClients();
    const knownClients = await unifiClient.getKnownClients();
    logger.info(
      `UniFi getClients returned ${activeClients.length} active client(s), getKnownClients returned ${knownClients.length} known client(s).`,
    );

    const allClients = [...activeClients, ...knownClients];
    for (const client of allClients) {
      if (client.mac && !addedMacs.has(client.mac.toLowerCase())) {
        addedMacs.add(client.mac.toLowerCase());
        discovered.push(clientPresenceBlueprint.buildDevice(gladys, client));
      }
    }

    // 3. Wi-Fi SSID Networks
    const wlans = await unifiClient.getWlans();
    logger.info(`UniFi getWlans returned ${wlans.length} wlan(s).`);
    for (const wlan of wlans) {
      discovered.push(wifiNetworkBlueprint.buildDevice(gladys, wlan));
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
