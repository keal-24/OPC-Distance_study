# 第 99 节课：图片输入

> 这节课结束时，你手上有：`03-练习代码/mm-app/` 一个能启动的项目，网页上传一张图，模型返回一段描述；终端里能看到真正发出去的消息 JSON 和 base64 前缀。

**时间**：约 100 分钟
**前置**：第 91 节课做出来的 `rag-app`，以及第 10 周做过的文件上传页面

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

到第 98 节课，你能做的事都建立在同一个前提上：**你手里有文字**。

| 你会的 | 输入是什么 |
|---|---|
| 调 `/chat/completions` | 一段字符串 |
| 做结构化输出 | 一段字符串，要求返回 JSON |
| 做 RAG | 检索出来的文字片段 |
| 做工具调用 | 一段字符串，加上工具说明 |

**只要信息不在文字里，你前面 98 节课学的东西全部用不上。**

## 0.2 今天这个坑长什么样

真实场景，不是编的：

> 客户在微信上发来一张照片，是他们跟另一家公司签的合同第 3 页，拍得有点歪，光线也一般。
> 客户问：「这条违约金到底怎么算？你帮我看一下。」
>
> 你现在的系统能做什么？**什么也做不了。** 你只能自己看完，手打一段回复。
>
> 如果一天来 20 个这样的客户，你就变成了人肉 OCR。

你需要的不是"更强的模型"，是**让模型直接看到那张图**。

这件事有个正式名字：**多模态（multimodal）**——同一个请求里同时有文字和图片。

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 多模态（multimodal） | 一次请求里不只有文字，还能带图片、音频 | 整节课的主线 |
| base64 | 把二进制文件（图片）翻译成一串纯文本字符的编码方式 | 把硬盘上的 jpg 塞进 JSON |
| data URL | 一个固定格式的字符串，告诉对方"这串文本是什么类型的文件" | `data:image/jpeg;base64,....` 这一整串 |

**三个词的关系，一句话说清：**

```text
图片文件  --base64 编码-->  一串字符  --套上 data URL 外壳-->  能放进 JSON 的字符串
```

## 0.4 今天的交付物

全部在 `第01节课\03-练习代码\mm-app\` 里：

| 文件 | 作用 |
|---|---|
| `package.json` | 项目身份证 |
| `.env` | 开关和密钥，`MOCK=true` 时不花钱 |
| `lib/mock.js` | 假模型，没 key 也能跑完整流程 |
| `lib/image-info.js` | 从文件头读出图片格式和宽高，不装任何包 |
| `lib/vision.js` | 唯一一个真正拼消息、发请求的地方 |
| `scripts/test-vision.js` | 命令行测试，把发出去的 JSON 打出来 |
| `routes/vision.js` | 给网页用的接口 |
| `public/index.html` | 上传图片的页面 |
| `server.js` | 启动入口 |

---

# 第 1 步：搭一个只跑假数据的项目（15 分钟）

## 1.1 做什么 / 为什么

**先建新项目，不改 `chat-app`。**

理由有三条，都不是洁癖：

1. `chat-app` 的消息结构是 `content: "一段字符串"`。视觉模型要求 `content` 是**数组**。同一个函数里两种结构，改起来到处是 `if`；
2. `chat-app` 里的会话、限流、后台管理都跟这节课无关，改坏了你还要回滚；
3. 这一周最后要交付的是一个独立的"图文助手"，它本来就该是一个单独的东西。

**这节课的项目叫 `mm-app`**（multimodal app）。它只做一件事：把图发给模型，把回答拿回来。

## 1.2 操作

**第 1 小步：建目录，进目录。**

打开 `cmd`（`Win + R`，输入 `cmd`，回车），然后：

```text
B:
cd \OPC-Distance_study\每周课程\03-数据与智能\第15周-多模态\第01节课\03-练习代码
mkdir mm-app
cd mm-app
```

**第 2 小步：初始化项目，装两个包。**

```text
npm init -y
npm install express dotenv
```

`npm init -y` 会生成一个默认的 `package.json`，`-y` 的意思是"所有问题都用默认答案，别问我"。

**只装两个包。** 这节课不需要数据库，等到第 100 节课要存提取结果了再装 `better-sqlite3`。**一次只引入一个变量**，出问题时你才知道是谁的问题。

**第 3 小步：建目录。**

```text
mkdir lib
mkdir routes
mkdir public
mkdir scripts
mkdir data
mkdir data\gen
mkdir data\tts
mkdir data\uploads
```

`data` 下面三个子目录这节课还用不到，是给第 101、103 节课准备的。先建好，省得到时候又回来建。

**第 4 小步：建 `.env`。**

在 `mm-app` 里新建文件 `.env`（注意前面有个点，没有扩展名）。用 VS Code 打开，写：

```text
MOCK=true
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
VISION_MODEL=
AI_TIMEOUT_MS=60000
PORT=3000
```

逐行解释：

| 行 | 干什么 | 现在填什么 |
|---|---|---|
| `MOCK=true` | 走假模型，不联网、不花钱 | 先保持 `true` |
| `OPENAI_API_KEY` | 真接口的钥匙 | 空着，等最后一节再说 |
| `OPENAI_BASE_URL` | 接口地址，兼容 OpenAI 协议的服务都填这里 | 你服务商给的地址 |
| `VISION_MODEL` | 用哪个视觉模型 | **空着**，代码会告诉你为什么 |
| `AI_TIMEOUT_MS` | 等多久算超时 | 60000 毫秒 = 60 秒 |
| `PORT` | 网页端口 | 3000 |

**`VISION_MODEL` 为什么留空？**

因为**我不知道你账号里有哪些模型**。不同服务商的模型名不一样，同一个服务商不同时间也不一样。把模型名写死在课件里，你复制过去就是 404。

所以代码的规则是：**假模式不需要模型名；真模式必须自己填。** 填错或者没填，会收到一句人话提示，而不是一个看不懂的 400。

**第 5 小步：建 `.gitignore`。**

```text
node_modules/
.env
data/
*.log
```

`.env` 绝对不能提交。`data/` 里是生成的图片、语音和数据库，也不进仓库。

顺便建一个 `.env.example`，内容是 `.env` 去掉真实值：

```text
MOCK=true
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
VISION_MODEL=
AI_TIMEOUT_MS=60000
PORT=3000
```

`.env.example` 是给别人看的模板，可以提交。**这个习惯从今天开始养成**：新人拿到仓库，看到 `.env.example` 就知道要配哪几个变量。

**第 6 小步：写假模型 `lib/mock.js`。**

这个文件一次写完，后面四节课都用它。**它不联网，纯本地造数据。**

新建 `lib\mock.js`，完整内容如下（自己敲，不要复制粘贴，250 行里至少有三个地方你会敲错，敲错才能学到东西）：

```javascript
const zlib = require("node:zlib");

const MOCK = (process.env.MOCK || "true") === "true";

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === "function") t.unref();
  });
}
```

这三行是基础：

- `MOCK` 决定走假路还是真路。**`process.env.MOCK` 没设置时默认 `true`**，所以你忘了写 `.env` 也不会突然开始花钱；
- `sleep` 模拟"网络需要时间"。`unref()` 的意思是"这个定时器别拦着程序退出"，不然测试跑完进程会挂在那里等 90 秒。

接着是 CRC32 和 PNG 编码器，用来**在本地凭空造一张真 PNG**：

```javascript
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(width, height, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const rows = [];
  for (let y = 0; y < height; y++) rows.push(row);
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
```

**为什么要自己写 PNG 编码器，不用一张现成的图？**

因为你需要"每次内容不一样"的假图。第 101 节课生成图片时，如果假图永远长一样，你根本看不出到底调没调通。这里按提示词算个哈希，颜色跟着变。

`zlib` 是 Node 内置的，不用装。PNG 的规矩是：每行像素前面加一个 `0` 字节（表示这行不做滤波），整块用 zlib 压缩，再切成 IHDR / IDAT / IEND 三个块。

然后是假的 WAV 生成器，第 103 节课用：

```javascript
function makeWav(seconds, sampleRate) {
  const rate = sampleRate || 16000;
  const numSamples = Math.floor(seconds * rate);
  const data = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000);
    data.writeInt16LE(v, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
```

44 个字节目录头 + PCM 数据，是 WAV 的最简形式。浏览器 `<audio>` 能直接播。

接下来是三份假数据。**这三份数据是照着真模型会返回的样子写的**，包括故意留的低置信度：

```javascript
const INVOICE = {
  doc_type: "invoice",
  fields: {
    invoice_no: { value: "044031900111", confidence: 0.94 },
    date: { value: "2026-03-18", confidence: 0.86 },
    seller_name: { value: "杭州云帆信息技术有限公司", confidence: 0.93 },
    total_amount: { value: 1299.0, confidence: 0.68 },
    tax_amount: { value: 74.94, confidence: 0.55 },
  },
  warnings: ["合计金额区域有折痕，数字 9 与 8 可能混淆"],
};

const SCREENSHOT = {
  doc_type: "screenshot",
  fields: {
    platform: { value: "微信", confidence: 0.91 },
    customer_request: { value: "退款什么时候到账", confidence: 0.88 },
    deadline_mentioned: { value: null, confidence: 0.4 },
  },
  todos: ["回复客户退款预计 1-3 个工作日到账"],
};

const TABLE = {
  doc_type: "table",
  columns: ["日期", "项目", "金额"],
  rows: [
    { 日期: "2026-03-01", 项目: "服务器", 金额: 320 },
    { 日期: "2026-03-05", 项目: "域名", 金额: 68 },
    { 日期: "2026-03-11", 项目: "短信", 金额: 145.5 },
  ],
  row_confidence: [0.95, 0.9, 0.62],
  total: { value: 533.5, confidence: 0.9 },
};
```

注意 `total_amount` 的 0.68 和 `tax_amount` 的 0.55。**这是故意的**：第 100 节课要讲"低置信度必须人工复核"，假数据里先埋好，你才有东西可复核。

接着是假模型的回答逻辑：

```javascript
const PROSE = [
  "这张图是一个手机聊天界面。",
  "客户连续发了三条消息，问退款什么时候到账。",
  "最后一条是客服回复，说预计 1 到 3 个工作日到账。",
  "截图里没有出现具体日期，也没有提到订单号。",
].join("");

function visionText(prompt) {
  const p = String(prompt || "");
  if (!/JSON|json|格式/.test(p)) return PROSE;
  if (/发票|invoice/i.test(p)) return JSON.stringify(INVOICE, null, 2);
  if (/表格|table|对账/i.test(p)) return JSON.stringify(TABLE, null, 2);
  return JSON.stringify(SCREENSHOT, null, 2);
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}
```

**`textOf` 这个函数是本文件里最值得看的三行。**

真模型的 `content` 是数组，你的提问藏在 `[{type:"text"}]` 里。假模型要判断"用户到底问的什么"，就必须从这个数组里把文字抠出来。**你写假模型的时候就会明白结构长什么样**——这比看文档有效。

最后是主函数：

```javascript
async function mockChatCompletion(body) {
  const messages = (body && body.messages) || [];
  const last = messages[messages.length - 1] || {};
  const text = textOf(last.content);

  let scenario = (body && body.mockScenario) || "";
  if (!scenario) {
    if (text.includes("[mock:slow]")) scenario = "timeout";
    else if (text.includes("[mock:quota]")) scenario = "quota";
    else if (text.includes("[mock:badjson]")) scenario = "badjson";
    else if (text.includes("[mock:filter]")) scenario = "filter";
  }

  if (scenario === "timeout") {
    await sleep(90000);
  }
  if (scenario === "quota") {
    const err = new Error("mock: 额度已用完 (insufficient_quota)");
    err.status = 429;
    err.raw = JSON.stringify({
      error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" },
    });
    throw err;
  }
  if (scenario === "badjson") {
    return {
      id: "mock-badjson",
      object: "chat.completion",
      model: "mock",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "好的，结果如下：{金额: 1299, 日期: 2026/3/18" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1180, completion_tokens: 42, total_tokens: 1222 },
    };
  }
  if (scenario === "filter") {
    return {
      id: "mock-filter",
      object: "chat.completion",
      model: "mock",
      choices: [{ index: 0, message: { role: "assistant", content: null }, finish_reason: "content_filter" }],
      usage: { prompt_tokens: 1180, completion_tokens: 0, total_tokens: 1180 },
    };
  }

  await sleep(120);
  return {
    id: "mock-ok",
    object: "chat.completion",
    model: "mock",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: visionText(text || "截图") },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1180, completion_tokens: 260, total_tokens: 1440 },
  };
}
```

`scenario` 是这套假模型的开关：

| 开关 | 模拟什么 | 哪节课用 |
|---|---|---|
| 空 | 正常返回 | 每节课 |
| `timeout` | 睡 90 秒，让调用方超时 | 第 104 节课 |
| `quota` | 429 + `insufficient_quota` | 第 104 节课 |
| `filter` | `finish_reason: "content_filter"` | 第 104 节课 |
| `badjson` | 返回一段带 `{` 但不是 JSON 的文字 | 第 104 节课 |

**这几个开关必须现在就存在。** 你不可能为了测试"额度用完"真的把账户刷爆，也不可能为了测试"审核拒绝"真的去传一张违规图。假模型的意义就在这里：**失败路径也能演练。**

最后导出：

```javascript
function mockTranscript() {
  return {
    text: "今天天气不错。我们明天在做各位的项目评审，已经通知了一千二百个客户。",
    language: "zh",
    duration: 8.4,
    segments: [
      { id: 0, start: 0.0, end: 2.1, text: "今天天气不错。" },
      { id: 1, start: 2.3, end: 6.0, text: "我们明天在做各位的项目评审，" },
      { id: 2, start: 6.1, end: 8.4, text: "已经通知了一千二百个客户。" },
    ],
  };
}

function mockImage(prompt) {
  let h = 0;
  const s = String(prompt || "image");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const rgb = [h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff];
  return makePng(512, 512, rgb);
}

function mockSpeech(text) {
  const seconds = Math.min(8, Math.max(1, Math.round(String(text || "").length / 5)));
  return makeWav(seconds, 16000);
}

module.exports = {
  MOCK,
  sleep,
  makePng,
  makeWav,
  mockChatCompletion,
  mockTranscript,
  mockImage,
  mockSpeech,
  visionText,
};
```

`mockTranscript` 里那句"在**做**各位"是故意写错的，正确是"在**座**各位"。第 102 节课会拿它讲同音字。

## 1.3 屏幕上应该看到什么

```text
C:\...\第01节课\03-练习代码\mm-app>npm init -y
Wrote to C:\...\mm-app\package.json:

{
  "name": "mm-app",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
```

```text
C:\...\mm-app>npm install express dotenv
added 65 packages in 8s
```

数字每次不一样，只要最后一行是 `added ... packages` 而没有 `npm ERR!` 就算成功。

```text
C:\...\mm-app>dir
2026/11/16  15:30    <DIR>          .
2026/11/16  15:30    <DIR>          ..
2026/11/16  15:30    <DIR>          data
2026/11/16  15:30    <DIR>          lib
2026/11/16  15:30    <DIR>          node_modules
2026/11/16  15:30               283 package.json
2026/11/16  15:30    <DIR>          public
2026/11/16  15:30    <DIR>          routes
2026/11/16  15:30    <DIR>          scripts
```

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `mkdir mm-app` 报"子目录或文件 mm-app 已经存在" | 你重复建了 | 不用管，直接 `cd mm-app` |
| `npm install` 卡在 `idealTree` 很久 | 网络慢 | 等 2 分钟；还不行就换 npm 镜像源，见附录 |
| `npm ERR! code EPERM` | 权限或者杀毒软件锁了 `node_modules` | 关掉杀毒软件的实时防护，再跑一次 |
| `npm init -y` 生成的 `main` 是 `index.js` | 正常 | 不用改，我们启动的是 `server.js` |
| `.env` 建成了 `.env.txt` | Windows 默认隐藏扩展名 | 资源管理器 → 查看 → 勾选"文件扩展名"，改名 |

**验证一下 `.env` 真的叫 `.env`：**

```text
dir /a
```

应该看到 `2026/11/16  15:31                98 .env`。如果看到 `.env.txt`，说明文件名错了，后面 `dotenv` 读不到，`MOCK` 就会走默认值——碰巧也是 `true`，所以这个错误会藏很久。

---

# 第 2 步：把图片变成 base64（15 分钟）

## 2.1 为什么本地文件必须转 base64

先看模型服务器在哪里：

```text
你的电脑  C:\Users\你\Pictures\hetong.jpg
                    ↓  ???
模型服务器  某台你永远登录不上去的机器
```

**模型服务器访问不到你的硬盘。**

你写 `image_url: "C:\\Users\\你\\Pictures\\hetong.jpg"`，它收到的是六个字符 `C:\Use...`，在它那台机器上这个路径不存在，返回 400。

有三种"让它看到图"的办法：

| 办法 | 做法 | 问题 |
|---|---|---|
| 公网 URL | 先把图传到能公开访问的地方，把网址给它 | 要备案、要对象存储、图片会被人爬到；第 6 阶段才做 |
| base64 内联 | 把图片变成一串文本，塞进请求体 | 请求体变大 33%，但**不需要任何额外设施** |
| 专用文件上传接口 | 先传文件拿一个 id | 只有部分服务商提供，不通用 |

**这一周用第二种。** 理由很硬：**它是唯一不需要你额外准备任何东西的办法。** 你不用买对象存储，不用配 HTTPS，不用管公网 IP。

代价也讲清楚：

| 代价 | 具体数字 |
|---|---|
| 请求体变大 | 原始字节 × 约 1.33 |
| 内存占用 | 服务端要同时持有 Buffer 和 base64 字符串，约 2.3 倍原始大小 |
| 不能复用 | 每次请求都要重传，接口不缓存 |

## 2.2 操作

**第 1 小步：写 `lib/image-info.js`。**

为什么不装 `image-size` 这个包？因为**读宽高只需要读文件头的前几十个字节**，装一个包换来的是一份你控制不了的依赖。这门课的规矩是：能用 40 行写清楚的不引包。

新建 `lib\image-info.js`：

```javascript
function imageInfo(buf) {
  if (!buf || buf.length < 16) return null;

  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  if (buf.toString("ascii", 0, 3) === "GIF") {
    return { format: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9) break;
      const len = buf.readUInt16BE(i + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { format: "jpeg", width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
    return null;
  }

  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    if (buf.toString("ascii", 12, 16) === "VP8X") {
      const w = buf.readUIntLE(24, 3) + 1;
      const h = buf.readUIntLE(27, 3) + 1;
      return { format: "webp", width: w, height: h };
    }
    return { format: "webp", width: null, height: null };
  }

  return null;
}

function base64Bytes(base64) {
  const clean = String(base64).replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

module.exports = { imageInfo, base64Bytes };
```

**JPEG 那一段为什么是个循环？**

JPEG 不是一个固定格式的头。它由一串"段"组成，每个段是 `0xFF` + 一个标记字节 + 两字节长度 + 内容。宽高藏在 `SOF`（Start Of Frame，标记 `0xC0` 到 `0xCF`）这一段里。所以要一段一段跳，跳到 SOF 才读得到宽高。

**这就是"扩展名不可信"的具体体现**：你只看 `hetong.jpg` 这个名字什么也证明不了，得读第 1、2 个字节是不是 `0xFF 0xD8`。

**第 2 小步：用命令验证它。**

在 `mm-app` 目录下：

```text
node -e "const {makePng}=require('./lib/mock');require('fs').writeFileSync('test.png',makePng(400,300,[200,60,60]));console.log('写好了')"
node -e "const {imageInfo}=require('./lib/image-info');const b=require('fs').readFileSync('test.png');console.log(b.length,imageInfo(b))"
```

第一条命令用假模型里的 `makePng` 造一张 400×300 的红图并写到硬盘，第二条读回来解析。

## 2.3 屏幕上应该看到什么

```text
写好了
1061 { format: 'png', width: 400, height: 300 }
```

**1061 字节**是这张纯色 400×300 PNG 的大小。真实照片会大得多：手机拍的一张 3000×4000 的 JPEG 通常在 2MB 到 6MB 之间。

再验证一次 base64 膨胀：

```text
node -e "const b=require('fs').readFileSync('test.png');const s=b.toString('base64');console.log('原始',b.length,'base64',s.length,'倍数',(s.length/b.length).toFixed(3));console.log(s.slice(0,40))"
```

应该看到：

```text
原始 1061 base64 1416 倍数 1.335
iVBORw0KGgoAAAANSUhEUgAAAZAAAAEsCAIAAABi1X
```

**`iVBORw0KGgo` 就是 PNG 的 base64 开头。**

记住它，以后在日志里一眼就能认出"这是一张 PNG"：

| 格式 | base64 开头 |
|---|---|
| PNG | `iVBORw0KGgo` |
| JPEG | `/9j/4AAQSkZJRg` |
| GIF | `R0lGODlh` |
| WEBP | `UklGR` |

**为什么 PNG 是 `iVBORw0KGgo`？** 因为 PNG 的前 8 个字节是 `89 50 4E 47 0D 0A 1A 0A`，也就是 `\x89PNG\r\n\x1a\n`。base64 每 3 个字节变 4 个字符，`89 50 4E` 编码出来就是 `iVBO`。

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `imageInfo` 返回 `null` | 文件不是这四种格式，或者文件是空的 | 用画图打开看看能不能显示 |
| 报 `Cannot find module './lib/image-info'` | 你不在 `mm-app` 目录 | `cd` 到 `mm-app` 再跑 |
| 报 `ENOENT: no such file or directory, open 'test.png'` | 上一条命令没跑成功 | 先确认 `dir` 里能看到 `test.png` |
| 宽高是 0 | 文件被截断了 | 重新造一张，看文件大小是否正常 |
| 倍数不是 1.33 左右 | 你的图特别小（不到 30 字节） | 正常，填充字符占比高，图越大越接近 1.333 |

---

# 第 3 步：按视觉模型的消息格式发一次（20 分钟）

## 3.1 做什么 / 为什么

现在图在手上，base64 也有了。**接下来是这节课唯一的硬知识：消息结构。**

纯文本请求长这样：

```javascript
{
  model: "你的模型名",
  messages: [
    { role: "user", content: "这张图里有什么" }
  ]
}
```

带图片的请求长这样：

```javascript
{
  model: "你的模型名",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "这张图里有什么" },
        {
          type: "image_url",
          image_url: {
            url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/..."
          }
        }
      ]
    }
  ]
}
```

**三个必须记住的区别：**

| 位置 | 纯文本 | 带图 |
|---|---|---|
| `content` 的类型 | 字符串 | **数组** |
| 文字怎么放 | 直接就是 content | `{ type: "text", text: "..." }` |
| 图片怎么放 | 没有 | `{ type: "image_url", image_url: { url: "..." } }` |

**最容易错的地方：`content` 是数组以后，文字也必须包成对象。** 你不能写：

```javascript
content: ["这张图里有什么", { type: "image_url", ... }]
```

字符串和对象混在数组里，接口会直接 400。

**为什么 `image_url` 里可以放 data URL？**

字段名叫 `image_url`，但它接受的是一种"URL"。`data:` 开头的字符串在技术上就是一个 URL（叫 data URL），所以能塞进去。这不是钻空子，是设计如此。

## 3.2 操作

**第 1 小步：写 `lib/vision.js`。**

这个文件是整周的核心：**全周只有它一个地方真正拼消息、真正 `fetch`。** 后面五节课都调它。

新建 `lib\vision.js`：

```javascript
const { MOCK, mockChatCompletion } = require("./mock");
const config = require("./config");
```

等一下，`config.js` 还没建。先建 `lib\config.js`：

```javascript
const path = require("node:path");
const fs = require("node:fs");
const { MOCK } = require("./mock");

const DATA_DIR = path.join(__dirname, "..", "data");
const GEN_DIR = path.join(DATA_DIR, "gen");
const TTS_DIR = path.join(DATA_DIR, "tts");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

for (const dir of [DATA_DIR, GEN_DIR, TTS_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  MOCK,
  DATA_DIR,
  GEN_DIR,
  TTS_DIR,
  UPLOAD_DIR,
  BASE_URL: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
  API_KEY: process.env.OPENAI_API_KEY || "",
  VISION_MODEL: process.env.VISION_MODEL || "",
  IMAGE_MODEL: process.env.IMAGE_MODEL || "",
  STT_MODEL: process.env.STT_MODEL || "",
  TTS_MODEL: process.env.TTS_MODEL || "",
  TIMEOUT: Number(process.env.AI_TIMEOUT_MS || 60000),
};
```

`fs.mkdirSync(..., { recursive: true })` 的意思是"目录不存在就建，存在就当我没说"。这样你换一台机器、删了 `data` 目录，程序照样能起来。

**`config.js` 为什么值得单独一个文件？** 因为环境变量的读取只应该出现在一个地方。散在五个文件里读 `process.env.XXX`，改一个名字你要找五遍。

现在写 `lib\vision.js`：

```javascript
const { MOCK, mockChatCompletion } = require("./mock");
const config = require("./config");

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error("等待模型超过 " + ms + " 毫秒，放弃了");
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function toDataUrl(base64, mime) {
  return "data:" + mime + ";base64," + base64;
}

function pickAnswer(data) {
  const choice = data && data.choices && data.choices[0];
  if (!choice) {
    const err = new Error("接口返回里没有 choices 字段");
    err.name = "BadResponseError";
    throw err;
  }
  if (choice.finish_reason === "content_filter") {
    const err = new Error("模型拒绝回答：内容审核未通过");
    err.name = "ContentFilterError";
    throw err;
  }
  const content = choice.message ? choice.message.content : null;
  if (content === null || content === undefined) {
    const err = new Error("模型返回了空内容，finish_reason=" + choice.finish_reason);
    err.name = "EmptyContentError";
    throw err;
  }
  return { text: content, usage: data.usage || null, finishReason: choice.finish_reason };
}

function buildMessages(prompt, base64, mime, detail) {
  return [
    {
      role: "system",
      content: "你是一个看图助手。只描述图片上真实存在的内容，看不清就直说看不清，不要猜。",
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: toDataUrl(base64, mime || "image/jpeg"),
            detail: detail || "auto",
          },
        },
      ],
    },
  ];
}

async function analyzeImage({ base64, mime, prompt, detail, timeoutMs, scenario }) {
  if (!MOCK && !config.VISION_MODEL) {
    throw new Error("没有配置 VISION_MODEL：请在 .env 里填你账号可用的视觉模型名，或者保持 MOCK=true");
  }

  const messages = buildMessages(prompt, base64, mime, detail);
  const ms = timeoutMs || config.TIMEOUT;

  if (MOCK) {
    const fake = await withTimeout(mockChatCompletion({ messages: messages, mockScenario: scenario }), ms);
    return pickAnswer(fake);
  }

  const res = await fetch(config.BASE_URL + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.API_KEY,
    },
    body: JSON.stringify({ model: config.VISION_MODEL, messages: messages }),
    signal: AbortSignal.timeout(ms),
  });

  const raw = await res.text();

  if (!res.ok) {
    const err = new Error("接口返回 HTTP " + res.status + "：" + raw.slice(0, 300));
    err.status = res.status;
    err.raw = raw;
    throw err;
  }

  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const err = new Error("接口返回的不是 JSON，前 200 个字符是：" + raw.slice(0, 200));
    err.name = "BadJsonError";
    err.status = res.status;
    throw err;
  }

  return pickAnswer(data);
}

module.exports = { analyzeImage, toDataUrl, buildMessages, withTimeout, pickAnswer };
```

逐块读这几个地方：

**`toDataUrl` 一行，但是最核心的一行。**

```javascript
return "data:" + mime + ";base64," + base64;
```

拼出来是 `data:image/jpeg;base64,/9j/4AAQ...`。**没有这个前缀，接口会把 base64 当成一个普通网址去访问，然后 404。**

**`withTimeout` 是给假模式用的。**

真模式下 `fetch` 有 `AbortSignal.timeout(ms)` 帮忙掐断。假模式下没有真网络，`mockChatCompletion` 睡 90 秒就真睡 90 秒，所以要用 `Promise.race` 自己比赛一场。

**`pickAnswer` 把三种"没正常回答"的情况分开：**

| 情况 | `finish_reason` / 返回 | 你该做什么 |
|---|---|---|
| 正常 | `stop` | 用 `message.content` |
| 审核拒绝 | `content_filter`，`content` 是 `null` | 换图，重试没用（会再被拒一次，还可能计费） |
| 被截断 | `length` | 内容没说完，让模型接着说 |
| 空内容 | `content` 是 `null` 但 `finish_reason` 不是 `content_filter` | 记日志，重试一次 |

第 104 节课会把这一堆整理成一张表。

**`signal: AbortSignal.timeout(ms)` 为什么不用 `setTimeout` + `abort()`？**

Node 18 起内置了这个写法，一行顶五行。`AbortSignal.timeout` 到点会自动 abort 那次 `fetch`，抛 `TimeoutError`。

**第 2 小步：写命令行测试 `scripts/test-vision.js`。**

```javascript
require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const { analyzeImage, buildMessages } = require("../lib/vision");
const { imageInfo } = require("../lib/image-info");

const MIME = { jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log("用法：node scripts/test-vision.js <图片路径> [提示词]");
    process.exit(1);
  }

  const abs = path.resolve(file);
  const buf = fs.readFileSync(abs);
  const info = imageInfo(buf);
  if (!info) {
    console.log("这个文件不是 jpg / png / gif / webp，读不出宽高");
    process.exit(1);
  }

  const base64 = buf.toString("base64");
  const prompt = process.argv[3] || "用三句话描述这张图片";

  console.log("=== 图片基本情况 ===");
  console.log("文件：" + abs);
  console.log("格式：" + info.format + "  宽高：" + info.width + " x " + info.height);
  console.log("原始字节：" + buf.length);
  console.log("base64 长度：" + base64.length);
  console.log("膨胀倍数：" + (base64.length / buf.length).toFixed(3));

  const messages = buildMessages(prompt, base64, MIME[info.format], "auto");
  const printed = messages.map((m) => {
    if (!Array.isArray(m.content)) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: m.content.map((part) => {
        if (part.type === "text") return part;
        return {
          type: part.type,
          image_url: {
            url: part.image_url.url.slice(0, 64) + "...（后面还有 " + (part.image_url.url.length - 64) + " 个字符）",
            detail: part.image_url.detail,
          },
        };
      }),
    };
  });

  console.log("");
  console.log("=== 实际发出去的消息（base64 已截断） ===");
  console.log(JSON.stringify(printed, null, 2));

  console.log("");
  console.log("=== 模型回答 ===");
  const result = await analyzeImage({ base64: base64, mime: MIME[info.format], prompt: prompt });
  console.log(result.text);
  console.log("");
  console.log("=== token 用量 ===");
  console.log(JSON.stringify(result.usage));
}

main().catch((err) => {
  console.log("失败：" + err.name + " / " + err.message);
  process.exit(1);
});
```

**这个脚本存在的意义：把"发出去的东西"打出来。**

你不能靠猜。请求体是这节课唯一需要精确理解的东西，把它打印出来看一眼，比读十遍文档有用。

`require("dotenv").config({ quiet: true })` 里的 `quiet` 是关掉 dotenv 17 以后默认打印的一行注入日志。老版本忽略这个参数，不会有副作用。

**第 3 小步：跑它。**

```text
node scripts\test-vision.js test.png "这张截图里客户想要什么？"
```

## 3.3 屏幕上应该看到什么

```text
=== 图片基本情况 ===
文件：B:\OPC-Distance_study\每周课程\03-数据与智能\第15周-多模态\第01节课\03-练习代码\mm-app\test.png
格式：png  宽高：400 x 300
原始字节：1061
base64 长度：1416
膨胀倍数：1.335

=== 实际发出去的消息（base64 已截断） ===
[
  {
    "role": "system",
    "content": "你是一个看图助手。只描述图片上真实存在的内容，看不清就直说看不清，不要猜。"
  },
  {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "这张截图里客户想要什么？"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAEsCAIAAABi1X...（后面还有 1352 个字符）",
          "detail": "auto"
        }
      }
    ]
  }
]

=== 模型回答 ===
这张图是一个手机聊天界面。客户连续发了三条消息，问退款什么时候到账。最后一条是客服回复，说预计 1 到 3 个工作日到账。截图里没有出现具体日期，也没有提到订单号。

=== token 用量 ===
{"prompt_tokens":1180,"completion_tokens":260,"total_tokens":1440}
```

**把上面那段 JSON 抄到笔记里。** 这是这周唯一必须背下来的结构。

**注意 `model` 字段没有出现在打印里**——因为 `printed` 只打印了 `messages`。真模式下 `body` 里还有 `model`，假模式不需要。

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `失败：TimeoutError / 等待模型超过 60000 毫秒` | 提示词里带了 `[mock:slow]` | 去掉它 |
| `失败：ContentFilterError` | 提示词里带了 `[mock:filter]` | 去掉它 |
| `失败：TypeError [ERR_INVALID_ARG_TYPE]` | `buildMessages` 的参数传错了顺序 | 检查是不是 `(prompt, base64, mime, detail)` |
| 回答永远是同一段话 | 假模式只按关键词分流 | 正常，假模型不会真的看图 |
| `Cannot find module 'dotenv'` | 不在 `mm-app` 目录 | `cd` 回来 |
| 宽高显示 `undefined x undefined` | 用了 webp 但不是 VP8X 变体 | 换一张 jpg |

---

# 第 4 步：体积和分辨率（20 分钟）

## 4.1 三个数字

| 数字 | 是什么 | 你该怎么做 |
|---|---|---|
| **4MB** | 大多数视觉接口对单张图的请求体上限（以你账号文档为准） | base64 后不能超过约 5.3MB，对应原图 4MB |
| **1024px** | 模型实际会看的分辨率档位，`detail: "high"` 时会把长边切块细看 | 长边超过 1024 的图，先缩，因为你传原图也是被缩 |
| **1.33** | base64 膨胀倍数 | 5MB 的原图 = 6.7MB 请求体 = 直接 413 |

**关键认知：传一张 4000×3000 的原图，不会让模型看得更清楚。**

模型的视觉编码器有固定输入尺寸。`detail: "auto"` 时，长边超过一定尺寸会先缩到 1024 左右再编码。你多花的钱，买的是上传时间和内存占用，不是精度。

**什么时候才需要 `detail: "high"`？** 看小字的时候：发票号、合同条款编号、表格里的数字。高清模式下模型会把图切成若干 512×512 的块逐块看，token 消耗明显上升。

## 4.2 操作

**第 1 小步：先算一遍账。**

```text
node -e "for (const mb of [0.5,1,2,4]) { const b=mb*1024*1024; console.log(mb+'MB 原图 -> base64 '+(b*4/3/1024/1024).toFixed(2)+'MB -> JSON 请求体约 '+(b*4/3/1024/1024+0.01).toFixed(2)+'MB') }"
```

**第 2 小步：用画图把图缩小。**

这是最土的办法，但它**在你任何一台 Windows 上都能用，不需要装任何东西**：

1. 在图片上右键 → 打开方式 → **画图**（或者 `Win + R` 输入 `mspaint` 回车，再把图拖进去）；
2. 按 `Ctrl + W`（重新调整大小）；
3. 选"像素"，勾上"保持纵横比"，把**水平**改成 `1024`；
4. 确定；
5. 按 `F12`（另存为）→ 选 **JPEG 图片** → 文件名比如 `hetong-small.jpg`；
6. 在弹出的"JPEG 品质"里选 80 左右，别选 100。

**为什么是 JPEG 不是 PNG？** 照片用 JPEG（有损但小得多），截图和带文字的图用 PNG（无损，文字边缘清楚）。一张合同照片存 PNG 会大 5 到 10 倍。

**为什么不引 `sharp`？**

`sharp` 是 Node 里压缩图片的事实标准，快、质量好。但它是**原生模块**：安装时要下载对应平台的二进制，装不上时要现场编译，编译要 Python 和 Visual Studio Build Tools。

这门课的学员是一个人，卡在这里没有任何人能帮他。所以这一周**不引任何需要编译的依赖**，压缩这件事交给系统自带的画图。

**生产环境该怎么做？** 在服务端用 `sharp` 或 `libvips` 自动压缩，用户传什么都不用管。**这是第 6 阶段（上线运维）的事**，现在只需要知道"这条路存在，但现在不走"。

**第 3 小步：写一个上传前的检查。**

在 `scripts` 下新建 `check-image.js`：

```javascript
const fs = require("node:fs");
const { imageInfo } = require("../lib/image-info");

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 1024;

const file = process.argv[2];
if (!file) {
  console.log("用法：node scripts/check-image.js <图片路径>");
  process.exit(1);
}

const buf = fs.readFileSync(file);
const info = imageInfo(buf);

if (!info) {
  console.log("不是支持的图片格式");
  process.exit(1);
}

const base64Len = Math.ceil(buf.length / 3) * 4;

console.log("格式：" + info.format);
console.log("宽高：" + info.width + " x " + info.height);
console.log("原始：" + (buf.length / 1024).toFixed(1) + " KB");
console.log("base64：" + (base64Len / 1024).toFixed(1) + " KB");

if (buf.length > MAX_BYTES) {
  console.log("结论：太大，必须压缩");
} else if (info.width > MAX_SIDE || info.height > MAX_SIDE) {
  console.log("结论：能传，但长边超过 1024，建议缩到 1024 再传");
} else {
  console.log("结论：可以直接传");
}
```

**第 4 小步：拿一张真照片跑一遍。**

从手机里随便传一张照片到电脑上，或者用 `Win + Shift + S` 截个屏（截图默认存在剪贴板，粘到画图里另存为 `shot.png`）。

```text
node scripts\check-image.js 你的图.jpg
```

## 4.3 屏幕上应该看到什么

算账那条命令的真实输出：

```text
0.5MB 原图 -> base64 0.67MB -> JSON 请求体约 0.68MB
1MB 原图 -> base64 1.33MB -> JSON 请求体约 1.34MB
2MB 原图 -> base64 2.67MB -> JSON 请求体约 2.68MB
4MB 原图 -> base64 5.33MB -> JSON 请求体约 5.34MB
```

检查脚本跑一张 2MB 的手机照片：

```text
格式：jpeg
宽高：3000 x 4000
原始：2048.0 KB
base64：2731.0 KB
结论：能传，但长边超过 1024，建议缩到 1024 再传
```

用画图缩到 1024 宽再跑：

```text
格式：jpeg
宽高：1024 x 1365
原始：186.4 KB
base64：248.6 KB
结论：可以直接传
```

**2048KB 变成 186KB。** 这就是为什么第 3 步值得花 10 分钟。

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 画图里 `Ctrl + W` 没反应 | 焦点不在画布上 | 先点一下图片区域 |
| 改完宽高图变得很扁 | 没勾"保持纵横比" | 撤销，重新来，勾上 |
| 另存为找不到 JPEG | 你选了"另存为"里的 PNG 分类 | 在"保存类型"下拉里找 `JPEG 图片` |
| 缩完反而更大 | 你把 JPEG 存成了 PNG | 看扩展名，`.png` 就是错的 |
| 检查脚本报 `ENOENT` | 路径里有空格没加引号 | `node scripts\check-image.js "D:\我的 照片\a.jpg"` |
| 用中文路径报错 | 极少数环境编码问题 | 先把图复制到 `mm-app` 目录再试 |

---

# 第 5 步：做成网页上传（20 分钟）

## 5.1 做什么 / 为什么

命令行跑通了，现在要给别人用。别人不会开终端。

**这里有一个关键决定：上传用 JSON + base64，不用 `multipart/form-data`。**

你在第 10 周学的是 `<form enctype="multipart/form-data">` + 后端解析 multipart。那套东西需要一个解析包（multer / busboy），而我们的白名单里没有。

更重要的是：**多模态接口本来就要 base64。** 走 multipart 的流程是"文件 → 服务端临时文件 → 读成 Buffer → 转 base64"，多绕两步。直接在浏览器里 `FileReader` 转成 base64 发过来，服务端一行 `Buffer.from(base64, "base64")` 就到手了。

| 方案 | 需要装包 | 步骤 | 适合 |
|---|---|---|---|
| multipart | 要（multer） | 存盘 → 读盘 → 转 base64 | 大文件、要保留原文件 |
| JSON + base64 | 不要 | 直接转 base64 → 发 | 图片、10MB 以内 |

**代价说清楚：** base64 走 JSON，请求体会大 33%，而且 Express 要先把它整个读进内存。所以必须设 `express.json({ limit })`，否则有人传个 100MB 的视频你的进程就 OOM 了。

## 5.2 操作

**第 1 小步：写路由 `routes/vision.js`。**

```javascript
const express = require("express");
const { analyzeImage } = require("../lib/vision");
const { imageInfo } = require("../lib/image-info");

const router = express.Router();

router.post("/analyze", async (req, res, next) => {
  try {
    const body = req.body || {};
    const base64 = body.base64;
    const mime = body.mime || "image/jpeg";
    const prompt = body.prompt || "用三句话描述这张图片";
    const detail = body.detail || "auto";

    if (!base64) {
      const err = new Error("请求里没有 base64 字段");
      err.name = "BadRequestError";
      err.status = 400;
      throw err;
    }

    const buf = Buffer.from(base64, "base64");
    const info = imageInfo(buf);
    if (!info) {
      const err = new Error("认不出这个文件的图片格式，只支持 jpg / png / gif / webp");
      err.status = 400;
      throw err;
    }
    if (buf.length > 4 * 1024 * 1024) {
      const err = new Error("图片 " + buf.length + " 字节，超过 4MB 上限");
      err.status = 413;
      throw err;
    }

    const result = await analyzeImage({
      base64: base64,
      mime: mime,
      prompt: prompt,
      detail: detail,
      scenario: body.mockScenario,
    });

    res.json({
      ok: true,
      answer: result.text,
      usage: result.usage,
      image: { format: info.format, width: info.width, height: info.height, bytes: buf.length },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**为什么先 `Buffer.from(base64, "base64")` 再检查？**

因为 base64 可能是一坨垃圾。`Buffer.from("随便什么", "base64")` 不会报错，它会**静默地**解出一堆乱码字节。所以真正的校验是"解出来以后能不能读出图片头"。

**`err.status` 这个字段是给后面的错误中间件看的**，第 104 节课会用到。现在只要知道它带着"应该返回什么状态码"的信息。

**第 2 小步：写 `server.js`。**

```javascript
require("dotenv").config({ quiet: true });

const path = require("node:path");
const express = require("express");
const { MOCK } = require("./lib/config");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/gen", express.static(path.join(__dirname, "data", "gen")));
app.use("/tts", express.static(path.join(__dirname, "data", "tts")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mock: MOCK });
});

app.use("/api", require("./routes/vision"));

app.use((req, res) => {
  res.status(404).json({ error: "没有这个接口：" + req.method + " " + req.url });
});

app.use((err, req, res, next) => {
  console.error("[ERR]", err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log("服务已启动：http://localhost:" + PORT);
  console.log("当前模式：" + (MOCK ? "MOCK（不花钱，返回假数据）" : "真实接口（会花钱）"));
});
```

**`limit: "6mb"` 这个数字怎么来的？**

4MB 原图 → base64 约 5.33MB → 加上 JSON 的引号和其他字段，要留余量。6MB 够用。

**设小了会怎样？** 请求体超过限制，`express.json` 会抛一个 `entity.too.large` 的错误，`status` 是 413。你现在这个错误中间件会把它改写成 500——这是错的，第 104 节课修。

**设大了会怎样？** 有人发 50MB，Node 吃 50MB 内存解析，几个人同时发就 OOM。

**第 3 小步：写页面 `public/index.html`。**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>图片输入测试台</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; max-width: 760px; margin: 32px auto; padding: 0 16px; color: #222; }
    h1 { font-size: 20px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    img#preview { max-width: 100%; max-height: 320px; display: none; border-radius: 6px; }
    textarea, select { width: 100%; font-size: 14px; padding: 8px; box-sizing: border-box; }
    button { padding: 9px 18px; font-size: 14px; cursor: pointer; }
    pre { background: #f6f8fa; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; }
    .hint { color: #666; font-size: 13px; }
    .warn { color: #b00; font-size: 13px; }
    .row { margin-bottom: 10px; }
  </style>
</head>
<body>
  <h1>图片输入测试台</h1>

  <div class="box">
    <div class="row">
      <input type="file" id="file" accept="image/jpeg,image/png,image/gif,image/webp" />
    </div>
    <img id="preview" alt="预览" />
    <p class="hint" id="info">还没有选图片</p>
    <p class="warn" id="warn"></p>
  </div>

  <div class="box">
    <div class="row">
      <label>你要问什么</label>
      <textarea id="prompt" rows="3">用三句话描述这张图片，先说主体，再说细节。</textarea>
    </div>
    <div class="row">
      <label>清晰度 detail</label>
      <select id="detail">
        <option value="auto">auto（默认，由模型决定）</option>
        <option value="low">low（便宜，适合看大概）</option>
        <option value="high">high（贵，适合看小字）</option>
      </select>
    </div>
    <button id="send">开始分析</button>
  </div>

  <div class="box">
    <h2 style="font-size:16px">结果</h2>
    <pre id="out">等待发送…</pre>
    <p class="hint" id="usage"></p>
  </div>

  <script>
    const fileInput = document.getElementById("file");
    const preview = document.getElementById("preview");
    const infoEl = document.getElementById("info");
    const warnEl = document.getElementById("warn");
    const outEl = document.getElementById("out");
    const usageEl = document.getElementById("usage");

    const MAX_BYTES = 4 * 1024 * 1024;
    const MAX_SIDE = 1024;

    let current = null;

    fileInput.addEventListener("change", () => {
      warnEl.textContent = "";
      const file = fileInput.files[0];
      if (!file) return;

      if (file.size > MAX_BYTES) {
        warnEl.textContent = "文件 " + (file.size / 1024 / 1024).toFixed(2) + "MB，超过 4MB。先用画图另存为 JPEG 再传。";
        current = null;
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const comma = dataUrl.indexOf(",");
        const head = dataUrl.slice(0, comma);
        const base64 = dataUrl.slice(comma + 1);
        const mime = head.slice(5, head.indexOf(";"));

        preview.src = dataUrl;
        preview.style.display = "block";

        const probe = new Image();
        probe.onload = () => {
          infoEl.textContent =
            file.name + " | " + mime + " | " + probe.naturalWidth + " x " + probe.naturalHeight +
            " | " + file.size + " 字节 | base64 长度 " + base64.length;
          if (probe.naturalWidth > MAX_SIDE || probe.naturalHeight > MAX_SIDE) {
            warnEl.textContent = "长边超过 1024 像素，模型会自己缩，但你传的是原图，白花钱。先用画图缩一下。";
          }
          current = { base64: base64, mime: mime, bytes: file.size };
        };
        probe.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("send").addEventListener("click", async () => {
      if (!current) {
        outEl.textContent = "先选一张图片";
        return;
      }
      outEl.textContent = "发送中，最多等 60 秒…";
      usageEl.textContent = "";
      const started = Date.now();

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64: current.base64,
            mime: current.mime,
            prompt: document.getElementById("prompt").value,
            detail: document.getElementById("detail").value,
          }),
        });
        const data = await res.json();
        const cost = ((Date.now() - started) / 1000).toFixed(1);

        if (!res.ok) {
          outEl.textContent = "失败（HTTP " + res.status + "）：" + (data.error || "没有错误说明");
          return;
        }

        outEl.textContent = data.answer;
        usageEl.textContent =
          "耗时 " + cost + " 秒 | 输入 " + (data.usage ? data.usage.prompt_tokens : "?") +
          " tokens | 输出 " + (data.usage ? data.usage.completion_tokens : "?") +
          " tokens | 图片 " + data.image.width + "x" + data.image.height;
      } catch (err) {
        outEl.textContent = "请求没发出去：" + err.message;
      }
    });
  </script>
</body>
</html>
```

**`reader.readAsDataURL(file)` 返回的就是 data URL**，形如 `data:image/png;base64,iVBOR...`。所以前端其实已经帮你套好壳了，你要做的是**把壳拆掉**，只留逗号后面那一段发给后端。

**为什么不让前端直接发整个 data URL？**

可以，但服务端就要多一步 `split(",")`，而且 base64 里不需要前缀这个概念，前缀是"告诉接收方这是什么"，到了后端你已经知道 mime 了。**一件事只在一个地方做。**

**第 4 小步：起服务。**

```text
node server.js
```

## 5.3 屏幕上应该看到什么

终端：

```text
服务已启动：http://localhost:3000
当前模式：MOCK（不花钱，返回假数据）
```

浏览器打开 `http://localhost:3000`，选一张图，页面会显示：

```text
shot.png | image/png | 400 x 300 | 1061 字节 | base64 长度 1416
```

点"开始分析"，结果区出现：

```text
这张图是一个手机聊天界面。客户连续发了三条消息，问退款什么时候到账。最后一条是客服回复，说预计 1 到 3 个工作日到账。截图里没有出现具体日期，也没有提到订单号。
```

底部：

```text
耗时 0.2 秒 | 输入 1180 tokens | 输出 260 tokens | 图片 400x300
```

按 `F12` 打开开发者工具 → Network（网络）→ 点 `analyze` 请求 → Payload，你会看到发出去的 JSON，`base64` 字段有 1416 个字符。

**这就是整条链路。** 从硬盘上的文件到模型眼里的图，中间只有三步：读文件 → 转 base64 → 套 data URL 放进数组。

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 页面打开是 `Cannot GET /` | `public` 目录里没有 `index.html` | 检查文件名和位置 |
| 选图后没反应 | `accept` 限制了类型，你选的不是图片 | 换一张 jpg |
| 点按钮报 `Unexpected token '<'` | 后端返回了 HTML（404 页面），你当 JSON 解 | 看 Network 里那个请求的 URL 和状态码 |
| `失败（HTTP 413）` | 请求体超过 6MB | 压图 |
| `失败（HTTP 400）：认不出这个文件的图片格式` | base64 传的是整个 data URL | 检查前端 `split(",")` |
| 终端没有任何输出 | 请求没到服务器 | 看 Network 里请求是不是 pending |
| 中文全变成 `????` | 你没设 `charset` | 这次是 JSON，`res.json` 自动带 UTF-8，不需要管 |

---

# 第 6 步：看懂一次请求的账单（15 分钟）

## 6.1 做什么 / 为什么

假模式不花钱，但你不能永远不知道钱花在哪。

看图请求的计费跟纯文本有一个**很大的不同**：图片按尺寸折算成 token。

| 输入 | 大概多少 token |
|---|---|
| 一段 100 字的文字 | 100 上下 |
| 一张 1024×1024 的图，`detail: "low"` | 几百 |
| 一张 1024×1024 的图，`detail: "high"` | 上千 |
| 一段 100 字的文字 + 一张 1024×1024 的图（high） | 文字那点可以忽略，主要是图 |

**这解释了一个常见困惑**："我就问了一句话，怎么花了这么多？"——因为钱花在图上了。

## 6.2 操作

**第 1 小步：在页面上对比三次。**

用同一张图，同一条提问，只改 `detail`：

| 第几次 | detail | 记录 `prompt_tokens` |
|---|---|---|
| 1 | `low` | |
| 2 | `auto` | |
| 3 | `high` | |

假模式下三次都是 1180，因为假模型不真的看图。**这个数字本身没有意义，有意义的是你真接口时会看到差异。**

**第 2 小步：改一下假模型，让它至少在数字上区分开。**

在 `lib/mock.js` 里，把 `mockChatCompletion` 最后的 `usage` 那一行改成按 `detail` 算：

```javascript
  const detail = (body.messages[1].content[1].image_url.detail) || "auto";
  const imgTokens = detail === "low" ? 320 : detail === "high" ? 1560 : 980;

  await sleep(120);
  return {
    id: "mock-ok",
    object: "chat.completion",
    model: "mock",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: visionText(text || "截图") },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 200 + imgTokens, completion_tokens: 260, total_tokens: 460 + imgTokens },
  };
```

再跑三次，你会看到三个不同的数字。

**这个改动值得做。** 它让你在假模式下就能建立"低清便宜、高清贵"的直觉，而不是等到账单来了才发现。

**第 3 小步：算一个月的量级。**

不用写代码，用计算器：

```text
一天 50 张图，每张 high 档约 1600 输入 token，输出 300 token
一个月按 22 个工作日算
输入 = 50 × 22 × 1600 = 1,760,000 token
输出 = 50 × 22 × 300  = 330,000 token
```

**然后拿这个数字去乘你服务商价目表上的单价。** 我不给你写价格，因为价格随时在变，写死了就是骗你。**你在自己账号的计费页面能看到准确单价。**

得到月成本以后，判断一件事：**这个功能收客户多少钱才不亏。** 这是第 5 阶段（商业化）的内容，但现在就要有这个意识。

## 6.3 屏幕上应该看到什么

改完假模型后，同一张图三次的 `usage`：

```text
detail=low   {"prompt_tokens":520,"completion_tokens":260,"total_tokens":780}
detail=auto  {"prompt_tokens":1180,"completion_tokens":260,"total_tokens":1440}
detail=high  {"prompt_tokens":1760,"completion_tokens":260,"total_tokens":2020}
```

**高清是低清的 3.4 倍输入 token。** 一张发票值得，一张随手拍的产品照不值得。

## 6.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 三次数字完全一样 | 你没保存 `mock.js`，或者没重启 | `Ctrl + C` 后重新 `node server.js` |
| 报 `Cannot read properties of undefined (reading 'content')` | `messages[1]` 不存在 | 检查你是不是在假模式下调用的，真模式没有这条路径 |
| 页面上的 usage 是 `undefined` | 你的路由没把 `usage` 传出来 | 检查 `res.json` 里有没有 `usage: result.usage` |

**注意：改了 `lib/mock.js` 必须重启服务。** Node 不会热加载。这个坑你今天已经踩过一次了（第 1 步改完 `.env` 也要重启）。

---

# 第 7 步：故意犯 3 个错（15 分钟）

## 错误 1：把 content 写成字符串

**操作：** 打开 `lib/vision.js`，把 `buildMessages` 里的 `content` 数组改成字符串：

```javascript
{
  role: "user",
  content: "这张图里有什么？" + toDataUrl(base64, mime)
}
```

**现象：** 假模式不会报错（假模型只读文字），换成真接口会收到 400：

```text
接口返回 HTTP 400：{"error":{"message":"Invalid content type. Expected an array of content parts.","type":"invalid_request_error"}}
```

**原因：** 带图请求的 `content` 必须是数组。你把图片 URL 拼进字符串，模型看到的就是一长串文字，没有任何"这是一张图"的标记。

**怎么查：** 在 `scripts/test-vision.js` 里打印 `Array.isArray(messages[1].content)`，应该是 `true`。

## 错误 2：漏了 `data:image/jpeg;base64,` 前缀

**操作：** 把 `toDataUrl` 改成直接返回 base64：

```javascript
function toDataUrl(base64, mime) {
  return base64;
}
```

**现象：** 真接口报：

```text
接口返回 HTTP 400：{"error":{"message":"Invalid image URL. Expected a fully qualified HTTPS URL or a data URL.","type":"invalid_request_error"}}
```

**原因：** `image_url.url` 期待的是一个 URL。以 `data:` 开头的叫 data URL，是合法的；一坨裸 base64 不是 URL，模型服务器会试图把它当网址去解析，解析失败。

**怎么查：** 打印 `url.slice(0, 30)`，正确的必须前 5 个字符是 `data:`。

**这个错误还有一个变体**：前缀写对了，但 mime 写错了，PNG 的图写成 `image/jpeg`。这时候接口可能不报错，但解码失败，返回 400 或者干脆给你一段胡说。**mime 要与真实格式一致**，这就是第 2 步写 `imageInfo` 的原因。

## 错误 3：传了一张 8MB 的原图

**操作：** 找一张手机原图（不是缩过的），直接选进页面。

**现象：** 页面上先出现你自己的提示：

```text
文件 8.24MB，超过 4MB。先用画图另存为 JPEG 再传。
```

如果你把前端那个 `MAX_BYTES` 检查注释掉，会看到后端：

```text
失败（HTTP 413）：request entity too large
```

**原因：** 两层限制。前端是我们自己写的 4MB 检查；后端是 `express.json({ limit: "6mb" })`。8MB 原图转 base64 是 10.7MB，两层都过不去。

**怎么查：**

1. 先看 `Content-Length`（Network 面板里能看到），超过 6MB 就是请求体超限；
2. 再看 `check-image.js` 的输出，确认原图多大；
3. 压到 1024 再试。

**为什么 413 显示成 500？** 因为你现在这个错误中间件把所有错误都写成 500：

```javascript
res.status(500).json({ error: err.message });
```

**这是错的，第 104 节课改。** 现在你只要记住：**状态码不对，前端就没法区分"该重试"和"该让用户换图"。**

## 三个错误总结

```text
content 是字符串        → 400，expected an array of content parts
漏了 data URL 前缀      → 400，expected a fully qualified HTTPS URL or a data URL
传了 8MB 原图           → 413，request entity too large（被你的中间件写成 500）
```

**排查顺序：**

```text
① 打印 messages，确认 content 是数组
② 打印 url 前 30 个字符，确认以 data: 开头
③ 打印 Buffer 长度，确认没超 4MB
④ 再怀疑模型
```

---

# 第 8 步：写学习笔记（10 分钟）

把下面这段抄进 `02-笔记\NOTES.md`，然后填。

```markdown
# 第 99 节课学习笔记

## 一、多模态和纯文本调用差在哪

差在（用一句话说）：

## 二、一条视觉消息的完整结构

凭记忆写出来（不要翻课件）：

```javascript
```

我漏掉的地方：

## 三、为什么本地图片必须转成 base64

如果我把 `C:\Users\我\a.jpg` 直接填进 url，模型服务器会看到什么：

## 四、我实测的 base64 膨胀比例

| 原图字节 | base64 长度 | 倍数 |
|---|---|---|
| | | |

## 五、体积和分辨率的三个数字

| 数字 | 含义 | 超过会怎样 |
|---|---|---|
| 4MB | | |
| 1024px | | |
| 1.33 | | |

## 六、把大图压小的三种办法

| 办法 | 要不要装东西 | 我用了哪个 |
|---|---|---|
| | | |
| | | |
| | | |

## 七、上传链路：从 file 到 base64

按顺序写这四步分别在哪一层发生：

1.
2.
3.
4.

为什么不用 multipart：

## 八、MOCK 假模型是怎么工作的

| 开关 | 模拟什么 | 怎么触发 |
|---|---|---|
| | | |
| | | |
| | | |

## 九、三个错误的后果

| 错误 | 报什么 | 怎么查 |
|---|---|---|
| content 写成字符串 | | |
| 漏 data URL 前缀 | | |
| 传 8MB 原图 | | |

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] `mm-app` 能 `node server.js` 启动
- [ ] `node scripts\test-vision.js test.png` 能打印出完整消息 JSON
- [ ] 我知道 base64 开头 `iVBORw0KGgo` 是 PNG
- [ ] 我用画图把一张大图缩到了 1024 以内
- [ ] 网页上能上传图片并拿到回答
- [ ] 我对比过 low / auto / high 三次的 token 数
- [ ] 我做过三个错误实验
```

---

# 第 9 步：课后练习

## 练习一：加一个"只数图里有几个人"的提问模板

**要求：** 在页面上加一个按钮，点了以后把 `#prompt` 的值改成"这张图里有几个人？分别在做什么？用 JSON 返回，格式 `{"count": 0, "people": []}`"。

**验收：** 点按钮后文本框内容变化，发送后拿到 JSON 形状的回答（假模型会给 `SCREENSHOT` 那份，不用管内容对不对，看形状）。

## 练习二：让 `check-image.js` 输出建议的缩放尺寸

**要求：** 长边超过 1024 时，按比例算出缩放后的宽高并打印，例如：

```text
建议缩放到：1024 x 1365
```

**提示：** `Math.round(原宽 * 1024 / 长边)`。

## 练习三：加一个 GIF 的判断

**要求：** `imageInfo` 已经能读 GIF 的宽高。找一张 GIF（网上随便存一张），跑 `check-image.js`，看它能不能正确报告。如果不能，说明哪里有问题。

**思考：** 为什么动图传给视觉模型通常不是好主意？（提示：模型看的是哪一帧？）

## 练习四：把请求体大小算准

**要求：** 在页面上显示"这次请求的体积约 X KB"，用 `base64.length + JSON 其他字段的估计值`。要求误差在 5% 以内。

**做法：** `JSON.stringify(payload).length` 就是准确值，但那样就没意义了。先用 `base64.length * 1.02` 估，再和实际值对比，算出你的误差。

## 练习五：用自己的话讲

不看课件，回答这四个问题：

```text
为什么模型服务器访问不到 C:\Users\我\a.jpg？
为什么 content 带图时要变成数组，纯文本时不用？
为什么 base64 会让请求体大 33%？这 33% 是怎么算出来的？
为什么这一周不装 sharp？
```

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清"多模态"是什么，不用"AI 能看图"这种话糊弄过去
- [ ] 我能画出"文件 → base64 → data URL → JSON"这条链
- [ ] 我知道 `content` 是数组时，文字也必须包成 `{type:"text"}`
- [ ] 我知道 `image_url` 这个字段名里为什么能放 data URL
- [ ] 我知道 base64 膨胀约 1.33 倍，能口算 2MB 图变成多大

## B. 实操

- [ ] `mm-app` 目录结构完整（`lib` / `routes` / `public` / `scripts` / `data`）
- [ ] `node server.js` 能启动，终端打印"服务已启动"
- [ ] `http://localhost:3000` 能打开上传页面
- [ ] 选图后能看到预览、尺寸、base64 长度
- [ ] 点"开始分析"能拿到回答和 token 用量
- [ ] `node scripts\test-vision.js test.png` 能打印完整消息结构
- [ ] `node scripts\check-image.js 某张图.jpg` 能给出"能不能直接传"的结论

## C. 排错

- [ ] 看到 `expected an array of content parts` 我知道是 content 写成了字符串
- [ ] 看到 `Expected a fully qualified HTTPS URL or a data URL` 我知道是漏了前缀
- [ ] 看到 413 我知道是图太大，不是网络问题
- [ ] 页面报 `Unexpected token '<'` 我知道后端返回了 HTML 而不是 JSON
- [ ] 改了 `mock.js` 没生效，我知道要重启

## D. 笔记

- [ ] `NOTES.md` 里那条消息结构是默写的，不是复制的
- [ ] base64 膨胀那张表填了我自己的实测数字
- [ ] "我还不懂的词"至少写了两个
- [ ] 三个错误的现象我写了真实报错文本

## 本节课要能说出口的一句话

> **模型看不见你的硬盘，所以图片必须先变成 base64，再套上 `data:image/jpeg;base64,` 的外壳，塞进 `content` 数组里——这个数组是它唯一能"看见"图的地方。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Cannot find module 'express'` | 是不是在 `mm-app` 目录 | `cd` 回来，`dir` 看有没有 `node_modules` |
| `EADDRINUSE :::3000` | 端口被占 | 改 `.env` 里 `PORT=3001`，或杀掉占用进程 |
| 页面空白 | `public\index.html` 是否存在 | `dir public` |
| 上传后 400 | 前端有没有 `split(",")` | 打印 `base64.slice(0,20)` |
| 上传后 413 | 图片多大 | `check-image.js` 跑一遍，缩到 1024 |
| 回答是一段 JSON | 你的提问里带了"JSON" | 想听人话就把"JSON"去掉 |
| `npm install` 很慢 | 默认源在国外 | `npm config set registry https://registry.npmmirror.com` |
| `.env` 不生效 | 文件名是不是 `.env.txt` | `dir /a` 看一眼 |
| 改了代码没变化 | 没重启 | `Ctrl + C` 再 `node server.js` |
| 中文全是问号 | 终端编码 | `chcp 65001` 再跑 |
| `fetch failed` | 真模式下网络或地址错 | 先 `curl %OPENAI_BASE_URL%` 看通不通 |
| 图片预览是裂的 | data URL 拼错了 | 页面上 `preview.src` 用的是完整的 data URL，不该出错 |
