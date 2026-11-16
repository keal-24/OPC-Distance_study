# 第 86 节课：建立资料索引

> 这节课结束时，你手上有：`rag-app\data\rag.db`，里面 `chunks` 表 10 行、`chunks_fts` 表 10 行，中文能按词搜到。

**时间**：约 110 分钟
**前置**：第 85 节课切出来的 `out\chunks-preview.json`（10 个块）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

上一节课结束时，你有一个 `out\chunks-preview.json`：

```json
[
  { "id": 1, "doc": "信息安全与账号管理", "seq": 1, "chars": 508, "text": "所有业务系统账号必须实名申请……" },
  { "id": 2, "doc": "信息安全与账号管理", "seq": 2, "chars": 694, "text": "客户名单、合同原件、财务明细属于机密数据……" }
]
```

10 个块，你能用 `require` 读进来，能遍历，能 `text.includes("报销")`。

## 0.2 今天这个坑长什么样

客户问："报销住宿超标了怎么办？"

你写了一段代码：

```javascript
const chunks = require("./out/chunks-preview.json");
const hits = chunks.filter((c) => c.text.includes("报销"));
console.log(hits.length);
```

跑出来 `2`。能用。

**然后客户的资料从 5 篇变成 500 篇。**

```text
500 篇 × 平均 1200 字 = 60 万字
切完约 1200 块
每次提问，你把 1200 块读进内存，逐块 includes
```

三个问题同时出现：

| 问题 | 具体表现 |
|---|---|
| 慢 | 每问一次都要把 60 万字读一遍，几百毫秒起步，人一多就顶不住 |
| 没有排序 | `includes` 只告诉你"有"，不告诉你"哪块最相关"。10 块你能自己看，1200 块你只能取前 3 个，前 3 个是文件顺序，不是相关度 |
| 没有高亮 | 你想在页面上把"报销"标黄，得自己再写一遍字符串定位 |

**数据库里有个东西专门解决这三件事：FTS5（Full-Text Search 5，全文检索）。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 倒排索引（inverted index） | 不是"文档 → 包含哪些词"，而是"词 → 出现在哪些文档"，查词的时候直接跳到那一行 | FTS5 帮你建，你不用手写 |
| 虚拟表（virtual table） | 长得像表，能 `INSERT` 能 `SELECT`，但数据不是按行存的，是索引结构 | `chunks_fts` |
| 分词器（tokenizer） | 决定"一句话怎么切成词"的规则 | `unicode61`，今天要跟它较劲 |

## 0.4 今天的交付物

| 文件 | 作用 |
|---|---|
| `db.js` | 打开数据库，优先 better-sqlite3，装不上用 node:sqlite |
| `build-index.js` | 读 JSON，写 `chunks` 表和 `chunks_fts` 表 |
| `tools\probe-tokenizer.js` | 看分词器到底把中文切成了什么 |
| `data\rag.db` | 数据库文件 |

**先想清楚一件事：为什么不用上一周的 `chunks` 表？**

上一周的 chunk 是按页切的，没有重叠，块边界跟着排版走。今天要的是"按语义切"的块，字段也对不上（上一周没有 `tokens`）。**两份数据分开存，上一周的库原样留着，出事能对照。**

---

# 第 1 步：建库，建两张表（20 分钟）

## 1.1 做什么 / 为什么

`chunks` 表存原文，`chunks_fts` 存索引。

**为什么是两张表，不是一张：**

FTS5 的虚拟表不能加普通字段，也不能随便 JOIN。你要 `doc_id`、`page`、`seq` 这些业务字段，就得有一张普通表。虚拟表只负责"按词查得快"，查到 `rowid` 再回普通表取原文。

```text
chunks         id, doc_id, page, seq, text, chars, tokens, embedding
chunks_fts     rowid, seg          ← rowid 和 chunks.id 一一对应
```

**为什么 `page` 这一列对 txt 全是 1：**

因为 txt 没有页。字段留着，是为了以后接 PDF 时不用改表结构。**该留的字段留着，但不要把假数据当真。**

**为什么要有 `tokens`：**

第 90 节课拼 prompt 之前，你要算"这 4 块加起来多少 token，会不会超预算"。每次都现算太慢，入库时算一次存下来。**估算值就够用，不要为了精确去装分词库。**

## 1.2 操作

在 `rag-app` 里新建 `db.js`：

```javascript
// db.js
// 打开数据库。优先用 better-sqlite3，装不上就用 Node 22.5+ 自带的 node:sqlite。

const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "rag.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

let db;
let driver;

try {
  const Database = require("better-sqlite3");
  db = new Database(DB_PATH);
  driver = "better-sqlite3";
} catch (e) {
  const { DatabaseSync } = require("node:sqlite");
  db = new DatabaseSync(DB_PATH);
  driver = "node:sqlite";
}

// 两种驱动都认 exec，写 PRAGMA 统一走它
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

module.exports = { db, DB_PATH, driver };
```

**三处要说明：**

1. `try/catch` 包住 `require("better-sqlite3")`：装不上不是错误，是换一条路。
2. `PRAGMA journal_mode = WAL`：写日志用 WAL 模式，读写不互相阻塞。副作用是目录里会多出 `rag.db-wal` 和 `rag.db-shm` 两个文件，**不要删它们**。
3. `module.exports` 导出的是同一个 `db` 实例。**不要在每个脚本里各开一次连接**，WAL 模式下多连接能跑，但事务会互相等。

新建 `build-index.js`：

```javascript
// build-index.js
// 读 out/chunks-preview.json，写进 chunks 表和 chunks_fts 虚拟表
// 用法：node build-index.js

const fs = require("fs");
const path = require("path");
const { db, DB_PATH, driver } = require("./db");

const PREVIEW = path.join(__dirname, "out", "chunks-preview.json");

// 把中文逐字用空格隔开，英文和数字保持原样
function segment(text) {
  return text
    .replace(/[\u4e00-\u9fa5]/g, (ch) => " " + ch + " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// 粗略估算 token 数：一个汉字算一个，连续的英文数字算一个
function estimateTokens(text) {
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9_]+/g) || []).length;
  return cjk + words;
}

function main() {
  const chunks = JSON.parse(fs.readFileSync(PREVIEW, "utf8"));
  console.log(`读到 ${chunks.length} 个块，数据库：${DB_PATH}（驱动 ${driver}）`);

  db.exec(`
    DROP TABLE IF EXISTS chunks_fts;
    DROP TABLE IF EXISTS chunks;

    CREATE TABLE chunks (
      id        INTEGER PRIMARY KEY,
      doc_id    TEXT NOT NULL,
      page      INTEGER NOT NULL DEFAULT 1,
      seq       INTEGER NOT NULL,
      text      TEXT NOT NULL,
      chars     INTEGER NOT NULL,
      tokens    INTEGER NOT NULL,
      embedding BLOB
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE chunks_fts USING fts5(
      seg,
      tokenize = 'unicode61'
    );
  `);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, doc_id, page, seq, text, chars, tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = db.prepare(`INSERT INTO chunks_fts (rowid, seg) VALUES (?, ?)`);

  db.exec("BEGIN");
  try {
    for (const c of chunks) {
      const tokens = estimateTokens(c.text);
      insertChunk.run(c.id, c.doc, 1, c.seq, c.text, c.chars, tokens);
      insertFts.run(c.id, segment(c.text));
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  const n = db.prepare("SELECT COUNT(*) AS n FROM chunks").get().n;
  const m = db.prepare("SELECT COUNT(*) AS n FROM chunks_fts").get().n;
  const t = db.prepare("SELECT SUM(tokens) AS t FROM chunks").get().t;

  console.log(`chunks 表 ${n} 行`);
  console.log(`chunks_fts 表 ${m} 行`);
  console.log(`总 token（估算）${t}`);

  const rows = db.prepare(`
    SELECT id, doc_id, seq, chars, tokens
    FROM chunks ORDER BY id LIMIT 5
  `).all();
  console.table(rows);
}

main();
```

跑：

```text
node build-index.js
```

## 1.3 屏幕上应该看到什么

```text
读到 10 个块，数据库：B:\OPC-Distance_study\每周课程\03-数据与智能\第13周-检索与RAG\第01节课\03-练习代码\rag-app\data\rag.db（驱动 better-sqlite3）
chunks 表 10 行
chunks_fts 表 10 行
总 token（估算）5410
┌─────────┬────┬──────────────────────┬─────┬───────┬────────┐
│ (index) │ id │ doc_id               │ seq │ chars │ tokens │
├─────────┼────┼──────────────────────┼─────┼───────┼────────┤
│ 0       │ 1  │ '信息安全与账号管理' │ 1   │ 508   │ 447    │
│ 1       │ 2  │ '信息安全与账号管理' │ 2   │ 694   │ 613    │
│ 2       │ 3  │ '客户合同评审要点'   │ 1   │ 548   │ 485    │
│ 3       │ 4  │ '客户合同评审要点'   │ 2   │ 722   │ 647    │
│ 4       │ 5  │ '差旅报销制度'       │ 1   │ 603   │ 482    │
└─────────┴────┴──────────────────────┴─────┴───────┴────────┘
```

**你的驱动那一行可能显示 `node:sqlite`，正常。** 两种驱动的 `prepare().get()` 返回都是普通对象，`console.table` 都能打印。

**为什么一行 508 字却算出 447 token：**

508 是总字符数，里面还有标点、换行、数字。`estimateTokens` 只数汉字和英文数字串，标点不算。**这是估算，不是精确值。**

**为什么总 token 是 5410，不是 10 × 500：**

每块字数不一样，而且 `chars` 算的是包含标点的长度，`tokens` 只算汉字和词。5410 这个数字后面第 90 节课会用到：假设每次带 4 块，平均 2164 token。

## 1.4 如果不是这样

**报错 `no such module: fts5`：**

你用的 SQLite 编译时没带 FTS5。`better-sqlite3` 官方包是带的；如果你装了别的镜像，卸载重装：

```text
npm uninstall better-sqlite3
npm install better-sqlite3
```

**报错 `SQLITE_ERROR: table chunks_fts already exists`：**

上一次没跑完，表还在。脚本开头有 `DROP TABLE IF EXISTS`，但顺序是先 `DROP chunks_fts` 再 `DROP chunks`，顺序不能反——虚拟表引用着普通表的 rowid。检查你抄的时候有没有把顺序抄反。

**`chunks_fts 表 0 行`：**

`insertFts.run(...)` 抛异常被 catch 吞了，但 `ROLLBACK` 之后你没看到错误。把 `catch` 里的 `throw e` 加回去。

**报错 `SQLITE_BUSY`：**

你开着另一个进程连着同一个库（比如 DB Browser for SQLite 正在写）。关掉它再跑。

## 1.5 先量一下：LIKE 到底慢多少

**为什么要量：** 你以后会跟人说"要用 FTS，LIKE 太慢"。这句话没有数字就是空话。客户问"慢多少"，你得答得出来。

新建 `tools\bench-like.js`。它自己造 2 万个块，在内存里比 LIKE 和 FTS，不碰你的 `rag.db`：

```javascript
// tools/bench-like.js
// 造 2 万个块，比 LIKE 和 FTS 的查询耗时
// 用法：node tools/bench-like.js

const fs = require("fs");
const path = require("path");

let db;
try {
  const Database = require("better-sqlite3");
  db = new Database(":memory:");
} catch (e) {
  const { DatabaseSync } = require("node:sqlite");
  db = new DatabaseSync(":memory:");
}

db.exec("CREATE TABLE chunks (id INTEGER PRIMARY KEY, text TEXT)");
db.exec("CREATE VIRTUAL TABLE fts USING fts5(seg)");

const base = fs.readFileSync(path.join(__dirname, "..", "data", "docs", "差旅报销制度.txt"), "utf8");

function segment(text) {
  return text
    .replace(/[\u4e00-\u9fa5]/g, (ch) => " " + ch + " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const ins = db.prepare("INSERT INTO chunks (id, text) VALUES (?, ?)");
const insF = db.prepare("INSERT INTO fts (rowid, seg) VALUES (?, ?)");

db.exec("BEGIN");
for (let i = 1; i <= 20000; i++) {
  const t = base.slice(0, 200 + (i % 300)) + ` 编号${i}`;
  ins.run(i, t);
  insF.run(i, segment(t));
}
db.exec("COMMIT");
console.log("已造 20000 块");

const likeSql = "SELECT COUNT(*) AS n FROM chunks WHERE text LIKE '%核销%'";
const ftsSql = "SELECT COUNT(*) AS n FROM fts WHERE fts MATCH ?";
const q = '"核 销"';

for (let i = 0; i < 5; i++) {
  db.prepare(likeSql).get();
  db.prepare(ftsSql).get(q);
}

let t0 = process.hrtime.bigint();
for (let i = 0; i < 100; i++) db.prepare(likeSql).get();
let t1 = process.hrtime.bigint();
for (let i = 0; i < 100; i++) db.prepare(ftsSql).get(q);
let t2 = process.hrtime.bigint();

const likeMs = Number(t1 - t0) / 1e6 / 100;
const ftsMs = Number(t2 - t1) / 1e6 / 100;

console.log(`LIKE 平均 ${likeMs.toFixed(3)} ms/次`);
console.log(`FTS  平均 ${ftsMs.toFixed(3)} ms/次`);
console.log(`相差 ${(likeMs / ftsMs).toFixed(1)} 倍`);
console.log("LIKE 命中", db.prepare(likeSql).get().n);
console.log("FTS  命中", db.prepare(ftsSql).get(q).n);
```

跑：

```text
node tools\bench-like.js
```

**屏幕上应该看到什么：**

```text
已造 20000 块
LIKE 平均 22.045 ms/次
FTS  平均 0.329 ms/次
相差 67.0 倍
LIKE 命中 0
FTS  命中 0
```

**这两组数字说明的事：**

| | LIKE | FTS |
|---|---|---|
| 每次查询 | 把 2 万行文本全部读一遍，逐字符找"核销" | 先查索引里有没有"核"，有才去读那几行 |
| 20000 块，0 命中 | 22 毫秒 | 0.33 毫秒 |
| 12 万块（约 500 篇文档） | 线性涨到约 130 毫秒 | 基本不变 |
| 相关度排序 | 没有 | `bm25()` |
| 高亮 | 自己写 | `snippet()` |

**注意这里是 0 命中。** 0 命中是最坏的情况：LIKE 一定要扫完才知道没有，FTS 查一下词表就知道没有。命中率高的时候差距会小一些，但 LIKE 永远要扫全表。

**为什么不用"给 text 建个普通索引"来解决：**

普通索引（B-tree）只对"整值相等"和"前缀匹配"有效。`WHERE text = '...'` 快，`WHERE text LIKE '报销%'` 也能用索引，但 `LIKE '%报销%'` 前面有通配符，索引直接失效。

**全文检索和普通索引的区别就在这里：** 普通索引索引的是"整列的值"，全文索引索引的是"值里面的词"。

**这个数字要记住：2 万块，67 倍。** 这是你以后跟客户解释"为什么要建索引"时唯一需要的一个数字。


---

# 第 2 步：看清 unicode61 对中文做了什么（20 分钟）

## 2.1 做什么 / 为什么

上一节的 `segment()` 把每个汉字用空格隔开了。**为什么要这么干，得先证明不这么干会坏。**

网上关于"SQLite 中文搜索"的文章里，有一句话流传很广：

> unicode61 会把中文按单字切，所以中文检索效果勉强能用。

**这句话是错的。**

跑一遍就知道了。新建 `tools\probe-tokenizer.js`：

```javascript
// tools/probe-tokenizer.js
// 用原始文本建一个临时 FTS 表，看 unicode61 到底切出了什么
// 用法：node tools/probe-tokenizer.js

const { db } = require("../db");

db.exec("DROP TABLE IF EXISTS raw_fts");
db.exec("CREATE VIRTUAL TABLE raw_fts USING fts5(text, tokenize='unicode61')");

const rows = db.prepare("SELECT id, text FROM chunks ORDER BY id").all();
const ins = db.prepare("INSERT INTO raw_fts(rowid, text) VALUES (?, ?)");
for (const r of rows) ins.run(r.id, r.text);

db.exec("DROP TABLE IF EXISTS v_raw");
db.exec("CREATE VIRTUAL TABLE v_raw USING fts5vocab(raw_fts, 'row')");

console.log("vocab 里跟「报销」有关的词：");
console.log(db.prepare("SELECT term, cnt FROM v_raw WHERE term LIKE '%报销%' ORDER BY cnt DESC LIMIT 5").all());

console.log("vocab 总词数：", db.prepare("SELECT COUNT(*) AS n FROM v_raw").get());
console.log("最长的三个词：", db.prepare("SELECT term, LENGTH(term) AS l FROM v_raw ORDER BY l DESC LIMIT 3").all());

const hit1 = db.prepare("SELECT COUNT(*) AS n FROM raw_fts WHERE raw_fts MATCH ?").get("报销").n;
const hit2 = db.prepare("SELECT COUNT(*) AS n FROM raw_fts WHERE raw_fts MATCH ?").get("报销*").n;
console.log(`搜 报销   命中 ${hit1}`);
console.log(`搜 报销*  命中 ${hit2}`);
```

跑：

```text
node tools\probe-tokenizer.js
```

## 2.2 屏幕上应该看到什么

```text
vocab 里跟「报销」有关的词：
[
  { term: '不走差旅报销', cnt: 2 },
  { term: '电子发票重复报销的', cnt: 2 },
  { term: '不再报销过路费和停车费', cnt: 1 },
  { term: '事后一律不予报销', cnt: 1 },
  { term: '凭客户方的书面说明可以据实报销', cnt: 1 }
]
vocab 总词数： { n: 463 }
最长的三个词： [
  { term: '飞机经济舱仅在单程超过八百公里或者高铁耗时超过六小时的情况下允许乘坐', l: 34 },
  { term: '客户在收到交付物后超过十五个工作日未提出书面异议的', l: 25 },
  { term: '付款账期默认为货到验收合格并收到合规发票后三十天', l: 24 }
]
搜 报销   命中 0
搜 报销*  命中 1
```

**这四行输出把问题说清楚了：**

| 你看到的 | 意思 |
|---|---|
| `不走差旅报销` 是一个"词" | unicode61 不认识中文词边界，只按标点和空格切。一句话里没有标点，整句就是一个词 |
| 最长的一个"词" 34 个字 | 整整一句话被当成一个 token |
| 搜 `报销` 命中 0 | 因为索引里没有"报销"这个 token，只有"不走差旅报销" |
| 搜 `报销*` 命中 1 | 前缀匹配能命中，但要求查询词必须出现在词的**开头**。"事后一律不予报销"里的"报销"在结尾，永远搜不到 |

**所以，"unicode61 把中文按单字切"是错的。** 它恰恰相反：把一整句当成一个词。

**为什么会有人这么说：** 他们可能用了别的分词器，或者看到英文被正确切开了就以为中文也一样。**这类说法你必须自己跑一遍再信。**

**顺带记住 unicode61 到底按什么切：** 按 Unicode 分类，非字母数字的字符（空格、标点、符号）都算分隔符。汉字属于"字母"，所以一串汉字中间没有标点，就是一整个 token。这不是 bug，是设计如此——它面向的是有空格分词的语言。

## 2.3 那怎么办：自己插空格

既然 unicode61 只认空格和标点，那就在写入之前**把每个汉字用空格隔开**：

```text
员工报销流程  →  员 工 报 销 流 程
```

这样 unicode61 切出来就是六个单字 token。查询的时候，把查询词也拆成单字，用短语匹配：

```text
查询"报销"  →  FTS5 表达式 "报 销"  →  匹配相邻的"报"和"销"
```

**代价有两个，必须说清楚：**

| 代价 | 具体表现 | 有多严重 |
|---|---|---|
| 误匹配 | "举报销售"里"报""销"也相邻，会被当成"报销" | 中文里这种相邻组合不算多，但会有 |
| 索引变大 | 每个字一个 token，token 数从 463 涨到 630 | 可接受，文本量上万块之后要重新算 |

**为什么不用 trigram：** 第 5 步单独讲，它有一个致命限制。

**还有一条：** 这种"单字索引"只适合"查询词也是中文词"的场景。如果用户搜的是英文单词 `password`，`segment()` 不会拆它，查询时也不拆，两边都是整词，照样能匹配。

## 2.4 如果不是这样

**报错 `no such table: v_raw`：**

`fts5vocab` 需要单独 `CREATE VIRTUAL TABLE`，不能直接 `SELECT * FROM raw_fts_vocab`。确认上面那两行 `db.exec` 都跑了。

**`vocab 总词数` 是 0：**

`raw_fts` 没写进去。`insertFts` 那两行之前 `rows` 是空的，说明 `chunks` 表没数据，先回去跑第 1 步。

**输出里中文是乱码：**

`chcp 65001` 之后再跑。这跟数据库无关，是 cmd 的显示问题。

---

# 第 3 步：把分词写进建索引的流程（15 分钟）

## 3.1 做什么 / 为什么

`build-index.js` 里已经有 `segment()`，第 1 步跑的时候其实已经用了。

这一节要做的是**验证它真的起作用**，并且把 `seg` 这一列的作用讲明白。

**为什么索引列不直接存原文：**

`chunks_fts` 里存的是 `seg`，不是 `text`。原文在 `chunks.text` 里。这样做的好处：

1. 虚拟表只存索引需要的东西，省空间；
2. 原文只有一份，改原文不会出现两份不一致；
3. 展示的时候从 `chunks` 取原文，永远是干净的，没有多余空格。

**代价：** `snippet()` 高亮只能作用在 `seg` 上，取出来的文字带空格，要自己修。第 87 节课会处理。

## 3.2 操作

新建 `tools\probe-seg.js`，对比两种索引：

```javascript
// tools/probe-seg.js
// 对比：原始文本索引 vs 逐字空格索引
// 用法：node tools/probe-seg.js

const { db } = require("../db");

db.exec("DROP TABLE IF EXISTS v_seg");
db.exec("CREATE VIRTUAL TABLE v_seg USING fts5vocab(chunks_fts, 'row')");

const total = db.prepare("SELECT COUNT(*) AS n FROM v_seg").get().n;
console.log(`分词后 vocab 总词数：${total}`);

const pairs = db.prepare("SELECT term, cnt FROM v_seg WHERE term IN ('报','销','住','宿')").all();
console.log("四个单字的出现次数：");
console.table(pairs);

for (const q of ["报销", "住宿", "密码", "违约金"]) {
  const expr = `"${q.split("").join(" ")}"`;
  const n = db.prepare("SELECT COUNT(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?").get(expr).n;
  console.log(`查询 ${q}  表达式 ${expr}  命中 ${n}`);
}
```

跑：

```text
node tools\probe-seg.js
```

## 3.3 屏幕上应该看到什么

```text
分词后 vocab 总词数：630
四个单字的出现次数：
┌─────────┬──────┬─────┐
│ (index) │ term │ cnt │
├─────────┼──────┼─────┤
│ 0       │ '报' │ 27  │
│ 1       │ '销' │ 25  │
│ 2       │ '住' │ 21  │
│ 3       │ '宿' │ 19  │
└─────────┴──────┴─────┘
查询 报销  表达式 "报 销"  命中 2
查询 住宿  表达式 "住 宿"  命中 2
查询 密码  表达式 "密 码"  命中 2
查询 违约金  表达式 "违 约 金"  命中 2
```

**对比第 2 步：**

| | 原始文本 | 逐字空格 |
|---|---|---|
| vocab 词数 | 463 | 630 |
| 搜"报销" | 0 | 2 |
| 最长 token | 34 字 | 1 字 |

**vocab 词数反而变多了，为什么：**

原来是"一句话一个词"，现在"一个字一个词"。463 个长词拆成了 630 个单字。**词表变大不代表索引一定更大**——长词本身占的空间也不少。真实的体积差异要看数据库文件大小，不看词数。

## 3.4 如果不是这样

**查询"报销"命中 0：**

`segment()` 没生效。检查 `insertFts.run(c.id, segment(c.text))`，是不是写成了 `insertFts.run(c.id, c.text)`。

**查询表达式里没有空格：**

`q.split("").join(" ")` 对"报销"应该得到 `报 销`。如果你的输出是 `报销`，说明 `split` 被改成了 `split(" ")`。

**命中数比预期多很多：**

正常。单字匹配会命中所有含这两个字且相邻的块，包括"报销"以外的组合。第 87 节课会讲怎么让查询更准。

---

# 第 4 步：两张表必须一起写（15 分钟）

## 4.1 做什么 / 为什么

`chunks` 和 `chunks_fts` 是两份数据，必须保持一致。

**不一致的后果不是报错，是"搜不到"：**

```text
chunks 有 10 行，chunks_fts 有 9 行
→ 第 10 块永远搜不到
→ 你以为是检索算法的问题，查一天
```

**所以写的时候必须放在一个事务里。** 要么两张表都成功，要么都失败。

## 4.2 操作

看看 `build-index.js` 中间那段：

```javascript
  db.exec("BEGIN");
  try {
    for (const c of chunks) {
      const tokens = estimateTokens(c.text);
      insertChunk.run(c.id, c.doc, 1, c.seq, c.text, c.chars, tokens);
      insertFts.run(c.id, segment(c.text));
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
```

**三行关键代码：**

| 代码 | 作用 |
|---|---|
| `BEGIN` | 开事务。之后的写操作先不落盘 |
| `COMMIT` | 全部成功，一起落盘 |
| `ROLLBACK` | 中途出错，全部撤销，一张表都不留 |

**为什么不用触发器（trigger）自动同步：**

可以。`AFTER INSERT ON chunks` 里往 `chunks_fts` 插一条，确实省事。但这一周你还要往 `chunks` 里写 `embedding`（第 89 节课），触发器会跟着触发，而你并不想重写索引。

**手写同步的规则很简单：改原文就删索引再重建。** 新建 `tools\reindex-one.js` 演示单块更新：

```javascript
// tools/reindex-one.js
// 改一个块，同时更新两张表
// 用法：node tools/reindex-one.js

const { db } = require("../db");

function segment(text) {
  return text
    .replace(/[\u4e00-\u9fa5]/g, (ch) => " " + ch + " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function updateChunk(id, newText) {
  const chars = newText.length;
  const tokens = (newText.match(/[\u4e00-\u9fa5]/g) || []).length
    + (newText.match(/[A-Za-z0-9_]+/g) || []).length;

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE chunks SET text = ?, chars = ?, tokens = ? WHERE id = ?")
      .run(newText, chars, tokens, id);
    db.prepare("DELETE FROM chunks_fts WHERE rowid = ?").run(id);
    db.prepare("INSERT INTO chunks_fts (rowid, seg) VALUES (?, ?)").run(id, segment(newText));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  console.log(`已更新第 ${id} 块，${chars} 字，${tokens} token`);
}

updateChunk(1, "所有业务系统账号必须实名申请。测试改写。");

const n1 = db.prepare("SELECT COUNT(*) AS n FROM chunks").get().n;
const n2 = db.prepare("SELECT COUNT(*) AS n FROM chunks_fts").get().n;
console.log(`chunks ${n1} 行，chunks_fts ${n2} 行`);
```

跑：

```text
node tools\reindex-one.js
```

## 4.3 屏幕上应该看到什么

```text
已更新第 1 块，30 字，24 token
chunks 10 行，chunks_fts 10 行
```

**行数没变，这是对的。** 更新不是新增。

**然后跑一下检查，确认原来的第 1 块内容真的换了：**

```text
node -e "const {db}=require('./db'); console.log(db.prepare('SELECT text FROM chunks WHERE id=1').get().text)"
```

```text
所有业务系统账号必须实名申请。测试改写。
```

**记得改回来：** 重跑一次 `node build-index.js`，全部重建。

## 4.4 如果不是这样

**报错 `cannot start a transaction within a transaction`：**

你在 `BEGIN` 之前又开了事务，或者上一次 `ROLLBACK` 没执行。最简单的处理：重跑 `build-index.js` 重建，或者确认所有 `BEGIN` 都有配对的 `COMMIT` 或 `ROLLBACK`。

**行数变成 11 和 10：**

`UPDATE` 写成了 `INSERT`。检查那一行。

**行数是 10 和 10，但搜不到新内容：**

你只更新了 `chunks`，没删 `chunks_fts` 里旧的。`DELETE` 那行漏了，结果索引里是旧内容，而且多了一条。

---

# 第 5 步：trigram 值不值得换（15 分钟）

## 5.1 做什么 / 为什么

SQLite 3.34 之后多了一个分词器：`trigram`（三字符组）。

它不按词切，按**连续三个字符**切。`员工报销` 会切出 `员工报`、`工报销`。查询的时候也按三字符匹配。

**好处是它能做子串匹配**，不依赖空格，也不用改原文。

**坏处是中文最常见的词是两个字的。** 跑一遍就知道。

## 5.2 操作

新建 `tools\probe-trigram.js`：

```javascript
// tools/probe-trigram.js
// 建一个 trigram 索引，看它对中文的实际效果
// 用法：node tools/probe-trigram.js

const { db } = require("../db");

db.exec("DROP TABLE IF EXISTS tri_fts");
db.exec("CREATE VIRTUAL TABLE tri_fts USING fts5(text, tokenize='trigram')");

const rows = db.prepare("SELECT id, text FROM chunks ORDER BY id").all();
const ins = db.prepare("INSERT INTO tri_fts(rowid, text) VALUES (?, ?)");
for (const r of rows) ins.run(r.id, r.text);

for (const q of ["报销", "报销流", "费用核销", "住宿标准", "违约金"]) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM tri_fts WHERE tri_fts MATCH ?").get(q).n;
  console.log(`${q}  命中 ${n}`);
}
```

跑：

```text
node tools\probe-trigram.js
```

## 5.3 屏幕上应该看到什么

```text
报销  命中 0
报销流  命中 1
费用核销  命中 0
住宿标准  命中 1
违约金  命中 2
```

**这张表就是结论：**

| 查询 | 字数 | 命中 | 说明 |
|---|---|---|---|
| 报销 | 2 | 0 | 两个字的词完全搜不到 |
| 报销流 | 3 | 1 | 三个字才行 |
| 住宿标准 | 4 | 1 | 四个字可以，内部按三字切 |
| 违约金 | 3 | 2 | 三个字可以 |

**中文里两个字构成的词占大多数**：报销、发票、年假、病假、密码、账号、合同、付款、验收。trigram 对这些全部失效。

**所以这一周不用 trigram。** 不是它不好，是它跟中文的二字词对不上。

**什么时候可以用 trigram：**

| 场景 | 能不能用 |
|---|---|
| 英文、代码、日志（词都长） | 可以 |
| 中文，查询都是三个字以上 | 可以 |
| 中文，用户会搜两个字 | 不行 |
| 需要 `LIKE '%关键词%'` 的性能 | 可以，trigram 就是为这个设计的 |

**顺带说清"为什么不用 LIKE"：**

`WHERE text LIKE '%报销%'` 也能搜到，不需要任何索引配置。但它是全表扫描，1200 块还行，12 万块就是灾难，而且没有相关度分数。**能用和好用是两件事。**

## 5.4 如果不是这样

**报错 `no such tokenizer: trigram`：**

你的 SQLite 低于 3.34。跑：

```text
node -e "const {db}=require('./db'); console.log(db.prepare('select sqlite_version() v').get())"
```

低于 3.34 就跳过这一节，不影响后面的课。

**`报销` 命中了：**

你查的不是 `tri_fts`，是 `chunks_fts`。检查 SQL 里的表名。

---

# 第 6 步：故意犯 3 个错（15 分钟）

## 错误 1：只写 chunks，忘了写 FTS

**操作：** 把 `build-index.js` 里 `insertFts.run(c.id, segment(c.text));` 这一行注释掉，重跑。

**现象：**

```text
node build-index.js
```

```text
读到 10 个块，数据库：……（驱动 better-sqlite3）
chunks 表 10 行
chunks_fts 表 0 行
总 token（估算）5410
```

然后搜：

```text
node tools\probe-seg.js
```

```text
分词后 vocab 总词数：0
查询 报销  表达式 "报 销"  命中 0
```

**原因：** `chunks_fts` 是空的，索引里一个字都没有。

**怎么查：** 每次建完索引，第一件事就是对比两张表的行数。**不相等就是错的，不要往下走。**

**为什么容易犯：** 两个 `INSERT` 长得像，注释掉一个不影响另一个运行，脚本也不报错。**沉默的错误最贵。**

改回来。

## 错误 2：直接用原文建索引

**操作：** 把 `insertFts.run(c.id, segment(c.text));` 改成 `insertFts.run(c.id, c.text);`，重跑 `build-index.js`，再跑 `probe-seg.js`。

**现象：**

```text
分词后 vocab 总词数：463
查询 报销  表达式 "报 销"  命中 0
查询 住宿  表达式 "住 宿"  命中 0
查询 密码  表达式 "密 码"  命中 0
```

**原因：** 索引里是一句一个词，查询是单字短语，两边对不上。

**怎么查：** 搜 0 条的时候，先别怀疑查询，去看 vocab 里有什么词：

```text
node tools\probe-tokenizer.js
```

看到 `不走差旅报销` 这种长词，就说明索引没分词。

改回来。

## 错误 3：事务写到一半失败，两张表只剩一半

**操作：** 在 `build-index.js` 的循环里，故意加一行会抛错的代码：

```javascript
    for (const c of chunks) {
      if (c.id === 5) throw new Error("故意失败");
      const tokens = estimateTokens(c.text);
      insertChunk.run(c.id, c.doc, 1, c.seq, c.text, c.chars, tokens);
      insertFts.run(c.id, segment(c.text));
    }
```

**现象：**

```text
Error: 故意失败
    at main (B:\...\build-index.js:60:26)
```

脚本挂了，然后查行数：

```text
node -e "const {db}=require('./db'); console.log(db.prepare('SELECT COUNT(*) n FROM chunks').get(), db.prepare('SELECT COUNT(*) n FROM chunks_fts').get())"
```

```text
{ n: 0 } { n: 0 }
```

**两张表都是 0，这是对的。** 事务回滚把前 4 条也撤销了。

**现在把 `ROLLBACK` 那一行删掉，再跑一次：**

```text
{ n: 4 } { n: 4 }
```

**再跑一次（不清空表）：**

```text
Error: UNIQUE constraint failed: chunks.id
```

**原因：** 没有回滚，前 4 条留在库里；第二次跑又从 id=1 开始插，主键冲突。

**怎么查：** 看到 `UNIQUE constraint failed`，先想"上一次是不是没回滚"。解决方法是重跑 `build-index.js`（它会先 DROP 表），或者手动 `DELETE FROM chunks`。

**这个错误在真实项目里会造成脏数据**：一半新、一半旧，索引对不上，搜出来的内容和原文不一致。事务不是可选项。

把故意的 `throw` 和 `ROLLBACK` 都恢复。

## 三个错误总结

```text
只写 chunks        → 索引空，搜 0 条，不报错
原文直接建索引      → vocab 全是一句话，搜 0 条
事务不回滚         → 两张表行数不一致，或主键冲突
```

**排查顺序：**

```text
① 两张表行数相等吗？
② vocab 里是单字还是一句话？
③ 搜 0 条时，先看 vocab，再看查询表达式
```

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 86 节课学习笔记

## 一、为什么切完还要建索引

## 二、两张表的分工

## 三、chunks 表的字段

## 四、写 chunks 和写 FTS 必须在一个事务里

## 五、unicode61 对中文到底做了什么

## 六、为什么要自己插空格

## 七、trigram 的取舍

## 八、重建索引的代价

## 九、故意犯的错

## 十、我还不懂的词

## 十一、完成检查
```

---

# 第 8 步：课后练习

## 练习一：把索引体积量出来

在 `data` 目录下看 `rag.db` 的大小，然后：

1. 跑一次 `build-index.js`，记下大小；
2. 把 `segment()` 改成 `return text;`，重跑，记下大小；
3. 对比两个数字，算出单字索引比原始索引大多少。

**结论写进笔记：** 多花的空间换来了"能搜到"，值不值？

## 练习二：给 chunks 表加一个唯一约束

现在 `id` 是主键，但 `(doc_id, seq)` 也应该唯一——同一篇文档不可能有两个第 2 块。

给表加 `UNIQUE(doc_id, seq)`，然后故意插一条重复的，看报错是什么。**想一想：加了约束之后，`build-index.js` 的 DROP 重建流程还成立吗？**

## 练习三：写一个"索引自检"脚本

新建 `tools\check-index.js`，输出三行：

```text
chunks 行数     10
chunks_fts 行数 10
两边 id 完全一致：是
```

第三行要用 SQL 查：`SELECT id FROM chunks EXCEPT SELECT rowid FROM chunks_fts`，反过来再查一次，两个结果都为空才算一致。

## 练习四：找出这段建索引代码的四个问题

```javascript
const chunks = require("./out/chunks-preview.json");
for (const c of chunks) {
  db.prepare("INSERT INTO chunks (id, text) VALUES (?, ?)").run(c.id, c.text);
}
db.exec("CREATE VIRTUAL TABLE chunks_fts USING fts5(text)");
for (const c of chunks) {
  db.prepare("INSERT INTO chunks_fts (rowid, text) VALUES (?, ?)").run(c.id, c.text);
}
```

提示方向：事务、分词、字段缺失、虚拟表创建时机。

## 练习五：用自己的话讲清

```text
为什么 chunks 和 chunks_fts 要分成两张表？
unicode61 对中文做了什么？为什么"按单字切"这个说法是错的？
为什么 trigram 不能解决中文二字词的问题？
事务回滚保护的是什么？不回滚会出现什么数据？
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能解释倒排索引和普通表的区别
- [ ] 我知道 `chunks_fts` 的 `rowid` 对应 `chunks.id`
- [ ] 我能说清 unicode61 对中文的真实行为
- [ ] 我知道为什么要逐字插空格
- [ ] 我知道 trigram 的两个限制

## B. 实操

- [ ] `node build-index.js` 跑通，两张表都是 10 行
- [ ] `node tools\probe-tokenizer.js` 能看到 463 个词和"搜报销命中 0"
- [ ] `node tools\probe-seg.js` 能看到"搜报销命中 2"
- [ ] `node tools\reindex-one.js` 能改一块并保持行数不变
- [ ] 我重跑过 `build-index.js`，数据恢复原样

## C. 排错

- [ ] 搜 0 条时，我知道先看 vocab
- [ ] 行数不一致时，我知道是 FTS 没写
- [ ] 看到 `UNIQUE constraint failed`，我知道是没回滚
- [ ] 看到 `no such tokenizer: trigram`，我知道是 SQLite 版本低

## D. 笔记

- [ ] `NOTES.md` 的 11 个小标题都填了
- [ ] "两张表的分工"是一张表
- [ ] "trigram 的取舍"写了自己的判断
- [ ] 我还不懂的词至少 2 个

## 本节课要能说出口的一句话

> **原文和索引是两份数据，必须一起写、一起改；中文没有空格，所以索引里的字要我们自己隔开。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `chunks_fts` 0 行 | `insertFts` 有没有跑 | 恢复那一行，重跑 |
| 搜什么都 0 条 | vocab 里是长词还是单字 | 确认 `segment()` 生效 |
| `no such module: fts5` | SQLite 编译选项 | 重装 better-sqlite3 |
| `no such tokenizer: trigram` | SQLite 版本 | 低于 3.34，跳过 |
| `UNIQUE constraint failed` | 上次没回滚 | 重跑 build-index 重建 |
| `SQLITE_BUSY` | 有别的程序连着库 | 关掉 DB Browser |
| 数据库目录多个 `-wal` 文件 | WAL 模式 | 正常，不要删 |
| 中文乱码 | cmd 代码页 | `chcp 65001` |
| token 数和字数差很多 | 标点不算 token | 正常，是估算 |
| `no such table: dbstat` | SQLite 没开该选项 | 不用查索引体积 |
