import { WebSocketServer } from 'ws';

/**
 * Vite plugin that runs a WebSocket relay on the dev server.
 * Pairs one "creator" and one "helper" client automatically.
 * Also supports a "researcher" role (broadcasts to all) and
 * multiple "participant" roles (receive broadcasts).
 *
 * Protocol:
 *   Client → Server:  { type: 'JOIN', role: 'creator'|'helper'|'researcher'|'participant' }
 *   Server → Client:  { type: 'PAIRED' }       — when both roles are connected
 *   Server → Client:  { type: 'PEER_DISCONNECTED' } — when the other peer drops
 *   After pairing, every message from one peer is relayed to the other.
 *   Researcher messages are broadcast to all connected clients.
 */
export default function wsRelayPlugin() {
  return {
    name: 'ws-relay',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });

      let creator = null;
      let helper = null;
      let researcher = null;
      const participants = new Set();

      function tryPair() {
        if (creator && helper) {
          const msg = JSON.stringify({ type: 'PAIRED' });
          creator.send(msg);
          helper.send(msg);
        }
      }

      wss.on('connection', (ws) => {
        let role = null;

        ws.on('message', (raw) => {
          let msg;
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            return;
          }

          if (msg.type === 'JOIN') {
            role = msg.role;
            if (role === 'creator') {
              creator = ws;
            } else if (role === 'helper') {
              helper = ws;
            } else if (role === 'researcher') {
              researcher = ws;
            } else if (role === 'participant') {
              participants.add(ws);
            }
            tryPair();
            return;
          }

          // Researcher broadcasts to all clients
          if (role === 'researcher') {
            const targets = [creator, helper, ...participants].filter(
              (t) => t && t.readyState === 1
            );
            for (const target of targets) {
              target.send(raw.toString());
            }
            return;
          }

          // Creator/helper relay to each other (existing behavior)
          const peer = role === 'creator' ? helper : creator;
          if (peer && peer.readyState === 1) {
            peer.send(raw.toString());
          }
        });

        ws.on('close', () => {
          if (role === 'researcher') {
            researcher = null;
          } else if (role === 'participant') {
            participants.delete(ws);
          } else {
            const peer = role === 'creator' ? helper : creator;
            if (role === 'creator') creator = null;
            if (role === 'helper') helper = null;
            if (peer && peer.readyState === 1) {
              peer.send(JSON.stringify({ type: 'PEER_DISCONNECTED' }));
            }
          }
        });
      });

      // Intercept HTTP upgrade requests on the /__ws_relay path
      server.httpServer.on('upgrade', (req, socket, head) => {
        if (req.url === '/__ws_relay') {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });
    },
  };
}
