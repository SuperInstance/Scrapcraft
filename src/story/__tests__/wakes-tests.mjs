/** WAKES tests — Thread 3: the yard wakes, one dormant thing per completed chapter. */

import { Wakes, WAKE_EVENTS } from '../Wakes.js';
import { SPINE } from '../../quests/data/index.js';
import { QuestTracker } from '../../quests/Tracker.js';
import { CAMPAIGN } from '../../quests/data/index.js';

export function runWakesTests(ok) {
  const mkAdapter = () => ({
    stats: () => ({}), crafted: () => new Set(), countItem: () => 0,
    plaquesRead: () => 0, lapBestSecs: () => null, getTier: () => null,
  });
  const mkTracker = () =>
    new QuestTracker({ quests: CAMPAIGN, adapter: mkAdapter(), storage: null });
  const complete = (t, ids) => {
    for (const id of [].concat(ids)) t.data.completed[id] ??= { at: '2026-08-22T00:00:00.000Z', day: 1 };
  };
  const fakeSpine = (t) => {
    const byIdx = new Map(SPINE.map(c => [c.id, c]));
    return {
      chapters: SPINE,
      indexOf: id => SPINE.findIndex(c => c.id === id) + 1,
      chapterComplete: ch => ch.quests.every(q => t.isCompleted(q)),
    };
  };

  console.log('\nStory · Wakes');
  {
    // fresh yard: everything asleep, sync is a no-op
    const t = mkTracker();
    const w = new Wakes({ storage: null });
    const newly = w.sync(fakeSpine(t));
    ok('fresh yard: nothing wakes, nothing newly', newly.length === 0 && w.count() === 0);
    ok('east road light asleep before ch2', !w.active('wake-yardlight'));

    // complete chapters 1+2 → exactly the ch2 wake fires, once
    complete(t, [SPINE[0].quests, SPINE[1].quests].flat());
    const n2 = w.sync(fakeSpine(t));
    ok('ch2 complete → east road light wakes (newly reported once)',
       n2.length === 1 && n2[0] === 'wake-yardlight' && w.active(2));
    ok('re-sync reports nothing new (idempotent)', w.sync(fakeSpine(t)).length === 0);
    ok('later chapters still asleep', !w.active('wake-fencewhistle'));

    // monotonic: a tracker reset must never un-wake
    const fresh = new Wakes({ storage: null });
    fresh._awake = { ...w._awake };
    const t0 = mkTracker();
    fresh.sync(fakeSpine(t0));
    ok('completions can never put the yard back to sleep (monotonic)', fresh.active('wake-yardlight'));

    // full spine → all five wakes, names ordered
    for (const c of SPINE) complete(t, c.quests);
    w.sync(fakeSpine(t));
    ok('full spine → all 5 wakes (count ' + w.count() + ')', w.count() === WAKE_EVENTS.length);
    ok('awakeNames are the yard\'s names, not ids',
       w.awakeNames().includes('The Night Everything Was On'));

    // persistence round-trip
    const store = { m: new Map(), getItem(k){return this.m.has(k)?this.m.get(k):null;}, setItem(k,v){this.m.set(k,String(v));} };
    const w2 = new Wakes({ storage: store });
    complete(mkTracker(), []); // (tracker unused here)
    const t3 = mkTracker();
    complete(t3, SPINE[1].quests);
    w2.sync(fakeSpine(t3));
    const w3 = new Wakes({ storage: store });
    ok('wake state survives reload', w3.active('wake-yardlight') && w3.count() === 1);

    // fail-soft: no spine → inert
    const w4 = new Wakes({ storage: null });
    ok('no spine → sync returns empty, no crash', w4.sync(null).length === 0 && w4.sync({}).length === 0);

    // corrupt save never crashes the yard
    const bad = { getItem: () => '{corrupt', setItem: () => {} };
    ok('corrupt save: yard carries on', new Wakes({ storage: bad }).count() === 0);
  }
}
