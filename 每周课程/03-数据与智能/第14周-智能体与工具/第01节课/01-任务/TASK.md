# 第 92 节课：区分聊天和智能体

> 这节课结束时，你手上有：`第01节课/03-练习代码/agent/` 里一个能跑的最小循环 `agent.js`，它用三行固定剧本模拟"模型决定下一步"，把 `data/app.db` 里的订单数查出来并说成人话。

**建议用时**：95 分钟
**前置**：第 91 节课做出来的检索问答脚本，以及 W11–W13 建的 `data/app.db`

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

到第 91 节课结束，你能做这些事：

| 你会 | 具体到什么程度 |
|---|---|
| 调模型 | `fetch` 发 `chat/completions`，带 `messages`，拿回 `choices[0].message.content` |
| 结构化输出 | 让模型只返回 JSON，然后用 `JSON.parse` 解析 |
| 写 SQL | 手写 SELECT、JOIN、GROUP BY、聚合 |
| 用数据库 | `better-sqlite3` 打开 `data/app.db`，`prepare().all()` 拿数组 |
| 检索 | 把资料片段拼进 prompt，让模型照着回答 |

**这些能力加起来，你还是只能做一件事：问一句，答一句。**

## 0.2 今天这个坑长什么样

上周有人找你做个内部小工具。原话是：

> "我每天上班第一件事就是想知道昨天卖了多少、哪个城市卖得好。你能不能做个东西，我在输入框里问一句，它自己去查？"

你第一反应是写个聊天接口：

```text
用户：这个月卖了多少？
模型：要统计这个月的销售额，可以用 SELECT SUM(amount) FROM orders WHERE ...
```

**模型答得很好，但它没有去查。** 它把 SQL 写给你看，数字一个都没有。

你可能会想："那我让它返回 SQL，我在代码里执行不就行了？" 那你就得处理这些情况：

- 用户问"哪个城市卖得好"，模型返回的 SQL 里 `GROUP BY` 写错了怎么办；
- 用户问"这个月"到底是 11 月 1 日到今天，还是最近 30 天；
- 用户先问"有哪些表"，再问"那张表里最大的订单"，第二句能不能接上第一句的上下文；
- 模型返回的 SQL 是 `DELETE FROM orders`，你执行不执行。

**这四件事，就是"聊天"和"智能体"的分界线。**

聊天只有一次输入、一次输出。智能体是：**模型输出一个动作，你的程序执行它，把结果还给模型，模型再决定下一步**——直到它认为任务完成。

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 聊天（chat） | 你问一句，它答一句，答完就结束 | `chat.js`，第 2 步 |
| 智能体（agent） | 模型每一步只决定"下一个动作"，程序负责执行，循环到完成 | `agent.js`，第 4 步 |
| 动作（action / tool call） | 模型输出的不是一个答案，而是一句"帮我执行 list_tables" | 第 3 步的剧本里，`action` 字段 |

**今天不写 `tools` 参数，也不调真接口。** 第 94 节课才接工具协议。今天先用一个写死的"假模型"把循环的样子看清楚——**循环的结构没搞懂，接上真接口只会更乱。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `package.json` | `第01节课/03-练习代码/agent/` | 只装 `better-sqlite3` 和 `dotenv` |
| `seed.js` | 同上 | 建 `orders` 表并写 200 条假订单 |
| `check-db.js` | 同上 | 打印表名、行数、前 3 行 |
| `chat.js` | 同上 | 一次问答，用来对照 |
| `agent.js` | 同上 | 最小循环，三行剧本 |
| `NOTES.md` | `第01节课/02-笔记/` | 你的记录 |

---

# 第 1 步：把战场搭起来（15 分钟）

## 1.1 做什么 / 为什么

这一周所有代码都放在一个叫 `agent` 的文件夹里。**每节课复制一份往前走**，不要跨节课引用文件——路径一长，`require` 找不到文件，你会花半小时查一个拼写错误。

数据库也放在 `agent/data/app.db`。W11–W13 建过库的，把那个 `app.db` 复制过来；没建过的，下面 `seed.js` 给你造 200 条。

## 1.2 操作

**第一次：新建目录。**

```text
cd "B:\OPC-Distance_study\每周课程\03-数据与智能\第14周-智能体与工具\第01节课\03-练习代码"
mkdir agent
cd agent
npm init -y
npm install better-sqlite3 dotenv
```

**建 `.env`：**

```text
MOCK=true
OPENAI_BASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
```

**建 `seed.js`，自己敲：**

```javascript
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "app.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  city TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const count = db.prepare("SELECT COUNT(*) AS c FROM orders").get().c;
if (count > 0) {
  console.log("orders 里已有 " + count + " 条，跳过造数");
  process.exit(0);
}

const cities = ["北京", "上海", "广州", "深圳", "杭州"];
const insert = db.prepare(`
  INSERT INTO orders (order_no, customer, city, amount, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const run = db.transaction(() => {
  for (let n = 1; n <= 200; n++) {
    const orderNo = "SO" + String(n).padStart(5, "0");
    const customer = "客户" + String((n * 37) % 60 + 1).padStart(2, "0");
    const city = cities[n % 5];
    const amount = Math.round((50 + ((n * 137) % 1950) + (n % 100) / 100) * 100) / 100;
    const status = n % 11 === 0 ? "refunded" : n % 7 === 0 ? "pending" : "paid";

    const d = new Date(Date.UTC(2026, 8, 1));
    d.setUTCDate(d.getUTCDate() + (n % 75));
    const date = d.toISOString().slice(0, 10);
    const hour = String(8 + (n % 12)).padStart(2, "0");
    const minute = String((n * 7) % 60).padStart(2, "0");

    insert.run(orderNo, customer, city, amount, status, date + " " + hour + ":" + minute + ":00");
  }
});

run();

const groups = db.prepare("SELECT status, COUNT(*) AS c FROM orders GROUP BY status").all();
console.log("已写入 200 条订单 → " + path.join("data", "app.db"));
for (const g of groups) {
  console.log(g.status + ": " + g.c + " 条");
}
```

**建 `check-db.js`：**

```javascript
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "data", "app.db"), { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  .all();

console.log("表：" + tables.map((t) => t.name).join(", "));

const total = db.prepare("SELECT COUNT(*) AS c FROM orders").get().c;
console.log("orders 行数：" + total);

const rows = db.prepare("SELECT order_no, city, amount, status, created_at FROM orders ORDER BY id LIMIT 3").all();
console.log("前 3 行：");
console.table(rows);
```

## 1.3 屏幕上应该看到什么

```text
> node seed.js
已写入 200 条订单 → data\app.db
paid: 156 条
pending: 26 条
refunded: 18 条
```

```text
> node check-db.js
表：orders
orders 行数：200
前 3 行：
┌─────────┬───────────┬────────┬────────┬─────────┬─────────────────────┐
│ (index) │ order_no  │  city  │ amount │ status  │     created_at      │
├─────────┼───────────┼────────┼────────┼─────────┼─────────────────────┤
│    0    │ 'SO00001' │ '上海' │ 187.01 │ 'paid'  │ '2026-09-02 09:07:00' │
│    1    │ 'SO00002' │ '广州' │ 324.02 │ 'paid'  │ '2026-09-03 10:14:00' │
│    2    │ 'SO00003' │ '深圳' │ 461.03 │ 'paid'  │ '2026-09-04 11:21:00' │
└─────────┴───────────┴────────┴────────┴─────────┴─────────────────────┘
```

**记下这三个数字：156 / 26 / 18。** 后面几节课的所有输出都以这个库为准，对不上就说明你造数的代码和课件不一样。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | 在错误的目录执行，或者 `npm install` 失败了 | `dir` 看当前目录有没有 `node_modules`，没有就重新 `npm install` |
| 报表不存在 `no such table: orders` | `seed.js` 没跑成功，或者 `data` 目录是空的 | 删掉 `data\app.db` 重跑 `node seed.js` |
| `SQLITE_CANTOPEN` | `data` 目录不存在，且用的是 `readonly: true` | 先跑 `seed.js`，它会建目录 |
| `npm install` 卡在编译 | 没有 Python / VS Build Tools | 见本节末尾的降级方案 |

**装不上 `better-sqlite3` 的降级方案**（Node 22.5 以上）：

```javascript
// 把 require("better-sqlite3") 换成：
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/app.db");
```

`prepare().all()` 和 `.get()` 用法一样，只有构造方式不同。**这一周剩下的代码都能直接跑。**

---

# 第 2 步：先写一次问答（20 分钟）

## 2.1 做什么 / 为什么

在写循环之前，先把"聊天"写出来。**你要有一个对照组，才知道智能体多出来了什么。**

`chat.js` 不联网。它内部有一个 `fakeModel()`，收到问题就返回一段固定的分析文字——**今天要观察的是程序结构，不是模型能力。**

## 2.2 操作

**建 `chat.js`：**

```javascript
// 一次问答：输入一个问题，输出一段文字，结束。
// 这里的 fakeModel 代替真实模型，第 94 节课会换成 llm.js。

function fakeModel(question) {
  if (question.includes("多少") || question.includes("统计")) {
    return [
      "要统计本月销售额，可以执行下面这条 SQL：",
      "SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total",
      "FROM orders",
      "WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid';",
      "",
      "执行后就能得到订单数和总金额。"
    ].join("\n");
  }
  return "我需要更多信息才能回答这个问题。";
}

function chatOnce(question) {
  console.log("用户：" + question);
  const answer = fakeModel(question);
  console.log("模型：" + answer);
  return answer;
}

const question = process.argv.slice(2).join(" ") || "这个月卖了多少？";
chatOnce(question);

console.log("\n--- 程序结束 ---");
```

**跑三次：**

```text
node chat.js 这个月卖了多少？
node chat.js 有哪些表？
node chat.js 退款订单占比多少？
```

## 2.3 屏幕上应该看到什么

```text
> node chat.js 这个月卖了多少？
用户：这个月卖了多少？
模型：要统计本月销售额，可以执行下面这条 SQL：
SELECT COUNT(*) AS cnt, ROUND(SUM(amount), 2) AS total
FROM orders
WHERE substr(created_at, 1, 7) = '2026-11' AND status = 'paid';

执行后就能得到订单数和总金额。

--- 程序结束 ---
```

**注意最后一行：`--- 程序结束 ---`。**

这就是聊天。它输出了一段**可能正确的建议**，然后程序退出。数据库一次都没被打开，`data/app.db` 里的 200 条订单一条都没被读过。

**这就是你今天要跨过去的那条线：模型说了，但没做。**

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 输出的中文是乱码 | cmd 代码页不是 65001 | 先执行 `chcp 65001`，再跑 |
| `question` 是空的 | 参数里有空格没加引号 | `node chat.js "这个月卖了多少"` |
| 三次输出一模一样 | 你的 `fakeModel` 里 `if` 写错了 | 用 `console.log(question)` 先确认参数进来了 |

---

# 第 3 步：看清"动作"和"答案"的区别（20 分钟）

## 3.1 做什么 / 为什么

第 2 步的模型返回的是一段**文字**。现在换一种返回：**不是文字，是一个动作。**

```json
{ "action": "query_stats", "args": { "sql": "SELECT COUNT(*) AS cnt FROM orders LIMIT 100" } }
```

这句话的意思是"帮我执行 `query_stats`，参数是这条 SQL"。**它没有回答任何问题，它只是提出了下一步。**

你的程序收到这个动作，去执行，拿到结果，再交回给模型。模型看到结果，才决定是继续要动作，还是给答案。

**这就是智能体的全部秘密。** 剩下六节课都是在给这个循环加东西：工具说明书、参数校验、多轮、权限。

## 3.2 操作

**建 `agent.js`（第一版，剧本写死）：**

```javascript
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "data", "app.db"), { readonly: true });

// 这个数组代替"模型"。每一项就是模型在某一轮输出的动作。
const SCRIPT = [
  { action: "list_tables", args: {} },
  { action: "query_stats", args: { sql: "SELECT COUNT(*) AS cnt FROM orders LIMIT 100" } },
  { action: "answer", args: { text: "数据库里只有一张 orders 表，一共 200 条订单。" } }
];

function runTool(name, args) {
  if (name === "list_tables") {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    return { ok: true, tables: rows.map((r) => r.name) };
  }

  if (name === "query_stats") {
    const rows = db.prepare(args.sql).all();
    return { ok: true, rows: rows, rowCount: rows.length };
  }

  return { ok: false, error: "没有这个工具：" + name };
}

const history = [];

for (let round = 1; round <= SCRIPT.length; round++) {
  const step = SCRIPT[round - 1];

  console.log("\n=== 第 " + round + " 轮 ===");
  console.log("模型想干什么：" + step.action + " " + JSON.stringify(step.args));

  if (step.action === "answer") {
    console.log("模型给出答案：" + step.args.text);
    break;
  }

  const result = runTool(step.action, step.args);
  console.log("实际返回什么：" + JSON.stringify(result));

  history.push({ round: round, action: step.action, result: result });
}

console.log("\n一共执行了 " + history.length + " 个动作。");
```

## 3.3 屏幕上应该看到什么

```text
> node agent.js

=== 第 1 轮 ===
模型想干什么：list_tables {}
实际返回什么：{"ok":true,"tables":["orders"]}

=== 第 2 轮 ===
模型想干什么：query_stats {"sql":"SELECT COUNT(*) AS cnt FROM orders LIMIT 100"}
实际返回什么：{"ok":true,"rows":[{"cnt":200}],"rowCount":1}

=== 第 3 轮 ===
模型想干什么：answer {"text":"数据库里只有一张 orders 表，一共 200 条订单。"}
模型给出答案：数据库里只有一张 orders 表，一共 200 条订单。

一共执行了 2 个动作。
```

**对比第 2 步的输出。** 同样是"这个库里有 200 条订单"，第 2 步的模型是**猜**的（它根本没连库），第 3 步的数字是**查**出来的。

**判断一个系统是不是智能体，只看一件事：它的输出有没有被执行，执行结果有没有回去影响下一步。**

不是看它叫不叫 Agent，不是看它用了哪个框架。

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第 2 轮报 `no such column: cnt` | `LIMIT 100` 写在了聚合函数前面 | 检查 SQL 顺序：`SELECT ... FROM ... WHERE ... LIMIT` |
| `SQLITE_READONLY` | 你用 `readonly` 打开了库，却执行了写语句 | 这一周查询一律只读，写操作第 97 节课单独讲 |
| 循环只跑了 1 轮 | `SCRIPT.length` 写成了 1 | 打印 `SCRIPT.length` 确认 |
| 输出里 `tables` 是 `[]` | 库是空的 | 回第 1 步重跑 `seed.js` |

---

# 第 4 步：把剧本换成"模型"，循环结构不变（25 分钟）

## 4.1 做什么 / 为什么

第 3 步的剧本是写死的：你提前知道模型会说三句话。

现在把 `SCRIPT` 换成一个函数 `decide(question, history)`。它还是假的，但它**根据历史决定下一步**，而不是按数组下标。

**这一步要建立的东西：循环的四个零件。** 换成真模型时，只有第 2 个零件变了。

| 零件 | 作用 | 今天谁来实现 |
|---|---|---|
| ① 状态 | `messages` 数组，记着问过什么、做过什么 | 你的 `history` |
| ② 决策 | 看状态，输出一个动作或一个答案 | `decide()`，第 94 节换成 `llm.chat()` |
| ③ 执行 | 按名字分派到真函数，拿到结果 | `dispatch()` |
| ④ 停止 | 什么时候退出循环 | 答案 / 轮数上限 / 致命错误 |

## 4.2 操作

**覆盖 `agent.js`：**

```javascript
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "data", "app.db"), { readonly: true });
const MAX_ROUNDS = 4;

// 假模型：看问题 + 已经做过的事，决定下一步。
// 返回值只有两种形态：{ type: "action", name, args } 或 { type: "answer", text }
function decide(question, history) {
  const didList = history.some((h) => h.name === "list_tables");
  const didCount = history.some((h) => h.name === "query_stats");

  if (!didList) {
    return { type: "action", name: "list_tables", args: {} };
  }

  if (!didCount) {
    return {
      type: "action",
      name: "query_stats",
      args: { sql: "SELECT COUNT(*) AS cnt FROM orders LIMIT 100" }
    };
  }

  const last = history[history.length - 1];
  const cnt = last.result.rows[0].cnt;
  return {
    type: "answer",
    text: "数据库里只有一张 orders 表，一共 " + cnt + " 条订单。"
  };
}

function dispatch(name, args) {
  if (name === "list_tables") {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    return { ok: true, tables: rows.map((r) => r.name) };
  }

  if (name === "query_stats") {
    try {
      const rows = db.prepare(args.sql).all();
      return { ok: true, rows: rows, rowCount: rows.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: "没有这个工具：" + name };
}

const question = process.argv.slice(2).join(" ") || "这个月卖了多少？";
const history = [];

console.log("用户：" + question);

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const step = decide(question, history);

  console.log("\n=== 第 " + round + " 轮 ===");
  console.log("模型想干什么：" + step.type + " " + (step.name || ""));

  if (step.type === "answer") {
    console.log("模型给出答案：" + step.text);
    break;
  }

  const result = dispatch(step.name, step.args);
  console.log("实际返回什么：" + JSON.stringify(result));
  history.push({ round: round, name: step.name, args: step.args, result: result });
}
```

## 4.3 屏幕上应该看到什么

```text
> node agent.js 数据库里有多少订单？

用户：数据库里有多少订单？

=== 第 1 轮 ===
模型想干什么：action list_tables
实际返回什么：{"ok":true,"tables":["orders"]}

=== 第 2 轮 ===
模型想干什么：action query_stats
实际返回什么：{"ok":true,"rows":[{"cnt":200}],"rowCount":1}

=== 第 3 轮 ===
模型想干什么：answer
模型给出答案：数据库里只有一张 orders 表，一共 200 条订单。
```

**现在做一件重要的事：把 `MAX_ROUNDS` 改成 2，再跑一次。**

```text
=== 第 1 轮 ===
模型想干什么：action list_tables
实际返回什么：{"ok":true,"tables":["orders"]}

=== 第 2 轮 ===
模型想干什么：action query_stats
实际返回什么：{"ok":true,"rows":[{"cnt":200}],"rowCount":1}
```

**没有答案，程序静默结束。** 因为轮数用完了，`for` 循环自然退出。

**这是一个真实的失败模式：用户什么都没看到，日志里也没有报错。** 所以循环退出时必须打印"为什么停的"，第 96 节课会把这件事做完整。

**改回 4。**

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第 3 轮还在调工具 | `didCount` 用 `history.some` 判断，但你 push 的字段名不是 `name` | 打印 `JSON.stringify(history)` 看字段 |
| `Cannot read properties of undefined (reading 'rows')` | `history` 最后一项是 `list_tables` 的结果 | 确认最后一次 push 的是 `query_stats` |
| 改完代码没变化 | 没保存，或者跑的是另一个目录的 `agent.js` | `dir` 看时间戳，`Ctrl + S` 再跑 |

---

# 第 5 步：什么时候不该用智能体（15 分钟）

## 5.1 做什么 / 为什么

**这一节是刹车。** 学会循环之后，人会本能地想把所有东西都做成循环。这是错的。

先看一个反例。需求是："用户点一下按钮，显示今天日期。"

**用智能体的写法：**

```text
第 1 轮：模型想干什么 → get_date {}
第 2 轮：模型想干什么 → format_date {"date":"2026-11-16"}
第 3 轮：模型想干什么 → answer "今天是 2026 年 11 月 16 日"
```

**代价：**

| 项目 | 直接写 `new Date()` | 用智能体 |
|---|---|---|
| 耗时 | 0 毫秒 | 3 次模型调用，每次几百毫秒到几秒 |
| 花钱 | 0 | 3 次 token |
| 出错可能 | 几乎为 0 | 模型可能把日期格式搞错、可能多调一轮、可能把 2026 说成 2025 |
| 代码量 | 1 行 | 循环 + 2 个工具 + prompt |
| 可测试 | 好测 | 要 mock 三次返回 |

**结论：一步能做完的事，不要上循环。**

## 5.2 判断表

拿这张表对照你的需求，**任何一行落在右边，就别上智能体**：

| 特征 | 用普通代码 | 用智能体 |
|---|---|---|
| 步骤数 | 固定 1–2 步，顺序不变 | 步数不固定，要看上一步结果 |
| 分支 | 你能提前写出所有 if | 分支太多，写不全 |
| 输入 | 格式固定（表单、按钮） | 自然语言，用户想说什么说什么 |
| 工具数 | 1 个 | 3 个以上，且要模型挑 |
| 错误代价 | 错了重跑一次 | 错了会删数据、发错邮件（第 97 节） |

**举三个真实需求，你来对号：**

```text
"每天早上 8 点把昨天的订单数发到我邮箱"
→ 普通代码 + node-cron。步骤固定：查库 → 拼邮件 → 发。不要智能体。

"帮我看看这个月数据有什么异常"
→ 智能体。异常是什么、要看哪几个维度，你写不出固定的 if。

"用户上传 CSV，我解析后入库"
→ 普通代码。格式固定，智能体只会让解析变得不确定。
```

## 5.3 一个折中做法

真实项目里最常见的不是"全智能体"，是**一个大循环里，能写死的部分写死**。

比如第 98 节课的成品：

```text
模型负责：决定查什么（选工具、写 SQL）
代码负责：SQL 必须带 LIMIT、必须只读、结果最多 100 行
```

**模型管"想查什么"，代码管"不许乱来"。** 这句话第 97 节课还会再讲一次。

## 5.4 屏幕上应该看到什么

这一节不写新代码，但你要在笔记里留下判断。先跑一次这个，看看"上循环"的成本长什么样：

```text
node agent.js 今天几号
```

```text
用户：今天几号

=== 第 1 轮 ===
模型想干什么：action list_tables
实际返回什么：{"ok":true,"tables":["orders"]}

=== 第 2 轮 ===
模型想干什么：action query_stats
实际返回什么：{"ok":true,"rows":[{"cnt":200}],"rowCount":1}

=== 第 3 轮 ===
模型想干什么：answer
模型给出答案：数据库里只有一张 orders 表，一共 200 条订单。
```

**看清楚了：它问"今天几号"，系统查了两遍订单表，最后答了一个跟日期毫无关系的结果。**

这就是"用错工具"的真实后果。不是报错，是**自信地答非所问**。

## 5.5 如果不是这样

如果你的输出是"我需要更多信息"，说明你改了 `decide` 的分支。**恢复成课件版本再跑**，这一节的目的是看到错误匹配的样子。

---

# 第 6 步：故意犯四个错（15 分钟）

## 错误 1：把动作当答案打印给用户

**操作：** 把 `agent.js` 里这一行

```javascript
console.log("模型给出答案：" + step.text);
```

改成

```javascript
console.log("模型给出答案：" + JSON.stringify(step));
```

**屏幕上会看到：**

```text
模型给出答案：{"type":"answer","text":"数据库里只有一张 orders 表，一共 200 条订单。"}
```

**原因：** `step` 是动作对象，`step.text` 才是给人看的文字。真实接口里对应的是 `message.content` 和 `message.tool_calls`——**第 94 节课你会看到，模型返回 `tool_calls` 时 `content` 是 `null`，直接打印就是 `null`。**

**怎么查：** 在打印前加一行 `console.log(typeof step.text)`。是 `undefined` 就说明字段名错了。

**改回来。**

## 错误 2：`while (true)` 没有上限

**操作：** 把 `for` 循环改成：

```javascript
let round = 1;
while (true) {
  const step = decide(question, history);
  // ... 中间的代码不变
  round++;
}
```

**会怎样：** 如果 `decide` 一直返回 `action`，程序永远不退出。终端刷屏，CPU 占用上去，`Ctrl + C` 才能停。

**为什么：** 循环的退出条件不能只依赖"模型会给答案"。**模型会犯错，网络会超时，工具会一直失败。** 你必须有一个不依赖模型的硬上限。

**怎么查：** 看终端轮次有没有超过你预期的数字。真实项目里这个数字写进配置，第 98 节课用 `MAX_ROUNDS = 8`。

**改回 `for` 循环。**

## 错误 3：循环里没有"完成"判断

**操作：** 把 `if (step.type === "answer")` 整个 `if` 块删掉，只留 `dispatch`。

**会怎样：**

```text
=== 第 3 轮 ===
模型想干什么：action 
实际返回什么：{"ok":false,"error":"没有这个工具：undefined"}
=== 第 4 轮 ===
模型想干什么：action 
实际返回什么：{"ok":false,"error":"没有这个工具：undefined"}
```

**原因：** 模型说"我答完了"，你的程序却把它当成一个叫 `undefined` 的工具去执行。

**这个错误在真实系统里的表现是：** 用户已经看到答案了，后台还在发请求、还在扣钱。

**怎么查：** 日志里出现 `没有这个工具：undefined`，就是没判断 `answer` 分支。

## 错误 4：以为"模型知道"就等于"程序知道"

**操作：** 在 `agent.js` 开头 `console.log("数据库里有 200 条订单")`，然后跑 `node agent.js 有多少订单`。

**屏幕上：**

```text
数据库里有 200 条订单
用户：有多少订单
...
模型给出答案：数据库里只有一张 orders 表，一共 200 条订单。
```

**看起来对，但这是假的。** 你把答案写在了自己的代码里，模型并没有查。**把 `seed.js` 里的 200 改成 300，重跑造数，再跑 `agent.js`——它还是会说 200。**

**原因：** 语言模型不知道你数据库里有什么。它只知道你放进 `messages` 里的东西。**"让它查"和"告诉它"是两件事。**

**怎么查：** 改数据，看输出变不变。**输出不跟着数据变，说明数字是写死的。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第01节课/02-笔记/NOTES.md`，按下面的小标题写。**小标题一个字都不要改**，它和这份课件是对应的。

```markdown
# 第 92 节课学习笔记

## 一、聊天和智能体的分界线

用一句话写：

## 二、一次问答的程序长什么样

`chat.js` 跑完最后打印的那一行是什么？为什么说它"没有查库"：

## 三、"动作"和"答案"的区别

| | 聊天 | 智能体 |
|---|---|---|
| 模型输出 | | |
| 谁来执行 | | |
| 什么时候结束 | | |

## 四、最小循环的四个零件

| 零件 | 作用 | 我的代码里对应哪一段 |
|---|---|---|
| 状态 | | |
| 决策 | | |
| 执行 | | |
| 停止 | | |

## 五、三轮循环的真实记录

把 `node agent.js 数据库里有多少订单？` 的完整输出贴进来：

```text
（粘贴）
```

第 2 轮返回的 JSON 里，`cnt` 是多少：

## 六、什么任务不该用智能体

我的判断（不要抄表格，用自己的话说）：

## 七、反例：用循环回答"今天几号"

它实际答了什么：

为什么会这样：

## 八、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 把动作当答案 | | |
| while(true) | | |
| 没有完成判断 | | |
| 把答案写死在代码里 | | |

## 九、我怎么判断一个需求该不该上循环

写下你自己的三条判断标准：

1.
2.
3.

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] `data/app.db` 里有 200 条订单，状态是 156/26/18
- [ ] `chat.js` 能跑，输出里没有任何数据库数字
- [ ] `agent.js` 能跑，第 2 轮返回 `{"cnt":200}`
- [ ] 我把 `MAX_ROUNDS` 改成 2，看到了"没有答案就退出"
- [ ] 我做过四个错误实验
- [ ] 我能说出循环的四个零件
- [ ] 我能举一个"不该用智能体"的例子
```

---

# 第 8 步：课后练习

## 练习一：加一个工具，不改循环

在 `agent.js` 的 `dispatch` 里加一个 `count_by_status`，返回每种状态的订单数：

```text
{ ok: true, rows: [ { status: "paid", cnt: 156 }, { status: "pending", cnt: 26 }, { status: "refunded", cnt: 18 } ] }
```

要求：**只加 `dispatch` 里的一个分支，循环一行都不改。** 然后改 `decide`，让它第二次调用这个工具而不是 `query_stats`。

**这道题在验证一件事：循环和执行是分开的。** 加工具不该动循环。

## 练习二：让循环说出"为什么停"

在第 4 步的 `for` 循环外面加一个变量 `stopReason`，三个值：

```text
answer      模型给了答案
max_rounds  轮数用完
error       工具返回 ok: false
```

循环结束后打印 `停止原因：xxx`。

**要求：** 把 `MAX_ROUNDS` 改成 2 时，必须打印 `max_rounds`，不能什么都不打印。

## 练习三：故意让它答错

把 `decide` 里最后一段改成：

```javascript
return { type: "answer", text: "数据库里大概有几百条订单。" };
```

跑一次，然后在笔记里写：**这个答案和真实数字差多少？如果这是给老板看的日报，后果是什么？**

## 练习四：给三个需求分类

下面三个需求，判断"普通代码"还是"智能体"，写一句理由：

```text
A. 用户输入订单号，页面显示这笔订单的详情
B. 用户说"帮我看看最近哪批订单有问题"，系统自己决定查退款率还是查异常金额
C. 每天凌晨 2 点，把超过 30 天未支付的订单标记为 closed
```

## 练习五：用自己的话讲清

不看课件，回答这四个问题：

```text
1. 聊天和智能体的区别，为什么说"模型输出的是动作，不是答案"？
2. 循环的四个零件分别是什么？换成真模型时哪个零件会变？
3. 为什么一步能做完的事不该上循环？给一个你自己想到的例子。
4. 如果循环跑完了却没输出答案，你会先查什么？
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清聊天和智能体的分界线
- [ ] 我能解释"模型输出的是动作，不是答案"
- [ ] 我知道循环的四个零件
- [ ] 我能说出至少两个"不该用智能体"的场景
- [ ] 我知道模型不知道我数据库里有什么

## B. 实操

- [ ] `agent/data/app.db` 存在，200 条订单
- [ ] `node check-db.js` 输出 `orders 行数：200`
- [ ] `node chat.js 这个月卖了多少` 输出 SQL 建议，但没有数字
- [ ] `node agent.js 数据库里有多少订单` 输出 `{"cnt":200}` 和最终答案
- [ ] 我把 `MAX_ROUNDS` 改成 2，复现了"没有答案"

## C. 排错

- [ ] 遇到 `没有这个工具：undefined`，我知道是漏了 `answer` 分支
- [ ] 遇到循环不退出，我知道先看轮次上限
- [ ] 遇到输出是 `[object Object]`，我知道该用 `JSON.stringify`
- [ ] 遇到数字不跟着数据变，我知道数字是写死的

## D. 笔记

- [ ] `NOTES.md` 十一个小标题都填了
- [ ] 贴了完整的三轮输出
- [ ] 四个错误都记了"现象 / 原因 / 怎么查"
- [ ] "我还不懂的词"至少写了两个

## 本节课要能说出口的一句话

> **聊天是模型给你一段话，智能体是模型给你一个动作——你的程序执行它，把结果还回去，直到它说"够了"。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | 当前目录 | `cd` 到 `agent`，`npm install` |
| `no such table: orders` | `data\app.db` 大小是不是 0 | 删库重跑 `node seed.js` |
| 输出 `[object Object]` | 打印的是对象 | 用 `JSON.stringify(x)` |
| 循环只跑一轮 | `break` 位置 | 检查是不是在 `dispatch` 前就 break 了 |
| 答案里的数字永远是 200 | 数字写死了 | 改数据重跑，看变不变 |
| 中文乱码 | cmd 代码页 | `chcp 65001` |
| `SQLITE_READONLY` | 用了只读连接 | 这一周查询只读，写操作第 97 节讲 |
| `node:sqlite` 报错 | Node 版本低于 22.5 | 升级 Node，或装 `better-sqlite3` |
