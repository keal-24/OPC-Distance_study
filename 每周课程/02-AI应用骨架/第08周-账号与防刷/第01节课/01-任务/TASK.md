# 第 50 节课：注册流程——把第一个真实用户写进数据库

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前七周所有的调用，账本上的用户都是 `anon`。
> 今天开始有真用户：**有一张表、有唯一约束、有密码哈希，而且不能泄露"这个邮箱注册过没有"。**

**建议用时**：130 分钟
**你需要先完成**：第 49 节课（token-lab 能跑，账本能看）、第 5 周（会用 `node:sqlite`）

---

# 第 0 步：先看清"没有用户"意味着什么（10 分钟）

## 0.1 打开你第 7 周的账本

```text
npm run report --by=user
```

**你会看到：**

```text
anon       2841 次   12.31 元
u_self       12 次    0.04 元
unknown       3 次    0.01 元
```

**三个"用户"，两个是假的。**

**这意味着：**

```text
① 你算不出"单个用户的成本"（因为大家混在 anon 里）
② 你没法给某个人限额度（不知道他是谁）
③ 你没法做"我的历史记录"（没有"我"）
④ 你没法收费（没有计费主体）
```

**这一周把这四条全解决。**

## 0.2 注册这件事，难在哪

**看起来只是"插一行数据"。实际有六个坑：**

| 坑 | 后果 |
|---|---|
| 密码明文入库 | 库一泄露，用户全网账号遭殃（他到处用同一个密码） |
| 没唯一约束 | 同一邮箱注册出两个账号，数据分裂 |
| 返回"邮箱已注册" | 攻击者能枚举你的用户库 |
| 邮箱格式没校验 | 垃圾数据入库，后面发信全退 |
| 没长度上限 | 有人提交 10MB 的"邮箱"，撑爆你的库 |
| 忘了 `await` | 存进去的是 `[object Promise]`，用户永远登不上 |

**今天一个一个处理。**

## 0.3 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的记录 |
| `package.json` | `第50节课/03-练习代码/auth-lab` | 项目配置 |
| `.env` | 同上 | JWT 密钥（不提交） |
| `src/config.js` | 同上 | 配置 |
| `src/db.js` | 同上 | 建表 + 迁移 |
| `src/users.js` | 同上 | 用户仓储 |
| `src/app.js` | 同上 | 服务 + 注册接口 |
| `public/register.html` | 同上 | 注册页面 |

---

# 第 1 步：搭项目（25 分钟）

## 1.1 建目录并装依赖

**操作：**

1. 打开 `第08周-账号与防刷/第01节课/03-练习代码/`。
2. 新建 `auth-lab`，进去。
3. 新建 `src`、`public`、`data`、`attacks`、`results` 五个目录。
4. 在 `auth-lab` 里开终端，跑：

```text
npm init -y
npm install express bcryptjs jsonwebtoken cookie-parser
```

**装完检查：**

```text
npm ls --depth=0
```

**应该看到四个包都装好了。**

**如果 `bcryptjs` 装完 `npm ls` 报 `UNMET`，重跑一次 `npm install bcryptjs`。**

## 1.2 改 `package.json`

**自己改成这样（保留依赖版本号）：**

```json
{
  "name": "auth-lab",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --env-file=.env src/app.js",
    "db:reset": "node src/reset.js",
    "attack:idor": "node attacks/idor.js",
    "attack:brute": "node attacks/bruteforce.js",
    "attack:sms": "node attacks/sms-bomb.js",
    "attack:replay": "node attacks/replay.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.6",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  }
}
```

**注意 `"type": "module"`。**

**注意 `--env-file=.env`：Node 20.6+ 自带，不需要 `dotenv`。**

**`npm init -y` 生成的 `"main"` 和 `"test"` 可以删掉，没影响。**

## 1.3 建 `.env`

**在 `auth-lab` 根目录：**

```text
PORT=4030
JWT_SECRET=dev-only-change-me-please-32-chars-min
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

**`JWT_SECRET` 必须够长。**

**为什么：**

```text
JWT 的安全性完全依赖这个密钥
密钥泄露 = 任何人能伪造任意用户的 token
短密钥 = 可以被暴力猜出来
```

**32 个字符是最低要求。生产环境用随机生成的：**

```text
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**跑一下，把输出贴进 `.env`。** 今天用 dev 值没关系，但要养成习惯。

## 1.4 确认 `.env` 不进 Git

```text
git status --short
```

**看到 `.env` 就停手，去改 `.gitignore`。**

**这一条已经说过两次，这次是最后一遍：`.env` 进了 Git，JWT 密钥就废了，所有人的登录都可被伪造。**

## 1.5 建 `src/config.js`

```javascript
export const CONFIG = {
  port: Number(process.env.PORT) || 4030,
  env: process.env.NODE_ENV || "development",
  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    cookieName: "auth_token",
  },
  db: {
    file: "./data/app.db",
  },
  limits: {
    emailMaxLength: 254,
    passwordMinLength: 8,
    passwordMaxLength: 72,     // bcrypt 的硬上限，见第 51 节
  },
};

if (!CONFIG.jwt.secret || CONFIG.jwt.secret.length < 32) {
  throw new Error("JWT_SECRET 必须是至少 32 个字符，请检查 .env");
}
```

**最后那个检查很重要。**

**为什么：**

```text
密钥是空字符串 → jsonwebtoken 会抛 "secretOrPrivateKey must have a value"（还算好）
密钥是 "abc"   → 能正常签发，但任何人猜 3 次就中了
```

**在启动时就崩掉，比在生产环境里悄悄用弱密钥强一万倍。**

**这叫 fail fast。**

## 1.6 端口为什么是 4030

```text
3000-3099   第 3 周 chat-app
4010        第 6-7 周假模型
4020        第 7 周 token-lab
4030        第 8 周 auth-lab
```

**端口冲突的 `EADDRINUSE` 会让你以为代码坏了。**

**这个编号规则以后每周都有用。**

---

# 第 2 步：建表（30 分钟）

## 2.1 先设计表结构

**动手前先写下来：**

```text
users
├── id            INTEGER PRIMARY KEY AUTOINCREMENT
├── email         TEXT NOT NULL UNIQUE
├── password_hash TEXT NOT NULL
├── nickname      TEXT
├── role          TEXT NOT NULL DEFAULT 'user'
├── status        TEXT NOT NULL DEFAULT 'active'
├── created_at    TEXT NOT NULL
└── updated_at    TEXT NOT NULL
```

**逐字段说为什么：**

| 字段 | 为什么需要 |
|---|---|
| `email` | 登录标识。**必须 UNIQUE**，这是"一个邮箱一个账号"的硬保证 |
| `password_hash` | 存哈希，不存明文。字段名就叫 `_hash`，提醒你别存别的 |
| `nickname` | 展示用，可空（注册时不强制） |
| `role` | 第 9 周后台管理要用。现在先留着，默认 `user` |
| `status` | 封号 / 注销。软删除比物理删除安全（第 24 周会讲） |
| `created_at` | 排错、统计留存 |
| `updated_at` | 改资料时更新，用于缓存失效判断 |

**为什么 `email` 要 UNIQUE，而不是在代码里"先查再插"：**

```javascript
// 错的写法
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (existing) return res.status(400).json({ error: "已注册" });
db.prepare("INSERT INTO users ...").run(email, hash);
```

**两个请求同时来，都查到"不存在"，都去插 → 两个账号。**

**这叫竞态条件（race condition）。**

**`UNIQUE` 约束由数据库保证原子性，这是唯一可靠的做法。**

**规则：唯一性交给数据库，不要交给你的 `if`。**

## 2.2 建 `src/db.js`

```javascript
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

fs.mkdirSync(path.dirname(CONFIG.db.file), { recursive: true });

export const db = new DatabaseSync(CONFIG.db.file);

// WAL 模式：读写不打架（第 5 周讲过的并发问题的解法）
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export const migrate = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version)
  );

  const migrations = [
    {
      version: "001_create_users",
      sql: `
        CREATE TABLE users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          email         TEXT    NOT NULL UNIQUE,
          password_hash TEXT    NOT NULL,
          nickname      TEXT,
          role          TEXT    NOT NULL DEFAULT 'user',
          status        TEXT    NOT NULL DEFAULT 'active',
          created_at    TEXT    NOT NULL,
          updated_at    TEXT    NOT NULL
        );
        CREATE INDEX idx_users_email ON users(email);
        CREATE INDEX idx_users_created ON users(created_at);
      `,
    },
  ];

  migrations.forEach((migration) => {
    if (applied.has(migration.version)) return;

    db.exec("BEGIN");

    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString()
      );
      db.exec("COMMIT");
      console.log(`[db] 已应用迁移 ${migration.version}`);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
};
```

## 2.3 四个关键点

### 关键点一：`PRAGMA journal_mode = WAL`

**SQLite 默认是 `DELETE` 模式，读写会互相阻塞。**

**WAL（Write-Ahead Logging）让读和写可以并发。**

**为什么重要：**

```text
你的应用：一个请求在读用户列表，另一个在写新用户
默认模式 → 其中一个要等
WAL     → 两个都能跑
```

**第 5 周你实测过 JSON 文件并发丢数据。WAL 是数据库层面的解法。** 这一行是必须的。

**副作用：会多出 `app.db-wal` 和 `app.db-shm` 两个文件。** 正常，别删。

### 关键点二：`PRAGMA foreign_keys = ON`

**SQLite 默认**不**强制外键约束。**

**这一行开启它。**

**为什么重要：** 第 53 节会有 `items(user_id)` 引用 `users(id)`。不开这个，你能插一条 `user_id = 9999` 的孤儿数据。

**这个坑极隐蔽：数据看起来正常，删除用户后才知道留下孤儿。**

### 关键点三：迁移表 + 版本号

**为什么不用 `CREATE TABLE IF NOT EXISTS` 就完事：**

```text
第一次：建表 ✅
加字段时：IF NOT EXISTS 不会加，你得手动改
```

**有了 `schema_migrations`：**

```text
每个改动是一个带版本号的文件
已应用的跳过
新环境跑一遍就完整
```

**这个模式会一直用到第 36 周。** 第 24 周多租户会写六个迁移。

### 关键点四：整个迁移包在事务里

```javascript
db.exec("BEGIN");
try {
  db.exec(migration.sql);
  db.prepare("INSERT INTO schema_migrations ...").run(...);
  db.exec("COMMIT");
} catch {
  db.exec("ROLLBACK");
}
```

**为什么：** 如果建表成功但记版本号失败，下次启动会重复建表 → 报"表已存在" → 永远起不来。

**事务保证"建表和记版本"要么都成功，要么都不做。**

## 2.4 写一个重置脚本

**新建 `src/reset.js`：**

```javascript
import fs from "node:fs";
import { CONFIG } from "./config.js";

["", "-wal", "-shm"].forEach((suffix) => {
  const file = `${CONFIG.db.file}${suffix}`;
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`[reset] 删除 ${file}`);
  }
});

console.log("[reset] 完成。下次启动会自动重建。");
```

**为什么需要它：**

**改表结构时，最省事的做法是"删掉重建"。**

**手动删 `data/` 目录也行，但容易漏掉 `-wal` 和 `-shm`。**

**漏了会怎样：** 旧 WAL 文件里的数据会被重放到新库里，你会看到"删了表但数据还在"的诡异现象。

**这个脚本以后每周都用。**

## 2.5 验证建表成功

**新建一个临时的 `src/check.js`（或者直接用 node -e）：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.migrate(); console.log(m.db.prepare('SELECT name FROM sqlite_master WHERE type=?').all('table')); })"
```

**应该看到：**

```text
[db] 已应用迁移 001_create_users
[ { name: 'users' }, { name: 'schema_migrations' } ]
```

**再跑一次，应该不再打印"已应用迁移"。**

**这就是幂等。** 跑一百次结果一样。

---

# 第 3 步：用户仓储（30 分钟）

## 3.1 新建 `src/users.js`

```javascript
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { CONFIG } from "./config.js";

const BCRYPT_ROUNDS = 10;

export const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();

export const isValidEmail = (email) => {
  const value = normalizeEmail(email);

  if (value.length === 0 || value.length > CONFIG.limits.emailMaxLength) return false;

  // 故意用简单正则：严格校验交给"发送验证邮件"这一步
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

export const hashPassword = async (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

export const verifyPassword = async (password, hash) => bcrypt.compare(password, hash);

/**
 * 创建用户。
 * 返回 { ok: true, user } 或 { ok: false, reason: "DUPLICATE" }
 * 不抛异常表示业务结果 —— 这样调用方必须显式处理重复。
 */
export const createUser = async ({ email, password, nickname }) => {
  const normalized = normalizeEmail(email);
  const hash = await hashPassword(password);
  const now = new Date().toISOString();

  try {
    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, nickname, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(normalized, hash, nickname || null, now, now);

    return {
      ok: true,
      user: {
        id: Number(result.lastInsertRowid),
        email: normalized,
        nickname: nickname || null,
        role: "user",
        createdAt: now,
      },
    };
  } catch (error) {
    // SQLite 的唯一约束错误信息包含 "UNIQUE constraint failed"
    if (String(error.message).includes("UNIQUE constraint failed")) {
      return { ok: false, reason: "DUPLICATE" };
    }

    throw error;
  }
};

export const findByEmail = (email) => {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email));
  return row || null;
};

export const findById = (id) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id));
  return row || null;
};

export const countUsers = () => {
  const row = db.prepare("SELECT COUNT(*) AS total FROM users").get();
  return Number(row.total);
};

/** 对外暴露的用户对象：绝不含 password_hash */
export const toPublicUser = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
};
```

## 3.2 六个关键设计

### 设计一：`normalizeEmail` 统一小写 + 去空格

**为什么：**

```text
User@Example.com
user@example.com
USER@EXAMPLE.COM
```

**这是三个字符串，但应该是一个账号。**

**不统一，用户注册了却登不上，或者能注册三个账号。**

**注意：严格说邮箱的本地部分（@前面）是区分大小写的，但现实中所有服务商都不区分。**

**统一小写是行业惯例，不是技术错误。**

### 设计二：邮箱正则故意宽松

```javascript
/^[^\s@]+@[^\s@]+\.[^\s@]+$/
```

**它只检查"有 @、有域名、域名有点"。**

**为什么不写严格的正则：**

```text
严格的正则（RFC 5322）有上千个字符，仍然会放过无效邮箱、拦掉有效邮箱
真正的验证是"发一封邮件看他能不能点"
```

**所以：**

```text
格式校验 = 拦掉明显不是邮箱的东西（防止垃圾数据）
真实性校验 = 发验证邮件（第 26 周做）
```

**这一周只做格式校验。**

### 设计三：`createUser` 不抛异常，返回结果对象

```javascript
{ ok: true, user }              // 成功
{ ok: false, reason: "DUPLICATE" }   // 重复
```

**为什么不用异常：**

```text
异常 = 意外情况
重复邮箱 = 预期内的业务结果（用户天天会做）
```

**用返回值表达预期内的情况，调用方必须显式处理 `ok`。**

**如果用异常，容易写成 `try { ... } catch { /* 什么都不做 */ }`，然后静默失败。**

**例外：数据库连接断了，那才是异常，该抛。**

### 设计四：靠 UNIQUE 约束捕获重复

```javascript
if (String(error.message).includes("UNIQUE constraint failed")) {
  return { ok: false, reason: "DUPLICATE" };
}
```

**为什么不在插入前查一次：**

**见 2.1，竞态条件。两个请求同时"查-不存在-插"，会插出两条。**

**"先查再插"看起来对，实际是错的。这是新手最常犯的并发错误。**

**（企业级做法：先查 + UNIQUE 兜底。但 UNIQUE 是必须的，先查只是优化。）**

### 设计五：`toPublicUser` 单独一个函数

**为什么不在查询时就 `SELECT id, email, nickname`：**

```text
① 登录时需要 password_hash（要验证）
② 展示时需要排除 password_hash
③ 两个需求冲突，所以分两个函数
```

**但更重要的是：**

> **写一个"必须显式调用才能泄露密码"的结构，而不是"必须显式排除"。**

**人总会忘记排除。但不会忘记"我要展示用户信息，调 toPublicUser"。**

**这条原则叫"安全默认值"。**

### 设计六：`BCRYPT_ROUNDS = 10`

**`10` 意味着 2^10 = 1024 轮。**

**第 51 节会实测不同轮数的耗时。现在先知道：**

```text
10 轮 → 约 60-100ms（可接受）
12 轮 → 约 250-400ms（更安全但登录变慢）
```

**10 是 2026 年的常见选择。** 因为攻击者用的是 GPU，轮数越高他的成本也越高。

---

# 第 4 步：写注册接口（25 分钟）

## 4.1 新建 `src/app.js`

```javascript
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.js";
import { migrate } from "./db.js";
import { createUser, isValidEmail, toPublicUser, findByEmail } from "./users.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const app = express();

migrate();

app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use(express.static(path.join(DIR, "..", "public")));

app.post("/api/register", async (req, res) => {
  const { email, password, nickname } = req.body ?? {};

  // 1. 类型检查（防止 password 是对象/数组）
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "邮箱和密码必须是字符串" });
  }

  // 2. 格式检查
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "邮箱格式不正确" });
  }

  if (password.length < CONFIG.limits.passwordMinLength) {
    return res.status(400).json({
      error: `密码至少 ${CONFIG.limits.passwordMinLength} 位`,
    });
  }

  if (password.length > CONFIG.limits.passwordMaxLength) {
    return res.status(400).json({
      error: `密码最多 ${CONFIG.limits.passwordMaxLength} 位`,
    });
  }

  // 3. 长度兜底（防超长 nickname 撑爆存储）
  const safeNickname = typeof nickname === "string" ? nickname.slice(0, 40) : null;

  const result = await createUser({ email, password, nickname: safeNickname });

  // 4. 关键：不管成功还是重复，都返回同一个响应
  if (!result.ok) {
    // 内部记日志，但对外装傻
    console.log(`[register] 重复邮箱（${email.slice(0, 3)}***），已静默处理`);
  }

  return res.status(201).json({
    message: "注册成功",
    // 只在开发环境把 user 带回去，方便调试
    ...(CONFIG.env === "development" && result.ok ? { user: result.user } : {}),
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, env: CONFIG.env });
});

app.use((error, req, res, next) => {
  console.error("[error]", error.message);
  res.status(500).json({ error: "服务器内部错误" });
});

app.listen(CONFIG.port, () => {
  console.log(`auth-lab 已启动：http://localhost:${CONFIG.port}`);
});
```

## 4.2 五个关键设计

### 设计一：先检查类型，再检查格式

```javascript
if (typeof email !== "string" || typeof password !== "string") { ... }
```

**为什么：**

```javascript
isValidEmail({ a: 1 })    → String(obj) 是 "[object Object]"，会走 false，还算安全
password.length           → 如果 password 是数字 12345，.length 是 undefined
bcrypt.hash(12345, 10)    → 会抛错，变成 500
```

**不检查类型，攻击者发个 `{"password": 12345}` 就能让你 500。**

**这是最便宜的 DoS 手法之一。**

### 设计二：不管重复与否，返回同一个响应

```javascript
if (!result.ok) {
  console.log("[register] 重复邮箱，已静默处理");
}

return res.status(201).json({ message: "注册成功" });
```

**为什么：**

**如果返回"邮箱已注册"，攻击者可以：**

```text
for (每个常见邮箱) { 试注册 } → 得到你的用户列表
再用这个列表 + 泄露的密码库 → 撞库
```

**这叫"用户枚举"（user enumeration）。**

**正确做法：**

```text
对外：永远是"注册成功，请查收邮件"
对内：日志里记真实情况
对已存在的邮箱：发一封"你已注册，点这里重置密码"的邮件
```

**这一周没做邮件，所以简化为"静默成功"。第 26 周做邮件时会补上。**

### 设计三：`201` 而不是 `200`

**`201 Created` 是 HTTP 语义里"创建了资源"的标准状态码。**

**为什么在意：**

```text
前端可以按 201 判断"这是新建"
监控能区分"新建"和"更新"
```

**状态码用对，比任何文档都清楚。**

### 设计四：`express.json({ limit: "64kb" })`

**默认限制是 100kb，这里收到 64kb。**

**为什么：**

**注册请求的 JSON 不该超过 1kb。** 64kb 已经是很宽松了。

**不给上限，攻击者发 10MB 的 body 就能吃掉你的内存。**

**这是第 54 节"防刷"的第一层，今天先做。**

### 设计五：只在开发环境返回 `user`

```javascript
...(CONFIG.env === "development" && result.ok ? { user: result.user } : {})
```

**生产环境不返回 `user`，因为前端不需要（注册完应该跳登录）。**

**返回多余信息 = 给攻击者多一个观察点。**

**这个 `...(条件 ? {...} : {})` 的写法，你在第 39 节见过。** 条件展开。

## 4.3 启动并测试

**终端：**

```text
npm run dev
```

**看到：**

```text
[db] 已应用迁移 001_create_users
auth-lab 已启动：http://localhost:4030
```

**另开一个终端，用 curl 注册：**

```text
curl.exe -X POST http://localhost:4030/api/register -H "Content-Type: application/json" -d "{\"email\":\"test1@example.com\",\"password\":\"test1234\",\"nickname\":\"测试一号\"}"
```

**应该看到：**

```json
{"message":"注册成功","user":{"id":1,"email":"test1@example.com","nickname":"测试一号","role":"user","createdAt":"2026-11-16T..."}}
```

**再注册一次同一个邮箱：**

```text
curl.exe -X POST http://localhost:4030/api/register -H "Content-Type: application/json" -d "{\"email\":\"TEST1@example.com\",\"password\":\"test1234\"}"
```

**注意邮箱改成了大写。** 应该还是返回"注册成功"（因为 `normalizeEmail` 把它变成小写，然后撞到 UNIQUE）。

**这就是"不泄露存在性"+"邮箱大小写不敏感"两个设计同时在起作用。**

## 4.4 验证密码是哈希

**这一条必须亲自看。**

**新建 `src/peek.js`（临时脚本）：**

```javascript
import { db } from "./db.js";

const rows = db.prepare("SELECT id, email, password_hash, created_at FROM users").all();

console.table(
  rows.map((row) => ({
    id: row.id,
    email: row.email,
    哈希: row.password_hash,
    长度: row.password_hash.length,
  }))
);
```

**跑：**

```text
node --env-file=.env src/peek.js
```

**你应该看到：**

```text
哈希: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
长度: 60
```

**三个判据：**

| 判据 | 正确值 | 如果不对 |
|---|---|---|
| 开头 | `$2a$10$` 或 `$2b$10$` | 不是 bcrypt |
| 长度 | 恰好 60 | 不是哈希（可能是明文或 Promise） |
| 内容 | 随机字符，看不出原文 | 明文 |

**如果长度是 15 左右** → 你存了 `[object Promise]`，回去补 `await`。

**如果看到 `test1234`** → 你根本没哈希，这是最严重的问题。

**这个检查做完，`peek.js` 留着。** 每周检查数据时都用得上。

---

# 第 5 步：写注册页面（20 分钟）

## 5.1 新建 `public/register.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>注册</title>
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
    input:focus { outline: 2px solid #bfdbfe; border-color: #3b82f6; }
    button {
      width: 100%; margin-top: 20px; padding: 11px;
      font: inherit; font-weight: 500; border: none; border-radius: 8px;
      background: #1a6dff; color: #fff; cursor: pointer;
    }
    button:disabled { background: #a9c1e8; cursor: not-allowed; }
    .msg { margin-top: 14px; font-size: 13px; min-height: 18px; }
    .msg.err { color: #b91c1c; }
    .msg.ok { color: #15803d; }
    .hint { font-size: 12px; color: #9ca3af; margin-top: 5px; }
    .foot { margin-top: 16px; font-size: 13px; color: #6b7280; text-align: center; }
    .foot a { color: #1a6dff; text-decoration: none; }
  </style>
</head>
<body>
  <form id="form" novalidate>
    <h1>创建账号</h1>

    <label for="email">邮箱</label>
    <input id="email" name="email" type="email" autocomplete="username" required />

    <label for="password">密码</label>
    <input id="password" name="password" type="password" autocomplete="new-password" required />
    <div class="hint">至少 8 位，最多 72 位</div>

    <label for="nickname">昵称（可选）</label>
    <input id="nickname" name="nickname" type="text" maxlength="40" autocomplete="nickname" />

    <button id="submit" type="submit">注册</button>
    <div class="msg" id="msg"></div>

    <div class="foot">已有账号？<a href="/login.html">去登录</a></div>
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
      show("提交中……", "");

      try {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email.value,
            password: form.password.value,
            nickname: form.nickname.value,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          show(data.error || `注册失败（HTTP ${response.status}）`, "err");
          return;
        }

        show("注册成功，正在跳转登录……", "ok");
        setTimeout(() => {
          window.location.href = "/login.html";
        }, 800);
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

## 5.2 三个关键点

### 关键点一：`novalidate`

**关掉浏览器的原生校验。**

**为什么：**

```text
原生校验的提示是英文 / 样式改不了 / 和你的服务端规则不一致
```

**你要自己控制提示文案和样式。** 但**服务端校验照旧必须有**——这一条别忘了。

### 关键点二：`autocomplete` 属性

```html
autocomplete="username"      邮箱
autocomplete="new-password"  注册时的新密码
autocomplete="nickname"      昵称
```

**为什么：**

```text
"username" / "new-password" → 密码管理器能正确识别并生成强密码
不写 → 密码管理器会瞎填，或者根本不弹
```

**这是"让用户用强密码"的最有效手段。** 比你的"密码必须包含大小写"提示有用一百倍。

**注意注册用 `new-password`，登录用 `current-password`。** 写反了密码管理器会填错。

### 关键点三：`submit.disabled = true` 防双击

**今天先做这一层（第 55 节做真正的幂等）。**

**为什么现在就要做：**

**双击提交 = 两次请求 = 第二次撞 UNIQUE = 用户看到"重复"提示。**

**虽然不会出数据问题，但体验很差。**

**但注意：这一行只是"减少概率"，不是"保证"。** 网络慢时用户还是能连点。

**真正的防护在第 55 节。**

## 5.3 打开浏览器试

```text
http://localhost:4030/register.html
```

**注册一个账号，然后看终端有没有报错。**

**再注册同一个邮箱，看页面显示什么。**

**应该显示"注册成功"（因为我们故意不告诉它重复了）。**

**这是对的。但你自己心里要知道"实际没插进去"。**

**验证方法：跑 `node --env-file=.env src/peek.js`，看用户数有没有变。**

---

# 第 6 步：五个必须知道的坑（20 分钟）

## 坑 1：`bcrypt.hash` 忘了 `await`

```javascript
// 错
const hash = bcrypt.hash(password, 10);
db.prepare("INSERT ...").run(email, hash);
// 存进库： "[object Promise]"
```

**症状：** 注册成功，登录永远失败。

**排查：** `peek.js` 看哈希长度。60 是对的，15 是错的。

**根本原因：** `bcryptjs` 的 `hash` 返回 Promise（异步），也可以用回调。**你必须 `await`。**

**这一条是本节最高频的错误。**

## 坑 2：`console.log(req.body)` 把密码打进日志

```javascript
app.use((req, res, next) => {
  console.log(req.method, req.url, req.body);   // 密码进日志了
  next();
});
```

**后果：**

```text
日志文件里全是明文密码
日志会被备份、被同步、被发给别人排错
```

**这就是"密码泄露"最常见的路径 —— 不是被黑客拖库，是被你自己的日志卖了。**

**正确做法：**

```javascript
const redact = (body) => {
  if (!body || typeof body !== "object") return body;

  const copy = { ...body };
  ["password", "passwordConfirm", "oldPassword", "token"].forEach((key) => {
    if (key in copy) copy[key] = "***";
  });

  return copy;
};

console.log(req.method, req.url, redact(req.body));
```

**这个 `redact` 函数你应该写一次，然后永远用。**

## 坑 3：错误信息泄露内部结构

```javascript
catch (error) {
  res.status(500).json({ error: error.message });   // 泄露 SQL 语句
}
```

**如果 `error.message` 是：**

```text
UNIQUE constraint failed: users.email
```

**攻击者就知道你有 `users` 表、有 `email` 列。**

**更糟的情况：**

```text
SQLITE_ERROR: no such table: users_secret
```

**泄露了表名。**

**正确做法：**

```javascript
catch (error) {
  console.error("[register] 内部错误：", error);   // 日志里记全
  res.status(500).json({ error: "服务器内部错误" });  // 对外只说这句
}
```

**规则：日志给开发者，响应给用户。两者永远不同。**

## 坑 4：密码长度上限没设（bcrypt 的 72 字节限制）

**bcrypt 只处理前 72 个**字节**。**

**注意是字节，不是字符。**

```text
"password"（8 个英文）→ 8 字节
"密码密码密码密码"（8 个中文）→ 24 字节（UTF-8 每字 3 字节）
```

**所以中文密码最多 24 个字符就到了 72 字节。**

**后果：**

```text
用户设了 100 位的密码 → bcrypt 只看前 72 字节
后面 28 位完全不起作用
用户以为很安全，实际不然
```

**正确做法：**

```javascript
if (Buffer.byteLength(password, "utf8") > 72) {
  return res.status(400).json({ error: "密码过长" });
}
```

**注意用 `Buffer.byteLength(..., "utf8")`，不是 `password.length`。**

**这一条很少人知道。** 你的 `CONFIG.limits.passwordMaxLength = 72` 现在按字符算，**第 51 节会改成按字节。**

## 坑 5：`express.static` 暴露了不该访问的文件

```javascript
app.use(express.static(path.join(DIR, "..", "public")));
```

**这行只暴露 `public/` 目录，是对的。**

**但如果写成：**

```javascript
app.use(express.static(path.join(DIR, "..")));   // 整个项目根目录！
```

**后果：**

```text
http://localhost:4030/.env             → 你的 JWT 密钥
http://localhost:4030/data/app.db      → 整个数据库
http://localhost:4030/src/config.js    → 源码
```

**这是真实发生过的漏洞类型，而且极常见。**

**规则：静态目录永远指向 `public/`，不指向项目根。**

**验证方法（现在就做）：**

```text
curl.exe http://localhost:4030/.env
curl.exe http://localhost:4030/data/app.db
```

**两个都应该是 404。**

**如果不是 404，立刻停下来修。**

---

# 第 7 步：故意做五个实验（20 分钟）

## 实验 1：删掉 `await`

**把 `const hash = await hashPassword(password)` 改成 `const hash = hashPassword(password)`。**

**注册一个用户，然后跑 `peek.js`。**

**你会看到 `password_hash` 是 `[object Promise]`，长度 15。**

**再试着登录（第 52 节才有登录接口，今天先看数据）。**

**改回来。**

## 实验 2：改成"先查再插"

**把 `createUser` 改成：**

```javascript
const existing = findByEmail(email);
if (existing) return { ok: false, reason: "DUPLICATE" };
// 然后 INSERT，去掉 try/catch 的 UNIQUE 判断
```

**然后写一个并发测试（今天先简单跑）：**

```text
node --env-file=.env -e "
import('./src/users.js').then(async m => {
  const tasks = Array.from({length: 5}, () => m.createUser({email:'race@example.com', password:'test1234'}));
  const results = await Promise.all(tasks);
  console.log(results.map(r => r.ok));
});
"
```

**你会看到：有的成功、有的抛异常（因为没 catch UNIQUE）。**

**如果都返回 ok（因为查的时候都不存在），数据库里就会有两个 `race@example.com` —— 但因为 UNIQUE 约束，第二个会抛错，只是你没 catch。**

**这个实验的结论：**

```text
"先查再插" 在并发下不可靠
UNIQUE 约束是必须的，而且必须 catch 它的错误
```

**记得把 UNIQUE 的 catch 加回去。**

## 实验 3：把邮箱改成大小写敏感

**把 `normalizeEmail` 改成 `String(email).trim()`（去掉 `.toLowerCase()`）。**

**注册 `Test@example.com`，再注册 `test@example.com`。**

**两个都会成功 —— 数据库里有两个"看起来一样"的账号。**

**用户会崩溃：我明明注册了，为什么说我没注册？**

**改回来。**

## 实验 4：返回真实错误

**把 `if (!result.ok)` 那段改成：**

```javascript
if (!result.ok) {
  return res.status(409).json({ error: "该邮箱已注册" });
}
```

**然后想：如果你是攻击者，怎么利用这句话？**

**写进 `NOTES.md`。** 这一题没有标准答案，但你必须能说出至少一种滥用方式。

**改回来（静默成功）。**

## 实验 5：请求体超大

**发一个 200KB 的 nickname：**

```text
node -e "console.log(JSON.stringify({email:'big@example.com', password:'test1234', nickname:'x'.repeat(200000)}))" > big.json
curl.exe -X POST http://localhost:4030/api/register -H "Content-Type: application/json" --data-binary @big.json
```

**应该被 `express.json({ limit: "64kb" })` 拦下，返回 413。**

**如果没被拦，你的 `limit` 没生效。**

**这个实验让你理解：`limit` 不是可选项，是必须项。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. `peek.js` 看到的真实哈希（贴一条）
2. 五个实验各自的现象
3. 为什么"先查再插"不可靠
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：加"注册时间"和"来源"字段

**要求：** 给 `users` 表加两列：`registered_from`（`web` / `api`）和 `utm_source`。

**必须用迁移，不许删库重建。**

**迁移写法：**

```javascript
{
  version: "002_add_user_source",
  sql: `
    ALTER TABLE users ADD COLUMN registered_from TEXT DEFAULT 'web';
    ALTER TABLE users ADD COLUMN utm_source TEXT;
  `,
}
```

**验证：** 重启服务，看是否打印"已应用迁移 002"，并且旧数据还在。

**这一题的目的：让你体验"线上加字段"的正确姿势。** 第 24 周会讲更复杂的情况。

## 练习二：给 `users` 加一个"最后登录时间"

**要求：** 加 `last_login_at`（可空），第 52 节做登录时更新它。

**先只加字段，不写逻辑。**

## 练习三：写一个用户数统计

**要求：** `GET /api/stats/users` 返回：

```json
{ "total": 12, "today": 3, "last7days": 8 }
```

**注意"今天"要用本地时区，不是 UTC。** 第 44 节的坑。

**提示：** `created_at` 存的是 ISO 字符串，用 `LIKE '2026-11-16%'` 匹配。

## 练习四：做一个"删除测试账号"的脚本

**要求：** `npm run clean:test` 删掉所有 `@example.com` 的账号（练习用）。

**为什么：** 你会反复测试，账号越积越多。**手动删很烦，而且容易误删。**

**注意：生产环境绝对不要有这种脚本。** 写清楚注释。

## 练习五：想清楚这四个问题

```text
1. 为什么唯一性必须交给数据库的 UNIQUE，不能靠代码里的 if？
2. 为什么注册接口不能告诉用户"邮箱已注册"？
3. 为什么密码要用 Buffer.byteLength 而不是 .length 判长度？
4. `express.static(项目根目录)` 会造成什么后果？
```

---

# 第 10 步：最终验收

## A. 环境

- [ ] `npm install` 四个包都装好
- [ ] `.env` 存在，`JWT_SECRET` 至少 32 字符
- [ ] `.env` 没进 `git status`
- [ ] `data/app.db` 已生成

## B. 数据库

- [ ] `users` 表存在，`email` 有 UNIQUE
- [ ] `schema_migrations` 表存在，有 `001` 记录
- [ ] 重复跑 `migrate()` 不会重复建表
- [ ] `app.db-wal` 文件存在（说明 WAL 生效）

## C. 代码

- [ ] `users.js` 有 `createUser` / `findByEmail` / `toPublicUser`
- [ ] `createUser` 靠 catch UNIQUE 判断重复
- [ ] `hashPassword` 有 `await`
- [ ] `app.js` 有类型检查、格式检查、长度检查
- [ ] 重复注册返回"注册成功"，不是"已注册"
- [ ] 错误处理不返回 `error.message`

## D. 数据

- [ ] `peek.js` 看到 `$2a$10$` 开头、长度 60 的哈希
- [ ] 没有明文密码
- [ ] 大小写不同的同一邮箱只能注册一次

## E. 安全

- [ ] `curl /.env` 返回 404
- [ ] `curl /data/app.db` 返回 404
- [ ] 200KB 的 body 被 413 拦下
- [ ] 日志里没有明文密码

## 本节课要能说出口的一句话

> **唯一性交给数据库，存在性对外装傻，密码只留哈希。这三条做到了，注册才算写完。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `Cannot find module 'node:sqlite'` | Node < 22 | 升级 Node |
| `SQLITE_CANTOPEN` | `data/` 目录不存在 | `db.js` 里已有 `mkdirSync` |
| 哈希是 `[object Promise]` | 忘了 `await` | 加 `await` |
| 哈希长度 15 | 同上 | 同上 |
| 同一邮箱能注册两次 | 没 UNIQUE 或没 normalize | 查表定义和 `normalizeEmail` |
| `SQLITE_CONSTRAINT` 没被捕获 | catch 判断写错 | 检查 `includes("UNIQUE constraint failed")` |
| 中文密码登录失败 | 72 字节截断 | 按字节校验，或用 `bcryptjs` 的 `truncates` 选项 |
| `/.env` 能访问 | 静态目录指向根 | 改成 `public/` |
| 413 | body 太大 | 这是对的，`limit` 生效了 |
| 端口被占 | 4030 被用了 | 改 `PORT` |
| `JWT_SECRET 必须是至少 32 个字符` | `.env` 里太短 | 生成一个随机的 |
