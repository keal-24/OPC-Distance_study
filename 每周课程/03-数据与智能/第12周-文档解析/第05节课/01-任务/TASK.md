# 第 82 节课：识别扫描图片

> 这节课结束时，你手上有：`src\ocr.js`，同一个接口能调本地 tesseract，也能调多模态模型，并且有一份 `out\ocr-check.md` 的人工抽查记录。

**时间**：约 110 分钟
**前置**：第 81 节课做出来的 `src\read-pdf.js`，以及"扫描版判定"的逻辑

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能判断一个 PDF 是文字版还是扫描版：每页平均字符数低于 20，就是扫描版。

**判断出来之后呢？** `pdf-parse` 对它没用了。扫描版里只有图片，没有文字层。你要么让客户重新提供文字版（客户做不到，原件就是纸），要么把图片里的字"认"出来。

这就是 OCR（Optical Character Recognition，光学字符识别）。

## 0.2 今天这个坑长什么样

**场景一：** 你装了 tesseract，跑一张手机拍的合同。输出是这样的：

```text
第—条 甲方委托乙方完成下列工作°
1.系统开发
2.系充维护
```

`第一条` 变成了 `第—条`（破折号代替了"一"），句号变成了 `°`，`系统` 变成了 `系充`。**单看每个字都像，连起来能读，但搜索"第一条"永远搜不到。**

**场景二：** 你换了多模态模型，识别质量明显好了。客户很高兴，把 200 页扫描合同全发过来。你跑完一算账单，几十块钱。客户说"这么贵？"，你才发现自己从来没算过成本。

**场景三：** 模型返回：

```json
{"error":{"code":"content_filter","message":"This request was rejected by the content moderation system."}}
```

因为扫描件里有身份证照片。你以为是代码 bug，查了两小时，其实是内容审核。

**这三个场景的核心：** OCR 不是"调用一个接口就完事"。**它有一条质量线（准不准）、一条成本线（多少钱）、一条合规线（能不能传）。** 三条线都要你自己判断。

### 这节课你要准备的文件

| 文件 | 怎么弄出来 |
|---|---|
| `照片.jpg` | 手机拍一页打印的文字，**文字占满画面、光线均匀、不要拍手写体、不要拍证件和人脸** |
| `照片-小.jpg` | 用 Windows"画图"打开 `照片.jpg`，"重新调整大小" → 选"像素" → 水平填 `1024` → 另存为 |
| `扫描件.pdf` | 第 81 节做的那个（照片放进 Word 再存 PDF） |

**为什么必须缩到 1024：** 手机原图可能是 4000×3000、5MB。转成 base64 之后约 6.7MB，很多接口直接拒收（`413` 或 `image too large`）。**1024 宽足够看清正文，体积降到几百 KB。**

**拍照的三条要求：**

1. 正对纸面，不要斜拍。斜拍会让字变形，OCR 准确率断崖式下降。
2. 光线均匀，不要有阴影横跨文字。
3. 画面里只有文字。桌角、手指、水杯都会被当成内容。

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| OCR | 把图片里的形状认成字符 | 整节课的主题 |
| 多模态模型（multimodal model） | 能同时看文字和图片的模型 | 走 `chat/completions`，content 里放图片 |
| 人工抽查 | 人眼核对机器结果的一部分 | 所有 OCR 结果入库前的最后一道关 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `src\ocr.js` | `第05节课\03-练习代码\doc-parser\` | `runTesseract()`、`ocrWithModel()`、`ocrFile()` |
| `src\ocr-lab.js` | 同上 | 两条路线各跑一次，打印结果和耗时 |
| `out\ocr-check.md` | 同上 | 人工抽查记录表 |
| `NOTES.md` | `第05节课\02-笔记\` | 学习记录 |

---

# 第 1 步：扫描页怎么变成图片（20 分钟）

## 1.1 做什么 / 为什么

OCR 的输入是**图片**，不是 PDF。你手上如果是扫描版 PDF，第一步是把它变成一张张图。

**这一步有个现实约束：本课程的白名单里没有 PDF 转图片的 npm 包。** `pdfjs-dist` 能做，但它不在白名单；`sharp` 也不在。所以给你三条路，按推荐顺序：

| 路线 | 怎么做 | 适合 | 代价 |
|---|---|---|---|
| 手机/扫描 App 直接出图 | 用手机拍，或用扫描 App 导出 JPG | 一两份文件 | 手工，但零依赖 |
| 截图 | Edge 打开 PDF，逐页截图 | 少量页 | 分辨率不可控 |
| `pdftoppm` 命令行 | 装 Poppler，批量转 | 几百页 | 要装外部程序 |

**这一节课的练习走第一条路。** 你已经有 `照片.jpg`，不需要从 PDF 转。

## 1.2 操作：三条路都走一遍

### 路线一：手机直接拍（推荐）

已经在"准备文件"里做了。确认照片信息：

```text
dir samples\照片.jpg
```

### 路线二：截图

1. 用 Edge 打开 `扫描件.pdf`；
2. 按 `Win + Shift + S`，框选正文区域；
3. 粘贴到"画图"，另存为 `samples\截图.png`。

**缺点：** 截图分辨率等于屏幕分辨率，放大后糊。只适合应急。

### 路线三：pdftoppm（可选，批量用）

1. 搜索 "poppler windows"，下载解压；
2. 把 `bin` 目录加进 PATH；
3. 验证：

```text
pdftoppm -v
```

应该看到：

```text
pdftoppm version 24.02.0
Copyright 2005-2024 The Poppler Developers - http://poppler.freedesktop.org
```

4. 转图：

```text
pdftoppm -jpeg -r 200 samples\扫描件.pdf samples\page
```

`-r 200` 是 200 DPI。输出 `page-1.jpg`、`page-2.jpg`。

**200 DPI 是什么概念：** A4 纸在 200 DPI 下大约是 1654×2339 像素。**低于 150 DPI，小字会糊；高于 300 DPI，文件大到没必要。**

### 如果非要用 Node 调

`pdftoppm` 也可以通过 `child_process` 调，但这一节不展开。**记住原则：能在命令行一步做完的格式转换，不要写进业务代码。**

## 1.3 屏幕上应该看到什么

```text
2026/11/16  10:24         1,842,331 照片.jpg
```

转图之后：

```text
2026/11/16  10:31           412,908 page-1.jpg
2026/11/16  10:31           398,551 page-2.jpg
```

**从 1.8MB 到 400KB，是因为 200 DPI 的 JPEG 压缩。** 这个大小对 OCR 足够。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `'pdftoppm' 不是内部或外部命令` | 没装或没进 PATH | 用完整路径，或走路线一 |
| 输出的图是空白 | PDF 页面本身是空白 | 换一页 |
| 图片 200KB 但字看不清 | DPI 太低 | `-r 300` |
| 图片 20MB | DPI 太高 | `-r 150` |

---

# 第 2 步：本地 tesseract（30 分钟）

## 2.1 做什么 / 为什么

tesseract 是一个开源的 OCR 引擎，1995 年就开始做了。它的特点很明确：

| 优点 | 缺点 |
|---|---|
| 免费，无限次调用 | 中文准确率一般，标点和数字容易错 |
| 完全本地，数据不出机器 | 慢，一页几秒到十几秒 |
| 不需要网络 | 版面复杂时顺序会乱 |

**它的定位：能接受"90% 准确率 + 人工校对"的场景。** 比如内部资料归档、搜索用的大致文本。**不适合**金额、合同条款、证件号这种"错一个字就出事"的场景。

## 2.2 操作：安装

1. 搜索 `tesseract windows installer`，找 UB Mannheim 维护的版本（这是 Windows 上最常用的构建）；
2. 下载安装，**安装时勾选 `Chinese (Simplified)` 语言包**；
3. 安装路径默认是 `C:\Program Files\Tesseract-OCR`；
4. 把这个目录加进系统 PATH；
5. **关掉所有 cmd 窗口，重新开一个**（PATH 改动只对新窗口生效）。

验证：

```text
tesseract --version
tesseract --list-langs
```

## 2.3 屏幕上应该看到什么

```text
tesseract 5.4.1
 leptonica-1.84.1
  libgif 5.2.2 : libjpeg 8d (libjpeg-turbo 3.0.3) : libpng 1.6.43 : libtiff 4.6.0 : zlib 1.3.1 : libwebp 1.4.0
```

```text
List of available languages in "C:\Program Files\Tesseract-OCR/tessdata/" (2):
chi_sim
eng
```

**`chi_sim` 必须在列表里。** 没有它，识别中文会报 `Failed loading language 'chi_sim'`。

先手工跑一次，看原始质量：

```text
tesseract samples\照片.jpg stdout -l chi_sim --psm 6
```

参数解释：

| 参数 | 意思 |
|---|---|
| 第一个参数 | 输入图片 |
| `stdout` | 结果输出到屏幕，不写文件 |
| `-l chi_sim` | 用简体中文语言包 |
| `--psm 6` | 假设图片是一整块规整文字（最适合文档照片） |

## 2.4 屏幕上应该看到什么

```text
XX市中小企业数字化转型补貼申报指南

第一条 为加快中小企业数字化转型，根据《XX市促进数字经济
发展若干措施》，制定本指南°

第二条 本指南适用于在本市注册登记、具有独立法人资格的中小
企业。

第三条 补贴资金由市财政预算安排，主要用于支持中小企业购买
数字化服务、开展数字化改造。
```

**对照原文，找出错的地方：**

| 原文 | tesseract 输出 | 错在哪 |
|---|---|---|
| 补贴 | 补貼 | "贴"和"貼"字形接近 |
| 指南。 | 指南° | 句号认成了度数符号 |
| 中小企业 | 中小企业 | 对 |
| 第一条 | 第一条 | 对（这张图清楚） |

**这些错误有个共同点：字形相似。** tesseract 是靠"形状匹配"工作的，不是靠"理解语义"。所以它永远会把 `0` 认成 `O`、把 `1` 认成 `l`、把 `，` 认成 `,`。

## 2.5 用 Node 调用

新建 `src\ocr.js`：

```javascript
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

class OcrError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OcrError";
    this.code = code;
  }
}

function runTesseract(imagePath, lang = "chi_sim") {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    execFile(
      "tesseract",
      [imagePath, "stdout", "-l", lang, "--psm", "6"],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === "ENOENT") {
            return reject(new OcrError("TESSERACT_NOT_FOUND", "找不到 tesseract，检查 PATH"));
          }
          if (err.killed) {
            return reject(new OcrError("TESSERACT_TIMEOUT", "tesseract 超过 120 秒"));
          }
          return reject(
            new OcrError("TESSERACT_FAILED", (stderr || err.message).trim())
          );
        }

        resolve({
          engine: "tesseract",
          text: stdout.replace(/\r\n/g, "\n").trim(),
          ms: Date.now() - started,
        });
      }
    );
  });
}

module.exports = { OcrError, runTesseract };
```

新建 `src\ocr-lab.js`：

```javascript
const { runTesseract } = require("./ocr");

async function main() {
  const image = process.argv[2] || "samples\\照片.jpg";

  try {
    const r = await runTesseract(image);
    console.log("引擎：", r.engine);
    console.log("耗时：", r.ms, "ms");
    console.log("字符数：", r.text.length);
    console.log("--- 结果 ---");
    console.log(r.text.slice(0, 600));
  } catch (err) {
    console.error("失败：", err.code, "|", err.message);
    process.exit(1);
  }
}

main();
```

运行：

```text
node src\ocr-lab.js samples\照片.jpg
```

## 2.6 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `TESSERACT_NOT_FOUND` | 没装或 PATH 没生效 | 重开 cmd；用完整路径 |
| `Failed loading language 'chi_sim'` | 没装中文包 | 重装并勾选 Chinese Simplified |
| 全是乱码 | 图片不是文字，或者太糊 | 换清晰照片 |
| 输出为空 | `--psm` 选错 | 试 `--psm 3`（自动）或 `--psm 4`（单列） |
| 中文之间全是空格 | 正常，tesseract 按词切 | 后面用正则压掉多余空格 |
| 耗时超过 2 分钟 | 图片太大 | 缩到 1024 宽 |

---

# 第 3 步：多模态模型（30 分钟）

## 3.1 做什么 / 为什么

多模态模型不是"专门的 OCR 引擎"，它是"能看图的通用模型"。你给它一张图加一句话："把图里的文字逐行抄出来"，它就抄。

**准确率明显高于 tesseract**，尤其是：

- 中文标点；
- 数字和字母混排（金额、编号）；
- 轻微倾斜的照片；
- 表格里的短文本。

**代价：**

- 按 token 收费；
- 有内容审核，证件、人脸、敏感内容可能被拒；
- 数据要传到第三方服务器。

## 3.2 操作：先写假实现

在 `src\ocr.js` 里加：

```javascript
const PROMPT = [
  "把图片里的文字逐行输出。",
  "要求：",
  "1. 只输出图片里真实存在的文字，不要总结、不要翻译、不要补充。",
  "2. 保留原有的换行和段落。",
  "3. 看不清的字用 □ 代替，不要猜。",
  "4. 不要输出任何解释性的话。",
].join("\n");

function mockOcr(imagePath) {
  const name = path.basename(imagePath);
  return {
    engine: "mock",
    text: [
      "XX市中小企业数字化转型补贴申报指南",
      "",
      "第一条 为加快中小企业数字化转型，根据《XX市促进数字经济发展若干措施》，制定本指南。",
      "",
      "第二条 本指南适用于在本市注册登记、具有独立法人资格的中小企业。",
      "",
      `（这是 ${name} 的假识别结果，用于在没有 API key 时跑通流程）`,
    ].join("\n"),
    ms: 5,
  };
}

async function ocrWithModel(imagePath) {
  if (process.env.MOCK === "true") {
    if (process.env.MOCK_CASE === "filter") {
      throw new OcrError("CONTENT_FILTER", "内容审核拒绝：图片里有不允许的内容");
    }
    if (process.env.MOCK_CASE === "timeout") {
      throw new OcrError("TIMEOUT", "请求超时（假实现）");
    }
    return mockOcr(imagePath);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.VISION_MODEL;

  if (!apiKey || !baseUrl || !model) {
    throw new OcrError(
      "CONFIG_MISSING",
      "需要 OPENAI_API_KEY、OPENAI_BASE_URL、VISION_MODEL 三个环境变量"
    );
  }

  const buf = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase().replace(".", "") || "jpeg";
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  const b64 = buf.toString("base64");

  if (b64.length > 5 * 1024 * 1024) {
    throw new OcrError("IMAGE_TOO_LARGE", `图片 base64 有 ${(b64.length / 1024 / 1024).toFixed(1)}MB，先缩到 1024 宽`);
  }

  const started = Date.now();

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${b64}` },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });

  const raw = await res.text();

  if (!res.ok) {
    if (res.status === 400 && /content[_ ]?filter|moderation/i.test(raw)) {
      throw new OcrError("CONTENT_FILTER", "内容审核拒绝：" + raw.slice(0, 200));
    }
    if (res.status === 413) {
      throw new OcrError("IMAGE_TOO_LARGE", "服务端拒收：图片太大");
    }
    throw new OcrError("HTTP_" + res.status, raw.slice(0, 300));
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new OcrError("BAD_JSON", "返回的不是 JSON：" + raw.slice(0, 200));
  }

  const text =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (typeof text !== "string" || text.trim() === "") {
    throw new OcrError("EMPTY_RESULT", "模型返回了空内容");
  }

  return {
    engine: "model",
    text: text.replace(/\r\n/g, "\n").trim(),
    ms: Date.now() - started,
    usage: data.usage || null,
  };
}

async function ocrFile(imagePath, engine = "mock") {
  if (engine === "tesseract") return runTesseract(imagePath);
  if (engine === "model") return ocrWithModel(imagePath);
  if (engine === "mock") return mockOcr(imagePath);
  throw new OcrError("BAD_ENGINE", "engine 只能是 tesseract / model / mock");
}

module.exports = { OcrError, runTesseract, ocrWithModel, ocrFile, mockOcr };
```

`ocr-lab.js` 改成两条路线都跑：

```javascript
const { runTesseract, ocrWithModel, ocrFile } = require("./ocr");

async function main() {
  const image = process.argv[2] || "samples\\照片-小.jpg";
  const engine = process.argv[3] || "mock";

  console.log("图片：", image, "| 引擎：", engine);

  try {
    const r = await ocrFile(image, engine);
    console.log("耗时：", r.ms, "ms");
    console.log("字符数：", r.text.length);
    console.log("--- 结果 ---");
    console.log(r.text.slice(0, 600));
  } catch (err) {
    console.error("失败：", err.code, "|", err.message);
    process.exit(1);
  }
}

main();
```

## 3.3 屏幕上应该看到什么

假实现：

```text
图片： samples\照片-小.jpg | 引擎： mock
耗时： 5 ms
字符数： 142
--- 结果 ---
XX市中小企业数字化转型补贴申报指南

第一条 为加快中小企业数字化转型，根据《XX市促进数字经济发展若干措施》，制定本指南。

第二条 本指南适用于在本市注册登记、具有独立法人资格的中小企业。

（这是 照片-小.jpg 的假识别结果，用于在没有 API key 时跑通流程）
```

假的内容审核：

```text
set MOCK=true
set MOCK_CASE=filter
node src\ocr-lab.js samples\照片-小.jpg mock
```

```text
失败： CONTENT_FILTER | 内容审核拒绝：图片里有不允许的内容
```

真实调用（有 key 才做）：

```text
set MOCK=false
set OPENAI_API_KEY=你的key
set OPENAI_BASE_URL=你的地址
set VISION_MODEL=你账号里可用的视觉模型名
node src\ocr-lab.js samples\照片-小.jpg model
```

```text
图片： samples\照片-小.jpg | 引擎： model
耗时： 4218 ms
字符数： 168
--- 结果 ---
XX市中小企业数字化转型补贴申报指南

第一条 为加快中小企业数字化转型，根据《XX市促进数字经济发展若干措施》，制定本指南。
...
```

**换成真模型，代码一行都不用改，只改 `.env` 里的 `MOCK`。** 这是本课程所有花钱步骤的统一做法。

## 3.4 逐段解释

**为什么 `temperature: 0`：**

OCR 不需要创造性。温度越低，输出越稳定。**同一张图跑两次，结果应该一样。**

**为什么 prompt 里要写"看不清用 □，不要猜"：**

模型有个坏习惯：遇到糊的字，它会根据上下文"补"一个合理的字。**补对了他不告诉你，补错了你也不知道。** 用 `□` 标记不确定，至少你能看见哪里不可靠。

**为什么先检查 base64 长度再发请求：**

`5MB` 的 base64 大概对应 3.7MB 的原图。超过这个量级，多数服务会拒收。**在本地拦住，比等 30 秒后收到 413 便宜。**

**为什么用 `AbortSignal.timeout(90000)`：**

网络请求可能永远不返回。没有超时，你的批量任务会卡在某一页上，后面的全不动。**90 秒是视觉模型单页的宽松上限。**

**为什么错误要分 `CONTENT_FILTER` / `IMAGE_TOO_LARGE` / `HTTP_xxx`：**

因为处理方式完全不同：

| 错误码 | 处理方式 |
|---|---|
| `CONTENT_FILTER` | 不要重试，换本地 OCR 或人工处理 |
| `IMAGE_TOO_LARGE` | 缩小图片后重试 |
| `HTTP_429` | 等一会儿重试 |
| `HTTP_500` | 重试 1–2 次，还失败就换引擎 |
| `TIMEOUT` | 重试一次，还失败就标记失败 |

**都当成"失败"重试，会让你在内容审核上白烧钱。**

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `CONFIG_MISSING` | 三个环境变量没设 | `set` 完重开终端 |
| `HTTP_401` | key 错 | 检查 key 和 base url 是否配套 |
| `HTTP_404` | 模型名错，或 base url 少了 `/v1` | 查你账号里的模型列表 |
| `CONTENT_FILTER` | 图里有证件/人脸/敏感内容 | 换本地 OCR，或让客户提供文字版 |
| 返回 `□` 很多 | 图片太糊 | 重拍或提高分辨率 |
| 返回一段总结而不是原文 | prompt 没压住 | 把"只输出原文，不要总结"放第一行 |

---

# 第 4 步：两条路的成本与质量对比（20 分钟）

## 4.1 做什么 / 为什么

你需要一个**能对客户说出口的数字**，而不是"大概挺贵的"。

## 4.2 操作

写 `src\ocr-compare.js`：

```javascript
const fs = require("fs");
const { runTesseract, ocrWithModel } = require("./ocr");

function stats(text) {
  const noSpace = text.replace(/\s/g, "");
  return {
    chars: noSpace.length,
    lines: text.split("\n").filter((l) => l.trim()).length,
    boxes: (text.match(/□/g) || []).length,
  };
}

async function main() {
  const image = process.argv[2] || "samples\\照片-小.jpg";
  const result = { image };

  try {
    const t = await runTesseract(image);
    result.tesseract = { ...stats(t.text), ms: t.ms, sample: t.text.slice(0, 120) };
  } catch (err) {
    result.tesseract = { error: err.code + " " + err.message };
  }

  try {
    const m = await ocrWithModel(image);
    result.model = {
      ...stats(m.text),
      ms: m.ms,
      usage: m.usage,
      sample: m.text.slice(0, 120),
    };
  } catch (err) {
    result.model = { error: err.code + " " + err.message };
  }

  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync("out\\ocr-compare.json", JSON.stringify(result, null, 2), "utf8");
}

main();
```

运行：

```text
node src\ocr-compare.js samples\照片-小.jpg
```

## 4.3 屏幕上应该看到什么

```text
{
  "image": "samples\\照片-小.jpg",
  "tesseract": {
    "chars": 152,
    "lines": 8,
    "boxes": 0,
    "ms": 3812,
    "sample": "XX市中小企业数字化转型补貼申报指南\n\n第一条 为加快中小企业数字化转型..."
  },
  "model": {
    "chars": 168,
    "lines": 9,
    "boxes": 0,
    "ms": 4218,
    "usage": { "prompt_tokens": 1120, "completion_tokens": 210, "total_tokens": 1330 },
    "sample": "XX市中小企业数字化转型补贴申报指南\n\n第一条 为加快中小企业数字化转型..."
  }
}
```

**注意两边的 `chars` 不一样：152 对 168。** 差异来自标点和空格。**不要用字符数判断谁更准**，字符数只能说明"谁漏得更多"或"谁废话更多"。

## 4.4 成本怎么估

**先算 token，再乘你账号里的单价。** 本课程不给具体价格，因为价格会变、模型不同、渠道不同。

一页 A4 扫描件，缩到 1024 宽之后：

| 项 | 量级 |
|---|---|
| 输入图片 token | 1000–2000 |
| prompt token | 约 100 |
| 输出文本 token | 300–800（一页 500 字左右） |
| 单页合计 | 约 1500–3000 token |

**100 页的量级：**

```text
15 万 – 30 万 token
```

按你账号里的单价乘一下，得到的就是真实成本。**常见价位下，量级在几元到几十元人民币。** 如果你的模型更贵，可能上百。**必须用你账单上的单价算，不要用别人文章里的数字。**

**tesseract 的成本：** 0 元，但要时间。一页 3–10 秒，100 页就是 5–17 分钟。CPU 差的机器更久。

## 4.5 质量对比怎么做才靠谱

**不要用"我觉得不错"来评价。** 做一张对照表，随机抽 20 行，逐字比对：

| 行号 | 原文 | tesseract | 模型 | 谁对 |
|---|---|---|---|---|
| 1 | 补贴 | 补貼 | 补贴 | 模型 |
| 2 | 指南。 | 指南° | 指南。 | 模型 |
| 3 | 2026 年 | 2026 年 | 2026 年 | 都对 |
| 4 | 30% | 30%6 | 30% | 模型 |

**统计三个数：**

```text
字准确率 = 正确的字数 / 总字数
行准确率 = 完全正确的行数 / 总行数
关键字段准确率 = 金额/日期/编号 正确的个数 / 总数
```

**关键字段准确率才是客户关心的。** 一段话错三个"的"没关系，金额错一位就是事故。

## 4.6 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 模型那段是 `error` | 没配 key 或 MOCK 不是 false | 先跑 `mock` |
| 两边字符数差很多 | 一边漏行 | 打开两张结果人工比对 |
| `usage` 是 null | 假实现没有 usage | 正常，真调用才有 |
| tesseract 耗时超过 10 秒 | 图太大 | 缩到 1024 |

---

# 第 5 步：人工抽查（15 分钟）

## 5.1 做什么 / 为什么

**OCR 出来的文本，不经过人工抽查，不能进正式库。** 这不是"建议"，是这一周的铁律。

原因很简单：

- OCR 的错误是**局部、随机、看起来合理**的。`补貼` 你能看出来，`30%` 变成 `30%6` 你不一定能看出来。
- 下游是检索和问答，用户会**相信**你返回的原文。错一个字，可能就是错一个判决。

## 5.2 操作

建 `out\ocr-check.md`，表格如下：

```markdown
# OCR 人工抽查记录

- 文件：samples\照片.jpg
- 引擎：tesseract chi_sim
- 识别时间：2026-11-16 10:42
- 总行数：9
- 抽查行数：9（少于 10 行时全查）

| 行号 | 机器识别 | 对照原文 | 对不对 | 错在哪 |
|---|---|---|---|---|
| 1 | XX市中小企业数字化转型补貼申报指南 | XX市中小企业数字化转型补贴申报指南 | 错 | 貼/贴 |
| 2 | 第一条 为加快中小企业数字化转型 | 同左 | 对 | |
| 3 | 发展若干措施》，制定本指南° | ...指南。 | 错 | 句号变度数符号 |
| 4 | 第二条 本指南适用于... | 同左 | 对 | |
| 5 | 第三条 补贴资金由市财政预算安排 | 同左 | 对 | |
| 6 | 主要用于支持中小企业购买 | 同左 | 对 | |
| 7 | 数字化服务、开展数字化改造。 | 同左 | 对 | |
| 8 | （空行） | （空行） | 对 | |
| 9 | XX市工业和信息化局 | 同左 | 对 | |

## 统计

- 行准确率：7 / 9 = 77.8%
- 字准确率：约 98%
- 关键字段（金额、日期、编号）：无

## 结论

- [ ] 可以直接入库
- [x] 需要人工修正后再入库
- [ ] 需要换引擎重跑

## 修正后的文本

（把修正后的全文贴在这里，或者写到 out\ocr-fixed.txt）
```

**抽查规则，写死：**

| 场景 | 抽查比例 |
|---|---|
| 总行数 ≤ 50 | 100% |
| 51–500 行 | 至少 10%，且不少于 30 行 |
| > 500 行 | 至少 100 行，重点抽金额/日期/编号所在行 |
| 含金额、日期、证件号、合同编号 | 这些字段 100% 核对 |

## 5.3 屏幕上应该看到什么

打开 `out\ocr-check.md`，至少 9 行表格，每行都有"机器识别"和"对照原文"两列。**没有"对照原文"这一列的抽查是假抽查**——你只是在读机器结果，没有比对。

## 5.4 为什么人工抽查不能省

三个理由，每个都真实：

1. **OCR 的错是"看起来对"的错。** 模型不会告诉你"我这里不确定"，除了你要求它输出 `□`。你不逐字比对，就发现不了。
2. **下游会放大错误。** 第 13 周的问答会把 OCR 文本当事实。用户问"补贴比例是多少"，你返回"30%6"，用户会以为你在胡说。
3. **责任在你。** 客户不会说"OCR 认错了"，他会说"你的系统给错了数"。

**成本对比：** 100 页抽查 30 行，大约 20 分钟。一个金额错误导致的返工，至少两天。**这笔账不用算。**

## 5.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 找不到原文对照 | 你只有 PDF 没有纸 | 用 PDF 阅读器对照，或打印出来 |
| 抽查发现错误率 > 10% | 图片质量差或引擎不合适 | 换模型，或让客户重拍 |
| 金额行全错 | 字体或排版问题 | 单独裁出金额区域识别 |
| 表格顺序乱 | OCR 不理解版面 | 表格走 Excel 原件，不要 OCR |

---

# 第 6 步：故意犯 4 个错（15 分钟）

## 错误 1：把 5MB 的原图直接 base64

**操作：** 用 `samples\照片.jpg`（1.8MB）跑 `model`，把 `IMAGE_TOO_LARGE` 的判断删掉。

**现象（真接口）：**

```text
失败： HTTP_413 | {"error":{"message":"Request entity too large"}}
```

或者请求发出去 30 秒后超时。

**原因：** 1.8MB 原图 base64 后约 2.4MB，加上 JSON 包装，超过部分服务的请求体上限。手机原图 5MB 时更严重。

**怎么查：** 打印 `b64.length / 1024 / 1024`。**超过 5 就不要发。**

## 错误 2：没装 `chi_sim` 语言包

**操作：** 安装 tesseract 时不勾中文，或者只下载了 `eng.traineddata`。

**现象：**

```text
失败： TESSERACT_FAILED | Error: Failed loading language 'chi_sim'
Tesseract couldn't load any languages!
```

**原因：** tesseract 的识别能力完全来自 `tessdata` 目录下的语言文件。没有 `chi_sim.traineddata`，它不认识中文。

**怎么查：** `tesseract --list-langs` 看列表里有没有 `chi_sim`。没有就补装。

## 错误 3：把所有失败都重试三次

**操作：** 写一个 `for (let i = 0; i < 3; i++)` 包住 `ocrWithModel`，不判断错误码。

**现象：** 遇到内容审核拒绝时，同一张图被上传三次，三次都被拒，账单多三倍，日志里三条一样的 `CONTENT_FILTER`。

**原因：** `CONTENT_FILTER` 是确定性的。同一张图重试一百次还是被拒。

**怎么查：** 看错误码。**只有 `TIMEOUT`、`HTTP_429`、`HTTP_500` 值得重试。** 其他错误重试是浪费。

## 错误 4：不抽查直接入库

**操作：** 把 `ocrWithModel` 的结果直接写进 `documents` 表，跳过 `out\ocr-check.md`。

**现象：** 检索"补贴标准"，返回：

```text
第五条 补贴标准按照企业实际支出的 30%6 给予补助
```

用户截图发给你，问"30%6 是什么"。

**原因：** 你没有对照原文。OCR 把"。"认成了"6"，或者把下一行的"6"粘上来了。

**怎么查：** 这一条没法"查"，只能事前防。**入库前必须有 `checked: true` 字段，人没签字就不许写。**

## 四个错误总结

```text
原图直接 base64     → 413 或超时
没装 chi_sim        → Failed loading language
所有错误都重试      → 内容审核白烧钱
不抽查直接入库      → 错误进入下游，无法追溯
```

---

# 第 7 步：写学习笔记（10 分钟）

在 `第05节课\02-笔记\NOTES.md` 里写，小标题照下面抄：

## 一、扫描件为什么不能直接读文字

## 二、扫描页转图片的三条路

## 三、tesseract 的安装与调用

## 四、多模态模型的调用方式

## 五、两条路的成本对比

## 六、OCR 结果长什么样

## 七、人工抽查怎么做

## 八、内容审核和客户资料

## 九、四个错误的后果

## 十、我还不懂的词

## 十一、完成检查

---

# 第 8 步：课后练习

## 练习一：把 `□` 的数量做成质量指标

**要求：** 在 `ocr-compare.js` 里统计 `□` 的个数，并输出：

```text
疑似不确定字符：7 个
位置：第 3 行 2 个，第 7 行 5 个
```

**思考：** `□` 多，说明图片糊还是模型不自信？你怎么区分？

## 练习二：给 OCR 加一个"只识别某个区域"的能力

手机拍的照片往往有大片空白。用 `--psm` 或裁剪，只识别正文区域。

**要求：** 用 Windows"画图"裁一次，对比裁剪前后的识别结果和耗时。把结论写进笔记。

## 练习三：做一份 100 页的成本估算表

**要求：** 不看课件，自己列一张表：

```text
页数 | 每页输入 token | 每页输出 token | 总 token | 单价 | 总价
100  |                |                |          |      |
```

**然后用你账号里的真实单价填最后一列。** 填不出来，说明你还不知道自己的模型多少钱。

## 练习四：给客户写一段"OCR 说明"

**要求：** 200 字以内，说清三件事：

- 我们用什么方式识别；
- 识别结果需要人工抽查，不能保证 100%；
- 哪些材料我们不能处理（证件、人脸、涉密）。

**不许用"AI""大模型""token"这些词。**

## 练习五：用自己的话讲清

1. tesseract 和多模态模型的错误有什么不同？为什么后者更"危险"？
2. 为什么 `CONTENT_FILTER` 不能重试？
3. 100 页扫描件，你怎么在 5 分钟内估出成本量级？
4. 人工抽查为什么必须"对照原文"，不能只读机器结果？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清 OCR 的输入是图片，不是 PDF
- [ ] 我知道 tesseract 和模型各自的优缺点
- [ ] 我能解释 `--psm 6` 是什么意思
- [ ] 我知道 `CONTENT_FILTER` 不该重试
- [ ] 我能说出 100 页扫描件的成本量级和算法

## B. 实操

- [ ] `tesseract --version` 能跑，`--list-langs` 有 `chi_sim`
- [ ] `node src\ocr-lab.js samples\照片.jpg tesseract` 能出中文
- [ ] `MOCK=true` 时 `mock` 引擎能跑通
- [ ] `MOCK_CASE=filter` 能模拟内容审核拒绝
- [ ] `ocr-compare.js` 生成了 `out\ocr-compare.json`
- [ ] `out\ocr-check.md` 有至少 9 行对照表

## C. 排错

- [ ] `ENOENT` → 我知道是 PATH
- [ ] `Failed loading language` → 我知道是缺语言包
- [ ] `413` → 我知道要缩图
- [ ] `401` / `404` → 我知道查 key 和模型名
- [ ] `□` 很多 → 我知道是图片质量

## D. 笔记

- [ ] `NOTES.md` 十一个小标题都在
- [ ] 成本表填了真实单价
- [ ] 抽查表有"对照原文"列
- [ ] "内容审核和客户资料"写了你自己的处理原则

## 本节课要能说出口的一句话

> **OCR 不是"识别一下就完事"：它有一条质量线、一条成本线、一条合规线，三条线都得你自己守。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `'tesseract' 不是内部或外部命令` | PATH | 重开 cmd 或用完整路径 |
| `Failed loading language 'chi_sim'` | 语言包 | 重装并勾选中文 |
| 输出为空 | `--psm` | 试 3 / 4 / 6 |
| 中文全是空格 | 正常 | 正则压空格 |
| `HTTP_413` | 图片太大 | 缩到 1024 |
| `CONTENT_FILTER` | 证件/人脸 | 换本地 OCR |
| `HTTP_401` | key | 检查 key 与 base url |
| `HTTP_404` | 模型名 | 查账号可用模型 |
| 返回总结不是原文 | prompt | 把"只输出原文"放第一行 |
| 数字 0 变 O | OCR 通病 | 关键字段人工核对 |
| 识别很慢 | 图太大 / CPU | 缩图；批量放夜里跑 |
| 扫描件 PDF 转图 | 没有工具 | 手机拍、截图、pdftoppm 三选一 |
