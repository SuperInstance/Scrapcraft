/**
 * VETERAN RIDE tests — determinism, v6 shape, the achievements honesty gate,
 * the three side-storage seeds (spine / wakes / Rivet, round-tripped through
 * the REAL headless modules), applyVeteranProfile's write contract, the
 * summary one-liner, and garbage-opts tolerance.
 *
 * Run headless: the suite imports only DOM-free modules (QuestTracker,
 * SpineState, Wakes, RivetState, XPSystem — all verified headless, same
 * doctrine as src/quests/__tests__/spine-live-tests.mjs).
 */

import {
  generateVeteranSave,
  applyVeteranProfile,
  veteranRideSummary,
  VETERAN_SAVE_KEY,
  VETERAN_SPINE_KEY,
  VETERAN_WAKES_KEY,
  VETERAN_RIVET_KEY,
  VETERAN_TRACKER_KEY,
} from '../veteranRide.js';
import { SpineState } from '../../quests/Spine.js';
import { QuestTracker } from '../../quests/Tracker.js';
import { CAMPAIGN, SPINE } from '../../quests/data/index.js';
import { Wakes } from '../../story/Wakes.js';
import { RivetState, TIER_THRESHOLDS } from '../../companion/state.js';
import { XPSystem } from '../../XPSystem.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    _dump: () => m,
  };
}

export function runVeteranTests(ok) {
  const profile = generateVeteranSave();
  const json = JSON.stringify(profile);

  // ══ 1. Determinism ═══════════════════════════════════════════════════════
  console.log('\nVeteran ride · determinism');
  {
    ok('two default calls → byte-identical JSON',
       json === JSON.stringify(generateVeteranSave()));
    const o = { seed: 42, now: '2025-01-01T00:00:00.000Z' };
    ok('same injected opts → byte-identical JSON',
       JSON.stringify(generateVeteranSave(o)) === JSON.stringify(generateVeteranSave({ ...o })));
    ok('custom now actually moves the stamps',
       JSON.stringify(generateVeteranSave(o)) !== json);
  }

  // ══ 2. v6 save shape ═════════════════════════════════════════════════════
  console.log('\nVeteran ride · v6 shape');
  {
    const s = profile.save;
    ok('version 6', s.version === 6);
    ok('veteran honesty flag present (ride/at/seed)',
       s.veteran.ride === true && typeof s.veteran.at === 'string' && s.veteran.seed === 1337);
    ok('player at the yard-gate spawn (8, 2, 5)',
       s.player.pos.x === 8 && s.player.pos.y === 2 && s.player.pos.z === 5);
    ok('crafted includes wrench', s.player.crafted.includes('wrench'));
    ok('inventory is 36 slots, stocked with iron_scrap x40',
       s.player.inventory.length === 36
       && s.player.inventory.some(it => it?.id === 'iron_scrap' && it.qty === 40));
    ok('hotbarIndex 0', s.player.hotbarIndex === 0);
    ok('world seed 1337, empty diffs', s.world.seed === 1337
       && s.world.minedBlocks.length === 0 && s.world.placedBlocks.length === 0);
    ok('earl questIndex is a sane mid index (16 of 20)',
       s.earl.questIndex > 0 && s.earl.questIndex < 20 && s.earl.history.length === 0);
    ok('tileEditor stays null (their own program is theirs)', s.tileEditor === null);
    ok('daily null, botUpgrades [], exchange {}',
       s.daily === null && s.botUpgrades.length === 0
       && Object.keys(s.exchange).length === 0);
    ok('botPersonality mid-range (bond < 100, milestones not maxed)',
       s.botPersonality.bond > 25 && s.botPersonality.bond < 100
       && !s.botPersonality.firedMilestones.includes(100));
    ok('bots hint array carries TWO ledger-shaped bots',
       Array.isArray(s.veteran.bots) && s.veteran.bots.length === 2
       && s.veteran.bots.every(b => b.storageKey && typeof b.ledger.runtimeS === 'number'));
  }

  // ══ 3. XP: level 8 via the real XPSystem round-trip ══════════════════════
  console.log('\nVeteran ride · xp');
  {
    const xp = new XPSystem();
    xp.fromSaveData(profile.save.xp);
    ok('xp 640 re-loads as level 8 (XPSystem round-trip)', xp.level === 8);
    ok('formula agrees: floor(sqrt(640/10)) === 8',
       Math.floor(Math.sqrt(profile.save.xp.xp / 10)) === 8);
    ok('skills derived up to level 8 (maker in, inventor out)',
       profile.save.xp.skills.includes('maker')
       && !profile.save.xp.skills.includes('inventor'));
  }

  // ══ 4. The honest gate: achievements LIVE-ONLY ═══════════════════════════
  console.log('\nVeteran ride · achievements honesty gate');
  {
    const a = profile.save.achievements;
    ok('no achievements unlocked', a.unlocked.length === 0);
    ok('totalMined === 0 (seeded gear fabricates no stats)', a.stats.totalMined === 0);
    ok('itemsCollected empty despite stocked inventory',
       Object.keys(a.stats.itemsCollected).length === 0);
    ok('crafted stats empty (the set lives in player.crafted, not stats)',
       a.stats.crafted.length === 0);
    ok('counters zeroed (questsCompleted, blocksPlaced, lapsCompleted...)',
       a.stats.questsCompleted === 0 && a.stats.blocksPlaced === 0
       && a.stats.lapsCompleted === 0);
    ok('towerActivated false', a.stats.towerActivated === false);
  }

  // ══ 5. Spine storage: ch01–ch06 walked, ch07 mid, finale unreached ═══════
  console.log('\nVeteran ride · spine storage');
  {
    const sp = profile.spineStorage;
    ok('schema v1', sp.v === 1);
    for (const ch of ['ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06']) {
      ok(`${ch} opened AND completed (ISO stamps)`,
         typeof sp.opened[ch] === 'string' && sp.opened[ch].includes('T')
         && typeof sp.completedCh[ch] === 'string');
    }
    ok('ch07 opened only (started, not finished)',
       typeof sp.opened.ch07 === 'string' && !sp.completedCh.ch07);
    ok('ch12 NOT completed', !sp.completedCh.ch12);
    ok('completedEver false (finale not reached)', sp.completedEver === false);
  }

  // ══ 6. Spine round-trip: storage → live SpineState at chapter 7 ══════════
  console.log('\nVeteran ride · spine round-trip');
  {
    const store = fakeStorage();
    store.setItem(VETERAN_SPINE_KEY, JSON.stringify(profile.spineStorage));
    const tracker = new QuestTracker({
      quests: CAMPAIGN,
      adapter: { stats: () => ({}), crafted: () => new Set(), countItem: () => 0,
                 plaquesRead: () => 0, lapBestSecs: () => null, getTier: () => null },
      storage: null,
    });
    // The profile's TRACKER storage now carries the story state directly:
    // every carrier of ch01–ch06 done, ch07's earl carriers done (started).
    const complete = ids => { for (const id of ids) tracker.data.completed[id] = { at: '2026-08-01T00:00:00.000Z', day: 1 }; };
    for (const qid of Object.keys(profile.trackerStorage.completed)) {
      tracker.data.completed[qid] = { ...profile.trackerStorage.completed[qid] };
    }
    complete([]);
    const s = new SpineState({ spine: SPINE, tracker, storage: store });
    s.load();
    ok('seeded storage re-loads cleanly', s.data.opened.ch01 === profile.spineStorage.opened.ch01);
    ok('story state derives to chapter 7 (ch01–ch06 complete, ch07 not)',
       s.currentChapterIndex() === 7, `got ${s.currentChapterIndex()}`);
    ok('no open ceremony re-fires for the walked chapters',
       s.dueCeremonies().length === 0,
       s.dueCeremonies().map(c => c.id).join(','));
    ok('no completion ceremony re-fires either',
       s.dueCompletedCeremonies().length === 0);
  }

  // ══ 6b. Tracker storage: the spine's position truth, seeded + converged ═
  console.log('\nVeteran ride · tracker storage');
  {
    const t = profile.trackerStorage;
    ok('tracker storage is v1 with completed/progress/flags',
       t.v === 1 && typeof t.completed === 'object' && Array.isArray(t.flags));
    // every carrier of ch01–ch06 + ch07's two starters, cross-checked against
    // the REAL spine so drift between generator and spine.json fails loudly
    const expected = new Set();
    for (let i = 1; i <= 6; i++) for (const q of SPINE[i - 1].quests) expected.add(q);
    expected.add('earl-8'); expected.add('earl-15');
    const seeded = new Set(Object.keys(t.completed));
    ok('seeds exactly ch01–ch06 carriers + earl-8/earl-15 (no extras)',
       seeded.size === expected.size && [...seeded].every(q => expected.has(q)));
    ok('seeded entries are migrated backfill',
       Object.values(t.completed).every(e => e.migrated === true));

    // full convergence round-trip: apply → fresh tracker + spine → ch07
    const store = fakeStorage();
    store.setItem(VETERAN_TRACKER_KEY, JSON.stringify(t));
    const tr2 = new QuestTracker({ quests: CAMPAIGN, storage: store,
      adapter: { stats: () => ({}), crafted: () => new Set(), countItem: () => 0,
                 plaquesRead: () => 0, lapBestSecs: () => null, getTier: () => null } });
    tr2.load();
    const s2 = new SpineState({ spine: SPINE, tracker: tr2, storage: fakeStorage() });
    ok('tracker round-trip lands the spine at ch07', s2.currentChapterIndex() === 7,
       `got ${s2.currentChapterIndex()}`);
    ok('ch01–ch06 complete, ch07 started-not-complete',
       s2.chapterComplete(s2.chapter(6)) && !s2.chapterComplete(s2.chapter(7))
       && s2.chapterStarted(s2.chapter(7)));
  }

  // ══ 7. Wakes storage + round-trip ════════════════════════════════════════
  console.log('\nVeteran ride · wakes storage');
  {
    const w = profile.wakesStorage;
    ok('awake keys are exactly chapter-number strings 2, 4, 6',
       Object.keys(w).length === 3
       && ['2', '4', '6'].every(k => w[k] === true));
    const store = fakeStorage();
    store.setItem(VETERAN_WAKES_KEY, JSON.stringify(w));
    const wakes = new Wakes({ storage: store });
    ok('Wakes round-trip: 2/4/6 active, 7 dormant',
       wakes.active(2) && wakes.active(4) && wakes.active(6) && !wakes.active(7));
    ok('count() === 3', wakes.count() === 3);
  }

  // ══ 8. Companion storage: Rivet at friend, round-trip via RivetState ═════
  console.log('\nVeteran ride · companion storage');
  {
    const c = profile.companionStorage;
    ok('bond ≥ friend threshold (120)', c.bond >= TIER_THRESHOLDS.friend);
    ok('believable counters (blocks ~600, 2 bots, ~40 talks)',
       c.counters.blocksMined > 500 && c.counters.botsBuilt === 2
       && c.counters.conversations > 30);
    ok('firstMetAt is the fixed ISO', typeof c.firstMetAt === 'string' && c.firstMetAt.includes('T'));
    ok('recent ring short', c.recent.length <= 5);

    const store = fakeStorage();
    store.setItem(VETERAN_RIVET_KEY, JSON.stringify(c));
    const rivet = new RivetState({ storage: store });
    ok('RivetState round-trip: tier friend', rivet.tier === 'friend');
    ok('tierIndex 2 of 2', rivet.tierIndex() === 2);
    ok('bond survives the merge at 130', rivet.data.bond === 130);
    ok('counters survive the merge', rivet.data.counters.blocksMined === c.counters.blocksMined);
  }

  // ══ 9. applyVeteranProfile: exactly 4 keys, never the live save ══════════
  console.log('\nVeteran ride · applyVeteranProfile');
  {
    const store = fakeStorage();
    const written = applyVeteranProfile(profile, store);
    ok('writes exactly the 4 side-storage keys',
       written.length === 4 && written.includes(VETERAN_SPINE_KEY)
       && written.includes(VETERAN_WAKES_KEY) && written.includes(VETERAN_RIVET_KEY)
       && written.includes(VETERAN_TRACKER_KEY));
    ok('storage holds exactly those 4 keys', store._dump().size === 4);
    ok('the LIVE save key is never written',
       !store._dump().has('scrapcraft_save_v6') && !store._dump().has(VETERAN_SAVE_KEY));

    let threw = false;
    try {
      applyVeteranProfile(profile, {
        getItem: () => null,
        setItem: () => { throw new Error('quota exceeded'); },
      });
    } catch { threw = true; }
    ok('corrupt (throwing) storage → no crash', !threw);

    ok('garbage profile → no crash, nothing written',
       applyVeteranProfile(null, fakeStorage()).length === 0);
  }

  // ══ 10. veteranRideSummary ═══════════════════════════════════════════════
  console.log('\nVeteran ride · summary');
  {
    const sum = veteranRideSummary(profile);
    ok('level 8', sum.level === 8);
    ok('chaptersComplete 6', sum.chaptersComplete === 6);
    ok('wakesFired 3', sum.wakesFired === 3);
    ok('companionTier friend', sum.companionTier === 'friend');
    ok('bots 2', sum.bots === 2);
    ok('note is a non-empty one-liner', typeof sum.note === 'string' && sum.note.length > 0);
    ok('garbage profile → fail-soft summary',
       veteranRideSummary(null).level === 0 && veteranRideSummary(null).bots === 0);
  }

  // ══ 11. Garbage opts: deterministic + valid ══════════════════════════════
  console.log('\nVeteran ride · garbage opts');
  {
    const a = generateVeteranSave(null);
    const b = generateVeteranSave(null);
    ok('null opts → deterministic', JSON.stringify(a) === JSON.stringify(b));
    ok('null opts === default opts === {}', JSON.stringify(a) === json
       && JSON.stringify(generateVeteranSave({})) === json);
    ok('garbage opts still yield a valid v6 profile',
       a.save.version === 6 && a.save.veteran.seed === 1337);
    ok('garbage now falls back to the fixed stamp',
       generateVeteranSave({ now: 'not-a-date' }).save.lastSaved
       === profile.save.lastSaved);
  }
}
