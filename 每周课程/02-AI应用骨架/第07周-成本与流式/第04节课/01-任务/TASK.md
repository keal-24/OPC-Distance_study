# 第 46 节课：结果缓存——把重复的钱省下来，别把数据串出去

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你设了三个上限，成本有上界了。但翻账本你会发现：**很多调用在问一模一样的问题。**
> 今天把重复的省掉。**但先记住：缓存错了会出事故，比多花钱严重得多。**

**建议用时**：130 分钟
**你需要先完成**：第 45 节课（三个限制能用，账本能查）

---

# 第 0 步：先看有多少重复（10 分钟）

## 0.1 一个必做的统计

**跑：**

```text
npm run report --by=feature
```

**然后问自己一个问题：**

```text
"我的用户，有多少次问的是同一个问题？"
```

**大部分 AI 应用里，这个比例是 20%-60%。**

**典型的高重复场景：**

| 场景 | 重复率 | 为什么 |
|---|---|---|
| FAQ 客服 | 60-80% | 就那么几十个问题 |
| 商品文案改写 | 30-50% | 同一批商品被反复处理 |
| 合同信息提取 | 10-20% | 每份合同都不同 |
| 创意写作 | 5% | 每次都想不一样 |

**差别很大，所以必须实测，不能假设。**

## 0.2 缓存能省多少 —— 一个上限算式

```text
省钱上限 = 重复率 × 100%
```

**重复率 50% → 最多省一半。**

**但实际省得更少，因为：**

```text
① 缓存也有成本（哈希、读文件、占内存）
② 命中率受 TTL 影响（过期了就没了）
③ 有些请求你不敢缓存（带隐私）
```

**现实预期：重复率 50% 的场景，最终省 30-40%。**

**这个数字已经很大了。一天 100 元变 65 元，一个月省 1000 元。**

## 0.3 但缓存是最容易出事的地方

**三种事故，按严重程度：**

```text
① 串号：A 用户的答案给了 B 用户 → 数据泄漏（最严重，可能是法律责任）
② 串模型：换了模型还在返回旧答案 → 产品坏了，用户不知道为什么
③ 陈旧：数据变了还返回旧值 → 用户投诉"系统显示的不对"
```

**三种都是"加缓存"这一个动作带来的。**

**所以今天的重点不是"怎么加缓存"，是"怎么加才不会出事"。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `token-lab` 里） | 内容 |
|---|---|---|
| `src/cache.js` | `src/` | 哈希键、读写、TTL、统计 |
| `src/cache-policy.js` | `src/` | 什么能缓存、什么不能 |
| `src/llm.js` | `src/` | 改：调用前查缓存，命中则短路 |
| `experiments/e04-cache.js` | `experiments/` | 命中率与成本降幅实测 |
| `results/e04.md` | `results/` | 对比表 |

---

# 第 1 步：先定"能不能缓存"的规则（20 分钟）

**写代码之前先把规则写下来。这一步比代码重要。**

## 1.1 三个判据

**判据一：两个不同用户看到同一个答案，会不会有问题？**

```text
不会 → 可以缓存（公开信息：天气、汇率、通用知识）
会   → 不能缓存，或必须按用户隔离
```

**判据二：内容会不会变？**

```text
永不变     → 长 TTL（翻译、摘要）
每天变     → 短 TTL（当天库存）
每分钟变   → 不缓存（实时价格）
```

**判据三：输出是否确定？**

```text
同样的输入 → 同样的输出（分类、提取）→ 值得缓存
同样的输入 → 每次不同（创意写作）  → 缓存了反而奇怪
```

## 1.2 建一张决策表

**新建 `src/cache-policy.js`：**

```javascript
/**
 * 缓存策略：按 feature 定义
 * 新增 feature 时必须在这里登记，没登记的默认不缓存
 */
export const CACHE_POLICY = {
  // 公开知识问答：可以跨用户共享
  "faq-answer": {
    enabled: true,
    scope: "global",
    ttlSeconds: 24 * 3600,
    reason: "公开 FAQ，用户之间答案一致",
  },

  // 商品文案改写：按商品内容缓存，跨用户共享
  "product-rewrite": {
    enabled: true,
    scope: "global",
    ttlSeconds: 7 * 24 * 3600,
    reason: "同一商品参数改写结果稳定，且不含用户隐私",
  },

  // 翻译：完全确定，长期有效
  translate: {
    enabled: true,
    scope: "global",
    ttlSeconds: 30 * 24 * 3600,
    reason: "同一段文本的翻译基本不变",
  },

  // 文档问答：资料本身可能变，短 TTL
  "doc-qa": {
    enabled: true,
    scope: "global",
    ttlSeconds: 3600,
    reason: "资料更新后需要失效，1 小时是折中",
  },

  // 带用户数据的对话：必须按用户隔离，且时间很短
  chat: {
    enabled: true,
    scope: "user",
    ttlSeconds: 300,
    reason: "多轮对话重复率高，但绝不能跨用户",
  },

  // 带个人隐私的分析：不缓存
  "personal-analysis": {
    enabled: false,
    scope: "none",
    ttlSeconds: 0,
    reason: "含个人隐私，任何形式的共享都有风险",
  },

  // 创意写作：不缓存
  "creative-writing": {
    enabled: false,
    scope: "none",
    ttlSeconds: 0,
    reason: "用户期待每次不同，缓存等于产品退化",
  },
};

export const getPolicy = (feature) => {
  const policy = CACHE_POLICY[feature];

  if (!policy) {
    // 没登记的一律不缓存 —— 安全的默认值
    return { enabled: false, scope: "none", ttlSeconds: 0, reason: "未登记策略" };
  }

  return policy;
};
```

## 1.3 为什么"默认不缓存"是对的

```text
默认缓存 → 新功能上线，忘了登记 → 悄悄缓存了用户隐私 → 出事故
默认不缓存 → 新功能上线，忘了登记 → 只是没省到钱 → 安全
```

**安全的默认值，应该偏向"什么都不做"。**

**这是所有安全设计的通用原则：白名单优于黑名单。**

## 1.4 `scope` 到底怎么用

**`scope: "global"`：缓存键里不含 `userId`，所有用户共享。**

**`scope: "user"`：缓存键里必须含 `userId`，按用户隔离。**

**这一个字段决定了会不会串号。**

**写反了就是数据泄漏。**

**所以要有一条硬规则：**

```text
scope 不是 "global" 的，缓存键必须含 userId
代码里强制检查，不靠人记
```

---

# 第 2 步：设计缓存键（25 分钟）

**这是缓存里最容易出错的地方。键少一个字段，就是一次事故。**

## 2.1 键必须包含"影响输出的所有输入"

**完整清单：**

```text
必须包含：
  model          换模型答案会变
  messages       内容不同答案不同
  temperature    0 和 1 的答案不同
  maxTokens      截断位置不同
  system 提示词   改一个字都算新输入

可选（看业务）：
  feature        同一内容不同功能
  userId         scope=user 时必须
  版本号          提示词大改后强制失效
```

**最容易漏的三个：`model`、`temperature`、`maxTokens`。**

**漏 `model`：换了模型没生效，你以为在测新模型，实际全是旧模型的答案。**

**这个 bug 会让你做出完全错误的评测结论。**

## 2.2 实现

**新建 `src/cache.js`：**

```javascript
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(DIR, "..", "data", "cache");

const ensureDir = () => {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
};

// 参与哈希的字段，顺序固定（顺序变了哈希就变）
export const buildKey = ({ model, messages, temperature, maxTokens, feature, userId, promptVersion }) => {
  const payload = {
    v: 1,                                   // 键结构版本
    model,
    messages,
    temperature,
    maxTokens,
    feature,
    userId: userId || null,
    promptVersion: promptVersion || null,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);
};
```

## 2.3 五个设计决策

### 决策一：`v: 1` 键结构版本

**为什么：**

```text
你以后想给键加一个字段（比如加 seed）
旧缓存的键是按旧结构算的，永远命中不了 → 白占空间
加 v 字段后，升到 v:2，旧的自然失效
```

**没有这个字段，你只能手动清空缓存目录。**

### 决策二：`sha256` 截取 32 位

**完整 sha256 是 64 个 hex 字符，作为文件名太长。**

**截 32 位 = 128 bit，碰撞概率可以忽略。**

**为什么不用短哈希（比如 8 位）：**

```text
32 位 hex = 16^32 种可能 = 3.4e38
一天 10 万次调用，碰撞概率约 10^-28
```

**8 位就只有 4e9 种，一天 10 万次，碰撞概率约 1/40000。**

**一旦碰撞，你就把别人的答案返回给用户。** 这是事故。

**不要在这种地方省字节。**

### 决策三：`JSON.stringify` 顺序固定

**`payload` 对象里的字段顺序必须稳定。**

**为什么：**

```javascript
JSON.stringify({a:1, b:2})   // '{"a":1,"b":2}'
JSON.stringify({b:2, a:1})   // '{"b":2,"a":1}'
```

**两个不同的字符串，算出的哈希完全不同。**

**如果你的代码里有时按 A 顺序构造、有时按 B 顺序，缓存命中率会莫名其妙地低。**

**规则：键的构造只在一个函数里，字段顺序写死。**

### 决策四：`userId: userId || null`

**注意不是 `undefined`。**

```javascript
JSON.stringify({ userId: undefined })   // "{}"          ← 字段被丢弃
JSON.stringify({ userId: null })        // '{"userId":null}'
```

**`undefined` 会让字段消失，导致"有 userId"和"没 userId"算出同一个哈希。**

**这是串号的直接原因。** 必须用 `null`。

### 决策五：`messages` 直接进哈希

**把整个数组序列化进去。**

**代价：哈希计算要序列化整段对话，几 KB 的字符串，毫秒级。** 可接受。

**不去优化它（比如只哈希最后一条），因为：**

```text
只哈希最后一条 → 不同历史 + 相同问题 → 同一个键 → 串答案
```

**这是"省 1 毫秒，赔一次事故"的典型。**

## 2.4 读写实现

**继续在 `cache.js` 里加：**

```javascript
const fileOf = (key) => path.join(CACHE_DIR, `${key}.json`);

export const get = (key) => {
  const file = fileOf(key);

  if (!fs.existsSync(file)) return null;

  try {
    const entry = JSON.parse(fs.readFileSync(file, "utf8"));

    if (Date.now() > entry.expiresAt) {
      fs.unlinkSync(file);   // 过期就删，顺便清理
      return null;
    }

    return entry;
  } catch (error) {
    console.warn("[cache] 读缓存失败：", error.message);
    return null;
  }
};

export const set = (key, value, ttlSeconds, meta = {}) => {
  ensureDir();

  const entry = {
    value,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000,
    meta,
  };

  try {
    fs.writeFileSync(fileOf(key), JSON.stringify(entry), "utf8");
  } catch (error) {
    console.warn("[cache] 写缓存失败：", error.message);
  }

  return entry;
};

export const stats = () => {
  if (!fs.existsSync(CACHE_DIR)) return { files: 0, expired: 0, bytes: 0 };

  const files = fs.readdirSync(CACHE_DIR).filter((name) => name.endsWith(".json"));
  let expired = 0;
  let bytes = 0;

  files.forEach((name) => {
    const file = path.join(CACHE_DIR, name);
    bytes += fs.statSync(file).size;

    try {
      const entry = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Date.now() > entry.expiresAt) expired += 1;
    } catch {
      expired += 1;
    }
  });

  return { files: files.length, expired, bytes, kb: Math.round(bytes / 1024) };
};

export const clear = () => {
  if (!fs.existsSync(CACHE_DIR)) return 0;

  const files = fs.readdirSync(CACHE_DIR).filter((name) => name.endsWith(".json"));
  files.forEach((name) => fs.unlinkSync(path.join(CACHE_DIR, name)));

  return files.length;
};
```

**三个细节：**

### 细节一：`get` 时顺手删过期

**为什么不写"定时清理"：**

```text
① 定时任务要额外的进程/cron，这一周还不该有
② 只有被访问过期的才会删 → 冷数据会一直留着
```

**所以要两个一起用：**

```text
get 时删（热数据的清理）
+ 手动 clear / 定期脚本（冷数据）
```

**今天先做前者。练习里会让你加后者。**

### 细节二：读写失败只 warn，不抛

**和 `record` 同理：缓存是旁路。**

**缓存坏了，最坏情况是"不省钱"，不该变成"功能不可用"。**

### 细节三：`meta` 存什么

**存"这次缓存是什么时候、按什么参数生成的"。**

**排错时你能看出"这个缓存的 maxTokens 是 800，但我现在用 2000，为什么命中了？"**

**`meta` 里放 `model`、`temperature`、`createdAt` 就够了。** 不要放完整 messages（占空间且含隐私）。

---

# 第 3 步：接进 `chat`（30 分钟）

## 3.1 改 `llm.js`

**这是最关键的一段。顺序错了会出问题。**

```javascript
import { buildKey, get as cacheGet, set as cacheSet } from "./cache.js";
import { getPolicy } from "./cache-policy.js";

export const chat = async (messages, options = {}) => {
  const {
    feature = "unknown",
    userId,
    temperature = 0.7,
    maxTokens = CONFIG.llm.maxTokens,
    model = CONFIG.llm.model,
    skipCache = false,
    promptVersion,
  } = options;

  // 1. 裁剪 + 限长（第 45 节）
  const trimmed = trimHistory(messages, options.keepRounds);
  trimmed.forEach((message) => assertInputLength(message.content));
  assertTotalEstimate(trimmed);

  // 2. 查缓存
  const policy = getPolicy(feature);
  const cacheUserId = policy.scope === "global" ? null : userId || "anon";

  const key = buildKey({
    model,
    messages: trimmed,
    temperature,
    maxTokens,
    feature,
    userId: cacheUserId,
    promptVersion,
  });

  if (policy.enabled && !skipCache) {
    const hit = cacheGet(key);

    if (hit) {
      console.log(`[cache] 命中 ${feature}`);

      record({
        userId,
        feature,
        requestId: options.requestId,
        model: hit.meta.model || model,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        ms: 0,
        ok: true,
        status: 200,
        cached: true,
        estimated: false,
        stream: false,
      });

      return {
        content: hit.value.content,
        finishReason: hit.value.finishReason,
        truncated: hit.value.finishReason === "length",
        historyTrimmed: trimmed.length !== messages.length,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: false },
        model: hit.meta.model || model,
        cached: true,
        requestId: options.requestId,
      };
    }
  }

  // 3. 真调用（原逻辑）
  const result = await chatRaw(trimmed, { temperature, maxTokens, model, ...options });

  // 4. 写缓存
  if (policy.enabled && !skipCache) {
    cacheSet(
      key,
      { content: result.content, finishReason: result.finishReason },
      policy.ttlSeconds,
      { model: result.model, temperature, maxTokens, feature }
    );
  }

  // 5. 记账（原逻辑）
  // ...

  return result;
};
```

## 3.2 五个关键设计

### 设计一：缓存命中时 `cost: 0`，但要记账

**为什么记：**

```text
① 你知道"这次请求发生了"（用户是真的在用）
② 你能算出命中率（命中数 / 总请求数）
③ 你能算出"缓存省了多少钱"（如果没命中会花多少）
```

**不记的话，你的"调用次数"会偏低，命中率算不出来。**

### 设计二：`cached: true` 是独立字段

**不要复用 `estimated` 或 `ok`。** 一个字段一个含义。

**因为报表要能区分：**

```text
总请求数 = 命中数 + 实际调用数
节省成本 = 命中数 × 平均单次成本
```

### 设计三：`policy.scope === "global" ? null : userId || "anon"`

**这是防串号的核心一行。**

**如果不是 global，就必须有 userId。**

**`|| "anon"` 是兜底：没登录的用户，所有匿名请求共享一个缓存空间。**

**这里有个风险，必须知道：**

```text
未登录用户的对话，全部命中同一个缓存空间
→ A 匿名用户的问题，可能命中 B 匿名用户的答案
```

**所以：**

```text
凡是 scope: "user" 的 feature，必须要求登录（第 8 周会做）
现在先用 "anon" 兜底，但要在 README 里写明这个限制
```

**如果你不确定，就不要给匿名用户开 `scope: "user"` 的缓存。**

### 设计四：`skipCache` 逃生开关

**什么时候用：**

```text
① 用户点"重新生成"（他要不一样的东西）
② 调试时想看真实调用
③ 数据刚更新，想绕过缓存
```

**没有这个开关，用户点"重新生成"会拿到一模一样的答案 —— 他会以为按钮坏了。**

### 设计五：`promptVersion` 进键

**提示词大改后，旧缓存应该全部失效。**

**传 `promptVersion: PROMPTS.docQaV1.version` 进键，改版本号就自动失效。**

**这比"手动清缓存目录"可靠得多。**

---

# 第 4 步：实测命中率和成本降幅（25 分钟）

## 4.1 新建 `experiments/e04-cache.js`

```javascript
import { chat } from "../src/llm.js";
import { calcCost, formatMoney } from "../src/pricing.js";
import { stats, clear } from "../src/cache.js";

const QUESTIONS = [
  "入职 2 年有几天年假？",
  "出差住宿标准是多少？",
  "企业版最多几个账号？",
  "入职 2 年有几天年假？",      // 重复
  "出差住宿标准是多少？",        // 重复
  "入职 2 年有几天年假？",      // 重复
  "差旅报销几天内提交？",
  "企业版最多几个账号？",        // 重复
];

const SYSTEM = `你是内部资料问答助手。只根据资料回答，资料中没有就说"资料中未提及"。不超过 60 字。`;

const ask = async (question, { skipCache = false, feature = "doc-qa" } = {}) => {
  const result = await chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `【资料】年假：入职满 1 年 5 天，满 3 年 8 天，满 5 年 12 天。住宿：一线城市 500 元/晚，其他 350 元/晚。企业版 50 个账号。报销 7 个工作日内提交。\n\n【问题】${question}` },
    ],
    { temperature: 0.2, maxTokens: 200, feature, skipCache }
  );

  return result;
};

const main = async () => {
  // 先清空，保证从零开始
  const cleared = clear();
  console.log(`清空缓存：${cleared} 个文件`);
  console.log(`初始统计：`, stats());

  let hits = 0;
  let misses = 0;
  let actualCost = 0;
  let costIfNoCache = 0;

  for (const [index, question] of QUESTIONS.entries()) {
    const result = await ask(question);
    const cost = calcCost({
      model: result.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    });

    if (result.cached) {
      hits += 1;
    } else {
      misses += 1;
      actualCost += cost.total;
    }

    // 假设不缓存的话，每次都要花"这次调用的成本"
    // 但命中时我们没有 usage，用上一次非命中的同类成本估算
    costIfNoCache += result.cached ? actualCost / Math.max(misses, 1) : cost.total;

    console.log(
      `${index + 1}. ${result.cached ? "命中" : "调用"}　` +
        `问题：${question.slice(0, 16)}　` +
        `成本：${formatMoney(result.cached ? 0 : cost.total)}`
    );
  }

  const total = QUESTIONS.length;
  const rate = ((hits / total) * 100).toFixed(1);

  console.log("\n===== 结果 =====");
  console.log(`总请求：${total}　命中：${hits}　未命中：${misses}`);
  console.log(`命中率：${rate}%`);
  console.log(`实际花费：${formatMoney(actualCost)}`);
  console.log(`如果不缓存（估算）：${formatMoney(costIfNoCache)}`);
  console.log(`省下：${formatMoney(costIfNoCache - actualCost)}（${(((costIfNoCache - actualCost) / costIfNoCache) * 100).toFixed(1)}%）`);
  console.log("\n缓存目录统计：", stats());
};

main().catch((error) => {
  console.error("跑挂了：", error.userMessage || error.message);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "e04": "node --env-file=.env experiments/e04-cache.js"
```

## 4.2 跑

```text
npm run e04
```

**8 个问题，4 个重复。**

**你应该看到：命中率 50%，成本降 40-50%。**

## 4.3 你要验证的三件事

### 第一：命中是真的命中，不是"看起来像"

**看终端有没有打出 `[cache] 命中 doc-qa`。**

**如果没有，说明 `policy.enabled` 是 false，或者键算得不一样。**

**排查方法（练习里会做）：**

```javascript
console.log("key =", key);
console.log("policy =", policy);
```

### 第二：命中时的 `cost` 是 0

**看账本：**

```text
npm run report --by=day
```

**命中那几次应该是 `cost: 0, cached: true`。**

### 第三：清空后再跑，结果一致

**跑两次，第二次应该是全命中（假设 TTL 没过）。**

**如果第二次还是全未命中，说明键每次都不同 —— 一定有字段不稳定。**

**最常见的：`messages` 数组里有时间戳，或者 `userId` 每次随机。**

## 4.4 记录到 `results/e04.md`

```markdown
# 第 46 节 缓存实测

模型：
feature：doc-qa
TTL：3600 秒

| 指标 | 值 |
|---|---|
| 总请求 | 8 |
| 命中 | |
| 命中率 | |
| 实际花费 | |
| 不缓存估算 | |
| 省下 | |

## 第二次跑（缓存已建立）

| 指标 | 值 |
|---|---|
| 命中率 | |
| 花费 | |

## 键的调试

```text
同一个问题两次的 key：
第一次：
第二次：
```

一样吗？为什么？
```

---

# 第 5 步：故意制造三种事故（25 分钟）

**这五步是这一节最重要的部分。你必须亲眼看到事故长什么样。**

## 5.1 事故一：串号

**操作：**

1. 把 `chat` 的 `feature` 改成 `"personal-analysis"`（策略是 `enabled: false`）→ 不会缓存。先改回 `doc-qa`。
2. 更直接：把 `policy.scope` 强制改成 `"global"`（临时改 `cache-policy.js`）。
3. 用两个不同 `userId` 问同一个问题。

```javascript
await chat(messages, { userId: "u_A", feature: "chat" });
await chat(messages, { userId: "u_B", feature: "chat" });
```

**第二个应该命中第一个的缓存。**

**这意味着 B 看到了 A 的答案。**

**这就是串号。** 在真实业务里，A 问"我的订单到哪了"，B 看到 A 的答案 —— 直接是数据泄漏。

**把 `scope` 改回 `"user"`，再跑，确认第二个未命中。**

**这个实验做过一次，你以后写缓存会先想 `scope`。**

## 5.2 事故二：换模型不生效

**操作：**

1. 先用 `model: "cheap-model"` 问一次。
2. 改成 `model: "mid-model"`，问同一个问题。

**如果你在 `buildKey` 里删掉 `model` 字段，第二次会命中第一次的缓存。**

**你会以为"mid-model 和 cheap-model 效果一样"，实际根本没调 mid-model。**

**这个坑会让你做出完全错误的选型结论（第 18 节会专门讲评测，那里缓存必须关掉）。**

**验证：把 `model` 从 `buildKey` 的 payload 里删掉，跑一次，看是否误命中。**

**跑完加回去。**

## 5.3 事故三：陈旧数据

**操作：**

1. 问"企业版最多几个账号"，得到"50"。
2. 在 `SYSTEM` 里把资料改成"企业版 100 个账号"。
3. 再问一次。

**如果命中缓存，你还是会得到"50"。**

**这就是陈旧。**

**为什么会发生：** 你改了代码里的资料，但 `messages` 的哈希变了，所以其实不会命中 —— **这个例子里你安全了。**

**但真实场景是：资料在数据库里，改了数据库，`messages` 不变（因为 messages 是从代码模板拼的）→ 命中旧缓存。**

**所以：**

```text
资料会变 → TTL 要短，或者键里带"资料版本号"
```

**第 37 节的 `docs.js` 如果改成从数据库读，必须给它一个 `version`，进缓存键。**

**这是缓存设计里最容易漏的一条。**

## 5.4 三个事故的共同点

```text
都是"键少了一个维度"
```

| 事故 | 少的维度 |
|---|---|
| 串号 | `userId` |
| 换模型不生效 | `model` |
| 陈旧 | `数据版本` |

**规则：**

> **缓存键就是"答案的函数签名"。函数签名漏了参数，就会返回错误的答案。**

**这是唯一需要记住的一句话。**

---

# 第 6 步：性能与容量（15 分钟）

## 6.1 文件缓存的三个瓶颈

**你现在用的是"一问一个文件"。**

```text
一天 10 万次调用，50% 未命中 → 5 万个文件
每个文件 500 字节 → 25 MB
```

**问题：**

```text
① 文件数太多，Windows 上 `readdir` 会变慢
② 每个文件都要 open/read/close 一次，比内存慢
③ 没有 LRU，冷数据一直占空间
```

## 6.2 三个优化，按性价比排序

### 优化一：内存缓存 + 文件持久化（性价比最高）

**热数据放内存 `Map`，命中直接返回，不读磁盘。**

```javascript
const memory = new Map();

export const getFast = (key) => {
  const hit = memory.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit;
  memory.delete(key);
  return null;
};

export const setFast = (key, entry) => {
  memory.set(key, entry);
  // 控制内存占用：超过 500 条就删最早的一批
  if (memory.size > 500) {
    const firstKey = memory.keys().next().value;
    memory.delete(firstKey);
  }
};
```

**`Map` 的迭代顺序是插入顺序，所以 `keys().next()` 就是最早插入的。**

**这就是一个最简 LRU（其实是最简 FIFO）。**

**代价：进程重启内存就没了，所以文件层还要保留。**

### 优化二：按天分目录

```text
data/cache/2026-11-16/xxxx.json
```

**好处：清理时删整个目录，比逐个 `unlink` 快 100 倍。**

### 优化三：定期清理脚本

**新建 `scripts/cache-clean.js`：**

```javascript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(DIR, "..", "data", "cache");

if (!fs.existsSync(CACHE_DIR)) {
  console.log("没有缓存目录");
  process.exit(0);
}

let removed = 0;
let kept = 0;

fs.readdirSync(CACHE_DIR)
  .filter((name) => name.endsWith(".json"))
  .forEach((name) => {
    const file = path.join(CACHE_DIR, name);

    try {
      const entry = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Date.now() > entry.expiresAt) {
        fs.unlinkSync(file);
        removed += 1;
      } else {
        kept += 1;
      }
    } catch {
      fs.unlinkSync(file);
      removed += 1;
    }
  });

console.log(`清理完成：删除 ${removed}，保留 ${kept}`);
```

**加脚本：**

```json
    "cache:clean": "node scripts/cache-clean.js",
    "cache:stats": "node -e \"import('./src/cache.js').then(m=>console.log(m.stats()))\""
```

## 6.3 什么时候该换 Redis

**这一周用文件缓存，够用。什么时候不够：**

```text
① 多实例部署（两台服务器，缓存不共享）→ 第 29 周 Docker 之后
② 每秒几百次以上（文件 IO 成瓶颈）
③ 需要原子操作（计数器、分布式锁）
```

**现在别上 Redis。** 第 29 周会讲，那时你才有部署多实例的需求。

**过早引入基础设施，是新手最常见的浪费。**

---

# 第 7 步：五个必须知道的坑（15 分钟）

## 坑 1：`undefined` 让字段从哈希里消失

```javascript
JSON.stringify({ userId: undefined })   // "{}"
JSON.stringify({})                      // "{}"
```

**两个不同的参数，算出同一个键 → 串号。**

**必须用 `null`：**

```javascript
userId: userId || null
```

## 坑 2：`messages` 里有时间戳

**如果你在 system 里拼了当前时间：**

```javascript
{ role: "system", content: `现在是 ${new Date().toLocaleString()}，你是助手` }
```

**每次调用内容都不同 → 永远不命中。**

**这是"缓存命中率莫名 0%"的最常见原因。**

**要么去掉时间，要么把它排除在哈希外（不推荐，会导致答案用了旧时间）。**

## 坑 3：`temperature` 不在键里

**`temperature: 0` 和 `temperature: 1.2` 的输出完全不同。**

**不在键里 → 高温的结果可能被当低温的返回。**

**用户会觉得"这个 AI 有时候很离谱"。**

## 坑 4：TTL 设太长

**`ttlSeconds: 30 * 24 * 3600`（30 天）看起来很爽。**

**但如果你的提示词改了一个字，或者资料更新了，用户 30 天都看不到新结果。**

**规则：**

```text
内容永不变（翻译、经典文本摘要）→ 可以长
内容会变（资料、库存、价格）    → 短
不确定                          → 短（1 小时）
```

**宁可少省一点，不要出陈旧事故。**

## 坑 5：以为缓存在开发环境会生效

**开发时你会改代码、重启进程。**

**内存缓存重启就没了，文件缓存还在。**

**所以：**

```text
开发时改提示词 → 键变了（messages 变了）→ 自动失效 ✅
开发时改代码逻辑 → 键可能不变 → 命中旧缓存 ❌
```

**这就是为什么要 `promptVersion` 和开发时的 `skipCache: true`。**

**加一个环境变量：**

```javascript
    skipCache: process.env.NO_CACHE === "1" || skipCache
```

**开发时 `.env` 里写 `NO_CACHE=1`，永远不会被缓存坑到。**

---

# 第 8 步：故意做四个实验（10 分钟）

## 实验 1：把 `model` 从键里删掉

**见 5.2。做完加回去。**

## 实验 2：把 `scope` 强制改成 `global`

**见 5.1。做完改回去。**

## 实验 3：在 system 里加时间戳

**加一句"现在是 2026-11-16 15:30"，跑两次同一个问题。**

**看命中率掉到 0。**

**这一条最常见，一定要亲手做。**

## 实验 4：把 TTL 改成 1 秒

**跑完 `e04`，等 2 秒，再跑一次。**

**看第二次是不是全未命中。**

**这让你理解 TTL 是"从这个时刻开始算"的。**

---

# 第 9 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 命中率、实际花费、省下的钱（真实数字）
2. 缓存键的完整字段清单
3. 三种事故，每种你看到的现象
4. 「卡在哪」

---

# 第 10 步：课后练习

## 练习一：给键加 `promptVersion`

**要求：** `chat` 的 `options` 支持 `promptVersion`，并进哈希。

**测试：** 用同一个问题，先传 `v1` 再传 `v2`，确认第二次未命中。

## 练习二：加内存层

**要求：** 实现 6.2 的 `getFast`/`setFast`，`get` 先查内存再查文件。

**测试：** 跑 `e04` 两次，第二次应该明显更快（记下耗时对比）。

## 练习三：算"缓存省了多少"

**要求：** 在 `report.js` 里加一列"缓存节省"。

```text
节省 = 命中数 × 平均未命中成本
```

**这一列是你向客户证明"我做了优化"的最有力数据。**

## 练习四：做一次"关缓存"的对照

**要求：** `NO_CACHE=1` 跑一遍 `e04`，记录：

```text
总花费（无缓存）：
总花费（有缓存）：
差值：
耗时差异：
```

**写进 `results/e04.md`。**

## 练习五：想清楚这四个问题

```text
1. 为什么缓存键要用 null 而不是 undefined？
2. 为什么只哈希最后一条消息会串答案？
3. 为什么"内容会变"的资料不能长 TTL？
4. 什么时候该放弃文件缓存换 Redis？
```

---

# 第 11 步：最终验收

## A. 代码

- [ ] `cache.js` 有 `buildKey` / `get` / `set` / `stats` / `clear`
- [ ] `cache-policy.js` 有 7 个 feature 的策略
- [ ] `getPolicy` 对未登记的返回 `enabled: false`
- [ ] `chat` 里有 `skipCache` 开关
- [ ] 命中时记账 `cost: 0, cached: true`

## B. 数据

- [ ] 我跑过 `e04`，命中率有数字
- [ ] 我算过"省下的钱"
- [ ] 我做过"关缓存"的对照
- [ ] 我做过三个事故实验

## C. 认知

- [ ] 我能说出缓存键必须包含的字段
- [ ] 我知道 `undefined` 会让字段消失
- [ ] 我知道 system 里加时间戳会让命中率归 0
- [ ] 我知道什么绝对不能缓存

## 本节课要能说出口的一句话

> **缓存键就是答案的函数签名。签名漏一个参数，就会把别人的答案返回给你。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 命中率 0% | 键里有不稳定字段 | 检查 `messages` 有无时间戳 |
| 命中率 100% | 键太粗 | 检查 `model`/`temperature` 是否在键里 |
| 换了模型没变 | `model` 不在键里 | 加进去 |
| 不同用户看到同一答案 | `scope` 是 global | 改 `user`，键加 `userId` |
| 缓存文件暴涨 | 没有清理 | `npm run cache:clean`，缩短 TTL |
| 改提示词没生效 | 键没变 | 加 `promptVersion` |
| `undefined` 报错 | 键构造里有 undefined | 全部用 `|| null` |
| 缓存目录不存在 | 从没写成功 | `ensureDir` 里有 `recursive: true` |
| 生产环境串号 | 匿名用户共享 anon | 要求登录，或关掉匿名缓存 |
