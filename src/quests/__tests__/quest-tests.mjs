/**
 * Quest framework tests — schema validation, campaign structure, the event
 * tracker, finale gating, the logbook, Earl-save migration, persistence.
 *
 * Exported as a function so run-tests.mjs can fold it into the one harness.
 * Everything headless: the state adapter + storage are injected fakes, no
 * DOM, no game imports.
 */

import { validateQuest, validateCampaign, ARC_SIZES, FINALE_ARC_GATE } from '../schema.js';
import { QuestTracker } from '../Tracker.js';
import { Logbook } from '../Logbook.js';
import { CAMPAIGN } from '../data/index.js';
import { ITEMS } from '../../data/items.js';

export function runQuestTests(ok) {
  const byId = new Map(CAMPAIGN.map(q => [q.id, q]));
  const FINALE_ID = CAMPAIGN.find(q => q.arc === 'finale').id;

  // ── shared mocks ─────────────────────────────────────────────────────────
  const mkStorage = () => {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
    };
  };
  const mkAdapter = (over = {}) => ({
    stats: () => over.stats ?? {},
    crafted: () => new Set(over.crafted ?? []),
    countItem: () => 0,
    plaquesRead: () => over.plaquesRead ?? 0,
    lapBestSecs: () => over.lapBestSecs ?? null,
    getTier: id => over.tiers?.[id] ?? null,
  });
  const mkTracker = (over = {}) =>
    new QuestTracker({ quests: CAMPAIGN, adapter: mkAdapter(over), storage: null });
  // mark quests completed via tracker internals (the sanctioned shortcut)
  const complete = (t, ids, day = 1) => {
    for (const id of [].concat(ids)) t.data.completed[id] ??= { at: '2026-08-22T00:00:00.000Z', day };
  };
  // satisfy the FINALE_ARC_GATE so the engine makes the finale available
  const openFinale = t => complete(t,
    ['bolt-1', 'bolt-2', 'bolt-3', 'bolt-4', 'bolt-5', 'magma-1', 'magma-2', 'magma-3', 'magma-4', 'magma-5']);
  // a well-formed quest to mutate for negative schema tests
  const goodQuest = (id = 'test-quest') => ({
    id, arc: 'earl', title: 'T', brief: 'B', affinity: 'earl',
    objectives: [{ type: 'MINE', item: 'iron_scrap', count: 1, label: 'L' }],
    prerequisites: { quests: [], flags: [], companionTier: null },
    rewards: { loot: [], xp: 0, bond: {}, flags: [] },
    teaching: { concept: 'C', kidPhrase: 'K', memory: 'M' },
  });
  const cloneCampaign = () => CAMPAIGN.map(q => structuredClone(q));

  // ══ 1. Schema: validation accepts the real campaign, rejects breakage ════
  console.log('\nQuests · schema');
  {
    const bad = CAMPAIGN.filter(q => !validateQuest(q).ok)
      .map(q => `${q.id}: ${validateQuest(q).errors.join(', ')}`);
    ok('every campaign quest passes validateQuest', bad.length === 0, bad.join('; '));
    const v = validateCampaign(CAMPAIGN);
    ok('campaign passes validateCampaign', v.ok, v.errors.join('; '));

    const noMemory = goodQuest();
    delete noMemory.teaching.memory;
    const vMem = validateQuest(noMemory);
    ok('quest missing teaching.memory fails',
       !vMem.ok && vMem.errors.some(e => e.includes('teaching.memory')));

    const weird = goodQuest();
    weird.objectives = [{ type: 'WARP_SPEED', label: 'L' }];
    const vType = validateQuest(weird);
    ok('unknown objective type fails',
       !vType.ok && vType.errors.some(e => e.includes('unknown objective type')));

    const dupes = [...cloneCampaign(), structuredClone(byId.get('earl-1'))];
    const vDup = validateCampaign(dupes);
    ok('duplicate quest ids fail campaign validation',
       !vDup.ok && vDup.errors.some(e => e.includes('duplicate quest ids')));

    const cyclic = cloneCampaign();
    cyclic.find(q => q.id === 'earl-1').prerequisites.quests = ['earl-2'];   // earl-2 already needs earl-1
    const vCyc = validateCampaign(cyclic);
    ok('cyclic prerequisites fail (a→b→a)',
       !vCyc.ok && vCyc.errors.some(e => e.includes('prerequisite cycle')));

    const short = cloneCampaign().filter(q => q.id !== 'earl-20');
    const vSize = validateCampaign(short);
    ok('wrong arc size fails',
       !vSize.ok && vSize.errors.some(e => e.includes('arc "earl" has 19 quests, expected 20')));
  }

  // ══ 2. Campaign structure: the 41-quest worldbible shape ═════════════════
  console.log('\nQuests · campaign structure');
  {
    const arcs = {};
    for (const q of CAMPAIGN) arcs[q.arc] = (arcs[q.arc] ?? 0) + 1;
    ok('arc sizes 20 earl + 5+5+5+5 companions + 1 finale',
       JSON.stringify(arcs) === JSON.stringify(ARC_SIZES), JSON.stringify(arcs));

    const ids = CAMPAIGN.map(q => q.id);
    ok('quest ids unique', new Set(ids).size === ids.length);

    let chainOk = (byId.get('earl-1').prerequisites.quests ?? []).length === 0;
    for (let n = 2; n <= 20; n++) {
      const p = byId.get(`earl-${n}`).prerequisites.quests ?? [];
      if (!(p.length === 1 && p[0] === `earl-${n - 1}`)) chainOk = false;
    }
    ok('earl chain is linear (earl-N requires earl-(N-1))', chainOk);

    const missing = [];
    for (const q of CAMPAIGN)
      for (const r of q.prerequisites?.quests ?? []) if (!byId.has(r)) missing.push(`${q.id}→${r}`);
    ok('every prerequisite id exists', missing.length === 0, missing.join(', '));

    ok('finale has NO quest prerequisites (engine gates it)',
       (byId.get(FINALE_ID).prerequisites.quests ?? []).length === 0);

    ok('companion arc affinity matches its arc',
       CAMPAIGN.every(q => q.arc === 'earl' || q.arc === 'finale' || q.affinity === q.arc));

    const badLoot = [];
    for (const q of CAMPAIGN)
      for (const l of q.rewards?.loot ?? []) if (!ITEMS[l.item]) badLoot.push(`${q.id}:${l.item}`);
    ok('loot item ids are real items', badLoot.length === 0, badLoot.join(', '));
  }

  // ══ 3. Tracker: every event-mapped objective counts from its source ══════
  console.log('\nQuests · tracker events');
  {
    // MINE — earl-1 mines 5 iron scrap (poll: achievements stats)
    const tM = mkTracker({ stats: { itemsCollected: { iron_scrap: 5 } } });
    ok('MINE completes via adapter stats', tM.refresh().some(q => q.id === 'earl-1') && tM.isCompleted('earl-1'));
    const tM2 = mkTracker({ stats: { itemsCollected: { iron_scrap: 3 } } });
    const mSt = tM2.objectiveStatus(byId.get('earl-1'), byId.get('earl-1').objectives[0]);
    ok('MINE partial progress reads n/m', !mSt.done && mSt.progress === '3/5', mSt.progress);

    // CRAFT — earl-2 crafts a wrench (poll: the crafted-ever set)
    const tC = mkTracker({ crafted: ['wrench'] });
    complete(tC, 'earl-1');
    ok('CRAFT completes via crafted set', tC.refresh().some(q => q.id === 'earl-2') && tC.isCompleted('earl-2'));

    // LAP count — earl-9 completes 1 lap (tap: lap_complete events)
    const tL = mkTracker();
    complete(tL, ['earl-1', 'earl-2', 'earl-3', 'earl-4', 'earl-5', 'earl-6', 'earl-7', 'earl-8']);
    tL.onEvent('lap_complete');
    ok('LAP count completes via lap_complete events', tL.isCompleted('earl-9'));

    // LAP underSecs — the finale wants a sub-22s lap (gate opened first:
    // the engine only surfaces the finale once FINALE_ARC_GATE arcs are done)
    const fDef = byId.get(FINALE_ID);
    const fLap = fDef.objectives.find(o => o.type === 'LAP' && o.underSecs !== undefined);
    const tF = mkTracker();
    openFinale(tF);
    tF.onEvent('lap_complete', { secs: 25 });
    const slow = tF.objectiveStatus(fDef, fLap).done;
    tF.onEvent('lap_complete', { secs: 20.5 });
    ok('LAP underSecs via event data: 25s no, 20.5s yes',
       !slow && tF.objectiveStatus(fDef, fLap).done);
    const tF2 = mkTracker({ lapBestSecs: 21.4 });
    ok('LAP underSecs via adapter lapBestSecs', tF2.objectiveStatus(fDef, fLap).done);

    // VISIT — earl-11 reaches band3 (tap: enter_band_3)
    const vDef = byId.get('earl-11');
    const vObj = vDef.objectives.find(o => o.type === 'VISIT');
    const tV = mkTracker();
    complete(tV, 'earl-10');
    tV.onEvent('enter_band_3');
    ok('VISIT completes via enter_band_3 event', tV.objectiveStatus(vDef, vObj).done);

    // SPARK_ASK — bolt-1 asks about pwm (tap: spark_ask with question text)
    const bDef = byId.get('bolt-1');
    const sObj = bDef.objectives.find(o => o.type === 'SPARK_ASK');
    const tS = mkTracker({ tiers: { bolt: 'stranger' } });
    complete(tS, 'earl-9');
    tS.onEvent('spark_ask', { text: 'what is for dinner' });
    const offTopic = tS.objectiveStatus(bDef, sObj).done;
    tS.onEvent('spark_ask', { text: 'how do I make the motor speed change' });
    ok('SPARK_ASK alias match: "motor speed" counts as pwm',
       !offTopic && tS.objectiveStatus(bDef, sObj).done);

    // REPAIR — the finale's pit stop (tap: repair_done)
    const fRep = fDef.objectives.find(o => o.type === 'REPAIR');
    const tR = mkTracker();
    openFinale(tR);
    tR.onEvent('repair_done');
    ok('REPAIR completes via repair_done event', tR.objectiveStatus(fDef, fRep).done);

    // EXPERIMENT — juno-4 runs one-knob tests (tap: program_run × 3)
    const tE = mkTracker({ tiers: { juno: 'stranger' } });
    complete(tE, 'juno-3');
    tE.onEvent('program_run');
    tE.onEvent('program_run');
    const twoRuns = tE.isCompleted('juno-4');
    tE.onEvent('program_run');
    ok('EXPERIMENT completes via 3 program_run events', !twoRuns && tE.isCompleted('juno-4'));

    // STAT — earl-8 exports to Wokwi (poll: achievements stats)
    const tSt = mkTracker({ stats: { wokwiExported: 1 } });
    complete(tSt, 'earl-7');
    ok('STAT completes via adapter stats', tSt.refresh().some(q => q.id === 'earl-8'));
  }

  // ══ 4. Prerequisites + the auto companion-tier gate ══════════════════════
  console.log('\nQuests · prerequisites & tiers');
  {
    const t = mkTracker({ tiers: { bolt: 'stranger' } });
    const avail = () => new Set(t.available().map(q => q.id));
    ok('fresh tracker: only earl-1 available (finale gated by the engine)',
       [...avail()].join(',') === 'earl-1' && !avail().has(FINALE_ID), [...avail()].join(','));
    ok('earl-2 locked until earl-1 completes, then included',
       !avail().has('earl-2') && (complete(t, 'earl-1'), avail().has('earl-2')));

    const tB = mkTracker();                          // getTier('bolt') → null: Bolt never met
    complete(tB, 'earl-9');
    ok('bolt arc quest locked before meeting Bolt',
       !new Set(tB.available().map(q => q.id)).has('bolt-1'));
    const tB2 = mkTracker({ tiers: { bolt: 'stranger' } });
    complete(tB2, 'earl-9');
    ok('bolt arc quest available once Bolt is met ("stranger")',
       new Set(tB2.available().map(q => q.id)).has('bolt-1'));
  }

  // ══ 5. Finale gate: FINALE_ARC_GATE completed companion arcs ═════════════
  console.log('\nQuests · finale gate');
  {
    const t = mkTracker();
    ok('no arcs done → finale locked and not even available',
       t.completedArcs().length === 0 && !t.finaleUnlocked(FINALE_ARC_GATE) &&
       !new Set(t.available().map(q => q.id)).has(FINALE_ID));
    complete(t, ['bolt-1', 'bolt-2', 'bolt-3', 'bolt-4', 'bolt-5']);
    ok('one full arc counts, gate still shut',
       JSON.stringify(t.completedArcs()) === '["bolt"]' && !t.finaleUnlocked(FINALE_ARC_GATE));
    complete(t, ['magma-1', 'magma-2', 'magma-3', 'magma-4', 'magma-5']);
    ok('two arcs done unlock the finale (and surface it)',
       JSON.stringify(t.completedArcs()) === '["bolt","magma"]' && t.finaleUnlocked(FINALE_ARC_GATE) &&
       new Set(t.available().map(q => q.id)).has(FINALE_ID));

    // end-to-end: the Midnight Race itself, entirely through events
    const tR = mkTracker();
    openFinale(tR);
    tR.onEvent('lap_complete', { secs: 21 });
    tR.onEvent('repair_done');
    tR.onEvent('spark_ask', { text: 'tell me about the ghost' });
    ok('finale quest completes entirely through events', tR.isCompleted(FINALE_ID));
  }

  // ══ 6. Logbook: completed quests become dated memories ═══════════════════
  console.log('\nQuests · logbook');
  {
    const lb = new Logbook({ storage: mkStorage() });
    const e1 = lb.record(byId.get('earl-1'), { day: 1 });
    const e2 = lb.record(byId.get('earl-2'), { day: 2 });
    ok('record appends in order', lb.entries().map(e => e.questId).join(',') === 'earl-1,earl-2');
    ok('entry carries memory + companion + day',
       e1.memory === byId.get('earl-1').teaching.memory && e1.companion === 'earl' && e1.day === 1 && e2.day === 2);
    ok('recentFirst reverses', lb.recentFirst().map(e => e.questId).join(',') === 'earl-2,earl-1');
    ok('duplicate record is a no-op',
       lb.record(byId.get('earl-1')) === null && lb.count() === 2);

    const tr = lb.transcript();
    ok('transcript contains concepts + the entry-count line',
       tr.includes(e1.concept) && tr.includes('2 entries · 2 distinct concepts met'));

    lb.record({ ...byId.get('earl-1'), id: 'earl-1-again' });   // same teaching.concept
    ok('conceptCount dedupes identical concepts', lb.count() === 3 && lb.conceptCount() === 2);
  }

  // ══ 7. Migration: an old save's Earl chain index → completed quests ══════
  console.log('\nQuests · save migration');
  {
    const t = mkTracker();
    t.migrateEarlIndex(5);
    ok('migrateEarlIndex(5) marks earl-1..5 completed',
       [1, 2, 3, 4, 5].every(n => t.isCompleted(`earl-${n}`)) && !t.isCompleted('earl-6'));

    const tHi = mkTracker();
    const tLo = mkTracker();
    ok('out-of-range indices clamp (99→20, -3→0)',
       tHi.migrateEarlIndex(99) === 20 && tHi.isCompleted('earl-20') &&
       tLo.migrateEarlIndex(-3) === 0 && tLo.completedQuests().length === 0);
  }

  // ══ 8. Persistence: save/load round-trip through injectable storage ══════
  console.log('\nQuests · persistence');
  {
    const st = mkStorage();
    const t = new QuestTracker({ quests: CAMPAIGN, adapter: mkAdapter(), storage: st });
    complete(t, ['earl-1', 'earl-2']);
    t.data.flags.push('met_foreman');
    t.data.progress['earl-9'] = { events: { lap_complete: 1 }, sparks: [], runs: 0 };
    t.save();

    const t2 = new QuestTracker({ quests: CAMPAIGN, adapter: mkAdapter(), storage: st });
    t2.load();
    ok('round-trip restores completed quests, flags, and progress',
       t2.isCompleted('earl-1') && t2.isCompleted('earl-2') &&
       t2.data.flags.includes('met_foreman') &&
       t2.data.progress['earl-9']?.events?.lap_complete === 1);
    ok('loaded tracker resumes the earl chain',
       new Set(t2.available().map(q => q.id)).has('earl-3'));
  }
}
