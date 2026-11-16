const express = require("express");
const { extractImage, listPending, markVerified } = require("../lib/extract");
const { imageInfo } = require("../lib/image-info");

const router = express.Router();

router.post("/extract", async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.base64) {
      const err = new Error("请求里没有 base64 字段");
      err.name = "BadRequestError";
      err.status = 400;
      throw err;
    }
    const buf = Buffer.from(body.base64, "base64");
    const info = imageInfo(buf);
    if (!info) {
      const err = new Error("认不出这个文件的图片格式");
      err.status = 400;
      throw err;
    }

    const result = await extractImage({
      base64: body.base64,
      mime: body.mime || "image/jpeg",
      docType: body.docType || "screenshot",
      fileName: body.fileName || null,
      scenario: body.mockScenario,
    });

    res.json({
      ok: true,
      id: result.id,
      docType: result.docType,
      doc: result.doc,
      review: result.review,
      minConfidence: result.minConfidence,
      needsReview: result.needsReview,
      usage: result.usage,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/extract/pending", (req, res, next) => {
  try {
    res.json({ ok: true, items: listPending() });
  } catch (err) {
    next(err);
  }
});

router.post("/extract/:id/verify", (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      const err = new Error("id 必须是正整数");
      err.status = 400;
      throw err;
    }
    markVerified(id);
    res.json({ ok: true, id: id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
