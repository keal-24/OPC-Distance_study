# 第 158 节课：失败重试与退信

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的核心判断只有一条：**硬退信绝不重试。**
> 因为它重试 100 次还是失败，而且每次都在损害你的发信域名信誉。

**建议用时**：120 分钟
**你需要先完成**：第 157 节的 `notify/mail-templates.js`
**今天要装**：什么都不用装

---

# 第 0 步：先分清"失败"的三种（20 分钟）

## 0.1 三张完全不同的脸

```text
类型 A：硬退信（hard bounce）
  SMTP 返回 550 / 551 / 553 / 554
  原因：地址不存在 / 域名不存在 / 账号被停用
  该做什么：绝不重试。标记为无效地址，以后不再发。

类型 B：软退信（soft bounce）
  SMTP 返回 4xx（421 / 450 / 451 / 452）
  原因：对方邮箱满了 / 对方服务器临时拒收 / 你的发送太快
  该做什么：重试，指数退避，3 次后放弃。

类型 C：我们的问题（不是退信）
  连接超时 / DNS 失败 / 认证失败 / 被自己限流
  原因：网络、配置、代码
  该做什么：这可能重试有效，也可能无效（401 就是配置错了）
```

**三张脸的差别，决定你重试还是不重试。**

## 0.2 为什么"重试硬退信"是灾难

```text
你发到一个不存在的地址
→ 550
→ 你重试
→ 550
→ 你重试 5 次
→ 收件方服务器记录："这个发信人反复向无效地址发信"
→ 你的发信 IP 信誉下降
→ 你所有的邮件（包括发给正常用户的）更容易进垃圾箱
```

**这就是"重试一个错地址，害了全部用户"。**

**行业数据（服务商公开的）：**

```text
退信率 > 5%  → 会被服务商警告
退信率 > 10% → 可能被暂停发信权限
硬退信反复出现 → IP 被列入灰名单
```

## 0.3 今天的四件事

```text
① 失败分类器（三张脸，各自处置）
② 重试策略（指数退避 + 上限 + 只重试软退）
③ 退信解析（从邮件正文/DSN 里读出"哪个地址失败了、为什么"）
④ 抑制名单（硬退的地址永不再发）
```

---

# 第 1 步：失败分类器（30 分钟）

## 1.1 一张判定表

```javascript
// notify/failure.js

export const FAILURE = {
  HARD: "hard",          // 硬退信：不重试
  SOFT: "soft",          // 软退信：重试
  TRANSIENT: "transient",// 我们这边临时问题：重试
  FATAL: "fatal",        // 配置/认证错误：不重试，要人看
};

/**
 * 分类一次发送失败。
 * @param {object} e  nodemailer 抛出的错误
 * @returns {{kind: string, code: string|null, detail: string, retryable: boolean}}
 */
export function classifyFailure(e) {
  const code = Number(e?.responseCode ?? 0);
  const nm = String(e?.code ?? "");
  const msg = String(e?.message ?? "").slice(0, 300);

  // ① SMTP 状态码优先（最准）
  if (code >= 500 && code < 600) {
    // 但 552（超出配额）其实是软退（对方邮箱满）
    if (code === 552) return mk(FAILURE.SOFT, code, msg, "邮箱超出配额");
    return mk(FAILURE.HARD, code, msg, "硬退信：地址/域名无效或对方永久拒收");
  }
  if (code >= 400 && code < 500) {
    return mk(FAILURE.SOFT, code, msg, "软退信：对方临时拒收");
  }

  // ② 认证/配置类：不重试
  if (nm === "EAUTH") {
    return mk(FAILURE.FATAL, null, msg, "认证失败：检查账号密码/授权码");
  }
  if (nm === "EENVELOPE") {
    // 没有 responseCode 的 EENVELOPE 通常是"地址格式被拒"
    return mk(FAILURE.HARD, null, msg, "信封被拒：地址格式或策略问题");
  }

  // ③ 连接/网络类：可重试
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(nm)) {
    return mk(FAILURE.TRANSIENT, null, msg, "连接问题：可重试");
  }

  // ④ 兜底
  return mk(FAILURE.TRANSIENT, null, msg, "未知失败：保守当作可重试，但限制次数");
}

function mk(kind, code, detail, note) {
  return { kind, code, detail, note, retryable: kind === FAILURE.SOFT || kind === FAILURE.TRANSIENT };
}
```

## 1.2 逐条解释四个关键判断

**① 为什么 552 要单独拎出来**

```text
RFC 5321 里 552 是 "Exceeded storage allocation"
→ 意思是"对方邮箱满了"，不是"地址不存在"
→ 邮箱满了会腾出空间，重试有意义
→ 所以是 SOFT，不是 HARD
```

**这条最容易漏。** 一个 5xx 一刀切成"硬退"，会让"邮箱满"的客户永远收不到你的邮件。

**② 为什么 `EENVELOPE` 当硬退**

```text
EENVELOPE = "信封问题"
→ nodemailer 在所有收件人都被拒时抛这个
→ 常见原因：地址格式错、域名不存在、对方策略拒收
→ 重试无意义
```

**但注意：`EENVELOPE` 也可能携带 `responseCode`。**

**所以顺序是"先看 responseCode，再看 code"。**

**③ 为什么网络错误算 TRANSIENT 而不是 SOFT**

```text
SOFT    = 对方说"现在不行"（4xx）
TRANSIENT = 我们这边连不上（网络抖）
```

**处置方式一样（都重试），但日志里分开记，方便排查。**

**④ 为什么兜底是 TRANSIENT 而不是 FATAL**

```text
未知错误 → 保守重试（最多 3 次）+ 记录
如果是真的 FATAL，重试 3 次也会失败，成本可接受
如果是真的 TRANSIENT，重试能救
```

**反过来（兜底 FATAL）会让"偶发网络抖"变成"邮件永久丢失"。**

## 1.3 立即验证

```javascript
// scripts/test-classify-failure.js
import { classifyFailure, FAILURE } from "../notify/failure.js";

const CASES = [
  { e: { responseCode: 550, message: "550 5.1.1 User unknown" },      expect: FAILURE.HARD },
  { e: { responseCode: 551, message: "551 User not local" },          expect: FAILURE.HARD },
  { e: { responseCode: 552, message: "552 Mailbox full" },            expect: FAILURE.SOFT },
  { e: { responseCode: 554, message: "554 Transaction failed" },      expect: FAILURE.HARD },
  { e: { responseCode: 421, message: "421 Service not available" },   expect: FAILURE.SOFT },
  { e: { responseCode: 450, message: "450 Mailbox busy" },            expect: FAILURE.SOFT },
  { e: { code: "EAUTH", message: "Invalid login" },                   expect: FAILURE.FATAL },
  { e: { code: "EENVELOPE", message: "All recipients were rejected" },expect: FAILURE.HARD },
  { e: { code: "ECONNECTION", message: "connect ETIMEDOUT" },         expect: FAILURE.TRANSIENT },
  { e: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND" },       expect: FAILURE.TRANSIENT },
  { e: { message: "something weird" },                                expect: FAILURE.TRANSIENT },
];

let pass = 0;
for (const c of CASES) {
  const r = classifyFailure(c.e);
  const ok = r.kind === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${String(c.e.responseCode ?? c.e.code ?? "-").padEnd(12)} → ${r.kind.padEnd(10)} retry=${r.retryable}  ${r.note}`);
}
console.log(`\n${pass}/${CASES.length} 通过`);
```

**期望 11/11。特别注意 552 那条：SOFT。**

---

# 第 2 步：重试策略（30 分钟）

## 2.1 三个数字

```text
最多重试几次？   3 次
间隔多久？       指数退避：1s / 4s / 16s
总耗时上限？     30 秒（超过就放弃，别让用户等）
```

**为什么是 3 次不是 10 次？**

```text
10 次重试 = 1+4+16+64+256+... ≈ 20 分钟
→ 用户早关了页面
→ 而且第 4 次之后成功的概率极低（<1%）
```

**为什么间隔是 4 倍不是 2 倍？**

```text
2 倍：1 / 2 / 4 / 8 秒  → 太密，对方还没恢复
4 倍：1 / 4 / 16 秒     → 给对端留出恢复时间
```

**总预算 30 秒：** 因为有 3 次 + 每次连接可能耗 5 秒，**加起来会超过 20 秒**。

## 2.2 实现

```javascript
// notify/retry.js
import { classifyFailure, FAILURE } from "./failure.js";
import { log } from "../app/lib/logger.js";

/**
 * 带重试的执行。只重试 retryable 的失败。
 *
 * @param {Function} fn        返回 {ok:true,...} 或 {ok:false, error:{...}}
 * @param {object}   opts
 * @param {number}   opts.attempts   最多尝试次数（含第一次）
 * @param {number[]} opts.delays     每次重试前的等待毫秒
 * @param {number}   opts.budgetMs   总预算
 */
export async function withRetry(fn, { attempts = 3, delays = [1000, 4000, 16000], budgetMs = 30_000, tag = "send" } = {}) {
  const t0 = Date.now();
  let last;

  for (let i = 0; i < attempts; i++) {
    // 预算检查（在重试之前）
    if (i > 0) {
      const elapsed = Date.now() - t0;
      const wait = delays[Math.min(i - 1, delays.length - 1)];

      if (elapsed + wait > budgetMs) {
        log.warn("retry_budget_exceeded", { tag, attempt: i, elapsed, wait, budget: budgetMs });
        return { ...last, exhausted: "budget" };
      }

      log.info("retry_wait", { tag, attempt: i, wait });
      await new Promise((r) => setTimeout(r, wait));
    }

    let r;
    try { r = await fn(); }
    catch (e) {
      // fn 抛错 → 交给分类器
      const f = classifyFailure(e);
      r = { ok: false, error: { ...f, message: String(e.message).slice(0, 200) } };
    }

    if (r.ok) {
      if (i > 0) log.info("retry_success", { tag, attempt: i + 1, total_ms: Date.now() - t0 });
      return { ...r, attempt: i + 1 };
    }

    last = r;
    const kind = r.error?.kind;

    // 不可重试 → 立刻返回
    if (kind === FAILURE.HARD || kind === FAILURE.FATAL) {
      log.warn("no_retry", { tag, kind, code: r.error?.code, attempt: i + 1 });
      return { ...r, attempt: i + 1 };
    }

    log.warn("retry_after_fail", { tag, kind, attempt: i + 1, of: attempts });
  }

  log.error("retry_exhausted", { tag, attempts, total_ms: Date.now() - t0 });
  return { ...last, exhausted: "attempts" };
}
```

## 2.3 逐段解释四个关键设计

**① 为什么"预算检查"在"等待"之前**

```javascript
// ❌ 先等，再看预算
await sleep(16000);
if (elapsed > budget) return;   // 白等了 16 秒

// ✅ 先算，再决定等不等
if (elapsed + wait > budget) return;
await sleep(wait);
```

**因为"等 16 秒然后放弃"是对用户最糟的体验。**

**② 为什么 `fn` 抛错也要走分类器**

```javascript
try { r = await fn(); }
catch (e) { r = { ok: false, error: classifyFailure(e) }; }
```

**因为 `sendMail` 有两种失败方式：**

```text
返回 { ok: false, ... }  → 它内部 catch 了
抛出异常                → 它没 catch（比如连接阶段的错）
```

**统一的入口要处理两种。**

**③ 为什么 HARD / FATAL 立刻返回，不消耗 attempts**

```javascript
if (kind === FAILURE.HARD || kind === FAILURE.FATAL) {
  return { ...r, attempt: i + 1 };
}
```

**因为"再多试几次"对它们是纯浪费 + 损害信誉。**

**④ 为什么返回 `attempt`**

```text
日志里能看到"第 2 次成功"
→ 你能统计"重试成功率"
→ 如果第 2 次成功率只有 5%，说明首次失败大多是硬退
```

## 2.4 用假 SMTP 验证五种场景

**给假 SMTP 加"按需返回不同错误"的能力：**

```javascript
// notify/fake-smtp.js 的 onRcptTo 里扩展
onRcptTo(address, session, callback) {
  const addr = address.address;

  // 硬退：地址不存在
  if (addr.startsWith("hard-")) {
    const e = new Error("550 5.1.1 User unknown");
    e.responseCode = 550;
    return callback(e);
  }

  // 软退：前 N 次拒绝，第 N+1 次接受
  if (addr.startsWith("soft-")) {
    const key = "soft:" + addr;
    const n = (softAttempts.get(key) ?? 0) + 1;
    softAttempts.set(key, n);
    const limit = Number(process.env.SOFT_REJECT_TIMES ?? 2);

    if (n <= limit) {
      const e = new Error("421 4.7.0 Try again later");
      e.responseCode = 421;
      return callback(e);
    }
    // 第 limit+1 次通过
  }

  // 超配额
  if (addr.startsWith("full-")) {
    const e = new Error("552 5.2.2 Mailbox full");
    e.responseCode = 552;
    return callback(e);
  }

  callback();
}
```

**测试：**

```javascript
// scripts/test-retry.js
import { withRetry } from "../notify/retry.js";
import { sendMail } from "../notify/mailer.js";

const CASES = [
  { to: "hard-1@example.test",  expect: { ok: false, attempts: 1, kind: "hard" },     label: "硬退 550" },
  { to: "soft-1@example.test",  expect: { ok: true,  attempts: 3, kind: null },       label: "软退 421 ×2 后成功" },
  { to: "full-1@example.test",  expect: { ok: false, attempts: 3, kind: "soft" },     label: "邮箱满 552" },
  { to: "normal@example.test",  expect: { ok: true,  attempts: 1, kind: null },       label: "正常" },
];

for (const c of CASES) {
  const t0 = Date.now();
  const r = await withRetry(
    () => sendMail({ to: c.to, subject: "retry test", text: "x" }),
    { tag: c.label, delays: [100, 200, 400] }    // 测试时缩短间隔
  );
  const ms = Date.now() - t0;
  const pass = r.ok === c.expect.ok && r.attempt === c.expect.attempts &&
    (!c.expect.kind || r.error?.kind === c.expect.kind);
  console.log(`${pass ? "✅" : "❌"} ${c.label.padEnd(22)} ok=${r.ok} attempt=${r.attempt} kind=${r.error?.kind ?? "-"} ${ms}ms`);
}
```

**期望：**

```text
✅ 硬退 550            ok=false attempt=1 kind=hard      12ms
✅ 软退 421 ×2 后成功   ok=true  attempt=3 kind=-        318ms
✅ 邮箱满 552           ok=false attempt=3 kind=soft      315ms
✅ 正常                 ok=true  attempt=1 kind=-         8ms
```

**四个关键点：**

```text
① 硬退只尝试 1 次（12ms，没有等待）
② 软退等到第 3 次成功（100+200 毫秒的退避）
③ 邮箱满重试 3 次后放弃（因为 SOF_REJECT_TIMES=2，第 3 次能过；
   但这里 to 是 full-，永远 552）
④ 正常 1 次成功
```

**注意第 ③ 条：`full-` 永远返回 552，所以 3 次都失败。** 这正是"软退信重试耗尽"的场景。

---

# 第 3 步：抑制名单（20 分钟）★ 最重要的一步

## 3.1 硬退之后必须"记住"

```text
硬退一次 → 这个地址无效
→ 以后再也不发
→ 否则每次都在损害信誉
```

**这张表叫"抑制名单"（suppression list）。**

```sql
CREATE TABLE IF NOT EXISTS mail_suppression (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,        -- hard_bounce / complaint / manual / unsub
  detail     TEXT,
  created_at INTEGER NOT NULL
);
```

## 3.2 三个写入时机

```javascript
// notify/suppression.js
import { db } from "../app/lib/db.js";
import { log } from "../app/lib/logger.js";

export function normalizeEmail(e) {
  return String(e ?? "").trim().toLowerCase();
}

export function isSuppressed(email) {
  const e = normalizeEmail(email);
  return Boolean(db.prepare("SELECT 1 FROM mail_suppression WHERE email = ?").get(e));
}

/**
 * 加入抑制名单。幂等。
 * @param {string} email
 * @param {"hard_bounce"|"complaint"|"manual"|"unsub"} reason
 */
export function suppress(email, reason, detail = null) {
  const e = normalizeEmail(email);
  if (!e) return false;

  const r = db.prepare(`
    INSERT OR IGNORE INTO mail_suppression (email, reason, detail, created_at)
    VALUES (?, ?, ?, ?)
  `).run(e, reason, detail, Date.now());

  if (r.changes > 0) {
    log.warn("mail_suppressed", { email: mask(e), reason });
  }
  return r.changes > 0;
}

export function unsuppress(email) {
  return db.prepare("DELETE FROM mail_suppression WHERE email = ?").run(normalizeEmail(email)).changes > 0;
}

export function listSuppressed({ limit = 100 } = {}) {
  return db.prepare("SELECT * FROM mail_suppression ORDER BY created_at DESC LIMIT ?").all(limit);
}

function mask(e) {
  const [u, d] = String(e).split("@");
  return d ? `${u.slice(0, 2)}***@${d}` : "***";
}
```

## 3.3 接进发送入口

```javascript
// notify/mailer.js 的 sendMail 开头
export async function sendMail({ to, ...rest }) {
  // ① 抑制名单检查（在渲染之后、发送之前）
  const addrs = Array.isArray(to) ? to : [to];
  const blocked = addrs.filter((a) => isSuppressed(a));

  if (blocked.length) {
    log.warn("mail_skipped_suppressed", { count: blocked.length });
    return { ok: false, skipped: true, reason: "suppressed", blocked: blocked.map(maskEmail) };
  }

  // ... 正常发送
}
```

**注意：返回 `skipped: true` 而不是 `ok: false`（无差别失败）。**

**因为"跳过"和"发送失败"是两个不同的状态：**

```text
skipped → 不该发（地址无效/已退订），不是错误
failed  → 该发但没发成
```

## 3.4 在失败处理里写入

```javascript
// 在 withRetry 之后
const r = await withRetry(() => sendMail({...}), { tag: "verify_code" });

if (!r.ok && r.error?.kind === "hard") {
  // 硬退 → 进抑制名单
  suppress(to, "hard_bounce", `code=${r.error.code}`);
  // 同时更新 mail_log
}
```

**关键：只有 HARD 才进抑制名单。**

```text
SOFT  重试耗尽 → 不进（对方可能只是忙）
HARD           → 进（地址真的无效）
FATAL          → 不进（是我们的配置问题，不是地址问题）
```

**这条判断错了，会把"暂时联系不上"的客户永久拉黑。**

## 3.5 验证

```javascript
// scripts/test-suppression.js
import { sendMail } from "../notify/mailer.js";
import { suppress, isSuppressed, unsuppress, listSuppressed } from "../notify/suppression.js";

const addr = "hard-tester@example.test";

// 清干净
unsuppress(addr);

// ① 第一次：硬退
const r1 = await sendMail({ to: addr, subject: "t1", text: "x" });
console.log("第一次:", { ok: r1.ok, code: r1.error?.responseCode });
// 注意：这里还需要手动 suppress（或让上层做）

// ② 手动 suppress（模拟上层逻辑）
suppress(addr, "hard_bounce", "550");
console.log("已抑制:", isSuppressed(addr));

// ③ 第二次：应该被跳过，不发
const r2 = await sendMail({ to: addr, subject: "t2", text: "x" });
console.log("第二次:", { ok: r2.ok, skipped: r2.skipped, reason: r2.reason });

// ④ 清掉
unsuppress(addr);
console.log("已解除:", !isSuppressed(addr));
```

**期望：**

```text
第一次: { ok: false, code: 550 }
已抑制: true
第二次: { ok: false, skipped: true, reason: 'suppressed' }
已解除: true
```

**关键验证：第二次 `skipped: true`，且假 SMTP 没有收到第二封。**

```bash
# 数一下 maildump 里发给 hard-tester 的邮件
grep -l "hard-tester@example.test" maildump/*.eml | wc -l
# 应该是 1（只有第一次那封被"尝试"了，但因为 550 被拒，可能 0 封）
```

**实际是 0 封** —— 因为 550 是在 RCPT 阶段拒的，数据还没传，`.eml` 根本没写入。

---

# 第 4 步：退信解析（25 分钟）

## 4.1 退信长什么样

**硬退时，发信服务商会给你发一封"退信通知"（DSN, Delivery Status Notification）。**

**它的结构：**

```text
From: MAILER-DAEMON@yourprovider.com
To: you@yourdomain.com
Subject: Undelivered Mail Returned to Sender
Content-Type: multipart/report; report-type=delivery-status

------=_Part_1
Content-Type: text/plain

Your message could not be delivered to one or more recipients.

------=_Part_2
Content-Type: message/delivery-status

Final-Recipient: rfc822; nonexistent@example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown

------=_Part_3
Content-Type: message/rfc822

（原始邮件）
```

**你要提取的三个字段：**

```text
Final-Recipient  → 哪个地址失败了（可能是多个）
Status           → 5.x.x = 硬退，4.x.x = 软退
Diagnostic-Code  → SMTP 服务器说的原话
```

## 4.2 解析器

```javascript
// notify/dsn.js
// 解析退信通知（DSN）
import { simpleParser } from "mailparser";

/**
 * @param {Buffer|string} raw  .eml 原文
 * @returns {{isDsn:boolean, failures:Array<{recipient,action,status,diagnostic,hard:boolean}>}}
 */
export async function parseDsn(raw) {
  const mail = await simpleParser(raw);

  const ctype = String(mail.headers.get("content-type") ?? "");
  const isDsn = /multipart\/report/i.test(ctype) && /delivery-status/i.test(ctype);

  if (!isDsn) return { isDsn: false, failures: [] };

  // mailparser 会把 message/delivery-status 部分解析成字符串
  // 我们从原始 parts 里找
  const failures = [];
  const parts = mail.attachments ?? [];

  // 方式一：从 text 里正则抽（更稳，因为不同服务商格式有差异）
  const body = `${mail.text ?? ""}\n${Buffer.isBuffer(raw) ? raw.toString("utf8") : raw}`;

  const blocks = body.split(/\n\s*\n/);
  for (const b of blocks) {
    if (!/Final-Recipient|Status:/i.test(b)) continue;

    const recipient = b.match(/Final-Recipient:\s*rfc822;\s*(\S+)/i)?.[1] ?? null;
    const action = b.match(/Action:\s*(\w+)/i)?.[1] ?? null;
    const status = b.match(/Status:\s*([245]\.\d+\.\d+)/i)?.[1] ?? null;
    const diag = b.match(/Diagnostic-Code:\s*(.+)/i)?.[1]?.trim() ?? null;

    if (!recipient) continue;

    failures.push({
      recipient,
      action,
      status,
      diagnostic: diag,
      hard: Boolean(status?.startsWith("5")),
    });
  }

  return { isDsn: true, failures, subject: mail.subject, date: mail.date };
}

/**
 * 从退信里提取"原始 message-id"（用于关联到你的 mail_log）。
 */
export async function extractOriginalMessageId(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  // 原始邮件是第三个 part，里面会有 Message-ID
  const ids = [...text.matchAll(/^Message-ID:\s*<([^>]+)>/gim)].map((m) => `<${m[1]}>`);
  // 第一个通常是退信自己的，最后一个是被退的原邮件
  return ids.length > 1 ? ids[ids.length - 1] : (ids[0] ?? null);
}
```

## 4.3 测试它

**先造一封退信：**

```javascript
// scripts/make-fake-dsn.js
// 造一封假的退信 .eml（用于测解析器）
import fs from "node:fs";

const ORIGINAL_MSGID = "<original-abc123@yourdomain.test>";

const dsn = `From: MAILER-DAEMON@fake-smtp.local
To: noreply@yourdomain.test
Subject: Undelivered Mail Returned to Sender
Date: ${new Date().toUTCString()}
Message-ID: <dsn-${Date.now()}@fake-smtp.local>
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="BOUND"

--BOUND
Content-Type: text/plain; charset=utf-8

Your message could not be delivered to one or more recipients.

--BOUND
Content-Type: message/delivery-status

Reporting-MTA: dns; fake-smtp.local
Arrival-Date: ${new Date().toUTCString()}

Final-Recipient: rfc822; nonexistent@example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown

--BOUND
Content-Type: message/rfc822

From: noreply@yourdomain.test
To: nonexistent@example.com
Subject: test
Message-ID: ${ORIGINAL_MSGID}
Date: ${new Date().toUTCString()}

hello
--BOUND--
`;

fs.mkdirSync("maildump", { recursive: true });
fs.writeFileSync("maildump/dsn-test.eml", dsn);
console.log("已生成 maildump/dsn-test.eml");
console.log("原始 Message-ID:", ORIGINAL_MSGID);
```

```bash
node scripts/make-fake-dsn.js
node -e "
import('./notify/dsn.js').then(async ({ parseDsn, extractOriginalMessageId }) => {
  const fs = await import('node:fs');
  const raw = fs.readFileSync('maildump/dsn-test.eml');
  console.log(JSON.stringify(await parseDsn(raw), null, 2));
  console.log('原始 message-id:', await extractOriginalMessageId(raw));
});
"
```

**期望：**

```json
{
  "isDsn": true,
  "failures": [
    {
      "recipient": "nonexistent@example.com",
      "action": "failed",
      "status": "5.1.1",
      "diagnostic": "smtp; 550 5.1.1 User unknown",
      "hard": true
    }
  ]
}
原始 message-id: <original-abc123@yourdomain.test>
```

## 4.4 接进"退信处理"

```javascript
// notify/handle-dsn.js
import { parseDsn, extractOriginalMessageId } from "./dsn.js";
import { suppress } from "./suppression.js";
import { db } from "../app/lib/db.js";
import { log } from "../app/lib/logger.js";

/**
 * 处理一封退信通知。
 * 真实环境：从"退信邮箱"里收邮件，或者从服务商的 webhook 拿。
 */
export async function handleDsn(raw) {
  const parsed = await parseDsn(raw);
  if (!parsed.isDsn) return { handled: false, reason: "不是退信通知" };

  const origMsgId = await extractOriginalMessageId(raw);

  for (const f of parsed.failures) {
    // ① 更新 mail_log 状态
    if (origMsgId) {
      db.prepare(`
        UPDATE mail_log SET status = ?, error_code = ?, updated_at = ?
        WHERE message_id = ?
      `).run(f.hard ? "bounced" : "soft_bounced", f.status, Date.now(), origMsgId);
    }

    // ② 硬退 → 抑制
    if (f.hard) {
      suppress(f.recipient, "hard_bounce", `${f.status} ${f.diagnostic ?? ""}`.slice(0, 200));
    }

    log.warn("dsn_processed", {
      recipient: f.recipient.replace(/^(.{2}).*@/, "$1***@"),
      status: f.status,
      hard: f.hard,
    });
  }

  return { handled: true, count: parsed.failures.length, origMsgId };
}
```

**验证：**

```bash
node -e "
import('./notify/handle-dsn.js').then(async ({ handleDsn }) => {
  const fs = await import('node:fs');
  const r = await handleDsn(fs.readFileSync('maildump/dsn-test.eml'));
  console.log(r);
  const { isSuppressed } = await import('./notify/suppression.js');
  console.log('nonexistent@example.com 已抑制:', isSuppressed('nonexistent@example.com'));
});
"
```

**期望最后一行 `true`。**

---

# 第 5 步：一个必须做的实验（15 分钟）

## 5.1 算清"重试硬退信"的代价

**假设你有 1 万个地址，其中 200 个是无效的（2% 退信率，很常见）。**

```text
如果硬退也重试 3 次：
  200 个地址 × 4 次尝试（首次 + 3 次重试）= 800 次无效 SMTP 请求
  → 对方服务器记录 800 次"这个发信人反复撞墙"
  → 你的 IP 被列入灰名单
  → 你剩下 9800 个正常地址的邮件也开始进垃圾箱
```

**如果硬退不重试：**

```text
200 次无效请求（每次 1 次尝试）
→ 200 个地址进抑制名单
→ 以后再也不发
→ 第二次群发时只有 9800 个地址（成功率反而更高）
```

**把这两个数字写进 `NOTES.md`。**

## 5.2 一个"退信率"的健康线

```text
< 2%   健康
2%–5%  需要关注（地址列表质量在下降）
> 5%   危险（服务商可能警告）
> 10%  会被暂停发信
```

**算一下你的：**

```text
发出 ____ 封
硬退 ____ 封
退信率 ____%
```

**如果 > 5%** → 你的地址列表有问题（可能是买来的、或者表单没做邮箱验证）。

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **552 为什么是 SOFT**
- **四种重试场景的实测（attempt 次数）**
- **抑制名单验证（第二次 skipped）**
- **退信解析的三个字段**

---

# 第 7 步：课后练习

## 练习一：加"投诉即退订"（20 分钟）

**用户点了"标记为垃圾邮件" → 服务商通过 webhook 告诉你 → 必须立刻停止发信。**

```javascript
export function handleComplaint(email) {
  // 投诉比硬退更严重（投诉率高会被服务商封号）
  suppress(email, "complaint", "user marked as spam");
  log.error("mail_complaint", { email: mask(email) });
  // 而且应该通知人（不是自动处理就完）
  alert.notify("mail_complaint", { count: countRecentComplaints() });
}
```

**为什么"投诉"比"硬退"更严重？**

```text
硬退 = 地址无效（不是用户的错）
投诉 = 用户主动说"这是垃圾" （直接损害你的发信资格）

行业线：投诉率 > 0.1% 就会被警告，> 0.3% 可能被暂停
```

## 练习二：算清"重试总预算"该定多少（15 分钟）

```text
3 次尝试 + 间隔 [1s, 4s, 16s] = 21 秒等待
加上每次连接/发送的耗时（假设 3 秒/次）= 9 秒
合计 ____ 秒
```

**如果用户"点发送后等 30 秒"能接受吗？**

**如果不能，怎么办？**

**参考答案：**

```text
方案一：异步发（用户点"发送"后立刻返回"已提交"，后台重试）
  → 这是"验证码"以外的所有通知类邮件的正确做法
  → 验证码必须同步（用户等着收），所以预算要短（比如 10 秒，2 次尝试）

方案二：验证码场景只重试 1 次，间隔 2 秒
  → 总耗时 2 + 3×2 = 8 秒，可接受
```

**关键：不同场景的预算不同。**

## 练习三：判断这个重试实现错在哪（15 分钟）

```javascript
async function sendWithRetry(fn, max = 5) {
  for (let i = 0; i < max; i++) {
    try { return await fn(); }
    catch (e) { 
      console.log("重试", i + 1);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("重试失败");
}
```

**错在哪？至少六条。**

**参考答案：**

```text
① 不区分硬退/软退 → 550 也重试 5 次 → 损害信誉
② 固定间隔 1 秒 → 对方还没恢复就再撞
③ 没有总预算 → 5 次 × (1秒 + 3秒) = 20 秒
④ 重试耗尽后 throw → 调用方没准备（可能是未捕获的 rejection）
⑤ 只 catch 了 throw，没处理 fn 返回 { ok:false } 的情况
⑥ console.log 而不是结构化日志 → 查不到
⑦ 没有记录 attempt 次数 → 无法统计"重试成功率"
```

**第 ① 条是本节的核心错误。** 硬退重试是"用全部用户的送达率换一个无效地址的 5 次尝试"。

---

# 第 8 步：最终验收

## A. 分类器

- [ ] 四种 kind（HARD / SOFT / TRANSIENT / FATAL）
- [ ] **552 判成 SOFT**（邮箱满）
- [ ] 550/551/554 判成 HARD
- [ ] 421/450 判成 SOFT
- [ ] EAUTH 判成 FATAL
- [ ] 网络错误判成 TRANSIENT
- [ ] 未知错误兜底成 TRANSIENT
- [ ] `test-classify-failure.js` 11 条全过

## B. 重试

- [ ] `withRetry` 支持 attempts / delays / budgetMs
- [ ] **预算检查在等待之前**
- [ ] HARD / FATAL 立刻返回（消耗 1 次 attempt）
- [ ] SOFT / TRANSIENT 重试
- [ ] 返回 `attempt` 次数
- [ ] 四种场景实测通过（硬退 1 次、软退 3 次成功、邮箱满 3 次失败、正常 1 次）

## C. 抑制名单

- [ ] `mail_suppression` 表
- [ ] `isSuppressed` / `suppress` / `unsuppress`
- [ ] **`sendMail` 开头检查抑制名单**
- [ ] 返回 `skipped: true`（不是普通失败）
- [ ] 只有 HARD 进抑制名单（SOFT/FATAL 不进）

## D. 验证

- [ ] 第二次发同一地址返回 `skipped: true`
- [ ] 假 SMTP 没收到第二封
- [ ] `maildump` 里的邮件数量没有增加

## E. 退信解析

- [ ] `parseDsn` 能识别 `multipart/report`
- [ ] 提取出 `Final-Recipient` / `Status` / `Diagnostic-Code`
- [ ] `Status` 首位是 5 → hard
- [ ] `extractOriginalMessageId` 能拿到原邮件的 message-id
- [ ] `handleDsn` 更新 `mail_log` 并把硬退地址加进抑制名单

## F. 数字

- [ ] 硬退重试 3 次的代价算出来了（无效请求次数、信誉影响）
- [ ] 我的退信率 __%
- [ ] 健康线（<2% / 2-5% / >5% / >10%）我记住了

## G. 提交

```bash
git add -A
git commit -m "第158节：失败四分类+指数退避重试+抑制名单+DSN解析"
git push
```

---

## 本节课要能说出口的一句话

> **重试一个硬退地址，是用"全部用户的送达率"去换"一个无效地址的 5 次尝试"。**

---

# 附：常见问题速查

**Q：为什么 552 是软退，其他 5xx 是硬退？**

A：**因为 552 是"邮箱满了"，不是"地址不存在"。**

```text
550 User unknown        → 地址根本不存在 → 硬退
552 Mailbox full        → 地址存在但满了 → 腾出空间就能收 → 软退
```

**但要注意：有些服务器用 552 表示"邮件太大"，那也是软退（改小附件再发）。**

**Q：`EENVELOPE` 携带 `responseCode` 时，听谁的？**

A：**听 `responseCode`。**

```javascript
// classifyFailure 的顺序：先看 responseCode，再看 code
if (code >= 500 && code < 600) { ... }
if (nm === "EENVELOPE") { ... }   // 只在没有 responseCode 时才走到这
```

**因为 `responseCode` 是对方服务器说的原话，更准。**

**Q：软退重试耗尽后，要不要进抑制名单？**

A：**不要。**

```text
软退 = 对方临时不行
→ 明天可能就好了
→ 进抑制名单会永久拉黑一个可能是正常的地址
```

**正确做法：软退计入 `mail_log` 的 `soft_bounced`，下次发信时照常尝试，但累计软退 > 5 次可以考虑降级（比如 30 天内不再发）。**

**Q：抑制名单会不会太大？**

A：**会，但这是好事。**

```text
1 万个地址，5% 无效 = 500 条记录
表很小
但避免了 500 × 每次群发 = 长期的信誉损害
```

**定期可以清理（比如 1 年前的 hard_bounce 记录，如果客户更新了地址）。**

**Q：怎么"从退信邮箱收邮件"？**

A：**三种做法：**

```text
① 发信服务商的 webhook（最简单，推荐）
   服务商把"退信事件"POST 给你

② 收一个专门的邮箱（bounce@yourdomain.com）
   用 IMAP 定时拉取，解析 DSN

③ 服务商的查询 API
   定时按 message-id 查状态（第 159 节）
```

**优先 ①，其次 ③，最后 ②。**

**Q：`mail_log` 里的 `message_id` 和退信里的 message-id 对不上？**

A：**可能有两个 message-id。**

```text
① 你发出去那封的 Message-ID（mailer.js 返回的 info.messageId）
② 退信通知自己的 Message-ID（不同的）
③ 退信里"附带的原邮件"的 Message-ID（应该等于 ①）
```

**`extractOriginalMessageId` 取的是"最后一个"，也就是 ③。**

**如果对不上** → 检查是不是多个 `<...>` 匹配错了 → 打印所有匹配看。

**Q：如果服务商不提供 DSN，怎么办？**

A：**用第 159 节的"状态查询 API"。**

```text
大多数服务商提供：
  GET /messages/{id}  → 返回 status: delivered / bounced / complained
```

**DSN 是"最原始最通用"的方式，API 是"更方便"的方式。有 API 就用 API。**
