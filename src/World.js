import { B, BLOCK_DEF, isSolid } from './data/blocks.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// Zone ids for biome-flavored generation
const ZONE = {
  METALWORKS:   0,  // SW  — rust, scrap, oil drums (player starts here)
  AUTOMOTIVE:   1,  // SE  — junk cars, rubber
  ELECTRONICS:  2,  // NE  — power boxes, crates, circuit-rich
  MYSTERY:      3,  // NW  — mixed chaos, hidden finds
};

function getZone(x, z, W, D) {
  const ex = x < W / 2;
  const ez = z < D / 2;
  if (!ex && ez)  return ZONE.METALWORKS;
  if (!ex && !ez) return ZONE.AUTOMOTIVE;
  if (ex && !ez)  return ZONE.ELECTRONICS;
  return ZONE.MYSTERY;
}

export class World {
  constructor(width = 64, depth = 64, height = 8) {
    this.width  = width;
    this.depth  = depth;
    this.height = height;
    this.blocks = new Uint8Array(width * depth * height);
    this._listeners = [];
    // Map of notable locations for quests
    this.landmarks = {};
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
  _emit(event, data) { this._listeners.filter(l => l.event === event).forEach(l => l.fn(data)); }

  generate(seed = 42) {
    const rng = lcg(seed);
    const W = this.width, D = this.depth;

    // ── Ground layer (zone-flavored) ─────────────────────────────────────
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const r = rng();
        const zone = getZone(x, z, W, D);
        let groundId;
        if (zone === ZONE.METALWORKS)  groundId = r < 0.5 ? B.CONCRETE : r < 0.8 ? B.GRAVEL : B.DIRT;
        else if (zone === ZONE.AUTOMOTIVE) groundId = r < 0.5 ? B.DIRT : r < 0.8 ? B.GRAVEL : B.CONCRETE;
        else if (zone === ZONE.ELECTRONICS) groundId = r < 0.6 ? B.CONCRETE : B.GRAVEL;
        else groundId = r < 0.4 ? B.DIRT : r < 0.7 ? B.CONCRETE : B.GRAVEL;
        this.blocks[this._idx(x, 0, z)] = groundId;
      }
    }

    // ── Zone-specific surface features ───────────────────────────────────
    // METALWORKS (x>=32, z<32) — dense scrap piles, rust, oil drums
    this._zoneMetal(rng, 33, 1, 33, 31);

    // AUTOMOTIVE (x>=32, z>=32) — junk cars, rubber, scrap
    this._zoneAuto(rng, 33, 33, 33, 31);

    // ELECTRONICS (x<32, z>=32) — power boxes, crates
    this._zoneElec(rng, 1, 33, 31, 31);

    // MYSTERY (x<32, z<32) — chaos, hidden structures
    this._zoneMystery(rng, 1, 1, 31, 31);

    // ── Fixed structures ──────────────────────────────────────────────────
    // Shed at (20, 0, 20) in Mystery zone
    this._buildShed(20, 0, 20, 7, 4, 5);
    this.landmarks.shed = { x: 23, y: 1, z: 22 };

    // Station row visible from spawn
    this.setBlock(12, 1, 8, B.WORKBENCH);
    this.setBlock(14, 1, 8, B.FORGE);
    this.setBlock(16, 1, 8, B.SMELTER);
    this.landmarks.workbench = { x: 12, y: 1, z: 8 };
    this.landmarks.forge     = { x: 14, y: 1, z: 8 };
    this.landmarks.smelter   = { x: 16, y: 1, z: 8 };

    // Second station cluster deeper in the metalworks zone
    this.setBlock(40, 1, 10, B.WORKBENCH);
    this.setBlock(42, 1, 10, B.FORGE);

    // ── Path from spawn to stations ───────────────────────────────────────
    for (let z = 5; z <= 8; z++) this.setBlock(10, 0, z, B.CONCRETE);
    for (let x = 10; x <= 17; x++) this.setBlock(x, 0, 8, B.CONCRETE);
  }

  _zoneMetal(rng, x0, z0, W, D) {
    // Scrap pile clusters
    for (let i = 0; i < 14; i++) {
      const cx = x0 + Math.floor(rng() * W);
      const cz = z0 + Math.floor(rng() * D);
      const h  = Math.floor(rng() * 3) + 1;
      const sz = Math.floor(rng() * 2) + 1;
      for (let dz = -sz; dz <= sz; dz++) {
        for (let dx = -sz; dx <= sz; dx++) {
          if (rng() < 0.35) continue;
          const bh = Math.floor(rng() * h) + 1;
          for (let y = 1; y <= bh; y++) {
            const id = rng() < 0.55 ? B.SCRAP_PILE : rng() < 0.5 ? B.RUST_METAL : B.CLEAN_METAL;
            this.setBlock(cx + dx, y, cz + dz, id);
          }
        }
      }
    }
    // Oil drums
    for (let i = 0; i < 12; i++) {
      const x = x0 + Math.floor(rng() * W);
      const z = z0 + Math.floor(rng() * D);
      if (this.getBlock(x, 1, z) === B.AIR) {
        this.setBlock(x, 1, z, B.OIL_DRUM);
        if (rng() < 0.5) this.setBlock(x, 2, z, B.OIL_DRUM);
      }
    }
    // Rust metal walls (collapsed structures)
    for (let i = 0; i < 3; i++) {
      const x = x0 + Math.floor(rng() * (W - 6));
      const z = z0 + Math.floor(rng() * (D - 6));
      for (let dx = 0; dx < 4; dx++) {
        this.setBlock(x + dx, 1, z, B.RUST_METAL);
        if (rng() < 0.6) this.setBlock(x + dx, 2, z, B.RUST_METAL);
      }
    }
  }

  _zoneAuto(rng, x0, z0, W, D) {
    // Junk cars in rows
    for (let i = 0; i < 8; i++) {
      const cx = x0 + Math.floor(rng() * (W - 4));
      const cz = z0 + Math.floor(rng() * (D - 3));
      for (let dz = 0; dz < 2; dz++) {
        for (let dx = 0; dx < 3; dx++) {
          this.setBlock(cx + dx, 1, cz + dz, B.JUNK_CAR);
          if (rng() < 0.5) this.setBlock(cx + dx, 2, cz + dz, B.JUNK_CAR);
        }
      }
    }
    // Scrap piles between cars
    for (let i = 0; i < 8; i++) {
      const x = x0 + Math.floor(rng() * W);
      const z = z0 + Math.floor(rng() * D);
      if (this.getBlock(x, 1, z) === B.AIR) {
        const h = Math.floor(rng() * 2) + 1;
        for (let y = 1; y <= h; y++) this.setBlock(x, y, z, B.SCRAP_PILE);
      }
    }
    // Rubber-related: isolated scrap
    for (let i = 0; i < 6; i++) {
      const x = x0 + Math.floor(rng() * W);
      const z = z0 + Math.floor(rng() * D);
      if (this.getBlock(x, 1, z) === B.AIR) this.setBlock(x, 1, z, B.SCRAP_PILE);
    }
  }

  _zoneElec(rng, x0, z0, W, D) {
    // Power boxes
    for (let i = 0; i < 10; i++) {
      const x = x0 + Math.floor(rng() * W);
      const z = z0 + Math.floor(rng() * D);
      if (this.getBlock(x, 1, z) === B.AIR) this.setBlock(x, 1, z, B.POWER_BOX);
    }
    // Crates — circuit-rich zone
    for (let i = 0; i < 12; i++) {
      const x = x0 + Math.floor(rng() * W);
      const z = z0 + Math.floor(rng() * D);
      if (this.getBlock(x, 1, z) === B.AIR) {
        this.setBlock(x, 1, z, B.CRATE);
        if (rng() < 0.3) this.setBlock(x, 2, z, B.CRATE);
      }
    }
    // A small electronics building
    this._buildShed(x0 + 10, 0, z0 + 10, 5, 3, 4);
    // Power boxes inside
    this.setBlock(x0 + 12, 1, z0 + 12, B.POWER_BOX);
    this.setBlock(x0 + 13, 1, z0 + 12, B.CRATE);
  }

  _zoneMystery(rng, x0, z0, W, D) {
    // Random everything
    for (let i = 0; i < 30; i++) {
      const x = x0 + Math.floor(rng() * W);
      const z = z0 + Math.floor(rng() * D);
      if (this.getBlock(x, 1, z) !== B.AIR) continue;
      const ids = [B.SCRAP_PILE, B.CRATE, B.OIL_DRUM, B.POWER_BOX, B.JUNK_CAR, B.RUST_METAL, B.WOOD_PLANK];
      this.setBlock(x, 1, z, ids[Math.floor(rng() * ids.length)]);
    }
    // Wood planks scattered (for early recipe: hammer)
    for (let i = 0; i < 8; i++) {
      const x = x0 + Math.floor(rng() * W);
      const z = z0 + Math.floor(rng() * D);
      if (this.getBlock(x, 1, z) === B.AIR) this.setBlock(x, 1, z, B.WOOD_PLANK);
    }
  }

  _buildShed(x0, y0, z0, W, H, D) {
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
    for (let dz = 0; dz < D; dz++) {
      for (let dx = 0; dx < W; dx++) {
        this.setBlock(x0 + dx, y0 + H, z0 + dz, B.ROOF_METAL);
      }
    }
    for (let dz = 1; dz < D - 1; dz++) {
      for (let dx = 1; dx < W - 1; dx++) {
        this.setBlock(x0 + dx, y0, z0 + dz, B.CONCRETE);
      }
    }
  }

  mine(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return null;
    this.setBlock(x, y, z, B.AIR);
    return id;
  }

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
          if (def?.interactive && Math.sqrt(dx*dx + dy*dy + dz*dz) <= radius) {
            results.push({ x, y, z, id, station: def.station });
          }
        }
      }
    }
    return results;
  }

  isSolidAt(x, y, z) {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  /** Zone label for the HUD */
  getZoneLabel(x, z) {
    const labels = ['Metal Works', 'Auto Salvage', 'Electronics Alley', 'Mystery Zone'];
    return labels[getZone(x, z, this.width, this.depth)] ?? 'The Yard';
  }
}
