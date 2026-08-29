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
 *   - `MosLedgerJournal` is the other half — the PAGES Mo writes, at the
 *     moment a first happens (first robot, first Arduino C++ compile,
 *     first lap, first crash, first failure hung on the /gallery wall).
 *     Event-fed via `observe()`, once-ever per milestone, persisted in the
 *     save payload (`mosLedger` — SaveSystem full-payload semantics).
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

// ── the journal — the entries Mo writes when the yard notices ──────────────
//
// The career rows above are DERIVED (read live at open time); the journal
// is what Mo actually WROTE, at the moment it happened, once each. Canon
// check (worldbible): Mo is the Ghost — the yard's twenty-six-year memory —
// and Rivet is the yard cat, quality inspection division. So the ledger
// keeps Mo's name, the entries keep the cat's register (dry, short, zero
// exclamation points — a quality report that deigns to be prose), and 🐾
// marks the ones Rivet napped on. In-world she only sits on builds people
// care about; her nap IS the certification.

/** The milestone entries Mo writes — once each, text fixed at write time. */
export const MO_ENTRY_TABLE = {
  first_robot: {
    icon: '🤖',
    text: () => 'Kid built a robot. It whirred once, beeped at the wall, decided to stay. The cat sat on it — certified. 🐾',
  },
  first_compile: {
    icon: '📟',
    text: () => 'The tiles turned into real Arduino C++ today. Semicolons, pin numbers, everything. Nobody was harmed.',
  },
  first_lap: {
    icon: '🏁',
    text: (d) => `One full lap. All wheels, no help${d?.secs ? `, ${d.secs}s` : ''}. The track noticed. I wrote it down.`,
  },
  first_failure: {
    icon: '💥',
    text: () => 'First crash. The wall is fine. The bot is finer. Dents are the yard keeping notes — the good ones go on the shared wall.',
  },
  failure_published: {
    icon: '📌',
    text: () => 'They hung the crash on the yard wall for everyone to learn from. Bold. Correct. The cat approves of teaching by example. 🐾',
  },
};

/** Max entries — firsts are bounded, but a ledger never grows unbounded. */
const MO_ENTRY_CAP = 100;

/**
 * The journal Mo keeps. Headless, zero-dep, fail-soft: `observe()` taps the
 * yard's existing event streams (craft / arduino_compile / lap_complete /
 * dent / failure_published) and writes one entry per milestone id — the
 * once-gate is the journal's own, so callers never pre-check. Persistence
 * rides the save payload (`mosLedger` in SaveSystem._collect — full-payload
 * semantics, no side storage: the save IS the ledger's memory).
 */
export class MosLedgerJournal {
  /** @param {{onWrite?: (entry:object)=>void}} [opts] optional write hook (Game marks the save dirty) */
  constructor(opts = {}) {
    this.entries = [];                 // [{ id, at, icon, text }]
    this._onWrite = typeof opts.onWrite === 'function' ? opts.onWrite : null;
  }

  /** Feed an event. Returns the entry if Mo wrote one now, else null. */
  observe(event, data = {}) {
    let id = null;
    switch (event) {
      case 'craft':
        if (data?.id === 'robot_helper' || data?.id === 'robot_helper_starter') id = 'first_robot';
        break;
      case 'arduino_compile':   id = 'first_compile';      break;
      case 'lap_complete':      id = 'first_lap';          break;
      case 'dent':              id = 'first_failure';      break;
      case 'failure_published': id = 'failure_published';  break;
    }
    if (!id || !(id in MO_ENTRY_TABLE)) return null;
    if (this.entries.some(e => e?.id === id)) return null;   // once-ever, like every first

    const entry = {
      id,
      at: new Date().toISOString(),
      icon: MO_ENTRY_TABLE[id].icon,
      text: MO_ENTRY_TABLE[id].text(data),
    };
    this.entries.push(entry);
    if (this.entries.length > MO_ENTRY_CAP) this.entries.shift();
    try { this._onWrite?.(entry); } catch { /* a write hook never blocks the pen */ }
    return entry;
  }

  /** True once Mo has written this milestone (panel + tests read it). */
  wrote(id) { return this.entries.some(e => e?.id === id); }

  toSaveData() { return { entries: this.entries.map(e => ({ ...e })) }; }

  fromSaveData(data) {
    if (!data || !Array.isArray(data.entries)) return;
    this.entries = data.entries
      .filter(e => e && typeof e.id === 'string' && e.id in MO_ENTRY_TABLE)
      .slice(-MO_ENTRY_CAP)
      .map(e => ({ id: e.id, at: e.at ?? new Date().toISOString(), icon: e.icon ?? MO_ENTRY_TABLE[e.id].icon, text: e.text ?? MO_ENTRY_TABLE[e.id].text({}) }));
  }
}

/** Date stamp for the panel — ledger style: quiet, just the day. */
function entryDay(at) {
  try { return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

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
    entries: [...(g.mosJournal?.entries ?? [])],   // the pages Mo wrote (journal, not derived)
    rows,
    footer: 'June keeps hers in marker. Mo keeps yours. (Press J any time — the yard keeps receipts.)',
  };
}

/** Plain-text export — the teacher/parent transcript of a career in scrap. */
export function ledgerText(report) {
  const r = report ?? buildMosLedger(null);
  const lines = [`${r.title} — ${r.subtitle}`, ''];
  for (const e of r.entries ?? []) {
    lines.push(`${e.icon} ${entryDay(e.at)} — ${e.text}`);
  }
  if (r.entries?.length) lines.push('');
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
  game?.observer?.menuOpen?.('ledger');   // OBSERVER: Mo's Ledger surface

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
        <div style="font-size:10px;letter-spacing:2px;opacity:.55;margin-bottom:4px">THE PAGES MO WROTE — the cat observes, the Ghost remembers</div>
        ${report.entries.length
          ? report.entries.map(e => `
            <div style="display:flex;gap:10px;align-items:baseline;padding:5px 0;border-bottom:1px dashed #2a2214">
              <span style="font-size:15px">${e.icon}</span>
              <span><span style="opacity:.5;font-size:11px">${entryDay(e.at)}</span> — ${e.text}</span>
            </div>`).join('')
          : `<div style="padding:6px 0 10px;opacity:.5;font-style:italic">Nothing on the pages yet. Build something. The cat is watching. The cat is always watching.</div>`}
        <div style="font-size:10px;letter-spacing:2px;opacity:.55;margin:12px 0 4px">THE CAREER ON THE BOOKS</div>
        ${report.rows.map(r => `
          <div style="display:flex;gap:10px;align-items:baseline;padding:5px 0;border-bottom:1px dashed #2a2214;${r.dim ? 'opacity:.45' : ''}">
            <span style="font-size:15px">${r.dim ? '·' : r.icon}</span>
            <span>${r.text}</span>
          </div>`).join('')}
      </div>
      <div style="font-size:11px;opacity:.55;font-style:italic;margin-top:12px">${report.footer}</div>
    </div>`;
  document.body.appendChild(panel);

  // OBSERVER: any close path (close btn, J/ESC key, cross-link removal)
  // fires menu_close('ledger') — wrap remove once, guard double-close.
  const _origRemove = panel.remove.bind(panel);
  panel.remove = () => {
    try { if (panel.isConnected) game?.observer?.menuClose?.('ledger'); } catch { /* observer is a garnish */ }
    _origRemove();
  };
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
