/**
 * Race announcements via cached bank audio (pre-rendered) or TTS fallback.
 * Debounced to 1 line per 2 seconds during active race.
 */

import { voiceOut } from './speak.js';

const VOICE_WORKER = () => localStorage.getItem('scrapcraft_voice_worker') ?? 'https://scrap-voice.casey-digennaro.workers.dev';
const BANK_TIMEOUT = 3000;
const DEBOUNCE_MS = 2000;

let _lastAnnouncementTime = 0;

async function _playBankAudio(name) {
  const url = `${VOICE_WORKER()}/bank/${name}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BANK_TIMEOUT);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const arrayBuf = await blob.arrayBuffer();
    const audioData = await ctx.decodeAudioData(arrayBuf);
    const source = ctx.createBufferSource();
    source.buffer = audioData;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(gain);
    gain.connect(ctx.destination);

    return new Promise((resolve) => {
      source.onended = resolve;
      source.start(0);
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function _debounce() {
  const now = Date.now();
  if (now - _lastAnnouncementTime < DEBOUNCE_MS) return false;
  _lastAnnouncementTime = now;
  return true;
}

/**
 * Race start announcement.
 */
export async function announceRaceStart() {
  if (!_debounce()) return;
  try {
    await _playBankAudio('announcer-race-start');
  } catch (_) {
    voiceOut.speak("Let's race!", { voice: 'announcer' });
  }
}

/**
 * Lap completion announcement.
 * @param {number} lapNum - lap number (1, 2, 3, ...)
 */
export async function announceLap(lapNum) {
  if (!_debounce()) return;
  try {
    await _playBankAudio('announcer-lap');
  } catch (_) {
    const words = _numberToWords(lapNum);
    voiceOut.speak(`Lap ${words} complete!`, { voice: 'announcer' });
  }
}

/**
 * Personal best announcement.
 */
export async function announcePersonalBest() {
  if (!_debounce()) return;
  try {
    await _playBankAudio('announcer-personal-best');
  } catch (_) {
    voiceOut.speak('Personal best!', { voice: 'announcer' });
  }
}

/**
 * Crash announcement.
 */
export async function announceCrash() {
  if (!_debounce()) return;
  try {
    await _playBankAudio('announcer-crash');
  } catch (_) {
    voiceOut.speak('Crash!', { voice: 'announcer' });
  }
}

/**
 * Finish announcement.
 * @param {number} place - placement (1st, 2nd, 3rd, ...)
 */
export async function announceFinish(place) {
  if (!_debounce()) return;
  try {
    await _playBankAudio('announcer-finish');
  } catch (_) {
    const ordinal = _numberToOrdinal(place);
    voiceOut.speak(`Finished in ${ordinal} place!`, { voice: 'announcer' });
  }
}

/**
 * Victory announcement.
 */
export async function announceVictory() {
  if (!_debounce()) return;
  try {
    await _playBankAudio('announcer-victory');
  } catch (_) {
    voiceOut.speak('Victory!', { voice: 'announcer' });
  }
}

/**
 * Defeat announcement.
 */
export async function announceDefeat() {
  if (!_debounce()) return;
  try {
    await _playBankAudio('announcer-defeat');
  } catch (_) {
    voiceOut.speak('Try again!', { voice: 'announcer' });
  }
}

/**
 * Warm up the announcer cache for known lines.
 */
export function preloadAnnouncements() {
  voiceOut.preload([
    "Let's race!",
    'Lap one complete!',
    'Lap two complete!',
    'Lap three complete!',
    'Personal best!',
    'Victory!',
    'Try again!',
  ]);
}

function _numberToWords(n) {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return (n >= 1 && n <= 10) ? ones[n] : String(n);
}

function _numberToOrdinal(n) {
  if (n === 1) return 'first';
  if (n === 2) return 'second';
  if (n === 3) return 'third';
  return `${n}th`;
}
