# 第 175 节课：账对不上怎么办

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前面六节让"钱能进来"。这一节回答一个更硬的问题：**三个月后，你怎么证明自己没算错？**
> 对账不是"财务的事"，是**你唯一能在争议中保护自己的东西**。

**建议用时**：205 分钟（8 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—3 步（110 分钟）一次，第 4—7 步（95 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 174 节课（回调、查单、复活都跑通，`payment_anomalies` 表建好）

---

# 第 0 步：三种"对不上"，处理方式完全不同（20 分钟）

## 0.1 三方账

```text
网关账   平台说：这个月收了你 100 笔，共 19900.00 元
你的账   你的 orders 表说：这个月 100 笔，共 19900.00 元
银行账   你的对公账户说：到账 19700.10 元
```

**三个数字都不一样。而且这是好事——因为它们本来就应该不一样。**

```text
网关账 ≠ 银行账   因为平台要扣手续费
你的账 ≠ 网关账   因为可能有退款、有测试单
你的账 = 网关账   这个必须相等，否则就是你算错了
```

**对账要分清三个层次：**

```text
第一层：你的账 vs 网关账        金额必须一致，不一致就是 bug
第二层：网关账 vs 银行账        差额 = 手续费，要能解释
第三层：你的账 vs 你的用量表    收的钱和提供的服务要对得上
```

**这一节主要做第一层和第三层。第二层依赖平台的对账单格式，各个平台不一样。**

## 0.2 四种差异，只有两种要修

| 差异类型 | 例子 | 处理 |
|---|---|---|
| **时间差** | 你 23:59 的订单，网关记在次日 | 正常，跨期的锅 |
| **手续费** | 网关扣 0.6% | 正常，记进成本 |
| **你漏了** | 网关有这笔，你没有 | **要修**：补订单 |
| **你多了** | 你有这笔，网关没有 | **要修**：查是不是测试单/伪造 |

**前两种不需要修，但必须在报表里解释清楚。**

**后两种必须查到具体哪一笔，一笔一笔处理。**

**对账的价值不在于"发现总数不同"，在于"找出那 3 笔是哪 3 笔"。**

## 0.3 这节课要建的六样东西

```text
① 网关对账单下载（mock 实现）
② 本地账单导出（和网关格式对齐）
③ 逐笔比对（按 payment_no 匹配，不按金额）
④ 差异分类（时间差 / 手续费 / 漏单 / 多单）
⑤ 对账报告（结果 + Excel 导出）
⑥ 退款流程（这周最后的业务闭环）
```

---

# 第 1 步：三个来源，三种格式（20 分钟）

## 1.1 网关给的对账单

**真实平台给的是一个 Excel 或 CSV 文件，字段大致是：**

```text
交易时间 | 商户订单号 | 平台交易号 | 交易金额 | 手续费 | 结算金额 | 交易状态
```

**注意"交易金额"和"结算金额"是两列。**

```text
交易金额 199.00   客户付的
手续费   1.19     平台扣的（0.6%）
结算金额 197.81   实际到账
```

**对账时，你要用"交易金额"比你的 `amount_cents`，不是"结算金额"。**

**这个错误很常见：** 拿结算金额和订单金额比，发现差 1.19，以为有 bug，其实差的是手续费。

## 1.2 给 mock 网关加一个对账单接口

**在 `scripts/mock-gateway.js` 里加：**

```js
app.get('/mock/bill', (req, res) => {
  const day = req.query.date;

  const rows = [...payments.values()]
    .filter((p) => p.status === 'SUCCESS')
    .filter((p) => !day || (p.paid_at || '').slice(0, 10) === day)
    .sort((a, b) => (a.paid_at || '').localeCompare(b.paid_at || ''));

  const feePermille = 6;

  const items = rows.map((p) => {
    const feeCents = Math.round((p.amount * feePermille) / 1000);
    return {
      交易时间: p.paid_at,
      商户订单号: p.out_trade_no,
      平台交易号: p.payment_no,
      交易金额分: p.amount,
      手续费分: feeCents,
      结算金额分: p.amount - feeCents,
      交易状态: 'SUCCESS',
    };
  });

  res.json({
    gateway: 'mock',
    date: day || 'ALL',
    count: items.length,
    totalAmountCents: items.reduce((s, i) => s + i.交易金额分, 0),
    totalFeeCents: items.reduce((s, i) => s + i.手续费分, 0),
    items,
  });
});
```

**重启网关，测：**

```text
curl http://localhost:4000/mock/bill
```

**返回结构里 `items` 是逐笔明细，`total*` 是汇总。**

**为什么要给汇总：** 对账第一步永远是"总数对不对"。**总数不对，明细比对就没有意义。**

## 1.3 你自己的账单

**新建 `src/reconcile/local-bill.js`：**

```js
const { withTenantFromPool } = require('../db/tenant-db');

async function buildLocalBill(tenantId, date) {
  return withTenantFromPool(tenantId, async (db) => {
    const { rows } = await db.client.query(
      `select id, order_no, payment_no, amount_cents, paid_cents,
              refunded_cents, status, paid_at, created_at
       from orders
       where tenant_id = $1
         and status in ('paid', 'refunding', 'refunded')
         and ($2::date is null or paid_at::date = $2::date)
       order by paid_at`,
      [tenantId, date || null]
    );

    const items = rows.map((r) => ({
      orderNo: r.order_no,
      paymentNo: r.payment_no,
      amountCents: r.amount_cents,
      refundedCents: r.refunded_cents,
      status: r.status,
      paidAt: r.paid_at,
    }));

    return {
      count: items.length,
      totalAmountCents: items.reduce((s, i) => s + i.amountCents, 0),
      totalRefundedCents: items.reduce((s, i) => s + i.refundedCents, 0),
      items,
    };
  });
}

module.exports = { buildLocalBill };
```

**注意 `status in ('paid', 'refunding', 'refunded')`。**

**退款中的订单也算"收到过钱"，所以它必须出现在账单里，`refunded_cents` 那一列说明退了多少。**

## 1.4 一个必须决定的事：按什么日期对

**订单有三个时间：**

```text
created_at   下单时间
paid_at      支付时间
refunded_at  退款时间
```

**对账按哪个？**

**按 `paid_at`。**

**因为网关的对账单是按"交易时间"列的，交易时间 = 你收到钱的时间 = `paid_at`。**

**如果用 `created_at`，会出现这种差异：**

```text
11月30日 23:58 下单
12月1日 00:02 付款
```

**网关记在 12 月，你的订单 `created_at` 是 11 月。** 按创建时间对，这笔永远对不上。

**这个坑在月底特别容易踩。** 而且你可能对完 11 月的账，发现"少了一笔"，然后花两小时找到一个"其实是 12 月的"订单。

---

# 第 2 步：逐笔比对（40 分钟）

**这是这节课的技术核心。**

## 2.1 匹配键：用 `payment_no`，不用金额

**新手做法：**

```js
// ❌ 按金额匹配
for (const a of local) {
  const match = remote.find((b) => b.amountCents === a.amountCents);
}
```

**问题：**

```text
两笔都是 199.00 元
第一笔匹配到了第二笔的网关记录
两笔都"匹配成功"，但实际上是错的
```

**更糟的情况：**

```text
客户 A 付了 199，你没记
客户 B 付了 199，你记了
按金额匹配 → "这笔对上了"
实际上 A 漏单，B 多单，两个错误互相抵消
```

**必须用唯一键。`payment_no` 是网关给的，全局唯一。**

**如果订单没有 `payment_no` 呢：** 说明它没走过网关（手工开的、导入的）。**这类订单不参与对账。**

## 2.2 写比对函数

**新建 `src/reconcile/diff.js`：**

```js
const DIFF_KIND = {
  MATCHED: 'MATCHED',
  MISSING_LOCAL: 'MISSING_LOCAL',
  MISSING_REMOTE: 'MISSING_REMOTE',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  STATUS_MISMATCH: 'STATUS_MISMATCH',
};

function reconcile(localBill, remoteBill, options = {}) {
  const timeToleranceMinutes = options.timeToleranceMinutes || 0;
  const feeToleranceCents = options.feeToleranceCents || 0;

  const localMap = new Map();
  for (const item of localBill.items) {
    if (!item.paymentNo) continue;
    localMap.set(String(item.paymentNo), item);
  }

  const remoteMap = new Map();
  for (const item of remoteBill.items) {
    remoteMap.set(String(item.平台交易号), item);
  }

  const results = [];

  for (const [paymentNo, remote] of remoteMap) {
    const local = localMap.get(paymentNo);

    if (!local) {
      results.push({
        kind: DIFF_KIND.MISSING_LOCAL,
        paymentNo,
        orderNo: remote.商户订单号,
        remoteAmountCents: remote.交易金额分,
        remotePaidAt: remote.交易时间,
        note: '网关有这笔，本地没有',
      });
      continue;
    }

    const amountOk = local.amountCents === remote.交易金额分;

    if (!amountOk) {
      results.push({
        kind: DIFF_KIND.AMOUNT_MISMATCH,
        paymentNo,
        orderNo: local.orderNo,
        localAmountCents: local.amountCents,
        remoteAmountCents: remote.交易金额分,
        gapCents: remote.交易金额分 - local.amountCents,
        note: '金额不一致',
      });
      continue;
    }

    const timeGapMs =
      local.paidAt && remote.交易时间
        ? Math.abs(new Date(local.paidAt) - new Date(remote.交易时间))
        : 0;

    if (timeToleranceMinutes > 0 && timeGapMs > timeToleranceMinutes * 60000) {
      results.push({
        kind: DIFF_KIND.STATUS_MISMATCH,
        paymentNo,
        orderNo: local.orderNo,
        localPaidAt: local.paidAt,
        remotePaidAt: remote.交易时间,
        note: '支付时间差异超过容差',
      });
      continue;
    }

    results.push({
      kind: DIFF_KIND.MATCHED,
      paymentNo,
      orderNo: local.orderNo,
      amountCents: local.amountCents,
    });
  }

  for (const [paymentNo, local] of localMap) {
    if (!remoteMap.has(paymentNo)) {
      results.push({
        kind: DIFF_KIND.MISSING_REMOTE,
        paymentNo,
        orderNo: local.orderNo,
        localAmountCents: local.amountCents,
        localPaidAt: local.paidAt,
        note: '本地有这笔，网关没有',
      });
    }
  }

  const summary = {
    localCount: localBill.items.length,
    remoteCount: remoteBill.items.length,
    localTotalCents: localBill.totalAmountCents,
    remoteTotalCents: remoteBill.totalAmountCents,
    matched: results.filter((r) => r.kind === DIFF_KIND.MATCHED).length,
    missingLocal: results.filter((r) => r.kind === DIFF_KIND.MISSING_LOCAL).length,
    missingRemote: results.filter((r) => r.kind === DIFF_KIND.MISSING_REMOTE).length,
    amountMismatch: results.filter((r) => r.kind === DIFF_KIND.AMOUNT_MISMATCH).length,
    statusMismatch: results.filter((r) => r.kind === DIFF_KIND.STATUS_MISMATCH).length,
  };

  summary.totalGapCents = summary.remoteTotalCents - summary.localTotalCents;
  summary.ok =
    summary.missingLocal === 0 &&
    summary.missingRemote === 0 &&
    summary.amountMismatch === 0;

  return { summary, results };
}

module.exports = { reconcile, DIFF_KIND };
```

## 2.3 五个设计点

### 为什么用 `Map` 不用数组 `find`

```js
localMap.get(paymentNo)   // O(1)
local.find(...)           // O(n)
```

**1000 笔 × 1000 笔 = 100 万次比较 vs 1000 次哈希查找。**

**这个差别在数据量小时看不出来。等你有 10 万笔的时候，`find` 版本要跑几十秒。**

### 为什么 `MISSING_LOCAL` 和 `MISSING_REMOTE` 都要报

**因为它们是完全不同的两种问题：**

```text
MISSING_LOCAL   网关收了钱，你没记账  → 客户付了钱没得到服务，很严重
MISSING_REMOTE  你记账了，网关没这笔  → 可能是测试单、可能是伪造、可能是你查单时判错了
```

**第一种要立刻补单并给客户开通，第二种要立刻查清来源。**

### `timeToleranceMinutes` 为什么默认 0

**因为默认情况下"时间差"不该存在——你记的 `paid_at` 就是回调给的，两边应该一模一样。**

**真实场景里会有秒级差异（时区、精度），所以设一个容差比如 5 分钟。**

**但默认 0 是对的：先看真实差异，再决定要不要放宽。**

### `summary.ok` 只看三个字段

```js
summary.ok =
  summary.missingLocal === 0 &&
  summary.missingRemote === 0 &&
  summary.amountMismatch === 0;
```

**不包括 `statusMismatch`。**

**因为时间差是"正常的"，不该让对账失败。**

**但它要出现在报表里，让人看到。**

### `gapCents` 用"网关减本地"

```js
gapCents: remote.交易金额分 - local.amountCents
```

**正数 = 网关多了，负数 = 本地多了。**

**方向很重要。** 客户投诉"你们少算了"，你要能立刻说"网关比我们多记了 X 分，原因是 Y"。

## 2.4 自检点：先用手工数据测

**新建 `scripts/diff-test.js`：**

```js
const { reconcile } = require('../src/reconcile/diff');

const local = {
  count: 2,
  totalAmountCents: 29800,
  items: [
    { orderNo: 'A1', paymentNo: 'P1', amountCents: 19900, paidAt: '2026-11-01T10:00:00Z', status: 'paid' },
    { orderNo: 'A2', paymentNo: 'P2', amountCents: 9900, paidAt: '2026-11-01T11:00:00Z', status: 'paid' },
  ],
};

const remote = {
  count: 3,
  totalAmountCents: 39800,
  items: [
    { 商户订单号: 'A1', 平台交易号: 'P1', 交易金额分: 19900, 交易时间: '2026-11-01T10:00:00Z' },
    { 商户订单号: 'A2', 平台交易号: 'P2', 交易金额分: 9900, 交易时间: '2026-11-01T11:00:00Z' },
    { 商户订单号: 'A3', 平台交易号: 'P3', 交易金额分: 10000, 交易时间: '2026-11-01T12:00:00Z' },
  ],
};

const { summary, results } = reconcile(local, remote);
console.log(summary);
console.log('');
for (const r of results) {
  console.log(r.kind.padEnd(16), r.paymentNo, r.note || '');
}
```

**期望：**

```text
{
  localCount: 2,
  remoteCount: 3,
  localTotalCents: 29800,
  remoteTotalCents: 39800,
  matched: 2,
  missingLocal: 1,
  missingRemote: 0,
  amountMismatch: 0,
  statusMismatch: 0,
  totalGapCents: 10000,
  ok: false
}

MATCHED          P1
MATCHED          P2
MISSING_LOCAL    P3 网关有这笔，本地没有
```

---

# 第 3 步：对账报告（30 分钟）

**对账结果不能只有 JSON。你需要一份能给客户（或者给自己）看的东西。**

## 3.1 存对账记录

**新建 `migrations/014_reconcile.sql`：**

```sql
create table reconcile_runs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  bill_date           date not null,
  local_count         integer not null default 0,
  remote_count        integer not null default 0,
  local_total_cents   bigint not null default 0,
  remote_total_cents  bigint not null default 0,
  matched             integer not null default 0,
  missing_local       integer not null default 0,
  missing_remote      integer not null default 0,
  amount_mismatch     integer not null default 0,
  status_mismatch     integer not null default 0,
  ok                  boolean not null default false,
  details             jsonb not null default '[]'::jsonb,
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index reconcile_runs_tenant_date_idx
  on reconcile_runs (tenant_id, bill_date desc);

alter table reconcile_runs enable row level security;
alter table reconcile_runs force row level security;

create policy tenant_isolation on reconcile_runs
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

**为什么 `bigint` 不是 `integer`：**

**`integer` 上限是 21 亿（0.021 亿分 = 2147 万元）。**

**一个月流水超过 2147 万的客户存在。** 虽然你现在没有，但改字段类型比改代码贵。

**金额汇总字段，一律用 `bigint`。** 这是个不用犹豫的选择。

**为什么存 `details`：**

**"这笔对不上"这句话，三个月后你要能重新查看。**

**不存的话，你只记得"11 月 1 日对账有 1 笔差异"，但不知道是哪一笔。**

**注意限制条数：** 只存差异（不存 MATCHED），而且最多存 2000 条。

## 3.2 写对账服务

**新建 `src/reconcile/service.js`：**

```js
const { withTenantFromPool } = require('../db/tenant-db');
const { buildLocalBill } = require('./local-bill');
const { reconcile } = require('./diff');
const { queryGatewayBill } = require('../pay/provider');

async function runReconcile(tenantId, billDate, userId) {
  const remote = await queryGatewayBill(billDate);
  const local = await buildLocalBill(tenantId, billDate);

  const { summary, results } = reconcile(local, remote);

  const differences = results.filter((r) => r.kind !== 'MATCHED').slice(0, 2000);

  return withTenantFromPool(tenantId, async (db) => {
    const { rows } = await db.client.query(
      `insert into reconcile_runs
         (tenant_id, bill_date, local_count, remote_count,
          local_total_cents, remote_total_cents, matched,
          missing_local, missing_remote, amount_mismatch, status_mismatch,
          ok, details, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
       returning id, created_at`,
      [
        tenantId,
        billDate,
        summary.localCount,
        summary.remoteCount,
        summary.localTotalCents,
        summary.remoteTotalCents,
        summary.matched,
        summary.missingLocal,
        summary.missingRemote,
        summary.amountMismatch,
        summary.statusMismatch,
        summary.ok,
        JSON.stringify(differences),
        userId || null,
      ]
    );

    return {
      runId: rows[0].id,
      createdAt: rows[0].created_at,
      summary,
      differences,
    };
  });
}

module.exports = { runReconcile };
```

## 3.3 给 provider 加对账单查询

**在 `src/pay/provider.js` 里加：**

```js
async function queryGatewayBill(date) {
  const url = GATEWAY + '/mock/bill' + (date ? '?date=' + encodeURIComponent(date) : '');

  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });

  if (!res.ok) {
    throw new Error('下载对账单失败 ' + res.status);
  }

  const data = await res.json();

  return {
    count: data.count,
    totalAmountCents: data.totalAmountCents,
    items: data.items,
  };
}

module.exports = { verifySignature, createPayment, queryPayment, queryGatewayBill, sign };
```

## 3.4 接口

**新建 `src/routes/reconcile.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');
const { runReconcile } = require('../reconcile/service');
const { buildReportFile } = require('../reconcile/report');

const router = express.Router();
router.use(auth, tenant);

router.post('/', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能对账' });
  }

  const date = req.body.date;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ error: '日期格式必须是 YYYY-MM-DD' });
  }

  try {
    const result = await runReconcile(req.tenant.id, date, req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select id, bill_date, local_count, remote_count,
                local_total_cents, remote_total_cents, matched,
                missing_local, missing_remote, amount_mismatch, ok, created_at
         from reconcile_runs
         where tenant_id = $1
         order by bill_date desc, created_at desc
         limit 30`,
        [req.tenant.id]
      );
      return r.rows;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:runId/report.xlsx', async (req, res, next) => {
  try {
    const run = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        'select * from reconcile_runs where tenant_id = $1 and id = $2',
        [req.tenant.id, req.params.runId]
      );
      return r.rows[0] || null;
    });

    if (!run) {
      return res.status(404).json({ error: '对账记录不存在' });
    }

    const buffer = await buildReportFile(run);

    const filename = '对账报告-' + run.bill_date + '.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const reconcileRoutes = require('./routes/reconcile');
app.use('/api/reconcile', reconcileRoutes);
```

---

# 第 4 步：对账报告文件（25 分钟）

**新建 `src/reconcile/report.js`：**

```js
const ExcelJS = require('exceljs');
const { fromCents } = require('../money');

const KIND_LABEL = {
  MISSING_LOCAL: '本地漏单',
  MISSING_REMOTE: '网关无此单',
  AMOUNT_MISMATCH: '金额不符',
  STATUS_MISMATCH: '时间差异',
};

async function buildReportFile(run) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'saas-lab';
  wb.created = new Date();

  const summary = wb.addWorksheet('对账汇总');
  summary.columns = [
    { key: 'k', width: 24 },
    { key: 'v', width: 40 },
  ];

  const localTotal = Number(run.local_total_cents);
  const remoteTotal = Number(run.remote_total_cents);
  const gap = remoteTotal - localTotal;

  const lines = [
    ['对账日期', run.bill_date],
    ['生成时间', new Date(run.created_at).toLocaleString('zh-CN')],
    ['', ''],
    ['本地笔数', String(run.local_count)],
    ['网关笔数', String(run.remote_count)],
    ['本地金额', fromCents(localTotal, { symbol: '¥' })],
    ['网关金额', fromCents(remoteTotal, { symbol: '¥' })],
    ['差额', fromCents(gap, { symbol: '¥' })],
    ['', ''],
    ['匹配成功', String(run.matched)],
    ['本地漏单', String(run.missing_local)],
    ['网关无此单', String(run.missing_remote)],
    ['金额不符', String(run.amount_mismatch)],
    ['时间差异', String(run.status_mismatch)],
    ['', ''],
    ['结论', run.ok ? '通过' : '不通过，需人工核查'],
  ];

  for (const [k, v] of lines) {
    const row = summary.addRow({ k, v });
    if (k === '结论') {
      row.getCell('v').font = { bold: true, color: { argb: run.ok ? 'FF0A7B34' : 'FFC1121F' } };
    }
  }

  summary.getRow(1).font = { bold: true };
  summary.getRow(8).font = { bold: true };

  if (!run.ok) {
    const detail = wb.addWorksheet('差异明细', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    detail.columns = [
      { header: '类型', key: 'kind', width: 14 },
      { header: '商户订单号', key: 'orderNo', width: 20 },
      { header: '平台交易号', key: 'paymentNo', width: 26 },
      { header: '本地金额', key: 'local', width: 14 },
      { header: '网关金额', key: 'remote', width: 14 },
      { header: '差额', key: 'gap', width: 12 },
      { header: '说明', key: 'note', width: 40 },
    ];

    detail.getRow(1).font = { bold: true };
    detail.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };

    const details = Array.isArray(run.details) ? run.details : [];

    for (const d of details) {
      const row = detail.addRow({
        kind: KIND_LABEL[d.kind] || d.kind,
        orderNo: d.orderNo || '',
        paymentNo: d.paymentNo || '',
        local: d.localAmountCents === undefined ? '' : fromCents(d.localAmountCents),
        remote: d.remoteAmountCents === undefined ? '' : fromCents(d.remoteAmountCents),
        gap: d.gapCents === undefined ? '' : fromCents(d.gapCents),
        note: d.note || '',
      });

      if (d.kind === 'MISSING_LOCAL') {
        row.getCell('kind').font = { color: { argb: 'FFC1121F' }, bold: true };
      }
      if (d.kind === 'MISSING_REMOTE') {
        row.getCell('kind').font = { color: { argb: 'FFB45309' }, bold: true };
      }
    }

    detail.autoFilter = { from: 'A1', to: 'G1' };

    const howto = wb.addWorksheet('怎么处理');
    howto.columns = [{ width: 100 }];
    [
      '差异怎么处理',
      '',
      '本地漏单（网关有，本地无）',
      '  1. 先确认这笔钱真的到账了（看网关后台）',
      '  2. 用平台交易号在网关后台查订单号',
      '  3. 在本地补一条订单，或者用查单脚本补',
      '  4. 如果客户已经投诉过，补偿一个月会员',
      '',
      '网关无此单（本地有，网关无）',
      '  1. 先查这个 payment_no 是不是测试数据',
      '  2. 如果是真实单号但网关查不到，说明你记错了单号',
      '  3. 不要直接改状态，先查客户是否真的付过',
      '',
      '金额不符',
      '  1. 看差额是多少',
      '  2. 如果差额正好是手续费，是比对字段搞错了',
      '  3. 如果是别的数字，一定有一边算错了，逐笔核对',
      '',
      '时间差异',
      '  1. 通常跨零点导致，确认一下时区',
      '  2. 差 5 分钟内可以忽略',
    ].forEach((line, i) => {
      const row = howto.addRow([line]);
      if (i === 0) row.font = { bold: true, size: 14 };
      if (['本地漏单（网关有，本地无）', '网关无此单（本地有，网关无）', '金额不符', '时间差异'].includes(line)) {
        row.font = { bold: true };
      }
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { buildReportFile, KIND_LABEL };
```

## 4.1 三个要点

### "怎么处理"那一页是给未来的自己看的

**对账失败的时候，你（或者接手的人）在慌。**

**那一页把"看到这个差异，第一步做什么"写死了。**

**这就是 SOP 的价值：** 它不解决技术问题，它解决"人在压力下想不清楚"的问题。

### `run.ok` 决定有没有"差异明细"页

**通过了就只给汇总。**

**客户（或者你自己）看到一份干净的汇总，比看到 20 页全是"匹配成功"的表格舒服得多。**

### `fromCents` 用在报表里，不用在数据库里

**数据库存整数分，报表显示"¥1,299.00"。**

**这就是第 172 节说的"入口和出口做转换"。**

## 4.2 自检点

**跑一次对账：**

```text
curl -X POST http://localhost:3000/api/reconcile -b cookies.txt -H "Content-Type: application/json" -d "{\"date\":\"2026-11-16\"}"
```

**然后下载报告：**

```text
curl -o report.xlsx http://localhost:3000/api/reconcile/<runId>/report.xlsx -b cookies.txt
```

**打开看：**

```text
✅ 汇总页有金额、笔数、差额、结论
✅ 有差异时才有"差异明细"和"怎么处理"
✅ 金额显示成 ¥1,299.00 格式
```

---

# 第 5 步：故意造三种差异（30 分钟）

**对账逻辑不造差异是测不出来的。**

## 5.1 造"本地漏单"

**直接删掉一条本地订单（模拟"回调丢了 + 查单也没跑"）：**

```sql
-- 先记下 payment_no
select payment_no, order_no, amount_cents from orders
where tenant_id = '<你的租户id>' and status = 'paid'
order by paid_at desc limit 1;
```

```sql
delete from orders where order_no = '<那个订单号>';
```

**跑对账。**

**期望：**

```json
{
  "summary": {
    "missingLocal": 1,
    "localTotalCents": 少一笔,
    "remoteTotalCents": 原数,
    "totalGapCents": 那一笔的金额,
    "ok": false
  }
}
```

**而且 `differences` 里有一条 `MISSING_LOCAL`，带网关的交易号。**

**这是最有用的输出：** 你拿着那个交易号，就能去网关后台查"这笔到底是谁付的"。

## 5.2 造"金额不符"

**改一条本地订单的金额：**

```sql
update orders set amount_cents = amount_cents - 100
where order_no = '<某个订单号>';
```

**注意：这会违反 `orders_money_check` 约束。**

**所以改的时候要同时改 `quantity` 或 `unit_price_cents`。**

**或者临时禁用约束（不推荐，但这是学习环境）：**

```sql
alter table orders drop constraint orders_money_check;
update orders set amount_cents = amount_cents - 100 where order_no = '<...>';
alter table orders add constraint orders_money_check check (...);
```

**跑对账，`amountMismatch` 应该是 1，`gapCents` 是 100。**

## 5.3 造"网关无此单"

**本地造一条假的已支付订单，`payment_no` 随便编一个：**

```sql
insert into orders
  (tenant_id, order_no, customer_name, order_date, quantity,
   unit_price_cents, amount_cents, status, paid_cents, payment_no, paid_at)
values
  ('<租户id>', 'FAKE001', '测试', current_date, 1,
   100, 100, 'paid', 100, 'NOTEXIST123', now());
```

**跑对账，`missingRemote` 应该是 1。**

**这一条最关键：** 如果你对账时发现"本地有、网关无"的单，**要么是你的测试数据，要么是有人伪造了已支付状态。**

**两种情况都要立刻查。**

## 5.4 清理

**把造的数据删掉，再跑一次对账，应该 `ok: true`。**

**这一步不能省。** 留着脏数据，你以后永远不知道该信哪个数字。

---

# 第 6 步：退款（25 分钟）

**这一周最后一件事，也是业务闭环的最后一环。**

## 6.1 退款为什么必须做

**客户买了会员，第二天说"买错了，退钱"。**

**没有退款功能，你会怎么做：**

```text
① 客户微信找你
② 你在网关后台手工退款
③ 你在数据库里手工把订单改成 refunded
④ 你在数据库里手工把租户 plan 改回 free
```

**四次手工操作，每一步都可能漏。**

**漏第 ③ 步：对账时这笔还是"已支付"，但钱已经退了。**
**漏第 ④ 步：客户拿到退款，还继续用着会员。**

**必须做成接口。**

## 6.2 退款接口

**在 `src/routes/orders.js` 里加：**

```js
const { idempotency } = require('../middleware/idempotency');
const { applyRefund } = require('../orders/service');

router.post('/:id/refund', idempotency('refund_order'), async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能退款' });
  }

  const reason = (req.body.reason || '').trim();

  if (reason.length < 2) {
    return res.status(400).json({ error: '请填写退款原因' });
  }

  try {
    const result = await withTenant(req.tenant.id, async (db) => {
      return applyRefund(db, req.tenant.id, req.params.id, reason);
    });

    if (result.reason === 'NOT_FOUND') {
      return res.status(404).json({ error: '订单不存在' });
    }

    if (result.reason === 'NOT_PAID') {
      return res.status(409).json({ error: '这个订单没有支付，不能退款', status: result.status });
    }

    if (result.reason === 'ALREADY_REFUNDED') {
      return res.json({ ok: true, message: '这个订单已经全额退款了', order: result.order });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

**在 `src/orders/service.js` 里加 `applyRefund`：**

```js
const { allocateRefund } = require('../money/refund');
const { fromCents } = require('../money');

async function applyRefund(db, tenantId, orderId, reason) {
  const { rows } = await db.client.query(
    `select id, order_no, status, quantity, amount_cents, paid_cents,
            refunded_cents, refunded_qty, payment_no, paid_at
     from orders
     where tenant_id = $1 and id = $2
     for update`,
    [tenantId, orderId]
  );

  if (rows.length === 0) return { reason: 'NOT_FOUND' };

  const order = rows[0];

  if (order.status === 'refunded') {
    return { reason: 'ALREADY_REFUNDED', order };
  }

  if (order.status !== 'paid' && order.status !== 'refunding') {
    return { reason: 'NOT_PAID', status: order.status };
  }

  const remainingQty = order.quantity - order.refunded_qty;

  if (remainingQty <= 0) {
    return { reason: 'ALREADY_REFUNDED', order };
  }

  const refund = allocateRefund(order, remainingQty);

  if (refund.refundCents <= 0) {
    return { reason: 'AMOUNT_INVALID', amount: refund.refundCents };
  }

  const updated = await db.client.query(
    `update orders
     set refunded_cents = refunded_cents + $1,
         refunded_qty = refunded_qty + $2,
         status = case
           when refunded_qty + $2 >= quantity then 'refunded'
           else 'paid'
         end,
         refunded_at = now(),
         refund_reason = $3
     where tenant_id = $4 and id = $5
       and status in ('paid', 'refunding')
       and refunded_qty + $2 <= quantity
     returning id, order_no, status, refunded_cents, refunded_qty`,
    [refund.refundCents, remainingQty, reason, tenantId, orderId]
  );

  if (updated.rowCount === 0) {
    return { reason: 'RACE_LOST' };
  }

  const after = updated.rows[0];

  if (after.status === 'refunded') {
    await db.client.query(
      `update tenants
       set plan = 'free',
           plan_expires_at = null
       where id = $1`,
      [tenantId]
    );
  }

  await db.client.query(
    `insert into refund_records
       (tenant_id, order_id, order_no, amount_cents, reason, status)
     values ($1, $2, $3, $4, $5, 'pending_gateway')`,
    [tenantId, orderId, order.order_no, refund.refundCents, reason]
  );

  return {
    ok: true,
    order: after,
    refundCents: refund.refundCents,
    refundYuan: fromCents(refund.refundCents, { symbol: '¥' }),
    gatewayNote: 'mock 网关不实际退款，真实环境要调退款接口',
  };
}
```

## 6.3 四处关键

### `for update` 锁住这一行

```sql
select ... from orders where ... for update
```

**在事务里 `select ... for update` 会锁住这一行，直到事务结束。**

**为什么需要：** 两个退款请求同时来，都读到 `refunded_qty = 0`，都算出"要退全部"。**两个都执行，退了两倍。**

**加了 `for update`，第二个请求会等第一个提交，然后读到 `refunded_qty = quantity`，返回 `ALREADY_REFUNDED`。**

**注意要在 `where` 里也保留条件（`and refunded_qty + $2 <= quantity`），这是双保险。**

### `status = case when ... then 'refunded' else 'paid' end`

**部分退款后，订单状态还是 `paid`（因为还有东西没退）。**

**全部退完才变 `refunded`。**

**这个判断在 SQL 里做，不在代码里做。** 因为 `refunded_qty + $2` 这个值只有在数据库里加了之后才知道。

### `plan` 改回 `free`

**只在"全额退款"的时候做。**

**部分退款呢：** 逻辑上应该按比例减少会员时长，但那个计算很复杂，而且容易出错。

**这一节的取舍：部分退款不动会员，全额退款才降级。**

**这是个业务决定，不是技术决定。** 你要在文档里写清楚，客户问起来能解释。

### `refund_records` 表要单独建

**新建 `migrations/015_refunds.sql`：**

```sql
alter table orders
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text;

create table if not exists refund_records (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  order_no     text not null,
  amount_cents integer not null check (amount_cents > 0),
  reason       text not null,
  status       text not null default 'pending_gateway',
  gateway_ref  text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index refund_records_tenant_idx
  on refund_records (tenant_id, created_at desc);

alter table refund_records enable row level security;
alter table refund_records force row level security;

create policy tenant_isolation on refund_records
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**为什么要有 `status`：**

**因为你调网关退款可能失败。**

```text
pending_gateway   已申请，还没调网关 / 调了但没确认
success           网关确认退款成功
failed            网关拒绝（余额不足、超过退款期限）
```

**没有这个状态，你会出现"数据库里标记已退款，但钱没退给客户"——** **这是最严重的资损。**

**真实流程：**

```text
① 数据库记一条 pending_gateway（事务内）
② 调网关退款接口（事务外）
③ 网关返回成功 → 改成 success
④ 网关返回失败 → 改成 failed，订单状态回滚
```

**这一节只做到第 ① 步，因为 mock 网关不实际退款。**

**但代码结构要留出来。** 这就是为什么返回体里写了 `gatewayNote`。

## 6.4 自检点

**退款一次：**

```text
curl -X POST http://localhost:3000/api/orders/<orderId>/refund -b cookies.txt -H "Content-Type: application/json" -d "{\"reason\":\"买错了\",\"requestId\":\"refund-test-0001\"}"
```

**期望：**

```json
{
  "ok": true,
  "order": { "status": "refunded", "refunded_cents": 19900, "refunded_qty": 1 },
  "refundCents": 19900,
  "refundYuan": "¥199.00"
}
```

**再退一次（同一个 `requestId`）：**

**返回上次的结果（幂等）。**

**用不同 `requestId` 再退一次：**

**返回 `already refunded`。**

**检查：**

```sql
select plan, plan_expires_at from tenants where id = '<租户id>';
```

**应该是 `free` 和 `null`。**

---

# 第 7 步：整周串一遍（15 分钟）

**把这周所有东西连起来跑一遍，确认没断。**

## 7.1 完整剧本

```text
1. 下单          POST /api/orders               → 拿到 order_no
2. 发起支付      POST /api/orders/:id/pay       → 拿到 pay_url
3. 付款          浏览器打开 pay_url，点确认     → 网关回调
4. 确认           GET  /api/orders/:id          → status = paid
5. 重放3次       POST gateway /mock/repay       → 还是只有30天
6. 暂停回调      POST gateway /mock/lose-notify → 新建一单造"回调丢失"
7. 查单救回      node scripts/query-pending.js  → 变 paid
8. 导出          GET  /api/exports/orders       → 下载 xlsx
9. 对账          POST /api/reconcile            → ok: true
10. 退款         POST /api/orders/:id/refund    → status = refunded，plan 回 free
11. 再对账       POST /api/reconcile            → 退款那笔还匹配（金额没变）
```

**第 11 步要注意：**

**退款后 `orders` 还是 `paid` 状态（部分退）或者 `refunded`（全退），`amount_cents` 没变。**

**所以对账仍然匹配。**

**但总金额的语义变了：**

```text
本地 totalAmountCents   = 所有 paid/refunding/refunded 的 amount 之和
本地 totalRefundedCents = 退款金额之和
净收入                  = totalAmountCents - totalRefundedCents
```

**网关对账单里也会有退款记录（`交易状态 = REFUND`）。**

**真实平台的对账单会同时包含支付和退款两类记录。这一节的 mock 只给支付，所以第 11 步只验证"支付那条还能对上"。**

**完整对账要处理退款记录，这个留给你自己扩展。** 结构已经在 `diff.js` 里了，加一个 `kind: 'REFUND'` 就行。

## 7.2 如果某一步断了

| 断在哪 | 大概率原因 |
|---|---|
| 第 2 步 404 | 订单 id 不对，或者订单不是 pending |
| 第 3 步无日志 | 网关的 `MERCHANT_CALLBACK` 不对 |
| 第 4 步还是 pending | 回调验签失败（看 `[webhook] 验签失败`） |
| 第 5 步加了 90 天 | `markPaid` 的 `where` 缺 `status = 'pending'` |
| 第 7 步没救回 | 网关里那单的 `payment_no` 和库里不一致 |
| 第 9 步对不上 | 造过测试数据没清理 |
| 第 10 步 403 | 当前用户不是 owner |

---

# 第 8 步：第 25 周总验收

## A. Excel 读取

- [ ] 能读带合并单元格、带 `45000` 日期的文件
- [ ] 富文本变成字符串
- [ ] `2026-02-30` 返回 `null`，不是自动进位
- [ ] 表头能自动定位，不写死行号

## B. 导入

- [ ] 一次报出所有字段错误（不是遇到第一个就停）
- [ ] 好数据入库，坏数据有清单
- [ ] 同一份文件传两次不重复
- [ ] `unnest` 批量插入，不是循环

## C. 导出

- [ ] 10 万行内存稳定
- [ ] 中文文件名在浏览器里正常
- [ ] 写临时文件，失败时不会给客户半个文件
- [ ] 键集分页，不是 `OFFSET`

## D. 金额

- [ ] `money.test.js` 全绿
- [ ] 分摊总额守恒
- [ ] 税费用减法
- [ ] 数据库有 `orders_money_check`

## E. 订单

- [ ] 状态机十二个用例全过
- [ ] 并发同 key 只建一个订单
- [ ] `markPaid` 的 `where` 有 `status = 'pending'`

## F. 支付

- [ ] 假签名被拒
- [ ] 1 分钱被拒
- [ ] 重放 20 次只加 30 天
- [ ] 回调丢失能被查单救回
- [ ] 重复支付被记进 `payment_anomalies`

## G. 对账

- [ ] 能造出三种差异并正确识别
- [ ] 报告能下载，中文名正常
- [ ] `gapCents` 方向对（网关减本地）
- [ ] 匹配用 `payment_no`，不是金额

## H. 退款

- [ ] 全额退款后 `plan` 回 `free`
- [ ] 重复退款返回"已退款"
- [ ] `refund_records` 有一行记录
- [ ] `for update` 锁住了

## I. 隔离（回归）

- [ ] `npm test` 九条还是全绿
- [ ] 新加的表（`orders`、`import_jobs`、`idempotency_keys`、`payment_anomalies`、`reconcile_runs`、`refund_records`）都有 RLS
- [ ] `npm run check` 通过

## 提交

```text
git add -A
git commit -m "第175节课: 三方对账 + 差异分类 + 对账报告 + 退款闭环"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `下载对账单失败 500` | 网关没启动 | 另开窗口 `node scripts/mock-gateway.js` |
| 对账 `missingLocal` 一堆 | 造过测试数据没删 | 清理测试订单；或者删掉网关重启 |
| `totalGapCents` 是负数 | 本地比网关多 | 检查是不是有 `MISSING_REMOTE` |
| 金额差额正好是 0.6% | 拿"结算金额"和"交易金额"比 | 要用 `交易金额分` |
| 跨月的订单对不上 | 用 `created_at` 对账，不是 `paid_at` | 改成 `paid_at::date` |
| `bigint` 在 JS 里变成字符串 | `pg` 驱动对 `bigint` 返回字符串 | `Number(...)` 转换，注意别超安全整数 |
| 退款后会员还在 | 部分退款不降级（本节的取舍） | 确认是不是全额退；全额退才降级 |
| 重复退款退了两份 | 没加 `for update` | 加上 |
| `violates check constraint "orders_money_check"` | 手工改金额时没同步改其他字段 | 用 `computeOrderAmounts` 重算 |
| 报告里金额显示成 `19900` | 忘了 `fromCents` | 报表层统一转 |
| `RLS` 拦住对账脚本 | 没设 `app.tenant_id` | 用 `withTenantFromPool` |
| 对账跑了但 `differences` 是空 | `run.ok = true`，没有差异 | 正常 |

---

## 本节（也是这一周）要能说出口的一句话

> **对账的价值不在"发现总数不同"，在"能指名道姓说出是哪三笔"；而它成立的前提是每一笔都有一个唯一的外部编号——没有 `payment_no`，你连"哪一笔"都说不出来。**
