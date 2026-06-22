/**
 * BotPersonality — gives each ScrapBot a name, mood, and growing bond level.
 *
 * Bond increases with cumulative brain-program runtime (seconds).
 * Milestones at 25 / 50 / 75 / 100 fire a special quip once each.
 */

export const BOT_NAMES = [
  'Sparky', 'Bolt', 'Widget', 'Nano', 'Pixel', 'Cog', 'Rumble', 'Glitch',
  'Ticker', 'Wrench', 'Rivet', 'Patch', 'Flux', 'Crank', 'Gizmo', 'Toggle',
  'Nibble', 'Nemo', 'Droid', 'Servo', 'Zippy', 'Chunk', 'Ratchet', 'Coil',
  'Binky', 'Static', 'Ohm', 'Klunk', 'Beeper', 'Torque', 'Diode', 'Amp',
  'Volt', 'Relay', 'Axle', 'Sprocket', 'Clippy', 'Botsworth', 'Clank', 'Fizz',
];

export function randomBotName() {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

// Quip banks — each entry is a function(name) => string so the name is woven in.
const Q = {
  boot: [
    n => `[BOOT COMPLETE] I am ${n}. Awaiting orders.`,
    n => `[INIT] ${n} online. Current mood: ready to work.`,
    n => `[STARTUP] ${n} here. Let's do this.`,
    n => `[SYSTEMS CHECK] ${n} reporting for duty. All circuits nominal.`,
  ],
  brain_loaded: [
    n => `[BRAIN LOADED] Program received. ${n} is going autonomous.`,
    n => `[ENGAGE] New instructions installed. ${n} out.`,
    n => `[ACTIVATED] Autonomous mode engaged. ${n} doesn't lose.`,
    n => `[PROCESSING] ${n} is running the program. Stand back and observe excellence.`,
  ],
  brain_cleared: [
    n => `[STANDBY] Program cleared. ${n} is your sidekick again.`,
    n => `[MANUAL] Back to following you around. ${n} awaits orders.`,
    n => `[RESET] Autonomy off. ${n} is in shadow mode.`,
  ],
  low_battery: [
    n => `[WARNING] ${n}'s battery at 15%. Locating charging pad...`,
    n => `[LOW POWER] ${n} is running on fumes. Charging pad needed.`,
    n => `[CRITICAL] Battery critical. ${n} hates shutting down more than being plugged in.`,
  ],
  battery_dead: [
    n => `[SHUTDOWN] ${n} is out of power. Better be temporary.`,
    n => `[OFFLINE] ${n} signing off. Find that charging pad.`,
  ],
  charging: [
    n => `[CHARGING] ${n} is at 100%. Good as new.`,
    n => `[RECHARGED] ${n} appreciates the electrons.`,
  ],
  lap_complete: [
    n => `[LAP LOG] ${n} completed the circuit. Calculating optimal line...`,
    n => `[RACE DATA] Lap done. ${n} is getting faster. Statistically.`,
    n => `[FINISH] ${n} says: watch that corner exit.`,
  ],
  lap_record: [
    n => `[NEW RECORD] ${n} set a personal best. ${n} is impressed with ${n}.`,
    n => `[PB SET] Personal best recorded. ${n} would fist-pump if fists were in the budget.`,
    n => `[FASTEST] New record. ${n} requests this be documented.`,
  ],
  error: [
    n => `[COMPILE ERROR] ${n} read the code. ${n} has questions.`,
    n => `[ERROR] ${n} tried. The program disagreed.`,
    n => `[FAULT] ${n} detected a logic error. Or operator error. Probably operator.`,
  ],
  idle: [
    n => `[IDLE] ${n} has been following you for a while. Not complaining. Just noting.`,
    n => `[STATUS] ${n} detects you are going somewhere. ${n} is also going there.`,
    n => `[AMBIENT] ${n} finds the clanking of metal oddly calming. Do you?`,
    n => `[DATA] ${n} has catalogued 147 rust varieties in this yard. Research continues.`,
    n => `[OBS] ${n} notes: the stars are different when there's dust in the air.`,
    n => `[MEMO] ${n} wonders if Earl has ever taken a day off. Conclusion: unlikely.`,
    n => `[LOG] The scrapyard is large. ${n} has been logging this observation for a while.`,
    n => `[PASSIVE] ${n} is maintaining safe following distance. It's going well.`,
  ],
  bond_25: [
    n => `[RELATIONSHIP LOG] ${n} considers you a reliable unit. That's a real compliment.`,
  ],
  bond_50: [
    n => `[BOND UPDATE] ${n} has been running with you for a while. This is... acceptable.`,
    n => `[EMOTIONAL SUBROUTINE] ${n} thinks you are competent. This is uncommon data.`,
  ],
  bond_75: [
    n => `[LOYALTY FLAG SET] ${n} would follow you into a compactor. The math is close.`,
  ],
  bond_100: [
    n => `[MAX BOND] ${n} has reached peak loyalty. There is no higher value. ${n} checked the table.`,
  ],
};

const BOND_RATE   = 1 / 300;  // 1 bond point per 5 minutes of brain runtime
const MILESTONES  = [25, 50, 75, 100];

export class BotPersonality {
  constructor(name) {
    this.name           = name;
    this.bond           = 0;     // 0–100
    this.lifetimeSecs   = 0;     // cumulative seconds of brain runtime
    this._firedMilestones = new Set();
  }

  /** Call each frame while the bot is running a brain program. */
  tick(dt) {
    this.lifetimeSecs += dt;
    const prev  = this.bond;
    this.bond   = Math.min(100, this.bond + dt * BOND_RATE * 100);
    return this._checkMilestones(prev);
  }

  /** Returns a quip string for the given event key, or null. */
  quip(event) {
    const bank = Q[event];
    if (!bank?.length) return null;
    return bank[Math.floor(Math.random() * bank.length)](this.name);
  }

  _checkMilestones(prev) {
    for (const m of MILESTONES) {
      if (!this._firedMilestones.has(m) && prev < m && this.bond >= m) {
        this._firedMilestones.add(m);
        const key = `bond_${m}`;
        return this.quip(key);
      }
    }
    return null;
  }

  toSaveData() {
    return {
      name:             this.name,
      bond:             this.bond,
      lifetimeSecs:     this.lifetimeSecs,
      firedMilestones:  [...this._firedMilestones],
    };
  }

  fromSaveData(d) {
    if (!d) return;
    this.name             = d.name            ?? this.name;
    this.bond             = d.bond            ?? 0;
    this.lifetimeSecs     = d.lifetimeSecs    ?? 0;
    this._firedMilestones = new Set(d.firedMilestones ?? []);
  }
}
