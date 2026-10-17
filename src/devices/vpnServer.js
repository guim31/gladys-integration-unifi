import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

// A WireGuard server has at most this many peers in practice; the bound of
// the counter only drives the display.
const MAX_VPN_CLIENTS = 100;

/**
 * Blueprint for the WireGuard VPN server of the gateway (`vpn:<network _id>`):
 * its state (a switch, read-only unless the configuration allows it) and the
 * number of connected clients.
 */
export const vpnServerBlueprint = {
  key: 'vpn-server',

  deviceExternalId(gladys, networkId) {
    return gladys.externalIds('vpn', networkId).device;
  },

  buildDevice(gladys, network, { allowControl = false } = {}) {
    const networkId = String(network._id);
    const cleanId = networkId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const deviceSelector = `unifi-vpn-${cleanId}`;
    const ids = gladys.externalIds('vpn', networkId);

    return {
      name: `VPN WireGuard : ${network.name || 'WireGuard'}`,
      selector: deviceSelector,
      external_id: ids.device,
      model: 'Serveur VPN WireGuard',
      should_poll: false,
      features: [
        {
          name: 'Serveur VPN actif',
          selector: `${deviceSelector}-state`,
          external_id: ids.feature('state'),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          min: 0,
          max: 1,
          read_only: !allowControl,
          has_feedback: true,
          keep_history: true,
        },
        {
          name: 'Clients VPN connectés',
          selector: `${deviceSelector}-clients`,
          external_id: ids.feature('clients'),
          category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
          min: 0,
          max: MAX_VPN_CLIENTS,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
      ],
    };
  },
};
