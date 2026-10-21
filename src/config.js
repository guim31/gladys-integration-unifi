// -----------------------------------------------------------------------------
// UniFi Integration configuration.
// -----------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  unifi_host: '192.168.1.1',
  unifi_port: 443,
  unifi_auth_type: 'api_key',
  unifi_api_key: '',
  unifi_username: '',
  unifi_password: '',
  unifi_site_id: 'default',
  presence_offline_delay: 120, // seconds
  presence_heartbeat: true, // republish "present" every minute (Check presence)
  discover_infrastructure: true,
  discover_clients: true,
  only_active_clients: true,
  client_connection_type: 'all', // 'all', 'wifi_only', 'wired_only'
  allowed_ssids: '',
  allow_vpn_control: false,
  GLADYS_PREFER_LOCAL: true,
};

/**
 * Merge the user config with defaults and coerce types.
 * @param {Record<string, unknown>} raw config from Gladys SDK
 */
export function normalizeConfig(raw = {}) {
  const allowedSsidsRaw = String(raw.allowed_ssids ?? DEFAULT_CONFIG.allowed_ssids);
  const parsedSsids = allowedSsidsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...DEFAULT_CONFIG,
    ...raw,
    unifi_host: String(raw.unifi_host ?? DEFAULT_CONFIG.unifi_host).trim(),
    unifi_port: Number(raw.unifi_port ?? DEFAULT_CONFIG.unifi_port),
    unifi_auth_type: String(raw.unifi_auth_type ?? DEFAULT_CONFIG.unifi_auth_type).trim(),
    unifi_api_key: String(raw.unifi_api_key ?? DEFAULT_CONFIG.unifi_api_key).trim(),
    unifi_username: String(raw.unifi_username ?? DEFAULT_CONFIG.unifi_username).trim(),
    unifi_password: String(raw.unifi_password ?? DEFAULT_CONFIG.unifi_password),
    unifi_site_id: String(raw.unifi_site_id ?? DEFAULT_CONFIG.unifi_site_id).trim() || 'default',
    // An emptied field arrives as '' (Number('') would be 0, "absent at once").
    presence_offline_delay: Number(
      raw.presence_offline_delay === '' || raw.presence_offline_delay === null
        ? DEFAULT_CONFIG.presence_offline_delay
        : (raw.presence_offline_delay ?? DEFAULT_CONFIG.presence_offline_delay),
    ),
    presence_heartbeat: raw.presence_heartbeat !== false && raw.presence_heartbeat !== 'false',
    discover_infrastructure: raw.discover_infrastructure !== false,
    discover_clients: raw.discover_clients !== false,
    only_active_clients: raw.only_active_clients !== false,
    client_connection_type: ['all', 'wifi_only', 'wired_only'].includes(raw.client_connection_type)
      ? raw.client_connection_type
      : DEFAULT_CONFIG.client_connection_type,
    allowed_ssids: parsedSsids,
    allow_vpn_control: raw.allow_vpn_control === true || raw.allow_vpn_control === 'true',
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}
