import axios from 'axios';
import https from 'node:https';
import { logger } from '@gladysassistant/integration-sdk';

/**
 * UniFi Network API Client supporting both local API Key (UniFi OS 3.2+)
 * and Username/Password session authentication.
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
   * Get default HTTP headers according to auth type.
   */
  getHeaders() {
    const headers = {};
    if (this.config.unifi_auth_type === 'api_key' && this.config.unifi_api_key) {
      headers['X-API-KEY'] = this.config.unifi_api_key;
      headers['X-API-Key'] = this.config.unifi_api_key;
      headers['x-api-key'] = this.config.unifi_api_key;
    } else if (this.cookies.length > 0) {
      headers.Cookie = this.cookies.join('; ');
    }
    return headers;
  }

  /**
   * Authenticate using username and password (for legacy/credentials mode).
   */
  async login() {
    if (this.config.unifi_auth_type === 'api_key') {
      return true;
    }

    const { unifi_username, unifi_password } = this.config;
    if (!unifi_username || !unifi_password) {
      throw new Error('Nom d’utilisateur et mot de passe requis en mode identifiants.');
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
        lastError?.response?.data?.message || lastError?.message || 'Identifiants invalides'
      }`,
    );
  }

  /**
   * Execute API request with automatic retry on 401 for credentials auth.
   */
  async request(method, path, data = null) {
    const makeReq = async () => {
      const site = this.config.unifi_site_id || 'default';
      const fullPath = path.replace('{site}', site);
      const headers = this.getHeaders();

      // We test /proxy/network first for UniFi OS consoles (UCG, UDM), fallback to direct path
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
      if (
        err.response &&
        err.response.status === 401 &&
        this.config.unifi_auth_type !== 'api_key'
      ) {
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
    if (this.config.unifi_auth_type === 'credentials') {
      await this.login();
    } else if (!this.config.unifi_api_key) {
      throw new Error('Veuillez renseigner une Clé API Locale dans la configuration.');
    }

    try {
      const health = await this.getHealth();
      return {
        success: true,
        message: `Connexion réussie à UniFi Network (${health?.data?.length || 0} sous-système(s) actifs).`,
      };
    } catch (err) {
      if (err.response && err.response.status === 401) {
        if (this.config.unifi_auth_type === 'api_key') {
          throw new Error(
            'Erreur 401 (Non autorisé) : La clé API est refusée par UniFi OS. Vérifiez que la clé a été créée directement sur votre console locale (Paramètres > Système > Intégrations). Si le problème persiste, utilisez le mode "Nom d’utilisateur & Mot de passe local".',
          );
        }
        throw new Error('Erreur 401 (Non autorisé) : Nom d’utilisateur ou mot de passe incorrect.');
      }
      throw err;
    }
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
