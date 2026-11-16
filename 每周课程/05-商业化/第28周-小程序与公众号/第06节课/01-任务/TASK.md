# 第 195 节课：支付流程认识

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课不接真支付（你没有商户号）。它做一件更重要的事：**把"小程序支付"的完整时序图画出来，并且用 mock 跑通。**
> 画不出来，接真支付时你会卡在"预支付参数怎么用"上，**而且会白试两天。**

**建议用时**：230 分钟（7 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（110 分钟）一次，第 3—6 步（120 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 194 节（订阅消息能发）

---

# 第 0 步：支付有六步，不是三步（30 分钟）

## 0.1 一个常见的误解

**很多人以为支付是这样：**

```text
客户点"支付" → 扣钱 → 完成
```

**实际是这样：**

```text
① 小程序调你的后端"下单"
② 你的后端调微信"统一下单"，拿预支付参数
③ 你的后端把预支付参数签名后返回小程序
④ 小程序调 wx.requestPayment 唤起微信支付
⑤ 客户输密码 / 指纹，微信处理
⑥ 微信回调你的后端（异步，不是 ④ 的返回）
⑦ 你的后端确认，改订单状态
```

**七步。而且第 ⑥ 步和第 ④ 步是**两条独立的路**。**

## 0.2 最容易做错的地方

**`wx.requestPayment` 的 `success` 回调不代表"钱收到了"。**

```js
wx.requestPayment({
  timeStamp: pay.timeStamp,
  nonceStr: pay.nonceStr,
  package: pay.package,
  signType: 'RSA',
  paySign: pay.paySign,

  success() {
    // ❌ 千万不要在这里"给他开通会员"
    // 这只代表"客户走完了支付流程"，不代表"钱到账了"

    // ✅ 只做一件事：刷新订单状态，等后端告诉你
    this.load();
  },

  fail(err) {
    if (err.errMsg && err.errMsg.includes('cancel')) {
      wx.showToast({ title: '已取消支付', icon: 'none' });
      return;
    }
    wx.showToast({ title: '支付未完成', icon: 'none' });
  },
});
```

**`fail` 里的 `cancel` 判断不能省。**

**客户点"取消"也走 `fail`，`errMsg` 是 `requestPayment:fail cancel`。** **不判断的话，客户主动取消会看到"支付未完成"——** **他会以为出错了，然后重试三次。**

**五个参数一个都不能少，名字也不能改。** **`package` 是保留字，所以不能简写成 `pkg`；`signType` 在 V3 里固定写 `'RSA'`（不是 `'MD5'`）。**

**为什么：**

```text
客户点了"确认支付" → 微信开始处理
网络抖动 → 你的 success 回调触发了
但微信那边可能因为余额不足失败
最终结果只有"回调"才知道
```

**正确的做法：**

```text
success 回调 → 只显示"支付处理中"，然后轮询你的后端
真正"已支付" → 只能由回调（或者主动查单）决定
```

**这是第 174 节那条原则的再次应用：外部事件不可信，要自己对账。**

## 0.3 完整的时序图

**你要能默画出来。**

```text
小程序              你的后端              微信支付
  │                    │                    │
  │ ① 下单             │                    │
  │───────────────────→│                    │
  │                    │ ② 统一下单          │
  │                    │───────────────────→│
  │                    │                    │
  │                    │←───────────────────│
  │                    │  prepay_id         │
  │                    │                    │
  │                    │ ②b 二次签名        │
  │                    │  （本地算）         │
  │                    │                    │
  │←───────────────────│                    │
  │  paySign 等五个参数 │                    │
  │                    │                    │
  │ ③ wx.requestPayment│                    │
  │────────────────────────────────────────→│
  │                    │                    │
  │                    │                    │ 客户输密码
  │                    │                    │
  │←────────────────────────────────────────│
  │  success / fail    │                    │
  │                    │                    │
  │ ④ 轮询订单状态      │                    │
  │───────────────────→│                    │
  │                    │                    │
  │                    │ ⑤ 支付回调          │
  │                    │←───────────────────│
  │                    │                    │
  │                    │ ⑤b 验签 + 解密      │
  │                    │     幂等            │
  │                    │     改状态          │
  │                    │                    │
  │                    │───────────────────→│
  │                    │      200 OK        │
  │                    │                    │
  │←───────────────────│                    │
  │  订单已支付         │                    │
```

## 0.4 五个"必须由后端做"的事

**这五件事绝对不能放在小程序端：**

```text
① 计算金额      小程序传什么金额，客户就能改成什么
② 调统一下单    要商户密钥（mch_key），泄露就等于把钱包给了别人
③ 二次签名      要用商户私钥，同上
④ 验签回调      要用 API 密钥，同上
⑤ 判断"已支付"   小程序说的不算
```

**判断标准：**

> **任何用到密钥的操作，都必须在服务端。**

**这一条没有例外。**

---

# 第 1 步：mock 支付网关（40 分钟）

**你没有商户号，所以建一个假的。**

**但它要模拟真实网关的**全部关键行为**，特别是"回调"。**

## 1.1 新建 `scripts/mock-wxpay.js`

```js
const express = require('express');
const crypto = require('crypto');

const PORT = Number(process.env.MOCK_PAY_PORT || 6000);
const MCH_KEY = process.env.MOCK_MCH_KEY || 'mock-mch-key-32-bytes-long-here!!';
const NOTIFY_URL =
  process.env.MOCK_PAY_NOTIFY || 'http://localhost:3000/api/webhooks/wxpay';

const app = express();
app.use(express.json({ limit: '1mb' }));

const orders = new Map();

function nonce() {
  return crypto.randomBytes(16).toString('hex');
}

function sign(params) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== '' && params[k] != null)
    .sort();

  const str =
    keys.map((k) => k + '=' + params[k]).join('&') + '&key=' + MCH_KEY;

  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

app.post('/v3/pay/transactions/jsapi', async (req, res) => {
  const { out_trade_no: outTradeNo, amount, description, openid } = req.body || {};

  if (!outTradeNo || !amount || !openid) {
    return res.status(400).json({ code: 'PARAM_ERROR', message: 'out_trade_no / amount / openid 必填' });
  }

  if (!Number.isInteger(amount.total) || amount.total <= 0) {
    return res.status(400).json({ code: 'PARAM_ERROR', message: 'amount.total 必须是正整数分' });
  }

  const prepayId = 'wx' + Date.now() + crypto.randomBytes(4).toString('hex');

  orders.set(outTradeNo, {
    out_trade_no: outTradeNo,
    prepay_id: prepayId,
    amount: amount.total,
    description: description || '',
    openid,
    status: 'NOTPAY',
    transaction_id: null,
    paid_at: null,
    notified: 0,
  });

  console.log('[wxpay] 统一下单', outTradeNo, '金额', amount.total, '分');

  res.json({ prepay_id: prepayId });
});

app.get('/mock/pay-page/:outTradeNo', (req, res) => {
  const o = orders.get(req.params.outTradeNo);

  if (!o) return res.status(404).send('订单不存在');

  res.type('html').send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>模拟微信支付</title>
<style>
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;max-width:420px;margin:40px auto;padding:0 20px;color:#222}
h1{font-size:18px;color:#07c160}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:14px}
.amt{font-size:30px;font-weight:700;margin:24px 0}
button{width:100%;padding:14px;font-size:16px;border:0;border-radius:6px;background:#07c160;color:#fff;margin-top:12px;cursor:pointer}
button.gray{background:#999}
a{color:#07c160}
</style></head><body>
<h1>模拟微信支付</h1>
<div class="row"><span>商户订单号</span><span>${o.out_trade_no}</span></div>
<div class="row"><span>说明</span><span>${o.description || '-'}</span></div>
<div class="row"><span>openid</span><span>${o.openid.slice(0, 12)}…</span></div>
<div class="amt">¥ ${(o.amount / 100).toFixed(2)}</div>
<form method="post" action="/mock/confirm/${o.out_trade_no}">
  <button type="submit">确认支付</button>
</form>
<form method="post" action="/mock/cancel/${o.out_trade_no}">
  <button type="submit" class="gray">取消</button>
</form>
<p style="margin-top:24px;font-size:13px;color:#666">
  <a href="/mock/orders">看网关里的订单</a>
</p>
</body></html>`);
});

app.post('/mock/confirm/:outTradeNo', async (req, res) => {
  const o = orders.get(req.params.outTradeNo);

  if (!o) return res.status(404).send('订单不存在');
  if (o.status === 'SUCCESS') return res.send('这笔已经支付过了');

  o.status = 'SUCCESS';
  o.transaction_id = '4200' + Date.now() + crypto.randomBytes(4).toString('hex');
  o.paid_at = new Date().toISOString();

  res.type('html').send(
    '<p>支付成功，正在通知商户……</p><p><a href="/mock/orders">看网关状态</a></p>'
  );

  notifyMerchant(o).catch((err) => console.error('[wxpay] 回调失败', err.message));
});

app.post('/mock/cancel/:outTradeNo', (req, res) => {
  const o = orders.get(req.params.outTradeNo);
  if (!o) return res.status(404).send('订单不存在');
  o.status = 'CLOSED';
  res.send('已取消');
});

function buildNotifyBody(o) {
  const resource = {
    out_trade_no: o.out_trade_no,
    transaction_id: o.transaction_id,
    trade_state: o.status,
    success_time: o.paid_at,
    amount: { total: o.amount, payer_total: o.amount, currency: 'CNY' },
    payer: { openid: o.openid },
  };

  return {
    id: 'EV-' + crypto.randomBytes(8).toString('hex'),
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: {
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext: Buffer.from(JSON.stringify(resource), 'utf8').toString('base64'),
      associated_data: 'transaction',
      nonce: nonce().slice(0, 12),
    },
    mock_plain: resource,
  };
}

async function notifyMerchant(o, attempt = 1) {
  const body = buildNotifyBody(o);
  const ts = String(Math.floor(Date.now() / 1000));
  const n = nonce();

  body.signature = sign({
    timestamp: ts,
    nonce: n,
    body_id: body.id,
  });

  console.log(`[wxpay] 第 ${attempt} 次回调 ${NOTIFY_URL}`);

  try {
    const r = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Wechatpay-Timestamp': ts,
        'Wechatpay-Nonce': n,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    const text = await r.text();
    console.log(`[wxpay] 回调返回 ${r.status} ${text.slice(0, 120)}`);

    if (r.status >= 200 && r.status < 300) {
      o.notified += 1;
      return true;
    }
  } catch (err) {
    console.log('[wxpay] 回调异常', err.message);
  }

  return false;
}

app.post('/mock/replay/:outTradeNo', async (req, res) => {
  const o = orders.get(req.params.outTradeNo);
  if (!o) return res.status(404).json({ error: '不存在' });

  const times = Number(req.query.times || 3);
  const results = [];

  for (let i = 0; i < times; i++) {
    results.push(await notifyMerchant(o, i + 1));
  }

  res.json({ out_trade_no: o.out_trade_no, attempts: times, results });
});

app.post('/mock/lose-notify/:outTradeNo', (req, res) => {
  const o = orders.get(req.params.outTradeNo);
  if (!o) return res.status(404).json({ error: '不存在' });

  o.status = 'SUCCESS';
  o.transaction_id = '4200' + Date.now();
  o.paid_at = new Date().toISOString();

  console.log('[wxpay] 支付成功，但故意不回调（模拟回调丢失）');
  res.json({ ok: true, note: '已标记成功，但没有通知商户' });
});

app.get('/v3/pay/transactions/out-trade-no/:outTradeNo', (req, res) => {
  const o = orders.get(req.params.outTradeNo);

  if (!o) {
    return res.status(404).json({ code: 'ORDER_NOT_EXIST', message: '订单不存在' });
  }

  res.json({
    out_trade_no: o.out_trade_no,
    transaction_id: o.transaction_id,
    trade_state: o.status,
    amount: { total: o.amount },
    success_time: o.paid_at,
    payer: { openid: o.openid },
  });
});

app.get('/mock/orders', (req, res) => {
  const rows = [...orders.values()].reverse().slice(0, 30);

  res.type('html').send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>网关订单</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:1000px;margin:40px auto;padding:0 20px;font-size:13px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
th{background:#f5f5f5}
tr:hover{background:#fafafa}
</style></head><body>
<h2>网关里的支付单</h2>
<table>
<tr><th>商户订单号</th><th>金额（分）</th><th>状态</th><th>回调次数</th><th>操作</th></tr>
${rows
  .map(
    (o) => `<tr>
  <td>${o.out_trade_no}</td>
  <td>${o.amount}</td>
  <td>${o.status}</td>
  <td>${o.notified}</td>
  <td><a href="/mock/pay-page/${o.out_trade_no}">打开</a></td>
</tr>`
  )
  .join('')}
</table>
</body></html>`);
});

app.listen(PORT, () => {
  console.log('mock 微信支付网关已启动 http://localhost:' + PORT);
  console.log('  回调地址  ', NOTIFY_URL);
  console.log('  商户密钥  ', MCH_KEY.slice(0, 8) + '…');
  console.log('  支付页    GET /mock/pay-page/:outTradeNo');
  console.log('  重放回调  POST /mock/replay/:outTradeNo?times=3');
  console.log('  丢失回调  POST /mock/lose-notify/:outTradeNo');
});
```

## 1.2 四个设计点

### `mock_plain` 字段

**真实微信的回调里，`resource.ciphertext` 是**真的加密的**（AEAD_AES_256_GCM）。**

**解密它需要 APIv3 密钥。**

**你没有，所以 mock 里多给了一个 `mock_plain`——** **明文放在这里，方便你验证逻辑。**

**真实环境要删掉这个字段（微信不会给你）。**

**这一节先读 `mock_plain`，第 2.3 节会讲真实怎么解密。**

### 签名只有三个字段

```js
body.signature = sign({ timestamp: ts, nonce: n, body_id: body.id });
```

**真实微信 v3 的签名是：**

```text
签名串 = HTTP方法 + "\n" + URL路径 + "\n" + 时间戳 + "\n" + 随机串 + "\n" + 请求体 + "\n"
用商户私钥（RSA-SHA256）签名
```

**这里用 `md5 + 密钥`简化了，但**结构一样**：**

```text
① 拼一个确定的字符串
② 用密钥签
③ 服务端用同样的方式验
```

**关键不是"用哪个算法"，是"服务端能不能复现出同样的串"。**

### `/mock/replay` 和 `/mock/lose-notify`

**这两个是这节课最值钱的工具。**

```text
replay       → 造"回调来了三次"
lose-notify  → 造"钱付了但回调丢了"
```

**真实环境下你没法让微信重发三次，也没法让回调丢失。**

**这两个接口让你能主动测试。**

### 查单接口

```text
GET /v3/pay/transactions/out-trade-no/:outTradeNo
```

**这是"主动查单"的入口。**

**回调丢了的时候，你靠它确认"钱到底到账了没有"。**

**第 174 节（支付回调）用的是假网关的 `/pay/query`，** **这一节是微信风格的路径。**

---

# 第 2 步：后端下单接口（40 分钟）

## 2.1 建表

**新建 `migrations/024_wxpay.sql`：**

```sql
alter table orders
  add column if not exists wx_prepay_id text,
  add column if not exists wx_transaction_id text,
  add column if not exists wx_openid text;

create unique index if not exists orders_wx_txn_idx
  on orders (tenant_id, wx_transaction_id)
  where wx_transaction_id is not null;

create table if not exists wxpay_notify_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references tenants(id) on delete cascade,
  notify_id      text not null,
  out_trade_no   text,
  trade_state    text,
  amount_cents   integer,
  raw            jsonb not null,
  handled        boolean not null default false,
  handled_at     timestamptz,
  created_at     timestamptz not null default now()
);

create unique index if not exists wxpay_notify_events_dedup_idx
  on wxpay_notify_events (notify_id);

alter table wxpay_notify_events enable row level security;
alter table wxpay_notify_events force row level security;

-- 这条策略只对 app_user（受 RLS 约束的那条连接）生效。
-- 允许 tenant_id is null 的历史记录存在，但不允许 app_user 读到它们。
create policy tenant_isolation on wxpay_notify_events
  for all
  to app_user
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

**三个点：**

```text
① wx_transaction_id 加唯一索引 → 同一个微信流水号不能绑两个订单
② notify_events 用 notify_id 去重 → 回调重放不会重复处理
③ notify_events 的 tenant_id 可空 → 因为验签之前不知道是哪个租户
```

**第 ③ 条和第 178 节的 `platform_events` 是同一个模式。**

**但注意策略里我删掉了原来的 `tenant_id is null or ...`。**

**原来那版是这样写的（很多教程也这么写）：**

```sql
using (
  tenant_id is null                          -- ← 这一句是真漏洞
  or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
)
```

**问题：** **`tenant_id is null` 这个分支对所有连接都成立。**

**后果：** **任何一个租户的正常请求（用 `app_user` 连），只要查 `wxpay_notify_events`，就能读到全库所有 `tenant_id` 为空的回调原文——里面包含其他客户的订单号、金额、微信流水号。**

**这不是理论风险。** **你在第 195 节的自检里会写"回调事件表"的查询接口，一查就是全量泄露。**

**那为什么原来要写 `is null`：** **因为回调刚插进来的时候确实还没有 `tenant_id`（验签之前不知道是哪个租户）。** **写 `is null` 是为了让那条 `insert` 能过 `with check`。**

**正确解法是 `to app_user` 那两行。**

**`to app_user` 的意思是"这条策略只约束 app_user"。** **而插入回调那条 SQL 走的是 `systemPool`（`app_system`，带 `bypassrls`）——它本来就不受任何策略约束。**

**所以：**

```text
app_system 插 tenant_id 为空的记录  → 不受策略约束，能过
app_user 想把 tenant_id 读成 null   → 策略不通过，读到 0 行
```

**两边都对了。**

**这个 `to <role>` 的写法，是"策略要有意漏一个口子"时的标准手法。** **它比在 `using` 里写 `or` 安全得多——因为 `or` 是"对所有人生效的例外"，而 `to` 是"只对某个角色不设限"。**

**第 178 节的 `platform_events` 已经在那一节改成了同样的 `to app_user` 写法——** **如果你当时按老版本敲的，回去一起改掉。** **两张"收件箱表"必须是同一个模式，否则你会记住一套、写错另一套。**

## 2.2 下单接口

**新建 `src/wechat/pay.js`：**

```js
const BASE = process.env.WXPAY_BASE || 'http://localhost:6000';
const MOCK = process.env.WXPAY_MOCK === '1';
const MCH_KEY = process.env.WXPAY_MCH_KEY || 'mock-mch-key-32-bytes-long-here!!';

function md5Sign(params, key) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== '' && params[k] != null)
    .sort();

  const str = keys.map((k) => k + '=' + params[k]).join('&') + '&key=' + key;

  return require('crypto').createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

async function createPrepay({ outTradeNo, amountCents, description, openid }) {
  if (MOCK) {
    const res = await fetch(BASE + '/v3/pay/transactions/jsapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        out_trade_no: outTradeNo,
        amount: { total: amountCents, currency: 'CNY' },
        description,
        openid,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error('统一下单失败 HTTP ' + res.status + ' ' + text.slice(0, 200));
    }

    const data = await res.json();

    return { prepayId: data.prepay_id, mock: true };
  }

  throw new Error('真实微信支付未配置：需要商户号、证书、APIv3 密钥');
}

function buildPayParams(prepayId) {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = require('crypto').randomBytes(16).toString('hex');
  const pkg = 'prepay_id=' + prepayId;

  const paySign = md5Sign(
    {
      appId: process.env.WECHAT_APP_ID || 'mock_app',
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'MD5',
    },
    MCH_KEY
  );

  return {
    timeStamp,
    nonceStr,
    package: pkg,
    signType: 'MD5',
    paySign,
  };
}

async function queryOrder(outTradeNo) {
  const res = await fetch(
    BASE + '/v3/pay/transactions/out-trade-no/' + encodeURIComponent(outTradeNo),
    { signal: AbortSignal.timeout(10000) }
  );

  if (res.status === 404) {
    return { exists: false, tradeState: 'NOT_EXIST' };
  }

  if (!res.ok) {
    throw new Error('查单失败 HTTP ' + res.status);
  }

  const data = await res.json();

  return {
    exists: true,
    tradeState: data.trade_state,
    transactionId: data.transaction_id,
    amountCents: data.amount && data.amount.total,
    successTime: data.success_time,
    openid: data.payer && data.payer.openid,
  };
}

module.exports = { createPrepay, buildPayParams, queryOrder, md5Sign };
```

## 2.3 三个关键点

### 预支付参数要"二次签名"

**看 `buildPayParams`：**

```js
paySign = md5Sign({ appId, timeStamp, nonceStr, package: 'prepay_id=xxx', signType }, MCH_KEY);
```

**微信要求小程序端拿到的是"签过名"的参数。**

**为什么：**

**防止小程序端篡改 `package`（改成别人的 `prepay_id`）。**

**这个签名必须用商户密钥——** **所以只能服务端算。**

### `MPL` 注意：真实环境的签名不一样

**真实的微信 v3 用的是 `RSASSA-PKCS1-v1_5`（RSA 私钥签名），不是 MD5。**

**而且参数名是 `appId` / `timeStamp` / `nonceStr` / `package` / `signType` / `paySign`。**

**这里的 MD5 是 v2 的算法，简化了。**

**结构一样，你换成真环境时：**

```text
① 把 md5Sign 换成 RSA 签名
② 密钥从 "字符串" 换成 "apiclient_key.pem 文件"
③ 回调验签从 MD5 换成 "用微信平台证书验 RSA 签名"
```

**这三处换掉，其他代码一行不用改。**

### `signType: 'MD5'`

**注意 `paySign` 的签名串里包含了 `signType`。**

**两边必须一致。**

**如果服务端按 MD5 签，小程序端要用 `signType: 'MD5'`（或者不传，默认 MD5）。**

**不一致会报：**

```text
requestPayment:fail 签名错误
```

---

# 第 3 步：回调（45 分钟）

**这是整个支付里最核心的部分。**

## 3.1 新建 `src/routes/wxpay.js`

```js
const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { withTenantFromPool } = require('../db/tenant-db');
const { md5Sign } = require('../wechat/pay');

const router = express.Router();

const MCH_KEY = process.env.WXPAY_MCH_KEY || 'mock-mch-key-32-bytes-long-here!!';

function verifyNotify(body) {
  const { signature, timestamp, nonce, id } = body;

  if (!signature) return { ok: false, reason: 'NO_SIGNATURE' };

  const expected = md5Sign({ timestamp, nonce, body_id: id }, MCH_KEY);

  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);

  if (a.length !== b.length) return { ok: false, reason: 'BAD_LENGTH' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'MISMATCH' };

  return { ok: true };
}

function extractResource(body) {
  if (body.mock_plain) return body.mock_plain;

  const { resource } = body;
  if (!resource || !resource.ciphertext) return null;

  return null;
}

router.post('/wxpay', async (req, res) => {
  const body = req.body || {};

  console.log('[wxpay-notify] 收到', body.id, body.event_type);

  const verified = verifyNotify(body);

  if (!verified.ok) {
    console.warn('[wxpay-notify] 验签失败', verified.reason);
    return res.status(401).json({ code: 'FAIL', message: '签名错误' });
  }

  const plain = extractResource(body);

  if (!plain) {
    console.warn('[wxpay-notify] 无法解密 resource');
    return res.status(200).json({ code: 'SUCCESS', message: '已接收（无法解密，待人工核对）' });
  }

  const outTradeNo = String(plain.out_trade_no || '');
  const transactionId = String(plain.transaction_id || '');
  const tradeState = String(plain.trade_state || '');
  const totalCents = Number(plain.amount && plain.amount.total);

  if (!outTradeNo || !transactionId) {
    console.warn('[wxpay-notify] 字段缺失', plain);
    return res.status(400).json({ code: 'FAIL', message: '字段缺失' });
  }

  const inserted = await pool.query(
    `insert into wxpay_notify_events
       (notify_id, out_trade_no, trade_state, amount_cents, raw)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (notify_id) do nothing
     returning id`,
    [body.id, outTradeNo, tradeState, totalCents, JSON.stringify(body)]
  );

  if (inserted.rowCount === 0) {
    console.log('[wxpay-notify] 重复回调，直接返回成功', body.id);
    return res.status(200).json({ code: 'SUCCESS', message: '已处理' });
  }

  try {
    const found = await pool.query(
      'select tenant_id from orders where order_no = $1 limit 1',
      [outTradeNo]
    );

    if (found.rowCount === 0) {
      console.error('[wxpay-notify] 找不到订单', outTradeNo);
      return res.status(200).json({ code: 'SUCCESS', message: '已接收（订单不存在）' });
    }

    const tenantId = found.rows[0].tenant_id;

    await withTenantFromPool(tenantId, async (db) => {
      const { rows } = await db.client.query(
        `select id, order_no, status, amount_cents, wx_transaction_id
         from orders where tenant_id = $1 and order_no = $2`,
        [tenantId, outTradeNo]
      );

      const order = rows[0];

      if (!order) return;

      if (order.amount_cents !== totalCents) {
        console.error(
          '[wxpay-notify] 金额不一致',
          'order_no=' + outTradeNo,
          '库里=' + order.amount_cents,
          '微信=' + totalCents
        );
        throw Object.assign(new Error('AMOUNT_MISMATCH'), { kind: 'AMOUNT_MISMATCH' });
      }

      if (order.wx_transaction_id && order.wx_transaction_id !== transactionId) {
        console.error('[wxpay-notify] 订单已绑定了另一个微信流水号', outTradeNo);
        throw Object.assign(new Error('TXN_CONFLICT'), { kind: 'TXN_CONFLICT' });
      }

      if (tradeState !== 'SUCCESS') {
        await db.client.query(
          `update orders set wx_transaction_id = coalesce(wx_transaction_id, $1)
           where tenant_id = $2 and id = $3`,
          [transactionId, tenantId, order.id]
        );
        return;
      }

      const updated = await db.client.query(
        `update orders
         set status = 'paid',
             paid_cents = amount_cents,
             paid_at = now(),
             wx_prepay_id = coalesce(wx_prepay_id, $1),
             wx_transaction_id = $2,
             wx_openid = coalesce(wx_openid, $3)
         where tenant_id = $4 and id = $5
           and status in ('pending', 'expired')
         returning id, order_no, amount_cents`,
        [body.id, transactionId, plain.payer && plain.payer.openid, tenantId, order.id]
      );

      if (updated.rowCount === 0) {
        console.log('[wxpay-notify] 状态不需要变更（可能已支付）', outTradeNo);
        return;
      }

      await db.client.query(
        `update tenants
         set plan = 'pro',
             plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + interval '30 days'
         where id = $1`,
        [tenantId]
      );
    });

    await pool.query(
      'update wxpay_notify_events set tenant_id = $1, handled = true, handled_at = now() where id = $2',
      [tenantId, inserted.rows[0].id]
    );

    console.log('[wxpay-notify] 处理完成', outTradeNo);
    return res.status(200).json({ code: 'SUCCESS', message: '成功' });
  } catch (err) {
    console.error('[wxpay-notify] 处理异常', err.kind || err.message);

    await pool.query(
      `update wxpay_notify_events set raw = raw || $1::jsonb where id = $2`,
      [JSON.stringify({ _error: err.message, _kind: err.kind || null }), inserted.rows[0].id]
    );

    if (err.kind === 'AMOUNT_MISMATCH' || err.kind === 'TXN_CONFLICT') {
      return res.status(200).json({ code: 'SUCCESS', message: '已接收，需人工核对' });
    }

    return res.status(500).json({ code: 'FAIL', message: '处理失败' });
  }
});

module.exports = router;
```

**在 `server.js` 挂上：**

```js
const wxpayRoutes = require('./src/routes/wxpay');
app.use('/api/webhooks', wxpayRoutes);
```

**注意：这个路由**不能**加 `auth` 中间件（微信不带你的 token）。**

## 3.2 六处关键

### 第一步：验签

```js
const verified = verifyNotify(body);
if (!verified.ok) return res.status(401).json({ code: 'FAIL' });
```

**没有这一句，任何人 POST 一条就能让你"给会员"。**

**第 174 节讲过这个，这里再确认一次。**

### 第二步：落库去重

```js
on conflict (notify_id) do nothing
if (inserted.rowCount === 0) return res.status(200).json({ code: 'SUCCESS' });
```

**这是"幂等"的第一层。**

**微信的重试策略和飞书一样：不返回 200 就一直重发。**

**所以"重复回调"必须返回 200，而且不能重复处理。**

### 第三步：金额校验

```js
if (order.amount_cents !== totalCents) throw ...
```

**用**数据库里的金额**比，不是用请求里的。**

**这一步挡住"改了金额的回调"。**

**虽然签名会失效（因为金额在签名范围内），但**双保险值得**。**

### 第四步：`and status in ('pending', 'expired')`

```sql
where tenant_id = $4 and id = $5 and status in ('pending', 'expired')
```

**`pending` 是正常路径。**

**`expired` 是"过期了但客户付了钱"——** **第 174 节的"复活"逻辑。**

**这里简化成"直接改 paid"。** **生产环境应该加"查有没有后续订单"（防重复支付）。**

**注意没有 `'paid'`。**

**已经在 `paid` 状态的订单，这次 UPDATE 会 `rowCount = 0`，** **然后走"不需要变更"分支——** **这就是重复回调的幂等保证。**

### 第五步：错误分类

```js
if (err.kind === 'AMOUNT_MISMATCH' || err.kind === 'TXN_CONFLICT') {
  return res.status(200).json({ code: 'SUCCESS', message: '已接收，需人工核对' });
}
return res.status(500).json({ code: 'FAIL' });
```

**为什么要分：**

```text
金额不一致 / 流水号冲突 → 这不是"临时失败"，重试一万次也一样
                        → 返回 200（让微信别再推），人工处理
数据库挂了 / 网络问题   → 临时失败
                        → 返回 500（让微信重试）
```

**返回 500 会让微信重试 8 次。** **这 8 次是你的"自动恢复"机会。**

### 第六步：找不到订单也返回 200

```js
if (found.rowCount === 0) {
  return res.status(200).json({ code: 'SUCCESS', message: '已接收（订单不存在）' });
}
```

**为什么：**

**如果返回 404，微信会一直重试。** **而"订单不存在"这个事实不会因为重试而改变。**

**返回 200 让它结束，你从 `wxpay_notify_events` 里能查到这笔"孤儿支付"，然后人工处理。**

**这个"收到但处理不了"的记录，比"一直重试"有用得多。**

---

# 第 4 步：小程序端（25 分钟）

**`pages/order-detail/index.js` 里加支付：**

```js
async onPay() {
  if (this.data.paying) return;
  this.setData({ paying: true });

  try {
    const params = await request({
      path: '/api/orders/' + encodeURIComponent(this.data.id) + '/wxpay',
      method: 'POST',
      data: {},
    });

    await new Promise((resolve, reject) => {
      wx.requestPayment({
        timeStamp: params.timeStamp,
        nonceStr: params.nonceStr,
        package: params.package,
        signType: params.signType,
        paySign: params.paySign,
        success: resolve,
        fail: reject,
      });
    });

    wx.showToast({ title: '支付结果确认中…', icon: 'none' });

    this.pollStatus(0);
  } catch (err) {
    const msg = err.errMsg || err.message || '';

    if (msg.includes('cancel')) {
      wx.showToast({ title: '已取消支付', icon: 'none' });
    } else if (msg.includes('sign')) {
      wx.showToast({ title: '签名错误，请联系管理员', icon: 'none' });
    } else {
      wx.showToast({ title: '支付失败', icon: 'none' });
    }

    this.setData({ paying: false });
  }
},

async pollStatus(attempt) {
  if (attempt >= 8) {
    wx.showToast({ title: '支付结果还没确认，稍后刷新看看', icon: 'none' });
    this.setData({ paying: false });
    return;
  }

  await new Promise((r) => setTimeout(r, 1500));

  try {
    const o = await request({ path: '/api/orders/' + encodeURIComponent(this.data.id) });

    if (o.status === 'paid') {
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.setData({ paying: false });
      this.load();
      return;
    }

    this.pollStatus(attempt + 1);
  } catch (err) {
    this.pollStatus(attempt + 1);
  }
},
```

## 4.1 三个关键点

### `success` 只是"流程走完"

```js
success: resolve,      // 然后轮询，不直接开通
```

**看 `pollStatus`。**

**为什么不直接用 `success`：**

**`success` 只代表"客户完成了支付动作"。** **钱到账没有，只有回调知道。**

**而且回调可能比 `success` **晚几秒**。**

**所以轮询是必须的。**

### 轮询 8 次，间隔 1.5 秒

```js
if (attempt >= 8) { ... return; }
await sleep(1500);
```

**8 × 1.5 = 12 秒。**

**为什么是 12 秒：**

```text
正常：回调 1—2 秒到
慢：5—8 秒
超过 12 秒还没到 → 大概率是回调丢了，让客户"稍后刷新"
```

**不要无限轮询。** **客户盯着转圈超过 10 秒会焦虑。**

### 取消支付也是"正常"的

```js
if (msg.includes('cancel')) {
  wx.showToast({ title: '已取消支付', icon: 'none' });
}
```

**客户点"取消"不是错误，不需要红色警告。**

**`requestPayment` 的 `fail` 里 `errMsg` 是 `requestPayment:fail cancel`。**

**判断要用 `includes('cancel')`，不是 `===`。** **因为不同版本可能带前缀。**

---

# 第 5 步：故意做错四次（30 分钟）

## 5.1 错误一：不验签

**把 `verifyNotify` 的调用删掉。**

**然后伪造一个回调：**

```text
curl -X POST http://localhost:3000/api/webhooks/wxpay -H "Content-Type: application/json" -d "{\"id\":\"FAKE001\",\"mock_plain\":{\"out_trade_no\":\"<你的待支付订单号>\",\"transaction_id\":\"FAKE_TXN\",\"trade_state\":\"SUCCESS\",\"amount\":{\"total\":19900}}}"
```

**期望（如果验签生效）：** `401 签名错误`

**实际（删掉验签后）：** **订单变成 `paid` 了。**

**你一分钱没收到。**

**加回来。**

**这就是"任何人知道你的回调 URL 就能白拿会员"。**

## 5.2 错误二：不在 `where` 里判断状态

**把 `and status in ('pending', 'expired')` 删掉。**

**然后跑 `/mock/replay/<订单号>?times=3`。**

**观察客户的 `plan_expires_at`。**

**如果加了 90 天而不是 30 天，说明漏了这道门。**

**加回来。**

## 5.3 错误三：用请求里的金额

**把 `paid_cents = amount_cents` 改成 `paid_cents = $amountFromNotify`。**

**然后造一个"金额只有 1 分"的回调（签名算对）：**

**改 mock 网关的 `buildNotifyBody`：**

```js
amount: { total: 1, ... }
```

**重启网关，付一笔，观察。**

**如果订单的 `paid_cents` 变成 1，你的账就错了。**

**`amount_cents` 是"这个订单该付多少"，`paid_cents` 是"实际付了多少"。**

**故意让它们不等，是为了以后能查"少付/多付"。**

**但"改状态"必须用 `amount_cents` 判断，不能用 `paid_cents`。**

**改回来。**

## 5.4 错误四：找不到订单返回 404

**把 `订单不存在` 那个分支改成 `return res.status(404)`。**

**然后伪造一笔不存在的订单号（签名要对）。**

**观察网关日志：**

```text
[wxpay] 回调返回 404
（然后会重试）
```

**微信会重试 8 次，每次都 404。**

**你的日志被刷满，而且这笔"孤儿支付"永远不会被记录。**

**改成 200 + 记库。**

## 5.5 自检点

**四个都改回来之后：**

```text
① 假回调被 401 拒绝
② 重放 3 次只加 30 天
③ 金额不匹配会 `console.error`
④ 孤儿支付会进 `wxpay_notify_events`
```

---

# 第 6 步：主动查单（20 分钟）

**回调会丢，这是必然的。**

## 6.1 写一个查单脚本

**新建 `scripts/query-wxpay.js`：**

```js
const pool = require('../src/db/pool');
const { queryOrder } = require('../src/wechat/pay');
const { withTenantFromPool } = require('../src/db/tenant-db');

(async () => {
  const { rows } = await pool.query(`
    select tenant_id, id, order_no, amount_cents, status, created_at
    from orders
    where status = 'pending'
      and created_at > now() - interval '3 days'
      and order_no is not null
    order by created_at desc
    limit 50
  `);

  console.log('待支付订单：', rows.length, '条');

  for (const o of rows) {
    try {
      const q = await queryOrder(o.order_no);

      if (q.tradeState === 'SUCCESS') {
        console.log('发现已支付但未确认：', o.order_no);

        if (q.amountCents !== o.amount_cents) {
          console.error('  金额不一致，跳过。库里', o.amount_cents, '微信', q.amountCents);
          continue;
        }

        await withTenantFromPool(o.tenant_id, async (db) => {
          const r = await db.client.query(
            `update orders
             set status = 'paid', paid_cents = amount_cents, paid_at = now(),
                 wx_transaction_id = $1, wx_openid = coalesce(wx_openid, $2)
             where tenant_id = $3 and id = $4 and status = 'pending'
             returning id`,
            [q.transactionId, q.openid, o.tenant_id, o.id]
          );

          if (r.rowCount > 0) {
            await db.client.query(
              `update tenants
               set plan = 'pro',
                   plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + interval '30 days'
               where id = $1`,
              [o.tenant_id]
            );
          }
        });

        console.log('  已修正');
      } else if (q.tradeState === 'NOT_EXIST') {
        console.log(o.order_no, '网关里没有这笔');
      } else {
        console.log(o.order_no, '状态：', q.tradeState);
      }
    } catch (err) {
      console.error(o.order_no, '查单失败：', err.message);
    }
  }

  await pool.end();
})();
```

## 6.2 自检点

**用 mock 网关造一次"回调丢失"：**

```text
curl -X POST http://localhost:6000/mock/lose-notify/<订单号>
```

**订单在网关是 `SUCCESS`，在你的库里还是 `pending`。**

**跑查单脚本：**

```text
node scripts/query-wxpay.js
```

**期望：**

```text
发现已支付但未确认： P2601A
  已修正
```

**这就是"回调 + 查单"的双保险。**

**和第 174 节的结构完全一样——** **因为它就是同一个问题的两个变种。**

---

# 第 7 步：最终验收

## A. mock 网关

- [ ] `mock-wxpay.js` 能启动
- [ ] 统一下单能返回 `prepay_id`
- [ ] 支付页能打开
- [ ] `/mock/replay` 能重放
- [ ] `/mock/lose-notify` 能造丢失

## B. 下单

- [ ] 后端调统一下单，拿 `prepay_id`
- [ ] 二次签名（`buildPayParams`）
- [ ] 返回五个参数（`timeStamp` / `nonceStr` / `package` / `signType` / `paySign`）

## C. 回调

- [ ] 先验签，失败返回 401
- [ ] 落库去重（`notify_id` 唯一）
- [ ] 金额用库里的比
- [ ] `where` 里有 `status in ('pending','expired')`
- [ ] 重复回调返回 200
- [ ] 孤儿支付返回 200 并记库
- [ ] 永久错误返回 200，临时错误返回 500

## D. 小程序

- [ ] `wx.requestPayment` 传五个参数
- [ ] `success` 后轮询，不直接开通
- [ ] 轮询 8 次 × 1.5 秒
- [ ] 取消支付有友好提示

## E. 查单

- [ ] `query-wxpay.js` 能救回丢失的回调
- [ ] 金额不一致会跳过并告警

## F. 四个错误

- [ ] 删验签后伪造回调能白拿会员
- [ ] 删状态判断后重放会重复加时间
- [ ] 用请求金额会导致账错
- [ ] 孤儿支付返回 404 会被重试 8 次

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我能默画七步时序图
- [ ] 我记下了"`success` 不代表到账"

## 提交

```text
git add -A
git commit -m "第195节课: mock 微信支付 + 二次签名 + 回调验签幂等 + 主动查单"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `requestPayment:fail 签名错误` | `paySign` 算法或字段不对 | 检查签名串的顺序和 `signType` |
| `requestPayment:fail` 其他 | `package` 里的 `prepay_id` 无效 | 检查下单是否成功 |
| 支付成功但订单还是 `pending` | 回调没到，或者处理失败 | 跑 `query-wxpay.js` |
| 重放导致加了两次时间 | `where` 里没有状态判断 | 加 `status in (...)` |
| 任何人 POST 就能改状态 | 没验签 | 加 `verifyNotify` |
| 回调一直 500 被重试 | 处理逻辑抛错 | 看日志；永久错误返回 200 |
| 找不到订单一直重试 | 返回了 404 | 改成 200 + 记库 |
| `wx_transaction_id` 冲突 | 一个订单绑了两个流水号 | 这是异常，人工处理 |
| 金额和订单不一致 | 有人改了回调金额 | 用库里的 `amount_cents` 比 |
| 真环境签名一直错 | 用的是 MD5，真环境要 RSA | 换签名算法和密钥文件 |

---

## 本节课要能说出口的一句话

> **`wx.requestPayment` 的 success 只代表"客户走完了支付动作"，钱到账没有只有回调（和查单）知道；所以支付成功必须是"后端收到带签名的回调"这件事，而不是"前端看到了 success"。**
