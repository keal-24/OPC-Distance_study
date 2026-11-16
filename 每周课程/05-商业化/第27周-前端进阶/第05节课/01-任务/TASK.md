# 第 187 节课：一张表看不出趋势

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 客户要"看数据"，你说"我给你导个 Excel"——**他要的不是数字，是"这个月比上个月好还是坏"。**
> 这一节做图表，但重点不是"怎么画"，是"**画什么，以及什么不该画**"。

**建议用时**：130 分钟
**你需要先完成**：第 186 节（表单能用，错误提示到位）

---

# 第 0 步：先看两个失败案例（15 分钟）

## 0.1 案例一：把每个月都画成柱状图

**你有 24 个月的数据，画成 24 根柱子：**

```text
▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆
```

**客户看到的是：一片密密麻麻的柱子。**

**他能看出"这个月比上个月好吗"？不能。**

**正确做法：** **只画最近 12 个月，或者在 24 个月上叠一条趋势线。**

## 0.2 案例二：用饼图表示 12 个分类

```text
       ╱‾‾‾╲
     ╱  12%  ╲
    │ 8%      │
    │    5%   │
     ╲  4%   ╱
      ╲__3%_╱
      还有 7 个都是 1%
```

**饼图超过 5 个分类就没法看。** **客户分不清那 7 个 1% 哪个是哪个。**

**正确做法：** **前 4 个 + "其他"。**

## 0.3 一句话原则

> **图表的目的是"让人做出判断"，不是"把数据显示出来"。**

**判断什么：**

```text
趋势     → 折线图（时间在 X 轴）
对比     → 柱状图（分类在 X 轴）
构成     → 堆叠柱 / 饼图（分类 ≤ 5）
分布     → 直方图
关系     → 散点图
单一指标 → 一个大数字 + 一个变化率（不要图）
```

**最后一条最常被违反。**

**"本月收入 ¥128,400" —— 这不需要图表。** **需要的是一个 28px 的数字和一个 ↑12%。**

---

# 第 1 步：决定画什么（25 分钟）

## 1.1 从业务问题倒推

**不要从"我有什么数据"出发，从"客户要做什么决定"出发。**

| 客户的问题 | 需要的图 |
|---|---|
| 这个月比上个月好还是坏？ | 数字 + 变化率 + 12 个月折线 |
| 哪个客户贡献最大？ | 横向柱状图（前 10） |
| 钱都花在哪了？ | 堆叠柱或饼图（分类 ≤ 5） |
| 什么时候最忙？ | 按小时/星期的柱状图 |
| 订单金额分布如何？ | 直方图（分桶） |
| 收入和订单量的关系？ | 双轴折线，或者干脆两张图 |

**注意最后一行的建议：** **"双轴折线"是很多人会做但客户看不懂的东西。**

**两张小图并列，比一张双轴图清楚得多。**

## 1.2 五个具体的设计规则

### 规则一：一屏只讲一件事

**一张图里不要塞"收入、订单数、客单价"三条线。**

```text
客户想问"收入涨了吗"
看到三条线缠在一起
→ 他要先分辨哪条是收入
→ 然后发现三条线的单位不同
→ 放弃
```

**一张图一件事，下面再放一张。**

**滚一下比"解读一张复杂图"便宜得多。**

### 规则二：数字要有对比

```text
❌ 收入 ¥128,400
✅ 收入 ¥128,400（环比 +12%）

❌ 订单 1,024 笔
✅ 订单 1,024 笔（环比 +8%，上月 948）
```

**没有对比的数字，客户不知道是好是坏。**

**"环比"（跟上个月比）和"同比"（跟去年同月比），客户最熟的是环比。**

**这一节默认用环比。**

### 规则三：Y 轴从 0 开始

```text
❌ Y 轴从 120000 开始，收入的波动看起来像过山车
✅ Y 轴从 0 开始，波动真实
```

**这是"误导性图表"的经典问题。**

**例外：** **当数值都在一个很窄的区间（比如转化率 3.1%—3.4%），从 0 开始会变成一条平线，看不出变化。**

**这时候可以不用 0 起点，但必须在图上明确标注（比如 Y 轴加一个折断符号）。**

**这一节默认从 0 开始。**

### 规则四：颜色只用来区分"类别"

```text
❌ 每根柱子一个颜色（彩虹色）→ 看起来像在表达什么，其实没有
✅ 同一类数据同一个颜色，用高亮标出"当前"或"异常"
```

**客户会从颜色里找含义。** **随机上色会让他困惑。**

**这一节最多用三种颜色：**

```text
主色（蓝）    正常数据
强调色（橙）  当前月 / 选中项
警示色（红）  异常值
```

### 规则五：能用一个数字说的，不要画图

**看这个判断：**

```text
"本月新增客户 12 家"
→ 一个大数字

"最近 12 个月新增客户数"
→ 折线图
```

**前者用图是浪费。** **而且一个 48px 的数字比一张图更有冲击力。**

## 1.3 自检点

**打开你的系统，列出所有"客户会想看数据"的地方：**

```text
① 首页仪表盘：收入、订单、客户数
② 订单页：按状态分布
③ 用量页：本月用了多少额度
④ 对账页：这个月对上了几笔
```

**给每一处写下答案：**

| 位置 | 客户要做什么判断 | 用什么 |
|---|---|---|
| | | |

**如果某一行你写的是"看总额"，那可能只需要一个大数字。**

---

# 第 2 步：装一个 12KB 的图表库（20 分钟）

## 2.1 为什么不用 ECharts / Chart.js 完整版

| | ECharts | Chart.js | uPlot |
|---|---|---|---|
| 体积（min+gzip） | ~300KB | ~70KB | **~12KB** |
| 适合 | 大屏、复杂交互 | 通用 | 时间序列 |
| 学习成本 | 高 | 中 | 低 |

**你现在只需要"折线 + 柱状 + 一条趋势线"。**

**300KB 的库，客户在 4G 上要多等 1.5 秒。**

**这一节用 uPlot。** **如果你需要更复杂的图（地图、桑基图、关系图），那时候再换。**

## 2.2 下载

**在 `saas-lab` 里：**

```text
curl -o public/vendor/uplot.min.js https://cdn.jsdelivr.net/npm/uplot@1.6.31/dist/uPlot.iife.min.js
curl -o public/vendor/uplot.min.css https://cdn.jsdelivr.net/npm/uplot@1.6.31/dist/uPlot.min.css
```

**如果 `curl` 不通（网络问题），直接从浏览器的地址栏打开那两个 URL，右键另存。**

**自检点：**

```text
ls -lh public/vendor/
```

**应该看到 `uplot.min.js` 大约 45KB（未压缩前）或者更小。**

**如果下载下来是 HTML（比如一个 404 页面），文件大小会异常。**

**打开文件看一眼，第一行应该是 JS 代码，不是 `<!doctype html>`。**

## 2.3 写一个折线图

**新建 `public/js/chart.js`：**

```js
(function () {
  function createLineChart(el, options) {
    const { labels, values, height = 180, color = '#1f6feb', fill = true, formatY = (v) => v } = options;

    const data = [
      labels.map((_, i) => i),
      values,
    ];

    const opts = {
      width: el.clientWidth || 300,
      height,
      padding: [12, 8, 0, 0],
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: {
          time: false,
          values: (u, splits) =>
            splits.map((i) => {
              const label = labels[i];
              return label == null ? '' : label;
            }),
        },
        y: {
          range: (u, min, max) => [0, max * 1.1 || 1],
          values: (u, splits) => splits.map((v) => formatY(v)),
        },
      },
      axes: [
        {
          stroke: '#8b919c',
          grid: { show: false },
          ticks: { show: false },
          font: '11px -apple-system, sans-serif',
          size: 24,
        },
        {
          stroke: '#8b919c',
          grid: { stroke: '#eef0f3', width: 1 },
          ticks: { show: false },
          font: '11px -apple-system, sans-serif',
          size: 44,
        },
      ],
      series: [
        {},
        {
          stroke: color,
          width: 2,
          fill: fill ? color + '1a' : undefined,
          points: { show: false },
        },
      ],
    };

    const u = new uPlot(opts, data, el);

    const onResize = () => {
      u.setSize({ width: el.clientWidth || 300, height });
    };

    window.addEventListener('resize', onResize);

    return {
      setData: (newLabels, newValues) => {
        u.setData([newLabels.map((_, i) => i), newValues]);
      },
      destroy: () => {
        window.removeEventListener('resize', onResize);
        u.destroy();
      },
      instance: u,
    };
  }

  function createBarChart(el, options) {
    const { labels, values, height = 180, color = '#1f6feb', formatY = (v) => v } = options;

    const data = [labels.map((_, i) => i), values];

    const opts = {
      width: el.clientWidth || 300,
      height,
      padding: [12, 8, 0, 0],
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: {
          time: false,
          values: (u, splits) => splits.map((i) => (labels[i] == null ? '' : labels[i])),
        },
        y: {
          range: (u, min, max) => [0, max * 1.1 || 1],
          values: (u, splits) => splits.map((v) => formatY(v)),
        },
      },
      axes: [
        {
          stroke: '#8b919c',
          grid: { show: false },
          ticks: { show: false },
          font: '11px -apple-system, sans-serif',
          size: 24,
        },
        {
          stroke: '#8b919c',
          grid: { stroke: '#eef0f3', width: 1 },
          ticks: { show: false },
          font: '11px -apple-system, sans-serif',
          size: 44,
        },
      ],
      series: [
        {},
        {
          stroke: color,
          fill: color,
          width: 0,
          points: { show: false },
          paths: (u, seriesIdx) => {
            const { ctx, bbox } = u;
            const data = u.data[seriesIdx];
            const xs = u.data[0];
            const gap = bbox.width / xs.length;
            const barW = Math.max(4, Math.min(28, gap * 0.6));

            return (u, seriesIdx, idx0, idx1) => {
              const scaleY = u.scales.y;
              const scaleX = u.scales.x;

              ctx.save();
              ctx.fillStyle = color;

              for (let i = idx0; i <= idx1; i++) {
                const v = data[i];
                if (v == null) continue;

                const cx = u.valToPos(xs[i], 'x');
                const y = u.valToPos(v, 'y');
                const baseY = u.valToPos(scaleY.min, 'y');

                const h = Math.max(1, baseY - y);
                ctx.fillRect(cx - barW / 2, y, barW, h);
              }

              ctx.restore();
              return null;
            };
          },
        },
      ],
    };

    const u = new uPlot(opts, data, el);

    const onResize = () => u.setSize({ width: el.clientWidth || 300, height });
    window.addEventListener('resize', onResize);

    return {
      setData: (newLabels, newValues) => u.setData([newLabels.map((_, i) => i), newValues]),
      destroy: () => {
        window.removeEventListener('resize', onResize);
        u.destroy();
      },
      instance: u,
    };
  }

  window.Chart = { createLineChart, createBarChart };
})();
```

**配合的 HTML：**

```html
<link rel="stylesheet" href="/vendor/uplot.min.css">
<script src="/vendor/uplot.min.js"></script>
<script src="/js/chart.js"></script>

<div class="card">
  <div class="section__title">最近 12 个月收入</div>
  <div id="chart-revenue" style="margin-top:12px"></div>
</div>
```

**初始化：**

```js
const el = document.getElementById('chart-revenue');

Chart.createLineChart(el, {
  labels: ['12月', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月'],
  values: [86200, 74100, 68900, 92300, 101400, 98700, 110200, 105800, 118600, 124300, 121000, 128400],
  formatY: (v) => (v >= 10000 ? Math.round(v / 1000) + 'k' : v),
});
```

## 2.4 五个关键点

### `uplot` 要固定尺寸

**uPlot 不像 CSS 那样自适应。** **必须在创建时给 `width` 和 `height`。**

**所以创建时用 `el.clientWidth`，`resize` 时 `u.setSize`。**

**注意：`el.clientWidth` 在元素还没插入 DOM 时是 0。** **所以要先 `innerHTML` 插进去，再初始化图表。**

### Y 轴单位缩写

```js
formatY: (v) => (v >= 10000 ? Math.round(v / 1000) + 'k' : v)
```

**128,400 显示成 `128k`。**

**为什么：** **Y 轴空间有限，`128,400` 会把刻度挤在一起。**

**注意这是"元"的缩写。** **如果你的数据是"分"，要先用 `formatY: (v) => (v/100).toFixed(0)` 之类转。**

**这一节的数据都是"元"，直接缩写。**

### `range: (u, min, max) => [0, max * 1.1]`

**Y 轴从 0 开始，顶部留 10% 空间。**

**不留空间的话，最高点会贴着图的上边缘，看起来像被裁掉了。**

### `cursor: { show: false }`

**uPlot 默认有一个十字光标和 tooltip。**

**手机上这个东西很难用（手指一碰就出来，还挡视线）。**

**关掉它。** **要看具体数值，在图表下面放一张小表。**

### `grid: { show: false }` 在 X 轴

**不显示 X 轴的竖网格线。**

**为什么：** **12 根竖线会把图切得很碎，看起来像柱状图。**

**只留 Y 轴的横网格线（`grid: { stroke: '#eef0f3' }`），够用了。**

## 2.5 自检点

**三个检查：**

```text
① 375px 宽下，12 个标签都显示出来了吗（会不会挤在一起）
② 把容器宽度改成 200px，图表跟着缩了吗
③ 数据全是 0 的时候，会不会崩
```

**第 ③ 条最容易崩。**

**`max * 1.1` 在 `max = 0` 时还是 0，** **uPlot 会除以 0 或者画出一条线在底部。**

**改：**

```js
range: (u, min, max) => [0, max > 0 ? max * 1.1 : 1],
```

**所有图表库都有这个"全零"的边界问题。** **记住要处理。**

---

# 第 3 步：数据从哪来（30 分钟）

## 3.1 后端接口

**新建 `src/routes/stats.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');

const router = express.Router();
router.use(auth, tenant);

router.get('/monthly', async (req, res, next) => {
  const months = Math.min(Number(req.query.months) || 12, 24);

  try {
    const rows = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `with months as (
           select generate_series(
             date_trunc('month', now() at time zone 'Asia/Shanghai')
               - (($1 - 1) || ' months')::interval,
             date_trunc('month', now() at time zone 'Asia/Shanghai'),
             '1 month'
           )::date as month
         )
         select
           to_char(m.month, 'YYYY-MM') as month,
           coalesce(sum(o.amount_cents) filter (where o.status in ('paid','refunding','refunded')), 0)::bigint as revenue_cents,
           coalesce(count(o.id) filter (where o.status in ('paid','refunding','refunded')), 0)::int as paid_orders,
           coalesce(count(o.id), 0)::int as all_orders
         from months m
         left join orders o
           on o.tenant_id = $2
          and date_trunc('month', o.paid_at at time zone 'Asia/Shanghai') = m.month
         group by m.month
         order by m.month`,
        [months, req.tenant.id]
      );
      return r.rows;
    });

    const series = rows.map((r) => ({
      month: r.month,
      label: Number(r.month.slice(5)) + '月',
      revenueCents: Number(r.revenue_cents),
      revenueYuan: Math.round(Number(r.revenue_cents) / 100),
      paidOrders: r.paid_orders,
      allOrders: r.all_orders,
    }));

    const current = series[series.length - 1] || { revenueCents: 0, paidOrders: 0 };
    const previous = series[series.length - 2] || { revenueCents: 0, paidOrders: 0 };

    const growth = (a, b) => {
      if (!b) return a > 0 ? null : 0;
      return Math.round(((a - b) / b) * 1000) / 10;
    };

    res.json({
      series,
      summary: {
        revenueCents: current.revenueCents,
        paidOrders: current.paidOrders,
        revenueGrowthPct: growth(current.revenueCents, previous.revenueCents),
        ordersGrowthPct: growth(current.paidOrders, previous.paidOrders),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/status-distribution', async (req, res, next) => {
  try {
    const rows = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select status, count(*)::int as n, coalesce(sum(amount_cents),0)::bigint as amount
         from orders
         where tenant_id = $1
           and created_at > now() - interval '90 days'
         group by status
         order by n desc`,
        [req.tenant.id]
      );
      return r.rows;
    });

    res.json(rows.map((r) => ({ status: r.status, count: r.n, amountCents: Number(r.amount) })));
  } catch (err) {
    next(err);
  }
});

router.get('/top-customers', async (req, res, next) => {
  const limit = Math.min(Number(req.query.limit) || 10, 20);

  try {
    const rows = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select customer_name,
                count(*)::int as orders,
                sum(amount_cents)::bigint as amount_cents
         from orders
         where tenant_id = $1
           and status in ('paid','refunding','refunded')
           and created_at > now() - interval '365 days'
         group by customer_name
         order by amount_cents desc
         limit $2`,
        [req.tenant.id, limit]
      );
      return r.rows;
    });

    res.json(
      rows.map((r) => ({
        customerName: r.customer_name,
        orders: r.orders,
        amountCents: Number(r.amount_cents),
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const statsRoutes = require('./src/routes/stats');
app.use('/api/stats', statsRoutes);
```

## 3.2 三个关键点

### `generate_series` 补齐空缺的月份

**如果 3 月没有订单，你的 `group by` 结果里就没有 3 月那一行。**

**前端拿到的数组长度会变，`labels` 和 `values` 对不上，图表会错位。**

**`generate_series` 生成连续 12 个月，`left join` 上订单表，** **没有订单的月份 `sum` 是 `null`，用 `coalesce(..., 0)` 变成 0。**

**这是"时间序列统计"的标准写法。** **所有"按时间聚合"的报表都该这么写。**

### 时区在 SQL 里显式转换

```sql
date_trunc('month', o.paid_at at time zone 'Asia/Shanghai')
```

**不加 `at time zone`，用的是服务器时区。**

**服务器是 UTC 的时候，北京时间 3 月 1 日 00:30 的订单会被算进 2 月。**

**第 167 节讲过这个坑，这里再用一次。**

### `::bigint` 然后在 JS 里转 `Number`

**`sum()` 在 PostgreSQL 里返回 `numeric`，`pg` 驱动会给你一个字符串。**

**`count()` 返回 `bigint`，也是字符串。**

**所以显式 `::int` 或 `::bigint`，然后 `Number(...)` 转。**

**注意：`Number` 超过 2^53 会丢精度（9007 万亿）。** **金额到了这个量级，你要换 `BigInt` 或者字符串处理。**

**这个规模上不用担心，但要知道边界在哪。**

## 3.3 自检点

**先手工验证一个数字。**

**查数据库：**

```sql
select date_trunc('month', paid_at at time zone 'Asia/Shanghai')::date as month,
       sum(amount_cents)::bigint as revenue
from orders
where tenant_id = '<你的租户id>'
  and status in ('paid','refunding','refunded')
group by 1 order by 1 desc limit 3;
```

**再调接口：**

```text
curl "http://localhost:3000/api/stats/monthly?months=12" -b cookies.txt
```

**两个数字必须一样。**

**如果不一样：**

```text
① 检查 status 条件
② 检查时区
③ 检查 generate_series 的起点
```

**"接口的数字和数据库的数字不一致"是最难查的一类 bug。** **每次都先手工对一次。**

---

# 第 4 步：把数字和图拼成仪表盘（30 分钟）

## 4.1 新建 `public/js/pages/dashboard.js`

```js
(function () {
  const { Section, Card, money, Badge } = window.UI;

  const view = AsyncView.create({
    container: document.getElementById('main'),
    emptyOptions: {
      title: '还没有数据',
      text: '导入第一批订单后，这里会出现趋势',
      actionLabel: '去导入',
      actionHref: '/imports.html',
    },
    renderData: (data) => renderDashboard(data),
  });

  function renderDashboard(data) {
    const s = data.summary;

    return `
      ${renderKpiRow(s)}
      ${Card({
        body: `
          <div class="section__title">最近 12 个月收入</div>
          <div id="chart-revenue" style="margin-top:12px"></div>
        `,
      })}
      ${Card({
        body: `
          <div class="section__title">订单状态分布（近 90 天）</div>
          <div id="chart-status" style="margin-top:12px"></div>
        `,
      })}
    `;
  }

  function renderKpiRow(s) {
    return `
      <div class="kpi-row">
        ${kpi({
          label: '本月收入',
          value: money(s.revenueCents),
          delta: s.revenueGrowthPct,
        })}
        ${kpi({
          label: '本月订单',
          value: String(s.paidOrders) + ' 笔',
          delta: s.ordersGrowthPct,
        })}
      </div>
    `;
  }

  function kpi({ label, value, delta }) {
    let deltaHtml = '';

    if (delta === null || delta === undefined) {
      deltaHtml = '<div class="kpi__delta kpi__delta--muted">上月无数据</div>';
    } else if (delta > 0) {
      deltaHtml = `<div class="kpi__delta kpi__delta--up">↑ ${delta}%</div>`;
    } else if (delta < 0) {
      deltaHtml = `<div class="kpi__delta kpi__delta--down">↓ ${Math.abs(delta)}%</div>`;
    } else {
      deltaHtml = '<div class="kpi__delta kpi__delta--muted">与上月持平</div>';
    }

    return `
      <div class="kpi">
        <div class="kpi__label">${label}</div>
        <div class="kpi__value">${value}</div>
        ${deltaHtml}
      </div>
    `;
  }

  async function load() {
    const state = await view.run(async () => {
      const [monthly, status] = await Promise.all([
        API.get('/api/stats/monthly?months=12'),
        API.get('/api/stats/status-distribution'),
      ]);
      return { ...monthly, statusDist: status };
    });

    if (state.kind !== 'ready') return;

    drawCharts(state.data);
  }

  function drawCharts(data) {
    const revEl = document.getElementById('chart-revenue');
    if (revEl) {
      Chart.createLineChart(revEl, {
        labels: data.series.map((p) => p.label),
        values: data.series.map((p) => p.revenueYuan),
        formatY: (v) => (v >= 10000 ? Math.round(v / 1000) + 'k' : String(v)),
      });
    }

    const stEl = document.getElementById('chart-status');
    if (stEl && data.statusDist.length > 0) {
      const STATUS_TEXT = {
        pending: '待支付', paid: '已支付', refunding: '退款中',
        refunded: '已退款', expired: '已过期', canceled: '已取消',
      };

      Chart.createBarChart(stEl, {
        labels: data.statusDist.map((d) => STATUS_TEXT[d.status] || d.status),
        values: data.statusDist.map((d) => d.count),
        formatY: (v) => String(Math.round(v)),
      });
    }
  }

  load();
})();
```

**配套 CSS：**

```css
.kpi-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.kpi {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.kpi__label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
}

.kpi__value {
  font-size: var(--text-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  letter-spacing: -0.5px;
}

.kpi__delta {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 500;
}

.kpi__delta--up { color: var(--color-danger); }
.kpi__delta--down { color: var(--color-success); }
.kpi__delta--muted { color: var(--color-text-muted); }
```

## 4.2 四个设计点

### 涨红跌绿

**注意 CSS：**

```css
.kpi__delta--up { color: var(--color-danger); }    /* 红 */
.kpi__delta--down { color: var(--color-success); } /* 绿 */
```

**这是中国市场的约定：涨红跌绿。**

**欧美是反的（涨绿跌红）。**

**给中国客户做，用红涨绿跌。** **这一条如果搞错，客户第一眼会觉得别扭，虽然他说不出为什么。**

### 两个 KPI 并排，不用三个

```css
grid-template-columns: 1fr 1fr;
```

**为什么两个：**

```text
三个 → 每个只占 33%，375px 下每个 110px，¥128,400 会换行
两个 → 每个占 50%，每个 170px，够用
```

**375px 下，两列是上限。**

**如果一定要三个，用"2 + 1"的布局（前两个并排，第三个占整行）。**

### `Promise.all` 并发拉两个接口

```js
const [monthly, status] = await Promise.all([
  API.get('/api/stats/monthly?months=12'),
  API.get('/api/stats/status-distribution'),
]);
```

**串行的话要等两次（可能 600ms）。并行只要一次的时间（300ms）。**

**注意：`AsyncView` 的 `emptyWhen` 会收到合并后的对象。** **默认的 `emptyWhen` 对对象不管用，需要自定义。**

**改一下：**

```js
emptyWhen: (data) => !data || !data.series || data.series.every((p) => p.revenueCents === 0),
```

**这样"所有月份都是 0"就算空。**

### 图表必须在 DOM 插入之后创建

```js
async function load() {
  const state = await view.run(...);
  if (state.kind !== 'ready') return;
  drawCharts(state.data);     // renderData 已经把 HTML 插进去了
}
```

**`view.run()` 内部会调 `renderData`，** **把 HTML 插进容器。**

**然后 `drawCharts` 里 `document.getElementById('chart-revenue')` 才能拿到元素。**

**如果顺序反了（先 `drawCharts` 再 `run`），`el.clientWidth` 是 0，图表宽度是 0，什么都看不见。**

**这个 bug 很难查——** **因为不报错，只是"图不显示"。**

## 4.3 自检点

**打开仪表盘，五个检查：**

```text
① 两个 KPI 在 375px 下并排（不换行）
② 折线图有 12 个点，X 轴标签是"12月 1月 2月……"
③ 柱状图的柱子都是同一个颜色
④ 数据全 0 时，看到空状态（不是崩掉的图）
⑤ 把窗口从 375px 拖到 1200px，图表跟着变宽
```

**第 ④ 条要手工造：把某个测试租户的所有订单删掉（或者用一个新租户）。**

---

# 第 5 步：故意做错三张图（20 分钟）

## 5.1 错误一：饼图放 12 个分类

**假装你画了一张饼图（uPlot 不支持饼图，用 CSS 思维想象）。**

**12 个扇区，每个 8% 左右。**

**问自己：客户能从这张图上看出"哪个最大"吗？**

**不能。** **他只能看出"大概都差不多"。**

**改成横向柱状图，或者"前 4 + 其他"。**

## 5.2 错误二：Y 轴不从 0 开始

**改 `range`：**

```js
range: (u, min, max) => [min * 0.98, max * 1.02],
```

**数据的波动看起来会像过山车。**

**如果收入从 124,300 到 128,400（涨 3%），图上看起来像翻倍。**

**客户会做错判断。** **这是"误导性图表"，也是很多商业报告故意用的手法。**

**改回来：`[0, max * 1.1]`。**

## 5.3 错误三：三个 KPI 挤在 375px

**改成 `grid-template-columns: 1fr 1fr 1fr`。**

**在 375px 下，`¥128,400` 会换行，`↓ 12%` 会折成两行。**

**看起来很挤。**

**改回两列。**

**这个实验的意义：** **375px 是你的基准，任何时候想"再加一个指标"，先想清楚它在 375px 下放不放得下。**

---

# 第 6 步：最终验收

## A. 设计决策

- [ ] 我能说出"什么数据不该用图表"（举两个例子）
- [ ] 我的饼图分类 ≤ 5 个（或者根本没用饼图）
- [ ] Y 轴从 0 开始
- [ ] 颜色只用来区分类别，不是随机上色
- [ ] 每个数字都带对比（环比或同比）

## B. 图表

- [ ] 装了 uPlot，`public/vendor/` 里有文件
- [ ] 折线图能显示 12 个月
- [ ] 柱状图柱子同色
- [ ] 数据全 0 时不崩
- [ ] 窗口 resize 时图表跟着变

## C. 数据

- [ ] 接口用 `generate_series` 补齐空缺月份
- [ ] 时区在 SQL 里显式转 `Asia/Shanghai`
- [ ] 手工对过一次"接口数字 = 数据库数字"
- [ ] `bigint` 字段在 JS 里 `Number()` 转过了

## D. 布局

- [ ] 375px 下两个 KPI 并排不换行
- [ ] 三个 KPI 会长到第二行（我试过）
- [ ] 涨红跌绿（中国市场约定）

## E. 三个错误

- [ ] 我试过"饼图 12 分类"，看出来没法读
- [ ] 我改过 Y 轴不从 0，看出波动被夸大
- [ ] 我试过三个 KPI 挤 375px，看到换行

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"涨红跌绿"
- [ ] 我记下了 `generate_series` 补空月

## 提交

```text
git add -A
git commit -m "第187节课: 从业务问题选图 + uPlot 折线柱状 + 统计接口 + 仪表盘布局"
git push
```

---

# 附：常见问题速查

| 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 图表不显示 | 元素还没插入就初始化了（`clientWidth = 0`） | 先 `innerHTML` 再创建图表 |
| 图表宽度不跟着变 | 没监听 `resize` | 加 `u.setSize` |
| 数据全 0 时崩 | `max * 1.1` 是 0 | `max > 0 ? max * 1.1 : 1` |
| X 轴标签挤在一起 | 12 个标签在 375px 放不下 | 每 2 个显示一个，或者用 6 个月 |
| 接口数字和数据库不一致 | 时区、status 条件、月份起点 | 三个逐个对 |
| 空缺月份没显示 | `group by` 只返回有数据的月 | 用 `generate_series` |
| `sum()` 返回字符串 | `pg` 对 `bigint` / `numeric` 返回字符串 | `Number()` 转 |
| 柱子全一样高 | 数据是字符串，比较时当成了 NaN | 转数字 |
| 涨跌颜色反了 | 用了欧美的约定 | 中国市场：涨红跌绿 |
| `uPlot is not defined` | 脚本没加载，或者顺序错 | `vendor` 的 `<script>` 要在 `chart.js` 之前 |

---

## 本节课要能说出口的一句话

> **图表的目的是让客户做出判断，不是把数据摆出来；一个 48px 的数字加一个 ↑12%，往往比任何图都有效。**
