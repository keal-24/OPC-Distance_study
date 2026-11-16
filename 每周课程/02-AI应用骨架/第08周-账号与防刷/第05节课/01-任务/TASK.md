# 第 54 节课：验证码与限频——短信费一夜几千是怎么漏出去的

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前四天你解决了"谁在用"和"能不能碰别人的数据"。
> 今天解决最后一道门：**怎么让攻击变贵。**

**建议用时**：150 分钟
**你需要先完成**：第 53 节课（`test:auth` 七条全过）

---

# 第 0 步：先算一笔账（10 分钟）

## 0.1 一条短信多少钱

```text
国内短信：0.03-0.06 元/条（量大能到 0.025）
```

**看起来很少。看这些真实数字：**

```text
一个短信验证码接口，没有任何限制
攻击者用脚本，每秒 20 个号码
一小时 = 72000 条
按 0.05 元算 = 3600 元
```

**一夜之间，你的预充值额度清零，还要赔钱（因为欠费停机后短信发不出去，真实用户收不到码）。**

**这类攻击叫"短信轰炸"（SMS bombing），它的目的常常不是攻击你，是：**

```text
① 用你的接口去轰炸别人（你的号码成了攻击源）
② 消耗你的额度，让你业务停摆
③ 让你被运营商列入黑名单
```

## 0.2 更常见的场景：不是黑客，是你的 Bug

**比攻击更常见的，是自己的代码出问题：**

```javascript
// 用户点击"发送验证码"
// 前端没禁用按钮
// 用户连点 8 次 → 8 条短信
// 用户不耐烦，刷新页面再点 → 又 8 条
```

**一天 100 个用户这么干，就是 800 条 × 0.05 = 40 元。一个月 1200 元。**

**这个成本很多人算漏了，然后发现"怎么短信费比模型费还高"。**

## 0.3 限频的三个维度

**只做一个维度，等于没做：**

| 维度 | 限制 | 防什么 |
|---|---|---|
| **按 IP** | 每分钟 10 次 | 单机脚本刷 |
| **按号码** | 每分钟 1 次，每天 10 次 | 刷同一个号码 |
| **按用户** | 每分钟 3 次 | 登录用户乱点 |

**为什么三个都要：**

```text
只有 IP   → 攻击者换代理，或者用 10 台机器
只有号码  → 攻击者换号码（买 1 万个号码成本 100 元）
只有用户  → 攻击者注册 1 万个账号
```

**三个叠加，攻击成本才真正变高。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/sms.js` | `src/` | 假短信 + 验证码存储（哈希） |
| `src/ratelimit.js` | `src/` | 三种限频算法对比 |
| `src/app.js` | `src/` | 发送/校验接口 + 三道限频 |
| `attacks/sms-bomb.js` | `attacks/` | 刷短信脚本 |
| `results/e05.md` | `results/` | 限频前后对比 |

---

# 第 1 步：写假短信 + 验证码存储（30 分钟）

## 1.1 验证码有五个必须处理的点

**看起来只是"生成 6 位数字，比对一下"。实际有五个坑：**

| 坑 | 后果 |
|---|---|
| 存原文 | 库泄露 = 所有待验证的号都能被接管 |
| 不设过期 | 一年后还能用 |
| 可无限试 | 6 位数字，100 万种，一分钟试完 |
| 不失效 | 用过一次还能再用 |
| 生成用 `Math.random()` | 可预测，能被推算出下一个 |

**今天全部处理。**

## 1.2 在 `db.js` 加表

```javascript
{
  version: "005_create_verification_codes",
  sql: `
    CREATE TABLE verification_codes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT    NOT NULL,
      code_hash   TEXT    NOT NULL,
      purpose     TEXT    NOT NULL DEFAULT 'login',
      attempts    INTEGER NOT NULL DEFAULT 0,
      used_at     TEXT,
      expires_at  TEXT    NOT NULL,
      created_at  TEXT    NOT NULL
    );
    CREATE INDEX idx_code_phone_purpose ON verification_codes(phone, purpose);
    CREATE INDEX idx_code_expires ON verification_codes(expires_at);
  `,
}
```

**四个字段的设计意图：**

| 字段 | 作用 |
|---|---|
| `code_hash` | 存哈希，不存原文 |
| `attempts` | 记录"试了几次"，用于锁定（防暴力猜 6 位） |
| `used_at` | 一次性标记 |
| `expires_at` | 过期时间 |

**为什么 `attempts` 必须在数据库（不能只放内存）：**

**因为进程重启后内存清零，攻击者能重启你的服务（或者等它崩）来重置尝试次数。**

**放数据库，重启也不丢。**

## 1.3 新建 `src/sms.js`

```javascript
import crypto from "node:crypto";
import { db } from "./db.js";

const CODE_TTL_SECONDS = 300;       // 5 分钟
const MAX_ATTEMPTS = 5;             // 同一个码最多试 5 次

const hashCode = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");

/** 生成 6 位数字验证码，用 crypto 不是 Math.random */
const generateCode = () => {
  // randomInt(0, 1000000) 均匀分布，且密码学安全
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
};

/**
 * 假短信发送。真实项目替换这里，其余代码一行不用改。
 */
export const sendSms = async (phone, code) => {
  // 真实接入时的样子（第 33 周讲）：
  // await client.send({ phone, templateId, params: [code] })

  console.log("\n========================================");
  console.log(`【假短信】收件人：${phone}`);
  console.log(`【假短信】验证码：${code}`);
  console.log(`【假短信】有效期：${CODE_TTL_SECONDS} 秒`);
  console.log("========================================\n");

  return { ok: true, providerId: `mock_${Date.now()}` };
};

export const createCode = async (phone, purpose = "login") => {
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_SECONDS * 1000);

  // 作废这个号码+用途的所有旧码（只保留最新的有效）
  db.prepare(
    "UPDATE verification_codes SET used_at = ? WHERE phone = ? AND purpose = ? AND used_at IS NULL"
  ).run(now.toISOString(), phone, purpose);

  db.prepare(
    `INSERT INTO verification_codes (phone, code_hash, purpose, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(phone, hashCode(code), purpose, expiresAt.toISOString(), now.toISOString());

  await sendSms(phone, code);

  return { ok: true, ttlSeconds: CODE_TTL_SECONDS };
};

/**
 * 校验验证码。返回 { ok, reason }
 * reason: OK / NO_CODE / EXPIRED / TOO_MANY_ATTEMPTS / WRONG
 */
export const verifyCode = (phone, code, purpose = "login") => {
  const row = db
    .prepare(
      `SELECT * FROM verification_codes
       WHERE phone = ? AND purpose = ? AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(phone, purpose);

  if (!row) return { ok: false, reason: "NO_CODE" };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
  }

  // 先加尝试次数（不管对错），防止"错了不计数"
  db.prepare("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);

  if (hashCode(code) !== row.code_hash) {
    return { ok: false, reason: "WRONG", remaining: MAX_ATTEMPTS - row.attempts - 1 };
  }

  db.prepare("UPDATE verification_codes SET used_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    row.id
  );

  return { ok: true, reason: "OK" };
};
```

## 1.4 五个关键设计

### 设计一：`crypto.randomInt` 不是 `Math.random`

```javascript
String(crypto.randomInt(0, 1000000)).padStart(6, "0")
```

**为什么：**

**`Math.random()` 是伪随机，V8 里是 xorshift128+，攻击者拿到几个输出能推算出内部状态。**

**`crypto.randomInt` 用的是操作系统的 CSPRNG（密码学安全伪随机数生成器）。**

**规则（第三次说）：任何和安全相关的随机数，用 `crypto`，不用 `Math.random`。**

**注意 `padStart(6, "0")`：不补零的话，`randomInt(0, 1000000)` 可能返回 42，验证码变成 `"42"` —— 只有两位。**

**攻击者只要试 100 个两位数字。**

### 设计二：存哈希，不存原文

```javascript
code_hash: hashCode(code)
```

**为什么验证码也要哈希：**

```text
验证码的有效期是 5 分钟
如果这 5 分钟里你的库被拖，攻击者能接管所有"正在登录"的号码
```

**概率低但代价高。哈希的成本几乎为零，所以做。**

**用 SHA-256 不用 bcrypt：**

**验证码是 6 位数字，只有 100 万种可能。用 bcrypt 也是 10 次/秒 → 100 万次要 27 小时，超过 5 分钟有效期，反而"够安全"。**

**但没必要。** SHA-256 更快，而且验证码的熵虽然低，**但它的攻击窗口只有 5 分钟，且我们有限尝试次数（5 次）。**

**所以：验证码用 SHA-256 + 限尝试次数，是"够用且快"的组合。**

**这和密码不同：密码没有"5 分钟失效"和"只能试 5 次"这两道保险。** 所以密码必须用 bcrypt。

### 设计三：新码作废旧码

```javascript
db.prepare("UPDATE ... SET used_at = ? WHERE phone = ? AND purpose = ? AND used_at IS NULL").run(...);
```

**为什么：**

```text
用户点了 3 次"重新发送"
如果 3 个码都有效 → 攻击者撞中任何一个都行
作废旧码 = 只有最新那个能用
```

**这也符合用户直觉："我点重新发送，旧的就该失效"。**

### 设计四：先加 `attempts` 再比对

```javascript
db.prepare("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);

if (hashCode(code) !== row.code_hash) { ... }
```

**顺序很重要。**

**如果先比对、只在失败时 +1：**

```javascript
如果哈希比对本身抛错（比如 code 是对象），attempts 不增加 → 无限试
```

**先加，无论结果如何都计数。** 这是"失败也要付出代价"的设计。

### 设计五：`remaining` 告诉用户还剩几次

```javascript
return { ok: false, reason: "WRONG", remaining: MAX_ATTEMPTS - row.attempts - 1 };
```

**为什么告诉：**

```text
不告诉 → 用户不知道为什么突然不能试了，会觉得"你的系统坏了"
告诉   → 用户知道"还有 3 次机会"，会小心输入
```

**但要注意：这个信息对攻击者也有用。**

**权衡：这里的攻击窗口只有 5 分钟 + 5 次，告诉他剩几次没有实质帮助（他本来就能数）。所以告诉更有价值。**

---

# 第 2 步：三种限频算法（35 分钟）

## 2.1 三种算法的区别

| 算法 | 原理 | 优点 | 缺点 |
|---|---|---|---|
| **固定窗口** | 每分钟计数，到点清零 | 最简单 | 边界问题：59 秒和 61 秒能连过两次 |
| **滑动窗口** | 记录每次请求的时间，看最近 60 秒内几次 | 准 | 要存时间戳列表 |
| **令牌桶** | 桶里 N 个令牌，按速率补充 | 允许突发 | 参数两个，要理解 |

**先看固定窗口的边界问题：**

```text
限制：每分钟 5 次

用户在第 59 秒发 5 次 → 通过（这个窗口的额度用完）
用户在 61 秒发 5 次 → 通过（新窗口，额度重置）
→ 2 秒内过了 10 次
```

**这就是"双倍突发"。** 对付它要用滑动窗口。

## 2.2 新建 `src/ratelimit.js`

```javascript
/**
 * 三种限频实现。都基于内存 Map，单进程有效。
 * 多进程需要 Redis 或数据库（第 29 周讲）。
 */

const stores = new Map();

const getStore = (name) => {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
};

/** 定期清理，防止内存泄漏 */
const startCleanup = (store, ttlMs) => {
  if (store.__timer) return;

  store.__timer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of store.entries()) {
      if (key === "__timer") continue;
      if (typeof value === "number") {
        if (now > value + ttlMs) store.delete(key);
      } else if (Array.isArray(value)) {
        const filtered = value.filter((ts) => now - ts < ttlMs);
        if (filtered.length === 0) store.delete(key);
        else store.set(key, filtered);
      } else if (value && typeof value === "object") {
        if (now > (value.resetAt || 0) && now > (value.updatedAt || 0) + ttlMs) store.delete(key);
      }
    }
  }, 60000);

  store.__timer.unref?.();
};

/**
 * 固定窗口：最简单，但有边界双倍突发问题。
 */
export const fixedWindow = ({ name, limit, windowMs }) => {
  const store = getStore(name);
  startCleanup(store, windowMs);

  return (key) => {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1, resetInMs: windowMs };
    }

    if (entry.count >= limit) {
      return { ok: false, remaining: 0, resetInMs: entry.resetAt - now };
    }

    entry.count += 1;
    return { ok: true, remaining: limit - entry.count, resetInMs: entry.resetAt - now };
  };
};

/**
 * 滑动窗口：记录时间戳，精确。
 */
export const slidingWindow = ({ name, limit, windowMs }) => {
  const store = getStore(name);
  startCleanup(store, windowMs);

  return (key) => {
    const now = Date.now();
    const list = (store.get(key) || []).filter((ts) => now - ts < windowMs);

    if (list.length >= limit) {
      const oldest = list[0];
      store.set(key, list);
      return { ok: false, remaining: 0, resetInMs: windowMs - (now - oldest) };
    }

    list.push(now);
    store.set(key, list);

    return { ok: true, remaining: limit - list.length, resetInMs: windowMs };
  };
};

/**
 * 令牌桶：允许突发到 capacity，之后按 refillPerSec 匀速恢复。
 */
export const tokenBucket = ({ name, capacity, refillPerSec }) => {
  const store = getStore(name);
  startCleanup(store, 3600000);

  return (key) => {
    const now = Date.now();
    const entry = store.get(key) || { tokens: capacity, updatedAt: now };

    const elapsedSec = (now - entry.updatedAt) / 1000;
    entry.tokens = Math.min(capacity, entry.tokens + elapsedSec * refillPerSec);
    entry.updatedAt = now;

    if (entry.tokens < 1) {
      store.set(key, entry);
      const waitMs = Math.ceil(((1 - entry.tokens) / refillPerSec) * 1000);
      return { ok: false, remaining: 0, resetInMs: waitMs };
    }

    entry.tokens -= 1;
    store.set(key, entry);

    return {
      ok: true,
      remaining: Math.floor(entry.tokens),
      resetInMs: Math.ceil(((capacity - entry.tokens) / refillPerSec) * 1000),
    };
  };
};

/** 便捷包装：生成 express 中间件 */
export const rateLimit = ({ name, limit, windowMs, algorithm = "sliding", keyFn }) => {
  const check =
    algorithm === "fixed"
      ? fixedWindow({ name, limit, windowMs })
      : algorithm === "bucket"
        ? tokenBucket({ name, capacity: limit, refillPerSec: limit / (windowMs / 1000) })
        : slidingWindow({ name, limit, windowMs });

  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;

    if (!key) return next();   // 拿不到 key 就不限（比如未登录且无 IP）

    const result = check(String(key));

    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetInMs / 1000));

    if (!result.ok) {
      res.setHeader("Retry-After", Math.ceil(result.resetInMs / 1000));
      return res.status(429).json({
        error: "请求太频繁，请稍后再试",
        retryAfterSeconds: Math.ceil(result.resetInMs / 1000),
      });
    }

    next();
  };
};
```

## 2.3 三个实现的关键点

### 关键点一：`startCleanup` 防止内存泄漏

**不清理的后果：**

```text
每个 IP 一个 key，一天 10 万个 IP
Map 里 10 万个条目，永不清除
内存一直涨
```

**清理逻辑按类型分别处理（数字、数组、对象），因为三种算法的存储结构不同。**

**`store.__timer.unref?.()` 很重要：**

**`setInterval` 会阻止 Node 进程退出。`unref()` 让它"不阻止退出"。**

**不写这个，你的服务按 Ctrl+C 后会卡住不退。**

### 关键点二：响应头告诉客户端限额

```javascript
res.setHeader("X-RateLimit-Limit", limit);
res.setHeader("X-RateLimit-Remaining", result.remaining);
res.setHeader("X-RateLimit-Reset", ...);
```

**为什么：**

```text
前端可以显示"还剩 3 次"
客户端库能自动退避
排错时一眼看出是被限了
```

**`Retry-After` 是 HTTP 标准头，429 时应该带。**

### 关键点三：`algorithm` 可选三种

**默认 `sliding`（最准）。**

**`fixed` 用在"不在乎边界"的场景（比如"每天 100 次"这种粗粒度）。**

**`bucket` 用在"允许突发"的场景（比如"平均每分钟 10 次，但允许一次来 20 次"）。**

## 2.4 实测三种算法的差别

**新建 `experiments/e05-ratelimit.js`：**

```javascript
import { fixedWindow, slidingWindow, tokenBucket } from "../src/ratelimit.js";

const simulate = (checker, pattern, label) => {
  console.log(`\n===== ${label} =====`);
  let passed = 0;
  let blocked = 0;
  const timeline = [];

  pattern.forEach(({ atMs, note }) => {
    const result = checker("test-key");
    if (result.ok) passed += 1;
    else blocked += 1;

    timeline.push({
      时刻: `${atMs}ms`,
      说明: note || "",
      结果: result.ok ? "✅ 通过" : `❌ 拒绝（${Math.ceil(result.resetInMs / 1000)}s 后重试）`,
    });
  });

  console.table(timeline);
  console.log(`通过 ${passed}，拒绝 ${blocked}`);
};

// 模拟"在窗口边界前后各发 5 次"（不需要真的等，直接调）
const boundaryPattern = [
  { atMs: 0, note: "窗口开始，第 1 次" },
  { atMs: 0, note: "第 2 次" },
  { atMs: 0, note: "第 3 次" },
  { atMs: 0, note: "第 4 次" },
  { atMs: 0, note: "第 5 次" },
  { atMs: 0, note: "第 6 次（应被拒）" },
];

console.log("注意：下面的模拟是连续调用，不等待真实时间。");
console.log("这正好演示固定窗口的『同一瞬间超限』行为。\n");

simulate(fixedWindow({ name: "demo-fixed", limit: 5, windowMs: 60000 }), boundaryPattern, "固定窗口 limit=5/60s");
simulate(slidingWindow({ name: "demo-sliding", limit: 5, windowMs: 60000 }), boundaryPattern, "滑动窗口 limit=5/60s");
simulate(
  tokenBucket({ name: "demo-bucket", capacity: 5, refillPerSec: 5 / 60 }),
  boundaryPattern,
  "令牌桶 capacity=5 rate=5/60s"
);
```

**跑：**

```text
node experiments/e05-ratelimit.js
```

**三种都应该是"5 通过、1 拒绝"。**

**差别在"窗口边界"。真正的边界测试需要等时间，练习里做。**

---

# 第 3 步：给短信接口上三道锁（30 分钟）

## 3.1 三层限频，各管一个维度

**在 `app.js` 里：**

```javascript
import { rateLimit } from "./ratelimit.js";
import { createCode, verifyCode } from "./sms.js";

// 第一道：按 IP，防单机刷
const ipLimit = rateLimit({
  name: "sms-ip",
  limit: 10,
  windowMs: 60 * 1000,
  algorithm: "sliding",
  keyFn: (req) => req.ip,
});

// 第二道：按号码，防刷同一个号
const phoneLimit = rateLimit({
  name: "sms-phone",
  limit: 1,
  windowMs: 60 * 1000,
  algorithm: "sliding",
  keyFn: (req) => req.body?.phone,
});

// 第三道：按号码的日限额，防长期骚扰
const phoneDailyLimit = rateLimit({
  name: "sms-phone-day",
  limit: 10,
  windowMs: 24 * 3600 * 1000,
  algorithm: "fixed",
  keyFn: (req) => req.body?.phone,
});

app.post("/api/sms/send", ipLimit, phoneLimit, phoneDailyLimit, async (req, res) => {
  const { phone } = req.body ?? {};

  if (typeof phone !== "string" || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: "手机号格式不正确" });
  }

  await createCode(phone, "login");

  // 关键：不告诉前端"验证码是什么"
  res.json({
    message: "验证码已发送",
    ttlSeconds: 300,
  });
});

app.post("/api/sms/verify", async (req, res) => {
  const { phone, code } = req.body ?? {};

  if (typeof phone !== "string" || typeof code !== "string") {
    return res.status(400).json({ error: "参数不正确" });
  }

  const result = verifyCode(phone, code, "login");

  if (!result.ok) {
    const messages = {
      NO_CODE: "验证码不存在或已使用，请重新获取",
      EXPIRED: "验证码已过期，请重新获取",
      TOO_MANY_ATTEMPTS: "错误次数过多，请重新获取验证码",
      WRONG: `验证码不正确${result.remaining !== undefined ? `，还剩 ${result.remaining} 次机会` : ""}`,
    };

    return res.status(400).json({ error: messages[result.reason] || "验证失败" });
  }

  res.json({ message: "验证成功" });
});
```

## 3.2 为什么中间件顺序是 IP → 号码 → 日限额

**顺序很重要。**

**如果 Order 反了（先查号码），攻击者用一个新号码就能绕过 IP 限制？**

**不会。三道是 AND 关系，任何一道拒就停下。**

**但顺序影响"哪一道先拦住"，进而影响日志和用户体验。**

**正确顺序（从粗到细）：**

```text
IP（最粗，最便宜）→ 号码（中）→ 日限额（最贵，要查 24 小时窗口）
```

**为什么"最便宜的先查"：**

```text
IP 检查：1 次 Map 查找
号码检查：1 次 Map 查找
日限额：1 次 Map 查找（但窗口大，列表长）
```

**差别不大，但这是好习惯：先做便宜的检查，早失败早返回。**

**更重要的是：先按 IP 拦，能挡掉 90% 的小白脚本，减少后面两道的负载。**

## 3.3 一个必须处理的细节：`req.ip`

**`req.ip` 在 Express 里默认是"直连的 IP"。**

**如果你前面有 Nginx / CDN，`req.ip` 永远是代理的 IP（比如 `127.0.0.1`）。**

**后果：所有用户共享一个 IP，第 11 个人就被拦了。**

**修法：**

```javascript
app.set("trust proxy", 1);   // 信任一层代理
```

**为什么是 `1` 而不是 `true`：**

```text
true    → 信任所有代理，攻击者能伪造 X-Forwarded-For 绕过限频
1       → 只信任最近一层，安全
```

**这一条第 31 周部署时是必须的。现在本地开发用不到，但要先写上。**

**验证方法：**

```javascript
app.get("/api/whoami", (req, res) => res.json({ ip: req.ip }));
```

**本地访问应该返回 `::1` 或 `127.0.0.1`。**

---

# 第 4 步：写刷短信脚本（25 分钟）

## 4.1 新建 `attacks/sms-bomb.js`

```javascript
const BASE = "http://localhost:4030";

const post = async (path, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, headers: Object.fromEntries(response.headers) };
};

const attackPhone = async (phone, times, { label } = {}) => {
  console.log(`\n=== ${label || phone}：连发 ${times} 次 ===`);

  let ok = 0;
  let blocked = 0;
  let firstBlockAt = null;

  for (let i = 1; i <= times; i += 1) {
    const result = await post("/api/sms/send", { phone });

    if (result.status === 200) {
      ok += 1;
    } else {
      blocked += 1;
      if (firstBlockAt === null) firstBlockAt = i;

      if (i <= 3 || i === firstBlockAt) {
        console.log(`  第 ${i} 次：${result.status} ${result.data.error || ""}（${result.headers["retry-after"] || "-"}s 后重试）`);
      }
    }
  }

  console.log(`  结果：成功 ${ok}，被拦 ${blocked}，首次拦截在第 ${firstBlockAt || "-"} 次`);

  return { ok, blocked, firstBlockAt };
};

const main = async () => {
  console.log("=== 短信轰炸测试 ===\n");
  console.log("先看终端的假短信输出，数一下实际发了几条。\n");

  // 1. 同一个号码连发 8 次
  await attackPhone("13800138000", 8, { label: "同一号码" });

  // 2. 换号码，但同一个 IP
  console.log("\n=== 换号码，同一 IP ===");
  let ipBlocked = 0;

  for (let i = 0; i < 15; i += 1) {
    const phone = `1390013${String(8000 + i).padStart(4, "0")}`;
    const result = await post("/api/sms/send", { phone });

    if (result.status === 429) ipBlocked += 1;
  }

  console.log(`  15 个不同号码：${ipBlocked} 次被 IP 限频拦截`);

  // 3. 暴力猜验证码
  console.log("\n=== 暴力猜验证码（同一个码试 10 次）===");

  await post("/api/sms/send", { phone: "13700137000" });

  for (let i = 1; i <= 10; i += 1) {
    const guess = String(100000 + i).slice(0, 6);
    const result = await post("/api/sms/verify", { phone: "13700137000", code: guess });

    console.log(`  第 ${i} 次猜 ${guess}：${result.status} ${result.data.error || ""}`);

    if (result.status === 200) {
      console.log("  ⚠️ 猜中了（这在真实场景里意味着你的 attempts 限制没生效）");
      break;
    }
  }

  console.log("\n=== 结论 ===");
  console.log("如果上面的数字显示『大量成功』，说明限频没生效。");
  console.log("看终端里【假短信】出现了几次，那个数字就是你会付的钱。");
};

main().catch((error) => {
  console.error("测试失败：", error.message);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "attack:sms": "node attacks/sms-bomb.js"
```

## 4.2 跑，然后数终端

**跑：**

```text
npm run attack:sms
```

**同时看服务端终端，数【假短信】出现了几次。**

**正确的输出应该是：**

```text
=== 同一号码：连发 8 次 ===
  第 2 次：429 请求太频繁，请稍后再试（60s 后重试）
  结果：成功 1，被拦 7，首次拦截在第 2 次
```

**终端里只有 1 条【假短信】。**

**然后：**

```text
=== 换号码，同一 IP ===
  15 个不同号码：9 次被 IP 限频拦截
```

**因为 IP 限额是 10 次/分钟，前面已经用了 1 次，所以最多再通过 9 次。**

**然后：**

```text
=== 暴力猜验证码 ===
  第 1 次猜 100001：400 验证码不正确，还剩 4 次机会
  ...
  第 5 次猜 100005：400 验证码不正确，还剩 0 次机会
  第 6 次猜 100006：400 错误次数过多，请重新获取验证码
```

**从第 6 次开始被锁。**

**这就是 `MAX_ATTEMPTS = 5` 生效。**

## 4.3 三个数字要记下来

```text
同一号码连发 8 次 → 实际发出 ___ 条短信
15 个不同号码 → 实际发出 ___ 条
暴力猜 → 最多试 ___ 次就锁
```

**这三个数字，就是"你的系统一晚上会被刷多少钱"的答案。**

**如果第一个数字是 8，你的限频根本没生效 —— 8 条 × 0.05 = 0.4 元，看起来不多，但攻击者能跑 1000 个号码。**

**1000 × 8 × 0.05 = 400 元。一夜。**

---

# 第 5 步：五个必须知道的坑（20 分钟）

## 坑 1：限频的 key 用了 `req.body.phone`，但 body 没解析

```javascript
keyFn: (req) => req.body?.phone
```

**如果 `express.json()` 在限频中间件之后注册，`req.body` 是 undefined。**

**结果：所有请求的 key 都是 `undefined` → 全部算同一个 key → 第 2 个请求就被拦。**

**症状：** 只有第一个用户能发短信，其他人都 429。

**修法：限频中间件必须放在 `express.json()` 之后。**

```javascript
app.use(express.json({ limit: "64kb" }));
// ...
app.post("/api/sms/send", ipLimit, phoneLimit, ...)   // 这里 req.body 已经有了
```

## 坑 2：内存限频在多进程下失效

**`pm2 start app.js -i 4`（4 个进程）。**

**每个进程有自己的 Map。**

**限制"10 次/分钟" → 实际是 40 次/分钟。**

**修法（按优先级）：**

```text
① 单进程部署（这一周的做法，够用到第 29 周）
② 用数据库表做计数（慢但可靠）
③ Redis（第 29 周之后）
```

**这一周先单进程，但要在 README 写明这个限制。**

**为什么不能忽略：** 第 29 周你做 Docker + 多实例时，会突然发现"限频不管用了"。

## 坑 3：`req.ip` 是代理 IP

**见 3.3。**

**本地开发时 `req.ip` 是 `::1`，所有请求同一个 IP。**

**所以你的 IP 限额测试，实际上是"自己跟自己抢额度"。**

**这就是为什么 `attack:sms` 里"15 个不同号码"会被拦 —— 因为 IP 是同一个。**

**生产环境有 `trust proxy` 才正常。**

## 坑 4：验证码不失效

```javascript
// 校验通过后忘了标记
if (hashCode(code) === row.code_hash) return { ok: true };
```

**后果：**

```text
用户登录成功，验证码还能再用 5 分钟
如果验证码被泄露（比如用户截图发群），别人能登他的号
```

**必须 `used_at` 标记。**

**而且要检查 `used_at IS NULL`（查询时已经加了）。**

## 坑 5：`Retry-After` 单位

```javascript
res.setHeader("Retry-After", Math.ceil(result.resetInMs / 1000));
```

**`Retry-After` 的值是**秒**，不是毫秒。**

**写错了，前端会等 60000 秒（16 小时）。**

**这个错误不会报错，只会让用户觉得"你的网站卡住了"。**

---

# 第 6 步：故意做五个实验（20 分钟）

## 实验 1：去掉 IP 限频

**只留 phoneLimit 和 phoneDailyLimit。**

**跑脚本的"15 个不同号码"那一段。**

**应该全部成功（15 条短信）。**

**这就是"只按号码限"的漏洞：攻击者换号码就行。**

## 实验 2：去掉 `attempts` 限制

**把 `if (row.attempts >= MAX_ATTEMPTS)` 注释掉。**

**跑"暴力猜验证码"。**

**10 次全部能试。**

**然后算：** 6 位数字 100 万种，5 分钟窗口，如果不限次数，脚本能试多少次？

```text
每次请求 20ms → 每秒 50 次 → 5 分钟 15000 次
15000 / 1000000 = 1.5%
```

**1.5% 的成功率，看起来低。但如果攻击者同时刷 100 个号码，就有 1.5 个成功。**

**而且真实系统的响应更快（10ms），成功率到 3%。**

**这就是为什么必须限次数。**

## 实验 3：把验证码改成 4 位

**`crypto.randomInt(0, 10000)`。**

**4 位 = 10000 种。**

**不限次数的话：5 分钟能试 15000 次 → 100% 成功。**

**这就是"4 位码必须限次数"的数学依据。**

## 实验 4：把 `padStart` 去掉

**`String(crypto.randomInt(0, 1000000))` 不补零。**

**多发几次，看有没有出现 3 位、4 位的验证码。**

**概率约 10%（小于 100000 的数占 10%）。**

**这些短码，攻击者只要试 1000 次就能中。**

**加回 `padStart`。**

## 实验 5：TTL 改成 24 小时

**看 `verifyCode` 里过期的判断。**

**然后想：用户晚上 10 点申请验证码，第二天早上 8 点还能用。**

**如果他的手机在这期间被别人拿到……**

**改成 5 分钟。**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 三个数字（同号码实发几条、15 个号码实发几条、暴力猜最多几次）
2. 三种限频算法的差别
3. 为什么 `attempts` 要存数据库
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：加"图形验证码"

**在发短信之前，要求用户先过一个图形验证码。**

**为什么：这是"人机验证"的第一层，成本极低。**

**实现（不装包的土办法）：**

```javascript
// 生成一个简单的数学题
app.get("/api/captcha", (req, res) => {
  const a = crypto.randomInt(1, 10);
  const b = crypto.randomInt(1, 10);
  const answer = a + b;

  // 存到 session 或签名的 cookie 里
  res.cookie("captcha", String(answer), { httpOnly: true, maxAge: 120000 });
  res.json({ question: `${a} + ${b} = ?` });
});
```

**然后在 `/api/sms/send` 里要求带上答案。**

**注意：这只是"挡住最笨的脚本"，认真的攻击者能 OCR。真正的方案是行为验证（第 26 周会讲）。**

## 练习二：加"发送记录"，能查历史

**要求：** 把每次发送记到 `sms_logs` 表（phone、ip、时间、结果）。

**用途：**

```text
客户投诉"我没收到验证码" → 你能查是不是发了
怀疑被刷 → 你能查是哪个 IP 在刷
对账 → 和运营商账单核对
```

**这一条是"运维能力"，不是"安全能力"。但两者都需要。**

## 练习三：日限额改成"按号码 + 按 IP 双限额"

**要求：**

```text
同号码：每天 10 次
同 IP：每天 50 次
```

**为什么加 IP 日限额：**

**攻击者如果用 100 个号码但同一个 IP，号码限额没用（每个号码只用 1 次）。**

## 练习四：想清楚这四个问题

```text
1. 为什么"只按 IP 限"或"只按号码限"都不够？
2. 为什么验证码用 SHA-256 而密码用 bcrypt？
3. 为什么 attempts 要存数据库，不能只放内存？
4. `req.ip` 前面有代理时会变成什么？怎么修？
```

---

# 第 9 步：最终验收

## A. 代码

- [ ] `sms.js` 有 `createCode` / `verifyCode` / `sendSms`
- [ ] 验证码用 `crypto.randomInt` + `padStart(6, "0")`
- [ ] 存哈希不存原文
- [ ] 有 `attempts` 上限
- [ ] 有用后失效
- [ ] `ratelimit.js` 三种算法都能用
- [ ] 短信接口有三道限频
- [ ] `app.set("trust proxy", 1)` 有

## B. 实测

- [ ] 同一号码连发 8 次，只有 1 条短信
- [ ] 15 个不同号码被 IP 限拦
- [ ] 暴力猜 5 次后锁定
- [ ] 我记录过实际发出的短信条数

## C. 认知

- [ ] 我能说出三种限频算法各自的优缺点
- [ ] 我知道为什么验证码也要哈希
- [ ] 我知道 `attempts` 为什么必须在数据库
- [ ] 我知道内存限频在多进程下会失效

## 本节课要能说出口的一句话

> **限频不是消灭攻击，是让攻击变贵。三个维度叠加，攻击成本才真的上去。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 只有第一个用户能发 | 限频 key 是 `undefined` | 中间件放在 `json()` 之后 |
| 所有人共享限额 | `req.ip` 是代理 IP | `app.set("trust proxy", 1)` |
| 验证码是 3 位 | 没 `padStart` | 补零到 6 位 |
| 验证码能重复用 | 没标记 `used_at` | 加标记 |
| 验证码一年后还能用 | TTL 太长 | 5 分钟 |
| 429 但 `Retry-After` 是 60000 | 单位错（毫秒） | 除以 1000 |
| 多进程限频翻倍 | 内存不共享 | 单进程或换存储 |
| 进程退不出 | `setInterval` 没 `unref` | 加 `unref()` |
| 猜错 100 次还没锁 | `attempts` 没检查 | 检查 `>= MAX_ATTEMPTS` |
| 短信费突然涨 | 前端没禁用按钮 | 前端 + 后端双限 |
