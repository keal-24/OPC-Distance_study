# 第 159 节课：送达状态与状态机

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天把"我发了"变成"已投递 / 已打开 / 已退信"。
> 核心是一个状态机：**状态只能往前走，不能倒退，且每个转移都要有证据。**

**建议用时**：120 分钟
**你需要先完成**：第 158 节的 `notify/suppression.js`
**今天要装**：什么都不用装

---

# 第 0 步：先定义"状态"（20 分钟）

## 0.1 五个状态，一条线

```text
submitted  已提交    → 我们调用了发送接口，拿到了 message-id
accepted   已接受    → 发信服务商接受了（SMTP 250）
delivered  已投递    → 收件方服务器接受了（这是你能确认的最后一层）
bounced    已退信    → 收件方拒收（硬/软）
opened     已打开    → 收件人打开了（需要追踪像素，只有部分场景能拿到）
```

**两条线：**

```text
失败线：submitted → bounced（终态）
成功线：submitted → accepted → delivered → opened（opened 是终态，但不是所有邮件都有）
```

## 0.2 三个必须理解的点

**① `delivered` 不等于"进收件箱"**

```text
delivered 只证明"收件方服务器收下了"
它可能：
  · 放进收件箱（用户能看到）
  · 放进垃圾箱（用户看不到）
  · 直接丢弃（但返回了 250，这种情况少见）
```

**"进收件箱"这件事，除了 Gmail Postmaster Tools 这类工具，没人能确认。**

**所以状态到 `delivered` 就停止了。不要编造"已送达收件箱"。**

**② `opened` 依赖追踪像素，且不可靠**

```text
原理：在 HTML 里放一个 1x1 图片，用户打开时图片被请求 → 你知道"打开了"

不可靠的原因：
  · 用户关了图片（Gmail 默认代理图片，会预先加载 → 假阳性）
  · 纯文本邮件没有像素（无法追踪）
  · 有些客户端根本不加载远程图片
```

**所以 `opened` 只能当"参考指标"，不能当"送达证明"。**

**③ 状态只能往前走**

```text
submitted → bounced → delivered   ❌ 不可能（退信了怎么又投递）
delivered → bounced               ❌ 一般是"投递后被退回"，少见但要能处理
opened → delivered                ❌ 打开了一定是投递了
```

**状态机要拒绝倒退，但不拒绝"新增信息"。**

## 0.3 今天要建的东西

```text
notify/status.js         状态机（转移规则 + 校验）
notify/status-api.js     状态查询（webhook + 轮询两种）
scripts/mail-status.js   查一封邮件的当前状态
```

---

# 第 1 步：状态机（30 分钟）

## 1.1 转移表

```javascript
// notify/status.js

export const STATUS = {
  SUBMITTED: "submitted",
  ACCEPTED: "accepted",
  DELIVERED: "delivered",
  BOUNCED: "bounced",
  OPENED: "opened",
  COMPLAINED: "complained",     // 用户标记垃圾
  FAILED: "failed",             // 我们自己失败（连接/认证）
};

// 允许的转移：from → [to...]
const TRANSITIONS = {
  [STATUS.SUBMITTED]: [STATUS.ACCEPTED, STATUS.DELIVERED, STATUS.BOUNCED, STATUS.FAILED, STATUS.OPENED],
  [STATUS.ACCEPTED]:  [STATUS.DELIVERED, STATUS.BOUNCED, STATUS.OPENED],
  [STATUS.DELIVERED]: [STATUS.OPENED, STATUS.BOUNCED, STATUS.COMPLAINED],
  [STATUS.OPENED]:    [STATUS.COMPLAINED],
  [STATUS.BOUNCED]:   [],          // 终态
  [STATUS.COMPLAINED]:[],          // 终态
  [STATUS.FAILED]:    [],          // 终态（我们的失败，不重试的话）
};

export function canTransition(from, to) {
  if (from === to) return { ok: true, same: true };      // 幂等
  const allowed = TRANSITIONS[from];
  if (!allowed) return { ok: false, reason: `未知状态 ${from}` };
  if (!allowed.includes(to)) {
    return { ok: false, reason: `不允许 ${from} → ${to}（允许：${allowed.join(",") || "无（终态）"}）` };
  }
  return { ok: true };
}
```

## 1.2 逐段解释三个关键设计

**① 为什么 `submitted → delivered` 是允许的（跳过 accepted）**

```text
场景：服务商不提供"accepted"事件，直接告诉你"delivered"
→ 如果强制要求 submitted → accepted → delivered，这个事件会被拒
→ 所以允许"跳级"
```

**规则：允许往前走任意步，但不允许往回。**

**② 为什么 `opened → delivered` 不允许**

```text
打开了 = 一定投递了
如果收到"delivered"事件（延迟到达），应该"忽略"而不是"倒退"
→ 状态保持 opened（信息更丰富）
→ 但记录一条日志（late_event）
```

**③ 为什么 `bounced` 是终态**

```text
退信后如果又收到"delivered"事件，很可能是：
  · 上一封的延迟事件（不同邮件，message-id 不同）
  · 服务商的数据错误
→ 不能因此把状态改回 delivered
→ 拒绝 + 记日志（可疑）
```

**但如果真的"退信后又投递成功"（用户修了邮箱），那是**新的一封邮件**，有新的 message-id。**

## 1.3 状态更新函数

```javascript
// notify/status.js 继续
import { db } from "../app/lib/db.js";
import { log } from "../app/lib/logger.js";

/**
 * 更新一封邮件的状态。会校验转移合法性。
 *
 * @param {string} messageId
 * @param {string} to      目标状态
 * @param {object} evidence  证据（webhook 原文摘要、时间戳等）
 * @returns {{ok:boolean, from?:string, to?:string, reason?:string}}
 */
export function updateStatus(messageId, to, evidence = {}) {
  const row = db.prepare("SELECT * FROM mail_log WHERE message_id = ?").get(messageId);
  if (!row) {
    log.warn("status_unknown_msgid", { message_id: String(messageId).slice(0, 40) });
    return { ok: false, reason: "message_id 不存在" };
  }

  const from = row.status;
  const check = canTransition(from, to);

  if (!check.ok) {
    log.warn("status_transition_rejected", { message_id: String(messageId).slice(0, 40), from, to, reason: check.reason });
    return { ok: false, from, to, reason: check.reason };
  }
  if (check.same) return { ok: true, from, to, same: true };

  db.prepare(`
    UPDATE mail_log
    SET status = ?, error_code = COALESCE(?, error_code), updated_at = ?
    WHERE message_id = ?
  `).run(to, evidence.code ?? null, Date.now(), messageId);

  // 事件流水（保留完整历史）
  db.prepare(`
    INSERT INTO mail_event (message_id, from_status, to_status, source, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(messageId, from, to, evidence.source ?? "api", JSON.stringify(evidence).slice(0, 1000), Date.now());

  log.info("status_changed", { message_id: String(messageId).slice(0, 40), from, to, source: evidence.source ?? "api" });
  return { ok: true, from, to };
}
```

## 1.4 事件流水表

```sql
CREATE TABLE IF NOT EXISTS mail_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  source      TEXT NOT NULL,      -- webhook / poll / dsn / manual
  detail      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_mail_event_msgid ON mail_event(message_id, created_at);
```

**为什么要单独一张表？**

```text
mail_log 只有"当前状态"（一个值）
mail_event 有"完整历史"（每次变化一条）

用途：
  · 排查"这封邮件为什么变成 bounced"→ 看事件序列
  · 统计"平均多久从 submitted 到 delivered"
  · 发现异常（同一封邮件状态反复变 → 服务商数据有问题）
```

## 1.5 验证状态机

```javascript
// scripts/test-status-machine.js
import { canTransition, STATUS } from "../notify/status.js";

const CASES = [
  ["submitted", "accepted", true],
  ["submitted", "delivered", true],     // 跳级允许
  ["submitted", "bounced", true],
  ["submitted", "opened", true],
  ["accepted", "delivered", true],
  ["delivered", "opened", true],
  ["opened", "delivered", false],       // 倒退
  ["bounced", "delivered", false],      // 终态
  ["bounced", "opened", false],
  ["complained", "delivered", false],
  ["delivered", "bounced", true],       // 投递后被退（少见但可能）
  ["submitted", "submitted", true],     // 幂等
];

let pass = 0;
for (const [from, to, expect] of CASES) {
  const r = canTransition(from, to);
  const ok = r.ok === expect;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${from.padEnd(12)} → ${to.padEnd(12)} ${r.ok ? "允许" : "拒绝"}  ${r.reason ?? ""}`);
}
console.log(`\n${pass}/${CASES.length} 通过`);
```

**期望 12/12。**

**特别注意：`delivered → bounced` 是允许的。**

```text
场景：邮件投递到对方服务器，但对方后续判定为垃圾并退回
→ 会先收到 delivered，后收到 bounced
→ 必须允许这个转移
```

---

# 第 2 步：状态来源（webhook + 轮询）（30 分钟）

## 2.1 两种获取方式

```text
方式 A：webhook（推荐）
  服务商主动 POST 给你
  优点：实时、不用轮询
  缺点：要公网地址、要防伪造

方式 B：轮询 API
  你定时查
  优点：部署简单
  缺点：延迟、消耗配额
```

**今天两种都实现。** 真实环境优先 A，A 不通就 B。

## 2.2 webhook 接收

```javascript
// notify/webhook.js
import crypto from "node:crypto";
import { updateStatus } from "./status.js";
import { log } from "../app/lib/logger.js";

/**
 * 验证 webhook 签名（防伪造）。
 * 不同服务商规则不同，这里用最常见的一种：HMAC-SHA256。
 */
export function verifySignature(rawBody, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // 常量时间比较（防时序攻击）
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature ?? ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * 处理服务商的 webhook 事件。
 * 不同服务商字段名不同，这里抽象出一层。
 */
export function handleWebhookEvent(evt) {
  // 统一取 message-id（各家的字段名不同）
  const messageId =
    evt.message_id ?? evt.messageId ?? evt["Message-Id"] ?? evt.data?.message_id ?? null;
  if (!messageId) return { ok: false, reason: "事件里没有 message-id" };

  // 统一映射状态
  const raw = String(evt.event ?? evt.type ?? evt.status ?? "").toLowerCase();

  const map = {
    // 已接受
    accepted: "accepted", sent: "accepted", queued: "accepted",
    // 已投递
    delivered: "delivered", delivery: "delivered",
    // 退信
    bounced: "bounced", bounce: "bounced", failed: "bounced", rejected: "bounced",
    // 打开
    opened: "opened", open: "opened",
    // 投诉
    complained: "complained", complaint: "complained", spam: "complained",
  };

  const to = map[raw];
  if (!to) return { ok: false, reason: `未知事件类型：${raw}` };

  return updateStatus(messageId, to, {
    source: "webhook",
    event: raw,
    code: evt.code ?? evt.reason ?? null,
    raw: JSON.stringify(evt).slice(0, 800),
  });
}
```

## 2.3 轮询

```javascript
// notify/poll-status.js
import { updateStatus } from "./status.js";
import { db } from "../app/lib/db.js";
import { log } from "../app/lib/logger.js";

/**
 * 轮询：查最近 N 小时"还停在 submitted/accepted"的邮件。
 */
export async function pollPending({ hours = 24, limit = 50, fetcher } = {}) {
  const since = Date.now() - hours * 3_600_000;

  const rows = db.prepare(`
    SELECT message_id, status FROM mail_log
    WHERE status IN ('submitted', 'accepted')
      AND created_at > ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(since, limit);

  let changed = 0;
  for (const r of rows) {
    let st;
    try {
      st = await fetcher(r.message_id);      // 调用服务商 API
    } catch (e) {
      log.warn("poll_fetch_failed", { msgid: r.message_id.slice(0, 30), err: String(e.message).slice(0, 80) });
      continue;
    }

    if (!st || !st.status) continue;
    const res = updateStatus(r.message_id, st.status, { source: "poll", raw: JSON.stringify(st).slice(0, 500) });
    if (res.ok && !res.same) changed++;
  }

  log.info("poll_done", { checked: rows.length, changed });
  return { checked: rows.length, changed };
}
```

## 2.4 一个假的服务商（用于本地测试）

```javascript
// notify/fake-provider.js
// 起一个 HTTP 服务，模拟"服务商的 webhook + 查询 API"

import http from "node:http";
import { randomUUID } from "node:crypto";

const state = new Map();   // messageId → { status, at }

export function setStatus(messageId, status) {
  state.set(messageId, { status, at: Date.now() });
}
export function getStatus(messageId) {
  return state.get(messageId) ?? null;
}
export function reset() { state.clear(); }

export function startFakeProvider({ port = 0 } = {}) {
  const srv = http.createServer(async (req, res) => {
    // GET /status?message_id=...
    if (req.url.startsWith("/status")) {
      const u = new URL(req.url, "http://x");
      const mid = u.searchParams.get("message_id");
      const st = state.get(mid);
      res.writeHead(st ? 200 : 404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(st ?? { error: "not found" }));
    }

    res.writeHead(404); res.end();
  });

  return new Promise((r) => {
    srv.listen(port, "127.0.0.1", () => {
      const actual = srv.address().port;
      r({
        port: actual,
        webhookUrl: `http://127.0.0.1:${actual}`,
        close: () => new Promise((x) => srv.close(x)),
        // 构造一个"webhook 事件"
        makeEvent: (messageId, event) => ({ message_id: messageId, event, at: Date.now() }),
      });
    });
  });
}
```

## 2.5 端到端验证

```javascript
// scripts/test-status-flow.js
import { sendMail } from "../notify/mailer.js";
import { updateStatus, STATUS } from "../notify/status.js";
import { handleWebhookEvent } from "../notify/webhook.js";
import { db } from "../app/lib/db.js";

// ① 发一封
const r = await sendMail({ to: "flow@example.test", subject: "状态测试", text: "x" });
console.log("发送:", { ok: r.ok, messageId: r.messageId });

const mid = r.messageId;

// ② 初始状态
const s0 = db.prepare("SELECT status FROM mail_log WHERE message_id = ?").get(mid);
console.log("初始状态:", s0?.status);

// ③ 模拟 webhook: delivered
const w1 = handleWebhookEvent({ message_id: mid, event: "delivered" });
console.log("webhook delivered:", w1);

// ④ 模拟 webhook: opened
const w2 = handleWebhookEvent({ message_id: mid, event: "opened" });
console.log("webhook opened:", w2);

// ⑤ 反向转移（应被拒）
const w3 = handleWebhookEvent({ message_id: mid, event: "delivered" });
console.log("倒退到 delivered:", w3);

// ⑥ 看事件流水
const events = db.prepare("SELECT from_status, to_status, source FROM mail_event WHERE message_id = ? ORDER BY id").all(mid);
console.log("\n事件流水:");
for (const e of events) console.log(`  ${e.from_status} → ${e.to_status}  (${e.source})`);
```

**期望：**

```text
发送: { ok: true, messageId: '<xxx@...>' }
初始状态: submitted
webhook delivered: { ok: true, from: 'submitted', to: 'delivered' }
webhook opened: { ok: true, from: 'delivered', to: 'opened' }
倒退到 delivered: { ok: false, from: 'opened', to: 'delivered', reason: '不允许 opened → delivered...' }

事件流水:
  submitted → delivered  (webhook)
  delivered → opened  (webhook)
```

**关键：第 ⑤ 步被正确拒绝，且事件流水里没有它。**

---

# 第 3 步：查询接口（20 分钟）

## 3.1 `GET /api/mail/:messageId`

```javascript
// app/routes/mail.js
import { Router } from "express";
import { wrap } from "../middleware/error.js";
import { fail } from "../errors/index.js";
import { db } from "../lib/db.js";

export const mailRouter = Router();

mailRouter.get("/mail/:messageId", wrap(async (req, res) => {
  const mid = decodeURIComponent(req.params.messageId);

  const row = db.prepare("SELECT * FROM mail_log WHERE message_id = ?").get(mid);
  if (!row) fail("NOT_FOUND", { detail: `message_id=${mid.slice(0, 40)}` });

  const events = db.prepare(`
    SELECT from_status, to_status, source, created_at
    FROM mail_event WHERE message_id = ? ORDER BY id
  `).all(mid);

  res.json({
    ok: true,
    trace_id: req.traceId,
    data: {
      message_id: row.message_id,
      to: maskEmail(row.to_addr),
      subject: row.subject,
      kind: row.kind,
      status: row.status,
      error_code: row.error_code,
      created_at: row.created_at,
      updated_at: row.updated_at,
      events: events.map((e) => ({
        from: e.from_status, to: e.to_status, source: e.source, at: e.created_at,
      })),
    },
  });
}));

// 按收件人查最近 10 封（最重要的是"客户说没收到"时的排查）
mailRouter.get("/mail/by-email/:email", wrap(async (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase();

  const rows = db.prepare(`
    SELECT message_id, subject, kind, status, error_code, created_at
    FROM mail_log WHERE to_addr = ?
    ORDER BY created_at DESC LIMIT 10
  `).all(email);

  res.json({
    ok: true,
    trace_id: req.traceId,
    data: rows,
    note: rows.length ? null : "这个地址没有任何发信记录（可能地址填错了）",
  });
}));

function maskEmail(e) {
  const [u, d] = String(e ?? "").split("@");
  return d ? `${u.slice(0, 2)}***@${d}` : "***";
}
```

## 3.2 一个必须做的排查流程

**客户说"我没收到验证码"，你的三步：**

```bash
# 第 1 步：按地址查最近记录
curl -s "localhost:3000/api/mail/by-email/customer@example.com" | jq

# 可能的结果：
#  a) data 为空           → 地址填错了，或者根本没触发发送
#  b) status=submitted    → 发出去了但没状态回执（可能还在路上）
#  c) status=bounced      → 地址无效（看 error_code 是 550 还是 552）
#  d) status=delivered    → 投递成功 → 大概率进了垃圾箱（第 160 节）
#  e) status=failed       → 我们自己失败了（看 error_code）
```

```bash
# 第 2 步：查某个 message-id 的完整事件
curl -s "localhost:3000/api/mail/%3Cabc123%40yourdomain.test%3E" | jq
```

**注意 `message-id` 里有 `<` `>` `@`，URL 里要编码。**

```bash
# 第 3 步：如果 delivered 但用户没收到 → 让他查垃圾箱
```

**这个三步流程应该是你写进运维手册的东西。**

## 3.3 一个"状态分布"统计

```javascript
// app/routes/mail.js 加
mailRouter.get("/mail/stats", wrap(async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 7), 90);
  const since = Date.now() - days * 86_400_000;

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) n FROM mail_log
    WHERE created_at > ? GROUP BY status ORDER BY n DESC
  `).all(since);

  const total = byStatus.reduce((s, r) => s + r.n, 0);
  const byKind = db.prepare(`
    SELECT kind, status, COUNT(*) n FROM mail_log
    WHERE created_at > ? GROUP BY kind, status
  `).all(since);

  res.json({
    ok: true,
    trace_id: req.traceId,
    data: {
      days,
      total,
      by_status: byStatus.map((r) => ({ ...r, pct: total ? +(r.n / total * 100).toFixed(1) : 0 })),
      by_kind: byKind,
    },
  });
}));
```

**输出：**

```json
{
  "total": 1200,
  "by_status": [
    { "status": "delivered", "n": 1080, "pct": 90.0 },
    { "status": "submitted", "n": 72, "pct": 6.0 },
    { "status": "bounced", "n": 36, "pct": 3.0 },
    { "status": "opened", "n": 12, "pct": 1.0 }
  ]
}
```

**这个数字就是第 161 节"送达率档案"的原料。**

---

# 第 4 步：一个必须做的实验：假 webhook 伪造（15 分钟）

## 4.1 没有签名验证会怎样

```javascript
// 攻击者：随便 POST 一个
POST /api/webhook/mail
{ "message_id": "<你的真message-id>", "event": "delivered" }
```

**后果：**

```text
你的 mail_log 被改成 delivered
→ 客户说没收到，你查日志说"已投递"
→ 你被骗了
→ 更糟：如果是 "bounced"，你会把一个正常的地址拉黑
```

## 4.2 加签名验证

```javascript
// app/routes/mail.js 加
import express from "express";
import { verifySignature, handleWebhookEvent } from "../../notify/webhook.js";

// 注意：webhook 要用 raw body 验证签名
mailRouter.post(
  "/webhook/mail",
  express.raw({ type: "application/json" }),
  wrap(async (req, res) => {
    const sig = req.headers["x-signature"];
    const secret = process.env.WEBHOOK_SECRET;

    if (!secret) {
      throw new Error("WEBHOOK_SECRET 未配置");
    }
    if (!verifySignature(req.body, sig, secret)) {
      return res.status(401).json({ ok: false, code: "UNAUTHORIZED", message: "签名不对", trace_id: req.traceId });
    }

    const evt = JSON.parse(req.body.toString("utf8"));
    const r = handleWebhookEvent(evt);

    // 关键：即使处理失败也返回 200（否则服务商会一直重试）
    res.json({ ok: true, handled: r.ok, reason: r.reason });
  })
);
```

**两个关键点：**

**① 必须用 `express.raw`**

```text
签名是对"原始字节"算的
如果先 express.json() 解析再重新序列化，字节会变（空格、字段顺序）
→ 签名验证一定失败
```

**② 处理失败也返回 200**

```text
返回 4xx/5xx → 服务商会重试 → 你重复收到同一个事件
返回 200      → 服务商认为送达成功
```

**但"签名不对"要返回 401** —— 那是真的不该接受。

## 4.3 验证

```bash
# 算一个正确的签名
SECRET=testsecret
BODY='{"message_id":"<abc@x>","event":"delivered"}'
SIG=$(node -e "console.log(require('crypto').createHmac('sha256','$SECRET').update('$BODY').digest('hex'))")

# 正确签名 → 200
curl -s -X POST localhost:3000/api/webhook/mail \
  -H "Content-Type: application/json" -H "x-signature: $SIG" \
  -d "$BODY" | jq

# 错误签名 → 401
curl -s -X POST localhost:3000/api/webhook/mail \
  -H "Content-Type: application/json" -H "x-signature: wrong" \
  -d "$BODY" | jq
```

**期望：第一个 `ok: true`，第二个 `code: UNAUTHORIZED`。**

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **五个状态和转移规则**
- **`delivered → bounced` 为什么允许**
- **`delivered` 不等于"进收件箱"**
- **webhook 签名为什么必须用 raw body**

---

# 第 6 步：课后练习

## 练习一：加"状态滞留告警"（20 分钟）

```text
一封邮件在 submitted 停留超过 1 小时 → 不正常
→ 可能是服务商没回调，也可能是你的 webhook 挂了
```

```javascript
export function checkStale({ hours = 1 } = {}) {
  const cutoff = Date.now() - hours * 3_600_000;
  const rows = db.prepare(`
    SELECT message_id, to_addr, created_at FROM mail_log
    WHERE status = 'submitted' AND created_at < ?
    LIMIT 50
  `).all(cutoff);

  if (rows.length) {
    log.warn("mail_status_stale", { count: rows.length, hours });
  }
  return rows.length;
}
```

**加进每日摘要（第 138 节）。**

## 练习二：算清"状态覆盖率"（15 分钟）

```text
最近 7 天发出 ____ 封
其中拿到 delivered 的 ____ 封
覆盖率 = ____%
```

**如果覆盖率 < 50%** → 你的 webhook 或轮询有问题（大量邮件停在 submitted）。

**参考：正常的覆盖率应该 > 85%。**

**如果低于这个数，排查顺序：**

```text
① webhook 有没有收到（看日志 webhook 相关事件）
② 签名验证有没有把正常事件拦掉（看 401 的数量）
③ 轮询有没有在跑（看 poll_done 日志）
④ 服务商那边有没有配置回调地址
```

## 练习三：判断这个状态机错在哪（15 分钟）

```javascript
function updateStatus(messageId, status) {
  db.prepare("UPDATE mail_log SET status = ? WHERE message_id = ?").run(status, messageId);
}
```

**错在哪？至少五条。**

**参考答案：**

```text
① 没有转移校验 → opened 会被 delivered 覆盖（倒退）
② 没有检查 message_id 是否存在 → 更新 0 行也不报错
③ 没有记事件流水 → 事后查不到"什么时候变成 bounced 的"
④ 没有返回结果 → 调用方不知道成功没成功
⑤ 没有日志 → 出问题无法排查
⑥ 没有防"终态被改" → bounced 之后还能改成 delivered
```

**第 ① 和最典型：** 服务商的事件可能乱序到达（先 delivered 后 accepted），**没有校验会让状态来回跳**。

---

# 第 7 步：最终验收

## A. 状态机

- [ ] 七个状态（submitted / accepted / delivered / bounced / opened / complained / failed）
- [ ] 转移表齐全
- [ ] `canTransition` 支持幂等（同状态返回 ok）
- [ ] **`delivered → bounced` 允许**（投递后被退）
- [ ] `opened → delivered` 拒绝
- [ ] `bounced` / `complained` / `failed` 是终态
- [ ] `test-status-machine.js` 12 条全过

## B. 更新函数

- [ ] 更新前查记录（不存在则报错）
- [ ] 校验转移合法性
- [ ] 非法转移记 warn 日志
- [ ] 更新 `mail_log.status` + `updated_at`
- [ ] **写入 `mail_event` 流水**
- [ ] 返回 `{ok, from, to}`

## C. 事件流水

- [ ] `mail_event` 表 + 索引
- [ ] 每次都记 `from_status` / `to_status` / `source`
- [ ] 能按 message_id 查出完整序列

## D. 状态来源

- [ ] webhook 接收 + **HMAC 签名验证**
- [ ] 用 `express.raw`（不是 json）
- [ ] 签名错返回 401，处理失败返回 200
- [ ] 轮询能跑（查 `submitted`/`accepted` 的）
- [ ] 假服务商（`fake-provider.js`）能起

## E. 端到端

- [ ] 发一封 → status=submitted
- [ ] webhook delivered → status=delivered
- [ ] webhook opened → status=opened
- [ ] **反向事件被拒**（`ok: false`）
- [ ] 事件流水里有两条，没有第三条

## F. 查询接口

- [ ] `GET /api/mail/:messageId`（含事件序列）
- [ ] `GET /api/mail/by-email/:email`（最近 10 封）
- [ ] `GET /api/mail/stats`（按状态分布）
- [ ] 收件人邮箱脱敏

## G. 排查流程

- [ ] 写出了"客户说没收到"的三步
- [ ] 知道五种可能结果（空/submitted/bounced/delivered/failed）各代表什么

## H. 提交

```bash
git add -A
git commit -m "第159节：状态机+事件流水+webhook签名+轮询"
git push
```

---

## 本节课要能说出口的一句话

> **`delivered` 只证明"收件方服务器收下了"，不证明"进了收件箱"。所以状态到 delivered 就该停，不要编造。**

---

# 附：常见问题速查

**Q：为什么 `delivered → bounced` 是允许的？**

A：**因为"投递后被退回"真的会发生。**

```text
时间线：
  T1  对方服务器返回 250（accepted）
  T2  对方服务器返回 250（delivered）
  T3  对方反垃圾系统判定为垃圾 → 退回 → 给你发退信
```

**如果不允许，你在 T3 收到的退信会被忽略，`mail_log` 永远显示 delivered。**

**Q：webhook 签名为什么一定要 raw body？**

A：**因为签名是对"字节"算的。**

```text
原始字节：{"a":1,"b":2}
express.json() 解析后重新序列化：{"a":1,"b":2}  ← 看起来一样，但字段顺序/空格可能变
→ HMAC 结果不同 → 验证失败
```

**必须 `express.raw({ type: "application/json" })`，用 `req.body` 的 Buffer 直接算。**

**Q：webhook 处理失败为什么返回 200？**

A：**避免服务商无限重试。**

```text
返回 500 → 服务商认为"投递失败" → 5 分钟后重试 → 再失败 → 重试 N 次
→ 你收到 N 个同样的事件
→ 而且服务商可能判定你的 webhook"不健康"，停掉回调
```

**返回 200 + `{ok: true, handled: false, reason}` 是最稳的做法。**

**但"签名不对"要返回 401** —— 那说明请求不是服务商发的，不该当正常事件处理。

**Q：`opened` 到底能不能用？**

A：**能当"参考"，不能当"证明"。**

```text
Gmail 会代理图片 → 邮件进入收件箱时图片已被加载 → 假阳性
用户关了图片     → 永远不会触发 → 假阴性
纯文本邮件       → 没有像素 → 无法追踪
```

**所以：`opened` 只对"通知类邮件的效果评估"有用，不能用来判断"是否送达"。**

**Q：轮询要多久一次？**

A：**看你的量和时效要求。**

```text
100 封/天，可以接受 1 小时延迟 → 每小时一次
1000 封/天，需要 10 分钟延迟 → 每 10 分钟一次，每次查 50 条
```

**注意配额** —— 大多数服务商的查询 API 有速率限制（比如 100 次/分钟）。

**Q：如果服务商既没 webhook 也没查询 API？**

A：**那只能靠"退信邮箱"（第 158 节的 DSN）。**

```text
DSN 只能告诉你"失败了"
→ 你知道 bounced，但不知道 delivered
→ 状态会一直停在 submitted
```

**这种服务商不要用。** 没有状态回执 = 你永远不知道邮件到了没。

**Q：状态分布里 `submitted` 占比很高，正常吗？**

A：**看时间范围。**

```text
最近 1 小时 → submitted 占 80% 正常（还在路上）
最近 7 天   → submitted 占 6% 算正常（少数没回执）
最近 7 天   → submitted 占 40% → 你的回调/轮询有问题
```

**判断标准：`(delivered + bounced + opened) / total` 应该 > 85%。**
