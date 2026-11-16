# 第 117 节课：把上周的轮询改成推送（跨进程推送）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的难点不是 SSE，是**一个架构问题**：
> **worker 在另一个进程里干活，它怎么把进度推给 API 进程里的连接？**

**建议用时**：130 分钟
**你需要先完成**：第 108、111、113—115 节（`summary-app` 能跑，SSE 会写）
**今天不装新东西**

---

# 第 0 步：一个必须想清楚的问题（20 分钟）

## 0.1 你的现状

```text
进程 A：api.js      持有 SSE 连接（1000 条）
进程 B：worker.js   正在干活，知道进度
```

**问题：worker 怎么通知 api？**

**它俩的内存是不通的。** worker 改一个变量，api 那边什么都看不到。

## 0.2 三种方案，一张表

| 方案 | 怎么做 | 单机够用吗 | 多机够用吗 |
|---|---|---|---|
| **内存变量** | 不行 | ❌ 跨进程看不见 | ❌ |
| **进程间通信（IPC / socket）** | 自己开个端口，worker 去调 api | ✅ 但要写协议 | ❌ 只能同机 |
| **数据库轮询（推荐）** | worker 写库，api 每秒查"有变化的" | ✅ 简单 | ✅ 天然支持 |
| **消息总线（Redis Pub/Sub）** | worker 发布，api 订阅 | ✅ | ✅ 但要装 Redis |

**选哪个？选数据库轮询。**

**理由：**

```text
① 你已经有了数据库，不用装任何东西
② 它天然支持多机（每台机器的 api 都能看到同一张表）
③ 它天然"幂等"（查到的就是当前真值，不是消息队列的"事件"）
④ 它的成本是常数，不随用户数涨 —— 这是今天的核心
```

## 0.3 今天的核心思想：把轮询下移一层

```text
上周：1000 个用户 × 每 1.5 秒查一次 = 每秒 666 次查询
今天：API 里 1 个看门狗 × 每 0.3 秒查一次 = 每秒 3.3 次查询
      然后把结果推给 1000 条连接
```

**查询次数从 666 掉到 3.3，降低 200 倍。而且用户数再多也不变。**

**这就是"推送"真正省下来的东西。** 不是延迟，是**成本曲线从线性变成常数**。

## 0.4 架构图（记住它）

```text
worker ──写──▶ jobs 表（有 updated_at）
                   │
                   │ 每 300ms 查一次"最近变过的"
                   ▼
                api.js 的看门狗 ──推送──▶ 1000 条 SSE 连接 ──▶ 浏览器
```

**数据库在这里不只是存储，还兼职当"消息通道"。** 这是单机 + 小规模场景下最划算的做法。

---

# 第 1 步：给表加 `updated_at`（15 分钟）

**进第 108 节建的 `job-queue`（或第 112 节的 `summary-app`），改 `db.js`。**

在 `jobs` 表里加一列：

```sql
updated_at INTEGER NOT NULL DEFAULT 0
```

**完整建表语句（如果你要重建）：**

```sql
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
  updated_at    INTEGER NOT NULL DEFAULT 0,   -- ← 新加的
  next_run_at   INTEGER NOT NULL,
  started_at    INTEGER,
  finished_at   INTEGER,
  worker_id     TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs (updated_at);
```

**如果表已经存在，加列要这样（SQLite 支持）：**

```sql
ALTER TABLE jobs ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
```

## 1.1 为什么必须有 `updated_at`

**光看 `progress` 不行。** 因为你要问的是"**哪些任务最近变过**"，这是时间维度的问题。

```sql
-- 错：这样查不到"变过的"，只能查到"进度大于某值"的
SELECT * FROM jobs WHERE progress > 50;

-- 对：
SELECT * FROM jobs WHERE updated_at >= ?;
```

## 1.2 `updated_at` 什么时候写

**每一条 UPDATE 都要写。** 记住这条规则：

```text
任何修改 jobs 的语句，都要带  updated_at = ?
```

**漏一处，那一处的变化就推不出去。** 这是今天最容易犯的错，而且症状很奇怪：**进度到 50% 就卡住不推了**（因为 75% 的那次 UPDATE 忘了写 `updated_at`）。

---

# 第 2 步：改 worker，每步都写 `updated_at`（20 分钟）

**打开 `worker-v2.js`（或 `summary-app/worker.js`），把四个 UPDATE 全改一遍。**

```javascript
// 进度：一定要写 updated_at
const setProgress = db.prepare(`
  UPDATE jobs SET progress = ?, step = ?, updated_at = ? WHERE id = ?
`);

// 完成
const markDone = db.prepare(`
  UPDATE jobs
  SET status = 'done', progress = 100, step = NULL, result = ?, finished_at = ?, updated_at = ?
  WHERE id = ?
`);

// 可重试失败
const requeue = db.prepare(`
  UPDATE jobs
  SET status = 'pending', last_error = ?, next_run_at = ?, started_at = NULL, worker_id = NULL, updated_at = ?
  WHERE id = ?
`);

// 死信
const markDead = db.prepare(`
  UPDATE jobs
  SET status = 'dead', last_error = ?, finished_at = ?, worker_id = NULL, updated_at = ?
  WHERE id = ?
`);
```

**调用处补上 `Date.now()`：**

```javascript
setProgress.run(i * 25, `处理第 ${i}/4 段`, Date.now(), job.id);
markDone.run(JSON.stringify(result), Date.now(), Date.now(), job.id);
```

**注意 `markDone` 有两个时间戳：`finished_at` 和 `updated_at`。** 别只改一个。

## 2.1 检查点

**投一个任务，让它跑完，然后查：**

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare('select id, progress, updated_at, finished_at from jobs order by updated_at desc limit 3').all()))"
```

**`updated_at` 必须比 `created_at` 大，而且等于最后一次更新的时间。**

**如果 `updated_at` 是 0，说明你的 UPDATE 没写这一列 —— 回头补。**

---

# 第 3 步：在 api.js 里加"看门狗"（30 分钟）

**新建 `api-v2.js`**（旧的留着对照）：

```javascript
// api-v2.js
// 推送版：一个看门狗查数据库，把变化推给对应的连接

import express from "express";
import { randomUUID } from "node:crypto";
import db from "./db.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ---------- 连接管理：按 jobId 分组 ----------
// Map<jobId, Set<res>>
const watchers = new Map();

function subscribe(jobId, client) {
  if (!watchers.has(jobId)) watchers.set(jobId, new Set());
  watchers.get(jobId).add(client);
}

function unsubscribe(jobId, client) {
  const set = watchers.get(jobId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) watchers.delete(jobId);
}

function pushTo(jobId, event, data) {
  const set = watchers.get(jobId);
  if (!set || set.size === 0) return 0;

  const lines = (typeof data === "string" ? data : JSON.stringify(data))
    .split("\n")
    .map((l) => `data: ${l}`)
    .join("\n");

  let n = 0;
  for (const client of set) {
    if (!client.alive) continue;
    try {
      client.res.write(`event: ${event}\n${lines}\n\n`);
      n += 1;
    } catch {
      client.alive = false;
    }
  }
  return n;
}

// ---------- 提交任务 ----------
const insertJob = db.prepare(`
  INSERT INTO jobs
    (id, type, payload, status, attempts, max_attempts, progress, created_at, updated_at, next_run_at)
  VALUES (?, ?, ?, 'pending', 0, 3, 0, ?, ?, ?)
`);

app.post("/api/jobs", (req, res) => {
  const text = req.body?.text;

  if (typeof text !== "string" || text.trim().length < 5) {
    res.status(400).json({ ok: false, error: "文本至少 5 个字" });
    return;
  }

  const id = randomUUID();
  const now = Date.now();

  insertJob.run(id, "summarize", JSON.stringify({ text }), now, now, now);

  res.status(202).json({ ok: true, jobId: id });
});

// ---------- 查一次真值（前端连上流之前先调这个） ----------
const selectJob = db.prepare(`
  SELECT id, status, progress, step, attempts, max_attempts, result, last_error,
         created_at, updated_at, started_at, finished_at
  FROM jobs WHERE id = ?
`);

app.get("/api/jobs/:id", (req, res) => {
  const job = selectJob.get(req.params.id);
  if (!job) {
    res.status(404).json({ ok: false, error: "任务不存在" });
    return;
  }
  res.json({ ok: true, job: { ...job, result: job.result ? JSON.parse(job.result) : null } });
});

// ---------- 流：连上先发快照，再收增量 ----------
app.get("/api/jobs/:id/stream", (req, res) => {
  const jobId = req.params.id;
  const job = selectJob.get(jobId);

  if (!job) {
    res.status(404).json({ ok: false, error: "任务不存在" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const client = { res, alive: true };
  subscribe(jobId, client);

  // ① 先发一次当前真值（只发给这条新连接，别打扰别人）
  const snapshot = JSON.stringify({
    status: job.status,
    progress: job.progress,
    step: job.step,
    attempts: job.attempts,
    result: job.result ? JSON.parse(job.result) : null,
    last_error: job.last_error,
  });
  const snapLines = snapshot.split("\n").map((l) => `data: ${l}`).join("\n");
  res.write(`event: snapshot\n${snapLines}\n\n`);

  // ② 心跳
  const hb = setInterval(() => {
    if (client.alive) res.write(": ping\n\n");
  }, 15_000);

  const cleanup = () => {
    if (!client.alive) return;
    client.alive = false;
    clearInterval(hb);
    unsubscribe(jobId, client);
    console.log(`断开 ${jobId.slice(0, 8)}，剩余 ${watchers.get(jobId)?.size ?? 0} 条`);
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
});

// ---------- 看门狗：今天的核心 ----------
let lastSeen = Date.now();

const changedJobs = db.prepare(`
  SELECT id, status, progress, step, attempts, last_error, result
  FROM jobs
  WHERE updated_at >= ? AND updated_at > 0
`);

setInterval(() => {
  const now = Date.now();
  const rows = changedJobs.all(lastSeen);
  lastSeen = now;

  for (const row of rows) {
    const jobId = row.id;
    if (!watchers.has(jobId)) continue;      // 没人在看，不用推

    pushTo(jobId, "update", {
      status: row.status,
      progress: row.progress,
      step: row.step,
      attempts: row.attempts,
      last_error: row.last_error,
      result: row.result ? safeParse(row.result) : null,
    });

    // 终态就把这个组的连接关掉，别让前端一直挂着
    if (row.status === "done" || row.status === "dead") {
      const set = watchers.get(jobId);
      if (set) {
        for (const client of set) {
          client.alive = false;
          try { client.res.end(); } catch {}
        }
        watchers.delete(jobId);
      }
    }
  }
}, 300);

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

app.listen(3003, () => console.log("api-v2：http://localhost:3003"));
```

## 3.1 五个关键点

**① 连接是按 `jobId` 分组的**

```javascript
// Map<jobId, Set<res>>
```

**不要用一个全局数组广播给所有人。** 那样用户 A 会收到用户 B 的任务进度 —— **这是数据泄露，不是小 bug。**

**② 连上先发 `snapshot`**

```text
流只保证"之后的变化"。断线重连、首次连接，都必须先拿一次真值。
```

**这就是第 115 节说的"数据库是真值，流是通知"。** 现在你把它写出来了。

**③ 看门狗每 300ms 查一次**

```javascript
SELECT ... FROM jobs WHERE updated_at >= ?
```

**一次查询覆盖所有任务，不管有多少人在看。** 这就是今天的成本革命。

**④ `if (!watchers.has(jobId)) continue`**

**没人在看的任务，查出来也不推。** 省掉序列化和遍历。

**⑤ 终态直接关连接**

```text
done / dead → end() 所有连接 → 前端 EventSource 看到流结束
```

**不关会怎样：** 前端一直挂着一条不再有数据的连接，**一千个完成的页面 = 一千条僵尸连接。**

## 3.2 一个必须知道的缺陷

```javascript
let lastSeen = Date.now();
```

**`lastSeen` 在内存里。** API 重启后它会重置成"现在"，**中间那几百毫秒的变化就漏了。**

**后果：** 用户看到进度停在 45%，直到下一次变化才跳。

**这不算致命**（因为有 `snapshot` 兜底，而且下一次变化会纠正），**但你要知道它存在。**

**更严谨的做法：** 把 `lastSeen` 存起来（比如一张 `meta` 表），重启后从上次的位置继续。

---

# 第 4 步：改前端（25 分钟）

**新建 `public/live.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>推送版进度</title>
  <style>
    body { font-family: system-ui, "Microsoft YaHei", sans-serif; max-width: 620px; margin: 40px auto; }
    textarea { width: 100%; height: 80px; }
    .bar { height: 14px; background: #eee; border-radius: 7px; overflow: hidden; margin-top: 16px; }
    .bar > div { height: 100%; width: 0; background: #2f7; transition: width .25s; }
    .muted { color: #888; font-size: 13px; }
    pre { background: #f6f6f6; padding: 10px; overflow: auto; }
  </style>
</head>
<body>
  <h1>推送版进度</h1>
  <textarea id="text">人工智能正在改变软件开发的方式，这是一段测试文本。</textarea>
  <button id="submit">提交</button>

  <p>状态：<b id="status">-</b>　<span id="conn" class="muted">未连接</span></p>
  <div class="bar"><div id="fill"></div></div>
  <p id="step" class="muted">-</p>
  <pre id="result" style="display:none"></pre>

  <script>
    let es = null;

    document.getElementById("submit").onclick = async () => {
      const text = document.getElementById("text").value;

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error);

      localStorage.setItem("lastJobId", data.jobId);
      open(data.jobId);
    };

    function open(jobId) {
      if (es) es.close();

      document.getElementById("status").textContent = "-";
      document.getElementById("result").style.display = "none";

      es = new EventSource(`/api/jobs/${jobId}/stream`);

      es.addEventListener("snapshot", (e) => {
        document.getElementById("conn").textContent = "已连接（快照）";
        render(JSON.parse(e.data));
      });

      es.addEventListener("update", (e) => {
        render(JSON.parse(e.data));
      });

      es.onerror = () => {
        document.getElementById("conn").textContent = "断线，重连中…";
      };

      es.onopen = () => {
        document.getElementById("conn").textContent = "已连接";
      };
    }

    function render(job) {
      const map = { pending: "排队中", running: "处理中", done: "已完成", failed: "失败", dead: "已放弃" };
      document.getElementById("status").textContent = map[job.status] ?? job.status;
      document.getElementById("fill").style.width = job.progress + "%";
      document.getElementById("step").textContent = job.step ?? "";

      if (job.status === "done") {
        // 服务端会关流，这里也主动关，别留僵尸连接
        if (es) { es.close(); es = null; }
        document.getElementById("conn").textContent = "已结束";

        const box = document.getElementById("result");
        box.style.display = "block";
        box.textContent = JSON.stringify(job.result, null, 2);
      }

      if (job.status === "dead") {
        if (es) { es.close(); es = null; }
        document.getElementById("conn").textContent = "已放弃：" + (job.last_error ?? "");
      }
    }

    // 刷新页面后自动接上
    const last = localStorage.getItem("lastJobId");
    if (last) open(last);
  </script>
</body>
</html>
```

## 4.1 验证

**起两个终端：**

```bash
# 终端 A
node api-v2.js

# 终端 B
node worker-v2.js      # 注意：要用改了 updated_at 的那个
```

**浏览器打开 `http://localhost:3003/live.html`，点提交。**

**你应该看到：**

```text
进度条 300ms 左右一跳（比上周的 1.5 秒快多了）
状态"处理中" → "已完成"
完成后连接显示"已结束"
```

**打开 F12 → Network：**

```text
/api/jobs/xxx/stream   Status: pending   Type: eventsource
没有 /api/jobs/xxx 的每秒轮询了（那是上周）
```

## 4.2 验证成本降低了（今天最重要的一步）

**上周的做法：每个页面每 1.5 秒一个请求。**

**今天：所有页面共用一条看门狗。**

**怎么证明：**

```text
① 打开 5 个标签页，都提交任务
② 看服务端终端：看门狗没有日志（它只在有变化时推）
③ 打开 F12 的 Network：每个页面只有 1 个 stream 请求，没有周期性的 /api/jobs/:id
```

**如果你还看到每秒一个请求，说明你打开的是上周的 `index.html`。**

---

# 第 5 步：故意犯五个错（20 分钟）

## 错误 1：广播给所有人

把 `pushTo(jobId, ...)` 改成"遍历所有 watchers 里的所有 client"：

```javascript
for (const set of watchers.values()) {
  for (const c of set) c.res.write(...);
}
```

**现象：** 两个浏览器各提交一个任务，**两边都能看到对方的进度。**

**这就是数据泄露。** 在多租户场景（第 24 周）里，这是要赔钱的事故。

## 错误 2：忘了写 `updated_at`

把 `setProgress` 的 `updated_at = ?` 删掉。

**现象：** 进度到 25% 之后再不动了，**但数据库里在涨。**

**因为看门狗只查"`updated_at` 变了"的行。** 这个 bug 极难发现——数据库看起来是对的。

**这就是今天最容易犯、最难查的错。**

## 错误 3：看门狗间隔设成 5000ms

改成 `5000`。

**现象：** 进度 5 秒跳一次，比上周的轮询还卡。**用户会以为你的"实时"是假的。**

**300—500ms 是合理区间。** 更短就是浪费数据库。

## 错误 4：不关终态连接

把 `if (row.status === "done" || row.status === "dead")` 那段删掉。

**现象：** 任务完成后连接还在（`pending` 状态一直挂着）。**开十个页面，十条僵尸连接。**

**怎么验证：** 服务端打 `watchers.get(jobId)?.size`，完成后应该是空。

## 错误 5：忘了 `snapshot`

把发 `snapshot` 的那三行（`const snapshot = ...` 到 `res.write(\`event: snapshot...\`)`）删掉。

**现象：** 提交新任务时，页面上的进度是空的，**要等到"下一次变化"才出现第一个数字。**

**更严重：** 刷新页面后，页面一片空白，**直到 worker 下一次上报进度。** 如果任务已经完成了，你永远看不到结果。

---

# 第 6 步：写学习笔记（10 分钟）

---

# 第 7 步：课后练习

## 练习一：给看门狗加日志，量出真实查询次数（15 分钟）

在看门狗里加一个计数器，每分钟打印一次：

```javascript
let queries = 0;
// 每次 changedJobs.all 之后 queries += 1
setInterval(() => {
  console.log(`看门狗查询 ${queries} 次/分钟，在线连接 ${[...watchers.values()].reduce((a, s) => a + s.size, 0)} 条`);
  queries = 0;
}, 60_000);
```

**然后对比：打开 1 个页面 vs 打开 10 个页面，查询次数有变化吗？**

**答案应该是：没有变化。** 这就是今天的全部价值。

## 练习二：把 `lastSeen` 存进数据库（20 分钟）

在 `db.js` 加一张表：

```sql
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
```

启动时读出来，每轮结束后写回去。**这样 API 重启也不会漏那几百毫秒。**

## 练习三：算一下你的上限（15 分钟）

假设：

```text
看门狗每 300ms 查一次
每次查询平均返回 5 行
每个任务平均 6 次状态变化
每个用户开 1 条连接看 1 个任务
```

**问题：**

1. 看门狗的 QPS 是多少？
2. 如果换成上周的轮询，1000 个用户的 QPS 是多少？
3. 一台 2 核 4G 的服务器，能撑多少条 SSE 连接？（提示：每条连接约几十 KB 内存）

---

# 第 8 步：最终验收

## A. 表改对了

- [ ] `jobs` 有 `updated_at`
- [ ] 有 `idx_jobs_updated` 索引
- [ ] 每一条 UPDATE 都写了 `updated_at`

## B. 推送成立

- [ ] 提交后进度 300ms 左右一跳
- [ ] Network 里只有一条 `stream`，没有轮询请求
- [ ] 完成后连接自动关闭

## C. 隔离成立

- [ ] 两个浏览器各看自己的任务，互不干扰
- [ ] 我试过错误 1，看到过串台

## D. 成本降了

- [ ] 1 个页面和 10 个页面，看门狗查询次数一样
- [ ] 我知道降了多少倍（大约 200 倍）

## E. 五个错都踩过

- [ ] 见过串台
- [ ] 见过忘写 `updated_at` 导致"进度卡住"
- [ ] 见过 5 秒一跳的假实时
- [ ] 见过僵尸连接
- [ ] 见过没 `snapshot` 导致的空白页

## F. 概念

- [ ] 我能说清"为什么不能用内存变量跨进程"
- [ ] 我知道看门狗和 Redis Pub/Sub 的关系（同一个位置，换实现）
- [ ] 我知道这方案在"多机部署"下依然成立

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 三种跨进程方案的对比我写下来了
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **跨进程推送不是"把一个变量传给另一个进程"，是"让两个进程都去看同一个地方"。**
> **数据库就是那个地方。看门狗把"1000 个用户各自来问"变成"我替他们问一次"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 进度卡住不推 | 某条 UPDATE 忘了写 `updated_at` | 全表搜 `UPDATE jobs`，逐个检查 |
| 页面一片空白 | 没有 `snapshot` | 连上先推真值 |
| 串台（看到别人的任务） | 广播没按 jobId 分组 | `Map<jobId, Set>` |
| 完成后连接不关 | 终态没 `end()` | `done`/`dead` 时清理 |
| 推送比轮询还卡 | 看门狗间隔太大 | 300—500ms |
| API 重启后漏一段 | `lastSeen` 在内存 | 存进 `meta` 表 |
| `watchers` 越来越大 | `unsubscribe` 没生效 | 三个 `close` 事件都监听 |
| 多机部署只有一台能推 | 每台机器的 `watchers` 各管各的 | 每台都跑看门狗（正确），或上 Redis |
