const express = require("express");
const { synthesize } = require("../lib/tts");

const router = express.Router();

router.post("/tts", async (req, res, next) => {
  try {
    const body = req.body || {};
    const text = String(body.text || "").trim();
    if (text.length === 0) {
      const err = new Error("text 是空的");
      err.name = "BadRequestError";
      err.status = 400;
      throw err;
    }

    const result = await synthesize({
      text: text,
      voice: body.voice || "alloy",
      speed: body.speed === undefined ? 1 : Number(body.speed),
      format: body.format || "mp3",
    });

    res.json({
      ok: true,
      url: "/tts/" + result.file,
      format: result.format,
      bytes: result.bytes,
      cacheHit: result.cacheHit,
      key: result.key,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
