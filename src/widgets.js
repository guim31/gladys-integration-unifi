// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+), content builders — pure functions.
//
//   - network  : the home network at a glance: WAN throughput (two live tiles
//                and a chart bound to the gateway features), the active
//                clients, the UniFi hardware online, and a status list
//                (Internet, Wi-Fi / wired / guest clients, offline hardware);
//   - presence : who is home, from the client devices ADDED to Gladys (their
//                Gladys names), present first;
//   - wifi     : one SSID: its state, its clients, and two buttons bound to
//                its `state` feature (Enable / Disable) — the guest Wi-Fi case.
//
// Every builder reads a SNAPSHOT: the last poll kept in memory by index.js
// (active clients, UniFi hardware, WLANs, subsystem health). Rendering a
// widget never calls the UniFi controller.
//
// Gladys renders at most 8 components, 2 of them texts (1 body), 6 tiles,
// 1 focal (chart), 1 status (1–10 rows) and 4 buttons. A content never shows
// a MAC address nor a public IP: a dashboard can be public. No `primary`
// button style either: Gladys paints it like the others in dark mode.
// -----------------------------------------------------------------------------

import { WIDGET_CHART_INTERVALS, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isGatewayDevice } from './devices/gateway.js';

/** Widget keys, declared in the manifest `widgets` (forever: never rename). */
export const WIDGET = {
  NETWORK: 'network',
  PRESENCE: 'presence',
  WIFI: 'wifi',
};

/** The `interval` setting of the network widget (chart history window). */
export const NETWORK_INTERVALS = [
  WIDGET_CHART_INTERVALS.LAST_HOUR,
  WIDGET_CHART_INTERVALS.LAST_DAY,
  WIDGET_CHART_INTERVALS.LAST_WEEK,
];
export const DEFAULT_NETWORK_INTERVAL = WIDGET_CHART_INTERVALS.LAST_HOUR;

/** The `show` setting of the presence widget. */
export const PRESENCE_SHOW = ['all', 'present'];
export const DEFAULT_PRESENCE_SHOW = 'all';

// Gladys shows ten rows of a status list at most.
const MAX_STATUS_ROWS = 10;
// Text limits of the vocabulary (the core truncates beyond; we cut cleanly).
const MAX_HEADING = 40;
const MAX_STATUS_LABEL = 40;
const MAX_STATUS_VALUE = 40;
const MAX_TILE_VALUE = 12;

const T = {
  download: { en: 'Download', fr: 'Descendant' },
  upload: { en: 'Upload', fr: 'Montant' },
  clients: { en: 'Clients', fr: 'Clients' },
  devices: { en: 'Devices', fr: 'Équipements' },
  wanChart: { en: 'WAN throughput', fr: 'Débit WAN' },
  internet: { en: 'Internet', fr: 'Internet' },
  ok: { en: 'OK', fr: 'OK' },
  down: { en: 'Down', fr: 'Coupé' },
  degraded: { en: 'Degraded', fr: 'Dégradé' },
  unknown: { en: 'Unknown', fr: 'Inconnu' },
  wifiClients: { en: 'Wi-Fi', fr: 'Wi-Fi' },
  wiredClients: { en: 'Wired', fr: 'Filaire' },
  guests: { en: 'Guests', fr: 'Invités' },
  offline: { en: 'Offline', fr: 'Hors ligne' },
  noPollYet: {
    en: 'Waiting for the first UniFi poll: the data appears within a minute once the controller is reachable.',
    fr: 'En attente du premier relevé UniFi : les données apparaissent sous une minute dès que le contrôleur répond.',
  },
  noGateway: {
    en: 'No gateway found: WAN throughput needs a UniFi gateway (UCG, UDM, USG).',
    fr: 'Aucune passerelle : le débit WAN demande une passerelle UniFi (UCG, UDM, USG).',
  },
  present: { en: 'Present', fr: 'Présents' },
  presentOne: { en: 'Present', fr: 'Présent' },
  absent: { en: 'Absent', fr: 'Absent' },
  noClients: {
    en: 'No network client added to Gladys yet. Add your phones and devices from the Discovery tab of the integration: the widget lists them with their Gladys names.',
    fr: "Aucun client réseau ajouté à Gladys. Ajoutez vos téléphones et appareils depuis l'onglet Découverte de l'intégration : le widget les liste avec leurs noms Gladys.",
  },
  nobodyHome: { en: 'Nobody is home.', fr: 'Personne à la maison.' },
  others: (n) => ({ en: `+ ${n} more`, fr: `+ ${n} autres` }),
  device: { en: 'Device', fr: 'Appareil' },
  state: { en: 'State', fr: 'État' },
  enabled: { en: 'Enabled', fr: 'Activé' },
  disabled: { en: 'Disabled', fr: 'Désactivé' },
  connected: { en: 'Connected clients', fr: 'Clients connectés' },
  guestNetwork: { en: 'Guest network', fr: 'Réseau invités' },
  yes: { en: 'Yes', fr: 'Oui' },
  band: { en: 'Band', fr: 'Bande' },
  security: { en: 'Security', fr: 'Sécurité' },
  open: { en: 'Open', fr: 'Ouvert' },
  enable: { en: 'Enable', fr: 'Activer' },
  disable: { en: 'Disable', fr: 'Désactiver' },
  noWlan: {
    en: 'No Wi-Fi network known yet. Once the controller answers, add the SSID from the Discovery tab so the buttons can switch it.',
    fr: "Aucun réseau Wi-Fi connu. Dès que le contrôleur répond, ajoutez le SSID depuis l'onglet Découverte pour que les boutons puissent le commuter.",
  },
};

/** An empty snapshot: nothing polled yet. */
export function emptySnapshot() {
  return { polled: false, clients: [], devices: [], wlans: [], health: [] };
}

/**
 * The WLAN id the devices use as platform id (`wifi:<id>`): the controller's
 * `_id`, else the name.
 * @param {object} wlan a WLAN of `rest/wlanconf`
 */
export function wlanIdOf(wlan) {
  return String(wlan._id || wlan.name || 'default');
}

/**
 * The MAC of a Gladys client device (`…:client:<mac>`), or null for any
 * other device of the integration (hardware, WLAN, legacy internet switch).
 * @param {string} externalId the device external_id
 */
export function clientMacOf(externalId) {
  const match = String(externalId || '').match(/(?:^|:)client:((?:[0-9a-f]{2}:){5}[0-9a-f]{2})$/i);
  return match ? match[1].toLowerCase() : null;
}

// What getClientDisplayName() builds for a nameless client: "Apple
// (192.168.1.5)", "Samsung (ee:ff)", "Appareil 192.168.1.5 (ee:ff)",
// "Appareil (aa:bb:cc:dd:ee:ff)". A MAC fragment is only looked for inside
// parentheses (a bare "07:30" may be a time in a real name).
const IPV4 = String.raw`\d{1,3}(?:\.\d{1,3}){3}`;
const MAC = String.raw`(?:[0-9a-f]{2}:){5}[0-9a-f]{2}`;
const MAC_FRAGMENT = String.raw`(?:[0-9a-f]{2}:){1,5}[0-9a-f]{2}`;
const ADDRESS_IN_PARENS = new RegExp(
  String.raw`\s*\((?:[^()]*?(?:${IPV4}|${MAC_FRAGMENT}))[^()]*\)`,
  'gi',
);
const BARE_ADDRESS = new RegExp(String.raw`(?:^|\s)(?:${IPV4}|${MAC})(?=\s|$)`, 'gi');

/**
 * A device name fit for a public dashboard: the IP and MAC fragments that
 * getClientDisplayName() adds to a nameless client are removed, and a name
 * that was only an address becomes empty (the caller shows a neutral word).
 * @param {unknown} name the Gladys device name
 */
export function publicName(name) {
  return String(name ?? '')
    .replace(ADDRESS_IN_PARENS, '')
    .replace(BARE_ADDRESS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut a text to `max` characters, with an ellipsis. */
export function truncate(text, max) {
  const value = String(text ?? '').trim();
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Pick the gateway a network widget shows: the one chosen in the settings
 * (a device external_id) when it is a known gateway, else the first known
 * gateway, else null.
 * @param {{ devices: Array<object> }} snapshot
 * @param {string|undefined} chosen the `gateway` setting
 * @param {(type: string, id: string) => { device: string }} externalIds
 */
export function pickGateway(snapshot, chosen, externalIds) {
  const gateways = snapshot.devices.filter((dev) => dev.mac && isGatewayDevice(dev));
  if (chosen) {
    const match = gateways.find(
      (dev) => externalIds('gateway', dev.mac.toLowerCase()).device === chosen,
    );
    if (match) {
      return match;
    }
  }
  return gateways[0] ?? null;
}

/**
 * Pick the WLAN a wifi widget shows: the one chosen in the settings (a device
 * external_id) when known, else the first known WLAN, else null.
 * @param {{ wlans: Array<object> }} snapshot
 * @param {string|undefined} chosen the `network` setting
 * @param {(type: string, id: string) => { device: string }} externalIds
 */
export function pickWlan(snapshot, chosen, externalIds) {
  if (chosen) {
    const match = snapshot.wlans.find(
      (wlan) => externalIds('wifi', wlanIdOf(wlan)).device === chosen,
    );
    if (match) {
      return match;
    }
  }
  return snapshot.wlans[0] ?? null;
}

/** The subsystem health entries, by subsystem name. */
function healthOf(snapshot, subsystem) {
  return snapshot.health.find((entry) => entry && entry.subsystem === subsystem) ?? null;
}

/**
 * The Internet row of the network widget, from the `wan` subsystem of
 * `stat/health`: `ok`, `warning`, `error`, or `unknown` (also when absent).
 * @param {{ status?: string }|null} wan the wan subsystem entry
 */
export function internetStateOf(wan) {
  switch (String(wan?.status || '').toLowerCase()) {
    case 'ok':
      return { value: T.ok, color: WIDGET_COLORS.SUCCESS };
    case 'error':
      return { value: T.down, color: WIDGET_COLORS.DANGER };
    case 'warning':
      return { value: T.degraded, color: WIDGET_COLORS.WARNING };
    default:
      return { value: T.unknown, color: WIDGET_COLORS.NEUTRAL };
  }
}

/**
 * Content of the network widget.
 * @param {{ snapshot: ReturnType<typeof emptySnapshot>, settings?: object,
 *   externalIds: (type: string, id: string) => { device: string, feature: (key: string) => string } }} input
 */
export function buildNetworkContent({ snapshot, settings = {}, externalIds }) {
  if (!snapshot.polled) {
    return { ttl_seconds: 30, components: [{ type: 'text', variant: 'body', text: T.noPollYet }] };
  }
  const interval = NETWORK_INTERVALS.includes(settings.interval)
    ? settings.interval
    : DEFAULT_NETWORK_INTERVAL;
  const gateway = pickGateway(snapshot, settings.gateway, externalIds);
  const clients = snapshot.clients.filter((client) => client && client.mac);
  const wifi = clients.filter((client) => !client.is_wired).length;
  const wired = clients.length - wifi;
  const guests = clients.filter((client) => client.is_guest).length;
  const hardware = snapshot.devices.filter((dev) => dev && dev.mac);
  const online = hardware.filter((dev) => dev.state === 1).length;
  const offline = hardware.length - online;

  const components = [];
  if (gateway) {
    const ids = externalIds('gateway', gateway.mac.toLowerCase());
    components.push(
      {
        type: 'value',
        device_feature: ids.feature('wan-down'),
        label: T.download,
        icon: 'arrow-down',
      },
      { type: 'value', device_feature: ids.feature('wan-up'), label: T.upload, icon: 'arrow-up' },
    );
  }
  components.push(
    { type: 'value', value: clients.length, label: T.clients, icon: 'smartphone' },
    {
      type: 'value',
      value: truncate(`${online} / ${hardware.length}`, MAX_TILE_VALUE),
      label: T.devices,
      icon: 'server',
    },
  );
  if (gateway) {
    const ids = externalIds('gateway', gateway.mac.toLowerCase());
    components.push({
      type: 'chart',
      device_features: [ids.feature('wan-down'), ids.feature('wan-up')],
      interval,
      chart_type: 'area',
      title: T.wanChart,
      unit: 'Mbps',
    });
  } else {
    components.push({ type: 'text', variant: 'caption', text: T.noGateway });
  }

  const internet = internetStateOf(healthOf(snapshot, 'wan'));
  const status = [
    { label: T.internet, value: internet.value, icon: 'globe', color: internet.color },
    { label: T.wifiClients, value: wifi, icon: 'wifi', color: WIDGET_COLORS.INFO },
    { label: T.wiredClients, value: wired, icon: 'link', color: WIDGET_COLORS.INFO },
  ];
  if (guests > 0) {
    status.push({ label: T.guests, value: guests, icon: 'user', color: WIDGET_COLORS.INFO });
  }
  status.push({
    label: T.offline,
    value: offline,
    icon: 'server',
    color: offline > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
  });
  components.push({ type: 'status', items: status });

  return { ttl_seconds: 60, components };
}

/**
 * The client devices added to Gladys, with their presence: the live state
 * known by the integration when it has one, else the last value Gladys
 * stored for the presence feature.
 * @param {Array<object>} gladysDevices the devices of `gladys.getDevices()`
 * @param {Map<string, number>} presence live presence by MAC (0 / 1)
 * @returns {Array<{ name: string|object, mac: string, present: boolean }>}
 *   `name` is the Gladys name without address fragments, or a neutral
 *   multi-language word when nothing readable is left.
 */
export function presenceRows(gladysDevices, presence) {
  const rows = [];
  for (const device of gladysDevices ?? []) {
    const mac = clientMacOf(device?.external_id);
    if (!mac) {
      continue;
    }
    const feature = (device.features ?? []).find((f) =>
      String(f.external_id).endsWith(':presence'),
    );
    const live = presence?.get(mac);
    const present = live !== undefined ? live === 1 : feature?.last_value === 1;
    rows.push({ name: publicName(device.name) || T.device, mac, present });
  }
  // Present first, then by name (a nameless device after the named ones).
  const sortKey = (row) => (typeof row.name === 'string' ? row.name : '\uffff');
  rows.sort(
    (a, b) =>
      Number(b.present) - Number(a.present) ||
      sortKey(a).localeCompare(sortKey(b), undefined, { sensitivity: 'base' }),
  );
  return rows;
}

/**
 * Content of the presence widget.
 * @param {{ gladysDevices: Array<object>, presence: Map<string, number>, settings?: object }} input
 */
export function buildPresenceContent({ gladysDevices, presence, settings = {} }) {
  const rows = presenceRows(gladysDevices, presence);
  if (rows.length === 0) {
    return { ttl_seconds: 30, components: [{ type: 'text', variant: 'body', text: T.noClients }] };
  }
  const show = PRESENCE_SHOW.includes(settings.show) ? settings.show : DEFAULT_PRESENCE_SHOW;
  const here = rows.filter((row) => row.present);
  const components = [
    {
      type: 'value',
      value: truncate(`${here.length} / ${rows.length}`, MAX_TILE_VALUE),
      label: T.present,
      icon: 'users',
    },
  ];
  const shown = show === 'present' ? here : rows;
  if (shown.length === 0) {
    components.push({ type: 'text', variant: 'body', text: T.nobodyHome });
    return { ttl_seconds: 30, components };
  }
  components.push({
    type: 'status',
    items: shown.slice(0, MAX_STATUS_ROWS).map((row) => ({
      label: typeof row.name === 'string' ? truncate(row.name, MAX_STATUS_LABEL) : row.name,
      value: row.present ? T.presentOne : T.absent,
      icon: row.present ? 'user-check' : 'user-x',
      color: row.present ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    })),
  });
  if (shown.length > MAX_STATUS_ROWS) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: T.others(shown.length - MAX_STATUS_ROWS),
    });
  }
  return { ttl_seconds: 30, components };
}

/** The radio band of a WLAN as the controller names it, for the status list. */
export function wlanBandOf(wlan) {
  const band = String(wlan.wlan_band || '').toLowerCase();
  const names = { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz', both: '2.4 / 5 GHz' };
  if (names[band]) {
    return names[band];
  }
  if (Array.isArray(wlan.wlan_bands) && wlan.wlan_bands.length > 0) {
    return wlan.wlan_bands.map((b) => names[String(b).toLowerCase()] ?? String(b)).join(' / ');
  }
  return null;
}

/** The security of a WLAN (`open`, WPA2, WPA3…), for the status list; null when unknown. */
export function wlanSecurityOf(wlan) {
  const security = String(wlan.security || '').toLowerCase();
  if (!security) {
    return null;
  }
  if (security === 'open') {
    return T.open;
  }
  const mode = String(wlan.wpa_mode || '').toUpperCase();
  const wpa3 = wlan.wpa3_support === true || wlan.wpa3_transition === true;
  if (security === 'wpapsk') {
    if (wpa3) {
      return mode === 'WPA3' && !wlan.wpa3_transition ? 'WPA3' : 'WPA2 / WPA3';
    }
    return mode || 'WPA';
  }
  if (security === 'wpaeap') {
    return `${mode || 'WPA'} Enterprise`;
  }
  return security.toUpperCase();
}

/**
 * Content of the wifi widget: one SSID.
 * @param {{ snapshot: ReturnType<typeof emptySnapshot>, settings?: object,
 *   externalIds: (type: string, id: string) => { device: string, feature: (key: string) => string } }} input
 */
export function buildWifiContent({ snapshot, settings = {}, externalIds }) {
  const wlan = pickWlan(snapshot, settings.network, externalIds);
  if (!wlan) {
    return {
      ttl_seconds: 30,
      components: [
        { type: 'text', variant: 'body', text: snapshot.polled ? T.noWlan : T.noPollYet },
      ],
    };
  }
  const ids = externalIds('wifi', wlanIdOf(wlan));
  const ssid = String(wlan.name || '').trim();
  const enabled = wlan.enabled !== false;
  const connected = snapshot.clients.filter(
    (client) => client && !client.is_wired && ssid && String(client.essid || '') === ssid,
  ).length;

  const status = [
    {
      label: T.state,
      value: enabled ? T.enabled : T.disabled,
      icon: enabled ? 'wifi' : 'wifi-off',
      color: enabled ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    { label: T.connected, value: connected, icon: 'smartphone', color: WIDGET_COLORS.INFO },
  ];
  if (wlan.is_guest) {
    status.push({ label: T.guestNetwork, value: T.yes, icon: 'user', color: WIDGET_COLORS.INFO });
  }
  const band = wlanBandOf(wlan);
  if (band) {
    status.push({ label: T.band, value: truncate(band, MAX_STATUS_VALUE), icon: 'radio' });
  }
  const security = wlanSecurityOf(wlan);
  if (security) {
    status.push({
      label: T.security,
      value: typeof security === 'string' ? truncate(security, MAX_STATUS_VALUE) : security,
      icon: 'lock',
    });
  }

  return {
    ttl_seconds: 30,
    components: [
      { type: 'text', variant: 'heading', text: truncate(ssid || wlanIdOf(wlan), MAX_HEADING) },
      { type: 'status', items: status },
      // Device-feature buttons: the native command path (onSetValue), with
      // the active state the core gives a numeric device_feature button.
      {
        type: 'button',
        label: T.enable,
        icon: 'wifi',
        device_feature: ids.feature('state'),
        value: 1,
      },
      {
        type: 'button',
        label: T.disable,
        icon: 'wifi-off',
        device_feature: ids.feature('state'),
        value: 0,
      },
    ],
  };
}
