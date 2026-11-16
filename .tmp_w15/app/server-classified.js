require("dotenv").config({ quiet: true });

const path = require("node:path");
const express = require("express");
const { MOCK } = require("./lib/config");
const { classify } = require("./lib/errors");

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/gen", express.static(path.join(__dirname, "data", "gen")));
app.use("/tts", express.static(path.join(__dirname, "data", "tts")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mock: MOCK });
});

app.use("/api", require("./routes/vision"));
app.use("/api", require("./routes/extract"));
app.use("/api", require("./routes/generate"));
app.use("/api", require("./routes/transcribe"));
app.use("/api", require("./routes/tts"));
app.use("/api", require("./routes/assistant"));

app.use((req, res) => {
  res.status(404).json({ error: "没有这个接口：" + req.method + " " + req.url });
});

app.use((err, req, res, next) => {
  const info = classify(err);
  console.error("[" + info.code + "] " + info.detail);
  res.status(info.status).json({ error: info.user, code: info.code });
});

app.listen(PORT, () => {
  console.log("服务已启动：http://localhost:" + PORT);
  console.log("当前模式：" + (MOCK ? "MOCK（不花钱，返回假数据）" : "真实接口（会花钱）"));
});
