# 第 30 节课：创建表和字段

## 本节课要解决的问题

上节课你建了一张表，但它是我给好的。**这节课要解决的是：给你一个真实需求，你怎么决定"要几张表、每张表有哪些列、每列什么类型"。**

这是数据库设计能力，比"会写 SQL"重要得多。**表设计错了，后面所有代码都在给这个错误打补丁。**

**这节课你会学到：**

- 从一段业务描述推出表结构的完整方法（四步）；
- 字段类型怎么选（为什么金额用整数、时间用哪种存法）；
- 什么时候该拆表、什么时候不该拆；
- **SQLite 的一个硬限制：不能直接改列类型**（我实测了，附替代方案）；
- `ALTER TABLE` 能做什么、不能做什么；
- 把 `chat-app` 从 JSON 迁到数据库的完整表设计。

**这节课不学：** 增删改查语法（下节课）、JOIN（第 33 节）、索引优化（第 34 节）、复杂的范式理论（知道"同一信息只存一处"就够）。

**需要多久：** 90 分钟。

---

## 第 0 步：先看一个真实需求（10 分钟）

**为什么从需求开始，不从语法开始：**

因为**表结构是从需求推出来的，不是背出来的。** 你背了 `CREATE TABLE` 的语法，也不知道该建几列。

### 0.1 需求原文

**这是我们这周要做的项目：一个小书店的库存和订单系统。**

**客户说的话（真实需求往往就这么粗糙）：**

```text
我想管我的书，还要能记订单。

书要有：书名、作者、出版社、ISBN 号、进价、卖价、还有多少本。

一个作者可能写好几本书，一个出版社也出好几本书，这些我都要能查。

订单要记：谁买的、什么时候买的、买了哪几本、每本几本、一共多少钱。

客户我要记名字和电话，同一个人可以下很多次单。

还有，库存不能是负数，ISBN 不能重复。
```

### 0.2 先别急着写 SQL

**小白拿到需求的第一反应是"赶紧建表"。这是错的。**

**先做一件事：把名词圈出来。**

**操作：** 拿纸，把上面那段话里"像个东西"的词圈出来。

**你应该圈出这些：**

```text
书、作者、出版社、订单、客户
```

**再圈出"描述"的词：**

```text
书名、作者名、出版社名、ISBN、进价、卖价、库存
谁买的、什么时候买的、买了哪几本、每本几本、一共多少钱
客户名字、客户电话
```

### 0.3 名词 → 表，描述 → 列

**这是最核心的一步，规律非常简单：**

| 你圈出的 | 变成什么 |
|---|---|
| 一个"东西"（书、客户、订单） | **一张表** |
| 这个"东西"的一个属性（书名、电话） | **一个列** |

**但有个陷阱：不是所有名词都该建表。**

**看"作者"这个词。** 它是"书的一个属性"还是"一个独立的东西"？

**需求里说了：**

> 一个作者可能写好几本书

**这句话决定了作者必须是独立的表。** 因为：

- 如果作者只是书的一个文本列，同一作者的书里会重复存他的名字；
- 作者改名了，要改好几行；
- 你没法单独查"这个作者写了哪些书"。

**这就是上节课那条原则：同一条信息只存一个地方。**

### 0.4 先问三个问题

**在写任何 SQL 之前，先回答这三个：**

**问题一：哪些是一对多？**

| 关系 | 例子 | 怎么体现 |
|---|---|---|
| 一个作者 → 多本书 | 一对多 | 书的表里存 `author_id` |
| 一个出版社 → 多本书 | 一对多 | 书的表里存 `publisher_id` |
| 一个客户 → 多个订单 | 一对多 | 订单表里存 `customer_id` |
| 一个订单 → 多个书 | **多对多** | 需要一张"中间表" |

**"一对多"的规律：多的那一方存"一"的 id。**

**问题二：有没有多对多？**

**一个订单里有好几本书，一本书也会出现在很多订单里。这是多对多。**

**多对多不能靠加字段解决，必须建一张中间表。**

```text
order_items（订单明细表）
  id | order_id | book_id | qty | unit_price_cents
```

**这张表里，一行 = "某个订单里的某一本书"。**

**问题三：哪些字段是"算出来的"？**

**需求里说"一共多少钱"。**

**这个要存吗？**

**答案：要存，但要想清楚为什么。**

**因为：** 单价会变。今天的订单金额是按今天的价算的。如果以后书涨价了，你去用"数量 × 现价"重算，历史订单金额就变了——**账目会错。**

**所以订单金额和单价都要"当场记下来"，不能靠算。**

**这就是电商系统里"下单快照"的概念：下单那一刻的价格、名字，全部复制一份存进订单。**

**这个认知很重要。** 新手最容易犯的错就是"金额靠算"，结果历史订单全乱。

---

## 第 1 步：把需求翻译成表（20 分钟）

**现在开始画表。先在纸上画，不要写 SQL。**

### 1.1 六张表

**根据上面的分析，这个系统要六张表：**

```text
authors（作者）
publishers（出版社）
books（书）
customers（客户）
orders（订单）
order_items（订单明细）
```

**为什么是六张而不是五张：** 因为"订单和书"是多对多，必须有 `order_items` 这张中间表。

**每张表的列：**

```text
authors
  id            主键
  name          作者名，必填
  bio           简介，可不填

publishers
  id            主键
  name          出版社名，必填
  phone         电话，可不填

books
  id            主键
  title         书名，必填
  author_id     指向 authors.id，必填
  publisher_id  指向 publishers.id，必填
  isbn          ISBN 号，必填且唯一
  cost_cents    进价（分），必填，不能负
  price_cents   卖价（分），必填，不能负
  stock         库存，默认 0，不能负

customers
  id            主键
  name          客户名，必填
  phone         电话，必填且唯一

orders
  id            主键
  customer_id   指向 customers.id，必填
  created_at    下单时间，必填
  total_cents   订单总额（分），必填

order_items
  id                主键
  order_id          指向 orders.id，必填
  book_id           指向 books.id，必填
  qty               数量，必填，必须大于 0
  unit_price_cents  下单时的单价（分），必填
```

### 1.2 三个必须解释的设计决定

**决定一：为什么金额都带 `_cents` 后缀**

**因为存的是"分"，不是"元"。**

| 存法 | 85 元 5 角怎么存 | 问题 |
|---|---|---|
| 存元（小数） | `85.5` | `0.1 + 0.2 = 0.30000000000000004` |
| **存分（整数）** | `8550` | 没有精度问题 |

**这是我们第 1 节课就定下的规矩。** 现在它体现在表结构里了：**字段名带 `_cents` 后缀，你一看就知道单位是分，不会算错。**

**决定二：为什么 `unit_price_cents` 存在 `order_items` 而不是从 `books` 查**

**因为书的价格会变。**

```text
1 月 1 日：小明买《XXX》，价格 50 元 → 订单记 5000 分
3 月 1 日：这本书涨价到 60 元
```

**现在你查小明 1 月的订单，如果去 `books` 表读现价，会显示 60 元。账目就错了。**

**存 `unit_price_cents` 就是"把当时的价格钉住"。**

**这个字段是真实电商系统的标配。**

**决定三：为什么 `created_at` 存时间而不是"多久以前"**

**因为"多久以前"是会变的。**

```text
存"3 天前" → 明天再看，还是"3 天前"？错
存具体时间 → 任何时候都能算出"几天前"
```

**存"事实"，不存"结论"。** 结论可以随时算，事实只能存一次。

**这条原则适用于所有字段：** 存"原始数据"，不存"加工结果"（除非像订单金额那样有"钉住历史"的理由）。

### 1.3 命名：三种 case 的用途

**你会在一条 SQL 里看到三种写法：**

```sql
CREATE TABLE order_items (        -- 表名用复数、snake_case
  id INTEGER PRIMARY KEY,         -- 列名用 snake_case
  order_id INTEGER NOT NULL       -- 外键用 表名单数_id
);
```

**规律：**

| 东西 | 规则 | 例子 |
|---|---|---|
| 表名 | **复数** + snake_case | `books`、`order_items` |
| 列名 | snake_case | `price_cents`、`created_at` |
| 外键 | **单数表名** + `_id` | `author_id`、`order_id` |

**为什么表名用复数：** 因为一张表里装的是"很多个"，`books` 读起来是"书们"。

**为什么外键用单数：** 因为 `author_id` 是"一个作者的 id"，不是"很多作者"。

**这个规范不是强制，但大多数团队这样写。** 你跟着写，别人一看就懂。

---

## 第 2 步：建出六张表（25 分钟）

**现在开始写 SQL。**

### 2.1 建文件夹和文件

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第02节课\03-练习代码
   ```

2. 新建文件夹 `bookstore`。
3. 进去，地址栏输入 `cmd` 回车。
4. 新建文件 `schema.mjs`（用 `.mjs`，和第 29 节课一样）。

### 2.2 写建表脚本

**操作：自己敲**（这段比较长，分两次敲，先敲前三张，跑通了再敲后三张）：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("bookstore.db");

// 让外键约束生效（SQLite 默认是关的，这行必须有）
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bio TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS publishers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES authors(id),
    publisher_id INTEGER NOT NULL REFERENCES publishers(id),
    isbn TEXT NOT NULL UNIQUE,
    cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
  )
`);

console.log("前三张表建好了");

db.close();
```

**运行：**

```text
node schema.mjs
```

**应该看到：** `前三张表建好了`

**然后继续补上后三张（在 `console.log` 之前插入）：**

```javascript
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
    created_at TEXT NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    qty INTEGER NOT NULL CHECK (qty > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
  )
`);
```

**再运行一次。**

**应该看到：** `六张表建好了`（把 console.log 改一下）

### 2.3 验证表都建出来了

**操作：** 新建 `show-tables.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("bookstore.db");
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).all();

console.log("表清单：");
for (const t of tables) {
  console.log(" -", t.name);
}
db.close();
```

**运行：**

```text
node show-tables.mjs
```

**应该看到：**

```text
表清单：
 - authors
 - publishers
 - books
 - customers
 - orders
 - order_items
```

**`AND name NOT LIKE 'sqlite_%'` 是什么：** 过滤掉 SQLite 自己内部的表（比如 `sqlite_sequence`，它是 `AUTOINCREMENT` 用的）。

**不加这个过滤，你会看到多出来一两个 `sqlite_xxx` 的表，会以为搞错了。**

### 2.4 三个新东西逐个讲

**新东西一：`PRAGMA foreign_keys = ON`**

**这一行必须写，而且每个连接都要写。**

**为什么：** SQLite 默认**不检查外键**（为了兼容老版本）。你不开这个开关，往 `books.author_id` 填一个不存在的作者 id，它也不管。

**验证一下：**

**操作：** 新文件 `test-fk.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("bookstore.db");

// 故意不开 PRAGMA
try {
  db.prepare("INSERT INTO books (title, author_id, publisher_id, isbn, cost_cents, price_cents) VALUES (?,?,?,?,?,?)")
    .run("测试书", 999, 999, "ISBN-TEST-1", 1000, 2000);
  console.log("没开 PRAGMA：插进去了（作者 999 根本不存在）");
} catch (e) {
  console.log("没开 PRAGMA 也拦住了：", e.message);
}

db.close();
```

**运行，你应该看到"插进去了"。**

**这就是问题：** 数据已经脏了，`author_id = 999` 指向一个不存在的作者。

**现在加上 PRAGMA 再试（换个 ISBN）：**

```javascript
db.exec("PRAGMA foreign_keys = ON");
try {
  db.prepare("INSERT INTO books (title, author_id, publisher_id, isbn, cost_cents, price_cents) VALUES (?,?,?,?,?,?)")
    .run("测试书2", 999, 999, "ISBN-TEST-2", 1000, 2000);
  console.log("插进去了");
} catch (e) {
  console.log("拦住了：", e.message);
}
```

**应该看到：**

```text
拦住了： FOREIGN KEY constraint failed
```

**所以：**

```text
PRAGMA foreign_keys = ON 必须写在每个数据库连接的开头。
忘了写，外键约束等于没写。
```

**这是一个非常容易漏的事。** 你以后接别人的项目，如果发现"删了父表数据子表还有一堆孤儿数据"，八成就是忘开这个。

**新东西二：`REFERENCES authors(id)`**

**这是外键的写法。**

```sql
author_id INTEGER NOT NULL REFERENCES authors(id)
```

| 部分 | 意思 |
|---|---|
| `author_id` | 列名 |
| `INTEGER` | 类型 |
| `NOT NULL` | 不能为空 |
| `REFERENCES authors(id)` | **这一列的值必须是 `authors` 表里存在的 `id`** |

**它保证：** 你不能给一本书指定一个不存在的作者。

**新东西三：`UNIQUE`**

```sql
isbn TEXT NOT NULL UNIQUE
```

**`UNIQUE` 保证这一列的值不重复。**

**用它拦"同一个 ISBN 录两次"这种错。**

**注意：`UNIQUE` 允许多个 `null`（在 SQLite 里）。** 因为 `null` 不等于任何值，包括另一个 `null`。

**如果你要"不能为空且不能重复"，就得同时写 `NOT NULL UNIQUE`。** 我们上面就是这么写的。

---

## 第 3 步：插数据验证约束（15 分钟）

**建了表不插数据，你不知道约束到底管不管用。**

### 3.1 插正常数据

**操作：** 新建 `seed.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("bookstore.db");
db.exec("PRAGMA foreign_keys = ON");

// 清空（方便反复运行）
db.exec("DELETE FROM order_items");
db.exec("DELETE FROM orders");
db.exec("DELETE FROM books");
db.exec("DELETE FROM authors");
db.exec("DELETE FROM publishers");
db.exec("DELETE FROM customers");

const insAuthor = db.prepare("INSERT INTO authors (name, bio) VALUES (?, ?)");
const a1 = insAuthor.run("鲁迅", "中国现代作家");
const a2 = insAuthor.run("余华", "当代作家");
console.log("作者 id：", a1.lastInsertRowid, a2.lastInsertRowid);

const insPub = db.prepare("INSERT INTO publishers (name, phone) VALUES (?, ?)");
const p1 = insPub.run("人民文学出版社", "010-00000001");
console.log("出版社 id：", p1.lastInsertRowid);

const insBook = db.prepare(
  "INSERT INTO books (title, author_id, publisher_id, isbn, cost_cents, price_cents, stock) VALUES (?,?,?,?,?,?,?)"
);
console.log(insBook.run("呐喊", 1, 1, "9787020000001", 1500, 2800, 20));
console.log(insBook.run("活着", 2, 1, "9787020000002", 2000, 3900, 10));
console.log(insBook.run("彷徨", 1, 1, "9787020000003", 1600, 3000, 5));

const insCust = db.prepare("INSERT INTO customers (name, phone) VALUES (?, ?)");
console.log(insCust.run("小明", "13800000001"));

console.log("数据插好了");
db.close();
```

**运行：**

```text
node seed.mjs
```

**应该看到：**

```text
作者 id： 1 2
出版社 id： 1
{ lastInsertRowid: 1, changes: 1 }
{ lastInsertRowid: 2, changes: 1 }
{ lastInsertRowid: 3, changes: 1 }
{ lastInsertRowid: 1, changes: 1 }
数据插好了
```

### 3.2 逐条撞约束

**操作：** 新建 `test-constraints.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("bookstore.db");
db.exec("PRAGMA foreign_keys = ON");

const insBook = db.prepare(
  "INSERT INTO books (title, author_id, publisher_id, isbn, cost_cents, price_cents, stock) VALUES (?,?,?,?,?,?,?)"
);

console.log("=== 1. ISBN 重复 ===");
try {
  insBook.run("重复书", 1, 1, "9787020000001", 1000, 2000, 1);
} catch (e) {
  console.log(e.message);
}

console.log("=== 2. 作者不存在 ===");
try {
  insBook.run("孤儿书", 999, 1, "ISBN-X1", 1000, 2000, 1);
} catch (e) {
  console.log(e.message);
}

console.log("=== 3. 库存负数 ===");
try {
  insBook.run("负库存书", 1, 1, "ISBN-X2", 1000, 2000, -5);
} catch (e) {
  console.log(e.message);
}

console.log("=== 4. 售价负数 ===");
try {
  insBook.run("负价书", 1, 1, "ISBN-X3", 1000, -100, 1);
} catch (e) {
  console.log(e.message);
}

console.log("=== 5. 书名为空 ===");
try {
  insBook.run(null, 1, 1, "ISBN-X4", 1000, 2000, 1);
} catch (e) {
  console.log(e.message);
}

console.log("=== 6. 删掉还有书引用的作者 ===");
try {
  db.prepare("DELETE FROM authors WHERE id = ?").run(1);
  console.log("删掉了（说明外键没生效！）");
} catch (e) {
  console.log(e.message);
}

db.close();
```

**运行，你应该看到（这是我实测的报错风格）：**

```text
=== 1. ISBN 重复 ===
UNIQUE constraint failed: books.isbn
=== 2. 作者不存在 ===
FOREIGN KEY constraint failed
=== 3. 库存负数 ===
CHECK constraint failed: stock >= 0
=== 4. 售价负数 ===
CHECK constraint failed: price_cents >= 0
=== 5. 书名为空 ===
NOT NULL constraint failed: books.title
=== 6. 删掉还有书引用的作者 ===
FOREIGN KEY constraint failed
```

**六条都拦住了。**

**第 6 条要特别解释：**

**你删作者 1（鲁迅），但他还有两本书。数据库拒绝了。**

**为什么：** 因为如果删了，那两本书的 `author_id = 1` 就指向一个不存在的作者了。**这叫"孤儿数据"。**

**这就是外键的"引用完整性"。**

**如果你想删怎么办：** 先把他的书删掉，或者把书改到别的作者名下。

**真实项目里还有另一种做法：级联删除。**

```sql
REFERENCES authors(id) ON DELETE CASCADE
```

**`ON DELETE CASCADE` 的意思是"父记录删了，子记录也自动删"。**

**但我们不建议你一开始就用它。** 因为"删一个作者，把他的书全删了"，这个操作太危险了。**很多线上事故就是级联删除干的。**

**我们的建议：默认不加 CASCADE，手动处理。** 等你真的确定要级联时再加。

---

## 第 4 步：SQLite 的一个硬限制（20 分钟）

**这一步是这节课最重要的"避坑"内容。我实测过，你必须知道。**

### 4.1 想改一列的类型，会失败

**场景：** 你发现 `books` 的 `isbn` 定义成 `TEXT` 了，但你想限制长度。于是你写：

```sql
ALTER TABLE books ALTER COLUMN isbn TYPE VARCHAR(20);
```

**操作：** 试试看。

**新建 `test-alter.mjs`：**

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("bookstore.db");

console.log("=== 尝试改列类型 ===");
try {
  db.exec("ALTER TABLE books ALTER COLUMN isbn TYPE VARCHAR(20)");
  console.log("改成功了");
} catch (e) {
  console.log(e.code, "|", e.message);
}

db.close();
```

**运行，你会看到：**

```text
=== 尝试改列类型 ===
ERR_SQLITE_ERROR | near "ALTER": syntax error
```

**`near "ALTER": syntax error` 是什么意思：**

**它的意思是"我不认识这个语法"，不是"你做错了"。**

**SQLite 根本不支持 `ALTER COLUMN` 这个语法。** 它只支持：

| 操作 | SQLite 支持吗 | 语法 |
|---|---|---|
| 加一列 | **支持** | `ALTER TABLE t ADD COLUMN ...` |
| 删一列 | **支持**（3.35+） | `ALTER TABLE t DROP COLUMN ...` |
| 改列名 | **支持** | `ALTER TABLE t RENAME COLUMN a TO b` |
| 改表名 | **支持** | `ALTER TABLE t RENAME TO t2` |
| **改列类型** | **不支持** | 无 |
| **改约束** | **不支持** | 无 |

**这个限制必须记住。** 因为很多教程说"用 ALTER 改类型"，那是 MySQL/PostgreSQL，**SQLite 不行。**

### 4.2 SQLite 的四种 ALTER，逐个验证

**操作：** 新建 `alter-allowed.mjs`，在一个新库上测：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("alter-test.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS demo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);
db.exec("DELETE FROM demo");
db.prepare("INSERT INTO demo (name) VALUES (?)").run("旧数据");

const show = () => console.log(db.prepare("SELECT * FROM demo").all().map(r => ({ ...r })));

console.log("=== 1. 加一列（带默认值） ===");
db.exec("ALTER TABLE demo ADD COLUMN stock INTEGER NOT NULL DEFAULT 0");
show();

console.log("=== 2. 加一列 NOT NULL 但没默认值 ===");
try {
  db.exec("ALTER TABLE demo ADD COLUMN note TEXT NOT NULL");
} catch (e) {
  console.log(e.message);
}

console.log("=== 3. 改列名 ===");
db.exec("ALTER TABLE demo RENAME COLUMN name TO title");
show();

console.log("=== 4. 删列 ===");
db.exec("ALTER TABLE demo DROP COLUMN stock");
show();

db.close();
```

**运行，我的实测输出：**

```text
=== 1. 加一列（带默认值） ===
[ { id: 1, name: '旧数据', stock: 0 } ]
=== 2. 加一列 NOT NULL 但没默认值 ===
Cannot add a NOT NULL column with default value NULL
=== 3. 改列名 ===
[ { id: 1, title: '旧数据', stock: 0 } ]
=== 4. 删列 ===
[ { id: 1, title: '旧数据' } ]
```

**第 2 条要特别注意：**

```text
Cannot add a NOT NULL column with default value NULL
```

**为什么失败：** 表里已经有一行数据了。你加一个 `NOT NULL` 列，那一行的新列该填什么？**没默认值就填不成。**

**正确做法：** 加 `NOT NULL` 列时必须给默认值。

```sql
ALTER TABLE demo ADD COLUMN note TEXT NOT NULL DEFAULT ''
```

**这是初学者很常撞的墙。** 在空表上不会失败，有数据就失败。**所以测试时要用有数据的表测。**

### 4.3 想改类型怎么办：重建表四步法

**SQLite 不支持直接改，所以要"建新表 → 搬数据 → 删旧表 → 改名"。**

**这就是官方的做法，叫"十二步"（官方文档里确实列了 12 步，但核心就 4 步）。**

**我实测的完整流程：**

**操作：** 新建 `rebuild-table.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("rebuild-test.db");

// 旧表：price 是 TEXT（错误的）
db.exec("CREATE TABLE IF NOT EXISTS p (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price TEXT)");
db.exec("DELETE FROM p");
db.prepare("INSERT INTO p (name, price) VALUES (?, ?)").run("矿泉水", "200");
console.log("原表：", db.prepare("SELECT * FROM p").all().map(r => ({ ...r })));

// 重建四步
db.exec("BEGIN");
db.exec(`
  CREATE TABLE p_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price_cents INTEGER NOT NULL DEFAULT 0
  )
`);
db.exec(`
  INSERT INTO p_new (id, name, price_cents)
  SELECT id, name, CAST(price AS INTEGER) FROM p
`);
db.exec("DROP TABLE p");
db.exec("ALTER TABLE p_new RENAME TO p");
db.exec("COMMIT");

console.log("重建后：", db.prepare("SELECT * FROM p").all().map(r => ({ ...r })));

db.close();
```

**运行，我的实测输出：**

```text
原表： [ { id: 1, name: '矿泉水', price: '200' } ]
重建后： [ { id: 1, name: '矿泉水', price_cents: 200 } ]
```

**注意 `price_cents` 是数字 200，不是字符串 `'200'`。** 改成功了。

**四步逐句解释：**

| 步骤 | SQL | 做什么 |
|---|---|---|
| 1 | `CREATE TABLE p_new (...)` | 建一张结构正确的新表 |
| 2 | `INSERT INTO p_new SELECT ... FROM p` | 把旧数据搬过去，顺便转换类型 |
| 3 | `DROP TABLE p` | 删掉旧表 |
| 4 | `ALTER TABLE p_new RENAME TO p` | 新表改名，顶替旧表 |

**为什么整个流程要包在 `BEGIN` / `COMMIT` 里：**

**因为中间任何一步失败，数据就毁了。**

比如你在第 3 步删了旧表，第 4 步改名失败——**数据全没了。**

**包在事务里，任何一步出错都会全部回滚。** 这是"要么全成功，要么什么都没发生"。

**`CAST(price AS INTEGER)` 是什么：** 把 `price` 从文本转成整数。

**如果旧数据里有 `"两百块"` 这种转不了的怎么办：** `CAST` 会转成 `0`。**所以你搬之前要先查一遍有没有脏数据。**

**查脏数据的写法：**

```sql
SELECT * FROM p WHERE CAST(price AS INTEGER) = 0 AND price != '0'
```

**这一步不能省。** 真实的表迁移事故，八成出在"脏数据没检查"。

### 4.4 什么时候该重建表

| 你想做的事 | 能不能直接改 | 怎么做 |
|---|---|---|
| 加一列 | 能 | `ADD COLUMN` |
| 删一列 | 能 | `DROP COLUMN` |
| 改列名 | 能 | `RENAME COLUMN` |
| 改类型 | **不能** | 重建表 |
| 加/删约束 | **不能** | 重建表 |
| 改主键 | **不能** | 重建表 |

**所以：表设计要一次想清楚。** 因为改起来很麻烦。

**这也是为什么我们花了一整节课在"设计"上，而不是直接开始写增删改查。**

---

## 第 5 步：字段类型怎么选（15 分钟）

**这一步给你一张对照表，以后遇到"这个字段用什么类型"直接查。**

### 5.1 SQLite 的五种基本类型

**先说明：SQLite 的类型系统和其他数据库不一样，它只有五种"存储类"：**

| 类型 | 存什么 | 例子 |
|---|---|---|
| `INTEGER` | 整数 | `1`、`-5`、`9999999999` |
| `REAL` | 浮点数 | `3.14`、`0.1` |
| `TEXT` | 文本 | `"你好"`、`"2026-11-16"` |
| `BLOB` | 二进制 | 图片、文件内容 |
| `NULL` | 空 | 没有值 |

**注意：没有 `VARCHAR`、没有 `DATETIME`、没有 `BOOLEAN`。**

**你写 `VARCHAR(20)` 也不会报错，SQLite 会把它当成 `TEXT` 处理。** 但长度限制不会生效。

**这不是 bug，是 SQLite 的设计。** 它用"类型亲和性"而不是严格类型。

### 5.2 常见字段怎么选

| 你要存 | 用什么类型 | 为什么 |
|---|---|---|
| 名字、标题、描述 | `TEXT` | 文本 |
| 金额 | **`INTEGER`（分）** | 避免浮点误差 |
| 数量、库存 | `INTEGER` | 整数 |
| 是否（是/否） | `INTEGER`（0/1） | SQLite 没有 BOOLEAN |
| 时间点 | **`TEXT`（ISO 8601）** | 见下面 |
| 日期（只到天） | `TEXT`（`2026-11-16`） | 能直接比较、排序 |
| 电话、身份证 | `TEXT` | **不要用 INTEGER**（会丢前导 0） |
| 状态（几个固定值） | `TEXT` + `CHECK` | 可读性好 |
| 图片 | `BLOB` 或存路径 | 通常存路径更好 |

### 5.3 时间字段：三种存法对比

**这是最容易选错的一个。我实测了三种：**

```javascript
const now = new Date();
// a: now.toISOString()        → "2026-11-16T07:42:08.289Z"
// b: now.getTime()            → 1794814928289
// c: now.toLocaleString("zh-CN") → "2026/11/16 15:42:08"
```

| 存法 | 值 | 优点 | 缺点 |
|---|---|---|---|
| **ISO 字符串** | `2026-11-16T07:42:08.289Z` | **人类可读、能直接排序、跨时区明确** | 占空间稍多 |
| 毫秒时间戳 | `1794814928289` | 占空间小、计算快 | 看不懂 |
| 本地格式 | `2026/11/16 15:42:08` | 好看 | **不能排序、有时区歧义** |

**推荐：用 ISO 字符串。**

**为什么不用本地格式：** 因为 `2026/11/16` 和 `2026-11-16` 排序结果不一样，而且没有时区信息，"15:42" 是哪个时区的 15:42？

**为什么不用时间戳：** 调试时你看不懂 `1794814928289` 是什么时候。**查问题时要多一步转换，很烦。**

**ISO 字符串的好处：**

```javascript
db.prepare("INSERT INTO orders (created_at) VALUES (?)").run(new Date().toISOString());
```

**存进去就是标准格式，按字符串排序 = 按时间排序。** 因为 ISO 格式的字典序恰好等于时间序。

**这个巧合很重要，直接用 `ORDER BY created_at` 就能按时间排。**

### 5.4 布尔值：用 0 和 1

**SQLite 没有 `BOOLEAN` 类型。**

**你怎么存"是否上架"？**

```sql
is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
```

**用 `INTEGER` 存 0/1，再加 `CHECK` 限制只能是这两个值。**

**为什么加 CHECK：** 不加的话有人会存 `2` 或 `"yes"`，你就得在代码里处理各种脏值。

**读出来怎么用：**

```javascript
const row = db.prepare("SELECT is_active FROM books WHERE id = ?").get(1);
if (row.is_active === 1) {
  console.log("上架中");
}
```

**注意：不要用 `if (row.is_active)` 判断，因为 `0` 是假但 `"0"` 是真。** 用 `=== 1` 明确比较。

### 5.5 状态字段：用 TEXT 还是数字

**假设"订单状态"有四种：待付款、已付款、已发货、已完成。**

**方案 A：用数字**

```sql
status INTEGER NOT NULL DEFAULT 0
-- 0=待付款 1=已付款 2=已发货 3=已完成
```

**方案 B：用文本 + CHECK**

```sql
status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'paid', 'shipped', 'done'))
```

**推荐方案 B。**

**为什么：**

| 对比 | 数字 | 文本 |
|---|---|---|
| 你直接查数据库看到 | `2` | `'shipped'` |
| 新同事看得懂吗 | 要查文档 | 直接懂 |
| 写错会不会被拦 | 会（如果加了 CHECK） | 会 |
| 性能 | 略好 | 略差（可忽略） |

**那点性能差异在真实项目里根本感觉不到。** 可读性的收益大得多。

**唯一的例外：** 状态值特别多（比如几百种）或者要跟别的系统对接时，才用数字 + 一张"字典表"。

---

## 第 6 步：把 chat-app 的表设计出来（15 分钟）

**这是这节课的实际产出。你第 33 节要用它。**

### 6.1 回顾你的 chat-app

**第 21 节课你做了一个带记忆的对话应用。当时数据存在 `data/chat.json` 里。**

**它的数据长这样：**

```json
{
  "nextSessionId": 3,
  "sessions": [
    {
      "id": 1,
      "title": "关于 Node 的问题",
      "createdAt": "2026-11-16T10:00:00.000Z",
      "messages": [
        { "role": "user", "content": "怎么读文件", "createdAt": "..." },
        { "role": "assistant", "content": "用 fs.readFile", "createdAt": "..." }
      ]
    }
  ]
}
```

**现在要把它拆成表。**

### 6.2 你的任务是先自己想

**看下面的问题，先在纸上写答案，再往下看我的方案。**

```text
① 需要几张表？
② 「会话」和「消息」是一对多还是多对多？
③ messages 里该有哪一列指向 sessions？
④ role 字段的值只有两个（user / assistant），该怎么存？
⑤ 消息的顺序怎么保证？
⑥ createdAt 用什么类型？
```

**写完了再往下。**

### 6.3 参考方案

```sql
-- 会话表
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 消息表
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

**六个问题的答案：**

**① 两张表。** `sessions` 和 `messages`。

**② 一对多。** 一个会话有多条消息，一条消息只属于一个会话。

**③ `session_id`。** 这是外键，指向 `sessions.id`。

**④ 用 `TEXT` + `CHECK`。** `CHECK (role IN ('user', 'assistant'))`。这样既能看懂，又能拦住写错的值。

**⑤ 用 `id` 排序。** 因为 `id` 是自增的，插入顺序就是 id 顺序。

**但这里有个坑：** 如果你要"按时间排序"，用 `created_at` 可能出问题——**因为同一毫秒插入的两条消息，时间戳一样，顺序就不确定了。**

**所以：排序永远用 `id`，不要用 `created_at`。**

**这是个很实用的经验。** 真实项目里，"按时间排序"经常因为时间精度不够导致顺序错乱。

**⑥ `TEXT`（ISO 8601）。** 前面讲过原因。

### 6.4 一个重要的设计决定：消息内容存 TEXT 还是 JSON

**你可能会想：消息内容会不会有格式？比如富文本、代码块、图片？**

**如果现在没有，就不要提前设计。**

**为什么：** 因为你现在猜不到未来会用什么格式。**先存 `TEXT`，等真的需要了再迁移。**

**这个原则叫 YAGNI（You Aren't Gonna Need It，"你不会需要它"）。**

**新手最容易犯的错就是"提前设计一切"** —— 结果设计了十个字段，八个从来没用过，还增加了维护成本。

**判断标准：**

| 情况 | 做法 |
|---|---|
| 现在就需要 | 现在就加 |
| 明确知道下周就要 | 可以加 |
| "以后可能会" | **不加** |
| "万一要" | **不加** |

**表结构是可以改的**（虽然麻烦）。**但猜错的设计会一直拖累你。**

### 6.5 顺便：原来的 JSON 数据怎么办

**你 `chat.json` 里已经有数据了。迁到数据库时要搬过去。**

**思路（第 33 节会做）：**

```text
读 chat.json
→ 遍历 sessions，每条插入 sessions 表
→ 拿到新 id
→ 遍历该 session 的 messages，插入 messages 表，session_id 用新 id
```

**注意"拿到新 id"这一步：** 因为原来 JSON 里的 id 和数据库自增的 id 不一定一样。**必须用插入返回的 `lastInsertRowid`。**

**这就是上节课学的 `lastInsertRowid` 的实际用途。**

---

## 第 7 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第02节课\02-笔记\NOTES.md
```

**重点填：**

1. **四步设计法**；
2. **六张表的结构**（自己画，不要抄）；
3. **SQLite 的 ALTER 支持表**；
4. **重建表四步法**；
5. **chat-app 的表设计**。

---

## 第 8 步：课后练习

### 练习 1：设计一个博客系统

**需求：**

```text
文章：标题、正文、发布时间、是否发布
作者：名字、邮箱（唯一）、简介
分类：名字、描述
标签：名字
一篇文章一个作者，但可以有多个标签；一个标签可以属于多篇文章。
一个分类下有多篇文章。
```

**写出：**

1. 需要哪几张表；
2. 每张表的列、类型、约束；
3. 哪些是外键；
4. 多对多关系怎么处理。

**然后真的建出来，插两条数据，验证约束有效。**

### 练习 2：给 books 表加一列

**要求：** 给 `books` 加一列 `shelf_location TEXT NOT NULL DEFAULT ''`（货架位置）。

**先想：** 这个操作 SQLite 支持吗？

**然后做：** 用 `ALTER TABLE` 加上，并验证已有数据的新列是空字符串。

### 练习 3：改一个错误的类型

**场景：** 你的 `books` 表里 `isbn` 是 `TEXT`，但你想给它加一个 `CHECK (length(isbn) = 13)`。

**问题：** SQLite 不支持给已有列加约束。

**任务：** 用重建表四步法，把 `books` 重建一遍，加上这个约束。

**要求：**

- 用事务包起来；
- 搬数据前先查有没有长度不是 13 的（有就说明你造的数据有问题）；
- 重建后验证约束生效（插一个长度 10 的 ISBN，看会不会被拦）。

### 练习 4：时间字段的实战

**任务：** 写一个脚本，往 `orders` 插 3 条订单，时间分别是：

- 现在；
- 3 天前；
- 30 天前。

**然后查询：**

1. 按时间倒序排（用 `ORDER BY created_at DESC`）；
2. 只查最近 7 天的。

**注意：** 第 2 个查询要怎么写？`created_at` 是 ISO 字符串，能直接和字符串比较吗？

**自己试出来答案。**

### 练习 5：用自己的话讲

```text
为什么金额要用整数分，不能用小数元？
为什么订单要单独存 unit_price_cents，不能从 books 表查？
为什么"是否上架"要用 INTEGER 存 0/1，而不是 TEXT 存 "yes"/"no"？
```

---

## 第 9 步：最终验收

### A. 设计能力

- [ ] 我能从一段需求里圈出"东西"和"属性"
- [ ] 我能判断一对多和多对多
- [ ] 我知道多对多必须用中间表
- [ ] 我知道"算出来的值"什么时候该存、什么时候不该存
- [ ] 我理解"下单快照"为什么要存单价

### B. 建表

- [ ] 我的 `bookstore.db` 里有六张表
- [ ] `books.author_id` 和 `publisher_id` 是外键
- [ ] `order_items` 是中间表，有两个外键
- [ ] 我写了 `PRAGMA foreign_keys = ON`
- [ ] 我验证过"不开 PRAGMA 外键就不生效"

### C. 约束

- [ ] ISBN 重复被拦
- [ ] 不存在的作者被拦
- [ ] 负库存被拦
- [ ] 负价格被拦
- [ ] 空书名被拦
- [ ] 删有书的作者被拦
- [ ] 六条报错原文我都抄下来了

### D. ALTER 的边界

- [ ] 我知道 SQLite 支持加列、删列、改列名、改表名
- [ ] 我知道 SQLite **不支持**改类型、改约束
- [ ] 我试过 `ALTER COLUMN` 并看到 `near "ALTER": syntax error`
- [ ] 我会用重建表四步法
- [ ] 我知道重建要包在事务里
- [ ] 我知道"加 NOT NULL 列必须有默认值"

### E. 类型选择

- [ ] 我知道金额用 INTEGER（分）
- [ ] 我知道时间用 TEXT（ISO 8601）
- [ ] 我知道布尔用 INTEGER 0/1
- [ ] 我知道电话要用 TEXT 不用 INTEGER
- [ ] 我知道状态用 TEXT + CHECK 更好

### F. 产出

- [ ] 我画出了 `chat-app` 的两张表
- [ ] 我知道排序要用 `id` 不用 `created_at`
- [ ] 我做了练习 1 的博客系统设计
- [ ] 我做了练习 3 的重建表
- [ ] 笔记填完

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 外键填了不存在的 id 也没报错 | 没开 `PRAGMA foreign_keys = ON` | 每个连接开头都加 |
| `near "ALTER": syntax error` | SQLite 不支持 `ALTER COLUMN` | 用重建表四步法 |
| `Cannot add a NOT NULL column with default value NULL` | 表里有数据，新列没默认值 | 加 `DEFAULT` |
| `UNIQUE constraint failed: books.isbn` | ISBN 重复 | 先查再插，或 `INSERT OR IGNORE` |
| `FOREIGN KEY constraint failed` | 引用了不存在的父记录，或删了还有子记录的父 | 先建父，或先删子 |
| `CHECK constraint failed: stock >= 0` | 违反你写的 CHECK | 检查数据本身 |
| 删父记录时想自动删子记录 | — | 加 `ON DELETE CASCADE`，但慎用 |
| `VARCHAR(20)` 存了超过 20 字符 | SQLite 不检查长度 | 用 `CHECK (length(x) <= 20)` |
| 改列名后查询报 `no such column` | 代码里还是旧列名 | 全局搜一下旧名字 |
| 重建表后 `AUTOINCREMENT` 跳号 | 正常，SQLite 记录过最大 id | 不影响使用，别管 |
| `sqlite_sequence` 是什么表 | `AUTOINCREMENT` 的内部表 | 不用管，查询时过滤掉 |
| 时间排序不对 | 用了本地格式存 | 改用 ISO 8601 |

---

## 附：这一节课你必须记住的五句话

```text
一、名词变表，属性变列。先圈名词，再写 SQL。

二、同一条信息只存一个地方。这决定了要不要拆表。

三、SQLite 不能改列类型和约束，只能重建表。

四、金额用整数分，时间用 ISO 字符串，布尔用 0/1。

五、表设计要一次想清楚，因为改起来很麻烦。
```

---

## 附：下一步

**第 31 节课：新增与查询。**

表设计好了，下节课开始真正操作数据：

- `INSERT` 的各种写法（单条、多条、`INSERT OR IGNORE`）；
- `SELECT` 的完整语法（`WHERE`、`ORDER BY`、`LIMIT`）；
- 怎么查"最近 7 天的订单"；
- 怎么分页（`LIMIT` + `OFFSET` 的正确用法，**这里有个性能陷阱**）；
- 怎么把查询结果转成 API 返回的 JSON。

**在你进入下节课之前，确认一件事：**

- [ ] 你的 `bookstore.db` 里六张表都在，并且都插了至少一条数据。

**如果 `books` 表里有三本书、`orders` 表里有订单，说明这节课做完了。**
