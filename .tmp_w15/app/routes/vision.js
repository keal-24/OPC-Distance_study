const express = require("express");
const { analyzeImage } = require("../lib/vision");
const { imageInfo } = require("../lib/image-info");

const router = express.Router();

router.post("/analyze", async (req, res, next) => {
  try {
    const body = req.body || {};
    const base64 = body.base64;
    const mime = body.mime || "image/jpeg";
    const prompt = body.prompt || "用三句话描述这张图片";
    const detail = body.detail || "auto";

    if (!base64) {
      const err = new Error("请求里没有 base64 字段");
      err.name = "BadRequestError";
      err.status = 400;
      throw err;
    }

    const buf = Buffer.from(base64, "base64");
    const info = imageInfo(buf);
    if (!info) {
      const err = new Error("认不出这个文件的图片格式，只支持 jpg / png / gif / webp");
      err.status = 400;
      throw err;
    }
    if (buf.length > 4 * 1024 * 1024) {
      const err = new Error("图片 " + buf.length + " 字节，超过 4MB 上限");
      err.status = 413;
      throw err;
    }

    const result = await analyzeImage({
      base64: base64,
      mime: mime,
      prompt: prompt,
      detail: detail,
      scenario: body.mockScenario,
    });

    res.json({
      ok: true,
      answer: result.text,
      usage: result.usage,
      image: { format: info.format, width: info.width, height: info.height, bytes: buf.length },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
