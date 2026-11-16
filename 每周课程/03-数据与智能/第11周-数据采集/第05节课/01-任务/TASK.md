# 第 75 节课：清洗字段

> 这节课结束时，你手上有：`第05节课/03-练习代码/collector/clean.js`（七个清洗函数）、`collector/data/raw.json`（原始脏数据，一份不动）、`collector/data/clean.json`（洗干净的 7 条）、`collector/data/diff.md`（清洗前后对照表）。

**时间**：约 110 分钟
**前置**：第 74 节课抓全的 `items-paged.json`（30 条），会用 `JSON.stringify` 写文件

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你会把数据**取回来**：`fetch` 到 JSON，`cheerio` 抽字段，分页抓全，存成 `.json`。

**取回来 ≠ 能用。**

你手上现在这堆东西长这样：

```text
{ id: 1, name: "　无线鼠标  ", price: "¥1,299.00", date: "2026/10/01" }
```

**它能存、能显示、能打印。但它不能算、不能排序、不能比大小。**

## 0.2 今天这个坑长什么样

> 你抓了 500 个商品，想算"平均价格"，写了个 `SELECT AVG(price)`，结果是 `0`。
>
> 因为 `price` 存的是文本 `"¥1,299.00"`，SQLite 把文本转数字得到 `0`。
>
> 你把 `AVG` 换成 `ORDER BY price`，出来的顺序是：
>
> ```text
> "¥ 59.90"    ← 因为空格排在 ¥ 前面
> "1,099.50"
> "1299"
> "¥1,299.00"
> "８９９元"     ← 全角数字排在最后
> ```
>
> **没有一行是对的。**

**清洗要解决的六件事，每一件都真实存在：**

| 问题 | 长什么样 | 后果 |
|---|---|---|
| 多余空白 | `"　无线鼠标  "`（全角空格 + 尾随空格） | 去重时会当成两个不同的名字 |
| 全角字符 | `"８９９元"` | 数字解析失败 |
| 价格带符号 | `"¥1,299.00"` | 无法参与计算 |
| 日期三种格式 | `2026/10/01`、`2026-10-02`、`2026年10月3日` | 无法按日期排序 |
| 缺失字段 | `""`、`null`、字段根本不存在 | 分不清"没有"和"空字符串" |
| 空字符串当值 | `note: ""` | 统计"有多少条有备注"时全算错 |

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 归一化（normalize） | 把"看起来一样但表示不同"的值变成同一个 | 第 2 步，全角转半角、空白折叠 |
| 类型转换（casting） | 把文本变成数字、把文本变成标准日期 | 第 3、4 步 |
| 缺失值（missing value） | 用 `null` 表示"这里确实没有值"，区别于 `""` | 第 5 步 |

**`""` 和 `null` 的区别今天必须搞清楚：**

```text
""     = 有一个值，这个值是空字符串    → "我查到了，但内容为空"
null   = 没有值                        → "我没查到 / 对方没给"
```

**在数据库里这两个完全不同：** `COUNT(note)` 不算 `null` 但算 `""`；`WHERE note IS NULL` 查不到 `""`。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `clean.js` | `第05节课/03-练习代码/collector/` | 清洗逻辑 + 双份输出 |
| `data/raw.json` | 同上 `data/` 子目录 | 原始脏数据，**一个字符都不改** |
| `data/clean.json` | 同上 | 洗干净的 7 条 |
| `data/diff.md` | 同上 | 清洗前后对照表 |
| `NOTES.md` | `第05节课/02-笔记/` | 第 7 步填 |

---

# 第 1 步：先看清脏在哪（20 分钟）

## 1.1 做什么 / 为什么

**做什么：** 把 `/api/dirty` 的 7 条数据取回来，逐个字段打印"长度、首尾字符的码点"，看清脏点。

**为什么不能靠眼睛看：** 因为有害字符**看不见**。

```text
"　无线鼠标  "   ← 你能看出前后有空格，但看不出第一个是全角空格（U+3000）
"８９９元"       ← 你能看出是数字，但看不出这是全角数字（U+FF18）
"1299" vs "1299" ← 看起来一样，可能其中一个是全角
```

**这两个字符串在屏幕上一模一样，在程序里是不同的东西。** 眼睛判断不了，只有码点能判断。

## 1.2 操作

**1.** 复制上一节的项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第05节课\03-练习代码"
xcopy /E /I /Y "..\第04节课\03-练习代码\collector" collector
cd collector
del fetch-pages.js state.json items-paged.json
mkdir data
```

**2.** 新建 `inspect-dirty.js`：

```javascript
// inspect-dirty.js —— 把每个字段的"体检报告"打出来
// 用法：node inspect-dirty.js

async function main() {
  const res = await fetch("http://localhost:3001/api/dirty");
  const body = await res.json();

  for (const row of body.data) {
    console.log("");
    console.log("=== id=" + row.id + " ===");
    for (const key of ["name", "price", "date", "note"]) {
      const value = row[key];

      if (value === undefined) {
        console.log("  " + key.padEnd(6) + " 字段不存在");
        continue;
      }
      if (value === null) {
        console.log("  " + key.padEnd(6) + " null");
        continue;
      }

      const codes = [...value].map((ch) => ch.codePointAt(0).toString(16)).join(" ");
      console.log("  " + key.padEnd(6) + " 长度=" + value.length + " 类型=" + typeof value + " 码点=" + codes);
      console.log("  ".padEnd(9) + " 内容=[[" + value + "]]");
    }
  }
}

main();
```

## 1.3 屏幕上应该看到什么

```text
=== id=1 ===
  name   长度=7 类型=string 码点=3000 65e0 7ebf 9f20 6807 20 20
           内容=[[　无线鼠标  ]]
  price  长度=9 类型=string 码点=a5 31 2c 32 39 39 2e 30 30
           内容=[[¥1,299.00]]
  date   长度=10 类型=string 码点=32 30 32 36 2f 31 30 2f 30 31
           内容=[[2026/10/01]]
  note   长度=2 类型=string 码点=9ed1 8272
           内容=[[黑色]]

=== id=2 ===
  name   长度=4 类型=string 码点=673a 68b0 952e 76d8
           内容=[[机械键盘]]
  price  长度=4 类型=string 码点=ff18 ff19 ff19 5143
           内容=[[８９９元]]
  date   长度=10 类型=string 码点=32 30 32 36 2d 31 30 2d 30 32
           内容=[[2026-10-02]]
  note   长度=0 类型=string 码点=
           内容=[[]]

=== id=7 ===
  name   长度=2 类型=string 码点=8033 673a
           内容=[[耳机]]
  price  长度=4 类型=string 码点=a5 32 39 39
           内容=[[¥299]]
  date   长度=10 类型=string 码点=32 30 32 36 2e 31 30 2e 30 37
           内容=[[2026.10.07]]
  note   字段不存在
```

**从这堆码点里能读出六件事：**

| 观察 | 码点证据 | 结论 |
|---|---|---|
| `id=1` 的 name 长度 7，但看着只有 4 个字 | `3000` 开头，`20 20` 结尾 | 首字符是全角空格 U+3000，尾部两个半角空格 |
| `id=2` 的 price 是 4 个字符 | `ff18 ff19 ff19` | 三个**全角**数字，不是 `38 39 39` |
| `id=1` 的 price 有 9 个字符 | `a5` 开头 | `¥` 是 U+00A5，还带一个千分位逗号 `2c` |
| 日期有三种分隔符 | `2f`(/) `2d`(-) `2e`(.) | 除了这三种，还有 `年/月/日` 的中文格式 |
| `id=2` 的 note 长度 0 | 码点为空 | 是 `""`，不是 `null` |
| `id=7` 没有 note | 打印"字段不存在" | `undefined`，和 `""`、`null` 都不同 |

**最后一条最关键：`undefined`、`null`、`""` 是三种不同的"没有"。** 你的清洗函数要能同时处理这三种，输出同一个 `null`。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 输出中文乱码 | cmd 代码页 | `chcp 65001` |
| 码点里没有 `3000` | 你的文件/终端把全角空格转成了半角 | 别用 PowerShell 管道处理，直接 `node` 输出 |
| `[...value]` 报错 | 值不是字符串（比如数字） | 这本身就是发现，先看 `typeof` |
| `id=7` 打印了 note | 你的接口数据变了 | `/api/reset` 还原 |

---

# 第 2 步：处理空白与全角（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `toHalfWidth` 和 `cleanText` 两个函数。

**为什么顺序是"先转半角，再折叠空白，最后 trim"：**

```text
原始：  "　无线鼠标  "
第一步（全角→半角）： " 无线鼠标  "     ← U+3000 变成普通空格
第二步（折叠连续空白）： " 无线鼠标 "     ← 三个空格变一个
第三步（trim）：        "无线鼠标"       ← 去掉首尾
```

**顺序错了会怎样：** 如果先 `trim` 再转半角，`"　无线鼠标"` 的 `trim()` **去不掉全角空格**（JS 的 `trim` 能去掉 `\u3000`，但很多其他语言/库不能），转完半角之后前面又剩一个空格，就白做了。

**先归一化字符，再处理空白，最后去首尾。** 这个顺序对任何语言都成立。

## 2.2 操作

新建 `clean.js`，先写这两个函数：

```javascript
// clean.js —— 七个清洗函数 + 双份输出
// 用法：node clean.js

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

// 全角 → 半角，同时把全角空格 U+3000 变成普通空格
function toHalfWidth(input) {
  return input
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, " ");
}

// 文本：转半角 → 折叠空白 → 去首尾 → 空串变 null
function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const s = toHalfWidth(String(value)).replace(/\s+/g, " ").trim();
  if (s === "") {
    return null;
  }
  return s;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }

  const res = await fetch("http://localhost:3001/api/dirty");
  if (res.status !== 200) {
    throw new Error("HTTP " + res.status);
  }
  const body = await res.json();

  fs.writeFileSync(path.join(DATA_DIR, "raw.json"), JSON.stringify(body.data, null, 2), "utf8");

  const rows = body.data.map((row) => ({
    id: row.id,
    name: cleanText(row.name),
    price: row.price,
    date: row.date,
    note: cleanText(row.note),
  }));

  for (const r of rows) {
    console.log(JSON.stringify(r));
  }
}

main();
```

## 2.3 屏幕上应该看到什么

```text
{"id":1,"name":"无线鼠标","price":"¥1,299.00","date":"2026/10/01","note":"黑色"}
{"id":2,"name":"机械键盘","price":"８９９元","date":"2026-10-02","note":null}
{"id":3,"name":"显示器 27寸","price":"1299","date":"2026年10月3日","note":null}
{"id":4,"name":"USB 集线器","price":"","date":"10/04/2026","note":"缺价格"}
{"id":5,"name":null,"price":"¥ 59.90","date":"2026/10/5","note":"名字是空白"}
{"id":6,"name":"支架","price":"1,099.50","date":"2026-10-06T08:30:00Z","note":"带时间"}
{"id":7,"name":"耳机","price":"¥299","date":"2026.10.07","note":null}
```

**四个变化，逐个确认：**

| id | 原 name | 洗后 | 说明 |
|---|---|---|---|
| 1 | `"　无线鼠标  "` | `"无线鼠标"` | 全角空格 + 尾随空格都去掉了 |
| 3 | `" 显示器　27寸 "` | `"显示器 27寸"` | **中间的全角空格保留成一个半角空格**，没有删掉 |
| 5 | `"　　"` | `null` | 全是空白 → 视为缺失 |
| 2 | `note: ""` | `null` | 空字符串归一成 null |

**第 3 条要注意：中间的空格不能删。** 删了会变成 `"显示器27寸"`，和原文不是一个东西。**只折叠，不删除。**

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 全角数字还在 | 你的正则范围写成了 `[\uFF01-\uFF00]` | 范围是 `\uFF01-\uFF5E`（全角 `！` 到 `～`） |
| 中间空格被删了 | 用了 `replace(/\s+/g, "")` | 要替换成一个空格，不是空串 |
| `"１００"` 变成 `100` 之后还是字符串 | 正常 | 第 3 步负责转数字 |
| `toHalfWidth` 报 `input.replace is not a function` | 传进来的是数字 | 先 `String(value)` |

---

# 第 3 步：价格字符串转数字（20 分钟）

## 3.1 做什么 / 为什么

**做什么：** 写 `cleanPrice`，把 `"¥1,299.00"` 变成 `1299`。

**为什么 `parseFloat` 不行：**

```javascript
parseFloat("¥1,299.00")    // NaN     ← 第一个字符不是数字
Number("¥1,299.00")        // NaN
Number("１００")           // NaN     ← 全角数字
parseInt("1,299.00", 10)   // 1       ← 遇到逗号就停
```

**四种"看起来能用"的方法全都错。** 你必须先把非数字字符剥掉。

**剥什么：**

```text
¥  (U+00A5)   货币符号
￥ (U+FFE5)   全角货币符号 —— 很容易漏
元            中文单位
, ，          千分位逗号（半角和全角）
空格          包括全角空格转过来的
```

**剥的顺序：先转半角，再剥。** 因为 `￥` 是 `¥` 的全角版本，`，` 是 `,` 的全角版本，转半角之后就只剩两种符号要处理。

## 3.2 操作

在 `clean.js` 里加：

```javascript
function cleanPrice(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const s = toHalfWidth(String(value)).replace(/[¥￥元,，\s]/g, "");

  if (s === "") {
    return null;
  }

  const n = Number(s);

  if (!Number.isFinite(n)) {
    return null;
  }

  return Math.round(n * 100) / 100;
}
```

把 `price: row.price` 改成 `price: cleanPrice(row.price)`。

## 3.3 屏幕上应该看到什么

```text
{"id":1,"name":"无线鼠标","price":1299,"date":"2026/10/01","note":"黑色"}
{"id":2,"name":"机械键盘","price":899,"date":"2026-10-02","note":null}
{"id":3,"name":"显示器 27寸","price":1299,"date":"2026年10月3日","note":null}
{"id":4,"name":"USB 集线器","price":null,"date":"10/04/2026","note":"缺价格"}
{"id":5,"name":null,"price":59.9,"date":"2026/10/5","note":"名字是空白"}
{"id":6,"name":"支架","price":1099.5,"date":"2026-10-06T08:30:00Z","note":"带时间"}
{"id":7,"name":"耳机","price":299,"date":"2026.10.07","note":null}
```

**对照原值看：**

| id | 原值 | 洗后 | 关键动作 |
|---|---|---|---|
| 1 | `"¥1,299.00"` | `1299` | 剥 `¥` 和 `,`；`1299.00` → `1299` |
| 2 | `"８９９元"` | `899` | 全角数字转半角，再剥 `元` |
| 3 | `"1299"` | `1299` | 字符串转数字 |
| 4 | `""` | `null` | 空 → null，不是 0 |
| 5 | `"¥ 59.90"` | `59.9` | 剥 `¥` 和空格 |
| 6 | `"1,099.50"` | `1099.5` | 剥逗号 |
| 7 | `"¥299"` | `299` | 剥 `¥` |

**注意两个细节：**

**第一，`1299.00` 洗成 `1299`，不是 `"1299.00"`。** JSON 里数字没有"保留两位小数"这回事，`1299.00` 和 `1299` 是同一个数。**要在展示时格式化，不在存储时格式化。**

**第二，`""` 洗成 `null`，不是 `0`。** 价格 0 元是"免费"，价格 null 是"不知道"。**把不知道写成 0，会让平均价格算低。**

**`Math.round(n * 100) / 100` 是干什么的：** 防止浮点误差。`0.1 + 0.2 = 0.30000000000000004`，保留两位就干净了。

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `price: NaN` | 没剥干净（比如还有别的符号） | 打印剥完之后的 `s` 看 |
| `price: null` 但原值是数字 | `Number.isFinite` 判掉了 | 正常，说明剥完是空串或非数字 |
| `price: 0` | 你把空值 `return 0` 了 | 改成 `return null` |
| 全角货币符号漏了 | 只剥了 `¥` | 正则里加 `￥`，或先 `toHalfWidth` |
| 小数点丢了一位 | 用了 `parseInt` | 用 `Number` |

---

# 第 4 步：日期统一成 ISO（25 分钟）

## 4.1 做什么 / 为什么

**做什么：** 写 `cleanDate`，把五种日期写法统一成 `YYYY-MM-DD`。

**为什么统一：** 因为字符串日期的大小比较**只有格式一致时才对**。

```javascript
"2026/10/01" < "2026-10-02"   // true （因为 "/" < "-"）
"2026年10月3日" < "2026-10-02" // false（因为 "年" > "-"）
```

**第二种比较是错的，但程序不会报错。** 排序结果乱七八糟，你只会觉得"SQLite 有问题"。

**要处理的五种写法：**

| 写法 | 例子 | 处理 |
|---|---|---|
| 斜杠 | `2026/10/01` | 拆分 → 补零 |
| 横杠 | `2026-10-02` | 已经规范，仍需补零 |
| 点号 | `2026.10.07` | 拆分 → 补零 |
| 中文 | `2026年10月3日` | 去掉年月日 → 补零 |
| 带时间的 ISO | `2026-10-06T08:30:00Z` | 只取日期部分 |

**还有一种必须拒绝：`10/04/2026`。**

**为什么拒绝：** 这个写法分不清是 4 月 10 日还是 10 月 4 日（美式 M/D/Y vs 欧式 D/M/Y）。**猜错的代价是日期差两个月，而且你不会发现。** 所以：**记 `null`，同时写一条警告。**

**这就是"宁可缺失，不可猜错"的具体应用。**

## 4.2 操作

在 `clean.js` 里加：

```javascript
function pad2(n) {
  return String(n).padStart(2, "0");
}

function cleanDate(value) {
  if (value === null || value === undefined) {
    return { value: null, warning: null };
  }

  const s = toHalfWidth(String(value)).trim();
  if (s === "") {
    return { value: null, warning: null };
  }

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (m) {
    return { value: m[1] + "-" + m[2] + "-" + m[3], warning: null };
  }

  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { value: m[1] + "-" + pad2(month) + "-" + pad2(day), warning: null };
    }
    return { value: null, warning: "月或日超出范围：" + s };
  }

  m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m) {
    return { value: m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]), warning: null };
  }

  return { value: null, warning: "无法确定的日期格式：" + s };
}
```

`main` 里改成：

```javascript
async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }

  const res = await fetch("http://localhost:3001/api/dirty");
  if (res.status !== 200) {
    throw new Error("HTTP " + res.status);
  }
  const body = await res.json();

  fs.writeFileSync(path.join(DATA_DIR, "raw.json"), JSON.stringify(body.data, null, 2), "utf8");

  const warnings = [];
  const rows = body.data.map((row) => {
    const d = cleanDate(row.date);
    if (d.warning !== null) {
      warnings.push("id=" + row.id + " " + d.warning);
    }
    return {
      id: row.id,
      name: cleanText(row.name),
      price: cleanPrice(row.price),
      date: d.value,
      note: cleanText(row.note),
    };
  });

  fs.writeFileSync(path.join(DATA_DIR, "clean.json"), JSON.stringify(rows, null, 2), "utf8");

  console.log("原始", body.data.length, "条 → 清洗后", rows.length, "条");
  console.log("警告", warnings.length, "条：");
  for (const w of warnings) {
    console.log("  - " + w);
  }
  console.log("");
  for (const r of rows) {
    console.log(JSON.stringify(r));
  }
}

main();
```

## 4.3 屏幕上应该看到什么

```text
原始 7 条 → 清洗后 7 条
警告 1 条：
  - id=4 无法确定的日期格式：10/04/2026

{"id":1,"name":"无线鼠标","price":1299,"date":"2026-10-01","note":"黑色"}
{"id":2,"name":"机械键盘","price":899,"date":"2026-10-02","note":null}
{"id":3,"name":"显示器 27寸","price":1299,"date":"2026-10-03","note":null}
{"id":4,"name":"USB 集线器","price":null,"date":null,"note":"缺价格"}
{"id":5,"name":null,"price":59.9,"date":"2026-10-05","note":"名字是空白"}
{"id":6,"name":"支架","price":1099.5,"date":"2026-10-06","note":"带时间"}
{"id":7,"name":"耳机","price":299,"date":"2026-10-07","note":null}
```

**四种日期都变成了同一种格式：**

| id | 原值 | 洗后 |
|---|---|---|
| 1 | `2026/10/01` | `2026-10-01` |
| 2 | `2026-10-02` | `2026-10-02` |
| 3 | `2026年10月3日` | `2026-10-03`（`3` 补成 `03`） |
| 5 | `2026/10/5` | `2026-10-05`（`5` 补成 `05`） |
| 6 | `2026-10-06T08:30:00Z` | `2026-10-06`（时间部分丢掉） |
| 7 | `2026.10.07` | `2026-10-07` |
| 4 | `10/04/2026` | `null` + 警告 |

**`id=6` 丢掉时间是有意的决定。** 这个字段的含义是"发布日期"，不是"精确时刻"。**如果业务需要精确时刻，就要保留成完整 ISO 串 `2026-10-06T08:30:00Z`，而不是丢掉。** 两种做法都对，取决于你用这个字段干什么。

**`id=4` 被拒绝而不是猜** —— 这是这一节最重要的判断。如果你想"简单点，按 M/D/Y 处理"，你会在另外 30% 的数据上错两个月。

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `2026-13-01` 被接受了 | 没校验月份范围 | 加 `month >= 1 && month <= 12` |
| `2026-1-1` 没被匹配 | 正则写成了 `\d{2}` | 用 `\d{1,2}` 再 `pad2` |
| `2026/10/01` 没被匹配 | 正则只写了 `-` | 字符组 `[-/.]` |
| 带时间的没匹配 | 末尾有 `T...` | 用 `^...T` 只匹配前缀 |
| 中文格式没匹配 | 忘了 `年|月|日` | 单独一条正则 |
| 想把 `10/04/2026` 也处理 | 会猜错 | 别处理，记 null + 警告 |

---

# 第 5 步：缺失字段统一成 null，并留对照（20 分钟）

## 5.1 做什么 / 为什么

**做什么：** 确认三种"没有"（`undefined` / `null` / `""`）都变成同一种 `null`，然后生成一份 `diff.md` 对照表。

**为什么必须有对照表：** 因为清洗是**有损**的。

```text
"¥1,299.00" → 1299        你丢了货币符号和小数位
"2026年10月3日" → 2026-10-03  你丢了原始写法
"10/04/2026" → null        你丢了整个值
```

**有损本身没错（这就是归一化的目的），错的是"不知道自己丢了什么"。**

**对照表的作用：**

```text
一、出了问题能回溯（"这个 1299 原来是带 ¥ 的吗"）
二、能看出清洗规则有没有误伤（"这条日期为什么变 null 了"）
三、给下一个人看（包括三个月后的你）
```

**所以 `raw.json` 一个字符都不能改。** 清洗只能**新增** `clean.json`，不能覆盖 `raw.json`。

## 5.2 操作

**1.** 先确认三种"没有"都归一了。在 `main` 里加一段统计：

```javascript
  const missing = { name: 0, price: 0, date: 0, note: 0 };
  for (const r of rows) {
    for (const key of ["name", "price", "date", "note"]) {
      if (r[key] === null) {
        missing[key] += 1;
      }
    }
  }
  console.log("缺失统计：", missing);
```

**2.** 生成对照表。加一个函数，在写完 `clean.json` 后调用：

```javascript
function writeDiff(rawRows, cleanRows) {
  const lines = [];
  lines.push("# 清洗前后对照");
  lines.push("");
  lines.push("| id | 字段 | 原始值 | 清洗后 | 变了什么 |");
  lines.push("|---|---|---|---|---|");

  for (let i = 0; i < rawRows.length; i += 1) {
    const raw = rawRows[i];
    const clean = cleanRows[i];
    for (const key of ["name", "price", "date", "note"]) {
      const before = raw[key] === undefined ? "(字段不存在)" : JSON.stringify(raw[key]);
      const after = JSON.stringify(clean[key]);
      if (before === after) {
        continue;
      }
      lines.push("| " + raw.id + " | " + key + " | " + before + " | " + after + " | " + describe(key) + " |");
    }
  }

  fs.writeFileSync(path.join(DATA_DIR, "diff.md"), lines.join("\n"), "utf8");
  console.log("对照表已写入 data/diff.md，共 " + (lines.length - 4) + " 处变化");
}

function describe(key) {
  if (key === "name") {
    return "去空白 / 全角转半角 / 空串归一";
  }
  if (key === "price") {
    return "剥货币符号和千分位 / 转数字";
  }
  if (key === "date") {
    return "统一成 YYYY-MM-DD";
  }
  return "空串归一成 null";
}
```

在 `main` 末尾调用 `writeDiff(body.data, rows);`。

## 5.3 屏幕上应该看到什么

```text
原始 7 条 → 清洗后 7 条
警告 1 条：
  - id=4 无法确定的日期格式：10/04/2026
缺失统计： { name: 1, price: 1, date: 1, note: 3 }
对照表已写入 data/diff.md，共 18 处变化
```

**逐个核对这四个数字（这一步必须自己做，不能信我）：**

| 字段 | 数量 | 是哪几条 |
|---|---|---|
| `name` | 1 | id=5（`"　　"` 全是空白） |
| `price` | 1 | id=4（`""`） |
| `date` | 1 | id=4（`10/04/2026` 无法确定） |
| `note` | 3 | id=2（`""`）、id=3（`null`）、id=7（字段不存在） |

**核对方法：** `type data\clean.json`，`Ctrl+F` 搜 `"name": null`，数一下出现几次。**如果程序和你的数不一致，先怀疑自己的数，别改代码去凑。**

`type data\diff.md`：

```text
# 清洗前后对照

| id | 字段 | 原始值 | 清洗后 | 变了什么 |
|---|---|---|---|---|
| 1 | name | "　无线鼠标  " | "无线鼠标" | 去空白 / 全角转半角 / 空串归一 |
| 1 | price | "¥1,299.00" | 1299 | 剥货币符号和千分位 / 转数字 |
| 1 | date | "2026/10/01" | "2026-10-01" | 统一成 YYYY-MM-DD |
| 2 | price | "８９９元" | 899 | 剥货币符号和千分位 / 转数字 |
| 2 | note | "" | null | 空串归一成 null |
| 3 | name | " 显示器　27寸 " | "显示器 27寸" | 去空白 / 全角转半角 / 空串归一 |
| 3 | price | "1299" | 1299 | 剥货币符号和千分位 / 转数字 |
| 3 | date | "2026年10月3日" | "2026-10-03" | 统一成 YYYY-MM-DD |
| 4 | price | "" | null | 剥货币符号和千分位 / 转数字 |
| 4 | date | "10/04/2026" | null | 统一成 YYYY-MM-DD |
| 5 | name | "　　" | null | 去空白 / 全角转半角 / 空串归一 |
| 5 | price | "¥ 59.90" | 59.9 | 剥货币符号和千分位 / 转数字 |
| 5 | date | "2026/10/5" | "2026-10-05" | 统一成 YYYY-MM-DD |
| 6 | price | "1,099.50" | 1099.5 | 剥货币符号和千分位 / 转数字 |
| 6 | date | "2026-10-06T08:30:00Z" | "2026-10-06" | 统一成 YYYY-MM-DD |
| 7 | price | "¥299" | 299 | 剥货币符号和千分位 / 转数字 |
| 7 | date | "2026.10.07" | "2026-10-07" | 统一成 YYYY-MM-DD |
| 7 | note | (字段不存在) | null | 空串归一成 null |
```

**注意表里没有"没变"的行**（比如 id=2 的 name 本来就是干净的）。**只列变化，表才短、才有用。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `raw.json` 被改了 | 你直接 `readFileSync` 后又 `writeFileSync` 回去 | 原始文件只写一次，之后只读 |
| 对照表全是"没变" | 比较用了清洗后的对象自己比自己 | 一定要 `rawRows` 和 `cleanRows` 两个数组比 |
| `undefined` 打印成 `undefined` 而不是 `(字段不存在)` | 没做判断 | 加 `=== undefined ? "(字段不存在)" : ...` |
| `describe` 里 `key` 拼错 | 字段名是 `name` 不是 `title` | 对照 `clean.json` 的键名 |

---

# 第 6 步：故意犯四个错（15 分钟）

## 错误 1：用 `parseFloat` 直接转价格

**现象：** 7 条价格里 5 条是 `null`：

```text
{"id":1,"price":null,...}
{"id":2,"price":null,...}
```

**原因：** `parseFloat("¥1,299.00")` → `NaN`，`Number.isFinite(NaN)` → `false` → `null`。

**怎么查：** 在函数里打印中间值：

```javascript
console.log("原值:", JSON.stringify(value), "剥完:", JSON.stringify(s), "数字:", n);
```

**你会看到 `剥完: "¥1,299.00"`** —— 说明剥的动作根本没生效（你可能把 `toHalfWidth` 写在 `parseFloat` 之后了）。

## 错误 2：把"缺失"写成 0 或空字符串

**现象：** 价格缺失的记录变成 `price: 0`，之后算平均价得出"平均 37 元"。

**原因：** 你在 `cleanPrice` 里 `return 0`，或者在 SQL 里用了 `COALESCE(price, 0)`。

**怎么查：**

```text
一、SELECT COUNT(*) FROM items WHERE price = 0;  ← 有几条？
二、和 raw.json 对照：这些 0 原来是不是空值？
```

**规则：缺失就是 null。要显示成 0 是前端的事，不是存储的事。**

## 错误 3：按"看起来对"的方式猜日期

**现象：** `10/04/2026` 被你按 M/D/Y 解析成 `2026-10-04`。三个月后发现这批数据的日期整体错位。

**原因：** 你为了让 `null` 少一点，给它加了一条"猜测"规则。

**怎么查：** **统计有多少条日期是 null，再抽样 20 条回原始页面核对。** 如果 null 很多，正确的做法是去确认数据源的约定（看接口文档，或者问对方），不是猜。

**判断规则：一个字段如果"猜"能让覆盖率从 85% 到 100%，但猜错率 30%，那不如保留 15% 的 null。** 因为 null 你能看见，错的日期你看不见。

## 错误 4：清洗时覆盖了原始文件

**现象：** 想重新洗一遍，发现 `raw.json` 里的 `"¥1,299.00"` 已经变成 `1299` 了。

**原因：** 你的代码是"读 `raw.json` → 洗 → 写回 `raw.json`"。

**怎么查：** `type data\raw.json`，看里面还有没有 `¥`。没有就说明被覆盖了。

**规则：原始数据文件一次写入，永不修改。** 这一条会在第 76 节救命 —— 洗错了你还能重洗，覆盖了只能重新抓（而对方可能已经改版了）。

---

# 第 7 步：写学习笔记（10 分钟）

**打开 `第05节课/02-笔记/NOTES.md`，按这十一个小标题填，一个字都不要改。**

```markdown
# 第 75 节课学习笔记

## 一、我在 `/api/dirty` 里看到的脏点

| id | 字段 | 脏在哪（用码点或字符说明） |
|---|---|---|
| 1 | name | |
| 2 | price | |
| 1 | price | |
| 7 | note | |

## 二、全角转半角的范围

`\uFF01-\uFF5E` 对应什么：

为什么要单独处理 `\u3000`：

## 三、清洗文本的三步顺序

1.
2.
3.

顺序能不能换，为什么：

## 四、为什么 `parseFloat` 不行

四种方法的结果：

| 写法 | 结果 |
|---|---|
| `parseFloat("¥1,299.00")` | |
| `Number("¥1,299.00")` | |
| `Number("１００")` | |
| `parseInt("1,299.00", 10)` | |

## 五、价格要剥掉哪些字符

## 六、日期我支持了哪几种格式

| 写法 | 例子 | 我的处理 |
|---|---|---|
| | | |

我为什么拒绝 `10/04/2026`：

## 七、三种"没有"的区别

| 写法 | 含义 | 洗成什么 |
|---|---|---|
| `""` | | |
| `null` | | |
| 字段不存在 | | |

## 八、我的对照表有多少处变化

共 ___ 处。我最意外的一处是：

## 九、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 用 `parseFloat` | | |
| 缺失写成 0 | | |
| 猜日期 | | |
| 覆盖原始文件 | | |

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] `data/raw.json` 里还能看到 `¥` 和全角字符
- [ ] `data/clean.json` 里价格是数字、日期是 `YYYY-MM-DD`
- [ ] 缺失统计里 `note` 的数字我自己核对过
- [ ] `data/diff.md` 只列变化行
- [ ] 我把 `10/04/2026` 洗成了 null 并留下了警告
- [ ] 我打印过码点，知道全角空格的码点是 `3000`
```

---

# 第 8 步：课后练习

## 练习一：加一个 `cleanInt`

有些字段是整数（比如库存、销量），可能写成 `"1,200 件"`、`"１２"`、`"约 30"`。

要求：剥掉非数字字符后转整数；**遇到"约"这种模糊词返回 null 并写警告**。

## 练习二：日期支持"相对时间"并拒绝

有些数据源给 `"3天前"`、`"昨天"`。

要求：**不要猜具体日期**（因为不知道抓取时刻），改成：抓到相对时间时，用 `fetched_at` 反推并标注 `date_estimated: true`。

**做完回答：** 为什么不直接算出日期就算完？

## 练习三：把清洗规则抽成配置

现在七个函数是硬编码的。改成一个规则表：

```javascript
const RULES = {
  name: { type: "text" },
  price: { type: "price" },
  date: { type: "date" },
  note: { type: "text" },
};
```

然后写一个 `cleanRow(row, rules)` 按表分派。

**做完回答：** 抽完更好维护了吗？如果只有四五个字段，值不值得抽？

## 练习四：给清洗加"自检"

要求：清洗完自动检查三件事，任何一件不过就抛错：

```text
一、清洗后的记录数 = 原始记录数
二、price 字段的类型全是 number 或 null（不能有 string）
三、date 字段要么是 null，要么匹配 /^\d{4}-\d{2}-\d{2}$/
```

## 练习五：用自己的话讲清

```text
1. 为什么"清洗"必须有原始数据留着？丢了会怎样？
2. `""` 和 `null` 在数据库里有什么不同？为什么不能混用？
3. 为什么价格缺失不能写成 0？会算错什么？
4. `10/04/2026` 为什么不能猜？猜错的后果是什么？
5. 为什么 `parseFloat("1,299")` 得到 1 而不是 1299？
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出清洗要解决的六件事
- [ ] 我知道全角字符的码点范围，以及 `\u3000` 是什么
- [ ] 我能解释为什么 `parseFloat` / `Number` / `parseInt` 都处理不了带符号的价格
- [ ] 我知道 `""`、`null`、字段不存在三者的区别
- [ ] 我能说出为什么拒绝 `10/04/2026` 而不是猜
- [ ] 我知道为什么原始文件不能覆盖

## B. 实操

- [ ] `collector/clean.js` 能跑，输出 7 条清洗结果
- [ ] `data/raw.json` 里还有 `¥`、`８９９`、全角空格
- [ ] `data/clean.json` 里 `price` 是数字，`date` 是 `YYYY-MM-DD`
- [ ] `data/diff.md` 只列变化行，共十几处
- [ ] 警告里有 `id=4 无法确定的日期格式`
- [ ] 缺失统计的四个数字我核对过

## C. 排错

- [ ] 价格变 null 时我知道先打印"剥完之后"的字符串
- [ ] 日期没匹配时我知道检查正则里的分隔符字符组
- [ ] 对照表为空时我知道是拿同一个数组比了两次
- [ ] `raw.json` 被覆盖时我知道要重新抓一次

## D. 笔记

- [ ] 十一个小标题都在，顺序和课件一致
- [ ] 第一节的脏点是我自己用码点看出来的
- [ ] 第八节的变化数是我自己跑出来的
- [ ] "我还不懂的词"至少 2 个

## 本节课要能说出口的一句话

> **清洗是归一化，不是美化：先把字符统一，再折叠空白，最后才去首尾；数字要剥符号再转，日期要统一成 ISO，缺失一律写 null，而原始数据永远保留一份。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 价格全是 null | 剥符号的正则生效了吗 | 打印中间字符串 |
| 价格变 0 | 是不是 `return 0` | 改成 `return null` |
| 全角数字没转 | 范围写错 | `\uFF01-\uFF5E` |
| 中间空格被删 | 替换成了空串 | 替换成一个空格 |
| 日期没匹配 | 分隔符只写了 `-` | 用 `[/.-]` 字符组，注意 `-` 放最后 |
| 日期变成上个月的 | 猜了 M/D/Y | 别猜，记 null |
| 对照表全是"没变" | 同一个数组比自己 | 用 raw 和 clean 两个数组 |
| `raw.json` 丢了原始值 | 被覆盖了 | 重新抓一次，之后只读 |
| `type` 看中文乱码 | cmd 代码页 | `chcp 65001` |
| `mkdir data` 说已存在 | 已经建过 | 不用管，继续 |
