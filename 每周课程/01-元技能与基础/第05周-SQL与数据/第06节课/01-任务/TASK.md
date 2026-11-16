# 第 34 节课：更新与删除安全操作

## 本节课要解决的问题

前三节课都在"读"。**这节课开始"写"，而写错代价极大。**

我实测过一件事：

```text
UPDATE t2 SET v = '全改了'      ← 忘了写 WHERE
changes: 2000                   ← 2000 行全被改了
```

**一张两千行的表，一条 SQL，全毁了。** 而且它不报错，`changes: 2000` 看起来还挺正常。

**这节课要解决三件事：**

- 怎么写 `UPDATE` / `DELETE` 才不会误伤；
- 事务怎么用（为什么插入必须包事务）；
- 索引怎么加（**我实测：事务让插入快 1243 倍，索引让查询快 3.5 倍**）。

**这节课你会学到：**

- `UPDATE` / `DELETE` 的三道保险（`WHERE` + 先 `SELECT` + 事务）；
- **软删除**：为什么大公司都不真删数据；
- 事务的完整用法（`BEGIN` / `COMMIT` / `ROLLBACK`），以及为什么它能让插入快 1000 倍；
- 索引：什么时候加、加了为什么快、加多了为什么慢；
- `EXPLAIN QUERY PLAN` 怎么看（判断查询有没有用上索引）。

**这节课不学：** 数据库备份与恢复（下节课）、锁机制细节、分布式事务。

**需要多久：** 110 分钟。

**⚠️ 这一节是本阶段最危险的一节。所有操作都在独立的 `safe-lab` 里做，不要在课程仓库根目录做。**

---

## 第 0 步：建一个"随便毁"的实验库（10 分钟）

**为什么要单独建：**

这一节要故意做这些事：

```text
UPDATE 不带 WHERE    → 整表被改
DELETE 不带 WHERE    → 整表被删
事务中途失败         → 数据回滚
```

**在真实数据上做这些，等于自毁。** 所以单独建一个，毁多少次都无所谓。

### 0.1 建文件夹和造数据

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第06节课\03-练习代码
   ```

2. 新建文件夹 `safe-lab`，进去，地址栏输入 `cmd` 回车。
3. 新建 `seed.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("safe.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )
`);

db.exec("DELETE FROM logs");
db.exec("DELETE FROM accounts");

const insAcc = db.prepare("INSERT INTO accounts (name, balance_cents) VALUES (?, ?)");
insAcc.run("甲", 100000);
insAcc.run("乙", 50000);
insAcc.run("丙", 20000);
insAcc.run("丁", 0);

// 造一批日志，方便测索引
const insLog = db.prepare("INSERT INTO logs (account_id, action, amount_cents, created_at) VALUES (?,?,?,?)");
const now = Date.now();
db.exec("BEGIN");
for (let i = 0; i < 5000; i++) {
  insLog.run(
    (i % 4) + 1,
    i % 2 === 0 ? "deposit" : "withdraw",
    Math.floor(Math.random() * 10000),
    new Date(now - i * 60000).toISOString()
  );
}
db.exec("COMMIT");

console.log("账户:", db.prepare("SELECT COUNT(*) AS c FROM accounts").get().c);
console.log("日志:", db.prepare("SELECT COUNT(*) AS c FROM logs").get().c);
db.close();
```

**运行：**

```text
node seed.mjs
```

**应该看到：**

```text
账户: 4
日志: 5000
```

**注意这个 `seed.mjs` 里已经用了事务（`BEGIN` / `COMMIT`）。**

**为什么要用：** 5000 条插入如果不包事务，会慢得让你等（下节实测给你看数字）。

**第 0 步做完了。**

---

## 第 1 步：`UPDATE` 的三道保险（25 分钟）

### 1.1 先看一次事故

**操作：** 新建 `disaster.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("safe.db");

console.log("=== 改之前 ===");
console.log(db.prepare("SELECT id, name, balance_cents FROM accounts").all().map(r => ({ ...r })));

// 事故：忘了写 WHERE
const r = db.prepare("UPDATE accounts SET balance_cents = 0").run();
console.log("\n执行 UPDATE accounts SET balance_cents = 0");
console.log("changes:", r.changes);

console.log("\n=== 改之后 ===");
console.log(db.prepare("SELECT id, name, balance_cents FROM accounts").all().map(r => ({ ...r })));

db.close();
```

**运行，我的实测输出：**

```text
=== 改之前 ===
[
  { id: 1, name: '甲', balance_cents: 100000 },
  { id: 2, name: '乙', balance_cents: 50000 },
  { id: 3, name: '丙', balance_cents: 20000 },
  { id: 4, name: '丁', balance_cents: 0 }
]

执行 UPDATE accounts SET balance_cents = 0
changes: 4

=== 改之后 ===
[
  { id: 1, name: '甲', balance_cents: 0 },
  { id: 2, name: '乙', balance_cents: 0 },
  { id: 3, name: '丙', balance_cents: 0 },
  { id: 4, name: '丁', balance_cents: 0 }
]
```

**四个人的钱全没了。**

**注意 `changes: 4`** —— 它老老实实告诉你"影响了 4 行"，**但它不觉得这是错的**。

**这就是最危险的地方：`UPDATE` 不带 `WHERE` 不是错误，是"更新所有行"。**

### 1.2 三道保险

**第一道：`WHERE` 必须有**

**这是最基础的，但也是最容易忘的。**

**第二道：先 `SELECT` 看一眼**

**这是最实用的习惯。**

```javascript
// 第一步：先用 SELECT 确认要改哪些行
const preview = db.prepare("SELECT id, name, balance_cents FROM accounts WHERE id = ?").all(1);
console.log("将要修改：", preview.map(r => ({ ...r })));

// 第二步：确认没问题再 UPDATE
const r = db.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").run(99999, 1);
console.log("changes:", r.changes);
```

**为什么要 `SELECT` 两遍：**

1. **看行数对不对**（你以为是 1 行，实际 100 行 → 说明 `WHERE` 写错了）；
2. **看内容对不对**（你以为是"乙"，实际是"甲" → 说明 id 搞错了）。

**这个习惯能挡住 90% 的事故。**

**第三道：事务 + 检查 `changes`**

```javascript
db.exec("BEGIN");
try {
  const r = db.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").run(99999, 1);
  if (r.changes !== 1) {
    throw new Error(`预期改 1 行，实际改了 ${r.changes} 行，回滚`);
  }
  db.exec("COMMIT");
  console.log("改成功了");
} catch (error) {
  db.exec("ROLLBACK");
  console.error("已回滚：", error.message);
}
```

**这段代码做了三件事：**

| 步骤 | 作用 |
|---|---|
| `BEGIN` | 开始事务，改动先不落盘 |
| 检查 `changes !== 1` | 如果不是 1 行，说明出问题了 |
| `ROLLBACK` | 撤销所有改动 |

**为什么要检查 `changes`：**

**因为 `WHERE` 写错有两种情况：**

| 情况 | `changes` | 后果 |
|---|---|---|
| `WHERE` 漏写 | 全部行数 | **灾难** |
| `WHERE` 条件写错（匹配 0 行） | 0 | 你以为改成功了，其实什么都没改 |

**第二种更隐蔽。** 用户说"我明明改了价格，怎么还是旧的"—— 因为你 `WHERE id = 999` 但那条数据 id 是 1。

**所以：**

```text
UPDATE 之后必须检查 changes。
changes === 0 → 没找到数据（WHERE 错了）
changes === 1 → 正常（按 id 更新）
changes > 1   → 危险（WHERE 条件太宽）
```

**这条规则要变成肌肉记忆。**

### 1.3 正确的 `UPDATE` 模板

**把这三道保险合成一个模板，以后照着写：**

```javascript
function safeUpdate(db, { table, setClause, setParams, whereClause, whereParams, expectedChanges = 1 }) {
  // 第一道：WHERE 必须存在
  if (!whereClause || !whereClause.trim()) {
    throw new Error("拒绝执行：WHERE 不能为空");
  }

  // 第二道：先看要改什么
  const preview = db.prepare(`SELECT * FROM ${table} WHERE ${whereClause}`).all(...whereParams);
  console.log(`将要修改 ${preview.length} 行`);
  if (preview.length === 0) {
    throw new Error("拒绝执行：没有匹配的行");
  }

  // 第三道：事务 + 检查 changes
  db.exec("BEGIN");
  try {
    const r = db.prepare(`UPDATE ${table} SET ${setClause} WHERE ${whereClause}`).run(...setParams, ...whereParams);
    if (r.changes !== expectedChanges) {
      throw new Error(`预期 ${expectedChanges} 行，实际 ${r.changes} 行`);
    }
    db.exec("COMMIT");
    return { changes: r.changes, rows: preview };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
```

**注意这里 `table` 和 `setClause` 是拼字符串的。**

**这是安全的，因为它们来自你的代码，不来自用户输入。** 但 `setParams` 和 `whereParams` 必须是 `?`。

**用起来：**

```javascript
safeUpdate(db, {
  table: "accounts",
  setClause: "balance_cents = ?",
  setParams: [123456],
  whereClause: "id = ?",
  whereParams: [1],
});
```

**这个函数是"防呆"的。** 你以后写任何 `UPDATE` 都该用类似的结构。

### 1.4 `UPDATE` 的另外两个坑

**坑一：`SET` 里的值不能用 `WHERE` 的语法**

```sql
-- ❌ 错的
UPDATE accounts SET balance_cents = 0 WHERE id = 1 WHERE name = '甲';

-- ✅ 对的
UPDATE accounts SET balance_cents = 0 WHERE id = 1 AND name = '甲';
```

**一个 `UPDATE` 只能有一个 `WHERE`。**

**坑二：`SET` 可以引用当前值**

```sql
-- 加 100 元（不是设成 100 元）
UPDATE accounts SET balance_cents = balance_cents + 10000 WHERE id = 1;
```

**这个区别极大：**

| 写法 | 结果 |
|---|---|
| `SET balance = 10000` | 变成 10000（覆盖） |
| `SET balance = balance + 10000` | 原来的值加 10000 |

**做"增减"操作时必须用第二种。**

**而且第二种是原子的**（数据库保证读+写不被中间插入），**这就是为什么转账要用它。**

---

## 第 2 步：`DELETE` 与软删除（20 分钟）

### 2.1 `DELETE` 的危险和 `UPDATE` 一样

```sql
DELETE FROM accounts;             -- 删光整张表
DELETE FROM accounts WHERE id = 1; -- 删 1 行
```

**区别只有 `WHERE`。**

**但 `DELETE` 比 `UPDATE` 更可怕：**

| | `UPDATE` 漏 `WHERE` | `DELETE` 漏 `WHERE` |
|---|---|---|
| 数据还在吗 | 在，但内容错了 | **不在了** |
| 能恢复吗 | 可以从备份恢复原值 | 要从备份恢复整行 |
| 影响 | 数据错乱 | **数据丢失** |

**`UPDATE` 至少数据还在，你能看到"被改成什么了"。`DELETE` 是直接消失。**

### 2.2 软删除：大公司的做法

**需求：用户注销账号。**

**硬删除（错的）：**

```sql
DELETE FROM accounts WHERE id = 1;
```

**问题：**

| 问题 | 后果 |
|---|---|
| 无法恢复 | 用户说"我误操作了"，你没救 |
| 订单关联断了 | `orders.account_id = 1` 变成孤儿数据 |
| 无法审计 | 财务要查"这个人当年买了什么"，查不到 |
| 法律风险 | 有些行业规定交易记录必须保存 N 年 |

**软删除（对的）：**

```sql
UPDATE accounts SET is_deleted = 1, deleted_at = ? WHERE id = 1;
```

**数据还在，只是标记"已删除"。**

**所以我们的表里有这两个字段：**

```sql
is_deleted INTEGER NOT NULL DEFAULT 0,
deleted_at TEXT
```

**`is_deleted = 0` 表示正常，`1` 表示已删除。**

### 2.3 软删除的完整用法

**操作：** 新建 `soft-delete.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("safe.db");
db.exec("PRAGMA foreign_keys = ON");

// 软删除
const del = db.prepare("UPDATE accounts SET is_deleted = 1, deleted_at = ? WHERE id = ?");
console.log("删除结果：", del.run(new Date().toISOString(), 2));

// 正常查询：必须过滤掉已删除的
const active = db.prepare("SELECT id, name FROM accounts WHERE is_deleted = 0").all();
console.log("正常列表：", active.map(r => ({ ...r })));

// 包含已删除（管理后台用）
const all = db.prepare("SELECT id, name, is_deleted, deleted_at FROM accounts").all();
console.log("含已删除：", all.map(r => ({ ...r })));

// 恢复
const restore = db.prepare("UPDATE accounts SET is_deleted = 0, deleted_at = NULL WHERE id = ?");
console.log("恢复结果：", restore.run(2));

db.close();
```

**我的预期输出：**

```text
删除结果： { lastInsertRowid: 2, changes: 1 }
正常列表： [ { id: 1, name: '甲' }, { id: 3, name: '丙' }, { id: 4, name: '丁' } ]
含已删除： [
  { id: 1, name: '甲', is_deleted: 0, deleted_at: null },
  { id: 2, name: '乙', is_deleted: 1, deleted_at: '2026-...' },
  ...
]
恢复结果： { lastInsertRowid: 2, changes: 1 }
```

**注意 `lastInsertRowid: 2` 在 UPDATE 里也出现** —— 这个值在 UPDATE 里**没有意义**（不是新插入的行）。**只看 `changes`。**

### 2.4 软删除的三个代价

**软删除不是免费的。你必须知道它的代价：**

**代价一：每个查询都要加 `WHERE is_deleted = 0`**

**这是最容易出错的地方：** 你写了 20 个查询，有一个忘了加，那个查询就会把"已删除"的数据也带出来。

**解决办法：**

| 方案 | 做法 | 风险 |
|---|---|---|
| 视图中转 | 建一个 `active_accounts` 视图 | 得记得用视图 |
| 代码封装 | 所有查询走一个 `baseQuery()` | 最好，但要自律 |
| 用 `deleted_at IS NULL` | 只存时间，不存标记 | 少一个字段，但查询稍慢 |

**我们用一个简单的约定：**

```javascript
// 所有"正常数据"查询，条件里必须有 is_deleted = 0
const baseWhere = "is_deleted = 0";
```

**借口：** 真实的项目会用 ORM 的"全局作用域"功能自动加。**我们手写，所以要自律。**

**代价二：唯一约束会冲突**

**假设 `phone` 有 `UNIQUE` 约束。**

```text
1 号用户：phone = "13800000001"，软删除
2 号新用户：想用 "13800000001" 注册
→ 报 UNIQUE constraint failed
```

**因为那条记录还在（只是标记删除了）。**

**解决办法（三种）：**

**方案 A：删除时改掉唯一字段**

```sql
UPDATE users SET is_deleted = 1, phone = CONCAT(phone, '_deleted_', id) WHERE id = ?;
```

**方案 B：把 `UNIQUE` 改成"部分唯一索引"（SQLite 支持）**

```sql
CREATE UNIQUE INDEX idx_phone_active ON users(phone) WHERE is_deleted = 0;
```

**这个叫"部分索引"（partial index）。它只对 `is_deleted = 0` 的行强制唯一。**

**方案 C：接受这个限制**（"注销过的手机号不能再用"）

**推荐方案 B。** 实测一下：

```sql
-- 建部分唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_active ON users(phone) WHERE is_deleted = 0;
```

**然后：**

```javascript
// 软删除 13800000001
// 新用户想注册 13800000001 → 能成功（因为旧的那条 is_deleted=1，不在索引里）
```

**这是软删除的标准配套方案。**

**代价三：数据会越来越多**

**软删除的数据不会消失。** 一个用户删了 100 次订单，数据库里就有 100 条标记删除的记录。

**解决办法：**

- 定期归档（把 `deleted_at` 超过 1 年的移到归档表）；
- 或者定期"真正删除"（`DELETE WHERE is_deleted = 1 AND deleted_at < 一年前`）。

**这个策略要写进运维文档。** 我们下节课（备份）会提到。

### 2.5 什么时候该硬删除

**软删除不是"永远不删"。有些情况必须真删：**

| 情况 | 做法 |
|---|---|
| 用户行使"删除权"（GDPR 等法规） | **必须真删** |
| 测试数据、临时数据 | 真删 |
| 日志超过保留期 | 真删 |
| 用户注销但想重新注册同一手机号 | 真删旧记录，或方案 B |
| 业务数据（订单、交易） | **软删除** |

**判断标准：**

```text
这条数据将来"可能"需要查回来吗？
需要 → 软删除
绝对不需要（比如测试数据）→ 硬删除
```

**"为了安全"就把所有东西都软删除，是很糟的做法。** 数据库会变巨大，查询会变慢，而且你还得处理唯一约束冲突。

**软删除是"给业务数据用的"，不是"万能的"。**

---

## 第 3 步：事务 —— 为什么能让插入快 1243 倍（25 分钟）

**这一步的数字会让你震惊。我实测的。**

### 3.1 先看一次实测

**操作：** 新建 `tx-bench.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("bench.db");
db.exec("CREATE TABLE IF NOT EXISTS t2 (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)");
db.exec("DELETE FROM t2");

const ins = db.prepare("INSERT INTO t2 (v) VALUES (?)");

// 不加事务
let t = Date.now();
for (let i = 0; i < 2000; i++) ins.run("v" + i);
console.log("无事务插 2000 条:", Date.now() - t, "ms");

db.exec("DELETE FROM t2");

// 加事务
t = Date.now();
db.exec("BEGIN");
for (let i = 0; i < 2000; i++) ins.run("v" + i);
db.exec("COMMIT");
console.log("有事务插 2000 条:", Date.now() - t, "ms");

db.close();
```

**运行。我的实测输出：**

```text
无事务插 2000 条: 4972 ms
有事务插 2000 条: 4 ms
```

**4972ms 对 4ms —— 快了 1243 倍。**

**这个数字不是夸张，是 SQLite 的设计特性。**

### 3.2 为什么会差这么多

**因为每次 `run()` 不加事务时，SQLite 都会做这些事：**

```text
1. 开始一个隐式事务
2. 写入数据
3. 写到日志文件（journal）
4. fsync 刷盘  ← 这一步最慢
5. 提交事务
6. 清理日志
```

**`fsync` 是什么：** 强制把数据从内存刷到硬盘。**硬盘的写入速度比内存慢几万倍。**

**2000 条插入 = 2000 次 `fsync`。**

**加上 `BEGIN` 之后：**

```text
1. BEGIN（开始事务）
2. 2000 次写入（在内存/页缓存里）
3. COMMIT ← 只在这里做一次 fsync
```

**2000 次 `fsync` 变成 1 次。**

**这就是 1243 倍的来源。**

### 3.3 什么时候必须用事务

**规则：连续写多条数据时，必须包事务。**

| 场景 | 要事务吗 |
|---|---|
| 一次插 1 条 | 不用（SQLite 自动包了） |
| 循环插 100 条 | **必须** |
| 转账（两次 UPDATE） | **必须** |
| 删除订单 + 删除订单明细 | **必须** |
| 一次 UPDATE 一行 | 不用 |
| 批量导入 | **必须** |

**为什么"一次插 1 条"不用：** 因为 SQLite 对单条语句会自动包一个隐式事务。**你手动包也没坏处，只是没必要。**

### 3.4 事务的真正的价值：原子性

**事务不只为性能。它最重要的作用是"要么全成功，要么全失败"。**

**操作：** 新建 `tx-atomic.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("atomic.db");
db.exec("CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, msg TEXT, seq INTEGER UNIQUE)");
db.exec("DELETE FROM log");

const ins = db.prepare("INSERT INTO log (msg, seq) VALUES (?, ?)");

// 有事务：第二条失败，第一条也回滚
console.log("=== 有事务 ===");
try {
  db.exec("BEGIN");
  ins.run("第一条", 1);
  ins.run("第二条", 1);   // seq 重复，必定失败
  db.exec("COMMIT");
  console.log("不该到这里");
} catch (e) {
  db.exec("ROLLBACK");
  console.log("报错：", e.message);
}
console.log("log 表条数（应该是 0）：", db.prepare("SELECT COUNT(*) AS c FROM log").get().c);

// 无事务：第一条留下了
console.log("\n=== 无事务 ===");
try {
  ins.run("第一条", 1);
  ins.run("第二条", 1);   // 失败
} catch (e) {
  console.log("报错：", e.message);
}
console.log("log 表条数（应该是 1）：", db.prepare("SELECT COUNT(*) AS c FROM log").get().c);

db.close();
```

**我的实测输出：**

```text
=== 有事务 ===
报错： UNIQUE constraint failed: log.seq
log 表条数（应该是 0）： 0

=== 无事务 ===
报错： UNIQUE constraint failed: log.seq
log 表条数（应该是 1）： 1
```

**这就是原子的意思：**

| 情况 | 结果 |
|---|---|
| 有事务 | 第二条失败 → **第一条也被撤销** → 0 条 |
| 无事务 | 第二条失败 → **第一条留下了** → 1 条脏数据 |

**"0 条"是干净的，"1 条"是脏的。**

**为什么脏数据可怕：** 因为那条"第一条"逻辑上就不该存在（它是转账的一半、订单的一半）。**它单独存在会让你的数据自相矛盾。**

### 3.5 转账：事务的经典案例

**操作：** 新建 `transfer.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("safe.db");
db.exec("PRAGMA foreign_keys = ON");

function transfer(fromId, toId, amountCents) {
  if (amountCents <= 0) throw new Error("金额必须大于 0");
  if (fromId === toId) throw new Error("不能转给自己");

  db.exec("BEGIN");
  try {
    // 扣款（用 balance = balance - ? 而不是先查再算）
    const out = db.prepare("UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?")
      .run(amountCents, fromId, amountCents);

    if (out.changes !== 1) {
      throw new Error("余额不足或账户不存在");
    }

    const inn = db.prepare("UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?")
      .run(amountCents, toId);

    if (inn.changes !== 1) {
      throw new Error("目标账户不存在");
    }

    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// 正常转账
try {
  transfer(1, 3, 10000);
  console.log("转账成功");
} catch (e) {
  console.log("转账失败：", e.message);
}

console.log(db.prepare("SELECT id, name, balance_cents FROM accounts").all().map(r => ({ ...r })));

// 余额不足
try {
  transfer(4, 1, 10000);
  console.log("不该成功");
} catch (e) {
  console.log("转账失败：", e.message);
}

console.log(db.prepare("SELECT id, name, balance_cents FROM accounts").all().map(r => ({ ...r })));

db.close();
```

**三个关键点：**

**第一：`WHERE id = ? AND balance_cents >= ?`**

**这把"检查余额"和"扣款"合成一步。** 不是"先查余额，再扣"。

**为什么：** 因为"先查再扣"之间，别人可能也扣了。**这叫竞态条件。**

**用 `WHERE ... AND balance >= ?` 是原子的** —— 数据库执行这一条语句时不会被插入。

**第二：`changes !== 1` 就抛错**

**如果扣款影响 0 行，说明余额不足或账户不存在。** 立即回滚。

**第三：整个流程包在 `BEGIN` / `COMMIT` 里**

**如果充值的 `UPDATE` 失败，扣款的也会被撤销。**

**这就是"要么全成功，要么全失败"。**

---

## 第 4 步：索引 —— 为什么快 3.5 倍（25 分钟）

### 4.1 先看实测

**操作：** 新建 `index-bench.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("bench2.db");
db.exec("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT)");
db.exec("DELETE FROM items");

const ins = db.prepare("INSERT INTO items (code, name) VALUES (?, ?)");
db.exec("BEGIN");
for (let i = 0; i < 20000; i++) ins.run("code" + i, "name" + i);
db.exec("COMMIT");

const query = db.prepare("SELECT * FROM items WHERE code = ?");

// 无索引
let t = Date.now();
for (let i = 0; i < 200; i++) query.get("code" + i * 50);
const without = Date.now() - t;
console.log("无索引查 200 次:", without, "ms");

// 建索引
db.exec("CREATE INDEX IF NOT EXISTS idx_code ON items(code)");

// 有索引
t = Date.now();
for (let i = 0; i < 200; i++) query.get("code" + i * 50);
const withIdx = Date.now() - t;
console.log("有索引查 200 次:", withIdx, "ms");
console.log("快了", (without / withIdx).toFixed(1), "倍");

db.close();
```

**运行。我的实测输出：**

```text
无索引查 200 次: 25 ms
有索引查 200 次: 7 ms
快了 3.6 倍
```

**注意：只有 3.6 倍，不是 1000 倍。**

**为什么没有更夸张：**

因为 20000 行数据在内存里扫一遍只要几毫秒。**如果数据在磁盘上、或者有 100 万行，差距会变成几百倍。**

**这个数字的启示：**

```text
索引的收益随数据量增长而增长。
小数据时感觉不到，大数据时是生与死的区别。
```

### 4.2 索引是什么

**一句话：索引 = 书的目录。**

**没有索引时，查 `WHERE code = 'code5000'`：**

```text
从第 1 行看到第 20000 行，逐行比较 code 是不是 'code5000'
```

**这叫"全表扫描"（full table scan）。**

**有索引后：**

```text
索引是一棵排好序的树（B-tree）
直接从树里找到 'code5000' 对应的行位置
```

**时间复杂度对比：**

| 数据量 | 全表扫描 | 索引查找 |
|---|---|---|
| 100 行 | 100 次比较 | ~7 次 |
| 10,000 行 | 10,000 次 | ~14 次 |
| 1,000,000 行 | 1,000,000 次 | ~20 次 |

**索引查找的复杂度是 O(log n)，全表扫描是 O(n)。**

**这就是为什么数据越多，索引越重要。**

### 4.3 怎么看一个查询有没有用上索引

**用 `EXPLAIN QUERY PLAN`。**

**操作：**

```javascript
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM items WHERE code = ?").all("code5000");
console.log(plan.map(r => ({ ...r })));

const plan2 = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM items WHERE name = ?").all("name5000");
console.log(plan2.map(r => ({ ...r })));
```

**我的预期输出（第一个有索引，第二个没索引）：**

```text
// 有索引
[ { id: 3, parent: 0, notused: 0, detail: 'SEARCH items USING INDEX idx_code (code=?)' } ]

// 没索引
[ { id: 2, parent: 0, notused: 0, detail: 'SCAN items' } ]
```

**这两个词是判断依据：**

| detail 里的词 | 意思 |
|---|---|
| **`SEARCH ... USING INDEX`** | **用上了索引，快** |
| **`SCAN ...`** | **全表扫描，慢** |
| `SEARCH ... USING COVERING INDEX` | 更好，连表都不用回（覆盖索引） |
| `USE TEMP B-TREE FOR ORDER BY` | 排序时建了临时表，慢 |

**这个命令是你的"性能透视镜"。**

**以后遇到"查询慢"，第一件事就是跑 `EXPLAIN QUERY PLAN`。**

### 4.4 索引的四个代价

**索引不是免费的。加索引有成本：**

**代价一：占空间**

**一个索引就是一份额外的数据副本。** 表 100MB，两个索引可能又占 80MB。

**代价二：写入变慢**

**每次 `INSERT` / `UPDATE` / `DELETE`，所有索引都要更新。**

**我实测过（5000 条插入，表有 2 个二级索引 vs 没有）：**

```text
无二级索引 插 5000 条: 9 ms
两个二级索引 插 5000 条: 10 ms
```

**只慢 1ms？** 因为事务把 `fsync` 合并了，**索引更新的成本被稀释了。**

**但在"没有事务的频繁单条写入"场景下，索引的影响会明显得多。**

**实际经验：**

```text
索引越多，写越慢。
一个表超过 5 个索引，就要审一下"是不是真的都需要"。
```

**代价三：可能不被使用**

**有些查询写法会让索引失效：**

| 写法 | 索引失效原因 |
|---|---|
| `WHERE LOWER(code) = 'x'` | 列上套了函数 |
| `WHERE code LIKE '%x%'` | 前面有 `%` |
| `WHERE code = 5`（列是 TEXT） | 类型不匹配 |
| `WHERE code NOT IN (...)` | 否定条件通常用不上 |

**代价四：维护成本**

**表结构改了，索引要跟着改。** 而且加索引在生产环境要小心（大表加索引会锁表）。

### 4.5 什么时候该加索引

**该加的情况：**

| 情况 | 为什么 |
|---|---|
| 经常出现在 `WHERE` 里的列 | 最直接的收益 |
| 经常 `ORDER BY` 的列 | 避免排序临时表 |
| 外键列（`customer_id` 等） | JOIN 时用到 |
| `UNIQUE` 约束列 | 本来就会自动建索引 |

**不该加的情况：**

| 情况 | 为什么 |
|---|---|
| 表很小（几百行） | 全表扫描也很快，索引反成负担 |
| 列里只有几个不同值（比如 `is_deleted` 0/1） | 索引选择性差，用不上 |
| 频繁写入但很少查询的列 | 只增加写入成本 |
| 已经很宽的表加很多索引 | 空间和维护成本 |

**"选择性"是什么：**

```text
选择性 = 不同值的数量 / 总行数
```

**选择性的高低：**

| 列 | 不同值 | 选择性 | 适合索引 |
|---|---|---|---|
| `id` | 10000 / 10000 | 1.0 | 当然（已经是主键） |
| `phone` | 9000 / 10000 | 0.9 | **适合** |
| `city` | 30 / 10000 | 0.003 | 不太适合 |
| `is_deleted` | 2 / 10000 | 0.0002 | **不适合** |

**为什么 `is_deleted` 不适合：** 因为 99% 的行都是 `0`，索引告诉你"在 0 那一堆里"，跟没告诉一样。

### 4.6 复合索引的顺序（重要）

**`CREATE INDEX idx ON messages(session_id, id)` 和 `(id, session_id)` 一样吗？**

**不一样。**

**复合索引的规则：**

```text
最左前缀原则：查询条件必须包含索引的最左边那列，索引用得上。
```

**举例：索引是 `(session_id, id)`**

| 查询 | 用得上索引吗 |
|---|---|
| `WHERE session_id = 1` | ✅ 用得上 |
| `WHERE session_id = 1 AND id > 10` | ✅ 用得上（更好） |
| `WHERE id > 10` | ❌ **用不上**（缺最左列） |

**所以：**

```text
把"最常用于筛选"的列放最左边。
```

**我们第 33 节课给 `messages` 建的索引：**

```sql
CREATE INDEX idx_messages_session ON messages(session_id, id)
```

**为什么这个顺序：** 因为查询总是先按 `session_id` 筛（"某个会话的消息"），再按 `id` 排。**完美匹配最左前缀。**

### 4.7 索引的检查和清理

**看一个表有哪些索引：**

```javascript
const idx = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='items'").all();
console.log(idx);
```

**看索引有没有被用过（SQLite 没有内置统计，只能靠 `EXPLAIN QUERY PLAN` 逐个测）。**

**删掉不用的索引：**

```sql
DROP INDEX IF EXISTS idx_name;
```

**真实项目里应该定期做"索引审计"：** 把每个索引对应到查询，看有没有索引从来没被任何查询用到。

**这些用不着的索引只是在拖慢写入。**

---

## 第 5 步：五个必须撞的坑（20 分钟）

### 坑 1：`UPDATE` 忘 `WHERE`

```javascript
const before = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE balance_cents = 0").get().c;
const r = db.prepare("UPDATE accounts SET balance_cents = 0").run();
console.log("changes:", r.changes);
console.log("余额为 0 的账户数（改前/改后）：", before, "/", db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE balance_cents = 0").get().c);
```

**`changes` 是全部行数。** 说明全被改了。

**教训：`UPDATE` 后必看 `changes`。**

### 坑 2：`WHERE` 条件匹配 0 行

```javascript
const r = db.prepare("UPDATE accounts SET balance_cents = 999 WHERE id = ?").run(99999);
console.log("changes:", r.changes);   // 0
```

**`changes: 0` 但不报错。**

**这就是"以为改成功了，其实什么都没改"。**

**教训：`changes === 0` 要当错误处理。**

### 坑 3：先查余额再扣款

```javascript
// ❌ 错的（有竞态条件）
const acc = db.prepare("SELECT balance_cents FROM accounts WHERE id = ?").get(1);
if (acc.balance_cents >= 10000) {
  db.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").run(acc.balance_cents - 10000, 1);
}

// ✅ 对的（原子）
db.prepare("UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?").run(10000, 1, 10000);
```

**为什么第一个错：** 在"查"和"改"之间，别人可能也扣了款。**两个人同时操作，余额被扣两次但只扣一次钱。**

**教训：扣减操作用 `SET x = x - ?` + `WHERE x >= ?`，不要先查再算。**

### 坑 4：事务没包住批量插入

```javascript
const ins = db.prepare("INSERT INTO t3 (v) VALUES (?)");
db.exec("DELETE FROM t3");

let t = Date.now();
for (let i = 0; i < 500; i++) ins.run("v" + i);
console.log("无事务 500 条:", Date.now() - t, "ms");

db.exec("DELETE FROM t3");
t = Date.now();
db.exec("BEGIN");
for (let i = 0; i < 500; i++) ins.run("v" + i);
db.exec("COMMIT");
console.log("有事务 500 条:", Date.now() - t, "ms");
```

**你会看到几百倍的差距。** 数据量越大越夸张。

**教训：循环写入必须包事务。**

### 坑 5：索引让查询变慢（是的，会）

**这不常见，但真实存在。**

**当查询要返回"大部分行"时，走索引反而更慢：**

```javascript
// 查 90% 的行：走索引要跳 18000 次，再回表；全表扫一遍更快
const r = db.prepare("SELECT COUNT(*) AS c FROM items WHERE id > 2000").get();
```

**优化器通常会自己判断。** 但如果它判断错了（统计信息过期），就会慢。

**怎么发现：** 用 `EXPLAIN QUERY PLAN` 看它选了什么。如果选了 `USING INDEX` 但明明该全表扫，可以用：

```sql
SELECT * FROM items INDEXED BY sqlite_autoindex_items_1 WHERE ...
```

**或者干脆：**

```sql
ANALYZE;
```

**`ANALYZE` 是什么：** 让 SQLite 重新收集统计信息（每列有多少不同值、分布如何）。**优化器靠这个做决策。**

**数据大量变动后跑一次 `ANALYZE` 是好习惯。**

---

## 第 6 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第06节课\02-笔记\NOTES.md
```

**重点填：**

1. `UPDATE` 三道保险；
2. 软删除的三个代价和解决办法；
3. **事务快 1243 倍的实测数字**；
4. 索引快 3.6 倍的实测数字；
5. `EXPLAIN QUERY PLAN` 怎么读；
6. 最左前缀原则。

---

## 第 7 步：课后练习

### 练习 1：给 accounts 写安全的增删改函数

**要求：**

- `safeUpdate`：符合第 1 步的三道保险；
- `safeDelete`：软删除 + 检查 `changes`；
- `safeRestore`：恢复软删除的数据；
- 三个函数都对"垃圾参数"有兜底。

**测试用例：**

| 调用 | 预期 |
|---|---|
| `safeDelete(2)` | 成功，`is_deleted = 1` |
| `safeDelete(999)` | 报错"没有匹配的行" |
| `safeUpdate(1, { balance: -100 })` | 报错（CHECK 约束） |
| `safeUpdate(999, ...)` | 报错"没有匹配的行" |

### 练习 2：部分唯一索引

**任务：**

1. 建一张 `users` 表，`phone` 有 `UNIQUE`；
2. 插一条 `phone = "13800000001"`；
3. 软删除它（`is_deleted = 1`）；
4. **试着再插一条同样的 `phone`** —— 会失败；
5. 删掉 `UNIQUE` 约束，改成部分唯一索引：

```sql
CREATE UNIQUE INDEX idx_phone_active ON users(phone) WHERE is_deleted = 0;
```

6. 再试一次插入 —— **应该成功**。

**写出你的验证结论。**

### 练习 3：转账的边界情况

**测试 `transfer` 函数的六种情况，每个都要验证最终余额：**

| 情况 | 预期 |
|---|---|
| 正常转账 | 双方余额正确变化 |
| 余额不足 | 双方都不变 |
| 转给自己 | 报错 |
| 金额为 0 | 报错 |
| 金额为负 | 报错 |
| 目标账户不存在 | 双方都不变 |

**第 6 条最关键：** 扣款成功了但充值失败，**必须回滚**，扣的钱要退回去。

### 练习 4：索引实验

**任务：**

1. 造 50000 行数据（用事务，否则会很慢）；
2. 对 `code` 列建索引前，测 200 次查询耗时；
3. 建索引后，再测一次；
4. 用 `EXPLAIN QUERY PLAN` 对比两次的输出；
5. **试着让索引失效**：`WHERE LOWER(code) = ?`、`WHERE code LIKE '%x%'`，各测一次；
6. 记录所有数字。

**要求：把"为什么索引失效"写在笔记里。**

### 练习 5：找出这五个操作的错误

```javascript
// A
db.prepare("UPDATE accounts SET balance_cents = 0").run();

// B
db.prepare("DELETE FROM accounts WHERE name = '甲'").run();

// C
const acc = db.prepare("SELECT balance FROM accounts WHERE id=1").get();
db.prepare("UPDATE accounts SET balance = ? WHERE id=1").run(acc.balance - 100);

// D
for (const x of list) {
  db.prepare("INSERT INTO t (v) VALUES (?)").run(x);
}

// E
db.prepare("SELECT * FROM items WHERE LOWER(code) = ?").get("abc");
```

**逐个说出问题，并给出正确写法。**

### 练习 6：用自己的话讲

```text
为什么 UPDATE 忘写 WHERE 比 DELETE 忘写 WHERE 好一点？
为什么软删除要用部分唯一索引？
为什么批量插入要包事务？（用 fsync 解释）
为什么"先查余额再扣款"是错的？
```

---

## 第 8 步：最终验收

### A. UPDATE / DELETE

- [ ] 我知道 `UPDATE` 忘 `WHERE` 会改全部行
- [ ] 我知道 `changes` 是判断是否改对行的唯一依据
- [ ] 我会"先 SELECT 再 UPDATE"
- [ ] 我知道 `changes === 0` 要当错误
- [ ] 我会用 `SET x = x - ?` + `WHERE x >= ?` 做原子扣减
- [ ] 我知道 `SET x = 100` 和 `SET x = x + 100` 的区别

### B. 软删除

- [ ] 我知道软删除的三个好处
- [ ] 我知道软删除的三个代价
- [ ] 我知道所有查询都要加 `is_deleted = 0`
- [ ] 我会用部分唯一索引解决冲突
- [ ] 我知道什么时候不该软删除

### C. 事务

- [ ] 我的实测：无事务 2000 条 = ___ ms，有事务 = ___ ms
- [ ] 我能用 `fsync` 解释为什么差这么多
- [ ] 我知道循环写入必须包事务
- [ ] 我会写"要么全成功要么全失败"的转账
- [ ] 我知道 `ROLLBACK` 会撤销所有改动
- [ ] 我知道无事务时部分失败会留下脏数据

### D. 索引

- [ ] 我的实测：无索引 ___ ms，有索引 ___ ms
- [ ] 我会用 `EXPLAIN QUERY PLAN` 判断有没有用上索引
- [ ] 我知道 `SEARCH ... USING INDEX` 和 `SCAN` 的区别
- [ ] 我知道索引的四个代价
- [ ] 我知道什么列适合/不适合索引
- [ ] 我理解"选择性"（不同值数量 ÷ 总行数）
- [ ] 我知道最左前缀原则
- [ ] 我知道哪些写法会让索引失效

### E. 笔记与练习

- [ ] 笔记填完，数字都是自己实测的
- [ ] 我做了练习 1 的三个安全函数
- [ ] 我做了练习 2 的部分唯一索引
- [ ] 我做了练习 3 的转账边界
- [ ] 我做了练习 4 的索引实验
- [ ] 我做了练习 5 的错题分析

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 整表数据被改了 | `UPDATE` 忘 `WHERE` | 从备份恢复；以后先 `SELECT` |
| 整表被删了 | `DELETE` 忘 `WHERE` | 从备份恢复 |
| `changes: 0` 但不报错 | `WHERE` 没匹配到行 | 检查条件；把 0 当错误处理 |
| 余额被扣了两次 | 先查再改，有竞态 | 用 `SET x = x - ? WHERE x >= ?` |
| 批量插入极慢 | 每条都 `fsync` | 包在 `BEGIN` / `COMMIT` 里 |
| 事务中途失败，数据不一致 | 没回滚 | `catch` 里 `db.exec("ROLLBACK")` |
| 软删除后同手机号不能注册 | `UNIQUE` 约束还在 | 改部分唯一索引 `WHERE is_deleted=0` |
| 查询慢 | 没索引 | `EXPLAIN QUERY PLAN` 看是不是 `SCAN` |
| 加了索引还是慢 | 写法让索引失效 | 检查 `LOWER()`、`LIKE '%x%'`、类型不匹配 |
| 索引用不上 | 违反最左前缀 | 调整复合索引的列顺序 |
| 索引加多了写入慢 | 每个索引都要更新 | 审一下有没有没用的索引 |
| 优化器选错方案 | 统计信息过期 | `ANALYZE` |
| `UPDATE` 后 `lastInsertRowid` 有值 | 那是上一次插入的 id | UPDATE 只看 `changes` |
| 事务里报错但没退出 | 异常被吞了 | 确保 `catch` 里有 `ROLLBACK` |

---

## 附：这一节课你必须记住的八句话

```text
一、UPDATE / DELETE 之后必须看 changes。

二、changes === 0 要当错误，changes > 1 要警惕。

三、扣减用 SET x = x - ? WHERE x >= ?，不要先查再算。

四、业务数据用软删除。软删除要配部分唯一索引。

五、循环写入必须包事务。实测快 1243 倍。

六、索引让查询快，让写入慢。加之前想清楚。

七、EXPLAIN QUERY PLAN 是性能透视镜。SEARCH 是快，SCAN 是慢。

八、复合索引遵守最左前缀，筛选最常用的列放最左边。
```

---

## 附：下一步

**第 35 节课：备份与恢复。**

这是第一阶段的最后一节课。

下节课讲：

- 为什么"没备份"等于"没数据"；
- SQLite 的备份方式（**复制文件 vs `.backup` 命令，差别很大**）；
- 定时备份怎么做（Windows 任务计划）；
- **怎么验证备份是有效的**（大多数人只备份不验证）；
- 恢复演练：真的删掉数据库，再恢复回来；
- 完整的第一阶段总结。

**在你进入下节课之前：**

- [ ] 你的 `safe.db` 有 4 个账户、5000 条日志
- [ ] 你能说清 `UPDATE` 三道保险
- [ ] 你实测过事务的性能差距
- [ ] 你实测过索引的性能差距
- [ ] 你做过练习 3 的转账边界（尤其是"充值失败要回滚"）
