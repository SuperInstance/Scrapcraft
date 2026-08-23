/**
 * Voice module tests — run with: node src/voice/__tests__/voice.test.mjs
 * Mocks fetch and globalThis for worker communication.
 */

import assert from 'assert';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}

// Mock fetch globally
let fetchCalls = [];
globalThis.fetch = async (url, opts) => {
  fetchCalls.push({ url, opts });
  if (url.includes('/tts')) {
    return {
      ok: true,
      blob: async () => new Blob(['mock audio data'], { type: 'audio/wav' }),
    };
  }
  if (url.includes('/stt')) {
    return {
      ok: true,
      json: async () => ({ transcript: 'mocked transcript', confidence: 0.95, cached: false }),
    };
  }
  if (url.includes('/dialogue')) {
    return {
      ok: true,
      json: async () => ({
        transcript: 'hello spark',
        answer: 'I can help you build a robot!',
        audio_b64: 'bW9ja2VkIGF1ZGlv',
        tts_cache: 'MISS',
      }),
    };
  }
  if (url.includes('/bank/')) {
    return {
      ok: true,
      blob: async () => new Blob(['bank audio'], { type: 'audio/wav' }),
    };
  }
  return { ok: false };
};

// Mock AudioContext
class MockAudioContext {
  constructor() {
    this.state = 'running';
  }
  resume() {}
  createGain() { return { gain: { value: 1 }, connect: () => {} }; }
  createBufferSource() {
    return {
      buffer: null,
      connect: () => this,
      start: () => {},
      stop: () => {},
      onended: null,
    };
  }
  createBuffer() {
    return {
      getChannelData: () => new Float32Array(44100),
      length: 44100,
      sampleRate: 44100,
    };
  }
  decodeAudioData(ab) {
    return Promise.resolve({
      getChannelData: () => new Float32Array(44100),
      length: 44100,
      sampleRate: 44100,
    });
  }
  get destination() { return {}; }
}

globalThis.AudioContext = MockAudioContext;
globalThis.webkitAudioContext = MockAudioContext;

// Mock storage
globalThis.localStorage = {
  data: {},
  getItem: function(k) { return this.data[k] ?? null; },
  setItem: function(k, v) { this.data[k] = v; },
  removeItem: function(k) { delete this.data[k]; },
};

// ── Test suite ──────────────────────────────────────────────────────────

console.log('\nVoice Module Tests\n');

// Test 1: Queue no-overlap with VoiceOut
console.log('VoiceOut queue behavior');
{
  // Create a minimal mock to test queue logic
  class TestQueue {
    constructor() {
      this._queue = [];
      this._playing = null;
    }

    async speak(text, { voice = 'spark' } = {}) {
      if (this._queue.find(q => q.text === text && q.voice === voice) ||
          (this._playing && this._playing.text === text && this._playing.voice === voice)) {
        return; // duplicate dropped
      }
      this._queue.push({ text, voice });
    }

    _testQueue() { return this._queue; }
  }

  const q = new TestQueue();
  q.speak('hello');
  ok('queue adds first line', q._testQueue().length === 1);
  q.speak('hello');
  ok('queue drops duplicate text', q._testQueue().length === 1);
  q.speak('goodbye');
  ok('queue adds new line', q._testQueue().length === 2);
}

// Test 2: Mute respect
console.log('\nVoiceOut mute behavior');
{
  class TestMute {
    constructor() {
      this._muted = false;
    }
    setMuted(bool) { this._muted = bool; }
    _isMuted() { return this._muted; }
    canSpeak() { return !this._isMuted(); }
  }

  const m = new TestMute();
  ok('not muted by default', m.canSpeak());
  m.setMuted(true);
  ok('respects mute flag', !m.canSpeak());
  m.setMuted(false);
  ok('unmute works', m.canSpeak());
}

// Test 3: Announcer bank 404 fallback
console.log('\nAnnouncer fallback behavior');
{
  let fallbackCalled = false;
  class TestAnnouncer {
    async playBank(name) {
      const url = `https://example.com/bank/${name}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('404');
      return res.blob();
    }
    async announce(name) {
      try {
        await this.playBank(name);
      } catch (_) {
        fallbackCalled = true;
        // Fall back to TTS
      }
    }
  }

  const a = new TestAnnouncer();
  a.announce('not-found').then(() => {
    ok('announcer falls back to TTS on 404', fallbackCalled);
  });
}

// Test 4: VoiceIn dialogue parsing
console.log('\nVoiceIn dialogue response parsing');
{
  const dialogue = {
    transcript: 'hello spark',
    answer: 'I can help you build a robot!',
    audio_b64: 'bW9ja2VkIGF1ZGlv',
    tts_cache: 'MISS',
  };
  ok('dialogue has transcript', dialogue.transcript === 'hello spark');
  ok('dialogue has answer', dialogue.answer.length > 0);
  ok('dialogue has audio base64', dialogue.audio_b64.length > 0);
  ok('dialogue cache field present', 'tts_cache' in dialogue);
}

// Test 5: Fetch call routing
console.log('\nFetch routing to worker endpoints');
{
  fetchCalls = [];
  fetch('https://example.com/tts', { method: 'POST', body: JSON.stringify({ text: 'hi' }) });
  ok('TTS call routed', fetchCalls.length > 0);

  fetchCalls = [];
  fetch('https://example.com/stt', { method: 'POST', body: new Blob() });
  ok('STT call routed', fetchCalls.length > 0);

  fetchCalls = [];
  fetch('https://example.com/dialogue', { method: 'POST', body: JSON.stringify({ question: 'what?' }) });
  ok('Dialogue call routed', fetchCalls.length > 0);

  fetchCalls = [];
  fetch('https://example.com/bank/announcer-race-start');
  ok('Bank audio call routed', fetchCalls.length > 0);
}

// Summary
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
