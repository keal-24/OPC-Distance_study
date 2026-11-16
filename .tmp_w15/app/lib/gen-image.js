const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");
const { mockImage, sleep } = require("./mock");
const { db, now } = require("./db");

function promptHash(prompt) {
  return crypto.createHash("sha256").update(String(prompt)).digest("hex").slice(0, 16);
}

async function generateImage({ prompt, size }) {
  if (!prompt || String(prompt).trim().length < 4) {
    const err = new Error("提示词太短，至少写清楚主体是什么");
    err.name = "BadRequestError";
    throw err;
  }

  const key = promptHash(prompt);
  const fileName = key + ".png";
  const filePath = path.join(config.GEN_DIR, fileName);

  if (fs.existsSync(filePath)) {
    const bytes = fs.statSync(filePath).size;
    return { file: fileName, bytes: bytes, cacheHit: true };
  }

  let buffer = null;

  if (config.MOCK) {
    await sleep(600);
    buffer = mockImage(prompt);
  } else {
    if (!config.IMAGE_MODEL) {
      throw new Error("没有配置 IMAGE_MODEL：请在 .env 里填你账号可用的图片模型名，或者保持 MOCK=true");
    }
    const body = { model: config.IMAGE_MODEL, prompt: String(prompt), n: 1 };
    if (size) body.size = size;

    const res = await fetch(config.BASE_URL + "/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    const raw = await res.text();
    if (!res.ok) {
      const err = new Error("生图接口返回 HTTP " + res.status + "：" + raw.slice(0, 300));
      err.status = res.status;
      err.raw = raw;
      throw err;
    }

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      const err = new Error("生图接口返回的不是 JSON：" + raw.slice(0, 200));
      err.name = "BadJsonError";
      throw err;
    }

    const item = data.data && data.data[0];
    if (!item) {
      const err = new Error("生图接口没有返回 data[0]");
      err.name = "BadResponseError";
      throw err;
    }

    if (item.b64_json) {
      buffer = Buffer.from(item.b64_json, "base64");
    } else if (item.url) {
      const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(60000) });
      if (!imgRes.ok) {
        const err = new Error("图片链接下载失败，HTTP " + imgRes.status + "（链接可能已经过期）");
        err.status = imgRes.status;
        throw err;
      }
      buffer = Buffer.from(await imgRes.arrayBuffer());
    } else {
      const err = new Error("返回里既没有 b64_json 也没有 url");
      err.name = "BadResponseError";
      throw err;
    }
  }

  fs.writeFileSync(filePath, buffer);
  db.prepare("INSERT INTO generations (prompt, file, bytes, created_at) VALUES (?, ?, ?, ?)").run(
    String(prompt),
    fileName,
    buffer.length,
    now()
  );

  return { file: fileName, bytes: buffer.length, cacheHit: false };
}

module.exports = { generateImage, promptHash };
