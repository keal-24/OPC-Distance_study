# 第 154 节课：性能档案（PERF.md）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天不写新代码。**把这一周所有数字变成一张能交给别人的表，并写下"什么时候该复查"。**
> 这份文件是你三个月后唯一还会看的东西。

**建议用时**：110 分钟
**你需要先完成**：第 148–153 节的全部
**今天要装**：什么都不用装

---

# 第 0 步：为什么必须写这份档案（15 分钟）

## 0.1 一个三个月后的场景

```text
客户：「你们这个系统最近变慢了，以前一秒，现在三秒。」
你：「是吗……我看看。」
（打开项目，跑了三个月，表从 3 万行变 30 万行）
（不知道三个月前的数字是多少）
（不知道现在的数字算不算慢）
（不知道瓶颈在哪）
→ 你只能说"我优化一下"，但不知道优化什么
```

**如果你有 `PERF.md`：**

```text
打开它，看到：
  2026-11-17：10 万行，列表 P95 12ms，搜索 P95 0.8ms，索引 3 个
  「复查条件：表超过 50 万行时重测」

现在的数字：
  30 万行，列表 P95 28ms
→ 3 倍数据 → 2.3 倍耗时，是线性的，正常
→ 还不到 50 万行，不用动
→ 但日志显示 COUNT 还是每次查（第 150 节本该修），去查
```

**差别：一个靠猜，一个靠比。**

## 0.2 一份好档案的四个特征

```text
① 有绝对数字（不是"快了"）
② 有对照（改之前 vs 改之后）
③ 有环境（机器、数据量、版本）
④ 有触发条件（什么时候该复查）
```

**缺 ③ 的后果：**

```text
三个月后你换了台机器（或者升了 Node）
→ 数字变了
→ 你不知道是"代码变慢"还是"机器变快"
→ 档案失效
```

**缺 ④ 的后果：**

```text
档案写完就再也没打开过
→ 直到出事才翻
→ 那时已经晚了
```

## 0.3 今天的产出

```text
PERF.md                   主档案（能交给别人看）
scripts/perf-report.js    自动生成当前数字（跑一次刷新）
PERF-LOG.md               变更记录（每次优化记一行）
```

---

# 第 1 步：写自动生成脚本（30 分钟）

## 1.1 一条命令产出所有数字

```javascript
// scripts/perf-report.js
// 生成当前性能快照。用法：node scripts/perf-report.js [--json]
import fs from "node:fs";
import path from "node:path";
import { db } from "../app/lib/db.js";
import { config } from "../app/config/index.js";

const asJson = process.argv.includes("--json");

// ===== 通用计时 =====
function time(fn, n = 20, warm = 3) {
  for (let i = 0; i < warm; i++) fn();
  const lat = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    lat.push(performance.now() - t0);
  }
  lat.sort((a, b) => a - b);
  const p = (q) => +(lat[Math.min(Math.floor(lat.length * q), lat.length - 1)]).toFixed(2);
  return { p50: p(0.5), p95: p(0.95) };
}

// ===== 1. 数据规模 =====
const tables = {};
for (const t of ["tickets", "review_queue", "tickets_fts"]) {
  try { tables[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; }
  catch { tables[t] = null; }
}

const dbSize = (() => {
  try { return +(fs.statSync(config.db.file).size / 1e6).toFixed(1); }
  catch { return null; }
})();

// ===== 2. 索引清单 =====
const indexes = db.prepare(`
  SELECT name, tbl_name, sql FROM sqlite_master
  WHERE type='index' AND sql IS NOT NULL
  ORDER BY tbl_name, name
`).all().map((r) => ({
  name: r.name,
  table: r.tbl_name,
  cols: (r.sql.match(/\(([^)]+)\)/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
}));

// ===== 3. 关键查询耗时 =====
const queries = {
  "COUNT(*)": () => db.prepare("SELECT COUNT(*) c FROM tickets").get(),
  "列表页(第1页)": () => db.prepare(
    "SELECT * FROM tickets ORDER BY created_at DESC, id DESC LIMIT 20").all(),
  "列表页(offset=20000)": () => db.prepare(
    "SELECT * FROM tickets ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 20000").all(),
  "按分类(第1页)": () => db.prepare(
    "SELECT * FROM tickets WHERE category='quality' ORDER BY created_at DESC, id DESC LIMIT 20").all(),
  "按分类统计": () => db.prepare(
    "SELECT category, COUNT(*) n FROM tickets GROUP BY category").all(),
  "按id查(trace_id)": () => db.prepare(
    "SELECT * FROM tickets WHERE trace_id=? LIMIT 1").get("tr_seed_50000"),
  "LIKE 前置通配": () => db.prepare(
    "SELECT * FROM tickets WHERE input LIKE '%内胆裂%' LIMIT 20").all(),
  "FTS5 搜索": () => {
    try {
      return db.prepare(`
        SELECT t.* FROM tickets_fts f JOIN tickets t ON t.id=f.rowid
        WHERE tickets_fts MATCH ? ORDER BY rank LIMIT 20
      `).all('"内胆裂"');
    } catch { return []; }
  },
  "按长度排序(预计算)": () => {
    try {
      return db.prepare(
        "SELECT * FROM tickets ORDER BY input_len DESC, id DESC LIMIT 20").all();
    } catch { return []; }
  },
  "按热度排序": () => {
    try {
      return db.prepare(
        "SELECT * FROM tickets ORDER BY hot_score DESC, id DESC LIMIT 20").all();
    } catch { return []; }
  },
};

const perf = {};
for (const [label, fn] of Object.entries(queries)) {
  try { perf[label] = time(fn); }
  catch (e) { perf[label] = { error: e.message.slice(0, 60) }; }
}

// ===== 4. 写入耗时 =====
const writePerf = (() => {
  const stmt = db.prepare(`
    INSERT INTO tickets (trace_id, input, input_len, category, urgency, need_human, route, degraded, created_at)
    VALUES (?, ?, ?, 'other', 'low', 0, 'auto', 0, ?)
  `);
  const base = `tr_perf_${Date.now()}`;

  // 单条（自动提交）
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) stmt.run(`${base}_s${i}`, "x".repeat(80), 80, Date.now());
  const single = (performance.now() - t0) / 100;

  // 批量（1000/事务）
  const tx = db.transaction((b) => {
    for (let i = 0; i < 1000; i++) stmt.run(`${base}_b${b}_${i}`, "x".repeat(80), 80, Date.now());
  });
  const t1 = performance.now();
  tx(0);
  const batch = (performance.now() - t1) / 1000;

  // 清理
  db.prepare("DELETE FROM tickets WHERE trace_id LIKE ?").run(`${base}%`);

  return {
    single_ms: +single.toFixed(3),
    batch_ms: +batch.toFixed(4),
    ratio: +(single / batch).toFixed(0),
  };
})();

// ===== 5. 环境 =====
const env = {
  generated_at: new Date().toISOString(),
  node: process.version,
  sqlite: db.prepare("SELECT sqlite_version() v").get().v,
  platform: `${process.platform} ${process.arch}`,
  db_file: config.db.file,
  db_size_mb: dbSize,
  cpus: (await import("node:os")).cpus().length,
  total_mem_gb: +((await import("node:os")).totalmem() / 1e9).toFixed(1),
};

const report = { env, tables, indexes, perf, write: writePerf };

// ===== 输出 =====
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, w = 10) => String(v).padStart(w);

console.log(`\n=== 性能快照 ${env.generated_at.slice(0, 19).replace("T", " ")} ===\n`);

console.log("环境");
console.log(`  Node      ${env.node}`);
console.log(`  SQLite    ${env.sqlite}`);
console.log(`  平台      ${env.platform}  CPU ${env.cpus} 核  内存 ${env.total_mem_gb}GB`);
console.log(`  数据库    ${env.db_file}  ${env.db_size_mb}MB`);

console.log("\n数据量");
for (const [k, v] of Object.entries(tables)) {
  console.log(`  ${pad(k, 16)} ${v === null ? "(不存在)" : v + " 行"}`);
}

console.log(`\n索引（${indexes.length} 个）`);
for (const ix of indexes) {
  console.log(`  ${pad(ix.name, 32)} ${pad(ix.table, 14)} ${ix.cols}`);
}

console.log("\n查询耗时");
console.log(`  ${pad("查询", 26)} ${num("P50")} ${num("P95")}`);
console.log("  " + "-".repeat(46));
for (const [label, v] of Object.entries(perf)) {
  if (v.error) { console.log(`  ${pad(label, 26)} ${v.error}`); continue; }
  console.log(`  ${pad(label, 26)} ${num(v.p50 + "ms")} ${num(v.p95 + "ms")}`);
}

console.log("\n写入耗时");
console.log(`  单条（自动提交）    ${writePerf.single_ms} ms/次`);
console.log(`  批量（1000/事务）   ${writePerf.batch_ms} ms/次`);
console.log(`  倍数               ${writePerf.ratio} 倍`);

console.log("\n（--json 输出机器可读格式）\n");
```

## 1.2 跑它

```bash
NODE_ENV=development node scripts/perf-report.js
```

**期望：**

```text
=== 性能快照 2026-11-17 01:23:45 ===

环境
  Node      v22.x.x
  SQLite    3.4x.x
  平台      win32 x64  CPU 8 核  内存 16GB
  数据库    ./data/dev.db  43.2MB

数据量
  tickets          100000 行
  review_queue     0 行
  tickets_fts      100000 行

索引（5 个）
  idx_tickets_cat_created          tickets        category, created_at
  idx_tickets_created              tickets        created_at
  idx_tickets_hot                  tickets        hot_score DESC
  idx_tickets_len                  tickets        input_len DESC
  sqlite_autoindex_tickets_1       tickets        trace_id
  ...
```

## 1.3 为什么这个脚本比手写表格好

```text
手写表格：
  · 你会抄错数字
  · 三个月后数字变了，你不知道旧表格对应哪个版本
  · 每次重测要手工整理

脚本：
  · 一条命令，30 秒
  · 每次输出带时间戳
  · 可以 --json 存进 git，diff 出变化
```

**关键用法：把 JSON 存进 git，然后 diff。**

```bash
NODE_ENV=development node scripts/perf-report.js --json > perf/snap-$(date +%Y%m%d).json
git add perf/
git commit -m "性能快照 20261117"
```

**三个月后：**

```bash
git diff perf/snap-20261117.json perf/snap-20270217.json
```

**你能精确看到"哪个查询变慢了、慢了多少"。**

**这是"性能档案"的最高形态。**

---

# 第 2 步：写主档案（35 分钟）

## 2.1 `PERF.md` 的结构

```markdown
# 性能档案

> 最后一次更新：2026-11-17
> 数据规模：10 万行
> 生成方式：`node scripts/perf-report.js`（可重复）

---

## 一、一句话结论

10 万行数据下，所有接口 P95 < 5ms；唯一需要预处理的是"按长度排序"和"热度排序"，
两者用预计算列解决。瓶颈不在数据库，在下游模型调用（3 秒）。

---

## 二、环境

| 项 | 值 |
|---|---|
| Node | v22.x.x |
| SQLite | 3.4x.x |
| 平台 | win32 x64 |
| CPU / 内存 | 8 核 / 16GB |
| 数据库 | `./data/dev.db`，43.2MB |
| 数据量 | tickets 100,000 / review_queue 0 / tickets_fts 100,000 |

**换机器或升级版本后必须重测** —— 否则数字不可比。

---

## 三、查询耗时（10 万行）

| 查询 | 改之前 | 改之后 | 手段 | 倍数 |
|---|---|---|---|---|
| `COUNT(*)` | 28.4ms | 0.01ms | counter 表 | 2800× |
| 列表第 1 页 | 45.8ms | 0.4ms | 索引 + counter | 114× |
| 列表 offset=20000 | 224.6ms | 0.4ms | keyset 分页 | 560× |
| 按分类筛选 | 148.2ms | 0.6ms | 复合索引 | 247× |
| 按 id 查 | 12.3ms | 0.05ms | UNIQUE（建表自带） | 246× |
| `LIKE '%x%'` | 41.3ms | 41.3ms | **无解**（见第六节） | —— |
| FTS5 搜索 | —— | 0.8ms | FTS5 + trigram | —— |
| 按长度排序 | 212.4ms | 0.4ms | 预计算列 `input_len` | 530× |
| 按热度排序 | 320.4ms | 0.3ms | 预计算列 `hot_score` | 1068× |

---

## 四、写入耗时

| 场景 | 耗时 | 说明 |
|---|---|---|
| 单条 INSERT（自动提交） | 1.24ms | 每条约 1 次 fsync |
| 批量 INSERT（1000/事务） | 0.021ms | **快 59 倍** |
| 单条（含 FTS 触发器） | 1.9ms | FTS 让写入慢 50% |

**结论：批量导入必须用事务。这是 59 倍的差别。**

---

## 五、索引清单（5 个）

| 索引 | 列 | 服务的查询 | 加之前 → 之后 |
|---|---|---|---|
| `sqlite_autoindex_tickets_1` | `(trace_id)` UNIQUE | `WHERE trace_id=?` | 12.3ms → 0.05ms |
| `idx_tickets_created` | `(created_at)` | `ORDER BY created_at` | 31.9ms → 0.3ms |
| `idx_tickets_cat_created` | `(category, created_at)` | `WHERE category=? ORDER BY created_at` | 45ms → 0.5ms |
| `idx_tickets_len` | `(input_len DESC)` | `ORDER BY input_len` | 212ms → 0.4ms |
| `idx_tickets_hot` | `(hot_score DESC)` | `ORDER BY hot_score` | 320ms → 0.3ms |

**被删掉的索引：**

| 索引 | 为什么删 |
|---|---|
| `idx_tickets_input` | `LIKE '%x%'` 用不上前置通配符，纯浪费 5MB + 写入 |
| `idx_tickets_category` | 被 `idx_tickets_cat_created` 覆盖（最左前缀） |
| `idx_t_urgency` 等 5 个 | 没有对应查询，只让写入慢 2.5 倍 |

**索引的代价（实测）：**

| 索引数 | 单条 INSERT | 库大小 |
|---|---|---|
| 3 | 1.24ms | 30MB |
| 8 | 3.10ms | 55MB |

---

## 六、已知无解的三个地方

### 1. `LIKE '%关键词%'`（41ms，随数据量线性增长）

**为什么无解：** 前置通配符让索引的排序信息失效。

**已用的替代：** FTS5（0.8ms），但要求搜索词 ≥ 3 字（trigram 限制）。

**如果必须有 2 字搜索：** 回退 LIKE（41ms），并接受结果集巨大。

### 2. `OFFSET` 深翻页（offset=20000 时慢 560 倍）

**为什么不在主列表用：** 已改 keyset 分页。

**但遗留：** `GET /api/tickets?offset=` 仍支持，限制 `offset ≤ 2000`。

**为什么留：** 后台管理需要"跳到某页"，且实际翻页深度 < 50 页。

### 3. `COUNT(*)`（必须靠 counter 表）

**为什么无解：** SQLite 的 `COUNT(*)` 是 O(n)。

**已用：** `counters` 表，写入时 ±1。

**风险：** 任何绕过 `insertTicket` 的写入都会让 counter 漂移。已有 `check-counter.js`。

---

## 七、下次什么时候复查

| 触发条件 | 该做什么 |
|---|---|
| **tickets 超过 50 万行** | 重跑 `perf-report.js`，重点看 FTS 和 keyset 分页 |
| **tickets 超过 200 万行** | 考虑归档（把 1 年前的移到 `tickets_archive`） |
| **任一两页耗时差 > 3 倍** | 检查是不是 OFFSET 漏用 |
| **搜索 P95 > 20ms** | FTS 索引可能需要 rebuild |
| **counter 漂移 > 0.1%** | 检查所有写入路径 |
| **换了机器 / 升了 Node / 升了 SQLite** | 全套重测（环境变了，数字不可比） |
| **供应商换了模型** | 重跑第 18 节的评测（不是性能，是质量） |

**建议：每月 1 号跑一次 `perf-report.js`，存进 `perf/`，不管有没有变化。**

---

## 八、不做什么（因为没意义）

| 不做 | 为什么 |
|---|---|
| 优化 `JSON.stringify` | 0.21ms，占 0.3% |
| 优化 `/health` | 4ms 是框架开销，改不了 |
| 加 Redis 缓存 | 瓶颈是模型 3 秒，缓存救不了 |
| 换 Postgres | 10 万行 SQLite 完全够，迁移成本远大于收益 |
| Node 性能剖析 | 你的代码占 1.2% |

---

## 九、如何复现这份档案

```bash
# 1. 造 10 万行（固定种子，结果可重复）
NODE_ENV=development node scripts/seed-big.js --rows 100000 --reset

# 2. 生成快照
NODE_ENV=development node scripts/perf-report.js

# 3. 存档对比
NODE_ENV=development node scripts/perf-report.js --json > perf/snap-$(date +%Y%m%d).json
```
```

## 2.2 逐节解释为什么这么写

**① "一句话结论"放在最前面**

```text
因为 90% 的人只会读这一句。
如果你把"P95 12ms，索引 5 个"放在第 5 节，客户永远看不到。
```

**② 每张表都有"改之前 → 改之后 → 倍数"**

```text
只有"现在 0.4ms"没有意义（一直是 0.4ms 吗？）
只有"从 45ms 改到 0.4ms"才有意义（证明了优化的价值）
```

**③ "被删掉的索引"也要记**

```text
三个月后你（或接手的人）会想"要不要给 input 加索引"
→ 看到"试过，无效"，就不试了
```

**④ "已知无解的三个地方"最重要**

```text
因为这是你唯一能诚实交代的部分。
写了，客户问"能搜 2 个字吗"时你说"能，但慢 50 倍，我们建议 3 字"
不写，客户自己试了 2 个字发现 0 结果，觉得你的搜索是坏的
```

**⑤ "下次什么时候复查"必须可测**

```text
❌ "数据量大了就复查"     → 永远不会触发
✅ "tickets 超过 50 万行"  → 可查
```

**⑥ "不做什么"防止未来的你手痒**

```text
你会看到"JSON.stringify 0.21ms"然后想优化它
→ 看到这行"不做，因为占 0.3%"，就放弃了
```

---

# 第 3 步：写变更记录（20 分钟）

## 3.1 `PERF-LOG.md`

**每次优化记一行。这是"性能档案"的流水账。**

```markdown
# 性能变更记录

| 日期 | 改动 | 数据量 | 关键指标 | 倍数 | 备注 |
|---|---|---|---|---|---|
| 2026-11-17 | 加 `idx_tickets_created` | 10 万 | 列表 31.9→0.3ms | 106× | 第 149 节 |
| 2026-11-17 | 加 `idx_tickets_cat_created` | 10 万 | 筛选 45→0.5ms | 90× | 复合索引，最左前缀 |
| 2026-11-17 | 删 `idx_tickets_input` | 10 万 | LIKE 不变，写入门恢复 | —— | 前置通配符无解 |
| 2026-11-17 | counter 表 | 10 万 | COUNT 28.4→0.01ms | 2800× | 第 150 节 |
| 2026-11-17 | 消灭 N+1 | 10 万 | 21→3 次查询 | 7× | IN + Map |
| 2026-11-17 | keyset 分页 | 10 万 | offset=20000: 224→0.4ms | 560× | 双列游标 |
| 2026-11-17 | FTS5 搜索 | 10 万 | LIKE 41→0.8ms | 51× | trigram，要求 3 字 |
| 2026-11-17 | 预计算 `input_len` | 10 万 | 排序 212→0.4ms | 530× | 函数排序无解 |
| 2026-11-17 | 预计算 `hot_score` | 10 万 | 排序 320→0.3ms | 1068× | 定时算，5 分钟延迟 |
```

## 3.2 一个必须加的行

**每次"变慢"也要记：**

```markdown
| 2027-02-15 | 加"客户等级"字段，列表 N+1 | 30 万 | 列表 0.5→18ms | 变慢 36× | 漏了 IN 合并，2 月 18 日修复 |
| 2027-02-18 | 修复上述 N+1 | 30 万 | 列表 18→0.7ms | 26× | 教训：加关联数据必须用 IN |
```

**为什么"变慢"要记？**

```text
因为它是唯一能告诉你"这个优化容易复发"的证据。
你会从记录里看出：列表接口的 N+1 是个反复出现的坑。
```

---

# 第 4 步：把"复查"变成日历提醒（15 分钟）

## 4.1 三个提醒

```text
① 每月 1 号：跑 perf-report.js，存档
   → 即使没变化，也存（这样才能对比）

② tickets 超过 50 万行时：全套重测
   → 用一条 SQL 查当前行数（放进日报）
   
③ 每次改表结构 / 加索引后：重跑一次
   → 记进 PERF-LOG.md
```

## 4.2 把它加进每日摘要

```javascript
// scripts/daily-digest.js 里加一行
import { db } from "../app/lib/db.js";

const n = db.prepare("SELECT COUNT(*) c FROM tickets").get().c;
const limit = 500_000;
if (n > limit * 0.8) {
  console.log(`\n⚠️  tickets ${n} 行，已超过 ${limit} 的 80%，该按 PERF.md 复查了`);
}
```

**这样你每天都会看到，直到你处理它。**

## 4.3 一个更主动的做法

```javascript
// 在 /api/admin/env 里返回
res.json({
  ...,
  perf: {
    rows: n,
    next_review_at: limit,
    usage_pct: +(n / limit * 100).toFixed(1),
  },
});
```

```json
{
  "perf": { "rows": 420000, "next_review_at": 500000, "usage_pct": 84.0 }
}
```

**每次部署后看一眼，就知道"离下次复查还有多远"。**

---

# 第 5 步：一次完整的交付（20 分钟）

## 5.1 现在做一遍

```bash
# 1. 确保在 10 万行数据上
NODE_ENV=development node scripts/seed-big.js --rows 100000 --reset

# 2. 生成快照
NODE_ENV=development node scripts/perf-report.js

# 3. 存档
mkdir -p perf
NODE_ENV=development node scripts/perf-report.js --json > perf/snap-$(date +%Y%m%d).json

# 4. 把上面的输出填进 PERF.md 的空格

# 5. 提交
git add PERF.md PERF-LOG.md perf/
git commit -m "第154节：性能档案，10万行基线，5个索引，9项查询"
```

## 5.2 一个必须做的"外人测试"

**把 `PERF.md` 给一个人看（不懂技术的也行），问三个问题：**

```text
① 这个系统快不快？
② 如果数据涨 10 倍会怎样？
③ 你知道什么时候该再来看这份文件吗？
```

**如果三个都答对** → 档案合格。
**如果第 ③ 个答错** → 你的"复查条件"不够显眼。

## 5.3 一个诚实的自评

**填这个表：**

| 项 | 你的状态 |
|---|---|
| 我知道 10 万行下每个查询的真实耗时 | ✅/❌ |
| 我知道所有 5 个索引服务于什么查询 | ✅/❌ |
| 我能说出"哪三个地方无解" | ✅/❌ |
| 我知道下一次复查在什么条件下 | ✅/❌ |
| 我能 30 秒内复现这份档案 | ✅/❌ |

**五个 ✅ 才算完成这一周。**

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **`perf-report.js` 的真实输出**
- **"一句话结论"你怎么写的**
- **三个无解的地方**
- **五个复查条件**

---

# 第 7 步：课后练习

## 练习一：加"归档"策略（25 分钟）

**当表超过 50 万行，最有效的优化不是索引，是"减少行数"。**

```sql
CREATE TABLE tickets_archive AS SELECT * FROM tickets WHERE 1=0;
CREATE INDEX idx_arch_created ON tickets_archive(created_at DESC);
```

```javascript
// scripts/archive.js
export function archiveOlderThan(days = 365) {
  const cutoff = Date.now() - days * 86_400_000;

  const tx = db.transaction(() => {
    const n = db.prepare("SELECT COUNT(*) c FROM tickets WHERE created_at < ?").get(cutoff).c;
    if (n === 0) return 0;

    db.prepare(`
      INSERT INTO tickets_archive SELECT * FROM tickets WHERE created_at < ?
    `).run(cutoff);

    db.prepare(`DELETE FROM tickets WHERE created_at < ?`).run(cutoff);

    // counter 也要减（第 150 节的坑二）
    incCounter("tickets", -n);

    return n;
  });

  return tx();
}
```

**注意三个坑：**

```text
① FTS 表的触发器会跟着删 → 归档表需要自己的 FTS（或者不建）
② counter 要减
③ 归档后"搜索历史工单"要能查到 → 需要 UNION 两个表，或者提供"只搜归档"的接口
```

**写出你的归档方案，以及"归档后怎么搜到老数据"。**

## 练习二：算清"什么时候该换数据库"（15 分钟）

```text
SQLite 单文件，写入串行（数据库级写锁）

你的写入量：____ 条/小时
每次写入 _____ ms
→ 每小时占用写锁 _____ 秒 = _____%

如果超过 50%，说明写入压力接近上限
→ 该考虑换 Postgres
```

**参考阈值：**

```text
写入锁占用 < 10%  → SQLite 完全够
10%–50%          → 还能用，但要注意
> 50%            → 换数据库
```

## 练习三：判断这份性能档案错在哪（15 分钟）

```markdown
# 性能档案

优化后：
- 列表接口：0.4ms
- 搜索：0.8ms
- 统计：0.6ms

比之前快了很多。继续保持。
```

**错在哪？至少六条。**

**参考答案：**

```text
① 没有数据量 → 0.4ms 是 1 万行还是 100 万行？
② 没有"之前"的数字 → "快了很多"是多少倍？
③ 没有环境 → 换机器就不可比
④ 没有索引清单 → 不知道优化用了什么手段
⑤ 没有"无解的地方" → 客户问"能搜 2 个字吗"你不知道怎么答
⑥ 没有复查条件 → 永远不会再打开
⑦ "继续保持"不是结论，是鼓励
```

**第 ② 条最典型。** "0.4ms" 是个孤立数字，**它既不快也不慢，只有和"改之前"对比才成立。**

---

# 第 8 步：最终验收

## A. 自动快照脚本

- [ ] `scripts/perf-report.js` 能跑
- [ ] 输出环境（Node / SQLite / 平台 / CPU）
- [ ] 输出数据量（tickets / review_queue / fts）
- [ ] 输出索引清单（名称 + 表 + 列）
- [ ] 输出 9–11 条查询的 P50/P95
- [ ] 输出写入耗时（单条 vs 批量 + 倍数）
- [ ] 支持 `--json`（可存档、可 diff）

## B. `PERF.md` 九节齐全

- [ ] 一、一句话结论（**只有一句，且带数字**）
- [ ] 二、环境（含"换机器要重测"）
- [ ] 三、查询耗时表（**改之前 → 改之后 → 倍数**）
- [ ] 四、写入耗时（含"批量快 59 倍"）
- [ ] 五、索引清单（含**被删的 + 代价实测**）
- [ ] 六、**已知无解的三处**（LIKE / OFFSET / COUNT）
- [ ] 七、下次什么时候复查（**5 条以上可测条件**）
- [ ] 八、不做什么（**防止未来的你手痒**）
- [ ] 九、如何复现（三条命令）

## C. 变更记录

- [ ] `PERF-LOG.md` 有 9 行（对应第 148–153 节的改动）
- [ ] 每行有"倍数"
- [ ] **有至少一行"变慢"的记录**（哪怕是假设的）

## D. 复查机制

- [ ] 每日摘要里有"行数接近 50 万"的提醒
- [ ] `/api/admin/env` 返回 `usage_pct`
- [ ] 我知道"每月 1 号存快照"

## E. 外人测试

- [ ] 给一个不懂技术的人读过
- [ ] 他能答"这个系统快不快"
- [ ] 他能答"数据涨 10 倍会怎样"
- [ ] 他能答"什么时候该再来看"

## F. 自评五项

- [ ] 知道每个查询的真实耗时
- [ ] 知道每个索引服务于什么
- [ ] 能说出三处无解
- [ ] 知道复查条件
- [ ] 30 秒能复现

## G. 提交

```bash
git add -A
git commit -m "第154节：性能档案，10万行基线，9项查询+5索引+3无解"
git push
```

---

## 本节课要能说出口的一句话

> **“优化后 0.4ms”是个孤立数字，它既不快也不慢。只有“从 45ms 到 0.4ms”才成立。**

---

# 附：常见问题速查

**Q：这份档案要不要给客户看？**

A：**给一个"客户版"（去掉内部实现细节）。**

```text
客户关心的：
  · 现在多快（P95 数字）
  · 能撑多少数据
  · 什么时候需要升级（复查条件）

客户不关心的：
  · 索引名
  · EXPLAIN 输出
  · "我们试过加 input 索引但无效"
```

**但把完整版留在仓库里。** 客户问细节时，你能立刻拿出证据。

**Q：`perf-report.js` 会不会改数据？**

A：**会。** 写入测试插 100 条，然后 `DELETE`。

```javascript
db.prepare("DELETE FROM tickets WHERE trace_id LIKE ?").run(`${base}%`);
```

**注意：这条 DELETE 会让 counter 漂移（第 150 节的坑二）。**

**修法：**

```javascript
import { incCounter, getCounter, calibrateCounter } from "../app/repos/counter.js";
// 在 DELETE 之后
incCounter("tickets", -insertedCount);
```

**或者更简单：跑之前记下 counter，跑完恢复。**

**Q：3 个索引变 5 个，写入慢了 50%（因为有 FTS），这个账怎么算？**

A：**算"读写比"。**

```text
每天 1000 次写，5000 次读 → 读写比 1:5
写入慢 50%：1000 × 1.9ms = 1.9s/天
读取快 50 倍：5000 × 41ms → 5000 × 0.8ms = 省 200s/天
→ 净赚 198s/天
```

**只要"读节省"远大于"写损失"，就该加。**

**反过来：如果一个系统写多读少（比如日志采集），加 FTS 就是亏的。**

**Q：为什么"变慢"的记录也要写？**

A：**因为它是唯一能暴露"这个优化容易复发"的证据。**

```text
你会从 PERF-LOG 里看到：
  列表接口的 N+1 在 2 月又出现了
→ 说明"加关联数据时必须用 IN"这条规则容易被忘
→ 你可以在 CONVENTIONS.md 里加一条，或者写个 lint
```

**只记"变快"的日志，会让你以为一切都在变好。**

**Q：`usage_pct` 到 80% 了，我该做什么？**

A：**不是立刻优化，是先验证。**

```text
① 跑 perf-report，看现在的数字
② 和上次快照对比，看有没有变慢
③ 如果数字正常（线性增长），什么都不做，等到 100%
④ 如果数字异常（增长超过线性），去查原因
```

**"行数到 50 万"只是个提醒，不是报警。** 真正该报警的是"耗时增长超过行数增长"。

**Q：这一周学完了，我最大的收获应该是什么？**

A：不是"会加索引"，是下面这句话：

```text
你现在能对着客户说：
"10 万行数据下，列表 0.4ms，搜索 0.8ms，所有接口 P95 都在 5ms 以内。
 瓶颈不在数据库，在模型调用的 3 秒。
 数据涨到 50 万行时我会重测，涨到 200 万行时会做归档。
 有三件事我做不到：2 字搜索、深翻页、免 COUNT —— 我都写了替代方案。"
```

**而绝大多数开发者，说的是"应该还行"。**
