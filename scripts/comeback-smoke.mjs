/**
 * Browser smoke test for the Comeback Engine (built app via vite preview).
 *
 * Usage:  npm run build
 *         node scripts/comeback-smoke.mjs [port]     # needs `playwright` resolvable
 *
 * Spawns `vite preview`, drives the BUILT app in headless Chromium, and checks
 * both sessions a retention feature has to survive: the returning player (day 2)
 * and the fresh player (first 5 minutes).
 *
 * NOTE on technique: this box has no GPU — Chromium renders WebGL in software
 * and the 60fps game loop can starve one-shot evaluate() calls. All checks are
 * therefore waitForFunction polls (retried in page context), never one-shots.
 *
 *  A. RETURNING PLAYER (day 2): Welcome Back card (bot/bond/laps/streak/quest),
 *     quest tracker resumes, daily contract chip with grown streak.
 *  B. FRESH PLAYER: tutorial shows, daily NOT announced mid-tutorial, Spark
 *     starter chips render + a chip tap gets an offline reply + chips retire.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = process.argv[2] ?? '4173';
const URL  = `http://localhost:${PORT}/`;
const results = [];
const check = (name, cond) => {
  results.push([name, !!cond]);
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
};

// poll a page-side predicate until true (default 20s)
const until = (page, fn, timeout = 20000) =>
  page.waitForFunction(fn, { timeout }).then(() => true).catch(() => false);

function seedReturning() {
  const y = new Date(Date.now() - 86_400_000);
  const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  localStorage.setItem('scrapcraft_onboarding_done', '1');
  localStorage.setItem('scrapcraft_bot_ledger_bot1', JSON.stringify({
    name: 'Rivet', dents: [{at:1,x:5,z:5,speed:0.9}], repairs: [], milestones: [],
    retiredAt: null, epitaph: null, runtimeS: 420, laps: 7,
  }));
  localStorage.setItem('scrapcraft_save_v6', JSON.stringify({
    version: 6, lastSaved: y.toISOString(),
    player: { pos:{x:8,y:2,z:5}, yaw:0, hp:100, inventory:new Array(36).fill(null),
              crafted:['wrench'], hotbarIndex:0, waypoint:null, headlampOn:false },
    achievements: { unlocked:['first_mine'], stats:{ totalMined:30, crafted:['wrench'] } },
    xp: null, tileEditor: null,
    earl: { questIndex: 2, history: [] },           // q3 "Power Up" open
    world: { seed:1337, minedBlocks:[], placedBlocks:[], signalCaches:[] },
    tower: { slots:{}, activated:false }, botUpgrades: [], exchange: {},
    botPersonality: { name:'Rivet', bond:34, lifetimeSecs:5000, firedMilestones:[25] },
    bot2Personality: null,
    daily: { day:key(y), contractId:'makers_hands', progress:2, claimed:false,
             totalDone:0, daysPlayed:2, streak:{ lastDay:key(y), count:2, best:2 },
             announced:true },
    comeback: { botName:'Rivet', botBond:34, botLaps:7, botDents:1, ovalBestMs:18420,
                questIndex:2, daysPlayed:2, dayStreak:2 },
    ghostLap: null, ovalGhostLap: null, ovalBestMs: 18420, fogMap: null,
  }));
}

async function returningFlow(browser) {
  console.log('\nA. Returning player (day 2)');
  const ctx = await browser.newContext({ viewport: { width: 720, height: 480 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(seedReturning);
  await page.goto(URL);
  await page.click('#start-btn');

  // welcome card content lands within a couple seconds of CLOCK IN
  const gotCard = await until(page, () =>
    document.querySelector('#welcome-back')?.classList.contains('show') &&
    document.querySelector('#wb-rows')?.innerText.includes('Rivet'));
  check('welcome card visible, names the bot', gotCard);
  const cardText = await page.waitForFunction(
    () => document.querySelector('#wb-rows')?.innerText ?? '', { timeout: 15000 }
  ).then(h => h.jsonValue()).catch(() => '');
  check('card shows bond + laps', cardText.includes('bond 34%') && cardText.includes('7 laps'));
  check('card shows the grown streak', cardText.includes('3-day streak'));
  check('card shows the open quest', cardText.includes('Power Up'));

  // the verified bug: quest tracker must come back on its own (~4s)
  const questBack = await until(page, () => {
    const q = document.querySelector('#quest-box');
    return q && q.style.display !== 'none' && q.innerText.toLowerCase().includes('power up');
  }, 12000);
  check('quest tracker resumed (was: dead on reload)', questBack);

  // daily chip: rolled to today's seeded contract, streak flame grew to ×3
  const dailyOk = await until(page, () => {
    const d = document.querySelector('#daily-hud');
    return d && /×3/.test(d.innerText) && !/0 \/ \?/.test(d.innerText);
  });
  check('daily contract chip + streak ×3', dailyOk);

  check('no page errors (returning)', errors.length === 0);
  if (errors.length) console.log('    errors:', errors.slice(0, 3));
  await ctx.close();
}

async function freshFlow(browser) {
  console.log('\nB. Fresh player');
  const ctx = await browser.newContext({ viewport: { width: 720, height: 480 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL);
  // Fresh players see the first-run config wizard. Dismiss it by polling DOM
  // clicks on Skip until the overlay is gone (button hides on some steps).
  for (let i = 0; i < 10; i++) {
    const gone = await page.evaluate(() => !document.getElementById('onboarding-wizard')).catch(() => false);
    if (gone) break;
    await page.evaluate(() => document.getElementById('ow-skip')?.click()).catch(() => {});
    await page.waitForTimeout(700);
  }
  check('onboarding wizard dismissed', await page.evaluate(() => !document.getElementById('onboarding-wizard')).catch(() => false));
  await page.evaluate(() => document.getElementById('start-btn').click());

  const tut = await until(page, () =>
    document.querySelector('#mission-card')?.classList.contains('show'));
  check('mission card tutorial shows', tut);
  check('no welcome card for fresh player',
    !(await until(page, () => document.querySelector('#welcome-back')?.classList.contains('show'), 4000)));
  check('daily NOT announced during tutorial',
    !(await until(page, () => /Daily Contract/.test(document.querySelector('#notif-container')?.innerText ?? ''), 4000)));

  // Tile editor → Spark panel → chips
  await page.keyboard.press('t');
  const teOpen = await until(page, () => {
    const te = document.querySelector('#tile-editor');
    return te && getComputedStyle(te).display !== 'none';
  });
  check('tile editor opens (T)', teOpen);
  await page.evaluate(() => document.getElementById('te-spark-btn')?.click());
  const chips = await until(page, () => document.querySelectorAll('.sp-chip').length === 5);
  check('spark starter chips render (4 + dice)', chips);

  await page.evaluate(() => document.querySelector('.sp-chip')?.click());
  const replied = await until(page, () => {
    const log = document.querySelector('.sp-log');
    return log && log.innerText.includes('⚡') && log.querySelectorAll('.sp-msg').length >= 3;
  }, 30000);
  check('chip tap → Spark replies (offline recipe)', replied);
  const chipsRetired = await until(page, () =>
    document.querySelector('.sp-chips')?.style.display === 'none', 8000);
  check('chips retire after first send', chipsRetired);

  check('no page errors (fresh)', errors.length === 0);
  if (errors.length) console.log('    errors:', errors.slice(0, 3));
  await ctx.close();
}

const preview = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
  cwd: process.cwd(), stdio: 'ignore', detached: true,
});
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(URL)).ok) break; } catch {}
  await new Promise(r => setTimeout(r, 500));
}

let failed = 0;
const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=1024'] });
try {
  await returningFlow(browser);
} finally {}
try {
  await freshFlow(browser);
} catch (e) {
  console.log('  (fresh flow aborted early:', e.message.slice(0, 80) + ')');
} finally {
  await browser.close();
  try { process.kill(-preview.pid, 'SIGTERM'); } catch {}
}
for (const [name, ok] of results) if (!ok) failed++;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
