# 第 56 节课：完整流程 + 攻击报告——把六天合成一个能交付的东西

> **这份文件是你（学员）一步一步照着做的手册。**
> 六天你写了很多零件。今天做两件事：**把它们串成一个完整流程**，然后**自己当攻击者打一遍，写一页报告。**

**建议用时**：150 分钟
**你需要先完成**：第 55 节课（六个幂等场景全过）

---

# 第 0 步：今天要交付的两样东西（10 分钟）

## 0.1 一个完整流程

**不是"七个接口各能用"，是"一条用户能走完的路"。**

```text
① 打开首页 → 未登录，跳到登录页
② 注册（邮箱 + 密码）
③ 登录（邮箱 + 密码）
④ 进应用（看到自己的数据）
⑤ 做一个受保护操作（下单，带幂等键）
⑥ 刷新页面 → 还在登录状态
⑦ 改密码 → 其他设备被踢
⑧ 登出 → 回到登录页
```

**八步全通，才算"能用"。**

**任何一步断掉，用户就走不下去。**

## 0.2 一份攻击报告

**不是"我做了安全检查"，是一页纸，写着：**

```text
我打了什么 → 结果如何 → 修了什么 → 还有什么没防住
```

**这份报告有两个用途：**

```text
① 给客户看：证明你懂安全（这是加价的理由）
② 给自己看：三个月后你还知道边界在哪
```

**"还有什么没防住"这一栏最重要。** 敢写这一栏的人，才是真懂。

## 0.3 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `public/index.html` | `public/` | 首页（未登录跳转） |
| `src/app.js` | `src/` | 补齐所有接口 + 统一错误处理 |
| `attacks/report.js` | `attacks/` | 一键跑完所有攻击 |
| `results/e07.md` | `results/` | **安全报告（今天的核心）** |
| `README.md` | `auth-lab` | 交接文档 |

---

# 第 1 步：补齐流程缺口（30 分钟）

## 1.1 检查清单

**对照 0.1 的八步，看哪一步断了。**

| 步骤 | 需要什么 | 你现在有吗 |
|---|---|---|
| ① 未登录跳转 | `/api/me` 返回 401 + 前端跳转 | 第 52 节做了 |
| ② 注册 | `POST /api/register` | 第 50 节做了 |
| ③ 登录 | `POST /api/login` | 第 52 节做了 |
| ④ 进应用 | `app.html` | 第 52 节做了 |
| ⑤ 受保护操作 | `POST /api/orders` + 幂等 | 第 55 节做了 |
| ⑥ 刷新保持登录 | Cookie | 第 52 节做了 |
| ⑦ 改密码踢人 | `token_version` | **可能没做完整** |
| ⑧ 登出 | `POST /api/logout` | 第 52 节做了 |

**第 ⑦ 步最容易缺。**

## 1.2 补齐改密码接口

**在 `app.js` 里：**

```javascript
import { changePassword } from "./users.js";

app.post("/api/password/change", requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body ?? {};

  if (typeof oldPassword !== "string" || typeof newPassword !== "string") {
    return res.status(400).json({ error: "参数不正确" });
  }

  const result = await changePassword(req.user.id, oldPassword, newPassword);

  if (!result.ok) {
    const messages = {
      NO_USER: "账号不存在",
      WRONG_OLD: "原密码不正确",
      WEAK_PASSWORD: result.errors?.join("；") || "新密码不符合要求",
    };

    return res.status(result.reason === "WRONG_OLD" ? 401 : 400).json({
      error: messages[result.reason] || "修改失败",
    });
  }

  // 关键：改完密码，当前会话也要换新 token
  // 因为 token_version 已经 +1，旧 token 失效了
  const user = findById(req.user.id);

  if (!user) {
    return res.status(500).json({ error: "账号状态异常" });
  }

  setAuthCookie(res, signToken(user));

  res.json({ message: "密码已修改，其他设备已登出" });
});
```

## 1.3 三个关键点

### 关键点一：改密码后，当前会话要重新签发

**为什么：**

```text
changePassword 让 token_version += 1
→ 当前用户的 token（ver=1）也失效了
→ 如果不重新签发，用户改完密码自己被踢出去
```

**用户会困惑："我改个密码怎么自己被踢了？"**

**所以要 `setAuthCookie(res, signToken(user))`，用新的 `ver` 换一个新 token。**

### 关键点二：其他设备的 token 自然失效

**其他设备手上的 token 是 `ver=1`，数据库里现在是 `ver=2`。**

**`requireAuth` 里的版本比对会拒绝它们。**

**不需要"主动通知其他设备"（那需要 WebSocket，第 17 周才有）。**

**用户下次操作时自然拿到 401，前端跳登录页。**

### 关键点三：`WRONG_OLD` 返回 401 不是 400

**为什么：**

```text
400 = 请求格式有问题（缺字段、类型错）
401 = 身份验证失败（原密码不对）
```

**原密码不对，是"你的身份没被确认"，属于 401。**

**这个细节让前端能区分"表单填错了"和"密码错了"。**

## 1.4 建首页 `public/index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>auth-lab</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      max-width: 620px; margin: 60px auto; padding: 0 20px;
      background: #f5f6f8; color: #16181d;
    }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .sub { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    a.card {
      display: block; background: #fff; border: 1px solid #e5e7eb;
      border-radius: 12px; padding: 16px; text-decoration: none; color: inherit;
    }
    a.card:hover { border-color: #93b8f8; }
    a.card .t { font-weight: 600; font-size: 14px; }
    a.card .d { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .state {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
      padding: 16px; margin-bottom: 16px; font-size: 14px;
    }
    .state b { color: #15803d; }
    .state.off b { color: #6b7280; }
  </style>
</head>
<body>
  <h1>auth-lab</h1>
  <div class="sub">第 8 周：账号与防刷</div>

  <div class="state" id="state">检查登录状态……</div>

  <div class="grid">
    <a class="card" href="/register.html">
      <div class="t">注册</div>
      <div class="d">邮箱 + 密码</div>
    </a>
    <a class="card" href="/login.html">
      <div class="t">登录</div>
      <div class="d">邮箱 + 密码</div>
    </a>
    <a class="card" href="/app.html">
      <div class="t">我的应用</div>
      <div class="d">需要登录</div>
    </a>
    <a class="card" href="/pay.html">
      <div class="t">下单</div>
      <div class="d">幂等 + 限频</div>
    </a>
  </div>

  <script>
    const state = document.getElementById("state");

    fetch("/api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 401) {
          state.className = "state off";
          state.innerHTML = "当前状态：<b>未登录</b>";
          return;
        }

        const data = await response.json();
        state.className = "state";
        state.innerHTML =
          `当前状态：<b>已登录</b>　${data.user.nickname || data.user.email}` +
          `　（uid ${data.user.id}，角色 ${data.user.role}）`;
      })
      .catch(() => {
        state.className = "state off";
        state.textContent = "检查登录状态失败";
      });
  </script>
</body>
</html>
```

## 1.5 统一错误处理

**把 `app.js` 的错误处理改成能区分类型：**

```javascript
app.use((error, req, res, next) => {
  // 客户端主动断开，不记错误
  if (req.destroyed) return;

  console.error("[error]", {
    path: req.path,
    method: req.method,
    message: error.message,
    stack: CONFIG.env === "development" ? error.stack : undefined,
  });

  if (res.headersSent) return;

  // 已知的业务错误
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.userMessage || error.message });
  }

  // JSON 解析失败
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "请求体不是合法 JSON" });
  }

  // 请求体过大
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "请求体过大" });
  }

  // 其他：不泄露内部信息
  res.status(500).json({ error: "服务器内部错误" });
});
```

**四个分支的意义：**

| 分支 | 处理 |
|---|---|
| `req.destroyed` | 用户断开，不用回 |
| `error.statusCode` | 业务错误，说真话 |
| `entity.parse.failed` | 用户发了坏 JSON，400 |
| 其他 | 内部错误，只说"服务器错误" |

**最后那个分支最重要：任何内部错误的细节都不能给用户。**

---

# 第 2 步：把六个攻击脚本合成一个（30 分钟）

## 2.1 新建 `attacks/report.js`

**这是今天的核心产出。它一次跑完所有攻击，输出一张表。**

```javascript
import crypto from "node:crypto";

const BASE = "http://localhost:4030";

const results = [];

const record = (name, { safe, detail }) => {
  results.push({ 攻击: name, 结果: safe ? "✅ 防住" : "❌ 打穿", 说明: detail });
  console.log(`${safe ? "✅" : "❌"} ${name}${detail ? `：${detail}` : ""}`);
};

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const token = response.headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1];
  return { status: response.status, token: token || null, data: await response.json().catch(() => ({})) };
};

const api = async (token, path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `auth_token=${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 120) };
  }

  return { status: response.status, data, headers: Object.fromEntries(response.headers) };
};

const newKey = () => crypto.randomUUID().replace(/-/g, "");

// ============ 攻击 ============

const attackNoAuth = async () => {
  const result = await api(null, "/api/items");
  record("未登录访问受保护接口", {
    safe: result.status === 401,
    detail: `HTTP ${result.status}`,
  });
};

const attackIdor = async (aliceToken, bobToken) => {
  const bobItems = (await api(bobToken, "/api/items")).data.items || [];
  if (bobItems.length === 0) {
    record("越权读别人的数据", { safe: true, detail: "Bob 没有数据，跳过" });
    return;
  }

  const target = bobItems[0];
  const readResult = await api(aliceToken, `/api/items/${target.id}`);
  const updateResult = await api(aliceToken, `/api/items/${target.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "被越权改掉了" }),
  });
  const deleteResult = await api(aliceToken, `/api/items/${target.id}`, { method: "DELETE" });

  record("越权读别人的数据", {
    safe: readResult.status === 404,
    detail: `HTTP ${readResult.status}`,
  });
  record("越权改别人的数据", {
    safe: updateResult.status === 404,
    detail: `HTTP ${updateResult.status}`,
  });
  record("越权删别人的数据", {
    safe: deleteResult.status === 404,
    detail: `HTTP ${deleteResult.status}`,
  });
};

const attackUserEnum = async () => {
  const existing = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@example.com", password: "test1234" }),
  });

  const missing = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `nobody-${Date.now()}@example.com`, password: "test1234" }),
  });

  const existingBody = await existing.text();
  const missingBody = await missing.text();

  record("用户枚举（注册接口是否泄露邮箱存在）", {
    safe: existing.status === missing.status && existingBody.length === missingBody.length,
    detail: `已存在 HTTP ${existing.status} / 不存在 HTTP ${missing.status}`,
  });
};

const attackBruteforce = async () => {
  const attempts = 12;
  let blocked = 0;
  let firstBlockAt = null;

  for (let i = 1; i <= attempts; i += 1) {
    const result = await login("alice@example.com", `wrong-${i}`);
    if (result.status === 429) {
      blocked += 1;
      if (firstBlockAt === null) firstBlockAt = i;
    }
  }

  record("密码爆破（12 次错误密码）", {
    safe: blocked > 0,
    detail: blocked > 0 ? `第 ${firstBlockAt} 次开始被限频` : "12 次全部放行",
  });
};

const attackSmsBomb = async () => {
  const phone = `139${String(Date.now()).slice(-8)}`;
  let sent = 0;

  for (let i = 0; i < 8; i += 1) {
    const result = await api(null, "/api/sms/send", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });

    if (result.status === 200) sent += 1;
  }

  record("短信轰炸（同号码 8 次）", {
    safe: sent <= 2,
    detail: `实际发出 ${sent} 条`,
  });
};

const attackSmsGuess = async () => {
  const phone = `138${String(Date.now()).slice(-8)}`;
  await api(null, "/api/sms/send", { method: "POST", body: JSON.stringify({ phone }) });

  let attempted = 0;

  for (let i = 0; i < 10; i += 1) {
    const guess = String(100000 + i);
    const result = await api(null, "/api/sms/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code: guess }),
    });

    attempted += 1;

    if (result.data.error?.includes("次数过多")) break;
  }

  record("验证码暴力猜（10 次）", {
    safe: attempted <= 6,
    detail: `试了 ${attempted} 次后被锁`,
  });
};

const attackReplay = async (aliceToken) => {
  const key = newKey();
  const body = { itemName: "会员月卡", amount: 9900 };

  const unsafeResults = await Promise.all([
    api(aliceToken, "/api/orders/unsafe", { method: "POST", body: JSON.stringify(body) }),
    api(aliceToken, "/api/orders/unsafe", { method: "POST", body: JSON.stringify(body) }),
    api(aliceToken, "/api/orders/unsafe", { method: "POST", body: JSON.stringify(body) }),
  ]);

  const unsafeCreated = unsafeResults.filter((result) => result.status === 201).length;

  const key2 = newKey();
  const safeResults = await Promise.all([
    api(aliceToken, "/api/orders", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": key2 },
    }),
    api(aliceToken, "/api/orders", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": key2 },
    }),
    api(aliceToken, "/api/orders", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": key2 },
    }),
  ]);

  const safeOrderIds = new Set(safeResults.filter((r) => r.data.orderId).map((r) => r.data.orderId));

  record("重复提交（无幂等版，3 并发）", {
    safe: unsafeCreated <= 1,
    detail: `创建了 ${unsafeCreated} 条订单`,
  });
  record("重复提交（幂等版，3 并发）", {
    safe: safeOrderIds.size === 1,
    detail: `唯一 orderId ${safeOrderIds.size} 个`,
  });
};

const attackStaticLeak = async () => {
  const envResult = await api(null, "/.env");
  const dbResult = await api(null, "/data/app.db");

  record("静态目录泄露 .env", {
    safe: envResult.status === 404,
    detail: `HTTP ${envResult.status}`,
  });
  record("静态目录泄露数据库", {
    safe: dbResult.status === 404,
    detail: `HTTP ${dbResult.status}`,
  });
};

const attackTokenTamper = async (aliceToken) => {
  if (!aliceToken) {
    record("篡改 JWT", { safe: true, detail: "无法登录，跳过" });
    return;
  }

  const parts = aliceToken.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

  payload.role = "admin";
  payload.uid = 2;

  const tampered = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${parts[2]}`;
  const result = await api(tampered, "/api/me");

  record("篡改 JWT payload（改成 admin）", {
    safe: result.status === 401,
    detail: `HTTP ${result.status}`,
  });
};

const attackBodySize = async () => {
  const big = "x".repeat(200000);
  const result = await api(null, "/api/register", {
    method: "POST",
    body: JSON.stringify({ email: "big@example.com", password: "test1234", nickname: big }),
  });

  record("超大请求体（200KB）", {
    safe: result.status === 413 || result.status === 400,
    detail: `HTTP ${result.status}`,
  });
};

// ============ 主流程 ============

const main = async () => {
  console.log("=== 安全攻击测试报告 ===\n");
  console.log(`目标：${BASE}`);
  console.log(`时间：${new Date().toISOString()}\n`);

  const alice = await login("alice@example.com", "test1234");
  const bob = await login("bob@example.com", "test1234");

  if (!alice.token) {
    console.error("❌ 无法登录 alice，请先跑 npm run db:seed");
    process.exitCode = 1;
    return;
  }

  await attackNoAuth();
  await attackIdor(alice.token, bob.token);
  await attackUserEnum();
  await attackBruteforce();
  await attackSmsBomb();
  await attackSmsGuess();
  await attackReplay(alice.token);
  await attackStaticLeak();
  await attackTokenTamper(alice.token);
  await attackBodySize();

  console.log("\n===== 汇总 =====");
  console.table(results);

  const total = results.length;
  const passed = results.filter((item) => item.结果 === "✅ 防住").length;
  const failed = results.filter((item) => item.结果 === "❌ 打穿");

  console.log(`\n共 ${total} 项，防住 ${passed} 项，打穿 ${failed.length} 项`);
  console.log(`防护率：${((passed / total) * 100).toFixed(0)}%`);

  if (failed.length > 0) {
    console.log("\n❌ 未防住的：");
    failed.forEach((item) => console.log(`  - ${item.攻击}：${item.说明}`));
    process.exitCode = 1;
  } else {
    console.log("\n✅ 全部防住。");
  }
};

main().catch((error) => {
  console.error("报告失败：", error.message);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "attack:report": "node attacks/report.js"
```

## 2.2 跑

**先确保服务在跑，数据已 seed。**

```text
npm run db:seed
npm run attack:report
```

**你会看到一张表，大约 14 项。**

## 2.3 预期结果

| 攻击 | 预期 |
|---|---|
| 未登录访问 | ✅ 401 |
| 越权读 | ✅ 404 |
| 越权改 | ✅ 404 |
| 越权删 | ✅ 404 |
| 用户枚举 | ✅ 响应一致 |
| 密码爆破 | ✅ 被限频 |
| 短信轰炸 | ✅ 只发 1-2 条 |
| 验证码暴力猜 | ✅ 6 次内锁定 |
| 重复提交（漏洞版） | ❌ 3 条（这是故意的） |
| 重复提交（幂等版） | ✅ 1 个 orderId |
| `.env` 泄露 | ✅ 404 |
| 数据库泄露 | ✅ 404 |
| 篡改 JWT | ✅ 401 |
| 超大 body | ✅ 413 |

**注意"重复提交（漏洞版）"应该显示 ❌。**

**这是故意的 —— 它证明"这个漏洞真的存在"，也证明你的测试是有效的。**

**如果全部都是 ✅，反而要怀疑你的测试写错了。**

**所以你跑完之后，把 `/api/orders/unsafe` 这个接口删掉，然后从报告里去掉这一项。**

**留下的报告应该 13 项全绿。**

---

# 第 3 步：写安全报告（40 分钟）

**这是今天的核心产出。不是代码。**

## 3.1 新建 `results/e07.md`

```markdown
# auth-lab 安全报告

**日期**：2026-11-16
**范围**：注册、登录、会话、权限、限频、幂等
**方法**：自建攻击脚本（`npm run attack:report`）

---

## 一、结论

共测试 **13** 项攻击，**13** 项防住，防护率 **100%**。

**但这个 100% 只覆盖我测过的 13 项。** 第五节列出了我知道但没防的。

---

## 二、攻击与结果

| # | 攻击 | 方法 | 结果 | 依据 |
|---|---|---|---|---|
| 1 | 未登录访问 | 不带 Cookie 请求 `/api/items` | 401 | 中间件拦截 |
| 2 | 越权读 | Alice 的 Cookie 读 Bob 的 item | 404 | `WHERE id=? AND user_id=?` |
| 3 | 越权改 | Alice PATCH Bob 的 item | 404 | 同上 |
| 4 | 越权删 | Alice DELETE Bob 的 item | 404 | 同上 |
| 5 | 用户枚举 | 对比"已注册/未注册"邮箱的响应 | 完全一致 | 统一返回"注册成功" |
| 6 | 密码爆破 | 12 次错误密码 | 第 N 次起 429 | 限频 5 次/分钟 |
| 7 | 短信轰炸 | 同号码连发 8 次 | 只发 1 条 | 号码限 1 次/分钟 |
| 8 | 验证码暴力猜 | 连猜 10 次 | 5 次后锁 | `attempts >= 5` |
| 9 | 重复提交 | 3 并发同一请求 | 1 条订单 | 幂等键唯一索引 |
| 10 | 静态泄露 | 请求 `/.env` | 404 | 静态目录只到 `public/` |
| 11 | 数据库泄露 | 请求 `/data/app.db` | 404 | 同上 |
| 12 | 篡改 JWT | 改 payload 里 role 为 admin | 401 | 签名校验失败 |
| 13 | 超大请求体 | 200KB | 413 | `express.json({limit:'64kb'})` |

---

## 三、关键设计（为什么能防住）

### 1. 唯一性交给数据库

```sql
email TEXT NOT NULL UNIQUE
CREATE UNIQUE INDEX uniq_idem_key ON idempotency_keys(key, user_id, endpoint)
```

**不靠代码里的 `if`。** 并发下"先查再写"不可靠。

### 2. 归属写进 WHERE，不写在 if 里

```sql
SELECT * FROM items WHERE id = ? AND user_id = ?
```

**数据从未离开数据库就被过滤掉了。**

### 3. 不是你的数据返回 404，不是 403

**403 等于确认"这条数据存在"。**

### 4. 密码哈希、验证码也哈希

**bcrypt(密码) + SHA-256(验证码 + token)。**

**日志里永远没有明文。**

### 5. 限频三个维度叠加

```text
IP 10 次/分钟 + 号码 1 次/分钟 + 号码 10 次/天
```

**只做一个维度，攻击者换个维度就绕过了。**

### 6. HttpOnly Cookie + 版本号

**JS 读不到 token（防 XSS 窃取）。**

**`token_version` 让改密码能踢掉所有设备。**

---

## 四、实测数字

| 指标 | 值 |
|---|---|
| 同号码连发 8 次，实际发出 | 1 条 |
| 15 个不同号码（同 IP） | 9 条后被 IP 限 |
| 验证码最多可试 | 5 次 |
| 漏洞版 3 并发创建 | 3 条订单 |
| 幂等版 3 并发创建 | 1 条订单 |
| SHA-256 vs bcrypt 速度差 | 约 ___ 倍 |

---

## 五、已知未防（重要）

**这一节比上面所有内容都重要。**

| # | 未防的 | 后果 | 什么时候做 |
|---|---|---|---|
| 1 | 没有 CSRF token | 恶意网站能诱导用户提交表单（`SameSite=Lax` 挡了 POST，但 GET 侧信道还在） | 第 26 周 |
| 2 | 内存限频多进程失效 | `pm2 -i 4` 时限额翻 4 倍 | 第 29 周换 Redis |
| 3 | 没有图形验证码 | 自动化脚本能过短信接口（只有限频挡） | 第 26 周 |
| 4 | 密码不在"已泄露密码库"里查 | 用户能用已知泄露的密码 | 第 26 周（HIBP API） |
| 5 | 没有双因素认证 | 密码泄露即账号失守 | 不做（小项目过度设计） |
| 6 | 没有审计日志 | 出事后查不到谁做了什么 | 第 9 周（操作日志） |
| 7 | 没有 IP 黑名单 | 持续攻击时只能靠限频 | 第 33 周 |
| 8 | HTTPS 未启用 | Cookie 在 HTTP 下明文传输 | 第 31 周 |
| 9 | 没有账号锁定 | 撞库只能靠限频拖慢 | 视需求 |

---

## 六、交付清单

- [x] 注册 / 登录 / 登出 / 改密码 / 重置密码
- [x] 密码 bcrypt 哈希（10 轮）
- [x] HttpOnly Cookie + JWT（7 天）
- [x] 数据归属检查（GET/PATCH/DELETE 全覆盖）
- [x] 角色权限（`requireRole`）
- [x] 三道限频（IP / 号码 / 日限额）
- [x] 短信验证码（6 位、5 分钟、5 次上限、用后失效）
- [x] 幂等键（订单）
- [x] 攻击测试脚本（13 项）
- [x] 本报告

---

## 七、复现方法

```text
npm install
npm run db:seed        # 建 Alice / Bob 测试账号
npm run dev            # 启动服务（另一个终端）
npm run attack:report  # 跑全部攻击
```
```

## 3.2 第五节为什么最重要

**"已知未防"这一栏，是区分"懂"和"不懂"的地方。**

**不懂的人会写：**

```text
"本系统已通过安全测试，无漏洞"
```

**懂的人会写：**

```text
"我测了 13 项，全防住。但我知道还有 9 项没防，分别在什么时候做。"
```

**第二句能拿下客户，第一句会被懂行的客户直接否掉。**

**因为"无漏洞"是不可能的。** 敢说这句话的人，要么不懂，要么在骗人。

## 3.3 让报告能"复现"

**报告的最后必须有"复现方法"。**

**为什么：**

```text
① 客户（或三个月后的你）能自己跑一遍验证
② 你想证明"我修好了"，跑一遍就行
③ 别人接手时，这是最快的上手方式
```

**一份不能复现的安全报告，等于一份 PPT。**

---

# 第 4 步：写交接文档（20 分钟）

## 4.1 `auth-lab/README.md`

```markdown
# auth-lab

第 8 周的练习项目：注册、登录、权限、限频、幂等。

## 启动

```text
npm install
npm run db:seed     # 建测试账号（Alice / Bob / test1234）
npm run dev         # http://localhost:4030
```

## 测试账号

| 邮箱 | 密码 | 角色 |
|---|---|---|
| alice@example.com | test1234 | admin（seed 后手动改） |
| bob@example.com | test1234 | user |

## 目录

| 文件 | 作用 |
|---|---|
| `src/config.js` | 配置 + 密钥校验（启动即崩，不悄悄用弱密钥） |
| `src/db.js` | 连接 + 迁移（`schema_migrations`） |
| `src/users.js` | 用户仓储（UNIQUE、哈希、重置 token） |
| `src/password.js` | 强度校验 + 预哈希（72 字节上限） |
| `src/auth.js` | JWT + `requireAuth` + `requireRole` |
| `src/sms.js` | 假短信 + 验证码（哈希、5 分钟、5 次） |
| `src/ratelimit.js` | 三种限频算法 |
| `src/idempotency.js` | 幂等中间件 |
| `src/items.js` | 归属检查示例（safe / unsafe 对照） |
| `attacks/` | 四个攻击脚本 + 一键报告 |
| `results/e07.md` | **安全报告** |

## 关键约定

### 1. 密码只进哈希

所有 `console.log` 遇到 `req.body` 必须先 `redact`。

### 2. 归属写进 WHERE

```javascript
db.prepare("SELECT * FROM items WHERE id = ? AND user_id = ?")
```

不许写成"先查再判断"。并发下不可靠。

### 3. 不是你的数据返回 404

403 会泄露"这条数据存在"。

### 4. 限频内存实现，单进程有效

多进程部署前必须换 Redis（第 29 周）。

### 5. 假短信在终端打印

`src/sms.js` 的 `sendSms` 换成真实服务商即可，其余代码不动。

## 已知限制

见 `results/e07.md` 第五节。**部署上线前必须逐条处理。**

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动服务 |
| `npm run db:seed` | 建测试数据 |
| `npm run db:reset` | 删库重建（**会丢数据**） |
| `npm run attack:report` | 一键跑 13 项攻击 |
| `npm run test:auth` | 七条安全回归测试 |
| `npm run pricing` | （第 7 周的）报价模型 |

## 下一步

第 9 周会在 `requireRole("admin")` 上建后台管理界面。
```

## 4.2 为什么交接文档重要

**三个月后你就是"别人"。**

**你会忘记：**

```text
① 为什么 `DUMMY_HASH` 要跑一次
② 为什么返回 404 不是 403
③ 为什么 `attempts` 在数据库
```

**文档里写"结论"，不写"过程"。**

**好的文档：**

```text
"归属写进 WHERE。理由：先查再判断在并发下不可靠。"
```

**坏的文档：**

```text
"这节课我们学习了权限判断……（三页）"
```

---

# 第 5 步：五个必须知道的坑（15 分钟）

## 坑 1：报告里写"无漏洞"

**这是最典型的业余表现。**

**任何系统都有未防的攻击面。**

**正确写法：**

```text
"测了 13 项，全防住。未覆盖的见第五节。"
```

**敢写"无漏洞"的人，客户一测就露。**

## 坑 2：攻击脚本依赖"服务已经跑着"

**`attack:report` 需要服务在 4030 上跑。**

**忘了启动，会看到一堆 `fetch failed`。**

**修法（练习）：脚本开头先探活：**

```javascript
try {
  const health = await fetch(`${BASE}/api/health`);
  if (!health.ok) throw new Error();
} catch {
  console.error("服务没启动，先跑 npm run dev");
  process.exit(1);
}
```

## 坑 3：测试数据被污染

**你跑了几十次攻击，数据库里有：**

```text
几十条测试订单
几个测试账号
被改坏的数据
```

**下次跑报告，数据不对。**

**修法：报告脚本末尾清理，或者每次先 `db:reset` + `db:seed`。**

**这一周的方案：报告只读不写（除了 orders），跑完手动清。**

**更好的方案（练习）：给测试数据加 `is_test` 标记，报告脚本只清这些。**

## 坑 4：`attack:report` 把 Alice 的密码改了

**报告里如果要测"改密码"，会真的改掉 Alice 的密码。**

**然后 `db:seed` 是幂等的（已存在就跳过），不会重置密码。**

**结果：你下次登录不上。**

**修法：报告不改密码，或者改完立刻改回来。**

**这一周：报告里不测改密码（第 51 节你已经单独测过）。**

## 坑 5：报告说"防住了"，但其实是"测错了"

**比如测越权时，Bob 根本没有数据 → 没有可越权的目标 → 显示"✅ 防住"。**

**这是假绿。**

**修法：脚本里要有断言：**

```javascript
if (bobItems.length === 0) {
  record("越权读别人的数据", { safe: false, detail: "⚠️ Bob 没有数据，这个测试无效" });
  return;
}
```

**"测试无效"和"测试通过"是两件事。**

**假绿的测试比没有测试更危险 —— 因为它给你虚假的安全感。**

---

# 第 6 步：故意做三个实验（10 分钟）

## 实验 1：把 404 改成 403

**改 `getItemSafe` 的调用处，返回 403。**

**跑报告，看"越权读"那一项。**

**还是 ✅（因为 403 也不是 200）。**

**但你的报告依据栏写的是"404 不确认存在性"，现在实际是 403。**

**结论：**

**你的测试只检查"不是 200"，检查不出"状态码对不对"。**

**收紧断言：**

```javascript
record("越权读别人的数据", {
  safe: readResult.status === 404,   // 必须是 404
  detail: `HTTP ${readResult.status}`,
});
```

**改回来，跑一遍，确认是 404。**

## 实验 2：让 Bob 没有数据

**删掉 Bob 的 items：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('DELETE FROM items WHERE user_id=2').run(); console.log('deleted'); })"
```

**跑报告。**

**"越权读"应该显示 ✅（假绿）。**

**这就是坑 5。**

**加断言，让它显示"⚠️ 测试无效"。**

**然后 `npm run db:seed` 恢复数据。**

## 实验 3：删掉 `.env`

**重命名 `.env` 为 `.env.bak`。**

**启动服务。**

**应该立刻崩，报"JWT_SECRET 必须是至少 32 个字符"。**

**这就是 fail fast。**

**改回来。**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 报告的汇总表（防住几项，打穿几项）
2. 第五节"已知未防"你写了哪几条
3. 假绿的实验现象
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：加探活检查

**要求：** `attack:report` 开头检查服务是否在跑，不在跑就给清晰的提示。

## 练习二：加"数据准备"步骤

**要求：** 报告脚本自己确保 Alice 和 Bob 有数据（调用 seed 或用 API 创建）。

**为什么：** 报告应该"一条命令跑完"，不该依赖前置手动操作。

## 练习三：把报告变成 HTML

**要求：** `results/e07.md` 之外，生成一个 `results/e07.html`，带颜色（绿/红）。

**用途：** 给客户看的时候，HTML 比 Markdown 专业。

**做法：** 把 `results` 数组拼成 HTML 表格，写文件。

## 练习四：把这一周接回第 7 周的账本

**要求：** 让 `token-lab` 的 `record()` 接收真实的 `userId`。

**改动：**

```javascript
// token-lab 的 app.js
const userId = req.user?.id || "anon";
record({ userId, ... });
```

**然后跑几次不同账号的调用，看账本的"按用户"分组有没有真的分开。**

**这是这一周最有价值的收尾：**

**第 7 周你算不出"谁花的钱"，第 8 周你能算出来了。**

## 练习五：想清楚这四个问题

```text
1. 为什么安全报告必须写"已知未防"？
2. 什么是"假绿的测试"，为什么它比没有测试更危险？
3. 为什么"改密码后当前会话要重新签发 token"？
4. 你的系统现在最该补的下一个安全项是什么，为什么？
```

---

# 第 9 步：最终验收

## A. 完整流程

- [ ] 未登录访问 `/app.html` → 跳登录页
- [ ] 注册 → 登录 → 进应用
- [ ] 刷新页面还在登录状态
- [ ] 下一单成功，重复提交只出一条
- [ ] 改密码 → 另一个浏览器被踢
- [ ] 登出 → 回登录页
- [ ] 八步全通

## B. 攻击报告

- [ ] `npm run attack:report` 能跑
- [ ] 13 项全部 ✅
- [ ] 我删掉了 `/api/orders/unsafe`
- [ ] 报告有"已知未防"一节，至少 5 条
- [ ] 报告有"复现方法"

## C. 文档

- [ ] `auth-lab/README.md` 写完
- [ ] 有测试账号说明
- [ ] 有五条关键约定
- [ ] 指向 `results/e07.md`

## D. 认知

- [ ] 我能说出 13 项攻击各防住了什么
- [ ] 我知道报告里"已知未防"为什么最重要
- [ ] 我知道什么是假绿的测试
- [ ] 我能说出这一周结束后，下一个该补的安全项

## 本节课要能说出口的一句话

> **安全报告的价值不在"我防住了什么"，在"我知道自己没防住什么"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 报告一堆 `fetch failed` | 服务没启动 | 先 `npm run dev` |
| 无法登录 alice | 没 seed 或密码被改 | `npm run db:seed` |
| "越权读"显示假绿 | Bob 没数据 | 加断言判"测试无效" |
| 报告跑完数据脏了 | 测试写了数据 | 加清理或 `db:reset` |
| 改密码后自己也掉登录 | 没重新签发 token | 改完 `setAuthCookie` |
| 401 但前端不跳转 | 前端没处理 | 检查 `fetch` 的 401 分支 |
| 报告全绿但心里没底 | 断言太松 | 检查是不是只判了"不是 200" |
| `.env` 删了服务还能起 | 校验没生效 | 检查 `config.js` 的抛错 |
| HTML 报告中文乱码 | 没写 `<meta charset>` | 加 UTF-8 声明 |
