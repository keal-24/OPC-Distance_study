# 第 29 节课：认识数据库表

## 本节课要解决的问题

第 19 节课你用过 JSON 文件存数据。它有个要命的问题：**两个人同时写，数据会丢。**

我实测过：同时发 23 条消息，最后文件里只剩 2 条。

**这节课开始学数据库。** 它不是"更高级的文件"，它是专门解决"多人同时读写"这件事的工具。

**这节课你会学到：**

- 数据库、表、行、列到底是什么（用 Excel 类比，但要说清哪里不一样）；
- 为什么不用 JSON 文件了（四个真实局限，有实测数字）；
- 怎么在**不装任何软件**的前提下跑起一个真数据库（Node 22 自带 SQLite）；
- 亲手建第一张表，插第一条数据，查出来看到；
- 那些 `[Object: null prototype]` 和 `ExperimentalWarning` 是什么，要不要管。

**这节课不学：** SQL 的增删改查语法（下节课）、多表关联（第 33 节）、索引和优化（第 34 节之后）、把项目从 JSON 换成数据库（第 33 节）。

**需要多久：** 80 分钟。

---

## 第 0 步：为什么 JSON 文件不够用（15 分钟）

**这一步不写代码。** 但它是整周的地基，跳过它你后面只会"照着敲命令"，不知道自己在干什么。

### 0.1 回顾第 19 节课那个实验

**如果你做过第 19 节课的并发测试，你会记得这个结果：**

```text
并发测试：应有 23 条，实际 2 条
```

**23 条数据，只存进去 2 条，丢了 21 条。**

**而且 `nextId` 只涨到 4。** 连计数器都被覆盖了。

**为什么会这样：**

```text
23 个写入几乎同时开始
  ↓
它们几乎同时读取文件，都读到同一个旧状态
  ↓
各自在内存里加一条
  ↓
各自写回文件
  ↓
最后写的那个，覆盖了前面所有
```

**这个现象有个正式名字：竞态条件（race condition）。**

**注意：这不是"你的代码写得烂"。** 是"用文件当数据库"这件事本身做不到并发安全。

### 0.2 JSON 文件当数据库的四个硬伤

| 硬伤 | 具体表现 | 什么时候会要命 |
|---|---|---|
| **并发丢数据** | 同时写会互相覆盖 | 只要有两个用户同时操作 |
| **查询慢** | 每次都要把整个文件读进内存 | 数据超过几千条 |
| **改结构要手改代码** | 加一个字段，所有旧数据都没有这个字段 | 需求一变就痛 |
| **没有约束** | 你可以在"年龄"字段写"香蕉" | 数据一脏就查不出来 |

**逐个说清楚：**

**硬伤一：并发丢数据**

这是最致命的。**一个只能给一个人用的系统，不是产品。**

真实场景：

- 两个人同时下单，库存只减了一次 → 超卖；
- 两个管理员同时改同一个商品价格 → 一个的修改凭空消失；
- 用户发消息和系统写日志撞在一起 → 日志没了。

**硬伤二：查询慢**

JSON 文件的查询方式是这样的：

```javascript
const all = JSON.parse(读整个文件);        // 全部加载
const result = all.filter(x => x.id === 5); // 再筛选
```

**哪怕你只要 1 条，也得先把 10 万条读进内存。**

**数据库不一样：** 它有索引，能直接跳到第 5 条，不用读其他的。

**硬伤三：改结构要手改代码**

假设你的 `messages.json` 长这样：

```json
{ "id": 1, "text": "你好" }
```

**现在要加一个 `author` 字段。旧数据没有这个字段。**

你必须在代码里到处写：

```javascript
const author = msg.author || "匿名";   // 兼容旧数据
```

**这种"兼容代码"会越来越多，最后整个项目全是 `||` 和 `??`。**

**数据库有 schema（表结构），改结构时有专门的工具（迁移），旧数据能被批量补齐。**

**硬伤四：没有约束**

JSON 文件里，你可以写：

```json
{ "id": 1, "price": "香蕉" }
```

**没有任何东西会阻止你。** 直到某天你算总价，得到 `NaN`，然后花三小时找原因。

**数据库可以规定：`price` 必须是整数。** 写错类型直接拒绝，根本存不进去。

### 0.3 数据库解决的就是这四件事

| JSON 的硬伤 | 数据库怎么解决 |
|---|---|
| 并发丢数据 | **事务 + 锁**：写操作排队，要么全成功要么全失败 |
| 查询慢 | **索引**：像书的目录，直接跳到要找的那页 |
| 改结构难 | **schema + 迁移**：结构是显式定义的，能改 |
| 没有约束 | **约束**：类型、非空、唯一、范围，都能强制 |

**这四个词你以后会反复听到：事务、索引、schema、约束。**

**这节课先把"表"搞清楚，后面几节课逐个讲这四个。**

### 0.4 一个必须建立的认知

**数据库不是"存数据的地方"，是"保证数据正确的规则集合"。**

**这句话很重要，我举个对比例子：**

| 你把数据放哪 | 谁保证"库存不能是负数" |
|---|---|
| JSON 文件 | **你的代码**。你忘了判断，就超卖 |
| 数据库 | **数据库本身**。你写 `CHECK (stock >= 0)`，它就拒绝 |

**区别在哪：** 代码可以有十个地方改库存，你只要有一个地方忘了判断，就出事。**约束写在数据库里，只有一份，谁也绕不过去。**

**这就是"数据库更可靠"的真正含义。** 不是它更快（虽然通常也更快），是**它不依赖你每次都记得**。

---

## 第 1 步：确认你的工具能用（10 分钟）

**为什么不需要装数据库软件：**

传统教程会让你装 MySQL、PostgreSQL、Navicat。那些东西对小白是灾难：

- 装完要配服务、配端口、配账号密码；
- 装错了卸载不干净；
- 光是"连不上数据库"就能卡三天。

**我们不用那些。** Node 22 内置了 SQLite，一行 `import` 就能用。

**SQLite 是什么：** 一个"不需要服务器"的数据库。整个数据库就是**一个文件**（比如 `shop.db`）。

**它够用吗：** 手机 App、桌面软件、小型网站，大量在用 SQLite。**对学习和小项目，完全够。**

### 1.1 确认 Node 版本

**操作：** 打开终端（任意位置），输入：

```text
node -v
```

**应该看到：**

```text
v22.22.2
```

**你的版本号可能不同，但必须是 `v22` 或更高。**

**为什么必须是 22：** `node:sqlite` 是 Node 22 才正式加入的。22 以下没有这个模块。

**如果低于 22：**

1. 去 https://nodejs.org 下载最新的 LTS 版本；
2. 安装时一路下一步；
3. **装完必须关掉所有终端窗口，重新打开**，再跑 `node -v`。

**这一步不做，后面全卡住。**

### 1.2 确认数据库模块可用

**操作：** 输入：

```text
node -e "const s = require('node:sqlite'); console.log('可用', Object.keys(s).join(','))"
```

**应该看到：**

```text
可用 DatabaseSync,StatementSync,constants,backup
```

**同时上面还有一行警告：**

```text
(node:50560) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

**这个警告要不要管：**

**不用管，也不影响使用。** 它的意思是"这个功能还在实验阶段，以后接口可能会变"。

**为什么会有这个警告：** Node 团队对"还没完全定稿的功能"都会加这个提示，**它是一种谨慎，不是"你不能用"。**

**如果你觉得它烦，可以屏蔽：**

```text
node --no-warnings your-file.mjs
```

**`--no-warnings` 是"不显示警告"。**

**但我建议你留着它。** 因为你以后再看到别的警告，就知道"该看还是要看"，而不是习惯性无视。

**如果报 `Cannot find module 'node:sqlite'`：**

说明你的 Node 版本低于 22。回到 1.1。

### 1.3 建本节课的文件夹

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第01节课\03-练习代码
   ```

2. 空白处右键 → 新建 → 文件夹，名字：

   ```text
   db-lab
   ```

3. 双击进去，点地址栏，输入 `cmd`，按 `Enter`。
4. 输入 `cd` 确认路径里有 `db-lab`。

**应该看到：** 命令行提示符前面是 `...\db-lab>`。

**第 1 步做完了。工具确认可用。**

---

## 第 2 步：数据库、表、行、列是什么（20 分钟）

**这一步全是概念。但我会用你熟悉的东西对照，你不会觉得抽象。**

### 2.1 用 Excel 类比

**如果你用过 Excel，那你就已经懂数据库的一半了。**

| Excel | 数据库 | 说明 |
|---|---|---|
| 一个 `.xlsx` 文件 | 一个**数据库**（database） | 装所有表的容器 |
| 一个工作表（Sheet） | 一张**表**（table） | 一类数据放一张表 |
| 一行 | 一行**记录**（row / record） | 一个具体对象 |
| 一列 | 一个**字段**（column / field） | 一种属性 |
| 表头 | **schema**（表结构） | 规定每列叫什么、什么类型 |

**具体到我们的例子：**

```text
数据库：shop.db              ← 一个文件
  └─ 表：products            ← 商品表
       ├─ 列：id             ← 编号
       ├─ 列：name           ← 名称
       ├─ 列：price_cents    ← 价格（分）
       └─ 列：stock          ← 库存
```

**表里的一行就是一件商品：**

| id | name | price_cents | stock |
|---|---|---|---|
| 1 | 矿泉水 | 200 | 50 |
| 2 | 面包 | 850 | 30 |

**每一行 = 一件商品，每一列 = 这件商品的一个属性。**

### 2.2 但数据库和 Excel 有四个关键区别

**这四个区别决定了"为什么不用 Excel 管数据"。**

**区别一：数据库的列有类型，Excel 没有**

在 Excel 里，你可以在"价格"那一列写 `200`，下一行写 `两百块`，再下一行写 `=A1*2`。**Excel 全都接受。**

**数据库的整体设计是"列有指定类型"。** 但要注意——**SQLite 在这里是宽松的**（下面第 5 步会实测给你看）。

**区别二：数据库有主键，Excel 没有**

**主键（primary key）是什么：** 一个能唯一标识这一行的字段。

我们的表里 `id` 就是主键。**它保证：**

- 每行的 `id` 都不一样；
- `id` 不会是空；
- 你能用 `id` 精确找到某一行。

**Excel 里没有这个东西。** 你有两行一模一样的数据，Excel 认为它们都是合法的。**你没法说"我要第 3 行那条"——因为它可能是任意一条。**

**区别三：数据库可以被多个人同时用，Excel 不行**

**Excel 被一个人打开时，别人打开是只读的。** 数据库不是，几十个人同时读写都没问题（靠事务）。

**区别四：数据库能用 SQL 提问，Excel 只能手动筛选**

**SQL 是什么：** Structured Query Language，结构化查询语言。就是"向数据库提问的语言"。

**它长这样：**

```sql
SELECT name, price_cents FROM products WHERE stock < 10
```

**这句话的意思是：** "从 `products` 表里，找出 `stock` 小于 10 的那些行，只要 `name` 和 `price_cents` 两列。"

**用 Excel 你得：** 点筛选 → 点库存列的漏斗 → 选"小于" → 输入 10 → 确定。

**用 SQL 你写一句话。** 好处是：**这句话可以存进代码里，每次自动跑。**

### 2.3 表怎么设计：一个必须遵守的规矩

**新手最容易犯的错：把一张表塞满所有东西。**

**错误示范（一张表管所有）：**

| id | 商品名 | 客户名 | 客户电话 | 订单金额 |
|---|---|---|---|---|
| 1 | 矿泉水 | 小明 | 138xxx | 200 |
| 2 | 面包 | 小红 | 139xxx | 850 |
| 3 | 矿泉水 | 小红 | 139xxx | 200 |

**问题在哪：**

- 小红买了两次，她的电话存了两遍。**改电话要改两处，漏一处就不一致。**
- 矿泉水出现两次，名字存了两遍。**改名要改两处。**
- 你没法单独查"所有客户"，因为它们混在订单里。

**正确做法：拆成三张表。**

```text
customers（客户表）
  id | name | phone

products（商品表）
  id | name | price_cents | stock

orders（订单表）
  id | customer_id | product_id | qty | total_cents
```

**注意 `orders` 表里的 `customer_id` 和 `product_id`：它们不是名字，是"指向另一张表的编号"。**

**这个东西叫"外键"（foreign key）。** 第 33 节课会详细讲。

**为什么要这样拆：**

| 好处 | 具体 |
|---|---|
| 不重复 | 小红的电话只存一次，改一处就全对 |
| 能单独查 | 可以只要"所有客户"，不用从订单里捞 |
| 不会自相矛盾 | 电话只有一个来源，不会出现两个不同号码 |

**这个原则叫"数据库范式"。** 名字很吓人，但核心就一句话：

> **同一条信息只存一个地方。**

**记住这一句就够了。** 后面遇到"这个字段该放哪张表"，就问自己"这条信息是不是已经在别处存过了"。

### 2.4 命名：为什么字段名要用下划线

**看我们的表：**

```text
id, name, price_cents, stock
```

**注意 `price_cents` 用的是下划线，不是 `priceCents`。**

**为什么和 JavaScript 不一样：**

| 场景 | 风格 | 例子 |
|---|---|---|
| JavaScript 变量 | camelCase | `priceCents` |
| 数据库字段 | snake_case | `price_cents` |

**这是行业惯例。** 原因很实际：

- SQL 是**大小写不敏感**的。`priceCents` 和 `pricecents` 在有些数据库里被当成同一个名字，容易出错；
- 下划线在 SQL 里绝对不会引起歧义。

**你要接受一件事：代码里会有两种风格并存。**

```javascript
const row = db.prepare("SELECT price_cents FROM products").get();
const priceCents = row.price_cents;   // 数据库给的是下划线
```

**这个"转换"在真实项目里很常见。** 有些团队会写一个转换函数，有些就手动写。**你只要知道为什么不一样，别到时候以为是 bug。**

### 2.5 一个自测

**不看上面，回答这三个问题：**

1. 数据库、表、行、列，分别对应 Excel 里的什么？
2. 为什么主键必须唯一、不能为空？
3. "同一条信息只存一个地方"，如果违反了会出什么问题？

**答不出来就回去再看一遍。** 这三条是后面所有内容的地基。

**第 2 步做完了。**

---

## 第 3 步：建你的第一张表（20 分钟）

**现在开始动手。**

### 3.1 新建文件

**操作：**

1. 在 `db-lab` 文件夹里，空白处右键 → 新建 → 文本文档。
2. 文件名改成：

   ```text
   first-table.mjs
   ```

3. 弹出扩展名提示，点"**是**"。
4. 用 Visual Studio Code 打开。

**注意扩展名是 `.mjs` 不是 `.js`。**

**`.mjs` 是什么：** 明确告诉 Node "这个文件用 ES Module 语法"（也就是能用 `import`）。

**为什么用 `.mjs` 而不是建 `package.json` 配 `type: module`：**

因为我们在练手，一个文件搞定最省事。**建 `package.json` 那套在第 16 节课学过，正式项目里用那个。**

**如果你习惯用 `.js`：** 也可以，但必须在 `db-lab` 里建一个 `package.json`，里面写 `"type": "module"`。**不建的话 `import` 会报错。**

**这节课我们统一用 `.mjs`，省掉这一步。**

### 3.2 敲第一段代码

**操作：自己一个字符一个字符敲下面这段**（不要复制）：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("shop.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
  )
`);

console.log("表建好了");

db.close();
```

**保存（`Ctrl + S`）。**

### 3.3 运行

**操作：** 终端里输入：

```text
node first-table.mjs
```

**应该看到：**

```text
表建好了
```

**上面可能还有一行 `ExperimentalWarning`，忽略它。**

**如果看到 `表建好了`，你已经建出人生第一个数据库表了。**

### 3.4 逐行读懂这段代码

**这一段必须逐行读。因为后面所有课都建立在这几行上。**

**第 1 行：**

```javascript
import { DatabaseSync } from "node:sqlite";
```

| 部分 | 意思 |
|---|---|
| `import` | 引入外部功能 |
| `{ DatabaseSync }` | 只要这个模块里的 `DatabaseSync` 这一个东西（大括号 = 精确引入） |
| `from "node:sqlite"` | 从 Node 内置的 `sqlite` 模块里拿 |
| `node:` 前缀 | 明确表示"这是 Node 自带的，不是 npm 装的" |

**为什么加 `node:` 前缀：** 不加也能用，但加了更明确。**而且以后如果你装了一个同名的 npm 包，加前缀能避免冲突。**

**第 3 行：**

```javascript
const db = new DatabaseSync("shop.db");
```

| 部分 | 意思 |
|---|---|
| `new DatabaseSync(...)` | 创建一个数据库连接对象 |
| `"shop.db"` | 数据库文件名 |

**这一行做了什么：**

- 如果 `shop.db` **不存在**，**自动创建**它；
- 如果**存在**，**打开**它。

**你现在去 `db-lab` 文件夹看一眼，应该多了一个 `shop.db` 文件。**

**`Sync` 是什么意思：** synchronous，同步。意思是"代码执行到这句就等它做完，再往下走"。

**为什么不异步：** 因为 SQLite 是本地文件，速度快到感觉不出来。**同步写法更简单，不容易出错。**

**第 5—11 行：**

```javascript
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
  )
`);
```

**`db.exec()` 是什么：** 执行一段 SQL，**不返回结果**。用来建表、改结构这种"不需要看返回值"的操作。

**整个 SQL 语句逐词读：**

| 部分 | 意思 |
|---|---|
| `CREATE TABLE` | 创建一张表 |
| `IF NOT EXISTS` | 如果不存在才建（存在就跳过，不报错） |
| `products` | 表的名字 |
| `(` ... `)` | 括号里是每一列的定义 |

**每一列的定义：**

| 列 | 定义 | 意思 |
|---|---|---|
| `id INTEGER PRIMARY KEY AUTOINCREMENT` | 整数、主键、自动递增 | 每插一行，自动给一个 1、2、3…… |
| `name TEXT NOT NULL` | 文本、不能为空 | 商品必须有名字 |
| `price_cents INTEGER NOT NULL` | 整数、不能为空 | 价格（分），必须填 |
| `stock INTEGER NOT NULL DEFAULT 0` | 整数、不能为空、默认 0 | 库存不填就是 0 |

**四个关键词必须记住：**

| 关键词 | 作用 | 不写会怎样 |
|---|---|---|
| `PRIMARY KEY` | 这一列是主键，唯一标识一行 | 可能有两行完全一样，你没法精确指定某一行 |
| `AUTOINCREMENT` | 自动递增，不用你手填 id | 每次插入都要自己算 id |
| `NOT NULL` | 不能为空 | 可以插入"没有名字"的商品 |
| `DEFAULT 0` | 不填时的默认值 | 必须每次都给 stock |

**为什么用反引号（`）包 SQL：**

因为 SQL 可以跨多行。普通引号 `"..."` 不能换行，反引号可以。**这也是第 12 节课学的"模板字符串"。**

**第 13 行：**

```javascript
console.log("表建好了");
```

**第 15 行：**

```javascript
db.close();
```

**`close()` 是什么：** 关闭数据库连接，释放文件句柄。

**为什么必须关：**

- 不关的话，文件可能被锁住，别的程序打不开；
- 数据可能还在内存里没写进文件。

**养成习惯：用完就 close。** 就像用完水龙头要关。

### 3.5 再运行一次，验证 `IF NOT EXISTS`

**操作：** 再跑一次：

```text
node first-table.mjs
```

**应该看到：** 还是 `表建好了`，**没有报错。**

**为什么：** 因为 `IF NOT EXISTS` 让它"发现表已存在就跳过"。

**现在把 `IF NOT EXISTS` 删掉，再跑一次：**

```javascript
  CREATE TABLE products (      ← 去掉了 IF NOT EXISTS
```

**应该看到：**

```text
Error: table products already exists
```

**完整报错大概长这样：**

```text
Error: table products already exists
    at DatabaseSync.exec (node:internal/...)
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `Error: table products already exists` | 表 products 已经存在 |
| `at DatabaseSync.exec (...)` | 出错的位置在 `exec` 这个方法 |

**怎么修：** 把 `IF NOT EXISTS` 加回去。

**这个实验的意义：** 让你知道 `IF NOT EXISTS` **不是装饰，是真在起作用**。而且让你看到"建表重复"的报错长什么样。

**记得改回去。**

### 3.6 看一眼那个 .db 文件

**操作：**

1. 在文件夹里找到 `shop.db`。
2. 右键 → 属性。

**应该看到：** 文件大小大概是 **8KB** 或 **12KB**，哪怕表里一条数据都没有。

**为什么空表也占空间：** 因为文件里存了"表结构"（schema）本身——列名、类型、约束，这些都要记下来。

**能不能用记事本打开看：** 能，但你会看到一堆乱码加一点可读的文字。**看完关掉，不要改。**

你会看到类似：

```text
SQLite format 3
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
...
```

**这说明：** SQLite 数据库就是**一个普通文件**，里面存着结构定义和数据。

**为什么这个认知重要：** 因为它意味着——

- **备份**就是复制这个文件；
- **迁移**就是把这个文件拷到另一台机器；
- **删除**就是删掉这个文件（**小心！**）。

**第 32 节课讲备份，就是基于这个原理。**

**第 3 步做完了。你已经建了第一个表。**

---

## 第 4 步：插一条数据，再查出来（20 分钟）

**建了表但没数据，等于有个空盒子。现在往里放东西。**

### 4.1 新建第二个文件

**操作：** 在 `db-lab` 里新建 `first-insert.mjs`，敲：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("shop.db");

const insert = db.prepare(
  "INSERT INTO products (name, price_cents, stock) VALUES (?, ?, ?)"
);

const result = insert.run("矿泉水", 200, 50);
console.log("插入结果：", result);

db.close();
```

**保存，运行：**

```text
node first-insert.mjs
```

**应该看到：**

```text
插入结果： { lastInsertRowid: 1, changes: 1 }
```

### 4.2 逐行读

**第 5—7 行：**

```javascript
const insert = db.prepare(
  "INSERT INTO products (name, price_cents, stock) VALUES (?, ?, ?)"
);
```

**`prepare` 是什么：** "准备"一条 SQL 语句。

**`?` 是什么：** 占位符。等真正执行时才把值填进去。

**为什么不直接拼字符串：**

**如果你这样写（错误的做法）：**

```javascript
const sql = `INSERT INTO products (name) VALUES ('${userInput}')`;  // 千万别这样
```

**那么用户输入 `'); DROP TABLE products; --` 时，你的表就被删了。**

**这个东西叫 SQL 注入。** 是 Web 安全里最经典的攻击。

**用 `?` 占位符，数据库会把输入当"纯数据"处理，永远不会当"SQL 代码"。**

**这是硬规则，不是建议：**

```text
所有用户输入进 SQL，必须用 ? 占位，绝不拼字符串。
```

**第 9 行：**

```javascript
const result = insert.run("矿泉水", 200, 50);
```

**`run()` 是什么：** 执行，并返回"执行结果"。

**三个参数按顺序填进三个 `?`。**

**返回的对象：**

| 字段 | 意思 |
|---|---|
| `lastInsertRowid: 1` | 刚插入那行的 id 是 1 |
| `changes: 1` | 影响了 1 行 |

**为什么 `lastInsertRowid` 有用：** 插入之后你往往需要知道"新记录的 id 是多少"，比如要跳转到详情页。

**`changes: 1` 为什么重要：** 更新和删除时，`changes` 告诉你"真的改到了吗"。**`changes: 0` 说明你没找到那条数据。**

### 4.3 插入三条，看看 id 自动递增

**操作：** 把文件改成：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("shop.db");

const insert = db.prepare(
  "INSERT INTO products (name, price_cents, stock) VALUES (?, ?, ?)"
);

console.log(insert.run("矿泉水", 200, 50));
console.log(insert.run("面包", 850, 30));
console.log(insert.run("牛奶", 1500, 0));

db.close();
```

**运行：**

```text
node first-insert.mjs
```

**应该看到：**

```text
{ lastInsertRowid: 2, changes: 1 }
{ lastInsertRowid: 3, changes: 1 }
{ lastInsertRowid: 4, changes: 1 }
```

**为什么从 2 开始：** 因为第一次运行已经插了一条（id=1）。**`AUTOINCREMENT` 会记住最大 id，不会重头再来。**

**注意"牛奶"的 `stock` 是 0：** 我明确传了 0。

### 4.4 查出来看

**操作：** 新建 `first-select.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("shop.db");

const all = db.prepare("SELECT * FROM products").all();
console.log(all);

db.close();
```

**运行：**

```text
node first-select.mjs
```

**应该看到：**

```text
[
  [Object: null prototype] {
    id: 1,
    name: '矿泉水',
    price_cents: 200,
    stock: 50
  },
  [Object: null prototype] {
    id: 2,
    name: '面包',
    price_cents: 850,
    stock: 30
  },
  ...
]
```

**三行代码解释：**

| 部分 | 意思 |
|---|---|
| `SELECT *` | 选所有列（`*` 是通配符） |
| `FROM products` | 从 products 表 |
| `.all()` | 取所有结果，返回**数组** |

**还有两种取法：**

| 方法 | 返回 | 什么时候用 |
|---|---|---|
| `.all()` | 数组（可能 0 个、1 个、多个） | 列表 |
| `.get()` | 单个对象，或 `undefined` | 按 id 查一条 |

**`.get()` 的例子：**

```javascript
const one = db.prepare("SELECT * FROM products WHERE id = ?").get(1);
console.log(one);
```

**输出：**

```text
[Object: null prototype] { id: 1, name: '矿泉水', price_cents: 200, stock: 50 }
```

**`.get()` 查不到时返回 `undefined`：**

```javascript
const none = db.prepare("SELECT * FROM products WHERE id = ?").get(999);
console.log(none);
```

**输出：**

```text
undefined
```

**这个必须记住：`.get()` 查不到是 `undefined`，不是报错。** 你如果不判断就 `row.name`，会得到：

```text
TypeError: Cannot read properties of undefined (reading 'name')
```

**这是新手最高频的报错之一。** 正确写法：

```javascript
const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
if (!row) {
  console.log("商品不存在");
} else {
  console.log(row.name);
}
```

### 4.5 那个 `[Object: null prototype]` 是什么

**你会注意到每个对象前面都有 `[Object: null prototype]`。**

**这是什么：** 数据库返回的对象**没有原型**（prototype）。

**什么叫没有原型：** 普通对象有 `toString()`、`hasOwnProperty()` 这些从 `Object.prototype` 继承来的方法。**数据库返回的对象没有这些。**

**为什么要这样设计：** 因为如果数据里有个列名叫 `toString` 或 `constructor`，有原型就会冲突。**去掉原型更安全。**

**这会不会影响你用：**

| 操作 | 受影响吗 |
|---|---|
| `row.name` 读字段 | 不受影响 |
| `JSON.stringify(row)` | 不受影响 |
| `{...row}` 展开 | 不受影响 |
| `row.toString()` | **会报错**（没有这个方法） |
| `Object.keys(row)` | 不受影响 |
| `for (const k in row)` | 不受影响 |

**实际影响很小。** 但打印出来难看。**想打印得干净，展开一下：**

```javascript
console.log({ ...row });
```

**输出：**

```text
{ id: 1, name: '矿泉水', price_cents: 200, stock: 50 }
```

**或者用 JSON：**

```javascript
console.log(JSON.stringify(row, null, 2));
```

**输出：**

```json
{
  "id": 1,
  "name": "矿泉水",
  "price_cents": 200,
  "stock": 50
}
```

**记住这个小技巧：以后打印查询结果，用 `{ ...row }` 或 `JSON.stringify`，会好看很多。**

**第 4 步做完了。**

---

## 第 5 步：让数据库拦住错误数据（15 分钟）

**这一步是全课最重要的认知转变：从"我保证数据对"变成"数据库保证数据对"。**

### 5.1 试试不给 name

**操作：** 新建 `first-error.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("shop.db");

try {
  db.prepare("INSERT INTO products (price_cents, stock) VALUES (?, ?)").run(200, 10);
  console.log("插入成功了");
} catch (error) {
  console.log("数据库拒绝了");
  console.log("错误代码：", error.code);
  console.log("错误原文：", error.message);
}

db.close();
```

**运行：**

```text
node first-error.mjs
```

**应该看到：**

```text
数据库拒绝了
错误代码： ERR_SQLITE_ERROR
错误原文： NOT NULL constraint failed: products.name
```

**逐句读报错：**

| 部分 | 意思 |
|---|---|
| `ERR_SQLITE_ERROR` | 这是 SQLite 报的错（代码里判断错误类型可以用这个） |
| `NOT NULL constraint failed` | "非空约束"失败了 |
| `products.name` | 具体是 `products` 表的 `name` 这一列 |

**看到这个报错，你就知道：我漏了一个必填字段。**

**对比一下：如果没有 NOT NULL 约束会怎样：**

```sql
name TEXT          ← 去掉 NOT NULL
```

**那这次插入会成功，表里就多了一条"没有名字"的商品。** 然后你查列表时，页面显示 `undefined`，用户来问你"这是什么"。

**约束的作用就是：让错误发生在"插入的那一刻"，而不是"三天后用户发现的时候"。**

### 5.2 试试给错类型（重要：SQLite 在这里很宽松）

**操作：** 改一下：

```javascript
try {
  db.prepare("INSERT INTO products (name, price_cents, stock) VALUES (?, ?, ?)").run("测试商品", "两百块", 10);
  console.log("插入成功了");
} catch (error) {
  console.log("数据库拒绝了：", error.message);
}
```

**运行。**

**你会看到：插入成功了。**

**为什么？** 因为 SQLite 的类型检查比你想象的**宽松**。

**SQLite 有个"类型亲和性"（type affinity）机制：** 它会把 `"两百块"` 尝试转成整数，转不了就**还是存进去**（存成文本）。

**这和我们期望的"严格类型"不一样。**

**所以：**

```text
SQLite 的列类型是"建议"，不是"强制"。
```

**那怎么办？** 靠自己校验，或者用 `CHECK` 约束（更严格）。

**记住这条：类型约束不能完全依赖数据库，你的代码里还是要有校验。**

### 5.3 `CHECK` 约束（真正管用的）

**约束比类型更好用。** 因为约束是"你写的规则"，数据库会严格执行。

**操作：** 建一张新表，加一个 CHECK：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("shop.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS stock_test (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    stock INTEGER NOT NULL CHECK (stock >= 0)
  )
`);

const ins = db.prepare("INSERT INTO stock_test (name, stock) VALUES (?, ?)");

console.log("正常插入：", ins.run("正常商品", 10));

try {
  ins.run("负库存商品", -5);
  console.log("负库存插入成功了（不该发生）");
} catch (error) {
  console.log("负库存被拒绝：", error.message);
}

db.close();
```

**运行，应该看到：**

```text
正常插入： { lastInsertRowid: 1, changes: 1 }
负库存被拒绝： CHECK constraint failed: stock >= 0
```

**`CHECK (stock >= 0)` 的意思：** 插入或更新时，`stock` 必须大于等于 0，否则拒绝。

**这就是"数据库保证数据正确"的样子。**

**为什么这比在代码里判断更好：**

| 做法 | 风险 |
|---|---|
| 代码里 `if (stock < 0) throw ...` | 有 10 处改库存的代码，漏一处就超卖 |
| 数据库 `CHECK (stock >= 0)` | 只有一个地方，所有路径都拦得住 |

**这就是 0.4 节那句话的实际含义。**

### 5.4 四种约束速查

| 约束 | 写法 | 拦什么 |
|---|---|---|
| 非空 | `NOT NULL` | 值为 null |
| 唯一 | `UNIQUE` | 重复值 |
| 主键 | `PRIMARY KEY` | 重复 + 为空 |
| 范围 | `CHECK (条件)` | 不满足条件 |

### 5.5 一个必须知道的细节：约束只在写入时生效

**如果表里已经有脏数据，加上约束不会自动修好它。**

**举例：**

1. 你先建表**不带** CHECK，插了一条 `stock = -5`；
2. 然后你想加 CHECK 约束；
3. **加不上去**，或者加上去了但旧数据还在。

**为什么：** 因为约束是"写入时检查"，它不会回头检查已有数据。

**真实项目怎么处理：** 先清理脏数据，再加约束。**这叫"数据迁移"，第 6 阶段会讲。**

**现在你只要知道：加了约束不等于数据就干净了。**

**第 5 步做完了。**

---

## 第 6 步：故意撞五种错（15 分钟）

**每一个都要真的跑一遍，看一眼报错原文。**

**操作：** 新建 `five-errors.mjs`，把下面全部敲进去：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("shop.db");

console.log("=== 错误 1：表不存在 ===");
try {
  db.prepare("SELECT * FROM nope").all();
} catch (e) {
  console.log(e.code, "|", e.message);
}

console.log("=== 错误 2：列不存在 ===");
try {
  db.prepare("SELECT nope FROM products").all();
} catch (e) {
  console.log(e.code, "|", e.message);
}

console.log("=== 错误 3：SQL 语法错 ===");
try {
  db.prepare("SELEC * FROM products").all();
} catch (e) {
  console.log(e.code, "|", e.message);
}

console.log("=== 错误 4：唯一约束冲突 ===");
db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL)`);
const insUser = db.prepare("INSERT INTO users (email) VALUES (?)");
insUser.run("a@b.com");
try {
  insUser.run("a@b.com");
} catch (e) {
  console.log(e.code, "|", e.message);
}

console.log("=== 错误 5：参数数量不对 ===");
try {
  db.prepare("SELECT * FROM products WHERE id = ?").all(1, 2);
} catch (e) {
  console.log(e.code, "|", e.message);
}

db.close();
```

**运行，我实测的输出是：**

```text
=== 错误 1：表不存在 ===
ERR_SQLITE_ERROR | no such table: nope
=== 错误 2：列不存在 ===
ERR_SQLITE_ERROR | no such column: nope
=== 错误 3：SQL 语法错 ===
ERR_SQLITE_ERROR | near "SELEC": syntax error
=== 错误 4：唯一约束冲突 ===
ERR_SQLITE_ERROR | UNIQUE constraint failed: users.email
=== 错误 5：参数数量不对 ===
ERR_SQLITE_ERROR | column index out of range
```

**五种错误逐个读：**

| 报错 | 人话原因 | 怎么修 |
|---|---|---|
| `no such table: nope` | 没有叫 nope 的表 | 检查表名拼写；可能是建表语句没执行 |
| `no such column: nope` | 表里没这列 | 检查列名；可能拼错或用错表 |
| `near "SELEC": syntax error` | `SELEC` 是什么鬼 | **`SELECT` 拼错了** |
| `UNIQUE constraint failed: users.email` | email 重复了 | 先查有没有，再插；或用 `INSERT OR IGNORE` |
| `column index out of range` | 参数给多了 | 数一数 SQL 里有几个 `?` |

**一个非常重要的观察：**

**五种错误，`code` 全都是 `ERR_SQLITE_ERROR`。**

**这意味着你不能靠 `code` 区分错误类型。** 必须看 `message` 里的关键词。

**实战写法：**

```javascript
try {
  // 操作
} catch (error) {
  if (error.message.includes("UNIQUE constraint failed")) {
    console.log("这个邮箱已经注册过了");
  } else if (error.message.includes("no such table")) {
    console.log("表还没建，检查建表逻辑");
  } else {
    console.log("未预料的数据库错误：", error.message);
  }
}
```

**用 `includes` 判断关键词，这是处理 SQLite 错误的标准做法。**

**第 6 步做完了。**

---

## 第 7 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第01节课\02-笔记\NOTES.md
```

**按里面的空填。重点填这四栏：**

1. **数据库 vs Excel 的区别**；
2. **建表语句的四个关键词**；
3. **`.all()` 和 `.get()` 的差别**；
4. **五种报错原文**（要自己跑出来的，不要抄）。

**第 7 步做完了。**

---

## 第 8 步：课后练习

### 练习 1：设计一张图书表

**不看课件，写出建表 SQL：**

要求：

- 表名 `books`；
- `id` 主键、自动递增；
- `title` 书名，必填；
- `author` 作者，必填；
- `price_cents` 价格（分），必填，不能是负数；
- `stock` 库存，默认 0，不能是负数；
- `isbn` 书号，必须唯一。

**写完自己跑一遍建起来。** 然后故意插入一条 `price_cents = -100` 的，看会不会被拦。

### 练习 2：五种报错的现场复现

**把第 6 步那五种错误，自己重新触发一遍，把报错原文抄进笔记。**

**不要复制课件里的。** 因为你的输出可能和我略有不同（版本差异）。

### 练习 3：找出这个设计的问题

**下面这张表有什么问题？用 2.3 节的"同一条信息只存一个地方"来检查。**

| id | 商品名 | 商品价格 | 客户名 | 客户电话 | 数量 |
|---|---|---|---|---|---|
| 1 | 矿泉水 | 200 | 小明 | 138xxx | 2 |
| 2 | 面包 | 850 | 小明 | 138xxx | 1 |
| 3 | 矿泉水 | 200 | 小红 | 139xxx | 3 |

**写出：**

1. 哪些信息重复了；
2. 如果矿泉水涨价到 300，要改几行；
3. 应该拆成哪几张表，每张表有哪些列。

### 练习 4：给自己的项目设计表

**目标：** 你要把你第 3 周的 `chat-app` 从 JSON 换成数据库（第 33 节会做）。

**现在就先把表设计出来：**

```text
需要哪些表？
每张表有哪些列？
哪些列是主键？
哪些列必填？
哪些列有约束？
表之间怎么关联？
```

**写成一张草稿，第 33 节直接用。**

### 练习 5：用自己的话讲

**用三句话说清：**

```text
JSON 文件当数据库，最致命的硬伤是什么？
数据库的"约束"比"代码里的 if 判断"好在哪？
为什么 SQL 里要用 ? 占位符，不能拼字符串？
```

---

## 第 9 步：最终验收

### A. 概念

- [ ] 我能说出数据库、表、行、列分别对应 Excel 的什么
- [ ] 我能说出数据库和 Excel 的四个关键区别
- [ ] 我知道 JSON 文件当数据库的四个硬伤
- [ ] 我理解"数据库不是存数据的地方，是保证数据正确的规则集合"
- [ ] 我知道"同一条信息只存一个地方"这条原则
- [ ] 我知道数据库字段为什么用 snake_case

### B. 操作

- [ ] 我的 `shop.db` 文件已生成
- [ ] 我建出了 `products` 表
- [ ] 我插入了至少 3 条数据
- [ ] 我能用 `.all()` 查出所有数据
- [ ] 我能用 `.get()` 查单条，并知道查不到返回 `undefined`
- [ ] 我用 `{ ...row }` 或 `JSON.stringify` 把结果打印干净了
- [ ] 我建了一张带 `CHECK` 约束的表，并验证负数被拒绝

### C. 排错

- [ ] 我知道 `NOT NULL constraint failed` 怎么修
- [ ] 我知道 `UNIQUE constraint failed` 怎么修
- [ ] 我知道 `no such table` 怎么查
- [ ] 我知道 `near "X": syntax error` 通常是拼写错误
- [ ] 我知道五种错误 `code` 都一样，必须看 `message`
- [ ] 我知道 `ExperimentalWarning` 不用管

### D. 认知

- [ ] 我知道 SQLite 的类型检查是宽松的，不能完全依赖
- [ ] 我知道约束只在写入时生效，不会修已有脏数据
- [ ] 我理解为什么用户输入必须用 `?` 占位

### E. 笔记

- [ ] `NOTES.md` 填完，没有大片空白
- [ ] 五种报错原文是我自己跑出来的
- [ ] 我做了练习 1 的图书表
- [ ] 我做了练习 3 的拆表分析
- [ ] 我画出了 `chat-app` 的表设计草稿

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `Cannot find module 'node:sqlite'` | Node 版本低于 22 | 升级 Node，装完重开终端 |
| `Cannot use import statement outside a module` | 用了 `.js` 但没配 `type: module` | 改扩展名为 `.mjs`，或建 `package.json` |
| 打印结果有 `[Object: null prototype]` | 数据库返回的对象没原型 | 正常，用 `{ ...row }` 打印就好 |
| `ExperimentalWarning: SQLite is...` | 功能还在实验阶段 | 不用管，不影响使用 |
| `table products already exists` | 重复建表 | 加 `IF NOT EXISTS` |
| `no such table` | 表名拼错，或建表语句没跑 | 检查拼写；确认建表代码真的执行了 |
| `NOT NULL constraint failed` | 漏了必填字段 | 检查 SQL 里是不是少了一列 |
| `UNIQUE constraint failed` | 值重复 | 先查再插，或改用 `INSERT OR IGNORE` |
| `column index out of range` | `?` 数量和参数数量不一致 | 数一遍 `?` |
| `.get()` 返回 `undefined`，再取属性就报错 | 没查到 | 先 `if (!row)` 判断 |
| 插入了字符串价格但没报错 | SQLite 类型检查宽松 | 自己校验，或加 `CHECK` |
| `db.close()` 忘了写 | 文件被锁、数据可能没落盘 | 养成习惯，用完就关 |
| 想知道库里有什么表 | — | 下面的 `sqlite_master` 查询 |

**最后那条命令很实用，先记下来：**

```javascript
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables);
```

**`sqlite_master` 是什么：** SQLite 内置的"系统表"，记录了这个数据库里所有的表、索引、视图。

**这是你以后"这个库里有什么"的第一反应命令。**

---

## 附：这一节课你必须记住的三句话

```text
一、数据库不是存数据的地方，是保证数据正确的规则集合。

二、同一条信息只存一个地方（这条决定了表怎么拆）。

三、用户输入进 SQL 必须用 ? 占位，绝不拼字符串。
```

---

## 附：下一步

**第 30 节课：创建表和字段。**

这节课你建了一张很简单的表。下节课会讲：

- 每张表该有哪些列，怎么判断；
- 什么时候该拆表、什么时候不该拆；
- 字段类型怎么选（为什么金额用整数、时间用什么类型）；
- 怎么改已有的表（加一列、改类型）；
- **一个真实项目从零到有表结构的完整过程**。

**在进入下节课之前，确认一件事：**

- [ ] 你的 `shop.db` 里现在有几张表？用 `sqlite_master` 查一下。

**如果你查到 `products`、`stock_test`、`users` 三张表，说明这节课做完了。**
