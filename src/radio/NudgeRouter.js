export function parseNudge(text) {
  if (!text || typeof text !== 'string') {
    return { intent: 'banter', payload: { text: '' }, targetHint: null, ttlMs: 8000 };
  }

  const lower = text.toLowerCase().trim();

  // Extract target hint if present (bot names: bolt, rivet, juno, magma, earl, both, all)
  const botNames = ['bolt', 'rivet', 'juno', 'magma', 'earl', 'both', 'all'];
  let targetHint = null;
  for (const name of botNames) {
    if (lower.includes(name)) {
      targetHint = name;
      break;
    }
  }

  // Check for 'go to' / 'goto' with compass direction
  const compassMatch = lower.match(/(?:go\s+to|head|go)\s+(north|south|east|west|n|s|e|w|left|right|back)\b/i);
  if (compassMatch) {
    const dirInput = compassMatch[1].toLowerCase();
    const dirMap = {
      'n': 'north', 'north': 'north',
      's': 'south', 'south': 'south',
      'e': 'east', 'east': 'east',
      'w': 'west', 'west': 'west',
      'left': 'west',
      'right': 'east',
      'back': 'south',
    };
    const dir = dirMap[dirInput] || 'north';
    const deltas = {
      'north': { dx: 0, dz: -1 },
      'south': { dx: 0, dz: 1 },
      'east': { dx: 1, dz: 0 },
      'west': { dx: -1, dz: 0 },
    };
    const { dx, dz } = deltas[dir];
    return {
      intent: 'goto',
      payload: { dir, dx, dz },
      targetHint,
      ttlMs: 20000,
    };
  }

  // Check for 'go to x,z' format
  const coordMatch = lower.match(/(?:go\s+to|goto)\s+(\d+)\s*,\s*(\d+)/);
  if (coordMatch) {
    const x = parseInt(coordMatch[1], 10);
    const z = parseInt(coordMatch[2], 10);
    const dist = Math.hypot(x, z);
    const dx = dist > 0 ? x / dist : 0;
    const dz = dist > 0 ? z / dist : 0;
    return {
      intent: 'goto',
      payload: { dir: null, dx, dz },
      targetHint,
      ttlMs: 20000,
    };
  }

  // Check for 'mine' command
  if (lower.match(/\bmine\b/)) {
    let what = null;
    if (lower.includes('scrap')) what = 'scrap';
    else if (lower.includes('ore')) what = 'ore';
    else if (lower.includes('crystal')) what = 'crystal';
    return {
      intent: 'mine',
      payload: { what },
      targetHint,
      ttlMs: 30000,
    };
  }

  // Check for 'follow' command
  if (lower.match(/\bfollow\b/)) {
    return {
      intent: 'follow',
      payload: {},
      targetHint,
      ttlMs: 15000,
    };
  }

  // Check for 'stop' command
  if (lower.match(/\bstop\b/)) {
    return {
      intent: 'stop',
      payload: {},
      targetHint,
      ttlMs: 15000,
    };
  }

  // Check for 'race' command
  if (lower.match(/\brace\b/)) {
    return {
      intent: 'race',
      payload: {},
      targetHint,
      ttlMs: 120000,
    };
  }

  // Default: banter
  return {
    intent: 'banter',
    payload: { text },
    targetHint,
    ttlMs: 8000,
  };
}

export class NudgeRouter {
  constructor({ clock = Date.now } = {}) {
    this.clock = clock;
    this._seq = 0;
  }

  deliver(bot, text, { now } = {}) {
    if (!bot) {
      return null;
    }

    now = now ?? this.clock();
    const parsed = parseNudge(text);

    const directive = {
      intent: parsed.intent,
      payload: parsed.payload,
      text,
      issuedAt: now,
      expiresAt: now + parsed.ttlMs,
      seq: this._seq++,
    };

    try {
      bot.directive = directive;
    } catch {
      // Fail soft: if bot is read-only, just move on
    }

    return directive;
  }

  consume(bot, { now } = {}) {
    if (!bot || !bot.directive) {
      return null;
    }

    now = now ?? this.clock();
    const directive = bot.directive;

    if (now >= directive.expiresAt) {
      // Expired
      try {
        bot.directive = null;
      } catch {
        // Fail soft
      }
      return null;
    }

    try {
      bot.directive = null;
    } catch {
      // Fail soft
    }
    return directive;
  }

  active(bot, { now } = {}) {
    if (!bot || !bot.directive) {
      return null;
    }

    now = now ?? this.clock();
    const directive = bot.directive;

    if (now >= directive.expiresAt) {
      return null;
    }

    return directive;
  }
}
