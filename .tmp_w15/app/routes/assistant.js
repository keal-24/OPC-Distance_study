const express = require("express");
const { analyzeImage } = require("../lib/vision");
const { synthesize } = require("../lib/tts");
const { imageInfo } = require("../lib/image-info");
const { db, now } = require("../lib/db");

const router = express.Router();

router.post("/assistant/session", (req, res, next) => {
  try {
    const title = String((req.body || {}).title || "未命名会话").slice(0, 60);
    const info = db.prepare("INSERT INTO sessions (title, created_at) VALUES (?, ?)").run(title, now());
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

router.post("/assistant/:id/ask", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const body = req.body || {};
    const question = String(body.question || "").trim();

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      const err = new Error("session id 不合法");
      err.status = 400;
      throw err;
    }
    if (!body.base64) {
      const err = new Error("这一轮没有带图片。追问也必须重新带图，因为接口不记上下文");
      err.name = "BadRequestError";
      err.status = 400;
      throw err;
    }
    if (question.length === 0) {
      const err = new Error("问题不能为空");
      err.name = "BadRequestError";
      err.status = 400;
      throw err;
    }

    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
    if (!session) {
      const err = new Error("没有这个会话：" + sessionId);
      err.status = 404;
      throw err;
    }

    const buf = Buffer.from(body.base64, "base64");
    const info = imageInfo(buf);
    if (!info) {
      const err = new Error("认不出图片格式");
      err.status = 400;
      throw err;
    }

    db.prepare("INSERT INTO assets (session_id, mime, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      sessionId,
      body.mime || "image/jpeg",
      info.width,
      info.height,
      buf.length,
      now()
    );

    const prompt = question + "\n\n回答要求：先用一句话直接回答，再补两条依据；看不清的地方明确说看不清。";

    const result = await analyzeImage({
      base64: body.base64,
      mime: body.mime || "image/jpeg",
      prompt: prompt,
      detail: body.detail || "auto",
    });

    db.prepare("INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)").run(
      sessionId,
      "user",
      question,
      now()
    );
    db.prepare("INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)").run(
      sessionId,
      "assistant",
      result.text,
      now()
    );

    const spoken = result.text.length > 500 ? result.text.slice(0, 500) : result.text;
    const speech = await synthesize({ text: spoken, voice: body.voice || "alloy", speed: 1, format: "mp3" });

    const usage = result.usage || {};
    db.prepare(
      "INSERT INTO cost_log (session_id, api, input_tokens, output_tokens, cache_hit, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(sessionId, "chat.completions", usage.prompt_tokens || 0, usage.completion_tokens || 0, 0, now());
    db.prepare(
      "INSERT INTO cost_log (session_id, api, input_tokens, output_tokens, cache_hit, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(sessionId, "audio.speech", spoken.length, 0, speech.cacheHit ? 1 : 0, now());

    res.json({
      ok: true,
      answer: result.text,
      usage: result.usage,
      image: { width: info.width, height: info.height, bytes: buf.length },
      tts: { url: "/tts/" + speech.file, cacheHit: speech.cacheHit, bytes: speech.bytes },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/assistant/:id", (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const rows = db.prepare("SELECT role, text, created_at FROM messages WHERE session_id = ? ORDER BY id").all(sessionId);
    res.json({ ok: true, id: sessionId, messages: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
