/**
 * SIGNATURE LANDMARKS — the yard's skyline.
 *
 * Doctrine (captain's fork): "the yard should FEEL like a place, not a grid."
 * Every band gets 2-3 tall, deterministic, visible-from-a-distance landmarks.
 * Fixed coordinates — seeds shuffle the scatter, never the skyline, so a kid
 * can learn the yard by heart and navigate by silhouettes.
 *
 * Build rules enforced in World._placeLandmarks():
 *   - placed LAST in generate(), after beacons/caches/scatter
 *   - a landmark block NEVER overwrites: BEACON, TRACK, an interactive
 *     station (WORKBENCH/FORGE/SMELTER/SCRAP_CANNON), or a BURIED_CACHE.
 *     (Set-aside cells are skipped, not moved — the landmark loses the cell.)
 *
 * Copy is Earl-voiced (see worldbible); names are final until a kid says otherwise.
 */

import { B } from './blocks.js';

/**
 * Each landmark: id, name, band, lore (Earl, pointing at it), and build(w)
 * that places blocks via w._lm(x,y,z,id) (the guarded setter).
 */
export const LANDMARKS = [

  // ── Band 0 · The Yard Gate ─────────────────────────────────────────────
  {
    id: 'thirsty_tower', name: 'The Thirsty Tower', band: 0,
    hint: 'Orientation: the drum-stack on legs is visible from spawn — "yard heart is that way."',
    lore: "Oldest thing in the yard. Drank three floods and a lawsuit. Look for it when you're turned around, kid.",
    build(w) {
      const x = 34, z = 26;
      for (const [dx, dz] of [[-1,-1],[1,-1],[-1,1],[1,1]])
        for (let y = 1; y <= 5; y++) w._lm(x + dx, y, z + dz, B.WALL_METAL);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        w._lm(x + dx, 6, z + dz, B.OIL_DRUM);
        w._lm(x + dx, 7, z + dz, B.OIL_DRUM);
      }
      w._lm(x, 8, z, B.FLOODLIGHT);   // the "tap light" on top
    },
  },
  {
    id: 'cratesaurus', name: 'Cratesaurus', band: 0,
    hint: 'Play: crates are loot. A mountain of crates reads as "free stuff over here."',
    lore: "Somebody stacked crates into a head back in '09. Yard kept it. Yard keeps everything.",
    build(w) {
      const x = 108, z = 12;
      // skull: 5 wide x 4 deep x 5 high crate mass, leaning one block east
      for (let y = 1; y <= 5; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -1; dz <= 2; dz++) {
        if (y === 5 && dz > 1) continue;                       // worn-off back top
        w._lm(x + dx + (y >= 4 ? 1 : 0), y, z + dz, B.CRATE);
      }
      w._lm(x - 1, 3, z, B.POWER_BOX);                          // left eye (glows-ish)
      w._lm(x + 1, 3, z, B.POWER_BOX);                          // right eye
      w._lm(x, 6, z, B.WALL_METAL);                             // antenna mast
      w._lm(x, 7, z, B.FLOODLIGHT);                             // antenna light
    },
  },
  {
    id: 'tire_mountain', name: 'Tire Mountain', band: 0,
    hint: 'Hazard-lite: junk cars hurt to mine early (hardness 1.1) — the pile says "come back stronger."',
    lore: "Every yard's got one. Ours leans north. Don't ask why. It just does.",
    build(w) {
      const x = 58, z = 6;
      for (let y = 1; y <= 4; y++) {
        const r = 5 - y;                                        // pyramid, base r=4
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;    // rounded pile
          w._lm(x + dx, y, z + dz, y === 4 ? B.SCRAP_PILE : B.JUNK_CAR);
        }
      }
      w._lm(x, 5, z, B.SCRAP_PILE);                             // the crown
    },
  },

  // ── Band 1 · Industrial Corridor ───────────────────────────────────────
  {
    id: 'old_smokestack', name: 'Old Smokescreen', band: 1,
    hint: 'Thermals/hazard: points at the refinery belt and acid pools — "industry is that way."',
    lore: "Hasn't smoked since the permit expired. Still the tallest thing this side of the fence. Still smells like Tuesday.",
    build(w) {
      const x = 110, z = 48;
      for (let y = 1; y <= 8; y++) w._lm(x, y, z, B.RUST_METAL);
      for (const ry of [4, 7]) {                                // broken rings
        w._lm(x + 1, ry, z, B.CLEAN_METAL);
        w._lm(x - 1, ry, z, B.CLEAN_METAL);
      }
      w._lm(x, 9, z, B.CRATE);                                 // the crow's nest (somebody's)
    },
  },
  {
    id: 'big_grabber', name: 'Big Grabber', band: 1,
    hint: 'Hazard foreshadow: the crane magnet (NORTHSTAR\'s doom). Teaches "magnets ignore your compass."',
    lore: "The Grabber. It ate a compass bot once — plaque's over in the Deep Yard. Everything metal bows to it, including your bot.",
    build(w) {
      const x = 28, z = 56;
      for (let y = 1; y <= 8; y++) w._lm(x, y, z, B.WALL_METAL);
      for (let y = 1; y <= 4; y++) {                            // A-frame counterweights
        w._lm(x - 2, y, z, B.RUST_METAL);
        w._lm(x + 2, y, z, B.RUST_METAL);
      }
      for (let dx = 1; dx <= 9; dx++) w._lm(x + dx, 8, z, B.CLEAN_METAL);   // jib, reaching east
      w._lm(x + 9, 7, z, B.OIL_DRUM);                           // the hook drum
      w._lm(x + 9, 6, z, B.POWER_BOX);                          // the magnet (humming)
      for (const ry of [3, 6]) w._lm(x, ry, z, B.FLOODLIGHT);   // cab lights
    },
  },
  {
    id: 'eternal_flame', name: 'The Eternal Flame', band: 1,
    hint: 'Forge/stations hint: a lit drum says "people work metal here." Navigation beacon at night.',
    lore: "Lit it in '04 to burn off fumes. Forgot to put it out. Now it's load-bearing — yard'd feel wrong without it.",
    build(w) {
      const x = 98, z = 40;
      for (let y = 1; y <= 3; y++) for (let dz = -1; dz <= 1; dz++)
        w._lm(x, y, z + dz, B.OIL_DRUM);                        // tripod of drum columns
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        w._lm(x + dx, 4, z + dz, B.OIL_DRUM);                   // platform
      w._lm(x, 5, z, B.OIL_DRUM);
      w._lm(x, 6, z, B.FLOODLIGHT);                             // the flame
    },
  },

  // ── Band 2 · Circuit City ──────────────────────────────────────────────
  {
    id: 'trace_gate', name: 'The Trace Gate', band: 2,
    hint: 'Gateway legibility: an arch over the road says "you are ENTERING a district." Nodes = a circuit trace.',
    lore: "Not decoration, kid. That's a trace, big as we could build it. Power goes in one pylon, comes out the other, and the yard hums.",
    build(w) {
      const z = 88;
      for (const px of [61, 67]) {
        for (let y = 1; y <= 7; y++) w._lm(px, y, z, B.CLEAN_METAL);
        w._lm(px, 3, z, B.POWER_BOX);                           // node mid-pylon
        w._lm(px, 8, z, B.FLOODLIGHT);
      }
      for (let x = 62; x <= 66; x++) w._lm(x, 8, z, B.CLEAN_METAL);          // crossbar
      w._lm(64, 7, z, B.POWER_BOX);                                           // center node
      for (const [sx, sy] of [[63, 6], [65, 5], [63, 4]]) w._lm(sx, sy, z, B.POWER_BOX); // step-trace down
    },
  },
  {
    id: 'listening_wall', name: "The Ear Wall", band: 2,
    hint: 'Signals hint: panels face outward — "the yard listens." Points at signal caches/radio tower.',
    lore: "Pointed at the county, not the yard. It listens. Ask your radio why you knew that.",
    build(w) {
      const x = 14, z = 88;
      for (let y = 1; y <= 5; y++) for (let dx = -3; dx <= 3; dx++) w._lm(x + dx, y, z, B.WALL_METAL);
      for (let dx = -2; dx <= 2; dx += 2)                       // panel array, staggered
        for (let y = 2; y <= 4; y += 2) w._lm(x + dx, y, z - 1, B.SOLAR_PANEL);
      w._lm(x, 6, z, B.POWER_BOX);                              // the mast box
      w._lm(x, 7, z, B.CLEAN_METAL);
      w._lm(x, 8, z, B.FLOODLIGHT);                             // the listening lamp (not a beacon — keep those sacred)
    },
  },
  {
    id: 'the_quads', name: 'The Quads', band: 2,
    hint: 'Race culture: floodlights mean races. Foreshadows the oval and the Midnight Race.',
    lore: "Four lights, one job: make noon out of midnight. They haven't all agreed to work since 2019.",
    build(w) {
      const cx = 108, cz = 90;
      for (const [dx, dz] of [[-2,-2],[2,-2],[-2,2],[2,2]]) {
        for (let y = 1; y <= 6; y++) w._lm(cx + dx, y, cz + dz, B.WALL_METAL);
        w._lm(cx + dx, 7, cz + dz, B.FLOODLIGHT);
      }
      for (let y = 1; y <= 5; y++) w._lm(cx, y, cz, B.RUST_METAL);            // center post
      w._lm(cx, 6, cz, B.FLOODLIGHT);
    },
  },

  // ── Band 3 · The Deep Yard ─────────────────────────────────────────────
  {
    id: 'ghost_track', name: 'The Ghost Track', band: 3,
    hint: 'FINALE TEASE (never gated): the Midnight Race lives here — silhouette only. Empty letter boards say the county is coming.',
    lore: "Scaffold's for race night. Boards stay empty till the county sends the letters. They always send the letters.",
    build(w) {
      const cx = 102, cz = 120, rx = 12, rz = 4;
      // The oval silhouette — track strips on the ground, a ghost of the real thing
      for (let i = 0; i < 360; i++) {
        const rad = (i * Math.PI) / 180;
        const ox = Math.round(cx + rx * Math.cos(rad));
        const oz = Math.round(cz + rz * Math.sin(rad));
        w._lm(ox, 0, oz, B.TRACK);
      }
      // Spectator scaffold frames — four towers at the corners, crossbars between
      for (const [tx, tz] of [[cx - rx - 2, cz - rz - 2], [cx + rx + 2, cz - rz - 2],
                              [cx - rx - 2, cz + rz + 2], [cx + rx + 2, cz + rz + 2]]) {
        for (let y = 1; y <= 6; y++) w._lm(tx, y, tz, B.WALL_METAL);
        w._lm(tx, 7, tz, B.FLOODLIGHT);
      }
      // Letter boards — big empty rectangles on the north side. COUNTY LETTERS COME HERE.
      for (let bx = cx - 8; bx <= cx + 8; bx += 5) {
        for (let y = 2; y <= 5; y++) for (let dz = 0; dz <= 1; dz++) w._lm(bx + dz, y, cz - rz - 4, B.CLEAN_METAL);
        w._lm(bx, 6, cz - rz - 4, B.POWER_BOX);                 // the studs that'll hold the letters
      }
      // Start-gate ghost — two pylons and no crossbar (Earl's still holding it)
      for (const gx of [cx - 2, cx + 2]) for (let y = 1; y <= 4; y++) w._lm(gx, y, cz - rz, B.RUST_METAL);
    },
  },
  {
    id: 'doorhouse_light', name: 'The Doorhouse Light', band: 3,
    hint: 'Navigation: a light in the deepest dark. "Head for the door-stack."',
    lore: "Lighthouse with no water. Kid asked why once. Told 'em: boats sink, yards don't.",
    build(w) {
      const x = 14, z = 118;
      for (let y = 1; y <= 7; y++) w._lm(x, y, z, B.JUNK_CAR);   // stacked car doors
      for (const dy of [2, 5]) {                                // gallery rings
        w._lm(x + 1, dy, z, B.RUST_METAL);
        w._lm(x - 1, dy, z, B.RUST_METAL);
      }
      w._lm(x, 8, z, B.FLOODLIGHT);                             // the lamp
    },
  },
  {
    id: 'the_fist', name: 'The Fist', band: 3,
    hint: 'Endgame mood: something big is buried here. Robot past = finale stakes.',
    lore: "Whatever that was, it was BIG, and it lost. Dig at your own risk. Respect it anyway.",
    build(w) {
      const x = 40, z = 100;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        for (let y = 1; y <= 7; y++) w._lm(x + dx, y, z + dz, B.WALL_METAL);  // forearm
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        w._lm(x + dx, 8, z + dz, B.RUST_METAL);                 // knuckle block
        w._lm(x + dx, 8, z + dz + 3, B.RUST_METAL);             // fist forward
        w._lm(x + dx, 8, z + dz - 3, B.RUST_METAL);
      }
      w._lm(x, 9, z, B.CRATE);                                  // whatever it was holding
    },
  },
];

/** Cheap per-band ground flavor — accents so corridors stop reading identical. */
export const BAND_FLAVOR = {
  0: { accent: B.GRAVEL,   chance: 0.10, note: 'tire ruts toward the roads' },
  1: { accent: B.DIRT,     chance: 0.10, note: 'oil-stained ground near the refinery belt' },
  2: { accent: B.CONCRETE, chance: 0.12, note: 'swept clean lanes along the wire runs' },
  3: { accent: B.GRAVEL,   chance: 0.12, note: 'crystal dust around the veins' },
};
