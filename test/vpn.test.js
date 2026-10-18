// The WireGuard server of the gateway (forum t/10426/57): recognized in
// `rest/networkconf`, its clients among the active clients by their IP in the
// VPN subnet; its states, its scene events, its device and its widget.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createStatePublisher } from '../src/statePublisher.js';
import { createPoller, TRIGGERS } from '../src/poller.js';
import { vpnServerBlueprint } from '../src/devices/vpnServer.js';
import { buildVpnContent, emptySnapshot } from '../src/widgets.js';
import { inSubnet, isWireGuardServer, vpnClientsOf } from '../src/vpn.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const VPN = {
  _id: '65f0c0ffee0000000000000a',
  name: 'Maison',
  purpose: 'remote-user-vpn',
  vpn_type: 'wireguard-server',
  enabled: true,
  ip_subnet: '192.168.3.1/24',
  x_wireguard_private_key: 'never-shown',
};
const LAN = { _id: 'lan', name: 'Default', purpose: 'corporate', ip_subnet: '192.168.1.1/24' };
const PHONE = { mac: '02:00:00:00:00:01', name: 'Phone', ip: '192.168.1.20' };
const LAPTOP = {
  mac: '02:00:00:00:00:09',
  name: 'Laptop (192.168.3.2)',
  ip: '192.168.3.2',
  tx_bytes: 12_000_000,
  rx_bytes: 3_000_000,
};
const ids = (gladys) => gladys.externalIds('vpn', VPN._id);

test('the WireGuard server and its clients are recognized', () => {
  assert.ok(isWireGuardServer(VPN));
  assert.ok(!isWireGuardServer(LAN));
  assert.ok(!isWireGuardServer({ ...VPN, vpn_type: 'openvpn-server' }));
  assert.ok(inSubnet('192.168.3.200', '192.168.3.1/24'));
  assert.ok(!inSubnet('192.168.4.2', '192.168.3.1/24'));
  assert.ok(!inSubnet('garbage', '192.168.3.1/24'));
  assert.deepEqual(vpnClientsOf(VPN, [PHONE, LAPTOP]), [LAPTOP]);
  // Or by the network of the client, when the console gives it.
  const other = { mac: 'x', ip: '10.0.0.5', network_id: VPN._id };
  assert.deepEqual(vpnClientsOf(VPN, [other]), [other]);
});

test('the VPN device: a switch read-only unless allowed, and a counter', () => {
  const gladys = createFakeGladys();
  const device = vpnServerBlueprint.buildDevice(gladys, VPN);
  assert.equal(device.external_id, ids(gladys).device);
  assert.equal(device.name, 'VPN WireGuard : Maison');
  assert.equal(device.should_poll, false);
  const state = device.features.find((f) => f.external_id === ids(gladys).feature('state'));
  assert.equal(state.read_only, true);
  const allowed = vpnServerBlueprint.buildDevice(gladys, VPN, { allowControl: true });
  assert.equal(allowed.features[0].read_only, false);
  assert.ok(!JSON.stringify(device).includes('never-shown'));
});

function setup() {
  const gladys = createFakeGladys();
  const publisher = createStatePublisher(gladys);
  const unifi = {
    active: [PHONE],
    networks: [LAN, VPN],
    getClients: async () => unifi.active,
    getKnownClients: async () => [],
    getDevices: async () => [],
    getWlans: async () => [],
    getHealth: async () => ({ data: [] }),
    getNetworks: async () => unifi.networks,
  };
  const snapshot = emptySnapshot();
  let changes = 0;
  const poller = createPoller({
    gladys,
    publisher,
    getUnifiClient: () => unifi,
    getConfig: () => ({ presence_offline_delay: 1 }),
    getSnapshot: () => snapshot,
    onVpnChanged: () => {
      changes += 1;
    },
  });
  gladys.devices = [vpnServerBlueprint.buildDevice(gladys, VPN)];
  return { gladys, unifi, poller, snapshot, changes: () => changes };
}

const last = (gladys, id) =>
  gladys.published.filter((p) => p.featureExternalId === id).at(-1)?.state;

test('poll: state and clients published; one event per client that comes or goes', async () => {
  const w = setup();
  await w.poller.pollAllStates();
  assert.equal(last(w.gladys, ids(w.gladys).feature('state')), 1);
  assert.equal(last(w.gladys, ids(w.gladys).feature('clients')), 0);
  assert.deepEqual(w.snapshot.vpns, [VPN]);
  assert.equal(w.gladys.sceneEvents.length, 0, 'no event at the first reading');

  w.unifi.active = [PHONE, LAPTOP];
  await w.poller.pollAllStates();
  assert.equal(last(w.gladys, ids(w.gladys).feature('clients')), 1);
  assert.deepEqual(w.gladys.sceneEvents, [
    {
      key: TRIGGERS.VPN_CONNECTED,
      data: { vpn_device: ids(w.gladys).device, vpn: 'Maison', client: 'Laptop (192.168.3.2)' },
    },
  ]);
  w.unifi.active = [PHONE];
  await w.poller.pollAllStates();
  assert.equal(w.gladys.sceneEvents.at(-1).key, TRIGGERS.VPN_DISCONNECTED);
  // Turned off in UniFi: state 0, nobody connected.
  w.unifi.networks = [{ ...VPN, enabled: false }];
  await w.poller.pollAllStates();
  assert.equal(last(w.gladys, ids(w.gladys).feature('state')), 0);
  assert.ok(w.changes() >= 3, 'the widget is refreshed on each change');
});

test('widget: state, clients with their traffic, buttons only when allowed', () => {
  const gladys = createFakeGladys();
  const externalIds = (type, id) => gladys.externalIds(type, id);
  const snapshot = { ...emptySnapshot(), polled: true, vpns: [VPN], clients: [PHONE, LAPTOP] };
  const content = buildVpnContent({ snapshot, externalIds });
  assert.deepEqual(validateWidgetContent(content), []);
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items[1].value, 1);
  assert.equal(status.items[2].label, 'Laptop', 'no address on a dashboard');
  assert.equal(status.items[2].value.fr, '↓ 12 Mo · ↑ 3 Mo');
  assert.equal(content.components.filter((c) => c.type === 'button').length, 0);
  const allowed = buildVpnContent({ snapshot, externalIds, allowControl: true });
  const buttons = allowed.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => [b.device_feature, b.value]),
    [
      [ids(gladys).feature('state'), 1],
      [ids(gladys).feature('state'), 0],
    ],
  );
  const none = buildVpnContent({ snapshot: { ...snapshot, vpns: [] }, externalIds });
  assert.match(none.components[0].text.fr, /Aucun serveur WireGuard/);
});

test('a VPN peer without MAC does not stop the poll, and still counts', async () => {
  const w = setup();
  w.unifi.active = [PHONE, { name: 'Tablet', ip: '192.168.3.7' }];
  await w.poller.pollAllStates();
  assert.equal(last(w.gladys, ids(w.gladys).feature('clients')), 1);
});

test('widget: a setting that is not a VPN server says so, not another server', () => {
  const gladys = createFakeGladys();
  const externalIds = (type, id) => gladys.externalIds(type, id);
  const snapshot = { ...emptySnapshot(), polled: true, vpns: [VPN], clients: [] };
  const content = buildVpnContent({
    snapshot,
    externalIds,
    settings: { network: gladys.externalIds('gateway', 'aa:bb').device },
  });
  assert.match(content.components[0].text.fr, /n'est pas un serveur VPN/);
  assert.equal(content.components.length, 1);
});

test('diagnostic: shapes and keys only, never a value', async () => {
  const { vpnDiagnostic, shapeOf } = await import('../src/vpnDiagnostic.js');
  assert.equal(shapeOf({ data: [{ b: 1, a: 'secret' }] }), '1 item(s): a, b');
  const report = await vpnDiagnostic({
    getNetworks: async () => [VPN, LAN],
    getClients: async () => [PHONE, LAPTOP],
    request: async (method, path) => {
      if (path.includes('remoteuservpn')) {
        return { data: [{ peer_name: 'Nantes', remote_ip: '203.0.113.9' }] };
      }
      throw Object.assign(new Error('nope'), { response: { status: 404 } });
    },
  });
  assert.match(report, /WireGuard servers: 1; active clients \(stat\/sta\): 2/);
  assert.match(report, /in subnet: 1, same network_id: 0/);
  assert.match(report, /stat\/remoteuservpn: 1 item\(s\): peer_name, remote_ip/);
  assert.match(report, /wireguard\/<id>\/users: HTTP 404/);
  for (const secret of ['never-shown', '203.0.113.9', '192.168.3.2', 'Laptop', VPN._id]) {
    assert.ok(!report.includes(secret), secret);
  }
});

test('UDR7 of t/10426/62: clients from stat/remoteuservpn, named after the peers', async () => {
  const NANTES = {
    ...VPN,
    _id: 'srv-nantes',
    name: 'WireGuard Nantes',
    ip_subnet: '192.168.5.1/24',
  };
  const LIEGE = { ...VPN, _id: 'srv-liege', name: 'WireGuard Liege', ip_subnet: '192.168.6.1/24' };
  const connection = {
    id: 'c1',
    network_id: 'srv-nantes',
    user: 'peer-ux',
    peer_id: 'peer-ux',
    tunnel_ip: '192.168.5.2',
    rx_bytes: 5_000_000,
    tx_bytes: 40_000_000,
    up: true,
    vpn_type: 'wireguard-server',
  };
  const w = setup();
  w.unifi.networks = [NANTES, LIEGE];
  w.gladys.devices = [NANTES, LIEGE].map((n) => vpnServerBlueprint.buildDevice(w.gladys, n));
  w.unifi.active = [PHONE];
  w.unifi.getVpnConnections = async () => [];
  w.unifi.getWireguardUsers = async (id) =>
    id === 'srv-nantes'
      ? [{ _id: 'peer-ux', name: 'UX Nantes', network_id: 'srv-nantes' }]
      : [{ _id: 'peer-udr', name: 'UDR Liège', network_id: 'srv-liege' }];
  await w.poller.pollAllStates();
  w.unifi.getVpnConnections = async () => [connection];
  await w.poller.pollAllStates();
  const nantes = w.gladys.externalIds('vpn', 'srv-nantes');
  const liege = w.gladys.externalIds('vpn', 'srv-liege');
  assert.equal(last(w.gladys, nantes.feature('clients')), 1);
  assert.equal(last(w.gladys, liege.feature('clients')), 0);
  assert.deepEqual(w.gladys.sceneEvents, [
    {
      key: TRIGGERS.VPN_CONNECTED,
      data: { vpn_device: nantes.device, vpn: 'WireGuard Nantes', client: 'UX Nantes' },
    },
  ]);
  const content = buildVpnContent({
    snapshot: w.snapshot,
    externalIds: (type, id) => w.gladys.externalIds(type, id),
    settings: { network: nantes.device },
  });
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.equal(rows[1].value, 1);
  assert.equal(rows[2].label, 'UX Nantes');
  assert.equal(rows[2].value.fr, '↓ 40 Mo · ↑ 5 Mo');
  // Gone: one event, the count back to 0.
  w.unifi.getVpnConnections = async () => [{ ...connection, up: false }];
  await w.poller.pollAllStates();
  assert.equal(last(w.gladys, nantes.feature('clients')), 0);
  assert.equal(w.gladys.sceneEvents.at(-1).key, TRIGGERS.VPN_DISCONNECTED);
});
