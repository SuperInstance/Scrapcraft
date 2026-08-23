/**
 * ───────────────────────────────────────────────────────────────────────────
 *  STORY IDENTITY  —  the run's story, told by who walked you in
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Multi-run players should see DIFFERENT journeys in their history because
 * different friends pulled them differently. The run's identity:
 *
 *   starter     who the gate delivered on day one (the run's genre)
 *   active      who's on your shoulder right now
 *   party       the crew
 *   drift       the top trait axis — how the friendship itself grew
 *   firsts      the order things actually happened (a BOLT-run hits the oval
 *               by level 2; a MAGMA-run flashes hardware first; a JUNO-run
 *               explores the Deep Yard early)
 *
 * Feeds the end-of-session summary and the quilt's companions channel.
 */

const FIRSTS = [
  { key: 'laps', event: 'first lap', emoji: '🏁' },
  { key: 'ghostsBeaten', event: 'first ghost beaten', emoji: '👻' },
  { key: 'botsBuilt', event: 'first bot built', emoji: '🤖' },
  { key: 'flashes', event: 'first real-board flash', emoji: '🔥' },
  { key: 'repairs', event: 'first repair', emoji: '🔨' },
];

/**
 * @param {object} roster CompanionRoster (or roster-shaped)
 * @returns {{ starter:string, active:string, party:string[], tier:string, bond:number, drift:string, driftLabel:string, pull:string, firsts:Array, crosstalkCount:number }}
 */
export function storySummary(roster) {
  const starter = roster.startedWith ?? roster.data?.startedWith ?? 'rivet';
  const activeId = roster.activeId ?? 'rivet';
  const active = roster.get(activeId);
  const state = active?.state;
  const persona = active?.persona;

  const firsts = FIRSTS
    .map(f => {
      const c = state?.data?.counters?.[f.key] ?? 0;
      return { ...f, done: c > 0, count: c };
    });

  return {
    starter,
    active: activeId,
    party: roster.partyIds ?? [],
    tier: state?.tier ?? 'stranger',
    bond: Math.round(state?.data?.bond ?? 0),
    drift: state?.topTrait() ?? '—',
    driftLabel: state?.traitLabel?.(state.topTrait()) ?? '—',
    pull: persona?.pull ?? '',
    firsts,
    crosstalkCount: roster.crosstalkCount ?? 0,
  };
}

/** One-line story identity for the end-of-session card + history. */
export function storySummaryText(roster) {
  const s = storySummary(roster);
  const who = s.active === s.starter ? s.active : `${s.starter}-run, now rolling with ${s.active}`;
  const firsts = s.firsts.filter(f => f.done).map(f => f.emoji);
  const crew = s.party.length > 1 ? ` · party of ${s.party.length}` : '';
  return `${who}: ${s.tier} tier, bond ${s.bond}, drift ${s.driftLabel}${firsts.length ? ` · firsts: ${firsts.join('')}` : ''}${crew} — ${s.pull}`;
}

/** Quilt cells for the companions channel (active companion + tier + drift). */
export function quiltCells(roster) {
  const s = storySummary(roster);
  return {
    active: s.active,
    starter: s.starter,
    tier: s.tier,
    bond: s.bond,
    drift: s.driftLabel,
    party: s.party.length || 1,
  };
}
