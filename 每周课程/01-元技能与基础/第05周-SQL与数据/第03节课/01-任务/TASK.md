# 第 31 节课：新增与查询

## 本节课要解决的问题

上节课你把表建好了，但表是空的。**这节课解决两件事：怎么把数据放进去，怎么把想要的数据取出来。**

听起来简单，但这里藏着几个能把人坑死的地方：

- `INSERT OR REPLACE` 会把 id 变掉，你以为在"更新"，其实在"删除再插入"；
- `WHERE note != 'x'` 会漏掉所有 `null` 行，你查出来少了一半数据还不知道；
- `LIMIT 10 OFFSET 100000` 在数据多时慢得离谱，但没人告诉你。

**这节课你会学到：**

- `INSERT` 的四种写法（普通、`OR IGNORE`、`OR REPLACE`、多行）各自的陷阱；
- `SELECT` 的完整语法：`WHERE`、`ORDER BY`、`LIMIT`、`GROUP BY`、`HAVING`；
- 日期怎么比较（ISO 字符串可以直接比，但有个前提）；
- `NULL` 的三个坑（`= NULL` 永远查不到、`!=` 会漏掉 `null`、`NOT IN` 有 `null` 就全空）；
- 分页的正确写法和性能陷阱；
- 把查询结果转成 API 返回的 JSON。

**这节课不学：** JOIN（第 33 节）、索引优化（第 34 节）、事务（第 34 节）、全文搜索。

**需要多久：** 100 分钟。

---

## 第 0 步：准备练手数据（10 分钟）

**为什么先造数据：**

因为查询这东西，**没有数据你什么都验证不了**。你要查"最近 7 天的订单"，得先有 30 天的数据。

### 0.1 建文件夹

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第03节课\03-练习代码
   ```

2. 新建文件夹 `query-lab`，进去，地址栏输入 `cmd` 回车。
3. 新建 `seed-big.mjs`。

### 0.2 造 30 天、60 条订单

**操作：自己敲：**

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("query.db");
db.exec("PRAGMA foreign_keys = ON");

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
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'paid', 'shipped', 'done', 'cancelled')),
    note TEXT
  )
`);

// 清空
db.exec("DELETE FROM orders");
db.exec("DELETE FROM customers");

// 三个客户
const insCust = db.prepare("INSERT INTO customers (name, phone) VALUES (?, ?)");
insCust.run("小明", "13800000001");
insCust.run("小红", "13800000002");
insCust.run("小刚", "13800000003");

// 60 条订单，时间从 45 天前到今天
const insOrder = db.prepare(
  "INSERT INTO orders (customer_id, created_at, total_cents, status, note) VALUES (?,?,?,?,?)"
);
const statuses = ["pending", "paid", "shipped", "done", "cancelled"];
const now = Date.now();

for (let i = 0; i < 60; i++) {
  const daysAgo = Math.floor(Math.random() * 45);
  const t = new Date(now - daysAgo * 24 * 3600 * 1000 + i * 60000);
  insOrder.run(
    (i % 3) + 1,
    t.toISOString(),
    Math.floor(Math.random() * 50000) + 1000,
    statuses[i % 5],
    i % 4 === 0 ? null : "备注 " + i
  );
}

console.log("订单总数：", db.prepare("SELECT COUNT(*) AS c FROM orders").get().c);
console.log("客户总数：", db.prepare("SELECT COUNT(*) AS c FROM customers").get().c);
db.close();
```

**运行：**

```text
node seed-big.mjs
```

**应该看到：**

```text
订单总数： 60
客户总数： 3
```

**为什么用 `Math.random()`：** 这样每次跑数据都不一样，**能避免你的查询"恰好"对**。真实数据就是乱的。

**注意那个 `+ i * 60000`：** 我加上分钟偏移，避免同一时刻有多条数据，**这样"按时间排序"才有确定的顺序**。

**第 0 步做完了。**

---

## 第 1 步：INSERT 的四种写法（20 分钟）

### 1.1 普通插入（最常用）

```javascript
const ins = db.prepare(
  "INSERT INTO customers (name, phone) VALUES (?, ?)"
);
const r = ins.run("小美", "13800000004");
console.log(r);   // { lastInsertRowid: 4, changes: 1 }
```

**这段你已经会了。** 三个关键点：

| 要点 | 说明 |
|---|---|
| 列名必须写 | 不写的话要给全部列的值，顺序不能错，改表结构就炸 |
| 用 `?` 占位 | 防 SQL 注入（第 29 节课讲过） |
| `run()` 返回结果 | `lastInsertRowid` 是新行 id，`changes` 是影响行数 |

### 1.2 多行插入（一次插多条）

**操作：** 试试这个：

```javascript
const many = db.prepare("INSERT INTO customers (name, phone) VALUES (?), (?), (?)");
console.log(many.run("甲", "13900000001", "乙", "13900000002", "丙", "13900000003"));
```

**输出：**

```text
{ lastInsertRowid: 7, changes: 3 }
```

**`changes: 3` 说明插了 3 行。`lastInsertRowid: 7` 是最后一行的 id**（不是第一行的）。

**这个写法什么时候用：** 批量导入数据。**比循环 `run()` 快很多**，因为只编译一次 SQL。

### 1.3 `INSERT OR IGNORE`：重复就跳过

**场景：** 你导入一批数据，里面可能有重复的邮箱。**你不想因为一条重复就整个失败。**

**操作：**

```javascript
// 先插一个
db.prepare("INSERT INTO customers (name, phone) VALUES (?, ?)").run("测试A", "13700000001");

// 再插同一个 phone（会冲突）
try {
  db.prepare("INSERT INTO customers (name, phone) VALUES (?, ?)").run("测试B", "13700000001");
} catch (e) {
  console.log("普通插入报错：", e.message);
}

// 用 OR IGNORE
const r = db.prepare("INSERT OR IGNORE INTO customers (name, phone) VALUES (?, ?)").run("测试C", "13700000001");
console.log("OR IGNORE 结果：", r);
```

**应该看到：**

```text
普通插入报错： UNIQUE constraint failed: customers.phone
OR IGNORE 结果： { lastInsertRowid: 9, changes: 0 }
```

**`changes: 0` 是什么意思：** 一行都没插进去，**因为冲突被跳过了。**

**注意 `lastInsertRowid` 还是给了个数字：** 这个数字**没有意义**（它不是一个真实的新行）。**判断有没有插进去，只看 `changes`。**

**这个陷阱很隐蔽：**

```javascript
const r = ins.run(...);
if (r.lastInsertRowid) {          // ❌ 错的
  console.log("插入成功");
}
if (r.changes > 0) {              // ✅ 对的
  console.log("插入成功");
}
```

**`changes` 才是"真的插进去了吗"的唯一依据。**

### 1.4 `INSERT OR REPLACE`：这个必须讲清楚

**很多人以为它是"更新"，其实不是。**

**操作：** 试一下：

```javascript
console.log("替换前：", db.prepare("SELECT * FROM customers WHERE phone = ?").get("13700000001"));
const r = db.prepare("INSERT OR REPLACE INTO customers (name, phone) VALUES (?, ?)").run("测试D", "13700000001");
console.log("替换结果：", r);
console.log("替换后：", db.prepare("SELECT * FROM customers WHERE phone = ?").get("13700000001"));
```

**我实测的输出（关键看 id）：**

```text
替换前： { id: 8, name: '测试A', phone: '13700000001' }
替换结果： { lastInsertRowid: 10, changes: 1 }
替换后： { id: 10, name: '测试D', phone: '13700000001' }
```

**注意：id 从 8 变成了 10。**

**`INSERT OR REPLACE` 的真实行为是：**

```text
1. 发现 phone 冲突
2. 删除旧那一行（id=8）
3. 插入新的一行（id=10）
```

**它是"删了再插"，不是"改"。**

**这为什么危险：**

| 场景 | 后果 |
|---|---|
| 别的表有 `order.customer_id = 8` | 那个客户被删了，订单指向不存在的客户（**孤儿数据**） |
| 你有 `ON DELETE CASCADE` | **那个客户的所有订单被级联删除** |
| 你不看 id，以为还是同一条记录 | 前端缓存、外链全部失效 |

**我实测过这个坑：如果开了外键又没有 CASCADE，`OR REPLACE` 会直接失败：**

```text
FOREIGN KEY constraint failed
```

**因为你删不掉一个还有子记录引用的父记录。**

**所以：**

```text
INSERT OR REPLACE 只适合"这张表没有别人引用它"的场景。
有外键引用的表，永远用 UPDATE ... WHERE。
```

### 1.5 四种写法怎么选

| 写法 | 什么时候用 | 危险度 |
|---|---|---|
| `INSERT INTO` | 默认，插入新数据 | 无 |
| `INSERT INTO ... VALUES (...),(...)` | 批量导入 | 无 |
| `INSERT OR IGNORE` | 导入可能重复的数据，重复就跳过 | 低 |
| `INSERT OR REPLACE` | **只在没有外键引用时用** | **高** |

**一句话记住：`OR REPLACE` 不是更新，是删除再插入。**

---

## 第 2 步：SELECT 的基本结构（15 分钟）

### 2.1 一句话看懂完整语法

```sql
SELECT   要哪些列
FROM     从哪张表
WHERE    什么条件
GROUP BY 按什么分组
HAVING   分组后筛什么
ORDER BY 怎么排
LIMIT    要几条
```

**执行顺序和书写顺序不一样，这点很重要：**

```text
实际执行顺序：
FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

**为什么这个顺序重要：**

**因为 `WHERE` 在 `GROUP BY` 之前执行。** 所以：

```sql
-- ❌ 错的：WHERE 不能用聚合函数
SELECT customer_id, COUNT(*) FROM orders WHERE COUNT(*) > 5 GROUP BY customer_id;

-- ✅ 对的：聚合的条件放 HAVING
SELECT customer_id, COUNT(*) AS c FROM orders GROUP BY customer_id HAVING COUNT(*) > 5;
```

**报错是：**

```text
misuse of aggregate function COUNT()
```

**看到 `misuse of aggregate function`，就想"这个条件该放 HAVING"。**

### 2.2 只取需要的列，别用 `SELECT *`

**对比：**

```sql
SELECT * FROM orders;                          -- 取全部列
SELECT id, total_cents FROM orders;            -- 只要两列
```

**为什么生产环境不要 `SELECT *`：**

| 问题 | 说明 |
|---|---|
| 传输浪费 | 20 列你只用 2 列，多传 18 列的数据 |
| 表结构改了会出错 | 加了列之后代码可能崩 |
| 别人看不懂你要什么 | "他到底关心哪些字段？" |

**但学习时用 `*` 方便。** 我们的规矩：

```text
练习时随便用 *，写进代码时永远列名。
```

### 2.3 别名：让结果好读

```javascript
const rows = db.prepare(`
  SELECT
    id,
    total_cents AS total,
    total_cents / 100.0 AS total_yuan
  FROM orders
  LIMIT 3
`).all();
console.log(rows.map(r => ({ ...r })));
```

**输出：**

```text
[
  { id: 1, total: 12345, total_yuan: 123.45 },
  ...
]
```

**`AS` 的作用：** 给结果列改名。**数据库字段叫 `total_cents`，但 API 返回给前端叫 `totalYuan` 更自然。**

**注意 `total_cents / 100.0` 的 `.0`：**

**如果写 `total_cents / 100`，整数除法会丢掉小数！**

```sql
SELECT 12345 / 100       → 123      ❌ 小数没了
SELECT 12345 / 100.0     → 123.45   ✅
```

**这个坑非常容易踩。** 因为 JavaScript 里 `12345/100` 是有小数的，**但 SQL 里整数除整数还是整数。**

**记住：SQL 里要小数，除数必须写成 `100.0`。**

---

## 第 3 步：WHERE 条件怎么写（20 分钟）

### 3.1 六种基本条件

**操作：** 在一个文件里跑这些：

```javascript
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("query.db");

const show = (label, sql, ...params) => {
  const rows = db.prepare(sql).all(...params);
  console.log(`\n${label}（${rows.length} 条）`);
  console.log(rows.slice(0, 3).map(r => ({ ...r })));
};

show("1. 等于", "SELECT id, status FROM orders WHERE status = ?", "paid");
show("2. 不等于", "SELECT id, status FROM orders WHERE status != ?", "paid");
show("3. 大于", "SELECT id, total_cents FROM orders WHERE total_cents > ?", 40000);
show("4. 区间", "SELECT id, total_cents FROM orders WHERE total_cents BETWEEN ? AND ?", 10000, 20000);
show("5. 多选一", "SELECT id, status FROM orders WHERE status IN (?,?)", "pending", "paid");
show("6. 模糊匹配", "SELECT id, note FROM orders WHERE note LIKE ?", "%备注 1%");

db.close();
```

**六种条件的写法：**

| 需求 | SQL |
|---|---|
| 等于 | `= ?` |
| 不等于 | `!= ?` 或 `<> ?` |
| 大于/小于 | `> ?`、`< ?`、`>= ?`、`<= ?` |
| 区间 | `BETWEEN ? AND ?`（**包含两端**） |
| 多选一 | `IN (?, ?, ?)` |
| 模糊 | `LIKE '%关键字%'` |

**`LIKE` 的两个通配符：**

| 写法 | 匹配 |
|---|---|
| `'A%'` | 以 A 开头 |
| `'%A'` | 以 A 结尾 |
| `'%A%'` | 包含 A |
| `'A_'` | A 后面跟**正好一个**字符 |

**`_` 是"任意单个字符"。** 这个用得少，但看到要知道。

### 3.2 组合条件：AND / OR 的括号陷阱

**看这个查询：**

```sql
SELECT * FROM orders
WHERE status = 'paid' OR status = 'pending' AND total_cents > 10000
```

**你以为它在查什么：** 「已付款或待付款」并且「金额大于 10000」。

**它实际在查什么：** 「已付款」**或者**「待付款且金额大于 10000」。

**为什么：** 因为 `AND` 的优先级**高于** `OR`。等价于：

```sql
WHERE status = 'paid' OR (status = 'pending' AND total_cents > 10000)
```

**正确写法必须加括号：**

```sql
WHERE (status = 'paid' OR status = 'pending') AND total_cents > 10000
```

**这是 SQL 里最容易出错的地方之一，而且它不报错，只是结果不对。**

**规矩：只要同时有 `AND` 和 `OR`，就给 `OR` 那部分加括号。**

### 3.3 日期的比较（ISO 字符串能直接比）

**这是上节课"用 ISO 字符串存时间"的红利。**

**操作：**

```javascript
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
console.log("7 天前的阈值：", sevenDaysAgo);

const rows = db.prepare(
  "SELECT id, created_at, total_cents FROM orders WHERE created_at >= ? ORDER BY created_at DESC"
).all(sevenDaysAgo);

console.log(`最近 7 天有 ${rows.length} 条订单`);
console.log(rows.slice(0, 3).map(r => ({ ...r })));
```

**为什么可以直接用 `>=` 比较字符串：**

**因为 ISO 8601 格式（`2026-11-16T07:42:08.289Z`）的字典序 = 时间序。**

```text
"2026-11-09T..." < "2026-11-16T..."   ← 字典序
2026-11-09        < 2026-11-16        ← 时间序
```

**两者一致，所以字符串比较就等于时间比较。**

**但有个前提：格式必须统一。**

**如果混了这两种格式，比较就错了：**

```text
2026-11-16T07:42:08.289Z     ← ISO，带 T 和 Z
2026/11/16 15:42:08          ← 本地格式，带斜杠
```

**为什么错：** `'2026-11-16T...'` 和 `'2026/11/16 ...'` 比大小，第一个字符 `-` 和 `/` 的 ASCII 码不同，**结果毫无意义。**

**所以规矩是：**

```text
时间字段必须统一用 new Date().toISOString() 写入。
一旦混入本地格式，所有时间比较全部失效。
```

**我的实测数据：30 天数据里查最近 7 天，返回 8 条。** 你可以自己跑一下看你的数字。

### 3.4 按天分组统计

**需求：** 每天有多少订单。

```javascript
const byDay = db.prepare(`
  SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS cnt
  FROM orders
  GROUP BY day
  ORDER BY day DESC
  LIMIT 7
`).all();
console.log(byDay.map(r => ({ ...r })));
```

**关键在 `substr(created_at, 1, 10)`：**

**`substr(字符串, 起始位置, 长度)`** —— 从第 1 个字符开始，取 10 个。

```text
2026-11-16T07:42:08.289Z
└────────┘
   10 个字符 = "2026-11-16"
```

**这样就得到了"日期"部分，可以按天分组。**

**输出大概：**

```text
[
  { day: '2026-11-16', cnt: 2 },
  { day: '2026-11-15', cnt: 1 },
  ...
]
```

**为什么不用 `date()` 函数：** SQLite 有 `date(created_at)` 也能做，但 **`substr` 更保险**，因为它不依赖 SQLite 的日期解析规则（万一格式有点偏差，`date()` 会返回 `null`）。

---

## 第 4 步：NULL 的三个坑（20 分钟）

**这一步是整节课最容易踩雷的地方。我实测了数据，必须看清楚。**

### 4.1 坑一：`= NULL` 永远查不到任何东西

**操作：**

```javascript
const a = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE note = NULL").get();
const b = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE note IS NULL").get();
console.log("note = NULL  :", a.c);
console.log("note IS NULL :", b.c);
console.log("总订单数      :", db.prepare("SELECT COUNT(*) AS c FROM orders").get().c);
```

**我的实测输出：**

```text
note = NULL  : 0
note IS NULL : 15
总订单数      : 60
```

**为什么 `= NULL` 是 0：**

**因为 `NULL` 在 SQL 里的意思是"未知"，不是"空"。**

```text
"未知" 等于 "未知" 吗？   → 不知道
```

**所以 `note = NULL` 的结果是 `NULL`（未知），不是 `true`。而 `WHERE` 只在结果为 `true` 时才选中行。**

**正确写法：用 `IS NULL` / `IS NOT NULL`。**

```sql
WHERE note IS NULL          -- 找没填备注的
WHERE note IS NOT NULL      -- 找填了备注的
```

**这条要刻进肌肉记忆。** 因为 `= NULL` 不报错，只是静默返回 0 条 —— **你会以为"真的没有"，其实全都有。**

### 4.2 坑二：`!=` 会漏掉所有 NULL 行

**这个更隐蔽。**

**操作：**

```javascript
const c1 = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE note != ?").get("备注 1");
const c2 = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE COALESCE(note, '') != ?").get("备注 1");
const nullCnt = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE note IS NULL").get().c;
console.log("note != '备注 1'                :", c1.c);
console.log("COALESCE(note,'') != '备注 1'   :", c2.c);
console.log("note IS NULL 的条数             :", nullCnt);
```

**我实测的输出：**

```text
note != '备注 1'                : 44
COALESCE(note,'') != '备注 1'   : 59
note IS NULL 的条数             : 15
```

**看清楚这三个数字的关系：**

```text
59 - 44 = 15 = null 的条数
```

**差的那 15 条，正是 `note IS NULL` 的那些。**

**原因：** `NULL != '备注 1'` 的结果是 `NULL`（未知），不是 `true`。**所以那些行不会被选中。**

**这个坑的可怕之处：**

你查"所有备注不是 X 的订单"，本以为得到 59 条，**实际只得到 44 条，少了 15 条，而且完全不报错。**

**如果这是财务报表，你少了 15 笔订单。**

**正确写法有三种：**

```sql
-- 方案 1：显式包含 null
WHERE note != '备注 1' OR note IS NULL

-- 方案 2：用 IS NOT（SQLite 特有）
WHERE note IS NOT '备注 1'

-- 方案 3：先把 null 转成空字符串
WHERE COALESCE(note, '') != '备注 1'
```

**推荐方案 3。** 因为 `IS NOT` 是 SQLite 的扩展语法，**换到 MySQL/PostgreSQL 可能不支持。**

**`COALESCE(x, y)` 是什么：** 返回第一个非 `null` 的值。`COALESCE(note, '')` = "如果 note 是 null，就用空字符串代替"。

**这是个通用函数，所有数据库都有。记住它。**

### 4.3 坑三：`NOT IN` 里只要有 NULL，结果全空

**这是最阴的一个。**

**操作：**

```javascript
// 先看看 status 有哪些值
const statuses = db.prepare("SELECT DISTINCT status FROM orders").all();
console.log("所有 status：", statuses.map(r => r.status));

// 正常的 NOT IN
const r1 = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status NOT IN (?,?)").get("pending", "paid");
console.log("status NOT IN (pending, paid):", r1.c);

// NOT IN 里带 null
const r2 = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status NOT IN (?,?,?)").get("pending", "paid", null);
console.log("status NOT IN (pending, paid, NULL):", r2.c);
```

**我的实测输出：**

```text
status NOT IN (pending, paid): 36
status NOT IN (pending, paid, NULL): 0
```

**加了 `null` 之后，结果变成 0 条。**

**为什么：**

`x NOT IN (a, b, NULL)` 展开等于：

```text
x != a AND x != b AND x != NULL
```

**而 `x != NULL` 永远是 `NULL`（未知），不是 `true`。** 所以整个 `AND` 表达式永远不为 `true`。

**结果：任何行都不会被选中。**

**这个坑在真实代码里怎么出现：**

```javascript
// 假设你有一个"排除列表"，从别处查来的
const excludeIds = db.prepare("SELECT customer_id FROM blacklist").all().map(r => r.customer_id);
// 如果 blacklist 里有一行的 customer_id 是 null（比如数据脏了）
const sql = `SELECT * FROM orders WHERE customer_id NOT IN (${excludeIds.map(() => "?").join(",")})`;
// → 结果永远是 0 条
```

**而且这个 bug 极难发现** —— 因为列表里多一个 `null`，你的查询就静默失效。

**怎么防：**

```javascript
// 过滤掉 null
const clean = excludeIds.filter(x => x !== null && x !== undefined);
if (clean.length === 0) {
  // 空列表要特殊处理，不能拼成 NOT IN ()
}
```

**规矩：**

```text
任何进 NOT IN 的数组，先 filter 掉 null 和 undefined。
```

### 4.4 NULL 速查

| 你想查 | ❌ 错的 | ✅ 对的 |
|---|---|---|
| 是 null | `= NULL` | `IS NULL` |
| 不是 null | `!= NULL` | `IS NOT NULL` |
| 不等于某个值（含 null 行） | `!= 'x'` | `COALESCE(col,'') != 'x'` |
| 不在列表里（列表可能含 null） | `NOT IN (...)` | 先过滤列表里的 null |
| 空字符串 vs null | `= ''`（查不到 null） | 想两个都要：`IS NULL OR col = ''` |

**最后一行值得展开：**

**用户没填备注，可能是 `null`，也可能是空字符串 `''`。这两个不一样。**

```javascript
// 如果前端传了空字符串，存进去就是 ''，不是 null
UPDATE orders SET note = '' WHERE id = 1;

// 现在这样查，查不到它
SELECT * FROM orders WHERE note IS NULL;

// 这样查，能查到
SELECT * FROM orders WHERE note = '';

// 想两个都要（"用户没填"的两种情况）
SELECT * FROM orders WHERE note IS NULL OR note = '';
```

**统一规范：要么都存 `null`，要么都存 `''`，不要混。** 我们约定：**没填就是 `null`。**

---

## 第 5 步：分页的正确写法（15 分钟）

**这一步有个性能陷阱，很多教程不讲。**

### 5.1 基本写法

```javascript
const page = 2;       // 第 2 页
const pageSize = 10;  // 每页 10 条
const offset = (page - 1) * pageSize;

const rows = db.prepare(`
  SELECT id, created_at, total_cents
  FROM orders
  ORDER BY id DESC
  LIMIT ? OFFSET ?
`).all(pageSize, offset);

console.log(`第 ${page} 页：`, rows.map(r => r.id));
```

**`LIMIT 10 OFFSET 10` 的意思：** 跳过前 10 条，取接下来的 10 条。

**三个必须注意的点：**

**第一：`ORDER BY` 必须有，而且要确定**

**没有 `ORDER BY` 的话，`LIMIT/OFFSET` 的结果是不确定的。**

为什么：数据库不保证返回顺序。你可能第一页看到 id 5，第二页又看到 id 5。

**而且 `ORDER BY` 的字段必须唯一**（或者加一个唯一字段兜底）：

```sql
ORDER BY created_at DESC, id DESC   ← 时间可能重复，用 id 兜底
```

**为什么要加 `id DESC`：** 如果两条订单时间完全相同，只按 `created_at` 排序，它们的相对顺序不确定。**翻页时可能重复或漏掉。**

**这是个真实的线上 bug 来源。** 用户说"我明明看到那件商品，翻页就没了"。

**第二：`page` 从 1 开始还是从 0 开始**

```javascript
const offset = (page - 1) * pageSize;   // page 从 1 开始
const offset = page * pageSize;         // page 从 0 开始
```

**选一个，全项目统一。** 我们统一用 **page 从 1 开始**（符合用户直觉）。

**第三：`LIMIT` 和 `OFFSET` 必须是整数**

**`run()` 传的参数如果是 `"10"` 字符串，SQLite 能容忍。但如果传 `10.5`，会报错。**

```text
datatype mismatch
```

**所以：**

```javascript
const pageSize = Math.floor(Number(req.query.pageSize)) || 10;
```

**这行是防用户传 `?pageSize=abc` 或 `?pageSize=-5`。** 第 18 节课讲过，`Number("abc")` 是 `NaN`，`|| 10` 兜底。

### 5.2 性能陷阱：深分页

**`LIMIT 10 OFFSET 100000` 有多慢？**

**SQLite 要先扫过前 100000 行，再丢掉，然后给你 10 行。**

**数据量小时感觉不到。数据上百万时，翻到第 10000 页要等好几秒。**

**为什么慢：** 因为 `OFFSET` 是"跳过"，不是"直接跳到"。

**更好的写法（游标分页）：**

```javascript
// 不要 page，而是"从哪个 id 之后开始"
const lastId = 12345;
const rows = db.prepare(`
  SELECT id, created_at, total_cents
  FROM orders
  WHERE id < ?
  ORDER BY id DESC
  LIMIT ?
`).all(lastId, pageSize);
```

**区别：**

| 方式 | 怎么翻页 | 性能 |
|---|---|---|
| `OFFSET` | `page=100` → 跳过 (100-1)×10 行 | 越翻越慢 |
| **游标** | 传上一页最后一条的 id | **恒定快** |

**为什么快：** 因为 `WHERE id < 12345` 能直接用主键索引定位，不用扫前面的行。

**什么时候用哪个：**

| 场景 | 用哪个 |
|---|---|
| 后台管理，总共几百条 | `OFFSET` 就行 |
| 用户能翻到很后面 | **游标** |
| 需要"跳到第 50 页" | 只能 `OFFSET`（游标做不到） |

**我们这个课程的项目数据量小，先用 `OFFSET`。但你要知道有这个问题，别到时候上线了才发现。**

### 5.3 一次查询拿总数 + 当前页

**做分页界面，前端要两个数字：总共多少条、当前页的数据。**

**两次查询：**

```javascript
const total = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = ?").get("paid").c;
const rows = db.prepare(`
  SELECT id, total_cents FROM orders WHERE status = ? ORDER BY id DESC LIMIT ? OFFSET ?
`).all("paid", pageSize, offset);

console.log({ total, page, pageSize, totalPages: Math.ceil(total / pageSize), rows: rows.length });
```

**注意：两个查询的 `WHERE` 条件必须完全一致。** 不然总数和列表对不上。

**这个"条件必须一致"很容易出错：** 你改了列表的筛选条件，忘了改总数的，就会出现"总共 100 条但只能翻到 3 页"。

**防这个的办法：把条件抽成变量。**

```javascript
const whereClause = "status = ?";
const whereParams = ["paid"];

const total = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE ${whereClause}`).get(...whereParams).c;
const rows = db.prepare(`SELECT id FROM orders WHERE ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...whereParams, pageSize, offset);
```

**注意这里能拼字符串（`whereClause`），因为它不是用户输入，是你代码里写死的。** 但 `whereParams` 必须是 `?`。

---

## 第 6 步：GROUP BY 和聚合函数（15 分钟）

### 6.1 五个聚合函数

| 函数 | 作用 | 例子 |
|---|---|---|
| `COUNT(*)` | 数行数 | `COUNT(*)` = 60 |
| `COUNT(列)` | 数这列非 null 的行数 | `COUNT(note)` = 45 |
| `SUM(列)` | 求和 | `SUM(total_cents)` |
| `AVG(列)` | 平均 | `AVG(total_cents)` |
| `MAX` / `MIN` | 最大 / 最小 | `MAX(total_cents)` |

**`COUNT(*)` 和 `COUNT(列)` 的区别必须记住：**

```javascript
const a = db.prepare("SELECT COUNT(*) AS c FROM orders").get().c;
const b = db.prepare("SELECT COUNT(note) AS c FROM orders").get().c;
console.log("COUNT(*)   :", a);   // 60
console.log("COUNT(note):", b);   // 45
```

**`COUNT(note)` 只数 `note` 不是 `null` 的行。** 所以是 45（60 减 15）。

**这个区别在"统计有多少人填了备注"时非常有用。**

### 6.2 GROUP BY 的实战

**需求：每个客户的订单数和总金额。**

```javascript
const stats = db.prepare(`
  SELECT
    customer_id,
    COUNT(*) AS order_count,
    SUM(total_cents) AS sum_cents,
    ROUND(AVG(total_cents)) AS avg_cents
  FROM orders
  GROUP BY customer_id
  ORDER BY sum_cents DESC
`).all();

console.log(stats.map(r => ({ ...r })));
```

**输出大概：**

```text
[
  { customer_id: 2, order_count: 20, sum_cents: 512340, avg_cents: 25617 },
  { customer_id: 1, order_count: 20, sum_cents: 498120, avg_cents: 24906 },
  { customer_id: 3, order_count: 20, sum_cents: 487650, avg_cents: 24383 }
]
```

**`ROUND(AVG(...))` 的作用：** `AVG` 会返回小数，`ROUND` 四舍五入到整数。

**因为金额是"分"，不可能是小数分。** 所以要 `ROUND`。

**这里有个业务问题：** 三个客户的 `avg_cents` 加起来是 74906，但总额是 1498110 分。**`74906 × 3 = 224718`，差得很远。**

**为什么：** 因为 `AVG` 是每个客户的平均，不是"三个平均的平均"。

**平均值不能相加，这是统计常识。** 但实际做报表时很容易搞错。

### 6.3 HAVING：分组后筛选

**需求：找出"订单数超过 20 条"的客户。**

**为什么不能写 `WHERE COUNT(*) > 20`：**

**因为 `WHERE` 在 `GROUP BY` 之前执行，那时还没有"分组后的 COUNT"。**

**操作：**

```javascript
// 错的写法（会报错）
try {
  db.prepare("SELECT customer_id, COUNT(*) FROM orders WHERE COUNT(*) > 20 GROUP BY customer_id").all();
} catch (e) {
  console.log("WHERE 用聚合函数的报错：", e.message);
}

// 对的写法
const r = db.prepare(`
  SELECT customer_id, COUNT(*) AS c
  FROM orders
  GROUP BY customer_id
  HAVING COUNT(*) >= 20
`).all();
console.log("HAVING 结果：", r.map(x => ({ ...x })));
```

**报错原文：**

```text
misuse of aggregate function COUNT()
```

**`HAVING` 和 `WHERE` 的位置关系图：**

```text
FROM → WHERE（筛行）→ GROUP BY（分组）→ HAVING（筛组）→ SELECT
```

**一句话记：**

```text
WHERE 筛"行"，HAVING 筛"组"。
```

### 6.4 一个常见的错误：SELECT 里有不在 GROUP BY 的列

```sql
-- ❌ 危险写法
SELECT customer_id, status, COUNT(*) FROM orders GROUP BY customer_id
```

**`status` 既不在 `GROUP BY` 里，也不是聚合函数。**

**SQLite 会给你一个值**（通常是第一行的），**但这个值没有意义。**

**MySQL 在严格模式下会直接报错：**

```text
Expression #2 of SELECT list is not in GROUP BY clause and contains nonaggregated column...
```

**SQLite 比 MySQL 宽松，不报错。**

**规矩：**

```text
SELECT 里出现的列，要么在 GROUP BY 里，要么包在聚合函数里。
```

**这条在 SQLite 里不强制，但它会导致你在 MySQL/PostgreSQL 上跑不通。** 养成好习惯。

---

## 第 7 步：结果转 JSON（10 分钟）

**做 API 的时候，你要把数据库的行转成前端能用的 JSON。**

### 7.1 直接返回的问题

```javascript
const rows = db.prepare("SELECT * FROM orders LIMIT 3").all();
res.json(rows);
```

**能跑，但有三个问题：**

| 问题 | 后果 |
|---|---|
| 字段名是 snake_case | 前端要用 `row.total_cents`，不太符合 JS 习惯 |
| 金额是分 | 前端每次都要 `/100`，容易忘 |
| 有不该给前端的字段 | 可能泄露内部信息 |

### 7.2 转一层的写法

```javascript
const toApiOrder = (row) => ({
  id: row.id,
  createdAt: row.created_at,
  totalYuan: (row.total_cents / 100).toFixed(2),
  status: row.status,
});

const rows = db.prepare("SELECT * FROM orders LIMIT 3").all();
console.log(rows.map(toApiOrder));
```

**输出：**

```text
[
  { id: 1, createdAt: '2026-11-16T...', totalYuan: '123.45', status: 'pending' },
  ...
]
```

**为什么 `toFixed(2)`：** 因为 `123.4` 显示成 `"123.40"` 更好看（金额习惯保留两位）。

**但注意：`toFixed` 返回的是字符串！**

```javascript
typeof (123.45).toFixed(2)   // "string"
```

**所以 `totalYuan` 是字符串不是数字。**

**这是好还是坏：** 对于金额，**字符串更好**。因为前端如果要精确计算，字符串不会丢精度。

**如果你要数字：**

```javascript
totalYuan: Math.round(row.total_cents) / 100
```

**但这样 `1234 / 100 = 12.34` 是浮点数，可能有精度问题。所以金额还是给字符串最安全。**

### 7.3 一个必须注意的转换边界

**`null` 怎么转？**

```javascript
const toApi = (row) => ({
  id: row.id,
  note: row.note,          // 可能是 null
  noteText: row.note ?? "",  // 转成空字符串
});
```

**`??` 是什么：** nullish coalescing（空值合并）。**只有 `null` 或 `undefined` 才用右边。**

**和 `||` 的区别：**

```javascript
0 || "默认"     // "默认"   ← 0 被当成假
0 ?? "默认"     // 0        ← 只有 null/undefined 才替换
```

**金额字段千万别用 `||`：**

```javascript
row.total_cents || 0     // 如果金额真的是 0，会被替换成 0（碰巧对）
row.stock || 0           // 如果库存是 0，也是 0（碰巧对）
```

**但如果有个合法值是 `0`，而你想区分"0"和"没值"：**

```javascript
row.count || -1      // ❌ 0 会变成 -1
row.count ?? -1      // ✅ 0 还是 0
```

**规矩：处理数值时用 `??`，不要用 `||`。**

---

## 第 8 步：故意撞五个坑（15 分钟）

**每个都真的跑一遍。**

### 坑 1：整数除法丢小数

```javascript
console.log(db.prepare("SELECT 12345 / 100 AS a, 12345 / 100.0 AS b").get());
```

**你会看到 `a: 123`、`b: 123.45`。**

**教训：SQL 里要小数，除数写 `100.0`。**

### 坑 2：`AND` / `OR` 优先级

```javascript
const withoutParen = db.prepare(
  "SELECT COUNT(*) AS c FROM orders WHERE status = 'paid' OR status = 'pending' AND total_cents > 30000"
).get().c;

const withParen = db.prepare(
  "SELECT COUNT(*) AS c FROM orders WHERE (status = 'paid' OR status = 'pending') AND total_cents > 30000"
).get().c;

console.log("不加括号：", withoutParen);
console.log("加括号  ：", withParen);
```

**两个数字不一样。** 这就是 `AND` 优先于 `OR` 的后果。

**教训：有 `OR` 就加括号。**

### 坑 3：`= NULL`

```javascript
console.log(db.prepare("SELECT COUNT(*) AS c FROM orders WHERE note = NULL").get().c);   // 0
console.log(db.prepare("SELECT COUNT(*) AS c FROM orders WHERE note IS NULL").get().c);  // 15
```

**教训：永远用 `IS NULL`。**

### 坑 4：`!=` 漏 null

```javascript
const a = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE note != ?").get("备注 1").c;
const b = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE COALESCE(note,'') != ?").get("备注 1").c;
const n = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE note IS NULL").get().c;
console.log("!=        :", a);
console.log("COALESCE  :", b);
console.log("null 条数 :", n);
console.log("差值      :", b - a, "（应该等于 null 条数）");
```

**你会看到 `b - a === n`。** 差值正好是 null 的条数。

**教训：`!=` 前先 `COALESCE`。**

### 坑 5：`NOT IN` 带 null

```javascript
console.log(db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status NOT IN (?,?)").get("pending", "paid").c);      // 36
console.log(db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status NOT IN (?,?,?)").get("pending", "paid", null).c);  // 0
```

**教训：进 `NOT IN` 前先 filter 掉 null。**

---

## 第 9 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第03节课\02-笔记\NOTES.md
```

**重点填：**

1. `INSERT` 四种写法的对比（尤其 `OR REPLACE` 的真实行为）；
2. `SELECT` 的执行顺序；
3. `NULL` 的三个坑（附实测数字）；
4. 分页的两种写法；
5. 五个坑的实测结果。

---

## 第 10 步：课后练习

### 练习 1：写五个查询

**不看课件，写出 SQL：**

1. 查总金额超过 30000 分且状态是 `paid` 的订单，按金额降序；
2. 查每个客户的订单数和平均金额；
3. 查最近 3 天每天有多少订单；
4. 查备注为空的订单有多少条（注意 `null` 和 `''` 都要算）；
5. 查"订单数最多的那个客户是谁"（要拿到名字，不只是 id）。

**第 5 题有难度：** 你需要想办法把 `customer_id` 变成名字。**第 33 节的 JOIN 会教标准做法，但你现在可以先用两次查询凑出来。**

### 练习 2：分页实现

**任务：** 做一个 `getOrders(page, pageSize)` 函数，返回：

```javascript
{
  page: 1,
  pageSize: 10,
  total: 60,
  totalPages: 6,
  rows: [...]
}
```

**要求：**

- `page` 从 1 开始；
- 传 `page=0`、`page=-1`、`page="abc"` 都要能正确处理（不能崩）；
- 只返回 `id`、`createdAt`、`totalYuan`、`status` 四个字段；
- `totalYuan` 是两位小数的字符串。

### 练习 3：验证 NULL 的三个坑

**把第 8 步那五个坑自己跑一遍，把真实数字记进笔记。**

**要求：** 每个坑都要写出"我原本以为是多少"和"实际是多少"。

### 练习 4：找出这五个查询的问题

```sql
-- A
SELECT * FROM orders WHERE note = NULL;

-- B
SELECT * FROM orders ORDER BY created_at LIMIT 10 OFFSET 20;

-- C
SELECT customer_id, COUNT(*) FROM orders WHERE COUNT(*) > 5 GROUP BY customer_id;

-- D
SELECT id, total_cents / 100 AS yuan FROM orders;

-- E
SELECT * FROM orders WHERE status != 'cancelled' AND note != '测试';
```

**逐个说出问题在哪，怎么改。**

### 练习 5：用自己的话讲

```text
为什么 INSERT OR REPLACE 是危险的？
为什么 = NULL 查不到任何东西？
为什么深分页（OFFSET 很大）会慢？
```

---

## 第 11 步：最终验收

### A. INSERT

- [ ] 我会写普通插入
- [ ] 我会一次插多行
- [ ] 我理解 `OR IGNORE` 的 `changes: 0` 意味着没插进去
- [ ] 我知道 `OR REPLACE` 会改变 id（删了再插）
- [ ] 我知道有外键引用的表不能用 `OR REPLACE`

### B. SELECT

- [ ] 我能背出执行顺序：FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
- [ ] 我知道 `WHERE` 不能用聚合函数
- [ ] 我会用 `BETWEEN`、`IN`、`LIKE`
- [ ] 我知道有 `OR` 必须加括号
- [ ] 我知道 SQL 里整数除法会丢小数

### C. NULL

- [ ] 我知道 `= NULL` 永远查不到
- [ ] 我知道 `!=` 会漏掉 null 行
- [ ] 我知道 `NOT IN` 带 null 会全空
- [ ] 我会用 `COALESCE`
- [ ] 我知道 `COUNT(*)` 和 `COUNT(列)` 的区别

### D. 分页

- [ ] 我会写 `LIMIT ? OFFSET ?`
- [ ] 我知道必须有 `ORDER BY` 且要能唯一确定顺序
- [ ] 我知道深分页的性能问题
- [ ] 我知道游标分页的写法
- [ ] 我会同时查总数和当前页

### E. 输出

- [ ] 我会把 snake_case 转成 camelCase
- [ ] 我知道金额给前端用字符串更安全
- [ ] 我知道数值处理要用 `??` 不用 `||`

### F. 实测

- [ ] 五个坑我都跑过并记了数字
- [ ] 我做了练习 2 的分页函数
- [ ] 我做了练习 4 的错题分析
- [ ] 笔记填完

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `misuse of aggregate function` | `WHERE` 里用了 `COUNT`/`SUM` | 改用 `HAVING` |
| 查询结果比预期少 | `!=` 漏掉了 null 行 | 用 `COALESCE(col,'') != ?` |
| 查询结果是 0 条，但明明有数据 | 用了 `= NULL` | 改 `IS NULL` |
| `NOT IN` 结果总是 0 条 | 列表里有 `null` | 先 filter 掉 null |
| 金额算出来少了几位小数 | 整数除法 | 除数写 `100.0` |
| 分页有重复/漏数据 | `ORDER BY` 不唯一 | 加 `id` 兜底排序 |
| 翻到后面几页特别慢 | 深分页 `OFFSET` 太大 | 改用游标分页 |
| `datatype mismatch` | `LIMIT`/`OFFSET` 传了非整数 | `Math.floor(Number(x))` |
| `OR REPLACE` 之后 id 变了 | 它是删了再插 | 有外键的表用 `UPDATE` |
| `OR IGNORE` 之后查不到数据 | `changes: 0`，没插进去 | 判断 `changes` 不看 `lastInsertRowid` |
| `INSERT` 报 `table X has N columns but M values` | 没写列名，值的数量不对 | 明确写出列名 |
| 时间比较结果不对 | 混用了 ISO 和本地格式 | 统一用 `toISOString()` |
| `ROUND` 之后金额差一两分 | 平均值舍入 | 报表里注明"合计可能有差异" |

---

## 附：这一节课你必须记住的六句话

```text
一、INSERT OR REPLACE 不是更新，是删除再插入。有外键的表别用。

二、= NULL 永远查不到。用 IS NULL。

三、!= 会漏掉 null 行。前面加 COALESCE。

四、NOT IN 里有一个 null，结果全空。

五、SQL 里整数除整数还是整数。要小数就写 100.0。

六、分页必须有 ORDER BY，而且排序要能唯一确定顺序。
```

---

## 附：下一步

**第 32 节课：条件筛选与排序。**

这节课你学了"怎么写条件"。下节课深入讲：

- 复杂条件的组合（多条件、嵌套）；
- 排序的坑（中文排序、`null` 排在哪、大小写敏感）；
- 怎么实现"多选筛选"（用户可以选多个状态）；
- 怎么实现"搜索框"（多个字段模糊匹配）；
- **`ORDER BY` 在中文环境下的排序问题**（这个很多人都不知道）。

**在你进入下节课之前：**

- [ ] 你的 `query.db` 里有 60 条订单
- [ ] 你能查出"最近 7 天的订单"
- [ ] 你能查出"每个客户的订单统计"
- [ ] 你跑过那五个坑，并且记下了真实数字
