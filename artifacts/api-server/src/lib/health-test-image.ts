import { deflateSync } from "node:zlib";

// A deterministic 128×96 PNG: a red square and blue circle on white.
// Synthetic diagnostic fixture only; no candidate screenshot or external file.
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const width = 128;
const height = 96;
const pixels = Buffer.alloc(height * (1 + width * 3));
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const square = x >= 16 && x < 48 && y >= 32 && y < 64;
    const circle = (x - 92) ** 2 + (y - 48) ** 2 <= 20 ** 2;
    const color = square ? [220, 38, 38] : circle ? [37, 99, 235] : [255, 255, 255];
    const offset = y * (1 + width * 3) + 1 + x * 3;
    for (let c = 0; c < 3; c++) pixels[offset + c] = color[c];
  }
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 2; // RGB, 8-bit, non-interlaced.
export const HEALTH_TEST_IMAGE = `data:image/png;base64,${Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]).toString("base64")}`;
