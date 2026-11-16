# 第 84 节课：完成文档入库

> 这节课结束时，你手上有：`src\pipeline.js`（一条命令跑完整个目录）、`src\report.js`（生成入库报告）、`out\import-report.md`（这批处理的完整结果），以及 `data\app.db` 里三个文件全部 `success`、`chunks` 表有真实数据。

**时间**：约 110 分钟
**前置**：第 83 节课的 `parseOne()`、`parse-cli.js --retry`，以及 `documents / sections / chunks` 三张表

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能对**一个文件**跑：

```text
node src\parse-cli.js samples\政策.pdf
```

输出 `[成功]`、`docId`、`sections`、`chunks`。**一个文件，一条命令。**

**如果客户给你 300 个文件呢？**

## 0.2 今天这个坑长什么样

> 客户给了一个压缩包，解开是 287 个文件：docx、xlsx、pdf、还有几十张手机拍的扫描件。
>
> 你写了个循环：
>
> ```javascript
> for (const f of files) {
>   await parseOne(f);
> }
> ```
>
> 跑了 40 分钟，屏幕上滚了半天。跑完了。
>
> **然后客户问："都进去了吗？"**
>
> 你看着屏幕，答不上来。因为：
>
> ```text
> 287 个文件，成功几个？失败几个？
> 失败的那几个，是哪几个？为什么失败？
> 有一半是"扫描件没有文字层"，这不是失败，是"需要 OCR"，是另一回事
> 其中 3 个文件内容完全一样（客户重复放了），算不算重复入库？
> 跑到一半你按过 Ctrl+C 一次，那次之后重跑的，会不会有重复？
> ```
>
> **一个都答不上来。**

**批量处理和数据采集是同一类问题：不是"能不能跑"，是"跑完你敢不敢说清结果"。**

**这一节要补的，就是那个"结果"。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 流水线（pipeline） | 把"扫目录 → 探测 → 解析 → 入库"串成一条固定顺序的命令 | 第 1、2 步 |
| 幂等（idempotent） | 同一批文件跑一次和跑三次，库里结果一样 | 第 3 步，内容 hash 判断 |
| 分类统计（breakdown） | 不要只报"成功/失败"，要分到"为什么失败" | 第 4 步，报告 |

**为什么"失败"必须分类：**

```text
统一叫"失败"，你会做错决定：

  你以为：37 个失败，代码有 bug，要修
  实际是：31 个是扫描件（需要 OCR，第 82 节已经做了，但这条流水线没接上）
          4 个是密码保护的 PDF（客户的问题，不是你的）
          2 个是 0 字节的空文件（客户的问题）
          0 个是代码 bug

  → 你花两天"修 bug"，其实什么都不用修，只需要接上 OCR 分支，
    然后给客户发一句话："这 6 个文件麻烦重发一下"
```

**统计口径决定你的工作方向。口径错了，劲儿全白费。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `src\pipeline.js` | `第07节课\03-练习代码\doc-parser\` | 扫目录 → 分类 → 解析 → 入库 → 汇总 |
| `src\report.js` | 同上 | 读库生成 markdown 报告 |
| `out\import-report.md` | 同上 `out\` | 本次批处理的完整结果 |
| `data\app.db` | 同上 `data\` | 三个文件全部 `success`，`chunks` 有数据 |
| `NOTES.md` | `第07节课\02-笔记\` | 第 6 步填 |

**这一节做完，`chunks` 表就是第 13 周检索的输入。** 表结构不用改，直接能用。

---

# 第 1 步：先想清楚"什么算失败"（15 分钟）

## 1.1 做什么 / 为什么

**做什么：** 在写代码之前，先把"一个文件处理完之后可能是哪种状态"列出来。

**为什么要先列状态，不先写循环：**

因为**你的 `for` 循环写出来的那一刻，统计口径就定死了。**

```javascript
for (const f of files) {
  try {
    await parseOne(f);
    ok.push(f);
  } catch (e) {
    bad.push(f);
  }
}
```

这段代码的口径是"抛异常 = 失败"。**但真实世界里，一个文件处理完有六种结果，其中只有一种该扔进 `bad`。**

## 1.2 六种结果

| 结果 | 判定依据 | 该算成功还是失败 | 该谁处理 |
|---|---|---|---|
| **成功** | 解析出文字，入库，`status='success'` | 成功 | 无 |
| **跳过：内容没变** | 库里已有同 `path` 且同 `content_hash` | 成功（幂等） | 无 |
| **跳过：重复文件** | 库里已有不同 `path` 但同 `content_hash` | 成功（去重） | 无 |
| **需要 OCR** | 是 PDF/图片，但文字数近似 0 | **不是失败** | 你：接上第 82 节的 OCR |
| **需要人工** | 解析出部分文字，但字段缺失/乱码比例过高 | **不是失败** | 你 + 客户确认 |
| **真失败** | 文件损坏、加密、格式不支持、读不了 | 失败 | 客户重发 / 你改代码 |

**关键结论：六种里只有最后一种叫"失败"。**

```text
把 4 和 5 扔进"失败"，你会去查一个不存在的 bug
把 6 扔进"成功"，你会在第 13 周发现检索不到这个文件，然后重新查一遍
```

## 1.3 怎么判定"需要 OCR"

第 81 节课已经写了 `isScanned()`，这里直接用同样的口径：

```javascript
function looksScanned(format, pages) {
  if (format !== "pdf" && format !== "image") return false;
  const totalChars = pages.reduce((n, p) => n + p.text.replace(/\s/g, "").length, 0);
  const perPage = pages.length === 0 ? 0 : totalChars / pages.length;
  return perPage < 20;
}
```

**`20` 这个阈值不是随便定的。** 一页正常的 A4 文字文档，去掉空白后大约 600–1200 字。一页扫描件，`pdf-parse` 会返回 0 到十几个字符（有时是页眉的页码被当成文字层）。**20 是一个刻意偏低的阈值 —— 宁可漏判（把扫描件当成功），也不要错判（把文字版当扫描件去做 OCR，浪费时间还容易出错）。**

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 你的文件全被判成"需要 OCR" | 阈值定太高 | 打印每页字符数，看正常文件到底多少 |
| 一页 300 字的文件被判成扫描件 | 那可能真是一页只有图的 PPT 导出 | 阈值降到 10，或按整份文件判而不是按页判 |
| 图片格式被 `pdf-parse` 处理 | 分派表写错 | `format === "image"` 要走 OCR 分支，不走 pdf |

---

# 第 2 步：写流水线主循环（30 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `pipeline.js`，扫目录、逐个处理、实时打印进度、最后汇总。

**为什么要实时打印进度：**

287 个文件，跑 40 分钟。**如果什么都不打印，你会以为它卡死了，然后 Ctrl+C，然后前功尽弃。**

**进度输出要包含三个信息：**

```text
[23/287] 财务制度.docx  success  sections=5 chunks=12   1841ms
         ↑当前位置  ↑文件名   ↑结果    ↑产出            ↑耗时
```

**为什么要有 `[23/287]`：** 你随时知道还剩多少，能判断"现在按 Ctrl+C，损失多少"。

**为什么要有单文件耗时：** 平均 8 秒 × 287 个约 38 分钟。**这个数字你开工前就能算出来，也能在跑到一半时验证"是不是有某个文件特别慢"。**

## 2.2 操作

**1.** 复制上一节的项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第12周-文档解析\第07节课\03-练习代码"
xcopy /E /I /Y "..\第06节课\03-练习代码\doc-parser" doc-parser
cd doc-parser
```

**2.** 准备 `samples\`，至少三个文件：

```text
samples\
├── 政策.pdf          ← 文字版 PDF，第 81 节用过
├── 会议纪要.docx      ← 第 79 节用过
├── 预算.xlsx         ← 第 80 节用过
└── 照片.jpg          ← 第 82 节的扫描件（可选）
```

**如果 `samples\` 空了**（第 12 周第 1 节让你 `.gitignore` 它，重新 clone 会没有）：

```text
政策.pdf      → 政府/学校官网下载一份公开的制度文件
会议纪要.docx → Word 新建，写三行字，另存为 .docx
预算.xlsx     → Excel 新建，填两行三列，另存为 .xlsx
照片.jpg      → 手机拍一张印着字的纸
```

**3.** 新建 `src\pipeline.js`：

```javascript
// pipeline.js —— 扫一个目录，把里面所有支持的文件解析入库
// 用法：node src\pipeline.js samples
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { detectFormat } = require("./detect");
const { parseOne, toRelative } = require("./store");

const SUPPORTED = new Set(["txt", "md", "csv", "docx", "xlsx", "pdf", "image"]);

// ---------- 扫目录 ----------
function walk(dir, acc, depth) {
  const d = depth === undefined ? 0 : depth;
  if (d > 20) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(full, acc, d + 1);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

// ---------- 分类：只允许这六个返回值 ----------
function classify(result) {
  if (result.ok !== true) {
    const code = result.code || "PARSE_FAILED";
    if (code === "NEED_OCR") return "need_ocr";
    if (code === "NEED_REVIEW") return "need_review";
    return "failed";
  }
  if (result.skipped === true) {
    return result.duplicateOf === null || result.duplicateOf === undefined
      ? "skipped_unchanged"
      : "skipped_duplicate";
  }
  return "success";
}

// ---------- 主流程 ----------
async function main() {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.log("用法：node src\\pipeline.js <目录>");
    console.log("      例：node src\\pipeline.js samples");
    return;
  }
  if (!fs.existsSync(dir)) {
    console.error("目录不存在：" + dir);
    process.exitCode = 1;
    return;
  }

  const all = walk(path.resolve(dir), []);
  const files = [];
  const unsupported = [];

  for (const f of all) {
    let fmt;
    try {
      fmt = detectFormat(f);
    } catch (err) {
      unsupported.push({ file: toRelative(f), reason: "探测失败：" + err.message });
      continue;
    }
    if (!SUPPORTED.has(fmt)) {
      unsupported.push({ file: toRelative(f), reason: "不支持的格式：" + fmt });
      continue;
    }
    files.push({ full: f, format: fmt });
  }

  console.log("=== 开始批处理 ===");
  console.log("目录：" + path.resolve(dir));
  console.log("扫描到文件：" + all.length + " 个");
  console.log("可处理：" + files.length + " 个");
  console.log("跳过（不支持）：" + unsupported.length + " 个");
  console.log("");

  const t0 = Date.now();
  const buckets = {
    success: [],
    skipped_unchanged: [],
    skipped_duplicate: [],
    need_ocr: [],
    need_review: [],
    failed: [],
  };

  const width = String(files.length).length;

  for (let i = 0; i < files.length; i += 1) {
    const item = files[i];
    const seq = "[" + String(i + 1).padStart(width, " ") + "/" + files.length + "]";
    const rel = toRelative(item.full);
    const startOne = Date.now();

    let result;
    try {
      result = await parseOne(item.full);
    } catch (err) {
      result = { ok: false, code: "PIPELINE_ERROR", message: err.message, path: rel };
    }

    const kind = classify(result);
    const ms = Date.now() - startOne;

    let tail;
    if (kind === "success") {
      tail = "sections=" + result.sectionCount + " chunks=" + result.chunkCount;
    } else if (kind === "skipped_unchanged" || kind === "skipped_duplicate") {
      tail = "原因=" + (result.reason === undefined ? kind : result.reason);
    } else {
      tail = "code=" + (result.code === undefined ? "-" : result.code) +
        " msg=" + String(result.message === undefined ? "" : result.message).slice(0, 60);
    }

    console.log(seq + " " + rel.padEnd(34) + " " + kind.padEnd(18) + tail + "  " + ms + "ms");
    buckets[kind].push({ file: rel, result: result, ms: ms });
  }

  const totalMs = Date.now() - t0;

  console.log("");
  console.log("=== 汇总 ===");
  const order = ["success", "skipped_unchanged", "skipped_duplicate", "need_ocr", "need_review", "failed"];
  let sum = 0;
  for (const k of order) {
    console.log("  " + k.padEnd(18) + buckets[k].length);
    sum += buckets[k].length;
  }
  console.log("  " + "不支持".padEnd(16) + unsupported.length);
  console.log("");
  console.log("核对：" + sum + " + " + unsupported.length + " = " + (sum + unsupported.length) +
    "（扫描到 " + all.length + "）");
  console.log("总耗时：" + (totalMs / 1000).toFixed(1) + " 秒");
  if (files.length > 0) {
    console.log("平均每个：" + Math.round(totalMs / files.length) + " ms");
  }

  // 把详细结果写成 JSON，给 report.js 用
  const outDir = path.join(__dirname, "..", "out");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const dumpPath = path.join(outDir, "last-run.json");
  fs.writeFileSync(
    dumpPath,
    JSON.stringify({ dir: path.resolve(dir), totalMs: totalMs, buckets: buckets, unsupported: unsupported }, null, 2),
    "utf8"
  );
  console.log("");
  console.log("详细结果：" + dumpPath);

  // 失败清单单独一份纯文本，能直接发给客户
  if (buckets.failed.length > 0) {
    const failPath = path.join(outDir, "fail-list.txt");
    const lines = buckets.failed.map((x) => x.file + "\t" + (x.result.message || ""));
    fs.writeFileSync(failPath, lines.join("\n"), "utf8");
    console.log("失败清单：" + failPath);
  }

  process.exitCode = buckets.failed.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("流水线崩了：", err);
  process.exitCode = 1;
});
```

**4.** 跑：

```text
node src\pipeline.js samples
```

## 2.3 屏幕上应该看到什么

```text
>node src\pipeline.js samples
数据库：B:\...\doc-parser\data\app.db
三张表已就绪
=== 开始批处理 ===
目录：B:\...\doc-parser\samples
扫描到文件：4 个
可处理：4 个
跳过（不支持）：0 个

[1/4] samples/政策.pdf            success            sections=6 chunks=14  1841ms
[2/4] samples/会议纪要.docx        success            sections=1 chunks=2  243ms
[3/4] samples/预算.xlsx            success            sections=2 chunks=4  318ms
[4/4] samples/照片.jpg            need_ocr           code=NEED_OCR msg=每页平均 0.0 字，判定为扫描件  96ms

=== 汇总 ===
  success            3
  skipped_unchanged  0
  skipped_duplicate  0
  need_ocr           1
  need_review        0
  failed             0
  不支持              0

核对：4 + 0 = 4（扫描到 4）
总耗时：2.5 秒
平均每个：624 ms

详细结果：B:\...\doc-parser\out\last-run.json
```

**注意四件事：**

```text
① [1/4] 这样的序号 —— 你随时知道进度
② 每行末尾的 ms —— 1841 / 243 / 318 / 96，一眼看出 PDF 最慢
③ 照片.jpg 是 need_ocr，不是 failed —— 分类口径在起作用
④ "核对：4 + 0 = 4（扫描到 4）" —— 数字必须自洽
```

**第 ④ 条是最重要的自检。** 所有分类加起来必须等于扫描到的总数。**不相等，说明有文件的 `kind` 落进了一个不存在的桶 —— `buckets[kind]` 会静默创建新属性，然后统计就悄悄错了。**

**这是本课最常见的一个隐蔽 bug。** 防它的办法：`classify()` 只允许返回那六个值之一，写死。

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot find module './store'` | 不在 `doc-parser` 目录跑 | `cd doc-parser` |
| `samples/xxx` 变成绝对路径 | 你传了绝对路径 | 从 `doc-parser` 目录跑 |
| 总数对不上 | `kind` 返回了六个之外的值 | `classify()` 写死返回值 |
| 中文乱码 | cmd 编码 | `chcp 65001` |
| 跑到一半卡住 | 某个 PDF 特别大 | 看 `[i/N]` 停在哪，单独跑那个文件 |
| 同名文件只进了一个 | 用了 `basename` 当键 | 必须用相对路径 |
| `out` 目录不存在报错 | `mkdirSync` 没执行到 | 检查是否被前面的异常打断 |

---

# 第 3 步：让流水线能重复跑（20 分钟）

## 3.1 做什么 / 为什么

**做什么：** 什么都不改，再跑一遍，确认 `skipped_unchanged` 等于文件数。

**为什么这件事对批量处理比单文件更重要：**

单文件的时候，重跑一次的成本是 8 秒，你看不出来。**287 个文件的时候，重跑一次是 38 分钟。**

更糟的是：

```text
你跑了 30 分钟，到第 200 个，客户发来一个新版本，说有 5 个文件改了
没有增量能力 → 只能全部重跑 38 分钟
有增量能力   → 5 个文件，20 秒
```

**这就是幂等在大批量场景下的真实价值：不是"不重复"，是"能只做变化的部分"。**

第 83 节的练习二已经要求实现"内容没变就跳过"。**如果没做，现在必须补上**，否则这一步进行不下去。

## 3.2 补上"内容没变就跳过"

打开 `src\store.js`，改 `parseOne`：

```javascript
async function parseOne(filePath) {
  const relPath = toRelative(filePath);

  // 读文件字节算 hash。为了判断"内容变没变"，这一步省不掉。
  const raw = fs.readFileSync(filePath);
  const fileHash = crypto.createHash("sha256").update(raw).digest("hex");

  const exist = db
    .prepare("SELECT id, content_hash, status FROM documents WHERE path = ?")
    .get(relPath);

  if (exist !== undefined && exist.status === "success" && exist.content_hash === fileHash) {
    const sections = db.prepare("SELECT COUNT(*) AS n FROM sections WHERE doc_id=?").get(exist.id).n;
    const chunks = db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE doc_id=?").get(exist.id).n;
    return {
      ok: true,
      skipped: true,
      reason: "内容未变",
      duplicateOf: null,
      path: relPath,
      docId: exist.id,
      sectionCount: sections,
      chunkCount: chunks,
    };
  }

  // 查有没有别的 path 但内容相同的文件（重复文件）
  let duplicateOf = null;
  if (exist === undefined) {
    const dup = db
      .prepare("SELECT path FROM documents WHERE content_hash = ? AND status='success' LIMIT 1")
      .get(fileHash);
    if (dup !== undefined) duplicateOf = dup.path;
  }

  try {
    const parsed = await parse(filePath);
    const result = saveTransaction(relPath, parsed, fileHash);
    return { ok: true, skipped: false, duplicateOf: duplicateOf, path: relPath, ...result };
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
```

**同时要把 `saveTransaction` 改成接收第三个参数 `fileHash`，并写进 `content_hash` 列。** 找到它内部 `const contentHash = crypto.createHash("sha256").update(fullText).digest("hex");` 这一行，删掉，改用参数传入的 `fileHash`。

**这两处必须一起改。** 只改 `parseOne` 不改 `saveTransaction`，你会永远跳不过（库里存的是文本 hash，你比的是文件 hash，永远不相等）。

**还要让 `parse()` 遇到扫描件时抛出带 `code` 的错误。** 在 `src\parse.js` 的 `parsePdfDoc` 末尾加：

```javascript
  const totalChars = pages.reduce((n, p) => n + p.text.replace(/\s/g, "").length, 0);
  const perPage = pages.length === 0 ? 0 : totalChars / pages.length;
  if (perPage < 20) {
    throw new ParseError("NEED_OCR", "每页平均 " + perPage.toFixed(1) + " 字，判定为扫描件");
  }
```

图片分支同理。

## 3.3 屏幕上应该看到什么

第二遍：

```text
>node src\pipeline.js samples
=== 开始批处理 ===
目录：B:\...\doc-parser\samples
扫描到文件：4 个
可处理：4 个
跳过（不支持）：0 个

[1/4] samples/政策.pdf            skipped_unchanged  原因=内容未变  38ms
[2/4] samples/会议纪要.docx        skipped_unchanged  原因=内容未变  12ms
[3/4] samples/预算.xlsx            skipped_unchanged  原因=内容未变  15ms
[4/4] samples/照片.jpg            need_ocr           code=NEED_OCR msg=每页平均 0.0 字，判定为扫描件  91ms

=== 汇总 ===
  success            0
  skipped_unchanged  3
  skipped_duplicate  0
  need_ocr           1
  need_review        0
  failed             0
  不支持              0

核对：4 + 0 = 4（扫描到 4）
总耗时：0.2 秒
平均每个：39 ms
```

**对比第一遍的 2.5 秒和这一遍的 0.2 秒。**

```text
第一遍：2.5 秒（真的解析了三个文件）
第二遍：0.2 秒（只读文件字节算 hash，没解析）
```

**这就是幂等的性能价值：12 倍。** 287 个文件的话，是 38 分钟 vs 3 分钟。

**注意 `need_ocr` 那一条每次都会被重新处理（96ms → 91ms）。** 因为它没有入库成功，`documents` 里没有 `status='success'` 的行，所以每次都会重试。**这是对的** —— 你以后接上 OCR，重跑一遍就能补上，不需要特殊处理。

**但这也埋了坑：** 如果有 200 个扫描件，每次跑都要重新读 200 个文件。**量大时该给 `need_ocr` 也记一条 `documents` 行（`status='needs_ocr'`），让流水线能跳过它们。** 这是事后优化，不是今天必须做的 —— 练习二就是这件事。

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第二遍还是 `success` | `saveTransaction` 没把文件 hash 写进 `content_hash` | 两处一起改 |
| 第二遍全是 `skipped_duplicate` | 重复判断写在了"同 path"之前 | 先判同 path，再判重复内容 |
| `skipped_unchanged` 但 `sectionCount=0` | 返回值里没查 | 用 SQL 现查，代码里已经写了 |
| 改了内容还是被跳过 | 你比的是 `mtime` | 只看 `content_hash` |

## 3.5 为什么不能用"修改时间"判断

```javascript
// 诱人但错误的写法
if (fs.statSync(f).mtimeMs <= exist.file_mtime) continue;
```

**三个失效场景：**

```text
① 从压缩包解开一批文件 → mtime 全是解压时间，全都"像新的"
② 从 Git 检出          → mtime 全是检出时间
③ 客户只是"另存为"了一下，内容一字未改 → mtime 变了，你重新解析一遍
```

**`mtime` 只告诉你"这个文件被动过"，不告诉你"内容变了"。** 而你要的是后者。

**代价：** 读文件算 hash 要花时间。287 个文件、平均 500KB，大概 1–2 秒。**这 2 秒换来的是"不会白白重解析 287 个文件"，值。**

---

# 第 4 步：生成一份能发给客户的报告（25 分钟）

## 4.1 做什么 / 为什么

**做什么：** 写 `report.js`，把 `last-run.json` 和库里的统计合成 `out\import-report.md`。

**为什么报告要单独一个脚本，不能直接在 `pipeline.js` 里 `console.log`：**

```text
console.log  → 在终端里，滚过去就没了，发不了给客户
markdown     → 能贴进邮件、能进 Git、三个月后还能看
```

**而且报告要能脱离那次运行单独生成。** 客户第二天问"上次那批处理怎么样"，你的终端早关了，但库还在，`last-run.json` 还在。**重新生成一份就行。**

## 4.2 操作

新建 `src\report.js`：

```javascript
// report.js —— 读库 + 上一次运行的 JSON，生成 markdown 报告
// 用法：node src\report.js
const fs = require("fs");
const path = require("path");
const db = require("./db");

const outDir = path.join(__dirname, "..", "out");
const runPath = path.join(outDir, "last-run.json");

if (!fs.existsSync(runPath)) {
  console.error("找不到 " + runPath + "，先跑一次 node src\\pipeline.js samples");
  process.exitCode = 1;
  return;
}

const run = JSON.parse(fs.readFileSync(runPath, "utf8"));

const docStats = db
  .prepare(`
    SELECT status, COUNT(*) AS n, SUM(page_count) AS pages, SUM(char_count) AS chars,
           SUM(chunk_count) AS chunks
      FROM documents
     GROUP BY status
     ORDER BY n DESC
  `)
  .all();

const totals = db
  .prepare(`
    SELECT
      (SELECT COUNT(*) FROM documents) AS docs,
      (SELECT COUNT(*) FROM sections)  AS sections,
      (SELECT COUNT(*) FROM chunks)    AS chunks,
      (SELECT IFNULL(SUM(char_count),0) FROM chunks) AS chunk_chars
  `)
  .get();

const biggest = db
  .prepare(`
    SELECT path, format, chunk_count, char_count
      FROM documents
     WHERE status = 'success'
     ORDER BY chunk_count DESC
     LIMIT 5
  `)
  .all();

const zeroChar = db
  .prepare(`
    SELECT path, format, char_count
      FROM documents
     WHERE status = 'success' AND char_count = 0
     ORDER BY id
  `)
  .all();

const L = [];
L.push("# 文档入库报告");
L.push("");
L.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
L.push("");

L.push("## 一、本次处理");
L.push("");
L.push("| 项目 | 数值 |");
L.push("|---|---|");
L.push("| 目录 | `" + run.dir + "` |");
L.push("| 扫描到文件 | " + (Object.values(run.buckets).reduce((a, b) => a + b.length, 0) + run.unsupported.length) + " |");
L.push("| 成功入库 | " + run.buckets.success.length + " |");
L.push("| 跳过（内容未变） | " + run.buckets.skipped_unchanged.length + " |");
L.push("| 跳过（重复文件） | " + run.buckets.skipped_duplicate.length + " |");
L.push("| 需要 OCR | " + run.buckets.need_ocr.length + " |");
L.push("| 需要人工确认 | " + run.buckets.need_review.length + " |");
L.push("| 失败 | " + run.buckets.failed.length + " |");
L.push("| 不支持格式 | " + run.unsupported.length + " |");
L.push("| 总耗时 | " + (run.totalMs / 1000).toFixed(1) + " 秒 |");
L.push("");

L.push("## 二、库内现状");
L.push("");
L.push("| 状态 | 文档数 | 页数 | 字符数 | 切片数 |");
L.push("|---|---|---|---|---|");
for (const s of docStats) {
  L.push("| " + s.status + " | " + s.n + " | " + (s.pages === null ? 0 : s.pages) + " | " +
    (s.chars === null ? 0 : s.chars) + " | " + (s.chunks === null ? 0 : s.chunks) + " |");
}
L.push("");
L.push("合计：**" + totals.docs + "** 个文档 / **" + totals.sections + "** 个 section / **" +
  totals.chunks + "** 个 chunk / 切片总字符 **" + totals.chunk_chars + "**");
L.push("");

if (biggest.length > 0) {
  L.push("## 三、最大的五个文档（按切片数）");
  L.push("");
  L.push("| 文件 | 格式 | 切片数 | 字符数 |");
  L.push("|---|---|---|---|");
  for (const b of biggest) {
    L.push("| `" + b.path + "` | " + b.format + " | " + b.chunk_count + " | " + b.char_count + " |");
  }
  L.push("");
}

L.push("## 四、需要处理的问题");
L.push("");
const noProblem = run.buckets.need_ocr.length === 0 &&
  run.buckets.failed.length === 0 &&
  run.unsupported.length === 0 &&
  zeroChar.length === 0;
if (noProblem) {
  L.push("无。");
  L.push("");
} else {
  if (run.buckets.need_ocr.length > 0) {
    L.push("### 需要 OCR（" + run.buckets.need_ocr.length + " 个）");
    L.push("");
    L.push("这些文件是扫描件，没有文字层。处理办法：接入第 82 节课的 OCR 流程。");
    L.push("");
    for (const x of run.buckets.need_ocr) L.push("- `" + x.file + "`");
    L.push("");
  }
  if (run.buckets.failed.length > 0) {
    L.push("### 失败（" + run.buckets.failed.length + " 个）");
    L.push("");
    L.push("| 文件 | 错误码 | 原因 |");
    L.push("|---|---|---|");
    for (const x of run.buckets.failed) {
      L.push("| `" + x.file + "` | " + (x.result.code || "-") + " | " +
        String(x.result.message || "").replace(/\|/g, "\\|") + " |");
    }
    L.push("");
  }
  if (run.unsupported.length > 0) {
    L.push("### 不支持的格式（" + run.unsupported.length + " 个）");
    L.push("");
    for (const u of run.unsupported) L.push("- `" + u.file + "` —— " + u.reason);
    L.push("");
  }
  if (zeroChar.length > 0) {
    L.push("### 入库成功但字符数为 0（" + zeroChar.length + " 个）");
    L.push("");
    L.push("这一类最危险：状态是成功，但检索时什么都找不到。逐个人工打开看一眼。");
    L.push("");
    for (const e of zeroChar) L.push("- `" + e.path + "`（" + e.format + "）");
    L.push("");
  }
}

L.push("## 五、结论");
L.push("");
const okN = run.buckets.success.length + run.buckets.skipped_unchanged.length + run.buckets.skipped_duplicate.length;
const totalN = okN + run.buckets.need_ocr.length + run.buckets.need_review.length + run.buckets.failed.length;
L.push("1. 本次共处理 " + totalN + " 个文件，正常入库 " + okN + " 个（" +
  (totalN === 0 ? "-" : Math.round((okN / totalN) * 100) + "%") + "）。");
L.push("2. 库内现在有 " + totals.docs + " 个文档、可检索切片 " + totals.chunks +
  " 个，可以直接进入第 13 周的检索环节。");
L.push("3. " + (run.buckets.failed.length === 0
  ? "没有解析失败的文件。"
  : "有 " + run.buckets.failed.length + " 个文件解析失败，需要客户重发或单独排查，详见第四节。"));
L.push("");

const outPath = path.join(outDir, "import-report.md");
fs.writeFileSync(outPath, L.join("\n"), "utf8");
console.log("已生成：" + outPath);
```

```text
node src\report.js
```

## 4.3 屏幕上应该看到什么

`out\import-report.md`：

```markdown
# 文档入库报告

生成时间：2026/11/16 18:12:44

## 一、本次处理

| 项目 | 数值 |
|---|---|
| 目录 | `B:\...\doc-parser\samples` |
| 扫描到文件 | 4 |
| 成功入库 | 3 |
| 跳过（内容未变） | 0 |
| 跳过（重复文件） | 0 |
| 需要 OCR | 1 |
| 需要人工确认 | 0 |
| 失败 | 0 |
| 不支持格式 | 0 |
| 总耗时 | 2.5 秒 |

## 二、库内现状

| 状态 | 文档数 | 页数 | 字符数 | 切片数 |
|---|---|---|---|---|
| success | 3 | 9 | 4218 | 20 |

合计：**3** 个文档 / **9** 个 section / **20** 个 chunk / 切片总字符 **4218**

## 三、最大的五个文档（按切片数）

| 文件 | 格式 | 切片数 | 字符数 |
|---|---|---|---|
| `samples/政策.pdf` | pdf | 14 | 3241 |
| `samples/预算.xlsx` | xlsx | 4 | 512 |
| `samples/会议纪要.docx` | docx | 2 | 465 |

## 四、需要处理的问题

### 需要 OCR（1 个）

这些文件是扫描件，没有文字层。处理办法：接入第 82 节课的 OCR 流程。

- `samples/照片.jpg`

## 五、结论

1. 本次共处理 4 个文件，正常入库 3 个（75%）。
2. 库内现在有 3 个文档、可检索切片 20 个，可以直接进入第 13 周的检索环节。
3. 没有解析失败的文件。
```

**看第四节和第五节的关系：**

```text
第四节说"有 1 个需要 OCR"
第五节说"没有解析失败"

这两句不矛盾。这正是今天最重要的区分：需要 OCR ≠ 失败
```

**如果把这两件事混在一起，第五节会写"有 1 个失败"，然后你会去查 bug —— 查不到。**

## 4.4 `字符数为 0 但状态成功` —— 最危险的一类

报告里专门给这一类留了一个小节。原因：

```text
failed        → 流水线知道它坏了，报告里会出现，你会去看
needs_ocr     → 也出现在报告里，你会去看
success + 0 字 → 报告里如果没专门列，它就"消失"了
```

**而它恰恰是最坏的：**

```text
第 13 周你做检索，用户问"报销标准是多少"
RAG 检索不到，因为那个文件入库时是空的
你会去调检索算法、调 chunk 大小、换 embedding 模型
—— 折腾两天，问题在 W12 的入库
```

**这一类是怎么产生的：**

| 原因 | 例子 |
|---|---|
| PDF 是图片但"平均每页字符数"没低到阈值 | 30 页里 25 页空白、5 页有字，平均 20 字/页 —— 不触发，但正文全丢 |
| docx 全是图片 | 一份全是截图的说明书 |
| xlsx 只有图表没有单元格文字 | 不常见但真实存在 |
| 解析器吞了异常 | `parse()` 里某个分支 `catch` 后返回了空 pages |

**所以报告里必须单独列。** 这不是"以防万一"，是"这一类一定会出现"。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `找不到 last-run.json` | 没跑过 `pipeline.js` | 先跑一遍 |
| 报告里数字全 0 | `db` 连的是空库 | `dir data\app.db`，看是不是新建了一个 |
| 表格错乱 | 错误信息里有竖线 | 代码里已经转义 |
| 「最大的五个文档」是空的 | 库里没有 `success` 的行 | 先解决第 2 步 |

---

# 第 5 步：故意犯四个错（20 分钟）

## 错误 1：`try/catch` 包在循环外面

```javascript
// 错误写法
try {
  for (const f of files) {
    await parseOne(f);   // 一旦抛异常，整个循环终止
  }
} catch (err) {
  console.log("批处理失败：", err.message);
}
```

**现象：** 第 1 个文件失败，后面 286 个一个都不处理。屏幕上只有一句"批处理失败"。

**原因：** `parseOne` 内部其实已经 `catch` 了，不会抛。但你在循环里调用别的函数（比如 `readFileSync`）时，异常会一路冒到外面，整个循环断掉。

**真正的伤害：** 一个坏文件毁掉整批。而且你不知道它毁在第几个，因为没打印。

**怎么查：** 故意放一个 0 字节的 `test.txt` 到 `samples\`，跑一遍。**如果它后面的文件全没被处理，就是踩了。**

**正确做法：`try/catch` 必须在循环体内部，每一次迭代独立。**

```javascript
for (const f of files) {
  try {
    await parseOne(f);
  } catch (err) {
    // 只影响这一次
  }
}
```

## 错误 2：把所有文件放在一个大事务里

```javascript
// 看起来很"安全"的写法
const runAll = db.transaction((files) => {
  for (const f of files) {
    parseOneSync(f);
  }
});
runAll(files);
```

**现象：** 跑了 35 分钟，第 286 个文件失败，`ROLLBACK`，**前 285 个全部消失。**

**原因：** SQLite 的事务是"全成或全不成"。一个事务里 287 个文件，任何一个失败就全回滚。

**更隐蔽的问题：`db.transaction` 不支持异步函数。** `better-sqlite3` 的 `transaction` 是同步的，里面跑 `await` 会导致事务边界错乱 —— 你以为在事务里，其实 `await` 之后已经在事务外了。

**真正的伤害：**

```text
最坏情况：35 分钟白跑，而且不知道为什么（终端只显示"失败"）
次坏情况：事务边界错乱，数据写了一半，你还没意识到
```

**正确做法：每个文件一个事务（`parseOne` 内部已经是了），失败的单独记 `failed`，不影响其他。**

**这就是第 83 节 `markFailed` 存在的理由：** 失败也要留一行，而不是让它消失。

## 错误 3：用 `path.basename` 当唯一键

```javascript
// 想当然的写法
const key = path.basename(file);   // "会议纪要.docx"
```

**现象：** 客户给了三个目录，每个目录里都有一个 `会议纪要.docx`。第二个覆盖了第一个。

**原因：** `basename` 丢掉了目录信息。

**真正的伤害：** 三个不同的文件只进了一个。**而且不报错** —— 因为 `documents.path` 有 `UNIQUE` 约束，第三次是"更新"而不是"插入"。

**怎么查：**

```sql
-- 库里文档数 vs 源文件数
SELECT COUNT(*) FROM documents;
```

两个数字对不上，但 `GROUP BY path HAVING COUNT(*)>1` 又查不出东西，就是"被覆盖"。

**正确做法：** 用相对路径（`samples/2024/会议纪要.docx`），第 83 节的 `toRelative` 已经这么做了。

**边界：** `samples/2024/会议纪要.docx` 和 `samples/2025/会议纪要.docx` 是**两个不同的文件**，必须都能入库。**用 `basename` 你做不到。**

## 错误 4：把 `console.log` 当进度条，不写结果文件

```javascript
// 只打印
for (const f of files) {
  const r = await parseOne(f);
  console.log(f, r.ok ? "ok" : "fail");
}
```

**现象：** 跑到一半你要去开会，回来终端被关了。**你不知道跑到第几个，也不知道哪些成功了。**

**真正的伤害：**

```text
你以为是"跑到第 150 个，前 150 个成功了"
实际情况可能是"跑到第 150 个，其中 30 个失败了，但滚过去了你没看见"
```

**正确做法：**

```text
① 实时打印（看着安心）
② 结果写 JSON（给 report.js 用）
③ 失败清单单独一份纯文本（能直接复制发给客户）
```

**为什么失败清单要单独一份纯文本：**

```text
JSON  → 你自己用，程序读
txt   → 客户用，一行一个路径，能直接看懂、能对着找
```

**给客户的东西要"能直接看懂"，不是"格式规范"。** 这条在报价、交付、对账时都会用到。

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| `try/catch` 在循环外 | 只处理了第一个 | 一个坏文件毁掉整批 | 放个 0 字节文件测 |
| 一个大事务 | 跑 35 分钟后全回滚 | 白跑，且不知道原因 | 看 `parseOne` 有没有自己的事务 |
| `basename` 当键 | 同名文件被覆盖 | 文件少了但不报错 | `COUNT(*)` 对不上源文件数 |
| 只有 `console.log` | 终端一关全没了 | 说不清结果 | 问"哪些失败了"答不上来 |

**这四个错误的共同点：它们都发生在"批量"这个尺度上。**

**单文件的时候，这些错全部不显现。** 这就是为什么第 84 节必须单独有一节 —— **批量是另一类问题，不是"多跑几次"。**

---

# 第 6 步：写学习笔记（10 分钟）

打开 `第07节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「六种结果」和「我的批处理统计」两节，**统计表要贴真实数字**。

---

# 第 7 步：课后练习

## 练习一：加一个 `--dry-run`

`node src\pipeline.js samples --dry-run` 时：只扫目录、探测格式、分类，**不解析、不入库**。

**为什么有用：** 客户给你 3000 个文件，你要先估时间。`--dry-run` 让你 5 秒内知道"要跑 40 分钟还是 4 小时"。

## 练习二：把 `need_ocr` 也记进 `documents`

现在每次跑，扫描件都会被重新读一遍。改成：遇到需要 OCR 的文件，也写一行 `documents`，`status='needs_ocr'`，下次跑直接跳过。

**要求：** 加完后第二遍跑不出现 `need_ocr`，要出现 `skipped_need_ocr`。**并且报告里必须说明"这 N 个文件在等 OCR"。**

**关键：不能因为"跳过"就让报告里看不到它们。** 否则你会忘掉这 30 个扫描件，然后在第 13 周发现检索不全。

## 练习三：接上 OCR，跑通全流程

把第 82 节课的 `ocrFile()` 接进 `parse.js` 的扫描件分支。

**验收：** 那张 `照片.jpg` 从 `need_ocr` 变成 `success`，`chunks` 表里能看到 OCR 出来的文字。

**注意：** OCR 结果一定要人工看一眼再算成功。**错字连篇的 OCR 结果入库，比不入库更坏** —— 你会在第 13 周得到"看起来有答案但全是错的"。

## 练习四：给报告加一节"成本估算"

按你的实际数据算：

```text
如果这 287 个文件里有 30 个需要 OCR（走多模态模型），大概花多少钱？
如果全部走向量化（第 13 周），20 个 chunk 变 2870 个 chunk，大概花多少钱？
```

**给量级，不要给精确价。** 写出计算过程，标注你用的单价假设。

## 练习五：用自己的话讲清

1. 为什么"需要 OCR"必须和"失败"分开统计？举一个因混淆而做错决定的例子。
2. 幂等在批量场景下的价值，和单文件场景下有什么不同？
3. 为什么不能用文件修改时间判断"内容变了"？举两个失效场景。
4. 为什么"入库成功但字符数为 0"比"失败"更危险？
5. 如果客户给你 3000 个文件，你会按什么顺序做？说出你的前五步。

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能列出文件处理完的六种结果，并说清哪几种不算失败
- [ ] 我能解释"批量处理"和"重复跑单文件"的本质区别
- [ ] 我能说出 `mtime` 判断内容变化的三个失效场景
- [ ] 我能解释为什么"成功但 0 字符"比"失败"更危险

## B. 实操

- [ ] `pipeline.js` 扫目录跑通，输出带 `[i/N]` 序号和单文件耗时
- [ ] 六种分类的数字加起来等于扫描总数（"核对"那行自洽）
- [ ] 第二遍跑，三个文件都是 `skipped_unchanged`，总耗时降到 1 秒以内
- [ ] 照片被判成 `need_ocr` 而不是 `failed`
- [ ] `report.js` 生成 `out\import-report.md`，五个小节齐全
- [ ] 报告第五节写的是"没有解析失败"，而不是"有 1 个失败"
- [ ] `data\app.db` 里 `documents` 有 3 行 `success`，`chunks` 有 20 个左右
- [ ] 没有失败时不生成 `out\fail-list.txt`，且不报错
- [ ] `out\last-run.json` 能被 `report.js` 读出来

## C. 排错

- [ ] 我放过一个 0 字节文件，看到它只影响自己那一行
- [ ] 我试过把文件放进子目录，`path` 里带上了目录名
- [ ] 我查过"库里文档数 vs 源文件数"，两者能对上
- [ ] 我改过一个文件的内容，看到它从 `skipped` 变回 `success`

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 「我的批处理统计」贴的是真实终端输出
- [ ] 练习四的成本估算写了计算过程
- [ ] 「我还不懂的词」写了真实的词

---

## 本节课要能说出口的一句话

> **批量处理的验收标准不是"跑完了"，是"我能说出成功几个、跳过几个、失败几个，以及每个失败该谁处理"。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Cannot find module './db'` | 当前目录 | `cd doc-parser` 再跑 |
| `目录不存在` | 参数路径 | 用相对路径 `samples`，从 `doc-parser` 里跑 |
| 总数对不上 | `classify()` 返回值 | 只能返回那六个值之一 |
| 第二遍还是全 `success` | `content_hash` 存的是什么 | 必须存文件字节 hash，不是文本 hash |
| 扫描件被当成功 | `parse()` 里没抛 `NEED_OCR` | 在 `parsePdfDoc` 末尾加阈值判断 |
| `SQLITE_BUSY` | 另一个 node 进程开着同一个库 | `taskkill /IM node.exe /F` |
| 报告里数字全 0 | `db` 路径 | `dir data\app.db` 确认文件存在且非空 |
| `last-run.json` 找不到 | 没跑 pipeline | 先跑 pipeline |
| 中文文件名显示乱码 | cmd 编码 | `chcp 65001` |
| 某个 PDF 卡很久 | 页数特别多 | 单文件跑它，看是不是几百页 |
| `Maximum call stack size exceeded` | 目录嵌套太深 | `walk` 里加深度上限（代码里已有 20 层） |
| 文件数明显少于预期 | 子目录被跳过 | `walk` 里只该跳过 `node_modules` 和 `.` 开头 |
