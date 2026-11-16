const express = require("express");
const { generateImage } = require("../lib/gen-image");

const router = express.Router();

router.post("/generate", async (req, res, next) => {
  try {
    const body = req.body || {};
    const prompt = String(body.prompt || "").trim();
    if (prompt.length < 4) {
      const err = new Error("提示词太短，至少写清楚主体是什么");
      err.status = 400;
      throw err;
    }
    const result = await generateImage({ prompt: prompt, size: body.size });
    res.json({
      ok: true,
      url: "/gen/" + result.file,
      bytes: result.bytes,
      cacheHit: result.cacheHit,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
