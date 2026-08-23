/**
 * SparkCache — the scrap-spark cloud client (pincher-cache aware).
 *
 * Talks to the scrap-spark Cloudflare Worker: SHA-256(question+context) →
 * R2/D1 cache on the server, X-Cache: HIT|MISS on every reply. This client
 * adds a second, local pinch: identical questions inside one session never
 * leave the browser at all.
 *
 * Doctrine: "model call heavy at first, then more and more canned responses."
 * A kid asking "how do I follow the line?" a second time — or a second kid in
 * a second classroom — is answered from the can.
 *
 * Failures are always graceful: ask() returns null and the caller falls back
 * to the next provider (direct API → offline recipes). The game never breaks
 * because the cloud is unreachable.
 */

export const DEFAULT_SCRAP_SPARK_URL = 'https://scrap-spark.casey-digennaro.workers.dev';

const LOCAL_TTL_MS = 30 * 60 * 1000; // 30 min local dedupe window
const MAX_QUESTION = 500;

export class SparkCache {
  /**
   * @param {object} [opts]
   * @param {string}  [opts.url]     worker base URL (defaults to deployed fleet worker)
   * @param {typeof fetch} [opts.fetchFn] injectable fetch (tests)
   */
  constructor(opts = {}) {
    this._url = (opts.url ?? this._resolveUrl() ?? DEFAULT_SCRAP_SPARK_URL).replace(/\/$/, '');
    this._fetch = opts.fetchFn ?? (typeof fetch === 'function'
      ? fetch.bind(globalThis)
      : null);
    /** @type {Map<string, {envelope: object, at: number}>} */
    this._local = new Map();
    this.stats = { asks: 0, localHits: 0, cloudHits: 0, misses: 0, errors: 0 };
    this.lastStatus = 'idle'; // idle|local-hit|HIT|MISS|error|disabled
  }

  /** Config resolution: localStorage onboarding > env > default. */
  _resolveUrl() {
    try {
      if (typeof localStorage !== 'undefined') {
        const cfg = JSON.parse(localStorage.getItem('scrapcraft_onboarding_config') || '{}');
        if (cfg.scrapSpark === 'off') return null;                 // explicitly disabled
        if (cfg.scrapSparkUrl) return String(cfg.scrapSparkUrl);   // teacher override
      }
    } catch { /* corrupt config — ignore */ }
    const env = import.meta.env?.VITE_SCRAP_SPARK_URL;
    return typeof env === 'string' && env ? env : undefined;
  }

  get enabled() { return this._url !== null && this._fetch !== null; }
  get url()     { return this._url; }

  /**
   * Ask Spark a question through the cached cloud.
   * @param {string} question  the kid's plain-English ask
   * @param {string} [context] coarse game context ("brain:tin|lap:2") — part of cache key
   * @returns {Promise<{text:string, program?:{name?:string, nodes:unknown[]}}|null>}
   *          null when disabled, unreachable, or the response is unusable.
   */
  async ask(question, context = '') {
    if (!this.enabled) { this.lastStatus = 'disabled'; return null; }
    const q = String(question ?? '').replace(/\s+/g, ' ').trim();
    if (!q || q.length > MAX_QUESTION) return null;
    const key = `${q.toLowerCase()}|${context}`;
    this.stats.asks++;

    // 1) local pinch — same session, same question: no network at all
    const cached = this._local.get(key);
    if (cached && Date.now() - cached.at < LOCAL_TTL_MS) {
      this.stats.localHits++;
      this.lastStatus = 'local-hit';
      return cached.envelope;
    }

    // 2) cloud (R2/D1 pincher cache on the other end)
    try {
      const resp = await this._fetch(`${this._url}/spark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const cacheHeader = String(resp.headers.get('x-cache') ?? '');
      const envelope = await resp.json();

      if (!_validEnvelope(envelope)) throw new Error('unusable envelope');

      this.lastStatus = cacheHeader.toUpperCase() === 'HIT' ? 'HIT' : 'MISS';
      if (this.lastStatus === 'HIT') this.stats.cloudHits++;
      else this.stats.misses++;

      this._local.set(key, { envelope, at: Date.now() });
      return envelope;
    } catch (err) {
      this.stats.errors++;
      this.lastStatus = 'error';
      return null; // graceful — caller falls through to next provider
    }
  }

  /**
   * Fetch today's challenge + failure of the week. Never throws.
   * @returns {Promise<{challenge:{id:string,title:string,brief:string}, failure_of_the_week:unknown[]}|null>}
   */
  async dailyChallenge() {
    if (!this.enabled) return null;
    try {
      const resp = await this._fetch(`${this._url}/daily-challenge`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.challenge ? data : null;
    } catch { return null; }
  }

  /**
   * Publish a build (or an interesting failure) to the shared wall. Never throws.
   * @param {{title:string, program:string, kind?:'build'|'failure', author?:string, note?:string, bot_name?:string}} entry
   */
  async publish(entry) {
    if (!this.enabled) return null;
    try {
      const resp = await this._fetch(`${this._url}/gallery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: String(entry.title ?? '').slice(0, 80),
          program: String(entry.program ?? ''),
          kind: entry.kind === 'failure' ? 'failure' : 'build',
          author: entry.author ? String(entry.author).slice(0, 40) : undefined,
          note: entry.note ? String(entry.note).slice(0, 300) : undefined,
          bot_name: entry.bot_name ? String(entry.bot_name).slice(0, 30) : undefined,
        }),
      });
      if (!resp.ok && resp.status !== 201) return null;
      return await resp.json();
    } catch { return null; }
  }

  /** List the shared wall. Never throws. */
  async gallery(kind = '', order = 'new') {
    if (!this.enabled) return null;
    try {
      const params = new URLSearchParams({ order });
      if (kind) params.set('kind', kind);
      const resp = await this._fetch(`${this._url}/gallery?${params}`);
      if (!resp.ok) return null;
      return await resp.json();
    } catch { return null; }
  }

  /** Debug string for HUD/tooltips: where answers are coming from. */
  describe() {
    return `scrap-spark ${this._url ?? '(disabled)'} — asks:${this.stats.asks} ` +
      `local:${this.stats.localHits} hit:${this.stats.cloudHits} miss:${this.stats.misses} err:${this.stats.errors}`;
  }
}

function _validEnvelope(env) {
  if (!env || typeof env !== 'object') return false;
  if (typeof env.text !== 'string' || !env.text) return false;
  if (env.program !== undefined) {
    if (!env.program || typeof env.program !== 'object' || !Array.isArray(env.program.nodes)) {
      return false; // a program without a nodes array is unusable — drop the whole envelope
    }
  }
  return true;
}
