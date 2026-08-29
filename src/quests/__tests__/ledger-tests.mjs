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

import { buildMosLedger, ledgerText, LEDGER_TITLE, MosLedgerJournal, MO_ENTRY_TABLE } from '../MosLedger.js';

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

  // ══ 5. The journal — the pages Mo writes ═══════════════════════════════
  console.log('\nMo\'s Ledger · the journal (pages Mo wrote)');
  {
    const j = new MosLedgerJournal();

    ok('a fresh journal has no pages', j.entries.length === 0);

    // the four build milestones, in the order a kid actually hits them
    const e1 = j.observe('craft', { id: 'wrench' });
    ok('a wrench is not a robot — no page', e1 === null);
    const robot = j.observe('craft', { id: 'robot_helper' });
    ok('first robot gets its page', robot?.id === 'first_robot' && robot.text.includes('robot'));
    ok('the robot page carries the cat\'s certification', robot.text.includes('🐾'));
    ok('a second robot does not get a second page', j.observe('craft', { id: 'robot_helper' }) === null);

    const comp = j.observe('arduino_compile', {});
    ok('first Arduino C++ compile gets its page', comp?.id === 'first_compile' && comp.text.includes('Arduino C++'));

    const lap = j.observe('lap_complete', { secs: '19.42' });
    ok('first lap gets its page with the time in the margin', lap?.id === 'first_lap' && lap.text.includes('19.42s'));

    const dent = j.observe('dent', {});
    ok('first crash gets its page (failures are content)', dent?.id === 'first_failure' && dent.text.includes('shared wall'));

    const pub = j.observe('failure_published', { title: 'Nutmeg' });
    ok('gallery failure publish gets its page (scrap-spark tie-in)', pub?.id === 'failure_published' && pub.text.includes('yard wall'));

    ok('unknown events are ignored, never thrown', j.observe('spark_ask', {}) === null);
    ok('wrote() reads the once-gate', j.wrote('first_robot') && !j.wrote('never_happens'));
    ok('every entry has at / icon / text', j.entries.every(e => e.at && e.icon && e.text));

    // the write hook fires per page (Game marks the save dirty)
    let writes = 0;
    const j2 = new MosLedgerJournal({ onWrite: () => writes++ });
    j2.observe('craft', { id: 'robot_helper' });
    j2.observe('craft', { id: 'robot_helper' });
    ok('onWrite fires once per page, not per observe', writes === 1);
    let threw = false;
    const j3 = new MosLedgerJournal({ onWrite: () => { throw new Error('hook'); } });
    try { j3.observe('dent', {}); } catch { threw = true; }
    ok('a throwing hook never blocks the pen', !threw && j3.entries.length === 1);

    // persistence round-trip — the save payload is the ledger\'s memory
    const snap = j.toSaveData();
    const j4 = new MosLedgerJournal();
    j4.fromSaveData(snap);
    ok('round-trip keeps every page', j4.entries.length === j.entries.length
       && j4.entries.every((e, i) => e.id === j.entries[i].id && e.text === j.entries[i].text));
    j4.observe('dent', {});
    ok('a restored journal does not rewrite restored pages', j4.entries.length === j.entries.length);

    // fail-soft adoption
    const j5 = new MosLedgerJournal();
    j5.fromSaveData(null); j5.fromSaveData({}); j5.fromSaveData({ entries: 'nope' });
    j5.fromSaveData({ entries: [{ id: 'bogus' }, { id: 'first_lap', text: 'kept' }, null] });
    ok('garbage pages dropped, real ones kept, never a throw',
       j5.entries.length === 1 && j5.entries[0].text === 'kept');

    // every entry id in the table is reachable + once-only by construction
    ok('the entry table covers the shipped milestones',
       ['first_robot', 'first_compile', 'first_lap', 'first_failure', 'failure_published']
         .every(id => id in MO_ENTRY_TABLE && MO_ENTRY_TABLE[id].icon && MO_ENTRY_TABLE[id].text({})))
  }

  // ══ 6. The panel + export carry the pages ══════════════════════════════
  console.log('\nMo\'s Ledger · pages in the report + export');
  {
    const j = new MosLedgerJournal();
    j.observe('craft', { id: 'robot_helper' });
    j.observe('lap_complete', { secs: '21.07' });
    const r = buildMosLedger({ ...fakeGame(), mosJournal: j });
    ok('the report carries the pages', r.entries.length === 2 && r.entries[0].id === 'first_robot');
    const t = ledgerText(r);
    ok('the export carries every page', r.entries.every(e => t.includes(e.text)));
    const empty = buildMosLedger({});
    ok('no journal → no pages, no throw', Array.isArray(empty.entries) && empty.entries.length === 0);
    const panel = src('../MosLedger.js');
    ok('panel renders THE PAGES MO WROTE section', /THE PAGES MO WROTE/.test(panel));
    ok('panel has an empty-pages state', /The cat is watching/.test(panel));
  }

  // ══ 7. Wiring contracts ════════════════════════════════════════════════
  console.log('\nMo\'s Ledger · wiring');
  {
    const game = src('../../Game.js');
    ok('J key opens the ledger', /KeyJ/.test(game) && /this\._openMosLedger\(\)/.test(game));
    ok('Game imports the panel + journal', /import \{ openMosLedgerPanel, MosLedgerJournal \} from '\.\/quests\/MosLedger\.js'/.test(game));
    ok('panel open is garnish-guarded (try/catch)', /try \{ openMosLedgerPanel\(this\);? \} catch/.test(game));

    // journal wiring — the pages Mo writes, tapped at the yard's own events
    ok('journal constructed before saveSystem.load() (payload restores it)',
       /this\.mosJournal = new MosLedgerJournal\(/.test(game)
       && game.indexOf('this.mosJournal = new MosLedgerJournal(') < game.indexOf('this.saveSystem.load()'));
    ok('craft feeds the journal (first robot)', /mosJournal\?\.observe\('craft', \{ id: output \}\)/.test(game));
    ok('both lap sites feed the journal (track + oval)',
       (game.match(/mosJournal\?\.observe\('lap_complete', \{ secs \}\)/g) ?? []).length === 2);
    ok('the first dent feeds the journal (interesting failure)', /mosJournal\?\.observe\('dent', \{\}\)/.test(game));
    ok('a written page marks the save dirty', /onWrite: \(\) => this\.saveSystem\?\.markDirty\(\)/.test(game));

    const te = src('../../TileEditor.js');
    ok('Arduino C++ code view feeds the journal (first compile)',
       /_codeLang === 'arduino'\)?\s*this\._game\?\.mosJournal\?\.observe\('arduino_compile', \{\}\)/.test(te.replace(/\n\s+/g, '\n')));

    const bg = src('../../BrainGallery.js');
    ok('gallery failure publish feeds the journal (scrap-spark tie-in)',
       /mosJournal\?\.observe\('failure_published'/.test(bg));

    const save = src('../../SaveSystem.js');
    ok('save payload carries mosLedger (collect)', /mosLedger: g\.mosJournal\?\.toSaveData\(\) \?\? null/.test(save));
    ok('save payload restores mosLedger (apply)', /data\.mosLedger\) g\.mosJournal\?\.fromSaveData\?\.\(data\.mosLedger\)/.test(save));

    const logbook = src('../LogbookPanel.js');
    ok('Logbook cross-links to the ledger', /id=\\"lb-ledger\\"|id="lb-ledger"/.test(logbook));

    const html = src('../../../index.html');
    ok('help overlay lists the J key', /help-key">J<\/span><span class="help-desc">Mo's Ledger/.test(html));

    const panel = src('../MosLedger.js');
    ok('panel closes on J / ESC', /e\.code === 'KeyJ' \|\| e\.code === 'Escape'/.test(panel));
    ok('panel releases pointer lock on open (Logbook pattern)', /document\.exitPointerLock\?\.\(\)/.test(panel));
  }
}
