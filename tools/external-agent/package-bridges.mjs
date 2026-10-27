/** Reproducible ZIP downloads, built only from checked-in bridge sources. No external dependencies. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
const directory = fileURLToPath(new URL('../../packages/web/public/', import.meta.url));
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value >>> 0;
});
const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; };
export function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const [filename, content] of files) {
    const name = Buffer.from(filename), data = Buffer.from(content), compressed = deflateRawSync(data), crc = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x21, 12); // Valid, reproducible DOS date: 1980-01-01 (month/day cannot be zero).
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8); record.writeUInt16LE(8, 10);
    record.writeUInt16LE(0x21, 14);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, name); offset += header.length + name.length + compressed.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, index, end]);
}
for (const agent of ['codex', 'opencode', 'qoder']) {
  const names = ['studentbuddy-agent-chat-http.mjs', `studentbuddy-${agent}-bridge.mjs`, ...(agent === 'codex' ? ['studentbuddy-codex-rpc.mjs'] : agent === 'opencode' ? ['studentbuddy-opencode-client.mjs', 'studentbuddy-opencode-backend.mjs'] : ['studentbuddy-qoder-client.mjs'])];
  const readme = `StudentBuddy ${agent} text bridge\r\n\r\nRequires Node.js 22+ and installed, configured ${agent}.\r\nExtract all files into one folder, then run:\r\n  node studentbuddy-${agent}-bridge.mjs\r\n\r\nPaste the content of the printed pairing-key FILE into StudentBuddy settings. The key itself is never printed.\r\nBase URL: http://127.0.0.1:${{ codex: 4012, opencode: 4013, qoder: 4015 }[agent]}/v1\r\nModel: default${agent === 'opencode' ? ' (or provider/model from Test connection)' : agent === 'qoder' ? ' (or the exact model name from Test connection)' : ''}\r\n\r\n${agent === 'qoder' ? 'Official CLI login is separate from desktop login: qodercn login (CN) / qoder login.\r\nSet SB_QODER_CLI to the absolute Node CLI entry, or SB_QODER_BIN to a native executable, if discovery fails.\r\n' : ''}Text only. No automatic model fallback. Current conversation history is replayed by StudentBuddy.\r\n`;
  fs.writeFileSync(path.join(directory, `studentbuddy-${agent}-bridge.zip`), zip([...names.map(name => [name, fs.readFileSync(path.join(directory, name))]), ['README.txt', readme]]));
}
