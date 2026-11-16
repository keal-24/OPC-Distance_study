const zlib = require("node:zlib");

const MOCK = (process.env.MOCK || "true") === "true";

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === "function") t.unref();
  });
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(width, height, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const rows = [];
  for (let y = 0; y < height; y++) rows.push(row);
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeWav(seconds, sampleRate) {
  const rate = sampleRate || 16000;
  const numSamples = Math.floor(seconds * rate);
  const data = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000);
    data.writeInt16LE(v, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const INVOICE = {
  doc_type: "invoice",
  fields: {
    invoice_no: { value: "044031900111", confidence: 0.94 },
    date: { value: "2026-03-18", confidence: 0.86 },
    seller_name: { value: "杭州云帆信息技术有限公司", confidence: 0.93 },
    total_amount: { value: 1299.0, confidence: 0.68 },
    tax_amount: { value: 74.94, confidence: 0.55 },
  },
  warnings: ["合计金额区域有折痕，数字 9 与 8 可能混淆"],
};

const SCREENSHOT = {
  doc_type: "screenshot",
  fields: {
    platform: { value: "微信", confidence: 0.91 },
    customer_request: { value: "退款什么时候到账", confidence: 0.88 },
    deadline_mentioned: { value: null, confidence: 0.4 },
  },
  todos: ["回复客户退款预计 1-3 个工作日到账"],
};

const TABLE = {
  doc_type: "table",
  columns: ["日期", "项目", "金额"],
  rows: [
    { 日期: "2026-03-01", 项目: "服务器", 金额: 320 },
    { 日期: "2026-03-05", 项目: "域名", 金额: 68 },
    { 日期: "2026-03-11", 项目: "短信", 金额: 145.5 },
  ],
  row_confidence: [0.95, 0.9, 0.62],
  total: { value: 533.5, confidence: 0.9 },
};

const PROSE = [
  "这张图是一个手机聊天界面。",
  "客户连续发了三条消息，问退款什么时候到账。",
  "最后一条是客服回复，说预计 1 到 3 个工作日到账。",
  "截图里没有出现具体日期，也没有提到订单号。",
].join("");

function visionText(prompt) {
  const p = String(prompt || "");
  if (!/JSON|json|格式/.test(p)) return PROSE;
  if (/发票|invoice/i.test(p)) return JSON.stringify(INVOICE, null, 2);
  if (/表格|table|对账/i.test(p)) return JSON.stringify(TABLE, null, 2);
  return JSON.stringify(SCREENSHOT, null, 2);
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}

async function mockChatCompletion(body) {
  const messages = (body && body.messages) || [];
  const last = messages[messages.length - 1] || {};
  const text = textOf(last.content);

  let scenario = (body && body.mockScenario) || "";
  if (!scenario) {
    if (text.includes("[mock:slow]")) scenario = "timeout";
    else if (text.includes("[mock:quota]")) scenario = "quota";
    else if (text.includes("[mock:badjson]")) scenario = "badjson";
    else if (text.includes("[mock:filter]")) scenario = "filter";
  }

  if (scenario === "timeout") {
    await sleep(90000);
  }
  if (scenario === "quota") {
    const err = new Error("mock: 额度已用完 (insufficient_quota)");
    err.status = 429;
    err.raw = JSON.stringify({
      error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" },
    });
    throw err;
  }
  if (scenario === "badjson") {
    return {
      id: "mock-badjson",
      object: "chat.completion",
      model: "mock",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "好的，结果如下：{金额: 1299, 日期: 2026/3/18" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1180, completion_tokens: 42, total_tokens: 1222 },
    };
  }
  if (scenario === "filter") {
    return {
      id: "mock-filter",
      object: "chat.completion",
      model: "mock",
      choices: [{ index: 0, message: { role: "assistant", content: null }, finish_reason: "content_filter" }],
      usage: { prompt_tokens: 1180, completion_tokens: 0, total_tokens: 1180 },
    };
  }

  await sleep(120);
  return {
    id: "mock-ok",
    object: "chat.completion",
    model: "mock",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: visionText(text || "截图") },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1180, completion_tokens: 260, total_tokens: 1440 },
  };
}

function mockTranscript() {
  return {
    text: "今天天气不错。我们明天在做各位的项目评审，已经通知了一千二百个客户。",
    language: "zh",
    duration: 8.4,
    segments: [
      { id: 0, start: 0.0, end: 2.1, text: "今天天气不错。" },
      { id: 1, start: 2.3, end: 6.0, text: "我们明天在做各位的项目评审，" },
      { id: 2, start: 6.1, end: 8.4, text: "已经通知了一千二百个客户。" },
    ],
  };
}

function mockImage(prompt) {
  let h = 0;
  const s = String(prompt || "image");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const rgb = [h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff];
  return makePng(512, 512, rgb);
}

function mockSpeech(text) {
  const seconds = Math.min(8, Math.max(1, Math.round(String(text || "").length / 5)));
  return makeWav(seconds, 16000);
}

module.exports = {
  MOCK,
  sleep,
  makePng,
  makeWav,
  mockChatCompletion,
  mockTranscript,
  mockImage,
  mockSpeech,
  visionText,
};
