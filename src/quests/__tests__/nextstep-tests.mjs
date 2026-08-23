/**
 * NEXT STEP tests — the kid's persistent answer to "what do I do next?".
 * Pure: real QuestTracker over the real campaign, no DOM, no game.
 */

import { QuestTracker } from '../Tracker.js';
import { CAMPAIGN } from '../data/index.js';
import { nextStep, howForObjective } from '../NextStep.js';

export function runNextStepTests(ok) {
  const mkTracker = () => new QuestTracker({
    quests: CAMPAIGN,
    adapter: {
      stats: () => ({}), crafted: () => new Set(), countItem: () => 0,
      plaquesRead: () => 0, lapBestSecs: () => null, getTier: () => null,
    },
    storage: null,
  });
  const firstAvailable = (t) => t.available().slice(0, 4);

  console.log('\nNext step · derivation');
  {
    const t = mkTracker();
    const step = nextStep(t, firstAvailable(t));
    ok('fresh kid gets a next step (earl-1 mine objective)',
       step?.kind === 'objective' && step.questId === 'earl-1', JSON.stringify(step));
    ok('the step names the objective label',
       /iron/i.test(step.label), step.label);
    ok('the step carries a physical how (left-click mining)',
       /left-click/.test(step.how), step.how);
  }

  {
    // progress moves the answer: 3/5 iron → still earl-1, progress surfaced
    const t = mkTracker();
    t._adapter.stats = () => ({ itemsCollected: { iron_scrap: 3 } });
    const step = nextStep(t, firstAvailable(t));
    ok('partial progress rides the step (3/5)',
       step?.progress === '3/5', step?.progress);
    ok('quest stays until objectives close', step?.questId === 'earl-1');
  }

  {
    // earl-1 done → the next step walks the chain (earl-2 craft wrench)
    const t = mkTracker();
    t._adapter.stats = () => ({ itemsCollected: { iron_scrap: 5 } });
    const done = t.refresh();
    ok('earl-1 completes via refresh (fixture sanity)', done.some(q => q.id === 'earl-1'));
    const step = nextStep(t, firstAvailable(t));
    ok('next step advances to the wrench quest',
       step?.questId === 'earl-2' && /wrench/i.test(step.label), JSON.stringify(step));
    ok('craft objectives say press E', /press E/.test(step.how), step.how);
  }

  {
    // nothing active → null (never a fabricated goal)
    const t = mkTracker();
    ok('empty display list → null (no invented goals)',
       nextStep(t, []) === null);
    ok('null display arg → null (fail-soft)', nextStep(t, null) === null);
  }

  {
    // finale outranks everything when available
    const t = mkTracker();
    const step = nextStep(t, firstAvailable(t), { finale: true });
    ok('finale available → the race IS the next step',
       step?.kind === 'finale' && step.questId === 'finale-midnight-race',
       JSON.stringify(step));
  }

  console.log('\nNext step · how-hints');
  {
    const cases = [
      [{ type: 'MINE' }, /left-click/],
      [{ type: 'CRAFT' }, /press E/],
      [{ type: 'RUN_PROGRAM' }, /press T/],
      [{ type: 'FLASH_BOARD' }, /BUILD IT/],
      [{ type: 'LAP' }, /oval|circuit/i],
      [{ type: 'SPARK_ASK' }, /hold Q/],
      [{ type: 'REPAIR' }, /press G/],
      [{ type: 'EXPERIMENT' }, /one tile/],
    ];
    for (const [o, re] of cases) {
      ok(`how-hint for ${o.type} names the verb`, re.test(howForObjective(o) ?? ''),
         howForObjective(o));
    }
    ok('unknown objective type → null how (fail-soft)',
       howForObjective({ type: 'NOPE' }) === null);
    ok('missing objective → null how', howForObjective(null) === null);
  }
}
