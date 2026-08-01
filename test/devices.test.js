import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_BLUEPRINTS } from '../src/devices/index.js';
import { gatewayBlueprint } from '../src/devices/gateway.js';
import { clientPresenceBlueprint } from '../src/devices/clientPresence.js';
import { poePortBlueprint } from '../src/devices/poePort.js';
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

test('gatewayBlueprint formats device payload correctly', () => {
  const mockGateway = {
    mac: '74:83:c2:11:22:33',
    name: 'UCG-Fiber',
    model: 'UCG-Fiber',
  };

  const device = gatewayBlueprint.buildDevice(gladys, mockGateway);
  assert.equal(device.name, 'UCG-Fiber');
  assert.equal(device.external_id, gladys.externalIds('gateway', '74:83:c2:11:22:33').device);
  assert.equal(device.features.length, 3);
});

test('clientPresenceBlueprint formats presence & block features', () => {
  const mockClient = {
    mac: 'aa:bb:cc:dd:ee:ff',
    name: 'Thomas Smartphone',
    hostname: 'iPhone',
    is_guest: false,
  };

  const device = clientPresenceBlueprint.buildDevice(gladys, mockClient);
  assert.equal(device.name, 'Thomas Smartphone');
  assert.equal(device.external_id, gladys.externalIds('client', 'aa:bb:cc:dd:ee:ff').device);
  assert.equal(device.features.length, 2);
});

test('poePortBlueprint formats switch PoE port correctly', () => {
  const mockSwitch = {
    mac: '11:22:33:44:55:66',
    name: 'USW-24-PoE',
  };
  const mockPort = {
    port_idx: 1,
    name: 'Port 1 Camera',
  };

  const device = poePortBlueprint.buildDevice(gladys, mockSwitch, mockPort);
  assert.equal(device.name, 'USW-24-PoE - Port 1 Camera (PoE)');
  assert.equal(device.external_id, gladys.externalIds('poe', '11:22:33:44:55:66:1').device);
  assert.equal(device.features.length, 1);
});

test('wifiNetworkBlueprint formats SSID device correctly', () => {
  const mockWlan = {
    _id: 'wlan_12345',
    name: 'Wi-Fi Guest',
  };

  const device = wifiNetworkBlueprint.buildDevice(gladys, mockWlan);
  assert.equal(device.name, 'Wi-Fi SSID: Wi-Fi Guest');
  assert.equal(device.external_id, gladys.externalIds('wifi', 'wlan_12345').device);
  assert.equal(device.features.length, 1);
});
