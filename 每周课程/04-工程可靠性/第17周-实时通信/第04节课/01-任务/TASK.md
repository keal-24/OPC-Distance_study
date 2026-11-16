# 第 116 节课：AI 流式输出（打字机效果）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天做客户唯一会当场"哇"一下的功能：**字一个接一个出来。**
> 技术上它就是 SSE —— 但中间多了一层"上游也是流"的转发。

**建议用时**：130 分钟
**你需要先完成**：第 113—115 节（SSE 连接、事件、重连都会）
**今天要装**：`express`（`dotenv` 可选）
**今天必须有**：一个能用的模型 key（没有也能做，见 2.3 的 mock）

---

# 第 0 步：流式到底省了什么（15 分钟）

## 0.1 一个数字对比

```text
非流式：用户点发送 → 12 秒空白 → 一次性出现 600 字
流式：  用户点发送 → 0.4 秒出现第一个字 → 12 秒内逐渐出现 600 字
```

**总时间一样，用户感受完全不同。**

| | 非流式 | 流式 |
|---|---|---|
| 首字时间 | 12 秒 | **0.4 秒** |
| 总时长 | 12 秒 | 12 秒 |
| 用户中途能读吗 | 不能 | **能** |
| 用户会不会以为卡了 | **会** | 不会 |
| 成本 | 一样 | **一样** |

## 0.2 顺便纠正一个成本误解

**流式不省钱。** token 一个不少。

**它省的是"用户以为你挂了"这件事。** 客户问"能不能快点"，八成不是要更快的模型，是要**先看到东西**。

## 0.3 今天的链路（三层都是流）

```text
模型 API（SSE 流）
      ↓  你的 Node 读流、解析、转发
你的接口（SSE 流）
      ↓
浏览器（边收边渲染）
```

**难点只有一个：中间这层要把上游的 chunk 正确切开，再按 SSE 格式写给浏览器。**

**切错了就乱码、丢字、卡住。** 今天主要就练这个。

---

# 第 1 步：建项目（10 分钟）

在 `03-练习代码` 下新建 `stream-ai`：

```bash
npm init -y
npm pkg set type=module
npm install express dotenv
```

新建 `.env`（**不要提交到 Git**）：

```text
API_BASE=https://api.qiancan.cc/v1
API_KEY=sk-你的key
MODEL=gpt-4o-mini
```

`.gitignore`：

```text
node_modules/
.env
```

> **`.env` 里有 key，绝对不能提交。** 第 4 周讲过，这里再提醒一次：提交了就吊销重发。

---

# 第 2 步：先做一个假的"模型"（25 分钟）

**为什么先做假的：** 你要先验证"转发管道"，再接真模型。**两件事一起调，出错时你不知道是哪边的问题。**

新建 `mock.js`：

```javascript
// mock.js
// 假的模型：按 OpenAI 兼容格式吐 SSE，方便你调管道
import express from "express";

export function mountMock(app) {
  app.post("/mock/v1/chat/completions", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();

    const text = "流式输出就是把一句话拆成很多小块，一块一块推给浏览器。今天你要把这个管道接对：切开、解析、转发、渲染。";
    const chars = [...text];

    for (let i = 0; i < chars.length; i++) {
      const chunk = {
        id: "chatcmpl-mock",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: chars[i] }, finish_reason: null }],
      };

      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      await new Promise((r) => setTimeout(r, 60));      // 60ms 一个字
    }

    res.write(`data: ${JSON.stringify({
      id: "chatcmpl-mock",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    })}\n\n`);

    res.write("data: [DONE]\n\n");
    res.end();
  });
}
```

## 2.1 上游的格式长什么样（必须认识）

```text
data: {"choices":[{"delta":{"content":"流"}}]}

data: {"choices":[{"delta":{"content":"式"}}]}

data: [DONE]

```

**三个特征：**

```text
① 每条也是 data: ...\n\n （和我们写的 SSE 一模一样，这不是巧合）
② 内容是"增量"，只有 delta.content，不是全文
③ 结束标记是字符串 [DONE]，不是 JSON
```

**记住第三条。** 很多人在这里 `JSON.parse("[DONE]")` 直接崩。

---

# 第 3 步：写转发接口（35 分钟）

新建 `server.js`：

```javascript
// server.js
import express from "express";
import "dotenv/config";
import { mountMock } from "./mock.js";

const app = express();
app.use(express.json());

// 假模型挂上，方便没 key 也能练
mountMock(app);

app.get("/", (req, res) => {
  res.type("html").send(`
    <h1>流式输出</h1>
    <button id="go">开始</button>
    <div id="out" style="white-space:pre-wrap;border:1px solid #ddd;padding:12px;min-height:200px;margin-top:12px;font-family:system-ui"></div>
    <p id="state" style="color:#888"></p>

    <script>
      const out = document.getElementById("out");
      const state = document.getElementById("state");

      document.getElementById("go").onclick = async () => {
        out.textContent = "";
        state.textContent = "连接中…";

        const t0 = Date.now();
        let first = null;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "解释一下流式输出" }),
        });

        if (!res.ok) {
          state.textContent = "请求失败：" + res.status;
          return;
        }

        state.textContent = "已连接，等待第一个字…";

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\\n\\n");
          buffer = parts.pop();

          for (const part of parts) {
            for (const line of part.split("\\n")) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6);
              if (raw === "[DONE]") {
                state.textContent = "完成，总耗时 " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒";
                continue;
              }

              let json;
              try { json = JSON.parse(raw); } catch { continue; }

              const piece = json.choices?.[0]?.delta?.content;
              if (!piece) continue;

              if (first === null) {
                first = Date.now();
                state.textContent = "首字耗时 " + ((Date.now() - t0) / 1000).toFixed(2) + " 秒";
              }

              out.textContent += piece;
              out.scrollTop = out.scrollHeight;
            }
          }
        }
      };
    </script>
  `);
});

app.post("/api/chat", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "你好");

  // ① 先把浏览器这边的头设好（这是给浏览器的流）
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // 没有 key 就用假模型，方便练习
  const useMock = !process.env.API_KEY || process.env.API_KEY.includes("你的key");
  const url = useMock
    ? `http://localhost:${PORT}/mock/v1/chat/completions`
    : `${process.env.API_BASE}/chat/completions`;

  try {
    // ② 向上游发起流式请求
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(useMock ? {} : { Authorization: `Bearer ${process.env.API_KEY}` }),
      },
      body: JSON.stringify({
        model: useMock ? "mock" : process.env.MODEL,
        stream: true,                              // ← 关键：要求上游流式返回
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      res.write(`data: ${JSON.stringify({ error: `上游 ${upstream.status}：${detail.slice(0, 200)}` })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // ③ 读上游流，按 \n\n 切开，逐条转发
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop();                        // 最后一段可能不完整，留着

      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;

        const raw = line.slice(6).trim();
        if (raw === "[DONE]") {
          res.write("data: [DONE]\n\n");
          continue;
        }

        let json;
        try { json = JSON.parse(raw); } catch { continue; }

        const piece = json.choices?.[0]?.delta?.content;
        if (!piece) continue;

        // ④ 只把"内容"转发给浏览器，别把上游整个 JSON 透传
        res.write(`data: ${JSON.stringify({ text: piece })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    // ⑤ 出错要告诉浏览器，不能让它一直等
    res.write(`data: ${JSON.stringify({ error: String(err.message) })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
```

## 3.1 五个必须懂的细节

**① `stream: true`**

不加，上游一次性返回完整 JSON，你就没东西可流。

**② `buffer` 为什么要留最后一段**

```text
网络分块不会刚好切在 \n\n 上。
你这一轮读到的可能是：  "data:{...}\n\ndata:{..."
最后那段是半截，必须留到下一轮再拼。
```

**不这么写，你会随机丢字。** 而且这个 bug 只在网络慢的时候出现，**本地测不出来。**

**③ `decoder.decode(value, { stream: true })`**

中文是多字节。**一个汉字的三个字节可能被切在两次读取里。** 不加 `{ stream: true }` 就会出现 `�`。

**④ 不要直接透传上游的 JSON**

有人图省事：

```javascript
res.write(part + "\n\n");     // 把上游 chunk 原样转发
```

**能跑，但你把上游的字段结构暴露给了前端。** 换模型时字段名一变，前端就崩。**自己抽一层 `{ text: piece }`，前端永远只认这一个格式。**

**⑤ 出错要发一条 error 再 `[DONE]`**

```text
不发 → 前端 reader 一直等，页面显示"已连接"但永远不动
```

---

# 第 4 步：跑起来，量三个数字（20 分钟）

**① 启动：**

```bash
node server.js
```

**② 浏览器打开 `http://localhost:3000`，点"开始"。**

**你应该看到：**

```text
首字耗时 0.4 秒左右
字一个接一个出现，约 60ms 一个
完成后显示总耗时约 3 秒
```

**③ 记下三个数字：**

| 指标 | 我测到的 | 意义 |
|---|---|---|
| 首字耗时 | | **用户体验的全部** |
| 总耗时 | | 成本相关（token 数） |
| 平均字间隔 | | 打字机是否自然 |

**④ 打开 F12 → Network → `/api/chat`：**

```text
Status: pending
Type:   eventsource（或 fetch）
Size:   持续增长
```

**Size 一直在涨，说明真的在流。**

---

# 第 5 步：故意犯五个错（25 分钟）

## 错误 1：不透传 `stream: true`

把 `stream: true` 删掉（用真 key 才能看出效果）。

**现象：** 上游返回完整 JSON，你的解析拿不到 `delta.content`，**浏览器一个字都收不到，最后 `[DONE]` 直接结束。**

## 错误 2：只按 `\n` 切，不按 `\n\n`

把 `buffer.split("\n\n")` 改成 `buffer.split("\n")`。

**现象：** 大部分正常，偶发丢字或 `JSON.parse` 报错。

**原因：** 一条消息被切成了 `data: {...}` 和空行两段，你的 `find` 有时拿不到。

## 错误 3：`JSON.parse` 不 try/catch

把 `try { json = JSON.parse(raw) } catch { continue; }` 改成直接 `JSON.parse(raw)`。

**现象：** 偶尔整个进程崩，报 `Unexpected end of JSON input`。

**原因：** 半截 JSON 被解析了。

## 错误 4：不用 `{ stream: true }` 解码

把 `decoder.decode(value, { stream: true })` 改成 `decoder.decode(value)`。

**现象：** 中文偶尔变成 `�`，或者句子中间出现乱字。

**改回带 `stream: true` 的版本，再刷几次对比。**

## 错误 5：出错什么都不发

把 `catch` 里的两行 `res.write` 删掉，直接 `res.end()`。

**然后把 `API_KEY` 改成一个错的 key，用真接口跑。**

**现象：** 页面永远显示"已连接，等待第一个字…"，**用户不知道发生了什么。**

---

# 第 6 步：真模型接上（15 分钟）

**把 `.env` 里的 key 换成真的，重启，再跑一次。**

**你要观察三件事：**

```text
① 首字耗时变长了（模型要先生成第一个 token）
② 字间隔不均匀（模型生成速度有快有慢，这是正常的）
③ 有时会在中间"顿一下"，然后继续（网络或模型侧排队）
```

**另外：注意上游可能在流中间报错**（比如超出上下文、内容审核）。

```text
data: {"error":{"message":"..."}}
```

**你的转发逻辑里，`delta.content` 是空的，这条会被 `continue` 跳过 —— 用户什么都看不到。**

**改进：** 检查 `json.error`，转成一条给用户的错误消息：

```javascript
if (json.error) {
  res.write(`data: ${JSON.stringify({ error: json.error.message ?? "模型出错" })}\n\n`);
  continue;
}
```

**这是真模型接上之后才会遇到的问题。**

---

# 第 7 步：写学习笔记（10 分钟）

---

# 第 8 步：课后练习

## 练习一：加"停止生成"（20 分钟）

前端加一个"停止"按钮：

```text
① 前端：AbortController.abort()
② 后端：req.on("close") 时也要 abort 上游
```

**关键在后端：** 用户点了停止，你的 Node 还在读上游流、还在花钱。**必须把上游也断掉。**

```javascript
const ac = new AbortController();
req.on("close", () => ac.abort());          // 浏览器断了，上游也断
// fetch 时传 signal: ac.signal
```

**这一题很值钱：** 不做，用户点十次停止，你付十次钱。

## 练习二：把 Markdown 渲染对（20 分钟）

流式输出的 Markdown 有个特殊问题：**半截的 ``` 代码块、半个 `**`。**

三种做法：

```text
A. 每收到一次就整体重渲染（简单，Markdown 解析器自己会容错）
B. 只在收到 \n 时重渲染（减少闪烁）
C. 先纯文本显示，结束后再渲染 Markdown（最稳）
```

**先做 A（三行代码），再想想为什么很多产品选 C。**

## 练习三：量出"首字耗时"的构成（10 分钟）

把链路拆成三段，各测一次：

```text
① 浏览器 → 你的 Node：多少毫秒
② 你的 Node → 上游：多少毫秒
③ 上游第一个 token：多少毫秒
```

**提示：在 `/api/chat` 里打三个 `Date.now()`。**

**你会发现：如果 ① 就占了 800ms，那不是模型慢，是你的网关或 DNS 慢。**

---

# 第 9 步：最终验收

## A. 管道通了

- [ ] 用 mock 能跑出打字机效果
- [ ] 首字耗时 < 1 秒
- [ ] `[DONE]` 后页面显示总耗时
- [ ] Network 里 Size 持续增长

## B. 四个技术点

- [ ] `stream: true` 知道为什么必须加
- [ ] `buffer` 留最后一段，我知道不这么做会怎样
- [ ] `{ stream: true }` 解码，中文不乱
- [ ] 只转发 `{ text }`，不透传上游 JSON

## C. 真模型跑通

- [ ] 真 key 能出字
- [ ] 我观察到了字间隔不均匀
- [ ] 我处理了流中间的 `error`

## D. 五个错都踩过

- [ ] 见过不透传导致的"一个字都没有"
- [ ] 见过按 `\n` 切导致的丢字
- [ ] 见过半截 JSON 崩进程
- [ ] 见过中文乱码
- [ ] 见过出错不提示导致页面永远转圈

## E. 成本概念

- [ ] 我知道流式不省钱
- [ ] 我知道它省的是"感知时间"
- [ ] 我知道用户点"停止"时要 abort 上游

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 三个数字都记了
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **流式输出的全部难点，是把上游的字节块正确切开、正确解码、正确转发。**
> **切在半个汉字上、切在半个 JSON 上，这两种情况你必须都写过代码才算会。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 一个字都不出来 | 上游没 `stream: true`，或没解析 `delta.content` | 检查请求体和解析 |
| 偶发丢字 | 按 `\n` 切而不是 `\n\n` | 用 `\n\n` 切，buffer 留尾段 |
| 中文出现 `�` | 解码没加 `{ stream: true }` | `decoder.decode(value, { stream: true })` |
| 进程崩，报 `Unexpected end of JSON` | 半截 JSON 被 parse | `try/catch` 跳过 |
| 页面一直"等待第一个字" | 出错没发给前端 | `catch` 里发 `{ error }` + `[DONE]` |
| 流中间报错但页面无感 | 只取了 `delta.content` | 检查 `json.error` |
| 用户点停止还在烧钱 | 没 abort 上游 | `req.on("close", () => ac.abort())` |
| 上线后一次来一大批 | Nginx 缓冲 | 第 114 节那四行 |
