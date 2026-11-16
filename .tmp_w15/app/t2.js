const fs = require("node:fs");
const { makePng, makeWav } = require("./lib/mock");

const BASE = "http://localhost:3000";

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

(async () => {
  const b64 = makePng(400, 300, [230, 230, 230]).toString("base64");

  for (const sc of ["", "filter", "badjson", "quota"]) {
    const r = await post("/api/extract", { base64: b64, mime: "image/png", docType: "invoice", mockScenario: sc });
    console.log("extract scenario=" + (sc || "ok"), r.status, r.text.slice(0, 160));
  }

  const s = JSON.parse((await post("/api/assistant/session", { title: "测试" })).text);
  const a1 = await post("/api/assistant/" + s.id + "/ask", { base64: b64, mime: "image/png", question: "客户想要什么？" });
  console.log("ask", a1.status, a1.text.slice(0, 300));

  const wav = makeWav(2, 16000);
  const t = await post("/api/transcribe", { base64: wav.toString("base64"), mime: "audio/wav", filename: "a.wav", timestamps: true });
  console.log("transcribe", t.status, t.text.slice(0, 160));
})();
