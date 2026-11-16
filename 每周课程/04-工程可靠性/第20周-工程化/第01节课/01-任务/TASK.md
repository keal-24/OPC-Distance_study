# 第 134 节课：按功能分目录

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天只做一件事：**把 `server.js` 拆开，拆完之后 `npm start` 照样能跑。**
> 拆的过程中你会亲手把系统搞坏两次 —— 那是正常的，也是今天最值钱的部分。

**建议用时**：120 分钟
**你需要先完成**：第 133 节的 `pipeline.js`（能跑通七个故障）
**今天要装**：什么都不用装

---

# 第 0 步：先看清你要拆的是什么（15 分钟）

## 0.1 打开你现在的 `server.js`，数三个数

```bash
cd 你的项目目录
wc -l server.js
grep -n "^app\.\(get\|post\|put\|delete\)" server.js | wc -l
grep -c "function \|=> {" server.js
```

**把三个数字写下来：**

```text
行数：____
路由数：____
函数数：____
```

**如果是这套量级（1000+ 行、10+ 路由），今天这一节值 4 小时。**

如果你的 `server.js` 只有 300 行，**今天照样要做** —— 因为往后每周都要加东西，越晚拆越贵。

## 0.2 现在试着做一件小事，感受一下痛

**需求：把"工单分类的类别列表"从 6 个改成 8 个（加 `complaint` 和 `warranty`）。**

> **你的项目里不一定有"工单分类"。** 那就换一个你现在真有的枚举：订单状态、用户角色、消息类型、套餐档位、任务优先级——**随便哪个都行。**
>
> **重点不是"工单"这个词，是"同一份枚举你抄了几遍"。** 下面这六处是典型位置，不要求字字对上你的文件名；**你数出来的那个数字，才是今天要消灭的东西。**

现在去做，数一下你要改几个地方：

```text
① 提示词里的枚举列表
② JSON schema 校验里的数组
③ 前端下拉框的选项
④ 判分器里的 CATEGORIES
⑤ 测试集里的 expect 校验
⑥ 数据库注释里的说明
```

**六个地方。** 而它们散在：`server.js`（1、2）、`public/index.html`（3）、`eval/judge-code.js`（4）、`eval/cases.jsonl`（5）、SQL 文件（6）。

**这就是没有分层的代价：同一个"知识"被复制了六遍。**

**今天要做的事，本质上是：让这种"同一个知识"只存在于一个地方。**

## 0.3 拆之前必须先做一件事

```bash
git status
```

**如果有未提交的改动，先提交。**

```bash
git add -A
git commit -m "重构前存档：能跑的状态"
git tag before-refactor
```

**为什么必须打 tag？**

因为重构会搞坏东西，而你需要一条"回到刚才能跑的状态"的路。

```bash
# 搞坏了就这么回去
git checkout before-refactor -- .
```

**没有这个 tag，你会在第 60 分钟时陷入"改也不好，退也不好"的地狱。**

---

# 第 1 步：定下目录结构（20 分钟）

## 1.1 六个文件夹，每个回答一个问题

```text
app/
├── index.js            程序入口：起服务、挂中间件、挂路由
├── config/             配置：所有"会因环境而变"的值
├── routes/             路由层：只解析参数，不做业务
├── services/           业务层：规则都在这里，可单测
├── repos/              仓储层：只碰数据库
├── lib/                基础设施：模型调用、日志、队列、审核
├── middleware/         中间件：鉴权、请求日志、错误处理
└── errors/             错误类型：一套统一的错误
```

**每个文件夹一句话说清：**

| 文件夹 | 回答什么问题 | 什么代码该放这 |
|---|---|---|
| `routes/` | 这个 URL 收什么参数？ | 参数解析、调用 service、拼响应 |
| `services/` | 业务规则是什么？ | 分类规则、状态流转、优先级计算 |
| `repos/` | 数据怎么存怎么取？ | SQL 语句，别的不写 |
| `lib/` | 外部世界怎么打交道？ | 模型、邮件、队列、日志、审核 |
| `middleware/` | 每个请求都要做的事？ | 鉴权、trace_id、错误兜底 |
| `errors/` | 出错时怎么表示？ | 错误类 + 错误码表 |
| `config/` | 环境不同哪里不同？ | 端口、key、路径、超时 |

## 1.2 一个关键判断：什么不进 `services/`

```text
❌ 不该进 services：
   · SQL 语句            → repos
   · console.log          → lib/logger
   · req / res 对象        → routes
   · 具体的 API key       → config
   · JSON 字符串拼接       → 让 routes 或 lib 处理

✅ 该进 services：
   · "金额 ≥ 500 就 high"
   · "商品问题优先于流程问题"
   · "客户连续三次同一问题 → 必须转人工"
   · "这个状态能不能流转到那个状态"
```

**判断标准：`services/` 里的函数，应该能在没有 HTTP、没有数据库的情况下被调用。**

```javascript
// ✅ 好：纯函数，可以单测
export function decideUrgency(text, amount) {
  if (amount >= 500) return "high";
  if (/投诉|曝光|律师/.test(text)) return "high";
  if (amount > 0) return "medium";
  return "low";
}

// ❌ 坏：依赖了 req
export function decideUrgency(req) {
  const amount = req.body.amount;
  // ...
}
```

**这个标准会在第 21 周救你** —— 那时你要写单元测试，而这层如果是纯函数，测试是十行代码的事。

## 1.3 现在动手建目录

```bash
cd 你的项目目录
mkdir -p app/{config,routes,services,repos,lib,middleware,errors}
ls app
```

**你应该看到：**

```text
config  errors  index.js?  lib  middleware  repos  routes  services
```

（`index.js` 还没建，正常的）

---

# 第 2 步：先搬配置（25 分钟）

## 2.1 为什么要从配置开始

因为**其他文件都要读配置**。先有配置，后面每个文件搬过来时就能直接 `import`。

如果先搬业务代码，你会到处写死 `3000`、写死 key，然后再改一遍。

## 2.2 建 `app/config/index.js`

```javascript
// app/config/index.js
// 所有"会因环境而变"的东西都在这里。
// 别的地方不许出现具体值。

import "dotenv/config";        // 读 .env（先 npm i dotenv）

function need(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`缺少环境变量 ${name}，检查 .env 或 .env.example`);
  }
  return v;
}

function num(name, fallback) {
  const v = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(v)) throw new Error(`环境变量 ${name} 必须是数字`);
  return v;
}

const env = process.env.NODE_ENV ?? "development";

export const config = {
  env,
  isProd: env === "production",
  isDev: env === "development",

  port: num("PORT", 3000),

  db: {
    file: need("DB_FILE", "./data/app.db"),
  },

  model: {
    baseURL: need("API_BASE", "https://api.example.com/v1"),
    primary: {
      name: need("MODEL_PRIMARY", "cheap-model"),
      key: need("KEY_PRIMARY", ""),
      priceIn: num("PRICE_IN_PRIMARY", 0.15),
      priceOut: num("PRICE_OUT_PRIMARY", 0.6),
    },
    backup: {
      name: need("MODEL_BACKUP", "backup-model"),
      key: need("KEY_BACKUP", ""),
      // 备用模型没配就跟着主模型走（同一个 key、同一个上游）
      baseURL: process.env.API_BASE_BACKUP ?? process.env.API_BASE,
    },
    promptFile: need("PROMPT_FILE", "./prompt.txt"),
  },

  timeout: {
    connect: num("TIMEOUT_CONNECT_MS", 3_000),
    firstByte: num("TIMEOUT_FIRST_BYTE_MS", 8_000),
    total: num("TIMEOUT_TOTAL_MS", 30_000),
  },

  log: {
    level: process.env.LOG_LEVEL ?? (env === "production" ? "info" : "debug"),
    dir: need("LOG_DIR", "./logs"),
  },

  review: {
    // 队列积压阈值（第 131 节）
    backlogLimit: num("QUEUE_BACKLOG_LIMIT", 200),
  },
};
```

## 2.3 逐段解释四段关键代码

**① 为什么 `need()` 会在缺失时抛错**

```javascript
// 有默认值：缺了也能跑
port: num("PORT", 3000),

// 没默认值：缺了就抛错
key: need("KEY_PRIMARY"),
```

**区别在于"这个值缺失了，系统还能不能工作"。**

```text
PORT 缺了 → 用 3000，能工作 → 给默认值
KEY 缺了  → 调不了模型 → 必须抛
DB_FILE 缺了 → 会建一个空库，你以为数据丢了 → 必须抛（或者给明确的默认）
```

**这个区别很重要：默认值是便利，也是隐患。**

**② 为什么 `num()` 要检查 `isFinite`**

```javascript
process.env.PORT = "abc"
Number("abc")     → NaN
Number("")        → 0        ← 这个更阴
```

**`Number("") === 0`** —— 你写 `PORT=` 会得到端口 0（随机端口），然后你访问 3000 打不开，查半小时。

**③ 为什么 `config` 是一个冻结的常量对象**

```javascript
export const config = { ... };   // 导出的是对象引用
```

**别的地方如果 `config.port = 4000`，全局就变了。** 想更严可以 `Object.freeze`，但**你的场景不需要 —— 只要你自己不改它就行。**

**④ 为什么 prompt 是"文件路径"而不是"文件内容"**

```javascript
promptFile: "./prompt.txt"      // ✅ 路径，需要时再读
prompt: "你是一个客服助手..."    // ❌ 内容，会污染整个 config
```

**因为提示词会变，而且它是一大段文本。** 塞进 config 会让 config 变成 200 行，而且每次改提示词都要改代码文件。

## 2.4 建 `.env` 和 `.env.example`

```bash
cat > .env.example << 'EOF'
# 复制成 .env 再填值。.env 不要提交到 git。

NODE_ENV=development
PORT=3000
DB_FILE=./data/app.db

API_BASE=https://api.example.com/v1
MODEL_PRIMARY=cheap-model
KEY_PRIMARY=
MODEL_BACKUP=backup-model
KEY_BACKUP=

TIMEOUT_CONNECT_MS=3000
TIMEOUT_FIRST_BYTE_MS=8000
TIMEOUT_TOTAL_MS=30000

LOG_LEVEL=debug
LOG_DIR=./logs
EOF

cp .env.example .env
```

**然后编辑 `.env`，把你的真实 key 填进去。**

## 2.5 检查 `.gitignore`

```bash
cat .gitignore
```

**必须包含这四行：**

```text
.env
.env.local
node_modules/
*.db
```

**如果 `.env` 已经在 git 里了，必须移除：**

```bash
git rm --cached .env
git commit -m "移除误提交的 .env"
```

**注意：这不会从 git 历史里删掉。** 如果那个 key 是真实的，**去供应商后台吊销它、重新生成。** 历史里的东西删不干净。

## 2.6 一个必须验证的事

新建 `app/config/test-config.js`：

```javascript
import { config } from "./index.js";

console.log(JSON.stringify({
  env: config.env,
  port: config.port,
  dbFile: config.db.file,
  hasKey: Boolean(config.model.primary.key),
  timeouts: config.timeout,
}, null, 2));
```

```bash
node app/config/test-config.js
```

**你应该看到 `hasKey: true`（真实 key 名不打印，只打印有没有）。**

**如果看到 `hasKey: false`** → 你的 `.env` 没被读到 → 检查 `.env` 是否在当前目录，`dotenv` 是否装了。

**这一步必须过。** 后面所有文件都依赖它。

---

# 第 3 步：搬基础设施（30 分钟）

## 3.1 顺序很重要

```text
config  →  lib（日志、错误、模型）  →  repos  →  services  →  routes  →  index.js
```

**为什么这个顺序？** 因为**后面的依赖前面的**。反过来搬，你会到处写临时的空实现。

## 3.2 `app/lib/logger.js`

**先把第 132 节的 logger 搬过来，但改成用 config：**

```javascript
// app/lib/logger.js
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";
import { redact } from "./redact.js";        // 第 132 节的脱敏函数

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[config.log.level] ?? 20;

fs.mkdirSync(config.log.dir, { recursive: true });
const stream = fs.createWriteStream(path.join(config.log.dir, "app.jsonl"), { flags: "a" });

export function makeLogger({ service = "app", bindings = {} } = {}) {
  function emit(level, event, fields = {}) {
    if (LEVELS[level] < MIN) return;
    const rec = { ts: new Date().toISOString(), level, service, event, ...bindings, ...fields };
    for (const k of Object.keys(rec)) {
      if (typeof rec[k] === "string" && !["event", "level", "ts", "service"].includes(k)) {
        rec[k] = redact(rec[k]);
      }
    }
    stream.write(JSON.stringify(rec) + "\n");
  }
  return {
    debug: (e, f) => emit("debug", e, f),
    info: (e, f) => emit("info", e, f),
    warn: (e, f) => emit("warn", e, f),
    error: (e, f) => emit("error", e, f),
    child: (extra) => makeLogger({ service, bindings: { ...bindings, ...extra } }),
  };
}

export const log = makeLogger();
```

**验证：**

```bash
node -e "import('./app/lib/logger.js').then(m => m.log.info('test', {a:1}))"
cat logs/app.jsonl
```

**应该看到一行 JSON。**

## 3.3 `app/errors/index.js`

**这是今天最值钱的一个文件。** 它定义了"错误"在你这套系统里长什么样。

```javascript
// app/errors/index.js
// 所有错误都从这里出来。前端只需要认识这一种结构。

export const CODES = {
  // 4xx 客户端问题
  BAD_INPUT:       { status: 400, message: "请求参数不对" },
  EMPTY_INPUT:     { status: 400, message: "消息是空的，请描述一下遇到的问题" },
  TOO_LONG:        { status: 400, message: "消息太长了，请用几句话简述问题" },
  BLOCKED:         { status: 400, message: "这条消息没法处理，请直接描述遇到的问题" },
  NOT_FOUND:       { status: 404, message: "找不到这条记录" },
  UNAUTHORIZED:    { status: 401, message: "请先登录" },
  FORBIDDEN:       { status: 403, message: "你没有权限做这个操作" },
  RATE_LIMITED:    { status: 429, message: "操作太频繁，请稍后再试" },

  // 5xx 服务端问题（对用户只说"暂时不行"，细节只在日志里）
  UPSTREAM_DOWN:   { status: 503, message: "服务暂时连不上，我们已经在处理" },
  UPSTREAM_SLOW:   { status: 504, message: "这条处理得比较久，已经转人工" },
  PROCESSING:      { status: 202, message: "正在核实，2 小时内回复" },
  INTERNAL:        { status: 500, message: "处理失败了，我们会跟进" },
};

export class AppError extends Error {
  constructor(code, { detail, cause, expose = true } = {}) {
    const def = CODES[code] ?? CODES.INTERNAL;
    super(def.message);
    this.code = code in CODES ? code : "INTERNAL";
    this.status = def.status;
    this.detail = detail;          // 内部细节，不返回给前端
    this.expose = expose;          // 是否可以把 message 给前端
    this.cause = cause;
  }
}

// 一个方便的函数：throw 一行搞定
export function fail(code, opts) {
  throw new AppError(code, opts);
}
```

**为什么 `detail` 和 `message` 要分开？**

```javascript
// ❌ 错：把内部信息当 message
throw new AppError("INTERNAL", { message: "SQLITE_BUSY: database is locked" });
// 前端看到 "SQLITE_BUSY: database is locked" → 暴露了你的技术栈

// ✅ 对：
throw new AppError("INTERNAL", { detail: "SQLITE_BUSY: database is locked" });
// 前端看到 "处理失败了，我们会跟进"，日志里有完整的 detail
```

**这条规则会被第 137 节放大成一整个中间件。今天先把它建对。**

## 3.4 `app/lib/db.js`

```javascript
// app/lib/db.js
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";

fs.mkdirSync(path.dirname(config.db.file), { recursive: true });

export const db = new Database(config.db.file);

// WAL 模式：读写不互相阻塞（第 16 节讲过）
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id    TEXT NOT NULL UNIQUE,
      input       TEXT NOT NULL,
      output      TEXT,
      category    TEXT,
      urgency     TEXT,
      need_human  INTEGER,
      route       TEXT,
      degraded    INTEGER DEFAULT 0,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
  `);
}
```

**验证：**

```bash
node -e "import('./app/lib/db.js').then(m => { m.migrate(); console.log('ok', m.db.prepare('select count(*) c from tickets').get()); })"
```

## 3.5 `app/lib/model.js`

**把第 128、129 节的调用封装搬过来，改成读 config：**

```javascript
// app/lib/model.js
import { config } from "../config/index.js";
import { log } from "./logger.js";

export async function callModel(input, prompt, opts = {}) {
  const {
    connect = config.timeout.connect,
    firstByte = config.timeout.firstByte,
    total = config.timeout.total,
  } = opts;

  const t0 = Date.now();
  const ac = new AbortController();
  let connected = false;

  const totalTimer = setTimeout(() => ac.abort(new Error("total_timeout")), total);
  const firstTimer = setTimeout(() => ac.abort(new Error("first_byte_timeout")), firstByte);
  const connTimer = setTimeout(() => {
    if (!connected) ac.abort(new Error("connect_timeout"));
  }, connect);

  try {
    const res = await fetch(`${config.model.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.model.primary.key}`,
      },
      body: JSON.stringify({
        model: config.model.primary.name,
        temperature: 0,
        max_tokens: 400,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: input },
        ],
      }),
      signal: ac.signal,
    });

    connected = true;
    clearTimeout(connTimer);

    if (!res.body) {
      clearTimeout(firstTimer); clearTimeout(totalTimer);
      return { text: await res.text(), elapsed: Date.now() - t0, firstByteMs: null };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "", firstByteMs = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstByteMs === null) {
        firstByteMs = Date.now() - t0;
        clearTimeout(firstTimer);
      }
      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    clearTimeout(firstTimer); clearTimeout(totalTimer);

    return { text, elapsed: Date.now() - t0, firstByteMs };
  } catch (err) {
    clearTimeout(connTimer); clearTimeout(firstTimer); clearTimeout(totalTimer);
    const name = String(err?.cause?.message ?? err?.message ?? "");
    const kind = name.includes("total_timeout") ? "total"
      : name.includes("first_byte_timeout") ? "first_byte"
      : name.includes("connect_timeout") ? "connect" : "network";
    log.warn("call_fail", { kind, err: name.slice(0, 80), dur_ms: Date.now() - t0 });
    const e = new Error(`model call failed: ${kind}`);
    e.kind = kind;
    throw e;
  }
}
```

**注意这个文件里没有任何 `3000`、没有 key 字符串。** 全部从 `config` 来。

## 3.6 阶段性验证

```bash
node -e "
import('./app/lib/model.js').then(async (m) => {
  const r = await m.callModel('我买的杯子碎了', '把输入整理成 JSON：{\"summary\":\"一句话\"}');
  console.log(r.text.slice(0, 200));
});
"
```

**如果这一步报错，先解决再往下。** 大概率是 `KEY_PRIMARY` 没填。

---

# 第 4 步：搬数据与业务（30 分钟）

## 4.1 `app/repos/ticket.js`

**仓储层只有一个职责：把数据库操作包成函数，SQL 只在这里出现。**

```javascript
// app/repos/ticket.js
import { db } from "../lib/db.js";

export function insertTicket({ traceId, input, output, category, urgency, needHuman, route, degraded }) {
  return db.prepare(`
    INSERT INTO tickets (trace_id, input, output, category, urgency, need_human, route, degraded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(traceId, input, output, category, urgency, needHuman ? 1 : 0, route, degraded ? 1 : 0, Date.now());
}

export function findTicketById(id) {
  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
}

export function findTicketByTrace(traceId) {
  return db.prepare(`SELECT * FROM tickets WHERE trace_id = ?`).get(traceId);
}

export function listTickets({ limit = 20, offset = 0 } = {}) {
  return db.prepare(`
    SELECT * FROM tickets ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

export function countTickets() {
  return db.prepare(`SELECT COUNT(*) AS n FROM tickets`).get().n;
}

export function statsByCategory() {
  return db.prepare(`
    SELECT category, COUNT(*) AS n FROM tickets GROUP BY category ORDER BY n DESC
  `).all();
}
```

**三条规矩：**

```text
① 这个文件里不许出现 req / res / log
② 一个函数只做一次数据库操作（事务除外）
③ 返回的永远是"数据"，不是"格式化后的字符串"
```

## 4.2 `app/services/ticket.js`

**业务规则的唯一住处。**

```javascript
// app/services/ticket.js
import { fail } from "../errors/index.js";
import * as repo from "../repos/ticket.js";

export const CATEGORIES = ["logistics", "quality", "refund", "invoice", "account", "other"];
export const URGENCIES = ["high", "medium", "low"];

// ===== 纯函数：可以单测，不碰数据库、不碰 HTTP =====

export function decideCategory(text, modelSaid) {
  // 模型给的类别如果不在枚举里 → 按文本兜底判
  if (CATEGORIES.includes(modelSaid)) return modelSaid;

  const s = String(text ?? "");
  if (/坏|裂|碎|假|过期|少件|错货/.test(s)) return "quality";
  if (/没收到|物流|快递|签收|送货/.test(s)) return "logistics";
  if (/退款|退货|赔/.test(s)) return "refund";
  if (/发票|税号|抬头/.test(s)) return "invoice";
  if (/登录|密码|账号|被盗/.test(s)) return "account";
  return "other";
}

export function decideUrgency(text, amount) {
  const s = String(text ?? "");
  if (/投诉|曝光|律师|起诉/.test(s)) return "high";
  if (Number(amount) >= 500) return "high";
  if (/人身|受伤|着火|漏电/.test(s)) return "high";
  if (Number(amount) > 0) return "medium";
  return "low";
}

export function needsHuman({ urgency, amount, text }) {
  const s = String(text ?? "");
  if (urgency === "high") return true;
  if (Number(amount) >= 500) return true;
  if (/投诉|曝光|律师/.test(s)) return true;
  if (s.trim().length < 4) return true;          // 信息不足
  return false;
}

// ===== 有副作用的：调 repo =====

export function saveResult({ traceId, input, parsed, route, degraded }) {
  const category = decideCategory(input, parsed?.category);
  const amount = extractAmount(input);
  const urgency = decideUrgency(input, amount);
  const needHuman = needsHuman({ urgency, amount, text: input });

  repo.insertTicket({
    traceId, input,
    output: parsed ? JSON.stringify(parsed) : null,
    category, urgency, needHuman, route, degraded,
  });

  return { category, urgency, needHuman };
}

export function getById(id) {
  const row = repo.findTicketById(id);
  if (!row) fail("NOT_FOUND", { detail: `ticket id=${id}` });
  return row;
}

export function extractAmount(text) {
  const s = String(text ?? "");
  // 阿拉伯数字
  const m = s.match(/(\d+(?:\.\d+)?)\s*(元|块|万)/);
  if (m) {
    const n = Number(m[1]);
    return m[3] === "万" ? n * 10000 : n;
  }
  // 中文数字的粗糙处理（够用就行）
  if (/(千|万)/.test(s)) {
    const big = s.match(/([一二两三四五六七八九十])\s*(千|万)/);
    if (big) {
      const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      const base = map[big[1]] ?? 1;
      return big[2] === "万" ? base * 10000 : base * 1000;
    }
  }
  return 0;
}
```

## 4.3 为什么这两个函数要放在 `services` 而不是 `lib`

```text
decideCategory / decideUrgency / needsHuman
  → 它们说的是"你的业务怎么判断"，不是"技术怎么做"
  → 换一个客户、换一个行业，这些规则要变
  → 所以是 services

callModel / logger / db
  → 它们说的是"技术上怎么调外部的东西"
  → 换供应商、换日志库，接口不变
  → 所以是 lib
```

**判断方法：如果一个函数里的规则是"老板告诉你的"，它属于 `services`。**

## 4.4 一个必须做的验证

```bash
node -e "
import('./app/services/ticket.js').then(async (s) => {
  console.log('classify:', s.decideCategory('收到的是坏的', null));
  console.log('urgency:', s.decideUrgency('花了一千三百八', 1380));
  console.log('human:', s.needsHuman({urgency:'high', amount:1380, text:'x'}));
  console.log('amount:', s.extractAmount('一共一千三百八'));
});
"
```

**输出应该是：**

```text
classify: quality
urgency: high
human: true
amount: 1000
```

**注意 `extractAmount('一共一千三百八')` 返回 1000 而不是 1380** —— 用 `千` 算的粗糙值。

**这就是"够用"的定义：** 规则只要能区分 `high/medium/low`，不要求精确到个位。**写进 NOTES 里，这是已知精度。**

---

# 第 5 步：搬路由与中间件（30 分钟）

## 5.1 `app/middleware/trace.js`

```javascript
// app/middleware/trace.js
import { randomBytes } from "node:crypto";

export function traceMiddleware(req, res, next) {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const id = `tr_${day}_${randomBytes(4).toString("hex")}`;

  req.traceId = id;
  res.setHeader("X-Trace-Id", id);
  next();
}
```

**为什么把 `trace_id` 放在响应头里？**

```text
① 前端报错时能读到它，直接显示给用户
② 你自己用 curl 测试时也能看到
③ 不需要改响应体结构
```

## 5.2 `app/middleware/error.js`

**这个中间件是第 137 节的主角，今天先建一个最小版：**

```javascript
// app/middleware/error.js
import { AppError, CODES } from "../errors/index.js";
import { log } from "../lib/logger.js";

export function errorMiddleware(err, req, res, next) {
  const L = log.child({ trace_id: req.traceId });

  const isApp = err instanceof AppError;
  const code = isApp ? err.code : "INTERNAL";
  const status = isApp ? err.status : 500;

  // 日志里记全部细节
  L.error("req_error", {
    code,
    status,
    detail: err.detail ?? null,
    stack: err.stack?.split("\n").slice(0, 3).join(" | "),
    path: req.path,
    method: req.method,
  });

  // 返回给前端的只有干净的三种字段
  res.status(status).json({
    ok: false,
    code,
    message: isApp && err.expose ? err.message : CODES.INTERNAL.message,
    trace_id: req.traceId,
  });
}

// Express 4 不自动捕获 async 函数的 rejection，需要包一层
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

**`wrap` 这个函数你一定会需要。**

```javascript
// ❌ 这样写，async 里的 throw 会变成"未处理的 rejection"，请求永远挂着
app.post("/api/tickets", async (req, res) => { throw new Error("x") });

// ✅ 包一层
app.post("/api/tickets", wrap(async (req, res) => { throw new Error("x") }));
```

**Express 5 之后内置了，但你现在用的多半是 4。**

## 5.3 `app/routes/tickets.js`

**路由层只做三件事：取参数 → 调 service → 拼响应。**

```javascript
// app/routes/tickets.js
import { Router } from "express";
import { wrap } from "../middleware/error.js";
import { fail } from "../errors/index.js";
import * as ticketService from "../services/ticket.js";
import * as repo from "../repos/ticket.js";
import { callModel } from "../lib/model.js";
import { readPrompt } from "../services/prompt.js";
import { log } from "../lib/logger.js";

export const ticketsRouter = Router();

// 创建工单
ticketsRouter.post("/tickets", wrap(async (req, res) => {
  const input = String(req.body?.message ?? "").trim();
  const L = log.child({ trace_id: req.traceId });

  // 参数校验：这一层该做的
  if (!input) fail("EMPTY_INPUT");
  if (input.length > 4000) fail("TOO_LONG", { detail: `${input.length} chars` });

  // 业务：调模型 + 解析 + 保存
  const prompt = readPrompt();
  let parsed = null, degraded = false, route = "auto";

  try {
    const r = await callModel(input, prompt);
    const a = r.text.indexOf("{"), b = r.text.lastIndexOf("}");
    parsed = JSON.parse(r.text.slice(a, b + 1));
  } catch (e) {
    // 模型失败不报 500，进人工队列（第 19 节的逻辑）
    route = "human";
    L.warn("model_failed", { kind: e.kind ?? "unknown" });
  }

  const saved = ticketService.saveResult({
    traceId: req.traceId, input, parsed, route, degraded,
  });

  res.status(route === "human" ? 202 : 200).json({
    ok: route !== "human",
    route,
    trace_id: req.traceId,
    data: parsed,
    saved,
    ...(route === "human" ? { message: "正在核实，2 小时内回复" } : {}),
  });
}));

// 查一条
ticketsRouter.get("/tickets/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) fail("BAD_INPUT", { detail: "id 不是整数" });

  const t = ticketService.getById(id);
  res.json({ ok: true, trace_id: req.traceId, data: t });
}));

// 列表
ticketsRouter.get("/tickets", wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  res.json({
    ok: true,
    trace_id: req.traceId,
    data: repo.listTickets({ limit, offset }),
    total: repo.countTickets(),
  });
}));

// 统计
ticketsRouter.get("/stats", wrap(async (req, res) => {
  res.json({ ok: true, trace_id: req.traceId, data: repo.statsByCategory() });
}));
```

## 5.4 `app/services/prompt.js`

```javascript
// app/services/prompt.js
import fs from "node:fs";
import { config } from "../config/index.js";

let cache = null;

export function readPrompt() {
  if (cache) return cache;
  cache = fs.readFileSync(config.model.promptFile, "utf8");
  return cache;
}

// 改提示词后需要重启，或者调用这个
export function reloadPrompt() {
  cache = null;
  return readPrompt();
}
```

**为什么缓存？**

```text
每个请求读一次文件 → 1000 请求/天 = 1000 次磁盘 IO
缓存在内存       → 1 次
```

**代价是"改了提示词要重启"。** 对小项目来说这个代价可以接受 —— **但你要知道有这个代价，否则你会改完提示词测试时发现没生效，然后怀疑自己。**

## 5.5 `app/index.js`

```javascript
// app/index.js
import express from "express";
import { config } from "./config/index.js";
import { log } from "./lib/logger.js";
import { migrate } from "./lib/db.js";
import { traceMiddleware } from "./middleware/trace.js";
import { errorMiddleware } from "./middleware/error.js";
import { ticketsRouter } from "./routes/tickets.js";

migrate();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));
app.use(traceMiddleware);

// 请求日志
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    log.child({ trace_id: req.traceId }).info("req_out", {
      method: req.method, path: req.path, status: res.statusCode, dur_ms: Date.now() - t0,
    });
  });
  next();
});

app.use("/api", ticketsRouter);

app.get("/health", (req, res) => res.json({ ok: true, env: config.env }));

// 404 也要走统一格式
app.use((req, res, next) => {
  const e = new Error("not found");
  e.status = 404;
  next(e);
});

app.use(errorMiddleware);

app.listen(config.port, () => {
  log.info("server_start", { port: config.port, env: config.env });
  console.log(`http://localhost:${config.port}`);
});
```

## 5.6 改 `package.json`

```json
{
  "scripts": {
    "start": "node app/index.js",
    "dev": "node --watch app/index.js"
  }
}
```

**然后删掉旧的 `server.js`（或改名 `server.js.bak` 保留一周）。**

```bash
mv server.js server.js.bak
npm start
```

**现在访问 `http://localhost:3000`，一切应该和之前一样。**

---

# 第 6 步：故意搞坏两次（20 分钟）★ 关键

**重构最危险的不是"改错了"，是"改错了但看不出来"。**

所以你要主动制造错误，验证你的结构能接住。

## 6.1 故障一：删掉一个 import

```bash
# 打开 app/services/ticket.js，把第一行的 fail 删掉
# 变成：
# import * as repo from "../repos/ticket.js";
```

然后：

```bash
curl "http://localhost:3000/api/tickets/99999"
```

**期望：服务不崩（其他接口还能用），这个请求返回 500 + `{"ok":false,"code":"INTERNAL",...}`。**

**如果你看到整个进程退出了** —— 说明有未捕获的异常，检查 `errorMiddleware` 有没有挂上、`wrap` 有没有用。

**如果看到返回了 HTML 错误页** —— 说明 `errorMiddleware` 没生效，Express 用了默认的错误处理。

## 6.2 故障二：把 config 里的 key 置空

```bash
# 编辑 .env，把 KEY_PRIMARY= 留空
# 重启
npm start
```

然后调接口。

**期望：返回 202 + "正在核实，2 小时内回复"，日志里有 `call_fail`。**

**如果你看到 500 + 堆栈** —— 说明你的错误处理不够，模型失败应该被降级成"转人工"，不是崩。

## 6.3 故障三：删掉 `app/routes/tickets.js` 里的 wrap

```javascript
// 改成
ticketsRouter.post("/tickets", async (req, res) => { ... });
```

然后发一个会报错的请求（比如超长输入之后又删掉校验）。

**期望：请求挂住不返回（Express 4 的行为）。**

**这个体验很重要：** 你会亲眼看到"忘了 wrap"的后果是"用户一直转圈"，而不是"报错"。

**看到挂住之后，把 wrap 加回去。**

## 6.4 三次故障的意义

```text
故障一验证：错误的边界是清晰的（一个接口坏，不影响别的）
故障二验证：外部依赖失败被正确降级（不是 500）
故障三验证：你知道 wrap 存在的理由（不是抄来的）
```

**做完这三件事，你的重构才算"验证过"，不是"看起来能跑"。**

---

# 第 7 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **重构前后的行数对比**（`server.js` 多少行 → 拆成几个文件）
- **三次故障的实际现象**（和期望一致吗）
- **`extractAmount` 的精度问题**（中文数字只算到千）
- **哪个文件你觉得还是太胖**

---

# 第 8 步：课后练习

## 练习一：找出"同一个知识被复制了几遍"（20 分钟）

**拿"六个类别"这个知识，搜一遍你的整个项目：**

```bash
grep -rn "logistics.*quality.*refund" --include="*.js" --include="*.json" --include="*.md" --include="*.txt" .
```

**数一下出现在几个文件里。**

**目标：让它在 `app/services/ticket.js` 里只出现一次，其他地方都 import 它。**

**做不到的地方（比如提示词文件、前端 HTML）写进 NOTES，说明为什么做不到。**

```text
提示词文件 → 是给模型看的自然语言，不能 import
前端 HTML  → 可以改成接口返回类别列表，前端动态渲染 ← 这个可以做
```

## 练习二：给 `repos` 加一个"过期清理"（15 分钟）

```javascript
// app/repos/ticket.js 里加
export function deleteOlderThan(ms) {
  return db.prepare(`DELETE FROM tickets WHERE created_at < ?`).run(Date.now() - ms);
}
```

**然后在 `app/index.js` 启动时调用一次，删掉 90 天前的数据。**

**注意：这个操作是破坏性的。** 先 `SELECT COUNT(*)` 看会删掉多少，再删。

## 练习三：判断这个目录结构错在哪（15 分钟）

```text
src/
├── controllers/
│   └── ticketController.js     （300 行：解析参数 + 业务规则 + 拼 SQL）
├── models/
│   └── ticket.js               （只是个空对象定义）
├── utils/
│   └── helpers.js              （800 行，什么都往里塞）
├── index.js                    （起服务）
└── config.js                   （写着 key = "sk-xxx"）
```

**错在哪？至少五条。**

**参考答案：**

```text
① controller 里有 SQL → 换数据库要改 controller，和 repos 层的目的相反
② models 是空壳 → 这一层没有任何价值，删掉
③ helpers.js 800 行 → 名字等于"我不知道放什么"，实际上里面混着业务规则和技术工具
④ config.js 里写着 key → 会提交到 git
⑤ 没有 services 层 → 业务规则无处安放，只能塞 controller
⑥ 没有 errors → 错误处理散落各处
```

**第 ③ 条最典型。** 一个叫 `helpers` / `utils` / `common` 的文件超过 200 行，说明作者没想清楚"这些东西为什么放在一起"。

---

# 第 9 步：最终验收

## A. 目录建起来了

```text
app/
├── index.js         ✅
├── config/index.js  ✅
├── routes/          ✅
├── services/        ✅
├── repos/           ✅
├── lib/             ✅
├── middleware/      ✅
└── errors/          ✅
```

- [ ] 八个文件夹都存在，每个里面至少一个文件
- [ ] 我能一句话说清每个文件夹"收什么代码"

## B. 服务照常跑

- [ ] `npm start` 能启动
- [ ] 所有原有接口都能访问（用 curl 逐个试）
- [ ] 前端页面照常工作

## C. 没有硬编码

```bash
grep -rn "3000\|sk-\|\./data/" app/ --include="*.js" | grep -v "config/"
```

- [ ] 上面这条命令**没有输出**（或者输出的都是注释）
- [ ] 所有环境相关的值都在 `config/index.js` 里

## D. 三次故障都试过

- [ ] 删 import → 服务不崩，返回 500 + 统一格式
- [ ] 空 key → 返回 202 + 人话，不是 500
- [ ] 去掉 wrap → 请求挂住（我亲眼看到了）

## E. 分层是真的

- [ ] `repos/` 里能搜到 SQL，`services/` 里搜不到
- [ ] `services/` 里的核心函数不接收 `req`/`res`
- [ ] `routes/` 里没有 SQL、没有 `console.log`
- [ ] `lib/model.js` 里没有硬编码的 key 或端口

## F. git 状态干净

- [ ] `git status` 里没有 `.env`
- [ ] `before-refactor` tag 存在
- [ ] 至少三次提交（配置、基础设施、路由）

## G. 提交

```bash
git add -A
git commit -m "第134节：拆分为八层目录，原 1800 行 server.js → 8 文件"
git push
```

---

## 本节课要能说出口的一句话

> **分层的标准不是"文件多不多"，是"改一个需求要动几个文件"。**

---

# 附：常见问题速查

**Q：我的项目只有一个接口，也需要分八层吗？**

A：**不需要八层，但需要三层。**

```text
最小可用：
  app/index.js     起服务 + 路由（一个文件就够）
  app/services/x.js  业务规则（今天先建，因为规则会长）
  app/lib/*.js      模型、日志、db（技术细节）
```

**关键是"业务规则"和"技术细节"分开。** 这两者混在一起，第 21 周你就没法写测试。

**Q：`repos` 和 `services` 的界限怎么定？**

A：**一句话：`repos` 里能搜到 `SELECT`，`services` 里搜不到。**

如果 `services` 里出现 SQL，说明你把数据访问写在了业务层 —— 换数据库时你要改业务代码。

如果 `repos` 里出现 `if (amount >= 500)`，说明你把业务规则写在了仓储层 —— 改规则时你要改数据层。

**两个方向都不对。**

**Q：我给 `services` 传 `req` 会怎样？**

A：**第 21 周你会无法写测试。**

```javascript
// 需要构造一个假 req 对象才能测
const fakeReq = { body: { message: "..." }, traceId: "t1" };
decideCategory(fakeReq);

// 不需要
decideCategory("...", null);
```

**第一个版本，你测一个分类函数要造一个 HTTP 请求对象。** 这会让你最终放弃写测试。

**Q：`prompt` 缓存导致改提示词不生效，怎么解决？**

A：三个办法，按成本排：

```text
① 重启服务（最简单，适合一天改几次）
② 加一个 /api/reload-prompt 接口（加一行 reloadPrompt()）
③ 监听文件变化（fs.watch，改动后自动重载）
```

**推荐 ①。** 改提示词是个低频动作，为了它加一套热重载不值得。

**但你必须知道这个缓存存在** —— 否则你会改完提示词、测试没变化，然后怀疑自己。

**Q：`errorMiddleware` 里的 `stack` 只记 3 行够吗？**

A：**够定位，不够复现。**

```text
3 行 → 能看到"从哪个函数抛出来的"
完整 → 能看到整条调用链
```

**折中：记完整 stack 的前 5 层，且只记在 error 级别的日志里。**

因为 `stack` 里会有绝对路径（`C:\Users\Administrator\...`），这也是信息泄露 —— **日志文件不外发的话可以接受，但如果你的日志会上传到第三方服务，先过一遍 `redact` 把路径削掉。**

**Q：重构之后前端要改吗？**

A：**接口路径和响应结构不变，就不需要改。**

**这正是"先搬再改"的意义** —— 今天只做搬家，不改变任何行为。这样出问题时你能确定"是搬家搬错了"，不是"顺手改了逻辑"。

**如果你想改响应结构（比如统一成 `{ok, data}`），单独做一次，单独提交。** 混在一起会让你分不清是哪一步引入的 bug。

**Q：`extractAmount` 只算到千，够用吗？**

A：**够用于分档，不够用于记账。**

```text
分档：需要区分 ≥500 和 <500 → 千的精度足够
记账：需要精确到分 → 你的实现会错 38%
```

**所以这个函数只能用在 `decideUrgency` 里，不能用在账单计算里。**

**在函数上方写一句注释：**

```javascript
// 精度：中文数字只算到"千"，误差可达 ±40%。仅用于分档，不可用于金额计算。
export function extractAmount(text) { ... }
```

**注释里写清精度限制，比写清功能更重要。**
