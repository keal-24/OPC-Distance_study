# 第 77 节课：定时采集记录

> 这节课结束时，你手上有：`collector\run-once.js`（跑一次采集，无论如何都留一行运行记录）、`collector\runs.sql`（运行记录表）、`collector\cron.js`（每 2 分钟自动跑一次）、`collector\show-runs.js`（打印最近几次运行，一眼看出哪次失败、失败在第几步），以及 `collector\data\runs-report.md`。

**建议用时**：115 分钟
**前置**：第 76 节课的 `collector\upsert.js` 和 `data\app.db`（30 条，可反复跑）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你会手动跑一条命令：

```text
node upsert.js
```

跑完看一眼输出：`新增 0 / 更新 0 / 未变化 30`。对了，关掉终端。

**你会的这一套，全靠你在场。**

## 0.2 今天这个坑长什么样

> 你把采集脚本交给客户，说"每天自动更新"。
>
> 你用了系统自带的定时功能，设了每天凌晨 3 点。
>
> 一周后客户说："数据三天没更新了。"
>
> 你打开电脑，跑了一遍 `node upsert.js`：**一切正常，30 条，0 新增。**
>
> 你不知道该说什么。因为：
>
> ```text
> 你想知道 —— 昨天凌晨 3 点跑了吗？
> 你想知道 —— 如果跑了，跑成功了吗？
> 你想知道 —— 如果没跑成，错在哪一步？
> 你想知道 —— 抓了几条？写进去几条？失败了几个？
> ```
>
> **一个都答不上来。** 你的脚本什么都没留下。

**这就是"没有运行记录"的代价：出问题时，你连"到底有没有跑"都不知道。**

**这一节要建立的三个认知：**

| 认知 | 具体是什么 |
|---|---|
| **能定时跑** | 不是你手动敲命令，是到点自己跑 |
| **跑完留痕** | 每次运行在数据库里留一行：何时开始、何时结束、抓到几条、成功几条、失败几条、失败原因 |
| **能查历史** | 一条 SQL 就能看出"最近五次哪次是坏的" |

**这三件事缺一个，你的采集就还是"玩具"。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 定时任务（cron） | "每天凌晨 3 点执行这个命令"的规则 | 第 2、4 步 |
| 运行记录（run log） | 每次执行写一行，记下这次的结果 | 第 1 步建表 |
| 幂等（idempotent） | 同一件事做一次和做一百次，结果一样 | 第 3 步，把第 76 节的写入包进一次"运行" |

**为什么"运行记录"必须存在数据库里，不能只写日志文件：**

```text
日志文件     → 只能"看"，不能"查"。你想问"上周有几次失败"，
               得写脚本 grep 一遍，还不一定能对上。
数据库表     → 一行 SQL：SELECT * FROM runs WHERE status='failed'
               能排序、能统计、能画图、能和业务表 JOIN。
```

**日志文件留着（排错要看原始报错），但"这次跑得怎么样"必须进表。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `runs.sql` | `第07节课\03-练习代码\collector\` | 运行记录表的建表语句（单独存一份，方便重建） |
| `run-once.js` | 同上 | 跑一次完整采集：抓 → 存 → 写库 → 写运行记录 |
| `show-runs.js` | 同上 | 打印最近 N 次运行 + 按状态汇总 |
| `cron.js` | 同上 | 每 2 分钟自动跑一次 |
| `report-runs.js` | 同上 | 导出 `data\runs-report.md` |
| `data\runs-report.md` | 同上 `data\` | 五次运行对照表 + 三条结论 |
| `NOTES.md` | `第07节课\02-笔记\` | 第 7 步填 |

---

# 第 1 步：先建运行记录表（20 分钟）

## 1.1 做什么 / 为什么

**做什么：** 建 `runs` 表，定义"一次运行"要记哪些字段。

**为什么先建表，不先写代码：**

因为**表结构决定了你能问出什么问题。**

```text
只有 started_at 和 status
  → 只能问"几点跑的、成没成"

加上 inserted / updated / failed
  → 能问"哪一次抓到的数据量突然少了一半"（数据源出问题的最早信号）

加上 step
  → 能问"失败集中在哪一步"（十次失败里八次在写库，说明是数据库的问题）

加上 error
  → 能问"最常见的错误是什么"（决定你先修哪个）
```

**字段是事后加不上的。** 你跑了三个月之后想加 `step` 字段，前三个月的数据全是空的，你拿不到"历史分布"。**所以第一次建表就要把该记的都记上。**

## 1.2 操作

**1.** 复制上一节的项目：

```text
cd "B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第07节课\03-练习代码"
xcopy /E /I /Y "..\第06节课\03-练习代码\collector" collector
cd collector
del dedup-compare.js url-trap.js wrong-replace.js wrong-hash.js wrong-skip.js wrong-tx.js peek.js
```

**2.** 新建 `runs.sql`：

```sql
-- runs.sql —— 一次采集 = 一行。可以随时重建，不影响 items 表。
CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    TEXT    NOT NULL,
  finished_at   TEXT,
  status        TEXT    NOT NULL,
  step          TEXT    NOT NULL,
  fetched       INTEGER NOT NULL DEFAULT 0,
  inserted      INTEGER NOT NULL DEFAULT 0,
  updated       INTEGER NOT NULL DEFAULT 0,
  unchanged     INTEGER NOT NULL DEFAULT 0,
  failed        INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs (started_at DESC);
```

**3.** 在 `db.js` 末尾加上建这张表：

```javascript
const fs2 = require("fs");
const runsSql = fs2.readFileSync(path.join(__dirname, "runs.sql"), "utf8");
db.exec(runsSql);

console.log("runs 表已就绪");
```

完整顺序是：先 `db.exec` 建 `items`，再读 `runs.sql` 建 `runs`。**把 SQL 单独放一个文件的好处是：数据库坏了，你打开这个文件就能重建，不用在 JS 里翻字符串。**

**4.** 新建 `show-tables.js`，确认两张表都在：

```javascript
const db = require("./db");

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all();
console.log("=== 表 ===");
for (const t of tables) console.log("  " + t.name);

console.log("");
console.log("=== runs 表结构 ===");
const cols = db.prepare("PRAGMA table_info(runs)").all();
for (const c of cols) {
  console.log(
    "  " + c.name.padEnd(12) +
    " " + c.type.padEnd(8) +
    (c.notnull ? " NOT NULL" : "") +
    (c.dflt_value === null ? "" : " DEFAULT " + c.dflt_value)
  );
}
```

## 1.3 屏幕上应该看到什么

```text
>node show-tables.js
数据库：B:\...\collector\data\app.db
items 表已就绪
runs 表已就绪
=== 表 ===
  items
  runs

=== runs 表结构 ===
  id            INTEGER  NOT NULL
  started_at    TEXT     NOT NULL
  finished_at   TEXT
  status        TEXT     NOT NULL
  step          TEXT     NOT NULL
  fetched       INTEGER  NOT NULL DEFAULT 0
  inserted      INTEGER  NOT NULL DEFAULT 0
  updated       INTEGER  NOT NULL DEFAULT 0
  unchanged     INTEGER  NOT NULL DEFAULT 0
  failed        INTEGER  NOT NULL DEFAULT 0
  duration_ms   INTEGER
  error         TEXT
```

**注意 `id` 那一行显示 `NOT NULL`** —— `PRAGMA table_info` 对 `INTEGER PRIMARY KEY` 会报 `notnull=1`，这是 SQLite 的正常行为（主键永远不能是 null）。

**`finished_at`、`duration_ms`、`error` 三列没有 `NOT NULL`。** 这是故意的：

```text
还没跑完      → finished_at 是 null
跑到一半崩了  → error 有值，finished_at 也是 null
正常跑完      → finished_at 有值，error 是 null
```

**"null 表示什么"必须在建表时就想清楚。** 这里 null 的意思是"这件事还没发生"，不是"这件事的结果是空"。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `no such table: runs` | `db.js` 里 `runs.sql` 没读到 | 确认 `runs.sql` 和 `db.js` 在同一个目录 |
| `ENOENT: no such file or directory, open '...runs.sql'` | 文件名拼错，或用了相对路径 | 用 `path.join(__dirname, "runs.sql")` |
| `table runs already exists` | 用了 `CREATE TABLE` 而不是 `IF NOT EXISTS` | 改 SQL |
| 字段类型全是 `INTEGER`/`TEXT` | 正常，SQLite 只有五种存储类型 | 不是错误 |

---

# 第 2 步：把采集包成"一次运行"（30 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `run-once.js`，把"抓取 → 写库"包进一次运行，并且**不管成功失败，都要留一行记录**。

**为什么叫"一次运行"而不是"一次采集"：**

因为**"运行"包含了"失败"。**

```text
"采集"这个词，你脑子里默认它成功了
"运行"这个词，包含"跑了一次，可能成功可能失败"
```

这个命名不是文字游戏。它会改变你写代码的方式：

```text
// 写成"采集"的人，代码长这样
const data = await fetchAll();
upsert(data);

// 写成"运行"的人，代码长这样
const runId = startRun();
try {
  const data = await fetchAll();
  upsert(data);
  finishRun(runId, "success", {...});
} catch (err) {
  finishRun(runId, "failed", { error: err.message });
  throw err;
}
```

**第二种写法，失败时你的库里有一行记录说"这次失败了，错在 fetch 这一步"。第一种写法，失败时你什么都没有。**

## 2.2 操作

**1.** 装 `node-cron`：

```text
npm install node-cron
```

**2.** 新建 `run-once.js`：

```javascript
// run-once.js —— 跑一次完整采集，无论如何都留一行运行记录
// 用法：node run-once.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const SOURCE = "mock";
const BASE = "http://localhost:3001";
const OUT = path.join(__dirname, "items-paged.json");

function nowIso() {
  return new Date().toISOString();
}

// ---------- 运行记录 ----------
const insertRun = db.prepare(`
  INSERT INTO runs (started_at, status, step)
  VALUES (?, 'running', 'start')
`);

const updateRun = db.prepare(`
  UPDATE runs
     SET finished_at = @finished_at,
         status      = @status,
         step        = @step,
         fetched     = @fetched,
         inserted    = @inserted,
         updated     = @updated,
         unchanged   = @unchanged,
         failed      = @failed,
         duration_ms = @duration_ms,
         error       = @error
   WHERE id = @id
`);

function startRun() {
  const info = insertRun.run(nowIso());
  return Number(info.lastInsertRowid);
}

function finishRun(id, startedAt, fields) {
  updateRun.run({
    id: id,
    finished_at: nowIso(),
    status: fields.status,
    step: fields.step,
    fetched: fields.fetched === undefined ? 0 : fields.fetched,
    inserted: fields.inserted === undefined ? 0 : fields.inserted,
    updated: fields.updated === undefined ? 0 : fields.updated,
    unchanged: fields.unchanged === undefined ? 0 : fields.unchanged,
    failed: fields.failed === undefined ? 0 : fields.failed,
    duration_ms: Date.now() - startedAt,
    error: fields.error === undefined ? null : String(fields.error).slice(0, 800),
  });
}

// ---------- 抓取 ----------
async function fetchPage(page, size) {
  const url = BASE + "/api/items?page=" + page + "&size=" + size;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error("抓第 " + page + " 页失败：HTTP " + res.status);
  }
  return res.json();
}

async function fetchAll() {
  const all = [];
  let page = 1;
  while (true) {
    const body = await fetchPage(page, 10);
    if (body.data.length === 0) break;
    all.push(...body.data);
    if (body.has_next === false) break;
    page += 1;
    if (page > 100) throw new Error("超过 100 页，终止条件写错了");
    await new Promise((r) => setTimeout(r, 300));
  }
  return all;
}

// ---------- 写入（沿用第 76 节逻辑）----------
function contentHash(row) {
  const payload = JSON.stringify({
    title: row.title,
    price: row.price,
    published_at: row.published_at,
    url: row.url,
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

const selectBySourceId = db.prepare(
  "SELECT id, content_hash FROM items WHERE source = ? AND source_id = ?"
);

const insertStmt = db.prepare(`
  INSERT INTO items (source, source_id, title, price, published_at, url, content_hash, created_at, updated_at)
  VALUES (@source, @source_id, @title, @price, @published_at, @url, @content_hash, @now, @now)
`);

const updateStmt = db.prepare(`
  UPDATE items
     SET title = @title, price = @price, published_at = @published_at,
         url = @url, content_hash = @content_hash, updated_at = @now
   WHERE source = @source AND source_id = @source_id
`);

const touchStmt = db.prepare(
  "UPDATE items SET updated_at = ? WHERE source = ? AND source_id = ?"
);

function upsertAll(rows) {
  const stat = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const run = db.transaction((list) => {
    for (const row of list) {
      try {
        const sourceId = String(row.id);
        const hash = contentHash(row);
        const now = nowIso();
        const exist = selectBySourceId.get(SOURCE, sourceId);

        if (exist === undefined) {
          insertStmt.run({
            source: SOURCE, source_id: sourceId,
            title: row.title,
            price: row.price === undefined ? null : row.price,
            published_at: row.published_at === undefined ? null : row.published_at,
            url: row.url === undefined ? null : row.url,
            content_hash: hash, now: now,
          });
          stat.inserted += 1;
        } else if (exist.content_hash === hash) {
          touchStmt.run(now, SOURCE, sourceId);
          stat.unchanged += 1;
        } else {
          updateStmt.run({
            source: SOURCE, source_id: sourceId,
            title: row.title,
            price: row.price === undefined ? null : row.price,
            published_at: row.published_at === undefined ? null : row.published_at,
            url: row.url === undefined ? null : row.url,
            content_hash: hash, now: now,
          });
          stat.updated += 1;
        }
      } catch (err) {
        stat.failed += 1;
      }
    }
  });
  run(rows);
  return stat;
}

// ---------- 主流程 ----------
async function main() {
  const startedAt = Date.now();
  const runId = startRun();
  console.log("运行编号：" + runId + "，开始于 " + nowIso());

  let step = "fetch";
  let fetched = 0;

  try {
    const rows = await fetchAll();
    fetched = rows.length;
    console.log("抓取完成：" + fetched + " 条");

    step = "save";
    fs.writeFileSync(OUT, JSON.stringify(rows, null, 2), "utf8");
    console.log("已写入 " + OUT);

    step = "upsert";
    const stat = upsertAll(rows);
    console.log(
      "写入完成：新增 " + stat.inserted +
      " / 更新 " + stat.updated +
      " / 未变化 " + stat.unchanged +
      " / 失败 " + stat.failed
    );

    step = "done";
    const status = stat.failed > 0 ? "partial" : "success";
    finishRun(runId, startedAt, {
      status: status,
      step: step,
      fetched: fetched,
      inserted: stat.inserted,
      updated: stat.updated,
      unchanged: stat.unchanged,
      failed: stat.failed,
    });
    console.log("运行 " + runId + " 结束：status=" + status);
    return 0;
  } catch (err) {
    const detail = err.cause === undefined
      ? err.message
      : err.message + " / " + (err.cause.message || err.cause.code || err.cause);
    finishRun(runId, startedAt, {
      status: "failed",
      step: step,
      fetched: fetched,
      error: detail,
    });
    console.error("运行 " + runId + " 失败在 [" + step + "]：" + detail);
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
```

**3.** 确认 mock-server 在跑，然后：

```text
node run-once.js
```

## 2.3 屏幕上应该看到什么

```text
>node run-once.js
数据库：B:\...\collector\data\app.db
items 表已就绪
runs 表已就绪
运行编号：1，开始于 2026-11-16T08:42:10.114Z
抓取完成：30 条
已写入 B:\...\collector\items-paged.json
写入完成：新增 0 / 更新 0 / 未变化 30 / 失败 0
运行 1 结束：status=success
```

数据库里现在多一行：

```sql
SELECT id, status, step, fetched, inserted, unchanged, duration_ms FROM runs;
-- 1 | success | done | 30 | 0 | 30 | 1683
```

**注意 `duration_ms` 是 `1683`。** 30 条抓了三页，每页间隔 300ms，加起来 1.6 秒左右。**这个数字是你以后判断"变慢了吗"的基线。**

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `ECONNREFUSED ::1:3001` | mock-server 没起 | 另开一个终端 `node mock-server.js` |
| `运行 1 失败在 [fetch]` | 同上 | 同上 |
| `抓取完成：0 条` | 服务刚重启，数据被 reset 成空 | `node reset.js` 或重启 mock-server |
| `node-cron` 装不上 | 网络或权限 | 先不管，第 4 步才用它 |
| `runs` 表里 `fetched` 是 0 但实际抓到 30 | `finishRun` 没传 `fetched` | 检查 `finishRun` 的第三个参数 |
| `lastInsertRowid` 报类型错误 | `better-sqlite3` 返回 BigInt | `Number(info.lastInsertRowid)` |

---

# 第 3 步：故意让它失败，看记录有没有用（20 分钟）

## 3.1 做什么 / 为什么

**做什么：** 制造三种失败，看 `runs` 表能不能准确定位。

**为什么必须主动制造失败：**

一条"成功记录"只能证明程序会跑。**你真正需要的是"失败时能立刻知道错在哪"。** 而这个能力，只有在真的失败过之后才能确认。

**三种失败，三种特征：**

| 失败类型 | 怎么造 | 记录里应该能看出什么 |
|---|---|---|
| 网络层 | 关掉 mock-server | `step=fetch`，`error` 里有 `ECONNREFUSED` |
| 数据层 | 让某一条记录违反 NOT NULL | `status=partial`，`failed` 大于 0 |
| 超时 | 改小超时时间打 `/slow` | `step=fetch`，`error` 里有 `timeout` |

## 3.2 操作

**第 1 小步：关掉 mock-server。**

在跑 mock-server 的那个终端按 `Ctrl + C`，然后：

```text
node run-once.js
```

**屏幕上应该看到什么：**

```text
>node run-once.js
运行编号：2，开始于 2026-11-16T08:45:02.331Z
运行 2 失败在 [fetch]：fetch failed / connect ECONNREFUSED ::1:3001
```

**如果你看到 `error` 里只有 `fetch failed`，没有后面的 `ECONNREFUSED`**，那是没取 `err.cause`。上面的代码已经处理了，照抄即可。

**为什么一定要取 `err.cause`：** Node 的 `fetch` 把底层错误包了一层，`err.message` 永远只是 `fetch failed`。**真正的原因在 `err.cause` 里，不取出来你就等于没有错误信息。**

**`step=fetch` + `ECONNREFUSED` 这两个信息一起，你立刻知道"服务器没开"，不需要看任何日志。**

**第 2 小步：重启 mock-server，制造数据层失败。**

在 `upsertAll` 的 `for` 循环里加两行临时代码，把第 3 条记录的标题设成 null：

```javascript
// 临时代码，验证 partial 状态用，看完删掉
if (row.id === 3) {
  row.title = null;
}
```

跑：

```text
node run-once.js
```

**屏幕上应该看到什么：**

```text
>node run-once.js
运行编号：3，开始于 2026-11-16T08:48:15.702Z
抓取完成：30 条
已写入 B:\...\collector\items-paged.json
写入完成：新增 0 / 更新 0 / 未变化 29 / 失败 1
运行 3 结束：status=partial
```

```sql
SELECT id, status, step, fetched, unchanged, failed FROM runs WHERE id = 3;
-- 3 | partial | done | 30 | 29 | 1
```

**`fetched=30` 但只有 29 条处理成功，`failed=1`。这三个数字一对照，问题定位完成。**

**`partial` 这个状态是整个第 77 节课最有价值的设计。** 没有它，你就只有"成功"和"失败"两种，而这批 29/30 的数据既不算成功也不算失败，你无法表达它，只能塞进其中一边说谎。

**第 3 小步：制造超时。**

把 `fetchPage` 里两处临时改掉：

```javascript
const url = BASE + "/slow";                                            // 改成打 /slow
const res = await fetch(url, { signal: AbortSignal.timeout(1000) });    // 1 秒就超时
```

```text
>node run-once.js
运行编号：4，开始于 2026-11-16T08:50:44.019Z
运行 4 失败在 [fetch]：The operation was aborted due to timeout
```

**超时和连接拒绝的区别，在 `error` 文本里第一眼就能看出来。** 这个区别很重要：

```text
ECONNREFUSED  → 对方没开      → 你去把服务起起来
timeout       → 对方开着但慢  → 要么延长超时，要么降低频率，要么换数据源
```

**处理方式完全不同。所以这两件事必须能被区分。**

**做完记得改回去：**

```javascript
const url = BASE + "/api/items?page=" + page + "&size=" + size;
const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
```

并把 `if (row.id === 3)` 那段删掉。

## 3.3 屏幕上应该看到什么

跑第 4 步写的 `show-runs.js`，四次运行的对照应该长这样：

```text
>node show-runs.js
=== 最近 4 次运行 ===
编号  开始时间             状态      步骤   抓到  新增  更新  未变  失败  耗时     错误
4     11-16 16:50:44      failed    fetch  0     0     0     0     0     1021     The operation was aborted due to time
3     11-16 16:48:15      partial   done   30    0     0     29    1     1712     -
2     11-16 16:45:02      failed    fetch  0     0     0     0     0     1108     fetch failed / connect ECONNREFUSED :
1     11-16 16:42:10      success   done   30    0     0     30    0     1683     -

=== 按状态汇总 ===
  failed     2 次  累计抓到 0     累计失败记录 0
  partial    1 次  累计抓到 30    累计失败记录 1
  success    1 次  累计抓到 30    累计失败记录 0
```

**这张表就是"运行记录"的全部价值。**

```text
第 2 次 fetch 失败 → ECONNREFUSED，能直接定位到"服务器没开"
第 3 次 partial    → 数据进去了 29 条，1 条有问题
第 4 次 timeout    → 和 ECONNREFUSED 完全不同的处理方式
```

**没有这张表，这四次运行在你这儿是同一句话："好像没成功"。**

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `error` 只有 `fetch failed` | 没取 `err.cause` | 用课件里 `detail` 的写法 |
| 关了服务器还能跑成功 | 你关错了终端 | `netstat -ano \| findstr :3001` 确认端口没监听 |
| `partial` 记成了 `success` | `stat.failed > 0` 的判断写错 | 检查三元表达式 |
| `failed=1` 但 `fetched=0` | catch 里没传 `fetched` | 检查 catch 分支 |
| 超时测试没触发 | 默认超时 8 秒，`/slow` 只有 5 秒 | 改成 1000ms |
| 关掉 mock-server 后 `run-once` 卡住不返回 | 没有超时设置 | 必须有 `AbortSignal.timeout` |

---

# 第 4 步：让它自己跑起来（25 分钟）

## 4.1 做什么 / 为什么

**做什么：** 用 `node-cron` 每 2 分钟跑一次 `run-once`，观察记录累积。

**为什么先用 2 分钟而不是"每天凌晨 3 点"：**

因为**你现在是在验证，不是在部署。**

```text
设成每天凌晨 3 点  → 你要等一整天才知道对不对
设成每 2 分钟      → 你在旁边喝口水就能看到三四次运行
```

**这个习惯要养成：任何定时任务，先在"分钟级"验证逻辑，再改成"天级"上线。** 反过来做，你每次改一行代码都要等一天才能验证。

## 4.2 操作

**1.** 新建 `show-runs.js`：

```javascript
// show-runs.js —— 打印最近 N 次运行
// 用法：node show-runs.js [条数]
const db = require("./db");

const limit = Number(process.argv[2] === undefined ? 5 : process.argv[2]);

function pad(s, n) {
  const str = String(s === null ? "-" : s);
  let width = 0;
  for (const ch of str) width += ch.charCodeAt(0) > 255 ? 2 : 1;
  let out = str;
  while (width < n) {
    out += " ";
    width += 1;
  }
  return out;
}

function shortTime(iso) {
  if (iso === null) return "-";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

const rows = db
  .prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?")
  .all(limit);

console.log("=== 最近 " + rows.length + " 次运行 ===");
console.log(
  pad("编号", 6) + pad("开始时间", 20) + pad("状态", 10) + pad("步骤", 7) +
  pad("抓到", 6) + pad("新增", 6) + pad("更新", 6) + pad("未变", 6) +
  pad("失败", 6) + pad("耗时", 8) + "错误"
);

for (const r of rows) {
  console.log(
    pad(r.id, 6) + pad(shortTime(r.started_at), 20) + pad(r.status, 10) + pad(r.step, 7) +
    pad(r.fetched, 6) + pad(r.inserted, 6) + pad(r.updated, 6) + pad(r.unchanged, 6) +
    pad(r.failed, 6) + pad(r.duration_ms, 8) +
    (r.error === null ? "-" : r.error.slice(0, 40))
  );
}

console.log("");
const agg = db
  .prepare(`
    SELECT status, COUNT(*) AS n,
           SUM(fetched) AS fetched,
           SUM(failed) AS failed
      FROM runs
     GROUP BY status
     ORDER BY n DESC
  `)
  .all();
console.log("=== 按状态汇总 ===");
for (const a of agg) {
  console.log("  " + pad(a.status, 10) + " 次数 " + pad(a.n, 4) +
    " 累计抓到 " + pad(a.fetched, 6) + " 累计失败记录 " + a.failed);
}
```

**2.** 新建 `cron.js`：

```javascript
// cron.js —— 每 2 分钟跑一次采集。Ctrl + C 停止。
const cron = require("node-cron");
const path = require("path");
const { spawn } = require("child_process");

const SCRIPT = path.join(__dirname, "run-once.js");

function stamp() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

console.log("[" + stamp() + "] 定时任务已启动：每 2 分钟执行一次");
console.log("[" + stamp() + "] 脚本：" + SCRIPT);
console.log("[" + stamp() + "] 按 Ctrl + C 停止");

// 每 2 分钟的第 0 秒执行
cron.schedule("*/2 * * * *", () => {
  console.log("");
  console.log("[" + stamp() + "] ===== 触发 =====");

  const child = spawn(process.execPath, [SCRIPT], {
    cwd: __dirname,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    console.log("[" + stamp() + "] 子进程退出，code=" + code);
  });

  child.on("error", (err) => {
    console.error("[" + stamp() + "] 启动子进程失败：" + err.message);
  });
});
```

**3.** 跑起来：

```text
node cron.js
```

**4.** 让它跑 8 分钟左右（大约四次触发），然后 `Ctrl + C`，再查：

```text
node show-runs.js 10
```

## 4.3 屏幕上应该看到什么

`cron.js` 的终端：

```text
>node cron.js
[2026/11/16 16:52:03] 定时任务已启动：每 2 分钟执行一次
[2026/11/16 16:52:03] 脚本：B:\...\collector\run-once.js
[2026/11/16 16:52:03] 按 Ctrl + C 停止

[2026/11/16 16:54:00] ===== 触发 =====
数据库：B:\...\collector\data\app.db
items 表已就绪
runs 表已就绪
运行编号：5，开始于 2026-11-16T08:54:00.117Z
抓取完成：30 条
已写入 B:\...\collector\items-paged.json
写入完成：新增 0 / 更新 0 / 未变化 30 / 失败 0
运行 5 结束：status=success
[2026/11/16 16:54:01] 子进程退出，code=0

[2026/11/16 16:56:00] ===== 触发 =====
...
运行 6 结束：status=success
[2026/11/16 16:56:01] 子进程退出，code=0
```

`show-runs.js` 输出：

```text
>node show-runs.js 10
=== 最近 8 次运行 ===
编号  开始时间             状态      步骤   抓到  新增  更新  未变  失败  耗时    错误
8     11-16 17:00:00      success   done   30    0     0     30    0     1640    -
7     11-16 16:58:00      success   done   30    0     0     30    0     1655    -
6     11-16 16:56:00      success   done   30    0     0     30    0     1651    -
5     11-16 16:54:00      success   done   30    0     0     30    0     1647    -
4     11-16 16:50:44      failed    fetch  0     0     0     0     0     1021    The operation was aborted due to time
3     11-16 16:48:15      partial   done   30    0     0     29    1     1712    -
2     11-16 16:45:02      failed    fetch  0     0     0     0     0     1108    fetch failed / connect ECONNREFUSED :
1     11-16 16:42:10      success   done   30    0     0     30    0     1683    -

=== 按状态汇总 ===
  success    5 次  累计抓到 150   累计失败记录 0
  failed     2 次  累计抓到 0     累计失败记录 0
  partial    1 次  累计抓到 30    累计失败记录 1
```

**注意"耗时"那一列：1640 / 1655 / 1651 / 1647，稳定在 1.65 秒左右。**

**这个稳定值就是你的基线。** 哪天它突然变成 8000，你就知道数据源变慢或者条数变多了 —— **而不是"今天好像有点慢"。**

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 一直不触发 | cron 表达式写错 | `*/2 * * * *` 是每 2 分钟；`* */2 * * *` 是每 2 小时，看着像其实不同 |
| 到点触发两次 | 你开了两个 `cron.js` 终端 | `tasklist \| findstr node` 查，关掉多余的 |
| `Cannot find module 'node-cron'` | 没装，或不在 `collector` | `npm install node-cron` |
| 跑完 `code=1` | `run-once.js` 返回了 1，说明有失败 | 看 `show-runs.js` 最后一次的错误 |
| `cron.js` 一关就停 | 这就是 `node-cron` 的工作方式，见 4.5 | 用任务计划 |
| 中文全是问号 | cmd 编码 | `chcp 65001` |

## 4.5 为什么 `node-cron` 不够，什么时候要换 Windows 任务计划

**`node-cron` 的本质：在 `node cron.js` 这个进程里，自己数时间。**

```text
node cron.js 启动  → 进程活着 → 到点触发
电脑重启           → 进程没了 → 什么都不发生
关掉终端           → 进程没了 → 什么都不发生
程序崩了           → 进程没了 → 什么都不发生，而且你不会知道
```

**它不管"进程活不活"，只管"时间到没到"。**

| 场景 | 用什么 | 理由 |
|---|---|---|
| 你自己电脑上验证逻辑 | `node-cron` | 分钟级验证，改完立刻看 |
| 一台长期开着的服务器，用 pm2 / systemd 托管 | `node-cron` | 进程有人保活，崩了会重启 |
| 你的 Windows 电脑，要"重启也照跑" | **Windows 任务计划** | 由系统负责，不依赖你的终端 |
| 需要能看历史、能手动重跑的界面 | 任务计划 + 你的 `runs` 表 | 系统管调度，你管记录 |

**Windows 任务计划怎么设（命令行，不用点鼠标）：**

```text
schtasks /Create /TN "opc-collector" /TR "node B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第07节课\03-练习代码\collector\run-once.js" /SC DAILY /ST 03:00 /F
```

几个关键细节：

```text
/TR 里的路径必须是绝对路径，整条命令要用引号包住
如果 node 不在系统 PATH 里，要写 node.exe 的完整路径
默认是"只在用户登录时运行"，要改成"不管用户是否登录都运行"，
      得在图形界面里勾，或者用 /RU SYSTEM（要管理员权限）
```

查看、手动触发、删除：

```text
schtasks /Query /TN "opc-collector" /V /FO LIST
schtasks /Run   /TN "opc-collector"
schtasks /Delete /TN "opc-collector" /F
```

**注意：任务计划跑起来时，你的 `runs` 表照样有记录 —— 因为记录是写在 `run-once.js` 里的，跟谁启动它无关。**

**这就是为什么第 2 步要把"记录"写进脚本，而不是写进 `cron.js`。** 换调度器时，记录逻辑一行都不用改。

---

# 第 5 步：把五次运行变成一份能交出去的报告（15 分钟）

## 5.1 做什么 / 为什么

**做什么：** 用 SQL 生成 `data\runs-report.md`，包含"最近五次对照"和三条结论。

**为什么要有"结论"这一节：**

```text
只有表格     → 客户看不懂，你自己三个月后也看不懂
表格 + 结论  → "最近五次全部成功，平均耗时 1.65 秒，
                早期有 2 次因服务器未启动失败，已改为任务计划"
```

**这第二行才是交付物。**

## 5.2 操作

新建 `report-runs.js`：

```javascript
// report-runs.js —— 把运行记录导出成一份 markdown
const fs = require("fs");
const path = require("path");
const db = require("./db");

const rows = db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 5").all();

const agg = db
  .prepare(`
    SELECT status, COUNT(*) AS n, MIN(duration_ms) AS min_ms, MAX(duration_ms) AS max_ms,
           AVG(duration_ms) AS avg_ms
      FROM runs
     WHERE duration_ms IS NOT NULL
     GROUP BY status
  `)
  .all();

const total = db.prepare("SELECT COUNT(*) AS n FROM runs").get().n;
const failedN = db.prepare("SELECT COUNT(*) AS n FROM runs WHERE status='failed'").get().n;

const lines = [];
lines.push("# 采集运行报告");
lines.push("");
lines.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
lines.push("");

lines.push("## 最近五次运行");
lines.push("");
lines.push("| 编号 | 开始时间 | 状态 | 步骤 | 抓到 | 新增 | 更新 | 未变 | 失败 | 耗时(ms) | 错误 |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  lines.push(
    "| " + r.id +
    " | " + (r.started_at === null ? "-" : r.started_at) +
    " | " + r.status +
    " | " + r.step +
    " | " + r.fetched +
    " | " + r.inserted +
    " | " + r.updated +
    " | " + r.unchanged +
    " | " + r.failed +
    " | " + (r.duration_ms === null ? "-" : r.duration_ms) +
    " | " + (r.error === null ? "-" : r.error.replace(/\|/g, "\\|")) +
    " |"
  );
}
lines.push("");

lines.push("## 按状态汇总");
lines.push("");
lines.push("| 状态 | 次数 | 最短 | 最长 | 平均 |");
lines.push("|---|---|---|---|---|");
for (const a of agg) {
  lines.push(
    "| " + a.status + " | " + a.n +
    " | " + (a.min_ms === null ? "-" : Math.round(a.min_ms)) +
    " | " + (a.max_ms === null ? "-" : Math.round(a.max_ms)) +
    " | " + (a.avg_ms === null ? "-" : Math.round(a.avg_ms)) +
    " |"
  );
}
lines.push("");

lines.push("## 结论");
lines.push("");
lines.push("1. 累计运行 " + total + " 次，其中 failed " + failedN + " 次，成功率 " +
  (total === 0 ? "-" : Math.round(((total - failedN) / total) * 100) + "%") + "。");
lines.push("2. 失败全部集中在 fetch 步骤，原因为「服务器未启动」和「人工制造超时」，不是代码缺陷。");
lines.push("3. 成功运行的耗时稳定在 1.6–1.7 秒区间，说明数据量和网络状况没有变化。");
lines.push("");

const out = path.join(__dirname, "data", "runs-report.md");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log("已写入 " + out);
```

```text
node report-runs.js
```

## 5.3 屏幕上应该看到什么

`data\runs-report.md` 的内容：

```markdown
# 采集运行报告

生成时间：2026/11/16 17:05:22

## 最近五次运行

| 编号 | 开始时间 | 状态 | 步骤 | 抓到 | 新增 | 更新 | 未变 | 失败 | 耗时(ms) | 错误 |
|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 2026-11-16T09:00:00.233Z | success | done | 30 | 0 | 0 | 30 | 0 | 1640 | - |
| 7 | 2026-11-16T08:58:00.115Z | success | done | 30 | 0 | 0 | 30 | 0 | 1655 | - |
| 6 | 2026-11-16T08:56:00.402Z | success | done | 30 | 0 | 0 | 30 | 0 | 1651 | - |
| 5 | 2026-11-16T08:54:00.117Z | success | done | 30 | 0 | 0 | 30 | 0 | 1647 | - |
| 4 | 2026-11-16T08:50:44.019Z | failed | fetch | 0 | 0 | 0 | 0 | 0 | 1021 | The operation was aborted due to timeout |

## 按状态汇总

| 状态 | 次数 | 最短 | 最长 | 平均 |
|---|---|---|---|---|
| success | 4 | 1640 | 1683 | 1655 |
| failed | 2 | 1021 | 1108 | 1065 |
| partial | 1 | 1712 | 1712 | 1712 |

## 结论

1. 累计运行 8 次，其中 failed 2 次，成功率 75%。
2. 失败全部集中在 fetch 步骤，原因为「服务器未启动」和「人工制造超时」，不是代码缺陷。
3. 成功运行的耗时稳定在 1.6–1.7 秒区间，说明数据量和网络状况没有变化。
```

**注意"结论"第 2 条** —— 这句话不是自动生成的，是你**看过数据之后写进去的判断**。脚本把它固定成文本，是因为这份报告是给人看的，不是给程序读的。

**换了项目，这三条结论要重写。** 不要把它当模板套。

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 表格里列被冲乱 | 错误信息里有竖线没转义 | 代码里已经 `.replace(/\|/g, "\\|")` |
| 「成功运行的耗时」数字不对 | 那一条是人工写的，不是算出来的 | 先看 `show-runs.js` 的真实数字再改 |
| `ENOENT` 写文件失败 | `data` 目录不存在 | `db.js` 已经建了，确认 `require("./db")` 在最前面 |

---

# 第 6 步：故意犯四个错（15 分钟）

## 错误 1：把运行记录写成 `console.log`

```javascript
// 很多人的第一版
async function main() {
  console.log("开始采集", new Date());
  const data = await fetchAll();
  console.log("抓到", data.length, "条");
  upsert(data);
  console.log("完成", new Date());
}
```

**现象：** 你看得见，但只能在那个终端里看。终端一关，全没了。

**真正的伤害：** 三个月后客户问"上周有几天没更新"，你答不上来。**你没有任何可以查询的历史。**

**怎么查：** 试着回答这四个问题，如果你的答案是"我得去翻终端记录"，就是踩了这个坑。

```text
上个月运行了多少次？
失败了几次？
失败集中在哪一步？
平均耗时多少？
```

**这四个问题，只有数据库表能秒答。**

## 错误 2：只在成功时写记录

```javascript
try {
  const data = await fetchAll();
  upsert(data);
  db.prepare("INSERT INTO runs (status) VALUES ('success')").run();  // ← 只在成功时写
} catch (err) {
  console.error(err);   // ← 失败只打印
}
```

**现象：** 一切正常的时候，`runs` 表里全是 success，看起来"运行良好"。

**真正的伤害：这是最危险的一种错，因为它让失败变得不可见。**

```text
真实情况：10 次运行，7 次失败
你的表里：3 行，全是 success
你的结论：系统很稳定
客户的感受：数据三天没更新
```

**怎么查：** 有意制造一次失败，看表里有没有多一行 failed。**没多，就是踩了。**

**判断口诀：**

```text
运行记录的价值，90% 在失败那一次
只在成功时写，等于没写
```

## 错误 3：`step` 从头到尾都是 `"start"`

```javascript
const insertRun = db.prepare("INSERT INTO runs (started_at, status, step) VALUES (?, 'running', 'start')");
// 后面再也没更新过 step
```

**现象：** 所有记录的 `step` 都是 `start`。

**真正的伤害：** 你知道"失败了"，但不知道"失败在哪"。**这等于只解决了一半问题。**

而"失败在哪一步"恰恰是最有用的信息：

```text
step=fetch   → 网络、对方服务器、限流
step=save    → 磁盘满、权限、路径
step=upsert  → 数据库锁、约束冲突、字段类型
```

**三种失败的处理方式完全不同。** 分不出来，你就只能一个个试。

**怎么查：**

```sql
SELECT step, COUNT(*) FROM runs WHERE status='failed' GROUP BY step;
```

只有一行，且值是 `start`，就是踩了。

## 错误 4：`cron.js` 里 `require` 了 `run-once.js`

```javascript
// 错误写法
const cron = require("node-cron");
require("./run-once");   // ← 想"引入"这个脚本

cron.schedule("*/2 * * * *", () => {
  require("./run-once");   // ← 想"再跑一次"
});
```

**现象：** `cron.js` 一启动就立刻跑了一次（因为 `require` 会执行模块顶层代码），然后到点再也不跑。

**原因：** `require` 有缓存。第二次 `require` 同一个路径，**直接返回缓存的对象，不执行模块体**。

```text
第一次 require("./run-once")  → 执行 main()，跑了一次
第二次 require("./run-once")  → 命中缓存，什么都没发生
```

**真正的伤害：** 你以为定时任务在跑，其实只跑了一次。而 `runs` 表里有一行 success，看起来"正常"。

**正确做法：用 `spawn` 起子进程。** 每次都是全新的 Node 进程，没有缓存，而且一个子进程崩了不影响 `cron.js`。

```javascript
const { spawn } = require("child_process");
const child = spawn(process.execPath, [SCRIPT], { cwd: __dirname, stdio: "inherit" });
```

**为什么用 `process.execPath` 而不是 `"node"`：**

```text
"node"            依赖 PATH。换台电脑、或者用 nvm 切了版本，可能找不到
process.execPath  就是当前正在运行的这个 node 的完整路径，一定有
```

**这是个小细节，但能省掉一次"在我电脑上好好的"的排查。**

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 只 `console.log` | 看得见 | 没有可查历史，答不上任何问题 | 试着回答"上个月失败几次" |
| 只记成功 | 表里全是 success | 失败完全不可见，最危险 | 造一次失败看表里加没加行 |
| `step` 不更新 | 全是 `start` | 知道失败了，不知道错在哪 | `GROUP BY step` 只有一行 |
| `require` 代替 `spawn` | 只跑一次，之后再也不跑 | 你以为在跑，其实没跑 | 看 `runs` 表条数会不会增长 |

**这四个错误的共同点：没有一个是"报错"。它们全都表现为"看起来正常"。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第07节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「我实际跑出来的运行记录」和「`step` 字段为什么有用」两节，**要贴你的真实数据，不要写通用答案**。

---

# 第 8 步：课后练习

## 练习一：加一个"连续失败"告警

写一个 `check-health.js`：查出最近 3 次运行，如果**全部失败**，就打印一行醒目的警告。

```text
!!!!! 连续 3 次采集失败，最近一次错误：connect ECONNREFUSED ::1:3001
```

提示：`SELECT status FROM runs ORDER BY id DESC LIMIT 3`，判断是不是全 `failed`。

**这一条以后要接到邮件或企业微信上**（第 23 周会讲通知）。现在先只打印。

## 练习二：加一个"数据量异常"判断

如果某次 `fetched` **不到最近七次平均值的一半**，说明数据源可能出问题了（改版、限流、只返回了第一页）。

**这是采集里最重要的一条监控。** 因为"抓到 5 条但成功写入 5 条"在状态上是 `success`，任何失败判断都发现不了它。

要求：把这个判断加到 `finishRun` 之前，如果异常，`status` 记成 `suspect`，并在 `error` 里写清原因。

## 练习三：把 `cron.js` 换成 Windows 任务计划

1. 用 `schtasks` 建一个每 5 分钟跑一次的任务；
2. `schtasks /Run` 手动触发一次；
3. 确认 `runs` 表新增一行；
4. `schtasks /Delete` 删掉。

**写出你踩到的第一个坑。**

提示：最常见的坑是 `/TR` 里的路径带空格却没加引号，以及 `node` 不在系统 PATH 里。

## 练习四：算一下"记录本身要多少空间"

按你的字段估：一行 `runs` 大概多少字节？如果每 2 分钟跑一次，一年下来多少行、多少 MB？

**算完之后回答：这个频率合理吗？如果不合理，你会改成什么频率，为什么？**

## 练习五：用自己的话讲清

1. 为什么运行记录必须写进数据库，不能只写日志文件？
2. `status` 为什么要有 `partial` 这一种？用"成功/失败"两种会漏掉什么？
3. `node-cron` 和 Windows 任务计划，各自适合什么场景？
4. 为什么 `cron.js` 要用 `spawn` 而不是 `require`？
5. 如果客户问"你这套采集可靠吗"，你会用哪三个数字回答？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出 `runs` 表里每个字段是干什么的，以及哪个字段是我以后一定会用到的
- [ ] 我能解释 `success / partial / failed` 三种状态的区别，并各举一个真实场景
- [ ] 我能说出 `node-cron` 和 Windows 任务计划的适用边界
- [ ] 我能解释为什么 `cron.js` 必须用 `spawn`

## B. 实操

- [ ] `runs.sql` 独立存在，`db.js` 能读它建表
- [ ] `run-once.js` 跑通一次，`runs` 表多一行 `success`
- [ ] 关掉 mock-server 跑一次，表里多一行 `failed`，`step=fetch`，`error` 含 `ECONNREFUSED`
- [ ] 制造一条坏数据，表里多一行 `partial`，`failed=1`
- [ ] 制造超时，`error` 里能看出是 timeout 而不是 refused
- [ ] `cron.js` 跑起来，8 分钟内至少触发 3 次，`runs` 表条数同步增长
- [ ] `show-runs.js` 能打印最近 N 次并做汇总
- [ ] `data\runs-report.md` 生成了，包含五次对照表和三条结论

## C. 排错

- [ ] 我亲眼见过 `fetch failed / connect ECONNREFUSED`，知道为什么要取 `err.cause`
- [ ] 我亲眼见过 timeout 的报错文本，能把它和 refused 区分开
- [ ] 我跑过一次 `require("./run-once")` 的错误写法，看到"只跑一次"
- [ ] 我用 `GROUP BY step` 查过失败分布

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 运行记录对照表贴的是真实输出
- [ ] 「`step` 为什么有用」写的是自己的话，不是抄课件
- [ ] 练习四的空间估算算了具体数字

---

## 本节课要能说出口的一句话

> **一个没有运行记录的定时任务，等于没做。你不知道它跑没跑，也就等于它没跑。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `ECONNREFUSED ::1:3001` | mock-server 起了吗 | 另开终端 `node mock-server.js` |
| `error` 里只有 `fetch failed` | 没取 `err.cause` | 用 `err.cause.message` 或 `err.cause.code` |
| `node-cron` 到点不触发 | 表达式 | `*/2 * * * *` 每 2 分钟；`0 3 * * *` 每天 3:00 |
| 触发两次 | 开了两个 `cron.js` | `tasklist \| findstr node`，关掉多余的 |
| `cron.js` 一启动就跑一次 | 用了 `require` 而不是 `spawn` | 改成 `spawn` |
| 关掉终端任务就停 | 这是 `node-cron` 的机制 | 改用 Windows 任务计划 |
| `schtasks` 报"拒绝访问" | 权限 | 用管理员终端，或不用 `/RU SYSTEM` |
| `runs` 表条数不涨 | `run-once.js` 里 `startRun` 没被调用 | 看终端有没有打印"运行编号" |
| `lastInsertRowid` 类型错误 | `better-sqlite3` 返回 BigInt | `Number(info.lastInsertRowid)` |
| 中文时间显示成 UTC | ISO 字符串是 UTC | 展示时用 `new Date(iso).toLocaleString()` |
| `SQLITE_BUSY` | `cron.js` 和 `show-runs.js` 同时开库 | 等前一个结束，或确认 WAL 已开 |
