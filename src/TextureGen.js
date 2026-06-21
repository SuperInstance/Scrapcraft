/**
 * Generates pixel-art (16×16, NearestFilter) canvas textures for each block type.
 * Returns THREE.CanvasTexture instances that look sharp and chunky at all distances.
 */
import * as THREE from 'three';
import { B } from './data/blocks.js';

const S = 16; // canvas size

function tex(drawFn) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  drawFn(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) | 0; return (s >>> 0) / 0xffffffff; };
}

function noise(ctx, r, seed, alpha = 0.18) {
  const rand = rng(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (rand() > 0.5) continue;
      const v = Math.floor(rand() * 30 - 15);
      const [cr, cg, cb] = r(x, y);
      ctx.fillStyle = `rgba(${cr + v},${cg + v},${cb + v},${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// ── Block textures ────────────────────────────────────────────────────────

const GEN = {
  [B.DIRT]: () => tex(ctx => {
    ctx.fillStyle = '#5C3D1A'; ctx.fillRect(0, 0, S, S);
    const r = rng(1);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(r() * S), y = Math.floor(r() * S);
      ctx.fillStyle = r() > 0.5 ? '#7A5230' : '#3D2A0F';
      ctx.fillRect(x, y, 2, 2);
    }
  }),

  [B.GRAVEL]: () => tex(ctx => {
    ctx.fillStyle = '#6B6B6B'; ctx.fillRect(0, 0, S, S);
    const r = rng(2);
    for (let i = 0; i < 50; i++) {
      const x = Math.floor(r() * S), y = Math.floor(r() * S);
      const sz = r() > 0.7 ? 3 : 1;
      const v = Math.floor(r() * 50 - 25);
      const c = 107 + v;
      ctx.fillStyle = `rgb(${c},${c},${c})`;
      ctx.fillRect(x, y, sz, sz);
    }
  }),

  [B.CONCRETE]: () => tex(ctx => {
    ctx.fillStyle = '#888880'; ctx.fillRect(0, 0, S, S);
    const r = rng(3);
    // Cracks
    ctx.strokeStyle = '#555550'; ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.floor(r() * S), Math.floor(r() * S));
      ctx.lineTo(Math.floor(r() * S), Math.floor(r() * S));
      ctx.stroke();
    }
    noise(ctx, () => [136, 136, 128], 31);
  }),

  [B.RUST_METAL]: () => tex(ctx => {
    ctx.fillStyle = '#6B2A00'; ctx.fillRect(0, 0, S, S);
    const r = rng(4);
    // Rust patches
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(r() * S), y = Math.floor(r() * S);
      const colors = ['#8B3A00', '#C05000', '#5C2600', '#A04500'];
      ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      ctx.fillRect(x, y, Math.floor(r() * 3) + 1, Math.floor(r() * 3) + 1);
    }
    // Metal sheen streak
    for (let x = 0; x < S; x++) {
      if (r() > 0.9) { ctx.fillStyle = 'rgba(200,180,160,0.3)'; ctx.fillRect(x, 6, 1, 1); }
    }
  }),

  [B.CLEAN_METAL]: () => tex(ctx => {
    ctx.fillStyle = '#9DAAB5'; ctx.fillRect(0, 0, S, S);
    // Horizontal shine bands
    for (let y = 0; y < S; y += 4) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, y, S, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, y + 2, S, 2);
    }
    // Rivets
    const rv = [2, S - 3];
    for (const rx of rv) for (const ry of rv) {
      ctx.fillStyle = '#707A82'; ctx.fillRect(rx, ry, 2, 2);
      ctx.fillStyle = '#D0D8E0'; ctx.fillRect(rx, ry, 1, 1);
    }
  }),

  [B.WOOD_PLANK]: () => tex(ctx => {
    ctx.fillStyle = '#7A5230'; ctx.fillRect(0, 0, S, S);
    // Grain lines
    for (let y = 0; y < S; y++) {
      if (y % 5 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, y, S, 1); }
      if (y % 5 === 1) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, y, S, 1); }
    }
    noise(ctx, () => [122, 82, 48], 5, 0.25);
  }),

  [B.SCRAP_PILE]: () => tex(ctx => {
    ctx.fillStyle = '#3A3A32'; ctx.fillRect(0, 0, S, S);
    const r = rng(6);
    const bits = ['#888880', '#6B2A00', '#C05000', '#9DAAB5', '#D4A017', '#555550'];
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(r() * S), y = Math.floor(r() * S);
      ctx.fillStyle = bits[Math.floor(r() * bits.length)];
      ctx.fillRect(x, y, r() > 0.7 ? 2 : 1, 1);
    }
  }),

  [B.WORKBENCH]: () => tex(ctx => {
    // Surface: warm scratched wood
    ctx.fillStyle = '#9B7A3A'; ctx.fillRect(0, 0, S, S);
    // Scratch marks
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(3, 5); ctx.lineTo(13, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, 10); ctx.lineTo(14, 12); ctx.stroke();
    // Yellow trim border
    ctx.strokeStyle = '#D4A017'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
    // Tool silhouette - wrench outline
    ctx.fillStyle = 'rgba(80,50,10,0.6)';
    ctx.fillRect(7, 3, 2, 10);
    ctx.fillRect(5, 3, 6, 2);
  }),

  [B.FORGE]: () => tex(ctx => {
    ctx.fillStyle = '#1A1A1A'; ctx.fillRect(0, 0, S, S);
    // Glowing orange seams
    const r = rng(8);
    for (let i = 0; i < 8; i++) {
      const y = Math.floor(r() * S);
      const grd = ctx.createLinearGradient(0, y, S, y);
      grd.addColorStop(0, 'rgba(255,68,0,0)');
      grd.addColorStop(0.5, `rgba(255,${Math.floor(r() * 100 + 68)},0,0.8)`);
      grd.addColorStop(1, 'rgba(255,68,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, y, S, 1);
    }
    // Ember dots
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = r() > 0.5 ? '#FF4400' : '#FF8800';
      ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
    }
  }),

  [B.SMELTER]: () => tex(ctx => {
    ctx.fillStyle = '#2A2A18'; ctx.fillRect(0, 0, S, S);
    // Vent slits
    for (let y = 2; y < S; y += 4) {
      const grd = ctx.createLinearGradient(0, 0, S, 0);
      grd.addColorStop(0, 'rgba(255,136,0,0)');
      grd.addColorStop(0.5, 'rgba(255,136,0,0.9)');
      grd.addColorStop(1, 'rgba(255,136,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(2, y, S - 4, 2);
    }
    noise(ctx, () => [42, 42, 24], 10, 0.15);
  }),

  [B.OIL_DRUM]: () => tex(ctx => {
    ctx.fillStyle = '#1A1A8A'; ctx.fillRect(0, 0, S, S);
    // Diagonal hazard stripes
    ctx.strokeStyle = '#FFCC00'; ctx.lineWidth = 3;
    for (let i = -S; i < S * 2; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
    }
    ctx.fillStyle = '#1A1A8A';
    ctx.fillRect(0, 0, S, 2); ctx.fillRect(0, S - 2, S, 2);
    // Band rings
    ctx.fillStyle = 'rgba(100,100,200,0.5)';
    ctx.fillRect(0, 4, S, 2); ctx.fillRect(0, S - 6, S, 2);
  }),

  [B.CRATE]: () => tex(ctx => {
    ctx.fillStyle = '#C09050'; ctx.fillRect(0, 0, S, S);
    // Border
    ctx.fillStyle = '#7A5030';
    ctx.fillRect(0, 0, S, 2); ctx.fillRect(0, S - 2, S, 2);
    ctx.fillRect(0, 0, 2, S); ctx.fillRect(S - 2, 0, 2, S);
    // X cross
    ctx.strokeStyle = '#7A5030'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(S - 2, S - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S - 2, 2); ctx.lineTo(2, S - 2); ctx.stroke();
    // Metal corners
    ctx.fillStyle = '#9DAAB5';
    for (const [cx, cy] of [[0,0],[S-3,0],[0,S-3],[S-3,S-3]]) ctx.fillRect(cx, cy, 3, 3);
  }),

  [B.WALL_METAL]: () => tex(ctx => {
    ctx.fillStyle = '#666868'; ctx.fillRect(0, 0, S, S);
    // Corrugation
    for (let x = 0; x < S; x += 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, 0, 1, S);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x + 1, 0, 1, S);
    }
    // Rivets
    const r = rng(14);
    for (let y = 4; y < S; y += 8) {
      ctx.fillStyle = '#4A5050';
      ctx.fillRect(1, y, 2, 2); ctx.fillRect(S - 3, y, 2, 2);
    }
  }),

  [B.ROOF_METAL]: () => tex(ctx => {
    ctx.fillStyle = '#4A5848'; ctx.fillRect(0, 0, S, S);
    // Diagonal corrugation
    for (let i = 0; i < S * 2; i += 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(i - S, 0, 1, S);
    }
    // Rust patches
    const r = rng(15);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = 'rgba(139,58,0,0.4)';
      ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), 2, 2);
    }
  }),

  [B.JUNK_CAR]: () => tex(ctx => {
    ctx.fillStyle = '#2E2E1E'; ctx.fillRect(0, 0, S, S);
    const r = rng(16);
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = r() > 0.5 ? '#3A3A2A' : '#1E1E10';
      ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), Math.floor(r() * 4) + 1, Math.floor(r() * 3) + 1);
    }
    // Broken glass shards
    ctx.fillStyle = 'rgba(180,220,255,0.4)';
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
  }),

  [B.POWER_BOX]: () => tex(ctx => {
    ctx.fillStyle = '#DDCC00'; ctx.fillRect(0, 0, S, S);
    // Black diagonal hazard stripes
    ctx.fillStyle = '#111111';
    for (let i = -S; i < S * 2; i += 5) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 4, 0);
      ctx.lineTo(i + 4 + S, S); ctx.lineTo(i + S, S); ctx.closePath();
      ctx.fill();
    }
    // Lightning bolt
    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    ctx.moveTo(9, 3); ctx.lineTo(6, 9); ctx.lineTo(9, 9);
    ctx.lineTo(7, 13); ctx.lineTo(11, 7); ctx.lineTo(8, 7);
    ctx.closePath(); ctx.fill();
  }),

  [19]: () => tex(ctx => {  // CRYSTAL_ORE
    // Deep-space purple base
    ctx.fillStyle = '#1a0530'; ctx.fillRect(0, 0, S, S);
    const r = rng(19);
    const cols = ['#cc88ff', '#9933ff', '#ff66ff', '#bb44ee', '#dd99ff'];

    // Large angular crystal shards — cross + vertical spikes
    for (let i = 0; i < 7; i++) {
      const cx = Math.floor(r() * (S - 2)) + 1;
      const cy = Math.floor(r() * (S - 3)) + 1;
      const col = cols[Math.floor(r() * cols.length)];
      ctx.fillStyle = col;
      ctx.fillRect(cx, cy, 1, 3);      // vertical
      ctx.fillRect(cx - 1, cy + 1, 3, 1); // horizontal
    }

    // Bright specular highlights (white pixel corners of facets)
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(r() * S);
      const y = Math.floor(r() * S);
      ctx.fillStyle = r() > 0.6 ? '#ffffff' : cols[Math.floor(r() * cols.length)];
      ctx.fillRect(x, y, 1, 1);
    }

    // Dark crevasses between crystals
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), r() > 0.5 ? 2 : 1, 1);
    }

    noise(ctx, () => [80, 10, 120], 191, 0.2);
  }),

  [20]: () => tex(ctx => {  // SCRAP_CANNON
    // Dark gunmetal base with brown tint
    ctx.fillStyle = '#1c1008'; ctx.fillRect(0, 0, S, S);
    const r = rng(20);

    // Coiled spring bands — alternating light/dark horizontal strips
    for (let y = 0; y < S; y += 3) {
      ctx.fillStyle = y % 6 === 0 ? '#6a5030' : '#3a2412';
      ctx.fillRect(2, y, S - 4, 1);
    }

    // Barrel ring (square inset, dark hollow)
    ctx.fillStyle = '#0c0804';
    ctx.fillRect(5, 5, 6, 6);
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1;
    ctx.strokeRect(5, 5, 6, 6);

    // Barrel mouth orange glow
    const grd = ctx.createRadialGradient(8, 8, 0, 8, 8, 5);
    grd.addColorStop(0, 'rgba(220,80,0,0.55)');
    grd.addColorStop(1, 'rgba(220,80,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(3, 3, 10, 10);

    // Rust accent patches
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(140,60,0,0.5)' : 'rgba(90,40,0,0.4)';
      ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), Math.floor(r() * 2) + 1, 1);
    }

    // Rivets
    ctx.fillStyle = '#9a7850';
    for (const [rx, ry] of [[1,1],[S-3,1],[1,S-3],[S-3,S-3]]) {
      ctx.fillRect(rx, ry, 2, 2);
      ctx.fillStyle = '#ddc090'; ctx.fillRect(rx, ry, 1, 1);
      ctx.fillStyle = '#9a7850';
    }
  }),
};

/** Build a Map<blockId, THREE.Texture> for all defined block types */
export function buildTextures() {
  const map = new Map();
  for (const [id, fn] of Object.entries(GEN)) {
    map.set(Number(id), fn());
  }
  return map;
}
