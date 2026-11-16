# 第 174 节课：回调来两次

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这是整个 36 周里最"必须做对"的一节课。**前面 173 节，回调错一次就是钱错一次。**
> 90% 的支付事故不在"发起支付"，在"处理回调"。**因为发起支付是你主动做的，回调是别人打给你的。**

**建议用时**：225 分钟（8 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—3 步（125 分钟）一次，第 4—7 步（100 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 173 节课（状态机、幂等、并发都跑通）

---

# 第 0 步：回调有五件事，你可能只做了两件（20 分钟）

## 0.1 一个真实的回调长什么样

**支付平台 POST 给你的服务器一个 JSON：**

```json
{
  "notify_id": "N20261116120001",
  "payment_no": "4200001234202611161234567890",
  "out_trade_no": "P1A2B3C4",
  "amount": 19900,
  "status": "SUCCESS",
  "paid_at": "2026-11-16T12:00:01+08:00",
  "sign": "8f3a2b1c..."
}
```

**看起来简单。但这里面有五个陷阱。**

## 0.2 五个陷阱

**陷阱一：不验签**

**任何人知道你的回调 URL，就能构造一个"已支付"的 POST。**

```text
curl -X POST https://yoursite.com/api/webhooks/pay \
  -d '{"out_trade_no":"P1A2B3C4","status":"SUCCESS","amount":19900}'
```

**你的系统给这个订单标成已支付。客户一分钱没付，拿到了会员。**

**这个攻击的成本是零。** 而且你不知道发生过——因为从你的角度看，就是收到了一次回调。

**陷阱二：验签了但不校验金额**

**攻击者拿到一个"真实的、金额最小的"回调，改一下 `out_trade_no` 指向一个贵订单。**

**签名会失效**（因为 `out_trade_no` 在签名内容里），**但如果你的签名算法不包含这个字段，或者你验签之后没比对金额，就穿了。**

**陷阱三：不幂等**

**平台重试机制：**

```text
发回调 → 你 500 或超时 → 5 秒后重发 → 你又 500 → 15 秒后重发 → ...
最多重试 8 次，持续 24 小时
```

**你的代码写的是"收到成功回调就加一个月会员"。**

**重试 8 次 = 加了 8 个月。**

**陷阱四：返回 200 太早或太晚**

```text
返回 200 太早 → 你还没处理完就说"收到了" → 处理失败也不会再重试
返回 4xx/5xx → 平台一直重试，你一直失败，最终订单永远不会变成已支付
```

**正确：处理完（事务提交）之后才返回 200。**

**陷阱五：只信回调，不做主动查单**

**回调会丢。** 平台网络问题、你的服务器当时在重启、防火墙临时拦了——**回调丢了就是丢了，平台重试 8 次之后就放弃了。**

**结果：客户付了钱，你的订单永远是"待支付"，客户去找平台投诉，平台说"我们发过回调了"，然后两边互相推。**

**最后客户来找你，你只能手工给他开通。**

**主动查单是唯一的兜底。**

## 0.3 这节课要建的六样东西

```text
① mock-gateway.js     本地假支付网关（独立进程）
② src/pay/provider.js 适配层（换真网关只改这里）
③ 签名算和验（HMAC-SHA256）
④ 回调接口（验签 → 校验金额 → 幂等 → 改状态 → 返回 200）
⑤ 主动查单（回调丢了怎么办）
⑥ 复活流程（expired → paid）
```

---

# 第 1 步：建 mock 网关（35 分钟）

**为什么要独立进程：** 因为它要"主动打你的回调接口"。如果它和你的服务在同一个进程里，就变成自己调自己，测不出网络问题、测不出重试。

## 1.1 新建 `scripts/mock-gateway.js`

```js
const express = require('express');
const crypto = require('crypto');

const PORT = Number(process.env.GATEWAY_PORT || 4000);
const SECRET = process.env.GATEWAY_SECRET || 'mock-gateway-secret-key';
const MERCHANT_CALLBACK = process.env.MERCHANT_CALLBACK || 'http://localhost:3000/api/webhooks/pay';

const app = express();
app.use(express.json());

const payments = new Map();

function sign(payload) {
  const keys = Object.keys(payload).filter((k) => k !== 'sign').sort();
  const str = keys.map((k) => k + '=' + payload[k]).join('&');
  return crypto.createHmac('sha256', SECRET).update(str).digest('hex');
}

function verify(payload) {
  const given = payload.sign;
  if (typeof given !== 'string') return false;
  const expected = sign(payload);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.post('/pay/create', (req, res) => {
  const { out_trade_no: outTradeNo, amount, subject } = req.body;

  if (!outTradeNo || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: '参数不对' });
  }

  const paymentNo = 'MOCK' + Date.now() + crypto.randomBytes(3).toString('hex').toUpperCase();

  payments.set(paymentNo, {
    payment_no: paymentNo,
    out_trade_no: outTradeNo,
    amount,
    subject: subject || '',
    status: 'PENDING',
    created_at: new Date().toISOString(),
    paid_at: null,
    notified: 0,
  });

  console.log('[gateway] 创建支付单', paymentNo, '金额', amount, '分');

  res.json({
    payment_no: paymentNo,
    pay_url: 'http://localhost:' + PORT + '/pay/page/' + paymentNo,
    amount,
  });
});

app.get('/pay/page/:paymentNo', (req, res) => {
  const p = payments.get(req.params.paymentNo);
  if (!p) return res.status(404).send('支付单不存在');

  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>模拟收银台</title>
<style>
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;max-width:420px;margin:60px auto;padding:0 20px;color:#222}
h1{font-size:20px}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:14px}
.amt{font-size:28px;font-weight:700;margin:20px 0}
button{width:100%;padding:14px;font-size:16px;border:0;border-radius:6px;background:#07c160;color:#fff;cursor:pointer;margin-top:12px}
button.gray{background:#888}
</style></head>
<body>
<h1>模拟收银台</h1>
<div class="row"><span>支付单号</span><span>${p.payment_no}</span></div>
<div class="row"><span>订单号</span><span>${p.out_trade_no}</span></div>
<div class="amt">¥ ${(p.amount / 100).toFixed(2)}</div>
<form method="post" action="/pay/confirm/${p.payment_no}">
  <button type="submit">确认支付</button>
</form>
<form method="post" action="/pay/cancel/${p.payment_no}">
  <button type="submit" class="gray">取消</button>
</form>
</body></html>`);
});

app.post('/pay/confirm/:paymentNo', async (req, res) => {
  const p = payments.get(req.params.paymentNo);
  if (!p) return res.status(404).send('支付单不存在');
  if (p.status === 'SUCCESS') return res.send('这笔已经支付过了');

  p.status = 'SUCCESS';
  p.paid_at = new Date().toISOString();

  res.type('html').send('<p>支付成功，正在通知商户……</p><p><a href="/pay/list">看网关状态</a></p>');

  notifyMerchant(p, 1).catch((err) => console.error('[gateway] 通知失败', err.message));
});

app.post('/pay/cancel/:paymentNo', (req, res) => {
  const p = payments.get(req.params.paymentNo);
  if (!p) return res.status(404).send('支付单不存在');
  p.status = 'CLOSED';
  res.send('已取消');
});

async function notifyMerchant(p, attempt) {
  const payload = {
    notify_id: 'N' + Date.now() + crypto.randomBytes(2).toString('hex'),
    payment_no: p.payment_no,
    out_trade_no: p.out_trade_no,
    amount: p.amount,
    status: p.status,
    paid_at: p.paid_at,
  };
  payload.sign = sign(payload);

  console.log(`[gateway] 第 ${attempt} 次回调 ${MERCHANT_CALLBACK}`);

  try {
    const res = await fetch(MERCHANT_CALLBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    const text = await res.text();
    console.log(`[gateway] 回调返回 ${res.status} ${text.slice(0, 120)}`);

    if (res.status >= 200 && res.status < 300) {
      p.notified += 1;
      return { ok: true };
    }
  } catch (err) {
    console.log(`[gateway] 回调异常 ${err.message}`);
  }

  return { ok: false };
}

app.get('/pay/query/:paymentNo', (req, res) => {
  const p = payments.get(req.params.paymentNo);
  if (!p) {
    return res.status(404).json({ error: '支付单不存在', code: 'ORDER_NOT_EXIST' });
  }

  res.json({
    payment_no: p.payment_no,
    out_trade_no: p.out_trade_no,
    amount: p.amount,
    status: p.status,
    paid_at: p.paid_at,
  });
});

app.post('/mock/repay/:paymentNo', async (req, res) => {
  const p = payments.get(req.params.paymentNo);
  if (!p) return res.status(404).json({ error: '不存在' });

  const times = Number(req.query.times || 3);
  const results = [];
  for (let i = 0; i < times; i++) {
    results.push(await notifyMerchant(p, i + 1));
  }

  res.json({ payment_no: p.payment_no, attempts: times, results });
});

app.post('/mock/lose-notify/:paymentNo', (req, res) => {
  const p = payments.get(req.params.paymentNo);
  if (!p) return res.status(404).json({ error: '不存在' });
  p.status = 'SUCCESS';
  p.paid_at = new Date().toISOString();
  p.notified = 0;
  console.log('[gateway] 支付成功，但故意不回调（模拟回调丢失）');
  res.json({ ok: true, note: '已标记为成功，但没有通知商户' });
});

app.get('/pay/list', (req, res) => {
  const rows = [...payments.values()].reverse().slice(0, 30);
  res.type('html').send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>网关状态</title>
<style>
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;max-width:900px;margin:40px auto;padding:0 20px;font-size:13px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
th{background:#f5f5f5}
</style></head><body>
<h2>网关里的支付单</h2>
<table>
<tr><th>支付单号</th><th>商户订单号</th><th>金额（分）</th><th>状态</th><th>回调次数</th><th>支付时间</th></tr>
${rows.map((p) => `<tr><td>${p.payment_no}</td><td>${p.out_trade_no}</td><td>${p.amount}</td><td>${p.status}</td><td>${p.notified}</td><td>${p.paid_at || '-'}</td></tr>`).join('')}
</table>
</body></html>`);
});

app.listen(PORT, () => {
  console.log('mock 网关已启动 http://localhost:' + PORT);
  console.log('商户回调地址：', MERCHANT_CALLBACK);
  console.log('签名密钥：', SECRET);
});
```

## 1.2 四个设计值得讲

### 签名算法：按键名排序后用 `&` 拼接

```js
const keys = Object.keys(payload).filter((k) => k !== 'sign').sort();
const str = keys.map((k) => k + '=' + payload[k]).join('&');
return crypto.createHmac('sha256', SECRET).update(str).digest('hex');
```

**这是微信支付 v2 的做法，支付宝也是类似思路。**

**三个关键点：**

```text
① 排除 sign 自己（不然算出不来的循环）
② 键名排序（不然"同样内容不同顺序"会算出不同签名）
③ 只拼接非空值（真实平台会跳过空字符串，这里简化了）
```

**真实平台的签名细节会略有不同**（比如微信要用 `&key=密钥` 结尾），**但思路完全一样。**

**你换成真实网关时，只需要改 `sign()` 这一个函数。**

### `crypto.timingSafeEqual`

```js
if (a.length !== b.length) return false;
return crypto.timingSafeEqual(a, b);
```

**为什么不用 `===`：**

**字符串比较是"发现不同就返回"，耗时和相同前缀的长度相关。**

**攻击者可以通过测量响应时间逐字节猜出正确的签名。**

**这个攻击叫"时序攻击（timing attack）"，实际可利用，虽然条件苛刻。**

**`timingSafeEqual` 保证无论内容如何，比较时间恒定。**

**注意：它在长度不同时会抛错，所以必须先比长度。**

### `/mock/repay/:paymentNo` 手动重放

**真实平台的重试你控制不了。这个接口让你随时造"回调来 N 次"。**

**这是 mock 网关最大的价值：你没法让微信给你重复发三次回调，但你可以让 mock 做。**

### `/mock/lose-notify/:paymentNo` 模拟回调丢失

**把支付单标成成功，但不发回调。**

**这就是真实世界里"客户付了钱，你的订单还是待支付"的场景。**

**第 5 步的主动查单就是为它准备的。**

## 1.3 启动

**三个窗口：**

```text
窗口 1：npm run dev                            （你的服务，3000）
窗口 2：node scripts/mock-gateway.js           （网关，4000）
窗口 3：命令行
```

**如果端口冲突：**

```text
set GATEWAY_PORT=4001
node scripts/mock-gateway.js
```

**自检点：打开 `http://localhost:4000/pay/list`，应该看到一个空表格。**

---

# 第 2 步：适配层（25 分钟）

**为什么要有适配层：** 换真网关时只改一个文件，其他代码一行不动。

## 2.1 新建 `src/pay/provider.js`

```js
const crypto = require('crypto');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const SECRET = process.env.GATEWAY_SECRET || 'mock-gateway-secret-key';

function sign(payload) {
  const keys = Object.keys(payload).filter((k) => k !== 'sign').sort();
  const str = keys.map((k) => k + '=' + payload[k]).join('&');
  return crypto.createHmac('sha256', SECRET).update(str).digest('hex');
}

function verifySignature(payload) {
  const given = payload.sign;
  if (typeof given !== 'string' || given.length === 0) return false;

  const expected = sign(payload);
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function createPayment({ outTradeNo, amountCents, subject }) {
  const res = await fetch(GATEWAY + '/pay/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      out_trade_no: outTradeNo,
      amount: amountCents,
      subject,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('创建支付失败 ' + res.status + ' ' + text.slice(0, 200));
  }

  return res.json();
}

async function queryPayment(paymentNo) {
  const res = await fetch(GATEWAY + '/pay/query/' + encodeURIComponent(paymentNo), {
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 404) {
    return { status: 'NOT_EXIST' };
  }

  if (!res.ok) {
    throw new Error('查单失败 ' + res.status);
  }

  const data = await res.json();
  return {
    status: data.status,
    amountCents: data.amount,
    paidAt: data.paid_at,
    outTradeNo: data.out_trade_no,
  };
}

module.exports = { verifySignature, createPayment, queryPayment, sign };
```

## 2.2 三个设计点

### `AbortSignal.timeout(10000)`

**没有超时的 `fetch` 会一直挂着。**

**如果网关挂了（或者只是网络卡），你的请求会挂到 Node 的默认超时（可能几分钟），期间占着一个连接。**

**10 秒是个合理值。真实支付平台的响应通常在 1 秒内。**

**注意 `AbortSignal.timeout` 需要 Node 17.3+。** 你的版本应该早够了。

### `404` 单独处理成 `NOT_EXIST`

**"支付单不存在"和"查单失败"是完全不同的事：**

```text
支付单不存在 → 说明你从来没发起过这笔支付 → 订单可以取消
查单失败     → 网络/网关问题 → 稍后重试，不能动订单
```

**如果混在一起处理，你会把"网关临时抽风"当成"客户从没付过"，然后把订单取消掉。**

### `sign` 也导出了

**因为测试脚本要自己造一个合法签名的回调。**

**这个函数在测试里能用，在生产代码里不该被调用。**

**更好的做法是把它放在 `provider.test-helper.js` 里。但先这样，简单。**

## 2.3 `.env` 加三行

```text
GATEWAY_URL=http://localhost:4000
GATEWAY_SECRET=mock-gateway-secret-key
GATEWAY_CALLBACK=http://localhost:3000/api/webhooks/pay
```

**`GATEWAY_SECRET` 在真环境里是平台给你的密钥，绝对不能进 Git。**

---

# 第 3 步：回调接口（45 分钟）

**这是这节课的核心代码。**

## 3.1 新建 `src/routes/webhooks.js`

```js
const express = require('express');
const { withTenantFromPool } = require('../db/tenant-db');
const pool = require('../db/pool');
const { verifySignature } = require('../pay/provider');
const { handlePaidNotify, tryRevive } = require('../orders/service');

const router = express.Router();

function log(event, data) {
  console.log('[webhook]', event, JSON.stringify(data));
}

router.post('/pay', async (req, res) => {
  const payload = req.body || {};

  log('收到', {
    notify_id: payload.notify_id,
    out_trade_no: payload.out_trade_no,
    status: payload.status,
    amount: payload.amount,
  });

  if (!verifySignature(payload)) {
    log('验签失败', { notify_id: payload.notify_id, out_trade_no: payload.out_trade_no });
    return res.status(401).json({ code: 'SIGN_INVALID', message: '签名不合法' });
  }

  if (payload.status !== 'SUCCESS') {
    log('非成功状态，忽略', { status: payload.status });
    return res.json({ code: 'SUCCESS', message: '收到，非成功状态不处理' });
  }

  const orderNo = String(payload.out_trade_no || '');
  const paymentNo = String(payload.payment_no || '');
  const amountCents = Number(payload.amount);

  if (!orderNo || !paymentNo || !Number.isInteger(amountCents) || amountCents <= 0) {
    log('字段缺失', payload);
    return res.status(400).json({ code: 'PARAM_INVALID', message: '字段不完整' });
  }

  let outcome;

  try {
    outcome = await handlePaidNotify({ orderNo, paymentNo, amountCents });
  } catch (err) {
    log('处理异常', { orderNo, error: err.message });
    return res.status(500).json({ code: 'SERVER_ERROR', message: '处理失败' });
  }

  log('处理结果', { orderNo, outcome: outcome.reason || 'OK', status: outcome.status });

  if (outcome.reason === 'AMOUNT_MISMATCH') {
    return res.status(400).json({ code: 'AMOUNT_MISMATCH', message: '金额不一致' });
  }

  if (outcome.reason === 'NOT_FOUND') {
    return res.status(404).json({ code: 'ORDER_NOT_FOUND', message: '订单不存在' });
  }

  if (outcome.reason === 'BAD_STATE') {
    return res.status(409).json({ code: 'BAD_STATE', message: '订单状态异常' });
  }

  if (outcome.reason === 'NEEDS_REVIVAL') {
    const revived = await tryRevive({ orderNo, paymentNo, amountCents });

    if (revived.ok) {
      return res.json({ code: 'SUCCESS', message: '已复活并生效' });
    }

    if (revived.reason === 'DUPLICATE_PAYMENT') {
      log('重复支付，需人工退款', { orderNo, paymentNo });
      return res.json({
        code: 'SUCCESS',
        message: '已收到，重复支付将原路退回',
      });
    }

    return res.status(500).json({ code: 'REVIVE_FAILED', message: '复活失败' });
  }

  return res.json({ code: 'SUCCESS', message: 'OK' });
});

router.get('/pay/health', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
```

## 3.2 为什么这个接口必须"业务层拆出来"

**注意 `handlePaidNotify` 和 `tryRevive` 是分开的。**

**因为 `tryRevive` 里要做"主动查单"——那是个网络请求，不能在事务里做。**

**这个拆分后面会看到原因。**

## 3.3 把 `handlePaidNotify` 加到 `src/orders/service.js`

**在已有 `markPaid` 的基础上加（把这段追加到同一个文件末尾，不要新建文件）：**

```js
const pool = require('../db/pool');
const { withTenantFromPool } = require('../db/tenant-db');

async function handlePaidNotify({ orderNo, paymentNo, amountCents }) {
  const found = await pool.query(
    `select tenant_id from orders where order_no = $1 limit 1`,
    [orderNo]
  );

  if (found.rowCount === 0) {
    return { reason: 'NOT_FOUND' };
  }

  const tenantId = found.rows[0].tenant_id;

  return withTenantFromPool(tenantId, async (db) => {
    const { rows } = await db.client.query(
      `select id, tenant_id, status, amount_cents, paid_cents, payment_no
       from orders
       where tenant_id = $1 and order_no = $2`,
      [tenantId, orderNo]
    );

    if (rows.length === 0) {
      return { reason: 'NOT_FOUND' };
    }

    const order = rows[0];

    if (order.amount_cents !== amountCents) {
      console.error(
        '[webhook] 金额不一致',
        'order_no=' + orderNo,
        '库里=' + order.amount_cents,
        '回调=' + amountCents
      );
      return { reason: 'AMOUNT_MISMATCH' };
    }

    const result = await markPaid(db, tenantId, order.id, { paymentNo });

    if (result.ok) {
      return { status: 'paid', reason: null };
    }

    if (result.reason === 'ALREADY_PAID') {
      return { status: 'paid', reason: 'ALREADY_PAID' };
    }

    if (result.reason === 'NEEDS_REVIVAL') {
      return { status: result.status, reason: 'NEEDS_REVIVAL' };
    }

    return { status: result.status, reason: result.reason || 'BAD_STATE' };
  });
}
```

**这里需要 `withTenantFromPool`。**

**因为回调没有 `req.tenant`——它不是用户发起的请求。**

**在 `src/db/tenant-db.js` 里加：**

```js
async function withTenantFromPool(tenantId, fn) {
  if (!tenantId) {
    throw new Error('withTenantFromPool 需要一个租户 id');
  }

  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id', $1, true)", [
      String(tenantId),
    ]);

    const db = createRepo(client, tenantId);
    const result = await fn(db);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withTenant, borrowForTenant, withTenantFromPool };
```

**它和 `withTenant` 的实现几乎一样。**

**区别只在语义：`withTenant` 是"当前登录用户所在的租户"，`withTenantFromPool` 是"我查出来的某个租户"。**

**为什么不合成一个：** 因为合成之后，代码里就出现了"这个 tenantId 是从哪来的"这个疑问。**两个名字逼你回答这个问题。**

## 3.4 为什么先查租户再开事务

**注意这个流程：**

```text
① 用系统连接（无租户上下文）查 order_no 属于哪个租户
② 用那个租户开事务，做实际处理
```

**第 ① 步必须在 RLS 之外做。**

**因为 `orders` 表有 RLS，没设 `app.tenant_id` 时查出来是 0 行。**

**所以第 ① 步要用一个"绕过 RLS"的连接。**

**两种做法：**

```text
方案 A：用超级用户连接（不受 RLS 约束）
方案 B：给 orders 表加一个"允许查 tenant_id 的窄策略"
```

**方案 A 简单，但危险：那个连接能看到所有数据。**

**方案 B 更安全，但要改 RLS 策略：**

```sql
create policy webhook_lookup on orders
  for select
  using (true)
  to app_webhook;
```

**这需要创建一个专门的数据库角色 `app_webhook`，只给它 `select (tenant_id, order_no, id, amount_cents, status)` 这几列。**

**这是正规做法，但这一节会讲得太长。**

**这一节用方案 A，但你要知道它的风险：**

```text
那个查询只允许查 tenant_id，一行 SELECT
返回的 tenant_id 立刻用来开新事务
绝对不能在那个连接上做别的查询
```

**把这个限制写进代码注释。**

**真实场景里，更好的做法是：在支付单创建时就记下 tenant_id。**

```sql
-- orders 表已经有 tenant_id，但你要靠 order_no 反查
-- 更好的做法：另建一张 payment_intents 表，主键是 payment_no，直接带 tenant_id
```

**这样查租户就不需要碰 `orders`，可以给 `payment_intents` 一个宽松的查询策略。**

**这个改进留到第 175 节对账时做。现在先按简单方案走通。**

## 3.5 完整流程走一遍（手工）

**一、创建订单（你的服务）**

```text
curl -X POST http://localhost:3000/api/orders -b cookies.txt -H "Content-Type: application/json" -d "{\"plan\":\"pro\",\"requestId\":\"pay-test-0001\"}"
```

**记下 `order.order_no`，比如 `P1A2B3C4`。**

**二、创建支付单（调网关）**

**这一步要在你的服务里做。给订单加一个"去支付"接口：**

**在 `src/routes/orders.js` 里加：**

```js
const { createPayment } = require('../pay/provider');

router.post('/:id/pay', async (req, res, next) => {
  try {
    const order = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select id, order_no, amount_cents, status from orders
         where tenant_id = $1 and id = $2`,
        [req.tenant.id, req.params.id]
      );
      return r.rows[0] || null;
    });

    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    if (order.status !== 'pending') {
      return res.status(409).json({ error: '这个订单不能支付', status: order.status });
    }

    const payment = await createPayment({
      outTradeNo: order.order_no,
      amountCents: order.amount_cents,
      subject: '套餐购买',
    });

    await withTenant(req.tenant.id, async (db) => {
      await db.client.query(
        `update orders set payment_no = $1 where tenant_id = $2 and id = $3`,
        [payment.payment_no, req.tenant.id, order.id]
      );
    });

    res.json(payment);
  } catch (err) {
    next(err);
  }
});
```

**调用：**

```text
curl -X POST http://localhost:3000/api/orders/<orderId>/pay -b cookies.txt
```

**返回：**

```json
{"payment_no":"MOCK1710ab12","pay_url":"http://localhost:4000/pay/page/MOCK1710ab12","amount":19900}
```

**三、打开 `pay_url`，点"确认支付"**

**网关会：**
1. 把支付单标成成功
2. **立即回调你的 `/api/webhooks/pay`**

**四、看你的服务日志**

**应该看到：**

```text
[webhook] 收到 {"notify_id":"N...","out_trade_no":"P1A2B3C4","status":"SUCCESS","amount":19900}
[webhook] 处理结果 {"orderNo":"P1A2B3C4","outcome":"OK","status":"paid"}
```

**五、查订单**

```text
curl http://localhost:3000/api/orders/<orderId> -b cookies.txt
```

**`status` 应该是 `paid`，`paid_cents` 应该是 `19900`。**

**六、查租户**

```sql
select plan, plan_expires_at from tenants where id = '<你的租户id>';
```

**应该是 `pro`，到期时间加了 30 天。**

## 3.6 自检点：一个必须发现的问题

**你刚才那条 `update orders set payment_no = ...` 是在 `createPayment` 之后才执行的。**

**这中间有个时间窗口：**

```text
① 调网关创建支付单，拿到 payment_no
② 网关立刻回调（如果客户手速快）
③ 你的回调里 order.payment_no 还是 null
④ 但 markPaid 里会 set payment_no = $1，所以最终是对的
```

**所以没问题。**

**但反过来有个问题：如果客户在"①到②之间"就付了款，你的 `update payment_no` 会覆盖回调写进去的值。**

**两个值其实一样，所以无害。**

**但如果网关给的 `payment_no` 和回调里的不一样呢？**（真实平台里是一样的。）

**那就出事了。**

**更稳的写法：`update ... where payment_no is null`。**

```js
await db.client.query(
  `update orders set payment_no = $1
   where tenant_id = $2 and id = $3 and payment_no is null`,
  [payment.payment_no, req.tenant.id, order.id]
);
```

**这一句现在是幂等的、不覆盖的。**

**把这一句改掉。** 这是个很真实的细节——**90% 的人会写成不带条件的 `update`。**

---

# 第 4 步：故意发一个假回调（20 分钟）

**这一步必须做，而且要亲手做。**

## 4.1 不用签名，直接打

**新建 `scripts/fake-callback.js`：**

```js
const pool = require('../src/db/pool');

const BASE = 'http://localhost:3000';

async function main() {
  const { rows } = await pool.query(
    `select order_no, amount_cents, status
     from orders
     where status = 'pending'
     order by created_at desc
     limit 1`
  );

  if (rows.length === 0) {
    console.log('没有待支付订单，先建一个');
    await pool.end();
    return;
  }

  const order = rows[0];
  console.log('拿到的待支付订单：', order.order_no, order.amount_cents, '分');

  const payload = {
    notify_id: 'FAKE' + Date.now(),
    payment_no: 'FAKE' + Date.now(),
    out_trade_no: order.order_no,
    amount: order.amount_cents,
    status: 'SUCCESS',
    paid_at: new Date().toISOString(),
    sign: 'deadbeefdeadbeefdeadbeefdeadbeef',
  };

  const res = await fetch(BASE + '/api/webhooks/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  console.log('返回：', res.status, await res.text());

  const after = await pool.query(
    'select status from orders where order_no = $1',
    [order.order_no]
  );
  console.log('订单状态：', after.rows[0].status);
  console.log(
    after.rows[0].status === 'paid'
      ? '!!! 假的回调居然成功了，验签没生效'
      : '正确：假回调被拒绝，订单还是 pending'
  );

  await pool.end();
}

main();
```

**跑：**

```text
node scripts/fake-callback.js
```

**期望输出：**

```text
返回： 401 {"code":"SIGN_INVALID","message":"签名不合法"}
订单状态： pending
正确：假回调被拒绝，订单还是 pending
```

## 4.2 如果它成功了

**说明你的 `verifySignature` 有问题。**

**常见原因：**

```text
① 忘了调 verifySignature
② verifySignature 永远返回 true（比如写成了 return true）
③ 签名字段名对不上（sign vs signature）
```

## 4.3 再造一个"签名对但金额错"的

**新建 `scripts/tamper-callback.js`：**

```js
const { sign } = require('../src/pay/provider');
const pool = require('../src/db/pool');

const BASE = 'http://localhost:3000';

async function main() {
  const { rows } = await pool.query(
    `select order_no, amount_cents from orders
     where status = 'pending' order by created_at desc limit 1`
  );

  if (rows.length === 0) {
    console.log('没有待支付订单');
    await pool.end();
    return;
  }

  const order = rows[0];

  const payload = {
    notify_id: 'TAMPER' + Date.now(),
    payment_no: 'TAMPER' + Date.now(),
    out_trade_no: order.order_no,
    amount: 1,
    status: 'SUCCESS',
    paid_at: new Date().toISOString(),
  };
  payload.sign = sign(payload);

  console.log('真实金额', order.amount_cents, '分，我假装付了 1 分');

  const res = await fetch(BASE + '/api/webhooks/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  console.log('返回：', res.status, await res.text());

  const after = await pool.query(
    'select status from orders where order_no = $1',
    [order.order_no]
  );
  console.log('订单状态：', after.rows[0].status);
  console.log(after.rows[0].status === 'paid' ? '!!! 1 分钱买到了会员' : '正确：金额不符被拒绝');

  await pool.end();
}

main();
```

**跑，期望：**

```text
返回： 400 {"code":"AMOUNT_MISMATCH","message":"金额不一致"}
订单状态： pending
正确：金额不符被拒绝
```

**这个测试极其重要。**

**因为它的签名是**合法**的——攻击者如果拿到了你的密钥（或者你验签的内容里不含 amount），这个攻击就能成。**

**你的代码必须显式比对金额。**

**而且要用"库里的金额"比，不是"回调里的金额"。**

## 4.4 再试一个：改订单号

**把 `out_trade_no` 改成隔壁的贵订单，用合法签名。**

**这个攻击在签名正确时会失效——因为 `out_trade_no` 在签名内容里，改了签名就对不上。**

**自己验一遍：改完之后 `sign` 失效，返回 401。**

**这个实验让你真正理解"签名保护了什么"。**

---

# 第 5 步：回调丢了怎么办（35 分钟）

**这是最容易被忽略、后果最严重的一步。**

## 5.1 造一次"钱付了但回调没来"

**跑：**

```text
curl -X POST http://localhost:4000/mock/lose-notify/MOCK<你的支付单号>
```

**网关会：**

```text
把支付单标成 SUCCESS
但不发回调
```

**现在：**

```text
网关那边：已支付
你的库里：pending
```

**客户会打电话："我付了钱，为什么还是待支付？"**

## 5.2 主动查单

**写一个"对账式查单"的脚本。**

**新建 `scripts/query-pending.js`：**

```js
const pool = require('../src/db/pool');
const { queryPayment } = require('../src/pay/provider');
const { handlePaidNotify } = require('../src/orders/service');

(async () => {
  const { rows } = await pool.query(`
    select tenant_id, order_no, payment_no, amount_cents, status, created_at
    from orders
    where status = 'pending'
      and payment_no is not null
      and created_at > now() - interval '3 days'
    order by created_at desc
  `);

  console.log('待支付且有支付单号的订单：', rows.length, '条');

  for (const o of rows) {
    if (!o.payment_no) continue;

    try {
      const q = await queryPayment(o.payment_no);

      if (q.status === 'SUCCESS') {
        console.log('发现已支付但未确认：', o.order_no);

        if (q.amountCents !== o.amount_cents) {
          console.error('  金额不一致，跳过。库里', o.amount_cents, '网关', q.amountCents);
          continue;
        }

        const outcome = await handlePaidNotify({
          orderNo: o.order_no,
          paymentNo: o.payment_no,
          amountCents: q.amountCents,
        });

        console.log('  处理结果：', outcome.reason || 'OK', outcome.status || '');
      } else if (q.status === 'NOT_EXIST') {
        console.log('网关里没有这个支付单：', o.order_no, '（可能客户没付款就关了）');
      } else {
        console.log(o.order_no, '网关状态：', q.status);
      }
    } catch (err) {
      console.error(o.order_no, '查单失败：', err.message);
    }
  }

  await pool.end();
})();
```

**跑：**

```text
node scripts/query-pending.js
```

**期望：**

```text
待支付且有支付单号的订单： 1 条
发现已支付但未确认： P1A2B3C4
  处理结果： OK
```

**现在订单变 `paid` 了。**

**客户不用打电话了。**

## 5.3 就是那个"必须做主动查单"的理由

**你的系统现在有两个入口让订单变成 paid：**

```text
① 回调（实时，但有丢失风险）
② 主动查单（定时跑，慢但可靠）
```

**两个入口都走 `handlePaidNotify`，所以幂等由它统一保证。**

**这就是设计的力量：** 你不需要在"回调路径"和"查单路径"各写一遍幂等逻辑——**同一段代码，两条路都走。**

## 5.4 为什么要有 `created_at > now() - interval '3 days'`

**因为更早的订单不该再查了。**

```text
3 天前下的单，客户没付，支付单早就在网关那边过期了
每次对账都去查一次，是浪费
```

**更重要的是：** 真实平台查单有频率限制（微信支付大概每秒几十次），**全量查会被限流。**

**3 天是个合理窗口：** 客户付了钱但没确认，最迟 3 天内会来问。

## 5.5 还可以做得更狠：按支付单号查

**上面的脚本是按"我的待支付订单"遍历，逐个查网关。**

**如果一天有 1000 个待支付订单，就是 1000 次查单请求。**

**更好的做法：按"网关通知过的、但我没处理的"来查。**

**但那就需要网关提供一个"列出某时间段成功支付"的接口。真实平台有这个（对账单下载），第 175 节就是干这个的。**

**现在先这样：**

```text
每 5 分钟跑一次，只看最近 6 小时内创建的待支付订单
每次最多查 50 单（加 limit）
```

**这样一天最多 288 次 × 50 = 14400 次查询，对网关压力可控。**

**把 `limit 50` 加上。**

## 5.6 一个真实的取舍

**你可能会想："既然主动查单这么可靠，那我不做回调了，只靠查单行不行？"**

**不行。**

```text
① 客户付完钱后要等最多 5 分钟才看到"已支付" → 体验很差
② 查单要遍历你的待支付订单，量大时效率低
③ 回调是平台"推"给你，几乎零延迟零成本
```

**正确做法是"回调为主、查单为辅"：**

```text
回调      → 实时性，99% 的情况靠它
查单      → 兜底，处理那 1% 丢失的
对账单    → 最终仲裁，第 175 节
```

---

# 第 6 步：复活流程（25 分钟）

**第 173 节留的 `NEEDS_REVIVAL`，这里实现。**

## 6.1 场景再讲一遍

```text
10:00  客户下单，15 分钟支付时限
10:14  客户付款，回调丢了
10:16  清理脚本把订单标成 expired
10:20  客户点"已支付"，你查单发现真的付了
```

**现在要复活这个订单。**

**但有个坑：** 客户在 10:16 之后可能又下了一单并付了款。**如果两单都复活，客户付两次。**

## 6.2 写 `tryRevive`

**在 `src/orders/service.js` 里加：**

```js
async function tryRevive({ orderNo, paymentNo, amountCents }) {
  const found = await pool.query(
    `select tenant_id from orders where order_no = $1 limit 1`,
    [orderNo]
  );
  if (found.rowCount === 0) return { ok: false, reason: 'NOT_FOUND' };

  const tenantId = found.rows[0].tenant_id;

  const q = await queryPayment(paymentNo);
  if (q.status !== 'SUCCESS') {
    return { ok: false, reason: 'GATEWAY_NOT_PAID', gatewayStatus: q.status };
  }
  if (q.amountCents !== amountCents) {
    return { ok: false, reason: 'AMOUNT_MISMATCH' };
  }

  return withTenantFromPool(tenantId, async (db) => {
    const { rows } = await db.client.query(
      `select id, order_no, status, amount_cents, created_at
       from orders
       where tenant_id = $1 and order_no = $2`,
      [tenantId, orderNo]
    );
    if (rows.length === 0) return { ok: false, reason: 'NOT_FOUND' };

    const order = rows[0];

    if (order.status === 'paid') {
      return { ok: true, reason: 'ALREADY_PAID' };
    }

    if (order.status !== 'expired' && order.status !== 'canceled') {
      return { ok: false, reason: 'BAD_STATE', status: order.status };
    }

    const dup = await db.client.query(
      `select order_no, created_at from orders
       where tenant_id = $1
         and status = 'paid'
         and created_at > $2
         and id <> $3
       order by created_at asc
       limit 1`,
      [tenantId, order.created_at, order.id]
    );

    if (dup.rowCount > 0) {
      console.error(
        '[revive] 重复支付：',
        orderNo,
        '之后已有已支付订单',
        dup.rows[0].order_no
      );

      await db.client.query(
        `insert into payment_anomalies (tenant_id, order_no, payment_no, amount_cents, kind, detail)
         values ($1, $2, $3, $4, 'DUPLICATE_PAYMENT', $5::jsonb)`,
        [
          tenantId,
          orderNo,
          paymentNo,
          amountCents,
          JSON.stringify({ laterPaidOrder: dup.rows[0].order_no }),
        ]
      );

      return { ok: false, reason: 'DUPLICATE_PAYMENT' };
    }

    const revived = await db.client.query(
      `update orders
       set status = 'paid', paid_cents = amount_cents, paid_at = now(), payment_no = $1
       where tenant_id = $2 and id = $3
         and status in ('expired', 'canceled')
       returning id, order_no`,
      [paymentNo, tenantId, order.id]
    );

    if (revived.rowCount === 0) {
      return { ok: false, reason: 'RACE_LOST' };
    }

    await db.client.query(
      `update tenants
       set plan = 'pro',
           plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + interval '30 days'
       where id = $1`,
      [tenantId]
    );

    return { ok: true, reason: 'REVIVED' };
  });
}
```

## 6.3 四处关键

### 先查网关，再改状态

```js
const q = await queryPayment(paymentNo);
if (q.status !== 'SUCCESS') return { ok: false, reason: 'GATEWAY_NOT_PAID' };
```

**这是最重要的一步。**

**为什么：** 复活是个危险操作——**你在把一个"过期"的订单变成"已支付"。如果判断错了，你就白送了一个会员。**

**所以不能只信回调（回调可能是伪造的、可能是延迟很久的、可能对应一个已经被退款的支付）。**

**必须问网关："这笔钱现在真的收到了吗？"**

**这个"再确认一次"的动作，把风险从"相信一条消息"降到了"相信网关的当前状态"。**

### 查重放在改状态之前

```js
const dup = await db.client.query(`... status = 'paid' and created_at > $2 ...`);
```

**如果客户在订单过期后又下了新单并付了款，这里会查到。**

**查到就：**

```text
① 记一条 payment_anomalies
② 不改状态
③ 返回 DUPLICATE_PAYMENT
```

**然后回调接口返回 200（告诉平台收到了），但内部标记待人工处理。**

**为什么要建 `payment_anomalies` 表：**

```text
这类问题不可能自动解决——你得人工退款给客户
如果不留记录，客户下次来问，你完全查不到
```

**新建 `migrations/013_anomalies.sql`：**

```sql
create table payment_anomalies (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  order_no     text not null,
  payment_no   text,
  amount_cents integer not null,
  kind         text not null,
  detail       jsonb not null default '{}'::jsonb,
  resolved     boolean not null default false,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index payment_anomalies_open_idx
  on payment_anomalies (created_at desc) where resolved = false;

alter table payment_anomalies enable row level security;
alter table payment_anomalies force row level security;

create policy tenant_isolation on payment_anomalies
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**`kind` 可能的值：**

```text
DUPLICATE_PAYMENT    重复支付
AMOUNT_MISMATCH      金额不符
GATEWAY_PAID_NO_ORDER 网关有支付但本地无订单
REFUND_FAILED        退款失败
```

### `and status in ('expired', 'canceled')` 在 `where` 里

**又是那句话：条件在 `where` 里，不在代码里。**

**如果两个查单任务同时复活同一单，只有一个能成功，另一个拿到 `rowCount = 0` → `RACE_LOST`。**

### `RACE_LOST` 返回什么

**它意味着"另一个进程刚刚处理了这单"。**

**回调接口应该返回 200（因为事情已经办成了）。**

**但现在代码里 `RACE_LOST` 会走到 `if (revived.ok)` 为 false 的分支，返回 500。**

**改一下回调接口的判断。**

**找到第 3 步写的那个 `if (outcome.reason === 'NEEDS_REVIVAL') { ... }` 块（在 577—593 行），整个换成这版：**

```js
  if (outcome.reason === 'NEEDS_REVIVAL') {
    const revived = await tryRevive({ orderNo, paymentNo, amountCents });

    if (revived.ok) {
      return res.json({ code: 'SUCCESS', message: '已复活并生效' });
    }

    if (revived.reason === 'RACE_LOST') {
      log('复活竞争失败，别人处理了', { orderNo, paymentNo });
      return res.json({ code: 'SUCCESS', message: '已生效' });
    }

    if (revived.reason === 'DUPLICATE_PAYMENT') {
      log('重复支付，需人工退款', { orderNo, paymentNo });
      return res.json({
        code: 'SUCCESS',
        message: '已收到，重复支付将原路退回',
      });
    }

    log('复活失败', { orderNo, paymentNo, reason: revived.reason });
    return res.status(500).json({ code: 'REVIVE_FAILED', message: '复活失败' });
  }
```

**只加了三行 `RACE_LOST` 分支和一行 `log`，其余没变。**

**为什么 `RACE_LOST` 要返回 200 而不是 500。**

**`RACE_LOST` 说明别人成功了，你的目标是"这单变成 paid"，已经达成了。**

**返回 500 的话，支付网关会重试。** **重试过来还是 `RACE_LOST`，还是 500，一直重试到网关放弃。**

**而网关放弃的那一刻，它会把这笔记成"回调失败"——** **你的对账表里就多了一条"钱收了但订单没生效"的假异常。**

**这是真实存在的噪音来源：** **每次并发复活，都对账里多一条假的。** **查起来要花半天，最后发现是"代码没错，状态码错了"。**

## 6.4 自检点

**造一个过期订单，然后让它"付了钱"。**

**步骤：**

```text
1. 建一个订单
2. 调 /:id/pay 拿到 payment_no
3. 手动把 expires_at 改成过去：update orders set expires_at = now() - interval '1 hour' where id = '...'
4. 跑 node scripts/expire-orders.js --run  → 变 expired
5. 打开 pay_url 付款 → 网关回调过来
6. 回调会返回 NEEDS_REVIVAL → 走复活
```

**期望：**

```text
[webhook] 处理结果 {"orderNo":"...","outcome":"NEEDS_REVIVAL","status":"expired"}
[webhook] 处理结果 {"orderNo":"...","outcome":"OK","status":"paid"}
订单状态：paid
```

**再测一次重复支付：**

```text
1. 订单 A 过期
2. 客户下了订单 B 并支付成功
3. 现在订单 A 的回调来了
```

**期望：**

```text
[revive] 重复支付： P-xxx 之后已有已支付订单 P-yyy
返回 200 {"code":"SUCCESS","message":"已收到，重复支付将原路退回"}
payment_anomalies 里有一条 DUPLICATE_PAYMENT
订单 A 还是 expired
```

**这一条是这节课最有价值的输出——你抓住了一次真实会发生的重复支付。**

---

# 第 7 步：重放三次（20 分钟）

**最后测一次幂等，这次用网关的真实回调格式。**

## 7.1 重放

**建一个订单，付款，然后重放：**

```text
curl -X POST http://localhost:4000/mock/repay/MOCK<你的支付单号>?times=3
```

**网关会连发 3 次回调。**

**看你的服务日志：**

```text
[webhook] 收到 ...
[webhook] 处理结果 {"outcome":"OK","status":"paid"}
[webhook] 收到 ...
[webhook] 处理结果 {"outcome":"ALREADY_PAID","status":"paid"}
[webhook] 收到 ...
[webhook] 处理结果 {"outcome":"ALREADY_PAID","status":"paid"}
```

**三次都返回 200。**

**检查租户：**

```sql
select plan, plan_expires_at from tenants where id = '<你的租户id>';
```

**`plan_expires_at` 只加了 30 天，不是 90 天。**

**这就是这节课的最终验收。**

## 7.2 如果不幸加了 90 天

**说明 `markPaid` 的 `where` 里没有 `status = 'pending'`。**

**或者你在 `handlePaidNotify` 里，`markPaid` 之前还做了别的副作用（比如直接在回调里加额度）。**

**去查这两处。**

## 7.3 再加一个"重放 20 次"

```text
curl -X POST http://localhost:4000/mock/repay/MOCK<支付单号>?times=20
```

**20 次，租户到期时间还是只加 30 天。**

**这就是幂等的意思：不管来多少次，结果和来一次一样。**

---

# 第 8 步：最终验收

## A. 签名

- [ ] 假签名的回调返回 401
- [ ] 改过 `out_trade_no` 的回调返回 401
- [ ] 签名正确的回调能通过
- [ ] 用的是 `timingSafeEqual`，不是 `===`
- [ ] 签名串的键名排过序

## B. 金额

- [ ] 签名正确但金额是 1 分的回调被拒绝（400）
- [ ] 金额比对用的是库里的 `amount_cents`
- [ ] `paid_cents` 赋的是 `amount_cents`，不是回调里的值

## C. 幂等

- [ ] 重放 3 次，只加 30 天
- [ ] 重放 20 次，只加 30 天
- [ ] 重复回调返回 200（不是 4xx）
- [ ] `markPaid` 的 `where` 里有 `status = 'pending'`

## D. 主动查单

- [ ] `mock/lose-notify` 造出"付了钱但没回调"
- [ ] `query-pending.js` 能把它找出来并改成 paid
- [ ] 查单和回调走同一个 `handlePaidNotify`
- [ ] 查单有 3 天窗口和数量限制

## E. 复活

- [ ] 过期订单能复活成 paid
- [ ] 复活前先问了网关
- [ ] 重复支付被拦住，记进 `payment_anomalies`
- [ ] `RACE_LOST` 返回 200

## F. 返回码

| 情况 | 我返回什么 |
|---|---|
| 验签失败 | |
| 金额不符 | |
| 订单不存在 | |
| 状态异常 | |
| 已支付（重复） | |
| 处理成功 | |
| 服务器内部错误 | |

**最后一条必须是 500——让平台重试。如果是 200，这笔就永远不会再来了。**

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"为什么返回 200 太早很危险"
- [ ] 我记下了"回调 + 查单 + 对账单"三层的关系

## 提交

```text
git add -A
git commit -m "第174节课: mock网关 + 验签 + 金额校验 + 回调幂等 + 主动查单 + 复活流程"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 网关日志 `回调返回 401` | 密钥不一致 | `.env` 里的 `GATEWAY_SECRET` 和网关启动时的要一样 |
| 网关日志 `回调异常 fetch failed` | 你的服务没启动，或者端口不对 | 检查 `GATEWAY_CALLBACK` |
| `AbortSignal.timeout is not a function` | Node 版本低于 17.3 | 升级 Node |
| 回调一直 500 | 你的处理代码抛错 | 看 `[webhook] 处理异常` 日志 |
| 回调 404 | `out_trade_no` 在库里查不到 | 检查订单是否创建成功；检查 `order_no` 字段 |
| 回调 400 `AMOUNT_MISMATCH` | 库里金额和回调金额不一致 | 检查下单时传的 `amount` 是否正确 |
| 订单一直 pending | 回调丢了，或者一直 500 被平台放弃 | 跑 `query-pending.js` |
| 重放两次加了两倍时间 | `markPaid` 的 `where` 缺 `status = 'pending'` | 加上 |
| 重放返回 409 | 你的回调接口返回了非 2xx | 检查 `ALREADY_PAID` 分支 |
| `[revive] 重复支付` 日志出现 | 客户在过期后又付了一次 | 正常拦截，去 `payment_anomalies` 里找记录，人工退款 |
| `RACE_LOST` | 两个查单任务同时处理 | 无害，返回 200 |
| 网关重启后支付单没了 | mock 网关用内存存 | 正常，重启就清空；生产环境网关是持久化的 |
| 主动查单卡住 | 网关没启动 | 它应该有 10 秒超时，会报错跳过 |

---

## 本节课要能说出口的一句话

> **回调不是"通知你一件事"，是"一个不可信的、可能会重复、可能会丢、可能是伪造的"外部输入；验签挡住伪造，金额校验挡住篡改，幂等挡住重复，主动查单兜住丢失——四道里少一道，就会有一次真实的资损。**
