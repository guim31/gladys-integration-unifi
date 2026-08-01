import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

/**
 * Blueprint for UniFi Switch PoE Port control.
 */
export const poePortBlueprint = {
  key: 'poe-port',

  deviceExternalId(gladys, deviceMac, portIdx) {
    return gladys.externalIds('poe', `${deviceMac.toLowerCase()}:${portIdx}`).device;
  },

  buildDevice(gladys, switchDevice, port) {
    const deviceMac = switchDevice.mac.toLowerCase();
    const portIdx = port.port_idx;
    const ids = gladys.externalIds('poe', `${deviceMac}:${portIdx}`);
    const portName = port.name || `Port ${portIdx}`;

    return {
      name: `${switchDevice.name || switchDevice.model} - ${portName} (PoE)`,
      external_id: ids.device,
      model: 'Switch PoE Port',
      features: [
        {
          name: 'PoE Power',
          external_id: ids.feature('power'),
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
