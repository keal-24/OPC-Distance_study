# 第 125 节课：比较模型成本

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天用同一套题、同一个判分器、算三个模型的**通过率 × 成本 × 速度**。
> 然后你会看到一个让你不舒服的结论：**贵 20 倍的模型，可能只值 5 个点。**

**建议用时**：110 分钟
**你需要先完成**：第 122 节的 3 份 `runs/*.jsonl`、第 124 节的判分器
**今天要装**：什么都不用装

---

# 第 0 步：先破除三个关于"选模型"的错觉（15 分钟）

## 0.1 错觉一：贵的就是好的

```text
你听到的：top 模型比便宜模型强得多
真实的：在"结构化输出"这种任务上，差距往往只有 3-8 个点
       在"开放对话""推理"上，差距可能是 20-30 个点
```

**关键变量是"任务类型"。** 你的任务是"把一句话整理成 5 字段 JSON" —— 这是**模式识别 + 规则执行**，不是推理。

**这类任务上，便宜模型的 85% 和贵模型的 92% 之间的差距，有 3 个点是"措辞更漂亮"，不是"更对"。**

**而这 3 个点，客户摸不出来，你却要付 20 倍的钱。**

## 0.2 错觉二：便宜模型便宜

```text
单价 20 倍的差距，在"短输入短输出"任务上会缩小
但在"长提示词"任务上会放大
```

**具体算一下（第 122 节你已经算过单条成本，这里再放大）：**

```text
假设 prompt.txt 800 tokens，输入 60 tokens，输出 120 tokens

便宜模型 $0.15 / $0.60
  (860×0.15 + 120×0.60)/1e6 = $0.000201

贵模型 $3.0 / $12.0
  (860×3.0 + 120×12.0)/1e6 = $0.00402

差 20 倍。但注意：
  便宜模型如果因为能力不足，需要"重试 1.3 次"
  → 实际成本 × 1.3 = $0.000261

  贵模型一次成功
  → $0.00402

  还是差 15.4 倍，不是 20 倍。
```

**反过来说：如果贵模型的通过率高到"不需要人工兜底"，而便宜模型需要 20% 人工介入** ——

```text
便宜：$0.000261 × 1000 条/天 = $0.26/天 + 200 条人工 × 1.5 分钟 = 5 小时/天
贵：  $0.00402  × 1000 条/天 = $4.02/天 + 80 条人工 × 1.5 分钟 = 2 小时/天

人工成本按 ¥100/小时：
  便宜：¥0.26×7 + 5×100 = ¥501/天
  贵：  ¥4.02×7 + 2×100 = ¥228/天
```

**贵模型总成本更低。** 这是最容易被忽略的一层：**你的时间比 token 贵得多。**

## 0.3 错觉三：只看通过率

**通过率高 5 个点，但如果那 5 个点全落在"typical"层，一点意义都没有。**

```text
模型 A：typical 100%、boundary 50%、hard 20%  → 总 63%
模型 B：typical 83%、boundary 88%、hard 60%   → 总 77%
```

**B 明显更好。** 但如果你只看总数，会以为是"14 个点的差距"。

**而 B 在 boundary 上的 88% 意味着：真实世界的复杂输入它能处理。A 的 50% 意味着：真实世界一半的复杂输入会翻车。**

**真实用户输入里，典型和复杂大概是 6:4。** 所以分层数据比总数更接近真实表现。

## 0.4 今天要产出的东西

```text
eval/compare.js            三个模型的可比报表
eval/COST-MATRIX.md        成本 × 通过率 矩阵
eval/curve.md              通过率-成本曲线（文字版，够了）
```

**不画图。** 三行数据的图不值得花时间，一张表就够。**你要的是能拿去做决定的表，不是好看。**

---

# 第 1 步：先把三份结果跑到同一版本（20 分钟）

## 1.1 检查三份结果的条件是否一致

**这一步经常发现问题。** 逐项核对：

```bash
cd 03-练习代码/eval

# 三个 meta 文件对比
for f in runs/*.meta.json; do
  echo "=== $f"
  node -e "
    const m = require('./$f');
    console.log('  model_actual:', m.model_requested);
    console.log('  prompt_sha  :', m.prompt_sha);
    console.log('  gen         :', JSON.stringify(m.gen));
    console.log('  cases       :', m.cases_count);
  "
done
```

**必须三个完全一致（除了 model 那行）：**

```text
prompt_sha 相同   ← 否则你比的不是同一个提示词，白比
gen 相同          ← temperature / max_tokens 必须一样
cases_count 相同  ← 否则分母不同，通过率不可比
```

**如果 `prompt_sha` 不一样 → 重跑。** 这一步不能省。

## 1.2 如果三份结果的题数不一样

**大概率是因为某次跑到一半挂了。** 用第 122 节练习里的 `--resume`，或者重跑。

**绝不能"用 28 条 vs 30 条"的通过率直接比。** 28 条的 71% 和 30 条的 71% 不是一回事。

## 1.3 用同一版判分器判三份

```bash
# 记下判分器版本（今天第 124 节改过几次，用内容哈希）
sha1sum judge-code.js judge-llm.js judge-prompt.txt | cut -c1-8

for m in cheap mid big; do
  node judge-run.js runs/*__${m}.jsonl
done
```

**三份 `.judged.jsonl` 必须是同一版判分器产的。** 加个字段记录：

```javascript
// 在 judge-run.js 里加
const crypto = await import("node:crypto");
const ver = crypto.createHash("sha256")
  .update(fs.readFileSync("judge-code.js", "utf8"))
  .update(fs.readFileSync("judge-prompt.txt", "utf8"))
  .digest("hex").slice(0, 8);

out.push({ ...r, judge_version: ver });
```

---

# 第 2 步：写对比脚本（30 分钟）

```javascript
// eval/compare.js
// 用法：node compare.js runs/*__cheap.judged.jsonl runs/*__mid.judged.jsonl runs/*__big.judged.jsonl
import fs from "node:fs";

const FIELDS = ["summary", "category", "urgency", "suggested_action", "need_human"];
const SCORE = { PASS: 1, WARN: 0.5, FAIL: 0 };
const LAYERS = ["typical", "boundary", "hard", "reject", "inject"];

const load = (p) => fs.readFileSync(p, "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const files = process.argv.slice(2);

const reports = files.map((f) => {
  const rows = load(f);
  const model = rows[0]?.model_key ?? "?";
  const runRaw = load(f.replace(".judged.jsonl", ".jsonl"));

  // 从原始结果里取 usage 和 latency
  const usageMap = new Map(runRaw.map((r) => [r.id, r]));

  let strict = 0, fatal = 0, fieldSum = 0, fieldN = 0;
  const byLayer = {};
  const fieldDist = Object.fromEntries(FIELDS.map((k) => [k, { PASS: 0, WARN: 0, FAIL: 0 }]));
  let inTok = 0, outTok = 0, latSum = 0, latN = 0, latencies = [];
  let repaired = 0, parseFail = 0;

  for (const r of rows) {
    const hasVeto = (r.veto ?? []).length > 0;
    const allPass = FIELDS.every((f) => r.fields[f] === "PASS");

    if (hasVeto) fatal++;
    if (!hasVeto && allPass) strict++;
    if (r.repaired) repaired++;
    if (!r.parse_ok) parseFail++;

    const layer = r.layer ?? "unknown";
    byLayer[layer] ??= { n: 0, pass: 0, fatal: 0 };
    byLayer[layer].n++;
    if (!hasVeto && allPass) byLayer[layer].pass++;
    if (hasVeto) byLayer[layer].fatal++;

    for (const f of FIELDS) {
      const v = r.fields[f];
      if (v in SCORE) {
        fieldSum += hasVeto ? 0 : SCORE[v];
        fieldN++;
        fieldDist[f][v]++;
      }
    }

    const u = usageMap.get(r.id);
    if (u?.usage?.input_tokens) inTok += u.usage.input_tokens;
    if (u?.usage?.output_tokens) outTok += u.usage.output_tokens;
    if (u?.latency_ms) { latSum += u.latency_ms; latN++; latencies.push(u.latency_ms); }
  }

  latencies.sort((a, b) => a - b);
  const p90 = latencies.length ? latencies[Math.floor(latencies.length * 0.9)] : null;

  return {
    model,
    n: rows.length,
    strict, strictPct: strict / rows.length,
    fatal,
    fieldScore: fieldSum / fieldN,
    byLayer,
    fieldDist,
    inTok, outTok,
    avgIn: inTok / rows.length, avgOut: outTok / rows.length,
    avgLat: latN ? latSum / latN : null,
    p90,
    repaired, repairPct: repaired / rows.length,
    parseFail,
  };
});

// ===== 打印主表 =====
const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 1) => (v === null || v === undefined ? "-" : Number(v).toFixed(d));

console.log("\n=== 模型对比 ===\n");
const head = ["指标", ...reports.map((r) => r.model)];
const widths = [22, ...reports.map(() => 12)];

console.log(head.map((h, i) => pad(h, widths[i])).join(""));
console.log("-".repeat(widths.reduce((a, b) => a + b, 0)));

const line = (label, getter, d = 1) =>
  console.log([pad(label, widths[0]), ...reports.map((r, i) => pad(num(getter(r), d), widths[i + 1]))].join(""));

line("题数", (r) => r.n, 0);
line("严格通过率 %", (r) => r.strictPct * 100);
line("字段加权分", (r) => r.fieldScore, 3);
line("致命错误 条", (r) => r.fatal, 0);
line("需要修复 %", (r) => r.repairPct * 100);
line("解析失败 条", (r) => r.parseFail, 0);
line("平均输入 tokens", (r) => r.avgIn, 0);
line("平均输出 tokens", (r) => r.avgOut, 0);
line("平均延迟 ms", (r) => r.avgLat, 0);
line("P90 延迟 ms", (r) => r.p90, 0);

// ===== 分层表 =====
console.log("\n=== 分层通过率 ===\n");
console.log([pad("层", 12), ...reports.map((r) => pad(r.model, 14))].join(""));
console.log("-".repeat(12 + 14 * reports.length));
for (const L of LAYERS) {
  const cells = reports.map((r) => {
    const b = r.byLayer[L];
    if (!b) return pad("-", 14);
    const p = ((b.pass / b.n) * 100).toFixed(0);
    return pad(`${b.pass}/${b.n} (${p}%)`, 14);
  });
  console.log([pad(L, 12), ...cells].join(""));
}

// ===== 字段分布 =====
console.log("\n=== 各字段 PASS 率 ===\n");
console.log([pad("字段", 20), ...reports.map((r) => pad(r.model, 12))].join(""));
console.log("-".repeat(20 + 12 * reports.length));
for (const f of FIELDS) {
  const cells = reports.map((r) => {
    const d = r.fieldDist[f];
    const t = d.PASS + d.WARN + d.FAIL;
    return pad(t ? ((d.PASS / t) * 100).toFixed(0) + "%" : "-", 12);
  });
  console.log([pad(f, 20), ...cells].join(""));
}
```

## 2.1 跑它

```bash
node compare.js runs/*__cheap.judged.jsonl runs/*__mid.judged.jsonl runs/*__big.judged.jsonl
```

**输出长这样（数字是示意）：**

```text
=== 模型对比 ===

指标                  cheap       mid         big
--------------------------------------------------
题数                  30          30          30
严格通过率 %          46.7        70.0        76.7
字段加权分            0.723       0.882       0.911
致命错误 条           7           4           3
需要修复 %            20.0        6.7         3.3
解析失败 条           2           0           0
平均输入 tokens       860         860         860
平均输出 tokens       118         132         145
平均延迟 ms           1840        3210        5100
P90 延迟 ms           3600        5800        9200

=== 分层通过率 ===

层          cheap         mid           big
------------------------------------------------
typical     10/12 (83%)   11/12 (92%)   11/12 (92%)
boundary    3/8 (38%)     6/8 (75%)     6/8 (75%)
hard        1/5 (20%)     3/5 (60%)     4/5 (80%)
reject      0/4 (0%)      1/4 (25%)     1/4 (25%)
inject      0/1 (0%)      0/1 (0%)      0/1 (0%)
```

## 2.2 四件必须看出的事

**① `typical` 层三个模型都差不多**

```text
83% / 92% / 92%
```

**典型题不区分模型。** 因为"客户说东西坏了"这种输入，任何模型都能处理。

**所以如果你只测典型题，你会得出"便宜模型够用"的结论 —— 而它是错的。**

**② `boundary` 层差距最大**

```text
38% / 75% / 75%
```

**37 个点的差距。** 这才是真正的分水岭。

**③ `hard` 层 big 明显领先**

```text
20% / 60% / 80%
```

**这里 big 比 mid 高 20 个点。** 说明难输入上，能力差距是真实的。

**④ `reject` 和 `inject` 全军覆没**

```text
0-25% / 0%
```

**这不是模型问题，是你的提示词没教它"该拒答"。** 第 19 周会专门解决。

**注意：如果三个模型都在某一层 0%，那这一层的分数不参与选型决策** —— 因为换模型解决不了，得改提示词。

## 2.3 这个表已经能得出结论了

```text
cheap → boundary 38%，致命 7 条 → 不能上线
mid   → boundary 75%，致命 4 条 → 能上线带人工兜底
big   → boundary 75%，致命 3 条 → 和 mid 几乎一样，但贵 3 倍、慢 1.6 倍
```

**初步结论：选 mid。**

**big 只在 hard 层领先 20 个点，而那 20 个点换来的是"致命错误从 4 条降到 3 条"。**

**问题是：那 1 条致命错误值 3 倍的钱吗？**

第 4 步会给你一个算法。

---

# 第 3 步：把成本算准（25 分钟）

## 3.1 单条成本

```javascript
// eval/cost.js
// 用法：node cost.js runs/*__cheap.judged.jsonl ...
import fs from "node:fs";

// 从供应商官网抄的最新价（美元 / 百万 tokens）
// 每次跑之前核对一遍，这个行业定价三个月就变
const PRICES = {
  cheap: { in: 0.15, out: 0.60 },
  mid:   { in: 1.00, out: 4.00 },
  big:   { in: 3.00, out: 12.00 },
};

// 汇率（自己填，别用记忆里的）
const CNY = 7.1;

const files = process.argv.slice(2);

console.log("模型      单条 $        单条 ¥      1000条/天 ¥/月    通过率");
console.log("-".repeat(72));

const rows = [];
for (const f of files) {
  const judged = fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const raw = fs.readFileSync(f.replace(".judged.jsonl", ".jsonl"), "utf8")
    .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

  const key = judged[0]?.model_key;
  const p = PRICES[key];
  if (!p) { console.log(`${key} 没有价格配置，跳过`); continue; }

  const usage = new Map(raw.map((r) => [r.id, r.usage]));
  let inTok = 0, outTok = 0;
  for (const r of judged) {
    const u = usage.get(r.id);
    inTok += u?.input_tokens ?? 0;
    outTok += u?.output_tokens ?? 0;
  }
  const n = judged.length;
  const perCall = ((inTok / n) * p.in + (outTok / n) * p.out) / 1e6;
  const strict = judged.filter((r) =>
    !(r.veto ?? []).length && ["summary","category","urgency","suggested_action","need_human"].every((f) => r.fields[f] === "PASS")
  ).length / n;

  rows.push({ key, perCall, strict });

  console.log(
    [
      key.padEnd(9),
      ("$" + perCall.toFixed(6)).padEnd(13),
      ("¥" + (perCall * CNY).toFixed(4)).padEnd(11),
      ("¥" + (perCall * CNY * 1000 * 30).toFixed(0)).padEnd(18),
      (strict * 100).toFixed(1) + "%",
    ].join("")
  );
}
```

## 3.2 加上"人工兜底成本"

**这才是真实成本的大头。**

```javascript
// eval/cost-total.js
// 一条完整的账：token + 人工

const HOURLY = 100;        // 你自己一小时值多少（人民币）
const MIN_PER_ITEM = 1.5;  // 人工处理一条要多久

// 用上面的 rows 继续算
for (const r of rows) {
  const failRate = 1 - r.strict;            // 需要人工的比例
  const humanPerDay = 1000 * failRate;      // 每天多少条要人工
  const humanHours = (humanPerDay * MIN_PER_ITEM) / 60;
  const humanCostMonth = humanHours * HOURLY * 30;
  const tokenCostMonth = r.perCall * CNY * 1000 * 30;

  console.log(`${r.key.padEnd(9)} token ¥${tokenCostMonth.toFixed(0).padStart(6)}  人工 ¥${humanCostMonth.toFixed(0).padStart(8)}  合计 ¥${(tokenCostMonth + humanCostMonth).toFixed(0).padStart(8)}`);
}
```

**输出（示意）：**

```text
cheap     token ¥   156  人工 ¥22500  合计 ¥22656
mid       token ¥  1065  人工 ¥13500  合计 ¥14565
big       token ¥  2906  人工 ¥10500  合计 ¥13406
```

## 3.3 这个结果会让你意外

```text
token 成本：cheap 比 big 便宜 18 倍
总成本  ：cheap 比 big 贵 69%
```

**因为人工是大头。**

**但这里有个陷阱，必须说清：**

```text
"人工 ¥22500/月"是假设你花 5 小时/天处理失败条目
真实情况可能是：你不处理，直接让客户看到差的输出
             → 那"人工成本"变成了"客户流失成本"
             → 更难算，但通常更大
```

**所以上面的表是"乐观版"：假设你有时间兜底。**

**如果没时间兜底，cheap 的成本是"客户满意度下降"，这个数字你算不出来，但它一定比 ¥22500 大。**

## 3.4 一个关键变量：失败条目你能"批处理"吗？

```text
失败条目分两类：
  A 类：需要逐条重写（比如编造的 summary）  → 1.5 分钟/条
  B 类：只需看一眼点确认（比如大小写不对）  → 10 秒/条
```

**如果你的失败大部分是 B 类，人工成本能降 9 倍。**

**这就是为什么第 124 节要区分"模型的错"和"管道的错"：**

```text
管道的错（大小写、代码块包裹）→ B 类，修代码一次解决，0 边际成本
模型的错（编造、判错类别）     → A 类，只能人工兜或者换模型
```

**"需要修复 20%"（cheap）里，如果全是管道问题，那就不是 20% 的人工，而是"8 行代码"。**

**务必回去翻你 cheap 的 30 条判分明细，把那 20% 分类。**

---

# 第 4 步：算"一条致命错误值多少钱"（20 分钟）

## 4.1 这是选型的分水岭

```text
mid：致命 4 条 / 30 = 13.3%
big：致命 3 条 / 30 = 10.0%

差 1 条。在 30 条样本上，1 条 = 3.3 个点。
```

**关键问题：这 1 条的差异是真实的，还是噪声？**

## 4.2 用第 122 节测出的噪声底线判断

```text
你测出的差异率是 __%（比如 20%）
→ 30 条里有 6 条两次输出可能不同
→ "1 条"的差异完全在噪声范围内
```

**结论：mid 和 big 在致命错误上的差异，统计上不成立。**

**必须做的一件事：把 30 条扩到"跑 3 次取平均"。**

```text
模型 mid：跑 3 次，致命分别是 4 / 5 / 3 条 → 均值 4.0
模型 big：跑 3 次，致命分别是 3 / 3 / 4 条 → 均值 3.3
```

**差 0.7 条。** 这比"差 1 条"更没有意义。

## 4.3 一条致命错误的真实代价

**分两种业务场景：**

**场景 A：内部工具**（工单给一线客服看，客服会核对）

```text
一条编造的 summary → 客服发现不对 → 改一下 → 多花 30 秒
代价：¥0.8
```

**场景 B：直接对客**（输出直接发给客户）

```text
一条编造的 summary（比如"已为您安排退款"，其实没安排）
→ 客户当真了 → 3 天后投诉 → 客服道歉 + 补偿
代价：¥50-500，还可能丢客户
```

**你的场景是哪个？** 决定这一条错误值 ¥0.8 还是 ¥300。

## 4.4 一个可以用的算式

```text
每天 1000 条 × 致命率 × 单条代价 = 每天致命成本

mid：1000 × 13.3% × ¥0.8  = ¥106/天（内部工具）
     1000 × 13.3% × ¥300 = ¥39900/天（直接对客）← 这个数字荒谬，说明不能上线

big：1000 × 10.0% × ¥0.8  = ¥80/天
     1000 × 10.0% × ¥300 = ¥30000/天
```

**关键洞察：如果是"直接对客"场景，mid 和 big 都不能上。** 你需要的不是"贵模型"，而是**第 19 节的兜底和审核机制**。

**这就是为什么第 19 周排在评测之后：** 你得先知道"有多差"，才知道"要多强的兜底"。

## 4.5 一张决策表

```text
                    内部工具              直接对客
mid（致命13.3%）    可上，人工兜          不可上，需加审核
big（致命10.0%）    可上，人工兜          不可上，需加审核
cheap（致命23.3%）  勉强，需大量人工       绝对不可上
```

**如果两个都"不可上"，选型问题的答案不是"换模型"，而是"加一层"。**

**这是本课最重要的一句话：选型解决不了所有问题。有些问题必须靠架构解决。**

---

# 第 5 步：画一张"通过率-成本"表（15 分钟）

## 5.1 不画图，做表

**三行数据画图是浪费。** 做一张能直接放进客户报告的表格：

```markdown
# eval/COST-MATRIX.md

## 测试条件

| 项 | 值 |
|---|---|
| 测试集 | 30 条（典型 12 / 边界 8 / 刁难 5 / 拒答 4 / 注入 1） |
| 判定标准 | `eval-spec.md` v1.2 |
| 提示词 | `prompt.txt`（sha: a1b2c3d4） |
| temperature | 0 |
| 判分方式 | 代码判分 + 模型判分（judge v3，与人评一致率 82%） |
| 噪声底线 | 同模型两次差异 6/30 = 20% |

## 结果

| 模型 | 严格通过率 | 字段分 | 致命 | boundary | hard | 平均延迟 | P90 | 单条成本 | 每月总成本* |
|---|---|---|---|---|---|---|---|---|---|
| cheap | 46.7% | 0.723 | 7 | 38% | 20% | 1.8s | 3.6s | ¥0.0014 | ¥22656 |
| mid | 70.0% | 0.882 | 4 | 75% | 60% | 3.2s | 5.8s | ¥0.0095 | ¥14565 |
| big | 76.7% | 0.911 | 3 | 75% | 80% | 5.1s | 9.2s | ¥0.0259 | ¥13406 |

\* 每月总成本 = token 成本 + 人工兜底成本（1000 条/天，¥100/小时，1.5 分钟/条）

## 结论

**选 mid。**

理由：
1. boundary 层达到 75%，与 big 持平 —— 这是真实世界复杂输入的处理能力
2. big 只在 hard 层领先 20 点，但 hard 层只占真实流量的约 10%
3. mid 的延迟和成本是 big 的 1/2.7，而通过率只差 6.7 点
4. 致命错误 4 条 vs 3 条，差异在噪声范围内（1 条 = 3.3 点 < 20% 噪声率）

## 什么情况下换回来

- 如果 hard 层占比超过 25%（说明客户输入确实很差），换 big
- 如果 mid 出现连续 3 天通过率下降超过 10 点，检查是不是供应商换后端了
- 如果供应商把 big 的价格降到 mid 的 2 倍以内，换 big
```

## 5.2 "什么情况下换回来"这一栏为什么必须有

**因为你会忘记今天的推理过程。**

三个月后你会看到 mid 的账单，想"当时为什么不用便宜的"，然后换成 cheap，然后线上炸。

**写下"什么情况下换回来"，等于写下"什么情况下不要换"。** 这是给未来的自己留的护栏。

## 5.3 一个校准动作

**把你的表给对方（客户或同事）看一眼，问一个问题：**

```text
"如果我只给你这三行数字，你会选哪个？"
```

**如果答案和你的结论不一致 → 你的表缺了关键信息，或者你的结论没写清。**

**这比自我检查有效得多。**

---

# 第 6 步：一个必须做的额外实验（15 分钟）

## 6.1 用 mid 判 cheap 的失败，看是不是"真失败"

**从 cheap 的 7 条致命错误里挑 3 条，人工看一遍。**

```text
三种可能：
① 真失败（模型确实编造/判错）→ 计入
② 判分器误判              → 修判分器
③ 业务上两可              → 判定卡要放宽
```

**这一步经常改变结论。** 假设 7 条里有 2 条是判分器误判：

```text
cheap 致命：7 → 5 条
通过率：46.7% → 53.3%

结论可能从"cheap 完全不能用"变成"cheap 能用但需要大量人工"
```

## 6.2 反向也做一次

**从 big 的 3 条致命错误里挑 1 条看。**

**如果 big 的致命错误也是误判**，那三个模型的差距进一步缩小，结论会更偏向 mid。

## 6.3 一个诚实的做法：把不确定性写进报告

```markdown
## 数据可靠性说明

- 测试集 30 条，百分比误差约 ±9 个点（95% 置信）
- 致命错误 3-7 条，差异在噪声范围内，不构成选型依据
- 判分器与人评一致率 82%，即约 18% 的判定可能有偏差
- 三条致命错误经人工复核，其中 2 条为判分器误判

因此：**通过率的绝对值不可信，但相对排序可信。**
```

**这段话说出来，比你多跑 100 条题更能建立信任。** 客户听得懂"误差"这个词，听不懂"92%"这个数字。

---

# 第 7 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **一张三模型对比表**（通过率/字段分/致命/分层/延迟/成本）
- **你的结论 + 三条理由**
- **"什么情况下换回来"**
- **三条致命错误的人工复核结果**

---

# 第 8 步：课后练习

## 练习一：算出"临界点价格"（20 分钟）

**问题：big 的价格降到多少，你才会换？**

```text
big 当前：通过率 +6.7 点，致命 -1 条，延迟 +1.9s，成本 2.7 倍
```

**算法：算出"每多买 1 个通过率点，愿意付多少钱"。**

```text
你的业务：每天 1000 条
1 个点 = 10 条
10 条失败的人工成本 = 10 × 1.5 分钟 × (¥100/60) = ¥25/天 = ¥750/月

mid → big 贵 6.7 点 = 6.7 × ¥750 = ¥5025/月 的"价值"
实际贵：(13406 - 14565) 反向 → big 反而便宜 ¥1159/月（因为人工少）

所以 big 更划算？—— 但那 6.7 点里有 20% 在噪声范围内...
```

**这个练习的目的是让你发现：一旦把人工算进来，结论可能反转。**

## 练习二：算"如果只跑典型题会怎样"（15 分钟）

```text
只看 typical 层：
  cheap 83%  mid 92%  big 92%

如果我只测 typical，结论是什么？
```

**参考答案：** 结论是"cheap 稍差但能接受，mid 和 big 一样，所以选 mid"。

**这个结论恰好对，但理由全错。** 因为 cheap 在 boundary 上只有 38%。

**"歪打正着"是最危险的** —— 你会以为自己的方法对，然后在下一个项目上用同样的方法，得到一个完全错的结论。

## 练习三：判断这个场景（15 分钟）

```text
你的客户说：'我们不需要那么高的准确率，80% 就够了，能便宜点吗？'
```

**你的回答是什么？**

**参考答案：**

```text
不能只降准确率，因为准确率不是一个旋钮。
你能降的是"模型档位"，而它同时改变四件事：
  通过率 -23 点
  致命错误 +3 条
  延迟 -1.4 秒
  成本 -¥1159/月（注意：是更贵，因为人工变多）

所以正确的回答是：
'降档能省钱的是 token 费（每月省 ¥900），但人工兜底成本会涨 ¥9000。
 总成本反而增加。如果你要降成本，我们应该改流程（比如只处理高风险条目），
 而不是降模型档位。'
```

**这个回答会让客户觉得你专业。** 因为你在算他没想到的那笔账。

---

# 第 9 步：最终验收

## A. 三份结果可比

- [ ] `prompt_sha` 三份一致
- [ ] `gen` 三份一致
- [ ] 题数三份一致
- [ ] 同一版判分器（`judge_version` 相同）

## B. 对比表出来了

- [ ] `compare.js` 跑通
- [ ] 主表有 10 个指标
- [ ] 分层表（五层）
- [ ] 各字段 PASS 率

## C. 成本算准了

- [ ] 单条 token 成本（用真实 usage）
- [ ] 人工兜底成本（明确假设）
- [ ] 每月总成本
- [ ] 失败条目分 A 类（逐条重写）和 B 类（点确认）

## D. 结论有依据

- [ ] `COST-MATRIX.md` 写完
- [ ] 结论是一句明确的话（"选 mid"）
- [ ] 三条理由，每条都有数字
- [ ] "什么情况下换回来"写了
- [ ] 数据可靠性说明（噪声、误差、误判）

## E. 致命错误复核

- [ ] cheap 的 7 条里挑了 3 条人工看
- [ ] 归了因（真失败/判分器误判/业务两可）
- [ ] big 的 3 条里挑了 1 条看

## F. 提交

```bash
git add 每周课程/04-工程可靠性/第18周-评测与选型/第06节课 03-练习代码/eval
git commit -m "第125节：三模型对比，选 mid，boundary 75%"
git push
```

---

## 本节课要能说出口的一句话

> **选型不是"选最强的"，是"选总成本最低且致命错误可接受的那个"。**

而"总成本"里，你的时间通常比 token 贵 100 倍。

---

# 附：常见问题速查

**Q：我只有两个模型的 key，怎么办？**

A：两个也能做对比。**第三个用公开 benchmark 数字代替，报告里必须写"引用，非实测"。** 但要注意：公开 benchmark 和你的任务完全不同，**只能当参考，不能当依据**。

**Q：三个模型的通过率差距只有 3 个点，怎么选？**

A：**这时候成本、延迟、稳定性就是决定因素。** 而且 3 个点在 30 条上完全是噪声 —— 你应该说"三个模型在我们的任务上无法区分"，然后按成本选，或者按"哪家服务更稳"选。

**这个结论本身是有价值的**，比硬选一个更专业。

**Q：为什么 `cheap` 在 reject 层是 0%？**

A：大概率是你的提示词没教它"该拒答"。**三个模型都 0%，说明问题在提示词，不在模型。** 这类"所有模型都失败"的层，不参与选型。

**识别方法：如果某层所有模型都 < 30%，去改提示词，别换模型。**

**Q：延迟 P90 为什么比平均重要？**

A：因为用户感受到的是"最慢的那次"。**平均 1.8 秒但 P90 是 9 秒，用户每 10 次就有一次觉得卡。**

而且如果你的系统有超时（第 16 周设的 90 秒），P99 决定了你的超时率。

**Q：`token 成本 ¥156` 和 `人工成本 ¥22500`，这两个数字放一起不是很怪吗？**

A：**是很怪，而且这正说明一个常见的错误：只看 token 单价。**

真实的一人公司里，"人工兜底"就是你自己。**你的时间就是成本，哪怕你不给自己发工资。**

**Q：如果我的失败条目都是"管道问题"，成本怎么算？**

A：**那就不是人工成本，是"一次性工程成本"。**

```text
20% 失败全是大小写问题 → 修一行 toLowerCase() → 成本 ¥0，一次性 5 分钟
```

**所以第 3.4 步那个分类至关重要。** 分类错了，整个成本表都是错的。

**Q：客户问我"为什么不用最贵的模型"，怎么答？**

A：**用这张表答。**

```text
'最贵的模型在难输入上领先 20 个点，但那类输入占我们流量的 10%，
 折算到整体是 2 个点。为这 2 个点，成本增加 2.7 倍、延迟增加 60%。
 我们建议先用 mid，同时把省下来的钱投入第 19 周的兜底机制 ——
 那个能解决 5 个点的致命错误，比换模型划算。'
```

**这段话同时展示了：数据能力、成本意识、架构判断。** 比"它更强"有说服力一百倍。
