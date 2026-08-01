import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

/**
 * Blueprint for UniFi Infrastructure Devices (UCG Fiber / UDM / USG / Switches / APs).
 */
export const gatewayBlueprint = {
  key: 'gateway',

  deviceExternalId(gladys, deviceMac) {
    return gladys.externalIds('gateway', deviceMac.toLowerCase()).device;
  },

  buildDevice(gladys, unifiDevice) {
    const mac = unifiDevice.mac.toLowerCase();
    const cleanMac = mac.replace(/[^a-z0-9]/g, '');
    const deviceSelector = `unifi-gateway-${cleanMac}`;
    const ids = gladys.externalIds('gateway', mac);
    const isGateway =
      unifiDevice.type === 'ugw' ||
      unifiDevice.type === 'udm' ||
      unifiDevice.type === 'ucg' ||
      (unifiDevice.model && unifiDevice.model.toUpperCase().includes('UCG'));

    const features = [
      {
        name: 'Status',
        selector: `${deviceSelector}-status`,
        external_id: ids.feature('status'),
        category: DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.PUSH,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ];

    if (isGateway) {
      features.push(
        {
          name: 'WAN Upload Speed',
          selector: `${deviceSelector}-wan-up`,
          external_id: ids.feature('wan-up'),
          category: DEVICE_FEATURE_CATEGORIES.DATARATE,
          type: DEVICE_FEATURE_TYPES.DATARATE.RATE,
          unit: DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND,
          min: 0,
          max: 10000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'WAN Download Speed',
          selector: `${deviceSelector}-wan-down`,
          external_id: ids.feature('wan-down'),
          category: DEVICE_FEATURE_CATEGORIES.DATARATE,
          type: DEVICE_FEATURE_TYPES.DATARATE.RATE,
          unit: DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND,
          min: 0,
          max: 10000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
      );
    }

    // Attach PoE ports as features of this infrastructure device
    if (Array.isArray(unifiDevice.port_table)) {
      for (const port of unifiDevice.port_table) {
        if (port.poe_caps && port.poe_caps > 0 && port.port_idx) {
          const portIdx = port.port_idx;
          const poeFeatureId = gladys.externalId(`poe:${mac}:${portIdx}:power`);
          const portName = port.name ? ` (Port ${portIdx}: ${port.name})` : ` (Port ${portIdx})`;

          features.push({
            name: `Alimentation PoE${portName}`,
            selector: `${deviceSelector}-poe-${portIdx}`,
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
      name: unifiDevice.name || unifiDevice.model || 'UniFi Device',
      selector: deviceSelector,
      external_id: ids.device,
      model: unifiDevice.model || 'UniFi Hardware',
      poll_frequency: 60000,
      features,
      params,
    };
  },
};
