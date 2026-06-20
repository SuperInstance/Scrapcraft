/**
 * Procedural audio using Web Audio API.
 * No files, no loading — every sound is synthesized.
 */

export class AudioSystem {
  constructor() {
    this._ctx = null;
    this._enabled = true;
    this._masterGain = null;
    this._footTimer = 0;
  }

  _ensure() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = 0.4;
    this._masterGain.connect(this._ctx.destination);
  }

  _resume() {
    if (this._ctx?.state === 'suspended') this._ctx.resume();
  }

  toggle() { this._enabled = !this._enabled; if (this._masterGain) this._masterGain.gain.value = this._enabled ? 0.4 : 0; }

  // ── synthesis helpers ─────────────────────────────────────────────────

  _osc(freq, type, start, dur, gainPeak = 0.5, dest = null) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainPeak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain);
    gain.connect(dest ?? this._masterGain);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    return { osc, gain };
  }

  _noise(dur, gainPeak, filterFreq, start) {
    const ctx = this._ctx;
    const bufLen = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    src.start(start);
    src.stop(start + dur);
  }

  // ── Sound effects ─────────────────────────────────────────────────────

  /** Metallic clank when mining a block */
  mine(blockId) {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    // Metallic impact: high-freq noise burst + pitched ring
    const freq = 300 + (blockId * 137 % 400);
    this._osc(freq, 'sawtooth', t, 0.25, 0.4);
    this._osc(freq * 1.5, 'square', t, 0.15, 0.2);
    this._noise(0.12, 0.3, freq * 2, t);
  }

  /** Short chime when picking up an item */
  pickup() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._osc(880, 'sine', t, 0.15, 0.25);
    this._osc(1320, 'sine', t + 0.05, 0.1, 0.15);
  }

  /** Crafting — mechanical whirr + success chime */
  craft() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    // Mechanical sequence
    for (let i = 0; i < 4; i++) {
      this._osc(200 + i * 80, 'sawtooth', t + i * 0.07, 0.07, 0.2);
    }
    // Success ding
    this._osc(1047, 'sine', t + 0.32, 0.3, 0.3);
    this._osc(1319, 'sine', t + 0.38, 0.25, 0.25);
    this._osc(1568, 'sine', t + 0.44, 0.25, 0.25);
  }

  /** Quest complete fanfare */
  questComplete() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    const melody = [523, 659, 784, 1047];
    melody.forEach((f, i) => this._osc(f, 'sine', t + i * 0.12, 0.3, 0.35));
    this._osc(1047, 'triangle', t + 0.55, 0.5, 0.4);
  }

  /** Earl grunts before speaking */
  earlSpeak() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._osc(120, 'sawtooth', t, 0.08, 0.15);
    this._osc(100, 'sawtooth', t + 0.06, 0.12, 0.12);
  }

  /** Achievement unlocked */
  achievement() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    [659, 784, 1047, 1319].forEach((f, i) => this._osc(f, 'sine', t + i * 0.09, 0.25, 0.3));
  }

  /** Spark when near forge/smelter */
  spark() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._noise(0.08, 0.2, 3000 + Math.random() * 2000, t);
  }

  /** Footstep on different surfaces */
  footstep(surface = 'dirt') {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    const configs = {
      dirt:    { f: 80,  g: 0.15 },
      metal:   { f: 300, g: 0.2  },
      concrete:{ f: 150, g: 0.18 },
    };
    const { f, g } = configs[surface] ?? configs.dirt;
    this._noise(0.06, g, f, t);
    this._osc(f * 0.7, 'sawtooth', t, 0.05, g * 0.5);
  }

  /** Gentle ambient hum (looped externally via setInterval) */
  ambientTick() {
    if (!this._enabled || Math.random() > 0.3) return;
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    const freq = 60 + Math.random() * 40;
    const { gain } = this._osc(freq, 'sine', t, 1.5, 0.04);
  }

  /** Dull thud when placing a block */
  place() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._noise(0.1, 0.22, 180, t);
    this._osc(100, 'sawtooth', t, 0.07, 0.12);
  }

  /** Error/fail sound */
  error() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._osc(220, 'sawtooth', t, 0.1, 0.2);
    this._osc(180, 'sawtooth', t + 0.08, 0.15, 0.2);
  }

  /** Lap complete — quick celebratory beeps */
  lapComplete(isRecord = false) {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    if (isRecord) {
      // New record: ascending arpeggio + long held note
      [523, 659, 784, 1047, 1319].forEach((f, i) => this._osc(f, 'sine', t + i * 0.08, 0.28, 0.35));
      this._osc(1319, 'triangle', t + 0.45, 0.6, 0.4);
    } else {
      // Regular lap: simple 3-note finish
      [523, 784, 1047].forEach((f, i) => this._osc(f, 'sine', t + i * 0.1, 0.22, 0.3));
    }
  }

  /** Bot brain loaded — small synthesizer bloop */
  brainLoad() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._osc(440, 'triangle', t, 0.08, 0.2);
    this._osc(660, 'sine',     t + 0.06, 0.12, 0.18);
    this._osc(880, 'sine',     t + 0.11, 0.1,  0.15);
  }

  /** Bot program stopped */
  brainStop() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._osc(440, 'triangle', t,      0.12, 0.15);
    this._osc(330, 'sine',     t + 0.08, 0.15, 0.12);
  }

  /** Floodlight placed — electrical hum startup */
  floodOn() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._osc(120, 'sawtooth', t, 0.15, 0.08);
    this._osc(240, 'sine',     t + 0.05, 0.3, 0.06);
    this._osc(360, 'sine',     t + 0.1,  0.25, 0.05);
  }

  /** Sprint-start burst */
  sprint() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._noise(0.06, 0.1, 800, t);
    this._osc(300, 'sawtooth', t, 0.05, 0.08);
  }

  /** Thunder crack + rumble */
  thunder() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    // Sharp crack
    this._noise(0.08, 0.28, 220, t);
    // Low rumble that decays slowly
    this._noise(1.8, 0.18, 60, t + 0.04);
    this._noise(1.2, 0.12, 100, t + 0.06);
  }

  /** Rain start — soft hiss swell */
  rainStart() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._noise(0.9, 0.06, 3000, t);
    this._noise(1.2, 0.05, 6000, t + 0.3);
  }

  /** Rain stop — soft hiss fade-out (same noise, quieter) */
  rainStop() {
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    this._noise(0.6, 0.03, 4000, t);
  }

  /** Zone ambient — called by Game when band changes */
  playBandAmbient(bandIdx) {
    if (!this._enabled) return;
    this._ensure(); this._resume();
    const t = this._ctx.currentTime;
    switch (bandIdx) {
      case 0: // Yard Gate — distant birds + light breeze
        this._osc(2400 + Math.random()*400, 'sine', t, 0.4, 0.025);
        this._osc(3200 + Math.random()*300, 'sine', t+0.2, 0.3, 0.02);
        this._noise(0.8, 0.012, 800, t+0.1);
        break;
      case 1: // Industrial — low machinery hum
        this._osc(55, 'sawtooth', t, 1.2, 0.04);
        this._osc(110, 'sawtooth', t+0.05, 1.0, 0.025);
        this._noise(0.6, 0.022, 400, t+0.3);
        break;
      case 2: // Circuit City — glitchy electronic chirps
        [800, 1200, 1600, 2000].forEach((f, i) => {
          if (Math.random() < 0.5)
            this._osc(f, 'square', t + i * 0.07, 0.08, 0.018);
        });
        this._osc(80, 'sine', t, 0.9, 0.03);
        break;
      case 3: // Deep Yard — low wind + eerie crystal resonance
        this._noise(1.4, 0.03, 150, t);
        this._osc(220, 'sine', t, 1.0, 0.02);
        this._osc(440, 'sine', t+0.4, 0.6, 0.015);
        break;
    }
  }

  tick(dt, player, world) {
    // Footstep rhythm
    const moving = player._keys?.['KeyW'] || player._keys?.['KeyS'] || player._keys?.['KeyA'] || player._keys?.['KeyD'];
    if (moving && player.onGround) {
      this._footTimer += dt;
      if (this._footTimer > 0.4) {
        this._footTimer = 0;
        const bx = Math.floor(player.pos.x), bz = Math.floor(player.pos.z);
        const surface = world.getBlock(bx, 0, bz);
        this.footstep(surface >= 3 ? 'metal' : surface === 2 ? 'concrete' : 'dirt');
      }
    } else {
      this._footTimer = 0;
    }

    // Periodic zone ambient stings (every ~15s)
    this._ambientZoneTimer = (this._ambientZoneTimer ?? 0) + dt;
    if (this._ambientZoneTimer >= 15 && this._currentBand != null) {
      this._ambientZoneTimer = 0;
      if (this._enabled) this.playBandAmbient(this._currentBand);
    }
  }
}
