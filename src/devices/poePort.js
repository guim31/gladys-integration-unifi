import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

/**
 * Blueprint for Switch PoE Port power switch.
 */
export const poePortBlueprint = {
  key: 'poe-port',

  deviceExternalId(gladys, switchMac, portIdx) {
    const key = `${switchMac.toLowerCase()}:port:${portIdx}`;
    return gladys.externalIds('poe-port', key).device;
  },

  buildDevice(gladys, switchDev, port) {
    const switchMac = switchDev.mac.toLowerCase();
    const portIdx = port.port_idx || 1;
    const cleanMac = switchMac.replace(/[^a-z0-9]/g, '');
    const deviceSelector = `unifi-poe-${cleanMac}-port-${portIdx}`;

    const key = `${switchMac}:port:${portIdx}`;
    const ids = gladys.externalIds('poe-port', key);

    return {
      name: `Port PoE : ${port.name || 'Port ' + portIdx}`,
      selector: deviceSelector,
      external_id: ids.device,
      model: 'Port PoE Switch',
      poll_frequency: 60000,
      features: [
        {
          name: 'Alimentation PoE',
          selector: `${deviceSelector}-power`,
          external_id: ids.feature('poe-power'),
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
