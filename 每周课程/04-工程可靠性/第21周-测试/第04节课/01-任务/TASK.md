# 第 144 节课：错误路径测试

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的标准：**每条测试都要让系统"坏一次"，然后验证它坏得体面。**
> 正常路径你不容易写错，错误路径才是 bug 聚集地。

**建议用时**：130 分钟
**你需要先完成**：第 143 节的 `api.test.js`
**今天要装**：什么都不用装

---

# 第 0 步：为什么错误路径如此重要（15 分钟）

## 0.1 一个数字

**你写代码时，90% 的注意力在"正常路径"上。**

```javascript
// 正常路径（你写了 50 遍）
const res = await fetch(url, {...});
const json = await res.json();
const text = json.choices[0].message.content;
return parse(text);
```

**四条语句，四个可能的失败点，你一个都没处理：**

```text
① fetch 抛错（网络挂了）        → 未捕获 → 500 + 堆栈泄露
② res 不是 200                  → res.json() 得到错误页 HTML → 抛错 → 500
③ json.choices 不存在           → TypeError: Cannot read properties of undefined
④ parse 失败                    → 抛错 → 500
```

**这四种情况在真实环境里每天都在发生**（第 19 周你测过：硬挂 60% / 软挂 25% / 慢挂 15%）。

**而你的测试只测了"① 都不发生"的那一条路。**

## 0.2 错误路径测试的三层

```text
第一层：输入错误（4xx）
  验证：拦得住、提示清楚、不泄露内部信息

第二层：依赖失败（5xx / 降级）
  验证：有兜底、用户看到人话、落队列、记日志

第三层：系统内部错误（bug）
  验证：不崩、不泄露堆栈、有 trace_id
```

**三层都要有。** 大部分人的测试里只有第一层（测参数校验），第二三层为零。

**而你的线上事故 90% 发生在第二三层。**

## 0.3 今天的做法

```text
用假上游的 9 种 mode，逐个触发：
  ok            → 基线（已验证）
  500           → 主挂
  429           → 限流
  hang          → 超时
  empty         → 软挂（空输出）
  html          → 软挂（错误页）
  overpromise   → 输出越权
  pii           → 输出含 PII
  unstable      → 低置信

每个 mode 对应 1–3 条断言，验证"坏得体面"。
```

---

# 第 1 步：第一层 · 输入错误（25 分钟）

## 1.1 四个必测的输入错误

```javascript
// test/errors.test.js
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startFakeUpstream, startApp, makeClient } from "./helper.js";

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

beforeEach(() => { up.setMode("ok"); up.resetCount(); });

// 断言包装：失败时打印响应体
function assertStatus(r, want, note = "") {
  assert.equal(r.status, want,
    `${note}\n  期望 ${want}，实际 ${r.status}\n  响应：${r.text?.slice(0, 400)}`);
}

describe("第一层：输入错误", () => {
  test("空消息 → 400，且不调用模型", async () => {
    const before = up.getCallCount();
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "" } });

    assertStatus(r, 400, "空消息应被拦");
    assert.equal(r.json.code, "EMPTY_INPUT");
    assert.equal(up.getCallCount(), before, "❌ 被拦的请求不该调用模型（省成本）");
  });

  test("超长消息 → 400，且不调用模型", async () => {
    const before = up.getCallCount();
    const r = await client.call("/api/tickets", {
      method: "POST", body: { message: "a".repeat(5000) },
    });

    assertStatus(r, 400, "超长应被拦");
    assert.equal(r.json.code, "TOO_LONG");
    assert.equal(up.getCallCount(), before);
  });

  test("坏 JSON → 400 BAD_FORMAT", async () => {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken",
    });
    const j = await res.json();
    assert.equal(res.status, 400);
    assert.equal(j.code, "BAD_FORMAT");
    assert.ok(j.trace_id, "即使参数错，也要有 trace_id");
  });

  test("body 超过 1MB → 400 TOO_LONG", async () => {
    const big = "x".repeat(1_100_000);
    const r = await client.call("/api/tickets", { method: "POST", body: { message: big } });
    assertStatus(r, 400, "超大 body 应被拦");
    assert.equal(r.json.code, "TOO_LONG");
  });

  test("非法 id → 400 BAD_INPUT", async () => {
    const r = await client.call("/api/tickets/not-a-number");
    assertStatus(r, 400);
    assert.equal(r.json.code, "BAD_INPUT");
  });

  test("错误响应里没有堆栈和 SQL", async () => {
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "" } });

    const body = r.text;
    assert.ok(!/at\s+\w+\s+\(/.test(body), "不能有堆栈帧");
    assert.ok(!/SELECT|INSERT|UPDATE/i.test(body), "不能有 SQL");
    assert.ok(!/\/home\/|\/Users\/|C:\\\\/.test(body), "不能有绝对路径");
    assert.ok(!/node_modules/.test(body), "不能有依赖路径");
  });
});
```

## 1.2 逐条解释三个关键断言

**① `assert.equal(up.getCallCount(), before)`**

**这是"验证副作用"的测试。**

```text
如果入口拦住但模型还是被调用了：
  · 你白花了钱（每次 ¥0.01，一天 100 次注入 = ¥1，一年 365 元）
  · 更重要：模型的输出进了日志、可能进了缓存
  · 最坏：如果审核有 bug，注入成功
```

**只断言"返回 400"是不够的** —— 那只能证明"你拦住的结果"，不能证明"你没做无用的工作"。

**② `assert.ok(j.trace_id)` 即使参数错**

```text
参数错的请求也要有 trace_id。
因为用户会说"我刚才提交失败了"，你需要能查。
```

**如果 400 响应里没有 trace_id，你就只能靠时间猜。**

**③ 那条"错误响应里没有堆栈"**

**这条测试最容易被人觉得"多余"，但它抓的都是真事故。**

```javascript
// 检查四种泄露
assert.ok(!/at\s+\w+\s+\(/.test(body));      // 堆栈帧 "at foo (/path/file.js:12:3)"
assert.ok(!/SELECT|INSERT|UPDATE/i.test(body));  // SQL
assert.ok(!/\/home\/|\/Users\/|C:\\\\/.test(body)); // 绝对路径
assert.ok(!/node_modules/.test(body));       // 依赖路径
```

**如果哪天有人在 `normalize` 里写了 `detail: err.stack`，这条会红。**

## 1.3 一个必须做的破坏实验

```javascript
// app/middleware/error.js
// 把 toJSON 改成直接返回 stack
res.status(status).json({ ok: false, code, message: err.message, stack: err.stack });
```

**跑测试 → "错误响应里没有堆栈" 必须失败。**

**如果没失败** → 你的正则写错了（`/at\s+\w+\s+\(/` 可能匹配不到某些格式）→ 用一个真实的 stack 验证：

```javascript
try { null.x } catch (e) { console.log(JSON.stringify(e.stack)); }
```

---

# 第 2 步：第二层 · 依赖失败（40 分钟）★ 核心

## 2.1 六种上游故障

```javascript
describe("第二层：依赖失败", () => {
  test("上游 500 → 切备用或降级，用户不看到 500", async () => {
    up.setMode("500");
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "东西坏了" } });

    // 关键：不该是 500
    assert.notEqual(r.status, 500, "上游挂了不该让用户看到 500");
    assert.ok([200, 202].includes(r.status), `应是 200 或 202，实际 ${r.status}`);
  });

  test("上游 429 → 同样不暴露", async () => {
    up.setMode("429");
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "东西坏了" } });
    assert.ok([200, 202].includes(r.status));
  });

  test("上游超时 → 202 转人工，且有人话", async () => {
    up.setMode("hang");
    const t0 = Date.now();
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "东西坏了" } });
    const ms = Date.now() - t0;

    assertStatus(r, 202, "超时应转人工");
    assert.equal(r.json.ok, false);
    assert.ok(r.json.message, "必须有一句人话");
    assert.ok(!/timeout|Timeout|ECONN/i.test(r.json.message), "不能出现技术词");
    assert.ok(/不要重复|无需重复|2 小时|稍后/.test(r.json.message), "必须告诉用户等多久或不重发");
    assert.ok(ms < 8000, `超时应该 8 秒内结束，实际 ${ms}ms`);
  });

  test("上游返回空内容 → 不算成功", async () => {
    up.setMode("empty");
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "东西坏了" } });

    // 空输出应该被当成失败，走降级
    assert.ok(r.status === 202 || r.json.ok === false, "空输出不该被当成成功");
  });

  test("上游返回 HTML 错误页 → 不算成功", async () => {
    up.setMode("html");
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "东西坏了" } });

    assert.ok(r.status === 202 || r.json.ok === false, "HTML 错误页不该被当成成功");
    // 关键：不能把 HTML 透传给前端
    assert.ok(!r.text.includes("<!DOCTYPE"), "不能把上游的 HTML 透传给用户");
  });

  test("超时的条目进了队列", async () => {
    up.setMode("hang");
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "超时的应该进队列" } });
    const tid = r.json.trace_id;

    // 查库：应该有这条记录，且 route=human
    const list = await client.call("/api/tickets?limit=100");
    const row = list.json.data.find((t) => t.trace_id === tid);
    assert.ok(row, "❌ 超时的请求必须落库（否则消息永久丢失）");
    assert.equal(row.input, "超时的应该进队列", "input 必须完整保存");
  });
});
```

## 2.2 逐条解释四个最关键的断言

**① `assert.notEqual(r.status, 500)`**

**这是第二层的核心原则：上游挂了，不该让用户看到 500。**

```text
500 的意思："我们出 bug 了，你自己看着办"
202 的意思："我们收到了，有人在处理"

用户看到 500 → 会重试 → 又 500 → 打电话投诉
用户看到 202 → 会等 → 2 小时后有人回复
```

**② `assert.ok(ms < 8000)`**

**这是"超时真的生效了"的证明。**

```text
如果 fetchWithTimeout 没生效 → 请求会挂到 node 的默认超时（可能是 30 秒甚至无限）
→ 用户等 30 秒 → 他看到的是"转圈" → 他关掉页面
```

**断言耗时是唯一能抓住"超时没设"的方法。**

**③ `assert.ok(!/timeout|Timeout|ECONN/i.test(r.json.message))`**

**这条抓的是"技术词泄露"。**

```javascript
// ❌ 常见的错误文案
{ message: "请求超时（ECONNRESET）" }
{ message: "上游 timeout 30s" }
{ message: "fetch failed" }

// ✅ 正确
{ message: "这条处理得比较久，已经转人工。2 小时内回复，不需要重复发送。" }
```

**④ `assert.ok(row.input === "超时的应该进队列")`**

**这条是"不丢消息"的证明。**

```text
超时的时候模型什么都没返回
→ input 变量是这条客户消息的唯一副本
→ 不落库 = 消息永久消失
→ 而且不报错、不告警、日志里看不到
→ 只有用户投诉时你才会知道
```

**这是第 129 节强调的最严重的问题，今天用测试固化它。**

## 2.3 三个必须做的破坏实验

```javascript
// 破坏 1：让超时失效
// app/lib/model.js 里把 AbortSignal 去掉
// 期望失败：「上游超时 → 202」那条（会等到默认超时或永久挂）

// 破坏 2：超时不落库
// app/routes/tickets.js 里把 route==="human" 时的 saveResult 删掉
// 期望失败：「超时的条目进了队列」

// 破坏 3：把空输出当成成功
// app/lib/model.js 里去掉 content 的空检查
// 期望失败：「上游返回空内容 → 不算成功」
```

**破坏 1 特别值钱** —— 它会让你亲眼看到"没有超时的请求会挂多久"。

---

# 第 3 步：输出审核（30 分钟）

## 3.1 越权承诺

```javascript
describe("输出审核", () => {
  test("越权承诺 → 转人工，用户看不到'已退款'", async () => {
    up.setMode("overpromise");
    const r = await client.call("/api/tickets", {
      method: "POST", body: { message: "东西坏了，能退吗" },
    });

    // 关键：不能让用户看到"已为您安排全额退款"
    assert.ok(!r.text.includes("已为您安排"), "❌ 越权承诺不能返回给用户");
    assert.ok(!r.text.includes("全额退款"), "❌ 越权承诺不能返回给用户");

    assertStatus(r, 202, "越权承诺应转人工");
    assert.ok(r.json.message, "必须给人话");
  });

  test("越权承诺的条目进了队列，标记 overpromise", async () => {
    up.setMode("overpromise");
    const r = await client.call("/api/tickets", { method: "POST", body: { message: "能退吗" } });
    const tid = r.json.trace_id;

    const list = await client.call("/api/tickets?limit=100");
    const row = list.json.data.find((t) => t.trace_id === tid);
    assert.ok(row, "应落库");
    assert.equal(row.route, "human");
  });
});
```

## 3.2 PII 自动修复

```javascript
describe("PII 处理", () => {
  test("模型把手机号写进摘要 → 被修掉，用户拿到干净内容", async () => {
    up.setMode("pii");
    const r = await client.call("/api/tickets", {
      method: "POST",
      body: { message: "我叫张伟，电话 13812345678，内胆裂了" },
    });

    // 关键：响应里不能有完整手机号
    assert.ok(!r.text.includes("13812345678"), "❌ 手机号不能被返回");
    assert.ok(!r.text.includes("1381234567"), "❌ 部分手机号也不行");

    // 但应该仍然给出可用的摘要
    if (r.status === 200) {
      assert.ok(r.json.data?.summary, "修掉 PII 后仍应有摘要");
      assert.ok(r.json.data.summary.length > 3, "摘要不能变成空字符串");
    }
  });

  test("PII 修复后，库里也不该有完整手机号", async () => {
    up.setMode("pii");
    const r = await client.call("/api/tickets", {
      method: "POST", body: { message: "电话 13812345678，东西坏了" },
    });

    const list = await client.call("/api/tickets?limit=100");
    const row = list.json.data.find((t) => t.trace_id === r.json.trace_id);

    // 注意：这是"库里也不该有"的严格版本
    // 如果你的设计是"库里存原文但加密"，这条要放宽
    assert.ok(!(row?.output ?? "").includes("13812345678"),
      "❌ 修复后的输出不该含完整手机号");
  });
});
```

## 3.3 一个必须想清的设计问题

**"库里存不存原文？"—— 这决定了第二条测试怎么写。**

```text
设计 A：库里存原文（plaintext）
  → 日志和库都有 PII
  → 需要加密 + 访问审计 + 定期清理
  → 测试：断言"output 里没有 PII"

设计 B：库里存脱敏版
  → 无法复现原始输入
  → 但合规最安全
  → 测试：断言"input 和 output 都没有 PII"

设计 C：input 存原文（加密），output 存脱敏
  → 折中（第 132 节推荐的）
  → 测试：断言"output 没有 PII，input 有但加密"
```

**你的选择要写进 `NOTES.md`，测试按你的设计写。**

---

# 第 4 步：第三层 · 系统内部错误（20 分钟）

## 4.1 制造一个真 bug

**加一个只在测试环境开放的接口：**

```javascript
// app/routes/debug.js
import { Router } from "express";
import { config } from "../config/index.js";
import { wrap } from "../middleware/error.js";

export const debugRouter = Router();

debugRouter.get("/debug/throw", wrap(async () => {
  if (!config.isTest) throw new Error("这个接口只在测试环境可用");
  throw new TypeError("故意抛的错，用来测试错误中间件");
}));

debugRouter.get("/debug/sql", wrap(async () => {
  if (!config.isTest) throw new Error("只在测试环境可用");
  // 故意抛一个带 SQL 的错误，验证它不会泄露
  throw new Error('SQLITE_ERROR: near "SELEC": syntax error in SELECT * FROM tickets');
}));

debugRouter.get("/debug/circular", wrap(async (req, res) => {
  if (!config.isTest) throw new Error("只在测试环境可用");
  const a = { name: "a" };
  a.self = a;
  res.json({ ok: true, data: a });    // 循环引用 → res.json 抛错
}));
```

**在 `app/index.js` 里挂上（仅测试/开发环境）：**

```javascript
if (config.isDev || config.isTest) {
  const { debugRouter } = await import("./routes/debug.js");
  app.use("/api", debugRouter);
}
```

## 4.2 三条测试

```javascript
describe("第三层：内部错误", () => {
  test("未预期的异常 → 500，但响应里没有堆栈", async () => {
    const r = await client.call("/api/debug/throw");

    assertStatus(r, 500);
    assert.equal(r.json.code, "INTERNAL");
    assert.ok(r.json.trace_id);

    // 关键：不能泄露内部信息
    assert.ok(!r.text.includes("TypeError"), "不能出现异常类型");
    assert.ok(!r.text.includes("故意抛的错"), "不能出现原始错误消息");
    assert.ok(!r.text.includes("at "), "不能有堆栈帧");
    assert.ok(!r.text.includes(".js"), "不能出现文件名");

    // 但 message 必须是统一的人话
    assert.equal(r.json.message, "处理失败了，我们会跟进");
  });

  test("含 SQL 的错误不泄露 SQL", async () => {
    const r = await client.call("/api/debug/sql");
    assertStatus(r, 500);
    assert.ok(!/SELECT/i.test(r.text), "❌ SQL 不能泄露");
    assert.ok(!/SQLITE/i.test(r.text), "❌ 数据库类型不能泄露");
    assert.ok(!/tickets/i.test(r.text), "❌ 表名不能泄露");
  });

  test("循环引用不会让进程崩溃", async () => {
    const r = await client.call("/api/debug/circular");
    // 可能返回 500（被兜住）或者 200（如果 res.json 有兜底）
    assert.ok([200, 500].includes(r.status), `实际 ${r.status}`);

    // 关键：服务还活着
    const h = await client.call("/health");
    assertStatus(h, 200, "❌ 一个请求的序列化失败不该拖垮整个服务");
  });
});
```

## 4.3 逐条解释两个设计

**① `assert.equal(r.json.message, "处理失败了，我们会跟进")` 精确断言**

**为什么这里可以精确断言？**

```text
因为这句话是"你写的常量"，不是"模型生成的"
→ 它应该永远一样
→ 如果有人改了它，测试失败 → 你会想"是有意的吗"
```

**这和"不断言 `category === "quality"`"不矛盾** —— 前者是你的代码，后者是模型输出。

**② "服务还活着"这条最重要**

```text
循环引用 → res.json 抛错 → 如果没兜底 → 进错误中间件 → 又 res.json → 又抛
→ 可能无限循环 → 进程 CPU 100% → 崩
```

**这条测试验证的是"你的兜底真的存在"。**

## 4.4 一个必须做的破坏实验

**删掉 `errorMiddleware` 里 `res.json` 的 try/catch：**

```javascript
// 原版
try {
  res.json(appErr.toJSON(traceId));
} catch (serializeErr) {
  res.status(500).type("text/plain").send("处理失败");
}

// 破坏：去掉 try/catch
res.json(appErr.toJSON(traceId));
```

**跑测试 → "循环引用不会让进程崩溃"应该失败（或者整个测试套件挂住）。**

---

# 第 5 步：统计你的错误路径覆盖率（15 分钟）

## 5.1 一个自查表

```bash
node --test test/ 2>&1 | tail -20
```

**然后填这个表：**

| 故障类型 | 有没有测试 | 断言了什么 |
|---|---|---|
| 输入空 / 超长 / 格式错 | | |
| 上游 500 | | |
| 上游 429 | | |
| 上游超时 | | |
| 上游空输出 | | |
| 上游 HTML 页 | | |
| 输出越权 | | |
| 输出含 PII | | |
| 内部异常 | | |
| 序列化失败 | | |
| 数据库错误 | | |
| 队列写入失败 | | |

**最后三行大概率是空的。**

**"数据库错误"怎么测？**

```javascript
// 临时把 DB 指向一个不可写的路径
// 或者在测试里 mock repo，让它抛错
```

**"队列写入失败"怎么测？**

```javascript
// 在 enqueue 里注入一个"第 N 次调用就抛错"的行为
```

**这两个的优先级不高**（因为它们失败的概率很低），**但你要知道它们没测。**

**写进 `TEST-PLAN.md` 的"明确不测"清单。**

## 5.2 一个数字目标

```text
错误路径测试条数 / 总测试条数 ≥ 1/3
```

**你的情况：**

```text
单元测试  45 条（大多是正常路径 + 边界）
接口测试  18 条（一半是 4xx）
错误测试  __ 条
──────────────
比例 = __ / (45 + 18 + __)
```

**如果低于 1/3，说明你测得太"顺"了。**

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **12 种故障类型，哪些有测试、哪些没有**
- **三个破坏实验各引起了什么**
- **超时测试的实测耗时**
- **"库里存不存原文"你的选择**

---

# 第 7 步：课后练习

## 练习一：给"队列满"写一条（25 分钟）

```text
场景：review_queue 里有 300 条待处理（超过 backlogLimit 200）
期望：新请求改变策略
  · 选项 A：只让 redo 类进队列，其余直接返回（带警告）
  · 选项 B：拒绝所有新请求（503）
  · 选项 C：继续入队（但记 error 日志）
```

**实现思路：**

```javascript
// 在 enqueue 前检查
const pending = countPending();
if (pending > config.review.backlogLimit) {
  log.error("queue_backlog", { pending });
  // 按你的策略处理
}
```

**测试：**

```javascript
test("队列积压超过阈值时，新请求不进队列", async () => {
  // 造 250 条 pending
  for (let i = 0; i < 250; i++) {
    await enqueue(db, { traceId: `tr_fill_${i}`, input: "x", output: null, reasons: ["low_confidence"] });
  }

  up.setMode("hang");              // 触发转人工
  const r = await client.call("/api/tickets", { method: "POST", body: { message: "东西坏了" } });

  // 按你的策略断言
  // 选项 A：返回 200（放行，不进队列）
  // 选项 B：返回 503
  // 选项 C：返回 202（还是进队列）
});
```

**这条测试会逼你做那个"降级决策"。**

## 练习二：测"日志里没有 PII"（20 分钟）

```javascript
test("出错时日志里不含手机号", async () => {
  up.setMode("pii");
  await client.call("/api/tickets", {
    method: "POST", body: { message: "电话 13812345678，东西坏了" },
  });

  // 等日志写盘
  await waitFor(() => true, { timeout: 200, interval: 50 });

  const fs = await import("node:fs");
  const logFile = fs.readdirSync("./logs/test").find((f) => f.startsWith("app-"));
  const content = fs.readFileSync(`./logs/test/${logFile}`, "utf8");

  assert.ok(!content.includes("13812345678"), "❌ 日志里不能有完整手机号");
});
```

**这条测试的价值：它会永远防止你在日志里加"调试用的完整输入"。**

## 练习三：判断这批错误测试错在哪（15 分钟）

```javascript
test("错误处理正常", async () => {
  const r1 = await fetch("/api/tickets", { method: "POST", body: "{}" });
  assert.ok(r1.status >= 400);

  const r2 = await fetch("/api/tickets/999");
  assert.ok(r2.status >= 400);
});
```

**错在哪？至少五条。**

**参考答案：**

```text
① assert.ok(status >= 400) → 400 和 500 都算"对"，但它们的含义完全不同
② 没验响应体的 code → 不知道该给用户什么提示
③ 没验 trace_id → 用户投诉时无法定位
④ 没验"不泄露堆栈/SQL" → 最严重的问题没测
⑤ 没有上游故障的测试 → 第二层完全缺失
⑥ 没有"被拦时不调用模型"的断言 → 白花钱发现不了
⑦ 没有耗时断言 → 超时没设也发现不了
```

**第 ① 条最典型。** `>= 400` 这个断言的意思是"只要出错了就算对" —— 而"出错的方式"才是你要验证的东西。

---

# 第 8 步：最终验收

## A. 第一层 · 输入错误

- [ ] 空消息 → 400 EMPTY_INPUT，**且模型未被调用**
- [ ] 超长 → 400 TOO_LONG，**且模型未被调用**
- [ ] 坏 JSON → 400 BAD_FORMAT
- [ ] body > 1MB → TOO_LONG
- [ ] 非法 id → 400 BAD_INPUT
- [ ] 错误响应无堆栈 / 无 SQL / 无绝对路径 / 无 node_modules

## B. 第二层 · 依赖失败

- [ ] 上游 500 → 不是 500，是 200 或 202
- [ ] 上游 429 → 同上
- [ ] 上游超时 → 202 + 人话 + **耗时 < 8 秒**
- [ ] 超时文案里没有技术词（timeout / ECONN）
- [ ] 超时文案里有"不要重复"或"2 小时"
- [ ] 上游空输出 → 不算成功
- [ ] 上游 HTML → 不算成功，**且不透传给用户**
- [ ] **超时的条目落库了，input 完整**

## C. 输出审核

- [ ] 越权承诺 → 202，**响应里没有"已为您安排"**
- [ ] 越权承诺的条目 `route=human`
- [ ] PII → 响应里没有完整手机号
- [ ] PII 修复后仍有可用摘要（不是空字符串）

## D. 第三层 · 内部错误

- [ ] 未预期异常 → 500 INTERNAL
- [ ] 响应里没有 TypeError / 原始消息 / 堆栈 / 文件名
- [ ] message 精确等于"处理失败了，我们会跟进"
- [ ] 含 SQL 的错误不泄露 SQL / SQLITE / 表名
- [ ] 循环引用不让进程崩，**服务还活着**

## E. 破坏实验

- [ ] 去掉超时 → 耗时断言失败
- [ ] 超时不落库 → 落库断言失败
- [ ] 空输出当成功 → 空输出断言失败
- [ ] 错误响应返回 stack → 泄露断言失败

## F. 覆盖率自查

- [ ] 填了 12 种故障类型的自查表
- [ ] 错误路径条数 / 总条数 ≥ 1/3
- [ ] "明确不测"的写进了 `TEST-PLAN.md`

## G. 提交

```bash
git add -A
git commit -m "第144节：错误路径测试，三层共XX条，4个破坏实验"
git push
```

---

## 本节课要能说出口的一句话

> **正常路径你不容易写错。错误路径才是 bug 聚集地 —— 而它占你代码的 10%，占你事故的 90%。**

---

# 附：常见问题速查

**Q：`assert.ok(r.status >= 400)` 为什么不行？**

A：**因为它把"400 参数错"和"500 我们出 bug 了"当成一回事。**

```text
400 → 用户该改输入
500 → 你该改代码

同样"出错了"，处理方式完全不同。断言必须区分。
```

**正确做法：`assert.equal(r.status, 400)` + `assert.equal(r.json.code, "EMPTY_INPUT")`。**

**Q：怎么测"上游超时"？`hang` 模式会等很久吗？**

A：**不会，只要你的超时生效。**

```text
hang 模式 → 上游永不响应
你的 firstByteTimeout = 2 秒（测试配置）
→ 2 秒后放弃 → 切备用（假上游也 hang）→ 再 2 秒 → 202
→ 总耗时约 4–5 秒
```

**如果测试跑了 30 秒** → 你的超时没生效 → 检查 `AbortSignal` 是否真的挂上了。

**Q：`assert.ok(ms < 8000)` 会不会在慢 CI 上随机失败？**

A：**会，所以要留足余量。**

```text
本地：超时 2 秒 → 实际 4–5 秒
断言 < 8 秒     → 有 3 秒余量

如果 CI 特别慢，改成 < 12000
但不要改成 < 60000 —— 那就测不出"超时没设"了
```

**Q：`/api/debug/*` 这些接口安全吗？**

A：**必须双重保护：**

```javascript
// ① 挂载时判断环境
if (config.isDev || config.isTest) app.use("/api", debugRouter);

// ② 每个 handler 里再判断一次
debugRouter.get("/debug/throw", wrap(async () => {
  if (!config.isTest) throw new Error("只在测试环境可用");
  ...
}));
```

**② 是"双保险"** —— 万一有人误改了挂载条件，handler 里还会拦。

**Q：怎么测"日志里没有 PII"？**

A：**读日志文件，grep。**

```javascript
const content = fs.readFileSync(logPath, "utf8");
assert.ok(!content.includes("13812345678"));
```

**注意要等日志写盘**（stream 是异步的）。用 `waitFor` 或加 200ms 延迟。

**Q：12 种故障类型，我只测了 8 种，够吗？**

A：**看你的"明确不测"清单。**

```text
数据库错误     → 概率极低，且失败时很明显（全部 500）
队列写入失败   → 概率极低
序列化失败     → 已测（循环引用那条）
```

**前两个不测可以接受，但要写清理由。** 不写理由，三个月后你会以为"我全测了"。

**Q：错误测试写完之后，`npm test` 跑多久？**

A：**目标 30 秒以内。**

```text
单元测试    约 1 秒
接口测试    约 5 秒
错误测试    约 15 秒（超时那几条各要 4–5 秒）
```

**如果超过 60 秒** → 检查有没有测试在等"真超时"（比如 `hang` + 没设短超时）。

**超时测试是慢的主因，但它们不能被砍掉** —— 那是唯一能验证"超时生效"的方法。
