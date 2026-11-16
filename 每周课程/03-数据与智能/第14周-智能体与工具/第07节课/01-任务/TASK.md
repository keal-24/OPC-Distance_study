# 第 98 节课：完成工具调用流程

> 这节课结束时，你手上有：`第07节课/03-练习代码/agent/` 里一个能自己查库的 Agent——两个工具 `list_tables` / `query_stats`，强制 LIMIT、只读连接、每轮 tool_call 写成 JSONL 日志，5 个业务问题各跑一次并留下答案。

**时间**：约 120 分钟
**前置**：第 97 节课做出来的 `agent.js`（带 `guardedDispatch`、权限表、确认框）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

七天下来，你有这些零件：

| 零件 | 在哪一节 | 现在能干什么 |
|---|---|---|
| 工具定义 | 93 | 四个工具，description 写清了边界 |
| 假模型 | 94 | 没 key 也能返回 `tool_calls` |
| 分派与校验 | 95 | 参数错了返回人话，进程不崩 |
| 主循环 | 96 | 最多 8 轮，停下来会说原因 |
| 权限门 | 97 | 只读直接跑，写操作要确认，黑名单一票否决 |

**这些零件现在散在四个目录里，每节课复制一次。** 它们还没在一起跑过一个真实任务。

## 0.2 今天这个坑长什么样

你把零件拼起来，跑第一个业务问题："这个月卖了多少？"

它答对了：22 笔，23269.11 元。

老板接着问："那上个月呢？"

**你说不出来。** 因为你没有日志，不知道它查了什么、用的什么 SQL、有没有失败过。

第二个问题更麻烦。老板问："退款的比例高不高？"

Agent 回答："9%。" 老板问："哪来的 9%？"

**你还是说不出来。** 因为工具调用没有留痕。

**这一节要交付的不是"能答对"，是"答对之后能证明它怎么答的"。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 最小工具集 | 只给 Agent 完成任务必需的工具，多一个都不给 | 只留 `list_tables` / `query_stats` |
| 只读查询通道 | 一条只允许 SELECT、强制 LIMIT 的专用通道 | `queryStats` |
| 调用日志（JSONL） | 一行一个 JSON，每轮工具调用都留一条 | `logger.js` |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `tools.js` | `第07节课/03-练习代码/agent/` | 只保留两个只读工具 |
| `tools-run.js` | 同上 | `queryStats` 完整安全版 |
| `logger.js` | 同上 | JSONL 日志 |
| `agent.js` | 同上 | 最终循环，接日志 |
| `main.js` | 同上 | 5 个业务问题批量跑 |
| `security-check.js` | 同上 | 四种攻击的真实结果 |
| `logs/agent-YYYY-MM-DD.jsonl` | 同上 | 验收证据 |
| `NOTES.md` | `第07节课/02-笔记/` | 你的记录 |

---

# 第 1 步：复制，然后做减法（15 分钟）

## 1.1 做什么 / 为什么

从第 06 节课复制过来。**然后删东西。**

要删的：

```text
send_email        第 97 节加的，这一节不需要
delete_order      同上，而且它本来就该被删掉
count_orders      和 query_stats 功能重叠，模型会选错
get_order         这一节的 5 个问题都不需要单笔详情
```

**为什么要删：**

| 理由 | 具体 |
|---|---|
| 工具越多，选错概率越高 | 4 个工具时模型已经会在 `count_orders` 和 `query_stats` 之间犹豫 |
| 每个工具都占 prompt | 6 个工具的 description 加起来上千字，每轮都发 |
| 有副作用的工具需要确认 | 确认会打断批量跑，第 5 步没法自动化 |
| 少一个工具，少一类漏洞 | `delete_order` 留着，你就得一直证明它被挡住了 |

**判断标准：完成这 5 个问题，最少需要哪几个工具？**

答案是两个：一个用来看结构（`list_tables`），一个用来查数（`query_stats`）。

## 1.2 操作

```text
cd /d B:\OPC-Distance_study\每周课程\03-数据与智能\第14周-智能体与工具
xcopy 第06节课\03-练习代码\agent 第07节课\03-练习代码\agent /E /I
cd 第07节课\03-练习代码\agent
```

**把 `tools.js` 整个替换成两个工具：**

```javascript
const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_tables",
      description:
        "列出数据库里所有表的名字和列定义。当用户问“有哪些表”“表结构是什么”“这个库能查什么”时调用。" +
        "不需要参数。返回 {ok:true, tables:[{name, columns:[...]}]}。" +
        "它只返回结构，不返回数据行；不要用它查数量或金额。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_stats",
      description:
        "对 orders 表执行一条只读 SELECT，返回结果行。当用户问数量、金额、排行、占比、平均值、某个月的数据时调用。" +
        "只能查 orders 一张表，不能修改数据。返回 {ok:true, rows, rowCount, sql}。" +
        "如果结果为空，rows 是空数组，不要重复调用同样的 SQL。",
      parameters: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description:
              "一条 SQLite SELECT 语句，必须以 SELECT 或 WITH 开头，不要写分号，必须以 LIMIT 结尾且不超过 100。" +
              "表结构：orders(id INTEGER, order_no TEXT, customer TEXT, city TEXT, amount REAL, status TEXT, created_at TEXT)。" +
              "status 只有 paid / pending / refunded；金额列叫 amount；" +
              "created_at 是 'YYYY-MM-DD HH:MM:SS' 文本，按月过滤写 substr(created_at, 1, 7) = '2026-11'；" +
              "SQLite 没有 MONTH() / YEAR() 函数。"
          }
        },
        required: ["sql"],
        additionalProperties: false
      }
    }
  }
];

module.exports = { TOOLS };
```

**`permission.js` 同步改成只剩两个：**

```javascript
const LEVEL = {
  READ: "read",
  WRITE: "write",
  DANGER: "danger"
};

const REGISTRY = {
  list_tables: { level: LEVEL.READ, effect: "读取数据库的表结构" },
  query_stats: { level: LEVEL.READ, effect: "执行一条只读查询" }
};

const ALLOW = ["list_tables", "query_stats"];
const DENY = ["send_email", "delete_order", "drop_table", "run_shell", "write_file"];

function checkPermission(name) {
  if (DENY.indexOf(name) !== -1) {
    return { allowed: false, needConfirm: false, reason: "该工具在黑名单里，禁止执行：" + name };
  }
  if (ALLOW.indexOf(name) === -1) {
    return { allowed: false, needConfirm: false, reason: "该工具不在白名单里：" + name };
  }
  const meta = REGISTRY[name];
  if (!meta) {
    return { allowed: false, needConfirm: false, reason: "工具没有登记权限等级，按拒绝处理：" + name };
  }
  return { allowed: true, needConfirm: meta.level !== LEVEL.READ, level: meta.level, effect: meta.effect };
}

module.exports = { LEVEL, REGISTRY, ALLOW, DENY, checkPermission };
```

**`agent.js` 里的确认逻辑可以留着**，虽然这一节所有工具都不需要确认。**留着是为了防止你以后加工具时忘了这条路。**

## 1.3 屏幕上应该看到什么

```text
node -e "const {TOOLS}=require('./tools'); console.log(TOOLS.length, TOOLS.map(t=>t.function.name).join(', '))"
```

```text
2 list_tables, query_stats
```

```text
node -e "const p=require('./permission'); ['query_stats','send_email','delete_order'].forEach(n=>console.log(n, JSON.stringify(p.checkPermission(n))))"
```

```text
query_stats {"allowed":true,"needConfirm":false,"level":"read","effect":"执行一条只读查询"}
send_email {"allowed":false,"needConfirm":false,"reason":"该工具在黑名单里，禁止执行：send_email"}
delete_order {"allowed":false,"needConfirm":false,"reason":"该工具在黑名单里，禁止执行：delete_order"}
```

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 还是 6 个工具 | 你没整份替换 `tools.js` | 全选删除，粘贴新内容 |
| `send_email` 还在白名单 | 只改了 `tools.js` | `permission.js` 也要改 |
| `TOOLS.map` 报错 | `TOOLS` 不是数组 | 检查 `module.exports` |

---

# 第 2 步：写只读查询通道（30 分钟）

## 2.1 做什么 / 为什么

`query_stats` 是这一周唯一一个"输入由模型决定、又直接进数据库"的地方。**它是整个系统的攻击面。**

要防四件事：

| 风险 | 防法 |
|---|---|
| 模型写 `DELETE` / `DROP` | 只允许 `SELECT` / `WITH` 开头 + 关键字黑名单 |
| 模型一次写多条语句 | 禁止分号 + `prepare` 只接受单语句 |
| 模型 `SELECT *` 拉回 200 行 | 强制 `LIMIT`，超过 100 就改写成 100 |
| 模型写复杂查询把库拖死 | SQL 长度上限 + 连接只读 + 执行超时思考 |

## 2.2 操作

**把 `tools-run.js` 整个替换（这一节只需要两个工具）：**

```javascript
const { db } = require("./db");

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|reindex|pragma)\b/i;
const MAX_SQL_LENGTH = 2000;
const MAX_ROWS = 100;

function listTables() {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();

  const tables = rows.map(function (r) {
    const columns = db
      .prepare("PRAGMA table_info(" + r.name + ")")
      .all()
      .map(function (c) {
        return c.name;
      });
    return { name: r.name, columns: columns };
  });

  return { tables: tables };
}

function enforceLimit(sql) {
  const m = sql.match(/\blimit\s+(\d+)\s*$/i);

  if (!m) {
    return sql + " LIMIT " + MAX_ROWS;
  }

  if (Number(m[1]) > MAX_ROWS) {
    return sql.replace(/\blimit\s+\d+\s*$/i, "LIMIT " + MAX_ROWS);
  }

  return sql;
}

function queryStats(args) {
  let sql = String(args.sql).trim();

  if (sql.endsWith(";")) {
    sql = sql.slice(0, -1).trim();
  }

  if (sql.length > MAX_SQL_LENGTH) {
    throw new Error("SQL 太长（" + sql.length + " 字符），上限 " + MAX_SQL_LENGTH);
  }

  if (!/^(select|with)\b/i.test(sql)) {
    throw new Error("只允许 SELECT / WITH 开头的查询");
  }

  if (sql.includes(";")) {
    throw new Error("只允许一条语句，SQL 里出现了分号");
  }

  if (FORBIDDEN.test(sql)) {
    throw new Error("SQL 里出现了被禁止的关键字");
  }

  const finalSql = enforceLimit(sql);
  const rows = db.prepare(finalSql).all();

  return {
    rows: rows.slice(0, MAX_ROWS),
    rowCount: Math.min(rows.length, MAX_ROWS),
    sql: finalSql
  };
}

module.exports = { listTables, queryStats };
```

## 2.3 四层是怎么叠起来的

```text
第 1 层  字符串检查    只允许 SELECT / WITH 开头，不许分号
第 2 层  关键字黑名单  insert / update / delete / drop / alter ...
第 3 层  语句数限制    better-sqlite3 的 prepare 只接受一条语句
第 4 层  只读连接      readonly: true，物理上写不进去
```

**第 4 层是唯一不可绕过的。**

前两层是"文本匹配"，只要你能构造出不含这些词的等价写法，它就失效。举个真实的例子：

```text
SELECT load_extension('某个扩展')
```

**它不含任何一个被禁关键字。** 第 1、2 层都会放行。拦住它的是 SQLite 自己：

```text
SqliteError: not authorized
```

（因为 `better-sqlite3` 默认关闭扩展加载。）

**这说明什么：** 黑名单能挡住 99% 的"手滑"，挡不住"有意绕过"。**真正让你睡好觉的，是那条连接根本没有写权限。**

第 98 节课的 `db.js` 保持第 95 节的写法：

```javascript
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
```

**不要为了"方便测试"把它改成可写。** 你要测写操作，单独开一个脚本，用完就关。

## 2.4 屏幕上应该看到什么

```text
node -e "const t=require('./tools-run'); console.log(JSON.stringify(t.queryStats({sql:'SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status'})))"
```

```text
{"rows":[{"status":"paid","cnt":156},{"status":"pending","cnt":26},{"status":"refunded","cnt":18}],"rowCount":3,"sql":"SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status LIMIT 100"}
```

**注意最后那个 `LIMIT 100` 是代码补的，不是模型写的。** 这就是"模型管查什么，代码管不许乱来"。

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 报 `The supplied SQL string contains more than one statement` | 你的分号检查写在 `prepare` 之后 | 顺序：先拒绝，再执行 |
| `LIMIT` 没补上 | 正则不匹配（结尾有空格） | `trim()` 之后再判断 |
| 返回 200 行 | 只有 `slice`，没拼 `LIMIT` | 两个都要有 |
| `not authorized` | 正常，`load_extension` 被 SQLite 拒了 | 这是防线生效 |

---

# 第 3 步：写日志（20 分钟）

## 3.1 做什么 / 为什么

日志要回答三个问题：

```text
它查了什么？      → SQL 原文
查到了什么？      → rowCount / ok
花了多久、几轮？  → ms / round
```

**格式选 JSONL**（一行一个 JSON），不选 JSON 数组。原因：

| | JSON 数组 | JSONL |
|---|---|---|
| 追加一条 | 要读全文、改、写回 | `appendFileSync` 一行 |
| 中途崩溃 | 文件不完整，解析失败 | 前面几行仍然可读 |
| 用 `findstr` 查 | 要解析结构 | 直接匹配文本 |

## 3.2 操作

**建 `logger.js`：**

```javascript
const fs = require("fs");
const path = require("path");

function createRunLogger(question) {
  const dir = path.join(__dirname, "logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, "agent-" + day + ".jsonl");

  function write(obj) {
    const line = Object.assign({ ts: new Date().toISOString() }, obj);
    fs.appendFileSync(file, JSON.stringify(line) + "\n", "utf8");
  }

  write({ type: "start", question: question });

  return {
    file: file,

    toolCall: function (round, name, args, result, ms) {
      write({
        type: "tool_call",
        round: round,
        tool: name,
        args: args,
        ok: result.ok,
        error: result.error || null,
        rowCount: result.rowCount === undefined ? null : result.rowCount,
        sql: result.sql || null,
        ms: ms
      });
    },

    answer: function (round, text, stopReason) {
      write({ type: "answer", round: round, text: text, stopReason: stopReason });
    },

    end: function (stopReason, rounds, toolCalls) {
      write({ type: "end", stopReason: stopReason, rounds: rounds, toolCalls: toolCalls });
    }
  };
}

module.exports = { createRunLogger };
```

## 3.3 为什么每轮都写，而不是最后写

**因为死循环、崩溃、Ctrl + C 的时候，最后那次写不会发生。**

你在第 96 节课见过：循环跑到第 48 轮被 `Ctrl + C`。如果日志是最后统一写，你什么都不会有。**每轮一次 `appendFileSync`，崩溃前的记录全在。**

**代价是磁盘 IO。** 一天几十次调用，每次几行，可以忽略。**真正高并发时才需要换缓冲写入，你现在不需要。**

## 3.4 屏幕上应该看到什么

先跑一个最小调用，确认文件生成了：

```text
node -e "const {createRunLogger}=require('./logger'); const L=createRunLogger('测试'); L.toolCall(1,'query_stats',{sql:'SELECT 1 LIMIT 1'},{ok:true,rowCount:1,sql:'SELECT 1 LIMIT 1'},12); L.end('answer',1,1); console.log(L.file)"
```

```text
B:\OPC-Distance_study\每周课程\03-数据与智能\第14周-智能体与工具\第07节课\03-练习代码\agent\logs\agent-2026-11-16.jsonl
```

```text
type logs\agent-2026-11-16.jsonl
```

```text
{"ts":"2026-11-16T02:51:03.412Z","type":"start","question":"测试"}
{"ts":"2026-11-16T02:51:03.414Z","type":"tool_call","round":1,"tool":"query_stats","args":{"sql":"SELECT 1 LIMIT 1"},"ok":true,"error":null,"rowCount":1,"sql":"SELECT 1 LIMIT 1","ms":12}
{"ts":"2026-11-16T02:51:03.415Z","type":"end","stopReason":"answer","rounds":1,"toolCalls":1}
```

**三行，三种类型：start / tool_call / end。** 第 5 步会往里追加几百行。

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `logs` 目录不存在 | `mkdirSync` 没加 `recursive` | 加上 |
| 中文变成 `\u4e2d` | 正常，`JSON.stringify` 转义了 | 不用管，解析后是中文 |
| 每次运行覆盖 | 你把 `appendFileSync` 写成了 `writeFileSync` | 改成 append |
| 文件里一行都没有 | `write` 只定义了没调用 | 检查 `createRunLogger` 里有没有 `write({type:"start"...})` |

---

# 第 4 步：把日志接进循环（20 分钟）

## 4.1 做什么 / 为什么

日志要记在**工具执行之后、下一次请求之前**。这个位置保证：无论下一轮发生什么，这一轮的记录已经落盘。

## 4.2 操作

**覆盖 `agent.js`：**

```javascript
const { chat } = require("./llm");
const { TOOLS } = require("./tools");
const { dispatch } = require("./dispatch");
const { checkPermission } = require("./permission");
const { confirmTool, closeConfirm } = require("./confirm");
const { createRunLogger } = require("./logger");

const MAX_ROUNDS = 8;
const REPEAT_LIMIT = 3;

const STOP = {
  ANSWER: "answer",
  MAX_ROUNDS: "max_rounds",
  FATAL: "fatal_error",
  REPEATED: "repeated_call"
};

async function guardedDispatch(name, args) {
  const perm = checkPermission(name);

  if (!perm.allowed) {
    return { ok: false, error: perm.reason, denied: true };
  }

  if (perm.needConfirm) {
    const yes = await confirmTool(name, args, perm);
    if (!yes) {
      return { ok: false, error: "用户拒绝了这次操作", denied: true };
    }
  }

  return dispatch(name, args);
}

function preview(result) {
  const text = JSON.stringify(result);
  return text.length <= 240 ? text : text.slice(0, 240) + "（共 " + text.length + " 字符，已截断）";
}

async function runAgent(question) {
  const logger = createRunLogger(question);
  const messages = [
    {
      role: "system",
      content:
        "你是一个订单数据分析助手。需要数据时必须调用工具，不要凭常识编造数字。" +
        "拿到足够数据后直接回答，并在回答里带上关键数字。不要重复调用同一个工具。"
    },
    { role: "user", content: question }
  ];

  const seen = new Map();
  let stopReason = STOP.MAX_ROUNDS;
  let finalText = "";
  let toolCalls = 0;
  let round = 0;

  console.log("\n用户：" + question);

  for (round = 1; round <= MAX_ROUNDS; round++) {
    const t0 = Date.now();
    const resp = await chat(messages, TOOLS);
    const choice = resp.choices[0];
    const msg = choice.message;

    console.log("\n--- 第 " + round + " 轮 ---");
    console.log("finish_reason：" + choice.finish_reason);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      console.log(
        "模型想干什么：" +
          msg.tool_calls
            .map(function (c) {
              return c.function.name + "(" + c.function.arguments + ")";
            })
            .join(" | ")
      );
    } else {
      console.log("模型想干什么：给答案");
    }

    messages.push(msg);

    if (choice.finish_reason !== "tool_calls" || !msg.tool_calls) {
      finalText = msg.content || "";
      console.log("模型给出答案：" + finalText);
      stopReason = STOP.ANSWER;
      logger.answer(round, finalText, stopReason);
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
          : await guardedDispatch(name, args);

      const ms = Date.now() - t0;
      toolCalls += 1;

      console.log("实际返回什么：" + preview(result));
      console.log("耗时：" + ms + "ms");

      logger.toolCall(round, name, args, result, ms);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });

      const sig = name + ":" + JSON.stringify(args);
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

  logger.end(stopReason, round, toolCalls);
  closeConfirm();

  console.log("\n=== 结束 ===");
  console.log("停止原因：" + stopReason + "，共 " + toolCalls + " 次工具调用");
  console.log("日志：" + logger.file);

  return { text: finalText, stopReason: stopReason, toolCalls: toolCalls };
}

module.exports = { runAgent };
```

**`dispatch.js` 里也要给致命错误打标记**（第 96 节说过，没写的现在补上）：

```text
  } catch (e) {
    const fatal = /no such table|unable to open database|database is locked/i.test(e.message);
    return { ok: false, error: e.message, fatal: fatal };
  }
```

## 4.3 屏幕上应该看到什么

```text
node -e "require('./agent').runAgent('这个月卖了多少').then(r=>console.log('返回：'+JSON.stringify(r)))"
```

```text
用户：这个月卖了多少
[mock] 第 1 轮，消息 2 条，可用工具 2 个，问题「这个月卖了多少」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：query_stats({"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"})
实际返回什么：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"}
耗时：13ms

--- 第 2 轮 ---
finish_reason：stop
模型想干什么：给答案
模型给出答案：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。

=== 结束 ===
停止原因：answer，共 1 次工具调用
日志：B:\...\logs\agent-2026-11-16.jsonl
```

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `runAgent is not a function` | 没导出 | 文件末尾 `module.exports = { runAgent }` |
| `logger is not defined` | 忘了在函数里创建 | `const logger = createRunLogger(question)` |
| 日志里没有 `tool_call` | `logger.toolCall` 位置写错 | 必须在 `push` 之前 |
| 没有"日志："那行 | 你改了 `console.log` | 检查 `logger.file` |

---

# 第 5 步：跑 5 个业务问题（20 分钟）

## 5.1 做什么 / 为什么

**5 个问题，覆盖 5 种查询形态：**

| 问题 | 考察什么 |
|---|---|
| 这个月已支付的订单有多少笔，金额多少？ | 带条件聚合 |
| 哪个城市的销售额最高？ | 分组 + 排序 |
| 退款订单占比多少？ | 全表分组 + 比例 |
| 平均每单金额是多少？ | AVG |
| 数据库里有哪些表？ | 结构查询，不写 SQL |

**为什么要 5 个而不是 1 个：** 一个问题跑通可能只是运气。**5 个不同形态都跑通，才说明工具集和循环是稳的。**

## 5.2 操作

**建 `main.js`：**

```javascript
const { runAgent } = require("./agent");

const QUESTIONS = [
  "这个月已支付的订单有多少笔，金额多少？",
  "哪个城市的销售额最高？",
  "退款订单占比多少？",
  "平均每单金额是多少？",
  "数据库里有哪些表？"
];

async function main() {
  const results = [];

  for (const q of QUESTIONS) {
    const r = await runAgent(q);
    results.push({
      question: q,
      answer: r.text,
      stopReason: r.stopReason,
      toolCalls: r.toolCalls
    });
  }

  console.log("\n\n========== 汇总 ==========");
  for (const r of results) {
    console.log("\n问题：" + r.question);
    console.log("回答：" + r.answer);
    console.log("停止：" + r.stopReason + "，工具调用 " + r.toolCalls + " 次");
  }
}

main().catch(function (e) {
  console.log("批量运行出错：" + e.stack);
});
```

**跑：**

```text
node main.js
```

## 5.3 屏幕上应该看到什么

**第一个问题的完整输出：**

```text
用户：这个月已支付的订单有多少笔，金额多少？
[mock] 第 1 轮，消息 2 条，可用工具 2 个，问题「这个月已支付的订单有多少笔，金额多少？」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：query_stats({"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"})
实际返回什么：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"}
耗时：13ms

--- 第 2 轮 ---
finish_reason：stop
模型想干什么：给答案
模型给出答案：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。

=== 结束 ===
停止原因：answer，共 1 次工具调用
日志：B:\...\logs\agent-2026-11-16.jsonl
```

**最后汇总：**

```text
========== 汇总 ==========

问题：这个月已支付的订单有多少笔，金额多少？
回答：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。
停止：answer，工具调用 1 次

问题：哪个城市的销售额最高？
回答：按城市统计（本月已支付）：上海 6087.55 元（5 单），杭州 5946.39 元（6 单），广州 5562.8 元（5 单），深圳 4101.27 元（4 单），北京 1571.1 元（2 单）。
停止：answer，工具调用 1 次

问题：退款订单占比多少？
回答：订单状态分布：paid 156 单（78%），pending 26 单（13%），refunded 18 单（9%）。
停止：answer，工具调用 1 次

问题：平均每单金额是多少？
回答：已支付订单平均每单 982.51 元，共 156 单。
停止：answer，工具调用 1 次

问题：数据库里有哪些表？
回答：数据库里有这些表：orders(id, order_no, customer, city, amount, status, created_at)。
停止：answer，工具调用 1 次
```

**五个全部 `answer`，每个只用 1 次工具调用。**

**你还要做一件事：自己去数据库里核对第一个答案。**

```text
node -e "const db=require('better-sqlite3')('data/app.db',{readonly:true}); console.log(db.prepare(\"SELECT COUNT(*) AS cnt, ROUND(SUM(amount),2) AS total FROM orders WHERE substr(created_at,1,7)='2026-11' AND status='paid'\").get())"
```

```text
{ cnt: 22, total: 23269.11 }
```

**对上了。** 这一步不能省——**Agent 说 22，不等于 22。你自己查一遍，才知道它的 22 是真的。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 某个问题 `max_rounds` | 假模型没匹配到关键词 | 看 `[mock]` 那行，改关键词 |
| 城市问题返回金额合计 | `buildSql` 里"城市"分支没命中 | 问题里要有"城市"两个字 |
| 平均问题返回 "0 行" | SQL 里 `status='paid'` 过滤后没有数据 | 检查 `created_at` 条件 |
| 5 个问题答案串了 | 你把它们拼成一条 prompt 了 | 一个一个跑 |
| 中文乱码 | 代码页 | `chcp 65001` |

---

# 第 6 步：检查日志，做一次攻击测试（15 分钟）

## 6.1 做什么 / 为什么

验收要的是证据，不是印象。

**两件事：**

1. 日志里能查到每一次 `tool_call`；
2. 四种攻击进不来。

## 6.2 操作

**看日志（前 6 行）：**

```text
type logs\agent-2026-11-16.jsonl
```

**建 `security-check.js`：**

```javascript
const { dispatch } = require("./dispatch");

const attacks = [
  { label: "DELETE 开头", sql: "DELETE FROM orders" },
  { label: "UPDATE 开头", sql: "UPDATE orders SET status = 'paid' LIMIT 100" },
  { label: "多条语句", sql: "SELECT 1; DROP TABLE orders" },
  { label: "关键字藏在后半段", sql: "SELECT * FROM orders WHERE 1 = 1 UNION SELECT 1,2,3,4,5,6,7 FROM (SELECT 1) -- delete" },
  { label: "加载扩展（黑名单拦不住）", sql: "SELECT load_extension('evil')" },
  { label: "正常查询", sql: "SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status" }
];

for (const a of attacks) {
  console.log("\n[" + a.label + "]");
  console.log("SQL：" + a.sql);
  console.log("结果：" + JSON.stringify(dispatch("query_stats", { sql: a.sql })));
}
```

**跑：**

```text
node security-check.js
```

## 6.3 屏幕上应该看到什么

```text
> type logs\agent-2026-11-16.jsonl
{"ts":"2026-11-16T02:58:11.201Z","type":"start","question":"这个月已支付的订单有多少笔，金额多少？"}
{"ts":"2026-11-16T02:58:11.215Z","type":"tool_call","round":1,"tool":"query_stats","args":{"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"},"ok":true,"error":null,"rowCount":1,"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100","ms":13}
{"ts":"2026-11-16T02:58:11.216Z","type":"answer","round":2,"text":"这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。","stopReason":"answer"}
{"ts":"2026-11-16T02:58:11.217Z","type":"end","stopReason":"answer","rounds":2,"toolCalls":1}
```

```text
> node security-check.js

[DELETE 开头]
SQL：DELETE FROM orders
结果：{"ok":false,"error":"只允许 SELECT / WITH 开头的查询"}

[UPDATE 开头]
SQL：UPDATE orders SET status = 'paid' LIMIT 100
结果：{"ok":false,"error":"只允许 SELECT / WITH 开头的查询"}

[多条语句]
SQL：SELECT 1; DROP TABLE orders
结果：{"ok":false,"error":"只允许一条语句，SQL 里出现了分号"}

[关键字藏在后半段]
SQL：SELECT * FROM orders WHERE 1 = 1 UNION SELECT 1,2,3,4,5,6,7 FROM (SELECT 1) -- delete
结果：{"ok":false,"error":"SQL 里出现了被禁止的关键字"}

[加载扩展（黑名单拦不住）]
SQL：SELECT load_extension('evil')
结果：{"ok":false,"error":"not authorized"}

[正常查询]
SQL：SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status
结果：{"ok":true,"rows":[{"status":"paid","cnt":156},{"status":"pending","cnt":26},{"status":"refunded","cnt":18}],"rowCount":3,"sql":"SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status LIMIT 100"}
```

**逐条读：**

| 攻击 | 谁拦住的 |
|---|---|
| DELETE | 第 1 层：开头必须是 SELECT / WITH |
| UPDATE | 第 1 层 |
| 多条语句 | 第 1 层：分号 |
| 关键字藏后半段 | 第 2 层：黑名单（`delete` 在注释里也被匹配到） |
| `load_extension` | **SQLite 自己**（`not authorized`），黑名单没拦住 |
| 正常查询 | 放行，自动补 `LIMIT 100` |

**第 5 条是这节课最重要的一行输出。**

它证明了：**黑名单不是防线，只是提前报错。** 真正兜底的是"这条连接没有权限做危险的事"。

**如果 `load_extension` 被执行成功了呢？** 那说明你的 SQLite 编译时开了扩展加载。**这种情况下你要做的不是加更多关键词，是关掉扩展加载，或者换一个只读的、受限的数据库账号。**

## 6.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| DELETE 被执行了 | 你删了开头检查 | 加回来，并检查 `readonly` |
| 多条语句报 RangeError | 分号检查失效，到了 `prepare` | 也是拦住了，但报错不友好 |
| `load_extension` 返回 `ok:true` | SQLite 开了扩展加载 | 立刻停，改用只读账号/禁用扩展 |
| 日志里没有 `tool_call` | 你用了旧的 `agent.js` | 确认 `logger.toolCall` 已接 |

---

# 第 7 步：故意犯四个错（15 分钟）

## 错误 1：忘了强制 LIMIT

**操作：** 删掉 `queryStats` 里的 `const finalSql = enforceLimit(sql);`，改成 `const finalSql = sql;`。

**现象：**

```text
node -e "const t=require('./tools-run'); const r=t.queryStats({sql:'SELECT * FROM orders'}); console.log(r.rowCount)"
```

```text
200
```

**200 行会被 `JSON.stringify` 塞进下一轮的 `messages`。** 单行 7 个字段，一行大约 100 字符，200 行就是 2 万字符，约合几千 token。

**原因：** 模型写 `SELECT *` 是常态，它不知道你的表有多大。

**怎么查：** 看 `rowCount`。超过 100 就是没强制。

**改回来。**

## 错误 2：为了方便，把连接改成可写

**操作：** 把 `db.js` 里的 `{ readonly: true }` 删掉。

**然后跑：**

```text
node -e "const {dispatch}=require('./dispatch'); console.log(JSON.stringify(dispatch('query_stats',{sql:\"SELECT 1\"})))"
```

**还是能跑。** 现在试试真的写：

```text
node -e "const db=require('better-sqlite3')('data/app.db'); console.log(db.prepare(\"UPDATE orders SET status='paid' WHERE order_no='SO00042'\").run())"
```

```text
{ changes: 1, lastInsertRowid: 0 }
```

**改成功了，没有任何提示。**

**原因：** `readonly: true` 不是"建议"，是这一周唯一一条物理边界。删了它，前面所有黑名单都只是" polite 的建议"。

**怎么查：** `node -e "const {db}=require('./db'); console.log(db.readonly)"`，必须是 `true`。

**改回来，并从 `data\app.db.bak` 恢复数据。**

## 错误 3：日志只打印，不落盘

**操作：** 把 `logger.js` 里的 `fs.appendFileSync(...)` 改成 `console.log(...)`。

**现象：** 终端上什么都有，`logs\` 目录是空的。

**等到出问题那天：**

```text
老板：上周三那个 9% 是怎么算的？
你：终端已经关了。
```

**原因：** 终端的输出是临时的，滚动条一过就没了。**日志文件是唯一能"事后复查"的东西。**

**怎么查：** `dir logs`。是空的，就是没落盘。

**改回来。**

## 错误 4：把 5 个问题拼成一条 prompt

**操作：** 在 `main.js` 里把 `QUESTIONS` 改成一项：

```javascript
const QUESTIONS = [
  "这个月已支付的订单有多少笔，金额多少？哪个城市的销售额最高？退款订单占比多少？平均每单金额是多少？数据库里有哪些表？"
];
```

**屏幕上：**

```text
问题：这个月已支付的订单有多少笔，金额多少？哪个城市的销售额最高？...
回答：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。
停止：answer，工具调用 1 次
```

**只答了第一个。** 因为假模型按关键词匹配，命中"多少"就返回了聚合查询。

**真模型会好一些，但也会漏。** 五个问题需要五种查询，模型可能只查一种就急着回答，或者把五个数字混在一起。

**原因：** 一个 Agent 一次只该解一个任务。**多任务要拆成多次调用，不是塞进一句话。**

**怎么查：** 数一下回答里有几个数字，和问题里要的几个数字对不对得上。

**改回来。**

---

# 第 8 步：写学习笔记（10 分钟）

打开 `第07节课/02-笔记/NOTES.md`，按下面的小标题写。**小标题一个字都不要改。**

```markdown
# 第 98 节课学习笔记

## 一、这一周拼起来的六个零件

| 零件 | 来自哪一节 | 一句话作用 |
|---|---|---|
| 工具定义 | | |
| 假模型 | | |
| 校验与分派 | | |
| 主循环 | | |
| 权限门 | | |
| 日志 | | |

## 二、为什么只留两个工具

删掉了哪些：

删掉的理由：

## 三、只读查询的四层防线

| 层 | 具体做法 | 能挡住什么 | 挡不住什么 |
|---|---|---|---|
| 字符串检查 | | | |
| 关键字黑名单 | | | |
| 单语句限制 | | | |
| 只读连接 | | | |

## 四、`load_extension` 那条结果的启示

它被谁拦住的：

这说明黑名单是什么级别的防护：

## 五、日志为什么用 JSONL

三个理由：

一行 `tool_call` 里有哪些字段：

## 六、5 个问题和它们的答案

| 问题 | 回答 | 工具调用次数 |
|---|---|---|
| 这个月已支付 | | |
| 哪个城市最高 | | |
| 退款占比 | | |
| 平均每单 | | |
| 有哪些表 | | |

我自己核对过哪个数字，怎么核对的：

## 七、四种攻击的结果

| 攻击 | 结果 | 谁拦住的 |
|---|---|---|
| DELETE | | |
| 多条语句 | | |
| 关键字藏后半段 | | |
| load_extension | | |

## 八、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 忘了 LIMIT | | |
| 改成可写连接 | | |
| 日志不落盘 | | |
| 5 个问题拼一句 | | |

## 九、这套系统还差什么

至少写三条（提示：并发、成本、权限、评测）：

## 十、真接口跑一次的结果（可选）

我有没有把 `MOCK` 改成 `false` 跑一次：

花费量级：

真模型和假模型的回答差在哪：

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `node main.js` 五个问题全 `answer`
- [ ] 五个答案的数字和我自己查的一致
- [ ] `logs\agent-<日期>.jsonl` 里有 start / tool_call / answer / end
- [ ] `security-check.js` 六条结果与课件一致
- [ ] `db.readonly` 是 `true`
- [ ] 我做过四个错误实验
- [ ] 我能画出"问题 → 模型 → 工具 → 结果 → 回答"的完整路径
```

---

# 第 9 步：课后练习

## 练习一：加第 6 个问题

问题："退款金额一共多少？"

要求：

- 你自己写 SQL，不要改假模型的关键词；
- 跑通后，把它加进 `main.js`；
- 记录工具调用次数。

**提示：** `WHERE status = 'refunded'`，`SUM(amount)`。

## 练习二：给日志加一个"运行 ID"

同一批 5 个问题会产生 5 段日志，混在一个文件里。加一个 `runId`（时间戳 + 随机数），每条记录都带上。

要求：能用 `findstr` 筛出某一次运行的全部记录。

## 练习三：做一个"答不出来"的用例

问一个数据库里没有的东西，比如"北京的天气怎么样"。

要求：

- 记录 `finish_reason`；
- 记录 Agent 的回答；
- 判断它有没有编造。

**如果它编了，你要改的是 system prompt 还是工具？写出你的判断。**

## 练习四：加上"结果为空"的处理

现在 `query_stats` 返回空数组时，模型可能重复调用。

要求：在 `queryStats` 返回里加一个字段 `hint`：

```json
{"ok":true,"rows":[],"rowCount":0,"hint":"没有匹配的数据，不要重复执行同样的 SQL，请换条件或直接告诉用户没有数据"}
```

然后观察假模型和真模型的反应。

**思考：** 为什么"提示"比"报错"更适合空结果？

## 练习五：用自己的话讲清

```text
1. 这一周的六个零件分别解决什么问题？少一个会怎样？
2. 为什么只留两个工具？工具多了会付出什么代价？
3. 四层防线里，哪一层不可绕过？另外三层的作用是什么？
4. 日志为什么要一行一条、每轮都写？
5. 如果老板问你"这个 9% 是怎么来的"，你打开什么给他看？
```

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能画出"问题 → 模型 → tool_call → 执行 → tool 消息 → 回答"的路径
- [ ] 我能说出四层防线各自挡什么
- [ ] 我知道黑名单不是安全边界
- [ ] 我知道为什么只留两个工具
- [ ] 我知道日志为什么用 JSONL

## B. 实操

- [ ] `node main.js` 五个问题全部 `answer`
- [ ] 每个回答里的数字与数据库一致
- [ ] `logs\agent-<日期>.jsonl` 有 5 组 start/end
- [ ] 每个 `tool_call` 记录都有 `sql` 和 `rowCount`
- [ ] `node security-check.js` 输出六条，五条被拒
- [ ] `db.readonly` 是 `true`

## C. 排错

- [ ] 某个问题 `max_rounds`，我知道先看 `[mock]` 关键词
- [ ] 看到 `not authorized`，我知道是 SQLite 拦的，不是黑名单
- [ ] 日志为空，我知道是 `writeFileSync` 覆盖或没调用
- [ ] 回答和数据库对不上，我知道先自己跑一遍 SQL

## D. 笔记

- [ ] `NOTES.md` 十二个小标题都填了
- [ ] 5 个问题的答案表填了
- [ ] 四种攻击的结果抄了
- [ ] "这套系统还差什么"写了三条以上

## 本节课要能说出口的一句话

> **能查库不算完成，能说清"它查了什么、拿什么答的、为什么这么答"才算完成。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 五个问题只答了一个 | 是不是拼成一条 prompt 了 | 拆成五次 |
| 回答里的数字不对 | 自己跑一遍 SQL | 对照 `rowCount` 和 `rows` |
| 日志文件是空的 | `appendFileSync` | 改成追加，不要覆盖 |
| 每次都新建一个日志文件 | 文件名用了时间戳 | 用日期，同一天追加 |
| `not authorized` | 扩展加载 | 正常，这是 SQLite 的防线 |
| `attempt to write a readonly database` | 有人想写 | 正常，不要去掉 `readonly` |
| `max_rounds` | 模型没给答案 | 看日志最后一条 `tool_call` |
| 答案里有 `[object Object]` | 没 `JSON.stringify` | 检查 tool 消息的 content |
| 真接口报 400 | 消息顺序 | assistant(tool_calls) → tool，id 对上 |
| 跑完进程不退出 | `readline` 没关 | `closeConfirm()` |
