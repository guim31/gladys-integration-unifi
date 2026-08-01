import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

/**
 * Blueprint for UniFi Gateway (UCG Fiber / UDM / USG).
 */
export const gatewayBlueprint = {
  key: 'gateway',

  deviceExternalId(gladys, deviceMac) {
    return gladys.externalIds('gateway', deviceMac.toLowerCase()).device;
  },

  buildDevice(gladys, unifiDevice) {
    const mac = unifiDevice.mac.toLowerCase();
    const ids = gladys.externalIds('gateway', mac);

    return {
      name: unifiDevice.name || unifiDevice.model || 'UniFi Gateway',
      external_id: ids.device,
      model: unifiDevice.model || 'UCG-Fiber',
      features: [
        {
          name: 'WAN Upload Speed',
          external_id: ids.feature('wan-up'),
          category: DEVICE_FEATURE_CATEGORIES.SPEED_SENSOR,
          type: DEVICE_FEATURE_TYPES.SPEED_SENSOR.INTEGER,
          unit: DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND,
          min: 0,
          max: 10000,
          read_only: true,
          keep_history: true,
        },
        {
          name: 'WAN Download Speed',
          external_id: ids.feature('wan-down'),
          category: DEVICE_FEATURE_CATEGORIES.SPEED_SENSOR,
          type: DEVICE_FEATURE_TYPES.SPEED_SENSOR.INTEGER,
          unit: DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND,
          min: 0,
          max: 10000,
          read_only: true,
          keep_history: true,
        },
        {
          name: 'Status',
          external_id: ids.feature('status'),
          category: DEVICE_FEATURE_CATEGORIES.SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
          min: 0,
          max: 1,
          read_only: true,
          keep_history: true,
        },
      ],
    };
  },
};
