/**
 * Intel HEX parser — the .hex format every Arduino IDE / Wokwi export emits.
 *
 *   :LLAAAATT[DD...]CC
 *    │ │    │  │      └ checksum (two's complement of the byte sum)
 *    │ │    │  └ record type: 00 data, 01 EOF, 04 extended linear address
 *    │ │    └ 16-bit address (within the current 64KiB page)
 *    │ └ byte count
 *   record mark
 *
 * Returns a flat Uint8Array covering [base, max] seen. Framework-free.
 */

export function parseIntelHex(text) {
  if (typeof text !== 'string') throw new Error('hex input must be a string');
  const bytes = [];
  let upper = 0;        // upper 16 bits from type-04 records
  let offset = null;    // base of the first data record (padding before it is dropped)
  let sawData = false, sawEof = false;

  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    if (!line.startsWith(':')) throw new Error(`line ${li + 1}: missing ':' record mark`);

    const rec = line.slice(1);
    if (rec.length < 10 || rec.length % 2 !== 0) throw new Error(`line ${li + 1}: malformed record length`);

    const bytesOf = (hex) => {
      const out = [];
      for (let i = 0; i < hex.length; i += 2) {
        const v = parseInt(hex.slice(i, i + 2), 16);
        if (Number.isNaN(v)) throw new Error(`line ${li + 1}: bad hex digit`);
        out.push(v);
      }
      return out;
    };
    const b = bytesOf(rec);
    const [count, addrHi, addrLo, type] = b;
    const data = b.slice(4, 4 + count);   // header is 4 bytes; checksum trails the data

    // checksum: all bytes + checksum ≡ 0 (mod 256)
    const sum = b.reduce((a, c) => a + c, 0) & 0xff;
    if (sum !== 0) throw new Error(`line ${li + 1}: checksum mismatch`);

    const addr16 = (addrHi << 8) | addrLo;

    switch (type) {
      case 0x00: { // data
        if (sawEof) throw new Error(`line ${li + 1}: data after EOF record`);
        const abs = upper + addr16;
        if (!sawData) { offset = abs; sawData = true; }
        for (let i = 0; i < count; i++) {
          const at = abs + i - offset;
          while (bytes.length < at) bytes.push(0xff);  // gaps read as erased flash
          bytes[at] = data[i];
        }
        break;
      }
      case 0x01: // EOF
        sawEof = true;
        break;
      case 0x04: // extended linear address (upper 16 bits)
        upper = ((data[0] << 8) | data[1]) * 0x10000;
        break;
      case 0x02: // extended segment address (rare; treat as linear upper)
        upper = ((data[0] << 8) | data[1]) * 16;
        break;
      default:   // 03/05 start-address records — ignore
        break;
    }
  }

  if (!sawData) throw new Error('no data records found');
  return { bytes: new Uint8Array(bytes), base: offset };
}
