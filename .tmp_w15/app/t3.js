const { makePng } = require("./lib/mock");

const BASE = "http://localhost:3010";

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

(async () => {
  const b64 = makePng(120, 90, [200, 200, 200]).toString("base64");

  for (const sc of ["filter", "badjson", "quota", "", "timeout"]) {
    const started = Date.now();
    const r = await post("/api/analyze", { base64: b64, mime: "image/png", prompt: "x", mockScenario: sc });
    console.log("scenario=" + (sc || "ok"), r.status, ((Date.now() - started) / 1000).toFixed(1) + "s", r.text.slice(0, 120));
  }

  const big = "A".repeat(7 * 1024 * 1024);
  const r2 = await post("/api/analyze", { base64: big, mime: "image/png", prompt: "x" });
  console.log("too large", r2.status, r2.text.slice(0, 120));

  const r3 = await post("/api/analyze", { base64: "bm90IGFuIGltYWdl", mime: "image/png", prompt: "x" });
  console.log("bad image", r3.status, r3.text.slice(0, 120));

  const r4 = await post("/api/analyze", { mime: "image/png", prompt: "x" });
  console.log("no base64", r4.status, r4.text.slice(0, 120));
})();
