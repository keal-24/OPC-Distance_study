const fs = require("node:fs");
const { makePng, makeWav } = require("./lib/mock");

const BASE = "http://localhost:3000";

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

(async () => {
  const png = makePng(400, 300, [230, 230, 230]);
  const b64 = png.toString("base64");

  console.log("--- analyze");
  console.log(await post("/api/analyze", { base64: b64, mime: "image/png", prompt: "这张截图里客户想要什么？" }));

  console.log("--- extract invoice");
  console.log(await post("/api/extract", { base64: b64, mime: "image/png", docType: "invoice", fileName: "fapiao.png" }));

  console.log("--- extract badjson");
  console.log(await post("/api/extract", { base64: b64, mime: "image/png", docType: "table", fileName: "t.png", prompt: "[mock:badjson]" }));

  console.log("--- filter");
  console.log(await post("/api/analyze", { base64: b64, mime: "image/png", prompt: "[mock:filter] 看看这张" }));

  console.log("--- quota");
  console.log(await post("/api/analyze", { base64: b64, mime: "image/png", prompt: "[mock:quota] 看看" }));

  console.log("--- badbase64");
  console.log(await post("/api/analyze", { base64: "bm90IGFuIGltYWdl", mime: "image/png", prompt: "x" }));

  console.log("--- generate");
  console.log(await post("/api/generate", { prompt: "一只橘猫坐在窗台上，水彩风格" }));
  console.log("--- generate again (cache)");
  console.log(await post("/api/generate", { prompt: "一只橘猫坐在窗台上，水彩风格" }));

  const wav = makeWav(2, 16000);
  console.log("--- transcribe");
  console.log(await post("/api/transcribe", { base64: wav.toString("base64"), mime: "audio/wav", filename: "a.wav", timestamps: true }));

  console.log("--- tts");
  console.log(await post("/api/tts", { text: "今天天气不错" }));
  console.log("--- tts again");
  console.log(await post("/api/tts", { text: "今天天气不错" }));

  const s = await post("/api/assistant/session", { title: "测试" });
  console.log("--- session", s);
  const sid = JSON.parse(s.text).id;
  const ask = await post("/api/assistant/" + sid + "/ask", { base64: b64, mime: "image/png", question: "客户想要什么？" });
  console.log("--- ask", ask.status, ask.text.slice(0, 400));
  const ask2 = await post("/api/assistant/" + sid + "/ask", { base64: b64, mime: "image/png", question: "有没有提到截止日期？" });
  console.log("--- ask2", ask2.status, ask2.text.slice(0, 300));

  console.log("--- pending");
  const p = await fetch(BASE + "/api/extract/pending");
  console.log((await p.text()).slice(0, 300));

  console.log("--- 404");
  console.log(await fetch(BASE + "/api/nope").then(async (r) => ({ status: r.status, text: await r.text() })));
})();
