// -----------------------------------------------------------------------------
// UniFi Integration configuration.
// -----------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  unifi_host: '192.168.1.1',
  unifi_port: 443,
  unifi_username: '',
  unifi_password: '',
  unifi_site_id: 'default',
  presence_offline_delay: 120, // seconds
  GLADYS_PREFER_LOCAL: true,
};

/**
 * Merge the user config with defaults and coerce types.
 * @param {Record<string, unknown>} raw config from Gladys SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    unifi_host: String(raw.unifi_host ?? DEFAULT_CONFIG.unifi_host).trim(),
    unifi_port: Number(raw.unifi_port ?? DEFAULT_CONFIG.unifi_port),
    unifi_username: String(raw.unifi_username ?? DEFAULT_CONFIG.unifi_username).trim(),
    unifi_password: String(raw.unifi_password ?? DEFAULT_CONFIG.unifi_password),
    unifi_site_id: String(raw.unifi_site_id ?? DEFAULT_CONFIG.unifi_site_id).trim() || 'default',
    presence_offline_delay: Number(
      raw.presence_offline_delay ?? DEFAULT_CONFIG.presence_offline_delay,
    ),
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}
