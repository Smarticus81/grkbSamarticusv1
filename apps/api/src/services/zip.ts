/**
 * Minimal pure-Node ZIP writer. Produces an uncompressed (STORED) ZIP
 * archive. Sufficient for shipping a small downloadable agent bundle
 * without adding `archiver`/`jszip` to the dependency tree.
 *
 * Spec: APPNOTE.TXT 6.3.4, sections 4.3.7 (local file header),
 *       4.3.12 (central directory header), 4.3.16 (EOCD).
 */

import { Buffer } from 'node:buffer';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

interface ZipEntry {
  path: string;
  data: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(files: Array<{ path: string; content: string | Buffer }>): Buffer {
  const entries: Array<{
    path: Buffer;
    crc: number;
    compressed: Buffer;
    uncompressedSize: number;
    method: 0 | 8;
    offset: number;
  }> = [];
  const localChunks: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const data: Buffer = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    const pathBuf = Buffer.from(f.path, 'utf8');
    const compressed = data.length > 0 ? deflateRawSync(data) : Buffer.alloc(0);
    // Use deflate when smaller, otherwise store.
    const useDeflate = compressed.length < data.length;
    const stored = useDeflate ? compressed : data;
    const method: 0 | 8 = useDeflate ? 8 : 0;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(method, 8);      // method
    local.writeUInt16LE(0, 10);          // mod time
    local.writeUInt16LE(0x21, 12);       // mod date (jan 1 1980 + something)
    local.writeUInt32LE(crc, 14);        // crc-32
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(pathBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra length

    entries.push({ path: pathBuf, crc, compressed: stored, uncompressedSize: data.length, method, offset });
    localChunks.push(local, pathBuf, stored);
    offset += local.length + pathBuf.length + stored.length;
  }

  const centralChunks: Buffer[] = [];
  let centralSize = 0;
  for (const e of entries) {
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);   // version made by
    c.writeUInt16LE(20, 6);   // version needed
    c.writeUInt16LE(0, 8);    // flags
    c.writeUInt16LE(e.method, 10);
    c.writeUInt16LE(0, 12);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(e.crc, 16);
    c.writeUInt32LE(e.compressed.length, 20);
    c.writeUInt32LE(e.uncompressedSize, 24);
    c.writeUInt16LE(e.path.length, 28);
    c.writeUInt16LE(0, 30); // extra
    c.writeUInt16LE(0, 32); // comment
    c.writeUInt16LE(0, 34); // disk
    c.writeUInt16LE(0, 36); // internal attrs
    c.writeUInt32LE(0, 38); // external attrs
    c.writeUInt32LE(e.offset, 42);
    centralChunks.push(c, e.path);
    centralSize += c.length + e.path.length;
  }

  const centralOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                 // disk number
  eocd.writeUInt16LE(0, 6);                 // start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);                // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
