import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

/**
 * True when the UniFi hardware exposes at least one PoE-capable port.
 */
export function hasPoePorts(unifiDevice) {
  return (
    Array.isArray(unifiDevice?.port_table) &&
    unifiDevice.port_table.some((port) => port.poe_caps && port.poe_caps > 0 && port.port_idx)
  );
}

/**
 * Build the PoE port switch features of a UniFi hardware device.
 *
 * The features are attached to the hardware device itself (one switch = one
 * Gladys device): the discovery screen displays feature CATEGORIES, not their
 * names, so a dedicated "Switch PoE" device never made the ports easier to
 * tell apart -- it only doubled the number of devices. The real port names
 * ("Port 3 (Camera Entrance)") show up where they matter: dashboard, scenes.
 *
 * `external_id` is left untouched (`unifi:poe:<mac>:<portIdx>:power`) so state
 * polling and `onSetValue` keep working exactly as before.
 */
export function buildPoePortFeatures(gladys, unifiDevice, deviceSelector) {
  if (!hasPoePorts(unifiDevice)) {
    return [];
  }

  const mac = unifiDevice.mac.toLowerCase();
  const features = [];

  for (const port of unifiDevice.port_table) {
    if (port.poe_caps && port.poe_caps > 0 && port.port_idx) {
      const portIdx = port.port_idx;
      const portLabel = port.name ? `Port ${portIdx} (${port.name})` : `Port ${portIdx}`;

      features.push({
        name: portLabel,
        selector: `${deviceSelector}-port-${portIdx}`,
        external_id: gladys.externalId(`poe:${mac}:${portIdx}:power`),
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

  return features;
}

/**
 * Blueprint of the "Switch PoE : <name>" device of v1.5.2
 * (`<selector>:poe-switch:<mac>`), kept for the users who added it then.
 *
 * Its PoE features carry the very `external_id` v1.6 puts back on the hardware
 * device, and Gladys refuses a feature `external_id` already owned by another
 * device (HTTP 409): while this device exists, its ports stay on it, with the
 * v1.5.2 structure, and the hardware device is published without them.
 */
export const legacyPoeSwitchBlueprint = {
  key: 'poe-switch',

  deviceExternalId(gladys, deviceMac) {
    return gladys.externalIds('poe-switch', deviceMac.toLowerCase()).device;
  },

  /**
   * The lowercase MAC of a v1.5.2 "Switch PoE" device, or null for any other
   * external_id.
   */
  macOf(gladys, deviceExternalId) {
    const prefix = this.deviceExternalId(gladys, '');
    if (typeof deviceExternalId !== 'string' || !deviceExternalId.startsWith(prefix)) {
      return null;
    }
    return deviceExternalId.slice(prefix.length).toLowerCase() || null;
  },

  buildDevice(gladys, unifiDevice) {
    const mac = unifiDevice.mac.toLowerCase();
    const cleanMac = mac.replace(/[^a-z0-9]/g, '');
    const deviceSelector = `unifi-poe-switch-${cleanMac}`;
    const hardwareName = unifiDevice.name || unifiDevice.model || 'Switch';

    const deviceIp = typeof unifiDevice.ip === 'string' ? unifiDevice.ip.trim() : '';
    const params = [{ name: 'MAC_ADDRESS', value: mac.toUpperCase() }];
    if (deviceIp) {
      params.push({ name: 'IP_ADDRESS', value: deviceIp });
    }

    return {
      name: `Switch PoE : ${hardwareName}`,
      selector: deviceSelector,
      external_id: this.deviceExternalId(gladys, mac),
      model: `${unifiDevice.model || 'UniFi'} PoE Switch`,
      poll_frequency: 60000,
      features: buildPoePortFeatures(gladys, unifiDevice, deviceSelector),
      params,
    };
  },
};
