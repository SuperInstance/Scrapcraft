/**
 * Offline recipe bank — Spark falls back to these when no API key is present.
 * Each entry matches keywords in the user's message and returns a prebuilt program.
 */

import { TileProgram, T } from './maker/TileProgram.js';

export const OFFLINE_RECIPES = [
  {
    keywords: ['wall', 'avoid', 'bump', 'crash', 'bounce'],
    reply:    "Wall-avoider mode! It'll bonk into nothing. Very satisfying to watch.",
    program:  new TileProgram({ name: 'Wall Avoider', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('distance_ahead', 'lt', 0.25),
          [T.action('beep', { pitch: 'high' }), T.action('turn', { dir: 'right', speed: 0.6 }), T.wait(0.4)],
          [T.action('drive', { dir: 'forward', speed: 0.6 })],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['light', 'bright', 'sun', 'chase', 'follow', 'toward'],
    reply:    "Light chaser engaged! It steers toward the brightest spot it can find.",
    program:  new TileProgram({ name: 'Light Chaser', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('brightness', 'gt', 0.6),
          [T.action('drive', { dir: 'forward', speed: 0.7 })],
          [T.action('turn', { dir: 'right', speed: 0.4 })],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['dark', 'night', 'shadow', 'flee', 'away', 'run'],
    reply:    "Darkness flee-er! Floors it when the lights go out. Very dramatic.",
    program:  new TileProgram({ name: 'Light Runner', brain: 'spark', nodes: [
      T.forever([
        T.ifElse(T.cond('is_dark', 'is', true),
          [T.action('led', { state: 'red' }), T.action('drive', { dir: 'forward', speed: 0.8 })],
          [T.action('led', { state: 'blue' }), T.action('drive', { dir: 'forward', speed: 0.25 })],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['square', 'rectangle', 'box', 'loop', 'around'],
    reply:    "A perfect square patrol! Four sides, four turns. Earl would approve.",
    program:  new TileProgram({ name: 'Square Patrol', brain: 'tin', nodes: [
      T.repeat(4, [
        T.action('drive', { dir: 'forward', speed: 0.6 }),
        T.wait(1.5),
        T.action('beep', { pitch: 'mid' }),
        T.macro('turn_angle', { dir: 'right', degrees: 90 }),
      ]),
      T.action('stop'),
    ]}),
  },
  {
    keywords: ['spin', 'rotate', 'pirouette', 'twirl', 'dizzy'],
    reply:    "Behold: the spinning bot! Very dizzying. 10/10 would watch again.",
    program:  new TileProgram({ name: 'Spin Artist', brain: 'tin', nodes: [
      T.forever([
        T.action('turn', { dir: 'right', speed: 1.0 }),
      ]),
    ]}),
  },
  {
    keywords: ['greet', 'wave', 'hello', 'hi', 'meet', 'person', 'near', 'human'],
    reply:    "Greeting protocol loaded! Honks and glows green whenever you get close.",
    program:  new TileProgram({ name: 'Greeter Bot', brain: 'tin', nodes: [
      T.forever([
        T.if(T.is('player_near', true), [
          T.action('led', { state: 'green' }),
          T.action('beep', { pitch: 'high' }),
          T.wait(0.4),
          T.action('led', { state: 'off' }),
          T.wait(0.4),
        ]),
        T.wait(0.1),
      ]),
    ]}),
  },
  {
    keywords: ['patrol', 'back', 'forth', 'shuttle', 'pace'],
    reply:    "Back-and-forth patrol! Like a Roomba with ambition and opinions.",
    program:  new TileProgram({ name: 'Patrol Bot', brain: 'tin', nodes: [
      T.forever([
        T.action('drive', { dir: 'forward', speed: 0.6 }),
        T.wait(2.0),
        T.action('beep', { pitch: 'mid' }),
        T.action('turn', { dir: 'right', speed: 0.6 }),
        T.wait(0.56),
      ]),
    ]}),
  },
  {
    keywords: ['stop', 'freeze', 'halt', 'still', 'idle', 'nothing'],
    reply:    "I built you a stone-cold stopper. Press RUN to efficiently do nothing.",
    program:  new TileProgram({ name: 'Stone Cold Still', brain: 'tin', nodes: [
      T.action('stop'),
    ]}),
  },
  {
    keywords: ['blink', 'flash', 'disco', 'party', 'rainbow', 'colour', 'color', 'light show'],
    reply:    "PARTY MODE. Earl's gonna hate it. That's what makes it perfect.",
    program:  new TileProgram({ name: 'Disco Bot', brain: 'tin', nodes: [
      T.forever([
        T.action('led', { state: 'red' }),   T.wait(0.15),
        T.action('led', { state: 'green' }), T.wait(0.15),
        T.action('led', { state: 'blue' }),  T.wait(0.15),
        T.action('led', { state: 'white' }), T.wait(0.15),
      ]),
    ]}),
  },
  {
    keywords: ['song', 'music', 'melody', 'beep', 'tune', 'sing', 'concert'],
    reply:    "Scrapyard Symphony No. 1! First ever robot concert in this yard.",
    program:  new TileProgram({ name: 'Symphony Bot', brain: 'tin', nodes: [
      T.action('beep', { pitch: 'high' }), T.wait(0.2),
      T.action('beep', { pitch: 'mid' }),  T.wait(0.2),
      T.action('beep', { pitch: 'low' }),  T.wait(0.2),
      T.action('beep', { pitch: 'mid' }),  T.wait(0.4),
      T.action('beep', { pitch: 'high' }), T.wait(0.1),
      T.action('beep', { pitch: 'high' }), T.wait(0.5),
    ]}),
  },
  {
    keywords: ['grab', 'arm', 'pick', 'collect', 'fetch', 'carry'],
    reply:    "Grab-and-go! Drives in, snatches it, backs out. Tiny robot forklift!",
    program:  new TileProgram({ name: 'Grabber Bot', brain: 'spark', nodes: [
      T.forever([
        T.action('grab', { state: 'open' }),
        T.action('drive', { dir: 'forward', speed: 0.5 }),
        T.wait(1.0),
        T.action('grab', { state: 'close' }),
        T.action('beep', { pitch: 'high' }),
        T.action('drive', { dir: 'backward', speed: 0.5 }),
        T.wait(1.0),
        T.action('stop'),
        T.wait(0.5),
      ]),
    ]}),
  },
  {
    keywords: ['slow', 'careful', 'gentle', 'cautious', 'creep', 'sneak'],
    reply:    "Ultra-careful creeper mode. It tippy-toes through the yard. Peak robot etiquette.",
    program:  new TileProgram({ name: 'Careful Creeper', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('distance_ahead', 'gt', 0.5),
          [T.action('drive', { dir: 'forward', speed: 0.2 })],
          [T.action('stop'), T.wait(0.5), T.action('turn', { dir: 'left', speed: 0.3 }), T.wait(0.3)],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['fast', 'speed', 'full', 'turbo', 'maximum', 'pedal', 'quick', 'zoom'],
    reply:    "FULL THROTTLE! Please do not aim it at Earl's lunch.",
    program:  new TileProgram({ name: 'Speed Demon', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('distance_ahead', 'gt', 0.4),
          [T.action('drive', { dir: 'forward', speed: 1.0 })],
          [T.action('stop'), T.action('turn', { dir: 'right', speed: 0.8 }), T.wait(0.3)],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['line', 'track', 'follow', 'strip', 'ir', 'infrared', 'rail', 'course'],
    reply:    "Line follower engaged! It'll stick to those TRACK strips like glue. Place some on the ground first!",
    program:  new TileProgram({ name: 'Line Follower', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.is('line_under', true),
          [T.action('drive', { dir: 'forward', speed: 0.5 })],
          [T.action('turn', { dir: 'right', speed: 0.5 }), T.wait(0.15)],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['heat', 'warm', 'temperature', 'hot', 'cold', 'forge', 'thermal', 'temp'],
    reply:    "Heat seeker! It heads for warmth and honks when it gets toasty. The forge will set it off.",
    program:  new TileProgram({ name: 'Heat Seeker', brain: 'spark', nodes: [
      T.forever([
        T.ifElse(T.cond('temperature', 'gt', 0.6),
          [T.action('led', { state: 'red' }), T.action('beep', { pitch: 'high' }), T.wait(0.3)],
          T.ifElse(T.cond('temperature', 'gt', 0.4),
            [T.action('led', { state: 'green' }), T.action('drive', { dir: 'forward', speed: 0.4 })],
            [T.action('led', { state: 'blue' }), T.action('turn', { dir: 'right', speed: 0.3 })],
          ),
        ),
      ]),
    ]}),
  },
  {
    keywords: ['zigzag', 'zig', 'zag', 'weave', 'serpentine', 'snake', 'slalom'],
    reply:    "Zigzag mode! Left, right, left, right — it drives like Earl backing up a forklift.",
    program:  new TileProgram({ name: 'Zigzag Bot', brain: 'tin', nodes: [
      T.forever([
        T.action('drive', { dir: 'forward', speed: 0.6 }), T.wait(0.6),
        T.action('turn',  { dir: 'left', speed: 0.6 }),   T.wait(0.25),
        T.action('drive', { dir: 'forward', speed: 0.6 }), T.wait(0.6),
        T.action('turn',  { dir: 'right', speed: 0.6 }),   T.wait(0.25),
      ]),
    ]}),
  },
  {
    keywords: ['alarm', 'guard', 'watch', 'intruder', 'alert', 'sentry', 'security'],
    reply:    "Sentry mode! Scans for you and raises the alarm. Earl asked for this one.",
    program:  new TileProgram({ name: 'Sentry Bot', brain: 'tin', nodes: [
      T.forever([
        T.action('turn', { dir: 'right', speed: 0.3 }),
        T.wait(0.2),
        T.if(T.is('player_near', true), [
          T.action('led', { state: 'red' }),
          T.action('beep', { pitch: 'high' }), T.wait(0.1),
          T.action('beep', { pitch: 'high' }), T.wait(0.1),
          T.action('beep', { pitch: 'high' }), T.wait(0.3),
          T.action('led', { state: 'off' }),
        ]),
      ]),
    ]}),
  },
];

/** Returns best-matching recipe or null if no keyword hits. */
export function matchRecipe(text) {
  const words = text.toLowerCase().split(/\W+/);
  let best = null, bestScore = 0;
  for (const recipe of OFFLINE_RECIPES) {
    const score = recipe.keywords.filter(k => words.includes(k)).length;
    if (score > bestScore) { best = recipe; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

export const DEFAULT_RECIPE = OFFLINE_RECIPES[0];
