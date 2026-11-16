# 第 101 节课：生成图片需求

> 这节课结束时，你手上有：`mm-app\lib\imagine.js`（生图调用，含假实现）、`mm-app\scripts\imagine-lab.js`（五组提示词的对照实验）、`mm-app\out\imagine-lab.md`（哪些需求该生图、哪些不该，带你的实测）。

**时间**：约 105 分钟
**前置**：第 100 节课的 `mm-app`（有 `lib/config.js`、`lib/db.js`、`extractions` 表）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能让模型**看图说话**：上传一张发票，模型返回字段 JSON。

**方向反过来，你也可能被要求：让模型画一张图。**

```text
客户："我要一张海报，写'年终大促'，红底金字。"
客户："帮我把这个 logo 放在白底上，做个微信头像。"
客户："这个产品图太暗了，重新生成一张亮一点的。"
```

**这三个需求，看起来都是"生成图片"。实际上只有一个该生图。**

## 0.2 今天这个坑长什么样

> 客户要一张"年终大促"的海报，你直接让它生成。
>
> 第一版："年终大促" 四个字，生成出来是 **"年终大促" 变成了 "年終大促"，第二个字错了，还多了一个字**。
>
> 你加了提示词："请准确写出'年终大促'四个汉字，不要写错"。
>
> 第二版：字对了，但**金字变成了棕色，背景是暗红不是大红**。
>
> 你又加："正红色背景，纯金色字，字体要粗黑体"。
>
> 第三版：**字对了、颜色对了，但"大促"两个字被裁掉了一半。**
>
> 你改了六次，花了大概 20 张图的成本。**客户看了一眼说："这个字的位置不对，我要的是居中偏下。"**
>
> **你又回到第一版。**

**这件事的根因不是"模型不够好"，是"生图这个工具不适合做这件事"。**

**今天要建立的判断力，比会用接口重要得多：**

| 需求 | 该用生图吗 | 为什么 |
|---|---|---|
| 一张"秋天森林"的氛围背景图 | ✓ | 没有精确要求，容错高 |
| 一张要写"年终大促"四个字的海报 | ✗ | **文字渲染是生图的死穴** |
| 把客户 logo 放在白底上 | ✗ | 这是**合成**，不是生成。用代码裁切拼合 |
| 产品图调亮 | ✗ | 这是**修图**，不是生成 |
| 一张"未来城市"的插画，给文章配图 | ✓ | 没有精确要求 |
| 一张和品牌手册一致的宣传图 | ✗ | **品牌一致性做不到**，每次颜色都不同 |

**"这张图不能用生成"的五种情况，就是今天要学的核心。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 文生图（text-to-image） | 给一段文字，返回一张图 | 第 1 步调接口 |
| 图生图（image-to-image） | 给一张图 + 一段文字，返回改过的图 | 第 3 步 |
| 提示词结构 | 主体 + 风格 + 构图 + 尺寸，四个部分各管一件事 | 第 2 步 |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `lib\imagine.js` | `第03节课\03-练习代码\mm-app\` | 生图调用（假/真）+ 提示词模板 |
| `scripts\imagine-lab.js` | 同上 | 五组提示词的对照实验 |
| `out\imagine-lab.md` | 同上 `out\` | 实验结果 + "该不该生图"的判断表 |
| `NOTES.md` | `第03节课\02-笔记\` | 第 6 步填 |

---

# 第 1 步：先写假实现，把管道跑通（25 分钟）

## 1.1 做什么 / 为什么

**做什么：** 写 `lib\imagine.js`，`MOCK=true` 时返回一张**本地生成的纯色 PNG**，不联网。

**为什么先假：**

生图是这几个接口里**最贵的**。一次调用可能比一次对话贵几十倍。

```text
你调试时可能要跑 20 次
  第一版：参数名写错
  第二版：返回结构猜错
  第三版：保存文件路径错
  ...
  → 全是和"生成质量"无关的问题
  → 但你每次都在付钱
```

**假实现把这些问题全部零成本解决掉。**

**假实现还要做一件真实现做不到的事：把图做成"看起来能分辨"的。**

```text
如果假图全是同一个灰色方块，你分不清哪张是哪张
→ 让假图带上提示词的哈希，颜色由哈希决定
→ 每张图颜色不同，你一眼能看出"这次请求变了"
```

## 1.2 操作

**1.** 进项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第15周-多模态\第03节课\03-练习代码"
xcopy /E /I /Y "..\第02节课\03-练习代码\mm-app" mm-app
cd mm-app
```

**2.** 新建 `lib\imagine.js`：

```javascript
// imagine.js —— 文生图。MOCK=true 时生成本地纯色 PNG，不联网。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");

// ---------- 提示词模板 ----------
// 四段结构：主体 / 风格 / 构图 / 约束
// 不要写成一长串形容词，写成四段，改哪一段很清楚
function buildPrompt(parts) {
  const p = parts === undefined ? {} : parts;
  const lines = [];

  if (p.subject) lines.push("主体：" + p.subject);
  if (p.style) lines.push("风格：" + p.style);
  if (p.composition) lines.push("构图：" + p.composition);
  if (p.size) lines.push("尺寸：" + p.size);

  // 约束是"不要什么"，这一段是最多人忘写的
  if (p.avoid && p.avoid.length > 0) {
    lines.push("避免：" + p.avoid.join("、"));
  }

  return lines.join("\n");
}

// ---------- 假实现：生成一张纯色 PNG ----------
// PNG 结构的最小可用版本：签名 + IHDR + IDAT + IEND
// 全不压缩（用 zlib 的 stored 块），代码短，够用
function makePng(width, height, rgb) {
  const zlib = require("node:zlib");

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c ^= buf[i];
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // 位深
  ihdr[9] = 2;   // 颜色类型 2 = truecolor RGB

  // 每行前面加一个 filter byte 0
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y += 1) {
    raw[o] = 0;
    o += 1;
    for (let x = 0; x < width; x += 1) {
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
      o += 3;
    }
  }

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 用提示词的哈希决定颜色，所以每张不同的提示词颜色不同
function colorFromPrompt(prompt) {
  const h = crypto.createHash("sha256").update(prompt).digest();
  return [h[0], h[1], h[2]];
}

function mockImagine(prompt, size) {
  const wh = parseSize(size);
  const rgb = colorFromPrompt(prompt);
  const png = makePng(wh.width, wh.height, rgb);
  const b64 = png.toString("base64");

  return {
    ok: true,
    mock: true,
    prompt: prompt,
    size: wh.width + "x" + wh.height,
    b64: b64,
    mime: "image/png",
    note: "假实现：纯色 " + wh.width + "x" + wh.height + "，颜色由提示词哈希决定",
  };
}

function parseSize(size) {
  if (typeof size !== "string") return { width: 1024, height: 1024 };
  const m = size.match(/^(\d{2,4})x(\d{2,4})$/);
  if (m === null) return { width: 1024, height: 1024 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

// ---------- 真实现 ----------
async function imagine(prompt, size, options) {
  const opts = options === undefined ? {} : options;
  const sz = size === undefined ? "1024x1024" : size;

  if (config.MOCK) {
    // 假实现加一点延迟，模拟真实耗时
    await new Promise((r) => setTimeout(r, 200));
    return mockImagine(prompt, sz);
  }

  if (!config.IMAGE_MODEL) {
    throw new Error("没有配置 IMAGE_MODEL：在 .env 里填你账号可用的生图模型名，或保持 MOCK=true");
  }

  const url = config.BASE_URL + "/images/generations";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.API_KEY,
    },
    body: JSON.stringify({
      model: config.IMAGE_MODEL,
      prompt: prompt,
      n: 1,
      size: sz,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs || config.TIMEOUT),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("生图接口失败 HTTP " + res.status + "：" + body.slice(0, 300));
  }

  const json = await res.json();

  const item = json && json.data && json.data[0];
  if (!item) {
    throw new Error("返回里没有 data[0]：" + JSON.stringify(json).slice(0, 300));
  }

  // 两种可能的返回：b64_json 或 url。两种都要处理，因为不同服务不同。
  if (typeof item.b64_json === "string") {
    return {
      ok: true,
      mock: false,
      prompt: prompt,
      size: sz,
      b64: item.b64_json,
      mime: "image/png",
      note: "b64_json 返回",
    };
  }

  if (typeof item.url === "string") {
    // url 会过期（通常几小时），必须立刻下载存下来
    const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(opts.timeoutMs || config.TIMEOUT) });
    if (!imgRes.ok) {
      throw new Error("下载生成的图失败 HTTP " + imgRes.status);
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const ct = imgRes.headers.get("content-type") || "image/png";
    return {
      ok: true,
      mock: false,
      prompt: prompt,
      size: sz,
      b64: buf.toString("base64"),
      mime: ct.split(";")[0],
      note: "url 返回，已下载（该 url 本身会过期）",
    };
  }

  throw new Error("data[0] 里既没有 b64_json 也没有 url");
}

// ---------- 存盘 ----------
function saveImage(result, name) {
  const ext = result.mime === "image/jpeg" ? ".jpg" : result.mime === "image/webp" ? ".webp" : ".png";
  const safe = String(name || "img").replace(/[^\w\u4e00-\u9fa5-]/g, "_").slice(0, 40);
  const file = path.join(config.GEN_DIR, safe + "-" + Date.now() + ext);
  fs.writeFileSync(file, Buffer.from(result.b64, "base64"));
  return file;
}

module.exports = { imagine, saveImage, buildPrompt, makePng, colorFromPrompt, parseSize };
```

**3.** 新建 `scripts\imagine-lab.js`：

```javascript
// imagine-lab.js —— 五组提示词的对照实验
const fs = require("node:fs");
const path = require("node:path");
const { imagine, saveImage, buildPrompt } = require("../lib/imagine");
const config = require("../lib/config");

// 五组：前三组是"该生图"的，后两组是"不该生图"的
const CASES = [
  {
    id: 1,
    label: "氛围背景图（该生图）",
    expect: "该生图",
    prompt: buildPrompt({
      subject: "秋天的森林小径，地上铺满落叶",
      style: "写实摄影，柔和自然光",
      composition: "低视角，小径从画面下方向深处延伸",
      size: "1024x1024",
      avoid: ["人物", "文字"],
    }),
  },
  {
    id: 2,
    label: "文章配图插画（该生图）",
    expect: "该生图",
    prompt: buildPrompt({
      subject: "一个戴眼镜的年轻人坐在堆满书的桌前工作，桌上一台笔记本电脑",
      style: "扁平插画，柔和的蓝紫色调",
      composition: "正面视角，人物居中偏右",
      size: "1024x1024",
      avoid: ["文字", "真实人脸"],
    }),
  },
  {
    id: 3,
    label: "无提示词的极简需求（该生图）",
    expect: "该生图",
    prompt: "一张未来城市的天际线，夜晚，霓虹灯",
  },
  {
    id: 4,
    label: "要写四个汉字的海报（不该生图）",
    expect: "不该生图",
    prompt: buildPrompt({
      subject: "促销海报，正中央写「年终大促」四个汉字",
      style: "正红底，纯金粗黑体字",
      composition: "文字居中",
      size: "1024x1024",
      avoid: ["多余的装饰文字", "错别字"],
    }),
  },
  {
    id: 5,
    label: "品牌一致性的宣传图（不该生图）",
    expect: "不该生图",
    prompt: buildPrompt({
      subject: "公司产品宣传图，主色必须严格等于品牌色",
      style: "和品牌手册完全一致",
      size: "1024x1024",
      avoid: ["颜色偏差"],
    }),
  },
];

async function main() {
  console.log("模式：" + (config.MOCK ? "MOCK（本地纯色图）" : "真实接口 / " + config.IMAGE_MODEL));
  console.log("输出目录：" + config.GEN_DIR);
  console.log("");

  const results = [];

  for (const c of CASES) {
    console.log("[" + c.id + "/" + CASES.length + "] " + c.label);
    console.log("  预期：" + c.expect);

    const t0 = Date.now();
    let r;
    try {
      r = await imagine(c.prompt, "1024x1024");
      const file = saveImage(r, "lab-" + c.id);
      console.log("  耗时：" + (Date.now() - t0) + " ms");
      console.log("  尺寸：" + r.size + "  MIME：" + r.mime);
      console.log("  说明：" + r.note);
      console.log("  已存：" + path.basename(file));
      results.push({ case: c, ok: true, file: file, ms: Date.now() - t0, note: r.note, size: r.size });
    } catch (err) {
      console.log("  失败：" + err.message);
      results.push({ case: c, ok: false, error: err.message });
    }
    console.log("");
  }

  // 写报告
  const outDir = path.join(__dirname, "..", "out");
  fs.mkdirSync(outDir, { recursive: true });

  const L = [];
  L.push("# 生图实验记录");
  L.push("");
  L.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
  L.push("模式：" + (config.MOCK ? "MOCK（本地纯色图，看不出生成质量）" : "真实接口"));
  L.push("");
  L.push("## 五组实验");
  L.push("");
  L.push("| # | 场景 | 我的判断 | 实际结果 | 耗时 |");
  L.push("|---|---|---|---|---|");
  for (const r of results) {
    L.push("| " + r.case.id + " | " + r.case.label + " | " + r.case.expect + " | " +
      (r.ok ? "成功" : "失败：" + r.error) + " | " + (r.ms === undefined ? "-" : r.ms + " ms") + " |");
  }
  L.push("");
  L.push("## 五组的提示词原文");
  L.push("");
  for (const c of CASES) {
    L.push("### " + c.id + ". " + c.label);
    L.push("");
    L.push("```text");
    L.push(c.prompt);
    L.push("```");
    L.push("");
  }
  L.push("## 关键观察");
  L.push("");
  L.push("（见第 6 步笔记）");
  L.push("");

  const outPath = path.join(outDir, "imagine-lab.md");
  fs.writeFileSync(outPath, L.join("\n"), "utf8");
  console.log("已写入：" + outPath);
}

main().catch((err) => {
  console.error("实验失败：" + err.message);
  process.exitCode = 1;
});
```

**4.** 跑：

```text
node scripts\imagine-lab.js
```

## 1.3 屏幕上应该看到什么

```text
>node scripts\imagine-lab.js
模式：MOCK（本地纯色图）
输出目录：B:\...\mm-app\data\gen

[1/5] 氛围背景图（该生图）
  预期：该生图
  耗时：214 ms
  尺寸：1024x1024  MIME：image/png
  说明：假实现：纯色 1024x1024，颜色由提示词哈希决定
  已存：lab-1-1699号码.png

[2/5] 文章配图插画（该生图）
  预期：该生图
  耗时：207 ms
  ...

[4/5] 要写四个汉字的海报（不该生图）
  预期：不该生图
  耗时：212 ms
  尺寸：1024x1024  MIME：image/png
  说明：假实现：纯色 1024x1024，颜色由提示词哈希决定
  已存：lab-4-1699号码.png

[5/5] 品牌一致性的宣传图（不该生图）
  预期：不该生图
  ...

已写入：B:\...\mm-app\out\imagine-lab.md
```

**注意第 4、5 组"成功了"。**

**这是假实现的局限，必须理解清楚：**

```text
假实现永远成功
→ 它验证的是"管道通不通"（参数、端点、返回解析、存盘）
→ 它验证不了"这个需求该不该生图"

"该不该生图"这个判断，只能靠真模型跑出来、人眼看出来
```

**所以第 4、5 组在 MOCK 下毫无意义。** 它们必须用真模型跑一次。

## 1.4 看一下那五张假图

打开 `data\gen\` 目录，五张图都是纯色方块，但颜色不同。

```text
颜色不同，说明"提示词变了 → 哈希变了 → 颜色变了"
→ 你能一眼确认"这次请求的提示词是哪一组"
```

**这是假实现的一个实用技巧：让假数据带上可识别的特征。**

```text
坏假数据：所有假图都是同一种灰
        → 你无法确认"发出去的是不是我以为的那条提示词"

好假数据：颜色由内容决定
        → 内容变，结果就变，你一眼能看出区别
```

## 1.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot find module './config'` | 不在 `mm-app` 目录 | `cd mm-app` |
| 五张图颜色全一样 | 你的 `colorFromPrompt` 返回了固定值 | 检查 `crypto.createHash` |
| 图打不开 | PNG 的 CRC 或 zlib 写错 | 用画图工具打开，报错就看 `makePng` |
| 图片大小是 0 | `saveImage` 的 `b64` 是空的 | 打印 `r.b64.length` |
| `ENOENT data\gen` | 目录不存在 | `config.js` 里已经 `mkdirSync` |

---

# 第 2 步：提示词结构，四段各管什么（20 分钟）

## 2.1 做什么 / 为什么

**做什么：** 把 `buildPrompt` 的四段结构搞清楚，并用对照实验看出"缺了某一段会怎样"。

**为什么必须分段，不能写成一长串形容词：**

```javascript
// 一长串（大部分人的写法）
"a beautiful autumn forest path with fallen leaves, realistic photography,
 soft natural light, low angle, path extending to depth, no people, no text,
 1024x1024"

// 问题：
① 改一个要素要重写整句
② 你不知道哪一段在起作用
③ 出现问题时无法定位"是风格的问题还是构图的问题"
```

**四段结构：**

| 段 | 管什么 | 不写会怎样 |
|---|---|---|
| **主体** | 画面里有什么 | 模型自由发挥，画出一堆你没要的东西 |
| **风格** | 写实/插画/水彩/胶片/3D | 默认风格不稳定，每次都不一样 |
| **构图** | 视角、位置、远近 | 主体可能被裁，可能偏到角落 |
| **避免** | 不要什么（文字、人物、多余装饰） | **最容易忘，也最容易踩坑** |

**"避免"这一段为什么最重要：**

```text
生图模型有一个顽固倾向：喜欢往画面里加东西
  加装饰、加边框、加看不懂的文字、加多余的人

你不明确禁止，它就会加
禁止了，它可能还会加，但至少少了很多
```

## 2.2 操作

新建 `scripts\prompt-ab.js`，做四组对照（每组只改一段）：

```javascript
// prompt-ab.js —— 只改一段，看差异
const { imagine, saveImage, buildPrompt } = require("../lib/imagine");
const path = require("node:path");

const BASE = {
  subject: "秋天的森林小径，地上铺满落叶",
  style: "写实摄影，柔和自然光",
  composition: "低视角，小径从画面下方向深处延伸",
  size: "1024x1024",
  avoid: ["人物", "文字"],
};

const VARIANTS = [
  { id: "A-完整", parts: BASE, change: "四段都有" },
  { id: "B-无风格", parts: { ...BASE, style: "" }, change: "去掉风格" },
  { id: "C-无构图", parts: { ...BASE, composition: "" }, change: "去掉构图" },
  { id: "D-无避免", parts: { ...BASE, avoid: [] }, change: "去掉避免" },
];

async function main() {
  for (const v of VARIANTS) {
    const prompt = buildPrompt(v.parts);
    console.log("");
    console.log("=== " + v.id + "（" + v.change + "）===");
    console.log(prompt);
    console.log("");
    const r = await imagine(prompt, "1024x1024");
    const f = saveImage(r, v.id);
    console.log("  已存：" + path.basename(f) + "  " + r.note);
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
```

**注意：在 `MOCK=true` 下，这四组的输出只有颜色不同，看不出提示词的差异。**

**这个实验只有用真模型才有意义。** 但**代码结构和对照设计现在就要搭好**，因为在真模型下重跑只需要改 `.env`。

**这是"先假后真"的另一个好处：真正的实验设计在假阶段就完成了。**

## 2.3 屏幕上应该看到什么

MOCK 模式：

```text
>node scripts\prompt-ab.js

=== A-完整（四段都有）===
主体：秋天的森林小径，地上铺满落叶
风格：写实摄影，柔和自然光
构图：低视角，小径从画面下方向深处延伸
尺寸：1024x1024
避免：人物、文字

  已存：A-完整-1699号码.png  假实现：纯色 1024x1024，颜色由提示词哈希决定

=== B-无风格（去掉风格）===
主体：秋天的森林小径，地上铺满落叶
构图：低视角，小径从画面下方向深处延伸
尺寸：1024x1024
避免：人物、文字

  已存：B-无风格-1699号码.png  假实现：纯色 ...
```

**三件事要看清：**

| 观察 | 说明 |
|---|---|
| `B-无风格` 的输出里没有"风格"那一行 | `buildPrompt` 遇到空字符串会跳过 |
| `C-无构图` 同理 | 不写就不出现在提示词里 |
| `D-无避免` 也跳过了 | `avoid: []` 时整段不生成 |

**这个"空就跳过"的行为很重要：**

```text
如果 buildPrompt 硬写"风格："（后面空着）
→ 模型看到"风格："后面什么都没有
→ 它可能理解成"随便什么风格"
→ 也可能把下一行当成风格描述
→ 行为不可预测
```

**空字段应该整段不出现，而不是留一个空标签。** 这一条在拼提示词时经常被忽略。

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 四组颜色全相同 | 提示词没变（你的 `buildPrompt` 忽略了参数） | 打印实际拼出的字符串 |
| 出现了空的"风格："行 | 你没判空 | `if (p.style)` |
| `avoid` 是字符串不是数组 | 调用时传错了 | `avoid: ["人物"]` 不是 `avoid: "人物"` |

---

# 第 3 步：图生图，和"修图"划清界限（20 分钟）

## 3.1 做什么 / 为什么

**做什么：** 加一个 `imagineEdit()`，接受一张原图 + 一段指令，返回改过的图。

**为什么要单独讲这一节：**

因为**客户最常提的"生成图片"需求，其实是"修图"。**

| 客户说 | 实际是什么 | 该用什么 |
|---|---|---|
| "把背景换成白色" | 抠图 + 合成 | 抠图工具，不是生图 |
| "调亮一点" | 像素级调色 | 修图，几行代码 |
| "把 logo 放上去" | 图层合成 | 代码合成 |
| "把这张照片改成水彩风格" | **真的需要图生图** | 图生图 |
| "这张图里加一把椅子" | **真的需要图生图** | 图生图 |
| "去掉画面里的路人" | 图生图可以做，但不稳定 | 局部重绘工具 |

**判断口诀：**

```text
改动是"像素级的"（亮度、色彩、大小、裁切、加字、贴图）
  → 用代码。确定、免费、可重复

改动是"内容级的"（把这张照片变成油画、加一个不存在的东西）
  → 用图生图。不确定、要钱、每次不同
```

## 3.2 操作

在 `lib\imagine.js` 里加：

```javascript
// ---------- 图生图 ----------
// 注意：不同服务对这个能力的支持差别很大。有的叫 images/edits，
// 有的把原图放进 messages 里当视觉输入，有的干脆不支持。
// 这里的写法对应"多图参考"风格的服务，跑不通时先看服务文档。
async function imagineEdit(prompt, imageB64, mime, options) {
  const opts = options === undefined ? {} : options;

  if (config.MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    return {
      ok: true,
      mock: true,
      prompt: prompt,
      size: "1024x1024",
      b64: makePng(1024, 1024, colorFromPrompt("edit:" + prompt)).toString("base64"),
      mime: "image/png",
      note: "假实现（图生图）：纯色图，颜色由编辑指令决定",
    };
  }

  if (!config.IMAGE_MODEL) {
    throw new Error("没有配置 IMAGE_MODEL");
  }

  const url = config.BASE_URL + "/images/edits";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.API_KEY,
    },
    body: JSON.stringify({
      model: config.IMAGE_MODEL,
      prompt: prompt,
      image: "data:" + (mime || "image/png") + ";base64," + imageB64,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs || config.TIMEOUT),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("图生图接口失败 HTTP " + res.status + "：" + body.slice(0, 300) +
      "\n（如果你的服务不支持 /images/edits，这就是预期结果 —— 见第 6 步的错误 3）");
  }

  const json = await res.json();
  const item = json && json.data && json.data[0];
  if (!item) throw new Error("返回里没有 data[0]");

  const b64 = typeof item.b64_json === "string" ? item.b64_json : null;
  if (b64 === null) {
    const u = item.url;
    if (typeof u !== "string") throw new Error("既没有 b64_json 也没有 url");
    const imgRes = await fetch(u, { signal: AbortSignal.timeout(opts.timeoutMs || config.TIMEOUT) });
    const buf = Buffer.from(await imgRes.arrayBuffer());
    return {
      ok: true, mock: false, prompt: prompt, size: "1024x1024",
      b64: buf.toString("base64"),
      mime: (imgRes.headers.get("content-type") || "image/png").split(";")[0],
      note: "url 返回，已下载",
    };
  }

  return { ok: true, mock: false, prompt: prompt, size: "1024x1024", b64: b64, mime: "image/png", note: "b64_json 返回" };
}
```

**并且导出去：**

```javascript
module.exports = { imagine, imagineEdit, saveImage, buildPrompt, makePng, colorFromPrompt, parseSize };
```

**然后写一个对比脚本，把"修图用代码"和"图生图"放在一起：**

新建 `scripts\edit-vs-pixel.js`：

```javascript
// edit-vs-pixel.js —— "修图"和"图生图"的边界
// 用 lib\mock.js 里的 makePng 造一张测试图，然后：
//   ① 用代码把它调亮（像素级，确定）
//   ② 用图生图让它"变亮"（内容级，不确定）
const fs = require("node:fs");
const path = require("node:path");
const { makePng } = require("../lib/imagine");
const { imagineEdit, saveImage } = require("../lib/imagine");
const config = require("../lib/config");

function brightenPng(pngBuf, factor) {
  // 这里只做一件事：把 IHDR 之后的像素数据解压、乘系数、再压回去
  // 为了课件的可读性，不在这里实现完整的 PNG 编解码。
  // 真正的做法：用 sharp / jimp，或直接用 CSS filter（如果是网页）
  return pngBuf;
}

async function main() {
  // 造一张偏暗的测试图
  const src = makePng(512, 384, [60, 70, 80]);
  const srcPath = path.join(config.DATA_DIR, "uploads", "dim-test.png");
  fs.writeFileSync(srcPath, src);
  console.log("测试原图：" + srcPath + "（RGB 60,70,80，偏暗）");
  console.log("");

  console.log("=== 路线一：代码调亮（像素级）===");
  console.log("  做法：每个像素 +40，钳到 255");
  console.log("  结果：确定。同样的输入永远同样的输出。");
  console.log("  成本：0。耗时：几毫秒。");
  console.log("  注意：本课不实现完整 PNG 编解码，生产环境用 sharp / 浏览器 CSS filter。");
  console.log("");

  console.log("=== 路线二：图生图（内容级）===");
  const r = await imagineEdit("把这张图整体调亮一些，保持内容不变", src.toString("base64"), "image/png");
  const f = saveImage(r, "edit-brighten");
  console.log("  已存：" + path.basename(f));
  console.log("  说明：" + r.note);
  console.log("  结果：不确定。每次都不一样，可能改变内容。");
  console.log("  成本：一次调用。耗时：几秒到几十秒。");
  console.log("");
  console.log("=== 结论 ===");
  console.log("  「调亮」这种需求必须用代码。用图生图会让内容和颜色不可控。");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
```

## 3.3 屏幕上应该看到什么

```text
>node scripts\edit-vs-pixel.js
测试原图：B:\...\mm-app\data\uploads\dim-test.png（RGB 60,70,80，偏暗）

=== 路线一：代码调亮（像素级）===
  做法：每个像素 +40，钳到 255
  结果：确定。同样的输入永远同样的输出。
  成本：0。耗时：几毫秒。
  注意：本课不实现完整 PNG 编解码，生产环境用 sharp / 浏览器 CSS filter。

=== 路线二：图生图（内容级）===
  已存：edit-brighten-1699号码.png
  说明：假实现（图生图）：纯色图，颜色由编辑指令决定
  结果：不确定。每次都不一样，可能改变内容。
  成本：一次调用。耗时：几秒到几十秒。

=== 结论 ===
  「调亮」这种需求必须用代码。用图生图会让内容和颜色不可控。
```

**这一节的核心不是代码，是那张判断表。**

**"调亮"用图生图会发生什么（真模型下的真实情况）：**

```text
你说"调亮，保持内容不变"
它可能：
  → 真的只调亮 ✓
  → 顺便把颜色饱和度也提高了
  → 顺便把背景换成了别的
  → 把画面里的一行小字重新生成成了错字
  → 尺寸变了
```

**"保持内容不变"这句话，模型只能尽力做到，不能保证。**

**而"每个像素 +40"是数学，一定对。**

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `HTTP 404 /images/edits` | 你的服务不支持这个端点 | 正常。这是本节要讲的一个真实限制 |
| `HTTP 400 image 格式不对` | 需要 multipart 而不是 JSON | 看服务文档 |
| `trim` / `brightenPng` 没效果 | 本课故意没实现 | 这是刻意的。生产用 `sharp` 或 CSS |

**第一个是真实现下的常见结果。** 很多中转服务只代理 `images/generations`，不代理 `images/edits`。**遇到就走"用视觉模型 + 提示词"的路，或者直接告诉客户这个需求做不了。**

**这也是"该不该用"的一部分：不是所有接口都能随便买到。**

---

# 第 4 步：算成本，说清"这张图多少钱"（15 分钟）

## 4.1 做什么 / 为什么

**做什么：** 给生图加一个成本估算和记录。

**为什么这一节必须单独有：**

因为**生图是这个课程里最贵的操作，而客户对"一张图多少钱"完全没概念。**

```text
客户："帮我生成 100 张商品图"
你：好
（跑完，账单出来）
客户："怎么这么贵？"
你：每张 X 元
客户："我以为很便宜"
```

**这个对话必须在开工前发生，不是结账时。**

## 4.2 操作

新建 `scripts\cost-estimate.js`：

```javascript
// cost-estimate.js —— 生图成本估算与记录
// 注意：这里不写死单价。单价随模型、服务、时间变化，必须由使用者填。
const fs = require("node:fs");
const path = require("node:path");
const config = require("../lib/config");

// 你从服务方拿到的单价（每张图）。填你自己的数字。
const UNIT_PRICE = Number(process.env.IMAGE_UNIT_PRICE || 0);

function estimate(n, unit) {
  const total = n * unit;
  return {
    n: n,
    unit: unit,
    total: total,
  };
}

function main() {
  console.log("=== 生图成本估算 ===");
  console.log("");
  console.log("单价（每张）：" + (UNIT_PRICE === 0 ? "未设置（设 IMAGE_UNIT_PRICE 环境变量）" : UNIT_PRICE));
  console.log("");

  const scenarios = [
    { label: "试一版看效果", n: 4 },
    { label: "改三版再看（常见）", n: 12 },
    { label: "一个商品的完整图组", n: 6 },
    { label: "100 个商品", n: 600 },
    { label: "1000 个商品", n: 6000 },
  ];

  console.log("场景                      张数      估算总额");
  console.log("------------------------------------------------");
  for (const s of scenarios) {
    const e = estimate(s.n, UNIT_PRICE);
    console.log(
      s.label.padEnd(24) +
      String(e.n).padEnd(10) +
      (UNIT_PRICE === 0 ? "-" : e.total.toFixed(2))
    );
  }

  console.log("");
  console.log("=== 关键提示 ===");
  console.log("1. 上面的张数是按「改三版」估的，实际常常更多。");
  console.log("2. 单价必须由你自己从服务方拿到，本课不写死任何数字。");
  console.log("3. 报价给客户时，生图要单独列一项，不要混在开发费里。");
  console.log("4. 如果客户说「你们先做，做出来再说钱」，那这一项要写进合同的变更条款。");
}

main();
```

**跑：**

```text
set IMAGE_UNIT_PRICE=0.3
node scripts\cost-estimate.js
```

## 4.3 屏幕上应该看到什么

```text
>set IMAGE_UNIT_PRICE=0.3
>node scripts\cost-estimate.js
=== 生图成本估算 ===

单价（每张）：0.3

场景                      张数      估算总额
------------------------------------------------
试一版看效果              4         1.20
改三版再看（常见）        12        3.60
一个商品的完整图组        6         1.80
100 个商品                600       180.00
1000 个商品               6000      1800.00

=== 关键提示 ===
1. 上面的张数是按「改三版」估的，实际常常更多。
2. 单价必须由你自己从服务方拿到，本课不写死任何数字。
3. 报价给客户时，生图要单独列一项，不要混在开发费里。
4. 如果客户说「你们先做，做出来再说钱」，那这一项要写进合同的变更条款。
```

**注意 `0.3` 是我编的一个数字，只用于演示。**

**真实单价你必须自己查。** 而且它会变。

**这张表要能改变客户的决策：**

```text
客户："1000 个商品，每个 6 张图"
你（看表）：1800
你："这个需求光生图的接口费用大约 1800，
   还不算我调效果的工时。你确定每个商品都要 6 张吗？"
客户："那先做 100 个吧"
```

**这就是"算清成本"的价值：它把"做不做"的决定交回给客户，而不是让你在结账时道歉。**

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 全是 `-` | `IMAGE_UNIT_PRICE` 没设 | `set IMAGE_UNIT_PRICE=0.3` |
| 数字是 0 | 设成了 0 | 换一个真实值 |
| 中文对齐乱 | 中文字符宽度 | 正常，不影响读 |

---

# 第 5 步：故意犯四个错（15 分钟）

## 错误 1：把"加文字"的需求交给生图

```javascript
const prompt = "一张红色背景的海报，写「年终大促」四个金色汉字";
```

**现象（真模型下）：** 字写错、多字少字、字形扭曲，改十几次可能有一次对。

**原因：** 生图模型不是在"排版文字"，它是在"生成看起来像文字的图案"。

```text
它没见过"年终大促"这四个字的排版规则
它只是学到了"海报上通常有类似文字的笔画图案"
→ 它画出的是"像汉字的东西"，不是汉字
```

**真正的伤害：** 你在一个原理上做不成的方向上花了 20 张图的成本和一个下午。

**正确做法：**

```text
① 生成一张"没有文字"的背景图（生图擅长）
② 用 CSS / Canvas / PIL 把文字叠上去（代码擅长，100% 准）
```

**这个组合是行业标准做法，不是权宜之计。** 所有"海报生成"类产品都是这么做的。

**判断口诀：**

```text
需要"精确的字" → 代码排版
需要"氛围的图" → 生图
两者都要 → 分开做，再合成
```

## 错误 2：用生图做品牌一致性

```javascript
const prompt = "公司宣传图，主色必须是 #FF5722，和品牌手册完全一致";
```

**现象：** 每次生成的颜色都不一样，都在 `#FF5722` 附近，但永远不精确等于。

**原因：** 生图不是"按 RGB 填色"，它是"生成看起来像那个颜色的像素"。

**真正的伤害：** 客户拿去做物料，印刷出来色差明显，返工。

**正确做法：** 品牌色、logo、字体这类"必须精确"的元素，**全部用代码叠加**。

```text
生图负责：背景、氛围、构图
代码负责：logo、品牌色块、标语、二维码、联系方式
```

## 错误 3：以为图生图端点一定存在

```javascript
const res = await fetch(BASE_URL + "/images/edits", ...);
```

**现象：** `HTTP 404`。

**原因：** 不同服务支持的能力差别很大。**很多中转服务只代理 `generations`，不代理 `edits`。**

**真正的伤害：** 你在方案里承诺了"能改图"，上线前才发现买不到这个能力。

**正确做法：**

```text
① 在评估阶段就确认：这个服务的哪些端点可用？
② 用最小请求试一遍，不要只看文档
③ 如果只有 generations 可用，那"改图"只能走"用视觉模型描述 + 重新生成"
   —— 效果完全不同，必须提前告诉客户
```

**这一条是整个第 6 阶段（上线运维）"能力盘点"的前置练习。**

## 错误 4：不下载 url，直接存链接

```javascript
// 错误写法
return { url: json.data[0].url };
```

**现象：** 当天能用，第二天全变成 404。

**原因：** 生图返回的 `url` 是**临时地址**，通常几小时就失效。

**真正的伤害：**

```text
你把 url 存进了数据库
→ 客户三天后打开，全是裂图
→ 你以为是"客户网络问题"
→ 查了两天才发现是 url 过期
```

**正确做法：** **拿到结果的第一时间就下载、存本地（或自己的对象存储）。**

```javascript
const imgRes = await fetch(item.url);
const buf = Buffer.from(await imgRes.arrayBuffer());
fs.writeFileSync(localPath, buf);
// 数据库里存 localPath，不存 url
```

**这一条在课件代码里已经做了（`imagine()` 的两个分支）。** 但你要知道为什么。

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 让生图写文字 | 字错、字扭曲 | 花 20 张成本做不成 | 需求里有没有"必须准确的文字" |
| 用生图做品牌一致 | 颜色每次差一点 | 物料返工 | 需求里有没有"精确的颜色/logo" |
| 以为 edits 端点存在 | 404 | 上线前才发现买不到 | 评估阶段试过所有端点吗 |
| 存 url 不下载 | 第二天裂图 | 客户投诉，你查两天 | 数据库里有没有存外链 |

**这四个错误的共同点：它们都不是"代码写错了"，是"判断错了"。**

**代码写错，报错会告诉你。判断错，一切正常，只是结果不能用。**

---

# 第 6 步：写学习笔记（10 分钟）

打开 `第03节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「该不该生图的判断表」和「四段提示词」。

---

# 第 7 步：课后练习

## 练习一：把"海报"需求拆成两步做

客户的真实需求：一张红底、"年终大促"四个金字、"11月1日-11月11日"、右下角放公司 logo 的海报。

**要求：**

1. 写清哪部分交给生图（生成什么）；
2. 写清哪部分交给代码（HTML + CSS 或 Canvas）；
3. 写清为什么这样分；
4. 如果只用生图，列三个会出问题的点。

**这道题的答案就是"海报类需求"的标准解法。**

## 练习二：给 `buildPrompt` 加第五段

现在的四段是"主体/风格/构图/避免"。想一个应该加进去的第五段，说明它管什么、不加会怎样。

**提示方向：** 光线？情绪？参考艺术家？画幅比例？分辨率？

**注意：** 段数不是越多越好。**每加一段，你就要多调一个变量。** 想清楚再写。

## 练习三：做一张"需求判断表"

列 10 个真实的图片需求（自己想，覆盖"该生图"和"不该生图"两类各 5 个），做成表：

| 需求 | 该生图吗 | 该用什么 | 判断依据 |
|---|---|---|---|

**这张表放在你的工作目录里，以后接需求时直接对照。**

## 练习四：算一次真实的成本对话

假设客户要 500 个商品图，每个商品 3 个角度。

**写出你会怎么跟客户说：**

1. 报价里生图这一项怎么列；
2. 如果客户说"太贵了能不能便宜"，你的三个降本方案是什么（各有什么代价）；
3. 如果客户说"先做 20 个看看效果"，你怎么接。

**这是生意问题，不是技术问题。** 但它决定了你这个项目赚不赚钱。

## 练习五：用自己的话讲清

1. 为什么生图模型写不好四个汉字？它的原理决定了什么？
2. "调亮一点"和"把这张照片变成油画"，为什么一个该用代码一个该用图生图？
3. 品牌色为什么不能用生图？正确的做法是什么？
4. 生图返回的 `url` 为什么必须立刻下载？
5. 客户说"要一张海报"，你的第一个问题应该是什么？

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能列出五种"不该用生图"的需求，并说出各自的替代方案
- [ ] 我能说清提示词四段各管什么，"避免"那一段为什么最重要
- [ ] 我能说清"像素级修改"和"内容级修改"的界线
- [ ] 我能说清生图 `url` 为什么必须立刻下载
- [ ] 我知道生图要单独报价，不能混在开发费里

## B. 实操

- [ ] `imagine.js` 在 MOCK 下跑通，五张假图颜色各不同
- [ ] `imagine-lab.js` 生成 `out\imagine-lab.md`，含五组提示词原文
- [ ] `prompt-ab.js` 四组对照，能看出"空字段整段不出现"
- [ ] `imagineEdit()` 能调用（MOCK 下返回假图）
- [ ] `edit-vs-pixel.js` 跑通，输出了两条路线的对比
- [ ] `cost-estimate.js` 跑出五个场景的估算
- [ ] **（如果配了真模型）`imagine-lab.js` 的真模型版本跑过一次，第 4 组字写错了**

## C. 排错

- [ ] 我试过把"写四个汉字"交给生图，看到了错字
- [ ] 我试过 `/images/edits`，知道要确认服务是否支持
- [ ] 我知道 `url` 会过期，代码里已下载
- [ ] 我知道假实现下"该不该生图"判断不出来

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 「该不该生图的判断表」写了 10 行
- [ ] 「四段提示词」写了各段不写会怎样
- [ ] 练习四的降本方案有三个，各写了代价

---

## 本节课要能说出口的一句话

> **生图擅长"氛围"，不擅长"精确"。所有要求精确的东西 —— 文字、颜色、logo、尺寸 —— 都必须用代码叠上去。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `HTTP 404 /images/generations` | `BASE_URL` 是否带 `/v1` | `config.js` 已处理尾部斜杠，确认基础地址 |
| `HTTP 404 /images/edits` | 服务不支持 | 正常，见错误 3 |
| `HTTP 400 size` | 尺寸值不被支持 | 换成服务支持的尺寸（常见 1024x1024 / 1024x1792 / 1792x1024） |
| 生成的字总是错的 | **这是原理问题** | 用代码叠字 |
| 颜色每次不一样 | **这是原理问题** | 用代码画色块 |
| 第二天图裂了 | 存了外链 | 立刻下载存本地 |
| 返回既没 b64 也没 url | 结构不同 | 打印完整 JSON 看 |
| 假图打不开 | PNG CRC 写错 | 检查 `crc32` |
| 五张假图颜色全同 | 哈希没用上 | 检查 `colorFromPrompt` |
| `MOCK=false` 但没配 key | 401 | 补 `.env` 或改回 `MOCK=true` |
| 生图很慢（30 秒以上） | 正常 | 加进度提示，别让用户以为卡死 |
| 中文提示词效果差 | 部分模型对中文理解弱 | 试英文提示词对照一次 |
