# 第 105 节课：完成图文助手

> 这节课结束时，你手上有：`mm-app` 一个完整的图文助手 —— 上传图 → 识别 → 追问 → 语音播报；`out\acceptance.md`（三张图 × 两问的验收记录）；`out\cost.md`（成本账）。

**时间**：约 120 分钟
**前置**：第 104 节课的 `mm-app`（`lib\errors.js` / `lib\retry.js` / 错误中间件都挂好）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

六个零件你都有了：

| 零件 | 在哪一节 | 单独能干什么 |
|---|---|---|
| 看图说话 | 第 99 节 | 传一张图，返回一段描述 |
| 结构化提取 | 第 100 节 | 传一张发票，返回 JSON 字段 |
| 生图 | 第 101 节 | 文字 → 图 |
| 转写 | 第 102 节 | 音频 → 文字 |
| 合成 | 第 103 节 | 文字 → 音频 |
| 错误处理 | 第 104 节 | 六类错误 + 重试 + 统一出口 |

**但客户不会说"我要一个结构化提取接口"。客户会说：**

```text
"我把图发给你，你告诉我这是啥，我不懂的地方再问你，你念给我听。"
```

**这句话里有四件事，按顺序：**

```text
① 上传图     → 看图
② 识别       → 结构化提取
③ 追问       → 多轮对话，要带上图的上下文
④ 念给我听   → 合成
```

**这一节就是把四个零件接成一条链 —— 而这条链有它自己的问题。**

## 0.2 今天这个坑长什么样

> 你把四个接口串起来了，很顺：
>
> ```javascript
> app.post("/api/assistant", async (req, res) => {
>   const desc = await seeImage(req.body.image);
>   const fields = await extract(req.body.image);
>   const answer = await chat(req.body.question);
>   const audio = await speak(answer);
>   res.json({ desc, fields, answer, audio });
> });
> ```
>
> 自己测：一张发票，一个问题，跑了 8 秒，结果全对。
>
> **客户用了，第一句话就是："太慢了。"**
>
> 你算了一下：
>
> ```text
> 看图      1.8s
> 提取      2.4s
> 回答      1.6s
> 合成      2.2s
> ─────────────
> 合计      8.0s
> ```
>
> **而且四步串行。用户在第 1 秒就想看图，但你要等 8 秒才全部返回。**

**第二个问题更严重：追问。**

```text
用户第一句："这是什么？"      → 正确
用户第二句："第二项多少钱？"  → 模型说"我不知道你在说什么"
```

**因为你没把"这张图"带进第二轮。**

## 0.3 今天要解决的三件事

| 问题 | 解法 | 难在哪 |
|---|---|---|
| **慢** | 并行 + 语音按需 | 要看清哪几步真的没依赖 |
| **追问丢上下文** | 会话 + 每轮带图 | 要设计会话表和存储策略 |
| **成本不透明** | 每次请求记一笔账 | 要能从库里汇总出真实 token |

**第一件最值钱。** 8 秒 → 4 秒，用户感受完全不同。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `lib\session.js` | `第07节课\03-练习代码\mm-app\` | 会话：图片 + 多轮消息 + hash 校验 |
| `lib\assistant.js` | 同上 | 并行看图与提取、带图追问 |
| `routes\assistant.js` | 同上 | 三个接口：上传、追问、播报 |
| `public\assistant.html` | 同上 | 一个能用的页面 |
| `scripts\acceptance.js` | 同上 | 3 张图 × 2 问 |
| `scripts\cost-report.js` | 同上 | 从库里汇总成本 |
| `out\acceptance.md` | 同上 `out\` | 验收记录 |
| `NOTES.md` | `第07节课\02-笔记\` | 第 7 步填 |

---

# 第 1 步：会话 —— 追问的前提（25 分钟）

## 1.1 做什么 / 为什么

**做什么：** 建两张表，存"这次对话用的哪张图 + 聊了什么"。

**为什么不能每轮都让前端把图再传一次：**

```text
方案 A：每轮都传图
  → 一张 2MB 的图，问 5 句就是 10MB 上传
  → 移动端用户会骂人
  → 每轮还要重算描述和提取（钱）

方案 B：第一次传图，服务端存起来，后续只传 sessionId
  → 图存一次，问多少句都只用它
  → 这是对的
```

**但"存起来"有个必须想清楚的问题：存什么？**

```text
✗ 存 base64 → 数据库膨胀（一张图 base64 后 2.7MB）
✗ 只存路径  → 文件被删了就没了，读到 ENOENT
✓ 存路径 + 校验和 → 能检测文件还在不在、有没有被换
```

## 1.2 表结构

```sql
CREATE TABLE assistant_sessions (
  id          TEXT PRIMARY KEY,        -- 随机 id，不用自增（防遍历）
  file_path   TEXT NOT NULL,
  file_hash   TEXT NOT NULL,           -- 检测文件是否还在/是否被换
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  doc_type    TEXT,
  first_seen  TEXT NOT NULL,
  last_active TEXT NOT NULL,
  turns       INTEGER NOT NULL DEFAULT 0,
  total_input_tokens  INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE assistant_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  duration_ms INTEGER,
  error_code  TEXT
);
```

**四个设计决定：**

| 决定 | 理由 |
|---|---|
| `id` 用随机字符串 | **自增 id 可以被遍历，猜到 `s_1` 就能看 `s_2` 的图** |
| 存 `file_path` 不存 base64 | 数据库不膨胀 |
| 存 `file_hash` | 能检测"文件被删了"或"被换了" |
| 累加 `total_*_tokens` | 成本账的基础 |

**第一条最容易忽略，而且它是安全漏洞，不是 bug：**

```text
用自增 id：
  /api/assistant/image/s_1  → 你的图
  /api/assistant/image/s_2  → 别人的图
  → 客户数据泄露
  → 不会报错，功能测试全过
  → 只有出事才会被发现
```

## 1.3 操作

**1.** 进项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第15周-多模态\第07节课\03-练习代码"
xcopy /E /I /Y "..\第06节课\03-练习代码\mm-app" mm-app
cd mm-app
```

**2.** 新建 `lib\session.js`：

```javascript
// session.js —— 会话：一张图 + 多轮消息
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");
const db = require("./db");

db.exec(`
CREATE TABLE IF NOT EXISTS assistant_sessions (
  id          TEXT PRIMARY KEY,
  file_path   TEXT NOT NULL,
  file_hash   TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  doc_type    TEXT,
  first_seen  TEXT NOT NULL,
  last_active TEXT NOT NULL,
  turns       INTEGER NOT NULL DEFAULT 0,
  total_input_tokens  INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  duration_ms INTEGER,
  error_code  TEXT
);

CREATE INDEX IF NOT EXISTS idx_msg_session ON assistant_messages(session_id, id);
`);

function nowIso() {
  return new Date().toISOString();
}

// 96 位随机，猜不出来
function newSessionId() {
  return "s_" + crypto.randomBytes(12).toString("hex");
}

function detectMime(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).toString("hex").startsWith("89504e47")) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" &&
      buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.length >= 6 && buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  return "application/octet-stream";
}

function saveUpload(buf, originalName) {
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const ext = path.extname(originalName || "").toLowerCase();
  const okExt = [".png", ".jpg", ".jpeg", ".webp", ".gif"].indexOf(ext) >= 0 ? ext : ".bin";
  const fileName = "up-" + hash + okExt;
  const full = path.join(config.UPLOAD_DIR, fileName);

  if (!fs.existsSync(full)) fs.writeFileSync(full, buf);

  return {
    relPath: "uploads/" + fileName,
    hash: hash,
    absPath: full,
    bytes: buf.length,
  };
}

function createSession(saved) {
  const id = newSessionId();
  const now = nowIso();

  db.prepare(`
    INSERT INTO assistant_sessions (id, file_path, file_hash, mime, bytes, first_seen, last_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, saved.relPath, saved.hash, saved.mime, saved.bytes, now, now);

  return id;
}

function getSession(id) {
  if (typeof id !== "string" || id.length < 12) return null;
  const row = db.prepare("SELECT * FROM assistant_sessions WHERE id = ?").get(id);
  return row === undefined ? null : row;
}

// 读图时校验文件还在、内容没变
function readSessionImage(session) {
  const abs = path.join(config.DATA_DIR, session.file_path.replace(/\//g, path.sep));

  if (!fs.existsSync(abs)) {
    const err = new Error("这次会话的图片已经不在了");
    err.code = "SESSION_FILE_GONE";
    err.userMessage = "这次会话的图片已过期，请重新上传。";
    err.status = 410;
    err.retryable = false;
    throw err;
  }

  const buf = fs.readFileSync(abs);
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  if (hash !== session.file_hash) {
    const err = new Error("图片内容变了（hash 不一致）");
    err.code = "SESSION_FILE_CHANGED";
    err.userMessage = "这张图片已更新，请重新开始一次对话。";
    err.status = 409;
    err.retryable = false;
    throw err;
  }

  return buf;
}

function addMessage(sessionId, role, content, extra) {
  const e = extra === undefined ? {} : extra;
  db.prepare(`
    INSERT INTO assistant_messages (session_id, role, content, created_at, duration_ms, error_code)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, role, content, nowIso(),
    e.durationMs === undefined ? null : e.durationMs,
    e.errorCode === undefined ? null : e.errorCode);
}

// 取最近 N 条。按 id 降序取再反转，否则拿到的是最早的 N 条
function recentMessages(sessionId, limit) {
  const n = limit === undefined ? 6 : limit;
  const rows = db.prepare(`
    SELECT role, content FROM assistant_messages
     WHERE session_id = ? ORDER BY id DESC LIMIT ?
  `).all(sessionId, n);
  return rows.reverse();
}

function touchSession(sessionId, tokens) {
  const t = tokens === undefined ? {} : tokens;
  db.prepare(`
    UPDATE assistant_sessions
       SET last_active = ?, turns = turns + 1,
           total_input_tokens = total_input_tokens + ?,
           total_output_tokens = total_output_tokens + ?
     WHERE id = ?
  `).run(nowIso(), t.input || 0, t.output || 0, sessionId);
}

function setDocType(sessionId, docType) {
  db.prepare("UPDATE assistant_sessions SET doc_type = ? WHERE id = ?").run(docType, sessionId);
}

function stats(sessionId) {
  return db.prepare("SELECT * FROM assistant_sessions WHERE id = ?").get(sessionId) || null;
}

module.exports = {
  saveUpload, detectMime, createSession, getSession, readSessionImage,
  addMessage, recentMessages, touchSession, setDocType, stats,
};
```

**3.** 新建 `scripts\probe-session.js` 验证三件事：存能读、消息顺序对、篡改能发现：

```javascript
// probe-session.js —— 验证会话：存读一致、消息顺序、hash 校验
const fs = require("node:fs");
const path = require("node:path");
const config = require("../lib/config");
const { makePng } = require("../lib/imagine");
const S = require("../lib/session");

const png = makePng(400, 300, [200, 80, 80]);

const saved = S.saveUpload(png, "test.png");
saved.mime = S.detectMime(png);

console.log("保存路径：" + saved.relPath);
console.log("hash    ：" + saved.hash);
console.log("mime    ：" + saved.mime);
console.log("字节    ：" + saved.bytes);

const id = S.createSession(saved);
console.log("会话 id ：" + id);
console.log("  → 长度 " + id.length + "，如果是 s_1 这种就是自增，有泄露风险");

const s = S.getSession(id);
console.log("");
console.log("=== 读会话 ===");
console.log("file_path：" + s.file_path);
console.log("turns    ：" + s.turns);

const buf = S.readSessionImage(s);
console.log("读回字节：" + buf.length + "（原 " + png.length + "）→ " +
  (buf.length === png.length ? "一致 ✓" : "不一致"));

// 消息顺序：必须按时间正序，不能反
console.log("");
console.log("=== 消息顺序 ===");
S.addMessage(id, "user", "第一句");
S.addMessage(id, "assistant", "第一个回答");
S.addMessage(id, "user", "第二句");
S.addMessage(id, "assistant", "第二个回答");

const recent = S.recentMessages(id, 6);
for (let i = 0; i < recent.length; i += 1) {
  console.log("  [" + (i + 1) + "] " + recent[i].role.padEnd(10) + recent[i].content);
}
console.log("  → 第一条必须是「user 第一句」，如果是最新的那条，说明排序写反了");

// 取最近 2 条，必须是最后两条
console.log("");
console.log("=== 最近 2 条（应该是最新的两条）===");
const last2 = S.recentMessages(id, 2);
for (const m of last2) console.log("  [" + m.role + "] " + m.content);

S.touchSession(id, { input: 1200, output: 40 });
const st = S.stats(id);
console.log("");
console.log("=== 统计 ===");
console.log("turns：" + st.turns + "（应该 1）");
console.log("input_tokens：" + st.total_input_tokens);

// 篡改文件
console.log("");
console.log("=== 篡改文件后读，必须报错 ===");
const abs = path.join(config.DATA_DIR, s.file_path.replace(/\//g, path.sep));
fs.writeFileSync(abs, Buffer.from("被换掉的内容"));
try {
  S.readSessionImage(s);
  console.log("  ✗ 没报错 —— hash 校验失效了");
} catch (err) {
  console.log("  ✓ 报错：" + err.code + " / " + err.userMessage);
}
```

```text
node scripts\probe-session.js
```

## 1.4 屏幕上应该看到什么

```text
>node scripts\probe-session.js
保存路径：uploads/up-a3f9c1d8e2b7f045.png
hash    ：a3f9c1d8e2b7f045
mime    ：image/png
字节    ：480089
会话 id ：s_7f3a9c2e1b4d8a06e5c89123
  → 长度 26，如果是 s_1 这种就是自增，有泄露风险

=== 读会话 ===
file_path：uploads/up-a3f9c1d8e2b7f045.png
turns    ：0
读回字节：480089（原 480089）→ 一致 ✓

=== 消息顺序 ===
  [1] user      第一句
  [2] assistant 第一个回答
  [3] user      第二句
  [4] assistant 第二个回答
  → 第一条必须是「user 第一句」，如果是最新的那条，说明排序写反了

=== 最近 2 条（应该是最新的两条）===
  [user] 第二句
  [assistant] 第二个回答

=== 统计 ===
turns：1（应该 1）
input_tokens：1200

=== 篡改文件后读，必须报错 ===
  ✓ 报错：SESSION_FILE_CHANGED / 这张图片已更新，请重新开始一次对话。
```

**两个关键点：**

**第 1 点：`s_7f3a9c2e1b4d8a06e5c89123` 长度 26 = `s_` + 24 个十六进制字符。**

```text
24 个 hex 字符 = 96 位随机
猜中的概率 ≈ 0
→ 没有遍历风险
```

**第 2 点：`[1] user 第一句` 必须是最早的。**

```text
如果这里显示的是「第二句」，说明你的 SQL 忘了 reverse()
→ 模型看到的历史是倒序的
→ 它会以为"最后说的是第一句"
→ 回答完全错乱，而且你不容易发现
```

**这个 bug 极常见的写法是：**

```javascript
// 错：取最近 N 条，但没反转
const rows = db.prepare("... ORDER BY id DESC LIMIT ?").all(sessionId, 6);

// 对：
return rows.reverse();
```

**`recentMessages` 里那个 `.reverse()` 就是防这个的。**

## 1.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `读回字节` 不一致 | `writeFileSync` 不完整 | 检查 `saveUpload` |
| 篡改后没报错 | 没比 hash | 检查 `readSessionImage` |
| 消息顺序是倒的 | 忘了 `reverse()` | 加上 |
| `会话 id` 是 `s_1` | 用了自增 | `randomBytes` |
| `no such table` | `db.exec` 没执行 | `require("./db")` 要在最前 |
| `turns` 是 0 但加过消息 | `touchSession` 没调 | 加消息不自动加 turns |

---

# 第 2 步：并行 —— 从 8 秒到 4 秒（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 把"看图"和"提取"并行；把"语音"改成按需。

**先看清四步的依赖关系：**

```text
① 看图（描述）    ─┐
                   ├─→ ③ 回答（需要描述 + 字段 + 历史）
② 提取（字段）    ─┘
                        ↓
                   ④ 合成（需要 ③ 的文字）
```

**① 和 ② 没有依赖。它们都只需要"那张图"。**

```text
全串行：        1.8 + 2.4 + 1.6 + 2.2 = 8.0s
并行 ①②：      max(1.8, 2.4) + 1.6 + 2.2 = 6.2s    省 1.8s（22%）
再改成语音按需： max(1.8, 2.4) + 1.6       = 4.0s    省 4.0s（50%）
```

**这两个优化的性质完全不同：**

| 优化 | 性质 | 谁决定 |
|---|---|---|
| 并行 ①② | **纯代码改动**，改 3 行 | 你自己 |
| 语音按需 | **产品设计改动**，用户多点一次 | **必须客户点头** |

**所以你不能单方面把语音改成"手动点击"。** 但你可以把这个数字摆给客户：

```text
"自动播报要多等 2.2 秒。你要'点一下听'还是'直接听'？"
```

## 2.2 操作

新建 `lib\assistant.js`：

```javascript
// assistant.js —— 并行看图与提取、带图的追问
const S = require("./session");
const { visionAnalyze } = require("./vision");
const { extractImage } = require("./extract");
const { chat } = require("./llm");

// 粗估 token：中文约 1.5/字，其余约 0.3/字符
function estimateTokens(text) {
  const s = String(text);
  const cjk = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  return Math.ceil(cjk * 1.5 + (s.length - cjk) * 0.3);
}

// 并行：两个请求同时发
async function analyzeAndExtract(buf, mime, options) {
  const opts = options === undefined ? {} : options;
  const b64 = buf.toString("base64");

  const t0 = Date.now();

  // 关键：用 allSettled 而不是 all
  const [descResult, fieldsResult] = await Promise.allSettled([
    visionAnalyze(b64, mime, { prompt: opts.descPrompt }),
    extractImage(b64, mime, { docType: opts.docType || "auto" }),
  ]);

  const ms = Date.now() - t0;

  return {
    desc: descResult.status === "fulfilled"
      ? descResult.value
      : { ok: false, error: descResult.reason },
    fields: fieldsResult.status === "fulfilled"
      ? fieldsResult.value
      : { ok: false, error: fieldsResult.reason },
    ms: ms,
  };
}

async function answer(sessionId, question, options) {
  const opts = options === undefined ? {} : options;

  const session = S.getSession(sessionId);
  if (session === null) {
    const err = new Error("会话不存在");
    err.code = "SESSION_NOT_FOUND";
    err.userMessage = "这次对话已经过期，请重新上传图片。";
    err.status = 410;
    err.retryable = false;
    throw err;
  }

  // 读图（会校验 hash）
  const buf = S.readSessionImage(session);
  const b64 = buf.toString("base64");

  const history = S.recentMessages(sessionId, 6);

  const histText = history.length === 0
    ? "（这是第一轮）"
    : history.map((m) => (m.role === "user" ? "用户：" : "助手：") + m.content).join("\n");

  const system = [
    "你是图文助手。用户上传了一张图片，你要根据图片和对话历史回答。",
    "",
    "规则：",
    "1. 只能根据图片内容和对话历史回答。看不出来的，直接说「这张图上看不出来」。",
    "2. 涉及金额、日期、编号时，照抄图中的原文，不要换算、不要补零。",
    "3. 回答不超过 150 字。",
    "4. 不要输出「根据图片」「如图所示」这类套话，直接说结论。",
  ].join("\n");

  const userText = [
    "【对话历史】",
    histText,
    "",
    "【当前问题】",
    question,
  ].join("\n");

  const t0 = Date.now();

  // 关键：图片每一轮都要带上，否则模型看不到
  const result = await chat(system, [
    { type: "text", text: userText },
    { type: "image_url", image_url: { url: "data:" + session.mime + ";base64," + b64 } },
  ], { temperature: 0 });

  const ms = Date.now() - t0;

  // 图片按约 800 token 粗估
  const inTok = estimateTokens(system) + estimateTokens(userText) + 800;
  const outTok = estimateTokens(result.content);

  S.addMessage(sessionId, "user", question, { durationMs: ms });
  S.addMessage(sessionId, "assistant", result.content, { durationMs: ms });
  S.touchSession(sessionId, { input: inTok, output: outTok });

  return {
    ok: true,
    sessionId: sessionId,
    question: question,
    answer: result.content,
    ms: ms,
    tokens: { input: inTok, output: outTok },
    turns: S.stats(sessionId).turns,
  };
}

module.exports = { analyzeAndExtract, answer, estimateTokens };
```

**新建 `scripts\bench-parallel.js`**，用假任务量出三种流程的耗时：

```javascript
// bench-parallel.js —— 串行 vs 并行 vs 不自动播报，量出真实差距
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 固定延迟，模拟真实接口
const DELAY = { vision: 1800, extract: 2400, answer: 1600, speak: 2200 };

async function vision() { await sleep(DELAY.vision); }
async function extract() { await sleep(DELAY.extract); }
async function answer() { await sleep(DELAY.answer); }
async function speak() { await sleep(DELAY.speak); }

async function serial() {
  const t0 = Date.now();
  await vision();
  await extract();
  await answer();
  await speak();
  return Date.now() - t0;
}

async function parallelWithSpeak() {
  const t0 = Date.now();
  await Promise.all([vision(), extract()]);
  await answer();
  await speak();
  return Date.now() - t0;
}

async function parallelNoSpeak() {
  const t0 = Date.now();
  await Promise.all([vision(), extract()]);
  await answer();
  return Date.now() - t0;
}

async function main() {
  console.log("=== 三种流程（假任务，固定延迟）===");
  console.log("");
  console.log("各步延迟：看图 " + DELAY.vision + " / 提取 " + DELAY.extract +
    " / 回答 " + DELAY.answer + " / 合成 " + DELAY.speak + " ms");
  console.log("");

  const s = await serial();
  console.log("1. 全串行              ：" + s + " ms（理论 " +
    (DELAY.vision + DELAY.extract + DELAY.answer + DELAY.speak) + "）");

  const p = await parallelWithSpeak();
  console.log("2. 并行前两步          ：" + p + " ms（理论 " +
    (Math.max(DELAY.vision, DELAY.extract) + DELAY.answer + DELAY.speak) + "）");

  const n = await parallelNoSpeak();
  console.log("3. 并行 + 语音按需     ：" + n + " ms（理论 " +
    (Math.max(DELAY.vision, DELAY.extract) + DELAY.answer) + "）");

  console.log("");
  console.log("=== 相对全串行 ===");
  console.log("方案 2 省 " + (s - p) + " ms（" + Math.round((s - p) / s * 100) + "%）—— 纯代码改动");
  console.log("方案 3 省 " + (s - n) + " ms（" + Math.round((s - n) / s * 100) + "%）—— 需要客户同意");
  console.log("");
  console.log("=== 结论 ===");
  console.log("并行的收益 = min(" + DELAY.vision + ", " + DELAY.extract + ") = " +
    Math.min(DELAY.vision, DELAY.extract) + " ms —— 永远等于较快的那一步");
  console.log("语音按需的收益 = " + DELAY.speak + " ms —— 等于整个语音步骤");
  console.log("");
  console.log("注意：这是假任务。真实测量要在 MOCK=false 下跑三次取中位数。");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
```

```text
node scripts\bench-parallel.js
```

## 2.3 屏幕上应该看到什么

```text
>node scripts\bench-parallel.js
=== 三种流程（假任务，固定延迟）===

各步延迟：看图 1800 / 提取 2400 / 回答 1600 / 合成 2200 ms

1. 全串行              ：8011 ms（理论 8000）
2. 并行前两步          ：6207 ms（理论 6200）
3. 并行 + 语音按需     ：4013 ms（理论 4000）

=== 相对全串行 ===
方案 2 省 1804 ms（23%）—— 纯代码改动
方案 3 省 3998 ms（50%）—— 需要客户同意

=== 结论 ===
并行的收益 = min(1800, 2400) = 1800 ms —— 永远等于较快的那一步
语音按需的收益 = 2200 ms —— 等于整个语音步骤

注意：这是假任务。真实测量要在 MOCK=false 下跑三次取中位数。
```

**最关键的一句话是"并行的收益 = min(两步延迟) = 1800ms"。**

**这个规律值得记住：**

```text
并行两步，省下的时间 = 较快那一步的耗时
不是"两步之和的一半"，不是"平均"

因为：
  并行的总耗时 = max(A, B)
  串行的总耗时 = A + B
  省下的       = A + B - max(A, B) = min(A, B)

→ 所以"哪一步快，就省哪一步的时间"
→ 如果两步一样快，省一半
→ 如果一步是另一步的 10 倍，只省 1/11
```

**推论：** 想靠并行省更多，得让"快的那一步"变慢 —— 这听起来荒谬，但意思是：**并行的对象应该是"耗时接近的两步"**。如果一个 100ms 一个 5s，并行没意义。

## 2.4 为什么用 `allSettled` 而不是 `all`

**这个选择决定"一个失败是否拖垮全部"。**

```javascript
// Promise.all：任何一个 reject，整体就 reject
// → 提取失败（客户传的不是票据）→ 连描述都拿不到
// → 用户什么都看不到

// Promise.allSettled：等全部结束，各自带状态
// → 提取失败，描述还能用
// → 用户至少能看到"这是什么东西"
```

**真实的业务场景：**

```text
客户传了一张风景照
  → 提取失败（"这不是票据"）
  → 描述成功（"这是一张海边的照片"）

allSettled：
  "这是一张海边的照片，但没有识别到票据信息"     ← 有用

all：
  整体失败 → "出错了"                        ← 用户以为系统坏了
```

**所以 `allSettled` 不是"更花哨"，是"更符合用户预期"。**

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 并行没省时间 | 实际是 await 完一个才发第二个 | 检查是不是真用了 `Promise.all` |
| 方案 3 和方案 2 差不多 | 假任务 `sleep` 不准 | 看趋势，别抠毫秒 |
| 真实测量波动大 | 网络波动 | 跑三次取中位数 |
| `allSettled` 不认 | Node < 12.9 | 升级 |

---

# 第 3 步：接口和页面（20 分钟）

## 3.1 做什么 / 为什么

**做什么：** 三个接口 + 一个页面。

| 接口 | 作用 | 耗时 |
|---|---|---|
| `POST /api/assistant/upload` | 传图，返回 sessionId + 描述 + 字段 | 约 2.4s |
| `POST /api/assistant/ask` | 追问，返回答案 | 约 1.6s |
| `POST /api/assistant/speak` | 把一段文字合成语音 | 约 2.2s |

**为什么三个都要分开：**

```text
上传和追问合并（每轮带图）
  → 每轮重算描述和提取（钱）+ 每轮传图（流量）

追问和播报合并（每次自动合成）
  → 每次追问多等 2.2 秒
```

**分开的唯一代价是前端要调三次。** 这个代价远比"慢 2.2 秒"小。

## 3.2 操作

新建 `routes\assistant.js`：

```javascript
// assistant.js —— 图文助手的三个接口
const express = require("express");
const path = require("node:path");
const router = express.Router();
const { wrap } = require("../lib/error-middleware");
const { makeAppError } = require("../lib/errors");
const S = require("../lib/session");
const A = require("../lib/assistant");
const { speak } = require("../lib/speak");

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024);

// ---------- 1. 上传 ----------
// body: { image: "<base64>", fileName: "a.png" }
router.post("/assistant/upload", wrap(async (req, res) => {
  const body = req.body || {};
  const b64 = String(body.image || "").replace(/^data:[^;]+;base64,/, "");

  if (b64.length === 0) throw makeAppError("BAD_FORMAT", "请求里没有 image 字段");

  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0) throw makeAppError("BAD_FORMAT", "image 解码后是空的");
  if (buf.length > MAX_BYTES) {
    throw makeAppError("IMG_TOO_LARGE", "收到 " + buf.length + " 字节，上限 " + MAX_BYTES);
  }

  const mime = S.detectMime(buf);
  if (mime === "application/octet-stream") {
    throw makeAppError("BAD_FORMAT", "文件头不是已知的图片格式");
  }

  const saved = S.saveUpload(buf, body.fileName);
  saved.mime = mime;

  const id = S.createSession(saved);

  // 并行看图 + 提取
  const r = await A.analyzeAndExtract(buf, mime, { docType: body.docType });

  if (r.desc.ok !== false) {
    S.addMessage(id, "assistant", String(r.desc).slice(0, 2000), { durationMs: r.ms });
  } else {
    S.addMessage(id, "assistant", "", { durationMs: r.ms, errorCode: r.desc.error.code || "VISION_FAILED" });
  }

  if (r.fields.ok !== false) {
    const dt = r.fields.docType || r.fields.type || "other";
    S.setDocType(id, dt);
  }

  res.json({
    ok: true,
    sessionId: id,
    image: { path: saved.relPath, mime: mime, bytes: buf.length, hash: saved.hash },
    desc: r.desc.ok === false
      ? { ok: false, code: r.desc.error.code || "UNKNOWN",
          message: r.desc.error.userMessage || "看图失败" }
      : { ok: true, text: r.desc },
    fields: r.fields.ok === false
      ? { ok: false, code: r.fields.error.code || "UNKNOWN",
          message: r.fields.error.userMessage || "提取失败" }
      : { ok: true, data: r.fields },
    ms: r.ms,
  });
}));

// ---------- 2. 追问 ----------
router.post("/assistant/ask", wrap(async (req, res) => {
  const body = req.body || {};
  const question = String(body.question || "").trim();

  if (question.length === 0) throw makeAppError("BAD_FORMAT", "question 不能为空");
  if (question.length > 500) {
    throw makeAppError("TEXT_TOO_LONG", "问题有 " + question.length + " 字，上限 500");
  }

  const r = await A.answer(String(body.sessionId || ""), question);
  res.json(r);
}));

// ---------- 3. 播报 ----------
router.post("/assistant/speak", wrap(async (req, res) => {
  const body = req.body || {};
  let text = String(body.text || "");

  if (text.length === 0 && body.sessionId !== undefined) {
    const last = S.recentMessages(String(body.sessionId), 1);
    if (last.length > 0) text = last[0].content;
  }

  if (text.length === 0) throw makeAppError("BAD_FORMAT", "没有要播报的文本");

  const r = await speak(text, { speed: body.speed });

  res.json({
    ok: true,
    segments: r.segments.map((s) => ({
      index: s.index,
      text: s.text,
      url: "/audio/" + path.basename(s.file),
      estSec: s.estSec,
      cached: s.cached,
    })),
    calls: r.calls,
    totalEstSec: r.totalEstSec,
  });
}));

// ---------- 4. 取原图 ----------
router.get("/assistant/image/:sessionId", wrap(async (req, res) => {
  const s = S.getSession(req.params.sessionId);
  if (s === null) throw makeAppError("UNKNOWN", "会话不存在");
  const buf = S.readSessionImage(s);
  res.set("Content-Type", s.mime).send(buf);
}));

module.exports = router;
```

**在 `server.js` 里挂上。三个地方必须改：**

```javascript
const path = require("node:path");
const config = require("./lib/config");

// ① body 上限。默认 100kb，一张图就超
app.use(express.json({ limit: "20mb" }));

// ② 路由
app.use("/api", require("./routes/assistant"));

// ③ 音频静态目录
app.use("/audio", express.static(config.TTS_DIR));
```

**第 ① 条最容易漏。**

```text
默认 limit 100kb
→ 一张 400×300 的 PNG 就超过
→ 报 PayloadTooLargeError
→ classify 会归成 IMG_TOO_LARGE（碰巧对）
→ 但提示是"请压缩到 5MB 以内"
→ 用户传 300KB 也失败，一直压，压到 50KB 还失败
→ 最后来找你
```

**这个坑最阴险的地方：错误信息的方向是对的（"太大"），但阈值是错的（100KB 而不是 5MB）。**

## 3.3 建页面

新建 `public\assistant.html`，**不引框架，一个文件**：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>图文助手</title>
<style>
  body { font-family: system-ui, -apple-system, "Microsoft YaHei", sans-serif;
         max-width: 720px; margin: 0 auto; padding: 16px; background: #fafafa; color: #222; }
  h1 { font-size: 20px; margin: 8px 0 16px; }
  .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  button { padding: 8px 14px; border: 1px solid #d0d0d0; background: #fff; border-radius: 6px; cursor: pointer; font-size: 14px; }
  button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  input[type=text] { flex: 1; min-width: 200px; padding: 8px 10px; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 14px; }
  #thumb { max-width: 100%; max-height: 260px; border-radius: 6px; display: none; }
  .msg { padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; white-space: pre-wrap; line-height: 1.6; font-size: 14px; }
  .msg.user { background: #e8f0fe; }
  .msg.bot { background: #f4f4f5; }
  .meta { font-size: 12px; color: #666; margin-bottom: 8px; }
  .err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  audio { width: 100%; margin-top: 8px; }
</style>
</head>
<body>

<h1>图文助手</h1>

<div class="card">
  <div class="row">
    <input type="file" id="file" accept="image/*">
    <button class="primary" id="btnUpload">上传并识别</button>
  </div>
  <div style="margin-top:12px"><img id="thumb" alt=""></div>
  <div class="meta" id="uploadMeta"></div>
</div>

<div class="card" id="chatCard" style="display:none">
  <div id="chat"></div>
  <div class="row" style="margin-top:12px">
    <input type="text" id="q" placeholder="关于这张图，你想问什么？">
    <button class="primary" id="btnAsk">发送</button>
  </div>
  <div class="row" style="margin-top:8px">
    <button id="btnSpeak">朗读最后的回答</button>
  </div>
  <div id="audioBox"></div>
</div>

<script>
let sessionId = null;
let lastAnswer = "";
const $ = (id) => document.getElementById(id);

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("读文件失败"));
    fr.readAsDataURL(file);
  });
}

function addMsg(role, text) {
  const d = document.createElement("div");
  d.className = "msg " + (role === "user" ? "user" : "bot");
  d.textContent = text;
  $("chat").appendChild(d);
  d.scrollIntoView({ behavior: "smooth", block: "end" });
}

function showError(data) {
  const d = document.createElement("div");
  d.className = "msg err";
  d.textContent = "【" + (data.code || "ERROR") + "】" + (data.message || "未知错误");
  $("chat").appendChild(d);
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, code: "BAD_JSON", message: "返回不是 JSON" }));
  return { status: res.status, data: data };
}

$("btnUpload").onclick = async () => {
  const f = $("file").files[0];
  if (!f) { alert("先选一张图"); return; }

  // 前端先拦：不要等传完 20MB 再告诉用户太大
  if (f.size > 6 * 1024 * 1024) {
    alert("图片超过 6MB，请先压缩。当前 " + (f.size / 1024 / 1024).toFixed(1) + "MB");
    return;
  }

  $("btnUpload").disabled = true;
  $("btnUpload").textContent = "识别中…";

  try {
    const dataUrl = await readAsDataURL(f);
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

    $("thumb").src = dataUrl;
    $("thumb").style.display = "block";

    const t0 = performance.now();
    const r = await post("/api/assistant/upload", { image: b64, fileName: f.name });
    const ms = Math.round(performance.now() - t0);

    if (r.data.ok !== true) { showError(r.data); return; }

    const data = r.data;
    sessionId = data.sessionId;
    $("chatCard").style.display = "block";
    $("chat").innerHTML = "";

    $("uploadMeta").textContent =
      "sessionId=" + sessionId.slice(0, 12) + "…  往返 " + ms + "ms  服务端 " + data.ms + "ms";

    if (data.desc.ok) addMsg("bot", "【图片描述】\n" + data.desc.text);
    else showError(data.desc);

    if (data.fields.ok) addMsg("bot", "【识别结果】\n" + JSON.stringify(data.fields.data, null, 2));
    else showError(data.fields);
  } catch (err) {
    showError({ code: "CLIENT_ERROR", message: err.message });
  } finally {
    $("btnUpload").disabled = false;
    $("btnUpload").textContent = "上传并识别";
  }
};

$("btnAsk").onclick = async () => {
  const q = $("q").value.trim();
  if (!q) return;
  if (sessionId === null) { alert("先上传一张图"); return; }

  addMsg("user", q);
  $("q").value = "";
  $("btnAsk").disabled = true;

  try {
    const r = await post("/api/assistant/ask", { sessionId: sessionId, question: q });
    if (r.data.ok !== true) { showError(r.data); return; }

    lastAnswer = r.data.answer;
    addMsg("bot", r.data.answer);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = "第 " + r.data.turns + " 轮 · " + r.data.ms + "ms · 输入约 " +
      r.data.tokens.input + " token，输出约 " + r.data.tokens.output + " token";
    $("chat").appendChild(meta);
  } finally {
    $("btnAsk").disabled = false;
  }
};

$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btnAsk").click(); });

$("btnSpeak").onclick = async () => {
  if (!lastAnswer) { alert("先问一个问题"); return; }

  $("btnSpeak").disabled = true;
  $("btnSpeak").textContent = "合成中…";

  try {
    const r = await post("/api/assistant/speak", { text: lastAnswer });
    if (r.data.ok !== true) { showError(r.data); return; }

    $("audioBox").innerHTML = "";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = r.data.segments.length + " 段 · 合成 " + r.data.calls +
      " 次 · 估算 " + r.data.totalEstSec + " 秒";
    $("audioBox").appendChild(meta);

    playSequentially(r.data.segments, 0);
  } finally {
    $("btnSpeak").disabled = false;
    $("btnSpeak").textContent = "朗读最后的回答";
  }
};

// 音频不能拼，只能依次播
function playSequentially(segments, i) {
  if (i >= segments.length) return;

  const audio = document.createElement("audio");
  audio.controls = true;
  audio.src = segments[i].url;
  audio.onended = () => playSequentially(segments, i + 1);

  $("audioBox").appendChild(audio);
  audio.play().catch(() => { /* 浏览器可能阻止自动播放 */ });
}
</script>

</body>
</html>
```

## 3.4 屏幕上应该看到什么

浏览器打开 `http://localhost:3000/assistant.html`：

```text
图文助手

[选择文件] [上传并识别]

（缩略图）

sessionId=s_7f3a9c2e1b4…  往返 2841ms  服务端 2403ms

【图片描述】
这是一张差旅报销单的照片，上面有日期、金额、事由等信息。

【识别结果】
{
  "docType": "invoice",
  "fields": {
    "date": { "value": "2026-10-15", "confidence": 0.94 },
    "amount": { "value": "1280.00", "confidence": 0.88 }
  }
}

[关于这张图，你想问什么？          ] [发送]
[朗读最后的回答]
```

问一句"金额是多少"：

```text
【用户】金额是多少
【助手】1280.00 元。
第 1 轮 · 1620ms · 输入约 2140 token，输出约 12 token
```

**注意三个数字，每个都有信息：**

| 数字 | 说明 |
|---|---|
| 往返 2841ms vs 服务端 2403ms | **差 438ms 是"传输 + base64 解析"的成本** |
| 输入 2140 token | 一句 6 字问题，输入 2140 —— **因为图片占约 800，历史 + system 占 1300** |
| 输出 12 token | 答案只有一行 |

**输入 2140 / 输出 12 ≈ 178 : 1。**

**这个比例决定了你的成本优化方向 —— 第 5 步会算。**

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `PayloadTooLargeError` | `express.json` limit | 设 `limit: "20mb"` |
| 传图立刻 413（图才 300KB） | 同上，默认 100kb | 同上 |
| 追问"会话不存在" | sessionId 没传 | 检查前端变量 |
| 追问说"我不知道你在说什么" | 没带图/没带历史 | 检查 `answer()` |
| 音频不播 | 浏览器阻止自动播放 | 用户手动点（已处理） |
| 只播第一段 | 没绑 `onended` | 检查 `playSequentially` |
| 图片 404 | `/audio` 挂了但没挂 uploads | 加 `app.use("/uploads", express.static(config.UPLOAD_DIR))` |

---

# 第 4 步：验收 —— 3 张图 × 2 问（25 分钟）

## 4.1 为什么"固定"和"两问"

**固定的原因：**

```text
随机测试 = 每次输入不同 = 无法比较
固定测试 = 每次同样输入   = 改动前后能对比
```

**两个问题的设计：一个"图上能看出"，一个"图上可能没有"。**

| 问题 | 期望行为 | 测什么 |
|---|---|---|
| "金额是多少"（清晰的票据） | 答对 | 基本能力 |
| "这是哪个公司开的"（可能没有） | **说"看不出来"** | **会不会编** |

**第二个问题才是真正的验收。**

```text
能答对的问题，模型基本都对
"该说不知道"的问题，模型经常硬编
→ 这一题能测出"它会不会编"
```

## 4.2 操作

新建 `scripts\acceptance.js`：

```javascript
// acceptance.js —— 3 张图 × 2 问
// 前提：.env 里 MOCK=false；samples\ 下有三张真图
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });

const fs = require("node:fs");
const path = require("node:path");
const config = require("../lib/config");
const S = require("../lib/session");
const A = require("../lib/assistant");
const { speak } = require("../lib/speak");
const { makePng } = require("../lib/imagine");

const CASES = [
  { key: "clear", label: "清晰票据", questions: ["这张票据的金额是多少？", "这是哪个公司开的？"] },
  { key: "blur", label: "模糊照片", questions: ["这张图上写了什么？", "金额是多少？"] },
  { key: "other", label: "非票据图（风景/截图）", questions: ["这张图上有什么？", "这张票的金额是多少？"] },
];

function ensureSamples() {
  const dir = path.join(__dirname, "..", "samples");
  fs.mkdirSync(dir, { recursive: true });

  const makers = {
    "clear.png": () => makePng(800, 600, [250, 250, 245]),
    "blur.png": () => makePng(120, 90, [190, 190, 190]),
    "other.png": () => makePng(640, 480, [120, 170, 200]),
  };

  let generated = 0;
  for (const name of Object.keys(makers)) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, makers[name]());
      generated += 1;
      console.log("已生成占位图：" + p);
    }
  }

  if (generated > 0) {
    console.log("");
    console.log("!!! 上面这些是程序生成的纯色占位图。");
    console.log("!!! 真实验收必须换成：");
    console.log("!!!   samples\\clear.png → 一张清晰的发票/票据照片");
    console.log("!!!   samples\\blur.png  → 一张拍虚了的照片");
    console.log("!!!   samples\\other.png → 一张不是票据的图");
    console.log("!!! 用占位图你只能验证「管道通」，验证不了「识别准」。");
    console.log("");
  }

  return dir;
}

async function runOne(caseItem, imgPath) {
  const buf = fs.readFileSync(imgPath);
  const mime = S.detectMime(buf);

  const saved = S.saveUpload(buf, path.basename(imgPath));
  saved.mime = mime;
  const sessionId = S.createSession(saved);

  const t1 = Date.now();
  const r = await A.analyzeAndExtract(buf, mime, {});
  const uploadMs = Date.now() - t1;

  const turns = [];
  for (const q of caseItem.questions) {
    const t = Date.now();
    try {
      const ans = await A.answer(sessionId, q);
      turns.push({ q: q, ok: true, answer: ans.answer, ms: ans.ms, tokens: ans.tokens });
    } catch (err) {
      turns.push({ q: q, ok: false, code: err.code || "UNKNOWN",
        message: err.userMessage || err.message, ms: Date.now() - t });
    }
  }

  let speakRec = null;
  const lastOk = turns.filter((t) => t.ok).slice(-1)[0];
  if (lastOk !== undefined) {
    const t = Date.now();
    try {
      const sp = await speak(lastOk.answer, {});
      speakRec = { ok: true, segments: sp.segments.length, calls: sp.calls,
        estSec: sp.totalEstSec, ms: Date.now() - t };
    } catch (err) {
      speakRec = { ok: false, code: err.code || "UNKNOWN", message: err.message, ms: Date.now() - t };
    }
  }

  return {
    key: caseItem.key, label: caseItem.label, sessionId: sessionId,
    upload: {
      ms: uploadMs,
      descOk: r.desc.ok !== false,
      descText: r.desc.ok === false ? null : String(r.desc),
      fieldsOk: r.fields.ok !== false,
      fieldsData: r.fields.ok === false ? null : r.fields,
    },
    turns: turns, speak: speakRec,
  };
}

async function main() {
  console.log("模式：" + (config.MOCK ? "MOCK（识别结果都不可信）" : "真实模型"));
  console.log("");

  const dir = ensureSamples();
  const results = [];

  for (const c of CASES) {
    const imgPath = path.join(dir, c.key + ".png");
    console.log("=== " + c.label + " ===");
    const r = await runOne(c, imgPath);
    results.push(r);

    console.log("  上传+识别：" + r.upload.ms + "ms，描述" +
      (r.upload.descOk ? "成功" : "失败") + "，提取" + (r.upload.fieldsOk ? "成功" : "失败"));

    for (const t of r.turns) {
      console.log("  问：" + t.q);
      if (t.ok) {
        console.log("    答：" + String(t.answer).slice(0, 70).replace(/\n/g, " "));
        console.log("    " + t.ms + "ms，输入 " + t.tokens.input + " / 输出 " + t.tokens.output);
      } else {
        console.log("    失败：" + t.code + " / " + t.message);
      }
    }

    if (r.speak !== null && r.speak.ok) {
      console.log("  播报：" + r.speak.segments + " 段，" + r.speak.calls + " 次合成，" +
        r.speak.estSec + " 秒，" + r.speak.ms + "ms");
    }
    console.log("");
  }

  // ---------- 写报告 ----------
  const outDir = path.join(__dirname, "..", "out");
  fs.mkdirSync(outDir, { recursive: true });

  const L = [];
  L.push("# 图文助手验收记录");
  L.push("");
  L.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
  L.push("模式：" + (config.MOCK ? "MOCK（**所有识别结果都不可信**）" : "真实模型"));
  L.push("");

  L.push("## 一、总览");
  L.push("");
  L.push("| 图 | 上传+识别 | 描述 | 提取 | 两问都成功 |");
  L.push("|---|---|---|---|---|");
  for (const r of results) {
    const okTurns = r.turns.filter((t) => t.ok).length;
    L.push("| " + r.label + " | " + r.upload.ms + "ms | " + (r.upload.descOk ? "✓" : "✗") +
      " | " + (r.upload.fieldsOk ? "✓" : "✗") + " | " + okTurns + "/" + r.turns.length + " |");
  }
  L.push("");

  L.push("## 二、逐图详情");
  L.push("");
  for (const r of results) {
    L.push("### " + r.label);
    L.push("");
    L.push("sessionId：`" + r.sessionId + "`");
    L.push("");
    L.push("**图片描述**（" + r.upload.ms + "ms）");
    L.push("");
    L.push("```text");
    L.push(r.upload.descOk ? String(r.upload.descText).slice(0, 400) : "（失败）");
    L.push("```");
    L.push("");
    L.push("**识别字段**");
    L.push("");
    L.push("```json");
    L.push(r.upload.fieldsOk ? JSON.stringify(r.upload.fieldsData, null, 2).slice(0, 900) : "（失败）");
    L.push("```");
    L.push("");
    L.push("**两轮问答**（「判定」列必须你手工填）");
    L.push("");
    L.push("| # | 问题 | 回答 | 耗时 | 输入token | 判定 |");
    L.push("|---|---|---|---|---|---|");
    for (let i = 0; i < r.turns.length; i += 1) {
      const t = r.turns[i];
      if (t.ok) {
        L.push("| " + (i + 1) + " | " + t.q + " | " +
          String(t.answer).replace(/\|/g, "\\|").slice(0, 90) + " | " + t.ms + "ms | " +
          t.tokens.input + " | 待判定 |");
      } else {
        L.push("| " + (i + 1) + " | " + t.q + " | 失败：" + t.code + " | " + t.ms + "ms | - | 抛错 |");
      }
    }
    L.push("");
    if (r.speak !== null) {
      L.push("**播报**：" + (r.speak.ok
        ? r.speak.segments + " 段，" + r.speak.calls + " 次合成，" + r.speak.estSec + " 秒，" + r.speak.ms + "ms"
        : "失败 " + r.speak.code));
      L.push("");
    }
  }

  L.push("## 三、必须人工判定的一项");
  L.push("");
  L.push("每张图的**第 2 个问题**都是「图上可能没有」的（哪个公司开的 / 金额是多少）。");
  L.push("");
  L.push("| 模型表现 | 合格吗 | 为什么 |");
  L.push("|---|---|---|");
  L.push("| 回答「这张图上看不出来」 | ✓ | 正确承认边界 |");
  L.push("| 编一个看起来很合理的答案 | ✗ | **这是幻觉，比不答危险得多** |");
  L.push("");
  L.push("**请把上面表格里的「待判定」逐条改成 ✓ 或 ✗。这一步不能交给模型。**");
  L.push("");

  const upAvg = Math.round(results.reduce((s, r) => s + r.upload.ms, 0) / results.length);
  const turnMs = results.reduce((s, r) => s + r.turns.reduce((a, t) => a + t.ms, 0), 0);
  const turnN = results.reduce((s, r) => s + r.turns.length, 0);

  L.push("## 四、耗时");
  L.push("");
  L.push("| 阶段 | 平均 |");
  L.push("|---|---|");
  L.push("| 上传 + 识别 | " + upAvg + "ms |");
  L.push("| 单轮追问 | " + Math.round(turnMs / Math.max(1, turnN)) + "ms |");
  L.push("");
  L.push("对比：全串行理论 8000ms，并行 + 语音按需后约 4000ms。");
  L.push("实测差异主要来自网络和模型波动。");
  L.push("");

  const outPath = path.join(outDir, "acceptance.md");
  fs.writeFileSync(outPath, L.join("\n"), "utf8");
  console.log("已写入：" + outPath);
}

main().catch((err) => {
  console.error("验收失败：" + err.message);
  process.exitCode = 1;
});
```

```text
node scripts\acceptance.js
```

## 4.3 屏幕上应该看到什么

**用占位纯色图跑（只能验证管道）：**

```text
>node scripts\acceptance.js
模式：真实模型

已生成占位图：B:\...\mm-app\samples\clear.png
...

!!! 上面这些是程序生成的纯色占位图。
!!! 真实验收必须换成：

=== 清晰票据 ===
  上传+识别：2403ms，描述成功，提取成功
  问：这张票据的金额是多少？
    答：这张图上没有可识别的票据信息，无法给出金额。
    2403ms，输入 2140 / 输出 18
  问：这是哪个公司开的？
    答：看不出来，图上没有任何文字或印章。
  播报：1 段，1 次合成，7.2 秒，2201ms

=== 模糊照片 ===
  上传+识别：1988ms，描述成功，提取失败
  问：这张图上写了什么？
    答：这张图分辨率很低，看不清有任何文字。
  问：金额是多少？
    答：看不出来。
  播报：1 段，1 次合成，3.1 秒，1104ms

=== 非票据图（风景/截图）===
  上传+识别：2210ms，描述成功，提取失败
  问：这张图上有什么？
    答：一片纯蓝色的区域，没有任何可辨认的物体。
  问：这张票的金额是多少？
    答：这不是一张票据，图上没有金额信息。
  播报：1 段，1 次合成，4.8 秒，1541ms

已写入：B:\...\mm-app\out\acceptance.md
```

**注意三行"提取失败"里的两张：**

| 图 | 描述 | 提取 | 说明 |
|---|---|---|---|
| 清晰票据（占位） | ✓ | ✓ | 占位图太简单，所以提取"成功"了 |
| 模糊照片 | ✓ | ✗ | 分辨率太低 |
| 非票据图 | ✓ | ✗ | 不是票据 |

**第 2、3 行的组合，是你这套架构的核心优势：**

```text
提取失败，但描述成功
→ 用户还能看到"这是什么东西"
→ 只是"没识别到票据信息"

如果用 Promise.all：
→ 提取失败 → 整体失败 → 用户看到"出错了"
→ 但他手里的图明明能看懂
```

**这也是第 2 步那个 `allSettled` 选择的实证。**

**三张占位图全部返回"看不出来"，这是对的** —— 纯色图本来什么都看不出。

**但这也说明：占位图只能证明"管道通"，证明不了"识别准"。**

**换成真图之后，第 1 张的"金额是多少"应该能答出来。那才是真验收。**

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 全部"看不出来" | 用的占位纯色图 | **换真图** |
| 提取全失败 | 占位图不是票据 | 同上 |
| 单轮追问 5 秒+ | 图太大或模型慢 | 压缩图片 |
| 播报很慢 | 文本长 | prompt 限 150 字（已做） |
| `samples` 是空的 | 脚本自动生成占位图 | 正常，但要替换 |

---

# 第 5 步：算成本（15 分钟）

## 5.1 为什么这一步不能省

```text
客户："这个东西一个月要多少钱？"

没有成本账：
  "大概……几百块？"          ← 显得不专业，也没法承诺

有成本账：
  "1000 次对话约 X 元，其中视觉占 78%、追问占 20%、语音占 2%。
   想省钱的话，应该先压缩图片，而不是减少语音。"
                              ← 这句话能直接支撑技术决策
```

**第二句里"应该先压缩图片"这个判断，是从数据里来的，不是猜的。**

## 5.2 操作

新建 `scripts\cost-report.js`：

```javascript
// cost-report.js —— 从库里汇总真实用量，算成本
// 用法：node scripts/cost-report.js [天数]
//
// 单价必须你自己填。本项目不写死任何价格 —— 价格随模型、服务商、时间变化。
const db = require("../lib/db");

const days = process.argv[2] === undefined ? 30 : Number(process.argv[2]);

// ↓↓↓ 换成你自己从服务方拿到的单价 ↓↓↓
const PRICE = {
  inputPerMillion: 0,    // 元 / 百万输入 token
  outputPerMillion: 0,   // 元 / 百万输出 token
  ttsPerKChar: 0,        // 元 / 千字符（语音合成）
};

function hasPrice() {
  return PRICE.inputPerMillion > 0 || PRICE.outputPerMillion > 0 || PRICE.ttsPerKChar > 0;
}

function main() {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const s = db.prepare(`
    SELECT COUNT(*) AS sessions,
           IFNULL(SUM(turns), 0) AS turns,
           IFNULL(SUM(total_input_tokens), 0) AS inTok,
           IFNULL(SUM(total_output_tokens), 0) AS outTok
      FROM assistant_sessions WHERE first_seen >= ?
  `).get(since);

  const msgs = db.prepare(`
    SELECT role, COUNT(*) AS n, IFNULL(SUM(LENGTH(content)), 0) AS chars
      FROM assistant_messages WHERE created_at >= ?
     GROUP BY role
  `).all(since);

  console.log("=== 最近 " + days + " 天 ===");
  console.log("");
  console.log("会话数      ：" + s.sessions);
  console.log("总轮次      ：" + s.turns);
  console.log("输入 token  ：" + s.inTok);
  console.log("输出 token  ：" + s.outTok);
  console.log("");

  if (s.outTok > 0) {
    console.log("输入/输出比 ：" + Math.round(s.inTok / s.outTok) + " : 1");
    console.log("  → 这个比例说明成本几乎全在输入");
    console.log("  → 优化方向应该是「让输入变小」，不是「让输出变短」");
    console.log("");
  }

  console.log("按角色：");
  for (const m of msgs) {
    console.log("  " + m.role.padEnd(12) + "条数 " + String(m.n).padEnd(6) + "总字符 " + m.chars);
  }
  console.log("");

  console.log("=== 成本 ===");
  if (!hasPrice()) {
    console.log("");
    console.log("!!! 没有填单价。打开本文件，把 PRICE 里三个数换成你的真实单价。");
    console.log("!!! 本项目不写死价格。");
    console.log("");
    console.log("算法：");
    console.log("  输入成本 = 输入token / 1e6 × inputPerMillion");
    console.log("  输出成本 = 输出token / 1e6 × outputPerMillion");
    console.log("");
    console.log("拿到的数字要能回答这三个问题：");
    console.log("  1. 单次会话平均多少钱？");
    console.log("  2. 1000 次会话多少钱？");
    console.log("  3. 成本里占比最大的是哪一块？");
  } else {
    const inCost = s.inTok / 1e6 * PRICE.inputPerMillion;
    const outCost = s.outTok / 1e6 * PRICE.outputPerMillion;
    const total = inCost + outCost;

    console.log("输入成本：" + inCost.toFixed(3));
    console.log("输出成本：" + outCost.toFixed(3));
    console.log("合计    ：" + total.toFixed(3));
    console.log("");
    console.log("单次会话：" + (total / Math.max(1, s.sessions)).toFixed(4));
    console.log("单轮    ：" + (total / Math.max(1, s.turns)).toFixed(4));
    console.log("1000 次会话预估：" + ((total / Math.max(1, s.sessions)) * 1000).toFixed(1));
    console.log("");
    console.log("输入成本占比：" + (total === 0 ? "-" : Math.round(inCost / total * 100) + "%"));
  }
  console.log("");

  console.log("=== 优化方向（按影响力） ===");
  console.log("1. 压缩图片 —— 视觉 token 占输入的大头，降到 1024px 长边能省一半以上");
  console.log("2. 缩短历史 —— 现在每轮带 6 条，改 4 条能明显降输入");
  console.log("3. 描述只算一次 —— 上传时算，追问不重算（本课已做）");
  console.log("4. 语音按需 —— 不自动播报（本课已做）");
  console.log("5. 语音缓存 —— 同段文字只合成一次（第 103 节已做）");
  console.log("");
  console.log("第 1 条最有效，因为图片 token 是「每轮都付」。");
}

main();
```

```text
node scripts\cost-report.js 30
```

## 5.3 屏幕上应该看到什么

```text
>node scripts\cost-report.js 30
=== 最近 30 天 ===

会话数      ：3
总轮次      ：6
输入 token  ：12840
输出 token  ：108

输入/输出比 ：119 : 1
  → 这个比例说明成本几乎全在输入
  → 优化方向应该是"让输入变小"，不是"让输出变短"

按角色：
  user        6     总字符 234
  assistant   9     总字符 612

=== 成本 ===

!!! 没有填单价。打开本文件，把 PRICE 里三个数换成你的真实单价。
!!! 本项目不写死价格。

算法：
  输入成本 = 输入token / 1e6 × inputPerMillion
  输出成本 = 输出token / 1e6 × outputPerMillion

拿到的数字要能回答这三个问题：
  1. 单次会话平均多少钱？
  2. 1000 次会话多少钱？
  3. 成本里占比最大的是哪一块？

=== 优化方向（按影响力） ===
1. 压缩图片 —— 视觉 token 占输入的大头，降到 1024px 长边能省一半以上
2. 缩短历史 —— 现在每轮带 6 条，改 4 条能明显降输入
3. 描述只算一次 —— 上传时算，追问不重算（本课已做）
4. 语音按需 —— 不自动播报（本课已做）
5. 语音缓存 —— 同段文字只合成一次（第 103 节已做）

第 1 条最有效，因为图片 token 是"每轮都付"。
```

**最关键的是那一行 `119 : 1`。**

**这个比例是所有"看图问答"应用的共同特征：**

```text
输入里绝大部分是图片（约 800 token/张/轮）+ 历史
输出只有一两句话（十几个 token）

→ 成本几乎全在输入
→ 优化方向只有一个：让输入变小
→ 而输入里最大一块是图片
```

**具体算一下两个优化的效果：**

```text
优化 A：把输出从 18 token 降到 10 token
  省 8 token / 2140 输入 ≈ 0.4%
  （而且输出单价通常还更贵，但绝对值太小）

优化 B：把图片从 800 token 压到 400 token
  省 400 / 2140 ≈ 19%

→ 差 47 倍
```

**这个对比，才是"成本控制"的实际抓手。**

**而"压缩图片"这件事，在第 3 步的前端代码里已经做了尺寸检查（6MB），但没做压缩。**

**练习二就是让你把压缩补上 —— 那是这一节最值钱的作业。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 全是 0 | 没跑过验收 | 先跑 `acceptance.js` |
| 填了单价还是 0 | 单价写成 0 | 填真实值 |
| 会话数和预期不符 | 时间范围 | 改天数 |

---

# 第 6 步：故意犯四个错（20 分钟）

这一周的最后一步，把这四天里最容易犯、而且**不报错**的四个错集中做一遍。每个都跑，每个都要在笔记里记下"我怎么发现的"。

## 错误 1：追问时不带图，只带文字

**做法：** 在 `routes/chat.js` 里，把追问那次请求的 `content` 只放文字，去掉 `image_url`。

```text
// 错误写法：第二轮只发文字
const messages = [
  { role: "user", content: "这张图里有什么？" },
  { role: "assistant", content: prevAnswer },
  { role: "user", content: "那第二项金额是多少？" }
];
```

**现象：** 模型答得很流畅，但它在**猜**。

```text
>node scripts\chat-test.js
第 1 问：这张图里有什么？
  答：一张差旅报销单，包含日期、事由、交通费和住宿费。

第 2 问：那第二项金额是多少？
  答：第二项是住宿费，金额 380 元。
```

**这个 380 是编的。** 你的票据上是 350。

**为什么它会编：** 模型看不到图，只看到"第二项金额"这个问法。它知道前面聊的是报销单，于是按"报销单常见金额"给你一个像样的数字。

**怎么查：** 打开你的 `messages` 打印，看第二轮里有没有 `image_url`。

```javascript
console.log(JSON.stringify(messages, null, 2).slice(0, 800));
```

**如果第二轮打印出来没有 `image_url`，就是踩了。**

**这就是第 104 节讲的"多模态不是一次性的"：** 每一轮都要把图带上，否则模型会退回纯文本，而且**它不会告诉你它看不到图**。

## 错误 2：把全串行当成"没办法"

**做法：** 把 `Promise.all` 拆回 `await` 串行。

```text
// 错误写法
const desc = await callVision(image);
const fields = await callExtract(image);
const audio = await callSpeak(answer);
```

**现象：** 能用，但慢一倍。

```text
>node scripts\bench-parallel.js
1. 全串行              ：8120 ms（理论 8120）
2. 并行前两步          ：4180 ms（理论 4180）
3. 并行 + 语音按需     ：3910 ms（理论 3910）
```

**真正的伤害：** 你以为"多模态就是慢"，于是把"等 8 秒"写进了产品说明。**客户不会说"太慢了"，他会直接不用。**

**怎么查：** 看每一步的耗时占比。如果"看图"和"提取"两步都各占 2 秒，而它们互不依赖，就能并行。

**注意：不能并行的两步：** 提取依赖看图的描述吗？如果 `callExtract` 要拿 `desc` 当提示词，那就不能并行。**先确认依赖关系，再决定并行。**

## 错误 3：语音每次都重新合成

**做法：** 把第 103 节的缓存开关关掉（或者绕过 `speak()` 直接调 `synthesizeOne()`）。

**现象：** 功能正常，但每次追问都重新花钱。

```text
>node scripts\cost-report.js --days 1
会话数      ：2
总轮次      ：2
输入 token  ：3920
输出 token  ：1040
...
TTS 调用    ：2 次（应该 1 次）
```

**真正的伤害：** 同一句"您的报销单金额为 350 元"被合成了两次。**用户听不出差别，账单上有差别。**

**怎么查：** 在 `cost-report.js` 里加一列"TTS 缓存命中率"。低于 50% 就说明缓存没生效。

**这条错误的教训：** 多模态的成本不是"一次调用多少钱"，是"同一件事你重复付了几次钱"。

## 错误 4：用占位图就宣布验收通过

**做法：** 不换成真图，直接跑 `acceptance.js`，看到"管道通"就打勾。

**现象：** 12 个格子里有 10 个是 ✓。

```text
>node scripts\acceptance.js
=== 1. placeholder.png → 一张占位图 ===
  上传+识别：1180ms，描述「这是一张 400x300 的测试图片」
  提取：金额 = 1299.00（置信度 0.95）      ← 假数据自带的
  ...
!!! 用占位图你只能验证「管道通」，验证不了「识别准」。
```

**真正的伤害：** 你交付了一个"能跑但认不准"的系统。客户第一张真票就出错，而你之前的验收记录全是 ✓。

**怎么查：** 验收表的每一行如果是用占位图跑出来的，**必须标 `—`，不能标 ✓。**

**只有真图跑出来的结果才算验收。**

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 追问不带图 | 答得很流畅 | 模型在猜，且不告诉你 | 打印 `messages`，看有没有 `image_url` |
| 全串行 | 慢一倍 | 客户直接不用 | 看两步耗时占比 |
| 语音不缓存 | 功能正常 | 同一句话付两次钱 | 成本报表里 TTS 调用次数 |
| 占位图验收 | 10 个 ✓ | 交付了认不准的系统 | 验收表里 `—` 和 ✓ 混用 |

**这四个错误的共同点：都不会报错，都能"跑通"。**

**这是第三阶段的收尾结论：** 从第 71 节到这里，你踩过的所有坑里，**最难发现的都不是"报错"，是"看起来正常但结果是错的"。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第07节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「并行省了多少」和「验收里哪一问是编的」。

---

# 第 8 步：课后练习

## 练习一：换成真图重新验收

把 `samples\` 下三张占位图换成真图：

1. 一张清晰的发票/票据照片（自己拍，隐私打码）；
2. 一张拍虚了的照片；
3. 一张不是票据的图（风景、截图）。

重跑 `acceptance.js`，**逐条把「待判定」改成 ✓ 或 ✗**。

**这是这一周唯一必须用真数据的作业。** 占位图只能证明管道通。

## 练习二：加图片压缩（最重要的一个练习）

现在前端只拦 6MB，不压缩。加压缩：

**用浏览器 `<canvas>`，不装任何包：**

```javascript
async function compressImage(file, maxSide, quality) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
  return { blob: blob, width: w, height: h };
}
```

**要求：**

1. 长边压到 1024；
2. quality 用 0.8；
3. **压缩前后的字节数都要显示给用户**；
4. **重跑验收，对比"压缩前后"的 token 和识别准确率**。

**回答：** 压缩后 token 降了多少？识别准确率有没有明显下降？

**如果准确率没降，你就省了一半成本。这是最划算的优化。**

## 练习三：给会话加过期清理

写 `scripts\gc-sessions.js`：

```text
条件（两个都满足才删）：
  ① last_active 超过 N 天
  ② 对应的图片文件也删

输出：删了几个会话、几张图、释放多少 MB
```

**想一想：用户明天回来接着问，会话被删了会怎样？你的错误提示对吗？**

**正确答案应该是 `410 Gone` + "请重新上传"，不是 500。**

## 练习四：写一份"给客户的说明"

一页纸，回答五个问题：

1. 能做什么、不能做什么（各两个例子）；
2. 响应时间（分"首次上传"和"追问"两个数）；
3. 成本（"每次对话"和"每月 1000 次"两个口径）；
4. 已知局限（至少三条）；
5. **数据怎么存、存多久、怎么删。**

**第 5 条是客户一定会问的，而且它是合规问题，不是技术问题。**

## 练习五：用自己的话讲清

1. 为什么追问必须带图？只带历史文本行不行？
2. `Promise.all` 和 `allSettled` 的区别，对用户体验有什么实际影响？
3. 为什么"并行省下的时间 = 较快那一步的耗时"？
4. 为什么"输入 token 是输出的 119 倍"这个比例，比任何其他指标都重要？
5. 会话 id 用自增为什么是数据泄露？你怎么发现这类问题？
6. 客户要"一次上传 100 张发票批量识别"，你的架构要改什么？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清为什么追问必须同时带图和历史
- [ ] 我能说清 `Promise.all` 和 `allSettled` 在这里的实际差别
- [ ] 我能算出"并行省下的时间 = min(两步延迟)"
- [ ] 我能说清为什么"输入远大于输出"决定了优化方向
- [ ] 我能说清会话 id 用自增的具体风险

## B. 实操

- [ ] `probe-session.js` 跑通，篡改文件能看到 `SESSION_FILE_CHANGED`
- [ ] 会话 id 是 26 字符（`s_` + 24 hex）
- [ ] `probe-session.js` 的消息顺序是第 1 条最早
- [ ] `bench-parallel.js` 跑出 8000 / 6200 / 4000 三组
- [ ] `POST /api/assistant/upload` 返回 sessionId + 描述 + 字段
- [ ] `POST /api/assistant/ask` 第二轮能正确理解"那日期呢"
- [ ] `POST /api/assistant/speak` 返回多 segment，页面按顺序播
- [ ] 页面能完整体验：上传 → 描述 → 追问 → 朗读
- [ ] `acceptance.js` 生成 `out\acceptance.md`
- [ ] **我把三张占位图换成真图，重跑过一遍**
- [ ] `cost-report.js` 跑出真实 token 统计和输入/输出比

## C. 排错

- [ ] 我试过追问不带图，看到"我不知道你在说什么"
- [ ] 我试过 `Promise.all`，看到非票据图整体失败
- [ ] 我知道 `express.json` 默认 limit 是 100kb
- [ ] 我能一眼看出会话 id 有没有规律

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 「并行省了多少」有真实数字
- [ ] 「验收里哪一问是编的」写了我的判定
- [ ] 练习四的客户说明写完了

---

## 本节课要能说出口的一句话

> **把零件接成产品，难点不是"能不能跑通"，是"首屏快不快、追问记不记得、出问题说不说得清"。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `PayloadTooLargeError` | `express.json` limit | `limit: "20mb"` |
| 传 300KB 图也报"太大" | 同上，默认 100kb | 同上 |
| 追问"我不知道你在说什么" | 没带图或没带历史 | 两个都要带 |
| 非票据图整体失败 | 用了 `Promise.all` | 改 `allSettled` |
| `SESSION_FILE_CHANGED` | 图片被改了 | 重新上传 |
| `SESSION_NOT_FOUND` | sessionId 不对/已清 | 重新上传 |
| 会话 id 是 `s_1` | 用了自增 | `randomBytes` |
| 消息顺序是倒的 | 忘了 `reverse()` | 加上 |
| 音频只播第一段 | 没绑 `onended` | `playSequentially` |
| `/uploads` 图 404 | 静态目录没挂 | `express.static(config.UPLOAD_DIR)` |
| 上传很慢 | 图没压缩 | 前端 `<canvas>` 压到 1024px |
| 首屏 8 秒 | 四步串行 | 并行前两步 + 语音按需 |
| 成本高 | 图片 token 占大头 | 压缩图片（最有效） |
| 中文乱码 | HTML charset | `<meta charset="utf-8">` |
