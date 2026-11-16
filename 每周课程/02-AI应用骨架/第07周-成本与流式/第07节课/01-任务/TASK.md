# 第 49 节课：成本看板与报价——把六天的活变成一个数字

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 六天下来你已经有钱、有流式、有中断。但客户不会问你"P90 是多少"。
> 他会问一句：**"这个东西一个月多少钱？"**
> 今天你要能在 30 秒内答出来，并且**答的是赚的**。

**建议用时**：150 分钟
**你需要先完成**：第 48 节课（中断能真停，账里有 499）

---

# 第 0 步：三个必须能答出口的数字（10 分钟）

## 0.1 客户的三个问题

```text
① 这个功能一个月要花多少钱？
② 一个用户一个月大概用多少次？
③ 我卖 99 元 / 月，能赚吗？
```

**这三个问题，答不上来就别接活。**

**答上来的标志是：你能说出三个具体数字，并且知道它们的误差范围。**

## 0.2 今天要产出的三个数字

| 数字 | 单位 | 用途 |
|---|---|---|
| **单次成本** | 元/次 | 定价的地基 |
| **单用户月成本** | 元/月/人 | 算毛利 |
| **盈亏平衡用户数** | 人 | 算什么时候回本 |

**有了这三个，报价就不需要"看感觉"。**

## 0.3 一个真实的报价错误

**常见新手算法：**

```text
"模型调用很便宜，一次几厘钱，我卖 29 元/月，肯定赚"
```

**漏掉的成本：**

```text
① 服务器（哪怕最便宜的，也要 10-30 元/月）
② 域名 + HTTPS（约 100 元/年）
③ 你的时间（改 bug、回客户）
④ 失败重试（每次失败可能花一次钱）
⑤ 缓存失效后的重新计算
⑥ 客户乱用（有人一天问 500 次）
```

**这些加起来，常常是"模型成本"的 3-10 倍。**

**今天的看板要把它们都算进去。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `token-lab` 里） | 内容 |
|---|---|---|
| `scripts/report.js` | `scripts/` | 扩展：P50/P90/P99、取消率、缓存节省 |
| `scripts/pricing-model.js` | `scripts/` | 报价模型：成本 → 定价 → 毛利 |
| `src/app.js` | `src/` | 加 `/api/stats` 接口 |
| `public/dashboard.html` | `public/` | 一页看板（纯前端，读 `/api/stats`） |
| `results/e07.md` | `results/` | 报价表 |

---

# 第 1 步：把报表做全（30 分钟）

## 1.1 报表要有的六个维度

**你现在有：按天、按功能、按用户、按模型。**

**要补的：**

| 维度 | 回答什么问题 |
|---|---|
| **分位数** | 最贵的那 1% 是多少（决定 `max_tokens`） |
| **取消率** | 体验好不好（决定要不要优化 TTFT） |
| **缓存命中率** | 优化有没有效 |
| **估算占比** | 账目可信度 |

## 1.2 扩展 `scripts/report.js`

**加一个分位数函数：**

```javascript
const percentile = (values, p) => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));

  return sorted[index];
};
```

**注意 `Math.ceil((p/100)*n) - 1`：**

**这是"最近秩"法。P50 就是中位数，P99 就是第 99% 位置的值。**

**为什么不用插值：**

**你的数据量小（一天几十到几千条），插值的精度没意义，而且更难解释。**

**"P90 = 0.0082 元" 比 "P90 = 0.00817 元" 更好用。**

**加一段统计输出：**

```javascript
  const costs = rows.map((row) => row.cost);
  const durations = rows.filter((row) => row.ms > 0).map((row) => row.ms);
  const cancelled = rows.filter((row) => row.status === 499).length;
  const cached = rows.filter((row) => row.cached).length;
  const estimated = rows.filter((row) => row.estimated).length;

  console.log("\n===== 分位数 =====");
  console.log(`成本 P50 ${formatMoney(percentile(costs, 50))}　` +
    `P90 ${formatMoney(percentile(costs, 90))}　` +
    `P99 ${formatMoney(percentile(costs, 99))}　` +
    `最大 ${formatMoney(Math.max(...costs))}`);

  console.log(`耗时 P50 ${percentile(durations, 50)}ms　` +
    `P90 ${percentile(durations, 90)}ms　` +
    `P99 ${percentile(durations, 99)}ms`);

  console.log("\n===== 健康度 =====");
  console.log(`取消：${cancelled}（${((cancelled / rows.length) * 100).toFixed(1)}%）`);
  console.log(`缓存命中：${cached}（${((cached / rows.length) * 100).toFixed(1)}%）`);
  console.log(`token 估算：${estimated}（${((estimated / rows.length) * 100).toFixed(1)}%）`);
```

## 1.3 三个分位数的用法

**成本 P99 决定你的"最坏情况预算"：**

```text
P50 = 0.004 元（正常一次）
P99 = 0.042 元（有人粘长文）
最大 = 0.42 元（有个疯子粘了 3 万字）
```

**如果你按 P50 定价，遇到 1% 的高消耗用户就亏。**

**报价要按 P90 或 P99 算，不能按平均值。**

**耗时 P90 决定"用户等多久"：**

```text
P50 = 800ms   （大多数人感觉快）
P90 = 4200ms  （10% 的人等 4 秒）
```

**P90 才是用户抱怨的那个数。**

**取消率决定"要不要优化"：**

```text
< 5%    → 正常
5-15%   → 用户不耐烦，TTFT 要降
> 15%   → 内容质量或速度问题，先查这个
```

**这三个数字合起来，就是"系统健康度"。**

## 1.4 加一个"日成本预测"

**在报表末尾加：**

```javascript
  const days = new Set(rows.map((row) => dayOf(row.ts))).size;
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const perDay = totalCost / Math.max(days, 1);

  console.log("\n===== 预测 =====");
  console.log(`覆盖 ${days} 天，总成本 ${formatMoney(totalCost)}`);
  console.log(`日均：${formatMoney(perDay)}　月均（30 天）：${formatMoney(perDay * 30)}`);
  console.log(`如果用量翻倍：${formatMoney(perDay * 60)}/月`);
```

**为什么要算"翻倍"：**

**客户最常说的是"我们用户会涨"。**

**你要能立刻回答"涨到 2 倍，成本是这个数"。**

**这才叫"我算过"。**

---

# 第 2 步：做报价模型（35 分钟）

## 2.1 一个必须算全的成本清单

**新建 `scripts/pricing-model.js`：**

```javascript
import { formatMoney } from "../src/pricing.js";

/**
 * 全成本模型：不只是模型调用
 * 所有金额单位：元
 */
export const buildCostModel = ({
  // 模型成本（从账本算出来）
  costPerCall = 0.004,
  callsPerUserPerDay = 5,

  // 系统开销（按月）
  serverMonthly = 30,
  domainYearly = 80,
  sslYearly = 0,          // 用免费证书就是 0
  storageMonthly = 5,
  observabilityMonthly = 0,

  // 冗余系数：失败重试 + 缓存失效 + 浪费
  wasteRatio = 0.12,

  // 你的时间（按月）
  maintainHoursMonthly = 3,
  hourlyRate = 200,

  // 支付渠道（如果有）
  paymentFeeRatio = 0.006,   // 0.6%
}) => {
  const callsPerUserMonthly = callsPerUserPerDay * 30;
  const rawModelCostPerUser = costPerCall * callsPerUserMonthly;
  const modelCostPerUser = rawModelCostPerUser * (1 + wasteRatio);

  const infraMonthly =
    serverMonthly +
    storageMonthly +
    observabilityMonthly +
    (domainYearly + sslYearly) / 12;

  const laborMonthly = maintainHoursMonthly * hourlyRate;

  const fixedMonthly = infraMonthly + laborMonthly;

  return {
    callsPerUserMonthly,
    rawModelCostPerUser,
    modelCostPerUser,
    wasteRatio,
    infraMonthly,
    laborMonthly,
    fixedMonthly,
  };
};

export const priceIt = ({ model, pricePerUserMonthly, expectedUsers, paymentFeeRatio = 0.006 }) => {
  const revenue = pricePerUserMonthly * expectedUsers;
  const variable = model.modelCostPerUser * expectedUsers;
  const fixed = model.fixedMonthly;
  const paymentFee = revenue * paymentFeeRatio;

  const profit = revenue - variable - fixed - paymentFee;
  const grossMargin = revenue > 0 ? profit / revenue : 0;

  // 盈亏平衡：扣掉支付手续费后的单价，能覆盖多少个用户的变动成本 + 固定成本
  const perUserContribution = pricePerUserMonthly * (1 - paymentFeeRatio) - model.modelCostPerUser;
  const breakEvenUsers = perUserContribution > 0 ? Math.ceil(fixed / perUserContribution) : Infinity;

  return {
    revenue,
    variable,
    fixed,
    paymentFee,
    profit,
    grossMargin,
    perUserContribution,
    breakEvenUsers,
    perUserMonthlyCost: model.modelCostPerUser,
  };
};
```

## 2.2 跑三档定价

**在同一个文件里加一个 `main`：**

```javascript
const scenario = (label, expectedUsers, pricePerUserMonthly) => {
  const model = buildCostModel({ callsPerUserPerDay: 5 });
  const result = priceIt({ model, pricePerUserMonthly, expectedUsers });

  console.log(`\n===== ${label} =====`);
  console.log(`定价：${pricePerUserMonthly} 元/月　预期用户：${expectedUsers}`);
  console.log(`每用户月模型成本：${formatMoney(result.perUserMonthlyCost)}`);
  console.log(`每用户贡献毛益：${formatMoney(result.perUserContribution)}`);
  console.log(`月收入：${formatMoney(result.revenue)}`);
  console.log(`变动成本：${formatMoney(result.variable)}`);
  console.log(`固定成本：${formatMoney(result.fixed)}`);
  console.log(`支付手续费：${formatMoney(result.paymentFee)}`);
  console.log(`利润：${formatMoney(result.profit)}`);
  console.log(`毛利率：${(result.grossMargin * 100).toFixed(1)}%`);
  console.log(`盈亏平衡用户数：${result.breakEvenUsers}`);
};

console.log("===== 固定成本构成 =====");
const base = buildCostModel({ callsPerUserPerDay: 5 });
console.log(`基础设施：${formatMoney(base.infraMonthly)}/月`);
console.log(`我的时间：${formatMoney(base.laborMonthly)}/月`);
console.log(`固定合计：${formatMoney(base.fixedMonthly)}/月`);

scenario("保守：99 元，30 人", 30, 99);
scenario("标准：99 元，100 人", 100, 99);
scenario("激进：49 元，300 人", 300, 49);
scenario("不可行：19 元，50 人", 50, 19);
```

## 2.3 你要看懂的四个判断

### 判断一：盈亏平衡用户数

**`breakEvenUsers` 是"至少要有多少人付费才不亏"。**

```text
99 元、固定 630 元/月、每用户模型成本 0.66 元
→ 毛益 ≈ 98.34 - 0.66 = 97.68
→ 平衡点 ≈ 7 人
```

**7 个人就回本。**

**这个数字说明什么：**

```text
< 10 人   → 生意可做，风险低
10-30 人  → 需要一些获客能力
> 50 人   → 定价太低，或成本太高，要改
```

### 判断二：毛利率

```text
毛利率 > 80%  → 软件生意的正常水平
60-80%        → 还行，但要压成本
< 50%         → 别做，你不如去打工
```

**模型成本占比很低时，毛利率主要由定价决定。**

### 判断三：那个"不可行"的场景

**19 元 / 50 人：**

```text
收入 950 元
固定 630 元
模型 33 元
利润 287 元
```

**看起来赚？但这是"你每月只花 3 小时维护"的前提下。**

**现实是：50 个付费用户，你每月至少要花 15 小时。**

**`maintainHoursMonthly: 3` 是个乐观假设。对新客户要按 10-20 小时算。**

**这就是为什么"低价走量"对小团队是陷阱：用户越多，服务成本涨得比收入快。**

### 判断四：`wasteRatio` 为什么是 12%

**这个数字来自你的账本：**

```text
失败重试（第 41 节的两段式，失败会重跑）
缓存失效后重算
用户中断后重新提问
超时后的重试
```

**你可以实测：**

```javascript
const actual = 账本总收入;
const theoretical = 成功调用数 × 平均单次成本;
const ratio = actual / theoretical - 1;
```

**12% 是常见值。** 你的系统如果重试多，会到 25%。

## 2.4 把这个脚本变成日常工具

**加脚本：**

```json
    "pricing": "node scripts/pricing-model.js"
```

**每次要报价，先跑一次，改 `costPerCall` 和 `expectedUsers`，看毛利。**

**再也不会"凭感觉报价"。**

---

# 第 3 步：做一页看板（35 分钟）

## 3.1 加 `/api/stats` 接口

**在 `src/app.js` 里加：**

```javascript
import { readAll, sumBy, dayOf } from "./meter.js";

app.get("/api/stats", (req, res) => {
  const rows = readAll();

  if (rows.length === 0) {
    res.json({ empty: true });
    return;
  }

  const costs = rows.map((row) => row.cost);
  const sorted = [...costs].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];

  const total = costs.reduce((sum, cost) => sum + cost, 0);
  const days = new Set(rows.map((row) => dayOf(row.ts))).size;

  res.json({
    empty: false,
    totalCalls: rows.length,
    totalCost: total,
    avgCost: total / rows.length,
    days,
    costPerDay: total / Math.max(days, 1),
    costPerMonth: (total / Math.max(days, 1)) * 30,
    percentiles: { p50: pick(50), p90: pick(90), p99: pick(99), max: sorted[sorted.length - 1] },
    health: {
      cancelled: rows.filter((row) => row.status === 499).length,
      failed: rows.filter((row) => !row.ok && row.status !== 499).length,
      cached: rows.filter((row) => row.cached).length,
      estimated: rows.filter((row) => row.estimated).length,
      truncated: rows.filter((row) => row.truncated).length,
    },
    byDay: sumBy(rows, (row) => dayOf(row.ts)).map((item) => ({
      key: item.key,
      calls: item.calls,
      cost: item.cost,
    })),
    byFeature: sumBy(rows, (row) => row.feature).map((item) => ({
      key: item.key,
      calls: item.calls,
      cost: item.cost,
      avgCost: item.avgCost,
    })),
    byUser: sumBy(rows, (row) => row.userId).slice(0, 10).map((item) => ({
      key: item.key,
      calls: item.calls,
      cost: item.cost,
    })),
  });
});
```

**为什么"按用户只取前 10"：**

**一个看板显示 5000 个用户，等于什么都没显示。**

**前 10 就够了：你的成本 80% 通常来自前 10-20% 的用户。**

## 3.2 写 `public/dashboard.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>成本看板</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      margin: 0;
      padding: 28px;
      background: #f6f7f9;
      color: #16181d;
    }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 20px; }
    h2 { font-size: 14px; font-weight: 600; margin: 0 0 12px; color: #555; }
    .grid { display: grid; gap: 14px; }
    .cards { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 14px 16px;
    }
    .card .label { font-size: 12px; color: #6b7280; }
    .card .value {
      font-size: 22px;
      font-weight: 600;
      margin-top: 6px;
      font-variant-numeric: tabular-nums;
    }
    .card .sub { font-size: 12px; color: #9ca3af; margin-top: 4px; }
    .panels { grid-template-columns: 1fr 1fr; }
    @media (max-width: 820px) { .panels { grid-template-columns: 1fr; } }
    .panel {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 16px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid #f0f1f3; }
    th { color: #6b7280; font-weight: 500; font-size: 12px; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .bar {
      height: 6px;
      background: #1a6dff;
      border-radius: 3px;
      min-width: 2px;
    }
    .bar-wrap { background: #eef2f7; border-radius: 3px; height: 6px; margin-top: 4px; }
    .warn { color: #b45309; }
    .bad { color: #b91c1c; }
    .ok { color: #15803d; }
    .empty { color: #6b7280; font-size: 14px; padding: 40px; text-align: center; }
  </style>
</head>
<body>
  <h1>成本看板</h1>
  <div id="root" class="empty">加载中……</div>

  <script>
    const money = (value) => {
      if (value >= 1) return `¥${value.toFixed(2)}`;
      if (value >= 0.01) return `¥${value.toFixed(4)}`;
      return `${(value * 1000).toFixed(3)} 厘`;
    };

    const pct = (value, total) => (total === 0 ? "0%" : `${((value / total) * 100).toFixed(1)}%`);

    const render = (data) => {
      if (data.empty) {
        document.getElementById("root").innerHTML = '<div class="empty">账本还是空的，先去跑几次调用。</div>';
        return;
      }

      const { totalCalls, totalCost, avgCost, costPerDay, costPerMonth, percentiles, health, byDay, byFeature, byUser } = data;

      const maxDayCost = Math.max(...byDay.map((item) => item.cost), 0.0001);
      const maxFeatureCost = Math.max(...byFeature.map((item) => item.cost), 0.0001);

      const cancelRate = health.cancelled / totalCalls;
      const cacheRate = health.cached / totalCalls;
      const estRate = health.estimated / totalCalls;

      document.getElementById("root").className = "grid";
      document.getElementById("root").innerHTML = `
        <div class="grid cards">
          <div class="card">
            <div class="label">总成本</div>
            <div class="value">${money(totalCost)}</div>
            <div class="sub">${totalCalls} 次调用 · ${data.days} 天</div>
          </div>
          <div class="card">
            <div class="label">单次平均</div>
            <div class="value">${money(avgCost)}</div>
            <div class="sub">P90 ${money(percentiles.p90)} · P99 ${money(percentiles.p99)}</div>
          </div>
          <div class="card">
            <div class="label">日均</div>
            <div class="value">${money(costPerDay)}</div>
            <div class="sub">月均约 ${money(costPerMonth)}</div>
          </div>
          <div class="card">
            <div class="label">取消率</div>
            <div class="value ${cancelRate > 0.15 ? "bad" : cancelRate > 0.05 ? "warn" : "ok"}">${pct(health.cancelled, totalCalls)}</div>
            <div class="sub">${health.cancelled} 次 · ${cancelRate > 0.15 ? "明显偏高" : "正常"}</div>
          </div>
          <div class="card">
            <div class="label">缓存命中</div>
            <div class="value">${pct(health.cached, totalCalls)}</div>
            <div class="sub">${health.cached} 次</div>
          </div>
          <div class="card">
            <div class="label">token 估算占比</div>
            <div class="value ${estRate > 0.5 ? "warn" : ""}">${pct(health.estimated, totalCalls)}</div>
            <div class="sub">${estRate > 0.5 ? "账目可信度低" : "账目可信"}</div>
          </div>
        </div>

        <div class="grid panels">
          <div class="panel">
            <h2>按天</h2>
            <table>
              <thead><tr><th>日期</th><th class="num">次数</th><th class="num">成本</th><th></th></tr></thead>
              <tbody>
                ${byDay
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.key}</td>
                    <td class="num">${item.calls}</td>
                    <td class="num">${money(item.cost)}</td>
                    <td style="width:90px"><div class="bar-wrap"><div class="bar" style="width:${(item.cost / maxDayCost) * 100}%"></div></div></td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="panel">
            <h2>按功能</h2>
            <table>
              <thead><tr><th>功能</th><th class="num">次数</th><th class="num">成本</th><th class="num">平均</th></tr></thead>
              <tbody>
                ${byFeature
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.key}</td>
                    <td class="num">${item.calls}</td>
                    <td class="num">${money(item.cost)}</td>
                    <td class="num">${money(item.avgCost)}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
            <div style="margin-top:10px;font-size:12px;color:#6b7280">
              最贵：${byFeature[0]?.key || "-"}（占 ${pct(byFeature[0]?.cost || 0, totalCost)}）
            </div>
          </div>

          <div class="panel">
            <h2>按用户（前 10）</h2>
            <table>
              <thead><tr><th>用户</th><th class="num">次数</th><th class="num">成本</th><th></th></tr></thead>
              <tbody>
                ${byUser
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.key}</td>
                    <td class="num">${item.calls}</td>
                    <td class="num">${money(item.cost)}</td>
                    <td style="width:90px"><div class="bar-wrap"><div class="bar" style="width:${(item.cost / Math.max(byUser[0]?.cost || 0.0001, 0.0001)) * 100}%"></div></div></td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="panel">
            <h2>健康度</h2>
            <table>
              <tbody>
                <tr><td>截断</td><td class="num">${health.truncated}（${pct(health.truncated, totalCalls)}）</td></tr>
                <tr><td>失败</td><td class="num">${health.failed}（${pct(health.failed, totalCalls)}）</td></tr>
                <tr><td>取消</td><td class="num">${health.cancelled}（${pct(health.cancelled, totalCalls)}）</td></tr>
                <tr><td>成本 P50</td><td class="num">${money(percentiles.p50)}</td></tr>
                <tr><td>成本 P99</td><td class="num">${money(percentiles.p99)}</td></tr>
                <tr><td>单次最贵</td><td class="num">${money(percentiles.max)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    };

    fetch("/api/stats")
      .then((response) => response.json())
      .then(render)
      .catch((error) => {
        document.getElementById("root").innerHTML = `<div class="empty">加载失败：${error.message}</div>`;
      });
  </script>
</body>
</html>
```

## 3.3 跑起来

```text
npm run mock      （终端 A，如果你要用假模型补数据）
npm run server    （终端 B）
```

**打开：**

```text
http://localhost:4020/dashboard.html
```

**你应该看到六张卡片 + 四个表。**

## 3.4 看板的三个使用方式

### 用法一：每天早上看一眼

**30 秒看完：**

```text
昨天花了多少 → 日均那张卡
取消率高不高 → 取消率那张卡
有没有异常   → 单次最贵
```

**这三个数字异常，就去看"按用户"。**

### 用法二：改完东西看变化

**比如你改了 `max_tokens`：**

```text
改之前截图 → 改之后截图 → 对比"单次平均"和"P90"
```

**这才叫"改动有据"。**

### 用法三：给客户看（去掉敏感信息）

**客户最想看的是"你管得住"：**

```text
"这是成本看板，每次调用的钱都记着"
"这是取消率，说明体验没问题"
```

**能给客户看这个，你的专业度立刻上一个档次。**

**注意：给他看之前，删掉 `byUser` 那张表（含用户 id）。**

---

# 第 4 步：把六天的结果收进一张表（20 分钟）

## 4.1 `results/e07.md` 的完整结构

```markdown
# 第 07 周 成本与流式总结

## 一、基础数据

| 项 | 值 |
|---|---|
| 模型 | |
| 输入单价 | 元/千 token |
| 输出单价 | 元/千 token |
| 采样调用数 | |
| 采样天数 | |

## 二、成本分布

| 指标 | 值 |
|---|---|
| 总成本 | |
| 单次平均 | |
| P50 | |
| P90 | |
| P99 | |
| 最大 | |

## 三、优化前后对比

| 措施 | 单次成本 | 说明 |
|---|---|---|
| 无优化 | | |
| + max_tokens 限制 | | |
| + 历史裁剪 | | |
| + 缓存 | | |
| + 中断 | | |

## 四、性能

| 指标 | 无流式 | 流式 |
|---|---|---|
| TTFT | | |
| 总时长 | | |
| 取消率 | | |

## 五、报价模型

| 场景 | 定价 | 用户数 | 月收入 | 月成本 | 毛利 | 毛利率 | 平衡点 |
|---|---|---|---|---|---|---|---|
| A | | | | | | | |
| B | | | | | | | |
| C | | | | | | | |

## 六、结论

（三句话，见 4.3）
```

## 4.2 必须逐个测的四个优化

**你不知道每个优化值多少，就没法判断"该做到什么程度"。**

**测法：**

```text
① 基线：全不改，跑 20 次
② 只加 max_tokens=500，跑 20 次
③ + 历史裁剪到 6 轮，跑 20 次
④ + 缓存（重复问同一批问题），跑 20 次
⑤ + 中断（3 秒后停），跑 20 次
```

**每一档记录：单次平均成本、总成本。**

**你会得到一个"优化收益曲线"：**

```text
基线        100%
max_tokens  -35%
历史裁剪    -55%
缓存        -70%
中断        -75%
```

**这个曲线告诉你：前两个优化最关键，后两个是锦上添花。**

**而且它能让客户理解"为什么这个功能值 8000 块"。**

## 4.3 三句话结论

**写在 `results/e07.md` 最后，必须是这三句：**

```text
1. 这个功能每次调用成本 ___ 元，平均每用户每月 ___ 元。
2. 最大的成本来源是 ___，因为它 ___。
3. 按 ___ 元/月定价，毛利率 ___%，盈亏平衡 ___ 人。
```

**这三句话能说出来，这一周才算学完。**

**说不出来，说明你只是跟着敲了七天。**

---

# 第 5 步：五个必须知道的坑（15 分钟）

## 坑 1：按"平均值"定价

**平均值会被极端值拉偏。**

**正确做法：**

```text
用 P90 或 P99 定价
```

**因为：**

```text
100 个用户里，那 1 个用了 100 倍量的用户，会吃掉你全部利润
```

**定价按 P99，你才有安全边际。**

## 坑 2：忘了固定成本

**"模型才 0.4 元/用户/月，卖 29 元稳赚"**

**固定成本 630 元/月，30 个用户：**

```text
收入 870 元
模型 12 元
固定 630 元
利润 228 元
```

**赚 228 元，但这是你每月花 3 小时维护的前提下。**

**如果实际要 10 小时，你的时薪是 22.8 元。**

**比打工低。** 这就是"忘了固定成本"的后果。

## 坑 3：`wasteRatio` 设成 0

**"我的系统很稳定，不会重试"**

**但：**

```text
① 两段式流水线（第 41 节）天然有 2-6 次调用
② 缓存失效后要重算
③ 用户中断后重新提问 = 又一次调用
④ 限流重试
```

**`wasteRatio: 0` 会让你低估 10-25%。**

**正确做法：从账本里实测：**

```javascript
const actualTotal = 账本总成本;
const successCalls = 成功次数;
const avgPerSuccess = actualTotal / successCalls;
// 和你算的 costPerCall 比较，差额就是 waste
```

## 坑 4：把"我的时间"算成 0

**这是新手最常见的自欺。**

**"我自己的时间不算成本" → 你以为赚了，实际在赔。**

**正确做法：**

```text
按你的目标时薪算（比如 200 元/小时）
乘上"每月真实维护小时数"（不是乐观值）
```

**如果你的目标时薪是 200，每月维护 10 小时，固定成本就有 2000 元。**

**这意味着：99 元定价至少要有 21 个用户才回本。**

**这个数字能让你在最开始就做出正确决策。**

## 坑 5：看板数据不全就下结论

**"我的平均单次成本 0.004 元，很便宜"**

**但如果 `estimated` 占 80%，这个数字是估算的。**

**看板上的"token 估算占比"就是提醒你这个的。**

**规则：**

```text
估算占比 < 10%   → 数字可信
10-50%          → 参考，别当准
> 50%           → 这个数字不能用，先修 usage 采集
```

---

# 第 6 步：故意做三个实验（10 分钟）

## 实验 1：把 `costPerCall` 改大 10 倍

**跑 `npm run pricing`。**

**看"不可行"场景变成什么样。**

**这会让你意识到：成本估算错 10 倍，商业决策就整个错。**

## 实验 2：把 `maintainHoursMonthly` 从 3 改成 15

**看盈亏平衡点从 7 人变成多少人。**

**大概率变成 25-30 人。**

**这就是"低价走量"的真面目。**

## 实验 3：把 `paymentFeeRatio` 改成 0.06（信用卡常见）

**看毛利率掉多少。**

**如果掉超过 5 个百分点，说明支付渠道的选择对定价有实质影响。**

**（第 25 周会讲支付，那时你会有更具体的数字。）**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 成本分布五个数字（总、平均、P50、P90、P99）
2. 优化收益曲线（五档）
3. 三句话结论
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：给看板加"周同比"

**要求：** 本周成本和上周比，涨了还是跌了，百分比多少。

**为什么：** 单看"日均 12 元"没有评判标准，和上周比才知道"是不是在恶化"。

## 练习二：加"单用户成本排行"接口

**要求：** `/api/stats/user/:id` 返回这个用户的所有调用明细。

**用途：** 客户问"为什么这个月账单这么高"，你能立刻查出是哪个用户在什么时间用的。

**这是"客户信任"的来源。**

## 练习三：做一个"报价单生成器"

**要求：** 输入 `{ 用户数, 每次调用成本, 目标毛利率 }`，输出建议定价。

```javascript
const suggestPrice = ({ users, costPerCall, callsPerUserPerDay, targetMargin }) => {
  const modelCost = costPerCall * callsPerUserPerDay * 30;
  const fixedPerUser = 630 / users;
  // 价格 = (变动 + 固定/人) / (1 - 目标毛利)
  return (modelCost + fixedPerUser) / (1 - targetMargin);
};
```

**这就是你以后报价的第一个动作。**

## 练习四：算"流式的价值"

**要求：** 用你的取消率数据，算：

```text
流式之前（假设取消率 20%）：
流式之后（实际取消率 X%）：
减少的流失用户数：
折合成收入：
```

**注意：取消率高不一定是流失（他可能重试），但你可以按"50% 的取消会流失"估算。**

**把这个数字和"流式的开发成本"对比，你就知道该怎么给客户解释这项优化。**

## 练习五：想清楚这四个问题

```text
1. 为什么定价要按 P99 而不是平均值？
2. 为什么"我的时间"必须算进去？
3. 为什么 wasteRatio 不能设成 0？
4. 看板上"估算占比"高说明什么？
```

---

# 第 9 步：最终验收

## A. 报表

- [ ] `report.js` 有 P50/P90/P99
- [ ] 有取消率、缓存率、估算率
- [ ] 有日均和月均预测
- [ ] 有"用量翻倍"的估算

## B. 报价

- [ ] `pricing-model.js` 能跑
- [ ] 算了固定成本（基础设施 + 时间）
- [ ] 算出了毛利率和平衡点
- [ ] 跑过至少三档定价场景

## C. 看板

- [ ] `/api/stats` 能返回完整 JSON
- [ ] `dashboard.html` 能打开
- [ ] 六张卡片都正确
- [ ] 四个表都能看
- [ ] 取消率有颜色（正常/警告/异常）

## D. 结论

- [ ] `results/e07.md` 五张表都填了
- [ ] 优化收益曲线有五档数据
- [ ] 三句话结论能说出口

## 本节课要能说出口的一句话

> **能报出"每次 4 厘、每用户每月 6 毛、9 人回本"，你才配谈年度服务费。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 看板显示"账本是空的" | 没跑过调用 | 先 `npm run e01` 或用假数据 |
| P99 远大于 P50 | 有长尾调用 | 正常，定价按 P99 |
| 毛利率是负的 | 固定成本太高 | 提价或降固定成本 |
| 平衡点是 Infinity | 单用户毛益为负 | 定价低于变动成本，必须提价 |
| 估算占比 80% | 上游不给 usage | 换服务商，或接受低精度 |
| 取消率 30% | TTFT 太长或内容差 | 先看耗时 P90，再看质量 |
| 月均和账单对不上 | 有 waste 或失败未记 | 算 wasteRatio，检查中断记账 |
| 客户嫌贵 | 你没展示成本结构 | 给他看看板，说明"我管得住" |
