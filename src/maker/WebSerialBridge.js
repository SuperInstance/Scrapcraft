/**
 * WebSerialBridge — push a MicroPython program to a real device over USB.
 *
 * Works with any board running MicroPython (ESP32, Pi Pico, Pi Pico W, etc.).
 * Uses the REPL paste mode protocol (Ctrl+E / Ctrl+D) — no bootloader, no
 * esptool, no Arduino IDE. Just Chrome + a USB cable.
 *
 * Supported browsers: Chrome ≥ 89, Edge ≥ 89 (requires https or localhost).
 * Gracefully absent on Firefox / Safari — the Flash button simply hides itself.
 */

export class WebSerialBridge {
  constructor() {
    this._port    = null;
    this._reader  = null;
    this._looping = false;
    this._buf     = '';

    /** Called with each text line received from the device. */
    this.onLine = null;

    /**
     * Called when connection state changes.
     * Possible values: 'connected' | 'disconnected' | 'flashing' | 'running' | 'error'
     */
    this.onStatus = null;
  }

  /** True when the Web Serial API is available in this browser. */
  get isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /** True when a port is open. */
  get isConnected() {
    return this._port !== null;
  }

  /**
   * Open the browser port picker and connect at 115 200 baud.
   * Must be called from a user gesture (button click).
   */
  async connect() {
    if (!this.isSupported) {
      throw new Error('Web Serial is not supported. Use Chrome or Edge.');
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    this._port = port;
    this._startReadLoop();
    this.onStatus?.('connected');
  }

  /** Close the port. Safe to call even if not connected. */
  async disconnect() {
    this._looping = false;
    try { await this._reader?.cancel(); } catch {}
    this._reader = null;
    const p = this._port;
    this._port = null;
    try { await p?.close(); } catch {}
    this.onStatus?.('disconnected');
  }

  /**
   * Flash a MicroPython program to the connected device using REPL paste mode.
   *
   * Protocol:
   *   Ctrl+C  ×2  interrupt any running program
   *   Ctrl+E      enter paste mode (device echoes "paste mode; Ctrl-C to cancel, Ctrl-D to finish")
   *   <code>      the full program text, sent in small chunks
   *   Ctrl+D      exit paste mode and run
   */
  async flash(micropythonCode) {
    if (!this.isConnected) throw new Error('Not connected to a device.');
    this.onStatus?.('flashing');

    await this._write('\x03\x03');   // Ctrl+C ×2 — interrupt
    await _sleep(300);
    await this._write('\x05');       // Ctrl+E — enter paste mode
    await _sleep(150);

    // Send in 256-byte chunks to avoid overflowing the device's UART buffer.
    const CHUNK = 256;
    for (let i = 0; i < micropythonCode.length; i += CHUNK) {
      await this._write(micropythonCode.slice(i, i + CHUNK));
      if (i + CHUNK < micropythonCode.length) await _sleep(15);
    }

    await this._write('\n\x04');    // newline + Ctrl+D — execute
    await _sleep(100);
    this.onStatus?.('running');
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _startReadLoop() {
    this._looping = true;
    const decoder = new TextDecoder();

    const loop = async () => {
      while (this._looping && this._port) {
        let reader;
        try {
          reader = this._port.readable.getReader();
          this._reader = reader;
          while (this._looping) {
            const { value, done } = await reader.read();
            if (done) break;
            this._buf += decoder.decode(value);
            const parts = this._buf.split('\n');
            this._buf = parts.pop() ?? '';
            for (const raw of parts) {
              // Strip ANSI escape codes and CR so lines are clean.
              const line = raw.replace(/\x1b\[[0-9;]*[mGKHJ]/g, '').replace(/\r/g, '').trim();
              if (line) this.onLine?.(line);
            }
          }
        } catch (e) {
          if (this._looping) {
            console.warn('[WebSerialBridge] Read error:', e);
            this.onStatus?.('error');
          }
        } finally {
          try { reader?.releaseLock(); } catch {}
        }
        if (!this._looping) break;
        await _sleep(100);
      }
    };

    loop();
  }

  async _write(str) {
    if (!this._port?.writable) return;
    const writer = this._port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(str));
    } finally {
      writer.releaseLock();
    }
  }
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
