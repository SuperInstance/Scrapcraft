/**
 * Quest framework tests — schema validation, campaign structure, the event
 * tracker, finale gating, the logbook, Earl-save migration, persistence.
 *
 * Exported as a function so run-tests.mjs can fold it into the one harness.
 * Everything headless: the state adapter + storage are injected fakes, no
 * DOM, no game imports.
 */

import { validateQuest, validateCampaign, validateSpine, ARC_SIZES, FINALE_ARC_GATE, SPINE_CHAPTERS, SPINE_ACT_LAYOUT, SPINE_BAND_NAMES } from '../schema.js';
import { QuestTracker } from '../Tracker.js';
import { Logbook } from '../Logbook.js';
import { CAMPAIGN, SPINE } from '../data/index.js';
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

  // ══ 2. Campaign structure: the 63-quest worldbible shape ═════════════════
  console.log('\nQuests · campaign structure');
  {
    const arcs = {};
    for (const q of CAMPAIGN) arcs[q.arc] = (arcs[q.arc] ?? 0) + 1;
    ok('arc sizes: 20 earl + 4×5 companions + 1 finale + 9 chapter + 14 side + 1 yard',
       JSON.stringify(arcs) === JSON.stringify(ARC_SIZES), JSON.stringify(arcs));
    ok('campaign is 65 quests', CAMPAIGN.length === 65, String(CAMPAIGN.length));

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

    ok('arc affinity matches (side quests carry their persona; chapter/yard carry their own arc)',
       CAMPAIGN.every(q =>
         q.arc === 'side' ? ['bolt', 'magma', 'juno', 'rivet'].includes(q.affinity)
         : q.arc === 'earl' || q.arc === 'finale' ? true
         : q.affinity === q.arc));

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

  // ══ 9. The Spine: the twelve-chapter chapter map over the campaign ═══════
  console.log('\nQuests · spine');
  {
    const v = validateSpine({ chapters: SPINE }, CAMPAIGN);
    ok('spine passes validateSpine', v.ok, v.errors.join('; '));

    // the task's three smoke assertions, explicit:
    ok(`spine has exactly ${SPINE_CHAPTERS} chapters`, SPINE.length === SPINE_CHAPTERS);

    const byId = new Map(CAMPAIGN.map(q => [q.id, q]));
    const refs = SPINE.flatMap(c => c.quests);
    ok('every referenced quest id exists in the campaign',
       refs.every(id => byId.has(id)), refs.filter(id => !byId.has(id)).join(', '));

    const bands = SPINE.map(c => c.unlockBand);
    ok('unlock bands are monotonic (bands never re-lock)',
       bands.every((b, i) => i === 0 || b >= bands[i - 1]), bands.join(','));

    // structural: bible act layout, the earl chain fully regrouped, finale closes ch12
    ok(`acts follow the bible's headers (${SPINE_ACT_LAYOUT.join(',')})`,
       SPINE.every((c, i) => c.act === SPINE_ACT_LAYOUT[i]));
    const earlRefs = refs.filter(id => id.startsWith('earl-'));
    const uniqueEarl = new Set(earlRefs);
    ok('all 20 earl-quests carry exactly one chapter each',
       earlRefs.length === 20 && uniqueEarl.size === 20,
       `referenced ${earlRefs.length}/${new Set(CAMPAIGN.filter(q => q.arc === 'earl').map(q => q.id)).size}, dupes: ${earlRefs.filter(id => earlRefs.indexOf(id) !== earlRefs.lastIndexOf(id)).join(',')}`);
    ok('the Midnight Race closes the spine',
       SPINE.at(-1).quests.includes('finale-midnight-race') &&
       SPINE.slice(0, -1).every(c => !c.quests.includes('finale-midnight-race')));

    // no quest carries two chapters (one chapter each, per schema)
    const dupes = refs.filter((id, i) => refs.indexOf(id) !== i);
    ok('no quest carries two chapters', dupes.length === 0, dupes.join(', '));

    // band names ride the world's own vocabulary (World.js BANDS / yard-bible)
    ok('band names match the world bands',
       SPINE.every(c => SPINE_BAND_NAMES[c.band] === c.bandName));

    // negative control: a spine that re-locks the yard must fail
    const broken = structuredClone(SPINE);
    broken[5].unlockBand = 1; // ch06 tries to re-lock Circuit City+
    ok('validateSpine rejects band re-locking', !validateSpine({ chapters: broken }, CAMPAIGN).ok);
    const ghost = structuredClone(SPINE);
    ghost[3].quests = ['earl-1', 'no-such-quest']; // stale reference
    ok('validateSpine rejects stale quest references', !validateSpine({ chapters: ghost }, CAMPAIGN).ok);
  }

  // ══ 10. Earl-chain rot regression: the fetch-middle tells the truth ══════
  console.log('\nQuests · earl rot regression');
  {
    const q = id => byId.get(id);
    // earl-17: radar dish is unlockAfter r_antenna — the quest must make the
    // player wind the antenna first or the recipe never unlocks (was: "the
    // antenna you already made" — no such step existed anywhere)
    ok('earl-17 crafts the antenna before the radar dish',
       q('earl-17').objectives.some(o => o.type === 'CRAFT' && o.item === 'antenna') &&
       q('earl-17').objectives.some(o => o.type === 'CRAFT' && o.item === 'radar_dish'));
    // earl-11: mining crystal ore counts via the crystalMined stat — the old
    // objective asked for crystal_fragment, which crystal ore never drops
    // (it assays as glass: drop glass_shard ×3, per the yard bible's lore)
    ok('earl-11 counts crystal ORE mined (ore drops glass, not fragments)',
       q('earl-11').objectives.some(o => o.type === 'MINE' && o.item === 'crystal_ore'));
    // earl-15: the solar panel is a forge recipe — the brief used to say workbench
    ok('earl-15 brief routes to the forge', /forge/.test(q('earl-15').brief) && !/workbench/.test(q('earl-15').brief));
    // earl-12: full bill of materials + the G-key path (hold item, then use)
    ok('earl-12 brief carries the full bill of materials',
       /iron scrap/.test(q('earl-12').brief) && /hold/i.test(q('earl-12').brief));
  }

  // ══ 9. The depth cut: chapter B-sides, friend-gated sides, the yard hook ═
  console.log('\nQuests · depth arcs (ch7–9, sides, second-arc hook)');
  {
    const avail = (t, id) => t.available().some(x => x.id === id);

    // chapter quests: Earl's, no companion gate — surface when the chapter's
    // opener carrier completes (B-side doctrine: available, never blocking)
    {
      const t = mkTracker();
      ok('ch7-1 hidden before the ch7 opener (earl-8)', !avail(t, 'ch7-1'));
      complete(t, 'earl-8');
      ok('ch7-1 surfaces once earl-8 is walked — no companion needed', avail(t, 'ch7-1'));
      ok('ch7-2 chains behind ch7-1', !avail(t, 'ch7-2'));
      complete(t, 'ch7-1');
      ok('ch7-2 follows the chain', avail(t, 'ch7-2'));
    }
    // ch8 rides juno-2, ch9 rides earl-12 — same pattern, different openers
    {
      const t = mkTracker();
      complete(t, ['juno-2', 'ch8-1', 'ch8-2']);
      ok('ch8 arc chains off juno-2 (walked beats free the next; ch9 stays shut)',
         avail(t, 'ch8-3') && !avail(t, 'ch9-1'));
    }

    // side quests: earned at friend tier only (tier 3 of 3) — fail-soft hidden
    for (const p of ['bolt', 'magma', 'juno', 'rivet']) {
      const t0 = mkTracker({ tiers: { [p]: 'stranger' } });
      const t1 = mkTracker({ tiers: { [p]: 'coworker' } });
      ok(`${p}-side-1 hidden below friend (fail-soft)`,
         !avail(t0, `${p}-side-1`) && !avail(t1, `${p}-side-1`));
      const t2 = mkTracker({ tiers: { [p]: 'friend' } });
      complete(t2, `${p}-5`);   // the persona's own arc, walked
      ok(`${p}-side-1 surfaces at friend, after the arc`, avail(t2, `${p}-side-1`));
      ok(`${p}-side-2 chains behind side-1`, !avail(t2, `${p}-side-2`));
      complete(t2, `${p}-side-1`);
      ok(`${p}-side-2 follows`, avail(t2, `${p}-side-2`));
    }
    // beat 3 cracks the persona open — the flag lands with the confession
    {
      const rivet3 = byId.get('rivet-side-3');
      ok('beat-3 quests grant the <persona>_opened flag',
         ['bolt', 'magma', 'juno', 'rivet'].every(p =>
           (byId.get(`${p}-side-3`).rewards?.flags ?? []).includes(`${p}_opened`)));
    }

    // the second-arc hook: yard-1 appears exactly when ch9 is complete
    {
      const t = mkTracker();
      ok('yard-1 hidden before ch9 carriers', !avail(t, 'yard-1'));
      complete(t, 'earl-12');
      ok('yard-1 still hidden after one ch9 carrier', !avail(t, 'yard-1'));
      complete(t, 'bolt-3');
      ok('yard-1 surfaces once ch9 is walked (both carriers)', avail(t, 'yard-1'));
      ok('yard-1 grants the yard_knows_you flag',
         (byId.get('yard-1').rewards?.flags ?? []).includes('yard_knows_you'));
    }

    // the hook never touches the finale gate or the arc math
    {
      const t = mkTracker();
      complete(t, ['earl-12', 'bolt-3', 'yard-1',
        'ch7-1', 'ch7-2', 'ch7-3', 'ch8-1', 'ch8-2', 'ch8-3', 'ch9-1', 'ch9-2', 'ch9-3',
        'bolt-side-1', 'bolt-side-2', 'bolt-side-3']);
      ok('depth arcs never count toward the finale arc gate', t.completedArcs().length === 0);
    }
  }
}
