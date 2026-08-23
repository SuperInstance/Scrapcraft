/**
 * Voice module — text-to-speech, speech-to-text, race announcements.
 */

export { voiceOut, VoiceOut } from './speak.js';
export { voiceIn, VoiceIn } from './listen.js';
export {
  announceRaceStart,
  announceLap,
  announcePersonalBest,
  announceCrash,
  announceFinish,
  announceVictory,
  announceDefeat,
  preloadAnnouncements,
} from './announcer.js';
