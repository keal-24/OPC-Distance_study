# 第 83 节课：统一结构

> 这节课结束时，你手上有：`data\app.db` 里的三张表 `documents` / `sections` / `chunks`，一个 `parse(filePath)` 统一接口，以及"单个文件失败能单独重试"的能力。

**时间**：约 120 分钟
**前置**：第 82 节课做出来的 `src\ocr.js`，以及前四节的所有读取函数

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你有六个函数，每个处理一种格式：

```text
readTextFile    txt / md / csv
readDocx        docx
readTable       csv / xlsx
readPdf         pdf
ocrFile         jpg / png
```

它们返回的结构各不相同：有的返回 `{text}`，有的返回 `{sheets}`，有的返回 `{pages}`。

**上层没法用。** 你写 `pipeline.js` 的时候，会变成一堆 `if (format === "pdf")` 的嵌套。每加一种格式，改一次主流程。

## 0.2 今天这个坑长什么样

**场景一：** 你写了一个循环解析 50 个文件。第 37 个损坏，程序抛异常退出。**前面 36 个的结果还在内存里，一行都没入库。**

**场景二：** 你把结果存成一张表：`id | 文件 | 全文`。客户问"这句话在第几页"，你答不上来，因为当初没存页号，只能全部重解析。

**场景三：** 你删了一条文档记录，发现 `sections` 里还留着它的 200 行。因为 SQLite 默认**不开启外键约束**，`ON DELETE CASCADE` 一直没生效。

**这三个场景对应今天的三个设计决定：** 统一返回结构、三张表分层、每个文件一个事务。

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 统一接口（interface） | 不管内部多复杂，对外只暴露一种形状 | `parse(filePath)` 永远返回 `{title, pages[]}` |
| 分层存储（normalization） | 一份数据拆成几张表，靠 id 关联，不重复存 | documents / sections / chunks |
| 事务（transaction） | 一组操作要么全成，要么全不成 | 一个文件的入库 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `src\db.js` | `第06节课\03-练习代码\doc-parser\` | 打开数据库、建三张表、开启外键 |
| `src\parse.js` | 同上 | `parse()` 统一接口 + 分派表 |
| `src\store.js` | 同上 | `saveParsed()`、`parseOne()`、`markFailed()` |
| `src\db-check.js` | 同上 | 打印三张表的统计 |
| `data\app.db` | 同上 | 数据库文件，接第 11 周 |
| `NOTES.md` | `第06节课\02-笔记\` | 学习记录 |

---

# 第 1 步：建库，建三张表（30 分钟）

## 1.1 做什么 / 为什么

**为什么是三张表，不是一张：**

| 层 | 一行代表什么 | 谁会用 |
|---|---|---|
| `documents` | 一个文件 | 列表页、进度、失败重试、统计 |
| `sections` | 文件里的一页 / 一个 sheet | 引用"第几页"、按页展示 |
| `chunks` | 一段可检索的文字 | 第 13 周的检索和问答 |

**一张大表的问题：**

- 文档级的元信息（标题、路径、状态）会在每一页重复 6 次；
- 改一个状态要更新 6 行，容易改漏；
- 第 13 周建全文索引时，索引会包含标题、路径这些不该被搜的字段；
- 删一个文件，你要自己记得删它的所有行。

**三张表 + 外键 + 级联删除，这些问题一次解决。**

## 1.2 操作

```text
cd /d B:\OPC-Distance_study\每周课程\03-数据与智能\第12周-文档解析\第06节课\03-练习代码
xcopy "..\..\第05节课\03-练习代码\doc-parser" "doc-parser" /E /I /Y
cd doc-parser
npm install better-sqlite3
npm install dotenv
```

**关于 `data\app.db`：** 如果你第 11 周的项目里有 `data\app.db`，把它复制到本项目的 `data\` 下。没有就新建，`db.js` 会自动建目录和文件。**这一次我们把 W12 的表加进同一个库，不另起一个文件**——第 13 周要在 `chunks` 上建索引，库越少越好。

新建 `src\db.js`：

```javascript
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "app.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  path          TEXT NOT NULL UNIQUE,
  format        TEXT NOT NULL,
  title         TEXT,
  page_count    INTEGER NOT NULL DEFAULT 0,
  char_count    INTEGER NOT NULL DEFAULT 0,
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  content_hash  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','parsing','success','failed','needs_review')),
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  parsed_at     TEXT
);

CREATE TABLE IF NOT EXISTS sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_no     INTEGER NOT NULL,
  label       TEXT,
  heading     TEXT,
  text        TEXT NOT NULL,
  char_count  INTEGER NOT NULL,
  UNIQUE (doc_id, page_no)
);

CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  page_no     INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  text        TEXT NOT NULL,
  char_count  INTEGER NOT NULL,
  token_est   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (section_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_sections_doc ON sections(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_section ON chunks(section_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
`);

module.exports = db;
```

新建 `src\db-check.js`：

```javascript
const db = require("./db");

const docs = db.prepare(`
  SELECT id, path, format, status, page_count, char_count, chunk_count
  FROM documents ORDER BY id
`).all();

console.log("documents：", docs.length, "条");
for (const d of docs) {
  console.log(`id=${d.id}  path=${d.path}  format=${d.format}  status=${d.status}  pages=${d.page_count}  chars=${d.char_count}  chunks=${d.chunk_count}`);
}

const counts = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM documents) AS documents,
    (SELECT COUNT(*) FROM sections)  AS sections,
    (SELECT COUNT(*) FROM chunks)    AS chunks
`).get();

console.log(counts);
console.log("foreign_keys =", db.pragma("foreign_keys", { simple: true }));
console.log("journal_mode =", db.pragma("journal_mode", { simple: true }));
```

运行：

```text
node src\db-check.js
```

## 1.3 屏幕上应该看到什么

```text
documents： 0 条
[]
{ documents: 0, sections: 0, chunks: 0 }
foreign_keys = 1
journal_mode = wal
```

`foreign_keys = 1` 是关键。**`0` 表示外键没开，级联删除不会生效。**

`journal_mode = wal` 表示写日志模式，读写可以并发，比默认的 `delete` 模式更适合"一边解析一边查"。

## 1.4 逐段解释

**三条 UNIQUE 各自管什么：**

`documents.path` 保证一个文件只有一条记录，重跑用 `ON CONFLICT` 更新；`sections(doc_id, page_no)` 保证一页只有一行；`chunks(section_id, seq)` 保证同一页的第 2 段只有一个。**三条加起来，重跑十次结果都一样，这就是幂等。**

**`token_est` 和 `content_hash` 现在就存的原因：** 前者给第 13 周估算 prompt 预算，后者给第 84 节做增量更新。都用 `Math.ceil(字符数 / 1.5)` 和 SHA-256，标注是估算，不保证和真实 tokenizer 一致。

**`status` 为什么要有 `needs_review`：**

OCR 的结果必须人工抽查。这个状态表示"解析成功，但不能直接信"。**状态机里留一个位置，比事后加字段便宜。**

## 1.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Could not locate the bindings file` | better-sqlite3 没编译成功 | `npm rebuild better-sqlite3`；还不行就装 VS Build Tools |
| `foreign_keys = 0` | pragma 没执行 | 确认 `db.pragma("foreign_keys = ON")` 在 `exec` 之前 |
| `SQLITE_ERROR: no such table` | 表没建 | 看 `db.exec` 有没有抛错 |
| 数据库文件在哪 | 在 `doc-parser\data\app.db` | `dir data` |
| `database is locked` | 另一个进程占着 | 关掉另一个 node 进程 |

---

# 第 2 步：统一接口 parse(filePath)（30 分钟）

## 2.1 做什么 / 为什么

**所有解析器对外只暴露一种返回形状：**

```text
{
  title: "XX市中小企业数字化转型补贴申报指南",
  format: "pdf",
  pages: [
    { page: 1, label: "第 1 页", text: "第一章 总则..." },
    { page: 2, label: "第 2 页", text: "第二章..." }
  ],
  needsReview: false
}
```

**为什么是 `pages` 而不是 `sections`：**

因为 PDF 天然有页，Excel 天然有 sheet，txt 只有"一整块"。**用"页"作为最小定位单位，三种来源都能映射：**

| 来源 | `page` 是什么 | `label` 是什么 |
|---|---|---|
| PDF | 真实页码 | `第 3 页` |
| xlsx | sheet 序号 | sheet 名字 |
| docx / txt | 固定 1 | `正文` |
| 图片 | 固定 1 | `OCR` |

第 13 周回答"出自第几页"时，就用这个 `page`。

## 2.2 操作

新建 `src\parse.js`：

```javascript
const path = require("path");
const { detectFormat } = require("./detect");
const { readTextFile, readDocx } = require("./read-text");
const { readTable } = require("./read-table");
const { readPdf, cleanPages, cleanText, analyzePdf } = require("./read-pdf");
const { ocrFile } = require("./ocr");

class ParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ParseError";
    this.code = code;
  }
}

async function parseTextDoc(filePath) {
  const r = readTextFile(filePath);
  return {
    title: r.title,
    pages: [{ page: 1, label: "正文", text: r.text }],
    needsReview: false,
  };
}

async function parseDocxDoc(filePath) {
  const r = await readDocx(filePath);
  return {
    title: r.title,
    pages: [{ page: 1, label: "正文", text: r.text }],
    needsReview: false,
  };
}

async function parseTableDoc(filePath) {
  const t = await readTable(filePath);
  return {
    title: t.title,
    pages: t.sheets.map((s) => ({
      page: s.page + 1,
      label: s.name,
      text: s.text,
    })),
    needsReview: false,
  };
}

async function parsePdfDoc(filePath) {
  const doc = await readPdf(filePath);
  const cleaned = cleanPages(doc.pages);
  const texted = cleanText(cleaned.pages);
  const report = analyzePdf(texted, doc.numpages);

  if (report.kind === "scanned") {
    throw new ParseError(
      "SCANNED_PDF",
      `第 ${doc.numpages} 页，平均每页 ${report.charsPerPage} 字，判定为扫描版，需要走 OCR`
    );
  }

  return {
    title: doc.title,
    pages: texted.map((p) => ({
      page: p.page,
      label: `第 ${p.page} 页`,
      text: p.text,
    })),
    needsReview: report.kind === "sparse",
    meta: report,
  };
}

async function parseImageDoc(filePath) {
  const engine = process.env.MOCK === "true" ? "mock" : "model";
  const r = await ocrFile(filePath, engine);

  return {
    title: path.basename(filePath, path.extname(filePath)),
    pages: [{ page: 1, label: "OCR", text: r.text }],
    needsReview: true,
    meta: { engine: r.engine, ms: r.ms },
  };
}

function pickParser(format, ext) {
  if (format === "text" && ext === ".csv") return parseTableDoc;
  if (format === "text") return parseTextDoc;
  if (format === "docx") return parseDocxDoc;
  if (format === "xlsx") return parseTableDoc;
  if (format === "pdf") return parsePdfDoc;
  if (format === "jpeg" || format === "png") return parseImageDoc;
  return null;
}

async function parse(filePath) {
  const det = detectFormat(filePath);
  const parser = pickParser(det.format, det.ext);

  if (!parser) {
    throw new ParseError(
      "UNSUPPORTED_FORMAT",
      `不支持 ${det.format}（扩展名 ${det.ext || "无"}）：${filePath}`
    );
  }

  const result = await parser(filePath);

  if (!result || typeof result.title !== "string" || !Array.isArray(result.pages)) {
    throw new ParseError("BAD_RESULT", "解析器返回的结构不合法");
  }

  if (result.pages.length === 0) {
    throw new ParseError("EMPTY_PAGES", "解析器没有返回任何页");
  }

  for (const p of result.pages) {
    if (!Number.isInteger(p.page) || typeof p.text !== "string") {
      throw new ParseError("BAD_PAGE", `页结构不合法：${JSON.stringify(p).slice(0, 100)}`);
    }
  }

  const totalChars = result.pages.reduce(
    (sum, p) => sum + p.text.replace(/\s/g, "").length,
    0
  );

  if (totalChars === 0) {
    throw new ParseError("EMPTY_TEXT", "所有页都是空文本");
  }

  return {
    ...result,
    format: det.format,
    ext: det.ext,
    totalChars,
  };
}

module.exports = { parse, ParseError, pickParser };
```

**注意：** 第 81 节如果你没把 `analyzePdf` 加进 `read-pdf.js` 的 `module.exports`，现在补上：

```javascript
module.exports = {
  readPdf,
  renderPage,
  cleanPages,
  cleanText,
  analyzePdf,
  joinWrappedLines,
  collapseBlankLines,
  detectRepeatedEdges,
  isPageNumber,
};
```

先不写库，直接跑：

```text
node -e "require('./src/parse').parse('samples/政策.pdf').then(r=>console.log(r.title, r.pages.length, r.totalChars)).catch(e=>console.error(e.code, e.message))"
```

cmd 的引号很麻烦，新建 `src\parse-lab.js`：

```javascript
const { parse } = require("./parse");

parse(process.argv[2])
  .then((r) => console.log(r.title, "|", r.format, "|", r.pages.length, "页 |", r.totalChars, "字 | 复核:", r.needsReview))
  .catch((e) => console.error("失败：", e.code, "|", e.message));
```

运行四种：

```text
node src\parse-lab.js samples\政策.pdf
node src\parse-lab.js samples\会议纪要.docx
node src\parse-lab.js samples\预算.xlsx
node src\parse-lab.js samples\扫描件.pdf
```

## 2.3 屏幕上应该看到什么

四个文件依次跑：

```text
XX市中小企业数字化转型补贴申报指南 | pdf | 6 页 | 2982 字 | 复核: false
会议纪要 | docx | 1 页 | 186 字 | 复核: false
预算 | xlsx | 2 页 | 186 字 | 复核: false
失败： SCANNED_PDF | 第 1 页，平均每页 0 字，判定为扫描版，需要走 OCR
```

**注意最后这个是"失败"，不是"成功但空"。** 这是刻意的：**扫描版应该被显式地拒绝，而不是悄悄入库一条 0 字记录。** 后面做 OCR 是另一条路径（第 82 节），不在 `pdf-parse` 里硬撑。

## 2.4 逐段解释

**为什么 `pickParser` 要同时看 `format` 和 `ext`：**

`.csv` 和 `.txt` 的 `format` 都是 `text`，但解析器不同。**这是第 78 节留下的那个转折，现在正式处理。**

**为什么 `parse` 要做结构校验：**

任何一个解析器写错，都会让脏数据流到数据库。**在最外层校验一次，比在数据库里发现 `text` 是 `undefined` 便宜。**

**为什么 `EMPTY_TEXT` 要单独一个错误码：**

"解析成功但没字"是最危险的情况。单独的 code 能让你在日志里一眼筛选出来，也能让上层决定"是不是走 OCR"。

**为什么 `parseImageDoc` 标 `needsReview: true`、`parse` 又是 async：**

OCR 结果必须人工抽查，这个标记会一路传到 `documents.status = 'needs_review'`。pdf、docx、xlsx、OCR 都是异步的，统一成 async，上层只写一种调用方式。

## 2.5 如果不是这样

`analyzePdf is not a function` → 上一节没导出，补 `module.exports`。`BAD_PAGE` → 某个解析器的 `page` 不是整数，打印它的返回值。`Cannot find module './read-pdf'` → 文件没复制过来，`dir src` 确认。

---

# 第 3 步：写进三张表（30 分钟）

## 3.1 做什么 / 为什么

入库要解决四件事：

1. **同一个文件重跑，不能产生两条文档**；
2. **重跑要覆盖旧的分页和切片**，不能越跑越多；
3. **一个文件的入库要么全成，要么全不成**；
4. **失败要留下原因**，不能只打印到屏幕。

## 3.2 操作

新建 `src\store.js`：

```javascript
const path = require("path");
const crypto = require("crypto");
const db = require("./db");
const { parse } = require("./parse");
const { detectFormat } = require("./detect");

function toRelative(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath)).replace(/\\/g, "/");
}

function estimateTokens(text) {
  return Math.ceil(text.replace(/\s/g, "").length / 1.5);
}

function splitParagraphs(text, maxLen = 1200) {
  const paras = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const out = [];

  for (const p of paras) {
    if (p.length <= maxLen) {
      out.push(p);
      continue;
    }

    let rest = p;
    while (rest.length > maxLen) {
      let cut = rest.lastIndexOf("。", maxLen);
      if (cut < maxLen * 0.5) cut = maxLen - 1;
      out.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest.length > 0) out.push(rest);
  }

  return out;
}

const saveTransaction = db.transaction((relPath, parsed) => {
  const fullText = parsed.pages.map((p) => p.text).join("\n\n");
  const contentHash = crypto.createHash("sha256").update(fullText).digest("hex");
  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT id FROM documents WHERE path = ?")
    .get(relPath);

  let docId;

  if (existing) {
    docId = existing.id;
    db.prepare(`
      UPDATE documents
      SET format = ?, title = ?, status = 'parsing', error = NULL,
          updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(parsed.format, parsed.title, docId);

    db.prepare("DELETE FROM sections WHERE doc_id = ?").run(docId);
  } else {
    const info = db.prepare(`
      INSERT INTO documents (path, format, title, status)
      VALUES (?, ?, ?, 'parsing')
    `).run(relPath, parsed.format, parsed.title);
    docId = info.lastInsertRowid;
  }

  const insertSection = db.prepare(`
    INSERT INTO sections (doc_id, page_no, label, heading, text, char_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (doc_id, section_id, page_no, seq, text, char_count, token_est)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let sectionCount = 0;
  let chunkCount = 0;

  for (const page of parsed.pages) {
    const sectionInfo = insertSection.run(
      docId,
      page.page,
      page.label || null,
      page.heading || null,
      page.text,
      page.text.length
    );
    const sectionId = sectionInfo.lastInsertRowid;
    sectionCount += 1;

    const parts = splitParagraphs(page.text);
    let seq = 0;

    for (const part of parts) {
      insertChunk.run(
        docId,
        sectionId,
        page.page,
        seq,
        part,
        part.length,
        estimateTokens(part)
      );
      seq += 1;
      chunkCount += 1;
    }
  }

  const status = parsed.needsReview ? "needs_review" : "success";

  db.prepare(`
    UPDATE documents
    SET page_count = ?, char_count = ?, chunk_count = ?, content_hash = ?,
        status = ?, error = NULL, parsed_at = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(
    parsed.pages.length,
    fullText.length,
    chunkCount,
    contentHash,
    status,
    now,
    docId
  );

  return { docId, sectionCount, chunkCount, status, contentHash };
});

function markFailed(relPath, err) {
  let format = "unknown";
  try {
    format = detectFormat(relPath).format;
  } catch (e) {
    format = "unknown";
  }

  const existing = db.prepare("SELECT id FROM documents WHERE path = ?").get(relPath);

  if (existing) {
    db.prepare(`
      UPDATE documents
      SET status = 'failed', error = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(String(err.message || err).slice(0, 1000), existing.id);
  } else {
    db.prepare(`
      INSERT INTO documents (path, format, title, status, error)
      VALUES (?, ?, ?, 'failed', ?)
    `).run(relPath, format, path.basename(relPath), String(err.message || err).slice(0, 1000));
  }
}

async function parseOne(filePath) {
  const relPath = toRelative(filePath);

  try {
    const parsed = await parse(filePath);
    const result = saveTransaction(relPath, parsed);
    return { ok: true, path: relPath, ...result };
  } catch (err) {
    markFailed(relPath, err);
    return {
      ok: false,
      path: relPath,
      code: err.code || "PARSE_FAILED",
      message: err.message,
    };
  }
}

module.exports = {
  toRelative,
  estimateTokens,
  splitParagraphs,
  parseOne,
  markFailed,
};
```

新建 `src\parse-cli.js`：

```javascript
const db = require("./db");
const { parseOne } = require("./store");

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--list-failed") {
    const rows = db.prepare(`
      SELECT id, path, format, error, updated_at
      FROM documents WHERE status = 'failed' ORDER BY id
    `).all();
    for (const r of rows) {
      console.log(`id=${r.id}  path=${r.path}  format=${r.format}  error=${r.error}`);
    }
    return;
  }

  if (args[0] === "--retry") {
    const rows = db.prepare(`
      SELECT path FROM documents WHERE status = 'failed' ORDER BY id
    `).all();

    console.log("待重试：", rows.length, "个");

    for (const row of rows) {
      const r = await parseOne(row.path);
      if (r.ok) {
        console.log("[重试成功]", r.path, "| sections:", r.sectionCount, "| chunks:", r.chunkCount);
      } else {
        console.log("[仍然失败]", r.path, "|", r.code, "|", r.message);
      }
    }
    return;
  }

  if (args.length === 0) {
    console.log("用法：");
    console.log("  node src\\parse-cli.js samples\\政策.pdf");
    console.log("  node src\\parse-cli.js --list-failed");
    console.log("  node src\\parse-cli.js --retry");
    return;
  }

  for (const file of args) {
    const r = await parseOne(file);
    if (r.ok) {
      console.log("[成功]", r.path);
      console.log("  docId：", r.docId);
      console.log("  sections：", r.sectionCount);
      console.log("  chunks：", r.chunkCount);
      console.log("  status：", r.status);
    } else {
      console.log("[失败]", r.path, "|", r.code, "|", r.message);
    }
  }
}

main().catch((err) => {
  console.error("崩了：", err);
  process.exit(1);
});
```

运行：

```text
node src\parse-cli.js samples\政策.pdf
node src\db-check.js
```

## 3.3 屏幕上应该看到什么

```text
[成功] samples/政策.pdf
  docId： 1
  sections： 6
  chunks： 28
  status： success
```

```text
documents： 1 条
id=1  path=samples/政策.pdf  format=pdf  status=success  pages=6  chunks=28
{ documents: 1, sections: 6, chunks: 28 }
```

**注意：`path` 很长时一行会折行，这是正常的。** 它只影响观感，不影响数据。

再跑一次同一个文件：

```text
node src\parse-cli.js samples\政策.pdf
node src\db-check.js
```

```text
documents： 1 条
{ documents: 1, sections: 6, chunks: 28 }
```

**`documents` 还是 1 条，`sections` 还是 6，`chunks` 还是 28。** 这就是幂等：重跑不产生重复。

## 3.4 逐段解释

**为什么先 `DELETE FROM sections WHERE doc_id = ?`：**

`sections` 有 `ON DELETE CASCADE`，删 section 会连带删它的 chunks。**所以这一行同时清掉了旧的分页和旧的切片。** 不用单独删 chunks。

**为什么整个入库在一个 `db.transaction()` 里：**

如果插完 3 个 section，第 4 个报错（比如文本太长、字段不合法），前面 3 个不应该留在库里。**事务保证"要么 6 页都在，要么一页都不在"。**

**为什么 `path` 存相对路径、并且把 `\` 换成 `/`：**

`path.relative(process.cwd(), ...)` 存成 `samples/政策.pdf`，换机器、换盘符仍然有效。统一用 `/` 是为了 Windows 和 Linux 都能读，这是跨平台的最小代价。

**`splitParagraphs` 为什么上限是 1200 字：**

这一节只是"粗切"，保证一行 chunk 不会大到没法处理。**真正的切分策略（400–800 字、80–150 重叠）是第 13 周第 85 节的内容。** 现在先按段落切，把表结构和链路跑通，下周在同一张表上重切。

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `UNIQUE constraint failed: documents.path` | 你的 upsert 写成了纯 INSERT | 先查再插，或 `ON CONFLICT` |
| 重跑后 chunks 翻倍 | 没删旧 sections | 加 `DELETE FROM sections` |
| `FOREIGN KEY constraint failed` | `section_id` 不存在 | 确认 section 先插 |
| `docId` 是 `undefined` | `lastInsertRowid` 拼错 | 用 `info.lastInsertRowid` |
| `path` 很长显示折行 | 终端宽度 | 正常，不影响数据 |
| `status` 一直是 `parsing` | 最后那条 UPDATE 没执行 | 看事务里有没有抛错 |

---

# 第 4 步：失败、重试、级联（20 分钟）

## 4.1 做什么 / 为什么

**流水线最重要的不是"成功时多快"，是"失败时留下什么"。**

一个坏文件应该：

1. 让这条记录变成 `failed`；
2. `error` 里写清原因；
3. 不影响别的文件；
4. 修好之后能单独重试。

## 4.2 操作

先造一个坏文件：

```text
copy /b samples\政策.pdf + samples\政策.pdf samples\坏文件.pdf
```

这会把两个 PDF 首尾拼起来，`pdf-parse` 大概率报错，或者解析出乱七八糟的内容。**这正是我们想要的"真实坏文件"。**

跑：

```text
node src\parse-cli.js samples\坏文件.pdf
node src\parse-cli.js --list-failed
```

然后修好它（用正常的 `政策.pdf` 覆盖），重试：

```text
copy /y samples\政策.pdf samples\坏文件.pdf
node src\parse-cli.js --retry
```

再验证级联删除，新建 `src\cascade-lab.js`：

```javascript
const db = require("./db");
const counts = () => db.prepare(`
  SELECT (SELECT COUNT(*) FROM documents) documents,
         (SELECT COUNT(*) FROM sections) sections,
         (SELECT COUNT(*) FROM chunks) chunks
`).get();

console.log("删除前：", counts());
const doc = db.prepare("SELECT id, path FROM documents ORDER BY id LIMIT 1").get();
db.prepare("DELETE FROM documents WHERE id = ?").run(doc.id);
console.log("删除后：", counts(), "| 删除了", doc.path);
```

运行：

```text
node src\cascade-lab.js
```

## 4.3 屏幕上应该看到什么

坏文件：

```text
[失败] samples/坏文件.pdf | PARSE_FAILED | Invalid PDF structure.
```

失败清单：

```text
id=2  path=samples/坏文件.pdf  format=pdf  error=Invalid PDF structure.
```

重试：

```text
待重试： 1 个
[重试成功] samples/坏文件.pdf | sections: 6 | chunks: 28
```

级联删除：

```text
删除前： { documents: 2, sections: 12, chunks: 56 }
删除了： samples/政策.pdf
删除后： { documents: 1, sections: 6, chunks: 28 }
```

**删一条文档，它的 6 个 section 和 28 个 chunk 一起没了。** 这就是 `ON DELETE CASCADE` + `foreign_keys = ON` 的效果。

## 4.4 为什么要单独重试

批量跑 300 个文件，有 3 个失败。全部重跑要几十分钟，还可能把成功的搞坏；只重试失败的只要几秒。**`--retry` 只查 `status = 'failed'` 的行，成功的记录一动不动。** 失败记录也不要删：`error` 是一份证据，客户问起来你能直接答。

## 4.5 如果不是这样

坏文件也"成功"了 → 用真正损坏的文件，别用拼接 PDF。删除后 sections 还在 → 外键没开。`--retry` 找不到文件 → 在 `doc-parser` 目录下跑，别在上一级跑。

---

# 第 5 步：故意犯 4 个错（15 分钟）

## 错误 1：忘了开外键

**操作：** 把 `db.pragma("foreign_keys = ON")` 注释掉，重跑 `cascade-lab.js`。

**现象：**

```text
删除前： { documents: 2, sections: 12, chunks: 56 }
删除了： samples/政策.pdf
删除后： { documents: 1, sections: 12, chunks: 56 }
```

**文档没了，分页和切片还在。** 它们变成了孤儿，永远查不到，永远占空间。

**原因：** SQLite 的外键约束默认是**关闭**的，这是历史兼容性决定。你写了 `ON DELETE CASCADE` 只是"声明"，不开 pragma 就不执行。

**怎么查：** `db.pragma("foreign_keys", { simple: true })`，必须是 `1`。

## 错误 2：用 `INSERT OR REPLACE` 更新文档

**操作：** 把 upsert 改成：

```sql
INSERT OR REPLACE INTO documents (path, format, title, status)
VALUES (?, ?, ?, 'parsing')
```

**现象：** 重跑之后，`documents.id` 从 1 变成了 2。旧的 `sections.doc_id = 1` 全部变成孤儿（如果外键开着，会被级联删除，你的分页就没了）。

**原因：** `INSERT OR REPLACE` 不是"更新"，是"先 DELETE 再 INSERT"。**DELETE 会触发级联删除。**

**怎么查：** 重跑前后对比 `documents.id`。变了就是踩了这个坑。

**正确做法：** 先 `SELECT id`，有就 `UPDATE`，没有才 `INSERT`。或者用 `ON CONFLICT(path) DO UPDATE`（它执行的是 UPDATE，不删行）。

## 错误 3：把整批文件放在一个事务里

**操作：** 在 `parse-cli.js` 里把整批包在一个事务里，并且让异常往外抛：

```javascript
db.exec("BEGIN");
try {
  for (const f of files) {
    const parsed = await parse(f);
    saveTransaction(toRelative(f), parsed);
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}
```

**现象：** 第 37 个文件失败，抛出的异常让整个事务回滚。**前面 36 个成功的结果全部消失。**

**原因：** 事务的语义是"全成或全不成"。批量场景里，你要的是"每个文件各自成或不成"。

**怎么查：** 跑一批里有坏文件的，看成功的那几个在不在库里。

**正确做法：** 事务的边界是"一个文件"，不是"一批文件"。**第 84 节的流水线会按这个原则写。**

## 错误 4：存绝对路径

**操作：** 把 `toRelative` 改成 `return filePath;`。

**现象：** 数据库里是：

```text
C:/OPC-Distance_study/每周课程/03-数据与智能/第12周-文档解析/第06节课/03-练习代码/doc-parser/samples/政策.pdf
```

你把项目复制到 `D:\work\doc-parser`，`--retry` 全部失败：

```text
[仍然失败] C:/OPC-.../政策.pdf | PARSE_FAILED | ENOENT: no such file or directory
```

**原因：** 绝对路径绑定了"文件在这台机器的这个位置"。

**怎么查：** `SELECT path FROM documents`，看是不是以盘符开头。

## 四个错误总结

```text
不开外键              → 删文档留下孤儿
INSERT OR REPLACE     → id 变，级联删掉分页
整批一个事务          → 一个坏文件毁一批
存绝对路径            → 项目一搬家全失效
```

---

# 第 6 步：写学习笔记（10 分钟）

在 `第06节课\02-笔记\NOTES.md` 里写，小标题照下面抄：

## 一、三张表各管什么

## 二、documents 表的设计理由

## 三、sections 和 page_no 的语义

## 四、chunks 表为什么这么设计（W13 要用）

## 五、统一接口 parse(filePath)

## 六、错误类型和错误码

## 七、单文件重试怎么做到

## 八、外键和级联删除

## 九、四个错误的后果

## 十、我还不懂的词

## 十一、完成检查

---

# 第 7 步：课后练习

## 练习一：加一个 `--stats` 命令

输出：

```text
文档总数：12
成功：9
需要复核：2
失败：1
总页数：86
总切片：412
按格式：pdf 8, docx 2, xlsx 1, text 1
```

**要求：** 一条 SQL 查完，不要写多个循环。

## 练习二：实现"内容没变就跳过"

用 `content_hash` 判断：

```text
if (existing.content_hash === newHash && existing.status === 'success') {
  // 跳过，不删旧数据
}
```

**要求：** 在 `parseOne` 里加一个 `force` 参数，`--force` 时强制重跑。输出要能看出"跳过了几个"。

## 练习三：给 `sections` 加一个标题识别

很多 PDF 的章节标题是短行（少于 30 字）且以"第X章""一、""1."开头。

**要求：** 在解析时识别 `heading`，写进 `sections.heading`。识别不出来就留 `null`。

**注意：** 不要为了识别标题把正文删了。`heading` 是附加信息，`text` 仍然是完整原文。

## 练习四：画一张你的表关系图

**要求：** 手画或用工具画 `documents → sections → chunks` 的关系，标出：

- 主键；
- 外键；
- 唯一约束；
- 级联删除的方向。

贴在笔记里。**画不出来，说明你还没理解这三张表。**

## 练习五：用自己的话讲清

1. 为什么不是一张大表？三张表各自解决了什么问题？
2. 为什么 `INSERT OR REPLACE` 会毁掉分页？
3. 事务的边界为什么是"一个文件"，不是"一批文件"？
4. 第 13 周要用 `chunks` 做什么？现在的表结构够不够？

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能说清三张表各存什么、谁引用谁
- [ ] 我知道外键默认是关的
- [ ] 我能解释 `ON DELETE CASCADE` 和 `foreign_keys` 的关系
- [ ] 我知道 `page_no` 在 pdf / xlsx / txt 里分别代表什么
- [ ] 我能说出 `chunks` 表第 13 周怎么用

## B. 实操

- [ ] `node src\db-check.js` 显示 `foreign_keys = 1`
- [ ] 三张表都建好了
- [ ] `node src\parse-cli.js samples\政策.pdf` 成功入库
- [ ] 重跑同一个文件，`documents` 还是 1 条
- [ ] `node src\parse-cli.js samples\扫描件.pdf` 报 `SCANNED_PDF`
- [ ] `--list-failed` 能看到失败记录和 error
- [ ] `--retry` 能把修好的文件重新入库
- [ ] `cascade-lab.js` 删除文档后，sections 和 chunks 一起减少

## C. 排错

- [ ] `UNIQUE constraint failed` → 我知道是 upsert 写错
- [ ] 孤儿数据 → 我知道查 `foreign_keys`
- [ ] `docId` 是 undefined → 我知道查 `lastInsertRowid`
- [ ] 重跑翻倍 → 我知道要删旧 sections
- [ ] `ENOENT` 在 retry 时 → 我知道是绝对路径问题

## D. 笔记

- [ ] `NOTES.md` 十一个小标题都在
- [ ] 表关系图我画了
- [ ] "四个错误"那张表填满了
- [ ] `chunks` 表的设计理由写了自己的话

## 本节课要能说出口的一句话

> **解析器对外只有一种形状，存储对内只有一种真相：文档、页、切片分开存，靠 id 连起来，删一个全带走。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Could not locate the bindings file` | better-sqlite3 编译 | `npm rebuild better-sqlite3` |
| `database is locked` | 另一个进程占着 | 关掉别的 node |
| `no such table` | 没执行建表 SQL | 看 `db.exec` 有没有报错 |
| 外键不生效 | pragma | `foreign_keys = ON` |
| 重跑数据翻倍 | 没删旧 sections | `DELETE FROM sections` |
| `docId` undefined | `lastInsertRowid` | 用 `info.lastInsertRowid` |
| `UNIQUE constraint failed` | 重复插入 | 先查后插 |
| 中文表格错位 | 终端宽度 | 不影响数据 |
| `--retry` 找不到文件 | cwd 变了 | 在项目根目录跑 |
| `EMPTY_TEXT` | 扫描版 | 走 OCR，不要硬入库 |
| `SCANNED_PDF` | 判定正确 | 这是预期行为 |
| 数据库太大 | WAL 文件 | `PRAGMA wal_checkpoint(TRUNCATE)` |
