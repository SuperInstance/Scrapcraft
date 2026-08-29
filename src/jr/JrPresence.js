/**
 * ───────────────────────────────────────────────────────────────────────────
 *  JR PRESENCE  —  the live-presence seam for Scrapcraft Jr
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  SEAM, NOT A FAKE. Scrapcraft's fleet plumbing is request/response today
 *  (SaveBackend saves, ClassRoom joins, scrap-spark gallery) — there is no
 *  WebSocket / Durable-Object live layer yet. When a kid finishes a Jr build,
 *  the showcase wall (JrShowcase) is the shared surface; teammates' bots do
 *  NOT roam the yard in real time.
 *
 *  This module defines the interface that layer will plug into, so wiring it
 *  later touches exactly one file. A future implementation (Cloudflare
 *  Durable Object + WebSocket, or SSE + Worker) implements:
 *
 *    class LivePresence extends JrPresence {
 *      async connect()   { /* open the socket, send hello           *\/ }
 *      onPeer(entry)     { /* render teammate bot in the yard       *\/ }
 *      onPeerGone(id)    { /* despawn                              *\/ }
 *      publish(entry)    { /* push my Jr build to peers            *\/ }
 *      close()           { /* goodbye                              *\/ }
 *    }
 *
 *  The offline default answers every call with a no-op so callers never
 *  branch on availability. UI surfaces (JrShowcase cards, yard bots) check
 *  `isLive` only for cosmetic badges — never for correctness.
 */

export class JrPresence {
  /** @returns {boolean} false — the offline seam is never live. */
  get isLive() { return false; }

  /** Peer list snapshot. Offline: always empty. */
  get peers() { return []; }

  /** Register a callback for presence events ({type:'join'|'leave'|'build', …}).
   *  Offline: returns an unsubscribe fn that does nothing. */
  subscribe(_cb) { return () => {}; }

  /** Announce a build to peers. Offline: resolves immediately. */
  async publish(_entry) { return false; }

  /** Announce departure. Offline: no-op. */
  close() {}
}

/** The singleton the game uses. Swap when the live layer lands. */
export const jrPresence = new JrPresence();
