require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const { analyzeImage, buildMessages } = require("../lib/vision");
const { imageInfo } = require("../lib/image-info");

const MIME = { jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log("用法：node scripts/test-vision.js <图片路径> [提示词]");
    process.exit(1);
  }

  const abs = path.resolve(file);
  const buf = fs.readFileSync(abs);
  const info = imageInfo(buf);
  if (!info) {
    console.log("这个文件不是 jpg / png / gif / webp，读不出宽高");
    process.exit(1);
  }

  const base64 = buf.toString("base64");
  const prompt = process.argv[3] || "用三句话描述这张图片";

  console.log("=== 图片基本情况 ===");
  console.log("文件：" + abs);
  console.log("格式：" + info.format + "  宽高：" + info.width + " x " + info.height);
  console.log("原始字节：" + buf.length);
  console.log("base64 长度：" + base64.length);
  console.log("膨胀倍数：" + (base64.length / buf.length).toFixed(3));

  const messages = buildMessages(prompt, base64, MIME[info.format], "auto");
  const printed = messages.map((m) => {
    if (!Array.isArray(m.content)) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: m.content.map((part) => {
        if (part.type === "text") return part;
        return {
          type: part.type,
          image_url: {
            url: part.image_url.url.slice(0, 64) + "...（后面还有 " + (part.image_url.url.length - 64) + " 个字符）",
            detail: part.image_url.detail,
          },
        };
      }),
    };
  });

  console.log("");
  console.log("=== 实际发出去的消息（base64 已截断） ===");
  console.log(JSON.stringify(printed, null, 2));

  console.log("");
  console.log("=== 模型回答 ===");
  const result = await analyzeImage({ base64: base64, mime: MIME[info.format], prompt: prompt });
  console.log(result.text);
  console.log("");
  console.log("=== token 用量 ===");
  console.log(JSON.stringify(result.usage));
}

main().catch((err) => {
  console.log("失败：" + err.name + " / " + err.message);
  process.exit(1);
});
