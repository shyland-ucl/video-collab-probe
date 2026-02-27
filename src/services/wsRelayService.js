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
    this.onConnectedCallbacks = [];
    this.onDisconnectedCallbacks = [];
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
        this.onConnectedCallbacks.forEach((cb) => cb());
        return;
      }

      if (msg.type === 'PEER_DISCONNECTED') {
        this.onDisconnectedCallbacks.forEach((cb) => cb());
        return;
      }

      this.onDataCallbacks.forEach((cb) => cb(msg));
    });

    this.ws.addEventListener('close', () => {
      this.onDisconnectedCallbacks.forEach((cb) => cb());
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
    return () => {
      this.onDataCallbacks = this.onDataCallbacks.filter((cb) => cb !== callback);
    };
  }

  onConnected(callback) {
    this.onConnectedCallbacks.push(callback);
    return () => {
      this.onConnectedCallbacks = this.onConnectedCallbacks.filter((cb) => cb !== callback);
    };
  }

  onDisconnected(callback) {
    this.onDisconnectedCallbacks.push(callback);
    return () => {
      this.onDisconnectedCallbacks = this.onDisconnectedCallbacks.filter((cb) => cb !== callback);
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.onDataCallbacks = [];
    this.onConnectedCallbacks = [];
    this.onDisconnectedCallbacks = [];
  }
}

export const wsRelayService = new WsRelayService();
