# 第 111 节课：进度与状态查询

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 后台在跑，用户在盯着一个转圈的页面 —— **这和"同步等 20 秒"没什么区别**。
> 今天把状态查出来，让用户看见"正在做第 2 步，共 4 步"。

**建议用时**：120 分钟
**你需要先完成**：第 108、109 节（`job-queue` 能跑，有重试和幂等）
**今天要装**：`express`

---

# 第 0 步：用户到底想看什么（10 分钟）

## 0.1 四个问题，一个界面要回答

```text
① 开始了吗？        → status: pending / running
② 到哪一步了？       → step + progress
③ 还要多久？         → 用已用时间和进度估
④ 失败了怎么办？     → last_error + attempts，以及"要不要重试"
```

**少回答任何一个，用户就会打电话给你。**

## 0.2 一个反直觉的事实

**用户不怕等，怕的是不知道在等什么。**

```text
一个转圈的图标等 30 秒 → 用户在第 8 秒就刷新了
一个写着"正在解析第 3/20 页"的进度条等 30 秒 → 用户会等下去
```

**所以进度的价值不是"更快"，是"让等待变得可以忍受"。**

## 0.3 今天要做的三件事

```text
① 后端：一个只返回必要字段的查询接口
② 前端：轮询，会自动停、会算剩余时间、刷新页面不丢
③ 算清轮询的成本，知道什么时候该换方案（下周的 SSE）
```

---

# 第 1 步：给 `job-queue` 加 API（25 分钟）

## 1.1 装 express

进第 108 节建的 `job-queue` 目录：

```bash
npm install express
```

## 1.2 新建 `api.js`

```javascript
// api.js
// 只干两件事：收任务、查任务

import express from "express";
import { randomUUID } from "node:crypto";
import db from "./db.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));      // 前端页面放 public/ 里

// ---------- 提交任务 ----------
const insertJob = db.prepare(`
  INSERT INTO jobs
    (id, type, payload, status, attempts, max_attempts, progress, created_at, next_run_at)
  VALUES (?, ?, ?, 'pending', 0, 3, 0, ?, ?)
`);

app.post("/api/jobs", (req, res) => {
  const text = req.body?.text;

  if (typeof text !== "string" || text.trim().length < 5) {
    res.status(400).json({ ok: false, error: "文本至少 5 个字" });
    return;
  }

  const id = randomUUID();
  const now = Date.now();

  insertJob.run(id, "summarize", JSON.stringify({ text }), now, now);

  res.status(202).json({ ok: true, jobId: id });
});

// ---------- 查任务 ----------
// 只选前端需要的列。不要 SELECT *
const selectJob = db.prepare(`
  SELECT id, status, progress, step, attempts, max_attempts,
         result, last_error, created_at, started_at, finished_at
  FROM jobs WHERE id = ?
`);

app.get("/api/jobs/:id", (req, res) => {
  const job = selectJob.get(req.params.id);

  if (!job) {
    res.status(404).json({ ok: false, error: "任务不存在" });
    return;
  }

  // 算一个"已用秒数"，前端算剩余时间要用
  const end = job.finished_at ?? Date.now();
  const elapsedSec = job.started_at ? Math.round((end - job.started_at) / 1000) : 0;

  res.json({
    ok: true,
    job: {
      ...job,
      result: job.result ? JSON.parse(job.result) : null,
      elapsedSec,
      canRetry: job.status === "pending" || job.status === "running",
    },
  });
});

app.listen(3002, () => {
  console.log("API 已启动：http://localhost:3002");
});
```

**四个细节，一个都别省：**

| 细节 | 为什么 |
|---|---|
| `SELECT` 只选需要的列 | 别把 `payload` 几十 KB 的文本每次都吐给前端 |
| `result` 要 `JSON.parse` | 存的是字符串，不 parse 前端拿到 `"[object Object]"` 之类 |
| 返回 `elapsedSec` | **前端自己算会把时间算错**（客户端时钟可能不准），让服务器算 |
| 返回 `canRetry` | 前端不要自己判断状态，**判断逻辑只写一份** |

## 1.3 启动

```bash
node api.js
```

**先测一下空表：**

```bash
curl http://localhost:3002/api/jobs/abc
```

**应该返回 404 + `任务不存在`。**

---

# 第 2 步：写前端轮询（35 分钟）

## 2.1 建页面

新建 `public/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>异步任务演示</title>
  <style>
    body { font-family: system-ui, "Microsoft YaHei", sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #222; }
    textarea { width: 100%; height: 90px; padding: 8px; box-sizing: border-box; }
    button { padding: 8px 16px; margin-top: 8px; cursor: pointer; }
    #panel { margin-top: 24px; display: none; }
    .bar { height: 14px; background: #eee; border-radius: 7px; overflow: hidden; }
    .bar > div { height: 100%; width: 0; background: #2f7; transition: width .3s; }
    .muted { color: #888; font-size: 13px; }
    .err { color: #c00; }
    pre { background: #f6f6f6; padding: 10px; overflow: auto; }
  </style>
</head>
<body>
  <h1>异步任务演示</h1>

  <textarea id="text" placeholder="粘贴一段文本（至少 5 个字）">人工智能正在改变软件开发的方式，这是一段用于测试的文本。</textarea>
  <button id="submit">提交</button>

  <div id="panel">
    <p>状态：<b id="status">-</b></p>
    <div class="bar"><div id="fill"></div></div>
    <p id="step" class="muted">-</p>
    <p id="meta" class="muted"></p>
    <pre id="result" style="display:none"></pre>
    <p id="error" class="err"></p>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);

    let jobId = localStorage.getItem("lastJobId");   // 刷新页面还记得
    let timer = null;
    let polls = 0;

    $("submit").addEventListener("click", submit);

    async function submit() {
      const text = $("text").value;

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "提交失败");
        return;
      }

      jobId = data.jobId;
      localStorage.setItem("lastJobId", jobId);
      polls = 0;

      $("panel").style.display = "block";
      $("result").style.display = "none";
      $("error").textContent = "";

      startPolling();
    }

    function startPolling() {
      if (timer) clearInterval(timer);

      poll();                                    // 立刻查一次，别等 1.5 秒
      timer = setInterval(poll, 1500);
    }

    async function poll() {
      if (!jobId) return;

      polls += 1;

      // 最多轮询 10 分钟，防止页面永远在查
      if (polls > 400) {
        stop();
        $("error").textContent = "等待超时，请稍后重新提交";
        return;
      }

      let data;
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (res.status === 404) {
          stop();
          $("error").textContent = "任务不存在（可能服务重启过）";
          return;
        }
        data = await res.json();
      } catch (err) {
        // 网络抖动：不停止，下一轮再试
        console.warn("查询失败，稍后重试：", err.message);
        return;
      }

      render(data.job);
    }

    function render(job) {
      $("status").textContent = label(job.status);
      $("fill").style.width = `${job.progress}%`;
      $("step").textContent = job.step ?? "-";

      // 剩余时间估算：只在 running 且有进度时算
      let eta = "";
      if (job.status === "running" && job.progress > 0 && job.progress < 100) {
        const total = job.elapsedSec / (job.progress / 100);
        eta = `　预计还需 ${Math.max(1, Math.round(total - job.elapsedSec))} 秒`;
      }

      $("meta").textContent =
        `已用 ${job.elapsedSec} 秒${eta}` +
        (job.attempts > 1 ? `　第 ${job.attempts}/${job.max_attempts} 次尝试` : "");

      if (job.status === "done") {
        stop();
        $("result").style.display = "block";
        $("result").textContent = JSON.stringify(job.result, null, 2);
      }

      if (job.status === "dead" || job.status === "failed") {
        stop();
        $("error").textContent = `失败：${job.last_error ?? "未知原因"}`;
      }
    }

    function label(status) {
      const map = {
        pending: "排队中",
        running: "处理中",
        done: "已完成",
        failed: "失败（将重试）",
        dead: "已放弃",
      };
      return map[status] ?? status;
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    // 页面切到后台时暂停，切回来立刻查一次
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stop();
      } else if (jobId) {
        startPolling();
      }
    });

    // 刷新页面后自动恢复
    if (jobId) {
      $("panel").style.display = "block";
      startPolling();
    }
  </script>
</body>
</html>
```

## 2.2 起三个进程

**终端 A：API**

```bash
node api.js
```

**终端 B：worker**

```bash
node worker-v2.js
```

**终端 C：什么都别干，用浏览器。**

打开 `http://localhost:3002`。

## 2.3 点提交，盯住三样东西

**① 进度条**

应该 1.5 秒一跳：0 → 33 → 66 → 100。

**② 状态**

`排队中` → `处理中` → `已完成`。

**③ 终端的日志**

```text
[w-...] 领到 xxx，第 1/3 次
[w-...] xxx 进度 33%
```

## 2.4 验证"刷新不丢"（关键）

**在进度到 33% 的时候，按 F5 刷新页面。**

**你应该看到：进度条立刻恢复，从 33% 继续往下走。**

**为什么能恢复：**

```text
jobId 存在 localStorage → 刷新后脚本照样读得到 → 接着查
进度存在数据库 → 不在页面里，所以刷新不会丢
```

**如果刷新后进度回到 0，说明你把进度存在了前端变量里 —— 那是错的。**

---

# 第 3 步：算清轮询的成本（20 分钟）

## 3.1 一个用户很便宜，一千个用户很贵

```text
1 个用户 × 每 1.5 秒查一次 = 0.67 次/秒
1000 个用户同时看着进度 = 666 次/秒
```

**你的 SQLite 单表每秒 666 次点查，扛得住。但：**

```text
① 每个请求都要走一遍 Express（解析、路由、序列化）
② 每个请求都要占一个连接
③ 如果你的查询没走索引，就是每秒 666 次全表扫
```

## 3.2 三条优化，今天就能做

**① 索引必须存在**

```sql
-- jobs.id 是主键，本来就有索引，这条没问题
-- 但如果你按 status 查列表，就必须建：
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
```

**验证查询走没走索引：**

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare(\"EXPLAIN QUERY PLAN SELECT * FROM jobs WHERE id = 'x'\").all()))"
```

**你应该看到 `USING INDEX sqlite_autoindex_jobs_1`** 之类。**看到 `SCAN jobs` 就是全表扫。**

**② 加缓存，别每次都查库**

同一个任务，1.5 秒内被查十次，结果一模一样。**加 1 秒内存缓存：**

```javascript
// 放在 api.js 里
const cache = new Map();   // id -> { at, data }

app.get("/api/jobs/:id", (req, res) => {
  const id = req.params.id;
  const hit = cache.get(id);

  if (hit && Date.now() - hit.at < 1000) {
    res.json(hit.data);
    return;
  }

  // ……原来的查询逻辑……
  const body = { ok: true, job: {...} };
  cache.set(id, { at: Date.now(), data: body });

  // 简单的容量控制，别让 Map 无限长
  if (cache.size > 5000) cache.clear();

  res.json(body);
});
```

**效果：666 次/秒 → 最多 1 次/秒/任务。** 十倍以上的削减，**代价是进度最多晚 1 秒**。用户看不出来。

**③ 轮询间隔别设 200 毫秒**

```text
500ms  → 像在盯人，成本 ×3
1500ms → 感觉流畅，用户能接受
3000ms → 有点卡顿，但成本砍半
```

**默认 1.5 秒，别更短。**

## 3.3 什么时候该换方案

```text
< 100 个并发看进度     → 轮询，够用（你现在）
100—1000              → 轮询 + 缓存，撑得住
> 1000                → 换 SSE / WebSocket（第 17 周）
```

**记住这个判断：不是"轮询落后"，是"轮询在这个量级上不划算"。**

---

# 第 4 步：故意犯五个错（25 分钟）

## 错误 1：进度到 100 了，状态还是 `running`

把 `worker-v2.js` 的 `markDone` 改成只更新 `progress`，不更新 `status`。

**现象：**

```text
进度条满格，状态显示"处理中"
用户一直等，永远不会结束
```

**前端必须以 `status` 为唯一判据，不能拿 `progress === 100` 当完成。**

**同时这也说明后端要么一次写完（`progress=100` 和 `status='done'` 在同一条 UPDATE 里），要么就别写 100。** 上节课的 `markDone` 就是一次写完的 —— **这就是为什么。**

## 错误 2：前端不停止轮询

把 `render` 里 `if (job.status === "done") { stop(); ... }` 的 `stop()` 删掉。

**现象：**

```text
任务早就完成了，页面还在每 1.5 秒查一次
放着不管，一晚上查几万次
```

**打开浏览器 F12 的 Network 面板自己看。** 这个错误在真实项目里非常常见，**账单会告诉你。**

## 错误 3：进度倒退

在 `runTask` 里改成 `setProgress.run(i * 20, ...)`（4 段 × 20 = 最多 80），然后再写一次 `setProgress.run(100, ...)` 之前加一句 `setProgress.run(50, ...)`。

**现象：** 进度条从 80% 突然退回 50%，用户以为出错了。

**规则：进度只能往前走。**

```javascript
// 正确写法：只增不减
const setProgress = db.prepare(`
  UPDATE jobs SET progress = MAX(progress, ?), step = ? WHERE id = ?
`);
```

## 错误 4：前端自己算时间

把 `elapsedSec` 换成前端算：

```javascript
const elapsed = Math.round((Date.now() - new Date(job.created_at).getTime()) / 1000);
```

**如果你的电脑时间比服务器快 3 分钟，用户会看到"已用 -180 秒"。**

**永远让服务器算时间差，前端只负责显示。**

## 错误 5：把 `payload` 也返回给前端

把 `selectJob` 的 `SELECT` 改成 `SELECT *`。

**现象：** 每次轮询都返回几十 KB 的原文。**1000 个用户 = 每秒几十 MB 流量。**

**F12 → Network 里看 Response Size，自己对比。**

---

# 第 5 步：写学习笔记（10 分钟）

---

# 第 6 步：课后练习

## 练习一：加一个"取消"按钮（20 分钟）

`POST /api/jobs/:id/cancel`：

1. 只有 `pending` 状态能取消，改成 `dead`，`last_error = '用户取消'`；
2. `running` 的不能硬取消（worker 已经在跑了），改成打一个 `cancel_requested` 标记，**worker 每段检查一次**，看到就主动退出；
3. 前端按钮点完立刻停轮询。

**这题的意义：** 你会第一次遇到"**用户想撤销一个正在发生的动作**"，这是所有后台系统的必修题。

## 练习二：估算剩余时间，做得更准（15 分钟）

现在的估算用"已用时间 ÷ 进度"。问题：**前 10% 通常特别慢**（加载模型、读文件），估算会严重偏大。

改进方案（挑一个实现）：

```text
A. 只用最近 3 次采样的速度来估（滑动窗口）
B. 后端在 step 里给出"第 3/4 段"，按段数直接算
C. 干脆不估，只显示"正在处理第 3/4 段"
```

**提示：C 往往是最好的选择。** 不准的估算比不估算更伤害信任。

## 练习三：算一下你自己的量级（10 分钟）

假设你的客户有 50 个员工，每人每天提交 20 个任务，平均每个任务跑 30 秒，都会盯着进度条看。

**问题：**

1. 峰值时刻大概有多少并发在看进度？
2. 轮询 QPS 是多少？
3. 加 1 秒缓存后是多少？
4. 这个量级需要上 SSE 吗？

---

# 第 7 步：最终验收

## A. 三个进程都起来了

- [ ] `api.js` 在 3002
- [ ] `worker-v2.js` 在跑
- [ ] 浏览器能打开页面

## B. 全链路通

- [ ] 点提交，1 秒内看到"排队中"
- [ ] 状态会变成"处理中"
- [ ] 进度条从 0 走到 100
- [ ] 完成后显示结果 JSON
- [ ] `step` 会显示"处理第 N/3 段"

## C. 刷新不丢

- [ ] 进度 33% 时刷新，进度还在
- [ ] 刷新后状态不是"排队中"（说明读的是数据库）

## D. 轮询会停

- [ ] 完成后 F12 Network 里没有新请求
- [ ] 切到别的标签页，请求暂停
- [ ] 切回来，立刻有一次请求

## E. 成本优化

- [ ] 我加过 1 秒缓存
- [ ] 我用 `EXPLAIN QUERY PLAN` 确认过走索引
- [ ] 我知道 1000 并发时大概多少 QPS

## F. 五个错都踩过

- [ ] 见过"进度 100 但状态还在 running"
- [ ] 见过不停止轮询的请求刷屏
- [ ] 知道进度不能倒退
- [ ] 知道时间必须服务器算
- [ ] 对比过 `SELECT *` 和精简字段的响应大小

## G. 笔记

- [ ] 轮询的三个优化我写下来了
- [ ] 我知道什么量级该换 SSE
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **用户不怕等，怕的是不知道在等什么。**
> **进度条不是装饰，是把"不可见的后台"变成"可见的过程"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 页面一直"排队中" | worker 没起，或 `next_run_at` 是未来 | 起 `worker-v2.js`，查表 |
| 刷新后进度回到 0 | 进度存在前端变量里 | 进度必须在数据库，前端只读 |
| 完成后还在请求 | 忘了 `clearInterval` | `stop()` 在 `done` / `dead` 时都要调 |
| 状态显示 `undefined` | 后端没返回这个字段 | 检查 `SELECT` 列有没有漏 |
| `result` 显示 `[object Object]` | 没 `JSON.parse` | 后端 parse，或前端 `JSON.stringify` 后展示 |
| 剩余时间算成负数 | 前端用客户端时钟 | 用服务器返回的 `elapsedSec` |
| 429 / 请求被限流 | 轮询太密 | 间隔改 1.5 秒以上，加缓存 |
| 404 任务不存在 | 服务重启，或 id 抄错 | 检查 `localStorage` 里的 id，必要时清掉 |
