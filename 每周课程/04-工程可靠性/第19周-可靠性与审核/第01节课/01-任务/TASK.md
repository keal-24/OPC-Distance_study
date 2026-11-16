# 第 127 节课：让模型承认自己不确定

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天要做的事听起来简单：**在模型硬编之前拦住它。**
> 但难点在于——你不能问它"你确定吗"，它一定会说确定。

**建议用时**：120 分钟
**你需要先完成**：第 126 节的 `DECISION.md`（你已经有判分器和测试集）
**今天要装**：什么都不用装

---

# 第 0 步：先看清"编造"长什么样（15 分钟）

## 0.1 三种编造，只有一种能被"感觉"发现

拿你第 18 周的测试集，挑三条模型编造的输出看。

```text
类型 A：补全缺失的细节
  输入："上次那个事你们什么时候给我个说法"
  输出："客户咨询上次订单（订单号 SF1234）的处理进度"
  → 订单号和"处理进度"都是凭空来的
  → 读起来毫无破绽，你只有对照原文才能发现

类型 B：把猜测写成事实
  输入："东西收到了，有点问题"
  输出："客户反馈商品存在质量问题，已确认为生产缺陷"
  → "已确认"和"生产缺陷"是它自己加的结论
  → 读起来很专业，反而更容易被放过

类型 C：编造根本不存在的流程
  输入："我想退货"
  输出："已为您提交退货申请，退款将在 3-5 个工作日到账"
  → 它没有这个能力，但它写了
  → 这是最危险的，因为客户会当真
```

**三种里，只有类型 C 会被你"感觉到不对"**（因为你知道系统没这个功能）。

**A 和 B 你必须对照原文才看得出来。** 这就是为什么"我觉得这个回答在编"这种判断不可靠 —— **它只对 C 有效。**

## 0.2 你现在唯一的防线是"人看一眼"

```text
你的现状：
  模型输出 → 前端显示 → 客服看到 → 客服发现不对 → 客服改
  
成本：
  每条 1.5 分钟 × 每天 1000 条 = 25 小时/天
  而且是"事后"发现，客户可能已经看到了
```

**今天要把"事后"变成"事前"。**

## 0.3 一个必须放弃的思路

**你想让模型自己判断：**

```text
提示词里加一句："如果你不确定，请在 confidence 字段填写 0 到 1 的置信度。"
```

**试一下，你会看到这个：**

```json
{"summary": "客户反馈商品破损", "confidence": 0.85}
{"summary": "客户咨询物流进度", "confidence": 0.85}
{"summary": "客户要求退款",   "confidence": 0.85}
{"summary": "客户投诉客服态度", "confidence": 0.85}
```

**每条都是 0.85。**

**为什么？** 因为 `confidence` 对你来说是"信心"，对模型来说是一个**它学会了要填的数字**。训练数据里这个位置经常是 0.8–0.9，它就填 0.85。**它和输出内容毫无关系。**

**这是本节课最重要的一句话：模型自报的置信度不是置信度，是一个格式。**

**如果它偶尔给出 0.3 呢？** 那是它在模仿"不确定的语气"，也不是真的不确定。**而且你会发现在该给 0.3 的地方它给 0.9，在不该给的地方它给 0.4。**

---

# 第 1 步：三种真正可用的信号（30 分钟）

## 1.1 信号一：一致性采样（最有效）

**原理：** 同一个输入，跑 3 次（用 `temperature > 0`，比如 0.7）。如果三次的结论一致，说明这个判断是稳的；如果不一致，说明模型在这个输入上"摇摆" —— 摇摆的地方就是它会编的地方。

**为什么有效？** 因为编造不是随机的，是**在缺乏信息时填坑**。信息充足时，不同采样会收敛到同一答案；信息不足时，每次填的坑不一样。

```javascript
// reliable/sample.js
// 一致性采样：同输入跑 N 次，看结论是否一致

export async function sampleConsistency(callModel, input, n = 3) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    // 关键：这里必须 temperature > 0，否则三次一模一样，测了个寂寞
    const r = await callModel(input, { temperature: 0.7, max_tokens: 400 });
    runs.push(r);
  }

  // 只比"结构化字段"的一致性，不比 summary 的字面
  const keys = ["category", "urgency", "need_human"];
  const votes = Object.fromEntries(keys.map((k) => [k, {}]));

  for (const r of runs) {
    const o = safeParse(r.text);
    if (!o) continue;
    for (const k of keys) {
      const v = String(o[k]);
      votes[k][v] = (votes[k][v] ?? 0) + 1;
    }
  }

  const result = {};
  for (const k of keys) {
    const entries = Object.entries(votes[k]).sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    result[k] = {
      value: top?.[0] ?? null,
      agreement: top ? top[1] / n : 0,      // 最高票占比 = 一致度
      distribution: votes[k],
    };
  }

  // 整体一致度 = 三个字段一致度的最小值（最保守）
  const minAgree = Math.min(...keys.map((k) => result[k].agreement));

  return {
    runs: runs.length,
    fields: result,
    agreement: minAgree,
    // 三次都对不上 = 强信号：模型在这个输入上没把握
    unstable: minAgree < 1,
  };
}

function safeParse(text) {
  try {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    return JSON.parse(text.slice(a, b + 1));
  } catch { return null; }
}
```

## 1.2 信号二：输入信息量（最便宜）

**原理：** 输出里出现的"具体事实"（数字、日期、单号、人名、地名），**在输入里必须能找到依据**。找不到 → 它在补。

```javascript
// reliable/inform.js
// 输入信息量检查：输出里的事实，输入里有依据吗

const RE_PHONE = /1[3-9]\d{9}/g;
const RE_ID    = /\d{17}[\dXx]/g;
const RE_ORDER = /[A-Z]{2,}\d{6,}|\b\d{10,}\b/g;
const RE_MONEY = /\d+(\.\d+)?\s*(元|块|万|千)/g;
const RE_DATE  = /\d{1,2}\s*[月日号]|\d{4}[-/]\d{1,2}[-/]\d{1,2}/g;

function facts(text) {
  const s = String(text ?? "");
  return {
    phones: s.match(RE_PHONE) ?? [],
    ids: s.match(RE_ID) ?? [],
    orders: s.match(RE_ORDER) ?? [],
    money: s.match(RE_MONEY) ?? [],
    dates: s.match(RE_DATE) ?? [],
  };
}

export function checkGrounding(input, output) {
  const fi = facts(input);
  const fo = facts(output);
  const missing = [];

  for (const k of ["phones", "ids", "orders", "money", "dates"]) {
    for (const v of fo[k]) {
      // 带空格的金额做归一化再比
      const norm = (x) => String(x).replace(/\s/g, "");
      if (!fi[k].some((x) => norm(x) === norm(v))) {
        missing.push({ kind: k, value: v });
      }
    }
  }

  return {
    total: Object.values(fo).flat().length,
    ungrounded: missing,
    // 有任何一个"输出有、输入没有"的具体事实 → 至少是 WARN
    suspicious: missing.length > 0,
  };
}
```

## 1.3 信号三：占位符与空话密度（最容易误判，但便宜）

**原理：** 编造的输出经常伴随"看起来在说事但没说什么"的句子。

```text
"已确认是物流破损"        ← 已确认（谁确认的？）
"经核实，客户反映属实"    ← 经核实（核实了什么？）
"相关部门正在处理"        ← 哪个部门？
"已为您登记，请耐心等待"  ← 登记到哪了？
```

```javascript
// reliable/vague.js
const FAKE_CERTAINTY = [
  "已确认", "经核实", "已查实", "已锁定",
  "相关部门", "相关同事", "专业人员",
  "已登记", "已上报", "已记录", "正在处理中",
];

export function vagueDensity(output) {
  const o = safeParse(output) ?? {};
  const text = JSON.stringify(o);
  const hits = FAKE_CERTAINTY.filter((w) => text.includes(w));
  return {
    hits,
    // 出现 2 个以上"假确定"词 → 高度可疑
    dense: hits.length >= 2,
  };
}
```

**为什么这个信号最容易误判？**

因为**真实的工单里也可能出现这些词**（比如客服真的核实过）。所以它只能当"弱信号"，不能单独判死。**用它做二次确认，不做主判据。**

## 1.4 三个信号的强度排序（必须记住）

```text
信号一 一致性采样   强    成本 3 倍调用      误报率低
信号二 信息量检查   中    成本 0             误报率中（同义词会误报）
信号三 空话密度     弱    成本 0             误报率高（真实文本也可能有）
```

**实战配置：**

```text
每条都跑 → 信号二 + 信号三（0 成本）
信号二命中 or 信号三命中 → 跑信号一（3 倍成本）
信号一 agreement < 1 → 转人工
```

**这个级联设计让 80% 的条目只花 1 次调用的钱。**

---

# 第 2 步：编写闸门（25 分钟）

## 2.1 闸门的位置

```text
模型输出
  ↓
① 解析成功？ 否 → 重试 → 仍失败 → 转人工
  ↓ 是
② 有未落地事实？ 是 → 跑一致性采样 → 不稳定 → 转人工
  ↓
③ 空话密集？ 是 → 跑一致性采样 → 不稳定 → 转人工
  ↓
④ 一致度 < 阈值？ 是 → 转人工
  ↓否
自动返回
```

```javascript
// reliable/confidence.js
import { sampleConsistency } from "./sample.js";
import { checkGrounding } from "./inform.js";
import { vagueDensity } from "./vague.js";

export async function gate(input, output, callModel, opts = {}) {
  const THRESHOLD = opts.threshold ?? 1.0;   // 默认要求三次完全一致
  const trace = [];

  // ① 解析
  const parsed = safeParse(output);
  if (!parsed) {
    trace.push("parse_fail");
    return { route: "human", reason: "输出不可解析", trace };
  }

  // ② 信息量
  const grounding = checkGrounding(input, parsed);
  if (grounding.suspicious) {
    trace.push(`ungrounded:${grounding.ungrounded.map((u) => u.kind).join(",")}`);
  }

  // ③ 空话
  const vague = vagueDensity(output);
  if (vague.dense) trace.push(`vague:${vague.hits.join("|")}`);

  // ④ 需要起疑 → 采样
  const needsSample = grounding.suspicious || vague.dense;
  if (!needsSample) {
    return { route: "auto", reason: "信号干净", trace, confidence: 1 };
  }

  const sc = await sampleConsistency(callModel, input, 3);
  trace.push(`agreement:${sc.agreement.toFixed(2)}`);

  if (sc.agreement < THRESHOLD) {
    return {
      route: "human",
      reason: `一致度 ${sc.agreement.toFixed(2)} < ${THRESHOLD}`,
      trace,
      confidence: sc.agreement,
      sample: sc.fields,
    };
  }

  // 三次一致，但因为有未落地事实 → 仍然标记"低置信自动"
  return { route: "auto_low_confidence", reason: "一致但含未落地事实", trace, confidence: sc.agreement };
}

function safeParse(text) {
  try {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    return JSON.parse(text.slice(a, b + 1));
  } catch { return null; }
}
```

## 2.2 为什么阈值默认是 1.0（三次全一致）

**看似太严。试一下松一点会怎样：**

```text
阈值 1.0（三次必须一致）→ 转人工率大概 25–40%
阈值 0.67（两次一致即可）→ 转人工率大概 10–15%
```

**差的这 20 个点，正是它最没把握的那批。**

**而且注意：`agreement = 0.67` 的意思是三次里两次一样。** 如果那两次一样的结果恰好是正确的，你放过了它；如果那两次一样的结果是错的（因为错的方式更"自然"），你就把错的放出去了。

**用 1.0 起步，观察一周，再考虑放宽。** 反过来的顺序会让你上线第一周就吃一次投诉。

## 2.3 一个必须做的对照实验

**在测试集上跑三种配置，记三个数：**

| 配置 | 转人工率 | 编造漏过率 | 每天人工成本 |
|---|---|---|---|
| 无闸门（基线） | 0% | ~23% | —— |
| 只在信号二命中时采样 | ? | ? | ? |
| 信号二或信号三命中时采样 | ? | ? | ? |

**第三列"编造漏过率"怎么算？**

你第 18 周的判分器已经能判 V1（编造）。**用闸门之后的输出重跑一遍判分器，看还有几条 V1。**

```text
基线：30 条里 7 条 V1
加闸门后：30 条里 2 条 V1
→ 漏过率从 23% 降到 6.7%，代价是转人工率 32%
```

**这个表才是今天真正的交付物。** 一张能说明"闸门值不值"的表。

---

# 第 3 步：实测（30 分钟）

## 3.1 用第 18 周的测试集跑

```javascript
// reliable/eval-gate.js
import fs from "node:fs";
import { gate } from "./confidence.js";

const CASES = "../eval/cases.jsonl";         // 第 121 节的测试集
const call = async (input, opt) => { /* 你的模型调用 */ };

const cases = fs.readFileSync(CASES, "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const rows = [];
for (const c of cases) {
  const out = await call(c.input, { temperature: 0 });
  const g = await gate(c.input, out.text, async (i, o) => call(i, o));

  rows.push({ id: c.id, layer: c.layer, route: g.route, reason: g.reason, output: out.text });
  console.log(`${c.id.padEnd(8)} ${g.route.padEnd(20)} ${g.reason}`);
}

// 分层统计转人工率
const byLayer = {};
for (const r of rows) {
  byLayer[r.layer] ??= { n: 0, human: 0 };
  byLayer[r.layer].n++;
  if (r.route === "human") byLayer[r.layer].human++;
}
console.log("\n分层转人工率：");
for (const [k, v] of Object.entries(byLayer)) {
  console.log(`  ${k.padEnd(10)} ${v.human}/${v.n}  ${((v.human / v.n) * 100).toFixed(0)}%`);
}
```

## 3.2 你要看到的四条结论

**① `hard` 层的转人工率应该明显高于 `typical`**

```text
typical    20-30%
boundary   40-60%
hard       60-80%     ← 这是对的，说明闸门在干活
reject     80-100%
```

**如果各层转人工率差不多（比如都是 30%），说明你的闸门没在区分，它在瞎判。**

**② `reject` 层应该接近 100% 转人工**

因为"该拒答"的输入本来就是"我不该回答"，转人工完全正确。

**③ 有 1–2 条 `typical` 被转人工 → 这是误杀**

去看它们：大概率是信号二误报（输出里写了个金额，输入里写的是中文数字"一千三"）。

**④ `signal 三` 的误报率会很高**

跑一次统计：`vague.dense` 命中的条目里，有多少条是判分器认为"没问题"的。

```text
如果 10 条命中里 8 条没问题 → 信号三的精度只有 20%，只配当"触发采样"的弱提示
```

## 3.3 一个必做的调整

**根据 3.2 的③，回去改信号二：**

```javascript
// 金额的中文数字也要能比
const CN_NUM = { 零:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10 };

function cnToNum(s) {
  // "一千三百八" → 1380 （够用的简化版，不追求全对）
  let r = 0, cur = 0;
  for (const ch of s) {
    if (CN_NUM[ch] !== undefined) cur = CN_NUM[ch];
    else if (ch === "百") { r += (cur || 1) * 100; cur = 0; }
    else if (ch === "千") { r += (cur || 1) * 1000; cur = 0; }
    else if (ch === "万") { r = (r + cur) * 10000; cur = 0; }
    else if (ch === "十") { r += (cur || 1) * 10; cur = 0; }
  }
  return r + cur;
}
```

**这一步看起来琐碎，但它把信号二的误报率从 30% 降到 10%。**

**规律：所有"抽取事实"的信号，80% 的误报来自"同一个事实的不同写法"。** 归一化做够，误报就下去了。

---

# 第 4 步：把闸门接进你的系统（20 分钟）

## 4.1 三个返回值，三种处理

```javascript
switch (result.route) {
  case "auto":
    // 直接返回，正常路径
    return output;

  case "auto_low_confidence":
    // 返回，但标记，进入抽检队列（第 131 节会用）
    return { ...output, _review: "sample" };

  case "human":
    // 不返回模型输出，返回"正在处理中"
    // 关键：绝不能把低置信的输出给用户
    return { status: "pending", message: "我们正在为您核实，预计 2 小时内回复" };
}
```

## 4.2 一个必须守住的原则

```text
转人工的时候，绝不要把模型的输出一起返回给用户。
```

**为什么？**

因为用户看到"正在核实，2 小时内回复"，会等。
用户看到"客户反馈商品破损（我正在核实）"，会直接拿去用了。

**而它可能就是那条编造"已确认为生产缺陷"的。**

**这个错误极其常见** —— 因为你觉得"给个草稿总比空白好"。不是。

## 4.3 转人工的响应文案，三条要求

```text
① 说清什么时候有结果（"2 小时内"）
② 不说"系统正在处理"（技术话术，用户不关心）
③ 给一个兜底联系方式（"急事请直接回复本消息"）
```

**别写"我们已收到您的反馈，会尽快处理"。** 这句话用户听过一万次，等于没说。

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **三种信号各自测出的转人工率**
- **编造漏过率从多少降到多少**
- **信号三的精度有多差**（这一步会让你放弃它当主判据）
- **1–2 条误杀的原因**

---

# 第 6 步：课后练习

## 练习一：给闸门加一条"重复检测"（20 分钟）

**同一个客户连续发三条消息，模型给了三个不同的 category。**

这本身就是信号 —— **上下文不足以支撑一个稳定判断。**

```text
实现思路：
① 按 session_id 分组（暂时用客户 ID + 10 分钟窗口）
② 同一组里，如果 category 变了两次以上
③ 整组标 review
```

**这条信号的价值：它抓的是"系统性不确定"，比单条采样更能反映真实问题。**

## 练习二：算清闸门的经济账（15 分钟）

```text
假设：
  1000 条/天
  转人工率 32%
  人工 1.5 分钟/条
  时薪 ¥100
  采样成本：命中 35% × 2 次额外调用 × ¥0.0095/次

问：闸门每月花多少钱？省下多少钱？
```

**参考答案框架：**

```text
闸门成本 = 采样额外费用 ≈ 1000 × 0.35 × 2 × 0.0095 × 30 = ¥200/月
人工成本 = 1000 × 0.32 × 1.5/60 × 100 × 30 = ¥24,000/月

没有闸门时（编造漏过率 23%）：
  那些编造被客户发现 → 客诉 → 每条客诉处理 20 分钟 + 可能的补偿
  按 5% 投诉率算：1000 × 0.23 × 0.05 × (20/60 × 100 + 50) × 30
  = 230 × 0.05 × 83 × 30 ≈ ¥28,635/月

结论：闸门花 ¥200 省 ¥4,635（人工转客诉的净差）
```

**注意这个算法里最脆弱的假设是"5% 投诉率"。** 把它标出来 —— 第 126 节教过，假设要写明。

## 练习三：判断这个设计错在哪（10 分钟）

```text
某人的方案：
  让模型在输出里加一个 "uncertainty" 字段，取值 0-100，
  然后 > 70 就转人工。

他说："我测了 50 条，效果不错。"
```

**错在哪？说出三条。**

**参考答案：**

```text
① 阈值方向搞反了（如果 0=确定、100=不确定，>70 转人工是对的；
   但如果是"confidence"语义，>70 应该自动返回）—— 说明定义都没写清
② 自报数值不可信 —— 50 条上"效果不错"是因为大部分条目它编得好
③ 没有和"真实编造"对照 —— 他说"效果不错"，但没说"漏过了几条编造"
④ 50 条太少，且大概率是他自己挑的
```

**第 ③ 条最致命。** "效果不错"是一个没法验证的说法，除非你能说出"拦住了 8 条，漏了 0 条"。

---

# 第 7 步：最终验收

## A. 三个信号都实现了

- [ ] `sample.js`：一致性采样，`temperature` 必须 > 0
- [ ] `inform.js`：事实落地检查，含中文数字归一化
- [ ] `vague.js`：空话密度（明确标注为弱信号）

## B. 闸门跑通

- [ ] `confidence.js` 级联生效：干净的条目只花 1 次调用
- [ ] 三个返回路径（auto / auto_low_confidence / human）都能走通
- [ ] 转人工时不返回模型输出

## C. 实测数据

- [ ] 分层转人工率：typical __% / boundary __% / hard __% / reject __%
- [ ] `hard` 层转人工率明显高于 `typical`（说明闸门在区分）
- [ ] 编造漏过率：基线 __% → 闸门后 __%
- [ ] 信号三的精度：命中 __ 条，正确 __ 条（__%）

## D. 误杀处理

- [ ] 找出了全部误杀条目
- [ ] 每一条都归了因（中文数字 / 同义词 / 真实核实）
- [ ] 至少修了一处归一化

## E. 提交

```bash
git add 每周课程/04-工程可靠性/第19周-可靠性与审核/第01节课 03-练习代码/reliable
git commit -m "第127节：置信度闸门，转人工率XX%，编造漏过从XX%降到XX%"
git push
```

---

## 本节课要能说出口的一句话

> **模型不会告诉你它不确定。你只能自己构造证据去证明它确定。**

三种信号没有一个来自模型的自我报告。

---

# 附：常见问题速查

**Q：一致性采样要 3 次，成本 3 倍，值吗？**

A：**只对"可疑"的条目跑 3 次，不值钱。** 你的信号二会命中 30–40%，所以平均成本是 1.7 倍，不是 3 倍。

**但如果你的信号二命中率超过 60%，说明它误报太多** —— 去修归一化，而不是加采样的次数。

**Q：`temperature: 0` 跑 3 次结果一样，能当"一致"吗？**

A：**不能。** `temperature=0` 时三次一样是必然的（或接近必然），你测出来的是"代码没 bug"，不是"模型有把握"。

**必须 `temperature > 0`，建议 0.7。** 这是本节最容易犯的错。

**Q：那如果 `temperature=0` 稳定，但 `0.7` 不稳定，说明什么？**

A：**说明这个判断在"刚好够"的边界上。** 模型不是不知道，是"差一点"。这类条目的正确行为是转人工，因为客户换个说法它就会错。

**Q：我的场景没有结构化字段（比如写文案），一致性采样怎么比？**

A：改用**语义相似度**。最简单可用的是"关键词集合的 Jaccard 相似度"：

```javascript
const jaccard = (a, b) => {
  const A = new Set(a.split(/\W+/).filter(Boolean));
  const B = new Set(b.split(/\W+/).filter(Boolean));
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter);
};
```

**三次两两算，平均 > 0.6 算一致。** 不如结构化字段准，但比没有强。

**Q：误杀会不会让用户觉得系统很笨？**

A：会。**但误杀的成本（用户多等 2 小时）远低于漏过编造的成本（用户当真了）。**

**误杀的修法是"改归一化"，不是"放宽阈值"。** 这两个动作方向完全相反。

**Q：闸门之后，转人工率 32% 是不是太高？**

A：**看你的人工产能。**

```text
1000 条/天 × 32% = 320 条/天 = 8 小时/天
如果你一个人做，这是满负荷 → 太高
如果你只是"抽查"其中 30%（因为大部分是简单确认），约 2.4 小时 → 可接受
```

**关键区别："转人工"不等于"逐条重写"。** 第 131 节会把队列分优先级，让 60% 的条目只花 10 秒确认。
