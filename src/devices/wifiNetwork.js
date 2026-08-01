import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

/**
 * Blueprint for Wi-Fi SSID network switch.
 */
export const wifiNetworkBlueprint = {
  key: 'wifi-network',

  deviceExternalId(gladys, wlanId) {
    return gladys.externalIds('wifi', wlanId).device;
  },

  buildDevice(gladys, wlan) {
    const wlanId = String(wlan._id || wlan.name || 'default');
    const cleanId = wlanId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const deviceSelector = `unifi-wifi-${cleanId}`;
    const ids = gladys.externalIds('wifi', wlanId);

    return {
      name: `Wi-Fi SSID: ${wlan.name || 'SSID'}`,
      selector: deviceSelector,
      external_id: ids.device,
      model: 'Wi-Fi Network (SSID)',
      poll_frequency: 60000,
      features: [
        {
          name: 'Wi-Fi State',
          selector: `${deviceSelector}-state`,
          external_id: ids.feature('state'),
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
