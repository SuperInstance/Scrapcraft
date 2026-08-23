/**
 * SpectatorCoach — the coach/spectator mode (SPEC B).
 *
 * A free-fly spectate camera over the yard while a DEMO CREW of three bots
 * plays; you talk to them over half-duplex VHF radio (hold SPACE / T to
 * transmit — see VhfRadio.js and docs/VHF-DOCTRINE.md). Nudges are parsed
 * (NudgeRouter) and turned into waypoints / holds / race loops; the agent
 * answers on the radio in its own TTS voice.
 */

import * as THREE from 'three';
import { VhfRadio, RadioStack, MAX_TX_MS } from './VhfRadio.js';
import { parseNudge, NudgeRouter } from './NudgeRouter.js';
import { ScrapBot } from '../ScrapBot.js';
import {
  EXAMPLE_WALL_AVOIDER,
  EXAMPLE_LIGHT_RUNNER,
  EXAMPLE_WAYPOINT_NAV,
} from '../maker/TileProgram.js';
import { voiceOut, voiceIn } from '../voice/index.js';
import { B } from '../data/blocks.js';
import { EYE_HEIGHT } from '../Player.js';

// ── Oval circuit (Circuit City) — same loop the lap timer watches ──────────
const OVAL = { cx: 35, cz: 84, r: 14 };
const OVAL_WAYPOINTS = [];
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  OVAL_WAYPOINTS.push({ x: OVAL.cx + Math.cos(a) * OVAL.r, z: OVAL.cz + Math.sin(a) * OVAL.r });
}

// Demo crew: spawn offsets near the yard gate + programs + TTS voices.
// The racer runs the Waypoint Navigator brain — it is the one program that
// actually steers toward adapter.waypoint, so the coach's oval loop, 'goto',
// 'mine' and 'race' nudges visibly work on it.
const DEMO_CREW = [
  { slot: 'demo1', spawn: { x: 8, y: 2, z: 5 },  program: EXAMPLE_WALL_AVOIDER, voice: 'rivet' },
  { slot: 'demo2', spawn: { x: 6, y: 2, z: 8 },  program: EXAMPLE_LIGHT_RUNNER,  voice: 'bolt'  },
  { slot: 'demo3', spawn: { x: 11, y: 2, z: 7 }, program: EXAMPLE_WAYPOINT_NAV,  voice: 'juno', racer: true },
];

// Mine-scan targets (numeric ids — see src/data/blocks.js)
const MINEABLE = [B.SCRAP_PILE, B.RUST_METAL, B.CRYSTAL_ORE];

// Ack lines — 2-3 variants per intent, rotated per call. All prefixed 📻 in
// the HUD log; spoken in the bot's own voice.
const ACKS = {
  goto: [
    (n, dir) => `[ROGER] ${n} steering ${dir}.`,
    (n, dir) => `[COPY] heading ${dir}. ${n} rolling.`,
    (n, dir) => `[WILCO] ${dir} it is. ${n} on it.`,
  ],
  mine: [
    n => `[ROGER] ${n} sniffing out the good pile.`,
    n => `[COPY] mining run started. ${n} loves this part.`,
    n => `[ROGER] ore scan running. ${n} has a nose for scrap.`,
  ],
  stop: [
    () => '[HOLDING POSITION]',
    n => `[COPY] ${n} holding position. motors cold.`,
    n => `[ROGER] parked. ${n} will admire the scenery.`,
  ],
  follow: [
    n => `[ROGER] ${n} on your six.`,
    n => `[COPY] falling in behind you. — ${n}`,
    n => `[WILCO] ${n} is your shadow now.`,
  ],
  race: [
    n => `[ROGER] ${n} to the oval. bring sunglasses.`,
    n => `[COPY] race mode. ${n} was BUILT for this.`,
    n => `[ROGER] en route to the gate. — ${n}`,
  ],
  banter: [
    n => `[📻] ${n} appreciates that. bond up one.`,
    n => `[BLEEP] good talk, coach. — ${n}`,
    n => `[WHIRR] ${n} will remember that.`,
  ],
};

function compassOf(dx, dz) {
  if (!dx && !dz) return 'nowhere';
  // north = −Z in this yard (parseNudge uses the same convention)
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
    [Math.round(deg / 45) % 8];
}

export class SpectatorCoach {
  /** @param {import('../Game.js').Game} game */
  constructor(game) {
    this.game = game;

    this._active = false;
    this._from = 'menu';

    // Two radios, two channels — half-duplex per vessel, TX and RX never on
    // the same radio at once (VhfRadio enforces it; we surface it in the HUD).
    this.stack = new RadioStack({ onState: () => { this._hudDirty = true; } });
    this.router = new NudgeRouter();
    this.channel = 'coach';          // active channel: 'coach' | 'chatter'

    this.bots = [];                  // the demo crew (mirrors game._demoBots)
    this.followed = null;
    this._racers = new Map();        // bot → oval waypoint index

    // Free-fly camera state (owned while spectating)
    this._flyYaw = 0;
    this._flyPitch = 0;
    this._flySpeed = 12;             // m/s
    this._keys = {};                 // held movement keys
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v1 = new THREE.Vector3();

    // PTT / STT fail-soft
    this._pttDown = false;
    this._pttChannel = null;
    this._emptyTranscripts = 0;
    this._micFailed = false;

    // Agent ack (RX session): { speakerId, name, text, until, channel }
    this._ack = null;
    this._ackPending = null;         // ack waiting for the channel to go IDLE
    this._ackRotate = Object.create(null);

    // HUD
    this._hud = null;
    this._log = [];
    this._hudDirty = true;
    this._hudCache = { pill: '', channel: '', follow: '', roster: '', sub: '\u0000' };
    this._busyTimer = null;

    this._bindDom();                 // pause-overlay coach button + mouse look
  }

  // ── DOM wiring (all guarded — fail-soft when the DOM is missing) ──────────

  _bindDom() {
    if (typeof document === 'undefined') return;

    try {
      // Pause overlay → 📻 COACH MODE: resume-then-enter. The overlay's own
      // click handler re-locks the pointer (the click bubbles up to it).
      const coachBtn = document.getElementById('coach-mode-btn');
      if (coachBtn && !coachBtn.dataset.coachBound) {
        coachBtn.dataset.coachBound = '1';
        coachBtn.addEventListener('click', () => {
          if (this._active) return;
          this.enter({ from: 'pause' });
        });
      }

      // Mouse look for the free-fly camera — only while spectating AND
      // pointer-locked (Player's own mousemove handler ignores our frames
      // because Player.tick is skipped in spectator mode).
      document.addEventListener('mousemove', e => {
        if (!this._active || !document.pointerLockElement || this.followed) return;
        this._flyYaw -= (e.movementX ?? 0) * 0.0022;
        const halfPi = Math.PI / 2 - 0.01;
        this._flyPitch = Math.max(-halfPi, Math.min(halfPi, this._flyPitch - (e.movementY ?? 0) * 0.0022));
      });
    } catch { /* a garnish must never crash the yard */ }
  }

  // ── Mode toggle ────────────────────────────────────────────────────────────

  enter({ from = 'menu' } = {}) {
    if (this._active) return;
    const g = this.game;
    if (!g?.renderer?.camera || !g?.player) return;

    this._active = true;
    this._from = from;
    g._spectator = true;

    // Stash + freeze the player where they stand; their input is gated by
    // Game._update's spectator branch anyway.
    g.player.vel?.set(0, 0, 0);

    // Free-fly starts from wherever the camera currently points.
    const cam = g.renderer.camera;
    this._euler.setFromQuaternion(cam.quaternion, 'YXZ');
    this._flyYaw = this._euler.y;
    this._flyPitch = this._euler.x;
    this._keys = {};

    this._spawnCrew();
    this._log = [];  // clear log from any previous session
    this._buildHud();
    if (this._hud) this._hud.style.display = 'flex';
    this._hudDirty = true;
    this._logLine('🎙 COACH MODE — hold <b>SPACE</b> to transmit · <b>TAB</b> follow · <b>K</b> channel · <b>X</b> exit');
  }

  exit() {
    if (!this._active) return;
    this._active = false;
    const g = this.game;

    this.unfollow();

    // Wind the radios down (both idempotent)
    for (const r of Object.values(this.stack?.radios ?? {})) {
      try { r.endTransmit(); r.endReceive(r.speaker); } catch { /* never throw */ }
    }
    this._ack = null;
    this._ackPending = null;
    this._pttDown = false;
    this._keys = {};

    // Despawn the demo crew (deactivate keeps each bot's ledger/personality)
    for (const bot of this.bots) {
      try { bot.deactivate?.(); } catch { console.debug('[coach] demo bot deactivate failed'); }
    }
    this.bots = [];
    this._racers.clear();
    if (g?._demoBots) g._demoBots.length = 0;

    // Restore the camera to the player's eye; Player.tick owns it from here.
    const cam = g?.renderer?.camera, p = g?.player;
    if (cam && p) {
      p.vel?.set(0, 0, 0);
      cam.position.set(p.pos.x, p.pos.y + EYE_HEIGHT, p.pos.z);
      cam.quaternion.setFromEuler(this._euler.set(p.pitch, p.yaw, 0, 'YXZ'));
    }

    if (g) g._spectator = false;
    if (this._hud) this._hud.style.display = 'none';
    try { this._hud?.querySelector('#ch-text')?.blur(); } catch { /* ok */ }
  }

  // ── Demo crew ──────────────────────────────────────────────────────────────

  _spawnCrew() {
    const g = this.game;
    if (this.bots.length) { g._demoBots = this.bots; return; }

    for (const def of DEMO_CREW) {
      const bot = new ScrapBot(g.renderer.scene, g.player);
      bot._slotKey = def.slot;
      bot.setGame(g);
      bot.activate({ x: def.spawn.x, y: def.spawn.y, z: def.spawn.z });
      bot.setBrain(def.program, g.world, g.player, g.dayNight);
      bot.ttsVoice = def.voice;
      bot.voiceId = def.slot;
      if (def.racer) {
        this._racers.set(bot, 0);
        if (bot._adapter) bot._adapter.waypoint = { ...OVAL_WAYPOINTS[0] };
      }
      this.bots.push(bot);
    }
    g._demoBots = this.bots;
  }

  // ── Camera: free-fly + follow-cam ─────────────────────────────────────────

  follow(bot) {
    if (!this._active || !this.bots.includes(bot)) return;
    this.followed = bot;
    this._hudDirty = true;
    this._logLine(`📷 FOLLOWING <b>${this._botName(bot)}</b>`);
  }

  unfollow() {
    if (this.followed) {
      // Re-derive the fly pose from the current camera — no snap on handoff.
      const cam = this.game?.renderer?.camera;
      if (cam) {
        this._euler.setFromQuaternion(cam.quaternion, 'YXZ');
        this._flyYaw = this._euler.y;
        this._flyPitch = this._euler.x;
      }
    }
    this.followed = null;
    this._hudDirty = true;
  }

  _cycleFollow() {
    if (!this.bots.length) return;
    const i = this.followed ? this.bots.indexOf(this.followed) : -1;
    this.follow(this.bots[(i + 1) % this.bots.length]);
  }

  _tickFreeFly(dt) {
    const cam = this.game.renderer?.camera;
    if (!cam) return;
    cam.quaternion.setFromEuler(this._euler.set(this._flyPitch, this._flyYaw, 0, 'YXZ'));
    if (!document.pointerLockElement) return;   // paused → no drifting

    const k = this._keys;
    const mv = this._v1.set(0, 0, 0);
    if (k['KeyW']) mv.z -= 1;
    if (k['KeyS']) mv.z += 1;
    if (k['KeyA']) mv.x -= 1;
    if (k['KeyD']) mv.x += 1;
    if (k['KeyE']) mv.y += 1;
    if (k['KeyQ']) mv.y -= 1;
    if (mv.lengthSq() > 0) {
      mv.normalize().applyEuler(this._euler).multiplyScalar(this._flySpeed * dt);
      cam.position.add(mv);
      cam.position.y = Math.min(60, Math.max(1.5, cam.position.y));
    }
  }

  _tickFollowCam(dt) {
    const cam = this.game.renderer?.camera;
    const p = this.followed?.pos ?? this.followed?._pos;
    if (!cam || !p) { this.unfollow(); return; }
    const target = this._v1.set(p.x, p.y + 3, p.z - 6);   // simple world-space offset
    cam.position.lerp(target, Math.min(1, dt * 3));
    cam.lookAt(p.x, p.y + 1.2, p.z);
  }

  // ── Keyboard (called from Game's key handlers, spectator branch) ──────────

  onKeyDown(e) {
    if (!this._active) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName ?? '')) return;  // typing a nudge

    this._keys[e.code] = true;

    switch (e.code) {
      case 'Space':
        if (!e.repeat && !this._micFailed) this._pttStart();
        break;
      case 'KeyT':
        // T = radio key (PTT) while the text box is closed; toggles the text
        // fallback box once it is open (or once the mic has failed).
        if (this._textInputOpen() || this._micFailed) { this._toggleTextInput(); break; }
        if (!e.repeat) this._pttStart();
        break;
      case 'KeyK':
        this._switchChannel();
        break;
      case 'Tab':
        e.preventDefault();
        this._cycleFollow();
        break;
      case 'Digit1': case 'Digit2': case 'Digit3':
        this.follow(this.bots[Number(e.code[5]) - 1]);
        break;
      case 'KeyX':
        this.exit();
        break;
    }
  }

  onKeyUp(e) {
    if (!this._active) return;
    this._keys[e.code] = false;
    if ((e.code === 'Space' || e.code === 'KeyT') && this._pttDown) {
      this._pttDown = false;
      this._finishPtt();
    }
  }

  // ── Channels ───────────────────────────────────────────────────────────────

  get _radio() { return this.stack.radios[this.channel] ?? this.stack.radios.coach; }

  _switchChannel() {
    // Doctrine: channel switch only from IDLE (not while TRANSMITTING or RECEIVING)
    if (this._radio.isBusy()) { this._flashBusy(); return; }
    this.channel = this.channel === 'coach' ? 'chatter' : 'coach';
    this._hudDirty = true;
    this._logLine(`📻 switched to <b>${this.channel === 'coach' ? 'CH-1 COACH' : 'CH-2 CHATTER'}</b>`);
  }

  // ── PTT (hold SPACE / T) + STT fail-soft ──────────────────────────────────

  _pttStart() {
    if (this._pttDown) return;
    const res = this._radio.beginTransmit();
    if (!res.ok) {
      this._flashBusy();
      return;
    }
    this._pttDown = true;
    this._pttChannel = this.channel;
    voiceIn.start().catch(err => {
      console.debug('[coach] mic unavailable:', err?.message ?? err);
      this._pttDown = false;
      this.stack.radios[this._pttChannel ?? 'coach']?.endTransmit();
      this._onMicFailure();
    });
  }

  async _finishPtt() {
    const channel = this._pttChannel ?? this.channel;
    const radio = this.stack.radios[channel];
    let text = '';
    try { text = await voiceIn.stop(); } catch { text = ''; }
    radio?.endTransmit();
    this._pttChannel = null;

    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      this._emptyTranscripts++;
      if (this._emptyTranscripts >= 2 && !this._micFailed) this._onMicFailure();
      return;
    }
    this._emptyTranscripts = 0;
    this.sendNudge(trimmed, { channel });
  }

  _onMicFailure() {
    if (this._micFailed) return;
    this._micFailed = true;
    this._showTextInput(true);
    this._logLine('🎙 mic unavailable — <b>TEXT FALLBACK</b> (Enter sends, T toggles)');
  }

  // ── Text fallback panel ────────────────────────────────────────────────────

  _textInputOpen() {
    try { return !!this._hud && this._hud.querySelector('#ch-text')?.style.display !== 'none'; }
    catch { return false; }
  }

  _toggleTextInput() {
    const input = this._hud?.querySelector('#ch-text');
    if (!input) return;
    const open = input.style.display !== 'none';
    input.style.display = open ? 'none' : 'block';
    if (!open) input.focus();
    else input.blur();
  }

  _showTextInput(focus) {
    const input = this._hud?.querySelector('#ch-text');
    if (!input) return;
    input.style.display = 'block';
    if (focus) input.focus();
  }

  // ── The coach's voice → agent decisions ────────────────────────────────────

  /**
   * Parse + route a nudge to a demo bot and act on the intent. Text submits
   * ride the same half-duplex machine as voice: the caller wraps this in
   * beginTransmit/endTransmit (see _submitText).
   */
  sendNudge(text, { channel = 'coach' } = {}) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return;

    const parsed = parseNudge(trimmed);
    const hint = (parsed.targetHint ?? '').toLowerCase();

    let targets;
    if (hint === 'all' || hint === 'both') targets = [...this.bots];
    else targets = this.bots.filter(b => this._botName(b).toLowerCase() === hint);
    if (!targets.length) targets = this.followed ? [this.followed] : (this.bots[0] ? [this.bots[0]] : []);
    if (!targets.length) return;

    for (const bot of targets) {
      this.router.deliver(bot, trimmed);
      const directive = this.router.consume(bot);
      if (directive) this._applyDirective(bot, directive, channel);
    }
    this._logLine(`🎤 → <b>${targets.map(b => this._botName(b)).join(', ')}</b>: “${escapeHtml(trimmed)}”`);
  }

  /** Text fallback submit — an instant TX burst through the same radio. */
  _submitText(text) {
    const radio = this._radio;
    const res = radio.beginTransmit();
    if (!res.ok) { this._flashBusy(); return; }
    try { this.sendNudge(text, { channel: this.channel }); } catch { /* never throw */ }
    radio.endTransmit();
  }

  _applyDirective(bot, d, channel = 'coach') {
    const now = performance.now();
    switch (d.intent) {
      case 'goto': {
        const p = bot.pos ?? bot._pos ?? { x: 0, z: 0 };
        const dx = d.payload?.dx ?? 0, dz = d.payload?.dz ?? 0;
        if (bot._adapter) bot._adapter.waypoint = { x: p.x + dx * 10, z: p.z + dz * 10 };
        break;
      }
      case 'mine': {
        const t = this._findMineable(bot);
        if (t && bot._adapter) bot._adapter.waypoint = t;
        break;
      }
      case 'stop':
        bot._holdUntil = now + 12000;
        bot._followPlayerUntil = 0;
        break;
      case 'follow': {
        const ttl = Math.max(1000, (d.expiresAt ?? now + 15000) - (d.issuedAt ?? now)) || 15000;
        bot._followPlayerUntil = now + ttl;
        const pp = this.game.player?.pos;
        if (pp && bot._adapter) bot._adapter.waypoint = { x: pp.x, z: pp.z };
        break;
      }
      case 'race':
        if (bot._adapter && !this._racers.has(bot)) {
          this._racers.set(bot, 0);
          bot._adapter.waypoint = { ...OVAL_WAYPOINTS[0] };
        }
        break;
      case 'banter':
        if (bot.personality && typeof bot.personality.bond === 'number') bot.personality.bond += 1;
        break;
    }
    this._beginAck(bot, d, channel);
  }

  /** Nearest scrap/ore/crystal block within 24 m of the bot (y 0..9). */
  _findMineable(bot) {
    const w = this.game.world;
    const p = bot.pos ?? bot._pos;
    if (!w?.getBlock || !p) return null;
    const px = Math.round(p.x), pz = Math.round(p.z), R = 24;
    let best = null, bestD2 = R * R + 1;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 >= bestD2) continue;
        for (let y = 0; y <= 9; y++) {
          if (MINEABLE.includes(w.getBlock(px + dx, y, pz + dz))) {
            bestD2 = d2;
            best = { x: px + dx, z: pz + dz };
            break;
          }
        }
      }
    }
    return best;
  }

  // ── ACK: the agent answers on the radio ────────────────────────────────────

  _ackText(bot, d) {
    const bank = ACKS[d.intent] ?? ACKS.banter;
    const i = (this._ackRotate[d.intent] = (this._ackRotate[d.intent] ?? 0) + 1) % bank.length;
    const dir = d.payload?.dir ?? compassOf(d.payload?.dx ?? 0, d.payload?.dz ?? 0);
    return bank[i](this._botName(bot), dir);
  }

  _beginAck(bot, d, channel) {
    const name = this._botName(bot);
    const text = this._ackText(bot, d);
    const radio = this.stack.radios[channel] ?? this.stack.radios.coach;
    const session = {
      speakerId: bot.voiceId ?? bot._slotKey ?? name,
      name,
      text,
      until: performance.now() + MAX_TX_MS,   // hard timeout: 8 s
      channel,
    };
    const res = radio.beginReceive(session.speakerId);
    if (res.ok) {
      this._ack = session;
    } else {
      // Channel busy (e.g. our own TX burst hasn't ended yet) — retry in tick.
      // Only queue if not already pending to avoid overwriting queued acks.
      if (!this._ackPending) this._ackPending = session;
      return;
    }
    voiceOut.speak(text, { voice: bot.ttsVoice ?? 'rivet' });
    this._logLine(`📻 <b>${name}</b>: ${text}`);
    this._hudDirty = true;
  }

  _tickAck(now) {
    if (this._ackPending) {
      const radio = this.stack.radios[this._ackPending.channel] ?? this.stack.radios.coach;
      if (!radio.isBusy()) {
        const pending = this._ackPending;
        this._ackPending = null;
        if (radio.beginReceive(pending.speakerId).ok) {
          this._ack = pending;
          const bot = this.bots.find(b => (b.voiceId ?? b._slotKey) === pending.speakerId);
          voiceOut.speak(pending.text, { voice: bot?.ttsVoice ?? 'rivet' });
          this._logLine(`📻 <b>${pending.name}</b>: ${pending.text}`);
          this._hudDirty = true;
        }
      }
    }
    const ack = this._ack;
    if (!ack) return;
    const radio = this.stack.radios[ack.channel] ?? this.stack.radios.coach;
    const spoken = voiceOut._playing == null;      // TTS queue drained
    if (spoken || now >= ack.until) {
      radio.endReceive(ack.speakerId);
      this._ack = null;
      this._hudDirty = true;
    }
  }

  // ── Per-frame (called from Game._update while spectating) ─────────────────

  tick(dt, now = performance.now()) {
    if (!this._active) return;

    // MAX_TX_MS enforcement on both radios
    for (const r of Object.values(this.stack.radios)) r.tick(now);

    // Camera
    if (this.followed) this._tickFollowCam(dt);
    else this._tickFreeFly(dt);

    // Racer oval sequencing — advance as each waypoint is reached
    for (const [bot, idx] of this._racers) {
      const wp = OVAL_WAYPOINTS[idx];
      const p = bot.pos ?? bot._pos;
      if (!wp || !p || !bot._adapter) continue;
      if (Math.hypot(p.x - wp.x, p.z - wp.z) < 3) {
        const next = (idx + 1) % OVAL_WAYPOINTS.length;
        this._racers.set(bot, next);
        bot._adapter.waypoint = { ...OVAL_WAYPOINTS[next] };
      }
    }

    // 'follow me' — live waypoint on the player's position while active;
    // plus the demo crew's pit-crew recharge: a spectator show must not run
    // out of batteries two minutes in (ScrapBot drains ~1%/s while driving).
    const pp = this.game.player?.pos;
    for (const bot of this.bots) {
      if (bot.battery != null && bot.battery < 40) bot.battery = Math.min(100, bot.battery + 30);
      if (bot._followPlayerUntil) {
        if (now < bot._followPlayerUntil && pp && bot._adapter) {
          bot._adapter.waypoint = { x: pp.x, z: pp.z };
        } else {
          bot._followPlayerUntil = 0;
        }
      }
      // Directives delivered but not yet consumed (robustness path)
      const d = this.router.consume(bot);
      if (d) this._applyDirective(bot, d);
    }

    this._tickAck(now);
    this._tickHud(now);
  }

  // ── HUD (built dynamically; DOM touched only on change) ───────────────────

  _botName(bot) { return bot?.personality?.name ?? bot?._slotKey ?? 'bot'; }

  _logLine(html) {
    this._log.push(html);
    while (this._log.length > 3) this._log.shift();
    const el = this._hud?.querySelector('#ch-log');
    if (el) el.innerHTML = this._log.join('<br>');
  }

  _flashBusy() {
    this._logLine('🚫 <b>CHANNEL BUSY</b> — agent transmitting');
    try { this.game?.audio?.spark?.(); } catch { /* blip is a garnish */ }
    const hud = this._hud;
    if (!hud) return;
    hud.classList.add('ch-busy');
    clearTimeout(this._busyTimer);
    this._busyTimer = setTimeout(() => hud.classList.remove('ch-busy'), 400);
    this._hudDirty = true;
  }

  _buildHud() {
    if (typeof document === 'undefined') return;
    if (this._hud) return;
    try {
      if (!document.getElementById('coach-hud-style')) {
        const style = document.createElement('style');
        style.id = 'coach-hud-style';
        style.textContent = `
#coach-hud {
  position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
  display: none; flex-direction: column; gap: 4px;
  min-width: 420px; max-width: 620px;
  background: rgba(10,10,8,0.92); border: 1px solid #f0b429; border-radius: 10px;
  padding: 10px 14px; z-index: 85;   /* above the game HUD, under the pause overlay (90) */
  font-family: 'Courier New', monospace; font-size: 11px; color: #ddd;
  letter-spacing: 0.5px; pointer-events: none;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
}
#coach-hud.ch-tx { border-color: #f0b429; animation: chPulse 1s ease-in-out infinite; }
#coach-hud.ch-rx { border-color: #44ff66; }
#coach-hud.ch-busy { border-color: #ff4444; animation: none; }
@keyframes chPulse { 0%,100% { box-shadow: 0 0 6px rgba(240,180,40,0.25); } 50% { box-shadow: 0 0 22px rgba(240,180,40,0.7); } }
.ch-row { display: flex; align-items: center; gap: 10px; }
.ch-pill { padding: 2px 10px; border-radius: 4px; font-weight: bold; }
.ch-idle { background: #222; color: #888; }
.ch-tx-pill { background: #3a2a00; color: #f0b429; }
.ch-rx-pill { background: #06280e; color: #44ff66; }
#ch-channel { color: #f0b429; }
#ch-follow { color: #00ccff; }
#ch-exit { margin-left: auto; color: #ff8866; cursor: pointer; pointer-events: auto; }
#ch-exit:hover { color: #ffaa88; }
.ch-roster { color: #aaa; }
.ch-log { color: #999; min-height: 14px; max-height: 44px; overflow: hidden; }
#ch-sub { color: #44ff66; min-height: 0; display: none; }
#coach-hud.ch-rx #ch-sub { display: block; }
#ch-text {
  display: none; pointer-events: auto; margin-top: 2px;
  background: #0a0a08; border: 1px solid #f0b429; border-radius: 4px;
  color: #ffd970; font-family: inherit; font-size: 12px; padding: 5px 8px; width: 100%;
  box-sizing: border-box;
}
        `;
        document.head.appendChild(style);
      }

      const hud = document.createElement('div');
      hud.id = 'coach-hud';
      hud.innerHTML = `
<div class="ch-row">
  <span id="ch-state" class="ch-pill ch-idle">IDLE</span>
  <span id="ch-channel">CH-1 COACH</span>
  <span id="ch-follow">FREE-FLY</span>
  <span id="ch-exit" title="Exit coach mode (X)">EXIT COACH (X)</span>
</div>
<div id="ch-roster" class="ch-roster"></div>
<div id="ch-log" class="ch-log"></div>
<div id="ch-sub"></div>
<input id="ch-text" type="text" maxlength="120" autocomplete="off"
  placeholder="TYPE A NUDGE + ENTER — radio burst" />
      `;
      document.body.appendChild(hud);
      this._hud = hud;

      hud.querySelector('#ch-exit')?.addEventListener('click', () => this.exit());
      const input = hud.querySelector('#ch-text');
      if (input) input.style.display = 'none';   // inline, so _textInputOpen() reads truth
      input?.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          const v = input.value.trim();
          input.value = '';
          if (v) this._submitText(v);
        } else if (ev.key === 'Escape') {
          input.blur();
        }
      });

      this._log = [];
    } catch { console.debug('[coach] HUD build failed — spectating without panel'); }
  }

  _tickHud(now = performance.now()) {
    if (!this._hud || !this._hudDirty) {
      // roster statuses can change without a radio transition — refresh lazily
      if (this._hud && (this._rosterTimer = (this._rosterTimer ?? 0) + 1) % 30 === 0) {
        this._updateRoster(now);
      }
      return;
    }
    this._hudDirty = false;

    const radio = this._radio;
    const pill = this._hud.querySelector('#ch-state');

    let pillText = 'IDLE';
    if (radio.state === 'TRANSMITTING') pillText = 'ON AIR ▲';
    else if (radio.state === 'RECEIVING') {
      const speakerBot = this.bots.find(b => (b.voiceId ?? b._slotKey) === radio.speaker);
      pillText = `RX ▼ — ${speakerBot ? this._botName(speakerBot) : (this._ack?.name ?? radio.speaker ?? '')}`;
    }
    const pillKey = `${radio.state}|${pillText}`;
    if (this._hudCache.pill !== pillKey) {
      this._hudCache.pill = pillKey;
      if (pill) {
        pill.textContent = pillText;
        pill.className = `ch-pill ${radio.state === 'TRANSMITTING' ? 'ch-tx-pill' : radio.state === 'RECEIVING' ? 'ch-rx-pill' : 'ch-idle'}`;
      }
      this._hud.classList.toggle('ch-tx', radio.state === 'TRANSMITTING');
      this._hud.classList.toggle('ch-rx', radio.state === 'RECEIVING');
    }

    const chLabel = this.channel === 'coach' ? 'CH-1 COACH' : 'CH-2 CHATTER';
    if (this._hudCache.channel !== chLabel) {
      this._hudCache.channel = chLabel;
      const el = this._hud.querySelector('#ch-channel');
      if (el) el.textContent = chLabel;
    }

    const followLabel = this.followed ? this._botName(this.followed) : 'FREE-FLY';
    if (this._hudCache.follow !== followLabel) {
      this._hudCache.follow = followLabel;
      const el = this._hud.querySelector('#ch-follow');
      if (el) el.textContent = followLabel;
    }

    const sub = this._ack?.text ?? '';
    if (this._hudCache.sub !== sub) {
      this._hudCache.sub = sub;
      const el = this._hud.querySelector('#ch-sub');
      if (el) el.textContent = sub;
    }

    this._updateRoster(now);
  }

  _updateRoster(now = performance.now()) {
    if (!this._hud) return;
    const line = this.bots.map(bot => {
      const status = (bot._holdUntil && now < bot._holdUntil) ? 'HOLDING'
                   : this._racers.has(bot) ? 'RACING' : 'RUNNING';
      return `${escapeHtml(this._botName(bot))} ${status}`;
    }).join(' · ');
    if (this._hudCache.roster === line) return;
    this._hudCache.roster = line;
    const el = this._hud.querySelector('#ch-roster');
    if (el) el.textContent = line;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
