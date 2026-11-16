# 第 45 节课：长度限制与上下文裁剪——别让一条输入吃掉一天预算

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你会记账了。翻一下你的账本，**最贵的那次是多少？为什么贵？**
> 今天解决这个问题：**给输入和输出都设上限，并且让"被截断"这件事可见。**

**建议用时**：130 分钟
**你需要先完成**：第 44 节课（账本能记、`report.js` 能查）

---

# 第 0 步：三个会烧钱的入口（10 分钟）

## 0.1 先看你的账本

**跑：**

```text
npm run report --by=day
```

**如果最贵的那次是几十次平均值的 5 倍以上**，说明你已经有一个"异常贵"的调用。

**这种调用通常来自三个入口：**

| 入口 | 场景 | 单次成本 |
|---|---|---|
| **超长输入** | 有人粘了一整篇 3 万字的合同 | 0.3-1 元 |
| **超长输出** | 提示词写"详细说明"，它写了 2000 字 | 0.2-0.5 元 |
| **超长历史** | 多轮对话第 40 轮，每轮都重发全部历史 | 每次都比上次贵 |

## 0.2 为什么"长历史"最隐蔽

**假设每次对话增加 200 token 历史，用户连续问 30 轮：**

```text
第 1 轮  输入 500 token
第 10 轮 输入 2300 token
第 20 轮 输入 4300 token
第 30 轮 输入 6300 token
```

**总输入 = (500 + 6300) × 30 / 2 ≈ 102000 token**

**而如果只带最近 5 轮：**

```text
每次输入 ≈ 500 + 1000 = 1500 token
总输入 = 1500 × 30 = 45000 token
```

**差了 2.3 倍。** 而且用户感知不到任何差别 —— 因为 30 轮前说的话，本来就该忘了。

## 0.3 三种限制，缺一不可

```text
① 输出上限      max_tokens      防"让它说太多"
② 单条输入上限   单条消息字符数    防"粘一整篇"
③ 历史裁剪      只带最近 N 轮     防"越聊越贵"
```

**很多人只做第 ①，然后被第 ③ 坑。**

**因为 `max_tokens` 只管输出，输入你想限也限不住 —— 除非你自己在代码里截。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `token-lab` 里） | 内容 |
|---|---|---|
| `src/limits.js` | `src/` | 三个限制的实现 |
| `src/llm.js` | `src/` | 改：拒收超长输入 + 识别截断 |
| `experiments/e03-limits.js` | `experiments/` | 三个限制的成本对比实算 |
| `results/e03.md` | `results/` | 对比表 |

---

# 第 1 步：输出上限（25 分钟）

## 1.1 先看它不设上限会怎样

**临时改一下：把 `maxTokens` 设成 4000，让它写"详细"内容。**

**新建 `experiments/e03-limits.js`：**

```javascript
import { chat } from "../src/llm.js";
import { calcCost, formatMoney } from "../src/pricing.js";

const LONG_ASK = "请详细写一段产品介绍，越详细越好：不锈钢保温杯，500ml，保温 12 小时。";

const run = async (maxTokens) => {
  const started = Date.now();

  const result = await chat(
    [{ role: "user", content: LONG_ASK }],
    { temperature: 0.7, maxTokens, feature: "limit-test" }
  );

  const cost = calcCost({
    model: result.model,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  });

  console.log(`\n--- max_tokens = ${maxTokens} ---`);
  console.log(`输出字符数：${[...result.content].length}`);
  console.log(`输出 token：${result.usage.completionTokens}`);
  console.log(`finish_reason：${result.finishReason}`);
  console.log(`成本：${formatMoney(cost.total)}`);
  console.log(`耗时：${Date.now() - started}ms`);
  console.log(`\n前 100 字：${result.content.slice(0, 100)}`);
  console.log(`\n后 100 字：${result.content.slice(-100)}`);

  return { maxTokens, ...result.usage, finishReason: result.finishReason, cost: cost.total, content: result.content };
};

const main = async () => {
  const results = [];

  for (const maxTokens of [50, 200, 800, 4000]) {
    results.push(await run(maxTokens));
  }

  console.log("\n===== 对比表 =====");
  console.table(
    results.map((item) => ({
      max_tokens: item.maxTokens,
      实际输出: item.completionTokens,
      finish_reason: item.finishReason,
      字符数: [...item.content].length,
      成本: formatMoney(item.cost),
    }))
  );
};

main().catch((error) => {
  console.error("跑挂了：", error.userMessage || error.message);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "e03": "node --env-file=.env experiments/e03-limits.js"
```

**跑：**

```text
npm run e03
```

**用真模型。** 假模型不会真的"越想写越多"。

## 1.2 你要看到的四件事

### 一：`max_tokens: 50` 时，答案被腰斩

```text
finish_reason: "length"
后 100 字：……采用304不锈钢内胆，保温效果
```

**半句话结尾，没有标点。** 这就是被截断的样子。

**`finish_reason: "length"` 是唯一的信号。** 不看这个字段，你永远不知道用户拿到了半句话。

### 二：`max_tokens: 4000` 时，成本涨 5-8 倍

**因为它真的会写很长。**

**而这段长文案，客户可能根本不会用。**

### 三：成本不是线性增长的

```text
50    → 0.0002 元
200   → 0.0009 元
800   → 0.0038 元
4000  → 0.0195 元
```

**因为模型不会写满 `max_tokens`，它写到"觉得够了"就停。** 但这个"够了"由提示词和模型共同决定，**你只能通过 `max_tokens` 硬切。**

### 四：不设上限的接口，等于没设防

**`max_tokens` 不传，很多服务商会用默认值（常见 4096 或更大）。**

**你的 lar 提示词里有一句"详细说明"，就有人能让你花 0.02 元一次。**

**一天 1000 次 = 20 元。看起来不多。但如果有 10 个这样的接口，一天 200 元，一个月 6000 元。**

## 1.3 定 `max_tokens` 的方法

**不要拍脑袋。用这个方法：**

### 第一步：算出"正常答案有多长"

**跑 20 次正常提问，统计 `completion_tokens` 分布：**

```javascript
const samples = [];
// ... 跑 20 次 ...
samples.sort((a, b) => a - b);
console.log("中位数：", samples[10]);
console.log("P90：", samples[18]);
console.log("最大：", samples[19]);
```

### 第二步：`max_tokens` 取 P90 的 1.5 倍

```text
中位数 180
P90    320
最大   900（异常长的）

max_tokens = 320 × 1.5 ≈ 500
```

**为什么不用"最大"：**

**最大那次可能是模型抽风，为了它把上限设到 900，等于放开了 3 倍的成本空间。**

**取 P90 × 1.5，意味着"90% 的情况都不截断，剩下的截断也无所谓"。**

### 第三步：截断了怎么办 —— 要能补

**`finish_reason: "length"` 时，有两种处理：**

```text
A. 告诉用户"答案较长已截断，可点击继续"
B. 自动续写（把这半句话作为 assistant 消息追加，再请它接着写）
```

**推荐 A（便宜、可控）。** B 会多花一次调用的钱，而且容易跑偏。

**今天先做 A 的一半：至少让它可见。**

## 1.4 在 `llm.js` 里把截断变成显式信号

**改 `chat` 的返回：**

```javascript
  return {
    content: content.trim(),
    finishReason,
    truncated: finishReason === "length",   // 新增
    usage: { ... },
    model,
  };
```

**为什么要单独一个 `truncated` 布尔：**

```text
调用方写 if (result.finishReason === "length")    → 记不住这个字符串
调用方写 if (result.truncated)                    → 一眼看懂
```

**把"魔法字符串"在边界处转成布尔，是让代码可读的基本功。**

**然后在 `record` 里加一个字段：**

```javascript
    truncated: Boolean(entry.truncated),
```

**这样报表里能直接统计"有多少次被截断"。**

**如果截断率超过 10%，说明你的 `max_tokens` 定小了。** 这是一个可监控的指标。

---

# 第 2 步：单条输入上限（20 分钟）

## 2.1 为什么必须在服务端拒收

**你可能会想"前端限制一下输入框就行"。**

**错。** 前端限制：

```text
① 用户能改（F12 改 maxlength 是 3 秒的事）
② 脚本直接调接口，根本不过前端
③ curl 一行就能发 10 万字
```

**服务端必须自己检查。** 这是第 8 周"防刷"的第一课，今天先做最基础的一层。

## 2.2 新建 `src/limits.js`

```javascript
export const LIMITS = {
  maxInputChars: 8000,        // 单条消息最多 8000 字符
  maxHistoryRounds: 6,        // 只带最近 6 轮
  maxTotalTokensEstimate: 12000,  // 整个 prompt 的 token 上限
};

export class LimitError extends Error {
  constructor(message, kind, detail) {
    super(message);
    this.name = "LimitError";
    this.kind = kind;         // "input" | "history" | "total"
    this.detail = detail;
    this.statusCode = 413;    // 413 Payload Too Large
  }
}

export const assertInputLength = (text, max = LIMITS.maxInputChars) => {
  const length = [...String(text ?? "")].length;

  if (length > max) {
    throw new LimitError(
      `单条消息最多 ${max} 字，你提交了 ${length} 字`,
      "input",
      { length, max }
    );
  }
};
```

**逐个设计说清：**

### 为什么用 `[...text].length` 而不是 `text.length`

**和上一节一样：emoji 算两个字符。**

**用户看到的是 8000 个符号，你的代码必须按符号算。**

### 为什么是 413

**HTTP 状态码里，413 就是 `Payload Too Large`。**

**用对状态码的好处：**

```text
前端能区分"输入太长"和"服务器出错"
监控能按状态码分类
日志里一看 413 就知道是限流，不是 bug
```

### 为什么抛 `LimitError` 而不是返回 `null`

**因为这是"用户做错了"，不是"系统出问题了"。**

**用异常区分两者，上层能给出不同的话：**

```text
LimitError  → "你提交的内容太长，请分段"
LlmError    → "服务暂时不可用，请稍后重试"
```

**给用户看的话不同，处理方式也不同。**

## 2.3 接到 `chat` 前面

**在 `llm.js` 的 `chat` 开头加：**

```javascript
import { assertInputLength, assertTotalEstimate } from "./limits.js";

export const chat = async (messages, options = {}) => {
  // 先检查每一条输入
  messages.forEach((message, index) => {
    assertInputLength(message.content, LIMITS.maxInputChars);
  });

  // 再检查总量
  assertTotalEstimate(messages);

  // ... 原来的逻辑
};
```

**注意顺序：先单条，再总量。**

**为什么：**

```text
如果先检查总量，用户会收到"总共太长"——但他不知道是哪一条
先检查单条，能直接告诉他"第 3 条太长"
```

**错误信息的具体程度，决定了用户能不能自己解决。**

## 2.4 总量检查

**在 `limits.js` 里加：**

```javascript
import { estimateTokens } from "./llm.js";

export const assertTotalEstimate = (messages, max = LIMITS.maxTotalTokensEstimate) => {
  const total = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);

  if (total > max) {
    throw new LimitError(
      `本次请求内容过长（约 ${total} token，上限 ${max}），请减少历史或分段提问`,
      "total",
      { total, max }
    );
  }

  return total;
};
```

**这里有个循环依赖问题：** `limits.js` import `llm.js`，`llm.js` import `limits.js`。

**ES Module 能处理循环依赖，但容易出"undefined is not a function"。**

**修法：把 `estimateTokens` 挪到独立的 `src/tokens.js`。**

**必须改：**

```text
src/tokens.js     ← estimateTokens 放这里
src/llm.js        ← import from "./tokens.js"
src/limits.js     ← import from "./tokens.js"
```

**为什么必须改：**

**循环依赖在开发时可能"看起来能跑"，但在某些加载顺序下会变成 `undefined`。**

**这类 bug 极难查，因为它在不同机器上表现不一样。**

**规则：工具函数单独成文件，不要互相 import。**

---

# 第 3 步：历史裁剪（30 分钟）

**这是这一节最重要的一段。**

## 3.1 先看问题有多大

**在 `e03-limits.js` 里加一个模拟：**

```javascript
const simulateHistory = (rounds, keepRounds) => {
  let totalInput = 0;
  const systemTokens = 400;
  const perRound = 200;

  for (let round = 1; round <= rounds; round += 1) {
    const actualRounds = keepRounds ? Math.min(round, keepRounds) : round;
    totalInput += systemTokens + actualRounds * perRound;
  }

  return totalInput;
};

console.log("\n===== 30 轮对话的累计输入 =====");
console.log("不裁剪：", simulateHistory(30, null), "token");
console.log("只带 6 轮：", simulateHistory(30, 6), "token");
console.log("只带 3 轮：", simulateHistory(30, 3), "token");
```

**不花钱，直接算出差距。**

**你应该看到：**

```text
不裁剪：  99000 token
只带 6 轮： 27600 token
只带 3 轮： 18600 token
```

**3.6 倍的差距，用户完全感知不到。**

## 3.2 裁剪策略：保留什么

**关键：不能简单 `slice(-N)`。**

**因为有三样东西必须保留：**

```text
① system 提示词         —— 永远第 1 条，绝不能裁
② 第一条用户消息        —— 常常承载"我的需求是什么"
③ 最近 N 轮             —— 上下文连续性
```

**为什么第 ② 重要：**

```text
用户第 1 句："我在做一个保温杯的详情页文案"
第 20 轮："再改得活泼点"
如果裁掉第 1 句，模型不知道"改什么"
```

## 3.3 实现

**在 `limits.js` 里加：**

```javascript
export const trimHistory = (messages, keepRounds = LIMITS.maxHistoryRounds) => {
  if (messages.length === 0) return [];

  const systemMessages = messages.filter((message) => message.role === "system");
  const dialogue = messages.filter((message) => message.role !== "system");

  const maxMessages = keepRounds * 2;

  if (dialogue.length <= maxMessages) {
    return [...systemMessages, ...dialogue];
  }

  // 保留第一轮 + 最近 N 轮
  const firstRound = dialogue.slice(0, 2);
  const recent = dialogue.slice(-maxMessages);

  // 防止第一轮和最近轮重叠
  const firstIds = new Set(firstRound);
  const recentFiltered = recent.filter((message) => !firstIds.has(message));

  const omitted = dialogue.length - firstRound.length - recentFiltered.length;

  return [
    ...systemMessages,
    ...firstRound,
    ...(omitted > 0
      ? [{ role: "system", content: `（此处省略了 ${omitted} 条较早的对话）` }]
      : []),
    ...recentFiltered,
  ];
};
```

## 3.4 四个关键设计

### 设计一：`maxMessages = keepRounds * 2`

**"一轮" = 用户一句 + 助手一句 = 2 条消息。**

**不乘 2，你会把 3 轮当成 3 条消息，裁得过狠。**

### 设计二：插一条"省略提示"

```javascript
{ role: "system", content: "（此处省略了 14 条较早的对话）" }
```

**为什么需要：**

```text
不告诉它，它可能以为对话刚开始
用户问"我刚才说的那个型号"，它会答"你没提过"
```

**告诉它，它至少能回答"较早的对话已省略，请再说一次"。**

**这也是第 37 节"切了要告诉它"的同一条原则。**

### 设计三：用 `Set` 去重，而不是比较索引

```javascript
const firstIds = new Set(firstRound);
const recentFiltered = recent.filter((message) => !firstIds.has(message));
```

**为什么用对象引用比较：**

**因为对话可能有"重复内容"（用户重复问同一句），用内容比较会误删。**

**对象引用是唯一的，内容不是。**

### 设计四：`omitted` 计算要准

```javascript
const omitted = dialogue.length - firstRound.length - recentFiltered.length;
```

**不能写成 `dialogue.length - maxMessages`，因为还有 firstRound 那 2 条。**

**算错的后果：提示语说"省略了 14 条"，实际省略了 12 条。** 模型会基于错误信息推理。

**误差不大，但没必要错。**

## 3.5 接进去，然后验证

**在 `chat` 开头（长度检查之前）：**

```javascript
export const chat = async (messages, options = {}) => {
  const { keepRounds = LIMITS.maxHistoryRounds } = options;
  const trimmed = trimHistory(messages, keepRounds);

  trimmed.forEach((message) => assertInputLength(message.content));
  assertTotalEstimate(trimmed);

  // 用 trimmed 而不是 messages
  // ...
};
```

**然后加一个实验：**

```javascript
const buildMessages = (rounds) => {
  const messages = [{ role: "system", content: "你是一个产品文案助手。" }];

  for (let i = 1; i <= rounds; i += 1) {
    messages.push({ role: "user", content: `第 ${i} 轮：请把文案改得再活泼一点。` });
    messages.push({ role: "assistant", content: `好的，第 ${i} 版文案……` });
  }

  messages.push({ role: "user", content: "最后一轮：请总结一下改了什么。" });

  return messages;
};

const runWithHistory = async (rounds, keepRounds) => {
  const messages = buildMessages(rounds);
  const result = await chat(messages, { keepRounds, feature: "history-test" });

  console.log(`\n--- ${rounds} 轮历史，keep=${keepRounds} ---`);
  console.log(`实际发送的输入 token：${result.usage.promptTokens}`);
  console.log(`本次成本：${formatMoney(calcCost({ model: result.model, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens }).total)}`);
};
```

**跑：**

```javascript
await runWithHistory(20, 20);   // 不裁
await runWithHistory(20, 6);    // 裁到 6 轮
await runWithHistory(20, 3);    // 裁到 3 轮
```

**看三次的 `promptTokens` 差多少。**

**这才是"真金白银"的对比。** 不是算出来的，是 API 报的。

---

# 第 4 步：让"被截断"可见（20 分钟）

## 4.1 三个地方要知道"截了"

| 位置 | 怎么知道 | 该做什么 |
|---|---|---|
| 输出被 `max_tokens` 截 | `finish_reason: "length"` | 告诉用户/续写 |
| 输入被单条上限拒 | 抛 `LimitError` | 告诉用户"太长" |
| 历史被裁 | 你的 `trimHistory` 知道 | 告诉模型 + 告诉用户 |

**第三条最容易被忽略。**

## 4.2 返回裁剪信息

**让 `chat` 把裁剪情况带回来：**

```javascript
  return {
    content: content.trim(),
    finishReason,
    truncated: finishReason === "length",
    historyTrimmed: trimmed.length !== messages.length,
    omittedMessages: messages.length - trimmed.length,
    usage: { ... },
    model,
  };
```

**然后前端/命令行可以显示：**

```text
提示：较早的 14 条对话已省略
```

**为什么这很重要：**

**用户会问"它怎么忘了我刚才说的"。** 有了这句提示，用户知道是"系统为了省钱裁掉了"，而不是"这个 AI 很笨"。

**把技术上的限制翻译成用户能理解的话，是产品基本功。**

## 4.3 记账加上截断标记

**在 `record` 里已经有 `truncated`。再加上：**

```javascript
    historyTrimmed: Boolean(entry.historyTrimmed),
```

**然后报表能算出：**

```text
截断率：3.2%
历史裁剪率：41%
```

**两个指标都有用：**

```text
截断率高  → max_tokens 定小了，或者提示词要求太多内容
裁剪率高  → 用户聊得深，这是好事，但成本要算准
```

---

# 第 5 步：五个必须知道的坑（15 分钟）

## 坑 1：以为 `max_tokens` 能限制成本上限

**`max_tokens` 只限输出，不限输入。**

**一次调用的最坏成本：**

```text
(输入 token × 输入单价) + (max_tokens × 输出单价)
```

**输入那一项你可以通过单条上限 + 历史裁剪管住，但 `max_tokens` 只管第二项。**

**所以：**

```text
只设 max_tokens，输入还是可能 20 万 token
三个限制一起上，才有上界
```

**这就是为什么这一节要讲三个，不是一个。**

## 坑 2：在 `system` 里裁历史

**有人这么写：**

```javascript
const messages = [{ role: "system", content: system + historyText }];
```

**为什么错：**

```text
① system 优先级最高，历史里如果有注入，等于升权
② 你没法按"轮"裁剪，只能按字数切，容易切半句话
③ 记账时分不清"system 花了多少"和"历史花了多少"
```

**历史必须是独立的 `user`/`assistant` 消息。**

## 坑 3：`slice(-N)` 把 system 裁掉了

```javascript
const recent = messages.slice(-12);   // 可能不含 system
```

**如果 `messages[0]` 是 system，`slice(-12)` 在 20 条消息时会把它裁掉。**

**后果：模型失去全部规则，开始胡说。**

**这个 bug 的表现是"聊到一定程度就开始不听话"。** 非常难查。

**必须用 `filter(role !== "system")` 分开处理。**

## 坑 4：按字符数裁，不按 token

**"保留最近 2000 字符的历史"听起来合理。**

**但：**

```text
2000 个汉字 ≈ 2600 token
2000 个英文字符 ≈ 500 token
```

**差了 5 倍。**

**按 token 裁才准。** 但你手上只有 `estimateTokens`（±20%）。

**实用做法：**

```text
按"轮数"裁（简单、可预测）
再用 estimateTokens 做总量兜底检查
```

**两条一起用，比单独用任一条都稳。**

## 坑 5：裁剪后 `requestId` 不明

**用户投诉"这个回答不对"，你查账本发现这次调用的输入只有 3000 token。**

**但用户认为他提供了 2 万字上下文。**

**你需要能回答"这次调用到底发了什么"。**

**修法：把"裁剪后实际发送的内容"也存一份（或在开发环境打印）。**

**不要存全部用户内容（隐私），但至少存"裁剪掉了多少条"。**

**排查这类问题时，"实际发了多少"比"用户以为发了多少"重要。**

---

# 第 6 步：故意做四个实验（15 分钟）

## 实验 1：`max_tokens` 设成 10

**看 `finish_reason`。**

**然后 `trimmed = result.content`（最后的清洗已经 `trim()`），看输出还剩什么。**

**大概率是半句话甚至一个字。**

**记住：用户会看到这个。**

## 实验 2：把 `keepRounds` 设成 1

**跑 20 轮历史的那个实验。**

**看 `promptTokens` 降到多少，然后问自己：**

```text
只带 1 轮，模型还能不能回答"总结一下改了什么"？
```

**大概率不能。** 这就是"省钱"和"能用"的边界。

## 实验 3：删掉"省略提示"那一行

**跑 `runWithHistory(20, 8)`，然后问模型：**

```text
我问的第 3 个问题是什么？
```

**有省略提示时：它会说"较早对话已省略"**
**没有时：它可能编一个答案**

**这个实验最能说明"切了要告诉它"。**

## 实验 4：把 `assertInputLength` 的上限设成 10

**然后问一句 20 字的问题。**

**看抛出来的错误是 `LimitError` 还是 `LlmError`。**

**应该是 `LimitError`，`statusCode: 413`。**

**如果你的 `chat` 里 catch 了所有错误并转成 `LlmError`，说明你丢了错误类型 —— 去修。**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 四个 `max_tokens` 值的成本对比表（真实数字）
2. 20 轮历史在 `keepRounds=20/6/3` 下的 `promptTokens`
3. 你定的三个上限，以及依据
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：给 `max_tokens` 找一个有依据的值

**要求：** 跑 20 次你的真实业务提问，统计 `completion_tokens` 的中位数和 P90，算出你该用的 `max_tokens`（P90 × 1.5）。

**写进 `NOTES.md`，并注明"依据是 20 次采样"。**

**这个动作以后每个项目都要做一次。** 拍脑袋定的值，三个月后你解释不了。

## 练习二：做"自动续写"（选做，成本会翻倍）

**要求：** `truncated` 为真时，把已生成的半句话作为 `assistant` 消息追加，再请它"接着上面继续写，不要重复"。

**要注意的坑：**

```text
① 要限制最多续 1 次（不然可能无限续）
② 续写要拼接到原文，不能覆盖
③ 成本要记在同一个 requestId 下
```

**做完对比一下"截断 + 续写"和"一次给足 max_tokens"哪个更贵。**

## 练习三：加"输入长度分布"统计

**要求：** 记账里加上 `inputChars` 字段，报表里能算出 P50/P90/P99。

**为什么：** 如果你的 P99 是 30000 字符，说明真有人在粘长文，**你的 8000 上限会拒掉真实用户。**

**上限该定多少，靠分布定，不靠感觉。**

## 练习四：想清楚这四个问题

```text
1. 为什么 max_tokens 单独用不能保证成本上界？
2. 为什么历史裁剪必须保留第一条用户消息？
3. 为什么"省略提示"能让模型不编造？
4. 为什么按字符裁历史不准，按轮裁又不够精确？
```

---

# 第 9 步：最终验收

## A. 代码

- [ ] `limits.js` 有 `LIMITS` / `LimitError` / `assertInputLength` / `assertTotalEstimate` / `trimHistory`
- [ ] `tokens.js` 独立存在，`llm.js` 和 `limits.js` 都从它 import
- [ ] `chat` 里顺序是：裁剪 → 单条检查 → 总量检查
- [ ] `chat` 返回 `truncated` / `historyTrimmed` / `omittedMessages`
- [ ] `LimitError` 的 `statusCode` 是 413

## B. 数据

- [ ] 我跑过 4 个 `max_tokens` 值的对比（真实模型）
- [ ] 我算过 20 轮历史在三种 `keepRounds` 下的 token 差异
- [ ] 我记录了截断时的输出（半句话）
- [ ] 我验证过：只带 1 轮会答不出"总结"

## C. 认知

- [ ] 我知道 `max_tokens` 只管输出
- [ ] 我知道 `slice(-N)` 会裁掉 system
- [ ] 我知道裁剪后必须保留第一条用户消息
- [ ] 我知道"省略提示"是为了防编造

## 本节课要能说出口的一句话

> **没有上限的接口，等于把信用卡交给陌生人。三个限制一起上，才有上界。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 答案半句话 | `max_tokens` 太小 | 看 `finish_reason`，按 P90×1.5 调 |
| 聊久了开始不听话 | `slice(-N)` 裁掉 system | 用 `filter` 分开处理 |
| `LimitError` 变 `LlmError` | catch 吞掉了类型 | 单独 catch 再 rethrow |
| 裁剪后模型说"你没提过" | 没插省略提示 | 加一条 system 说明 |
| `estimateTokens` 是 undefined | 循环依赖 | 抽到 `tokens.js` |
| 413 前端没提示 | 前端没处理状态码 | 按 status 分类给文案 |
| 上限 8000 拒掉了真实用户 | 上限定太低 | 看 P99 输入长度再定 |
| 裁剪后成本没降 | 只裁了消息条数没裁长度 | 单条也要限 |
| 截断率 30% | 提示词要太多内容 | 减要求，或分两次调用 |
