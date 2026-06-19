import { B, BLOCK_DEF, isSolid } from './data/blocks.js';

// Simple seeded LCG for deterministic world gen
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

export class World {
  constructor(width = 64, depth = 64, height = 8) {
    this.width  = width;
    this.depth  = depth;
    this.height = height;
    this.blocks = new Uint8Array(width * depth * height);
    this._listeners = [];
  }

  _idx(x, y, z) {
    return x + z * this.width + y * this.width * this.depth;
  }

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
  _emit(event, data) { this._listeners.filter(l => l.event === event).forEach(l => l.fn(data)); }

  generate(seed = 42) {
    const rng = lcg(seed);
    const W = this.width, D = this.depth;

    // Ground layer
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const r = rng();
        const groundId = r < 0.55 ? B.DIRT : r < 0.85 ? B.CONCRETE : B.GRAVEL;
        this.blocks[this._idx(x, 0, z)] = groundId;
      }
    }

    // Scattered scrap piles (3x3 clusters of height 1-3)
    const numPiles = 18;
    for (let i = 0; i < numPiles; i++) {
      const cx = Math.floor(rng() * (W - 6)) + 3;
      const cz = Math.floor(rng() * (D - 6)) + 3;
      const h  = Math.floor(rng() * 3) + 1;
      const sz = Math.floor(rng() * 2) + 2;
      for (let dz = -sz; dz <= sz; dz++) {
        for (let dx = -sz; dx <= sz; dx++) {
          if (rng() < 0.4) continue;
          const bx = cx + dx, bz = cz + dz;
          const bh = Math.floor(rng() * h) + 1;
          for (let y = 1; y <= bh; y++) {
            const id = rng() < 0.6 ? B.SCRAP_PILE : rng() < 0.5 ? B.RUST_METAL : B.CLEAN_METAL;
            this.setBlock(bx, y, bz, id);
          }
        }
      }
    }

    // Junk cars
    const numCars = 8;
    for (let i = 0; i < numCars; i++) {
      const cx = Math.floor(rng() * (W - 10)) + 5;
      const cz = Math.floor(rng() * (D - 10)) + 5;
      // 3x2 footprint, 2 high
      for (let dz = 0; dz < 2; dz++) {
        for (let dx = 0; dx < 3; dx++) {
          this.setBlock(cx + dx, 1, cz + dz, B.JUNK_CAR);
          if (rng() < 0.5) this.setBlock(cx + dx, 2, cz + dz, B.JUNK_CAR);
        }
      }
    }

    // Oil drums (scattered)
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rng() * (W - 4)) + 2;
      const z = Math.floor(rng() * (D - 4)) + 2;
      if (this.getBlock(x, 1, z) === B.AIR) {
        this.setBlock(x, 1, z, B.OIL_DRUM);
        if (rng() < 0.4) this.setBlock(x, 2, z, B.OIL_DRUM);
      }
    }

    // Crates
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rng() * (W - 4)) + 2;
      const z = Math.floor(rng() * (D - 4)) + 2;
      if (this.getBlock(x, 1, z) === B.AIR) this.setBlock(x, 1, z, B.CRATE);
    }

    // Power boxes
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rng() * (W - 4)) + 2;
      const z = Math.floor(rng() * (D - 4)) + 2;
      if (this.getBlock(x, 1, z) === B.AIR) this.setBlock(x, 1, z, B.POWER_BOX);
    }

    // Shed structure at (20, 0, 20) – metal walls + roof
    this._buildShed(20, 0, 20, 7, 4, 5, rng);

    // Station: Workbench at (12, 1, 8)
    this.setBlock(12, 1, 8, B.WORKBENCH);

    // Station: Forge at (14, 1, 8)
    this.setBlock(14, 1, 8, B.FORGE);

    // Station: Smelter at (16, 1, 8)
    this.setBlock(16, 1, 8, B.SMELTER);
  }

  _buildShed(x0, y0, z0, W, H, D, rng) {
    // Walls
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
    // Roof
    for (let dz = 0; dz < D; dz++) {
      for (let dx = 0; dx < W; dx++) {
        this.setBlock(x0 + dx, y0 + H, z0 + dz, B.ROOF_METAL);
      }
    }
    // Floor (concrete inside shed)
    for (let dz = 1; dz < D - 1; dz++) {
      for (let dx = 1; dx < W - 1; dx++) {
        this.setBlock(x0 + dx, y0, z0 + dz, B.CONCRETE);
      }
    }
  }

  /** Mine a block. Returns the block id that was there (for loot), or null. */
  mine(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return null;
    this.setBlock(x, y, z, B.AIR);
    return id;
  }

  /** Get all interactive block positions within radius of (cx, cy, cz) */
  getNearbyInteractives(cx, cy, cz, radius = 3) {
    const results = [];
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.floor(cx) + dx;
          const y = Math.floor(cy) + dy;
          const z = Math.floor(cz) + dz;
          const id = this.getBlock(x, y, z);
          const def = BLOCK_DEF[id];
          if (def?.interactive) {
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist <= radius) results.push({ x, y, z, id, station: def.station });
          }
        }
      }
    }
    return results;
  }

  /** True if position is standing on solid ground (feet at y, body at y+1) */
  isSolidAt(x, y, z) {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }
}
