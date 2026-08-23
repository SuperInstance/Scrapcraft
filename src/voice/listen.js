/**
 * VoiceIn — speech-to-text input for Spark dialogue and commands.
 * Hold-to-talk: start() begins recording, stop() resolves with transcript.
 * Falls back to Web Speech API if worker unavailable.
 */

const VOICE_WORKER = () => localStorage.getItem('scrapcraft_voice_worker') ?? 'https://scrap-voice.casey-digennaro.workers.dev';
const MAX_RECORD_TIME = 8000;
const STT_TIMEOUT = 10000;

export class VoiceIn {
  constructor() {
    this._recorder = null;
    this._stream = null;
    this._recording = false;
    this._chunks = [];
    this._startTime = 0;
  }

  /**
   * Start recording audio from the user's microphone.
   * Automatically stops after MAX_RECORD_TIME.
   */
  async start() {
    try {
      if (!this._stream) {
        this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      this._chunks = [];
      this._recording = true;
      this._startTime = Date.now();

      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/wav';
      }

      this._recorder = new MediaRecorder(this._stream, options);
      this._recorder.addEventListener('dataavailable', e => {
        if (e.data.size > 0) this._chunks.push(e.data);
      });

      this._recorder.start();

      setTimeout(() => {
        if (this._recording) this.stop();
      }, MAX_RECORD_TIME);
    } catch (err) {
      console.debug('[voice] microphone unavailable');
      throw err;
    }
  }

  /**
   * Stop recording and resolve with the transcript.
   */
  async stop() {
    if (!this._recording || !this._recorder) return '';

    this._recording = false;
    return new Promise((resolve) => {
      this._recorder.addEventListener('stop', async () => {
        try {
          const blob = new Blob(this._chunks, { type: this._recorder.mimeType });
          const transcript = await this._transcribe(blob);
          resolve(transcript);
        } catch (err) {
          console.debug('[voice] transcription failed', err);
          resolve('');
        }
      });
      this._recorder.stop();
    });
  }

  async _transcribe(blob) {
    try {
      return await this._transcribeViaWorker(blob);
    } catch (err) {
      console.debug('[voice] worker STT failed, falling back to Web Speech API');
      return await this._transcribeViaWebSpeech(blob);
    }
  }

  async _transcribeViaWorker(blob) {
    const url = `${VOICE_WORKER()}/stt`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STT_TIMEOUT);

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': blob.type },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.transcript || '';
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async _transcribeViaWebSpeech(blob) {
    if (!window.webkitSpeechRecognition) {
      return '';
    }
    return new Promise((resolve) => {
      const recognition = new webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(r => r[0].transcript)
          .join(' ');
        resolve(transcript);
      };

      recognition.onerror = () => resolve('');
      recognition.onend = () => resolve('');

      const reader = new FileReader();
      reader.onload = (e) => {
        const audio = new Uint8Array(e.target.result);
        recognition.stop();
        resolve('');
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Ask Spark a question via voice.
   * Records speech, sends to /dialogue endpoint, plays back answer.
   * Returns { answer, audio_b64, transcript, cached? }
   */
  async ask(question) {
    if (!question) return { answer: '', audio_b64: '', transcript: '', cached: false };

    try {
      return await this._askViaWorker(question);
    } catch (err) {
      console.debug('[voice] dialogue failed', err);
      return { answer: '', audio_b64: '', transcript: '', cached: false };
    }
  }

  async _askViaWorker(question) {
    const url = `${VOICE_WORKER()}/dialogue`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STT_TIMEOUT);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      return {
        answer: data.answer || '',
        audio_b64: data.audio_b64 || '',
        transcript: data.transcript || question,
        cached: data.tts_cache === 'HIT',
        playAudio: () => _playBase64Audio(data.audio_b64),
      };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}

async function _playBase64Audio(b64) {
  if (!b64) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const audioData = await ctx.decodeAudioData(bytes.buffer);
    const source = ctx.createBufferSource();
    source.buffer = audioData;
    source.connect(ctx.destination);
    source.start(0);

    return new Promise((resolve) => {
      source.onended = resolve;
    });
  } catch (err) {
    console.debug('[voice] base64 audio playback failed', err);
  }
}

export const voiceIn = new VoiceIn();
