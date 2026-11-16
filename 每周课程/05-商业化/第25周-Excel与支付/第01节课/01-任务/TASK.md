# 第 169 节课：客户给的 Excel 打不开

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 你以为读 Excel 就是"读个文件"，实际上**客户发给你的文件里没有一个单元格是干净的**。
> 这节课不讲导入逻辑，只解决一件事：**把一个人眼看到的 Excel，还原成程序能用的二维数组。**

**建议用时**：155 分钟（7 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（75 分钟）一次，第 3—6 步（80 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 168 节课（`saas-lab` 七节课的骨架都在，测试全绿）

---

# 第 0 步：先做一份"脏"的 Excel（25 分钟）

**为什么要自己做一份脏的：** 因为你现在手上没有。用你自己做的干净文件写代码，写完上线，客户第一份文件就把你打死。

## 0.1 手工做出这个文件

**打开 Excel（或者 WPS），照着做：**

**第一行（合并 A1:F1，居中，加粗，字号 16）：**

```text
2026年11月订单明细
```

**第二行：留空。**

**第三行（表头，加粗，浅灰底）：**

```text
订单号 | 客户名称 | 下单日期 | 数量 | 单价 | 备注
```

**第四行开始填数据，一共 8 行，故意做脏：**

| 行 | 订单号 | 客户名称 | 下单日期 | 数量 | 单价 | 备注 |
|---|---|---|---|---|---|---|
| 4 | A001 | 　杭州甲乙公司 | 45000 | 3 | 1,299.00 | |
| 5 | A002 | 上海丙丁（集团） | 45001 | 2 | 899 | 加急 |
| 6 | A003 | 广州戊己公司 | 45002 | 10 | 199.5 | |
| 7 | A004 | 深圳庚辛 | 2026/11/5 | 1 | 1299.00 | |
| 8 | A005 | 成都壬癸 | 2026-11-06 | 5 | 299 | |
| 9 | 小计 | | | | 15692.5 | ← 这一行加粗 |
| 10 | A006 | 重庆子丑 | 45004 | 2 | 399 | |
| 11 | A001 | 　杭州甲乙公司 | 45000 | 3 | 1,299.00 | ← 和第 4 行完全重复 |

**几个必须做出来的坑：**

```text
① 第 4 行客户名前面有一个空格（全角空格最好）
② 第 4 行日期是数字 45000（Excel 的日期序列号）
③ 第 4 行单价是 "1,299.00"，带千分位逗号
④ 第 5 行客户名有全角括号
⑤ 第 6 行日期是 45002（又一个序列号）
⑥ 第 7 行日期是文本 "2026/11/5"
⑦ 第 8 行日期是文本 "2026-11-06"
⑧ 第 9 行是"小计"，不是真数据
⑨ 第 11 行和第 4 行完全重复
```

**保存为 `客户订单-原始.xlsx`，放进：**

```text
saas-lab/tests/fixtures/客户订单-原始.xlsx
```

**自检点：用 Excel 打开看一眼，人眼看到的是什么：**

```text
下单日期那一列，前几行显示的是 2023/3/15 这种日期
单价那一列都显示成 1,299.00
```

**记住这个"人眼看到的样子"。** 下面所有的代码，目标都是**还原成这个样子**。

## 0.2 为什么"日期是 45000"

**Excel 内部不存日期，它存"从 1900-01-01 起过了多少天"。**

```text
45000  →  2023-03-15
45001  →  2023-03-16
```

**这个数字叫序列号（serial number）。**

**人眼看到日期，是因为单元格格式设成了"日期"。** 但如果你用的读取库不处理格式，它读出来的就是 `45000`。

**这是 Excel 读取第一大坑。**

**还有一个更恶心的：1900 年不是闰年，但 Excel 当成闰年算了。**

```text
Excel 里 60 对应 1900-02-29（这个日期实际不存在）
所以 1900-03-01 之前和之后，换算差了 1 天
```

**你需要处理这段，往下第 3 步会讲。**

---

# 第 1 步：装库，先看它到底读出了什么（20 分钟）

## 1.1 装

**在 `saas-lab` 里：**

```text
npm install exceljs
```

## 1.2 先做一次"什么都不处理"的读取

**新建 `scripts/dump-xlsx.js`：**

```js
const ExcelJS = require('exceljs');
const path = require('path');

(async () => {
  const file = path.join(__dirname, '..', 'tests', 'fixtures', '客户订单-原始.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const ws = wb.worksheets[0];

  console.log('工作表名：', ws.name);
  console.log('行数：', ws.rowCount, '列数：', ws.columnCount);
  console.log('合并单元格：', JSON.stringify(
    Object.keys(ws._merges || {}).length ? Object.keys(ws._merges) : [],
    null, 0
  ));
  console.log('');

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells = [];
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      cells.push(JSON.stringify(cell.value));
    }
    console.log(String(rowNumber).padStart(2, '0'), cells.join(' | '));
  });
})();
```

**跑：**

```text
node scripts/dump-xlsx.js
```

**你会看到类似这样的东西（这就是真实情况）：**

```text
工作表名： Sheet1
行数： 11 列数： 6

01 {"richText":[{"text":"2026年11月订单明细"}]} | null | null | null | null | null
02 null | null | null | null | null | null
03 {"richText":[{"text":"订单号"}]} | {"richText":[{"text":"客户名称"}]} | ...
04 {"richText":[{"text":"A001"}]} | {"richText":[{"text":"　杭州甲乙公司"}]} | 45000 | 3 | 1299 | null
05 ...
```

**看出问题了吗：四个。**

```text
① 普通的文字不是字符串，是 { richText: [{ text: "..." }] }
② 空单元格是 null，不是空字符串
③ 日期是 45000（数字），不是日期
④ 单价 1,299.00 变成了 1299（数字），千分位和两位小数都没了
```

**这四条，就是这节课要解决的全部问题。**

**注意第 ④ 条：** 你填的是文本 `"1,299.00"`，但 Excel 可能把它存成了数字 `1299`。**因为 Excel 看到像数字的东西，会自己转。**

**这就是为什么"客户说他们填的是 1299.00，你读出来是 1299"——没有小数位，你不知道是 1299.00 还是 1299.5 被截断了。**

---

# 第 2 步：把单元格的值归一化（30 分钟）

**新建 `src/excel/reader.js`：**

```js
const ExcelJS = require('exceljs');

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 31);

function serialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;

  const days = n < 60 ? n : n - 1;

  const ms = EXCEL_EPOCH_UTC + days * 86400000;
  const d = new Date(ms);

  return Number.isNaN(d.getTime()) ? null : d;
}

function cellToValue(cell) {
  const v = cell.value;

  if (v === null || v === undefined) return null;

  if (typeof v === 'string') return v;
  if (typeof v === 'number') {
    if (cell.numFmt && /[ymd]/i.test(cell.numFmt)) {
      return serialToDate(v);
    }
    return v;
  }
  if (typeof v === 'boolean') return v;
  if (v instanceof Date) return v;

  if (v.richText) {
    return v.richText.map((r) => r.text).join('');
  }

  if (typeof v === 'object' && 'result' in v) {
    return cellToValue({ value: v.result, numFmt: cell.numFmt });
  }

  if (typeof v === 'object' && 'text' in v) {
    return String(v.text);
  }

  if (v.error) {
    return null;
  }

  return String(v);
}

async function readSheet(filePath, options = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws = options.sheetName
    ? wb.getWorksheet(options.sheetName)
    : wb.worksheets[0];

  if (!ws) {
    throw new Error('文件里没有工作表');
  }

  const rows = [];

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = [];
    const max = ws.columnCount || 0;
    for (let c = 1; c <= max; c++) {
      values.push(cellToValue(row.getCell(c)));
    }
    rows.push({ rowNumber, values });
  });

  return { sheetName: ws.name, rows };
}

module.exports = { readSheet, cellToValue, serialToDate };
```

## 2.1 逐段讲六处

### `serialToDate` 和那个 `n < 60 ? n : n - 1`

**这两行必须配套理解。单独看任何一行都会觉得奇怪。**

**Excel 的日期序列号规则：**

```text
serial 1   → 1900-01-01
serial 59  → 1900-02-28
serial 60  → 1900-02-29   ← 这一天不存在，Excel 认为 1900 是闰年
serial 61  → 1900-03-01
```

**1900 年不是闰年。** Excel 从 Lotus 1-2-3 继承了这个 bug，为了兼容一直没改。

**后果：1900-03-01 以后的日期，序列号比真实天数多 1。**

**所以：**

```text
serial < 60   → 序列号就是真实天数，直接用 n
serial >= 60  → 序列号多算了 1，用 n - 1
```

**基准日取 `1899-12-31`：**

```text
serial 1, days 1     : 1899-12-31 + 1  = 1900-01-01  ✓
serial 45000, days 44999: 1899-12-31 + 44999 = 2023-03-15  ✓
serial 59, days 59   : 1899-12-31 + 59 = 1900-02-28  ✓
serial 60, days 59   : 1900-02-28（Excel 里是 02-29，归到 02-28，可接受）
serial 61, days 60   : 1900-03-01  ✓
```

**另一个常见写法是基准取 `1899-12-30` 并且不做 `-1`：**

```js
new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
// serial 45000 → 2023-03-15  ✓ 也对
```

**两种写法在 1900-03-01 之后完全等价，只在极少数历史日期上差一天。随便用哪个，但别混着写。**

**怎么验证你的实现是对的：拿两个数对一下。**

```text
45000  →  2023-03-15
1      →  1900-01-01
```

**这两个数在笔记里记下来。** 以后换语言、换库、看别人的代码，先拿它们试。

**这个 bug 值得单独讲二十分钟，是因为它是最典型的"看起来对、其实差一天"的错误。** 日期差一天不会让程序崩，只会让客户的对账单多算或少算一天。

### `cell.numFmt && /[ymd]/i.test(cell.numFmt)`

**这是判断"这个数字是不是日期"。**

**为什么不能只看 `typeof v === 'number'`：** 因为 `45000` 是数字，`3`（数量）也是数字。**你得知道哪个数字是日期。**

**靠 `numFmt`（数字格式）。日期格式里一定有 `y`、`m`、`d` 这三个字母：**

```text
yyyy-mm-dd        ← 有
yyyy"年"m"月"d"日"  ← 有
0.00              ← 没有，这是普通数字
#,##0             ← 没有
```

**注意引号里的中文字：** `yyyy"年"m"月"d"日"` 里也有 `m` 和 `d`，所以正则匹配得上。**这正是我们要的。**

**反例：** 格式是 `#,##0` 的时候，`/y|m|d/` 匹配不上，所以 `1299` 不会被当日期。**对。**

**有一个坑：** 有些模板会把格式设成 `[$-804]yyyy-mm-dd`（带语言标记）。**正则照样匹配，没事。**

**另一个坑：** 格式是 `mm:ss`（时长）的时候，会被误判成日期。**这种在订单表里几乎不会出现，先不管。**

### `v.richText` 那一段

**`{ richText: [{ text: "A001" }] }` 是"富文本"。**

**什么时候会出现：** 单元格里同一段文字有一部分加粗、有不同颜色的时候。

**客户从别的系统导出、或者手工给某几个字标了颜色，就会变成这样。**

**处理方式：把所有段拼起来。**

```js
v.richText.map((r) => r.text).join('');
```

**不处理的话，你的代码会拿到一个对象，`String(对象)` 变成 `[object Object]`，存进库里就是这个词。**

**这个错误会静默发生，而且只在某些文件里出现。** 希望你记住它的样子。

### `typeof v === 'object' && 'result' in v`

**这是公式单元格。**

**客户的文件里有一列是 `=D4*E4` 算出来的小计，读出来是：**

```js
{ formula: 'D4*E4', result: 3897 }
```

**`result` 才是人眼看到的数字。**

**注意这里递归调用 `cellToValue`，因为 `result` 也可能是个日期序列号。**

### `v.error`

**单元格里是 `#DIV/0!`、`#REF!`、`#N/A` 的时候，`v` 是 `{ error: '#DIV/0!' }`。**

**返回 `null`，让上层校验去处理。** 不要抛错——**一个坏单元格不该让整份文件读不了。**

---

# 第 3 步：验一遍归一化对不对（20 分钟）

## 3.1 用归一化版本重新 dump

**新建 `scripts/dump-clean.js`：**

```js
const path = require('path');
const { readSheet } = require('../src/excel/reader');

(async () => {
  const file = path.join(__dirname, '..', 'tests', 'fixtures', '客户订单-原始.xlsx');
  const { sheetName, rows } = await readSheet(file);

  console.log('工作表：', sheetName);
  console.log('总行数：', rows.length);
  console.log('');

  for (const r of rows) {
    const out = r.values.map((v) => {
      if (v === null) return '·';
      if (v instanceof Date) {
        return v.toISOString().slice(0, 10);
      }
      return String(v);
    });
    console.log(String(r.rowNumber).padStart(2, '0'), out.join(' | '));
  }
})();
```

**跑：**

```text
node scripts/dump-clean.js
```

**你会看到：**

```text
工作表： Sheet1
总行数： 11

01 2026年11月订单明细 | · | · | · | · | ·
02 · | · | · | · | · | ·
03 订单号 | 客户名称 | 下单日期 | 数量 | 单价 | 备注
04 A001 | 　杭州甲乙公司 | 2023-03-15 | 3 | 1299 | ·
05 A002 | 上海丙丁（集团） | 2023-03-16 | 2 | 899 | 加急
06 A003 | 广州戊己公司 | 2023-03-17 | 10 | 199.5 | ·
07 A004 | 深圳庚辛 | 2026-11-05 | 1 | 1299 | ·
08 A005 | 成都壬癸 | 2026-11-06 | 5 | 299 | ·
09 小计 | · | · | · | · | 15692.5
10 A006 | 重庆子丑 | 2023-03-19 | 2 | 399 | ·
11 A001 | 　杭州甲乙公司 | 2023-03-15 | 3 | 1299 | ·
```

## 3.2 对照检查，四个关键点

```text
① 第 4 行日期：45000 → 2023-03-15   ✓ 对了
② 第 7 行日期：文本 "2026/11/5" → 2026-11-05   ← 这里错了
③ 第 6 行单价：199.5，不是 199.50   ← 小数位丢了（但值是对的）
④ 第 4 行客户名：前面那个全角空格还在
```

**第 ② 个必须现在就解决。**

**为什么 "2026/11/5" 变成了 2026-11-05 是巧合：** 因为你的代码里没有任何地方解析文本日期，**它可能恰好被 `new Date()` 或者库的内部逻辑处理了**。

**实际上更可能的结果是它还是字符串 `"2026/11/5"`，没有变成 Date。**

**打开 `dump-clean.js` 的输出去看真的输出。** 如果第 7 行是 `2026/11/5`（字符串），说明**文本日期根本没被转换。**

**这是第四个坑：文本日期。**

---

# 第 4 步：处理文本日期（25 分钟）

## 4.1 客户的文件里日期长什么样

**至少这七种，都会出现：**

```text
45000              数字序列号
2026-11-05         ISO
2026/11/5          斜杠，月份不补零
2026年11月5日       中文
2026.11.05         点号
20261105           8 位数字
11/5/2026          美式，月和日谁是前面？
```

**最后一种是无解的。**

```text
11/5/2026  →  2026年11月5日（美式）
           →  2026年5月11日（欧式）
```

**没有任何办法从数据本身判断。** 处理方式是：**在导入界面让客户选一次日期格式。**

**这一节先支持前六种，第七种留给第 170 节的"导入向导"。**

## 4.2 加一个日期解析函数

**在 `src/excel/reader.js` 里加：**

```js
function parseDateLoose(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    return serialToDate(value);
  }

  if (typeof value !== 'string') return null;

  const s = value.trim();
  if (s === '') return null;

  let m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/);
  if (m) {
    return safeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    return safeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n > 1 && n < 2958466) {
      return serialToDate(n);
    }
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

module.exports = { readSheet, cellToValue, serialToDate, parseDateLoose, safeDate };
```

## 4.3 三个地方要讲清

### `safeDate` 为什么要"再验一次"

```js
new Date(Date.UTC(2026, 1, 30))    // 2026-03-02
```

**`2026-02-30` 不存在，但 `Date` 不会报错，它会自动进位到 3 月 2 日。**

**如果客户的文件里写了 `2026-02-30`（可能是个笔误），你会静默地把它变成 3 月 2 日。**

**这比报错糟糕得多。** 客户永远不知道这条数据被改了。

**所以再验一次：**

```js
if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
```

**如果进位了，月份或日期就对不上，返回 `null`，让校验层报"日期无效"。**

**这个手法叫"校验回读"，所有日期解析都应该这么写。**

### `n > 1 && n < 2958466`

**`2958466` 是 Excel 支持的最大序列号（对应 9999-12-31）。**

**为什么要上限：** 因为 `20261105`（8 位数字）也是一个纯数字字符串。**如果不设上限，它会被当序列号，转出一个 5 万多年后的日期。**

**注意处理顺序：** 先匹配 8 位数字的 `YYYYMMDD`，再走"纯数字当序列号"。**顺序反了，`20261105` 会被当序列号。**

**这个顺序问题很关键。**

### 最后那个 `new Date(s)`

**兜底。`new Date("2026-11-05T00:00:00Z")` 这种能解析，其他格式看引擎心情。**

**`new Date("2026/11/5")` 在 Chrome 和 Node 里都能解析成 2026-11-05，但这是实现相关的行为，不是标准。**

**留着它是因为：** 总比返回 `null` 好，而且常见格式它确实能处理。

**但你要知道它不可靠。** 这就是为什么前面写了那么多正则——**正则能处理的，不要交给 `new Date`。**

## 4.4 自检点

**新建 `scripts/date-test.js`：**

```js
const { parseDateLoose } = require('../src/excel/reader');

const cases = [
  [45000, '2023-03-15'],
  ['45000', '2023-03-15'],
  ['2026-11-05', '2026-11-05'],
  ['2026/11/5', '2026-11-05'],
  ['2026年11月5日', '2026-11-05'],
  ['2026.11.05', '2026-11-05'],
  ['20261105', '2026-11-05'],
  ['2026-02-30', 'null（不存在的日期）'],
  ['2026-13-01', 'null（月份越界）'],
  ['', 'null'],
  [null, 'null'],
  ['   ', 'null'],
];

for (const [input, expect] of cases) {
  const d = parseDateLoose(input);
  const got = d ? d.toISOString().slice(0, 10) : 'null';
  const ok = String(expect).startsWith(got) || String(expect).includes(got);
  console.log(ok ? '✓' : '✗', JSON.stringify(input), '→', got, '（期望', expect + '）');
}
```

**跑：**

```text
node scripts/date-test.js
```

**全部 ✓ 才算过。**

**注意 `'2026-02-30'` 那一条。** 如果你看到 `2026-03-02`，说明 `safeDate` 那三行没写。

---

# 第 5 步：剥掉那层"小计"和标题（20 分钟）

**现在数据读对了，但它还不是一张表。** 前两行是标题，中间插了一行"小计"。

## 5.1 找表头

**不能写死"表头在第 3 行"。** 因为客户的文件各不相同。

**做法：找"包含已知列名最多的那一行"。**

**在 `src/excel/reader.js` 里加：**

```js
function findHeaderRow(rows, expectedHeaders, options = {}) {
  const maxScan = options.maxScan || 20;
  const threshold = options.threshold || 0.5;

  let best = { index: -1, score: 0, map: {} };

  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const values = rows[i].values.map((v) =>
      v === null ? '' : String(v).trim().replace(/\s+/g, '')
    );

    let score = 0;
    const map = {};

    expectedHeaders.forEach((name) => {
      const normalized = name.replace(/\s+/g, '');
      const idx = values.findIndex((v) => v === normalized || v.includes(normalized));
      if (idx >= 0) {
        score += 1;
        map[name] = idx;
      }
    });

    if (score > best.score) {
      best = { index: i, score, map };
    }
  }

  if (best.score / expectedHeaders.length < threshold) {
    return null;
  }

  return best;
}
```

**跑一下看结果：**

**新建 `scripts/find-header.js`：**

```js
const path = require('path');
const { readSheet, findHeaderRow } = require('../src/excel/reader');

(async () => {
  const file = path.join(__dirname, '..', 'tests', 'fixtures', '客户订单-原始.xlsx');
  const { rows } = await readSheet(file);

  const header = findHeaderRow(rows, [
    '订单号',
    '客户名称',
    '下单日期',
    '数量',
    '单价',
    '备注',
  ]);

  console.log(header);
})();
```

**期望：**

```js
{ index: 2, score: 6, map: { 订单号: 0, 客户名称: 1, 下单日期: 2, 数量: 3, 单价: 4, 备注: 5 } }
```

**`index: 2` 是数组下标（第 3 行）。`score: 6` 是六个列名全对上。**

## 5.2 为什么用"评分"而不是"精确匹配"

**客户的文件里，表头经常是：**

```text
订单编号        你的代码找"订单号" → 找不到
客户/供应商名称  你的代码找"客户名称" → 找不到
下单时间        你的代码找"下单日期" → 找不到
```

**用 `v.includes(normalized)` 能匹配上大部分。**

**但这也带来风险：** `"备注"` 会匹配到 `"备注说明"`，也可能匹配到 `"其他备注"`。**两个都叫备注的列，`findIndex` 只会取第一个。**

**这个风险要接受。** 因为导入时的列名映射，最终应该让客户确认一次——**第 170 节会做这件事**。

**现在先做到"大概率对"。**

## 5.3 过滤掉"小计"行

**"小计"这一行不能入表。怎么判断：**

```text
① 订单号那一列不是有效订单号（"小计"、"合计"、"总计"）
② 整行大部分是空的，只有一个数字
```

**做一个小函数加到 `reader.js`：**

```js
const SUMMARY_WORDS = ['小计', '合计', '总计', '累计', '汇总', 'subtotal', 'total'];

function isSummaryRow(values, keyIndex) {
  if (keyIndex >= 0) {
    const key = values[keyIndex];
    if (key !== null) {
      const s = String(key).trim().toLowerCase();
      if (SUMMARY_WORDS.some((w) => s === w || s.startsWith(w))) {
        return true;
      }
    }
  }

  const filled = values.filter((v) => v !== null && String(v).trim() !== '');
  return filled.length <= 2;
}

module.exports = {
  readSheet,
  cellToValue,
  serialToDate,
  parseDateLoose,
  safeDate,
  findHeaderRow,
  isSummaryRow,
};
```

**两个条件都检查：**

```text
条件一：第一列（订单号）是"小计"这类词 → 是汇总行
条件二：整行只有 1—2 个非空单元格 → 是汇总行或空行
```

**为什么两个都要：**

```text
只有条件一：客户把小计写在别的列，漏
只有条件二：真有一个 2 列都填了数据的正常行，误杀
```

**两个都检查，漏的和误杀的都少。**

**但"误杀"仍然可能。** 所以第 170 节会把被跳过的行也写进日志，让客户能核对。

## 5.4 组装成记录

**在 `reader.js` 里加最后一个函数：**

```js
function toRecords(rows, header, options = {}) {
  const skip = options.skipRows || [];
  const records = [];
  const skipped = [];

  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i];

    if (skip.includes(row.rowNumber)) {
      skipped.push({ rowNumber: row.rowNumber, reason: '按配置跳过' });
      continue;
    }

    const keyIndex = header.map['订单号'] ?? -1;

    if (isSummaryRow(row.values, keyIndex)) {
      skipped.push({ rowNumber: row.rowNumber, reason: '看起来是小计或空行', values: row.values });
      continue;
    }

    const rec = { __rowNumber: row.rowNumber };

    for (const [name, idx] of Object.entries(header.map)) {
      rec[name] = row.values[idx] ?? null;
    }

    records.push(rec);
  }

  return { records, skipped };
}

module.exports = {
  readSheet,
  cellToValue,
  serialToDate,
  parseDateLoose,
  safeDate,
  findHeaderRow,
  isSummaryRow,
  toRecords,
};
```

**`__rowNumber` 是给后面报错用的。**

**这一点很关键：** 客户看错误报告的时候，说的是"第 4 行错了"，不是"第 1 条记录错了"。

**你必须能说出"你文件里的第几行"，而不是"我的数组的第几项"。**

**字段名前面加两个下划线，是为了标明"这是我加的，不是客户文件里的列"。**

---

# 第 6 步：故意用一份"看起来正常"的文件打自己一次（15 分钟）

**做一份干净的文件，看你的代码有没有过度设计或者漏掉什么。**

## 6.1 快速生成一份干净的

**新建 `scripts/make-clean.js`：**

```js
const ExcelJS = require('exceljs');
const path = require('path');

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('订单');

  ws.addRow(['订单号', '客户名称', '下单日期', '数量', '单价', '备注']);
  ws.addRow(['B001', '北京某公司', new Date(Date.UTC(2026, 10, 1)), 2, 500, '']);
  ws.addRow(['B002', '天津某公司', new Date(Date.UTC(2026, 10, 2)), 1, 1200, '快递']);

  const out = path.join(__dirname, '..', 'tests', 'fixtures', '客户订单-干净.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('已生成', out);
})();
```

**跑，然后用 `dump-clean.js` 类的方式读它。**

**期望：** 表头在第 1 行（`index: 0`），两条记录，日期正确。

## 6.2 常见翻车点自查

**如果你读出来的东西不对，对照这张表：**

| 现象 | 原因 |
|---|---|
| 表头 `index: -1` | 列名和 `expectedHeaders` 差太远，或者 `maxScan` 太小 |
| 日期是 `45000` 这类数字 | `numFmt` 判断没生效，或者用了干净文件但日期写成了数字 |
| 记录里多一个 `__rowNumber` | 正常，这是我加的 |
| 读数变成 `[object Object]` | `richText` 那一段没处理 |
| 干净文件反而读错 | `findHeaderRow` 的 `threshold` 太严（6 个列名全对上才算） |

**最后一条要特别注意：** 干净文件的表头只有 6 列，全对上，`score = 6`，`6/6 = 1 > 0.5`，通过。

**但如果客户的文件少两列（比如没有"备注"），`score = 4`，`4/6 = 0.67`，还是通过。**

**少了四列，`2/6 = 0.33`，不通过，返回 `null`。**

**这个阈值 0.5 有点严。** 如果客户的必需列只有 4 个，你应该只把 4 个放进 `expectedHeaders`。**必需列和可选列要分开。**

**在第 170 节会重构这一点。现在先记住"这个阈值要按必需列算，不是按全部列算"。**

---

# 第 7 步：最终验收

## A. 文件

- [ ] `tests/fixtures/客户订单-原始.xlsx` 做好了，九个坑都做出来了
- [ ] `tests/fixtures/客户订单-干净.xlsx` 也生成了

## B. 读取

- [ ] `dump-clean.js` 能读，`richText` 变成了字符串
- [ ] 日期 `45000` 读成 `2023-03-15`
- [ ] 空单元格是 `null`，不是 `''` 也不是 `undefined`
- [ ] 公式单元格读到了 `result`

## C. 日期

- [ ] `date-test.js` 全部 ✓
- [ ] 我知道 Excel 的 1900 闰年 bug 是什么，代码里怎么处理
- [ ] 我知道 `2026-02-30` 会被 `Date` 自动进位，所以加了回读校验
- [ ] 我验证过 `45000 → 2023-03-15` 这个基准

## D. 表头和行

- [ ] `findHeaderRow` 找到了第 3 行，`score` 是 6
- [ ] "小计"那一行被跳过了，而且记录在 `skipped` 里
- [ ] `toRecords` 的每条记录都带 `__rowNumber`
- [ ] 我知道 `__rowNumber` 是干什么用的

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我把 `45000 → 2023-03-15` 这个验证写进去了
- [ ] 我列了自己客户可能给的日期格式

## 提交

```text
git add -A
git commit -m "第169节课: xlsx 读取归一化 + 日期解析 + 表头定位"
git push
```

**注意：** `tests/fixtures/` 里的 `.xlsx` 要提交。**它是测试数据，不是产物。** 而且以后每次改读取器，都要拿它跑一遍。

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `Cannot find module 'exceljs'` | 没装，或者不在 `saas-lab` 目录 | `cd saas-lab && npm install exceljs` |
| 读出来全是 `[object Object]` | 富文本没处理 | `v.richText.map(r => r.text).join('')` |
| 日期都是 `45000` 这种数字 | 没判断 `numFmt`，或者文件里格式不是日期 | 检查 `cell.numFmt`，必要时用 `parseDateLoose` 兜底 |
| 日期差一天 | 1900 闰年 bug 处理错了 | 基准用 `1899-12-31`，`n<60` 用 `n`，否则 `n-1` |
| `2026-02-30` 变成 `2026-03-02` | `Date` 自动进位，没有回读校验 | 加 `safeDate` 的月份/日期比对 |
| 表头找不到（`index: -1`） | 列名差异太大，或者阈值太高 | 降低 `threshold`，或者只用必需列做匹配 |
| 少了两列的文件导入失败 | `expectedHeaders` 把可选列也算进去了 | 必需列和可选列分开 |
| `20261105` 被当序列号 | 检查顺序错了 | 先匹配 8 位数字，再当序列号 |
| `rowCount` 比实际行数少 | `eachRow` 默认跳过空行 | 用 `{ includeEmpty: true }` |
| 合并单元格读出 `null` | 合并区域的非左上角单元格是空的 | 正常，只有左上角有值 |
| 中文文件名乱码 | 只在下载时才有这个问题 | 第 171 节讲 |
| 文件打不开（`readFile` 抛错） | 客户发的是 `.xls`（老格式）或 `.csv` | `exceljs` 不支持 `.xls`，需要让客户另存为 `.xlsx` |

---

## 本节课要能说出口的一句话

> **Excel 里没有一个单元格是干净的：文字可能是富文本对象，日期可能是序列号，数字可能带千分位，公式只有 `result` 有用。读取器的任务不是"打开文件"，是把人眼看到的东西还原成程序能用的值。**
