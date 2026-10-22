/* 小さなZIP作成（Node標準のzlibだけを使う。追加インストール不要） */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function walk(dir, base) { let out = []; for (const f of fs.readdirSync(dir).sort()) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) out = out.concat(walk(p, base)); else out.push(p); } return out; }
// entries: [{ name: 'a/b.txt', data: Buffer }]
function zip(entries) {
  const parts = [], central = []; let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // 固定の日時（再現できるZIPにする）
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), data = e.data, comp = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, comp);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10); cen.writeUInt16LE(DOS_TIME, 12); cen.writeUInt16LE(DOS_DATE, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name); offset += 30 + name.length + comp.length;
  }
  const cenBuf = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(parts.concat([cenBuf, end]));
}
function zipDir(dir, prefix) { const base = path.dirname(dir); return zip(walk(dir).map(p => ({ name: (prefix ? prefix + '/' : '') + path.relative(dir, p).split(path.sep).join('/'), data: fs.readFileSync(p) }))); }
module.exports = { zip, zipDir, crc32 };
