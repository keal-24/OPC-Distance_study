const path = require("node:path");
const fs = require("node:fs");
const { MOCK } = require("./mock");

const DATA_DIR = path.join(__dirname, "..", "data");
const GEN_DIR = path.join(DATA_DIR, "gen");
const TTS_DIR = path.join(DATA_DIR, "tts");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

for (const dir of [DATA_DIR, GEN_DIR, TTS_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  MOCK,
  DATA_DIR,
  GEN_DIR,
  TTS_DIR,
  UPLOAD_DIR,
  BASE_URL: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
  API_KEY: process.env.OPENAI_API_KEY || "",
  VISION_MODEL: process.env.VISION_MODEL || "",
  IMAGE_MODEL: process.env.IMAGE_MODEL || "",
  STT_MODEL: process.env.STT_MODEL || "",
  TTS_MODEL: process.env.TTS_MODEL || "",
  TIMEOUT: Number(process.env.AI_TIMEOUT_MS || 60000),
};
