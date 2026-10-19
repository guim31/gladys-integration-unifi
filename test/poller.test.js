// The poll runs on the container's own timer: Gladys 5.2.0 never polls the
// devices of this integration (GladysAssistant/Gladys#3198). `onPoll` stays as
// a fallback that does nothing while the timer runs. And a normal cycle (or a
// WebSocket event) writes nothing at the info level; a failing poll is logged
// once, its recovery once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatePublisher } from '../src/statePublisher.js';
import { createPoller, POLL_INTERVAL_MS } from '../src/poller.js';
import { clientBlueprint } from '../src/devices/clientPresence.js';
import { gatewayBlueprint } from '../src/devices/gateway.js';
import { emptySnapshot } from '../src/widgets.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const client = { mac: '02:00:00:00:00:01', name: 'Phone' };
const gatewayHw = { mac: '02:00:00:00:01:00', name: 'Gateway', type: 'ucg', state: 1 };

function setup({ delay = 1 } = {}) {
  const gladys = createFakeGladys();
  const publisher = createStatePublisher(gladys);
  const unifi = {
    calls: 0,
    failure: null,
    active: [client],
    async getClients() {
      unifi.calls += 1;
      if (unifi.failure) {
        throw unifi.failure;
      }
      return unifi.active;
    },
    getKnownClients: async () => [{ ...client, blocked: false }],
    getDevices: async () => [
      { ...gatewayHw, stat: { gw: { wan_rx_bytes_r: 125000, wan_tx_bytes_r: 25000 } } },
    ],
    getWlans: async () => [{ _id: 'wlan1', name: 'Home', enabled: true }],
    getHealth: async () => ({ data: [{ subsystem: 'wan', status: 'ok' }] }),
  };
  const snapshot = emptySnapshot();
  const poller = createPoller({
    gladys,
    publisher,
    getUnifiClient: () => unifi,
    getConfig: () => ({ presence_offline_delay: delay }),
    getSnapshot: () => snapshot,
  });
  gladys.devices = [
    clientBlueprint.buildDevice(gladys, client),
    gatewayBlueprint.buildDevice(gladys, gatewayHw),
  ];
  return { gladys, poller, unifi };
}

/** The lines the SDK logger writes (info/debug on stdout, warn/error on stderr). */
function captureLogs(t) {
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  const previous = process.env.LOG_LEVEL;
  delete process.env.LOG_LEVEL;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  return {
    at: (level) => lines.filter((l) => l.includes(`[${level.toUpperCase()}]`)),
  };
}

/** Let the pending promises of a poll settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('the internal timer polls every 30 s, without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { poller, unifi } = setup();
  poller.start();
  assert.equal(POLL_INTERVAL_MS, 30000);
  assert.equal(poller.isRunning(), true);

  t.mock.timers.tick(POLL_INTERVAL_MS - 1);
  await settle();
  assert.equal(unifi.calls, 0);

  t.mock.timers.tick(1);
  await settle();
  assert.equal(unifi.calls, 1);

  t.mock.timers.tick(POLL_INTERVAL_MS);
  await settle();
  assert.equal(unifi.calls, 2);

  poller.stop();
  t.mock.timers.tick(POLL_INTERVAL_MS * 3);
  await settle();
  assert.equal(unifi.calls, 2);
  assert.equal(poller.isRunning(), false);
});

test('onPoll is a fallback: nothing while the timer runs, a poll otherwise', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { poller, unifi } = setup();

  // No timer (the connection to the console failed): Gladys's poll polls.
  await poller.onCorePoll();
  assert.equal(unifi.calls, 1);

  // The timer runs: one poll covers every device, Gladys's polls are ignored.
  poller.start();
  await poller.onCorePoll();
  await poller.onCorePoll();
  assert.equal(unifi.calls, 1);

  poller.clearTimers();
  assert.equal(poller.isRunning(), false);
});

test('a normal cycle and the WebSocket events write nothing at the info level', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const logs = captureLogs(t);
  const { gladys, poller, unifi } = setup();

  await poller.pollAllStates();
  await poller.pollAllStates();
  // States were published (the cycle did its job)...
  assert.ok(gladys.published.length > 0);

  // ...a client leaves and comes back through the WebSocket...
  await poller.handleEvent({ key: 'EVT_WU_Disconnected', user: client.mac.toUpperCase() });
  t.mock.timers.tick(1000);
  await settle();
  await poller.handleEvent({ key: 'EVT_WU_Connected', user: client.mac });
  unifi.active = [];
  await poller.pollAllStates();

  // ...and not a single line at info, warn or error.
  assert.deepEqual(logs.at('info'), []);
  assert.deepEqual(logs.at('warn'), []);
  assert.deepEqual(logs.at('error'), []);
  poller.clearTimers();
});

test('a failing poll is logged once, its recovery once', async (t) => {
  const logs = captureLogs(t);
  const { poller, unifi } = setup();

  unifi.failure = new Error('connect ECONNREFUSED');
  await poller.pollAllStates();
  await poller.pollAllStates();
  await poller.pollAllStates();
  assert.equal(logs.at('warn').length, 1);
  assert.match(logs.at('warn')[0], /ECONNREFUSED/);

  unifi.failure = null;
  await poller.pollAllStates();
  await poller.pollAllStates();
  assert.equal(logs.at('info').length, 1);
  assert.match(logs.at('info')[0], /works again/);

  // A new failure is logged again.
  unifi.failure = new Error('timeout of 10000ms exceeded');
  await poller.pollAllStates();
  assert.equal(logs.at('warn').length, 2);
});

test('the WebSocket events still drive the presence', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { gladys, poller } = setup();
  const presence = gladys.externalId(`client:${client.mac}:presence`);
  const last = () => gladys.published.filter((p) => p.featureExternalId === presence).at(-1);

  await poller.handleEvent({ key: 'EVT_LU_Connected', user: client.mac.toUpperCase() });
  assert.equal(last().state, 1);

  await poller.handleEvent({ key: 'EVT_LU_Disconnected', user: client.mac });
  assert.equal(last().state, 1);
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(last().state, 0);

  // Unknown or incomplete events are ignored.
  await poller.handleEvent({ key: 'EVT_AP_Restarted', user: client.mac });
  await poller.handleEvent({ key: 'EVT_WU_Connected' });
  await poller.handleEvent(null);
  assert.equal(last().state, 0);
  poller.clearTimers();
});

test('an offline delay of 0 means absent at once, not the 120 s default (t/10426/68)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { gladys, poller } = setup({ delay: 0 });
  const presence = gladys.externalId(`client:${client.mac}:presence`);
  const last = () => gladys.published.filter((p) => p.featureExternalId === presence).at(-1);
  await poller.handleEvent({ key: 'EVT_WU_Connected', user: client.mac });
  await poller.handleEvent({ key: 'EVT_WU_Disconnected', user: client.mac });
  t.mock.timers.tick(0);
  await settle();
  assert.equal(last().state, 0);
  poller.clearTimers();
});
