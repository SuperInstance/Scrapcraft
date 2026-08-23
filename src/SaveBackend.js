/**
 * SaveBackend — localStorage-first persistence with async Cloudflare cloud sync.
 *
 * Strategy:
 *   WRITE: localStorage (sync, immediate) → Worker POST (async, fire-and-forget)
 *   READ:  localStorage fallback unless a cloud token is set, in which case
 *          we try GET /save and merge if the cloud version is newer.
 *
 * The Worker endpoint is optional. If it's unavailable or the user is anonymous,
 * all writes silently stay local and nothing breaks.
 *
 * Cloud save requires a session token. Currently tokens are issued via class codes
 * (ClassRoom.js) or via the onboarding wizard's Cloudflare Worker URL.
 */

const LOCAL_KEY = 'scrapcraft_save_v6';
const SESSION_KEY = 'scrapcraft_session';

export class SaveBackend {
  constructor(workerUrl = null) {
    this._workerUrl = workerUrl ?? this._detectWorkerUrl();
    this._sessionId = this._loadSession();
    this._cloudAvailable = !!this._workerUrl;
    this._lastCloudSync = 0;
    this._syncInFlight  = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Write save data. Always local-first; cloud async if available.
   *  `exit: true` rides a sendBeacon when possible — a fetch during
   *  beforeunload is not guaranteed to leave the page alive. */
  async write(data, { exit = false } = {}) {
    const serialized = JSON.stringify(data);
    try { localStorage.setItem(LOCAL_KEY, serialized); } catch { /* storage full */ }
    if (this._cloudAvailable && this._sessionId) {
      if (exit && this._beacon(serialized)) return;      // beacon sent — done
      this._cloudWrite(serialized).catch(() => {}); // fire-and-forget
    }
  }

  /** Best-effort unload-safe cloud write. True when a beacon was queued. */
  _beacon(body) {
    try {
      if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
      const url = `${this._workerUrl}/api/v1/save/beacon?sid=${encodeURIComponent(this._sessionId)}`;
      const blob = new Blob([body], { type: 'application/json' });
      return navigator.sendBeacon(url, blob);
    } catch { return false; }
  }

  /** Read save data. Returns parsed object or null. Cloud preferred if available. */
  async read() {
    if (this._cloudAvailable && this._sessionId) {
      try {
        const remote = await this._cloudRead();
        if (remote) {
          // Keep whichever is newer by lastSaved timestamp
          const local = this._readLocal();
          if (!local || new Date(remote.lastSaved) >= new Date(local.lastSaved ?? 0)) {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(remote));
            return remote;
          }
          return local;
        }
      } catch { /* cloud unavailable — fall through to local */ }
    }
    return this._readLocal();
  }

  /** Returns true if any save (local or cloud) exists. */
  async hasSave() {
    if (localStorage.getItem(LOCAL_KEY)) return true;
    if (!this._cloudAvailable || !this._sessionId) return false;
    try {
      const r = await fetch(`${this._workerUrl}/api/v1/save/check`, {
        headers: this._headers(),
      });
      return r.ok && (await r.json()).exists;
    } catch { return false; }
  }

  /** Delete all save data locally and in cloud. */
  async wipe() {
    localStorage.removeItem(LOCAL_KEY);
    if (this._cloudAvailable && this._sessionId) {
      await fetch(`${this._workerUrl}/api/v1/save`, {
        method: 'DELETE',
        headers: this._headers(),
      }).catch(() => {});
    }
  }

  /** Join a classroom. Returns { ok, displayName, classCode } or throws. */
  async joinClass(classCode, displayName) {
    if (!this._workerUrl) throw new Error('No cloud worker configured.');
    const r = await fetch(`${this._workerUrl}/api/v1/class/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classCode: classCode.toUpperCase(), displayName }),
    });
    if (!r.ok) throw new Error(`Join failed: ${r.status}`);
    const data = await r.json();
    this._sessionId = data.sessionId;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId: data.sessionId, classCode, displayName }));
    return data;
  }

  /** Create a classroom (teacher). Returns { classCode, teacherId }. */
  async createClass(teacherName) {
    if (!this._workerUrl) throw new Error('No cloud worker configured.');
    const r = await fetch(`${this._workerUrl}/api/v1/class/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherName }),
    });
    if (!r.ok) throw new Error(`Create failed: ${r.status}`);
    return r.json();
  }

  get sessionId() { return this._sessionId; }
  get workerUrl() { return this._workerUrl; }
  get hasCloud()  { return this._cloudAvailable && !!this._sessionId; }

  // ── Private ────────────────────────────────────────────────────────────────

  _readLocal() {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  async _cloudWrite(body) {
    if (this._syncInFlight) return;
    this._syncInFlight = true;
    try {
      await fetch(`${this._workerUrl}/api/v1/save`, {
        method: 'PUT',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body,
      });
      this._lastCloudSync = Date.now();
    } finally {
      this._syncInFlight = false;
    }
  }

  async _cloudRead() {
    const r = await fetch(`${this._workerUrl}/api/v1/save`, { headers: this._headers() });
    if (!r.ok) return null;
    return r.json();
  }

  _headers() {
    return this._sessionId ? { 'X-Scrapcraft-Session': this._sessionId } : {};
  }

  _loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw).sessionId : null;
    } catch { return null; }
  }

  _detectWorkerUrl() {
    // Honor onboarding config if it was set during the wizard
    try {
      const cfg = JSON.parse(localStorage.getItem('scrapcraft_onboarding_config') ?? '{}');
      return cfg.cfWorkerUrl ?? null;
    } catch { return null; }
  }
}
