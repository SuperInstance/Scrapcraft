/**
 * SPINE LIVE tests — convergence cut: SpineState (position/ceremonies/bands),
 * QuestSystem wiring (ceremonies fire once, DailyContract re-key), the
 * Logbook rail rows, and chapter warm-up contract picks. Headless: fake
 * trackers/games, no DOM (renderChapterCeremony no-ops without a document).
 */

import { SpineState, spineRailRows } from '../Spine.js';
import { pickPullLine } from '../LogbookPanel.js';
import { QuestTracker } from '../Tracker.js';
import { CAMPAIGN, SPINE } from '../data/index.js';
import { pickContract, DailyContract } from '../../DailyContract.js';

export function runSpineLiveTests(ok) {
  const byId = new Map(CAMPAIGN.map(q => [q.id, q]));

  const mkAdapter = () => ({
    stats: () => ({}), crafted: () => new Set(), countItem: () => 0,
    plaquesRead: () => 0, lapBestSecs: () => null, getTier: () => null,
  });
  const mkTracker = () =>
    new QuestTracker({ quests: CAMPAIGN, adapter: mkAdapter(), storage: null });
  const complete = (t, ids) => {
    for (const id of [].concat(ids)) t.data.completed[id] ??= { at: '2026-08-22T00:00:00.000Z', day: 1 };
  };

  // ══ 1. SpineState: position math is derived + monotonic ══════════════════
  console.log('\nSpine live · SpineState');
  {
    const t = mkTracker();
    const s = new SpineState({ spine: SPINE, tracker: t, storage: null });
    ok('fresh player sits at chapter 1', s.currentChapterIndex() === 1);
    ok('fresh player: chapter 1 started (opener available), nothing else',
       s.startedChapters().length <= 1);

    // complete all of ch1's carriers → position advances only as far as ch2
    const ch1 = SPINE[0];
    complete(t, ch1.quests);
    ok('ch1 carriers done → position 2 (ch2 opener now available)',
       s.currentChapterIndex() === 2, `got ${s.currentChapterIndex()}`);
    ok('unlockedBand tracks current chapter', s.unlockedBand() === SPINE[1].unlockBand);

    // monotonic: no regression possible — completing nothing keeps position
    const before = s.currentChapterIndex();
    ok('position never walks backwards', s.currentChapterIndex() === before);

    // full-spine walk → the second road to the finale opens
    for (const c of SPINE) complete(t, c.quests);
    ok('all carriers done → spineCompletePreFinale true (road 2 to the race)',
       s.spineCompletePreFinale());
    ok('position caps at chapter 12', s.currentChapterIndex() === 12);
  }

  // ══ 2. Ceremonies: once ever, persisted, migration-safe ══════════════════
  console.log('\nSpine live · ceremonies');
  {
    const store = { m: new Map(), getItem(k){return this.m.has(k)?this.m.get(k):null;}, setItem(k,v){this.m.set(k,String(v));} };
    const t = mkTracker();
    const s = new SpineState({ spine: SPINE, tracker: t, storage: store });
    const due1 = s.dueCeremonies().map(c => c.id);
    ok('fresh player: ch1 ceremony due immediately', due1.includes('ch01'));
    s.markOpened('ch01');
    ok('marked → not due again', !s.dueCeremonies().map(c => c.id).includes('ch01'));

    // persistence: a new SpineState over the same storage doesn't re-fire
    const s2 = new SpineState({ spine: SPINE, tracker: t, storage: store });
    s2.load();
    ok('ceremony gate survives reload (once EVER, not once per session)',
       !s2.dueCeremonies().map(c => c.id).includes('ch01'));

    // migration: a returning player's already-started chapters open silently
    const t3 = mkTracker();
    complete(t3, [SPINE[0].quests, SPINE[1].quests, SPINE[2].quests].flat());
    const s3 = new SpineState({ spine: SPINE, tracker: t3, storage: null });
    const n = s3.markAllStartedAsOpened();
    ok('migration marks every started chapter (no catch-up wall)', n >= 3, `n=${n}`);
    ok('after migration nothing is due', s3.dueCeremonies().length === 0);

    // completion ceremonies: like open ceremonies but for completed chapters
    const t4 = mkTracker();
    const s4 = new SpineState({ spine: SPINE, tracker: t4, storage: null });
    complete(t4, SPINE[0].quests);
    const due = s4.dueCompletedCeremonies();
    ok('completed chapter has a due completion ceremony', due.some(c => c.id === 'ch01'), `got ${due.map(c => c.id).join(',')}`);
    s4.markCompleted('ch01');
    ok('marked → not due again', !s4.dueCompletedCeremonies().some(c => c.id === 'ch01'));
    // a merely STARTED chapter owes no completion ceremony (open ≠ closed)
    const t4b = mkTracker();
    const s4b = new SpineState({ spine: SPINE, tracker: t4b, storage: null });
    complete(t4b, SPINE[0].quests[0]);
    ok('started-but-not-complete chapter owes no closing ceremony', s4b.dueCompletedCeremonies().length === 0);

    // markAllCompletedAsCeremonied for returning players (no catch-up wall)
    const t5 = mkTracker();
    complete(t5, [SPINE[0].quests, SPINE[1].quests, SPINE[2].quests].flat());
    const s5 = new SpineState({ spine: SPINE, tracker: t5, storage: null });
    const count = s5.markAllCompletedAsCeremonied();
    ok('migration marks every completed chapter', count >= 3, `count=${count}`);
    ok('after migration no ceremonies due', s5.dueCompletedCeremonies().length === 0);

    // completion ceremony persistence
    const store2 = { m: new Map(), getItem(k){return this.m.has(k)?this.m.get(k):null;}, setItem(k,v){this.m.set(k,String(v));} };
    const t6 = mkTracker();
    complete(t6, SPINE[0].quests);
    const s6 = new SpineState({ spine: SPINE, tracker: t6, storage: store2 });
    s6.markCompleted('ch01');
    const s6b = new SpineState({ spine: SPINE, tracker: t6, storage: store2 });
    s6b.load();
    ok('completed ceremony gate survives reload', !s6b.dueCompletedCeremonies().some(c => c.id === 'ch01'));
  }

  // ══ 3. Soft bands: nudge once, never block ══════════════════════════════
  console.log('\nSpine live · soft bands');
  {
    const t = mkTracker();
    const s = new SpineState({ spine: SPINE, tracker: t, storage: null });
    ok('fresh player band 0; deep-band check available',
       s.unlockedBand() === SPINE[0].unlockBand);
    ok('band nudge starts un-nudged', !s.bandNudged(3));
    s.markBandNudged(3);
    ok('band nudge is once-ever', s.bandNudged(3));
  }

  // ══ 4. The Logbook rail rows ═════════════════════════════════════════════
  console.log('\nSpine live · rail');
  {
    const t = mkTracker();
    const s = new SpineState({ spine: SPINE, tracker: t, storage: null });
    const rows = spineRailRows(s);
    ok('rail has all 12 chapters', rows.length === 12);
    ok('fresh player: ch1 current, ch2+ future silhouettes',
       rows[0].state === 'current' && rows.slice(1).every(r => r.state === 'future'));
    ok('future rows hide the title, show the teaser',
       rows[1].teaser.length > 0 && rows[1].title !== '');
    complete(t, SPINE[0].quests);
    const rows2 = spineRailRows(s);
    ok('ch1 done → filled row, ch2 current/glowing',
       rows2[0].state === 'done' && rows2[1].state === 'current');
  }

  // ══ 5. Chapter warm-up contracts (deterministic, from the chapter pool) ══
  console.log('\nSpine live · contract re-key');
  {
    const ch = SPINE[1];
    const qById = id => byId.get(id) ?? null;
    const a = pickContract('2026-08-22', ch, qById);
    const b = pickContract('2026-08-22', ch, qById);
    ok('chapter warm-up is deterministic per (day, chapter)',
       a?.id === b?.id && a?.warmup === true);
    ok('warm-up objective lifts from the chapter\'s carriers',
       ch.quests.includes(a.questId), `picked ${a.questId}`);
    const other = pickContract('2026-08-23', ch, qById);
    ok('different day can roll a different warm-up', other?.warmup === true);

    // DailyContract.onChapter: fresh contract re-keys now, mid-contract waits
    const fakeGame = {
      quests: {
        spine: { byId: id => SPINE.find(c => c.id === id) ?? null },
        tracker: { def: id => byId.get(id) ?? null },
      },
      ui: { updateDaily() {} },
    };
    const dc = new DailyContract(fakeGame, new Date('2026-08-22T10:00:00'));
    const rekeyed = dc.onChapter(ch);
    ok('fresh contract re-keys to the chapter warm-up immediately', rekeyed === true);
    ok('the live contract IS the warm-up', dc.contract?.warmup === true);

    const dc2 = new DailyContract(fakeGame, new Date('2026-08-22T10:00:00'));
    dc2._state.progress = 3;   // mid-contract: progress made
    const deferred = dc2.onChapter(ch);
    ok('mid-contract re-key waits for the next day roll', deferred === false);
    ok('chapter noted for the next roll', dc2._state.chapterId === ch.id);
  }

  // ══ 6. Pull-vector pick: highest bond met companion, Rivet default ══════
  console.log('\nSpine live · pull vector');
  {
    const ch = SPINE[0];
    const none = pickPullLine(ch, null);
    ok('no roster → Rivet (the faithful default)', none.who === 'rivet' && !!none.line);
    const roster = {
      data: { met: ['bolt', 'juno'] },
      get: id => ({ state: { data: { bond: id === 'juno' ? 40 : 10 } } }),
    };
    const pick = pickPullLine(ch, roster);
    ok('highest-bond met companion carries the pull', pick.who === 'juno');
  }
}
