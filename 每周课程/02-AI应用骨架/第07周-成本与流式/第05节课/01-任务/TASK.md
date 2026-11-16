# 第 47 节课：流式——从"转圈 8 秒"到"0.6 秒出第一个字"

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前面四天你都在省钱。今天开始解决"感觉"。
> 同样 8 秒，不流式用户会关掉页面；流式用户会读完。**差别不在总时长，在于多久有反应。**

**建议用时**：150 分钟
**你需要先完成**：第 46 节课（缓存能用，记账有 `cached` 字段）

---

# 第 0 步：先感受一下差别（10 分钟）

## 0.1 一个数字：TTFT

```text
TTFT（Time To First Token，首字延迟）= 从发出请求到收到第一个字的时间
```

**用户感知的"快不快"，几乎完全由 TTFT 决定，而不是总时长。**

| 场景 | 总时长 | TTFT | 用户感受 |
|---|---|---|---|
| 不流式 | 8 秒 | 8 秒 | "卡死了" |
| 流式 | 8 秒 | 0.6 秒 | "挺快的，一直在写" |

**同样 8 秒。** 这就是这一节的全部价值。

## 0.2 为什么流式能"看起来快"

**不流式：**

```text
请求 → [等 7.4 秒，模型生成全部内容] → 一次性返回 8 秒的内容
浏览器：转圈 8 秒 → 瞬间显示全部
```

**流式：**

```text
请求 → [0.6 秒出第一个字] → 每 60ms 一个字节 → 8 秒后结束
浏览器：0.6 秒后开始一个字一个字出现
```

**模型的总计算量完全一样。** 变的是"什么时候把已有结果给你"。

## 0.3 这一节的难点在哪

**不是"调一个参数"。** 真正的难点是**数据在五个环节里可能被缓冲**：

```text
① 模型服务（上游）
② 你的 Node 服务（Express）
③ 中间件（compression / body-parser）
④ 反向代理（Nginx，第 31 周才有）
⑤ 浏览器（fetch 的读取方式）
```

**任何一环缓冲，你就"看起来做了流式，但实际等了 8 秒才一次性出现"。**

**这个现象极其常见，而且排查时你会怀疑自己代码写错了 —— 实际是被中间件吃了。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `token-lab` 里） | 内容 |
|---|---|---|
| `src/llm.js` | `src/` | 加 `chatStream`，逐块产出 |
| `src/app.js` | `src/` | Express 服务 + SSE 接口 |
| `public/index.html` | `public/` | 打字机界面 |
| `experiments/e05-stream.js` | `experiments/` | 命令行验证流式（不经过浏览器） |
| `results/e05.md` | `results/` | TTFT 对比数据 |

---

# 第 1 步：先装 Express（15 分钟）

## 1.1 装依赖

**在 `token-lab` 目录：**

```text
npm install express
```

**装完看 `package.json`，应该多了一行 `"express": "^4.x.x"`。**

**为什么这一周才装 Express：**

```text
第 3 周用原生 http 学会"服务器是什么"
现在要写 SSE + 中间件，用框架省一半代码
```

**你已经知道底下在干什么，用框架不算偷懒。**

## 1.2 加脚本

```json
  "scripts": {
    "mock": "node src/mock-llm.js",
    "server": "node --env-file=.env src/app.js",
    "e01": "node --env-file=.env experiments/e01-price.js",
    "e02": "node experiments/e02-meter.js",
    "e03": "node --env-file=.env experiments/e03-limits.js",
    "e04": "node --env-file=.env experiments/e04-cache.js",
    "e05": "node --env-file=.env experiments/e05-stream.js"
  }
```

---

# 第 2 步：写流式调用（35 分钟）

## 2.1 先看 `fetch` 的两种读法

**错的做法（你会踩）：**

```javascript
const response = await fetch(url, { body });
const text = await response.text();     // 等全部收完
```

**`response.text()` 会等整个响应结束。** 流式传到你这儿，被你攒成一整块。

**对的两种：**

### 写法一：`for await`

```javascript
for await (const chunk of response.body) {
  // chunk 是 Uint8Array
}
```

**最简洁。Node 18+ 支持。**

### 写法二：`getReader()`

```javascript
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // value 是 Uint8Array
}
```

**更底层，能精确控制取消。第 48 节做中断时用这个。**

**今天先用 `for await`，第 48 节换成 `getReader`。**

## 2.2 理解 SSE 格式

**上游返回的不是 JSON，是这种文本：**

```text
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: {"choices":[{"delta":{"content":"，"}}]}

data: [DONE]

```

**三个规则：**

```text
① 每个事件以 "data: " 开头
② 事件之间用空行分隔（两个 \n）
③ 结束标记是 data: [DONE]
```

**为什么要懂这个格式：**

**因为你要自己解析它。**

**`for await` 给你的 chunk 是"任意切分"的字节，可能把一个 JSON 切两半。**

```text
chunk 1: data: {"choices":[{"delta":{"cont
chunk 2: ent":"你"}}]}\n\n
```

**这就是流式解析的全部难点：缓冲区。**

## 2.3 写 `chatStream`

**在 `src/llm.js` 里加：**

```javascript
/**
 * 流式调用。返回一个 async generator，yield 每个增量文本。
 * 结束时 yield 一个 { done: true, usage } 结束标记。
 */
export async function* chatStream(messages, options = {}) {
  const {
    temperature = 0.7,
    maxTokens = CONFIG.llm.maxTokens,
    model = CONFIG.llm.model,
    timeoutMs = CONFIG.llm.timeoutMs,
    signal,
    includeUsage = true,
  } = options;

  // 限长（第 45 节）
  const trimmed = trimHistory(messages, options.keepRounds);
  trimmed.forEach((message) => assertInputLength(message.content));
  assertTotalEstimate(trimmed);

  const url = `${CONFIG.llm.baseUrl}/chat/completions`;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const finalSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CONFIG.llm.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: trimmed,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
    }),
    signal: finalSignal,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new LlmError(`模型服务返回 ${response.status}`, detail, 502);
  }

  if (!response.body) {
    throw new LlmError("上游没有返回流", "response.body is null", 502);
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
  let usage = null;
  let finishReason = null;

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });

    // 按 "空行" 切分事件
    let boundary = buffer.indexOf("\n\n");

    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const line = event.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;

      const payload = line.slice(6).trim();

      if (payload === "[DONE]") {
        yield { done: true, text: fullText, usage, finishReason, truncated: finishReason === "length" };
        return;
      }

      let parsed;

      try {
        parsed = JSON.parse(payload);
      } catch {
        // 上游偶尔有非 JSON 的 data 行，跳过
        continue;
      }

      const delta = parsed?.choices?.[0]?.delta?.content;

      if (delta) {
        fullText += delta;
        yield { done: false, text: delta };
      }

      if (parsed?.choices?.[0]?.finish_reason) {
        finishReason = parsed.choices[0].finish_reason;
      }

      if (parsed?.usage) {
        usage = parsed.usage;
      }
    }
  }

  // 上游没发 [DONE] 就断了（常见）
  const promptTokens = usage?.prompt_tokens ?? estimateTokens(trimmed.map((m) => m.content).join(""));
  const completionTokens = usage?.completion_tokens ?? estimateTokens(fullText);

  yield {
    done: true,
    text: fullText,
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, estimated: !usage },
    finishReason,
    truncated: finishReason === "length",
  };
}
```

## 2.4 四个关键点，逐个讲透

### 关键点一：`decoder.decode(chunk, { stream: true })`

**为什么必须 `{ stream: true }`：**

**一个汉字在 UTF-8 里是 3 个字节。如果 chunk 的边界正好切在这 3 个字节中间：**

```text
chunk 1: ... E4 BD
chunk 2: A0 ...
```

**不带 `stream: true`，`decode` 会把这半个字符解成 `�`（乱码）。**

**带上它，`TextDecoder` 会把不完整的字节留在内部缓冲，等下一块拼上再解。**

**这一条不做，你的中文输出会零星出现乱码，而且只在特定长度时出现 —— 极难查。**

### 关键点二：按 `\n\n` 切事件，不是按 `\n`

**SSE 的事件分隔符是空行（`\n\n`），不是单个换行。**

**按 `\n` 切，你会把一个 JSON 对象的 `data:` 行和它后面的空行分开处理，导致解析失败。**

**而且一个事件里可能有多行（`data:` 出现两次表示拼接），虽然上游一般只发一行。**

### 关键点三：`buffer` 要保留残余

```javascript
buffer = buffer.slice(boundary + 2);
```

**只切已经完整的事件，剩下的留在 `buffer` 里等下一块。**

**如果每块都清空 `buffer`，被切断的 JSON 就永远丢了。**

**这是流式解析的核心机制：**

```text
收到一块 → 拼到 buffer → 循环切出完整事件 → 剩下的留着
```

### 关键点四：`[DONE]` 之后立刻 return

**不做的话，`for await` 会继续等下游关闭，可能多等好几秒。**

**上游发了 `[DONE]` 就是明确告诉你"结束了"。立刻退出。**

## 2.5 一个必须处理的现实：上游不发 `[DONE]`

**很多中转在结束时直接关连接，不发 `[DONE]`。**

**所以 `for await` 正常结束（不是 break）时，你也要 yield 一次结束标记。**

**这就是最后那段的用途。**

**如果不处理：**

```text
你的 async generator 结束了，但没 yield 结束标记
→ 调用方拿不到 usage 和 finishReason
→ 记账记不上
```

## 2.6 命令行先验证（不碰浏览器）

**新建 `experiments/e05-stream.js`：**

```javascript
import { chatStream } from "../src/llm.js";

const main = async () => {
  const started = Date.now();
  let firstTokenAt = null;
  let chunks = 0;

  process.stdout.write("\n--- 流式输出 ---\n");

  for await (const piece of chatStream(
    [{ role: "user", content: "请用一百字介绍流式输出的好处。" }],
    { temperature: 0.7, maxTokens: 300 }
  )) {
    if (piece.done) {
      const total = Date.now() - started;
      console.log(`\n\n--- 结束 ---`);
      console.log(`chunks：${chunks}`);
      console.log(`总耗时：${total}ms`);
      console.log(`TTFT：${firstTokenAt ? firstTokenAt - started : "N/A"}ms`);
      console.log(`usage：`, piece.usage);
      console.log(`finishReason：${piece.finishReason}`);
      break;
    }

    if (firstTokenAt === null) firstTokenAt = Date.now();
    chunks += 1;
    process.stdout.write(piece.text);
  }
};

main().catch((error) => {
  console.error("\n跑挂了：", error.userMessage || error.message);
  process.exitCode = 1;
});
```

**跑：**

```text
npm run mock        （另一个终端）
npm run e05
```

**假模型会一字一字吐，你能看到 `TTFT` 大约 60ms，`chunks` 等于字数。**

**换真模型跑一次，`TTFT` 大概 300-1500ms。**

## 2.7 你要记录的两个数字

```text
TTFT（首字延迟）：___ ms
总耗时：___ ms
```

**比值通常 5-20 倍。** 这就是"用户感觉快了"的全部秘密。

---

# 第 3 步：写 SSE 接口（30 分钟）

## 3.1 新建 `src/app.js`

```javascript
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.js";
import { chatStream } from "./llm.js";
import { record, newRequestId } from "./meter.js";
import { calcCost } from "./pricing.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(DIR, "..", "public")));

app.post("/api/chat/stream", async (req, res) => {
  const { message } = req.body ?? {};

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message 必填" });
    return;
  }

  const requestId = newRequestId();
  const started = Date.now();

  // 关键 1：SSE 的三个头
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",   // 给 Nginx 看的
  });
  res.flushHeaders();

  // 关键 2：监听客户端断开
  let clientClosed = false;
  const abortController = new AbortController();

  req.on("close", () => {
    clientClosed = true;
    abortController.abort();
    console.log(`[stream] 客户端断开 requestId=${requestId}，已用 ${Date.now() - started}ms`);
  });

  const send = (event, data) => {
    if (clientClosed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    for await (const piece of chatStream(
      [{ role: "user", content: message }],
      { signal: abortController.signal, feature: "chat-stream", userId: req.body.userId }
    )) {
      if (clientClosed) break;

      if (piece.done) {
        const cost = calcCost({
          model: CONFIG.llm.model,
          promptTokens: piece.usage.promptTokens,
          completionTokens: piece.usage.completionTokens,
        });

        record({
          userId: req.body.userId,
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

      send("delta", { text: piece.text });
    }
  } catch (error) {
    if (error.name === "AbortError" || clientClosed) {
      record({
        userId: req.body.userId,
        feature: "chat-stream",
        requestId,
        model: CONFIG.llm.model,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        ms: Date.now() - started,
        ok: false,
        status: 499,
        errCode: "ABORTED",
        stream: true,
      });
    } else {
      send("error", { message: error.userMessage || "服务暂时不可用" });
      console.error(`[stream] 错误：`, error.message);
    }
  } finally {
    if (!clientClosed) res.end();
  }
});

app.listen(CONFIG.port, () => {
  console.log(`服务已启动：http://localhost:${CONFIG.port}`);
});
```

## 3.2 五个关键点

### 关键点一：三个响应头，缺一不可

```javascript
"Content-Type": "text/event-stream; charset=utf-8",   // 声明这是 SSE
"Cache-Control": "no-cache, no-transform",            // 不许缓存 + 不许代理"优化"
"X-Accel-Buffering": "no",                            // 告诉 Nginx 别缓冲
```

**`no-transform` 尤其重要：** 有些代理会压缩或重新编码，把流式打回一次性。

**`X-Accel-Buffering: no` 现在没用（你没有 Nginx），但写上。** 第 31 周部署时你会感谢自己。

### 关键点二：`res.flushHeaders()`

**Express 默认会等有内容才发头。**

**`flushHeaders()` 立刻把 200 和头发出去。**

**不调用，浏览器会一直处于"等待响应"状态，看不到任何东西 —— 直到第一个数据块。**

**而第一个数据块可能 1 秒后才来。这 1 秒就是白等的。**

### 关键点三：用 `event: xxx` 区分类型

```text
event: delta
data: {"text":"你"}

event: done
data: {"usage":{...}}

event: error
data: {"message":"..."}
```

**为什么不用单一格式 + 类型字段：**

**因为前端 `EventSource` 的 `addEventListener("delta", ...)` 能直接分派，代码更清楚。**

**而且错误和正常数据分开走，不会混。**

### 关键点四：`req.on("close")` + `AbortController`

**这是第 48 节的主题，今天先接上。**

**现在只要知道：客户端一断，`abortController.abort()` 会中断上游请求。**

**不接的话，用户关了页面，你的服务还在为没人看的内容付费。**

### 关键点五：`finally` 里 `res.end()`

**不管成功还是出错，都要结束响应。**

**不 `end`，连接会一直挂着，浏览器一直显示"加载中"。**

**但如果是客户端先断开（`clientClosed`），就不要再 `res.end()` —— 会报错。**

## 3.3 先不装 compression

**如果你装了 `compression` 中间件，要给它开例外：**

```javascript
app.use(compression({
  filter: (req, res) => {
    if (res.getHeader("Content-Type") === "text/event-stream") return false;
    return compression.filter(req, res);
  },
}));
```

**为什么：**

**`compression` 会攒够一批数据才压缩输出。你的 SSE 每一个字都会被害死。**

**症状：等了 8 秒，然后所有字一次性出现。**

**这是"我明明写了流式，但还是一起出现"的头号原因。**

**今天不装，就少一个坑。** 但你以后装的时候必须记得这一条。

---

# 第 4 步：写前端打字机（30 分钟）

## 4.1 新建 `public/index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>流式输出实验</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      max-width: 760px;
      margin: 40px auto;
      padding: 0 20px;
      color: #1a1a1a;
      background: #fafafa;
    }
    h1 { font-size: 20px; font-weight: 600; }
    .panel {
      background: #fff;
      border: 1px solid #e3e3e3;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 16px;
    }
    textarea {
      width: 100%;
      min-height: 80px;
      padding: 10px;
      font: inherit;
      border: 1px solid #ddd;
      border-radius: 8px;
      resize: vertical;
    }
    .row { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
    button {
      padding: 9px 18px;
      font: inherit;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      background: #1a6dff;
      color: #fff;
    }
    button:disabled { background: #b9c9e6; cursor: not-allowed; }
    button.stop { background: #d93b3b; }
    .out {
      min-height: 120px;
      white-space: pre-wrap;
      line-height: 1.7;
      font-size: 15px;
    }
    .cursor {
      display: inline-block;
      width: 7px;
      height: 16px;
      background: #1a6dff;
      vertical-align: -2px;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }
    .stats {
      font-size: 13px;
      color: #666;
      margin-top: 12px;
      font-variant-numeric: tabular-nums;
    }
    .stats b { color: #1a1a1a; font-weight: 600; }
  </style>
</head>
<body>
  <h1>流式输出实验</h1>

  <div class="panel">
    <textarea id="input">请用两百字说明什么是首字延迟，以及它为什么比总时长更重要。</textarea>
    <div class="row">
      <button id="send">发送</button>
      <button id="stop" class="stop" disabled>停止</button>
      <span class="stats" id="hint"></span>
    </div>
  </div>

  <div class="panel">
    <div class="out" id="out"></div>
    <div class="stats" id="stats">等待发送……</div>
  </div>

  <script>
    const input = document.getElementById("input");
    const sendBtn = document.getElementById("send");
    const stopBtn = document.getElementById("stop");
    const out = document.getElementById("out");
    const stats = document.getElementById("stats");
    const hint = document.getElementById("hint");

    let controller = null;

    const fmt = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`);

    const reset = () => {
      out.textContent = "";
      stats.textContent = "等待响应……";
      hint.textContent = "";
    };

    const setRunning = (running) => {
      sendBtn.disabled = running;
      stopBtn.disabled = !running;
    };

    const appendText = (text) => {
      out.textContent += text;
      out.scrollTop = out.scrollHeight;
    };

    // 关键：用 fetch + ReadableStream，不用 EventSource（它只支持 GET）
    const send = async () => {
      reset();
      setRunning(true);

      controller = new AbortController();

      const started = performance.now();
      let firstTokenAt = null;
      let chunks = 0;
      let chars = 0;

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: input.value }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          stats.textContent = `HTTP ${response.status}：${text.slice(0, 120)}`;
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            const lines = raw.split("\n");
            const eventLine = lines.find((line) => line.startsWith("event: "));
            const dataLine = lines.find((line) => line.startsWith("data: "));
            if (!dataLine) continue;

            const event = eventLine ? eventLine.slice(7).trim() : "message";
            let payload;
            try {
              payload = JSON.parse(dataLine.slice(6));
            } catch {
              continue;
            }

            if (event === "delta") {
              if (firstTokenAt === null) {
                firstTokenAt = performance.now() - started;
                hint.textContent = `首字 ${fmt(Math.round(firstTokenAt))}`;
              }
              chunks += 1;
              chars += [...payload.text].length;
              appendText(payload.text);
            }

            if (event === "done") {
              const total = performance.now() - started;
              stats.textContent =
                `总耗时 ${fmt(Math.round(total))}　` +
                `首字 ${fmt(Math.round(firstTokenAt ?? total))}　` +
                `包数 ${chunks}　字数 ${chars}　` +
                `token ${payload.usage.completionTokens}　` +
                (payload.truncated ? "（已截断）" : "");
            }

            if (event === "error") {
              stats.textContent = `出错：${payload.message}`;
            }
          }
        }
      } catch (error) {
        if (error.name === "AbortError") {
          const elapsed = performance.now() - started;
          stats.textContent = `已停止（用时 ${fmt(Math.round(elapsed))}，已收 ${chars} 字）`;
        } else {
          stats.textContent = `请求失败：${error.message}`;
        }
      } finally {
        setRunning(false);
        controller = null;
      }
    };

    sendBtn.addEventListener("click", send);
    stopBtn.addEventListener("click", () => {
      if (controller) controller.abort();
    });
  </script>
</body>
</html>
```

## 4.2 三个关键点

### 关键点一：不用 `EventSource`

**`EventSource` 只能发 GET 请求，不能带 body。**

**你的对话需要 POST 一段文本。**

**所以必须用 `fetch` + `response.body.getReader()`，自己解析 SSE。**

**这是"看起来该用 EventSource，实际不能用"的经典场景。**

### 关键点二：`decoder.decode(value, { stream: true })`

**和 Node 端一样的原因：中文多字节，切分边界会出乱码。**

**不做这一步，你会在页面上看到偶尔冒出的 `�`。**

### 关键点三：`performance.now()` 而不是 `Date.now()`

**`performance.now()` 是单调时钟，精度亚毫秒。**

**`Date.now()` 会被系统时间调整影响（用户改了时间 / NTP 同步），可能出现负数耗时。**

**测延迟一律用 `performance.now()`。**

## 4.3 跑起来

**两个终端：**

```text
终端 A：npm run mock
终端 B：npm run server
```

**浏览器打开：**

```text
http://localhost:4020
```

**点"发送"，你应该看到字一个一个冒出来。**

## 4.4 一定要看的三件事

### 第一：`首字` 那个数字

**假模型下应该 100-300ms。**

**真模型下 400-1500ms。**

**这个数字就是 TTFT。** 记住它，第 49 节会用它算"体验分"。

### 第二：`包数` vs `字数`

**假模型是一字一包，所以包数 = 字数。**

**真模型可能一次发 2-5 个字，所以包数 < 字数。**

**这个比值说明上游的"粒度"。** 太细反弹慢，太粗打字机效果差。

### 第三：中文有没有乱码

**如果偶尔冒出 `�`，说明你的 `decode` 少了 `{ stream: true }`。**

**前后端都要检查。**

---

# 第 5 步：验证缓冲问题（20 分钟）

**这一步是"排错能力"训练。你必须亲眼看到缓冲长什么样。**

## 5.1 实验一：删掉 `flushHeaders()`

**操作：** 注释掉 `res.flushHeaders()`。

**现象：** 点发送后，**第一个字出现的时间明显变晚**（晚了一整个缓冲周期）。

**为什么：** Express 攒够 8KB 才发？不完全对 —— 实际是 Node 的 `res.write` 在没有 flush 时会先进缓冲区。

**`flushHeaders` 的作用是"立刻把头发出"，让浏览器进入"接收中"状态。**

**改回来。**

## 5.2 实验二：装 compression，不改 filter

```text
npm install compression
```

**在 `app.js` 里加：**

```javascript
import compression from "compression";
app.use(compression());
```

**再试。**

**现象：字一个字都不出，等了 8-10 秒，然后全部一次性出现。**

**这就是缓冲。** `compression` 要攒够一个压缩块才输出。

**改法（两种任选）：**

```javascript
// A. 给 SSE 开例外（推荐）
app.use(compression({
  filter: (req, res) => {
    if (res.getHeader("Content-Type") === "text/event-stream") return false;
    return compression.filter(req, res);
  },
}));

// B. 干脆不用 compression（这一周的接口都是 AI，压缩意义不大）
```

**这个实验做完，你以后遇到"流式不生效"会第一时间想到中间件。**

## 5.3 实验三：前端改用 `await response.text()`

**把 `reader` 那段换成：**

```javascript
const text = await response.text();
out.textContent = text;
```

**现象：** 8 秒后所有字一起出现，和不用流式一样。

**为什么：** `text()` 会等整个响应体收完才返回。

**这是前端最容易犯的错。** 后端明明流了，前端攒成一坨。

## 5.4 三个实验的共同点

```text
都是"中间某一环把流攒成了块"
```

**排查顺序（按概率）：**

```text
① 前端是不是用了 text() / json()？
② 后端有没有 flushHeaders？
③ 有没有装 compression？
④ 有没有 Nginx / CDN 在前面？
⑤ 上游是不是真的流了（命令行 e05 验证）？
```

**这个清单以后能省你几小时。**

---

# 第 6 步：五个必须知道的坑（15 分钟）

## 坑 1：`AbortSignal.timeout` 在流式里的行为

**`AbortSignal.timeout(60000)` 是"从发出到 60 秒"。**

**但流式的总时长可能超过 60 秒（生成长文本）。**

**所以流式要用更长的超时，或者用"空闲超时"（多久没收到数据就断）。**

**今天先调大：**

```javascript
timeoutMs: 180000   // 3 分钟
```

**更好的做法（练习）：** 每次收到数据就重置一个计时器，实现"空闲超时"。

## 坑 2：`connection: keep-alive` 但不持久

**某些环境下（比如某些服务器配置），长连接会被 30 秒后切断。**

**现象：** 生成到一半突然断，浏览器收到 `done` 但内容是半截的。

**应对：**

```text
① 发心跳（每 15 秒发一个注释行 ": ping\n\n"）
② 前端检测"超过 N 秒没数据"，主动提示
```

**心跳的写法（练习）：**

```javascript
const heartbeat = setInterval(() => {
  if (!clientClosed) res.write(": ping\n\n");
}, 15000);

// 结束时清理
clearInterval(heartbeat);
```

**`:` 开头是 SSE 的注释语法，客户端会忽略它。** 它的唯一作用是"让连接别被判定空闲"。

## 坑 3：`usage` 在流式里默认没有

**必须加 `stream_options: { include_usage: true }`。**

**而且不是所有服务商都支持这个字段。** 不支持会报 400。

**应对：**

```javascript
// 400 的话自动降级
try {
  // 带 include_usage
} catch (error) {
  if (error.detail?.includes("stream_options")) {
    // 去掉重试
  }
}
```

**更简单的做法：用 `estimateTokens` 兜底，标记 `estimated: true`。**

**你现在已经这么做了，很好。**

## 坑 4：`event: ` 后面必须有空格

**SSE 规范：`event: delta`（冒号后有一个空格）。**

**写成 `event:delta` 有些解析器能容忍，有些不能。**

**你的手写解析器用 `startsWith("event: ")`，漏了空格就匹配不上。**

**统一写带空格的。**

## 坑 5：忘记 `res.end()`

**`finally` 里要 `res.end()`。**

**不调用，连接不关闭，浏览器一直显示"加载中"，用户以为卡住了。**

**而且连接会占用服务器的文件描述符，几十个之后新请求就进不来。**

**这是"服务器跑一会儿就不响应了"的常见原因。**

---

# 第 7 步：故意做三个实验（10 分钟）

## 实验 1：把 `maxTokens` 设成 20

**看前端：字很快就出完，`done` 里 `truncated: true`。**

**对比 `maxTokens: 800` 的 TTFT。**

**结论：TTFT 不受 `max_tokens` 影响（它只看第一个字什么时候到）。**

**但总时长受影响。** 这就是为什么"感觉快"和"实际快"是两件事。

## 实验 2：让假模型每个 chunk 间隔 500ms

**改 `mock-llm.js` 里的 `await sleep(60)` 为 `sleep(500)`。**

**感受一下"打字机"变成"挤牙膏"是什么体验。**

**这能让你理解：chunk 间隔太大会很难看。** 真实上游一般 20-80ms，刚好。

## 实验 3：前端 `appendText` 改成 `out.textContent = text`

**每个包都覆盖而不是追加。**

**现象：你只会看到最后一个字。**

**这个错很常见（把 `+=` 写成 `=`），而且看起来像"模型只回了一个字"。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. TTFT 和总耗时的两个数字（假模型 + 真模型各一组）
2. 三个缓冲实验各自的现象
3. 你的排查清单
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：加心跳

**要求：** 每 15 秒发一次 `: ping\n\n`，在 `finally` 里 `clearInterval`。

**验证：** 让假模型延迟 40 秒才回第一个字，确认连接没被断。

## 练习二：实现"空闲超时"

**要求：** 如果 30 秒没收到任何数据，主动中断并告诉用户。

**提示：**

```javascript
let idleTimer = setTimeout(() => abortController.abort(), 30000);
// 每收到一块就 reset
```

**为什么需要：** 上游卡死时，`AbortSignal.timeout(180000)` 要等 3 分钟。用户等不了。

## 练习三：把流式接进缓存

**要求：** 流式调用结束后，把完整结果写缓存。

**注意：**

```text
① 缓存的是"完整结果"，不是每一块
② 下次命中时，一次性返回（或模拟分块返回）
```

**模拟分块很简单：**

```javascript
for (const char of hit.value.content) {
  send("delta", { text: char });
  await sleep(20);
}
```

**为什么要模拟：** 前端代码不用改，命中时也有打字机效果。

**但注意：这时 `usage` 是 0，要标 `cached: true`。**

## 练习四：算一次"流式值不值"

**用你的账本，算出：**

```text
如果 20% 的用户在 TTFT 超过 3 秒时离开
流式把 TTFT 从 8 秒降到 0.8 秒
那每天的"流失"减少了多少次？
```

**这就是"体验优化"的货币化。** 第 49 节会做完整版。

## 练习五：想清楚这四个问题

```text
1. 为什么 TTFT 比总时长更重要？
2. 为什么 EventSource 不能用于这个场景？
3. 为什么 decoder 要用 { stream: true }？
4. 为什么 compression 会杀死流式？
```

---

# 第 10 步：最终验收

## A. 代码

- [ ] `chatStream` 是 async generator，yield 增量和 `done`
- [ ] 用 `\n\n` 切事件，`buffer` 保留残余
- [ ] `decoder.decode(chunk, { stream: true })` 前后端都有
- [ ] `/api/chat/stream` 有 `flushHeaders` 和三个头
- [ ] `finally` 里有 `res.end()`
- [ ] 前端用 `getReader()` 而不是 `text()`

## B. 效果

- [ ] 浏览器能看到字一个一个出现
- [ ] 我记录了 TTFT（假模型和真模型各一组）
- [ ] 我做过三个缓冲实验，知道各自现象
- [ ] 停止按钮能中断（第 48 节会深入）

## C. 认知

- [ ] 我能解释 TTFT 和总时长的区别
- [ ] 我知道 EventSource 为什么不能用
- [ ] 我知道 `{ stream: true }` 防的是什么
- [ ] 我知道 compression 是流式的头号杀手

## 本节课要能说出口的一句话

> **用户感知的不是总时长，是多久有反应。流式改的不是速度，是等待的形状。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 字一起出现 | 前端用了 `text()` | 改 `getReader()` |
| 字一起出现（前端对了） | 装了 compression | 给 SSE 开 filter 例外 |
| 第一个字很慢 | 没 `flushHeaders` | 加上 |
| 中文偶尔乱码 | 少 `{ stream: true }` | 前后端都加 |
| JSON 解析失败 | 按 `\n` 切而不是 `\n\n` | 改分隔符 |
| 收不到 usage | 没 `stream_options` | 加上，或接受估算 |
| 生成一半断掉 | 连接超时 | 加心跳 |
| 一直"加载中" | 忘了 `res.end()` | `finally` 里加 |
| `EventSource` 报错 | 它只支持 GET | 改 fetch + reader |
| 停止按钮没用 | 前端没 abort | 第 48 节 |
