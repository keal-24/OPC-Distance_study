# 第 129 节课：三层超时

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天只解决一件事：**别让用户干等。**
> 但这件事有三个层次，只做一层的人，用户还是干等。

**建议用时**：110 分钟
**你需要先完成**：第 128 节的 `reliable/fallback.js`
**今天要装**：什么都不用装

---

# 第 0 步：一个 30 秒的等待有多长（15 分钟）

## 0.1 先自己体验一次

```bash
# 起一个永不响应的假上游
node -e "
require('http').createServer((req,res)=>{ /* 什么都不做 */ }).listen(4001,()=>console.log('黑洞在 4001'));
"
```

然后访问你的页面，或者直接：

```bash
time curl -s http://localhost:4001/v1/chat/completions -X POST -d '{}' -H 'Content-Type: application/json'
```

**什么都别做，就等它。**

**你会在大约 8 秒的时候开始怀疑**：是不是我网络断了？是不是代码写错了？

**这就是用户等的感受。** 而且你至少还知道"在等什么"，用户什么都不知道。

## 0.2 你现在只有一个超时

```javascript
signal: AbortSignal.timeout(60_000)
```

**这个 60 秒的问题在哪：**

```text
情况一：上游立刻拒绝（ECONNREFUSED）→ 0.2 秒返回，没问题
情况二：上游 500 → 0.5 秒返回，没问题
情况三：上游收下请求然后慢慢想 → 你要等满 60 秒
情况四：上游收下请求然后卡死 → 你要等满 60 秒
```

**情况三、四占故障的 40%（第 128 节练习二你算过），而它们全部要你等 60 秒。**

## 0.3 三个层次

```text
① 连接超时（connect timeout）
   TCP 握手多久算不通
   典型值 3 秒
   → 防"这个域名根本连不上"

② 首字超时（first-byte timeout）
   发出请求后，多久没收到第一个字节就算失败
   典型值 8 秒
   → 防"接上了但上游卡住"

③ 总超时（total timeout）
   整件事多久必须结束
   典型值 30 秒
   → 防"一直慢慢吐字，永远不结束"
```

**三层的关系：**

```text
连接 3s < 首字 8s < 总 30s
```

**只要有任意一层没设，剩下两层就形同虚设：**

```text
只设总 30s → 上游卡在握手 → 用户等 30 秒       ← 今天要修的
只设首字 8s → 上游逐字吐 100 字/秒 → 用户等 30 秒 ← 也要修
三层都有   → 最坏 11 秒（3+8），用户还能接受     ← 目标
```

## 0.4 今天要产出的东西

```text
reliable/timeout.js     三层超时的 fetch 封装
reliable/graceful.js    超时之后的兜底响应（不是 500！）
reliable/test-timeout.js 四种故障的耗时验证
```

**`graceful.js` 是今天最容易被忽略、但用户能直接感知的那部分。**

---

# 第 1 步：写三层超时的 fetch（30 分钟）

## 1.1 Node 里没有"连接超时"

**这是个必须知道的事实：**

```text
浏览器 fetch  → 没有 connect timeout 配置项
Node fetch    → 同样没有（undici 有，但 fetch 封装没暴露）
AbortSignal.timeout(ms) → 只管"整个请求"
```

**所以要三层，只能自己拼：**

```javascript
// reliable/timeout.js
// 三层超时：连接 3s / 首字 8s / 总 30s

export async function fetchWithTimeout(url, init, opts = {}) {
  const {
    connectTimeout = 3_000,
    firstByteTimeout = 8_000,
    totalTimeout = 30_000,
    onEvent = () => {},
  } = opts;

  const t0 = Date.now();
  const ac = new AbortController();

  // ① 总超时：一路的兜底
  const totalTimer = setTimeout(() => {
    onEvent("total_timeout", { ms: Date.now() - t0 });
    ac.abort(new Error("total_timeout"));
  }, totalTimeout);

  // ② 首字超时：等第一块数据
  let firstByteTimer = setTimeout(() => {
    onEvent("first_byte_timeout", { ms: Date.now() - t0 });
    ac.abort(new Error("first_byte_timeout"));
  }, firstByteTimeout);

  // ③ 连接超时：用 undici 的自定义 dispatcher 需要额外依赖，
  //    这里用"更早的看门狗"近似 —— 如果 3 秒内连 response headers 都没拿到，说明连不上
  let connected = false;
  const connectTimer = setTimeout(() => {
    if (!connected) {
      onEvent("connect_timeout", { ms: Date.now() - t0 });
      ac.abort(new Error("connect_timeout"));
    }
  }, connectTimeout);

  try {
    const res = await fetch(url, { ...init, signal: ac.signal });

    // 拿到 headers = 连上了
    connected = true;
    clearTimeout(connectTimer);
    onEvent("connected", { ms: Date.now() - t0 });

    // ④ 关键：现在要等 body 的第一块
    //    fetch 返回 response 时，body 可能还没开始流
    //    如果只是 await res.json()，首字超时就没意义了
    if (!res.body) {
      clearTimeout(firstByteTimer);
      return { res, text: await res.text(), elapsed: Date.now() - t0, firstByteMs: null };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let firstByteMs = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (firstByteMs === null) {
        firstByteMs = Date.now() - t0;
        clearTimeout(firstByteTimer);          // 首字到了，撤掉这个看门狗
        onEvent("first_byte", { ms: firstByteMs });
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    clearTimeout(firstByteTimer);
    clearTimeout(totalTimer);

    return { res, text, elapsed: Date.now() - t0, firstByteMs };
  } catch (err) {
    clearTimeout(connectTimer);
    clearTimeout(firstByteTimer);
    clearTimeout(totalTimer);

    const name = String(err?.cause?.message ?? err?.message ?? "");
    const kind =
      name.includes("total_timeout") ? "total"
      : name.includes("first_byte_timeout") ? "first_byte"
      : name.includes("connect_timeout") ? "connect"
      : err?.name === "AbortError" ? "aborted"
      : "network";

    onEvent("abort", { kind, ms: Date.now() - t0 });
    const e = new Error(`fetch failed: ${kind}`);
    e.kind = kind;
    e.elapsed = Date.now() - t0;
    throw e;
  }
}
```

## 1.2 逐段解释四段关键代码

**① 为什么用 `AbortController` 而不是 `AbortSignal.timeout`**

`AbortSignal.timeout(ms)` 只能设一个时间点，你没法在中途"撤掉"它。

**而首字超时必须能撤掉** —— 第一块数据到了，这个看门狗就该关掉；否则它会在一分钟后把已经成功的请求打断。

`AbortController` 让你能手动 `clearTimeout` 任何一个看门狗，也能随时 `abort`。

**② 为什么"拿到 response headers"算连上了**

```text
TCP 握手 → 发请求 → 服务器处理 → 返回响应头 → 返回响应体
                     ↑
                  这里可能卡
                     ↑
拿到 headers 只能证明"服务器活着并开始回应了"
```

**所以 connectTimer 在拿到 headers 时清掉是对的。** 之后的"卡"是上游处理慢，属于首字超时该管的。

**③ 为什么必须手动读 `res.body`，不能 `await res.json()`**

**这是本节最技术性、也最容易做错的一点。**

```text
await res.json()  ← 一次性等完整个 body
                      如果上游逐字节慢慢吐，你会一直等
                      首字超时根本管不到

手动 reader.read() ← 每拿到一块就能检查
                      第一块到了就撤掉首字看门狗
                      总超时依然在管整个流程
```

**代价是你要自己拼字符串。** 但换来的是首字超时真的生效。

**④ 错误归因**

```javascript
const name = String(err?.cause?.message ?? err?.message ?? "");
```

`fetch` 抛的错里，真实原因藏在 `err.cause` 里（undici 的包装）。**只看 `err.message` 你会永远看到 `fetch failed`，分不清是哪一层超时。**

**这个 `err.cause` 的坑会让你调试两小时。**

## 1.3 一个必须验证的实验

```javascript
// reliable/test-timeout.js
import http from "node:http";
import { fetchWithTimeout } from "./timeout.js";

const modes = {
  ok: (res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }));
  },
  headers_slow: (res) => {
    // 20 秒后才返回响应头 → 应触发 connect_timeout
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    }, 20_000);
  },
  body_slow: (res) => {
    // 立刻返回响应头，但 20 秒后才吐第一个字节 → 应触发 first_byte_timeout
    res.writeHead(200, { "Content-Type": "application/json" });
    setTimeout(() => res.end("{\"x\":1}"), 20_000);
  },
  drip: (res) => {
    // 慢慢吐，每秒一个字节，共 40 秒 → 应触发 total_timeout
    res.writeHead(200, { "Content-Type": "application/json" });
    let i = 0;
    const t = setInterval(() => {
      res.write('{"slow":"' + "x".repeat(10) + i++ + '"}');
      if (i > 38) { clearInterval(t); res.end(); }
    }, 1000);
  },
  hang: () => { /* 永不响应 */ },
};

async function run(name, handler, port) {
  const srv = http.createServer((req, res) => handler(res));
  await new Promise((r) => srv.listen(port, r));

  const events = [];
  const t0 = Date.now();
  let outcome;
  try {
    const r = await fetchWithTimeout(
      `http://localhost:${port}/v1/chat/completions`,
      { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } },
      { onEvent: (e, d) => events.push(`${e}@${d.ms}ms`) }
    );
    outcome = `成功 ${r.elapsed}ms firstByte=${r.firstByteMs}ms`;
  } catch (e) {
    outcome = `失败 kind=${e.kind} ${e.elapsed}ms`;
  } finally {
    srv.close();
  }

  console.log(`${name.padEnd(14)} ${outcome}`);
  console.log(`               events: ${events.join(" → ")}`);
}

await run("正常",       modes.ok,          4010);
await run("响应头慢",   modes.headers_slow, 4011);
await run("body 慢",    modes.body_slow,   4012);
await run("滴灌",       modes.drip,        4013);
await run("黑洞",       modes.hang,        4014);
```

## 1.4 你应该看到的输出

```text
正常           成功 12ms firstByte=11ms
               events: connected@8ms → first_byte@11ms

响应头慢       失败 kind=connect 3012ms
               events: connect_timeout@3001ms → abort@3012ms

body 慢        失败 kind=first_byte 8012ms
               events: connected@6ms → first_byte_timeout@8004ms → abort@8012ms

滴灌           失败 kind=total 30011ms
               events: connected@5ms → first_byte@1005ms → total_timeout@30003ms → abort@30011ms

黑洞           失败 kind=connect 3008ms
               events: connect_timeout@3002ms
```

**五个都对，这一节的核心就做完了。**

**特别注意"响应头慢"和"黑洞"都归到 `connect`** —— 因为对用户来说它们是同一件事：**没接上**。这个归因是对的。

## 1.5 一个问题：`connect_timeout` 真的是 TCP 超时吗

**严格说不是。** 真正的 TCP 连接超时是内核参数（`tcp_syn_retries`），通常是 20–130 秒。

我们做的"3 秒没拿到响应头就放弃"，是**应用层的耐心值**，不是 TCP 超时。

**这个区别重要吗？**

```text
对用户：不重要。用户只知道"3 秒没反应就是不行"。
对调试：重要。如果你发现所有请求都在 3 秒挂，
       那不是"上游慢"，是"DNS 解析失败"或"防火墙丢包"——
       这两种，加长时间也没用。
```

**所以归因时要看分布：**

```text
connect 超时占 80% → 网络层问题（DNS / 防火墙 / 域名错）
first_byte 超时占 80% → 上游处理慢（模型排队 / 负载高）
total 超时占 80% → 输出太长（max_tokens 设太大，或者流式被关掉了）
```

**这个分布分析，比单个数字有用得多。** 第 132 节会把它做成日志里的一个维度。

---

# 第 2 步：超时之后给什么（25 分钟）★ 最容易被忽略

## 2.1 三种错误的兜底

```text
❌ 返回 500
   用户看到"Internal Server Error"，或者你的前端弹"请求失败"

❌ 返回空字符串
   用户看到一片空白，以为页面坏了

❌ 无限重试
   用户等到第 4 次超时，总共等了 2 分钟
```

**这三种都很常见，都不合格。**

## 2.2 正确的兜底：给人话 + 给确定性

```javascript
// reliable/graceful.js

export function gracefulResponse({ kind, traceId, elapsed }) {
  // 按超时类型给不同的文案 —— 因为原因不同，用户该知道的不同
  const map = {
    connect: {
      status: 503,
      message: "服务暂时连不上，我们已经在处理。",
      eta: "5 分钟内恢复",
      hint: "急事请直接回复本消息，会有同事接手。",
    },
    first_byte: {
      status: 504,
      message: "你的消息已经收到，但处理超时了。",
      eta: "我们会人工处理，2 小时内回复",
      hint: "不需要重复发送。",
    },
    total: {
      status: 504,
      message: "这条处理得比较久，已经转人工。",
      eta: "2 小时内回复",
      hint: "不需要重复发送。",
    },
    aborted: {
      status: 499,
      message: "请求已取消。",
      eta: null,
      hint: null,
    },
    network: {
      status: 503,
      message: "网络异常，请稍后重试。",
      eta: null,
      hint: "如果多次失败，请直接联系我们。",
    },
  };

  const m = map[kind] ?? map.network;

  return {
    status: m.status,
    body: {
      ok: false,
      reason: kind,
      message: m.message,
      eta: m.eta,
      hint: m.hint,
      // 给前端用的：不需要用户重试，后端已经在处理
      retryable: kind === "network",
      // 内部用：能定位到具体这次请求
      trace_id: traceId,
      elapsed_ms: elapsed,
    },
  };
}
```

## 2.3 四条文案规则

**① 说清"什么时候有结果"，不说"正在处理"**

```text
❌ "系统正在处理，请稍候"
✅ "2 小时内回复"
```

**"请稍候"是零信息。** 用户不知道该等 5 分钟还是 5 小时，所以他要么一直刷新，要么关掉走人。

**② 明确告诉用户"不要重复发送"**

```text
✅ "不需要重复发送"
```

**为什么这句必须有？**

因为超时的时候，用户的第一反应是再发一次。**然后你收到 3 条一样的请求，3 条都超时，用户更生气，而且你的队列被重复条目堵住。**

**这一句话能减少 40% 的重复提交。**

**③ 给一个兜底的人工通道**

```text
✅ "急事请直接回复本消息"
```

**因为"2 小时内回复"对急事来说太久了。** 你必须让"真的有急事"的人有出路，否则他会去投诉。

**④ 不要说技术名词**

```text
❌ "上游服务超时"、"网关错误"、"SQL 异常"
✅ "服务暂时连不上"、"这条处理得比较久"
```

**用户不关心你的架构。** 他只关心"我的事有没有人管"。

## 2.4 一个必须做的事：把超时条目写进队列

**超时不等于"这件事没发生"。** 它只是"这次自动处理失败了"。

```javascript
// 超时后必须做的三件事
async function onTimeout({ input, kind, traceId, elapsed }) {
  // ① 落库：让这条进入人工队列（第 131 节会消费它）
  await db.insert("review_queue", {
    trace_id: traceId,
    input,
    reason: `timeout_${kind}`,
    priority: kind === "connect" ? "high" : "normal",
    created_at: Date.now(),
  });

  // ② 打日志（第 132 节）
  await log.warn("timeout", { traceId, kind, elapsed });

  // ③ 如果是 connect 类型，触发健康检查告警
  if (kind === "connect") {
    await alert.notify("upstream_unreachable", { traceId });
  }
}
```

**关键：`input` 必须存下来。**

因为超时的时候模型什么都没返回，**这条客户消息的唯一副本就是你的 `input` 变量。** 不落库 = 这条消息丢了。

**这是本节最容易犯的严重错误。** 用户发了消息，你超时了，用户以为"系统在处理"，实际上你什么都没存，永远不会有人处理。

## 2.5 一个必须验证的事

```text
发一条会超时的消息 → 
  ① 用户看到"2 小时内回复"
  ② review_queue 表里有一条记录
  ③ 日志里有一条 timeout
  ④ 去 review_queue 里看，input 是完整的原话
```

**四条全对，才算做完。** 少了第 ④ 条，你就是在丢消息。

---

# 第 3 步：参数怎么定（20 分钟）

## 3.1 三个数字从哪来

**不要抄别人的 3/8/30。让你的数据决定。**

```javascript
// reliable/measure-latency.js
// 跑 30 条真实输入，记录首字和总耗时的分布
import { fetchWithTimeout } from "./timeout.js";

const lat = [];
for (const c of cases) {
  const r = await fetchWithTimeout(url, init, { onEvent: () => {} });
  lat.push({ first: r.firstByteMs, total: r.elapsed });
}

lat.sort((a, b) => a.total - b.total);
const p = (arr, q) => arr[Math.floor(arr.length * q)];

console.log("总耗时  P50", p(lat, 0.5).total, "P90", p(lat, 0.9).total, "P99", p(lat, 0.99).total);
const firsts = lat.map((x) => x.first).filter(Boolean).sort((a, b) => a - b);
console.log("首字    P50", p(firsts, 0.5), "P90", p(firsts, 0.9), "P99", p(firsts, 0.99));
```

**取值的规则：**

```text
首字超时 = P99 首字耗时 × 1.5
总超时   = P99 总耗时 × 1.5
连接超时 = 3 秒（固定，因为正常连接都在 100ms 内）
```

**为什么是 P99 而不是 P90？**

```text
取 P90 → 10% 的正常请求会被误判成超时 → 用户觉得系统不稳定
取 P99 → 1% 误判 → 可接受
```

**为什么乘 1.5？**

给你的正常波动留余量。**模型服务的高峰期比平均值慢 40% 很常见。**

## 3.2 一个具体的算例

假设你测出：

```text
首字：P50 = 800ms,  P90 = 2100ms,  P99 = 3800ms
总耗时：P50 = 3.2s,  P90 = 6.1s,  P99 = 11.5s
```

**那你的参数应该是：**

```text
connectTimeout    = 3000              （固定）
firstByteTimeout  = 3800 × 1.5 = 5700 → 取 6000
totalTimeout      = 11500 × 1.5 = 17250 → 取 18000
```

**注意：这比你想象的宽松得多。**

**很多人抄了"首字 3 秒"，结果 12% 的正常请求被判超时。**

## 3.3 一个必须考虑的取舍

```text
超时设短 → 故障时用户等得少，但正常请求被误杀
超时设长 → 正常请求不受影响，但故障时用户等很久
```

**这个取舍的正确答案是"看哪边更贵"：**

```text
如果把正常请求误判成超时 → 转人工 → 每条 1.5 分钟人工
  误杀率 10% × 1000 条/天 = 100 条 → 2.5 小时/天

如果故障时用户多等 20 秒 → 
  但故障每天只有 5 次 → 5 次 × 20 秒 = 100 秒/天
```

**所以宁可设长一点。** 100 秒 vs 2.5 小时，差距是 90 倍。

**唯一的例外是"用户会当场离开"的场景**（比如对话式产品）。**这时 30 秒就是太长了。**

## 3.4 一个必须做的差异化

```text
同步接口（用户在看）→ 总超时 15–30 秒
异步任务（后台跑）  → 总超时 5 分钟
流式接口（AI 输出） → 首字 8 秒，总 120 秒（因为流式本来就要很久）
```

**第 17 节你做过流式输出。** 那个接口如果用 30 秒总超时，长回答会被截断。

**同一个系统里，不同接口的超时应该不同。** 把这个写进配置：

```javascript
export const TIMEOUTS = {
  chat:    { connect: 3_000, firstByte: 8_000,  total: 30_000 },
  stream:  { connect: 3_000, firstByte: 8_000,  total: 120_000 },
  job:     { connect: 3_000, firstByte: 15_000, total: 300_000 },
  health:  { connect: 1_000, firstByte: 2_000,  total: 3_000 },   // 健康检查要短
};
```

---

# 第 4 步：接进链路（15 分钟）

## 4.1 和第 128 节的切换配合

```javascript
// reliable/call-resilient.js
import { fetchWithTimeout } from "./timeout.js";
import { classify, FAIL } from "./health.js";
import { gracefulResponse } from "./graceful.js";

export function makeCaller({ primary, backup, timeouts, log, db }) {
  return async function call(input, traceId) {
    const targets = [primary, backup];

    for (let i = 0; i < targets.length; i++) {
      const cfg = targets[i];
      const which = i === 0 ? "primary" : "backup";

      try {
        const { res, text, elapsed, firstByteMs } = await fetchWithTimeout(
          `${cfg.baseURL}/chat/completions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({
              model: cfg.model,
              temperature: 0,
              max_tokens: 400,
              messages: [
                { role: "system", content: cfg.prompt },
                { role: "user", content: input },
              ],
            }),
          },
          { ...timeouts, onEvent: (e, d) => log.debug(e, { ...d, traceId, which }) }
        );

        const kind = classify(null, res, text);
        if (kind === FAIL.EMPTY) throw Object.assign(new Error("empty"), { kind: FAIL.EMPTY });

        return { ok: true, text, which, elapsed, firstByteMs, traceId };
      } catch (e) {
        // 超时（connect / first_byte / total）→ 直接切备用，不重试
        if (e.kind === "connect" || e.kind === "first_byte" || e.kind === "total") {
          log.warn("timeout", { traceId, which, kind: e.kind, elapsed: e.elapsed });
          if (which === "backup") {
            // 备用也超时 → 落队列 + 给人话
            await db.insert("review_queue", {
              trace_id: traceId, input, reason: `timeout_${e.kind}`,
              priority: "high", created_at: Date.now(),
            });
            const g = gracefulResponse({ kind: e.kind, traceId, elapsed: e.elapsed });
            return { ok: false, ...g, traceId };
          }
          continue;   // 切备用
        }

        // 其他错误按第 128 节的分类处理
        log.warn("call_fail", { traceId, which, err: String(e.message).slice(0, 80) });
        if (which === "backup") {
          const g = gracefulResponse({ kind: "network", traceId, elapsed: 0 });
          return { ok: false, ...g, traceId };
        }
      }
    }
  };
}
```

## 4.2 一个设计决定：超时后要不要重试

```text
我的答案：不重试，直接切备用。

理由：
① 超时已经花了 3-8 秒，再重试一次 = 用户再等 3-8 秒
② 超时通常不是抖动（抖动一般是 100ms 级的），是上游真的卡了
③ 切备用能换一个上游，比在同一家重试有效
```

**唯一例外：`network` 类型（DNS 临时故障）可以重试一次。** 因为这种通常几秒内恢复。

## 4.3 必须验证的端到端场景

```text
① 正常 → 3 秒内出结果，用户看不到任何异常
② 主超时 → 11 秒内出结果（3 + 8），degraded=true
③ 主备都超时 → 用户看到"2 小时内回复"，review_queue 有记录
④ 主连不上 → 3 秒切备用，总共 4 秒出结果
```

**跑一遍这四条，把耗时记下来。** 这四个数字要写进 `NOTES.md`。

**因为它们是"你最坏情况下让用户等了多久"的答案。** 客户问"你们系统靠谱吗"，你答"最坏 11 秒，且一定会有人接手"。

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **五个故障场景的实测耗时和归因**
- **三个超时参数是怎么算出来的**（不是抄的）
- **超时后落库验证了吗**（input 完整吗）
- **四条端到端耗时**

---

# 第 6 步：课后练习

## 练习一：加一个"超时率看板"（20 分钟）

```text
每分钟统计：
  总请求数
  connect 超时数
  first_byte 超时数
  total 超时数
  超时率

规则：
  超时率 > 5% 持续 5 分钟 → 告警
  connect 超时率 > 2% → 立刻告警（因为这是网络层，不会自愈）
```

**为什么要分开看：**

```text
connect 超时率高 → 网络/DNS 问题，不会自己好
first_byte 超时率高 → 上游负载高，可能自己好
total 超时率高 → 输出太长，是你的参数问题
```

**三种问题的修法完全不同。合在一起看，你只知道"有问题"，不知道"修什么"。**

## 练习二：算清"超时参数"的经济影响（15 分钟）

```text
当前：首字 8 秒
如果改成 5 秒：
  正常请求误杀率从 1% 涨到 __%
  每天多 __ 条转人工
  每月多 ¥______
  故障时用户少等 3 秒 × ___ 次/天 = ___ 秒/天
```

**这个账算完你会发现：缩短超时几乎总是不划算的。**

**唯一的例外：你的用户是"高流失敏感"场景（比如注册流程）。** 那里每多 1 秒跳出率涨 7%。

## 练习三：判断这个设计错在哪（10 分钟）

```text
某人的方案：
  所有接口统一 totalTimeout = 60 秒
  超时后返回 { error: "timeout" }
  前端显示"请求超时，请重试"
```

**错在哪？至少四条。**

**参考答案：**

```text
① 只有一层，没有首字超时 → 上游卡在握手也要等 60 秒
② 60 秒对所有接口一样 → 流式输出会被截断，健康检查要 60 秒才报警
③ 返回 { error: "timeout" } 是技术话术，用户不知道该怎么办
④ "请重试"是错的 —— 超时的时候不该让用户重试（会重复提交）
⑤ 没有落库 → 这条消息丢了，没人会处理
```

**第 ⑤ 条最严重。** 用户以为"重试一下就好"，实际上第一次那条已经消失在超时的黑洞里了。

---

# 第 7 步：最终验收

## A. 三层超时跑了

- [ ] `fetchWithTimeout` 手动读 `res.body`，不是 `await res.json()`
- [ ] 三个 `setTimeout` 都用 `AbortController` 管理，能单独撤销
- [ ] 首字到了之后 `clearTimeout(firstByteTimer)`
- [ ] 错误归因读 `err.cause`，不是只读 `err.message`

## B. 五个故障场景全对

- [ ] 正常 → 成功，`firstByteMs` 有值
- [ ] 响应头慢 → `kind=connect`，约 3 秒
- [ ] body 慢 → `kind=first_byte`，约 8 秒
- [ ] 滴灌 → `kind=total`，约 30 秒
- [ ] 黑洞 → `kind=connect`，约 3 秒

## C. 兜底是人话

- [ ] 五种 kind 各有文案
- [ ] 有"什么时候有结果"（不是"请稍候"）
- [ ] 有"不需要重复发送"
- [ ] 有兜底人工通道
- [ ] 没有技术名词

## D. 超时后不丢消息

- [ ] `review_queue` 表里有记录
- [ ] 记录里的 `input` 是完整原话
- [ ] 日志里有一条 `timeout`
- [ ] `connect` 类型会触发告警

## E. 参数是自己算的

- [ ] 跑了 30 条真实输入，测出首字 P99 = __ ms
- [ ] 测出总耗时 P99 = __ ms
- [ ] 参数 = P99 × 1.5（写下计算过程）
- [ ] 不同接口用不同参数（chat / stream / job / health）

## F. 端到端四条

- [ ] 正常：__ 秒
- [ ] 主超时：__ 秒（应 ≈ 3 + 8 = 11 秒）
- [ ] 主备都超时：__ 秒，用户看到人话
- [ ] 主连不上：__ 秒（应 ≈ 4 秒）

## G. 提交

```bash
git add 每周课程/04-工程可靠性/第19周-可靠性与审核/第03节课 03-练习代码/reliable
git commit -m "第129节：三层超时，五场景全过，最坏等待XX秒"
git push
```

---

## 本节课要能说出口的一句话

> **超时的目的不是"让请求结束"，是"让用户知道该等多久、且这条消息不会丢"。**

---

# 附：常见问题速查

**Q：`connectTimeout` 到底是不是 TCP 超时？**

A：**不是。** 它是"多久没拿到响应头就放弃"，是应用层的耐心值。

真正的 TCP 超时是内核参数（`tcp_syn_retries`，通常 20–130 秒），你改不了也没必要改。

**但两者对用户是同一件事：没接上。** 所以归到 `connect` 是对的。

**调试时看分布：** 如果 connect 超时占 80%，那是 DNS 或防火墙问题，加长时间没用。

**Q：为什么不用 `AbortSignal.timeout`？**

A：因为它只能设一个点，不能中途撤销。

**首字超时必须能撤销** —— 第一块数据到了，这个看门狗就该关。不关的话，它会在 8 秒后把一个已经成功的请求打断。

**验证方法：** 用一个 10 秒才吐完（但首字 1 秒就到）的假上游，如果你看到"成功但中途断了"，就是这个 bug。

**Q：手动读 body 会不会比 `res.json()` 麻烦很多？**

A：三行代码：

```javascript
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value, { stream: true }); }
```

**代价是三行，换来首字超时真的生效。** 而首字超时是这一节最省钱的一行代码。

**Q：超时不落库会怎样？**

A：**这条客户消息彻底消失。**

用户发了 → 你超时了 → 用户看到"2 小时内回复" → 你什么都没存 → 永远没人处理 → 用户 2 小时后更生气。

**这是本节最严重的错误，而且它不会报错、不会告警、不会有人在日志里看到。** 只有用户来投诉的时候你才会知道。

**Q：超时后让用户重试，不是更简单吗？**

A：**不行，两个原因：**

```text
① 超时说明上游有问题，重试大概率还是超时 → 用户白等
② 如果上游其实处理成功了（只是响应慢），重试 = 重复处理
   （比如重复扣费、重复发通知）
```

**正确做法：这次不重试，落队列，让人工接手。** 这样既不重复，也不丢。

**Q：怎么知道"总超时 30 秒"对用户来说是不是太长？**

A：**看你的场景：**

```text
对话式（用户盯着屏幕）  → 15 秒已经很难受，超过就开始怀疑
表单提交（点一下就走）  → 30 秒可接受
后台任务（转圈后台跑）  → 5 分钟都可以
```

**有一个简单的测试：你自己盯着 loading 动画等 30 秒。** 如果在 10 秒时你就想刷新，那用户也想。

**Q：不同接口用不同超时，配置怎么组织？**

A：一张表 + 一个按接口名查的函数：

```javascript
export const TIMEOUTS = { chat: {...}, stream: {...}, job: {...}, health: {...} };
export const t = (name) => TIMEOUTS[name] ?? TIMEOUTS.chat;
```

**关键：调用时显式传接口名。** 用默认值的人，最后所有接口都会变成 `chat` 的参数。
