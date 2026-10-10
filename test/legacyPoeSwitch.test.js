// The "Switch PoE" device of v1.5.2 owns the PoE feature external_ids that
// v1.6 put back on the hardware device: "Update" of the hardware device then
// failed in HTTP 409. These tests replay it against a core that refuses a
// feature external_id already owned by another device.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoveredDevices, findLegacyPoeSwitchMacs } from '../src/devices/index.js';
import { gatewayBlueprint } from '../src/devices/gateway.js';
import { legacyPoeSwitchBlueprint } from '../src/devices/poePort.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { ConflictError, createFakeCore } from './helpers/fakeCore.js';

// Fictitious hardware (locally administered MAC).
const MAC = '02:00:5e:10:20:30';
const OTHER_MAC = '02:00:5e:40:50:60';

const hardware = {
  mac: MAC,
  name: 'Cloud Gateway Fiber',
  model: 'UCG-Fiber',
  type: 'ucg',
  ip: '192.0.2.1',
  port_table: [
    { port_idx: 1, poe_caps: 0, name: 'WAN' },
    { port_idx: 2, poe_caps: 7 },
    { port_idx: 4, poe_caps: 7, name: 'Port 4' },
  ],
};

const config = {
  discover_infrastructure: true,
  discover_clients: false,
};

const unifiClient = {
  isLoggedIn: true,
  login: async () => {},
  getDevices: async () => [structuredClone(hardware)],
  getClients: async () => [],
  getKnownClients: async () => [],
  getWlans: async () => [],
};

/**
 * The "Switch PoE" device exactly as v1.5.2 (commit 10f427a) published it:
 * written out by hand, so a change of the blueprint cannot pass unnoticed.
 */
function v152PoeSwitch(gladys) {
  const port = (idx, name) => ({
    name,
    selector: `unifi-poe-switch-02005e102030-port-${idx}`,
    external_id: gladys.externalId(`poe:${MAC}:${idx}:power`),
    category: 'switch',
    type: 'binary',
    min: 0,
    max: 1,
    read_only: false,
    has_feedback: true,
    keep_history: true,
  });
  return {
    name: 'Switch PoE : Cloud Gateway Fiber',
    selector: 'unifi-poe-switch-02005e102030',
    external_id: gladys.externalIds('poe-switch', MAC).device,
    model: 'UCG-Fiber PoE Switch',
    poll_frequency: 60000,
    features: [port(2, 'Port 2'), port(4, 'Port 4 (Port 4)')],
    params: [
      { name: 'MAC_ADDRESS', value: '02:00:5E:10:20:30' },
      { name: 'IP_ADDRESS', value: '192.0.2.1' },
    ],
  };
}

/** A core where the user added both devices under v1.5.2. */
function coreAfterV152(gladys) {
  const core = createFakeCore();
  // v1.5.2 published the hardware device without its PoE ports.
  core.saveDevice(gatewayBlueprint.buildDevice(gladys, hardware, { withPoePorts: false }));
  core.saveDevice(v152PoeSwitch(gladys));
  gladys.devices = core.devices();
  return core;
}

const poeIds = (device) =>
  device.features.filter((f) => f.external_id.includes(':poe:')).map((f) => f.external_id);

test('v1.6.1 behaviour: updating the hardware device fails in 409 on the PoE feature', () => {
  const gladys = createFakeGladys();
  const core = coreAfterV152(gladys);

  // What v1.6.1 published: the ports back on the hardware device.
  const gateway = gatewayBlueprint.buildDevice(gladys, hardware);
  const [shown] = core.discovery([gateway]);
  assert.equal(shown.created, true);
  assert.equal(shown.structure_changed, true, 'Discovery offers "Update"');

  assert.throws(
    () => core.saveDevice(gateway),
    (err) =>
      err instanceof ConflictError &&
      err.status === 409 &&
      err.externalId === gladys.externalId(`poe:${MAC}:2:power`),
  );
});

test('with the v1.5.2 "Switch PoE" device in Gladys, its ports stay on it', async () => {
  const gladys = createFakeGladys();
  const core = coreAfterV152(gladys);

  const published = await buildDiscoveredDevices(gladys, config, unifiClient);
  const gateway = published.find(
    (d) => d.external_id === gladys.externalIds('gateway', MAC).device,
  );
  const legacy = published.find(
    (d) => d.external_id === gladys.externalIds('poe-switch', MAC).device,
  );

  // The hardware device carries no PoE feature; the legacy device is the v1.5.2 one.
  assert.deepEqual(poeIds(gateway), []);
  assert.deepEqual(legacy, v152PoeSwitch(gladys));

  // Discovery: both are known, nothing to update, and "Update" would succeed.
  for (const shown of core.discovery(published)) {
    assert.equal(shown.created, true);
    assert.equal(shown.structure_changed, false, shown.name);
    assert.doesNotThrow(() => core.saveDevice(shown));
  }
  assert.deepEqual(poeIds(core.created.get(legacy.external_id)), poeIds(v152PoeSwitch(gladys)));
});

test('a hardware device that drifted for another reason can still be updated', async () => {
  const gladys = createFakeGladys();
  const core = coreAfterV152(gladys);
  // e.g. a USG created before the WAN features existed on it.
  const old = core.created.get(gladys.externalIds('gateway', MAC).device);
  old.features = old.features.filter((f) => !f.external_id.endsWith(':wan-up'));
  gladys.devices = core.devices();

  const published = await buildDiscoveredDevices(gladys, config, unifiClient);
  const shown = core
    .discovery(published)
    .find((d) => d.external_id === gladys.externalIds('gateway', MAC).device);
  assert.equal(shown.structure_changed, true);
  assert.doesNotThrow(() => core.saveDevice(shown));
});

test('without a "Switch PoE" device, the ports are on the hardware device (v1.6 behaviour)', async () => {
  const gladys = createFakeGladys();
  const core = createFakeCore();
  gladys.devices = core.devices();

  const published = await buildDiscoveredDevices(gladys, config, unifiClient);
  assert.equal(published.length, 1);
  assert.deepEqual(poeIds(published[0]), [
    gladys.externalId(`poe:${MAC}:2:power`),
    gladys.externalId(`poe:${MAC}:4:power`),
  ]);
  assert.doesNotThrow(() => core.saveDevice(published[0]));
});

test('once the user deletes the "Switch PoE" device, the ports go back on the hardware device', async () => {
  const gladys = createFakeGladys();
  const core = coreAfterV152(gladys);

  core.deleteDevice(gladys.externalIds('poe-switch', MAC).device);
  gladys.devices = core.devices();

  const published = await buildDiscoveredDevices(gladys, config, unifiClient);
  assert.equal(published.length, 1);
  const [shown] = core.discovery(published);
  assert.equal(shown.structure_changed, true, 'Discovery offers "Update"');
  assert.doesNotThrow(() => core.saveDevice(shown));
  // Same feature external_ids as before: poll and onSetValue are unchanged.
  assert.deepEqual(poeIds(core.created.get(shown.external_id)), poeIds(v152PoeSwitch(gladys)));
});

test('a failing GET /device falls back on the devices the SDK last knew', async () => {
  const gladys = createFakeGladys();
  coreAfterV152(gladys);
  gladys.getDevicesError = new Error('socket hang up');

  assert.deepEqual([...(await findLegacyPoeSwitchMacs(gladys))], [MAC]);

  const published = await buildDiscoveredDevices(gladys, config, unifiClient);
  assert.equal(published.length, 2);
});

test('only the "Switch PoE" device of the same hardware counts', async () => {
  const gladys = createFakeGladys();
  gladys.devices = [
    { external_id: gladys.externalIds('poe-switch', OTHER_MAC).device },
    { external_id: gladys.externalIds('gateway', MAC).device },
    { external_id: gladys.externalIds('poe-switch', MAC.toUpperCase()).device },
  ];
  assert.deepEqual([...(await findLegacyPoeSwitchMacs(gladys))], [OTHER_MAC, MAC]);

  gladys.devices = [{ external_id: gladys.externalIds('poe-switch', OTHER_MAC).device }];
  const published = await buildDiscoveredDevices(gladys, config, unifiClient);
  assert.equal(published.length, 1);
  assert.equal(poeIds(published[0]).length, 2);
});

test('legacyPoeSwitchBlueprint.macOf recognizes only its own external_ids', () => {
  const gladys = createFakeGladys();
  assert.equal(
    legacyPoeSwitchBlueprint.macOf(gladys, gladys.externalIds('poe-switch', MAC).device),
    MAC,
  );
  assert.equal(
    legacyPoeSwitchBlueprint.macOf(gladys, gladys.externalIds('gateway', MAC).device),
    null,
  );
  assert.equal(legacyPoeSwitchBlueprint.macOf(gladys, gladys.externalId('poe-switch:')), null);
  assert.equal(legacyPoeSwitchBlueprint.macOf(gladys, undefined), null);
});
