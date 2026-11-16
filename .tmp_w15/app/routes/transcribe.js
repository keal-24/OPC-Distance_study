const express = require("express");
const { transcribe } = require("../lib/transcribe");

const router = express.Router();

const MIME_EXT = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

router.post("/transcribe", async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.base64) {
      const err = new Error("请求里没有 base64 字段");
      err.name = "BadRequestError";
      err.status = 400;
      throw err;
    }
    const buf = Buffer.from(body.base64, "base64");
    if (buf.length > 20 * 1024 * 1024) {
      const err = new Error("音频 " + buf.length + " 字节，超过 20MB 上限，先切短一点");
      err.status = 413;
      throw err;
    }

    const mime = body.mime || "audio/mpeg";
    const ext = MIME_EXT[mime];
    if (!ext) {
      const err = new Error("不支持的音频类型：" + mime + "，用 mp3 / m4a / wav");
      err.status = 400;
      throw err;
    }

    const result = await transcribe({
      buffer: buf,
      filename: body.filename || "audio." + ext,
      mime: mime,
      language: body.language || "zh",
      timestamps: body.timestamps === true,
    });

    res.json({
      ok: true,
      id: result.id,
      text: result.text,
      language: result.language,
      duration: result.duration,
      segments: result.segments,
      bytes: buf.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
