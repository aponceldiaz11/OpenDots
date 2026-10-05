import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = (() => {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
};
const encodePng = (size, rgba) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

function draw(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const background = [15, 20, 18, 255];
  const green = [52, 211, 153, 255];
  const purple = [167, 139, 250, 255];
  const radius = size * 0.22;
  const inRounded = (x, y) => {
    if (x >= radius && x <= size - radius) return true;
    if (y >= radius && y <= size - radius) return true;
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
  };
  const circle = (cx, cy, r) => (x, y) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const center = size / 2;
  const r = size * 0.1;
  const offset = size * 0.16;
  const dots = [
    circle(center - offset, center - offset, r),
    circle(center + offset, center - offset, r),
    circle(center - offset, center + offset, r),
    circle(center + offset, center + offset, r),
  ];
  const middle = circle(center, center, size * 0.075);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let color = inRounded(px, py) ? background : [0, 0, 0, 0];
      if (color[3]) {
        for (const inDot of dots)
          if (inDot(px, py)) {
            color = green;
            break;
          }
        if (middle(px, py)) color = purple;
      }
      const index = (y * size + x) * 4;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = color[3];
    }
  return pixels;
}

for (const [name, size] of [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
]) {
  writeFileSync(name, encodePng(size, draw(size)));
  console.log(`wrote ${name} (${size}px)`);
}
