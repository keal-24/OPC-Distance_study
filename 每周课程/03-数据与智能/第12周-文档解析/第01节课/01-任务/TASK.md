# 第 78 节课：认识文档格式

> 这节课结束时，你手上有：`第01节课\03-练习代码\doc-parser\src\detect.js`，一条命令就能说出任意文件的真实格式，扩展名改成什么都不管用。

**建议用时**：90 分钟
**前置**：第 77 节课做出来的采集项目，以及 `data\app.db`（这一周要接着用）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你会用 `fs.readFileSync` 读文本，会用 `path.extname()` 拿扩展名，会 `JSON.parse`，会在 Express 里接收上传的文件。

第 11 周你抓网页，抓回来的东西是 HTML。HTML 有一个好处：**它自己会声明自己是什么**。`Content-Type: text/html`，结构在标签里，你照着选择器取就行。

现在换成客户给你一个文件夹。里面 300 个文件，名字五花八门：

```text
2023年采购合同.pdf
2023年采购合同(1).pdf
预算表.xlsx
预算表 - 副本.xls
会议纪要.docx
会议纪要.txt
扫描件001.pdf
```

你先写的代码一定是这样的：

```text
const ext = path.extname(filePath);
if (ext === ".pdf") { ... }
else if (ext === ".docx") { ... }
```

**这段代码会在第三个文件上崩掉。** 因为客户把 `.xlsx` 另存成了 `.xls`，把扫描件命名成 `.txt`，把 PDF 的后缀删了。

## 0.2 今天这个坑长什么样

真实场景，你一定会遇到：

客户发来一个 `会议纪要.txt`。你按文本读，得到一片乱码。你以为是编码问题，换了 GBK 还是乱码。你折腾半小时，最后把文件拖进浏览器，发现它其实是一个 PDF——客户用微信收的文件，微信把后缀改成了 `.txt`。

还有更常见的：`预算表.xls`。你以为 `.xls` 和 `.xlsx` 一样，直接扔给 `exceljs`，报错：

```text
Error: Corrupt workbook
```

因为 `.xls` 是 1997 年的二进制格式，`.xlsx` 是 zip 包。**它们除了名字像，内部没有任何关系。**

**扩展名是给人看的，文件头是给程序看的。** 这一节课就是把这句话变成 60 行代码。

### 这节课你要准备的文件

课程仓库里**不放任何二进制样本**。你自己造，七个文件，十五分钟能搞定：

| 文件 | 怎么弄出来 |
|---|---|
| `note.txt` | 记事本里写三行中文，另存为 `note.txt`，编码选 `UTF-8` |
| `readme.md` | 记事本里写 `# 标题` 加两段字，另存为 `readme.md` |
| `数据.csv` | 记事本里写三行，用英文逗号分隔，另存为 `数据.csv` |
| `会议纪要.docx` | 打开 Word，写一个标题加两段正文，**另存为** `.docx`（不是 `.doc`） |
| `预算.xlsx` | 打开 Excel，随便填两行数字，**另存为** `.xlsx`（不是 `.xls`） |
| `政策.pdf` | 打开政府或学校的官网，找"政策文件""信息公开""培养方案"这类栏目，下载一个公开 PDF。**不要下需要登录的、不要下带个人信息的** |
| `照片.jpg` | 用手机拍一页书或一张通知，文字要清楚、不要拍到人脸和证件，传到电脑 |

再造三个"骗子文件"——这是今天的主角：

```text
copy samples\政策.pdf   samples\报告-改了名.txt
copy samples\预算.xlsx  samples\表格-改了名.txt
copy samples\会议纪要.docx samples\文档-没后缀
```

`copy` 是 cmd 命令，第一个参数是源，第二个是目标。**它不会管后缀，原样复制字节。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 魔数（magic number） | 文件开头几个固定字节，是这种格式的"身份证号" | PDF 是 `25 50 44 46`，也就是 `%PDF` |
| 文件签名（file signature） | 和魔数一个意思，有时指更长的头部特征 | docx/xlsx 都是 `50 4B 03 04`（`PK`），要靠内部文件名区分 |
| 分派（dispatch） | 先判断是什么，再决定调用哪个函数 | `detectFormat()` 的返回值决定走哪个解析器 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `src\detect.js` | `第01节课\03-练习代码\doc-parser\` | 格式探测，导出 `detectFormat(filePath)` |
| `src\detect-report.js` | 同上 | 批量扫描一个目录，打印表格 |
| `samples\` | 同上 | 你自己造的七个样本（不进 Git） |
| `.gitignore` | 同上 | 挡住 `samples\`、`data\`、`node_modules\` |
| `NOTES.md` | `第01节课\02-笔记\` | 学习记录 |

**目录结构最终长这样：**

```text
第01节课\03-练习代码\doc-parser\
├── package.json
├── .gitignore
├── samples\
│   ├── note.txt
│   ├── readme.md
│   ├── 数据.csv
│   ├── 会议纪要.docx
│   ├── 预算.xlsx
│   ├── 政策.pdf
│   ├── 照片.jpg
│   ├── 报告-改了名.txt
│   ├── 表格-改了名.txt
│   └── 文档-没后缀
└── src\
    ├── detect.js
    └── detect-report.js
```

---

# 第 1 步：建项目骨架（15 分钟）

## 1.1 做什么 / 为什么

这一周只有一个项目：`doc-parser`。第 78 到 84 节都在这一个项目里加东西。

**每节课结束你复制一份到下一节课的文件夹。** 为什么复制而不是一直用同一个：每节课一个检查点，第 80 节改坏了，你能退回第 79 节能跑的状态。这个习惯在真实项目里叫"打 tag"，现在先用文件夹代替。

## 1.2 操作

打开 cmd，依次执行：

```text
cd "B:\OPC-Distance_study\每周课程\03-数据与智能\第12周-文档解析\第01节课\03-练习代码"
mkdir doc-parser
cd doc-parser
mkdir src
mkdir samples
npm init -y
```

`npm init -y` 会生成 `package.json`，`-y` 表示所有问题都用默认答案。

然后新建 `.gitignore`，内容如下（用记事本或 VS Code 新建，文件名就是 `.gitignore`，前面有个点）：

```text
node_modules/
samples/
out/
data/
.env
```

**`samples/` 必须被忽略。** 里面是客户资料和你的照片，提交到 Git 就是泄露。这一条从今天开始执行，不要等出事再补。

**这节课不装任何 npm 包。** 探测格式只用 Node 自带的 `fs` 和 `path`。这是刻意的：先让你知道底层有什么，下一节才开始用 `mammoth`。

## 1.3 屏幕上应该看到什么

`npm init -y` 的输出：

```text
Wrote to B:\OPC-Distance_study\每周课程\03-数据与智能\第12周-文档解析\第01节课\03-练习代码\doc-parser\package.json:

{
  "name": "doc-parser",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
```

`dir` 应该看到：

```text
2026/11/16  09:12    <DIR>          .
2026/11/16  09:12    <DIR>          ..
2026/11/16  09:12               313 package.json
2026/11/16  09:12    <DIR>          samples
2026/11/16  09:12    <DIR>          src
```

`.gitignore` 是隐藏的？不是，Windows 默认不隐藏点开头的文件。`dir` 能看到 `.gitignore`，`dir /a` 才看隐藏文件。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `'npm' 不是内部或外部命令` | Node 没装或没进 PATH | 回 `参考手册\01-环境搭建.md` 重装，装完重开 cmd |
| `系统找不到指定的路径` | `cd` 后面的路径写错 | 在资源管理器里进到 `03-练习代码`，地址栏输入 `cmd` 回车 |
| `mkdir` 报"子目录或文件已存在" | 已经建过 | 忽略，继续 |
| 记事本存 `.gitignore` 变成 `.gitignore.txt` | 记事本自动加后缀 | 另存为时"文件名"填 `".gitignore"`（带引号），或"保存类型"选"所有文件" |

---

# 第 2 步：用眼睛看文件头（15 分钟）

## 2.1 做什么 / 为什么

在写代码之前，先手工看一次。你要亲眼见到"扩展名和内容不一致"这件事，不然你不会信。

`fs.readSync` 可以只读文件的前 N 个字节，不用把整个文件读进内存。**一个 500MB 的 PDF，你只需要前 8 个字节就能认出来。**

## 2.2 操作

在 `src` 里新建 `hexdump.js`，自己敲：

```javascript
const fs = require("fs");

function hexdump(filePath, n = 16) {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(n);
  const read = fs.readSync(fd, buf, 0, n, 0);
  fs.closeSync(fd);

  const head = buf.subarray(0, read);

  const hex = [...head].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  const ascii = [...head].map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ".")).join("");

  console.log("文件：", filePath);
  console.log("大小：", fs.statSync(filePath).size, "字节");
  console.log("前", read, "字节：");
  console.log("  HEX   ", hex);
  console.log("  ASCII ", ascii);
}

const target = process.argv[2];
if (!target) {
  console.log("用法：node src\\hexdump.js samples\\政策.pdf");
  process.exit(1);
}
hexdump(target);
```

运行：

```text
node src\hexdump.js samples\政策.pdf
node src\hexdump.js samples\会议纪要.docx
node src\hexdump.js samples\note.txt
node src\hexdump.js samples\报告-改了名.txt
```

## 2.3 屏幕上应该看到什么

PDF：

```text
文件： samples\政策.pdf
大小： 486213 字节
前 16 字节：
  HEX    25 50 44 46 2D 31 2E 37 0A 25 B5 B5 B5 B5 0A 31
  ASCII  %PDF-1.7.%.....1
```

docx：

```text
文件： samples\会议纪要.docx
大小： 18244 字节
前 16 字节：
  HEX    50 4B 03 04 14 00 06 00 08 00 00 00 21 00 4A 5B
  ASCII  PK..........!.J[
```

UTF-8 文本：

```text
文件： samples\note.txt
大小： 96 字节
前 16 字节：
  HEX    E4 BC 9A E8 AE AE E7 BA AA E8 A6 81 0D 0A E7 AC
  ASCII  .......ｮ...ｺ..... 
```

（ASCII 那一列显示成点或怪字符是正常的，因为一个汉字占 3 个字节，每个字节都大于 126。）

改了名的 PDF：

```text
文件： samples\报告-改了名.txt
大小： 486213 字节
前 16 字节：
  HEX    25 50 44 46 2D 31 2E 37 0A 25 B5 B5 B5 B5 0A 31
  ASCII  %PDF-1.7.%.....1
```

**注意最后这个。** 名字是 `.txt`，前四个字节是 `%PDF`。这就是"扩展名不可信"的全部证据。

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `ENOENT: no such file or directory` | 路径不对，或者 `samples` 里没这个文件 | `dir samples` 看真实文件名，中文名可能带了空格 |
| 全是 `0` 或读出来是空 | 文件是 0 字节 | `dir samples` 看大小，重新造一份 |
| `EISDIR` | 传了文件夹 | 传具体文件 |
| docx 开头不是 `PK` | 你存成了 `.doc` | 回 Word 里"另存为"，类型选"Word 文档 (*.docx)" |

**顺便记住这张表，今天全靠它：**

| 格式 | 前几个字节 | 可读形式 |
|---|---|---|
| PDF | `25 50 44 46` | `%PDF` |
| docx / xlsx / pptx | `50 4B 03 04` | `PK` |
| 旧版 doc / xls / ppt | `D0 CF 11 E0` | 不可读 |
| PNG | `89 50 4E 47` | 不可读 |
| JPEG | `FF D8 FF` | 不可读 |
| GIF | `47 49 46 38` | `GIF8` |
| UTF-8 BOM | `EF BB BF` | 不可读，下一节专门讲 |
| UTF-16 LE BOM | `FF FE` | 不可读，下一节专门讲 |

---

# 第 3 步：写第一版 detectFormat（25 分钟）

## 3.1 做什么 / 为什么

把上面那张表变成代码。

**判断顺序很重要：先看魔数，再看是不是文本，最后才看扩展名。** 扩展名只用来做"参考"，永远不参与决定。

## 3.2 操作

新建 `src\detect.js`，完整敲进去：

```javascript
const fs = require("fs");
const path = require("path");

const MAGIC = [
  { format: "pdf", bytes: [0x25, 0x50, 0x44, 0x46], name: "%PDF" },
  { format: "zip", bytes: [0x50, 0x4b, 0x03, 0x04], name: "PK\\x03\\x04" },
  { format: "ole", bytes: [0xd0, 0xcf, 0x11, 0xe0], name: "D0 CF 11 E0" },
  { format: "png", bytes: [0x89, 0x50, 0x4e, 0x47], name: "89 50 4E 47" },
  { format: "jpeg", bytes: [0xff, 0xd8, 0xff], name: "FF D8 FF" },
  { format: "gif", bytes: [0x47, 0x49, 0x46, 0x38], name: "GIF8" },
];

function readHead(filePath, n) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(n);
    const read = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function startsWith(buf, bytes) {
  if (buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[i] !== bytes[i]) return false;
  }
  return true;
}

function isProbablyText(buf) {
  if (buf.length === 0) return false;
  if (buf.includes(0x00)) return false;

  let printable = 0;
  for (const b of buf) {
    if (b === 0x09 || b === 0x0a || b === 0x0d) {
      printable++;
    } else if (b >= 0x20 && b !== 0x7f) {
      printable++;
    }
  }
  return printable / buf.length > 0.9;
}

function detectFormat(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error("不是文件：" + filePath);
  }

  const ext = path.extname(filePath).toLowerCase();

  if (stat.size === 0) {
    return { format: "empty", ext, size: 0, evidence: "文件大小为 0" };
  }

  const head = readHead(filePath, 4096);
  const hexHead = [...head.subarray(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");

  for (const m of MAGIC) {
    if (startsWith(head, m.bytes)) {
      return {
        format: m.format,
        ext,
        size: stat.size,
        evidence: `${m.name} (${hexHead})`,
        headHex: hexHead,
      };
    }
  }

  if (isProbablyText(head)) {
    let ratio = 0;
    let printable = 0;
    for (const b of head) {
      if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b !== 0x7f)) printable++;
    }
    ratio = printable / head.length;

    return {
      format: "text",
      ext,
      size: stat.size,
      evidence: `无魔数，前 ${head.length} 字节可打印比例 ${(ratio * 100).toFixed(1)}%`,
      headHex: hexHead,
    };
  }

  return {
    format: "unknown",
    ext,
    size: stat.size,
    evidence: `无匹配魔数，且不像文本（前 8 字节 ${hexHead}）`,
    headHex: hexHead,
  };
}

module.exports = { detectFormat };

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.log("用法：node src\\detect.js samples\\政策.pdf");
    process.exit(1);
  }
  const result = detectFormat(target);
  console.log(JSON.stringify(result, null, 2));
}
```

运行：

```text
node src\detect.js samples\政策.pdf
node src\detect.js samples\报告-改了名.txt
node src\detect.js samples\note.txt
```

## 3.3 屏幕上应该看到什么

```text
{
  "format": "pdf",
  "ext": ".pdf",
  "size": 486213,
  "evidence": "%PDF (25 50 44 46 2D 31 2E 37 0A 25)",
  "headHex": "25 50 44 46 2D 31 2E 37 0A 25"
}
```

```text
{
  "format": "pdf",
  "ext": ".txt",
  "size": 486213,
  "evidence": "%PDF (25 50 44 46 2D 31 2E 37 0A 25)",
  "headHex": "25 50 44 46 2D 31 2E 37 0A 25"
}
```

**`ext` 是 `.txt`，`format` 是 `pdf`。** 这两个字段现在分开了：`ext` 只记录"它叫什么"，`format` 记录"它是什么"。后面的分派只用 `format`。

文本文件：

```text
{
  "format": "text",
  "ext": ".txt",
  "size": 96,
  "evidence": "无魔数，前 96 字节可打印比例 100.0%",
  "headHex": "E4 BC 9A E8 AE AE E7 BA AA E8 A6 81 0D 0A E7 AC"
}
```

## 3.4 逐段解释

**`fs.openSync` + `readSync` + `closeSync` 为什么不用 `readFileSync`：**

`readFileSync` 会把整个文件读进内存。一个 2GB 的 PDF 直接把你机器撑爆。`readSync` 只读前 4096 字节，恒定开销。

**`try / finally` 为什么必须有：**

`readSync` 有可能抛错（比如文件被别的程序锁了）。如果抛错时没执行 `closeSync`，这个文件句柄就泄漏了。**Windows 上文件句柄泄漏的表现是：你删不掉这个文件，提示"文件正在被另一个程序使用"。** `finally` 保证无论成功失败都关。

**为什么用 `Buffer` 而不是字符串：**

`buf.toString()` 默认按 UTF-8 解码。PDF 开头 `%PDF-1.7` 是 ASCII，能正常解；但后面 `B5 B5` 这种字节不是合法 UTF-8，会变成 `�`。**你拿解码后的字符串去比较字节，等于隔着翻译对原文。** 所以直接比 `buf[i] !== bytes[i]`。

**`isProbablyText` 的两个条件：**

1. 前 4096 字节里不能有 `0x00`。文本文件不会有 NUL 字节，二进制文件几乎一定有。
2. 可打印字符（含 Tab、换行、回车）比例超过 90%。

**这两个条件都不是 100% 准。** UTF-16 编码的文本文件里全是 `0x00`（ASCII 字符的高字节），会被判成二进制。这就是下一节课要处理的 BOM 问题。今天先接受这个局限。

**`0x7f` 为什么排除：**

`0x7f` 是 DEL 控制字符，文本里极少出现，二进制里常见。排除它能让判断更准一点。

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `TypeError: buf.includes is not a function` | Node 版本太低（< 5.3） | `node -v` 看版本，低于 18 去升级 |
| PDF 被判成 `unknown` | 你的 PDF 开头有 BOM 或空白 | 用 `hexdump.js` 看真实前 16 字节，把实际字节加进 `MAGIC` |
| 所有文件都判成 `text` | `stat.size === 0` 分支没写，空 buffer 比例算成 NaN | 先判空，再判魔数 |
| `format` 对但 `ext` 是空字符串 | 文件没有扩展名 | 正常，`path.extname("文档-没后缀")` 返回 `""` |

---

# 第 4 步：把 PK 拆开——docx 还是 xlsx（20 分钟）

## 4.1 做什么 / 为什么

现在 `会议纪要.docx` 和 `预算.xlsx` 都会返回 `zip`。这不够用：docx 要用 `mammoth`，xlsx 要用 `exceljs`，**调错了解析器就是一堆无意义的报错。**

三种文件都是 zip：docx、xlsx、pptx。它们的区别在压缩包里装的东西：

| 格式 | zip 内部一定有 |
|---|---|
| docx | `word/document.xml` |
| xlsx | `xl/workbook.xml` |
| pptx | `ppt/presentation.xml` |

zip 格式有个特点：**每个文件的路径名是明文存在包里的**，没有加密。所以你在整个文件的字节里搜这串 ASCII，就能判断是哪种。

## 4.2 操作

改 `src\detect.js`。在 `MAGIC` 下面加：

```javascript
const ZIP_MARKERS = [
  { marker: "word/document.xml", format: "docx" },
  { marker: "xl/workbook.xml", format: "xlsx" },
  { marker: "ppt/presentation.xml", format: "pptx" },
];

const MAX_ZIP_SCAN = 20 * 1024 * 1024;

function zipSubtype(filePath, size) {
  if (size > MAX_ZIP_SCAN) {
    return { format: "zip", evidence: "zip 超过 20MB，跳过内部扫描" };
  }

  const buf = fs.readFileSync(filePath);

  for (const z of ZIP_MARKERS) {
    if (buf.includes(Buffer.from(z.marker, "latin1"))) {
      return {
        format: z.format,
        evidence: `PK + 内部有 ${z.marker}`,
      };
    }
  }

  return { format: "zip", evidence: "PK，但内部没有识别到 docx/xlsx/pptx 标记" };
}
```

然后把 `detectFormat` 里的魔数循环改成：

```javascript
  for (const m of MAGIC) {
    if (startsWith(head, m.bytes)) {
      if (m.format === "zip") {
        const sub = zipSubtype(filePath, stat.size);
        return {
          format: sub.format,
          ext,
          size: stat.size,
          evidence: `${sub.evidence} (${hexHead})`,
          headHex: hexHead,
        };
      }
      return {
        format: m.format,
        ext,
        size: stat.size,
        evidence: `${m.name} (${hexHead})`,
        headHex: hexHead,
      };
    }
  }
```

运行：

```text
node src\detect.js samples\会议纪要.docx
node src\detect.js samples\预算.xlsx
node src\detect.js samples\表格-改了名.txt
```

## 4.3 屏幕上应该看到什么

```text
{
  "format": "docx",
  "ext": ".docx",
  "size": 18244,
  "evidence": "PK + 内部有 word/document.xml (50 4B 03 04 14 00 06 00)",
  "headHex": "50 4B 03 04 14 00 06 00"
}
```

```text
{
  "format": "xlsx",
  "ext": ".txt",
  "size": 9120,
  "evidence": "PK + 内部有 xl/workbook.xml (50 4B 03 04 14 00 06 00)",
  "headHex": "50 4B 03 04 14 00 06 00"
}
```

**两个文件前 8 个字节完全一样，`format` 不一样。** 这就是为什么"只看魔数"不够。

## 4.4 为什么不用 `file-type` 这个包

`npm` 上有个包叫 `file-type`，专门干这件事，一行就能用。**这一课不用它，理由有三个：**

1. **它 v17 之后是纯 ESM。** 你的项目是 CommonJS（`require`），直接 `require("file-type")` 会报 `ERR_REQUIRE_ESM`。为了一个 60 行能解决的问题，把整个项目的模块体系改成 ESM，代价太大。
2. **它会给你的项目带进 30 多个间接依赖。** 白名单原则：能用 60 行手写解决的，不引包。
3. **它只能告诉你"这是 zip"，不能告诉你"这是 docx 还是 xlsx"。** 后面那一步还是得你自己写。

**判断标准：** 如果一个问题用 60 行、零依赖、逻辑你能讲清，就自己写。如果它涉及几百种格式、需要持续维护格式库，就用包。格式探测属于前者——你只需要认识七种。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| docx 被判成 `zip` | 内部标记搜不到，可能是加密的 docx | 用压缩软件打开看看里面有没有 `word\document.xml`；加密文档让客户重新发 |
| xlsx 被判成 `docx` | 文件里同时有两个标记（极少见，通常是拼接文件） | 把 `ZIP_MARKERS` 顺序调整成先 `xl/` |
| `ERR_FS_FILE_TOO_LARGE` | zip 超过 2GB | `MAX_ZIP_SCAN` 逻辑会跳过，返回 `zip`，后面按不支持处理 |
| 读大文件时内存飙到几个 G | 你删掉了 `MAX_ZIP_SCAN` 判断 | 加回来，20MB 是安全阈值 |

---

# 第 5 步：批量扫描 + 分派表（15 分钟）

## 5.1 做什么 / 为什么

单个文件能认了，现在要能一次看一个目录。**这也是后面流水线的雏形：扫目录 → 逐个探测 → 打印结果。**

同时建一张"分派表"，明确每种格式该由谁处理。这张表第 83 节会变成真正的 `parse()` 入口。

## 5.2 操作

新建 `src\detect-report.js`：

```javascript
const fs = require("fs");
const path = require("path");
const { detectFormat } = require("./detect");

const DISPATCH = {
  text: "readTextFile（第 79 节）",
  docx: "readDocx / mammoth（第 79 节）",
  csv: "parseCsv（第 80 节）",
  xlsx: "readXlsx / exceljs（第 80 节）",
  pdf: "readPdf / pdf-parse（第 81 节）",
  jpeg: "ocr（第 82 节）",
  png: "ocr（第 82 节）",
  ole: "不支持，让客户另存为 docx/xlsx",
  empty: "跳过",
  unknown: "人工确认",
};

function listFiles(dir) {
  const result = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isFile()) result.push(full);
  }
  return result.sort();
}

function pad(text, width) {
  const s = String(text);
  let len = 0;
  for (const ch of s) {
    len += ch.charCodeAt(0) > 255 ? 2 : 1;
  }
  return s + " ".repeat(Math.max(0, width - len));
}

const dir = process.argv[2];
if (!dir) {
  console.log("用法：node src\\detect-report.js samples");
  process.exit(1);
}

const files = listFiles(dir);

console.log(pad("文件名", 30), pad("扩展名", 10), pad("真实格式", 10), "证据");
console.log("-".repeat(96));

const counts = {};

for (const file of files) {
  const name = path.basename(file);
  let r;
  try {
    r = detectFormat(file);
  } catch (err) {
    console.log(pad(name, 30), pad("?", 10), pad("error", 10), err.message);
    counts.error = (counts.error || 0) + 1;
    continue;
  }
  counts[r.format] = (counts[r.format] || 0) + 1;
  console.log(pad(name, 30), pad(r.ext || "(无)", 10), pad(r.format, 10), r.evidence);
}

console.log("-".repeat(96));
console.log("统计：", JSON.stringify(counts));

console.log("\n分派表：");
for (const [format, handler] of Object.entries(DISPATCH)) {
  console.log("  " + pad(format, 10), "→", handler);
}
```

## 5.3 屏幕上应该看到什么

```text
文件名                         扩展名    真实格式   证据
------------------------------------------------------------------------------------------------
note.txt                       .txt      text       无魔数，前 96 字节可打印比例 100.0%
readme.md                      .md       text       无魔数，前 64 字节可打印比例 100.0%
会议纪要.docx                  .docx     docx       PK + 内部有 word/document.xml (50 4B 03 04 14 00 06 00)
政策.pdf                       .pdf      pdf        %PDF (25 50 44 46 2D 31 2E 37 0A 25)
报告-改了名.txt                .txt      pdf        %PDF (25 50 44 46 2D 31 2E 37 0A 25)
数据.csv                       .csv      text       无魔数，前 88 字节可打印比例 100.0%
文档-没后缀                    (无)      docx       PK + 内部有 word/document.xml (50 4B 03 04 14 00 06 00)
照片.jpg                       .jpg      jpeg       FF D8 FF (FF D8 FF E0 00 10 4A 46)
表格-改了名.txt                .txt      xlsx       PK + 内部有 xl/workbook.xml (50 4B 03 04 14 00 06 00)
预算.xlsx                      .xlsx     xlsx       PK + 内部有 xl/workbook.xml (50 4B 03 04 14 00 06 00)
------------------------------------------------------------------------------------------------
统计： {"text":3,"docx":2,"pdf":2,"jpeg":1,"xlsx":2}

分派表：
  text       → readTextFile（第 79 节）
  docx       → readDocx / mammoth（第 79 节）
  csv        → parseCsv（第 80 节）
  xlsx       → readXlsx / exceljs（第 80 节）
  pdf        → readPdf / pdf-parse（第 81 节）
  jpeg       → ocr（第 82 节）
  png        → ocr（第 82 节）
  ole        → 不支持，让客户另存为 docx/xlsx
  empty      → 跳过
  unknown    → 人工确认
```

**注意 `数据.csv` 被判成 `text`。** 这是对的：CSV 不是一种独立的二进制格式，它就是文本。**"怎么解析"要看扩展名，而"是不是文本"要看字节。** 第 80 节会处理这个转折：`format === "text"` 且 `ext === ".csv"` 时才走 CSV 解析器。

**这就是今天最重要的认知：探测和分派是两件事。** 探测回答"它是什么"，分派回答"用哪个函数"。有些格式（CSV、Markdown）探测结果一样，靠扩展名区分；有些格式（PDF 改名成 txt）扩展名完全骗人，靠字节救回来。

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 中文列不对齐 | 控制台字体不是等宽，或者中文宽度算错 | 只是难看，不影响结果；把窗口字体换成"新宋体"会好一点 |
| `EACCES` 读不了某个文件 | 文件被 Word 占用 | 关掉 Word 再跑 |
| `samples` 里多出 `desktop.ini` | Windows 文件夹自定义生成 | 分派表里 `unknown`，忽略即可 |
| 统计里 `text` 特别多 | 正常的，txt/md/csv 都算 text | 不用改 |

---

# 第 6 步：故意犯 3 个错（15 分钟）

## 错误 1：只比较前两个字节，还把它转成字符串

**操作：** 把 `startsWith` 换成这种写法：

```javascript
if (head.subarray(0, 2).toString() === "PK") {
  // 认为是 zip
}
```

**现象：** 所有 docx/xlsx 都判不出来，全走 `unknown`。

**原因：** `head.subarray(0, 2)` 是 `50 4B`，`.toString()` 默认按 UTF-8 解码得到 `"PK"`。这一句其实能成立。但如果你写成 `head.toString() === "PK"`，`head` 有 4096 字节，解出来是 `"PK\u0003\u0004\u0014..."`，永远不等于 `"PK"`。

**怎么查：** 在判断前打印 `console.log(JSON.stringify(head.subarray(0, 2).toString()))`，看到底是什么。**永远打印，不要猜。**

**正确写法：** 按字节比，`startsWith(head, [0x50, 0x4b])`。字节比较不受编码影响。

## 错误 2：用扩展名决定解析器

**操作：** 在 `detect-report.js` 里把 `r.format` 换成 `path.extname(file).slice(1)`。

**现象：** 跑到 `报告-改了名.txt` 时，分派到 `readTextFile`，读出来是几千个乱码字符，程序不报错，你还以为成功了。跑到 `文档-没后缀` 时，扩展名是空字符串，分派表里查不到，直接崩：

```text
TypeError: Cannot read properties of undefined (reading 'text')
```

**原因：** 扩展名是文件名的一部分，跟内容无关。客户、微信、邮件附件、压缩软件，任何一个环节都可能改它。

**怎么查：** 拿同一个文件，用 `hexdump.js` 看头，再用 `detectFormat` 看结果，两个对照。**头是什么，就按什么解析。**

## 错误 3：把 `.doc` 当成 `.docx`

**操作：** 找一个旧版 `.doc`（Word 97-2003），或者把任意 `.docx` 在 Word 里"另存为"选 `Word 97-2003 文档 (*.doc)`，然后运行：

```text
node src\detect.js samples\旧合同.doc
```

**现象：**

```text
{
  "format": "ole",
  "ext": ".doc",
  "size": 24576,
  "evidence": "D0 CF 11 E0 (D0 CF 11 E0 A1 B1 1A E1)",
  "headHex": "D0 CF 11 E0 A1 B1 1A E1"
}
```

**原因：** `.doc` 不是 zip，是微软 1997 年的复合文档格式（OLE Compound File）。`D0 CF 11 E0` 就是它的魔数，和 zip 的 `PK` 完全不同。

**怎么查：** 如果 `format === "ole"`，不要试图用 `mammoth` 打开。直接给用户一句话：**"这是旧版 Office 文件，请用 Word 另存为 .docx 再发给我。"** 让他做这一步，比你在代码里支持旧格式便宜一百倍。

## 三个错误总结

```text
字符串比较代替字节比较   → 长度不一致永远不相等
扩展名代替真实格式       → 改名文件静默解析错
把 ole 当 docx           → mammoth 报缺 [Content_Types].xml
```

---

# 第 7 步：写学习笔记（10 分钟）

在 `第01节课\02-笔记\NOTES.md` 里写，小标题照下面抄，一个字都不要改：

## 一、七种格式与它们的真实特征

## 二、我做的七个样本文件（怎么来的）

## 三、文件头是什么

## 四、我的 detectFormat 判断流程

## 五、扩展名骗人的四次实验

## 六、zip 系怎么区分 docx 和 xlsx

## 七、文本文件的判定标准

## 八、为什么不用 file-type 包

## 九、三个错误的后果

## 十、我还不懂的词

## 十一、完成检查

---

# 第 8 步：课后练习

## 练习一：加三种格式

给 `MAGIC` 加上 `webp`（`RIFF` 开头，第 8—11 字节是 `WEBP`）、`bmp`（`42 4D`）、`zip` 以外的 `7z`（`37 7A BC AF`）。

**注意 webp 的判断不是只看前 4 字节**，`RIFF` 也可能是 wav 或 avi。你要读到第 12 个字节再判断。提示：`buf.subarray(8, 12).toString("latin1") === "WEBP"`。

## 练习二：处理 UTF-16 文本

用记事本另存一个"Unicode"编码的 `utf16.txt`，看 `detectFormat` 判成什么。

**要求：** 如果前两字节是 `FF FE`，返回 `format: "text"`，`evidence` 里写明"UTF-16 LE BOM"。不要让它掉进 `unknown`。

## 练习三：做一个"扩展名 vs 真实格式"对照报告

遍历 `samples`，只打印那些**扩展名和真实格式不一致**的文件，格式：

```text
不一致：报告-改了名.txt  名字说是 txt，实际是 pdf
不一致：表格-改了名.txt  名字说是 txt，实际是 xlsx
不一致：文档-没后缀      名字说不上，实际是 docx
```

**要求：** 用 `DISPATCH` 里没有的格式也要能打印，不能崩。

## 练习四：给 detectFormat 加一个 `warnings` 字段

以下情况要产生警告：

- 扩展名是 `.pdf` 但真实格式不是 pdf；
- 真实格式是 `ole`（旧版 Office）；
- 真实格式是 `unknown`；
- 文件大小为 0。

**要求：** 返回 `warnings: []` 数组，每条形如 `"扩展名 .pdf 与真实格式 docx 不一致"`。

## 练习五：用自己的话讲清

不看课件，回答这四个问题，写在笔记里：

1. 为什么不能只信扩展名？举一个你亲手做出来的例子。
2. `%PDF` 和 `PK` 分别代表什么？为什么 docx 和 xlsx 都是 `PK` 却能区分？
3. 为什么判断格式只读前 4096 字节，而不是读整个文件？
4. 如果客户发来一个 2GB 的 PDF，你的 `detectFormat` 会不会把内存撑爆？为什么？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清"魔数"是什么，能背出 PDF 和 zip 的两个
- [ ] 我知道 docx 和 xlsx 都是 zip，靠内部文件名区分
- [ ] 我知道 `.doc` 不是 `.docx`，它们的二进制结构完全不同
- [ ] 我能解释"探测"和"分派"是两件事
- [ ] 我知道为什么 CSV 被判成 `text` 是对的

## B. 实操

- [ ] `doc-parser` 项目建好了，`package.json` 存在
- [ ] `.gitignore` 里有 `samples/`、`data/`、`node_modules/`
- [ ] `samples` 里有七个自己造的文件
- [ ] `src\detect.js` 能对任意文件输出 `format` / `ext` / `evidence`
- [ ] `src\detect-report.js` 能扫一个目录并打印表格
- [ ] `node src\detect.js samples\报告-改了名.txt` 输出 `pdf`

## C. 排错

- [ ] 遇到 `format: "unknown"` 我知道先用 `hexdump.js` 看头
- [ ] 遇到 `format: "ole"` 我知道要让客户另存为
- [ ] 空文件不会让程序崩，也不会被判成文本
- [ ] 我知道 `EACCES` 是文件被占用

## D. 笔记

- [ ] `NOTES.md` 十一个小标题都在
- [ ] "三个错误的后果"那张表填满了
- [ ] "我还不懂的词"至少写了一个
- [ ] 练习五的四个问题用自己的话答了

## 本节课要能说出口的一句话

> **扩展名是文件名的一部分，文件头才是文件本身的一部分；先读字节，再决定用谁来解析。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 所有文件都判成 `unknown` | `MAGIC` 数组的字节写错 | 用 `hexdump.js` 对照真实前 8 字节 |
| docx 判成 `zip` | 内部标记没搜到 | 用压缩软件打开看有没有 `word/document.xml` |
| 文本文件判成 `unknown` | 文件是 UTF-16，含 `00` 字节 | 加 `FF FE` / `FE FF` 判断 |
| `ENOENT` | 路径或文件名不对 | `dir samples` 看真实名字，注意中文和空格 |
| `EACCES` | 文件被 Word/Excel 占用 | 关掉 Office 再跑 |
| 中文列不对齐 | 控制台字体 | 不影响功能，换等宽字体 |
| 大文件内存爆 | 用了 `readFileSync` 扫 zip | 保留 20MB 上限判断 |
| `.doc` 打不开 | 是 OLE 旧格式 | 让客户另存为 `.docx` |
| `Cannot read properties of undefined` | 分派表里没有这个格式 | 加默认分支，返回"不支持"而不是崩 |
| 复制文件后后缀还在 | `copy` 保留原后缀 | 目标名要写全，包括新后缀 |
