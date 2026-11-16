# 第 38 节课：限制输出格式——让输出能被程序检查

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前两节课你说清了"你是谁""只能用什么资料"。但输出**还是每次长得不一样**。
> 这节课做一件事：**把格式要求写成能数、能查、能自动打分的规则，然后统计通过率。**

**建议用时**：120 分钟
**你需要先完成**：第 37 节课（`docQaV1` 能跑，会用 `chat(messages, options)`）

---

# 第 0 步：为什么"格式"值得单独一节课（10 分钟）

## 0.1 一个真实的下游问题

**你的工具输出是这样的（三次调用，同一个问题）：**

```text
第一次：
甲方是杭州云杉科技有限公司，乙方是李明，合同金额为 48000 元，
期限从 2026 年 12 月 1 日到 2027 年 5 月 31 日。

第二次：
1. 甲方：杭州云杉科技有限公司
2. 乙方：李明
3. 金额：48000 元
4. 期限：2026-12-01 至 2027-05-31

第三次：
好的，我帮您整理一下：
- 甲方：杭州云杉科技有限公司
- 乙方：李明
- 合同金额：人民币肆万捌仟元整
...
```

**问题：你的程序要怎么处理这三种？**

```text
前端要显示"金额" → 第一次没有字段，第二次有"金额："，第三次是中文大写
要入库          → 三次结构完全不同，表都不知道怎么建
要校验          → 你的 if 判断写完一种，另两种就崩
```

**一句话：输出不稳定，产品就不成立。**

## 0.2 格式要求的五个维度

**"格式"不是一个词，是五件事。分开写，才写得出可执行的规则：**

| 维度 | 例子 | 能不能被程序检查 |
|---|---|---|
| **长度** | 不超过 50 字 | ✅ 数一下就知道 |
| **结构** | 每行 "字段：值"，共 5 行 | ✅ 拆行、split 冒号 |
| **条数** | 恰好 5 条 | ✅ 数组长度 |
| **用词** | 不出现"建议""应当" | ✅ 关键词匹配 |
| **符号** | 不用 emoji、不用 markdown 列表符 | ✅ 正则 |

**这五条之外的（"专业""自然""有说服力"）都不能检查，也就不能指望。**

## 0.3 今天的交付物

| 文件 | 位置（都在第 36 节的 `prompt-lab` 里） | 内容 |
|---|---|---|
| `src/validate.js` | `src/` | 四个检查函数 + 汇总 |
| `src/prompts.js` | `src/` | 加 `extractV1`（模糊版）和 `extractV2`（可验证版） |
| `experiments/e03-format.js` | `experiments/` | 跑 5 次、自动打分、算通过率 |
| `results/e03.md` | `results/` | 通过率表 |

---

# 第 1 步：先写一个"模糊版"当对照组（10 分钟）

**在 `prompts.js` 里加：**

```javascript
  extractV1: {
    id: "contract-extract",
    version: "v1-fuzzy",
    system: `你是一个合同信息提取助手。请从合同里提取甲方、乙方、金额、期限、违约责任，
输出要简洁清楚，方便阅读。`,
  },
```

**这段是第 36 节 `contractV1` 的"退化版"。故意写得像新手：**

```text
"简洁清楚"    → 没有标准
"方便阅读"    → 阅读的人是谁？
"输出"        → 什么形式？没说
```

**留着它，等下用来对比通过率。**

---

# 第 2 步：写四个检查函数（25 分钟）

## 2.1 为什么先写检查，再写提示词

**顺序反了你会发现自己在"凭感觉调"。**

**正确顺序：**

```text
① 先定义什么算合格（检查函数）
② 再把合格翻译成提示词
③ 跑，看得分
```

**先写检查，你才知道"改进"是什么意思。**

## 2.2 新建 `src/validate.js`

**自己敲：**

```javascript
// 长度：按字算，不按字节
export const checkMaxLength = (text, max) => {
  const length = [...text.trim()].length;

  return {
    name: `总字数 ≤ ${max}`,
    ok: length <= max,
    detail: `实际 ${length}`,
  };
};

// 行数：忽略空行
export const checkLineCount = (text, expected) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  return {
    name: `有效行数 = ${expected}`,
    ok: lines.length === expected,
    detail: `实际 ${lines.length}`,
  };
};

// 每行必须是 "字段：值"
export const checkLineShape = (text, fields) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const problems = [];

  fields.forEach((field, index) => {
    const line = lines[index] || "";

    if (!line.startsWith(`${field}：`) && !line.startsWith(`${field}:`)) {
      problems.push(`第 ${index + 1} 行不是「${field}：」开头`);
      return;
    }

    const value = line.slice(field.length + 1).trim();

    if (value === "") problems.push(`第 ${index + 1} 行值为空`);
  });

  return {
    name: "每行字段格式正确",
    ok: problems.length === 0,
    detail: problems.length === 0 ? "全部正确" : problems.join("；"),
  };
};

// 禁用词
export const checkForbiddenWords = (text, words) => {
  const hits = words.filter((word) => text.includes(word));

  return {
    name: `不含禁用词（${words.length} 个）`,
    ok: hits.length === 0,
    detail: hits.length === 0 ? "无" : `命中：${hits.join("、")}`,
  };
};

// 汇总：全部通过才算通过
export const validate = (text, rules) => {
  const checks = [
    checkMaxLength(text, rules.maxLength),
    checkLineCount(text, rules.lineCount),
    checkLineShape(text, rules.fields),
    checkForbiddenWords(text, rules.forbidden),
  ];

  return {
    passed: checks.every((check) => check.ok),
    checks,
  };
};
```

## 2.3 逐段讲清三个技术点

### 技术点一：`[...text].length` 为什么不用 `text.length`

**因为 emoji 和部分汉字算两个字符。**

```javascript
"好".length          // 1
"👍".length          // 2
[...("👍")].length   // 1
```

**你要求"不超过 50 字"，用户看到的是 50 个符号。** 用 `text.length` 会把 emoji 算重。

**严格说，中文的"字"和 Unicode 码点也不完全等价（生僻字、组合字），但 `[...text]` 已经够用了。**

### 技术点二：`checkLineShape` 里为什么同时判断全角和半角冒号

**模型有时输出 `甲方:` （半角），有时 `甲方：`（全角）。**

**你的前端按全角写，半角就解析不出来。**

**两种都接受，说明你承认模型有随机性，并且你选择在代码里消化它，而不是指望它每次一致。**

### 技术点三：为什么返回对象而不是 `true/false`

**因为你后面要打印"哪一条没过"。**

```text
只返回 true/false  → 你只知道"失败"
返回 {name, ok, detail} → 你知道"总字数超了 12 个"
```

**调试时，第二种能省你半小时。**

## 2.4 一个必须接受的现实

**检查函数只能检查"形式"，不能检查"内容对不对"。**

```text
"甲方：杭州云杉科技有限公司"   → 格式通过，内容也可能错（写成乙方名字）
```

**所以第 37 节的"依据"、以及人工抽检，都还是要的。**

**形式检查解决的是"能不能被程序用"，不是"答得对不对"。这两件事别混。**

---

# 第 3 步：把检查翻译成提示词（20 分钟）

## 3.1 加 `extractV2`

**在 `prompts.js` 里加：**

```javascript
  extractV2: {
    id: "contract-extract",
    version: "v2-checkable",
    system: `你是合同信息提取器。

从用户提供的合同文本中提取五项，按固定顺序输出，每项一行。

字段顺序（必须完全一致）：
甲方：
乙方：
金额：
期限：
违约责任：

格式要求：
- 只输出这 5 行，不要标题、不要序号、不要项目符号、不要空行。
- 每行格式为「字段：值」，用中文全角冒号。
- 冒号后直接写值，不留空格。
- 每行不超过 20 字。
- 全文不超过 100 字。
- 不使用 markdown，不使用表情符号。
- 合同未提及的项，值写「未提及」。
- 禁止出现「建议」「应当」「请注意」「希望对您有帮助」。
- 不要输出任何解释性语句。`,
  },
```

## 3.2 逐条对照五个维度

| 维度 | 在 `extractV2` 里是哪句 | 对应检查函数 |
|---|---|---|
| 长度 | 全文不超过 100 字 / 每行不超过 20 字 | `checkMaxLength` |
| 结构 | 「字段：值」，全角冒号，不要标题序号 | `checkLineShape` |
| 条数 | 只输出这 5 行 | `checkLineCount` |
| 用词 | 禁止出现四个词 | `checkForbiddenWords` |
| 符号 | 不用 markdown、不用表情 | 人工 + 正则 |

**注意"字段顺序（必须完全一致）"这句。**

**不写这句，它会按"哪个重要先写哪个"排，你的 `checkLineShape` 按位置检查，就会全错。**

## 3.3 为什么要写"不要标题、不要序号"

**因为模型的默认习惯是"帮我整理成清晰的列表"。**

**它会自动加：**

```text
以下是从合同中提取的信息：
1. 甲方：xxx
2. 乙方：xxx
```

**这两行附加物会让你的 `checkLineCount` 直接判失败。**

**这类"它自以为在帮你"的行为，是格式稳定的头号敌人。** 只能一条条堵。

## 3.4 提示词里不要写"如果违反"

**有人会写：**

```text
如果违反以上任何一条，请重新输出。
```

**没用。** 模型没有"执行—检查—重来"的循环，它一次生成完就结束。

**真正的重试必须在代码里做**（第 39 节会写）。

---

# 第 4 步：跑 5 次，算通过率（25 分钟）

## 4.1 新建 `experiments/e03-format.js`

```javascript
import { chat } from "../src/llm.js";
import { PROMPTS } from "../src/prompts.js";
import { validate } from "../src/validate.js";

const CONTRACT = `
采购合同
甲方：杭州云杉科技有限公司
乙方：李明（个体经营）
合同金额：人民币 48000 元
合同期限：2026 年 12 月 1 日至 2027 年 5 月 31 日
付款方式：分两期支付
`;

const RULES = {
  maxLength: 100,
  lineCount: 5,
  fields: ["甲方", "乙方", "金额", "期限", "违约责任"],
  forbidden: ["建议", "应当", "请注意", "希望对您有帮助"],
};

const RUNS = 5;

const runOne = async (system) => {
  const result = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: `提取下面的合同信息：\n${CONTRACT}` },
    ],
    { temperature: 0.7, maxTokens: 400 }
  );

  return result.content;
};

const testPrompt = async (label, system) => {
  let passCount = 0;
  const failures = [];

  for (let i = 1; i <= RUNS; i += 1) {
    const output = await runOne(system);
    const report = validate(output, RULES);

    if (report.passed) {
      passCount += 1;
    } else {
      const bad = report.checks.filter((check) => !check.ok);
      failures.push({ round: i, bad, output });
    }

    console.log(`\n--- ${label} 第 ${i} 次：${report.passed ? "通过" : "不通过"} ---`);
    console.log(output);
    report.checks.forEach((check) => {
      console.log(`  ${check.ok ? "✅" : "❌"} ${check.name}（${check.detail}）`);
    });
  }

  const rate = ((passCount / RUNS) * 100).toFixed(0);
  console.log(`\n===== ${label} 通过率：${passCount}/${RUNS} = ${rate}% =====`);

  if (failures.length > 0) {
    console.log("\n失败原因汇总：");
    const counter = new Map();

    failures.forEach(({ bad }) => {
      bad.forEach((check) => {
        const key = check.name;
        counter.set(key, (counter.get(key) || 0) + 1);
      });
    });

    [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => console.log(`  ${name}：失败 ${count} 次`));
  }

  return { label, passCount, rate };
};

const main = async () => {
  const results = [];

  results.push(await testPrompt("v1 模糊版", PROMPTS.extractV1.system));
  results.push(await testPrompt("v2 可验证版", PROMPTS.extractV2.system));

  console.log("\n===== 总表 =====");
  results.forEach((item) => {
    console.log(`${item.label}：${item.passCount}/${RUNS}（${item.rate}%）`);
  });
};

main().catch((error) => {
  console.error("跑挂了：", error.userMessage || error.message);
  if (error.detail) console.error("细节：", error.detail);
  process.exitCode = 1;
});
```

## 4.2 加 npm 脚本并跑

**`package.json` 加一行：**

```json
    "e03": "node --env-file=.env experiments/e03-format.js"
```

**跑：**

```text
npm run e03
```

**十次调用。** 用真模型，`temperature` 保持 0.7（故意不调低，因为你要看真实波动）。

## 4.3 你大概会看到什么

**v1 模糊版：**

```text
通过率：0/5
失败原因：总字数超、有效行数不对、每行字段格式错
```

**v2 可验证版：**

```text
通过率：3/5 或 4/5
失败原因：总字数 ≤ 100（实际 108）、有效行数 = 5（实际 6）
```

**关键：v2 不是 5/5。**

**这就是这节课最重要的认知：再好的提示词也有失败率。产品要按"有失败率"来设计。**

## 4.4 看失败的那些输出，找规律

**打印出来的失败输出，通常是这几种：**

| 现象 | 原因 | 修法 |
|---|---|---|
| 多一行标题 | 它想"帮你整理" | 提示词加"不要标题、不要任何前置说明" |
| 总字数超一点 | 值太长（公司名长） | 放宽到 120，或要求"公司名可简写" |
| 违约责任写了两行 | 值里有换行 | 要求"值内不得换行" |
| 第 5 行是"违约责任：未提及" | 这是对的！ | 检查你的规则是不是误判 |
| 空的第 6 行 | 末尾多了个换行 | `checkLineCount` 已过滤空行，没问题 |

**注意第 4 条：有时候是"检查函数"错了，不是模型错了。**

**先怀疑自己的规则，再怀疑模型。** 这个习惯能救你很多时间。

## 4.5 记录到 `results/e03.md`

```markdown
# 第 38 节 格式通过率

模型：
temperature：0.7
运行次数：各 5 次

| 版本 | 通过次数 | 通过率 | 主要失败项 |
|---|---|---|---|
| v1 模糊 | /5 | | |
| v2 可验证 | /5 | | |

## 失败样本（贴一条完整的）

```text
（贴这里）
```

## 我改了什么、通过率变成多少

| 改动 | 通过率 |
|---|---|
| 原始 v2 | |
| 加"不要任何前置说明" | |
| 字数放宽到 120 | |
```

**这张表就是你以后接活时"我做过提示词工程"的证据。**

---

# 第 5 步：剩下的失败率怎么处理（15 分钟）

## 5.1 三条路，按成本排序

```text
一、代码后处理（最便宜，先做这个）
二、提示词微调（中等）
三、调用重试（最贵，最后才用）
```

## 5.2 后处理：在代码里擦干净

**在 `validate.js` 里加一个清洗函数：**

```javascript
export const cleanOutput = (text) =>
  text
    .replace(/^```[a-zA-Z]*\s*/g, "")
    .replace(/```$/g, "")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^[-*•]\s*/, "")
        .replace(/^\d+[.、)]\s*/, "")
    )
    .filter((line) => line !== "")
    .join("\n");
```

**它在做四件事：**

| 代码 | 作用 |
|---|---|
| 去掉 ``` 围栏 | 模型爱包代码块 |
| `trim()` 每行 | 去首尾空格 |
| 去 `-` `*` `•` 前缀 | 去列表符号 |
| 去 `1.` `2、` 前缀 | 去序号 |
| 去空行 | 去多余换行 |

**关键认知：**

> **提示词负责"让它尽量对"，代码负责"让它一定能用"。**
>
> **两者不是二选一，是两层。**

## 5.3 顺序很重要：先清洗，再检查

**如果先检查再清洗：**

```text
模型输出带 "-" 前缀 → 检查失败 → 判为不合格
其实清洗一下就能用
```

**改成：**

```text
模型输出 → cleanOutput → validate → 判断
```

**把 `e03-format.js` 的 `runOne` 返回值改成清洗后的结果，再跑一次，看通过率提升多少。**

**这一步通常会从 3/5 提到 5/5。**

## 5.4 还不行才重试

**重试的成本：**

```text
多一次调用 = 多一次钱 + 多一倍等待
```

**所以重试必须满足三个条件：**

```text
① 只在"检查失败"时重试
② 最多重试 1 次（不是 3 次）
③ 重试时把"上次错在哪"告诉模型
```

**第 39 节会把它写成 `askJson()` 的一部分，今天先知道原则。**

---

# 第 6 步：五个必须知道的坑（15 分钟）

## 坑 1：字数口径不一致

**你写"不超过 100 字"，模型理解成"100 个词"（英文场景）或"100 个汉字（不算标点）"。**

**修法：在提示词里给一个边界例子。**

```text
全文不超过 100 字（含标点）。
```

**并在检查函数里用同一个口径（`[...text].length` 包含标点）。**

**口径不一致 = 永远对不上。**

## 坑 2：边界值算不算

**"不超过 100"包括 100 吗？**

**你的检查函数写 `<=` 就是包括。那提示词也得说清。**

**这类歧义在合同、报价、限额场景里会变成纠纷。** 养成习惯：**边界必须写明"含"还是"不含"。**

## 坑 3：模型数不清字

**要求"每行不超过 20 字"，它写到 24 字，还觉得自己很简洁。**

**这是已知局限：模型对精确计数不可靠。**

**应对：**

```text
把要求从"20 字"降到"15 字"  → 它写到 19，你还能过
或者不要求字数，改用"值只写名称，不写说明"
```

**给模型的限制要留冗余。** 你要求 20，它可能给 24；你要求 15，它给 18，你的检查按 20 判，就过了。

**这叫"按最坏情况设阈值"。**

## 坑 4：markdown 包裹

**它会把整个输出包进 ```text ```。**

**看不见，但你的 `startsWith("甲方：")` 会失败。**

**`cleanOutput` 已经处理了，但你要知道它为什么存在。**

## 坑 5：全角半角混用

**冒号：`：` vs `:`**
**逗号：`，` vs `,`**
**括号：`（）` vs `()`**

**中文场景下模型会混着用。检查函数两种都接受，或者清洗时统一成一种。**

**统一比兼容更好：**

```javascript
export const normalizePunctuation = (text) =>
  text.replace(/：/g, ":").replace(/，/g, ",").replace(/（/g, "(").replace(/）/g, ")");
```

**但这会影响中文可读性。** 所以：**展示给用户用全角，入库判断用半角。**

---

# 第 7 步：故意做三个实验（10 分钟）

## 实验 1：删掉"不要标题"这一条

**重跑，看通过率掉多少。**

**你会看到 `有效行数 = 5（实际 6）` 开始频繁失败。**

**结论：一条具体禁令，抵十句"请规范输出"。**

## 实验 2：把 `temperature` 调到 0

**重跑 5 次。**

**通过率会上升，但通常不到 100%。**

**这条要亲自验证。** 以后有人跟你说"设成 0 就稳定了"，你能拿出数据。

## 实验 3：把 `checkLineCount` 改成"允许 5-6 行"

**通过率立刻上去。**

**这说明什么？**

```text
有时候不是你提示词不行，是你的标准太严
```

**标准该严还是该松，取决于下游：**

| 下游 | 该严还是松 |
|---|---|
| 入数据库字段 | 严（多一行就出错） |
| 给人看的摘要 | 松（多一行无所谓） |

**先想清下游，再定标准。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. v1 / v2 的通过率数字（多少/5）
2. 一条完整的失败输出
3. 清洗后通过率变化
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：给"周报生成"写格式规则

**要求：** 输出恰好三段，每段一个小标题，全文 200 字以内，不出现"我觉得""可能"。

**先写检查函数，再写提示词。**

**顺序不能反。**

## 练习二：加一条"数值必须带单位"的检查

**要求：** 金额那行必须含"元"字。

```javascript
const checkUnit = (line, keyword, unit) => { ... }
```

**这一条能抓到"金额：48000"这种漏单位的输出。**

**为什么重要：** 没有单位，48000 是元还是万元？下游会算错 10000 倍。

## 练习三：把 `validate` 改成"评分制"

**现在只有"通过/不通过"。改成 0-100 分：**

```text
四条规则各 25 分
展示时打印总分
```

**为什么：** 通过率只有 0 和 1，你看不出"从 3 条过到 4 条过"的进步。**分数能看出趋势。**

## 练习四：找出这段提示词的四个不可验证要求

```text
请输出一份专业、简洁、结构清晰的合同摘要，语言要自然流畅，
重点突出，篇幅适中，让客户一看就懂。
```

**改写成四条能数出来的规则。**

---

# 第 10 步：最终验收

## A. 代码

- [ ] `src/validate.js` 有四个检查函数 + `validate` + `cleanOutput`
- [ ] `prompts.js` 里有 `extractV1` 和 `extractV2`
- [ ] `experiments/e03-format.js` 能跑
- [ ] 脚本能打印每条规则的通过/失败和失败汇总

## B. 数据

- [ ] 我跑过 v1 和 v2 各 5 次
- [ ] 我有两个版本的真实通过率
- [ ] 我记录了一条完整的失败输出
- [ ] 我做过"清洗后重跑"的对比

## C. 认知

- [ ] 我能说出格式的五个维度
- [ ] 我知道为什么先写检查再写提示词
- [ ] 我知道模型数不清字，所以要留冗余
- [ ] 我知道提示词和代码是两层，不是二选一

## 本节课要能说出口的一句话

> **能被程序检查的要求才叫要求。剩下的都是许愿。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 通过率一直是 0 | 检查规则和提示词口径不一致 | 打印失败详情，逐条对 |
| 总字数总是超一点 | 值太长或模型数不准 | 阈值放宽 20%，或压缩字段值 |
| 行数总是多一行 | 它加了标题或总结 | 加"不要任何前置说明/总结" |
| 字段顺序乱 | 没写"顺序必须一致" | 明写字段顺序 |
| 偶发失败 | 模型本身有随机性 | 看通过率，不看单次 |
| 检查函数把对的判错 | 全角半角、空格、前缀 | 先 `cleanOutput` 再 `validate` |
| `maxTokens` 截断 | 输出被切断 | 调到 800 |
| 每次 5 次跑太久 | 串行 + 模型慢 | 加 1 秒间隔，或降到 3 次 |
