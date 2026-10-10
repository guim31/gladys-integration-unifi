// States are published only for the devices created in Gladys, and only on a
// change (plus the "present" heartbeat). Before, every poll published the
// presence and the two access features of every known client: ~90 states a
// cycle for 30 clients, near the core's ceiling of 300 a minute.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatePublisher, PRESENCE_HEARTBEAT_MS } from '../src/statePublisher.js';
import { createPoller } from '../src/poller.js';
import { clientBlueprint } from '../src/devices/clientPresence.js';
import { gatewayBlueprint } from '../src/devices/gateway.js';
import { emptySnapshot } from '../src/widgets.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

// Fictitious clients (locally administered MACs).
const mac = (i) => `02:00:00:00:00:${String(i).padStart(2, '0')}`;
const clients = Array.from({ length: 30 }, (_, i) => ({
  mac: mac(i + 1),
  name: `Client ${i + 1}`,
}));
const gatewayHw = { mac: '02:00:00:00:01:00', name: 'Gateway', type: 'ucg', state: 1 };

function setup({ active = clients, rates = { rx: 125000, tx: 25000 } } = {}) {
  const gladys = createFakeGladys();
  let now = 1_000_000;
  const publisher = createStatePublisher(gladys, { now: () => now });
  const unifi = {
    active,
    rates,
    getClients: async () => unifi.active,
    getKnownClients: async () => clients.map((c) => ({ ...c, blocked: false })),
    getDevices: async () => [
      {
        ...gatewayHw,
        stat: { gw: { wan_rx_bytes_r: unifi.rates.rx, wan_tx_bytes_r: unifi.rates.tx } },
      },
    ],
    getWlans: async () => [],
    getHealth: async () => ({ data: [] }),
  };
  const snapshot = emptySnapshot();
  const poller = createPoller({
    gladys,
    publisher,
    getUnifiClient: () => unifi,
    getConfig: () => ({}),
    getSnapshot: () => snapshot,
  });
  // The user added 2 of the 30 clients.
  gladys.devices = [
    clientBlueprint.buildDevice(gladys, clients[0]),
    clientBlueprint.buildDevice(gladys, clients[1]),
  ];
  const cycle = async () => {
    gladys.published.length = 0;
    await poller.pollAllStates();
    return [...gladys.published];
  };
  return { gladys, publisher, poller, unifi, snapshot, cycle, tick: (ms) => (now += ms) };
}

test('one cycle with 30 clients, 2 added: 4 states, none for the others', async () => {
  const { gladys, cycle, snapshot } = setup();
  const published = await cycle();

  assert.deepEqual(published.map((p) => p.featureExternalId).sort(), [
    gladys.externalId(`client:${mac(1)}:access`),
    gladys.externalId(`client:${mac(1)}:presence`),
    gladys.externalId(`client:${mac(2)}:access`),
    gladys.externalId(`client:${mac(2)}:presence`),
  ]);
  // The widgets still see every client.
  assert.equal(snapshot.clients.length, 30);
});

test('the same cycle used to publish 90 states (every known client)', async () => {
  const { gladys, poller } = setup();
  // What the integration did before: publish everything, every time.
  const everything = { publish: (id, value) => gladys.publishState(id, value) };
  const old = createPoller({
    gladys,
    publisher: everything,
    getUnifiClient: () => ({
      getClients: async () => clients,
      getKnownClients: async () => clients.map((c) => ({ ...c, blocked: false })),
      getDevices: async () => [],
      getWlans: async () => [],
      getHealth: async () => ({ data: [] }),
    }),
    getConfig: () => ({}),
    getSnapshot: () => emptySnapshot(),
  });
  await old.pollAllStates();
  // 30 presence + 30 access + 30 legacy access.
  assert.equal(gladys.published.length, 90);
  poller.clearTimers();
});

test('an unchanged cycle publishes nothing; "present" again after a minute', async () => {
  const { gladys, cycle, tick } = setup();
  await cycle();

  assert.deepEqual(await cycle(), []);

  tick(PRESENCE_HEARTBEAT_MS);
  // The "Check presence" scene action reads last_value_changed: "present"
  // is published again, the access switches are not.
  assert.deepEqual((await cycle()).map((p) => p.featureExternalId).sort(), [
    gladys.externalId(`client:${mac(1)}:presence`),
    gladys.externalId(`client:${mac(2)}:presence`),
  ]);
});

test('a client leaving publishes 0 once', async () => {
  const { gladys, unifi, cycle, tick } = setup();
  await cycle();

  unifi.active = clients.slice(1);
  assert.deepEqual(await cycle(), [
    { featureExternalId: gladys.externalId(`client:${mac(1)}:presence`), state: 0 },
  ]);
  tick(PRESENCE_HEARTBEAT_MS);
  // "Absent" has no heartbeat (as the lan-manager service of the core).
  assert.deepEqual(
    (await cycle()).filter((p) => p.featureExternalId.includes(mac(1))),
    [],
  );
});

test('a device added in Gladys gets its states at the next cycle', async () => {
  const { gladys, cycle, unifi } = setup();
  await cycle();

  // The SDK replaces gladys.devices on the device-created event.
  gladys.devices = [...gladys.devices, gatewayBlueprint.buildDevice(gladys, gatewayHw)];
  const published = await cycle();
  assert.deepEqual(published, [
    { featureExternalId: gladys.externalId(`gateway:${gatewayHw.mac}:status`), state: 1 },
    { featureExternalId: gladys.externalId(`gateway:${gatewayHw.mac}:wan-down`), state: 1 },
    { featureExternalId: gladys.externalId(`gateway:${gatewayHw.mac}:wan-up`), state: 0 },
  ]);

  // The WAN rates are published when they change, only.
  unifi.rates = { rx: 125000, tx: 250000 };
  assert.deepEqual(await cycle(), [
    { featureExternalId: gladys.externalId(`gateway:${gatewayHw.mac}:wan-up`), state: 2 },
  ]);
});

test('forget() and reset() publish the next values again', async () => {
  const { gladys, publisher, cycle } = setup();
  await cycle();

  publisher.forget([gladys.externalId(`client:${mac(2)}:access`)]);
  assert.deepEqual(await cycle(), [
    { featureExternalId: gladys.externalId(`client:${mac(2)}:access`), state: 1 },
  ]);

  publisher.reset();
  assert.equal((await cycle()).length, 4);
});

test('a command state is published even before the device list caught up', async () => {
  const gladys = createFakeGladys();
  const publisher = createStatePublisher(gladys);
  const id = gladys.externalId(`client:${mac(9)}:access`);

  assert.equal(await publisher.publish(id, 0), false);
  assert.equal(await publisher.publish(id, 0, { force: true }), true);
  assert.deepEqual(gladys.published, [{ featureExternalId: id, state: 0 }]);
});

test('a failing publishState is retried at the next cycle, never thrown', async () => {
  const { gladys, cycle } = setup();
  const original = gladys.publishState;
  gladys.publishState = async () => {
    throw new Error('HTTP 429');
  };
  await cycle();

  gladys.publishState = original;
  assert.equal((await cycle()).length, 4);
});
