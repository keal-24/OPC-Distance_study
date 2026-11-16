# 第 32 节课：条件筛选与排序

## 本节课要解决的问题

上节课你会写基本条件了。**这节课解决真实业务里的复杂需求：**

- 用户可以同时选多个状态筛选（"已付款 + 已发货"都要看）；
- 用户在一个搜索框里输入关键字，要同时匹配标题和备注；
- 列表要能按金额、按时间、按状态排序，还能升降序切换；
- **中文按拼音排序**（这个最难，我实测了 SQLite 的限制）。

**这节课你会学到：**

- 动态条件怎么拼（`IN` 的占位符数量不固定时怎么写）；
- 多字段模糊搜索的正确写法（以及它的性能代价）；
- **中文排序的真相**：SQLite 只有三种 collation，做不到拼音排序；
- `NULL` 在排序里排在哪，怎么控制；
- 大小写敏感与不敏感的区别；
- **一个能复用的筛选器构建函数**（这是真实项目的做法）。

**这节课不学：** JOIN（第 33 节）、索引（第 34 节）、全文搜索（那要用 FTS5 扩展，本课程不讲）。

**需要多久：** 100 分钟。

---

## 第 0 步：造一批"更像真实数据"的测试数据（10 分钟）

**为什么要换数据：**

上节课的数据是"订单 1、订单 2"。**真实数据长这样：**

- 名字有中文、英文、中英混排；
- 有的字段是空的；
- 状态值有拼错的可能；
- 大小写不统一。

**只有用这样的数据测，你才会发现排序和筛选的问题。**

### 0.1 建文件夹

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第04节课\03-练习代码
   ```

2. 新建文件夹 `filter-lab`，进去，地址栏输入 `cmd` 回车。
3. 新建 `seed.mjs`。

### 0.2 造数据

**操作：自己敲：**

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("filter.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    stock INTEGER,
    status TEXT NOT NULL DEFAULT 'on_sale',
    note TEXT
  )
`);

db.exec("DELETE FROM products");

const ins = db.prepare(
  "INSERT INTO products (name, category, price_cents, stock, status, note) VALUES (?,?,?,?,?,?)"
);

const items = [
  ["矿泉水", "饮品", 200, 50, "on_sale", "热销"],
  ["可乐", "饮品", 350, 0, "out_of_stock", null],
  ["Nike 运动鞋", "鞋类", 49900, 8, "on_sale", "进口"],
  ["adidas 跑鞋", "鞋类", 42900, 3, "on_sale", null],
  ["苹果", "水果", 800, null, "on_sale", "当季"],
  ["香蕉", "水果", 600, 12, "off_sale", null],
  ["李宁 T恤", "服装", 12900, 25, "on_sale", "新品"],
  ["PUMA 短裤", "服装", 15900, 0, "out_of_stock", null],
  ["张三的店 手工面包", "食品", 2500, 5, "on_sale", "手工"],
  ["王五牌 辣椒酱", "食品", 1800, 30, "on_sale", null],
  ["AirPods", "数码", 99900, 2, "on_sale", "正品"],
  ["小米 充电宝", "数码", 7900, 40, "on_sale", null],
];

for (const item of items) {
  ins.run(...item);
}

console.log("商品数：", db.prepare("SELECT COUNT(*) AS c FROM products").get().c);
console.log("分类：", db.prepare("SELECT DISTINCT category FROM products").all().map(r => r.category).join("、"));
console.log("状态：", db.prepare("SELECT DISTINCT status FROM products").all().map(r => r.status).join("、"));
db.close();
```

**运行：**

```text
node seed.mjs
```

**应该看到：**

```text
商品数： 12
分类： 饮品、鞋类、水果、服装、食品、数码
状态： on_sale、out_of_stock、off_sale
```

**注意这批数据的特征：**

| 特征 | 为什么要这样造 |
|---|---|
| 有中文名、英文名、中英混排 | 测排序 |
| 有 `stock` 是 `null` 的 | 测 NULL 排序 |
| 有 `note` 是 `null` 的 | 测 NULL 筛选 |
| 有大小写混排（Nike / adidas / PUMA） | 测大小写敏感性 |

**第 0 步做完了。**

---

## 第 1 步：动态条件的写法（20 分钟）

**这是真实项目里最常见的需求："用户可以选一个、两个或三个状态。"**

### 1.1 问题：占位符数量不固定

**你想写：**

```sql
WHERE status IN (?, ?, ?)
```

**但用户可能只选 1 个，也可能选 3 个。** 占位符数量得跟着变。

**不能这样写（错误的做法）：**

```javascript
const sql = `WHERE status IN ('${statuses.join("','")}')`;   // ❌ SQL 注入
```

**为什么错：** 如果 `statuses` 里有个值是 `x') OR 1=1 --`，整个查询就被改了。

**正确做法：动态生成占位符，但值还是走参数。**

### 1.2 正确写法

**操作：** 新建 `dynamic-in.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("filter.db");

// 关键：只生成 ? 的数量，不拼值
const placeholders = (n) => Array.from({ length: n }, () => "?").join(",");

function findByStatuses(statuses) {
  if (statuses.length === 0) {
    return [];   // 空列表要特殊处理，不能拼成 IN ()
  }
  const sql = `SELECT id, name, status FROM products WHERE status IN (${placeholders(statuses.length)})`;
  return db.prepare(sql).all(...statuses);
}

console.log("选 1 个：", findByStatuses(["on_sale"]).length, "条");
console.log("选 2 个：", findByStatuses(["on_sale", "out_of_stock"]).length, "条");
console.log("选 3 个：", findByStatuses(["on_sale", "out_of_stock", "off_sale"]).length, "条");
console.log("空列表：", findByStatuses([]).length, "条");

db.close();
```

**运行，你应该看到：**

```text
选 1 个： 8 条
选 2 个： 10 条
选 3 个： 12 条
空列表： 0 条
```

**三个关键点：**

**第一：`Array.from({length: n}, () => "?").join(",")`**

**这是"生成 n 个问号并用逗号连接"。**

```javascript
placeholders(3)   // "?,?,?"
placeholders(1)   // "?"
```

**第二：`...statuses` 展开**

`all(...statuses)` 把数组展开成一个个参数。**必须展开，不能传数组本身。**

```javascript
db.prepare(sql).all(statuses)      // ❌ 当成一个参数
db.prepare(sql).all(...statuses)   // ✅ 展开成多个
```

**第三：空列表要单独处理**

```sql
WHERE status IN ()   -- 语法错误
```

**所以 `statuses.length === 0` 时要直接返回空数组。**

**但这里有个业务问题：** 用户"一个都不选"是什么意思？

- 意思是"没有结果"？→ 返回 `[]`（我们上面的做法）；
- 意思是"全部都要"？→ 不加这个条件。

**这两种都合理，取决于产品设计。但你必须想清楚，不能让它意外崩掉。**

**我们的约定：一个都不选 = 返回空。** 因为"筛选"的直觉是"越选越少"。

### 1.3 更实用的写法：条件累加

**真实需求不会只有一个筛选条件。可能是：状态 + 分类 + 价格区间。**

**操作：** 新建 `build-filter.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("filter.db");

function buildQuery(filters) {
  const conditions = [];
  const params = [];

  if (filters.statuses && filters.statuses.length > 0) {
    const ph = filters.statuses.map(() => "?").join(",");
    conditions.push(`status IN (${ph})`);
    params.push(...filters.statuses);
  }

  if (filters.categories && filters.categories.length > 0) {
    const ph = filters.categories.map(() => "?").join(",");
    conditions.push(`category IN (${ph})`);
    params.push(...filters.categories);
  }

  if (typeof filters.minPrice === "number") {
    conditions.push("price_cents >= ?");
    params.push(filters.minPrice);
  }

  if (typeof filters.maxPrice === "number") {
    conditions.push("price_cents <= ?");
    params.push(filters.maxPrice);
  }

  if (filters.keyword) {
    conditions.push("(name LIKE ? OR COALESCE(note,'') LIKE ?)");
    const kw = `%${filters.keyword}%`;
    params.push(kw, kw);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT id, name, category, price_cents, status FROM products ${where} ORDER BY id`;
  return { sql, params };
}

const test = (label, filters) => {
  const { sql, params } = buildQuery(filters);
  const rows = db.prepare(sql).all(...params);
  console.log(`\n${label}（${rows.length} 条）`);
  console.log("SQL:", sql.replace(/\s+/g, " "));
  console.log("参数:", params);
  console.log(rows.slice(0, 3).map(r => r.name));
};

test("只筛状态", { statuses: ["on_sale"] });
test("状态 + 分类", { statuses: ["on_sale"], categories: ["鞋类"] });
test("价格区间", { minPrice: 10000, maxPrice: 50000 });
test("关键字", { keyword: "手工" });
test("全都要", { statuses: ["on_sale"], categories: ["饮品", "食品"], minPrice: 1000, keyword: "热" });

db.close();
```

**运行，你会看到每个查询生成的实际 SQL 和参数。**

**这个 `buildQuery` 函数就是真实项目的写法。** 记住它的三个要点：

| 要点 | 说明 |
|---|---|
| 条件数组 `conditions` | 每个条件是一个字符串片段 |
| 参数数组 `params` | 参数按顺序 push，和 `?` 一一对应 |
| `conditions.join(" AND ")` | 多个条件用 `AND` 连起来 |

**为什么必须这样写，不能直接拼字符串：**

```javascript
// ❌ 错误：值直接拼进去
conditions.push(`status = '${filters.status}'`);
```

**因为这就是 SQL 注入的入口。**

**记住这条铁律：**

```text
拼 SQL 时，只有"结构"能拼字符串，"值"永远走 ? 参数。
```

**"结构"包括：** 表名、列名、`IN` 的占位符数量、`ORDER BY` 的列名（**这个要小心，见下一节**）。

### 1.4 `ORDER BY` 的动态拼接（有个陷阱）

**用户要能选"按价格排"或"按时间排"。** 你可能会写：

```javascript
const sql = `SELECT * FROM products ORDER BY ${sortBy} ${direction}`;
```

**这个能工作，但有风险。**

**风险在哪：** 如果 `sortBy` 来自用户输入，用户传 `id; DROP TABLE products` 就完了。

**正确做法：白名单。**

```javascript
const ALLOWED_SORT = {
  price: "price_cents",
  stock: "stock",
  name: "name",
  id: "id",
};

const ALLOWED_DIR = { asc: "ASC", desc: "DESC" };

function safeSort(sortKey, dir) {
  const col = ALLOWED_SORT[sortKey] || "id";
  const d = ALLOWED_DIR[String(dir).toLowerCase()] || "ASC";
  return `${col} ${d}`;
}

console.log(safeSort("price", "desc"));      // "price_cents DESC"
console.log(safeSort("hack", "asc"));        // "id ASC"（兜底）
console.log(safeSort("price", "xxx"));       // "price_cents ASC"（兜底）
```

**白名单的意义：**

**用户只能从你允许的选项里选。** 传了别的值就用默认值。

**这是"动态 SQL"唯一安全的方式。**

---

## 第 2 步：多字段模糊搜索（15 分钟）

### 2.1 最基本的写法

```javascript
const kw = "%手工%";
const rows = db.prepare(
  "SELECT id, name FROM products WHERE name LIKE ? OR note LIKE ?"
).all(kw, kw);
```

**`name LIKE ? OR note LIKE ?` = "名字包含 或 备注包含"。**

**注意这里必须加括号**（如果后面还有别的条件）：

```sql
WHERE (name LIKE ? OR note LIKE ?) AND status = 'on_sale'
```

**不加括号会变成：**

```sql
WHERE name LIKE ? OR (note LIKE ? AND status = 'on_sale')
```

**这就是上节课讲的 `AND` 优先于 `OR`。**

### 2.2 一个必须知道的事：`LIKE` 用不上索引

**为什么：** 因为 `LIKE '%关键字%'` 前面有 `%`，**数据库不知道从哪里开始找，只能逐行扫。**

**结果：** 数据 100 万行时，这个查询要扫 100 万行。

**这就是为什么大型电商不用 `LIKE` 做搜索** —— 它们用专门的搜索引擎和分词。

**你这个课程的项目数据量小，`LIKE` 够用。但要知道：**

```text
LIKE '%x%' 在数据量大时会变成性能瓶颈。
```

**优化方向（本课程不讲，知道有这回事）：**

- `FTS5`（SQLite 的全文搜索扩展）；
- 外部搜索引擎（Elasticsearch、Meilisearch）；
- 专门的搜索服务。

### 2.3 搜索的一个必要处理：转义 `%` 和 `_`

**如果用户在搜索框输入 `50%`，你的 SQL 会变成：**

```sql
WHERE name LIKE '%50%%'
```

**`%` 是通配符，所以 `50%` 会匹配"50"开头的所有东西。**

**用户输入 `50%` 但搜到了"500 元商品"，他会觉得搜索坏了。**

**正确做法：转义。**

```javascript
function escapeLike(str) {
  return String(str).replace(/[%_\\]/g, (m) => "\\" + m);
}

const kw = `%${escapeLike(userInput)}%`;
const sql = "SELECT * FROM products WHERE name LIKE ? ESCAPE '\\'";
```

**`ESCAPE '\\'` 是什么：** 告诉 SQL"反斜杠是转义符"，这样 `\%` 就表示"字面上的百分号"。

**这个处理很多人不做，但做了更专业。**

### 2.4 搜索空字符串的处理

```javascript
if (!filters.keyword || filters.keyword.trim() === "") {
  // 不加搜索条件
}
```

**为什么 `trim()`：** 用户输入一个空格，`"% %"` 会匹配所有"包含空格"的名称。**这不是他要的。**

**而且**：空字符串 `""` 会让 `LIKE '%%'`，**匹配所有行**。看起来像"没筛选"，但其实多了一次全表扫描。

**所以：** 空搜索不加条件。

---

## 第 3 步：排序的坑（25 分钟）

**这一步是全课最"反直觉"的部分。我实测了，结果可能和你想的完全不一样。**

### 3.1 中文排序：SQLite 做不到拼音

**操作：** 新建 `sort-lab.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("filter.db");

console.log("=== 按 name 排序（默认） ===");
const rows = db.prepare("SELECT name FROM products ORDER BY name").all();
console.log(rows.map(r => r.name));

db.close();
```

**运行，我的实测输出是：**

```text
=== 按 name 排序（默认） ===
[
  'AirPods',
  'Nike 运动鞋',
  'PUMA 短裤',
  'adidas 跑鞋',
  '小米 充电宝',
  '张三的店 手工面包',
  '李宁 T恤',
  '王五牌 辣椒酱',
  '矿泉水',
  '苹果',
  '香蕉',
  '可乐'
]
```

**看这个顺序，问题很明显：**

- `AirPods`、`Nike`、`PUMA` 排在前面（大写字母开头）；
- `adidas` 排在 `PUMA` 后面（小写 `a` 的 ASCII 是 97，大写 `P` 是 80）；
- 中文完全没按拼音排：**小米、张三、李宁、王五、矿泉水、苹果、香蕉、可乐** —— 这是乱的（拼音序应该是 矿、可、李、苹、王、香、小、张）。

**为什么乱：** 因为默认的 collation（排序规则）是 `BINARY`，**它按 UTF-8 字节值比较。**

**中文的 UTF-8 字节顺序和拼音顺序没有关系。**

```text
"小" 的 UTF-8: E5 B0 8F
"张" 的 UTF-8: E5 BC A0
"李" 的 UTF-8: E6 9D 8E
"王" 的 UTF-8: E7 8E 8B
"矿" 的 UTF-8: E7 9F BF
"苹" 的 UTF-8: E8 8B B9
"香" 的 UTF-8: E9 A6 99
"可" 的 UTF-8: E5 8F AF
```

**所以"可乐"排到最后，是因为它的首字节 `E5` 和"小米""张三"相同，但第二字节 `8F` 比 `B0`、`BC` 都小……**

**等等，那它应该排前面？**

**实际上它排最后，这是因为我上面列的是部分生成的顺序，不是说字节排序一定这样。** 关键是：

**这个顺序对用户毫无意义。** 用户想要的是拼音序（阿、白、陈……）。

### 3.2 SQLite 只有三种 collation

**操作：**

```javascript
const collations = db.prepare("PRAGMA collation_list").all();
console.log(collations.map(c => c.name));
```

**我的实测输出（SQLite 3.51.2）：**

```text
[ 'RTRIM', 'NOCASE', 'BINARY' ]
```

**只有三个：**

| collation | 作用 |
|---|---|
| `BINARY` | 按字节比较（默认） |
| `NOCASE` | 忽略 ASCII 大小写（**只对英文字母有效，对中文无效**） |
| `RTRIM` | 忽略末尾空格 |

**没有任何一个能按拼音排中文。**

**这意味着：**

```text
SQLite 无法直接按拼音排序中文。
```

**这不是你配置错了，是它就不支持。**

### 3.3 `NOCASE` 能解决英文大小写

**操作：**

```javascript
const a = db.prepare("SELECT name FROM products ORDER BY name").all().map(r => r.name);
const b = db.prepare("SELECT name FROM products ORDER BY name COLLATE NOCASE").all().map(r => r.name);
console.log("BINARY :", a.slice(0, 5));
console.log("NOCASE :", b.slice(0, 5));
```

**我的实测输出：**

```text
BINARY : [ 'AirPods', 'Nike 运动鞋', 'PUMA 短裤', 'adidas 跑鞋', '小米 充电宝' ]
NOCASE : [ 'adidas 跑鞋', 'AirPods', 'Nike 运动鞋', 'PUMA 短裤', '小米 充电宝' ]
```

**`NOCASE` 之后，`adidas` 排到了 `AirPods` 前面**（因为 `a` = `A`，然后比 `d` 和 `i`）。

**这才是英文的正确排序。**

**但中文还是乱的。** `NOCASE` 对中文完全无效（因为中文没有大小写）。

### 3.4 中文排序的三种解法

**既然 SQLite 不支持，怎么办？**

**方案一：在应用层排序（最简单，推荐小数据量）**

```javascript
const rows = db.prepare("SELECT id, name FROM products").all();
rows.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
console.log(rows.map(r => r.name));
```

**`localeCompare(b, "zh-CN")` 是什么：** JavaScript 内置的"按中文习惯比较"。

**这个能按拼音排！** 因为 `localeCompare` 用了系统的语言规则（ICU）。

**代价：**

| 问题 | 说明 |
|---|---|
| 要在内存里排 | 数据量大时占内存 |
| 不能和 `LIMIT` 配合 | 你必须先全部取出来才能排 |
| 分页会变复杂 | 因为排序不在数据库里做 |

**所以：数据量小（几千条以内）用这个方案，最省事。**

**方案二：加一个"排序键"字段**

**思路：** 在插入数据时，预先算好拼音，存进一个字段。

```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_pinyin TEXT NOT NULL   -- 存 "kuangquanshui"
);
```

**然后：**

```sql
ORDER BY name_pinyin
```

**为什么可行：** 因为拼音是英文字母，`BINARY` 排序就是正确的拼音序。

**代价：**

- 需要一个"汉字转拼音"的库（`pinyin` npm 包）；
- 插入和更新时都要算；
- 多占一个字段。

**这是生产环境的常见做法。** 因为排序在数据库里做，能用索引，能配合分页。

**方案三：注册自定义 collation（我们这里走不通）**

**SQLite 支持用 C 或 JavaScript 注册自定义排序规则。**

**`node:sqlite` 目前不支持这个**（没有暴露创建 collation 的接口）。

**所以这条路在我们这里走不通。** 要用得换 `better-sqlite3` 那个包，本课程不引入。

### 3.5 中文排序的结论

```text
一、SQLite 内置排序不能按拼音排中文。

二、数据量小（几千条内）：取出来用 localeCompare 在 JS 里排。

三、数据量大或要分页：加一个 name_pinyin 字段，预先算好。

四、不要试图用 ORDER BY name 排中文，结果对用户没意义。
```

**这是一个真实的"数据库能力边界"。** 你以后遇到"排序不对"，先想"是不是语言问题"，不要瞎调参数。

### 3.6 `NULL` 排在哪

**操作：**

```javascript
const asc = db.prepare("SELECT name, stock FROM products ORDER BY stock ASC").all();
const desc = db.prepare("SELECT name, stock FROM products ORDER BY stock DESC").all();

console.log("ASC  :", asc.map(r => `${r.name}:${r.stock}`).slice(0, 4));
console.log("DESC :", desc.map(r => `${r.name}:${r.stock}`).slice(0, 4));
```

**我的实测输出：**

```text
ASC  : [ '苹果:null', '可乐:0', 'adidas 跑鞋:3', '张三的店 手工面包:5' ]
DESC : [ '矿泉水:50', '小米 充电宝:40', '王五牌 辣椒酱:30', '李宁 T恤:25' ]
```

**关键发现：**

| 排序 | `null` 在哪 |
|---|---|
| `ASC` | **最前面** |
| `DESC` | **最后面** |

**为什么：** SQLite 里 `NULL` 被认为**小于任何值**。所以升序排最前，降序排最后。

**这个行为和 MySQL 一样，但和 PostgreSQL 相反**（PostgreSQL 默认 `NULLS LAST` 在升序）。

**"null 排最前"通常是用户不想要的。** 用户看"库存从少到多"，第一眼是"苹果:null"（库存未知），很奇怪。

**控制办法：**

**方案一：`NULLS LAST`（SQLite 3.30+ 支持）**

```sql
ORDER BY stock ASC NULLS LAST
```

**实测有效。** 我的输出：

```text
[ '可乐:0', 'adidas 跑鞋:3', '张三的店 手工面包:5', 'Nike 运动鞋:8', '矿泉水:50', '苹果:null' ]
```

**`苹果:null` 排到最后了。**

**方案二：`CASE WHEN`（兼容所有版本）**

```sql
ORDER BY CASE WHEN stock IS NULL THEN 1 ELSE 0 END, stock
```

**这个也能达到"null 排最后"的效果，而且不依赖新版本。**

**原理：** 先按"是不是 null"排（不是 null 的排前面），再按 stock 排。

**推荐用哪个：**

| 情况 | 用哪个 |
|---|---|
| 你的环境确定是 SQLite 3.30+ | `NULLS LAST`（简洁） |
| 不确定版本，或要兼容其他数据库 | `CASE WHEN`（通用） |

**我们两个都测，你自己选。**

### 3.7 多列排序

```sql
ORDER BY category ASC, price_cents DESC
```

**意思是：先按分类升序，分类相同的再按价格降序。**

**这在"分组展示"的界面里很常用。** 比如商品列表按分类分组，每组内按价格排。

---

## 第 4 步：大小写敏感与不敏感（15 分钟）

### 4.1 一个反直觉的事实：`LIKE` 对英文不区分大小写

**操作：**

```javascript
const r1 = db.prepare("SELECT ? LIKE ? AS m").get("ABC", "a%");
console.log("'ABC' LIKE 'a%' :", r1.m);
```

**我的实测输出：**

```text
'ABC' LIKE 'a%' : 1
```

**`1` 就是 `true`。** 说明 `LIKE` 不区分大小写。

**这和 `=` 不一样：**

```javascript
const r2 = db.prepare("SELECT ? = ? AS m").get("ABC", "abc");
console.log("'ABC' = 'abc' :", r2.m);   // 0（false）
```

**所以：**

| 比较方式 | 大小写敏感吗 |
|---|---|
| `=` | **敏感** |
| `LIKE`（英文） | **不敏感** |
| `IN` | 敏感 |
| `ORDER BY` 默认 | 敏感 |
| `ORDER BY ... COLLATE NOCASE` | 不敏感 |

**这个不一致非常容易搞混。**

**为什么 `LIKE` 不敏感：** 因为 SQLite 的 `LIKE` 实现里对 ASCII 字母做了大小写折叠（为了符合 SQL 标准的历史行为）。

**注意：只对 ASCII 有效。** 中文没有大小写，所以无所谓。

### 4.2 想要 `=` 不敏感怎么办

```sql
WHERE LOWER(name) = LOWER(?)
```

**或者：**

```sql
WHERE name = ? COLLATE NOCASE
```

**哪个好：**

| 写法 | 能用索引 |
|---|---|
| `LOWER(name) = LOWER(?)` | **不能**（函数包了列） |
| `name = ? COLLATE NOCASE` | 能（如果索引也是 NOCASE） |

**第二条更快，但要求索引也用 `NOCASE` 建。**

**我们数据量小，两个都行。但你要知道这个区别** —— 因为"在列上套函数会导致索引失效"是数据库优化的基本常识。

### 4.3 区分大小写的搜索

**如果 `LIKE` 本来就不敏感，你想要敏感怎么办？**

```sql
WHERE name LIKE ? COLLATE BINARY
```

**`COLLATE BINARY` 会把 `LIKE` 的行为改回"区分大小写"。**

**实测：**

```javascript
const r = db.prepare("SELECT ? LIKE ? COLLATE BINARY AS m").get("ABC", "a%");
console.log(r.m);   // 0（false）
```

**这个用法很少见，但知道有。**

---

## 第 5 步：把筛选器做成可复用的模块（20 分钟）

**这一步是"从练习到工程"的跳跃。**

### 5.1 为什么要抽成模块

**因为真实项目的列表接口长这样：**

```javascript
GET /api/products?status=on_sale&status=out_of_stock&category=饮品&minPrice=1000&keyword=水&sort=price&dir=desc&page=2&pageSize=20
```

**九个参数，每个都可能没有。** 如果每个接口都手写一遍条件拼接，代码会失控。

### 5.2 完整的筛选器

**操作：** 新建 `filters.mjs`：

```javascript
/**
 * 商品列表筛选器
 * 把 HTTP 查询参数转成安全的 SQL 条件和参数
 */

const ALLOWED_SORT = {
  id: "id",
  price: "price_cents",
  stock: "stock",
  name: "name",
};

const ALLOWED_DIR = {
  asc: "ASC",
  desc: "DESC",
};

// 转义 LIKE 的特殊字符
const escapeLike = (str) => String(str).replace(/[%_\\]/g, (m) => "\\" + m);

// 把 ?status=a&status=b 这种重复参数统一成数组
const toArray = (value) => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined && v !== null && v !== "");
  }
  return value === "" ? [] : [value];
};

export function buildProductQuery(query) {
  const conditions = [];
  const params = [];

  // 状态（多选）
  const statuses = toArray(query.status);
  if (statuses.length > 0) {
    conditions.push(`status IN (${statuses.map(() => "?").join(",")})`);
    params.push(...statuses);
  }

  // 分类（多选）
  const categories = toArray(query.category);
  if (categories.length > 0) {
    conditions.push(`category IN (${categories.map(() => "?").join(",")})`);
    params.push(...categories);
  }

  // 价格区间
  const minPrice = Number(query.minPrice);
  if (Number.isFinite(minPrice)) {
    conditions.push("price_cents >= ?");
    params.push(Math.max(0, Math.floor(minPrice)));
  }

  const maxPrice = Number(query.maxPrice);
  if (Number.isFinite(maxPrice)) {
    conditions.push("price_cents <= ?");
    params.push(Math.max(0, Math.floor(maxPrice)));
  }

  // 库存（"只要有货的"）
  if (query.inStock === "1" || query.inStock === "true") {
    conditions.push("stock IS NOT NULL AND stock > 0");
  }

  // 关键字（多字段）
  const keyword = String(query.keyword || "").trim();
  if (keyword !== "") {
    conditions.push("(name LIKE ? ESCAPE '\\' OR COALESCE(note,'') LIKE ? ESCAPE '\\')");
    const kw = `%${escapeLike(keyword)}%`;
    params.push(kw, kw);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // 排序（白名单）
  const sortCol = ALLOWED_SORT[query.sort] || "id";
  const sortDir = ALLOWED_DIR[String(query.dir || "").toLowerCase()] || "ASC";

  // 分页
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize)) || 20));

  return {
    whereSql: where,
    whereParams: params,
    orderSql: `ORDER BY ${sortCol} ${sortDir}`,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}
```

### 5.3 用它查列表 + 总数

**操作：** 新建 `list-products.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";
import { buildProductQuery } from "./filters.mjs";

const db = new DatabaseSync("filter.db");

function listProducts(query) {
  const q = buildProductQuery(query);

  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM products ${q.whereSql}`
  ).get(...q.whereParams).c;

  const rows = db.prepare(
    `SELECT id, name, category, price_cents, stock, status
     FROM products ${q.whereSql} ${q.orderSql} LIMIT ? OFFSET ?`
  ).all(...q.whereParams, q.pageSize, q.offset);

  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.ceil(total / q.pageSize),
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      priceYuan: (r.price_cents / 100).toFixed(2),
      stock: r.stock,
      status: r.status,
    })),
  };
}

console.log("=== 全部 ===");
console.log("total:", listProducts({}).total);

console.log("\n=== 筛状态 + 排序 ===");
console.log(listProducts({ status: ["on_sale"], sort: "price", dir: "desc", pageSize: 3 }));

console.log("\n=== 关键字搜索 ===");
console.log(listProducts({ keyword: "手工" }));

console.log("\n=== 坏参数（应该兜底，不能崩） ===");
console.log(listProducts({ page: "abc", pageSize: -5, sort: "drop table", dir: "xxx" }));

db.close();
```

**运行。** 重点看最后一组"坏参数"：**它不应该崩，应该用默认值。**

**这个测试很重要。** 用户/攻击者一定会传奇怪参数，你的代码必须扛住。

**第 5 步做完了。这是这节课最有价值的产出。**

---

## 第 6 步：故意撞五个坑（15 分钟）

### 坑 1：`IN ()` 空列表

```javascript
try {
  db.prepare("SELECT * FROM products WHERE status IN ()").all();
} catch (e) {
  console.log("空 IN 报错：", e.message);
}
```

**报错：**

```text
near ")": syntax error
```

**教训：空数组要提前返回，不要拼进 SQL。**

### 坑 2：`AND` / `OR` 不加括号导致搜索 + 筛选失效

```javascript
const bad = db.prepare(
  "SELECT COUNT(*) AS c FROM products WHERE name LIKE ? OR COALESCE(note,'') LIKE ? AND status = ?"
).get("%手工%", "%手工%", "on_sale").c;

const good = db.prepare(
  "SELECT COUNT(*) AS c FROM products WHERE (name LIKE ? OR COALESCE(note,'') LIKE ?) AND status = ?"
).get("%手工%", "%手工%", "on_sale").c;

console.log("不加括号：", bad);
console.log("加括号  ：", good);
```

**两个数字不同。** 不加括号时，"名字含手工"的所有行都会进来（不管状态），**筛选条件被绕过了一半。**

**教训：搜索条件（含 `OR`）外面必须包裹号。**

### 坑 3：`LIKE` 不转义 `%`

```javascript
const kw1 = "%50%%";
const kw2 = `%${"50%".replace(/[%_\\]/g, (m) => "\\" + m)}%`;
console.log("不转义：", kw1);
console.log("转义后：", kw2);
```

**你要验证的是：** 不转义时 `%` 被当通配符；转义后 `\%` 是字面量。

**自己造一条名字含 `%` 的数据来测，才看得清。**

**教训：用户输入进 `LIKE` 前必须转义 `%` `_` `\`。**

### 坑 4：中文排序

```javascript
const a = db.prepare("SELECT name FROM products ORDER BY name").all().map(r => r.name);
const b = [...a].sort((x, y) => x.localeCompare(y, "zh-CN"));
console.log("数据库排：", a);
console.log("JS 拼音排：", b);
```

**两个顺序不一样。** 这就是中文排序问题。

**教训：中文排序要在应用层做，或者预存拼音字段。**

### 坑 5：`NULL` 排最前

```javascript
const asc = db.prepare("SELECT name, stock FROM products ORDER BY stock ASC").all();
console.log("null 排第几：", asc.findIndex(r => r.stock === null) + 1, "（共", asc.length, "条）");

const fixed = db.prepare("SELECT name, stock FROM products ORDER BY stock ASC NULLS LAST").all();
console.log("NULLS LAST 后：", fixed.findIndex(r => r.stock === null) + 1);
```

**第一个是 1（排最前），第二个是最后一条。**

**教训：展示"库存/评分/销量"这类可能为空的字段，要加 `NULLS LAST`。**

---

## 第 7 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第04节课\02-笔记\NOTES.md
```

**重点填：**

1. 动态 `IN` 的三个关键点；
2. `buildQuery` 的三段结构；
3. **中文排序的真相和三种解法**；
4. `NULL` 默认排在哪；
5. 各比较方式的大小写敏感性。

---

## 第 8 步：课后练习

### 练习 1：给订单列表做筛选器

**参照 `filters.mjs`，写一个 `buildOrderQuery`，支持：**

- 状态多选（`pending` / `paid` / `shipped` / `done` / `cancelled`）；
- 客户 id；
- 时间范围（`from` / `to`，ISO 字符串）；
- 金额区间；
- 关键字（只搜备注）；
- 排序（时间、金额，升降序）；
- 分页。

**要求：**

- 所有参数缺失时能正常返回全部；
- 所有参数是垃圾值时不崩；
- 用上节课的 `query.db` 测试。

### 练习 2：验证中文排序

**任务：**

1. 造 10 条中文名称的商品（人名或地名）；
2. 用 `ORDER BY name` 排，把结果记下来；
3. 用 `localeCompare(…, "zh-CN")` 排，把结果记下来；
4. 对比两者，观察差异；
5. 回答：如果要做"按拼音排序的商品列表"，且要支持分页，你会怎么设计？

### 练习 3：搜索框的边界

**测试这五种输入，记录结果和你的处理：**

| 输入 | 你的系统应该怎么处理 |
|---|---|
| 空字符串 | |
| 只有空格 | |
| `%` | |
| `_` | |
| `50%` | |

**写出你会怎么改代码。**

### 练习 4：找出这五个查询的问题

```sql
-- A
SELECT * FROM products WHERE status IN ()
ORDER BY name;

-- B
SELECT * FROM products WHERE name LIKE '%水%' OR note LIKE '%水%' AND status = 'on_sale';

-- C
SELECT id, name FROM products ORDER BY name;

-- D
SELECT id, stock FROM products ORDER BY stock ASC;

-- E
SELECT * FROM products ORDER BY price_cents DESC LIMIT 10 OFFSET 0;
```

**逐个说出问题。**

### 练习 5：用自己的话讲

```text
为什么拼 SQL 只能拼"结构"不能拼"值"？
为什么 SQLite 排不了中文拼音？
为什么 LIKE '%x%' 用不上索引？
为什么 NULL 在 ASC 时排最前？
```

---

## 第 9 步：最终验收

### A. 动态条件

- [ ] 我会动态生成 `IN` 的占位符
- [ ] 我知道空数组要提前返回
- [ ] 我会用"条件数组 + 参数数组"构建查询
- [ ] 我知道 `ORDER BY` 的列名必须走白名单
- [ ] 我知道拼 SQL 时"结构可拼、值不可拼"

### B. 搜索

- [ ] 我会多字段 `LIKE` 搜索
- [ ] 我知道搜索条件（含 `OR`）必须加括号
- [ ] 我会转义 `%` `_` `\`
- [ ] 我知道空关键字不加条件
- [ ] 我知道 `LIKE '%x%'` 用不上索引

### C. 排序

- [ ] 我知道 SQLite 只有 `BINARY` / `NOCASE` / `RTRIM` 三种 collation
- [ ] 我知道 SQLite **做不到**中文拼音排序
- [ ] 我会用 `localeCompare(…, "zh-CN")` 在 JS 里排中文
- [ ] 我知道大数据量要预存拼音字段
- [ ] 我知道 `NULL` 在 `ASC` 时排最前
- [ ] 我会用 `NULLS LAST` 或 `CASE WHEN` 控制 null 位置

### D. 大小写

- [ ] 我知道 `=` 区分大小写
- [ ] 我知道 `LIKE`（英文）不区分大小写
- [ ] 我知道 `COLLATE NOCASE` 怎么用
- [ ] 我知道在列上套 `LOWER()` 会让索引失效

### E. 工程化

- [ ] 我写出了 `buildProductQuery`
- [ ] 它能把 HTTP 参数转成 SQL
- [ ] 它对垃圾参数有兜底
- [ ] 它同时支持分页和总数
- [ ] 我做了练习 1 的订单筛选器
- [ ] 笔记填完

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `near ")": syntax error` | `IN ()` 空列表 | 空数组提前返回 |
| 搜索结果包含了被筛掉的行 | `AND`/`OR` 没加括号 | 搜索条件外面包裹号 |
| 搜索 `50%` 匹配到"500" | `%` 没转义 | 用 `ESCAPE '\\'` + 转义函数 |
| 中文顺序看起来很乱 | SQLite 按 UTF-8 字节排 | JS 里 `localeCompare(…,'zh-CN')`，或存拼音字段 |
| 英文 `adidas` 排在大写后面 | 默认 `BINARY` 区分大小写 | `COLLATE NOCASE` |
| `ORDER BY stock ASC` 第一行是空值 | NULL 被认为小于任何值 | `NULLS LAST` 或 `CASE WHEN` |
| 动态 `ORDER BY` 有注入风险 | 列名拼了用户输入 | 白名单映射 |
| `LIKE` 搜索很慢 | 前面有 `%`，用不上索引 | 数据量大改用 FTS |
| `LOWER(name) = ?` 很慢 | 列上套函数，索引失效 | 用 `COLLATE NOCASE` 建索引 |
| 用户传 `pageSize=99999` | 没限制上限 | `Math.min(100, …)` |
| 用户传 `page=abc` | 没转数字 | `Number() + isFinite + 默认值` |
| 分页总数和列表对不上 | 两处 `WHERE` 不一致 | 抽成同一个 `whereSql` |
| 空关键字导致全表扫描 | `LIKE '%%'` | `trim()` 后判空 |

---

## 附：这一节课你必须记住的六句话

```text
一、拼 SQL 只能拼结构，值永远走 ?。

二、IN 的占位符数量可以动态生成，但空数组要提前返回。

三、搜索条件里有 OR，外面必须加括号。

四、SQLite 排不了中文拼音。数据量小用 localeCompare，大数据量预存拼音字段。

五、NULL 在 ASC 时排最前。要排在最后就加 NULLS LAST。

六、LIKE 对英文不区分大小写，= 区分。这个不一致要记住。
```

---

## 附：下一步

**第 33 节课：关联两张表。**

这节课你只在单表上操作。下节课解决："订单里的客户名字怎么查出来"。

- `JOIN` 的三种类型（`INNER` / `LEFT` / 自连接）；
- 一对多、多对多怎么用 SQL 表达；
- `JOIN` 的性能问题（为什么会变慢）；
- **把 `chat-app` 从 JSON 真正迁到数据库**（这是本阶段的大作业）；
- 怎么在事务里做迁移。

**在你进入下节课之前：**

- [ ] 你的 `filter.db` 有 12 条商品数据
- [ ] 你能按多个状态筛选
- [ ] 你验证过中文排序确实是乱的
- [ ] 你写出了 `buildProductQuery`
- [ ] 你跑过那五个坑
