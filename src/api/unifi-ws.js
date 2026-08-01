import WebSocket from 'ws';
import EventEmitter from 'node:events';
import { logger } from '@gladysassistant/integration-sdk';

/**
 * UniFi Real-time WebSocket Client listening for network events.
 */
export class UniFiWebSocket extends EventEmitter {
  constructor(config, client) {
    super();
    this.config = config;
    this.client = client;
    this.ws = null;
    this.reconnectTimer = null;
    this.isClosedManually = false;
  }

  connect() {
    this.isClosedManually = false;
    const site = this.config.unifi_site_id || 'default';
    const wsUrl = `wss://${this.config.unifi_host}:${this.config.unifi_port}/proxy/network/wss/s/${site}/events`;

    const headers = this.client.getHeaders();

    logger.info(`Connecting to UniFi WebSocket events at ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,
        headers,
      });

      this.ws.on('open', () => {
        logger.info('UniFi WebSocket connected successfully.');
        this.emit('connected');
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed && parsed.data) {
            for (const event of parsed.data) {
              this.emit('event', event);
            }
          }
        } catch (err) {
          logger.debug('Failed to parse WebSocket message from UniFi:', err.message);
        }
      });

      this.ws.on('error', (err) => {
        logger.warn('UniFi WebSocket error:', err.message);
      });

      this.ws.on('close', (code, reason) => {
        logger.info(`UniFi WebSocket closed (${code}): ${reason}`);
        this.emit('disconnected');
        if (!this.isClosedManually) {
          this.scheduleReconnect();
        }
      });
    } catch (err) {
      logger.error('Failed to create UniFi WebSocket:', err.message);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      logger.info('Attempting to reconnect UniFi WebSocket...');
      this.connect();
    }, 10000);
  }

  close() {
    this.isClosedManually = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
