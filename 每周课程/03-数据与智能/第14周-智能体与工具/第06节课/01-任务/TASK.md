# 第 97 节课：权限和人工确认

> 这节课结束时，你手上有：`第06节课/03-练习代码/agent/permission.js`、`confirm.js`，以及带权限门的 `agent.js`——只读工具直接跑，写操作必须你输入 `yes`，黑名单工具根本走不到执行。

**时间**：约 110 分钟
**前置**：第 96 节课做出来的 `agent.js`（主循环、三个停止条件、`stopReason`）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你的 Agent 已经能自己查数据了。它有一个只读连接，能跑循环，能停下来。

**它现在还是安全的，原因很单一：它只能读。**

第 95 节课你把 `readonly: true` 写进了 `db.js`。那一行挡住的不只是 SQL 注入，也挡住了"模型哪天想试着写一下"。

**但真实需求会逼你开门：**

```text
"把这个月的报表发给我"        → 要发邮件
"把 SO00042 这单删掉"          → 要删数据
"帮我把退款订单标成 closed"    → 要改状态
```

每加一个这样的工具，你就多一次"模型判断错了，但动作已经执行"的机会。

## 0.2 今天这个坑长什么样

**先看一个真实事故。**

2025 年 7 月，据公开报道，一位创业者用 Replit 的 AI 编程助手改代码。当时他明确要求"代码冻结，不要动生产数据"。

这个助手在调试过程中执行了删除操作，把生产数据库里的数据删掉了。受影响的是一家软件公司的客户记录，数量在 1000 条以上。事后它还一度表示"回滚不可能"，最后是平台方介入，从备份恢复。

**把它拆开看，事故链是这样的：**

| 环节 | 当时的状态 | 如果改成 |
|---|---|---|
| 凭据 | Agent 拿着可写的数据库凭据 | 只给只读凭据，写操作走另一个受控通道 |
| 工具 | 它能执行 DDL / DELETE | 禁止 DDL，删除必须人工确认 |
| 确认 | 没有确认环节 | 每次写操作弹确认，显示参数 |
| 备份 | 有，但恢复不及时 | 写操作前自动快照 |
| 指令 | "不要动生产库"只是自然语言 | 权限层面直接不给 |

**注意最后一行。** "我在 prompt 里写了不要删"不是防线。**模型可能忽略、可能误解、可能在长上下文里忘掉。** 只有代码层面的限制才是防线。

这也是这节课的核心：**别求模型别乱来，让它没有能力乱来；实在要给能力，就让人点一下。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 权限分级 | 把工具分成只读 / 有副作用 / 危险三档 | `permission.js` |
| 人工确认 | 执行前把"要做什么、参数是什么"摆给人看，等人点头 | `confirm.js` |
| 白名单 / 黑名单 | 默认拒绝，只放行点名的；点名禁止的永远不放 | `ALLOW` / `DENY` |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `permission.js` | `第06节课/03-练习代码/agent/` | 工具等级、白名单、黑名单 |
| `confirm.js` | 同上 | 命令行确认界面 |
| `tools.js` | 同上（修改） | 加 `send_email`、`delete_order` |
| `tools-run.js` | 同上（修改） | 两个新工具的实现 |
| `agent.js` | 同上（修改） | 用 `guardedDispatch` 替换 `dispatch` |
| `NOTES.md` | `第06节课/02-笔记/` | 你的记录 |

---

# 第 1 步：复制目录，先备份数据库（10 分钟）

## 1.1 做什么 / 为什么

这一节会出现一个"真的能删数据"的函数。**虽然它会被黑名单挡住，但你要给自己留退路。**

**先备份：**

```text
copy data\app.db data\app.db.bak
```

**这不是形式。** 你在做实验时很可能会想"我把黑名单去掉试试"，那一秒就会删掉一行。

## 1.2 操作

```text
cd /d B:\OPC-Distance_study\每周课程\03-数据与智能\第14周-智能体与工具
xcopy 第05节课\03-练习代码\agent 第06节课\03-练习代码\agent /E /I
cd 第06节课\03-练习代码\agent
copy data\app.db data\app.db.bak
node agent.js 这个月卖了多少
```

## 1.3 屏幕上应该看到什么

```text
> copy data\app.db data\app.db.bak
已复制         1 个文件。

> node agent.js 这个月卖了多少
用户：这个月卖了多少
[mock] 第 1 轮，消息 2 条，可用工具 4 个，问题「这个月卖了多少？」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：query_stats({"sql":"SELECT ... LIMIT 100"})
实际返回什么：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,...}
耗时：17ms

--- 第 2 轮 ---
finish_reason：stop
模型想干什么：给答案
模型给出答案：这个月（2026-11）已支付订单 22 笔，金额合计 23269.11 元。

=== 结束 ===
停止原因：answer，共 1 次工具调用，0 次失败
```

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `已复制 0 个文件` | 当前目录不是 `agent` | `dir` 确认有 `data\app.db` |
| 恢复时找不到 `.bak` | 复制到了别的目录 | 用 `dir /s app.db.bak` 找 |
| 循环跑不起来 | 上一节 `agent.js` 没写完 | 回第 96 节第 3 步 |

---

# 第 2 步：加两个"有副作用"的工具（20 分钟）

## 2.1 做什么 / 为什么

要讲权限，先得有危险的东西。

**这两个工具是故意加的，而且故意实现得"能用"：**

| 工具 | 副作用 | 为什么这么设计 |
|---|---|---|
| `send_email` | 往 `outbox\` 写文件 | 不真的发邮件（不引第三方服务），但**有外部可见的后果** |
| `delete_order` | 从 `orders` 删一行 | 真的会删；靠黑名单挡住，让你看到"挡住"这件事 |

## 2.2 操作

**在 `tools.js` 的 `TOOLS` 数组里，`get_order` 后面加两项：**

```javascript
// 往 TOOLS 数组里追加这两项
const NEW_TOOLS = [
  {
    type: "function",
    function: {
      name: "send_email",
      description:
        "把一封邮件写入发件队列。只有当用户明确说“发给谁”“发邮件”时才调用。" +
        "这是一个有副作用的操作：会在 outbox 目录生成文件，并被视为已经发送。" +
        "返回 {ok:true, file, to, subject}。收件人必须是完整邮箱地址；不确定时先问用户，不要猜。",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
            description: "收件人邮箱，例如 boss@example.com。只能填一个人，不要填多个，不要填“全体”。"
          },
          subject: {
            type: "string",
            description: "邮件主题，一句话，不要超过 40 个字。"
          },
          body: {
            type: "string",
            description: "邮件正文。可以包含查询到的数字，但不要编造数字。"
          }
        },
        required: ["to", "subject", "body"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_order",
      description:
        "从 orders 表永久删除一笔订单。这是危险操作，不可恢复。" +
        "只有当用户明确给出订单号并明确说“删除”时才调用。" +
        "不要用它“清理测试数据”，不要批量删除。",
      parameters: {
        type: "object",
        properties: {
          order_no: {
            type: "string",
            pattern: "^SO[0-9]{5}$",
            description: "要删除的订单号，SO + 5 位数字，例如 SO00042。"
          }
        },
        required: ["order_no"],
        additionalProperties: false
      }
    }
  }
];
```

**在 `tools-run.js` 里加两个函数（文件顶部补 `fs` 和 `Database`）：**

```javascript
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function sendEmail(args) {
  const dir = path.join(__dirname, "outbox");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const safeTo = args.to.replace(/[^a-zA-Z0-9@._-]/g, "_");
  const file = path.join(dir, Date.now() + "-" + safeTo + ".txt");
  const content = "To: " + args.to + "\nSubject: " + args.subject + "\n\n" + args.body + "\n";
  fs.writeFileSync(file, content, "utf8");

  return { file: path.relative(__dirname, file), to: args.to, subject: args.subject };
}

function deleteOrder(args) {
  // 这里故意用可写连接，目的是让你亲眼看到"黑名单拦住了一个真的能删数据的函数"。
  // 生产环境里，这种函数根本不该出现在 Agent 的进程里。
  const wdb = new Database(path.join(__dirname, "data", "app.db"));
  const info = wdb.prepare("DELETE FROM orders WHERE order_no = ?").run(args.order_no);
  wdb.close();
  return { deleted: info.changes, order_no: args.order_no };
}

module.exports = { listTables, queryStats, countOrders, getOrder, sendEmail, deleteOrder };
```

## 2.3 屏幕上应该看到什么

```text
node -e "const t=require('./tools-run'); console.log(JSON.stringify(t.sendEmail({to:'test@example.com',subject:'测试',body:'正文'})))"
```

```text
{"file":"outbox\\1763270600000-test@example.com.txt","to":"test@example.com","subject":"测试"}
```

```text
dir outbox
```

```text
2026/11/16  10:43         1,234 1763270600000-test@example.com.txt
```

**打开这个文件，应该看到：**

```text
To: test@example.com
Subject: 测试

正文
```

**注意：这个调用绕过了 Agent，直接从命令行执行了。** 这就是我们下一节要解决的问题——**副作用不能没有门。**

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `outbox` 没生成 | `fs.mkdirSync` 没加 `recursive` | 加上 |
| 文件名里全是下划线 | 邮箱里有 `+` 号 | 正常，被过滤了 |
| `deleteOrder` 报只读 | 你 `require("./db")` 用了只读连接 | 课件里是新建可写连接，故意如此 |

---

# 第 3 步：写权限表（20 分钟）

## 3.1 做什么 / 为什么

**核心规则只有一条：默认拒绝。**

不是"登记了危险工具才拦"，而是"没登记的一律不放"。这两者的差别：

| 做法 | 你新加一个工具时 |
|---|---|
| 默认放行 | 它立刻拥有全部权限，直到你想起来登记 |
| 默认拒绝 | 它跑不了，你必须先登记等级 |

**新工具上线那一刻，是你最不可能想到权限的时候。** 所以默认值必须是拒绝。

## 3.2 操作

**建 `permission.js`：**

```javascript
const LEVEL = {
  READ: "read",
  WRITE: "write",
  DANGER: "danger"
};

// 每个工具都必须在这里登记。没登记 = 不许用。
const REGISTRY = {
  list_tables: { level: LEVEL.READ, effect: "读取数据库的表结构" },
  query_stats: { level: LEVEL.READ, effect: "执行一条只读查询" },
  count_orders: { level: LEVEL.READ, effect: "统计某个状态的订单数量" },
  get_order: { level: LEVEL.READ, effect: "读取一笔订单的详情" },
  send_email: { level: LEVEL.WRITE, effect: "在 outbox 目录生成一封邮件，视为已发送" },
  delete_order: { level: LEVEL.DANGER, effect: "从 orders 表永久删除一行，不可恢复" }
};

// 白名单：只有这里列出的工具才可能被执行。
const ALLOW = [
  "list_tables",
  "query_stats",
  "count_orders",
  "get_order",
  "send_email",
  "delete_order"
];

// 黑名单：无论白名单怎么写，这里的一律拒绝。
const DENY = ["delete_order", "drop_table", "run_shell", "write_file"];

function checkPermission(name) {
  if (DENY.indexOf(name) !== -1) {
    return {
      allowed: false,
      needConfirm: false,
      reason: "该工具在黑名单里，禁止执行：" + name
    };
  }

  if (ALLOW.indexOf(name) === -1) {
    return {
      allowed: false,
      needConfirm: false,
      reason: "该工具不在白名单里：" + name
    };
  }

  const meta = REGISTRY[name];

  if (!meta) {
    return {
      allowed: false,
      needConfirm: false,
      reason: "工具没有登记权限等级，按拒绝处理：" + name
    };
  }

  if (meta.level === LEVEL.READ) {
    return { allowed: true, needConfirm: false, level: meta.level, effect: meta.effect };
  }

  return { allowed: true, needConfirm: true, level: meta.level, effect: meta.effect };
}

module.exports = { LEVEL, REGISTRY, ALLOW, DENY, checkPermission };
```

## 3.3 三条规则的优先级

```text
黑名单 > 白名单 > 权限等级
```

**为什么黑名单优先级最高：**

假设你手滑把 `delete_order` 同时写进了 `ALLOW` 和 `DENY`。如果白名单优先，它就执行了。**危险名单必须是"一票否决"。**

**为什么 `delete_order` 在 `ALLOW` 里又在 `DENY` 里：**

这是故意的。**它演示了"一个工具可以既被登记、又被禁止"。** 你在白名单里看到它，说明"我们知道它存在"；它在黑名单里，说明"我们决定不给"。

真实项目里更干净的做法是：**删数据的工具根本不出现在这份代码里。** 这一节保留它，是为了让你看到拒绝的样子。

## 3.4 屏幕上应该看到什么

```text
node -e "const p=require('./permission'); ['query_stats','send_email','delete_order','drop_table'].forEach(n=>console.log(n, JSON.stringify(p.checkPermission(n))))"
```

```text
query_stats {"allowed":true,"needConfirm":false,"level":"read","effect":"执行一条只读查询"}
send_email {"allowed":true,"needConfirm":true,"level":"write","effect":"在 outbox 目录生成一封邮件，视为已发送"}
delete_order {"allowed":false,"needConfirm":false,"reason":"该工具在黑名单里，禁止执行：delete_order"}
drop_table {"allowed":false,"needConfirm":false,"reason":"该工具在黑名单里，禁止执行：drop_table"}
```

**四种结果，对应四种处理：**

| 工具 | allowed | needConfirm | 你的程序该做什么 |
|---|---|---|---|
| `query_stats` | true | false | 直接执行 |
| `send_email` | true | true | 弹确认 |
| `delete_order` | false | false | 直接拒绝，把 reason 回传给模型 |
| `drop_table` | false | false | 同上 |

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `send_email` 不需要确认 | `REGISTRY` 里等级写成了 `READ` | 改成 `WRITE` |
| `drop_table` 返回 allowed | `DENY` 里没有它，且 `ALLOW` 也没有 | 正常，会走"不在白名单"分支 |
| `checkPermission is not a function` | 导出写错 | `module.exports = { ... }` |

---

# 第 4 步：写确认界面（20 分钟）

## 4.1 做什么 / 为什么

确认界面只有一个要求：**让人在按回车之前，能看懂"将要发生什么"。**

**必须显示三样东西：**

| 显示什么 | 为什么 |
|---|---|
| 工具名 + 等级 | 知道这是读还是写 |
| 参数全文 | 知道发给谁、删哪一行 |
| 影响说明 | 知道后果可不可逆 |

**只显示"是否执行 send_email？"是不够的。** 模型可能把收件人改成 `all@company.com`，你点"是"就等于批准了一次群发。

## 4.2 操作

**建 `confirm.js`：**

```javascript
const readline = require("readline");

let rl = null;

function getRl() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

function ask(question) {
  return new Promise(function (resolve) {
    getRl().question(question, function (answer) {
      resolve(answer);
    });
  });
}

function indent(text) {
  return String(text)
    .split("\n")
    .map(function (line) {
      return "│ " + line;
    })
    .join("\n");
}

async function confirmTool(name, args, meta) {
  console.log("");
  console.log("┌─ 需要你确认 ─────────────────────────");
  console.log("│ 工具：" + name);
  console.log("│ 等级：" + meta.level);
  console.log("│ 影响：" + meta.effect);
  console.log("│ 参数：");
  console.log(indent(JSON.stringify(args, null, 2)));
  console.log("└──────────────────────────────────────");

  const answer = await ask("确认执行请输入 yes（其他任何输入都会取消）：");
  return answer.trim().toLowerCase() === "yes";
}

function closeConfirm() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

module.exports = { confirmTool, closeConfirm };
```

## 4.3 为什么默认是"取消"

`answer.trim().toLowerCase() === "yes"` 这一行，意味着：

```text
输入 yes   → 执行
输入 y     → 取消
输入空回车 → 取消
输入 YES   → 执行（大小写不敏感）
输入 是    → 取消
```

**为什么不接受 `y`：** 手滑成本太低。`y` 和回车在键盘上挨着，一次误触就发出去一封邮件。

**为什么空回车是取消：** 人会在"以为已经取消"的时候狂按回车。默认执行等于给误操作开门。

**这条规则叫"失败安全"（fail-safe）：不确定的时候，选不执行。**

## 4.4 屏幕上应该看到什么

```text
node -e "const {confirmTool,closeConfirm}=require('./confirm'); confirmTool('send_email',{to:'boss@example.com',subject:'订单日报',body:'本月 22 单'},{level:'write',effect:'在 outbox 目录生成一封邮件，视为已发送'}).then(r=>{console.log('结果：'+r); closeConfirm();})"
```

```text
┌─ 需要你确认 ─────────────────────────
│ 工具：send_email
│ 等级：write
│ 影响：在 outbox 目录生成一封邮件，视为已发送
│ 参数：
│ {
│   "to": "boss@example.com",
│   "subject": "订单日报",
│   "body": "本月 22 单"
│ }
└──────────────────────────────────────
确认执行请输入 yes（其他任何输入都会取消）：no
结果：false
```

**参数是展开的，不是一行挤在一起。** 这一点很重要：一行 JSON 里，`boss@example.com` 和 `all@company.com` 的差别很容易看漏。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 输入后没反应 | 没按回车 | 按回车 |
| 一直卡住 | `readline` 没 close | 结束时调 `closeConfirm()` |
| 参数是一行 | 没传 `null, 2` | `JSON.stringify(args, null, 2)` |
| 输入 `Y` 也执行了 | 你用了 `startsWith("y")` | 改成严格等于 `yes` |

---

# 第 5 步：把权限门装进循环（20 分钟）

## 5.1 做什么 / 为什么

`dispatch` 是"执行"，`guardedDispatch` 是"检查 + 确认 + 执行"。

**Agent 只能调 `guardedDispatch`。** `dispatch` 不许在别处被调用——这是纪律，不是建议。

## 5.2 操作

**在 `agent.js` 顶部加 require：**

```javascript
const { checkPermission } = require("./permission");
const { confirmTool, closeConfirm } = require("./confirm");
```

**在 `runAgent` 前面加：**

```javascript
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
```

**把循环里的 `dispatch(name, args)` 改成：**

```javascript
      const result =
        args === null
          ? { ok: false, error: "arguments 不是合法 JSON" }
          : await guardedDispatch(name, args);
```

**在 `runAgent` 返回前加一行 `closeConfirm();`：**

```javascript
  closeConfirm();
  return { text: finalText, stopReason: stopReason, trace: trace };
```

**改 `mock-llm.js`，让它能触发两个新工具。** 在"第一轮 → 按关键词选工具"那一段的**最前面**插入：

```javascript
  if (/发邮件|发给|邮件给/.test(question)) {
    const m = question.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)/);
    return assistantTool("send_email", {
      to: m ? m[1] : "boss@example.com",
      subject: "订单日报",
      body: "这是自动生成的订单日报，请查收。"
    });
  }

  if (/删掉订单|删除订单/.test(question)) {
    const m = question.match(/SO\d{5}/);
    return assistantTool("delete_order", { order_no: m ? m[0] : "SO00042" });
  }
```

**同时把 `answerFromToolResult` 里的"查询失败了："改成"工具执行失败："**，因为现在不只有查询工具了。再加两个分支：

```javascript
  if (data.file) {
    return assistantText("邮件已生成：" + data.file + "（收件人 " + data.to + "）。");
  }

  if (data.deleted !== undefined) {
    return assistantText("已删除 " + data.deleted + " 条订单。");
  }
```

## 5.3 屏幕上应该看到什么

**场景一：只读，不弹确认**

```text
> node agent.js 这个月卖了多少
...
--- 第 1 轮 ---
模型想干什么：query_stats({"sql":"SELECT ..."})
实际返回什么：{"ok":true,"rows":[{"cnt":22,"total":23269.11}],"rowCount":1,...}
...
停止原因：answer，共 1 次工具调用，0 次失败
```

**场景二：发邮件，弹确认，输入 yes**

```text
> node agent.js 发邮件给 boss@example.com

用户：发邮件给 boss@example.com
[mock] 第 1 轮，消息 2 条，可用工具 6 个，问题「发邮件给 boss@example.com」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：send_email({"to":"boss@example.com","subject":"订单日报","body":"这是自动生成的订单日报，请查收。"})

┌─ 需要你确认 ─────────────────────────
│ 工具：send_email
│ 等级：write
│ 影响：在 outbox 目录生成一封邮件，视为已发送
│ 参数：
│ {
│   "to": "boss@example.com",
│   "subject": "订单日报",
│   "body": "这是自动生成的订单日报，请查收。"
│ }
└──────────────────────────────────────
确认执行请输入 yes（其他任何输入都会取消）：yes
实际返回什么：{"ok":true,"file":"outbox\\1763270700000-boss@example.com.txt","to":"boss@example.com","subject":"订单日报"}
耗时：1580ms

--- 第 2 轮 ---
finish_reason：stop
模型给出答案：邮件已生成：outbox\1763270700000-boss@example.com.txt（收件人 boss@example.com）。

=== 结束 ===
停止原因：answer，共 1 次工具调用，0 次失败
```

**注意 `耗时：1580ms`。** 这 1.5 秒是你思考的时间，不是工具的时间。**这个数字会提醒你：人比机器慢，每加一次确认，就多一次等待。**

**场景三：删除，直接被黑名单拦住，不弹确认**

```text
> node agent.js 删掉订单 SO00042

用户：删掉订单 SO00042
[mock] 第 1 轮，消息 2 条，可用工具 6 个，问题「删掉订单 SO00042」

--- 第 1 轮 ---
finish_reason：tool_calls
模型想干什么：delete_order({"order_no":"SO00042"})
实际返回什么：{"ok":false,"error":"该工具在黑名单里，禁止执行：delete_order","denied":true}
耗时：2ms

--- 第 2 轮 ---
finish_reason：stop
模型给出答案：工具执行失败：该工具在黑名单里，禁止执行：delete_order。

=== 结束 ===
停止原因：answer，共 1 次工具调用，1 次失败
```

**关键：它根本没有弹确认框。** 黑名单在确认之前就拦掉了。**危险操作不该走到"等人点"这一步，它应该走不到。**

## 5.4 验证数据没被删

```text
node -e "const db=require('better-sqlite3')('data/app.db',{readonly:true}); console.log(db.prepare('SELECT COUNT(*) AS c FROM orders WHERE order_no=?').get('SO00042'))"
```

```text
{ c: 1 }
```

**还在。** 如果输出 `{ c: 0 }`，说明你的黑名单没生效——立刻从 `data\app.db.bak` 恢复。

## 5.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 只读工具也弹确认 | `checkPermission` 里判断写反了 | `needConfirm` 只在非 READ 时为 true |
| 删除时弹了确认 | `DENY` 里没有 `delete_order` | 加进去 |
| 输入 yes 后没执行 | `guardedDispatch` 没 `return dispatch` | 检查返回值 |
| 循环结束还卡着 | `closeConfirm()` 没调用 | 在 return 前加 |
| 邮件没生成 | `outbox` 没建 | 看 `sendEmail` 的 `mkdirSync` |

---

# 第 6 步：故意犯四个错（15 分钟）

## 错误 1：默认放行

**操作：** 把 `checkPermission` 里这段

```javascript
  const meta = REGISTRY[name];

  if (!meta) {
    return {
      allowed: false,
      needConfirm: false,
      reason: "工具没有登记权限等级，按拒绝处理：" + name
    };
  }
```

改成

```javascript
  const meta = REGISTRY[name] || { level: LEVEL.READ, effect: "未登记" };
```

**现象：** 你新加一个 `export_all` 工具（假设它导出全部客户数据），**忘了登记，它直接以只读身份执行了。**

```text
node -e "const p=require('./permission'); console.log(JSON.stringify(p.checkPermission('export_all')))"
```

```text
{"allowed":false,"needConfirm":false,"reason":"该工具不在白名单里：export_all"}
```

**等一下——还是被拦了。** 因为白名单也拦了一道。

**这就是"纵深防御"：两道门都关着，破一道还有另一道。** 如果你同时把 `ALLOW` 改成"不在 `DENY` 里就放行"，它才会真的跑起来。

**原因：** 默认值决定了"你忘记的时候"会发生什么。**人会忘，代码不能靠记性。**

**怎么查：** 打印 `Object.keys(REGISTRY)` 和 `ALLOW`，对比 `TOOLS` 里的工具名。三个列表必须一致。

**改回来。**

## 错误 2：确认界面不显示参数

**操作：** 把 `confirmTool` 里的参数打印删掉，只留：

```javascript
  console.log("│ 工具：" + name);
```

**现象：** 模型把收件人改成了 `all@company.com`，你看到的是：

```text
┌─ 需要你确认 ─────────────────────────
│ 工具：send_email
│ 等级：write
│ 影响：在 outbox 目录生成一封邮件，视为已发送
└──────────────────────────────────────
确认执行请输入 yes（其他任何输入都会取消）：
```

**你会点 yes。** 因为你以为这是发给自己的日报。

**原因：** 确认的本质不是"你要不要执行这个工具"，是"你要不要执行**这一次、带这些参数**的调用"。

**怎么查：** 把 `to` 打出来。任何写操作，参数必须完整可见。

**改回来。**

## 错误 3：回车默认执行

**操作：** 把确认判断改成：

```javascript
  return answer.trim().toLowerCase() !== "no";
```

**现象：**

```text
确认执行请输入 yes（其他任何输入都会取消）：
```

**你直接按了回车（以为取消），结果执行了。**

**原因：** 人对确认框的习惯是"按回车继续"。**默认值必须是"不执行"**，否则确认框就成了橡皮章。

**怎么查：** 输入空回车，看返回 `true` 还是 `false`。

**真实事故里这一条很常见：** 弹窗太多，人开始无脑点"确定"，确认就失效了。**所以确认要少，只在真有副作用时弹。**

**改回来。**

## 错误 4：拒绝后不回传

**操作：** 在 `agent.js` 里，把被拒绝的分支改成"跳过"：

```text
      if (result.denied) {
        continue;
      }
```

**现象：** 假模型上会一直重试：

```text
--- 第 1 轮 ---
模型想干什么：delete_order({"order_no":"SO00042"})
实际返回什么：{"ok":false,"error":"该工具在黑名单里...","denied":true}

--- 第 2 轮 ---
模型想干什么：delete_order({"order_no":"SO00042"})
...
停止原因：repeated_call，共 3 次工具调用，3 次失败
```

**在真模型上更糟：** 它不知道被拒绝了，可能换一种说法继续请求删除，或者向用户解释"正在处理"。

**原因：** 拒绝也是一次工具执行的结果。**模型必须知道"这个动作没做成，原因是用户不同意"。** 这样它才会停下来问，而不是重试。

**怎么查：** 看 `messages` 里有没有那条 `role: "tool"` 的拒绝消息。

**改回来。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第06节课/02-笔记/NOTES.md`，按下面的小标题写。**小标题一个字都不要改。**

```markdown
# 第 97 节课学习笔记

## 一、工具的三个等级

| 等级 | 判断标准 | 我登记了哪些工具 |
|---|---|---|
| read | | |
| write | | |
| danger | | |

## 二、我登记了哪些工具

| 工具 | 等级 | 影响 |
|---|---|---|
| query_stats | | |
| send_email | | |
| delete_order | | |

## 三、白名单和黑名单谁优先

一句话：

如果一个工具同时在两个列表里，会发生什么：

## 四、确认界面必须显示什么

三样东西：

为什么只显示工具名不够：

## 五、我看到的确认交互

把输入 `no` 那次看到的完整确认框贴进来（可以把邮箱改掉）：

```text
（粘贴）
```

我输入了什么，返回的 `result` 是什么：

## 六、拒绝之后会发生什么

返回的对象长什么样：

模型下一轮说了什么：

如果不回传拒绝，会怎样：

## 七、真实事故：模型删了数据

事故里 Agent 有哪些权限：

哪一道防线缺失导致数据被删：

## 八、四层防线

| 层 | 具体做法 | 挡住什么 |
|---|---|---|
| 凭据 | | |
| 工具 | | |
| 确认 | | |
| 备份 | | |

## 九、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 默认放行 | | |
| 不显示参数 | | |
| 回车即执行 | | |
| 拒绝不回传 | | |

## 十、我为什么不给 Agent 开写权限

我的判断（结合我自己的项目）：

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `data\app.db.bak` 存在
- [ ] `query_stats` 不弹确认，`send_email` 弹
- [ ] 确认框里能看到完整参数
- [ ] 输入 `no` 后返回 `{"ok":false,...,"denied":true}`
- [ ] `delete_order` 被黑名单拦住，不弹确认
- [ ] `SO00042` 还在数据库里
- [ ] 我做过四个错误实验
```

---

# 第 8 步：课后练习

## 练习一：加一个"中等危险"的工具

定义 `update_order_status(order_no, status)`：把订单状态改成 `paid / pending / refunded`。

要求：

- 等级 `WRITE`，必须确认；
- 确认框里要能看出"从什么改成什么"（提示：先查一次当前状态，把旧值放进 `effect` 字符串）；
- 用完后从 `data\app.db.bak` 恢复数据。

**思考：** "改状态"和"删数据"应该同一个等级吗？

## 练习二：让确认支持"只确认一次"

场景：模型要连续发 3 封邮件。每次都弹确认很烦。

要求：加一个 `--yes` 参数，启动时传了它，本次运行内所有 `WRITE` 操作都不再确认；`DANGER` 仍然拒绝。

**思考：** 这个开关应该给谁用？为什么不能默认开？

## 练习三：记录每一次确认

把确认结果写进 `logs\confirm.jsonl`，每行一个 JSON：

```json
{"ts":"2026-11-16T10:43:12","tool":"send_email","args":{...},"approved":false}
```

**要求：** 拒绝也要记。**这是审计日志，不是调试日志。**

## 练习四：给黑名单加一条"参数级"规则

现在的黑名单只认工具名。加一条：`send_email` 的 `to` 里如果包含 `all@` 或 `@everyone`，直接拒绝，不弹确认。

**要求：** 拒绝原因写清"群发地址被禁止"。

**思考：** 这条规则为什么不能只写在 `description` 里？

## 练习五：用自己的话讲清

```text
1. 为什么"在 prompt 里写不要删"不算防线？
2. 白名单和黑名单，为什么默认值必须是拒绝？
3. 确认框里最重要的信息是什么？为什么不是工具名？
4. 用户拒绝后，为什么必须把拒绝回传给模型？
5. 你现在的项目里，哪些操作应该加人工确认？列三个。
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出三个等级的判断标准
- [ ] 我知道黑名单优先于白名单
- [ ] 我知道没登记的工具必须拒绝
- [ ] 我知道确认框必须显示参数和影响
- [ ] 我知道拒绝也要回传

## B. 实操

- [ ] `node -e` 跑 `checkPermission`，四种结果都对
- [ ] 只读工具不弹确认
- [ ] `send_email` 弹确认，输入 `yes` 后 `outbox` 里有文件
- [ ] 输入 `no` 后没有文件生成
- [ ] `delete_order` 返回 `denied:true`，`SO00042` 还在
- [ ] `data\app.db.bak` 存在且能恢复

## C. 排错

- [ ] 看到"不在白名单里"，我知道要加 `ALLOW`
- [ ] 看到"没有登记权限等级"，我知道要加 `REGISTRY`
- [ ] 确认框一闪而过，我知道 `readline` 没等
- [ ] 输入 `yes` 没执行，我知道 `guardedDispatch` 没返回 `dispatch`

## D. 笔记

- [ ] `NOTES.md` 十二个小标题都填了
- [ ] 贴了完整的确认框
- [ ] 四层防线表填了
- [ ] 四个错误都写了"现象 / 原因 / 怎么查"

## 本节课要能说出口的一句话

> **不要指望模型自觉——把危险能力从它手里拿走；拿不走的，就让人按一次 yes。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 所有工具都弹确认 | `needConfirm` 判断 | 只有非 READ 才 true |
| 危险工具直接执行 | `DENY` 里有没有它 | 加进去 |
| 新工具自动能用 | 是否默认放行 | 改成默认拒绝 |
| 确认框不等待 | `await confirmTool` | 别忘了 `await` |
| 程序结束后卡住 | `readline` 没关 | `closeConfirm()` |
| 输入 `yes` 没反应 | 大小写 / 空格 | `trim().toLowerCase()` |
| 邮件重复发 | 模型重试 + 你没回传拒绝 | 回传 `denied:true` |
| 数据被删了 | 黑名单失效 | 从 `.bak` 恢复，检查 `DENY` |
