# 第 81 节课：处理 PDF 文字

> 这节课结束时，你手上有：`src\read-pdf.js`，能把一个多页 PDF 按页取出文本，去掉页眉页脚和页码，把被硬断的行接回去，并且判断出"这是文字版还是扫描版"。

**建议用时**：110 分钟
**前置**：第 80 节课做出来的 `src\read-table.js`，以及 `decodeBuffer()`

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能读 txt、md、csv、docx、xlsx。这五种格式有一个共同点：**它们都存"文本流"**。即使 docx 是 XML，段落还是段落，表格还是表格。

PDF 不是。**PDF 里没有"段落"这个词。**

## 0.2 今天这个坑长什么样

**场景一：** 客户发来一份 40 页的政策文件，你 `pdf-parse` 一下，`data.text` 出来了。你很开心，直接按 `\n\n` 切段落。结果切出来 600 多段，每段只有一行，最长的一段是：

```text
- 3 -
```

**场景二：** 你把 `data.text` 存进数据库，搜索"补贴标准"，搜不到。你打开原文一看，"补贴标准"四个字在 PDF 里是这样排的：

```text
补贴标
准
```

因为这一行排不下了，PDF 就在"标"后面换行。**它不是段落换行，是排版换行。**

**场景三：** 客户发来一份扫描的合同，你 `pdf-parse` 一下，`data.text` 是空字符串。程序不报错，`numpages` 还是 12。你以为解析成功了，入库 12 页空文本。

**这三个场景说明同一件事：PDF 给你的不是"文章"，是"每个字画在纸上的坐标"。** 段落、行、页眉、页脚，全是你自己根据坐标猜出来的。

### 这节课你要准备的文件

| 文件 | 怎么弄出来 |
|---|---|
| `政策.pdf` | 政府或学校官网下载的公开 PDF，**要求至少 5 页、有页眉或页脚、是文字版**（能用鼠标选中文字） |
| `扫描件.pdf` | 手机扫描类 App 导出的 PDF，或者把一张照片用"打印成 PDF"的方式生成。**要求里面是图片，选不中文字** |

**怎么判断一个 PDF 是不是文字版：** 用 Edge 或 Chrome 打开，按住鼠标在正文上拖。**能选中、能复制**，就是文字版；**只能框出一个蓝框、复制不出字**，就是扫描版。

**怎么造一个扫描版 PDF（没有扫描 App 也能做）：**

1. 用手机拍一张带文字的纸，传到电脑；
2. 用 Word 新建文档，把这张照片插进去，铺满一页；
3. "另存为" → 类型选 `PDF`；
4. 得到的 `扫描件.pdf` 里只有一张图，没有文字层。

**不要用客户真实的合同做样本。** 用公开文件，或者自己拍一张无关紧要的纸。

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 文本层（text layer） | PDF 里存的一层"这些字是什么、画在哪"的数据 | 有这层才能取文字，没有就是扫描件 |
| 坐标（transform） | 每个字在页面上的 x、y 位置 | 用 y 坐标把字聚成行，用 y 间距判断段落 |
| 硬断行（hard wrap） | 排版排不下造成的换行，不是段落结束 | 清洗时要把它们接回去 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `src\read-pdf.js` | `第04节课\03-练习代码\doc-parser\` | `readPdf()`、`cleanPages()`、`isScanned()` |
| `src\pdf-lab.js` | 同上 | 打印每页字符数和清洗前后对比 |
| `out\pdf-before.txt` | 同上 | 清洗前的原始文本，留着对照 |
| `out\pdf-after.txt` | 同上 | 清洗后的文本 |
| `NOTES.md` | `第04节课\02-笔记\` | 学习记录 |

---

# 第 1 步：装 pdf-parse，先看它能给你什么（15 分钟）

## 1.1 做什么 / 为什么

先不写清洗，先看原始输出。**你必须亲眼看到"碎行 + 页眉 + 页码"，才知道后面每一步在修什么。**

## 1.2 操作

```text
cd "B:\OPC-Distance_study\每周课程\03-数据与智能\第12周-文档解析\第04节课\03-练习代码"
xcopy "..\..\第03节课\03-练习代码\doc-parser" "doc-parser" /E /I /Y
cd doc-parser
npm install pdf-parse
```

新建 `src\pdf-raw.js`：

```javascript
const fs = require("fs");
const pdf = require("pdf-parse");

async function main() {
  const filePath = process.argv[2] || "samples\\政策.pdf";
  const buf = fs.readFileSync(filePath);

  const data = await pdf(buf);

  console.log("页数：", data.numpages);
  console.log("字符数：", data.text.length);
  console.log("每页平均：", (data.text.length / data.numpages).toFixed(1));
  console.log("info：", JSON.stringify(data.info));
  console.log("--- 前 800 字符 ---");
  console.log(JSON.stringify(data.text.slice(0, 800)));
}

main().catch((err) => {
  console.error("失败：", err.message);
  process.exit(1);
});
```

运行：

```text
node src\pdf-raw.js samples\政策.pdf
```

## 1.3 屏幕上应该看到什么

```text
页数： 6
字符数： 4187
每页平均： 697.8
info： {"PDFFormatVersion":"1.7","IsAcroFormPresent":false,"Title":"XX市中小企业数字化转型补贴申报指南","Author":"XX市工业和信息化局","Producer":"Microsoft® Word 2019"}
--- 前 800 字符 ---
"XX市工业和信息化局\nXX市中小企业数字化转型补贴申报指南\n- 1 -\n第一章 总则\n第一条 为加快中小企业数字化转型，根据《XX市促进数字经济\n发展若干措施》，制定本指南。\n第二条 本指南适用于在本市注册登记、具有独立法人资格的中小\n企业。\n第三条 补贴资金由市财政预算安排，主要用于支持中小企业购买\n数字化服务、开展数字化改造。\n- 2 -\n第二章 补贴对象和标准\n..."
```

**逐行读这段输出，你能看到五个问题：**

| 现象 | 是什么 | 后面哪一步修 |
|---|---|---|
| `XX市工业和信息化局` 出现在每一页开头 | 页眉 | 第 3 步 |
| `- 1 -`、`- 2 -` | 页码 | 第 3 步 |
| `根据《XX市促进数字经济` 后面直接换行 | 硬断行 | 第 4 步 |
| `中小\n企业` 把词切开 | 硬断行 | 第 4 步 |
| `第一章 总则` 和正文之间没有空行 | 段落边界丢了 | 第 2 步靠坐标补 |

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `字符数： 0` | 扫描版 PDF | 正常，第 5 步会判定 |
| `Invalid data buffer!` | 传了路径字符串，不是 Buffer | `pdf(fs.readFileSync(path))` |
| `ENOENT` | 路径不对 | `dir samples` 看真实文件名 |
| `页数： 1` 但文件很大 | 可能是图片拼成的 PDF | 用 Edge 打开，试着选中文字 |
| 中文全是 `□` 或乱码 | PDF 字体没有 Unicode 映射 | 这种 PDF 只能走 OCR，见下一节 |

---

# 第 2 步：按页取文本，顺便拿到坐标（30 分钟）

## 2.1 做什么 / 为什么

默认的 `pdf(buf)` 把所有页拼成一个大字符串，页与页之间的边界没了。**没有页号，你就没法做引用**——第 13 周要回答"这句话出自第几页"，靠的就是页号。

`pdf-parse` 提供了一个 `pagerender` 选项：**每渲染一页，调用一次你的函数。** 你在里面拿到这一页的所有文字块，包括每个字的 x、y 坐标。

**有了坐标，你才能：**

1. 按 y 坐标把字聚成"行"；
2. 按相邻行的 y 间距判断"这里是不是新段落"；
3. 按页面顶部/底部的固定位置识别页眉页脚。

## 2.2 操作

新建 `src\read-pdf.js`：

```javascript
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");

function renderPage(pageData) {
  return pageData
    .getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    })
    .then((tc) => {
      const items = tc.items
        .filter((it) => it.str !== "")
        .map((it) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          h: it.height || 10,
        }));

      if (items.length === 0) return "";

      items.sort((a, b) => b.y - a.y || a.x - b.x);

      const heights = items.map((i) => i.h).sort((a, b) => a - b);
      const medianH = heights[Math.floor(heights.length / 2)] || 10;
      const lineTolerance = Math.max(2, medianH * 0.4);

      const lines = [];
      for (const it of items) {
        const last = lines[lines.length - 1];
        if (!last || Math.abs(last.y - it.y) > lineTolerance) {
          lines.push({ y: it.y, parts: [it] });
        } else {
          last.parts.push(it);
        }
      }

      let out = "";
      let prevY = null;

      for (const line of lines) {
        line.parts.sort((a, b) => a.x - b.x);
        const text = line.parts
          .map((p) => p.str)
          .join("")
          .replace(/\s+/g, " ")
          .trim();

        if (!text) continue;

        if (prevY !== null && prevY - line.y > medianH * 1.8) {
          out += "\n";
        }

        out += text + "\n";
        prevY = line.y;
      }

      return out;
    });
}

async function readPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const pages = [];

  const data = await pdf(buf, {
    pagerender: (pageData) =>
      renderPage(pageData).then((text) => {
        pages.push(text);
        return text;
      }),
  });

  return {
    title: (data.info && data.info.Title) || path.basename(filePath, ".pdf"),
    numpages: data.numpages,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
    rawText: pages.join("\n\n"),
    info: data.info,
  };
}

module.exports = { readPdf, renderPage };

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.log("用法：node src\\read-pdf.js samples\\政策.pdf");
    process.exit(1);
  }

  readPdf(target)
    .then((doc) => {
      console.log("标题：", doc.title);
      console.log("页数：", doc.numpages);
      for (const p of doc.pages) {
        console.log(`第 ${p.page} 页：${p.text.length} 字符 | 首行：${JSON.stringify(p.text.split("\n")[0] || "")}`);
      }
      console.log("--- 第 2 页前 400 字符 ---");
      console.log(JSON.stringify((doc.pages[1] || { text: "" }).text.slice(0, 400)));
    })
    .catch((err) => {
      console.error("失败：", err.message);
      process.exit(1);
    });
}
```

运行：

```text
node src\read-pdf.js samples\政策.pdf
```

## 2.3 屏幕上应该看到什么

```text
标题： XX市中小企业数字化转型补贴申报指南
页数： 6
第 1 页：698 字符 | 首行： "XX市工业和信息化局"
第 2 页：721 字符 | 首行： "XX市工业和信息化局"
第 3 页：654 字符 | 首行： "XX市工业和信息化局"
第 4 页：735 字符 | 首行： "XX市工业和信息化局"
第 5 页：702 字符 | 首行： "XX市工业和信息化局"
第 6 页：677 字符 | 首行： "XX市工业和信息化局"
--- 第 2 页前 400 字符 ---
"XX市工业和信息化局\nXX市中小企业数字化转型补贴申报指南\n- 2 -\n第二章 补贴对象和标准\n第四条 补贴对象为在本市注册、依法纳税的中小企业。\n第五条 补贴标准按照企业实际支出的 30% 给予补助，单个企业\n年度最高不超过 50 万元。\n第六条 申报材料包括：\n（一）营业执照复印件；\n（二）上一年度审计报告；\n（三）数字化改造合同及发票。\n"
```

**关键观察：**

- 每页第一行都是同一个页眉，第二行是文件标题（也重复）。
- 每页都有 `- N -` 形式的页码。
- 段落之间有 `\n`，但**每个段落内部也有 `\n`**。
- 第四条的正文在"单个企业"后面断了，下一行是"年度最高不超过 50 万元"。

## 2.4 逐段解释

**为什么先按 y 降序、再按 x 升序：**

PDF 的坐标系原点在左下角，y 越大越靠上。所以"从上看下来"是 y 降序。同一行内"从左到右"是 x 升序。

**`lineTolerance` 为什么取字高的 0.4 倍：**

同一行的字，y 坐标不会完全相等（上下标、不同字号会差一点）。容差太小会把一行拆成两行，太大会把两行并成一行。**0.4 倍字高是经验值，你可以用自己 PDF 试 0.3 和 0.6 看效果。**

**为什么用 `medianH` 而不是平均值：**

标题字号可能是正文的 2 倍，平均值会被拉高。中位数不受极端值影响。

**`prevY - line.y > medianH * 1.8` 是什么意思：**

这是"行间距明显大于正常行距"。正常行距大约 1.2–1.5 倍字高，段落之间通常是 1.8–2.5 倍。**用这个差距插一个空行，把段落边界补回来。**

**为什么 `items` 里要过滤 `str === ""`：**

PDF 里有很多空字符串的定位标记，不过滤会造出一堆空行。

**`join("")` 会不会把英文单词粘在一起：**

会。`pdfjs` 通常会在 `str` 里保留词尾空格，但不保证。**中文没问题，英文可能变成 `digitaltransformation`。** 如果你的 PDF 是英文的，把 `join("")` 改成 `join(" ")` 再 `replace(/\s+/g, " ")`。这是一个真实的取舍，没有两全的写法。

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 每页只有一行，所有字粘在一起 | `lineTolerance` 太大 | 改成 `medianH * 0.2` |
| 一行被拆成好几行 | `lineTolerance` 太小 | 改成 `medianH * 0.5` |
| 段落之间没有空行 | 你的 PDF 行距小于 1.8 倍 | 调到 1.5 试试，或者干脆不靠空行分段落 |
| 页码跑到页首 | PDF 生成器把页脚画在顶部 | 用"重复检测"而不是"固定位置"，见下一步 |
| `pages` 顺序乱了 | 你用了 `Promise.all` | 保持顺序，`pagerender` 是顺序调用的 |

---

# 第 3 步：去页眉、页脚、页码（25 分钟）

## 3.1 做什么 / 为什么

页眉页脚不是正文的一部分。它们会：

- 污染检索结果（搜"工业和信息化局"，每一页都命中）；
- 让切块变碎（每页开头都有一段重复的话）；
- 让字数统计虚高。

**识别方法：不是"第一行就是页眉"，而是"在多页的同一位置重复出现"。**

为什么不能按位置硬删：首页通常没有页眉，你删"第一行"就把正文第一段删了。

## 3.2 操作

在 `src\read-pdf.js` 里加：

```javascript
function normalizeForCompare(line) {
  return line.replace(/\s+/g, " ").trim();
}

function isPageNumber(line) {
  const s = normalizeForCompare(line);
  if (s.length === 0 || s.length > 30) return false;
  return (
    /^[-—–\s]*\d{1,4}[-—–\s]*$/.test(s) ||
    /^第\s*\d+\s*页(\s*共\s*\d+\s*页)?$/.test(s) ||
    /^\d+\s*\/\s*\d+$/.test(s) ||
    /^Page\s+\d+(\s+of\s+\d+)?$/i.test(s)
  );
}

function detectRepeatedEdges(pages, edgeCount = 2, threshold = 0.5) {
  const counts = new Map();

  for (const p of pages) {
    const lines = p.text
      .split("\n")
      .map(normalizeForCompare)
      .filter((l) => l.length > 0 && l.length <= 40);

    const edge = [...lines.slice(0, edgeCount), ...lines.slice(-edgeCount)];

    for (const line of new Set(edge)) {
      counts.set(line, (counts.get(line) || 0) + 1);
    }
  }

  const repeated = new Set();
  for (const [line, n] of counts) {
    if (pages.length >= 3 && n / pages.length >= threshold) {
      repeated.add(line);
    }
  }
  return repeated;
}

function removeHeadersFooters(pages, repeated) {
  return pages.map((p) => {
    const lines = p.text.split("\n");
    const kept = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const norm = normalizeForCompare(line);
      const isEdge = i < 2 || i >= lines.length - 2;

      if (isEdge && (repeated.has(norm) || isPageNumber(norm))) continue;
      kept.push(line);
    }

    return { ...p, text: kept.join("\n") };
  });
}

function cleanPages(pages) {
  const repeated = detectRepeatedEdges(pages);
  const withoutEdges = removeHeadersFooters(pages, repeated);
  return { pages: withoutEdges, repeated: [...repeated] };
}

module.exports = { readPdf, renderPage, cleanPages, detectRepeatedEdges, isPageNumber };
```

改一下 CLI 部分，打印重复行：

```javascript
  readPdf(target)
    .then((doc) => {
      const cleaned = cleanPages(doc.pages);

      console.log("标题：", doc.title);
      console.log("页数：", doc.numpages);
      console.log("识别到的重复页眉/页脚：", JSON.stringify(cleaned.repeated, null, 2));

      cleaned.pages.forEach((p) => {
        const first = p.text.split("\n").filter(Boolean)[0] || "";
        console.log(`第 ${p.page} 页：${p.text.length} 字符 | 首行：${JSON.stringify(first)}`);
      });
    })
```

运行：

```text
node src\read-pdf.js samples\政策.pdf
```

## 3.3 屏幕上应该看到什么

```text
标题： XX市中小企业数字化转型补贴申报指南
页数： 6
识别到的重复页眉/页脚： [
  "XX市工业和信息化局",
  "XX市中小企业数字化转型补贴申报指南"
]
第 1 页：579 字符 | 首行： "第一章 总则"
第 2 页：602 字符 | 首行： "第二章 补贴对象和标准"
第 3 页：535 字符 | 首行： "第三章 申报流程"
第 4 页：616 字符 | 首行： "第四章 资金拨付"
第 5 页：583 字符 | 首行： "第五章 监督管理"
第 6 页：558 字符 | 首行： "第六章 附则"
```

**注意：**

1. `repeated` 里只有两条，**没有页码**。因为页码每页都不一样（`- 1 -`、`- 2 -`），重复检测抓不到，是 `isPageNumber` 的正则抓的。
2. 每页字符数从 ~700 降到 ~580，少了大约 120 字，就是两行页眉加一行页码。
3. 第 1 页首行变成 `第一章 总则`，说明页眉删对了，正文第一段没被误删。

**为什么标题 `XX市中小企业数字化转型补贴申报指南` 也被当成页眉删了：**

因为它在每一页顶部都出现。**这是对的**：它在这个 PDF 里就是"每页重复的页眉"。文档标题已经存在 `documents.title` 里（从 `data.info.Title` 拿），正文里不需要重复 6 次。

## 3.4 逐段解释

**为什么只检查前两行和后两行：**

页眉通常 1–2 行，页脚 1–2 行。检查更多会把正文里重复出现的句子（比如"本办法自发布之日起施行"）误删。

**为什么 `threshold = 0.5`：**

超过一半的页都出现，才算页眉。**首页没有页眉的情况很常见，阈值设成 1.0 会漏掉。** 0.5 能容忍一半页面缺失。

**为什么限制 `line.length <= 40`：**

正文段落通常超过 40 字。限长能避免把"每页都重复的一段正文"误判成页眉。

**为什么 `pages.length >= 3` 才判：**

两页的文档，任何一行都可能"在 50% 的页出现"。**样本太少，不做判断，宁可留着页眉。**

**`isPageNumber` 为什么单独写一个函数：**

页码的形态太多：`- 1 -`、`第 1 页`、`第 1 页 共 6 页`、`1 / 6`、`Page 1 of 6`。**用正则穷举你能想到的形态，比"猜位置"可靠。**

**这个方案什么时候会失败：**

页眉不在前两行（有的 PDF 把页眉画在正文之后）、页脚超过两行、奇偶页页眉不同。**遇到这种情况，把 `edgeCount` 调大，或者针对这个 PDF 单独写规则。** 不要追求一个规则适配所有 PDF，不存在。

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 正文第一段被删了 | 首页没有页眉，`i < 2` 误删 | 改成"只有出现在 `repeated` 里才删" |
| 页眉还在 | 页眉在第 3 行 | `edgeCount` 改成 3 |
| 页码还在 | 页码形态没覆盖 | 打印页码那一行，把正则补上 |
| 整页被删空 | `repeated` 里混进了空字符串 | 过滤 `l.length > 0` |
| 两页的文档页眉没删 | `pages.length >= 3` 拦住了 | 正常，两页的文档手工处理更快 |

---

# 第 4 步：合并硬断行（25 分钟）

## 4.1 做什么 / 为什么

PDF 的一行是"排版行"，不是"语义行"。你要把同一段里的多行接回去。

**规则有三条，按优先级：**

| 情况 | 怎么接 | 例子 |
|---|---|---|
| 行尾是英文连字符 `-`，下一行以小写字母开头 | 去掉 `-`，直接拼 | `trans-` + `formation` → `transformation` |
| 上一行以中文结尾，下一行以中文开头 | 直接拼，不加空格 | `数字化` + `转型` → `数字化转型` |
| 上一行以句号、问号、感叹号、冒号结尾 | 不拼，保留换行 | `……制定本指南。` 后面是新段落 |

**最容易犯的错：把所有 `-` 都删掉。** `well-known` 会变成 `wellknown`，`e-mail` 会变成 `email`，日期 `2026-11` 会变成 `202611`。

## 4.2 操作

在 `src\read-pdf.js` 里加：

```javascript
function joinWrappedLines(text) {
  const lines = text.split("\n");
  const out = [];

  for (const raw of lines) {
    const line = raw.trim();

    if (line === "") {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }

    if (out.length === 0) {
      out.push(line);
      continue;
    }

    const prevIndex = out.length - 1;
    const prev = out[prevIndex];

    if (prev === "") {
      out.push(line);
      continue;
    }

    const prevLast = prev[prev.length - 1];
    const prevEndsHyphen = /[A-Za-z]-$/.test(prev);
    const curStartsLower = /^[a-z]/.test(line);
    const prevEndsCJK = /[\u4e00-\u9fff，、；：]$/.test(prev);
    const curStartsCJK = /^[\u4e00-\u9fff]/.test(line);
    const prevEndsSentence = /[。！？.!?：:；;]$/.test(prev);

    if (prevEndsHyphen && curStartsLower) {
      out[prevIndex] = prev.slice(0, -1) + line;
      continue;
    }

    if (!prevEndsSentence && prevEndsCJK && curStartsCJK) {
      out[prevIndex] = prev + line;
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function collapseBlankLines(text) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanText(pages) {
  return pages.map((p) => {
    const joined = joinWrappedLines(p.text);
    return {
      ...p,
      text: collapseBlankLines(joined),
    };
  });
}

module.exports = {
  readPdf,
  renderPage,
  cleanPages,
  cleanText,
  joinWrappedLines,
  collapseBlankLines,
  detectRepeatedEdges,
  isPageNumber,
};
```

在 CLI 里接着调用：

```javascript
      const texted = cleanText(cleaned.pages);

      texted.forEach((p) => {
        console.log(`第 ${p.page} 页：${p.text.split("\n").filter(Boolean).length} 段 | ${p.text.length} 字符`);
      });

      console.log("--- 第 2 页清洗后 ---");
      console.log(texted[1].text.slice(0, 500));
```

运行：

```text
node src\read-pdf.js samples\政策.pdf > out\pdf-after.txt
type out\pdf-after.txt
```

## 4.3 屏幕上应该看到什么

```text
第 1 页：7 段 | 498 字符
第 2 页：6 段 | 512 字符
第 3 页：5 段 | 455 字符
第 4 页：7 段 | 536 字符
第 5 页：6 段 | 503 字符
第 6 页：5 段 | 478 字符
--- 第 2 页清洗后 ---
第二章 补贴对象和标准
第四条 补贴对象为在本市注册、依法纳税的中小企业。
第五条 补贴标准按照企业实际支出的 30% 给予补助，单个企业年度最高不超过 50 万元。
第六条 申报材料包括：
（一）营业执照复印件；
（二）上一年度审计报告；
（三）数字化改造合同及发票。
```

**对照清洗前：**

```text
清洗前：
第五条 补贴标准按照企业实际支出的 30% 给予补助，单个企业
年度最高不超过 50 万元。
```

```text
清洗后：
第五条 补贴标准按照企业实际支出的 30% 给予补助，单个企业年度最高不超过 50 万元。
```

**"单个企业"和"年度"接上了。** 这一段从 2 行变成 1 行，段落数从 11 变成 6。

**英文连字符的例子（如果你的 PDF 有英文）：**

```text
清洗前：digital trans-
formation
清洗后：digital transformation
```

**日期不会被误伤：**

```text
2026-11-16     结尾不是 "-"，不动
e-mail         结尾不是 "-"，不动
well-known     结尾不是 "-"，不动
```

只有"行尾是 `-`"才处理。`well-known` 的 `-` 在词中间，不在行尾。

## 4.4 为什么顺序不能反

清洗顺序必须是：

```text
① 去页眉页脚  →  ② 合并断行  →  ③ 去多余空行
```

**反了会怎样：**

- 先合并断行，再去页眉：页眉那两行会被当成正文，和第一段粘在一起，变成 `XX市工业和信息化局XX市中小企业...第一章 总则`。你再去页眉，匹配不上了。
- 先删空行，再合并：`joinWrappedLines` 靠空行判断段落边界，空行没了，整页会被拼成一段。
- 先合并再去页码：页码 `- 2 -` 会被当成"上一行的延续"，粘到上一段末尾。

**顺序是有依赖的。** 每一节的输出是下一节的输入，改顺序就改语义。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 整页变成一段 | 空行被提前删了 | 先合并，后 `collapseBlankLines` |
| 句子被错误拼接 | `prevEndsSentence` 漏了某种标点 | 把你的标点补进正则 |
| 表格被拼成一坨 | 表格行也是"中文结尾+中文开头" | 表格单独处理，见第 80 节；PDF 表格本周不做 |
| 英文单词粘在一起 | `join("")` 没空格 | 英文 PDF 用 `join(" ")` |
| 页眉粘到正文 | 先去页眉的顺序错了 | 严格按 ①②③ |

---

# 第 5 步：判断文字版还是扫描版（15 分钟）

## 5.1 做什么 / 为什么

这是整节课最实用的一个判断。**扫描版 PDF 的 `pdf-parse` 不报错，只是给你空字符串。** 你不判，就会入库一堆空文档，还以为成功了。

判断标准很简单：**总字符数 ÷ 页数 < 20，就是扫描版。**

为什么是 20 而不是 0：

- 扫描版有时候会带一个水印文字、一个页码，几页加起来几十个字符；
- 文字版一页至少几百字，平均不可能低于 20。

## 5.2 操作

在 `src\read-pdf.js` 里加：

```javascript
function analyzePdf(pages, numpages) {
  const totalChars = pages.reduce(
    (sum, p) => sum + p.text.replace(/\s/g, "").length,
    0
  );
  const charsPerPage = numpages > 0 ? totalChars / numpages : 0;

  let kind = "text";
  if (charsPerPage < 20) kind = "scanned";
  else if (charsPerPage < 100) kind = "sparse";

  return {
    totalChars,
    charsPerPage: Number(charsPerPage.toFixed(1)),
    kind,
    needsOcr: kind === "scanned",
  };
}
```

CLI 里加：

```javascript
      const report = analyzePdf(texted, doc.numpages);
      console.log("--- 判定 ---");
      console.log(JSON.stringify(report, null, 2));
```

然后跑两个文件：

```text
node src\read-pdf.js samples\政策.pdf
node src\read-pdf.js samples\扫描件.pdf
```

## 5.3 屏幕上应该看到什么

文字版：

```text
--- 判定 ---
{
  "totalChars": 2982,
  "charsPerPage": 497,
  "kind": "text",
  "needsOcr": false
}
```

扫描版：

```text
标题： 扫描件
页数： 1
识别到的重复页眉/页脚： []
第 1 页：0 段 | 0 字符
--- 判定 ---
{
  "totalChars": 0,
  "charsPerPage": 0,
  "kind": "scanned",
  "needsOcr": true
}
```

**注意扫描版的 `numpages` 是 1，`text` 是空字符串，程序一点错都没报。** 如果你不做这个判断，它会安安静静地入库一条 0 字的记录。

**`sparse` 是什么：**

有些 PDF 是"图片为主、少量文字"（比如带页眉页脚的扫描件，或者图表报告）。`charsPerPage` 在 20–100 之间，既不能当文字版用，也不完全是扫描版。**标记成 `sparse`，让人工看一眼再决定走不走 OCR。**

## 5.4 为什么不用更聪明的办法

有人会说："可以检测页面里有没有图片对象。"

可以，但你需要解析 PDF 的 XObject 资源，`pdf-parse` 不直接给你。**字符数是一个 5 行代码就能算出来的代理指标，准确率对这个场景够用。** 工程判断：**能用一个便宜指标解决的问题，不要上复杂方案。**

**这个指标什么时候会错：**

- 一页只有一张大图的 PPT 导出 PDF，字符数很低，但不是扫描件；
- 扫描件带了完整的 OCR 文字层，字符数很高，但不是"原生文字版"。

**这两种情况都不影响你的决策**：前者走 OCR 也能出字，后者本来就有字。**判定的目的不是分类，是决定"要不要 OCR"。**

## 5.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 文字版被判成 `scanned` | 这份 PDF 每页字很少（如封面、图表） | 看 `charsPerPage`，20 以下确实该 OCR |
| 扫描版被判成 `text` | 扫描件带了 OCR 文字层 | 正常，有文字层就能直接用 |
| `numpages` 是 0 | 文件损坏 | 让客户重发 |
| `totalChars` 很大但正文是乱码 | 字体没有 Unicode 映射 | 走 OCR，别用文字层 |

---

# 第 6 步：故意犯 4 个错（15 分钟）

## 错误 1：把路径字符串直接传给 pdf()

**操作：**

```javascript
const data = await pdf("samples\\政策.pdf");
```

**现象：**

```text
失败： Invalid data buffer!
```

**原因：** `pdf-parse` 要的是 `Buffer`，不是路径。它内部直接把参数当字节数组用。

**怎么查：** 看到 `Invalid data buffer`，先看 `pdf()` 的参数是不是 `fs.readFileSync()` 的返回值。

## 错误 2：按 `\n\n` 切段落

**操作：**

```javascript
const paragraphs = data.text.split("\n\n");
console.log(paragraphs.length);
```

**现象：** 输出 `1`。整篇文档变成一段。

**原因：** `pdf-parse` 默认的文本渲染只在一行结束时加 `\n`，**不加空行**。你按 `\n\n` 切，一个都切不到。

**怎么查：** 打印 `data.text.slice(0, 200)`，看有没有连续两个换行。如果没有，就别按 `\n\n` 切。

**正确做法：** 用第 2 步的坐标方法，靠 y 间距插空行；或者先按行切，再用第 4 步的规则合并。

## 错误 3：把所有连字符都删掉

**操作：**

```javascript
const text = data.text.replace(/-/g, "");
```

**现象：**

```text
清洗前：well-known 的 e-mail 地址，日期 2026-11-16
清洗后：wellknown 的 email 地址，日期 20261116
```

**原因：** 你删的是"所有连字符"，不是"行尾的连字符"。

**怎么查：** 搜一下清洗后的文本里还有没有 `2026` 后面直接跟 `11`。**日期的连字符被删，是最容易被发现的信号。**

**正确做法：** 只在 `/[A-Za-z]-$/` 且下一行以小写字母开头时，删掉行尾那一个。

## 错误 4：对扫描版不做判断

**操作：** 把 `analyzePdf` 删掉，直接把 `texted` 写进数据库。

**现象：** 数据库里多了一条记录：

```text
title: 扫描件
page_count: 1
char_count: 0
status: success
```

**你没有任何报错，也没有任何提示。** 直到第 13 周做检索，客户问"为什么合同搜不到"，你才发现。

**原因：** 扫描版 PDF 没有文本层，`pdf-parse` 返回空字符串，这是"正常返回"。

**怎么查：** 每次解析完，打印 `charsPerPage`。**低于 20 就停下来，不要入库。**

## 四个错误总结

```text
传路径不传 Buffer   → Invalid data buffer!
按 \n\n 切段落      → 整篇只有 1 段
删所有连字符        → 日期、英文词全毁
不判扫描版          → 静默入库 0 字，一个月后才发现
```

---

# 第 7 步：写学习笔记（10 分钟）

在 `第04节课\02-笔记\NOTES.md` 里写，小标题照下面抄：

## 一、PDF 里为什么没有"段落"

## 二、按页取文本的实现

## 三、我看到的坐标数据

## 四、页眉页脚的识别规则

## 五、断行和连字符的合并规则

## 六、清洗顺序为什么不能反

## 七、文字版和扫描版的判定

## 八、四个错误的后果

## 九、我还不懂的词

## 十、完成检查

---

# 第 8 步：课后练习

## 练习一：把清洗前后的文本存下来对照

**要求：** 跑一次，把 `doc.rawText` 写到 `out\pdf-before.txt`，把清洗后的拼接文本写到 `out\pdf-after.txt`。

```javascript
fs.writeFileSync("out\\pdf-before.txt", doc.rawText, "utf8");
fs.writeFileSync("out\\pdf-after.txt", texted.map((p) => p.text).join("\n\n"), "utf8");
```

用 VS Code 打开两个文件，找出三处"清洗后明显更好"的地方，记在笔记里。

## 练习二：统计页眉页脚删掉了多少字

**要求：** 输出：

```text
清洗前：4187 字符
清洗后：2982 字符
删除：1205 字符（28.8%）
其中页眉页脚：约 720 字符
```

**提示：** 用 `detectRepeatedEdges` 返回的集合，在每页统计这些行出现时的字数。

## 练习三：处理"奇偶页页眉不同"

找一份奇偶页页眉不一样的 PDF（书籍、双面打印的文件常见）。

**问题：** 你的 `detectRepeatedEdges` 能不能同时抓到两个页眉？

**要求：** 如果不能，改 `threshold`，或者改成"按页的奇偶分别统计"。把改法写在笔记里。

## 练习四：给 `joinWrappedLines` 加一条规则

中文里有一种情况：上一行以"的"结尾，下一行以"是"开头，其实不该拼（例如标题"关于……的通知"后面跟正文）。

**要求：** 加一条规则：如果上一行长度小于 15 且下一行长度大于 30，不拼（短行多半是标题）。

**代价：** 会误伤短段落。在笔记里写清你接受这个代价的理由。

## 练习五：用自己的话讲清

1. 为什么 PDF 里没有段落？段落是怎么"猜"出来的？
2. 页眉为什么不能按"第一行"删？你的代码怎么识别它？
3. 清洗顺序为什么必须是"去页眉 → 合并断行 → 去空行"？
4. 扫描版 PDF 为什么 `pdf-parse` 不报错？你怎么发现它？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清 PDF 只存坐标不存段落
- [ ] 我知道 `transform[4]` 和 `transform[5]` 是 x 和 y
- [ ] 我能解释为什么页眉要靠"重复"识别
- [ ] 我知道三种断行合并规则，以及为什么要排除句末标点
- [ ] 我知道扫描版的判定指标是"每页平均字符数"

## B. 实操

- [ ] `pdf-parse` 装好了
- [ ] `node src\read-pdf.js samples\政策.pdf` 输出 6 页，每页有字符数
- [ ] `识别到的重复页眉/页脚` 里有两个字符串
- [ ] 第 1 页首行是 `第一章 总则`，不是页眉
- [ ] `第五条的正文接成了一行`
- [ ] `node src\read-pdf.js samples\扫描件.pdf` 输出 `kind: "scanned"`
- [ ] `out\pdf-before.txt` 和 `out\pdf-after.txt` 都生成了

## C. 排错

- [ ] `Invalid data buffer!` → 我知道要传 Buffer
- [ ] 整篇一段 → 我知道不能按 `\n\n` 切
- [ ] 日期变成 `20261116` → 我知道连字符删多了
- [ ] 0 字符但不报错 → 我知道是扫描版
- [ ] 页眉没删干净 → 我知道要看 `edgeCount`

## D. 笔记

- [ ] `NOTES.md` 十个小标题都在
- [ ] "我看到的坐标数据"里贴了真实的 x / y 值
- [ ] 清洗前后的对照我贴了三处
- [ ] 奇偶页页眉那题我做了，写清改法

## 本节课要能说出口的一句话

> **PDF 给你的是一堆坐标，段落、行、页眉全是你自己猜的；猜的顺序错了，后面每一步都白做。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Invalid data buffer!` | 参数是不是 Buffer | `fs.readFileSync` |
| `data.text` 是空 | 是不是扫描版 | 看 `charsPerPage` |
| 整篇只有一段 | 有没有 `\n\n` | 用坐标插空行 |
| 一行被拆成两行 | `lineTolerance` | 调大 |
| 多行粘成一行 | `lineTolerance` | 调小 |
| 页眉还在 | `edgeCount` / `threshold` | 调大或降低 |
| 页码还在 | 正则没覆盖 | 打印那一行补正则 |
| 日期被删连字符 | `replace(/-/g,"")` | 只删行尾 |
| 中文变方块 | 字体无 Unicode 映射 | 走 OCR |
| 页数对但内容错位 | 分栏排版 | 按 x 分列，本周不做 |
| `ENOENT` | 路径 | `dir samples` |
| `Cannot find module 'pdf-parse'` | 装错目录 | 重装 |
