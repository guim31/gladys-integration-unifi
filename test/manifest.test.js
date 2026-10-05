// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEVICE_BLUEPRINTS } from '../src/devices/index.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import {
  DEFAULT_NETWORK_INTERVAL,
  DEFAULT_PRESENCE_SHOW,
  NETWORK_INTERVALS,
  PRESENCE_SHOW,
  WIDGET,
} from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

// Actions registered outside the blueprints (see index.js).
const REGISTRY_LEVEL_ACTIONS = ['test_connection'];

test('every manifest action has a registered handler', () => {
  const handled = new Set([
    ...DEVICE_BLUEPRINTS.flatMap((bp) => Object.keys(bp.actions ?? {})),
    ...REGISTRY_LEVEL_ACTIONS,
  ]);
  for (const action of manifest.actions ?? []) {
    assert.ok(handled.has(action.key), `manifest action "${action.key}" has no handler`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0, 'at least one section block exists');
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(
      section.placeholder,
      undefined,
      `section "${section.key}" must not have a placeholder`,
    );
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" stores no value and must not appear in DEFAULT_CONFIG`,
    );
  }
});

// --- Dashboard widgets (Gladys 5.1+) -----------------------------------------

const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

test('widgets need Gladys 5.1 and the SDK 0.14', async () => {
  const [, major, minor] = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/).map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.dependencies['@gladysassistant/integration-sdk'], /^\^0\.(1[4-9]|[2-9]\d)\./);
});

test('every declared widget is served by index.js, and only those', () => {
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGET).sort(),
  );
  const served = [...indexSource.matchAll(/onWidgetGet\(WIDGET\.([A-Z_]+)/g)].map(
    (m) => WIDGET[m[1]],
  );
  assert.deepEqual(served.sort(), Object.values(WIDGET).sort());
  // No widget action button: the buttons go through device features (onSetValue).
  assert.doesNotMatch(indexSource, /onWidgetAction\(/);
});

test('widgets are declared within the store limits', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  for (const widget of manifest.widgets) {
    assert.match(widget.key, /^[a-z0-9_]{2,32}$/);
    assert.ok(widget.label.en && widget.label.fr && widget.description.en && widget.description.fr);
    for (const text of Object.values(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `${widget.key}: ${text}`);
    }
    for (const text of Object.values(widget.description)) {
      assert.ok(text.length <= 100, `${widget.key}: ${text.length}`);
    }
    assert.match(widget.icon, /^[a-z0-9-]{1,40}$/);
    // No widget action button: no action timeout to declare.
    assert.equal(widget.action_timeout_seconds, undefined);
    assert.ok((widget.settings || []).length <= 10);
    for (const field of widget.settings || []) {
      assert.match(field.key, /^[a-z0-9_]+$/);
      assert.ok(['string', 'number', 'boolean', 'select', 'section'].includes(field.type));
      assert.ok(field.label.en && field.label.fr, `${widget.key}.${field.key}`);
      if (field.source !== undefined) {
        // A device select: the integration's devices, never static options.
        assert.equal(field.source, 'devices');
        assert.equal(field.options, undefined);
        assert.equal(field.required, false);
      }
      if (field.type === 'select' && field.source === undefined) {
        assert.ok(field.options.length >= 2);
        assert.ok(
          field.options.some((o) => o.value === field.default),
          'default is an option',
        );
      }
    }
  }
});

test('the widget select options match the code', () => {
  const setting = (widgetKey, key) =>
    manifest.widgets.find((w) => w.key === widgetKey).settings.find((f) => f.key === key);
  const interval = setting(WIDGET.NETWORK, 'interval');
  assert.deepEqual(
    interval.options.map((o) => o.value),
    NETWORK_INTERVALS,
  );
  assert.equal(interval.default, DEFAULT_NETWORK_INTERVAL);
  assert.equal(setting(WIDGET.NETWORK, 'gateway').source, 'devices');
  const show = setting(WIDGET.PRESENCE, 'show');
  assert.deepEqual(
    show.options.map((o) => o.value),
    PRESENCE_SHOW,
  );
  assert.equal(show.default, DEFAULT_PRESENCE_SHOW);
  assert.equal(setting(WIDGET.WIFI, 'network').source, 'devices');
});
