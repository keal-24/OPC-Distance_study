# 第 39 节课：让模型输出 JSON——坏了一定要发现

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你把输出格式管住了。但那是给人看的格式。
> 这节课要的是**给程序用的格式**：一个能被 `JSON.parse` 解析、字段类型对得上、能直接入库的对象。

**建议用时**：130 分钟
**你需要先完成**：第 38 节课（`validate.js` 能用，懂"可验证"原则）

---

# 第 0 步：为什么一定要 JSON（10 分钟）

## 0.1 上一节的输出，程序还是用不了

**`extractV2` 的输出长这样：**

```text
甲方：杭州云杉科技有限公司
乙方：李明（个体经营）
金额：48000 元
期限：2026 年 12 月 1 日至 2027 年 5 月 31 日
违约责任：未提及
```

**你要把它存进数据库，就得：**

```javascript
const lines = text.split("\n");
const amountLine = lines.find((l) => l.startsWith("金额："));
const amountText = amountLine.slice(3);        // "48000 元"
const amount = Number(amountText.replace("元", "").trim());  // 48000
```

**五个字段要写五段这种代码，而且：**

```text
模型写了"肆万捌仟元"     → Number() 得到 NaN
模型写了"金额: 48000元"  → slice(3) 切错位置
模型多写一行            → find 找不到
```

**这就是字符串解析的泥潭。**

## 0.2 JSON 是"自带结构"的字符串

```json
{
  "partyA": "杭州云杉科技有限公司",
  "partyB": "李明（个体经营）",
  "amount": 48000,
  "currency": "CNY",
  "startDate": "2026-12-01",
  "endDate": "2027-05-31",
  "penalty": null
}
```

**一行 `JSON.parse` 就变成对象，`data.amount` 直接是数字。**

**代价是：模型输出的这段文字，必须严格符合 JSON 语法。而它经常不符合。**

## 0.3 这节课真正的主题

**不是"怎么让它输出 JSON"，是"它输出坏了你怎么发现"。**

**因为：**

```text
它一定能输出"看起来像 JSON"的东西    → 这个不难
它不能保证每次都符合 JSON 语法        → 这个你改变不了
你能做的                          → 假定它会坏，写三层防线
```

## 0.4 今天的交付物

| 文件 | 位置（都在第 36 节的 `prompt-lab` 里） | 内容 |
|---|---|---|
| `src/ask-json.js` | `src/` | 三层防线 + 重试 |
| `src/schemas.js` | `src/` | 字段定义 |
| `experiments/e04-json.js` | `experiments/` | 真实调用 + 坏样本测试 |
| `results/extract-*.json` | `results/` | 落盘结果 |

---

# 第 1 步：先看清它会坏成哪五种（15 分钟）

## 1.1 五种真实坏法

**下面五段，都是模型真实会输出的。请先读，不要跑。**

**坏法一：包在代码围栏里**

````text
```json
{"partyA": "杭州云杉科技有限公司"}
```
````

**`JSON.parse` 直接报错：`Unexpected token \``。** 最常见，占比最高。

**坏法二：前面有解释**

```text
好的，以下是提取结果：
{"partyA": "杭州云杉科技有限公司"}
```

**报错：`Unexpected token 好`。**

**坏法三：尾逗号**

```json
{"partyA": "云杉", "partyB": "李明",}
```

**报错：`Unexpected token }`。**

**JSON 标准不允许尾逗号**，但 JavaScript 对象字面量允许，所以模型学混了。

**坏法四：中文引号**

```json
{“partyA”: “云杉科技”}
```

**报错：`Unexpected token “`。**

**中文语境下模型会混用全角引号，这个很隐蔽。**

**坏法五：字段名漂移**

```json
{"甲方": "云杉科技", "amount": 48000}
```

**这个不报错！** `JSON.parse` 成功，但 `data.partyA` 是 `undefined`。

**最危险的就是第五种：解析成功，数据错了。**

## 1.2 所以防线必须有三层

```text
第一层：清洗    去掉围栏、去掉前后解释
第二层：解析    修尾逗号/中文引号，try/catch
第三层：校验    字段在不在、类型对不对、枚举值合不合法
```

**三层缺一层：**

| 缺哪层 | 后果 |
|---|---|
| 缺清洗 | 80% 的正常输出被判失败 |
| 缺解析 | 程序直接崩，用户看到 500 |
| 缺校验 | 数据静默出错，几周后才发现 |

**第三条最难查。** 因为程序不报错。

---

# 第 2 步：先写提示词（20 分钟）

## 2.1 新建 `src/schemas.js`

```javascript
export const CONTRACT_SCHEMA = {
  fields: {
    partyA: { type: "string" },
    partyB: { type: "string" },
    amount: { type: "number" },
    currency: { type: "string", enum: ["CNY", "USD", "OTHER"] },
    startDate: { type: "string" },
    endDate: { type: "string" },
    penalty: { type: "string" },
  },
  required: ["partyA", "partyB", "amount", "currency", "startDate", "endDate", "penalty"],
};
```

**这份 schema 是三个用途合一：**

```text
① 生成提示词里的字段说明
② 校验模型输出
③ 文档（三个月后你知道这个接口返回什么）
```

**为什么 `penalty` 也是 required：**

因为"未提及"和"没有这个字段"是两件事。

```text
"penalty": null        → 合同里没写违约责任（有信息量）
没有 penalty 字段      → 模型漏了（是错误）
```

**让模型用 `null` 表达"没有"，而不是"省略字段"。**

## 2.2 加提示词 `extractJsonV1`

**在 `prompts.js` 里加：**

```javascript
  extractJsonV1: {
    id: "contract-json",
    version: "v1",
    system: `你是合同信息提取器。只输出一个 JSON 对象，不输出任何其他文字。

字段定义：
- partyA：甲方名称，字符串
- partyB：乙方名称，字符串
- amount：合同金额，数字，不带引号、不带单位、不带千分位
- currency：币种，只能是 "CNY"、"USD"、"OTHER" 之一
- startDate：开始日期，格式 YYYY-MM-DD
- endDate：结束日期，格式 YYYY-MM-DD
- penalty：违约责任，字符串；合同中未写明时填 null

规则：
1. 输出必须以 { 开头，以 } 结尾。
2. 不要使用 markdown 代码块，不要加 \`\`\`json。
3. 不要输出解释、前后缀、注释。
4. 字段名必须与上面完全一致，不要翻译成中文，不要增加字段。
5. 找不到的信息：字符串填 null，不要编造。
6. 只输出 JSON。`,
  },
```

**注意第 2 条里的转义：**

模板字符串里写 ` ``` ` 会有语法问题，所以用 `\`` 转义。**你也可以干脆不写反引号，改成"不要使用 markdown 代码块"。**

## 2.3 逐条讲清关键设计

### 设计一：明确"数字不带单位"

**为什么：** 模型很爱输出 `"amount": "48000 元"`。**字符串没法做加法、没法排序、没法比大小。**

**要求写"数字"还不够，必须写"不带引号、不带单位、不带千分位"。**

### 设计二：枚举值

**`currency` 只能是三个值之一。**

**为什么不在提示词里说"币种用标准代码"，而是列出来：**

```text
"用标准代码"     → 它可能给 "RMB"、"人民币"、"CNY（人民币）"
列出三个值        → 它只会从这三个里挑
```

**枚举是"把开放题变成选择题"。这是提升稳定性最有效的手段之一。**

### 设计三：日期格式写死

**`YYYY-MM-DD` 是唯一能被 `new Date()` 可靠解析的格式。**

**模型会输出 `2026年12月1日`、`2026/12/01`、`12/01/2026`。全都会让你的日期处理出错。**

### 设计四：`null` 而不是省略

**见 2.1 的解释。这是"可区分"原则。**

## 2.4 用 `response_format` 兜一层（可选）

**有些模型支持让它"强制输出 JSON"：**

**在 `llm.js` 的请求体里加一个字段：**

```javascript
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: temperature,
        max_tokens: maxTokens,
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
```

**`...(条件 ? {...} : {})` 是什么：**

条件展开。**条件为真时把对象展开进去，为假时展开空对象 —— 等于什么都没加。**

**然后调用时传：**

```javascript
await chat(messages, { temperature: 0.2, jsonMode: true });
```

**必须知道的三件事：**

```text
① 不是所有模型、所有中转都支持，不支持会返回 400
② 有些模型要求提示词里必须出现 "JSON" 这个词，否则也报错
③ 支持也不保证一定合法（它只是"更倾向"输出 JSON）
```

**所以 `response_format` 是加分项，不是防线。** 第 3 步的三层防线一个都不能省。

**报 400 就先注释掉 `jsonMode`，别在这上面纠缠。**

---

# 第 3 步：三层防线（35 分钟）

## 3.1 新建 `src/ask-json.js`

**先写第一层和第二层：**

```javascript
import { chat } from "./llm.js";

// 第一层：清洗
export const stripFence = (text) => {
  let s = String(text ?? "").trim();

  // 去掉 ```json ... ``` 或 ``` ... ```
  const fence = s.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();

  // 去掉 JSON 前后的解释文字：从第一个 { 或 [ 开始，到最后一个 } 或 ] 结束
  const firstBrace = s.search(/[{[]/);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }

  return s.trim();
};

// 第二层：修复常见语法错误
export const repairJson = (text) => {
  let s = text;

  // 中文引号 → 英文引号
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // 去掉尾逗号：,} 或 ,]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // 去掉 // 注释和 /* */ 注释
  s = s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  return s.trim();
};

// 解析：返回结果对象，不抛异常
export const tryParse = (text) => {
  const cleaned = stripFence(text);
  const repaired = repairJson(cleaned);

  try {
    return { ok: true, value: JSON.parse(repaired), cleaned, repaired, error: null };
  } catch (error) {
    return { ok: false, value: null, cleaned, repaired, error: error.message };
  }
};
```

## 3.2 逐段讲清

### `stripFence` 里的 `search(/[{[]/)`

**这是一个字符类：`{` 或 `[`。**

**为什么要兼容 `[`：** 有些任务是"提取列表"，根节点是数组。

### 为什么要"从第一个 `{` 到最后一个 `}`"

**因为模型可能这样输出：**

```text
根据合同内容，提取结果如下：
{"partyA": "云杉科技"}
以上是全部字段。
```

**截取后剩下的正好是中间那个对象。**

**风险：** 如果解释里也有 `{}`，会被切错。**所以第一层只是"大概率有效"，不是"一定有效"。**

### `repairJson` 的顺序为什么不能换

**必须先换中文引号，再处理尾逗号。**

**因为：**

```text
{“a”: 1,}     先换成 {"a": 1,}   再去尾逗号 → {"a": 1}
如果先做尾逗号：正则 /,\s*([}\]])/ 匹配的是 } 前，这里没问题
```

**两种顺序在这例子里都行，但引号修复永远是第一步**，因为后面所有正则都假定引号是英文的。

### 为什么 `tryParse` 不抛异常

**因为"解析失败"是预期内的情况，不是异常情况。**

**预期内的分支用返回值，意外情况才用 `throw`。** 这样调用方不会被 `try/catch` 套娃。

## 3.3 第三层：结构校验

**继续在 `ask-json.js` 里加：**

```javascript
const typeOf = (value) => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
};

export const checkShape = (value, schema) => {
  const problems = [];

  if (typeOf(value) !== "object") {
    return { ok: false, problems: [`根节点应为 object，实际 ${typeOf(value)}`] };
  }

  const allowed = Object.keys(schema.fields);

  Object.keys(value).forEach((key) => {
    if (!allowed.includes(key)) problems.push(`多了字段：${key}`);
  });

  schema.required.forEach((key) => {
    if (!(key in value)) {
      problems.push(`缺字段：${key}`);
      return;
    }

    const rule = schema.fields[key];
    const actual = typeOf(value[key]);

    // null 是合法值（表示"未提及"）
    if (value[key] === null) return;

    if (actual !== rule.type) {
      problems.push(`${key} 类型应为 ${rule.type}，实际 ${actual}`);
      return;
    }

    if (rule.enum && !rule.enum.includes(value[key])) {
      problems.push(`${key} 不在允许值内：${JSON.stringify(value[key])}`);
    }
  });

  return { ok: problems.length === 0, problems };
};
```

**注意这个细节：`value[key] === null` 直接放行。**

**为什么：**

```text
penalty: null     → 合法（合同里确实没写）
penalty: "null"   → 类型错（字符串 "null"，这是模型偷懒）
penalty: 缺字段   → 错（模型漏了）
```

**三种情况必须区分。不分的话，你会把"未提及"当成"数据缺失"来处理。**

## 3.4 组装 `askJson`

**继续加：**

```javascript
export const askJson = async (messages, schema, options = {}) => {
  const { retry = 1, temperature = 0.2, maxTokens = 800, jsonMode = false, logger = console } = options;

  let attempt = 0;
  let lastProblem = null;
  let history = messages;

  while (attempt <= retry) {
    const result = await chat(history, { temperature, maxTokens, jsonMode });
    const parsed = tryParse(result.content);

    if (parsed.ok) {
      const shape = checkShape(parsed.value, schema);

      if (shape.ok) {
        return {
          data: parsed.value,
          raw: result.content,
          attempts: attempt + 1,
          usage: result.usage,
        };
      }

      lastProblem = `结构不对：${shape.problems.join("；")}`;
    } else {
      lastProblem = `JSON 解析失败：${parsed.error}`;
    }

    logger.warn(`第 ${attempt + 1} 次失败：${lastProblem}`);
    attempt += 1;

    if (attempt > retry) break;

    // 重试时把错误告诉模型，并附上它刚才错的输出
    history = [
      ...messages,
      { role: "assistant", content: result.content },
      {
        role: "user",
        content: `上面的输出有问题：${lastProblem}。请只输出合法 JSON，以 { 开头、以 } 结尾，不要任何其他文字。`,
      },
    ];
  }

  const error = new Error(`JSON 输出连续失败：${lastProblem}`);
  error.code = "JSON_FAILED";
  error.attempts = attempt;
  throw error;
};
```

## 3.5 三个关键设计

### 设计一：`retry = 1`，不是 3

**每多一次重试：**

```text
多一份钱
多一份等待（用户端要多等 3-5 秒）
```

**而且第二次失败说明提示词本身有问题，第三次也不会成功。**

**该修的是提示词，不是加重试。**

### 设计二：重试时把错误原文告诉它

**只重发原问题，它大概率会犯同样的错。**

**附上"你刚才的输出 + 具体错在哪"，成功率会明显上升。**

**这是"利用模型的对话能力"，而不是"碰运气"。**

### 设计三：失败时抛 `error.code = "JSON_FAILED"`

**为什么不返回 `null`：**

```text
返回 null → 调用方会忘记判断 → 后面出错 `data.amount` of null
抛错误    → 调用方必须处理
```

**用 `code` 区分错误类型，上层可以决定"重试 / 降级 / 报错给用户"。**

---

# 第 4 步：不花钱测三层防线（20 分钟）

**这一步很重要：坏样本测试不需要调用模型。**

## 4.1 新建 `experiments/e04-parse-lab.js`

```javascript
import { tryParse, checkShape } from "../src/ask-json.js";
import { CONTRACT_SCHEMA } from "../src/schemas.js";

const GOOD = `{
  "partyA": "杭州云杉科技有限公司",
  "partyB": "李明（个体经营）",
  "amount": 48000,
  "currency": "CNY",
  "startDate": "2026-12-01",
  "endDate": "2027-05-31",
  "penalty": null
}`;

const CASES = [
  { name: "正常", text: GOOD, shouldPass: true },
  { name: "带 json 围栏", text: "```json\n" + GOOD + "\n```", shouldPass: true },
  { name: "带前言", text: "好的，以下是提取结果：\n" + GOOD, shouldPass: true },
  { name: "带后语", text: GOOD + "\n以上是全部字段。", shouldPass: true },
  { name: "尾逗号", text: GOOD.replace('"penalty": null', '"penalty": null,'), shouldPass: true },
  {
    name: "中文引号",
    text: GOOD.replace(/"partyA"/g, "“partyA”").replace(/"杭州云杉科技有限公司"/g, "“杭州云杉科技有限公司”"),
    shouldPass: true,
  },
  { name: "金额是字符串", text: GOOD.replace("48000", '"48000 元"'), shouldPass: false },
  { name: "币种不合法", text: GOOD.replace('"CNY"', '"人民币"'), shouldPass: false },
  { name: "缺字段", text: GOOD.replace('"penalty": null', "").replace(/,\s*$/, ""), shouldPass: false },
  { name: "字段名写成中文", text: GOOD.replace('"partyA"', '"甲方"'), shouldPass: false },
  { name: "全是废话", text: "抱歉，我无法提取。", shouldPass: false },
];

const main = () => {
  let pass = 0;

  CASES.forEach((item) => {
    const parsed = tryParse(item.text);
    const shape = parsed.ok ? checkShape(parsed.value, CONTRACT_SCHEMA) : { ok: false, problems: [parsed.error] };
    const actual = parsed.ok && shape.ok;
    const verdict = actual === item.shouldPass ? "✅ 符合预期" : "❌ 与预期不符";

    if (actual === item.shouldPass) pass += 1;

    console.log(`\n--- ${item.name} ---`);
    console.log(`解析：${parsed.ok ? "成功" : `失败（${parsed.error}）`}`);
    console.log(`校验：${shape.ok ? "通过" : shape.problems.join("；")}`);
    console.log(`实际结论：${actual ? "可用" : "不可用"}  ${verdict}`);
  });

  console.log(`\n===== ${pass}/${CASES.length} 个用例符合预期 =====`);
};

main();
```

## 4.2 加脚本并跑

```json
    "e04a": "node experiments/e04-parse-lab.js"
```

```text
npm run e04a
```

**这一步不花钱、不联网、秒出结果。**

**重点看这四行：**

| 用例 | 应该判为 | 说明 |
|---|---|---|
| 带围栏 | 可用 | 第一层生效 |
| 尾逗号 | 可用 | 第二层生效 |
| 金额是字符串 | **不可用** | 第三层生效 |
| 字段名写成中文 | **不可用** | 第三层生效 |

**如果第四行被判为可用，说明你的 `checkShape` 有漏洞 —— 去查 `allowed.includes(key)`。**

## 4.3 为什么要做这一步

**因为这是你唯一能"确定性地"验证防线的方式。**

**用真模型测，你每次遇到的坏法都不一样，没法判断是防线失效还是这次没遇到。**

**这叫做"用固定样本测代码，用随机样本测提示词"。两件事分开。**

---

# 第 5 步：真实调用 + 落盘（20 分钟）

## 5.1 新建 `experiments/e04-json.js`

```javascript
import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "../src/ask-json.js";
import { CONTRACT_SCHEMA } from "../src/schemas.js";
import { PROMPTS } from "../src/prompts.js";

const CONTRACT = `
采购合同
甲方：杭州云杉科技有限公司
乙方：李明（个体经营）
合同金额：人民币 48000 元
合同期限：2026 年 12 月 1 日至 2027 年 5 月 31 日
付款方式：分两期支付
`;

const saveResult = async (data, meta) => {
  const dir = path.resolve("results");
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `extract-${stamp}.json`);

  await fs.writeFile(file, JSON.stringify({ meta, data }, null, 2), "utf8");
  return file;
};

const main = async () => {
  const messages = [
    { role: "system", content: PROMPTS.extractJsonV1.system },
    { role: "user", content: CONTRACT },
  ];

  try {
    const result = await askJson(messages, CONTRACT_SCHEMA, {
      temperature: 0.2,
      maxTokens: 800,
      retry: 1,
    });

    const file = await saveResult(result.data, {
      promptVersion: PROMPTS.extractJsonV1.version,
      attempts: result.attempts,
      usage: result.usage,
      savedAt: new Date().toISOString(),
    });

    console.log("提取成功，用了", result.attempts, "次");
    console.log(JSON.stringify(result.data, null, 2));
    console.log("已保存：", file);
  } catch (error) {
    console.error("提取失败：", error.message);
    console.error("错误码：", error.code, "尝试次数：", error.attempts);
    process.exitCode = 1;
  }
};

main();
```

**注意 `path.resolve("results")`：路径相对于**当前工作目录**（也就是 `prompt-lab`），不是相对于脚本文件。**

**所以必须在 `prompt-lab` 目录下跑 `npm run e04`。**

## 5.2 加脚本并跑

```json
    "e04": "node --env-file=.env experiments/e04-json.js"
```

```text
npm run e04
```

**跑 3-5 次，看 `attempts` 字段：**

```text
attempts: 1   → 一次成功
attempts: 2   → 第一次失败，重试后成功（说明提示词还有优化空间）
报 JSON_FAILED → 两次都失败（必须改提示词了）
```

**`attempts` 这个数字就是你的提示词质量指标。** 它应该接近 1。

## 5.3 落盘为什么带时间戳

```text
extract-2026-11-16T08-30-00-000Z.json
```

**因为你会跑很多次，覆盖掉就没法对比了。**

**这份文件可以直接提交到 Git。** 它是你的实验记录，不含密钥、不含用户隐私（前提是别塞真实合同）。

---

# 第 6 步：五个必须知道的坑（15 分钟）

## 坑 1：金额被写成字符串

**模型输出：**

```json
{"amount": "48000"}
```

**`checkShape` 会抓到（类型应为 number，实际 string）。**

**但你的修法不该是"放宽检查"，而是：**

```javascript
// 在 repairJson 之后、checkShape 之前做类型归一
export const coerce = (value, schema) => {
  const out = { ...value };

  Object.entries(schema.fields).forEach(([key, rule]) => {
    if (rule.type === "number" && typeof out[key] === "string") {
      const num = Number(out[key].replace(/[^\d.-]/g, ""));
      if (Number.isFinite(num)) out[key] = num;
    }
  });

  return out;
};
```

**注意 `replace(/[^\d.-]/g, "")`：把"48000 元"变成"48000"，把"¥48,000"变成"48000"。**

**这是"归一化"而不是"放宽标准"。区别：归一化后照样校验，只是先给一次机会。**

**但要小心：`"肆万捌仟元"` 归一化后是空字符串，`Number("")` 是 0。这是错的。**

**所以 `Number.isFinite` 之后还要加一条：空字符串不算。**

```javascript
      const cleaned = out[key].replace(/[^\d.-]/g, "");
      if (cleaned !== "" && Number.isFinite(Number(cleaned))) out[key] = Number(cleaned);
```

## 坑 2：`"null"` 字符串

**模型输出 `"penalty": "null"` 或 `"penalty": "无"` 或 `"penalty": "未提及"`。**

**三种都不是 JSON 的 `null`。**

**你的业务代码里如果写 `if (data.penalty === null)`，三种都会漏判。**

**修法：在提示词里写"必须是 JSON 的 null，不要写字符串 null 或「无」"，并在 `coerce` 里统一：**

```javascript
    if (rule.type === "string" && ["null", "无", "未提及", "N/A", ""].includes(out[key])) {
      out[key] = null;
    }
```

**注意：这一步是"业务约定"，必须写进注释。否则三个月后你会忘了为什么"无"变成 null。**

## 坑 3：模型自己加字段

**它可能返回：**

```json
{"partyA": "...", "confidence": 0.95, "note": "金额未含税"}
```

**`checkShape` 会报"多了字段：confidence"。**

**两种态度：**

| 态度 | 什么时候用 |
|---|---|
| 严格：多了就判失败 | 数据要入库，字段必须可控 |
| 宽松：多了就忽略 | 只是展示，多一个无妨 |

**今天用严格。** 宽松的那天你会开始收到奇怪的字段，然后写一堆 `if`。

## 坑 4：模型加注释

```json
{
  "partyA": "云杉" // 甲方名称
}
```

**JSON 不允许注释。`repairJson` 里已经去掉了 `//`。**

**但注意：如果值里本身含 `//`（比如 URL），会被误删。**

**这就是 `repairJson` 的风险：它是"暴力修复"，可能改坏正常内容。**

**所以顺序应该是：**

```text
先直接 parse → 失败才 repair → 再 parse
```

**只对已经坏了的输出做修复，不要无脑修。**

**这一条很重要，请照着改 `tryParse`：**

```javascript
export const tryParse = (text) => {
  const cleaned = stripFence(text);

  // 先试原样
  try {
    return { ok: true, value: JSON.parse(cleaned), cleaned, repaired: cleaned, error: null };
  } catch (firstError) {
    const repaired = repairJson(cleaned);

    try {
      return { ok: true, value: JSON.parse(repaired), cleaned, repaired, error: null };
    } catch (secondError) {
      return { ok: false, value: null, cleaned, repaired, error: secondError.message };
    }
  }
};
```

**改完再跑一次 `npm run e04a`，11 个用例应该还是全对。**

## 坑 5：以为 `response_format` 一开就万事大吉

**它只是"倾向输出 JSON"，不是"语法保证"。**

**而且它对"字段名漂移"完全无效** —— 那是语义问题，不是语法问题。

**所以第三层校验永远不能省。**

---

# 第 7 步：故意做三个实验（10 分钟）

## 实验 1：把 `retry` 改成 0

**跑 5 次，记录失败次数。**

**然后改回 1，再跑 5 次。**

**你会看到失败率下降。** 这就是重试的价值 —— 但它也是成本。

## 实验 2：把提示词里的"只输出 JSON"删掉

**跑 5 次，看 `attempts` 变成多少。**

**大概率会经常是 2。**

**结论：一句"只输出 JSON"，抵一次重试（的钱）。**

## 实验 3：把 `checkShape` 的"多字段"检查删掉

**跑 5 次，看模型会不会加字段。**

**如果它真的加了 `confidence` 或 `note`，把原文贴进 `NOTES.md`。**

**这说明模型很爱"帮忙"。你的严格是有理由的。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 11 个坏样本用例里，哪几个是"解析成功但校验失败"
2. 真实调用的 `attempts` 分布（几次 1、几次 2）
3. 一条真实的失败原文（如果有）
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：给"评论提取"写 schema

**要提取：情感（正面/中性/负面）、主题（一句话）、关键词（3-5 个字符串数组）、是否提到竞品（布尔）。**

**注意：布尔和数组要比字符串多写一条类型判断。跑通它。**

## 练习二：加一个 `coerce` 的单元测试

**用 `e04-parse-lab.js` 的写法，测这四种输入：**

```text
"48000 元"    → 48000
"¥48,000"     → 48000
"肆万捌仟元"   → 保持原样（不能被改成 0）
""            → 保持原样
```

**第四个最容易写错。**

## 练习三：把失败结果也存下来

**要求：** `askJson` 失败时，把原始输出和错误写进 `results/failed-*.txt`。

**为什么：** 失败样本是你改提示词的唯一依据。**不存下来，你只能靠回忆。**

## 练习四：想清楚这三个问题

```text
1. 为什么"解析成功"不等于"数据可用"？
2. 为什么先试原样解析，失败才修复？（提示：URL 里的 //）
3. 如果重试两次都失败，你该改提示词还是改 schema？为什么？
```

---

# 第 10 步：最终验收

## A. 代码

- [ ] `ask-json.js` 有 `stripFence` / `repairJson` / `tryParse` / `checkShape` / `askJson`
- [ ] `tryParse` 是"先原样，后修复"
- [ ] `checkShape` 能报出"多字段 / 缺字段 / 类型错 / 枚举错"
- [ ] `askJson` 失败时抛带 `code` 的错误
- [ ] `schemas.js` 有 `CONTRACT_SCHEMA`

## B. 测试

- [ ] `npm run e04a` 11 个用例全部符合预期
- [ ] `npm run e04` 能真实跑通并存盘
- [ ] 我记录过 `attempts` 的分布

## C. 认知

- [ ] 我能说出五种坏法
- [ ] 我知道"解析成功但数据错"最危险
- [ ] 我知道 `null` / `"null"` / 缺字段 是三件事
- [ ] 我知道 `response_format` 不是防线
- [ ] 我知道重试上限为什么是 1

## 本节课要能说出口的一句话

> **JSON 的价值不在于它整齐，在于它坏了能报警。三层防线里，最不能省的是校验。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `Unexpected token` 开头是反引号 | 围栏没去掉 | 检查 `stripFence` 的正则 |
| 解析成功但字段是 undefined | 字段名漂移 | 第三层校验 `required` |
| `amount` 是字符串 | 没写"数字不带引号" | 提示词加约束 + `coerce` |
| 空字符串变成 0 | `Number("")` 是 0 | 加 `cleaned !== ""` 判断 |
| `"null"` 和 `null` 混用 | 提示词没锁死 | 提示词明确 + `coerce` 统一 |
| 一开 `jsonMode` 就 400 | 模型/中转不支持 | 关掉，只用提示词 + 防线 |
| 重试后仍然失败 | 提示词有结构性问题 | 改提示词，别加重试次数 |
| `results` 目录不存在 | 没建 | 代码里 `mkdir recursive` 已处理 |
| 保存路径乱 | 相对路径基准是工作目录 | 在 `prompt-lab` 里跑 |
