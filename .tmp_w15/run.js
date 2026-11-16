const fs = require("node:fs");
const { makePng, makeWav } = require("./mock");
const { imageInfo } = require("./image-info");
const { splitWav } = require("./split-wav");

const png = makePng(64, 48, [30, 120, 200]);
fs.writeFileSync("t.png", png);
console.log("png bytes", png.length, "info", imageInfo(png));

// 合成一个只有头部和 SOF0 的 JPEG，用来测宽高解析
function fakeJpeg(w, h) {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
}
console.log("jpeg info", imageInfo(fakeJpeg(1024, 768)));

const wav = makeWav(3, 16000);
fs.writeFileSync("t.wav", wav);
console.log("wav bytes", wav.length, "header", wav.toString("ascii", 0, 4), wav.readUInt32LE(24));

const parts = splitWav(wav, 1);
console.log("parts", parts.length, parts.map((p) => [p.index, p.startSecond, p.buffer.length, p.buffer.readUInt32LE(40)]));
const back = splitWav(parts[0].buffer, 1);
console.log("resplit part1 ->", back.length, back[0].buffer.readUInt32LE(40));
