/**
 * ───────────────────────────────────────────────────────────────────────────
 *  INFERENCE CHIPS  —  intelligence as a part you grow, not an API you call
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Canon: ai-writings/papers/223-inference-chips.md. A chip in Scrapcraft is
 *  not manufactured — it is GROWN: a wafer of salvaged silicon seeded in the
 *  acid bath, left on the cold shelf, cracked free in the morning. Growth is
 *  stochastic-but-seeded: same wafer + same shard count + same night gives
 *  the same crystal, so kids can engineer the growth conditions.
 *
 *  Every crystal has a MASK — the physical lattice of what it may read,
 *  locked at growth time. A SENTRY chip literally cannot see the gallery
 *  wall. The mask is not a permission system; it is the chip's shape. In
 *  compile() terms: an agentic tile whose chip isn't mounted is an ERROR,
 *  not a warning. The lattice doesn't bend.
 *
 *  A cracked chip (grown too fast — too many failure shards in the bath)
 *  keeps its mask but mumbles: timing fires ±15% within seeded bounds.
 *  This is canon, not a bug. A cracked ECHO that replays your path
 *  slightly wrong is more fun than a working one.
 *
 *  Pure logic, zero DOM, zero Three.js — headless-testable. The growth
 *  clock is fed by the game loop (ChipForge.tick(dtMs)); tests drive it
 *  by hand.
 * ───────────────────────────────────────────────────────────────────────────
 */

// ── The six chips (v0 — one per doctrine organ) ────────────────────────────
// mask        what the lattice may read (locked at growth time)
// tile        the agentic actuator it unlocks (primitives.js id)
// temperament what more failure shards do to the growth

export const CHIPS = {
  echo: {
    id: 'echo',
    label: 'ECHO',
    icon: '🔁',
    mask: 'the road behind',
    maskHint: 'only remembers the path it walked',
    tile: 'remember_path',
    tileLabel: 'remember-path',
    organ: 'rd / walks',
    temperament: 'more shards → a more stubborn replay',
    hw: { peripheral: 'ring buffer in SRAM/EEPROM', pin: 'internal' },
  },
  sentry: {
    id: 'sentry',
    label: 'SENTRY',
    icon: '🛰️',
    mask: 'the yard ahead',
    maskHint: 'only infers from what is in front of it',
    tile: 'watch_obstacle',
    tileLabel: 'watch-obstacle',
    organ: 'elephant / perception',
    temperament: 'more shards → a jumpier trip wire',
    hw: { peripheral: 'HC-SR04 ultrasonic + hysteresis', pin: 'TRIG=5, ECHO=18' },
  },
  rumor: {
    id: 'rumor',
    label: 'RUMOR',
    icon: '📻',
    mask: 'the gallery wall',
    maskHint: 'only hears what a neighbor bot said',
    tile: 'hear_share',
    tileLabel: 'hear-share',
    organ: 'The Tap',
    temperament: 'more shards → a garbled fact byte',
    hw: { peripheral: 'UART serial link (bot-to-bot)', pin: 'TX=17, RX=16' },
  },
  witness: {
    id: 'witness',
    label: 'WITNESS',
    icon: '📓',
    mask: 'the journal',
    maskHint: 'only writes down what happened',
    tile: 'log_tick',
    tileLabel: 'log-tick',
    organ: "Mo's Ledger / quilt journals",
    temperament: 'more shards → slower, moodier entries',
    hw: { peripheral: 'EEPROM / NVS milestone counters', pin: 'I2C bus' },
  },
  pilot: {
    id: 'pilot',
    label: 'PILOT',
    icon: '🎯',
    mask: 'the track',
    maskHint: 'only sees the marked line, no waypoints',
    tile: 'seek_line',
    tileLabel: 'seek-line',
    organ: 'quilt geometry',
    temperament: 'more shards → a hunting, oscillating steer',
    hw: { peripheral: 'TCRT5000 IR pair (P-control)', pin: 'A1, A2' },
  },
  ember: {
    id: 'ember',
    label: 'EMBER',
    icon: '🔥',
    mask: 'its own heat',
    maskHint: 'only feels its own battery and warmth',
    tile: 'keep_warm',
    tileLabel: 'keep-warm',
    organ: 'paper 221, residency',
    temperament: 'more shards → parks earlier, colder',
    hw: { peripheral: 'INA219 voltage sense + status LED', pin: 'SDA=21, SCL=22' },
  },
};

export const CHIP_IDS = Object.keys(CHIPS);

/** Two sockets on the Arduino at v0 (set by the BUILD bench). */
export const SOCKET_COUNT = 2;

// ── Growth recipe constants ─────────────────────────────────────────────────

/** Cold-shelf time in forge-ms (real minutes, ticked by the game loop). */
export const SHELF_MS = 2 * 60 * 1000;           // two real minutes, v0
/** Failure shards at or below this grow clean; above it, the seed decides. */
export const SHARD_CRACK_THRESHOLD = 3;
export const MAX_SHARDS = 6;
/** Cracked timing mumble: seeded jitter within ±15% (canon). */
export const JITTER_BOUNDS = 0.15;
/** ECHO ring buffer capacity + replay step (shared by sim + firmware). */
export const ECHO_CAP = 64;
export const ECHO_STEP_S = 0.5;

// ── Deterministic crypto + seeded RNG (pure JS, sync, no deps) ──────────────

/**
 * Pure-JS SHA-256 → hex string. Sync on purpose: growth is decided on the
 * game thread at shelf-start, and tests must not depend on async WebCrypto.
 */
export function sha256Hex(msg) {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const rr = (v, n) => (v >>> n) | (v << (32 - n));

  const bytes = new TextEncoder().encode(String(msg));
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));

  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,
      h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;

  const w = new Int32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i-15],7) ^ rr(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rr(w[i-2],17) ^ rr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0;
    h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(x => (x >>> 0).toString(16).padStart(8,'0')).join('');
}

/** Deterministic PRNG (mulberry32) seeded from a hex string. */
export function rngFromSeed(seedHex) {
  let a = parseInt(String(seedHex).slice(0, 8), 16) >>> 0;
  if (Number.isNaN(a)) a = 0x9e3779b9;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Growth math ─────────────────────────────────────────────────────────────

/**
 * The growth seed: SHA-256 of (recipe + shard count + shelf start tick).
 * Deterministic per world-night — same wafer, same bath, same tick →
 * the same crystal, forever.
 */
export function growthSeed({ type, shards, shelfStartTick } = {}) {
  const recipe = `chip:${type ?? 'unknown'}|wafer:1|acid:1`;   // the recipe v0
  return sha256Hex(`${recipe}|shards:${shards}|tick:${shelfStartTick}`);
}

/**
 * Decide a growth the moment it leaves the acid bath for the shelf.
 * Returns { seed, cracked, jitter, temperament }.
 *
 *   cracked  shards <= SHARD_CRACK_THRESHOLD → never.
 *            above it → seeded draw; odds climb with each extra shard.
 *   jitter   1.0 when clean; seeded within ±15% when cracked (the mumble).
 */
export function growOutcome({ type, shards, shelfStartTick } = {}) {
  const seed = growthSeed({ type, shards, shelfStartTick });
  const rng = rngFromSeed(seed);
  const n = Math.max(0, Math.min(MAX_SHARDS, Math.floor(Number(shards) || 0)));
  let cracked = false;
  if (n > SHARD_CRACK_THRESHOLD) {
    const odds = Math.min(0.9, (n - SHARD_CRACK_THRESHOLD) * 0.3);
    cracked = rng() < odds;
  }
  const jitter = cracked
    ? 1 + (rng() * 2 - 1) * JITTER_BOUNDS      // seeded ±15%
    : 1.0;
  return { seed, cracked, jitter, temperament: CHIPS[type]?.temperament ?? '' };
}

/** Build a finished chip record (what COLLECT hands the kid). */
export function makeChip({ type, shards, shelfStartTick, uid } = {}) {
  if (!CHIPS[type]) throw new Error(`makeChip: unknown chip type "${type}"`);
  const { seed, cracked, jitter, temperament } = growOutcome({ type, shards, shelfStartTick });
  return {
    uid: uid ?? `${type}-${shelfStartTick}`,
    type,
    label: CHIPS[type].label,
    seed,
    shards: Math.max(0, Math.min(MAX_SHARDS, Math.floor(Number(shards) || 0))),
    cracked,
    jitter,
    temperament,
    mask: CHIPS[type].mask,
  };
}

// ── ChipForge — the acid bath, the cold shelf, the two sockets ──────────────

export class ChipForge {
  constructor() {
    this.tickMs = 0;          // forge clock, advanced by the game loop
    this.growing = [];        // [{ uid, type, shards, shelfStartTick, doneMs }]
    this.ready = [];          // finished chips, waiting to be collected
    this.mounted = new Array(SOCKET_COUNT).fill(null);   // sockets → chip | null
  }

  /** Game-loop tick. Advances the clock; finished growths move to `ready`.
   *  Returns the chips that finished this tick (for fanfare). */
  tick(dtMs = 0) {
    this.tickMs += Math.max(0, Number(dtMs) || 0);
    const finished = [];
    this.growing = this.growing.filter(g => {
      if (this.tickMs >= g.doneMs) { finished.push(g); return false; }
      return true;
    });
    for (const g of finished) this.ready.push(makeChip(g));
    return finished.map(g => g.uid);
  }

  /** Seed a new growth (wafer + acid + shards already consumed by the caller).
   *  Returns the growth record, or null if the type is unknown / forge busy. */
  startGrowth(type, shards = 0) {
    if (!CHIPS[type]) return null;
    if (this.growing.some(g => g.type === type)) return null;   // one bath per type
    const n = Math.max(0, Math.min(MAX_SHARDS, Math.floor(Number(shards) || 0)));
    const g = {
      uid: `${type}-${this.tickMs}`,
      type,
      shards: n,
      shelfStartTick: this.tickMs,
      doneMs: this.tickMs + SHELF_MS,
    };
    this.growing.push(g);
    return g;
  }

  shelfRemaining(g) { return Math.max(0, (g?.doneMs ?? 0) - this.tickMs); }

  /** Crack a finished chip off the shelf. Returns the chip or null. */
  collect(uid) {
    const idx = this.ready.findIndex(c => c.uid === uid);
    if (idx === -1) return null;
    return this.ready.splice(idx, 1)[0];
  }

  /** Mount a collected chip into a socket (0..SOCKET_COUNT-1). */
  mount(uid, socket = 0) {
    if (socket < 0 || socket >= SOCKET_COUNT) return false;
    const chip = this.ready.find(c => c.uid === uid);
    if (!chip || this.mounted.some(c => c?.uid === uid)) return false;
    this.unmount(socket);
    this.mounted[socket] = chip;
    this.ready.splice(this.ready.findIndex(c => c.uid === uid), 1);
    return true;
  }

  /** Pop whatever is in a socket (back to `ready`). Returns the chip or null. */
  unmount(socket = 0) {
    if (socket < 0 || socket >= SOCKET_COUNT) return null;
    const chip = this.mounted[socket];
    this.mounted[socket] = null;
    if (chip) this.ready.push(chip);
    return chip;
  }

  /** Types currently mounted — gates which agentic tiles compile. */
  mountedTypes() { return this.mounted.filter(Boolean).map(c => c.type); }

  /** Full descriptors of mounted chips — stamped onto the TileProgram so
   *  codegen can apply seeded jitter honestly. */
  mountedDescriptors() {
    return this.mounted.filter(Boolean).map(c => ({
      type: c.type, seed: c.seed, cracked: c.cracked, jitter: c.jitter,
    }));
  }

  /** True when an Arduino (with its sockets) is bolted on AND a chip sits in one. */
  get hasMountedChip() { return this.mounted.some(Boolean); }

  toSaveData() {
    return {
      tickMs: this.tickMs,
      growing: this.growing.map(g => ({ ...g })),
      ready: this.ready.map(c => ({ ...c })),
      mounted: this.mounted.map(c => (c ? { ...c } : null)),
    };
  }

  fromSaveData(data = {}) {
    this.tickMs  = Number(data.tickMs) || 0;
    this.growing = Array.isArray(data.growing) ? data.growing.map(g => ({ ...g })) : [];
    this.ready   = Array.isArray(data.ready)   ? data.ready.filter(c => CHIPS[c.type]).map(c => ({ ...c })) : [];
    const m = Array.isArray(data.mounted) ? data.mounted : [];
    this.mounted = new Array(SOCKET_COUNT).fill(null)
      .map((_, i) => (m[i] && CHIPS[m[i].type] ? { ...m[i] } : null));
  }
}
