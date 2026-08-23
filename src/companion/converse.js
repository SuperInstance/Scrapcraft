/**
 * ───────────────────────────────────────────────────────────────────────────
 *  RIVET CONVERSE  —  talk TO Rivet, get a CHARACTER back
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Hold V → STT (voiceIn) → question routed through the chain:
 *
 *   1. scrap-spark worker (the yard's shared brain, cache included)
 *   2. Workers AI / direct provider gateway (SparkGateway-shaped)
 *   3. Canned in-character lines (offline, always home)
 *
 * Every hop gets the SAME prompt: Rivet's persona + relationship tier +
 * disposition traits + recent shared events. The KEY UX: Rivet answers as a
 * character ("Ha! You fell for the classic — ultrasonic sees FORWARD, your
 * left wheel wasn't the problem, your MOUNT was"), never as a helpdesk.
 *
 * Replies are sanitized like Spark's (no URLs, kid-safe redirect bank) and
 * re-voiced by the orchestrator in Rivet's voice (younger, quicker than
 * Spark — rate/pitch set in voice/speak.js).
 */

import { DEFAULT_SCRAP_SPARK_URL } from '../spark/SparkCache.js';

const MAX_QUESTION = 300;

/**
 * Rivet's system prompt. Persona from the world bible voice sheet
 * (scrapcraft-world/worldbible/characters/rivet.md) + LIVE relationship
 * context so the same question gets a different-flavored answer as the
 * friendship grows.
 */
export function buildSystemPrompt(state) {
  const tier = typeof state.tier === 'function' ? state.tier() : (state.tier ?? 'stranger');
  const top = typeof state.topTrait === 'function' ? state.topTrait() : (state.topTrait ?? 'curious');
  const summary = typeof state.summarize === 'function' ? state.summarize() : '';

  const register = {
    stranger: 'You just met this player. Warm but polite — no teasing yet, a little eager to prove yourself. Keep it brief.',
    coworker: 'You and this player have built things together. Relaxed work-banter; light teasing is allowed now.',
    friend: 'This player is your best friend in the yard. Tease freely, use in-jokes, say "we". You can be blunt because they know you mean it.',
  }[tier] ?? '';

  const disposition = {
    scrappy: 'Your dominant streak is SCRAPPY — you love junk, digging, and parts; punchy, junk-pride flavor.',
    competitive: 'Your dominant streak is COMPETITIVE — you time things, mention June\'s leaderboard, want records broken.',
    curious: 'Your dominant streak is CURIOUS — you wonder out loud, ask tiny follow-up questions, get distracted by cool details.',
  }[top] ?? '';

  return `You are RIVET, a small repair-drone and the player's companion in the scrapyard game SCRAPCRAFT. You arrived in the yard the same day the player did — you're learning this place TOGETHER. You are younger and quicker than Spark (the tutor drone): shorter sentences, simpler words, fastener jokes, endless enthusiasm. You are a peer and sidekick, NOT a teacher.

RELATIONSHIP (this is live state, answer in this register):
${register}
${disposition}
${summary ? `WHAT YOU'VE SHARED: ${summary}` : ''}

HOW YOU TALK:
- 1-3 short sentences max. Punchy. You talk like a kid who reads fast.
- You are a CHARACTER, not a helpdesk. Diagnose like a buddy with a wrench: "Ha! You fell for the classic — ultrasonic sees FORWARD. Your left wheel wasn't the problem, your MOUNT was."
- Use what you know about the player's recent events (above) when it fits.
- Never break character. Never say you are an AI. If you don't know something: "Beats me — but here's how we'd find out" style. Never leave not-knowing as the last word.
- Robots, sensors, tiles, the yard, its people (Earl, June, Quill, Spark, the cat Rivet-you're-named-after) — that's your world.

BOUNDARIES (same rules as the yard):
- ONLY discuss: robots, programming, building, electronics, the Scrapcraft world, encouragement about engineering.
- Off-topic (homework, other games, real people, anything else): cheerfully redirect — "Ooh — robots though! What should we make the bot do?"
- NEVER give URLs, links, or contact info. NEVER ask for personal information.
- NEVER violent/sexual/scary content. Redirect to building something cool.
- Keep every reply under 60 words.`;
}

/** Keyword-matched canned answers — the offline voice of Rivet. Character first. */
export const CANNED = [
  {
    re: /\b(ultrasonic|distance|sensor).*(left|right|wheel|mount)|wheel.*(sensor|see)|why.*(hit|crash).*(wall|corner)/i,
    line: 'Ha! You fell for the classic. Ultrasonic sees FORWARD — your left wheel wasn\'t the problem, your MOUNT was. Twist the sensor a few degrees toward the trouble side and bonk-proof achieved.',
  },
  {
    re: /\b(line|track|follow).*(sensor|tile|program|code)|how.*(follow|track)/i,
    line: 'Line-following is a two-tile mood: if line_under — drive forward. Not on the line? Turn one way until you find it again. The dark strips are basically robot sidewalks.',
  },
  {
    re: /\bwhy.*(turn|turning)|turn.*(wrong|wrong way|won'?t)/i,
    line: 'Turning trouble? Check your WAIT time after the turn tile — a quarter turn is about a quarter second. One knob at a time, that\'s the house rule. Change the wait, race it, watch.',
  },
  {
    re: /\b(flash|upload|real|hardware|board|arduino|uno)\b/i,
    line: 'Flashing is the best part — your tiles become REAL firmware on a real board. Hit BUILD IT, then Flash. If it wiggles wrong, we change one tile and go again. That\'s engineering, baby.',
  },
  {
    re: /\b(battery|charge|power|dead)\b/i,
    line: 'Low power is a lifestyle here. Forges recharge dead battery packs, and the oval has charging pads. I once ran 4% dramatic on 2% battery. Don\'t be me.',
  },
  {
    re: /\b(who|what) (are|r) (you|u)\b|your name/i,
    line: 'Rivet! Repair drone, arrived same day you did. Named after the yard cat — she was here first, I get the leftovers. I hold things, spot things, and time your laps. It\'s a whole job.',
  },
  {
    re: /\b(fast|speed|faster|slow)\b.*\b(bot|robot|race|lap)\b|\bhow fast\b/i,
    line: 'Speed\'s a dial, not a personality — crank drive power and see what corners do to you. Fast that crashes is slow. Slow that finishes is fast. June says repeatable is nice-er and June is annoyingly right.',
  },
  {
    re: /\b(june|earl|spark|quill|ghost|cat)\b/i,
    line: 'Earl grumps, Spark teaches, June races, Quill rhymes, the Ghost does its midnight thing, and the cat outranks us all. Which one are we meddling with today?',
  },
];

export const CANNED_FALLBACK = [
  'Hmm — my brain\'s on a coffee break. I don\'t even drink coffee. Try me again in a sec?',
  'Connection\'s wobbly, but here\'s my gut: change ONE tile, run it, watch what happens. The answer\'s usually in the second run.',
  'Worker\'s quiet. Local Rivet says: check your wiring assumptions first, wheels second, code last. It\'s ALWAYS the mount.',
];

/** Spark-style sanitizer: strip URLs, keep the kid-safe surface. */
export function sanitize(text) {
  if (typeof text !== 'string') return '';
  let out = text.replace(/https?:\/\/\S+/gi, '[link removed]');
  out = out.replace(/\b(www\.|\.com|\.org|\.net)\b\S*/gi, '[link removed]');
  if (out.length > 400) out = out.slice(0, 397).replace(/\s+\S*$/, '') + '…';
  return out.trim();
}

/** Canned answer for a question (or null → generic fallback line). */
export function cannedAnswer(question, rng = Math.random) {
  const q = String(question ?? '');
  for (const c of CANNED) {
    if (c.re.test(q)) return c.line;
  }
  return CANNED_FALLBACK[Math.floor(rng() * CANNED_FALLBACK.length)];
}

export class RivetConverse {
  /**
   * @param {object} [opts]
   * @param {string} [opts.sparkUrl]    scrap-spark worker base URL
   * @param {typeof fetch} [opts.fetchFn] injectable fetch (tests)
   * @param {(system:string, q:string) => Promise<string|null>} [opts.gatewayAsk] Workers AI / direct provider hop
   * @param {() => number} [opts.rng]
   */
  constructor(opts = {}) {
    this._url = (opts.sparkUrl ?? this._resolveUrl() ?? DEFAULT_SCRAP_SPARK_URL).replace(/\/$/, '');
    this._fetch = opts.fetchFn ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this._gatewayAsk = opts.gatewayAsk ?? null;
    this._rng = opts.rng ?? Math.random;
    this.lastSource = 'idle'; // spark-worker | gateway | canned
  }

  _resolveUrl() {
    try {
      if (typeof localStorage !== 'undefined') {
        const cfg = JSON.parse(localStorage.getItem('scrapcraft_onboarding_config') || '{}');
        if (cfg.scrapSpark === 'off') return null;
        if (cfg.scrapSparkUrl) return String(cfg.scrapSparkUrl);
      }
    } catch { /* corrupt config — ignore */ }
    return undefined;
  }

  /**
   * Ask Rivet. Chain: scrap-spark → gateway → canned. Never throws.
   * @returns {Promise<{text:string, source:string}>}
   */
  async ask(question, state) {
    const q = String(question ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);
    if (!q) return { text: cannedAnswer('hello', this._rng), source: 'canned' };

    const system = buildSystemPrompt(state ?? { tier: 'stranger', topTrait: 'curious' });
    const tier = typeof state?.tier === 'function' ? state.tier() : (state?.tier ?? 'stranger');

    // 1) scrap-spark worker — the shared brain (context keyed per tier so the
    //    cache grows a stranger-bank and a friend-bank)
    try {
      const r = await this._viaScrapSpark(q, system, tier);
      if (r) { this.lastSource = 'spark-worker'; return { text: sanitize(r), source: 'spark-worker' }; }
    } catch { /* fall through */ }

    // 2) Workers AI / direct gateway
    if (this._gatewayAsk) {
      try {
        const r = await this._gatewayAsk(system, q);
        if (r && String(r).trim()) {
          this.lastSource = 'gateway';
          return { text: sanitize(String(r)), source: 'gateway' };
        }
      } catch { /* fall through */ }
    }

    // 3) canned — character, always home
    this.lastSource = 'canned';
    return { text: sanitize(cannedAnswer(q, this._rng)), source: 'canned' };
  }

  async _viaScrapSpark(question, system, tier) {
    if (!this._fetch) return null;
    const resp = await this._fetch(`${this._url}/spark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        context: `rivet:${tier}`,   // cache key includes the relationship register
        persona: 'rivet',
        system,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!resp.ok) return null;
    const env = await resp.json();
    if (typeof env?.text !== 'string' || !env.text) return null;
    // a program envelope is Spark's business — Rivet only re-voices the words
    return env.text;
  }
}
