// -----------------------------------------------------------------------------
// Translations: every text shown by Gladys exists in the four languages of its
// interface (en, fr, de, es), none is empty, none exceeds its bound.
//
// Manifest: EVERY object carrying a language key is checked (no list to keep
// up to date), and every label / description / placeholder must be such an
// object. Code: the widget texts and the messages, each widget text with the
// bound of the component that shows it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WIDGET_TEXTS } from '../src/widgets.js';
import { MESSAGES } from '../src/messages.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];
const LANGUAGE_KEY = /^[a-z]{2}(-[A-Z]{2})?$/;
const TEXT_PROPERTIES = ['label', 'description', 'placeholder'];

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isMultiLanguage = (value) =>
  isPlainObject(value) && Object.keys(value).some((key) => LANGUAGE_KEY.test(key));

/** Every multi-language object of a tree, with its path. */
function collectTexts(node, path, out = []) {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collectTexts(child, `${path}[${index}]`, out));
  } else if (isMultiLanguage(node)) {
    out.push({ path, value: node });
  } else if (isPlainObject(node)) {
    for (const [key, child] of Object.entries(node)) {
      collectTexts(child, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

/** Bounds of the core (validateManifest of Gladys 5.1.4), in characters per language. */
function manifestBounds(path) {
  if (path === 'description') {
    return { min: 10, max: 100 };
  }
  if (/^widgets\[\d+\]\.label$/.test(path)) {
    return { min: 3, max: 30 };
  }
  if (/^widgets\[\d+\]\.description$/.test(path)) {
    return { min: 1, max: 100 };
  }
  if (/^config_schema\[\d+\]\.description$/.test(path)) {
    return { min: 1, max: 1000 };
  }
  return { min: 1, max: Infinity };
}

function assertText(path, value, { min = 1, max = Infinity } = {}) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [...LANGUAGES].sort(),
    `${path} must have exactly the languages ${LANGUAGES.join(', ')}`,
  );
  for (const language of LANGUAGES) {
    const text = value[language];
    assert.equal(typeof text, 'string', `${path}.${language} must be a string`);
    const length = text.trim().length;
    assert.ok(length >= min, `${path}.${language} is empty or shorter than ${min} characters`);
    assert.ok(length <= max, `${path}.${language} is ${length} characters long (max ${max})`);
  }
}

test('every multi-language text of the manifest is in en, fr, de and es, within its bound', () => {
  const texts = collectTexts(manifest, '');
  assert.ok(texts.length >= 47, `only ${texts.length} texts found in the manifest`);
  for (const { path, value } of texts) {
    assertText(path, value, manifestBounds(path));
  }
});

test('no label, description or placeholder of the manifest is a single-language string', () => {
  (function walk(node, path) {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
    } else if (isPlainObject(node) && !isMultiLanguage(node)) {
      for (const [key, child] of Object.entries(node)) {
        const childPath = path ? `${path}.${key}` : key;
        if (TEXT_PROPERTIES.includes(key)) {
          assert.ok(isMultiLanguage(child), `${childPath} must be a multi-language object`);
        }
        walk(child, childPath);
      }
    }
  })(manifest, '');
});

// Bounds of the widget vocabulary (SDK 0.14, TEXT_BOUNDS), by the component
// that shows each text. A new text must be classified here.
const TILE_LABEL = 24;
const STATUS = 40;
const BUTTON_LABEL = 24;
const CHART_TITLE = 40;
const CAPTION = 80;
const BODY = 300;
const WIDGET_TEXT_BOUNDS = {
  download: TILE_LABEL,
  upload: TILE_LABEL,
  clients: TILE_LABEL,
  devices: TILE_LABEL,
  present: TILE_LABEL,
  wanChart: CHART_TITLE,
  internet: STATUS,
  ok: STATUS,
  down: STATUS,
  degraded: STATUS,
  unknown: STATUS,
  wifiClients: STATUS,
  wiredClients: STATUS,
  guests: STATUS,
  offline: STATUS,
  presentOne: STATUS,
  absent: STATUS,
  device: STATUS,
  state: STATUS,
  enabled: STATUS,
  disabled: STATUS,
  connected: STATUS,
  guestNetwork: STATUS,
  yes: STATUS,
  band: STATUS,
  security: STATUS,
  open: STATUS,
  enable: BUTTON_LABEL,
  disable: BUTTON_LABEL,
  noGateway: CAPTION,
  others: CAPTION,
  noPollYet: BODY,
  nobodyHome: BODY,
  noClients: BODY,
  noWlan: BODY,
  vpnServer: STATUS,
  vpnClients: STATUS,
  vpnClient: STATUS,
  vpnOnline: STATUS,
  megabytes: STATUS,
  noVpn: BODY,
  notAVpn: BODY,
};

test('every widget text is in en, fr, de and es, within the bound of its component', () => {
  assert.deepEqual(
    Object.keys(WIDGET_TEXTS).sort(),
    Object.keys(WIDGET_TEXT_BOUNDS).sort(),
    'every widget text needs a bound in WIDGET_TEXT_BOUNDS (and no stale entry)',
  );
  for (const [key, entry] of Object.entries(WIDGET_TEXTS)) {
    // A text built from a count: checked with a large one.
    const value = typeof entry === 'function' ? entry(1234) : entry;
    assertText(`WIDGET_TEXTS.${key}`, value, { max: WIDGET_TEXT_BOUNDS[key] });
  }
});

test('every message is in en, fr, de and es', () => {
  const samples = {
    connectionFailed: ['connect ECONNREFUSED'],
    testConnectionOk: [3],
  };
  assert.deepEqual(Object.keys(MESSAGES).sort(), Object.keys(samples).sort());
  for (const [key, build] of Object.entries(MESSAGES)) {
    const value = build(...samples[key]);
    assertText(`MESSAGES.${key}`, value);
    for (const language of LANGUAGES) {
      assert.ok(
        value[language].includes(String(samples[key][0])),
        `MESSAGES.${key}.${language} must show its detail`,
      );
    }
  }
});
