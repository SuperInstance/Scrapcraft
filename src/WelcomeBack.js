/**
 * ───────────────────────────────────────────────────────────────────────────
 *  WELCOME BACK — the minute-0-of-day-2 moment
 * ───────────────────────────────────────────────────────────────────────────
 *
 * A returning player's whole history is already in the save — a named bot
 * with a bond, laps on the oval, dents, an open Earl quest, a day streak.
 * None of it was ever shown. This module turns that saved state into a
 * one-glance briefing card so the kid remembers why they cared.
 *
 * Pure: build(snapshot) → rows for the UI. Headless-testable.
 */

import { nightShiftQuip, nightShiftDuration } from './NightShift.js';

export class WelcomeBack {
  /**
   * @param {object} snapshot collected by SaveSystem at save time:
   *   { daysPlayed, botName, botBond, botLaps, botDents, ovalBestMs,
   *     questTitle, questStep }
   */
  static build(snap = {}) {
    const rows = [];
    const titleParts = [];

    // The bot comes first — it's the emotional anchor.
    if (snap.botName) {
      const bits = [];
      if (typeof snap.botBond === 'number') bits.push(`bond ${Math.floor(snap.botBond)}%`);
      if (snap.botLaps > 0) bits.push(`${snap.botLaps} lap${snap.botLaps === 1 ? '' : 's'}`);
      if (snap.botDents > 0) bits.push(`${snap.botDents} dent${snap.botDents === 1 ? '' : 's'}`);
      rows.push({
        icon: '🤖',
        text: `<b>${snap.botName}</b> waited by the shed${bits.length ? ' — ' + bits.join(', ') : ''}.`,
      });
      titleParts.push(snap.botName);
    }

    // Night Shift (comp-kimi) — what the bot dragged in while you were away.
    // Sits directly under the bot row: it's the same character's work.
    if (snap.nightShift?.loot && Object.keys(snap.nightShift.loot).length > 0) {
      const ns = snap.nightShift;
      const who = snap.botName ?? 'Your bot';
      rows.push({
        icon: '🌙',
        text: `<b>${who} worked the night shift</b> (${nightShiftDuration(ns.minutes)}). <i>${nightShiftQuip(ns)}</i>`,
      });
      const lootText = Object.entries(ns.loot)
        .map(([id, qty]) => `×${qty} ${id.replace(/_/g, ' ')}`)
        .join(', ');
      rows.push({
        icon: '📦',
        text: `Dragged to your locker: <b>${lootText}</b>.`,
      });
    }

    // The open quest — where you left off.
    if (snap.questTitle) {
      rows.push({
        icon: '📋',
        text: `Still open with Earl: <b>${snap.questTitle}</b>${snap.questStep ? ` — ${snap.questStep}` : ''}.`,
      });
    }

    // The streak — the reason tomorrow matters.
    if (snap.dayStreak > 1) {
      rows.push({ icon: '🔥', text: `<b>${snap.dayStreak}-day streak.</b> Show up tomorrow to grow it.` });
    } else if (snap.dayStreak === 1) {
      rows.push({ icon: '🔥', text: `Day 1 of a new streak. Tomorrow makes it 2.` });
    }

    // The clock to beat.
    if (snap.ovalBestMs && isFinite(snap.ovalBestMs)) {
      rows.push({ icon: '🏁', text: `Oval best: <b>${(snap.ovalBestMs / 1000).toFixed(2)}s</b> — the ghost is waiting.` });
    }

    if (snap.daysPlayed > 1) {
      titleParts.push(`day ${snap.daysPlayed}`);
    }

    return {
      title: 'WELCOME BACK',
      subtitle: titleParts.length ? titleParts.join(' · ') : 'the yard kept your spot',
      rows,
    };
  }
}
