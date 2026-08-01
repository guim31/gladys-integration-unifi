import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

/**
 * Blueprint for dedicated Switch PoE Device grouping all PoE port switches of a hardware device.
 */
export const poeSwitchBlueprint = {
  key: 'poe-switch',

  deviceExternalId(gladys, deviceMac) {
    return gladys.externalIds('poe-switch', deviceMac.toLowerCase()).device;
  },

  buildDevice(gladys, unifiDevice) {
    const mac = unifiDevice.mac.toLowerCase();
    const cleanMac = mac.replace(/[^a-z0-9]/g, '');
    const deviceSelector = `unifi-poe-switch-${cleanMac}`;
    const ids = gladys.externalIds('poe-switch', mac);
    const hardwareName = unifiDevice.name || unifiDevice.model || 'Switch';

    const features = [];
    if (Array.isArray(unifiDevice.port_table)) {
      for (const port of unifiDevice.port_table) {
        if (port.poe_caps && port.poe_caps > 0 && port.port_idx) {
          const portIdx = port.port_idx;
          const poeFeatureId = gladys.externalId(`poe:${mac}:${portIdx}:power`);
          const portLabel = port.name ? `Port ${portIdx} (${port.name})` : `Port ${portIdx}`;

          features.push({
            name: portLabel,
            selector: `${deviceSelector}-port-${portIdx}`,
            external_id: poeFeatureId,
            category: DEVICE_FEATURE_CATEGORIES.SWITCH,
            type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
            min: 0,
            max: 1,
            read_only: false,
            has_feedback: true,
            keep_history: true,
          });
        }
      }
    }

    const deviceIp = typeof unifiDevice.ip === 'string' ? unifiDevice.ip.trim() : '';
    const params = [{ name: 'MAC_ADDRESS', value: mac.toUpperCase() }];
    if (deviceIp) {
      params.push({ name: 'IP_ADDRESS', value: deviceIp });
    }

    return {
      name: `Switch PoE : ${hardwareName}`,
      selector: deviceSelector,
      external_id: ids.device,
      model: `${unifiDevice.model || 'UniFi'} PoE Switch`,
      poll_frequency: 60000,
      features,
      params,
    };
  },
};

// Alias for backwards compatibility
export const poePortBlueprint = poeSwitchBlueprint;
