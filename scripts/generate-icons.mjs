import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const sizes = [16, 32, 48, 128];
mkdirSync("public/icons", { recursive: true });

for (const size of sizes) {
  writeFileSync(`public/icons/icon-${size}.png`, createPng(size));
}

function createPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 4;
      const inGlyph = x > size * 0.22 && x < size * 0.78 && y > size * 0.22 && y < size * 0.78;
      const edge = x < size * 0.08 || y < size * 0.08 || x > size * 0.92 || y > size * 0.92;
      raw[i] = inGlyph ? 255 : edge ? 24 : 36;
      raw[i + 1] = inGlyph ? 255 : edge ? 88 : 99;
      raw[i + 2] = inGlyph ? 255 : edge ? 211 : 235;
      raw[i + 3] = 255;
      if (inGlyph && Math.abs(x - y) < size * 0.08) {
        raw[i] = 16;
        raw[i + 1] = 185;
        raw[i + 2] = 129;
      }
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr(size)),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function ihdr(size) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(size, 0);
  buffer.writeUInt32BE(size, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
