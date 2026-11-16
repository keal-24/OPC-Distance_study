# 第 53 节课：权限判断——先亲手打穿一次越权，再修好

> **这份文件是你（学员）一步一步照着做的手册。**
> 上节课你能分辨"登录了"和"没登录"。今天要分辨"登录了"和"**这是不是你的数据**"。
> 这节课你会先写一个**有漏洞的接口**，然后用自己的 Cookie 打穿它，看着别人的数据出现。

**建议用时**：150 分钟
**你需要先完成**：第 52 节课（能登录，`/api/me` 正常）

---

# 第 0 步：IDOR 是什么，为什么它是第一名（10 分钟）

## 0.1 一个真实的接口

```javascript
app.get("/api/items/:id", requireAuth, (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(Number(req.params.id));
  res.json(item);
});
```

**这段代码有一处检查：`requireAuth`（你登录了吗）。**

**它少了另一处：这条数据是不是你的。**

**攻击方式：**

```text
用户 A 登录，他的 item id 是 5
他把 URL 改成 /api/items/6
→ 看到用户 B 的 item
```

**一行 URL，不需要任何工具。**

**这个漏洞叫 IDOR（Insecure Direct Object Reference，不安全的直接对象引用）。**

## 0.2 为什么它是第一名

**OWASP（开放式 Web 应用安全项目）的 API 安全前十大风险里，BOLA（Broken Object Level Authorization，对象级授权失效）排第一。**

**原因：**

```text
① 它太容易犯 —— 每个"按 id 查一条"的接口都是一个机会
② 它太容易被自动化 —— 攻击者写个循环 1 到 100000 就扫完了
③ 它不会报错 —— 你的服务日志里全是 200，看起来一切正常
④ 大多数框架不帮你防 —— 框架只管"登录了吗"，不管"是你的吗"
```

## 0.3 为什么这一节要"先打穿再修"

**因为"我知道要检查归属"这句话，你已经听过很多遍。**

**但你知道要检查哪个字段吗？知道哪种写法会漏吗？知道漏了之后长什么样吗？**

**不知道。所以要亲手做一遍。**

**做完之后，你写任何接口都会先想一句："这条数据，属于谁？"**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/db.js` | `src/` | 加 `items` 表 |
| `src/items.js` | `src/` | 有漏洞版 + 修好版 |
| `src/auth.js` | `src/` | 加 `requireRole` |
| `src/app.js` | `src/` | items 接口（先漏洞后修） |
| `attacks/idor.js` | `attacks/` | 越权脚本 |
| `results/e04.md` | `results/` | 打穿记录 |

---

# 第 1 步：建一张"有主人"的表（20 分钟）

## 1.1 在 `db.js` 的 migrations 里加

```javascript
{
  version: "004_create_items",
  sql: `
    CREATE TABLE items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      title      TEXT    NOT NULL,
      body       TEXT,
      visibility TEXT    NOT NULL DEFAULT 'private',
      created_at TEXT    NOT NULL,
      updated_at TEXT    NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_items_user ON items(user_id);
    CREATE INDEX idx_items_created ON items(created_at);
  `,
}
```

## 1.2 三个字段决定权限

| 字段 | 作用 |
|---|---|
| `user_id` | **归属**。所有权限判断的基础 |
| `visibility` | `private`（只有主人能看）/ `public`（谁都能看） |
| `id` | 递增的数字，**这就是 IDOR 的入口** |

**注意 `user_id` 有索引。**

**为什么：**

```text
你的列表接口是 WHERE user_id = ?
没有索引 → 全表扫描
有索引   → 直接定位
```

**这是第 5 周讲的索引。** 在这里是刚需，因为"按用户查"是最常见的查询。

**还要注意 `ON DELETE CASCADE`：用户删了，他的数据自动删。**

**不设的话，删用户会失败（外键约束）或者留下孤儿数据。**

## 1.3 造测试数据

**新建 `src/seed-items.js`：**

```javascript
import { db, migrate } from "./db.js";
import { hashPassword, normalizeEmail } from "./users.js";

const seed = async () => {
  migrate();

  const users = [
    { email: "alice@example.com", nickname: "Alice", password: "test1234" },
    { email: "bob@example.com", nickname: "Bob", password: "test1234" },
  ];

  const ids = [];

  for (const user of users) {
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizeEmail(user.email));

    if (existing) {
      ids.push(existing.id);
      continue;
    }

    const hash = await hashPassword(user.password);
    const now = new Date().toISOString();

    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, nickname, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(normalizeEmail(user.email), hash, user.nickname, now, now);

    ids.push(Number(result.lastInsertRowid));
  }

  const [aliceId, bobId] = ids;

  const items = [
    { userId: aliceId, title: "Alice 的私密笔记", body: "这是我的日记，别人不该看到。", visibility: "private" },
    { userId: aliceId, title: "Alice 的公开笔记", body: "大家好，这是公开的。", visibility: "public" },
    { userId: bobId, title: "Bob 的私密笔记", body: "Bob 的银行卡后四位是 8888。", visibility: "private" },
    { userId: bobId, title: "Bob 的公开笔记", body: "Bob 也发了一条公开的。", visibility: "public" },
  ];

  const now = new Date().toISOString();

  for (const item of items) {
    const exists = db.prepare("SELECT id FROM items WHERE title = ?").get(item.title);
    if (exists) continue;

    db.prepare(
      `INSERT INTO items (user_id, title, body, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(item.userId, item.title, item.body, item.visibility, now, now);
  }

  console.log("\n===== 种子数据 =====");
  console.table(db.prepare("SELECT id, user_id, title, visibility FROM items").all());
  console.log(`Alice 的 id = ${aliceId}，Bob 的 id = ${bobId}`);
  console.log("两个账号的密码都是 test1234\n");
};

seed().catch((error) => {
  console.error("种子失败：", error);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "db:seed": "node --env-file=.env src/seed-items.js"
```

**跑：**

```text
npm run db:seed
```

**你会看到四行，Alice 两条、Bob 两条，各有 private 和 public。**

**这就是"Alice 不该看到 item 3 和 4"。**

---

# 第 2 步：先写一个漏洞版（25 分钟）

## 2.1 新建 `src/items.js`

```javascript
import { db } from "./db.js";

export const listItems = (userId) =>
  db.prepare("SELECT * FROM items WHERE user_id = ? ORDER BY id DESC").all(userId);

/**
 * ⚠️ 漏洞版：只判断"有没有登录"，不判断"是不是你的"
 * 这节课会用它演示 IDOR，然后修掉。
 */
export const getItemUnsafe = (id) =>
  db.prepare("SELECT * FROM items WHERE id = ?").get(Number(id));

export const getItemSafe = (id, userId) =>
  db
    .prepare("SELECT * FROM items WHERE id = ? AND user_id = ?")
    .get(Number(id), Number(userId));

export const createItem = (userId, { title, body, visibility = "private" }) => {
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO items (user_id, title, body, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(Number(userId), String(title).slice(0, 200), String(body || "").slice(0, 5000), visibility, now, now);

  return Number(result.lastInsertRowid);
};

export const updateItemUnsafe = (id, { title, body }) => {
  db.prepare("UPDATE items SET title = ?, body = ?, updated_at = ? WHERE id = ?").run(
    String(title).slice(0, 200),
    String(body || "").slice(0, 5000),
    new Date().toISOString(),
    Number(id)
  );
};

export const updateItemSafe = (id, userId, { title, body }) => {
  const result = db
    .prepare("UPDATE items SET title = ?, body = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(
      String(title).slice(0, 200),
      String(body || "").slice(0, 5000),
      new Date().toISOString(),
      Number(id),
      Number(userId)
    );

  return result.changes > 0;
};

export const deleteItemUnsafe = (id) => {
  db.prepare("DELETE FROM items WHERE id = ?").run(Number(id));
};

export const deleteItemSafe = (id, userId) => {
  const result = db.prepare("DELETE FROM items WHERE id = ? AND user_id = ?").run(Number(id), Number(userId));
  return result.changes > 0;
};
```

## 2.2 在 `app.js` 里加漏洞版接口

```javascript
import { listItems, getItemUnsafe, createItem } from "./items.js";

app.get("/api/items", requireAuth, (req, res) => {
  res.json({ items: listItems(req.user.id) });
});

// ⚠️ 漏洞接口：故意留着，等下打穿它
app.get("/api/items/:id/unsafe", requireAuth, (req, res) => {
  const item = getItemUnsafe(req.params.id);

  if (!item) return res.status(404).json({ error: "不存在" });

  res.json({ item, warning: "这个接口没有检查归属，是个漏洞" });
});

app.post("/api/items", requireAuth, (req, res) => {
  const { title, body, visibility } = req.body ?? {};

  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "标题必填" });
  }

  const id = createItem(req.user.id, { title, body, visibility });
  res.status(201).json({ id, message: "已创建" });
});
```

## 2.3 一个必须注意的细节

**`getItemUnsafe(req.params.id)` 里，`req.params.id` 是字符串。**

**SQLite 的 `?` 占位符在对比 `INTEGER` 列时，字符串 `"3"` 会被转成 3。**

**所以这个接口"能正常工作"——这正是它危险的地方。**

**如果它报错，你会立刻发现。它不报错，你会以为没问题。**

## 2.4 跑起来，先看看正常情况

**1. 启动：**

```text
npm run dev
```

**2. 用 Alice 登录（浏览器）：**

```text
http://localhost:4030/login.html
alice@example.com / test1234
```

**3. 看自己的列表：**

```text
http://localhost:4030/api/items
```

**应该只有 Alice 的两条。**

**4. 记住 Alice 的某个 id，比如 1。**

**5. 试 `/api/items/3/unsafe`（Bob 的私密笔记）。**

**你应该看到 Bob 的日记。**

**这就是漏洞。**

**现在就打穿了。但要用脚本"自动化地打穿"，才知道它有多严重。**

---

# 第 3 步：写一个越权脚本（30 分钟）

## 3.1 为什么要用脚本

**手动改 URL 一次，你会觉得"就这一次"。**

**脚本跑一遍，你会发现"1 到 100 全都能看"。**

**这个数量级的差别，才会让你真重视。**

## 3.2 新建 `attacks/idor.js`

```javascript
const BASE = "http://localhost:4030";

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`登录失败：${email} → HTTP ${response.status}`);
  }

  const setCookie = response.headers.get("set-cookie");
  const token = setCookie?.match(/auth_token=([^;]+)/)?.[1];

  if (!token) throw new Error("没拿到 Cookie，检查 sameSite / secure");

  return { email, token };
};

const api = async (token, path) => {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Cookie: `auth_token=${token}` },
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }

  return { status: response.status, data };
};

const main = async () => {
  console.log("=== 越权测试（IDOR）===\n");

  const alice = await login("alice@example.com", "test1234");
  const bob = await login("bob@example.com", "test1234");

  console.log(`Alice 登录成功`);
  console.log(`Bob   登录成功\n`);

  // 1. Alice 看自己的列表
  const mine = await api(alice.token, "/api/items");
  console.log(`Alice 的列表：${mine.data.items?.length} 条`);
  mine.data.items?.forEach((item) => {
    console.log(`  #${item.id} ${item.title}（${item.visibility}）`);
  });

  // 2. Bob 看自己的列表（为了知道有哪些 id）
  const bobsList = await api(bob.token, "/api/items");
  const bobIds = (bobsList.data.items || []).map((item) => item.id);
  console.log(`\nBob 的数据 id：${bobIds.join(", ")}`);

  // 3. ★ 核心：用 Alice 的 Cookie 访问 Bob 的数据
  console.log("\n=== 用 Alice 的 Cookie 访问 Bob 的数据 ===\n");

  for (const id of bobIds) {
    const result = await api(alice.token, `/api/items/${id}/unsafe`);

    if (result.status === 200) {
      console.log(`❌ 打穿成功 #${id}：${result.data.item?.title}`);
      console.log(`   内容：${String(result.data.item?.body).slice(0, 40)}`);
    } else {
      console.log(`✅ 被拦住 #${id}：HTTP ${result.status}`);
    }
  }

  // 4. 扫一遍全部 id（真实攻击者的做法）
  console.log("\n=== 遍历 id 1-20（真实攻击者就是这样扫的）===\n");

  const leaked = [];

  for (let id = 1; id <= 20; id += 1) {
    const result = await api(alice.token, `/api/items/${id}/unsafe`);

    if (result.status === 200) {
      leaked.push({ id, title: result.data.item?.title, owner: result.data.item?.user_id });
    }
  }

  console.log(`扫了 20 个 id，拿到 ${leaked.length} 条数据：`);
  leaked.forEach((item) => {
    const tag = item.owner === mine.data.items?.[0]?.user_id ? "（自己的）" : "（⚠️ 别人的）";
    console.log(`  #${item.id} ${item.title} ${tag}`);
  });

  const stolen = leaked.filter((item) => item.owner !== mine.data.items?.[0]?.user_id);
  console.log(`\n其中 ${stolen.length} 条是别人的数据。`);
  console.log(`\n如果这是真实系统，攻击者只需一个免费账号 + 20 行循环代码。`);
};

main().catch((error) => {
  console.error("测试失败：", error.message);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "attack:idor": "node attacks/idor.js"
```

**跑：**

```text
npm run attack:idor
```

## 3.3 你会看到什么

```text
=== 用 Alice 的 Cookie 访问 Bob 的数据 ===

❌ 打穿成功 #3：Bob 的私密笔记
   内容：Bob 的银行卡后四位是 8888。
❌ 打穿成功 #4：Bob 的公开笔记
   内容：Bob 也发了一条公开的。

=== 遍历 id 1-20 ===
扫了 20 个 id，拿到 4 条数据：
  #1 Alice 的私密笔记 （自己的）
  #2 Alice 的公开笔记 （自己的）
  #3 Bob 的私密笔记 （⚠️ 别人的）
  #4 Bob 的公开笔记 （⚠️ 别人的）
```

**`⚠️ 别人的` 这两行，就是这一节课的全部价值。**

**顺便注意 `#3` 是 `private` 的。**

**`visibility: "private"` 在数据库里是有的，但你的代码根本没看这个字段。**

**这就是"字段存在 ≠ 逻辑生效"。**

## 3.4 记录到 `results/e04.md`

```markdown
# 第 53 节 IDOR 打穿记录

## 环境
- 接口：GET /api/items/:id/unsafe
- 登录：Alice（uid=1），目标：Bob（uid=2）

## 结果
| id | 归属 | visibility | 用 Alice 请求的状态 | 是否泄露 |
|---|---|---|---|---|
| 1 | Alice | private | | |
| 2 | Alice | public | | |
| 3 | Bob | private | | |
| 4 | Bob | public | | |

## 结论
（一句话）
```

---

# 第 4 步：修（25 分钟）

## 4.1 三种修法，哪个能真防住

### 修法一（错）：在返回前判断

```javascript
const item = getItemUnsafe(req.params.id);
if (item.user_id !== req.user.id) return res.status(403).json({ error: "无权限" });
```

**能防住吗：能。**

**但为什么这是"次优"的：**

**因为你"先把数据取出来了"，然后在内存里判断。**

**如果某天有人在判断之前加了一行 `console.log(item)`，数据就进日志了。**

**而且这个写法很容易忘 —— 每个接口都要记得写这两行。**

### 修法二（对）：查询时就带上归属条件

```javascript
const item = db
  .prepare("SELECT * FROM items WHERE id = ? AND user_id = ?")
  .get(Number(id), Number(userId));
```

**为什么更好：**

```text
① 数据库层面就过滤了，数据"从未离开数据库"
② 它变成一个"查询条件"，忘不掉（因为函数签名强制你要传 userId）
③ 走索引，性能更好
```

**注意一个副作用：**

```text
如果这条数据不存在 → 返回 undefined
如果这条数据存在但不是你的 → 也返回 undefined
```

**两者无法区分。**

**这意味着你要返回 404 而不是 403。**

**为什么这样更好：**

**403 等于告诉攻击者"这条数据存在，只是不是你的"。这本身也是信息泄露。**

**404 是"没有这个东西"，什么也没泄露。**

**这是一个重要的原则：不要确认"别人拥有的东西是否存在"。**

### 修法三（对，且更彻底）：把 user_id 变成函数签名的一部分

```javascript
export const getItem = (id, userId) => { ... }
```

**注意：`userId` 是必填参数，不是可选。**

**为什么：**

**你想调用 `getItem(5)` 时，它直接报错（参数不够），而不是悄悄不检查。**

**这就是"让错误用法无法编译/运行"的设计。**

**这和上节课的 `toPublicUser` 是同一个思路：把安全的路径变成唯一路径。**

## 4.2 改 `app.js`

```javascript
import { getItemSafe, updateItemSafe, deleteItemSafe } from "./items.js";

// ✅ 修好的版本
app.get("/api/items/:id", requireAuth, (req, res) => {
  const item = getItemSafe(req.params.id, req.user.id);

  // 不存在 和 不是你的，都返回 404 —— 不确认他人数据的存在性
  if (!item) return res.status(404).json({ error: "不存在" });

  res.json({ item });
});

// 公开笔记：任何人能看，但只返回公开字段
app.get("/api/items/:id/public", optionalAuth, (req, res) => {
  const item = db
    .prepare("SELECT id, title, body, created_at FROM items WHERE id = ? AND visibility = 'public'")
    .get(Number(req.params.id));

  if (!item) return res.status(404).json({ error: "不存在" });

  res.json({ item });
});

app.patch("/api/items/:id", requireAuth, (req, res) => {
  const { title, body } = req.body ?? {};

  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "标题必填" });
  }

  const ok = updateItemSafe(req.params.id, req.user.id, { title, body });

  if (!ok) return res.status(404).json({ error: "不存在" });

  res.json({ message: "已更新" });
});

app.delete("/api/items/:id", requireAuth, (req, res) => {
  const ok = deleteItemSafe(req.params.id, req.user.id);

  if (!ok) return res.status(404).json({ error: "不存在" });

  res.json({ message: "已删除" });
});
```

## 4.3 注意 `UPDATE`/`DELETE` 也要防

**很多人只防了 GET，忘了改和删。**

**而且 `UPDATE` 更危险：**

```javascript
// 错的
app.patch("/api/items/:id", requireAuth, (req, res) => {
  updateItemUnsafe(req.params.id, req.body);   // ← 能改别人的
});
```

**攻击者能改掉别人的数据，而且你的日志里是一条成功的 UPDATE。**

**`DELETE` 同理。**

**规则：**

> **每一个带 `:id` 的接口，都必须问一句"这个 id 属于谁"，然后把归属条件写进 WHERE。**

**没有例外。GET / PATCH / PUT / DELETE 全都要。**

## 4.4 验证修好了

**再跑一次攻击脚本：**

```text
npm run attack:idor
```

**但脚本里用的还是 `/unsafe` 路径。**

**改脚本，让它同时测两个路径：**

```javascript
for (const id of bobIds) {
  const unsafe = await api(alice.token, `/api/items/${id}/unsafe`);
  const safe = await api(alice.token, `/api/items/${id}`);

  console.log(`#${id}`);
  console.log(`  /unsafe  → HTTP ${unsafe.status} ${unsafe.status === 200 ? "❌ 泄露" : "✅"}`);
  console.log(`  安全版   → HTTP ${safe.status} ${safe.status === 200 ? "❌ 泄露" : "✅"}`);
}
```

**你应该看到：**

```text
#3
  /unsafe  → HTTP 200 ❌ 泄露
  安全版   → HTTP 404 ✅
```

**修好之后，把 `/unsafe` 接口删掉。**

**为什么"删掉"而不是"留着当反面教材"：**

**留着就是留着一个真漏洞。** 你的代码库不该有能用的漏洞。

**要做反面教材，写在文档里。**

---

# 第 5 步：角色权限（25 分钟）

## 5.1 角色和归属是两层

**归属解决"这条数据是不是你的"。**

**角色解决"你这个身份能不能做这类操作"。**

**两者是 AND 关系：**

```text
能不能删这条数据 = 你是管理员 OR 你是这条数据的主人
```

## 5.2 加 `requireRole`

**在 `auth.js` 里加：**

```javascript
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "请先登录" });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: "权限不足", code: "FORBIDDEN" });
  }

  next();
};
```

**用法：**

```javascript
app.get("/api/admin/users", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ users: db.prepare("SELECT id, email, nickname, role FROM users").all() });
});
```

## 5.3 为什么角色要查数据库，不能只信 JWT

**你的 JWT 里放了 `role`。**

**如果管理员把某人降级成普通用户，他手上的 token 里还是 `admin`。**

**要等 token 过期（7 天）才生效。**

**这就是为什么 `requireAuth` 每次都查数据库（`findById`），并用数据库里的 `role` 覆盖 JWT 里的。**

**第 52 节的代码已经这么做了：**

```javascript
req.user = toPublicUser(user);   // user 来自数据库
```

**所以 `req.user.role` 是数据库里的最新值，不是 JWT 里的。**

**JWT 里的 `role` 的唯一用途是"日志和排错"（知道签发时是什么角色）。**

**这一条是"JWT 不存可变状态"的具体应用。**

## 5.4 跑一遍角色测试

**手动把 Alice 改成 admin：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET role=? WHERE email=?').run('admin','alice@example.com'); console.log('done'); })"
```

**注意 Alice 的旧 token 里 `role` 还是 `user`。**

**但 `requireAuth` 从数据库取，所以 `req.user.role` 是 `admin`。**

**访问 `/api/admin/users` 应该成功。**

**用 Bob（普通用户）的 token 访问，应该 403。**

**这就是"401 和 403 的区别"的实例。**

---

# 第 6 步：五个必须知道的坑（20 分钟）

## 坑 1：只防 GET，忘了 PUT/PATCH/DELETE

**见 4.3。**

**这三个更容易被忽略，因为它们"不那么常用"。**

**但攻击者恰恰找不常用的。**

## 坑 2：`req.params.id` 没转 Number 就传进 SQL

```javascript
db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);   // 字符串
```

**在 SQLite 里，字符串 `"3"` 会被隐式转成 3，能工作。**

**但如果传的是 `"3 OR 1=1"`：**

```javascript
// 用参数化查询，这个字符串会被当成"值"去比较
// 结果是"没有 id 等于 '3 OR 1=1' 的行" → 安全
```

**所以参数化查询已经防住了 SQL 注入。**

**但还是要转 Number，因为：**

```text
① 显式类型转换让代码意图清楚
② 如果你哪天改成字符串拼接，就危险了
③ 有些数据库（PostgreSQL）不会隐式转换，会直接报错
```

**规则：`req.params.id` 永远 `Number()` 一次。**

**如果 `Number("abc")` 是 `NaN`：**

```javascript
const id = Number(req.params.id);
if (!Number.isInteger(id) || id <= 0) {
  return res.status(400).json({ error: "id 不合法" });
}
```

**不加这个检查，`NaN` 会进 SQL，`WHERE id = NaN` 可能返回奇怪的结果。**

## 坑 3：返回 403 而不是 404

**见 4.1 修法二。**

**403 等于"这条数据存在"。**

**攻击者能通过 403/404 的区别，枚举出你系统里有哪些 id。**

**所有"不是你的"数据，统一 404。**

**例外：管理员访问管理接口时，403 是对的（他确实知道这个接口存在）。**

## 坑 4：列表接口的 `WHERE` 忘了加 `user_id`

```javascript
// 错的
app.get("/api/items", requireAuth, (req, res) => {
  res.json({ items: db.prepare("SELECT * FROM items").all() });   // 所有人的！
});
```

**这个错极其常见，因为"列表接口看起来不需要权限判断"。**

**排查方法：**

```text
登录 A，看列表
登录 B，看列表
两个列表一样 → 有 bug
```

**这个测试 10 秒就能做完。每周自测一遍。**

## 坑 5：以为"前端看不到按钮"就是权限控制

```html
<!-- 前端：只有管理员能看到删除按钮 -->
<button id="delete" style="display: none">删除</button>
```

**F12 改掉 `display: none`，或者直接 curl。**

**前端隐藏是"体验"，不是"安全"。**

**这一条已经说过，但它是本节最重要的重复。**

---

# 第 7 步：故意做四个实验（15 分钟）

## 实验 1：把 `getItemSafe` 改成 `getItemUnsafe`

**跑攻击脚本。**

**看"安全版"那一列什么时候变成"❌ 泄露"。**

**这一个字符的差别（`AND user_id = ?`），就是漏洞和安全的分界。**

## 实验 2：只改 GET，不改 DELETE

**把 `deleteItemSafe` 换成 `deleteItemUnsafe`。**

**然后写一行测试（用 Alice 的 token 删 Bob 的 #3）：**

```text
curl.exe -X DELETE http://localhost:4030/api/items/3 -H "Cookie: auth_token=Alice的token"
```

**应该返回 200。**

**然后 Bob 登录看，他的笔记没了。**

**这就是"只防一半"的后果。**

**改回来，并且想一下：删数据比看数据严重多少倍。**

## 实验 3：把 404 改成 403

**改成：**

```javascript
if (!item) {
  const exists = db.prepare("SELECT id FROM items WHERE id = ?").get(id);
  if (exists) return res.status(403).json({ error: "无权限" });
  return res.status(404).json({ error: "不存在" });
}
```

**现在攻击者能区分"不存在"和"存在但不是你的"。**

**写进 `NOTES.md`：这泄露了什么信息。**

**改回来。**

## 实验 4：`id` 传 `abc`

```text
curl.exe http://localhost:4030/api/items/abc -H "Cookie: auth_token=..."
```

**看返回什么。**

**如果没有 `Number.isInteger` 检查，`Number("abc")` 是 `NaN`，SQL 里 `WHERE id = NaN` 可能返回 null（安全）或者报错（暴露内部信息）。**

**加上检查，返回 400。**

---

# 第 8 步：写一个自测脚本（15 分钟）

**这一节的最终产出，不是"修好了一个接口"，是"有一个能反复跑的自测"。**

**新建 `attacks/ownership.test.js`（用 `node:test`，不装框架）：**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://localhost:4030";

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const token = response.headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1];
  assert.ok(token, `登录失败：${email}`);
  return token;
};

const api = async (token, path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: `auth_token=${token}`,
      ...(init.headers || {}),
    },
  });

  return { status: response.status, data: await response.json().catch(() => ({})) };
};

test("未登录访问受保护接口返回 401", async () => {
  const response = await fetch(`${BASE}/api/items`);
  assert.equal(response.status, 401);
});

test("用户只能看到自己的列表", async () => {
  const alice = await login("alice@example.com", "test1234");
  const bob = await login("bob@example.com", "test1234");

  const aliceItems = (await api(alice, "/api/items")).data.items;
  const bobItems = (await api(bob, "/api/items")).data.items;

  const aliceIds = new Set(aliceItems.map((item) => item.id));
  const overlap = bobItems.filter((item) => aliceIds.has(item.id));

  assert.equal(overlap.length, 0, "两个用户的列表有重叠，说明没有按 user_id 过滤");
});

test("不能读别人的数据（返回 404 不是 403）", async () => {
  const alice = await login("alice@example.com", "test1234");
  const bob = await login("bob@example.com", "test1234");

  const bobItems = (await api(bob, "/api/items")).data.items;
  assert.ok(bobItems.length > 0, "Bob 没有数据，先跑 db:seed");

  const target = bobItems[0];
  const result = await api(alice, `/api/items/${target.id}`);

  assert.equal(result.status, 404, "应该返回 404，不能确认他人数据的存在性");
});

test("不能改别人的数据", async () => {
  const alice = await login("alice@example.com", "test1234");
  const bob = await login("bob@example.com", "test1234");

  const bobItems = (await api(bob, "/api/items")).data.items;
  const target = bobItems[0];

  const result = await api(alice, `/api/items/${target.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "被 Alice 改掉了" }),
  });

  assert.equal(result.status, 404);

  // 验证真的没改
  const after = await api(bob, `/api/items/${target.id}`);
  assert.equal(after.data.item.title, target.title, "Bob 的数据被改了");
});

test("不能删别人的数据", async () => {
  const alice = await login("alice@example.com", "test1234");
  const bob = await login("bob@example.com", "test1234");

  const bobItems = (await api(bob, "/api/items")).data.items;
  const target = bobItems[0];

  const result = await api(alice, `/api/items/${target.id}`, { method: "DELETE" });
  assert.equal(result.status, 404);

  const after = await api(bob, `/api/items/${target.id}`);
  assert.equal(after.status, 200, "Bob 的数据被删了");
});

test("普通用户访问管理接口返回 403", async () => {
  const bob = await login("bob@example.com", "test1234");
  const result = await api(bob, "/api/admin/users");
  assert.equal(result.status, 403);
});

test("id 不合法返回 400", async () => {
  const alice = await login("alice@example.com", "test1234");
  const result = await api(alice, "/api/items/abc");
  assert.equal(result.status, 400);
});
```

**加脚本：**

```json
    "test:auth": "node --test attacks/ownership.test.js"
```

**跑（服务要先启动）：**

```text
npm run test:auth
```

**七个测试应该全过。**

**这就是你的"安全回归测试"。**

**为什么它比"手动点一遍"值钱：**

```text
① 你以后每次改代码都能跑
② 它记录了"什么必须成立"
③ 别人接手时，这七个测试就是文档
```

---

# 第 9 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 打穿时的输出（贴 `⚠️ 别人的` 那几行）
2. 修好后的输出
3. 404 vs 403 的取舍
4. 「卡在哪」

---

# 第 10 步：课后练习

## 练习一：把 `user_id` 变成"从会话取，不从参数取"

**这是本节最核心的一条原则。**

**要求：** 检查你的所有接口，凡是接收 `user_id` 参数的，全部删掉，改成 `req.user.id`。

```javascript
// 错：参数里有 user_id
app.post("/api/items", requireAuth, (req, res) => {
  const { userId, title } = req.body;   // ← 攻击者能传别人的 id
  createItem(userId, { title });
});

// 对：只从会话取
app.post("/api/items", requireAuth, (req, res) => {
  const { title } = req.body;
  createItem(req.user.id, { title });
});
```

**为什么这是致命的：**

```javascript
// 攻击者只要多传一个字段
{"title": "我的笔记", "userId": 2}
// 就往 Bob 名下插了一条数据
```

**这条规则没有例外。**

## 练习二：给"公开笔记"加正确的逻辑

**要求：** `/api/items/:id/public` 只能看 `visibility = 'public'` 的，而且不能返回 `user_id`（泄露作者 id）。

**但思考一个问题：如果这是"分享给朋友"的功能，朋友需要看到作者名。怎么做？**

**答案：** 返回 `nickname`，不返回 `user_id`。

**（`nickname` 是公开信息，`user_id` 是内部标识。）**

## 练习三：加"软删除"

**要求：** `items` 加 `deleted_at` 字段。删除是"标记"不是"物理删"。所有查询加 `AND deleted_at IS NULL`。

**为什么：**

```text
用户误删 → 能恢复
审计 → 知道什么时候删的
但风险 → 很容易忘加 deleted_at IS NULL，导致"删了还能看"
```

**做完后，加一个测试：软删除后，列表里看不到，直接访问 404。**

## 练习四：想清楚这四个问题

```text
1. 为什么"先查再判断"不如"查询时带条件"？
2. 为什么"不是你的"要返回 404 而不是 403？
3. 为什么列表接口最容易漏掉归属过滤？
4. 为什么"前端隐藏按钮"完全不算权限控制？
```

---

# 第 11 步：最终验收

## A. 数据库

- [ ] `items` 表有 `user_id` 和 `visibility`
- [ ] `user_id` 有索引
- [ ] 外键 `ON DELETE CASCADE`
- [ ] 种子数据有 Alice/Bob 各两条

## B. 代码

- [ ] `getItemSafe` / `updateItemSafe` / `deleteItemSafe` 都带 `user_id` 条件
- [ ] 列表接口 `WHERE user_id = ?`
- [ ] 所有不是你的数据返回 404
- [ ] `Number.isInteger` 检查 id
- [ ] `requireRole` 能用
- [ ] `req.user.role` 来自数据库，不是 JWT

## C. 验证

- [ ] 我跑过 `attack:idor`，看到"⚠️ 别人的"
- [ ] 修好后同一个脚本不再泄露
- [ ] `test:auth` 七个测试全过
- [ ] 我试过"只改 GET 不改 DELETE"，确认能删别人的

## D. 认知

- [ ] 我能说出 IDOR 是什么
- [ ] 我知道为什么"查询时带条件"比"查完再判断"好
- [ ] 我知道 401 / 403 / 404 各什么时候用
- [ ] 我知道 `user_id` 不能从请求参数取

## 本节课要能说出口的一句话

> **每个带 id 的接口，都要问一句"这条数据属于谁"。答案写进 WHERE，不写在 if 里。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 用户看到别人的数据 | 没加 `user_id` 条件 | 查 `WHERE` 子句 |
| 提示 403 而不是 404 | 判断写法 | 改成统一 404 |
| 改别人的数据成功了 | PATCH 没防 | `updateItemSafe` |
| 删别人的数据成功了 | DELETE 没防 | `deleteItemSafe` |
| 列表里混了别人的 | 列表没 `WHERE` | 加 `user_id` |
| 管理员也看不到别人的 | 归属条件写死 | 管理员路径单独写 |
| `NaN` 进 SQL | `id` 没校验 | `Number.isInteger` |
| 改角色后不生效 | 角色取自 JWT | 从数据库读 |
| 加了 `deleted_at` 后还能看到 | 忘加 `IS NULL` | 每个查询都检查 |
