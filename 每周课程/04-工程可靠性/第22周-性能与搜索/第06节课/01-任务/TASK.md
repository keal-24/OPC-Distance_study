# 第 153 节课：结果排序

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天要解决一个很容易被忽略的问题：**你的排序，会让索引失效。**
> 而且你会看到"按热度排序"是怎么把 0.3ms 变成 200ms 的。

**建议用时**：120 分钟
**你需要先完成**：第 152 节的 FTS5 搜索
**今天要装**：什么都不用装

---

# 第 0 步：排序为什么会拖垮查询（20 分钟）

## 0.1 两种排序，天壤之别

```sql
-- 排序字段有索引 → 索引本身就是排好序的 → 直接读
SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20;
→ 0.31ms（走 idx_tickets_created）

-- 排序字段没索引 → 先取出所有行，再在内存里排
SELECT * FROM tickets ORDER BY LENGTH(input) DESC LIMIT 20;
→ 200ms+（全表扫 + 排序 10 万行）
```

**关键差别：**

```text
有索引：索引已经排好序 → 顺序读 20 条 → 停
没索引：读 10 万行 → 排序（O(n log n)）→ 取前 20 条
```

## 0.2 五种常见的"排序需求"

| 需求 | 排序字段 | 有索引吗 | 可行性 |
|---|---|---|---|
| 最新优先 | `created_at DESC` | ✅ 有 | 0.3ms |
| 最紧急优先 | `urgency DESC, created_at DESC` | 可以建 | 1ms |
| 按分类 | `category, created_at DESC` | ✅ 有（复合） | 0.5ms |
| **按文本长度** | `LENGTH(input) DESC` | ❌ 函数 | **200ms** |
| **按"热度"** | `hot_score DESC` | 需要预计算 | 取决于设计 |
| **搜索相关度** | `rank`（FTS 虚拟列） | FTS5 内部 | 0.8ms |

**三种"不可直接排序"的：**

```text
① 函数结果（LENGTH / 某个计算）
   → 无法建索引
   → 解法：加一个"预计算列"

② 多表聚合（COUNT(comments)）
   → 无法建索引
   → 解法：加一个"计数列"，写入时维护

③ 业务权重（热度 = 浏览×1 + 评论×3 + 时间衰减）
   → 无法建索引（除非预计算）
   → 解法：定时任务算好存一列
```

## 0.3 今天的三个产出

```text
① 给"按长度排序"加预计算列，200ms → 0.4ms
② 实现"热度排序"，并讲清"定时算"和"实时算"的取舍
③ 处理"稳定排序"（同分时怎么办）
```

---

# 第 1 步：先量出"函数排序"的代价（25 分钟）

## 1.1 五种排序的耗时

```javascript
// scripts/bench-sort.js
import { db } from "../app/lib/db.js";

function time(label, sql, n = 10) {
  const stmt = db.prepare(sql);
  for (let i = 0; i < 2; i++) stmt.all();

  const lat = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    stmt.all();
    lat.push(performance.now() - t0);
  }
  lat.sort((a, b) => a - b);
  console.log(
    label.padEnd(42) +
    `P50 ${lat[Math.floor(lat.length * 0.5)].toFixed(1)}ms`.padStart(14)
  );
}

console.log("五种排序（10 万行）\n");

time("ORDER BY created_at DESC",
  "SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20");

time("ORDER BY id DESC",
  "SELECT * FROM tickets ORDER BY id DESC LIMIT 20");

time("ORDER BY category, created_at DESC",
  "SELECT * FROM tickets ORDER BY category DESC, created_at DESC LIMIT 20");

time("ORDER BY LENGTH(input) DESC   ← 函数",
  "SELECT * FROM tickets ORDER BY LENGTH(input) DESC LIMIT 20");

time("ORDER BY id*2 DESC             ← 表达式",
  "SELECT * FROM tickets ORDER BY id*2 DESC LIMIT 20");

time("ORDER BY need_human DESC, created_at DESC",
  "SELECT * FROM tickets ORDER BY need_human DESC, created_at DESC LIMIT 20");
```

## 1.2 你会看到

```text
ORDER BY created_at DESC                    P50   0.3ms   ← 走索引
ORDER BY id DESC                            P50   0.3ms   ← 主键天然有序
ORDER BY category, created_at DESC          P50   0.5ms   ← 复合索引
ORDER BY LENGTH(input) DESC                 P50 212.4ms  ← 全表扫 + 排序
ORDER BY id*2 DESC                          P50 198.7ms  ← 同上
ORDER BY need_human DESC, created_at DESC   P50  89.2ms   ← 没索引
```

**三个结论：**

```text
① 有索引的排序：0.3–0.5ms
② 没索引但有字段的排序：89ms（全表扫 + 排序）
③ 函数 / 表达式排序：200ms（更慢，因为每行要算一次函数）
```

**第 ③ 条比第 ② 条还慢 2 倍** —— 因为要在 10 万行上执行 10 万次 `LENGTH()`。

## 1.3 一个必须理解的原理

```text
ORDER BY 有索引：
  索引里的键是有序的
  → 顺着索引读，读到 20 条就停
  → O(20)

ORDER BY 没索引：
  读所有行
  → 全部放进内存（10 万行 × 300 字节 = 30MB）
  → 排序（O(n log n) ≈ 170 万次比较）
  → 取前 20
  → O(n log n)
```

**内存占用也是问题：**

```text
10 万行 × 300 字节 = 30MB
如果并发 10 个这样的查询 = 300MB
→ 内存爆
```

**SQLite 会在排序时用临时文件（`temp_store`），但那是磁盘 IO，更慢。**

---

# 第 2 步：预计算列（35 分钟）★ 核心

## 2.1 方案：加一列存"算好的值"

```sql
ALTER TABLE tickets ADD COLUMN input_len INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_tickets_len ON tickets(input_len DESC);
```

**写入时维护：**

```javascript
// app/repos/ticket.js
export function insertTicket({ traceId, input, output, category, urgency, needHuman, route, degraded }) {
  return db.prepare(`
    INSERT INTO tickets
      (trace_id, input, input_len, output, category, urgency, need_human, route, degraded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    traceId,
    input,
    [...String(input)].length,      // ← 按字符数（中文一个字算一个）
    output, category, urgency, needHuman ? 1 : 0, route, degraded ? 1 : 0,
    Date.now()
  );
}
```

**注意 `[...String(input)].length`** —— 用扩展运算符按"码点"计数。

```javascript
"abc".length           // 3
"中文".length          // 2
"😀".length            // 2（UTF-16 代理对，错！）
[...("😀")].length     // 1（正确）
```

**你的场景是中文，`length` 就够（中文在 UTF-16 里是 1 个码元）。但用扩展运算符更安全。**

## 2.2 回填历史数据

```sql
UPDATE tickets SET input_len = LENGTH(input) WHERE input_len = 0;
```

```javascript
// 加到 migrate 里（只跑一次）
export function backfillInputLen() {
  const n = db.prepare("SELECT COUNT(*) c FROM tickets WHERE input_len = 0").get().c;
  if (n === 0) return 0;

  const t0 = Date.now();
  db.exec("UPDATE tickets SET input_len = LENGTH(input) WHERE input_len = 0");
  console.log(`回填 input_len：${n} 行，耗时 ${Date.now() - t0}ms`);
  return n;
}
```

**注意：`LENGTH()` 在 SQLite 里对 TEXT 是"字符数"，对 BLOB 是"字节数"。** 你的 `input` 是 TEXT，所以字符数正确。

## 2.3 一个必须做的坑：更新时同步

```javascript
// ❌ 只更新 input，忘了 input_len
export function updateInput(id, newInput) {
  db.prepare("UPDATE tickets SET input = ? WHERE id = ?").run(newInput, id);
  // → input_len 还是旧值！
}
```

```javascript
// ✅ 两个一起更新
export function updateInput(id, newInput) {
  db.prepare("UPDATE tickets SET input = ?, input_len = ? WHERE id = ?")
    .run(newInput, [...String(newInput)].length, id);
}
```

**或者用触发器（更保险）：**

```sql
CREATE TRIGGER IF NOT EXISTS tickets_len_ai AFTER INSERT ON tickets BEGIN
  UPDATE tickets SET input_len = LENGTH(new.input) WHERE id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS tickets_len_au AFTER UPDATE OF input ON tickets BEGIN
  UPDATE tickets SET input_len = LENGTH(new.input) WHERE id = new.id;
END;
```

**推荐触发器** —— 它保证"无论谁改 input，input_len 都会同步"。

**但注意：触发器会让写入多一次 UPDATE。**

```text
无触发器：INSERT 1 次
有触发器：INSERT + UPDATE 2 次
→ 慢约 30%
```

**取舍：**

```text
手动维护 = 快，但可能漏
触发器   = 稳，但慢 30%
```

**你的写入量（每天 1000 条）选触发器没问题。如果每天 100 万条，选手动 + 严格 code review。**

## 2.4 量它

```javascript
time("ORDER BY input_len DESC（预计算）",
  "SELECT * FROM tickets ORDER BY input_len DESC LIMIT 20");
```

**期望：0.4ms。**

**对比：**

```text
ORDER BY LENGTH(input) DESC   → 212ms
ORDER BY input_len DESC       → 0.4ms
```

**快 530 倍。**

## 2.5 一个必须验证的 EXPLAIN

```javascript
console.log(db.prepare("EXPLAIN QUERY PLAN SELECT * FROM tickets ORDER BY input_len DESC LIMIT 20").all());
```

**期望：**

```text
SCAN tickets USING INDEX idx_tickets_len
```

**如果看到 `USE TEMP B-TREE FOR ORDER BY`** → 索引没生效 → 检查索引是不是 `DESC`。

**关键：`CREATE INDEX idx ON tickets(input_len DESC)` 这个 `DESC` 很重要。**

```text
CREATE INDEX idx ON tickets(input_len)        → 索引是升序
ORDER BY input_len DESC                       → 需要反向读（SQLite 能，但某些版本会退化成 TEMP B-TREE）
CREATE INDEX idx ON tickets(input_len DESC)   → 索引本身是降序，直接读
```

**为了保险，显式写 `DESC`。**

---

# 第 3 步：热度排序（30 分钟）

## 3.1 一个真实的"热度公式"

```text
hot_score = log(浏览量 + 1) × 4
          + log(评论数 + 1) × 8
          + 紧急度权重（high=20 / medium=10 / low=0）
          - 时间衰减（每小时 -0.5）
```

**这个公式有三个特点：**

```text
① 依赖多个数据源（浏览、评论、紧急度、时间）
② 有 log（防止某个指标独占）
③ 有时间衰减（旧内容自动下沉）
```

## 3.2 实时算 vs 定时算

**实时算（每次查询都算）：**

```sql
SELECT *,
  log(view_count + 1) * 4
  + log(comment_count + 1) * 8
  + CASE urgency WHEN 'high' THEN 20 WHEN 'medium' THEN 10 ELSE 0 END
  - (strftime('%s','now') - created_at/1000) / 3600.0 * 0.5 AS hot
FROM tickets
ORDER BY hot DESC
LIMIT 20;
```

**问题：**

```text
· 每行都要算 4 个运算 + 1 个 log
· 10 万行 → 50 万个操作
· 无法用索引
· 耗时 300ms+
```

**定时算（存成一列）：**

```sql
ALTER TABLE tickets ADD COLUMN hot_score REAL NOT NULL DEFAULT 0;
CREATE INDEX idx_tickets_hot ON tickets(hot_score DESC);
```

**每 5 分钟跑一次：**

```javascript
// app/repos/hot.js
export function recomputeHotScores() {
  const t0 = Date.now();
  const now = Date.now();

  // 只更新"最近 30 天"的（老的分数已经很低，不值得算）
  const r = db.prepare(`
    UPDATE tickets SET hot_score =
      log(view_count + 1) * 4
      + log(comment_count + 1) * 8
      + CASE urgency WHEN 'high' THEN 20 WHEN 'medium' THEN 10 ELSE 0 END
      - (? - created_at) / 3600000.0 * 0.5
    WHERE created_at > ?
  `).run(now, now - 30 * 86_400_000);

  const ms = Date.now() - t0;
  console.log(`重算热度：${r.changes} 行，${ms}ms`);
  return { rows: r.changes, ms };
}
```

**查询：**

```sql
SELECT * FROM tickets ORDER BY hot_score DESC, id DESC LIMIT 20;
→ 0.3ms（走索引）
```

## 3.3 逐段解释三个关键设计

**① 为什么只算"最近 30 天"**

```text
30 天前的内容，时间衰减已经扣了 30×24×0.5 = 360 分
→ hot_score 是负数
→ 永远排在后面
→ 算了也没用
```

**如果全部重算：**

```text
10 万行 × 每行 5 个运算 = 50 万次
耗时 400ms（每 5 分钟跑一次，还行）
但如果有 100 万行 → 4 秒 → 会有锁竞争
```

**只算 30 天：**

```text
假设 30 天有 3 万行 → 3 万次 → 120ms
→ 安全得多
```

**② 为什么时间衰减要用"毫秒差 / 3600000"**

```sql
- (? - created_at) / 3600000.0 * 0.5
```

```text
? - created_at      = 毫秒差
/ 3600000           = 小时差
* 0.5               = 每小时扣 0.5 分
```

**注意 `/ 3600000.0` 的小数点** —— 不加会整数除法，全部变 0。

**这是 SQL 里最常见的坑。**

**③ 为什么和 `id DESC` 一起排**

```sql
ORDER BY hot_score DESC, id DESC
```

**同分时（很常见，因为 log 会压低差异）需要一个确定的顺序，否则分页会重复/遗漏（第 151 节讲过）。**

## 3.4 一个必须做的实验：定时算 vs 实时算

```javascript
// scripts/bench-hot.js
import { db } from "../app/lib/db.js";
import { recomputeHotScores } from "../app/repos/hot.js";

console.log("先重算一次\n");
const r = recomputeHotScores();

console.log("\n定时算（读索引）：");
{
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) {
    db.prepare("SELECT * FROM tickets ORDER BY hot_score DESC, id DESC LIMIT 20").all();
  }
  console.log("  P50 约", ((performance.now() - t0) / 10).toFixed(2), "ms");
}

console.log("\n实时算（每次算 log）：");
{
  const sql = `
    SELECT *, log(view_count + 1) * 4 + CASE urgency WHEN 'high' THEN 20 ELSE 0 END AS hot
    FROM tickets ORDER BY hot DESC LIMIT 20
  `;
  const t0 = performance.now();
  try {
    for (let i = 0; i < 3; i++) db.prepare(sql).all();
    console.log("  P50 约", ((performance.now() - t0) / 3).toFixed(2), "ms");
  } catch (e) {
    console.log("  失败：", e.message, "（可能没有 view_count 列）");
  }
}
```

**如果 `view_count` 不存在，先加：**

```javascript
db.exec(`
  ALTER TABLE tickets ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tickets ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;
`);
```

**期望：**

```text
定时算（读索引）：  P50 约 0.31 ms
实时算（每次算 log）：P50 约 320.4 ms
```

**快 1000 倍。**

## 3.5 一个必须接受的"不准"

```text
定时算 → 每 5 分钟更新一次
→ 一条新工单在最热的 5 分钟里，hot_score 是 0
→ 用户看不到它
```

**如果业务要求"新内容立刻可见"，怎么办？**

```text
方案一：写入时立刻算一次（单条，成本 0.1ms）
方案二：混合排序
  新内容（< 5 分钟）按 created_at 排，老的按 hot_score 排
  → UNION 或两个查询
方案三：接受不准确（大部分列表页可以）
```

**你的场景（后台工单列表）：方案一。**

```javascript
export function insertTicket({...}) {
  const r = db.prepare(`INSERT ...`).run(...);
  // 立刻算一次这个新工单的热度
  db.prepare(`
    UPDATE tickets SET hot_score =
      log(view_count + 1) * 4
      + CASE urgency WHEN 'high' THEN 20 WHEN 'medium' THEN 10 ELSE 0 END
      - 0
    WHERE id = ?
  `).run(r.lastInsertRowid);
  return r;
}
```

**注意 `- 0`（因为刚创建，时间衰减为 0）。**

---

# 第 4 步：稳定排序（20 分钟）

## 4.1 什么是不稳定排序

```sql
-- 只按 hot_score 排
SELECT * FROM tickets ORDER BY hot_score DESC LIMIT 20 OFFSET 0;

-- 下一页
SELECT * FROM tickets ORDER BY hot_score DESC LIMIT 20 OFFSET 20;
```

**如果有多条 hot_score 相同：**

```text
第 1 页：A(100) B(100) C(100) ...
数据库可能返回 A B C，也可能返回 C A B
→ 第 2 页可能重复 A，也可能漏掉 C
```

**这就是"不稳定"。**

## 4.2 解法：加一个唯一列做兜底

```sql
ORDER BY hot_score DESC, id DESC
```

**`id` 是唯一的，所以组合后一定稳定。**

**规则：**

```text
任何分页的 ORDER BY，最后一列必须是唯一列（通常是 id）
```

**今天要检查你所有的分页查询：**

```bash
grep -rn "ORDER BY" app/repos/ --include="*.js" | grep -i "limit"
```

**每一条都要有这个特征：**

```javascript
// ❌ 不稳定
ORDER BY created_at DESC
ORDER BY hot_score DESC

// ✅ 稳定
ORDER BY created_at DESC, id DESC
ORDER BY hot_score DESC, id DESC
```

**已经加过的（第 151 节）不用改。检查剩下的。**

## 4.3 一个必须做的实验

```javascript
// scripts/test-sort-stability.js
import { db } from "../app/lib/db.js";

// 造 20 条同分数据
const stmt = db.prepare(`
  INSERT INTO tickets (trace_id, input, category, urgency, need_human, route, degraded, created_at, hot_score)
  VALUES (?, ?, 'other', 'low', 0, 'auto', 0, ?, 50)
`);
const ts = Date.now();
for (let i = 0; i < 20; i++) stmt.run(`tr_stable_${i}`, "x", ts);

// 不稳定排序：翻两页，看重复
function check(orderBy, label) {
  const page1 = db.prepare(`SELECT id FROM tickets ORDER BY ${orderBy} LIMIT 5`).all();
  const page2 = db.prepare(`SELECT id FROM tickets ORDER BY ${orderBy} LIMIT 5 OFFSET 5`).all();

  const p1 = new Set(page1.map((r) => r.id));
  const dup = page2.filter((r) => p1.has(r.id));

  console.log(`${label}: 第1页 ${page1.map(r=>r.id).join(",")}`);
  console.log(`         第2页 ${page2.map(r=>r.id).join(",")}  重复 ${dup.length}`);
}

check("hot_score DESC", "只按 hot_score");
check("hot_score DESC, id DESC", "hot_score + id");
```

**只按 `hot_score` 时，重复数可能不是 0（取决于 SQLite 的排序稳定性）。**

**加 `id DESC` 后一定是 0。**

**注意：SQLite 的排序在"数据量小、全在内存"时通常是稳定的，所以你可能测不出问题。**

**但一旦数据量大到要用临时文件排序（`temp_store=MEMORY` 装不下），稳定性就没了。**

**所以必须"结构性稳定"，不能依赖"这次恰好稳定"。**

---

# 第 5 步：一张排序决策表（15 分钟）

```markdown
# 排序方案

| 需求 | SQL | 索引 | 耗时 | 备注 |
|---|---|---|---|---|
| 最新优先 | `ORDER BY created_at DESC, id DESC` | `idx_tickets_created` | 0.3ms | ✅ |
| 按分类 + 最新 | `WHERE category=? ORDER BY created_at DESC, id DESC` | `idx_tickets_cat_created` | 0.5ms | ✅ |
| 按长度 | `ORDER BY input_len DESC, id DESC` | `idx_tickets_len` | 0.4ms | 预计算列 |
| 按热度 | `ORDER BY hot_score DESC, id DESC` | `idx_tickets_hot` | 0.3ms | 定时算 + 写入时算 |
| 搜索相关度 | `ORDER BY rank, created_at DESC, id DESC` | FTS5 内部 | 0.8ms | 第 152 节 |

## 不可直接排序的三种情况

| 情况 | 为什么 | 解法 |
|---|---|---|
| 函数（`LENGTH(x)`） | 无法建索引 | 加预计算列 |
| 多表聚合（`COUNT(*)`） | 无法建索引 | 加计数列，写入时维护 |
| 业务公式（热度） | 无法建索引 | 定时算成列 |

## 稳定排序规则

```text
所有分页查询的 ORDER BY，最后一列必须是 id（或另一个唯一列）
```

## 复查条件

```text
· 表超过 50 万行 → 检查"定时算热度"的耗时
· 加了新的排序需求 → 先问"能不能预计算"
· 某个列表变慢 → 先看 EXPLAIN 有没有 TEMP B-TREE
```
```

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **五种排序的耗时对比**
- **函数排序为什么比"无索引字段排序"更慢**
- **预计算列让 212ms 变成多少**
- **热度定时算 vs 实时算的倍数**

---

# 第 7 步：课后练习

## 练习一：给"按紧急度排序"建索引（20 分钟）

```sql
SELECT * FROM tickets
ORDER BY
  CASE urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
  created_at DESC
LIMIT 20;
```

**这个查询能用索引吗？为什么？**

**参考答案：**

```text
不能。CASE 表达式无法建索引。
```

**三种解法：**

```text
① 加一列 urgency_rank（high=0, medium=1, low=2），建 (urgency_rank, created_at) 索引
② 用 ORDER BY urgency DESC（字符串排序 high > medium > low 恰好对）
   但这是巧合，不可靠
③ 建 (urgency, created_at)，然后 ORDER BY urgency DESC, created_at DESC
   → 因为 'high' > 'low' > 'medium'（字典序），结果不对 ❌
```

**正确答案是 ①。**

**验证 ③ 为什么错：**

```javascript
["high", "medium", "low"].sort()   // ["high", "low", "medium"]
```

**字典序里 `low` 在 `medium` 前面。所以直接按 `urgency` 排会得到 high → low → medium，是错的。**

## 练习二：算清热度重算的成本（15 分钟）

```text
30 天数据 ____ 行
每行 5 个运算
重算一次 ____ ms
每 5 分钟一次 → 每天 ____ 次 → 每天 ____ 秒
```

**如果这个数字太大，怎么办？**

```text
① 只重算"分数可能变化的"（最近 7 天 + 有浏览/评论的）
② 拉长间隔（15 分钟一次）
③ 增量更新（只更新变化的行）
```

**写下你的方案。**

## 练习三：判断这个排序错在哪（15 分钟）

```javascript
// 列表接口
const rows = db.prepare(`
  SELECT *, LENGTH(input) AS len
  FROM tickets
  ORDER BY len DESC
  LIMIT 20 OFFSET ?
`).all(offset);
```

**错在哪？至少四条。**

**参考答案：**

```text
① LENGTH(input) 是函数排序 → 全表扫 + 排序 10 万行 → 200ms
   → 应该用预计算列 input_len + 索引

② 没有 id 兜底 → 同长度的行顺序不稳定 → 分页重复/遗漏

③ OFFSET 分页 → 第 1000 页会慢 1000 倍（第 151 节）
   → 应该用 keyset

④ SELECT * 返回全部列 → 浪费带宽和内存
   → 应该只选需要的列

⑤ 用别名 len 在 ORDER BY 里 → SQLite 支持，但标准 SQL 不支持
   → 换个数据库可能报错
```

**第 ② 条最隐蔽。** 因为 `LENGTH` 的结果只有几十种可能值，**重复必然大量存在**，所以不稳定的概率极高。

---

# 第 8 步：最终验收

## A. 量出五种排序

| 排序 | P50 | 走索引 |
|---|---|---|
| `created_at DESC` | __ms | ✅ |
| `id DESC` | __ms | ✅ |
| `category, created_at DESC` | __ms | ✅ |
| `LENGTH(input) DESC` | __ms | ❌ **最慢** |
| `id*2 DESC` | __ms | ❌ |
| `need_human DESC, created_at DESC` | __ms | ❌ |

- [ ] 函数排序比"无索引字段排序"更慢（我实测过）
- [ ] 能解释"为什么函数更慢"（每行算一次函数）

## B. 预计算列

- [ ] `input_len` 列加好了
- [ ] `idx_tickets_len ON tickets(input_len DESC)` 建好了
- [ ] 写入时维护（`[...String(input)].length`）
- [ ] **历史数据回填了**（`UPDATE ... WHERE input_len = 0`）
- [ ] `updateInput` 也同步更新 `input_len`（或用触发器）

## C. 预计算的效果

```text
ORDER BY LENGTH(input) DESC   →  ____ ms
ORDER BY input_len DESC       →  ____ ms
快 ____ 倍
```

- [ ] `EXPLAIN` 显示 `SCAN tickets USING INDEX idx_tickets_len`
- [ ] **没有 `USE TEMP B-TREE FOR ORDER BY`**

## D. 热度排序

- [ ] `hot_score` + `view_count` + `comment_count` 列加好了
- [ ] `idx_tickets_hot` 建好了
- [ ] `recomputeHotScores()` 只算最近 30 天
- [ ] `insertTicket` 里立刻算一次新工单的热度
- [ ] 定时算 vs 实时算的倍数测出来了（应该 100 倍以上）

## E. 稳定排序

- [ ] `grep "ORDER BY" app/repos/` 里每条都带 `id DESC`
- [ ] 跑了稳定性测试（20 条同分）
- [ ] 我知道"小数据量时 SQLite 恰好稳定，不能依赖"

## F. 排序决策表

- [ ] `SORTING.md` 或 `PERF.md` 里有这张表
- [ ] 五种需求各对应哪个索引
- [ ] 三种"不可直接排序"的解法写清
- [ ] 有"复查条件"

## G. 提交

```bash
git add -A
git commit -m "第153节：预计算列+热度排序，函数排序212ms→0.4ms"
git push
```

---

## 本节课要能说出口的一句话

> **`ORDER BY` 一个函数，索引就死了。要么预计算成列，要么接受 200ms。**

---

# 附：常见问题速查

**Q：为什么 `ORDER BY LENGTH(input)` 比 `ORDER BY need_human` 还慢？**

A：**因为函数要对每一行执行一次。**

```text
ORDER BY need_human（无索引）：
  读 10 万行 → 排序（用已有的值比较）
  每次比较 = 读一个整数

ORDER BY LENGTH(input)：
  读 10 万行 → 每行算一次 LENGTH() → 排序
  每次比较 = 读字符串 + 算长度
  → 10 万次 LENGTH 调用
```

**多出来的就是"10 万次函数调用"。**

**Q：预计算列会不会"数据不一致"？**

A：**会，如果更新时忘了同步。**

```text
三种防法：
① 用触发器（最稳，慢 30%）
② 所有写入都走同一个函数（`insertTicket` / `updateInput`）
③ 每天跑一次校准脚本，对比 `input_len` 和 `LENGTH(input)`
```

**推荐 ① + ③。** 触发器保证实时一致，校准脚本兜住"万一"。

**Q：热度排序的"5 分钟延迟"能接受吗？**

A：**看场景。**

```text
后台工单列表   → 能接受（没人盯着一秒一变）
新闻/社区首页 → 不能（新内容必须立刻可见）
搜索结果的"热度" → 能接受（本来就是排序辅助）
```

**不能接受的场景用"写入时也算一次"（第 3.5 节）。**

**Q：`ORDER BY hot_score DESC, id DESC` 能走索引吗？**

A：**能，但要建复合索引。**

```sql
CREATE INDEX idx_hot_id ON tickets(hot_score DESC, id DESC);
```

**只建 `(hot_score)` 时，SQLite 会用索引读 hot_score 有序的部分，但同一 hot_score 内部还要排序 → 可能有 TEMP B-TREE。**

**建复合索引之后就完全无排序。**

**Q：为什么 `urgency` 直接排序是错的？**

A：**因为字典序。**

```javascript
["high", "medium", "low"].sort()   // → ["high", "low", "medium"]
```

**`low` 在 `medium` 前面。所以：**

```sql
ORDER BY urgency DESC   → high, low, medium   ❌
```

**解法：加 `urgency_rank`（high=0/medium=1/low=2），或 `CASE` 表达式（但那样就用不上索引）。**

**Q：`DESC` 索引和 `ASC` 索引有区别吗？**

A：**有，但 SQLite 通常能反向读 ASC 索引来服务 DESC 查询。**

```text
CREATE INDEX idx ON t(x)        → ORDER BY x DESC 需要反向扫描（有些版本会退化成 TEMP B-TREE）
CREATE INDEX idx ON t(x DESC)   → ORDER BY x DESC 直接读
```

**为了确定性，排序方向和你常用的查询一致时，显式写 `DESC`。**

**Q：这一节的成果怎么量化？**

A：**三个数字：**

```text
函数排序 → 预计算：212ms → 0.4ms（530 倍）
热度实时算 → 定时算：320ms → 0.31ms（1000 倍）
所有分页 ORDER BY 都带 id 兜底：0 处不稳定
```
