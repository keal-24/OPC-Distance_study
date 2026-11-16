# 第 150 节课：避免重复查询（N+1 与 COUNT）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天要修两个昨天没修好的东西：**列表接口剩下的 12ms，和那个 28ms 的 `COUNT(*)`。**
> 两个问题的共同点：**你以为只查了一次，实际查了很多次。**

**建议用时**：120 分钟
**你需要先完成**：第 149 节的三个索引
**今天要装**：什么都不用装

---

# 第 0 步：先看剩下的 12ms 是什么（20 分钟）

## 0.1 现在列表接口还剩多少

```bash
NODE_ENV=development PORT=3999 node app/index.js &
sleep 2
node scripts/bench.js
```

**昨天的结果（加了索引之后）：**

```text
列表（第1页）          P95 12ms
列表（offset=2000）    P95 14ms
列表（offset=20000）   P95 40ms
```

**12ms 里有什么？**

```text
COUNT(*)          9ms     ← 索引让它从 28ms 降到 9ms
SELECT 20 条      0.3ms   ← 走索引了
JSON.stringify    0.2ms
中间件 + 框架      2ms
────────────────────
合计约            11.5ms
```

**答案很清楚：`COUNT(*)` 占了 75%。**

## 0.2 一个必须问自己的问题

**列表页真的需要精确的 `total` 吗？**

```text
用户看到"共 100000 条，第 1/5000 页"
他实际会做什么？
  · 翻前 5 页（100 条）
  · 或者直接搜索关键词

他会不会翻到第 5000 页？
  → 不会。没人这么用。
```

**那你为什么每次都数 10 万行？**

**因为"分页控件需要一个总数"。** 这是一个"从 2005 年继承下来的习惯"。

## 0.3 四种解法，成本差 100 倍

| 方案 | 耗时 | 准确性 | 适用 |
|---|---|---|---|
| 每次都 `COUNT(*)` | 9ms | 精确 | 数据少 / 需要精确 |
| 缓存总数（写时 ±1） | 0.01ms | 精确 | **推荐** |
| 只数前 N 页（`LIMIT 1001`） | 0.3ms | "1000+" | 大表 / 不需要精确 |
| 不返回 total | 0ms | —— | 无限滚动 |

**今天做前两种，并讲清什么时候用后两种。**

---

# 第 1 步：先量出"到底查了几次"（25 分钟）★ 关键

## 1.1 N+1 是什么

**一个典型的 N+1：**

```javascript
// 查 20 条工单
const rows = db.prepare("SELECT * FROM tickets LIMIT 20").all();

// 每条再查一次它的复核状态
for (const r of rows) {
  r.review = db.prepare("SELECT * FROM review_queue WHERE trace_id = ?").get(r.trace_id);
}
```

**查询次数：1 + 20 = 21 次。**

```text
1 次主查询
+ 20 次"每条再查一次"
= 21 次
```

**如果每页 100 条 → 101 次。** 这就是 N+1。

**为什么叫 N+1：** N 条记录 + 1 次主查询。

## 1.2 怎么发现自己在 N+1

**方法一：数 SQL 执行次数**

```javascript
// scripts/count-queries.js
// 用一个包装的 db 统计"每个请求执行了几条 SQL"

import { db } from "../app/lib/db.js";

let count = 0;
const origPrepare = db.prepare.bind(db);

db.prepare = function (sql) {
  count++;
  return origPrepare(sql);
};

export function resetCount() { count = 0; }
export function getCount() { return count; }
```

**但这只统计 `prepare` 的次数，不统计 `run/get/all` 的次数。**

**更准的做法：**

```javascript
// scripts/count-queries.js
import { db } from "../app/lib/db.js";

const stats = { prepare: 0, run: 0, get: 0, all: 0, sqls: [] };

const origPrepare = db.prepare.bind(db);
db.prepare = function (sql) {
  stats.prepare++;
  stats.sqls.push(sql.trim().split("\n")[0].slice(0, 80));

  const stmt = origPrepare(sql);
  for (const m of ["run", "get", "all"]) {
    const orig = stmt[m].bind(stmt);
    stmt[m] = function (...args) {
      stats[m]++;
      return orig(...args);
    };
  }
  return stmt;
};

export function reset() {
  stats.prepare = 0; stats.run = 0; stats.get = 0; stats.all = 0; stats.sqls = [];
}
export function report() {
  const total = stats.run + stats.get + stats.all;
  return { total, ...stats };
}
```

## 1.3 一个必须做的实验：制造 N+1

**给列表接口加一段"每条查复核状态"的代码：**

```javascript
// app/routes/tickets.js（临时）
ticketsRouter.get("/tickets-n1", wrap(async (req, res) => {
  const limit = 20;
  const data = repo.listTickets({ limit, offset: 0 });

  // ❌ 故意做 N+1
  for (const row of data) {
    row.review = db.prepare("SELECT id, status FROM review_queue WHERE trace_id = ?").get(row.trace_id) ?? null;
  }

  res.json({ ok: true, data });
}));
```

**量它：**

```javascript
// scripts/bench-n1.js
import { reset, report } from "./count-queries.js";

// ... 请求 /api/tickets-n1
reset();
await fetch("http://127.0.0.1:3999/api/tickets-n1");
const r = report();
console.log("SQL 执行次数:", r.total);
console.log("其中 get:", r.get);
```

**你会看到：**

```text
SQL 执行次数: 21
其中 get: 21
```

**21 次。** 而耗时呢？

```bash
node scripts/bench.js   # 加 /api/tickets-n1 到清单
```

**期望：约 15ms（20 次小查询，每次 0.7ms）。**

**为什么 20 次查询只多 3ms？**

```text
因为有 trace_id 的 UNIQUE 索引
→ 每次 0.05ms
→ 20 × 0.05 = 1ms
```

**如果没有索引：**

```text
每次 12ms（全表扫）
→ 20 × 12 = 240ms
→ 接口从 12ms 变 250ms
```

**这就是 N+1 的可怕之处：单次查询很快，乘上 N 就致命。**

**而且 N+1 往往发生在"你加了一个功能"的时候：**

```text
今天：列表加"显示复核状态" → 20 次查询 → 12ms → 你感觉不到
明天：列表加"显示客户等级" → 又 20 次 → 25ms → 还能忍
后天：列表加"显示最近一次沟通" → 又 20 次 → 40ms → 开始慢
```

**三次迭代之后，接口从 12ms 变 50ms，而你找不到原因。**

## 1.4 一个数字目标

```text
列表接口的 SQL 执行次数 ≤ 3
```

```text
1 次 COUNT（或 0 次，如果缓存了）
1 次主查询
1 次关联查询（如果需要关联数据）
= 最多 3 次
```

**超过 3 次 → 有 N+1 或者重复查询。**

---

# 第 2 步：消灭 N+1（30 分钟）

## 2.1 标准做法：一次查完

```javascript
// ❌ N+1
const rows = repo.listTickets({ limit: 20, offset: 0 });
for (const row of rows) {
  row.review = db.prepare("SELECT id, status FROM review_queue WHERE trace_id = ?").get(row.trace_id);
}
```

```javascript
// ✅ 两次查询
const rows = repo.listTickets({ limit: 20, offset: 0 });

// 一次查完所有的
const traceIds = rows.map((r) => r.trace_id);
const placeholders = traceIds.map(() => "?").join(",");
const reviews = db.prepare(`
  SELECT trace_id, id, status FROM review_queue
  WHERE trace_id IN (${placeholders})
`).all(...traceIds);

// 在内存里合并
const map = new Map(reviews.map((r) => [r.trace_id, r]));
for (const row of rows) {
  row.review = map.get(row.trace_id) ?? null;
}
```

**查询次数：2 次（不管多少条）。**

## 2.2 三种合并方式

**方式一：`IN` + 内存 Map（最常用）**

```javascript
const ids = rows.map((r) => r.id);
const details = db.prepare(`SELECT * FROM detail WHERE ticket_id IN (${ids.map(() => "?").join(",")})`).all(...ids);
const map = new Map(details.map((d) => [d.ticket_id, d]));
```

**优点：** 简单，2 次查询。
**缺点：** 如果 `ids` 有 1000 个，SQL 会很长（SQLite 默认上限 999 个参数）。

**方式二：`JOIN`（合并成 1 次）**

```javascript
const rows = db.prepare(`
  SELECT t.*, r.status AS review_status, r.id AS review_id
  FROM tickets t
  LEFT JOIN review_queue r ON r.trace_id = t.trace_id
  ORDER BY t.created_at DESC
  LIMIT ? OFFSET ?
`).all(limit, offset);
```

**优点：** 1 次查询。
**缺点：** 结果集变大（有重复列），需要手动拆平。

**方式三：`json_group_array`（SQLite 特有）**

```javascript
const rows = db.prepare(`
  SELECT t.*,
    (SELECT json_group_array(json_object('id', r.id, 'status', r.status))
     FROM review_queue r WHERE r.trace_id = t.trace_id) AS reviews_json
  FROM tickets t
  ORDER BY t.created_at DESC LIMIT ?
`).all(limit);

for (const row of rows) {
  row.reviews = JSON.parse(row.reviews_json ?? "[]");
  delete row.reviews_json;
}
```

**优点：** 1 次查询，且结构清晰。
**缺点：** 只适合"一对少"（一条记录关联几条），不适合"一对多到几百条"。

## 2.3 选哪个

```text
关联数据是 1 条 → JOIN 或 IN 都行（推荐 IN，代码更简单）
关联数据是 0-N 条（N 小）→ json_group_array
关联数据是 0-N 条（N 大）→ IN + 两次查询（避免 JOIN 的笛卡尔积）
```

**你的场景（工单 → 复核状态，一对一）：用 `IN`。**

## 2.4 一个必须做的验证

```javascript
// scripts/verify-n1.js
import { reset, report } from "./count-queries.js";

// 旧版本
reset();
await fetch("http://127.0.0.1:3999/api/tickets-n1");
const before = report();
console.log("N+1 版本：", before.total, "次 SQL");

// 新版本
reset();
await fetch("http://127.0.0.1:3999/api/tickets");
const after = report();
console.log("修复版本：", after.total, "次 SQL");
```

**期望：**

```text
N+1 版本： 21 次 SQL
修复版本： 3 次 SQL
```

**这才是"消灭 N+1"的证明。** 不看耗时（因为索引快，耗时差异可能只有 3ms），看查询次数。

---

# 第 3 步：消灭重复的 COUNT（30 分钟）

## 3.1 方案一：缓存总数（推荐）

**原理：维护一个"总数"，写入时 ±1。**

```sql
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO counters (name, value) VALUES ('tickets', 0);
```

```javascript
// app/repos/counter.js
import { db } from "../lib/db.js";

export function getCounter(name) {
  return db.prepare("SELECT value FROM counters WHERE name = ?").get(name)?.value ?? 0;
}

export function incCounter(name, by = 1) {
  db.prepare("UPDATE counters SET value = value + ? WHERE name = ?").run(by, name);
}

export function setCounter(name, value) {
  db.prepare("UPDATE counters SET value = ? WHERE name = ?").run(value, name);
}
```

**在 `insertTicket` 里加一行：**

```javascript
export function insertTicket({...}) {
  const r = db.prepare(`INSERT INTO tickets (...) VALUES (...)`).run(...);
  incCounter("tickets", 1);      // ← 加这一行
  return r;
}
```

**列表接口改成读 counter：**

```javascript
const total = getCounter("tickets");     // 0.01ms
```

**耗时：9ms → 0.01ms。**

## 3.2 三个必须注意的坑

**坑一：初始化要对齐**

```javascript
// 首次启动或者表重建后，counter 可能是 0 而实际有 10 万行
// 需要一个"校准"动作
export function calibrateCounter(name, table) {
  const actual = db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
  setCounter(name, actual);
  return actual;
}
```

**在 `migrate()` 最后加一行（或者做成一个手动脚本）：**

```bash
node -e "import('./app/repos/counter.js').then(m => console.log(m.calibrateCounter('tickets','tickets')))"
```

**坑二：批量删除要一起减**

```javascript
export function deleteOlderThan(ms) {
  const r = db.prepare(`DELETE FROM tickets WHERE created_at < ?`).run(Date.now() - ms);
  incCounter("tickets", -r.changes);      // ← 别忘了
  return r;
}
```

**坑三：并发下会漂移**

```text
两个请求同时 INSERT
SQLite 的 UPDATE value = value + 1 是原子的（行锁）
→ 不会丢更新
→ 但如果你先 get 再 set，就会丢
```

**所以只用 `value = value + ?`，绝不用 `get → +1 → set`。**

## 3.3 方案二：只数前 N 页（更简单）

**如果不需要精确总数：**

```javascript
// 多查 1 条，判断"还有没有下一页"
const rows = repo.listTickets({ limit: limit + 1, offset });
const hasMore = rows.length > limit;
if (hasMore) rows.pop();

res.json({
  ok: true,
  data: rows,
  has_more: hasMore,
  // 不返回 total，或者返回 "更多" 标记
});
```

**耗时：0.3ms（走索引读 21 条）。**

**前端怎么用？**

```text
有 has_more → 显示"加载更多"按钮
没有 → 显示"到底了"
```

**代价：** 不能显示"第 3/5000 页"。

**这就是"无限滚动"和"页码分页"的根本区别。**

## 3.4 方案三：只数一次，缓存在内存

**如果你必须要总数，但可以接受"5 分钟内的旧值"：**

```javascript
let totalCache = { value: 0, at: 0 };
const TTL = 5 * 60_000;

function getTotalCached() {
  if (Date.now() - totalCache.at < TTL) return totalCache.value;
  totalCache = { value: db.prepare("SELECT COUNT(*) c FROM tickets").get().c, at: Date.now() };
  return totalCache.value;
}
```

**耗时：99% 的请求 0.01ms，1% 的请求 9ms。**

**但注意：**

```text
写入后的 5 分钟内，total 是旧的
→ 用户刚提交一条，列表里有了，但 total 没变
→ 用户会觉得"数字不对"
```

**所以要"写入时清缓存"，不是"等 TTL 过期"。**

```javascript
export function insertTicket({...}) {
  ...
  totalCache.at = 0;      // 清缓存
}
```

**这就退化成方案一（只是用内存变量代替表）。**

## 3.5 选哪个

| 你的场景 | 选 |
|---|---|
| 必须精确 + 高并发 | 方案一（counter 表） |
| 必须精确 + 低并发 | 方案一或三 |
| 不需要精确 | 方案二（has_more） |
| 无限滚动 | 方案二 |

**你的项目（后台列表）：方案一。**

**为什么不用方案二？** 因为你的 UI 有页码。**如果改成无限滚动，方案二更简单。**

---

# 第 4 步：一个更容易忽略的重复查询（20 分钟）

## 4.1 中间件里的重复查询

**你的请求日志中间件可能已经在查库了：**

```javascript
app.use(async (req, res, next) => {
  // ❌ 每个请求都查一次用户
  req.user = await db.prepare("SELECT * FROM users WHERE id = ?").get(req.session?.userId);
  next();
});
```

**而路由里又查了一次：**

```javascript
router.get("/tickets", async (req, res) => {
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  ...
});
```

**两次同样的查询。**

**怎么发现：**

```bash
# 用 count-queries 统计，然后看超时的 SQL 有没有重复
node -e "
import('./scripts/count-queries.js').then(async (q) => {
  q.reset();
  await fetch('http://127.0.0.1:3999/api/tickets');
  const r = q.report();
  const counts = {};
  for (const s of r.sqls) counts[s] = (counts[s] ?? 0) + 1;
  Object.entries(counts).filter(([,n]) => n > 1).forEach(([s,n]) => console.log(n+'x  '+s));
});
"
```

**输出：**

```text
2x  SELECT * FROM users WHERE id = ?
```

**两条一样的 SQL，说明重复了。**

## 4.2 修法：请求级缓存

```javascript
// app/lib/request-cache.js
export function reqCache() {
  return (req, res, next) => {
    req._cache = new Map();
    req.load = async (key, fn) => {
      if (req._cache.has(key)) return req._cache.get(key);
      const v = await fn();
      req._cache.set(key, v);
      return v;
    };
    next();
  };
}
```

**用法：**

```javascript
app.use(reqCache());

// 中间件
app.use(async (req, res, next) => {
  req.user = await req.load(`user:${req.session?.userId}`, () =>
    db.prepare("SELECT * FROM users WHERE id = ?").get(req.session?.userId)
  );
  next();
});

// 路由里
const user = await req.load(`user:${req.session.userId}`, () => ...);
// → 命中缓存，不再查库
```

**查询次数从 2 降到 1。**

## 4.3 为什么不用全局缓存

```text
全局缓存（比如一个 Map 存所有用户）：
  · 内存会涨（10 万用户就爆）
  · 数据会过期（用户改了名，缓存还是旧的）

请求级缓存：
  · 请求结束就清（无内存泄漏）
  · 一次请求内数据一致（不会出现"前半段读到旧值"）
```

**这一节的规则：**

```text
一次请求内，同一个数据只查一次 → 用请求级缓存
跨请求共享 → 用真正的缓存层（第 25 周）
```

---

# 第 5 步：验证成果（15 分钟）

```bash
NODE_ENV=development PORT=3999 node app/index.js &
sleep 2

node scripts/bench.js
node -e "
import('./scripts/count-queries.js').then(async (q) => {
  q.reset();
  await fetch('http://127.0.0.1:3999/api/tickets?limit=20');
  console.log('列表接口 SQL 次数:', q.report().total);
});
"
```

**期望：**

```text
列表（第1页）          P95 12ms → 1.5ms
列表（offset=2000）    P95 14ms → 2ms
SQL 次数：3
```

**三项成就：**

```text
① 列表 P95 从 12ms 降到 1.5ms（快 8 倍）
② SQL 次数 ≤ 3（没有 N+1）
③ 剩下的 1ms 是框架 + 序列化，不是数据库
```

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **N+1 的 21 次 vs 修复后的 3 次**
- **COUNT 的四种方案和你的选择**
- **中间件里的重复查询**
- **加 counter 之后需要注意的三个坑**

---

# 第 7 步：课后练习

## 练习一：给"按分类筛选"加 total（25 分钟）

**现在加了 `WHERE category=?`，`total` 怎么算？**

```javascript
// ❌ 慢：每次数
const total = db.prepare("SELECT COUNT(*) c FROM tickets WHERE category=?").get(cat).c;

// 你需要一个"按分类的计数"
```

**实现：**

```sql
-- counters 表加多行
INSERT OR IGNORE INTO counters (name, value) VALUES ('tickets:quality', 0), ...;

-- 或者用 GROUP BY 一次算好，缓存 5 分钟
```

**写出你的方案，并说明为什么。**

**参考答案：**

```text
如果分类只有 6 个 → 用 6 个 counter（tickets:quality 等）
  写入时按 category 加到对应 counter
  查询时 0.01ms

如果分类会动态增加 → 用一个 counter 表带 维度 列
  counters(dimension, key, value)
  但写入时多一次 UPDATE
```

## 练习二：算清"缓存 total"的漂移风险（15 分钟）

```text
如果 counter 漂移了（比如漏了某个 DELETE），多久会发现？
  用户看到"共 100000 条"，但实际只有 99998 条
  → 翻到最后一页，发现只有 2 条，而不是 20 条
  → 用户不会注意到
  → 你可能永远不知道
```

**对策：**

```text
① 每天跑一次校准（calibrateCounter），并对比差异
② 差异 > 0.1% 就告警
③ 差异 > 0 说明有漏记，去查是哪条路径漏了
```

**写一个 `scripts/check-counter.js`：**

```javascript
import { getCounter, calibrateCounter } from "../app/repos/counter.js";
import { db } from "../app/lib/db.js";

const actual = db.prepare("SELECT COUNT(*) c FROM tickets").get().c;
const cached = getCounter("tickets");
const diff = actual - cached;

console.log(`实际 ${actual}  缓存 ${cached}  差 ${diff}`);
if (Math.abs(diff) > actual * 0.001) {
  console.error(`❌ 漂移超过 0.1%，需要排查`);
  process.exit(1);
}
```

**跑它，你会发现第一次就是错的**（因为你造数据时手动插了 10 万行，绕过了 `insertTicket`）。

**这正是"缓存总数"的第一个坑：任何绕过正常写入路径的操作，都会让 counter 漂移。**

## 练习三：判断这个优化错在哪（15 分钟）

```javascript
// 优化后的列表接口
router.get("/tickets", async (req, res) => {
  const limit = 20;
  const data = db.prepare("SELECT * FROM tickets ORDER BY created_at DESC LIMIT ?").all(limit);
  const total = 100000;      // 硬编码
  res.json({ ok: true, data, total });
});
```

**错在哪？至少四条。**

**参考答案：**

```text
① 硬编码 100000 → 数据一变就错
② 忽略 req.query.limit / offset → 分页失效
③ 没走索引 → 如果 created_at 没索引，全表扫
④ 没有 trace_id → 出错时无法定位（第 137 节的约定）
⑤ 没有错误处理 → 数据库挂了直接 500 堆栈
⑥ total 应该来自 counter 或 COUNT，不能猜
```

**第 ① 条是最典型的"看起来快了很多"** —— 因为它根本不查。**但它是错的，而且错得很危险**（用户看到的数字永远是 10 万）。

---

# 第 8 步：最终验收

## A. 发现 N+1

- [ ] 写了 `scripts/count-queries.js`（包装 `prepare` / `run` / `get` / `all`）
- [ ] 造了一个 N+1 接口，实测出 **21 次 SQL**
- [ ] 知道"单次 0.05ms × 20 次 = 1ms"，**所以耗时看不出问题，但查询次数暴露了它**

## B. 消灭 N+1

- [ ] 用 `IN` + 内存 Map 合并
- [ ] 查询次数从 **21 降到 3**
- [ ] 验证用的是"查询次数"，不是"耗时"

## C. 消灭重复 COUNT

- [ ] `counters` 表建好
- [ ] `insertTicket` 里 `incCounter`
- [ ] `deleteOlderThan` 里 `incCounter(..., -changes)`
- [ ] 用 `value = value + ?`，不用 `get → +1 → set`
- [ ] 列表接口的 `total` 从 counter 读
- [ ] **列表 P95 从 12ms 降到 ≤2ms**

## D. counter 的三个坑

- [ ] 写了 `calibrateCounter`
- [ ] 跑了 `scripts/check-counter.js`，**发现第一次就是漂移的**（因为 seed 绕过了 `insertTicket`）
- [ ] 写出了"漂移怎么发现"

## E. 请求级缓存

- [ ] 找到了中间件里的重复查询（2 次同样的 SQL）
- [ ] 用 `req.load` 合并成 1 次
- [ ] 知道"为什么不用全局缓存"

## F. 成果

- [ ] 列表 P95 ≤ 2ms
- [ ] 列表 SQL 次数 ≤ 3
- [ ] 剩下的耗时是框架 + 序列化，**不是数据库**

## G. 提交

```bash
git add -A
git commit -m "第150节：消灭N+1和COUNT，列表P95 12ms→1.5ms，SQL 3次"
git push
```

---

## 本节课要能说出口的一句话

> **N+1 的可怕之处不在单次慢，在"你加了三个功能、每个加 20 次查询"之后，接口悄悄从 12ms 变 50ms，而你找不到原因。**

---

# 附：常见问题速查

**Q：N+1 的耗时只有 3ms，值得修吗？**

A：**值得，但理由不是耗时。**

```text
① 它是指数级的隐患：加 5 个关联数据 = 100 次查询
② 它会在"数据变多"时爆发：现在 20 条/页，将来 100 条/页 = 100 次
③ 它让你失去对查询次数的控制感
```

**修 N+1 的收益是"未来的可预测性"，不是"现在的 3ms"。**

**Q：`IN (?)` 有 999 个参数上限，怎么办？**

A：**三个办法：**

```text
① 分片查询（每 500 个一批）
② 用临时表（把 id 插入 temp 表，然后 JOIN）
③ 如果你的 limit ≤ 100，永远不会触发
```

**你的列表接口 `limit ≤ 100`，安全。**

**但如果是"批量导出"，会有几千个 id → 必须分片。**

**Q：counter 表会不会成为新的瓶颈？**

A：**会，如果写入很频繁。**

```text
1000 次/秒的 INSERT
→ 每次都要 UPDATE counters 同一行
→ 这一行成为热点（所有写入排队）
```

**SQLite 的写本来就是串行的（数据库级写锁），所以这个热点和"写表本身"是同一个瓶颈，不会额外恶化。**

**但如果将来换 Postgres，这行会成为真正的热点。** 那时要改成"分片计数器"（10 个 counter 各记一部分，读取时相加）。

**Q：`has_more` 方案会不会让用户困惑？**

A：**取决于你的 UI。**

```text
页码分页（1 2 3 ... 5000） → 必须要 total
加载更多按钮              → 只要 has_more
无限滚动                  → 只要 has_more
```

**只有第一种需要 total。** 而现在大部分产品都在往第二种走。

**Q：怎么知道"还有没有别处的重复查询"？**

A：**跑一次全接口的查询次数统计：**

```javascript
// scripts/audit-queries.js
const ENDPOINTS = ["/api/tickets", "/api/tickets?category=quality", "/api/stats", "/api/review/stats"];

for (const ep of ENDPOINTS) {
  reset();
  await fetch(BASE + ep);
  const r = report();
  console.log(`${ep.padEnd(36)} ${r.total} 次`);

  // 找重复
  const counts = {};
  for (const s of r.sqls) counts[s] = (counts[s] ?? 0) + 1;
  Object.entries(counts).filter(([, n]) => n > 1)
    .forEach(([s, n]) => console.log(`  ⚠️ ${n}x ${s}`));
}
```

**任何接口超过 3 次，或者有重复 SQL，都要查。**

**Q：这一节的成果怎么量化给客户看？**

A：**用三个数字：**

```text
列表接口 P95：12ms → 1.5ms（快 8 倍）
SQL 执行次数：21 次 → 3 次
每页 100 条时：2100 次 → 3 次（潜在事故）
```

**第三个数字最有说服力** —— 它说明"如果你哪天把每页改成 100 条，旧代码会挂"。
