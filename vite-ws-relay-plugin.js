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
 *
 * Liveness:
 *   The server pings every connected socket every PING_INTERVAL_MS.
 *   Sockets that don't respond within PING_INTERVAL_MS are terminated and
 *   their slot is freed, so a zombie WebSocket (e.g. a tab the OS killed
 *   without firing 'close' cleanly) can't permanently occupy the creator
 *   or helper slot. See docs/walkthrough_findings_2026-04-25_spotcheck.md
 *   NF1 for the failure mode this prevents.
 *
 * Diagnostics:
 *   Server prints `[ws-relay]` lines on JOIN, CLOSE, EVICT, and tryPair so a
 *   researcher running back-to-back dyads can see pairing health without
 *   leaving their terminal.
 */

const PING_INTERVAL_MS = 15000;

function logRelay(...args) {
  console.log('[ws-relay]', ...args);
}

export default function wsRelayPlugin() {
  return {
    name: 'ws-relay',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });

      let creator = null;
      let helper = null;
      let researcher = null;
      const participants = new Set();

      function pairState() {
        return `creator=${creator ? 'present' : 'empty'} helper=${helper ? 'present' : 'empty'} researcher=${researcher ? 'present' : 'empty'} participants=${participants.size}`;
      }

      function tryPair() {
        if (creator && helper) {
          const msg = JSON.stringify({ type: 'PAIRED' });
          creator.send(msg);
          helper.send(msg);
          logRelay('PAIRED creator+helper');
        } else {
          logRelay(`tryPair: ${pairState()}`);
        }
      }

      function clearSlot(role, ws) {
        // Only clear the slot if it's still pointing at the same socket — this
        // protects against the scenario where a new client overwrote the slot
        // between the old client's close/timeout and our cleanup running.
        if (role === 'researcher' && researcher === ws) {
          researcher = null;
        } else if (role === 'participant') {
          participants.delete(ws);
        } else if (role === 'creator' && creator === ws) {
          creator = null;
        } else if (role === 'helper' && helper === ws) {
          helper = null;
        }
      }

      wss.on('connection', (ws) => {
        let role = null;
        // Heartbeat liveness state — ws.isAlive flips to true on every pong.
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

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
            logRelay(`JOIN role=${role} | ${pairState()}`);
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

          // Participant → researcher (used by Probe 2a's AI-edit WoZ so the
          // participant device can surface its request on a separate
          // researcher device). Participants don't talk to creator/helper.
          if (role === 'participant') {
            if (researcher && researcher.readyState === 1) {
              researcher.send(raw.toString());
            }
            return;
          }

          // Creator/helper relay to each other AND to researcher (so the
          // dashboard can observe Ask-AI requests etc. without needing a
          // separate ?mode=researcher tab on the probe page).
          const peer = role === 'creator' ? helper : creator;
          const targets = [peer, researcher].filter(
            (t) => t && t.readyState === 1
          );
          for (const target of targets) {
            target.send(raw.toString());
          }
        });

        ws.on('close', () => {
          if (!role) {
            // Disconnected before sending JOIN — nothing to clean up.
            return;
          }
          const peer = role === 'creator' ? helper : creator;
          clearSlot(role, ws);
          logRelay(`CLOSE role=${role} | ${pairState()}`);
          if ((role === 'creator' || role === 'helper') && peer && peer.readyState === 1) {
            peer.send(JSON.stringify({ type: 'PEER_DISCONNECTED' }));
          }
        });
      });

      // Heartbeat: every interval, terminate sockets that didn't pong since
      // last tick, then ping all surviving sockets. terminate() fires the
      // 'close' handler, which clears the slot — so pairing recovers
      // automatically on the next JOIN.
      const heartbeat = setInterval(() => {
        wss.clients.forEach((ws) => {
          if (ws.isAlive === false) {
            logRelay(`EVICT (no pong) | ${pairState()}`);
            return ws.terminate();
          }
          ws.isAlive = false;
          try { ws.ping(); } catch { /* socket may be closing */ }
        });
      }, PING_INTERVAL_MS);

      wss.on('close', () => clearInterval(heartbeat));

      // Intercept HTTP upgrade requests on the /__ws_relay path
      server.httpServer.on('upgrade', (req, socket, head) => {
        if (req.url === '/__ws_relay') {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });

      logRelay(`plugin attached, heartbeat=${PING_INTERVAL_MS}ms`);
    },
  };
}
