# 第 90 节课：回答引用来源

> 这节课结束时，你手上有：`rag-app\ask.js`（一条命令：问题进、带引用的答案出）、`rag-app\lib\prompt.js`（拼 prompt 的模板 + 引用格式）、`rag-app\lib\verify.js`（引用核查，能抓出"编造引用"）、`rag-app\out\ask-log.md`（10 个问答的完整记录 + 核查结果）。

**时间**：约 120 分钟
**前置**：第 89 节课的 `searchVector` / `searchKeyword`，`out\keyword-baseline.md`

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能检索：

```text
searchKeyword("报销 住宿")  →  1 条
searchVector("住的能报吗")  →  3 条
```

**你手上有"相关的几段文字"，但客户要的不是文字，是答案。**

## 0.2 今天这个坑长什么样

> 你把检索到的 3 块拼进 prompt，模型答得挺好：
>
> ```text
> 问：出差住宿超标了怎么办？
> 答：住宿费超标部分由员工自理，如因客户到访等特殊情况需要超标，
>     需提前申请部门负责人审批。 [1][2]
> ```
>
> 客户很满意。**三天后客户拿着这份答案去跟财务对，财务说"没有这条规定"。**
>
> 你回头查：
>
> ```text
> [1] 是"差旅报销制度 第 1 块"——里面只写了住宿标准，没写超标怎么办
> [2] 是"差旅报销制度 第 2 块"——里面写了报销流程，没写超标审批
>
> 那句话里的"需提前申请部门负责人审批"是从第 2 块的"经部门负责人审批"改的
> "特殊情况需要超标"是模型自己编的
> ```
>
> **模型给了引用，但引用的那两段里没有那个结论。**

**这就是 RAG 里最危险的一类错误：幻觉 + 假引用。**

**它比"没有引用"危险得多：**

```text
没有引用     → 客户知道要去核实
有引用       → 客户以为已经核实过了
```

**今天要解决的就是这一件事：让引用能真的被核对。**

## 0.3 为什么这个问题不能靠"换个更好的模型"解决

```text
模型的本质是"预测下一个词像什么"
给它两段不相干的材料，它也会顺着写出一段看似连贯的话
"引用 [1][2]" 是它学过的格式，它会照格式写，不管内容对不对

换更大的模型：
  → 编得更好、更像真的
  → 但不会"拒绝编造"
```

**唯一的解法是在代码里核查，不是在 prompt 里叮嘱。**

```text
✗ "请只根据资料回答，不要编造"    → 模型会照做 90%，剩下 10% 你发现不了
✓ 代码里核对"引用块里有没有这个结论"  → 100% 能查出来"引用块不含结论"
```

**注意：代码核查能查出"引用块里没有那个结论"，但查不出"结论对不对"。** 后者仍然要人。

## 0.4 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 引用标记（citation） | 答案里的 `[1]` `[2]`，指向具体是哪一块 | 第 1 步定格式 |
| 引用核查（citation verification） | 用代码检查"这个标记指向的块里，有没有支撑这句话的内容" | 第 4 步 |
| 拒答（abstention） | 资料里没有，就明说"资料里没有"，而不是编一个 | 第 3 步 |

## 0.5 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `lib\prompt.js` | `第06节课\03-练习代码\rag-app\` | 拼 prompt、定引用格式、解析答案 |
| `lib\verify.js` | 同上 | 引用核查（关键词覆盖率 + 数字比对） |
| `ask.js` | 同上 | 完整链路：检索 → 拼 prompt → 调模型 → 核查 → 输出 |
| `out\ask-log.md` | 同上 `out\` | 10 个问答 + 核查结果 |
| `NOTES.md` | `第06节课\02-笔记\` | 第 7 步填 |

---

# 第 1 步：先定引用的格式（20 分钟）

## 1.1 做什么 / 为什么

**做什么：** 在写 prompt 之前，先定死"答案里的引用长什么样"、"程序怎么解析它"。

**为什么格式要先定：**

因为**你要解析它。** 而模型输出的格式千奇百怪，如果你不约束：

```text
模型可能输出：
  ... 按标准报销 [1]。
  ... 按标准报销【1】。
  ... 按标准报销（来源1）。
  ... 按标准报销 [来源 1]。
  ... 按标准报销 [1][2], 另见 [3]。

→ 你要写五个正则去兼容
→ 而且永远会有第六种
```

**定死格式 = 让模型只能在你的格式里输出 = 你的正则只有一个。**

## 1.2 定下来的格式

```text
答案正文里，每个事实后面跟一个方括号数字：[1]
多个来源：[1][2]（不要写成 [1,2]）
正文之外，单独一个「依据」区块，列出每个编号对应的原文片段
```

**完整的输出模板：**

```text
住宿费超标部分由员工自理；如因客户到访等特殊情况需超标，
应提前提交申请并经部门负责人审批。[1][2]

【依据】
[1] 差旅报销制度 第 1 块：出差期间的住宿费按城市等级分档执行，超标部分由员工自理……
[2] 差旅报销制度 第 2 块：报销流程：出差前填写申请单，经部门负责人审批后……
```

**为什么"依据"区块要在正文之外：**

```text
如果让模型把原文抄进正文：
  → 它会改写、会截断、会合并
  → 你没法核对"它抄的是不是原文"

单独一个区块，而且原文由程序填（不是模型填）：
  → 100% 是原文
  → 才能做核查
```

**关键设计：`【依据】` 那部分由你的代码生成，不是模型生成。**

**这是整节课最重要的一个决定。** 让模型写引用 = 它可以编引用。**让代码写引用 = 引用一定是真的那块。**

## 1.3 操作

**1.** 进项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第13周-检索与RAG\第06节课\03-练习代码"
xcopy /E /I /Y "..\第05节课\03-练习代码\rag-app" rag-app
cd rag-app
```

**2.** 先看一眼之前的 `.env` 和检索能不能用：

```text
node search-keyword.js "报销 住宿"
node search-vector.js "住宿费标准"
```

两个都得有结果，再往下走。

**3.** 新建 `lib\prompt.js`：

```javascript
// prompt.js —— 拼 prompt + 定引用格式 + 解析模型输出

// ---------- 1. 拼检索片段 ----------
// 每个片段带编号，编号就是引用号
function formatContext(hits) {
  const lines = [];
  for (let i = 0; i < hits.length; i += 1) {
    const h = hits[i];
    const no = i + 1;
    // 原文里的换行会打乱编号结构，压成一个空格
    const body = String(h.text).replace(/\s+/g, " ").trim();
    lines.push("[" + no + "] 来源：" + h.doc_id + "（第 " + h.seq + " 块）");
    lines.push(body);
    lines.push("");
  }
  return lines.join("\n").trim();
}

// ---------- 2. system prompt ----------
const SYSTEM_PROMPT = [
  "你是公司内部制度问答助手。",
  "",
  "规则，按重要性排序：",
  "1. 只能使用【资料】里出现的内容回答。资料里没有的，直接回答「资料里没有相关规定」。",
  "2. 每一个事实性陈述后面必须跟引用编号，格式严格是方括号半角数字：[1]。多个来源写成 [1][2]。",
  "3. 不要写「依据」「来源」「参考」这类区块，程序会自动追加。",
  "4. 不要改写数字、金额、期限、部门名称。原文写「12 位」，不要写成「十二位」。",
  "5. 如果资料里有相互矛盾的说法，把两种都列出来，并各自标注引用。",
  "6. 回答不超过 200 字。",
  "",
  "输出只有两部分：一段答案正文，正文里带 [n] 引用标记。不要任何前言后语。",
].join("\n");

// ---------- 3. user prompt ----------
function buildUserPrompt(question, hits) {
  return [
    "【资料】",
    formatContext(hits),
    "",
    "【问题】",
    question,
    "",
    "请按规则回答，正文里带 [n] 引用标记。",
  ].join("\n");
}

// ---------- 4. 解析答案里的引用编号 ----------
// 只认 [1] [12] 这种，数字 1-99
function extractCitations(answer) {
  const re = /\[(\d{1,2})\]/g;
  const found = [];
  let m;
  while ((m = re.exec(answer)) !== null) {
    found.push(Number(m[1]));
  }
  // 去重并排序
  return [...new Set(found)].sort((a, b) => a - b);
}

// ---------- 5. 生成「依据」区块（由代码填，不是模型填）----------
function buildEvidenceBlock(hits, citedNumbers) {
  const lines = [];
  for (const no of citedNumbers) {
    const h = hits[no - 1];
    if (h === undefined) {
      lines.push("[" + no + "] （模型引用了不存在的编号，已标记为错误）");
      continue;
    }
    const body = String(h.text).replace(/\s+/g, " ").trim();
    lines.push("[" + no + "] " + h.doc_id + " 第 " + h.seq + " 块：" + body);
  }
  return lines.join("\n");
}

// ---------- 6. 清理模型可能加的区块 ----------
// 模型可能不听话，自己写了「依据：」，把它截掉
function stripModelEvidence(answer) {
  const markers = ["【依据】", "【来源】", "【参考】", "依据：", "来源：", "参考资料："];
  let out = answer;
  for (const mk of markers) {
    const idx = out.indexOf(mk);
    if (idx > 0) {
      out = out.slice(0, idx);
    }
  }
  return out.trim();
}

module.exports = {
  SYSTEM_PROMPT,
  formatContext,
  buildUserPrompt,
  extractCitations,
  buildEvidenceBlock,
  stripModelEvidence,
};
```

**4.** 新建 `tools\probe-prompt.js` 看看拼出来长什么样：

```javascript
// probe-prompt.js —— 只看拼出来的 prompt，不调模型
const { SYSTEM_PROMPT, buildUserPrompt, extractCitations, buildEvidenceBlock } = require("../lib/prompt");

const hits = [
  { doc_id: "差旅报销制度", seq: 1, text: "出差期间的住宿费按城市等级分档执行，超标部分由员工自理。\n一线城市上限 500 元/晚，其他城市 350 元/晚。" },
  { doc_id: "差旅报销制度", seq: 2, text: "报销流程：出差前填写申请单，经部门负责人审批后，凭发票和行程单在 15 个工作日内报销。" },
  { doc_id: "客户合同评审要点", seq: 1, text: "合同评审由法务部牵头，金额超过 50 万元的合同必须经总经理审批。" },
];

console.log("========== SYSTEM ==========");
console.log(SYSTEM_PROMPT);
console.log("");
console.log("========== USER ==========");
console.log(buildUserPrompt("出差住宿超标了怎么办？", hits));
console.log("");
console.log("========== 解析示例 ==========");
const fakeAnswer = "住宿费超标部分由员工自理。[1]如因特殊情况需超标，应提前提交申请并经部门负责人审批。[1][2]";
console.log("模型输出：" + fakeAnswer);
const cited = extractCitations(fakeAnswer);
console.log("解析出的编号：" + JSON.stringify(cited));
console.log("");
console.log("========== 代码生成的依据区块 ==========");
console.log(buildEvidenceBlock(hits, cited));
```

**5.** 跑：

```text
node tools\probe-prompt.js
```

## 1.4 屏幕上应该看到什么

```text
>node tools\probe-prompt.js
========== SYSTEM ==========
你是公司内部制度问答助手。

规则，按重要性排序：
1. 只能使用【资料】里出现的内容回答。资料里没有的，直接回答「资料里没有相关规定」。
2. 每一个事实性陈述后面必须跟引用编号，格式严格是方括号半角数字：[1]。多个来源写成 [1][2]。
3. 不要写「依据」「来源」「参考」这类区块，程序会自动追加。
...

========== USER ==========
【资料】
[1] 来源：差旅报销制度（第 1 块）
出差期间的住宿费按城市等级分档执行，超标部分由员工自理。 一线城市上限 500 元/晚，其他城市 350 元/晚。

[2] 来源：差旅报销制度（第 2 块）
报销流程：出差前填写申请单，经部门负责人审批后，凭发票和行程单在 15 个工作日内报销。

[3] 来源：客户合同评审要点（第 1 块）
合同评审由法务部牵头，金额超过 50 万元的合同必须经总经理审批。

【问题】
出差住宿超标了怎么办？

请按规则回答，正文里带 [n] 引用标记。

========== 解析示例 ==========
模型输出：住宿费超标部分由员工自理。[1]如因特殊情况需超标，应提前提交申请并经部门负责人审批。[1][2]
解析出的编号：[1,2]

========== 代码生成的依据区块 ==========
[1] 差旅报销制度 第 1 块：出差期间的住宿费按城市等级分档执行，超标部分由员工自理。 一线城市上限 500 元/晚，其他城市 350 元/晚。
[2] 差旅报销制度 第 2 块：报销流程：出差前填写申请单，经部门负责人审批后，凭发票和行程单在 15 个工作日内报销。
```

**五个必须注意的点：**

| 位置 | 现象 | 说明 |
|---|---|---|
| `【资料】` | 每块前面有 `[1] 来源：xxx` | **编号是程序加的，模型只能引用这些编号** |
| 原文换行 | 被压成空格 | 不压的话，编号和正文会错位 |
| 解析结果 | `[1,2]` 去重排序 | 模型写 `[1][2]`，也可能是 `[2][1][1]`，统一成 `[1,2]` |
| 依据区块 | 内容来自 `hits`，不是模型输出 | **这是真的原文** |
| `stripModelEvidence` | 还没演示 | 下一步会用到 |

**注意解析示例里的那句话："如因特殊情况需超标，应提前提交申请并经部门负责人审批。[1][2]"**

**这句话其实是模型编的！**

```text
[1] 里写的是"超标部分由员工自理"，没有"特殊情况"
[2] 里写的是"出差前填写申请单"，是出行前，不是超标前

模型把两块的内容拼接+改写了。
```

**这就是今天要抓的东西。** 第 4 步的核查会把它抓出来。

## 1.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `【资料】` 是空的 | `hits` 为空 | 先跑检索，确认有结果 |
| 原文里还有换行 | `replace(/\s+/g," ")` 没生效 | 检查正则 |
| 解析出 `[0]` | 模型写了 `[0]`（越界） | 核查时会标成错误编号 |
| `Cannot find module '../lib/prompt'` | 目录不对 | `mkdir lib`，文件放 `lib\` 下 |

---

# 第 2 步：调模型，跑通一条问答（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `ask.js`，把"检索 → 拼 prompt → 调模型 → 追加依据"串起来。

**为什么先跑通、不加核查：**

因为**你要先看到"不核查的情况下模型会怎么编"，才知道核查该抓什么。**

**如果你先写核查，你会按"想象的错误"设计规则，而不是按"真实的错误"。**

## 2.2 操作

**1.** 在 `.env` 里加上模型配置（如果第 6 周已经配过 `OPENAI_` 前缀的，直接用）：

```text
# 问答模型
# MOCK_LLM=true 时不调真模型，返回预设的假答案，用来跑通链路
MOCK_LLM=true

# 真模型
# MOCK_LLM=false
# OPENAI_BASE_URL=https://你的服务地址/v1
# OPENAI_API_KEY=sk-xxxxxxxx
# CHAT_MODEL=你账号里可用的模型名
```

**2.** 新建 `lib\llm.js`：

```javascript
// llm.js —— 调问答模型。MOCK_LLM=true 时返回假答案。
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

// 假答案故意包含两类问题：
//   ① 有引用但引用块里没有这个结论（幻觉+假引用）
//   ② 引用了不存在的编号 [9]
const FAKE_ANSWERS = {
  default:
    "住宿费超标部分由员工自理。[1]如因客户到访等特殊情况需要超标，应提前提交申请并经部门负责人审批。[1][2]",
  empty: "资料里没有相关规定。",
  badcite: "住宿费可以全额报销。[9]",
  noscite: "住宿费超标要自己承担。",
};

async function chat(system, user, options) {
  const opts = options === undefined ? {} : options;

  if ((process.env.MOCK_LLM || "true").toLowerCase() === "true") {
    const kind = opts.mockKind || "default";
    await new Promise((r) => setTimeout(r, 30));
    return {
      ok: true,
      content: FAKE_ANSWERS[kind] || FAKE_ANSWERS.default,
      mock: true,
      model: "mock",
    };
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.CHAT_MODEL;

  if (baseUrl === "" || apiKey === undefined || model === undefined) {
    throw new Error("缺少 OPENAI_BASE_URL / OPENAI_API_KEY / CHAT_MODEL");
  }

  const res = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs === undefined ? 60000 : opts.timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("问答接口失败 HTTP " + res.status + "：" + body.slice(0, 300));
  }

  const json = await res.json();
  const content = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : null;

  if (content === null) {
    throw new Error("返回结构不对：" + JSON.stringify(json).slice(0, 300));
  }

  return { ok: true, content: content, mock: false, model: model };
}

module.exports = { chat };
```

**3.** 新建 `ask.js`（先不带核查）：

```javascript
// ask.js —— 完整问答链路：检索 → prompt → 模型 → 追加依据
// 用法：node ask.js "出差住宿超标了怎么办"
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { searchKeyword } = require("./search-keyword");
const { searchVector } = require("./search-vector");
const { SYSTEM_PROMPT, buildUserPrompt, extractCitations, buildEvidenceBlock, stripModelEvidence } = require("./lib/prompt");
const { chat } = require("./lib/llm");

const MODE = process.env.RETRIEVE_MODE || "vector";

async function retrieve(question, limit) {
  if (MODE === "keyword") return searchKeyword(question, { limit: limit });
  if (MODE === "vector") return searchVector(question, { limit: limit });
  throw new Error("RETRIEVE_MODE 只能是 keyword 或 vector");
}

async function ask(question, options) {
  const opts = options === undefined ? {} : options;
  const topK = opts.topK === undefined ? 4 : opts.topK;

  // 1. 检索
  const r = await retrieve(question, topK);
  const hits = r.hits;

  if (hits.length === 0) {
    return {
      question: question,
      answer: "资料里没有相关规定。",
      cited: [],
      evidence: "",
      model: "-",
      mock: false,
      retrieveMode: MODE,
      hitCount: 0,
      refused: true,
    };
  }

  // 2. 拼 prompt
  const user = buildUserPrompt(question, hits);

  // 3. 调模型
  const res = await chat(SYSTEM_PROMPT, user, opts);

  // 4. 清理模型可能自带的「依据」区块
  const answer = stripModelEvidence(res.content);

  // 5. 解析引用编号（只保留在范围内的）
  const cited = extractCitations(answer);

  // 6. 代码生成依据区块
  const evidence = buildEvidenceBlock(hits, cited);

  return {
    question: question,
    answer: answer,
    cited: cited,
    evidence: evidence,
    model: res.model,
    mock: res.mock,
    retrieveMode: MODE,
    hitCount: hits.length,
    refused: answer.indexOf("资料里没有") >= 0,
    hits: hits,
  };
}

if (require.main === module) {
  const q = process.argv[2];
  if (q === undefined) {
    console.log("用法：node ask.js \"出差住宿超标了怎么办\"");
    process.exitCode = 1;
    return;
  }

  ask(q)
    .then((r) => {
      console.log("问：" + r.question);
      console.log("检索：" + r.retrieveMode + "，命中 " + r.hitCount + " 块");
      console.log("模型：" + r.model + (r.mock ? "（假答案）" : ""));
      console.log("");
      console.log("答：" + r.answer);
      console.log("");
      if (r.cited.length > 0) {
        console.log("【依据】");
        console.log(r.evidence);
      } else {
        console.log("（没有引用）");
      }
    })
    .catch((err) => {
      console.error("失败：" + err.message);
      process.exitCode = 1;
    });
}

module.exports = { ask };
```

**4.** 跑：

```text
node ask.js "出差住宿超标了怎么办"
```

## 2.3 屏幕上应该看到什么

```text
>node ask.js "出差住宿超标了怎么办"
问：出差住宿超标了怎么办
检索：vector，命中 4 块
模型：mock（假答案）

答：住宿费超标部分由员工自理。[1]如因客户到访等特殊情况需要超标，应提前提交申请并经部门负责人审批。[1][2]

【依据】
[1] 差旅报销制度 第 1 块：出差期间的住宿费按城市等级分档执行，超标部分由员工自理。 一线城市上限 500 元/晚，其他城市 350 元/晚。
[2] 差旅报销制度 第 2 块：报销流程：出差前填写申请单，经部门负责人审批后，凭发票和行程单在 15 个工作日内报销。
```

**现在把答案和依据对着读一遍。这就是你要养成的习惯：**

```text
答案第 1 句："住宿费超标部分由员工自理" + [1]
  依据 [1] 里："超标部分由员工自理"  ✓ 对得上

答案第 2 句："如因客户到访等特殊情况需要超标，应提前提交申请并经部门负责人审批" + [1][2]
  依据 [1]：只有"超标部分由员工自理"，没有"特殊情况可以超标"   ✗ 编的
  依据 [2]：写的是"出差前填写申请单，经部门负责人审批" —— 是出行前，不是超标前   ✗ 拼的
```

**一个真、一个假。而两个都带引用标记。**

**如果客户只看"有 [1][2]"，他会以为都核实过了。这就是今天要解决的问题。**

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `命中 0 块` | 检索没结果 | 先单独跑 `search-vector.js` 确认 |
| `MOCK_LLM` 没生效 | `.env` 路径不对 | `dotenv` 的 `path` 指向正确位置 |
| 答案里有 `【依据】` 两遍 | `stripModelEvidence` 没生效 | 检查标记列表里有没有模型用的那个词 |
| `缺少 OPENAI_BASE_URL` | 想用真模型但没填 | 补 `.env`，或先 `MOCK_LLM=true` |
| 答案为空字符串 | 模型返回了空 | 加一条检查：`if (answer.trim()==="") throw` |

## 2.5 关于 `temperature: 0`

**这一行不是随便写的。**

```text
temperature > 0 → 同样的输入，每次输出不同
temperature = 0 → 尽量让输出确定

对一个"制度问答"的场景：
  同样的问，每次答案不一样 → 客户会怀疑
  而且你没法复现 bug
```

**但要注意：`temperature: 0` 不等于完全确定。**

```text
浮点误差、批处理、模型版本更新，都会让输出变化
所以你的评测必须记录"这次跑出来的原始输出"，不能只记"通过了"
```

---

# 第 3 步：让它学会拒答（20 分钟）

## 3.1 做什么 / 为什么

**做什么：** 加一条"检索结果不够相关就拒答"的判断。

**为什么必须有这一步：**

```text
用户问："公司年会什么时候办"
你的库里全是制度文档，没有年会安排

不拒答的后果：
  向量检索还是会返回 top-4（因为总有"最相关"的）
  模型拿着这 4 块（讲报销、讲密码）硬答
  → 编出一个"年会安排在 12 月"的答案
```

**这就是"检索永远有结果"的陷阱。**

```text
top-k 永远返回 k 条，即使全都无关
因为"最相关"不等于"相关"
```

## 3.2 阈值怎么定

**这是向量检索相对 bm25 的一个真实优势：分数有统一基线。**

第 88 节你测过：

```text
256 维随机基线：|cos| ≈ 0.05
1536 维随机基线：|cos| ≈ 0.02
```

**所以"高于随机基线多少"是有意义的。**

**实践中的做法：**

| 方法 | 怎么定 | 优点 | 缺点 |
|---|---|---|---|
| 固定阈值 | 比如 `score > 0.35` | 简单 | 换模型/换语料就失效 |
| 相对阈值 | `score > top1 * 0.8` | 自适应 | top1 本身可能是垃圾 |
| 两者结合 | `score > 0.3` **且** `score > top1 * 0.75` | 最稳 | 要调两个数 |

**本课程用"固定阈值 + 至少留 1 条"的策略，并且把这个数写进配置，方便以后改。**

## 3.3 操作

微调 `ask.js` 的 `ask()`：

```javascript
async function ask(question, options) {
  const opts = options === undefined ? {} : options;
  const topK = opts.topK === undefined ? 4 : opts.topK;
  const minScore = opts.minScore === undefined
    ? Number(process.env.MIN_SCORE || 0.3)
    : opts.minScore;

  const r = await retrieve(question, topK);

  // 按分数过滤。注意 keyword 和 vector 的分数方向相反。
  let hits;
  let dropped = 0;

  if (MODE === "vector") {
    // 余弦：越大越相关
    hits = r.hits.filter((h) => h.score >= minScore);
    dropped = r.hits.length - hits.length;
  } else {
    // bm25：越负越相关。这里不设绝对阈值（第 87 节讲过原因），
    // 只保留"分数在最好那条 3 倍以内"的
    if (r.hits.length === 0) {
      hits = [];
    } else {
      const best = r.hits[0].score;
      hits = r.hits.filter((h) => h.score <= best * 3);
      dropped = r.hits.length - hits.length;
    }
  }

  if (hits.length === 0) {
    return {
      question: question,
      answer: "资料里没有相关规定。",
      cited: [],
      evidence: "",
      model: "-",
      mock: false,
      retrieveMode: MODE,
      hitCount: 0,
      dropped: dropped,
      refused: true,
      refuseReason: "所有检索结果都低于相关度阈值 " + minScore,
      hits: r.hits,
    };
  }

  const user = buildUserPrompt(question, hits);
  const res = await chat(SYSTEM_PROMPT, user, opts);
  const answer = stripModelEvidence(res.content);
  const cited = extractCitations(answer);
  const evidence = buildEvidenceBlock(hits, cited);

  return {
    question: question,
    answer: answer,
    cited: cited,
    evidence: evidence,
    model: res.model,
    mock: res.mock,
    retrieveMode: MODE,
    hitCount: hits.length,
    dropped: dropped,
    refused: answer.indexOf("资料里没有") >= 0,
    hits: hits,
  };
}
```

**`ask.js` 的命令行输出也要改，把"过滤掉几条"打出来：**

```javascript
      console.log("检索：" + r.retrieveMode + "，命中 " + (r.hitCount + (r.dropped || 0)) +
        " 块，过滤后留 " + r.hitCount + " 块" +
        (r.dropped > 0 ? "（丢掉 " + r.dropped + " 条低分）" : ""));
      if (r.refused) {
        console.log("拒答原因：" + (r.refuseReason || "模型判断资料里没有"));
      }
```

## 3.4 屏幕上应该看到什么

有关系的问题：

```text
>node ask.js "出差住宿超标了怎么办"
问：出差住宿超标了怎么办
检索：vector，命中 4 块，过滤后留 3 块（丢掉 1 条低分）
模型：mock（假答案）

答：住宿费超标部分由员工自理。[1]如因客户到访等特殊情况需要超标，应提前提交申请并经部门负责人审批。[1][2]

【依据】
[1] 差旅报销制度 第 1 块：...
[2] 差旅报销制度 第 2 块：...
```

无关的问题：

```text
>node ask.js "公司年会什么时候办"
问：公司年会什么时候办
检索：vector，命中 4 块，过滤后留 0 块（丢掉 4 条低分）
模型：-
拒答原因：所有检索结果都低于相关度阈值 0.3

答：资料里没有相关规定。

（没有引用）
```

**注意两条的关系：**

```text
有关的问题：命中 4 → 留 3
无关的问题：命中 4 → 留 0
```

**"命中"永远是 4（因为 topK=4），"留"才是真实的相关数。**

**如果你只报"命中"，你会以为所有问题都有资料。** 这就是为什么输出里要分开写。

**如果 `MOCK_LLM=true`，你跑的这条问句其实是假答案 —— 它不会真的拒答。** 拒答的判断在代码里（`hits.length === 0`），跟模型无关。**这就是"拒答应该是代码的事，不是模型的事"的一个例子。**

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 有关系的问题也被拒答 | 阈值太高 | 打印真实分数，把 `MIN_SCORE` 调到合适位置 |
| 无关的问题不拒答 | 阈值太低 | 同上 |
| `dropped` 是 `undefined` | 输出代码没加 `\|\| 0` | 补上 |
| keyword 模式全被过滤 | `best * 3` 写成了 `best / 3` | 注意 bm25 是负数，方向容易反 |

**最后一条要特别试一次。** `best = -2.0`：

```text
best * 3 = -6.0    → 保留 score <= -6.0 的？不对，那是"更相关"的
best / 3 = -0.67   → 保留 score <= -0.67 的？也不对

正确的是：保留 |score| 在 |best| 的 1/3 以内的
即 score <= best / 3   （因为负数，除以 3 后更接近 0）
   best=-2.0, best/3=-0.67
   保留 score <= -0.67  → 也就是 -2.0, -1.5, -0.8 ... 直到 -0.67
   → 把 -0.5（更不相关）排除了 ✓
```

**这个推导一定要自己在纸上过一遍，否则你一定会写反。**

---

# 第 4 步：写核查（30 分钟）

## 4.1 做什么 / 为什么

**做什么：** 写 `lib\verify.js`，对每一句带引用的话，检查"引用块里有没有支撑它的内容"。

**先说清楚它能做什么、不能做什么：**

| 能查出来 | 查不出来 |
|---|---|
| 引用了不存在的编号（`[9]` 但只有 4 块） | 引用块里有那几个词，但意思被曲解了 |
| 引用块里完全没有答案里的关键词 | 答案里的数字改了但恰好块里也有别的数字 |
| 答案里的数字在引用块里找不到 | 结论对，但引用的块不是最合适的那个 |
| 答案说了否定，引用块里没有否定词 | 多个块拼起来的结论是否正确 |

**一句话：它是"关键词 + 数字"层面的核对，不是语义核对。**

**这听起来很弱，但它能抓住 80% 的编造。**

**为什么能抓住 80%：**

```text
模型编造时，通常会把"相关块里的词"重新组合
→ 有些词在原块里有，有些没有
→ "有没有"这个判断，关键词覆盖率就能给出信号

而真正抄自原文的句子，关键词覆盖率通常很高
```

## 4.2 三个核查指标

| 指标 | 怎么算 | 阈值 | 抓什么 |
|---|---|---|---|
| **编号越界** | `cited` 里有大于 `hits.length` 的 | 一个都不能有 | 模型编了个 `[9]` |
| **关键词覆盖率** | 这句话里的实词，有多少出现在引用的块里 | < 0.6 报警 | 编造/拼接 |
| **数字一致** | 这句话里的数字，是否都出现在引用的块里 | 全部都要有 | 金额/期限被改 |

**为什么阈值定 0.6：**

```text
太严（0.9）→ 正常改写也会报警（模型会把"由员工自理"改写成"员工自己承担"）
太松（0.3）→ 什么都抓不住
0.6 是一个起点，你必须在自己的语料上调
```

**这个数字没有普适答案。** 你在笔记里要写清"我为什么选这个数"。

## 4.3 操作

新建 `lib\verify.js`：

```javascript
// verify.js —— 引用核查
// 三个指标：编号越界 / 关键词覆盖率 / 数字一致
// 注意：这是"字面核对"，不是语义核对。它只能抓"编造和拼接"，抓不住"曲解"。

// 中文停用词：这些词在不在，不说明任何问题
const STOP = new Set([
  "的", "了", "是", "在", "和", "与", "或", "及", "等", "对", "为", "从", "到", "被",
  "把", "将", "有", "没有", "不", "也", "都", "就", "而", "但", "如果", "如", "则",
  "这", "那", "其", "之", "上", "下", "中", "内", "外", "后", "前", "时", "按", "应",
  "可", "以", "需要", "必须", "进行", "一个", "一种", "并", "且", "还", "又", "很",
  "会", "能", "要", "该", "此", "本", "些", "个", "元", "年", "月", "日", "个工作日",
]);

// 把一句中文切成"实词"。这里用 2-gram + 单字过滤的土办法，够用。
function terms(text) {
  const clean = String(text).replace(/[^\u4e00-\u9fa5A-Za-z0-9.]/g, " ");
  const out = new Set();

  // 英文和数字整体算一个词
  for (const w of clean.match(/[A-Za-z]+|\d+(?:\.\d+)?/g) || []) {
    out.add(w.toLowerCase());
  }

  // 汉字：相邻两字一组
  const cjk = (clean.match(/[\u4e00-\u9fa5]+/g) || []).join("");
  for (let i = 0; i + 1 < cjk.length; i += 1) {
    const g = cjk.slice(i, i + 2);
    if (STOP.has(g)) continue;
    if (STOP.has(g[0]) && STOP.has(g[1])) continue;
    out.add(g);
  }
  return [...out];
}

// 抽出数字（含小数、百分号前的数）
function numbers(text) {
  const out = [];
  for (const m of String(text).match(/\d+(?:\.\d+)?/g) || []) {
    out.push(m);
  }
  return [...new Set(out)];
}

// 把答案按引用标记切成"句子 + 它的引用编号"
// 例："超标自理。[1]特殊情况需审批。[1][2]"
//   → [{ text: "超标自理。", cites: [1] }, { text: "特殊情况需审批。", cites: [1,2] }]
function splitByCitation(answer) {
  const pieces = [];
  const re = /([^\[\]]+?)((?:\[\d{1,2}\])+)/g;
  let m;
  let lastEnd = 0;
  let pendingText = "";

  while ((m = re.exec(answer)) !== null) {
    pendingText += m[1];
    const cites = [];
    for (const c of m[2].match(/\d{1,2}/g) || []) cites.push(Number(c));
    pieces.push({ text: pendingText.trim(), cites: cites });
    pendingText = "";
    lastEnd = re.lastIndex;
  }

  // 尾巴：最后一个引用之后的文字（没有引用）
  const tail = answer.slice(lastEnd).trim();
  if (tail.length > 0) {
    pieces.push({ text: tail, cites: [] });
  }

  return pieces.filter((p) => p.text.length > 0);
}

function verifyCitation(answer, hits, options) {
  const opts = options === undefined ? {} : options;
  const minCoverage = opts.minCoverage === undefined ? 0.6 : opts.minCoverage;

  const pieces = splitByCitation(answer);
  const problems = [];

  // 1. 编号越界
  const allCites = [];
  for (const p of pieces) for (const c of p.cites) allCites.push(c);
  const uniq = [...new Set(allCites)].sort((a, b) => a - b);
  for (const c of uniq) {
    if (c < 1 || c > hits.length) {
      problems.push({
        kind: "OUT_OF_RANGE",
        severity: "high",
        cite: c,
        message: "引用了不存在的编号 [" + c + "]，本次只有 " + hits.length + " 块",
      });
    }
  }

  // 2. 逐句检查
  const details = [];

  for (const p of pieces) {
    if (p.cites.length === 0) {
      // 没有引用的句子：只记录，不算错误（可能是"资料里没有相关规定"这类）
      details.push({ text: p.text, cites: [], coverage: null, missingTerms: [], missingNumbers: [], ok: null });
      continue;
    }

    // 拼出这句引用到的所有块的原文
    const citedTexts = [];
    for (const c of p.cites) {
      if (c >= 1 && c <= hits.length) {
        citedTexts.push(hits[c - 1].text);
      }
    }
    const pool = citedTexts.join(" ");

    // 2a. 关键词覆盖率
    const ts = terms(p.text);
    const poolTerms = new Set(terms(pool));
    const missing = ts.filter((t) => !poolTerms.has(t));
    const coverage = ts.length === 0 ? 1 : (ts.length - missing.length) / ts.length;

    // 2b. 数字一致
    const ns = numbers(p.text);
    const poolNums = new Set(numbers(pool));
    const missingNums = ns.filter((n) => !poolNums.has(n));

    const ok = coverage >= minCoverage && missingNums.length === 0;

    details.push({
      text: p.text,
      cites: p.cites,
      coverage: coverage,
      missingTerms: missing.slice(0, 8),
      missingNumbers: missingNums,
      ok: ok,
    });

    if (!ok) {
      const reasons = [];
      if (coverage < minCoverage) {
        reasons.push("关键词覆盖率 " + (coverage * 100).toFixed(0) + "% < " + (minCoverage * 100) + "%");
      }
      if (missingNums.length > 0) {
        reasons.push("数字找不到：" + missingNums.join(", "));
      }
      problems.push({
        kind: "UNSUPPORTED",
        severity: "high",
        cite: p.cites,
        message: "这句话的引用不足以支撑：" + reasons.join("；"),
        text: p.text,
        missingTerms: missing.slice(0, 8),
        coverage: coverage,
      });
    }
  }

  // 3. 整段答案一个字引用都没有
  if (uniq.length === 0 && answer.indexOf("资料里没有") < 0) {
    problems.push({
      kind: "NO_CITATION",
      severity: "medium",
      cite: null,
      message: "答案里没有任何引用标记",
    });
  }

  return {
    ok: problems.filter((p) => p.severity === "high").length === 0,
    problems: problems,
    details: details,
    citedNumbers: uniq,
  };
}

module.exports = { verifyCitation, terms, numbers, splitByCitation, STOP };
```

**注意 `STOP` 里有一个错误：`"个工作日"` 是四个字，放在单字停用词集合里没有意义（匹配不上单字和二字的 2-gram）。**

**这是故意的，让你看到"停用词表里的词长度和匹配粒度不匹配"这个常见错误。** 它不会报错，只是不起作用。**你发现了吗？**

**4.** 把核查接进 `ask.js`：

```javascript
const { verifyCitation } = require("./lib/verify");

// ... ask() 里，answer 和 evidence 都拿到之后：
  const verify = verifyCitation(answer, hits, { minCoverage: Number(process.env.MIN_COVERAGE || 0.6) });

  return {
    // ...
    verify: verify,
  };
```

命令行输出加一段：

```javascript
      console.log("");
      if (r.verify !== undefined) {
        console.log("=== 引用核查 ===");
        console.log("结论：" + (r.verify.ok ? "通过" : "有问题"));
        if (r.verify.problems.length === 0) {
          console.log("  没有发现问题");
        } else {
          for (const p of r.verify.problems) {
            console.log("  [" + p.severity + "] " + p.kind + "：" + p.message);
            if (p.text !== undefined) console.log("        原句：" + p.text);
          }
        }
      }
```

**5.** 跑：

```text
node ask.js "出差住宿超标了怎么办"
```

## 4.4 屏幕上应该看到什么

```text
>node ask.js "出差住宿超标了怎么办"
问：出差住宿超标了怎么办
检索：vector，命中 4 块，过滤后留 3 块（丢掉 1 条低分）
模型：mock（假答案）

答：住宿费超标部分由员工自理。[1]如因客户到访等特殊情况需要超标，应提前提交申请并经部门负责人审批。[1][2]

【依据】
[1] 差旅报销制度 第 1 块：出差期间的住宿费按城市等级分档执行，超标部分由员工自理。 一线城市上限 500 元/晚，其他城市 350 元/晚。
[2] 差旅报销制度 第 2 块：报销流程：出差前填写申请单，经部门负责人审批后，凭发票和行程单在 15 个工作日内报销。

=== 引用核查 ===
结论：有问题
  [high] UNSUPPORTED：这句话的引用不足以支撑：关键词覆盖率 33% < 60%
        原句：如因客户到访等特殊情况需要超标，应提前提交申请并经部门负责人审批。
```

**抓到了。**

**注意"关键词覆盖率 33%"。** 这一句里有三个实词在引用块里找不到：

```text
"客户到访"    → 两块里都没有
"特殊情况"    → 两块里都没有
"提前提交"    → 第 2 块是"出差前填写"，不是"提前提交"
```

**而第一句"住宿费超标部分由员工自理"是通过的**（覆盖率 100%，因为原句几乎照抄）。

**这就是核查的价值：它区分了"抄来的"和"编造的"。**

**再看另外两种假答案：**

```text
>node ask.js "住宿能不能全额报销"    （用 mockKind=badcite）
答：住宿费可以全额报销。[9]

=== 引用核查 ===
结论：有问题
  [high] OUT_OF_RANGE：引用了不存在的编号 [9]，本次只有 4 块
  [medium] 没有其他问题
```

```text
>node ask.js "住宿能不能全额报销"    （用 mockKind=noscite）
答：住宿费超标要自己承担。

=== 引用核查 ===
结论：有问题
  [medium] NO_CITATION：答案里没有任何引用标记
```

**三种错误，三种信号：**

| 错误 | 信号 | severity |
|---|---|---|
| 编造/拼接 | `UNSUPPORTED` + 覆盖率低 | high |
| 引用不存在 | `OUT_OF_RANGE` | high |
| 完全没引用 | `NO_CITATION` | medium |

**为什么 `NO_CITATION` 是 medium 而不是 high：**

```text
"资料里没有相关规定" —— 这种答案本来就不该有引用
所以"没引用"不一定是错
但如果答案说了实质内容却没引用，那就是问题
```

**真实的实现里应该再细分：如果答案不是拒答、且长度超过 20 字、且没有引用 → high。**

**这一条留给你在练习里补。**

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 覆盖率永远是 1.0 | `terms` 返回空（全是停用词） | 打印 `ts.length` |
| 覆盖率永远很低 | 你的 `terms` 切得太碎 | 用 2-gram，不要单字 |
| 正常的改写也报警 | `minCoverage` 太高 | 降到 0.5 试试，记录不同值的效果 |
| `splitByCitation` 切错 | 引用后面还有标点或其他格式 | 打印 `pieces` 看 |
| 数字检查永远通过 | `numbers` 没抽到 | 检查正则 |
| 数字检查老是失败 | 原文写"500 元"，答案写"500元" | 两者的数字都是 `500`，应该能对上 |
| `[1,2]` 格式没解析 | 你只认 `[1][2]` | 用 `splitByCitation` 的正则统一处理 |

**最后一条：第 1 步的 prompt 里明确要求 `[1][2]` 不要写 `[1,2]`，但模型可能不听话。**

**`splitByCitation` 的正则 `/\[(\d{1,2})\]/g` 只认单个数，`[1,2]` 会整块匹配不上。** 所以**"模型不听话"的时候你会静默得到"没有引用"。**

**这是一个真实的坑：约束了格式，但没做容错，于是模型的轻微偏离会变成"零引用"。**

**修法：先做一次归一化。**

```javascript
// 在 verifyCitation 开头加
const normalized = String(answer).replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})+)\]/g, (m, inner) => {
  return inner.split(/\s*,\s*/).map((n) => "[" + n + "]").join("");
});
```

---

# 第 5 步：跑十个问题，把结果记下来（20 分钟）

## 5.1 做什么 / 为什么

**做什么：** 写 `tools\ask-batch.js`，跑 10 个问题，生成 `out\ask-log.md`。

**为什么必须批量跑：**

```text
单个问题看不出规律。
你可能正好碰到了模型答得好的那一个。

10 个问题跑下来，你会看到：
  哪类问题模型稳定编造
  哪类问题核查稳定报警
  哪类问题根本检索不到
```

**这就是"评测"的最小形态。** 第 18 周会专门讲评测，今天先做最基础的版本。

## 5.2 十个问题的设计

**必须覆盖五类，每类两个：**

| 类型 | 目的 | 例子 |
|---|---|---|
| 能答 | 验证正常链路 | "住宿费上限是多少" |
| 能答但要拼接 | 验证多块引用 | "出差报销要走什么流程、多久内报" |
| 资料里没有 | 验证拒答 | "公司年会什么时候办" |
| 同义词提问 | 验证向量检索的价值 | "住的能报多少钱" |
| 边界/否定 | 验证已知弱点 | "什么情况不能报销" |

**第 5 类是你的"已知弱点"** —— 你预期它会出问题。**把预期写下来，再看实际，这才是评测。**

## 5.3 操作

新建 `tools\ask-batch.js`：

```javascript
// ask-batch.js —— 跑 10 个问题，生成 ask-log.md
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const { ask } = require("../ask");

const CASES = [
  { id: 1, type: "能答", q: "住宿费上限是多少", expect: "应该引用到住宿标准那一块，且给出具体金额" },
  { id: 2, type: "能答", q: "密码长度要求几位", expect: "应该引用到信息安全那一块，给出具体位数" },
  { id: 3, type: "拼接", q: "出差报销要走什么流程、多久内要报", expect: "可能需要两块：流程 + 时限" },
  { id: 4, type: "拼接", q: "超标了要谁批、报的时候带什么", expect: "超标审批 + 报销材料，可能跨块" },
  { id: 5, type: "无资料", q: "公司年会什么时候办", expect: "必须拒答" },
  { id: 6, type: "无资料", q: "食堂几点开饭", expect: "必须拒答" },
  { id: 7, type: "同义词", q: "住的能报多少钱", expect: "向量检索应该能命中住宿标准" },
  { id: 8, type: "同义词", q: "出差花销有上限吗", expect: "向量检索应该能命中费用标准" },
  { id: 9, type: "边界", q: "什么情况不能报销", expect: "已知弱点：容易返回'可以报销'的内容" },
  { id: 10, type: "边界", q: "哪些东西不得外发", expect: "已知弱点：否定条件容易漏" },
];

async function main() {
  const results = [];

  for (const c of CASES) {
    console.log("");
    console.log("[" + c.id + "/" + CASES.length + "] " + c.q);
    let r;
    try {
      r = await ask(c.q);
    } catch (err) {
      r = { error: err.message, question: c.q };
    }
    results.push({ case: c, result: r });
    console.log("  答：" + (r.error === undefined ? r.answer.slice(0, 60) : "ERROR " + r.error));
    if (r.verify !== undefined) {
      console.log("  核查：" + (r.verify.ok ? "通过" : "有问题（" + r.verify.problems.length + " 项）"));
    }
  }

  // ---------- 统计 ----------
  const stat = {
    total: results.length,
    refused: 0,
    verifyOk: 0,
    verifyFail: 0,
    error: 0,
    byType: {},
  };

  for (const x of results) {
    const t = x.case.type;
    if (stat.byType[t] === undefined) stat.byType[t] = { n: 0, refused: 0, verifyFail: 0 };
    stat.byType[t].n += 1;

    if (x.result.error !== undefined) { stat.error += 1; continue; }
    if (x.result.refused) { stat.refused += 1; stat.byType[t].refused += 1; }
    if (x.result.verify !== undefined) {
      if (x.result.verify.ok) stat.verifyOk += 1;
      else { stat.verifyFail += 1; stat.byType[t].verifyFail += 1; }
    }
  }

  // ---------- 写 markdown ----------
  const outDir = path.join(__dirname, "..", "out");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const L = [];
  L.push("# 问答记录");
  L.push("");
  L.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
  L.push("检索模式：" + (process.env.RETRIEVE_MODE || "vector"));
  L.push("模型：" + (process.env.MOCK_LLM === "false" ? (process.env.CHAT_MODEL || "-") : "mock"));
  L.push("相关度阈值：" + (process.env.MIN_SCORE || 0.3));
  L.push("覆盖率阈值：" + (process.env.MIN_COVERAGE || 0.6));
  L.push("");

  L.push("## 一、汇总");
  L.push("");
  L.push("| 指标 | 数值 |");
  L.push("|---|---|");
  L.push("| 问题数 | " + stat.total + " |");
  L.push("| 拒答 | " + stat.refused + " |");
  L.push("| 核查通过 | " + stat.verifyOk + " |");
  L.push("| 核查报警 | " + stat.verifyFail + " |");
  L.push("| 调用失败 | " + stat.error + " |");
  L.push("");

  L.push("### 按类型");
  L.push("");
  L.push("| 类型 | 题数 | 拒答 | 核查报警 |");
  L.push("|---|---|---|---|");
  for (const k of Object.keys(stat.byType)) {
    const v = stat.byType[k];
    L.push("| " + k + " | " + v.n + " | " + v.refused + " | " + v.verifyFail + " |");
  }
  L.push("");

  L.push("## 二、逐题");
  L.push("");
  for (const x of results) {
    const r = x.result;
    L.push("### " + x.case.id + ". [" + x.case.type + "] " + x.case.q);
    L.push("");
    L.push("预期：" + x.case.expect);
    L.push("");
    if (r.error !== undefined) {
      L.push("**调用失败**：" + r.error);
      L.push("");
      continue;
    }
    L.push("检索命中的块数：" + (r.hitCount + (r.dropped || 0)) + "，过滤后：" + r.hitCount);
    if (r.refused) L.push("**拒答**" + (r.refuseReason ? "（" + r.refuseReason + "）" : ""));
    L.push("");
    L.push("答案：");
    L.push("");
    L.push("```text");
    L.push(r.answer);
    L.push("```");
    L.push("");
    if (r.cited.length > 0) {
      L.push("引用编号：" + r.cited.join(", "));
      L.push("");
      L.push("依据（代码生成）：");
      L.push("");
      L.push("```text");
      L.push(r.evidence);
      L.push("```");
      L.push("");
    }
    if (r.verify !== undefined) {
      L.push("核查结论：**" + (r.verify.ok ? "通过" : "有问题") + "**");
      if (r.verify.problems.length > 0) {
        L.push("");
        L.push("| 严重度 | 类型 | 说明 |");
        L.push("|---|---|---|");
        for (const p of r.verify.problems) {
          L.push("| " + p.severity + " | " + p.kind + " | " + p.message.replace(/\|/g, "\\|") + " |");
        }
      }
      L.push("");
    }
  }

  L.push("## 三、我的观察");
  L.push("");
  L.push("（见第 7 步笔记）");
  L.push("");

  const outPath = path.join(outDir, "ask-log.md");
  fs.writeFileSync(outPath, L.join("\n"), "utf8");
  console.log("");
  console.log("已写入：" + outPath);
  console.log("拒答 " + stat.refused + " / 核查通过 " + stat.verifyOk + " / 报警 " + stat.verifyFail + " / 失败 " + stat.error);
}

main().catch((err) => {
  console.error("批处理失败：" + err.message);
  process.exitCode = 1;
});
```

```text
node tools\ask-batch.js
```

## 5.4 屏幕上应该看到什么

```text
>node tools\ask-batch.js

[1/10] 住宿费上限是多少
  答：住宿费超标部分由员工自理。[1]如因客户到访等特殊情况需要超标，应提前提交申请并经部门负责人审批。[1][2]
  核查：有问题（1 项）

[2/10] 密码长度要求几位
  答：住宿费超标部分由员工自理。[1]...
  核查：有问题（1 项）

[5/10] 公司年会什么时候办
  答：资料里没有相关规定。
  核查：通过

[7/10] 住的能报多少钱
  答：住宿费超标部分由员工自理。[1]...
  核查：有问题（1 项）

...

已写入：B:\...\rag-app\out\ask-log.md
拒答 2 / 核查通过 4 / 报警 4 / 失败 0
```

**注意：所有非拒答的问题，答案都一样。**

**因为 `MOCK_LLM=true`，模型的"答案"是写死的假答案。** 这不是 bug，是假模型的性质。

**这说明一件事：假模型能验证管道（检索、拼 prompt、解析引用、核查、写报告），但不能验证答案质量。**

**要看真实质量，把 `MOCK_LLM=false` 跑一次。**

**那一遍的结果才是你的真实基线。** 并且它不会花钱太多 —— 10 次问答，每次 4 块、约 2000 token 输入，总共几万 token。

## 5.5 记下四个关键数字

跑完之后，你的笔记里必须有这四个数：

```text
① 拒答数 / 10        → 拒答应答的 2 题都拒了对吗？有没有误拒？
② 核查通过 / 非拒答   → 假答案的通过率一定很低，这是预期的
③ 同义题是否命中     → 第 7、8 题，向量检索的价值在这里体现
④ 边界题表现         → 第 9、10 题，这是你已知的弱点，记录实际表现
```

**第 ② 项在真模型下会显著不同。** 这是你必须跑一次真模型的原因。

## 5.6 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 全部拒答 | `MIN_SCORE` 太高 | 打印真实分数 |
| 全部不拒答 | 阈值太低，或 `MIN_SCORE` 没读到 | 打印 `process.env.MIN_SCORE` |
| 所有答案都一样 | `MOCK_LLM=true` | 正常，改 `false` 看真的 |
| 写文件失败 | `out` 目录 | 代码里已建 |
| 中文乱码 | cmd 编码 | `chcp 65001` |

---

# 第 6 步：故意犯四个错（20 分钟）

## 错误 1：让模型写引用区块

```javascript
// 错误写法：让模型自己输出依据
const user = "【资料】...【问题】...\n请回答，并在最后列出你引用的原文。";
```

**现象：** 模型的输出看起来很好，有答案有"依据"。

**真正的伤害：**

```text
模型会"改写"原文来当依据
  "超标部分由员工自理"    →  它写成  "超过标准的费用需自行承担"
  "经部门负责人审批"       →  它写成  "需经上级领导批准"

→ 依据看起来是真的，但和原文不完全一致
→ 客户拿这个去对，会发现"原文没有这句话"
→ 而且你没法核查，因为你不知道哪部分是"原文"
```

**正确做法：** 依据区块由代码从 `hits` 里取，模型只负责正文和编号。

**判断口诀：**

```text
能让程序算出来的，不要让模型"生成"
引用原文这种事，程序一秒就能做对，模型百分之一百会改
```

## 错误 2：不做核查，只看答案像不像

```javascript
// 很多人到这一步就交付了
console.log(answer);
```

**现象：** 答案读起来很流畅，引用标记齐全。

**真正的伤害：**

```text
"像不像"是人最不靠谱的判断方式
因为模型被训练成"像人写的"
你越读越觉得对
```

**怎么查：** **逐句对照。** 拿答案的每一句，去依据区块里找它说的那件事。

**这一步不能省，也不能交给模型。** 但可以**用代码辅助**（就是第 4 步的核查）。

**正确流程：**

```text
① 代码核查（自动，抓 80%）
② 人看核查报警的那几句（抓剩下的）
③ 只要有一条 high，就不交付
```

## 错误 3：`MIN_SCORE` 设成 0

```javascript
const minScore = 0;   // "不过滤，都交给模型"
```

**现象：** 无关问题也能答出来，而且答得挺像。

**真正的伤害：** 这是"看起来最全能"的配置，实际上是最危险的。

```text
用户问"公司年会什么时候办"
你检索到 4 块（讲报销、密码、合同、审批）
模型硬答，编出一个答案

客户："这个 AI 好坏，什么都答"
实际：你的系统在骗人
```

**正确做法：** 设阈值，并且**宁可多拒答**。

```text
误拒的代价：用户再问一次，或者去问人        → 小
误答的代价：用户拿着错误答案去做事            → 大
```

**这个不对称性决定了：阈值应该往"严"的方向调。**

## 错误 4：核查报警了，但只打印不处理

```javascript
if (!verify.ok) {
  console.log("警告：核查有问题");   // 然后就过去了
  // 答案照样返回给用户
}
```

**现象：** 日志里有一堆"警告"，但用户看到的还是那个带假引用的答案。

**真正的伤害：** 等于没做核查。

**正确做法：三选一，明确地选。**

```text
A. 拒答      → 最保守，"这个问题我需要人工确认"
B. 降级      → 去掉那句话，只返回能核查通过的部分
C. 标记      → 答案照给，但页面上标红"此结论需人工复核"
```

| 方案 | 适合场景 | 不适合 |
|---|---|---|
| A 拒答 | 制度、法务、医疗 | 客服（用户会流失） |
| B 降级 | 需要"能给出部分答案" | 答案是一整段不可分 |
| C 标记 | 内部工具（用户知道要核实） | 面向外部客户 |

**本课程用 A（拒答）**，因为这是制度问答场景，**错误答案的代价高于不回答。**

**这个选择要写进笔记，并写清理由。**

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 让模型写依据 | 依据看起来真 | 引用被改写，客户对不上 | 依据区块是不是代码生成的 |
| 不核查只看像不像 | 答案通顺 | 人会越读越信 | 有没有 `verifyCitation` |
| `MIN_SCORE=0` | 什么都能答 | 系统在编答案 | 问一个库里没有的事 |
| 报警不处理 | 日志有警告 | 等于没核查 | 看答案有没有被拦下 |

**这四个错误里，第 1 和第 4 是"做了但做错"，第 2 和第 3 是"没做"。**

**"做了但做错"更危险，因为它给人"已经处理了"的错觉。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第06节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「我抓到的真实编造」和「`MIN_SCORE` 怎么定」「覆盖率阈值怎么定」两节。

---

# 第 8 步：课后练习

## 练习一：把 `NO_CITATION` 的严重度改对

现在只要答案里没引用，就是 `medium`。改成：

- 如果答案是拒答（含"资料里没有"）→ 不算问题；
- 如果有实质内容（长度 > 20 字）但没引用 → `high`。

**验证：** 用 `MOCK_LLM=true` 但 `mockKind=noscite` 跑一次，看它变成 `high`。

## 练习二：加一个"引用编号冗余"检查

如果答案引用了 4 个块，但 4 个块讲的是四件不同的事，说明模型在"广撒网"。

**检查方法：** 如果 `cited.length > 3` 且每个引用只支撑一句话，报警。

**这个检查为什么有用：** 模型在不确定时会把所有编号都标上，"看起来有据可查"。**这是一种逃避策略。**

## 练习三：换 `RETRIEVE_MODE` 跑两遍，对比

`RETRIEVE_MODE=keyword` 和 `vector` 各跑一遍 `ask-batch.js`，生成两份 `ask-log.md`。

**对比这四项：**

1. 第 7、8 题（同义词）的命中情况；
2. 第 9、10 题（否定）的核查报警数；
3. 总拒答数；
4. 平均命中块数。

**这四项的差异就是第 91 节"混合检索"的输入。**

## 练习四：算一下一条问答的成本

按真模型跑一次 10 个问题的用量，估算：

```text
单次问答 = 检索 + prompt 输入 token + 输出 token
          = 0（检索本地）+ 约 N token + 约 M token

1000 次问答大概多少钱？
```

**给量级。标注假设。**

## 练习五：用自己的话讲清

1. 为什么"依据"区块必须由代码生成，不能由模型生成？
2. 引用核查能查出什么、查不出什么？为什么"查不出曲解"这件事重要？
3. `MIN_SCORE` 应该往严还是往松调？为什么？
4. 核查报警之后，三种处理方式各适合什么场景？你选哪个，为什么？
5. 模型输出 `[1,2]` 而不是 `[1][2]`，会发生什么？为什么这个错很难发现？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能解释为什么"有引用的幻觉"比"没引用的幻觉"危险
- [ ] 我能说出引用格式为什么要先定死
- [ ] 我能说出核查的三个指标，以及各自抓什么
- [ ] 我能解释为什么依据区块必须由代码生成
- [ ] 我能说出三种"核查报警后怎么处理"的适用场景

## B. 实操

- [ ] `probe-prompt.js` 拼出来的 prompt 结构正确，编号从 [1] 开始
- [ ] `ask.js` 用假模型跑通，答案 + 依据 + 核查三段都有
- [ ] 假答案里的编造句被 `UNSUPPORTED` 抓出来，覆盖率 < 60%
- [ ] `OUT_OF_RANGE` 能被抓出来（引用了 `[9]`）
- [ ] `NO_CITATION` 能被抓出来
- [ ] 无关问题被拒答，`hits.length === 0`
- [ ] `tools\ask-batch.js` 跑完 10 题，生成 `out\ask-log.md`
- [ ] `ask-log.md` 里有汇总表、逐题详情、核查结论
- [ ] `RETRIEVE_MODE=keyword` 和 `vector` 各跑过一遍

## C. 排错

- [ ] 我试过让模型自己写依据，看到它改写原文
- [ ] 我试过 `MIN_SCORE=0`，看到无关问题也答了
- [ ] 我试过模型输出 `[1,2]`，看到解析出 0 个引用
- [ ] 我知道 `STOP` 表里 `"个工作日"` 那条为什么不生效

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 「我抓到的真实编造」贴了原句和依据的对照
- [ ] 「阈值怎么定的」写了我的实际数值和理由
- [ ] 练习四的成本是算出来的

---

## 本节课要能说出口的一句话

> **带引用的错误答案比不带引用的更危险，因为引用让人以为已经核实过了。核查必须由代码做，不能由模型保证。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 答案里 `【依据】` 出现两遍 | `stripModelEvidence` 的标记列表 | 补上模型用的那个词 |
| 引用编号是 `[0]` | 模型越界 | 核查报 `OUT_OF_RANGE` |
| 解析出 0 个引用 | 模型用了 `[1,2]` 格式 | 先归一化再解析 |
| 覆盖率总是 1.0 | `terms` 返回空 | 打印 `ts.length` |
| 覆盖率总是很低 | 切词太碎 | 用 2-gram |
| 数字检查永远通过 | 正则没抽到 | 检查 `numbers()` |
| 全部拒答 | `MIN_SCORE` 太高 | 打印真实分数 |
| 全部不拒答 | `MIN_SCORE` 太低或没读到 | 打印 `process.env.MIN_SCORE` |
| `HTTP 401` | key | 检查 `.env` |
| `HTTP 429` | 频率限制 | 加延时，或减小批量 |
| 答案很长但没引用 | 模型不听话 | 核查会报 `NO_CITATION` |
| 中文乱码 | cmd 编码 | `chcp 65001` |
| 10 题跑得很慢（真模型） | 正常 | 每题 2–5 秒 |
