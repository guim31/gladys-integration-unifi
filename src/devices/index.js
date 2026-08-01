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

  const discovered = [];

  try {
    // 1. Gateways, Switches & Access Points
    const devices = await unifiClient.getDevices();
    for (const dev of devices) {
      // Is Gateway (UCG, UDM, USG)
      if (dev.type === 'ugw' || dev.type === 'udm' || (dev.model && dev.model.includes('UCG'))) {
        discovered.push(gatewayBlueprint.buildDevice(gladys, dev));
      }

      // PoE ports on Switches/Gateways
      if (Array.isArray(dev.port_table)) {
        for (const port of dev.port_table) {
          if (port.poe_caps && port.poe_caps > 0) {
            discovered.push(poePortBlueprint.buildDevice(gladys, dev, port));
          }
        }
      }
    }

    // 2. Connected Network Clients (Device Tracker & Internet Switch)
    const clients = await unifiClient.getClients();
    for (const client of clients) {
      if (client.mac) {
        discovered.push(clientPresenceBlueprint.buildDevice(gladys, client));
      }
    }

    // 3. Wi-Fi SSID Networks
    const wlans = await unifiClient.getWlans();
    for (const wlan of wlans) {
      discovered.push(wifiNetworkBlueprint.buildDevice(gladys, wlan));
    }

    logger.info(`UniFi Discovery completed: ${discovered.length} device(s) found.`);
  } catch (err) {
    logger.error('Error during UniFi discovery scan:', err.message);
  }

  return discovered;
}

/**
 * Handle action from Configuration screen.
 */
export async function handleTestConnectionAction(gladys, unifiClient) {
  if (!unifiClient) {
    return {
      en: 'UniFi client is not initialized. Check host configuration.',
      fr: "Le client UniFi n'est pas initialisé. Vérifiez la configuration.",
    };
  }

  try {
    const res = await unifiClient.testConnection();
    return {
      en: res.message,
      fr: `Connexion réussie à UniFi Network ! (${res.message})`,
    };
  } catch (err) {
    return {
      en: `Connection failed: ${err.message}`,
      fr: `Échec de la connexion : ${err.message}`,
    };
  }
}
