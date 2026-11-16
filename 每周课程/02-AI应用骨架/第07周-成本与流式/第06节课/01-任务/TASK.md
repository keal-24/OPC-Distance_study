# 第 48 节课：中断与超时——停了前端不等于停了账单

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你做出了打字机。用户很满意，直到他点了一次"停止"。
> 今天解决一个最贵的 bug：**用户点了停止，你的钱还在流。**

**建议用时**：140 分钟
**你需要先完成**：第 47 节课（流式能跑，前端有停止按钮）

---

# 第 0 步：先看清这条链路（10 分钟）

## 0.1 一次完整的中断要跨五段

```text
[浏览器] --abort--> [你的服务] --abort--> [上游模型]
   ↑                     ↑                    ↑
 前端停止渲染          连接关闭事件         停止生成
```

**五段里任何一段没接上，钱就白花了。**

| 情况 | 前端 | 服务 | 上游 | 结果 |
|---|---|---|---|---|
| 只做前端 | ✅ | ❌ | ❌ | 用户看不到，但全额付费 |
| 做了前端+服务 | ✅ | ✅ | ❌ | 服务停了，上游还在跑 |
| 三段都做 | ✅ | ✅ | ✅ | 真的省下 |

**今天的核心就是让这三段真的连起来。**

## 0.2 你现在有哪一段

**第 47 节你已经写了：**

```javascript
req.on("close", () => {
  clientClosed = true;
  abortController.abort();
});
```

**这段代码看起来对。但它真的让上游停了吗？**

**大多数情况：没有。** 原因有四个，今天逐个验证。

## 0.3 为什么这是最贵的一课

**假设：**

```text
一天 5000 次流式调用
其中 15% 被用户中途停止
停止时平均已生成 60% 内容
```

**如果中断没生效：**

```text
你为 750 次 × 60% 的内容付了全款
= 750 × 0.006 元 = 4.5 元/天 = 135 元/月
```

**看起来不多。但如果你的输出单价是 0.12 元/千 token（强模型）：**

```text
750 次 × 800 token × 0.12/1000 × 60% = 43 元/天 = 1300 元/月
```

**一个月白扔 1300 元。** 这不是小钱。

## 0.4 今天的交付物

| 文件 | 位置（都在 `token-lab` 里） | 内容 |
|---|---|---|
| `src/llm.js` | `src/` | `chatStream` 改成 `getReader` 版，支持真中断 |
| `src/app.js` | `src/` | 三段式中断 + 部分记账 |
| `experiments/e06-abort.js` | `experiments/` | 命令行验证上游真的停了 |
| `results/e06.md` | `results/` | 中断前后对比 |

---

# 第 1 步：先证明"上游真的停了"（30 分钟）

## 1.1 假模型已经埋好了探测器

**打开 `src/mock-llm.js`，找到这段：**

```javascript
    const chars = [...replyText];
    let closed = false;
    req.on("close", () => {
      closed = true;
      console.log(`[mock] 客户端断开，已发出 ${chars.length} 字`);
    });
```

**问题：这个日志只在 `closed` 时才打，但它打的是 `chars.length`（总字数），不是"已发出多少"。**

**先修这个日志，让它能准确告诉你"发了几个字就被断了"。**

**改成：**

```javascript
    const chars = [...replyText];
    let sent = 0;
    let closed = false;

    req.on("close", () => {
      closed = true;
      console.log(`[mock] 客户端断开：已发出 ${sent}/${chars.length} 字`);
    });

    for (const char of chars) {
      if (closed) break;
      writeChunk(res, { ... });
      sent += 1;
      await sleep(60);
    }

    if (!closed) {
      console.log(`[mock] 正常结束：发出 ${sent}/${chars.length} 字`);
      // ... 原结束逻辑
    }
```

**为什么这个日志是判据：**

```text
打印 "已发出 5/40 字"  → 真的停了（上游只生成了 5 个）
打印 "正常结束 40/40"  → 没停（你白花了 35 个字）
```

**没有这个日志，你所有的"我做了中断"都是猜。**

## 1.2 写验证脚本

**新建 `experiments/e06-abort.js`：**

```javascript
import { chatStream } from "../src/llm.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (label, { abortAfterMs, abortAfterChars }) => {
  const controller = new AbortController();
  const started = Date.now();

  let received = 0;
  let chars = 0;
  let aborted = false;

  const timer =
    abortAfterMs != null
      ? setTimeout(() => {
          aborted = true;
          controller.abort();
        }, abortAfterMs)
      : null;

  try {
    for await (const piece of chatStream(
      [{ role: "user", content: "请用三百字介绍流式输出的好处。" }],
      { signal: controller.signal, temperature: 0.7, maxTokens: 500 }
    )) {
      if (piece.done) {
        console.log(`\n[${label}] 正常结束`);
        console.log(`  包数：${received}　字数：${chars}　耗时：${Date.now() - started}ms`);
        break;
      }

      received += 1;
      chars += [...piece.text].length;

      if (abortAfterChars && chars >= abortAfterChars && !aborted) {
        aborted = true;
        controller.abort();
      }
    }
  } catch (error) {
    console.log(`\n[${label}] 被中断`);
    console.log(`  包数：${received}　字数：${chars}　耗时：${Date.now() - started}ms`);
    console.log(`  错误名：${error.name}　消息：${error.message}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const main = async () => {
  console.log("=== 实验 1：不中断，跑完 ===");
  await run("完整", {});

  await sleep(500);

  console.log("\n=== 实验 2：收到 5 个字就中断 ===");
  await run("中断5字", { abortAfterChars: 5 });

  await sleep(500);

  console.log("\n=== 实验 3：3 秒后中断 ===");
  await run("3秒中断", { abortAfterMs: 3000 });
};

main().catch((error) => {
  console.error("跑挂了：", error.message);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "e06": "node --env-file=.env experiments/e06-abort.js"
```

## 1.3 跑，然后看两个终端的日志

**终端 A（假模型）：**

```text
npm run mock
```

**终端 B：**

```text
npm run e06
```

**你要看的是终端 A 的输出。**

### 情况一：假模型打出"客户端断开：已发出 5/40 字"

**恭喜，你的中断是真的。**

**上游在发出 5 个字后就被断了，剩下的 35 个字没生成 —— 也没花钱。**

### 情况二：假模型打出"正常结束：发出 40/40 字"

**你的中断是假的。**

**用户看不到字，但你的服务把整段都收完了。**

**这就是最贵的 bug。**

## 1.4 为什么 `for await` 上的 abort 可能不生效

**这就是本节最重要的技术点。**

**`for await (const chunk of response.body)` 有一个已知行为：**

```text
当你在循环内部 break 或抛出异常时，
for await 会调用 response.body.cancel()，
但**不保证**立即停止底层的网络读取。
```

**换句话说：**

```javascript
for await (const piece of chatStream(...)) {
  if (shouldStop) break;    // 这个 break 不一定会让上游停
}
```

**而且你现在的 `chatStream` 内部是 `for await`，外面 abort 时，里面的循环未必退出。**

**必须换成 `getReader()` + 显式 `cancel()`。**

## 1.5 改成 `getReader` 版

**把 `chatStream` 里 `for await (const chunk of response.body)` 那一段换掉：**

```javascript
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
  let usage = null;
  let finishReason = null;
  let cancelled = false;

  // 关键：信号触发时主动 cancel
  const onAbort = () => {
    cancelled = true;
    reader.cancel().catch(() => {});
  };

  if (signal) {
    if (signal.aborted) {
      await reader.cancel().catch(() => {});
      throw new LlmError("请求已取消", "调用前已 abort", 499);
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    while (true) {
      if (cancelled) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // ... 原来的解包逻辑（按 \n\n 切、yield）...

      if (shouldFinish) break;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);

    if (cancelled) {
      throw new LlmError("请求已取消", "调用方中断", 499);
    }
  }
```

**四个关键点：**

### 关键点一：`reader.cancel()` 是真正的停止

**`reader.cancel()` 会：**

```text
① 通知底层网络层停止拉取
② 关闭连接（HTTP/1.1 里就是关 socket）
③ 上游收到连接关闭，停止生成
```

**这是唯一可靠的"真的停"的手段。**

### 关键点二：`signal.addEventListener("abort", onAbort)`

**为什么不只靠 `reader.read()` 抛错：**

**`fetch` 的 signal 触发了，`reader.read()` 在下一轮会抛 `AbortError`。**

**但它要等到"下一次读"，中间可能有延迟。**

**主动 `cancel()` 是"立刻"。**

**两者都做，最保险。**

### 关键点三：`{ once: true }` 和 `removeEventListener`

**`once: true` 保证它只执行一次（多触发会导致多次 `cancel`）。**

**`finally` 里 `removeEventListener` 是防内存泄漏：**

```text
每次调用都往 signal 上加监听器
signal 复用时（比如多轮对话共享一个 controller）会累积
几十次之后，一次 abort 会触发几十个监听器
```

**这个泄漏很隐蔽，但在长连接场景里会爆。**

### 关键点四：`cancelled` 之后抛 499

**为什么要抛：**

```text
让上层知道"这次是用户取消的，不是上游坏了"
→ 记 499 而不是 502
→ 报表里能分开统计
```

**不抛的话，上层会以为"正常结束"，然后记一次 `ok: true` 的账 —— 而实际上只收了一半内容。**

## 1.6 再跑一次验证

```text
npm run e06
```

**这次假模型应该打出"已发出 5/40 字"。**

**并且 `chatStream` 抛出 `LlmError`，`statusCode: 499`。**

**你刚刚把一段白花的钱省下来了。**

---

# 第 2 步：三段式中断的完整实现（30 分钟）

## 2.1 前端：`AbortController` + 清理

**第 47 节你已经写了 `controller.abort()`。检查三个细节：**

```javascript
const stopBtn = document.getElementById("stop");
stopBtn.addEventListener("click", () => {
  if (controller) controller.abort();
});
```

**问题一：用户可能连点**

**`abort()` 可以多次调用（幂等）。** 不是大问题，但要在 `finally` 里 `controller = null`。

**问题二：请求完成后 `controller` 没清**

```javascript
} finally {
  setRunning(false);
  controller = null;   // 必须有
}
```

**不清的话，下次点停止会 abort 一个已完成的请求 —— 多数情况无害，但日志里会出现莫名的 499。**

**问题三：页面关闭时也要中断**

```javascript
window.addEventListener("beforeunload", () => {
  if (controller) controller.abort();
});
```

**为什么：**

**用户关标签页，浏览器会自动断连接。但显式 abort 能保证请求立刻被取消，而不是等浏览器的清理。**

**这一条在实际效果上差别不大，但在某些浏览器/网络环境下有意义。**

## 2.2 服务端：三层检查

**改 `src/app.js` 的流式接口：**

```javascript
app.post("/api/chat/stream", async (req, res) => {
  const { message, userId } = req.body ?? {};

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message 必填" });
    return;
  }

  const requestId = newRequestId();
  const started = Date.now();
  const abortController = new AbortController();

  let clientClosed = false;
  let sentChars = 0;
  let lastUsage = null;

  // --- 第一层：Node 层的连接关闭 ---
  req.on("close", () => {
    if (clientClosed) return;      // 防重复
    clientClosed = true;
    abortController.abort();
    console.log(`[stream] close 事件 requestId=${requestId} 已发 ${sentChars} 字`);
  });

  // --- 第二层：响应层的关闭（有些场景 close 不触发，closed 会）---
  res.on("close", () => {
    if (clientClosed) return;
    clientClosed = true;
    abortController.abort();
    console.log(`[stream] res.close requestId=${requestId} 已发 ${sentChars} 字`);
  });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (event, data) => {
    if (clientClosed) return false;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  };

  try {
    for await (const piece of chatStream(
      [{ role: "user", content: message }],
      {
        signal: abortController.signal,
        feature: "chat-stream",
        userId,
        requestId,
      }
    )) {
      if (clientClosed) break;

      if (piece.done) {
        lastUsage = piece.usage;

        const cost = calcCost({
          model: CONFIG.llm.model,
          promptTokens: piece.usage.promptTokens,
          completionTokens: piece.usage.completionTokens,
        });

        record({
          userId,
          feature: "chat-stream",
          requestId,
          model: CONFIG.llm.model,
          promptTokens: piece.usage.promptTokens,
          completionTokens: piece.usage.completionTokens,
          cost: cost.total,
          ms: Date.now() - started,
          ok: true,
          status: 200,
          truncated: piece.truncated,
          estimated: piece.usage.estimated,
          stream: true,
        });

        send("done", {
          usage: piece.usage,
          finishReason: piece.finishReason,
          truncated: piece.truncated,
          ms: Date.now() - started,
        });

        break;
      }

      if (send("delta", { text: piece.text })) {
        sentChars += [...piece.text].length;
      }
    }
  } catch (error) {
    const aborted = clientClosed || error.statusCode === 499 || error.name === "AbortError";

    // 关键：中断也要记账，cost 按"已生成的字符"估
    if (aborted) {
      const promptTokens = estimateTokens(message);
      const completionTokens = estimateTokens(String(sentChars));

      record({
        userId,
        feature: "chat-stream",
        requestId,
        model: CONFIG.llm.model,
        promptTokens,
        completionTokens,
        cost: calcCost({
          model: CONFIG.llm.model,
          promptTokens,
          completionTokens,
        }).total,
        ms: Date.now() - started,
        ok: false,
        status: 499,
        errCode: "ABORTED",
        estimated: true,
        stream: true,
      });

      console.log(
        `[stream] 中断记账 requestId=${requestId} 已发 ${sentChars} 字 ` +
          `估算 ${completionTokens} token`
      );
    } else {
      record({
        userId,
        feature: "chat-stream",
        requestId,
        model: CONFIG.llm.model,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        ms: Date.now() - started,
        ok: false,
        status: error.statusCode || 502,
        errCode: "UPSTREAM",
        stream: true,
      });

      send("error", { message: error.userMessage || "服务暂时不可用" });
    }
  } finally {
    if (!clientClosed) {
      try {
        res.end();
      } catch {
        // 已经断开，忽略
      }
    }
  }
});
```

## 2.3 五个关键点

### 关键点一：同时监听 `req.on("close")` 和 `res.on("close")`

**为什么两个都要：**

```text
req close  → 客户端断开请求
res close  → 响应对象被关闭
```

**大部分情况两者同时触发，但顺序不一定。**

**在某些场景（比如客户端半关闭、或者上层中间件介入），只有一个会触发。**

**两个都监听，加 `if (clientClosed) return` 去重。**

**这是实战经验：只监听一个，你会遇到"偶尔不中断"的诡异情况。**

### 关键点二：`send` 要能失败而不抛

```javascript
  const send = (event, data) => {
    if (clientClosed) return false;
    try {
      res.write(...);
      return true;
    } catch {
      return false;
    }
  };
```

**为什么：**

**客户端断开后，`res.write` 会抛 `ERR_STREAM_WRITE_AFTER_END` 或 `ERR_STREAM_DESTROYED`。**

**不 catch，这个错误会冒到 `for await` 里，被当成"上游错误"，记成 502。**

**结果是：用户取消的调用被记成"服务故障"，你的错误率报表是假的。**

### 关键点三：中断时按"已发字符数"估算成本

```javascript
const completionTokens = estimateTokens(String(sentChars));
```

**为什么用 `sentChars` 而不是"收到的字数"：**

**因为你收到但没发出去的，上游也生成了（已经花钱了）。**

**严格说，应该按"上游已生成的字数"算，但那个数你拿不到（连接已断）。**

**用"已发给用户的字数"做下界估计，是合理的近似。**

**重要的不是精确，而是"知道有这一笔，并且记下来"。**

### 关键点四：`estimated: true` 必须标

**因为这是估算值，不是上游报的。**

**报表里要能区分"真账"和"估算账"。** 否则你的月度成本会不准确而你不知道为什么。

### 关键点五：`ok: false, status: 499`

**499 不是错误，是"用户取消"。**

**但它确实消耗了钱，所以不能记 `ok: true`（会污染成功率统计）。**

**正确做法：**

```text
ok: false          → 不计入成功
status: 499        → 单独统计"取消数"
errCode: ABORTED   → 和真正的上游错误分开
```

**报表里三个数并列：**

```text
成功 4820　取消 150　失败 30
```

**这才是能看的报表。**

## 2.4 一个必须处理的边界：`abort` 之后上游可能已经返回了 usage

**场景：**

```text
模型刚好生成了最后一块，同时发了 usage
你在同一个 tick 里 abort
→ usage 已经在你手里，但 cancelled = true
→ 你的 chatStream 抛 499，usage 丢了
```

**这会让你"少记"一笔已经发生的成本。**

**修法：在抛之前，把 usage 带在错误对象上。**

```javascript
    if (cancelled) {
      const error = new LlmError("请求已取消", "调用方中断", 499);
      error.partialText = fullText;
      error.partialUsage = usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            estimated: false,
          }
        : null;
      throw error;
    }
```

**然后在 `app.js` 里：**

```javascript
      const usedUsage = error.partialUsage || {
        promptTokens: estimateTokens(message),
        completionTokens: estimateTokens(String(sentChars)),
        estimated: true,
      };
```

**这个细节能把你中断记账的准确度从"差 20%"提到"差 2%"。**

---

# 第 3 步：超时的三种，必须分清（25 分钟）

## 3.1 三种超时

| 类型 | 什么超时 | 怎么设 | 症状 |
|---|---|---|---|
| **连接超时** | TCP/HTTP 建连 | 通常 5-10 秒 | 一直"连接中" |
| **首字超时** | 请求发出到第一个 token | 15-30 秒 | 上游卡住不吐字 |
| **总时长超时** | 从请求到结束 | 60-180 秒 | 长文本生成被掐断 |

**`AbortSignal.timeout(ms)` 是"总时长超时"。**

**它的问题：**

```text
设 60 秒 → 生成 3000 字的任务会被误杀
设 180 秒 → 上游卡死时用户等 3 分钟
```

**两个都错。**

## 3.2 正确做法：首字超时 + 空闲超时

**新建 `src/timeout.js`：**

```javascript
/**
 * 组合三种超时：
 * - firstByteMs：从开始到"第一个包"的时限
 * - idleMs：两个包之间的最长间隔
 * - totalMs：总时长硬上限（防止无限生成）
 */
export const createStreamTimer = ({ firstByteMs = 20000, idleMs = 30000, totalMs = 180000, onTimeout }) => {
  let startedAt = Date.now();
  let lastActivityAt = Date.now();
  let gotFirstByte = false;
  let fired = null;

  const check = () => {
    if (fired) return;

    const now = Date.now();

    if (now - startedAt > totalMs) {
      fired = "total";
      onTimeout("total", `总时长超过 ${totalMs}ms`);
      return;
    }

    if (!gotFirstByte && now - startedAt > firstByteMs) {
      fired = "first";
      onTimeout("first", `${firstByteMs}ms 内没有收到第一个字`);
      return;
    }

    if (gotFirstByte && now - lastActivityAt > idleMs) {
      fired = "idle";
      onTimeout("idle", `${idleMs}ms 没有新数据`);
    }
  };

  const timer = setInterval(check, 1000);

  return {
    onChunk() {
      gotFirstByte = true;
      lastActivityAt = Date.now();
    },
    stop() {
      clearInterval(timer);
    },
    get fired() {
      return fired;
    },
  };
};
```

## 3.3 接进 `app.js`

```javascript
import { createStreamTimer } from "./timeout.js";

// 在接口里
const timerState = createStreamTimer({
  firstByteMs: 20000,
  idleMs: 30000,
  totalMs: 180000,
  onTimeout: (kind, reason) => {
    console.log(`[stream] 超时（${kind}）：${reason} requestId=${requestId}`);
    abortController.abort();
  },
});

try {
  for await (const piece of chatStream(...)) {
    if (clientClosed) break;

    if (!piece.done) {
      timerState.onChunk();
      // ... send delta
    }
    // ...
  }
} finally {
  timerState.stop();
  // ...
}
```

## 3.4 为什么 `setInterval` 而不是 `setTimeout`

**因为 `setTimeout` 只触发一次。**

**你需要"每收到一块就重新计时"，这用 `setInterval` + 判断"距上次活动多久"实现最简洁。**

**比反复 `clearTimeout` + `setTimeout` 干净。**

## 3.5 五个数字要记住

```text
firstByteMs  20000   用户最多等 20 秒出第一个字
idleMs       30000   中间卡 30 秒就断
totalMs      180000  再长也不能超 3 分钟
```

**为什么首字 20 秒：**

**人等待的忍耐极限大约是 10-15 秒（超过就开始怀疑）。20 秒是"绝对出问题了"的边界。**

**为什么空闲 30 秒：**

**正常流式的间隔是 20-80ms。超过 5 秒就已经不正常了。30 秒是"确定死了"。**

**为什么总时长 3 分钟：**

**一个 2000 字的回答，按 30 字/秒算要 67 秒。3 分钟够用，同时能防住"无限生成"。**

## 3.6 验证超时

**用假模型的 `慢` 触发词（延迟 8 秒）。**

**把 `firstByteMs` 临时改成 3000，看是不是 3 秒就断了。**

**然后看假模型的日志：应该是"已发出 0/40 字"，或者"已发出 2/40 字"。**

**这证明超时也真的停了上游。**

---

# 第 4 步：五个必须知道的坑（20 分钟）

## 坑 1：以为 `for await` 的 break 会停止上游

**见 1.4。这是本节最核心的认知。**

**`for await` 在 `break` 时会调用 `return()`，进而调用 `cancel()`。**

**但：**

```text
① chatStream 是你的 async generator，它的 return() 未必继续往下传
② 即使传到了，时机也不确定
③ 有些 Node 版本/上游组合下，cancel 不会真正关闭 socket
```

**所以必须显式 `reader.cancel()`。**

**验证方式：看假模型的日志。这是唯一可信的判据。**

## 坑 2：`req.on("close")` 在 Express 里有时不触发

**在 Express 里，`req` 是一个包装过的对象。**

**某些中间件（`body-parser`、`express.json`）会在请求体读完后，让 `req` 流提前结束。**

**`req.on("close")` 可能在这种情况下不触发。**

**所以必须同时监听 `res.on("close")`。**

**这是实战踩出来的。** 只监听一个，你会遇到"客户端断开，但服务端不知道"。

## 坑 3：`res.write()` 在断开后抛错

**见 2.3 关键点二。**

**不 catch 的后果：**

```text
用户取消 → res.write 抛错 → 被 catch 成"上游错误" → 记 502
→ 你的错误率报表里全是"上游故障"，实际全是用户取消
```

**这个错误会让你误判整个系统的健康状况。**

## 坑 4：中断后 `finally` 里又 `res.end()`

```javascript
} finally {
  if (!clientClosed) res.end();    // 必须有这个判断
}
```

**客户端已断开时 `res.end()` 会抛 `ERR_STREAM_DESTROYED`。**

**这个错会冒到 Express 的错误处理，产生一条噪音日志。**

**虽然不致命，但会让你的日志文件里全是这种错，掩盖真正的问题。**

## 坑 5：以为中断了就不花钱

**真相：**

```text
已生成的 token 已经花掉了
中断只是不再生成后面的
```

**所以：**

```text
用户看到 60 个字就点停止
你已经为 60 个字付了钱
```

**这不是 bug，是事实。**

**你要做的是"记下来"，而不是"假装没有"。**

**这也解释了为什么"让用户尽早看到字"很重要：他越早决定停，你越省。**

---

# 第 5 步：故意做五个实验（20 分钟）

## 实验 1：去掉 `reader.cancel()`

**把 `onAbort` 改成空函数（只设 `cancelled = true`）。**

**跑 `e06`，看假模型的日志。**

**大概率是"正常结束 40/40"。**

**这就是"只标记不取消"的后果。**

## 实验 2：只监听 `req.on("close")`

**删掉 `res.on("close")` 那段。**

**在浏览器里点停止，看服务端有没有打印"close 事件"。**

**大概率有时有、有时没有。** 这就是必须监听两个的理由。

## 实验 3：`send` 不加 try/catch

**跑一次"点停止"。**

**看服务端日志里是不是出现 `ERR_STREAM_WRITE_AFTER_END`，并且被记成了 502。**

**改回来。**

## 实验 4：不记中断的账

**注释掉中断分支里的 `record`。**

**跑几次中断，然后 `npm run report --by=day`。**

**看总成本是不是比实际花费低。**

**这个差额就是你在漏记的钱。**

## 实验 5：把 `firstByteMs` 设成 1000

**用假模型的 `慢` 触发词（8 秒延迟）。**

**看是不是 1 秒就断了，并且假模型打出"已发出 0/40 字"。**

**这证明超时也真的停了上游。**

---

# 第 6 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 三次 `e06` 实验里假模型的日志原文（这是本节的判据）
2. 改成 `getReader` 前后假模型日志的差别
3. 你的三个超时值，以及依据
4. 「卡在哪」

---

# 第 7 步：课后练习

## 练习一：把 `partialUsage` 接上

**要求：** 按 2.4 实现，`chatStream` 抛错时带 `partialUsage`，`app.js` 优先用它。

**验证：** 在假模型里加一个"发完最后一个 chunk 立刻断开"的模式，看记账准不准。

## 练习二：加"取消率"统计

**要求：** `report.js` 加一列 `取消数` 和 `取消率`。

**判断标准：**

```text
取消率 < 5%   → 正常
取消率 5-15%  → 用户不耐烦，可能是 TTFT 太长
取消率 > 15%  → 内容质量或速度有问题，要查
```

**这个指标比"错误率"更能反映真实体验。**

## 练习三：算"中断省了多少钱"

**要求：** 在报表里加一行：

```text
本月中断 420 次，平均每次中断时已生成 55% 内容
估算省下：420 × 单次全量成本 × 45% = ___ 元
```

**这个数字可以用来向客户证明"我们做了成本优化"。**

## 练习四：做一次"不中断"的对照

**要求：** 临时去掉所有中断逻辑，跑 20 次"3 秒后停止"的实验。

**对比：**

```text
有中断：总成本 = ？
无中断：总成本 = ？
```

**写进 `results/e06.md`。**

## 练习五：想清楚这四个问题

```text
1. 为什么 for await 的 break 不保证停止上游？
2. 为什么 req.close 和 res.close 都要监听？
3. 为什么中断也要记账，而且用估算值？
4. 三种超时，哪一种最容易被忽略？
```

---

# 第 8 步：最终验收

## A. 代码

- [ ] `chatStream` 用 `getReader()` + `reader.cancel()`
- [ ] `signal` 上加了 `abort` 监听，`finally` 里 remove
- [ ] 中断时抛 `LlmError`，`statusCode: 499`
- [ ] 中断时带 `partialUsage`（如果拿得到）
- [ ] `app.js` 同时监听 `req.close` 和 `res.close`
- [ ] `send` 有 try/catch
- [ ] 中断也记账，标 `status: 499, estimated: true`
- [ ] `finally` 里 `if (!clientClosed) res.end()`
- [ ] `timeout.js` 三种超时都实现了

## B. 验证

- [ ] 跑 `e06`，假模型打出"已发出 5/40 字"
- [ ] 我对比过"去掉 cancel"和"加上 cancel"的日志差别
- [ ] 我用 `firstByteMs: 1000` 验证过首字超时
- [ ] 我在浏览器点停止，服务端日志有记录

## C. 认知

- [ ] 我知道 `for await` 的 break 为什么不够
- [ ] 我知道 499 和 502 的区别
- [ ] 我知道为什么中断也要记 `estimated: true`
- [ ] 我知道"中断 ≠ 不花钱"

## 本节课要能说出口的一句话

> **用户点停止，前端停下来只是开始。要让上游也停，才有意义。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 点停止后账单还在涨 | 上游没停 | `reader.cancel()` |
| 假模型日志"正常结束" | `cancel` 没生效 | 检查 `onAbort` 是否真的调了 |
| `req.close` 不触发 | Express 包装 / 中间件 | 同时监听 `res.close` |
| 取消被记成 502 | `send` 没 catch | 加 try/catch |
| `ERR_STREAM_WRITE_AFTER_END` | 断开后还写 | `send` 里判断 `clientClosed` |
| `ERR_STREAM_DESTROYED` | `res.end` 重复 | `if (!clientClosed)` |
| 长文本被误杀 | `totalMs` 太小 | 调到 180 秒或按业务定 |
| 上游卡死等 3 分钟 | 只有总超时 | 加首字超时 + 空闲超时 |
| 中断记账偏差 20% | 用字符估 token | 接 `partialUsage` |
| 日志里一堆 499 | 正常 | 这是忠实的记录，不是错误 |
