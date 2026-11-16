# 第 148 节课：找出慢在哪

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天要做两件事：**造 10 万行数据，量出每个接口的真实耗时并分解。**
> 不做这一步，后面六节全是猜。

**建议用时**：130 分钟
**你需要先完成**：第 147 节的 `RELEASE.md`
**今天要装**：什么都不用装

---

# 第 0 步：先看看现在的数字（15 分钟）

## 0.1 量三件事

```bash
# ① 现在有多少行
node -e "
import('./app/lib/db.js').then(({ db }) => {
  for (const t of ['tickets','review_queue']) {
    try { console.log(t, db.prepare(\`SELECT COUNT(*) c FROM \${t}\`).get().c); }
    catch (e) { console.log(t, '(不存在)'); }
  }
});
"

# ② 数据库文件多大
ls -lh data/*.db

# ③ 现有索引
node -e "
import('./app/lib/db.js').then(({ db }) => {
  const rows = db.prepare(\"SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL\").all();
  rows.forEach(r => console.log(r.tbl_name, '|', r.name));
});
"
```

**把三个数字写下来：**

```text
tickets 行数：____
数据库大小：____
索引数量：____
```

## 0.2 一个必须接受的现实

**如果你只有几百行，今天的课你感受不到痛。**

```text
300 行：全表扫 0.1ms，"加索引"看不出差别
30000 行：全表扫 8ms，能感觉到
100000 行：全表扫 30ms，明显
500000 行：全表扫 150ms，用户开始抱怨
```

**所以今天第一件事是造数据。**

**造 10 万行，你会亲眼看到"5ms 变 200ms"。** 那个冲击比读一百页文档有用。

## 0.3 今天要产出的东西

```text
scripts/seed-big.js        造 10 万行（可重复、可清空）
scripts/bench.js           量每个接口的耗时
scripts/profile-api.js     分解单个接口的耗时
PERF-BASELINE.md           基线档案（今天的原始数字）
```

**`PERF-BASELINE.md` 是今天最重要的产出。** 它是你后面六节的"改之前"。

---

# 第 1 步：造 10 万行（35 分钟）

## 1.1 为什么不能随便造

**造数据要满足三个条件：**

```text
① 结构真实 —— 字段长度、分布和真实数据接近
② 可重复 —— 每次跑结果一样（用固定随机种子）
③ 可清空 —— 造之前先清，不会污染真实数据
```

**不满足 ① 的后果：**

```text
你造的 input 都是 "test1"、"test2"（4 字节）
真实数据是 200 字的客户投诉
→ 你的表实际大小差 50 倍
→ 磁盘 IO 的瓶颈测不出来
```

## 1.2 写 `scripts/seed-big.js`

```javascript
// scripts/seed-big.js
// 造大批测试数据。用法：
//   node scripts/seed-big.js --rows 100000
//   node scripts/seed-big.js --rows 100000 --reset
//   node scripts/seed-big.js --reset-only

import { config } from "../app/config/index.js";
import { db, migrate } from "../app/lib/db.js";

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const ROWS = Number(arg("rows", 100_000));
const RESET = args.includes("--reset") || args.includes("--reset-only");
const RESET_ONLY = args.includes("--reset-only");

// 安全检查：绝不在生产环境跑
if (config.isProd) {
  console.error("❌ 拒绝在生产环境造数据");
  process.exit(1);
}

migrate();

// ===== 清空 =====
if (RESET) {
  const before = db.prepare("SELECT COUNT(*) c FROM tickets").get().c;
  db.prepare("DELETE FROM tickets").run();
  try { db.prepare("DELETE FROM review_queue").run(); } catch {}
  console.log(`已清空 ${before} 行`);
  if (RESET_ONLY) process.exit(0);
}

// ===== 固定随机种子（可重复）=====
let seed = 20261117;
function rand() {
  // xorshift32
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >> 17;
  seed ^= seed << 5;  seed >>>= 0;
  return seed / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));

// ===== 真实感的语料 =====
const SUBJECTS = ["电饭煲", "杯子", "显示器", "耳机", "充电器", "键盘", "厨房秤", "台灯", "保温杯", "拖鞋"];
const PROBLEMS = [
  "内胆裂了", "屏幕有坏点", "左边没声音", "充不进电", "按键失灵", "显示不准", "灯不亮", "漏水", "开胶了", "有色差",
];
const EXTRAS = [
  "刚收到就这样", "用了一周", "已经联系过客服两次", "发票还在", "包装都没拆", "急用", "送人的", "还在保修期内",
];
const ACTIONS = ["核实订单并安排换货", "让客户拍照留存", "联系快递核实", "转售后处理", "补发配件"];
const CATS = ["logistics", "quality", "refund", "invoice", "account", "other"];
const URG = ["high", "medium", "low"];

function makeInput() {
  // 长度分布：60% 短（20-60 字），30% 中（60-150），10% 长（150-400）
  const r = rand();
  const n = r < 0.6 ? int(1, 2) : r < 0.9 ? int(3, 5) : int(6, 12);
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(
      pick([
        `我买的${pick(SUBJECTS)}${pick(PROBLEMS)}`,
        `${pick(EXTRAS)}，${pick(SUBJECTS)}${pick(PROBLEMS)}`,
        `订单号 SF${int(1000000000, 9999999999)}，${pick(PROBLEMS)}`,
        `一共${int(20, 3000)}元，${pick(PROBLEMS)}`,
        `麻烦尽快处理，${pick(EXTRAS)}`,
      ])
    );
  }
  return parts.join("，") + "。";
}

function makeOutput() {
  return JSON.stringify({
    summary: `${pick(SUBJECTS)}${pick(PROBLEMS)}`,
    category: pick(CATS),
    urgency: pick(URG),
    suggested_action: pick(ACTIONS),
    need_human: rand() < 0.5,
  });
}

// ===== 批量插入 =====
const insert = db.prepare(`
  INSERT INTO tickets (trace_id, input, output, category, urgency, need_human, route, degraded, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// 时间分布：过去 365 天，越近越密（模拟真实增长）
const NOW = Date.now();
const DAY = 86_400_000;
function makeTs(i) {
  // 用平方分布：老数据少，新数据多
  const t = Math.pow(rand(), 2);           // 0..1，偏向 0
  const daysAgo = Math.floor(t * 365);
  const base = NOW - daysAgo * DAY;
  const ji = rand() * DAY;                  // 当天的随机时刻
  return Math.floor(base - ji);
}

const BATCH = 1000;
const t0 = Date.now();

const tx = db.transaction((start, count) => {
  for (let i = start; i < start + count; i++) {
    const input = makeInput();
    insert.run(
      `tr_seed_${i}`,
      input,
      makeOutput(),
      pick(CATS),
      pick(URG),
      rand() < 0.5 ? 1 : 0,
      rand() < 0.15 ? "human" : "auto",
      rand() < 0.03 ? 1 : 0,
      makeTs(i)
    );
  }
});

for (let i = 0; i < ROWS; i += BATCH) {
  const n = Math.min(BATCH, ROWS - i);
  tx(i, n);
  if ((i + n) % 10_000 === 0) {
    process.stdout.write(`\r已插入 ${i + n} / ${ROWS}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}

console.log(`\n\n✅ 完成`);
console.log(`行数    ${db.prepare("SELECT COUNT(*) c FROM tickets").get().c}`);
console.log(`耗时    ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);

// 统计一些分布，确认造得合理
const stats = db.prepare(`
  SELECT
    COUNT(*) AS n,
    MIN(LENGTH(input)) AS min_len,
    AVG(LENGTH(input)) AS avg_len,
    MAX(LENGTH(input)) AS max_len,
    MIN(created_at) AS oldest,
    MAX(created_at) AS newest
  FROM tickets
`).get();

console.log(`\ninput 长度：min ${stats.min_len} / avg ${Math.round(stats.avg_len)} / max ${stats.max_len}`);
console.log(`时间范围：${new Date(stats.oldest).toISOString().slice(0,10)} → ${new Date(stats.newest).toISOString().slice(0,10)}`);
```

## 1.3 逐段解释四个关键设计

**① 固定随机种子（`seed = 20261117`）**

```text
每次跑生成的数据一模一样
→ 你今天测的 200ms，三天后重跑还是 200ms
→ 你改的代码带来的变化才是"真实的"
```

**如果每次数据不同，你没法比较"改之前 vs 改之后"。**

**② 长度分布 60/30/10**

```text
60% 短（20-60 字）→ 大部分请求
30% 中（60-150）
10% 长（150-400）
```

**这是真实分布。** 如果全造短的，你的表实际大小会比真实小 5 倍，**磁盘 IO 的瓶颈测不出来**。

**③ 时间用平方分布（越近越密）**

```javascript
const t = Math.pow(rand(), 2);   // 偏向 0
const daysAgo = Math.floor(t * 365);
```

**`rand()` 均匀分布 → 每天数据一样多 → 不符合真实（业务在增长）**

**`rand()²` → 80% 的数据在最近 100 天 → 符合"业务在增长"**

**为什么这重要？**

```text
如果数据均匀分布在 365 天，那"最近 7 天"只有 2% 的数据
→ WHERE created_at > now-7d 会扫很少的行
→ 你测不出真实性能

如果 80% 在最近 100 天，那"最近 7 天"有 6% 的数据
→ 更接近真实
```

**④ 分批事务（每 1000 条一个 transaction）**

```javascript
const tx = db.transaction((start, count) => { ... });
for (let i = 0; i < ROWS; i += BATCH) tx(i, n);
```

**为什么不一次事务插 10 万条？**

```text
一次事务 → SQLite 要维护一个巨大的回滚日志 → 内存暴涨
分批     → 每批提交，内存稳定
```

**为什么不用"每条一个事务"？**

```text
每条一个事务 → 10 万次 fsync → 会跑 20 分钟
每 1000 条一个 → 100 次 fsync → 15 秒
```

**这个差别是 80 倍。** 第 5 周讲事务时说过：**批量写必须用事务。**

## 1.4 跑它

```bash
# 先清空再造 10 万行
NODE_ENV=development node scripts/seed-big.js --rows 100000 --reset
```

**期望输出：**

```text
已清空 312 行
已插入 100000 / 100000  (12.4s)

✅ 完成
行数    100000
耗时    12.4 秒

input 长度：min 18 / avg 87 / max 394
时间范围：2025-11-17 → 2026-11-17
```

**检查数据库大小：**

```bash
ls -lh data/*.db
```

**期望 20–40 MB**（每行约 300 字节 × 10 万）。

**如果只有 5 MB** → 你的 input 太短了 → 检查 `makeInput` 有没有生效。

## 1.5 一个必须做的验证

```bash
# 确认数据真的造进去了，且分布合理
node -e "
import('./app/lib/db.js').then(({ db }) => {
  const q = (sql) => db.prepare(sql).all();

  console.log('按分类：');
  q('SELECT category, COUNT(*) n FROM tickets GROUP BY category ORDER BY n DESC')
    .forEach(r => console.log(' ', r.category, r.n));

  console.log('\n按天（最近 7 天）：');
  q('SELECT date(created_at/1000, \"unixepoch\") d, COUNT(*) n FROM tickets GROUP BY d ORDER BY d DESC LIMIT 7')
    .forEach(r => console.log(' ', r.d, r.n));
});
"
```

**看两个地方：**

```text
① 六个类别应该各占 1/6 左右（约 16666）
② 最近 7 天每天应该有 1000–3000 行（不是 274 行 = 10万/365）
```

**如果最近 7 天每天都差不多 274 行** → 你的平方分布没生效（可能 `Math.pow(rand(), 2)` 被写成 `Math.pow(rand(), 0.5)`）。

---

# 第 2 步：量每个接口（30 分钟）

## 2.1 写 `scripts/bench.js`

```javascript
// scripts/bench.js
// 量每个接口的耗时。每个接口跑 N 次，输出 P50/P90/P95/P99。
//   node scripts/bench.js
//   node scripts/bench.js --n 50

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3999";
const N = Number(arg("n", 30));

// 接口清单：路径 + 说明 + 是否需要 id
const ENDPOINTS = [
  { path: "/health", label: "健康检查" },
  { path: "/api/tickets?limit=20", label: "列表（第1页，20条）" },
  { path: "/api/tickets?limit=20&offset=0", label: "列表（offset=0）" },
  { path: "/api/tickets?limit=20&offset=2000", label: "列表（offset=2000）" },
  { path: "/api/tickets?limit=20&offset=20000", label: "列表（offset=20000）" },
  { path: "/api/stats", label: "按分类统计" },
  { path: "/api/review/stats", label: "队列统计" },
];

async function timeOnce(path) {
  const t0 = performance.now();
  const res = await fetch(BASE + path);
  await res.text();                        // 必须读完 body 才算完
  const ms = performance.now() - t0;
  return { ms, status: res.status };
}

async function bench(ep) {
  // 预热 3 次（避免第一次的 JIT / 连接建立影响）
  for (let i = 0; i < 3; i++) await timeOnce(ep.path).catch(() => {});

  const lat = [];
  let statuses = {};

  for (let i = 0; i < N; i++) {
    try {
      const r = await timeOnce(ep.path);
      lat.push(r.ms);
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    } catch (e) {
      lat.push(99999);
      statuses.ERR = (statuses.ERR ?? 0) + 1;
    }
  }

  lat.sort((a, b) => a - b);
  const p = (q) => lat[Math.min(Math.floor(lat.length * q), lat.length - 1)];

  return {
    label: ep.label,
    path: ep.path,
    p50: p(0.5),
    p90: p(0.9),
    p95: p(0.95),
    p99: p(0.99),
    max: lat[lat.length - 1],
    statuses,
  };
}

console.log(`跑 ${ENDPOINTS.length} 个接口，每个 ${N} 次（+3 次预热）\n`);
console.log("接口".padEnd(28) + "P50".padStart(8) + "P90".padStart(8) + "P95".padStart(8) + "P99".padStart(8) + "  状态");
console.log("-".repeat(76));

const results = [];
for (const ep of ENDPOINTS) {
  const r = await bench(ep);
  results.push(r);
  const st = Object.entries(r.statuses).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(
    r.label.padEnd(28) +
    `${r.p50.toFixed(1)}ms`.padStart(8) +
    `${r.p90.toFixed(1)}ms`.padStart(8) +
    `${r.p95.toFixed(1)}ms`.padStart(8) +
    `${r.p99.toFixed(1)}ms`.padStart(8) +
    "  " + st
  );
}

// ===== 标出慢的 =====
const SLOW_MS = 100;
const slow = results.filter((r) => r.p95 >= SLOW_MS);
if (slow.length) {
  console.log(`\n⚠️  P95 ≥ ${SLOW_MS}ms 的接口：`);
  slow.forEach((r) => console.log(`   · ${r.label}  P95 ${r.p95.toFixed(1)}ms`));
} else {
  console.log(`\n✅ 所有接口 P95 < ${SLOW_MS}ms`);
}
```

## 2.2 逐段解释三个关键点

**① 为什么必须 `await res.text()`**

```javascript
// ❌ 这样只测了"响应头到达"
const res = await fetch(url);
const ms = performance.now() - t0;

// ✅ 这样测了"完整响应"
const res = await fetch(url);
await res.text();
const ms = performance.now() - t0;
```

**差多少？**

```text
响应头到达   2ms
body 传完    12ms（如果是 20 条记录的 JSON）
```

**不读 body，你会以为接口只有 2ms。**

**② 为什么预热 3 次**

```text
第 1 次：建立 TCP 连接（~5ms）+ JIT 未编译 + 数据库缓存空
第 2 次：连接复用，JIT 部分编译
第 3 次：稳定
```

**不预热，你的 P50 会被第一次的异常值污染。** 而且预热 3 次成本很低。

**③ 为什么专测三个 offset**

```text
offset=0       → 基准
offset=2000    → 第 101 页
offset=20000   → 第 1001 页
```

**如果三个数字差很多，说明 `OFFSET` 是瓶颈（第 151 节会解决）。**

**这是设计测试用例的核心思路：同一接口，改一个参数，看数字怎么变。**

## 2.3 跑它

```bash
# 起测试服务（连同一个库，才能量到 10 万行）
NODE_ENV=development PORT=3999 node app/index.js &
sleep 2

node scripts/bench.js
```

**期望输出（示意，你可能不同）：**

```text
跑 7 个接口，每个 30 次（+3 次预热）

接口                               P50     P90     P95     P99  状态
----------------------------------------------------------------------------
健康检查                          2.1ms   3.4ms   4.2ms   6.1ms  200:30
列表（第1页，20条）              18.3ms  31.2ms  45.8ms  62.1ms  200:30
列表（offset=0）                 17.9ms  29.8ms  41.2ms  58.3ms  200:30
列表（offset=2000）              34.1ms  52.3ms  68.9ms  88.4ms  200:30
列表（offset=20000）            142.7ms 189.3ms 224.6ms 261.2ms  200:30
按分类统计                       88.4ms 121.7ms 148.2ms 172.9ms  200:30
队列统计                          6.2ms   9.1ms  11.4ms  14.8ms  200:30

⚠️  P95 ≥ 100ms 的接口：
   · 列表（offset=20000）  P95 224.6ms
   · 按分类统计  P95 148.2ms
```

**四个立刻能看出的结论：**

```text
① offset=20000 是 offset=0 的 5.5 倍 → OFFSET 在扫行（第 151 节）
② 按分类统计 148ms → GROUP BY 没有索引（第 149 节）
③ 列表第 1 页 45ms → 有 COUNT(*) 或者没有索引（待分解）
④ 健康检查 4ms → 框架基本开销
```

## 2.4 如果你的数字很低（比如全部 < 20ms）

**两个原因：**

```text
① 数据没造进去（检查 tickets 行数）
② 服务连的不是同一个库（检查 config.db.file）
```

**验证：**

```bash
curl -s "localhost:3999/api/tickets?limit=1" | jq '.total'
```

**应该是 100000。如果不是，说明服务连的库不对。**

---

# 第 3 步：分解单个接口（30 分钟）★ 关键

## 3.1 为什么"接口 45ms"不够

**列表接口 45ms，可能来自：**

```text
① COUNT(*) 算总数        30ms  ← 全表扫
② SELECT 20 条            8ms  ← 走索引
③ JSON 序列化             4ms
④ 中间件（脱敏/日志）      3ms
```

**优化哪一个？不知道。** 必须分解。

## 3.2 加计时打点

**在 `app/lib/logger.js` 加一个工具：**

```javascript
// app/lib/timer.js
export function makeTimer() {
  const marks = [];
  const t0 = performance.now();
  let last = t0;

  return {
    mark(label) {
      const now = performance.now();
      marks.push({ label, ms: +(now - last).toFixed(2), fromStart: +(now - t0).toFixed(2) });
      last = now;
    },
    summary() {
      return {
        total: +(performance.now() - t0).toFixed(2),
        marks,
      };
    },
  };
}
```

**在路由里用：**

```javascript
// app/routes/tickets.js 的列表接口
ticketsRouter.get("/tickets", wrap(async (req, res) => {
  const timer = makeTimer();

  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  timer.mark("parse_params");

  const total = repo.countTickets();
  timer.mark("count_total");

  const data = repo.listTickets({ limit, offset });
  timer.mark("list_rows");

  const body = { ok: true, trace_id: req.traceId, data, total };
  timer.mark("build_body");

  res.json(body);
  timer.mark("send");

  // 只在 debug 级别记录
  log.debug("api_timing", { trace_id: req.traceId, path: req.path, ...timer.summary() });
}));
```

## 3.3 一个更简单的办法：直接量 SQL

**如果你想更快，跳过代码打点，直接量 SQL：**

```javascript
// scripts/profile-api.js
import { db } from "../app/lib/db.js";

function time(label, fn, n = 30) {
  // 预热
  for (let i = 0; i < 3; i++) fn();

  const lat = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    lat.push(performance.now() - t0);
  }
  lat.sort((a, b) => a - b);
  const p = (q) => lat[Math.min(Math.floor(lat.length * q), lat.length - 1)];

  console.log(
    label.padEnd(34) +
    `P50 ${p(0.5).toFixed(2)}ms`.padStart(16) +
    `  P95 ${p(0.95).toFixed(2)}ms`
  );
}

console.log("=== 分解列表接口（10 万行）===\n");

time("COUNT(*)", () => db.prepare("SELECT COUNT(*) c FROM tickets").get());
time("SELECT 20 条（无 ORDER BY）", () =>
  db.prepare("SELECT * FROM tickets LIMIT 20").all());
time("SELECT 20 条（ORDER BY created_at DESC）", () =>
  db.prepare("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20").all());
time("SELECT 20 条（offset=2000）", () =>
  db.prepare("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20 OFFSET 2000").all());
time("SELECT 20 条（offset=20000）", () =>
  db.prepare("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20 OFFSET 20000").all());
time("GROUP BY category", () =>
  db.prepare("SELECT category, COUNT(*) n FROM tickets GROUP BY category").all());
time("WHERE category='quality'", () =>
  db.prepare("SELECT * FROM tickets WHERE category='quality' LIMIT 20").all());
time("WHERE input LIKE '%裂%'", () =>
  db.prepare("SELECT * FROM tickets WHERE input LIKE '%裂%' LIMIT 20").all());
time("JSON.stringify 20 条", () => {
  const rows = db.prepare("SELECT * FROM tickets LIMIT 20").all();
  return JSON.stringify(rows);
});
```

**跑它（注意要连同一个库）：**

```bash
NODE_ENV=development node scripts/profile-api.js
```

**期望输出：**

```text
=== 分解列表接口（10 万行）===

COUNT(*)                                  P50 28.42ms  P95 32.11ms
SELECT 20 条（无 ORDER BY）               P50  0.12ms  P95  0.31ms
SELECT 20 条（ORDER BY created_at DESC）  P50 31.87ms  P95 36.42ms
SELECT 20 条（offset=2000）               P50 34.51ms  P95 39.88ms
SELECT 20 条（offset=20000）              P50 62.14ms  P95 71.23ms
GROUP BY category                         P50 28.94ms  P95 33.12ms
WHERE category='quality'                  P50 12.31ms  P95 15.44ms
WHERE input LIKE '%裂%'                   P50 41.28ms  P95 48.91ms
JSON.stringify 20 条                      P50  0.21ms  P95  0.38ms
```

**六个立刻能定位的问题：**

```text
① COUNT(*) 28ms → 全表扫（SQLite 的 COUNT(*) 不能走索引）
② ORDER BY created_at DESC 31ms → 没索引 → 全表扫 + 排序
③ offset=20000 62ms → 扫 2 万行
④ GROUP BY category 29ms → 没索引 → 全表扫
⑤ WHERE category='quality' 12ms → 没索引（10 万行的 1/6 也要扫）
⑥ LIKE '%裂%' 41ms → 前置通配符，必然全表扫
⑦ JSON.stringify 0.21ms → 不是瓶颈
```

**核心结论：**

```text
列表接口 45ms 里：
  COUNT(*)        28ms  ← 62%
  ORDER BY        31ms  ← 但和 COUNT 有重叠（同一次查询？）
  实际是两次查询：countTickets + listTickets
  → 28 + 31 = 59ms？但接口只有 45ms
  → 说明有缓存，或者我的数字是示意
```

**你可以自己算：接口 45ms，SQL 加起来多少？差值就是"你的代码 + 中间件"的开销。**

## 3.4 用 `EXPLAIN QUERY PLAN` 确认

```javascript
// scripts/explain.js
import { db } from "../app/lib/db.js";

const queries = [
  ["COUNT(*)", "SELECT COUNT(*) c FROM tickets"],
  ["ORDER BY created_at", "SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20"],
  ["offset=20000", "SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20 OFFSET 20000"],
  ["GROUP BY category", "SELECT category, COUNT(*) n FROM tickets GROUP BY category"],
  ["WHERE category", "SELECT * FROM tickets WHERE category='quality' LIMIT 20"],
  ["LIKE 前置", "SELECT * FROM tickets WHERE input LIKE '%裂%' LIMIT 20"],
];

for (const [label, sql] of queries) {
  console.log(`\n=== ${label} ===`);
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
  for (const p of plan) console.log(`  ${p.detail}`);
}
```

**跑它：**

```bash
NODE_ENV=development node scripts/explain.js
```

**期望输出（关键行）：**

```text
=== COUNT(*) ===
  SCAN tickets                         ← 全表扫

=== ORDER BY created_at ===
  SCAN tickets
  USE TEMP B-TREE FOR ORDER BY         ← 全表扫 + 临时排序

=== GROUP BY category ===
  SCAN tickets
  USE TEMP B-TREE FOR GROUP BY         ← 全表扫 + 临时分组

=== WHERE category ===
  SCAN tickets                         ← 全表扫

=== LIKE 前置 ===
  SCAN tickets                         ← 全表扫（索引救不了）
```

**五个 `SCAN` = 五个全表扫。**

**这就是第 149 节要解决的全部问题。**

## 3.5 三个词的意思

```text
SCAN table          全表扫描（慢）
SEARCH table USING INDEX idx_x    走索引（快）
SEARCH table USING COVERING INDEX idx_x   走覆盖索引（最快，不用回表）
USE TEMP B-TREE FOR ORDER BY      排序没走索引（中）
```

**优化目标：把 `SCAN` 变成 `SEARCH USING INDEX`。**

---

# 第 4 步：写基线档案（20 分钟）

## 4.1 `PERF-BASELINE.md`

```markdown
# 性能基线（第 148 节）

> 这是"改之前"的快照。后面六节每改一处，都回来对比。

## 环境

- 机器：________（CPU / 内存）
- Node：________
- SQLite：________（`node -e "console.log(require('better-sqlite3').prototype.constructor.name)"` 或者 `SELECT sqlite_version()`）
- 数据：100,000 行（`scripts/seed-big.js` 造的，seed=20261117）
- 数据库大小：____ MB

## 接口耗时（每个 30 次，P50/P95）

| 接口 | P50 | P95 | 结论 |
|---|---|---|---|
| /health | | | 基准 |
| 列表（第1页） | | | |
| 列表（offset=2000） | | | |
| 列表（offset=20000） | | | |
| 按分类统计 | | | |
| 队列统计 | | | |

## SQL 耗时分解

| SQL | P50 | EXPLAIN |
|---|---|---|
| `COUNT(*)` | | SCAN |
| `ORDER BY created_at DESC LIMIT 20` | | SCAN + TEMP B-TREE |
| `... OFFSET 20000` | | SCAN + TEMP B-TREE |
| `GROUP BY category` | | SCAN + TEMP B-TREE |
| `WHERE category='quality'` | | SCAN |
| `WHERE input LIKE '%裂%'` | | SCAN |
| `JSON.stringify(20 rows)` | | —— |

## 五个瓶颈（按影响排序）

1. `COUNT(*)` 全表扫（__ms）
2. `ORDER BY created_at` 全表扫 + 临时排序（__ms）
3. `GROUP BY category` 全表扫（__ms）
4. `OFFSET 20000` 扫 2 万行（__ms）
5. `LIKE '%x%'` 全表扫（__ms）

## 现有索引

```text
（贴 sqlite_master 查出来的）
```

## 精度说明

- 每个接口 30 次，P95 的误差约 ±10%
- JSON.stringify 只占 0.2ms，不是瓶颈 —— **不要优化它**
- health 4ms 是框架开销 —— **不要优化它**
```

## 4.2 为什么"不要优化它"要写进档档案

**因为你会手痒。**

```text
你看到 JSON.stringify 0.21ms → 想"能不能更快"
你看到 health 4ms → 想"是不是中间件太多"
```

**写下来之后，你有了拒绝的依据。**

**这也是第 146 节"不做什么"清单的同一条原则。**

## 4.3 一个额外的数字：写入耗时

```javascript
// scripts/profile-write.js
import { db } from "../app/lib/db.js";

const insert = db.prepare(`
  INSERT INTO tickets (trace_id, input, output, category, urgency, need_human, route, degraded, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function time(label, fn, n = 200) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  const ms = performance.now() - t0;
  console.log(`${label.padEnd(30)} ${(ms / n).toFixed(3)} ms/次   (${n} 次共 ${ms.toFixed(0)}ms)`);
}

time("单条 INSERT（自动提交）", (i) => {
  insert.run(`tr_probe_${i}_${Date.now()}`, "x".repeat(80), null, "other", "low", 0, "auto", 0, Date.now());
});

const tx = db.transaction((base) => {
  for (let i = 0; i < 1000; i++) {
    insert.run(`tr_tx_${base}_${i}`, "x".repeat(80), null, "other", "low", 0, "auto", 0, Date.now());
  }
});
time("批量 INSERT（1000/事务）", (i) => tx(i * 1000));
```

**跑它，你会看到：**

```text
单条 INSERT（自动提交）        1.240 ms/次
批量 INSERT（1000/事务）       0.021 ms/次
```

**差 59 倍。**

**这个数字会告诉你"写索引的代价"：**

```text
加一个索引 → 每次 INSERT 多写一次 B-tree
如果 1.24ms → 1.4ms，你可能不觉得
但如果批量 0.021 → 0.045ms，翻倍
```

**第 149 节加索引之后，回来重跑这个，看写入慢了多少。**

**这是"索引不是越多越好"的量化依据。**

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **10 万行造了多久，数据库多大**
- **七个接口的 P95**
- **六个 SQL 的耗时 + EXPLAIN 结果**
- **写入耗时（单条 vs 批量）**

---

# 第 6 步：课后练习

## 练习一：加一个"按 trace_id 查"（20 分钟）

```javascript
time("WHERE trace_id = ?", () =>
  db.prepare("SELECT * FROM tickets WHERE trace_id = ?").get("tr_seed_50000"));
```

**跑一下 —— 应该已经很快了（因为 `trace_id` 有 UNIQUE 索引）。**

**验证：**

```bash
node scripts/explain.js  # 加一条进去
# 期望：SEARCH tickets USING INDEX sqlite_autoindex_tickets_1 (trace_id=?)
```

**这个对照很重要：**

```text
WHERE trace_id = ?   → 0.05ms（有索引）
WHERE category = ?   → 12ms（没索引）
```

**同样是一列等值查询，差 240 倍。**

**记住这个对比，第 149 节你会理解"索引为什么值钱"。**

## 练习二：算清"每天加多少行"（15 分钟）

```text
当前 10 万行
如果每天新增 ____ 条
→ ____ 天后表变 20 万行
→ ____ 天后变 100 万行
```

**用你的真实业务量算。**

**然后回答：**

```text
在哪个时间点，你必须做第 151 节的"keyset 分页"？
在哪个时间点，你必须做第 152 节的"FTS5 搜索"？
```

**参考答案框架：**

```text
每天 1000 条：
  10 万 → 20 万 需要 100 天（3 个月）
  20 万 → 100 万 需要 800 天（2 年）

OFFSET 的问题在 5 万行就明显了 → 3 个月后必须改
LIKE 的问题在 10 万行就是 400ms 了 → 现在就该改
```

**这个推算决定你的优化优先级。**

## 练习三：判断这份基线错在哪（15 分钟）

```markdown
# 性能基线

| 接口 | 耗时 |
|---|---|
| 列表 | 45ms |
| 统计 | 148ms |

结论：列表慢，需要优化。
```

**错在哪？至少五条。**

**参考答案：**

```text
① 没有数据量 → 45ms 是 300 行还是 10 万行？
② 没有 P95/P99 → 只有一次的值，还是最快的值？
③ 没有分解 → 45ms 里 SQL 占多少、代码占多少？
④ 没有 EXPLAIN → 不知道是全表扫还是索引
⑤ 结论"列表慢"不可行动 → 慢在哪？该怎么改？
⑥ 没有"改之前"的对照物 → 改完之后无法证明改好了
⑦ 没有精度说明 → 45ms 的误差是 ±5ms 还是 ±20ms？
```

**第 ⑦ 条最少人想到。** 单次测量的 45ms，下次测可能是 62ms（因为磁盘缓存状态不同）。**没有"跑 30 次取 P95"这个说明，你的数字不可比。**

---

# 第 7 步：最终验收

## A. 数据造好了

- [ ] `scripts/seed-big.js` 存在，支持 `--rows` / `--reset` / `--reset-only`
- [ ] 固定随机种子（可重复）
- [ ] 长度分布 60/30/10（avg 80–150 字）
- [ ] 时间平方分布（最近 7 天每天 1000+ 行）
- [ ] 分批事务（每 1000 条）
- [ ] 生产环境会拒绝执行
- [ ] 实际造了 __ 行，库大小 __ MB，耗时 __ 秒

## B. 接口耗时

- [ ] `scripts/bench.js` 存在
- [ ] **`await res.text()` 读完 body**
- [ ] 预热 3 次
- [ ] 每个接口 30 次，出 P50/P90/P95/P99
- [ ] 专测三个 offset（0 / 2000 / 20000）
- [ ] 标出 P95 ≥ 100ms 的接口

## C. SQL 分解

- [ ] `scripts/profile-api.js` 量了 7–9 条 SQL
- [ ] `COUNT(*)` 的耗时知道了
- [ ] `ORDER BY` 的耗时知道了
- [ ] `GROUP BY` 的耗时知道了
- [ ] `LIKE '%x%'` 的耗时知道了
- [ ] `JSON.stringify` 的耗时知道了（**并确认它不是瓶颈**）
- [ ] `EXPLAIN QUERY PLAN` 跑了，看到五个 `SCAN`

## D. 写入耗时

- [ ] 单条 INSERT ms/次
- [ ] 批量（1000/事务）ms/次
- [ ] **算出了倍数差**（应该 50 倍以上）

## E. 基线档案

- [ ] `PERF-BASELINE.md` 写完
- [ ] 有环境（机器 / Node / SQLite 版本）
- [ ] 有数据量（10 万行）
- [ ] 有接口表 + SQL 表
- [ ] 有"五个瓶颈"按影响排序
- [ ] 有"不要优化它"（JSON / health）
- [ ] **有精度说明**（30 次、P95 误差 ±10%）

## F. 提交

```bash
git add -A
git commit -m "第148节：10万行基线，列表P95 XXms，五个SCAN"
git push
```

---

## 本节课要能说出口的一句话

> **"我觉得列表慢"不是依据。"列表 45ms，其中 COUNT(*) 占 28ms，EXPLAIN 显示 SCAN"才是。**

---

# 附：常见问题速查

**Q：造 10 万行要多久？我的机器很慢。**

A：**分批事务的话，10–20 秒。**

```text
每条一个事务 → 20 分钟（10 万次 fsync）
每 1000 条一个 → 15 秒（100 次 fsync）
```

**如果你跑了 5 分钟还没完** → 你没有用事务 → 检查 `db.transaction()` 有没有生效。

**Q：为什么 `COUNT(*)` 这么慢？SQLite 不是能数得很快吗？**

A：**SQLite 的 `COUNT(*)` 在 MyISAM 那种引擎上能 O(1)，但 SQLite 是 B-tree 存储，必须遍历。**

```text
10 万行 → 28ms
100 万行 → 280ms
```

**这是 SQLite 的固有特性。**

**优化办法：**

```text
① 缓存总数（每次写入时 ±1）
② 用 `SELECT MAX(rowid)` 近似（不准，但在列表页够了）
③ 只在第一页返回 total，后续页不再算
```

**第 150 节会做 ② 或 ③。**

**Q：我的数字全是 1–2ms，是不是造数据失败了？**

A：**检查三件事：**

```bash
# ① 行数
node -e "import('./app/lib/db.js').then(({db})=>console.log(db.prepare('select count(*) c from tickets').get()))"

# ② 服务连的库
curl -s localhost:3999/api/tickets?limit=1 | jq .total

# ③ 库文件大小
ls -lh data/*.db
```

**如果 `total` 是 300 而不是 100000** → 服务连的不是你造数据的那个库 → 检查 `DB_FILE`。

**Q：`EXPLAIN QUERY PLAN` 输出只有一行？**

A：**说明这个查询很简单，只有一步。**

```text
SELECT * FROM tickets WHERE trace_id = ?
  → SEARCH tickets USING INDEX sqlite_autoindex_tickets_1 (trace_id=?)
  → 一行，正常
```

**复杂的查询（JOIN、GROUP BY）会有多行。**

**Q：`ms/次` 和 `P50` 有什么区别？**

A：**`ms/次` 是平均值，`P50` 是中位数。**

```text
200 次插入，总耗时 248ms
ms/次 = 1.24
P50 可能是 0.9ms（因为少数慢的拉高了平均）
```

**批量操作看平均值就够（因为量大且同质）。**

**单次请求看 P50/P95（因为你要知道"用户感受到的"）。**

**Q：我需要保留这 10 万行数据吗？**

A：**保留到这一周结束。**

```text
第 149–153 节每改一处，都要在同一个 10 万行库上重测
→ 才能对比
→ 才能证明"从 200ms 变成 3ms"
```

**第 154 节做完档案后，可以清掉（`--reset-only`）。**

**Q：为什么"时间分布"要用平方？**

A：**因为真实业务是增长的。**

```text
均匀分布：365 天每天 274 行
  → "最近 7 天"只有 1918 行 = 全表的 1.9%
  → WHERE created_at > now-7d 只扫 1.9% → 看起来很快

平方分布：80% 在最近 100 天
  → "最近 7 天"有 6000+ 行 = 6%
  → 更接近真实的"最近数据查询"
```

**如果你不做这个，你会低估"按时间筛选"的成本。**
