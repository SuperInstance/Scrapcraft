export const RADIO_STATES = ['IDLE', 'RECEIVING', 'TRANSMITTING'];
export const MAX_TX_MS = 8000;

export class VhfRadio {
  constructor({ channel = 'coach', onState = null, clock = Date.now } = {}) {
    this._channel = channel;
    this._state = 'IDLE';
    this._speaker = null;
    this._squelchOpen = false;
    this._txStartMs = null;
    this.onState = onState;
    this.clock = clock;
  }

  get state() {
    return this._state;
  }

  get channel() {
    return this._channel;
  }

  get speaker() {
    return this._speaker;
  }

  get squelchOpen() {
    return this._squelchOpen;
  }

  isBusy() {
    return this._state !== 'IDLE';
  }

  canTransmit() {
    if (this._state !== 'IDLE') {
      return { ok: false, reason: 'CHANNEL_BUSY' };
    }
    return { ok: true, reason: null };
  }

  beginTransmit() {
    const check = this.canTransmit();
    if (!check.ok) return check;

    const now = this.clock();
    this._txStartMs = now;
    this._setState('TRANSMITTING');
    this._squelchOpen = true;
    return { ok: true, reason: null };
  }

  endTransmit() {
    if (this._state === 'TRANSMITTING') {
      this._squelchOpen = false;
      this._txStartMs = null;
      this._setState('IDLE');
    }
    return { ok: true };
  }

  beginReceive(speakerId) {
    if (this._state === 'TRANSMITTING') {
      return { ok: false, reason: 'CHANNEL_BUSY' };
    }

    this._speaker = speakerId;
    this._setState('RECEIVING');
    this._squelchOpen = false;
    return { ok: true };
  }

  endReceive(speakerId) {
    if (this._speaker === speakerId && this._state === 'RECEIVING') {
      this._speaker = null;
      this._setState('IDLE');
    }
    return { ok: true };
  }

  setChannel(name) {
    if (this._state !== 'IDLE') {
      return { ok: false, reason: 'CHANNEL_BUSY' };
    }
    this._channel = name;
    return { ok: true };
  }

  tick(now = null) {
    now = now ?? this.clock();

    if (this._state === 'TRANSMITTING' && this._txStartMs !== null) {
      if (now - this._txStartMs >= MAX_TX_MS) {
        this._squelchOpen = false;
        this._txStartMs = null;
        this._setState('IDLE');
      }
    }
  }

  _setState(newState) {
    if (newState === this._state) return;
    const oldState = this._state;
    this._state = newState;

    if (this.onState) {
      try {
        this.onState({
          from: oldState,
          to: newState,
          channel: this._channel,
          speaker: this._speaker,
        });
      } catch {
        // Fail soft: never throw from callbacks
      }
    }
  }
}

export class RadioStack {
  constructor({ onState = null, clock = Date.now } = {}) {
    this.clock = clock;
    this.radios = {
      coach: new VhfRadio({ channel: 'coach', onState, clock }),
      chatter: new VhfRadio({ channel: 'chatter', onState, clock }),
    };
  }
}
