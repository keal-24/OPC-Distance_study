# 第 145 节课：端到端测试（不开浏览器）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的"端到端"不是开浏览器点按钮。**是一条命令走完"提交 → 转人工 → 处理完 → 结果可见"的整条链路。**
> 因为你要验的是状态流转，不是按钮颜色。

**建议用时**：120 分钟
**你需要先完成**：第 144 节的 `errors.test.js`
**今天要装**：什么都不用装

---

# 第 0 步：为什么不开浏览器（15 分钟）

## 0.1 浏览器端到端的问题

```text
你装了 Playwright（约 200 MB 浏览器）
第一条测试：打开页面 → 输入 → 点提交 → 断言出现文字
```

**三个月的使用体验：**

```text
· 每条测试 3–8 秒（启动浏览器 + 渲染）
· 20 条就是 2 分钟
· 偶发失败（元素没渲染完 / 动画挡住 / 字体加载慢）
· 改一个 class 名，10 条测试全红
· 你的 CI 跑不起来（缺浏览器依赖）
```

**而它抓到的 bug：**

```text
· "按钮的 onclick 拼错了"       ← 你在开发时就发现了
· "div 的 id 改了"              ← 同上
· "文字显示位置不对"            ← 用眼睛看更快
```

**投入产出比极差。**

## 0.2 你真正要验的是什么

```text
不是"按钮能点"，是"点了之后发生了什么"：

① 提交一个会转人工的输入
② 系统返回 202 + trace_id
③ 队列里出现一条 pending
④ 有人"处理"它（模拟调接口）
⑤ 状态变成 done
⑥ 通过 trace_id 能查到最终结果
```

**这整条链路，用 `fetch` 就能测。完全不需要浏览器。**

## 0.3 一个例外：什么时候真的需要浏览器

```text
· 你用了前端框架（React/Vue），组件状态复杂
· 你有表单校验、文件上传、拖拽这类交互
· 第 27 周做"前端进阶"时会需要

现在：你的前端大概率是一个 HTML + 几个 fetch 调用
→ 用 fetch 测接口就够
→ 浏览器测试留给第 27 周（如果用得上）
```

**今天做"接口层的端到端"。**

---

# 第 1 步：先看你的队列接口（20 分钟）

## 第 1.1 你缺什么

**第 131 节做了 `review_queue` 表和界面，但没有 HTTP 接口。**

**所以端到端测试需要三个新接口：**

```text
GET  /api/review/next      取一条待处理
POST /api/review/:id/done  标记处理完
GET  /api/review/stats     队列统计
```

## 1.2 实现

```javascript
// app/routes/review.js
import { Router } from "express";
import { wrap } from "../middleware/error.js";
import { fail } from "../errors/index.js";
import { config } from "../config/index.js";
import { db } from "../lib/db.js";
import { log } from "../lib/logger.js";

export const reviewRouter = Router();

// 取一条待处理（按优先级）
reviewRouter.get("/review/next", wrap(async (req, res) => {
  const row = db.prepare(`
    SELECT * FROM review_queue
    WHERE status = 'pending'
    ORDER BY score DESC, created_at ASC
    LIMIT 1
  `).get();

  if (!row) {
    return res.status(204).end();       // 204 = 没有内容
  }

  res.json({
    ok: true,
    trace_id: req.traceId,
    data: {
      ...row,
      reasons: safeJson(row.reasons),
      waiting_hours: +((Date.now() - row.created_at) / 3.6e6).toFixed(1),
      sla_left_hours: +((row.due_at - Date.now()) / 3.6e6).toFixed(1),
    },
  });
}));

// 标记处理完
reviewRouter.post("/review/:id/done", wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) fail("BAD_INPUT", { detail: "id 不是整数" });

  const { resolution, final_output } = req.body ?? {};
  if (!["fixed", "rejected", "rewritten"].includes(resolution)) {
    fail("BAD_INPUT", { detail: `resolution 非法：${resolution}` });
  }

  const row = db.prepare(`SELECT * FROM review_queue WHERE id = ?`).get(id);
  if (!row) fail("NOT_FOUND", { detail: `review id=${id}` });

  db.prepare(`
    UPDATE review_queue
    SET status = 'done', done_at = ?, resolution = ?, final_output = ?, resolver = ?
    WHERE id = ?
  `).run(Date.now(), resolution, final_output ?? null, req.headers["x-reviewer"] ?? "unknown", id);

  log.info("review_done", { trace_id: req.traceId, review_id: id, resolution });

  res.json({ ok: true, trace_id: req.traceId, data: { id, resolution } });
}));

// 队列统计
reviewRouter.get("/review/stats", wrap(async (req, res) => {
  const s = db.prepare(`
    SELECT
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='pending' AND due_at < ? THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status='escalated' THEN 1 ELSE 0 END) AS escalated
    FROM review_queue
  `).get(Date.now());

  res.json({
    ok: true,
    trace_id: req.traceId,
    data: {
      pending: s.pending ?? 0,
      overdue: s.overdue ?? 0,
      done: s.done ?? 0,
      escalated: s.escalated ?? 0,
      backlog_limit: config.review.backlogLimit,
      overloaded: (s.pending ?? 0) > config.review.backlogLimit,
    },
  });
}));

function safeJson(s) {
  try { return JSON.parse(s); } catch { return []; }
}
```

## 1.3 建表（如果还没有）

```javascript
// app/lib/db.js 的 migrate() 里加
db.exec(`
  CREATE TABLE IF NOT EXISTS review_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id    TEXT NOT NULL UNIQUE,
    input       TEXT NOT NULL,
    output      TEXT,
    reasons     TEXT NOT NULL,
    action      TEXT NOT NULL DEFAULT 'confirm',
    score       REAL NOT NULL DEFAULT 0,
    sla_hours   INTEGER NOT NULL DEFAULT 24,
    due_at      INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    repeated    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    started_at  INTEGER,
    done_at     INTEGER,
    resolver    TEXT,
    resolution  TEXT,
    final_output TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_rq_pending ON review_queue(status, score DESC);
  CREATE INDEX IF NOT EXISTS idx_rq_due ON review_queue(status, due_at);
`);
```

## 1.4 一个必须想清的事

**`/api/review/*` 需要鉴权。**

```javascript
// 简单但够用：token 从环境变量来
reviewRouter.use((req, res, next) => {
  const token = req.headers["x-admin-token"];
  if (config.isTest) return next();              // 测试环境放开
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, code: "UNAUTHORIZED", message: "请先登录", trace_id: req.traceId });
  }
  next();
});
```

**`config.isTest` 时放开是必要的** —— 否则测试要先拿 token，增加复杂度。

**但你要知道这个口子存在，并且写进 `NOTES.md`。**

---

# 第 2 步：写端到端测试（40 分钟）★ 核心

## 2.1 完整链路：提交 → 转人工 → 处理 → 完成

```javascript
// test/e2e.test.js
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startFakeUpstream, startApp, makeClient, waitFor } from "./helper.js";

let up, app, client;

before(async () => {
  up = await startFakeUpstream(0);
  app = await startApp({
    port: 0,
    env: { API_BASE: `http://127.0.0.1:${up.port}/v1` },
  });
  client = makeClient(`http://127.0.0.1:${app.port}`);
});

after(async () => {
  await app?.stop();
  await up?.close();
});

describe("端到端：转人工完整链路", () => {
  test("提交 → 202 → 队列 → 处理 → 完成", async () => {
    // ===== ① 让上游超时，制造一次转人工 =====
    up.setMode("hang");

    const submitted = await client.call("/api/tickets", {
      method: "POST",
      body: { message: "这条一定会转人工，因为上游会超时" },
    });

    assert.equal(submitted.status, 202, "超时应返回 202");
    assert.equal(submitted.json.ok, false);
    assert.ok(submitted.json.trace_id, "必须有 trace_id");

    const traceId = submitted.json.trace_id;

    // ===== ② 队列里应该有这条 =====
    const stats1 = await client.call("/api/review/stats");
    assert.ok(stats1.json.data.pending >= 1, "队列应该有 pending");

    // ===== ③ 取出来 =====
    const next = await client.call("/api/review/next");
    assert.equal(next.status, 200, "应该有可处理的条目");
    assert.equal(next.json.data.trace_id, traceId, "取到的应该是刚提交那条");
    assert.equal(next.json.data.status, "pending");
    assert.equal(next.json.data.input, "这条一定会转人工，因为上游会超时", "input 必须完整");
    assert.ok(Array.isArray(next.json.data.reasons), "reasons 应是数组");

    const reviewId = next.json.data.id;

    // ===== ④ 处理它 =====
    const done = await client.call(`/api/review/${reviewId}/done`, {
      method: "POST",
      body: {
        resolution: "rewritten",
        final_output: JSON.stringify({
          summary: "客户反馈问题（人工整理）",
          category: "other",
          urgency: "medium",
          suggested_action: "联系客户确认细节",
          need_human: true,
        }),
      },
    });
    assert.equal(done.status, 200);
    assert.equal(done.json.data.resolution, "rewritten");

    // ===== ⑤ 队列统计变化 =====
    const stats2 = await client.call("/api/review/stats");
    assert.equal(stats2.json.data.pending, stats1.json.data.pending - 1, "pending 应该少一条");
    assert.ok(stats2.json.data.done >= 1, "done 应该多一条");

    // ===== ⑥ 通过 trace_id 能查到最终结果 =====
    const list = await client.call("/api/tickets?limit=100");
    const row = list.json.data.find((t) => t.trace_id === traceId);
    assert.ok(row, "在 tickets 表里能找到");
    assert.equal(row.route, "human");
  });

  test("队列空时 /review/next 返回 204", async () => {
    // 先清空队列（把所有 pending 处理掉）
    for (let i = 0; i < 20; i++) {
      const n = await client.call("/api/review/next");
      if (n.status === 204) break;
      await client.call(`/api/review/${n.json.data.id}/done`, {
        method: "POST", body: { resolution: "rejected" },
      });
    }

    const r = await client.call("/api/review/next");
    assert.equal(r.status, 204);
    assert.equal(r.text, "", "204 不该有 body");
  });
});
```

## 2.2 逐段解释五个设计

**① 用 `hang` 制造转人工，不用"含糊输入"**

```text
"含糊输入" → 依赖模型的判断 → 随机
"hang"     → 确定会超时 → 确定会转人工 → 稳定
```

**端到端测试必须"确定性"。** 任何依赖模型判断的步骤都会让它随机红。

**② 每一步都断言，不是只有开头和结尾**

```text
6 步，6 组断言。
失败时你知道卡在第几步。
```

**如果只断言开头 202 和结尾"能查到"，中间哪一步断了你都不知道。**

**③ 断言 `next.json.data.trace_id === traceId`**

**这条验证"队列取出来的是我刚提交的那条"。**

```text
如果队列里有多条（比如其他测试留下的），
"取一条"取到的可能不是你的。
→ 这条断言会失败 → 你发现"测试之间互相污染"
```

**这就是为什么 `DB_FILE=:memory:` 重要。**

**④ 断言 `stats` 的数字变化，不只断言"有结果"**

```javascript
assert.equal(stats2.json.data.pending, stats1.json.data.pending - 1);
```

**这条验证"状态真的流转了"，不只是"接口返回 200"。**

**⑤ 最后一个测试"清空队列"用了循环**

```javascript
for (let i = 0; i < 20; i++) {
  const n = await client.call("/api/review/next");
  if (n.status === 204) break;
  ...
}
```

**为什么不用 `DELETE FROM review_queue`？**

```text
用 HTTP 接口清理 → 顺便测了接口
用 SQL 直接删    → 少了覆盖面，而且需要 db 连接
```

**而且 `i < 20` 的上限防止死循环**（万一 `/done` 没生效，`next` 一直返回同一条）。

---

# 第 3 步：三条边界情况的端到端（25 分钟）

## 3.1 重复处理同一条

```javascript
test("同一条不能处理两次", async () => {
  up.setMode("hang");
  const s = await client.call("/api/tickets", { method: "POST", body: { message: "重复处理测试" } });
  const next = await client.call("/api/review/next");
  const id = next.json.data.id;

  const first = await client.call(`/api/review/${id}/done`, {
    method: "POST", body: { resolution: "fixed", final_output: "{}" },
  });
  assert.equal(first.status, 200);

  const second = await client.call(`/api/review/${id}/done`, {
    method: "POST", body: { resolution: "fixed", final_output: "{}" },
  });

  // 期望：要么 409（冲突），要么 200 但幂等（不改变状态）
  assert.ok([200, 409].includes(second.status), `实际 ${second.status}`);

  // 关键：done 的数量不该涨两次
  const stats = await client.call("/api/review/stats");
  assert.ok(stats.json.data.done >= 1);

  // 再粗暴一点：直接查库确认只有一条 done
  // （如果你的接口返回了 id，可以用 /api/tickets 查，但 review 表的 done 数最直接）
});
```

**这条测试会暴露一个真实问题：你大概率没做幂等。**

**修法：**

```javascript
// 加 status 检查
const row = db.prepare(`SELECT * FROM review_queue WHERE id = ?`).get(id);
if (row.status === "done") {
  return res.json({ ok: true, trace_id: req.traceId, data: { id, resolution: row.resolution, idempotent: true } });
}
```

## 3.2 处理一条不存在的

```javascript
test("处理不存在的 id → 404", async () => {
  const r = await client.call("/api/review/999999/done", {
    method: "POST", body: { resolution: "fixed" },
  });
  assert.equal(r.status, 404);
  assert.equal(r.json.code, "NOT_FOUND");
});

test("resolution 非法 → 400", async () => {
  up.setMode("hang");
  await client.call("/api/tickets", { method: "POST", body: { message: "x" } });
  const next = await client.call("/api/review/next");

  const r = await client.call(`/api/review/${next.json.data.id}/done`, {
    method: "POST", body: { resolution: "瞎写的" },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, "BAD_INPUT");
});
```

## 3.3 队列积压时

```javascript
test("队列积压超过阈值 → stats 里 overloaded=true", async () => {
  // 连续制造 5 条转人工（够不够取决于你的 backlogLimit）
  up.setMode("hang");
  for (let i = 0; i < 5; i++) {
    await client.call("/api/tickets", { method: "POST", body: { message: `积压测试 ${i}` } });
  }

  const stats = await client.call("/api/review/stats");
  assert.equal(typeof stats.json.data.overloaded, "boolean");
  // 如果 backlogLimit 是 200，5 条不会超；改成 3 才能验证
});
```

**如果你的 `backlogLimit` 是 200，这条测试要造 201 条 —— 太慢。**

**解法：测试环境把限额降到 3。**

```bash
# .env.test
QUEUE_BACKLOG_LIMIT=3
```

**然后：**

```javascript
test("队列积压超过阈值 → overloaded=true", async () => {
  up.setMode("hang");
  for (let i = 0; i < 5; i++) {
    await client.call("/api/tickets", { method: "POST", body: { message: `积压 ${i}` } });
  }
  const stats = await client.call("/api/review/stats");
  assert.equal(stats.json.data.overloaded, true);
  assert.ok(stats.json.data.pending > 3);
});
```

**"测试环境的阈值调小"是个常用技巧** —— 让你不用造几百条数据。

---

# 第 4 步：给前端留一个"最小可验证页面"（20 分钟）

## 4.1 为什么还是要一个页面

**测试不开浏览器，但你需要能"手动看一眼"。**

```text
调试时：想知道"用户看到的到底是什么" → 需要页面
演示时：给客户看 → 需要页面
自查时：跑完测试，想确认"真的能用" → 需要页面
```

**但页面可以极简。**

## 4.2 40 行的复核页

```html
<!-- public/review.html -->
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <title>复核</title>
  <style>
    body { font: 14px/1.6 system-ui; max-width: 760px; margin: 24px auto; padding: 0 16px; }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
    .meta { color: #666; font-size: 12px; }
    pre { background: #f6f6f6; padding: 8px; overflow: auto; max-height: 180px; }
    textarea { width: 100%; min-height: 90px; font-family: monospace; }
    button { padding: 6px 14px; margin-right: 8px; cursor: pointer; }
    .ok { background: #2a2; color: #fff; border: 0; }
    .skip { background: #888; color: #fff; border: 0; }
    #empty { display: none; padding: 32px; text-align: center; color: #666; }
  </style>
</head>
<body>
<h2>复核队列 <span id="stats" class="meta"></span></h2>
<div id="empty">队列空了 ✅</div>
<div id="card" class="card" style="display:none">
  <div class="meta" id="meta"></div>
  <p><b>客户原话</b></p>
  <pre id="input"></pre>
  <p><b>模型输出</b></p>
  <pre id="output"></pre>
  <p><b>处理后</b></p>
  <textarea id="fix"></textarea>
  <p>
    <button class="ok" onclick="done('fixed')">通过（1）</button>
    <button class="skip" onclick="done('rejected')">驳回（2）</button>
  </p>
</div>

<script>
let cur = null;

async function stats() {
  const r = await fetch("/api/review/stats").then((x) => x.json());
  const d = r.data;
  document.getElementById("stats").textContent =
    `待处理 ${d.pending} · 超期 ${d.overdue} · 已完成 ${d.done}` +
    (d.overloaded ? " · ⚠️ 积压" : "");
}

async function load() {
  await stats();
  const res = await fetch("/api/review/next");
  if (res.status === 204) {
    document.getElementById("card").style.display = "none";
    document.getElementById("empty").style.display = "block";
    return;
  }
  document.getElementById("empty").style.display = "none";
  document.getElementById("card").style.display = "block";

  cur = (await res.json()).data;
  document.getElementById("meta").textContent =
    `id=${cur.id} · 分 ${cur.score} · ${cur.action} · ${cur.reasons.join(",")} · 等 ${cur.waiting_hours}h · SLA 剩 ${cur.sla_left_hours}h`;
  document.getElementById("input").textContent = cur.input;
  document.getElementById("output").textContent = cur.output ?? "（无输出：超时）";
  document.getElementById("fix").value = cur.output ?? "";
}

async function done(resolution) {
  await fetch(`/api/review/${cur.id}/done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolution, final_output: document.getElementById("fix").value }),
  });
  load();
}

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA") return;
  if (e.key === "1") done("fixed");
  if (e.key === "2") done("rejected");
});

load();
</script>
</body>
</html>
```

## 4.3 一个"手动验收清单"

**跑完测试之后，手动做这四步：**

```text
① 起 dev 服务，打开 /review.html
② 用 curl 制造一条转人工（mode=hang 或含糊输入）
③ 刷新页面，应该看到那条
④ 按 1 通过，看 stats 数字变化
```

**四步都顺，说明"人能用的版本"是好的。**

**这一步不能省** —— 测试只能验"接口对"，验不了"页面能用"。

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **端到端 6 步的实际断言**
- **"重复处理"那条暴露了什么问题**
- **测试环境的 backlogLimit 你调成了多少**
- **手动验收四步做了什么**

---

# 第 6 步：课后练习

## 练习一：加一条"重试后状态一致"（25 分钟）

```text
场景：客户端网络抖，POST /review/:id/done 发了两遍
期望：第二次调用不改变状态（幂等）
```

**先测"不幂等"的现象：**

```javascript
test("当前实现不幂等（记录这个事实）", async () => {
  // 制造一条 pending
  // 调两次 done
  // 断言 done 数量涨了 2（证明不幂等）
});
```

**然后修，再测"幂等"：**

```javascript
test("修完之后幂等", async () => {
  // 调两次 done
  // 断言 done 数量只涨 1
  // 且第二次响应里有 idempotent: true
});
```

**"先测出 bug，再修，再测通过" —— 这个流程比"直接写正确的测试"更能证明你在修东西。**

## 练习二：让 e2e 测试跑得快（20 分钟）

```text
当前耗时：
  before() 起服务   约 400ms
  6 条测试          约 12 秒（因为 hang 模式每条要等 4 秒）
  after() 清理      约 100ms
```

**优化思路：**

```text
① 把 TIMEOUT_FIRST_BYTE_MS 从 2000 降到 500
   → 每条超时测试从 4 秒降到 1 秒
   → 但要确认生产代码没有硬编码"必须 > 1000"

② 用 mode 切换替代多次起服务
   → 已经这么做了
```

**改完测一下总耗时。**

## 练习三：判断这个 e2e 测试错在哪（15 分钟）

```javascript
test("完整流程", async () => {
  await fetch("/api/tickets", { method: "POST", body: JSON.stringify({ message: "test" }) });
  const list = await fetch("/api/tickets").then((r) => r.json());
  assert.ok(list.total > 0);
});
```

**错在哪？至少五条。**

**参考答案：**

```text
① 没验状态码 → 可能是 500 但 total 还是 >0（旧数据）
② 没验 trace_id → 无法确认"我这条"进去了
③ 没验 202 场景 → 转人工的链路完全没覆盖
④ 没验队列 → /review/* 三个接口零覆盖
⑤ "total > 0" 可能因为别的测试留下的数据 → 假绿
⑥ 没验 input 完整 → 字段截断发现不了
⑦ 没有第 6 步"处理完 → 能查到最终结果" → 状态流转没验
```

**第 ⑤ 条最典型：** `total > 0` 是个"永远成立"的断言（只要库里有任何数据）。

---

# 第 7 步：最终验收

## A. 三个新接口

- [ ] `GET /api/review/next` 返回优先级最高的一条
- [ ] 队列空时返回 **204**（不是 200 + 空对象）
- [ ] `POST /api/review/:id/done` 能标记完成
- [ ] `resolution` 做了枚举校验
- [ ] `GET /api/review/stats` 返回四项统计
- [ ] 有鉴权（测试环境放开，写进 NOTES）
- [ ] `review_queue` 表建好了，有索引

## B. 端到端主链路

- [ ] 提交（`hang` 模式）→ **202**
- [ ] 有 `trace_id`
- [ ] 队列 `pending` ≥ 1
- [ ] `/review/next` 取到的 `trace_id` 和提交的一致
- [ ] `input` 一字不差
- [ ] 处理完 → `pending` 少 1，`done` 多 1
- [ ] 通过 `trace_id` 在 `/api/tickets` 里能查到，`route=human`

## C. 边界

- [ ] 队列空 → 204，且 body 为空
- [ ] 重复处理同一条 → 409 或幂等（**我测出了当前行为**）
- [ ] 处理不存在的 id → 404
- [ ] `resolution` 非法 → 400
- [ ] 队列积压 → `overloaded: true`（**测试环境把限额调小**）

## D. 手动验收

- [ ] `/review.html` 能打开
- [ ] 键盘 1 / 2 能操作
- [ ] stats 数字实时变化
- [ ] 四步手动验收都顺

## E. 提速

- [ ] `TIMEOUT_FIRST_BYTE_MS` 在测试环境降到 ≤500
- [ ] e2e 总耗时 < 15 秒

## F. 提交

```bash
git add -A
git commit -m "第145节：端到端，提交→202→队列→处理→完成，X条"
git push
```

---

## 本节课要能说出口的一句话

> **端到端验的是"状态流转"，不是"按钮能点"。用 fetch 走完整链路，比开浏览器快 10 倍。**

---

# 附：常见问题速查

**Q：为什么 `hang` 模式能稳定制造转人工，而"含糊输入"不行？**

A：**因为"含糊输入"的结果取决于模型判断，而模型是随机的。**

```text
含糊输入 → 模型可能编一个答案 → 返回 200（不转人工）
         → 测试失败 → 你以为是队列坏了
```

**`hang` 是"物理确定"的 —— 上游永远不回响应，必然超时，必然转人工。**

**端到端测试的每一步都必须是确定性的。**

**Q：`204` 为什么不能带 body？**

A：**HTTP 规范：204 = "成功但无内容"，带了 body 会违反规范。**

```text
有些客户端会忽略 204 的 body
有些会报错
```

**Express 里 `res.status(204).end()` 就是正确的写法。**

**Q：`/api/review/*` 在测试环境不鉴权，安全吗？**

A：**安全的前提是"测试环境不暴露到公网"。**

```text
本地开发     → 只有你能访问
CI           → 跑在容器里，无外网
测试服务器   → ⚠️ 如果有公网 IP，必须加鉴权
```

**如果你的测试环境有公网地址，去掉 `config.isTest` 那个放开。**

**Q：重复处理同一条，应该返回 409 还是幂等？**

A：**看你想要什么语义。**

```text
409 Conflict  → "这条已经处理过了，别重复操作"（用户需要知道）
幂等 200      → "处理成功"（用户不需要知道，但接口要真的不重复写）
```

**推荐幂等 + 响应里带 `idempotent: true`。**

**因为：**

```text
用户的网络可能抖 → 他重发 → 如果返回 409，他不知道该不该再试
幂等 → 无论如何都返回成功 → 用户不再重试
```

**Q：`overloaded` 这个字段测起来要造 200 条数据吗？**

A：**不用。测试环境把 `QUEUE_BACKLOG_LIMIT` 设成 3。**

```bash
# .env.test
QUEUE_BACKLOG_LIMIT=3
```

**这是"通过配置让测试可控"的通用技巧。**

**Q：`/review.html` 里的 `onclick="done('fixed')"` 会不会有 XSS 风险？**

A：**`done` 是固定字符串，没有用户输入 → 安全。**

**但如果哪天改成 `onclick="done('${cur.id}')"` → 就危险了。**

**更安全的写法：**

```javascript
document.getElementById("btn-ok").addEventListener("click", () => done("fixed"));
```

**不用内联 `onclick`，就不会有这个问题。**

**这个页面只是"给自己看的"，但习惯要养对。**
