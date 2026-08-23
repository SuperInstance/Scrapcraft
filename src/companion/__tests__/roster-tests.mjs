/**
 * Companion roster tests — entry points, recruitment, parties, arbitration,
 * state isolation, story identity, voice kits. The replay-value engine.
 *
 * Everything headless: storage/speak/rng injected, zero DOM.
 */

import { CompanionRoster, RECRUIT_RULE } from '../registry.js';
import { CompanionState, BOND_EVENTS, TIERS } from '../state.js';
import { PERSONAS, PERSONA_IDS, getPersona } from '../personas.js';
import { Nudger, PartyNudger, TOPICS, resolveHint, NUDGE_GRACE_S, NUDGE_COOLDOWN_S } from '../nudge.js';
import { recommendCompanion, ENTRY_QUESTIONS, gateDeliveryLine } from '../entry.js';
import { pickCrosstalk, pickObjection, CROSSTALK } from '../party.js';
import { storySummary, storySummaryText, quiltCells } from '../story.js';
import { buildSystemPrompt } from '../converse.js';
import { BANTER as RIVET_BANTER } from '../banter.js';

const mkStore = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _m: m,
  };
};

/** Deterministic rng sequence helper. */
const seqRng = values => { let i = 0; return () => values[i++ % values.length]; };

export async function runRosterTests(ok) {
  // ══ 1. The roster: personas complete, distinct, voice-isolated ═══════════
  console.log('\nRoster · personas');
  {
    ok('four companions in the roster', PERSONA_IDS.join(',') === 'rivet,bolt,magma,juno');
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      ok(`${id}: has a full voice kit`, Boolean(p.banter && p.observations && p.tierUpLines && p.prompt?.who));
      ok(`${id}: has own trait axes (>=3)`, Object.keys(p.traits).length >= 3);
      ok(`${id}: has nudge weights or default order`, p.nudgeWeights === null || typeof p.nudgeWeights === 'object');
      ok(`${id}: has entry-point scores`, Boolean(p.entryPoints) && Object.keys(p.entryPoints).length >= 4);
    }
    // voices are distinct: no two companions share rate+pitch
    const profiles = PERSONA_IDS.map(id => `${getPersona(id).voice.rate}/${getPersona(id).voice.pitch}`);
    ok('all four voice profiles distinct', new Set(profiles).size === 4, profiles.join(' '));
    // pull vectors differ: bolt races, magma builds, juno explores
    ok('bolt pulls racing (race weight > build)', getPersona('bolt').pullVector.race > getPersona('bolt').pullVector.build);
    ok('magma pulls building (build weight > race)', getPersona('magma').pullVector.build > getPersona('magma').pullVector.race);
    ok('juno pulls exploration (explore weight > race)', getPersona('juno').pullVector.explore > getPersona('juno').pullVector.race);
  }

  // ══ 2. Banter quality bar: 60+ lines per companion, tier coverage ════════
  console.log('\nRoster · banter banks');
  {
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      let count = 0;
      const events = new Set();
      let strangerCovered = false;
      for (const [event, bank] of Object.entries(p.banter)) {
        events.add(event);
        for (const l of bank) {
          count++;
          if (l.tier === 0) strangerCovered = true;
        }
      }
      count += p.observations.length + p.tierUpLines.coworker.length + p.tierUpLines.friend.length;
      ok(`${id}: 60+ total voice lines (${count})`, count >= 60, `count=${count}`);
      ok(`${id}: every event bank has a stranger-tier line`, strangerCovered);
      ok(`${id}: reacts to the big events (crash, lap, loot, flash)`,
         ['crash', 'lap_complete', 'rare_loot', 'flash_success'].every(e => p.banter[e]?.length >= 2));
      ok(`${id}: has idle observations (8+)`, p.observations.length >= 8);
      ok(`${id}: tier-up lines for both promotions`,
         p.tierUpLines.coworker.length >= 2 && p.tierUpLines.friend.length >= 2);
    }
    // core event coverage across the whole roster (ghost_beaten included)
    for (const id of ['bolt', 'magma', 'juno']) {
      ok(`${id}: reacts to ghost_beaten`, (getPersona(id).banter.ghost_beaten?.length ?? 0) >= 3);
    }
  }

  // ══ 3. State isolation: a BOLT-run never touches Rivet's friendship ══════
  console.log('\nRoster · state isolation');
  {
    const store = mkStore();
    const roster = new CompanionRoster({ storage: store, speak: () => {} });
    roster.beginRun('bolt');
    roster.greet();
    for (let i = 0; i < 30; i++) roster.observe('block_mined');
    roster.observe('bot_built');

    const bolt = new CompanionState({ personaId: 'bolt', storage: store });
    const rivet = new CompanionState({ personaId: 'rivet', storage: store });
    const juno = new CompanionState({ personaId: 'juno', storage: store });
    ok('bolt state persisted under its own key', bolt.data.bond > 0 && bolt.data.counters.blocksMined === 30);
    ok('rivet friendship untouched by a BOLT-run', rivet.data.bond === 0 && rivet.data.firstMetAt === null);
    ok('juno friendship untouched by a BOLT-run', juno.data.bond === 0);

    // trait drift is per-persona axes
    roster.observe('lap_complete', { secs: '12.0' });
    roster.observe('lap_complete', { secs: '11.0' });
    ok('bolt drifts toward throttle from laps', bolt.topTrait() === 'throttle', `top=${bolt.topTrait()}`);

    // rivet keeps its LEGACY storage key (existing friendships survive)
    const legacy = new CompanionState({ personaId: 'rivet', storage: store });
    legacy.record('block_mined');
    ok('rivet uses the legacy scrapcraft_rivet key', store._m.has('scrapcraft_rivet'));
    ok('rivet does NOT use the generic key', !store._m.has('scrapcraft_companion_rivet'));
  }

  // ══ 4. Entry flow: Earl's two questions deliver the right friend ═════════
  console.log('\nRoster · entry flow');
  {
    ok('two intro questions from Earl', ENTRY_QUESTIONS.length === 2 && ENTRY_QUESTIONS.every(q => q.answers.length >= 4));
    ok('engines+racing delivers Bolt', recommendCompanion('engines', 'race') === 'bolt');
    ok('cranes+building delivers Magma', recommendCompanion('cranes', 'build') === 'magma');
    ok('lights+exploring delivers Juno', recommendCompanion('lights', 'explore') === 'juno');
    ok('cat+helper delivers Rivet', recommendCompanion('cat', 'helper') === 'rivet');
    ok('mixed signals break toward Rivet (the yard default)', recommendCompanion('cat', 'race') === 'rivet');
    ok('no answers → Rivet', recommendCompanion(null, null) === 'rivet');

    // gate delivery lines exist for everyone
    for (const id of PERSONA_IDS) {
      ok(`gate delivery line exists for ${id}`, gateDeliveryLine(id).includes(getPersona(id).name) || gateDeliveryLine(id).length > 40);
    }

    // beginRun locks the story identity
    const store = mkStore();
    const r = new CompanionRoster({ storage: store, speak: () => {} });
    ok('new roster needs an entry choice', r.needsEntryChoice === true);
    const starter = r.beginRun('juno');
    ok('starter is juno, active is juno', r.startedWith === 'juno' && r.activeId === 'juno' && starter.id === 'juno');
    ok('entry choice persisted (no second gate)', new CompanionRoster({ storage: store, speak: () => {} }).needsEntryChoice === false);

    // story pull is real: JUNO's first nudge is exploration-flavored
    const junoNudger = new Nudger({ state: starter.state, weights: starter.persona.nudgeWeights, personaId: 'juno', rng: seqRng([0.5]) });
    starter.state.markNudgeDone('mine_iron');
    starter.state.markNudgeDone('build_first_bot');
    starter.state.markNudgeDone('program_bot');
    const cands = junoNudger.candidates();
    const top = cands.sort((a, b) => b.weight - a.weight)[0];
    ok('juno\u2019s top-priority candidates are the exploration pulls',
       ['explore_city', 'ask_spark_question'].includes(top?.topic.id), `top=${top?.topic.id}`);
  }

  // ══ 5. Recruitment gating: FRIEND tier unlocks Earl's pairing moment ═════
  console.log('\nRoster · recruitment');
  {
    const store = mkStore();
    const r = new CompanionRoster({ storage: store, speak: () => {} });
    r.beginRun('bolt');

    ok('nothing recruitable before FRIEND', r.recruitableIds().length === 0);
    ok('recruit blocked before FRIEND (with the rule)', r.recruit('magma').ok === false && r.recruit('magma').reason === RECRUIT_RULE);
    ok('party starts at 1 (just the starter)', r.partyIds.length === 1);

    // grow bolt to FRIEND with real events only
    while (r.active.state.tier !== 'friend') r.observe('block_mined');

    // friend reached → Earl's moment fires automatically: the roster
    // recruited the first recruitable (rivet, registry order) on the spot
    ok('friend tier auto-recruited the next companion', r.data.recruited.length === 1 && r.partyIds.length === 2);
    const recruitable = r.recruitableIds();
    ok('remaining companions still recruitable', recruitable.length === 2 && recruitable.includes('magma') && recruitable.includes('juno'));

    // party of 2 is the cap until a SECOND companion hits friend
    ok('party capped at 2 with one friend', r.maxPartySize() === 2);
    ok('recruit over cap is refused with a grow hint', r.recruit('magma').ok === false && /full/.test(r.recruit('magma').reason));

    // second friend (the recruited rivet, grown directly) unlocks party of 3
    const rivetC = r.get('rivet');
    while (rivetC.state.tier !== 'friend') rivetC.observe('bot_built');
    ok('maxPartySize grows to 3 with two friends', r.maxPartySize() === 3);
    const res = r.recruit('magma');
    ok('third crew member joins at high progress', res.ok === true && r.partyIds.length === 3);

    ok('cannot recruit the starter', r.recruit(r.startedWith).ok === false);
    ok('cannot recruit someone already in', r.recruit('magma').ok === false);
    ok('fresh roster caps at 2', (() => { const r2 = new CompanionRoster({ storage: mkStore(), speak: () => {} }); r2.beginRun('rivet'); return r2.maxPartySize() === 2; })());
  }

  // ══ 6. Swap: the facade follows the active companion ═════════════════════
  console.log('\nRoster · swap + facade');
  {
    const store = mkStore();
    const lines = [];
    const r = new CompanionRoster({ storage: store, speak: (c, t) => lines.push(`${c.id}: ${t}`) });
    r.beginRun('rivet');
    while (r.active.state.tier !== 'friend') r.observe('bot_built');
    // auto-recruit landed someone
    const nextId = r.data.recruited[0];
    ok('auto-recruit happened at friend tier', Boolean(nextId));

    ok('swap to a crew member works', r.setActive(nextId) === true && r.activeId === nextId);
    ok('swap to a stranger fails', r.setActive('juno') === false || r.data.recruited.includes('juno'));
    r.say('testing the facade');
    ok('facade say() routes through the ACTIVE companion', lines.some(l => l.startsWith(`${nextId}: `)));

    // facade proxies state + mood safely
    ok('facade state is the active companion\u2019s state', r.state === r.active.state);
    ok('facade talking starts false', r.talking === false);
  }

  // ══ 7. Party crosstalk: the delight engine ═══════════════════════════════
  console.log('\nRoster · crosstalk');
  {
    ok('20+ crosstalk exchanges in the bank',
       Object.values(CROSSTALK).reduce((n, bank) => n + bank.length, 0) >= 20);
    ok('every companion has crosstalk', PERSONA_IDS.every(id => CROSSTALK[id]?.length >= 3));

    // event-keyed selection: bolt on lap_complete is telemetry-flavored
    const lapLine = pickCrosstalk('bolt', 'lap_complete', () => 0);
    ok('bolt\u2019s lap crosstalk is the timed line', /\d|lap|s\./i.test(lapLine ?? '') || (lapLine ?? '').includes('{secs}'));
    const filler = pickCrosstalk('bolt', 'some_event', () => 0);
    ok('unknown events fall to evergreen lines', Boolean(filler));
    ok('unknown persona has no crosstalk (null)', pickCrosstalk('nobody', 'lap_complete') === null);

    // objections exist for everyone (nudge arbitration heckling)
    ok('every companion can object during arbitration', PERSONA_IDS.every(id => Boolean(pickObjection(id, () => 0))));

    // live: party members actually chime in (rng forced to always-chatter)
    const store = mkStore();
    const spoken = [];
    const r = new CompanionRoster({ storage: store, rng: seqRng([0.01]), speak: (c, t) => spoken.push(`${c.id}: ${t}`) });
    r.beginRun('rivet');
    while (r.active.state.tier !== 'friend') r.observe('bot_built');
    const other = r.data.recruited[0];
    // force the crosstalk clock forward via update ticks, then observe a loud event
    for (let i = 0; i < 400; i++) r.update(0.5, { locked: true, moving: false, midFlow: true });
    spoken.length = 0;
    r.observe('crash_survived', { note: 'test' });
    const chatter = spoken.filter(l => l.startsWith(`${other}:`));
    ok('inactive party member chimed in on the crash', chatter.length >= 1, spoken.join(' | '));
  }

  // ══ 8. Nudge arbitration: they argue, the insistent voice wins ═══════════
  console.log('\nRoster · nudge arbitration');
  {
    // two members, opposite weights, shared clock
    const boltState = new CompanionState({ personaId: 'bolt', storage: null });
    const magmaState = new CompanionState({ personaId: 'magma', storage: null });
    for (const st of [boltState, magmaState]) {
      st.markNudgeDone('mine_iron'); st.markNudgeDone('build_first_bot'); st.markNudgeDone('program_bot');
      st.data.counters.programsRun = 2;   // lap + flash hints are live candidates
    }
    const boltN = new Nudger({ state: boltState, weights: getPersona('bolt').nudgeWeights, personaId: 'bolt', rng: () => 0.5 });
    const magmaN = new Nudger({ state: magmaState, weights: getPersona('magma').nudgeWeights, personaId: 'magma', rng: () => 0.5 });
    const party = new PartyNudger({ members: [{ id: 'bolt', nudger: boltN }, { id: 'magma', nudger: magmaN }], rng: () => 0.1 });

    ok('party respects the grace period', party.tick(NUDGE_GRACE_S - 0.5, {}) === null);
    const n1 = party.tick(1, {}); // crosses grace
    ok('party nudge fires after grace', Boolean(n1));
    ok('bolt won the argument (race beats build at equal jitter)', n1.id === 'bolt' && n1.topic === 'race_lap', JSON.stringify(n1 && { id: n1.id, topic: n1.topic }));
    ok('magma objected first — the argument is the content', Boolean(n1.objection) && n1.objection.id === 'magma');

    ok('global cooldown applies to the whole party', party.tick(NUDGE_COOLDOWN_S - 1, {}) === null);
    const n2 = party.tick(NUDGE_COOLDOWN_S, {});
    ok('after cooldown the next voice fires (magma\u2019s build)', Boolean(n2) && n2.id === 'magma', JSON.stringify(n2 && { id: n2.id, topic: n2.topic }));

    // crash suppression is party-wide
    party.noteCrash();
    ok('crash suppresses the whole party', party.tick(30, {}) === null);

    // hint resolution: same topic, three souls
    const data = { counters: { blocksMined: 0 }, biomes: [] };
    const hints = ['bolt', 'magma', 'juno'].map(id => resolveHint(TOPICS.find(t => t.id === 'mine_iron'), data, id));
    ok('same topic, different voices (all non-null, all distinct)',
       hints.every(Boolean) && new Set(hints).size === 3);

    // story pull proven: BOLT-run nudge order puts racing first
    const boltSolo = new Nudger({ state: boltState, weights: getPersona('bolt').nudgeWeights, personaId: 'bolt', rng: () => 0.99 });
    boltState.markNudgeDone('race_lap'); boltState.data.counters.laps = 1;
    const win = boltSolo.candidates().sort((a, b) => b.score - a.score)[0];
    ok('bolt\u2019s own candidates put the oval on top', ['race_lap', 'beat_a_ghost'].includes(win?.topic.id), win?.topic.id);
  }

  // ══ 9. Story identity: same yard, different journeys ═════════════════════
  console.log('\nRoster · story identity');
  {
    const store = mkStore();
    const r = new CompanionRoster({ storage: store, speak: () => {} });
    r.beginRun('bolt');
    r.observe('block_mined');
    const sum = storySummary(r);
    ok('summary records the starter as story identity', sum.starter === 'bolt' && sum.active === 'bolt');
    ok('summary carries tier + bond + drift', sum.tier === 'stranger' && sum.bond > 0 && typeof sum.driftLabel === 'string');
    ok('firsts tracked (lap not yet done)', sum.firsts.some(f => f.key === 'laps' && !f.done));

    const text = storySummaryText(r);
    ok('summary text names the run and the pull', text.includes('bolt') && text.includes('RACING'));

    const cells = quiltCells(r);
    ok('quilt cells: active + starter + tier + bond + drift + party',
       cells.active === 'bolt' && cells.starter === 'bolt' && cells.tier === 'stranger' && cells.bond > 0 && cells.party === 1);

    // a different starter produces a different journey record
    const r2 = new CompanionRoster({ storage: mkStore(), speak: () => {} });
    r2.beginRun('juno');
    r2.observe('biome_first', { name: 'Circuit City' });
    ok('JUNO-run summary differs from BOLT-run summary', storySummaryText(r2) !== text);
  }

  // ══ 10. Converse: persona prompts + canned banks ═════════════════════════
  console.log('\nRoster · converse personas');
  {
    for (const id of ['bolt', 'magma', 'juno']) {
      const p = getPersona(id);
      const st = new CompanionState({ personaId: id, storage: null });
      const prompt = buildSystemPrompt(st, p);
      ok(`${id}: prompt carries the persona block`, prompt.includes(p.prompt.who.slice(0, 20)));
      ok(`${id}: canned bank present (5+)`, (p.canned ?? []).length >= 5);
    }
    ok('rivet prompt unchanged in spirit (peer, not teacher)',
       buildSystemPrompt({ tier: 'stranger' }, getPersona('rivet')).includes('peer and sidekick'));
  }

  // ══ 11. Quilt: the companions channel ════════════════════════════════════
  console.log('\nRoster · quilt companions channel');
  {
    const { QuiltSheet, CELLS, CELL_IDS } = await import('../../maker/QuiltSheet.js');
    const qs = new QuiltSheet();
    const compIds = ['comp.active', 'comp.started', 'comp.tier', 'comp.bond', 'comp.drift', 'comp.party'];
    ok('companions channel cells registered', compIds.every(id => CELL_IDS.includes(id)));
    ok('companions cells carry the teaching layer (group+label+description+emoji)',
       CELLS.filter(c => c.group === 'companions').every(c => c.label && c.description && c.emoji));

    qs.update({ companions: { active: 'juno', starter: 'juno', tier: 'coworker', bond: 44, drift: 'Curiosity', party: 2 } });
    ok('active companion lands in the sheet', qs.cells['comp.active'].v === 'juno');
    ok('tier + drift land in the sheet', qs.cells['comp.tier'].v === 'coworker' && qs.cells['comp.drift'].v === 'Curiosity');
    ok('first write flashes the cell', qs.cells['comp.active'].ch === true);

    qs.update({ companions: { active: 'juno', starter: 'juno', tier: 'coworker', bond: 44, drift: 'Curiosity', party: 2 } });
    ok('unchanged companions cells do NOT flash', qs.cells['comp.active'].ch === false);
  }

  // ══ 12. Bond economy: ghost + spark events pay, tiers unchanged ═════════
  console.log('\nRoster · bond economy');
  {
    ok('ghost_beaten pays 10', BOND_EVENTS.ghost_beaten === 10);
    ok('spark_consult pays 4', BOND_EVENTS.spark_consult === 4);
    const st = new CompanionState({ personaId: 'juno', storage: null });
    st.record('ghost_beaten', { name: 'Rustbucket Ray' });
    ok('ghost counter + biome tracking works', st.data.counters.ghostsBeaten === 1);
    ok('tiers unchanged from Rivet\u2019s economy', TIERS.join('>') === 'stranger>coworker>friend');
  }
}
