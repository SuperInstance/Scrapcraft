/**
 * Perf guards — static checks that keep the hot paths allocation-free.
 *
 * These are deliberately source-level (regex over the actual files): you
 * can't profile allocations headlessly, but you CAN pin the patterns that
 * caused them. If someone reintroduces a per-frame `.filter().sort()` or a
 * fresh Vector3 in tick(), this suite fails before it ships.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function src(relPath) {
  return readFileSync(join(SRC, relPath), 'utf8');
}

/** Pull a class-method body out of source text (best-effort brace match). */
function methodBody(fileText, name) {
  const start = fileText.indexOf(`  ${name}(`);
  if (start === -1) return null;
  const open = fileText.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < fileText.length; i++) {
    if (fileText[i] === '{') depth++;
    else if (fileText[i] === '}') {
      depth--;
      if (depth === 0) return fileText.slice(start, i + 1);
    }
  }
  return null;
}

function assert(cond, msg, pass, fail) {
  if (cond) { pass(msg); } else { fail(msg); }
}

export function runPerfGuardTests(pass, fail) {
  // ── Renderer.getTargetBlock: one raycast's worth of scratch, no allocs ──
  {
    const r = src('Renderer.js');
    const gtb = methodBody(r, 'getTargetBlock');
    assert(!!gtb, 'perf: Renderer.getTargetBlock exists', pass, fail);
    assert(gtb.includes('this._meshList'), 'perf: getTargetBlock uses cached _meshList (no per-call array)', pass, fail);
    assert(gtb.includes('this._centerVec'), 'perf: getTargetBlock reuses _centerVec (no Vector2 alloc)', pass, fail);
    assert(!gtb.includes('.values()') && !gtb.includes('.map('), 'perf: getTargetBlock has no spread/map allocations', pass, fail);
    assert(!gtb.includes('.clone()'), 'perf: getTargetBlock has no .clone() allocations', pass, fail);
    assert(!gtb.includes('normal.multiplyScalar'), 'perf: getTargetBlock never mutates hit.face.normal in place', pass, fail);

    // ── updateFloodlights: alloc-free N-closest ──
    const uf = methodBody(r, 'updateFloodlights');
    assert(!!uf, 'perf: Renderer.updateFloodlights exists', pass, fail);
    assert(!uf.includes('.filter(') && !uf.includes('.sort(') && !uf.includes('.slice('), 'perf: updateFloodlights has no filter/sort/slice allocations', pass, fail);

    // ── applyBlockChange: incremental path wired, no per-change Matrix4 ──
    const abc = methodBody(r, 'applyBlockChange');
    assert(!!abc, 'perf: Renderer.applyBlockChange exists', pass, fail);
    assert(abc.includes('this._swapMatrix'), 'perf: applyBlockChange reuses _swapMatrix (no Matrix4 per removal)', pass, fail);
    assert(r.includes('this._ledger.add(id, x, y, z)'), 'perf: rebuildMeshes seeds the ledger during the fill pass', pass, fail);
  }

  // ── ParticleSystem: presets hoisted, no splice churn ──
  {
    const p = src('ParticleSystem.js');
    const burst = methodBody(p, 'burst');
    assert(!!burst, 'perf: ParticleSystem.burst exists', pass, fail);
    assert(!/\b(presets|PRESETS)\s*=\s*{/.test(burst), 'perf: burst() does not rebuild the presets object per call', pass, fail);
    const tick = methodBody(p, 'tick');
    assert(!tick.includes('.splice('), 'perf: particle tick uses swap-remove, not splice', pass, fail);
  }

  // ── Player.tick: no per-frame vector/euler allocations ──
  {
    const pl = src('Player.js');
    const tick = methodBody(pl, 'tick');
    assert(!!tick, 'perf: Player.tick exists', pass, fail);
    // Strip the one-time lazy-cache pattern (`this._x || (this._x = new ...)`) —
    // what's left must contain no fresh THREE objects per frame.
    const stripped = tick.replace(/\(\s*this\._\w+\s*=\s*new THREE\.\w+\([^)]*\)\s*\)/g, '');
    assert(!/new THREE\.(Vector3|Euler|Quaternion)\(/.test(stripped), 'perf: Player.tick allocates no THREE objects per frame', pass, fail);
    assert(!tick.includes('.clone()'), 'perf: Player.tick has no .clone() per frame', pass, fail);
  }

  // ── Game._update: throttled floodlights, no Set copies, single raycast ──
  {
    const g = src('Game.js');
    const upd = methodBody(g, '_update');
    assert(!!upd, 'perf: Game._update exists', pass, fail);
    assert(!upd.includes('[...this.xpSystem.skills]'), 'perf: _update does not copy the skills Set per frame', pass, fail);
    assert(upd.includes('this._floodTimer'), 'perf: floodlight update is throttled (_floodTimer gate)', pass, fail);
    const raycasts = (upd.match(/getTargetBlock\(/g) ?? []).length;
    assert(raycasts === 1, `perf: _update raycasts the target block once per frame (found ${raycasts})`, pass, fail);
  }

  // ── UI: hotbar/zone/label dirty checks ──
  {
    const u = src('UI.js');
    const uh = methodBody(u, 'updateHotbar');
    assert(!!uh, 'perf: UI.updateHotbar exists', pass, fail);
    assert(!uh.includes('querySelectorAll'), 'perf: updateHotbar uses cached slot refs (no per-frame querySelectorAll)', pass, fail);
    const sz = methodBody(u, 'setZone');
    assert(!!sz && sz.includes('_zoneLast'), 'perf: setZone dirty-checks before writing textContent', pass, fail);
  }

  // ── AmbientLife: the cat is pooled, not rebuilt per crossing ──
  {
    const a = src('world/AmbientLife.js');
    const cat = methodBody(a, '_play_cat_pass');
    assert(!!cat, 'perf: AmbientLife._play_cat_pass exists', pass, fail);
    assert(cat.includes('if (!this._catMesh)'), 'perf: cat mesh is built once (guarded pool), not per crossing', pass, fail);
    const tickCat = methodBody(a, '_tickCat');
    assert(!!tickCat && !tickCat.includes('remove'), 'perf: _tickCat hides the pooled cat instead of scene.remove churn', pass, fail);
  }

  // ── Loading: the yard is behind the dynamic import ──
  {
    const m = src('main.js');
    assert(!/^\s*import\s+.*Game\.js/m.test(m), 'load: main.js does not statically import Game.js', pass, fail);
    assert(m.includes("await import('./Game.js')"), 'load: Game.js is dynamically imported in boot()', pass, fail);
    assert(m.includes('boot-progress') || m.includes('bootProgress'), 'load: boot shows a progress affordance', pass, fail);
  }
}
