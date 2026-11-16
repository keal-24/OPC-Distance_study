# 第 110 节课：定时任务

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前两节的任务都是"用户点了才跑"。今天做"没人点也会自己跑"：
> **每天 9 点自动生成报表、每 10 分钟扫一次超时订单。**

**建议用时**：120 分钟
**你需要先完成**：第 108、109 节（`job-queue` 能跑，重试和幂等都对）
**今天不装新东西**

---

# 第 0 步：三种"定时"，别混在一起（10 分钟）

| 需求 | 例子 | 实现 |
|---|---|---|
| **固定时刻** | 每天 9:00、每周一 8:00、每月 1 号 | 算"下一次时间点" |
| **固定间隔** | 每 5 分钟扫一次 | `上次 + 间隔` |
| **一次延后** | 3 天后提醒这个用户 | `next_run_at = 现在 + 3 天` |

**第三种你第 108 节已经会了** —— `next_run_at` 设成未来时间就行。**今天补前两种。**

## 0.1 为什么不用 `setInterval`

新手最常见的写法：

```javascript
// 错：这是给未来埋雷
setInterval(() => {
  generateDailyReport();
}, 24 * 60 * 60 * 1000);
```

**四个死因：**

```text
① 进程重启 → 计时器清零 → 从"启动时间"重新算 24 小时
   → 你今天 9 点重启了服务，明天 9 点不会跑，要等到 9:00 + 24h 之后的某个时刻
② 多开一个进程 → 两份定时任务 → 报表生成两次
③ 服务器时钟/夏令时/手动改时间 → 计时器直接跑偏
④ 进程睡了/机器休眠 → 计时器不准
```

**核心问题：`setInterval` 的时间状态在内存里。** 和上节课的 `Map` 一个毛病。

## 0.2 正确做法：时间也存数据库

```text
一张 schedules 表，每行记着"这个定时任务下一次该在什么时候跑"。
worker 每秒问一次：有没有到点的？到点了就投一个普通任务出去，然后算下一次。
```

**看这个设计的关键点：**

```text
定时任务不直接干活。它只负责"到点投一个普通任务"。
干活还是走第 108、109 节那条链路（认领、重试、幂等）。
```

**这就是"调度"和"执行"分开。** 分开之后，定时任务自动继承了重试和幂等 —— 不用重写一遍。

---

# 第 1 步：建项目（10 分钟）

在 `03-练习代码` 下新建 `cron-lab`：

```bash
npm init -y
npm pkg set type=module
npm install better-sqlite3
```

新建 `.gitignore`：

```text
node_modules/
*.db
*.db-wal
*.db-shm
```

---

# 第 2 步：建两张表（20 分钟）

新建 `db.js`：

```javascript
// db.js
import Database from "better-sqlite3";

const db = new Database("cron.db");
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
  -- 定时任务定义
  CREATE TABLE IF NOT EXISTS schedules (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL,          -- 'daily' | 'interval'
    at_hour     INTEGER,                -- daily 用：几点
    at_minute   INTEGER,                -- daily 用：几分
    every_ms    INTEGER,                -- interval 用：每多少毫秒
    job_type    TEXT NOT NULL,
    payload     TEXT NOT NULL,
    next_at     INTEGER NOT NULL,       -- 下一次该跑的时间戳
    last_run_at INTEGER,
    enabled     INTEGER NOT NULL DEFAULT 1
  );

  -- 普通任务表（和第 108 节一样，多一个去重键）
  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    payload     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    attempts    INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    progress    INTEGER NOT NULL DEFAULT 0,
    step        TEXT,
    result      TEXT,
    last_error  TEXT,
    dedupe_key  TEXT UNIQUE,           -- ← 防重复投递
    created_at  INTEGER NOT NULL,
    next_run_at INTEGER NOT NULL,
    started_at  INTEGER,
    finished_at INTEGER,
    worker_id   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs (status, next_run_at);

  -- 执行日志（可选，但排查时救命）
  CREATE TABLE IF NOT EXISTS runs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule   TEXT NOT NULL,
    job_id     TEXT NOT NULL,
    fired_at   INTEGER NOT NULL,
    UNIQUE (schedule, job_id)
  );
`);

export default db;
```

## 2.1 `dedupe_key` 是什么

```sql
dedupe_key TEXT UNIQUE
```

**用途：** 同一个"业务时刻"只能投一个任务。

```text
每天 9 点的报表 → dedupe_key = "daily-report:2026-11-16"
```

**就算调度逻辑因为重启或并发投了两次，第二次的 `INSERT` 会被唯一索引挡掉。**

**这和上节课的幂等是同一个思路：把"只能发生一次"这件事交给数据库，不要靠代码里的 if。**

---

# 第 3 步：写"算下一次"的函数（20 分钟）

新建 `schedule.js`：

```javascript
// schedule.js
// 只干一件事：算出"下一次该跑的时间"

// 每天固定时刻（按本机时区）
export function nextDailyAt(hour, minute, fromMs = Date.now()) {
  const from = new Date(fromMs);

  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);

  // 今天这个点已经过了，就推到明天
  if (next.getTime() <= fromMs) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime();
}

// 固定间隔
export function nextInterval(everyMs, fromMs = Date.now()) {
  return fromMs + everyMs;
}

// 统一入口
export function computeNext(schedule, fromMs = Date.now()) {
  if (schedule.kind === "daily") {
    return nextDailyAt(schedule.at_hour, schedule.at_minute, fromMs);
  }
  if (schedule.kind === "interval") {
    return nextInterval(schedule.every_ms, fromMs);
  }
  throw new Error(`未知的 kind：${schedule.kind}`);
}

// 给 dedupe_key 用的"业务时刻"
export function dailyKey(prefix, ms = Date.now()) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${prefix}:${y}-${m}-${day}`;
}
```

## 3.1 立刻验证（别带着错的函数往下走）

```bash
node -e "
import('./schedule.js').then(({ nextDailyAt, dailyKey }) => {
  const now = Date.now();
  console.log('现在：', new Date(now).toLocaleString());
  console.log('下一次 9:00：', new Date(nextDailyAt(9, 0)).toLocaleString());
  console.log('下一次 23:59：', new Date(nextDailyAt(23, 59)).toLocaleString());
  console.log('今天的 key：', dailyKey('daily-report'));
});
"
```

**你应该看到：**

```text
现在： 2026/11/16 15:30:00
下一次 9:00： 2026/11/17 09:00:00      ← 今天 9 点过了，所以是明天
下一次 23:59： 2026/11/16 23:59:00     ← 今天还没到
今天的 key： daily-report:2026-11-16
```

**三个数字都对，再往下走。**

## 3.2 时区：这一节最容易被忽略的坑

`setHours` 用的是**运行机器的时区**。

```text
你的 Windows 在中国 → 本机时区 = 北京时间 → 一切正常
服务器在云上 → 默认常常是 UTC → setHours(9) 其实是"北京 17:00"
```

**后果：客户投诉"报表说好早上 9 点，实际下午 5 点才到"。**

**三种解法，选一个：**

| 解法 | 怎么做 | 评价 |
|---|---|---|
| **启动时指定时区** | 启动命令前加 `TZ=Asia/Shanghai` | 最省事，这周用这个 |
| 代码里做时区换算 | 用 `Intl.DateTimeFormat` 算偏移 | 麻烦，容易算错 |
| 用带时区的调度库 | `cron-parser` / `node-cron` 支持 `timeZone` | 上生产推荐 |

**验证你机器的时区：**

```bash
node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().toString())"
```

**如果打印 `UTC`，就在启动时加 `TZ=Asia/Shanghai`**（Git Bash）或先 `set TZ=Asia/Shanghai`（cmd）。

---

# 第 4 步：写调度进程（30 分钟）

新建 `scheduler.js`：

```javascript
// scheduler.js
// 独立进程：每秒看一眼有没有到点的定时任务

import { randomUUID } from "node:crypto";
import db from "./db.js";
import { computeNext, dailyKey } from "./schedule.js";

const tickerId = `t-${process.pid}`;
let shuttingDown = false;

// 抢到调度权：只有当 next_at 还是我读到的那个值时才能更新
// 这一条就是"多进程不会重复触发"的全部秘密
const grabSchedule = db.prepare(`
  UPDATE schedules
  SET next_at = ?, last_run_at = ?
  WHERE id = ? AND next_at = ? AND enabled = 1
`);

// 投递普通任务（dedupe_key 兜底）
const insertJob = db.prepare(`
  INSERT OR IGNORE INTO jobs
    (id, type, payload, status, attempts, max_attempts, progress, dedupe_key, created_at, next_run_at)
  VALUES (?, ?, ?, 'pending', 0, 3, 0, ?, ?, ?)
`);

const insertRun = db.prepare(`
  INSERT OR IGNORE INTO runs (schedule, job_id, fired_at) VALUES (?, ?, ?)
`);

const listDue = db.prepare(`
  SELECT * FROM schedules WHERE enabled = 1 AND next_at <= ?
`);

function fire(schedule) {
  const now = Date.now();

  // 业务时刻：daily 用日期，interval 用"第几次"
  const key =
    schedule.kind === "daily"
      ? dailyKey(schedule.name, now)
      : `${schedule.name}:${Math.floor(now / schedule.every_ms)}`;

  const nextAt = computeNext(schedule, now);

  // ① 先抢调度权（原子的）
  const grabbed = grabSchedule.run(nextAt, now, schedule.id, schedule.next_at);

  if (grabbed.changes === 0) {
    // 另一个进程抢先了，或者 next_at 已经变了
    return;
  }

  // ② 再投任务（dedupe_key 二次兜底）
  const jobId = randomUUID();
  const info = insertJob.run(
    jobId,
    schedule.job_type,
    schedule.payload,
    key,
    now,
    now,
  );

  if (info.changes === 0) {
    console.log(`[${tickerId}] ${schedule.name} 本时刻已投过（${key}），跳过`);
    return;
  }

  insertRun.run(schedule.name, jobId, now);
  console.log(`[${tickerId}] 触发 ${schedule.name} → 任务 ${jobId.slice(0, 8)}，下次 ${new Date(nextAt).toLocaleString()}`);
}

function loop() {
  if (shuttingDown) return;

  const now = Date.now();
  const due = listDue.all(now);

  for (const s of due) {
    fire(s);
  }

  setTimeout(loop, 1000);      // 每秒看一眼
}

console.log(`[${tickerId}] 调度器启动`);
loop();

process.on("SIGINT", () => {
  console.log(`\n[${tickerId}] 停止调度`);
  shuttingDown = true;
  process.exit(0);
});
```

## 4.1 为什么"抢调度权"那一条 SQL 是关键

```sql
UPDATE schedules
SET next_at = ?, last_run_at = ?
WHERE id = ? AND next_at = ? AND enabled = 1
```

**`AND next_at = ?`（读到的那个旧值）就是"乐观锁"。**

```text
进程 A：读到 next_at = 1000，算好下一次是 2000，执行 UPDATE ... WHERE next_at = 1000 → changes = 1 → 我抢到了
进程 B：也读到 next_at = 1000，执行 UPDATE ... WHERE next_at = 1000 → 此刻已是 2000 → changes = 0 → 我没抢到
```

**和第 108 节的原子认领是同一个思想：** 把"判断 + 修改"压进一条 SQL。

## 4.2 加两个定时任务

新建 `seed.js`：

```javascript
// seed.js
// 塞两个定时任务进去：每天 9:00 出报表；每 2 分钟扫一次
import { randomUUID } from "node:crypto";
import db from "./db.js";
import { nextDailyAt, nextInterval } from "./schedule.js";

const insert = db.prepare(`
  INSERT OR IGNORE INTO schedules
    (id, name, kind, at_hour, at_minute, every_ms, job_type, payload, next_at, enabled)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

const now = Date.now();

// 每天 9:00，报表
insert.run(
  randomUUID(),
  "daily-report",
  "daily",
  9,
  0,
  null,
  "report",
  JSON.stringify({ scope: "yesterday" }),
  nextDailyAt(9, 0, now),
);

// 每 2 分钟，扫超时订单（2 分钟是为了让你今天就能看到效果）
insert.run(
  randomUUID(),
  "scan-timeout-order",
  "interval",
  null,
  null,
  2 * 60 * 1000,
  "scan",
  JSON.stringify({ table: "orders" }),
  nextInterval(2 * 60 * 1000, now),
);

console.table(db.prepare("SELECT name, kind, next_at FROM schedules").all());
console.log("已写入。现在起 scheduler.js 和 worker.js 观察。");
```

**跑它：**

```bash
node seed.js
```

## 4.3 起动两个进程

**终端 A：**

```bash
node scheduler.js
```

**你应该看到：**

```text
[t-12345] 调度器启动
[t-12345] 触发 scan-timeout-order → 任务 a1b2c3d4，下次 2026/11/16 15:36:00
```

**2 分钟后又会触发一次。** 每天 9 点那个要等到明天 —— **所以下面要教你怎么"不等到明天也验证它"。**

**终端 B：** 你有两条路

```text
① 起第 108 节的 worker.js（在 job-queue 目录里）→ 它读的是另一个数据库，看不到这里的任务
② 这节课只关心"任务有没有被投出去"，直接在表里看就行
```

**这节课用第 ② 条。** 查表：

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare('select type,status,dedupe_key,created_at from jobs').all()))"
```

**你应该看到 `scan` 类型的任务，状态 `pending`，`dedupe_key` 是 `scan-timeout-order:xxxxxx`。**

## 4.4 怎么不等明天就验证 daily

**临时改一下 `next_at`，让它现在就到点：**

```bash
node -e "import('./db.js').then(({default: db}) => { db.prepare(\"UPDATE schedules SET next_at = ? WHERE name = 'daily-report'\").run(Date.now() - 1000); console.log('已把 daily-report 改成到点'); })"
```

**scheduler 会在 1 秒内触发它。**

**你应该看到：**

```text
[t-...] 触发 daily-report → 任务 xxxx，下次 2026/11/17 09:00:00
```

**注意"下次"确实是明天 9:00 —— 说明算下一次的逻辑是对的。**

---

# 第 5 步：验证多进程不重复（20 分钟）

**这一步和上节课"两个 worker 不抢任务"同等重要。**

## 5.1 起两个调度器

**终端 A：** `node scheduler.js`
**终端 B：** `node scheduler.js`

**两个 `tickerId` 不一样（pid 不同）。**

## 5.2 把 scan 的间隔改成 30 秒，然后等

```bash
node -e "import('./db.js').then(({default: db}) => { db.prepare(\"UPDATE schedules SET every_ms = 30000, next_at = ? WHERE name = 'scan-timeout-order'\").run(Date.now() + 2000); console.log('改成 30 秒后触发'); })"
```

**你应该看到：**

```text
终端 A：触发 scan-timeout-order → 任务 1111
（终端 B 没有任何输出）
```

**30 秒后再来一次，可能换成终端 B 触发。** 但**每一次触发只出现在一个终端里**。

## 5.3 去 `runs` 表核对（不要靠眼睛）

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare('select schedule, count(*) as n, min(fired_at) as first, max(fired_at) as last from runs group by schedule').all()))"
```

**再数一下 `jobs` 表里 `type='scan'` 的条数。**

**两个数字必须一样。** 如果 `jobs` 比 `runs` 多，说明有任务投了但没记录（不会发生，因为都在一个事务里？不是事务，但 dedupe_key 挡着）。

**如果 `jobs` 里同一个 `dedupe_key` 出现两次，你的唯一索引没建成功。**

## 5.4 故意去掉 `AND next_at = ?`，看后果

把 `grabSchedule` 改成：

```sql
UPDATE schedules SET next_at = ?, last_run_at = ? WHERE id = ? AND enabled = 1
```

**两个调度器同时到点。**

**你应该看到：**

```text
终端 A：触发 scan → 任务 1111
终端 B：触发 scan → 任务 2222
```

**但有两个任务被投出去了吗？** 查表。

**结果是：只有一条 `jobs`，因为 `dedupe_key` 挡住了第二个。**

**这就是"两道防线"的价值：** 乐观锁是第一道，唯一索引是第二道。**第一道挡不住的时候，第二道救命。**

**看完把 `AND next_at = ?` 改回去。**

---

# 第 6 步：故意犯四个错（20 分钟）

## 错误 1：用 `setInterval` 做每日任务

```javascript
setInterval(() => fire(), 24 * 60 * 60 * 1000);
```

**验证问题：**

1. 启动时间 15:30 → 第一次触发在明天 15:30，**不是 9:00**；
2. 中途 `Ctrl+C` 重启 → 又是 24 小时后；
3. 两个进程 → 触发两次。

**三个问题，一个都躲不过。**

## 错误 2：时区错了

假设服务器是 UTC。**在代码里加一行**验证：

```javascript
console.log("本机时区：", Intl.DateTimeFormat().resolvedOptions().timeZone);
```

**如果你在云服务器上看到 `UTC`，`setHours(9)` 就是北京的 17 点。**

**解法：启动时 `TZ=Asia/Shanghai node scheduler.js`。**

## 错误 3：每月 31 号的任务

```javascript
// 想"每月 31 号"？2 月没有 31 号。
next.setMonth(next.getMonth() + 1);
```

**`setMonth` 在 1 月 31 日执行会得到 3 月 3 日**（2 月只有 28 天，溢出）。

**结论：每月任务不要用"31 号"，用"每月 1 号"或"每月最后一天"（要专门算）。**

## 错误 4：把定时任务写成"直接干活"

```javascript
// 错
if (due) {
  await generateReport();      // 直接在调度进程里跑 3 分钟
  updateNextAt();
}
```

**后果：**

```text
① 这 3 分钟里，别的定时任务全被耽误（调度进程单线程）
② 跑失败了没有重试（调度逻辑里没有重试机制）
③ 重复执行没有幂等保护
```

**正确：调度只投任务，干活交给 worker。** 这就是第 0 节说的"调度和执行分开"。

---

# 第 7 步：写学习笔记（10 分钟）

---

# 第 8 步：课后练习

## 练习一：实现"每周一 8:00"（15 分钟）

在 `schedule.js` 里加：

```javascript
export function nextWeekly(weekday, hour, minute, fromMs = Date.now()) { ... }
```

`weekday`：1 = 周一 … 0 = 周日。

**验证：**

```bash
node -e "import('./schedule.js').then(m => console.log(new Date(m.nextWeekly(1, 8, 0)).toLocaleString()))"
```

**应该打印下周一 8:00。今天是周一的话，是下周一（不是今天）。**

## 练习二：加一个"禁用"开关（10 分钟）

写 `disable.js`：

```bash
node disable.js daily-report off
node disable.js daily-report on
```

**验证：** 关掉之后，把 `next_at` 改成到点，scheduler 也不该触发。

## 练习三：把调度失败也记下来（15 分钟）

现在如果 `insertJob` 报错，调度器会直接崩（没人接）。

改成：捕获错误，写进 `runs` 表的一个新字段 `error`，**并且仍然推进 `next_at`**（否则这个定时任务会卡死在这一刻，每秒报错）。

**这是个真实的设计决策：宁可错过一次，也不要卡死每秒重试。**

---

# 第 9 步：最终验收

## A. 三种定时都会

- [ ] 我能说清"固定时刻""固定间隔""一次延后"的区别
- [ ] `nextDailyAt` 和 `nextInterval` 我都验证过
- [ ] 我知道 `next_run_at` 设成未来时间就是"一次延后"

## B. 调度器能跑

- [ ] `seed.js` 写入两个定时任务
- [ ] `scheduler.js` 到点会触发，日志里能看到"下次"时间
- [ ] 触发的任务进了 `jobs` 表

## C. 多进程不重复

- [ ] 起两个调度器，同一个时刻只有一个触发
- [ ] `runs` 表和 `jobs` 表条数一致
- [ ] 我试过去掉乐观锁，看到 `dedupe_key` 救了场

## D. 时区没搞错

- [ ] 我知道我机器的时区
- [ ] 我知道服务器可能是 UTC，以及怎么改

## E. 四个错都踩过

- [ ] 见过 `setInterval` 的三个问题
- [ ] 知道 `setMonth` 在 31 号会溢出
- [ ] 知道定时任务不该直接干活
- [ ] 知道调度失败不能卡死

## F. 笔记

- [ ] "调度和执行分开"这句话我用自己的话写过
- [ ] 乐观锁那条 SQL 我抄过并注释
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **定时任务的本质不是"定时器"，是"下次该跑的时间存哪"。**
> **时间存进数据库，重启、多进程、断电都不怕；时间存在内存里，全是运气。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 一直不触发 | `next_at` 是未来时间 | 等到点，或临时把 `next_at` 改成过去 |
| 每秒都触发同一个 | 算出来的 `next_at` 还是过去 | 检查 `computeNext`，别用 `Date.now()` 当基准 |
| 两个进程都触发了 | 乐观锁条件丢了 | `WHERE id = ? AND next_at = ?` 必须在 |
| 任务投了但没执行 | 你只有 `scheduler`，没有 `worker` | 这是两个进程，都要起 |
| 9 点的任务 17 点才跑 | 服务器是 UTC | 启动加 `TZ=Asia/Shanghai` |
| `dedupe_key` 冲突报错 | 用了 `INSERT` 不是 `INSERT OR IGNORE` | 改 `INSERT OR IGNORE` |
| 每月任务日期乱跳 | `setMonth` 月末溢出 | 别用 31 号，或专门算"最后一天" |
| 调度器崩了，任务不跑了 | 没有错误处理 | 练习三：捕获并推进 `next_at` |
