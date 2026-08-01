import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_BLUEPRINTS } from '../src/devices/index.js';
import { gatewayBlueprint } from '../src/devices/gateway.js';
import { clientPresenceBlueprint, getClientDisplayName } from '../src/devices/clientPresence.js';
import { wifiNetworkBlueprint } from '../src/devices/wifiNetwork.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();

test('every UniFi blueprint exposes key and builder functions', () => {
  for (const bp of DEVICE_BLUEPRINTS) {
    assert.equal(typeof bp.key, 'string');
    assert.equal(typeof bp.deviceExternalId, 'function');
    assert.equal(typeof bp.buildDevice, 'function');
  }
});

test('gatewayBlueprint formats device payload, IP/MAC params, and PoE features correctly', () => {
  const mockGateway = {
    mac: '74:83:c2:11:22:33',
    name: 'USW-24-PoE',
    model: 'USW-24-PoE',
    type: 'usw',
    ip: '192.168.1.2',
    port_table: [
      { port_idx: 1, poe_caps: 7, name: 'Camera Entrance' },
      { port_idx: 2, poe_caps: 7, name: 'AP Salon' },
    ],
  };

  const device = gatewayBlueprint.buildDevice(gladys, mockGateway);
  assert.equal(device.name, 'USW-24-PoE');
  assert.equal(device.external_id, gladys.externalIds('gateway', '74:83:c2:11:22:33').device);
  // Status + 2 PoE ports = 3 features
  assert.equal(device.features.length, 3);
  assert.equal(device.features[1].name, 'Alimentation PoE (Port 1: Camera Entrance)');
  assert.equal(device.features[2].name, 'Alimentation PoE (Port 2: AP Salon)');
  assert.deepEqual(device.params, [
    { name: 'MAC_ADDRESS', value: '74:83:C2:11:22:33' },
    { name: 'IP_ADDRESS', value: '192.168.1.2' },
  ]);
});

test('clientBlueprint formats presence, internet access features, and IP/MAC params', () => {
  const mockClient = {
    mac: 'aa:bb:cc:dd:ee:ff',
    name: 'Thomas Smartphone',
    hostname: 'iPhone',
    ip: '192.168.1.50',
    is_guest: false,
  };

  const device = clientPresenceBlueprint.buildDevice(gladys, mockClient);
  assert.equal(device.name, 'Thomas Smartphone');
  assert.equal(device.external_id, gladys.externalIds('client', 'aa:bb:cc:dd:ee:ff').device);
  assert.equal(device.features.length, 2);
  assert.equal(device.features[0].name, 'Présence');
  assert.equal(device.features[1].name, 'Accès Internet');
  assert.deepEqual(device.params, [
    { name: 'MAC_ADDRESS', value: 'AA:BB:CC:DD:EE:FF' },
    { name: 'IP_ADDRESS', value: '192.168.1.50' },
  ]);
  assert.equal(typeof device.selector, 'string');
});

test('wifiNetworkBlueprint formats SSID device correctly', () => {
  const mockWlan = {
    _id: 'wlan_12345',
    name: 'Wi-Fi Guest',
  };

  const device = wifiNetworkBlueprint.buildDevice(gladys, mockWlan);
  assert.equal(device.name, 'Réseau Wi-Fi : Wi-Fi Guest');
  assert.equal(device.external_id, gladys.externalIds('wifi', 'wlan_12345').device);
  assert.equal(device.features.length, 1);
  assert.equal(typeof device.selector, 'string');
});

test('getClientDisplayName formats vendor OUI and IP fallback when name is missing', () => {
  const mockClientWithOuiIp = {
    mac: '00:06:78:51:d6:f8',
    oui: 'Apple',
    ip: '192.168.100.12',
  };
  assert.equal(getClientDisplayName(mockClientWithOuiIp), 'Apple (192.168.100.12)');

  const mockClientWithOuiOnly = {
    mac: '48:b0:2d:6c:0f:57',
    oui: 'Espressif',
  };
  assert.equal(getClientDisplayName(mockClientWithOuiOnly), 'Espressif (0f:57)');

  const mockWhitespaceName = {
    mac: '00:27:02:18:5d:7d',
    name: '   ',
    oui: 'Samsung',
    ip: '192.168.100.45',
  };
  assert.equal(getClientDisplayName(mockWhitespaceName), 'Samsung (192.168.100.45)');
});

test('buildDiscoveredDevices filters clients and infrastructure based on config', async () => {
  const { buildDiscoveredDevices } = await import('../src/devices/index.js');

  const mockClient = {
    isLoggedIn: true,
    login: async () => {},
    getDevices: async () => [{ mac: '11:22:33:44:55:66', name: 'Switch-24', port_table: [] }],
    getClients: async () => [
      { mac: 'aa:bb:cc:dd:ee:01', name: 'Phone Wifi', is_wired: false, essid: 'Home' },
      { mac: 'aa:bb:cc:dd:ee:02', name: 'PC Wired', is_wired: true },
      { mac: 'aa:bb:cc:dd:ee:03', name: 'IoT Guest', is_wired: false, essid: 'Guest' },
    ],
    getKnownClients: async () => [
      { mac: 'aa:bb:cc:dd:ee:99', name: 'Old Phone Offline', is_wired: false, essid: 'Home' },
    ],
    getWlans: async () => [{ _id: 'wlan_1', name: 'Home' }],
  };

  // Test 1: Default config (only_active_clients = true)
  const configDefault = {
    discover_infrastructure: true,
    discover_clients: true,
    only_active_clients: true,
    client_connection_type: 'all',
    allowed_ssids: [],
  };

  const devices1 = await buildDiscoveredDevices(gladys, configDefault, mockClient);
  // 1 Switch + 3 Active clients (unified device) + 1 WLAN = 5 devices
  assert.equal(devices1.length, 5);

  // Test 2: wifi_only & allowed_ssids = ['Home']
  const configWifiHome = {
    discover_infrastructure: false,
    discover_clients: true,
    only_active_clients: true,
    client_connection_type: 'wifi_only',
    allowed_ssids: ['Home'],
  };

  const devices2 = await buildDiscoveredDevices(gladys, configWifiHome, mockClient);
  // Infra skipped (0 switch, 0 wlan). Client 01 matches (wifi + Home SSID => 1 unified device). Client 02 (wired) and Client 03 (Guest SSID) skipped.
  assert.equal(devices2.length, 1);
  assert.equal(devices2[0].name, 'Phone Wifi');

  // Test 3: include known clients (only_active_clients = false)
  const configWithKnown = {
    discover_infrastructure: false,
    discover_clients: true,
    only_active_clients: false,
    client_connection_type: 'all',
    allowed_ssids: [],
  };

  const devices3 = await buildDiscoveredDevices(gladys, configWithKnown, mockClient);
  // 3 active + 1 known client = 4 clients (unified devices)
  assert.equal(devices3.length, 4);
});

test('publishDiscoveredDevicesInChunks batches devices into chunks of 100 max', async () => {
  const { publishDiscoveredDevicesInChunks } = await import('../src/devices/index.js');

  const publishedChunks = [];
  const fakeGladysSdk = {
    publishDiscoveredDevices: async (chunk) => {
      publishedChunks.push(chunk);
    },
  };

  // Create 250 mock devices
  const mockDevices = Array.from({ length: 250 }, (_, i) => ({ id: `dev_${i}` }));

  await publishDiscoveredDevicesInChunks(fakeGladysSdk, mockDevices, 100);

  assert.equal(publishedChunks.length, 3);
  assert.equal(publishedChunks[0].length, 100);
  assert.equal(publishedChunks[1].length, 100);
  assert.equal(publishedChunks[2].length, 50);
});
