// -----------------------------------------------------------------------------
// Dashboard widget contents: built from a poll snapshot, validated against
// the core vocabulary and budget (validateWidgetContent returns [] when the
// core renders a content exactly as sent).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  DEFAULT_NETWORK_INTERVAL,
  WIDGET,
  buildNetworkContent,
  buildPresenceContent,
  buildWifiContent,
  clientMacOf,
  emptySnapshot,
  isGatewayDevice,
  pickGateway,
  pickWlan,
  presenceRows,
  truncate,
  wlanBandOf,
  wlanSecurityOf,
} from '../src/widgets.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();
const externalIds = (type, id) => gladys.externalIds(type, id);

const MAC_PATTERN = /(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/i;
const PUBLIC_IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

const GATEWAY = {
  mac: '74:83:C2:11:22:33',
  name: 'Cloud Gateway Fiber',
  model: 'UCG-Fiber',
  type: 'ucg',
  state: 1,
  ip: '203.0.113.7',
};
const SWITCH = {
  mac: 'aa:bb:cc:00:11:22',
  name: 'USW Lite 8',
  model: 'USW-Lite-8-PoE',
  type: 'usw',
  state: 1,
};
const AP = { mac: 'aa:bb:cc:00:11:33', name: 'U6 Pro', model: 'U6-Pro', type: 'uap', state: 0 };

const CLIENTS = [
  { mac: '11:11:11:11:11:11', is_wired: false, essid: 'Maison' },
  { mac: '22:22:22:22:22:22', is_wired: false, essid: 'Maison' },
  { mac: '33:33:33:33:33:33', is_wired: false, essid: 'Invités', is_guest: true },
  { mac: '44:44:44:44:44:44', is_wired: true },
];
const WLANS = [
  {
    _id: 'abc123',
    name: 'Maison',
    enabled: true,
    security: 'wpapsk',
    wpa_mode: 'wpa2',
    wlan_band: 'both',
  },
  {
    _id: 'def456',
    name: 'Invités',
    enabled: false,
    is_guest: true,
    security: 'open',
    wlan_band: '5g',
  },
];
const HEALTH = [
  { subsystem: 'wan', status: 'ok' },
  { subsystem: 'lan', status: 'ok' },
  { subsystem: 'wlan', status: 'ok' },
  { subsystem: 'www', status: 'ok' },
];

const snapshot = (overrides = {}) => ({
  polled: true,
  clients: CLIENTS,
  devices: [GATEWAY, SWITCH, AP],
  wlans: WLANS,
  health: HEALTH,
  ...overrides,
});

/** Every text the dashboard displays (labels, values, texts, titles). */
function displayedTexts(content) {
  const out = [];
  const push = (value) => {
    if (typeof value === 'string') {
      out.push(value);
    } else if (value && typeof value === 'object') {
      out.push(...Object.values(value).filter((v) => typeof v === 'string'));
    }
  };
  for (const component of content.components) {
    for (const key of ['text', 'label', 'value', 'title', 'unit']) {
      push(component[key]);
    }
    for (const item of component.items ?? []) {
      push(item.label);
      push(item.value);
    }
  }
  return out;
}

function assertSafe(content) {
  assert.deepEqual(validateWidgetContent(content), []);
  for (const text of displayedTexts(content)) {
    assert.doesNotMatch(text, MAC_PATTERN, `a MAC address is displayed: ${text}`);
    assert.doesNotMatch(text, PUBLIC_IP, `an IP address is displayed: ${text}`);
  }
}

const byType = (content, type) => content.components.filter((c) => c.type === type);

// --- helpers -----------------------------------------------------------------

test('isGatewayDevice recognizes gateways by type, model or flag, not switches nor APs', () => {
  assert.equal(isGatewayDevice(GATEWAY), true);
  assert.equal(isGatewayDevice({ type: 'udm', mac: 'x' }), true);
  assert.equal(isGatewayDevice({ type: 'usw', model: 'USG-3P' }), true);
  assert.equal(isGatewayDevice({ type: 'usw', model: 'USW-24', is_gateway: true }), true);
  assert.equal(isGatewayDevice(SWITCH), false);
  assert.equal(isGatewayDevice(AP), false);
  assert.equal(isGatewayDevice(null), false);
});

test('clientMacOf reads the MAC of a client device only', () => {
  assert.equal(clientMacOf('unifi:client:AA:BB:CC:DD:EE:FF'), 'aa:bb:cc:dd:ee:ff');
  assert.equal(clientMacOf('ext:unifi:client:aa:bb:cc:dd:ee:ff'), 'aa:bb:cc:dd:ee:ff');
  assert.equal(clientMacOf('ext:unifi:client-internet:aa:bb:cc:dd:ee:ff'), null);
  assert.equal(clientMacOf('ext:unifi:gateway:aa:bb:cc:dd:ee:ff'), null);
  assert.equal(clientMacOf('ext:unifi:wifi:abc123'), null);
  assert.equal(clientMacOf(undefined), null);
});

test('truncate keeps short texts and cuts long ones with an ellipsis', () => {
  assert.equal(truncate('  Salon  ', 10), 'Salon');
  assert.equal(truncate('abcdefghij', 10), 'abcdefghij');
  assert.equal(truncate('abcdefghijk', 10), 'abcdefghi…');
  assert.equal(truncate(null, 5), '');
});

test('pickGateway honors the setting, falls back to the first gateway', () => {
  const second = { ...GATEWAY, mac: 'ff:ff:ff:ff:ff:ff', name: 'Backup' };
  const snap = snapshot({ devices: [SWITCH, GATEWAY, second] });
  assert.equal(pickGateway(snap, undefined, externalIds), GATEWAY);
  assert.equal(pickGateway(snap, '', externalIds), GATEWAY);
  assert.equal(
    pickGateway(snap, externalIds('gateway', 'ff:ff:ff:ff:ff:ff').device, externalIds),
    second,
  );
  // A chosen device that is not a gateway (a switch): the first gateway.
  assert.equal(pickGateway(snap, externalIds('gateway', SWITCH.mac).device, externalIds), GATEWAY);
  assert.equal(pickGateway(snapshot({ devices: [SWITCH, AP] }), undefined, externalIds), null);
});

test('pickWlan honors the setting, falls back to the first WLAN', () => {
  const snap = snapshot();
  assert.equal(pickWlan(snap, undefined, externalIds), WLANS[0]);
  assert.equal(pickWlan(snap, externalIds('wifi', 'def456').device, externalIds), WLANS[1]);
  assert.equal(pickWlan(snap, 'unifi:wifi:unknown', externalIds), WLANS[0]);
  assert.equal(pickWlan(snapshot({ wlans: [] }), undefined, externalIds), null);
});

test('wlanBandOf and wlanSecurityOf read what the controller gives, null otherwise', () => {
  assert.equal(wlanBandOf({ wlan_band: 'both' }), '2.4 / 5 GHz');
  assert.equal(wlanBandOf({ wlan_bands: ['2g', '6g'] }), '2.4 GHz / 6 GHz');
  assert.equal(wlanBandOf({}), null);
  assert.deepEqual(wlanSecurityOf({ security: 'open' }), { en: 'Open', fr: 'Ouvert' });
  assert.equal(wlanSecurityOf({ security: 'wpapsk', wpa_mode: 'wpa2' }), 'WPA2');
  assert.equal(
    wlanSecurityOf({ security: 'wpapsk', wpa_mode: 'wpa2', wpa3_support: true }),
    'WPA2 / WPA3',
  );
  assert.equal(
    wlanSecurityOf({ security: 'wpapsk', wpa_mode: 'wpa3', wpa3_support: true }),
    'WPA3',
  );
  assert.equal(wlanSecurityOf({ security: 'wpaeap', wpa_mode: 'wpa2' }), 'WPA2 Enterprise');
  assert.equal(wlanSecurityOf({}), null);
});

// --- network -----------------------------------------------------------------

test('network: live WAN tiles and chart bound to the gateway features, counts, status', () => {
  const content = buildNetworkContent({ snapshot: snapshot(), settings: {}, externalIds });
  assertSafe(content);
  assert.equal(content.ttl_seconds, 60);
  assert.equal(content.components.length, 6);

  const ids = externalIds('gateway', '74:83:c2:11:22:33');
  const tiles = byType(content, 'value');
  assert.equal(tiles.length, 4);
  assert.equal(tiles[0].device_feature, ids.feature('wan-down'));
  assert.equal(tiles[0].icon, 'arrow-down');
  assert.equal(tiles[1].device_feature, ids.feature('wan-up'));
  assert.equal(tiles[1].icon, 'arrow-up');
  assert.equal(tiles[2].value, 4);
  assert.equal(tiles[2].icon, 'smartphone');
  assert.equal(tiles[3].value, '2 / 3');
  assert.equal(tiles[3].icon, 'server');

  const [chart] = byType(content, 'chart');
  assert.deepEqual(chart.device_features, [ids.feature('wan-down'), ids.feature('wan-up')]);
  assert.equal(chart.interval, DEFAULT_NETWORK_INTERVAL);
  assert.equal(chart.unit, 'Mbps');

  const [status] = byType(content, 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label.en, item.value, item.color]),
    [
      ['Internet', { en: 'OK', fr: 'OK' }, 'success'],
      ['Wi-Fi', 3, 'info'],
      ['Wired', 1, 'info'],
      ['Guests', 1, 'info'],
      ['Offline', 1, 'warning'],
    ],
  );
  assert.ok(content.components.every((c) => c.style !== 'primary'));
});

test('network: the gateway setting picks the gateway, the interval setting the chart window', () => {
  const second = { ...GATEWAY, mac: 'ff:ff:ff:ff:ff:ff', name: 'Backup' };
  const content = buildNetworkContent({
    snapshot: snapshot({ devices: [GATEWAY, second] }),
    settings: {
      gateway: externalIds('gateway', 'ff:ff:ff:ff:ff:ff').device,
      interval: 'last-week',
    },
    externalIds,
  });
  assertSafe(content);
  const ids = externalIds('gateway', 'ff:ff:ff:ff:ff:ff');
  assert.equal(byType(content, 'value')[0].device_feature, ids.feature('wan-down'));
  assert.equal(byType(content, 'chart')[0].interval, 'last-week');
});

test('network: an unknown interval falls back to the default', () => {
  const content = buildNetworkContent({
    snapshot: snapshot(),
    settings: { interval: 'last-year' },
    externalIds,
  });
  assert.equal(byType(content, 'chart')[0].interval, DEFAULT_NETWORK_INTERVAL);
});

test('network: Internet is down (danger) or unknown (neutral) from the wan subsystem', () => {
  const down = buildNetworkContent({
    snapshot: snapshot({ health: [{ subsystem: 'wan', status: 'warning' }] }),
    externalIds,
  });
  assertSafe(down);
  assert.deepEqual(byType(down, 'status')[0].items[0].color, 'danger');
  const unknown = buildNetworkContent({ snapshot: snapshot({ health: [] }), externalIds });
  assertSafe(unknown);
  assert.deepEqual(byType(unknown, 'status')[0].items[0].color, 'neutral');
});

test('network: no guests row when nobody is a guest, offline row green when all is up', () => {
  const content = buildNetworkContent({
    snapshot: snapshot({ clients: CLIENTS.filter((c) => !c.is_guest), devices: [GATEWAY, SWITCH] }),
    externalIds,
  });
  assertSafe(content);
  const labels = byType(content, 'status')[0].items.map((item) => item.label.en);
  assert.deepEqual(labels, ['Internet', 'Wi-Fi', 'Wired', 'Offline']);
  assert.equal(byType(content, 'status')[0].items.at(-1).color, 'success');
  assert.equal(byType(content, 'value')[3].value, '2 / 2');
});

test('network: without a gateway, no WAN tiles nor chart but a caption, counts and status stay', () => {
  const content = buildNetworkContent({
    snapshot: snapshot({ devices: [SWITCH, AP] }),
    externalIds,
  });
  assertSafe(content);
  assert.equal(byType(content, 'chart').length, 0);
  assert.equal(byType(content, 'value').length, 2);
  assert.equal(byType(content, 'text').length, 1);
  assert.equal(byType(content, 'text')[0].variant, 'caption');
  assert.equal(byType(content, 'status').length, 1);
});

test('network: before the first poll, an explicit body text', () => {
  const content = buildNetworkContent({ snapshot: emptySnapshot(), externalIds });
  assertSafe(content);
  assert.deepEqual(
    content.components.map((c) => [c.type, c.variant]),
    [['text', 'body']],
  );
});

// --- presence ----------------------------------------------------------------

const device = (name, mac, lastValue) => ({
  name,
  external_id: gladys.externalIds('client', mac).device,
  features: [
    { external_id: gladys.externalIds('client', mac).feature('presence'), last_value: lastValue },
    { external_id: gladys.externalIds('client', mac).feature('access'), last_value: 1 },
  ],
});
const GLADYS_DEVICES = [
  device('Téléphone de Zoé', '11:11:11:11:11:11', 1),
  device('Ordinateur portable', '22:22:22:22:22:22', 0),
  device('Tablette', '33:33:33:33:33:33', 0),
  {
    name: 'Cloud Gateway Fiber',
    external_id: gladys.externalIds('gateway', '74:83:c2:11:22:33').device,
    features: [],
  },
  {
    name: 'Réseau Wi-Fi : Maison',
    external_id: gladys.externalIds('wifi', 'abc123').device,
    features: [],
  },
];

test('presenceRows: client devices only, live state over the stored one, present first then by name', () => {
  const presence = new Map([
    ['22:22:22:22:22:22', 1],
    ['11:11:11:11:11:11', 0],
  ]);
  const rows = presenceRows(GLADYS_DEVICES, presence);
  assert.deepEqual(
    rows.map((row) => [row.name, row.present]),
    [
      ['Ordinateur portable', true],
      ['Tablette', false],
      ['Téléphone de Zoé', false],
    ],
  );
});

test('presence: a tile n / N and one row per device, Gladys names, present in green', () => {
  const presence = new Map([['11:11:11:11:11:11', 1]]);
  const content = buildPresenceContent({ gladysDevices: GLADYS_DEVICES, presence, settings: {} });
  assertSafe(content);
  assert.equal(content.ttl_seconds, 30);
  assert.equal(content.components.length, 2);
  assert.equal(byType(content, 'value')[0].value, '1 / 3');
  const [status] = byType(content, 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value.fr, item.color, item.icon]),
    [
      ['Téléphone de Zoé', 'Présent', 'success', 'user-check'],
      ['Ordinateur portable', 'Absent', 'neutral', 'user-x'],
      ['Tablette', 'Absent', 'neutral', 'user-x'],
    ],
  );
});

test('presence: show = present lists the present only; nobody home is a body text', () => {
  const presence = new Map([['11:11:11:11:11:11', 1]]);
  const content = buildPresenceContent({
    gladysDevices: GLADYS_DEVICES,
    presence,
    settings: { show: 'present' },
  });
  assertSafe(content);
  assert.equal(byType(content, 'status')[0].items.length, 1);

  const nobody = buildPresenceContent({
    gladysDevices: GLADYS_DEVICES,
    presence: new Map(GLADYS_DEVICES.map((d) => [clientMacOf(d.external_id), 0])),
    settings: { show: 'present' },
  });
  assertSafe(nobody);
  assert.equal(byType(nobody, 'value')[0].value, '0 / 3');
  assert.equal(byType(nobody, 'status').length, 0);
  assert.equal(byType(nobody, 'text')[0].variant, 'body');
});

test('presence: beyond ten rows, a caption counts the others', () => {
  const many = Array.from({ length: 14 }, (_, i) =>
    device(
      `Appareil ${String(i + 1).padStart(2, '0')}`,
      `aa:aa:aa:aa:aa:${String(i).padStart(2, '0')}`,
      i % 2,
    ),
  );
  const content = buildPresenceContent({ gladysDevices: many, presence: new Map(), settings: {} });
  assertSafe(content);
  assert.equal(byType(content, 'value')[0].value, '7 / 14');
  assert.equal(byType(content, 'status')[0].items.length, 10);
  const [caption] = byType(content, 'text');
  assert.equal(caption.variant, 'caption');
  assert.deepEqual(caption.text, { en: '+ 4 more', fr: '+ 4 autres' });
});

test('presence: no client device in Gladys is an explicit body text, never an error', () => {
  const content = buildPresenceContent({
    gladysDevices: GLADYS_DEVICES.slice(3),
    presence: new Map(),
    settings: {},
  });
  assertSafe(content);
  assert.deepEqual(
    content.components.map((c) => [c.type, c.variant]),
    [['text', 'body']],
  );
  assertSafe(buildPresenceContent({ gladysDevices: [], presence: new Map() }));
});

test('presence: a long Gladys name is cut to the status label limit', () => {
  const long = device(
    'Un nom d’appareil vraiment beaucoup trop long pour la ligne',
    '11:11:11:11:11:11',
    1,
  );
  const content = buildPresenceContent({
    gladysDevices: [long],
    presence: new Map(),
    settings: {},
  });
  assertSafe(content);
  assert.ok(byType(content, 'status')[0].items[0].label.length <= 40);
});

// --- wifi --------------------------------------------------------------------

test('wifi: the SSID as heading, its state and clients, two device_feature buttons', () => {
  const content = buildWifiContent({ snapshot: snapshot(), settings: {}, externalIds });
  assertSafe(content);
  assert.equal(content.ttl_seconds, 30);
  assert.equal(byType(content, 'text')[0].text, 'Maison');
  assert.equal(byType(content, 'text')[0].variant, 'heading');
  const [status] = byType(content, 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label.en, item.value]),
    [
      ['State', { en: 'Enabled', fr: 'Activé' }],
      ['Connected clients', 2],
      ['Band', '2.4 / 5 GHz'],
      ['Security', 'WPA2'],
    ],
  );
  const buttons = byType(content, 'button');
  const stateFeature = externalIds('wifi', 'abc123').feature('state');
  assert.deepEqual(
    buttons.map((b) => [b.label.fr, b.icon, b.device_feature, b.value, b.style]),
    [
      ['Activer', 'wifi', stateFeature, 1, undefined],
      ['Désactiver', 'wifi-off', stateFeature, 0, undefined],
    ],
  );
});

test('wifi: the network setting picks the SSID; a disabled guest network', () => {
  const content = buildWifiContent({
    snapshot: snapshot(),
    settings: { network: externalIds('wifi', 'def456').device },
    externalIds,
  });
  assertSafe(content);
  assert.equal(byType(content, 'text')[0].text, 'Invités');
  const [status] = byType(content, 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label.en, item.value, item.color]),
    [
      ['State', { en: 'Disabled', fr: 'Désactivé' }, 'neutral'],
      ['Connected clients', 1, 'info'],
      ['Guest network', { en: 'Yes', fr: 'Oui' }, 'info'],
      ['Band', '5 GHz', undefined],
      ['Security', { en: 'Open', fr: 'Ouvert' }, undefined],
    ],
  );
  assert.equal(
    byType(content, 'button')[0].device_feature,
    externalIds('wifi', 'def456').feature('state'),
  );
});

test('wifi: a WLAN without _id uses its name as id, a bare WLAN shows state and clients only', () => {
  const content = buildWifiContent({
    snapshot: snapshot({ wlans: [{ name: 'IoT' }], clients: [] }),
    externalIds,
  });
  assertSafe(content);
  assert.equal(byType(content, 'status')[0].items.length, 2);
  assert.equal(
    byType(content, 'button')[0].device_feature,
    externalIds('wifi', 'IoT').feature('state'),
  );
});

test('wifi: no WLAN known (or no poll yet) is an explicit body text', () => {
  const none = buildWifiContent({ snapshot: snapshot({ wlans: [] }), externalIds });
  assertSafe(none);
  assert.deepEqual(
    none.components.map((c) => [c.type, c.variant]),
    [['text', 'body']],
  );
  const early = buildWifiContent({ snapshot: emptySnapshot(), externalIds });
  assertSafe(early);
  assert.notDeepEqual(early.components[0].text, none.components[0].text);
});

test('the widget keys are valid manifest keys', () => {
  for (const key of Object.values(WIDGET)) {
    assert.match(key, /^[a-z0-9_]{2,32}$/);
  }
});
