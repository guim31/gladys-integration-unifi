import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig keeps user values over the defaults', () => {
  const config = normalizeConfig({
    unifi_host: '10.0.0.1',
    unifi_port: 8443,
    unifi_auth_type: 'api_key',
    unifi_api_key: 'mysecretapikey',
    unifi_username: 'admin',
    unifi_password: 'secretpassword',
    presence_offline_delay: 300,
  });

  assert.equal(config.unifi_host, '10.0.0.1');
  assert.equal(config.unifi_port, 8443);
  assert.equal(config.unifi_auth_type, 'api_key');
  assert.equal(config.unifi_api_key, 'mysecretapikey');
  assert.equal(config.unifi_username, 'admin');
  assert.equal(config.unifi_password, 'secretpassword');
  assert.equal(config.presence_offline_delay, 300);
});

test('normalizeConfig coerces numeric strings coming from a form', () => {
  const config = normalizeConfig({ unifi_port: '443', presence_offline_delay: '180' });
  assert.equal(config.unifi_port, 443);
  assert.equal(typeof config.unifi_port, 'number');
  assert.equal(config.presence_offline_delay, 180);
  assert.equal(typeof config.presence_offline_delay, 'number');
});
