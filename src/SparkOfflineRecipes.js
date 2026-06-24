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
  {
    keywords: ['waypoint', 'navigate', 'go', 'destination', 'flag', 'find', 'path', 'seek'],
    reply:    "Waypoint navigator loaded! Drop a flag with Y, then press RUN — it'll steer straight there, dodging walls.",
    program:  new TileProgram({ name: 'Waypoint Navigator', brain: 'spark', nodes: [
      T.forever([
        T.ifElse(T.cond('waypoint_dist', 'lt', 0.08),
          [T.action('stop'), T.action('beep', { pitch:'high' }), T.wait(0.5)],
          [
            T.ifElse(T.cond('waypoint_bearing', 'gt', 0.1),
              [T.action('turn', { dir:'right', speed:0.5 })],
              [T.ifElse(T.cond('waypoint_bearing', 'lt', -0.1),
                [T.action('turn', { dir:'left', speed:0.5 })],
                [T.action('drive', { dir:'forward', speed:0.7 })],
              )],
            ),
            T.if(T.cond('distance_ahead', 'lt', 0.15), [
              T.action('drive', { dir: 'backward', speed: 0.5 }), T.wait(0.35),
              T.action('turn', { dir: 'right', speed: 0.6 }), T.wait(0.3),
            ]),
          ],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['ore', 'crystal', 'mine', 'scan', 'magnetic', 'detector', 'hunter', 'deep yard'],
    reply:    "Crystal ore hunter! It uses a magnetic sensor to sniff out ore in the Deep Yard. LED goes green when it's right on top of some. Dig it up after!",
    program:  new TileProgram({ name: 'Ore Hunter', brain: 'spark', nodes: [
      T.forever([
        T.ifElse(T.cond('ore_nearby', 'gt', 0.65),
          [
            T.action('stop'),
            T.action('led', { state: 'green' }),
            T.action('beep', { pitch: 'high' }), T.wait(0.3),
            T.action('beep', { pitch: 'high' }), T.wait(0.5),
          ],
          [
            T.ifElse(T.cond('ore_nearby', 'gt', 0.3),
              [T.action('led', { state: 'blue' }),  T.action('drive', { dir: 'forward', speed: 0.3 })],
              [T.action('led', { state: 'red' }),   T.action('drive', { dir: 'forward', speed: 0.55 })],
            ),
            T.if(T.cond('distance_ahead', 'lt', 0.2), [
              T.action('drive', { dir: 'backward', speed: 0.4 }), T.wait(0.3),
              T.action('turn', { dir: 'right', speed: 0.6 }), T.wait(0.35),
            ]),
          ],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['storm', 'rain', 'weather', 'shelter', 'hide', 'cloud'],
    reply:    "Storm shelter protocol! It heads for cover when rain hits and stops. Smarter than most humans.",
    program:  new TileProgram({ name: 'Storm Shelter', brain: 'spark', nodes: [
      T.forever([
        T.ifElse(T.cond('weather', 'gt', 0.5),
          [
            T.action('led', { state: 'blue' }),
            T.action('drive', { dir: 'forward', speed: 0.8 }),
            T.if(T.cond('distance_ahead', 'lt', 0.2), [
              T.action('stop'),
              T.action('led', { state: 'green' }),
              T.action('beep', { pitch: 'mid' }),
              T.wait(1.0),
            ]),
          ],
          [T.action('led', { state: 'off' }), T.action('stop'), T.wait(0.5)],
        ),
      ]),
    ]}),
  },
  {
    keywords: ['count', 'track', 'tally', 'remember', 'times', 'how many', 'bump counter', 'variable'],
    reply:    "Bump counter built! It drives forward, counts every wall hit, and flashes red when it hits 5. That's variables in action — storing state between loops!",
    program:  new TileProgram({ name: 'Bump Counter', brain: 'tin', nodes: [
      T.setVar('bumps', 0),
      T.forever([
        T.action('drive', { dir: 'forward', speed: 0.6 }),
        T.if(T.is('bumped', true), [
          T.changeVar('bumps', 1),
          T.action('beep', { pitch: 'high' }),
          T.action('turn', { dir: 'right', speed: 0.6 }),
          T.wait(0.4),
        ]),
        T.if(T.varCond('bumps', 'gte', 5), [
          T.action('stop'),
          T.action('led', { state: 'red' }),
          T.action('beep', { pitch: 'low' }),
          T.wait(2),
          T.setVar('bumps', 0),
        ]),
      ]),
    ]}),
  },
  {
    keywords: ['lap', 'laps', 'circuit', 'circuits', 'round', 'rounds', 'lap counter', 'loop counter'],
    reply:    "Lap counter! It drives forward and turns right like it's on a track. After 3 laps it does a victory beep — you can change the lap count in the variable blocks!",
    program:  new TileProgram({ name: 'Lap Counter', brain: 'tin', nodes: [
      T.setVar('laps', 0),
      T.forever([
        T.action('drive', { dir: 'forward', speed: 0.7 }),
        T.wait(0.8),
        T.action('turn', { dir: 'right', speed: 0.6 }),
        T.wait(0.45),
        T.changeVar('laps', 1),
        T.action('led', { state: 'blue' }),
        T.action('beep', { pitch: 'mid' }),
        T.wait(0.1),
        T.action('led', { state: 'off' }),
        T.if(T.varCond('laps', 'gte', 3), [
          T.action('stop'),
          T.action('led', { state: 'green' }),
          T.action('beep', { pitch: 'high' }), T.wait(0.15),
          T.action('beep', { pitch: 'high' }), T.wait(0.15),
          T.action('beep', { pitch: 'high' }), T.wait(1.5),
          T.setVar('laps', 0),
        ]),
      ]),
    ]}),
  },
  {
    keywords: ['collect', 'pickup', 'gather', 'score', 'points', 'item', 'items', 'collection'],
    reply:    "Scrap collector! It scoops items and counts them. LED blinks blue each pickup, then goes gold at 4. Every scrap yard needs a point system!",
    program:  new TileProgram({ name: 'Collector Bot', brain: 'spark', nodes: [
      T.setVar('score', 0),
      T.forever([
        T.ifElse(T.cond('item_nearby', 'gt', 0.5),
          [
            T.action('drive', { dir: 'forward', speed: 0.4 }),
            T.if(T.is('item_collected', true), [
              T.changeVar('score', 1),
              T.action('led', { state: 'blue' }),
              T.action('beep', { pitch: 'high' }),
              T.wait(0.2),
              T.action('led', { state: 'off' }),
            ]),
          ],
          [
            T.action('drive', { dir: 'forward', speed: 0.55 }),
            T.if(T.cond('distance_ahead', 'lt', 0.15), [
              T.action('drive', { dir: 'backward', speed: 0.4 }), T.wait(0.3),
              T.action('turn', { dir: 'right', speed: 0.6 }), T.wait(0.3),
            ]),
          ],
        ),
        T.if(T.varCond('score', 'gte', 4), [
          T.action('stop'),
          T.action('led', { state: 'yellow' }),
          T.action('beep', { pitch: 'high' }), T.wait(0.1),
          T.action('beep', { pitch: 'mid' }), T.wait(0.1),
          T.action('beep', { pitch: 'low' }), T.wait(2),
          T.setVar('score', 0),
        ]),
      ]),
    ]}),
  },
  {
    keywords: ['repeat until', 'while', 'until', 'keep going', 'run until', 'stop when', 'drive until', 'move until'],
    reply:    "Approach-until built! The bot drives toward a wall and stops the moment it gets close — that's a repeat_until loop: 'keep doing this UNTIL that condition is true'. Your first while loop!",
    program:  new TileProgram({ name: 'Approach Until', brain: 'tin', nodes: [
      T.repeatUntil(T.cond('distance_ahead', 'lt', 0.25), [
        T.action('drive', { dir: 'forward', speed: 0.5 }),
      ]),
      T.action('stop'),
      T.action('beep', { pitch: 'mid' }),
    ]}),
  },
  {
    keywords: ['break', 'exit loop', 'stop loop', 'stop when', 'escape', 'quit loop'],
    reply:    "Break-on-bump pattern! The bot drives forever but breaks out of the loop the instant it bumps a wall. That's break — your emergency exit from any loop!",
    program:  new TileProgram({ name: 'Break on Bump', brain: 'tin', nodes: [
      T.forever([
        T.action('drive', { dir: 'forward', speed: 0.5 }),
        T.if(T.cond('distance_ahead', 'lt', 0.1), [ T.break() ]),
      ]),
      T.action('stop'),
      T.action('led', { state: 'red' }),
      T.action('beep', { pitch: 'low' }),
      T.wait(1.5),
    ]}),
  },
  {
    keywords: ['random', 'surprise', 'dice', 'luck', 'chance', 'different', 'unpredictable'],
    reply:    "Random roamer! Each loop it rolls a virtual dice to pick how long to drive before turning. Every run is different — that's random numbers doing work!",
    program:  new TileProgram({ name: 'Random Roamer', brain: 'tin', nodes: [
      T.setVar('t', 0),
      T.forever([
        T.randomVar('t', 3, 12),
        T.action('led', { state: 'blue' }),
        T.action('drive', { dir: 'forward', speed: 0.6 }),
        T.repeat(3, [ T.wait(0.1) ]),
        T.if(T.cond('distance_ahead', 'lt', 0.25), [
          T.action('turn', { dir: 'right', speed: 0.6 }),
          T.wait(0.4),
        ]),
        T.action('led', { state: 'off' }),
      ]),
    ]}),
  },
  {
    keywords: ['function', 'subroutine', 'define', 'reuse', 'repeat pattern', 'same thing', 'refactor'],
    reply:    "Subroutine demo! There's a 'beepTurn' function that does a little victory dance. The forever loop calls it whenever the bot gets close to a wall. That's the power of functions — write once, use anywhere!",
    program:  new TileProgram({ name: 'Sub Demo', brain: 'tin', nodes: [
      T.forever([
        T.action('drive', { dir: 'forward', speed: 0.5 }),
        T.if(T.cond('distance_ahead', 'lt', 0.25), [
          { type: 'call_sub', name: 'beepTurn' },
        ]),
      ]),
      { type: 'define_sub', name: 'beepTurn', body: [
        T.action('beep', { pitch: 'high' }),
        T.action('led', { state: 'red' }),
        T.action('turn', { dir: 'right', speed: 0.6 }),
        T.wait(0.4),
        T.action('led', { state: 'off' }),
      ]},
    ]}),
  },
  {
    keywords: ['read sensor', 'sensor variable', 'store sensor', 'sensor value', 'capture distance', 'proportional', 'snapshot', 'save reading'],
    reply:    "Sensor snapshot! Every loop the bot reads the distance sensor into the 'dist' variable, prints it to the serial monitor, and slows down when close to a wall. That's proportional-ish control — no magic, just math on real data!",
    program:  new TileProgram({ name: 'Sensor Logger', brain: 'spark', nodes: [
      T.setVar('dist', 0),
      T.forever([
        T.readSensor('dist', 'distance_ahead'),
        T.print('dist'),
        T.ifElse(
          T.varCond('dist', 'lt', 0.3),
          [
            T.action('led', { state: 'red' }),
            T.action('drive', { dir: 'forward', speed: 0.2 }),
          ],
          [
            T.action('led', { state: 'green' }),
            T.action('drive', { dir: 'forward', speed: 0.7 }),
          ],
        ),
        T.wait(0.1),
      ]),
    ]}),
  },
  {
    keywords: ['multiply', 'divide', 'scale', 'math', 'arithmetic', 'proportional', 'halve', 'double', 'math variable'],
    reply:    "Math variable demo! The bot reads the battery sensor (0.0–1.0) into 'batt', then multiplies by 100 to get a percentage, and prints it. When battery drops below 25, it slows down. That's math_var doing real sensor scaling!",
    program:  new TileProgram({ name: 'Battery Monitor', brain: 'spark', nodes: [
      T.setVar('batt', 100),
      T.forever([
        T.readSensor('batt', 'battery'),
        T.mathVar('batt', 'mul', 100),
        T.print('batt'),
        T.ifElse(
          T.varCond('batt', 'lt', 25),
          [
            T.action('led', { state: 'red' }),
            T.action('drive', { dir: 'forward', speed: 0.25 }),
          ],
          [
            T.action('led', { state: 'green' }),
            T.action('drive', { dir: 'forward', speed: 0.7 }),
          ],
        ),
        T.wait(0.5),
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
