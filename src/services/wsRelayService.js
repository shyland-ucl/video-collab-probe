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
    this.isPeerConnected = false;
  }

  _emitConnected() {
    if (this.isPeerConnected) return;
    this.isPeerConnected = true;
    this.onConnectedCallbacks.forEach((cb) => cb());
  }

  _emitDisconnected() {
    if (!this.isPeerConnected) return;
    this.isPeerConnected = false;
    this.onDisconnectedCallbacks.forEach((cb) => cb());
  }

  connect(role) {
    // Ensure reconnects are clean and idempotent.
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.close();
    }

    this.ws = null;
    this.isPeerConnected = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/__ws_relay`;

    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.ws?.send(JSON.stringify({ type: 'JOIN', role }));
    });

    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'PAIRED') {
        this._emitConnected();
        return;
      }

      if (msg.type === 'PEER_DISCONNECTED') {
        this._emitDisconnected();
        return;
      }

      this.onDataCallbacks.forEach((cb) => cb(msg));
    });

    this.ws.addEventListener('close', () => {
      this._emitDisconnected();
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
    // Close the socket but DO NOT clear callbacks. Each subscriber is
    // responsible for its own cleanup via the unsub function returned by
    // onData/onConnected/onDisconnected. Persistent listeners (e.g. the
    // event-broadcast wiring inside EventLoggerProvider) need to survive
    // page transitions where one page disconnects and the next reconnects.
    this.ws?.close();
    this.ws = null;
    this.isPeerConnected = false;
  }
}

export const wsRelayService = new WsRelayService();
