const config = require("./config");
const { mockTranscript } = require("./mock");
const { db, now } = require("./db");

async function transcribe({ buffer, filename, mime, language, timestamps }) {
  if (!buffer || buffer.length === 0) {
    const err = new Error("音频是空的，检查一下文件有没有真正读到");
    err.name = "BadRequestError";
    throw err;
  }

  if (config.MOCK) {
    const fake = mockTranscript();
    const saved = db
      .prepare("INSERT INTO transcripts (file_name, text, language, duration, segments, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(filename || null, fake.text, fake.language, fake.duration, JSON.stringify(fake.segments), now());
    return Object.assign({ id: saved.lastInsertRowid, usage: null }, fake);
  }

  if (!config.STT_MODEL) {
    throw new Error("没有配置 STT_MODEL：请在 .env 里填你账号可用的转写模型名，或者保持 MOCK=true");
  }
  if (!config.API_KEY) {
    throw new Error("没有配置 OPENAI_API_KEY");
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime || "audio/mpeg" }), filename || "audio.mp3");
  form.append("model", config.STT_MODEL);
  if (language) form.append("language", language);
  form.append("response_format", timestamps ? "verbose_json" : "json");
  if (timestamps) form.append("timestamp_granularities[]", "segment");

  const res = await fetch(config.BASE_URL + "/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + config.API_KEY },
    body: form,
    signal: AbortSignal.timeout(120000),
  });

  const raw = await res.text();
  if (!res.ok) {
    const err = new Error("转写接口返回 HTTP " + res.status + "：" + raw.slice(0, 300));
    err.status = res.status;
    err.raw = raw;
    throw err;
  }

  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const err = new Error("转写接口返回的不是 JSON：" + raw.slice(0, 200));
    err.name = "BadJsonError";
    throw err;
  }

  const saved = db
    .prepare("INSERT INTO transcripts (file_name, text, language, duration, segments, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      filename || null,
      data.text || "",
      data.language || language || null,
      data.duration || null,
      JSON.stringify(data.segments || []),
      now()
    );

  return {
    id: saved.lastInsertRowid,
    text: data.text || "",
    language: data.language || language || null,
    duration: data.duration || null,
    segments: data.segments || [],
    usage: null,
  };
}

module.exports = { transcribe };
