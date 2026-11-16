# 第 96 节课：多步任务

> 这节课结束时，你手上有：`第05节课/03-练习代码/agent/agent.js`，一个最多跑 8 轮的循环，每轮打印"模型想干什么 → 实际返回什么"，停止时说出原因；外加三种死循环的复现脚本 `run-faults.js`。

**时间**：约 120 分钟
**前置**：第 95 节课做出来的 `dispatch.js` 和 `single-step.js`（一轮能跑通，messages 是 4 条）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

`single-step.js` 能完成一次"问 → 调工具 → 答"。它的结构是硬编码的：

```text
第一轮（一定调工具）
第二轮（一定给答案）
```

**真实任务不是两轮。** 用户问"先看看有哪些表，再告诉我这个月卖了多少"，至少要：

```text
第 1 轮：list_tables
第 2 轮：query_stats
第 3 轮：给答案
```

你不可能为每个可能的问题写死轮数。**你需要一个循环，让模型自己决定什么时候停。**

## 0.2 今天这个坑长什么样

你写了个 `while (true)`，第一版跑得很好。第二天早上你打开终端，看到这个：

```text
--- 第 47 轮 ---
模型想干什么：list_tables({})
实际返回什么：{"ok":true,"tables":[{"name":"orders",...}]}

--- 第 48 轮 ---
模型想干什么：list_tables({})
实际返回什么：{"ok":true,"tables":[{"name":"orders",...}]}
```

**47 轮了，还在做同一件事。** 账单在涨，日志在刷，用户没拿到答案。

死循环在 Agent 里不是"偶发 bug"，是**默认会发生的现象**。因为循环的下一步由模型决定，而模型可能：

- 看不到上一步的结果（你没回传）；
- 被你的报错绕晕（参数一直不合法）；
- 认定"再看一次就有新信息"（重复调同一个工具）。

**这一节要做的，是让循环停得住，并且停下来的时候你能知道为什么。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 主循环 | 反复"问模型 → 执行 → 回传"，直到某个条件成立 | `agent.js` |
| 停止条件 | 循环退出的判断，必须有三条，不能只靠模型 | `stopReason` |
| 轨迹（trace） | 每一轮做了什么、花了多久、返回了什么 | 每轮日志 + `trace` 数组 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `agent.js` | `第05节课/03-练习代码/agent/` | 主循环，最多 8 轮 |
| `mock-llm.js` | 同上（修改） | 加一个"两步剧本"分支 |
| `run-faults.js` | 同上 | 用三种故障各跑一次 |
| `logs/` | 同上 | 每次运行的轨迹文件 |
| `NOTES.md` | `第05节课/02-笔记/` | 你的记录 |

---

# 第 1 步：复制目录，改一个名字（10 分钟）

## 1.1 做什么 / 为什么

从这一节开始，`single-step.js` 升级成 `agent.js`。**不要删掉 `single-step.js`**——出问题时用它对照，能快速判断是"单步就错"还是"循环错"。

这个判断很值钱：

| 现象 | 说明问题在 |
|---|---|
| `single-step.js` 就错 | 工具、校验、回传格式 |
| `single-step.js` 对，`agent.js` 错 | 循环、状态、停止条件 |

## 1.2 操作

```text
cd /d B:\OPC-Distance_study\每周课程\03-数据与智能\第14周-智能体与工具
xcopy 第04节课\03-练习代码\agent 第05节课\03-练习代码\agent /E /I
cd 第05节课\03-练习代码\agent
node single-step.js 这个月卖了多少
```

**确认还能看到 22 和 23269.11。**

## 1.3 屏幕上应该看到什么

```text
> node single-step.js 这个月卖了多少
用户：这个月卖了多少？
[mock] 第 1 轮，消息 2 条，可用工具 4 个，问题「这个月卖了多少？」
...
=== 第二轮 ===
finish_reason：stop
最终回答：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。
```

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 找不到 `single-step.js` | 复制的是第 03 节课的目录 | 确认源路径是 `第04节课\...` |
| 报 `no such table` | `data` 没复制 | `node seed.js` |
| 答案是"查询失败" | 上一节 `dispatch` 没写完 | 回第 95 节第 3 步 |

---

# 第 2 步：给假模型加一个两步剧本（15 分钟）

## 2.1 做什么 / 为什么

第 94 节课的假模型只会"调一个工具，然后回答"。**它演不出多步。**

要看到三轮循环，必须让它学会：第一轮查表，第二轮查数，第三轮回答。

**注意：这是给测试工具加能力，不是给业务代码开后门。** 真实模型不需要你教它分几步，它自己会判断。

## 2.2 操作

打开 `mock-llm.js`，找到这一段：

```text
  // 已经有工具结果 → 给最终答案
  if (toolMessages.length > 0) {
```

**在它上面插入：**

```javascript
  // 两步剧本：只在问题里明确要求"先看表"时生效。
  // 目的是让学员能观察到三轮循环，不代表真实模型的行为。
  const wantsTwoStep = /先看表|先查表|两步/.test(question);
  const listDone = toolMessages.some(function (m) {
    return String(m.content).indexOf('"tables"') !== -1;
  });

  if (wantsTwoStep && !listDone) {
    return assistantTool("list_tables", {});
  }

  if (wantsTwoStep && listDone && toolMessages.length === 1) {
    return assistantTool("query_stats", { sql: buildSql("这个月卖了多少") });
  }
```

## 2.3 屏幕上应该看到什么

先单独测：

```text
node -e "const {mockChat}=require('./mock-llm'); const r=mockChat({messages:[{role:'user',content:'先看表，再告诉我这个月卖了多少'}],tools:[1,2,3,4]}); console.log(r.choices[0].message.tool_calls[0].function.name)"
```

```text
[mock] 第 1 轮，消息 1 条，可用工具 4 个，问题「先看表，再告诉我这个月卖了多少」
list_tables
```

**再模拟第二轮**（手动塞一条 tool 消息）：

```text
node -e "const {mockChat}=require('./mock-llm'); const r=mockChat({messages:[{role:'user',content:'先看表，再告诉我这个月卖了多少'},{role:'assistant',content:null,tool_calls:[]},{role:'tool',tool_call_id:'x',content:'{\"ok\":true,\"tables\":[{\"name\":\"orders\"}]}'}],tools:[1,2,3,4]}); console.log(r.choices[0].message.tool_calls[0].function.name)"
```

```text
[mock] 第 2 轮，消息 3 条，可用工具 4 个，问题「先看表，再告诉我这个月卖了多少」
query_stats
```

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第一轮就 `query_stats` | 插入位置在 `toolMessages.length > 0` 之后 | 往上挪，必须在它前面 |
| 第二轮还是 `list_tables` | `listDone` 判断的字符串不对 | 用 `indexOf('"tables"')`，注意有引号 |
| 第二轮返回答案 | 你的 `toolMessages.length === 1` 写成了 `> 0` | 改回来 |

---

# 第 3 步：写主循环（30 分钟）

## 3.1 做什么 / 为什么

循环的骨架只有 20 行，剩下的都是"打印"和"判断"。

**四个必须有的东西：**

| 东西 | 不写会怎样 |
|---|---|
| `MAX_ROUNDS` 上限 | 模型不给答案时永远跑 |
| 每轮 `messages.push(msg)` | 模型看不到自己上一轮说过什么 |
| 失败结果也 push | 模型以为工具没执行完 |
| `stopReason` | 停下来时你不知道为什么 |

## 3.2 操作

**建 `agent.js`：**

```javascript
const fs = require("fs");
const path = require("path");
const { chat } = require("./llm");
const { TOOLS } = require("./tools");
const { dispatch } = require("./dispatch");
const { db } = require("./db");

const MAX_ROUNDS = 8;
const REPEAT_LIMIT = 3;

const STOP = {
  ANSWER: "answer",
  MAX_ROUNDS: "max_rounds",
  FATAL: "fatal_error",
  REPEATED: "repeated_call"
};

function preview(result) {
  const text = JSON.stringify(result);
  if (text.length <= 220) {
    return text;
  }
  return text.slice(0, 220) + "（共 " + text.length + " 字符，已截断）";
}

function signature(name, args) {
  return name + ":" + JSON.stringify(args);
}

async function runAgent(question) {
  const messages = [
    {
      role: "system",
      content:
        "你是一个订单数据分析助手。需要数据时必须调用工具，不要凭印象编造数字。" +
        "拿到足够的数据后直接回答，不要重复调用同一个工具。"
    },
    { role: "user", content: question }
  ];

  const trace = [];
  let stopReason = STOP.MAX_ROUNDS;
  let finalText = "";
  const seen = new Map();

  console.log("用户：" + question);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const t0 = Date.now();
    const resp = await chat(messages, TOOLS);
    const choice = resp.choices[0];
    const msg = choice.message;

    console.log("\n--- 第 " + round + " 轮 ---");
    console.log("finish_reason：" + choice.finish_reason);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const names = msg.tool_calls.map(function (c) {
        return c.function.name + "(" + c.function.arguments + ")";
      });
      console.log("模型想干什么：" + names.join(" | "));
    } else {
      console.log("模型想干什么：给答案");
    }

    messages.push(msg);

    if (choice.finish_reason !== "tool_calls" || !msg.tool_calls) {
      finalText = msg.content || "";
      console.log("模型给出答案：" + finalText);
      stopReason = STOP.ANSWER;
      break;
    }

    let fatal = false;

    for (const call of msg.tool_calls) {
      const name = call.function.name;

      let args = null;
      try {
        args = JSON.parse(call.function.arguments);
      } catch (e) {
        console.log("参数 JSON 解析失败：" + e.message);
      }

      const result =
        args === null
          ? { ok: false, error: "arguments 不是合法 JSON" }
          : dispatch(name, args);

      const ms = Date.now() - t0;
      console.log("实际返回什么：" + preview(result));
      console.log("耗时：" + ms + "ms");

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });

      trace.push({
        round: round,
        tool: name,
        args: args,
        ok: result.ok,
        error: result.error || null,
        rowCount: result.rowCount === undefined ? null : result.rowCount,
        ms: ms
      });

      const sig = signature(name, args);
      const count = (seen.get(sig) || 0) + 1;
      seen.set(sig, count);

      if (count >= REPEAT_LIMIT) {
        console.log("同一个调用重复了 " + count + " 次，停止。签名：" + sig.slice(0, 120));
        stopReason = STOP.REPEATED;
        fatal = true;
        break;
      }

      if (result.fatal) {
        console.log("工具报告致命错误，停止：" + result.error);
        stopReason = STOP.FATAL;
        fatal = true;
        break;
      }
    }

    if (fatal) {
      break;
    }
  }

  const okCount = trace.filter(function (t) {
    return t.ok;
  }).length;

  console.log("\n=== 结束 ===");
  console.log("停止原因：" + stopReason + "，共 " + trace.length + " 次工具调用，" + (trace.length - okCount) + " 次失败");

  if (stopReason === STOP.MAX_ROUNDS) {
    console.log("警告：轮数用完，没有拿到最终答案。");
  }

  const logDir = path.join(__dirname, "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.join(logDir, "run-" + Date.now() + ".json");
  fs.writeFileSync(
    logFile,
    JSON.stringify({ question: question, stopReason: stopReason, finalText: finalText, trace: trace }, null, 2),
    "utf8"
  );
  console.log("轨迹已写入：" + path.relative(__dirname, logFile));

  return { text: finalText, stopReason: stopReason, trace: trace };
}

const question = process.argv.slice(2).join(" ") || "这个月卖了多少？";
runAgent(question).catch(function (e) {
  console.log("运行出错：" + e.stack);
});
```

## 3.3 逐段说明

**`const t0 = Date.now()` 在循环开始处**

它测的是"从发请求到工具执行完"的整轮耗时。**不要用它测单个工具**，工具执行通常只有几毫秒，网络才是大头。

**`messages.push(msg)` 在判断之前**

不管这一轮是工具调用还是最终答案，assistant 的消息都要进历史。**顺序错了，真接口会报 400。**

**`if (choice.finish_reason !== "tool_calls" || !msg.tool_calls)`**

两个条件都要判。有的模型会给 `finish_reason: "stop"` 但 `tool_calls` 是空数组；有的会给 `"tool_calls"` 但数组是 `null`。**两个都判，才不会漏。**

**`seen` 这张表**

它记录"这个工具 + 这组参数"出现了几次。**这是兜底哨兵，不是三个停止条件之一。** 它拦的是"模型犯轴"，不是"任务没完成"。

**`result.fatal`**

`dispatch` 里对 `no such table`、`unable to open database`、`database is locked` 这三种错误打了 `fatal: true`。**这类错误重试一万次也不会好，必须停。**

**写日志文件**

每次都写一个新文件，文件名带时间戳。**不要覆盖同一个文件**——出问题时你需要对比"上一次好的"和"这一次坏的"。

## 3.4 屏幕上应该看到什么

```text
> node agent.js 先看表，再告诉我这个月卖了多少

用户：先看表，再告诉我这个月卖了多少
[mock] 第 1 轮，消息 2 条，可用工具 4 个，问题「先看表，再告诉我这个月卖了多少」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：list_tables({})
实际返回什么：{"ok":true,"tables":[{"name":"orders","columns":["id","order_no","customer","city","amount","status","created_at"]}]}
耗时：18ms

--- 第 2 轮 ---
finish_reason：tool_calls
模型想干什么：query_stats({"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"})
实际返回什么：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"}
耗时：21ms

--- 第 3 轮 ---
finish_reason：stop
模型想干什么：给答案
模型给出答案：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。

=== 结束 ===
停止原因：answer，共 2 次工具调用，0 次失败
轨迹已写入：logs\run-1763270500000.json
```

```text
> type logs\run-1763270500000.json
{
  "question": "先看表，再告诉我这个月卖了多少",
  "stopReason": "answer",
  "finalText": "这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。",
  "trace": [
    {
      "round": 1,
      "tool": "list_tables",
      "args": {},
      "ok": true,
      "error": null,
      "rowCount": null,
      "ms": 18
    },
    {
      "round": 2,
      "tool": "query_stats",
      "args": {
        "sql": "SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"
      },
      "ok": true,
      "error": null,
      "rowCount": 1,
      "ms": 21
    }
  ]
}
```

**三轮，两次工具调用，一个答案。** 这是成功的样子。

**注意"耗时"是整轮耗时，两轮分别是 18ms / 21ms。** 真接口会在几百毫秒到几秒，跑完你会对"每轮多少钱"有直觉。

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第 2 轮又 `list_tables` | `listDone` 判断失败 | `type` 看返回里有没有 `"tables"` |
| 第 2 轮直接答了 | 你插入的代码在 `toolMessages.length > 0` 之后 | 往上挪 |
| `stopReason` 是 `max_rounds` | 模型没给答案，跑到第 8 轮 | 看 `trace` 最后一条是什么 |
| 日志目录没有 | `fs.mkdirSync` 失败 | 检查是否有写权限 |
| `Unexpected token` 在参数解析 | 模型给的 `arguments` 不合法 | 打印原始 `arguments` |

---

# 第 4 步：把轮数改成 2，看"没有答案的结束"（10 分钟）

## 4.1 做什么 / 为什么

**最危险的失败不是报错，是静默结束。**

用户问了一句话，界面一直转圈，后台的循环跑完 8 轮退出了，什么都没返回。你在日志里看到 `stopReason: "max_rounds"`，但用户看不到。

## 4.2 操作

把 `MAX_ROUNDS` 改成 `2`，跑同一个问题：

```text
node agent.js 先看表，再告诉我这个月卖了多少
```

## 4.3 屏幕上应该看到什么

```text
--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：list_tables({})
实际返回什么：{"ok":true,"tables":[...]}
耗时：16ms

--- 第 2 轮 ---
finish_reason：tool_calls
模型想干什么：query_stats({"sql":"SELECT ..."})
实际返回什么：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,...}
耗时：19ms

=== 结束 ===
停止原因：max_rounds，共 2 次工具调用，0 次失败
警告：轮数用完，没有拿到最终答案。
轨迹已写入：logs\run-1763270510000.json
```

**两件事都发生了：数据查到了，答案没生成。**

如果这是网页应用，用户看到的是空白。**所以第 98 节课会把 `finalText` 为空当成一个必须处理的错误**，而不是"正常结束"。

**改回 8。**

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 没有警告那行 | 你的 `if (stopReason === STOP.MAX_ROUNDS)` 写错 | 对照常量名 |
| 第 2 轮就出答案了 | `MAX_ROUNDS` 改成了 3 | 改回 2 再跑 |
| `停止原因：repeated_call` | 两次调用签名相同 | 正常，说明剧本没生效 |

---

# 第 5 步：造三个死循环（25 分钟）

## 5.1 做什么 / 为什么

这三种是真实项目里最常见的。**你要亲手让它们发生一次，才能在别人的日志里认出来。**

| 编号 | 原因 | 怎么造 |
|---|---|---|
| A | 结果没回传 | 手动注释 `messages.push({role:"tool"...})` |
| B | 参数总不合法 | `MOCK_FAULT=bad_args` |
| C | 模型重复调同一工具 | `MOCK_FAULT=loop` |

## 5.2 操作

**先建 `run-faults.js`：**

```javascript
const { spawnSync } = require("child_process");

const cases = [
  { label: "C 模型重复调同一工具", env: { MOCK_FAULT: "loop" }, q: "这个月卖了多少" },
  { label: "B 参数总不合法", env: { MOCK_FAULT: "bad_args" }, q: "查一下订单" },
  { label: "D 调不存在的工具", env: { MOCK_FAULT: "unknown_tool" }, q: "删掉 orders 表" }
];

for (const c of cases) {
  console.log("\n\n########## " + c.label + " ##########");
  const r = spawnSync(process.execPath, ["agent.js", c.q], {
    cwd: __dirname,
    env: Object.assign({}, process.env, c.env),
    encoding: "utf8"
  });
  process.stdout.write(r.stdout || "");
  if (r.stderr) {
    process.stdout.write("[stderr] " + r.stderr);
  }
}
```

**跑它：**

```text
node run-faults.js
```

**注意：`MOCK_FAULT` 是进程级环境变量，`spawnSync` 每次启动一个新的 node，互不影响。** 如果你在同一个进程里改 `process.env`，第二次不会生效。

## 5.3 屏幕上应该看到什么

**C：模型重复调同一工具**

```text
########## C 模型重复调同一工具 ##########
用户：这个月卖了多少
[mock] 第 1 轮，消息 2 条，可用工具 4 个，问题「这个月卖了多少」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：list_tables({})
实际返回什么：{"ok":true,"tables":[{"name":"orders","columns":["id","order_no","customer","city","amount","status","created_at"]}]}
耗时：15ms

--- 第 2 轮 ---
finish_reason：tool_calls
模型想干什么：list_tables({})
实际返回什么：{"ok":true,"tables":[{"name":"orders","columns":["id","order_no","customer","city","amount","status","created_at"]}]}
耗时：15ms

--- 第 3 轮 ---
finish_reason：tool_calls
模型想干什么：list_tables({})
实际返回什么：{"ok":true,"tables":[{"name":"orders","columns":["id","order_no","customer","city","amount","status","created_at"]}]}
耗时：16ms
同一个调用重复了 3 次，停止。签名：list_tables:{}

=== 结束 ===
停止原因：repeated_call，共 3 次工具调用，0 次失败
```

**B：参数总不合法**

```text
########## B 参数总不合法 ##########
用户：查一下订单
[mock] 第 1 轮，消息 2 条，可用工具 4 个，问题「查一下订单」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：get_order({"order_no":"42"})
实际返回什么：{"ok":false,"error":"参数不合法：order_no 格式不对，要匹配 ^SO[0-9]{5}$，收到的是 \"42\""}
耗时：4ms

--- 第 2 轮 ---
finish_reason：tool_calls
模型想干什么：get_order({"order_no":"42"})
实际返回什么：{"ok":false,"error":"参数不合法：order_no 格式不对，要匹配 ^SO[0-9]{5}$，收到的是 \"42\""}
耗时：1ms

--- 第 3 轮 ---
finish_reason：tool_calls
模型想干什么：get_order({"order_no":"42"})
实际返回什么：{"ok":false,"error":"参数不合法：order_no 格式不对，要匹配 ^SO[0-9]{5}$，收到的是 \"42\""}
耗时：1ms
同一个调用重复了 3 次，停止。签名：get_order:{"order_no":"42"}

=== 结束 ===
停止原因：repeated_call，共 3 次工具调用，3 次失败
```

**D：调不存在的工具**

```text
########## D 调不存在的工具 ##########
用户：删掉 orders 表
[mock] 第 1 轮，消息 2 条，可用工具 4 个，问题「删掉 orders 表」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：drop_table({"name":"orders"})
实际返回什么：{"ok":false,"error":"没有这个工具：drop_table"}
耗时：1ms
...
停止原因：repeated_call，共 3 次工具调用，3 次失败
```

**三种都停下来了。** 但你要看清楚：**停下来的原因是"重复哨兵"，不是"模型想通了"。** 如果没有这个哨兵，它们会一直跑到 8 轮，然后以 `max_rounds` 结束。

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 三个都正常返回答案 | `spawnSync` 没传 `env` | 检查 `env: Object.assign(...)` |
| 只跑了第一个 | 循环里 `return` 了 | 用 `for...of` 不要 return |
| 中文乱码 | 子进程编码 | `encoding: "utf8"` |
| 没看到 `[mock]` 日志 | 假模型里 `console.log` 被删了 | 加回来 |

---

# 第 6 步：A 类死循环——结果没回传（15 分钟）

## 6.1 做什么 / 为什么

这一类最隐蔽：**代码不报错，工具执行成功，模型就是不知道。**

## 6.2 操作

1. 把 `agent.js` 里这段**注释掉**：

```javascript
      // messages.push({
      //   role: "tool",
      //   tool_call_id: call.id,
      //   content: JSON.stringify(result)
      // });
```

2. 跑：

```text
node agent.js 这个月卖了多少
```

## 6.3 屏幕上应该看到什么

```text
用户：这个月卖了多少
[mock] 第 1 轮，消息 2 条，可用工具 4 个，问题「这个月卖了多少」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：query_stats({"sql":"SELECT ... LIMIT 100"})
实际返回什么：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,...}
耗时：17ms

--- 第 2 轮 ---
finish_reason：tool_calls
模型想干什么：query_stats({"sql":"SELECT ... LIMIT 100"})
实际返回什么：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,...}
耗时：18ms

--- 第 3 轮 ---
finish_reason：tool_calls
模型想干什么：query_stats({"sql":"SELECT ... LIMIT 100"})
...
同一个调用重复了 3 次，停止。
停止原因：repeated_call，共 3 次工具调用，0 次失败
```

**特征：`0 次失败`，但循环停不下来。**

## 6.4 定位方法

**第一步：打印每一轮的 `messages` 角色序列。**

```text
node -e "const a=[]; a.push({role:'user'}); console.log(a.map(m=>m.role).join(' → '))"
```

在 `agent.js` 的循环开头加一行：

```javascript
    console.log("消息角色：" + messages.map(function (m) { return m.role; }).join(" → "));
```

正常应该是：

```text
消息角色：system → user → assistant → tool → assistant
```

出问题时是：

```text
消息角色：system → user → assistant → assistant
```

**看到连续两个 `assistant`，就是结果没回传。**

**第二步：数一下 tool 消息的数量。**

```javascript
console.log("tool 消息数：" + messages.filter(function (m) { return m.role === "tool"; }).length);
```

如果是 0，而 `trace` 里明明有成功的调用，就是漏了 push。

**第三步：检查 push 的位置。** 它必须在 `dispatch` 之后、下一次 `chat` 之前。写到了 `for` 循环外面，多个工具调用时只有最后一个被回传。

**改回来。**

---

# 第 7 步：故意犯四个错（15 分钟）

## 错误 1：`while (true)`，没有上限

**操作：** 把 `for (let round = 1; round <= MAX_ROUNDS; round++)` 改成 `let round = 1; while (true) {`，并在循环末尾加 `round++;`。

**现象：** 用 `MOCK_FAULT=loop` 跑：

```text
--- 第 47 轮 ---
...
--- 第 48 轮 ---
```

**永远不会停。** 只能 `Ctrl + C`。

**原因：** 重复哨兵那两行 `break` 只跳出了内层的 `for (const call of msg.tool_calls)`，`fatal = true` 之后外层应该 `break`——但你换成了 `while (true)`，后面那个 `if (fatal) break;` 一旦被删或写错，就没有任何东西能让 `while` 停下来。

**这一类 bug 的特征：** 内层 `break` 看起来"写了"，但它管不到外层。**`break` 只跳一层，这是 JavaScript 的规则。**

**怎么查：** `Ctrl + C` 之后数日志行数。超过 `MAX_ROUNDS`，说明上限没生效。再检查内层 `break` 和外层 `break` 是不是都写了。

**改回来。**

## 错误 2：每轮重新拼 `messages`

**操作：** 把 `for` 循环里的 `messages.push(msg)` 和 tool 的 push 都删掉，改成每轮开头：

```javascript
    const messages = [
      { role: "system", content: "你是一个订单数据分析助手。" },
      { role: "user", content: question }
    ];
```

**屏幕上：**

```text
--- 第 1 轮 ---
模型想干什么：list_tables({})
--- 第 2 轮 ---
模型想干什么：list_tables({})
--- 第 3 轮 ---
模型想干什么：list_tables({})
```

**原因：** 每一轮都从"只有用户问题"开始。模型看不到上一轮自己调过什么，也看不到结果。

**这个错误在真接口上更贵：** 你会把同一段 prompt 发 8 次，8 次都从零开始推理。

**怎么查：** 打印 `messages.length`，如果每轮都是 2，就是这个错。

**改回来。**

## 错误 3：只在最后打印，没有每轮日志

**操作：** 删掉循环里的 `console.log("--- 第 " + round + " 轮 ---")` 和"模型想干什么 / 实际返回什么"。

**现象：** 死循环时终端一片空白，你看不到它在做什么，只能看到最后一行：

```text
停止原因：repeated_call，共 3 次工具调用，0 次失败
```

**原因：** 日志是给"事后查"用的，也是给"事中看"用的。**循环里没有日志，等于闭着眼睛调试。**

**怎么查：** 加回来。**每一轮至少三行：轮次、模型要什么、实际返回什么。**

## 错误 4：多个 `tool_calls` 只执行第一个

**操作：** 把 `for (const call of msg.tool_calls)` 改成：

```javascript
    const call = msg.tool_calls[0];
```

**现象（假模型只返回一个调用，所以看不出来）：**

```text
停止原因：answer，共 1 次工具调用，0 次失败
```

**换成真模型，它可能一次返回两个调用：**

```json
[
  { "id": "call_a", "function": { "name": "list_tables", "arguments": "{}" } },
  { "id": "call_b", "function": { "name": "count_orders", "arguments": "{\"status\":\"paid\"}" } }
]
```

你只回了 `call_a` 的结果。下一次请求里，`call_b` 没有对应的 `role: "tool"` 消息，真接口报 400：

```text
Invalid parameter: An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'.
```

**原因：** 一个 assistant 消息里的每个 `tool_call` 都必须有一条 tool 消息回应。**少一条都不行。**

**怎么查：** 对比 `msg.tool_calls.length` 和这一轮 push 的 tool 消息数量。

**改回来。**

---

# 第 8 步：写学习笔记（10 分钟）

打开 `第05节课/02-笔记/NOTES.md`，按下面的小标题写。**小标题一个字都不要改。**

```markdown
# 第 96 节课学习笔记

## 一、为什么单步不够

举一个必须两步才能回答的问题：

## 二、主循环的骨架

凭记忆写出来（伪代码也行）：

## 三、三个停止条件

| 条件 | 怎么判断 | 停下来之后做什么 |
|---|---|---|
| 模型不再要工具 | | |
| 轮数用完 | | |
| 工具报致命错 | | |

第四个兜底哨兵是什么，为什么需要它：

## 四、每轮日志该记什么

我实际打印的字段：

为什么"耗时"要按轮记，不按工具记：

## 五、三轮的真实记录

把 `node agent.js 先看表，再告诉我这个月卖了多少` 的完整输出贴进来：

```text
（粘贴）
```

`stopReason` 是什么：

## 六、死循环原因一：结果没回传

现象：

怎么定位（写命令）：

## 七、死循环原因二：参数总不合法

现象：

怎么定位：

## 八、死循环原因三：模型重复调同一工具

现象：

怎么定位：

## 九、定位方法对照表

| 症状 | 最可能的原因 | 第一条命令 |
|---|---|---|
| 每轮调用完全相同，0 失败 | | |
| 每轮 ok:false，error 相同 | | |
| 工具名相同、参数不同，结果都为空 | | |
| 第 8 轮结束，没有答案 | | |

## 十、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| while(true) | | |
| 每轮重拼 messages | | |
| 没有每轮日志 | | |
| 只执行第一个 tool_call | | |

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `node agent.js 先看表，再告诉我这个月卖了多少` 跑出 3 轮和答案
- [ ] `logs\` 里有一个 json，`trace` 有 2 条
- [ ] `MAX_ROUNDS=2` 时看到 `max_rounds` 和警告
- [ ] 三种故障都复现了，都停在 `repeated_call`
- [ ] 我手动注释过 tool push，看到"0 次失败"的死循环
- [ ] 我做过四个错误实验
- [ ] 我能说出三个停止条件和那个兜底哨兵的区别
```

---

# 第 9 步：课后练习

## 练习一：把 `trace` 打印成表

在 `agent.js` 结束前，用 `console.table(trace)` 打一张表。

要求：列是 `round / tool / ok / rowCount / ms`。

**思考：** 哪一列最能帮你判断"这一轮有没有白跑"？

## 练习二：给"参数不合法"加一次自动重试

规则：同一个工具连续两次 `ok:false` 且错误以"参数不合法"开头时，在 `messages` 里追加一条 `role: "user"` 的提醒：

```text
上一个调用的参数不合法，请检查参数格式后重试，不要重复同样的参数。
```

**要求：** 只提醒一次，第三次直接停。

**思考：** 这条 `user` 消息插在 tool 消息后面，会不会破坏消息顺序？

## 练习三：把 `MAX_ROUNDS` 做成环境变量

```text
set MAX_ROUNDS=3
node agent.js 先看表，再告诉我这个月卖了多少
```

要求：没设置时默认 8，设置了就按设置的值，**并且打印出来**。

**思考：** 为什么这个值不该写死在代码里？

## 练习四：统计每次运行的成本

假模型的 `usage` 全是 0，所以先用"轮数 × 估算输入长度"来算。

要求：在日志里加一个 `estimatedChars` 字段，等于每一轮 `JSON.stringify(messages).length` 的和。

跑一次三步任务，看这个数字是多少。

**思考：** 如果每轮都把完整的 `messages` 发过去，第 8 轮的输入是第 1 轮的几倍？

## 练习五：用自己的话讲清

```text
1. 为什么循环必须有轮数上限？模型不是会说"我答完了"吗？
2. 三个停止条件分别防的是什么？兜底哨兵又防的是什么？
3. "结果没回传"的死循环，为什么日志里显示"0 次失败"？
4. 参数一直不合法时，你该改 prompt、改 description，还是改校验器？
5. 一个 assistant 消息带两个 tool_calls，你只回了一个，会发生什么？
```

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说出主循环的四件事：发、判、执行、回传
- [ ] 我能说出三个停止条件
- [ ] 我知道兜底哨兵不是停止条件，它是防"模型犯轴"
- [ ] 我知道 `max_rounds` 结束时必须给用户一个交代
- [ ] 我知道多个 `tool_calls` 必须逐个回传

## B. 实操

- [ ] `node agent.js 先看表，再告诉我这个月卖了多少` 输出 3 轮
- [ ] 最终回答里有 `22` 和 `23269.11`
- [ ] `logs\` 下有 json 文件，`trace` 长度是 2
- [ ] `MAX_ROUNDS=2` 时输出 `停止原因：max_rounds`
- [ ] `node run-faults.js` 三段都停在 `repeated_call`
- [ ] 注释 tool push 后复现"0 次失败"的循环

## C. 排错

- [ ] 看到每轮调用完全相同，我先查 `messages` 里有没有 `role:"tool"`
- [ ] 看到每轮 `ok:false`，我先看 `error` 文本
- [ ] 看到 400 提示 `tool_call_id`，我知道是漏回传某个调用
- [ ] 看到 `max_rounds`，我知道要看 `trace` 最后一条
- [ ] 看到 `no such table`，我知道这是 `fatal`，不该重试

## D. 笔记

- [ ] `NOTES.md` 十二个小标题都填了
- [ ] 贴了三轮完整输出
- [ ] 定位方法对照表四行都填了
- [ ] 四个错误都写了"现象 / 原因 / 怎么查"

## 本节课要能说出口的一句话

> **循环不是"跑到模型说停"，是"跑到三个条件里任意一个成立"——而且停下来时必须说得出为什么。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 每轮调用一模一样 | `messages` 里有没有 tool | 补 push，检查位置 |
| 第 8 轮结束没答案 | `trace` 最后一条 | 加轮数，或改 description |
| `repeated_call` | 签名是否相同 | 这是哨兵，不是 bug |
| `fatal_error` | 错误原文 | 修数据库，不要重试 |
| 400 提示 tool_call_id | 是否漏回传某个调用 | 循环 `msg.tool_calls` |
| 参数一直不合法 | `error` 文本 | 改 description 或校验器 |
| 模型重复调同一工具 | 返回结果是不是空的 | 让工具返回"没查到"而不是空数组 |
| 日志文件越来越大 | 每轮都写了完整 trace | 只写 trace，不写完整 messages |
