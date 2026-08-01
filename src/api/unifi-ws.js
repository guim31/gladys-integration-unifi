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
    this.pingTimer = null;
    this.isClosedManually = false;
    this.connectTime = 0;
    this.rapidCloseCount = 0;
  }

  connect() {
    this.isClosedManually = false;
    this.clearTimers();

    const site = this.config.unifi_site_id || 'default';
    const wsUrl = `wss://${this.config.unifi_host}:${this.config.unifi_port}/proxy/network/wss/s/${site}/events`;
    const headers = this.client.getHeaders();

    logger.info(`Connecting to UniFi WebSocket events at ${wsUrl}...`);

    try {
      this.connectTime = Date.now();
      this.ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,
        headers,
      });

      this.ws.on('open', () => {
        logger.info('UniFi WebSocket connected successfully.');
        this.emit('connected');
        this.startPing();
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
        const duration = Date.now() - this.connectTime;
        this.stopPing();

        if (duration < 2000) {
          this.rapidCloseCount++;
        } else {
          this.rapidCloseCount = 0;
        }

        if (this.rapidCloseCount > 3) {
          logger.warn(
            `UniFi WebSocket closed immediately (${code}). Local API Key mode on this UniFi OS version does not keep WS events open. Falling back to HTTP polling.`,
          );
        } else {
          logger.info(`UniFi WebSocket closed (${code}): ${reason}`);
        }

        this.emit('disconnected');
        if (!this.isClosedManually) {
          // If rapid disconnects occur, back off reconnects to 60 seconds
          const delay = this.rapidCloseCount > 3 ? 60000 : 10000;
          this.scheduleReconnect(delay);
        }
      });
    } catch (err) {
      logger.error('Failed to create UniFi WebSocket:', err.message);
      this.scheduleReconnect(10000);
    }
  }

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch {
          // ignore ping error
        }
      }
    }, 15000);
  }

  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  clearTimers() {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  scheduleReconnect(delay = 10000) {
    this.clearTimers();
    this.reconnectTimer = setTimeout(() => {
      logger.info('Attempting to reconnect UniFi WebSocket...');
      this.connect();
    }, delay);
  }

  close() {
    this.isClosedManually = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
