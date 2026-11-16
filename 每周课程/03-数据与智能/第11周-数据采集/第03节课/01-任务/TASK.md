# 第 73 节课：网页基础抓取

> 这节课结束时，你手上有：`第03节课/03-练习代码/collector/grab-html.js`（把 HTML 存成本地文件）、`collector/parse-cheerio.js`（用选择器抽字段 + 结构变化检查点）、`collector/raw-list.html`（你抓下来的原始页面）。

**时间**：约 110 分钟
**前置**：第 72 节课的 `collector` 项目（能起 mock-server，会写 `fetchJson`）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你会的：从接口拿 JSON，字段对字段地取。

```javascript
const body = await res.json();
console.log(body.data[0].title);   // 对方给什么名字，你就用什么名字
```

**JSON 是"已经整理好"的数据。** 字段是字段，值是值，你不用猜。

**今天的对象不是 JSON，是一张网页。**

## 0.2 今天这个坑长什么样

> 你要抓一个商品列表页。浏览器里看着很整齐：一行一个商品，标题、价格、日期三列。
>
> 你把 HTML 存下来打开，看到的是这样一堆东西：
>
> ```html
> <tr><td class="title">示例条目 1</td><td class="price">101</td><td class="date">2026-10-02</td></tr>
> <tr><td class="title">示例条目 2</td><td class="price">102</td><td class="date">2026-10-03</td></tr>
> ```
>
> 你想"这不就是文本吗，切一刀就行"，于是写了 `html.split("<tr>")`。跑出来 11 条（多了个表头），改成 `.slice(1)` 变成 10 条，看着对了。
>
> **两周后对方给每行加了个 `data-id` 属性**：`<tr data-id="1">`。你的 `split("<tr>")` 一条都切不出来，程序"正常跑完"，抓到 0 条。

**今天的核心矛盾：**

```text
用字符串截取：写起来 10 行，对方改一个空格就可能全崩，崩了还不报错
用选择器：     写起来 5 行，对方改结构时你也会抓到 0 条，但至少你能检查出来
```

**两条路都走一遍。走完你才知道什么时候该用哪条。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| view-source（查看网页源代码） | 看服务器**发过来的原始 HTML**，不是浏览器渲染后的样子 | 第 1 步，5 分钟判断数据在不在 HTML 里 |
| 选择器（selector） | 用 CSS 的写法"定位"页面上某一块，比如 `#list tbody tr` | 第 3 步，cheerio 全靠它 |
| 结构变化检查点 | 一段代码，专门检查"这次抓到的和上次比，是不是少了很多" | 第 5 步，唯一能让你在对方改版时立刻知道的东西 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `grab-html.js` | `第03节课/03-练习代码/collector/` | 抓 HTML 存文件，打印状态码和长度 |
| `raw-list.html`、`raw-v2.html` | 同上 | 抓下来的原始页面（正常版 / 改版） |
| `parse-cheerio.js` | 同上 | 选择器抽字段 + 检查点 |
| `NOTES.md` | `第03节课/02-笔记/` | 第 7 步填 |

---

# 第 1 步：先用 5 分钟判断数据在不在 HTML 里（15 分钟）

## 1.1 做什么 / 为什么

**做什么：** 用 `view-source` 和 `curl` 看 mock-server 的 `/html` 页面，确认"数据确实在 HTML 源码里"。

**为什么先做这一步：** 如果数据不在 HTML 里（是 JS 渲染的），你后面写多少选择器都是白写。**这一步 5 分钟，能省掉几小时。**

**判断只有三个动作：**

```text
一、浏览器打开页面，右键 → 查看网页源代码（Ctrl+U）
二、在源码里 Ctrl+F 搜一个你确定页面上存在的词（比如"示例条目 7"）
三、搜得到 = 数据在 HTML 里；搜不到 = 数据是 JS 后来填进去的
```

**"查看网页源代码"和"检查"是两个东西：**

| 你点的 | 你看到的 | 能不能用来判断 |
|---|---|---|
| 查看网页源代码（`Ctrl+U`） | 服务器发过来的原始 HTML | 能。这就是 `fetch` 拿到的东西 |
| 检查（`F12` → Elements） | 浏览器**执行完 JS 之后**的 DOM | 不能。这里永远有数据，会让你误判 |

**这是新手最常踩的坑：用"检查"看到数据，就以为 `fetch` 也能拿到。**

## 1.2 操作

**1.** 确认 mock-server 在跑（第 72 节那个窗口）。

**2.** 浏览器访问：

```text
http://localhost:3001/html?page=1
```

**3.** 应该看到 10 行商品的表格。按 `Ctrl + U` 看源码，`Ctrl + F` 搜 `示例条目 7`。

**4.** 换一个 cmd 窗口，把上一节的项目复制过来，再抓一份 HTML：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第03节课\03-练习代码"
xcopy /E /I /Y "..\第02节课\03-练习代码\collector" collector
cd collector
del first-fetch.js error-case.js error-case-fixed.js limit-case.js timeout-case.js ua-case.js
curl.exe -s "http://localhost:3001/html?page=1" -o raw-list.html
type raw-list.html
```

**为什么 `xcopy` 整个文件夹：** `node_modules` 会一起复制过来，省掉再装一次 cheerio 的时间。`del` 是清掉上一节用不到的脚本，避免你自己搞混。

## 1.3 屏幕上应该看到什么

`type raw-list.html`：

```text
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>商品列表 第 1 页</title></head>
<body>
    <h1>商品列表</h1>
    <table id="list">
      <thead><tr><th>标题</th><th>价格</th><th>日期</th></tr></thead>
      <tbody>
      <tr><td class="title">示例条目 1</td><td class="price">101</td><td class="date">2026-10-02</td></tr>
      <tr><td class="title">示例条目 2</td><td class="price">102</td><td class="date">2026-10-03</td></tr>
      ...
      </tbody>
    </table>
    <div class="pager">第 1 页 / 共 3 页</div>
</body>
</html>
```

**在 `raw-list.html` 里搜 `示例条目 7`，能搜到。结论：数据在 HTML 里，可以抓。**

**再做一个对照实验**，让你知道"结构变了"长什么样：

```text
curl.exe -s "http://localhost:3001/html?page=1&version=2" -o raw-v2.html
type raw-v2.html
```

```text
<body>
    <h1>商品列表</h1>
    <div class="grid">
      <div class="item-card"><span class="name">示例条目 1</span><em class="cost">101 元</em></div>
      <div class="item-card"><span class="name">示例条目 2</span><em class="cost">102 元</em></div>
      ...
```

**这也是静态 HTML，只是结构和 class 名都变了。** 第 4 步用它做改版实验。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Ctrl+U` 的源码里搜不到数据 | 数据是 JS 渲染的 | 按第 71 节去 F12 的 Network 找 XHR；找不到再考虑自动化 |
| `curl: (7) Failed to connect` | 服务器没跑 | 回第 72 节那个窗口看 |
| `type` 输出中文乱码 | cmd 代码页 | `chcp 65001`；文件本身没问题 |
| `xcopy` 问"是否覆盖" | 目标已存在 | 加 `/Y` 就是自动覆盖 |
| `del` 说找不到文件 | 文件名拼错 | `dir` 看一眼实际有什么 |

---

# 第 2 步：手写字符串截取（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** **不装任何包**，只用 `indexOf` / `slice` / `split` 把 10 条记录抽出来。

**为什么先学这个：** 两种情况你必须手写 ——

```text
一、只取一个值的时候（比如页面标题）。为一行字符串装一个 2MB 的解析库不值得。
二、环境装不上包的时候（老服务器、没网）。手写是唯一兜底。
```

**而且手写一遍，你才会真正明白选择器在替你做什么。**

## 2.2 操作

新建 `grab-html.js`：

```javascript
// grab-html.js —— 抓 HTML 并存成本地文件
// 用法：node grab-html.js（mock-server 要在 3001 端口跑着）

const fs = require("fs");
const path = require("path");

const URL_LIST = "http://localhost:3001/html?page=1";
const OUT_FILE = path.join(__dirname, "raw-list.html");

async function main() {
  const res = await fetch(URL_LIST);

  console.log("status:", res.status);
  console.log("content-type:", res.headers.get("content-type"));

  if (res.status !== 200) {
    console.log("对方返回了 " + res.status + "，不往下走");
    return;
  }

  const html = await res.text();
  console.log("HTML 长度:", html.length, "字符");

  fs.writeFileSync(OUT_FILE, html, "utf8");
  console.log("已保存:", OUT_FILE);
}

main();
```

再新建 `parse-manual.js`，纯字符串处理：

```javascript
// parse-manual.js —— 不装包，纯字符串截取
// 用法：node parse-manual.js

const fs = require("fs");
const path = require("path");

const HTML_FILE = path.join(__dirname, "raw-list.html");

function parseManual(html) {
  const start = html.indexOf("<tbody>");
  const end = html.indexOf("</tbody>");

  if (start === -1 || end === -1) {
    return [];
  }

  const body = html.slice(start + "<tbody>".length, end);
  const chunks = body.split("<tr>").slice(1);

  const rows = [];
  for (const chunk of chunks) {
    const cells = chunk.split("</td>");
    if (cells.length < 3) {
      continue;
    }
    const title = cells[0].replace(/<[^>]+>/g, "").trim();
    const price = cells[1].replace(/<[^>]+>/g, "").trim();
    const date = cells[2].replace(/<[^>]+>/g, "").trim();
    rows.push({ title: title, price: price, date: date });
  }
  return rows;
}

function main() {
  const html = fs.readFileSync(HTML_FILE, "utf8");
  const rows = parseManual(html);
  console.log("抓到", rows.length, "条");
  console.log("第 1 条:", rows[0]);
  console.log("第 10 条:", rows[9]);
}

main();
```

## 2.3 屏幕上应该看到什么

`node grab-html.js`：

```text
status: 200
content-type: text/html; charset=utf-8
HTML 长度: 1339 字符
已保存: B:\OPC-Distance_study\...\collector\raw-list.html
```

`node parse-manual.js`：

```text
抓到 10 条
第 1 条: { title: '示例条目 1', price: '101', date: '2026-10-02' }
第 10 条: { title: '示例条目 10', price: '110', date: '2026-10-11' }
```

**看起来成功了。** 记住 `1339` 这个数字：只有 10 条记录的页面就 1.3KB。1000 条商品的真站页面通常 500KB—2MB —— **这也是为什么后面要分页，不要一次抓一个巨大的列表页。**

**现在把 `parse-manual.js` 里的文件名换成 `raw-v2.html`：**

```javascript
const HTML_FILE = path.join(__dirname, "raw-v2.html");
```

```text
抓到 0 条
第 1 条: undefined
第 10 条: undefined
```

**没有报错，进程退出码是 0（成功）。** 这就是最危险的情况：**程序说自己成功了，实际一条没抓到。**

**为什么 0 条：** v2 页面里没有 `<tbody>`，`indexOf` 返回 `-1`，走进 `return []` 分支。**你的代码"优雅地处理了异常"，结果是静默失败。**

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `ENOENT: no such file or directory` | 没先跑 `grab-html.js` | 先抓再解析 |
| `抓到 0 条` 但文件里有数据 | 分隔符不对（真实页面可能是 `<tr class="row">`） | `type` 看 `<tr` 后面跟了什么 |
| 字段里带 `&nbsp;` | HTML 实体没解码 | 手写版要自己 `replace(/&nbsp;/g, " ")`；cheerio 自动处理 |
| `第 1 条: undefined` | `rows` 是空数组 | 先 `console.log(rows.length)` |

---

# 第 3 步：装 cheerio，用选择器抽（25 分钟）

## 3.1 做什么 / 为什么

**做什么：** 装 cheerio，用 `$("#list tbody tr")` 抽出同样的 10 条。

**为什么不用正则：**

```text
正则：    <tr><td class="title">(.*?)</td>...   ← 属性顺序变了就崩
                                                  嵌套标签、换行、实体全处理不了
cheerio： $("#list tbody tr")                   ← 你描述"在哪"，不描述"长什么样"
```

**为什么不用正则解析 HTML（这条要记死）：** HTML **不是正则语言**，它的结构可以嵌套，而正则数不了嵌套层数。你写 `/<div>(.*?)<\/div>/`，遇到嵌套 div 就抓错。这不是"正则写得不够好"，是**工具选错了**。

**为什么用 cheerio 不用 jsdom：**

| | cheerio | jsdom |
|---|---|---|
| 干什么 | 解析 HTML 字符串，提供 jQuery 风格查询 | 完整模拟浏览器 DOM，能执行 JS |
| 体积 | 小 | 大（几十个依赖） |
| 我们需要的 | 就是查询 | 用不上 |

**我们用不到"执行 JS"，所以不需要 jsdom。** 需要执行 JS 的场景是第 71 节说的"浏览器自动化"，那是另一条路。

## 3.2 操作

```text
npm install cheerio
```

新建 `parse-cheerio.js`：

```javascript
// parse-cheerio.js —— 用选择器抽字段
// 用法：node parse-cheerio.js

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const HTML_FILE = path.join(__dirname, "raw-list.html");

function parse(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("#list tbody tr").each((index, el) => {
    const title = $(el).find("td.title").text().trim();
    const price = $(el).find("td.price").text().trim();
    const date = $(el).find("td.date").text().trim();

    if (title === "" && price === "" && date === "") {
      return;
    }

    rows.push({ title: title, price: price, date: date });
  });

  return rows;
}

function main() {
  const html = fs.readFileSync(HTML_FILE, "utf8");
  const rows = parse(html);

  console.log("抓到", rows.length, "条");
  console.log("第 1 条:", rows[0]);
  console.log("第 10 条:", rows[9]);
  console.log("标题列表:", rows.map((r) => r.title).join(" / "));
}

main();
```

## 3.3 屏幕上应该看到什么

`npm install cheerio`：

```text
added 22 packages in 2s
```

`node parse-cheerio.js`：

```text
抓到 10 条
第 1 条: { title: '示例条目 1', price: '101', date: '2026-10-02' }
第 10 条: { title: '示例条目 10', price: '110', date: '2026-10-11' }
标题列表: 示例条目 1 / 示例条目 2 / 示例条目 3 / 示例条目 4 / 示例条目 5 / 示例条目 6 / 示例条目 7 / 示例条目 8 / 示例条目 9 / 示例条目 10
```

**结果和手写版一模一样，代码短了一半。**

**把选择器拆开读：**

| 部分 | 意思 |
|---|---|
| `#list` | id 是 `list` 的元素（那张表） |
| `tbody` | 它下面的 `tbody` |
| `tr` | `tbody` 下面的每一行 |
| `td.title` | 这一行里 class 是 `title` 的单元格 |

**`$(el).find("td.title")` 里的 `el` 是"当前这一行"。** 从当前行里找，不是从整个文档里找 —— 写错了会把所有行的第一个格子都取回来（第 6 步错误 3）。

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot find module 'cheerio'` | 不在 `collector` 里跑，或没装 | `dir node_modules\cheerio` 确认 |
| `抓到 0 条` | 选择器不匹配实际结构 | 先 `Ctrl+U` 看真实标签，再用 `$("tr").length` 试探 |
| 每行都抓到相同内容 | 用了 `$("td.title")` 而不是 `$(el).find(...)` | 一定从 `el` 里 find |
| 字段带很多空格 | 没 `.trim()` | 加 `.trim()`；第 75 节会统一处理 |

---

# 第 4 步：选择器写太细，一改就崩（15 分钟）

## 4.1 做什么 / 为什么

**做什么：** 写一个粗细对比实验，看同一份 HTML、不同精度的选择器各抓到几条。

**为什么：** "选择器写多细"是真实取舍 —— 写粗了怕抓错，写细了怕改版。**你需要知道那条线在哪。**

## 4.2 操作

新建 `selector-test.js`：

```javascript
// selector-test.js —— 同一页面，四种精度的选择器各抓到几条
// 用法：node selector-test.js

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const FILES = ["raw-list.html", "raw-v2.html"];

const SELECTORS = [
  "tr",
  "#list tbody tr",
  "#list > tbody > tr",
  ".content > #list > tbody > tr > td.title",
];

function main() {
  for (const file of FILES) {
    const full = path.join(__dirname, file);
    if (!fs.existsSync(full)) {
      console.log(file + " 不存在，跳过");
      continue;
    }
    const html = fs.readFileSync(full, "utf8");
    const $ = cheerio.load(html);
    console.log("");
    console.log("=== " + file + " ===");
    for (const sel of SELECTORS) {
      console.log("  " + sel.padEnd(42) + " → " + $(sel).length + " 个");
    }
  }
}

main();
```

## 4.3 屏幕上应该看到什么

```text
=== raw-list.html ===
  tr                                         → 11 个
  #list tbody tr                             → 10 个
  #list > tbody > tr                         → 10 个
  .content > #list > tbody > tr > td.title   → 0 个

=== raw-v2.html ===
  tr                                         → 0 个
  #list tbody tr                             → 0 个
  #list > tbody > tr                         → 0 个
  .content > #list > tbody > tr > td.title   → 0 个
```

**四种选择器，三种结果，说明三件事：**

| 现象 | 说明 |
|---|---|
| `tr` 抓到 11 个 | 太粗：把表头那行也算进来了 |
| `#list tbody tr` 抓到 10 个 | 刚好：够定位，又没绑死外层结构 |
| `.content > ...` 抓到 0 个 | 太细：外层根本没有 `.content` |
| v2 的四种全是 0 | 改版时**无论多细都会归零** |

**第三条是最容易犯的错：** 你在 F12 里右键 → Copy → Copy selector，得到：

```text
body > div:nth-child(3) > div > table > tbody > tr:nth-child(1) > td:nth-child(2)
```

**这段明天就可能失效** —— 对方加一个 div，`nth-child(3)` 就变了。

**怎么选：**

```text
锚定在"最稳的那一层"：
  有 id        → 用 id（#list）
  有语义 class → 用 class（td.title）
  都没有       → 用 标签 + 最少结构（tbody tr）
永远不要     → 用 nth-child、用复制出来的长路径
```

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `raw-v2.html` 不存在 | 第 1 步没抓 v2 | 重跑 `curl.exe -s "...&version=2" -o raw-v2.html` |
| `padEnd` 后中文对不齐 | 中文字符宽度问题 | 不影响判断，别管 |
| 真站上 `#list tbody tr` 也 0 个 | 真站没有 id | 这是常态，用 class 或 `table` 兜底 |

---

# 第 5 步：加一个"结构变了"的检查点（20 分钟）

## 5.1 做什么 / 为什么

**做什么：** 在解析后面加一段检查：**抓到几条、字段空了几条、和预期比是不是暴跌**。不通过就打印原因并以非 0 退出码结束。

**为什么这是这一节最重要的一步：** 第 4 步的结论是"改版时选择器一律归零"。**你没法让选择器永不失效，你只能让失效被立刻发现。**

```text
没有检查点：跑完 → 写入 0 条 → 退出码 0 → 你以为成功 → 三天后发现库是空的
有检查点：  跑完 → 检查不通过 → 打印"一条都没抓到" → 退出码 1 → 任务标红
```

**这个检查点第 77 节会直接复用，用来决定"这次运行算成功还是失败"。**

## 5.2 操作

改写 `parse-cheerio.js`：

```javascript
// parse-cheerio.js —— 选择器抽字段 + 结构变化检查点
// 用法：node parse-cheerio.js

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const HTML_FILE = path.join(__dirname, "raw-list.html");
const EXPECTED_MIN = 5;
const MAX_EMPTY_RATE = 0.2;

function parse(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("#list tbody tr").each((index, el) => {
    const title = $(el).find("td.title").text().trim();
    const price = $(el).find("td.price").text().trim();
    const date = $(el).find("td.date").text().trim();

    if (title === "" && price === "" && date === "") {
      return;
    }

    rows.push({ title: title, price: price, date: date });
  });

  return rows;
}

function check(rows) {
  const problems = [];

  if (rows.length === 0) {
    problems.push("一条都没抓到：选择器很可能已经失效");
    return problems;
  }

  if (rows.length < EXPECTED_MIN) {
    problems.push("只抓到 " + rows.length + " 条，少于预期下限 " + EXPECTED_MIN + " 条");
  }

  const fields = ["title", "price", "date"];
  for (const field of fields) {
    const empty = rows.filter((r) => r[field] === "").length;
    const rate = empty / rows.length;
    if (rate > MAX_EMPTY_RATE) {
      problems.push(
        "字段 " + field + " 有 " + empty + " 条是空的（" + Math.round(rate * 100) + "%），超过 " + Math.round(MAX_EMPTY_RATE * 100) + "%"
      );
    }
  }

  return problems;
}

function main() {
  if (!fs.existsSync(HTML_FILE)) {
    console.log("没有 " + HTML_FILE + "，先跑 grab-html.js");
    process.exitCode = 1;
    return;
  }

  const html = fs.readFileSync(HTML_FILE, "utf8");
  const rows = parse(html);

  console.log("文件:", path.basename(HTML_FILE));
  console.log("抓到", rows.length, "条");
  if (rows.length > 0) {
    console.log("第 1 条:", rows[0]);
  }

  const problems = check(rows);
  if (problems.length === 0) {
    console.log("检查通过：0 个问题");
    return;
  }

  console.log("检查不通过，共 " + problems.length + " 个问题：");
  for (const p of problems) {
    console.log("  - " + p);
  }
  process.exitCode = 1;
}

main();
```

**三个参数为什么这么定：**

| 参数 | 值 | 理由 |
|---|---|---|
| `EXPECTED_MIN` | 5 | 这页稳定有 10 条。设 5 是"允许偶尔少几条，少一半就报警" |
| `MAX_EMPTY_RATE` | 0.2 | 20%。真站偶尔缺价格正常，缺 20% 说明字段选择器坏了 |
| 退出码 | 1 | 必须非 0，否则外面的定时任务看不出失败（第 77 节要用） |

**这三个值不是标准答案，是"按自己数据调"的参数，但必须写死在代码里。**

## 5.3 屏幕上应该看到什么

**正常：**

```text
文件: raw-list.html
抓到 10 条
第 1 条: { title: '示例条目 1', price: '101', date: '2026-10-02' }
检查通过：0 个问题
```

**模拟改版**（把 `HTML_FILE` 改成 `raw-v2.html`，或用 v2 的内容覆盖 `raw-list.html`）：

```text
文件: raw-list.html
抓到 0 条
检查不通过，共 1 个问题：
  - 一条都没抓到：选择器很可能已经失效
```

确认退出码：

```text
echo %ERRORLEVEL%
```

```text
1
```

改回正常文件再跑，再确认：

```text
echo %ERRORLEVEL%
```

```text
0
```

**这两个数字是这一节最实际的产出。** 第 77 节的定时任务就靠它判断"成功还是失败"。

**再试一个"部分失效"：** 把选择器 `td.title` 改成 `td.name`（v2 里才有的 class），其它不动：

```text
文件: raw-list.html
抓到 10 条
第 1 条: { title: '', price: '101', date: '2026-10-02' }
检查不通过，共 1 个问题：
  - 字段 title 有 10 条是空的（100%），超过 20%
```

**这个场景比"0 条"更常见**：对方只改了标题那列的 class，你抓到 10 条、价格日期都对，只有标题全空。**没有检查点，你会把 10 条空标题写进库。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `%ERRORLEVEL%` 永远是 0 | 在设置后又跑了别的代码覆盖 | 只用 `process.exitCode = 1`，别在同一分支里重置 |
| 检查总是通过 | 阈值太松 | 把 `MAX_EMPTY_RATE` 调到 0 试一次，看会不会报 |
| 报"少于下限"但数据没问题 | 页面本来就不稳定（如搜索结果） | 按"正常情况的最小值"重设 `EXPECTED_MIN` |
| `%ERRORLEVEL%` 显示不对 | 你在同一条命令里连着跑 | 分开执行两条命令 |

---

# 第 6 步：故意犯四个错（15 分钟）

## 错误 1：用 F12 里"复制选择器"的长路径

**现象：** 昨天能抓 10 条，今天 0 条。选择器是：

```text
body > div:nth-child(3) > div > table > tbody > tr > td:nth-child(2)
```

**原因：** 对方在页面顶部加了公告条，所有 `nth-child` 序号整体后移一位。

**怎么查：** `Ctrl+U` 打开源码，把选择器**逐段删短**：先试 `td:nth-child(2)`，再试 `tbody tr td`，能抓到的最短那个就是该用的。

## 错误 2：用正则解析 HTML

**现象：** 你写了：

```javascript
const re = /<td class="title">(.*?)<\/td>/g;
```

在 mock-server 上跑得好好的。抓真站时标题里有个高亮标签：

```html
<td class="title"><span class="hl">示例</span>条目 1</td>
```

你抓到的是 `<span class="hl">示例</span>条目 1`，带一堆标签。

**原因：** 正则不认结构，只认字符。它没法知道"这个 `</td>` 是这一层的还是里面那层的"。

**怎么查：** 看字段里有没有 `<` 或 `>`。有，说明你在用文本手段处理结构化内容。换成 `.text()`，它会剥掉所有标签。

## 错误 3：忘了 `$(el).find(...)`，直接用全局选择器

**现象：** 10 条记录，标题全是"示例条目 1"。

```javascript
$("#list tbody tr").each((index, el) => {
  rows.push({
    title: $("td.title").text().trim(),      // 错：每次都在整个文档里找
  });
});
```

**原因：** `$("td.title")` 拿到**所有** 10 个标题，`.text()` 把它们拼成一个长字符串，`.trim()` 后看起来像第一条。

**怎么查：** 打印 `$("td.title").length`，如果是 10 不是 1，说明你在用全局选择器。

## 错误 4：把"0 条"当成"这个页面没有数据"

**现象：** 输出 `抓到 0 条`，你想"可能这个分类没商品"，直接继续下一页。

**原因：** 0 条有两个完全不同的原因，**看起来一模一样**：

| 原因 | 特征 |
|---|---|
| 页面确实没数据（比如最后一页） | 前面几页有，只有这页 0 条 |
| 选择器失效 | 从某一页开始，**后面每页都是 0 条** |

**怎么查：** 看第 1 页。**第 1 页就是 0 条，一定是选择器或结构问题，不是"没数据"。** 这就是 `EXPECTED_MIN` 存在的理由 —— 它把"第 1 页 0 条"变成一条明确的失败信息。

---

# 第 7 步：写学习笔记（10 分钟）

**打开 `第03节课/02-笔记/NOTES.md`，按这十一个小标题填，一个字都不要改。**

```markdown
# 第 73 节课学习笔记

## 一、怎么判断数据在不在 HTML 里

三个动作：

"查看网页源代码"和"检查"的区别：

## 二、手写截取和 cheerio 的代码对比

| | 手写字符串截取 | cheerio 选择器 |
|---|---|---|
| 行数 | | |
| 对方改结构时 | | |
| 会不会报错 | | |
| 什么时候该用 | | |

## 三、`#list tbody tr` 拆开是什么意思

## 四、为什么不用正则解析 HTML

## 五、四种精度的选择器各抓到几条

| 选择器 | raw-list.html | raw-v2.html |
|---|---|---|
| tr | | |
| #list tbody tr | | |
| #list > tbody > tr | | |
| .content > #list > tbody > tr > td.title | | |

我从这个表里得出的结论：

## 六、选择器该锚定在哪一层

有 id 时：

只有 class 时：

什么都没有时：

永远不要用：

## 七、结构变化检查点的三个参数

| 参数 | 我设的值 | 为什么 |
|---|---|---|
| EXPECTED_MIN | | |
| MAX_EMPTY_RATE | | |
| 退出码 | | |

## 八、"0 条"的两种原因怎么区分

## 九、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 用复制出来的长路径 | | |
| 用正则解析 HTML | | |
| 忘了 `$(el).find` | | |
| 把 0 条当没数据 | | |

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] 我用 `Ctrl+U` 看过 `/html` 的源码，搜到了商品名
- [ ] `raw-list.html` 和 `raw-v2.html` 都在
- [ ] `parse-manual.js` 在 v1 上抓到 10 条，在 v2 上抓到 0 条
- [ ] `parse-cheerio.js` 在 v1 上抓到 10 条，检查通过
- [ ] 把 HTML 换成 v2 时，检查不通过且退出码是 1
- [ ] `selector-test.js` 能打出四种选择器的条数
```

---

# 第 8 步：课后练习

## 练习一：给 `parse-manual.js` 加检查点

把第 5 步的 `check()` 搬到手写版。要求一样：0 条时打印原因、退出码 1。

**跑通后对比：** 手写版和 cheerio 版对同一份 v2 文件的输出，差别在哪？

## 练习二：抓页面标题

`<title>` 里是"商品列表 第 1 页"。要求用**手写字符串截取**取出"第 1 页"，不许用 cheerio。

**提示：** 先 `indexOf("<title>")`，再 `indexOf("</title>")`。

**做完想一下：** 为这一个值引一个解析库值不值？

## 练习三：把阈值做成命令行参数

```text
node parse-cheerio.js --min 8
node parse-cheerio.js --min 0
```

不传时用默认 5。**提示：** `process.argv.indexOf("--min")`。

## 练习四：抓三页并合并

把 `/html?page=1`、`page=2`、`page=3` 存成三个文件，写 `parse-all.js` 解析三份并合并成 30 条数组。

**要求：** 打印总条数，**每份都跑一遍检查点**，任何一份不通过就打印是哪一份。

## 练习五：用自己的话讲清

```text
1. 为什么"查看网页源代码"里搜不到数据，就说明不该继续写选择器？
2. 为什么正则解析 HTML 是错的？举一个它处理不了的例子。
3. 选择器写粗了会抓错什么？写细了会崩在哪？
4. 对方改版时选择器一定会失效 —— 你靠什么保证自己知道？
5. "抓到 0 条"有哪两种可能，怎么区分？
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我知道"查看网页源代码"和"检查"的区别，以及为什么只能用前者判断
- [ ] 我能说出选择器的四个组成部分各是什么意思
- [ ] 我能解释为什么不用正则解析 HTML
- [ ] 我知道 `nth-child` 为什么不能用来定位数据行
- [ ] 我能说出检查点三个参数各自防的是什么

## B. 实操

- [ ] `collector/grab-html.js` 能跑，打印状态码和 HTML 长度
- [ ] `collector/raw-list.html` 和 `raw-v2.html` 都在
- [ ] `collector/parse-manual.js` 在 v1 抓 10 条，v2 抓 0 条
- [ ] `collector/parse-cheerio.js` 在 v1 抓 10 条且检查通过
- [ ] 换成 v2 后打印"检查不通过"且 `echo %ERRORLEVEL%` 是 1
- [ ] `collector/selector-test.js` 能打出四种选择器的对比表

## C. 排错

- [ ] 抓到 0 条时我知道先看第 1 页，而不是先怀疑"没数据"
- [ ] 每行内容都相同时，我知道是漏了 `$(el).find`
- [ ] 字段带 `<span>` 时，我知道换成 `.text()`
- [ ] `Cannot find module 'cheerio'` 时我知道先看目录

## D. 笔记

- [ ] 十一个小标题都在，顺序和课件一致
- [ ] 第五节四种选择器的条数是我自己跑出来的
- [ ] 第七节三个参数是我自己定的值
- [ ] "我还不懂的词"至少 2 个

## 本节课要能说出口的一句话

> **数据在不在 HTML 里，用 `Ctrl+U` 五分钟就能判断；选择器只锚定最稳的那一层，然后用一个检查点保证"改版时你第一时间知道，而不是三天后"。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 源码里搜不到数据 | 是不是 JS 渲染 | 去 F12 的 Network 找返回 JSON 的 XHR |
| `抓到 0 条` | 第 1 页也是 0 吗 | 是 → 选择器失效；否 → 真的没数据 |
| 每行内容都一样 | 用了全局选择器 | 改成 `$(el).find(...)` |
| 字段里带 `<span>` | 用了字符串截取 | 改用 `.text()` |
| 选择器昨天好今天坏 | 用了 `nth-child` | 改成 id 或 class 定位 |
| `ENOENT` | 文件没生成 | 先跑 `grab-html.js` |
| `Cannot find module 'cheerio'` | 目录或安装 | `dir node_modules\cheerio` |
| 中文乱码 | cmd 代码页 | `chcp 65001` |
| `%ERRORLEVEL%` 总是 0 | 设置方式不对 | 用 `process.exitCode = 1`，之后别重置 |
| 页面几百 KB、表格很长 | 分页 | 下一节专门解决 |
