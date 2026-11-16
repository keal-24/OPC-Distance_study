# 第 136 节课：开发 / 测试 / 生产

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天要做的事只有一个：**让"生产环境连错库"这件事变得不可能。**
> 不是"小心一点"，是"系统会拒绝启动"。

**建议用时**：110 分钟
**你需要先完成**：第 135 节的 `config/index.js`
**今天要装**：什么都不用装

---

# 第 0 步：先看清"连错库"有多容易（20 分钟）

## 0.1 三条真实路径

**路径一：忘记改环境变量**

```bash
# 你在服务器上部署
git pull
npm install
npm start          ← 忘了 source .env.production

# 结果：NODE_ENV 是 undefined → 走默认 "development"
#       DB_FILE 是 "./data/app.db" → 建了一个新空库
#       一周后你发现"生产数据怎么少了三个月"
```

**路径二：本地脚本指错路径**

```bash
# 你在本地跑清理脚本
node scripts/clean-old.js

# 脚本里写的是 ./data/app.db
# 但你的 .env 指向 ../data/prod.db（你昨天为了查数据临时改的，忘了改回来）
# 结果：生产库被清了
```

**路径三：DROP / DELETE 忘了加 WHERE**

```sql
DELETE FROM tickets;      -- 忘了 WHERE
-- 开发库：无所谓，重跑一遍 seed
-- 生产库：全部客户数据没了
```

**三条路径的共同点：系统没有拒绝，因为它不知道"这是生产"。**

## 0.2 一个必须接受的现实

```text
你不可能靠"小心"来避免这类事故。
因为这类事故的特点是：
  ① 操作本身很平常（npm start、跑个脚本）
  ② 后果延迟出现（一周后才发现）
  ③ 不可逆（数据删了就没了）
```

**唯一可靠的办法：让系统知道自己在什么环境，并且对危险操作主动拒绝。**

## 0.3 今天要建的四层防线

```text
第一层：环境标识（NODE_ENV 必须显式设置，不能靠默认）
第二层：启动校验（生产环境缺配置 → 拒绝启动）
第三层：危险操作守卫（生产环境执行删库 → 拒绝）
第四层：数据库指纹（启动时打印库的唯一标识，肉眼可辨）
```

**四层缺一层，事故还能发生。** 但它们加起来，成本是 60 行代码。

---

# 第 1 步：环境标识必须显式（20 分钟）

## 1.1 三套环境，三个文件

```bash
.env.development    # 本地开发
.env.test           # 自动化测试（第 21 周会用）
.env.production     # 生产（不提交，服务器上单独放）
```

**注意：没有一个叫 `.env` 的文件了。**

**为什么？** 因为 `.env` 的语义是"当前环境的配置"，它会诱导你"改一下注释掉再改回来"。

**三个具名文件，改哪个是明确的。**

## 1.2 改造 `config/index.js` 的读环境部分

```javascript
// app/config/index.js 开头
import dotenv from "dotenv";
import fs from "node:fs";

const ENVS = ["development", "test", "production"];

const env = process.env.NODE_ENV;

// 关键：不允许缺省
if (!env) {
  console.error(`
❌ NODE_ENV 没有设置。

必须显式指定运行环境，三选一：
  NODE_ENV=development npm start
  NODE_ENV=test        npm test
  NODE_ENV=production  npm start

为什么强制：默认值会让"忘配环境"变成"静默连错库"。
`);
  process.exit(1);
}

if (!ENVS.includes(env)) {
  console.error(`❌ NODE_ENV="${env}" 不合法，只能是 ${ENVS.join(" / ")}`);
  process.exit(1);
}

// 读对应的文件（存在才读，允许服务器用纯环境变量）
const envFile = `.env.${env}`;
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
  console.log(`[config] 读取 ${envFile}`);
} else {
  console.log(`[config] 没有 ${envFile}，只用进程环境变量`);
}
```

## 1.3 为什么"不允许缺省"是对的

**有人会说："太麻烦了吧，本地开发每次都要写 NODE_ENV。"**

用 `package.json` 解决：

```json
{
  "scripts": {
    "dev":  "NODE_ENV=development node --watch app/index.js",
    "start": "NODE_ENV=production node app/index.js",
    "test": "NODE_ENV=test node --test"
  }
}
```

**然后你永远只需要 `npm run dev` 或 `npm start`，不用记环境变量。**

**Windows 上 `NODE_ENV=x cmd` 不work。** 两个办法：

```bash
# 装 cross-env（10KB）
npm i -D cross-env
# 然后 "dev": "cross-env NODE_ENV=development node --watch app/index.js"
```

**推荐装 `cross-env`。** 不然你会为了 Windows 兼容浪费半小时。

## 1.4 三个 `.env` 文件的差异

**.env.development：**

```bash
NODE_ENV=development
PORT=3000
DB_FILE=./data/dev.db
LOG_LEVEL=debug
LOG_DIR=./logs/dev
API_BASE=https://api.example.com/v1
KEY_PRIMARY=sk-xxx你的开发key
MODEL_PRIMARY=cheap-model
TIMEOUT_TOTAL_MS=30000
```

**.env.test：**

```bash
NODE_ENV=test
PORT=3001
DB_FILE=:memory:                 # 内存库，测完就没
LOG_LEVEL=error                  # 测试时不刷屏
LOG_DIR=./logs/test
API_BASE=http://localhost:4999/v1  # 假上游（第 128 节的 chaos.js）
KEY_PRIMARY=fake-key
MODEL_PRIMARY=fake-model
TIMEOUT_TOTAL_MS=5000            # 测试要快，超时设短
```

**.env.production：**

```bash
NODE_ENV=production
PORT=3000
DB_FILE=/var/www/app/data/prod.db   # 绝对路径！
LOG_LEVEL=info
LOG_DIR=/var/www/app/logs
API_BASE=https://api.example.com/v1
KEY_PRIMARY=sk-xxx生产key
MODEL_PRIMARY=cheap-model
TIMEOUT_TOTAL_MS=30000
```

## 1.5 三个关键差异（必须理解为什么）

**① 生产用绝对路径，开发用相对路径**

```text
开发：./data/dev.db     → 在你的项目目录下，随项目移动
生产：/var/www/app/data/prod.db  → 不随启动目录变化
```

**为什么生产必须绝对路径？**

```bash
# 你在 /var/www/app 下启动 → ./data/prod.db = /var/www/app/data/prod.db ✅
# 你在 / 下启动（systemd 的默认工作目录）→ ./data/prod.db = /data/prod.db ❌
```

**相对路径的解析依赖"当前工作目录"**，而 systemd / Docker / cron 的工作目录都和你手动启动时不同。

**这个坑会在你第一次配 systemd 时爆发。**

**② 测试用内存库**

```text
DB_FILE=:memory:
注意：better-sqlite3 要写成 new Database(":memory:")
```

**好处是测试之间完全隔离** —— 每次连都是一个全新的空库，不用清数据。

**③ 测试的超时要短**

```text
生产 30 秒 → 用户能忍
测试 30 秒 → 一条超时用例要等 30 秒，10 条就是 5 分钟
测试 5 秒  → 快
```

**这也是为什么超时必须配置化（第 135 节）。**

---

# 第 2 步：启动校验（30 分钟）★ 核心

## 2.1 建 `app/config/validate.js`

```javascript
// app/config/validate.js
// 启动时的"体检"。任何一项不过 → 拒绝启动。

import fs from "node:fs";
import path from "node:path";
import { config } from "./index.js";

export function validateOrExit() {
  const problems = [];
  const warnings = [];

  // ===== 1. 生产环境必须显式配置的东西 =====

  if (config.isProd) {
    // ① 数据库必须是绝对路径
    if (!path.isAbsolute(config.db.file)) {
      problems.push(
        `生产环境 DB_FILE 必须是绝对路径，当前是 "${config.db.file}"。\n` +
        `    相对路径会随启动目录变化，systemd / cron 下会连到不同的库。`
      );
    }

    // ② 日志目录必须是绝对路径
    if (!path.isAbsolute(config.log.dir)) {
      problems.push(`生产环境 LOG_DIR 必须是绝对路径，当前是 "${config.log.dir}"`);
    }

    // ③ 不允许 debug 日志级别
    if (config.log.level === "debug") {
      problems.push(
        `生产环境 LOG_LEVEL 不能是 debug（会记录过多细节，可能有 PII，且磁盘涨得快）`
      );
    }

    // ④ API 地址不能指向本地
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(config.model.baseURL)) {
      problems.push(`生产环境 API_BASE 指向本地地址 "${config.model.baseURL}"`);
    }

    // ⑤ 必须有关键的 key
    if (!config.model.primary.key) {
      problems.push(`生产环境 KEY_PRIMARY 不能为空`);
    }
  }

  // ===== 2. 所有环境都要检查的 =====

  // ① key 的形状（主 + 备）
  for (const [label, k] of [
    ["KEY_PRIMARY", config.model.primary.key],
    ["KEY_BACKUP", config.model.backup.key],
  ]) {
    if (!k) continue;                       // 空的不查（可能是有意不配备用）
    if (k.length < 20) {
      problems.push(`${label} 长度只有 ${k.length}，短得不像一个真实 key`);
    }
    if (/xxx|your|placeholder|changeme|todo/i.test(k)) {
      problems.push(`${label} 里含占位符字样（xxx/your/placeholder），像是没换掉示例值`);
    }
  }

  // ② 数据目录必须可写
  const dbDir = path.dirname(path.resolve(config.db.file));
  if (!config.db.memory) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      fs.accessSync(dbDir, fs.constants.W_OK);
    } catch (e) {
      problems.push(`数据库目录不可写：${dbDir}（${e.code}）`);
    }
  }

  // ③ 提示词文件必须存在
  if (!fs.existsSync(config.model.promptFile)) {
    problems.push(`提示词文件不存在：${config.model.promptFile}`);
  }

  // ④ 超时必须递增
  if (!(config.timeout.connect < config.timeout.firstByte
     && config.timeout.firstByte < config.timeout.total)) {
    problems.push(
      `超时必须满足 connect < firstByte < total，当前是 ` +
      `${config.timeout.connect}/${config.timeout.firstByte}/${config.timeout.total}`
    );
  }

  // ===== 3. 警告（不阻止启动，但要说） =====

  if (config.isProd && config.model.backup.key === config.model.primary.key) {
    warnings.push(`主备用了同一个 key，主 key 被限流时切换无效`);
  }

  if (config.isProd && !process.env.VAULT_KEY) {
    warnings.push(`没配 VAULT_KEY（第132节的原文加密），原文将以明文存储`);
  }

  // ===== 4. 输出 =====

  if (warnings.length) {
    console.warn(`\n⚠️  配置警告（不影响启动）：`);
    for (const w of warnings) console.warn(`   · ${w}`);
  }

  if (problems.length) {
    console.error(`\n❌ 配置检查未通过，拒绝启动（${problems.length} 个问题）：\n`);
    problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}\n`));
    console.error(`环境：${config.env}`);
    console.error(`修复后重试。如果是本地开发，检查 .env.development。\n`);
    process.exit(1);
  }

  console.log(`✅ 配置检查通过（${config.env}）`);
}
```

## 2.2 逐条解释"为什么这五条必须拦"

**① 生产 DB_FILE 必须绝对路径**

**这一条拦住的是最贵的事故。**

```bash
# systemd 的默认 WorkingDirectory 是 /
# 你以为在 /var/www/app 下启动
# 实际 ./data/prod.db = /data/prod.db
```

**而且它不会报错** —— 会建一个新目录、一个新空库，然后"正常运行"。

**② 生产 LOG_LEVEL 不能是 debug**

```text
debug 级别会记录：
  · 每个请求的完整参数
  · 每次模型调用的输入输出
  · 内部状态
```

**这些都是 PII 的来源。** 而日志文件通常权限更松（因为"方便查"）。

**③ 生产 API_BASE 不能指向本地**

```text
如果你在服务器上留着 API_BASE=http://localhost:8080（本地假上游）
→ 全部请求失败
→ 而且是"连接被拒"，每次浪费 3 秒
```

**④ 超时必须递增**

```bash
TIMEOUT_CONNECT_MS=8000
TIMEOUT_FIRST_BYTE_MS=3000
TIMEOUT_TOTAL_MS=30000
```

**这个配置下，`firstByte` 永远轮不到** —— 因为 3 秒先超了，而它小于 8 秒的 connect 超时。**结果是所有请求都在 3 秒失败，但你以为是"上游慢"。**

**⑤ 数据目录可写**

**这个检查很土，但能省你 20 分钟。**

```text
服务器上 /var/www/app/data 属主是 root，你用 node 用户启动
→ 启动时报 SQLITE_CANTOPEN
→ 你去查"SQLite 为什么打不开"
→ 20 分钟后发现是权限
```

**启动时直接说"目录不可写"，2 秒解决。**

## 2.3 接进 `app/index.js`

```javascript
// app/index.js 最开头（在所有业务 import 之前）
import { validateOrExit } from "./config/validate.js";
validateOrExit();

// 然后才是
import express from "express";
// ...
```

**注意：`validateOrExit()` 必须在 `import` 之前调用，但 ESM 的 import 是提前求值的。**

**这做不到。** 正确写法：

```javascript
// app/index.js
import { validateOrExit } from "./config/validate.js";
import { describeConfig } from "./config/index.js";

validateOrExit();                          // ← 在顶层执行，import 之后但业务之前
console.log("[config]", describeConfig());

// 用动态 import 延迟加载业务模块
const { startServer } = await import("./server.js");
startServer();
```

**或者更简单：把 config 的校验放在 `config/index.js` 末尾，import 时自动跑。**

```javascript
// app/config/index.js 最后
import { validateOrExit } from "./validate.js";   // ❌ 循环依赖
```

**推荐第一种（动态 import）。** 或者接受"校验在业务之后"（风险：业务模块的 import 可能已经读到了错误的配置）。

**最干净的做法：单独一个入口。**

```javascript
// app/index.js
import "./config/validate-run.js";     // 这个文件里调 validateOrExit()
import { startServer } from "./server.js";

startServer();
```

```javascript
// app/config/validate-run.js
import { validateOrExit } from "./validate.js";
validateOrExit();
```

**ESM 会按 import 顺序执行，所以 `validate-run.js` 先跑。** 这就是我要的。

## 2.4 故意触发校验

**做完这段，必须每个都试一遍：**

```bash
# ① 生产用相对路径
NODE_ENV=production DB_FILE=./data/x.db npm start
# 期望：拒绝启动，提示"必须是绝对路径"

# ② 生产开 debug
NODE_ENV=production LOG_LEVEL=debug npm start
# 期望：拒绝启动

# ③ 超时顺序错
NODE_ENV=production TIMEOUT_CONNECT_MS=9000 npm start
# 期望：拒绝启动，提示"必须递增"

# ④ 占位符 key
NODE_ENV=production KEY_PRIMARY=sk-your-key-here npm start
# 期望：拒绝启动，提示"含占位符字样"

# ⑤ 缺 NODE_ENV
node app/index.js
# 期望：拒绝启动，提示"必须显式指定"
```

**五个全过，这一节的核心就做完了。**

**如果某条没拦住** → 你的检查逻辑有 bug → 逐条对照上面代码。

---

# 第 3 步：危险操作守卫（25 分钟）

## 3.1 三类危险操作

```text
① DROP / TRUNCATE / 无 WHERE 的 DELETE
② 批量 UPDATE（影响行数超过阈值）
③ 清空目录 / 删除日志
```

**在开发环境这些是日常。在生产环境它们是灾难。**

## 3.2 建 `app/lib/safe-sql.js`

```javascript
// app/lib/safe-sql.js
import { config } from "../config/index.js";

const DANGEROUS = [
  { re: /^\s*drop\s+table/i, what: "DROP TABLE" },
  { re: /^\s*truncate/i, what: "TRUNCATE" },
  { re: /^\s*delete\s+from\s+\w+\s*$/i, what: "无 WHERE 的 DELETE" },
  { re: /^\s*update\s+\w+\s+set\s+[^;]*?(?<!where.*)$/i, what: "无 WHERE 的 UPDATE" },
];

export function guardSql(sql) {
  const s = String(sql).trim();

  for (const d of DANGEROUS) {
    if (d.re.test(s)) {
      if (config.isProd) {
        throw new Error(
          `拒绝执行危险 SQL（生产环境）：${d.what}\n` +
          `如果确实要执行，请用 scripts/dangerous.js 并带 --confirm-prod 参数。\n` +
          `SQL: ${s.slice(0, 200)}`
        );
      }
      console.warn(`⚠️  开发环境执行危险 SQL：${d.what}`);
    }
  }

  return sql;
}
```

## 3.3 一个专用的危险操作脚本

**生产环境确实有时需要改数据。** 但不能在应用里随手做，要有一个"流程"。

```javascript
// scripts/dangerous.js
// 用法：
//   NODE_ENV=development node scripts/dangerous.js "DELETE FROM tickets WHERE id=1"
//   NODE_ENV=production node scripts/dangerous.js --confirm-prod --dry-run "DELETE ..."
//   NODE_ENV=production node scripts/dangerous.js --confirm-prod "DELETE ..."

import { config } from "../app/config/index.js";
import { db } from "../app/lib/db.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const confirmed = args.includes("--confirm-prod");
const sql = args.filter((a) => !a.startsWith("--")).join(" ");

if (!sql) {
  console.error("用法：node scripts/dangerous.js [--dry-run] [--confirm-prod] \"SQL\"");
  process.exit(1);
}

console.log(`环境：${config.env}`);
console.log(`数据库：${config.db.file}`);
console.log(`SQL：${sql}`);

// 生产环境必须显式确认
if (config.isProd && !confirmed) {
  console.error(`\n❌ 生产环境必须加 --confirm-prod 参数`);
  process.exit(1);
}

// 生产环境默认 dry-run（要执行必须显式写 --execute）
if (config.isProd && !dryRun && !args.includes("--execute")) {
  console.log(`\n⚠️  生产环境默认 dry-run。要看影响行数，加 --execute 才真的执行。`);
  process.exit(0);
}

// 先算影响范围
let affected = null;
const m = sql.match(/^\s*(delete|update)\s+from?\s+(\w+)/i);
if (m) {
  const table = m[2];
  try {
    affected = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    console.log(`表 ${table} 当前共 ${affected} 行`);
  } catch { /* ignore */ }
}

// 生产 + 大表 → 双重确认
if (config.isProd && affected > 1000 && !args.includes("--i-know")) {
  console.error(`\n❌ 表有 ${affected} 行，超过 1000。如果确实要批量操作，加 --i-know`);
  process.exit(1);
}

if (dryRun) {
  console.log(`\n[dry-run] 不执行。`);
  process.exit(0);
}

const r = db.prepare(sql).run();
console.log(`\n✅ 执行完成，影响 ${r.changes} 行`);
```

## 3.4 一个必须做的实验

```bash
# ① 开发环境，无 WHERE 的 DELETE
NODE_ENV=development node scripts/dangerous.js "DELETE FROM tickets"
# 期望：警告 + 执行

# ② 生产环境，同样的 SQL
NODE_ENV=production node scripts/dangerous.js "DELETE FROM tickets"
# 期望：拒绝（缺 --confirm-prod）

# ③ 生产环境，加了确认但没 --execute
NODE_ENV=production node scripts/dangerous.js --confirm-prod "DELETE FROM tickets"
# 期望：dry-run，不执行

# ④ 生产环境，加了 --execute
NODE_ENV=production node scripts/dangerous.js --confirm-prod --execute "DELETE FROM tickets"
# 期望：执行（但这需要表 < 1000 行且没有 --i-know）
```

**四步的渐进式确认就是"防手滑"的核心设计。**

**为什么要有这么多层？**

```text
因为真实的误操作是"我以为我在开发环境"。
所以每一层都在问："你确定吗？"
四层确认之后，你至少会看一眼环境。
```

## 3.5 一个更有用的守卫：影响行数阈值

```javascript
// app/lib/db.js 里包一层
export function runGuarded(sql, params = []) {
  const stmt = db.prepare(sql);
  const r = stmt.run(...params);

  // 单条语句影响超过 100 行 → 在生产环境告警
  if (config.isProd && r.changes > 100 && !/^\s*(INSERT)/i.test(sql)) {
    console.error(
      `⚠️  单条语句影响了 ${r.changes} 行（生产环境）\n` +
      `    SQL: ${sql.slice(0, 120)}\n` +
      `    这不是错误，但如果你想确认，去看 logs/app.jsonl`
    );
  }

  return r;
}
```

**这条不是拦截，是"报警"。**

**为什么？** 因为有些合法的批量操作确实要改很多行（比如"给所有客户发通知"）。**拦掉会阻碍正常工作，报警会让你在看到时停一下。**

---

# 第 4 步：数据库指纹（15 分钟）

## 4.1 一个极简但极有效的办法

**启动时打印数据库的"三个唯一标识"：**

```javascript
// app/lib/db.js
export function fingerprint() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS rows,
      MIN(created_at) AS oldest,
      MAX(created_at) AS newest
    FROM tickets
  `).get();

  return {
    file: config.db.file,
    rows: row.rows,
    oldest: row.oldest ? new Date(row.oldest).toISOString().slice(0, 10) : null,
    newest: row.newest ? new Date(row.newest).toISOString().slice(0, 10) : null,
  };
}
```

**启动时打印：**

```text
[db] /var/www/app/data/prod.db
     行数 12,847 | 最早 2026-08-03 | 最新 2026-11-16
```

## 4.2 为什么这三个数字能救命

```text
场景一：你以为连的是生产库
  打印：行数 3 | 最早 2026-11-16 | 最新 2026-11-16
  → 3 行，全是今天的 → 这是空库！ → 立刻停下

场景二：你以为连的是开发库
  打印：行数 12,847 | 最早 2026-08-03
  → 一万多行历史数据 → 这是生产库！ → 立刻停下
```

**比"文件路径对不对"更直观，因为路径可能看起来对但实际指向别的地方（软链接、挂载）。**

**而数据的形状骗不了人。**

## 4.3 加一条"数量异常"告警

```javascript
// 启动时如果行数比上次少了很多，报警
export function checkRowDrop(db, threshold = 0.5) {
  const now = db.prepare(`SELECT COUNT(*) AS n FROM tickets`).get().n;

  const lastFile = "./data/.last-count";
  let last = null;
  try { last = Number(require("node:fs").readFileSync(lastFile, "utf8")); } catch {}

  if (last && now < last * threshold) {
    console.error(
      `\n🚨 数据量异常：上次 ${last} 行，现在 ${now} 行（少了 ${((1 - now / last) * 100).toFixed(0)}%）\n` +
      `   如果这是有意的清理，删掉 ${lastFile} 再启动。\n` +
      `   如果不是，立刻检查是否连错了库。\n`
    );
  }

  require("node:fs").writeFileSync(lastFile, String(now));
  return { last, now };
}
```

**这条能抓住"连了一个更旧的库"这种情况。**

**比如你的生产库有 1 万行，但备份恢复时切到了一个只有 800 行的备份 —— 启动就会报警。**

---

# 第 5 步：写一个"环境自检"页面（15 分钟）

## 5.1 一个只有你能看的页面

```javascript
// app/routes/admin.js
adminRouter.get("/env", (req, res) => {
  const f = fingerprint();
  res.json({
    env: config.env,
    isProd: config.isProd,
    node: process.version,
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    db: f,
    logDir: config.log.dir,
    apiBase: config.model.baseURL,
    model: config.model.primary.name,
    keySet: Boolean(config.model.primary.key),
    backupKeySet: Boolean(config.model.backup.key),
  });
});
```

**加一个简单的鉴权（第 8 周的账号体系里应该有）：**

```javascript
adminRouter.use((req, res, next) => {
  if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
  }
  next();
});
```

## 5.2 部署流程里加一步

**每次部署后，跑这两条：**

```bash
curl -s http://localhost:3000/api/admin/env -H "x-admin-token: $ADMIN_TOKEN" | jq
```

**输出：**

```json
{
  "env": "production",
  "isProd": true,
  "db": {
    "file": "/var/www/app/data/prod.db",
    "rows": 12847,
    "oldest": "2026-08-03",
    "newest": "2026-11-16"
  },
  "keySet": true,
  "backupKeySet": true
}
```

**四件事一次性确认：**

```text
① env = production
② db.file 是绝对路径且指向 prod.db
③ rows = 12847（和昨天差不多）
④ keySet 都是 true
```

**这四行等于"部署正确"的证明。** 写进你的部署脚本里。

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **五个校验各拦住了什么**（逐个试的结果）
- **危险 SQL 的四层确认**（每层的实际行为）
- **数据库指纹长什么样**
- **行数骤降告警怎么试**

---

# 第 7 步：课后练习

## 练习一：加一条"IP 白名单"（20 分钟）

**问题：管理接口暴露在公网，只靠一个 token 保护。**

```javascript
// 用 config 控制允许的 IP
adminIPAllowlist: list("ADMIN_IP_ALLOWLIST", ["127.0.0.1", "::1"]),

// 中间件
adminRouter.use((req, res, next) => {
  const ip = req.ip ?? req.socket.remoteAddress;
  const ok = config.adminIPAllowlist.some((a) => ip.includes(a));
  if (!ok) return res.status(403).json({ ok: false, code: "FORBIDDEN" });
  next();
});
```

**注意：如果前面有 Nginx，`req.ip` 拿到的是 Nginx 的 IP。**

```javascript
// 需要设置 trust proxy
app.set("trust proxy", config.server.trustProxy);
```

**这个坑很常见：你以为白名单生效了，实际上所有人的 IP 都是 127.0.0.1（Nginx）。**

**验证方法：** 从另一台机器访问，看日志里记的 IP 是什么。

## 练习二：算清"三套环境"的维护成本（15 分钟）

```text
每个 .env 文件有多少个变量：____
三套一共要维护多少个值：____
其中真正不同的有几个：____（其余是重复的）
```

**如果"真正不同的"只占 20%，说明你可以用一个基础文件 + 覆盖。**

```bash
# .env.base（共享的）
# .env.production（只有差异）
```

**但注意：多文件继承会让"这个值到底从哪来"变模糊。** 小项目建议就三个独立文件，宁可重复。

**写清你的选择。**

## 练习三：判断这个方案错在哪（15 分钟）

```text
某人的方案：
  if (process.env.NODE_ENV === "production") {
    console.log("生产环境，开始备份");
    backupDatabase();
  }
  // 其他地方都没有环境判断
```

**错在哪？至少四条。**

**参考答案：**

```text
① 环境判断只在一处 → 其余所有危险操作都没有守卫
② NODE_ENV 缺省时走 else → 忘了设置环境就"安全"了，但实际在执行生产代码
③ "备份"这个操作本身没被保护 → 如果 backupDatabase 内部写错了路径，
   它会备份到错误的地方
④ 用 console.log 而不是结构化日志 → 查不到
⑤ 没有"备份失败怎么办" → 静默失败后你以为备份成功了
```

**第 ② 条最阴。** "环境变量没设置"看起来是"安全的默认"，实际上你的进程跑在生产库上，只是它不知道自己是生产。

---

# 第 8 步：最终验收

## A. 环境标识

- [ ] 三个 `.env.development` / `.env.test` / `.env.production` 都有
- [ ] 不再有 `.env`
- [ ] 缺 `NODE_ENV` 会拒绝启动
- [ ] `NODE_ENV=xxx`（非法值）会拒绝启动
- [ ] `package.json` 里的 scripts 已经带了 NODE_ENV
- [ ] Windows 上用 `cross-env`（或确认不需要）

## B. 三条路径都验证过

- [ ] 生产用相对路径 DB_FILE → 拒绝
- [ ] 生产 LOG_LEVEL=debug → 拒绝
- [ ] 生产 API_BASE=localhost → 拒绝
- [ ] 超时不递增 → 拒绝
- [ ] key 是占位符 → 拒绝
- [ ] 目录不可写 → 拒绝（可以用 `chmod` 造）

## C. 危险操作守卫

- [ ] `guardSql` 能识别四种危险 SQL
- [ ] 开发环境：警告 + 执行
- [ ] 生产环境：抛错拒绝
- [ ] `scripts/dangerous.js` 的四层确认都试过
- [ ] 生产默认 dry-run（不加 `--execute` 不执行）
- [ ] 表行数 > 1000 需要 `--i-know`

## D. 数据库指纹

- [ ] 启动时打印路径 / 行数 / 最早 / 最新
- [ ] 我能从这四行 3 秒判断"连对了吗"
- [ ] 行数骤降会报警（自己造一次验证）

## E. 环境自检接口

- [ ] `/api/admin/env` 能返回环境信息
- [ ] 有 token 鉴权（或 IP 白名单）
- [ ] 部署流程里加了这个检查

## F. 提交

```bash
git add -A
git commit -m "第136节：三套环境+启动校验+危险SQL守卫+数据库指纹"
git push
```

---

## 本节课要能说出口的一句话

> **防事故靠的不是"小心"，是"系统拒绝在生产环境做傻事"。**

---

# 附：常见问题速查

**Q：`validateOrExit()` 放在 import 之后，业务模块可能已经读到错配置了？**

A：**这个担心是对的，但影响有限。**

```text
错配置的影响是"用错的值"，不是"崩溃"。
而 validateOrExit() 在 startServer() 之前跑，所以请求还没进来就已经拒绝了。
```

**最干净的做法是单独一个入口文件：**

```javascript
// app/index.js
import "./config/validate-run.js";
import { startServer } from "./server.js";
startServer();
```

**ESM 按 import 顺序执行，`validate-run.js` 会在 `server.js` 之前跑完。**

**Q：我在 Windows 上开发，`NODE_ENV=x cmd` 不 work。**

A：**装 `cross-env`。**

```bash
npm i -D cross-env
```

```json
"dev": "cross-env NODE_ENV=development node --watch app/index.js"
```

**10KB，省你半小时折腾。** 而且团队里只要有一个人用 Windows，就必须装。

**Q：生产环境我真的需要跑危险 SQL 怎么办？**

A：**走 `scripts/dangerous.js`，而不是在应用里加个接口。**

```text
应用里的接口 → 权限控制难、审计难、容易被误调
独立脚本     → 必须 SSH 登录、有 shell history、可加 --dry-run
```

**而且脚本可以要求"先 dry-run 一次，再执行"，这是最有效的人工确认。**

**Q：行数骤降告警会不会误报？**

A：**会。比如你刚清过历史数据。**

**所以它只是"报警"（打印到 stderr），不是"拒绝启动"。** 而且给了明确的"如何消除"：删掉 `.last-count` 文件。

**误报的代价是"看一眼日志"，漏报的代价是"数据没了"。** 这个取舍很明确。

**Q：`/api/admin/env` 暴露了数据库路径，安全吗？**

A：**看你怎么保护它。**

```text
只有 token → 有风险（token 泄露 = 信息泄露）
token + IP 白名单 → 可接受
只在非生产开放 → 最安全，但你就失去了"部署后自检"的能力
```

**推荐 token + IP 白名单。** 而且这个接口不返回 key 的值，只返回 `keySet: true/false`。

**Q：三套环境，我改一个配置要改三个文件，很烦。**

A：**可以在 config 里做"继承"。**

```bash
# .env.development 里写
BASE_CONFIG=.env.base
```

```javascript
// config/index.js 里
const base = process.env.BASE_CONFIG;
if (base) dotenv.config({ path: base });
dotenv.config({ path: `.env.${env}` });   // 后者覆盖前者
```

**但要注意：这会让"这个值到底从哪来"变模糊。**

**判断标准：**

```text
三套环境的差异 > 50%  → 用独立文件（重复也没关系）
三套环境的差异 < 30%  → 用基础文件 + 覆盖
```

**你的场景大概率是后者**（数据库路径、日志级别、key 不同，其他都一样）。
