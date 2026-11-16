# 第 100 节课：图片内容提取

> 这节课结束时，你手上有：`mm-app` 里一张 `extractions` 表、一个 `/api/extract` 接口、一个复核页面，能把发票、聊天截图、表格三类图变成带置信度的 JSON，并且知道哪些字段绝对不能信模型。

**时间**：约 110 分钟
**前置**：第 99 节课做出来的 `mm-app`，网页能上传图片并拿到一段描述

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

第 99 节课你做到的是：**模型能看图，并且用人话告诉你图上是什么。**

```text
你：这张图里有什么？
模型：这张图是一张增值税发票，上面有公司名称、金额、日期……
```

这已经比"只能处理文字"强了，但**它还不能干活**。

因为你要的不是一段描述，是**能存进数据库、能算总和、能导出 Excel 的字段**。

## 0.2 今天这个坑长什么样

真实场景：

> 你给一家小公司做报销系统。月底，会计把 40 张发票拍照发过来，让你录入。
> 你的上一版方案是：让模型"描述每张发票"，然后把描述打印出来，会计自己看着填。
>
> 会计的原话：「那我还不如自己看，你这玩意儿除了多一步，什么也没省。」

问题出在**输出形态**：一段散文，人还得读一遍再手打一遍。

**今天要做的是把"描述"变成"字段"：**

```json
{
  "invoice_no": "044031900111",
  "date": "2026-03-18",
  "total_amount": 1299.00
}
```

有了这个，才能：批量算总额、按月份筛、导成 Excel、跟银行流水对账。

**从"能看"到"能用"，中间隔着的就是结构化输出。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 结构化提取（structured extraction） | 不是让模型说话，是让它填表 | 三类图的字段定义 |
| 置信度（confidence） | 模型对自己这个答案的把握，0 到 1 | 决定哪些字段要人看 |
| 人工复核（human-in-the-loop） | 机器干粗活，人只检查关键几项 | 金额、日期 |

## 0.4 今天的交付物

| 文件 | 作用 |
|---|---|
| `lib/db.js` | 建 `extractions` 表，存每次提取的结果 |
| `lib/extract.js` | 三类图的提示词 + JSON 解析 + 校验 + 复核清单 |
| `routes/extract.js` | 三个接口：提取、待复核列表、标记已核 |
| `public/extract.html` | 上传 + 看结果 + 高亮要复核的字段 |
| `scripts/batch-extract.js` | 一次处理一个文件夹，输出统计和失败清单 |

---

# 第 1 步：先把结果存下来（15 分钟）

## 1.1 做什么 / 为什么

**为什么第 100 节课才装数据库？**

因为第 99 节课只需要"看一眼结果"，看一眼不需要存。今天开始，"这张发票录过了没有""哪些还没复核""这个月一共提了多少张"，这些问题没有数据库就答不了。

**为什么用 SQLite 而不是 JSON 文件？**

你在第 5 周算过账：JSON 文件并发写会丢数据，数据一多就慢，改结构要手改代码。今天三个问题它全占：

1. 会计和你同时点"标记已核"，两个写操作撞上；
2. 三个月后表里有几千行，每次读全文件；
3. 以后要加"这张发票属于哪个报销单"，JSON 得手改。

## 1.2 操作

**第 1 小步：装 `better-sqlite3`。**

```text
cd \OPC-Distance_study\每周课程\03-数据与智能\第15周-多模态\第01节课\03-练习代码\mm-app
npm install better-sqlite3
```

**第 2 小步：写 `lib/db.js`。**

```javascript
const path = require("node:path");
const Database = require("better-sqlite3");
const config = require("./config");

const db = new Database(path.join(config.DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS extractions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type       TEXT NOT NULL,
  file_name      TEXT,
  json           TEXT NOT NULL,
  min_confidence REAL NOT NULL DEFAULT 0,
  needs_review   INTEGER NOT NULL DEFAULT 0,
  verified       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
`);

function now() {
  return new Date().toISOString();
}

module.exports = { db, now };
```

逐行解释几个不显然的地方：

**`db.pragma("journal_mode = WAL")`**

WAL 是 Write-Ahead Logging。默认模式下，写操作会锁住整个数据库文件，读要等写。WAL 模式下读写可以同时进行。**一个人用差别不大，但这是零成本的正确做法**，写上。

**为什么 `json` 存成 TEXT 而不是拆成一堆列？**

因为三类图的字段完全不同。发票有 `invoice_no`，截图有 `customer_request`，表格有 `rows`。拆成列的话，你要么建三张表，要么建一张有 30 个空列的表。

**先把整份 JSON 存成文本，等某一类图稳定了再拆列。** 这是常见做法，不是偷懒。

**`verified` 为什么单独一个字段？**

因为"提取成功"和"人工核对过"是两件事。`needs_review = 1` 只表示"机器觉得有风险"，`verified = 1` 表示"人真的看过了"。**这两个状态不能合并**，否则你永远不知道哪些是机器说的、哪些是人确认的。

**第 3 小步：验证表建出来了。**

```text
node -e "const {db}=require('./lib/db');console.log(db.prepare('SELECT name FROM sqlite_master WHERE type=?').all('table'))"
```

## 1.3 屏幕上应该看到什么

```text
added 4 packages in 3s
```

```text
[ { name: 'extractions' } ]
```

`data\app.db` 这个文件也会出现，大小约 12KB。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `npm ERR! gyp ERR!` | 没有编译环境，`better-sqlite3` 在本地编译失败了 | 换 Node 22.5 以上，用内置的 `node:sqlite`，见附录 |
| `Cannot find module 'better-sqlite3'` | 不在 `mm-app` 目录 | `cd` 回来 |
| 表是空的 | `db.exec` 没执行到 | 检查 `lib/db.js` 有没有被 `require` |
| `SQLITE_CANTOPEN` | `data` 目录不存在 | `config.js` 会自动建，检查它有没有被引入 |

---

# 第 2 步：给三类图各写一份"表"（20 分钟）

## 2.1 做什么 / 为什么

**提示词的核心不是"请提取信息"，是"按这个格式填"。**

对比两句话：

| 说法 | 模型会给你 |
|---|---|
| "提取这张发票的信息" | 一段散文，字段名每次都不一样 |
| "按这个 JSON 格式输出，字段名不许改" | 稳定的结构 |

第二种之所以有效，是因为**你给了它一个可以照抄的骨架**。模型不需要猜你要什么字段，只要往里填。

**三类图必须分开写，不能一个提示词打天下。**

| 类型 | 字段 | 为什么不能混 |
|---|---|---|
| 发票 | 发票号、日期、销售方、金额、税额 | 票面布局固定，字段固定，可以要求高精度 |
| 聊天截图 | 平台、客户诉求、有没有提到期限、待办 | 没有固定布局，硬套发票字段只会得到一堆 null |
| 表格 | 列名、行、每行置信度、合计 | 行数不定，必须用数组 |

## 2.2 操作

**第 1 小步：写 `lib/extract.js` 的提示词部分。**

新建 `lib\extract.js`，先写这三段：

```javascript
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
```

**这几段提示词里有四个设计，每一个都有原因：**

**（1）"只输出 JSON，不要解释，不要加 Markdown 代码块"**

不写这句，模型有很大概率返回：

```text
好的，我帮您提取了以下信息：

```json
{ ... }
```

希望对您有帮助！
```

这段东西 `JSON.parse` 直接失败。写了这句，成功率能到 95% 以上，但**剩下那 5% 你还是要兜住**（下一步就写兜底）。

**（2）字段名和结构直接给出，连逗号都写出来**

模型对"骨架"的模仿能力很强。你给 `{"value":"","confidence":0}`，它就照着填。你说"每个字段带一个置信度"，它可能写成 `{"confidence": 0.9, "invoice_no": "..."}`——顺序变了，结构也可能变。

**（3）金额要求"只写数字"**

因为 `"¥1,299.00"` 这个字符串进数据库以后：

- 排序按字典序，`"¥1,299.00"` 排在 `"¥2.00"` 前面；
- 求和要 `parseFloat` 去逗号和货币符号，每处都要写；
- 一旦有人填了 `"1299元"`，`parseFloat` 得到 `1299` 但 `"1,299"` 得到 `1`。

**在入口就把格式定死，比在出口清洗便宜一百倍。**

**（4）日期要求 `YYYY-MM-DD`**

`2026/3/18`、`2026.03.18`、`2026年3月18日`、`18/03/2026`，四种写法。第一种和第四种人能分清，机器分不清——`18/03/2026` 到底是 3 月 18 日还是 2026 年 3 月 18 日？**存进数据库以后按字符串排序，全是错的。**

**第 2 小步：写解析和校验。**

接着往 `lib/extract.js` 里加：

```javascript
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
```

**`stripFence` 处理"外面包了代码块"的情况。**

`replace(/^```[a-zA-Z]*\s*/, "")` 去掉开头三个反引号加语言名（`json`、`javascript` 都见过），`replace(/```\s*$/, "")` 去掉结尾那三个。

**`parseJsonLoose` 的第二段是"从第一个 `{` 到最后一个 `}` 截出来"。**

这是个**有风险的兜底**：如果模型返回 `"结果是 {"a":1}，注意 {"b":2}"`，截出来是 `{"a":1}，注意 {"b":2}`，还是解析失败；如果它返回 `"{"a":1} 我这里还有话"`，截出来就成功了。

**它的价值是救回"JSON 前后多了一句废话"这种最常见的情况。它的风险是把一段坏数据修成看起来能用的数据。** 所以截出来的结果仍然要走下一步的校验，校验过不了就报错，不许放行。

**第 3 小步：写校验。**

```javascript
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
```

**校验要校验什么？不是"值对不对"，是"形状对不对"。**

| 校验项 | 为什么 |
|---|---|
| 是不是对象 | 模型可能返回数组或字符串 |
| `doc_type` 一不一致 | 你传的是发票，它按截图给你解析了 |
| 必填字段在不在 | 少一个字段，后面代码 `doc.fields.date.value` 就崩 |
| `confidence` 是不是 0–1 的数 | 模型可能给 `"高"`、`95`、`-1` |
| 表格行数和置信度数对不对 | 少一个置信度，你不知道哪行可疑 |

**注意：校验不检查"1299 这个数字对不对"。** 那是人的活，下一步讲。

**第 4 步：写复核清单。**

```javascript
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
```

三类进入复核清单：

| 条件 | 例子 | 理由 |
|---|---|---|
| 置信度 < 0.8 | `tax_amount: 0.55` | 模型自己说没把握 |
| 值是 `null` | `deadline_mentioned: null` | 模型说没看清 |
| 在 `ALWAYS_REVIEW` 里 | 发票的 `total_amount` | 置信度 0.99 也要看 |

**第三条是这张表的重点，下一步专门讲。**

## 2.3 屏幕上应该看到什么

现在文件还没有导出，跑一条命令验证提示词长度：

```text
node -e "const m=require('./lib/extract');console.log(m.PROMPTS.invoice.length)"
```

（这一步会报错，因为 `module.exports` 还没写。先看下一步。）

写完完整的 `lib/extract.js` 之后：

```text
node -e "const m=require('./lib/extract');console.log(Object.keys(m.PROMPTS));console.log(m.PROMPTS.invoice.slice(0,60))"
```

```text
[ 'invoice', 'screenshot', 'table' ]
请把这张发票上的信息提取成 JSON。只输出 JSON，不要解释，不要加 Markdown 代码块。
```

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `m.PROMPTS` 是 `undefined` | 忘了 `module.exports` | 见下一步的完整导出 |
| 提示词里换行丢了 | 用了数组但忘了 `.join("\n")` | 补上 |
| 模型返回的结构每次都不一样 | 提示词里没给完整骨架 | 把 JSON 骨架原样写进去，包括逗号 |

---

# 第 3 步：把提取流程拼起来（20 分钟）

## 3.1 做什么 / 为什么

现在有三块：提示词、解析、校验。**中间差一根线**：调模型 → 拿文本 → 解析 → 校验 → 算复核清单 → 入库 → 返回。

这根线写成 `extractImage()`，一个函数把七件事做完。**为什么不做成七个函数？**

因为它们之间传的是一份数据（`doc`），拆开以后你要在七个地方传同一个对象，还要处理"第 3 步失败了第 4、5 步怎么办"。**一条线走完，失败就整体失败**，逻辑最简单。

## 3.2 操作

**第 1 小步：补完 `lib/extract.js` 的最后部分。**

```javascript
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
```

**`type = PROMPTS[docType] ? docType : "screenshot"` 这一行为什么要兜底？**

因为 `docType` 是前端传来的，可能是 `"fapiao"`、`"INVOICE"`、`"发票"`。**不兜底的话 `PROMPTS[docType]` 是 `undefined`，`prompt` 就是 `undefined`，发出去的请求里没有提示词**——模型会自由发挥，你还以为是模型不听话。

**兜底成 `screenshot` 而不是报错**，是因为截图那份提示词的约束最松，最不容易输出垃圾。**但返回里必须带上真实用的 `docType`**，让调用方知道"我传错了，它按截图处理了"。

**`detail: "high"` 写死，不给用户选。**

因为提取字段这件事必须看清小字。让用户选"低清"，等于让他花一半的钱买一堆 `null`。**这种选择不该交给用户**，这是产品判断。

**第 2 小步：写路由 `routes/extract.js`。**

```javascript
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
```

**第 3 小步：在 `server.js` 里挂一行。**

打开 `server.js`，找到这一行：

```javascript
app.use("/api", require("./routes/vision"));
```

在它下面加一行：

```javascript
app.use("/api", require("./routes/extract"));
```

**第 4 小步：重启，用命令行测三类图。**

```text
node server.js
```

另开一个 cmd 窗口：

```text
node -e "const {makePng}=require('./lib/mock');const fs=require('fs');fs.writeFileSync('fapiao.png',makePng(800,600,[250,250,245]));fs.writeFileSync('shot.png',makePng(400,700,[235,235,235]));fs.writeFileSync('biao.png',makePng(700,400,[245,245,250]));console.log('三张测试图写好了')"
```

然后用 curl 测发票：

```text
node -e "const fs=require('fs');const b=fs.readFileSync('fapiao.png').toString('base64');fetch('http://localhost:3000/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64:b,mime:'image/png',docType:'invoice',fileName:'fapiao.png'})}).then(async r=>{console.log(r.status);console.log(JSON.stringify(await r.json(),null,2))})"
```

## 3.3 屏幕上应该看到什么

发票的结果：

```text
200
{
  "ok": true,
  "id": 1,
  "docType": "invoice",
  "doc": {
    "doc_type": "invoice",
    "fields": {
      "invoice_no": { "value": "044031900111", "confidence": 0.94 },
      "date": { "value": "2026-03-18", "confidence": 0.86 },
      "seller_name": { "value": "杭州云帆信息技术有限公司", "confidence": 0.93 },
      "total_amount": { "value": 1299, "confidence": 0.68 },
      "tax_amount": { "value": 74.94, "confidence": 0.55 }
    },
    "warnings": ["合计金额区域有折痕，数字 9 与 8 可能混淆"]
  },
  "review": [
    { "field": "date", "value": "2026-03-18", "confidence": 0.86, "reason": "金额和日期必须人工核对，不管置信度多少" },
    { "field": "total_amount", "value": 1299, "confidence": 0.68, "reason": "金额和日期必须人工核对，不管置信度多少" },
    { "field": "tax_amount", "value": 74.94, "confidence": 0.55, "reason": "金额和日期必须人工核对，不管置信度多少" }
  ],
  "minConfidence": 0.55,
  "needsReview": true,
  "usage": { "prompt_tokens": 1180, "completion_tokens": 260, "total_tokens": 1440 }
}
```

**注意 `review` 里 `date` 的置信度是 0.86，高于 0.8，但它仍然进了复核清单。** 这是 `ALWAYS_REVIEW` 在起作用。为什么，下一步讲。

表格的结果：

```text
{
  "ok": true,
  "id": 2,
  "docType": "table",
  "doc": {
    "doc_type": "table",
    "columns": ["日期", "项目", "金额"],
    "rows": [
      { "日期": "2026-03-01", "项目": "服务器", "金额": 320 },
      { "日期": "2026-03-05", "项目": "域名", "金额": 68 },
      { "日期": "2026-03-11", "项目": "短信", "金额": 145.5 }
    ],
    "row_confidence": [0.95, 0.9, 0.62],
    "total": { "value": 533.5, "confidence": 0.9 }
  },
  "review": [
    {
      "field": "第 3 行",
      "value": "{\"日期\":\"2026-03-11\",\"项目\":\"短信\",\"金额\":145.5}",
      "confidence": 0.62,
      "reason": "整行置信度低于 0.8"
    }
  ],
  "minConfidence": 0.62,
  "needsReview": true
}
```

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot POST /api/extract` | `server.js` 没加挂载那行 | 加完必须重启 |
| `模型返回的 JSON 不符合约定` | 假模型给的字段和 `REQUIRED` 对不上 | 看 `err.message` 里列了哪几项 |
| `id` 是字符串 | `lastInsertRowid` 在有些驱动里是 BigInt | 这里返回的是数字，如果你看到 `1n`，加 `Number()` |
| 三类图返回的结果一样 | 你的提示词里没有"发票/表格"这些词 | 检查 `PROMPTS` 有没有被正确取到 |
| 终端报 `SQLITE_BUSY` | 有两个进程同时写 | 关掉多余的 `node` 窗口 |

---

# 第 4 步：为什么金额和日期必须人看（20 分钟）

## 4.1 做什么 / 为什么

**这一段是这节课最重要的部分，不是技术，是责任。**

先看一个数字。假设你要处理 40 张发票：

| 情况 | 错误率 | 一个月错几张 | 一年错几张 |
|---|---|---|---|
| 模型对金额的准确率 98% | 2% | 0.8 张 | 约 10 张 |
| 模型对日期的准确率 99% | 1% | 0.4 张 | 约 5 张 |

**98% 听起来很高。** 但你要问的是：**错的那 2% 会怎样？**

| 字段 | 错了的后果 | 谁承担 |
|---|---|---|
| 金额少写 1000 | 报销少报，员工自己贴钱；或者公司账目对不上，年底审计要补 | 你赔或者客户跑 |
| 金额多写 1000 | 多报销，税务风险 | 客户被查，你被追责 |
| 日期错一个月 | 跨月入账，财务报表错，报税数字错 | 要重新申报，罚款 |
| 发票号错一位 | 查重失效，同一张票报两次 | 直接是钱 |
| 销售方名称错字 | 对账对不上，供应商投诉 | 人工重来 |

**"+ 1000" 和 "- 1000" 都不是"小错误"，是钱。**

再看一个更隐蔽的：模型把 `1,299.00` 读成 `1299.00`，看起来完全正确。但如果它读成 `12990.0`（少看一个小数点），你不会发现——**因为 12990 也是一个合法的金额，没有任何格式错误。**

**这就是为什么"校验通过"不等于"结果正确"。** 校验只能保证形状对，保证不了数字对。

## 4.2 操作

**第 1 小步：给 `ALWAYS_REVIEW` 加一条硬规则。**

`lib/extract.js` 里已经有：

```javascript
const ALWAYS_REVIEW = {
  invoice: ["total_amount", "tax_amount", "date"],
  screenshot: [],
  table: [],
};
```

**注意表格类为什么是空的**——表格的金额在 `rows` 里，字段名不固定，所以走的是另一条路：**行级置信度**。但这就意味着**表格的金额没有 100% 强制复核**，这是个已知的缺口。

补上它。在 `buildReviewList` 里，表格分支改成"所有行都进复核清单，除非整表置信度都很高且用户明确选择了快速模式"——太复杂。

**更简单的做法：表格类一律要求人工确认合计。**

```javascript
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
    list.push({
      field: "合计",
      value: doc.total ? doc.total.value : null,
      confidence: doc.total ? doc.total.confidence : 0,
      reason: "表格合计必须人工核对，并和逐行相加的结果对一遍",
    });
  }
```

**这段代码值得你停下来想一分钟。**

它做了一件"反技术"的事：**明知道模型给了 0.9 的置信度，还是要求人看一眼。** 因为合计是整张表所有数字的累加，**任何一行错一位，合计就错**，而合计是最终进账那个数字。

**第 2 小步：加一个"交叉校验"——用行数据自己算一遍合计。**

```javascript
function checkTableTotal(doc) {
  if (!Array.isArray(doc.rows)) return null;
  const sum = doc.rows.reduce((acc, row) => {
    const v = row["金额"];
    return acc + (typeof v === "number" ? v : 0);
  }, 0);
  const claimed = doc.total && typeof doc.total.value === "number" ? doc.total.value : null;
  return { sum: Number(sum.toFixed(2)), claimed: claimed, match: claimed !== null && Math.abs(sum - claimed) < 0.01 };
}
```

**这个函数是这节课最值钱的 10 行。**

模型会犯一类特别危险的错误：**每一行都对，合计错**。因为它不是在算，是在"读"——它读到票面上印着 533.5，就直接抄。如果票面印错了，它跟着错。

自己加一遍，两个数对不上就报警。**这叫"用另一个来源验证同一个结论"，是所有数据录入系统的标准动作。**

在 `extractImage` 返回前加上：

```javascript
  const totalCheck = type === "table" ? checkTableTotal(doc) : null;
  if (totalCheck && totalCheck.match === false) {
    review.push({
      field: "合计",
      value: "逐行相加 " + totalCheck.sum + "，票面写 " + totalCheck.claimed,
      confidence: doc.total ? doc.total.confidence : 0,
      reason: "两个数对不上，必须人工核对",
    });
  }
```

注意这段要放在 `needsReview` 计算**之前**，否则新加的复核项不会影响 `needsReview`。改完的顺序是：

```javascript
  const review = buildReviewList(doc, type);
  const totalCheck = type === "table" ? checkTableTotal(doc) : null;
  if (totalCheck && totalCheck.match === false) {
    review.push({ field: "合计", value: "逐行相加 " + totalCheck.sum + "，票面写 " + totalCheck.claimed, confidence: doc.total ? doc.total.confidence : 0, reason: "两个数对不上，必须人工核对" });
  }
  const minConfidence = minConfidenceOf(doc, type);
  const needsReview = review.length > 0 ? 1 : 0;
```

**第 3 小步：写复核页面 `public/extract.html`。**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>图片提取与复核</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; max-width: 900px; margin: 28px auto; padding: 0 16px; color: #222; }
    h1 { font-size: 20px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
    textarea { width: 100%; height: 260px; font-family: Consolas, monospace; font-size: 13px; box-sizing: border-box; }
    button { padding: 8px 16px; cursor: pointer; margin-right: 8px; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 8px; }
    td, th { border: 1px solid #e0e0e0; padding: 6px 8px; text-align: left; }
    .bad { background: #fff2f0; color: #b00; }
    .ok { color: #070; }
    .hint { color: #666; font-size: 13px; }
    img#preview { max-width: 100%; max-height: 300px; display: none; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>图片提取与复核</h1>

  <div class="box">
    <input type="file" id="file" accept="image/jpeg,image/png,image/gif,image/webp" />
    <img id="preview" alt="预览" />
    <p class="hint" id="info">先选一张图</p>
    <p>
      文档类型：
      <select id="docType">
        <option value="invoice">发票</option>
        <option value="screenshot">聊天截图</option>
        <option value="table">表格</option>
      </select>
      <button id="send">提取</button>
      <button id="verify" disabled>标记为已人工核对</button>
    </p>
  </div>

  <div class="box">
    <h2 style="font-size:16px">提取结果</h2>
    <textarea id="json" readonly></textarea>
  </div>

  <div class="box">
    <h2 style="font-size:16px">必须人工核对的项</h2>
    <table>
      <thead><tr><th>字段</th><th>值</th><th>置信度</th><th>为什么要看</th><th>核对通过</th></tr></thead>
      <tbody id="reviewBody"><tr><td colspan="5" class="hint">还没有结果</td></tr></tbody>
    </table>
    <p class="hint" id="usage"></p>
  </div>

  <script>
    let current = null;
    let lastId = null;

    const fileInput = document.getElementById("file");
    const preview = document.getElementById("preview");
    const infoEl = document.getElementById("info");
    const jsonEl = document.getElementById("json");
    const reviewBody = document.getElementById("reviewBody");
    const usageEl = document.getElementById("usage");
    const verifyBtn = document.getElementById("verify");

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const comma = dataUrl.indexOf(",");
        const head = dataUrl.slice(0, comma);
        const base64 = dataUrl.slice(comma + 1);
        const mime = head.slice(5, head.indexOf(";"));
        preview.src = dataUrl;
        preview.style.display = "block";
        infoEl.textContent = file.name + " | " + mime + " | " + file.size + " 字节";
        current = { base64: base64, mime: mime, name: file.name };
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("send").addEventListener("click", async () => {
      if (!current) { infoEl.textContent = "先选一张图"; return; }
      jsonEl.value = "提取中…";
      reviewBody.innerHTML = "";
      verifyBtn.disabled = true;
      lastId = null;

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64: current.base64,
          mime: current.mime,
          docType: document.getElementById("docType").value,
          fileName: current.name,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        jsonEl.value = "失败（HTTP " + res.status + "）：" + (data.error || "没有说明");
        return;
      }

      lastId = data.id;
      jsonEl.value = JSON.stringify(data.doc, null, 2);
      usageEl.textContent =
        "编号 " + data.id +
        " | 最低置信度 " + data.minConfidence.toFixed(2) +
        " | 输入 " + (data.usage ? data.usage.prompt_tokens : "?") + " tokens";

      if (data.review.length === 0) {
        reviewBody.innerHTML = '<tr><td colspan="5" class="ok">没有需要人工核对的项</td></tr>';
      } else {
        reviewBody.innerHTML = "";
        data.review.forEach((item) => {
          const tr = document.createElement("tr");
          tr.className = "bad";
          tr.innerHTML =
            "<td>" + item.field + "</td>" +
            "<td>" + String(item.value) + "</td>" +
            "<td>" + (typeof item.confidence === "number" ? item.confidence.toFixed(2) : "—") + "</td>" +
            "<td>" + item.reason + "</td>" +
            '<td><input type="checkbox" class="chk" /></td>';
          reviewBody.appendChild(tr);
        });
      }
      verifyBtn.disabled = false;
    });

    verifyBtn.addEventListener("click", async () => {
      if (!lastId) return;
      const boxes = Array.from(document.querySelectorAll(".chk"));
      const unchecked = boxes.filter((b) => !b.checked);
      if (unchecked.length > 0) {
        usageEl.textContent = "还有 " + unchecked.length + " 项没勾，不能标记为已核对";
        return;
      }
      const res = await fetch("/api/extract/" + lastId + "/verify", { method: "POST" });
      const data = await res.json();
      usageEl.textContent = res.ok ? "已记录：编号 " + lastId + " 人工核对完毕" : "失败：" + data.error;
    });
  </script>
</body>
</html>
```

**页面上有一个设计值得说：** "标记为已人工核对"按钮，**只要有一项没勾就打不开**。这不是 UI 洁癖，是流程约束——**让"跳过复核"这件事在物理上做不到**，比写十条制度管用。

## 4.3 屏幕上应该看到什么

打开 `http://localhost:3000/extract.html`，选发票图，类型选"发票"，点提取。

结果区（文本框里）：

```json
{
  "doc_type": "invoice",
  "fields": {
    "invoice_no": { "value": "044031900111", "confidence": 0.94 },
    "date": { "value": "2026-03-18", "confidence": 0.86 },
    "seller_name": { "value": "杭州云帆信息技术有限公司", "confidence": 0.93 },
    "total_amount": { "value": 1299, "confidence": 0.68 },
    "tax_amount": { "value": 74.94, "confidence": 0.55 }
  },
  "warnings": ["合计金额区域有折痕，数字 9 与 8 可能混淆"]
}
```

复核表（三行红底）：

```text
字段            值              置信度   为什么要看                          核对通过
date            2026-03-18      0.86     金额和日期必须人工核对，不管置信度多少   [ ]
total_amount    1299            0.68     金额和日期必须人工核对，不管置信度多少   [ ]
tax_amount      74.94           0.55     金额和日期必须人工核对，不管置信度多少   [ ]
```

底部：

```text
编号 1 | 最低置信度 0.55 | 输入 1180 tokens
```

换成表格类型，会多一行：

```text
合计   逐行相加 533.5，票面写 533.5    0.90    表格合计必须人工核对，并和逐行相加的结果对一遍   [ ]
```

**如果把假数据里的 `total.value` 改成 523.5**（模拟票面印错），这一行会变成：

```text
合计   逐行相加 533.5，票面写 523.5    0.90    两个数对不上，必须人工核对   [ ]
```

**这就是交叉校验的价值**：置信度 0.90 看起来很好，但两个来源对不上。

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 复核表是空的但 `needsReview` 是 true | `review` 数组有内容但前端没渲染 | 看 Network 里的返回 |
| "标记已核对"一直能点 | 你没加 `disabled` 逻辑 | 检查 `verifyBtn.disabled` |
| 勾了全部还是提示"还有 N 项没勾" | 你用的 `querySelectorAll` 选择器不对 | 确认复选框的 class 是 `chk` |
| 合计校验永远 `match: true` | 精度判断写成了 `===` | 用 `Math.abs(a-b) < 0.01` |
| 金额出现 `1299.00` 字符串 | 模型没按"只写数字"的要求 | 校验里加一条 `typeof value !== "number"` 就报错 |

---

# 第 5 步：批量跑，把成本算清楚（15 分钟）

## 5.1 做什么 / 为什么

一张一张点，永远不知道"一个月 40 张要多少钱、要多久"。**批量跑一次，数字就出来了。**

而且批量跑会暴露单张跑看不到的问题：**第 7 张失败了，前面 6 张的结果还在不在？**

## 5.2 操作

**第 1 小步：造 5 张测试图。**

```text
node -e "const {makePng}=require('./lib/mock');const fs=require('fs');if(!fs.existsSync('samples'))fs.mkdirSync('samples');for(let i=1;i<=5;i++){fs.writeFileSync('samples/fapiao-'+i+'.png',makePng(600+i*20,400,[245,245,240]))}console.log('5 张发票图已写入 samples')"
```

**第 2 小步：写 `scripts/batch-extract.js`。**

```javascript
require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const { extractImage } = require("../lib/extract");
const { imageInfo } = require("../lib/image-info");

async function main() {
  const dir = process.argv[2] || "samples";
  const docType = process.argv[3] || "invoice";

  if (!fs.existsSync(dir)) {
    console.log("找不到目录：" + dir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.log(dir + " 里没有图片");
    process.exit(1);
  }

  console.log("共 " + files.length + " 张，类型 " + docType);
  console.log("");

  const failures = [];
  let totalIn = 0;
  let totalOut = 0;
  let needReviewCount = 0;

  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    const started = Date.now();
    process.stdout.write("[" + (i + 1) + "/" + files.length + "] " + name + " ... ");

    try {
      const buf = fs.readFileSync(path.join(dir, name));
      const info = imageInfo(buf);
      if (!info) throw new Error("不是图片");

      const result = await extractImage({
        base64: buf.toString("base64"),
        mime: "image/" + (info.format === "jpg" ? "jpeg" : info.format),
        docType: docType,
        fileName: name,
      });

      const usage = result.usage || {};
      totalIn += usage.prompt_tokens || 0;
      totalOut += usage.completion_tokens || 0;
      if (result.needsReview) needReviewCount++;

      console.log(
        "成功 id=" + result.id +
        " 最低置信度=" + result.minConfidence.toFixed(2) +
        " 需复核=" + result.review.length + " 项" +
        " 用时=" + ((Date.now() - started) / 1000).toFixed(1) + "s"
      );
    } catch (err) {
      failures.push({ file: name, error: err.message });
      console.log("失败：" + err.message);
    }
  }

  console.log("");
  console.log("=== 汇总 ===");
  console.log("成功 " + (files.length - failures.length) + " 张，失败 " + failures.length + " 张");
  console.log("需要人工复核 " + needReviewCount + " 张");
  console.log("输入 token 合计 " + totalIn + "，输出 token 合计 " + totalOut);

  if (failures.length > 0) {
    const outFile = path.join(__dirname, "..", "data", "failures.json");
    fs.writeFileSync(outFile, JSON.stringify(failures, null, 2));
    console.log("失败清单已写入 " + outFile);
  }
}

main().catch((err) => {
  console.log("整批中断：" + err.message);
  process.exit(1);
});
```

**这段代码里有两个关键设计：**

**（1）`try/catch` 包在循环体里面，不是外面。**

包在外面的话，第 3 张失败，第 4、5 张就不跑了。包在里面，**一张失败不影响其他张**，失败信息单独收集。

**（2）失败清单单独存一个文件，不混在数据库里。**

因为失败的那张根本没有 `id`，存进 `extractions` 表会破坏表结构（`json` 是 `NOT NULL`）。**失败的数据和成功的数据是两种东西，存两个地方。**

**第 3 小步：跑。**

```text
node scripts\batch-extract.js samples invoice
```

## 5.3 屏幕上应该看到什么

```text
共 5 张，类型 invoice

[1/5] fapiao-1.png ... 成功 id=7 最低置信度=0.55 需复核=3 项 用时=0.1s
[2/5] fapiao-2.png ... 成功 id=8 最低置信度=0.55 需复核=3 项 用时=0.1s
[3/5] fapiao-3.png ... 成功 id=9 最低置信度=0.55 需复核=3 项 用时=0.1s
[4/5] fapiao-4.png ... 成功 id=10 最低置信度=0.55 需复核=3 项 用时=0.1s
[5/5] fapiao-5.png ... 成功 id=11 最低置信度=0.55 需复核=3 项 用时=0.1s

=== 汇总 ===
成功 5 张，失败 0 张
需要人工复核 5 张
输入 token 合计 5900，输出 token 合计 1300
```

**现在算账：**

```text
5 张 = 5900 输入 token + 1300 输出 token
40 张（一个月）≈ 47200 输入 + 10400 输出
```

拿这个数去乘你服务商的单价。**这就是这个功能一个月的成本。** 加上人工复核的时间成本（每张约 1 分钟，40 张 = 40 分钟），你才知道该收客户多少钱。

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `找不到目录：samples` | 你在别的目录跑 | `cd mm-app` 再跑 |
| 第一张就失败，后面不跑了 | `try` 包在循环外面 | 按上面的写法改 |
| 全部失败，报"不是图片" | 图是空的或者格式不对 | 用 `check-image.js` 单独验一张 |
| `failures.json` 没有生成 | 失败数是 0 | 正常 |
| 每张都"需复核 3 项" | 假模型的数据固定 | 正常，真模型会有差异 |

---

# 第 6 步：故意犯 3 个错（15 分钟）

## 错误 1：模型返回了代码块包裹的版本

**操作：** 把 `parseJsonLoose` 里的 `stripFence` 那一行去掉，直接 `JSON.parse(text)`。

```javascript
function parseJsonLoose(text) {
  const t = String(text).trim();
  return JSON.parse(t);
}
```

**现象：** 真模型有概率返回：

```text
SyntaxError: Unexpected token '`', "```json
{
"... is not valid JSON
```

**原因：** 模型把 JSON 包在 Markdown 代码块里了。这是最常见的脏数据。

**怎么查：** 在 `catch` 里把 `text.slice(0, 60)` 打出来，看到开头是三个反引号就明白了。

**为什么假模式不容易触发？** 因为假模型返回的是纯 JSON 字符串。**这正是假模式的局限**：它模拟不了模型的"坏习惯"。所以这一类错误，你只能在真接口上遇到，或者手动构造。

**手动构造的办法**：在 `mock.js` 的 `badjson` 分支里，把返回内容改成：

```text
content: "```json\n{\"doc_type\":\"invoice\",\"fields\":{}}\n```",
```

这样假模式下也能测到剥代码块的逻辑。

## 错误 2：金额当字符串存进去

**操作：** 把提示词里"金额只写数字"那条规则删掉，然后手动把假数据改成：

```text
total_amount: { value: "¥1,299.00", confidence: 0.95 },
```

**现象：** 提取"成功"，`JSON.parse` 没问题，校验也通过（因为 `confidence` 是数字），**但数据库里存的是字符串**。

然后在页面上试着加一个"本月合计"：

```javascript
const rows = db.prepare("SELECT json FROM extractions").all();
let total = 0;
for (const r of rows) {
  total += JSON.parse(r.json).fields.total_amount.value;
}
console.log(total);
```

**看到的是：**

```text
0¥1,299.00¥1,299.00¥1,299.00
```

字符串相加，不是数字相加。

**原因：** JS 的 `+` 遇到字符串就变成拼接。`0 + "¥1,299.00"` 得到 `"0¥1,299.00"`。

**怎么查：** 在入库前打印 `typeof value`。不是 `number` 就直接报错。

**怎么修：** 校验里加一条：

```javascript
const MONEY_FIELDS = ["total_amount", "tax_amount"];
for (const name of MONEY_FIELDS) {
  const item = doc.fields && doc.fields[name];
  if (item && item.value !== null && typeof item.value !== "number") {
    problems.push(name + " 必须是数字，现在是 " + typeof item.value);
  }
}
```

**这条校验的意义：** 它把"格式要求"从提示词里的软约束，变成了代码里的硬约束。**提示词是请求，校验是底线。**

## 错误 3：日期格式不统一

**操作：** 把假数据里的 `date` 改成 `"2026/3/18"`，再存两条不同格式的：

```text
2026-03-18
2026/3/18
2026年3月5日
```

**现象：** 按日期排序：

```javascript
db.prepare("SELECT id, json FROM extractions ORDER BY json").all()
```

**顺序是乱的**，因为字符串排序按字符比：`"2026-03-18"` 里的 `-`（ASCII 45）比 `"2026/3/18"` 里的 `/`（ASCII 47）小，所以前者永远排前面，跟日期大小无关。

**原因：** `YYYY-MM-DD` 这个格式的好处是**字典序等于时间序**，一旦混进别的格式，这个性质就没了。

**怎么查：** 统计一下有多少种格式：

```text
node -e "const {db}=require('./lib/db');const rows=db.prepare('SELECT json FROM extractions').all();const set=new Set();rows.forEach(r=>{const d=JSON.parse(r.json);if(d.fields&&d.fields.date)set.add(d.fields.date.value.replace(/[0-9]/g,'9'))});console.log([...set])"
```

输出会告诉你存在几种"形状"：

```text
[ '9999-99-99', '9999/9/99' ]
```

**怎么修：** 校验里加正则，不匹配 `^\d{4}-\d{2}-\d{2}$` 就报错，让模型重来一次（重试的成本远低于存错数据的成本）。

## 三个错误总结

```text
包了代码块        → SyntaxError: Unexpected token '`'
金额是字符串      → 数字变成 "0¥1,299.00¥1,299.00"
日期格式不统一    → 排序全乱，按月份筛选筛不到
```

**这三个错误的共同点：都不会报错。** 第一个还能抛异常，后两个是"静默错误"——数据入库了，页面上看着正常，直到你算总和那天才发现。

**静默错误比崩溃危险一百倍。**

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 100 节课学习笔记

## 一、三类图各自的字段和坑

| 类型 | 我要的字段 | 这类图最容易错的地方 |
|---|---|---|
| 发票 | | |
| 聊天截图 | | |
| 表格 | | |

## 二、结构化输出的提示词怎么写

我写的提示词里，哪三句话是"约束"，哪一句是"骨架"：

## 三、模型返回的 JSON 有哪三种脏

| 脏法 | 长什么样 | 我怎么处理 |
|---|---|---|
| | | |
| | | |
| | | |

## 四、置信度是什么，不是什么

是什么：

不是什么：

为什么 0.95 也不能全信：

## 五、哪两个字段必须 100% 人工复核

| 字段 | 错了的后果（具体到钱或日期） |
|---|---|
| | |
| | |

## 六、复核清单怎么设计

进入清单的三个条件：

| 条件 | 例子 |
|---|---|
| | |
| | |
| | |

"标记为已核对"为什么要求全部勾选才能点：

## 七、存进数据库的字段设计

| 字段 | 类型 | 为什么需要 |
|---|---|---|
| | | |
| | | |
| | | |

为什么 `json` 存成 TEXT 不拆列：

## 八、一次批量处理的成本账

| 项目 | 5 张 | 推算 40 张 |
|---|---|---|
| 输入 token | | |
| 输出 token | | |
| 人工复核时间 | | |

## 九、三个错误的后果

| 错误 | 现象 | 是崩溃还是静默 |
|---|---|---|
| 包了代码块 | | |
| 金额是字符串 | | |
| 日期格式不统一 | | |

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] `extractions` 表建好了，能查到记录
- [ ] 三类图都能提取出符合约定的 JSON
- [ ] 发票的金额和日期无条件进入复核清单
- [ ] 表格的合计做了逐行相加的交叉校验
- [ ] 页面上不勾完所有项，点不了"标记为已核对"
- [ ] 批量脚本跑过 5 张，我理解失败清单为什么要单独存
- [ ] 三个错误我都复现过
```

---

# 第 8 步：课后练习

## 练习一：加一个"手写发票"的类型

**要求：** 新增 `handwritten` 类型，字段是：开票日期、金额、收款人、事由。提示词要求"字迹看不清的字段 confidence 填 0.2 以下"。

**验收：** 页面上多一个选项，能返回对应结构。

## 练习二：给截图类加"待办清单"的抽取

**要求：** 现有的 `SCREENSHOT` 里有 `todos` 数组。把它单独存一张 `todos` 表（`id`、`extraction_id`、`text`、`done`），提取成功后逐条写入。

**思考：** 为什么待办要单独一张表，而不是留在 JSON 里？（提示：你要按"完成状态"筛选。）

## 练习三：做一张"这个月花了多少"的统计

**要求：** 写 `scripts/cost-report.js`，读出 `extractions` 表里本月的记录，输出：

```text
2026-11 共 23 张，最低置信度低于 0.6 的有 4 张，需要人工复核 12 张
```

**提示：** `created_at` 是 ISO 字符串，`slice(0, 7)` 就是 `2026-11`。

## 练习四：故意制造一次静默错误

**要求：** 把假数据里表格的 `total.value` 改成比逐行相加少 10，跑一遍，确认交叉校验能抓到它。

**再想一步：** 如果模型把某一行读错 10 块，同时合计也读错 10 块，两个数还是"对得上"，你的交叉校验能发现吗？不能的话，还需要什么？

## 练习五：用自己的话讲

```text
为什么"提取成功"不等于"数据正确"？
为什么置信度 0.95 的金额也要人看？
为什么日期必须统一成 YYYY-MM-DD，而不是"显示的时候再格式化"？
为什么校验只检查形状，不检查数值？
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清"结构化提取"和"让模型描述"的区别
- [ ] 我知道置信度是模型的自我评估，不是准确率
- [ ] 我能说出至少两个"必须人工复核"的字段和理由
- [ ] 我知道什么是"静默错误"，并举例
- [ ] 我理解交叉校验（逐行相加 vs 票面合计）为什么必要

## B. 实操

- [ ] `lib/db.js` 建出 `extractions` 表
- [ ] `lib/extract.js` 三类提示词齐全
- [ ] `POST /api/extract` 能返回 `doc` / `review` / `minConfidence`
- [ ] `GET /api/extract/pending` 能列出未核对的记录
- [ ] `POST /api/extract/:id/verify` 能把 `verified` 置 1
- [ ] `public/extract.html` 能上传、提取、显示复核表
- [ ] `scripts/batch-extract.js` 能跑一个文件夹

## C. 排错

- [ ] JSON 解析报 `Unexpected token` 我知道是代码块包裹
- [ ] 金额变字符串我知道要在校验里加类型检查
- [ ] 日期排序乱我知道是格式不统一
- [ ] 表格合计对不上我知道看 `checkTableTotal` 的返回值
- [ ] 批量某一张失败不影响其他张，我知道 `try` 要包在循环里

## D. 笔记

- [ ] 三类图的字段表是我自己填的，不是抄的
- [ ] 我写下了至少一个"静默错误"的真实例子
- [ ] 成本那张表有我自己的数字
- [ ] "我还不懂的词"有内容

## 本节课要能说出口的一句话

> **模型给的是字段和置信度，不是事实；凡是会变成钱和日期的字段，人都要再看一眼——因为机器错了不心疼，你会。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Cannot POST /api/extract` | 路由挂载了吗 | `server.js` 加一行，重启 |
| `SQLITE_CANTOPEN` | `data` 目录在不在 | `config.js` 会自动建，检查它有没有被 require |
| `better-sqlite3` 装不上 | 有没有编译工具 | 换 Node 22.5+，用 `node:sqlite`，见下 |
| 模型返回一段散文 | 提示词里有没有"只输出 JSON" | 补上，并且给完整骨架 |
| `review` 永远是空 | `ALWAYS_REVIEW` 拼错了字段名 | 字段名必须和提示词里一模一样 |
| 合计永远 match | 用了 `===` 比较浮点 | `Math.abs(a - b) < 0.01` |
| 批量跑到一半停了 | `try` 在循环外 | 挪进循环体 |
| 页面上中文乱码 | 文件保存编码 | VS Code 右下角改成 UTF-8 |
| 复核勾选状态丢了 | 刷新页面 | 正常，勾选状态没存库，需要就自己加 |

## 附：`better-sqlite3` 装不上时的降级方案

Node 22.5 以上内置了 `node:sqlite`，API 不一样但思路一样。把 `lib/db.js` 换成：

```javascript
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./config");

const db = new DatabaseSync(path.join(config.DATA_DIR, "app.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS extractions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type       TEXT NOT NULL,
  file_name      TEXT,
  json           TEXT NOT NULL,
  min_confidence REAL NOT NULL DEFAULT 0,
  needs_review   INTEGER NOT NULL DEFAULT 0,
  verified       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
`);

function now() {
  return new Date().toISOString();
}

module.exports = { db, now };
```

**注意：两者的 `prepare().run()` 返回值类型不同。** `better-sqlite3` 的 `lastInsertRowid` 是 `number`，`node:sqlite` 的是 `bigint`。用到它的地方加 `Number()`。

**这个降级方案只在装不上时用。** 能装上就用 `better-sqlite3`，它更快，而且你第 5 周学的就是它。
