# 第 230 节课：隐私、日志、依赖与版权——你的网站开始有别人的数据了

> 第 225—229 节你堵的是"门"：钥匙、校验、越权、注入、上传。
> 这一节换个角度：**门都锁好了，但屋里放着别人的隐私。**
> 上一节课你还往服务器里塞了用户上传的文件。从那一刻起，你不只是"跑了个网站"，你是**一个处理别人个人信息的人**。这在法律上有明确的责任。

**建议用时**：120 分钟
**你需要先完成**：第 225 节（密钥清单）、第 229 节（上传）、第 32 周（日志与备份）

---

# 第 0 步：这一节为什么不能跳（10 分钟）

## 0.1 你现在会什么

你的 `chat-app` 现在大概是这样：

```js
app.post("/api/chat", requireLogin, async (req, res) => {
  console.log("收到请求", req.body);              // 整个 body 打进日志
  console.log("user:", req.user);                 // 整个用户对象打进日志
  const reply = await callModel(req.body.messages);
  await db.run("INSERT INTO messages ...", ...);
  res.json({ reply });
});
```

```nginx
access_log /var/log/nginx/access.log;
```

**这两段代码都很正常。** 每一份教程都这么写。

**问题在于：它们会把用户的手机号、对话内容、会话 cookie、甚至 API key，原样写进一个纯文本文件，永远不删。**

## 0.2 你以后会遇到什么

```text
① 客户问"你们会不会看我们的聊天记录"，你答不上来
② 用户要求"把我的数据全删掉"，你不知道数据都存在哪几个地方
③ 日志文件 40GB，磁盘满了，网站全站 500
④ npm audit 报了 12 个 high，你点了"以后再说"，三个月后其中一个被利用
⑤ 你在网站上用了某款商用字体，收到一封 3000 元的授权函
⑥ 甲方（某医院）发来一张表，问"个人信息处理情况"，二十几栏你只填得出三栏
```

**这六件事，没有一件是"技术 bug"。** 它们全是"你根本没意识到自己该做什么"。

## 0.3 今天要建立的三个概念

```text
① 个人信息（PII）：能单独或组合起来指向一个具体自然人的信息。
   手机号、身份证号、住址、人脸、身份证照片，甚至"这个 IP 在凌晨三点访问了抑郁症话题"。

② 最小必要：为了完成这个功能，最少需要哪些字段？
   注册只需要手机号，就不该收身份证。字段多收一个，责任多一层。

③ 可删除、可导出：用户要删，你得真删；用户要拿，你得真给。
   这两件事做不到，就不要收这个数据。
```

**第三个概念是这一节的核心。** 它不是"加分项"，是能不能做生意的前提。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 数据地图 + 脱敏前后对比 + 版权清单 |
| `privacy-lab/` | `03-练习代码` | 脱敏中间件 + 导出接口 + 删除接口 |
| `数据地图.md` | `03-练习代码` | 你的数据存在哪六个地方 |
| `版权清单.md` | `03-练习代码` | 字体、图片、依赖协议三张表 |

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **两个地方：**<br><code>① 你的 Windows：写脱敏函数、导出删除接口、依赖审计、版权清单</code><br><code>② 服务器：查 Nginx 日志有没有敏感信息、改日志格式、查 .env 权限</code> |
| **用哪个终端** | **Git Bash 本地 + Git Bash（SSH 到服务器）。** |
| **现在在哪个目录** | **本地：**<br><code>mkdir -p "B:/OPC-Distance_study/每周课程/06-上线运维/第33周-安全与合规/第06节课/03-练习代码/privacy-lab"</code><br><code>cd "B:/OPC-Distance_study/每周课程/06-上线运维/第33周-安全与合规/第06节课/03-练习代码/privacy-lab"</code><br>**服务器（第 2.5 步之后）：**<br><code>ssh root@你的服务器IP</code> |
| **本节新建什么** | `privacy-lab/redact.js`、`logger.js`、`server.js`<br>`数据地图.md`（八个去处）<br>`版权清单.md`（字体/图片/依赖三张表）<br>`deps-audit.md` |

## 开工前先跑这一条

确认你没站错地方：

```bash
node -v; echo "---"; echo "（服务器上再跑：sudo grep -c '1[3-9][0-9]\{9\}' /var/log/nginx/access.log）"
```

**应该看到：**

**本地：**

```text
v22.22.2
---
（服务器上再跑：sudo grep -c '1[3-9][0-9]\{9\}' /var/log/nginx/access.log）
```

**服务器上那条应该是 `0`。** 如果不是 0，说明访问日志里已经有手机号了，第 2.5 步要处理。

## 如果不对

**服务器那条返回一个很大的数字** → 真事故，日志里有手机号。先改 Nginx 的 `log_format`，旧日志单独删掉或脱敏。

**本地 `npm ls` 报 `missing`** → 依赖没装，`npm ci`。

---

# 第 1 步：先画一张数据地图（25 分钟）

## 1.1 为什么第一步是画图

**因为"我的数据存在哪"这个问题，80% 的人答不全。**

大多数人只知道"存在数据库里"。实际上一份用户数据至少躺在六个地方：

```text
① 数据库表里            最明显
② 数据库的备份文件      第 32 周你配的每日备份
③ Nginx 的 access.log   里面有你所有的 URL 和 query 参数
④ 应用日志              你 console.log 的那些
⑤ 对象存储 / 上传目录    头像、附件、身份证照片
⑥ 第三方                模型 API（你发给它的对话）、短信服务（手机号）
```

**第 ③ 和第 ⑥ 是最容易被忘的两个。**

`access.log` 里如果 URL 长这样，你就已经泄露了：

```text
GET /api/user?phone=13800138000&idcard=110101199001011234
```

**第三方那边：** 你把用户对话发给了模型 API。这算不算"向第三方提供个人信息"？在合规视角里，算。

## 1.2 建一个数据地图文件

**操作：**

1. 进 `第06节课/03-练习代码/`；
2. 新建 `数据地图.md`；
3. 照下面这张表填（先照抄，再改成你自己的真实情况）。

```markdown
# 数据地图

| # | 存在哪 | 存了什么字段 | 谁能读 | 保留多久 | 怎么删 |
|---|---|---|---|---|---|
| 1 | SQLite `data/app.db` 的 `users` 表 | id, phone, password_hash, created_at | 应用 | 永久 | DELETE 语句 |
| 2 | 同上 `messages` 表 | user_id, role, content | 应用 | 永久 | 按 user_id 删 |
| 3 | `backups/` 每日备份 | 上面全部的副本 | 只有我（chmod 600） | 7 天 | 到期自动覆盖 |
| 4 | `/var/log/nginx/access.log` | IP、URL、query、UA | root | 14 天（logrotate） | 轮转后删除 |
| 5 | pm2 日志 | console.log 的内容 | 我 | 10 天 | `pm2 flush` |
| 6 | `storage/uploads/` | 头像文件名、大小 | 应用（走鉴权） | 永久 | 删文件 + 删记录 |
| 7 | 模型 API 提供方 | 用户对话内容 | 对方 | 按对方政策 | 无法删除 |
| 8 | 短信服务商 | 手机号 | 对方 | 按对方政策 | 无法删除 |
```

**逐列读：**

| 列 | 为什么必须有 |
|---|---|
| 存在哪 | 你要能指着具体路径说出来，不能写"数据库里" |
| 存了什么字段 | 这是"最小必要"的检查依据 |
| 谁能读 | 决定你要不要加密、要不要权限 |
| 保留多久 | **没有期限的数据 = 无限责任** |
| 怎么删 | 用户提删除请求时你照着做 |

## 1.3 一个必须接受的结论

**看这张表，第 7 和第 8 行是"无法删除"的。**

这不是你的错，是现实：**你一旦把数据发给第三方，就失去了对它的一部分控制。**

所以正确的做法不是"承诺删干净"，而是：

```text
① 只发必须发的内容（不要把用户手机号拼进 prompt）
② 选明确承诺"不用于训练"的 API
③ 在隐私政策里写清楚"我们会把对话内容发送给模型服务方"
```

> **最危险的一句话是"我们会严格保密"。** 你做不到"严格"，你只能做到"说清楚"。**说清楚是法律要求，也是唯一能保护你的做法。**

## 1.4 检查你的 access.log

**在服务器上（不是本地）：**

```bash
sudo head -20 /var/log/nginx/access.log
```

**应该看到类似：**

```text
47.98.xx.xx - - [16/Nov/2026:10:12:03 +0800] "GET /api/messages?limit=20 HTTP/1.1" 200 1832 "-" "Mozilla/5.0"
```

**逐段读：**

| 段 | 意思 | 有没有隐私 |
|---|---|---|
| `47.98.xx.xx` | 来访 IP | **算个人信息**（能定位到具体宽带） |
| `[16/Nov/2026:10:12:03 +0800]` | 时间 | 组合起来能分析行为 |
| `GET /api/messages?limit=20` | 请求行 | **如果 query 里有手机号，就是事故** |
| `200 1832` | 状态码 + 字节数 | 无关 |
| `Mozilla/5.0` | UA | 弱识别信息 |

**现在自己搜一遍：**

```bash
sudo grep -o "?[^ ]*phone=[^& ]*" /var/log/nginx/access.log | head
```

**如果搜出东西，立刻改成 POST。**

**为什么：** GET 的 query 一定会进日志，POST 的 body 不会。

> **这是一条硬规则：手机号、身份证、token，永远不许出现在 URL 里。**
>
> 它会被记进四个地方：Nginx 日志、浏览器历史、CDN / 代理日志、以及通过 `Referer` 头带到第三方站点。

## 1.5 一条顺带的检查

**看看你的日志文件现在多大：**

```bash
sudo du -sh /var/log/nginx/
```

**应该看到类似：**

```text
86M     /var/log/nginx/
```

**如果超过 1GB，说明 logrotate 没配好或者根本没装。**

```bash
cat /etc/logrotate.d/nginx
```

**应该看到类似：**

```text
/var/log/nginx/*.log {
        daily
        rotate 14
        ...
}
```

**`rotate 14` = 保留 14 天。** 没有这个文件 = 日志会一直涨到磁盘满。

---

# 第 2 步：日志脱敏（30 分钟）

## 2.1 先看你自己写了什么

**在你的项目里搜：**

```bash
grep -rn "console.log" server.js | head -30
```

**典型的坏日志长这样：**

```js
console.log("登录请求", req.body);                      // 里面有 password
console.log("用户信息", req.user);                      // 里面有 phone
console.log("调用模型", messages);                      // 里面有完整对话
console.log("数据库错误", err);                         // 里面可能有 SQL 和参数值
console.log("headers", req.headers);                    // 里面有 Cookie / Authorization
```

**这五行里，至少三行是事故。**

## 2.2 一个最小的脱敏函数

**在 `privacy-lab/` 里新建 `redact.js`：**

```js
// 字段名命中这些，一律打码
const SENSITIVE_KEYS = [
  "password", "passwd", "pwd",
  "token", "access_token", "refresh_token", "authorization",
  "cookie", "set-cookie",
  "secret", "api_key", "apikey",
  "phone", "mobile", "tel",
  "idcard", "id_card", "idnumber", "idnumber",
  "bankcard", "card_no",
  "email",
];

// 保留前 3 后 4，中间用 *
function maskValue(v) {
  const s = String(v);
  if (s.length <= 7) return "***";
  return s.slice(0, 3) + "*".repeat(Math.max(4, s.length - 7)) + s.slice(-4);
}

function redact(obj, depth = 0) {
  // 防止循环引用和过深
  if (depth > 4) return "[DEPTH_LIMIT]";
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((x) => redact(x, depth + 1));

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      out[k] =
        typeof v === "string" || typeof v === "number"
          ? maskValue(v)
          : "[REDACTED]";
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

module.exports = { redact, maskValue };
```

**逐段读：**

| 段 | 作用 | 为什么这么写 |
|---|---|---|
| `SENSITIVE_KEYS` | 敏感字段名单 | 用"包含"匹配，`userPhone`、`old_password` 都能命中 |
| `maskValue` | 打码规则 | 保留前后几位，出问题时还能核对是哪一个 |
| `depth > 4` | 防递归炸栈 | 有循环引用的对象会直接让 Node 崩掉 |
| `Array.isArray` | 数组单独处理 | 否则数组会被转成 `{"0":...,"1":...}`，字段时间全丢 |
| `includes` 而不是 `===` | 宽松匹配 | **宁可多打码，不可漏一个** |

**为什么不全打码：**

```text
全打码 → 出问题时你无法核对"这条日志说的是不是这个用户"
保留前 3 后 4 → 能核对，但拿到手也没法直接用
```

## 2.3 接进你的日志

**建 `logger.js`：**

```js
const { redact } = require("./redact");

function logInfo(msg, meta) {
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      level: "info",
      msg,
      ...(meta ? { meta: redact(meta) } : {}),
    })
  );
}

function logError(msg, err) {
  console.error(
    JSON.stringify({
      t: new Date().toISOString(),
      level: "error",
      msg,
      err: {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
      },
    })
  );
}

module.exports = { logInfo, logError };
```

**用起来：**

```js
const { logInfo } = require("./logger");

app.post("/api/login", (req, res) => {
  logInfo("login_attempt", { body: req.body, ip: req.ip });
  // ...
});
```

**跑一次，看输出：**

```bash
curl -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"MyPass123"}'
```

**应该看到：**

```json
{"t":"2026-11-16T02:15:00.000Z","level":"info","msg":"login_attempt","meta":{"body":{"phone":"138****8000","password":"***"},"ip":"127.0.0.1"}}
```

**逐字段读：**

| 字段 | 值 | 为什么这样 |
|---|---|---|
| `phone` | `138****8000` | 保留前后，够核对，不足以直接用 |
| `password` | `***` | 长度 ≤ 7，全打码 |
| `ip` | `127.0.0.1` | 本地调试无所谓；生产要考虑是否保留完整 IP |

## 2.4 一个反直觉的点：日志不是越少越好

**完全不打日志，出问题时你什么都查不到。**

正确的取舍：

```text
✅ 打：请求 id、用户 id、接口名、耗时、状态码、错误类型
❌ 不打：密码、token、Cookie、完整手机号、完整身份证、完整对话内容
⚠️ 谨慎打：完整 IP（合规上算个人信息）、User-Agent
```

**关键区分：**

```text
"谁做的"（user_id）        —— 要打，这是排障的锚点
"他调了哪个接口"（path）    —— 要打
"他填了什么"（参数值）      —— 大部分不打
```

## 2.5 Nginx 日志也要处理

**URL 里的 query 会自动进日志。** 两条路：

**路一（首选）：把敏感参数从 GET 改成 POST。** 根子上不产生。

**路二：Nginx 里只记 `$uri`，不记 `$request`。**

```nginx
# /etc/nginx/nginx.conf 的 http 块里
log_format main_clean '$remote_addr - $remote_user [$time_local] '
                      '"$request_method $uri $server_protocol" '
                      '$status $body_bytes_sent "$http_user_agent"';

access_log /var/log/nginx/access.log main_clean;
```

**逐个变量读：**

| 变量 | 是什么 | 和 `$request` 的区别 |
|---|---|---|
| `$request` | 完整请求行，含 `?query` | **有敏感参数风险** |
| `$uri` | 只有路径，不含 query | **安全** |
| `$request_method` | GET / POST | 安全 |
| `$server_protocol` | HTTP/1.1 | 安全 |
| `$http_user_agent` | 浏览器标识 | 弱识别信息 |

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**应该看到：**

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**改完之后验证：**

```bash
curl "http://你的域名/api/test?phone=13800138000"
sudo tail -1 /var/log/nginx/access.log
```

**应该看到：**

```text
47.98.xx.xx - - [16/Nov/2026:10:30:00 +0800] "GET /api/test HTTP/1.1" 200 12 "curl/8.5.0"
```

**`phone=...` 不见了。**

> **注意一个细节：** 上面这条 `tail` 打的是**新写入的行**。已经写进去的旧日志里，手机号还在。**这就是为什么"改配置"救不了历史数据 —— 历史要单独处理（删掉旧日志，或者脱敏后归档）。**

## 2.6 日志保留期建议

| 日志 | 保留 | 理由 |
|---|---|---|
| Nginx access | 14 天 | 够查一次事故，不够拼出长期行为画像 |
| 应用 error | 30 天 | 排障需要 |
| 应用 info | 7—14 天 | 量大，价值快速衰减 |
| **审计日志（谁删了什么）** | **6 个月以上** | **纠纷时要能举证** |

> **区分"技术日志"和"审计日志"。**
>
> 技术日志为了排错，可以短，可以随便滚。**审计日志为了"证明某件事发生过"，要长，而且不能改。**
>
> 你的 `/api/me` 删除接口、后台改价、给人授权，这些都该写审计日志。

---

# 第 3 步：可导出、可删除（35 分钟）

## 3.1 为什么这两个接口是硬要求

**因为用户问"你们存了我什么"和"帮我删掉"的时候，你必须能在一天内答出来、做出来。**

做不到的后果不是"体验差"，是**违规**。

```text
用户：帮我删掉我的账号和所有数据。
你：好的。（然后只删了 users 表的一行，messages 还在，备份里还有，日志里还有）
用户：投诉。
```

**这不是技术问题，是"你有没有认真做过一次"的问题。**

## 3.2 导出接口

**建 `privacy-lab/export.js`：**

```js
// GET /api/me/export —— 导出我这个人的全部数据
app.get("/api/me/export", requireLogin, async (req, res) => {
  const uid = req.user.id;

  const account = await db.get(
    "SELECT id, phone, nickname, created_at FROM users WHERE id = ?",
    [uid]
  );
  const messages = await db.all(
    "SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY id",
    [uid]
  );
  const uploads = await db.all(
    "SELECT original_name, size, created_at FROM uploads WHERE user_id = ?",
    [uid]
  );

  const payload = {
    exported_at: new Date().toISOString(),
    account,
    messages,
    uploads,
    // 明确告诉用户：哪些东西我们给不了
    not_included: [
      "服务器访问日志（含你的 IP，保留 14 天后自动删除）",
      "已发送给模型服务方的对话内容（由对方按其政策处理）",
      "加密备份中的历史副本（7 天内随备份轮转删除）",
    ],
  };

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="my-data-${uid}.json"`
  );
  res.json(payload);
});
```

**逐段读：**

| 段 | 为什么 |
|---|---|
| 显式列出列名 | **绝不能 `SELECT *`**，否则 `password_hash` 就导出去了 |
| `not_included` | 最有价值的一段。老实说给不了的，比假装全给了安全 |
| `Content-Disposition: attachment` | 强制下载，不在浏览器里渲染（防 XSS） |
| 文件名带 uid | 用户下多次不会覆盖 |

## 3.3 删除接口

```js
// DELETE /api/me —— 真删，不是打个标记
app.delete("/api/me", requireLogin, async (req, res) => {
  const uid = req.user.id;

  // 1. 先查清有哪些上传文件要删
  const files = await db.all(
    "SELECT stored_name FROM uploads WHERE user_id = ?",
    [uid]
  );

  // 2. 数据库：显式删每一张有关联的表
  await db.run("DELETE FROM messages WHERE user_id = ?", [uid]);
  await db.run("DELETE FROM uploads  WHERE user_id = ?", [uid]);
  await db.run("DELETE FROM users    WHERE id = ?", [uid]);

  // 3. 磁盘上的文件
  for (const f of files) {
    await fs.promises
      .unlink(path.join("storage/uploads", f.stored_name))
      .catch(() => {});
  }

  // 4. 记一条审计（只记"谁在什么时候删了"，不记内容）
  auditLog("account_deleted", { uid, at: new Date().toISOString() });

  res.json({
    ok: true,
    deleted: { messages: "all", uploads: files.length, account: true },
    note: "备份中的副本将在 7 天内随备份轮转删除。",
  });
});
```

**这里有三个坑，每个都真实存在：**

| 坑 | 现象 | 怎么处理 |
|---|---|---|
| 只删 `users` 表 | `messages` 变成孤儿数据，还留着 | 显式删每一张有关联的表 |
| 只删数据库不删文件 | 磁盘上还躺着用户的身份证照片 | 先查文件名，再 `unlink` |
| 备份里还在 | 用户说"你根本没删" | 在回复里说清"7 天内随备份轮转消失" |

**关于备份，有三个选择：**

```text
① 老实说"7 天内消失"（推荐）
   成本零，说法诚实。绝大多数客户接受这个。

② 立刻重做一次备份并删旧的
   成本高（要停服或做快照），除非合同明确要求。

③ 备份加密，密钥单独管理，按需覆盖
   高级做法，第 34 周私有化部署会用到。
```

## 3.4 验证：真删了吗

**这是这一节最重要的动作。不验证就等于没做。**

```bash
# 1. 删除前，记下条数
sqlite3 data/app.db "SELECT COUNT(*) FROM messages WHERE user_id = 1;"
```

```text
12
```

```bash
# 2. 调删除接口
curl -X DELETE http://127.0.0.1:3000/api/me -H "Cookie: sid=..."
```

```json
{"ok":true,"deleted":{"messages":"all","uploads":1,"account":true},"note":"备份中的副本将在 7 天内随备份轮转删除。"}
```

```bash
# 3. 再查一次数据库
sqlite3 data/app.db "SELECT COUNT(*) FROM messages WHERE user_id = 1;"
sqlite3 data/app.db "SELECT COUNT(*) FROM users WHERE id = 1;"
```

```text
0
0
```

```bash
# 4. 查磁盘
ls -la storage/uploads/
```

```text
total 0
```

```bash
# 5. 查备份里还有没有（这一步用来验证你的说法是否诚实）
grep -c "13800138000" backups/*.db 2>/dev/null
```

**如果输出不是 0，说明备份里还有。**

那就必须在回复里说"备份中仍有副本，7 天后消失"，**不能说"已彻底删除"**。

> **讲真话比讲漂亮话重要。** 用户能接受"7 天后消失"，不能接受"你说删了其实没删"。

---

# 第 4 步：依赖审计（25 分钟）

## 4.1 你引进了多少别人的代码

**跑一下：**

```bash
npm ls --depth=0
```

**应该看到类似：**

```text
chat-app@1.0.0
├── better-sqlite3@11.3.0
├── dotenv@16.4.5
├── express@4.21.1
└── openai@4.68.4
```

**四个直接依赖。看起来很少。**

**再看全部：**

```bash
npm ls --all 2>/dev/null | wc -l
```

```text
214
```

**214 行 ≈ 你间接引进了 200 多个包。**

**每一个包都是"别人的代码在你的服务器上运行"。** 其中一个有洞，你就有一个洞。

## 4.2 审计

```bash
npm audit
```

**应该看到类似：**

```text
# npm audit report

body-parser  <1.20.3
Severity: high
body-parser vulnerable to denial of service ...
fix available via `npm audit fix`
node_modules/body-parser

1 high severity vulnerability

To address all issues, run:
  npm audit fix
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `body-parser <1.20.3` | 哪个包、哪个版本范围有问题 |
| `Severity: high` | 严重程度（low / moderate / high / critical） |
| `vulnerable to denial of service` | 是什么类型的洞 |
| `fix available via npm audit fix` | 有没有现成的修法 |

**如果看到 `No fix available`：** 上游还没修。你有三个选择：

```text
① 换一个包（最好的）
② 自己判断这个洞能不能被触发（需要读漏洞说明）
③ 记录在案，等上游修（最差，但有时候只能这样）
```

## 4.3 修复

```bash
# 先看会改什么，不要直接跑
npm audit fix --dry-run
```

**应该看到：**

```text
added 0 packages, removed 0 packages, changed 3 packages in 2s
```

```bash
# 真跑
npm audit fix
```

**跑完再查：**

```bash
npm audit
```

```text
found 0 vulnerabilities
```

**如果还剩下需要破坏性升级的：**

```bash
npm audit fix --force
```

> **⚠️ `--force` 会做 major 版本升级，可能直接把你的代码搞坏。**
>
> 跑之前**先 commit**。跑完必须真的把应用跑一遍，不能只看 `audit` 归零。

## 4.4 记录你决定不修的

**有些洞你选择不修，这是合理的。但必须记下来。**

**建 `deps-audit.md`：**

```markdown
# 依赖审计记录

审计日期：2026-11-16
命令：npm audit

| 包 | 严重度 | 漏洞类型 | 我的处理 | 理由 | 复查日期 |
|---|---|---|---|---|---|
| body-parser | high | DoS | 已升级到 1.20.3 | 有现成修法 | — |
| some-pkg | moderate | ReDoS | 不修 | 该功能未对外开放，无法触发 | 2027-02-16 |
```

**为什么必须记：**

```text
① 三个月后你会忘了为什么不修
② 客户或甲方问"你的依赖安全吗"，你有东西给他看
③ 复查日期到了，逼你重新评估
```

## 4.5 定期跑，不要靠记得

**加一个 npm script：**

```json
{
  "scripts": {
    "audit": "npm audit --audit-level=high"
  }
}
```

**然后接进第 30 周的 CI：**

```yaml
      - name: 依赖审计
        run: npm audit --audit-level=high
```

**`--audit-level=high` 的意思是"只让 high 及以上失败"。** moderate 不阻塞，避免因为一个边角包的提示天天红。

> **靠记得跑 → 你一定会在忙的时候跳过。放进 CI → 每次 push 都跑，忘了也会跑。**

---

# 第 5 步：版权——字体、图片、依赖协议（25 分钟）

## 5.1 三样东西最容易出事

```text
① 字体：你在 CSS 里写 font-family: "微软雅黑"，感觉没问题
② 图片：百度图片搜一张"商务背景"，右键保存，传到服务器
③ 依赖协议：某个 npm 包是 AGPL，你把它用在闭源产品里
```

**三样的共同点：都是"你根本没意识到自己在用别人的东西"。**

## 5.2 字体

**能免费商用的中文字体（这几个够用了）：**

| 字体 | 协议 | 商用 | 备注 |
|---|---|---|---|
| 思源黑体 / 思源宋体（Source Han） | SIL OFL 1.1 | ✅ | Adobe + Google 出品，最稳 |
| 阿里巴巴普惠体 | 官方免费商用 | ✅ | 阿里授权，可商用 |
| 霞鹜文楷 | SIL OFL 1.1 | ✅ | 手写风格 |
| 得意黑 | SIL OFL 1.1 | ✅ | 标题字体 |
| 微软雅黑 | 微软授权 | ❌ 需授权 | 系统字体，不代表能嵌到网页 |
| 苹方 | 苹果授权 | ❌ | 同上 |
| 方正 / 汉仪 / 文鼎 系列 | 商业授权 | ❌ | 侵权索赔重灾区 |

> **最常见的误解：Windows 里有这个字体，我就能用。**
>
> **不对。** 系统字体授权的是"在系统里显示"，不是"嵌入网页分发给所有人"。**网页里嵌字体 = 分发字体文件。**

**安全的三种写法：**

```css
/* ❌ 危险：把商业字体排第一位，用户机器有就用了 */
font-family: "微软雅黑", "PingFang SC", sans-serif;

/* ✅ 安全：用系统通用族，让浏览器自己选，你不分发任何文件 */
font-family: system-ui, -apple-system, "Segoe UI", sans-serif;

/* ✅ 更安全：自己托管开源字体，协议原文存好 */
@font-face {
  font-family: "SourceHanSans";
  src: url("/fonts/SourceHanSansSC-Regular.woff2") format("woff2");
  font-display: swap;
}
```

**`system-ui` 这条最省事。** 中文会落到用户操作系统的默认中文字体，你一个字体文件都不分发，就没有授权问题。

## 5.3 图片

| 来源 | 能商用吗 | 要注意什么 |
|---|---|---|
| Unsplash | ✅ 免费商用 | 不能拿原图直接转卖；不能用于暗示名人代言 |
| Pexels | ✅ 免费商用 | 同上 |
| Pixabay | ✅ 免费商用 | 同上 |
| 百度/谷歌图片搜出来的 | ❌ **不能** | 99% 有版权，只是暂时没人来要 |
| 站酷海洛 / 视觉中国 | 💰 付费 | 必须买授权，留好凭证 |
| AI 生成的图 | ⚠️ 看平台条款 | 商用前读你用的那个平台的条款 |

**最危险的一类：** 客户给你一张图说"用这个"。

**你必须问一句"这张图是您有授权的吗？"** 出事了责任在你（是你交付的）。

**留证据（`版权清单.md`）：**

```markdown
# 版权清单

## 字体
| 字体 | 来源 | 协议 | 授权凭证 |
|---|---|---|---|
| 思源黑体 | Adobe 官网下载 | SIL OFL 1.1 | assets/license/OFL.txt |

## 图片
| 用途 | 来源 | 链接 | 授权 | 下载日期 |
|---|---|---|---|---|
| 首页 banner | Unsplash | unsplash.com/photos/xxx | Unsplash License | 2026-11-10 |

## 依赖
| 包 | 版本 | 协议 | 允许闭源商用 |
|---|---|---|---|
| express | 4.21.1 | MIT | ✅ |
| better-sqlite3 | 11.3.0 | MIT | ✅ |
```

## 5.4 依赖协议：MIT 不是唯一的

**跑一下看你的依赖都用什么协议：**

```bash
npx license-checker --summary
```

**如果不想装东西，也可以手工查关键的：**

```bash
node -e "['express','better-sqlite3','openai'].forEach(p=>console.log(p, require(p+'/package.json').license))"
```

**应该看到：**

```text
express MIT
better-sqlite3 MIT
openai Apache-2.0
```

**四种常见协议，你只需要记住这个区别：**

| 协议 | 你能闭源吗 | 你要做什么 | 典型代表 |
|---|---|---|---|
| **MIT** | ✅ 可以 | 保留版权声明 | express、react |
| **Apache-2.0** | ✅ 可以 | 保留声明 + 专利授权条款 | TypeScript、Kubernetes |
| **GPL-2.0 / 3.0** | ⚠️ **你的整个项目也要开源** | 传染 | MySQL 社区版、部分工具 |
| **AGPL-3.0** | ⚠️ **网络服务也要开源** | 比 GPL 更狠 | 早期 MongoDB |

> **`GPL` 和 `AGPL` 的区别就一句话：GPL 管"分发软件"，AGPL 管"通过网络提供服务"。**
>
> 你做的正好是"网络服务"。**所以对一个闭源 SaaS 来说，AGPL 的包是最危险的。**

**遇到了怎么办：**

```text
① 换一个协议宽松的替代品（首选）
② 找作者买商业授权（有些项目双协议）
③ 不用它，自己实现（最贵）
④ 开源你的项目（通常不可能）
```

**实操检查：**

```bash
npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;CC0-1.0;Unlicense"
```

**如果报错，说明你有不允许的协议：**

```text
Error: Package(s) using disallowed license: some-package@1.0.0 (GPL-3.0)
```

**这一条也该写进 CI。** 比"我记得检查"可靠。

## 5.5 一张表收口

**`版权清单.md` 的最后，加一段自检：**

```markdown
## 自检

- [ ] 网站里用的每一个字体，都在上表里，都有协议依据
- [ ] 网站里用的每一张图，都在上表里，都有来源链接
- [ ] 我的依赖里没有 GPL / AGPL（或已处理）
- [ ] 客户给我的素材，我问过"您有授权吗"
- [ ] 授权凭证（协议原文、购买记录）都存在 assets/license/
```

---

# 第 6 步：故意犯七个错（30 分钟）

## 错误 1：以为"删除账号"就是删 `users` 一行

**操作：**

```js
app.delete("/api/me", requireLogin, async (req, res) => {
  await db.run("DELETE FROM users WHERE id = ?", [req.user.id]);
  res.json({ ok: true });
});
```

**会怎样：** 接口返回 200，用户以为删干净了。

**查一下：**

```bash
sqlite3 data/app.db "SELECT COUNT(*) FROM messages WHERE user_id = 1;"
```

```text
12
```

**为什么：**

`messages` 表没有任何约束要求它跟着 `users` 走。**数据库不会替你级联，除非你建表时写了 `ON DELETE CASCADE`。**

**怎么修（两种）：**

```js
// 方式一：显式删
await db.run("DELETE FROM messages WHERE user_id = ?", [uid]);
await db.run("DELETE FROM uploads  WHERE user_id = ?", [uid]);
await db.run("DELETE FROM users    WHERE id = ?", [uid]);
```

```sql
-- 方式二：建表时就写清
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT
);
```

> **⚠️ SQLite 的外键默认是关的。** 每个连接都要执行 `PRAGMA foreign_keys = ON;`，否则 `ON DELETE CASCADE` 一行都不会执行。
>
> 这条坑极其常见：你写了 `CASCADE`，以为生效了，其实一直没生效。

## 错误 2：脱敏函数漏了嵌套和数组

**操作：**

```js
function redact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE.includes(k) ? "***" : v;   // ❌ 只处理第一层
  }
  return out;
}
```

**会怎样：**

```js
redact({ body: { phone: "13800138000" } })
```

**输出：**

```js
{ body: { phone: '13800138000' } }
```

**手机号原样出来了。**

**为什么：** `k` 是 `"body"`，不在名单里，所以直接把 `v` 原样塞进去。**`v` 是对象，里面的 `phone` 从来没被检查过。**

**怎么查：**

```js
console.log(
  redact({
    body: { phone: "13800138000", password: "x" },
    user: { phone: "13900139000" },
    list: [{ token: "abc123456789" }],
  })
);
```

**怎么修：** 递归 + 数组单独处理（第 2.2 节的完整版）。

**判断标准：**

```text
写一个测试，把你要打日志的每一种结构都喂进去，
断言输出里不含完整的手机号 / 密码 / token。
```

## 错误 3：把 IP 当成"不算个人信息"

**操作：** 在隐私政策里写"我们只记录访问 IP，不涉及个人信息"。

**会怎样：** 这句话在合规上站不住。

**为什么：**

```text
IP + 时间 + 访问路径，三者组合起来能定位到一个具体的宽带账号。
在个人信息保护相关的执法实践里，IP 地址被认定为个人信息。
```

**怎么修（两种写法，选一种）：**

```markdown
① 短保留 + 说清楚
   "我们记录访问日志（含 IP 地址），用于排查故障和防止滥用，
    保留 14 天后自动删除。"

② 脱敏
   "我们记录访问日志，IP 地址会做掩码处理（如 47.98.xx.xx）。"
```

**Nginx 还没内置的 IP 打码变量。** 想打码就在应用层做，或者用 `map` 只保留前两段：

```nginx
map $remote_addr $masked_ip {
    ~^(\d+\.\d+)\.\d+\.\d+$  "$1.xx.xx";
    default                   "unknown";
}
```

**最省事的判断：** 你拿不准某个字段算不算，就按"算"处理。

## 错误 4：`npm audit fix --force` 把项目搞坏了

**操作：**

```bash
npm audit fix --force
```

**应该看到：**

```text
npm warn using --force Recommended protections disabled.
npm warn ERESOLVE overriding peer dependency
```

**然后启动失败：**

```bash
node server.js
```

```text
Error [ERR_REQUIRE_ESM]: require() of ES Module
B:\...\node_modules\some-pkg\index.js from server.js not supported.
Instead change the require of index.js in server.js to a dynamic import()
which is available in all CommonJS modules.
```

**为什么：**

`--force` 允许 major 升级。**major 版本意味着 breaking change。** 最典型的就是"这个包从 CJS 改成了纯 ESM"。

**怎么修：**

```bash
git checkout package.json package-lock.json
npm ci
```

**这就是"跑 `--force` 之前必须 commit"的原因。**

**正确的顺序：**

```text
① git status 确认干净
② npm audit fix --dry-run 看会改什么
③ 只做 minor / patch
④ 跑测试 + 手动验证
⑤ 需要 major 升级的，一个包一个 commit，单独验
```

## 错误 5：日志里打了整个 `req`

**操作：**

```js
app.use((req, res, next) => {
  console.log("REQ", req);     // ❌ 打整个 req 对象
  next();
});
```

**会怎样：** 日志里出现一堆东西。

```text
REQ IncomingMessage {
  ...
  headers: {
    cookie: 'sid=abc123def456...',
    authorization: 'Bearer sk-abcdef...',
    ...
  },
  ...
}
```

**为什么这是最严重的：**

```text
① Cookie 里有会话 id，拿到就能冒充用户
② Authorization 里有 API key，拿到就能刷你的账单
③ console.log 打对象时嵌套超过 2 层会显示 [Object]，
   但 headers 正好在第一层 —— 全套凭据是完整的
```

**怎么查：**

```bash
grep -rn "console.log(req)\|console.log(\"REQ\", req)" server.js
```

**怎么修：**

```js
app.use((req, res, next) => {
  logInfo("request", {
    method: req.method,
    path: req.path,
    // 只挑你需要的，不要整包打
  });
  next();
});
```

## 错误 6：`.env` 的权限是 644

**操作：** 在服务器上建 `.env`。

```bash
nano /srv/app/.env
ls -l /srv/app/.env
```

```text
-rw-r--r-- 1 root root 512 Nov 16 10:00 /srv/app/.env
```

**`-rw-r--r--` = 所有人可读。**

**为什么危险：**

```text
服务器上只要还有另一个账号（比如你以后加的 deploy 用户），
或者某个服务被攻破（跑在低权限用户下的进程），
就能直接读到你的全部密钥。
```

**怎么修：**

```bash
chmod 600 /srv/app/.env
ls -l /srv/app/.env
```

```text
-rw------- 1 root root 512 Nov 16 10:00 /srv/app/.env
```

**`600` = 只有属主可读写。**

> **顺带一条：** 备份文件、`data/*.db`、私钥文件，全该 `600`。**凡里面有密钥或用户数据的文件，默认 `600`。**

## 错误 7：以为"用了系统字体就没版权问题"

**操作：** CSS 里写：

```css
body { font-family: "微软雅黑", sans-serif; }
```

**会怎样：** 视觉上完全正常。

**为什么可能有问题：**

```text
① 用户机器上没这个字体时 fallback，样子变了（这是体验问题）
② 你为了统一，把字体文件放自己服务器上分发 —— 那就是侵权
③ 即使只写 font-family，某些商业字体的条款也限制"在网页中指定使用"
```

**怎么查你的网站有没有偷偷加载字体：**

```text
浏览器 → F12 → Network → 筛选框输入 font → 刷新页面
```

**如果有 `.woff2` / `.ttf` 请求，你就在分发字体文件。** 去查它的授权。

**怎么修：**

```css
/* 不分发文件，最安全 */
font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
```

---

# 第 7 步：写学习笔记（10 分钟）

**打开 `第06节课/02-笔记/NOTES.md` 填。**

**这一节要填的重点是三张表：**

```text
① 数据地图（六个去处，每行都有保留期和删除方式）
② 脱敏前后对比（贴真实日志行）
③ 版权清单（字体、图片、依赖）
```

**另外必须有两个"验证记录"：**

```text
① 删除接口调用前后，我查数据库和磁盘的实际输出
② npm audit 修复前后的输出
```

---

# 第 8 步：课后练习

## 练习一：把自己的项目过一遍数据地图

**要求：**

1. 不看课件，列出你项目里数据存在的**所有**位置；
2. 每一项写清：存了什么、谁能读、保留多久、怎么删；
3. 找出**你现在删不掉的那几项**。

**记录：** 完整表格。

**思考题：** 删不掉的那几项，你打算怎么处理？在隐私政策里怎么写才诚实？

## 练习二：给日志加一条"敏感词扫描"

**要求：**

1. 写一个脚本，读你的日志文件，搜出疑似敏感信息：
   - 11 位连续数字（手机号）
   - 18 位（身份证）
   - `sk-` 开头（API key）
   - `Bearer ` 后面跟长串
2. 每次部署后跑一次。

**记录：** 你的正则，和扫出来的结果（没有输出，说明脱敏做对了）。

**思考题：** 如果扫描发现日志里真有手机号，已经写进文件的那部分怎么处理？

## 练习三：做一次"用户要删号"的完整演练

**要求：**

1. 造一个测试用户，给他 3 条消息、1 个上传文件；
2. 调删除接口；
3. 用 5 条命令验证：数据库三张表、磁盘目录、备份文件；
4. 写一段"给用户的回复"，说清哪些删了、哪些 7 天后删。

**记录：** 5 条命令的输出 + 那段回复。

**思考题：** 如果用户说"我现在就要备份里的也删掉"，你怎么做？成本多大？

## 练习四：把协议检查写进 CI

**要求：**

1. 装 `license-checker`；
2. 在 `package.json` 里加一个 `license` script；
3. 在第 30 周的 workflow 里加一步；
4. 故意装一个 GPL 的包，看 CI 变红。

**记录：** 报错原文 + 你怎么处理的。

**思考题：** 如果某个必需功能只有一个 AGPL 的库能实现，你会怎么办？

## 练习五：写一份给客户看的"数据说明"

**要求：** 300 字以内，回答客户这句话：

```text
"你们这个系统，我们的数据都放在哪？会不会被别人看到？"
```

**必须包含：**

```text
① 数据存在哪台机器上（自己的还是云厂商的）
② 谁有权限访问（你、客户 IT、第三方）
③ 会发给哪些第三方（模型 API、短信）
④ 保留多久
⑤ 客户要求删除时，多久能删完
```

**思考题：** 这份说明里，哪一句你最不想写？为什么？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出三类个人信息字段（不只是手机号）
- [ ] 我知道"最小必要"是什么意思，能举一个自己项目里多收的字段
- [ ] 我知道日志里哪些该打、哪些绝对不能打
- [ ] 我知道 `rotate 14` 是什么意思，为什么日志不能永久保留
- [ ] 我知道 GPL 和 AGPL 的区别，能说出为什么 AGPL 对 SaaS 更危险
- [ ] 我知道"系统里有这个字体"不等于"能在网页里用"

## B. 实操

- [ ] 我有一份数据地图，六行以上，每行都有保留期和删除方式
- [ ] 我有一个脱敏函数，嵌套对象和数组都测过
- [ ] 我验证过日志输出里没有完整手机号和密码
- [ ] Nginx 日志用的是 `$uri` 不是 `$request`（或敏感参数已改 POST）
- [ ] 我做了 `/api/me/export`，能下载自己的数据，且不含 `password_hash`
- [ ] 我做了 `/api/me` 删除接口，且用 5 条命令验证过真的删了
- [ ] `npm audit` 是 0（或有记录的例外）
- [ ] 我的依赖里没有未处理的 GPL / AGPL

## C. 排错

- [ ] 我知道 `ERR_REQUIRE_ESM` 是 `--force` 升级带来的
- [ ] 我知道 `No fix available` 时该怎么办
- [ ] 我知道 SQLite 的 `ON DELETE CASCADE` 默认不生效
- [ ] 我知道 644 和 600 的区别，知道 `.env` 该用哪个

## D. 交付

- [ ] `数据地图.md` 写完
- [ ] `版权清单.md` 写完，有字体、图片、依赖三张表
- [ ] `deps-audit.md` 写完，没修的都有理由和复查日期
- [ ] 授权凭证存在 `assets/license/`
- [ ] 有一段"给用户看的删除说明"

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 三张表都有内容
- [ ] 两个验证记录贴了真实输出
- [ ] "我还不懂的词"有内容

## 本节课要能说出口的一句话

> **用户的数据一旦进了你的系统，你就有三件事必须做到：说清它在哪、只收必须收的、说删就能真删。做不到第三件，前两件都是空话。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `npm audit` 报 `No fix available` | 上游没修 | 换包 / 评估能否触发 / 记录在案并设复查日期 |
| `npm audit fix --force` 后启动报 `ERR_REQUIRE_ESM` | major 升级把 CJS 换成 ESM | `git checkout package*.json && npm ci` |
| 删除账号后 `messages` 还在 | 没删关联表，或外键没生效 | 显式 `DELETE`，或每个连接 `PRAGMA foreign_keys = ON` |
| 脱敏后日志里还有手机号 | 只处理第一层，没递归 | 递归 + 数组单独处理，写测试断言 |
| Nginx 日志里有 `?phone=` | 用了 `$request` | 改 `$uri`，或把接口改成 POST |
| 日志文件涨到几十 GB | `rotate` 太大或没配 | 查 `/etc/logrotate.d/nginx`，设 14 天 |
| `license-checker` 报 GPL | 有传染协议依赖 | 换包 / 买授权 / 自己实现 |
| 备份里还有被删的数据 | 备份是快照 | 在回复里说清"X 天内消失"，别说"已彻底删除" |
| `.env` 是 644 | 默认权限 | `chmod 600`，备份和 db 文件同样处理 |
| 导出接口把 `password_hash` 也导了 | 用了 `SELECT *` | 显式列出允许导出的列 |
| 用户说"你们偷看聊天记录" | 你没法证明没有 | 日志脱敏 + 保留期 + 可审计的访问记录 |
| 网页字体样式和设计稿不一致 | 用户机器没那个字体 | 用 `system-ui`，或自己托管开源字体 |
| 收到字体/图片授权函 | 用了商业素材 | 立刻下架 + 换免费商用素材 + 存证据 |
| `npx license-checker` 装不上 | 网络或版本 | 改用 `node -e` 手工查关键包的 `license` 字段 |
| 删除接口很慢 | 逐个 `unlink` 大文件 | 改成异步队列（第 16 周学过），接口先返回 |
