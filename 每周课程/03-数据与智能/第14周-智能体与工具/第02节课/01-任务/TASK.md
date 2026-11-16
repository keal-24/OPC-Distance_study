# 第 93 节课：设计工具说明

> 这节课结束时，你手上有：`第02节课/03-练习代码/agent/tools.js`，四个工具，每个都有能约束模型的 `description` 和参数边界；外加一个 30 行的校验器 `validate.js` 和八组校验结果。

**时间**：约 100 分钟
**前置**：第 92 节课做出来的 `agent/` 目录（`agent.js` 能跑，`data/app.db` 有 200 条订单）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你的 `agent.js` 已经能循环了：

```text
模型要动作 → dispatch 执行 → 结果回到 history → 模型再决定
```

但你的工具是写死在代码里的两个 `if`。**模型看不到这两个 `if`。** 它不知道有 `list_tables`，也不知道 `query_stats` 要传什么。

第 92 节课之所以能跑，是因为 `decide()` 是你自己写的，你当然知道有哪些工具。

换成真模型，它唯一的信息来源就是**你发过去的那段 JSON**。

## 0.2 今天这个坑长什么样

你接了真模型，把两个工具发过去：

```json
[
  { "name": "query", "description": "查询", "parameters": { "sql": "string" } },
  { "name": "list", "description": "列表", "parameters": {} }
]
```

用户问："这个月卖了多少？"

模型返回：

```json
{ "name": "query", "arguments": "{\"sql\":\"SELECT * FROM sales WHERE month = 'this month'\"}" }
```

你去执行，报错：

```text
SQLITE_ERROR: no such table: sales
```

你改一下表名，再跑：

```text
SQLITE_ERROR: no such column: month
```

你心里想的是"这模型真笨"。**但模型没有做错任何事。** 你告诉它"查询"，它就去查；你没告诉它表叫 `orders`，它只能猜 `sales`；你没告诉它日期是文本，它只能猜有个 `month` 列。

**这就是这一节的全部内容：工具说明不是注释，是模型唯一的说明书。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| JSON Schema | 用一段 JSON 描述"这个参数长什么样"的格式 | `parameters` 字段 |
| description | 写给模型看的说明书：这工具干什么、什么时候用、不能干什么 | 每个工具的 `function.description` |
| 参数边界 | 必填、枚举、正则、上下限——把"能传什么"写死 | `required` / `enum` / `pattern` / `minimum` |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `tools.js` | `第02节课/03-练习代码/agent/` | 四个工具的完整定义 |
| `validate.js` | 同上 | 30 行参数校验器，不引第三方包 |
| `check-tools.js` | 同上 | 八组参数的校验结果 |
| `demo-bad.js` | 同上 | 反例：三个字的说明书会怎样 |
| `NOTES.md` | `第02节课/02-笔记/` | 你的记录 |

---

# 第 1 步：把上一节的目录复制过来（10 分钟）

## 1.1 做什么 / 为什么

每节课一个独立目录，互不影响。**第 92 节课的 `agent` 目录整份复制到第 02 节课**，包括 `data/app.db`。

不复制的话，你会为了一个 `data/app.db` 的相对路径折腾半小时——**这种时间不值得花。**

## 1.2 操作

```text
cd /d B:\OPC-Distance_study\每周课程\03-数据与智能\第14周-智能体与工具
xcopy 第01节课\03-练习代码\agent 第02节课\03-练习代码\agent /E /I
cd 第02节课\03-练习代码\agent
node check-db.js
```

**注意 `xcopy` 的两个参数：**

| 参数 | 意思 |
|---|---|
| `/E` | 连空目录一起复制 |
| `/I` | 目标不存在时，当成目录创建（不加会问你"是文件还是目录"） |

## 1.3 屏幕上应该看到什么

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

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Invalid number of parameters` | 目标目录已存在，`xcopy` 参数没写对 | 直接手动复制文件夹，或用 `robocopy 源 目标 /E` |
| `Cannot find module 'dotenv'` | `node_modules` 没复制过来 | 在 `agent` 里重新 `npm install` |
| `no such table` | `data` 目录没复制 | 跑 `node seed.js` 重建 |

---

# 第 2 步：先看反例——三个字的说明书（20 分钟）

## 2.1 做什么 / 为什么

在写正例之前，先制造一次"模型调错"。

这一节没有真模型，所以用一个 `guessArgs()` 手动模拟"模型只能看到 name、description、参数名"时会怎么猜。**这不是假装它是模型，是把模型的推理过程手写成几行 `if`，让你看到信息缺失的后果。**

## 2.2 操作

**建 `demo-bad.js`：**

```javascript
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "data", "app.db"), { readonly: true });

// 反例：三个字段都写了，但都没有信息量。
const BAD_TOOL = {
  type: "function",
  function: {
    name: "query",
    description: "查询",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string" }
      }
    }
  }
};

// 模拟模型：只能看到上面那段 JSON，加上用户的问题。
function guessArgs(tool, question) {
  console.log("模型看到的工具名：" + tool.function.name);
  console.log("模型看到的说明：" + tool.function.description);
  console.log("模型看到的参数：" + Object.keys(tool.function.parameters.properties).join(", "));
  console.log("用户问题：" + question);
  console.log("说明里没写表名，也没写日期怎么存 → 只能猜。");

  return {
    sql: "SELECT * FROM sales WHERE month = 'this month'"
  };
}

const question = "这个月卖了多少？";
console.log("=== 反例 ===");
const args = guessArgs(BAD_TOOL, question);
console.log("模型返回：" + JSON.stringify(args));

try {
  const rows = db.prepare(args.sql).all();
  console.log("执行成功：" + JSON.stringify(rows));
} catch (e) {
  console.log("执行失败：" + e.message);
}
```

## 2.3 屏幕上应该看到什么

```text
> node demo-bad.js
=== 反例 ===
模型看到的工具名：query
模型看到的说明：查询
模型看到的参数：sql
用户问题：这个月卖了多少？
说明里没写表名，也没写日期怎么存 → 只能猜。
模型返回：{"sql":"SELECT * FROM sales WHERE month = 'this month'"}
执行失败：no such table: sales
```

**把 `sales` 改成 `orders` 再跑一次**（手动改 `guessArgs` 里那一行）：

```text
执行失败：no such column: month
```

**两次失败，根因是同一个：说明书里没写"数据库里有什么"。**

| 模型猜的 | 实际情况 | 它为什么会这么猜 |
|---|---|---|
| `sales` 表 | 表叫 `orders` | 卖东西的数据表，英文常叫 sales |
| `month` 列 | 没有这列，只有 `created_at` 文本 | 按月统计，直觉上该有个 month 列 |
| `'this month'` | 得写 `'2026-11'` | 自然语言里"这个月"就是这么说的 |

**注意：模型没有"报错"的概念。它给的是一个语法完全合法的 SQL。** 错误是你的代码执行时才发生的。

**这就是为什么工具说明必须在写代码之前设计。** 你事后补一句"哦表叫 orders"，只能救这一个问题；把表结构写进 `description`，才能救所有问题。

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `no such table: sales` 没出现 | 你是不是提前建了 `sales` 表 | 删掉重来，这个错就是要看你没有这张表 |
| 报 `near "this month": syntax error` | 引号被编辑器换成了中文引号 | 检查 `'this month'` 是英文单引号 |
| 输出里没有"模型看到的..." | 你直接跑了 `agent.js` | 确认文件名是 `demo-bad.js` |

---

# 第 3 步：写第一个正例——`list_tables`（15 分钟）

## 3.1 做什么 / 为什么

从最简单的工具开始：**不需要参数**。

不要因为简单就随便写。这个工具的价值是：**让模型在不知道表结构时，有一个"问一下"的地方**，而不是瞎猜。

## 3.2 description 必须写清的四件事

| 要素 | 写什么 | 不写会怎样 |
|---|---|---|
| 做什么 | 列出所有表名和列定义 | 模型不知道返回什么，可能重复调用 |
| 什么时候用 | 用户问"有哪些表""表结构"时 | 模型在问"多少订单"时也调它，浪费一轮 |
| 返回什么 | `{ok, tables:[{name, columns}]}` | 模型拿到结果不知道怎么读 |
| 不能做什么 | 不需要参数；不返回数据行 | 模型会试着传 `{"table":"orders"}` |

**写成一句人话也可以，但四个要素必须都在。** 模型读的是语义，不是格式。

## 3.3 操作

**新建 `tools.js`：**

```javascript
// 工具的唯一定义处。第 94 节课会把这个数组原样发给模型。
const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_tables",
      description:
        "列出数据库里所有表的名字和每张表的列定义。当用户问“有哪些表”“表结构是什么”“数据库里有什么数据”时调用。" +
        "不需要任何参数。返回 {ok:true, tables:[{name, columns:[...]}]}。" +
        "它只返回结构，不返回任何数据行；不要用它查数量或金额。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  }
];

module.exports = { TOOLS };
```

## 3.4 逐段读

**`type: "function"`**

这是 OpenAI 工具协议里唯一支持的类型。**写在最外层，不是写在 `function` 里面。** 写错位置模型会收不到。

**`name`**

只能用小写字母、数字、下划线。**不要用中文，不要用点号。** 这个名字就是 `dispatch` 里的分支名，也是模型返回 `tool_calls[].function.name` 的值，**两边必须一字不差**。

**`parameters` 是一个 JSON Schema**

| 字段 | 作用 |
|---|---|
| `type: "object"` | 参数整体是一个对象（不是数组、不是字符串） |
| `properties` | 每个参数的名字和类型 |
| `required` | 哪些参数必须给 |
| `additionalProperties: false` | 不许传没定义的参数 |

**`additionalProperties: false` 这一条经常被忘。** 不写的话，模型传 `{"table":"orders"}` 你的校验器也不会拦——因为你说"随便传"。

## 3.5 屏幕上应该看到什么

这一节还跑不出业务结果，先确认文件能加载：

```text
node -e "const {TOOLS}=require('./tools'); console.log(TOOLS.length, TOOLS[0].function.name, JSON.stringify(TOOLS[0].function.parameters))"
```

```text
1 list_tables {"type":"object","properties":{},"required":[],"additionalProperties":false}
```

## 3.6 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `SyntaxError: Unexpected token` | 中文引号 `“”` 当成了字符串边界 | 中文只出现在字符串**内部**，边界必须是 `"` |
| `TOOLS is not defined` | 忘了 `module.exports` | 文件末尾加 `module.exports = { TOOLS };` |
| 输出 `undefined` | 解构写成了 `const TOOLS = require(...)` | 应该是 `const { TOOLS } = require("./tools")` |

---

# 第 4 步：写后三个正例（25 分钟）

## 4.1 做什么 / 为什么

现在写有参数的工具。**每个参数都要有边界**，因为模型会给你三种东西：对的、接近对的、完全不对的。

你不可能在 `description` 里教会模型所有事，所以**能用 schema 卡死的，就不要靠文字**。

| 约束 | 用在哪 | 卡住什么 |
|---|---|---|
| `enum` | 状态值 | 模型传"已支付"这种中文 |
| `pattern` | 订单号 | 模型传 `42` 或 `#SO00042` |
| `minimum` / `maximum` | 行数上限 | 模型传 10000 行 |
| `required` | 必填参数 | 模型干脆不传 |

## 4.2 操作

**把 `tools.js` 改成四个工具（完整替换）：**

```javascript
const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_tables",
      description:
        "列出数据库里所有表的名字和每张表的列定义。当用户问“有哪些表”“表结构是什么”“数据库里有什么数据”时调用。" +
        "不需要任何参数。返回 {ok:true, tables:[{name, columns:[...]}]}。" +
        "它只返回结构，不返回任何数据行；不要用它查数量或金额。",
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
        "对 orders 表执行一条只读 SELECT，返回结果行。当用户问“多少”“总额”“排行”“占比”“平均”“这个月”时调用。" +
        "只能查 orders 一张表，不能修改数据。返回 {ok:true, rows:[...], rowCount, sql}。" +
        "如果只是想知道各状态有多少单，优先用 count_orders，不要写 SQL。",
      parameters: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description:
              "一条 SQLite SELECT 语句，必须以 SELECT 或 WITH 开头，必须以 LIMIT 结尾且不超过 100。" +
              "表结构：orders(id INTEGER, order_no TEXT, customer TEXT, city TEXT, amount REAL, status TEXT, created_at TEXT)。" +
              "status 只有 paid / pending / refunded 三个值；金额列叫 amount，不叫 total_amount 也不叫 price；" +
              "created_at 是 'YYYY-MM-DD HH:MM:SS' 文本，按月过滤要写 substr(created_at,1,7)='2026-11'。" +
              "不要用 MONTH()、YEAR() 这类函数，SQLite 没有。"
          }
        },
        required: ["sql"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "count_orders",
      description:
        "按状态统计订单数量。当用户明确问“已支付/待支付/已退款各多少”“退款多少单”时调用。" +
        "比 query_stats 更安全，能用它就先用它。返回 {ok:true, status, cnt}。" +
        "它只能按状态统计，不能按城市、不能按月份；那些要用 query_stats。",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["paid", "pending", "refunded"],
            description: "订单状态。paid=已支付，pending=待支付，refunded=已退款。必须传英文值，不能传中文，不能传大写。"
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "最多返回多少行，默认 10。这个参数一般不用传。"
          }
        },
        required: ["status"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_order",
      description:
        "按订单号查一笔订单的完整信息。只有当用户给出具体订单号（形如 SO00042）时调用。" +
        "用户说“最近一笔”“最大的订单”“上个月的订单”时不要用这个工具，那些要用 query_stats。" +
        "返回 {ok:true, order:{...}}；订单不存在时返回 {ok:false, error:\"没有这个订单\"}。",
      parameters: {
        type: "object",
        properties: {
          order_no: {
            type: "string",
            pattern: "^SO[0-9]{5}$",
            description: "订单号，SO + 5 位数字，例如 SO00042。不要带空格、不要带 #、不要只传数字部分。"
          }
        },
        required: ["order_no"],
        additionalProperties: false
      }
    }
  }
];

module.exports = { TOOLS };
```

## 4.3 为什么 `query_stats` 的 `description` 那么长

因为它要替代三样东西：

| 本来该谁提供 | 现实 |
|---|---|
| 数据库文档 | 模型看不到你的库 |
| 表结构 | 模型不知道列名 |
| 团队约定（"金额叫 amount"） | 模型没有同事 |

**这段话不是写给人看的注释。** 注释是"给未来维护代码的人"；`description` 是"给这一轮推理的模型"。两者受众不同，写法也不同：

| | 代码注释 | 工具 description |
|---|---|---|
| 读者 | 人 | 模型 |
| 可以省略 | 显而易见的事 | 任何模型猜不到的事 |
| 长度 | 越短越好 | 该长就长，把边界写全 |
| 写错的后果 | 误导同事 | 模型调错工具、编造参数 |

**一句话：注释可以写"查订单"，description 必须写"查 orders 表，列有这些，金额叫 amount"。**

## 4.4 屏幕上应该看到什么

```text
node -e "const {TOOLS}=require('./tools'); TOOLS.forEach(t=>console.log(t.function.name, Object.keys(t.function.parameters.properties).join('|')||'(无参数)', 'required=' + JSON.stringify(t.function.parameters.required)))"
```

```text
list_tables (无参数) required=[]
query_stats sql required=["sql"]
count_orders status|limit required=["status"]
get_order order_no required=["order_no"]
```

**四个工具，三个有必填参数。** 记住这个形状，第 94 节课发出去的 `tools` 就是这个数组。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `pattern` 不生效 | 写成了 `regex` 或 `format` | JSON Schema 里字符串正则是 `pattern` |
| `enum` 里混了中文 | 想"方便模型" | 删掉，中文放 `description` 里解释 |
| `required` 写成对象 | 抄了别的格式 | 它是字符串数组：`["sql"]` |
| 模型仍然传大写 `PAID` | enum 是精确匹配 | 这是对的，校验器会拦；不要放宽 enum 去迁就模型 |

---

# 第 5 步：写一个 30 行的校验器（20 分钟）

## 5.1 做什么 / 为什么

`description` 是"请求"，`schema` 是"规则"，**校验器是"执行规则的保安"**。

模型不保证遵守 schema。它会传字符串形式的数字、会漏参数、会传你没定义的字段。**这些都不能靠"我相信模型"来解决。**

**为什么不用 `ajv`：**

`ajv` 是成熟的 JSON Schema 校验库，功能全。但你只需要四种检查（必填、类型、枚举、正则），30 行就够。多装一个包，就多一个"装不上、版本冲突、没人帮你修"的可能——**这门课的依赖白名单里没有它，就别加。**

## 5.2 操作

**建 `validate.js`：**

```javascript
// 只支持本课程用到的几种约束：required / type / enum / pattern，外加 min/max。
// 返回 { ok: true } 或 { ok: false, error: "人话原因" }

function fail(message) {
  return { ok: false, error: message };
}

function checkOne(key, value, rule) {
  if (rule.type === "string") {
    if (typeof value !== "string") {
      return fail(key + " 必须是字符串，收到的是 " + typeof value);
    }
    if (rule.enum && !rule.enum.includes(value)) {
      return fail(key + " 只能是 " + rule.enum.join(" / ") + "，收到的是 " + JSON.stringify(value));
    }
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
      return fail(key + " 格式不对，要匹配 " + rule.pattern + "，收到的是 " + JSON.stringify(value));
    }
  }

  if (rule.type === "integer") {
    if (!Number.isInteger(value)) {
      return fail(key + " 必须是整数，收到的是 " + JSON.stringify(value));
    }
    if (rule.minimum !== undefined && value < rule.minimum) {
      return fail(key + " 不能小于 " + rule.minimum + "，收到 " + value);
    }
    if (rule.maximum !== undefined && value > rule.maximum) {
      return fail(key + " 不能大于 " + rule.maximum + "，收到 " + value);
    }
  }

  if (rule.type === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return fail(key + " 必须是数字，收到的是 " + JSON.stringify(value));
    }
  }

  if (rule.type === "boolean" && typeof value !== "boolean") {
    return fail(key + " 必须是 true 或 false，收到的是 " + JSON.stringify(value));
  }

  return { ok: true };
}

function validateArgs(schema, args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return fail("参数必须是一个对象，收到的是 " + (Array.isArray(args) ? "数组" : typeof args));
  }

  const props = schema.properties || {};
  const required = schema.required || [];

  for (const key of required) {
    if (!(key in args)) {
      return fail("缺少必填参数 " + key);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!(key in props)) {
        return fail("多余的参数 " + key + "，这个工具只接受 " + (Object.keys(props).join(" / ") || "无参数"));
      }
    }
  }

  for (const key of Object.keys(args)) {
    if (!props[key]) {
      continue;
    }
    const result = checkOne(key, args[key], props[key]);
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

module.exports = { validateArgs };
```

## 5.3 数一下它拦住了什么

| 情况 | 谁拦住的 | 报什么 |
|---|---|---|
| `{}` 传给 `query_stats` | `required` | 缺少必填参数 sql |
| `{"sql": 123}` | `type: "string"` | sql 必须是字符串，收到的是 number |
| `{"status":"已支付"}` | `enum` | status 只能是 paid / pending / refunded |
| `{"order_no":"42"}` | `pattern` | order_no 格式不对 |
| `{"table":"orders"}` 传给 `list_tables` | `additionalProperties` | 多余的参数 table |
| `{"limit": 500}` | `maximum` | limit 不能大于 100 |

**六种，全是我们见过的真实错法。**

## 5.4 屏幕上应该看到什么

先单独测一条：

```text
node -e "const {validateArgs}=require('./validate'); const {TOOLS}=require('./tools'); console.log(validateArgs(TOOLS[1].function.parameters, {}))"
```

```text
{ ok: false, error: '缺少必填参数 sql' }
```

```text
node -e "const {validateArgs}=require('./validate'); const {TOOLS}=require('./tools'); console.log(validateArgs(TOOLS[2].function.parameters, {status:'已支付'}))"
```

```text
{ ok: false, error: 'status 只能是 paid / pending / refunded，收到的是 "已支付"' }
```

## 5.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `validateArgs is not a function` | 导出写成了 `module.exports = validateArgs` | 改成 `{ validateArgs }`，调用处解构 |
| 中文报错是乱码 | cmd 代码页 | `chcp 65001` |
| 传了多余参数却通过了 | `additionalProperties` 没写 `false` | 检查工具定义里有没有这一行 |
| 整数 10.5 通过了 | 用了 `type: "number"` | 要整数就写 `"integer"` |

---

# 第 6 步：跑完八组校验（10 分钟）

## 6.1 做什么 / 为什么

把六种错法加两组正常值一次跑完，**你要看到每一个错法都被拦住，而且报的是人话**。

这一步的意义：第 95 节课模型真的传错参数时，你能一眼认出这是校验器拦的，还是数据库报的。

## 6.2 操作

**建 `check-tools.js`：**

```javascript
const { TOOLS } = require("./tools");
const { validateArgs } = require("./validate");

function findTool(name) {
  return TOOLS.find((t) => t.function.name === name).function;
}

const cases = [
  { label: "list_tables 正常", tool: "list_tables", args: {} },
  { label: "list_tables 多传参数", tool: "list_tables", args: { table: "orders" } },
  { label: "query_stats 缺 sql", tool: "query_stats", args: {} },
  { label: "query_stats sql 是数字", tool: "query_stats", args: { sql: 123 } },
  { label: "count_orders 传中文状态", tool: "count_orders", args: { status: "已支付" } },
  { label: "count_orders limit 超上限", tool: "count_orders", args: { status: "paid", limit: 500 } },
  { label: "get_order 订单号格式错", tool: "get_order", args: { order_no: "42" } },
  { label: "get_order 正常", tool: "get_order", args: { order_no: "SO00042" } }
];

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const tool = findTool(c.tool);
  const result = validateArgs(tool.parameters, c.args);
  const status = result.ok ? "通过" : "不通过：" + result.error;
  console.log(String(i + 1) + ". " + c.label + " → " + status);
}
```

## 6.3 屏幕上应该看到什么

```text
> node check-tools.js
1. list_tables 正常 → 通过
2. list_tables 多传参数 → 不通过：多余的参数 table，这个工具只接受 无参数
3. query_stats 缺 sql → 不通过：缺少必填参数 sql
4. query_stats sql 是数字 → 不通过：sql 必须是字符串，收到的是 number
5. count_orders 传中文状态 → 不通过：status 只能是 paid / pending / refunded，收到的是 "已支付"
6. count_orders limit 超上限 → 不通过：limit 不能大于 100，收到 500
7. get_order 订单号格式错 → 不通过：order_no 格式不对，要匹配 ^SO[0-9]{5}$，收到的是 "42"
8. get_order 正常 → 通过
```

**八组里六组被拦，两组通过。** 这就是你要的保安。

## 6.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第 2 组也通过了 | `list_tables` 少了 `additionalProperties: false` | 补上 |
| 第 6 组也通过了 | `limit` 没写 `maximum`，或写成了 `max` | JSON Schema 是 `maximum` |
| 第 7 组报"必须是字符串" | 你传的是数字 `42` 而不是 `"42"` | 课件里就是字符串，检查引号 |
| `Cannot read properties of undefined (reading 'parameters')` | 工具名拼错 | `findTool` 里加打印 |

---

# 第 7 步：故意犯四个错（15 分钟）

## 错误 1：description 写成散文

**操作：** 把 `query_stats` 的 `description` 改成：

```javascript
description: "这个工具用来查询统计数据，非常实用，可以帮助你快速了解业务情况。"
```

**现象：** 模型（第 94 节课你会亲眼看到）会开始猜列名。常见返回：

```json
{"sql":"SELECT SUM(total_amount) FROM orders WHERE status = '已完成'"}
```

执行结果：

```text
no such column: total_amount
```

**原因：** "快速了解业务情况"这句话对模型没有任何约束力。它不知道表名、列名、状态值。**散文是写给人看的，模型需要的是清单。**

**怎么查：** 把 `description` 里的每一句问一遍："这句话能让模型少猜一次吗？"不能就删掉，换成具体信息。

**改回来。**

## 错误 2：漏写 `required`

**操作：** 删掉 `query_stats` 的 `"required": ["sql"]`。

**现象：** 第 6 步的第 3 组会变成"通过"。然后 `dispatch` 里执行 `db.prepare(undefined)`，你会看到：

```text
TypeError: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
```

如果你在 `dispatch` 里做了 `String(args.sql)`，错误会变成：

```text
SqliteError: near "undefined": syntax error
```

**原因：** 没写 `required`，你的校验器就认为"这个参数可以不传"。

**怎么查：** 报错里出现 `undefined` 且是 SQL 语法错，先看 `required`。

**改回来。**

## 错误 3：`enum` 写成中文

**操作：** 把 `count_orders` 的 `enum` 改成 `["已支付", "待支付", "已退款"]`。

**现象：** 校验通过了，SQL 执行也成功了，但返回 0 行：

```json
{"ok":true,"status":"已支付","cnt":0}
```

模型拿到这个结果，会很自信地回答："这个月没有已支付的订单。"

**这是最危险的一类错：不报错，但答案是错的。**

**原因：** 数据库里存的是 `paid`，你让模型传 `已支付`。`WHERE status = '已支付'` 语法完全合法，只是匹配不到任何行。

**怎么查：** 任何"0 行"的结果，先单独跑一次 `SELECT DISTINCT status FROM orders`。看到 `paid/pending/refunded` 就知道是值对不上。

**改回来。**

## 错误 4：不写表结构，模型编造列名

**操作：** 把 `query_stats` 的 `sql` 参数描述里关于表结构的那两句删掉，只留"一条 SELECT 语句"。

**现象：** 模型会把金额写成 `total`、`price`、`total_amount`，把日期写成 `month`、`date`。每次错法不一样：

```text
no such column: total
no such column: price
no such column: month
```

**原因：** 模型对"订单表"的先验知识来自公开语料，不是你的库。**你的列名叫 `amount`，这件事只有你知道。**

**怎么查：** 报 `no such column` 时，把 `PRAGMA table_info(orders)` 的输出贴进 `description`，重跑。

---

# 第 8 步：写学习笔记（10 分钟）

打开 `第02节课/02-笔记/NOTES.md`，按下面的小标题写。**小标题一个字都不要改。**

```markdown
# 第 93 节课学习笔记

## 一、工具说明书的三个字段

| 字段 | 给谁看 | 写错的后果 |
|---|---|---|
| name | | |
| description | | |
| parameters | | |

## 二、反例：三个字说明书的后果

它猜了哪三样东西：

实际报的错：

## 三、description 要写清的四件事

1.
2.
3.
4.

## 四、两个正例的对照

| | list_tables | query_stats |
|---|---|---|
| 有没有参数 | | |
| 什么时候该调 | | |
| 我把哪条边界写进了 description | | |

## 五、参数边界：required / enum / pattern / additionalProperties

| 约束 | 卡住什么 | 我写在哪个工具上 |
|---|---|---|
| required | | |
| enum | | |
| pattern | | |
| maximum | | |
| additionalProperties | | |

## 六、我写的校验器覆盖了哪些情况

它能拦住的：

它拦不住的（想一个）：

## 七、八组参数校验的真实结果

```text
（把 node check-tools.js 的完整输出贴进来）
```

哪一组最容易被忽略：

## 八、模型为什么会调错

用你自己的话说，不许写"因为模型笨"：

## 九、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| description 写散文 | | |
| 漏 required | | |
| enum 写中文 | | |
| 不写表结构 | | |

## 十、为什么不用 ajv

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `tools.js` 里有四个工具，都能被 `require`
- [ ] 每个工具有 `description`，且写了"什么时候用"
- [ ] `query_stats` 的 `sql` 描述里有完整表结构
- [ ] `validate.js` 能拦住六种错参数
- [ ] `node check-tools.js` 输出 8 行，6 行"不通过"
- [ ] 我做过四个错误实验，看到了 `no such column`
- [ ] 我知道 enum 写错会"不报错但答错"
```

---

# 第 9 步：课后练习

## 练习一：给 `list_tables` 加一个可选参数

加 `schema_only`（布尔，默认 `false`）：为 `true` 时只返回表名，不返回列。

要求：

- `required` 里不能有它；
- `description` 里写清默认值；
- 校验器不用改（它已经支持 `boolean`）。

**思考：** 加了这个参数后，`list_tables` 的 `description` 要不要改？为什么？

## 练习二：写一个"只能用一次"的工具

定义 `get_latest_order`：返回 `created_at` 最新的一笔订单，无参数。

要求 `description` 里明确写：**"用户说'最近一笔''最后一单'时用这个，不要反问订单号"**。然后想：如果不写这句，模型会怎么做？

## 练习三：找出这个 schema 的五个问题

```javascript
{
  name: "search_orders",
  description: "搜索",
  parameters: {
    type: "object",
    properties: {
      keyword: { type: "string" },
      status: { type: "string" },
      limit: { type: "number" }
    }
  }
}
```

提示方向：`type: "function"` 在哪、`required`、`enum`、`maximum`、`additionalProperties`、description 缺什么。

## 练习四：把校验器加一条规则

加 `minLength`（字符串最短长度），用在 `order_no` 上，要求至少 7 个字符。

要求：报错信息是 `order_no 至少 7 个字符，收到 3 个`。

## 练习五：用自己的话讲清

```text
1. 为什么说 description 是"给模型看的说明书"，不是注释？两者受众差在哪？
2. 模型为什么会编造列名？你用什么办法让它不编？
3. enum 写错时，为什么程序不报错？这种错怎么发现？
4. 为什么不装 ajv，自己写 30 行？
5. 如果一个参数"只能是某几个值"，你会用 enum 还是写在 description 里？为什么？
```

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说出 `name` / `description` / `parameters` 各自的作用
- [ ] 我知道 `description` 的读者是模型，不是人
- [ ] 我能说出 description 必须包含的四件事
- [ ] 我知道 schema 是"请求"，校验器才是"保安"
- [ ] 我能解释为什么 enum 写错会得到"0 行"而不是报错

## B. 实操

- [ ] `node -e "require('./tools')"` 不报错
- [ ] 四个工具的名字和参数与课件一致
- [ ] `query_stats` 的 `sql` 描述里有表结构和三个状态值
- [ ] `node check-tools.js` 输出 8 行，其中 6 行"不通过"
- [ ] `get_order` 传 `"42"` 被拦住

## C. 排错

- [ ] 看到 `no such column`，我知道是 description 缺表结构
- [ ] 看到 `缺少必填参数`，我知道是 `required` 或模型漏传
- [ ] 看到 0 行，我知道先查 `SELECT DISTINCT status`
- [ ] 看到 `多余的参数`，我知道是 `additionalProperties: false` 在起作用

## D. 笔记

- [ ] `NOTES.md` 十二个小标题都填了
- [ ] 贴了 `check-tools.js` 的完整输出
- [ ] 四个错误都写了"现象 / 原因 / 怎么查"
- [ ] "为什么不用 ajv"写了自己的判断

## 本节课要能说出口的一句话

> **工具说明不是写给人看的注释，是模型唯一的操作手册——你不写清楚，它就只能猜。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `TOOLS.find(...) is not a function` | `TOOLS` 是不是数组 | 检查 `module.exports` 和 `require` 的解构 |
| 校验器永远通过 | 是不是忘了调用 `validateArgs` | 在 `check-tools.js` 里打印 `result` |
| `pattern` 没生效 | 字段名写成了 `regex` | 改成 `pattern` |
| enum 传大写也通过 | 你手动 `toLowerCase()` 了 | 删掉，让校验器拦 |
| 模型总调错工具 | 两个工具的 description 太像 | 在"什么时候用"里写互斥条件 |
| `no such column` | 表结构没写进 description | 把 `PRAGMA table_info` 贴进去 |
| 中文报错乱码 | cmd 代码页 | `chcp 65001` |
| `additionalProperties` 不生效 | 写成了字符串 `"false"` | 要布尔值 `false` |
