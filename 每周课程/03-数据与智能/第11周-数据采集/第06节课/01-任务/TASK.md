# 第 76 节课：去重与增量

> 这节课结束时，你手上有：`collector\upsert.js`（一个能反复跑、结果不变的写入脚本）、`collector\data\app.db`（30 条商品，跑第二遍还是 30 条）、`collector\data\dedup-report.md`（三次运行的新增/更新/跳过统计）。

**时间**：约 115 分钟
**前置**：第 75 节课洗干净的 `collector\data\clean.json`（7 条），以及第 74 节课抓全的 30 条

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能把数据取回来（第 72–74 节），能洗干净（第 75 节）。

**你现在缺的那一步，是把数据放进数据库，并且能放第二遍。**

听起来很简单。你的第一反应大概是：

```javascript
for (const row of rows) {
  db.prepare("INSERT INTO items (id, name, price) VALUES (?, ?, ?)").run(row.id, row.name, row.price);
}
```

**这段代码跑一次是对的，跑两次就是灾难。**

## 0.2 今天这个坑长什么样

> 第 77 节课要给采集加定时任务，每天凌晨跑一次。
>
> 你写完 `upsert.js`，手动跑了一遍：`写入 30 条`。
>
> 你觉得没问题，睡了。
>
> 第二天早上打开数据库：
>
> ```sql
> SELECT COUNT(*) FROM items;
> -- 60
> ```
>
> 第三天：`90`。
>
> **一个月后：900 条数据，里面 30 条是真的，870 条是同一批东西的副本。**

这个坑有四个变种，你至少会遇到两个：

| 变种 | 现象 | 后果 |
|---|---|---|
| **纯重复插入** | 每次跑都多 30 条 | 库里全是副本，检索时前 10 条全是同一件商品 |
| **用 `INSERT OR REPLACE`** | 条数不多，但 `id` 一直在变 | 你将来用 `id` 关联别的表（比如"这个商品的评论"），一跑采集关联就全断 |
| **只判断存在就跳过** | 条数对，但数据是旧的 | 对方改价了，你库里永远是第一次抓的价格 |
| **"我更新了"但没更新** | 你在代码里写了更新逻辑，跑完发现没变 | 大概率是 `UPDATE` 的 `WHERE` 条件写错了，或者是事务没提交 |

**这条链路上最容易出错的地方，不是写不进去，是"写进去了但你以为是对的"。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 业务主键（natural key） | 数据自己带的、能唯一标识这条记录的字段，比如源站的 `id` | 第 1 步建表时定 |
| 唯一约束（UNIQUE） | 数据库层面的硬规则：这一列不许有两个一样的值 | 第 1 步，`PRIMARY KEY` 自带唯一 |
| UPSERT | "有就更新，没有就插入"，一条 SQL 干两件事 | 第 3、4 步，`ON CONFLICT ... DO UPDATE` |

**三个概念的关系：**

```text
业务主键  →  决定"什么算同一条"
唯一约束  →  让数据库替你守住这条规则（你不守它会报错）
UPSERT    →  在守规则的前提下，把"第二条路"走通（更新而不是报错）
```

**没有唯一约束，UPSERT 无从下手。** 数据库不知道"冲突"是什么，就不会走 `DO UPDATE`。所以顺序不能反。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `upsert.js` | `第06节课\03-练习代码\collector\` | 建表 + UPSERT + 三次运行统计 |
| `data\app.db` | 同上 `data\` | SQLite 数据库，`items` 表 30 行 |
| `data\dedup-report.md` | 同上 | 三次运行的新增/更新/跳过对照 |
| `NOTES.md` | `第06节课\02-笔记\` | 第 7 步填 |

**今天的数据从哪来：** 用第 74 节课的 `items-paged.json`（30 条，字段是 `id / title / price / published_at / url`）。第 75 节洗完的 7 条只在第 5 步拿来做对比实验，主流程用 30 条。

---

# 第 1 步：建表，先把"唯一"这件事定下来（20 分钟）

## 1.1 做什么 / 为什么

**做什么：** 建 `items` 表，给 `source_id` 加唯一约束。

**为什么主键不直接用源站的 `id`：**

你能想到"用源站的 id 当主键"，但真实项目里有个更麻烦的情况：**你要同时抓三个网站的商品。**

```text
网站 A 的商品 id = 1
网站 B 的商品 id = 1
网站 C 的商品 id = 1
```

如果主键就叫 `id`，这三条打架，你只能存一条。

**做法：自增主键 + 业务唯一键（联合唯一）。**

```text
本地 id      INTEGER PRIMARY KEY AUTOINCREMENT   ← 你自己的编号，永远不变
source       TEXT NOT NULL                        ← 来自哪个源，如 "mock"
source_id    TEXT NOT NULL                        ← 源站的 id
UNIQUE (source, source_id)                        ← 这两列组合起来才能唯一确定一条
```

**为什么 `source_id` 用 `TEXT` 不用 `INTEGER`：**

你现在抓的是数字 id，看起来很自然用整数。但迟早会遇到：

```text
淘宝商品 id       "6523412345678"    ← 19 位，超过 JS 安全整数范围
微信公众号文章     "MzkxMjM0..."      ← 字符串
某政府网站公告     "2026-10-001"      ← 带连字符
```

**统一用 `TEXT`，一次麻烦换永久安心。** 数字在 SQLite 里排序照样正常。

## 1.2 操作

**1.** 复制上一节的项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第06节课\03-练习代码"
xcopy /E /I /Y "..\第05节课\03-练习代码\collector" collector
cd collector
del inspect-dirty.js
```

**2.** 装 `better-sqlite3`：

```text
npm install better-sqlite3
```

`better-sqlite3` 是原生模块，要编译，Windows 上依赖预编译包。装不上的情况很常见，先按下面判断：

```text
如果 npm 报 MSBuild / python / node-gyp 相关错误  → 看本节末尾"装不上怎么办"
如果只是慢（1–3 分钟）                          → 正常，等
```

**3.** 新建 `db.js`：

```javascript
// db.js —— 打开数据库，建表。单独一个文件，因为第 77 节还要用它。
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "app.db");

let db;
try {
  const Database = require("better-sqlite3");
  db = new Database(DB_PATH);
} catch (err) {
  // 降级：Node 22.5 以上自带 node:sqlite
  const { DatabaseSync } = require("node:sqlite");
  db = new DatabaseSync(DB_PATH);
}
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT    NOT NULL,
    source_id    TEXT    NOT NULL,
    title        TEXT    NOT NULL,
    price        REAL,
    published_at TEXT,
    url          TEXT,
    content_hash TEXT    NOT NULL,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL,
    UNIQUE (source, source_id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_items_source_id ON items (source, source_id);
`);

console.log("数据库：" + DB_PATH);
console.log("items 表已就绪");

module.exports = db;
```

**4.** 新建 `check-schema.js`，先把表结构打出来看一眼：

```javascript
// check-schema.js —— 确认约束真的建上了
const db = require("./db");

const rows = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='items'")
  .all();

console.log("=== 建表语句 ===");
for (const r of rows) {
  console.log(r.sql);
}

console.log("");
console.log("=== 索引 ===");
const idx = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='items'")
  .all();
for (const r of idx) {
  console.log(r.name + " | " + (r.sql === null ? "(自动创建)" : r.sql));
}

console.log("");
console.log("=== 现在有 " + db.prepare("SELECT COUNT(*) AS n FROM items").get().n + " 行 ===");
```

## 1.3 屏幕上应该看到什么

```text
>node check-schema.js
数据库：B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第06节课\03-练习代码\collector\data\app.db
items 表已就绪
=== 建表语句 ===
CREATE TABLE items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT    NOT NULL,
    source_id    TEXT    NOT NULL,
    ...
    UNIQUE (source, source_id)
  )

=== 索引 ===
idx_items_source_id | CREATE INDEX idx_items_source_id ON items (source, source_id)
sqlite_autoindex_items_1 | (自动创建)

=== 现在有 0 行 ===
```

**注意 `sqlite_autoindex_items_1` 那一行。** 它的 `sql` 是 `null`，因为它是 SQLite 根据 `UNIQUE (source, source_id)` 自动建的内部索引。**看到它，说明唯一约束真的生效了。**

最后一行如果显示 `0 行`，说明表是新建的。如果显示 `30 行`，说明你之前跑过 —— 删 `data\app.db` 重来。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | 没装，或不在 `collector` 目录 | `dir node_modules\better-sqlite3`，没有就重装 |
| `Cannot find module 'node:sqlite'` | Node 低于 22.5，降级也没得降 | 只能装 `better-sqlite3`，见本节末尾 |
| `SqliteError: table items already exists` | 用了 `CREATE TABLE` 而不是 `CREATE TABLE IF NOT EXISTS` | 改 SQL |
| 索引里没有 `sqlite_autoindex_items_1` | `UNIQUE` 写在了表定义外面，或者拼错 | 看建表语句里 `UNIQUE` 有没有在括号内 |
| `SQLITE_CANTOPEN` | `data` 目录不存在 | `db.js` 里已经自动 `mkdirSync`，检查有没有报错被吞掉 |

---

# 第 2 步：第一次写入，30 条（20 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `upsert.js`，把 30 条写进去，统计"新增 / 更新 / 跳过"。

**为什么要统计这三个数，而不是只报"写入成功"：**

```text
"写入成功"                    → 什么都没告诉你
"新增 30 / 更新 0 / 跳过 0"    → 第一次跑，对
"新增 0 / 更新 0 / 跳过 30"    → 重复跑一次，对
"新增 30 / 更新 0 / 跳过 0"    → 第二次跑还是 30 新增，说明去重没生效 ← 这才是要看出来的
```

**统计数字是你判断"去重到底成没成"的唯一证据。** 不看数字，你只能靠 `COUNT(*)` 猜。

## 2.2 操作

**1.** 新建 `upsert.js`：

```javascript
// upsert.js —— 幂等写入：跑一次和跑十次，结果一样
// 用法：node upsert.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const SOURCE = "mock";
const INPUT = path.join(__dirname, "items-paged.json");

// 内容指纹：把"会变的字段"拼起来算哈希
// 注意不包含时间戳这类每次都变的东西，否则每次都会算成"变了"
function contentHash(row) {
  const payload = JSON.stringify({
    title: row.title,
    price: row.price,
    published_at: row.published_at,
    url: row.url,
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function nowIso() {
  return new Date().toISOString();
}

const selectBySourceId = db.prepare(
  "SELECT id, content_hash FROM items WHERE source = ? AND source_id = ?"
);

const insertStmt = db.prepare(`
  INSERT INTO items (source, source_id, title, price, published_at, url, content_hash, created_at, updated_at)
  VALUES (@source, @source_id, @title, @price, @published_at, @url, @content_hash, @now, @now)
`);

const updateStmt = db.prepare(`
  UPDATE items
     SET title = @title,
         price = @price,
         published_at = @published_at,
         url = @url,
         content_hash = @content_hash,
         updated_at = @now
   WHERE source = @source AND source_id = @source_id
`);

const touchStmt = db.prepare(
  "UPDATE items SET updated_at = ? WHERE source = ? AND source_id = ?"
);

function upsertAll(rows) {
  const stat = { inserted: 0, updated: 0, unchanged: 0 };
  const detail = [];

  const run = db.transaction((list) => {
    for (const row of list) {
      const sourceId = String(row.id);
      const hash = contentHash(row);
      const now = nowIso();

      const exist = selectBySourceId.get(SOURCE, sourceId);

      if (exist === undefined) {
        insertStmt.run({
          source: SOURCE,
          source_id: sourceId,
          title: row.title,
          price: row.price === undefined ? null : row.price,
          published_at: row.published_at === undefined ? null : row.published_at,
          url: row.url === undefined ? null : row.url,
          content_hash: hash,
          now: now,
        });
        stat.inserted += 1;
        detail.push("id=" + sourceId + " 新增");
        continue;
      }

      if (exist.content_hash === hash) {
        // 内容没变：不算"跳过"，只更新一下"最近一次见到它"的时间
        touchStmt.run(now, SOURCE, sourceId);
        stat.unchanged += 1;
        continue;
      }

      updateStmt.run({
        source: SOURCE,
        source_id: sourceId,
        title: row.title,
        price: row.price === undefined ? null : row.price,
        published_at: row.published_at === undefined ? null : row.published_at,
        url: row.url === undefined ? null : row.url,
        content_hash: hash,
        now: now,
      });
      stat.updated += 1;
      detail.push("id=" + sourceId + " 更新（hash " + exist.content_hash + " → " + hash + "）");
    }
  });

  run(rows);
  return { stat, detail };
}

function main() {
  const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const rows = Array.isArray(raw) ? raw : raw.data;

  console.log("输入文件：" + INPUT);
  console.log("源标识  ：" + SOURCE);
  console.log("待处理  ：" + rows.length + " 条");
  console.log("");

  const before = db.prepare("SELECT COUNT(*) AS n FROM items").get().n;
  const { stat, detail } = upsertAll(rows);
  const after = db.prepare("SELECT COUNT(*) AS n FROM items").get().n;

  console.log("=== 本次结果 ===");
  console.log("新增   ：" + stat.inserted);
  console.log("更新   ：" + stat.updated);
  console.log("未变化 ：" + stat.unchanged);
  console.log("库内行数：" + before + " → " + after);
  console.log("");

  if (detail.length > 0 && detail.length <= 40) {
    console.log("=== 明细 ===");
    for (const line of detail) {
      console.log("  " + line);
    }
  }
}

main();
```

**2.** 跑第一遍：

```text
node upsert.js
```

## 2.3 屏幕上应该看到什么

```text
>node upsert.js
数据库：B:\...\collector\data\app.db
items 表已就绪
输入文件：B:\...\collector\items-paged.json
源标识  ：mock
待处理  ：30 条

=== 本次结果 ===
新增   ：30
更新   ：0
未变化 ：0
库内行数：0 → 30
```

**这几行必须对上：**

```text
新增 30 + 更新 0 + 未变化 0 = 30   ← 等于待处理条数
库内行数 0 → 30                    ← 净增 30
```

**这两个等式就是你以后每次跑完都要核对的检查。** 加起来不等于总数，说明有行被静默丢掉了（多半是 `continue` 写在了 `try` 外面，异常被吞了）。

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `新增 30` 但 `库内行数 0 → 60` | 之前的表里有数据，删 `data\app.db` 重来 | 删库重建，不要靠 `DELETE FROM` |
| 三者相加 < 30 | 有行在循环里被 `continue` 跳过 | 在循环里加 `console.log("跳过原因:", ...)` |
| `SQLITE_CONSTRAINT_UNIQUE` | 数据源里有重复的 `id` | 这正是唯一约束在干活，见下方 |
| `Cannot read properties of undefined (reading 'title')` | 输入是 `{data: [...]}` 你当数组用了 | 代码里已经兼容两种，检查 `Array.isArray` |
| `price` 全是 `null` | 输入文件的字段名不同（用了 `clean.json`） | 用 `items-paged.json` |

**关于 `SQLITE_CONSTRAINT_UNIQUE`：** 数据源里出现两条 `id` 相同的记录，说明对方的数据有问题。**不要改代码去 `try/catch` 吞掉**，要在写库前先查一遍重复：

```javascript
const seen = new Set();
for (const row of rows) {
  if (seen.has(row.id)) {
    console.log("源数据自身重复：id=" + row.id);
  }
  seen.add(row.id);
}
```

**发现源数据重复，是采集工作的一部分，不是异常。** 记下来，按业务规则处理（不要默认"取第一条"）。

---

# 第 3 步：什么都不改，再跑一遍（15 分钟）

## 3.1 做什么 / 为什么

**做什么：** 原样再跑一次，确认结果是 `新增 0 / 更新 0 / 未变化 30`。

**这一步是整个第 76 节课的核心验收。** 你前面学的所有东西，都只为这一个结果。

**为什么"幂等"这个词值得单独记：**

```text
幂等（idempotent）：同一个操作执行一次和执行一百次，对系统的影响一样
```

采集脚本必须幂等。原因不是"优雅"，是因为**它会被定时任务反复执行**：

```text
凌晨 2 点跑                              → 正常
凌晨 2 点 05 分，你以为没跑，手动又跑一次  → 不能出错
凌晨 2 点 10 分，服务器重启，任务队列重放   → 不能出错
```

**做不到幂等的脚本，只要有一次重跑，你的库就脏了。** 而脏了之后你不敢删，因为分不清哪些是副本。

## 3.2 操作

直接再跑一遍，不加任何参数：

```text
node upsert.js
```

## 3.3 屏幕上应该看到什么

```text
>node upsert.js
...
待处理  ：30 条

=== 本次结果 ===
新增   ：0
更新   ：0
未变化 ：30
库内行数：30 → 30
```

**`库内行数 30 → 30`。** 这个数字不动，才叫去重成功。

再跑第三遍，还是这个结果。**跑十遍也一样。**

## 3.4 如果不是这样

| 现象 | 原因 | 怎么查 |
|---|---|---|
| 新增 0 / 更新 30 | `content_hash` 每次算出来都不一样 | 看 `contentHash` 里是不是混进了时间戳或随机数 |
| 新增 30 / 未变化 0 | `SELECT` 条件没查到已有行 | 打印 `selectBySourceId.get(SOURCE, sourceId)` 看返回值 |
| 库内行数 30 → 60 | 唯一约束没建上 | 跑 `check-schema.js` 看 `sqlite_autoindex_items_1` 在不在 |
| 报 `database is locked` | 上一个 `node` 进程没退出 | 关掉所有终端里的 node，或 `taskkill /IM node.exe /F` |

**最快定位"更新 30"的办法：** 打印两边的 hash。

```javascript
console.log(exist.content_hash, hash);
```

两次打印出来的值不同，问题就在 `contentHash` 的输入上。**最常见的原因是你在 `payload` 里放了 `created_at` 或者 `Date.now()`。**

## 3.5 为什么不直接 `INSERT OR REPLACE`

这是第 2 个故意犯的错（第 6 步会真跑一遍），这里先说结论：

**`INSERT OR REPLACE` 的"REPLACE"不是"更新"，是"删除旧的，插入新的"。**

```sql
-- 你写的
INSERT OR REPLACE INTO items (source, source_id, title) VALUES ('mock', '5', '新标题');

-- SQLite 实际做的
DELETE FROM items WHERE source = 'mock' AND source_id = '5';
INSERT INTO items (source, source_id, title) VALUES ('mock', '5', '新标题');
```

**后果：那个自增的 `id` 会变成一个新的数字。**

```text
第一次跑：id=5 的商品，本地 id = 5
改价后跑：id=5 的商品，本地 id = 31
```

现在假设你明天加一张 `comments` 表，`item_id` 指向 `items.id`。这个商品一被替换，它的评论全部指向一个已经不存在的 `id`。**SQLite 默认不开外键约束，所以不会报错，你只会发现"评论莫名其妙不见了"。**

`ON CONFLICT DO UPDATE` 是真正的更新，`id` 不动。**这是它的唯一优势，也是最关键的优势。**

---

# 第 4 步：改一条数据，看更新真的发生（20 分钟）

## 4.1 做什么 / 为什么

**做什么：** 用 mock-server 提供的 `/api/change` 改一条数据，重新抓，重新写，看结果是 `更新 1`。

**为什么必须做这一步：**

`新增 0 / 未变化 30` 只能证明"去重生效了"。它证明不了"更新生效了"。

有一种情况会同时满足"去重成功"和"数据永远不更新"：

```javascript
if (exist !== undefined) {
  continue;   // ← 只要存在就跳过，代码看起来很"合理"
}
```

**这个写法在生产环境里会造成真实的业务损失：** 对方把价格从 100 改成 80，你的库永远显示 100。客户投诉你"数据是错的"，你查了三天才发现采集脚本从来没更新过任何一行。

**所以"能更新"必须被单独验证一次。**

## 4.2 操作

**1.** 确认 mock-server 还在跑（另一个终端）：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第06节课\03-练习代码\collector"
node mock-server.js
```

**2.** 改一条数据。新建 `change.js`：

```javascript
fetch("http://localhost:3001/api/change")
  .then((r) => r.json())
  .then((j) => console.log(JSON.stringify(j, null, 2)));
```

```text
node change.js
```

**3.** 重新抓一遍 30 条。新建 `refetch.js`：

```javascript
// refetch.js —— 重新抓全 30 条，覆盖 items-paged.json
const fs = require("fs");
const path = require("path");

async function main() {
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetch("http://localhost:3001/api/items?page=" + page + "&size=10");
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }
    const body = await res.json();
    if (body.data.length === 0) break;
    all.push(...body.data);
    if (body.has_next === false) break;
    page += 1;
    if (page > 100) throw new Error("超过 100 页，终止条件写错了");
    await new Promise((r) => setTimeout(r, 1000));
  }
  const out = path.join(__dirname, "items-paged.json");
  fs.writeFileSync(out, JSON.stringify(all, null, 2), "utf8");
  console.log("重新抓取完成：" + all.length + " 条 → " + out);
}

main();
```

```text
node refetch.js
node upsert.js
```

## 4.3 屏幕上应该看到什么

改数据的那一步：

```text
>node change.js
{
  "ok": true,
  "changed": {
    "id": 5,
    "title": "示例条目 5（已改价）",
    "price": 106,
    "published_at": "2026-10-06",
    "url": "http://localhost:3001/item/5"
  }
}
```

重新抓取：

```text
>node refetch.js
重新抓取完成：30 条 → B:\...\collector\items-paged.json
```

写入：

```text
>node upsert.js
...
待处理  ：30 条

=== 本次结果 ===
新增   ：0
更新   ：1
未变化 ：29
库内行数：30 → 30

=== 明细 ===
id=5 更新（hash a3f9c1d8e2b7f045 → 7d21b90e4c8a3f16）
```

**三个数字都必须对：**

```text
新增 0    ← 没有新的
更新 1    ← 恰好一条变了
未变化 29 ← 剩下 29 条没动
```

**`库内行数 30 → 30`**：更新不增加行数。**行数涨了，说明 UPDATE 退化成了 INSERT。**

然后验证库里确实是新值。新建 `peek.js`：

```javascript
const db = require("./db");
const row = db
  .prepare("SELECT id, source_id, title, price, created_at, updated_at FROM items WHERE source_id = ?")
  .get("5");
console.log(row);
```

```text
>node peek.js
{
  id: 5,
  source_id: '5',
  title: '示例条目 5（已改价）',
  price: 106,
  created_at: '2026-11-16T07:12:33.481Z',
  updated_at: '2026-11-16T07:31:08.902Z'
}
```

**重点看最后两个时间：`created_at` 和 `updated_at` 不一样，`id` 还是 5。**

这三个值同时成立，才算"真更新"：

```text
id 没变              → 不是 delete + insert
created_at 没变      → 记录还是原来那条
updated_at 变了      → 确实改过
```

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `更新 0 / 未变化 30` | `/api/change` 没生效，或 `refetch` 抓的是旧数据 | 先 `node change.js` 看返回的 `changed`，再 `node refetch.js` |
| `更新 1` 但 `id` 变了 | 你用的是 `INSERT OR REPLACE` | 换掉 |
| `created_at` 也变了 | 同上，被 `REPLACE` 掉了 | 检查 SQL |
| `更新 30` | `content_hash` 不稳定 | 见第 3.4 节 |
| `SQLITE_BUSY` | 别的进程占着库 | `taskkill /IM node.exe /F` |

---

# 第 5 步：三种去重依据，各自会在哪失效（15 分钟）

## 5.1 做什么 / 为什么

**做什么：** 用三种不同的依据各去重一次，看各自的结果差异。

去重依据不是随便选的。选错，你会在半年后被数据坑一次。

| 依据 | 怎么算 | 什么时候对 | 什么时候错 |
|---|---|---|---|
| **业务主键**（`source + source_id`） | 用源站给的 `id` | 源站 id 稳定且唯一 | 源站 id 会变；或跨源同 id |
| **URL** | 用完整 URL | 一个 URL 就是一条资源 | URL 带跟踪参数（`?utm_source=xxx`）时同一条算成多条 |
| **内容 hash** | 把关键字段拼起来算 sha256 | 识别"内容真的变了" | 内容有无关字段（如"浏览量"）时每次都算成新内容 |

**关键：这三者不是替代关系，是配合关系。**

```text
业务主键  →  决定"这是不是同一条记录"      （身份）
内容 hash →  决定"这条记录有没有变"        （状态）
URL       →  一个辅助依据，单独用不可靠
```

**代码里今天一起用了前两个，这是标准做法。**

## 5.2 操作

新建 `dedup-compare.js`：

```javascript
// dedup-compare.js —— 三种依据各去重一次，看条数差异
const db = require("./db");

const CASES = [
  {
    name: "按 source + source_id",
    key: (r) => r.source + "|" + r.source_id,
  },
  {
    name: "按 url",
    key: (r) => (r.url === null ? "null:" + r.source_id : r.url),
  },
  {
    name: "按 content_hash",
    key: (r) => r.content_hash,
  },
];

const rows = db
  .prepare("SELECT source, source_id, url, content_hash, title, price FROM items ORDER BY id")
  .all();

console.log("库内共 " + rows.length + " 行");
console.log("");

for (const c of CASES) {
  const map = new Map();
  for (const r of rows) {
    const k = c.key(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  console.log("=== " + c.name + " ===");
  console.log("  去重后条数：" + map.size);
  let dup = 0;
  for (const [k, list] of map) {
    if (list.length > 1) {
      dup += 1;
      if (dup <= 3) {
        console.log("  冲突键 " + k + " 有 " + list.length + " 条：" +
          list.map((r) => r.source_id).join(", "));
      }
    }
  }
  console.log("  有冲突的键：" + dup + " 个");
  console.log("");
}
```

再模拟一个"URL 带跟踪参数"的场景，新建 `url-trap.js`：

```javascript
// url-trap.js —— URL 去重的陷阱
const urls = [
  "http://shop.example.com/item/5",
  "http://shop.example.com/item/5?utm_source=weixin",
  "http://shop.example.com/item/5?utm_source=weibo&from=list",
  "http://shop.example.com/item/5#comments",
  "HTTP://SHOP.EXAMPLE.COM/item/5",
];

console.log("原始 5 个 URL，按字符串去重：", new Set(urls).size);

function normalizeUrl(u) {
  const parsed = new URL(u);
  parsed.hash = "";
  const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "from"];
  for (const k of drop) parsed.searchParams.delete(k);
  const sorted = [...parsed.searchParams.entries()].sort();
  parsed.search = "";
  for (const [k, v] of sorted) parsed.searchParams.append(k, v);
  return parsed.toString().toLowerCase();
}

console.log("规范化之后去重：", new Set(urls.map(normalizeUrl)).size);
console.log(urls.map(normalizeUrl));
```

## 5.3 屏幕上应该看到什么

```text
>node dedup-compare.js
库内共 30 行

=== 按 source + source_id ===
  去重后条数：30
  有冲突的键：0 个

=== 按 url ===
  去重后条数：30
  有冲突的键：0 个

=== 按 content_hash ===
  去重后条数：30
  有冲突的键：0 个

>node url-trap.js
原始 5 个 URL，按字符串去重： 5
规范化之后去重： 1
[
  'http://shop.example.com/item/5',
  'http://shop.example.com/item/5',
  'http://shop.example.com/item/5',
  'http://shop.example.com/item/5',
  'http://shop.example.com/item/5'
]
```

**两个结果放在一起看，才有意义：**

```text
30 行数据，三种依据都得到 30 条  → 说明现在这批数据本身很干净
5 个 URL，字符串去重 5 条，规范化后 1 条  → 说明 URL 这个依据有多脆
```

**为什么 mock 的 30 条三种依据都是 30：** 因为它的 `url` 是按 `id` 拼的、内容各不相等。**真实数据不会这么干净。**

**如果按 `content_hash` 去重得到了少于 30 条**，那是一个重要发现：**库里有两件商品内容完全一样。** 这不是去重失败，是"两个不同的商品标题价格全一样"。**这种要用 `source_id` 区分，不能用 hash。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `URL` 那组少于 30 | URL 里有重复（mock 不会，你的真实数据可能） | 这是真发现，记在笔记里 |
| `content_hash` 那组少于 30 | 有条目内容完全相同 | 正常，说明 hash 只该用来判断"变没变"，不该当主键 |
| `new URL` 报 `Invalid URL` | 数据里有相对路径 | 用 `new URL(u, "http://base")` 补全 |
| 规范化后变成 1 条但不一样 | 你的 `drop` 列表不适用 | 按你实际的数据源定制，不要照抄 |

---

# 第 6 步：故意犯四个错（20 分钟）

## 错误 1：用 `INSERT OR REPLACE`

新建 `wrong-replace.js`：

```javascript
const db = require("./db");

db.exec(`
  CREATE TABLE IF NOT EXISTS items_repl (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    UNIQUE (source, source_id)
  );
`);

const ins = db.prepare(
  "INSERT OR REPLACE INTO items_repl (source, source_id, title) VALUES (?, ?, ?)"
);

console.log("--- 第一次 ---");
ins.run("mock", "5", "原价 100");
console.log(db.prepare("SELECT id, title FROM items_repl WHERE source_id='5'").get());

console.log("--- 第二次（改名，模拟改价更新）---");
ins.run("mock", "5", "现价 80");
console.log(db.prepare("SELECT id, title FROM items_repl WHERE source_id='5'").get());

console.log("--- 行数 ---");
console.log(db.prepare("SELECT COUNT(*) AS n FROM items_repl").get().n);
```

**现象：**

```text
--- 第一次 ---
{ id: 1, title: '原价 100' }
--- 第二次（改名，模拟改价更新）---
{ id: 2, title: '现价 80' }
--- 行数 ---
1
```

**原因：** `REPLACE` 是 `DELETE` + `INSERT`。行数没变，但 `id` 从 1 变成 2。**所有用 `id` 关联的地方全断了。**

**怎么查：** 看 `id` 有没有变。`SELECT id` 前后对比，变了就是踩了这个坑。

**正确做法：**

```sql
INSERT INTO items_repl (source, source_id, title) VALUES (?, ?, ?)
ON CONFLICT (source, source_id) DO UPDATE SET title = excluded.title;
```

`excluded` 是 SQLite 给的关键字，代表"这次想插入的那一行"。`excluded.title` 就是新值。

## 错误 2：把 `contentHash` 写成包含时间戳

新建 `wrong-hash.js`：

```javascript
const crypto = require("crypto");

const row = { id: 1, title: "示例条目 1", price: 101, published_at: "2026-10-02", url: "http://localhost:3001/item/1" };

// 错误写法：把 fetched_at 也拼进去了
function badHash(r) {
  const payload = JSON.stringify({ ...r, fetched_at: new Date().toISOString() });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function goodHash(r) {
  const payload = JSON.stringify({
    title: r.title,
    price: r.price,
    published_at: r.published_at,
    url: r.url,
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

console.log("bad  第 1 次：" + badHash(row));
setTimeout(() => {
  console.log("bad  第 2 次：" + badHash(row));
  console.log("good 第 1 次：" + goodHash(row));
  console.log("good 第 2 次：" + goodHash(row));
}, 50);
```

**现象：**

```text
bad  第 1 次：6c1a9e3f8b2d047a
bad  第 2 次：f04b7d21a3e9c588
good 第 1 次：a3f9c1d8e2b7f045
good 第 2 次：a3f9c1d8e2b7f045
```

**原因：** 每次算 hash 输入都不一样（因为带了当前时间），所以每次都"内容变了"。

**后果在 `upsert.js` 里是隐蔽的：** 你看到的是 `更新 30 / 未变化 0`，不是报错。你会以为"更新得很勤快，很好"，实际上是**每一行每个字段都被无意义地重写一遍**，`updated_at` 全部失真。**当你想查"哪些数据最近真的改过"，答案永远是全部，这个字段就废了。**

**怎么查：** 同一个文件跑两次，打印 hash 对比。

## 错误 3：只判断存在就跳过

新建 `wrong-skip.js`：

```javascript
const db = require("./db");

const exists = db
  .prepare("SELECT id FROM items WHERE source=? AND source_id=?")
  .get("mock", "5");
console.log("存在吗：", exists);

if (exists !== undefined) {
  console.log("已经存在，跳过 —— 这就是错误所在");
  console.log("库里的值：", db.prepare("SELECT title, price, updated_at FROM items WHERE source_id='5'").get());
  console.log("源站的值：示例条目 5（已改价） / 106");
}
```

**现象（跑过第 4 步之后）：**

```text
存在吗： { id: 5 }
已经存在，跳过 —— 这就是错误所在
库里的值： {
  title: '示例条目 5（已改价）',
  price: 106,
  updated_at: '2026-11-16T07:31:08.902Z'
}
源站的值：示例条目 5（已改价） / 106
```

**这一次看起来"没问题"，因为第 4 步刚刚更新过。** 再 `node change.js` 改一次价格，然后不跑 `upsert.js` 直接跑 `wrong-skip.js`，你会看到"库里的值"和"源站的值"差了一档。

**原因：** `continue` 是最省事、最像"正确"的写法。它通过了"不重复"的测试，但丢掉了"更新"这个需求。

**怎么查：** 造一次真实变化，看库里跟不跟。

**判断口诀：**

```text
"已经存在" ≠ "不需要管它"
正确的问题不是"有没有"，而是"一不一样"
```

## 错误 4：不开事务

新建 `wrong-tx.js`：

```javascript
const db = require("./db");

// 造一张专门用来炸的表：第 5 条必定违反 NOT NULL
db.exec(`
  CREATE TABLE IF NOT EXISTS tx_demo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seq INTEGER NOT NULL,
    name TEXT NOT NULL
  );
`);
db.exec("DELETE FROM tx_demo");

const ins = db.prepare("INSERT INTO tx_demo (seq, name) VALUES (?, ?)");

console.log("=== 不用事务，跑到第 5 条炸 ===");
try {
  for (let i = 1; i <= 10; i += 1) {
    if (i === 5) {
      ins.run(i, null); // NOT NULL 违反
    } else {
      ins.run(i, "第 " + i + " 条");
    }
  }
} catch (err) {
  console.log("报错：" + err.message);
}
console.log("表里剩了 " + db.prepare("SELECT COUNT(*) AS n FROM tx_demo").get().n + " 条");

// 用事务再来一遍
db.exec("DELETE FROM tx_demo");
console.log("");
console.log("=== 用事务 ===");
const run = db.transaction(() => {
  for (let i = 1; i <= 10; i += 1) {
    if (i === 5) {
      ins.run(i, null);
    } else {
      ins.run(i, "第 " + i + " 条");
    }
  }
});
try {
  run();
} catch (err) {
  console.log("报错：" + err.message);
}
console.log("表里剩了 " + db.prepare("SELECT COUNT(*) AS n FROM tx_demo").get().n + " 条");
```

**现象：**

```text
=== 不用事务，跑到第 5 条炸 ===
报错：NOT NULL constraint failed: tx_demo.name
表里剩了 4 条

=== 用事务 ===
报错：NOT NULL constraint failed: tx_demo.name
表里剩了 0 条
```

**原因：** 没有事务时，前 4 条已经提交了。失败之后你的库里是"半批数据"。**下次跑采集时，前 4 条会被当成"已存在"，你会永远缺第 5 条以后的数据，而且不知道缺了。**

用事务时，整批要么全成、要么全不成，重跑一遍就干净了。

**怎么查：**

```sql
SELECT COUNT(*) FROM items;   -- 跟源站总数对不上，但也不报错
```

**这是采集里最阴险的一种错：它不报错，只是少数据。**

## 四个错误总结

| 错误 | 表面现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| `INSERT OR REPLACE` | 不重复，看起来对 | `id` 变了，所有关联断裂 | 对比更新前后的 `id` |
| hash 含时间戳 | "更新很勤快" | `updated_at` 全部失真 | 同文件跑两次对比 hash |
| 存在就跳过 | 不重复，看起来对 | 数据永远停留在第一次 | 造一次真实变化看跟不跟 |
| 不开事务 | 大多数时候没事 | 失败后库里是半批数据 | `COUNT(*)` 对不上源站 |

**这四个错误的共同点：它们都不会让程序崩溃。**

**新手只看"有没有报错"。这行不是。你要看的是"结果对不对"。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第06节课\02-笔记\NOTES.md`，按里面的小标题逐条填。**小标题和本节完全一致，不要改。**

重点是「三个数字」那一节：把三次运行的真实数字填进去，不要凭印象写。

---

# 第 8 步：课后练习

## 练习一：把 `dedup-report.md` 补全

跑三次，把结果填成一张表，存到 `collector\data\dedup-report.md`：

```markdown
| 次数 | 场景 | 新增 | 更新 | 未变化 | 库内行数 |
|---|---|---|---|---|---|
| 1 | 空库首次 | 30 | 0 | 0 | 0 → 30 |
| 2 | 不改数据重跑 | | | | |
| 3 | `/api/change` 后重跑 | | | | |
```

**要求：把三次的终端输出原样贴进来，不要手抄。**

## 练习二：加一个 `--dry-run`

给 `upsert.js` 加参数：`node upsert.js --dry-run` 时**只统计、不写库**。

提示：最干净的做法是抽一个 `dryRun` 变量，在三个 `stmt.run()` 前面各加一个 `if (!dryRun)`，计数照常加。

验收：`--dry-run` 跑完，`SELECT COUNT(*)` 不变，但统计数字照常输出。

## 练习三：处理"源站删除了一条"

现在你的采集只会新增和更新。如果源站把某个商品下架了，你的库里还留着。

**两个方案，选一个实现，并说明为什么选它：**

```text
方案 A：软删除 —— 加一列 is_deleted，全量抓完之后，把本次没出现过的行标成 1
方案 B：硬删除 —— 直接 DELETE 本次没出现的行
```

**这个选择不是技术问题，是业务问题。** 写清你的理由（提示：如果一个客户在引用这条数据，删掉会怎样）。

## 练习四：给 `content_hash` 加版本

当你的字段列表变化时（比如明天你开始抓"库存"了），所有 hash 都会变，全库会发生一次"假更新"。

**设计一个带版本号的 hash：**

```text
hash_v1 = sha256("v1", title, price)
hash_v2 = sha256("v2", title, price, stock)
```

要求：能在迁移时批量重算 hash，而不触发一次"全部更新"。提示：迁移时同步把新旧 hash 都算出来，只在"新旧都不相等"时才更新。

## 练习五：用自己的话讲清

不看课件，回答这四个问题：

1. 为什么主键不能用源站的 `id`？
2. `INSERT OR REPLACE` 和 `ON CONFLICT DO UPDATE` 的区别是什么？为什么前者危险？
3. `content_hash` 里为什么不能放时间戳？
4. 事务在采集脚本里防的是什么？为什么不开事务的错误最难发现？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出"业务主键"和"内容 hash"分别管什么，二者为什么不能互相替代
- [ ] 我能解释 `UNIQUE (source, source_id)` 里为什么要带 `source`
- [ ] 我能说出 UPSERT 的两个组成部分，以及没有唯一约束会怎样
- [ ] 我能用一句话说清"幂等"

## B. 实操

- [ ] `check-schema.js` 能看到 `sqlite_autoindex_items_1`
- [ ] 空库首跑：`新增 30 / 更新 0 / 未变化 0`，行数 `0 → 30`
- [ ] 原样重跑：`新增 0 / 更新 0 / 未变化 30`，行数 `30 → 30`
- [ ] `change.js` + `refetch.js` 后重跑：`新增 0 / 更新 1 / 未变化 29`，行数 `30 → 30`
- [ ] 更新后 `id` 和 `created_at` 没变，`updated_at` 变了
- [ ] `dedup-compare.js` 三种依据都跑过，知道各自会怎么失效
- [ ] `url-trap.js` 里 5 个 URL 规范化后变成 1 个

## C. 排错

- [ ] 我亲手跑过 `INSERT OR REPLACE`，看到了 `id` 变化
- [ ] 我亲手构造过含时间戳的 hash，看到了每次都变
- [ ] 我亲手跑过不开事务的批量插入，看到了"剩 4 条"
- [ ] 我至少遇到过 `SQLITE_CONSTRAINT_UNIQUE` 或 `database is locked` 中的一个，并解决了

## D. 笔记

- [ ] `NOTES.md` 十一个小标题都有内容
- [ ] 三次运行的统计表填了，贴的是终端原文
- [ ] 「我还不懂的词」写了至少一个真实的词
- [ ] 练习三的选择理由写清了（不是"我选 A 因为简单"）

---

## 本节课要能说出口的一句话

> **采集脚本要能跑一百遍。判断标准不是"有没有报错"，是"三个数字加不加得起来、行数动不动"。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | 当前目录 | `cd` 到 `collector` 再跑 |
| `Cannot find module 'node:sqlite'` | `node -v` 低于 22.5 | 只能用 `better-sqlite3` |
| `npm install better-sqlite3` 编译失败 | 报错里有没有 `node-gyp` / `MSBuild` | 见下方"装不上怎么办" |
| `SQLITE_BUSY: database is locked` | 有没有别的 node 进程开着同一个库 | `taskkill /IM node.exe /F` 后重跑 |
| `SQLITE_CONSTRAINT_UNIQUE` | 源数据里有没有重复 id | 写库前先去重检查，别 `try/catch` 吞掉 |
| 重跑还是"新增 30" | 唯一约束建上了吗 | `node check-schema.js` |
| 更新了但数据没变 | `content_hash` 稳不稳 | 打印两边 hash |
| `updated_at` 每次都变 | 正常，这是"最近一次见到" | 要区分"真改了"就另加 `changed_at` |
| 行数对但内容旧 | 存在就跳过 | 改成 UPSERT |
| `NOT NULL constraint failed` | 哪个字段没值 | 清洗阶段就该处理，别等到写库 |

---

## 附：`better-sqlite3` 装不上怎么办

**按顺序试，不要跳。**

**第一步：确认 Node 版本。**

```text
node -v
```

如果是 22.5 以上，直接改 `db.js` 走降级分支，把 `require("better-sqlite3")` 那行注释掉。`node:sqlite` 的 API 和 `better-sqlite3` 有 90% 相同（`prepare`、`run`、`get`、`all`、`exec` 都有）。

**第二步：换 Node 版本。**

`better-sqlite3` 的预编译包跟着 Node 大版本走。Node 版本太新（刚发布几周的大版本）常常还没有预编译包，会退化成源码编译，然后就缺 MSBuild。

**装一个 LTS 版本，别追最新。**

**第三步：只装预编译包，禁止编译。**

```text
npm install better-sqlite3 --build-from-source=false
```

**第四步：确认有 Visual Studio Build Tools。**

只在前面几步都失败时才需要。装的时候勾选"使用 C++ 的桌面开发"，约 3–6 GB。**为了一个课程练手装 6GB 的编译器，不值得。优先走第一步。**

**降级方案对后续课程的影响：**

```text
FTS5           node:sqlite 也支持，第 13 周不受影响
事务           db.transaction() 是 better-sqlite3 的语法糖
               node:sqlite 用手写 BEGIN / COMMIT
本课程脚本两个都兼容，代码里写了分支
WAL 模式       两套都支持
```

**唯一的真实差异：`db.transaction()`。** 走降级分支时，把 `upsertAll` 改成手写事务：

```javascript
function upsertAll(rows) {
  const stat = { inserted: 0, updated: 0, unchanged: 0 };
  const detail = [];
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      // 循环体同上
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { stat, detail };
}
```

**这是唯一需要改的地方。** 记在笔记里，以后换机器不用重新踩。
