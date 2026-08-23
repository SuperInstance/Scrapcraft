/**
 * ───────────────────────────────────────────────────────────────────────────
 *  PRESTIGE + PERKS TESTS  —  run via run-tests.mjs (`npm test`)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Covers: perk purity + effect math, the no-power-creed invariants, the
 * mark economy (finite, once-ever, no double awards), board purchasing,
 * persistence round-trip, the first-mark Earl moment, and spine/data
 * integration (including the dark-pattern ban on the catalog).
 */

import {
  ACHIEVEMENT_PERKS, PERK_EFFECTS, perksFor, perkEffects, INTENTIONALLY_NO_PERK,
} from '../perks.js';
import {
  PrestigeSystem, BACKROOM_CATALOG, MARK_AWARDS, rewardCategory, ARC_IDS,
  EARL_BOARD_LINES, EARL_FIRST_MARK_LINE, EARL_CANT_AFFORD_LINE,
} from '../Prestige.js';
import { SPINE, CAMPAIGN } from '../../quests/data/index.js';
import { ARC_SIZES, OBJECTIVE_TYPES } from '../../quests/schema.js';

class MemStore {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, v); }
}

/** Minimal stand-in tracker over the real quest data. */
function fakeTracker(completedIds = []) {
  const done = new Set(completedIds);
  return {
    questDefs: CAMPAIGN,
    isCompleted: (id) => done.has(id),
  };
}

const boltQuests  = CAMPAIGN.filter(q => q.arc === 'bolt');
const magmaQuests = CAMPAIGN.filter(q => q.arc === 'magma');
const finaleQuest = CAMPAIGN.find(q => q.id === 'finale-midnight-race');

export function runPrestigeTests(ok) {
  // ── Perks: purity + math ─────────────────────────────────────────────────
  console.log('Prestige · perks');
  {
    const none = perkEffects(new Set());
    ok('no achievements → zero perk effects',
      none.mineReachTiles === 0 && none.lanternBrightness === 0 && none.stickerRows === 0);

    const reach = perkEffects(new Set(['night_miner']));
    ok('night_miner → exactly +1 mining reach, nothing else',
      reach.mineReachTiles === 1 && reach.lanternBrightness === 0 && reach.stickerRows === 0);

    const glow = perkEffects(['field_scholar']);
    ok('field_scholar (20 codex) → lantern warmth only (0.7), no reach',
      glow.lanternBrightness === 0.7 && glow.mineReachTiles === 0 && glow.stickerRows === 0);

    const stick = perkEffects(['full_codex']);
    ok('full_codex (40 codex) → exactly one sticker row',
      stick.stickerRows === 1 && stick.mineReachTiles === 0 && stick.lanternBrightness === 0);

    const all = perkEffects(new Set(['night_miner', 'field_scholar', 'full_codex']));
    ok('all three milestones stack additively',
      all.mineReachTiles === 1 && all.lanternBrightness === 0.7 && all.stickerRows === 1);

    ok('perksFor returns labeled perk defs',
      perksFor(new Set(['night_miner'])).length === 1 && perksFor(new Set(['night_miner']))[0].id === 'long_arms');

    // non-milestone achievements grant nothing
    const noise = perkEffects(new Set(['first_blood', 'bot_racer', 'oval_racer', 'sparky', 'ten_recipes']));
    ok('non-milestone achievements grant zero effects',
      noise.mineReachTiles === 0 && noise.lanternBrightness === 0 && noise.stickerRows === 0);

    const achIds = new Set(Object.keys(ACHIEVEMENT_PERKS));
    ok('INTENTIONALLY_NO_PERK contains zero actual perk keys',
      INTENTIONALLY_NO_PERK.every(id => !achIds.has(id)));

    // every perk def has an effect row
    ok('every perk id has an effect row in PERK_EFFECTS',
      Object.values(ACHIEVEMENT_PERKS).every(d => PERK_EFFECTS[d.perk] != null));
  }

  // ── No-power-creed: perk stats never appear as objective vocabulary ──────
  console.log('Prestige · no-power-creed');
  {
    // 'reach' legitimately appears in quest prose ("reach the Deep Yard") — the
    // invariant is that no objective references a perk QUANTITY by name/type/stat
    const perkWords = ['lantern', 'sticker', 'prestige', 'perk', 'brightness'];
    const objectives = CAMPAIGN.flatMap(q => q.objectives ?? []);
    const offenders = objectives.filter(o =>
      perkWords.some(w => JSON.stringify(o).toLowerCase().includes(w)));
    ok('no quest objective references any perk quantity (perks never gate quests)',
      offenders.length === 0);

    ok('objective taxonomy has no perk-flavored type',
      !OBJECTIVE_TYPES.some(t => /REACH|LANTERN|STICKER|PERK/.test(t)));

    // race + economy achievements pay nothing (the line we do not cross)
    const racers = ['bot_racer', 'oval_racer', 'rust_whisperer', 'night_owl'];
    ok('racing/economy achievements grant no perks',
      racers.every(id => !ACHIEVEMENT_PERKS[id]));
  }

  // ── Mark economy: finite, once-ever ──────────────────────────────────────
  console.log('Prestige · mark economy');
  const p = new PrestigeSystem(null, { storage: new MemStore() });
  {
    const before = boltQuests.slice(0, 4);
    const last = boltQuests[4];

    for (const q of before) p.onQuestCompleted(q, fakeTracker(before.map(q => q.id)));
    ok('partial arc pays no marks', p.marks === 0);

    const doneIds = boltQuests.map(q => q.id);
    const a1 = p.onQuestCompleted(last, fakeTracker(doneIds));
    ok('arc completion pays exactly MARK_AWARDS.arc',
      a1.length === 1 && a1[0].sourceId === 'arc:bolt' && p.marks === MARK_AWARDS.arc);

    // re-completion of the same arc (e.g. replayed event) must not double-pay
    const a2 = p.onQuestCompleted(last, fakeTracker(doneIds));
    ok('arc award is once-ever (no double pay)', a2.length === 0 && p.marks === MARK_AWARDS.arc);

    // the finale: spine ch12 payoff
    const f1 = p.onQuestCompleted(finaleQuest, fakeTracker([...doneIds, 'finale-midnight-race']));
    ok('Midnight Race completion pays MARK_AWARDS.finale',
      f1.length === 1 && f1[0].amount === MARK_AWARDS.finale);

    const f2 = p.onQuestCompleted(finaleQuest, fakeTracker([...doneIds, 'finale-midnight-race']));
    ok('finale award is once-ever', f2.length === 0);

    // ARC_IDS mirrors schema ARC_SIZES — assert the mirror, not the memory
    const arcCountInSchema = Object.keys(ARC_SIZES).filter(a => a !== 'earl' && a !== 'finale').length;
    ok('ARC_IDS mirrors schema ARC_SIZES companion arcs',
      ARC_IDS.length === arcCountInSchema);

    // total economy: arcs × 1 + finale × 2 = 6, forever finite
    const maxEarnable = ARC_IDS.length * MARK_AWARDS.arc + MARK_AWARDS.finale;
    ok('total earnable marks = 6 (finite, no grind)',
      maxEarnable === 6 && MARK_AWARDS.arc === 1 && MARK_AWARDS.finale === 2);

    // Earl's 20-quest chain pays nothing — only companion arcs + finale do
    const earlAll = CAMPAIGN.filter(q => q.arc === 'earl').map(q => q.id);
    const eAwards = p.onQuestCompleted(CAMPAIGN.find(q => q.arc === 'earl'), fakeTracker(earlAll));
    ok("Earl's own chain pays no marks (companions are the prestige)", eAwards.length === 0);
  }

  // ── The board: catalog validity + purchasing ─────────────────────────────
  console.log('Prestige · the board');
  {
    const ids = BACKROOM_CATALOG.map(r => r.id);
    ok('catalog ids are unique', new Set(ids).size === ids.length);
    ok('every entry has label, icon, positive cost, desc, earlLine',
      BACKROOM_CATALOG.every(r => r.label && r.icon && r.cost > 0 && r.desc && r.earlLine));
    ok('every entry has a known category',
      BACKROOM_CATALOG.every(r => rewardCategory(r.id) !== null));

    // dark-pattern ban: no timer/expiry/urgency fields anywhere in the data
    const raw = JSON.stringify(BACKROOM_CATALOG);
    ok('catalog contains no expiry/timer/limited fields',
      !/expir|timer|limited|deadline|urgent|expiresAt|endsAt/i.test(raw));

    // purchasing with 1 mark
    const b = new PrestigeSystem(null, { storage: new MemStore() });
    b._award('arc:bolt', 1);
    ok('cannot afford the 2-mark bot slot with 1 mark',
      !b.canPurchase('second_bot_slot') && b.purchase('second_bot_slot') === null);
    const got = b.purchase('paint_rust_sunset');
    ok('1-mark paint scheme purchases cleanly',
      got && got.id === 'paint_rust_sunset' && b.marks === 0 && b.owns('paint_rust_sunset'));
    ok('owned reward cannot be repurchased',
      b._award('arc:magma', 1) && b.purchase('paint_rust_sunset') === null && b.marks === 1);
    ok('purchasing an unknown id returns null', b.purchase('not_a_reward') === null);

    // second bot slot: comfort not power — costs more than any cosmetic
    const slot = BACKROOM_CATALOG.find(r => r.id === 'second_bot_slot');
    const maxCosmetic = Math.max(...BACKROOM_CATALOG.filter(r => r.id !== 'second_bot_slot').map(r => r.cost));
    ok('bot slot is the priciest item on the board',
      slot.cost === 2 && slot.cost > maxCosmetic);

    // economy shape: total cost (9) exceeds max earnable (6) → choices matter;
    // cheapest reward ≤ 1 mark → first mark already feels good
    const totalCost = BACKROOM_CATALOG.reduce((n, r) => n + r.cost, 0);
    const cheapest = Math.min(...BACKROOM_CATALOG.map(r => r.cost));
    ok('catalog costs more than earnable marks (choice, not checklist)',
      totalCost === 9 && totalCost > 6);
    ok('cheapest reward costs one mark (first mark is spendable)',
      cheapest === 1);
  }

  // ── Persistence ──────────────────────────────────────────────────────────
  console.log('Prestige · persistence');
  {
    const store = new MemStore();
    const a = new PrestigeSystem(null, { storage: store });
    a._award('arc:bolt', 1); a._award('finale', 2);
    a.purchase('lantern_warm_amber');
    a.save();

    const b = new PrestigeSystem(null, { storage: store });
    b.load();
    ok('marks + owned + awards survive a save/load round-trip',
      b.marks === a.marks && b.owns('lantern_warm_amber') && !!b.data.earned['arc:bolt']);

    // once-ever survives reload too
    const again = b.onQuestCompleted(boltQuests[4], fakeTracker(boltQuests.map(q => q.id)));
    ok('already-awarded arc stays once-ever across reloads', again.length === 0);

    const bad = new PrestigeSystem(null, { storage: new MemStore() });
    bad.fromSaveData({ v: 99, marks: 500 });
    ok('wrong-version save data is ignored (no free marks)', bad.marks === 0);

    const bogus = new PrestigeSystem(null, { storage: new MemStore() });
    bogus.fromSaveData({ v: 1, marks: 1, owned: ['not_a_reward'] });
    ok('unknown reward ids are dropped on load', bogus.owned.length === 0);

    const duped = new PrestigeSystem(null, { storage: new MemStore() });
    duped.fromSaveData({ v: 1, marks: 1, owned: ['paint_rust_sunset', 'paint_rust_sunset'] });
    ok('duplicate owned entries are deduped on load', duped.owned.length === 1);

    const neg = new PrestigeSystem(null, { storage: new MemStore() });
    neg.fromSaveData({ v: 1, marks: -5 });
    ok('negative marks in save data clamp to zero', neg.marks === 0);
  }

  // ── First-mark moment: Earl speaks once, on the first award ever ─────────
  console.log('Prestige · first mark moment');
  {
    const said = [], notified = [];
    const g = { ui: { notify: (t) => notified.push(t) }, foreman: { sayLine: (l) => said.push(l) } };
    const first = new PrestigeSystem(g, { storage: new MemStore() });
    first.onQuestCompleted(boltQuests.at(-1), fakeTracker(boltQuests.map(q => q.id)));
    ok('first award: notify + exactly one Earl first-mark line',
      notified.length === 1 && said.length === 1 && said[0] === EARL_FIRST_MARK_LINE);

    // second award (finale): notified again, but Earl does not repeat the moment
    first.onQuestCompleted(finaleQuest, fakeTracker(['finale-midnight-race']));
    ok('later awards notify but never repeat the first-mark line',
      notified.length === 2 && said.length === 1);

    // after a reload, a loaded save keeps firstEver honest
    const store = new MemStore();
    const a = new PrestigeSystem(null, { storage: store });
    a.onQuestCompleted(boltQuests.at(-1), fakeTracker(boltQuests.map(q => q.id)));
    a.save();
    const said2 = [];
    const b2 = new PrestigeSystem({ foreman: { sayLine: (l) => said2.push(l) } }, { storage: store });
    b2.load();
    b2.onQuestCompleted(magmaQuests.at(-1), fakeTracker(magmaQuests.map(q => q.id)));
    ok('first-mark line stays once-ever across reloads', said2.length === 0);
  }

  // ── Spine + data integration ─────────────────────────────────────────────
  console.log('Prestige · spine integration');
  {
    ok('spine has 12 chapters', SPINE.length === 12);
    const ch12 = SPINE.find(c => c.id === 'ch12');
    ok('ch12 (The Midnight Race) references finale-midnight-race',
      ch12.quests.includes('finale-midnight-race'));
    const ch11 = SPINE.find(c => c.id === 'ch11');
    ok('ch11 is The Back Room (the board\'s lore home)',
      ch11.title === 'The Back Room');

    // Earl copy present and non-empty everywhere
    ok('Earl board lines exist (3), kid-warm, no urgency words',
      EARL_BOARD_LINES.length === 3 &&
      !EARL_BOARD_LINES.join(' ').match(/hurry|now or never|last chance|don't miss/i));
    ok('first-mark and cant-afford Earl lines exist',
      !!EARL_FIRST_MARK_LINE && !!EARL_CANT_AFFORD_LINE &&
      /alright|keep/.test(EARL_CANT_AFFORD_LINE));   // kind waiting, not shaming
  }
}
