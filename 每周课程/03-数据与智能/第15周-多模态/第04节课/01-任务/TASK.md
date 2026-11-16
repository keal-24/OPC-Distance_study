# 第 102 节课：语音转文字

> 这节课结束时，你手上有：`mm-app\lib\audio-info.js`（不装包读音频格式和时长）、`mm-app\lib\transcribe.js`（短音频 + 长音频两条路径，含假实现）、`mm-app\scripts\transcribe-lab.js`（三段音频对照）、`mm-app\out\transcribe-log.md`（识别结果 + 同音字错例表）。

**时间**：约 115 分钟
**前置**：第 101 节课的 `mm-app`（`lib/config.js` 里已有 `STT_MODEL` 和 `UPLOAD_DIR`）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

文字、图片你都能处理了。

**但客户给你的"资料"，有大量是声音：**

```text
一段 40 分钟的会议录音
一段微信语音（3 分钟，转发的）
一段客服电话录音
一段客户口述的需求（他自己录的）
```

**这些内容比图片更难处理：**

| | 图片 | 音频 |
|---|---|---|
| 体积 | 一张 2MB | 40 分钟 mp3 约 40MB |
| 能否一次处理 | 可以 | **不行，接口有时长/体积上限** |
| 有没有时间信息 | 没有 | **有，而且很重要**（谁在第几分钟说了什么） |
| 错误形态 | 字认错，一眼能看出 | **同音字，读起来完全通顺** |

## 0.2 今天这个坑长什么样

> 客户发来一段 52 分钟的会议录音，要你出会议纪要。
>
> 你把整个文件发给转写接口：
>
> ```text
> HTTP 400：audio file too large（上限 25MB）
> ```
>
> 你查了一下，52 分钟 mp3 是 48MB。
>
> 你压成 64kbps，变成 24MB，勉强过。
>
> **转写出来了。你读了第一段：**
>
> ```text
> 那个……我们这个季度的销售目标，在座的要统一一下……
> ```
>
> **"在座的"还是"在做的"？**
>
> 原文说的是"**在做的**要统一一下"（指的是正在做的项目）。
> 转写成了"**在座的**"。
>
> **这句话读起来完全通顺，语法没错，但意思变了。**
>
> 你把它写进了会议纪要，发给了客户。
>
> **客户在会上说："我没说'在座的'，我说的是'在做的项目'。"**

**这就是语音转写的核心风险：**

```text
它的错误不是"乱码"，是"看起来对但意思是别的"
→ 你不会去核实，因为读起来没问题
→ 错误会一路流进最终交付物
```

**而"能看清错在哪"这件事，只有在你手上有原文时才能做到。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 转写（transcription） | 音频 → 文字 | 第 2 步 |
| 时间戳（timestamp） | 每个字/词在音频里的起止时刻 | 第 3 步，做纪要必需 |
| 分段（chunking） | 长音频切短，逐段转写再拼 | 第 3 步 |

**为什么"分段"不是可选的：**

```text
接口有硬上限（常见 25MB / 单次时长上限）
52 分钟的音频必须切
而切的位置很讲究：切在一句话中间，那句话就废了
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `lib\audio-info.js` | `第04节课\03-练习代码\mm-app\` | 不装包，读格式/采样率/时长 |
| `lib\transcribe.js` | 同上 | 短音频 + 长音频两条路径，含假实现 |
| `scripts\make-test-wav.js` | 同上 | 造测试音频 |
| `scripts\probe-audio.js` | 同上 | 打印音频信息 |
| `scripts\transcribe-lab.js` | 同上 | 三段音频对照 |
| `out\transcribe-log.md` | 同上 `out\` | 结果 + 同音字错例表 |
| `NOTES.md` | `第04节课\02-笔记\` | 第 6 步填 |

---

# 第 1 步：先弄清音频文件本身（25 分钟）

## 1.1 做什么 / 为什么

**做什么：** 写 `audioInfo()`，不装任何包，从文件头读出格式、采样率、声道、时长。

**为什么先做这件事：**

因为**你必须知道"这段音频到底多长、多大"，才能决定怎么处理。**

```text
不知道时长 → 不知道要不要分段
不知道格式 → 不知道接口收不收
不知道码率 → 算不出体积和成本
```

**而且这件事和第 12 周的"格式探测"是同一个技能**，只是文件类型变了。**你已经会一次，这是第二次用同一套思路。**

## 1.2 三种格式的文件头

| 格式 | 开头（hex） | 关键信息在哪 |
|---|---|---|
| **WAV** | `52 49 46 46`（`RIFF`） | 偏移 22 声道、24 采样率、28 byteRate、34 位深 |
| **MP3** | `49 44 33`（`ID3`）或 `FF FB` | 帧头里；**时长要算，不能直接读** |
| **M4A** | `00 00 00 xx 66 74 79 70`（`ftyp`） | 要解析 MP4 box，比较复杂 |

**为什么 MP3 的时长"要算"：**

```text
MP3 没有"总时长"这个字段
它是一帧一帧的，每帧固定采样数
总时长 = 帧数 × 每帧采样数 / 采样率

要算帧数，得扫全文件 → 对大文件很慢
→ 所以很多工具改用"文件大小 / 比特率"估算
→ 估出来的时长有 2–5% 误差（VBR 文件更大）
```

**这个误差在你这里可以接受。** 你只需要知道"大概 50 分钟"，不需要精确到秒。

## 1.3 操作

**1.** 进项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第15周-多模态\第04节课\03-练习代码"
xcopy /E /I /Y "..\第03节课\03-练习代码\mm-app" mm-app
cd mm-app
```

**2.** 新建 `lib\audio-info.js`：

```javascript
// audio-info.js —— 从文件头读音频的格式、采样率、声道、时长
// 不装任何包。够用就行，不追求解析所有变体。
const fs = require("node:fs");
const path = require("node:path");

function readBytes(file, offset, len) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, offset);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function detectFormat(file) {
  const head = readBytes(file, 0, 12);

  if (head.length >= 4 && head.subarray(0, 4).toString("ascii") === "RIFF") {
    const wave = head.length >= 12 ? head.subarray(8, 12).toString("ascii") : "";
    return wave === "WAVE" ? "wav" : "riff-other";
  }

  if (head.length >= 3 && head.subarray(0, 3).toString("ascii") === "ID3") return "mp3";
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";

  if (head.length >= 8 && head.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = head.subarray(8, 12).toString("ascii");
    if (brand.indexOf("M4A") === 0 || brand.indexOf("mp42") === 0) return "m4a";
    return "mp4";
  }

  if (head.length >= 4 && head.subarray(0, 4).toString("ascii") === "OggS") return "ogg";
  if (head.length >= 4 && head.subarray(0, 4).toString("ascii") === "fLaC") return "flac";

  return "unknown";
}

// WAV 的 fmt 块从文件偏移 20 开始，共 16 字节：
//   fmt[0..1]   audioFormat
//   fmt[2..3]   channels
//   fmt[4..7]   sampleRate
//   fmt[8..11]  byteRate      ← 算时长用它
//   fmt[12..13] blockAlign
//   fmt[14..15] bitsPerSample
function wavInfo(file) {
  const fmt = readBytes(file, 20, 16);
  if (fmt.length < 16) return null;

  return {
    audioFormat: fmt.readUInt16LE(0),
    channels: fmt.readUInt16LE(2),
    sampleRate: fmt.readUInt32LE(4),
    byteRate: fmt.readUInt32LE(8),
    bitsPerSample: fmt.readUInt16LE(14),
  };
}

function estimateByBitrate(file, bytesPerSec) {
  return fs.statSync(file).size / bytesPerSec;
}

function audioInfo(file) {
  const stat = fs.statSync(file);
  const format = detectFormat(file);

  const out = {
    file: path.basename(file),
    format: format,
    bytes: stat.size,
    mb: Number((stat.size / 1024 / 1024).toFixed(2)),
    durationSec: null,
    durationText: null,
    sampleRate: null,
    channels: null,
    bitsPerSample: null,
    note: "",
  };

  if (format === "wav") {
    const w = wavInfo(file);
    if (w !== null) {
      out.sampleRate = w.sampleRate;
      out.channels = w.channels;
      out.bitsPerSample = w.bitsPerSample;
      if (w.byteRate > 0) {
        // 44 是标准 WAV 头长度；有些文件头更长，所以这是个近似值
        out.durationSec = Math.max(0, (stat.size - 44) / w.byteRate);
      }
      out.note = "WAV 头里直接读到采样率和 byteRate，时长是算出来的";
    }
  } else if (format === "mp3") {
    // 128kbps = 16000 字节/秒。VBR 文件误差更大，所以标注"估算"
    out.durationSec = estimateByBitrate(file, 16000);
    out.note = "MP3 无总时长字段，按 128kbps 估算（VBR 文件误差更大）";
  } else if (format === "m4a" || format === "mp4") {
    out.durationSec = estimateByBitrate(file, 16000);
    out.note = "M4A 需解析 MP4 box 才能精确，此处按 128kbps 估算";
  }

  if (out.durationSec !== null) {
    const total = Math.round(out.durationSec);
    const m = Math.floor(total / 60);
    const r = total % 60;
    out.durationText = m + " 分 " + r + " 秒";
  }

  return out;
}

module.exports = { audioInfo, detectFormat };
```

**3.** 新建 `scripts\make-test-wav.js`，造一段**能算得清时长**的测试音频：

```javascript
// make-test-wav.js —— 生成指定时长的 WAV（440Hz 正弦波）
// 用法：node scripts\make-test-wav.js [秒数] [采样率]
const fs = require("node:fs");
const path = require("node:path");
const config = require("../lib/config");

function makeWav(seconds, sampleRate) {
  const channels = 1;
  const bits = 16;
  const numSamples = Math.floor(seconds * sampleRate);
  const dataSize = numSamples * channels * (bits / 8);

  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);                                  // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * (bits / 8), 28);  // byteRate
  buf.writeUInt16LE(channels * (bits / 8), 32);               // blockAlign
  buf.writeUInt16LE(bits, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i += 1) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
    buf.writeInt16LE(v, 44 + i * 2);
  }

  return buf;
}

const seconds = process.argv[2] === undefined ? 3 : Number(process.argv[2]);
const sampleRate = process.argv[3] === undefined ? 16000 : Number(process.argv[3]);

const out = path.join(config.UPLOAD_DIR, "beep-" + seconds + "s.wav");
fs.writeFileSync(out, makeWav(seconds, sampleRate));

const size = fs.statSync(out).size;
console.log("已生成：" + out);
console.log("大小  ：" + size + " 字节");
console.log("理论值：" + (44 + seconds * sampleRate * 2) + " 字节（44 + 秒数 × 采样率 × 2）");
```

```text
node scripts\make-test-wav.js 3 16000
```

**4.** 新建 `scripts\probe-audio.js`：

```javascript
// probe-audio.js —— 打印音频信息
// 用法：node scripts\probe-audio.js <文件1> [文件2] ...
const { audioInfo } = require("../lib/audio-info");

const files = process.argv.slice(2);
if (files.length === 0) {
  console.log("用法：node scripts\\probe-audio.js <文件1> [文件2] ...");
  process.exitCode = 1;
} else {
  for (const f of files) {
    const i = audioInfo(f);
    console.log("");
    console.log("=== " + i.file + " ===");
    console.log("  格式    ：" + i.format);
    console.log("  大小    ：" + i.bytes + " 字节（" + i.mb + " MB）");
    console.log("  时长    ：" + (i.durationText === null ? "未知" : i.durationText));
    console.log("  采样率  ：" + (i.sampleRate === null ? "未知" : i.sampleRate + " Hz"));
    console.log("  声道    ：" + (i.channels === null ? "未知" : i.channels));
    console.log("  位深    ：" + (i.bitsPerSample === null ? "未知" : i.bitsPerSample + " bit"));
    console.log("  说明    ：" + i.note);
  }
}
```

```text
node scripts\probe-audio.js data\uploads\beep-3s.wav
```

## 1.4 屏幕上应该看到什么

```text
>node scripts\make-test-wav.js 3 16000
已生成：B:\...\mm-app\data\uploads\beep-3s.wav
大小  ：96044 字节
理论值：96044 字节（44 + 秒数 × 采样率 × 2）

>node scripts\probe-audio.js data\uploads\beep-3s.wav

=== beep-3s.wav ===
  格式    ：wav
  大小    ：96044 字节（0.09 MB）
  时长    ：0 分 3 秒
  采样率  ：16000 Hz
  声道    ：1
  位深    ：16 bit
  说明    ：WAV 头里直接读到采样率和 byteRate，时长是算出来的
```

**"大小"和"理论值"必须相等，都是 `96044`。**

**把这个数算清，你才算真的懂 WAV：**

```text
44                 WAV 头
+ 3 × 16000 × 2    秒数 × 采样率 × (16bit / 8)
= 44 + 96000
= 96044            ✓
```

**再反推时长，这就是 `audioInfo` 做的事：**

```text
byteRate = 采样率 × 声道 × (位深 / 8) = 16000 × 1 × 2 = 32000 字节/秒
时长     = (96044 - 44) / 32000 = 96000 / 32000 = 3.0 秒   ✓
```

**这三个数字你必须能自己算出来。** 因为**接口的收费和时长上限都按秒/分钟算，算不出时长就没法在开工前报价。**

**顺手验证一下"位深翻倍会怎样"：**

```text
如果位深是 32bit：
  byteRate = 16000 × 1 × 4 = 64000
  3 秒的音频 = 44 + 192000 = 192044 字节（翻倍）

→ 同样的时长，体积翻倍
→ 上传时间和接口费用都可能变
```

**这就是为什么"采样率和位深"不是无关参数。**

## 1.5 换成真人语音

上面那个是正弦波，**转写出来会是空的**（不是人说话）。

**必须准备至少一段真人语音。三个来源，选一个：**

```text
① Windows 录音机：开始菜单搜"录音机"，录一段存成 m4a
② 手机语音备忘录：录一段，通过微信文件传输助手传到电脑
③ 实在没有：先用 MOCK 跑通流程，等手边有手机时补
```

**录什么内容会直接决定你能不能发现同音字错误。用下面这句（三个陷阱）：**

```text
"这个季度在做的项目要统一一下进度，在座的各位下周把数据报给财务。"
```

**这句话里：**

```text
"在做的" vs "在座的"   ← 高度同音，转写极易出错
"进度"   vs "近度"     ← 中等风险
"财务"   vs "才务"     ← 低风险，但可能
```

**这就是你的"标准答案"。** **你手上有原文，才能算准确率。**

**把这三段准备好，放进 `data\uploads\`：**

```text
data\uploads\
├── beep-3s.wav        ← 脚本生成，正弦波，转写应为空
└── meeting-10s.m4a    ← 你自己录的真人语音（文件名随意）
```

## 1.6 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `unknown` 格式 | 文件头不在这几种里 | 用 `certutil -dump` 看前 16 字节 |
| 时长是 `0 分 0 秒` | WAV 头不是标准 44 字节 | 有些软件写 78 字节头，误差可接受 |
| 时长差很多 | MP3 的比特率不是 128kbps | 正常，估算会差 2–5% |
| `ENOENT` | 路径错 | 用相对路径，在 `mm-app` 里跑 |
| 采样率显示成 0 | `fmt` 块偏移不同 | 打印前 40 字节 hex 看结构 |

---

# 第 2 步：短音频，一次转完（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `transcribe()`，`MOCK=true` 时返回预设的假转写结果。

**为什么假实现要预置"带同音字错误"的文本：**

因为**你要练的是"发现错误"，不是"拿到正确文本"。**

```text
假实现如果返回完美文本 → 你练不到任何东西
假实现返回带错误的文本 → 你能练：怎么找错、怎么标、怎么跟客户说
```

**这是"假数据要模拟真实缺陷"的原则。** 和第 101 节"假图颜色各异"是同一个思路。

## 2.2 操作

**1.** 在 `.env` 里加：

```text
# 语音识别
STT_MODEL=
# 单次最大上传字节（不同服务不同，常见 25MB）
STT_MAX_BYTES=26214400
# 单次最大时长（秒），超过就要分段
STT_MAX_SECONDS=600
```

**2.** 新建 `lib\transcribe.js`：

```javascript
// transcribe.js —— 音频转文字。MOCK=true 时返回预设结果（故意带同音字错误）。
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const { audioInfo } = require("./audio-info");

// 假结果。故意混进真实场景里最常见的三类错误：
//   ① 同音字（在做的 → 在座的）
//   ② 数字单位（40 分钟 → 40 分）
//   ③ 人名/专有名词（改成读音相近的常见字）
const MOCK_RESULTS = {
  long: {
    text:
      "那个我们这个季度的销售目标，在座的要统一一下。上周的数据我看了一下，" +
      "华东区差了两个点，华南区超了一点五。这个月我们要把重点放在老客户的复购上。" +
      "另外那个新系统上线的时间，技术那边说要往后推一周，推到下个月十号。" +
      "大家有什么问题现在提。",
    duration: 52.3,
  },
  short: {
    text: "这个季度在做的项目要统一一下进度，在座的各位下周把数据报给财务。",
    duration: 10.4,
  },
  empty: {
    text: "",
    duration: 3.0,
  },
};

function mockTranscribe(info) {
  // 按文件大小猜是长音频还是短音频
  const key = info.durationSec !== null && info.durationSec > 60
    ? "long"
    : info.bytes < 200000
      ? "empty"
      : "short";
  const r = MOCK_RESULTS[key];

  return {
    ok: true,
    mock: true,
    text: r.text,
    durationSec: info.durationSec === null ? r.duration : info.durationSec,
    language: "zh",
    segments: splitToSegments(r.text, r.duration),
    note: "假实现（" + key + "），故意含同音字错误",
  };
}

// 把一段文字按句号切成"伪时间戳段落"
// 真实接口会返回每段的起止时间，这里按字数比例分配
function splitToSegments(text, totalSec) {
  if (text.length === 0) return [];
  const sentences = text.split(/(?<=[。！？])/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return [];

  const totalChars = sentences.reduce((n, s) => n + s.length, 0);
  const out = [];
  let cursor = 0;

  for (const s of sentences) {
    const dur = (s.length / totalChars) * totalSec;
    out.push({
      start: Number(cursor.toFixed(2)),
      end: Number((cursor + dur).toFixed(2)),
      text: s.trim(),
    });
    cursor += dur;
  }

  return out;
}

// ---------- 短音频：一次请求 ----------
async function transcribeShort(file, options) {
  const opts = options === undefined ? {} : options;
  const info = audioInfo(file);

  if (config.MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    return mockTranscribe(info);
  }

  if (!config.STT_MODEL) {
    throw new Error("没有配置 STT_MODEL：在 .env 里填你账号可用的语音识别模型名，或保持 MOCK=true");
  }

  // 注意：语音识别端点通常是 multipart/form-data，不是 JSON。
  // 这是它和 chat / embeddings / images 最大的不同。
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append("file", new Blob([buf]), path.basename(file));
  form.append("model", config.STT_MODEL);
  form.append("language", opts.language || "zh");
  form.append("response_format", "verbose_json");

  const res = await fetch(config.BASE_URL + "/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + config.API_KEY },
    body: form,
    signal: AbortSignal.timeout(opts.timeoutMs || config.STT_TIMEOUT || 120000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("转写接口失败 HTTP " + res.status + "：" + body.slice(0, 300));
  }

  const json = await res.json();

  if (typeof json.text !== "string") {
    throw new Error("返回里没有 text 字段：" + JSON.stringify(json).slice(0, 300));
  }

  // verbose_json 会带 segments；json 只有 text
  const segments = Array.isArray(json.segments)
    ? json.segments.map((s) => ({
        start: Number(s.start),
        end: Number(s.end),
        text: String(s.text).trim(),
      }))
    : splitToSegments(json.text, json.duration || 0);

  return {
    ok: true,
    mock: false,
    text: json.text,
    durationSec: json.duration === undefined ? null : json.duration,
    language: json.language || (opts.language || "zh"),
    segments: segments,
    note: "真实接口，" + (Array.isArray(json.segments) ? "带 segments" : "无 segments，按字数均分"),
  };
}

module.exports = { transcribeShort, splitToSegments, MOCK_RESULTS };
```

**3.** 新建 `scripts\probe-transcribe.js`：

```javascript
// probe-transcribe.js —— 转一段音频，打印全文和分段
// 用法：node scripts\probe-transcribe.js data\uploads\meeting-10s.m4a
const { transcribeShort } = require("../lib/transcribe");
const config = require("../lib/config");

async function main() {
  const file = process.argv[2];
  if (file === undefined) {
    console.log("用法：node scripts\\probe-transcribe.js <音频文件>");
    console.log("      例：node scripts\\probe-transcribe.js data\\uploads\\meeting-10s.m4a");
    process.exitCode = 1;
    return;
  }

  console.log("模式：" + (config.MOCK ? "MOCK" : "真实 / " + config.STT_MODEL));
  console.log("文件：" + file);
  console.log("");

  const t0 = Date.now();
  const r = await transcribeShort(file);

  console.log("耗时    ：" + (Date.now() - t0) + " ms");
  console.log("时长    ：" + (r.durationSec === null ? "未知" : r.durationSec.toFixed(1) + " 秒"));
  console.log("语言    ：" + r.language);
  console.log("分段数  ：" + r.segments.length);
  console.log("说明    ：" + r.note);
  console.log("");
  console.log("=== 全文 ===");
  console.log(r.text.length === 0 ? "（空）" : r.text);
  console.log("");
  console.log("=== 分段 ===");
  for (const s of r.segments) {
    console.log(
      "  " + s.start.toFixed(1).padStart(6) + "s - " + s.end.toFixed(1).padStart(6) + "s  " + s.text
    );
  }
}

main().catch((err) => {
  console.error("失败：" + err.message);
  process.exitCode = 1;
});
```

**4.** 跑：

```text
node scripts\probe-transcribe.js data\uploads\beep-3s.wav
```

## 2.3 屏幕上应该看到什么

```text
>node scripts\probe-transcribe.js data\uploads\beep-3s.wav
模式：MOCK
文件：data\uploads\beep-3s.wav

耗时    ：312 ms
时长    ：3.0 秒
语言    ：zh
分段数  ：0
说明    ：假实现（empty），故意含同音字错误

=== 全文 ===
（空）

=== 分段 ===
```

**空结果是对的** —— 正弦波里没有人说话。**这一条验证了"转写不出内容时要能返回空，而不是报错"。**

再看长音频（用假的长音频结果）：

```text
>node scripts\probe-transcribe.js data\uploads\long-fake.mp3
模式：MOCK
文件：data\uploads\long-fake.mp3

耗时    ：305 ms
时长    ：52.3 秒
语言    ：zh
分段数  ：5
说明    ：假实现（long），故意含同音字错误

=== 全文 ===
那个我们这个季度的销售目标，在座的要统一一下。上周的数据我看了一下，华东区差了两个点，华南区超了一点五。这个月我们要把重点放在老客户的复购上。另外那个新系统上线的时间，技术那边说要往后推一周，推到下个月十号。大家有什么问题现在提。

=== 分段 ===
     0.0s -   9.1s  那个我们这个季度的销售目标，在座的要统一一下。
     9.1s -  20.0s  上周的数据我看了一下，华东区差了两个点，华南区超了一点五。
    20.0s -  33.0s  这个月我们要把重点放在老客户的复购上。
    33.0s -  46.4s  另外那个新系统上线的时间，技术那边说要往后推一周，推到下个月十号。
    46.4s -  52.3s  大家有什么问题现在提。
```

**现在做这一节最重要的一件事：逐字对照，找出错误。**

**假答案里我故意放了四处：**

| 转写出来的 | 应该是 | 类型 |
|---|---|---|
| 在座**的**要统一一下 | 在**做**的（指正在做的项目） | 同音字 |
| 华**东**区差了两个点 | 原文可能是"华**南**"（谁也不知道，因为没原文） | 无法判断 |
| 差了两个点 | "2 个百分点" 还是 "两个点"？ | 单位/量词 |
| 推到下个月十号 | 可能是"10 号" | 数字写法 |

**注意第二行 —— 我故意让它"无法判断"。**

**真实场景里，最多的就是这种：**

```text
你不确定原文是什么
→ 你既不能改（可能改错），也不能不改（可能错着交付）
→ 唯一正确的做法是"标注出来，让人确认"
```

**这就是"标注"这个动作的价值。** 它不是"我不行"，它是**"这部分需要人"**。

**现在的关键认知：**

```text
转写文本不是"成品"，是"待校对稿"
→ 你交付的时候必须说清"这是机器转的，这几处需要确认"
→ 不说清，客户会当成定稿用
```

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `HTTP 400 file too large` | 超过上限 | 走第 3 节的分段 |
| `HTTP 400 unsupported format` | 格式不收 | 转成 mp3 或 wav |
| `FormData is not defined` | Node 低于 18 | 升级 Node |
| `返回里没有 text` | 服务返回结构不同 | 打印完整 JSON |
| 分段数 0 但 text 不为空 | `segments` 不存在且 `duration` 是 0 | 检查 `json.duration` |
| 中文乱码 | cmd 编码 | `chcp 65001` |

## 2.5 一个重要区别：语音接口用 multipart，不是 JSON

**这是本课程里唯一一个不用 JSON body 的接口：**

| 接口 | body 格式 |
|---|---|
| chat/completions | JSON |
| embeddings | JSON |
| images/generations | JSON |
| **audio/transcriptions** | **multipart/form-data** |

**为什么？** 因为音频是二进制文件，用 base64 塞进 JSON 会膨胀 33%，而且大文件会撑爆内存。

```javascript
// 正确：用 FormData
const form = new FormData();
form.append("file", new Blob([buf]), "audio.mp3");
form.append("model", config.STT_MODEL);

// 不要手写 Content-Type！
// fetch 会自动加 boundary，手写会丢掉 boundary → 服务端解析失败
```

**最后那一条是最容易犯的错：**

```javascript
// 错误写法
headers: {
  "Content-Type": "multipart/form-data",   // ← 缺 boundary，必失败
  Authorization: "Bearer " + key,
}

// 正确写法：只给 Authorization，让 fetch 自己设 Content-Type
headers: {
  Authorization: "Bearer " + key,
}
```

**这个错误的表现是"服务端说没有 file 字段"，而你的 FormData 里明明有。** 排查起来很花时间。

---

# 第 3 步：长音频，必须分段（30 分钟）

## 3.1 做什么 / 为什么

**做什么：** 写 `transcribeLong()`，把长音频按时间切段，逐段转写再拼起来。

**为什么必须分段：**

```text
接口上限（典型）：25MB 或 单次 10 分钟
52 分钟的 mp3（128kbps）≈ 48MB → 体积超、时长也超
```

**但分段的核心难点不是"切"，是三件事：**

| 难点 | 为什么难 | 今天怎么解决 |
|---|---|---|
| **怎么切** | 切在一句话中间，那句话两半都废了 | 按固定时长切，接受边界损失，记录位置 |
| **怎么拼** | 每段的 `start` 都从 0 开始，拼起来时间全错 | 加偏移量 |
| **怎么不丢** | 某一段失败，整份就缺一块 | 记录每段成败，失败的单独重试 |

## 3.2 一个必须承认的限制

**我们的 Node 代码没有音频解码能力，也没有 ffmpeg。**

```text
要"精确切在静音处"，必须先解码 PCM，找能量低谷
→ 需要解码器或 ffmpeg
→ 本课程不装

所以今天的做法是：按字节切
```

**按字节切会产生什么：**

```text
切点落在 MP3 的某一帧中间
→ 那一段的开头会有一小段"怪音"
→ 转写结果里那一段开头可能是乱码或几个错字

→ 这是真实代价，必须承认，不能说"我们这个方案没问题"
```

**生产环境的做法（第 6 阶段会讲）：**

```text
① 用 ffmpeg 按时间切（-ss / -t），它会自动对齐到帧边界
② 或者用"按静音检测切"（ffmpeg 的 silencedetect）
③ 或者干脆把整段音频先转成标准 WAV，再切
```

**今天我们用 WAV 做分段演示** —— 因为 WAV 是定长采样，按字节切 = 按时间切，没有帧对齐问题。

**这就是为什么第 1 节要造 WAV 测试文件。**

## 3.3 操作

在 `lib\transcribe.js` 里追加：

```javascript
// ---------- 长音频：按字节切，逐段转写 ----------
// 为什么按字节切：Node 没有音频解码能力，不能按时间精确切。
// WAV 是定长采样，按字节切 = 按时间切。
// MP3/M4A 按字节切会切在帧中间，那一段开头会有怪音 —— 这是真实代价。
function splitWavBuffer(buf, maxBytesPerChunk) {
  // WAV 头是前 44 字节，必须每段都带上，否则不是合法 WAV
  const header = buf.subarray(0, 44);
  const data = buf.subarray(44);

  const chunks = [];
  let offset = 0;

  while (offset < data.length) {
    const end = Math.min(offset + maxBytesPerChunk, data.length);
    const body = data.subarray(offset, end);

    // 重写这一段自己的头：RIFF 长度和 data 长度都要改
    const h = Buffer.from(header);
    h.writeUInt32LE(36 + body.length, 4);
    h.writeUInt32LE(body.length, 40);

    chunks.push({
      index: chunks.length,
      offsetBytes: offset,
      buf: Buffer.concat([h, body]),
    });

    offset = end;
  }

  return chunks;
}

async function transcribeLong(file, options) {
  const opts = options === undefined ? {} : options;
  const info = audioInfo(file);

  // 单段最大字节：默认 20MB（留 5MB 余量给 25MB 上限）
  const maxBytes = Number(process.env.STT_CHUNK_BYTES || 20 * 1024 * 1024);
  const maxSeconds = Number(process.env.STT_MAX_SECONDS || 600);

  // 判断要不要分段
  const needSplit = info.bytes > maxBytes ||
    (info.durationSec !== null && info.durationSec > maxSeconds);

  if (!needSplit) {
    const r = await transcribeShort(file, opts);
    return {
      ...r,
      parts: 1,
      failedParts: [],
      note: r.note + "（未分段）",
    };
  }

  if (config.MOCK) {
    // 假实现：直接返回长音频的假结果，但模拟"分了 6 段"
    await new Promise((r) => setTimeout(r, 600));
    const base = mockTranscribe({ ...info, durationSec: 3200 });
    const segs = splitToSegments(base.text, 3200);
    return {
      ...base,
      durationSec: info.durationSec,
      segments: segs,
      parts: 6,
      failedParts: [4],
      note: "假实现（long，分 6 段，第 4 段故意失败）",
      warnings: [
        "第 4 段（1600s–2133s）转写失败，该段内容缺失",
        "分段按字节切，MP3/M4A 会在段首出现怪音",
      ],
    };
  }

  if (info.format !== "wav") {
    throw new Error(
      "按字节分段只支持 WAV（定长采样）。当前格式：" + info.format +
      "。生产环境请用 ffmpeg 按时间切，见课件第 3.2 节。"
    );
  }

  const buf = fs.readFileSync(file);
  const pieces = splitWavBuffer(buf, maxBytes);

  console.log("分 " + pieces.length + " 段，每段约 " + Math.round(maxBytes / 32000) + " 秒");

  const failedParts = [];
  const allSegments = [];
  const texts = [];
  let cursorSec = 0;

  for (const p of pieces) {
    const tmp = path.join(config.UPLOAD_DIR, "chunk-" + p.index + ".wav");
    fs.writeFileSync(tmp, p.buf);

    // 这一段的理论时长（WAV 定长采样，可以精确算）
    const pieceSec = (p.buf.length - 44) / (info.sampleRate * (info.bitsPerSample / 8) * (info.channels || 1));

    try {
      const r = await transcribeShort(tmp, opts);
      texts.push(r.text);
      // 关键：把每段的相对时间加上偏移，变成全局时间
      for (const s of r.segments) {
        allSegments.push({
          start: Number((cursorSec + s.start).toFixed(2)),
          end: Number((cursorSec + s.end).toFixed(2)),
          text: s.text,
          part: p.index,
        });
      }
      console.log("  第 " + p.index + " 段 ok：" + r.text.length + " 字");
    } catch (err) {
      failedParts.push({ index: p.index, start: cursorSec, error: err.message });
      console.log("  第 " + p.index + " 段失败：" + err.message);
    } finally {
      fs.unlinkSync(tmp);
    }

    cursorSec += pieceSec;
  }

  return {
    ok: failedParts.length === 0,
    mock: false,
    text: texts.join(""),
    durationSec: info.durationSec,
    language: opts.language || "zh",
    segments: allSegments,
    parts: pieces.length,
    failedParts: failedParts,
    note: "真实接口，分 " + pieces.length + " 段",
    warnings: failedParts.length === 0
      ? []
      : failedParts.map((f) => "第 " + f.index + " 段（" + Math.round(f.start) + "s 起）失败：" + f.error),
  };
}

module.exports = { transcribeShort, transcribeLong, splitToSegments, splitWavBuffer, MOCK_RESULTS };
```

**注意 `splitWavBuffer` 里的两个重写：**

```javascript
h.writeUInt32LE(36 + body.length, 4);   // RIFF 块长度 = 36 + 数据长度
h.writeUInt32LE(body.length, 40);       // data 块长度
```

**如果不改这两个值会怎样：**

```text
每段都声称"我有原始文件那么大"
→ 解码器读到声明长度，但实际数据不够
→ 有的播放器报错，有的静默截断
→ 转写接口可能返回空，也可能报"文件损坏"
```

**这是二进制格式的通用规则：头里的长度字段必须和实际数据一致。**

## 3.4 屏幕上应该看到什么

MOCK 模式（长音频）：

```text
>node scripts\probe-transcribe.js data\uploads\long-fake.mp3
模式：MOCK
文件：data\uploads\long-fake.mp3

耗时    ：612 ms
时长    ：3200.0 秒
语言    ：zh
分段数  ：5
说明    ：假实现（long，分 6 段，第 4 段故意失败）

=== 全文 ===
那个我们这个季度的销售目标，在座的要统一一下。…

=== 分段 ===
     0.0s -  557.0s  那个我们这个季度的销售目标，在座的要统一一下。
   557.0s - 1230.6s  上周的数据我看了一下，华东区差了两个点，华南区超了一点五。
...
```

**注意"说明"里那句"第 4 段故意失败"。**

**这是假实现的第三个职责：模拟失败。**

```text
假实现如果永远成功 → 你写不出"失败怎么办"的代码
假实现要能模拟：
  ① 部分失败（某一段挂了）
  ② 全部失败（服务不可用）
  ③ 返回结构异常（不是 JSON）
```

**这一条和第 3 节讲的"六种多模态错误"是同一个思路的提前演练。**

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `按字节分段只支持 WAV` | 传了 mp3 | 这是刻意的限制。先转 wav，或用 ffmpeg |
| 分段后时间戳全错 | 没加 `cursorSec` 偏移 | 每段都要加前面的累计时长 |
| 段首有怪音 | MP3 帧被切断 | 已限制只支持 WAV |
| 某段失败后整份没结果 | 你没收集 `failedParts` | 失败也要继续下一段 |
| `ENOENT chunk-0.wav` | `UPLOAD_DIR` 不存在 | `config.js` 已建 |
| 分段数特别多 | `STT_CHUNK_BYTES` 太小 | 按服务上限的 80% 设 |

---

# 第 4 步：做同音字错例表（20 分钟）

## 4.1 做什么 / 为什么

**做什么：** 把转写结果和原文逐句对照，做成一张"错例表"。

**为什么这张表比代码重要：**

```text
代码部分：所有 RAG / 多模态项目都差不多
错例表：只属于你的场景、你的语料、你的客户

→ 代码可以交给别人写
→ 错例表必须你自己积累
```

**而且这张表直接决定你和客户的对话：**

```text
没有表：客户问"准确率多少"，你说"挺准的"
有表：  "52 分钟录音，我对照原文核了 380 句，
        32 处需要人工确认，其中 18 处是同音字。
        这 18 处如果直接改成我猜的，有 5 处我猜错了方向。"
```

## 4.2 操作

新建 `scripts\error-table.js`：

```javascript
// error-table.js —— 转写结果和原文对照，产出错例表
// 用法：
//   1. 把原文存到 out\source.txt（一句一行）
//   2. 跑本脚本，生成 out\error-table.md
const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(__dirname, "..", "out");
const srcPath = path.join(outDir, "source.txt");
const asrPath = path.join(outDir, "asr.txt");
const tablePath = path.join(outDir, "error-table.md");

if (!fs.existsSync(srcPath) || !fs.existsSync(asrPath)) {
  console.error("缺少文件：");
  console.error("  " + srcPath + "   （原文，一句一行）");
  console.error("  " + asrPath + "   （转写结果，一句一行）");
  console.error("");
  console.error("先把这两个文件准备好，再跑本脚本。");
  process.exitCode = 1;
  return;
}

const src = fs.readFileSync(srcPath, "utf8").split(/\r?\n/).filter((s) => s.trim().length > 0);
const asr = fs.readFileSync(asrPath, "utf8").split(/\r?\n/).filter((s) => s.trim().length > 0);

if (src.length !== asr.length) {
  console.warn("警告：原文 " + src.length + " 行，转写 " + asr.length + " 行，对不齐就按较短的对");
}

const n = Math.min(src.length, asr.length);
const rows = [];

for (let i = 0; i < n; i += 1) {
  const a = src[i].trim();
  const b = asr[i].trim();
  // 逐字比对，找出不同的位置
  let diffs = [];
  const len = Math.max(a.length, b.length);
  for (let k = 0; k < len; k += 1) {
    if (a[k] !== b[k]) {
      diffs.push({
        pos: k,
        src: a[k] === undefined ? "（无）" : a[k],
        asr: b[k] === undefined ? "（无）" : b[k],
      });
    }
  }
  rows.push({
    line: i + 1,
    src: a,
    asr: b,
    same: diffs.length === 0,
    diffCount: diffs.length,
    diffs: diffs.slice(0, 6),
  });
}

const bad = rows.filter((r) => r.same === false);
const totalChars = src.reduce((s, x) => s + x.length, 0);
const diffChars = bad.reduce((s, r) => s + r.diffCount, 0);

const L = [];
L.push("# 转写错例表");
L.push("");
L.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
L.push("");
L.push("## 一、汇总");
L.push("");
L.push("| 指标 | 数值 |");
L.push("|---|---|");
L.push("| 对照句数 | " + n + " |");
L.push("| 有差异的句子 | " + bad.length + " |");
L.push("| 句子级准确率 | " + ((1 - bad.length / n) * 100).toFixed(1) + "% |");
L.push("| 原文字数（合计） | " + totalChars + " |");
L.push("| 差异字数 | " + diffChars + " |");
L.push("| 字级准确率 | " + ((1 - diffChars / totalChars) * 100).toFixed(1) + "% |");
L.push("");
L.push("> **注意：字级准确率高不代表能用。** 90% 的字对，但错的那 10% 全是关键数字和否定词，");
L.push("> 整句话的意思就是个反的。要看「错在什么位置」，不是「错了多少」。");
L.push("");

L.push("## 二、差异明细");
L.push("");
L.push("| 行 | 原文 | 转写 | 差异数 | 差异位置 |");
L.push("|---|---|---|---|---|");
for (const r of bad) {
  const d = r.diffs.map((x) => "第" + (x.pos + 1) + "字：" + x.src + "→" + x.asr).join("；");
  L.push("| " + r.line + " | " + r.src.replace(/\|/g, "\\|") + " | " + r.asr.replace(/\|/g, "\\|") +
    " | " + r.diffCount + " | " + d.replace(/\|/g, "\\|") + " |");
}
L.push("");

L.push("## 三、错误分类");
L.push("");
L.push("（这一节由你手工填。脚本能找出差异，但分不出「同音字」和「真听错」）");
L.push("");
L.push("| 类型 | 例数 | 例子 | 能不能机改 |");
L.push("|---|---|---|---|");
L.push("| 同音字 | | | 不能，必须人判断 |");
L.push("| 数字/单位 | | | 不能，必须对照材料 |");
L.push("| 人名/专有名词 | | | 不能，必须查名单 |");
L.push("| 断句/标点 | | | 能，规则可修 |");
L.push("| 漏字/多字 | | | 部分能 |");
L.push("");

fs.writeFileSync(tablePath, L.join("\n"), "utf8");
console.log("已写入：" + tablePath);
console.log("对照 " + n + " 句，有差异 " + bad.length + " 句，差异 " + diffChars + " 字");
```

**准备两个输入文件。你手上有原文的那句话，可以这样测：**

`out\source.txt`：

```text
这个季度在做的项目要统一一下进度，在座的各位下周把数据报给财务。
```

`out\asr.txt`：

```text
这个季度在座的的项目要统一一下近度，在座的各位下周把数据报给才务。
```

（第二行是故意改错的，模拟转写错误）

```text
node scripts\error-table.js
```

## 4.3 屏幕上应该看到什么

```text
>node scripts\error-table.js
已写入：B:\...\mm-app\out\error-table.md
对照 1 句，有差异 1 句，差异 4 字
```

`out\error-table.md`：

```markdown
# 转写错例表

生成时间：2026/11/16 19:42:10

## 一、汇总

| 指标 | 数值 |
|---|---|
| 对照句数 | 1 |
| 有差异的句子 | 1 |
| 句子级准确率 | 0.0% |
| 原文字数（合计） | 33 |
| 差异字数 | 4 |
| 字级准确率 | 87.9% |

> **注意：字级准确率高不代表能用。** 90% 的字对，但错的那 10% 全是关键数字和否定词，
> 整句话的意思就是个反的。要看「错在什么位置」，不是「错了多少」。

## 二、差异明细

| 行 | 原文 | 转写 | 差异数 | 差异位置 |
|---|---|---|---|---|
| 1 | 这个季度在做的项目要统一一下进度，在座的各位下周把数据报给财务。 | 这个季度在座的的项目要统一一下近度，在座的各位下周把数据报给才务。 | 4 | 第7字：做→的；第16字：进→近；第31字：财→才 |
```

**注意两个数字的对比：**

```text
句子级准确率 0.0%       ← 一句话里有一个字错，这句就算错
字级准确率   87.9%      ← 33 个字错 4 个
```

**这两个数字差得很远，而客户只会问一个。**

```text
客户问："准确率多少？"
你答"87.9%" → 客户觉得"还行"
你答"句子级 0%" → 客户觉得"完全不能用"

→ 两个都对，取决于你问的是"字"还是"句"
→ 而客户真正关心的是"我能不能直接用"
→ 那答案既不是 0% 也不是 87.9%，是"这句有 4 个字需要你确认"
```

**这就是"准确率"这个说法在语音转写里没有意义的原因。真正有用的是"错在哪、错成什么类型"。**

## 4.4 差异位置那一行暴露的问题

**看"第7字：做→的"：**

```text
原文：这个季度在做的项目
       位置:  1234567
第7个字是"做"

转写：这个季度在座的的项目
       位置:  1234567
第7个字是"的"

→ 不只是"做"错成"座"，而是"做"变成了"的"，还多了一个"的"
```

**这种"错一个字 + 多一个字"的偏移错误，会让后面所有的字位置全错。**

**逐字比对在这种情况下只能告诉你"这里有差异"，不会告诉你"应该改成什么"。**

**所以人工校对不能靠"看着改"，必须"边听边改"** —— 听那个位置的音频，才知道是"做的"还是"座的"。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `缺少文件` | `out\source.txt` 或 `out\asr.txt` 不存在 | 手工建这两个文件 |
| 行数对不齐 | 断句方式不同 | 按句号重新断一次 |
| 差异数是 0 但明显不一样 | 你可能比的是同一个文件 | 检查两个文件内容 |
| 中文乱码 | 编码 | 存成 UTF-8 |

---

# 第 5 步：故意犯四个错（20 分钟）

## 错误 1：手写 `Content-Type: multipart/form-data`

```javascript
// 错误写法
headers: {
  "Content-Type": "multipart/form-data",
  Authorization: "Bearer " + key,
}
```

**现象：** 服务端说 `file field is required`，但你的 `FormData` 里明明有 `file`。

**原因：** `multipart/form-data` 的 `Content-Type` 必须带一个 **`boundary`** 参数，它是分隔各个字段的随机字符串。手写 `Content-Type` 会把 fetch 自动生成的 `boundary` 覆盖掉。

```text
正确：Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryXyZ123
错误：Content-Type: multipart/form-data                             ← 没有 boundary
→ 服务端不知道字段从哪开始、到哪结束 → 解析失败
```

**真正的伤害：** 错误信息（`file field is required`）完全不指向真正的原因。**你会去检查 `FormData` 的 append，检查字段名，检查文件路径 —— 全都对，但就是不行。**

**正确做法：** **不要设 `Content-Type`**，让 `fetch` 自己设。

```javascript
headers: {
  Authorization: "Bearer " + key,   // 只给这个
}
```

**这是 `fetch` + `FormData` 的一个陷阱：你越"周到"，越出错。**

## 错误 2：分段后不加时间偏移

```javascript
// 错误写法
for (const p of pieces) {
  const r = await transcribe(p);
  allSegments.push(...r.segments);   // ← 每段的 start 都从 0 开始
}
```

**现象：** 52 分钟的音频，分段转写后，所有段落的时间戳都在 0–600 秒之间来回跳。

**原因：** 每段音频的 `start` 都是相对于**这一段自己**的。第 3 段的 `start: 30.0` 意思是"第 3 段内部的第 30 秒"，不是"整个文件的第 30 秒"。

**真正的伤害：**

```text
时间戳全错 → 会议纪要里的"第 23 分钟有人提到预算"
           实际那是第 3 段的第 23 秒，也就是全文件的第 1223 秒（第 20 分钟）
→ 客户按时间戳去听，听到的是完全无关的内容
→ 而这个错，你从文本上看不出来（文本是拼对的）
```

**正确做法：**

```javascript
let cursorSec = 0;
for (const p of pieces) {
  const r = await transcribe(p);
  for (const s of r.segments) {
    allSegments.push({ start: cursorSec + s.start, end: cursorSec + s.end, text: s.text });
  }
  cursorSec += pieceSec;   // ← 累加这一段的真实时长
}
```

**注意 `pieceSec` 要用"这段音频的真实时长"，不是"你请求的时长"。** 最后一段通常短于上限。

## 错误 3：某一段失败就整份放弃

```javascript
// 错误写法
for (const p of pieces) {
  const r = await transcribe(p);   // 抛异常 → 整个函数中断
  texts.push(r.text);
}
```

**现象：** 52 分钟音频，第 4 段网络超时，整份没结果。

**原因：** 没有 `try/catch`，或者 `catch` 之后 `throw` 了。

**真正的伤害：**

```text
52 分钟，5 段，第 4 段失败
→ 前 3 段的结果全部丢掉
→ 你重跑一次，可能第 2 段又失败
→ 永远跑不完
```

**正确做法：**

```text
① 每段独立 try/catch
② 失败记进 failedParts，继续下一段
③ 最后返回"部分成功"，并明确列出哪几段缺了
④ 提供"只重试失败的段"的入口
```

**最关键的是第 ③ 条：** 结果必须是"**部分成功 + 明确缺口**"，不是"全部失败"。

**因为 40 分钟有结果，比 0 分钟有结果有用得多。** 但你必须**知道缺的是哪一段**，否则客户会以为会议里没提过那件事。

## 错误 4：把转写结果当定稿交付

```javascript
// 交付物
fs.writeFileSync("会议纪要.txt", r.text);
```

**现象：** 客户直接拿去发了，里面有"在座的"这种错。

**原因：** 你没有标注这是机器转写。

**真正的伤害：**

```text
客户按"在座的"理解，以为要开全体会议
实际是"在做的项目"要统一进度
→ 一个错误的会议通知
→ 追责的时候，你说"是机器转的"，客户说"你没告诉我"
```

**正确做法：交付物里必须有三个东西：**

```text
① 显著的标注：「本文由语音识别生成，未经人工校对 / 已校对 X 处」
② 不确定的地方标出来：「在座的（应为"在做的"？待确认）」
③ 时间戳：让客户能自己定位去听
```

**这一条不是技术，是交付规范。** 但它比任何技术细节都重要 —— **它决定了出错时责任在谁。**

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 手写 `Content-Type` | `file field is required` | 错误信息完全不指向原因 | headers 里有没有 `Content-Type` |
| 不加时间偏移 | 时间戳来回跳 | 会议纪要定位全错 | 分段后 `start` 有没有单调递增 |
| 一段失败全放弃 | 52 分钟白跑 | 永远跑不完 | 有没有收集 `failedParts` |
| 当定稿交付 | 客户拿去直接发 | 出错时责任在你 | 输出里有没有"未校对"标注 |

**这四个错误里，第 2 和第 4 最危险：它们不报错。**

**第 2 个错，文本是对的，只有时间戳错 —— 你不点进音频听，永远发现不了。**

---

# 第 6 步：写学习笔记（10 分钟）

打开 `第04节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「同音字错例」和「分段后时间戳怎么算」两节。

---

# 第 7 步：课后练习

## 练习一：补全错例表

用你录的那段真人语音，做一次完整的对照：

1. 手写原文到 `out\source.txt`（一句一行）；
2. 转写结果按句放进 `out\asr.txt`；
3. 跑 `error-table.js`；
4. **手工填第三节的"错误分类"**，每个类型至少一个例子。

**这张表就是你以后接语音类需求的资产。** 积累三个客户之后，你能一眼看出"哪类录音问题最多"。

## 练习二：给失败的段加重试

现在失败就记下来。改成：每段最多重试 2 次，间隔 1 秒。

**回答：** 重试 2 次和重试 5 次的差别大吗？为什么不要无限重试？

## 练习三：算一下 52 分钟的音频要多少钱

按你的服务单价，算：

```text
52 分钟 = ? 秒
按秒计费 / 按分钟计费，各是多少
如果分段 6 段，会不会因为"段数"额外收费
```

**写出计算过程，标注单价来源。**

## 练习四：做一份"语音类需求"的判断表

列 6 个真实的语音需求，判断"能不能做、怎么做、有什么风险"：

| 需求 | 能做吗 | 怎么做 | 风险 |
|---|---|---|---|
| 40 分钟会议录音出纪要 | | | 人名、数字、同音字 |
| 客服电话质检（找违规话术） | | | |
| 一段 3 分钟微信语音转文字 | | | |
| 给视频自动生成字幕 | | | |
| 语音搜索（说一句话搜资料） | | | |
| 实时语音对话（边说边回） | | | **最后这个是另一个量级** |

**最后一行是分水岭。** 前面五个都是"录完再处理"，最后一个是"边录边处理"，**技术上完全是两套东西**（流式、延迟、打断）。本课程不做，但你要知道它不属于同一类。

## 练习五：用自己的话讲清

1. 为什么语音接口用 `multipart/form-data` 而不是 JSON？为什么不能手写 `Content-Type`？
2. 分段转写后，为什么必须给每段时间戳加偏移？不加会怎样？
3. 为什么按字节切 MP3 会有怪音，而 WAV 不会？
4. 某一段失败时，为什么"返回部分结果 + 明确缺口"比"整份失败"好？但风险是什么？
5. 为什么"字级准确率 95%"可能完全不能用？举一个例子。
6. 客户要"实时语音对话"，和"录完转文字"差在哪？

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能从 WAV 头里读出采样率和 byteRate，并算出时长
- [ ] 我能说清 MP3 的时长为什么要估算，误差多大
- [ ] 我能说清语音接口为什么用 multipart，手写 `Content-Type` 为什么会失败
- [ ] 我能说清分段后时间戳为什么必须加偏移
- [ ] 我能说清"按字节切"对 WAV 安全、对 MP3 不安全的原因

## B. 实操

- [ ] `make-test-wav.js 3 16000` 生成的 96044 字节和理论值一致
- [ ] `probe-audio.js` 显示"0 分 3 秒"、16000 Hz、1 声道、16 bit
- [ ] `probe-transcribe.js` 对 `beep-3s.wav` 返回空文本（正弦波）
- [ ] `probe-transcribe.js` 对长音频返回 6 段、含"第 4 段失败"的说明
- [ ] `splitWavBuffer` 每段的 RIFF 长度和 data 长度都被重写
- [ ] `error-table.js` 生成 `out\error-table.md`，含字级/句子级两个准确率
- [ ] 我录了一段真人语音并转写过
- [ ] 我手工填了错例表的"错误分类"

## C. 排错

- [ ] 我试过手写 `Content-Type`，看到 `file field is required`
- [ ] 我知道分段不加偏移会让时间戳来回跳
- [ ] 我跑过一次"某段失败"，看到结果里有 `failedParts`
- [ ] 我知道 WAV 头里的两个长度字段必须改

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 「同音字错例」有三个以上真实例子
- [ ] 「分段后时间戳怎么算」写了我的推导
- [ ] 练习四判断表写满了 6 行

---

## 本节课要能说出口的一句话

> **转写文本从来不是成品。它的错误读起来通顺、不报错、不标红 —— 你不逐句对原文，就永远不知道错在哪。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `file field is required` | headers 里有没有手写 `Content-Type` | 删掉它，只留 `Authorization` |
| `HTTP 400 file too large` | 文件大小 | 走分段，或降码率 |
| `HTTP 400 unsupported format` | 格式 | 转 mp3 / wav |
| `FormData is not defined` | Node < 18 | 升级 Node |
| 时长算错 | WAV 头长度不是 44 | 用 `(size-44)/byteRate` 近似 |
| 时间戳来回跳 | 没加 `cursorSec` | 每段累加真实时长 |
| 段首有怪音 | 切在 MP3 帧中间 | 只对 WAV 分段，或用 ffmpeg |
| 某段失败整份没结果 | 没收集 `failedParts` | 每段独立 try/catch |
| `返回里没有 text` | 服务结构不同 | 打印完整 JSON |
| 分段数特别多 | `STT_CHUNK_BYTES` 太小 | 设成上限的 80% |
| 转写结果全是空的 | 音频里没人说话 | 检查是不是测试用的正弦波 |
| 中文乱码 | cmd 编码 | `chcp 65001` |
| 长音频很慢 | 正常（约 1/10 实时） | 52 分钟约 5 分钟，加进度提示 |
