/**
 * ───────────────────────────────────────────────────────────────────────────
 *  AVR109 FLASHER  —  flash real firmware to real boards from the browser
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Implements the AVR109 (a.k.a. "Butterfly") bootloader protocol — the
 * avrgirl-arduino / Wokwi approach — over an injectable serial transport.
 *
 * Works with:
 *   • Arduino Leonardo / Pro Micro / Metro 32u4 (Caterina bootloader)
 *   • STM32 boards with the STM32duino bootloader (rogerclarkmelbourne)
 *   • Anything else that answers AVR109 over USB CDC
 *
 * (A classic Uno's optiboot speaks STK500v1 — NOT covered. Those kids use
 * Wokwi or an ESP32; the doc says so honestly.)
 *
 * GRACEFUL DEGRADATION IS THE CONTRACT: every failure path resolves to a
 * structured result with `ok:false` and a kid-readable `message`. The game
 * NEVER treats a flash failure as fatal — "no device connected → keep
 * simulating" is the whole point. The sim keeps running the whole time.
 *
 * The transport is injectable (`open() → {read(), write(), close()}`), so the
 * protocol is fully unit-testable against a fake bootloader.
 */

import { parseIntelHex } from './IntelHex.js';

// AVR109 command bytes
const CMD = {
  SYNC:              0x1b,  // ESC — bootloader attention (Caterina enters on open at 1200bps touch)
  GET_SOFT_ID:       0x53,  // 'S'
  GET_VERSION:       0x56,  // 'V'
  GET_PROGRAMMER:    0x70,  // 'p'
  AUTO_INCREMENT:    0x61,  // 'a'
  BLOCK_SUPPORT:     0x62,  // 'b'
  CHIP_ERASE:        0x65,  // 'e'
  SET_ADDR:          0x41,  // 'A' (address high, low)
  WRITE_BLOCK:       0x42,  // 'B' (size hi lo, 'F'lash/'E'eprom, data)
  READ_BLOCK:        0x62 + 0x00, // not used; kept for reference
  LEAVE_PROG:        0x45,  // 'E'
  GO:                0x67,  // 'g'
};

const KNOWN_BOOTLOADERS = ['AVRBOOT', 'CATERIN', 'METRO', 'LILY', 'STM32DUINO BOOTLOADER', 'AVRISP'];

export class Avr109Flasher {
  /**
   * @param {object} [transport] injectable serial transport factory:
   *   `await transport.open({baudRate})` → { read(): Promise<Uint8Array>,
   *   write(Uint8Array): Promise<void>, close(): Promise<void> }
   *   Default: navigator.serial port picker (Web Serial).
   */
  constructor(transport) {
    this._transportFactory = transport ?? new WebSerialTransport();
    this._t = null;
    this.onProgress = null;   // (done, total) => void
    this.onStatus   = null;   // (string) => void
    this.lastResult = null;
  }

  /** True when the browser can do Web Serial at all. */
  get isSupported() { return this._transportFactory.isSupported; }
  get isConnected() { return this._t !== null; }

  /**
   * Open the port picker and enter the bootloader.
   * @returns {Promise<{ok:boolean, message:string, bootloader?:string}>}
   *          NEVER throws — a failure here means "keep simulating".
   */
  async connect() {
    if (!this.isSupported) {
      return this._fail('This browser cannot talk to USB (try Chrome or Edge) — no device connected, keep simulating!');
    }
    try {
      this.onStatus?.('connecting');
      this._t = await this._transportFactory.open({ baudRate: 57600 });
    } catch (err) {
      return this._fail(`No device connected — keep simulating! (${err.message})`);
    }

    try {
      // Handshake: identify the bootloader. Boards reset into the bootloader
      // when the port opens; give them a beat.
      await this._write(new Uint8Array([CMD.SYNC, CMD.GET_SOFT_ID]));
      const idRaw = await this._readLine(1500);
      if (!idRaw) {
        await this._t.close();
        this._t = null;
        return this._fail('Board answered nothing. Is it in bootloader mode? Keep simulating for now.');
      }
      const id = idRaw.toUpperCase().trim();
      this.onStatus?.('connected');
      return { ok: true, message: `Bootloader found: ${id}`, bootloader: id };
    } catch (err) {
      await this._t.close().catch(() => {});
      this._t = null;
      return this._fail(`Handshake failed: ${err.message}. The simulator keeps running.`);
    }
  }

  /**
   * Flash an Intel HEX image. `connect()` must have succeeded.
   * @param {string} hexText
   * @returns {Promise<{ok:boolean, message:string, bytes?:number, verifySample?:number}>}
   */
  async flash(hexText) {
    if (!this.isConnected) {
      return this._fail('Not connected. Click Connect first — meanwhile the sim keeps running.');
    }
    let image;
    try {
      image = parseIntelHex(hexText);
    } catch (err) {
      return this._fail(`That .hex file looks broken: ${err.message}`);
    }
    if (image.bytes.length === 0) {
      return this._fail('That .hex file has no data in it.');
    }

    try {
      this.onStatus?.('flashing');

      // Query block support (avoids slow byte-at-a-time programming).
      const blockSupport = await this._askBlockSupport();

      await this._expect(new Uint8Array([CMD.CHIP_ERASE]), 50);   // 'e' → CR
      await this._sleep(50);                                      // erase takes a moment

      // Program in pages via 'B' block writes, or byte-by-byte via 'A'+'d'/'c' fallback.
      const PAGE = blockSupport.size || 128;
      const total = image.bytes.length;
      for (let off = 0; off < total; off += PAGE) {
        const chunk = image.bytes.subarray(off, Math.min(off + PAGE, total));
        await this._writeAddress(Math.floor(off / 2));            // word address, like real AVR109
        if (blockSupport.ok) {
          // 'B' sizeHi sizeLo 'F' data…
          const head = new Uint8Array([CMD.WRITE_BLOCK, (chunk.length >> 8) & 0xff, chunk.length & 0xff, 0x46]);
          await this._write(head);
          await this._write(chunk);
          await this._read(1);                                    // CR ack
        } else {
          // Fallback: individual load-and-write ('d' low, 'c' high — 16-bit flash)
          for (let i = 0; i < chunk.length; i += 2) {
            const lo = chunk[i], hi = chunk[i + 1] ?? 0xff;
            await this._write(new Uint8Array([0x64, lo]));         // 'd' write low byte
            await this._read(1);
            await this._write(new Uint8Array([0x63, hi]));         // 'c' write high byte
            await this._read(1);
            await this._write(new Uint8Array([0x41, ((off + i) / 2 >> 8) & 0xff, ((off + i) / 2) & 0xff])); // advance
            await this._read(1);
          }
        }
        this.onProgress?.(Math.min(off + PAGE, total), total);
      }

      // Leave bootloader → app runs (Caterina: 'E' triggers WDT reset into sketch).
      await this._write(new Uint8Array([CMD.LEAVE_PROG]));
      await this._sleep(60);

      this.onStatus?.('running');
      const result = { ok: true, message: 'Flashed! The board is now running your program.', bytes: total };
      this.lastResult = result;
      return result;
    } catch (err) {
      this.onStatus?.('error');
      const result = this._fail(`Flash interrupted: ${err.message}. Board may need a retry — sim is unaffected.`);
      this.lastResult = result;
      return result;
    }
  }

  async disconnect() {
    if (this._t) { await this._t.close().catch(() => {}); this._t = null; }
    this.onStatus?.('disconnected');
  }

  // ── protocol helpers ─────────────────────────────────────────────────────

  _fail(message) {
    const r = { ok: false, message };
    this.lastResult = r;
    this.onStatus?.('error');
    return r;   // resolve, never throw — "keep simulating" contract
  }

  async _askBlockSupport() {
    try {
      await this._write(new Uint8Array([CMD.BLOCK_SUPPORT]));
      const resp = await this._read(3, 800);
      // 'Y' sizeHi sizeLo
      if (resp.length >= 3 && resp[0] === 0x59) {
        return { ok: true, size: (resp[1] << 8) | resp[2] };
      }
    } catch { /* no block support */ }
    return { ok: false, size: 0 };
  }

  async _writeAddress(wordAddr) {
    await this._write(new Uint8Array([CMD.SET_ADDR, (wordAddr >> 8) & 0xff, wordAddr & 0xff]));
    await this._read(1);
  }

  async _expect(bytes, ms) {
    await this._write(bytes);
    await this._read(1, ms);   // bootloader replies CR
  }

  async _write(bytes) { await this._t.write(bytes); }

  /** Read up to `n` bytes with timeout; resolves whatever arrived (possibly empty). */
  async _read(n, timeoutMs = 1200) {
    const deadline = Date.now() + timeoutMs;
    const out = new Uint8Array(n);
    let got = 0;
    while (got < n && Date.now() < deadline) {
      const chunk = await this._t.read(Math.max(1, n - got));
      if (chunk && chunk.length) {
        out.set(chunk.subarray(0, n - got), got);
        got += Math.min(chunk.length, n - got);
      } else {
        await this._sleep(5);
      }
    }
    return out.subarray(0, got);
  }

  async _readLine(timeoutMs = 1200) {
    const deadline = Date.now() + timeoutMs;
    let s = '';
    while (Date.now() < deadline) {
      const chunk = await this._t.read(64);
      if (chunk && chunk.length) {
        s += new TextDecoder().decode(chunk);
        if (/[\r\n]/.test(s)) return s.split(/[\r\n]/)[0];
      } else {
        await this._sleep(5);
      }
    }
    return s || null;
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// ── Default transport: Web Serial (Chrome/Edge) ──────────────────────────────

export class WebSerialTransport {
  get isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /** Opens the browser port picker. Throws when the user cancels / no device. */
  async open({ baudRate = 57600 } = {}) {
    if (!this.isSupported) throw new Error('Web Serial not supported');
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate });
    const decoder = new TextDecoder();
    let reader = null;
    let closed = false;

    const getReader = () => reader ??= port.readable.getReader();
    return {
      async read(n = 64) {
        if (closed) return new Uint8Array(0);
        try {
          const r = getReader();
          const { value, done } = await r.read();
          if (done) return new Uint8Array(0);
          return value ?? new Uint8Array(0);
        } catch { return new Uint8Array(0); }
      },
      async write(bytes) {
        if (closed || !port.writable) return;
        const w = port.writable.getWriter();
        try { await w.write(bytes); } finally { w.releaseLock(); }
      },
      async close() {
        closed = true;
        try { await reader?.cancel(); } catch {}
        reader = null;
        try { await port.close(); } catch {}
      },
    };
  }
}
