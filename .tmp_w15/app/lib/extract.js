const { analyzeImage } = require("./vision");
const { db, now } = require("./db");

const REQUIRED = {
  invoice: ["invoice_no", "date", "seller_name", "total_amount"],
  screenshot: ["platform", "customer_request"],
  table: [],
};

const ALWAYS_REVIEW = {
  invoice: ["total_amount", "tax_amount", "date"],
  screenshot: [],
  table: [],
};

const PROMPTS = {
  invoice: [
    "请把这张发票上的信息提取成 JSON。只输出 JSON，不要解释，不要加 Markdown 代码块。",
    "格式：",
    '{"doc_type":"invoice","fields":{',
    '"invoice_no":{"value":"","confidence":0},',
    '"date":{"value":"YYYY-MM-DD","confidence":0},',
    '"seller_name":{"value":"","confidence":0},',
    '"total_amount":{"value":0,"confidence":0},',
    '"tax_amount":{"value":0,"confidence":0}},',
    '"warnings":[]}',
    "规则：",
    "1. confidence 是 0 到 1 之间的小数，表示你对该字段的把握；",
    "2. 看不清的字段 value 填 null，confidence 填 0.3 以下；",
    "3. 金额只写数字，不要货币符号，不要千分位逗号；",
    "4. 日期统一成 YYYY-MM-DD。",
  ].join("\n"),
  screenshot: [
    "请把这张聊天截图里的信息提取成 JSON。只输出 JSON，不要解释，不要加 Markdown 代码块。",
    "格式：",
    '{"doc_type":"screenshot","fields":{',
    '"platform":{"value":"","confidence":0},',
    '"customer_request":{"value":"","confidence":0},',
    '"deadline_mentioned":{"value":null,"confidence":0}},',
    '"todos":[]}',
    "规则：confidence 是 0 到 1 之间的小数；截图里没提到的事不要编。",
  ].join("\n"),
  table: [
    "请把这张表格图片转成 JSON。只输出 JSON，不要解释，不要加 Markdown 代码块。",
    "格式：",
    '{"doc_type":"table","columns":["列名"],"rows":[{"列名":"值"}],',
    '"row_confidence":[0],"total":{"value":0,"confidence":0}}',
    "规则：",
    "1. row_confidence 的个数必须和 rows 的个数一样，表示每一行的把握；",
    "2. 不要把表头算成一行数据；",
    "3. 空单元格写 null。",
  ].join("\n"),
};

function stripFence(text) {
  const t = String(text).trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
}

function parseJsonLoose(text) {
  const t = stripFence(text);
  try {
    return JSON.parse(t);
  } catch (first) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    const err = new Error("模型返回的内容不是合法 JSON，原文开头：" + t.slice(0, 120));
    err.name = "BadJsonError";
    throw err;
  }
}

function validate(doc, docType) {
  const problems = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return ["返回的不是一个 JSON 对象"];
  }
  if (doc.doc_type && doc.doc_type !== docType) {
    problems.push("doc_type 是 " + doc.doc_type + "，你要求的是 " + docType);
  }
  for (const name of REQUIRED[docType] || []) {
    if (!doc.fields || !doc.fields[name]) problems.push("缺少必填字段 " + name);
  }
  for (const [name, item] of Object.entries(doc.fields || {})) {
    if (!item || typeof item !== "object") {
      problems.push(name + " 不是 {value, confidence} 结构");
      continue;
    }
    if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) {
      problems.push(name + " 的 confidence 不是 0 到 1 之间的数");
    }
  }
  if (docType === "table") {
    if (!Array.isArray(doc.rows)) problems.push("rows 不是数组");
    if (!Array.isArray(doc.row_confidence)) problems.push("row_confidence 不是数组");
    if (Array.isArray(doc.rows) && Array.isArray(doc.row_confidence) && doc.rows.length !== doc.row_confidence.length) {
      problems.push("rows 有 " + doc.rows.length + " 行，row_confidence 有 " + doc.row_confidence.length + " 个");
    }
  }
  return problems;
}

function buildReviewList(doc, docType) {
  const list = [];
  for (const [name, item] of Object.entries(doc.fields || {})) {
    if (!item || typeof item !== "object") continue;
    const always = (ALWAYS_REVIEW[docType] || []).includes(name);
    const low = typeof item.confidence === "number" && item.confidence < 0.8;
    const empty = item.value === null || item.value === "";
    if (always || low || empty) {
      let reason = "置信度低于 0.8";
      if (empty) reason = "模型说没看清（value 是 null）";
      if (always) reason = "金额和日期必须人工核对，不管置信度多少";
      list.push({ field: name, value: item.value, confidence: item.confidence, reason: reason });
    }
  }
  if (docType === "table" && Array.isArray(doc.row_confidence)) {
    doc.row_confidence.forEach((c, i) => {
      if (typeof c === "number" && c < 0.8) {
        list.push({
          field: "第 " + (i + 1) + " 行",
          value: JSON.stringify(doc.rows && doc.rows[i] ? doc.rows[i] : null),
          confidence: c,
          reason: "整行置信度低于 0.8",
        });
      }
    });
  }
  return list;
}

function minConfidenceOf(doc, docType) {
  const scores = [];
  for (const item of Object.values(doc.fields || {})) {
    if (item && typeof item.confidence === "number") scores.push(item.confidence);
  }
  if (docType === "table" && Array.isArray(doc.row_confidence)) {
    for (const c of doc.row_confidence) if (typeof c === "number") scores.push(c);
  }
  if (doc.total && typeof doc.total.confidence === "number") scores.push(doc.total.confidence);
  if (scores.length === 0) return 0;
  return Math.min.apply(null, scores);
}

async function extractImage({ base64, mime, docType, fileName, scenario }) {
  const type = PROMPTS[docType] ? docType : "screenshot";
  const prompt = PROMPTS[type];

  const result = await analyzeImage({ base64: base64, mime: mime, prompt: prompt, detail: "high", scenario: scenario });

  const doc = parseJsonLoose(result.text);
  const problems = validate(doc, type);
  if (problems.length > 0) {
    const err = new Error("模型返回的 JSON 不符合约定：" + problems.join("；"));
    err.name = "BadJsonError";
    err.detail = { raw: result.text, problems: problems };
    throw err;
  }

  const review = buildReviewList(doc, type);
  const minConfidence = minConfidenceOf(doc, type);
  const needsReview = review.length > 0 ? 1 : 0;

  const info = db
    .prepare(
      "INSERT INTO extractions (doc_type, file_name, json, min_confidence, needs_review, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(type, fileName || null, JSON.stringify(doc), minConfidence, needsReview, now());

  return {
    id: info.lastInsertRowid,
    docType: type,
    doc: doc,
    review: review,
    minConfidence: minConfidence,
    needsReview: needsReview === 1,
    usage: result.usage,
    raw: result.text,
  };
}

function listPending() {
  return db
    .prepare("SELECT id, doc_type, file_name, min_confidence, created_at FROM extractions WHERE verified = 0 ORDER BY id DESC")
    .all();
}

function markVerified(id) {
  return db.prepare("UPDATE extractions SET verified = 1 WHERE id = ?").run(id);
}

module.exports = { extractImage, parseJsonLoose, validate, listPending, markVerified, PROMPTS };
