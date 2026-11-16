const fs = require("node:fs");
const path = require("node:path");

function splitWav(buf, secondsPerPart) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("不是 WAV 文件：文件头不是 RIFF/WAVE");
  }

  let pos = 12;
  let fmt = null;
  let data = null;

  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = buf.subarray(pos + 8, pos + 8 + size);
    if (id === "fmt ") fmt = body;
    if (id === "data") data = body;
    pos += 8 + size + (size % 2);
  }

  if (!fmt || !data) throw new Error("WAV 缺少 fmt 或 data 块");
  if (fmt.readUInt16LE(0) !== 1) throw new Error("只支持 PCM 编码的 WAV，压缩格式请先转码");

  const sampleRate = fmt.readUInt32LE(4);
  const channels = fmt.readUInt16LE(2);
  const bits = fmt.readUInt16LE(14);
  const blockAlign = channels * (bits / 8);
  const bytesPerPart = Math.floor(secondsPerPart * sampleRate) * blockAlign;

  const parts = [];
  for (let offset = 0; offset < data.length; offset += bytesPerPart) {
    parts.push(data.subarray(offset, Math.min(offset + bytesPerPart, data.length)));
  }

  return parts.map((chunk, index) => {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + chunk.length, 4);
    header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * blockAlign, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bits, 34);
    header.write("data", 36, "ascii");
    header.writeUInt32LE(chunk.length, 40);
    return {
      index: index + 1,
      startSecond: Number(((index * bytesPerPart) / blockAlign / sampleRate).toFixed(2)),
      buffer: Buffer.concat([header, chunk]),
    };
  });
}

if (require.main === module) {
  const input = process.argv[2];
  const seconds = Number(process.argv[3] || 60);
  const outDir = process.argv[4];

  if (!input) {
    console.log("用法：node scripts/split-wav.js <输入.wav> <每段秒数> [输出目录]");
    process.exit(1);
  }

  const buf = fs.readFileSync(input);
  const parts = splitWav(buf, seconds);
  const dir = outDir || path.join(path.dirname(input), "parts");
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(input, path.extname(input));

  for (const part of parts) {
    const file = path.join(dir, base + "-part" + part.index + ".wav");
    fs.writeFileSync(file, part.buffer);
    console.log("写出 " + file + " 起点 " + part.startSecond + " 秒 大小 " + part.buffer.length + " 字节");
  }
  console.log("一共 " + parts.length + " 段");
}

module.exports = { splitWav };
