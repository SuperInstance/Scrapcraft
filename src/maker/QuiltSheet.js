/**
 * ───────────────────────────────────────────────────────────────────────────
 *  QUILT SHEET  —  the robot as a live spreadsheet
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The mist-quilt pattern, ported local-only for Scrapcraft (see
 * projects/mist-quilt/src/sheet.ts for the canonical worker version):
 *
 *   CELLS      metadata: { id, group, label, emoji, kind: value|formula,
 *                          fmt, deps?, description }
 *   TickCell   { v, t, ch }  — value, timestamp, CHANGED-this-tick flag
 *
 * The quilt's job: make the invisible state of the robot VISIBLE as numbers.
 * Sensors, pose, motors, program-flow — every value that changes flashes.
 * A kid watching `distance_ahead` tick down 0.8 → 0.3 while `motorL PWM`
 * drops 230 → 90 is watching causality happen, cell by cell.
 *
 * Pure logic, zero DOM — the view (QuiltView) renders what this computes.
 */

export const GROUPS = {
  sensors:  { label: 'Sensors',  emoji: '📡', color: '#38bdf8' },
  pose:     { label: 'Pose',     emoji: '🧭', color: '#a78bfa' },
  motors:   { label: 'Motors',   emoji: '⚙️', color: '#f59e0b' },
  program:  { label: 'Program',  emoji: '🧩', color: '#34d399' },
  pins:     { label: 'Pins',     emoji: '📐', color: '#fbbf24' },
  heart:    { label: 'Bot Heart', emoji: '💛', color: '#fb7185' },
  companions: { label: 'Companions', emoji: '🧭', color: '#e879f9' },
};

export const CELLS = [
  // ── sensors (the world, as the bot feels it)
  { id: 'sensor.distance', group: 'sensors', label: 'Distance', emoji: '📏', kind: 'value', fmt: 'num', description: 'How clear the road ahead is. 1 = totally clear, 0 = wall right there (HC-SR04 on A0).' },
  { id: 'sensor.light',    group: 'sensors', label: 'Light',    emoji: '💡', kind: 'value', fmt: 'pct', description: 'Brightness under the bot (LDR on A1). Floodlights push this up.' },
  { id: 'sensor.temp',     group: 'sensors', label: 'Heat',     emoji: '🔥', kind: 'value', fmt: 'pct', description: '0..1, hot near the forge and smelter (NTC on A2).' },
  { id: 'sensor.line',     group: 'sensors', label: 'On Track', emoji: '▬',  kind: 'value', fmt: 'bool', description: 'TRUE while rolling on the dark rubber TRACK strips (TCRT5000 on D2).' },
  { id: 'sensor.motion',   group: 'sensors', label: 'Motion',   emoji: '🚶', kind: 'value', fmt: 'bool', description: 'TRUE when something (probably you) moves nearby (PIR on D3).' },

  // ── pose
  { id: 'pose.x',       group: 'pose', label: 'X',       emoji: '↔️', kind: 'value', fmt: 'num', description: 'East-west position in the yard, 0..127.' },
  { id: 'pose.z',       group: 'pose', label: 'Z',       emoji: '↕️', kind: 'value', fmt: 'num', description: 'North-south position in the yard, 0..127.' },
  { id: 'pose.heading', group: 'pose', label: 'Heading', emoji: '🧭', kind: 'value', fmt: 'deg', description: 'Which way the bot faces. 0° faces +Z; grows clockwise.' },
  { id: 'pose.speed',   group: 'pose', label: 'Speed',   emoji: '⚡', kind: 'formula', fmt: 'num', deps: ['motor.drive'], description: 'How fast the bot is actually moving = |drive power| × DRIVE_SPEED.' },

  // ── motors (what the brain ordered)
  { id: 'motor.drive', group: 'motors', label: 'Drive',   emoji: '🛞', kind: 'value', fmt: 'pct', description: 'Forward/back motor order, -100%..100%.' },
  { id: 'motor.turn',  group: 'motors', label: 'Turn',    emoji: '🔄', kind: 'value', fmt: 'pct', description: 'Spin order, -100% (left)..100% (right).' },
  { id: 'motor.left',  group: 'motors', label: 'L Motor', emoji: '⚙️', kind: 'formula', fmt: 'pct', deps: ['motor.drive', 'motor.turn'], description: 'Left wheel = drive + turn (skid-steer!). Feeds D4/D5.' },
  { id: 'motor.right', group: 'motors', label: 'R Motor', emoji: '⚙️', kind: 'formula', fmt: 'pct', deps: ['motor.drive', 'motor.turn'], description: 'Right wheel = drive − turn. Feeds D7/D6.' },
  { id: 'motor.buzzer', group: 'motors', label: 'Buzzer', emoji: '🔊', kind: 'value', fmt: 'hz',  description: 'Beep frequency on D8, 0 = silent.' },

  // ── program flow (the brain, thinking)
  { id: 'prog.tile',    group: 'program', label: 'Running Tile', emoji: '▶️', kind: 'value', fmt: 'str', description: 'The tile executing right now — watch the brain hop between tiles.' },
  { id: 'prog.steps',   group: 'program', label: 'Steps/s',      emoji: '👟', kind: 'value', fmt: 'int', description: 'VM instructions per second. Tight loops peg this.' },
  { id: 'prog.budget',  group: 'program', label: 'Budget',       emoji: '📊', kind: 'value', fmt: 'pct', description: '% of the per-frame step budget used. 100% every frame = the loop is maxing out.' },
  { id: 'prog.beeps',   group: 'program', label: 'Beeps',        emoji: '🎵', kind: 'value', fmt: 'int', description: 'Beeps emitted this run.' },

  // ── pins (hardware twin live values)
  { id: 'pin.pwmL', group: 'pins', label: 'D5 PWM (L)', emoji: '📐', kind: 'value', fmt: 'int', description: 'Left motor PWM duty 0..255 — the number a real Uno would be writing.' },
  { id: 'pin.pwmR', group: 'pins', label: 'D6 PWM (R)', emoji: '📐', kind: 'value', fmt: 'int', description: 'Right motor PWM duty 0..255.' },
  { id: 'pin.a0',   group: 'pins', label: 'A0 counts',  emoji: '📏', kind: 'value', fmt: 'int', description: 'analogRead(A0) = distance in raw 10-bit counts, exactly like the real pin.' },

  // ── bot heart (M4 — the bot as a character)
  { id: 'comp.active',  group: 'companions', label: 'Active',   emoji: '🧭', kind: 'value', fmt: 'str',  description: 'The companion on your shoulder right now — the run\'s current storyteller.' },
  { id: 'comp.started', group: 'companions', label: 'Starter',   emoji: '🚪', kind: 'value', fmt: 'str',  description: 'Who the gate delivered on day one. The run\'s story identity — different friend, different journey.' },
  { id: 'comp.tier',    group: 'companions', label: 'Tier',      emoji: '🤝', kind: 'value', fmt: 'str',  description: 'stranger → coworker → friend. Earned by real shared events, never lost.' },
  { id: 'comp.bond',    group: 'companions', label: 'Bond',      emoji: '💛', kind: 'value', fmt: 'int',  description: 'Shared-experience points with the active companion.' },
  { id: 'comp.drift',   group: 'companions', label: 'Drift',     emoji: '🧬', kind: 'value', fmt: 'str',  description: 'The trait axis your play style grew strongest — the friendship\'s own shape.' },
  { id: 'comp.party',   group: 'companions', label: 'Party Size', emoji: '👥', kind: 'value', fmt: 'int',  description: 'Crew size. 2 initially, 3 once two companions have hit FRIEND.' },

  { id: 'heart.name',   group: 'heart', label: 'Name',   emoji: '🤖', kind: 'value', fmt: 'str',  description: 'This bot has a name. It earned it.' },
  { id: 'heart.bond',   group: 'heart', label: 'Bond',   emoji: '💛', kind: 'value', fmt: 'int',  description: 'Bond level — grows with every second of program runtime together.' },
  { id: 'heart.dents',  group: 'heart', label: 'Dents',  emoji: '🔨', kind: 'value', fmt: 'int',  description: 'Dents from wall-bonks. Each one is a story (and a repair log entry).' },
  { id: 'heart.laps',   group: 'heart', label: 'Laps',   emoji: '🏁', kind: 'value', fmt: 'int',  description: 'Track laps completed by this bot.' },
];

export const CELL_IDS = CELLS.map(c => c.id);
const CELL_MAP = new Map(CELLS.map(c => [c.id, c]));

/** Native formula implementations — no eval, mirroring the worker constraint.
 *  Input cells are already in percent form (drive −100..100). */
const FORMULAS = {
  'pose.speed':  v => +(((v['motor.drive'] ?? 0) / 100) * 2.4).toFixed(2),
  'motor.left':  v => +((v['motor.drive'] ?? 0) + (v['motor.turn'] ?? 0)).toFixed(2),
  'motor.right': v => +((v['motor.drive'] ?? 0) - (v['motor.turn'] ?? 0)).toFixed(2),
};

export class QuiltSheet {
  constructor() {
    /** @type {Record<string, import('./QuiltSheetTypes').TickCell>} */
    this.cells = {};
    this.ticks = 0;
    for (const id of CELL_IDS) this.cells[id] = { v: 0, t: 0, ch: false };
    this.cells['sensor.line'].v = false;
    this.cells['sensor.motion'].v = false;
    this.cells['prog.tile'].v = '—';
    this.cells['heart.name'].v = '—';
  }

  /**
   * Pull one frame of state from the runtime into the sheet.
   * All params optional — missing pieces hold their last values.
   * @param {object} s
   * @param {object} [s.robot]     VirtualRobot (drive/turn/x/z/heading)
   * @param {object} [s.sensors]   { distance_ahead, light, temperature, line_under, motion_nearby }
   * @param {object} [s.program]   { tileLabel, stepsPerSec, budgetPct, beeps }
   * @param {object} [s.pins]      PinModel.snapshot() — { digital, analog }
   * @param {object} [s.heart]     { name, bond, dents, laps }
   * @param {object} [s.companions] { active, starter, tier, bond, drift, party }
   */
  update(s = {}) {
    this.ticks++;
    const now = this.ticks;

    const set = (id, v) => {
      const c = this.cells[id];
      const next = typeof v === 'number' ? +v.toFixed(3) : v;
      if (c.v !== next) { c.v = next; c.t = now; c.ch = true; }
      else c.ch = false;
    };

    if (s.sensors) {
      set('sensor.distance', s.sensors.distance_ahead ?? 0);
      set('sensor.light',    s.sensors.light ?? 0);
      set('sensor.temp',     s.sensors.temperature ?? 0);
      set('sensor.line',     !!s.sensors.line_under);
      set('sensor.motion',   !!s.sensors.motion_nearby);
    }
    if (s.robot) {
      set('pose.x', s.robot.x);
      set('pose.z', s.robot.z);
      set('pose.heading', +(((s.robot.heading ?? 0) * 180 / Math.PI + 360) % 360).toFixed(1));
      set('motor.drive', _pct(s.robot.drivePower));
      set('motor.turn',  _pct(s.robot.turnPower));
      const beep = [...(s.robot.events ?? [])].reverse().find(e => e.kind === 'beep');
      if (beep) set('motor.buzzer', beep.freq ?? 880);
      else if (this.cells['motor.buzzer'].v !== 0) set('motor.buzzer', 0);
    }
    if (s.program) {
      if (s.program.tileLabel) set('prog.tile', s.program.tileLabel);
      set('prog.steps',  s.program.stepsPerSec ?? 0);
      set('prog.budget', s.program.budgetPct ?? 0);
      set('prog.beeps',  s.program.beeps ?? this.cells['prog.beeps'].v);
    }
    if (s.pins) {
      const d5 = s.pins.digital?.[5], d6 = s.pins.digital?.[6];
      set('pin.pwmL', d5?.pwm !== undefined && d5.pwm >= 0 ? d5.pwm : Math.round(Math.abs(_pct(s.robot?.drivePower ?? 0) + _pct(s.robot?.turnPower ?? 0)) / 100 * 255));
      set('pin.pwmR', d6?.pwm !== undefined && d6.pwm >= 0 ? d6.pwm : Math.round(Math.abs(_pct(s.robot?.drivePower ?? 0) - _pct(s.robot?.turnPower ?? 0)) / 100 * 255));
      set('pin.a0', s.pins.analog?.[0]?.counts ?? 0);
    }
    if (s.heart) {
      if (s.heart.name) set('heart.name', s.heart.name);
      set('heart.bond',  s.heart.bond ?? 0);
      set('heart.dents', s.heart.dents ?? 0);
      set('heart.laps',  s.heart.laps ?? 0);
    }
    if (s.companions) {
      if (s.companions.active) set('comp.active', s.companions.active);
      if (s.companions.starter) set('comp.started', s.companions.starter);
      if (s.companions.tier) set('comp.tier', s.companions.tier);
      set('comp.bond', s.companions.bond ?? 0);
      if (s.companions.drift) set('comp.drift', s.companions.drift);
      set('comp.party', s.companions.party ?? 1);
    }

    // formulas after inputs (deps are earlier in CELLS order)
    for (const c of CELLS) {
      if (c.kind !== 'formula') continue;
      const fn = FORMULAS[c.id];
      if (!fn) continue;
      set(c.id, fn(this._valueMap()));
    }

    return this.cells;
  }

  _valueMap() {
    const out = {};
    for (const id of CELL_IDS) out[id] = this.cells[id].v;
    return out;
  }

  /** Cells that flashed this tick (for tests + the view's flash animation). */
  changed() { return CELL_IDS.filter(id => this.cells[id].ch); }
}

function _pct(unitFloat) {
  return Math.round((Number(unitFloat) || 0) * 100);
}
