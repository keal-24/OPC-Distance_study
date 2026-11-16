function imageInfo(buf) {
  if (!buf || buf.length < 16) return null;

  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  if (buf.toString("ascii", 0, 3) === "GIF") {
    return { format: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9) break;
      const len = buf.readUInt16BE(i + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { format: "jpeg", width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
    return null;
  }

  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    if (buf.toString("ascii", 12, 16) === "VP8X") {
      const w = buf.readUIntLE(24, 3) + 1;
      const h = buf.readUIntLE(27, 3) + 1;
      return { format: "webp", width: w, height: h };
    }
    return { format: "webp", width: null, height: null };
  }

  return null;
}

module.exports = { imageInfo };
