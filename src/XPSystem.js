/**
 * XPSystem — tracks experience points, levels, and skill unlocks.
 *
 * Level formula: level = floor(sqrt(xp / 10))
 *   Level 1:  10 XP   Level 2:  40 XP   Level 3:  90 XP   Level 4:  160 XP
 *   Level 5: 250 XP   Level 8: 640 XP   Level 12: 1440 XP
 *
 * Skill nodes gate narrative milestones (and the second-bot at Level 5).
 */

export const XP_SKILLS = [
  {
    id: 'tinkerer',
    level: 1,
    icon: '🔧',
    name: 'Tinkerer',
    earlQuip: "You hit Level 1. The Maker Lab is open for business. Press [T]. Don't break anything that wasn't already broken.",
  },
  {
    id: 'scrapper',
    level: 2,
    icon: '🗜️',
    name: 'Scrapper',
    earlQuip: "Level 2. Mining's getting faster — practice makes profit. I've seen seagulls strip a car faster than you, but you're catching up.",
  },
  {
    id: 'programmer',
    level: 3,
    icon: '💡',
    name: 'Programmer',
    earlQuip: "Level 3. Spark — the AI build buddy — can now write tile programs for you. Open the Tile Editor, hit the Spark button, and tell it what you want the bot to do.",
  },
  {
    id: 'bot_whisperer',
    level: 4,
    icon: '🤖',
    name: 'Bot Whisperer',
    earlQuip: "Level 4. Your ScrapBot listens better than my last apprentice. Keep talking to it — it doesn't bite. The bot, I mean. Apprentice might.",
  },
  {
    id: 'engineer',
    level: 5,
    icon: '⚙️',
    name: 'Engineer',
    earlQuip: "Level 5. You're an engineer now, officially. Craft a second robot_helper and press Shift+B to run it on its own brain. Don't let them fight.",
  },
  {
    id: 'maker',
    level: 8,
    icon: '🔌',
    name: 'Maker',
    earlQuip: "Level 8. I've run this scrapyard for 30 years and I never got a level. The Wokwi and wiring export buttons are now live in the Tile Editor. Your game robot can become a real one.",
  },
  {
    id: 'inventor',
    level: 12,
    icon: '👁️',
    name: 'Inventor',
    earlQuip: "Level 12. Earl doesn't have words. Vision Brain sensors are fully unlocked. You'll need the Jetson Nano. The blueprint's in the deep yard somewhere.",
  },
];

export class XPSystem {
  constructor() {
    this.xp    = 0;
    this.level = 0;
    this.skills       = new Set();
    this._newSkills   = [];
    this._listeners   = [];
    this._seenSensors = new Set();
  }

  /**
   * Award XP. Returns how many levels were gained (0 if none).
   * @param {number} amount
   */
  gain(amount) {
    if (amount <= 0) return 0;
    this.xp += amount;
    const nl = this._calcLevel(this.xp);
    const gained = nl - this.level;
    if (gained > 0) {
      this.level = nl;
      this._checkSkills();
      this._emit('levelup', { level: this.level });
    }
    return gained;
  }

  /**
   * Award a one-time XP bonus the first time a sensor type is used.
   */
  trackSensor(sensorId) {
    if (this._seenSensors.has(sensorId)) return;
    this._seenSensors.add(sensorId);
    this.gain(8);
  }

  hasSkill(id) { return this.skills.has(id); }

  /** Drain newly unlocked skills since last call. */
  drainNewSkills() {
    const s = [...this._newSkills];
    this._newSkills = [];
    return s;
  }

  /** XP progress within the current level band, 0..1. */
  get progress() {
    const from = this._xpForLevel(this.level);
    const to   = this._xpForLevel(this.level + 1);
    return to === from ? 1 : Math.max(0, Math.min(1, (this.xp - from) / (to - from)));
  }

  /** XP required to reach level n from zero. */
  _xpForLevel(n) { return n * n * 10; }

  _calcLevel(xp) { return Math.floor(Math.sqrt(xp / 10)); }

  _checkSkills() {
    for (const skill of XP_SKILLS) {
      if (!this.skills.has(skill.id) && this.level >= skill.level) {
        this.skills.add(skill.id);
        this._newSkills.push(skill);
        this._emit('skill', skill);
      }
    }
  }

  on(event, fn) { this._listeners.push({ event, fn }); }
  _emit(event, data) { this._listeners.forEach(l => l.event === event && l.fn(data)); }

  toSaveData() {
    return {
      xp:          this.xp,
      level:       this.level,
      skills:      [...this.skills],
      seenSensors: [...this._seenSensors],
    };
  }

  fromSaveData(d) {
    if (!d) return;
    this.xp           = d.xp          ?? 0;
    this.level        = d.level        ?? 0;
    this.skills       = new Set(d.skills      ?? []);
    this._seenSensors = new Set(d.seenSensors ?? []);
  }
}
