# 第 95 节课：执行单一步骤

> 这节课结束时，你手上有：`第04节课/03-练习代码/agent/dispatch.js` 和 `single-step.js`，能接住模型返回的 `tool_calls`，校验参数、执行、把结果用 `role: "tool"` 回传，拿到最终答案。

**建议用时**：110 分钟
**前置**：第 94 节课做出来的 `llm.js`、`mock-llm.js`、`probe.js`（能打印出 `tool_calls`）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

`probe.js` 已经能打印出这样的结构：

```json
{
  "id": "call_mock_002",
  "type": "function",
  "function": {
    "name": "query_stats",
    "arguments": "{\"sql\":\"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100\"}"
  }
}
```

**但这只是一段 JSON。** 它没有连数据库，没有执行任何 SQL，也没有把结果告诉模型。

你的程序现在停在"知道模型想干什么"这一步，还没"真的去干"。

## 0.2 今天这个坑长什么样

你写了执行代码，跑完发现模型答的还是"我不知道"。

回头看日志，你做了这些事：

```text
① 模型返回 tool_calls
② 你执行了 SQL，拿到了 22
③ 你把 22 打印在终端上
④ 你没把它放进 messages
⑤ 你又调了一次模型，问"现在能回答了吗"
⑥ 模型说"我没有数据"
```

**第 ④ 步是今天唯一的重点。**

模型不是人。**你看得见终端上的 22，模型看不见。** 它只能看见 `messages` 数组里的东西。你不把结果放进去，它下一轮还是什么都不知道。

这一节要做三件事，缺一件都不行：

| 动作 | 做错会怎样 |
|---|---|
| 先校验参数再执行 | 模型给个不存在的订单号，你的代码直接崩 |
| 用 `role: "tool"` + `tool_call_id` 回传 | 真接口报 400，模型不知道这是哪个调用的结果 |
| 失败也要回传 | 模型以为工具还在跑，一直重试（第 96 节课的死循环） |

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 分派（dispatch） | 按工具名找到对应函数，把参数喂进去 | `dispatch.js` |
| 参数校验 | 执行前先检查"这东西能不能执行" | `validateArgs()` |
| `tool_call_id` | 一次调用的身份证，回传结果时必须带上 | `role: "tool"` 消息 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `db.js` | `第04节课/03-练习代码/agent/` | 只读数据库连接 |
| `tools-run.js` | 同上 | 四个工具的真实实现 |
| `dispatch.js` | 同上 | 校验 + 分派 + 兜住异常 |
| `single-step.js` | 同上 | 一次工具调用 + 一次回传 |
| `bad-calls.js` | 同上 | 七组错误参数的真实返回 |
| `NOTES.md` | `第04节课/02-笔记/` | 你的记录 |

---

# 第 1 步：复制目录，建只读连接（10 分钟）

## 1.1 做什么 / 为什么

从这一节开始，代码真的要碰数据库了。**所有查询用只读连接。**

**为什么不用可写连接：**

```text
可写连接 + 模型生成的 SQL = 模型有机会删你的数据
只读连接 + 模型生成的 SQL = 最多查出一堆没用的行
```

第 97 节课会讲一个真实事故：模型自己把生产库删了。**现在先把门关上。**

## 1.2 操作

```text
cd "B:\OPC-Distance_study\每周课程\03-数据与智能\第14周-智能体与工具"
xcopy 第03节课\03-练习代码\agent 第04节课\03-练习代码\agent /E /I
cd 第04节课\03-练习代码\agent
node probe.js
```

**建 `db.js`：**

```javascript
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "data", "app.db");

// readonly: true 是这一周最重要的一行。
// 它让这个连接永远无法执行 INSERT / UPDATE / DELETE / DROP。
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

module.exports = { db, dbPath };
```

## 1.3 屏幕上应该看到什么

```text
> node probe.js
MOCK = true
发出 4 个工具：list_tables, query_stats, count_orders, get_order

===== 问题：数据库里有哪些表？ =====
[mock] 第 1 轮，消息 1 条，可用工具 4 个，问题「数据库里有哪些表？」
...
```

**再验证只读连接真的挡住了写操作：**

```text
node -e "const {db}=require('./db'); try { db.exec(\"DELETE FROM orders\") } catch(e) { console.log(e.message) }"
```

```text
attempt to write a readonly database
```

**看到这句话，说明门关上了。** 记住这个报错原文，第 97 节课还要用。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot open database because the directory does not exist` | `data` 目录没复制 | 跑 `node seed.js` |
| `Unable to open database file` | 路径拼错 | 打印 `dbPath` 看一眼 |
| 没有报错，删除成功了 | 你去掉了 `readonly: true` | 加回来，重新验证 |

---

# 第 2 步：写四个工具的真实实现（25 分钟）

## 2.1 做什么 / 为什么

`tools.js` 是"说明书"，`tools-run.js` 是"干活的手"。

**两者必须分开。** 说明书发给模型，实现留在本地。**模型永远看不到你的实现代码**——它只看到 `description` 和 `parameters`。

## 2.2 操作

**建 `tools-run.js`：**

```javascript
const { db } = require("./db");

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|reindex|pragma)\b/i;

function listTables() {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();

  const tables = rows.map(function (r) {
    const columns = db.prepare("PRAGMA table_info(" + r.name + ")").all().map(function (c) {
      return c.name;
    });
    return { name: r.name, columns: columns };
  });

  return { tables: tables };
}

function enforceLimit(sql) {
  const m = sql.match(/\blimit\s+(\d+)\s*$/i);
  if (!m) {
    return sql + " LIMIT 100";
  }
  if (Number(m[1]) > 100) {
    return sql.replace(/\blimit\s+\d+\s*$/i, "LIMIT 100");
  }
  return sql;
}

function queryStats(args) {
  let sql = String(args.sql).trim();

  if (sql.endsWith(";")) {
    sql = sql.slice(0, -1).trim();
  }

  if (!/^select\b/i.test(sql)) {
    throw new Error("只允许 SELECT 开头的查询，收到的是：" + sql.slice(0, 40));
  }

  if (sql.includes(";")) {
    throw new Error("只允许一条语句，SQL 里出现了分号");
  }

  if (FORBIDDEN.test(sql)) {
    throw new Error("SQL 里出现了被禁止的关键字");
  }

  const finalSql = enforceLimit(sql);
  const rows = db.prepare(finalSql).all();

  return { rows: rows, rowCount: rows.length, sql: finalSql };
}

function countOrders(args) {
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM orders WHERE status = ?").get(args.status);

  if (!row) {
    throw new Error("统计失败");
  }

  return { status: args.status, cnt: row.cnt };
}

function getOrder(args) {
  const row = db.prepare("SELECT * FROM orders WHERE order_no = ?").get(args.order_no);

  if (!row) {
    throw new Error("没有这个订单：" + args.order_no);
  }

  return { order: row };
}

module.exports = { listTables, queryStats, countOrders, getOrder };
```

## 2.3 三个关键点

**① SQL 用 `?` 占位，不做字符串拼接**

```javascript
db.prepare("SELECT * FROM orders WHERE order_no = ?").get(args.order_no)
```

如果写成 `"WHERE order_no = '" + args.order_no + "'"`，模型传一个带引号的值就能改写你的 SQL。

**② `enforceLimit` 只认"结尾的 LIMIT"**

`SELECT ... LIMIT 10` 能识别；`SELECT ... LIMIT 5 OFFSET 10` 识别不了，会再拼一个 `LIMIT 100`，结果是：

```text
SqliteError: near "LIMIT": syntax error
```

**这个报错会原样回传给模型**（下一节就做），模型看到后会重写。**不完美，但不会挂。**

**③ 黑名单拦不住所有注入**

`FORBIDDEN` 是一个关键词黑名单。它能拦住 `DELETE`、`DROP`，但拦不住：

- `SELECT load_extension('...')`（如果扩展加载开启）
- 注释绕过：`DE/**/LETE`
- 编码绕过、大小写混写（`\b` 加 `i` 标志能挡一部分）
- `WITH x AS (DELETE ... RETURNING *) SELECT * FROM x`（SQLite 某些版本支持）

**真正的防线是 `readonly: true`。** 黑名单只是"早一点给出人话报错"，不是安全边界。

**这句话你必须在笔记里复述一遍。** 第 98 节课还会展开。

## 2.4 屏幕上应该看到什么

```text
node -e "const t=require('./tools-run'); console.log(JSON.stringify(t.listTables()))"
```

```text
{"tables":[{"name":"orders","columns":["id","order_no","customer","city","amount","status","created_at"]}]}
```

```text
node -e "const t=require('./tools-run'); console.log(JSON.stringify(t.queryStats({sql:'SELECT COUNT(*) AS cnt FROM orders'})))"
```

```text
{"rows":[{"cnt":200}],"rowCount":1,"sql":"SELECT COUNT(*) AS cnt FROM orders LIMIT 100"}
```

**注意 `sql` 字段：** 你传进去的没有 `LIMIT`，返回里补上了 `LIMIT 100`。**这是给日志看的**，第 98 节课要把这句话记进文件。

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `SqliteError: no such table: orders` | `db.js` 路径不对 | 打印 `dbPath` |
| `TypeError: Cannot read properties of undefined (reading 'rows')` | `queryStats` 返回值拼错 | 对照课件 |
| 传了 `LIMIT` 还是被拼第二个 | 结尾有空格或分号 | 先 `trim()` 再判断 |
| `RangeError: The supplied SQL string contains more than one statement` | 你的 `;` 检查写在 `prepare` 之后 | 检查顺序：先拒绝，再执行 |

---

# 第 3 步：写 `dispatch`（20 分钟）

## 3.1 做什么 / 为什么

`dispatch(name, args)` 是唯一的人口：**所有工具调用都从这里进。**

它必须按固定顺序做五件事，**顺序不能换**：

```text
① 这个工具存在吗？        → 不存在，返回 ok:false
② 参数合法吗？            → 不合法，返回 ok:false
③ 这个工具有实现吗？      → 没有，返回 ok:false
④ 执行                  → 抛异常也要接住
⑤ 永远返回一个对象        → 绝不 throw
```

**第 ⑤ 条最重要。** `dispatch` 一旦抛异常，整个 agent 进程就崩了，用户什么都看不到。

## 3.2 操作

**建 `dispatch.js`：**

```javascript
const { TOOLS } = require("./tools");
const { validateArgs } = require("./validate");
const { listTables, queryStats, countOrders, getOrder } = require("./tools-run");

const IMPL = {
  list_tables: listTables,
  query_stats: queryStats,
  count_orders: countOrders,
  get_order: getOrder
};

function dispatch(name, args) {
  const tool = TOOLS.find(function (t) {
    return t.function.name === name;
  });

  if (!tool) {
    return { ok: false, error: "没有这个工具：" + name };
  }

  const checked = validateArgs(tool.function.parameters, args);
  if (!checked.ok) {
    return { ok: false, error: "参数不合法：" + checked.error };
  }

  const fn = IMPL[name];
  if (!fn) {
    return { ok: false, error: "工具已定义但没实现：" + name };
  }

  try {
    const result = fn(args);
    return Object.assign({ ok: true }, result);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { dispatch };
```

## 3.3 为什么校验放在执行前面

模型会给你这些东西：

| 模型给的 | 不校验直接执行会怎样 |
|---|---|
| `{"sql": 123}` | `db.prepare(123)` 抛 TypeError，进程崩 |
| `{}` | `args.sql` 是 `undefined`，SQL 变成 `near "undefined"` |
| `{"order_no": "SO99999"}` | 查不到，返回 `undefined`，你后面 `row.id` 崩 |
| `{"status": "已支付"}` | 查到 0 行，**不报错，答案错** |
| `{"table": "orders"}` | 参数被忽略，你以为查了表，其实没有 |

**校验的目的不是"防坏人"，是"把崩溃变成一句人话"。**

`{"ok": false, "error": "参数不合法：缺少必填参数 sql"}` 这句话回传给模型，模型下一轮会改。**崩溃回传不了任何东西。**

## 3.4 屏幕上应该看到什么

```text
node -e "const {dispatch}=require('./dispatch'); console.log(JSON.stringify(dispatch('query_stats',{})))"
```

```text
{"ok":false,"error":"参数不合法：缺少必填参数 sql"}
```

```text
node -e "const {dispatch}=require('./dispatch'); console.log(JSON.stringify(dispatch('drop_table',{name:'orders'})))"
```

```text
{"ok":false,"error":"没有这个工具：drop_table"}
```

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `dispatch is not a function` | 导出写错 | `module.exports = { dispatch }` |
| 进程直接崩 | `try` 只包了 `fn` 没包校验 | 校验本身不抛，检查 `validateArgs` 有没有崩 |
| `ok:true` 但 rows 是空的 | SQL 条件查不到 | 这不是 dispatch 的问题，看 SQL |

---

# 第 4 步：单步跑通一次完整回传（25 分钟）

## 4.1 做什么 / 为什么

现在把四段接起来：

```text
发问题 → 拿 tool_calls → dispatch → 拼 role:"tool" → 再发一次 → 拿答案
```

**只做一轮，不写循环。** 循环是第 96 节课的事。这一节你要看清楚"一轮"里 `messages` 到底长什么样。

## 4.2 操作

**建 `single-step.js`：**

```javascript
const { chat } = require("./llm");
const { TOOLS } = require("./tools");
const { dispatch } = require("./dispatch");

async function main() {
  const question = process.argv.slice(2).join(" ") || "这个月卖了多少？";

  const messages = [
    {
      role: "system",
      content: "你是一个订单数据分析助手。需要数据时必须调用工具，不要凭印象编造数字。"
    },
    { role: "user", content: question }
  ];

  console.log("用户：" + question);

  const first = await chat(messages, TOOLS);
  const choice = first.choices[0];
  const msg = choice.message;

  console.log("\n=== 第一轮 ===");
  console.log("finish_reason：" + choice.finish_reason);
  console.log("tool_calls：" + JSON.stringify(msg.tool_calls, null, 2));

  if (!msg.tool_calls) {
    console.log("模型没调工具，直接回答：" + msg.content);
    return;
  }

  // 关键：assistant 这条消息必须原样放回 messages。
  // 它带着 tool_calls 的 id，模型下一轮要靠它对上号。
  messages.push(msg);

  for (const call of msg.tool_calls) {
    const name = call.function.name;

    let args = null;
    try {
      args = JSON.parse(call.function.arguments);
    } catch (e) {
      console.log("参数不是合法 JSON：" + e.message);
    }

    console.log("\n=== 执行 ===");
    console.log("工具：" + name);
    console.log("参数：" + JSON.stringify(args));

    const result =
      args === null
        ? { ok: false, error: "arguments 不是合法 JSON：" + String(call.function.arguments).slice(0, 80) }
        : dispatch(name, args);

    console.log("结果：" + JSON.stringify(result));

    // 失败也要回传。不传，模型永远不知道这一步结束了。
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result)
    });
  }

  console.log("\n=== 回传后的 messages ===");
  console.log(JSON.stringify(messages, null, 2));

  const second = await chat(messages, TOOLS);

  console.log("\n=== 第二轮 ===");
  console.log("finish_reason：" + second.choices[0].finish_reason);
  console.log("最终回答：" + second.choices[0].message.content);
}

main().catch(function (e) {
  console.log("出错：" + e.message);
});
```

## 4.3 屏幕上应该看到什么

```text
> node single-step.js 这个月卖了多少？

用户：这个月卖了多少？
[mock] 第 1 轮，消息 2 条，可用工具 4 个，问题「这个月卖了多少？」

=== 第一轮 ===
finish_reason：tool_calls
tool_calls：[
  {
    "id": "call_mock_001",
    "type": "function",
    "function": {
      "name": "query_stats",
      "arguments": "{\"sql\":\"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100\"}"
    }
  }
]

=== 执行 ===
工具：query_stats
参数：{"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"}
结果：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,"sql":"SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total FROM orders WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid' LIMIT 100"}

=== 回传后的 messages ===
[
  {
    "role": "system",
    "content": "你是一个订单数据分析助手。需要数据时必须调用工具，不要凭印象编造数字。"
  },
  {
    "role": "user",
    "content": "这个月卖了多少？"
  },
  {
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
  {
    "role": "tool",
    "tool_call_id": "call_mock_001",
    "content": "{\"ok\":true,\"rows\":[{\"cnt\":22,\"total\":23269.11}],\"rowCount\":1,\"sql\":\"SELECT ... LIMIT 100\"}"
  }
]
[mock] 第 2 轮，消息 4 条，可用工具 4 个，问题「这个月卖了多少？」

=== 第二轮 ===
finish_reason：stop
最终回答：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。
```

**逐项核对四件事：**

| 检查点 | 应该是什么 |
|---|---|
| `messages` 长度 | 4 条（system / user / assistant / tool） |
| assistant 消息 | `content: null`，带 `tool_calls` 数组 |
| tool 消息 | `tool_call_id` 与 `assistant.tool_calls[0].id` **完全一样** |
| tool 消息的 content | **字符串**，里面是序列化后的 JSON |

**再看第 2 轮的日志：** "消息 4 条"。假模型就是靠这个判断"已经有工具结果了，该给答案了"。

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第二轮还是 `tool_calls` | 你没 push `role: "tool"` 的消息 | 检查循环里有没有 `messages.push({role:"tool"...})` |
| 第二轮说"我看不到数据" | `content` 是对象不是字符串 | 用 `JSON.stringify(result)` |
| `Unexpected token o in JSON at position 1` | `content` 传了对象，假模型 `JSON.parse` 失败 | 同上 |
| 最终回答是上一轮的答案 | 你复用了旧的 `messages` | 确认是从头拼的 |
| `messages` 里没有 assistant | 你只 push 了 `msg.content` | 要 push 整个 `msg` |

---

# 第 5 步：七个真实的执行结果（15 分钟）

## 5.1 做什么 / 为什么

把七种输入一次跑完，**你必须能区分三种失败：**

```text
校验器拦的     → {"ok":false,"error":"参数不合法：..."}
工具实现抛的   → {"ok":false,"error":"没有这个订单：..."}
正常执行       → {"ok":true,...}
```

第 96 节课诊断死循环时，靠的就是这个区分。

## 5.2 操作

**建 `bad-calls.js`：**

```javascript
const { dispatch } = require("./dispatch");

const cases = [
  { label: "正常查询", name: "query_stats", args: { sql: "SELECT COUNT(*) AS cnt FROM orders LIMIT 10" } },
  { label: "不存在的订单", name: "get_order", args: { order_no: "SO99999" } },
  { label: "缺必填参数", name: "query_stats", args: {} },
  { label: "limit 是字符串", name: "count_orders", args: { status: "paid", limit: "10" } },
  { label: "不存在的工具", name: "drop_table", args: { name: "orders" } },
  { label: "SQL 里带 UPDATE", name: "query_stats", args: { sql: "UPDATE orders SET status = 'paid' LIMIT 100" } },
  { label: "SQL 没有 LIMIT", name: "query_stats", args: { sql: "SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status" } }
];

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const result = dispatch(c.name, c.args);
  console.log(i + 1 + ". " + c.label + " → " + JSON.stringify(result));
}
```

## 5.3 屏幕上应该看到什么

```text
> node bad-calls.js
1. 正常查询 → {"ok":true,"rows":[{"cnt":200}],"rowCount":1,"sql":"SELECT COUNT(*) AS cnt FROM orders LIMIT 10"}
2. 不存在的订单 → {"ok":false,"error":"没有这个订单：SO99999"}
3. 缺必填参数 → {"ok":false,"error":"参数不合法：缺少必填参数 sql"}
4. limit 是字符串 → {"ok":false,"error":"参数不合法：limit 必须是整数，收到的是 \"10\""}
5. 不存在的工具 → {"ok":false,"error":"没有这个工具：drop_table"}
6. SQL 里带 UPDATE → {"ok":false,"error":"SQL 里出现了被禁止的关键字"}
7. SQL 没有 LIMIT → {"ok":true,"rows":[{"status":"paid","cnt":156},{"status":"pending","cnt":26},{"status":"refunded","cnt":18}],"rowCount":3,"sql":"SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status LIMIT 100"}
```

**第 7 行注意两处：** `sql` 字段末尾被补上了 `LIMIT 100`；返回了 3 行。

**如果模型写的是 `SELECT * FROM orders`，它会拉回 200 行。** 这 200 行会被 `JSON.stringify` 塞进下一轮的 `messages`，一次请求的输入 token 会翻好几倍。**`LIMIT` 不只是保护数据库，也是保护你的钱包。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第 4 行"通过"了 | 校验器把 `"10"` 当成了数字 | `checkOne` 用 `Number.isInteger`，字符串会失败 |
| 第 6 行执行成功了 | 你的 `readonly` 没开 | 报错应该是 `attempt to write a readonly database` |
| 第 7 行 `sql` 里没有 `LIMIT` | `enforceLimit` 没生效 | 检查正则和 `return` |
| 第 2 行 `ok:true` | `getOrder` 没抛错 | 加 `if (!row) throw` |

---

# 第 6 步：故意犯四个错（15 分钟）

## 错误 1：忘了把 assistant 的 `tool_calls` 消息放回去

**操作：** 删掉 `single-step.js` 里的 `messages.push(msg);`。

**屏幕上：**

```text
=== 回传后的 messages ===
[
  { "role": "system", ... },
  { "role": "user", ... },
  { "role": "tool", "tool_call_id": "call_mock_001", "content": "..." }
]
[mock] 第 2 轮，消息 3 条 ...
=== 第二轮 ===
最终回答：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。
```

**假模型上居然还能跑。** 因为假模型只看"有没有 tool 消息"，不检查前面有没有 assistant。

**换成真接口，你会看到 400，大致是这句话：**

```text
Invalid parameter: messages with role 'tool' must be a response to a preceding message with 'tool_calls'.
```

**原因：** `role: "tool"` 的消息是"回答某个 tool_call"的，前面必须有一条带 `tool_calls` 的 assistant 消息。**顺序是死的：assistant → tool。**

**怎么查：** 打印 `messages.map(m => m.role)`。看到 `user, tool` 中间少了 `assistant`，就是这个问题。

**这个错说明假模型的边界：它能验证流程走通，不能验证消息顺序合法。** 真接口跑一次，专门抓这类错。

**改回来。**

## 错误 2：`tool_call_id` 抄错

**操作：** 把 `tool_call_id: call.id` 改成 `tool_call_id: "1"`。

**屏幕上（假模型）：**

```text
最终回答：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。
```

**又是照样能跑。** 假模型根本不看 `tool_call_id`。

**真接口会报错**，提示 `tool_call_id` 找不到对应的 tool_call（不同服务商措辞略有差异，但都是 400）。

**原因：** 模型可能一次返回三个工具调用。**结果回传时，必须用 id 说清"这是第几个调用的结果"。** id 对不上，模型就不知道哪个结果对应哪个动作。

**怎么查：** 把 `assistant.tool_calls.map(c => c.id)` 和 `messages.filter(m => m.role === "tool").map(m => m.tool_call_id)` 打印出来，逐个比对。

**改回来。**

## 错误 3：把结果放成 `role: "user"`

**操作：** 把

```javascript
messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
```

改成

```javascript
messages.push({ role: "user", content: "查询结果是 " + JSON.stringify(result) });
```

**屏幕上：**

```text
=== 回传后的 messages ===
[
  { "role": "system", ... },
  { "role": "user", "content": "这个月卖了多少？" },
  { "role": "user", "content": "查询结果是 {\"ok\":true,...}" }
]
[mock] 第 2 轮，消息 3 条 ...
=== 第二轮 ===
最终回答：我是假模型，只认得几个关键词。你可以问「数据库里有哪些表」或者「这个月卖了多少」。
```

**原因：** 假模型只找 `role: "tool"` 的消息，你放成 `user`，它认为"还没有工具结果"，于是回到关键词匹配分支。**关键词在"查询结果是..."里匹配不到，就返回了兜底话术。**

**在真接口上，后果更隐蔽：** 模型会把这条当成"用户又补充了一句话"，可能回答得看起来正常，也可能完全忽略。**你不会看到任何报错。**

**怎么查：** 打印每条消息的 `role`。工具结果必须是 `tool`，不是 `user`、不是 `system`、不是 `assistant`。

**改回来。**

## 错误 4：工具抛异常，你没接住

**操作：** 把 `dispatch.js` 里的 `try/catch` 删掉，只留 `return Object.assign({ ok: true }, fn(args));`。

**然后用一个不存在的订单跑：**

```text
node single-step.js 查一下订单 SO99999
```

**屏幕上：**

```text
=== 执行 ===
工具：get_order
参数：{"order_no":"SO99999"}
Error: 没有这个订单：SO99999
    at getOrder (B:\...\tools-run.js:78:15)
    at dispatch (B:\...\dispatch.js:31:20)
    ...
```

**进程直接退出，第二轮没有发生，用户什么答案都没拿到。**

**原因：** 异常从 `dispatch` 一路冒到 `main()`，被最后的 `.catch` 接住，打印一行就结束了。

**对比一下：接住之后**

```text
结果：{"ok":false,"error":"没有这个订单：SO99999"}
最终回答：查询失败了：没有这个订单：SO99999
```

**模型知道失败了，还能补救**（比如问用户"是不是订单号写错了"）。

**怎么查：** 终端出现 `at dispatch (...)` 这种调用栈，就是没接住。

**改回来。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第04节课/02-笔记/NOTES.md`，按下面的小标题写。**小标题一个字都不要改。**

```markdown
# 第 95 节课学习笔记

## 一、tool_call 的三个字段

| 字段 | 是什么 | 我用它做什么 |
|---|---|---|
| id | | |
| function.name | | |
| function.arguments | | |

## 二、执行前必须先做什么

一句话：

如果跳过这一步，模型给 `{"order_no":"SO99999"}` 会怎样：

## 三、dispatch 的五步

1.
2.
3.
4.
5.

哪一步最重要，为什么：

## 四、角色为 tool 的消息长什么样

```json
（贴一条真实的 role:"tool" 消息）
```

`content` 是什么类型：

## 五、tool_call_id 为什么必须对上

一句话：

我验证的方式：

## 六、我在 messages 里看到的完整结构

```json
（贴 single-step.js 打印的 messages 数组）
```

一共几条？分别是什么角色：

## 七、三个真实失败

| 输入 | 谁拦住的 | 返回的 error |
|---|---|---|
| 不存在的订单 | | |
| 缺 sql | | |
| limit 传 "10" | | |

## 八、失败为什么也要回传

如果不回传，模型下一轮会做什么：

## 九、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 漏 assistant 消息 | | |
| tool_call_id 抄错 | | |
| 结果放成 user | | |
| 异常没接住 | | |

## 十、黑名单和只读连接

黑名单能拦住什么：

黑名单拦不住什么：

为什么说 `readonly: true` 才是真正的防线：

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `node single-step.js 这个月卖了多少` 输出 22 和 23269.11
- [ ] 我看到 messages 里 assistant 的 `content` 是 `null`
- [ ] 我的 tool 消息 `tool_call_id` 和 assistant 里的一致
- [ ] `bad-calls.js` 七行输出都对
- [ ] 我做过去掉 `readonly` 的实验，看到 `attempt to write a readonly database`
- [ ] 我做过四个错误实验
- [ ] 我能说出"失败也要回传"的理由
```

---

# 第 8 步：课后练习

## 练习一：把 `query_stats` 的 SQL 记下来

在 `tools-run.js` 的 `queryStats` 里加一行：

```javascript
console.log("[sql] " + finalSql);
```

跑三次（这个月、按城市、按状态），把三条 SQL 抄进笔记。

**思考：** 这三条 SQL 是你写的，还是模型写的？

## 练习二：让 `get_order` 返回更少字段

现在返回 `SELECT *`，包含 7 个字段。改成只返回 `order_no, city, amount, status`。

要求：`description` 也同步改（返回结构变了，说明书要跟着变）。

**这一题在练一件事：** 工具实现和工具说明必须同步，否则模型会按旧结构理解结果。

## 练习三：加一个"参数合法但结果为空"的工具

写 `find_orders_by_city(city)`，参数 `enum: ["北京","上海","广州","深圳","杭州"]`。

要求：

- 查不到时返回 `{ok:true, rows:[], rowCount:0}`，**不抛错**；
- 在 `dispatch` 里注册；
- 跑一次"杭州"，一次"北京"。

**思考：** "查不到"和"查询失败"应该用同一种返回结构吗？为什么？

## 练习四：把 `dispatch` 的返回加上耗时

用 `Date.now()` 包住 `fn(args)`，返回里加 `ms` 字段。

然后在 `bad-calls.js` 里看每一行多了什么。

**要求：** 校验失败时也要有 `ms`（耗时接近 0）。

## 练习五：用自己的话讲清

```text
1. 为什么 `dispatch` 绝对不能抛异常？
2. 为什么参数校验要放在执行前面？举一个不校验就崩的例子。
3. `tool_call_id` 是干什么的？如果没有它，模型会遇到什么问题？
4. 工具失败了，为什么还要把失败结果回传？
5. 关键词黑名单为什么不是安全边界？
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出 `tool_calls` 里 id、name、arguments 各是什么
- [ ] 我知道执行前必须先校验参数
- [ ] 我知道工具结果要用 `role: "tool"` 回传
- [ ] 我知道 `tool_call_id` 必须和 assistant 消息里的 id 一致
- [ ] 我知道失败也要回传

## B. 实操

- [ ] `node single-step.js 这个月卖了多少` 输出 `22` 和 `23269.11`
- [ ] `messages` 是 4 条，角色顺序是 system / user / assistant / tool
- [ ] `bad-calls.js` 七行输出与课件一致
- [ ] `node -e` 删数据报 `attempt to write a readonly database`
- [ ] `dispatch("drop_table", {})` 返回 `没有这个工具`

## C. 排错

- [ ] 看到 `Cannot read properties of undefined (reading 'rows')`，我知道是 `ok:false`
- [ ] 看到 `Unexpected token o`，我知道是 content 传了对象
- [ ] 看到 400 且提示 `role 'tool'`，我知道是漏了 assistant 消息或 id 对不上
- [ ] 看到调用栈直接退出，我知道是没 `try/catch`

## D. 笔记

- [ ] `NOTES.md` 十二个小标题都填了
- [ ] 贴了完整的 messages JSON
- [ ] 七组结果抄了至少三组
- [ ] "黑名单和只读连接"写了自己的判断

## 本节课要能说出口的一句话

> **模型只看得见 messages 里的东西——你执行完不把结果塞回去，它等于什么都没做。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 第二轮还是 `tool_calls` | 有没有 push `role:"tool"` | 补上，content 用 `JSON.stringify` |
| `Unexpected token o` | content 是对象 | 序列化成字符串 |
| 400 `messages with role 'tool'` | 前面有无 assistant 消息 | 先 push `msg` 再 push tool |
| `attempt to write a readonly database` | 正常，这是防线 | 不要为了"能写"去掉 readonly |
| `dispatch is not a function` | 导出 | `module.exports = { dispatch }` |
| 进程直接退出 | 有未捕获异常 | 全局检查 `try/catch` |
| 查询返回 100 行 | `LIMIT 100` 生效了 | 正常 |
| `near "LIMIT": syntax error` | SQL 里已有 `LIMIT 5 OFFSET 10` | 让模型重写，或自己解析 |
