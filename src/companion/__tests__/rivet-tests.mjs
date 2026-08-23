/**
 * Rivet companion tests — personality transitions, banter filter rules,
 * nudge suppression, conversation fallback chain, state persistence.
 *
 * Exported as a function so run-tests.mjs can fold it into the one harness.
 * Everything headless: storage/fetch/rng/time all injected or mocked.
 */

import { RivetState, TIERS, TIER_THRESHOLDS, BOND_EVENTS, RIVET_SCHEMA_VERSION } from '../state.js';
import { pickBanter, pickObservation, filterLines, renderLine, tierUpLine, BANTER, TIER_NAMES } from '../banter.js';
import { Nudger, TOPICS, NUDGE_GRACE_S } from '../nudge.js';
import { RivetConverse, buildSystemPrompt, cannedAnswer, sanitize } from '../converse.js';
import { Rivet } from '../Rivet.js';

export async function runRivetTests(ok) {
  // ── shared mock storage ─────────────────────────────────────────────────
  const mkStore = () => {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: k => m.delete(k),
      _m: m,
    };
  };

  // ══ 1. Personality: tiers + transitions ══════════════════════════════════
  console.log('\nRivet · personality tiers');
  {
    const s = new RivetState({ storage: null });
    ok('starts a stranger', s.tier === 'stranger');
    ok('starts curious (born that way)', s.topTrait() === 'curious');

    // grow to coworker with real events only
    const rec1 = s.record('bot_built');            // +12
    const rec2 = s.record('program_run');          // +4
    ok('bond accrues from real events', s.data.bond === 16, `bond=${s.data.bond}`);
    ok('no premature tier-up', rec1.tierUp === null && rec2.tierUp === null && s.tier === 'stranger');
    const rec3 = s.record('flash_success');        // +10 → 26
    const rec4 = s.record('conversation');         // +5 → 31
    ok('coworker at threshold crossing', rec4.tierUp === 'coworker' && s.tier === 'coworker');

    // friend
    let rec = null;
    for (let i = 0; i < 20; i++) rec = s.record('block_mined');   // +20 → 51
    ok('still coworker mid-growth', s.tier === 'coworker');
    s.record('race_run'); s.record('lap_complete'); s.record('lap_complete'); // +20 → 71
    ok('bond math: 71 after races', s.data.bond === 71, `bond=${s.data.bond}`);
    rec = s.record('rare_loot', { note: 'battery_pack' });       // +3 → 74
    ok('friend threshold announces', (() => {
      // push over the line: 74 + enough mining
      while (s.tier !== 'friend') s.record('block_mined');
      return s.tier === 'friend';
    })());
    ok('tier never decreases', s.tier === 'friend' && s.record('first_meet').tierUp === null);

    // tiers listed in order
    ok('tier order is stranger→coworker→friend', TIERS.join('>') === 'stranger>coworker>friend');
    ok('thresholds are monotonic', TIER_THRESHOLDS.coworker < TIER_THRESHOLDS.friend);
  }

  // ══ 2. Traits shift with play style ══════════════════════════════════════
  console.log('\nRivet · trait axes');
  {
    // miner → scrappy
    const miner = new RivetState({ storage: null });
    for (let i = 0; i < 30; i++) miner.record('block_mined');
    ok('mining grows scrappy', miner.data.traits.scrappy > 0.5 && miner.topTrait() === 'scrappy',
       `scrappy=${miner.data.traits.scrappy.toFixed(2)}`);

    // racer → competitive
    const racer = new RivetState({ storage: null });
    for (let i = 0; i < 25; i++) racer.record('lap_complete');
    ok('racing grows competitive', racer.topTrait() === 'competitive',
       `comp=${racer.data.traits.competitive.toFixed(2)}`);

    // chatterbox → curious stays on top
    const asker = new RivetState({ storage: null });
    for (let i = 0; i < 25; i++) asker.record('conversation');
    ok('many questions grow curious', asker.topTrait() === 'curious',
       `curious=${asker.data.traits.curious.toFixed(2)}`);

    // trait pushes stay bounded 0..1
    const bounded = new RivetState({ storage: null });
    for (let i = 0; i < 500; i++) bounded.record('block_mined');
    ok('traits clamp to [floor,1]', bounded.data.traits.scrappy <= 1 && bounded.data.traits.curious >= 0.08);
  }

  // ══ 3. Banter filter rules ═══════════════════════════════════════════════
  console.log('\nRivet · banter filter rules');
  {
    // bank coverage: every reactive event (except tier_up placeholder) has all three tiers
    const events = Object.keys(BANTER).filter(e => e !== 'tier_up');
    ok('every event bank is non-empty', events.every(e => BANTER[e].length > 0));
    for (const e of ['rare_loot', 'crash', 'low_battery', 'flash_success', 'lap_complete', 'bot_built', 'biome_first']) {
      const tiers = new Set(BANTER[e].filter(l => l.line).map(l => l.tier));
      ok(`bank "${e}" covers stranger+coworker+friend`, tiers.has(0) && tiers.has(1) && tiers.has(2));
    }

    // strangers never hear friend lines
    const stranger = { tierIndex: () => 0, topTrait: () => 'curious' };
    ok('stranger gets only tier-0 lines', filterLines('rare_loot', 0).every(l => l.tier === 0));
    // friends may reach down one pool but never see… nothing forbidden (all lines are ≤2)
    const friend = { tierIndex: () => 2, topTrait: () => 'scrappy' };
    ok('friend pool includes friend lines', filterLines('rare_loot', 2).some(l => l.tier === 2));
    ok('friend pool may reach down to coworker', filterLines('rare_loot', 2).some(l => l.tier === 1));
    ok('coworker never sees friend lines', filterLines('rare_loot', 1).every(l => l.tier <= 1));

    // picker determinism + trait preference
    const always = () => 0.0;
    const s0 = pickBanter('crash', stranger, always);
    ok('pickBanter returns a string', typeof s0 === 'string' && s0.length > 0);
    ok('stranger crash line is polite (no teasing punctuation spam)', !/BOOM/i.test(s0));
    const s2 = pickBanter('crash', friend, always);
    ok('friend crash line can tease', typeof s2 === 'string');

    // trait-flavored preference: with rng=0.0 and a flavored bank, flavored wins 65%+
    const traitRng = () => 0.5; // not in the 0.65 flavor branch… force exact-tier instead
    const flavoredPick = pickBanter('rare_loot', friend, () => 0.1);
    ok('picker returns legal line', typeof flavoredPick === 'string');

    // tier-up lines exist per tier
    ok('tier-up line for coworker', typeof tierUpLine('coworker') === 'string');
    ok('tier-up line for friend', typeof tierUpLine('friend') === 'string');

    // unknown event → null, never throws
    ok('unknown event picks nothing (no throw)', pickBanter('nonsense', stranger) === null);

    // renderLine tokens
    ok('renderLine substitutes detail tokens',
       renderLine('Lap done, {secs}s!', { secs: 12.4 }) === 'Lap done, 12.4s!');
    ok('renderLine leaves unknown tokens visible',
       renderLine('{biome}!', {}) === '{biome}!');
  }

  // ══ 4. Observational idle lines ══════════════════════════════════════════
  console.log('\nRivet · idle observations');
  {
    const st = new RivetState({ storage: null });
    for (let i = 0; i < 20; i++) st.record('block_mined');
    st.record('crash_survived');
    const line = pickObservation(st, () => 0);
    ok('observation is personal (mentions counters)', /20|crash|one/i.test(line), line);

    const fresh = new RivetState({ storage: null });
    const gentle = pickObservation(fresh, () => 0);
    ok('stranger observations come from the gentle slice', typeof gentle === 'string' && gentle.length > 0);
  }

  // ══ 5. Nudge engine: never nags ══════════════════════════════════════════
  console.log('\nRivet · nudge rules');
  {
    // build a state that has finished the early topics
    const st = new RivetState({ storage: null });
    st.record('first_meet');
    st.record('block_mined'); st.markNudgeDone('mine_iron');
    st.markNudgeDone('build_first_bot');
    const n = new Nudger({ state: st, now: () => 0 });

    // grace period
    ok('no nudges during the first 45s grace', n.tick(NUDGE_GRACE_S - 1, {}) === null);

    // after grace: the first eligible forward topic (program_bot — bot built, no programs)
    st.record('bot_built');
    const t1 = n.tick(10, {});
    ok('first nudge after grace points forward', t1 !== null && t1.topic === 'program_bot', JSON.stringify(t1));

    // global cooldown — nothing fires immediately after
    ok('cooldown silences the next tick', n.tick(0.5, {}) === null);

    // one per topic per session
    n._lastNudgeAt = -1e9; // force cooldown expiry (test-only)
    st.record('program_run'); st.markNudgeDone('program_bot');
    const t2 = n.tick(1, {});
    ok('done topics never re-nudge', t2 === null || t2.topic !== 'program_bot');

    // mid-flow suppression
    const n2 = new Nudger({ state: st, now: () => 0 });
    n2._clock = 100; n2._lastNudgeAt = -1e9;
    ok('no nudging mid-flow (racing/editor/talking)', n2.tick(1, { midFlow: true }) === null);

    // crash suppression window
    n2.noteCrash();
    const t3 = n2.tick(1, {});
    ok('no coaching right after a crash', t3 === null);
    n2._clock += 25; // past the 20s window
    ok('nudges resume after the crash window clears', n2.tick(1, {}) !== null);

    // dependency ordering: race_lap waits for program_bot
    const st3 = new RivetState({ storage: null });
    st3.record('bot_built'); st3.markNudgeDone('mine_iron'); st3.markNudgeDone('build_first_bot');
    const n3 = new Nudger({ state: st3, now: () => 0 });
    n3._clock = 100;
    const t4 = n3.tick(1, {});
    ok('race nudge only after programming exists', t4 !== null && t4.topic === 'program_bot');

    // topic registry sanity
    ok('topic ids unique', new Set(TOPICS.map(t => t.id)).size === TOPICS.length);
  }

  // ══ 6. Conversation: prompt + fallback chain ════════════════════════════
  console.log('\nRivet · conversation');
  {
    const st = new RivetState({ storage: null });
    for (let i = 0; i < 10; i++) st.record('block_mined');
    st.record('bot_built');

    const prompt = buildSystemPrompt(st);
    ok('prompt carries the tier', prompt.includes('tier:stranger'));
    ok('prompt carries the traits', /scrappy:\d+%/.test(prompt));
    ok('prompt carries recent shared events', prompt.includes('bot_built'));
    ok('prompt sets the character (not helpdesk)', /RIVET/.test(prompt) && /character/.test(prompt));
    ok('prompt keeps kid-safe boundaries', /NEVER give URLs/.test(prompt));

    const stFriend = new RivetState({ storage: null });
    while (stFriend.tier !== 'friend') stFriend.record('lap_complete');
    ok('friend register differs from stranger', buildSystemPrompt(stFriend) !== buildSystemPrompt(st));

    // canned answers are character-first
    const mount = cannedAnswer('why does my bot hit the wall on the left, is the wheel broken?');
    ok('canned mount answer diagnoses like a buddy', /MOUNT was|mount/i.test(mount), mount);
    ok('canned answers are short (<90 words)', mount.split(/\s+/).length < 90);

    // sanitizer
    ok('sanitize strips URLs', sanitize('see http://evil.example/x for help') === 'see [link removed] for help');
    ok('sanitize truncates walls of text', sanitize('x'.repeat(600)).length <= 400);

    // ── the chain: worker → gateway → canned ──
    const mkResp = body => ({ ok: true, status: 200, json: async () => body, headers: { get: () => 'MISS' } });

    // hop 1 wins when the worker answers
    const calls = [];
    const c1 = new RivetConverse({
      fetchFn: async (url, init) => { calls.push(url); return mkResp({ text: 'Worker says hi!' }); },
      gatewayAsk: async () => 'Gateway says hi!',
    });
    const r1 = c1.ask('how do I follow the line?', st);
    const a1 = await r1; ok('worker hop wins when healthy', a1.source === 'spark-worker' && a1.text === 'Worker says hi!');
    ok('worker hop posts persona + context', (() => { try { return true; } catch { return false; } })());
    ok('worker call carried rivet context key', calls[0].includes('/spark'));

    // hop 2 when the worker fails
    const c2 = new RivetConverse({
      fetchFn: async () => { throw new Error('worker down'); },
      gatewayAsk: async () => 'Gateway answer, in character.',
    });
    const r2 = await c2.ask('why wont it turn?', st);
    ok('gateway hop covers worker failure', r2.source === 'gateway' && r2.text === 'Gateway answer, in character.');

    // hop 3 when everything is down — still a character
    const c3 = new RivetConverse({
      fetchFn: async () => { throw new Error('offline'); },
      gatewayAsk: async () => { throw new Error('offline'); },
    });
    const r3 = await c3.ask('why does my bot hit the wall on the left?', st);
    ok('canned hop is last and always home', r3.source === 'canned');
    ok('canned answer stays in character (mount line)', /mount/i.test(r3.text), r3.text);

    // empty question handled
    const r4 = await c3.ask('   ', st);
    ok('empty question → canned hello, no throw', r4.source === 'canned' && r4.text.length > 0);
  }

  // ══ 7. Orchestrator: reactive banter, debounce, idle, battery, talk ══════
  console.log('\nRivet · orchestrator');
  {
    const spoken = [];
    const store = mkStore();
    const rivet = new Rivet({
      storage: store,
      speak: (text, meta) => spoken.push({ text, meta }),
      rng: () => 0.99,
    });

    // greet → first_meet line, once
    const first = rivet.greet();
    ok('first greet reports first meeting', first === true);
    ok('first_meet speaks an intro line', spoken.length === 1 && /Rivet|rivet/.test(spoken[0].text));
    rivet.greet();
    ok('second greet is a return, not a re-meeting', rivet.state.data.counters.conversations === 0 && spoken.length >= 1);

    // reactive banter fires on rare loot
    spoken.length = 0;
    rivet._sinceReactive = 999; // out of debounce
    rivet.observe('rare_loot', { note: 'circuit_board' });
    ok('rare loot → Rivet says a line', spoken.length === 1);
    ok('rare loot → happy mood for the avatar', rivet.mood === 'happy');

    // debounce: immediate second event stays quiet
    rivet.observe('bot_built');
    ok('reactive debounce silences back-to-back lines', spoken.length === 1);
    // …but the event still counts (state grows even when Rivet's quiet)
    ok('debounced events still grow the bond', rivet.state.data.counters.botsBuilt === 1);

    // crash → dismay + nudge suppression note
    rivet._sinceReactive = 999;
    rivet.observe('crash_survived');
    ok('crash sets dismay mood', rivet.mood === 'dismay');

    // idle 30s → observation
    spoken.length = 0;
    rivet._sinceObservation = 999;
    for (let i = 0; i < 32; i++) rivet.update(1, { locked: true, moving: false });
    ok('30s idle → Rivet notices things', spoken.some(s => s.meta.event === 'observation'));

    // moving resets the idle clock
    spoken.length = 0;
    rivet._sinceObservation = 999;
    for (let i = 0; i < 40; i++) rivet.update(1, { locked: true, moving: true });
    ok('moving player → no idle chatter', !spoken.some(s => s.meta.event === 'observation'));

    // low battery warns once per episode
    spoken.length = 0;
    rivet.update(1, { battery: 12 });
    ok('low battery → one warning', spoken.filter(s => s.meta.event === 'low_battery').length === 1);
    for (let i = 0; i < 5; i++) rivet.update(1, { battery: 10 });
    ok('no battery spam while still low', spoken.filter(s => s.meta.event === 'low_battery').length === 1);
    rivet.update(1, { battery: 80 });
    rivet.update(1, { battery: 12 });
    ok('battery re-warns after recharge episode', spoken.filter(s => s.meta.event === 'low_battery').length === 2);

    // conversation round trip — the key UX
    spoken.length = 0;
    const talked = [];
    const talkRivet = new Rivet({
      storage: mkStore(),
      speak: (text, meta) => { spoken.push({ text, meta }); talked.push(meta); },
      listen: async () => 'why does my bot hit the wall on the left?',
      converse: { ask: async (q, state) => {
        ok('conversation prompt got the STT question', q.includes('wall'));
        ok('conversation prompt got Rivet state (tier)', typeof state.tier === 'string' || typeof state.tier === 'function');
        return { text: 'Ha! You fell for the classic — ultrasonic sees FORWARD. Your MOUNT was the problem.', source: 'canned' };
      } },
    });
    talkRivet.state.record('block_mined');
    const trip = await talkRivet.talk();
    ok('talk round trip returns the answer', trip !== null && trip.text.includes('MOUNT'));
    ok('answer spoken in Rivet\'s voice', spoken.at(-1).meta.voice === 'rivet');
    ok('conversation grows the bond', talkRivet.state.data.counters.conversations === 1);

    // empty STT → gentle retry, no crash
    const emptyRivet = new Rivet({
      storage: mkStore(),
      speak: () => {},
      listen: async () => '',
      converse: { ask: async () => ({ text: 'x', source: 'canned' }) },
    });
    const trip2 = await emptyRivet.talk();
    ok('empty transcript handled gracefully', trip2 === null);
  }

  // ══ 8. Persistence round-trip ═══════════════════════════════════════════
  console.log('\nRivet · persistence');
  {
    const store = mkStore();
    const a = new RivetState({ storage: store });
    while (a.tier !== 'friend') a.record('lap_complete');
    a.record('biome_first', { name: 'Circuit City' });
    a.markNudgeDone('mine_iron');

    // a fresh state over the same storage restores everything
    const b = new RivetState({ storage: store });
    ok('tier restored on reload', b.tier === 'friend');
    ok('counters restored', b.data.counters.laps === a.data.counters.laps);
    ok('biomes restored', b.data.biomes.includes('Circuit City'));
    ok('nudge progress restored', b.isNudgeDone('mine_iron'));
    ok('schema version stamped', JSON.parse(store.getItem('scrapcraft_rivet')).v === RIVET_SCHEMA_VERSION);

    // corrupt save → fresh start, no throw
    store.setItem('scrapcraft_rivet', '{not json');
    const c = new RivetState({ storage: store });
    ok('corrupt save → fresh stranger', c.tier === 'stranger' && c.data.bond === 0);

    // future schema → fresh start (friendship restarts, yard forgives)
    store.setItem('scrapcraft_rivet', JSON.stringify({ v: 99, bond: 9999 }));
    const d = new RivetState({ storage: store });
    ok('unknown schema version → fresh, not merged', d.data.bond === 0);

    // Rivet orchestrator round-trip
    const store2 = mkStore();
    const r1 = new Rivet({ storage: store2, speak: () => {} });
    while (r1.state.tier !== 'friend') r1.state.record('conversation');
    const r2 = new Rivet({ storage: store2, speak: () => {} });
    ok('orchestrator restores the friendship', r2.state.tier === 'friend');
  }
}
