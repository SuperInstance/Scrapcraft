/**
 * ───────────────────────────────────────────────────────────────────────────
 *  MO'S LEDGER  —  the yard's memory of you
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The beta rig flagged "Mo's Ledger" as referenced-by-design but missing as
 * a named surface (P2-5). The worldbible's ledger tradition is real: June
 * keeps the Ghost-sighting ledger, in marker, with sources. Mo IS the
 * Ghost — the yard's twenty-six-year memory. So the ledger the yard keeps
 * on YOU carries her name: every first, every lap, every dent, every
 * chapter — the receipts of a career in scrap.
 *
 * Architecture (WelcomeBack's pattern):
 *   - `buildMosLedger(game)` is PURE over a game-shaped object — every
 *     read is optional-chained, every system absent-safe. A headless {},
 *     a half-booted rig, a fresh profile: no throws, just fewer rows.
 *   - `ledgerText(report)` flattens to plain text (the teacher export).
 *   - `openMosLedgerPanel(game)` is the thin DOM face — the Logbook's
 *     field-notes pattern: fixed scrim, one card, ESC/J to close, releases
 *     pointer lock on open. Zero UI.js churn.
 *
 * Sources (all existing, none re-instrumented): Achievements stats, the
 * quest Tracker, the Spine, the BotLedger, the Codex, DailyContract streak,
 * and the live lap PBs.
 */

export const LEDGER_TITLE = "MO'S LEDGER";
export const LEDGER_SUBTITLE = 'every first, every lap, every dent — the yard remembers';

const CH_TOTAL = 12;   // spine chapters (spine.json — authored, stable)

/** Seconds formatter for lap PBs (never shows Infinity). */
function fmtSecs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return (ms / 1000).toFixed(1);
}

/**
 * Pure ledger builder. @returns {{ title, subtitle, rows: Array<{icon, text, dim}>, footer, stats }}
 * `dim` rows are milestones not yet on the books — the ledger shows the
 * empty lines too, the way a real ledger would. A career in progress.
 */
export function buildMosLedger(game) {
  const g = game ?? {};
  const stats = g.achievements?.stats ?? {};
  const crafted = stats.crafted instanceof Set ? stats.crafted : new Set();
  const spine = g.quests?.spine ?? null;
  const tracker = g.quests?.tracker ?? null;
  const botLedger = g.scrapBot?.ledger ?? null;
  const rows = [];

  // ⛏️ first ore — the yard's claim on you
  {
    const n = stats.totalMined ?? 0;
    rows.push(n >= 1
      ? { icon: '⛏️', text: `First ore pried loose — ${n.toLocaleString()} blocks mined since. The yard officially claimed you.` }
      : { icon: '⛏️', text: 'First ore — waiting on that first swing. (Hold left-click on a rust heap.)', dim: true });
  }

  // 🤖 first bot — the moment scrap started thinking
  {
    const botName = botLedger?.name ?? g.scrapBot?.personality?.name ?? null;
    const firstBrain = botLedger?.milestones?.some?.(m => m?.id === 'first_brain')
      || crafted.has('robot_helper') || crafted.has('robot_helper_starter');
    rows.push(firstBrain
      ? { icon: '🤖', text: `First bot brained — ${botName ? `"${botName}"` : 'the first one'} started thinking, and never really stopped.` }
      : { icon: '🤖', text: 'First bot — the Smelter builds them once you\'ve got parts and a plan.', dim: true });
  }

  // 🏁 first race — laps on the books + the personal best
  {
    const laps = (botLedger?.laps ?? 0) + (stats.lapsCompleted ?? 0);
    const oval = fmtSecs(g._ovalLapState?.bestMs ?? 0) ?? fmtSecs(g._comeback?.ovalBestMs ?? 0);
    const track = fmtSecs(g._lapState?.bestMs ?? 0);
    if (laps >= 1) {
      const pb = [oval && `oval PB ${oval}s`, track && `track PB ${track}s`].filter(Boolean).join(' · ');
      rows.push({ icon: '🏁', text: `First lap on the books — ${laps} lap${laps === 1 ? '' : 's'} run${pb ? `, ${pb}` : ''}.` });
    } else {
      rows.push({ icon: '🏁', text: 'First race — the oval\'s been waiting. So has the Ghost.', dim: true });
    }
  }

  // 📖 chapters walked — the spine
  {
    let walked = 0, total = CH_TOTAL, title = null;
    try {
      total = spine?.chapters?.length ?? CH_TOTAL;
      walked = (spine?.chapters ?? []).filter(c => spine.chapterComplete(c)).length;
      title = walked < total ? (spine?.currentChapter?.()?.title ?? null) : null;
    } catch { /* a spine that can't be read can't crash a ledger */ }
    rows.push(walked >= 1
      ? { icon: '📖', text: `Chapters walked: ${walked} of ${total}${title ? ` — now in "${title}"` : ''}.` }
      : { icon: '📖', text: `Chapters walked: 0 of ${total} — the gate is never locked.`, dim: true });
  }

  // ✅ quests + arcs — the work on record
  {
    const done = Object.keys(tracker?.data?.completed ?? {}).length || (stats.questsCompleted ?? 0);
    const arcs = tracker?.completedArcs?.() ?? [];
    rows.push(done >= 1
      ? { icon: '✅', text: `Jobs done: ${done}${arcs.length ? ` · arcs walked: ${arcs.length}/2 (${arcs.join(', ')})` : ''}.` }
      : { icon: '✅', text: 'Jobs done: none yet — Earl\'s five are a good place to start.', dim: true });
  }

  // 🌟 rare finds — what the yard coughed up
  {
    const crystals = stats.crystalMined ?? 0;
    const caches = stats.buriedCachesFound ?? 0;
    const lucky = stats.luckyFinds ?? 0;
    const parts = [crystals && `${crystals} crystal${crystals === 1 ? '' : 's'}`,
                   caches && `${caches} buried cache${caches === 1 ? '' : 's'}`,
                   lucky && `${lucky} lucky strike${lucky === 1 ? '' : 's'}`].filter(Boolean);
    rows.push(parts.length
      ? { icon: '🌟', text: `Rare finds: ${parts.join(', ')}.` }
      : { icon: '🌟', text: 'Rare finds: none yet — the deep yard hides its best scrap.', dim: true });
  }

  // 💛 the bot's dents — character, on the record
  if (botLedger) {
    const dents = botLedger.dents?.length ?? 0;
    const repairs = botLedger.repairs?.length ?? 0;
    rows.push({ icon: '💛', text: `"${botLedger.name}"'s record: ${dents} dent${dents === 1 ? '' : 's'}, ${repairs} repair${repairs === 1 ? '' : 's'} — all character.` });
  }

  // 🔥 days on the clock
  {
    const streak = g.dailyContract?.streak?.count ?? 0;
    const days = g.dailyContract?.daysPlayed ?? 0;
    rows.push(days >= 2 || streak >= 2
      ? { icon: '🔥', text: `Days on the clock: ${days}${streak >= 2 ? ` · ${streak}-day streak` : ''}.` }
      : { icon: '🔥', text: 'Days on the clock: 1 — come back tomorrow, the yard notices.', dim: true });
  }

  return {
    title: LEDGER_TITLE,
    subtitle: LEDGER_SUBTITLE,
    rows,
    footer: 'June keeps hers in marker. Mo keeps yours. (Press J any time — the yard keeps receipts.)',
  };
}

/** Plain-text export — the teacher/parent transcript of a career in scrap. */
export function ledgerText(report) {
  const r = report ?? buildMosLedger(null);
  const lines = [`${r.title} — ${r.subtitle}`, ''];
  for (const row of r.rows) {
    lines.push(`${row.dim ? '·' : row.icon} ${row.text}`);
  }
  lines.push('', r.footer);
  return lines.join('\n');
}

/**
 * The DOM face — Logbook's field-notes pattern. Fail-soft by construction:
 * a missing #hud or a throwing clipboard never takes the yard down.
 */
export function openMosLedgerPanel(game) {
  if (typeof document === 'undefined') return;
  document.getElementById('mos-ledger-panel')?.remove();
  document.getElementById('logbook-panel')?.remove();   // cross-linked opens, not stacked
  document.exitPointerLock?.();

  const report = buildMosLedger(game);

  const panel = document.createElement('div');
  panel.id = 'mos-ledger-panel';
  panel.style.cssText = `
    position: fixed; inset: 0; z-index: 200; display: flex;
    align-items: center; justify-content: center;
    background: rgba(8, 6, 3, 0.75); font-family: 'Courier New', monospace;`;
  panel.innerHTML = `
    <div style="
        width: min(560px, 92vw); max-height: 84vh; overflow-y: auto;
        background: #14100b; border: 2px solid #6b5a33; border-radius: 10px;
        color: #e8dcc0; padding: 20px 24px; font-size: 13px; line-height: 1.55;">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <h2 style="margin:0;font-size:18px;letter-spacing:2px;color:#ffd97a">📒 ${report.title}</h2>
        <span>
          <button id="ml-copy" style="font:inherit;font-size:11px;background:#2a2214;color:#ffd97a;border:1px solid #6b5a33;border-radius:4px;padding:3px 10px;cursor:pointer">copy my record</button>
          <button id="ml-close" style="font:inherit;font-size:11px;background:#2a2214;color:#e8dcc0;border:1px solid #6b5a33;border-radius:4px;padding:3px 10px;cursor:pointer">close [J]</button>
        </span>
      </div>
      <div style="font-size:11px;opacity:.65;letter-spacing:1px;margin-top:2px">${report.subtitle}</div>
      <div id="ml-body" style="margin-top:12px">
        ${report.rows.map(r => `
          <div style="display:flex;gap:10px;align-items:baseline;padding:5px 0;border-bottom:1px dashed #2a2214;${r.dim ? 'opacity:.45' : ''}">
            <span style="font-size:15px">${r.dim ? '·' : r.icon}</span>
            <span>${r.text}</span>
          </div>`).join('')}
      </div>
      <div style="font-size:11px;opacity:.55;font-style:italic;margin-top:12px">${report.footer}</div>
    </div>`;
  document.body.appendChild(panel);

  panel.querySelector('#ml-close')?.addEventListener('click', () => panel.remove());
  panel.querySelector('#ml-copy')?.addEventListener('click', ev => {
    try {
      navigator.clipboard?.writeText(ledgerText(report)).then(() => {
        ev.target.textContent = 'copied ✓';
        setTimeout(() => { ev.target.textContent = 'copy my record'; }, 1600);
      }).catch(() => {});
    } catch { /* clipboard is a garnish */ }
  });
  panel.addEventListener('keydown', e => { if (e.code === 'KeyJ' || e.code === 'Escape') panel.remove(); });
  panel.tabIndex = 0;
  panel.focus();
}
