# 第 33 节课：关联两张表

## 本节课要解决的问题

上节课你只在单张表上查。但真实数据是分开存的：

```text
orders 表里只有 customer_id = 1
客户的电话号码在 customers 表里
```

**怎么一次查出"订单号 + 客户名字 + 客户电话"？**

这就是 `JOIN` 要解决的事。

**为什么不能"查两次然后在代码里拼"：**

能，但很慢，而且叫 N+1 查询问题。**这节课会给实测数字。**

**这节课你会学到：**

- `INNER JOIN` / `LEFT JOIN` 的区别（一个例子看清）；
- 一对多、多对多怎么用 SQL 表达；
- `GROUP_CONCAT` 把多行合成一行（做标签、做列表很有用）；
- **N+1 查询问题**：为什么"查一次再循环查"是错的；
- `JOIN` 的性能为什么会变慢（笛卡尔积）；
- **把 `chat-app` 从 JSON 真正迁到数据库**（本阶段大作业）。

**这节课不学：** 索引优化（下节课）、`RIGHT JOIN`（SQLite 3.39+ 才支持，用得少）、窗口函数。

**需要多久：** 110 分钟。

---

## 第 0 步：造一个有"关系"的数据库（15 分钟）

**为什么要新建数据库：**

上节课的 `products` 是孤立的表。**这节课要的是"表之间有关系"。**

### 0.1 建文件夹和种子脚本

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第05节课\03-练习代码
   ```

2. 新建文件夹 `join-lab`，进去，地址栏输入 `cmd` 回车。
3. 新建 `seed.mjs`。

### 0.2 六张互相关联的表

**操作：自己敲：**

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("join.db");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES authors(id),
    price_cents INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )
`);

// 中间表：书和标签是多对多
db.exec(`
  CREATE TABLE IF NOT EXISTS book_tags (
    book_id INTEGER NOT NULL REFERENCES books(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (book_id, tag_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    qty INTEGER NOT NULL check (qty > 0),
    unit_price_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// 清空
for (const t of ["orders", "book_tags", "books", "tags", "authors", "customers"]) {
  db.exec(`DELETE FROM ${t}`);
}

// 作者
const insAuthor = db.prepare("INSERT INTO authors (name) VALUES (?)");
insAuthor.run("鲁迅");
insAuthor.run("余华");
insAuthor.run("莫言");
insAuthor.run("一个从没写过书的作者");   // 故意造一个"没有书"的作者

// 书
const insBook = db.prepare("INSERT INTO books (title, author_id, price_cents) VALUES (?,?,?)");
insBook.run("呐喊", 1, 2800);
insBook.run("彷徨", 1, 3000);
insBook.run("活着", 2, 3900);
insBook.run("兄弟", 2, 4500);
insBook.run("红高粱", 3, 3600);

// 标签
const insTag = db.prepare("INSERT INTO tags (name) VALUES (?)");
insTag.run("小说");
insTag.run("经典");
insTag.run("当代");
insTag.run("获奖");

// 书和标签的关系（多对多）
const insBT = db.prepare("INSERT INTO book_tags (book_id, tag_id) VALUES (?,?)");
insBT.run(1, 1);  // 呐喊 - 小说
insBT.run(1, 2);  // 呐喊 - 经典
insBT.run(2, 1);  // 彷徨 - 小说
insBT.run(3, 1);  // 活着 - 小说
insBT.run(3, 3);  // 活着 - 当代
insBT.run(5, 1);  // 红高粱 - 小说
insBT.run(5, 4);  // 红高粱 - 获奖
// 注意：彷徨(2) 只有 "小说" 一个标签；兄弟(4) 没有任何标签

// 客户
const insCust = db.prepare("INSERT INTO customers (name, phone) VALUES (?,?)");
insCust.run("小明", "13800000001");
insCust.run("小红", "13800000002");
insCust.run("小刚", "13800000003");   // 故意造一个"没下过单"的客户

// 订单
const insOrder = db.prepare(
  "INSERT INTO orders (customer_id, book_id, qty, unit_price_cents, created_at) VALUES (?,?,?,?,?)"
);
const now = Date.now();
const day = 24 * 3600 * 1000;
insOrder.run(1, 1, 2, 2800, new Date(now - 5 * day).toISOString());
insOrder.run(1, 3, 1, 3900, new Date(now - 4 * day).toISOString());
insOrder.run(2, 2, 3, 3000, new Date(now - 3 * day).toISOString());
insOrder.run(1, 5, 1, 3600, new Date(now - 2 * day).toISOString());
insOrder.run(2, 1, 1, 2800, new Date(now - 1 * day).toISOString());

console.log("作者:", db.prepare("SELECT COUNT(*) AS c FROM authors").get().c);
console.log("书:", db.prepare("SELECT COUNT(*) AS c FROM books").get().c);
console.log("标签:", db.prepare("SELECT COUNT(*) AS c FROM tags").get().c);
console.log("客户:", db.prepare("SELECT COUNT(*) AS c FROM customers").get().c);
console.log("订单:", db.prepare("SELECT COUNT(*) AS c FROM orders").get().c);

db.close();
```

**运行：**

```text
node seed.mjs
```

**应该看到：**

```text
作者: 4
书: 5
标签: 4
客户: 3
订单: 5
```

### 0.3 这批数据里故意埋的四个"边界"

**这四个你必须知道，因为它们是测试 JOIN 的关键：**

| 埋的东西 | 用来测什么 |
|---|---|
| 作者"一个从没写过书的作者" | `LEFT JOIN` 才会出现，`INNER JOIN` 不会 |
| 客户"小刚"（没下过单） | 同上 |
| 书"兄弟"（没有任何标签） | 多对多查询里的空情况 |
| 书"彷徨"（只有一个标签） | 一个书多个标签时的格式 |

**如果你不特意造这些，你的 JOIN 查询看起来都对，一上真实数据就出问题。**

**第 0 步做完了。**

---

## 第 1 步：`INNER JOIN` —— 只保留两边都有的（20 分钟）

### 1.1 先看不 JOIN 的原始数据

**操作：** 新建 `step1.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("join.db");

console.log("=== books 表（只有 author_id，没有作者名） ===");
console.log(db.prepare("SELECT * FROM books").all().map(r => ({ ...r })));

db.close();
```

**运行，你会看到：**

```text
[
  { id: 1, title: '呐喊', author_id: 1, price_cents: 2800 },
  { id: 2, title: '彷徨', author_id: 1, price_cents: 3000 },
  ...
]
```

**问题很清楚：** 你只知道 `author_id = 1`，**不知道 1 是谁。**

### 1.2 用 `INNER JOIN` 把名字查出来

**操作：**

```javascript
const rows = db.prepare(`
  SELECT b.id, b.title, a.name AS author
  FROM books b
  INNER JOIN authors a ON a.id = b.author_id
`).all();

console.log(rows.map(r => ({ ...r })));
```

**我的实测输出：**

```text
[
  { id: 1, title: '呐喊', author: '鲁迅' },
  { id: 2, title: '彷徨', author: '鲁迅' },
  { id: 3, title: '活着', author: '余华' },
  { id: 4, title: '兄弟', author: '余华' },
  { id: 5, title: '红高粱', author: '莫言' }
]
```

**逐部分读这个 SQL：**

```sql
SELECT b.id, b.title, a.name AS author
FROM books b
INNER JOIN authors a ON a.id = b.author_id
```

| 部分 | 意思 |
|---|---|
| `FROM books b` | 主表是 `books`，给它起个别名 `b` |
| `INNER JOIN authors a` | 关联 `authors` 表，别名 `a` |
| `ON a.id = b.author_id` | **关联条件**：`a.id` 等于 `b.author_id` |
| `b.title` | 取 `books` 表的 `title` |
| `a.name AS author` | 取 `authors` 表的 `name`，改名成 `author` |

**为什么必须用别名：**

因为两张表都有 `id` 和 `name` 这类同名列。**不加别名，SQL 不知道你要哪个。**

```sql
SELECT id FROM books b JOIN authors a ON ...     -- ❌ 报错：ambiguous column name: id
SELECT b.id FROM books b JOIN authors a ON ...   -- ✅ 明确
```

**报错原文：**

```text
ambiguous column name: id
```

**"ambiguous" 是"模棱两可"的意思。** 看到这个错，就是"你得加表别名"。

**这个别名规则很重要：**

```text
只要 JOIN 了，所有列都加表别名前缀。
```

**不要图省事只给有冲突的列加。** 因为以后表加了同名列，你的代码就突然报错了。

### 1.3 `INNER JOIN` 的特点：只保留匹配上的

**看我们的数据：**

- `authors` 表有 4 个作者，其中"一个从没写过书的作者"没有任何书；
- `books` 表有 5 本书，每本都有 `author_id`。

**`INNER JOIN` 的结果只有 5 行 —— 那个没写过书的作者不见了。**

**这就是 `INNER JOIN` 的规则：**

```text
只保留"两边都能匹配上"的行。
```

**用集合图理解：**

```text
books: 5 本     authors: 4 个
    ┌────────┐  ┌────────┐
    │ 5 本书  │  │ 4 作者  │
    │        │  │        │
    └────────┘  └────────┘
     交集 = 5 本（因为每本书都有作者）
     那个"没写过书的作者"不在交集里
```

**验证：**

```javascript
const inner = db.prepare(`
  SELECT a.name, b.title FROM authors a INNER JOIN books b ON b.author_id = a.id
`).all();
console.log("INNER JOIN 行数：", inner.length);   // 5
console.log("出现了哪些作者：", [...new Set(inner.map(r => r.name))]);  // 鲁迅、余华、莫言
```

**"一个从没写过书的作者"没有出现。**

### 1.4 什么时候该用 `INNER JOIN`

| 场景 | 用 `INNER` 吗 |
|---|---|
| 订单列表 + 客户名（订单一定有客户） | ✅ 用 |
| 书列表 + 作者名（书一定有作者） | ✅ 用 |
| 作者列表 + 他的书（作者可能没书） | ❌ **不能用**，要用 `LEFT` |

**判断标准：**

```text
如果"主表里有些行没有匹配"，就不能用 INNER JOIN，否则那些行会消失。
```

**这是 `INNER JOIN` 最常见的错误：你以为查"所有作者和他的书"，结果没书的作者全没了。**

---

## 第 2 步：`LEFT JOIN` —— 保留主表全部（20 分钟）

### 2.1 用 `LEFT JOIN` 查"所有作者和他的书"

**操作：**

```javascript
const rows = db.prepare(`
  SELECT a.name, b.title
  FROM authors a
  LEFT JOIN books b ON b.author_id = a.id
`).all();

console.log(rows.map(r => ({ ...r })));
```

**我的实测输出：**

```text
[
  { name: '鲁迅', title: '呐喊' },
  { name: '鲁迅', title: '彷徨' },
  { name: '余华', title: '活着' },
  { name: '余华', title: '兄弟' },
  { name: '莫言', title: '红高粱' },
  { name: '一个从没写过书的作者', title: null }
]
```

**关键：最后一行出现了，`title` 是 `null`。**

**这就是 `LEFT JOIN` 的规则：**

```text
保留"左表"的全部行。右表匹配不上就填 null。
```

**"左表"是哪个：** `FROM` 后面那个。我们写的是 `FROM authors a LEFT JOIN books b`，所以左表是 `authors`。

**图：**

```text
authors（左表，全部保留）
    ┌─────────────┐
    │ 4 个作者     │
    │  ┌────────┐ │
    │  │ 有书的  │ │  ← 匹配上的，填 book 数据
    │  │ 3 个    │ │
    │  ├────────┤ │
    │  │ 没书的  │ │  ← 保留，book 字段填 null
    │  │ 1 个    │ │
    │  └────────┘ │
    └─────────────┘
```

### 2.2 方向搞反会怎样

**操作：** 换一下方向：

```javascript
const rows2 = db.prepare(`
  SELECT a.name, b.title
  FROM books b
  LEFT JOIN authors a ON a.id = b.author_id
`).all();

console.log(rows2.map(r => ({ ...r })));
```

**我的实测输出：**

```text
[
  { name: '鲁迅', title: '呐喊' },
  { name: '鲁迅', title: '彷徨' },
  { name: '余华', title: '活着' },
  { name: '余华', title: '兄弟' },
  { name: '莫言', title: '红高粱' }
]
```

**只有 5 行了！那个没书的作者又不见了。**

**为什么：** 因为现在左表是 `books`，**它保留 `books` 的全部行**（5 本），右表 `authors` 匹配不上就填 null。

**但每本书都有作者，所以没有 null。**

**记住这个：**

```text
LEFT JOIN 的"左"是 FROM 后面那张表，不是 SELECT 里写的第一个。
```

**这个很容易搞混。** 你写 `SELECT a.name... FROM books b LEFT JOIN authors a`，看起来 `authors` 在"前面"，但它是右表。

**判断方法的唯一依据：`FROM` 后面是谁。**

### 2.3 用 `LEFT JOIN` 找出"没有关联数据"的行

**这是个非常实用的技巧。**

**需求：找出所有没有写过书的作者。**

```javascript
const noBook = db.prepare(`
  SELECT a.id, a.name
  FROM authors a
  LEFT JOIN books b ON b.author_id = a.id
  WHERE b.id IS NULL
`).all();

console.log("没写过书的作者：", noBook.map(r => ({ ...r })));
```

**输出：**

```text
[ { id: 4, name: '一个从没写过书的作者' } ]
```

**原理：**

1. `LEFT JOIN` 保留所有作者，没书的填 `null`；
2. `WHERE b.id IS NULL` 只留那些"填了 null"的。

**为什么用 `b.id` 而不是 `b.title`：** 因为 `id` 是主键，**不可能真的是 null**（除非没匹配上）。而 `title` 理论上可能允许 null（虽然我们加了 `NOT NULL`）。

**用主键判断更可靠。**

**这个模式在真实项目里用得极多：**

| 需求 | 写法 |
|---|---|
| 找出没下过单的客户 | `customers LEFT JOIN orders ... WHERE orders.id IS NULL` |
| 找出没有标签的书 | `books LEFT JOIN book_tags ... WHERE book_tags.tag_id IS NULL` |
| 找出没有评论的文章 | `articles LEFT JOIN comments ... WHERE comments.id IS NULL` |

**这叫"反连接"（anti-join）。** 记住这个套路。

### 2.4 `INNER` vs `LEFT` 一句话总结

```text
INNER JOIN：只要匹配上的（会丢行）
LEFT JOIN ：左表全留，右表补 null（不丢行）
```

**选哪个的判断：**

```text
问自己："没有匹配的那些行，我要不要？"
要 → LEFT JOIN
不要 → INNER JOIN
```

---

## 第 3 步：多对多怎么查（20 分钟）

### 3.1 为什么需要中间表

**"书"和"标签"是多对多：**

- 一本书可以有多个标签；
- 一个标签可以属于多本书。

**不能这样设计：**

```sql
-- ❌ 错的：books 表加一个 tags 列
CREATE TABLE books (
  ...
  tags TEXT   -- 存 "小说,经典"
);
```

**为什么错：**

| 问题 | 说明 |
|---|---|
| 查不了 | "找出所有带「经典」标签的书"要 `LIKE '%经典%'`，会误匹配"非经典" |
| 改不了 | 要删一个标签，得改字符串 |
| 没约束 | 标签名可能拼错，没有地方管 |
| 索引无效 | 字符串搜索用不上索引 |

**正确做法：用中间表。**

```text
books         book_tags          tags
  id            book_id            id
  title         tag_id             name
                ↑
            (book_id, tag_id) 组合主键
```

**`book_tags` 表的每一行 = "某本书有某个标签"。**

**一行记录就是一个"关系"。**

### 3.2 查"某本书的所有标签"

**操作：**

```javascript
const tags = db.prepare(`
  SELECT b.title, t.name AS tag
  FROM books b
  JOIN book_tags bt ON bt.book_id = b.id
  JOIN tags t ON t.id = bt.tag_id
  WHERE b.id = ?
`).all(1);

console.log("《呐喊》的标签：", tags.map(r => ({ ...r })));
```

**我的实测输出：**

```text
《呐喊》的标签： [
  { title: '呐喊', tag: '小说' },
  { title: '呐喊', tag: '经典' }
]
```

**读这个 SQL：**

```text
books → book_tags → tags
         ↑    ↑
     book_id  tag_id
```

**三步走：**

1. 从 `books` 找到那本书；
2. 通过 `book_tags.book_id` 找到它的所有关系行；
3. 通过 `tags.id` 把 `tag_id` 变成标签名。

**注意这里用了两个 `JOIN`。** 多对多查询就是"过两次桥"。

### 3.3 查"每个标签下有多少本书"

```javascript
const stats = db.prepare(`
  SELECT t.name AS tag, COUNT(bt.book_id) AS book_count
  FROM tags t
  LEFT JOIN book_tags bt ON bt.tag_id = t.id
  GROUP BY t.id
  ORDER BY book_count DESC
`).all();

console.log(stats.map(r => ({ ...r })));
```

**我的实测输出：**

```text
[
  { tag: '小说', book_count: 4 },
  { tag: '经典', book_count: 1 },
  { tag: '当代', book_count: 1 },
  { tag: '获奖', book_count: 1 }
]
```

**为什么用 `LEFT JOIN`：** 如果某个标签一本书都没有，用 `INNER JOIN` 它就不出现了。**但你要显示"这个标签有 0 本书"。**

**`COUNT(bt.book_id)` 而不是 `COUNT(*)`：**

**这是关键。** `COUNT(*)` 会数行数，**`LEFT JOIN` 补的 null 行也算一行**，所以会数成 1。

```sql
COUNT(*)             → 没有书的标签会是 1（错）
COUNT(bt.book_id)    → 没有书的标签是 0（对，因为 null 不被 COUNT 计数）
```

**这个细节极其重要。** 你以后做"统计每个分类下多少商品"，如果不注意这个，**所有 0 的都会变成 1**。

### 3.4 `GROUP_CONCAT`：把多行合成一行

**场景：** 前端要一个列表，"每本书 + 它的所有标签用逗号连起来"。

**用 `GROUP_CONCAT`：**

```javascript
const rows = db.prepare(`
  SELECT
    b.title,
    GROUP_CONCAT(t.name, '、') AS tags
  FROM books b
  LEFT JOIN book_tags bt ON bt.book_id = b.id
  LEFT JOIN tags t ON t.id = bt.tag_id
  GROUP BY b.id
`).all();

console.log(rows.map(r => ({ ...r })));
```

**我的实测输出：**

```text
[
  { title: '呐喊', tags: '小说、经典' },
  { title: '彷徨', tags: '小说' },
  { title: '活着', tags: '小说、当代' },
  { title: '兄弟', tags: null },          ← 注意这个！
  { title: '红高粱', tags: '小说、获奖' }
]
```

**`GROUP_CONCAT(列, 分隔符)` 是什么：** 把分组内多行的值连成一个字符串。

**注意 `兄弟` 那行是 `null` 不是空字符串。**

**为什么：** 因为它没有任何标签，`GROUP_CONCAT` 对"全是 null"的组返回 `null`。

**这个坑必须处理：**

```javascript
tags: r.tags ?? ""     // 前端要空字符串
tags: r.tags ? r.tags.split("、") : []   // 前端要数组
```

**为什么用 `??` 不用 `||`：** 如果一个标签名字是 `"0"`（虽然不太可能），`||` 会把它当假值。用 `??` 只处理 `null`。

**`GROUP_CONCAT` 的两个限制：**

| 限制 | 说明 |
|---|---|
| **顺序不确定** | 默认按数据库返回顺序，可能不是你想要的 |
| 有长度上限 | SQLite 默认 1MB，超了会截断 |

**想要确定的顺序：**

```sql
GROUP_CONCAT(t.name, '、' ORDER BY t.name)
```

**等等，SQLite 支持 `GROUP_CONCAT` 内部排序吗？**

**实测：不支持。** SQLite 的 `GROUP_CONCAT` 没有 `ORDER BY` 参数（PostgreSQL 有）。

**SQLite 的做法：先排序子查询，再聚合。**

```sql
SELECT b.title, GROUP_CONCAT(t.name, '、') AS tags
FROM books b
LEFT JOIN (
  SELECT bt.book_id, t.name
  FROM book_tags bt JOIN tags t ON t.id = bt.tag_id
  ORDER BY t.name
) t ON t.book_id = b.id
GROUP BY b.id
```

**这个写法更复杂，但顺序确定。**

**但其实还有更简单的办法：在 JS 里排。**

```javascript
// 如果只需要"有标签"，用 GROUP_CONCAT
// 如果顺序重要，查出来在 JS 里组装
```

**实用建议：数据量小就在 JS 里组装，`GROUP_CONCAT` 只用于"给人看的摘要"。**

### 3.5 多对多的三个查询模式

记住这三个，多对多就都会了：

| 需求 | 写法 |
|---|---|
| 某本书的标签 | `books JOIN book_tags JOIN tags WHERE books.id = ?` |
| 某个标签的书 | `tags JOIN book_tags JOIN books WHERE tags.id = ?` |
| 每个标签的书数 | `tags LEFT JOIN book_tags GROUP BY tags.id` |

**都是"两张表过中间表"。**

---

## 第 4 步：N+1 查询问题（25 分钟）

**这一步是全课最重要的性能认知。**

### 4.1 什么是 N+1

**假设你要做一个"订单列表"，每条显示客户名字。**

**"笨办法"（很多人第一次都这么写）：**

```javascript
// 第 1 次查询：拿订单
const orders = db.prepare("SELECT id, customer_id, qty FROM orders").all();

// 然后每条订单再查一次客户（N 次查询）
const result = orders.map((o) => {
  const c = db.prepare("SELECT name FROM customers WHERE id = ?").get(o.customer_id);
  return { id: o.id, customer: c.name, qty: o.qty };
});
```

**查询次数 = 1（订单） + N（每个订单查客户）。**

**这就是 N+1：1 次主查询 + N 次从查询。**

### 4.2 为什么 N+1 是错的

**先看数字。我们的数据只有 5 条订单，所以差别不明显。但可以算出来：**

| 订单数 | N+1 的查询次数 | JOIN 的查询次数 |
|---|---|---|
| 5 | 6 | 1 |
| 100 | 101 | 1 |
| 10,000 | **10,001** | 1 |

**关键不是"查询次数多"，是"每次查询都有固定开销"。**

**每次 `prepare` + `run` 都要：**

1. 解析 SQL；
2. 编译成执行计划；
3. 执行；
4. 返回结果。

**前两步的开销和"查多少数据"无关，是固定的。**

**所以 10000 条订单，你要付 10001 次"固定开销"。**

**实测对比（我在 5 条数据上）：**

```javascript
let t = Date.now();
for (const o of db.prepare("SELECT id, customer_id FROM orders").all()) {
  db.prepare("SELECT name FROM customers WHERE id = ?").get(o.customer_id);
}
console.log("N+1 耗时：", Date.now() - t, "ms");

t = Date.now();
db.prepare(`
  SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id
`).all();
console.log("JOIN 耗时：", Date.now() - t, "ms");
```

**我的实测输出：**

```text
N+1 耗时： 1 ms
JOIN 耗时： 0 ms
```

**在 5 条数据上差别只有 1ms。** 这个数字骗人 —— **它让你觉得 N+1 没问题。**

**但你可以自己把数据加到 10000 条试一下。** 差别会变成秒级。

**这就是为什么这个 bug 能活到上线：小数据量测不出来。**

### 4.3 正确的写法

```javascript
const rows = db.prepare(`
  SELECT
    o.id,
    o.qty,
    o.unit_price_cents,
    c.name AS customer_name,
    c.phone AS customer_phone
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  ORDER BY o.created_at DESC
`).all();

const result = rows.map((r) => ({
  id: r.id,
  qty: r.qty,
  customer: r.customer_name,
  phone: r.customer_phone,
  totalYuan: ((r.qty * r.unit_price_cents) / 100).toFixed(2),
}));
```

**一次查询拿到全部。**

**注意这里还在 JS 里做了计算（`qty * unit_price_cents`）。这是可以的** —— 因为这是"这一行内部的计算"，不是"再去查别的表"。

### 4.4 什么情况"不得不用" N+1

**有时候确实不能一次查完。比如：**

**情况一：要查的数据在外部系统**

```text
订单数据库 → 查订单
用户信息在另一个 API → 每个订单要调一次 API
```

**那怎么办：批量查。**

```javascript
// ❌ N+1
for (const o of orders) { const u = await fetchUser(o.userId); }

// ✅ 一次批量
const userIds = [...new Set(orders.map(o => o.userId))];
const users = await fetchUsers(userIds);   // 一次拿多个
```

**关键：** **支持批量查询的接口，一次传多个 id。**

**情况二：需要第三方的实时数据**

**这种没法优化，只能接受。但要限制 N 的大小**（比如分页 20 条，不是 10000 条）。

### 4.5 一个"半 N+1"的坑：循环里 `prepare`

**看这段代码：**

```javascript
for (const item of items) {
  const stmt = db.prepare("INSERT INTO t (a) VALUES (?)");
  stmt.run(item);
}
```

**这是 N 次 `prepare` + N 次 `run`。**

**正确做法：`prepare` 提到循环外。**

```javascript
const stmt = db.prepare("INSERT INTO t (a) VALUES (?)");
for (const item of items) {
  stmt.run(item);
}
```

**`prepare` 只做一次，`run` 做 N 次。** 省掉了 N-1 次 SQL 解析和编译。

**在我们的小数据上感觉不出，但这是好习惯，而且改起来只要挪一行。**

**更好的做法（批量插入）：**

```javascript
// 一次插 3 条
db.prepare("INSERT INTO t (a) VALUES (?), (?), (?)").run(1, 2, 3);
```

**或者包在事务里（下节课讲）：**

```javascript
db.exec("BEGIN");
for (const item of items) stmt.run(item);
db.exec("COMMIT");
```

**事务包起来后，SQLite 不会每条都刷盘，速度能快几十倍。**

**这个下节课细讲，现在知道"循环里插入要包事务"就够了。**

### 4.6 一个判断规则

```text
如果你在 for / map / forEach 里写了 db.prepare(...).get() 或 .all()，
停下来想一下：能不能用 JOIN 一次查出来？
```

**90% 的情况可以。**

**剩下 10% 是真需要，那就想办法批量。**

---

## 第 5 步：`JOIN` 为什么会变慢（15 分钟）

**这一步解释"为什么 JOIN 不总是好的"。**

### 5.1 笛卡尔积：最可怕的性能杀手

**如果你忘了写 `ON` 条件会怎样：**

```javascript
const rows = db.prepare(`
  SELECT COUNT(*) AS c FROM books, authors
`).all();
console.log("没有 ON 条件的行数：", rows[0].c);
```

**我的实测输出：**

```text
没有 ON 条件的行数： 20
```

**20 = 5（books）× 4（authors）。**

**这就是笛卡尔积：每一行都和其他表的所有行组合。**

**危险在这里：**

| books | authors | 结果行数 |
|---|---|---|
| 5 | 4 | 20 |
| 1,000 | 1,000 | **1,000,000** |
| 10,000 | 10,000 | **100,000,000** |

**两张万行的表忘记写 `ON`，你会得到一亿行。数据库会卡死。**

**这就是为什么"忘记 JOIN 条件"是生产事故。** 它不只是"结果不对"，它会让服务器内存爆掉。

**规矩：任何 `JOIN`，必须有 `ON`。**

**（除非你就是要笛卡尔积，那极少见。）**

### 5.2 多表 JOIN 的复杂度

**两个 `JOIN` 的查询：**

```sql
SELECT ...
FROM books b
JOIN book_tags bt ON bt.book_id = b.id
JOIN tags t ON t.id = bt.tag_id
```

**如果没有索引，最坏情况是：**

```text
books 的每一行 × book_tags 的每一行 × tags 的每一行
```

**5 × 7 × 4 = 140 次比较**（我们的数据）

**如果每个表 10000 行：**

```text
10000 × 10000 × 10000 = 1,000,000,000,000（一万亿次）
```

**所以多表 JOIN 必须有索引。** 这是下节课的内容。

**现在你只要知道：`JOIN` 越多表，越依赖索引。**

### 5.3 `JOIN` 的三种执行方式（了解即可）

**数据库执行 `JOIN` 有三种策略：**

| 方式 | 做法 | 什么时候用 |
|---|---|---|
| Nested Loop | 外层每行，扫一遍内层 | 内层有索引时快 |
| Hash Join | 先建哈希表，再匹配 | 无索引但内存够 |
| Merge Join | 两边都排好序再归并 | 两边都有序 |

**SQLite 主要用 Nested Loop。**

**为什么这个知识有用：** 因为"内层有没有索引"直接决定快慢。**下节课讲索引你就明白为什么这么关键。**

### 5.4 `JOIN` 写法的三个好习惯

**习惯一：小表驱动大表**

```sql
-- 假设 orders 有 10 万行，customers 有 1000 行
FROM orders o JOIN customers c ON c.id = o.customer_id   -- 大表在前
```

**在 Nested Loop 里，外层是 `FROM` 那张表。** 外层行数越少，总循环次数越少。

**但实际上 SQLite 会自动优化**（它会选"哪张表做外层"）。**所以写的时候不用太纠结，索引才是关键。**

**习惯二：`ON` 条件只放"关联条件"**

```sql
-- ✅ 好
FROM orders o JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'paid'

-- ⚠️ 能跑但危险
FROM orders o JOIN customers c ON c.id = o.customer_id AND o.status = 'paid'
```

**`INNER JOIN` 时两者等价。但换成 `LEFT JOIN` 就不一样了：**

```sql
-- 把条件放 ON：左表全部保留，只是右表匹配不上时填 null
FROM orders o LEFT JOIN customers c ON c.id = o.customer_id AND c.vip = 1

-- 把条件放 WHERE：等于把 LEFT JOIN 变成了 INNER JOIN
FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE c.vip = 1
```

**第二个写法的结果：`c.vip = 1` 会过滤掉所有 `c.*` 为 null 的行！**

**这就是"`LEFT JOIN` 的 `WHERE` 陷阱"。** 很多人以为自己写的是左连接，实际退化成了内连接。

**为什么：** `WHERE c.vip = 1` 对 null 行求值是 `NULL`（不是 true），所以那些行被过滤掉了。

**这个坑非常隐蔽。** 记住：

```text
LEFT JOIN 后，WHERE 里对右表的任何条件，都会把它变回 INNER JOIN。
（除非条件是 IS NULL）
```

**习惯三：只 SELECT 需要的列**

```sql
SELECT o.id, c.name FROM ...   -- ✅
SELECT * FROM ...              -- ❌ 两个表的列全出来，字段名还重复
```

**`SELECT *` 在 JOIN 里问题更大：**

- 两个表都有 `id`，结果里 `id` 只有一个（后者覆盖前者）；
- 你不知道哪个字段来自哪张表；
- 传输量大。

---

## 第 6 步：把 chat-app 从 JSON 迁到数据库（25 分钟）

**这是本阶段的大作业。**

### 6.1 回顾：第 21 节课的 chat-app

**它的数据在 `data/chat.json` 里，长这样：**

```json
{
  "nextSessionId": 2,
  "sessions": [
    {
      "id": 1,
      "title": "第一个会话",
      "createdAt": "2026-11-16T10:00:00.000Z",
      "messages": [
        { "role": "user", "content": "你好", "createdAt": "2026-11-16T10:00:05.000Z" },
        { "role": "assistant", "content": "你好！", "createdAt": "2026-11-16T10:00:07.000Z" }
      ]
    }
  ]
}
```

**问题：**

| 问题 | 后果 |
|---|---|
| 并发写丢数据 | 两个人同时发消息，丢一半（第 19 节课实测 23 条只剩 2 条） |
| 查消息要读全文件 | 会话多了会很慢 |
| 没有约束 | `role` 可以写任何值 |

### 6.2 表设计

**操作：** 新建文件夹 `chat-migrate`（在 `join-lab` 同级），新建 `schema.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("chat.db");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// 查消息最常用的条件是"按会话查"，加个索引（下节课细讲）
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id)
`);

console.log("表建好了");
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name));

db.close();
```

**运行：**

```text
node schema.mjs
```

**应该看到：**

```text
表建好了
[ 'sessions', 'messages' ]
```

### 6.3 迁移脚本

**关键难点：JSON 里的 id 和数据库自增的 id 可能不一样，怎么对应？**

**答案：用 `lastInsertRowid`（第 29 节课学的）。**

**操作：** 新建 `migrate.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const db = new DatabaseSync("chat.db");
db.exec("PRAGMA foreign_keys = ON");

// 读旧数据（如果文件不存在就建空的）
let old;
try {
  old = JSON.parse(fs.readFileSync("chat.json", "utf8"));
} catch (error) {
  if (error.code === "ENOENT") {
    console.log("没有 chat.json，跳过迁移");
    db.close();
    process.exit(0);
  }
  throw error;
}

// 包在事务里：任何一步失败就全部回滚
db.exec("BEGIN");

try {
  const insSession = db.prepare(
    "INSERT INTO sessions (title, created_at) VALUES (?, ?)"
  );
  const insMessage = db.prepare(
    "INSERT INTO messages (session_id, role, content, created_at) VALUES (?,?,?,?)"
  );

  let sessionCount = 0;
  let messageCount = 0;

  for (const s of old.sessions || []) {
    const r = insSession.run(
      s.title || "（无标题）",
      s.createdAt || new Date().toISOString()
    );
    const newSessionId = Number(r.lastInsertRowid);
    sessionCount++;

    for (const m of s.messages || []) {
      // 关键：这里必须做校验，脏数据不能进库
      const role = m.role === "assistant" ? "assistant" : "user";
      insMessage.run(
        newSessionId,
        role,
        String(m.content ?? ""),
        m.createdAt || new Date().toISOString()
      );
      messageCount++;
    }
  }

  db.exec("COMMIT");
  console.log(`迁移完成：${sessionCount} 个会话，${messageCount} 条消息`);
} catch (error) {
  db.exec("ROLLBACK");
  console.error("迁移失败，已回滚：", error.message);
  process.exit(1);
}

// 验证
const s = db.prepare("SELECT COUNT(*) AS c FROM sessions").get().c;
const m = db.prepare("SELECT COUNT(*) AS c FROM messages").get().c;
console.log(`数据库里：${s} 个会话，${m} 条消息`);

db.close();
```

### 6.4 造一个旧的 chat.json 来测

**操作：** 在 `chat-migrate` 里新建 `chat.json`：

```json
{
  "nextSessionId": 3,
  "sessions": [
    {
      "id": 1,
      "title": "关于 Node 的问题",
      "createdAt": "2026-11-10T10:00:00.000Z",
      "messages": [
        { "role": "user", "content": "怎么读文件", "createdAt": "2026-11-10T10:00:05.000Z" },
        { "role": "assistant", "content": "用 fs.readFile", "createdAt": "2026-11-10T10:00:07.000Z" }
      ]
    },
    {
      "id": 2,
      "title": "空会话",
      "createdAt": "2026-11-11T09:00:00.000Z",
      "messages": []
    },
    {
      "id": 3,
      "title": "脏数据测试",
      "createdAt": "2026-11-12T08:00:00.000Z",
      "messages": [
        { "role": "system", "content": "这个 role 是脏的", "createdAt": "2026-11-12T08:00:01.000Z" },
        { "role": "user", "content": "正常消息", "createdAt": "2026-11-12T08:00:02.000Z" }
      ]
    }
  ]
}
```

**运行迁移：**

```text
node migrate.mjs
```

**应该看到：**

```text
迁移完成：3 个会话，4 条消息
数据库里：3 个会话，4 条消息
```

**注意第三那个 `"role": "system"` 被转成了 `"user"`。**

**因为我们的表有 `CHECK (role IN ('user','assistant'))`，脏数据进不去。** 迁移代码里做了兜底转换。

**这就是"迁移时必须清洗数据"的例子。**

### 6.5 迁移后的查询：会话列表

**操作：** 新建 `list-sessions.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("chat.db");

const sessions = db.prepare(`
  SELECT
    s.id,
    s.title,
    s.created_at,
    COUNT(m.id) AS message_count,
    MAX(m.created_at) AS last_message_at
  FROM sessions s
  LEFT JOIN messages m ON m.session_id = s.id
  GROUP BY s.id
  ORDER BY s.created_at DESC
`).all();

console.log(sessions.map(r => ({ ...r })));
db.close();
```

**我的预期输出（你的会话 id 可能不同）：**

```text
[
  { id: 3, title: '脏数据测试', created_at: '...', message_count: 2, last_message_at: '...' },
  { id: 2, title: '空会话', created_at: '...', message_count: 0, last_message_at: null },
  { id: 1, title: '关于 Node 的问题', created_at: '...', message_count: 2, last_message_at: '...' }
]
```

**三个关键点：**

**第一：用 `LEFT JOIN` 才能让"空会话"出现。**

如果用 `INNER JOIN`，"空会话"就消失了 —— **用户会投诉"我新建的会话不见了"。**

**第二：`COUNT(m.id)` 而不是 `COUNT(*)`。**

空会话用 `COUNT(*)` 会得到 1（因为 `LEFT JOIN` 补了一行 null）。

**第三：`MAX(m.created_at)` 得到"最后一条消息的时间"。**

空会话返回 `null`。**前端要处理这个 `null`**（显示"还没有消息"）。

### 6.6 迁移后的查询：某会话的所有消息

```javascript
function getMessages(sessionId) {
  return db.prepare(`
    SELECT id, role, content, created_at
    FROM messages
    WHERE session_id = ?
    ORDER BY id ASC
  `).all(sessionId).map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}

console.log("会话 1 的消息：", getMessages(1));
```

**注意 `ORDER BY id ASC` 不是 `ORDER BY created_at`。**

**为什么：** 同一毫秒插入的两条消息，`created_at` 相同，**顺序不确定**。而 `id` 是自增的，**插入顺序 = id 顺序**。

**这条是最容易出 bug 的地方。** 第 30 节课也强调过。

### 6.7 迁移检查清单

**迁移完成后必须验证：**

- [ ] 会话数量对得上
- [ ] 每条会话的消息数量对得上
- [ ] 空会话也在
- [ ] 消息顺序正确（`ORDER BY id`）
- [ ] 脏数据被清洗（`role` 只有 `user` / `assistant`）
- [ ] 外键生效（消息的 `session_id` 都存在）
- [ ] 旧 JSON 文件**先别删**，留着对比

**最后一条很重要：**

```text
迁移完不要立刻删旧数据。先并行跑几天，确认新数据对，再删。
```

**这是所有数据迁移的铁律。**

---

## 第 7 步：故意撞五个坑（15 分钟）

### 坑 1：忘了 `ON` 条件 → 笛卡尔积

```javascript
const bad = db.prepare("SELECT COUNT(*) AS c FROM books, authors").get().c;
const good = db.prepare("SELECT COUNT(*) AS c FROM books b JOIN authors a ON a.id = b.author_id").get().c;
console.log("忘了 ON：", bad);   // 20
console.log("有 ON  ：", good);  // 5
```

**教训：`JOIN` 必须有 `ON`。**

### 坑 2：`INNER JOIN` 丢了没匹配的行

```javascript
const inner = db.prepare("SELECT a.name FROM authors a INNER JOIN books b ON b.author_id=a.id").all().length;
const left = db.prepare("SELECT a.name FROM authors a LEFT JOIN books b ON b.author_id=a.id").all().length;
console.log("INNER：", inner, "行");   // 5
console.log("LEFT ：", left, "行");    // 6
```

**差 1 行** —— 那个没写过书的作者。

**教训：要保留主表所有行就用 `LEFT JOIN`。**

### 坑 3：`COUNT(*)` vs `COUNT(列)`

```javascript
const a = db.prepare(`
  SELECT t.name, COUNT(*) AS c FROM tags t LEFT JOIN book_tags bt ON bt.tag_id=t.id GROUP BY t.id
`).all();
const b = db.prepare(`
  SELECT t.name, COUNT(bt.book_id) AS c FROM tags t LEFT JOIN book_tags bt ON bt.tag_id=t.id GROUP BY t.id
`).all();
console.log("COUNT(*)   :", a.map(r => `${r.name}=${r.c}`));
console.log("COUNT(列)  :", b.map(r => `${r.name}=${r.c}`));
```

**如果某个标签没书，`COUNT(*)` 会给 1，`COUNT(列)` 给 0。**

**教训：`LEFT JOIN` + 计数，必须用 `COUNT(右表主键)`。**

### 坑 4：`LEFT JOIN` 后在 `WHERE` 里筛右表

```javascript
const broken = db.prepare(`
  SELECT a.name, b.title FROM authors a
  LEFT JOIN books b ON b.author_id = a.id
  WHERE b.price_cents > 0
`).all();

const correct = db.prepare(`
  SELECT a.name, b.title FROM authors a
  LEFT JOIN books b ON b.author_id = a.id AND b.price_cents > 0
`).all();

console.log("WHERE 里筛：", broken.length, "行");
console.log("ON 里筛  ：", correct.length, "行");
```

**第一个会丢掉所有 `b.*` 为 null 的行** —— **左连接退化成了内连接。**

**教训：`LEFT JOIN` 后不能在对右表字段用 `WHERE`（除 `IS NULL`）。**

### 坑 5：`GROUP_CONCAT` 返回 `null`

```javascript
const rows = db.prepare(`
  SELECT b.title, GROUP_CONCAT(t.name, '、') AS tags
  FROM books b
  LEFT JOIN book_tags bt ON bt.book_id = b.id
  LEFT JOIN tags t ON t.id = bt.tag_id
  GROUP BY b.id
`).all();

const noTags = rows.filter(r => r.tags === null);
console.log("tags 是 null 的书：", noTags.map(r => r.title));
```

**会输出 `['兄弟']`。**

**教训：`GROUP_CONCAT` 没数据时返回 `null`，不是 `''`。前端要处理。**

---

## 第 8 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第05节课\02-笔记\NOTES.md
```

**重点填：**

1. `INNER` / `LEFT` 的区别，附你的实测行数；
2. 多对多的三步查询；
3. N+1 问题的定义和判断方法；
4. `LEFT JOIN` 的 `WHERE` 陷阱；
5. `COUNT(*)` 和 `COUNT(列)` 在 `LEFT JOIN` 下的差别；
6. 迁移脚本的关键步骤。

---

## 第 9 步：课后练习

### 练习 1：五个 JOIN 查询

**用 `join.db`，写出并验证：**

1. 每个客户的订单数和总金额（包括没下单的客户，显示 0）；
2. 每本书的标签（用 `GROUP_CONCAT`，没标签的显示空字符串）；
3. 卖得最好的书（按总销量）Top 3，要显示书名和作者名；
4. 从没被买过的书；
5. 每个作者的书的平均价格（没书的作者不显示）。

**第 1 题的关键：** 客户可能没订单，要用 `LEFT JOIN`，且计数要用 `COUNT(o.id)`。

### 练习 2：把 N+1 改成 JOIN

**下面这段代码有 N+1 问题，改成一个查询：**

```javascript
const books = db.prepare("SELECT id, author_id, price_cents FROM books").all();
const result = books.map((b) => {
  const author = db.prepare("SELECT name FROM authors WHERE id = ?").get(b.author_id);
  return { title: b.title, author: author.name, price: b.price_cents / 100 };
});
```

**要求：**

- 只能有一次查询；
- 结果结构不变（`title`、`author`、`price`）。

### 练习 3：完成 chat-app 迁移

**这是本阶段的大作业。**

**步骤：**

1. 找到你第 21 节课的 `chat-app`（在 `第07节课/03-练习代码/` 下）；
2. 把它的 `data/chat.json` 复制到 `chat-migrate/`；
3. 跑 `schema.mjs` 建表；
4. 跑 `migrate.mjs` 迁移；
5. 用 `list-sessions.mjs` 验证；
6. 写一个 `verify.mjs`，逐条对比 JSON 和数据库的记录数、内容。

**要求：`verify.mjs` 必须能自动报出"哪里不一致"。**

**这个练习做完，你就真的会把 JSON 迁到数据库了。** 这是接项目时的常见需求。

### 练习 4：找出这五个查询的问题

```sql
-- A
SELECT * FROM books, authors;

-- B
SELECT a.name, b.title FROM authors a
INNER JOIN books b ON b.author_id = a.id;

-- C
SELECT t.name, COUNT(*) AS c FROM tags t
LEFT JOIN book_tags bt ON bt.tag_id = t.id
GROUP BY t.id;

-- D
SELECT a.name, b.title FROM authors a
LEFT JOIN books b ON b.author_id = a.id
WHERE b.price_cents > 3000;

-- E
SELECT b.title, GROUP_CONCAT(t.name) AS tags FROM books b
LEFT JOIN book_tags bt ON bt.book_id = b.id
LEFT JOIN tags t ON t.id = bt.tag_id
```

**逐个说出问题。**

### 练习 5：用自己的话讲

```text
INNER JOIN 和 LEFT JOIN 的区别，用一句话说清。
为什么"循环里查数据库"是错的？
为什么"忘记 JOIN 条件"会让服务器崩？
为什么 LEFT JOIN 后在 WHERE 里筛右表会出问题？
```

---

## 第 10 步：最终验收

### A. JOIN 基础

- [ ] 我能写出 `INNER JOIN` 并解释它丢什么行
- [ ] 我能写出 `LEFT JOIN` 并解释它补什么
- [ ] 我知道"左表"是 `FROM` 后面那个
- [ ] 我知道 JOIN 后所有列都要加表别名
- [ ] 我知道 `ambiguous column name` 怎么修

### B. 多对多

- [ ] 我能画出多对多的三张表结构
- [ ] 我能写"某本书的所有标签"
- [ ] 我能写"每个标签下多少本书"
- [ ] 我知道 `GROUP_CONCAT` 怎么用
- [ ] 我知道 `GROUP_CONCAT` 没数据返回 `null`

### C. 性能

- [ ] 我能解释什么是 N+1
- [ ] 我能识别代码里的 N+1
- [ ] 我知道为什么 N+1 在小数据上测不出来
- [ ] 我知道"笛卡尔积"是什么，为什么危险
- [ ] 我知道 `prepare` 要提到循环外

### D. 陷阱

- [ ] 我知道 `LEFT JOIN` 后在 `WHERE` 筛右表会退化成 `INNER`
- [ ] 我知道 `LEFT JOIN` + 计数要用 `COUNT(右表主键)`
- [ ] 我知道反连接（`WHERE 右表.id IS NULL`）的用法

### E. 迁移

- [ ] 我的 `chat.db` 有 `sessions` 和 `messages` 两张表
- [ ] 我迁移了至少 3 个会话
- [ ] 空会话也在
- [ ] 脏数据被清洗
- [ ] 消息按 `id` 排序
- [ ] 我写了 `verify.mjs` 做对比
- [ ] 旧 JSON 文件还留着

### F. 笔记

- [ ] 笔记填完，五个坑都有实测数字
- [ ] 我做了练习 1 的五个查询
- [ ] 我做了练习 3 的迁移

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `ambiguous column name: id` | 两个表都有 `id` | 加表别名前缀 |
| 结果行数特别多 | 忘了 `ON`，笛卡尔积 | 补 `ON` 条件 |
| 有些行莫名消失 | 用了 `INNER JOIN` 但主表有没匹配的 | 改 `LEFT JOIN` |
| `LEFT JOIN` 后行数变少了 | `WHERE` 里筛了右表字段 | 条件移到 `ON` 里 |
| `COUNT(*)` 结果都是 1 | `LEFT JOIN` 补的 null 行被数了 | 改 `COUNT(右表主键)` |
| `GROUP_CONCAT` 返回 `null` | 该组没有任何数据 | 前端用 `?? ""` 兜底 |
| `GROUP_CONCAT` 顺序乱 | SQLite 不支持内部排序 | 子查询排好再聚合，或 JS 里排 |
| 查询很慢 | N+1，或没索引 | 改 JOIN，加索引（下节课） |
| 循环里插入很慢 | 每条都刷盘 | 包在事务里 |
| 迁移后 id 对不上 | 用了旧 id | 用 `lastInsertRowid` |
| 迁移后脏数据进库 | 没校验 | 迁移时转换/过滤，或用 `CHECK` 拦住 |
| 会话列表里看不到新会话 | 用了 `INNER JOIN` | 改 `LEFT JOIN` |
| 消息顺序错乱 | 按 `created_at` 排 | 按 `id` 排 |

---

## 附：这一节课你必须记住的七句话

```text
一、INNER JOIN 丢行，LEFT JOIN 补 null。

二、"左表"是 FROM 后面那个，不是 SELECT 里先写的。

三、多对多要过中间表，两张表过桥两次。

四、循环里查数据库 = N+1。改成 JOIN。

五、JOIN 忘了 ON = 笛卡尔积，能让服务器崩。

六、LEFT JOIN 后在 WHERE 筛右表，会退化成 INNER JOIN。

七、LEFT JOIN + 计数，用 COUNT(右表主键) 不用 COUNT(*)。
```

---

## 附：下一步

**第 34 节课：更新与删除安全操作。**

这节课只讲"查"。下节课讲"改"：

- `UPDATE` 的正确写法（**`WHERE` 忘写的后果**）；
- `DELETE` 的正确写法；
- **软删除 vs 硬删除**（为什么大公司都不真删数据）；
- 事务的完整用法（`BEGIN` / `COMMIT` / `ROLLBACK`）；
- 索引：什么时候该加、加了为什么快、加多了为什么慢。

**这一节是本阶段最"危险"的一节。** 因为 `UPDATE` 和 `DELETE` 忘写 `WHERE`，会一次性毁掉整张表。

**在你进入下节课之前：**

- [ ] 你的 `join.db` 有 5 本书、4 个标签、5 条订单
- [ ] 你能写出 `INNER` 和 `LEFT` 的查询，并说出结果行数差在哪
- [ ] 你能查出"某本书的所有标签"
- [ ] 你把 `chat-app` 迁到了 `chat.db`
- [ ] 你跑过那五个坑
