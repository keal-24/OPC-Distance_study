# 第 124 节课：让代码替人判，然后量出它有多不准

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 昨天你判了 20 条，算出自己两次评分的一致率。
> 今天要干一件听起来矛盾的事：**用程序判，然后证明程序判得不准。**
> 量不出不准在哪，你就永远不敢让它自动跑。

**建议用时**：150 分钟（本节内容最多，可以分两次做完）
**你需要先完成**：第 123 节的 `labels/final.jsonl`（20 条人工标签）+ `runs/*.jsonl`
**今天不装新东西**

---

# 第 0 步：为什么必须自动化，以及它的前提（15 分钟）

## 0.1 你的迭代速度被一个数字锁死了

第 123 节练习二你算过：

```text
20 条 × 两遍盲评 × 平均 1 分 40 秒 ≈ 67 分钟
30 条跑一次全量 ≈ 100 分钟
```

**这个数字决定了你的上限。** 你不可能一天改三次提示词，因为验证要 100 分钟。

**更糟的是：** 改完想"快速看一眼有没有变差"，也要 100 分钟。**于是你会跳过验证直接上线。**

**今天要做的事，就是把这个 100 分钟压到 2 分钟。**

## 0.2 五个字段，三类成本

| 字段 | 判什么 | 谁能判 | 30 条耗时 |
|---|---|---|---|
| `category` | 六选一 | **纯代码**（字符串比枚举） | 毫秒 |
| `urgency` | 三选一 | **纯代码**（字符串比枚举） | 毫秒 |
| `need_human` | 布尔 | **纯代码**（类型 + 值） | 毫秒 |
| `summary` | 抓没抓重点、有没有编造 | 代码判事实 + **模型判语义** | 1—2 分钟 |
| `suggested_action` | 合不合理、有没有越权 | 同上 | 1—2 分钟 |

**关键结论：三个字段完全不需要模型。**

**用模型判 `category` 是纯浪费。** 它可能把 `refund` 判成 `quality`（它有偏好），而字符串比较永远正确、永远免费、永远可重复。

```text
这条要记死：能用字符串比较的，绝不用模型。
```

## 0.3 自动判分的前提：你得先证明它准

```text
不能这样：
  代码判 87% → 直接信 → 上线 → 客户投诉 → 你发现它一直判错了

必须这样：
  代码判 87%，人判 82% → 差 5 个点 → 逐条看差在哪
  → 找到偏差方向 → 修 → 重新对齐
```

**对齐不到 85%，你的自动判分不能用于任何决策。**

---

# 第 1 步：代码判分（45 分钟）

## 1.1 先解决一个前置问题：模型吐的东西不干净

**打开你第 122 节的 `runs/*.jsonl`，随便挑 5 条 `output_text` 看。**

你会看到至少三种脏东西：

```text
① 包在 markdown 里
   ```json
   {"category":"quality", ...}
   ```

② 前后有废话
   好的，这是分析结果：
   {"category":"quality", ...}
   希望对您有帮助。

③ 尾逗号（模型手抖）
   {"category":"quality", "urgency":"high",}
```

**如果你直接 `JSON.parse`，这三种全会判成"格式崩坏"。**

**但这不是模型的错，是你的管道没修。** 一条 JSON 里多一个尾逗号，不代表模型的分类判断是错的。

## 1.2 写 `parseOutput`：三种病，三种修法

```javascript
// eval/parse.js
// 把模型输出剥成干净的对象。返回值里的 repaired 告诉你修了什么。

export function parseOutput(text) {
  if (!text || typeof text !== "string") {
    return { ok: false, obj: null, repaired: [], error: "空输出" };
  }

  const repaired = [];
  let s = text.trim();

  // ---------- 修法一：剥代码块包裹 ----------
  const fence = s.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  if (fence) {
    s = fence[1].trim();
    repaired.push("strip_fence");
  }

  // ---------- 修法二：找首尾大括号 ----------
  // 处理"好的，这是结果：{...} 希望有帮助"这种前后带废话的
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start > 0 || (end !== -1 && end < s.length - 1)) {
    if (start !== -1 && end !== -1 && end > start) {
      s = s.slice(start, end + 1);
      repaired.push("slice_braces");
    }
  }

  // ---------- 尝试直接解析 ----------
  let obj;
  try {
    obj = JSON.parse(s);
  } catch (e1) {
    // ---------- 修法三：修尾逗号 ----------
    // 只修 "值后面的逗号"，不去动字符串内部的逗号
    const fixed = s.replace(/,(\s*[}\]])/g, "$1");
    try {
      obj = JSON.parse(fixed);
      repaired.push("fix_trailing_comma");
    } catch (e2) {
      return {
        ok: false,
        obj: null,
        repaired,
        error: `JSON 无法解析：${e1.message.slice(0, 80)}`,
      };
    }
  }

  return { ok: true, obj, repaired, error: null };
}
```

## 1.3 三种修法的边界，必须清楚

**① 剥代码块 —— 这是管道问题，不是模型问题**

你的提示词里应该写"只输出 JSON，不要 markdown"。**但模型偶尔还是会包。** 剥掉它不改任何语义。

**② 找首尾大括号 —— 它会失败在什么情况下**

```text
会失败：输出里有两段 JSON（比如先给分析再给结论）
        {  "analysis": "..." } { "category": "..." }
        slice 之后拿到 {"analysis":"..."} { "category":"..." }，照样解析失败

也会失败：JSON 里的字符串包含 } 或 {
        {"summary":"客户说{这个}"}  ← lastIndexOf("}") 会找到错的位置
```

**所以这一步不是万能的。** 它处理的是"前后各有一段纯文本"这种最常见的情况。

**③ 修尾逗号 —— 为什么必须记录 `repaired`**

```text
repaired 有值 = 这条输出在原样状态下是不能用的。
```

**这一个字段决定了你的报告怎么写：**

```text
错："通过率 80%"
对："通过率 80%，其中 20% 的输出需要前置修复才能用"
```

**为什么这个区别重要：** 客户的下游系统如果没做修复，那 20% 会直接崩。**你必须主动说，不能等他发现。**

## 1.4 建 `judge-code.js`：规则判分主体

```javascript
// eval/judge-code.js
import { parseOutput } from "./parse.js";

const CATEGORIES = ["logistics", "quality", "refund", "invoice", "account", "other"];
const URGENCIES = ["high", "medium", "low"];
const SUMMARY_MAX = 60;

// 越权承诺词表 —— 这是你最该维护的一张表，每次线上事故往里加词
const OVERPROMISE = [
  "已为您", "已经为您", "已安排", "已登记", "已处理",
  "保证", "一定能", "肯定会", "承诺",
  "已退款", "已到账", "已补发", "已赔偿", "已批准", "已联系快递",
];

// 编造信号的弱提示词（只用于标 WARN，不判死）
const HEDGE = ["可能是", "建议", "似乎", "估计"];

const FIELDS = ["summary", "category", "urgency", "need_human", "suggested_action"];

export function judgeCode(record) {
  const fields = Object.fromEntries(FIELDS.map((f) => [f, "PASS"]));
  const reasons = [];
  const veto = [];

  // ---------- ① 调用失败 ----------
  if (record.error || !record.output_text) {
    for (const f of FIELDS) fields[f] = "FAIL";
    veto.push("V6_format");
    reasons.push(`调用失败：${record.error ?? "空输出"}`);
    return { fields, veto, reasons, repaired: [], parsed: null };
  }

  // ---------- ② 解析（带修复） ----------
  const p = parseOutput(record.output_text);
  if (!p.ok) {
    for (const f of FIELDS) fields[f] = "FAIL";
    veto.push("V6_format");
    reasons.push(p.error);
    return { fields, veto, reasons, repaired: p.repaired, parsed: null };
  }
  if (p.repaired.length) {
    reasons.push(`输出需要修复：${p.repaired.join(" + ")}`);
  }

  const obj = p.obj;

  // ---------- ③ 字段存在性 + 类型 ----------
  for (const key of FIELDS) {
    if (!(key in obj)) {
      fields[key] = "FAIL";
      if (key !== "summary" && key !== "suggested_action") veto.push("V6_format");
      reasons.push(`缺字段 ${key}`);
    }
  }

  // ---------- ④ 枚举类：纯字符串比较，最可靠 ----------
  if (obj.category != null) {
    if (!CATEGORIES.includes(obj.category)) {
      fields.category = "FAIL";
      veto.push("V6_format");
      reasons.push(`category 不在枚举：${obj.category}`);
    } else if (record.expect?.category && obj.category !== record.expect.category) {
      fields.category = "FAIL";
      reasons.push(`category 期望 ${record.expect.category}，实际 ${obj.category}`);
    }
  }

  if (obj.urgency != null) {
    if (!URGENCIES.includes(obj.urgency)) {
      fields.urgency = "FAIL";
      veto.push("V6_format");
      reasons.push(`urgency 不在枚举：${obj.urgency}`);
    } else if (record.expect?.urgency && obj.urgency !== record.expect.urgency) {
      const order = { low: 0, medium: 1, high: 2 };
      const gap = Math.abs(order[obj.urgency] - order[record.expect.urgency]);
      fields.urgency = gap === 1 ? "WARN" : "FAIL";   // 差一档 WARN，差两档 FAIL
      reasons.push(`urgency 期望 ${record.expect.urgency}，实际 ${obj.urgency}（差 ${gap} 档）`);
    }
  }

  if (obj.need_human != null) {
    if (typeof obj.need_human !== "boolean") {
      fields.need_human = "FAIL";
      veto.push("V6_format");
      reasons.push(`need_human 不是布尔：${typeof obj.need_human}`);
    } else if (record.expect?.need_human != null && obj.need_human !== record.expect.need_human) {
      fields.need_human = "FAIL";
      reasons.push(`need_human 期望 ${record.expect.need_human}，实际 ${obj.need_human}`);
    }
  }

  // ---------- ⑤ 事实类：must_contain 只警告 ----------
  const text = [obj.summary, obj.suggested_action].filter(Boolean).join(" ");

  for (const w of record.must_contain ?? []) {
    if (!text.includes(w)) {
      fields.summary = fields.summary === "PASS" ? "WARN" : fields.summary;
      reasons.push(`must_contain 缺失：${w}`);
    }
  }

  // ---------- ⑥ must_not_contain 可以判死 ----------
  for (const w of record.must_not_contain ?? []) {
    if (text.includes(w)) {
      fields.summary = "FAIL";
      fields.suggested_action = "FAIL";
      veto.push("V2_overpromise");
      reasons.push(`must_not_contain 命中：${w}`);
    }
  }

  // ---------- ⑦ 越权承诺词表（对所有题生效） ----------
  const hit = OVERPROMISE.find((w) => text.includes(w));
  if (hit) {
    fields.suggested_action = "FAIL";
    if (!veto.includes("V2_overpromise")) veto.push("V2_overpromise");
    reasons.push(`越权承诺词：${hit}`);
  }

  // ---------- ⑧ summary 长度 ----------
  if (obj.summary && obj.summary.length > SUMMARY_MAX) {
    fields.summary = fields.summary === "PASS" ? "WARN" : fields.summary;
    reasons.push(`summary 超长：${obj.summary.length} > ${SUMMARY_MAX}`);
  }

  return { fields, veto, reasons, repaired: p.repaired, parsed: obj };
}
```

## 1.5 `must_contain` 为什么只警告，`must_not_contain` 为什么能判死

**这是今天第一个必须想清的设计决策。**

```text
must_contain 只警告，因为模型可能换了种说法反而更好：

  期望出现 "内胆"
  模型写 "客户称电饭锅内胆开裂"        → 命中，PASS
  模型写 "客户称电饭锅加热部分有问题"   → 没命中，但意思是通的

  这条词表是你随手写的，它不代表唯一正确答案。
  判死 = 用一个可能写错的词表去否决一个可能更好的输出。
```

```text
must_not_contain 可以判死，因为它写的是"绝对不能出现的东西"：

  "已退款" "已为您安排" "保证明天到"

  这些词出现，说明模型越权了。这跟措辞无关，跟事实有关。
  这一类的词表几乎不会写错。
```

**一句话：`must_contain` 约束的是"表述"，`must_not_contain` 约束的是"越界"。表述有无数种，越界只有一种。**

## 1.6 跑它，看 `repaired` 条数

```bash
node -e "
import('./eval/judge-code.js').then(async ({judgeCode}) => {
  const fs = await import('node:fs');
  const rows = fs.readFileSync('runs/2026-11-16T08-30-00__cheap.jsonl','utf8')
    .split(/\r?\n/).filter(l=>l.trim()).map(l=>JSON.parse(l));
  let repairedCount = 0, failCount = 0;
  for (const r of rows) {
    const res = judgeCode(r);
    if (res.repaired.length) { repairedCount++; console.log(r.id, res.repaired.join('+')); }
    if (res.veto.includes('V6_format')) failCount++;
  }
  console.log(\`\n需修复 \${repairedCount} 条，格式崩坏 \${failCount} 条\`);
});
"
```

**如果 `repaired` 有 6 条，这 6 条在真实系统里也是 6 条会崩的输入。** 记下这个数，报告里要用。

---

# 第 2 步：模型判分（35 分钟）

## 2.1 判分提示词要单独成文件

**不要写在代码里。** 理由和第 122 节的 `prompt.txt` 一样：**它是会被反复调的东西，必须能版本化、能 diff。**

建 `eval/judge-prompt.txt`：

```text
你是客服工单回复的质检员。你只判两个字段，其他不管。

【summary 的三档】
PASS：包含"具体标的物/事件" + "客户诉求"，且不含原文没有的信息。
      例："客户称收到裂的电饭煲内胆，要求换货"
WARN：漏了标的物或用词模糊，但客服看完还能定位。
      例："客户反馈商品有问题要求售后"
FAIL：出现原文没有的人事时地物，或与原文矛盾。以下都算 FAIL：
      - 原文"还没用" → 输出"已使用一周后开裂"（时间凭空出现）
      - 原文"可能是物流问题" → 输出"确认是物流丢件"（不确定变确定）
      - 原文没提金额 → 输出"涉及金额约 200 元"（数字凭空出现）
      - 原文"我要退款" → 输出"客户情绪激动要求赔偿"（诉求被升级）

【suggested_action 的三档】
PASS：一个具体动作，不承诺结果，不代替公司决策。
      例："查物流签收记录，48 小时内回电"
WARN：方向对但动作模糊。
      例："联系客户了解情况"
FAIL：承诺了系统无权承诺的事，或建议了违规操作。
      例："已为您安排补发，预计明天到"

【特别注意】
- 不要因为答案长就给高分。长度和正确性无关。
- 不要因为答案"看起来礼貌"就给高分。
- 严格按上面的例子对齐，不要自己发明标准。

只输出 JSON，不要任何解释：
{"summary":"PASS|WARN|FAIL","suggested_action":"PASS|WARN|FAIL","why":"一句话理由"}
```

## 2.2 判分器绝对不能看到 `expect`

**这一条是硬规矩，破了整节课就白做。**

```text
一旦判分器看到 expect（标准答案），它就会"抄答案"：
  "期望 category 是 refund……哦我看到答案了，那判 PASS"

结果：一致率虚高到 95%，而这个 95% 毫无意义。
```

**检查你的函数签名：**

```javascript
// 对：只传 input 和 output
judgeLLM(record.input, record.output_text)

// 错：把整条记录传进去（里面带着 expect）
judgeLLM(record)
```

**这个错误非常容易犯。** 因为传 `record` 更方便。**写完之后一定回头看一眼传参。**

## 2.3 三个系统性偏差，逐个防

```text
① 长答案偏好
   表现：更长的 summary 得 PASS 概率更高
   防法：提示词里写"不要因为答案长就给高分"，并用逐字例子对齐
   残余风险：防不干净，所以对齐时要专门看"长答案 WARN/PASS 分歧"

② 同源偏好
   表现：判分模型和被测模型是同一家时，给分偏高
   防法：换一个不同家族的裁判（今天必做的实验）
   残余风险：如果你的预算只够一家，那就承认这个偏差，报告里写出来

③ 位置偏好
   表现：对比两个答案时偏爱第一个
   防法：不做 pairwise 比较，只做绝对判定（今天的设计就是这样）
```

**第 ③ 条你今天已经躲过了。** `judge-prompt.txt` 让模型对单条输出打绝对分，不比较。**这是好设计，别改成"哪个更好"。**

## 2.4 建 `judge-llm.js`

```javascript
// eval/judge-llm.js
import fs from "node:fs";

const RUBRIC = fs.readFileSync(new URL("./judge-prompt.txt", import.meta.url), "utf8");

const BASE_URL = (process.env.OPENAI_BASE_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.JUDGE_MODEL ?? process.env.OPENAI_MODEL;

export async function judgeLLM(input, output) {
  if (!BASE_URL || !API_KEY || !MODEL) {
    throw new Error("缺环境变量：OPENAI_BASE_URL / OPENAI_API_KEY / JUDGE_MODEL");
  }

  const body = {
    model: MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: RUBRIC },
      {
        role: "user",
        // 注意：只有 input 和 output，没有 expect
        content: `【客户原始输入】\n${input}\n\n【模型输出】\n${output}`,
      },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return JSON.parse(json.choices[0].message.content);
}
```

## 2.5 建 `judge.js`：先代码后模型，代码赢

```javascript
// eval/judge.js
// 调度：代码判全部，模型补语义字段。代码判 FAIL 的，模型不能翻案。

import fs from "node:fs";
import { judgeCode } from "./judge-code.js";
import { judgeLLM } from "./judge-llm.js";

const JUDGE_VERSION = "v1";   // 每改一次词表或 rubric，这个数 +1

const runFile = process.argv[2];
const limit = Number(process.argv[3] ?? 999);

const rows = fs.readFileSync(runFile, "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l))
  .slice(0, limit);

const out = [];

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const code = judgeCode(r);

  const rec = {
    id: r.id,
    layer: r.layer,
    model_key: r.model_key,
    judge_version: JUDGE_VERSION,
    code: { fields: code.fields, veto: code.veto, reasons: code.reasons, repaired: code.repaired },
    llm: null,
    final: { ...code.fields },
    final_veto: [...code.veto],
  };

  // 只对"没崩"的输出调模型判分
  if (!code.veto.includes("V6_format") && r.output_text) {
    process.stdout.write(`[${i + 1}/${rows.length}] ${r.id} … `);
    try {
      const j = await judgeLLM(r.input, r.output_text);
      rec.llm = j;

      for (const f of ["summary", "suggested_action"]) {
        // ===== 核心设计：代码判 FAIL 的，模型不能翻案 =====
        if (code.fields[f] === "FAIL") continue;
        if (j[f] === "FAIL") {
          rec.final[f] = "FAIL";
        } else if (j[f] === "WARN") {
          rec.final[f] = rec.final[f] === "PASS" ? "WARN" : rec.final[f];
        }
        // 模型判 PASS 不提分 —— 只会往下压，不会往上抬
      }

      console.log(`${rec.final.summary}/${rec.final.suggested_action}`);
    } catch (e) {
      rec.llm = { error: String(e.message).slice(0, 200) };
      console.log(`❌ ${e.message.slice(0, 50)}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  out.push(rec);
}

const outPath = runFile.replace(/\.jsonl$/, ".judged.jsonl");
fs.writeFileSync(outPath, out.map((r) => JSON.stringify(r)).join("\n") + "\n");

// ===== 顺带算一遍分数 =====
const FIELDS = ["summary", "category", "urgency", "need_human", "suggested_action"];
let pass = 0, fatal = 0;
for (const r of out) {
  if (r.final_veto.length) fatal++;
  else if (FIELDS.every((f) => r.final[f] === "PASS")) pass++;
}
const pct = (n) => ((n / out.length) * 100).toFixed(1) + "%";
console.log(`\n严格通过：${pass}/${out.length} = ${pct(pass)}`);
console.log(`致命错误：${fatal} 条`);
console.log(`judge_version：${JUDGE_VERSION}`);
console.log(`输出：${outPath}`);
```

## 2.6 为什么"代码判 FAIL 的，模型不能翻案"

**这是一个偏严的设计。代价你自己要清楚。**

```text
好处：规则不会因为模型的宽松倾向被绕过。越权承诺词命中了，就是命中了。

代价：代码规则本身写错时，模型也救不了。
      比如你的 OVERPROMISE 词表里塞了"可以"，
      那所有含"可以"的输出全被判死，模型判 PASS 也没用。

所以：代码规则必须单独测（第 3 节的误杀测试）。
```

**"只会往下压，不会往上抬"这个设计也有代价：**

```text
模型判 PASS 不提分 → 代码判 WARN 的，永远是 WARN
```

**这意味着你的代码规则需要稍微宽松一点**（宁可 WARN 不 FAIL），把"往上抬"的裁量权交给规则本身，而不是模型。

## 2.7 必做实验：换一个不同家族的裁判

```bash
JUDGE_MODEL=另一个家族的模型名 node eval/judge.js runs/xxx.jsonl 5
```

**对比两份 `*.judged.jsonl` 的 `llm` 字段。**

**你大概率会看到：** 同一批输出，裁判 A 判 PASS，裁判 B 判 WARN。

**这个实验的意义：让你彻底放弃"自动判分是客观的"这个幻想。**

**自动判分只是"另一个会犯错的判定者"。它唯一的价值是：快、便宜、可重复。**

---

# 第 3 步：对齐人评（40 分钟）★ 今天最重要

## 3.1 对齐的是什么

```text
对齐 = 拿判分器的结果，和人工判的结果逐条比，
       算出"一致率"，并搞清楚每条分歧的原因。
```

**基准不是 100%，是"人自己的两次一致率"。**

**这一条极重要，很多人在这里想错：**

```text
第 123 节你算出的人评一致率，假设是 72%（summary 字段）。
现在判分器对 summary 的一致率是 75%。

正确结论：判分器比你自己还稳。这不是"只有 75% 不能用"，
         是"它已经和人一样准了，上限就在这"。

错误结论：75% 太低，继续调，追到 95%。
         结果：你把 final.jsonl 当训练集，调到过拟合，
              换一批新数据立刻掉回 70%。
```

## 3.2 建 `align.js`

```javascript
// eval/align.js
// 用法：node eval/align.js labels/final.jsonl runs/xxx.judged.jsonl

import fs from "node:fs";

const [manualFile, judgedFile] = process.argv.slice(2);
const FIELDS = ["summary", "category", "urgency", "need_human", "suggested_action"];
const ORDER = { FAIL: 0, WARN: 1, PASS: 2 };

const readJsonl = (f) => fs.readFileSync(f, "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const manual = new Map(readJsonl(manualFile).map((r) => [r.id, r]));
const judged = new Map(readJsonl(judgedFile).map((r) => [r.id, r]));

const ids = [...manual.keys()].filter((id) => judged.has(id));
console.log(`可对齐：${ids.length} 条\n`);

const fieldStats = {};
for (const f of FIELDS) fieldStats[f] = { n: 0, exact: 0, near: 0, contra: 0 };

const diffs = [];
let cells = 0, exactAll = 0, nearAll = 0, contraAll = 0;

for (const id of ids) {
  const m = manual.get(id);
  const j = judged.get(id);

  for (const f of FIELDS) {
    const mv = m.fields[f];
    const av = j.final[f];
    if (!(mv in ORDER) || !(av in ORDER)) continue;

    cells++; fieldStats[f].n++;
    const gap = Math.abs(ORDER[mv] - ORDER[av]);

    if (gap === 0) { exactAll++; fieldStats[f].exact++; }
    else if (gap === 1) { nearAll++; fieldStats[f].near++; diffs.push({ id, f, mv, av, kind: "近邻" }); }
    else { contraAll++; fieldStats[f].contra++; diffs.push({ id, f, mv, av, kind: "矛盾" }); }
  }
}

const p = (n) => ((n / cells) * 100).toFixed(1) + "%";

console.log("=== 对齐报告 ===\n");
console.log(`判定格总数：${cells}`);
console.log(`完全一致：${exactAll}  ${p(exactAll)}`);
console.log(`近邻（差一档）：${nearAll}  ${p(nearAll)}`);
console.log(`矛盾（差两档）：${contraAll}  ${p(contraAll)}   ← 必须 ≤ 2 条\n`);
console.log(`对齐率（完全+近邻）：${p(exactAll + nearAll)}\n`);

console.log("逐字段一致率：");
for (const f of FIELDS) {
  const s = fieldStats[f];
  if (!s.n) continue;
  const rate = ((s.exact / s.n) * 100).toFixed(0);
  console.log(`  ${f.padEnd(18)} ${rate.padStart(3)}%   近邻 ${String(s.near).padStart(2)}  矛盾 ${String(s.contra).padStart(2)}`);
}

console.log("\n分歧清单：");
for (const d of diffs) {
  console.log(`  ${d.id}  ${d.f.padEnd(18)} 人判 ${d.mv.padEnd(4)} → 判分器 ${d.av.padEnd(4)}  [${d.kind}]`);
}
```

## 3.3 算"相对表现"，别只看绝对值

**这是第 124 节最容易被忽略、但最有用的一个数。**

```text
相对表现 = 判分器一致率 ÷ 人评一致率（第 123 节你算的那个）
```

| 相对表现 | 含义 | 怎么办 |
|---|---|---|
| > 0.95 | 优秀：判分器和人一样稳 | 可以放心自动化 |
| 0.85—0.95 | 可用 | 可用，每月抽查一次 |
| 0.75—0.85 | 勉强 | 只能用做粗筛，重点批必须人看 |
| < 0.75 | 不可用 | 回去改 rubric 或改规则 |

**举例（`summary` 字段）：**

```text
人评两次一致率：72%
判分器一致率：  75%
相对表现：0.75 / 0.72 = 1.04  → 优秀

你以为的："75% 太低了，得改"
实际的：  "它已经比我自己判得还稳，没有提升空间了"
```

**反过来：**

```text
人评两次一致率：90%（category 这种纯枚举字段）
判分器一致率：  72%
相对表现：0.72 / 0.90 = 0.80  → 勉强

这个才是真有问题。category 是纯字符串比较，
一致率应该接近 100%。只有 72% 说明：

  a) 你的 expect 里写的 category 和 final 标签不一致（数据错）
  b) 代码有 bug（比对逻辑错）
  c) 模型输出的大小写/空格不一致（"Refund" vs "refund"）
```

**`category` 的一致率是最容易发现问题的字段。** 因为它应该接近 100%。

## 3.4 分歧归因：四个词，必须选一个

**每条分歧必须归到一类。写"理解不同"不算归因。**

```text
A. 词表问题     → must_contain / OVERPROMISE 词表太宽或太窄
B. 长度/风格偏差 → 模型裁判的长答案偏好、礼貌偏好
C. 规则冲突     → 你的 urgency 门槛规则和 expect 打架
D. 人判错了     → 你第 123 节判错了
```

**D 类一定会出现，别不好意思。**

**第 123 节你自己两次盲评都不一致，说明你的判断本身有噪声。判分器偶尔"比你对"是正常的。**

## 3.5 修的时候，一次只修一处

**这是最实用的建议：**

```text
错的做法：
  发现 5 条不一致 → 同时改词表 + 改 rubric + 改 urgency 门槛
  → 一致率涨了 → 你不知道是哪一处起的作用
  → 下次再出问题，你不敢动任何一处

对的做法：
  改一处 → 跑一遍 → 记下一致率
  再改一处 → 跑一遍 → 记下一致率
```

**并且 `JUDGE_VERSION` 每次 +1。** 三个月后你会有一堆格式一样的文件，**没有版本号就分不清哪个是哪个版本的判分器跑的。**

## 3.6 一个必须做的实验：误杀测试

**造 5 条"完美输出"，喂给判分器，看它误判几条。**

```jsonl
{"id":"PERFECT-1","layer":"typical","input":"收到的电饭煲内胆是裂的，还没用就裂了","output_text":"{\"category\":\"quality\",\"urgency\":\"high\",\"need_human\":true,\"summary\":\"客户称电饭煲内胆开裂未使用，要求换货\",\"suggested_action\":\"核实订单与实物照片，走质量问题换货流程\"}","expect":{"category":"quality","urgency":"high","need_human":true},"must_contain":["内胆"],"must_not_contain":["已为您安排"]}
```

**自己再写 4 条，全部应该是五个字段全 PASS。**

**跑判分器，看有几条被误判。**

```text
误判 0 条 → 判分器不过严
误判 1—2 条 → 你的词表或 rubric 太严，回去查是哪一条
误判 3+ 条 → 判分器不可用
```

**为什么误杀比漏判更糟：**

```text
漏判 → 你高估自己，去优化不存在的空间（浪费一点时间）
误杀 → 你低估自己，去修没坏的东西，还可能把它改坏（双倍浪费）
```

---

# 第 4 步：变好还是变差（15 分钟）

## 4.1 单次分数没有意义，差异才有

**你要回答的永远不是"现在多少分"，是"这次改动有没有变好"。**

建 `eval/delta.js`：

```javascript
// eval/delta.js
// 用法：node eval/delta.js 旧.judged.jsonl 新.judged.jsonl

import fs from "node:fs";

const [oldFile, newFile] = process.argv.slice(2);
const FIELDS = ["summary", "category", "urgency", "need_human", "suggested_action"];

const read = (f) => new Map(
  fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim())
    .map((l) => JSON.parse(l)).map((r) => [r.id, r])
);

const a = read(oldFile);
const b = read(newFile);
const ids = [...a.keys()].filter((id) => b.has(id));

let better = 0, worse = 0, same = 0;
const changed = [];

for (const id of ids) {
  const A = a.get(id), B = b.get(id);
  let delta = 0;
  for (const f of FIELDS) {
    const score = (v) => (v === "PASS" ? 1 : v === "WARN" ? 0.5 : 0);
    delta += score(B.final[f]) - score(A.final[f]);
  }
  if (delta > 0) better++;
  else if (delta < 0) worse++;
  else same++;

  // 致命错误的变化单独盯
  const fatalA = (A.final_veto ?? []).length > 0;
  const fatalB = (B.final_veto ?? []).length > 0;
  if (fatalA !== fatalB || delta !== 0) {
    changed.push({ id, delta: delta.toFixed(1), fatal: fatalA === fatalB ? "-" : fatalB ? "新增致命❌" : "致命消除✅" });
  }
}

console.log(`对比：${ids.length} 条`);
console.log(`变好 ${better}   变差 ${worse}   不变 ${same}\n`);
console.log("有变化的条目：");
for (const c of changed) {
  console.log(`  ${c.id.padEnd(10)} 分差 ${c.delta.padStart(5)}   ${c.fatal}`);
}
```

## 4.2 怎么读这份差异

```text
变好 12 / 变差 1 / 不变 17   → 这版改动是真的有效
变好 6  / 变差 5 / 不变 19   → 可能是噪声（第 122 节你算的噪声底线）

噪声底线是什么：同一份提示词跑两次，
两次之间的差异就是噪声。差异小于噪声 = 没有变化。
```

**第 122 节 3.5 你算过 `temperature=0` 下的重跑差异率。回到那一节看那个数。**

**如果这次"变好 6 / 变差 5"小于噪声底线，正确结论是"没变化"，不是"改动无效"，更不是"改动有效"。**

---

# 第 5 步：算清楚评测成本（10 分钟）

## 5.1 三档成本，对应三种使用场景

```text
30 条一次的成本（自己填）：

  仅代码判分        $0        约 1 秒
  + 小模型判分      $____     约 1 分钟
  + 强模型判分      $____     约 2 分钟
```

**填完之后，定你的策略：**

| 场景 | 用哪档 | 为什么 |
|---|---|---|
| 改代码/改提示词 | 仅代码 | 词表没变，语义判分不会变，省下等待 |
| 每天一次 | 代码 + 小模型 | 够用，便宜 |
| 发布前 | 代码 + 强模型 + 人工抽 10 条 | 要准 |
| 线上事故后 | 全档 + 人工逐条 | 要找出到底哪坏了 |

## 5.2 算出"每天 1000 条"的量级

**这是你以后报价的依据。**

```text
1000 条 × (输入 tokens × 单价进 + 输出 tokens × 单价出) = ______ 元
判分成本 = 1000 × 判分 prompt tokens × ... = ______ 元

合计 ______ 元/天
```

**把这个数和客户能付的钱对比。** 如果客户付 200 元/月，而你判分就要 60 元/月，那判分不能每条都跑——**改成每天抽 100 条。**

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。今天四块重点：

- **只有代码判分 vs 代码+模型判分的两个通过率** —— 差在哪
- **逐字段的相对表现（判分器 ÷ 人评）** —— 哪个字段最差
- **5 处不一致的归因** —— 哪一类最多
- **误杀测试的结果** —— 误判几条

---

# 第 7 步：课后练习

## 练习一：故意把 rubric 写坏（15 分钟）

把 `judge-prompt.txt` 整个替换成一句：

```text
你是质检员，判断输出质量好不好。只输出 JSON。
```

**跑 5 条，看一致率掉到多少。**

**大概率从 75% 掉到 50% 以下。** 这就是"不写死标准"的代价。

**然后改回来，再加三条逐字例子，看能涨几个点。**

## 练习二：算自动判分省了多少时间（10 分钟）

```text
人评 30 条 × 2 遍 = ______ 分钟
自动判 30 条     = ______ 秒
一次迭代省       = ______ 分钟
一天改 5 次      = 一天省 ______ 小时
一个月（22 天）  = ______ 小时
按你的时薪 ______ 元 = ______ 元/月
```

**把最后那个数字抄进笔记第一页。** 这是你以后跟客户解释"为什么要做评测"的第一个论据。

## 练习三：想清楚为什么不能拿 final 标签反复调（10 分钟）

**假设你反复调 rubric，直到一致率 100%。**

**问自己：这个 100% 证明了什么？**

**答案方向：** 它证明"你的判分器记住了这 20 条的答案"，不证明它对新数据准。**这就是过拟合。** 换一批新数据，它会掉回 70% 甚至更低。

**这就是第 121 节为什么强调"测试集冻结"的同一个道理。**

---

# 第 8 步：最终验收

## A. 代码判分

- [ ] `parseOutput` 能剥代码块、找首尾大括号、修尾逗号
- [ ] 三种修法都记进了 `repaired`
- [ ] 五种字段全被代码判过
- [ ] `must_contain` 只判 WARN，`must_not_contain` 判 FAIL
- [ ] `OVERPROMISE` 词表 ≥ 10 个词
- [ ] 我知道 `repaired` 有几条，并记下了这个数

## B. 模型判分

- [ ] `judge-prompt.txt` 单独成文件，不在代码里
- [ ] **判分器看不到 `expect`**（我回头检查了函数传参）
- [ ] `judge.js` 先代码后模型，代码判 FAIL 的不能翻案
- [ ] `judge_version` 字段存在
- [ ] 我换过一个不同家族的裁判，看到结果不一样

## C. 对齐

- [ ] `align.js` 跑出了三个数（完全/近邻/矛盾）
- [ ] **矛盾 ≤ 2 条**
- [ ] 逐字段一致率都算出来了
- [ ] **相对表现(判分器 ÷ 人评)** 每个字段都算了
- [ ] 5 处不一致逐条归到 A/B/C/D
- [ ] 修的时候一次只改一处，并记录了每次的一致率

## D. 误杀与差异

- [ ] 造了 5 条完美输出，跑过误杀测试
- [ ] 知道误杀比漏判更糟，并写下了理由
- [ ] `delta.js` 能跑出"变好/变差/不变"
- [ ] 我知道噪声底线是多少，并知道差异小于噪声等于没变化

## E. 成本

- [ ] 三档成本都填了真实数字
- [ ] 我的四场景策略写进笔记了
- [ ] 算过"每天 1000 条"的量级

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我还不懂的词有内容

---

## 本节课要能说出口的一句话

> **判分器的目标不是"客观正确"，是"和人一样准，而且我知道它哪里不准"。**
> **一致率不和人评比、不和自己的上限比，你就只是在给一个数字编故事。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `category` 一致率只有 72% | 数据错或代码 bug | 它应该接近 100%，去查 expect 和标签是否一致、大小写是否统一 |
| `summary` 一致率 75% 想继续调 | 目标错了 | 先看人评一致率，75% 可能已经是上限 |
| 矛盾率特别高 | 有系统性误判 | 把矛盾的全列出来找共同点 |
| 裁判模型总给 PASS | 宽松倾向 | rubric 里写"不要因长度/礼貌给高分"，PASS 门槛提高 |
| 裁判模型总给 FAIL | 尺子太严 | 跑误杀测试，看完美输出被误判几条 |
| 误杀 3 条以上 | 词表太宽 | 逐条看命中了哪个词，删掉误伤的 |
| 一致率调到 100% | 过拟合 | 换一批没见过的数据再测，会掉回去 |
| 判分比跑业务模型还贵 | 裁判用大模型 | 裁判换小模型，它只判两个字段 |
| `repaired` 很多条 | 提示词没禁止 markdown | 提示词加"只输出 JSON"，同时报告里如实说修复率 |
