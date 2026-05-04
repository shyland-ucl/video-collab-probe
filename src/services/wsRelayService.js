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

    // Use a local `ws` reference for every listener. Under React StrictMode
    // (and any rapid disconnect/reconnect cycle) `this.ws` can be replaced
    // by a newer socket before the old one's events fire, which previously
    // caused `this.ws?.send(...)` in the open handler to target a not-yet-
    // open new socket and throw InvalidStateError. The `this.ws !== ws`
    // guard makes every callback ignore events from a stale socket.
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      ws.send(JSON.stringify({ type: 'JOIN', role }));
    });

    ws.addEventListener('message', (event) => {
      if (this.ws !== ws) return;
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

    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this._emitDisconnected();
    });

    ws.addEventListener('error', (err) => {
      // Suppress noise from a socket that's already being torn down (or
      // has been superseded by a newer socket — happens under React
      // StrictMode's intentional double-mount in dev). Real errors on
      // the active socket still surface.
      const tearingDown = ws.readyState === WebSocket.CLOSING
        || ws.readyState === WebSocket.CLOSED;
      if (tearingDown) return;
      if (this.ws !== ws) return;
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
    //
    // Closing while the socket is still CONNECTING throws a browser-side
    // error ("WebSocket is closed before the connection is established").
    // This happens under React StrictMode's intentional double-mount in
    // dev. Defer the close to the open event so the handshake completes
    // before we tear down — the close still happens, just without the
    // noisy error.
    const ws = this.ws;
    if (ws) {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', () => {
          try { ws.close(); } catch { /* ignore */ }
        }, { once: true });
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.ws = null;
    this.isPeerConnected = false;
  }
}

export const wsRelayService = new WsRelayService();
