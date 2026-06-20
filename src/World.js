import { B, BLOCK_DEF, isSolid } from './data/blocks.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

/*
  Four wide parallel bands along the Z axis, each 32 units deep × 128 wide.

  Band 0  z=  0..31   THE YARD GATE      — starter area, main stations, shed
  Band 1  z= 32..63   INDUSTRIAL CORRIDOR — metal towers, oil refineries, dense scrap
  Band 2  z= 64..95   CIRCUIT CITY        — electronics bay, power grid, crate warehouses
  Band 3  z= 96..127  THE DEEP YARD       — extreme clutter, final workshop, rare loot

  Roads (3-wide concrete paths) connect bands at x=8, x=64, x=120.
*/

export const BANDS = [
  { z0: 0,  z1: 31,  name: 'The Yard Gate',        color: '#8B6914' },
  { z0: 32, z1: 63,  name: 'Industrial Corridor',   color: '#707070' },
  { z0: 64, z1: 95,  name: 'Circuit City',          color: '#228822' },
  { z0: 96, z1: 127, name: 'The Deep Yard',         color: '#882222' },
];

export class World {
  constructor(width = 128, depth = 128, height = 10) {
    this.width  = width;
    this.depth  = depth;
    this.height = height;
    this.blocks = new Uint8Array(width * depth * height);
    this._listeners  = [];
    this.landmarks   = {};
    this.seed        = 42;
    this._minedBlocks  = [];  // [{ x,y,z }] — player-mined diffs for save system
    this._placedBlocks = [];  // [{ x,y,z,id }] — player-placed diffs for save system
  }

  _idx(x, y, z) { return x + z * this.width + y * this.width * this.depth; }

  getBlock(x, y, z) {
    if (x < 0 || x >= this.width || z < 0 || z >= this.depth || y < 0 || y >= this.height) return B.AIR;
    return this.blocks[this._idx(x, y, z)];
  }

  setBlock(x, y, z, id) {
    if (x < 0 || x >= this.width || z < 0 || z >= this.depth || y < 0 || y >= this.height) return;
    this.blocks[this._idx(x, y, z)] = id;
    this._emit('change', { x, y, z, id });
  }

  on(event, fn) { this._listeners.push({ event, fn }); }
  _emit(ev, d) { this._listeners.filter(l => l.event === ev).forEach(l => l.fn(d)); }

  generate(seed = 42) {
    this.seed = seed;
    const rng = lcg(seed);
    const W = this.width;

    // ── Ground layer ─────────────────────────────────────────────────────
    for (let z = 0; z < this.depth; z++) {
      for (let x = 0; x < W; x++) {
        const r = rng();
        const band = this._bandOf(z);
        let id;
        if (band === 0) id = r < 0.5 ? B.CONCRETE : r < 0.8 ? B.GRAVEL : B.DIRT;
        if (band === 1) id = r < 0.65 ? B.CONCRETE : B.GRAVEL;
        if (band === 2) id = r < 0.7 ? B.CONCRETE : B.GRAVEL;
        if (band === 3) id = r < 0.45 ? B.DIRT : r < 0.7 ? B.CONCRETE : B.GRAVEL;
        this.blocks[this._idx(x, 0, z)] = id;
      }
    }

    // ── Three roads connecting bands (x=8, x=64, x=120) ─────────────────
    for (const rx of [8, 64, 120]) {
      for (let z = 0; z < this.depth; z++) {
        for (let dx = -1; dx <= 1; dx++) {
          this.blocks[this._idx(rx + dx, 0, z)] = B.CONCRETE;
        }
      }
    }

    // ── Band 0: The Yard Gate ────────────────────────────────────────────
    this._band0(rng, W);

    // ── Band 1: Industrial Corridor ──────────────────────────────────────
    this._band1(rng, W);

    // ── Band 2: Circuit City ─────────────────────────────────────────────
    this._band2(rng, W);

    // ── Band 3: The Deep Yard ────────────────────────────────────────────
    this._band3(rng, W);
  }

  // ── Band generators ──────────────────────────────────────────────────

  _band0(rng, W) {
    const z0 = 0, z1 = 31;

    // Main station row (near spawn)
    this.setBlock(12, 1, 8, B.WORKBENCH);
    this.setBlock(14, 1, 8, B.FORGE);
    this.setBlock(16, 1, 8, B.SMELTER);
    this.landmarks.workbench = { x: 12, y: 1, z: 8 };
    this.landmarks.forge     = { x: 14, y: 1, z: 8 };
    this.landmarks.smelter   = { x: 16, y: 1, z: 8 };

    // Concrete path from spawn to stations
    for (let z = 3; z <= 8; z++)   this.setBlock(10, 0, z, B.CONCRETE);
    for (let x = 10; x <= 17; x++) this.setBlock(x,  0, 8, B.CONCRETE);

    // Starter shed
    this._buildShed(20, 0, 14, 7, 4, 6, rng);

    // Scrap piles spread across width
    for (let i = 0; i < 30; i++) {
      const x = 2 + Math.floor(rng() * (W - 4));
      const z = z0 + 2 + Math.floor(rng() * (z1 - z0 - 4));
      this._scrapCluster(rng, x, z, 2, 2);
    }
    // Oil drums
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rng() * (W - 4)) + 2;
      const z = z0 + Math.floor(rng() * (z1 - z0));
      if (this.getBlock(x, 1, z) === B.AIR) {
        this.setBlock(x, 1, z, B.OIL_DRUM);
        if (rng() < 0.4) this.setBlock(x, 2, z, B.OIL_DRUM);
      }
    }
    // Junk cars
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rng() * (W - 6)) + 3;
      const z = z0 + 5 + Math.floor(rng() * (z1 - z0 - 6));
      this._junkCar(rng, x, z);
    }
    // Crates, wood planks, power boxes
    this._scatter(rng, B.CRATE, 10, 2, W - 2, z0, z1);
    this._scatter(rng, B.WOOD_PLANK, 14, 2, W - 2, z0, z1);
    this._scatter(rng, B.POWER_BOX, 6, 2, W - 2, z0, z1);

    // Second station cluster (far end of band, x≈90)
    this.setBlock(90, 1, 20, B.WORKBENCH);
    this.setBlock(92, 1, 20, B.FORGE);

    // Robot test track — rectangular loop at y=0 for line_under sensor
    for (let x = 30; x <= 46; x++) { this.setBlock(x, 0, 14, B.TRACK); this.setBlock(x, 0, 22, B.TRACK); }
    for (let z = 14; z <= 22; z++) { this.setBlock(30, 0, z, B.TRACK); this.setBlock(46, 0, z, B.TRACK); }

    // Start/finish gate arch (two pylons at x=30 and x=46, straddling start line z=13)
    for (const gx of [30, 46]) {
      for (let y = 1; y <= 3; y++) this.setBlock(gx, y, 13, B.WALL_METAL);
      this.setBlock(gx, 4, 13, B.FLOODLIGHT);
    }
    // Crossbar
    for (let x = 31; x < 46; x++) this.setBlock(x, 4, 13, B.CLEAN_METAL);

    // Racing bleachers — east side of test track (x=48-51, z=14-22)
    for (let bz = 14; bz <= 22; bz++) {
      this.setBlock(48, 1, bz, B.CONCRETE);   // floor
      this.setBlock(48, 2, bz, B.WALL_METAL); // row 1 seat
      this.setBlock(49, 2, bz, B.CONCRETE);   // floor level 2
      this.setBlock(49, 3, bz, B.WALL_METAL); // row 2 seat
      this.setBlock(50, 3, bz, B.CONCRETE);   // floor level 3
      this.setBlock(50, 4, bz, B.WALL_METAL); // row 3 seat
    }
    // Bleacher supports (vertical pillars at each end)
    for (const bz of [14, 22]) {
      for (let y = 1; y <= 4; y++) this.setBlock(48, y, bz, B.WALL_METAL);
      for (let y = 1; y <= 4; y++) this.setBlock(50, y, bz, B.WALL_METAL);
    }
  }

  _band1(rng, W) {
    const z0 = 32, z1 = 63;

    // Dense scrap piles
    for (let i = 0; i < 40; i++) {
      const x = 2 + Math.floor(rng() * (W - 4));
      const z = z0 + Math.floor(rng() * (z1 - z0));
      this._scrapCluster(rng, x, z, 3, 3);
    }

    // Metal towers (tall columns, 3–6 high)
    for (let i = 0; i < 18; i++) {
      const x = 3 + Math.floor(rng() * (W - 6));
      const z = z0 + 2 + Math.floor(rng() * (z1 - z0 - 4));
      const h = 3 + Math.floor(rng() * 4);
      const type = rng() > 0.5 ? B.CLEAN_METAL : B.RUST_METAL;
      for (let y = 1; y <= h; y++) this.setBlock(x, y, z, type);
      // cross-beam
      if (h > 3 && rng() > 0.5) {
        for (let dx = -1; dx <= 1; dx++) this.setBlock(x + dx, h - 1, z, type);
      }
    }

    // Oil refineries (4-tall drum stacks in clusters)
    for (let i = 0; i < 10; i++) {
      const cx = 4 + Math.floor(rng() * (W - 8));
      const cz = z0 + 4 + Math.floor(rng() * (z1 - z0 - 8));
      for (let c = 0; c < 3; c++) {
        const bx = cx + c * 2;
        for (let y = 1; y <= 4; y++) this.setBlock(bx, y, cz, B.OIL_DRUM);
        if (c < 2) this.setBlock(bx + 1, 3, cz, B.CLEAN_METAL); // connector
      }
    }

    // Forge sheds (small sheds with a forge inside)
    for (let i = 0; i < 4; i++) {
      const x = 5 + Math.floor(rng() * (W - 14));
      const z = z0 + 5 + Math.floor(rng() * (z1 - z0 - 12));
      this._buildShed(x, 0, z, 6, 4, 5, rng);
      this.setBlock(x + 2, 1, z + 2, B.FORGE);
      this.setBlock(x + 4, 1, z + 2, B.WORKBENCH);
    }

    // Wide scrap walls (horizontal barriers)
    for (let i = 0; i < 6; i++) {
      const z = z0 + 8 + Math.floor(rng() * 18);
      const x0_ = Math.floor(rng() * 20);
      const len = 10 + Math.floor(rng() * 15);
      const h   = 1 + Math.floor(rng() * 2);
      for (let dx = 0; dx < len; dx++) {
        for (let y = 1; y <= h; y++) {
          this.setBlock(x0_ + dx, y, z, rng() > 0.5 ? B.RUST_METAL : B.SCRAP_PILE);
        }
      }
    }

    // Band entry stations
    this.setBlock(65, 1, 38, B.WORKBENCH);
    this.setBlock(67, 1, 38, B.FORGE);
    this.setBlock(69, 1, 38, B.SMELTER);
    this.landmarks.band1_stations = { x: 67, y: 1, z: 38 };
  }

  _band2(rng, W) {
    const z0 = 64, z1 = 95;

    // Power grid — rows of POWER_BOX at intervals
    for (let gx = 5; gx < W - 5; gx += 8) {
      const z = z0 + 4 + Math.floor(rng() * 20);
      this.setBlock(gx, 1, z, B.POWER_BOX);
      this.setBlock(gx, 2, z, B.POWER_BOX);
      // wire poles between (WALL_METAL as poles)
      if (gx + 8 < W) {
        for (let dx = 1; dx < 7; dx++) {
          this.setBlock(gx + dx, 3, z, B.CLEAN_METAL);
        }
      }
    }

    // Electronics buildings (concrete box with power boxes + crates inside)
    for (let i = 0; i < 5; i++) {
      const x = 6 + Math.floor(rng() * (W - 14));
      const z = z0 + 4 + Math.floor(rng() * (z1 - z0 - 12));
      this._buildShed(x, 0, z, 8, 4, 7, rng);
      // Fill interior with electronics
      for (let dx = 1; dx < 7; dx += 2) {
        this.setBlock(x + dx, 1, z + 2, rng() > 0.5 ? B.POWER_BOX : B.CRATE);
        this.setBlock(x + dx, 1, z + 4, rng() > 0.5 ? B.CRATE : B.POWER_BOX);
      }
    }

    // Crate warehouses (dense stacked crates)
    for (let i = 0; i < 8; i++) {
      const x = 3 + Math.floor(rng() * (W - 8));
      const z = z0 + 3 + Math.floor(rng() * (z1 - z0 - 6));
      const w = 2 + Math.floor(rng() * 3);
      const h = 1 + Math.floor(rng() * 3);
      for (let dx = 0; dx < w; dx++) {
        for (let y = 1; y <= h; y++) this.setBlock(x + dx, y, z, B.CRATE);
      }
    }

    // Loose circuit-rich scrap
    this._scatter(rng, B.CRATE, 25, 2, W - 2, z0, z1);
    this._scatter(rng, B.POWER_BOX, 20, 2, W - 2, z0, z1);
    this._scatter(rng, B.SCRAP_PILE, 20, 2, W - 2, z0, z1);

    // Main band 2 station cluster (center-ish)
    this.setBlock(60, 1, 76, B.WORKBENCH);
    this.setBlock(62, 1, 76, B.FORGE);
    this.setBlock(64, 1, 76, B.SMELTER);
    this.landmarks.band2_stations = { x: 62, y: 1, z: 76 };

    // Advanced oval TRACK circuit — 28×14 oval in Circuit City for Line Follower challenge
    // Center x=35, z=84; outer ring at ±14 x, ±7 z
    const oCx = 35, oCz = 84, oRx = 14, oRz = 7;
    for (let i = 0; i < 360; i++) {
      const rad = (i * Math.PI) / 180;
      const ox = Math.round(oCx + oRx * Math.cos(rad));
      const oz = Math.round(oCz + oRz * Math.sin(rad));
      if (ox >= 2 && ox < W - 2 && oz >= z0 && oz <= z1) {
        this.setBlock(ox, 0, oz, B.TRACK);
      }
    }

    // Circuit lab — larger building with all three stations
    this._buildShed(100, 0, 68, 10, 4, 8, rng);
    this.setBlock(102, 1, 72, B.WORKBENCH);
    this.setBlock(104, 1, 72, B.FORGE);
    this.setBlock(106, 1, 72, B.SMELTER);

    // Radio / comms tower (x=80, z=71) — tallest structure in Circuit City
    const tx = 80, tz = 71;
    for (let y = 1; y <= 9; y++) this.setBlock(tx, y, tz, B.CLEAN_METAL);
    // Cross-arms at mid and high
    for (const armY of [5, 7]) {
      for (let d = -2; d <= 2; d++) {
        if (d !== 0) {
          this.setBlock(tx+d, armY, tz, B.CLEAN_METAL);
          this.setBlock(tx,   armY, tz+d, B.CLEAN_METAL);
        }
      }
    }
    this.setBlock(tx, 9, tz, B.POWER_BOX);  // blinking "beacon" at apex
    // Diagonal support struts (base)
    for (let d = 1; d <= 2; d++) {
      this.setBlock(tx+d, d,   tz,   B.WALL_METAL);
      this.setBlock(tx-d, d,   tz,   B.WALL_METAL);
      this.setBlock(tx,   d,   tz+d, B.WALL_METAL);
      this.setBlock(tx,   d,   tz-d, B.WALL_METAL);
    }
    this.landmarks.radio_tower = { x: tx, y: 1, z: tz };

    // Oval-track grandstand — tiered bleachers north of the oval (z=77, x=21-27)
    for (let bx = 21; bx <= 27; bx++) {
      this.setBlock(bx, 1, 77, B.CONCRETE);
      this.setBlock(bx, 2, 78, B.WALL_METAL);
      this.setBlock(bx, 3, 79, B.WALL_METAL);
      this.setBlock(bx, 3, 78, B.CONCRETE);
      this.setBlock(bx, 4, 79, B.WALL_METAL);
    }
    // Grandstand pillars
    for (const bx of [21, 27]) {
      for (let y = 1; y <= 4; y++) this.setBlock(bx, y, 79, B.WALL_METAL);
    }
    // Grandstand floodlights
    this.setBlock(22, 5, 79, B.FLOODLIGHT);
    this.setBlock(26, 5, 79, B.FLOODLIGHT);

    // Rare crystal ore teaser clusters in Band 2 (hint at Band 3)
    for (const [cx, cz] of [[55, 85], [95, 72]]) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (rng() < 0.6) continue;
          this.setBlock(cx + dx, 1, cz + dz, B.CRYSTAL_ORE);
        }
      }
    }
  }

  _band3(rng, W) {
    const z0 = 96, z1 = 127;

    // Extreme chaos — everything everywhere
    for (let i = 0; i < 80; i++) {
      const x = 2 + Math.floor(rng() * (W - 4));
      const z = z0 + 1 + Math.floor(rng() * (z1 - z0 - 2));
      const ids = [B.SCRAP_PILE, B.RUST_METAL, B.CRATE, B.OIL_DRUM, B.JUNK_CAR,
                   B.CLEAN_METAL, B.POWER_BOX, B.WALL_METAL, B.WOOD_PLANK];
      if (this.getBlock(x, 1, z) === B.AIR) {
        const id = ids[Math.floor(rng() * ids.length)];
        const h  = 1 + Math.floor(rng() * 3);
        for (let y = 1; y <= h; y++) this.setBlock(x, y, z, id);
      }
    }

    // Junk car graveyard (dense)
    for (let i = 0; i < 18; i++) {
      const x = 3 + Math.floor(rng() * (W - 6));
      const z = z0 + 5 + Math.floor(rng() * (z1 - z0 - 8));
      this._junkCar(rng, x, z);
    }

    // Tall metal ruins (5–8 high)
    for (let i = 0; i < 12; i++) {
      const x = 4 + Math.floor(rng() * (W - 8));
      const z = z0 + 4 + Math.floor(rng() * (z1 - z0 - 8));
      const h = 5 + Math.floor(rng() * 4);
      const t = rng() > 0.5 ? B.WALL_METAL : B.CLEAN_METAL;
      for (let y = 1; y <= h; y++) this.setBlock(x, y, z, t);
      // Platform
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        this.setBlock(x + dx, h, z + dz, B.CONCRETE);
    }

    // Crashed plane silhouette (long junk car + wall metal arrangement)
    const px = 20, pz = z0 + 10;
    for (let dx = 0; dx < 14; dx++) this.setBlock(px + dx, 2, pz, B.JUNK_CAR); // fuselage
    for (let dx = -6; dx <= 6; dx++) this.setBlock(px + 7 + dx, 2, pz + 2, B.CLEAN_METAL); // wing
    for (let dx = -3; dx <= 3; dx++) this.setBlock(px + 7 + dx, 4, pz - 2, B.CLEAN_METAL); // tail
    for (let y = 2; y <= 5; y++) this.setBlock(px + 7, y, pz - 3, B.WALL_METAL); // tail fin

    // Mystery monument — tall pillar with scrap crown
    const mx = 100, mz = z0 + 20;
    for (let y = 1; y <= 8; y++) this.setBlock(mx, y, mz, B.CLEAN_METAL);
    for (let d = -2; d <= 2; d++) {
      this.setBlock(mx + d, 8, mz, B.SCRAP_PILE);
      this.setBlock(mx, 8, mz + d, B.SCRAP_PILE);
    }

    // THE FINAL WORKSHOP — large shed with all stations + extras
    this._buildShed(50, 0, z0 + 20, 12, 5, 10, rng);
    this.setBlock(52, 1, z0 + 25, B.WORKBENCH);
    this.setBlock(54, 1, z0 + 25, B.FORGE);
    this.setBlock(56, 1, z0 + 25, B.SMELTER);
    this.setBlock(58, 1, z0 + 25, B.WORKBENCH);
    this.setBlock(52, 1, z0 + 27, B.CRATE);
    this.setBlock(54, 1, z0 + 27, B.POWER_BOX);
    this.setBlock(56, 1, z0 + 27, B.OIL_DRUM);
    this.landmarks.final_workshop = { x: 56, y: 1, z: z0 + 25 };

    // Sign: stacked blocks forming 'END' on the far wall
    this._scatter(rng, B.CRATE, 20, 2, W - 2, z0, z1);
    this._scatter(rng, B.POWER_BOX, 15, 2, W - 2, z0, z1);

    // Crystal ore clusters — glowing veins in the deep yard (Band 3 only)
    const crystalSeeds = [
      [15, z0+8], [35, z0+14], [60, z0+6], [88, z0+16], [112, z0+11], [45, z0+22], [75, z0+28],
    ];
    for (const [cx, cz] of crystalSeeds) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (rng() < 0.45) continue;
          const y = 1 + Math.floor(rng() * 2);
          this.setBlock(cx + dx, y, cz + dz, B.CRYSTAL_ORE);
        }
      }
    }
    this.landmarks.crystal_cave = { x: crystalSeeds[0][0], y: 1, z: crystalSeeds[0][1] };

    // Scattered scrap cannons as environmental props
    this._scatter(rng, B.SCRAP_CANNON, 5, 2, W - 2, z0, z1);

    // Robot graveyard — 8 decommissioned bots in a 4×2 grid (x=72-87, z=100-112)
    for (let i = 0; i < 8; i++) {
      const gx = 72 + (i % 4) * 4;
      const gz = z0 + 4 + Math.floor(i / 4) * 7;
      const lean = (i % 3 === 0) ? 1 : 0; // some are tilted (collapsed)
      // body
      for (let y = 1; y <= 2; y++) this.setBlock(gx, y, gz, B.RUST_METAL);
      // head (shifted if leaning)
      this.setBlock(gx + lean, 3, gz, B.SCRAP_PILE);
      // arms
      this.setBlock(gx-1, 2, gz, B.RUST_METAL);
      this.setBlock(gx+1, 2, gz, B.RUST_METAL);
      // legs
      this.setBlock(gx, 1, gz-1, B.RUST_METAL);
      this.setBlock(gx, 1, gz+1, B.RUST_METAL);
    }
    this.landmarks.robot_graveyard = { x: 79, y: 1, z: z0 + 7 };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  _scrapCluster(rng, cx, cz, maxH, radius) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (rng() < 0.4) continue;
        const h = 1 + Math.floor(rng() * maxH);
        for (let y = 1; y <= h; y++) {
          const id = rng() < 0.6 ? B.SCRAP_PILE : rng() < 0.5 ? B.RUST_METAL : B.CLEAN_METAL;
          this.setBlock(cx + dx, y, cz + dz, id);
        }
      }
    }
  }

  _junkCar(rng, cx, cz) {
    for (let dz = 0; dz < 2; dz++) {
      for (let dx = 0; dx < 3; dx++) {
        this.setBlock(cx + dx, 1, cz + dz, B.JUNK_CAR);
        if (rng() < 0.5) this.setBlock(cx + dx, 2, cz + dz, B.JUNK_CAR);
      }
    }
  }

  _scatter(rng, id, count, x0, x1, z0, z1) {
    for (let i = 0; i < count; i++) {
      const x = x0 + Math.floor(rng() * (x1 - x0));
      const z = z0 + Math.floor(rng() * (z1 - z0));
      if (this.getBlock(x, 1, z) === B.AIR) this.setBlock(x, 1, z, id);
    }
  }

  _buildShed(x0, y0, z0, W, H, D, rng) {
    for (let y = y0 + 1; y < y0 + H; y++) {
      for (let dz = 0; dz < D; dz++) {
        this.setBlock(x0, y, z0 + dz, B.WALL_METAL);
        this.setBlock(x0 + W - 1, y, z0 + dz, B.WALL_METAL);
      }
      for (let dx = 1; dx < W - 1; dx++) {
        this.setBlock(x0 + dx, y, z0, B.WALL_METAL);
        this.setBlock(x0 + dx, y, z0 + D - 1, B.WALL_METAL);
      }
    }
    for (let dz = 0; dz < D; dz++)
      for (let dx = 0; dx < W; dx++)
        this.setBlock(x0 + dx, y0 + H, z0 + dz, B.ROOF_METAL);
    for (let dz = 1; dz < D - 1; dz++)
      for (let dx = 1; dx < W - 1; dx++)
        this.setBlock(x0 + dx, y0, z0 + dz, B.CONCRETE);
  }

  _bandOf(z) {
    if (z < 32)  return 0;
    if (z < 64)  return 1;
    if (z < 96)  return 2;
    return 3;
  }

  // ── Public API ────────────────────────────────────────────────────────

  mine(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return null;
    this.setBlock(x, y, z, B.AIR);
    this._minedBlocks.push({ x, y, z });
    return id;
  }

  place(x, y, z, id) {
    if (this.getBlock(x, y, z) !== B.AIR) return false;
    this.setBlock(x, y, z, id);
    this._placedBlocks.push({ x, y, z, id });
    return true;
  }

  getNearbyInteractives(cx, cy, cz, radius = 3) {
    const results = [];
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy, z = Math.floor(cz) + dz;
      const id  = this.getBlock(x, y, z);
      const def = BLOCK_DEF[id];
      if (def?.interactive && Math.sqrt(dx*dx + dy*dy + dz*dz) <= radius)
        results.push({ x, y, z, id, station: def.station });
    }
    return results;
  }

  isSolidAt(x, y, z) {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  getBandName(z) { return BANDS[this._bandOf(z)]?.name ?? 'The Yard'; }
  getBandIndex(z) { return this._bandOf(z); }
}
