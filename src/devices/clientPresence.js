import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

/**
 * Helper to build clean, descriptive display name for network clients.
 */
export function getClientDisplayName(client) {
  if (!client) return 'Appareil Inconnu';

  const name = typeof client.name === 'string' ? client.name.trim() : '';
  if (name) return name;

  const hostname = typeof client.hostname === 'string' ? client.hostname.trim() : '';
  if (hostname) return hostname;

  const dhcpHostname = typeof client.dhcp_hostname === 'string' ? client.dhcp_hostname.trim() : '';
  if (dhcpHostname) return dhcpHostname;

  const ip = typeof client.ip === 'string' ? client.ip.trim() : '';
  const oui = typeof client.oui === 'string' ? client.oui.trim() : '';
  const mac = (client.mac || '').toLowerCase();
  const shortMac = mac.length >= 5 ? mac.slice(-5) : mac;

  if (oui && ip) {
    return `${oui} (${ip})`;
  }
  if (oui) {
    return `${oui} (${shortMac})`;
  }
  if (ip) {
    return `Appareil ${ip} (${shortMac})`;
  }
  return `Appareil (${shortMac || 'Inconnu'})`;
}

/**
 * Blueprint for Network Client (Smartphone, PC, TV) presence tracker & internet control.
 */
export const clientBlueprint = {
  key: 'client',

  deviceExternalId(gladys, clientMac) {
    return gladys.externalIds('client', clientMac.toLowerCase()).device;
  },

  buildDevice(gladys, client) {
    const mac = client.mac.toLowerCase();
    const cleanMac = mac.replace(/[^a-z0-9]/g, '');
    const deviceSelector = `unifi-client-${cleanMac}`;
    const ids = gladys.externalIds('client', mac);
    const displayName = getClientDisplayName(client);

    return {
      name: displayName,
      selector: deviceSelector,
      external_id: ids.device,
      model: client.is_guest ? 'Guest Device' : 'Network Client',
      poll_frequency: 60000,
      features: [
        {
          name: 'Présence',
          selector: `${deviceSelector}-presence`,
          external_id: ids.feature('presence'),
          category: DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.PUSH,
          min: 0,
          max: 1,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Accès Internet',
          selector: `${deviceSelector}-access`,
          external_id: ids.feature('access'),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
          keep_history: true,
        },
      ],
    };
  },
};

// Aliases for backwards compatibility
export const clientPresenceBlueprint = clientBlueprint;
export const clientInternetBlueprint = clientBlueprint;
