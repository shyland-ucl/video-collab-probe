/**
 * WebSocket relay service — drop-in replacement for webrtcService.
 *
 * API:
 *   connect(role)            — connect as 'creator' or 'helper'
 *   sendData(data)           — send JSON to paired peer
 *   onData(callback)         — register data callback
 *   onConnected(callback)    — called when paired with peer
 *   onDisconnected(callback) — called when peer disconnects
 *   disconnect()             — close connection
 */
class WsRelayService {
  constructor() {
    this.ws = null;
    this.onDataCallbacks = [];
    this.onConnectedCallback = null;
    this.onDisconnectedCallback = null;
  }

  connect(role) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/__ws_relay`;

    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.ws.send(JSON.stringify({ type: 'JOIN', role }));
    });

    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'PAIRED') {
        this.onConnectedCallback?.();
        return;
      }

      if (msg.type === 'PEER_DISCONNECTED') {
        this.onDisconnectedCallback?.();
        return;
      }

      this.onDataCallbacks.forEach((cb) => cb(msg));
    });

    this.ws.addEventListener('close', () => {
      this.onDisconnectedCallback?.();
    });

    this.ws.addEventListener('error', (err) => {
      console.error('WS relay error:', err);
    });
  }

  sendData(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  onData(callback) {
    this.onDataCallbacks.push(callback);
  }

  onConnected(callback) {
    this.onConnectedCallback = callback;
  }

  onDisconnected(callback) {
    this.onDisconnectedCallback = callback;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.onDataCallbacks = [];
  }
}

export const wsRelayService = new WsRelayService();
