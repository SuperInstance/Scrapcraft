/**
 * ───────────────────────────────────────────────────────────────────────────
 *  CUTSCENES — three authored cinematics for the campaign spine
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Earl-voice subtitles: gruff, warm, direct. Short punchy sentences mixed
 * with reflective beats. The yard is the character; Earl is its interpreter.
 *
 * Camera keyframes constrained: x∈[0,128], z∈[0,130], y∈[3,40]. Yard center ≈ {x:64, z:62}.
 * Gate area lies on the west edge; the oval and bands extend beyond.
 */

import { registerCutscenes, getCutscenes } from '../Timeline.js';

export const CUTSCENES = [
  // ─────────────────────────────────────────────────────────────────────────
  // INTRO: Truck pulling into the yard at dawn
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'intro-dawn-arrival',
    title: 'The Yard at Dawn',
    duration: 26,
    letterbox: {
      in: 1.2,      // bars slide in over 1.2s
      out: 1.2,     // bars slide out over 1.2s
      height: 0.11, // 11% viewport height each
    },
    camera: {
      center: { x: 64, z: 62 },
      keyframes: [
        // Start low on the east road, looking west at the gate
        { t: 0, x: 100, y: 5, z: 130, look: { x: 30, y: 4, z: 50 }, ease: 'linear' },
        // Roll forward toward the gate, rising slightly
        { t: 6, x: 80, y: 8, z: 100, look: { x: 50, y: 5, z: 60 }, ease: 'out' },
        // Slow rise and orbit: northeast quadrant
        { t: 14, x: 90, y: 20, z: 80, look: { x: 64, y: 8, z: 62 }, ease: 'inout' },
        // North: high vantage of the yard
        { t: 19, x: 64, y: 30, z: 40, look: { x: 64, y: 6, z: 62 }, ease: 'inout' },
        // West: gentle descent, gate-side view
        { t: 26, x: 40, y: 18, z: 65, look: { x: 64, y: 5, z: 62 }, ease: 'in' },
      ],
    },
    subtitles: [
      { t: 1.5, end: 5.0, speaker: 'EARL', text: 'You showed up with a wagon and no plan.' },
      { t: 5.2, end: 8.5, speaker: 'EARL', text: 'Good — the yard\'s got plans enough for both of us.' },
      { t: 9.0, end: 12.0, speaker: 'EARL', text: 'See that gate? Never been locked.' },
      { t: 12.5, end: 16.0, speaker: 'EARL', text: 'Everything past it is yours to break.' },
      { t: 16.5, end: 20.0, speaker: 'EARL', text: 'Welcome to the Yard.' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WAKE: The first Wake — East Road Light blinking on at dusk
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'wake-first-light',
    title: 'The First Light',
    duration: 20,
    letterbox: {
      in: 0.9,
      out: 1.0,
      height: 0.11,
    },
    camera: {
      center: { x: 64, z: 62 },
      keyframes: [
        // Start on the fence line, low and east
        { t: 0, x: 110, y: 4, z: 100, look: { x: 90, y: 6, z: 70 }, ease: 'linear' },
        // Sweep west across the fence, toward floodlight pole
        { t: 8, x: 70, y: 6, z: 120, look: { x: 50, y: 8, z: 90 }, ease: 'inout' },
        // Rise to catch the floodlight at dusk height
        { t: 15, x: 55, y: 16, z: 105, look: { x: 40, y: 14, z: 80 }, ease: 'out' },
        // Hold and gaze: the light has woken
        { t: 20, x: 55, y: 16, z: 105, look: { x: 40, y: 14, z: 80 }, ease: 'linear' },
      ],
    },
    subtitles: [
      { t: 0.8, end: 3.5, speaker: 'EARL', text: 'Dusk. Every day the light wakes up.' },
      { t: 3.8, end: 7.0, speaker: 'EARL', text: 'Floodlight on the east road — been there longer than you.' },
      { t: 7.5, end: 11.0, speaker: 'EARL', text: 'Some call it the Ghost Track waking.' },
      { t: 11.5, end: 15.0, speaker: 'EARL', text: 'Long route home for the old bots, and the new.' },
      { t: 15.5, end: 19.5, speaker: 'EARL', text: 'You\'ll know the light when you see it.' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FINALE: Candlelight at 11:58 — floods dip, beacon, midnight door opens
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'finale-candlelight',
    title: 'Candlelight at 11:58',
    duration: 24,
    letterbox: {
      in: 1.0,
      out: 1.2,
      height: 0.11,
    },
    camera: {
      center: { x: 64, z: 62 },
      keyframes: [
        // Wide shot of the yard: pre-midnight, floods still bright
        { t: 0, x: 40, y: 25, z: 40, look: { x: 64, y: 8, z: 62 }, ease: 'linear' },
        // Slow pan north, as the floods begin to dip
        { t: 7, x: 50, y: 24, z: 30, look: { x: 64, y: 8, z: 62 }, ease: 'inout' },
        // Close on the timing post — 11:58 ticks
        { t: 14, x: 75, y: 12, z: 55, look: { x: 85, y: 10, z: 60 }, ease: 'out' },
        // Rise and pull back: the candlelight beacon moves into view
        { t: 19, x: 60, y: 20, z: 35, look: { x: 64, y: 8, z: 62 }, ease: 'inout' },
        // Final: the midnight-race door opens — camera steady
        { t: 24, x: 60, y: 20, z: 35, look: { x: 64, y: 8, z: 62 }, ease: 'linear' },
      ],
    },
    subtitles: [
      { t: 1.0, end: 4.0, speaker: 'EARL', text: 'Floods down. Everything goes quiet.' },
      { t: 4.5, end: 8.0, speaker: 'EARL', text: 'That\'s the yard remembering what it is.' },
      { t: 8.5, end: 12.0, speaker: 'EARL', text: 'One candle takes the corner.' },
      { t: 12.5, end: 16.0, speaker: 'EARL', text: 'Timing post clicks 11:58. Never changes.' },
      { t: 16.5, end: 20.0, speaker: 'EARL', text: 'Then midnight comes. The door opens.' },
      { t: 20.5, end: 23.5, speaker: 'EARL', text: 'That\'s where the real race starts.' },
    ],
  },
];

// Register cutscenes on module load
registerCutscenes(CUTSCENES);

/**
 * Export the registered cutscenes for access by id.
 */
export function getCutscenesRegistry() {
  return getCutscenes();
}
