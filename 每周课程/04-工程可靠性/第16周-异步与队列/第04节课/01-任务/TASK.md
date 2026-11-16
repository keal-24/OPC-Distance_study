# 第 109 节课：重试、退避、死信、幂等

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你的 worker 只要失败一次，任务就永久停在 `failed`，用户永远等不到结果。
> 今天让它**自己重试、自己退避、自己放弃**，并且保证**重跑不会多花钱**。

**建议用时**：130 分钟
**你需要先完成**：第 108 节课（`job-queue` 能跑，两个 worker 不抢任务）
**今天不装新东西**

---

# 第 0 步：先分清"该重试"和"不该重试"（15 分钟）

## 0.1 失败有两大类

| 类型 | 例子 | 该重试吗 |
|---|---|---|
| **瞬时错误** | 网络抖动、模型接口 502/503、限流 429、数据库锁超时 | **该重试** |
| **永久错误** | 输入不合法、余额不足、文件不存在、参数错了 | **不该重试** |

**不分这两类，你会干两件蠢事：**

```text
对瞬时错误不重试 → 用户白等一场
对永久错误重试三次 → 白烧三次钱，最后还是失败，还拖慢队列
```

## 0.2 怎么在代码里分

```javascript
// 约定：抛出的错误带 retryable 标记
class TaskError extends Error {
  constructor(message, retryable = true) {
    super(message);
    this.retryable = retryable;
  }
}

// 用法
throw new TaskError("模型返回 502", true);      // 值得再试
throw new TaskError("文本太短，不足 10 字", false); // 再试一万次也一样
```

**没有标记的错误，默认当"瞬时"处理**（宁可多试一次，也别让用户白等）。

## 0.3 今天的五个交付

```text
① 失败 → 回到 pending，next_run_at 往后推（退避）
② 超过 max_attempts → dead（死信）
③ 永久错误 → 立刻 dead，不浪费重试
④ 指数退避 + 随机抖动（防惊群）
⑤ 幂等：同一个任务跑两遍，副作用只发生一次
```

---

# 第 1 步：改造失败处理（25 分钟）

## 1.1 现在的问题

上节课的 `markFailed` 是这样的：

```javascript
const markFailed = db.prepare(`
  UPDATE jobs
  SET status = 'failed', last_error = ?, finished_at = ?
  WHERE id = ?
`);
```

**问题：** 一旦失败就永久停止了。**用户只能重新提交，而他还不知道要重提。**

## 1.2 改成"退避重试"

**新建 `worker-v2.js`**（旧的留着对照）：

```javascript
// worker-v2.js
// 相比 v1 增加了：退避重试、死信、永久错误判定

import db from "./db.js";

const workerId = `w-${process.pid}-${Math.random().toString(16).slice(2, 6)}`;
let shuttingDown = false;

// ---------- 退避时间表 ----------
// 第 1 次失败后等 5 秒，第 2 次等 30 秒，第 3 次等 2 分钟
function backoffMs(attempts) {
  const table = [0, 5_000, 30_000, 120_000];
  const base = table[Math.min(attempts, table.length - 1)];

  // 抖动：在 ±20% 范围内随机，防止 100 个任务同一秒一起重试
  const jitter = base * 0.2 * (Math.random() * 2 - 1);

  return Math.max(0, Math.round(base + jitter));
}

// ---------- 认领 ----------
const claimJob = db.prepare(`
  UPDATE jobs
  SET status = 'running', attempts = attempts + 1, started_at = ?, worker_id = ?
  WHERE id = (
    SELECT id FROM jobs WHERE status = 'pending' AND next_run_at <= ?
    ORDER BY next_run_at ASC, created_at ASC LIMIT 1
  )
  RETURNING *
`);

function claim() {
  const now = Date.now();
  return claimJob.get(now, workerId, now);
}

// ---------- 成功 ----------
const markDone = db.prepare(`
  UPDATE jobs
  SET status = 'done', progress = 100, step = NULL, result = ?, finished_at = ?, worker_id = NULL
  WHERE id = ?
`);

// ---------- 可重试的失败：退回 pending，推迟下次时间 ----------
const requeue = db.prepare(`
  UPDATE jobs
  SET status = 'pending', last_error = ?, next_run_at = ?, started_at = NULL, worker_id = NULL
  WHERE id = ?
`);

// ---------- 彻底放弃：进死信 ----------
const markDead = db.prepare(`
  UPDATE jobs
  SET status = 'dead', last_error = ?, finished_at = ?, worker_id = NULL
  WHERE id = ?
`);

const setProgress = db.prepare(`UPDATE jobs SET progress = ?, step = ? WHERE id = ?`);

// ---------- 业务 ----------
class TaskError extends Error {
  constructor(message, retryable = true) {
    super(message);
    this.retryable = retryable;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTask(job) {
  const payload = JSON.parse(job.payload);
  const text = String(payload.text ?? "");

  // 输入校验：永久错误，重试没意义
  if (text.length < 5) {
    throw new TaskError("文本太短，至少 5 个字", false);
  }

  // 演示用：让前两次尝试故意失败（真实场景里这是网络抖动）
  if (job.attempts <= 2 && process.env.FLAKY === "1") {
    throw new TaskError(`模拟瞬时故障（第 ${job.attempts} 次尝试）`, true);
  }

  for (let i = 1; i <= 3; i++) {
    await sleep(1500);
    setProgress.run(Math.round((i / 3) * 100), `处理第 ${i}/3 段`, job.id);
    console.log(`[${workerId}] ${job.id.slice(0, 8)} 进度 ${Math.round((i / 3) * 100)}%`);
  }

  return { summary: `对「${text.slice(0, 12)}…」的总结` };
}

// ---------- 主循环 ----------
async function main() {
  console.log(`[${workerId}] worker-v2 启动`);

  const recycle = db.prepare(`
    UPDATE jobs
    SET status = 'pending', started_at = NULL, worker_id = NULL, next_run_at = ?,
        last_error = '任务超时，已被回收'
    WHERE status = 'running' AND started_at < ?
  `);

  while (!shuttingDown) {
    // 每轮先回收卡死的
    recycle.run(Date.now(), Date.now() - 5 * 60 * 1000);

    const job = claim();
    if (!job) {
      await sleep(1000);
      continue;
    }

    console.log(`[${workerId}] 领到 ${job.id.slice(0, 8)}，第 ${job.attempts}/${job.max_attempts} 次`);

    try {
      const result = await runTask(job);
      markDone.run(JSON.stringify(result), Date.now(), job.id);
      console.log(`[${workerId}] ${job.id.slice(0, 8)} 完成`);
    } catch (err) {
      const message = String(err.message);

      // 永久错误：直接进死信
      if (err.retryable === false) {
        markDead.run(`${message}（永久错误，不再重试）`, Date.now(), job.id);
        console.log(`[${workerId}] ${job.id.slice(0, 8)} 永久失败 → dead`);
        continue;
      }

      // 还能重试吗
      if (job.attempts < job.max_attempts) {
        const delay = backoffMs(job.attempts);
        const next = Date.now() + delay;
        requeue.run(message, next, job.id);
        console.log(
          `[${workerId}] ${job.id.slice(0, 8)} 失败(${message})，${Math.round(delay / 1000)} 秒后重试`
        );
      } else {
        markDead.run(`${message}（已尝试 ${job.attempts} 次）`, Date.now(), job.id);
        console.log(`[${workerId}] ${job.id.slice(0, 8)} 超过重试上限 → dead`);
      }
    }
  }

  console.log(`[${workerId}] 已停止`);
}

process.on("SIGINT", () => {
  console.log(`\n[${workerId}] 收到停止信号，干完手上这个就退出`);
  shuttingDown = true;
});

main();
```

**五个改动点，逐条对照 v1：**

| 改动 | v1 | v2 |
|---|---|---|
| 失败后 | `status='failed'` 永久停 | 退回 `pending`，`next_run_at` 往后推 |
| 重试上限 | 没有 | 超过 `max_attempts` → `dead` |
| 永久错误 | 也重试 | 立刻 `dead` |
| 退避 | 无 | 5 秒 / 30 秒 / 2 分钟 + 抖动 |
| 卡死回收 | 有 | 有（保留） |

## 1.3 验证重试

**终端 A：**

```bash
# Windows cmd
set FLAKY=1
node worker-v2.js

# Git Bash
FLAKY=1 node worker-v2.js
```

**终端 B：**

```bash
node add-job.js "这是一段足够长的测试文本"
```

**你应该在终端 A 看到：**

```text
[w-...] 领到 8f3a1c2e，第 1/3 次
[w-...] 8f3a1c2e 失败(模拟瞬时故障（第 1 次尝试）)，5 秒后重试
[w-...] 领到 8f3a1c2e，第 2/3 次
[w-...] 8f3a1c2e 失败(模拟瞬时故障（第 2 次尝试）)，30 秒后重试
[w-...] 领到 8f3a1c2e，第 3/3 次
[w-...] 8f3a1c2e 进度 33% / 66% / 100%
[w-...] 8f3a1c2e 完成
```

**注意三点：**

1. **同一个 id 被领了三次**，`attempts` 从 1 涨到 3；
2. 每次重试之间**隔了 5 秒、30 秒**；
3. **第 3 次成功**，最终状态是 `done`，不是 `dead`。

## 1.4 验证死信

**把 `max_attempts` 改成 2**（投递时指定），或者让 `runTask` 永远抛错。

最简单的办法：投一个**文本太短**的任务。

```bash
node add-job.js "短"
```

**你应该看到：**

```text
[w-...] 领到 xxx，第 1/2 次
[w-...] xxx 永久失败 → dead
```

**只跑了一次就进 `dead`。** 因为这是永久错误，重试没有意义。

**查表：**

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare('select id, status, attempts, last_error from jobs').all()))"
```

**你应该看到 `dead / 1 / 文本太短，至少 5 个字（永久错误，不再重试）`。**

---

# 第 2 步：退避为什么要"抖一下"（20 分钟）

## 2.1 不抖的后果：惊群

假设你的模型接口在 12:00:00 崩了 10 秒，**同时有 500 个任务失败**。

```text
固定 30 秒退避 → 500 个任务全在 12:00:30 一起重试
→ 接口刚恢复，又被 500 个请求打崩
→ 又全失败，又全等 30 秒
→ 真正的雪崩
```

**这叫"惊群"（thundering herd）。** 你的重试机制把服务反复打死。

## 2.2 抖动的做法

```javascript
const jitter = base * 0.2 * (Math.random() * 2 - 1);   // ±20%
```

**500 个任务的 30 秒会散成 24—36 秒之间的随机值**，压力被摊平。

## 2.3 验证抖动

改用 `node -e` 直接看数字：

```bash
node -e "
function backoffMs(attempts) {
  const table = [0, 5000, 30000, 120000];
  const base = table[Math.min(attempts, table.length - 1)];
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}
for (let i = 0; i < 10; i++) console.log(backoffMs(2));
"
```

**你应该看到 10 个都在 24000—36000 之间、但互不相同的数字。**

**如果是 10 个一样的 `30000`，说明你没加抖动。**

## 2.4 退避表怎么定

| 尝试 | 等待 | 累计等待 |
|---|---|---|
| 第 1 次失败 | 5 秒 | 5 秒 |
| 第 2 次失败 | 30 秒 | 35 秒 |
| 第 3 次失败 | 2 分钟 | 约 2.6 分钟 |
| 第 4 次失败 | 10 分钟 | 约 12.6 分钟 |

**经验规则：**

```text
总重试时长不要超过"用户还能接受的等待"。
同步场景（用户在线等）：最多 1 分钟，3 次。
后台场景（发邮件、生成报告）：可以到几小时，5—8 次。
```

**你现在的任务是"用户刷新页面会来看"，所以 3 次 / 约 2.6 分钟是合理的。**

---

# 第 3 步：幂等——今天最值钱的一段（35 分钟）

## 3.1 先看一个必然会发生的场景

```text
12:00:00  worker 领到任务 A（attempts=1）
12:00:08  活干完了，钱已经花了（模型调用成功）
12:00:08  ⚡ 进程被 kill（或断电、或 OOM）
12:00:08  表里状态还是 running —— 因为 markDone 没执行到
12:05:10  回收逻辑把 A 改回 pending
12:05:11  另一个 worker 领到 A（attempts=2），又跑一遍
```

**结果：用户收到两条一样的结果，你付了两次钱。**

**这不是意外，这是必然。** 任何"先干活、后改状态"的系统，都会遇到这个窗口。

## 3.2 幂等的定义

```text
同一个任务执行一次和执行多次，产生的"外部副作用"完全一样。
```

**注意是"外部副作用"** —— 数据库里多一次日志没关系，**多发一条短信、多扣一次钱就有关系。**

## 3.3 三种做法，从弱到强

### 做法一：先查后写（最弱，但有总比没有）

```javascript
// 干活前先问：这件事是不是已经做过了？
const existed = db.prepare("SELECT 1 FROM sends WHERE job_id = ?").get(job.id);
if (existed) {
  return { skipped: true };   // 已经发过了，直接返回成功
}
```

**问题：** "查"和"写"之间还有一个窗口，两个进程可能同时查到"没有"。

### 做法二：唯一索引（推荐）

**在数据库层面堵死。** 建一张"副作用记录表"，给幂等键加 `UNIQUE`：

```sql
CREATE TABLE IF NOT EXISTS sends (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT NOT NULL,
  channel    TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (job_id, channel)      -- ← 同一个任务同一个渠道，只允许一条
);
```

**写的时候用 `INSERT OR IGNORE`：**

```javascript
const insertSend = db.prepare(`
  INSERT OR IGNORE INTO sends (job_id, channel, content, created_at)
  VALUES (?, ?, ?, ?)
`);

const info = insertSend.run(job.id, "email", content, Date.now());

if (info.changes === 0) {
  console.log("已经发过了，跳过");
  return { skipped: true };
}

// changes === 1 才真的发
await sendEmail(content);
```

**为什么这个可靠：** 唯一索引是**数据库保证**的，两个进程同时 `INSERT`，只有一个 `changes === 1`，另一个必然是 0。

**这就是"用数据库的原子性解决分布式问题"。** 你不需要锁，也不需要 Redis。

### 做法三：幂等键（最强，用于调外部接口）

调第三方接口时（支付、短信、模型），**把 `job.id` 当作幂等键传过去**：

```javascript
await fetch("https://api.example.com/pay", {
  method: "POST",
  headers: { "Idempotency-Key": job.id },   // 对方按这个键去重
  body: JSON.stringify({ amount: 100 }),
});
```

**支不支持取决于对方。** 微信支付、Stripe、支付宝都支持；很多小厂的接口不支持，那你只能靠做法二在自己这边兜。

## 3.4 动手做一遍

**① 在 `db.js` 里加一张表**（放在 `db.exec` 那段里，和 `jobs` 一起）：

```sql
CREATE TABLE IF NOT EXISTS sends (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT NOT NULL,
  channel    TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (job_id, channel)
);
```

**② 在 `worker-v2.js` 里把"发送"改成幂等**

在 `runTask` 的末尾加：

```javascript
const insertSend = db.prepare(`
  INSERT OR IGNORE INTO sends (job_id, channel, content, created_at)
  VALUES (?, ?, ?, ?)
`);

const info = insertSend.run(job.id, "email", `总结：${text.slice(0, 12)}…`, Date.now());

if (info.changes === 0) {
  console.log(`[${workerId}] ${job.id.slice(0, 8)} 副作用已存在，跳过重复发送`);
} else {
  // 真实项目里这里才是真正的发送
  console.log(`[${workerId}] ${job.id.slice(0, 8)} 已记录一次发送`);
}
```

**③ 人为制造"重跑"**

手工把已经 `done` 的任务改回 `pending`：

```bash
node -e "import('./db.js').then(({default: db}) => { const r = db.prepare(\"UPDATE jobs SET status='pending', next_run_at=? WHERE status='done' LIMIT 1\").run(Date.now()); console.log('改回', r.changes, '条'); })"
```

**④ 看 worker 日志**

**你应该看到：**

```text
[w-...] 领到 8f3a1c2e，第 4/3 次
[w-...] 8f3a1c2e 副作用已存在，跳过重复发送
[w-...] 8f3a1c2e 完成
```

**任务重跑了一遍，但发送只发生了一次。**

**⑤ 查 `sends` 表验证：**

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare('select job_id, channel, count(*) as n from sends group by job_id, channel').all()))"
```

**每个 `job_id` 只有一行，`n = 1`。这就是幂等。**

---

# 第 4 步：故意犯四个错（25 分钟）

## 错误 1：失败后立刻重试，不退避

把 `backoffMs` 改成永远 `return 0`，让任务一直失败（`FLAKY=1` 且把 `job.attempts <= 2` 改成 `<= 99`）。

**你应该看到日志疯狂刷屏：**

```text
领到 xxx，第 1 次
失败，0 秒后重试
领到 xxx，第 2 次
失败，0 秒后重试
……
```

**CPU 跑满，数据库被写爆，别的任务全被饿死。**

## 错误 2：没有 `max_attempts`

把 `job.attempts < job.max_attempts` 改成 `true`。

**结果：一个坏任务永远在队列里循环。** 你的队列从此再也干不完活。

**记住：任何重试都必须有上限。**

## 错误 3：以为重试能解决所有问题

投一个文本只有 1 个字的任务，**去掉永久错误判定**（`retryable: false` 改成 `true`）。

**你会看到它重试 3 次，每次都要花钱，最后还是 `dead`。**

**纯粹浪费。** 分类错了，重试机制就是在烧钱。

## 错误 4：不用唯一索引，用"先查后写"

把 `INSERT OR IGNORE` 改成：

```javascript
const existed = db.prepare("SELECT 1 FROM sends WHERE job_id = ? AND channel = ?").get(job.id, "email");
if (!existed) {
  db.prepare("INSERT INTO sends (job_id, channel, content, created_at) VALUES (?,?,?,?)").run(job.id, "email", content, Date.now());
  // 这里如果真的发邮件，就有重复风险
}
```

**在查和写之间加一行 `while (Date.now() < Date.now() + 200) {}`**，两个 worker 同时跑同一个任务。

**你会发现 `sends` 里出现了两条。**（因为去掉了 `UNIQUE` 才会出现；如果唯一索引还在，会报 `UNIQUE constraint failed`。）

**这就是"先查后写"的窗口。** 记住这个 200 毫秒。

---

# 第 5 步：写学习笔记（10 分钟）

**幂等那一段必须用自己的话写一遍。** 这是这一周唯一能决定你能不能收钱的知识点。

---

# 第 6 步：课后练习

## 练习一：给死信一个"复活"按钮（15 分钟）

写 `retry-dead.js`：

```bash
node retry-dead.js           # 把所有 dead 任务改回 pending
node retry-dead.js <jobId>   # 只复活一个
```

**为什么要做：** 死信队列的意义不是"永远放弃"，是"**等人来看**"。你来看了，就要能一键复活。

## 练习二：算清楚"最多花多少钱"（10 分钟）

假设每次模型调用 0.03 元，`max_attempts = 3`，一天 300 个任务，其中 5% 会失败重试。

**问题：**

1. 一天最坏情况花多少？
2. 如果加上幂等，重试导致的重复副作用能有几次？
3. 如果不加 `max_attempts`，上限是多少？

## 练习三：判断下面四个错误该不该重试（10 分钟）

```text
A. 模型接口返回 503
B. 模型接口返回 400（参数错误）
C. 用户余额不足
D. 数据库锁超时（SQLITE_BUSY）
E. 目标文件不存在（用户删了）
```

**答案：**

```text
A 重试  B 不重试  C 不重试  D 重试  E 不重试
```

**规则：能不能靠"再试一次"改变结果？能就重试。**

---

# 第 7 步：最终验收

## A. 重试能跑通

- [ ] 用 `FLAKY=1` 跑，一个任务被领了 3 次
- [ ] 第 1 次失败后等 5 秒、第 2 次失败后等 30 秒
- [ ] 第 3 次成功，最终 `status = done`
- [ ] `attempts = 3`

## B. 死信能触发

- [ ] 一直失败的任务最终变成 `dead`
- [ ] `dead` 的任务不再被任何 worker 领取
- [ ] `last_error` 里能看到失败原因

## C. 永久错误不浪费重试

- [ ] 文本太短的任务一次就 `dead`
- [ ] `attempts = 1`，不是 3

## D. 退避有抖动

- [ ] 连跑 10 次 `backoffMs(2)`，数字不一样
- [ ] 都在 ±20% 范围内

## E. 幂等成立

- [ ] `sends` 表有 `UNIQUE (job_id, channel)`
- [ ] 手工把任务改回 `pending` 重跑，`sends` 里还是一条
- [ ] 日志里出现"副作用已存在，跳过重复发送"

## F. 四个错都踩过

- [ ] 见过不退避导致的刷屏
- [ ] 知道没有上限会怎样
- [ ] 知道对永久错误重试是浪费钱
- [ ] 见过"先查后写"的窗口

## G. 笔记

- [ ] 幂等用自己的话写了一遍
- [ ] 退避表我自己定了一版
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **重试的前提是幂等。**
> **不幂等还重试，等于把"一次错误"变成"三次收费"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 任务一直 `pending`，不重试 | `next_run_at` 推到了未来，还没到点 | 这是对的，等它到点。想立刻看效果就把退避改成 1 秒 |
| 重试次数超过 `max_attempts` | 判定条件写错（用了 `<=`） | 改成 `job.attempts < job.max_attempts` |
| `UNIQUE constraint failed` | 用了普通 `INSERT` 而不是 `INSERT OR IGNORE` | 改 `INSERT OR IGNORE`，或捕获后当成功 |
| `sends` 里出现重复 | 没有唯一索引，或索引字段不对 | `UNIQUE (job_id, channel)` 必须存在 |
| 重试日志疯狂刷屏 | 退避返回 0 | 检查 `backoffMs` 的返回值 |
| `dead` 任务越来越多 | 永久错误没分类，或真实故障 | 先分类，再写 `retry-dead.js` |
| `FLAKY=1` 在 PowerShell 里不生效 | 语法不对 | PowerShell 用 `$env:FLAKY=1; node worker-v2.js` |
| 回收后又重跑，多花了钱 | 没有幂等 | 回到第 3 步，加唯一索引 |
