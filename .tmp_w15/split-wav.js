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

  const header = Buffer.alloc(44);
  return parts.map((chunk, index) => {
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
      buffer: Buffer.concat([Buffer.from(header), chunk]),
    };
  });
}

module.exports = { splitWav };
