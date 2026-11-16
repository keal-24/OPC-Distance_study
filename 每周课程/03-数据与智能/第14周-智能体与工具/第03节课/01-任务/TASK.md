# 第 94 节课：让模型选择工具

> 这节课结束时，你手上有：`第03节课/03-练习代码/agent/mock-llm.js` 和 `llm.js`，同一段代码在 `MOCK=true` 时用假模型、在 `MOCK=false` 时接真接口，`node probe.js` 能打印出带 `tool_calls` 的完整返回。

**时间**：约 110 分钟
**前置**：第 93 节课做出来的 `tools.js`（四个工具）和 `validate.js`

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

上一节你把工具写成了这样：

```javascript
{ type: "function", function: { name: "list_tables", description: "...", parameters: {...} } }
```

它是一个数组里的一个对象。**它现在只存在于你的硬盘上，模型完全不知道。**

从 `tools.js` 到"模型真的调用它"，中间还差三步：

```text
① 把 TOOLS 放进请求体，字段名叫 tools
② 模型返回的不再是 content，而是 tool_calls
③ 你的程序读懂 tool_calls，去执行
```

这一节做 ① 和 ②，第 95 节课做 ③。

## 0.2 今天这个坑长什么样

最常见的第一次失败是这个：

你写好了 `tools`，发出去，拿到响应，打印 `message.content`：

```text
null
```

你以为模型坏了。

**其实是模型想调工具。** 它把话写在了另一个字段里：

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": { "name": "list_tables", "arguments": "{}" }
    }
  ]
}
```

`content` 是 `null`，`finish_reason` 是 `"tool_calls"`。**这是工具调用成功的标志，不是失败。**

第二个坑更贵：**没有 key，或者额度用完了，课就上不下去。**

所以这一节先写假模型。**假模型不是玩具，它是这一周的地基**——第 95 到 98 节课的所有循环、校验、权限、日志，都在没有网络的情况下跑通。真接口只在最后做一次对照。

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| `tools` 参数 | 请求体里那个数组，告诉模型"你能用哪些工具" | `llm.js` 的 `body` |
| `tool_calls` | 模型返回的"我要调这些工具"，是个数组 | `probe.js` 打印出来 |
| `finish_reason` | 这一轮为什么结束：调工具 / 说完了 / 被截断 | 判断该执行还是该收工 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `llm.js` | `第03节课/03-练习代码/agent/` | 统一入口，`MOCK` 开关 |
| `mock-llm.js` | 同上 | 假模型，关键词匹配，两轮 |
| `probe.js` | 同上 | 打印三次请求的原始返回 |
| `.env` | 同上 | `MOCK=true`，真接口的三个变量留空 |
| `NOTES.md` | `第03节课/02-笔记/` | 你的记录 |

---

# 第 1 步：复制目录，确认开关（10 分钟）

## 1.1 做什么 / 为什么

从这一节开始，`agent` 目录里同时有"假模型"和"真接口"两条路。**默认走假模型**，`MOCK=true`。

**为什么默认假模型：**

| 理由 | 具体 |
|---|---|
| 不花钱 | 一节课会调几十次，真接口每次几百到几千 token |
| 不看网络 | 断网、限流、key 过期都不会打断你 |
| 可复现 | 同一句话永远返回同一个动作，你能对照输出 |
| 能造故障 | 真接口不会配合你演"参数总是错"（第 96 节要用） |

## 1.2 操作

```text
cd /d B:\OPC-Distance_study\每周课程\03-数据与智能\第14周-智能体与工具
xcopy 第02节课\03-练习代码\agent 第03节课\03-练习代码\agent /E /I
cd 第03节课\03-练习代码\agent
node check-db.js
```

**检查 `.env`**（复制过来已经有了）：

```text
MOCK=true
OPENAI_BASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
```

**三个变量先留空。** `MOCK=true` 时它们不会被读取。

## 1.3 屏幕上应该看到什么

```text
> node check-db.js
表：orders
orders 行数：200
```

```text
> type .env
MOCK=true
OPENAI_BASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
```

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `type` 不是内部命令 | 你在 PowerShell 里 | 这个课用 `cmd`，从开始菜单打开 |
| `.env` 里是乱码 | 保存成了 UTF-16 | 用 VS Code 另存为 UTF-8 |
| 少复制了 `tools.js` | `xcopy` 目标已存在时行为不同 | 手动复制整个文件夹 |

---

# 第 2 步：看清一次请求和一次返回（20 分钟）

## 2.1 请求体

一次带工具的请求，body 长这样：

```json
{
  "model": "你账号里可用的模型名",
  "messages": [
    { "role": "system", "content": "你是一个数据分析助手。" },
    { "role": "user", "content": "这个月卖了多少？" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "query_stats",
        "description": "对 orders 表执行一条只读 SELECT……",
        "parameters": { "type": "object", "properties": { "sql": { "type": "string" } }, "required": ["sql"] }
      }
    }
  ],
  "tool_choice": "auto",
  "temperature": 0
}
```

**四个字段你必须记住：**

| 字段 | 值 | 说明 |
|---|---|---|
| `tools` | 数组 | 就是 `tools.js` 里的 `TOOLS`，原样放进来 |
| `tool_choice` | `"auto"` | 让模型自己决定调不调；写 `"none"` 就一个都不调 |
| `model` | 你账号里的名字 | 不写死版本号，从环境变量读 |
| `temperature` | `0` | 工具调用要稳定，不要发挥 |

**`tools` 和 `functions` 的区别：** 老接口用 `functions` + `function_call`，新接口用 `tools` + `tool_calls`。**这一周只用 `tools`。** 你在网上搜到 `functions` 的写法，别抄。

## 2.2 返回体

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": { "name": "query_stats", "arguments": "{\"sql\":\"SELECT COUNT(*) AS cnt FROM orders LIMIT 100\"}" }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": { "prompt_tokens": 812, "completion_tokens": 46, "total_tokens": 858 }
}
```

**五个地方要盯：**

| 位置 | 值 | 你该怎么用 |
|---|---|---|
| `choices[0].finish_reason` | `"tool_calls"` | **唯一可靠的判断依据** |
| `choices[0].message.content` | `null` | 可能为 null，打印前判空 |
| `choices[0].message.tool_calls` | 数组 | 可能有多个，要循环 |
| `...function.name` | `query_stats` | 拿去 `dispatch` |
| `...function.arguments` | **字符串** | 必须 `JSON.parse`，不能直接当对象 |

**`finish_reason` 的常见值：**

| 值 | 意思 | 你该做什么 |
|---|---|---|
| `"stop"` | 模型说完了 | 把 `content` 给用户，结束 |
| `"tool_calls"` | 模型要调工具 | 执行，把结果回传，继续循环 |
| `"length"` | 被 max_tokens 截断 | 答案不完整，要么加预算要么让模型分步 |
| `"content_filter"` | 被内容审核拦了 | 第 104 节课讲怎么处理 |

## 2.3 为什么不用现成的 Agent 框架

你会在网上看到 LangChain 的 `AgentExecutor`、`initialize_agent`，三行代码就能跑起来。

**这门课不用，原因有三个：**

1. **看不见返回结构。** 出问题时它把 `tool_calls` 包了三层，你不知道模型到底返回了什么；
2. **多一个装不上的包。** 依赖白名单里没有它，版本冲突时没人帮你修；
3. **它会替你决定循环怎么停。** 而这一周的核心就是"循环怎么停"——这件事你必须自己写过一遍。

**手写这个循环大约 80 行。** 80 行你能完全看懂，框架的 8000 行你不能。

## 2.4 屏幕上应该看到什么

这一节不跑代码。**把上面两个 JSON 抄进笔记**，等下和自己打印出来的对照。

## 2.5 如果不是这样

如果你已经在某处抄了 `functions` 写法，现在删掉。**混用两套协议，模型会返回一个你解析不了的结构。**

---

# 第 3 步：写 `llm.js`（20 分钟）

## 3.1 做什么 / 为什么

`llm.js` 只做一件事：**把"调模型"封装成一个函数**，内部决定走假模型还是真接口。

这样第 95–98 节课的 `agent.js` 里只有一行 `await chat(messages, TOOLS)`，**切换真假不用改业务代码。**

## 3.2 操作

**建 `llm.js`：**

```javascript
require("dotenv").config();

// 注意：process.env.MOCK 是字符串。"false" 也是真值，所以必须显式比较。
const USE_MOCK = String(process.env.MOCK).toLowerCase() !== "false";

const BASE_URL = String(process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = String(process.env.OPENAI_API_KEY || "");
const MODEL = String(process.env.OPENAI_MODEL || "");

async function chat(messages, tools) {
  if (USE_MOCK) {
    const { mockChat } = require("./mock-llm");
    return mockChat({ messages, tools });
  }

  if (!BASE_URL || !API_KEY || !MODEL) {
    throw new Error(
      "MOCK=false 时必须在 .env 里配 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL"
    );
  }

  const res = await fetch(BASE_URL + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + API_KEY
    },
    body: JSON.stringify({
      model: MODEL,
      messages: messages,
      tools: tools,
      tool_choice: "auto",
      temperature: 0
    }),
    signal: AbortSignal.timeout(60000)
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error("接口返回 " + res.status + "：" + text.slice(0, 500));
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("接口返回的不是 JSON，前 200 个字符：" + text.slice(0, 200));
  }

  return data;
}

module.exports = { chat, USE_MOCK };
```

## 3.3 三个细节

**`AbortSignal.timeout(60000)`**

Node 18 原生支持。60 秒没响应就抛错，**不让你的循环卡死**。

**`res.text()` 再 `JSON.parse`，不是直接 `res.json()`**

因为接口出错时返回的常常是 HTML 错误页。`res.json()` 会抛一个 `SyntaxError: Unexpected token '<'`，你完全看不出是 401 还是 502。**先拿文本，报错时能看到原文。**

**`/chat/completions` 拼在 `BASE_URL` 后面**

`BASE_URL` 里已经包含 `/v1`（各家不一样，看你的服务商文档）。**代码里不要再硬写 `/v1`**，否则会拼成 `/v1/v1/chat/completions`，报 404。

## 3.4 屏幕上应该看到什么

```text
node -e "const {USE_MOCK}=require('./llm'); console.log('USE_MOCK =', USE_MOCK)"
```

```text
USE_MOCK = true
```

**把 `.env` 里的 `MOCK` 改成 `false`，再跑一次：**

```text
USE_MOCK = false
```

**改回 `true`。** 这一节剩下的部分都不需要 key。

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `USE_MOCK = false` 但你没改 | `.env` 里有多行 `MOCK`，后面的覆盖前面 | `type .env` 看全文 |
| 报 `fetch is not defined` | Node 低于 18 | `node -v`，升级 |
| 报 `AbortSignal.timeout is not a function` | Node 16 | 升级到 18 以上 |

---

# 第 4 步：写 `mock-llm.js`（30 分钟）

## 4.1 做什么 / 为什么

假模型要模拟三件事：

1. **第一轮**：看用户问题，返回一个 `tool_call`；
2. **第二轮**：看到 `role: "tool"` 的消息，返回最终答案；
3. **不确定时**：返回纯文本，不调工具。

**它不需要"聪明"，只需要"结构对"。** 结构对了，你的循环就能跑；聪明不聪明是模型的事。

## 4.2 操作

**建 `mock-llm.js`：**

```javascript
// 假模型：不联网，按关键词返回固定结构的响应。
// 它的唯一目的是让工具调用流程在没有 key 的情况下能完整跑通。

let seq = 0;

function nextId() {
  seq += 1;
  return "call_mock_" + String(seq).padStart(3, "0");
}

function envelope(message, finishReason) {
  return {
    id: "chatcmpl-mock-" + Date.now(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "mock-model",
    choices: [
      {
        index: 0,
        message: message,
        finish_reason: finishReason
      }
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

function assistantText(text) {
  return envelope({ role: "assistant", content: text }, "stop");
}

function assistantTool(name, args) {
  return envelope(
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: nextId(),
          type: "function",
          function: { name: name, arguments: JSON.stringify(args) }
        }
      ]
    },
    "tool_calls"
  );
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function buildSql(question) {
  const month = currentMonth();

  if (/城市|地区|哪里卖/.test(question)) {
    return (
      "SELECT city, COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders " +
      "WHERE substr(created_at, 1, 7) = '" + month + "' AND status = 'paid' " +
      "GROUP BY city ORDER BY total DESC LIMIT 100"
    );
  }

  if (/退款|状态|占比/.test(question)) {
    return "SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status ORDER BY cnt DESC LIMIT 100";
  }

  if (/平均|客单价/.test(question)) {
    return "SELECT ROUND(AVG(amount), 2) AS avg_amount, COUNT(*) AS cnt FROM orders WHERE status = 'paid' LIMIT 100";
  }

  return (
    "SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders " +
    "WHERE substr(created_at, 1, 7) = '" + month + "' AND status = 'paid' LIMIT 100"
  );
}

function answerFromToolResult(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return assistantText("工具返回的不是 JSON，我看不懂：" + String(content).slice(0, 80));
  }

  if (data.ok === false) {
    return assistantText("查询失败了：" + data.error);
  }

  if (data.tables) {
    const parts = data.tables.map(function (t) {
      return t.name + "(" + t.columns.join(", ") + ")";
    });
    return assistantText("数据库里有这些表：" + parts.join("；"));
  }

  if (data.rows) {
    if (data.rows.length === 0) {
      return assistantText("查询没有返回任何行。可能是条件写错了，或者这个时间段确实没有数据。");
    }

    const first = data.rows[0];

    if (first.status && first.cnt !== undefined) {
      const total = data.rows.reduce(function (s, r) {
        return s + r.cnt;
      }, 0);
      const parts = data.rows.map(function (r) {
        const pct = total === 0 ? 0 : Math.round((r.cnt / total) * 1000) / 10;
        return r.status + " " + r.cnt + " 单（" + pct + "%）";
      });
      return assistantText("订单状态分布：" + parts.join("，") + "。");
    }

    if (first.city) {
      const parts = data.rows.map(function (r) {
        return r.city + " " + r.total + " 元（" + r.cnt + " 单）";
      });
      return assistantText("按城市统计（本月已支付）：" + parts.join("，") + "。");
    }

    if (first.avg_amount !== undefined) {
      return assistantText("已支付订单平均每单 " + first.avg_amount + " 元，共 " + first.cnt + " 单。");
    }

    if (first.cnt !== undefined) {
      return assistantText(
        "这个月（" + currentMonth() + "）已支付订单 " + first.cnt + " 笔，金额合计 " + first.total + " 元。"
      );
    }

    return assistantText("查询结果：" + JSON.stringify(data.rows));
  }

  return assistantText("工具返回了结果，但我不知道怎么读：" + JSON.stringify(data).slice(0, 120));
}

function mockChat(input) {
  const messages = input.messages || [];
  const tools = input.tools || [];
  const fault = String(process.env.MOCK_FAULT || "");

  const lastUser = messages
    .slice()
    .reverse()
    .find(function (m) {
      return m.role === "user";
    });
  const question = lastUser ? String(lastUser.content) : "";

  const toolMessages = messages.filter(function (m) {
    return m.role === "tool";
  });

  const round = toolMessages.length + 1;
  console.log(
    "[mock] 第 " + round + " 轮，消息 " + messages.length + " 条，可用工具 " + tools.length + " 个，问题「" + question + "」"
  );

  // 故障开关：给第 95、96 节课复现死循环用
  if (fault === "loop") {
    return assistantTool("list_tables", {});
  }

  if (fault === "bad_args" && toolMessages.length === 0) {
    return assistantTool("get_order", { order_no: "42" });
  }

  if (fault === "unknown_tool" && toolMessages.length === 0) {
    return assistantTool("drop_table", { name: "orders" });
  }

  // 已经有工具结果 → 给最终答案
  if (toolMessages.length > 0) {
    const last = toolMessages[toolMessages.length - 1];
    return answerFromToolResult(last.content);
  }

  // 第一轮 → 按关键词选工具
  if (/有哪些表|表结构|什么表|数据库里有什么|几张表/.test(question)) {
    return assistantTool("list_tables", {});
  }

  const orderMatch = question.match(/SO\d{5}/);
  if (orderMatch) {
    return assistantTool("get_order", { order_no: orderMatch[0] });
  }

  if (/多少|统计|总额|销售额|卖了多少|几个|排行|占比|平均|客单价|这个月|本月|城市|退款/.test(question)) {
    return assistantTool("query_stats", { sql: buildSql(question) });
  }

  return assistantText(
    "我是假模型，只认得几个关键词。你可以问「数据库里有哪些表」或者「这个月卖了多少」。"
  );
}

module.exports = { mockChat };
```

## 4.3 三个设计取舍

**① 为什么用关键词，不用正则大全**

关键词匹配会漏。用户问"最近生意怎么样"，它匹配不到，会返回纯文本。

**这是故意的。** 假模型的任务是跑通流程，不是理解自然语言。**遇到漏匹配，你应该去改关键词列表，而不是怀疑循环写错了。** 真模型没有这个问题。

**② 为什么第二轮必须返回答案**

如果你的循环写错了（比如没把 `role: "tool"` 的消息放进 `messages`），`toolMessages.length` 永远是 0，假模型就会**一直返回同一个 `tool_call`**。

**这不是假模型的 bug，是它帮你暴露了循环的 bug。** 第 96 节课会用这一点来诊断死循环。

**③ 为什么 `arguments` 是字符串**

真接口返回的就是字符串。假模型如果返回对象，你的 `JSON.parse` 会报错——**在假模型上跑通的代码，换真接口就崩。** 必须从一开始就模拟真实结构。

## 4.4 屏幕上应该看到什么

先单独测一次：

```text
node -e "const {mockChat}=require('./mock-llm'); console.log(JSON.stringify(mockChat({messages:[{role:'user',content:'这个月卖了多少'}],tools:[{},{},{},{}]}),null,2))"
```

```text
[mock] 第 1 轮，消息 1 条，可用工具 4 个，问题「这个月卖了多少」
{
  "id": "chatcmpl-mock-1763270400000",
  "object": "chat.completion",
  "created": 1763270400,
  "model": "mock-model",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_mock_001",
            "type": "function",
            "function": {
              "name": "query_stats",
              "arguments": "{\"sql\":\"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

**盯住这三个地方：**

1. `content` 是 `null`；
2. `arguments` 是**带转义的字符串**，不是对象；
3. `finish_reason` 是 `"tool_calls"`。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 返回的是纯文本 | 关键词没匹配上 | 换"这个月卖了多少"，或改正则 |
| `arguments` 是对象 | 你把 `JSON.stringify` 删了 | 加回来，必须序列化 |
| 报 `seq is not defined` | `let seq = 0` 写在了函数里 | 放到文件顶层 |
| 每轮 id 都是 `call_mock_001` | Node 每次启动都重置计数 | 正常，只在同一进程内递增 |

---

# 第 5 步：跑 `probe.js`，看三次返回（15 分钟）

## 5.1 做什么 / 为什么

`probe` 是探针。它做一件很笨但很重要的事：**把模型返回的原始 JSON 原样打印出来。**

以后所有"模型不听话"的问题，第一步都是打印原始返回。**不看原始数据就猜，是在浪费时间。**

## 5.2 操作

**建 `probe.js`：**

```javascript
const { chat, USE_MOCK } = require("./llm");
const { TOOLS } = require("./tools");

const questions = ["数据库里有哪些表？", "这个月卖了多少？", "你好"];

async function main() {
  console.log("MOCK = " + USE_MOCK);
  console.log("发出 " + TOOLS.length + " 个工具：" + TOOLS.map((t) => t.function.name).join(", "));

  for (const q of questions) {
    console.log("\n===== 问题：" + q + " =====");

    const resp = await chat([{ role: "user", content: q }], TOOLS);
    console.log(JSON.stringify(resp, null, 2));

    const choice = resp.choices[0];
    console.log("--- 解读 ---");
    console.log("finish_reason：" + choice.finish_reason);
    console.log("content：" + JSON.stringify(choice.message.content));
    console.log("tool_calls：" + JSON.stringify(choice.message.tool_calls || null));

    if (choice.message.tool_calls) {
      for (const call of choice.message.tool_calls) {
        const args = JSON.parse(call.function.arguments);
        console.log("要调 " + call.function.name + "，参数对象是：" + JSON.stringify(args));
      }
    }
  }
}

main().catch(function (e) {
  console.log("出错：" + e.message);
});
```

**跑它：**

```text
node probe.js
```

## 5.3 屏幕上应该看到什么

**第一段（`id` / `created` / `usage` 与 4.4 形状相同，这里只贴 `choices[0]`）：**

```text
MOCK = true
发出 4 个工具：list_tables, query_stats, count_orders, get_order

===== 问题：数据库里有哪些表？ =====
[mock] 第 1 轮，消息 1 条，可用工具 4 个，问题「数据库里有哪些表？」
{
  "index": 0,
  "message": {
    "role": "assistant",
    "content": null,
    "tool_calls": [
      {
        "id": "call_mock_001",
        "type": "function",
        "function": {
          "name": "list_tables",
          "arguments": "{}"
        }
      }
    ]
  },
  "finish_reason": "tool_calls"
}
--- 解读 ---
finish_reason：tool_calls
content：null
tool_calls：[{"id":"call_mock_001","type":"function","function":{"name":"list_tables","arguments":"{}"}}]
要调 list_tables，参数对象是：{}
```

**第二段的关键行：**

```text
===== 问题：这个月卖了多少？ =====
[mock] 第 1 轮，消息 1 条，可用工具 4 个，问题「这个月卖了多少？」
--- 解读 ---
finish_reason：tool_calls
content：null
tool_calls：[{"id":"call_mock_002","type":"function","function":{"name":"query_stats","arguments":"{\"sql\":\"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100\"}"}}]
要调 query_stats，参数对象是：{"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"}
```

**第三段（envelope 同上，只贴 `choices[0]` 和解读）：**

```text
===== 问题：你好 =====
[mock] 第 1 轮，消息 1 条，可用工具 4 个，问题「你好」
{
  "index": 0,
  "message": {
    "role": "assistant",
    "content": "我是假模型，只认得几个关键词。你可以问「数据库里有哪些表」或者「这个月卖了多少」。"
  },
  "finish_reason": "stop"
}
--- 解读 ---
finish_reason：stop
content："我是假模型，只认得几个关键词。你可以问「数据库里有哪些表」或者「这个月卖了多少」。"
tool_calls：null
```

**三次，三种结果：**

| 问题 | finish_reason | content | tool_calls |
|---|---|---|---|
| 有哪些表 | `tool_calls` | `null` | 1 个，`list_tables` |
| 这个月卖了多少 | `tool_calls` | `null` | 1 个，`query_stats` |
| 你好 | `stop` | 一段文字 | 无 |

**判断该不该执行工具，看 `finish_reason`，不看 `content` 有没有内容。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `content` 打印成 `undefined` | 字段不存在，不是 null | 用 `JSON.stringify` 打，才能区分 |
| 第二个问题也返回 `list_tables` | 你改过关键词顺序 | 检查 `/有哪些表/` 是不是排在前面 |
| `SyntaxError: Unexpected token o in JSON at position 1` | `arguments` 已经是对象了 | 假模型里漏了 `JSON.stringify` |
| 只打印了一段就退出 | `main()` 没 await | 用 `async function main` + `await` |

---

# 第 6 步：真接口与假接口的对照（10 分钟）

## 6.1 对照表

| 位置 | 真接口 | 假接口 | 你代码里必须怎么处理 |
|---|---|---|---|
| `id` | `chatcmpl-9x...` | `chatcmpl-mock-...` | 只用来记日志，不要解析 |
| `choices[0].finish_reason` | `tool_calls` / `stop` / `length` | 同左 | **只用它判断流程** |
| `message.content` | 调工具时通常 `null` | `null` | 打印前判空 |
| `message.tool_calls` | 数组，可能多个 | 数组，1 个 | 用 `for...of` 循环，不要取 `[0]` 了事 |
| `tool_calls[].id` | `call_abc123` | `call_mock_001` | **原样回传**，不要自己生成 |
| `type` | `"function"` | `"function"` | 校验一下，不是就跳过 |
| `function.name` | 你定义过的名字 | 同左 | 不在 `TOOLS` 里就拒绝 |
| `function.arguments` | JSON 字符串 | JSON 字符串 | `JSON.parse` 后还要过 schema |
| `usage` | 真实 token 数 | 全 0 | 只用来算成本，不要用来判断 |

## 6.2 真接口只跑一次

**先别急着改。** 等第 98 节课的完整 Agent 跑通，再回来：

```text
MOCK=false
OPENAI_BASE_URL=https://你的服务商地址/v1
OPENAI_API_KEY=你的key
OPENAI_MODEL=你账号里可用的模型名
```

跑 `node probe.js`，把 `usage` 的数字记进笔记，然后**改回 `MOCK=true`**。

**花费量级：** 三次请求，输入几百 token（主要来自四个工具的 description），输出几十 token，按你的服务商单价算是"几分钱"级别。不给具体价格，各家不一样。

**真模型可能不调工具。** 问"有哪些表"，它可能直接说"我不知道你的数据库结构"。这不是失败，是模型判断不需要工具。**要改的是 description，不是循环。**

**如果 `finish_reason` 是 `stop`、`tool_calls` 是 `null`：** 这一轮不执行工具，直接把 `content` 给用户。真接口常见的 401 是 key 错、404 是 `BASE_URL` 重复拼了 `/v1`。

---

# 第 7 步：故意犯四个错（15 分钟）

## 错误 1：忘了传 `tools`

**操作：** 把 `probe.js` 里的 `chat([...], TOOLS)` 改成 `chat([...], [])`。

**屏幕上：**

```text
===== 问题：这个月卖了多少？ =====
[mock] 第 1 轮，消息 1 条，可用工具 0 个，问题「这个月卖了多少？」
--- 解读 ---
finish_reason：tool_calls
content：null
tool_calls：[{"id":"call_mock_002","type":"function","function":{"name":"query_stats","arguments":"{\"sql\":\"SELECT ... LIMIT 100\"}"}}]
```

**看到了吗：可用工具 0 个，假模型照样返回 `tool_call`。**

因为假模型压根不看 `tools`，只按关键词匹配。**所以这个错误在假模型上完全看不出来。**

**真接口上结果完全不同：** 模型看不到任何工具，只返回 `stop` 和一段文字，比如"我没有查询数据库的能力"。

**这是假模型的局限之一：能验证流程，不能验证"模型到底收到了哪些工具"。**

**怎么查：** 打印 `TOOLS.length`；真接口第一次跑通时，核对"发出的工具数"和"模型选的工具名"。

**改回来。**

## 错误 2：把 `arguments` 当对象用

**操作：** 在 `probe.js` 里把

```javascript
const args = JSON.parse(call.function.arguments);
```

改成

```javascript
const args = call.function.arguments;
console.log("sql 是：" + args.sql);
```

**屏幕上：**

```text
要调 query_stats，参数对象是：{"sql":"SELECT ..."}
sql 是：undefined
```

**原因：** `arguments` 是**字符串**，`args.sql` 不存在。整串传给 `dispatch`，报的是 `参数必须是一个对象，收到的是 string`。

**怎么查：** 打印 `typeof call.function.arguments`。是 `string` 就必须 `JSON.parse`。

**改回来。**

## 错误 3：用 `content` 判断有没有工具调用

**操作：** 把 `probe.js` 里的

```javascript
if (choice.message.tool_calls) {
```

改成

```javascript
if (choice.message.content.length > 0) {
```

**屏幕上：**

```text
TypeError: Cannot read properties of null (reading 'length')
    at main (B:\...\probe.js:28:40)
```

**原因：** 调工具时 `content` 是 `null`，`null.length` 直接抛错。聊天接口里 `content` 永远是字符串，这一行是写顺手写出来的。

**怎么查：** 报 `Cannot read properties of null`，先看这一轮是不是 `finish_reason: "tool_calls"`。

**改回来，以后统一用 `finish_reason` 判断。**

## 错误 4：`if (process.env.MOCK)`

**操作：** 把 `llm.js` 里的

```javascript
const USE_MOCK = String(process.env.MOCK).toLowerCase() !== "false";
```

改成

```javascript
const USE_MOCK = process.env.MOCK;
```

然后 `.env` 里写 `MOCK=false`，跑 `node -e "console.log(require('./llm').USE_MOCK)"`。

**屏幕上：**

```text
false
```

**看起来对？把它放进 `if`：**

```javascript
if (USE_MOCK) { /* 走假模型 */ }
```

**`"false"` 是非空字符串，在 JavaScript 里是真值。** 所以它照样走假模型。

**验证：**

```text
node -e "console.log(Boolean('false'), Boolean(''), Boolean(undefined))"
```

```text
true false false
```

**原因：** 环境变量永远是字符串。`"false"`、`"0"`、`"no"` 都是真值。

**怎么查：** 打印 `typeof process.env.MOCK` 和 `JSON.stringify(process.env.MOCK)`。

**改回来。**
---

# 第 8 步：写学习笔记（10 分钟）

打开 `第03节课/02-笔记/NOTES.md`，按下面的小标题写。**小标题一个字都不要改。**

```markdown
# 第 94 节课学习笔记

## 一、一次请求的四个字段

| 字段 | 值 | 作用 |
|---|---|---|
| model | | |
| messages | | |
| tools | | |
| tool_choice | | |

## 二、tools 参数的结构

把 `query_stats` 那一个工具抄一遍（凭记忆）：

## 三、返回里的 tool_calls 长什么样

```json
（贴一段真实的 tool_calls）
```

`arguments` 是什么类型：

## 四、finish_reason 有哪几种值

| 值 | 意思 | 我该做什么 |
|---|---|---|
| stop | | |
| tool_calls | | |
| length | | |

## 五、假模型是怎么判断的

| 关键词 | 返回的工具 | 参数 |
|---|---|---|
| 有哪些表 / 表结构 | | |
| 这个月 / 多少 | | |
| SO00042 这种订单号 | | |
| 匹配不到 | | |

## 六、我看到的完整返回

把 `node probe.js` 第二段（这个月卖了多少）的完整 JSON 贴进来：

```json
（粘贴）
```

`usage` 里的三个数字是多少：

## 七、真接口与假接口的对照

| 位置 | 真接口 | 假接口 | 我必须怎么处理 |
|---|---|---|---|
| finish_reason | | | |
| content | | | |
| arguments | | | |
| tool_calls 的 id | | | |

## 八、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 忘了传 tools | | |
| arguments 当对象 | | |
| 用 content 判断 | | |
| if (process.env.MOCK) | | |

## 九、我还不懂的词

-

## 十、完成检查

- [ ] `node probe.js` 打印三段，前两段 `finish_reason` 是 `tool_calls`
- [ ] 我看到 `content` 是 `null`
- [ ] 我看到 `arguments` 是字符串
- [ ] 我知道 `finish_reason` 是唯一可靠的判断依据
- [ ] 我做过四个错误实验
- [ ] 我能说出假模型的三个局限
- [ ] 我的 `.env` 现在还是 `MOCK=true`
```

---

# 第 9 步：课后练习

## 练习一：让假模型一次返回两个工具调用

改 `assistantTool`，支持传数组，返回两个 `tool_calls`：

```json
[
  { "id": "call_mock_001", "function": { "name": "list_tables", "arguments": "{}" } },
  { "id": "call_mock_002", "function": { "name": "count_orders", "arguments": "{\"status\":\"paid\"}" } }
]
```

问题"先看看表，再数一下已支付多少"时返回这两个。

**思考：** 你的 `probe.js` 能处理两个吗？如果不能，问题在哪一行？

## 练习三：制造一次"模型不调工具"

把问题改成"帮我看看数据"，跑 `probe.js`（改 `questions` 数组）。

记录：`finish_reason` 是什么？`content` 是什么？

**然后回答：** 真实用户问这种模糊问题时，你会怎么改？改 prompt、改 description，还是加一个"澄清"工具？

## 练习四：用自己的话讲清

```text
1. 模型返回 tool_calls 时，content 为什么是 null？
2. 为什么必须看 finish_reason，不能看 content 有没有内容？
3. 假模型和真接口，哪些字段必须一模一样？为什么？
4. 假模型有什么它验证不了的东西？
5. 为什么这一周不直接用 LangChain？
```

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说出 `tools` 参数放在请求体的哪一层
- [ ] 我知道 `tool_choice: "auto"` 的意思
- [ ] 我能说出 `finish_reason` 的三种常见值
- [ ] 我知道 `arguments` 是字符串，必须 `JSON.parse`
- [ ] 我知道 `content` 可能是 `null`

## B. 实操

- [ ] `node -e "console.log(require('./llm').USE_MOCK)"` 输出 `true`
- [ ] `node probe.js` 打印三段完整 JSON
- [ ] 第一段 `tool_calls[0].function.name` 是 `list_tables`
- [ ] 第二段的 `arguments` 里有 `substr(created_at, 1, 7)`
- [ ] 第三段 `finish_reason` 是 `stop`

## C. 排错

- [ ] 看到 `Cannot read properties of null`，我知道是 `content` 判空问题
- [ ] 看到 `undefined` 的参数，我知道是漏了 `JSON.parse`
- [ ] `MOCK=false` 却还走假模型，我知道是字符串真值问题
- [ ] 真接口 404，我知道先查 `BASE_URL` 有没有重复 `/v1`

## D. 笔记

- [ ] `NOTES.md` 十个小标题都填了
- [ ] 贴了完整的 `tool_calls` JSON
- [ ] 对照表填了四行
- [ ] 四个错误都写了"现象 / 原因 / 怎么查"

## 本节课要能说出口的一句话

> **模型说"我要调工具"的时候，答案不在 `content` 里，在 `tool_calls` 里——而你要看的是 `finish_reason`。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `content` 是 `null` | `finish_reason` 是不是 `tool_calls` | 正常，去读 `tool_calls` |
| `arguments` 里全是 `\"` | 它是 JSON 字符串 | `JSON.parse` 一次就好 |
| 模型永远不调工具 | `tools` 传了吗、模型支持吗 | 打印请求体，换支持工具的模型 |
| `MOCK=false` 无效 | 字符串真值 | 用 `!== "false"` 比较 |
| 401 | key | 重新生成，去掉首尾空格 |
| 404 | `BASE_URL` | 不要重复拼 `/v1` |
| 假模型一直返回同一个工具 | 你的循环没回传结果 | 第 96 节课会讲，这是诊断信号 |
| `AbortError` | 超时 | 检查网络，或把 60000 调大 |
