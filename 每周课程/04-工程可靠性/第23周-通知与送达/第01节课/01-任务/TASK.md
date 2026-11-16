# 第 155 节课：邮件怎么发出去

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天在本地起一个假 SMTP，**收到一封真正的、完整的邮件原文**，然后逐行读懂它的头部。
> 这是理解"为什么邮件会进垃圾箱"的唯一办法。

**建议用时**：130 分钟
**你需要先完成**：第 154 节的 `PERF.md`
**今天要装**：`nodemailer`、`smtp-server`（两个都是纯 JS，无需编译）

---

# 第 0 步：先看清一封邮件长什么样（20 分钟）

## 0.1 一封邮件的两个部分

```text
┌─────────────────────────────────┐
│ 头部（Header）                    │  ← 邮件的"快递单"
│   From / To / Subject            │
│   Message-ID / Date              │
│   MIME-Version / Content-Type    │
│   Authentication-Results  ← 关键  │
│   Received （每一跳加一行）        │
├─────────────────────────────────┤
│ 空行                             │
├─────────────────────────────────┤
│ 正文（Body）                      │  ← 用户看到的内容
│   纯文本 或 HTML                 │
│   或 multipart（两种都有）        │
└─────────────────────────────────┘
```

**关键：`Authentication-Results` 这个头部。**

```text
Authentication-Results: mx.google.com;
  spf=pass smtp.mailfrom=yourdomain.com;
  dkim=pass header.i=@yourdomain.com;
  dmarc=pass (p=NONE sp=QUARANTINE) header.from=yourdomain.com
```

**这一行是收件方告诉你"我验了你的身份，结果如下"。**

**它只出现在"收到的邮件"里，不在"发出的邮件"里。**

**所以你必须有一个"能收到"的地方 —— 这就是今天要建假 SMTP 的原因。**

## 0.2 三个必须分清的概念

```text
① 发送（submit）
   你的程序把邮件交给 SMTP 服务器
   → 得到 "250 OK"（服务器收下了）

② 投递（deliver）
   SMTP 服务器把邮件交给收件方的服务器
   → 得到 "250 Accepted"（对方收下了）

③ 送达（delivered / inbox）
   对方的服务器把邮件放进用户的收件箱
   → 这个你查不到，只能推断
```

**你的代码只控制 ①。②要靠服务商，③要靠域名信誉。**

**今天先做 ①，并且要"看到"①到底发出了什么。**

## 0.3 今天要建的东西

```text
notify/
├── mailer.js          发邮件（支持 SMTP 和 API 两种后端）
└── fake-smtp.js       本地假 SMTP 服务器（收邮件、存原文）

scripts/
├── send-test.js       发一封测试邮件
└── dump-mail.js       解析并打印收到的邮件原文
```

---

# 第 1 步：起一个假 SMTP（30 分钟）

## 1.1 装依赖

```bash
npm i nodemailer smtp-server mailparser
```

**三个包：**

```text
nodemailer   发邮件（支持 SMTP / 各种 API）
smtp-server  起一个 SMTP 服务器（收邮件）
mailparser   把邮件原文解析成对象（可选，但很有用）
```

## 1.2 写假 SMTP

```javascript
// notify/fake-smtp.js
// 本地假 SMTP：收下所有邮件，存成 .eml 文件，并在控制台打印摘要
// 用法：node notify/fake-smtp.js
//      默认监听 2525 端口（25 需要 root，1025+ 都可以）

import { SMTPServer } from "smtp-server";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.FAKE_SMTP_PORT ?? 2525);
const OUT_DIR = process.env.FAKE_SMTP_DIR ?? "./maildump";

fs.mkdirSync(OUT_DIR, { recursive: true });

let seq = 0;

const server = new SMTPServer({
  // 不开 TLS（本地测试够用；真实环境必须开）
  secure: false,
  authOptional: true,          // 允许无认证（本地测试）
  disabledCommands: ["STARTTLS"],

  // 收件人校验：全部接受（但可以模拟拒绝，见第 158 节）
  onRcptTo(address, session, callback) {
    const addr = address.address;
    console.log(`  RCPT TO: ${addr}`);

    // 演示：模拟"地址不存在"
    if (addr.startsWith("bounce-")) {
      const err = new Error("550 5.1.1 User unknown");
      err.responseCode = 550;
      return callback(err);
    }

    callback();
  },

  // 数据阶段：收完整邮件
  onData(stream, session, callback) {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => {
      seq++;
      const raw = Buffer.concat(chunks);
      const from = session.envelope.mailFrom?.address ?? "?";
      const to = session.envelope.rcptTo.map((r) => r.address).join(",");

      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const name = `${String(seq).padStart(3, "0")}__${stamp}.eml`;
      const file = path.join(OUT_DIR, name);

      fs.writeFileSync(file, raw);

      console.log(`\n📩 收到一封邮件`);
      console.log(`   From: ${from}`);
      console.log(`   To:   ${to}`);
      console.log(`   大小: ${raw.length} 字节`);
      console.log(`   存档: ${file}`);
      console.log(`   ${"-".repeat(50)}`);

      // 打印头部前 20 行（不含正文）
      const text = raw.toString("utf8");
      const headerEnd = text.indexOf("\r\n\r\n") >= 0 ? text.indexOf("\r\n\r\n") : text.indexOf("\n\n");
      const head = text.slice(0, headerEnd > 0 ? headerEnd : 800);
      head.split(/\r?\n/).slice(0, 20).forEach((l) => console.log(`   ${l}`));
      console.log(`   ${"-".repeat(50)}\n`);

      callback();
    });
  },

  onError(err) {
    console.error("SMTP 错误:", err.message);
  },
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`假 SMTP 已启动：127.0.0.1:${PORT}`);
  console.log(`邮件存档目录：${path.resolve(OUT_DIR)}`);
  console.log(`\n配置你的应用：SMTP_HOST=127.0.0.1 SMTP_PORT=${PORT} SMTP_SECURE=false\n`);
});
```

## 1.3 逐段解释四个关键点

**① 为什么端口用 2525 而不是 25**

```text
25   → 需要 root/管理员权限，且很多 ISP 封锁
587  → 提交端口（真实环境用这个，要 TLS）
2525 → 备用提交端口，无权限要求 ← 我们用它
```

**② 为什么 `disabledCommands: ["STARTTLS"]`**

```text
假 SMTP 没有证书
如果客户端尝试 STARTTLS，会失败
→ 显式禁用，让客户端用明文（本地测试可接受）
```

**真实环境必须开 TLS**（第 160 节讲）。

**③ 为什么"全部接受"但要演示 550**

```text
今天的目的是"收到邮件"
但第 158 节要处理退信，所以先留一个 `bounce-` 前缀的钩子
→ 发到 bounce-xxx@ 的邮件会被 550 拒绝
→ 你可以用它测"硬退信"
```

**④ 为什么存成 `.eml` 文件**

```text
.eml 是标准邮件格式
→ 可以用邮件客户端直接打开
→ 可以 diff（对比两次发送的差异）
→ 保留了所有原始字节（包括编码、换行）
```

**这比"打印到控制台"有用得多。**

## 1.4 起它

```bash
# 终端 1
node notify/fake-smtp.js
```

**期望：**

```text
假 SMTP 已启动：127.0.0.1:2525
邮件存档目录：B:\your-project\maildump

配置你的应用：SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_SECURE=false
```

---

# 第 2 步：发第一封邮件（30 分钟）

## 2.1 写发送模块

```javascript
// notify/mailer.js
// 统一发信入口。支持两种后端：smtp（本地假 SMTP / 真实 SMTP）、api（HTTP 服务）
import nodemailer from "nodemailer";
import { config } from "../app/config/index.js";
import { log } from "../app/lib/logger.js";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = config.mail.smtp;

  if (!host) {
    throw new Error("SMTP 未配置：设置 SMTP_HOST / SMTP_PORT");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,                       // true = 端口 465（隐式 TLS）；false = 587/2525（可能 STARTTLS）
    auth: user ? { user, pass } : undefined,
    // 本地假 SMTP 没有证书，真实环境不要加这个
    tls: { rejectUnauthorized: config.isProd },
    // 连接/发送超时（第 129 节的道理，这里也要有）
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

/**
 * 发一封邮件。
 * @returns {Promise<{ok:boolean, messageId?:string, accepted?:string[], rejected?:string[], error?:string}>}
 */
export async function sendMail({ to, subject, text, html, replyTo, headers = {} }) {
  const from = config.mail.from;
  const t0 = Date.now();

  try {
    const info = await getTransporter().sendMail({
      from,
      to,
      subject,
      text,
      html,
      replyTo,
      headers: {
        // 关键：加上这些头部，方便追踪
        "X-Entity-Ref-ID": headers["X-Entity-Ref-ID"],
        ...headers,
      },
    });

    const result = {
      ok: true,
      messageId: info.messageId,           // 形如 <abc@yourdomain.com>
      response: info.response,             // SMTP 的原始响应
      accepted: info.accepted ?? [],
      rejected: info.rejected ?? [],
      ms: Date.now() - t0,
    };

    log.info("mail_sent", {
      to: maskEmail(to),
      subject_len: subject.length,
      message_id: result.messageId,
      accepted: result.accepted.length,
      rejected: result.rejected.length,
      dur_ms: result.ms,
    });

    return result;
  } catch (e) {
    const err = {
      ok: false,
      error: String(e.message).slice(0, 200),
      code: e.code,                        // EAUTH / ECONNECTION / EENVELOPE / ...
      responseCode: e.responseCode,        // 550 / 421 ...
      ms: Date.now() - t0,
    };

    log.error("mail_failed", {
      to: maskEmail(to),
      code: err.code,
      response_code: err.responseCode,
      err: err.error,
      dur_ms: err.ms,
    });

    return err;
  }
}

// 日志里不记完整邮箱（第 132 节）
function maskEmail(addr) {
  const s = String(addr ?? "");
  const [u, d] = s.split("@");
  if (!d) return "***";
  return `${u.slice(0, 2)}***@${d}`;
}
```

## 2.2 加配置

```javascript
// app/config/index.js 里加
mail: {
  from: str("MAIL_FROM", "Test <test@example.com>"),
  smtp: {
    host: str("SMTP_HOST", ""),
    port: num("SMTP_PORT", 587),
    secure: bool("SMTP_SECURE", false),
    user: str("SMTP_USER", ""),
    pass: str("SMTP_PASS", ""),
  },
},
```

**.env.development：**

```bash
MAIL_FROM="Test Sender <noreply@yourdomain.test>"
SMTP_HOST=127.0.0.1
SMTP_PORT=2525
SMTP_SECURE=false
```

**注意 `.test` 域名** —— 它永远不会真实投递，是测试专用顶级域。

## 2.3 发第一封

```javascript
// scripts/send-test.js
import { sendMail } from "../notify/mailer.js";

const r = await sendMail({
  to: "customer@example.test",
  subject: "您的验证码是 123456",
  text: "您的验证码是 123456，5 分钟内有效。\n\n如果不是您本人操作，请忽略本邮件。",
});

console.log(JSON.stringify(r, null, 2));
```

```bash
node scripts/send-test.js
```

**终端 2（假 SMTP）应该打印：**

```text
📩 收到一封邮件
   From: noreply@yourdomain.test
   To:   customer@example.test
   大小: 812 字节
   存档: ./maildump/001__2026-11-17T01-45-12.eml
   --------------------------------------------------
   From: Test Sender <noreply@yourdomain.test>
   To: customer@example.test
   Subject: =?UTF-8?B?5oKo55qE6aqM6K+B56CB5pivIDEyMzQ1Ng==?=
   Message-ID: <abc123@yourdomain.test>
   Date: Tue, 17 Nov 2026 01:45:12 +0000
   MIME-Version: 1.0
   Content-Type: text/plain; charset=utf-8
   Content-Transfer-Encoding: base64
   --------------------------------------------------
```

## 2.4 逐行读懂五个头部

**① `Subject: =?UTF-8?B?...?=`**

```text
这是"编码后的中文标题"
=?UTF-8?B?xxx?= 表示"用 UTF-8 + Base64 编码"

为什么必须编码：SMTP 协议头只允许 ASCII
→ 中文标题必须编码
→ nodemailer 自动做了
```

**验证解码：**

```bash
node -e "console.log(Buffer.from('5oKo55qE6aqM6K+B56CB5pivIDEyMzQ1Ng==','base64').toString('utf8'))"
# 输出：您的验证码是 123456
```

**② `Content-Transfer-Encoding: base64`**

```text
正文也用 base64 编码了
为什么：纯 7bit ASCII 传输，中文必须编码
```

**③ `Message-ID`**

```text
唯一标识这封邮件
→ 用它查送达状态（第 159 节）
→ 用它关联退信（第 158 节）
```

**必须记录下来。** 这是你今天最重要的产出。

**④ `MIME-Version: 1.0`**

```text
表示"这封邮件遵循 MIME 标准"（能带附件、能多段、能编码中文）
现代邮件都有这一行
```

**⑤ 注意：没有 `Authentication-Results`**

```text
因为我们是"直接投递到假 SMTP"
没有经过任何"验证"
→ 没有 SPF/DKIM/DMARC 的验证结果

真实的收件方（Gmail 等）会在头部加这一行
```

**这一行是第 160 节的目标。**

---

# 第 3 步：把邮件原文读出来（25 分钟）

## 3.1 用 mailparser 解析

```javascript
// scripts/dump-mail.js
// 解析 .eml 文件，打印结构化的内容
import fs from "node:fs";
import { simpleParser } from "mailparser";

const file = process.argv[2] ?? (() => {
  const dir = "maildump";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".eml")).sort();
  if (!files.length) { console.error("maildump 里没有邮件"); process.exit(1); }
  return `${dir}/${files[files.length - 1]}`;
})();

const raw = fs.readFileSync(file);
const mail = await simpleParser(raw);

console.log("=== 基本信息 ===");
console.log("From:      ", mail.from?.text);
console.log("To:        ", mail.to?.text);
console.log("Subject:   ", mail.subject);
console.log("Message-ID:", mail.messageId);
console.log("Date:      ", mail.date?.toISOString());

console.log("\n=== 全部头部 ===");
for (const [k, v] of mail.headers) {
  const val = String(v);
  console.log(`${k}: ${val.length > 100 ? val.slice(0, 100) + "…" : val}`);
}

console.log("\n=== 纯文本正文 ===");
console.log(mail.text ?? "(无)");

if (mail.html) {
  console.log("\n=== HTML 正文（前 300 字）===");
  console.log(String(mail.html).slice(0, 300));
}

console.log("\n=== 附件 ===");
if (mail.attachments?.length) {
  for (const a of mail.attachments) {
    console.log(`  ${a.filename}  ${a.size} 字节  ${a.contentType}`);
  }
} else {
  console.log("  (无)");
}
```

```bash
node scripts/dump-mail.js
```

**输出：**

```text
=== 基本信息 ===
From:       Test Sender <noreply@yourdomain.test>
To:         customer@example.test
Subject:    您的验证码是 123456
Message-ID: <abc123@yourdomain.test>
Date:       2026-11-17T01:45:12.000Z

=== 全部头部 ===
from: Test Sender <noreply@yourdomain.test>
to: customer@example.test
subject: 您的验证码是 123456
message-id: <abc123@yourdomain.test>
date: Tue, 17 Nov 2026 01:45:12 +0000
mime-version: 1.0
content-type: text/plain; charset=utf-8
content-transfer-encoding: base64

=== 纯文本正文 ===
您的验证码是 123456，5 分钟内有效。

如果不是您本人操作，请忽略本邮件。
```

**这就是"一封真实的邮件"。** 你现在能读到它的每个字节。

## 3.2 一个必须做的实验：加 HTML 版

```javascript
const r = await sendMail({
  to: "customer@example.test",
  subject: "您的验证码是 654321",
  text: "您的验证码是 654321，5 分钟内有效。",
  html: `<div style="font:16px/1.6 system-ui">
    <p>您的验证码是</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:4px">654321</p>
    <p style="color:#888;font-size:13px">5 分钟内有效。如非本人操作请忽略。</p>
  </div>`,
});
```

**再 dump，看头部变化：**

```text
content-type: multipart/alternative; boundary="----=_Part_0_xxx"

=== 纯文本正文 ===
您的验证码是 654321，5 分钟内有效。

=== HTML 正文（前 300 字）===
<div style="...">
```

**关键：`multipart/alternative`**

```text
表示"这封邮件的正文有多种格式"
邮件客户端会选"最好的一种"显示
  · HTML 客户端 → 显示 HTML
  · 纯文本客户端 → 显示 text
```

**为什么两个都要给？**

```text
只给 HTML → 某些客户端显示乱码，或者被判"营销邮件"更容易进垃圾
只给 text  → 用户体验差（验码看不清）

两个都给 → 收件方选，兼容性最好
```

**验证码邮件的建议：**

```text
text 是主要版本（一定要有，且要清晰）
html 只是"美化"，可选
```

**有些"反垃圾"策略会检查"text 和 html 内容是否一致"** —— 如果你用 HTML 藏了 text 里没有的内容，会被扣分。

---

# 第 4 步：一个必须知道的现实（20 分钟）

## 4.1 你现在发出的邮件"什么验证都没有"

```bash
# 看你的 .eml 里有没有这三样
grep -i "authentication-results\|dkim-signature\|received-spf" maildump/*.eml
```

**大概率什么都没有。**

```text
没有 DKIM-Signature  → 收件方无法验证"这封信真的是你发的"
没有 Received-SPF    → 收件方无法验证"发信 IP 有权代表这个域名"
没有 Authentication-Results → 因为我们是直接投递
```

**后果（如果直接发给真实收件方）：**

```text
Gmail：没有 SPF/DKIM 的邮件 → 大概率进垃圾箱，或者直接被拒
企业邮箱：可能直接 550（"发信域未认证"）
```

**这就是第 160 节要解决的。**

## 4.2 一个可以做的"预演"

**给本地假 SMTP 加上"模拟验证结果"的能力：**

```javascript
// notify/fake-smtp.js 的 onData 里，在存文件之前加
const simulatedAuth = [
  `Authentication-Results: fake-smtp.local;`,
  `  spf=${process.env.SIM_SPF ?? "none"}`,
  `  dkim=${process.env.SIM_DKIM ?? "none"}`,
  `  dmarc=${process.env.SIM_DMARC ?? "none"}`,
].join("\n");

// 插到头部后面（模拟"收件方加的"）
const text = raw.toString("utf8");
const idx = text.indexOf("\r\n\r\n") >= 0 ? text.indexOf("\r\n\r\n") : text.indexOf("\n\n");
const withAuth = text.slice(0, idx) + "\r\n" + simulatedAuth + text.slice(idx);

fs.writeFileSync(file, withAuth);
```

**然后：**

```bash
SIM_SPF=pass SIM_DKIM=pass SIM_DMARC=pass node notify/fake-smtp.js
```

**再 dump，就能看到"如果配置正确"的头部长什么样。**

**这个"假装的验证结果"很重要** —— 它让你知道目标是什么。

## 4.3 三句话总结今天的认知

```text
① 你发出的邮件，头部里没有"验证结果"—— 那是收件方加的
② 收件方靠 SPF/DKIM/DMARC 判断"你是不是冒充的"
③ 你控制不了收件方，但你能控制"让自己通过验证"
```

---

# 第 5 步：接进你的系统（15 分钟）

## 5.1 一个"验证码发送"的最小实现

```javascript
// notify/verify-code.js
import { sendMail } from "./mailer.js";
import { log } from "../app/lib/logger.js";

export async function sendVerifyCode({ email, code, ttlMinutes = 5 }) {
  const subject = `您的验证码是 ${code}`;
  const text = [
    `您的验证码是 ${code}，${ttlMinutes} 分钟内有效。`,
    "",
    "如果不是您本人操作，请忽略本邮件。",
    "",
    "—— 请勿回复本邮件",
  ].join("\n");

  const r = await sendMail({
    to: email,
    subject,
    text,
    headers: { "X-Entity-Ref-ID": `verify:${Date.now()}` },
  });

  if (!r.ok) {
    log.error("verify_mail_failed", { code: r.code, response_code: r.responseCode });
    // 关键：不要在这里 throw，让调用方决定（第 144 节的错误处理）
    return { ok: false, reason: "mail_failed", detail: r.error };
  }

  return { ok: true, messageId: r.messageId };
}
```

## 5.2 一个必须做的验证

```javascript
// scripts/test-verify-flow.js
import { sendVerifyCode } from "../notify/verify-code.js";

const r = await sendVerifyCode({ email: "customer@example.test", code: "123456" });
console.log(r);

// 检查假 SMTP 收到了
// 检查 .eml 里有正确的验证码
```

**然后：**

```bash
# 找到最新那封
LATEST=$(ls -t maildump/*.eml | head -1)
grep -c "123456" "$LATEST"
# 应该输出 ≥1
```

**这一步验证了"验证码真的进了邮件正文"。**

**比"接口返回 200"有意义得多。**

## 5.3 三个必须记录的字段

**每次发信，必须落库三个字段：**

```sql
CREATE TABLE IF NOT EXISTS mail_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  TEXT NOT NULL,           -- 唯一标识，用于查状态
  to_addr     TEXT NOT NULL,           -- 收件人
  subject     TEXT NOT NULL,
  kind        TEXT NOT NULL,           -- verify / notify / marketing
  status      TEXT NOT NULL,           -- submitted / delivered / bounced / failed
  error_code  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_mail_log_msgid ON mail_log(message_id);
CREATE INDEX idx_mail_log_status ON mail_log(status, created_at DESC);
```

**为什么必须有这张表？**

```text
第 159 节：查状态要按 message_id 查
第 161 节：算送达率要按 status 统计
排查"客户没收到"：先按收件人查最近 10 封
```

**今天先建表 + 写入，状态先都是 `submitted`。后面几节会更新它。**

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **假 SMTP 收到的邮件原文（贴头部）**
- **`Subject` 为什么是 `=?UTF-8?B?...?=`**
- **`multipart/alternative` 是什么**
- **为什么你的邮件"什么验证都没有"**

---

# 第 7 步：课后练习

## 练习一：发一封"会退信"的邮件（20 分钟）

```javascript
const r = await sendMail({
  to: "bounce-test@example.test",     // 假 SMTP 会拒这个前缀
  subject: "测试退信",
  text: "这封会被拒",
});
console.log(r);
```

**期望：**

```json
{
  "ok": false,
  "error": "Can't send mail - all recipients were rejected: 550 5.1.1 User unknown",
  "code": "EENVELOPE",
  "responseCode": 550
}
```

**关键观察：**

```text
nodemailer 把 550 转成了 EENVELOPE + responseCode: 550
→ 你的代码要靠 responseCode 区分硬退信和软退信（第 158 节）
```

## 练习二：算清"一封邮件多大"（15 分钟）

```bash
ls -l maildump/*.eml | awk '{print $5}' | sort -n
```

**记录：**

```text
纯文本邮件：____ 字节
带 HTML：  ____ 字节
```

**然后算：**

```text
每天 1000 封 × ____ 字节 = ____ MB/天
服务商的免费额度够吗：____
```

**参考：** 大多数服务商按"封数"计费，不按大小（但有单封上限，通常 25MB）。

**但注意：** 附件才是大头。**验证码邮件别带附件。**

## 练习三：判断这个发信实现错在哪（15 分钟）

```javascript
async function sendMail(to, subject, text) {
  await fetch("https://api.mailservice.com/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ to, subject, text }),
  });
  console.log("邮件已发送");
}
```

**错在哪？至少五条。**

**参考答案：**

```text
① 没有检查 res.ok → 400/500 也会打印"已发送"
② 没有读响应体 → 拿不到 message-id，后面无法查状态
③ 没有 try/catch → 网络错误直接抛，上层没准备
④ 没有记录到 mail_log → 无法统计、无法排查
⑤ `console.log("邮件已发送")` 是假的 —— 它只证明"fetch 没抛错"
⑥ 没有 from → 有些服务商要求显式指定
⑦ KEY 硬编码（第 135 节的规矩）
```

**第 ⑤ 条最典型：** `console.log` 写"已发送"，但代码实际只做了"发起请求"。**这个日志会骗你三个月。**

---

# 第 8 步：最终验收

## A. 假 SMTP 跑起来

- [ ] `notify/fake-smtp.js` 能启动，监听 2525
- [ ] `onRcptTo` 里对 `bounce-` 前缀返回 550
- [ ] `onData` 存成 `.eml` 文件
- [ ] 控制台打印 From / To / 大小 / 头部前 20 行
- [ ] **邮件存档目录里有真实文件**

## B. 发送模块

- [ ] `notify/mailer.js` 用 nodemailer
- [ ] 支持 `text` + `html` 双版本
- [ ] **返回 `messageId`**（这是后面几节的基础）
- [ ] 返回 `accepted` / `rejected`
- [ ] 有 `connectionTimeout` / `socketTimeout`
- [ ] 错误里带 `code` 和 `responseCode`
- [ ] 日志里邮箱是脱敏的（`ma***@example.test`）

## C. 配置

- [ ] `config.mail.from` / `config.mail.smtp.*`
- [ ] `.env.development` 指向 127.0.0.1:2525
- [ ] `MAIL_FROM` 用 `.test` 域名（永不真实投递）

## D. 收到并读懂

- [ ] `scripts/dump-mail.js` 能解析 `.eml`
- [ ] 看到 `Subject` 是 `=?UTF-8?B?...?=` 并知道为什么
- [ ] 看到 `Content-Transfer-Encoding: base64`
- [ ] 加了 HTML 后变成 `multipart/alternative`
- [ ] **确认自己的邮件里没有 `DKIM-Signature` / `Authentication-Results`**

## E. 退信

- [ ] 发到 `bounce-xxx@` 得到 `EENVELOPE` + `responseCode: 550`
- [ ] 知道要靠 `responseCode` 区分硬退/软退

## F. 落库

- [ ] `mail_log` 表建好（含 `message_id` / `status` / `created_at`）
- [ ] 两个索引
- [ ] 发信时写入（`status = 'submitted'`）

## G. 提交

```bash
git add -A
git commit -m "第155节：假SMTP + nodemailer，收到真实邮件原文，落库mail_log"
git push
```

---

## 本节课要能说出口的一句话

> **`Authentication-Results` 只出现在收到的邮件里 —— 那是收件方验完你的身份后写的。所以你必须有一个"能收到"的地方，才能看到自己有没有通过验证。**

---

# 附：常见问题速查

**Q：`nodemailer` 报 `ECONNREFUSED`？**

A：**假 SMTP 没起，或者端口不对。**

```bash
# 确认假 SMTP 在跑
netstat -ano | findstr 2525       # Windows
lsof -i :2525                      # macOS/Linux

# 确认配置
echo $SMTP_HOST $SMTP_PORT
```

**注意 nodemailer 的 `port` 是数字，从环境变量读要 `Number()`（第 135 节的 `num()` 就是干这个的）。**

**Q：`SMTP_SECURE` 到底什么时候 true？**

A：**看端口。**

```text
465  → secure: true   （隐式 TLS，连上就是加密的）
587  → secure: false  （明文连接，然后 STARTTLS 升级）
2525 → secure: false  （本地假 SMTP，不用 TLS）
```

**配错了症状：**

```text
465 配 secure:false → 连接后卡住（等 TLS 握手但没发起）
587 配 secure:true  → 报 "wrong version number"（把明文当 TLS 解析）
```

**Q：为什么 `Subject` 是乱码一样的一串？**

A：**那是 RFC 2047 编码，不是乱码。**

```text
=?UTF-8?B?5oKo55qE6aqM6K+B56CB5pivIDEyMzQ1Ng==?=
  ↑      ↑  ↑
 字符集 编码 内容（Base64）
```

**解码：**

```bash
node -e "console.log(Buffer.from('5oKo55qE6aqM6K+B56CB5pivIDEyMzQ1Ng==','base64').toString())"
```

**`mailparser` 会自动解码，所以 `mail.subject` 是中文。**

**Q：`multipart/alternative` 和 `multipart/mixed` 有什么区别？**

A：**alternative = 同一内容的多种格式；mixed = 多个独立的部分（正文 + 附件）。**

```text
multipart/alternative
  ├─ text/plain   （纯文本版）
  └─ text/html    （HTML 版）
  → 客户端选一个显示

multipart/mixed
  ├─ multipart/alternative  （正文）
  └─ application/pdf        （附件）
  → 全都要
```

**只发验证码时用 `alternative`，带附件时外层用 `mixed`。**

**Q：我能不能直接用 QQ 邮箱发？**

A：**能发，但不要用于业务。**

```text
额度：每天 50 封左右（个人邮箱）
发信域名：qq.com（不是你的，你控制不了 SPF/DKIM）
后果：大量进垃圾箱；更糟的是你的 QQ 邮箱可能被封
```

**今天用假 SMTP 练习，真实业务用专业发信服务（第 160 节会讲怎么选）。**

**Q：`messageId` 有什么用？**

A：**它是唯一能"追一封邮件"的标识。**

```text
第 158 节：退信通知里会带 original message-id → 用它关联到你的 mail_log
第 159 节：查状态要按 message-id 查
第 161 节：算送达率要按 message-id 去重
```

**没有它，你只有"发送时间 + 收件人"，而这两者都不唯一。**

**Q：为什么日志里不记完整邮箱？**

A：**第 132 节的规矩：日志里没有 PII。**

```javascript
// 脱敏后
to: ma***@example.test

// 需要完整邮箱时
去 mail_log 表查（那张表有权限控制）
```
