# 第 43 节课：算清一次调用多少钱——从 token 到人民币

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 6 周你解决了"答得对"。这一周开始管钱。
> 今天只做一件事：**把一次调用的成本，从一个模糊的"不贵"，算成一个精确的数字。**

**建议用时**：120 分钟
**你需要先完成**：第 42 节课（会用 `askJson`，知道提示词要进文件）

---

# 第 0 步：先看你对钱有多不敏感（10 分钟）

## 0.1 三个问题，现在先凭感觉答

**在纸上写下来（别翻资料）：**

```text
1. 发一条"你好"给模型，多少钱？
2. 让它写 500 字的商品文案，多少钱？
3. 一个月 1000 个用户、每人每天问 5 次，一个月多少钱？
```

**写完再看下去。** 大部分人第 1 题答"几毛钱"（实际是几厘钱），第 3 题答"几千块"（实际可能几十块）。

**答错方向不要紧，要紧的是你现在知道自己是在猜。**

## 0.2 为什么必须算清

**场景一：报价**

```text
客户：这功能一个月多少钱？
你：不好说，看用量……
客户：那我先看看别家。
```

**场景二：亏钱**

```text
你按"每次 0.001 元"报了年度 2000 元的价
实际每次 0.03 元，一天 2000 次
一个月 = 1800 元
年底结算，你倒贴 2 万
```

**场景三：定价**

```text
能算出"每次对话 1 分 3 厘"
→ 可以定"9.9 元 / 500 次"，毛利 70%
```

**算不出来，就只能按"一个页面多少钱"卖，卖不到 5000。**

## 0.3 这一个数字由什么决定

**一次调用的成本：**

```text
成本 = 输入 token × 输入单价 + 输出 token × 输出单价
```

**就这么一条公式。** 剩下的全是细节：

```text
token 是什么？        → 模型切分文本的最小单位
输入包含什么？        → system + 全部历史 + 本次提问
输出包含什么？        → 模型生成的每一个字
单价从哪来？          → 你的中转商的价格表
```

**今天把这四项逐一落实。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `token-lab` 里） | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的记录与实算 |
| `package.json` | `第43节课/03-练习代码/token-lab` | 项目配置 |
| `src/pricing.js` | 同上 | 价格表 + 算钱函数 |
| `src/mock-llm.js` | 同上 | 假模型（带 usage，支持流式） |
| `experiments/e01-price.js` | 同上 | 一次真实调用的成本实算 |

---

# 第 1 步：搭起 `token-lab`（25 分钟）

## 1.1 建目录

**操作：**

1. 打开 `每周课程/02-AI应用骨架/第07周-成本与流式/第01节课/03-练习代码/`。
2. 新建文件夹 `token-lab`。
3. 进去，新建三个文件夹：

   ```text
   src
   public
   experiments
   ```

**路径记牢（后面全部要写全）：**

```text
B:\OPC-Distance_study\每周课程\02-AI应用骨架\第07周-成本与流式\第01节课\03-练习代码\token-lab
```

## 1.2 建 `package.json`

**自己敲：**

```json
{
  "name": "token-lab",
  "private": true,
  "type": "module",
  "scripts": {
    "mock": "node src/mock-llm.js",
    "e01": "node --env-file=.env experiments/e01-price.js"
  }
}
```

**注意 `"type": "module"`。** 不写这行，`import` 会报 `Cannot use import statement outside a module`。

## 1.3 建 `src/config.js`

**先把配置集中起来。** 这一周有太多数字要调，散在代码里会疯。

```javascript
export const CONFIG = {
  port: 4020,
  llm: {
    baseUrl: process.env.LLM_BASE_URL || "http://localhost:4020/v1",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "mock-model",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 60000,
    maxTokens: Number(process.env.LLM_MAX_TOKENS) || 800,
  },
};
```

**`port: 4020` 而不是 3000：**

第 3 周的 chat-app 也常跑 3000。**端口冲突时，`EADDRINUSE` 会让你以为代码坏了。**

**整个课程里每个项目用不同端口段：**

```text
3000-3099  第 3 周 chat-app
4010-4019  假模型（第 6 周 prompt-lab）
4020-4099  本周 token-lab
```

## 1.4 建 `.env`

```text
LLM_BASE_URL=http://localhost:4020/v1
LLM_API_KEY=any
LLM_MODEL=mock-model
LLM_MAX_TOKENS=800
```

**先跑假模型（注意：假模型也占端口，会让主服务的 4020 冲突）。**

**等一下 —— 这里有个坑，必须现在讲清：**

**假模型和主服务都用 4020，会冲突。** 所以：

```text
假模型端口    4010（沿用第 6 周）
主服务端口    4020
```

**改 `config.js` 里的默认 baseUrl：**

```javascript
    baseUrl: process.env.LLM_BASE_URL || "http://localhost:4010/v1",
```

**改 `.env` 同样改成 4010。**

**`CONFIG.port` 保持 4020，那是主服务的。**

## 1.5 确认 `.env` 不进 Git

**操作：**

1. 打开仓库根 `.gitignore`。
2. 确认有 `.env`。
3. 没有就加上。

**验证：**

```text
git status --short
```

**看到 `token-lab/.env` 就停手。**

---

# 第 2 步：理解 token（20 分钟）

## 2.1 token 是什么

**模型不认识字，它认识 token。**

```text
英文：1 token ≈ 0.75 个单词 ≈ 4 个字符
中文：1 个汉字 ≈ 1-2 个 token（常见汉字多为 1 个，生僻字 2 个）
```

**为什么差这么多：** 训练语料里英文多，英文的词表更细；中文的常用字被合并进了单个 token，但生僻字和标点会拆开。

**你不需要精确，你需要"够用的估算"。**

## 2.2 三个够用的估算法

**方法一：字数估算法（最快）**

```text
中文：token ≈ 汉字数 × 1.3
英文：token ≈ 字符数 / 4
混合：token ≈ (汉字数 × 1.3) + (英文字符数 / 4)
```

**偏差在 ±20%。** 算钱时用它，已经能避免"差 30 倍"这种错误。

**方法二：用真实的 usage（最准）**

**每次 API 返回里都有 `usage`：**

```json
{
  "usage": {
    "prompt_tokens": 128,
    "completion_tokens": 96,
    "total_tokens": 224
  }
}
```

**`prompt_tokens` 就是输入，`completion_tokens` 就是输出。直接用它，不要估。**

**方法三：让服务商的分词接口算（最麻烦）**

**大部分中转不提供。跳过。**

## 2.3 一个反直觉的事

**中文的 token 数，比你想的多。**

**你在第 6 周写的那个 `docQa` 提示词，大约 300 个汉字：**

```text
300 × 1.3 ≈ 390 token
```

**而一句"你好"：**

```text
2 × 1.3 ≈ 3 token
```

**所以：**

```text
system 提示词本身，就是你每次调用都在重复支付的成本
```

**这一条是第 6 周"把提示词写清楚"的隐藏代价。** 提示词越长，每次调用越贵。

**所以第 6 周和第 7 周是有张力的：**

```text
提示词要写清 → 太长 → 每次都在付这笔钱
```

**解法：**

```text
固定的、每次都用的规则 → 放 system（值）
一次性的、只这次用的内容 → 放 user（不多付）
不该进提示词的 → 别进
```

**你现在应该明白为什么第 37 节要把资料放 `user` 了吧 —— 不仅为了安全，也为了账目清楚。**

---

# 第 3 步：建价格表（30 分钟）

## 3.1 价格表长什么样

**新建 `src/pricing.js`，自己敲：**

```javascript
// 价格单位：元 / 千 token
// 这是示例值，必须换成你实际使用的服务商价格
export const PRICES = {
  "mock-model": { input: 0.001, output: 0.002 },

  "cheap-model": { input: 0.0005, output: 0.001 },
  "mid-model": { input: 0.002, output: 0.008 },
  "strong-model": { input: 0.03, output: 0.12 },

  default: { input: 0.002, output: 0.008 },
};

export const getPrice = (model) => PRICES[model] || PRICES.default;

export const calcCost = ({ model, promptTokens, completionTokens }) => {
  const price = getPrice(model);

  const inputCost = (promptTokens / 1000) * price.input;
  const outputCost = (completionTokens / 1000) * price.output;

  return {
    model,
    inputCost,
    outputCost,
    total: inputCost + outputCost,
    priceUsed: price,
  };
};
```

## 3.2 为什么是"元/千 token"

**服务商报价通常这样写：**

```text
$0.15 / 1M input tokens
$0.60 / 1M output tokens
```

**换算成"元/千 token"是为了口算方便：**

```text
1M = 1000K，所以 $0.15/1M = $0.00015/1K ≈ 0.001 元/1K（按 7 汇率）
```

**你的代码里用哪个单位都行，关键是全项目统一。**

**这一周统一用"元/千 token"。**

## 3.3 为什么不写死在代码里

**三个真实场景：**

```text
① 服务商降价 → 你的成本表立刻错
② 换模型 → 你要改代码 + 重新部署
③ 客户想知道"用了多少钱的哪个模型" → 你需要按模型分别算
```

**所以：**

```text
PRICES 是配置（可以是 js 文件、可以是 json、可以进数据库）
代码只负责"按表算"
```

**这一周先用 js 文件。第 9 周做后台管理时，你会把它挪到数据库。**

## 3.4 一个必须知道的陷阱

**"元/千 token" 和 "元/次" 差 1000 倍。**

**所以函数里必须写清单位，参数名带 `Tokens`：**

```javascript
calcCost({ promptTokens, completionTokens })
```

**不要写成：**

```javascript
calcCost({ input, output })     // input 是 token 数还是元？三个月后你不知道
```

**命名上的模糊，就是算错钱的起点。**

## 3.5 格式化输出

**加两个辅助函数：**

```javascript
// 钱太小时用"厘"显示，不然全是 0.0000
export const formatMoney = (yuan) => {
  if (yuan >= 1) return `¥${yuan.toFixed(2)}`;
  if (yuan >= 0.01) return `¥${yuan.toFixed(4)}`;
  return `¥${(yuan * 1000).toFixed(4)} 厘`;
};

// 大批量时看这个
export const formatPerK = (cost, tokens) => {
  if (tokens === 0) return "¥0";
  return `${((cost / tokens) * 1000).toFixed(4)} 元/千 token`;
};
```

**为什么需要 `formatMoney`：**

```text
一次调用 0.0004 元  → toFixed(2) 显示 "0.00"  → 你以为免费
formatMoney        → 显示 "0.4000 厘"  → 你看得见
```

**这个细节会救你。** 人眼对"0.00"的直觉是"没有"，对"0.4 厘"的直觉是"乘以 1000 就是 0.4 元"。

---

# 第 4 步：写一份能用的假模型（30 分钟）

**这一周的假模型必须比第 6 周的高级，因为它要支持流式、要给 usage、能听指令故障。**

## 4.1 新建 `src/mock-llm.js`

```javascript
import http from "node:http";

const PORT = 4010;

// 粗略估 token：汉字 ×1.3，其他字符 /4
const estimateTokens = (text) =>
  Math.ceil((String(text).match(/[\u4e00-\u9fa5]/g) || []).length * 1.3 +
    (String(text).replace(/[\u4e00-\u9fa5]/g, "").length / 4));

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 根据最后一条用户消息，决定怎么"演"
const planReply = (messages) => {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content || "";

  if (text.includes("出错")) {
    return { mode: "error", status: 500 };
  }

  if (text.includes("慢")) {
    return { mode: "slow", delayMs: 8000 };
  }

  if (text.includes("空")) {
    return { mode: "empty" };
  }

  if (text.includes("长")) {
    return {
      mode: "long",
      reply:
        "这是一段很长的回复，用来测试输出 token 的成本。" +
        "模型的输出是按字生成的，每个字都要付出计算成本，" +
        "所以让它说得多，比给它看很多，更花钱。".repeat(4),
    };
  }

  const charCount = estimateTokens(text);
  return {
    mode: "normal",
    reply: `（假模型）收到 ${charCount} token 的输入。这是模拟回复，用于验证管线。`,
  };
};

const writeChunk = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    const raw = await readBody(req);
    let payload;

    try {
      payload = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "bad json" } }));
      return;
    }

    const messages = payload.messages || [];
    const plan = planReply(messages);
    const promptTokens = estimateTokens(messages.map((m) => m.content).join(""));
    const wantStream = payload.stream === true;

    if (plan.mode === "error") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "模拟上游 500" } }));
      return;
    }

    if (plan.mode === "slow") {
      await sleep(plan.delayMs);
    }

    const replyText = plan.mode === "empty" ? "" : plan.reply || "（空）";
    const completionTokens = estimateTokens(replyText);

    if (!wantStream) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          id: "mock-1",
          model: payload.model || "mock-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: replyText },
              finish_reason: completionTokens > (payload.max_tokens || 800) ? "length" : "stop",
            },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        })
      );
      return;
    }

    // 流式：一个字一个字吐，每个 chunk 约 60ms
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const chars = [...replyText];
    let closed = false;
    req.on("close", () => {
      closed = true;
      console.log(`[mock] 客户端断开，已发出 ${chars.length} 字`);
    });

    for (const char of chars) {
      if (closed) break;
      writeChunk(res, {
        id: "mock-1",
        model: payload.model || "mock-model",
        choices: [{ index: 0, delta: { content: char }, finish_reason: null }],
      });
      await sleep(60);
    }

    if (!closed) {
      // 关键：usage 只在最后一个 chunk（且请求了 stream_options 时）
      const last = {
        id: "mock-1",
        model: payload.model || "mock-model",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      };

      if (payload.stream_options?.include_usage) {
        last.usage = {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        };
      }

      writeChunk(res, last);
      res.write("data: [DONE]\n\n");
      res.end();
    }

    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: "not found" } }));
});

server.listen(PORT, () => {
  console.log(`假模型已启动：http://localhost:${PORT}/v1`);
});
```

## 4.2 这份假模型的五个能力（后面每天都要用）

| 触发词 | 行为 | 哪天用 |
|---|---|---|
| `出错` | 返回 500 | 第 45、48 节测错误处理 |
| `慢` | 延迟 8 秒 | 第 47 节测首字延迟、第 48 节测超时 |
| `空` | 返回空内容 | 测内容校验 |
| `长` | 返回长文本 | 第 45 节测 `max_tokens`、测输出成本 |
| （无） | 正常回复 | 日常 |

**流式能力：**

```text
真的一字一字吐（60ms 一个）
能感知客户端断开（req.on("close")）
只有请求了 include_usage 才在最后给 usage
```

**这三条对应真实上游的三个行为。第 47、48 节会逐个验证。**

## 4.3 为什么 `estimateTokens` 要这么写

```javascript
  Math.ceil((汉字数 × 1.3) + (非汉字字符数 / 4))
```

**汉字用 1.3，是因为常用字多为 1 token，标点、生僻字、数字会拆开，平均偏高。**

**英文用 4 字符 1 token，是业界通用估算。**

**偏差 ±20%。** 作为估算够用，**但第 44 节你会看到：真正的账必须用真模型跑一遍对齐。**

## 4.4 启动并验证

**开一个终端：**

```text
cd 第01节课\03-练习代码\token-lab
npm run mock
```

**看到：**

```text
假模型已启动：http://localhost:4010/v1
```

**另开一个终端测一下：**

```text
curl.exe -X POST http://localhost:4010/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"mock-model\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}"
```

**应该看到带 `usage` 的 JSON。**

**如果 `curl` 报"无法识别"，用 `curl.exe`。**

---

# 第 5 步：写调用封装（25 分钟）

## 5.1 新建 `src/llm.js`

**这一周的 `llm.js` 比第 6 周多一点东西：它要把 `usage` 带回来，还要支持流式。**

```javascript
import { CONFIG } from "./config.js";

export class LlmError extends Error {
  constructor(userMessage, detail, statusCode = 502) {
    super(userMessage);
    this.name = "LlmError";
    this.userMessage = userMessage;
    this.detail = detail;
    this.statusCode = statusCode;
  }
}

export const chat = async (messages, options = {}) => {
  const {
    temperature = 0.7,
    maxTokens = CONFIG.llm.maxTokens,
    model = CONFIG.llm.model,
    timeoutMs = CONFIG.llm.timeoutMs,
    signal,
  } = options;

  const url = `${CONFIG.llm.baseUrl}/chat/completions`;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const finalSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.llm.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: finalSignal,
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new LlmError("模型响应超时，请稍后再试", `超过 ${timeoutMs}ms`, 504);
    }

    if (error.name === "AbortError") {
      throw new LlmError("请求已取消", "调用方主动中断", 499);
    }

    throw new LlmError("无法连接到模型服务", `fetch failed: ${error.message}`, 502);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new LlmError(`模型服务返回 ${response.status}`, detail, 502);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const finishReason = data?.choices?.[0]?.finish_reason ?? null;
  const usage = data?.usage || null;

  // 关键：没有 usage 就估算，并标记出来
  const promptTokens = usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join(""));
  const completionTokens = usage?.completion_tokens ?? estimateTokens(content);

  return {
    content: content.trim(),
    finishReason,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimated: !usage,
    },
    model: data?.model || model,
    raw: data,
  };
};

export const estimateTokens = (text) => {
  const str = String(text ?? "");
  const han = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
  const rest = str.replace(/[\u4e00-\u9fa5]/g, "").length;
  return Math.ceil(han * 1.3 + rest / 4);
};
```

## 5.2 四个关键设计

### 设计一：`AbortSignal.any([signal, timeoutSignal])`

**这是一个组合信号：任何一个触发，都中断。**

**为什么需要它：**

```text
单有 timeout → 用户点停止时，请求还在跑
单有 signal  → 上游卡死时，永远等下去
```

**两个都要。**

**`AbortSignal.any` 是 Node 20 的新 API。低版本没有，检查 `node -v`。**

### 设计二：`estimated: !usage`

**因为你迟早会遇到"上游不返回 usage"的情况（尤其是某些中转）。**

**不标记，你的报表会混着"真实值"和"估算值"，你却不知道哪条是哪个。**

**加了标记，报表里可以单独统计"估算占比"。**

### 设计三：`finishReason` 独立返回

**`finish_reason: "length"` 表示"输出被截断了"。**

**这是一个必须被上层看到的信号。** 藏在 `raw` 里等于没有。

### 设计四：`statusCode: 499`

**499 是 Nginx 的非标准码，意思是"客户端主动关闭连接"。**

**用它区分"用户取消"和"上游超时"，你的日志才能区分这两类事件。**

---

# 第 6 步：实算一次调用（25 分钟）

## 6.1 新建 `experiments/e01-price.js`

```javascript
import { chat } from "../src/llm.js";
import { calcCost, formatMoney } from "../src/pricing.js";

const SYSTEM = `你是一名电商文案助手。把商品参数改写成 2-3 句口语化文案，不超过 100 字。`;

const CASES = [
  { name: "极短输入", user: "你好" },
  { name: "短输入", user: "不锈钢保温杯，容量 500ml，保温 12 小时。" },
  {
    name: "长输入",
    user: "不锈钢保温杯，容量 500ml，保温 12 小时，杯身 304 不锈钢，净重 320g，" +
      "杯口直径 5.5cm，杯身高 22cm，容量误差 ±2%，耐温 -20℃ 至 120℃。".repeat(6),
  },
  { name: "要求长输出", user: "请详细写一段 500 字的产品介绍：不锈钢保温杯，500ml，保温 12 小时。" },
];

const main = async () => {
  const rows = [];

  for (const item of CASES) {
    const result = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: item.user },
      ],
      { temperature: 0.7, maxTokens: 800 }
    );

    const cost = calcCost({
      model: result.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    });

    rows.push({
      场景: item.name,
      输入token: result.usage.promptTokens,
      输出token: result.usage.completionTokens,
      输入成本: formatMoney(cost.inputCost),
      输出成本: formatMoney(cost.outputCost),
      合计: formatMoney(cost.total),
      估算: result.usage.estimated ? "是" : "否",
    });

    console.log(`\n===== ${item.name} =====`);
    console.log(`输入：${item.user.slice(0, 60)}${item.user.length > 60 ? "..." : ""}`);
    console.log(`输出：${result.content.slice(0, 80)}`);
    console.log(`finish_reason：${result.finishReason}`);
  }

  console.log("\n===== 成本实算表 =====");
  console.table(rows);

  const total = rows.reduce((sum, row) => sum + parseFloat(String(row.合计).replace(/[^\d.]/g, "") || 0), 0);
  console.log(`四次调用合计（粗算）：${total.toFixed(4)}`);
};

main().catch((error) => {
  console.error("跑挂了：", error.userMessage || error.message);
  if (error.detail) console.error("细节：", error.detail);
  process.exitCode = 1;
});
```

**注意最后那个 `total` 的计算是有问题的**（从格式化后的字符串里抠数字，单位不一致）。**这是故意的。**

**第 9 步会指出这个问题。** 你现在先跑起来，看输出。

## 6.2 加脚本并跑

```json
    "e01": "node --env-file=.env experiments/e01-price.js"
```

```text
npm run e01
```

**假模型下会看到四行表。**

## 6.3 你要观察的三件事

### 观察一：输出 token 比输入 token 贵

**假模型的价格是 `input: 0.001 / output: 0.002`（2 倍）。**

**真实模型差距更大（常见 3-4 倍）。**

**所以"要求长输出"那一行的成本，会明显高于"长输入"。**

**这就是认知一的具体体现：让它少说，比让它少看更省钱。**

### 观察二：`长输入` 那一行输入 token 很高，但成本可能不如 `要求长输出`

**假模型的回复是固定的，所以"要求长输出"其实回复不长。**

**换真模型后差别会非常明显。** 这一步先用假模型确认代码对。

### 观察三：`估算` 列

**假模型给了 usage，所以是"否"。**

**换真模型后，如果某些中转不给 usage，会显示"是"。**

## 6.4 换真模型跑一遍（重要）

**改 `.env`：**

```text
LLM_BASE_URL=https://你的中转/v1
LLM_API_KEY=你的密钥
LLM_MODEL=你的模型名
LLM_MAX_TOKENS=800
```

**改 `src/pricing.js`，把 `PRICES` 里加上你这个模型的真实价格。**

**价格从哪来：**

```text
① 服务商的控制台/文档页
② 你充值后的账单页
③ 问客服
```

**必须要到这个数字，不能猜。** 猜出来的价格表，算出来的账全是错的。

**再跑 `npm run e01`。**

**这次的数字是真实的。**

## 6.5 把关键数字记进 `NOTES.md`

**必须记这四行：**

```text
模型名：
输入单价：___ 元/千 token
输出单价：___ 元/千 token
"你好"这一句的完整成本：___ 元
```

**第 4 行会让你惊讶。** 大部分人第一次看到"一句你好 = 0.0002 元"，会意识到自己之前对成本的直觉错了一个数量级。

---

# 第 7 步：算三个真实场景（20 分钟）

## 7.1 场景一：一个客服机器人

**假设：**

```text
system 提示词 300 字 ≈ 390 token
每人每次带 6 轮历史 ≈ 800 token
每次提问 30 字 ≈ 40 token
每次回答 150 字 ≈ 200 token
```

**算：**

```text
输入 = 390 + 800 + 40 = 1230 token
输出 = 200 token
```

**用中档模型（0.002 / 0.008）：**

```text
输入成本 = 1.23 × 0.002 = 0.00246 元
输出成本 = 0.2 × 0.008 = 0.0016 元
合计 ≈ 0.0041 元 ≈ 4 厘
```

**1000 次对话 = 4.1 元。**

**这个数字会让你重新考虑报价。** 4.1 元的成本，你可以卖 199 元/月。

**但要注意：历史越长越贵。** 6 轮 800 token，20 轮可能 3000 token，成本翻 2 倍多。

**这就是第 45 节"上下文裁剪"存在的理由。**

## 7.2 场景二：一个文档问答

**假设：**

```text
每次塞 3 篇资料 ≈ 3000 token（输入，便宜）
每次回答 100 字 ≈ 130 token（输出，贵）
```

**用中档模型：**

```text
输入 = 3 × 0.002 = 0.006 元
输出 = 0.13 × 0.008 = 0.001 元
合计 ≈ 0.007 元
```

**出一份 50 页的合同审查报告：**

```text
每页平均 10 个问题 × 0.007 = 0.07 元
50 页 ≈ 3.5 元
```

**所以"合同审查"这种活，成本极低，价值极高。** 这就是为什么这类产品好卖。

## 7.3 场景三：批量分类

**假设：3000 条评论，每条 50 字：**

```text
输入 = 50 × 1.3 × 3000 ≈ 195000 token = 195 千 token
输出 = 每条 30 字 JSON ≈ 39 token × 3000 ≈ 117000 token = 117 千 token
```

**用便宜模型（0.0005 / 0.001）：**

```text
输入 = 195 × 0.0005 = 0.0975 元
输出 = 117 × 0.001 = 0.117 元
合计 ≈ 0.21 元
```

**0.21 元干完 16 小时的人工活。**

**这就是第 40 节课能卖 3000-8000 元的底气。**

## 7.4 把三个场景填进表

**在 `NOTES.md` 里画这张表：**

| 场景 | 输入 token | 输出 token | 单价 | 单次成本 | 批量成本 |
|---|---|---|---|---|---|
| 客服对话 | | | | | |
| 文档问答 | | | | | |
| 批量分类 | | | | | |

**这张表就是你以后报价的依据。**

---

# 第 8 步：五个必须知道的坑（15 分钟）

## 坑 1：把"元/千 token"当"元/token"

```javascript
// 错
const cost = tokens * price.input;        // 1000 倍！

// 对
const cost = (tokens / 1000) * price.input;
```

**这个错误不会报错，只会让你把 4 厘算成 4 元。**

**然后你会得出"这个功能不能做，太贵了"的结论 —— 而实际上是你的算术错了。**

## 坑 2：不区分 input 和 output

```javascript
// 错
const cost = totalTokens * price.input;

// 对
const cost = (promptTokens / 1000) * price.input + (completionTokens / 1000) * price.output;
```

**输出单价是输入的 3-4 倍。用统一价算，会低估成本。**

**低估的后果比高估严重：高估让你少赚，低估让你亏钱。**

## 坑 3：`usage` 缺失时当成 0

```javascript
// 错
const promptTokens = data.usage?.prompt_tokens || 0;

// 对
const promptTokens = data.usage?.prompt_tokens ?? estimateTokens(...);
```

**用 0 的后果：**

```text
报表显示"本月 0 元"
实际花了 800 元
你以为没事，直到收到账单
```

**必须估算，并标记 `estimated`。**

## 坑 4：忘了 system 也在算钱

**"我只发了 5 个字，怎么会收费？"**

**因为你每次都在重发那个 300 字的 system。**

**这就是第 6 周"提示词要精简"的经济理由。**

**如果 system 有 1500 字，你每问一句话都在付 1950 token 的钱。**

## 坑 5：以为缓存能省 system 的钱

**有些服务商支持"提示词缓存"（prompt caching）：**

```text
相同的前缀（通常是 system）第二次调用时价格打 1-2 折
```

**但：**

```text
① 不是所有服务商支持
② 有最小长度要求（比如 1024 token 以上才算）
③ 有效期很短（通常 5 分钟）
④ 计费方式不同（有的按"缓存写入"另收费）
```

**所以：**

```text
能开就开，但不要把它算进你的成本模型里
先按全价算，省下的是惊喜
```

**按乐观情况定价，是亏钱的开始。**

---

# 第 9 步：修一个你没注意到的 bug（10 分钟）

**回到 6.1 节这段代码：**

```javascript
const total = rows.reduce((sum, row) => sum + parseFloat(String(row.合计).replace(/[^\d.]/g, "") || 0), 0);
```

**问题在哪：**

```text
"¥0.4000 厘"  → replace 后是 "0.4000"  → 加的是 0.4
"¥0.0012"     → replace 后是 "0.0012"  → 加的是 0.0012
```

**两者单位不同！** 一个加的是"厘数值"，一个加的是"元数值"。

**正确做法：格式化只用于显示，计算必须用原始数字。**

**改法：**

```javascript
const rows = [];
let totalYuan = 0;

for (const item of CASES) {
  // ...
  totalYuan += cost.total;   // 累加原始值

  rows.push({
    // ...
  });
}

console.log(`四次调用合计：${formatMoney(totalYuan)}`);
```

**这条要记住：**

> **数字在计算时保持原始精度，只在显示的最后一步格式化。**
>
> **"把格式化后的字符串再解析回来算"，是 bug 的温床。**

**这个 bug 在真实项目里会以"报表金额和账单对不上"的形式出现，你会查一整天。**

---

# 第 10 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 一次调用成本的四行数字（模型、两个单价、一句"你好"的成本）
2. 三个场景的成本表
3. "输出比输入贵几倍"这个倍数
4. 「卡在哪」

---

# 第 11 步：课后练习

## 练习一：给你的模型做一张价格卡

**要求：** 在 `pricing.js` 里加三条注释：价格来源、查询日期、换算过程。

```javascript
// 来源：xxx 官网价格页
// 查询日期：2026-11-16
// 换算：$0.15/1M input × 7.1 汇率 = 0.001065 元/千 token
```

**为什么：** 三个月后价格变了，你需要知道"当时是按什么算的"。

## 练习二：加一个"反向计算"

**输入：客户预算 100 元/月，每次对话 4 厘。**

**输出：这个预算能支撑多少次对话？够多少个用户（每人每天 5 次）？**

**写成一个函数 `budgetToUsers({ budgetYuan, costPerCall, callsPerUserPerDay })`。**

**这个函数是你和客户谈报价时最有用的东西。**

## 练习三：找出你提示词里最贵的那段

**要求：** 用 `estimateTokens` 量一下你第 6 周写的每个 system 提示词，算出"每天 1000 次调用，光 system 一个月多少钱"。

**你会想删掉几句废话。**

## 练习四：想清楚这四个问题

```text
1. 为什么输出比输入贵？
2. 为什么"要求长输出"比"塞长资料"更贵？
3. 为什么用 0 代替缺失的 usage 是危险的？
4. "提示词缓存"明明能省钱，为什么定价时不该算进去？
```

---

# 第 12 步：最终验收

## A. 环境

- [ ] `token-lab` 目录结构正确
- [ ] `npm run mock` 能启动假模型在 4010
- [ ] `.env` 没进 `git status`
- [ ] `config.js` 里主服务端口是 4020

## B. 代码

- [ ] `pricing.js` 有 `PRICES` / `getPrice` / `calcCost` / `formatMoney`
- [ ] `llm.js` 有 `chat` 和 `estimateTokens`
- [ ] `chat` 返回 `usage`（含 `estimated`）
- [ ] `chat` 返回 `finishReason`
- [ ] `chat` 支持外部 `signal` + 超时组合

## C. 数据

- [ ] 我用真模型跑过一次 `npm run e01`
- [ ] 我填了真实的两个单价
- [ ] 我记录了"一句你好"的成本
- [ ] 三个场景的成本表填完了

## D. 认知

- [ ] 我能说出 token 和汉字的大致换算
- [ ] 我知道输出单价为什么比输入高
- [ ] 我知道 `usage` 缺失时该估算而不是当 0
- [ ] 我知道为什么格式化不能参与计算

## 本节课要能说出口的一句话

> **成本 = 输入 token × 输入单价 + 输出 token × 输出单价。算不清这个，你所有的报价都是猜。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `EADDRINUSE :::4020` | 端口被占 | 改 `config.js` 的 port，或关掉旧进程 |
| `Cannot use import statement` | 没 `"type": "module"` | 加到 `package.json` |
| `process.env.LLM_BASE_URL` 是 undefined | 没加 `--env-file` | 用 `npm run e01` |
| `AbortSignal.any is not a function` | Node 版本低 | 升级到 20+ |
| `usage` 是 `undefined` | 中转没返回 | 已做估算兜底，看 `estimated` 字段 |
| 算出来"免费" | 单位错（漏除 1000） | 检查 `calcCost` |
| 合计对不上 | 格式化后参与计算 | 用原始 `cost.total` 累加 |
| 假模型 4010 冲突 | 第 6 周的还在跑 | 关掉旧的：`taskkill /PID xxx /F` |
| 中文乱码 | 终端编码 | `chcp 65001` 或换 Windows Terminal |
