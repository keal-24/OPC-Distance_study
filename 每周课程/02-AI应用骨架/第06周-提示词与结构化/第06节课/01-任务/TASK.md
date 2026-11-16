# 第 41 节课：改写与审核——让模型检查它自己

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 你可能已经发现：让它改写一段文案，它改得挺顺，但**事实会变、脏话没删、长度超标**。
> 这节课建一条流水线：**生成 → 审核 → 带着问题重写 → 再审。**

**建议用时**：140 分钟
**你需要先完成**：第 40 节课（会用 `askJson` 做分类，会算准确率）

---

# 第 0 步：为什么一次生成不够（10 分钟）

## 0.1 一个真实翻车

**你的任务是"把商品参数改写成详情页文案"，原文：**

```text
不锈钢保温杯，容量 500ml，保温 12 小时，杯身 304 不锈钢，净重 320g。
```

**模型改写后：**

```text
这款不锈钢保温杯采用食品级 316 不锈钢，容量 500ml，可保温 24 小时，
轻至 200g，随身携带毫无负担。
```

**三处改动，全是编的：**

| 原文 | 改写后 | 后果 |
|---|---|---|
| 304 不锈钢 | 316 不锈钢 | **虚假宣传，违反广告法** |
| 保温 12 小时 | 24 小时 | 虚假宣传 |
| 净重 320g | 200g | 虚假宣传 |

**客户拿这个详情页去上架，被投诉下架。**

## 0.2 为什么不能"在一个提示词里要求它别乱改"

**你可能会加一句：**

```text
改写时不要改变任何事实数据。
```

**它会遵守个七八成，然后剩下两三成照样改。**

**原因不是它不听话，是"改写"和"守事实"这两个目标在生成时是打架的：**

```text
写文案的模型倾向：更漂亮、更有卖点
守事实的要求是：一模一样
```

**一次生成里，模型会把两者揉成一个折中结果。你没法知道它哪句揉偏了。**

## 0.3 解法：把"写"和"查"拆开

```text
第一步：改写着，只管写得好读
第二步：审核者，只管挑毛病（不许改）
第三步：改写着拿着毛病清单重写
第四步：再审一次
```

**为什么这样能行：**

```text
换了角色 → 目标单一 → 每一步都能被检查
```

**这是这一周最重要的工程思想：一个调用只干一件事。**

## 0.4 今天的交付物

| 文件 | 位置（都在第 36 节的 `prompt-lab` 里） | 内容 |
|---|---|---|
| `src/prompts.js` | `src/` | 加 `rewriteV1` 和 `reviewV1` |
| `src/schemas.js` | `src/` | 加 `REVIEW_SCHEMA`（审核结果） |
| `src/facts.js` | `src/` | 数字/日期抽取比对 |
| `src/pipeline.js` | `src/` | 两段式流水线 |
| `experiments/e06-pipeline.js` | `experiments/` | 跑一遍，打印每轮 |
| `results/e06.md` | `results/` | 轮次、分数、问题清单 |

---

# 第 1 步：先写审核器的标准（15 分钟）

## 1.1 审核什么，必须先列清单

**不要写"检查文案质量"。** 那等于没写。

**你要审五条，每条都能被判断：**

| # | 标准 | 怎么判断 |
|---|---|---|
| 1 | 事实不变 | 数字、型号、材质、单位与原文完全一致 |
| 2 | 无夸大 | 不出现"最""第一""绝对""永久""100%" |
| 3 | 长度合格 | 不超过 120 字 |
| 4 | 口语化 | 不出现"本品""该产品""致力于"这类书面语 |
| 5 | 无违禁承诺 | 不出现"包治""无效退款""全网最低" |

**这五条来自哪里：**

```text
1、5  → 法律风险（客户最怕）
2     → 平台规则（会被下架）
3     → 版面限制（前端放不下）
4     → 业务要求（详情页要像人说话）
```

**每一条都有"为什么"，你才知道能不能放宽。**

## 1.2 审核结果必须结构化

**为什么不让它输出一段评语：**

```text
"整体不错，但有些地方可以更精炼，建议把'采用'换成'用的'……"
```

**你没法用代码判断"通没通过"，也没法把"问题"传给改写着。**

**要的是：**

```json
{
  "passed": false,
  "score": 55,
  "issues": [
    { "type": "事实", "quote": "316 不锈钢", "fix": "改回 304 不锈钢" },
    { "type": "夸大", "quote": "轻至 200g", "fix": "改为 320g，删除'轻至'" }
  ],
  "summary": "两处事实错误，一处重量夸大"
}
```

**三个字段的用途：**

| 字段 | 给谁用 |
|---|---|
| `passed` | 程序判断要不要进入下一轮 |
| `score` | 你判断"有没有变好" |
| `issues[]` | 传给改写着，让它照着改 |
| `quote` | **你能核对它是不是瞎挑刺** |

**`quote` 必须要求"原文片段"。** 没有原文的批评，一律当噪音。

---

# 第 2 步：写两个提示词（25 分钟）

## 2.1 改写着 `rewriteV1`

```javascript
  rewriteV1: {
    id: "product-rewrite",
    version: "v1",
    system: `你是电商详情页文案。

把用户给的商品参数改写成 2-3 句口语化文案。

要求：
- 不超过 120 字。
- 用"你"称呼读者，语气轻松，像朋友推荐。
- 不使用"本品""该产品""致力于""打造"这类书面语。
- 只做表达方式的改写，所有数字、型号、材质、单位必须与原文完全一致。
- 不添加原文没有的参数、认证、功效。
- 不使用"最""第一""绝对""永久""100%"这类极限词。
- 不输出任何解释，只输出文案本身。`,
  },
```

**注意最后一句"只输出文案本身"。**

**为什么：** 不然它会在前面加"好的，我来帮你改写：". 你后面要做审核，多这句就多噪音。

## 2.2 审核者 `reviewV1`

```javascript
  reviewV1: {
    id: "copy-review",
    version: "v1",
    system: `你是一名严格的电商平台审核编辑。你的任务是挑出问题，不是表扬作者。

输入包含【原文】和【改写稿】。逐条比对。

审核标准（共 5 条）：
1. 事实一致：改写稿里的数字、型号、材质、单位必须与原文完全一致。任何差异都算问题。
2. 无夸大：不得出现"最""第一""绝对""永久""100%""全网"等极限词。
3. 长度：改写稿不超过 120 字（含标点）。
4. 口语化：不得出现"本品""该产品""致力于""打造""旨在"等书面语。
5. 无违禁承诺：不得出现"包治""无效退款""全网最低""永久保修"等承诺。

输出一个 JSON 对象：
{
  "passed": 布尔值，5 条全部通过才为 true,
  "score": 0-100 的整数，按问题严重程度扣分,
  "issues": [
    {
      "type": "事实" | "夸大" | "长度" | "口语" | "违禁",
      "quote": "改写稿中出现问题的原文片段（必须逐字复制）",
      "fix": "具体怎么改，不超过 20 字"
    }
  ],
  "summary": "一句话总结，不超过 30 字"
}

规则：
- 你是审核者，不要重写整篇文案，只在 fix 里给最小改动。
- 每个 issue 的 quote 必须能在改写稿里逐字找到，找不到就不要提。
- passed 为 false 时，issues 至少一条。
- 不要因为"整体还行"就放过事实错误。
- 只输出 JSON，不要任何其他文字。`,
  },
```

## 2.3 三个关键设计

### 设计一：明确"你的任务是挑出问题，不是表扬作者"

**模型默认是"乐于助人的助手"，会倾向给正面评价。**

**不写这句，你会得到：**

```json
{ "passed": true, "score": 92, "issues": [] }
```

**而实际上文案里有两处事实错误。**

**这句话是在对抗它的"讨好倾向"。**

### 设计二：`quote` 必须逐字复制

**不要求逐字，它会给你"316不锈钢"（去掉了空格）或者概括成"材质有误"。**

**你就没法用代码 `includes` 核对，也没法定位。**

**要求逐字，是让它"指认现场"，而不是"报告结论"。**

### 设计三：只给 `fix`，不许重写

**一旦允许它重写整篇，它就从"审核者"变回"改写者"，两边目标又开始打架。**

**限制成"最小改动"（不超过 20 字），强迫它只指出问题。**

## 2.4 审核结果的 schema

**在 `src/schemas.js` 里加：**

```javascript
export const REVIEW_SCHEMA = {
  fields: {
    passed: { type: "boolean" },
    score: { type: "number" },
    issues: { type: "array" },
    summary: { type: "string" },
  },
  required: ["passed", "score", "issues", "summary"],
};
```

**注意 `issues` 只校验"是数组"，不校验"里面的对象有没有 type/quote/fix"。**

**这是你上一节练习里留下的缺口。今天必须补 —— 因为流水线要用 `issue.quote`。**

---

# 第 3 步：补上嵌套结构校验（20 分钟）

## 3.1 为什么必须补

**如果模型返回：**

```json
{ "passed": false, "score": 40, "issues": ["材质写错了"], "summary": "有问题" }
```

**`issues` 是字符串数组，`checkShape` 会放行。**

**然后你的流水线执行 `issue.quote` → `undefined` → 传给改写着的内容是 `"问题：undefined，改法：undefined"`。**

**改写着收到的是一堆垃圾，但它还是会努力改 —— 你会得到一份更烂的稿子，而且不知道为什么。**

## 3.2 扩展 `checkShape`

**在 `src/ask-json.js` 里，把 `checkShape` 的类型判断部分改成支持 `itemFields`：**

```javascript
const checkObjectFields = (obj, fields, prefix, problems) => {
  Object.entries(fields).forEach(([key, rule]) => {
    if (!(key in obj)) {
      problems.push(`${prefix}缺字段：${key}`);
      return;
    }

    if (obj[key] === null) return;

    const actual = typeOf(obj[key]);

    if (actual !== rule.type) {
      problems.push(`${prefix}${key} 类型应为 ${rule.type}，实际 ${actual}`);
      return;
    }

    if (rule.enum && !rule.enum.includes(obj[key])) {
      problems.push(`${prefix}${key} 不在允许值内`);
    }
  });
};
```

**然后在校验循环里加一段：**

```javascript
    // 数组的元素结构校验
    if (rule.itemFields && Array.isArray(value[key])) {
      value[key].forEach((item, index) => {
        if (typeOf(item) !== "object") {
          problems.push(`${key}[${index}] 应为 object，实际 ${typeOf(item)}`);
          return;
        }
        checkObjectFields(item, rule.itemFields, `${key}[${index}].`, problems);
      });
    }
```

**再把 schema 改严格：**

```javascript
    issues: {
      type: "array",
      itemFields: {
        type: { type: "string", enum: ["事实", "夸大", "长度", "口语", "违禁"] },
        quote: { type: "string" },
        fix: { type: "string" },
      },
    },
```

## 3.3 改完必须回归测试

**跑：**

```text
npm run e04a
```

**11 个用例必须还是全对。**

**这就是"改公共代码"的代价：你必须每次回归。**

**不改也行，但代价是你会花三天去找一个 `undefined` 从哪来的。**

---

# 第 4 步：写事实比对（15 分钟）

## 4.1 为什么代码还要单独查一遍事实

**审核器也是模型，它也会漏。**

**而事实错误是法律风险，不能只靠一次模型判断。**

**代码能做的事，不要交给模型。**

## 4.2 新建 `src/facts.js`

```javascript
// 抽出文本里的数字（含小数）和单位附近的数字
export const extractNumbers = (text) =>
  (String(text).match(/\d+(\.\d+)?/g) || []).map(Number);

// 比较两组数字：改写稿里的数字必须都在原文里出现
export const checkNumbersPreserved = (original, rewritten) => {
  const originSet = new Set(extractNumbers(original));
  const newNumbers = extractNumbers(rewritten);
  const missing = newNumbers.filter((num) => !originSet.has(num));

  return {
    ok: missing.length === 0,
    missing,
    originSet: [...originSet],
  };
};

// 抽极限词
export const FORBIDDEN = ["最", "第一", "绝对", "永久", "100%", "全网", "包治", "无效退款"];

export const findForbidden = (text) => FORBIDDEN.filter((word) => String(text).includes(word));
```

## 4.3 三个必须知道的局限

### 局限一：`"最"` 会误伤

```text
"最后一步"      → 命中"最"
"最近"          → 命中"最"
```

**所以 `findForbidden` 只适合做"提示"，不适合做"判定"。**

**要更准就得用词边界，中文没空格，这事很难。** 实际项目里：**代码报警 → 人工确认**。

### 局限二：数字匹配会误伤单位换算

```text
原文：500ml
改写：0.5L
```

**数字不同，但事实一致。** 代码会判为错误。

**这是"代码查事实"的边界。它能抓"编造"，抓不了"换算"。**

### 局限三：抓不到非数字事实

```text
304 不锈钢 → 316 不锈钢
```

**两个都是数字，`extractNumbers` 抓出来是 `[304]` 和 `[316]`，能抓到。**

**但：**

```text
"食品级不锈钢" → "医用级不锈钢"
```

**没有数字，抓不到。** 只能靠审核器。

**结论：代码 + 模型，两层，缺一不可。** 和上一节的三层防线是同一个思路。

## 4.4 再加一条"长度"检查

```javascript
export const checkLength = (text, max) => {
  const length = [...text].length;
  return { ok: length <= max, length };
};
```

**为什么不用第 38 节的 `validate.js`：**

**可以复用。** 但这里是"单一检查"，直接调 `checkMaxLength` 也行。

**别为了复用而绕路。** 两行代码的重复不算问题，绕三层抽象才是。

---

# 第 5 步：写流水线（30 分钟）

## 5.1 新建 `src/pipeline.js`

```javascript
import { chat } from "./llm.js";
import { askJson } from "./ask-json.js";
import { PROMPTS } from "./prompts.js";
import { REVIEW_SCHEMA } from "./schemas.js";
import { checkNumbersPreserved, findForbidden, checkLength } from "./facts.js";

const MAX_ROUNDS = 2;
const MAX_LENGTH = 120;

const draft = async (original) => {
  const result = await chat(
    [
      { role: "system", content: PROMPTS.rewriteV1.system },
      { role: "user", content: original },
    ],
    { temperature: 0.7, maxTokens: 400 }
  );

  return result.content.trim();
};

const review = async (original, rewritten) => {
  const messages = [
    { role: "system", content: PROMPTS.reviewV1.system },
    {
      role: "user",
      content: `【原文】\n${original}\n\n【改写稿】\n${rewritten}`,
    },
  ];

  const result = await askJson(messages, REVIEW_SCHEMA, {
    temperature: 0,
    maxTokens: 800,
    retry: 1,
  });

  const data = result.data;

  // 代码兜底：模型说没问题，但代码查出问题，照样判不通过
  const numbers = checkNumbersPreserved(original, rewritten);
  const length = checkLength(rewritten, MAX_LENGTH);
  const forbidden = findForbidden(rewritten);

  const codeIssues = [];

  if (!numbers.ok) {
    codeIssues.push({
      type: "事实",
      quote: String(numbers.missing.join("、")),
      fix: "这些数字原文没有，改回原文数据",
    });
  }

  if (!length.ok) {
    codeIssues.push({ type: "长度", quote: `${length.length} 字`, fix: `压到 ${MAX_LENGTH} 字内` });
  }

  if (forbidden.length > 0) {
    codeIssues.push({ type: "夸大", quote: forbidden.join("、"), fix: "删掉极限词" });
  }

  const issues = [...(data.issues || []), ...codeIssues];

  return {
    passed: data.passed === true && codeIssues.length === 0,
    score: Math.min(data.score ?? 0, codeIssues.length > 0 ? 60 : 100),
    issues,
    summary: data.summary || "",
    codeIssues,
  };
};

const revise = async (original, rewritten, issues) => {
  const issueText = issues
    .filter((issue) => issue && issue.quote)
    .map((issue, index) => `${index + 1}. 【${issue.type}】"${issue.quote}" → ${issue.fix}`)
    .join("\n");

  const result = await chat(
    [
      { role: "system", content: PROMPTS.rewriteV1.system },
      {
        role: "user",
        content: `【原文】\n${original}\n\n【上一版】\n${rewritten}\n\n【必须修复的问题】\n${issueText}\n\n请输出修改后的完整文案，只输出文案本身。`,
      },
    ],
    { temperature: 0.3, maxTokens: 400 }
  );

  return result.content.trim();
};

export const runPipeline = async (original) => {
  const log = [];
  let current = await draft(original);
  let report = await review(original, current);
  let calls = 2;

  log.push({ round: 0, stage: "初稿", text: current, score: report.score, passed: report.passed, issues: report.issues });

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    if (report.passed) break;

    const next = await revise(original, current, report.issues);
    const nextReport = await review(original, next);
    calls += 2;

    log.push({
      round,
      stage: `第 ${round} 轮重写`,
      text: next,
      score: nextReport.score,
      passed: nextReport.passed,
      issues: nextReport.issues,
    });

    // 分数没提升就停：防止越改越差
    if (nextReport.score <= report.score && !nextReport.passed) {
      log.push({ round, stage: "停止", text: "", score: nextReport.score, passed: false, issues: [], reason: "分数未提升" });
      break;
    }

    current = next;
    report = nextReport;
  }

  return { final: current, passed: report.passed, score: report.score, calls, log };
};
```

## 5.2 三个关键设计

### 设计一：`temperature: 0` 给审核器

**审核是判断，不是创作。**

**0.7 的审核器，同一份稿子跑两次给你两个分数 —— 你的流水线就没法判断"有没有变好"。**

**写作 0.7，审核 0。**

### 设计二：代码兜底"否决权"

```javascript
passed: data.passed === true && codeIssues.length === 0
```

**模型说通过，代码说不通过 → 判不通过。**

**为什么这么定：**

```text
模型漏判 → 客户投诉、下架、罚款
代码误判 → 多跑一轮，多花几分钱
```

**两边代价不对等，所以宁可误判。**

### 设计三："分数没提升就停"

**不加这一条，你会遇到：**

```text
第 1 轮 60 分 → 第 2 轮 58 分 → 第 3 轮 55 分
```

**越改越差，但它一直在"努力改"。**

**停的条件必须写死：分数不升就停，最多 2 轮。**

**这也是成本控制：每轮 2 次调用，2 轮就是 6 次调用。**

## 5.3 成本账

**一条文案的调用次数：**

| 情况 | 调用次数 |
|---|---|
| 初稿就过 | 2（生成 + 审核） |
| 改一轮就过 | 4 |
| 改两轮 | 6 |

**对比"一次生成"：1 次调用。**

**成本是 2-6 倍。**

**什么时候值得：**

```text
值得：有法律风险、有平台规则、客户会拿去过审
不值得：内部通知、草稿、给自己看的东西
```

**这个判断要写进你的报价里。** 客户要"AI 自动生成详情页"，你得说清"带审核的是 6 倍成本"。

---

# 第 6 步：跑一遍（20 分钟）

## 6.1 新建 `experiments/e06-pipeline.js`

```javascript
import { runPipeline } from "../src/pipeline.js";

const ORIGINAL = `不锈钢保温杯，容量 500ml，保温 12 小时，杯身 304 不锈钢，净重 320g。`;

const main = async () => {
  const result = await runPipeline(ORIGINAL);

  result.log.forEach((item) => {
    console.log(`\n===== 第 ${item.round} 轮：${item.stage} =====`);
    if (item.text) console.log(item.text);
    console.log(`分数：${item.score}　通过：${item.passed ? "是" : "否"}`);
    if (item.reason) console.log(`停止原因：${item.reason}`);

    if (item.issues && item.issues.length > 0) {
      console.log("问题清单：");
      item.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. 【${issue.type}】"${issue.quote}" → ${issue.fix}`);
      });
    }
  });

  console.log("\n===== 结论 =====");
  console.log(`最终通过：${result.passed ? "是" : "否"}　最终分数：${result.score}`);
  console.log(`总调用次数：${result.calls}`);
  console.log(`最终文案：${result.final}`);
};

main().catch((error) => {
  console.error("跑挂了：", error.userMessage || error.message);
  if (error.detail) console.error("细节：", error.detail);
  process.exitCode = 1;
});
```

## 6.2 加脚本并跑

```json
    "e06": "node --env-file=.env experiments/e06-pipeline.js"
```

```text
npm run e06
```

**跑 3-5 次。** 每次结果会不一样，正常。

## 6.3 你要确认的四件事

### 第一：审核器真的会挑刺吗

**如果三次都是"初稿就通过、issues 为空"，说明审核器太松。**

**检查：**

```text
① 它的 prompt 里有没有"你的任务是挑出问题，不是表扬作者"
② 你给的原文是不是本来就太简单（参数太少，没得改）
```

**把你的原文改复杂一点，加几个数字和型号，它就有得挑了。**

### 第二：`quote` 能不能在稿子里找到

**这一步必须人工抽查。**

**在 `e06-pipeline.js` 里加一行校验：**

```javascript
    if (item.issues) {
      item.issues.forEach((issue) => {
        const found = item.text.includes(issue.quote);
        if (!found) console.log(`  ⚠️ quote 在稿子里找不到："${issue.quote}"`);
      });
    }
```

**找不到 = 它在瞎挑刺。** 这种 issue 传给改写着，会把好句子改坏。

### 第三：分数是不是在涨

**如果不是，说明"带着问题清单重写"没起作用。**

**常见原因：**

```text
fix 写得太笼统（"改得更准确"）
issues 太多（一次给 8 条，它改不过来）
```

**修法：一次只让它修最严重的 3 条。**

### 第四：最终文案你满意吗

**这一步只能你自己看。**

**机器能算准确率，算不出"这句话像不像人说的"。**

---

# 第 7 步：五个必须知道的坑（15 分钟）

## 坑 1：审核器永远说通过

**原因：它被训练成"乐于助人"，不愿意否定。**

**三种修法（按效果排序）：**

```text
① 明确写"你的任务是挑出问题，不是表扬作者"（最有效）
② 给"必须检查的 5 条"清单（不给清单它就泛泛看）
③ 要求"issues 至少一条"（比较粗暴，可能逼它编问题）
```

**第三种有风险：它会开始挑无关紧要的毛病，比如"这句话可以更生动"。**

**用前两种，不要用第三种。**

## 坑 2：审核器永远不通过

**它挑出 10 条问题，改写两轮还是不过。**

**原因：标准太严，或者标准本身互相矛盾。**

**检查：**

```text
"不超过 120 字" + "要把 5 个参数都写进去"  → 可能物理上做不到
```

**这种时候该改的是标准，不是提示词。**

## 坑 3：越改越差

**第一版最好，后面越改越糟。**

**原因：改写着看到"问题清单"，会过度修正。**

```text
问题："316 不锈钢" 错了
它的修正：把整段关于材质的话都删了
```

**修法：**

```text
① `fix` 要求"最小改动"
② 分数不升就停（你已经做了）
③ 保留历史版本，让用户能选（第 42 节会做）
```

## 坑 4：审核器和写作者同源偏见

**你用一个模型写，用同一个模型审。**

**它会倾向于认可"自己风格"的东西。**

**现实做法：**

```text
小项目：同模型审，接受它有盲区，靠代码兜底
要求高：换一个模型审（不同厂商，偏见不同）
```

**这一周的 lab 里用同一个模型，但你要知道这个局限。**

## 坑 5：把"审核"当成"质量保证"

**审核通过 ≠ 没有法律风险。**

**它只是"按你给的 5 条标准检查了一遍"。**

**你的 5 条没覆盖的风险，它一条也发现不了。**

**这就是为什么"AI 生成内容"的责任永远在人身上。** 这句话不是免责声明，是事实。

---

# 第 8 步：故意做四个实验（10 分钟）

## 实验 1：删掉"你的任务是挑出问题"这句

**跑三次，看 `passed` 是不是全为 true。**

**大概率是。** 把结果贴进 `NOTES.md`。

## 实验 2：把 `MAX_ROUNDS` 改成 0

**看初稿能不能过。**

**如果初稿就过，说明你的初稿提示词已经够好，审核是保险，不是必需。**

## 实验 3：把原文改成含大量数字的复杂参数

```text
不锈钢保温杯，容量 500ml，保温 12 小时，杯身 304 不锈钢，
净重 320g，杯口直径 5.5cm，杯身高 22cm，容量误差 ±2%，耐温 -20℃ 至 120℃。
```

**跑一次，看它能不能守住这 8 个数字。**

**大概率守不住 2-3 个。** 这就是代码兜底的价值。

## 实验 4：把 `codeIssues` 的否决权去掉

**改成 `passed: data.passed`。**

**跑实验 3 那个复杂参数。**

**你会看到"审核通过"，但稿子里有编造的数字。**

**这个实验做完，你就再也不会问"为什么要写代码兜底"了。**

---

# 第 9 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 五条审核标准，以及每条是"法律/平台/版面/业务"哪一类
2. 三轮的分数变化
3. 一条 `quote` 在稿子里找不到的例子（如果有）
4. 「卡在哪」

---

# 第 10 步：课后练习

## 练习一：加第 6 条标准

**加一条你能用代码判断的：**

```text
不得出现第一人称"我们""本公司"
```

**要求：写进提示词 + 写进 `facts.js` + 通过 `codeIssues` 否决。**

## 练习二：把 `issues` 截断到 3 条

**按 `type` 的严重程度排序（事实 > 违禁 > 夸大 > 长度 > 口语），只传前 3 条给改写着。**

**再跑，看最终分数有没有提升。**

**体会：给模型的信息不是越多越好。"一次改 8 条"它大概率一条都改不好。**

## 练习三：把流水线接到 chat-app 上

**要求：** 在 chat-app 里加一个接口 `POST /api/rewrite`，body 是 `{ text }`，返回 `{ final, passed, score }`。

**这一步把"实验脚本"变成"产品功能"。**

**注意：这个接口要防刷（第 8 周）、要算成本（第 7 周）、要限长度。今天先把功能跑通。**

## 练习四：想清楚这三个问题

```text
1. 为什么审核器不能用 temperature 0.7？
2. 为什么"代码否决模型"的方向是对的，反过来为什么不行？
3. 如果客户说"太慢了，能不能去掉审核"，你怎么答？
```

---

# 第 11 步：最终验收

## A. 代码

- [ ] `prompts.js` 有 `rewriteV1` 和 `reviewV1`
- [ ] `REVIEW_SCHEMA` 的 `issues` 有 `itemFields`
- [ ] `checkShape` 支持 `itemFields`，且 `e04a` 回归全过
- [ ] `facts.js` 有 `checkNumbersPreserved` / `findForbidden` / `checkLength`
- [ ] `pipeline.js` 有 `draft` / `review` / `revise` / `runPipeline`
- [ ] 分数不升会停

## B. 效果

- [ ] 我跑过至少 3 次，看过每轮的分数和 issues
- [ ] 我抽查过 `quote` 是否在稿子里存在
- [ ] 复杂参数那条，我验证过代码兜底能抓到编造的数字

## C. 认知

- [ ] 我能解释"为什么一个提示词不能同时管写和查"
- [ ] 我知道审核器为什么容易说通过
- [ ] 我知道为什么"代码否决模型"而不反过来
- [ ] 我知道审核通过不等于没有法律风险

## 本节课要能说出口的一句话

> **让模型写，再让另一个角色挑刺，最后让代码拍板。三层里最不能省的是代码那一票。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 永远 `passed: true` | 审核器太宽松 | 加"你的任务是挑问题"，给 5 条清单 |
| 永远 `passed: false` | 标准太严或互相矛盾 | 检查标准能不能同时满足 |
| `issues` 是字符串数组 | schema 没约束元素 | 加 `itemFields` |
| `quote` 找不到 | 它在概括而非引用 | 要求"逐字复制"，加代码校验 |
| 越改越差 | 过度修正 | 限 `fix` 字数 + 分数不升就停 |
| 分数一直是 0 | `score` 类型是字符串 | schema 已校验 `number` |
| 调用次数爆炸 | 轮数没上限 | `MAX_ROUNDS = 2`，别改大 |
| 数字对比误报 | 单位换算（500ml → 0.5L） | 接受误报，人工确认 |
| 极限词误报 | "最后""最近" | 代码只提示，不单独否决 |
| 改写稿带前言 | 没要求"只输出文案" | 提示词补一句 + `.trim()` |
