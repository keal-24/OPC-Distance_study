# 第 123 节课：人工评分

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天给自己打分。**而且要先证明"你的打分本身靠不靠得住"。**
> 这一步最枯燥，也最容易被跳过。跳过它，后面自动判分全是空的。

**建议用时**：110 分钟
**你需要先完成**：第 122 节的 `runs/*.jsonl`
**今天要装**：什么都不用装

---

# 第 0 步：为什么必须人工评分（15 分钟）

## 0.1 一个逃不掉的逻辑

你的目标是：**用代码自动判分，替代人评。**

要做到这件事，你必须先回答一个问题：

```text
我要证明"自动判分是准的"，那我拿什么当基准？
```

**答案是：人评。** 因为除了人，没有别的东西能定义"这条输出业务上能不能用"。

所以：

```text
人评 → 基准 → 自动判分去对齐它
```

**没有人评，你的自动判分就只是"另一个模型说了什么"，你没有任何依据相信它。**

## 0.2 但人评自己也有问题

这是所有人都会踩的坑：**你以为"我自己判的"是客观的。它不是。**

三个具体的、可测量的偏差：

```text
① 内部不一致
   同一条输出，你今天判 PASS，明天判 WARN。
   原因是：你读的时候心情不同、注意力不同、前面看了几条不同的题。

② 顺序效应
   刚看完一条完美输出，下一条"还行"的会被判得偏严。
   刚看完一条垃圾，下一条"还行"的会被判得偏松。

③ 期望漂移
   这是最隐蔽的：你判到第 20 条时，脑子里的标准已经和你判第 1 条时不同了。
   因为你已经"见过世面"了，会用相对标准而不是绝对标准。
```

**所以今天要做两件事，而且第二件比第一件重要：**

```text
第一件：给 20 条输出打分       （产出数据）
第二件：测你自己的一致性        （证明数据可信）
```

**绝大多数人只做第一件。然后拿着不可靠的数据去做自动判分，最后得到一个连自己都不信的 78%。**

## 0.3 一个必须接受的代价

```text
20 条 × 5 字段 × 2 次盲评 = 200 次判断
```

**一次判断 10 秒，就是 33 分钟纯判断时间。** 加上找输出、写理由、算一致率，这节课两小时是正常的。

**这是全课程最不舒服的一节课。** 但它是唯一能让你的分数有意义的办法。

---

# 第 1 步：建标签文件（10 分钟）

## 1.1 数据放哪

```bash
cd 03-练习代码/eval
mkdir -p labels
```

每条输出要产出**两份**标签（你两次盲评各一份）：

```text
labels/
├── pass1.jsonl      第一次评
├── pass2.jsonl      第二次评（隔一段时间，不看 pass1）
└── final.jsonl      两次都判完、处理完分歧后的最终标签
```

## 1.2 单条标签的格式

```json
{
  "id": "L1-001",
  "model_key": "cheap",
  "run_file": "2026-11-16T08-30-00__cheap.jsonl",
  "fields": {
    "summary": "WARN",
    "category": "PASS",
    "urgency": "FAIL",
    "suggested_action": "WARN",
    "need_human": "PASS"
  },
  "veto": [],
  "reason": "urgency 判成 low，但金额 2000+ 且客户说'赶紧查'，应为 high，差两档记 FAIL",
  "labeled_at": "2026-11-16T09:15:00+08:00"
}
```

逐字段说清：

| 字段 | 必填 | 说明 |
|---|---|---|
| `fields` | 是 | 五个字段各一个 PASS/WARN/FAIL |
| `veto` | 是 | 命中的一票否决编号数组，没命中就 `[]` |
| `reason` | 是 | **必须写一句理由**，尤其是 WARN 和 FAIL |
| `labeled_at` | 是 | 时间戳。**用来判断你两次评之间隔了多久** |

**`reason` 为什么强制？**

因为它是你算一致率时唯一能用来归因的东西。没有理由，你只知道"两次判得不一样"，不知道"为什么不一样"。

**而且写理由会逼你慢下来。** 想不清理由的时候，就是你判定卡有洞的时候。

## 1.3 写一个生成"空白标签表"的脚本

手敲 20 条 × 5 字段太容易漏。让它生成：

```javascript
// eval/make-blank.js
// 用法：node make-blank.js runs/xxx__cheap.jsonl 20
import fs from "node:fs";

const file = process.argv[2];
const n = Number(process.argv[3] ?? "20");

const rows = fs
  .readFileSync(file, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

// 优先取各层的前几条，保证覆盖：典型 8 / 边界 5 / 刁难 4 / 拒答 2 / 注入 1
const quota = { typical: 8, boundary: 5, hard: 4, reject: 2, inject: 1 };
const picked = [];
for (const [layer, q] of Object.entries(quota)) {
  picked.push(...rows.filter((r) => r.layer === layer).slice(0, q));
}
const final = picked.slice(0, n);

const FIELDS = ["summary", "category", "urgency", "suggested_action", "need_human"];

const out = final.map((r) => ({
  id: r.id,
  model_key: r.model_key,
  run_file: file.split(/[\\/]/).pop(),
  // 把输出摊平，方便你直接看
  _input: r.input,
  _output: r.output_text,
  fields: Object.fromEntries(FIELDS.map((f) => [f, ""])),
  veto: [],
  reason: "",
  labeled_at: "",
}));

fs.writeFileSync("labels/pass1.blank.jsonl", out.map((o) => JSON.stringify(o)).join("\n") + "\n");
console.log(`生成 ${out.length} 条空白标签 → labels/pass1.blank.jsonl`);
console.log("层分布：", Object.entries(quota).map(([k, v]) => `${k}=${v}`).join(" "));
```

```bash
node make-blank.js runs/2026-11-16T08-30-00__cheap.jsonl 20
```

## 1.4 做一个"打分视图"

直接在 JSONL 里填 `""` 很难受。**生成一个方便读的页面，或者一个纯文本块。**

最快的办法：生成一个 `labels/review.md`，一条一条排开。

```javascript
// eval/make-review.js
import fs from "node:fs";

const rows = fs.readFileSync("labels/pass1.blank.jsonl", "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const md = [];
md.push("# 人工评分表（第 1 遍）\n");
md.push("> 判完把结论填到 `pass1.jsonl`。判定标准看 `eval-spec.md`。\n");
md.push("---\n");

rows.forEach((r, i) => {
  md.push(`## ${i + 1}. ${r.id}（${r.model_key}）\n`);
  md.push("**输入**\n");
  md.push("```text\n" + r._input + "\n```\n");
  md.push("**模型输出**\n");
  md.push("```json\n" + (r._output ?? "(空)") + "\n```\n");
  md.push("**判定**\n");
  md.push("```text");
  md.push("summary          [ ] PASS  [ ] WARN  [ ] FAIL");
  md.push("category         [ ] PASS  [ ] WARN  [ ] FAIL");
  md.push("urgency          [ ] PASS  [ ] WARN  [ ] FAIL");
  md.push("suggested_action [ ] PASS  [ ] WARN  [ ] FAIL");
  md.push("need_human       [ ] PASS  [ ] WARN  [ ] FAIL");
  md.push("一票否决         [ ] 无   [ ] V1  [ ] V2  [ ] V3  [ ] V4  [ ] V5");
  md.push("理由：");
  md.push("```\n");
  md.push("---\n");
});

fs.writeFileSync("labels/review.md", md.join("\n"));
console.log("生成 labels/review.md");
```

```bash
node make-review.js
```

**现在你有一个能滚着读的文件。** 打开它，一条一条判。

---

# 第 2 步：第一遍评分（35 分钟）

## 2.1 三条操作规则

**规则一：先判 `veto`，再判字段**

```text
看到一个输出，第一眼扫：
  有没有编造？有没有承诺？有没有泄露？
有 → 记下编号，五个字段全填 FAIL，写完理由，下一条
没有 → 逐字段判
```

**为什么？** 因为命中 veto 的那条，再去细判字段是浪费时间（分数都归零了）。

**规则二：`WARN` 必须写"差在哪"，`FAIL` 必须写"为什么不能用"**

```text
❌ 理由写"有点问题"
✅ 理由写"summary 38 字，超了 8 个字；内容本身准确，所以 WARN 不是 FAIL"
```

**理由写不出来 → 你不知道该判 WARN 还是 FAIL → 说明判定卡有洞。**

**记录这种情况。** 第 120 节的一致性测试可能没暴露它，因为这批输入更难。

**规则三：不要回头看前面的判定**

判第 15 条时，**绝对不要滚回第 3 条去看"上次这种我判了什么"。**

因为你要测的正是"你会不会前后不一致"。你回去对照，就在人为制造一致性，测出来的数字是假的。

## 2.2 判到一半会发生的三件事

**第一件：你发现判定卡真的不够用**

大概在第 8–12 条，你会遇到一条"判定卡里没写"的情况。比如：

```text
客户说"我不想要了，退了吧" —— 没说原因
category 该判 refund 还是 other？
```

**处理办法：**

```text
① 现在就补规则（写进 eval-spec.md，标注"第 123 节补充"）
② 当前这条按新规则判
③ 但前面已经判过的条目，不要回头改
```

**不回头改，是为了保证"同一批数据在同一套标准下产生"这一点的诚实性。** 如果你回头改，你就把标准的漂移掩盖掉了 —— 而标准的漂移本身是重要信息。

**正确做法：** 在 `NOTES.md` 里写清"我在第 11 条补了规则 X，前 10 条按旧标准判"。

**第二件：你开始烦躁**

第 15 条之后，你会想"差不多就 PASS 吧"。**这是评分疲劳，它会让后半段的判定变松。**

**对策：** 每 7 条休息 2 分钟。**并且把这个事实记进 NOTES** —— 因为如果你的后半段系统性偏松，你的数据就有位置偏差。

**第三件：你发现模型的错其实是管道的错**

比如 `category: "Invoice"` 大写。第 120 节的样例 B 说过：这是 WARN，不是 FAIL，因为一个 `toLowerCase()` 能修。

**但你会犹豫："这算模型的错吗？"**

**答案：不算。** 你在评"业务上能不能用"，不是评"代码写得漂不漂亮"。大写 I 的业务后果是：你的下游代码如果没做归一化，会把它当 `other` 处理。**那是你下游代码的 bug，不是模型的问题。**

**判 WARN，理由写清"大小写未归一，业务可用，管道需修"。**

## 2.3 一个必须记的统计：判定耗时

**记录每条你花了多久。** 不用精确，心算"大约 1 分钟"就可以。

```text
L1-001  约 1.5 分钟（字段全 PASS，但 summary 要我数长度）
L2-002  约 3 分钟（模型编造了，我要核对原文确认）
L3-003  约 0.5 分钟（一个字输入，直接判 veto）
```

**这个数据会在第 124 节用到。** 因为你要算"如果全部人工评，一个月多少钱"。

粗算：**一条 1.5 分钟 × 每天 1000 条 = 25 小时/天。** 这就是你必须做自动判分的根本原因，而不是"自动判分更先进"。

---

# 第 3 步：第二遍盲评（30 分钟）★ 关键步骤

## 3.1 这个步骤的全部要点是"盲"

**你必须做到：看不见第一遍的结论。**

三个具体做法，选一个：

```text
① 最好：隔一天再评（时间是最有效的盲）
② 次好：隔 2 小时，做点别的，回来重新打开
③ 最差但可接受：立刻重评，但把 pass1.jsonl 改名藏起来
```

**为什么"隔一天"最好？** 因为你的短期记忆会残留。你会隐约记得"这条我判过 WARN"，然后不自觉地重复它。**这不是一致性，这是记忆。**

## 3.2 打乱顺序

```javascript
// eval/shuffle.js
import fs from "node:fs";

const rows = fs.readFileSync("labels/pass1.blank.jsonl", "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

// Fisher-Yates
for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}

fs.writeFileSync("labels/pass2.blank.jsonl", rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log("打乱后 20 条 → labels/pass2.blank.jsonl");
```

**为什么要打乱？** 因为**顺序效应**是真实存在的。你按原顺序评，第 1 条和第 20 条的"心理基准"不同。打乱之后，如果两次结论仍然一致，说明一致性来自判定卡，而不是顺序。

## 3.3 重新生成 review 文件

改 `make-review.js` 里的输入文件为 `pass2.blank.jsonl`，输出为 `labels/review2.md`，跑一次。

**然后判第二遍。不看第一遍。**

## 3.4 判第二遍时你会遇到的两种心理

**第一种："这条我记得，刚才判的是 PASS"**

**立即停止。** 如果你记得，你就没有在盲评。**这时候应该做的是：换时间。** 隔一天再来。

**如果实在没时间（比如你只有今天一个晚上），那就承认这个局限**，在 NOTES 里写一句"第二遍间隔仅 40 分钟，可能受记忆影响，一致率偏高"。**诚实记录局限，比假装没有局限专业得多。**

**第二种："这条我现在觉得应该判 FAIL，但第一次判了 WARN"**

**这可能是真的进步（你更理解了），也可能是漂移（你累了）。**

怎么区分？看理由：

```text
第一次理由："summary 有点长"
第二次理由："summary 42 字，超 12 字，且把'客户说没人联系他'写成了'客户要求联系'，
            属于事实扭曲 → FAIL"
```

**第二次明显更具体 → 是真的进步。** 说明第一遍判太快了。

**处理：以第二遍为准（因为它更细），但在 final.jsonl 里保留两次的差异记录。**

---

# 第 4 步：算一致率（25 分钟）

## 4.1 三个不同的数，必须分开算

```javascript
// eval/agreement.js
import fs from "node:fs";

const load = (p) => {
  const m = new Map();
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!l.trim()) continue;
    const o = JSON.parse(l);
    if (!o.labeled_at) continue;       // 跳过没评的
    m.set(o.id, o);
  }
  return m;
};

const A = load("labels/pass1.jsonl");
const B = load("labels/pass2.jsonl");

const FIELDS = ["summary", "category", "urgency", "suggested_action", "need_human"];

let total = 0, exact = 0, near = 0;
const perField = Object.fromEntries(FIELDS.map((f) => [f, { total: 0, exact: 0, near: 0 }]));
const disagreements = [];

// 严格一致：两次完全相同
// 近邻一致：只差一档（PASS↔WARN 或 WARN↔FAIL）
// 相反：PASS↔FAIL
const order = { PASS: 2, WARN: 1, FAIL: 0 };

for (const [id, a] of A) {
  const b = B.get(id);
  if (!b) continue;

  // ① 整条判定是否一致（含 veto）
  const aVeto = (a.veto ?? []).sort().join(",");
  const bVeto = (b.veto ?? []).sort().join(",");
  const aWhole = aVeto ? "FAIL" : (Object.values(a.fields).every((v) => v === "PASS") ? "PASS" : "OTHER");
  const bWhole = bVeto ? "FAIL" : (Object.values(b.fields).every((v) => v === "PASS") ? "PASS" : "OTHER");

  if (aWhole !== bWhole) {
    disagreements.push({ id, field: "(整条)", a: aWhole, b: bWhole, aVeto, bVeto });
  }

  // ② 逐字段
  for (const f of FIELDS) {
    const va = a.fields[f], vb = b.fields[f];
    if (!va || !vb) continue;              // 该字段没判，跳过
    total++;
    perField[f].total++;

    if (va === vb) {
      exact++; perField[f].exact++;
      near++;  perField[f].near++;
    } else {
      const d = Math.abs((order[va] ?? -9) - (order[vb] ?? -9));
      if (d === 1) { near++; perField[f].near++; }
      disagreements.push({ id, field: f, a: va, b: vb, aVeto: "", bVeto: "" });
    }
  }
}

const pct = (n, d) => d ? ((n / d) * 100).toFixed(1) + "%" : "-";

console.log("=== 一致性报告 ===\n");
console.log(`判定总数：${total}`);
console.log(`严格一致（完全相同）：${exact}  → ${pct(exact, total)}`);
console.log(`近邻一致（差一档内）：${near}  → ${pct(near, total)}`);
console.log(`矛盾（PASS vs FAIL） ：${total - near}  → ${pct(total - near, total)}`);

console.log("\n各字段：");
for (const f of FIELDS) {
  const s = perField[f];
  console.log(`  ${f.padEnd(18)} 严格 ${pct(s.exact, s.total).padStart(6)}   近邻 ${pct(s.near, s.total).padStart(6)}   (${s.total} 次)`);
}

console.log(`\n分歧明细（${disagreements.length} 处）：`);
for (const d of disagreements) {
  console.log(`  ${d.id.padEnd(8)} ${d.field.padEnd(18)} ${d.a} vs ${d.b}${d.aVeto || d.bVeto ? `  veto[${d.aVeto}|${d.bVeto}]` : ""}`);
}
```

## 4.2 怎么读这三个数

```text
严格一致（exact）：两次完全一样的比例
近邻一致（near） ：差异不超过一档的比例
矛盾（PASS vs FAIL）：直接对立的比例
```

**判断标准：**

| 指标 | 合格线 | 不合格意味着什么 |
|---|---|---|
| 严格一致 | ≥ 80% | 你的判定卡有歧义，或你在疲劳状态下评 |
| 近邻一致 | ≥ 95% | 有字段的标准严重模糊 |
| 矛盾（PASS vs FAIL） | ≤ 3% | **任何一处矛盾都必须逐条解释** |

**为什么"矛盾"必须单独看？**

因为 `PASS↔WARN` 的差异是"松紧不同"，可以接受；`PASS↔FAIL` 的差异是"认知不同"，**说明那一条你和自己都吵起来了 —— 判定卡在那个点上肯定是空的。**

## 4.3 逐字段看，找最差的字段

**大概率是 `summary` 或 `category`。**

```text
summary 一致性 72%  →  "30 字上限" 你两次数的字数不同，或者"编造"的判定尺度不同
category 一致性 78% →  优先级规则有覆盖不到的组合
urgency 一致性 95%  →  金额门槛清晰，好判
need_human 一致性 100% → 布尔值，最好判
```

**这个分布本身就是结论：越结构化的字段，一致性越高。**

**所以第 124 节的自动判分，应该重点放在结构化字段上。** 自由文本字段（summary、suggested_action）的一致性天花板就是 80% —— **你不可能让自动判分在这两个字段上超过人评自己的一致性。**

**记住这句话，它会在第 124 节救你。**

## 4.4 处理分歧，产出 final.jsonl

```javascript
// eval/make-final.js
import fs from "node:fs";

const load = (p) => {
  const m = new Map();
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!l.trim()) continue;
    const o = JSON.parse(l);
    if (!o.labeled_at) continue;
    m.set(o.id, o);
  }
  return m;
};

const A = load("labels/pass1.jsonl");
const B = load("labels/pass2.jsonl");
const FIELDS = ["summary", "category", "urgency", "suggested_action", "need_human"];

const out = [];
const conflicts = [];

for (const [id, a] of A) {
  const b = B.get(id);
  if (!b) continue;

  const fields = {};
  for (const f of FIELDS) {
    const va = a.fields[f], vb = b.fields?.[f];
    if (va === vb) fields[f] = va;
    else {
      // 有分歧 → 取更严的那个（保守策略），并记录
      // 取更严的理由：宁可低估自己，不要高估
      const order = { PASS: 2, WARN: 1, FAIL: 0 };
      fields[f] = (order[va] ?? 9) < (order[vb] ?? 9) ? va : vb;
      conflicts.push({ id, field: f, pass1: va, pass2: vb, chosen: fields[f] });
    }
  }

  // veto 取并集（任一遍判命中就算命中）
  const veto = [...new Set([...(a.veto ?? []), ...(b.veto ?? [])])].sort();

  out.push({
    id,
    model_key: a.model_key,
    run_file: a.run_file,
    fields,
    veto,
    reason: [a.reason, b.reason].filter(Boolean).join(" ／ "),
    resolved: conflicts.filter((c) => c.id === id).length > 0,
    labeled_at: new Date().toISOString(),
  });
}

fs.writeFileSync("labels/final.jsonl", out.map((o) => JSON.stringify(o)).join("\n") + "\n");

console.log(`最终标签 ${out.length} 条 → labels/final.jsonl`);
console.log(`有分歧的字段 ${conflicts.length} 处，已按"取更严"处理：`);
for (const c of conflicts) {
  console.log(`  ${c.id.padEnd(8)} ${c.field.padEnd(18)} ${c.pass1} / ${c.pass2} → ${c.chosen}`);
}
```

## 4.5 "取更严"这个策略的选择

**为什么取更严，不是取平均或取第一遍？**

```text
取更严   → 你的通过率会偏低 → 你不会高估自己上线
取平均   → WARN 会被"平均"出来，而 WARN 不是分数，是状态
取第一遍 → 假设第一遍更认真（不一定成立）
```

**这条规则必须写进 `eval-spec.md`。** 因为第 125 节比较模型时，三个模型的 final 标签必须来自同一套规则。

**注意：取更严会让你的绝对分数偏低。** 所以报告时要说清："本分数基于偏保守的人工标签。"

---

# 第 5 步：算你的第一份基线分数（15 分钟）

## 5.1 汇总脚本

```javascript
// eval/report.js
// 用法：node report.js labels/final.jsonl
import fs from "node:fs";

const file = process.argv[2] ?? "labels/final.jsonl";
const rows = fs.readFileSync(file, "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const FIELDS = ["summary", "category", "urgency", "suggested_action", "need_human"];
const SCORE = { PASS: 1, WARN: 0.5, FAIL: 0 };

let strictPass = 0;
let fatal = 0;
let fieldSum = 0, fieldCount = 0;

const byLayer = {};

for (const r of rows) {
  const hasVeto = (r.veto ?? []).length > 0;
  const allPass = FIELDS.every((f) => r.fields[f] === "PASS");

  if (hasVeto) fatal++;
  if (!hasVeto && allPass) strictPass++;

  const layer = r.id.startsWith("L1") ? "typical"
    : r.id.startsWith("L2") ? "boundary"
    : r.id.startsWith("L3") ? "hard"
    : r.id.startsWith("L4") ? "reject"
    : "inject";

  byLayer[layer] ??= { n: 0, pass: 0, fatal: 0 };
  byLayer[layer].n++;
  if (!hasVeto && allPass) byLayer[layer].pass++;
  if (hasVeto) byLayer[layer].fatal++;

  for (const f of FIELDS) {
    const v = r.fields[f];
    if (v in SCORE) { fieldSum += hasVeto ? 0 : SCORE[v]; fieldCount++; }
  }
}

const pct = (n, d) => d ? ((n / d) * 100).toFixed(1) + "%" : "-";

console.log("=== 评分报告 ===\n");
console.log(`总条数：${rows.length}`);
console.log(`严格通过率：${strictPass}/${rows.length} = ${pct(strictPass, rows.length)}`);
console.log(`字段加权分：${(fieldSum / fieldCount).toFixed(3)}`);
console.log(`致命错误  ：${fatal} 条（${pct(fatal, rows.length)}）\n`);

console.log("分層：");
for (const [k, v] of Object.entries(byLayer)) {
  console.log(`  ${k.padEnd(10)} ${v.pass}/${v.n} 通过  ${pct(v.pass, v.n).padStart(6)}   致命 ${v.fatal}`);
}

console.log("\n各字段分布：");
for (const f of FIELDS) {
  const c = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const r of rows) if (r.fields[f] in c) c[r.fields[f]]++;
  console.log(`  ${f.padEnd(18)} PASS ${String(c.PASS).padStart(3)}  WARN ${String(c.WARN).padStart(3)}  FAIL ${String(c.FAIL).padStart(3)}`);
}
```

## 5.2 你会看到一个"很难看"的数字

**大概率是 50–70% 的严格通过率，和 3–6 条致命错误。**

这不是坏消息。**这是你第一次拥有真实的、可复现的、有人评背书的数字。**

对比一下：

```text
昨天：'我觉得还行'
今天：'严格通过率 56.7%，字段加权 0.78，致命错误 4 条，其中 3 条是编造'
```

**第二句能直接变成行动：** 编造 3 条 → 提示词里"禁止补充原文没有的信息"这句要加强 → 第 124 节验证。

## 5.3 一个必须看的交叉表

**致命错误的 4 条，分别落在哪个 layer？**

```text
大概率分布：
  hard    2 条（含糊/极短输入，模型硬编）
  boundary 1 条（多类别时编造细节）
  inject  1 条（被注入成功）
  typical 0 条
```

**这个分布告诉你优化方向。** 如果致命错误全在 `typical`，你的提示词有根本问题；如果全在 `hard`，那是**能力边界**，可能需要换更强的模型，而不是改提示词。

**"改提示词"和"换模型"是两个完全不同的决策，代价差 20 倍。** 这个交叉表是唯一能帮你区分的工具。

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。今天重点不同，四块：

- **三个一致率数字** —— 严格 / 近邻 / 矛盾，各是多少
- **最差的字段是哪个，为什么** —— 大概率是 summary
- **我在第几条补了判定卡规则** —— 标准漂移的证据
- **致命错误落在哪个 layer** —— 这决定你接下来改什么

---

# 第 7 步：课后练习

## 练习一：把理由里的"模式"提取出来（20 分钟）

把你的 20 条 `reason` 通读一遍，**找出重复出现的关键词**。

```text
大概率会看到：
  '编造' × 5
  '超长' × 4
  '空话' × 3
  'urgency 判低' × 3
```

**每一个高频词 = 一个失败模式。** 把这 4 个失败模式写进 `NOTES.md`，它们就是第 124 节自动判分要重点检查的四项。

## 练习二：算人工评分的真实成本（10 分钟）

```text
我的平均判定耗时：__ 分钟/条
每天 1000 条 → __ 小时/天
按 ¥100/小时 算 → 每月 ¥______
```

**这个数字就是你做自动判分的全部动机。** 把它写在 `DECISION.md` 的开头（第 126 节要用）。

## 练习三：想清楚"为什么不能让自动判分超过人评"（10 分钟）

假设你的 `summary` 字段人评自己的一致率是 72%。

**现在你的自动判分脚本声称它和 final 标签的一致率是 85%。**

**这可能吗？为什么？**

**参考答案：** 不可能，除非你的 final 标签用了"取更严"策略，而自动判分恰好也偏向严 —— 那这叫"对齐了一个偏保守的目标"，不叫"比人更准"。

**真实情况是：** 一个人在 72% 一致率的任务上，任何判分器（人或机器）都不可能超过 72% 太多，因为**目标本身在抖动**。你最多能做到"和其中一次人评 90% 一致"，那已经是天花板。

**这句话的推论非常重要：** 第 124 节你看到自动判分的一致性只有 78% 时，不要急着改进它 —— **先看对应字段的人评一致性是多少。** 如果人评是 72%，78% 已经超过人自己了。

---

# 第 8 步：最终验收

## A. 数据齐了

- [ ] `labels/pass1.jsonl` —— 20 条，全部有 `labeled_at`
- [ ] `labels/pass2.jsonl` —— 打乱顺序的 20 条，同样填完
- [ ] `labels/final.jsonl` —— 处理完分歧的最终标签
- [ ] 每条都有 `reason`，WARN 和 FAIL 的理由具体

## B. 一致性算出来了

- [ ] 严格一致率：__%
- [ ] 近邻一致率：__%
- [ ] 矛盾（PASS vs FAIL）处数：__
- [ ] 每个字段的一致性单独看了
- [ ] 最差的字段是哪个，为什么

## C. 分歧都归因了

- [ ] 每一处矛盾（PASS vs FAIL）都写了原因
- [ ] 补进判定卡的规则数量 ≥ 1
- [ ] 记录了"在第几条补的规则"（标准漂移的诚实记录）

## D. 基线分数

- [ ] 严格通过率：__%
- [ ] 字段加权分：__
- [ ] 致命错误：__ 条
- [ ] 致命错误的 layer 分布

## E. 提交

```bash
git add 每周课程/04-工程可靠性/第18周-评测与选型/第04节课 03-练习代码/eval/labels
git commit -m "第123节：人评20条，严格一致XX%，基线通过率XX%"
git push
```

---

## 本节课要能说出口的一句话

> **人评不是"客观真理"，它是"一份有已知误差的测量"。**
> 你不先量出这个误差，就拿它当基准，那后面所有的自动判分只是在拟合噪声。

---

# 附：常见问题速查

**Q：20 条是不是太少？**

A：对"算一致率"来说偏少，但够用。**20 条 × 5 字段 = 100 个判定**，100 个样本上算百分比，误差大约 ±10 个点。**所以你的 80% 可能是 70%–90%。** 这话要写进 NOTES，别把 80% 说成 80.0%。

**Q：我可以只评 10 条吗？**

A：可以，但一致率就没意义了（10 条 × 5 = 50 个判定，误差 ±14 个点）。**要么 20 条，要么别算一致率直接往下走并注明"未测一致性"。**

**Q：第二遍我还是记得第一遍的结论怎么办？**

A：说明间隔太短。**三个补救：**

1. 换一份模型的输出评（`mid` 而不是 `cheap`），你的记忆会失效
2. 打乱顺序的力度加大（不只是洗牌，还把 20 条拆成两组间隔 30 分钟）
3. **接受它，并在 NOTES 里写清"一致率可能偏高 5–10 个点"**

**Q：`veto` 两次判不一样怎么处理？**

A：`make-final.js` 里已经取了并集（任一遍命中就算命中）。**但要单独统计"veto 分歧"有几处** —— 这个数字比字段分歧更重要，因为它涉及"致命 vs 不致命"的判断，差得最远。

**Q：我的项目只有 3 个字段，怎么办？**

A：改 `FIELDS` 数组就行。**但注意：字段越少，整条严格通过率会越高（因为要全 PASS 的条件变少了）。** 所以跨项目比较通过率毫无意义 —— 只有你自己的历史版本之间可比。

**Q：为什么要"取更严"？取平均不是更公平吗？**

A：**因为 WARN 不是分数，是状态。** 你没法"平均地 WARN"。而且取严的好处是：你的上线决策会更保守，而保守的代价是"少赚"，激进的代价是"翻车"。**一人公司翻一次车就没了。**

**Q：判 20 条花了我 3 小时，正常吗？**

A：偏慢，但可以接受。**慢的原因通常是判定卡有洞，你每条都在现推规则。** 判完这 20 条之后把洞补上，下次同样的活 1 小时能完成。

**Q：我发现前 10 条判错了，能回去改吗？**

A：**不能改 pass1。** 但可以在 `final.jsonl` 里，按新规则重判那 10 条 —— 前提是你要在 NOTES 里写清"第 1–10 条在 pass2 之后按补充规则重判"。**保留原始记录 + 说明变更，这是唯一诚实的做法。**
