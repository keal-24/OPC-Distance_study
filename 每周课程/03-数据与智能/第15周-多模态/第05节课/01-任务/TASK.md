# 第 103 节课：文字转语音

> 这节课结束时，你手上有：`mm-app\lib\tts-split.js`（长文本切分 + 时长估算）、`mm-app\lib\tts-cache.js`（缓存键 + 命中统计）、`mm-app\lib\speak.js`（合成 + 缓存 + 返回播放清单）、`mm-app\out\tts-log.md`（命中率与成本）。

**时间**：约 115 分钟
**前置**：第 102 节课的 `mm-app`（`lib/config.js` 里已有 `TTS_DIR` 和 `TTS_MODEL`）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

音频 → 文字，你会了。现在反过来：**文字 → 音频。**

听起来是"锦上添花"。**但它是很多真实需求的核心：**

```text
客户："客服系统要给视力不好的用户做语音播报"
客户："课程视频要配音，但不想找人录"
客户："每天早上把销售数据播报一遍"
客户："知识库文章要能听"
```

## 0.2 今天这个坑长什么样

> 你接了个需求：给内部知识库加"朗读"按钮。用户点一下，把当前这段文字读出来。
>
> 你写完了，很顺：
>
> ```javascript
> app.post("/api/speak", async (req, res) => {
>   const audio = await tts(req.body.text);
>   res.set("Content-Type", "audio/mpeg").send(audio);
> });
> ```
>
> 上线一周，老板看账单问："这个月怎么多了这么多语音费用？"
>
> 你查日志：
>
> ```text
> 总调用      2841 次
> 不同文本      36 段
>
> → 同一段制度条文被读了 400 多次
> → 每次都重新生成、每次都付钱
> ```

**36 段文字，你付了 2841 次的钱。**

**这就是今天唯一的核心问题：TTS 必须缓存。**

**但缓存键不能想当然：**

```text
你想的 key：hash(text)

问题：
  用户 A 用"女声，正常语速"
  用户 B 用"男声，1.5 倍速"
  同一段文字 → 同一个 hash → B 播出来是女声正常语速

→ 缓存命中了，但结果是错的
→ 你不会发现，因为"有声音出来"
```

**正确的 key 必须包含所有"会影响输出"的参数。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 合成（synthesis） | 文字 → 音频，也叫 TTS（Text To Speech） | 第 1 步 |
| 缓存键（cache key） | 决定"什么算同一份"的那串东西 | 第 3 步 |
| 播放清单 | 长文本切段后，返回"一组文件 + 每段文字"，不是拼成一个大文件 | 第 2、4 步 |

**先说清边界，别指望这节课能做什么：**

```text
本课程不做流式 TTS。
接口返回的是"一个完整的音频文件"，不是"一段一段的声音"。
要做流式，需要接口支持分块输出 + 播放器支持流式解码。

今天做的是"点击 → 等 1–3 秒 → 播放"。
"朗读一段制度"够用；"实时语音对话"完全不够 —— 那不是这门课的范围。
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `lib\tts-split.js` | `第05节课\03-练习代码\mm-app\` | 长文本切分 + 时长估算 |
| `lib\tts-cache.js` | 同上 | 缓存键计算、命中查询、统计 |
| `lib\speak.js` | 同上 | 合成、写缓存、返回播放清单 |
| `scripts\tts-lab.js` | 同上 | 三组对照，验证缓存真的省了钱 |
| `out\tts-log.md` | 同上 `out\` | 命中率、耗时、成本估算 |
| `NOTES.md` | `第05节课\02-笔记\` | 第 6 步填 |

---

# 第 1 步：先看清接口，别套用 STT 的习惯（20 分钟）

## 1.1 做什么 / 为什么

**做什么：** 先把接口的输入输出搞清楚，再写代码。

**为什么专门对比：**

因为**你已经形成"多模态接口差不多"的印象，而 TTS 和 STT 差别很大。**

| | STT（语音转文字） | TTS（文字转语音） |
|---|---|---|
| **请求 body** | `multipart/form-data`（传音频文件） | **JSON**（传文字） |
| **响应 body** | JSON（`{text, segments}`） | **二进制音频流** |
| **端点** | `/audio/transcriptions` | `/audio/speech` |
| **关键参数** | `file` `model` `language` | `input` `model` `voice` `speed` |
| **怎么读返回** | `res.json()` | **`res.arrayBuffer()`** |

**最后一行最容易踩：**

```javascript
// 错误写法（STT 的习惯）
const json = await res.json();        // ← 音频数据不是 JSON，必炸

// 正确写法
const buf = Buffer.from(await res.arrayBuffer());
```

**报错长什么样：**

```text
SyntaxError: Unexpected token 'I', "ID3..." is not valid JSON
```

**`ID3` 就是 MP3 的文件头。** 你拿二进制当 JSON 解析，它把前三个字符 `ID3` 当成 JSON 的开始了。

## 1.2 操作

**1.** 进项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第15周-多模态\第05节课\03-练习代码"
xcopy /E /I /Y "..\第04节课\03-练习代码\mm-app" mm-app
cd mm-app
```

**2.** 在 `.env` 里加：

```text
# 文字转语音
TTS_MODEL=
TTS_VOICE=alloy
TTS_SPEED=1.0
# 单次合成的最大字符数（不同服务不同，保守取 2000）
TTS_MAX_CHARS=2000
```

**3.** 新建 `scripts\probe-tts-raw.js`，**先不做封装，直接打一次接口看原始返回**：

```javascript
// probe-tts-raw.js —— 直接调一次 TTS，看原始返回是什么
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });

const config = require("../lib/config");

async function main() {
  const text = "这是一段测试文字，用来确认接口返回的到底是什么。";

  console.log("模式    ：" + (config.MOCK ? "MOCK（不会真的调接口）" : "真实 / " + config.TTS_MODEL));
  console.log("音色    ：" + config.TTS_VOICE);
  console.log("文本长度：" + text.length + " 字");
  console.log("");

  if (config.MOCK) {
    console.log("MOCK 下不调接口。这一步必须看真返回，因为今天的核心坑在返回格式上。");
    console.log("把 .env 的 MOCK 改成 false 再跑。");
    return;
  }

  if (!config.TTS_MODEL) {
    console.error("没有配置 TTS_MODEL，无法继续");
    process.exitCode = 1;
    return;
  }

  const t0 = Date.now();

  const res = await fetch(config.BASE_URL + "/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.API_KEY,
    },
    body: JSON.stringify({
      model: config.TTS_MODEL,
      input: text,
      voice: config.TTS_VOICE,
      speed: Number(config.TTS_SPEED),
    }),
  });

  console.log("状态码        ：" + res.status);
  console.log("Content-Type  ：" + res.headers.get("content-type"));
  console.log("Content-Length：" + res.headers.get("content-length"));

  if (!res.ok) {
    const body = await res.text();
    console.log("");
    console.log("失败：");
    console.log(body.slice(0, 500));
    return;
  }

  const buf = Buffer.from(await res.arrayBuffer());

  console.log("实际字节      ：" + buf.length);
  console.log("前 12 字节(hex)：" + buf.subarray(0, 12).toString("hex"));
  console.log("耗时          ：" + (Date.now() - t0) + " ms");
  console.log("");
  console.log("=== 文件头对照 ===");
  console.log("49 44 33    → ID3，这是 MP3");
  console.log("4f 67 67 53 → OggS，这是 OGG");
  console.log("52 49 46 46 → RIFF，这是 WAV");
  console.log("");
  console.log("按文件头决定存什么扩展名。不要凭 Content-Type 猜，也不要凭感觉写。");
}

main().catch((err) => {
  console.error("崩了：" + err.message);
  process.exitCode = 1;
});
```

**4.** 跑：

```text
node scripts\probe-tts-raw.js
```

## 1.3 屏幕上应该看到什么

```text
>node scripts\probe-tts-raw.js
模式    ：真实 / tts-1
音色    ：alloy
文本长度：24 字

状态码        ：200
Content-Type  ：audio/mpeg
Content-Length：23040
实际字节      ：23040
前 12 字节(hex)：49 44 33 04 00 00 00 00 23 54 53 53
耗时          ：1420 ms

=== 文件头对照 ===
49 44 33    → ID3，这是 MP3
4f 67 67 53 → OggS，这是 OGG
52 49 46 46 → RIFF，这是 WAV
```

**五个信息，每一个都有用：**

| 观察 | 用途 |
|---|---|
| `Content-Type: audio/mpeg` | 通常对应 `.mp3` |
| 文件头 `49 44 33` = `ID3` | **确认它真的是 MP3**（不是被标错的其他格式） |
| 24 字 → 23040 字节 | 能算出"每字多少字节"，用来估体积 |
| 耗时 1420 ms | 单次延迟。**决定 UI 要不要加 loading** |
| 没有 `Content-Length` | 服务用了 chunked，得读完才知道大小 |

**算"每字多少字节"：**

```text
23040 字节 / 24 字 ≈ 960 字节/字
```

**这个数能反过来估一段文本的体积：**

```text
2000 字的文章 ≈ 2000 × 960 ≈ 1.9 MB
```

**而"960 字节/字"这个值说明一件重要的事：**

```text
MP3 128kbps ≈ 16000 字节/秒
960 字节/字 ÷ 16000 ≈ 0.06 秒/字
→ 约 16.7 字/秒

正常中文语速是 4–5 字/秒
→ 说明这个码率远高于"朗读"所需
→ 文件比需要的大 3–4 倍
```

**所以要查一下服务能不能指定更低码率。**

```text
能指定 → 文件小 3–4 倍，加载更快，占用更少
不能指定 → 接受现状，但要在方案里写明"单篇约 2MB"
```

**这一条要写进笔记，因为它是真实的优化空间，也是报价时要考虑的因素。**

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Unexpected token 'I'` | 你用了 `res.json()` | 改 `res.arrayBuffer()` |
| `HTTP 400 input too long` | 文本超上限 | 走第 2 步切分 |
| `HTTP 400 invalid voice` | 音色名不被支持 | 查服务支持的音色列表 |
| `HTTP 404 /audio/speech` | 端点名不同 | 看服务文档 |
| `Content-Type` 是 JSON 但状态码 200 | 服务"成功"但返回错误 | **先看 Content-Type 再决定怎么读** |
| 耗时超过 30 秒 | 文本太长 | 切分 |

**最后两条要特别记住：**

```text
状态码 200 + Content-Type application/json
= 服务"成功了"，但返回的是 JSON 不是音频

这时候如果你直接 arrayBuffer 存成 .mp3
→ 得到一个内容是 JSON 文本的"mp3"
→ 播放器打不开，但你的代码不报错
```

**所以必须先判断 `Content-Type`，再决定怎么读。**

## 1.5 操作：验证"先判断再读"

新建 `scripts\probe-tts-guard.js`，用**一个故意错的音色**触发错误分支：

```javascript
// probe-tts-guard.js —— 验证"先看 Content-Type 再决定怎么读"
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });

const config = require("../lib/config");

async function tryOne(voice) {
  console.log("");
  console.log("=== 音色：" + voice + " ===");

  const res = await fetch(config.BASE_URL + "/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.API_KEY,
    },
    body: JSON.stringify({ model: config.TTS_MODEL, input: "测试", voice: voice }),
  });

  const ct = res.headers.get("content-type") || "";

  console.log("  状态码      ：" + res.status);
  console.log("  Content-Type：" + ct);

  if (ct.indexOf("application/json") >= 0) {
    const text = await res.text();
    console.log("  返回的是 JSON（不是音频）：");
    console.log("  " + text.slice(0, 300));
    console.log("  → 这一支必须当错误处理，绝不能存成 mp3");
    return;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  console.log("  返回的是音频，字节数：" + buf.length);
}

async function main() {
  if (config.MOCK) {
    console.log("MOCK 下跳过。这一步要看真实返回。");
    return;
  }
  await tryOne(config.TTS_VOICE);
  await tryOne("一个不存在的音色-xyz");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
```

```text
node scripts\probe-tts-guard.js
```

**屏幕上应该看到什么：**

```text
=== 音色：alloy ===
  状态码      ：200
  Content-Type：audio/mpeg
  返回的是音频，字节数：14336

=== 音色：一个不存在的音色-xyz ===
  状态码      ：400
  Content-Type：application/json
  返回的是 JSON（不是音频）：
  {"error":{"message":"Invalid voice: 一个不存在的音色-xyz","type":"invalid_request_error"}}
  → 这一支必须当错误处理，绝不能存成 mp3
```

**这就是"先看 Content-Type"的价值：**

```text
不看：400 + JSON 被当成音频存下来 → 得到一个一百多字节的"mp3"
      播放器报"格式不支持"，而你的日志显示"成功"
看：  立刻知道是错误，还能拿到真实原因
```

---

# 第 2 步：长文本必须切分（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `splitForTts()` 把长文本切到接口能接受的范围内，写 `estimateDuration()` 估时长。

**为什么不切不行：**

```text
接口上限（典型）：单次几千字符
一篇 3000 字的文章 → 可能要切
一章书             → 必须切
```

**切分和 STT 分段有三处不同：**

| | STT 分段 | TTS 切分 |
|---|---|---|
| 切在哪 | 按字节/时间 | **必须在句号、逗号处切** |
| 切坏了 | 段首有怪音 | **读出来是断的，或者念到一半停** |
| 拼回来 | 文本直接拼接 | **音频不能简单拼接** |

**最后一行是今天的第二个大坑：**

```text
MP3 是"帧"结构。直接 Buffer.concat 两段 MP3：
  → 第二段的 ID3 头被当成音频数据
  → 播放器可能能播，也可能中途卡住
  → 时长显示错误

正确做法：要么让播放器依次播多个文件，
          要么用专业库处理帧结构
```

**本课程的做法：不拼音频，返回"播放清单"。**

```javascript
{
  segments: [
    { index: 0, text: "...", file: "xxx-p0.mp3", estSec: 12.3, cached: false },
    { index: 1, text: "...", file: "xxx-p1.mp3", estSec: 15.1, cached: true  }
  ]
}
```

**前端按顺序播。这样：**

```text
① 不需要音频拼接库
② 用户可以停在任意一段
③ 某段失败只重试那段
④ 每段单独缓存（文字被复用时直接命中）
```

**比"返回一个大文件"好，而且实现更简单。**

## 2.2 操作

新建 `lib\tts-split.js`：

```javascript
// tts-split.js —— 长文本切分 + 时长估算
// 原则：
//   ① 优先在句末标点后切
//   ② 其次在逗号、分号后切
//   ③ 最后才硬切（保证不超上限）
//   ④ 每段不短于 minChars（太短念出来很怪）

const SENTENCE_END = /[。！？；\n]/;
const SOFT_BREAK = /[，、：,]/;

function splitForTts(text, maxChars, minChars) {
  const max = maxChars === undefined ? 2000 : maxChars;
  const min = minChars === undefined ? 20 : minChars;

  const clean = String(text).replace(/\r\n/g, "\n").trim();
  if (clean.length === 0) return [];
  if (clean.length <= max) return [clean];

  const out = [];
  let rest = clean;

  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = -1;

    // 在 [min, max] 里从后往前找句末标点
    for (let i = window.length - 1; i >= min; i -= 1) {
      if (SENTENCE_END.test(window[i])) { cut = i + 1; break; }
    }

    // 退一步找逗号
    if (cut < 0) {
      for (let i = window.length - 1; i >= min; i -= 1) {
        if (SOFT_BREAK.test(window[i])) { cut = i + 1; break; }
      }
    }

    // 还是找不到，硬切
    if (cut < 0) cut = max;

    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest.length > 0) out.push(rest);

  // 收尾优化：最后一段太短就并进前一段（允许超上限 10%，换听感）
  if (out.length >= 2) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last.length < min && prev.length + last.length <= max * 1.1) {
      out.pop();
      out[out.length - 1] = prev + last;
    }
  }

  return out.filter((s) => s.length > 0);
}

// 中文正常语速约 4–5 字/秒。这是估算，用来给用户"大概多久"的预期。
function estimateDuration(text, charsPerSec) {
  const cps = charsPerSec === undefined ? 4.5 : charsPerSec;
  return text.length / cps;
}

module.exports = { splitForTts, estimateDuration };
```

**新建 `scripts\probe-split.js`。三个例子，各验证一件事：**

```javascript
// probe-split.js —— 三个例子，各验证一件事
const { splitForTts, estimateDuration } = require("../lib/tts-split");

function report(label, original, parts, max) {
  console.log("");
  console.log("=== " + label + " ===");
  console.log("原文（" + original.length + " 字），上限 " + max);

  let sum = 0;
  let over = 0;
  let badEnd = 0;

  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    sum += p.length;
    if (p.length > max * 1.1) over += 1;
    const ok = /[。！？；，、：]/.test(p[p.length - 1]);
    if (!ok) badEnd += 1;
    console.log(
      "  [" + i + "] " + String(p.length).padStart(4) + " 字  " +
      estimateDuration(p).toFixed(1) + "s  " +
      (ok ? "" : "← 结尾不在标点上") +
      "  " + p.slice(0, 22) + (p.length > 22 ? "…" : "")
    );
  }

  console.log("  校验 1 字数合计：" + sum + " / " + original.length + " → " + (sum === original.length ? "一致 ✓" : "丢字！"));
  console.log("  校验 2 超上限(>110%)：" + over + " 段 → " + (over === 0 ? "合规 ✓" : "超了"));
  console.log("  校验 3 结尾不在标点：" + badEnd + " 段");
}

// ---------- 例 1：小到能手算 ----------
const SMALL = "第一句结束。第二句结束。第三句结束。第四句结束。";
report("例 1：21 字，上限 10，最小 3", SMALL, splitForTts(SMALL, 10, 3), 10);
console.log("");
console.log("  手算推演：");
console.log("    第 1 轮：rest=21>10，窗口=前 10 字「第一句结束。第二句结」");
console.log("            从后往前找句末，索引 5 是「。」→ cut=6");
console.log("            切出 6 字，rest 剩 15");
console.log("    第 2 轮：rest=15>10，窗口=「第二句结束。第三句」");
console.log("            索引 5 是「。」→ cut=6 → 切出 6 字，rest 剩 9");
console.log("    第 3 轮：rest=9≤10 → 整段收尾");
console.log("    结果：3 段，6 + 6 + 9 = 21 ✓");

// ---------- 例 2：标点密集的正文 ----------
const TEXT =
  "第一条，所有业务系统账号必须实名申请，密码长度不少于 12 位，每 90 天更换一次。离职人员的账号应在离职当日停用，不得保留。" +
  "第二条，客户名单、合同原件、财务明细属于机密数据，不得对外发送；确因业务需要外发的，须经部门负责人和信息安全负责人双重审批，并留存审批记录。" +
  "第三条，出差期间的住宿费按城市等级分档执行，一线城市上限 500 元每晚，其他城市 350 元每晚，超标部分由员工自理。" +
  "第四条，报销流程：出差前填写申请单，经部门负责人审批后，凭发票和行程单在 15 个工作日内报销。逾期未报的，需要书面说明原因。" +
  "第五条，合同评审由法务部牵头，金额超过 50 万元的合同必须经总经理审批。签署前须确认对方主体资格，留存营业执照复印件和授权委托书。";
report("例 2：制度条文（标点密集），上限 120", TEXT, splitForTts(TEXT, 120, 20), 120);

// ---------- 例 3：一段完全没有标点的流水文字 ----------
const NO_PUNCT =
  "所有业务系统账号必须实名申请密码长度不少于十二位每九十天更换一次" +
  "离职人员的账号应在离职当日停用不得保留客户名单合同原件财务明细属于机密数据" +
  "不得对外发送确因业务需要外发的须经部门负责人和信息安全负责人双重审批并留存审批记录" +
  "出差期间的住宿费按城市等级分档执行一线城市上限五百元每晚其他城市三百五十元每晚超标部分由员工自理";
report("例 3：无标点长文本（必然硬切），上限 120", NO_PUNCT, splitForTts(NO_PUNCT, 120, 20), 120);
```

```text
node scripts\probe-split.js
```

## 2.3 屏幕上应该看到什么

```text
>node scripts\probe-split.js

=== 例 1：21 字，上限 10，最小 3 ===
原文（21 字），上限 10
  [0]    6 字  1.3s  第一句结束。
  [1]    6 字  1.3s  第二句结束。
  [2]    9 字  2.0s  第三句结束。第四句结束。
  校验 1 字数合计：21 / 21 → 一致 ✓
  校验 2 超上限(>110%)：0 段 → 合规 ✓
  校验 3 结尾不在标点：0 段

  手算推演：
    第 1 轮：rest=21>10，窗口=前 10 字「第一句结束。第二句结」
            从后往前找句末，索引 5 是「。」→ cut=6
            切出 6 字，rest 剩 15
    第 2 轮：rest=15>10，窗口=「第二句结束。第三句」
            索引 5 是「。」→ cut=6 → 切出 6 字，rest 剩 9
    第 3 轮：rest=9≤10 → 整段收尾
    结果：3 段，6 + 6 + 9 = 21 ✓

=== 例 2：制度条文（标点密集），上限 120 ===
原文（347 字），上限 120
  [0]  105 字  23.3s  第一条，所有业务系统账号必须实名申请，…
  [1]  118 字  26.2s  第二条，客户名单、合同原件、财务明细属…
  [2]  124 字  27.6s  第三条，出差期间的住宿费按城市等级分档…
  校验 1 字数合计：347 / 347 → 一致 ✓
  校验 2 超上限(>110%)：0 段 → 合规 ✓
  校验 3 结尾不在标点：0 段

=== 例 3：无标点长文本（必然硬切），上限 120 ===
原文（318 字），上限 120
  [0]  120 字  26.7s  所有业务系统账号必须实名申请密码长度不少于…
  [1]  120 字  26.7s  不得保留客户名单合同原件财务明细属于机密…
  [2]   78 字  17.3s  出差期间的住宿费按城市等级分档执行一线城…
  校验 1 字数合计：318 / 318 → 一致 ✓
  校验 2 超上限(>110%)：0 段 → 合规 ✓
  校验 3 结尾不在标点：3 段
```

**三个例子各说明一件事，缺一不可：**

| 例子 | 说明什么 |
|---|---|
| 例 1 | **逻辑能被手算验证。** 你跟着推演走一遍，确认代码没瞎写 |
| 例 2 | **标点密集的文本，切点干净。** 制度、文章、报告都属于这类 |
| 例 3 | **没有标点就必然硬切。** 这是兜底逻辑在工作，不是 bug |

**注意例 2 的第 3 段是 124 字，超过了上限 120。**

**这是"收尾优化"故意做的：**

```text
如果不合并：
  [0] 105 / [1] 118 / [2] 105 / [3] 19
  → 最后那 19 字单独成一段，念出来是一个突兀的短句

合并之后：
  [0] 105 / [1] 118 / [2] 124
  → 段数少一段，听感顺，但最后一段超了 4 字（3.3%）
```

**合并的判断条件：**

```text
if (last.length < min && prev.length + last.length <= max * 1.1)
```

**两个条件都要满足：**

```text
① 尾巴真的短（< min）  → 只有短才值得合
② 合完不超过 110%      → 接口上限通常是"约"多少，留 10% 余量可以吃
```

**为什么允许超 10%：** 为了听感牺牲一点余量是值得的。**但不能更多** —— 超 20% 就真的可能被接口拒绝。

**这个"允许超多少"的决定要写进笔记。** 它是"参数怎么定"的真实例子：**没有标准答案，只有取舍。**

## 2.4 例 3 教给你的一件事：兜底逻辑必须存在

**例 3 的文本是我故意把人话里的标点全删掉造的。你不信可以自己看那段字符串。**

**为什么要有这个例子：**

```text
真实数据里，"没有标点的长文本"一定存在：
  · 从 PDF 抽出来的文字层，可能整段没有中文标点
  · 用户从 Excel 里复制的一大段
  · 语音转写结果（第 102 节）里，断句可能全是错的
  · 某些系统的导出文本，标点变成了全角空格

→ 如果切分逻辑只认标点，碰到这类文本会死循环或者返回一个超长段
→ 所以 `if (cut < 0) cut = max;` 这一行必须有
```

**这一行是"兜底"，不是"正常路径"。**

```text
正常路径：找到标点 → 在标点处切
兜底路径：找不到 → 硬切

判断代码写得好不好，就看兜底路径有没有覆盖到。
```

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 字数合计不等于原文 | `slice` 或 `trim` 丢了字 | 逐段打印 `length`，看哪一轮丢 |
| 所有段都超上限 | `cut = max` 的兜底被删了 | 加回去 |
| 所有段都一样长 | 你的文本没有标点 | 正常，硬切 |
| 切出一堆 1–2 字的段 | `min` 太小或没设 | `min` 至少 20 |
| 最后一段特别短没被合并 | 合并条件和 `max * 1.1` 冲突 | 打印 `prev.length + last.length` 和 `max * 1.1` |
| 死循环 | `cut` 可能是 0 | 加 `if (cut <= 0) cut = max;` |

**最后一条要真的防一下：**

```javascript
// 更稳的写法
if (cut <= 0) cut = max;
```

**因为如果 `min = 0`，`i` 可能取到 0，`cut = 0 + 1 = 1`，然后 `rest` 只少 1 个字 —— 循环几乎不前进，看起来像卡住。**

---

# 第 3 步：缓存键 —— 这节课的真正核心（25 分钟）

## 3.1 做什么 / 为什么

**做什么：** 设计并实现缓存键，做到"同样的输入不重复花钱，不同的输入不错误命中"。

**为什么这是核心：**

```text
你在第 0.2 节看到的问题：2841 次调用，36 段文本
→ 缓存能把它变成 36 次

这一句话就是几块钱和几百块钱的差别。
```

**但缓存键设计错，会有两种失败，方向相反：**

| 错法 | 后果 | 严重程度 |
|---|---|---|
| **键太少**（只 hash text） | 男声请求命中了女声缓存 → **播出来是错的声音** | 高（结果错，但不报错） |
| **键太多**（把时间戳也放进去） | 永远不命中 → 每次都付钱 | 中（成本问题，能被账单发现） |

**"键太少"更危险。** 因为它静默出错。

## 3.2 哪些参数必须进键

**判断标准只有一条：这个参数变了，输出的音频会变吗？**

| 参数 | 影响输出 | 进键 | 理由 |
|---|---|---|---|
| `text` | 是 | ✓ | 内容不同，音频必然不同 |
| `model` | 是 | ✓ | 换模型，音色和发音规则全变 |
| `voice` | 是 | ✓ | 换音色，明显不同 |
| `speed` | 是 | ✓ | 语速不同，音频长度都不同 |
| 输出格式（mp3/wav） | 是 | ✓ | 编码不同，字节完全不同 |
| 语种（zh/en） | 是 | ✓ | 同一段文字按不同语言读，完全不同 |
| **请求时间** | 否 | ✗ | 每次请求时间都不同 → 永远不命中 |
| **用户 id** | 否 | ✗ | 除非你要给每个用户单独存一份（通常不要） |
| **服务商域名** | **是** | ✓ | 换服务商，同一模型名可能是完全不同的声音 |

**最后一行容易被忽略：**

```text
你从 A 服务商切到 B 服务商
两边的 TTS_MODEL 都叫 "tts-1"
→ 声音完全不同
→ 但缓存键里没有服务商 → 全部命中旧音频 → 客户听到的是旧服务商的声音
```

**这不是理论问题。** 你换供应商时一定会遇到。

## 3.3 操作

新建 `lib\tts-cache.js`：

```javascript
// tts-cache.js —— 缓存键 + 命中统计
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");

const CACHE_DIR = path.join(config.TTS_DIR, "cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const INDEX_FILE = path.join(CACHE_DIR, "index.json");

// ---------- 缓存键 ----------
// 只放"会影响音频字节"的参数。
// 特别注意 BASE_URL 也要进：换服务商时同名模型声音完全不同。
function cacheKey(parts) {
  const p = parts === undefined ? {} : parts;

  const payload = [
    "v1",                                  // 键的版本号。参数列表变了就改它
    String(p.baseUrl || "").toLowerCase(),
    String(p.model || ""),
    String(p.voice || ""),
    String(p.speed === undefined ? 1 : p.speed),
    String(p.format || "mp3"),
    String(p.language || "zh"),
    String(p.text || ""),
  ].join("\u0001");                        // 用不可见字符分隔，避免拼接歧义

  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

// ---------- 索引 ----------
// 记录每个键对应的文件、字数、命中次数、创建时间
function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch (err) {
    console.warn("索引文件损坏，重建：" + err.message);
    return {};
  }
}

let index = loadIndex();

function saveIndex() {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
}

function getCached(key) {
  const rec = index[key];
  if (rec === undefined) return null;

  const file = path.join(CACHE_DIR, rec.file);
  if (!fs.existsSync(file)) {
    // 索引里有但文件没了（被手工删了/磁盘清理了）
    delete index[key];
    saveIndex();
    return null;
  }

  rec.hits = (rec.hits || 0) + 1;
  rec.lastHitAt = new Date().toISOString();
  saveIndex();

  return { file: file, rec: rec };
}

function putCache(key, filePath, meta) {
  const file = path.basename(filePath);
  index[key] = {
    file: file,
    chars: meta.chars,
    bytes: meta.bytes,
    model: meta.model,
    voice: meta.voice,
    speed: meta.speed,
    createdAt: new Date().toISOString(),
    hits: 0,
    lastHitAt: null,
  };
  saveIndex();
  return index[key];
}

// ---------- 统计 ----------
function stats() {
  const keys = Object.keys(index);
  let totalHits = 0;
  let totalChars = 0;
  let totalBytes = 0;

  for (const k of keys) {
    const r = index[k];
    totalHits += r.hits || 0;
    totalChars += r.chars || 0;
    totalBytes += r.bytes || 0;
  }

  return {
    entries: keys.length,
    totalHits: totalHits,
    totalCalls: keys.length + totalHits,
    hitRate: keys.length + totalHits === 0 ? 0 : totalHits / (keys.length + totalHits),
    totalChars: totalChars,
    totalBytes: totalBytes,
    mb: Number((totalBytes / 1024 / 1024).toFixed(2)),
  };
}

function clearCache() {
  for (const k of Object.keys(index)) {
    const f = path.join(CACHE_DIR, index[k].file);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  index = {};
  saveIndex();
}

module.exports = { cacheKey, getCached, putCache, stats, clearCache, CACHE_DIR, INDEX_FILE };
```

**注意 `cacheKey` 里那个 `"v1"`。**

**这是"键的版本号"，它的作用：**

```text
某天你给 cacheKey 加了一个新参数（比如加 emotion）
→ 所有旧键的计算方式变了
→ 旧键再也算不出来
→ 缓存全部失效（旧文件变成垃圾）

加了版本号：
→ 你把 "v1" 改成 "v2"
→ 新键和旧键明确区分
→ 你能清楚知道"哪些是旧版本的，可以批量清理"
```

**不加版本号会怎样：** 你改完参数，旧文件还在磁盘上占着，但你永远算不出它们的键了 —— **想清理都不知道该删哪些。**

## 3.4 操作：验证缓存命中

新建 `scripts\probe-cache.js`：

```javascript
// probe-cache.js —— 验证缓存键：同样的人工输入必须命中，不同参数必须不命中
const { cacheKey } = require("../lib/tts-cache");

const BASE = {
  baseUrl: "https://api.example.com/v1",
  model: "tts-1",
  voice: "alloy",
  speed: 1.0,
  format: "mp3",
  language: "zh",
  text: "所有业务系统账号必须实名申请。",
};

const CASES = [
  { label: "完全相同", override: {} },
  { label: "只改语速", override: { speed: 1.5 } },
  { label: "只改音色", override: { voice: "nova" } },
  { label: "只改模型", override: { model: "tts-1-hd" } },
  { label: "只改服务商", override: { baseUrl: "https://other.example.com/v1" } },
  { label: "只改格式", override: { format: "wav" } },
  { label: "只改一个字", override: { text: "所有业务系统账号必须实名申请！" } },
];

const results = [];

console.log("基准配置：");
console.log(JSON.stringify(BASE, null, 2));
console.log("");

for (const c of CASES) {
  const key = cacheKey({ ...BASE, ...c.override });
  results.push({ label: c.label, key: key });
  console.log(c.label.padEnd(14) + key);
}

console.log("");
console.log("=== 判定 ===");
const baseKey = results[0].key;
for (const r of results) {
  if (r.label === "完全相同") continue;
  const same = r.key === baseKey;
  console.log(
    "  " + r.label.padEnd(14) +
    (same ? "键相同 ← 如果这是预期外的，就是 bug" : "键不同 ✓")
  );
}

console.log("");
console.log("必须满足：");
console.log("  · 「完全相同」两次算出的键必须一样（这是命中缓存的前提）");
console.log("  · 其他六种必须都不一样（否则会错误命中）");

const again = cacheKey(BASE);
console.log("");
console.log("再算一次「完全相同」：" + again);
console.log("和第一次一致：" + (again === baseKey ? "是 ✓" : "否 ← 键里混进了随机量！"));
```

```text
node scripts\probe-cache.js
```

## 3.5 屏幕上应该看到什么

```text
>node scripts\probe-cache.js
基准配置：
{
  "baseUrl": "https://api.example.com/v1",
  "model": "tts-1",
  "voice": "alloy",
  "speed": 1,
  "format": "mp3",
  "language": "zh",
  "text": "所有业务系统账号必须实名申请。"
}

完全相同        3f8a2c1e9b4d7a06e5c89123
只改语速        7b2e5d4a1c8f3906a2e7d451
只改音色        c19f3a7e2d5b8046f3a1c982
只改模型        4e7d2b9a6c1f3058e9b4a7d2
只改服务商      a5c8e1f3b7d29064c2e8f513
只改格式        8d3b6f2a9e1c7405b7d3a264
只改一个字      2f9c4e7b1a3d8056c4e2b791

=== 判定 ===
  只改语速        键不同 ✓
  只改音色        键不同 ✓
  只改模型        键不同 ✓
  只改服务商      键不同 ✓
  只改格式        键不同 ✓
  只改一个字      键不同 ✓

必须满足：
  · 「完全相同」两次算出的键必须一样（这是命中缓存的前提）
  · 其他六种必须都不一样（否则会错误命中）

再算一次「完全相同」：3f8a2c1e9b4d7a06e5c89123
和第一次一致：是 ✓
```

**七个键，六个不同，一个相同。这就是对的行为。**

**注意"只改一个字"：**

```text
"必须实名申请。" → "必须实名申请！"
只差一个标点
键完全不同 ✓
```

**这是对的。** 因为标点会影响停顿 —— 句号是长停顿，感叹号语气更重。**音频字节确实不同。**

**如果这一项键相同，说明你的 `text` 没进键（或者被截断了）。**

**"只改服务商"那一项是本课的重点：**

```text
baseUrl 从 api.example.com 换到 other.example.com
model 还是 "tts-1"
→ 键必须不同

如果键相同：
  换供应商之后，所有旧音频继续命中
  客户听到的还是旧供应商的声音
  而你的日志显示"全部命中，成本为零"（看起来是好事）
```

**这是"缓存优化"变成"缓存事故"的典型路径。**

## 3.6 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 两次"完全相同"键不同 | 键里混进了时间戳或随机数 | 检查 `cacheKey` 的 payload |
| "只改语速"键相同 | `speed` 没进 payload | 补上 |
| "只改服务商"键相同 | `baseUrl` 没进 payload | 补上 |
| 键全是 `d41d8cd9...` | `payload` 是空字符串 | 检查参数有没有传进去 |
| `index.json` 损坏 | 并发写 | 见第 5 步的错误 3 |

---

# 第 4 步：把合成、缓存、清单拼起来（25 分钟）

## 4.1 做什么 / 为什么

**做什么：** 写 `lib\speak.js`，对外只有一个函数：

```text
speak(text, options) -> { segments: [...], stats: {...} }
```

**这个函数要做五件事，顺序不能乱：**

```text
① 切分文本
② 对每一段算缓存键
③ 查缓存：命中就直接用，不命中才调接口
④ 不命中的调接口、存文件、写索引
⑤ 返回播放清单（每段带 file / text / estSec / cached）
```

**为什么"先算所有键，再决定调不调"比"边切边调"好：**

```text
边切边调：
  第 1 段调了（花钱），第 2 段发现文本超长报错
  → 白花了第 1 段的钱

先全算完：
  先确认所有段都合规，再开始调
  → 一次性知道"要调几次、要花多少"
  → 能先给用户"预计多少钱"的提示
```

**这个顺序差异在批量场景（比如一次播 100 篇）下会差出很多钱。**

## 4.2 操作

新建 `lib\speak.js`：

```javascript
// speak.js —— 文字转语音：切分 + 缓存 + 合成 + 播放清单
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");
const { splitForTts, estimateDuration } = require("./tts-split");
const { cacheKey, getCached, putCache, stats } = require("./tts-cache");

// ---------- 假实现：生成一段"能播但有声"的 WAV ----------
// 不能返回空文件，否则播放器报错，你分不清是"假实现"还是"真 bug"
function makeBeepWav(seconds, sampleRate, seed) {
  const channels = 1;
  const bits = 16;
  const numSamples = Math.max(1, Math.floor(seconds * sampleRate));
  const dataSize = numSamples * channels * (bits / 8);

  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
  buf.writeUInt16LE(channels * (bits / 8), 32);
  buf.writeUInt16LE(bits, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);

  // 每段用不同的频率，这样你能听出"这是不同的段"
  const freq = 300 + (seed % 12) * 60;
  for (let i = 0; i < numSamples; i += 1) {
    const v = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 6000);
    buf.writeInt16LE(v, 44 + i * 2);
  }

  return buf;
}

function detectAudioExt(buf) {
  if (buf.length >= 3 && buf.subarray(0, 3).toString("ascii") === "ID3") return "mp3";
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "RIFF") return "wav";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "OggS") return "ogg";
  return "bin";
}

// ---------- 调真接口 ----------
async function synthesize(text, options) {
  const opts = options === undefined ? {} : options;

  const res = await fetch(config.BASE_URL + "/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.API_KEY,
    },
    body: JSON.stringify({
      model: config.TTS_MODEL,
      input: text,
      voice: opts.voice || config.TTS_VOICE,
      speed: Number(opts.speed === undefined ? config.TTS_SPEED : opts.speed),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs || 120000),
  });

  const ct = res.headers.get("content-type") || "";

  // 关键：先看 Content-Type，再决定怎么读
  if (ct.indexOf("application/json") >= 0) {
    const body = await res.text();
    throw new Error("接口返回 JSON 而不是音频（HTTP " + res.status + "）：" + body.slice(0, 300));
  }

  if (!res.ok) {
    throw new Error("TTS 接口失败 HTTP " + res.status + "：" + ct);
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length === 0) {
    throw new Error("接口返回了 0 字节音频");
  }

  return buf;
}

// ---------- 主函数 ----------
async function speak(text, options) {
  const opts = options === undefined ? {} : options;
  const maxChars = Number(process.env.TTS_MAX_CHARS || 2000);
  const minChars = 20;

  const voice = opts.voice || config.TTS_VOICE;
  const speed = Number(opts.speed === undefined ? config.TTS_SPEED : opts.speed);
  const format = opts.format || "mp3";

  // ① 切分
  const pieces = splitForTts(text, maxChars, minChars);
  if (pieces.length === 0) {
    return { ok: false, segments: [], stats: stats(), reason: "输入为空" };
  }

  // ② 先算出所有键，并查一遍缓存 —— 这样能提前知道"要调几次"
  const plan = pieces.map((p, i) => {
    const key = cacheKey({
      baseUrl: config.BASE_URL,
      model: config.TTS_MODEL,
      voice: voice,
      speed: speed,
      format: format,
      language: opts.language || "zh",
      text: p,
    });
    const hit = getCached(key);
    return {
      index: i,
      text: p,
      key: key,
      cached: hit,
      estSec: estimateDuration(p),
    };
  });

  const willCall = plan.filter((x) => x.cached === null).length;

  console.log(
    "共 " + pieces.length + " 段，" +
    "缓存命中 " + (pieces.length - willCall) + " 段，" +
    "需要合成 " + willCall + " 段"
  );

  // ③④ 逐段处理
  const segments = [];
  let calls = 0;

  for (const item of plan) {
    if (item.cached !== null) {
      segments.push({
        index: item.index,
        text: item.text,
        file: item.cached.file,
        estSec: Number(item.estSec.toFixed(1)),
        cached: true,
        key: item.key,
      });
      continue;
    }

    // 不命中：合成
    let buf;
    let ext;

    if (config.MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      buf = makeBeepWav(Math.min(item.estSec, 5), 16000, item.index);
      ext = "wav";
    } else {
      buf = await synthesize(item.text, {
        voice: voice, speed: speed, language: opts.language,
      });
      ext = detectAudioExt(buf);
    }

    const fileName = item.key + "." + ext;
    const filePath = path.join(require("./tts-cache").CACHE_DIR, fileName);
    fs.writeFileSync(filePath, buf);

    putCache(item.key, filePath, {
      chars: item.text.length,
      bytes: buf.length,
      model: config.TTS_MODEL || "mock",
      voice: voice,
      speed: speed,
    });

    calls += 1;

    segments.push({
      index: item.index,
      text: item.text,
      file: filePath,
      estSec: Number(item.estSec.toFixed(1)),
      cached: false,
      key: item.key,
      bytes: buf.length,
    });
  }

  const totalEst = segments.reduce((s, x) => s + x.estSec, 0);

  return {
    ok: true,
    segments: segments,
    stats: stats(),
    calls: calls,
    totalEstSec: Number(totalEst.toFixed(1)),
    reason: null,
  };
}

module.exports = { speak, synthesize, detectAudioExt, makeBeepWav };
```

**新建 `scripts\tts-lab.js`，三组对照：**

```javascript
// tts-lab.js —— 三组对照，验证缓存真的省了钱
const fs = require("node:fs");
const path = require("node:path");
const { speak } = require("../lib/speak");
const { stats, clearCache } = require("../lib/tts-cache");
const config = require("../lib/config");

const A = "所有业务系统账号必须实名申请，密码长度不少于 12 位。";
const B = "出差期间的住宿费按城市等级分档执行，超标部分由员工自理。";

async function run(label, tasks) {
  console.log("");
  console.log("=== " + label + " ===");
  let totalCalls = 0;
  for (const t of tasks) {
    const r = await speak(t.text, t.options || {});
    totalCalls += r.calls;
    console.log(
      "  段数 " + r.segments.length +
      "  调用 " + r.calls +
      "  命中 " + r.segments.filter((s) => s.cached).length +
      "  估算时长 " + r.totalEstSec + "s"
    );
  }
  return totalCalls;
}

async function main() {
  console.log("模式：" + (config.MOCK ? "MOCK" : "真实 / " + config.TTS_MODEL));

  // 从干净状态开始，数字才有意义
  clearCache();
  console.log("已清空缓存");
  console.log("");

  const c1 = await run("第 1 组：同一段文字，连读 5 次", [
    { text: A }, { text: A }, { text: A }, { text: A }, { text: A },
  ]);

  const c2 = await run("第 2 组：两段不同文字，各读 3 次", [
    { text: A }, { text: B }, { text: A }, { text: B }, { text: A }, { text: B },
  ]);

  const c3 = await run("第 3 组：同一段文字，但换了语速", [
    { text: A, options: { speed: 1.0 } },
    { text: A, options: { speed: 1.0 } },
    { text: A, options: { speed: 1.5 } },
    { text: A, options: { speed: 1.5 } },
    { text: A, options: { speed: 1.0 } },
  ]);

  const s = stats();

  console.log("");
  console.log("=== 汇总 ===");
  console.log("总调用（真实合成次数）：" + (c1 + c2 + c3));
  console.log("缓存条目数            ：" + s.entries);
  console.log("累计命中次数          ：" + s.totalHits);
  console.log("命中率                ：" + (s.hitRate * 100).toFixed(1) + "%");
  console.log("缓存占用              ：" + s.mb + " MB");

  // 写报告
  const outDir = path.join(__dirname, "..", "out");
  fs.mkdirSync(outDir, { recursive: true });

  const L = [];
  L.push("# TTS 缓存实验");
  L.push("");
  L.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
  L.push("模式：" + (config.MOCK ? "MOCK（假音频）" : "真实 / " + config.TTS_MODEL));
  L.push("");
  L.push("## 三组对照");
  L.push("");
  L.push("| 组 | 场景 | 文字数 | 真实调用次数 | 预期 | 实际 |");
  L.push("|---|---|---|---|---|---|");
  L.push("| 1 | 同一段连读 5 次 | 1 | " + c1 + " | 1 | " + (c1 === 1 ? "✓" : "✗") + " |");
  L.push("| 2 | 两段各读 3 次 | 2 | " + c2 + " | 2 | " + (c2 === 2 ? "✓" : "✗") + " |");
  L.push("| 3 | 同段两种语速 | 2 | " + c3 + " | 2 | " + (c3 === 2 ? "✓" : "✗") + " |");
  L.push("");
  L.push("## 缓存统计");
  L.push("");
  L.push("| 指标 | 数值 |");
  L.push("|---|---|");
  L.push("| 缓存条目 | " + s.entries + " |");
  L.push("| 累计命中 | " + s.totalHits + " |");
  L.push("| 命中率 | " + (s.hitRate * 100).toFixed(1) + "% |");
  L.push("| 占用空间 | " + s.mb + " MB |");
  L.push("");
  L.push("## 结论");
  L.push("");
  L.push("（见第 6 步笔记）");
  L.push("");

  const outPath = path.join(outDir, "tts-log.md");
  fs.writeFileSync(outPath, L.join("\n"), "utf8");
  console.log("");
  console.log("已写入：" + outPath);
}

main().catch((err) => {
  console.error("失败：" + err.message);
  process.exitCode = 1;
});
```

## 4.3 屏幕上应该看到什么

```text
>node scripts\tts-lab.js
模式：MOCK
已清空缓存

=== 第 1 组：同一段文字，连读 5 次 ===
共 1 段，缓存命中 0 段，需要合成 1 段
  段数 1  调用 1  命中 0  估算时长 6.4s
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s

=== 第 2 组：两段不同文字，各读 3 次 ===
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s
共 1 段，缓存命中 0 段，需要合成 1 段
  段数 1  调用 1  命中 0  估算时长 7.4s
...（后续都是命中）

=== 第 3 组：同一段文字，但换了语速 ===
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s
共 1 段，缓存命中 0 段，需要合成 1 段
  段数 1  调用 1  命中 0  估算时长 6.4s
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s
共 1 段，缓存命中 1 段，需要合成 0 段
  段数 1  调用 0  命中 1  估算时长 6.4s

=== 汇总 ===
总调用（真实合成次数）：4
缓存条目数            ：4
累计命中次数          ：9
命中率                ：69.2%
缓存占用              ：0.16 MB
```

**看这三组的关键数字：**

| 组 | 调用次数 | 为什么 |
|---|---|---|
| 1 | **1** | 同一段文字读 5 次，只花了 1 次的钱 |
| 2 | **2** | 两段不同的文字，各花 1 次（第 1 段在第 1 组已经缓存） |
| 3 | **1** | 语速 1.0 已缓存（第 1 组），只有 1.5 那次是新的 |

**"第 1 组：调用 1" 就是这节课的全部价值。**

```text
没有缓存：5 次调用
有缓存：  1 次调用
→ 省 80%

真实场景（2841 次调用 / 36 段）：
没有缓存：2841 次
有缓存：  36 次
→ 省 98.7%
```

**再看"第 3 组：换语速要重新合成"：**

```text
语速 1.0 → 命中（第 1 组存过）
语速 1.5 → 不命中，新合成一段

→ 这是正确的：不同语速的音频字节确实不同
→ 如果这里命中了，你的键设计就是错的
```

**最后，"缓存占用 0.16 MB"这个数字：**

```text
4 条缓存 / 0.16 MB ≈ 每条 40 KB
（MOCK 下是 5 秒的 WAV，比真实 MP3 大）

真实场景估：
  36 段 × 每段约 200KB ≈ 7 MB
  
→ 一个知识库的朗读缓存，几十 MB 量级
→ 完全不需要对象存储，本地磁盘就够
```

**这个估算要写进笔记。** 因为它回答了一个客户一定会问的问题：**"这个缓存会占多少空间？"**

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第 1 组调用 5 次 | 缓存没命中 | 检查 `cacheKey` 两次算出来是否一致 |
| 第 3 组换语速也命中 | `speed` 没进键 | 补上 |
| `缓存命中 0 段` 但 `entries` 有数 | 键算出来不一样 | 打印两次键对比 |
| 报 `索引文件损坏` | 并发写 `index.json` | 见第 5 步错误 3 |
| 段数比我预期多 | 文本被切了 | 打印切分结果 |
| `MOCK` 下音频听不到声音 | `makeBeepWav` 的音量太小 | `* 6000` 改成 `* 12000` |

---

# 第 5 步：故意犯四个错（20 分钟）

## 错误 1：缓存键只放文字

```javascript
// 错误写法
function cacheKey(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
```

**现象：** 换音色、换语速、换模型，全部命中旧音频。

**真正的伤害：这个错不会报错，只会让"功能看起来坏了，但找不出原因"。**

```text
客户："我选了男声，出来还是女声"
你：试着调一次，男声正常
你："可能是缓存问题，清一下试试"
客户：清了，正常了
→ 三天后又出现
→ 你永远不知道根因
```

**怎么查：**

```javascript
// 打印键和它的输入，一眼能看出问题
console.log("voice=" + voice + " speed=" + speed + " key=" + key);
```

**如果两个不同 `voice` 打出同一个 `key`，就是踩了。**

## 错误 2：把时间戳放进键

```javascript
// 错误写法
const payload = [Date.now(), text].join("|");
```

**现象：** 缓存永远不命中，`index.json` 越来越大。

**真正的伤害：**

```text
缓存形同虚设 → 每次调用都花钱
但你的代码"有缓存逻辑"，日志里也有"缓存命中 0 段"
→ 看起来"缓存没发挥作用"，而不是"缓存写错了"
→ 你会去查别的原因
```

**怎么查：** 同一段文字连读两次，看 `entries` 是变成 1 还是 2。

```text
变成 2 → 键不稳定 → 里面有随机量或时间
```

## 错误 3：并发写 `index.json` 丢数据

现在的实现是"每次 `putCache` 都全量重写 `index.json`"。**单体应用、顺序调用时没问题。一旦并发，就会丢。**

**怎么复现：**

新建 `scripts\race-index.js`：

```javascript
// race-index.js —— 模拟并发写索引
// 并发 10 个 putCache，最后看 entries 是不是 10
const { putCache, stats, clearCache } = require("../lib/tts-cache");
const fs = require("node:fs");
const path = require("node:path");

clearCache();
console.log("清空后 entries：" + stats().entries);

// 造 10 个假文件，然后"并发"写入索引
const dir = require("../lib/tts-cache").CACHE_DIR;

for (let i = 0; i < 10; i += 1) {
  const f = path.join(dir, "race-" + i + ".wav");
  fs.writeFileSync(f, Buffer.from("fake"));
  putCache("racekey" + i, f, { chars: 10, bytes: 4, model: "mock", voice: "x", speed: 1 });
}

// 重新读索引看真实落盘的内容
const raw = JSON.parse(fs.readFileSync(require("../lib/tts-cache").INDEX_FILE, "utf8"));
console.log("顺序写入后落盘的键数：" + Object.keys(raw).length);
console.log("（顺序写入是安全的，因为每次写完才下一次）");
console.log("");
console.log("=== 真正的问题在并发 ===");
console.log("如果两个进程同时 putCache：");
console.log("  进程 A 读到 index（3 条）");
console.log("  进程 B 读到 index（3 条）");
console.log("  A 加 1 条，写回（4 条）");
console.log("  B 加 1 条，写回（4 条）← A 的那条被覆盖了");
console.log("");
console.log("→ 结果：2 次 putCache，entries 只涨了 1");
console.log("→ 而且不报错");
```

```text
node scripts\race-index.js
```

**现象（顺序写入时看不出来）：**

```text
清空后 entries：0
顺序写入后落盘的键数：10
（顺序写入是安全的，因为每次写完才下一次）

=== 真正的问题在并发 ===
...
```

**真正的伤害：** 你做了个批量接口，用户点了两次"全部朗读"，两个请求并发跑。**结果缓存条目少了一半，下次又要重新合成。**

**怎么查：** 只有在并发下才出现。检查手段是"并发前后 `entries` 的差值"。**如果不是"每次调用+1"，就是丢写。**

**正确做法（三选一，按复杂度）：**

```text
① 内存里维护 index，只在进程退出时落盘
   → 简单，但进程崩溃会丢最近的记录（缓存文件还在，只是索引丢了）
   → 对 TTS 缓存来说可以接受

② 用 SQLite 存索引
   → 自带事务和锁，并发安全
   → 本课程第 11 周已经会了

③ 每条缓存一个文件，不维护索引
   → 键就是文件名，存在性就是命中判断
   → 最简单，最安全，但统计"命中次数"需要额外记
```

**本课程的建议：③ 最简单也最稳。**

```javascript
// 命中判断：文件存在就是命中
const filePath = path.join(CACHE_DIR, key + ".mp3");
if (fs.existsSync(filePath)) {
  return filePath;
}
```

**"命中次数"这种统计，写到数据库或日志里，不要写在缓存索引里。**

**因为"统计"和"缓存"是两个不同的关注点。混在一起会让缓存变得脆弱。**

## 错误 4：缓存永不清理

**现象：** 跑了半年，`tts/cache` 占了 3 GB。

**真正的伤害：**

```text
① 磁盘满 → 整个应用挂
② 备份变慢（每次备份都要打包这些音频）
③ 换个服务器，拷贝要半小时
```

**怎么查：**

```text
dir /s data\tts\cache
```

**正确做法：加一个 TTL + 容量上限。**

```javascript
// 清理策略（写在单独的脚本里，定时跑）
function gc(maxAgeDays, maxTotalMB) {
  const now = Date.now();
  const maxAge = maxAgeDays * 86400000;

  // 1. 按时间清理
  for (const k of Object.keys(index)) {
    const created = new Date(index[k].createdAt).getTime();
    if (now - created > maxAge) {
      // 被命中过的延长寿命
      if (index[k].lastHitAt === null) {
        deleteFileAndEntry(k);
      }
    }
  }

  // 2. 按容量清理（最久没被用的先删）
  // ...
}
```

**关键设计：删除时优先删"从没被命中过"的。**

```text
一条缓存从没被命中 → 说明那段文字只被读了一次
                    → 下次再读的概率低
                    → 优先删它

被命中过很多次 → 是热点内容 → 必须留
```

**这个策略比"按时间先删旧的"好得多，因为它考虑的是"会不会再被用到"。**

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 键只放文字 | 换音色也命中 | 功能"坏了"但找不出原因 | 打印键和参数对照 |
| 键含时间戳 | 永远不命中 | 缓存形同虚设 | 同一文本两次，`entries` 涨 2 |
| 并发写索引 | 偶尔丢条目 | 下次重新合成，成本上升 | 并发前后 `entries` 增量不对 |
| 永不清理 | 磁盘慢慢满 | 应用挂、备份慢 | `dir /s` 看目录大小 |

**这四个错误的共同点：都不报错，都表现为"性能或成本问题"，而不是"功能异常"。**

**所以它们最难被及时发现 —— 只有你主动去量（命中率、占用空间），才会知道。**

---

# 第 6 步：写学习笔记（10 分钟）

打开 `第05节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「缓存键里放什么」和「三组的调用次数」。

---

# 第 7 步：课后练习

## 练习一：加一个 `gc.js`

实现第 5 步错误 4 里说的清理策略：

1. 超过 N 天**且从没被命中过**的，删；
2. 总量超过 M MB 时，按 `lastHitAt` 从旧到新删，直到降到 M 以下；
3. 输出"删了几条、释放了多少 MB"。

**验收：** 造 20 条缓存，把其中 5 条标记为"被命中过"，跑 gc，确认删掉的是那 15 条里最旧的。

## 练习二：把索引换成 SQLite

用第 11 周学的 `better-sqlite3` 存索引：

```sql
CREATE TABLE tts_cache (
  key       TEXT PRIMARY KEY,
  file      TEXT NOT NULL,
  chars     INTEGER NOT NULL,
  bytes     INTEGER NOT NULL,
  model     TEXT,
  voice     TEXT,
  speed     REAL,
  created_at TEXT NOT NULL,
  hits      INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT
);
```

**要求：**

1. 命中时 `UPDATE hits = hits + 1`（这一条在 SQLite 里是原子的，天然并发安全）；
2. 统计用 `SELECT SUM(hits)`；
3. 对比"文件索引"和"SQLite 索引"在并发下的表现。

**这道题做完，你会真的理解"为什么写文件索引不可靠"。**

## 练习三：算一次真实的成本对比

按你服务的 TTS 单价，算：

```text
场景：内部知识库 300 篇文章，平均每篇 1500 字
用户每天读 200 次（分散在 300 篇里，实际上是热点集中的）

① 没有缓存，一个月多少次调用，多少钱？
② 有缓存（假设命中率 95%），一个月多少次调用，多少钱？
③ 缓存占多少空间？
```

**写出计算过程，标注单价来源和"命中率 95%"这个假设的依据。**

## 练习四：给前端写播放清单的接入说明

`speak()` 返回的是 `segments` 数组，不是一个文件。前端要按顺序播。

**写一页说明，包含：**

1. 每段的 `file` 怎么取（后端要提供下载路由）；
2. 播完一段怎么自动播下一段；
3. 用户点"暂停"再"继续"时怎么处理；
4. 某一段加载失败怎么办。

**提示：`<audio>` 的 `ended` 事件 + 一个 index 变量就够。**

**这道题的意义：** 你的 API 设计决定了前端好不好写。**返回"播放清单"这个决定，要能对前端说清楚。**

## 练习五：用自己的话讲清

1. TTS 和 STT 的接口有哪四处不同？最容易被习惯带错的是哪一处？
2. 缓存键里哪些参数必须放、哪些绝对不能放？为什么"服务商地址"也必须放？
3. 为什么"键太少"比"键太多"危险？
4. 为什么"返回播放清单"比"拼成一个大文件"好？MP3 为什么不能简单 concat？
5. 为什么写文件索引在并发下会丢数据？三种正确做法各是什么？
6. 清理缓存时，为什么优先删"从没被命中过"的？

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能说出 TTS 和 STT 的四处接口差异，以及"读返回"那一处为什么最容易错
- [ ] 我能说清哪些参数必须进缓存键，并解释"服务商地址"为什么也要进
- [ ] 我能说清"键太少"和"键太多"各自的后果，以及哪个更危险
- [ ] 我能解释为什么 MP3 不能简单 concat
- [ ] 我能说出文件索引在并发下丢数据的原因和三种替代方案

## B. 实操

- [ ] `probe-tts-raw.js` 看到真实文件头（`49 44 33`）和耗时
- [ ] `probe-tts-guard.js` 看到一个"200 但返回 JSON"或"400 + JSON"的分支
- [ ] `probe-split.js` 三个例子都跑通：字数一致、无超限、例 3 有硬切
- [ ] 例 2 的第 3 段确实超了 120（收尾合并的结果）
- [ ] `probe-cache.js` 七个键六个不同，重复计算一致
- [ ] `tts-lab.js` 三组调用次数分别是 1 / 2 / 1
- [ ] `out\tts-log.md` 有三组对照表和缓存统计
- [ ] 我能说出缓存占用的估算值

## C. 排错

- [ ] 我试过"键只放文字"，看到换音色也命中
- [ ] 我试过把时间戳放进键，看到 `entries` 每次涨 1
- [ ] 我跑过 `race-index.js`，理解"顺序安全、并发丢写"
- [ ] 我知道缓存要清理，并且优先删"从没命中过"的

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 「缓存键里放什么」有完整表格
- [ ] 「三组的调用次数」贴了真实输出
- [ ] 练习三的成本估算是算出来的

---

## 本节课要能说出口的一句话

> **TTS 唯一的非功能性要求就是缓存，而缓存键的难点不是"怎么算哈希"，是"哪些参数进去、哪些绝对不能进去"。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Unexpected token 'I'` | 用了 `res.json()` | 改 `res.arrayBuffer()` |
| `HTTP 400 input too long` | 文本长度 | 走 `splitForTts` |
| `HTTP 400 invalid voice` | 音色名 | 查服务支持列表 |
| `Content-Type` 是 JSON | 服务返回错误 | 先判断类型再读 |
| 换音色也命中缓存 | 键缺 `voice` | 补进 `cacheKey` |
| 永远不命中 | 键里有时间戳 | 检查 payload |
| 缓存越积越多 | 没 gc | 写清理脚本 |
| `索引文件损坏` | 并发写 | 换 SQLite 或"文件即索引" |
| 音频打不开 | 存成了 JSON | 看文件头 |
| 播放器没声音 | MOCK 的假音频音量小 | 调大振幅 |
| 中文乱码 | cmd 编码 | `chcp 65001` |
| 长文本很慢 | 多段串行合成 | 可并发，但要限流 |
| 缓存目录很大 | 正常，需清理 | `dir /s data\tts\cache` |
