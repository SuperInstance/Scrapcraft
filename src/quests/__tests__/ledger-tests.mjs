/**
 * Mo's Ledger tests — the named surface the beta rig couldn't find (P2-5).
 *
 * Pure builder over a game-shaped object: full career → every milestone on
 * the books with live numbers; empty/missing everything → fail-soft, dim
 * rows, no throws; partial → earned rows lit, the rest waiting. Plus the
 * plain-text export and the wiring contracts (J key, Logbook cross-link,
 * help row, panel close keys).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildMosLedger, ledgerText, LEDGER_TITLE } from '../MosLedger.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(HERE, p), 'utf8');

function fakeGame() {
  return {
    achievements: {
      stats: {
        totalMined: 137,
        lapsCompleted: 2,
        crystalMined: 3,
        buriedCachesFound: 1,
        luckyFinds: 2,
        questsCompleted: 5,
        crafted: new Set(['wrench', 'robot_helper']),
      },
    },
    scrapBot: {
      personality: { name: 'Nutmeg' },
      ledger: {
        name: 'Nutmeg', laps: 4, dents: [{}, {}], repairs: [{}],
        milestones: [{ id: 'first_brain' }],
      },
    },
    quests: {
      spine: {
        chapters: [{ id: 'a', done: true }, { id: 'b', done: true }, { id: 'c', done: false }],
        chapterComplete: c => c.done,
        currentChapter: () => ({ title: 'The Smelter\u2019s Flame' }),
      },
      tracker: {
        data: { completed: { q1: {}, q2: {} } },
        completedArcs: () => ['bolt'],
      },
    },
    _ovalLapState: { bestMs: 25400 },
    _lapState: { bestMs: 41200 },
    dailyContract: { streak: { count: 4 }, daysPlayed: 6 },
  };
}

export function runLedgerTests(ok) {
  // ══ 1. The named surface exists, titled for grep ════════════════════════
  console.log('\nMo\'s Ledger · the surface');
  {
    ok('the panel carries the name', LEDGER_TITLE === "MO'S LEDGER");
    ok('buildMosLedger never throws on a null game', buildMosLedger(null).title === LEDGER_TITLE);
    const empty = buildMosLedger({});
    ok('empty yard → career rows present but dim (a ledger shows blank lines)',
       empty.rows.length >= 7 && empty.rows.every(r => r.dim === true));
  }

  // ══ 2. Full career — live numbers on the books ═════════════════════════
  console.log('\nMo\'s Ledger · a career on the books');
  {
    const r = buildMosLedger(fakeGame());
    const text = (i) => r.rows[i].text;

    ok('first ore row counts the blocks', r.rows[0].dim !== true && text(0).includes('137'));
    ok('first bot row carries the bot\'s name', text(1).includes('Nutmeg'));
    ok('first race row sums laps + shows the PB', text(2).includes('6 lap') && text(2).includes('25.4s'));
    ok('chapters row walks the spine', text(3).includes('2 of 3') && text(3).includes('Smelter'));
    ok('jobs row reads the tracker + arcs', text(4).includes('2') && text(4).includes('bolt'));
    ok('rare finds itemized', text(5).includes('3 crystals') && text(5).includes('1 buried cache') && text(5).includes('2 lucky strikes'));
    ok('the bot\'s dents are character', text(6).includes('Nutmeg') && text(6).includes('2 dents'));
    ok('the streak burns', text(7).includes('4-day streak'));
    ok('a full career leaves no dim rows', r.rows.every(row => !row.dim));
  }

  // ══ 3. Partial + fail-soft ═════════════════════════════════════════════
  console.log('\nMo\'s Ledger · in-progress & fail-soft');
  {
    const one = buildMosLedger({ achievements: { stats: { totalMined: 1, crafted: new Set() } } });
    ok('one swing of the pickaxe lights exactly the first-ore row',
       one.rows[0].dim !== true && one.rows.slice(1).every(r => r.dim === true));

    // throwing systems are read, not trusted
    const hostile = { quests: { spine: { chapters: [{}], chapterComplete() { throw new Error('no'); } } } };
    let threw = false, r2 = null;
    try { r2 = buildMosLedger(hostile); } catch { threw = true; }
    ok('a throwing spine can\'t crash the ledger', !threw && r2.rows.length >= 7);

    // Infinity PBs never render
    const inf = buildMosLedger({ _ovalLapState: { bestMs: Infinity }, scrapBot: { ledger: { name: 'B', laps: 1, milestones: [], dents: [], repairs: [] } } });
    ok('an unset PB is omitted, a real one shown',
       inf.rows[2].text.includes('1 lap') && !inf.rows[2].text.includes('Infinity'));
  }

  // ══ 4. The teacher export ══════════════════════════════════════════════
  console.log('\nMo\'s Ledger · plain-text export');
  {
    const r = buildMosLedger(fakeGame());
    const t = ledgerText(r);
    ok('export opens with the title', t.startsWith("MO'S LEDGER"));
    ok('export carries every row', r.rows.every(row => t.includes(row.text)));
    ok('export closes with the lore line', t.includes('the yard keeps receipts'));
  }

  // ══ 5. Wiring contracts ════════════════════════════════════════════════
  console.log('\nMo\'s Ledger · wiring');
  {
    const game = src('../../Game.js');
    ok('J key opens the ledger', /KeyJ/.test(game) && /this\._openMosLedger\(\)/.test(game));
    ok('Game imports the panel', /import \{ openMosLedgerPanel \} from '\.\/quests\/MosLedger\.js'/.test(game));
    ok('panel open is garnish-guarded (try/catch)', /try \{ openMosLedgerPanel\(this\);? \} catch/.test(game));

    const logbook = src('../LogbookPanel.js');
    ok('Logbook cross-links to the ledger', /id=\\"lb-ledger\\"|id="lb-ledger"/.test(logbook));

    const html = src('../../../index.html');
    ok('help overlay lists the J key', /help-key">J<\/span><span class="help-desc">Mo's Ledger/.test(html));

    const panel = src('../MosLedger.js');
    ok('panel closes on J / ESC', /e\.code === 'KeyJ' \|\| e\.code === 'Escape'/.test(panel));
    ok('panel releases pointer lock on open (Logbook pattern)', /document\.exitPointerLock\?\.\(\)/.test(panel));
  }
}
