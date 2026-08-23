/**
 * Cold-start suite — the minute-one experience, headless.
 *
 * Covers the 2-step wizard (config dialogs exiled to Settings), Earl's
 * once-ever spawn conscription (ColdStartGate), Spark's offline first
 * greeting, the Gate-Edition starter bot, the Settings → Advanced config
 * seam, and the junk-lantern breadcrumb trail to the Smelter.
 *
 * Exported as a function so run-tests.mjs can fold it into the one harness.
 * Everything headless: storage is an injected Map, UIs are recording fakes,
 * localStorage reads happen inside functions so a shim installed here works.
 */

import { ONBOARDING_STEPS } from '../../onboarding/index.js';
import { SettingsPanel } from '../../onboarding/SettingsPanel.js';
import { Foreman } from '../../Foreman.js';
import {
  ColdStartGate, EARL_CONSCRIPTION_LINES,
  SPARK_FIRST_GREETING_IRON, sparkFirstGreeting,
} from '../../onboarding/coldstart.js';
import { RECIPES } from '../../data/recipes.js';
import { ITEMS } from '../../data/items.js';
import { BOT_EDITIONS } from '../../data/botEditions.js';
import { loadConfig, saveConfig, hasLiveAI, CONFIG_KEY } from '../../onboarding/config.js';
import { World } from '../../World.js';
import { B } from '../../data/blocks.js';

export function runColdstartTests(ok) {
  // Node has no localStorage (and earlier sections may have installed one) —
  // swap in fresh shims for determinism, restore the previous global after.
  const prevLS = globalThis.localStorage;
  const mkStorage = () => {
    const m = new Map();
    return {
      getItem: k => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, String(v)),
    };
  };

  // ══ 1. The wizard: two steps, zero ceremony, no config dialogs ═══════════
  console.log('\nCold-start · wizard');
  {
    ok('wizard is exactly 2 steps', ONBOARDING_STEPS.length === 2,
       `got ${ONBOARDING_STEPS.length}`);
    ok('step ids are welcome → ready',
       ONBOARDING_STEPS.map(s => s.id).join(',') === 'welcome,ready',
       ONBOARDING_STEPS.map(s => s.id).join(','));
    ok('removed steps (ai_setup / cloudflare_connect / tutorial) are gone',
       !ONBOARDING_STEPS.some(s => ['ai_setup', 'cloudflare_connect', 'tutorial'].includes(s.id)));
    ok('no step mentions API or api_key (a 10-year-old sees no key dialog)',
       !ONBOARDING_STEPS.some(s => /API|api_key/.test(JSON.stringify(s))));

    const c0 = ONBOARDING_STEPS[0].content ?? '';
    ok('step 0 copy carries the conscription (5 iron)', /(5|five) iron/i.test(c0), c0);
    ok('step 0 teaches left-click mining', c0.includes('left-click'));
    ok('step 1 points at Earl (hit F to talk)', /\bF\b/.test(ONBOARDING_STEPS[1].content ?? ''));
  }

  // ══ 2. Earl's conscription: once ever, persisted across instances ═══════
  console.log('\nCold-start · Earl conscription');
  {
    globalThis.localStorage = mkStorage();   // fresh record for Foreman's own gate

    const st = mkStorage();
    const gateA = new ColdStartGate(st);
    ok('fresh gate has not greeted Earl', gateA.earlGreeted === false);
    gateA.markEarlGreeted();
    ok('a second gate sharing storage sees earlGreeted === true',
       new ColdStartGate(st).earlGreeted === true);

    // Foreman end-to-end against recording fakes
    const mkFake = () => {
      const lines = [];
      return {
        lines,
        game: { quests: { _renderHud() {} }, achievements: { track() {} } },
        ui: { showForeman: line => lines.push(line) },
      };
    };
    const sharedGate = new ColdStartGate(mkStorage());
    const a = mkFake();
    const f = new Foreman(a.game);
    f._coldstartGate = sharedGate;
    f.setUI(a.ui);
    ok('first greetPlayer() fires the conscription', f.greetPlayer() === true);
    ok('exactly one line pushed', a.lines.length === 1, `lines=${a.lines.length}`);
    ok('the line mentions iron', a.lines[0]?.includes('iron'), a.lines[0]);
    ok('the line comes from EARL_CONSCRIPTION_LINES',
       EARL_CONSCRIPTION_LINES.includes(a.lines[0]));
    ok('second greetPlayer() on the same Foreman refuses', f.greetPlayer() === false);
    ok('refusal pushes nothing more', a.lines.length === 1);
    const b = mkFake();
    const f2 = new Foreman(b.game);
    f2._coldstartGate = sharedGate;          // same gate, second instance
    f2.setUI(b.ui);
    ok('a second Foreman sharing the gate also refuses', f2.greetPlayer() === false);
    ok('the second Foreman stays silent', b.lines.length === 0);
  }

  // ══ 3. Spark's first appearance: offline, wonder-first, once ════════════
  console.log('\nCold-start · Spark greeting');
  {
    ok("sparkFirstGreeting('iron_scrap') returns the iron greeting",
       sparkFirstGreeting('iron_scrap') === SPARK_FIRST_GREETING_IRON);
    ok('iron greeting introduces Spark', SPARK_FIRST_GREETING_IRON.includes('Spark'));
    ok('iron greeting names iron', /iron/i.test(SPARK_FIRST_GREETING_IRON));
    const generic = sparkFirstGreeting('copper_wire');
    ok('any other item gets the generic Spark greeting',
       generic !== SPARK_FIRST_GREETING_IRON && generic.includes('Spark'));

    const st = mkStorage();
    const s1 = new ColdStartGate(st);
    ok('fresh gate has not greeted Spark', s1.sparkGreeted === false);
    s1.markSparkGreeted();
    ok('spark flag fires once across gates sharing storage',
       new ColdStartGate(st).sparkGreeted === true);
  }

  // ══ 4. The starter bot: same bones, yard-gate refinement ════════════════
  console.log('\nCold-start · Gate-Edition starter bot');
  {
    const starter = RECIPES.find(r => r.id === 'r_robot_helper_starter');
    const smelterBot = RECIPES.find(r => r.id === 'r_robot_helper');
    ok('r_robot_helper_starter recipe exists', !!starter);
    ok('starter bot crafts at the workbench (no Smelter trip)',
       starter?.station === 'workbench', starter?.station);
    ok('needs a wrench, not a blowtorch',
       starter?.tool === 'wrench' && starter?.tool !== 'blowtorch', starter?.tool);
    ok('ingredients identical to the Smelter build',
       JSON.stringify(starter?.ingredients) === JSON.stringify(smelterBot?.ingredients),
       `${JSON.stringify(starter?.ingredients)} vs ${JSON.stringify(smelterBot?.ingredients)}`);
    ok('output robot_helper_starter is a real item', !!ITEMS[starter?.output]);
    ok("Earl's quip points at the Smelter upgrade", /Smelter/.test(starter?.foremanQuip ?? ''),
       starter?.foremanQuip);

    ok('Gate Edition is slower than the standard bot',
       BOT_EDITIONS.gate.speedMult < BOT_EDITIONS.standard.speedMult,
       `${BOT_EDITIONS.gate.speedMult} vs ${BOT_EDITIONS.standard.speedMult}`);
    ok('Gate Edition drains battery faster',
       BOT_EDITIONS.gate.batteryDrainMult > BOT_EDITIONS.standard.batteryDrainMult,
       `${BOT_EDITIONS.gate.batteryDrainMult} vs ${BOT_EDITIONS.standard.batteryDrainMult}`);
  }

  // ══ 5. Settings → Advanced holds the AI/Cloudflare config ═══════════════
  console.log('\nCold-start · Settings→Advanced config');
  {
    globalThis.localStorage = mkStorage();   // fresh record for the round-trip

    const merged = saveConfig({ aiProvider: 'anthropic', apiKey: 'sk-test', cfWorkerUrl: null });
    const cfg = loadConfig();
    ok('saveConfig round-trips provider + key + worker url',
       cfg.aiProvider === 'anthropic' && cfg.apiKey === 'sk-test' && cfg.cfWorkerUrl === null,
       JSON.stringify(cfg));
    ok('hasLiveAI() true with a live provider', hasLiveAI(merged) === true && hasLiveAI() === true);
    saveConfig({ apiKey: null, aiProvider: 'offline' });
    ok('clearing the key takes Spark offline', hasLiveAI() === false);
    ok('CONFIG_KEY names the shared record', CONFIG_KEY === 'scrapcraft_onboarding_config');
    ok('SettingsPanel exists (open() needs a DOM, skipped headless)',
       typeof SettingsPanel === 'function');
  }

  // ══ 6. The junk-lantern trail: spawn → Smelter breadcrumbs ══════════════
  console.log('\nCold-start · breadcrumb trail');
  {
    const w = new World(128, 128, 10);
    w.generate(1337);
    const trail = w.landmarks.smelter_trail;
    const distFromSpawn = (x, z) => Math.hypot(x - 8, z - 5);

    ok('trail exists with ≥ 4 markers', Array.isArray(trail) && trail.length >= 4,
       `n=${trail?.length}`);
    ok('every marker block is the beacon',
       trail.every(t => w.getBlock(t.x, 1, t.z) === B.BEACON),
       trail.filter(t => w.getBlock(t.x, 1, t.z) !== B.BEACON)
         .map(t => `(${t.x},${t.z})=${w.getBlock(t.x, 1, t.z)}`).join(' '));
    ok('trail starts near spawn (8,5)', distFromSpawn(trail[0].x, trail[0].z) <= 3,
       `d=${distFromSpawn(trail[0].x, trail[0].z).toFixed(2)}`);
    const sm = w.landmarks.smelter;
    const last = trail[trail.length - 1];
    ok('trail ends near the Smelter', Math.hypot(last.x - sm.x, last.z - sm.z) <= 3,
       `d=${Math.hypot(last.x - sm.x, last.z - sm.z).toFixed(2)}`);
    const ds = trail.map(t => distFromSpawn(t.x, t.z));
    ok('markers lead somewhere (non-decreasing distance from spawn)',
       ds.every((d, i) => i === 0 || d >= ds[i - 1] - 1e-9),
       ds.map(d => d.toFixed(1)).join(','));
  }

  globalThis.localStorage = prevLS;
}
