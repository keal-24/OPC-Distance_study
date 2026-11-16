# 第 108 节课：任务表与 worker 进程

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你把任务存在内存里，重启就丢。今天换成数据库，并且把"干活的人"拆成独立进程。
> **这是整个第 4 阶段最关键的一节课。** 后面六周的可靠性、通知、评测，全建在这张表上。

**建议用时**：130 分钟
**你需要先完成**：第 107 节课（`slow-api` 能跑）、第 5 周（会写基本 SQL）
**今天要装**：`better-sqlite3`、`express`

---

# 第 0 步：内存队列的三个死因（15 分钟）

上节课的 `Map` 有三个问题，**每一个都是致命的**。

## 0.1 死因一：进程一重启，任务全没

```text
Map 在进程内存里 → 进程退出 → 内存清空 → 任务没了
```

**后果：** 用户的活白干，钱白烧，他还查不到。**你连"有个任务失败了"都不知道。**

## 0.2 死因二：没法多开一个进程来加速

```text
进程 A 的 Map，进程 B 看不到
```

**所以：** 想开两个 worker 并行处理？**做不到。** 一台 8 核机器只能用 1 核。

## 0.3 死因三：没有历史，出问题查不了

```text
"上周那个客户的报告为什么没生成？"
```

内存里的东西没有历史。**你只能回答"不知道"。**

## 0.4 换成什么

**一张数据库表 + 独立的 worker 进程。** 就这两样。

```text
API 进程        → 只负责"收单子"（往表里插一行）
worker 进程     → 只负责"干活"（从表里取一行，干完改状态）
数据库          → 唯一的真相来源，两个进程都看它
```

**这个结构叫"数据库驱动的队列"。** 名字很唬人，实现就是一张表加一个死循环。

---

# 第 1 步：建项目，装数据库（15 分钟）

## 1.1 建目录

在 `03-练习代码` 下新建 `job-queue`，进去打开终端：

```bash
npm init -y
npm pkg set type=module
npm install better-sqlite3 express
```

**`better-sqlite3` 是什么：** 一个同步的 SQLite 驱动。装不上的看下面。

## 1.2 装不上的三种情况

```text
① 报 node-gyp / MSBuild 相关错误
   → 你的 Node 版本没有预编译包。最省事的解法：换到 Node 22 或 22 LTS

② 报 Python not found
   → 同上，它在尝试本地编译。别去装 Python，换 Node 版本更快

③ 装上了，但 require 时报 ABI 版本不匹配
   → Node 升级过，重装：npm rebuild better-sqlite3
```

**验证装好了：**

```bash
node -e "import('better-sqlite3').then(m => { const db = new m.default(':memory:'); console.log('OK', db.prepare('select 1 as x').get()); })"
```

**应该打印 `OK { x: 1 }`。** 报错就别往下走，先把这一步弄通。

---

# 第 2 步：设计任务表（25 分钟）

## 2.1 先想清楚要记什么

**这张表要能回答这七个问题：**

```text
1. 有哪些任务还没干？          → status
2. 哪个 worker 正在干哪个？     → worker_id
3. 干了多久了？是不是卡死了？   → started_at
4. 失败几次了？还能再试吗？     → attempts / max_attempts
5. 什么时候该重试？             → next_run_at
6. 上次为什么失败？             → last_error
7. 干完了结果在哪？             → result
```

**七个问题对应七个字段。少一个，你以后就得拍脑袋。**

## 2.2 建表

新建 `db.js`：

```javascript
// db.js
// 全项目唯一的数据库入口。API 和 worker 都 import 这个文件。

import Database from "better-sqlite3";

// 数据文件放在当前目录，第一个参数是文件名
const db = new Database("jobs.db");

// WAL 模式：读写可以同时进行，两个进程不会互相锁死
db.pragma("journal_mode = WAL");

// 遇到锁时最多等 5 秒再报错，别立刻挂
db.pragma("busy_timeout = 5000");

// 建表（IF NOT EXISTS：重复执行不会报错）
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    payload       TEXT NOT NULL,

    status        TEXT NOT NULL DEFAULT 'pending',
    attempts      INTEGER NOT NULL DEFAULT 0,
    max_attempts  INTEGER NOT NULL DEFAULT 3,

    progress      INTEGER NOT NULL DEFAULT 0,
    step          TEXT,

    result        TEXT,
    last_error    TEXT,

    created_at    INTEGER NOT NULL,
    next_run_at   INTEGER NOT NULL,
    started_at    INTEGER,
    finished_at   INTEGER,
    worker_id     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_pick
    ON jobs (status, next_run_at);

  CREATE INDEX IF NOT EXISTS idx_jobs_created
    ON jobs (created_at);
`);

export default db;
```

## 2.3 逐个字段解释（这一段别跳）

| 字段 | 类型 | 为什么要有 |
|---|---|---|
| `id` | 文本主键 | 用 UUID，**不要用自增数字**。自增会让人猜出你有多少任务 |
| `type` | 文本 | 任务种类。`summarize` / `thumb` / `email`。worker 靠它决定干什么 |
| `payload` | 文本 | 任务的输入参数，**存 JSON 字符串**（SQLite 没有 JSON 类型，存文本就行） |
| `status` | 文本 | `pending` / `running` / `done` / `failed` / `dead` |
| `attempts` | 整数 | **已经试过几次**。这是重试上限的依据 |
| `max_attempts` | 整数 | 最多试几次。默认 3 |
| `progress` | 整数 | 0—100，给前端画进度条 |
| `step` | 文本 | 当前在哪一步，比如"正在解析第 3 页" |
| `result` | 文本 | 成功的产物，**存 JSON 字符串** |
| `last_error` | 文本 | 上次失败的原因。**排查全靠它** |
| `created_at` | 整数 | 创建时间，毫秒时间戳 |
| `next_run_at` | 整数 | **什么时候可以开始跑**。重试退避和定时任务都靠它 |
| `started_at` | 整数 | 开始时间。**用来判断是不是卡死了** |
| `finished_at` | 整数 | 结束时间，算耗时 |
| `worker_id` | 文本 | 哪个进程在干。多 worker 时排查必备 |

**为什么时间用整数不用文本：**

```text
整数比较快，索引也小。
文本时间（"2026-11-16 15:30:00"）比较要转格式，还容易时区搞错。
```

## 2.4 状态机（必须画在纸上）

```text
                    ┌──────────────┐
        投递 ───────▶│   pending    │
                    └──────┬───────┘
                           │ worker 认领
                           ▼
                    ┌──────────────┐
                    │   running    │
                    └──┬────┬───┬──┘
              成功     │    │   │  失败且还能重试
                       │    │   └──────────┐
                       ▼    │              ▼
                  ┌───────┐ │        ┌──────────┐
                  │ done  │ │        │ pending  │（attempts+1，next_run_at 往后推）
                  └───────┘ │        └──────────┘
                            │ 失败且超过 max_attempts
                            ▼
                       ┌──────────┐
                       │   dead   │  ← 死信，等人工处理
                       └──────────┘
```

**注意 `failed` 和 `dead` 是两个不同的状态：**

```text
failed  = 这一次失败了，但还会重试（中间态，通常一闪而过）
dead    = 彻底放弃了，不会再动（终态，需要人看）
```

**为什么要分：** 如果你只有一个 `failed`，你没法回答"这个任务是等着重试，还是已经废了"，**统计口径就乱了。**

---

# 第 3 步：写"投递任务"的脚本（15 分钟）

新建 `add-job.js`：

```javascript
// add-job.js
// 用法：node add-job.js "一段要被总结的文本"

import { randomUUID } from "node:crypto";
import db from "./db.js";

const text = process.argv[2] ?? "默认的测试文本内容";

const now = Date.now();
const id = randomUUID();

db.prepare(`
  INSERT INTO jobs (id, type, payload, status, attempts, max_attempts, progress, created_at, next_run_at)
  VALUES (?, ?, ?, 'pending', 0, 3, 0, ?, ?)
`).run(
  id,
  "summarize",
  JSON.stringify({ text }),
  now,
  now,          // next_run_at = 现在，表示"立刻可以跑"
);

console.log("已投递：", id);
console.log("查看状态： node show.js", id);
```

**注意三件事：**

1. **`payload` 存的是 JSON 字符串**（`JSON.stringify`），不是对象；
2. **`next_run_at` 设成当前时间**，意思是"立刻可跑"；设成未来时间就是"定时任务"（第 110 节）；
3. **`attempts` 从 0 开始**，认领时才 +1。

## 3.1 跑一次

```bash
node add-job.js "人工智能正在改变软件开发的方式，这是测试文本"
```

**你应该看到：**

```text
已投递： 8f3a1c2e-...
查看状态： node show.js 8f3a1c2e-...
```

## 3.2 看一眼表里有什么

现在还没有 `show.js`，先用命令行直接查：

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare('select id, status, attempts, progress from jobs').all()))"
```

**你应该看到一行 `pending / 0 / 0`。**

---

# 第 4 步：写 worker 进程（35 分钟）

## 4.1 核心是那条"认领"SQL

**先把这段讲透，代码才有意义。**

**错误写法（新手 100% 会这么写）：**

```sql
-- 错！
SELECT * FROM jobs WHERE status = 'pending' LIMIT 1;   -- 查到 id = A
-- ……然后你的代码跑去干别的，或者另一个 worker 也查到了 A……
UPDATE jobs SET status = 'running' WHERE id = 'A';
```

**两个 worker 会同时 `SELECT` 到同一个任务，然后都去干。** 结果：**同一份活干两遍，钱花两倍。**

**正确写法，一条 SQL 完成"查 + 占"：**

```sql
UPDATE jobs
SET status = 'running',
    attempts = attempts + 1,
    started_at = ?,
    worker_id = ?
WHERE id = (
  SELECT id FROM jobs
  WHERE status = 'pending'
    AND next_run_at <= ?
  ORDER BY next_run_at ASC, created_at ASC
  LIMIT 1
)
RETURNING *;
```

**为什么这样就安全：**

```text
SQLite 执行一条 UPDATE 时，整条语句是一个原子操作，中间不会被别的进程插进来。
两个 worker 同时执行这条语句 → 数据库排队 → 第一个把行改成 running 并返回
                                    → 第二个的 WHERE 条件不再匹配 → 返回 0 行
```

**这就是"原子认领"。** 记住这五个字，面试和排查都用得上。

## 4.2 写 `worker.js`

新建 `worker.js`：

```javascript
// worker.js
// 独立进程：死循环，取一个任务，干完，再取下一个

import db from "./db.js";

// 每个 worker 一个标识，方便在表里看出是谁在干
const workerId = `w-${process.pid}-${Math.random().toString(16).slice(2, 6)}`;

let shuttingDown = false;

// ---------- 取任务 ----------
const claimJob = db.prepare(`
  UPDATE jobs
  SET status = 'running',
      attempts = attempts + 1,
      started_at = ?,
      worker_id = ?
  WHERE id = (
    SELECT id FROM jobs
    WHERE status = 'pending'
      AND next_run_at <= ?
    ORDER BY next_run_at ASC, created_at ASC
    LIMIT 1
  )
  RETURNING *
`);

function claim() {
  const now = Date.now();
  return claimJob.get(now, workerId, now);   // 没有任务时返回 undefined
}

// ---------- 改进度 ----------
const setProgress = db.prepare(`
  UPDATE jobs SET progress = ?, step = ? WHERE id = ?
`);

// ---------- 完成 ----------
const markDone = db.prepare(`
  UPDATE jobs
  SET status = 'done', progress = 100, step = NULL, result = ?, finished_at = ?
  WHERE id = ?
`);

// ---------- 失败：先不管重试，第 109 节再处理 ----------
const markFailed = db.prepare(`
  UPDATE jobs
  SET status = 'failed', last_error = ?, finished_at = ?
  WHERE id = ?
`);

// ---------- 任务本体 ----------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTask(job) {
  const payload = JSON.parse(job.payload);

  // 假装分 4 段干活
  for (let i = 1; i <= 4; i++) {
    await sleep(2000);

    setProgress.run(
      i * 25,
      `正在处理第 ${i}/4 段`,
      job.id,
    );

    console.log(`[${workerId}] ${job.id.slice(0, 8)} 进度 ${i * 25}%`);
  }

  return {
    summary: `对「${String(payload.text).slice(0, 12)}…」的总结`,
    segments: 4,
  };
}

// ---------- 主循环 ----------
async function main() {
  console.log(`[${workerId}] worker 启动`);

  while (!shuttingDown) {
    const job = claim();

    if (!job) {
      await sleep(1000);      // 没任务，等 1 秒再看
      continue;
    }

    console.log(`[${workerId}] 领到任务 ${job.id.slice(0, 8)}，第 ${job.attempts} 次尝试`);

    try {
      const result = await runTask(job);
      markDone.run(JSON.stringify(result), Date.now(), job.id);
      console.log(`[${workerId}] ${job.id.slice(0, 8)} 完成`);
    } catch (err) {
      markFailed.run(String(err.message), Date.now(), job.id);
      console.log(`[${workerId}] ${job.id.slice(0, 8)} 失败：${err.message}`);
    }
  }

  console.log(`[${workerId}] 已停止`);
}

// Ctrl+C 时优雅退出：不接新任务，把手上的干完
process.on("SIGINT", () => {
  console.log(`\n[${workerId}] 收到停止信号，干完手上这个就退出`);
  shuttingDown = true;
});

main();
```

## 4.3 启动顺序很重要

**必须开两个终端，一个投递一个干活：**

**终端 A（worker）：**

```bash
node worker.js
```

**你应该看到：**

```text
[w-12345-ab12] worker 启动
（然后每秒刷一次空转，没有输出）
```

**终端 B（投递）：**

```bash
node add-job.js "第一段测试文本"
```

**然后看终端 A：**

```text
[w-12345-ab12] 领到任务 8f3a1c2e，第 1 次尝试
[w-12345-ab12] 8f3a1c2e 进度 25%
[w-12345-ab12] 8f3a1c2e 进度 50%
[w-12345-ab12] 8f3a1c2e 进度 75%
[w-12345-ab12] 8f3a1c2e 进度 100%
[w-12345-ab12] 8f3a1c2e 完成
```

**8 秒后查表：**

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare('select id, status, attempts, progress, worker_id from jobs').all()))"
```

**你应该看到 `done / 1 / 100 / w-12345-ab12`。**

## 4.4 现在的结构长什么样

```text
终端 A              终端 B
worker.js           add-job.js
   │                    │
   └────────┬───────────┘
            ▼
        jobs.db（唯一真相）
```

**关键：`add-job.js` 跑完就退出，`worker.js` 一直活着。** 这是两个完全独立的进程，**谁也不依赖谁。**

---

# 第 5 步：开两个 worker，验证不重复（20 分钟）

**这一步是今天最重要的验证。** 没做过这一步，你等于没学会原子认领。

## 5.1 开两个 worker

**终端 A：** `node worker.js`
**终端 B：** `node worker.js`

**两次启动的 `workerId` 不一样（看 pid）。**

## 5.2 一次投 6 个任务

**终端 C：**

```bash
node add-job.js "任务一"
node add-job.js "任务二"
node add-job.js "任务三"
node add-job.js "任务四"
node add-job.js "任务五"
node add-job.js "任务六"
```

## 5.3 盯住两个 worker 的日志

**你应该看到：**

```text
终端 A：领到 任务一 / 任务三 / 任务五
终端 B：领到 任务二 / 任务四 / 任务六
```

**同一个任务 id 绝不能出现在两个终端里。** 出现了，说明你的认领 SQL 写错了。

**验证方法（不要靠眼睛）：**

```bash
node -e "import('./db.js').then(({default: db}) => { const rows = db.prepare(\"select worker_id, count(*) as n from jobs where status='done' group by worker_id\").all(); console.table(rows); })"
```

**你应该看到两行，两个 worker 各干了一部分。**

## 5.4 把正确写法改成错误写法，看后果

**这一步必须做。** 只看正确的，你不知道错在哪。

把 `worker.js` 里的 `claim()` 改成"先查再改"：

```javascript
function claim() {
  const now = Date.now();
  const row = db.prepare(`
    SELECT * FROM jobs WHERE status = 'pending' AND next_run_at <= ? ORDER BY id LIMIT 1
  `).get(now);

  if (!row) return undefined;

  // 故意中间插一段耗时操作（真实代码里这里可能是别的查询）
  const until = Date.now() + 300;
  while (Date.now() < until) {}

  db.prepare(`
    UPDATE jobs SET status='running', attempts=attempts+1, started_at=?, worker_id=? WHERE id=?
  `).run(now, workerId, row.id);

  return { ...row, attempts: row.attempts + 1 };
}
```

**两个 worker 都改成这样，重新投 6 个任务。**

**你应该看到：**

```text
终端 A：领到 任务一
终端 B：领到 任务一        ← 同一个任务！
```

**两个进程都跑了任务一。** 如果这是模型调用，你付了两份钱。

**看完就改回正确写法。别留着。**

---

# 第 6 步：卡死的任务要能回收（15 分钟）

## 6.1 什么叫卡死

```text
worker 领了任务 → 进程被 kill / 断电 / 内存溢出 → 表里状态永远停在 running
```

**这个任务不会再被任何 worker 领取（因为 `status != 'pending'`），用户永远等不到结果。**

## 6.2 在 worker 主循环里加一段回收

在 `main()` 的 `while` 里，**每次循环开头**加：

```javascript
// 回收卡死的任务：running 超过 5 分钟还没结束，认为 worker 已经死了
const RECYCLE_AFTER_MS = 5 * 60 * 1000;

const recycle = db.prepare(`
  UPDATE jobs
  SET status = 'pending',
      started_at = NULL,
      worker_id = NULL,
      next_run_at = ?,
      last_error = '任务超时，已被回收'
  WHERE status = 'running' AND started_at < ?
`);

// 放在 while 循环里，每轮跑一次
const cutoff = Date.now() - RECYCLE_AFTER_MS;
const info = recycle.run(Date.now(), cutoff);
if (info.changes > 0) {
  console.log(`[${workerId}] 回收了 ${info.changes} 个卡死任务`);
}
```

## 6.3 验证它

**① 投一个任务；**
**② 在 worker 处理到一半时，直接 `Ctrl+C` 杀掉它**（或者用任务管理器结束进程）；
**③ 看表：**

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare('select id, status, started_at, worker_id from jobs').all()))"
```

**你应该看到 `running`，`worker_id` 是刚才那个死掉的进程。**

**④ 把回收阈值临时改成 10 秒**（`10 * 1000`），重启 worker。

**你应该在 10 秒后看到"回收了 1 个卡死任务"，然后这个任务被重新领取、重新跑。**

**⑤ 改回 5 分钟。**

## 6.4 为什么是"回收"而不是"直接标记失败"

```text
标记 failed → 用户要重新提交 → 用户体验差，而且他不知道该重提
回收成 pending → 自动再跑一次 → 用户什么都没感觉到
```

**注意：** 回收会让任务重跑，**所以任务必须幂等**（第 109 节）。这一点现在先记住。

---

# 第 7 步：故意犯三个错（20 分钟）

## 错误 1：不开 WAL，两个进程抢锁

把 `db.js` 里的 `db.pragma("journal_mode = WAL")` 注释掉，两个 worker 同时跑。

**你应该看到：**

```text
SqliteError: database is locked
```

**原因：** 默认的 rollback journal 模式，一个写的时候另一个完全不能写。

**记住：多进程访问同一个 SQLite 文件，必须开 WAL。**

## 错误 2：把 worker 写进 Express 里

很多教程这么干：

```javascript
// 错：worker 和 API 挤在一个进程
app.listen(3000);
setInterval(pollJobs, 1000);
```

**为什么错：**

```text
① API 重启一次，正在跑的任务被中断
② API 进程内存里跑着长任务，一个 OOM 全部崩
③ 想多开 worker 加速 → 被迫连 API 一起多开，端口冲突
④ 分不清"接口慢"和"任务慢"，排查时抓瞎
```

**结论：worker 永远是另一个进程，用 `node worker.js` 单独起。**

## 错误 3：`payload` 存对象

```javascript
// 错：SQLite 不认识对象
db.prepare("INSERT INTO jobs (payload) VALUES (?)").run({ text: "abc" });
```

**你应该看到： `TypeError: ... cannot be bound`。**

**正确：** `JSON.stringify({ text: "abc" })`。

**同理，读出来必须 `JSON.parse`。** 忘了 parse 会拿到字符串，`payload.text` 是 `undefined`，任务会静默地干错事。

---

# 第 8 步：写学习笔记（10 分钟）

**这节课的笔记比代码重要。** 状态机和原子认领那两段，必须用自己的话写一遍。

---

# 第 9 步：课后练习

## 练习一：加一个 `show.js`（15 分钟）

写一个脚本，接收 jobId，打印这个任务的全部字段（格式化成中文）。

```bash
node show.js 8f3a1c2e
```

**输出示例：**

```text
任务 8f3a1c2e
  类型：summarize
  状态：done
  尝试：1 / 3
  进度：100%
  耗时：8.2 秒
  结果：{ summary: "…" }
```

## 练习二：统计（10 分钟）

用 SQL 查出：

1. 每个状态各有几个任务；
2. 平均耗时是多少（`finished_at - started_at`）；
3. 哪个 worker 干得最多。

**用一句 SQL 一个结果，别用 JS 循环。**

## 练习三：想清楚一个问题（10 分钟）

```text
如果 worker 在 markDone 之前崩溃了（活干完了，但状态没来得及改），
会发生什么？用户会看到几次结果？
```

**这题没有标准答案，但它指向第 109 节的核心：幂等。**

---

# 第 10 步：最终验收

## A. 表建对了

- [ ] `jobs` 表有 15 个字段，我能说出其中 10 个是干什么的
- [ ] 有两个索引
- [ ] WAL 模式开着

## B. 单 worker 能跑

- [ ] `add-job.js` 投递成功
- [ ] `worker.js` 领到任务，进度从 0 走到 100
- [ ] 表里状态变成 `done`，`attempts = 1`

## C. 多 worker 不重复

- [ ] 同时起两个 worker
- [ ] 投 6 个任务，两个 worker 都领到了活
- [ ] **同一个 id 没有出现在两个 worker 的日志里**
- [ ] 我试过"先查再改"的错误写法，看到了重复领取

## D. 卡死能回收

- [ ] 杀掉一个正在跑的 worker
- [ ] 表里留下 `running` 的残留
- [ ] 回收逻辑把它改回 `pending` 并被重新执行

## E. 三个错都踩过

- [ ] 看到过 `database is locked`
- [ ] 知道为什么 worker 不能写在 Express 里
- [ ] 知道 `payload` 必须 `JSON.stringify`

## F. 笔记

- [ ] 状态机我自己画了一遍（纸上或笔记里）
- [ ] 原子认领的 SQL 我抄了一遍并写了注释
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **队列不是中间件，是一张表加一个死循环。**
> **所有"高级队列"（Redis、RabbitMQ、Kafka）都是在解同一件事：怎么让多个进程不抢同一个任务。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | 没装或装错目录 | 在 `job-queue` 里 `npm install better-sqlite3` |
| `database is locked` | 没开 WAL，或多进程同时写 | `db.pragma("journal_mode = WAL")` + `busy_timeout` |
| `NODE_MODULE_VERSION` 不匹配 | Node 升级过 | `npm rebuild better-sqlite3` |
| worker 一直空转，投了任务也不领 | `next_run_at` 是未来时间 | 投递时 `next_run_at` 设成 `Date.now()` |
| 任务卡在 `running` 不动 | worker 被杀，或 `runTask` 里 Promise 永不 resolve | 加回收逻辑；检查有没有漏 `await` |
| 两个 worker 抢同一个任务 | 用了"先查再改" | 改成一条 `UPDATE ... WHERE id = (SELECT ...) RETURNING *` |
| `attempts` 一直是 0 | 认领时没写 `attempts + 1` | 检查 claim SQL |
| 表里中文变乱码 | 用了不当的编码写入 | `better-sqlite3` 默认 UTF-8，乱码通常是终端显示问题，用 `show.js` 确认 |
| 想清空重来 | 测试数据太多 | 停掉 worker，删掉 `jobs.db`、`jobs.db-wal`、`jobs.db-shm` 三个文件 |
