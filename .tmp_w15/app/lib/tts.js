const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");
const { mockSpeech, sleep } = require("./mock");
const { db, now } = require("./db");

function cacheKey({ text, voice, speed, format }) {
  const raw = [config.TTS_MODEL || "mock", voice, speed, format, text].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

async function synthesize({ text, voice, speed, format }) {
  const content = String(text || "").trim();
  if (content.length === 0) {
    const err = new Error("要合成的文字是空的");
    err.name = "BadRequestError";
    throw err;
  }
  if (content.length > 2000) {
    const err = new Error("一次最多合成 2000 字，长文请分段");
    err.name = "BadRequestError";
    throw err;
  }

  const v = voice || "alloy";
  const s = Number(speed || 1);
  const f = format || "mp3";
  const key = cacheKey({ text: content, voice: v, speed: s, format: f });

  const hit = db.prepare("SELECT * FROM tts_cache WHERE key = ?").get(key);
  if (hit) {
    db.prepare("UPDATE tts_cache SET hits = hits + 1 WHERE key = ?").run(key);
    return { file: hit.file, format: hit.format, bytes: hit.bytes, cacheHit: true, key: key };
  }

  let buffer = null;
  let ext = f;

  if (config.MOCK) {
    await sleep(300);
    buffer = mockSpeech(content);
    ext = "wav";
  } else {
    if (!config.TTS_MODEL) {
      throw new Error("没有配置 TTS_MODEL：请在 .env 里填你账号可用的语音模型名，或者保持 MOCK=true");
    }
    const res = await fetch(config.BASE_URL + "/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.API_KEY,
      },
      body: JSON.stringify({
        model: config.TTS_MODEL,
        input: content,
        voice: v,
        speed: s,
        response_format: f,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const raw = await res.text();
      const err = new Error("语音合成接口返回 HTTP " + res.status + "：" + raw.slice(0, 300));
      err.status = res.status;
      err.raw = raw;
      throw err;
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0) {
      const err = new Error("语音合成返回了 0 字节");
      err.name = "BadResponseError";
      throw err;
    }
    buffer = Buffer.from(ab);
    ext = f;
  }

  const fileName = key + "." + ext;
  fs.writeFileSync(path.join(config.TTS_DIR, fileName), buffer);

  db.prepare(
    "INSERT INTO tts_cache (key, text, voice, speed, format, file, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(key, content, v, s, ext, fileName, buffer.length, now());

  return { file: fileName, format: ext, bytes: buffer.length, cacheHit: false, key: key };
}

module.exports = { synthesize, cacheKey };
