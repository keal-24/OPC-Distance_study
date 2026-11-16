# 第 55 节课：防重复提交——双击一次，扣两次钱

> **这份文件是你（学员）一步一步照着做的手册。**
> 上节课你挡住了"刷"。今天解决另一种更常发生的问题：**同一个请求，因为各种原因被提交了两次。**
> 这个 bug 会让你真金白银地退款。

**建议用时**：140 分钟
**你需要先完成**：第 54 节课（三道限频能跑）

---

# 第 0 步：五种"重复提交"（15 分钟）

## 0.1 五种场景，前三种和你无关

| # | 场景 | 谁的问题 | 后果 |
|---|---|---|---|
| 1 | 用户双击按钮 | 用户手快 | 两条订单 |
| 2 | 用户按 F5 刷新 | 浏览器行为 | 重复提交表单 |
| 3 | 网络超时后客户端重试 | 客户端库 | 重复请求 |
| 4 | 移动端弱网重发 | 网络 | 重复请求 |
| 5 | 攻击者故意重放 | 攻击者 | 重复扣款 |

**注意：第 1 和第 2 种占了 90% 的真实案例。**

**而且它们不是"攻击"，是"正常用户会做的事"。**

## 0.2 一个真实案例

**场景：充值接口**

```text
① 用户点"充值 100 元"
② 网络慢，按钮没反应
③ 用户又点了 3 次
④ 4 个请求都到了服务端
⑤ 4 条充值记录，扣了 400 元
⑥ 用户投诉，你退款，还要向支付渠道解释
```

**这个场景里，"用户"是受害者，"你"是赔钱的人。**

**而且用户完全没恶意 —— 他只是不确定按钮点了没反应。**

## 0.3 三种解法，从便宜到贵

| 解法 | 成本 | 挡住几种 | 适用 |
|---|---|---|---|
| **前端禁用按钮** | 极低 | 只有第 1 种 | 一定要有，但不够 |
| **幂等键（Idempotency-Key）** | 中 | 1-5 全部 | **推荐** |
| **数据库唯一约束** | 低 | 特定场景 | 特定场景 |

**这一节主要讲幂等键，因为它是唯一能"从根本上"解决问题的方案。**

**但要注意：前端禁用按钮必须有。** 因为它是"体验"，不是"安全"。用户点了没反应就会再点，你不能怪用户。

## 0.4 什么叫"幂等"

**幂等（idempotent）：同样的请求执行一次和执行 N 次，结果一样。**

```text
幂等的：GET /api/items/1        （查一次和查十次，结果一样）
幂等的：PUT /api/items/1 {title: "x"}   （设成 x，十次还是 x）
不幂等：POST /api/orders {item: 1}      （下十次单，十条订单）
不幂等：POST /api/pay {amount: 100}     （扣十次钱）
```

**幂等键的作用：把不幂等的操作，变成"同一个键只执行一次"。**

## 0.5 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/idempotency.js` | `src/` | 幂等键中间件 |
| `src/db.js` | `src/` | 加 `idempotency_keys` 表 + `orders` 表 |
| `src/app.js` | `src/` | 下单接口（幂等版） |
| `public/pay.html` | `public/` | 带双击测试的页面 |
| `attacks/replay.js` | `attacks/` | 重放脚本 |
| `results/e06.md` | `results/` | 对比记录 |

---

# 第 1 步：先写一个"会重复扣款"的接口（25 分钟）

**必须先看到 bug，才知道自己在防什么。**

## 1.1 加两张表

```javascript
// 迁移 006
{
  version: "006_create_orders",
  sql: `
    CREATE TABLE orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      item_name  TEXT    NOT NULL,
      amount     INTEGER NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'paid',
      created_at TEXT    NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_orders_user ON orders(user_id);
    CREATE INDEX idx_orders_created ON orders(created_at);
  `,
}
```

**注意 `amount` 是 `INTEGER`，单位是**分**。**

**为什么不用浮点数存钱：**

```javascript
0.1 + 0.2 === 0.30000000000000004
```

**用"分"存整数，永远不会有精度问题。**

**这是钱相关代码的铁律。**

## 1.2 写漏洞版下单接口

```javascript
app.post("/api/orders/unsafe", requireAuth, (req, res) => {
  const { itemName, amount } = req.body ?? {};

  if (typeof itemName !== "string" || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "参数不正确" });
  }

  const now = new Date().toISOString();

  const result = db
    .prepare("INSERT INTO orders (user_id, item_name, amount, created_at) VALUES (?, ?, ?, ?)")
    .run(req.user.id, itemName.slice(0, 100), amount, now);

  console.log(`[order] 新订单 #${result.lastInsertRowid} 金额 ${amount} 分`);

  res.status(201).json({
    orderId: Number(result.lastInsertRowid),
    amount,
  });
});
```

## 1.3 用脚本制造"双击"

**新建 `attacks/replay.js`（先只做双击部分）：**

```javascript
const BASE = "http://localhost:4030";

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const token = response.headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1];
  if (!token) throw new Error("登录失败");
  return token;
};

const order = async (token, path, body, headers = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `auth_token=${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return { status: response.status, data: await response.json().catch(() => ({})) };
};

const main = async () => {
  const token = await login("alice@example.com", "test1234");

  console.log("=== 实验一：同时发 3 个相同的下单请求（模拟双击 + 网络重试）===\n");

  const body = { itemName: "会员月卡", amount: 9900 };

  const results = await Promise.all([
    order(token, "/api/orders/unsafe", body),
    order(token, "/api/orders/unsafe", body),
    order(token, "/api/orders/unsafe", body),
  ]);

  results.forEach((result, index) => {
    console.log(`  第 ${index + 1} 个：HTTP ${result.status}　orderId=${result.data.orderId ?? "-"}`);
  });

  const created = results.filter((result) => result.status === 201);
  const totalAmount = created.reduce((sum, result) => sum + (result.data.amount || 0), 0);

  console.log(`\n  成功创建：${created.length} 条订单`);
  console.log(`  用户被扣：${totalAmount} 分 = ${(totalAmount / 100).toFixed(2)} 元`);
  console.log(`  用户本应被扣：99.00 元`);
  console.log(`  ${created.length > 1 ? "❌ 重复扣款了" : "✅ 只有一条"}`);
};

main().catch((error) => {
  console.error("失败：", error.message);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "attack:replay": "node attacks/replay.js"
```

## 1.4 跑

```text
npm run attack:replay
```

**你应该看到：**

```text
  第 1 个：HTTP 201　orderId=1
  第 2 个：HTTP 201　orderId=2
  第 3 个：HTTP 201　orderId=3

  成功创建：3 条订单
  用户被扣：29700 分 = 297.00 元
  用户本应被扣：99.00 元
  ❌ 重复扣款了
```

**297 元。三个并发请求。**

**注意这是 `Promise.all`，三个请求是**同时**发出的。**

**真实用户双击的间隔大概 200-500ms，也会有同样的结果。**

**查一下数据库：**

```text
npm run db:peek
```

**（如果你还没写 `db:peek`，用 `src/peek.js`。）**

**你会看到三条一模一样的订单。**

---

# 第 2 步：理解为什么"检查一下"不管用（15 分钟）

## 2.1 一个看似合理的错误方案

```javascript
// 错：先查最近有没有相同订单
const recent = db
  .prepare("SELECT * FROM orders WHERE user_id = ? AND item_name = ? AND created_at > ?")
  .get(userId, itemName, new Date(Date.now() - 5000).toISOString());

if (recent) return res.json({ orderId: recent.id, deduped: true });

// 插入
db.prepare("INSERT INTO orders ...").run(...);
```

**看起来对。但三个并发请求：**

```text
请求 A：查到"没有" → 准备插入
请求 B：查到"没有" → 准备插入
请求 C：查到"没有" → 准备插入
→ 三条都插入
```

**这是同一个"先查再写"的竞态问题。和第 50 节的"先查邮箱再注册"是同一个 bug。**

## 2.2 Node 不是单线程吗，为什么会有并发

**Node 是单线程执行 JS，但：**

```text
① await 之间会让出控制权
② 数据库操作是异步的（虽然 node:sqlite 是同步 API，但 Express 处理多个请求时仍会交错）
③ 多个进程/多台服务器更是真并发
```

**关键：即使 Node 单线程，"读-判断-写"这三步之间也可能插入其他请求的执行。**

**这在 `await` 前后特别容易发生。**

**所以：任何"先查再写"的逻辑，在并发下都不可靠。**

## 2.3 唯一可靠的方案：让数据库保证

**和 UNIQUE 约束是同一个思路：把"唯一性"交给一个原子操作。**

**幂等键正是这个思路：**

```text
客户端生成一个唯一键（UUID），随请求发送
服务端把键写入一张有 UNIQUE 约束的表
插入成功 → 第一次，执行业务
插入失败（冲突）→ 重复请求，返回第一次的结果
```

**为什么这个可靠：**

**`INSERT` 的 UNIQUE 冲突检查是数据库层面的原子操作。** 三个并发请求，只有一个能插进去。

---

# 第 3 步：实现幂等键（35 分钟）

## 3.1 表设计

```javascript
// 迁移 007
{
  version: "007_create_idempotency",
  sql: `
    CREATE TABLE idempotency_keys (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      key           TEXT    NOT NULL,
      user_id       INTEGER NOT NULL,
      endpoint      TEXT    NOT NULL,
      request_hash  TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'processing',
      response_code INTEGER,
      response_body TEXT,
      created_at    TEXT    NOT NULL,
      expires_at    TEXT    NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX uniq_idem_key ON idempotency_keys(key, user_id, endpoint);
    CREATE INDEX idx_idem_expires ON idempotency_keys(expires_at);
  `,
}
```

## 3.2 六个字段的设计意图

| 字段 | 作用 | 不写会怎样 |
|---|---|---|
| `key` | 客户端生成的唯一串 | — |
| `user_id` | 归属 | **不同用户的同名 key 会互相干扰** |
| `endpoint` | 哪个接口 | 同一个 key 用在不同接口会串 |
| `request_hash` | 请求体的哈希 | **同 key 不同请求体会被误判为重复** |
| `status` | `processing` / `done` | 区分"正在处理"和"已完成" |
| `response_*` | 第一次的响应 | 重放时能返回和第一次一模一样的响应 |

### 为什么 `user_id` 必须进唯一索引

**如果只有 `key` 唯一：**

```text
攻击者猜到你的 key → 用他的账号发同样的 key
→ 他的请求被当成重复，拿到你的响应（包含你的数据）
```

**加上 `user_id`，每个用户的 key 空间隔离。**

### 为什么 `request_hash` 重要

**场景：客户端复用了 key。**

```text
第一次：POST /api/orders  {item: "月卡", amount: 9900}  key=abc
第二次：POST /api/orders  {item: "年卡", amount: 99000} key=abc   ← 复用了！
```

**如果不检查 `request_hash`，第二次会被当成"重复"，返回"月卡"的结果。**

**用户以为买了年卡，实际什么都没有。**

**正确行为：返回 422 "同一个幂等键不能用于不同的请求"。**

### 为什么 `status` 要分 processing / done

**并发的两个请求（都是第一次）：**

```text
请求 A：插入 key（status=processing）→ 成功 → 开始执行业务
请求 B：插入 key → 冲突 → 查已有记录 → 发现 status=processing
```

**这时 B 应该：**

```text
❌ 不能直接返回（A 还没执行完，没有结果）
❌ 不能重复执行（会重复扣款）
✅ 等一会儿再查，或者返回 409 "正在处理，请稍后重试"
```

**这一周采用简单方案：返回 409 + `Retry-After`。**

**生产级的方案是"等 A 完成，把 A 的响应返回给 B"，但需要轮询或者锁，复杂。先做简单的。**

## 3.3 新建 `src/idempotency.js`

```javascript
import crypto from "node:crypto";
import { db } from "./db.js";

const TTL_SECONDS = 24 * 3600;   // 幂等键保留 24 小时

const hashBody = (body) =>
  crypto.createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex").slice(0, 32);

/**
 * 幂等中间件。
 * 必须放在 requireAuth 之后（要 req.user）。
 * 客户端用 Idempotency-Key 头传键。
 */
export const idempotent = (endpoint) => (req, res, next) => {
  const key = req.get("Idempotency-Key");

  if (!key) {
    return res.status(400).json({ error: "缺少 Idempotency-Key 请求头" });
  }

  // 键格式校验：UUID v4 或 16-64 位的字母数字
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
    return res.status(400).json({ error: "Idempotency-Key 格式不正确" });
  }

  const userId = req.user.id;
  const requestHash = hashBody(req.body);
  const now = new Date();

  // 清理过期（顺手做，不单独跑定时任务）
  db.prepare("DELETE FROM idempotency_keys WHERE expires_at < ?").run(now.toISOString());

  // 尝试占用这个键 —— 靠 UNIQUE 索引保证原子性
  try {
    db.prepare(
      `INSERT INTO idempotency_keys
       (key, user_id, endpoint, request_hash, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'processing', ?, ?)`
    ).run(
      key,
      userId,
      endpoint,
      requestHash,
      now.toISOString(),
      new Date(now.getTime() + TTL_SECONDS * 1000).toISOString()
    );
  } catch (error) {
    if (!String(error.message).includes("UNIQUE constraint failed")) throw error;

    // 冲突：这是重复请求
    const existing = db
      .prepare("SELECT * FROM idempotency_keys WHERE key = ? AND user_id = ? AND endpoint = ?")
      .get(key, userId, endpoint);

    if (!existing) {
      return res.status(409).json({ error: "请求冲突，请重试" });
    }

    // 同一个键但请求体不同 → 客户端的错误
    if (existing.request_hash !== requestHash) {
      return res.status(422).json({
        error: "同一个 Idempotency-Key 不能用于不同的请求",
        code: "IDEMPOTENCY_KEY_REUSED",
      });
    }

    if (existing.status === "processing") {
      res.setHeader("Retry-After", 2);
      return res.status(409).json({ error: "请求正在处理中，请稍后查看结果", code: "IN_PROGRESS" });
    }

    // 已完成：原样返回第一次的响应
    res.setHeader("Idempotent-Replayed", "true");
    res.status(existing.response_code || 200);

    try {
      return res.json(JSON.parse(existing.response_body || "{}"));
    } catch {
      return res.json({});
    }
  }

  // 第一次：把响应拦截下来存库
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    try {
      db.prepare(
        `UPDATE idempotency_keys
         SET status = 'done', response_code = ?, response_body = ?
         WHERE key = ? AND user_id = ? AND endpoint = ?`
      ).run(res.statusCode, JSON.stringify(payload), key, userId, endpoint);
    } catch (error) {
      console.warn("[idempotency] 存响应失败：", error.message);
    }

    return originalJson(payload);
  };

  next();
};
```

## 3.4 五个关键设计

### 设计一：靠 UNIQUE 索引占位，不靠"先查"

**`INSERT` 成功的请求就是"第一个"。**

**这是本节的核心，和上节课的 `UNIQUE` 是同一个思路。**

### 设计二：拦截 `res.json` 存响应

```javascript
const originalJson = res.json.bind(res);
res.json = (payload) => {
  // 存库
  return originalJson(payload);
};
```

**为什么这么做：**

**因为"业务代码"不知道幂等机制的存在。**

**你的订单接口照常 `res.json({...})`，中间件自动把它存下来。**

**这叫"横切关注点"（cross-cutting concern），用中间件处理最干净。**

**注意 `bind(res)`：不 bind 的话，`originalJson` 里的 `this` 会丢，Express 内部会报错。**

### 设计三：TTL 24 小时

**为什么不是永久：**

```text
表会无限增长
24 小时后，同一个 key 再来就是"新请求"（可接受）
```

**为什么不是 5 分钟：**

```text
用户可能隔几小时重试（比如他关页面后第二天想"我到底买没买"）
24 小时覆盖了绝大多数场景
```

### 设计四：清理放在中间件里顺手做

```javascript
db.prepare("DELETE FROM idempotency_keys WHERE expires_at < ?").run(now.toISOString());
```

**为什么不在单独的定时任务里：**

**这一周还没有定时任务（第 16 周才有）。**

**每次请求顺手删一点，成本极低，效果够用。**

**注意：每次请求都跑一次 `DELETE` 是有点浪费。真实项目会加一个"每 N 次才清理一次"的计数器，或者用定时任务。**

### 设计五：`Idempotent-Replayed` 响应头

```javascript
res.setHeader("Idempotent-Replayed", "true");
```

**为什么：**

**让客户端知道"这次是重放，不是新执行"。**

**调试时极有用：**

```text
看到这个头 → 知道是幂等机制生效了，不是真的执行了两次
```

**你的前端也可以据此提示"该操作已完成过"。**

---

# 第 4 步：接进下单接口（20 分钟）

## 4.1 改多个接口

```javascript
import { idempotent } from "./idempotency.js";

app.post("/api/orders", requireAuth, idempotent("POST /api/orders"), (req, res) => {
  const { itemName, amount } = req.body ?? {};

  if (typeof itemName !== "string" || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "参数不正确" });
  }

  if (amount > 1000000) {
    return res.status(400).json({ error: "金额超出限制" });
  }

  const now = new Date().toISOString();

  const result = db
    .prepare("INSERT INTO orders (user_id, item_name, amount, created_at) VALUES (?, ?, ?, ?)")
    .run(req.user.id, itemName.slice(0, 100), amount, now);

  console.log(`[order] 新订单 #${result.lastInsertRowid} 金额 ${amount} 分 user=${req.user.id}`);

  res.status(201).json({
    orderId: Number(result.lastInsertRowid),
    amount,
    message: "下单成功",
  });
});
```

## 4.2 前端：生成并保持幂等键

**关键：同一个"用户操作"必须用同一个键。**

**新建 `public/pay.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>下单</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      max-width: 520px; margin: 40px auto; padding: 0 20px;
      background: #f5f6f8; color: #16181d;
    }
    .card {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
      padding: 22px;
    }
    h1 { font-size: 17px; margin: 0 0 18px; font-weight: 600; }
    .item {
      display: flex; justify-content: space-between; padding: 10px 0;
      border-bottom: 1px solid #f0f1f3; font-size: 14px;
    }
    .btn-row { display: flex; gap: 10px; margin-top: 20px; }
    button {
      flex: 1; padding: 11px; font: inherit; border: none; border-radius: 8px;
      background: #1a6dff; color: #fff; cursor: pointer;
    }
    button.ghost { background: #fff; color: #1a1a1a; border: 1px solid #d1d5db; }
    button:disabled { background: #a9c1e8; }
    .msg { margin-top: 16px; font-size: 13px; min-height: 20px; white-space: pre-wrap; }
    .msg.ok { color: #15803d; }
    .msg.err { color: #b91c1c; }
    .hint { font-size: 12px; color: #9ca3af; margin-top: 10px; line-height: 1.7; }
    code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>购买会员</h1>

    <div class="item"><span>会员月卡</span><span>¥99.00</span></div>

    <div class="btn-row">
      <button id="pay">立即支付（正常）</button>
    </div>
    <div class="btn-row">
      <button id="double" class="ghost">模拟双击（连发 3 次）</button>
    </div>
    <div class="btn-row">
      <button id="refresh" class="ghost">换一个幂等键（当作新订单）</button>
    </div>

    <div class="msg" id="msg"></div>

    <div class="hint">
      当前幂等键：<code id="key">-</code><br />
      同一个键重复请求 → 服务端只执行一次，返回同一个结果。<br />
      点"换一个键"后再支付 → 是真正的新订单。
    </div>
  </div>

  <script>
    const msg = document.getElementById("msg");
    const keyEl = document.getElementById("key");

    const show = (text, type = "") => {
      msg.textContent = text;
      msg.className = `msg ${type}`;
    };

    const uuid = () =>
      crypto.randomUUID().replace(/-/g, "").slice(0, 32);

    // 关键：key 存在 sessionStorage，刷新页面也不变
    const keyStore = {
      get() {
        let key = sessionStorage.getItem("idem_key");
        if (!key) {
          key = uuid();
          sessionStorage.setItem("idem_key", key);
        }
        return key;
      },
      reset() {
        const key = uuid();
        sessionStorage.setItem("idem_key", key);
        return key;
      },
    };

    keyEl.textContent = keyStore.get();

    const pay = async () => {
      const key = keyStore.get();
      const started = performance.now();

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        credentials: "same-origin",
        body: JSON.stringify({ itemName: "会员月卡", amount: 9900 }),
      });

      const data = await response.json().catch(() => ({}));
      const ms = Math.round(performance.now() - started);
      const replayed = response.headers.get("Idempotent-Replayed") === "true";

      return { status: response.status, data, ms, replayed };
    };

    document.getElementById("pay").addEventListener("click", async () => {
      show("提交中……");
      try {
        const result = await pay();
        show(
          `HTTP ${result.status}　${result.ms}ms\n` +
            `orderId=${result.data.orderId ?? "-"}　` +
            (result.replayed ? "（重放，未重复执行）" : "（首次执行）"),
          result.status < 300 ? "ok" : "err"
        );
      } catch (error) {
        show(`失败：${error.message}`, "err");
      }
    });

    document.getElementById("double").addEventListener("click", async () => {
      show("同时发 3 个请求……");
      const key = keyStore.get();

      try {
        const results = await Promise.all([pay(), pay(), pay()]);
        const lines = results.map(
          (result, index) =>
            `第 ${index + 1} 次：HTTP ${result.status}　orderId=${result.data.orderId ?? "-"}` +
            (result.replayed ? "（重放）" : result.status === 409 ? "（处理中）" : "（执行）")
        );

        // 注意：这里三次都用了同一个 key
        show(`${lines.join("\n")}\n\n幂等键：${key}`, "ok");
      } catch (error) {
        show(`失败：${error.message}`, "err");
      }
    });

    document.getElementById("refresh").addEventListener("click", () => {
      keyEl.textContent = keyStore.reset();
      show("已换新键，下一次支付会被当作新订单", "ok");
    });
  </script>
</body>
</html>
```

## 4.3 三个关键点

### 关键点一：key 存在 `sessionStorage`，不是内存变量

**为什么：**

```text
内存变量 → 刷新页面就没了 → 用户刷新后重试变成"新订单"
sessionStorage → 同一个标签页内保持，刷新不丢
```

**为什么不用 `localStorage`：**

```text
localStorage 跨标签页共享
→ 用户在两个标签页各下一单，会用同一个 key
→ 第二单被当成重复
```

**`sessionStorage` 是"每个标签页独立"，正合适。**

### 关键点二：key 在"用户操作开始时"生成，不是"每次请求时"

**正确：**

```text
用户点"支付" → 生成 key → 发请求
用户再点（网络慢）→ 用同一个 key → 发请求
```

**错误：**

```text
用户点"支付" → 每次 fetch 内部生成新 key → 两次请求两个 key → 两条订单
```

**这就是为什么 `pay()` 用的是 `keyStore.get()` 而不是 `uuid()`。**

### 关键点三：`Idempotent-Replayed` 让前端能提示

**用户看到"（重放，未重复执行）"，就知道"我的钱没被扣两次"。**

**这个提示能省掉大量客服工单。**

## 4.4 跑一遍

**1. 启动服务，登录，打开：**

```text
http://localhost:4030/pay.html
```

**2. 点"立即支付"。**

**应该显示"首次执行"。**

**3. 再点一次"立即支付"（同一个 key）。**

**应该显示"重放，未重复执行"，`orderId` 一样。**

**4. 点"模拟双击"。**

**三个请求，应该：**

```text
第 1 次：HTTP 201 orderId=5（执行）
第 2 次：HTTP 201 orderId=5（重放）
第 3 次：HTTP 201 orderId=5（重放）
```

**或者某个返回 409（处理中）—— 取决于并发时序。**

**5. 点"换一个幂等键"，再支付。**

**这次是真正的新订单，`orderId` 变了。**

**6. 查数据库：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,user_id,item_name,amount,created_at FROM orders ORDER BY id DESC LIMIT 10').all()))"
```

**应该只有几条（每次"换键"一条），不是每次点击都多一条。**

---

# 第 5 步：用脚本验证（20 分钟）

**改 `attacks/replay.js`，让它测三种情况：**

```javascript
import crypto from "node:crypto";

const BASE = "http://localhost:4030";

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const token = response.headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1];
  if (!token) throw new Error("登录失败");
  return token;
};

const post = async (token, path, body, headers = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `auth_token=${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    replayed: response.headers.get("idempotent-replayed") === "true",
    data: await response.json().catch(() => ({})),
  };
};

const newKey = () => crypto.randomUUID().replace(/-/g, "");

const scenario = async (title, fn) => {
  console.log(`\n=== ${title} ===\n`);
  const result = await fn();
  console.log();
  return result;
};

const main = async () => {
  const token = await login("alice@example.com", "test1234");
  const body = { itemName: "会员月卡", amount: 9900 };

  await scenario("1. 漏洞版：3 个并发（应该重复扣款）", async () => {
    const results = await Promise.all([
      post(token, "/api/orders/unsafe", body),
      post(token, "/api/orders/unsafe", body),
      post(token, "/api/orders/unsafe", body),
    ]);

    const created = results.filter((result) => result.status === 201);
    results.forEach((result, index) => {
      console.log(`  ${index + 1}. HTTP ${result.status} orderId=${result.data.orderId ?? "-"}`);
    });
    console.log(`  创建了 ${created.length} 条，总计 ${created.reduce((sum, r) => sum + (r.data.amount || 0), 0) / 100} 元`);
  });

  await scenario("2. 幂等版：3 个并发，同一个 key", async () => {
    const key = newKey();
    const results = await Promise.all([
      post(token, "/api/orders", body, { "Idempotency-Key": key }),
      post(token, "/api/orders", body, { "Idempotency-Key": key }),
      post(token, "/api/orders", body, { "Idempotency-Key": key }),
    ]);

    results.forEach((result, index) => {
      const tag = result.replayed ? "重放" : result.status === 409 ? "处理中" : "执行";
      console.log(`  ${index + 1}. HTTP ${result.status} orderId=${result.data.orderId ?? "-"}（${tag}）`);
    });

    const orderIds = new Set(results.filter((r) => r.data.orderId).map((r) => r.data.orderId));
    console.log(`  唯一 orderId 数量：${orderIds.size}（应该是 1）`);
  });

  await scenario("3. 幂等版：串行两次，同一个 key", async () => {
    const key = newKey();
    const first = await post(token, "/api/orders", body, { "Idempotency-Key": key });
    const second = await post(token, "/api/orders", body, { "Idempotency-Key": key });

    console.log(`  第一次：HTTP ${first.status} orderId=${first.data.orderId} ${first.replayed ? "重放" : "执行"}`);
    console.log(`  第二次：HTTP ${second.status} orderId=${second.data.orderId} ${second.replayed ? "重放" : "执行"}`);
    console.log(`  ${first.data.orderId === second.data.orderId ? "✅ 同一个订单" : "❌ 两条订单"}`);
  });

  await scenario("4. 同一个 key，不同请求体（应该拒绝）", async () => {
    const key = newKey();
    await post(token, "/api/orders", { itemName: "月卡", amount: 9900 }, { "Idempotency-Key": key });
    const second = await post(token, "/api/orders", { itemName: "年卡", amount: 99000 }, { "Idempotency-Key": key });

    console.log(`  第二次：HTTP ${second.status} ${second.data.error || ""}`);
    console.log(`  ${second.status === 422 ? "✅ 被拒绝" : "❌ 应该 422"}`);
  });

  await scenario("5. 没有 Idempotency-Key（应该 400）", async () => {
    const result = await post(token, "/api/orders", body);
    console.log(`  HTTP ${result.status} ${result.data.error || ""}`);
    console.log(`  ${result.status === 400 ? "✅ 被拒绝" : "❌ 应该 400"}`);
  });

  await scenario("6. 同一个 key，不同用户（应该各自成功）", async () => {
    const bob = await login("bob@example.com", "test1234");
    const key = newKey();

    const aliceResult = await post(token, "/api/orders", body, { "Idempotency-Key": key });
    const bobResult = await post(bob, "/api/orders", body, { "Idempotency-Key": key });

    console.log(`  Alice：HTTP ${aliceResult.status} orderId=${aliceResult.data.orderId}`);
    console.log(`  Bob  ：HTTP ${bobResult.status} orderId=${bobResult.data.orderId}`);
    console.log(
      `  ${aliceResult.data.orderId !== bobResult.data.orderId ? "✅ 两个不同订单（key 空间按用户隔离）" : "❌ 串了"}`
    );
  });
};

main().catch((error) => {
  console.error("失败：", error.message);
  process.exitCode = 1;
});
```

**跑：**

```text
npm run attack:replay
```

## 5.1 六个场景的预期结果

| # | 场景 | 预期 |
|---|---|---|
| 1 | 漏洞版 3 并发 | 3 条订单（重复扣款） |
| 2 | 幂等版 3 并发 | 1 个 orderId（其余是重放或 409） |
| 3 | 幂等版串行 2 次 | 同一个 orderId |
| 4 | 同 key 不同请求体 | 422 |
| 5 | 没有 key | 400 |
| 6 | 同 key 不同用户 | 两个订单 |

**第 6 个是最容易被忽略的。**

**如果 `user_id` 不在唯一索引里，Bob 的请求会被当成 Alice 的重复，拿到 Alice 的订单号 —— 这就是串号。**

---

# 第 6 步：五个必须知道的坑（20 分钟）

## 坑 1：前端每次请求生成新 key

```javascript
// 错
const response = await fetch("/api/orders", {
  headers: { "Idempotency-Key": uuid() },   // 每次都是新的！
});
```

**这就完全失去了幂等的意义。**

**key 必须"跟着用户意图走"，而不是"跟着请求走"。**

**正确：在用户点按钮之前生成，存在 sessionStorage，多次请求复用。**

## 坑 2：`request_hash` 只哈希了部分字段

```javascript
const hashBody = (body) => sha256(body.itemName);   // 漏了 amount
```

**后果：**

```text
{itemName: "月卡", amount: 9900}   → hash A
{itemName: "月卡", amount: 99000}  → 也是 hash A
→ 第二个被判为"重复"，返回第一个的结果
```

**用户付了 990 元，拿到 99 元的订单。**

**必须哈希整个 body（用 `JSON.stringify(body)`）。**

## 坑 3：`res.json` 拦截放在 `next()` 之后

```javascript
// 错
next();
const originalJson = res.json.bind(res);
res.json = ...;
```

**`next()` 之后业务代码可能已经同步执行完了（如果没有 await），你的拦截来不及。**

**必须在 `next()` 之前替换。**

## 坑 4：`processing` 状态永远不结束

**如果业务代码抛异常，`res.json` 没被调用：**

```text
幂等键永远是 processing
→ 用户重试永远拿到 409
→ 这个 key 废了，要等 24 小时过期
```

**修法：**

```javascript
try {
  next();
} catch (error) {
  db.prepare("DELETE FROM idempotency_keys WHERE key = ? AND user_id = ? AND endpoint = ?").run(
    key, userId, endpoint
  );
  throw error;
}
```

**或者用 `res.on("finish")` 判断是否真的响应了。**

**今天先简单处理：在业务代码里所有分支都必须 `res.json`（不允许裸 `return`）。**

**这是约束，不是解法。练习里会让你加真正的清理。**

## 坑 5：忘记 `user_id` 进唯一索引

**见 5.1 的第 6 个场景。**

**串号是最严重的后果 —— 比重复扣款严重。**

**重复扣款是钱的事，串号是数据泄漏。**

---

# 第 7 步：故意做四个实验（15 分钟）

## 实验 1：把 `user_id` 从唯一索引里去掉

**改迁移（或手动改表）：**

```sql
DROP INDEX uniq_idem_key;
CREATE UNIQUE INDEX uniq_idem_key ON idempotency_keys(key, endpoint);
```

**跑脚本的第 6 个场景。**

**Bob 会拿到 Alice 的订单号。**

**这就是串号。改回来。**

## 实验 2：`request_hash` 只哈希 `itemName`

**改 `hashBody`。**

**跑第 4 个场景（同 key 不同金额）。**

**应该会返回"成功"而不是 422 —— 而且返回的是第一单的金额。**

**用户付了 990 元拿到 99 元的订单。**

## 实验 3：不传 `Idempotency-Key`

**跑第 5 个场景。**

**看是不是 400。**

**然后想：如果设计成"没有 key 就跳过幂等检查"，会怎样？**

**答案：攻击者只要不传 key 就能绕过。所以必须强制要求。**

## 实验 4：`status` 一直是 `processing`

**注释掉 `res.json` 的拦截。**

**然后：**

```text
第一次请求 → 成功创建，但 status 还是 processing
第二次请求 → 409（永远）
```

**这个 key 就废了。**

**加回拦截。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 漏洞版的输出（3 条订单）
2. 幂等版的输出（1 个 orderId）
3. 六个场景的表格
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：处理 `processing` 的清理

**要求：** 用 `res.on("finish")` 检测"响应是否真的发出了"。

```javascript
res.on("finish", () => {
  // 检查这条 key 是不是还是 processing
  // 如果是，说明业务代码没调 res.json → 删掉这条 key
});
```

**为什么要做：** 防止"业务抛异常"导致 key 永久卡死。

## 练习二：加"正在处理时轮询"

**要求：** 返回 409 时带上 `Retry-After: 2`，前端自动重试 3 次（间隔 2 秒）。

**为什么：**

**真实的并发双击，第二个请求应该"等第一个完成，然后拿到结果"，而不是"直接报错让用户重试"。**

**这个体验差距很大。**

## 练习三：给支付接口加"金额校验"

**要求：** 服务端从数据库读商品价格，**不信前端传来的 `amount`。**

```javascript
// 错
const { itemName, amount } = req.body;   // 前端能传 1 分钱

// 对
const product = db.prepare("SELECT price FROM products WHERE id = ?").get(productId);
const amount = product.price;
```

**这是本节之外但同等重要的漏洞：金额篡改。**

**第 25 周做支付时会重点讲。**

## 练习四：想清楚这四个问题

```text
1. 为什么"先查有没有相同订单"在并发下不可靠？
2. 为什么幂等键的 key 要存在 sessionStorage 而不是 localStorage？
3. 为什么 request_hash 必须包含整个 body？
4. 为什么 user_id 必须进唯一索引？
```

---

# 第 10 步：最终验收

## A. 代码

- [ ] `idempotency_keys` 表有 `UNIQUE(key, user_id, endpoint)`
- [ ] `idempotency.js` 有 `idempotent` 中间件
- [ ] 靠 `INSERT` 冲突判断重复
- [ ] 检查 `request_hash`
- [ ] 拦截 `res.json` 存响应
- [ ] 前端 key 存 `sessionStorage`
- [ ] key 在"用户操作开始时"生成

## B. 实测

- [ ] 漏洞版 3 并发 → 3 条订单
- [ ] 幂等版 3 并发 → 1 个 orderId
- [ ] 同 key 不同 body → 422
- [ ] 没有 key → 400
- [ ] 同 key 不同用户 → 两个订单
- [ ] 我做过"去掉 user_id"的串号实验

## C. 认知

- [ ] 我能说出五种重复提交场景
- [ ] 我知道为什么"先查再写"不可靠
- [ ] 我知道 `request_hash` 的作用
- [ ] 我知道 `processing` 状态为什么会卡死

## 本节课要能说出口的一句话

> **幂等不是"防重复"，是"同一个键只执行一次"。键跟着用户意图走，不跟着请求走。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 双击还是两条订单 | 前端每次生成新 key | key 存 sessionStorage |
| 第二次请求 400 | 没传 key | 前端加 header |
| 一直 409 | `processing` 卡住 | 检查业务是否都调了 `res.json` |
| 同 key 不同 body 也成功 | 没检查 `request_hash` | 加检查 |
| Bob 拿到 Alice 的订单 | `user_id` 不在唯一索引 | 加进去 |
| `originalJson` 报 this 错 | 没 `bind(res)` | `bind(res)` |
| 幂等键表越来越大 | 没清理 | TTL + 清理 |
| 重放响应里少了头 | 没设 `Idempotent-Replayed` | 加上 |
| 刷新页面后变新订单 | key 存内存 | 存 sessionStorage |
| 两个标签页互相干扰 | key 存 localStorage | 改 sessionStorage |
