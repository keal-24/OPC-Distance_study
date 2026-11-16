# 第 104 节课：多模态错误处理

> 这节课结束时，你手上有：`mm-app\lib\errors.js`（六类错误的识别码 + 用户话术 + 是否重试）、`mm-app\lib\retry.js`（指数退避，只重试该重试的）、`mm-app\lib\error-middleware.js`（Express 统一出口）、`mm-app\out\error-matrix.md`（错误矩阵）。

**建议用时**：115 分钟
**前置**：第 103 节课的 `mm-app`（看图、生图、听音、说话四条链路都跑通）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

四种能力你都跑通了：看图、生图、听音、说话。

**但每一种都只在"顺利"的情况下跑通过。**

```text
你测过的：上传一张正常的图，模型返回描述
你没测过的：上传一张 20MB 的图、上传一个 .exe 改名的 .jpg、
            模型说"这张图违反政策"、返回的不是 JSON、
            额度用完、网络断了、接口 500
```

## 0.2 今天这个坑长什么样

> 你交付了一个"图片识别发票"的小工具。自己测了 20 张，全对。
>
> 客户用了三天，发来一条消息：**"这个功能老是报错，一堆东西看不懂。"**
>
> 你远程连上去看，发现三种情况混在一起，用户全看到同一句 `请求失败`：
>
> ```text
> 情况 A：用户传了一张 18MB 的手机原图 → HTTP 413
> 情况 B：用户传了一张身份证，模型拒绝处理 → finish_reason: content_filter
> 情况 C：用户的网络断了 → fetch failed
> ```
>
> **三种情况的处理方式完全不同：**
>
> ```text
> A → 应该提示"图片太大，请压缩后再试"，或者干脆在上传前就压
> B → 应该提示"这类图片不支持处理"，而且绝对不要重试（重试一百次都一样）
> C → 应该提示"网络不稳定，请重试"，并且自动重试 2 次
> ```
>
> **你全给了一句"请求失败"，所以用户只能一遍遍重试，一遍遍失败。**

**这就是"错误没有分类"的代价。**

## 0.3 今天要建的三样东西

| 东西 | 作用 | 没有它会怎样 |
|---|---|---|
| **错误码** | 每种失败有自己的编号 | 全都叫"失败"，查日志也分不清 |
| **用户可读的话** | 每种错误给用户一句人话 | 用户看到英文栈，来问你 |
| **是否可重试** | 明确哪些能自动重试、哪些绝对不能 | 对"内容审核拒绝"重试 5 次，白花钱 |

**最容易被忽略的是第三个。**

```text
对"网络超时"重试     → 正确，可能这次就通了
对"内容审核拒绝"重试 → 错，模型已明确拒绝，重试一百次都是拒绝
对"额度用完"重试     → 错，只会让账单更难看
对"图片太大"重试     → 错，同样的图永远同样地太大
```

**"重试"这个动作，用错了比不用更糟。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `lib\errors.js` | `第06节课\03-练习代码\mm-app\` | 错误码表 + 分类函数 + 用户话术 |
| `lib\retry.js` | 同上 | 指数退避 + 抖动，只重试该重试的 |
| `lib\error-middleware.js` | 同上 | Express 统一错误出口 |
| `scripts\error-lab.js` | 同上 | 六种错误逐个真实触发 |
| `scripts\test-classify.js` | 同上 | 分类器单元测试 |
| `scripts\test-retry.js` | 同上 | 重试策略测试 |
| `out\error-matrix.md` | 同上 `out\` | 错误矩阵 |
| `NOTES.md` | `第06节课\02-笔记\` | 第 6 步填 |

---

# 第 1 步：把六种错误摸清楚（30 分钟）

## 1.1 做什么 / 为什么

**做什么：** 六种错误逐个**真实触发一次**，把它们的"指纹"记下来。

**为什么必须亲手触发：**

因为**你不知道每种错误长什么样，就写不出准确的识别逻辑。**

```text
你猜的："图片太大" 大概是 HTTP 400
实际：  HTTP 413，而且不同服务可能是 400 + 特定 message
→ 你按 400 写，结果把"参数错误"也当成"图片太大"
```

**六种错误的指纹，必须来自真实观察，不能来自猜测。**

## 1.2 六种错误

| 编号 | 类型 | 怎么触发 | 典型指纹 |
|---|---|---|---|
| `IMG_TOO_LARGE` | 图片太大 | 传 20MB 以上的图 | HTTP 413，或 400 + `too large` |
| `BAD_FORMAT` | 格式不支持 | 把 .txt 的 base64 当 .jpg 上传 | HTTP 400 + `invalid image` |
| `CONTENT_FILTER` | 内容审核拒绝 | 传身份证 / 人脸 | **HTTP 200** + `finish_reason: "content_filter"` |
| `TIMEOUT` | 超时 | 把超时设成 1ms | `err.name` = `TimeoutError` / `AbortError` |
| `AUTH` / `QUOTA` | key 错 / 额度用完 | 用无效 key | HTTP 401 / 429 / 402 |
| `BAD_RESPONSE` | 返回不是预期结构 | 请求返回 HTML 的地址 | `res.json()` 抛 `SyntaxError` |

**六种里，有一种特别容易被误判：**

```text
CONTENT_FILTER 是 HTTP 200！

→ 你以为成功了
→ 去读 choices[0].message.content
→ 拿到 null 或者一句"我无法处理这张图片"
→ 存进数据库，后面全乱
→ 用户重试，再被拒，再重试
```

**这就是为什么"只判断 res.ok"是错的 —— 它对这一种完全无效。**

## 1.3 操作

**1.** 进项目：

```text
cd "B:\OPC-Distance_study\每周课程\03-数据与智能\第15周-多模态\第06节课\03-练习代码"
xcopy /E /I /Y "..\第05节课\03-练习代码\mm-app" mm-app
cd mm-app
```

**2.** 先确认 `lib\vision.js` 里有没有 `content_filter` 分支：

```javascript
// 第 99 节课应该写过这一段
if (choice.finish_reason === "content_filter") {
  const err = new Error("内容被审核拒绝");
  err.name = "ContentFilterError";
  throw err;
}
```

**没有就现在补上。** 这是今天的地基。

**3.** 新建 `scripts\error-lab.js`，六种逐个触发：

```javascript
// error-lab.js —— 六种错误逐个触发，把指纹记下来
// 用法：node scripts\error-lab.js
// 前提：.env 里 MOCK=false，且 VISION_MODEL 已配置
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });

const config = require("../lib/config");
const { makePng } = require("../lib/imagine");

function fingerprint(err) {
  return {
    name: err.name || "(no name)",
    status: err.status === undefined ? null : err.status,
    message: String(err.message || "").slice(0, 160),
    cause: err.cause === undefined ? null : String(err.cause.code || err.cause.message || err.cause).slice(0, 80),
  };
}

function show(f) {
  console.log("  name    ：" + f.name);
  console.log("  status  ：" + (f.status === null ? "(无)" : f.status));
  console.log("  message ：" + f.message);
  if (f.cause !== null) console.log("  cause   ：" + f.cause);
}

// ---------- 1. 图片太大 ----------
async function caseTooLarge() {
  console.log("");
  console.log("=== 1. IMG_TOO_LARGE ===");
  console.log("手法：生成一张 3000x3000 的 PNG，base64 后约 36MB，直接发出去");

  const big = makePng(3000, 3000, [120, 130, 140]);
  const b64 = big.toString("base64");
  console.log("  PNG 字节：" + big.length + "，base64 后：" + b64.length);

  try {
    await rawVisionCall(b64, "image/png");
    console.log("  居然成功了 —— 说明这个服务的上限比 27MB 高，加大尺寸再试");
  } catch (err) {
    show(fingerprint(err));
  }
}

// ---------- 2. 格式不支持 ----------
async function caseBadFormat() {
  console.log("");
  console.log("=== 2. BAD_FORMAT ===");
  console.log("手法：把一段纯文本的 base64 当成 image/png 发出去");

  const fake = Buffer.from("这不是图片，这是我随手写的一段文字。").toString("base64");

  try {
    await rawVisionCall(fake, "image/png");
    console.log("  居然成功了 —— 服务端可能没校验图片内容");
  } catch (err) {
    show(fingerprint(err));
  }
}

// ---------- 3. 内容审核 ----------
function caseContentFilter() {
  console.log("");
  console.log("=== 3. CONTENT_FILTER ===");
  console.log("这一种不能硬造 —— 它取决于服务的内容政策和输入内容。");
  console.log("在内部系统里几乎不会触发（输入是发票、合同）。");
  console.log("但客户传身份证、人脸、银行卡时可能触发。");
  console.log("");
  console.log("所以你不测「触发」，你测「分支存在」：");
  console.log("  打开 lib\\vision.js，确认有：");
  console.log("    if (choice.finish_reason === \"content_filter\") { throw ... }");
  console.log("");
  console.log("然后跑下面这个纯本地测试，验证这个分支会正确抛出：");
  console.log("  node scripts\\test-classify.js   （第 2 步会写）");
}

// ---------- 4. 超时 ----------
async function caseTimeout() {
  console.log("");
  console.log("=== 4. TIMEOUT ===");
  console.log("手法：把超时设成 1ms，任何请求都必然超时");

  try {
    await rawGet(config.BASE_URL + "/models", { timeoutMs: 1 });
    console.log("  居然没超时");
  } catch (err) {
    const f = fingerprint(err);
    show(f);
    console.log("");
    console.log("  → 关键：name 到底是 TimeoutError 还是 AbortError");
    console.log("    两者都必须能识别（不同 Node 版本行为不同）");
  }
}

// ---------- 5. key 不对 ----------
async function caseAuth() {
  console.log("");
  console.log("=== 5. AUTH（key 不对）===");
  console.log("手法：用一个格式正确但无效的 key");

  try {
    await rawGet(config.BASE_URL + "/models", {
      apiKey: "sk-invalid-key-for-testing-only",
      timeoutMs: 10000,
    });
    console.log("  居然成功了 —— 服务没校验 key");
  } catch (err) {
    const f = fingerprint(err);
    show(f);
    console.log("");
    console.log("  → 401 是「key 不对」，429 才是「限流/额度」，别混");
  }
}

// ---------- 6. 返回不是 JSON ----------
async function caseBadResponse() {
  console.log("");
  console.log("=== 6. BAD_RESPONSE ===");
  console.log("手法：请求一个返回 HTML 的地址，然后照样 res.json()");

  const url = config.BASE_URL.replace(/\/v1\/?$/, "") + "/this-path-returns-html";
  console.log("  请求：" + url);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    console.log("  status      ：" + res.status);
    console.log("  Content-Type：" + (res.headers.get("content-type") || "(无)"));
    const json = await res.json();     // 故意这么写，就是要炸
    console.log("  居然解析成功：" + JSON.stringify(json).slice(0, 100));
  } catch (err) {
    const f = fingerprint(err);
    show(f);
    console.log("");
    console.log("  → 这不是网络错误，是「你拿 HTML 当 JSON 解析」");
    console.log("    如果不单独分类，用户会以为「网络不好」");
  }
}

// ---------- 工具 ----------
async function rawGet(url, opts) {
  const o = opts === undefined ? {} : opts;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + (o.apiKey || config.API_KEY) },
    signal: AbortSignal.timeout(o.timeoutMs || 10000),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error("HTTP " + res.status + "：" + body.slice(0, 200));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function rawVisionCall(b64, mime) {
  const res = await fetch(config.BASE_URL + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.API_KEY,
    },
    body: JSON.stringify({
      model: config.VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "描述这张图" },
          { type: "image_url", image_url: { url: "data:" + mime + ";base64," + b64 } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error("HTTP " + res.status + "：" + body.slice(0, 200));
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const choice = json.choices && json.choices[0];
  if (choice === undefined) {
    const err = new Error("没有 choices 字段");
    err.name = "BadResponseError";
    throw err;
  }
  if (choice.finish_reason === "content_filter") {
    const err = new Error("内容被审核拒绝");
    err.name = "ContentFilterError";
    throw err;
  }
  return choice.message.content;
}

async function main() {
  console.log("模式：" + (config.MOCK ? "MOCK" : "真实 / " + (config.VISION_MODEL || "(未配置)")));
  if (config.MOCK) {
    console.log("");
    console.log("!!! MOCK 模式下这些错误一个都触发不了。");
    console.log("!!! 今天的核心就是「看真实的错误长什么样」。");
    console.log("!!! 请把 .env 的 MOCK 改成 false，并配置 VISION_MODEL。");
    console.log("");
    return;
  }
  if (!config.VISION_MODEL) {
    console.log("");
    console.log("!!! 没有配置 VISION_MODEL，无法触发视觉相关错误。");
    console.log("");
    return;
  }

  await caseTooLarge();
  await caseBadFormat();
  caseContentFilter();
  await caseTimeout();
  await caseAuth();
  await caseBadResponse();

  console.log("");
  console.log("=== 下一步 ===");
  console.log("把每种错误的 name / status / message 抄进 out\\error-matrix.md，");
  console.log("然后写 lib\\errors.js，用这些真实指纹做分类。");
  console.log("注意：抄之前先看清楚 status 是 (无) 还是数字 —— 这一列决定了识别逻辑。");
}

main().catch((err) => {
  console.error("实验脚本自身崩了：" + err.message);
  process.exitCode = 1;
});
```

**4.** 跑：

```text
node scripts\error-lab.js
```

## 1.4 屏幕上应该看到什么

```text
>node scripts\error-lab.js
模式：真实 / gpt-4o-mini

=== 1. IMG_TOO_LARGE ===
手法：生成一张 3000x3000 的 PNG，base64 后约 36MB，直接发出去
  PNG 字节：27005132，base64 后：36006844
  name    ：(no name)
  status  ：413
  message ：HTTP 413：{"error":{"message":"Request entity too large","type":"invalid_request_error"}}

=== 2. BAD_FORMAT ===
手法：把一段纯文本的 base64 当成 image/png 发出去
  name    ：(no name)
  status  ：400
  message ：HTTP 400：{"error":{"message":"Invalid image data","type":"invalid_request_error"}}

=== 3. CONTENT_FILTER ===
这一种不能硬造 —— 它取决于服务的内容政策和输入内容。
在内部系统里几乎不会触发（输入是发票、合同）。
但客户传身份证、人脸、银行卡时可能触发。

所以你不测"触发"，你测"分支存在"：
  打开 lib\vision.js，确认有：
    if (choice.finish_reason === "content_filter") { throw ... }

然后跑下面这个纯本地测试，验证这个分支会正确抛出：
  node scripts\test-classify.js   （第 2 步会写）

=== 4. TIMEOUT ===
手法：把超时设成 1ms，任何请求都必然超时
  name    ：TimeoutError
  status  ：(无)
  message ：The operation was aborted due to timeout

  → 关键：name 到底是 TimeoutError 还是 AbortError
    两者都必须能识别（不同 Node 版本行为不同）

=== 5. AUTH（key 不对）===
手法：用一个格式正确但无效的 key
  name    ：(no name)
  status  ：401
  message ：HTTP 401：{"error":{"message":"Incorrect API key provided","type":"invalid_request_error"}}

  → 401 是"key 不对"，429 才是"限流/额度"，别混

=== 6. BAD_RESPONSE ===
手法：请求一个返回 HTML 的地址，然后照样 res.json()
  请求：https://api.example.com/this-path-returns-html
  status      ：404
  Content-Type：text/html
  name    ：SyntaxError
  status  ：(无)
  message ：Unexpected token '<', "<!DOCTYPE "... is not valid JSON

  → 这不是网络错误，是"你拿 HTML 当 JSON 解析"
    如果不单独分类，用户会以为"网络不好"
```

**把指纹抄成一张表。这张表是写 `errors.js` 的唯一依据：**

| 编号 | name | status | message 特征 |
|---|---|---|---|
| `IMG_TOO_LARGE` | — | 413 | `entity too large` |
| `BAD_FORMAT` | — | 400 | `Invalid image data` |
| `CONTENT_FILTER` | `ContentFilterError` | **200** | —（看 `finish_reason`） |
| `TIMEOUT` | `TimeoutError` / `AbortError` | — | `aborted due to timeout` |
| `AUTH` | — | 401 | `Incorrect API key` |
| `BAD_RESPONSE` | `SyntaxError` | — | `Unexpected token '<'` |

**三个关键观察，直接决定你的分类代码怎么写：**

```text
① 六种里只有两种能靠 err.name 区分（CONTENT_FILTER / TIMEOUT / BAD_RESPONSE）
   另外三种必须靠 HTTP status
   → 所以你抛错误时必须把 res.status 带上
   → err.status = res.status 这一行是整节课的地基

② CONTENT_FILTER 的 status 是 200
   → 只判断 res.ok 对它完全无效
   → 必须检查 finish_reason

③ BAD_RESPONSE 的 status 是 (无)
   → 它是 SyntaxError，跟网络无关
   → 如果不单独分类，用户会以为是网络问题，反复重试
```

**第 ① 条最重要。** 如果你现在回去看自己的代码，发现 `throw new Error("HTTP错误")` 里没有把 status 带出来 —— **那你的分类器什么都识别不了。**

## 1.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 六个用例全都没触发 | `MOCK=true` | 改 `false` |
| `IMG_TOO_LARGE` 成功了 | 27MB 没超过上限 | 加大到 4000x4000 |
| `TIMEOUT` 的 name 是 `AbortError` | Node 版本差异 | **两种都要认** |
| `BAD_RESPONSE` 没炸 | 那个地址返回了 JSON | 换一个确定的 HTML 路径 |
| `AUTH` 返回 200 | 服务不校验 key | 记录这个事实，别按 401 写死 |
| 全都没有 `status` | 你抛错时没带 | 补 `err.status = res.status` |

---

# 第 2 步：写错误分类（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `lib\errors.js`，把"原始错误"翻译成"我们的错误码"。

**为什么要有这一层：**

```text
原始错误          → 太杂、太底层、太依赖具体服务
HTTP status       → 你的业务代码不该知道 "413" 是什么
AppError（code）  → 业务代码只知道 IMG_TOO_LARGE
```

**这层解耦的价值：换服务商时只改 `errors.js` 一个文件。**

```text
A 服务商：图片太大 → 413
B 服务商：图片太大 → 400 + "payload exceeds limit"
→ 你的业务代码一行不用改
```

## 2.2 一个错误对象应该带什么

| 字段 | 作用 | 谁能看到 |
|---|---|---|
| `code` | 机器识别的编号 | 你的代码 |
| `userMessage` | 给用户看的一句话（中文） | 用户 |
| `detail` | 原始错误内容 | **只有日志** |
| `retryable` | 能不能自动重试 | 重试逻辑 |
| `status` | 建议返回给前端的 HTTP 码 | 路由层 |

**`retryable` 是这一节最重要的字段。**

```text
true  ：网络超时、5xx、限流（429 + rate limit）
false ：内容审核拒绝、格式不支持、图片太大、认证失败、额度用完
```

**注意 `429` 有两种含义，必须分开：**

```text
"rate limit exceeded"     → 限流，暂时性 → 重试
"insufficient_quota"      → 额度用完   → 不重试（等多久都没用）
```

**两者都返回 429！** 所以必须看 message 内容。

**这个区分不做，你会对一个"余额已空"的账号重试十次，账单更难看，日志里十条一样的错误。**

## 2.3 操作

新建 `lib\errors.js`：

```javascript
// errors.js —— 把各种原始错误翻译成统一的 AppError
class AppError extends Error {
  constructor(code, userMessage, options) {
    super(userMessage);
    const o = options === undefined ? {} : options;
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.detail = o.detail === undefined ? null : String(o.detail).slice(0, 800);
    this.retryable = o.retryable === true;
    this.status = o.status === undefined ? 500 : o.status;
  }
}

// 给用户看的话。注意：不暴露服务商名字、不暴露 key、不暴露内部路径。
const USER_MESSAGES = {
  IMG_TOO_LARGE: "图片太大了，请压缩到 5MB 以内再上传。",
  BAD_FORMAT: "这个文件格式不支持。请上传 JPG、PNG 或 WebP 图片。",
  CONTENT_FILTER: "这类图片暂时无法处理。请换一张，或联系人工处理。",
  TIMEOUT: "处理超时了，请稍后重试。",
  RATE_LIMITED: "请求太频繁了，请等几秒再试。",
  QUOTA: "服务额度暂时不足，请联系管理员。",
  BAD_RESPONSE: "服务返回异常，请稍后重试。如果反复出现，请联系我们。",
  AUTH: "服务配置有问题，请联系管理员。",
  NETWORK: "网络连接失败，请检查网络后重试。",
  AUDIO_TOO_LONG: "音频太长了，请分段后再试。",
  TEXT_TOO_LONG: "文字太长了，请分段后再试。",
  UNKNOWN: "出错了，请稍后重试。",
};

// 可重试的码
const RETRYABLE = new Set(["TIMEOUT", "NETWORK", "BAD_RESPONSE", "RATE_LIMITED"]);

// 建议的 HTTP 状态码
const STATUS_MAP = {
  IMG_TOO_LARGE: 413,
  BAD_FORMAT: 415,
  CONTENT_FILTER: 422,
  TIMEOUT: 504,
  RATE_LIMITED: 429,
  QUOTA: 503,
  BAD_RESPONSE: 502,
  AUTH: 500,
  NETWORK: 503,
  AUDIO_TOO_LONG: 413,
  TEXT_TOO_LONG: 413,
  UNKNOWN: 500,
};

function makeAppError(code, detail) {
  return new AppError(
    code,
    USER_MESSAGES[code] || USER_MESSAGES.UNKNOWN,
    {
      detail: detail,
      retryable: RETRYABLE.has(code),
      status: STATUS_MAP[code] || 500,
    }
  );
}

// ---------- 核心：从原始错误识别分类 ----------
// 判断顺序很重要：
//   1. 先看我们自己抛的 name（最准）
//   2. 再看 status（次准）
//   3. 最后看 message（兜底，最不可靠）
function classify(err) {
  const name = err.name || "";
  const status = err.status === undefined ? null : err.status;
  const raw = String(err.message || "");
  const lower = raw.toLowerCase();

  // 1. 内容审核（我们自己抛的，status 是 200，只能靠 name）
  if (name === "ContentFilterError") return makeAppError("CONTENT_FILTER", raw);

  // 2. 超时。两种 name 都要认
  if (name === "TimeoutError" || name === "AbortError" || lower.indexOf("timeout") >= 0) {
    return makeAppError("TIMEOUT", raw);
  }

  // 3. 网络层（fetch failed）
  if (name === "TypeError" && lower.indexOf("fetch failed") >= 0) {
    const cause = err.cause === undefined ? "" : String(err.cause.code || err.cause.message || err.cause);
    return makeAppError("NETWORK", raw + " / " + cause);
  }

  // 4. 返回不是 JSON
  if (name === "SyntaxError" && lower.indexOf("is not valid json") >= 0) {
    return makeAppError("BAD_RESPONSE", raw);
  }

  // 5. 已经是我们自己的 AppError，原样返回
  if (name === "AppError") return err;

  // 6. 按 HTTP 状态细分
  if (status !== null) {
    // ---- 413 / "too large" ----
    if (status === 413 || lower.indexOf("too large") >= 0 || lower.indexOf("exceeds") >= 0) {
      // 注意：这里是"默认按图片处理"。音频/文本的太长由调用方在业务层判断。
      return makeAppError("IMG_TOO_LARGE", raw);
    }

    // ---- 401 / 403：配置问题，不是用户的错 ----
    if (status === 401 || status === 403) return makeAppError("AUTH", raw);

    // ---- 429 / 402：必须分"限流"和"额度" ----
    if (status === 429 || status === 402) {
      if (lower.indexOf("quota") >= 0 || lower.indexOf("insufficient") >= 0 || lower.indexOf("billing") >= 0) {
        return makeAppError("QUOTA", raw);
      }
      return makeAppError("RATE_LIMITED", raw);
    }

    // ---- 400：可能是格式，也可能是参数错 ----
    if (status === 400) {
      if (lower.indexOf("invalid image") >= 0 || lower.indexOf("unsupported") >= 0 ||
          lower.indexOf("could not process image") >= 0 || lower.indexOf("image format") >= 0) {
        return makeAppError("BAD_FORMAT", raw);
      }
      return makeAppError("BAD_RESPONSE", raw);
    }

    // ---- 5xx：服务端问题，可重试 ----
    if (status >= 500) return makeAppError("BAD_RESPONSE", raw);
  }

  // 7. 认不出来
  return makeAppError("UNKNOWN", raw);
}

module.exports = { AppError, classify, makeAppError, USER_MESSAGES, RETRYABLE, STATUS_MAP };
```

## 2.4 操作：给分类器写单元测试

新建 `scripts\test-classify.js`。**不联网**，直接造"原始错误长什么样"：

```javascript
// test-classify.js —— 给分类器写单元测试
// 这里不联网，直接造原始错误对象，验证分类对不对。
// 注意：测试用例代表的是"业务上应该怎么处理"，不是"代码现在怎么写的"。
const { classify } = require("../lib/errors");

function raw(opts) {
  const e = new Error(opts.message || "");
  if (opts.name) e.name = opts.name;
  if (opts.status !== undefined) e.status = opts.status;
  if (opts.cause !== undefined) e.cause = opts.cause;
  return e;
}

const CASES = [
  {
    label: "图片太大（413）",
    err: raw({ status: 413, message: "HTTP 413：Request entity too large" }),
    expect: "IMG_TOO_LARGE", retry: false,
  },
  {
    label: "格式不支持（400 + invalid image）",
    err: raw({ status: 400, message: "HTTP 400：Invalid image data" }),
    expect: "BAD_FORMAT", retry: false,
  },
  {
    label: "内容审核（status 200，只能靠 name）",
    err: raw({ name: "ContentFilterError", status: 200, message: "内容被审核拒绝" }),
    expect: "CONTENT_FILTER", retry: false,
  },
  {
    label: "超时（TimeoutError）",
    err: raw({ name: "TimeoutError", message: "The operation was aborted due to timeout" }),
    expect: "TIMEOUT", retry: true,
  },
  {
    label: "超时（AbortError 也要认）",
    err: raw({ name: "AbortError", message: "This operation was aborted" }),
    expect: "TIMEOUT", retry: true,
  },
  {
    label: "网络（fetch failed + ECONNREFUSED）",
    err: raw({
      name: "TypeError",
      message: "fetch failed",
      cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED" },
    }),
    expect: "NETWORK", retry: true,
  },
  {
    label: "返回 HTML（SyntaxError）",
    err: raw({ name: "SyntaxError", message: "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON" }),
    expect: "BAD_RESPONSE", retry: true,
  },
  {
    label: "额度用完（429 + insufficient_quota）",
    err: raw({ status: 429, message: "HTTP 429：insufficient_quota" }),
    expect: "QUOTA", retry: false,
  },
  {
    label: "限流（429 + rate limit）",
    err: raw({ status: 429, message: "HTTP 429：rate limit exceeded" }),
    expect: "RATE_LIMITED", retry: true,
  },
  {
    label: "key 不对（401）",
    err: raw({ status: 401, message: "HTTP 401：Incorrect API key provided" }),
    expect: "AUTH", retry: false,
  },
  {
    label: "服务端 500",
    err: raw({ status: 500, message: "HTTP 500：internal error" }),
    expect: "BAD_RESPONSE", retry: true,
  },
  {
    label: "完全认不出的错误",
    err: raw({ message: "某种奇怪的问题" }),
    expect: "UNKNOWN", retry: false,
  },
];

let pass = 0;
let fail = 0;

console.log("=== 分类器测试 ===");
console.log("");
console.log("用例".padEnd(38) + "期望".padEnd(17) + "实际".padEnd(17) + "可重试".padEnd(9) + "结果");
console.log("-".repeat(94));

for (const c of CASES) {
  const app = classify(c.err);
  const codeOk = app.code === c.expect;
  const retryOk = app.retryable === c.retry;
  const ok = codeOk && retryOk;

  if (ok) pass += 1;
  else fail += 1;

  console.log(
    c.label.padEnd(38) + c.expect.padEnd(17) + app.code.padEnd(17) +
    String(app.retryable).padEnd(9) + (ok ? "✓" : "✗ " + (codeOk ? "重试判定错" : "码错"))
  );
}

console.log("");
console.log("通过 " + pass + " / " + (pass + fail));
if (fail > 0) {
  console.log("");
  console.log("!!! 有失败用例。不要改测试，去改 classify()。");
  process.exitCode = 1;
}
```

```text
node scripts\test-classify.js
```

## 2.5 屏幕上应该看到什么

```text
>node scripts\test-classify.js
=== 分类器测试 ===

用例                                  期望              实际              可重试     结果
---------------------------------------------------------------------------------------------
图片太大（413）                       IMG_TOO_LARGE     IMG_TOO_LARGE     false    ✓
格式不支持（400 + invalid image）     BAD_FORMAT        BAD_FORMAT        false    ✓
内容审核（status 200，只能靠 name）   CONTENT_FILTER    CONTENT_FILTER    false    ✓
超时（TimeoutError）                  TIMEOUT           TIMEOUT           true     ✓
超时（AbortError 也要认）             TIMEOUT           TIMEOUT           true     ✓
网络（fetch failed + ECONNREFUSED）   NETWORK           NETWORK           true     ✓
返回 HTML（SyntaxError）              BAD_RESPONSE      BAD_RESPONSE      true     ✓
额度用完（429 + insufficient_quota）  QUOTA             QUOTA             false    ✓
限流（429 + rate limit）              RATE_LIMITED      RATE_LIMITED      true     ✓
key 不对（401）                       AUTH              AUTH              false    ✓
服务端 500                            BAD_RESPONSE      BAD_RESPONSE      true     ✓
完全认不出的错误                      UNKNOWN           UNKNOWN           false    ✓

通过 12 / 12
```

**注意"可重试"那一列，它比"错误码"更重要：**

```text
true （5 个）：超时、网络、返回异常、限流、5xx
false（6 个）：太大、格式、审核、额度、认证、未知

→ 一半一半
```

**"未知默认 false"这个决定要想清楚：**

```text
默认 false 的理由：
  你不知道它是什么错 → 不知道重试有没有用
  → 不重试，把问题暴露给人

如果默认 true：
  一个你根本不认识的错误 → 重试 5 次 → 5 倍成本 → 还是失败
  → 日志被这一个错误刷屏，你看不到别的问题
```

**这是"保守优先"的典型例子。** 宁可少重试，也不要盲目重试。

## 2.6 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `429 + insufficient_quota` 被分成 `RATE_LIMITED` | 判断顺序错 | `quota` 判断要在 `RATE_LIMITED` 之前 |
| `AbortError` 归到 `UNKNOWN` | 只认 `TimeoutError` | 两个都认 |
| `fetch failed` 归到 `UNKNOWN` | `err.name` 不是 `TypeError` | 打印实际 name |
| 全部归到 `UNKNOWN` | 传进来的不是 Error 对象 | 检查调用处 |
| 400 全归到 `BAD_FORMAT` | 判断太粗 | 看 message 再细分 |

---

# 第 3 步：重试，只重试该重试的（25 分钟）

## 3.1 做什么 / 为什么

**做什么：** 写 `lib\retry.js`，指数退避 + 抖动，**只重试 `retryable === true` 的错误**。

**为什么必须"只重试该重试的"：**

```text
对"内容审核拒绝"重试：
  第 1 次：拒绝
  第 2 次：拒绝
  第 3 次：拒绝
  → 3 倍钱，3 次相同答案，白等 7 秒

对"图片太大"重试：
  同样的图，永远同样地太大
  → 纯粹浪费
```

**为什么用"指数退避"而不是"立刻重试"：**

```text
立刻重试：
  第 1 次失败 → 0ms 后重试 → 对方还没恢复 → 又失败
  → 三次重试在 100ms 内全打完
  → 等于没有重试

指数退避：
  1s → 2s → 4s
  → 给对端恢复时间
```

**还要加"抖动"（jitter）：**

```text
没有抖动：
  100 个用户同时失败 → 全部在 1s 后重试 → 第 1 秒涌进 100 个请求
  → 二次雪崩

有抖动：
  每个在 1s ± 随机 0–500ms 后重试
  → 请求被摊平
```

## 3.2 操作

新建 `lib\retry.js`：

```javascript
// retry.js —— 指数退避 + 抖动，只重试 retryable 的错误
const { classify } = require("./errors");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 第 n 次重试要等多久（n 从 0 开始）
function backoffMs(n, baseMs, maxMs) {
  const base = baseMs === undefined ? 1000 : baseMs;
  const max = maxMs === undefined ? 15000 : maxMs;

  const raw = base * Math.pow(2, n);      // 1s, 2s, 4s, 8s...
  const capped = Math.min(raw, max);      // 封顶
  const jittered = capped * (0.5 + Math.random() * 0.5);  // [0.5, 1.0] 倍

  return Math.floor(jittered);
}

async function withRetry(fn, options) {
  const opts = options === undefined ? {} : options;
  const maxAttempts = opts.maxAttempts === undefined ? 3 : opts.maxAttempts;
  const onRetry = opts.onRetry;

  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (raw) {
      // 已经是 AppError 就不再翻译
      const app = (raw.code !== undefined && raw.userMessage !== undefined) ? raw : classify(raw);
      lastErr = app;

      const isLast = attempt === maxAttempts - 1;

      // 不可重试：立刻抛出，一毫秒都不浪费
      if (app.retryable !== true) {
        app.attempts = attempt + 1;
        throw app;
      }

      if (isLast) {
        app.attempts = attempt + 1;
        throw app;
      }

      const delay = backoffMs(attempt, opts.baseMs, opts.maxMs);

      if (typeof onRetry === "function") {
        onRetry(attempt + 1, delay, app);
      }

      await sleep(delay);
    }
  }

  throw lastErr;
}

module.exports = { withRetry, backoffMs, sleep };
```

**新建 `scripts\test-retry.js`，验证四件事：**

```javascript
// test-retry.js —— 验证重试策略
const { withRetry } = require("../lib/retry");
const { makeAppError } = require("../lib/errors");

async function main() {
  // ---------- 1. 不可重试：必须只调用 1 次 ----------
  console.log("=== 1. 不可重试（内容审核）===");
  let calls1 = 0;
  const t1 = Date.now();

  try {
    await withRetry(async () => {
      calls1 += 1;
      console.log("  第 " + calls1 + " 次调用");
      throw makeAppError("CONTENT_FILTER", "被拒绝");
    }, {
      maxAttempts: 3,
      onRetry: (n, d) => console.log("  → 准备第 " + n + " 次重试，等 " + d + "ms"),
    });
  } catch (err) {
    console.log("  最终失败：" + err.code + " / " + err.userMessage);
  }
  console.log("  实际调用次数：" + calls1 + "（应该 1）");
  console.log("  耗时：" + (Date.now() - t1) + "ms（应该 < 50ms）");
  console.log("  " + (calls1 === 1 ? "✓ 不可重试的错误没有重试" : "✗ 不该重试却重试了"));
  console.log("");

  // ---------- 2. 可重试，一直失败 ----------
  console.log("=== 2. 可重试（超时），一直失败 ===");
  let calls2 = 0;
  const t2 = Date.now();

  try {
    await withRetry(async () => {
      calls2 += 1;
      console.log("  第 " + calls2 + " 次调用");
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    }, {
      maxAttempts: 3,
      baseMs: 100,        // 测试时缩小，别真等 1+2 秒
      maxMs: 500,
      onRetry: (n, d) => console.log("  → 第 " + n + " 次重试，等 " + d + "ms"),
    });
  } catch (err) {
    console.log("  最终失败：" + err.code + "，共尝试 " + err.attempts + " 次");
  }
  console.log("  实际调用次数：" + calls2 + "（应该 3）");
  console.log("  耗时：" + (Date.now() - t2) + "ms（应该 > 100ms）");
  console.log("  " + (calls2 === 3 ? "✓ 重试到了上限" : "✗ 次数不对"));
  console.log("");

  // ---------- 3. 第二次成功 ----------
  console.log("=== 3. 可重试，第 2 次成功 ===");
  let calls3 = 0;

  const result = await withRetry(async () => {
    calls3 += 1;
    console.log("  第 " + calls3 + " 次调用");
    if (calls3 < 2) {
      const e = new Error("fetch failed");
      e.name = "TypeError";
      e.cause = { code: "ECONNRESET" };
      throw e;
    }
    return "成功的结果";
  }, {
    maxAttempts: 3,
    baseMs: 100,
    onRetry: (n, d) => console.log("  → 第 " + n + " 次重试，等 " + d + "ms"),
  });

  console.log("  最终结果：" + result);
  console.log("  实际调用次数：" + calls3 + "（应该 2）");
  console.log("");

  // ---------- 4. 退避时间表 ----------
  console.log("=== 4. 退避时间表（理论值，实际有 -50% 抖动）===");
  console.log("  次数   基准值      实际范围");
  for (let n = 0; n < 6; n += 1) {
    const raw = Math.min(1000 * Math.pow(2, n), 15000);
    console.log(
      "  " + String(n).padEnd(6) + (raw + "ms").padEnd(12) +
      Math.floor(raw * 0.5) + "–" + raw + "ms"
    );
  }
  console.log("");
  console.log("三次重试的理论总等待：1000 + 2000 + 4000 = 7000ms");
  console.log("加上 4 次请求本身的耗时 → 用户最多等 7–10 秒");
  console.log("→ 所以 UI 上必须有「重试中…」的提示，不能让人干等");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

## 3.3 屏幕上应该看到什么

```text
>node scripts\test-retry.js
=== 1. 不可重试（内容审核）===
  第 1 次调用
  最终失败：CONTENT_FILTER / 这类图片暂时无法处理。请换一张，或联系人工处理。
  实际调用次数：1（应该 1）
  耗时：4ms（应该 < 50ms）
  ✓ 不可重试的错误没有重试

=== 2. 可重试（超时），一直失败 ===
  第 1 次调用
  → 第 1 次重试，等 89ms
  第 2 次调用
  → 第 2 次重试，等 121ms
  第 3 次调用
  最终失败：TIMEOUT，共尝试 3 次
  实际调用次数：3（应该 3）
  耗时：218ms（应该 > 100ms）
  ✓ 重试到了上限

=== 3. 可重试，第 2 次成功 ===
  第 1 次调用
  → 第 1 次重试，等 76ms
  第 2 次调用
  最终结果：成功的结果
  实际调用次数：2（应该 2）

=== 4. 退避时间表（理论值，实际有 -50% 抖动）===
  次数   基准值      实际范围
  0     1000ms     500–1000ms
  1     2000ms     1000–2000ms
  2     4000ms     2000–4000ms
  3     8000ms     4000–8000ms
  4     15000ms    7500–15000ms
  5     15000ms    7500–15000ms

三次重试的理论总等待：1000 + 2000 + 4000 = 7000ms
加上 4 次请求本身的耗时 → 用户最多等 7–10 秒
→ 所以 UI 上必须有"重试中…"的提示，不能让人干等
```

**最关键的对比是"耗时"：**

```text
第 1 组（不可重试）：4ms    ← 立刻失败，不浪费用户时间
第 2 组（可重试）：  218ms  ← 中间真的等待了
```

**如果第 1 组耗时也是 200 多毫秒，说明你在对不可重试的错误重试 —— 用户白等 3 次。**

**第 4 组那个"7 秒"要记住：**

```text
maxAttempts = 3 是一个折中：
  1 次原请求 + 2 次重试，最多约 3–4 秒额外等待
  
等等，表里算的是 3 次重试（0/1/2 三次），总等待 7 秒
→ 因为 maxAttempts=3 意味着"最多试 3 次"，重试 2 次，等待 1s + 2s = 3s

两种算法：
  maxAttempts=3 → 3 次请求，2 次重试，等 3s
  maxAttempts=4 → 4 次请求，3 次重试，等 7s

本课程用 3（等 3 秒），因为超过 3 秒的等待用户已经开始怀疑了。
```

**这个"用户能忍多久"的判断，比技术细节重要。** 3 秒是一个经验值。

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 第 1 组也调用 3 次 | `retryable` 判断失效 | 打印 `app.retryable` |
| 第 1 组耗时 200ms+ | 同上 | 同上 |
| 两次重试间隔一样 | `Math.pow(2, n)` 里的 `n` 没变 | 检查循环变量 |
| 耗时特别长 | 用了默认 `baseMs = 1000` | 测试时传 `baseMs: 100` |
| 没有抖动 | 删了 `0.5 + random` | 加回去，否则并发重试会雪崩 |

---

# 第 4 步：把错误处理接进路由（20 分钟）

## 4.1 做什么 / 为什么

**做什么：** 在 Express 里加统一错误出口，让所有错误都走同一套。

**为什么必须有中间件：**

```text
没有中间件：
  每个路由自己 try/catch
  → 有的返回 {error: "xxx"}，有的返回 {message: "xxx"}
  → 前端要写八种解析
  → 有的忘了 catch，Express 直接把栈打印给用户

有中间件：
  路由只管 throw 或 next(err)
  → 出口统一，前端只写一种解析
```

## 4.2 操作

新建 `lib\error-middleware.js`：

```javascript
// error-middleware.js —— Express 统一错误出口
const { classify } = require("./errors");

function notFound(req, res) {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: "接口不存在",
    path: req.path,
  });
}

// 注意：Express 的错误中间件必须是四个参数，一个都不能少
function errorHandler(err, req, res, next) {
  // 已经发过响应了（比如流式输出中途出错），不能再发
  if (res.headersSent) {
    next(err);
    return;
  }

  const app = (err.code !== undefined && err.userMessage !== undefined) ? err : classify(err);

  // 日志：记全，包括用户看不到的 detail
  const logLine = [
    new Date().toISOString(),
    req.method,
    req.path,
    app.code,
    "retryable=" + app.retryable,
    app.detail === null ? "" : app.detail,
  ].join(" | ");

  if (app.status >= 500) console.error("[ERROR] " + logLine);
  else console.warn("[WARN ] " + logLine);

  // 返回给前端：只有 code 和 message，不含 detail
  res.status(app.status).json({
    ok: false,
    code: app.code,
    message: app.userMessage,
  });
}

// 包装 async 路由，让 throw 能被接住
// Express 4 不会自动接 async 的 reject，必须手动包
function wrap(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { notFound, errorHandler, wrap };
```

**在 `server.js` 里挂上（加在所有路由之后）：**

```javascript
const { notFound, errorHandler, wrap } = require("./lib/error-middleware");

// ... 所有路由 ...

// 404 兜底
app.use(notFound);

// 错误出口：必须最后，必须是四个参数
app.use(errorHandler);
```

**并把现有路由包起来。** 打开 `routes\vision.js`，把：

```text
router.post("/vision", async (req, res) => { ... });
```

改成：

```javascript
const { wrap } = require("../lib/error-middleware");

router.post("/vision", wrap(async (req, res) => {
  const result = await visionAnalyze(req.body.image);
  res.json({ ok: true, result: result });
}));
```

**注意 `wrap` 里面不再需要 `try/catch`。** 任何 `throw` 都会被转到中间件。

## 4.3 操作：造错误，看前端拿到什么

新建 `routes\demo-errors.js`：

```javascript
// demo-errors.js —— 把六种错误都做成接口，方便看前端拿到什么
// !!! 这个文件只用于练习，上线前删掉
const express = require("express");
const router = express.Router();
const { wrap } = require("../lib/error-middleware");
const { makeAppError } = require("../lib/errors");

router.get("/demo/err/:code", wrap(async (req, res) => {
  throw makeAppError(req.params.code, "这是练习用的假错误，code=" + req.params.code);
}));

module.exports = router;
```

在 `server.js` 里挂上：

```javascript
app.use("/api", require("./routes/demo-errors"));
```

**然后逐个访问：**

```text
http://localhost:3000/api/demo/err/IMG_TOO_LARGE
http://localhost:3000/api/demo/err/CONTENT_FILTER
http://localhost:3000/api/demo/err/QUOTA
http://localhost:3000/api/demo/err/UNKNOWN
```

## 4.4 屏幕上应该看到什么

浏览器打开 `/api/demo/err/IMG_TOO_LARGE`：

```json
{"ok":false,"code":"IMG_TOO_LARGE","message":"图片太大了，请压缩到 5MB 以内再上传。"}
```

服务器终端：

```text
[WARN ] 2026-11-16T20:15:03.221Z | GET | /api/demo/err/IMG_TOO_LARGE | IMG_TOO_LARGE | retryable=false | 这是练习用的假错误，code=IMG_TOO_LARGE
```

`/api/demo/err/CONTENT_FILTER`：

```json
{"ok":false,"code":"CONTENT_FILTER","message":"这类图片暂时无法处理。请换一张，或联系人工处理。"}
```

`/api/demo/err/QUOTA`：

```json
{"ok":false,"code":"QUOTA","message":"服务额度暂时不足，请联系管理员。"}
```

**HTTP 状态码也要对**（在浏览器开发者工具的 Network 面板看）：

```text
IMG_TOO_LARGE  → 413
CONTENT_FILTER → 422
QUOTA          → 503
UNKNOWN        → 500
```

**三个必须做到的点：**

| 点 | 为什么 |
|---|---|
| 前端只拿到 `code` 和 `message` | **`detail` 里有服务商名字、key 片段、内部路径** |
| 日志里有 `detail` | 排错时你需要原始内容 |
| 状态码语义正确 | 前端、网关、监控都靠状态码分类 |

**第一条特别重要：**

```text
错误做法：直接把 err.message 返回给前端
  → 用户看到 "HTTP 401：Incorrect API key provided: sk-abc123..."
  → 你的 key 泄露了一半

正确：返回 USER_MESSAGES 里的那句话
```

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 错误栈被打印到浏览器 | `errorHandler` 没挂到最下面 | 检查位置 |
| 所有错误都返回 500 | `makeAppError` 的 `status` 没生效 | 检查 `STATUS_MAP` |
| async 路由错误没被接住 | 没用 `wrap` | 包起来 |
| `headersSent` 报错 | 流式响应中途出错 | 中间件已处理 |
| key 出现在返回里 | 直接返回了 `err.message` | 只返回 `userMessage` |

---

# 第 5 步：故意犯四个错（20 分钟）

## 错误 1：只判断 `res.ok`

```text
// 错误写法
const res = await fetch(url, {...});
const json = await res.json();          // ← 没检查 ok
return json.choices[0].message.content;
```

**现象：** 三种失败同时发生，全是 `TypeError: Cannot read properties of undefined (reading '0')`。

```text
① 图片太大 → 413，body 是 {"error": {...}} → choices 是 undefined → 崩
② key 不对 → 401，同上 → 崩
③ 服务返回 HTML → res.json() 直接抛 SyntaxError
```

**真正的伤害：三种完全不同的错误，在日志里长得一模一样。**

你只能二选一：去猜，或者给用户一句"请求失败"。

**怎么查：** 看日志里 `Cannot read properties of undefined` 出现了多少次 —— **那说明你在用"下游崩溃"当"错误处理"。**

**正确做法：**

```javascript
if (!res.ok) {
  const body = await res.text();
  const err = new Error("HTTP " + res.status + "：" + body.slice(0, 200));
  err.status = res.status;      // ← 关键：把 status 带上
  throw err;
}
```

**`err.status = res.status` 这一行是整节课的地基。** 没有它，`classify()` 无从分类。

## 错误 2：对所有错误一律重试

```text
// 错误写法
for (let i = 0; i < 3; i += 1) {
  try { return await call(); } catch (e) { /* 继续重试 */ }
}
```

**现象：** 用户上传一张身份证，等了 10 秒，看到"出错了"。

**真正的伤害：**

```text
内容审核拒绝：重试 3 次 = 3 倍费用 + 白等 7 秒
图片太大：    重试 3 次 = 3 倍请求 + 白等 7 秒
key 不对：    重试 3 次 = 3 倍请求 + 白等 7 秒

→ 用户感受到"这个产品很慢很烂"
→ 实际是你的重试策略在害他
```

**怎么查：** 造一个不可重试的错误，看总耗时。

```text
4ms   → 对
200ms → 错了
```

**正确做法：** 第 3 步的 `withRetry`，先分类再决定。

## 错误 3：把 `detail` 返回给用户

```javascript
// 错误写法
res.status(500).json({ error: err.message });
```

**现象：**

```json
{"error":"HTTP 401：Incorrect API key provided: sk-proj-abc123...xyz"}
```

**真正的伤害，四条全占：**

```text
① 泄露 key 的一部分（安全）
② 泄露服务商名字（商业信息）
③ 泄露内部路径（可能被利用）
④ 用户看不懂，只会来问你
```

**怎么查：** 随便造一个错误，看返回的 JSON。**里面有没有出现 `sk-`、`api.`、`C:\`？**

**正确做法：** 返回 `userMessage`，日志记 `detail`。

## 错误 4：以为 `CONTENT_FILTER` 一定是非 200

```text
// 错误写法
if (!res.ok) { throw ... }
const json = await res.json();
const content = json.choices[0].message.content;
if (content === null || content === "") {
  throw new Error("返回为空");     // ← 把所有空返回当成同一种
}
```

**现象：** 用户传带人脸的图，模型拒绝了，你的返回是"返回为空，请重试"。

**然后用户重试了 5 次。**

**真正的伤害：**

```text
content_filter 是"明确拒绝"，重试没有意义
你说的"请重试" → 用户重试 → 又空 → 又"请重试" → 死循环

用户结论："这个功能根本不行"
实际：这 5 张图确实都不能处理，但另外 100 张是好的
```

**怎么查：** 打印 `finish_reason`。

```javascript
console.log("finish_reason=" + choice.finish_reason + " content长度=" + (content || "").length);
```

**正确做法：两个分支必须分开。**

```javascript
if (choice.finish_reason === "content_filter") {
  const err = new Error("内容被审核拒绝");
  err.name = "ContentFilterError";     // ← 这个名字是 classify 的入口
  throw err;
}
if (content === null || content === "") {
  const err = new Error("模型返回了空内容，但不是内容审核");
  err.name = "BadResponseError";
  throw err;
}
```

**因为一个该说"请换一张"，另一个该说"请重试"。**

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 只判 `res.ok` | 全是 `Cannot read properties` | 三种错误长得一样，无法分类 | 日志里有没有这种 TypeError |
| 一律重试 | 用户等 10 秒 | 花 3 倍钱，体验更差 | 不可重试错误的耗时 |
| 返回 `detail` | JSON 里有 `sk-` | 泄露 key 和服务商 | 直接看返回内容 |
| 假设非 200 | 审核拒绝被当"空返回" | 引导用户无限重试 | 打印 `finish_reason` |

**这四个错误的共同点：都让"错误处理"这件本该帮你的事，变成新的问题源。**

**第 1 个让错误无法分类，第 2 个让错误更严重，第 3 个让错误变成安全事故，第 4 个让错误无法自行终止。**

---

# 第 6 步：写学习笔记（10 分钟）

打开 `第06节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「六种错误的真实指纹」和「哪些能重试」。

---

# 第 7 步：课后练习

## 练习一：补全错误矩阵

跑完 `error-lab.js` 后，把真实指纹填进 `out\error-matrix.md`：

| 编号 | 触发方式 | name | status | message 特征 | 可重试 | 用户话术 | 建议状态码 |
|---|---|---|---|---|---|---|---|

**要求：** `message 特征` 那一列必须是你在终端里**真实看到的字符串片段**，不能写"大概是这样"。

**这张表是你以后排查的索引。** 客户说"报错了"，让他截图，看屏幕上那句话，就能反查是哪一类。

## 练习二：给音频和文本的"太长"单独分类

现在 `classify()` 把 413 一律归成 `IMG_TOO_LARGE`。但音频太长、文本太长，用户该做的事完全不同：

```text
图片太大 → 压缩后重传（同一张图）
音频太长 → 分段（同一段音频）
文本太长 → 分段（同一段文字）
```

**改造 `classify()`：加一个 `context` 参数。**

```javascript
classify(err, { context: "vision" | "audio" | "tts" | "text" })
```

**验收：** 同一个 413，三个 context 返回三个不同的 code。

## 练习三：算"重试"的成本

假设：

```text
原请求单价：P
一分钟内 100 个请求，其中 10 个超时、2 个内容审核拒绝
maxAttempts = 3（2 次重试）
超时的重试有 60% 能在第 2 次成功
```

**算：**

1. 正确分类 + 重试后，总请求次数是多少？
2. 如果"一律重试 3 次"，总请求次数是多少？
3. 差额换算成钱是多少？

**这道题的目的：让你在"加不加重试"这个决定上，有一个数字，而不是一个感觉。**

## 练习四：写一个"错误处理自检清单"

针对你的 `mm-app`，列 10 条能用"是/否"回答的检查项。

**参考方向：**

```text
- 每个 async 路由都包了 wrap 吗
- 每个 fetch 都检查了 res.ok 吗
- 每个 fetch 失败时都带了 status 吗
- CONTENT_FILTER 的分支存在吗
- 返回给前端的 JSON 里有没有 detail
- 日志里有没有 detail
- 超时设置了吗（默认值多少）
- 重试次数上限是多少
- 不可重试的码有哪些
- 有没有一个"测试各种错误"的接口（能造错误）
```

**最后一条特别重要：** 如果你的系统没法人为制造错误，你就没法验证错误处理对不对。

## 练习五：用自己的话讲清

1. 为什么六种错误里，`CONTENT_FILTER` 最容易被误判成成功？
2. 为什么 `429` 要分成"限流"和"额度"两种？不分的后果是什么？
3. 为什么"未知错误"默认不重试？
4. 指数退避为什么必须加抖动？不加会怎样？
5. 为什么返回给前端的错误里不能有 `detail`？举两个泄露的例子。
6. 如果客户说"我不想要这些英文错误码，只要一句中文提示"，你怎么处理？

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能说出六种错误各自的识别依据（name / status / message）
- [ ] 我能说清为什么 `CONTENT_FILTER` 是 200 而不是 4xx
- [ ] 我能说清 429 的两种含义和各自的处理
- [ ] 我能说清指数退避为什么加抖动
- [ ] 我能说清"未知错误默认不重试"的理由

## B. 实操

- [ ] `error-lab.js` 触发了至少四种真实错误，指纹都记下来了
- [ ] `test-classify.js` 12 个用例全通过
- [ ] `test-retry.js` 第 1 组只调用 1 次、耗时 < 50ms
- [ ] `test-retry.js` 第 2 组调用 3 次，中间真的等待了
- [ ] `error-middleware.js` 挂上了，`/api/demo/err/xxx` 返回规范 JSON
- [ ] 返回的 JSON 里**没有** `detail`
- [ ] 日志里**有** `detail`
- [ ] 四种错误的 HTTP 状态码分别是 413 / 422 / 503 / 500
- [ ] `out\error-matrix.md` 填完了

## C. 排错

- [ ] 我造过一个"只判 res.ok"的代码，看到全是 `Cannot read properties`
- [ ] 我试过对内容审核拒绝重试，看到白等 200ms+
- [ ] 我看过一个把 key 打出来的错误返回
- [ ] 我知道 `finish_reason` 在哪看

## D. 笔记

- [ ] 十二个小标题都有内容
- [ ] 「六种错误的真实指纹」贴的是终端原文
- [ ] 「哪些能重试」有完整列表和理由
- [ ] 练习三的成本是算出来的

---

## 本节课要能说出口的一句话

> **错误处理的价值不在"不出错"，在"出错时用户知道该怎么办、你知道该修哪里、钱不被白花"。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 全是 `Cannot read properties of undefined` | 没检查 `res.ok` | 加检查，并带 `err.status` |
| 所有错误都 500 | `STATUS_MAP` 没生效 | 检查 `makeAppError` |
| 不可重试的错误也重试了 | `retryable` 判断 | 打印 `app.retryable` |
| 重试等太久 | `baseMs` 默认 1000 | 生产可调到 500，测试传 100 |
| 并发重试雪崩 | 没加抖动 | `0.5 + Math.random()*0.5` |
| 返回里有 `sk-` | 直接返回了 `err.message` | 返回 `userMessage` |
| 审核拒绝被当"空返回" | 没看 `finish_reason` | 加 `content_filter` 分支 |
| async 路由错误没接住 | 没用 `wrap` | Express 4 必须手动包 |
| 错误栈打到浏览器 | `errorHandler` 位置错 | 必须最后一个 `app.use` |
| `headersSent` 警告 | 流式响应中途出错 | 中间件已处理 |
| `AbortError` 没被识别 | 只认 `TimeoutError` | 两个都认 |
| `EADDRINUSE` | 端口被占 | `taskkill /IM node.exe /F` |
