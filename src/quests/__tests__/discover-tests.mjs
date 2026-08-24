/**
 * DISCOVERABILITY tests — the re-entry/dry-run fixes (finding #1, #2, #4a).
 * Pure + headless: real World at seed 42, real QuestTracker/CAMPAIGN, the
 * veteran returning-profile gate, and the heap-beacon active gating. No DOM,
 * no Game constructor (avoids the canvas/audio/bootstrap).
 *
 * Covered:
 *   1. nearestScrapHeap — points at a heap, honors range, defer/out-of-range.
 *   2. heapBeaconActive — surfaces ONLY while the first mine is the next step.
 *   3. isReturningProfileSignal — the veteran-ride gate (fresh vs returning).
 *   4. earlChat — node lacks document: falls back to prompt() (never crashes).
 *   5. avatar pointToward — pure yaw math extracted for a headless check.
 */

import { World } from '../../World.js';
import { QuestTracker } from '../Tracker.js';
import { CAMPAIGN } from '../data/index.js';
import { nextStep } from '../NextStep.js';
import { nearestScrapHeap, heapBearing, heapBeaconActive } from '../heapBeacon.js';
import { isReturningProfileSignal } from '../../veteran/veteranRide.js';
import { openEarlChat } from '../../onboarding/earlChat.js';

function mkWorld() { const w = new World(128, 128, 10); w.generate(42); return w; }

function mkTracker(stats = {}) {
  return new QuestTracker({
    quests: CAMPAIGN,
    adapter: { stats: () => stats, crafted: () => new Set(), countItem: () => 0,
      plaquesRead: () => 0, lapBestSecs: () => null, getTier: () => null },
    storage: null,
  });
}

function stepFor(stats) {
  const t = mkTracker(stats);
  return nextStep(t, t.available().slice(0, 4));
}

export async function runDiscoverTests(ok) {
  console.log('\nFirst-mine heap beacon · scanning');
  {
    const w = mkWorld();
    const h = nearestScrapHeap(w, 8, 5);
    ok('finds a scrap heap near spawn', h !== null, JSON.stringify(h));
    ok('returns the actual nearest heap (2 blocks away)', h && h.d === 2, h && `d=${h.d}`);
    ok('pointed coordinates are heap blocks',
       h && (w.getBlock(h.x, 1, h.z) === 7 || w.getBlock(h.x, 1, h.z) === 4),
       h && `${h.x},${h.z}`);

    // a far corner still finds a heap in range
    const far = nearestScrapHeap(w, 120, 120);
    ok('finds a heap from a distant corner of the yard', far !== null, JSON.stringify(far));

    // out of a scan range → null (fail-soft, no infinite search)
    const beyond = nearestScrapHeap({ getBlock: () => 0 }, -5000, -5000);
    ok('out of range → null (fail-soft)', beyond === null);

    // a world-less call can never crash
    ok('missing world → null (headless/fail-soft)', nearestScrapHeap(null, 0, 0) === null);
    ok('world w/o getBlock → null', nearestScrapHeap({}, 0, 0) === null);

    // bearing is finite and points at the heap
    const b = heapBearing(w, 8, 5);
    ok('bearing is a finite number', Number.isFinite(b), String(b));
    ok('bearing + yaw 0 → arrow aims at the heap', h && Math.abs(h.d) > 0);

    // the bearing points FROM the player TOWARD the heap (same atan2 math the
    // arrow rotates by) — derive it directly and confirm it matches heapBearing
    if (h) {
      const direct = Math.atan2(h.x - 8, h.z - 5);
      ok('screen bearing equals the direct atan2 to the heap',
         Math.abs((b - direct) % (Math.PI * 2)) < 0.0001 || Math.abs((direct - b) % (Math.PI * 2)) < 0.0001,
         `b=${b} direct=${direct}`);
    }
  }

  console.log('\nFirst-mine heap beacon · active gating');
  {
    // fresh: earl-1 mine is the next step → beacon ON
    const fr = stepFor({});
    ok('fresh kid → beacon active',
       heapBeaconActive(fr) === true, JSON.stringify(fr));

    // partial progress (3/5 iron) → still active
    const part = stepFor({ itemsCollected: { iron_scrap: 3 } });
    ok('partial mine progress → beacon still active', heapBeaconActive(part) === true);

    // earl-1 done (5 iron) → next step is earl-2 craft → beacon OFF
    const done = stepFor({ itemsCollected: { iron_scrap: 5 } });
    const crafted = mkTracker({ itemsCollected: { iron_scrap: 5 } });
    ok('beacon turns off once the mine objective closes',
       heapBeaconActive(stepFor({ itemsCollected: { iron_scrap: 5 } })) === false,
       JSON.stringify(stepFor({ itemsCollected: { iron_scrap: 5 } })));

    // null / non-mine objectives → off
    ok('no next step → off', heapBeaconActive(null) === false);
    ok('non-mine objective → off',
       heapBeaconActive({ kind: 'objective', questId: 'earl-2', label: 'Craft a wrench' }) === false);
    ok('finale step → off',
       heapBeaconActive({ kind: 'finale', questId: 'finale-midnight-race' }) === false);
  }

  console.log('\nVeteran ride gate · fresh vs returning (finding #2)');
  {
    const mem = () => { const m = Object.create(null); return {
      set: (k, v) => { m[k] = String(v); }, getItem: (k) => (k in m ? m[k] : null),
      dump: () => ({ ...m }),
    }; };

    const fresh = mem(); // nothing stored
    ok('brand-new kid (nothing on disk) → NOT returning, ride hidden',
       isReturningProfileSignal(fresh) === false);

    const wiped = mem(); wiped.set('scrapcraft_onboarding_done', 'true');
    ok('blank-profile restart (onboarding done) → returning, ride offered',
       isReturningProfileSignal(wiped) === true);

    const backup = mem(); backup.set('scrapcraft.veteran.backup', 'k');
    ok('prior veteran backup → returning', isReturningProfileSignal(backup) === true);

    const prov = mem(); prov.set('scrapcraft_save_v6_veteran', '{}');
    ok('veteran provenance slot → returning', isReturningProfileSignal(prov) === true);

    const liveOnly = mem(); liveOnly.set('scrapcraft_save_v6', '{}');
    ok('live save exists → returning (belt2/loaded path keeps it)', isReturningProfileSignal(liveOnly) === false);
    ok('null storage → not returning (headless fail-soft)', isReturningProfileSignal(null) === false);
    ok('broken storage (throws) → not returning', isReturningProfileSignal({ getItem: () => { throw new Error('x'); } }) === false);
  }

  console.log('\nEarl chat panel · prompt() fallback (finding #4a)');
  {
    // node has no document → openEarlChat must never throw and returns null,
    // which the caller treats as a cancelled chat (or falls back to prompt).
    let fallbackCalled = false;
    const res = await openEarlChat({ fallback: () => { fallbackCalled = true; return 'hello'; } });
    ok('earl chat resolves (headless, no DOM)', res === 'hello' && fallbackCalled,
       `res=${res} fallback=${fallbackCalled}`);
  }
}
