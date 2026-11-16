# 第 227 节课：权限最小化——越权是最常见的事故

> 上一节你让每个接口都会自己检查数据了。但检查"格式对不对"和检查"这东西是不是你的"，是两件事。
> 这一节做一件很具体的事：**把 `GET /api/messages/123` 改成"只有消息的主人能看"，并且用两个账号真测一遍。**
> 这是全网最常见的线上事故，没有之一。修起来只要一行 `AND user_id = ?`。

**建议用时**：120 分钟
**你需要先完成**：第 226 节（接口有服务端校验）、第 5 周的 SQL（会写 `SELECT` / `WHERE` / `UPDATE`）

---

# 第 0 步：为什么"登录了"不等于"有权限"（10 分钟）

## 0.1 你现在会什么

你的接口大概是这个形状：

```js
app.get("/api/messages/:id", requireLogin, async (req, res) => {
  const row = await db.get("SELECT * FROM messages WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(row);
});
```

**这段代码有一个致命的假设：**

```text
"能访问这个接口的人，就有权看这条数据。"
```

**这个假设不成立。** 因为 `requireLogin` 只回答了"你是谁"，没回答"这条数据是不是你的"。

## 0.2 你以后会遇到什么

```text
① 用户 A 把地址栏里的 /messages/123 改成 /messages/124，看到了别人的对话
② 用户把请求体里的 user_id 改成别人的，给自己刷了一条"我付过款"
③ 一个公司的管理员，看到了另一个公司的全部订单（多租户串号）
④ 你把"删除"按钮在前端藏起来了，用户直接用 curl 删除了别人的数据
⑤ 客户方的 IT 问你"你们的数据库账号有 DROP 权限吗"，你答不上来
```

**第 ① 条是最经典的。** 它有个名字：**IDOR**（Insecure Direct Object Reference，不安全的直接对象引用）。

**翻译成人话：**

```text
你把数据库的编号（123）直接暴露在 URL 里，
却没检查"这个编号的东西，是不是这个人的"。
```

## 0.3 今天要建立的三个概念

```text
① 水平越权：同一角色、不同用户之间互相看数据。A 看 B 的。
   最常见，也最容易修（每个查询加 user_id）。

② 垂直越权：低权限用户干了高权限的事。普通用户调管理员接口。
   靠"角色检查中间件"修，不能靠"前端不显示入口"。

③ 最小权限：每个东西（数据库账号、应用进程、登录用户）只给它"必须用到"的那点权限。
   数据库账号不该有 DROP，应用不该用 root 连库，3306 不该对公网开。
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 双账号测试记录 |
| `idor-lab/` | `03-练习代码` | 两个账号 + 消息表的小项目 |
| `grants.md` | `03-练习代码` | 数据库账号权限对照 |

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **只有你的 Windows 电脑。**<br>**⚠️ 这一节故意留一个越权洞，只在 `idor-lab/` 里留，绝不要在你上线的代码里留。** |
| **用哪个终端** | **Git Bash。** |
| **现在在哪个目录** | <code>mkdir -p "B:/OPC-Distance_study/每周课程/06-上线运维/第33周-安全与合规/第03节课/03-练习代码/idor-lab"</code><br><code>cd "B:/OPC-Distance_study/每周课程/06-上线运维/第33周-安全与合规/第03节课/03-练习代码/idor-lab"</code> |
| **本节新建什么** | `idor-lab/server.js`（有洞版）<br>`idor-lab/server-fixed.js`（修好版）<br>`idor-lab/seed.js`（两个用户 + 各一条消息）<br>`越权记录.md`（10 条测试的请求和响应）<br>`权限清单.md`（你项目里所有带编号的接口） |

## 开工前先跑这一条

确认你没站错地方：

```bash
node -v && ls
```

**应该看到：**

```text
v22.22.2
说明.md
```

**`ls` 只有 `说明.md`** —— 目录是空的，这一节从零建。

## 如果不对

**已经有 `idor-lab/`** → 你之前做过，先 `mv idor-lab idor-lab.bak-$(date +%s)`。

---

# 第 1 步：先亲手越一次权（20 分钟）

## 1.1 建一个最小的实验场

**为什么不在真项目里做：** 这一节要故意留一个洞，再补上。**真项目上留洞的每一分钟都是风险。**

**先确认你在 `idor-lab/` 里**（开工卡已经带你进来了）：

```bash
pwd
```

**路径最后必须是 `idor-lab`。** 如果不对，回开工卡重跑。

```bash
npm init -y
npm install express better-sqlite3
```

**应该看到：**

```text
added 88 packages in 4s
```

**`better-sqlite3` 是什么：** 一个 SQLite 的 Node 驱动。**选它是因为零配置 —— 不用装数据库服务，一个文件就是一个库。** 换成 MySQL / Postgres 时，SQL 写法基本一样。

## 1.2 建表和假数据

**建 `db.js`：**

```js
const Database = require("better-sqlite3");
const db = new Database("lab.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL
  );
`);

const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (count === 0) {
  db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(1, "alice@test.com");
  db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(2, "bob@test.com");
  db.prepare("INSERT INTO messages (user_id, content) VALUES (?, ?)").run(1, "alice 的私密消息");
  db.prepare("INSERT INTO messages (user_id, content) VALUES (?, ?)").run(2, "bob 的私密消息");
}

module.exports = db;
```

**跑一次把它建出来：**

```bash
node -e "require('./db'); console.log('ok')"
```

**应该看到：**

```text
ok
```

**看库里有什么：**

```bash
node -e "const db=require('./db'); console.log(db.prepare('SELECT * FROM messages').all())"
```

**应该看到：**

```text
[
  { id: 1, user_id: 1, content: 'alice 的私密消息' },
  { id: 2, user_id: 2, content: 'bob 的私密消息' }
]
```

**逐段读：**

| 字段 | 意思 |
|---|---|
| `id` | 消息编号，**1 和 2 是连着的 —— 这就是"可猜"** |
| `user_id` | 消息属于谁。**这一列是修越权的关键** |
| `content` | 消息内容 |

**为什么"连着的 id"是问题：** 攻击者看到自己的消息是 `1`，就会去试 `2`、`3`、`4`。**成本是一秒钟。**

## 1.3 写一个"只判断登录"的接口

**建 `server.js`（故意有洞的版本）：**

```js
const express = require("express");
const db = require("./db");
const app = express();
app.use(express.json());

// 假的登录：用请求头 X-User-Id 冒充"我是谁"。真实项目里用 session 或 JWT。
function requireLogin(req, res, next) {
  const uid = Number(req.headers["x-user-id"]);
  if (!uid) return res.status(401).json({ error: "UNAUTHORIZED" });
  req.user = { id: uid };
  next();
}

// ❌ 有洞：只按 id 查，没管这消息属于谁
app.get("/api/messages/:id", requireLogin, (req, res) => {
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(row);
});

app.listen(3000, () => console.log("http://127.0.0.1:3000"));
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `x-user-id` 请求头 | **假的登录**。真实项目里这应该是 `req.session.userId` 或从 JWT 里解出来的 |
| `requireLogin` | 只做了"有没有身份"的检查 |
| `WHERE id = ?` | **只按编号查**，没有 `user_id` 条件 |
| `if (!row) 404` | 只处理"不存在"，没处理"不是你的" |

**`x-user-id` 这个假登录为什么必须说清楚：**

```text
它本身就是一个巨大的洞 —— 任何人改个请求头就能变成别人。
这里用它，只是为了让实验能跑。
真实项目里，用户身份必须来自"服务端自己签发并验证过的东西"（session / JWT 签名）。
```

## 1.4 越权：用 Alice 的身份读 Bob 的消息

**Alice 读自己的：**

```bash
curl -s http://127.0.0.1:3000/api/messages/1 -H "X-User-Id: 1"
```

**应该看到：**

```json
{"id":1,"user_id":1,"content":"alice 的私密消息"}
```

**现在 Alice 把 1 改成 2：**

```bash
curl -s http://127.0.0.1:3000/api/messages/2 -H "X-User-Id: 1"
```

**应该看到：**

```json
{"id":2,"user_id":2,"content":"bob 的私密消息"}
```

**成了。** Alice 用自己合法的登录态，读到了 Bob 的私密消息。

**逐行读这个响应：**

| 字段 | 说明什么 |
|---|---|
| `"user_id":2` | **服务端自己告诉你"这条是别人的"**，然后还是把内容给你了 |
| `"content":"bob 的私密消息"` | 数据泄露 |

**这条请求里，攻击者只做了一个动作：把 URL 里的 `1` 改成 `2`。**

```text
不需要工具，不需要技术，不需要密码。
改一个数字。
```

## 1.5 批量扫一遍

**攻击者不会一个一个试，他会写个循环：**

```bash
for i in 1 2 3 4 5; do
  echo -n "id=$i  "
  curl -s "http://127.0.0.1:3000/api/messages/$i" -H "X-User-Id: 1" | head -c 80
  echo
done
```

**应该看到：**

```text
id=1  {"id":1,"user_id":1,"content":"alice 的私密消息"}
id=2  {"id":2,"user_id":2,"content":"bob 的私密消息"}
id=3  {"error":"NOT_FOUND"}
id=4  {"error":"NOT_FOUND"}
id=5  {"error":"NOT_FOUND"}
```

**注意一件事：**

```text
有数据的返回 200，没数据的返回 404。
```

**这个差别本身就在告诉攻击者"哪个 id 存在"。** 等你把 404 改成 403 之后，这个信息还是会泄露。**第 4 步会处理它。**

---

# 第 2 步：认清三类越权（15 分钟）

## 2.1 水平越权（最常见）

```text
同一角色、不同用户之间。
Alice 读 Bob 的。普通用户 A 改普通用户 B 的资料。
```

**典型入口：**

```text
GET    /api/messages/:id
GET    /api/orders/:id
POST   /api/messages        （body 里带 user_id）
PUT    /api/users/:id
DELETE /api/files/:id
GET    /api/export?user_id=2
```

**判断方法：** 问自己一句 —— **"这个接口里的编号，是用户能自己改的吗？"** 能改，就要检查归属。

## 2.2 垂直越权

```text
低权限用户干了高权限的事。
普通用户调 /api/admin/users。
普通用户在注册时传 role: "admin"。
```

**这个上一节已经防了一半：** `parsed.data` 会丢掉 `role`。**但另一半要在这里防：管理员接口必须真的检查角色。**

```js
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    next();
  };
}

app.get("/api/admin/users", requireLogin, requireRole("admin"), (req, res) => {
  res.json(db.prepare("SELECT id, email FROM users").all());
});
```

**注意两件事：**

```text
① req.user.role 必须来自服务端（session / JWT），不能来自 req.body
② 返回 404 而不是 403 —— 不告诉普通用户"这里有个管理员接口"
```

## 2.3 跨租户越权

**如果你做的是多租户（第 5 周升级过），还有第三层：**

```text
用户 A 属于租户 1，用户 B 属于租户 2。
A 不该看到租户 2 的任何数据，哪怕那条数据的 user_id 是 A 自己。
```

**什么时候会发生：**

```text
同一个用户同时属于两个租户（很常见：一个人在两家公司）。
他在租户 1 的界面上，把 URL 里的 tenant_id 改成 2。
```

**所以多租户的查询要带三个条件：**

```sql
WHERE id = ? AND user_id = ? AND tenant_id = ?
```

**`tenant_id` 从哪来：** 从"当前会话选中的租户"来，**不能从 URL 来**。

## 2.4 一张对照表

| 类型 | 谁对谁 | 典型请求 | 修法 |
|---|---|---|---|
| 水平 | 用户 A 对 用户 B | `/messages/2` | 每个查询加 `user_id` |
| 垂直 | 普通用户对 管理员 | `/admin/users` | 角色中间件，服务端判定 |
| 跨租户 | 租户 1 对 租户 2 | `?tenant_id=2` | 查询加 `tenant_id`，从会话取 |

---

# 第 3 步：修法一 —— 每个查询都带 `user_id`（30 分钟）

## 3.1 只改一行

**把 1.3 的接口改成：**

```js
app.get("/api/messages/:id", requireLogin, (req, res) => {
  const row = db
    .prepare("SELECT * FROM messages WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(row);
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `WHERE id = ? AND user_id = ?` | **两个条件都要满足**才返回 |
| `.get(req.params.id, req.user.id)` | 第一个 `?` 是 id，第二个 `?` 是**服务端知道的**用户 id |
| `req.user.id` | 来自 `requireLogin`，**不来自请求参数** |

**为什么这一行就够了：**

```text
Bob 的消息 id=2，user_id=2。
Alice 的请求带 X-User-Id: 1，所以条件是 id=2 AND user_id=1。
库里没有这样的行 → 返回 undefined → 404。
```

**关键点：`AND` 让"不属于我"和"不存在"在数据库层面变成同一个结果。** 你根本不需要写 `if (row.user_id !== req.user.id)` —— **那种写法容易忘，而且多一次判断就多一次出错机会。**

## 3.2 验证：同一个请求，现在返回什么

```bash
curl -s -i http://127.0.0.1:3000/api/messages/2 -H "X-User-Id: 1"
```

**应该看到：**

```text
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"error":"NOT_FOUND"}
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `HTTP/1.1 404 Not Found` | **不是 403**，是 404 |
| `{"error":"NOT_FOUND"}` | 和"这条消息真的不存在"时**一模一样** |

**Alice 读自己的还是正常：**

```bash
curl -s http://127.0.0.1:3000/api/messages/1 -H "X-User-Id: 1"
```

```json
{"id":1,"user_id":1,"content":"alice 的私密消息"}
```

**再用 Bob 的身份读 id=2：**

```bash
curl -s http://127.0.0.1:3000/api/messages/2 -H "X-User-Id: 2"
```

```json
{"id":2,"user_id":2,"content":"bob 的私密消息"}
```

**三行命令，把"该给的给、不该给的不给"验完了。**

## 3.3 写操作也要改（这一步最容易漏）

**读接口改了，不代表写接口安全。** 三种写操作都要处理。

**① 更新（UPDATE）：**

```js
app.put("/api/messages/:id", requireLogin, (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_FAILED" });

  const info = db
    .prepare("UPDATE messages SET content = ? WHERE id = ? AND user_id = ?")
    .run(parsed.data.content, req.params.id, req.user.id);

  if (info.changes === 0) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ ok: true });
});
```

**`info.changes === 0` 是什么意思：**

```text
UPDATE 语句影响的行数。
0 行 = 没有"id 匹配 且 user_id 是我的"的行 = 要么不存在，要么不是我的。
两种情况都返回 404。
```

**为什么必须检查 `changes`：**

```text
不检查的话，代码会返回 {"ok":true}。
用户以为改成功了，其实什么都没改。
更糟：你以为"没权限的人改不了"，但日志里全是"成功"，你永远发现不了有人在试。
```

**② 删除（DELETE）：**

```js
app.delete("/api/messages/:id", requireLogin, (req, res) => {
  const info = db
    .prepare("DELETE FROM messages WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ ok: true });
});
```

**③ 新增（INSERT）：`user_id` 只能来自服务端**

```js
app.post("/api/messages", requireLogin, (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_FAILED" });

  const info = db
    .prepare("INSERT INTO messages (user_id, content) VALUES (?, ?)")
    .run(req.user.id, parsed.data.content);   // ✅ req.user.id，不是 body.user_id

  res.status(201).json({ id: info.lastInsertRowid });
});
```

**反例（这是"替别人发消息"的洞）：**

```js
.run(req.body.user_id, parsed.data.content);   // ❌
```

**验证一下反例的后果：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages \
  -H "X-User-Id: 1" -H "Content-Type: application/json" \
  -d '{"user_id":2,"content":"这条是冒充 bob 发的"}'
```

**如果代码用的是 `req.body.user_id`，库里会出现一条 `user_id=2` 的消息，而发它的人是 Alice。**

## 3.4 一个"看起来对了其实漏了"的写法

**反例：**

```js
const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(req.params.id);
if (row.user_id !== req.user.id) return res.status(403).json({ error: "FORBIDDEN" });
```

**这段逻辑是对的，但有两个问题：**

```text
① 403 会告诉对方"这条数据存在"（第 4 步细讲）
② 你要在每一个接口里都记得写这一行 —— 漏一个就是洞
```

**为什么"写在 SQL 里"更好：**

```text
SQL 里的条件漏不掉 —— 它和查询是一体的。
你在 JS 里加判断，是"查询之后又补了一刀"，
补刀的位置可能出现在 return 之后、catch 里、或者干脆忘了。
```

**规则：归属检查要写进 `WHERE`，不是写在 `WHERE` 之后。**

---

# 第 4 步：修法二 —— 404 还是 403（15 分钟）

## 4.1 这两个状态码在说什么

```text
403 Forbidden  = "这个东西存在，但你不能看"
404 Not Found  = "这个东西不存在"
```

**对普通用户来说，区别不大。对攻击者来说，区别巨大：**

```text
返回 403 → 他知道 id=2 存在，只是不是他的 → 他会去试 id=3、4、5，摸清你有多少数据
返回 404 → 他不知道 id=2 是"别人的"还是"根本没有" → 探测失去意义
```

**这叫"不泄露存在性"（avoid existence disclosure）。** 第 225 节我们在 Nginx 上用过同一招（`/.env` 返回 404 而不是 403）。

## 4.2 亲眼看一下区别

**改动之前（先临时改成 403 看效果）：**

```js
if (!row) return res.status(404).json({ error: "NOT_FOUND" });
if (row.user_id !== req.user.id) return res.status(403).json({ error: "FORBIDDEN" });
```

```bash
for i in 1 2 99; do
  echo -n "id=$i → "
  curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/messages/$i" -H "X-User-Id: 1"
done
```

**应该看到：**

```text
id=1 → 200
id=2 → 403
id=99 → 404
```

**逐行读：**

| 结果 | 攻击者得到的信息 |
|---|---|
| `200` | 这是我的 |
| `403` | **这条存在，但不是我的** |
| `404` | 这条不存在 |

**三次请求，攻击者就知道"你的库里有 id=2 这条数据"。** 换个 id 再试，就能数出你有多少条消息。

**改成 404 之后：**

```bash
for i in 1 2 99; do
  echo -n "id=$i → "
  curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/messages/$i" -H "X-User-Id: 1"
done
```

```text
id=1 → 200
id=2 → 404
id=99 → 404
```

**现在 `2` 和 `99` 没有区别了。** 攻击者无法区分"别人的"和"不存在的"。

## 4.3 什么时候可以返回 403

**有一种情况 403 是合适的：整类接口都不许你进。**

```text
普通用户访问 /api/admin/users
→ 403 是合理的，因为"管理员接口"这件事本身不是秘密（前端菜单里就有"管理员"这个角色概念）
```

**但涉及"某一条具体数据"的时候，用 404。**

| 场景 | 用什么 | 为什么 |
|---|---|---|
| 别人的消息 | 404 | 不泄露"这条存在" |
| 别人的订单 | 404 | 同上 |
| 不存在的 id | 404 | 和上面保持一致 |
| 普通用户调管理员接口 | 403 | "有没有这个权限"不是秘密 |
| 未登录 | 401 | 需要先登录 |

## 4.4 一个更狠的做法：连 id 都别用连号

**如果 id 是自增的，攻击者能算出你有多少数据。** 换成随机 id 能提高成本：

```js
const { randomUUID } = require("crypto");
const id = randomUUID();   // "3f2a1b0c-9d4e-4a7b-8c1d-2e5f6a7b8c9d"
```

**但这不是"防护"，只是"提高成本"。**

```text
随机 id 不能让越权消失，只能让"猜 id"变难。
如果 id 从别的地方泄露了（分享链接、日志、导出文件），洞还在。
所以 user_id 检查仍然必须有。
```

**换句话说：随机 id 是加分项，`AND user_id = ?` 是必选项。**

---

# 第 5 步：修法三 —— 身份只能来自服务端（20 分钟）

## 5.1 一个必须先说清的事

**这一节的实验用 `X-User-Id` 请求头冒充登录。这是假的，本身就是个洞。**

**真实项目里，身份必须来自"服务端签发并验证过的东西"：**

```text
session：服务端存一份，浏览器只拿一个随机 session id（放在 HttpOnly cookie 里）
JWT：服务端用密钥签名，浏览器拿 token，服务端验签后才信里面的 user_id
```

**两者的共同点：**

```text
用户能改的是"凭证"（cookie 或 token），但改了之后服务端验不过。
所以用户改不动"我是谁"。
```

## 5.2 反例：从请求里取身份

**这几种写法全都是洞：**

```js
const userId = req.body.user_id;        // ❌
const userId = req.query.user_id;       // ❌
const userId = req.headers["x-user-id"]; // ❌（除非你在网关层已经验过并覆盖了）
const userId = req.params.userId;       // ❌
```

**为什么：这四种都是"用户能写的地方"。**

## 5.3 正例：中间件统一注入

```js
function requireLogin(req, res, next) {
  const uid = req.session && req.session.userId;   // ← 服务端会话
  if (!uid) return res.status(401).json({ error: "UNAUTHORIZED" });
  req.user = { id: uid, role: req.session.role };
  next();
}
```

**然后所有路由只用 `req.user.id`：**

```js
app.get("/api/messages", requireLogin, (req, res) => {
  const rows = db.prepare("SELECT * FROM messages WHERE user_id = ?").all(req.user.id);
  res.json(rows);
});
```

**为什么这样可靠：**

```text
req.user 是中间件挂上去的。
路由里没有任何一行代码从"用户能写的地方"取身份。
你要改身份，只能改 session —— 而 session 在服务端。
```

**一个检查办法：**

```bash
git grep -nE "req\.(body|query|params)\.(user_?id|uid|userId)"
```

**应该什么都不输出。** 有输出就是有洞。

## 5.4 `requireLogin` 必须挂在所有需要登录的路由前面

**反例：**

```js
app.get("/api/messages/:id", (req, res) => {      // ❌ 忘了挂 requireLogin
  const row = db.prepare(...).get(req.params.id, req.user.id);   // req.user 是 undefined
});
```

**会怎样：**

```text
TypeError: Cannot read properties of undefined (reading 'id')
→ 500
```

**这个 500 反而是"安全"的（没查出数据），但它是靠崩溃挡住的。** 换个写法就漏了：

```js
const uid = req.user ? req.user.id : null;    // ❌ 降级成 null
db.prepare("... WHERE user_id = ?").all(uid); // null 匹配不到任何行，看着"安全"
```

**但如果你写的是：**

```js
const uid = req.user ? req.user.id : undefined;
db.prepare("... WHERE user_id = ?").all(uid); // undefined 在 better-sqlite3 里会抛错
```

**不同驱动行为不一样 —— 这就是"靠崩溃防护"不可靠的原因。**

**规矩：需要登录的路由，`requireLogin` 必须显式写上。** 更好的做法是用路由分组：

```js
const router = express.Router();
router.use(requireLogin);          // 整个分组都要登录

router.get("/messages/:id", handler);
router.post("/messages", handler);

app.use("/api", router);
```

---

# 第 6 步：列表、搜索、导出、批量 —— 越权最爱藏的地方（20 分钟）

## 6.1 详情接口修好了，列表接口还漏着

**这是最常见的情况：**

```text
GET /api/messages/2       → 已修，404
GET /api/messages         → 还在返回全库的消息
```

**验证一下：**

```bash
curl -s http://127.0.0.1:3000/api/messages -H "X-User-Id: 1"
```

**如果有洞，你会看到：**

```json
[
  {"id":1,"user_id":1,"content":"alice 的私密消息"},
  {"id":2,"user_id":2,"content":"bob 的私密消息"}
]
```

**修法一样：**

```js
app.get("/api/messages", requireLogin, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(req.user.id, limit, offset);
  res.json(rows);
});
```

## 6.2 四个容易漏的接口形态

| 形态 | 反例 | 修法 |
|---|---|---|
| 搜索 | `WHERE content LIKE ?` | `WHERE user_id = ? AND content LIKE ?` |
| 批量 | `WHERE id IN (1,2,3)` | `WHERE user_id = ? AND id IN (...)` |
| 导出 | `SELECT * FROM messages` | `WHERE user_id = ?`，且导出要鉴权 |
| 统计 | `SELECT COUNT(*) FROM messages` | `WHERE user_id = ?`，否则泄露"全站有多少条" |

**批量接口最危险，因为一次能拿很多：**

```js
// ❌
const ids = req.query.ids.split(",");
const rows = db.prepare(`SELECT * FROM messages WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);

// ✅
const rows = db
  .prepare(`SELECT * FROM messages WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
  .all(req.user.id, ...ids);
```

**注意：`IN (?,?,?)` 这种"数量可变的占位符"是唯一安全的拼法。** 拼接 `id` 的值本身（`IN (${ids.join(",")})`）就是 SQL 注入 —— 下一节会讲。

## 6.3 一个"看起来无害"的泄露：统计数字

```js
app.get("/api/stats", requireLogin, (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS n FROM messages").get().n;
  res.json({ total });
});
```

**这个接口不返回任何内容，只返回一个数字。** 但它告诉用户：

```text
"你的平台上现在一共有 1,284,391 条消息。"
```

**对竞争对手来说，这是有用的情报。对你来说，这是没必要的暴露。**

**修法：只统计自己的，或者只给管理员看全局数字（并且真的检查角色）。**

## 6.4 自查：把每个查询语句过一遍

```bash
git grep -nE "SELECT|UPDATE|DELETE|INSERT" -- "*.js" | grep -v "user_id"
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `git grep -nE "SELECT\|UPDATE\|DELETE\|INSERT"` | 找出所有 SQL 语句所在行 |
| `grep -v "user_id"` | **过滤掉已经带了 `user_id` 的** |
| 剩下的 | 就是"没有归属条件"的语句 |

**应该看到的，只有这几类：**

```text
CREATE TABLE ...          建表，正常
SELECT ... FROM users WHERE id = ?    登录时查自己，正常（但要看后续）
INSERT INTO users (...)  注册，正常
```

**看到 `SELECT * FROM messages` 或 `DELETE FROM messages WHERE id = ?` 就是漏了。**

---

# 第 7 步：数据库账号也要最小权限（25 分钟）

## 7.1 为什么这件事和越权是一节课

```text
应用越权 = 用户 A 拿到了不该拿的数据
数据库越权 = 你的应用拿到了不该拿的权限
```

**第二种的后果更大：**

```text
应用账号如果能 DROP TABLE，一个 SQL 注入就能删掉整库。
应用账号如果是 root，注入之后能读系统表、能写文件、能执行命令。
```

**而且这一条客户一定会问。** 第 34 周做私有化部署时，客户的 IT 部门第一个问题就是"你的数据库账号给多大权限"。

## 7.2 先看现在用的是什么账号

**在你的 `.env` 里：**

```bash
grep -E "DB_|DATABASE" .env | sed 's/=.*/=***/'
```

**应该看到（只显示变量名，值被遮住了）：**

```text
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_NAME=***
```

**然后单独看用户名：**

```bash
grep -E "^DB_USER" .env
```

**如果是：**

```text
DB_USER=root
```

**这就是问题。** 应用不该用 root 连库。

## 7.3 MySQL：建一个只能读写的账号

**本机登录 MySQL（用 root 做这一次管理操作）：**

```bash
mysql -u root -p
```

**执行：**

```sql
-- 只允许从本机连（127.0.0.1），不允许从任何其他机器连
CREATE USER 'chat_app'@'127.0.0.1' IDENTIFIED BY 'change-me-strong';

-- 只给四件事：查、增、改、删
GRANT SELECT, INSERT, UPDATE, DELETE ON chat.* TO 'chat_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `'chat_app'@'127.0.0.1'` | **用户名 + 来源地址**。这个账号只能从本机连 |
| `IDENTIFIED BY` | 设密码 |
| `SELECT, INSERT, UPDATE, DELETE` | **只有这四种**。没有 `DROP`、没有 `ALTER`、没有 `GRANT` |
| `ON chat.*` | 只能操作 `chat` 这个库 |
| `FLUSH PRIVILEGES` | 让权限立即生效 |

**查看它到底有什么权限：**

```sql
SHOW GRANTS FOR 'chat_app'@'127.0.0.1';
```

**应该看到：**

```text
+--------------------------------------------------------------+
| Grants for chat_app@127.0.0.1                                |
+--------------------------------------------------------------+
| GRANT USAGE ON *.* TO `chat_app`@`127.0.0.1`                 |
| GRANT SELECT, INSERT, UPDATE, DELETE ON `chat`.* TO ...      |
+--------------------------------------------------------------+
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `GRANT USAGE ON *.*` | "能登录"，没有任何实际权限。**每个账号都有这一条，正常** |
| `GRANT SELECT, INSERT, UPDATE, DELETE ON chat.*` | 真正的权限，只有四个 |

**看不到 `DROP`、`ALTER`、`GRANT OPTION` 就对了。**

**验证一下它真的不能删表：**

```bash
mysql -u chat_app -p chat -e "DROP TABLE messages;"
```

**应该看到：**

```text
ERROR 1142 (42000): DROP command denied to user 'chat_app'@'localhost' for table 'chat'
```

**这一条报错就是你要的结果。** 它证明"即使应用被注入了，也删不掉你的表"。

## 7.4 PostgreSQL：一样的思路

```sql
CREATE ROLE chat_app LOGIN PASSWORD 'change-me-strong';

GRANT CONNECT ON DATABASE chat TO chat_app;
GRANT USAGE ON SCHEMA public TO chat_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chat_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chat_app;

-- 以后新建的表也自动有权限（否则每次迁移后都要重新 GRANT）
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chat_app;
```

**逐行读：**

| 行 | 为什么需要 |
|---|---|
| `GRANT CONNECT` | 不给这个，连库都连不上 |
| `GRANT USAGE ON SCHEMA` | 不给这个，看不见表 |
| `SELECT, INSERT, UPDATE, DELETE` | 业务要用的四种 |
| `USAGE, SELECT ON SEQUENCES` | 自增 id 要读序列，不给会 `permission denied for sequence` |
| `ALTER DEFAULT PRIVILEGES` | **最容易漏的一条**，不加的话新建表应用没权限 |

**验证：**

```bash
psql -U chat_app -d chat -c "DROP TABLE messages;"
```

**应该看到：**

```text
ERROR:  must be owner of table messages
```

## 7.5 端口：3306 / 5432 绝对不能对公网开

**先在服务器上看它在听哪个地址：**

```bash
ss -lntp | grep -E "3306|5432"
```

**如果是这样，就是危险的：**

```text
LISTEN 0 151 0.0.0.0:3306 0.0.0.0:* users:(("mysqld",pid=921,fd=22))
```

**如果是这样，就是对的：**

```text
LISTEN 0 151 127.0.0.1:3306 0.0.0.0:* users:(("mysqld",pid=921,fd=22))
```

**逐段读 `ss -lntp`：**

| 片段 | 意思 |
|---|---|
| `-l` | 只看监听中的 |
| `-n` | 显示端口号而不是服务名 |
| `-t` | TCP |
| `-p` | 显示哪个进程 |
| `0.0.0.0:3306` | **监听所有网卡 —— 公网能连** |
| `127.0.0.1:3306` | **只听本机 —— 对的** |

**为什么要盯着这个：**

```text
开放 3306 的服务器，通常几小时内就会被扫到。
然后就是几个小时的密码爆破。
如果你的密码是 8 位简单密码，一天之内大概率被攻破。
```

**改 MySQL 只听本机：**

```bash
nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

**找到 `bind-address`，改成：**

```ini
bind-address = 127.0.0.1
```

**重启：**

```bash
systemctl restart mysql
ss -lntp | grep 3306
```

**应该看到 `127.0.0.1:3306`。**

**从你自己的电脑验证（Git Bash）：**

```bash
timeout 5 bash -c "cat < /dev/null > /dev/tcp/47.98.xx.xx/3306" && echo "⚠️ 端口开着" || echo "✅ 连不上"
```

**应该看到：**

```text
✅ 连不上
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `/dev/tcp/47.98.xx.xx/3306` | bash 内置的"试着建 TCP 连接" |
| `timeout 5` | 5 秒还没连上就算失败 |
| `&& echo "端口开着"` | 连上了 → 危险 |
| `\|\| echo "连不上"` | 连不上 → 这是我们要的 |

**⚠️ 说清楚：`ss` 里是 `127.0.0.1` 不一定等于"外网连不上"。** 如果云厂商的安全组开了 3306，仍可能被转发进来。**两处都要查：服务器监听地址 + 云控制台安全组。**

## 7.6 最小权限的三层

```text
第一层：数据库账号   → 只给 SELECT/INSERT/UPDATE/DELETE，只听 127.0.0.1
第二层：应用进程     → 不用 root 跑 Node，用普通用户
第三层：登录用户     → 只能看自己的数据（第 3 步做的）
```

**第二层顺手检查一下：**

```bash
ps -o user,pid,cmd -C node
```

**如果 `USER` 是 `root`，就该改。** 因为一旦应用被攻破，攻击者拿到的就是 root 权限。

**改法（以 systemd 或 pm2 的 `--uid` 为准）：**

```bash
pm2 start server.js --name chat-app --cwd /srv/app --uid appuser
```

**⚠️ 改之前先确认 `appuser` 对 `/srv/app` 有读写权限，对 `.env` 有读权限。** 否则应用会起不来（报 `EACCES`）。

---

# 第 8 步：用两个账号做回归测试（20 分钟）

## 8.1 为什么要"两个账号"

**一个账号测不出越权。** 你用自己的账号怎么点都是对的，因为那些数据本来就是你的。

**必须有两个身份，才能验证"我不该看到他的"。**

## 8.2 测试表

**在 `NOTES.md` 里建这张表，逐行填：**

| # | 谁在操作 | 请求 | 期望 | 实际 | 通过 |
|---|---|---|---|---|---|
| 1 | Alice | 读自己的 `id=1` | 200 | | |
| 2 | Alice | 读 Bob 的 `id=2` | 404 | | |
| 3 | Bob | 读自己的 `id=2` | 200 | | |
| 4 | Bob | 读 Alice 的 `id=1` | 404 | | |
| 5 | Alice | 改 Bob 的 `id=2` | 404 | | |
| 6 | Alice | 删 Bob 的 `id=2` | 404 | | |
| 7 | Alice | 列表里只有自己的 | 1 条 | | |
| 8 | Alice | 冒充 Bob 发消息（`user_id:2`） | 库里 `user_id=1` | | |
| 9 | 未登录 | 读任意 | 401 | | |
| 10 | 不存在的 id | 读 `id=999` | 404 | | |

## 8.3 逐条跑（可复制）

```bash
BASE=http://127.0.0.1:3000

# 1 Alice 读自己的
curl -s -o /dev/null -w "1: %{http_code}\n" $BASE/api/messages/1 -H "X-User-Id: 1"

# 2 Alice 读 Bob 的
curl -s -o /dev/null -w "2: %{http_code}\n" $BASE/api/messages/2 -H "X-User-Id: 1"

# 3 Bob 读自己的
curl -s -o /dev/null -w "3: %{http_code}\n" $BASE/api/messages/2 -H "X-User-Id: 2"

# 4 Bob 读 Alice 的
curl -s -o /dev/null -w "4: %{http_code}\n" $BASE/api/messages/1 -H "X-User-Id: 2"

# 5 Alice 改 Bob 的
curl -s -o /dev/null -w "5: %{http_code}\n" -X PUT $BASE/api/messages/2 \
  -H "X-User-Id: 1" -H "Content-Type: application/json" -d '{"content":"hacked"}'

# 6 Alice 删 Bob 的
curl -s -o /dev/null -w "6: %{http_code}\n" -X DELETE $BASE/api/messages/2 -H "X-User-Id: 1"

# 7 Alice 的列表条数
curl -s $BASE/api/messages -H "X-User-Id: 1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('7:',JSON.parse(s).length))"

# 8 Alice 冒充 Bob 发消息
curl -s -X POST $BASE/api/messages -H "X-User-Id: 1" -H "Content-Type: application/json" \
  -d '{"user_id":2,"content":"冒充"}'

# 9 未登录
curl -s -o /dev/null -w "9: %{http_code}\n" $BASE/api/messages/1

# 10 不存在的 id
curl -s -o /dev/null -w "10: %{http_code}\n" $BASE/api/messages/999 -H "X-User-Id: 1"
```

**应该看到：**

```text
1: 200
2: 404
3: 200
4: 404
5: 404
6: 404
7: 1
8: {"id":3}
9: 401
10: 404
```

**逐条读关键项：**

| # | 结果 | 说明什么 |
|---|---|---|
| 2 | `404` | ✅ 越权被挡，而且没泄露"存在" |
| 5 | `404` | ✅ 改不了别人的（注意：不是 200） |
| 6 | `404` | ✅ 删不了别人的 |
| 7 | `1` | ✅ 列表只返回自己的 |
| 8 | `{"id":3}` | ⚠️ **要去看库里的 `user_id` 是 1 还是 2** |

**第 8 条必须查库确认：**

```bash
node -e "const db=require('./db'); console.log(db.prepare('SELECT * FROM messages WHERE id=3').get())"
```

**应该看到：**

```text
{ id: 3, user_id: 1, content: '冒充' }
```

**`user_id` 是 `1`（Alice）—— 正确。** 如果是 `2`，说明代码用的是 `req.body.user_id`。

## 8.4 第 6 条要复查一件事

**Alice 删 Bob 的消息返回了 404，Bob 的消息还在吗？**

```bash
node -e "const db=require('./db'); console.log(db.prepare('SELECT * FROM messages WHERE id=2').get())"
```

**应该看到：**

```text
{ id: 2, user_id: 2, content: 'bob 的私密消息' }
```

**还在。** 这才叫"挡住了"。

**为什么会有人以为挡住了其实是删了：**

```js
// ❌ 先删再判断
db.prepare("DELETE FROM messages WHERE id = ?").run(req.params.id);
res.json({ ok: true });
```

**这段代码不需要"越权"，它直接删了。** 因为 `WHERE` 里根本没有 `user_id`。

**这就是为什么第 3 步强调"归属条件要写进 WHERE"。**

---

# 第 9 步：故意犯五个错（30 分钟）

## 错误 1：只写 `requireLogin`，不检查归属

**操作：** 用 1.3 的原版代码。

**会怎样：**

```bash
curl -s http://127.0.0.1:3000/api/messages/2 -H "X-User-Id: 1"
```

```json
{"id":2,"user_id":2,"content":"bob 的私密消息"}
```

**为什么：** `requireLogin` 只回答"你是谁"，不回答"这条是不是你的"。

**怎么修：** `WHERE id = ? AND user_id = ?`。

**怎么验证补住了：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/messages/2 -H "X-User-Id: 1"
```

**应该看到 `404`。** 同时 `id=1` 仍然 `200` —— **两个都要测，否则你可能把所有人的访问都挡了。**

## 错误 2：从 `body` 或 `query` 取 `user_id`

**操作：**

```js
const uid = req.body.user_id || req.query.user_id || req.user.id;
```

**会怎样：**

```bash
curl -s "http://127.0.0.1:3000/api/messages?user_id=2" -H "X-User-Id: 1"
```

**返回了 Bob 的消息。**

**为什么：** `||` 让"用户传的值"优先级最高。**攻击者传了 `user_id=2`，你的服务端就信了。**

**怎么修：**

```js
const uid = req.user.id;   // 没有 fallback，没有 ||
```

**怎么验证补住了：**

```bash
curl -s "http://127.0.0.1:3000/api/messages?user_id=2" -H "X-User-Id: 1" | grep -c "bob"
```

**应该看到 `0`。**

**再加一条静态检查：**

```bash
git grep -nE "req\.(body|query|params)\.(user_?id|uid|userId)"
```

**应该什么都不输出。**

## 错误 3：返回 403，泄露 id 存在

**操作：**

```js
if (row.user_id !== req.user.id) return res.status(403).json({ error: "FORBIDDEN" });
```

**会怎样：**

```text
id=2  → 403（存在，但不是你的）
id=99 → 404（不存在）
```

**为什么是问题：** 攻击者靠 403/404 的差别，能把你的数据"数"出来。

**怎么修：** 改成 `WHERE id = ? AND user_id = ?`，让"不是我的"和"不存在"在 SQL 层就合并成同一个结果。

**怎么验证补住了：**

```bash
for i in 2 99; do
  echo -n "id=$i → "
  curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/messages/$i" -H "X-User-Id: 1"
done
```

**应该看到两行都是 `404`。两者没有区别才算对。**

## 错误 4：只修了详情，列表还在返回全部

**操作：** 修好 `GET /api/messages/:id`，但 `GET /api/messages` 还是 `SELECT * FROM messages`。

**会怎样：**

```bash
curl -s http://127.0.0.1:3000/api/messages -H "X-User-Id: 1"
```

```json
[{"id":1,...},{"id":2,"user_id":2,"content":"bob 的私密消息"}]
```

**为什么这是最讽刺的一种：**

```text
你把"详情"锁死了，攻击者改成请求"列表"，
一次拿到全部数据 —— 比你锁死的那个接口泄露得更多。
```

**怎么修：** 给列表加 `WHERE user_id = ?`，并检查搜索、批量、导出、统计。

**怎么验证补住了：**

```bash
curl -s http://127.0.0.1:3000/api/messages -H "X-User-Id: 1" | grep -c "bob"
```

**应该看到 `0`。**

**然后用第 6.4 步的 grep 把所有 SQL 过一遍。**

## 错误 5：应用用 root 连库，3306 对公网开

**操作：** `.env` 里 `DB_USER=root`，安全组放开 3306。

**会怎样：** 从你自己的电脑直接连上去：

```bash
mysql -h 47.98.xx.xx -u root -p
```

**如果连上了，并且能：**

```sql
SHOW DATABASES;
DROP DATABASE chat;
```

**那你的数据库就不设防了。**

**为什么这是最严重的一个：**

```text
前面的错误泄露的是"某个用户的数据"。
这一个泄露的是"全部数据"，而且可以被删掉。
```

**怎么修：**

```text
① 建专用账号，只给 SELECT/INSERT/UPDATE/DELETE
② bind-address 改成 127.0.0.1
③ 安全组里删掉 3306 的入站规则
④ 应用里的 DB_USER 改成新账号，重启
```

**怎么验证补住了：**

```bash
ss -lntp | grep 3306
```

**应该看到 `127.0.0.1:3306`。**

```bash
timeout 5 bash -c "cat < /dev/null > /dev/tcp/47.98.xx.xx/3306" && echo "⚠️ 还开着" || echo "✅ 连不上"
```

**应该看到 `✅ 连不上`。**

```bash
mysql -u chat_app -p chat -e "DROP TABLE messages;"
```

**应该看到 `ERROR 1142 ... DROP command denied`。**

---

# 第 10 步：写学习笔记（10 分钟）

```markdown
# 第 227 节课学习笔记

## 一、我是怎么越权的

改了哪个数字：
看到了什么：
响应里哪一行证明"这是别人的数据"：

## 二、三类越权的区别

| 类型 | 谁对谁 | 我的项目里有没有 |
|---|---|---|
| 水平 | | |
| 垂直 | | |
| 跨租户 | | |

## 三、修法对比

| 写法 | 能不能挡住 | 会不会泄露存在性 | 容易漏吗 |
|---|---|---|---|
| 只 `WHERE id = ?` | | | |
| 查完再 `if (row.user_id !== ...)` 返 403 | | | |
| `WHERE id = ? AND user_id = ?` | | | |

## 四、写操作也要改

| 操作 | 反例 | 正例 | 怎么判断"没改到" |
|---|---|---|---|
| UPDATE | | | |
| DELETE | | | |
| INSERT | | | |

`info.changes === 0` 我理解成什么：

## 五、双账号测试记录

| # | 谁 | 请求 | 期望 | 实际 |
|---|---|---|---|---|
| 1 | Alice | 读自己的 | 200 | |
| 2 | Alice | 读 Bob 的 | 404 | |
| 5 | Alice | 改 Bob 的 | 404 | |
| 6 | Alice | 删 Bob 的 | 404 | |
| 7 | Alice | 列表条数 | 1 | |
| 8 | Alice | 冒充 Bob 发 | `user_id=1` | |
| 9 | 未登录 | 任意 | 401 | |
| 10 | 不存在 | 读 999 | 404 | |

第 6 条之后，Bob 的消息还在吗：

## 六、数据库账号

| 检查 | 结果 |
|---|---|
| 应用用的用户名 | |
| `SHOW GRANTS` 里有 DROP 吗 | |
| `ss -lntp \| grep 3306` 听哪个地址 | |
| 从我的电脑能连上吗 | |
| `DROP TABLE` 报什么错 | |

## 七、五个错误里，哪个最危险

为什么：

## 八、我还不懂的词

## 九、完成检查

- [ ] 我用两个账号验证过 10 条
- [ ] 详情、列表、改、删、发都有 `user_id`
- [ ] 不是我的数据返回 404，和"不存在"没区别
- [ ] `user_id` 只来自服务端
- [ ] 数据库账号没有 DROP，3306 外网连不上
```

---

# 第 11 步：课后练习

## 练习一：给自己项目做一次"越权体检"

**要求：**

1. 列出所有带"编号"的接口（`:id`、`?id=`、`?ids=`）；
2. 每个都问："这个编号是用户能改的吗？"
3. 能改的，检查它的 SQL 里有没有 `user_id`；
4. 用两个账号各测一遍。

**记录：** 你找到几个洞？最严重的是哪个？

**思考题：** 如果某个接口只有"管理员"会调，还需要检查 `user_id` 吗？

**提示：** 想想"管理员账号被共享"和"管理员也是人"这两件事。

## 练习二：把 `changes === 0` 全部补上

**要求：**

1. `git grep -n "UPDATE\|DELETE"` 找出所有写语句；
2. 每条都检查返回值；
3. 没检查的补上 `if (info.rowsAffected === 0) return 404`。

**记录：** 有几条你原来没检查？

**思考题：** 如果不检查，用户点"删除"会看到什么？他会以为成功了吗？

**提示：** 很多前端会在 200 之后直接把这行从列表里移掉。

## 练习三：写一个"归属检查"的约定

**要求：**

1. 写下你的项目里"哪些表有 `user_id`"；
2. 写下"每条 SQL 必须满足什么"；
3. 把它放进 `README.md` 或 `CONTRIBUTING.md`。

**记录：** 你的约定有几条？

**思考题：** 如果以后加了"团队共享"功能（一条消息多人可见），这个约定要怎么改？

**提示：** 可能需要一张 `message_members` 表，查询变成 `JOIN`。

## 练习四：给数据库账号做一次降权演练

**要求：**

1. 建一个只有 `SELECT, INSERT, UPDATE, DELETE` 的账号；
2. 把应用切过去，重启，确认全站正常；
3. 试 `DROP TABLE`、`GRANT`、`CREATE USER`，全部应该被拒；
4. 记录三条报错原文。

**记录：** 切换过程中应用报了什么错？

**⚠️ 先在练手库上做。** 真库改之前先 `mysqldump` 备份。

**思考题：** 如果应用启动时需要一个"建表"权限（比如自动迁移），怎么办？

**提示：** 迁移用另一个账号，只在部署时用。

## 练习五：用一句话解释给客户听

**要求：** 写 100 字以内，回答："你们的系统会不会出现'A 看到 B 的数据'？"

**记录：** 你写了几版？

**思考题：** 客户最想听到的是"不会"，还是"你怎么证明不会"？

**提示：** 拿出你的双账号测试表。

---

# 第 12 步：最终验收

## A. 概念

- [ ] 我能说清"登录"和"有权访问这条数据"是两件事
- [ ] 我能说出三类越权各是什么，各举一个例子
- [ ] 我知道为什么归属检查要写进 `WHERE`，而不是查完再判断
- [ ] 我知道什么时候用 404、什么时候用 403
- [ ] 我知道数据库账号不该有 `DROP`，3306 不该对公网

## B. 实操

- [ ] 我用两个账号验证过 10 条测试
- [ ] 详情、列表、改、删、发五个接口都带 `user_id`
- [ ] `UPDATE` / `DELETE` 都检查了 `changes === 0`
- [ ] `INSERT` 用的是 `req.user.id`
- [ ] 我建了受限数据库账号，`DROP TABLE` 报 `denied`
- [ ] 我把 3306 改成只听 `127.0.0.1`，从外网连不上
- [ ] 我用 `git grep` 确认没有从 `req.*` 取 `user_id`

## C. 排错

- [ ] 别人的数据返回 404 而不是 500
- [ ] 未登录返回 401 而不是 500
- [ ] 列表接口不漏数据
- [ ] 改别人的数据后，原数据没变
- [ ] 切换数据库账号后，应用能正常启动

## D. 交付

- [ ] `NOTES.md` 里 10 条测试都有"实际"结果
- [ ] `grants.md` 里有 `SHOW GRANTS` 的输出
- [ ] 有 `ss -lntp` 的输出截图或文本
- [ ] 有 `DROP TABLE` 被拒的报错原文

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] "我还不懂的词"有内容
- [ ] 卡住的地方写了真实卡点

## 本节课要能说出口的一句话

> **登录只说明你是谁，不说明这条数据是你的；每个查询都要能回答"它凭什么只返回我的"。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 别人的数据返回 `200` | SQL 里没有 `user_id` 条件 | 加 `AND user_id = ?` |
| 加了 `user_id` 后自己也读不到了 | `req.user.id` 是 `undefined` | 检查 `requireLogin` 有没有挂上 |
| 返回 `403` 被说"泄露存在性" | 用了"查完再判断"的写法 | 改成 SQL 条件，统一 404 |
| `UPDATE` 返回成功但没改到 | 没检查 `changes` | `if (info.changes === 0) return 404` |
| 列表页还是能看到别人的 | 只修了详情接口 | 列表、搜索、批量、导出、统计全查一遍 |
| `IN (?,?)` 报参数数量不对 | 占位符数量和数组长度不一致 | 用 `ids.map(() => "?")` 动态生成 |
| 用户改了 `?user_id=2` 就看到了 | 从 `req.query` 取身份 | 只从 `req.user.id` 取 |
| 管理员也看不到别人的数据了 | `user_id` 条件加太死 | 管理员接口单独写，显式检查角色 |
| `DROP TABLE` 报 `command denied` | 账号权限被收紧了 | **这是对的**，不要放开 |
| `mysqldump` 报 `Access denied` | 新账号没有 `LOCK TABLES` 等权限 | 备份用单独的备份账号 |
| 应用启动报 `ER_ACCESS_DENIED_ERROR` | `.env` 里的账号密码不对 | 核对 `DB_USER` / `DB_PASSWORD` |
| PostgreSQL 报 `permission denied for sequence` | 没给序列权限 | `GRANT USAGE, SELECT ON ALL SEQUENCES` |
| 迁移后应用突然没权限 | 新表没 `GRANT` | 设 `ALTER DEFAULT PRIVILEGES` |
| 从外网连 3306 超时 | 监听只有 `127.0.0.1` | **这是对的** |
| `ss` 显示 `127.0.0.1` 但外网还是能连 | 云安全组有转发 | 去控制台删 3306 入站规则 |
| 多租户场景还是串数据 | 少了 `tenant_id` 条件 | 加 `AND tenant_id = ?`，从会话取 |
