import axios from 'axios';
import https from 'node:https';
import { logger } from '@gladysassistant/integration-sdk';

/**
 * UniFi Network API Client supporting local Username/Password session authentication.
 */
export class UniFiClient {
  constructor(config) {
    this.config = config;
    this.cookies = [];
    this.isLoggedIn = false;

    // Local UniFi consoles use self-signed SSL certs by default.
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    const baseURL = `https://${config.unifi_host}:${config.unifi_port}`;
    this.axios = axios.create({
      baseURL,
      httpsAgent: this.httpsAgent,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Get default HTTP headers.
   */
  getHeaders() {
    const headers = {};
    if (this.cookies.length > 0) {
      headers.Cookie = this.cookies.join('; ');
    }
    return headers;
  }

  /**
   * Authenticate using username and password.
   */
  async login() {
    const { unifi_username, unifi_password } = this.config;
    if (!unifi_username || !unifi_password) {
      throw new Error('Nom d’utilisateur et mot de passe local requis.');
    }

    logger.debug(`Authenticating to UniFi at ${this.config.unifi_host}...`);

    // Try UniFi OS login endpoint first (/api/auth/login), fallback to legacy (/api/login)
    const loginEndpoints = ['/api/auth/login', '/api/login'];
    let lastError = null;

    for (const endpoint of loginEndpoints) {
      try {
        const response = await this.axios.post(
          endpoint,
          {
            username: unifi_username,
            password: unifi_password,
            remember: true,
          },
          { headers: { 'Content-Type': 'application/json' } },
        );

        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
          this.cookies = setCookie;
        }
        this.isLoggedIn = true;
        logger.info(`Successfully logged in to UniFi OS via ${endpoint}`);
        return true;
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      `Échec d'authentification UniFi (HTTP ${lastError?.response?.status || 'Erreur'}) : ${
        lastError?.response?.data?.message ||
        lastError?.message ||
        'Nom d’utilisateur ou mot de passe incorrect'
      }`,
    );
  }

  /**
   * Execute API request with automatic retry on 401.
   */
  async request(method, path, data = null) {
    const makeReq = async () => {
      const site = this.config.unifi_site_id || 'default';
      const fullPath = path.replace('{site}', site);
      const headers = this.getHeaders();

      // Test /proxy/network first for UniFi OS consoles (UCG, UDM), fallback to direct path
      try {
        const res = await this.axios.request({
          method,
          url: `/proxy/network${fullPath}`,
          data,
          headers,
        });
        return res.data;
      } catch (err) {
        if (err.response && (err.response.status === 404 || err.response.status === 405)) {
          const res = await this.axios.request({
            method,
            url: fullPath,
            data,
            headers,
          });
          return res.data;
        }
        throw err;
      }
    };

    try {
      return await makeReq();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        logger.debug('UniFi session expired, re-authenticating...');
        await this.login();
        return await makeReq();
      }
      throw err;
    }
  }

  /**
   * Test connection credentials.
   */
  async testConnection() {
    await this.login();
    const health = await this.getHealth();
    return {
      success: true,
      message: `Connexion réussie à UniFi Network (${health?.data?.length || 0} sous-système(s) actifs).`,
    };
  }

  /**
   * Fetch connected active clients.
   */
  async getClients() {
    const res = await this.request('GET', '/api/s/{site}/stat/sta');
    return res?.data || [];
  }

  /**
   * Fetch known configured clients.
   */
  async getKnownClients() {
    const res = await this.request('GET', '/api/s/{site}/rest/user');
    return res?.data || [];
  }

  /**
   * Fetch UniFi infrastructure devices (Gateways, APs, Switches).
   */
  async getDevices() {
    const res = await this.request('GET', '/api/s/{site}/stat/device');
    return res?.data || [];
  }

  /**
   * Fetch Wi-Fi WLAN configurations.
   */
  async getWlans() {
    const res = await this.request('GET', '/api/s/{site}/rest/wlanconf');
    return res?.data || [];
  }

  /**
   * Fetch subsystem health status.
   */
  async getHealth() {
    return await this.request('GET', '/api/s/{site}/stat/health');
  }

  /**
   * Block a client device by MAC address.
   */
  async blockClient(mac) {
    return await this.request('POST', '/api/s/{site}/cmd/stamgr', {
      cmd: 'block-sta',
      mac: mac.toLowerCase(),
    });
  }

  /**
   * Unblock a client device by MAC address.
   */
  async unblockClient(mac) {
    return await this.request('POST', '/api/s/{site}/cmd/stamgr', {
      cmd: 'unblock-sta',
      mac: mac.toLowerCase(),
    });
  }

  /**
   * Restart a UniFi device (Gateway, AP, Switch) by MAC address.
   */
  async restartDevice(mac) {
    return await this.request('POST', '/api/s/{site}/cmd/devmgr', {
      cmd: 'restart',
      mac: mac.toLowerCase(),
    });
  }

  /**
   * Enable/Disable a Wi-Fi SSID network.
   */
  async setWlanState(wlanId, enabled) {
    return await this.request('PUT', `/api/s/{site}/rest/wlanconf/${wlanId}`, {
      enabled: Boolean(enabled),
    });
  }

  /**
   * Set PoE mode on a switch port (e.g. 'auto', 'off', 'passthrough').
   */
  async setPortPoeMode(deviceId, portOverrides) {
    return await this.request('PUT', `/api/s/{site}/rest/device/${deviceId}`, {
      port_overrides: portOverrides,
    });
  }
}
