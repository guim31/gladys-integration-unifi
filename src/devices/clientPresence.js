import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

/**
 * Blueprint for Network Client (Smartphone, PC, TV) presence tracker.
 */
export const clientPresenceBlueprint = {
  key: 'client-presence',

  deviceExternalId(gladys, clientMac) {
    return gladys.externalIds('client', clientMac.toLowerCase()).device;
  },

  buildDevice(gladys, client) {
    const mac = client.mac.toLowerCase();
    const cleanMac = mac.replace(/[^a-z0-9]/g, '');
    const deviceSelector = `unifi-client-${cleanMac}`;
    const ids = gladys.externalIds('client', mac);
    const displayName =
      client.name || client.hostname || client.ip || `Appareil (${mac.slice(-5)})`;

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
      ],
    };
  },
};

/**
 * Blueprint for Network Client Internet Access control switch.
 */
export const clientInternetBlueprint = {
  key: 'client-internet',

  deviceExternalId(gladys, clientMac) {
    return gladys.externalIds('client-internet', clientMac.toLowerCase()).device;
  },

  buildDevice(gladys, client) {
    const mac = client.mac.toLowerCase();
    const cleanMac = mac.replace(/[^a-z0-9]/g, '');
    const deviceSelector = `unifi-client-internet-${cleanMac}`;
    const ids = gladys.externalIds('client-internet', mac);
    const displayName =
      client.name || client.hostname || client.ip || `Appareil (${mac.slice(-5)})`;

    return {
      name: `Accès Internet : ${displayName}`,
      selector: deviceSelector,
      external_id: ids.device,
      model: 'Contrôle Accès Internet',
      poll_frequency: 60000,
      features: [
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
