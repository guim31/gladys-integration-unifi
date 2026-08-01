import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

/**
 * Blueprint for Wi-Fi SSID network switch (e.g. Guest Wi-Fi).
 */
export const wifiNetworkBlueprint = {
  key: 'wifi-network',

  deviceExternalId(gladys, wlanId) {
    return gladys.externalIds('wifi', wlanId).device;
  },

  buildDevice(gladys, wlan) {
    const ids = gladys.externalIds('wifi', wlan._id);

    return {
      name: `Wi-Fi SSID: ${wlan.name || 'Network'}`,
      external_id: ids.device,
      model: 'Wi-Fi Network (SSID)',
      features: [
        {
          name: 'Wi-Fi State',
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
