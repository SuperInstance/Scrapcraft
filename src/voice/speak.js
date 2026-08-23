/**
 * VoiceOut — TTS output for Spark, race announcements, and UI feedback.
 * Queues speech lines, respects mute, falls back to Web Speech if worker unavailable.
 */

const VOICE_WORKER = () => localStorage.getItem('scrapcraft_voice_worker') ?? 'https://scrap-voice.casey-digennaro.workers.dev';
const TTS_TIMEOUT = 6000;
const VOICE_RATE = { spark: 1.15, earl: 0.9, announcer: 1.05, rivet: 1.32, bolt: 1.12, magma: 0.85, juno: 1.4 };
const VOICE_PITCH = { spark: 1.3, earl: 0.7, announcer: 0.9, rivet: 1.55, bolt: 0.8, magma: 0.55, juno: 1.75 };

export class VoiceOut {
  constructor() {
    this._ctx = null;
    this._playing = null;
    this._queue = [];
    this._muted = false;
    this._audible = true;
  }

  // Turn off voice (respects UI mute toggle)
  setMuted(bool) {
    this._muted = bool;
  }

  // Check mute state (controlled by setMuted)
  _isMuted() {
    return this._muted;
  }

  /**
   * Queue a line for speech.
   * If text is already queued/playing, drop the duplicate.
   * @param {string} text
   * @param {object} opts { voice: 'spark'|'earl'|'announcer', emotion?: string }
   */
  async speak(text, { voice = 'spark', emotion } = {}) {
    if (!text || this._isMuted()) return;

    if (this._queue.find(q => q.text === text && q.voice === voice) ||
        (this._playing && this._playing.text === text && this._playing.voice === voice)) {
      return;
    }

    const item = { text, voice, emotion };
    this._queue.push(item);
    if (!this._playing) this._playNext();
  }

  /**
   * Fire-and-forget warm of TTS cache for known lines.
   */
  preload(lines) {
    if (!Array.isArray(lines)) return;
    for (const text of lines) {
      this._warmCache(text).catch(() => {});
    }
  }

  async _warmCache(text) {
    const url = `${VOICE_WORKER()}/tts`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'spark' }),
        signal: AbortSignal.timeout(TTS_TIMEOUT),
      });
    } catch (_) {}
  }

  async _playNext() {
    if (this._queue.length === 0) {
      this._playing = null;
      return;
    }
    const item = this._queue.shift();
    this._playing = item;

    try {
      await this._playViaWorker(item);
    } catch (err) {
      console.debug('[voice] worker failed, falling back to Web Speech API');
      this._playViaWebSpeech(item);
    }
    this._playNext();
  }

  async _playViaWorker(item) {
    const { text, voice, emotion } = item;
    const url = `${VOICE_WORKER()}/tts`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, emotion }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      await this._playBlob(blob);
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async _playBlob(blob) {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }

    const arrayBuf = await blob.arrayBuffer();
    const audioData = await this._ctx.decodeAudioData(arrayBuf);
    const source = this._ctx.createBufferSource();
    source.buffer = audioData;

    const gain = this._ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(gain);
    gain.connect(this._ctx.destination);

    return new Promise((resolve) => {
      source.onended = resolve;
      source.start(0);
    });
  }

  _playViaWebSpeech(item) {
    const { text, voice } = item;
    if (!window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = VOICE_RATE[voice] ?? 1.0;
    utterance.pitch = VOICE_PITCH[voice] ?? 1.0;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}

export const voiceOut = new VoiceOut();
