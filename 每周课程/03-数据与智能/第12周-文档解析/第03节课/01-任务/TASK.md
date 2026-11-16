# 第 80 节课：解析表格

> 这节课结束时，你手上有：`src\read-table.js`，一个自己手写的 CSV 解析器，加一个 exceljs 的 xlsx 读取器，两者都输出同一种结构 `[{列名: 值}]`。

**时间**：约 110 分钟
**前置**：第 79 节课做出来的 `src\read-text.js`，以及能区分编码的 `decodeBuffer()`

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能把 txt、md、docx 读成字符串，能判断 UTF-8 和 GBK，能剥 BOM。

**但表格不是"一段文字"。** 表格有列、有行、有表头。你把一张预算表读成一整段字符串，后面什么都做不了：没法按列筛选，没法算合计，没法回答"销售部 Q1 花了多少"。

## 0.2 今天这个坑长什么样

**场景一：** 客户发来 `名单.csv`，五行数据。你写：

```javascript
const rows = text.split("\n").map((line) => line.split(","));
console.log(rows[1].length);   // 你以为是 4
```

输出是 `5`。因为第二行有一个字段是 `"北京市,海淀区"`，那个逗号在引号里，**它不是分隔符，它是内容。** 你一切，后面所有列全部错位。

**场景二：** 客户发来 `预算.xlsx`。你用 `exceljs` 读第一行当表头，读出来是：

```text
["2026 年部门预算", null, null, null]
```

因为第一行是合并单元格的大标题，真正的表头在第 3 行。你的代码把"标题"当成了列名，后面每一行都取不到值。

**场景三：** 表格里"部门"这一列，前两行是合并的，只写了一次"销售部"。你读第二行，`部门` 是 `undefined`。你以为是 `exceljs` 的 bug，其实是 Excel 的存储方式：**合并单元格的值只存在左上角那一个格子里，其他格子是空的。**

**这三个坑，两个在 CSV，一个在 xlsx。** 共同点：**"看起来是一张表"和"程序读到的是一张表"是两件事。**

### 这节课你要准备的文件

| 文件 | 怎么弄出来 |
|---|---|
| `名单.csv` | 记事本里**照下面抄**，另存为 UTF-8 |
| `名单-excel.csv` | 把 `名单.csv` 用 Excel 打开，直接"另存为"CSV（Excel 会存成 GBK） |
| `预算.xlsx` | Excel 新建，按下面说的做三个 sheet、一个合并标题、一个纵向合并 |

`名单.csv` 的内容，**一个字都别改**，包括引号和换行：

```text
姓名,城市,金额,备注
张三,"北京市,海淀区",1299.00,老客户
李四,上海市,880.50,
王五,广州市,0,"第一行
第二行"
赵六,深圳市,560,新客户
钱七,杭州市,300
```

最后一行只有 3 个字段，表头有 4 个。**这是故意的**，你要处理"字段数不齐"。

`预算.xlsx` 这样做：

```text
Sheet1 改名 "2026预算"
  A1 输入 "2026 年部门预算"，选中 A1:D1，合并
  A2 输入 "单位：元"，选中 A2:D2，合并
  第 3 行：部门 | 小组 | Q1 | Q2
  第 4 行：销售部 | 一组 | 120000 | 135000
  第 5 行：        | 二组 | 80000  | 90000
  选中 A4:A5，合并（销售部跨两行）
  第 6 行：市场部 | 全体 | 50000 | 60000

Sheet2 改名 "明细"
  第 1 行：月份 | 金额
  第 2 行：1 月 | 30000
  第 3 行：2 月 | 28000
```

**第 5 行的 A5 留空，然后和 A4 合并。** 这一步是今天的主角。

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 状态机（state machine） | 程序记住"我现在是在引号里还是在引号外"，再决定这个字符怎么处理 | 手写 CSV 解析器的核心 |
| 合并单元格（merged cell） | 几个格子显示成一个，值只存在左上角那个格子里 | 读 xlsx 时要往左上角找 |
| 表头行（header row） | 写着列名的那一行，不一定在第 1 行 | 用"非空字符串最多"来猜 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `src\read-table.js` | `第03节课\03-练习代码\doc-parser\` | `parseCsv()`、`readXlsx()`、`readTable()` |
| `src\table-lab.js` | 同上 | 逐个文件打印表头和记录 |
| `out\table-notes.md` | 同上 | 记录你踩到的三个坑 |
| `NOTES.md` | `第03节课\02-笔记\` | 学习记录 |

---

# 第 1 步：复制项目、装 exceljs（10 分钟）

## 1.1 做什么 / 为什么

`exceljs` 是白名单里的 xlsx 解析库。CSV 不装包，自己写——**"为什么 CSV 要自己写"本身就是这节课的内容之一。**

## 1.2 操作

```text
cd /d B:\OPC-Distance_study\每周课程\03-数据与智能\第12周-文档解析\第03节课\03-练习代码
xcopy "..\..\第02节课\03-练习代码\doc-parser" "doc-parser" /E /I /Y
cd doc-parser
npm install exceljs
```

装完确认：

```text
node -e "const E=require('exceljs'); console.log('exceljs ok', typeof E.Workbook)"
```

## 1.3 屏幕上应该看到什么

```text
added 25 packages, and audited 39 packages in 4s

found 0 vulnerabilities
```

```text
exceljs ok function
```

`package.json` 的 `dependencies` 里现在有两个：

```json
"dependencies": {
  "exceljs": "^4.4.0",
  "mammoth": "^1.8.0"
}
```

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot find module 'exceljs'` | 装在别的目录 | `dir node_modules\exceljs` 确认 |
| `npm ERR! ERESOLVE` | 依赖冲突 | 删 `node_modules` 和 `package-lock.json`，重新 `npm install` |
| `node -e` 里引号报错 | cmd 对双引号处理特殊 | 把代码写进一个临时 `.js` 文件再跑 |

---

# 第 2 步：手写 CSV 解析器（35 分钟）

## 2.1 做什么 / 为什么

CSV 的规则只有四条，但每条都能坑人：

| 规则 | 例子 | 用 `split` 会怎样 |
|---|---|---|
| 字段里可以有逗号，用引号包起来 | `"北京市,海淀区"` | 被切成两列 |
| 字段里可以有换行，用引号包起来 | `"第一行\n第二行"` | 被切成两行 |
| 字段里的引号写成两个引号 | `"他说""你好"""` → `他说"你好"` | 引号留着，或者切错 |
| 行尾可能是 `\n` 也可能是 `\r\n` | Excel 存的是 `\r\n` | 最后一列带一个 `\r` |

**四条规则，一个 `split` 都处理不了。** 所以必须一个字符一个字符看，并且记住"我现在在不在引号里"。这就是状态机。

## 2.2 操作

新建 `src\read-table.js`，先写 CSV 部分：

```javascript
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { decodeBuffer } = require("./read-text");

function parseCsv(raw) {
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (c === "\r") {
      if (text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }

    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.map((r) =>
    r.map((v) => v.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim())
  );
}

function rowsToObjects(rows) {
  if (rows.length === 0) {
    return { headers: [], records: [], issues: ["文件是空的"] };
  }

  const rawHeaders = rows[0];
  const used = new Map();
  const headers = rawHeaders.map((h, idx) => {
    let name = h === "" ? `列${idx + 1}` : h;
    if (used.has(name)) {
      const n = used.get(name) + 1;
      used.set(name, n);
      name = `${name}_${n}`;
    } else {
      used.set(name, 1);
    }
    return name;
  });

  const issues = [];
  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === "") continue;

    if (r.length !== headers.length) {
      issues.push(`第 ${i + 1} 行有 ${r.length} 个字段，表头有 ${headers.length} 个`);
    }

    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = j < r.length && r[j] !== "" ? r[j] : null;
    });
    records.push(obj);
  }

  return { headers, records, issues };
}

function readCsv(filePath) {
  const buf = fs.readFileSync(filePath);
  const decoded = decodeBuffer(buf);
  const rows = parseCsv(decoded.text);
  const table = rowsToObjects(rows);

  return {
    title: path.basename(filePath, path.extname(filePath)),
    encoding: decoded.encoding,
    headers: table.headers,
    records: table.records,
    issues: table.issues,
    rowCount: table.records.length,
  };
}

module.exports = { parseCsv, rowsToObjects, readCsv, readXlsx: null, readTable: null };
```

先跑 CSV：

```text
node -e "const {readCsv}=require('./src/read-table'); console.log(JSON.stringify(readCsv('samples/名单.csv'),null,2))"
```

**注意 cmd 里路径用 `\\` 或 `/` 都行，但 `node -e` 里的引号很麻烦，建议写一个 `src\table-lab.js`。** 下面直接建：

```javascript
const fs = require("fs");
const path = require("path");
const { readCsv } = require("./read-table");

for (const name of ["名单.csv", "名单-excel.csv"]) {
  const file = path.join("samples", name);
  if (!fs.existsSync(file)) {
    console.log("缺文件：", file);
    continue;
  }

  console.log("=".repeat(70));
  console.log("文件：", file);

  try {
    const t = readCsv(file);
    console.log("编码：", t.encoding);
    console.log("表头：", JSON.stringify(t.headers));
    console.log("记录数：", t.rowCount);
    console.log("");

    t.records.forEach((r, i) => {
      console.log(i + 1, JSON.stringify(r));
    });

    if (t.issues.length) {
      console.log("");
      console.log("问题：");
      for (const issue of t.issues) console.log("-", issue);
    }
  } catch (err) {
    console.log("失败：", err.message);
  }
}
```

运行：

```text
node src\table-lab.js
```

## 2.3 屏幕上应该看到什么

```text
======================================================================
文件： samples\名单.csv
编码： utf-8
表头： ["姓名","城市","金额","备注"]
记录数： 5

1 {"姓名":"张三","城市":"北京市,海淀区","金额":"1299.00","备注":"老客户"}
2 {"姓名":"李四","城市":"上海市","金额":"880.50","备注":null}
3 {"姓名":"王五","城市":"广州市","金额":"0","备注":"第一行\n第二行"}
4 {"姓名":"赵六","城市":"深圳市","金额":"560","备注":"新客户"}
5 {"姓名":"钱七","城市":"杭州市","金额":"300","备注":null}

问题：
- 第 6 行有 3 个字段，表头有 4 个
```

**逐条对照：**

| 检查点 | 结果 | 说明 |
|---|---|---|
| `城市` 是 `"北京市,海淀区"` 一个字段 | 对 | 引号里的逗号没有被切开 |
| `备注` 里有 `\n` | 对 | 引号里的换行没有被切成两行 |
| 记录数 5，不是 7 | 对 | 物理 7 行，逻辑 5 条记录 |
| 最后一行 `备注` 是 `null` | 对 | 字段数不齐，补 null，不补空字符串 |
| 问题清单有 1 条 | 对 | 第 6 行少一个字段 |

Excel 另存的那份：

```text
======================================================================
文件： samples\名单-excel.csv
编码： gbk
表头： ["姓名","城市","金额","备注"]
记录数： 5
...
```

**编码是 `gbk`。** 这就是第 79 节的兜底在起作用。**如果这里显示 `utf-8` 而正文是乱码，说明 `decodeBuffer` 被改坏了。**

## 2.4 逐段解释

**为什么 `inQuotes` 是布尔值而不是计数器：**

CSV 没有嵌套引号，只有"在引号里"和"不在"两种状态。一个布尔值够。**如果你写成计数器，遇到 `""` 转义会算错。**

**为什么 `text[i + 1] === '"'` 时 `i += 2`：**

两个连续引号表示"一个真正的引号字符"。你消费两个字符，往 `field` 里放一个 `"`。如果只 `i += 1`，第二个引号会被当成"引号结束"，后面的内容全乱。

**为什么 `\r` 要单独判断：**

Excel 存的 CSV 是 `\r\n`。如果你只判 `\n`，`\r` 会留在字段末尾。`"北京\r" === "北京"` 是 `false`，你的筛选、去重、入库全都会出问题。**这个坑在 Windows 上必踩。**

**为什么最后要 `trim()`：**

Excel 有时会在逗号后面加空格。`"张三, 北京"` 的第二个字段是 `" 北京"`。`trim()` 去掉它。

**代价：** 引号里故意留的前后空格也会被去掉。真实 CSV 里这种情况极少，**用 1% 的误伤换 99% 的省心，值。**

**为什么 `rowsToObjects` 补 `null` 不补 `""`：**

空字符串和"没有这个字段"是两件事。前者是"填了但是空"，后者是"根本没有"。数据库里 `NULL` 和 `''` 语义不同，**从入口就区分开，后面才不用猜。**

**为什么表头要处理重名：**

两个 sheet 拼在一起、或者客户复制粘贴，很容易出现两个"金额"。你的对象里后一个会覆盖前一个，数据静默丢失。`金额` / `金额_2` 至少能让你看见。

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 记录数比预期多 | 引号里的换行被切开 | 检查 `inQuotes` 分支有没有 `field += c` |
| `城市` 变成两个字段 | 引号判断没生效 | 打印 `rows[1]` 看长度 |
| 每行最后一个字段带 `\r` | 没处理 `\r` | 加 `replace(/\r/g, "")` 或按上面的分支 |
| 中文乱码 | 没走 `decodeBuffer` | 确认 `readCsv` 里用的是 `decodeBuffer(buf)` 不是 `buf.toString()` |
| 表头第一个字段是 `"\ufeff姓名"` | 没剥 BOM | `parseCsv` 开头三行 |
| 金额变成字符串 | 正常，CSV 没有类型 | 后面统一转换，见第 75 节 |

---

# 第 3 步：exceljs 读多 sheet（25 分钟）

## 3.1 做什么 / 为什么

xlsx 和 CSV 的最大区别：**一个文件里有多个 sheet。** 客户说"预算在第二个表里"，你得能按名字取。

`exceljs` 的基本对象：

```text
Workbook            整个文件
  └─ Worksheet      一个 sheet
       ├─ rowCount  有多少行
       ├─ columnCount 有多少列
       └─ getRow(n).getCell(m)  取一个格子
```

## 3.2 操作

在 `src\read-table.js` 里，`readCsv` 后面加：

```javascript
function normalizeValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) {
      return v.richText.map((t) => t.text).join("");
    }
    if (v.formula !== undefined) {
      return normalizeValue(v.result);
    }
    if (v.text !== undefined) {
      return String(v.text);
    }
    if (v.error) {
      return null;
    }
  }
  return v;
}

function cellValue(cell) {
  if (cell.isMerged && cell.master && cell.master !== cell) {
    return normalizeValue(cell.master.value);
  }
  return normalizeValue(cell.value);
}

function findHeaderRow(matrix) {
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(matrix.length, 12);

  for (let r = 0; r < limit; r++) {
    const row = matrix[r] || [];
    const score = row.filter(
      (v) => typeof v === "string" && v.trim() !== ""
    ).length;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  return best;
}

async function readXlsx(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const sheets = [];

  wb.eachSheet((ws, sheetIndex) => {
    const matrix = [];

    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const arr = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        arr.push(cellValue(row.getCell(c)));
      }
      matrix.push(arr);
    }

    const headerIndex = matrix.length ? findHeaderRow(matrix) : 0;
    const rawHeaders = matrix[headerIndex] || [];

    const headers = rawHeaders.map((h, idx) => {
      if (h === null || String(h).trim() === "") return `列${idx + 1}`;
      return String(h).trim();
    });

    const records = [];
    for (let r = headerIndex + 1; r < matrix.length; r++) {
      const row = matrix[r];
      const isEmpty = row.every((v) => v === null || String(v).trim() === "");
      if (isEmpty) continue;

      const obj = {};
      headers.forEach((h, c) => {
        const v = row[c];
        obj[h] = v === undefined ? null : v;
      });
      records.push(obj);
    }

    sheets.push({
      page: sheetIndex,
      name: ws.name,
      headerRow: headerIndex + 1,
      headers,
      records,
      rowCount: records.length,
      merges: ws.model.merges || [],
    });
  });

  return {
    title: path.basename(filePath, path.extname(filePath)),
    sheets,
  };
}

module.exports = { parseCsv, rowsToObjects, readCsv, readXlsx, readTable: null };
```

把 `table-lab.js` 改成同时跑 CSV 和 xlsx：

```javascript
const fs = require("fs");
const path = require("path");
const { readCsv, readXlsx } = require("./read-table");

async function runCsv(name) {
  const t = readCsv(path.join("samples", name));
  console.log("=".repeat(70));
  console.log("文件：", name, "编码：", t.encoding);
  console.log("表头：", JSON.stringify(t.headers));
  console.log("记录数：", t.rowCount);
  t.records.forEach((r, i) => console.log(i + 1, JSON.stringify(r)));
  if (t.issues.length) {
    console.log("问题：");
    for (const issue of t.issues) console.log("-", issue);
  }
}

async function runXlsx(name) {
  const t = await readXlsx(path.join("samples", name));
  console.log("=".repeat(70));
  console.log("文件：", name, "sheet 数：", t.sheets.length);

  for (const s of t.sheets) {
    console.log("");
    console.log(`--- sheet ${s.page}：${s.name} ---`);
    console.log("表头行：", s.headerRow);
    console.log("表头：", JSON.stringify(s.headers));
    console.log("记录数：", s.rowCount);
    s.records.forEach((r, i) => console.log(i + 1, JSON.stringify(r)));
    console.log("合并区域：", s.merges.join(" | "));
  }
}

async function main() {
  await runCsv("名单.csv");
  await runCsv("名单-excel.csv");
  await runXlsx("预算.xlsx");
}

main().catch((err) => {
  console.error("失败：", err.message);
  process.exit(1);
});
```

运行：

```text
node src\table-lab.js
```

## 3.3 屏幕上应该看到什么

```text
======================================================================
文件： 预算.xlsx sheet 数： 2

--- sheet 1：2026预算 ---
表头行： 3
表头： ["部门","小组","Q1","Q2"]
记录数： 3
1 {"部门":"销售部","小组":"一组","Q1":120000,"Q2":135000}
2 {"部门":"销售部","小组":"二组","Q1":80000,"Q2":90000}
3 {"部门":"市场部","小组":"全体","Q1":50000,"Q2":60000}
合并区域： A1:D1 | A2:D2 | A4:A5

--- sheet 2：明细 ---
表头行： 1
表头： ["月份","金额"]
记录数： 2
1 {"月份":"1 月","金额":30000}
2 {"月份":"2 月","金额":28000}
合并区域： 
```

**四个关键点：**

1. **表头在第 3 行**，不是第 1 行。`findHeaderRow` 用"非空字符串最多"猜出来的。
2. **第 2 条记录的"部门"是 `"销售部"`**，不是 `null`。因为 `A5` 是合并区域的一部分，`cellValue` 往左上角 `A4` 取。
3. **`Q1` / `Q2` 是数字 `120000`**，不是字符串 `"120000"`。`exceljs` 会保留 Excel 里的类型。
4. **`合并区域` 打印出了三个 `A1:D1`、`A2:D2`、`A4:A5`**。这是 `ws.model.merges`，调试时非常有用。

## 3.4 逐段解释

**`findHeaderRow` 为什么只在前 12 行找：**

表头不可能在第 500 行。前 12 行足够覆盖"标题 + 空行 + 说明 + 表头"的所有组合。**搜索范围越大，越容易把某一行数据误判成表头。**

**为什么用"非空字符串"而不是"非空格子"：**

标题行 `A1:D1` 合并后，只有 `A1` 有值，另外三个是 `null`，得分 1。表头行 4 个字符串，得分 4。数据行里数字多、字符串少，得分也低。**这是一个便宜的启发式，不是 100% 准，但够用。**

**`cellValue` 里 `cell.master !== cell` 为什么不能省：**

`isMerged` 对合并区域里的**每一个**格子都是 `true`，包括左上角那个。左上角的 `master` 就是它自己。加这个判断是为了避免自己取自己，虽然结果一样，但逻辑更清楚。

**`ws.model.merges` 能不能直接用：**

能，但它是内部结构。**用它来打印和调试可以，不要拿它做业务逻辑。** 业务逻辑应该走 `cell.isMerged` / `cell.master`，这是公开 API。

**`normalizeValue` 为什么要处理 `{formula, result}`：**

Excel 里公式格子的值是 `{ formula: "SUM(B4:C4)", result: 255000 }`。你只要 `result`。不处理的话，你会往数据库里写一个对象，`JSON.stringify` 出来是 `{"formula":...}`，后面全乱。

**为什么要处理 `{richText}`：**

一个格子里部分文字加粗，`cell.value` 就是 `{ richText: [{text:"销售"}, {text:"部"}] }`。拼起来才是完整字符串。

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `工作表 0 条记录` | 表头行找错，后面全是空 | 打印 `matrix` 前 5 行看 |
| 合并单元格是 `null` | 没走 `cell.master` | 检查 `cell.isMerged` 分支 |
| `Q1` 是 `"120000"` 字符串 | 单元格被存成文本 | 正常，转换时用 `Number()` |
| `记录里有 {"formula":...}` | 没处理公式对象 | 在 `normalizeValue` 里取 `result` |
| `Cannot read properties of undefined (reading 'value')` | `cell.master` 不存在 | 加 `cell.master &&` 判断 |
| `Corrupt workbook` | 文件是 `.xls` 不是 `.xlsx` | `detectFormat` 应该返回 `ole` |

---

# 第 4 步：统一成 `[{列名: 值}]`（20 分钟）

## 4.1 做什么 / 为什么

CSV 和 xlsx 现在是两种返回结构。上层代码如果分别处理，每加一种格式就要改一次。

**统一成一个函数 `readTable(filePath)`，返回同一种结构：**

```javascript
{
  title: "预算",
  sheets: [
    {
      page: 0,
      name: "2026预算",
      headers: ["部门", "小组", "Q1", "Q2"],
      records: [{ 部门: "销售部", 小组: "一组", Q1: 120000, Q2: 135000 }],
      rowCount: 3,
      text: "部门\t小组\tQ1\tQ2\n销售部\t一组\t120000\t135000\n..."
    }
  ]
}
```

**为什么要多一个 `text` 字段：**

第 83 节的 `sections` 表存的是纯文本，第 13 节的 `chunks` 也是纯文本。表格最终要变成"一段可检索的文字"，但同时保留 `records` 给需要精确取值的场景。**两个都留，不要二选一。**

## 4.2 操作

在 `src\read-table.js` 里加：

```javascript
function recordsToText(headers, records) {
  const lines = [headers.join("\t")];
  for (const rec of records) {
    lines.push(
      headers
        .map((h) => {
          const v = rec[h];
          return v === null || v === undefined ? "" : String(v);
        })
        .join("\t")
    );
  }
  return lines.join("\n");
}

async function readTable(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    const t = readCsv(filePath);
    return {
      title: t.title,
      sheets: [
        {
          page: 0,
          name: "csv",
          headers: t.headers,
          records: t.records,
          rowCount: t.rowCount,
          text: recordsToText(t.headers, t.records),
          issues: t.issues,
        },
      ],
    };
  }

  if (ext === ".xlsx") {
    const t = await readXlsx(filePath);
    return {
      title: t.title,
      sheets: t.sheets.map((s) => ({
        ...s,
        text: recordsToText(s.headers, s.records),
      })),
    };
  }

  throw new Error("readTable 不支持的扩展名：" + ext);
}

module.exports = {
  parseCsv,
  rowsToObjects,
  readCsv,
  readXlsx,
  readTable,
  recordsToText,
};
```

新建 `src\table-unified.js`：

```javascript
const fs = require("fs");
const path = require("path");
const { readTable } = require("./read-table");

async function main() {
  const dir = process.argv[2] || "samples";

  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const ext = path.extname(name).toLowerCase();
    if (ext !== ".csv" && ext !== ".xlsx") continue;

    try {
      const t = await readTable(file);
      console.log("=".repeat(70));
      console.log("文件：", name, "| 标题：", t.title, "| sheet：", t.sheets.length);

      for (const s of t.sheets) {
        console.log(`  [${s.page}] ${s.name} | ${s.rowCount} 条 | ${s.headers.length} 列`);
        console.log("  第一行原文：", JSON.stringify(s.text.split("\n")[1] || ""));
      }
    } catch (err) {
      console.log("[失败]", name, "|", err.message);
    }
  }
}

main();
```

运行：

```text
node src\table-unified.js samples
```

## 4.3 屏幕上应该看到什么

```text
======================================================================
文件： 名单.csv | 标题： 名单 | sheet： 1
  [0] csv | 5 条 | 4 列
  第一行原文： "张三\t北京市,海淀区\t1299.00\t老客户"
======================================================================
文件： 名单-excel.csv | 标题： 名单-excel | sheet： 1
  [0] csv | 5 条 | 4 列
  第一行原文： "张三\t北京市,海淀区\t1299.00\t老客户"
======================================================================
文件： 预算.xlsx | 标题： 预算 | sheet： 2
  [0] 2026预算 | 3 条 | 4 列
  第一行原文： "销售部\t一组\t120000\t135000"
  [1] 明细 | 2 条 | 2 列
  第一行原文： "1 月\t30000"
```

**注意 `text` 里用 Tab 分隔，不是逗号。** 因为字段内容里可能本来就有逗号（"北京市,海淀区"），用 Tab 不会冲突。

**注意 xlsx 的 `page` 是 0 和 1。** 后面写 `sections` 表时，`page_no` 就从这里来。**Excel 的一个 sheet 在这个系统里等价于 PDF 的一页。**

## 4.4 为什么 CSV 不装包

`npm` 上有 `csv-parse`，功能很全，支持流式、支持各种方言。**这一课不用它，理由：**

1. **它解决的核心问题就是这四条规则。** 你手写一遍，以后看到任何 CSV 问题都能定位。用包你只会 `try/catch`。
2. **它的 API 有十几种选项。** 你为了搞清 `columns: true` 和 `bom: true` 的关系，花的时间比手写还多。
3. **你的场景是"几千行的业务表格"，不是"10GB 的日志流"。** 全量读进内存够了。流式解析是另一个量级的问题，第 6 阶段再说。

**判断标准：问题的规则你能用 50 行讲清，就自己写；规则多到你要查文档才能确认，就用包。**

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `readTable 不支持的扩展名` | 传了 `.xls` | 让客户另存为 `.xlsx` |
| CSV 的 `text` 第一行是空的 | `recordsToText` 收到空表头 | 检查 `headers` 是否为空 |
| xlsx 的 `text` 里数字变成 `[object Object]` | 没走 `normalizeValue` | 检查 `cellValue` |
| sheet 顺序不对 | `eachSheet` 按工作簿顺序，不是按名字 | 正常，`page` 就是顺序号 |

---

# 第 5 步：故意犯 4 个错（15 分钟）

## 错误 1：用 `split(",")` 解析 CSV

**操作：** 把 `parseCsv` 换成：

```javascript
function parseCsv(raw) {
  return raw.split("\n").map((line) => line.split(","));
}
```

**现象：**

```text
表头： ["姓名","城市","金额","备注"]
记录数： 6
1 {"姓名":"张三","城市":"\"北京市","金额":"海淀区\"","备注":"1299.00"}
```

`城市` 变成 `"北京市`，`金额` 变成 `"海淀区"`，后面全部错位。**最危险的是它不报错。**

**原因：** `split` 不认识引号，它只认字符。

**怎么查：** 打印每一行的 `length`。表头是 4，某一行是 5，就是引号里的逗号。**"列数不一致"是 CSV 错位最直接的信号。**

## 错误 2：只按 `\n` 切，不管 `\r`

**操作：** 在 `parseCsv` 里把 `\r` 分支删掉，只留 `\n`。

**现象：** 用 Excel 存的 `名单-excel.csv` 跑：

```text
5 {"姓名":"钱七","城市":"杭州市","金额":"300","备注":null}
```

看着正常？打印 `JSON.stringify`：

```text
{"姓名":"钱七","城市":"杭州市","金额":"300\r","备注":null}
```

**金额是 `"300\r"`。** `Number("300\r")` 恰好是 300（`Number` 会忽略首尾空白），所以你算金额时看不出来。但如果你写 `if (row["金额"] === "300")`，永远是 `false`。

**原因：** Excel 的 CSV 是 `\r\n`。你按 `\n` 切，`\r` 留在前一行的最后一个字段里。

**怎么查：** 对所有字段做 `JSON.stringify`，看有没有 `\r`。或者打印 `charCodeAt(length - 1)`，13 就是它。

## 错误 3：直接读 `cell.value`，不管合并

**操作：** 把 `cellValue` 改成 `return normalizeValue(cell.value)`。

**现象：**

```text
1 {"部门":"销售部","小组":"一组","Q1":120000,"Q2":135000}
2 {"部门":null,"小组":"二组","Q1":80000,"Q2":90000}
```

第二条的部门是 `null`。**数据看起来"少了一块"，但程序不报错。**

**原因：** 合并单元格 `A4:A5` 的值只存在 `A4`。`A5` 是空的。

**怎么查：** 打印 `ws.model.merges`，看到 `A4:A5`，就知道这一列有纵向合并。**任何"某些行某列是 null，其他行正常"的现象，先怀疑合并单元格。**

## 错误 4：把第 1 行当表头

**操作：** 把 `findHeaderRow` 改成 `return 0`。

**现象：**

```text
表头行： 1
表头： ["2026 年部门预算","列2","列3","列4"]
记录数： 5
1 {"2026 年部门预算":"单位：元","列2":null,"列3":null,"列4":null}
```

**列名变成了标题文字。** 后面 `row["部门"]` 全是 `undefined`。

**原因：** 这张表第 1 行是合并的大标题，第 2 行是"单位：元"，第 3 行才是真正的表头。

**怎么查：** 打印 `matrix` 前 5 行，用眼睛看哪一行"每一列都有短字符串"。

## 四个错误总结

```text
split(",")         → 引号里的逗号被切开，列错位，不报错
不管 \r            → 最后一列带 \r，比较永远 false
不管合并单元格     → 某些行某列是 null
第 1 行当表头      → 列名变成标题文字
```

---

# 第 6 步：写学习笔记（10 分钟）

在 `第03节课\02-笔记\NOTES.md` 里写，小标题照下面抄：

## 一、CSV 不是"用逗号分隔"这么简单

## 二、我手写的 CSV 状态机

## 三、引号里的逗号和换行

## 四、`\r\n` 和字段数不齐

## 五、xlsx 的 sheet 和表头行

## 六、合并单元格的值在哪

## 七、cell.value 的五种形态

## 八、统一成 `[{列名: 值}]` 的规则

## 九、四个错误的后果

## 十、我还不懂的词

## 十一、完成检查

---

# 第 7 步：课后练习

## 练习一：给 CSV 加一个"跳过前 N 行"参数

客户的表格经常前两行是标题和说明。给 `readCsv(filePath, options)` 加 `skipRows`：

```javascript
readCsv("samples\\名单.csv", { skipRows: 2 })
```

**要求：** 跳过的行不参与表头判断，但仍然记录在 `issues` 里（写"跳过了 2 行"）。

## 练习二：处理"表头在两行"

有些表是这样的：

```text
部门 | 上半年        | 下半年
     | Q1    | Q2    | Q3    | Q4
```

第一行有合并，第二行才是子列名。

**要求：** 写一个 `mergeTwoHeaderRows(row1, row2)`，输出 `["部门", "上半年_Q1", "上半年_Q2", ...]`。提示：第一行的合并值要向右填充。

## 练习三：金额统一成数字

**要求：** 加一个 `toNumber(value)`：

```text
"1,299.00"  → 1299
"¥1,299"    → 1299
"1299元"    → 1299
""          → null
"abc"       → null，并记录一条 issue
```

**注意：** 不要用 `parseFloat("1,299")`，它返回 `1`。先去掉千分位逗号和货币符号。

## 练习四：找出所有"看起来是空但其实是零"的格子

在 `预算.xlsx` 里，把某个 `Q1` 改成 `0`，再跑一次。

**问题：** 你的代码能区分 `0` 和 `null` 吗？如果不能，问题出在哪个判断上？

**要求：** 在 `out\table-notes.md` 里写清 `0`、`""`、`null` 三种情况在你的代码里分别变成什么。

## 练习五：用自己的话讲清

1. 为什么 CSV 不能用 `split`？举出你文件里的具体一行。
2. 状态机里的 `inQuotes` 为什么是布尔值就够了？
3. 合并单元格的值存在哪里？你怎么取到它？
4. 为什么 `readTable` 要同时返回 `records` 和 `text`？

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能说出 CSV 的四条规则，以及 `split` 为什么全都不行
- [ ] 我知道 `\r\n` 会在最后一个字段留下什么
- [ ] 我知道合并单元格的值只在左上角
- [ ] 我能解释"表头行不一定在第 1 行"，以及怎么猜
- [ ] 我知道 `cell.value` 可能是字符串、数字、日期、公式对象、富文本对象

## B. 实操

- [ ] `exceljs` 装好了，`require` 不报错
- [ ] `parseCsv` 能正确处理 `"北京市,海淀区"` 和引号内换行
- [ ] `readCsv("samples\\名单-excel.csv")` 编码显示 `gbk`
- [ ] `readXlsx("samples\\预算.xlsx")` 读到 2 个 sheet
- [ ] 合并的"销售部"在两条记录里都有值
- [ ] `readTable()` 对 csv 和 xlsx 返回同一种结构

## C. 排错

- [ ] 列数不对，我先查引号
- [ ] 最后一个字段有怪字符，我先查 `\r`
- [ ] 某列部分行是 null，我先查合并单元格
- [ ] 列名是标题文字，我先查表头行号
- [ ] 看到 `Corrupt workbook`，我知道是 `.xls`

## D. 笔记

- [ ] `NOTES.md` 十一个小标题都在
- [ ] "CSV 状态机"我自己画了流程图或写了伪代码
- [ ] "四个错误"那张表填满了
- [ ] `out\table-notes.md` 里写清了 `0` / `""` / `null` 的区别

## 本节课要能说出口的一句话

> **表格的坑都在"看不见的分隔"上：引号里的逗号、行尾的 `\r`、合并单元格里不存在的值。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 列错位 | 引号里的逗号 | 用状态机，别 `split` |
| 记录数变多 | 引号里的换行 | 同上 |
| 最后一列带 `\r` | 行尾处理 | 按 `\r\n` 切，或统一替换 |
| 某些行某列 null | 合并单元格 | 走 `cell.master` |
| 列名是标题 | 表头行号 | `findHeaderRow` |
| `Q1` 是字符串 | 单元格格式是文本 | `Number()` 转换 |
| 金额 `1,299` 变成 1 | `parseFloat` | 先去逗号 |
| `Corrupt workbook` | 是 `.xls` | 让客户另存为 xlsx |
| `exceljs` 读不了加密文件 | 文件有密码 | 让客户取消密码 |
| 空行变成一条记录 | 没过滤全空行 | `every(v => v === null)` |
