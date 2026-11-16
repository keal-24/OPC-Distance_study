# 第 173 节课：一笔订单只能有一次

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 客户点了两次"立即支付"，你的系统生成了两个订单。**客户只付了一次钱，但你的系统认为他欠一笔。**
> 这一节课做订单状态机 + 幂等 + 并发，**把"重复"这件事在数据层面堵死。**

**建议用时**：130 分钟
**你需要先完成**：第 172 节课（`money.test.js` 全绿，`orders` 表有金额约束）

---

# 第 0 步：四种"重复"，一种比一种难查（15 分钟）

## 0.1 客户手抖点两次

```text
10:00:01  客户点"立即支付"  → 生成订单 #1
10:00:01  网络慢，没反应，客户又点  → 生成订单 #2
```

**两笔订单，客户只付了一笔。** 另一笔永远挂着"待支付"。

**客户会打电话问"我是不是要付两次"。**

**解法：前端按钮置灰 + 后端幂等键。**

## 0.2 支付平台回调两次

```text
平台第一次回调 → 你把订单改成"已支付"，给客户加了额度
平台第二次回调（它没收到你的 200）→ 你又加了一次
```

**客户付 199，得到 398 的额度。**

**解法：状态机 + 事件表。**

## 0.3 两个请求同时到

```text
请求 A：查订单状态 = 待支付 → 改成已支付
请求 B：查订单状态 = 待支付 → 改成已支付
```

**两个都成功了。**

**两个都去加额度，加了两次。**

**解法：用一条 SQL 做"检查 + 更新"。**

## 0.4 你重跑了一次脚本

**排查线上问题时，你跑了一次"补数据"的脚本。跑了两遍。**

**两百个客户各多了一个月会员。**

**解法：同一套幂等键，脚本也要用。**

## 0.5 这节课要建立的四层

```text
① 状态机     —— 哪些转移是合法的，其他全部拒绝
② 幂等键     —— 同一个键只能成功一次
③ 原子更新   —— 检查状态和更新状态在同一条 SQL 里
④ 事件表     —— 每一次真实发生的支付动作都留一条记录
```

**四层都要有。少一层，上面四种场景里就有一种能穿透。**

---

# 第 1 步：先定状态机（25 分钟）

## 1.1 状态清单

**不要凭感觉列。照着你真实的业务流程走一遍：**

```text
客户下单              → pending     待支付
客户付款，平台确认    → paid        已支付
客户申请退款          → refunding   退款中
平台确认退款完成      → refunded    已退款
超过支付时限          → expired     已过期
客户主动取消          → canceled    已取消
```

**六个状态。不多不少。**

**不要加这些：**

```text
❌ created       和 pending 有什么区别？没有。合并
❌ paying        客户点"去支付"到"平台确认"之间，你不需要知道
❌ partial_paid  部分支付，这个业务不存在（要么付全款要么不付）
❌ failed        支付失败 = 还是 pending，客户可以重试
```

**每一步都问："这个状态有对应的业务动作吗？"** 没有动作的状态是多余的。

## 1.2 转移表

| 从 | 到 | 谁触发 | 允许吗 |
|---|---|---|---|
| `pending` | `paid` | 回调 / 主动查单 | ✅ |
| `pending` | `expired` | 定时任务 | ✅ |
| `pending` | `canceled` | 客户 | ✅ |
| `paid` | `refunding` | 客户申请退款 | ✅ |
| `refunding` | `refunded` | 回调 / 主动查单 | ✅ |
| `refunding` | `paid` | 平台拒退 | ✅ |
| `paid` | `paid` | 重复回调 | ✅ **但要幂等** |
| `refunded` | 任何 | — | ❌ 终态 |
| `expired` | `paid` | 迟到的回调 | ⚠️ **要特别处理** |
| `canceled` | `paid` | 迟到的回调 | ⚠️ **要特别处理** |

## 1.3 那两个 ⚠️ 是真实会发生的事

**场景：**

```text
10:00  客户下单，系统给 15 分钟支付时限
10:14  客户付款，但平台回调因为网络问题没到
10:16  定时任务把订单标成 expired
10:20  平台回调终于到了："已支付"
```

**现在订单是 expired，但客户真的付了钱。**

**错误处理一：** 直接忽略（因为 expired 是终态）→ **客户付了钱但订单没生效，会投诉。**

**错误处理二：** 无条件改成 paid → 但可能客户已经重新下单并付了第二笔，你会给他激活两个订单。

**正确的处理：**

```text
expired → paid 是允许的，但必须：
  ① 先主动查单确认平台那边真的是"已支付"
  ② 查这个客户在过期之后有没有再下新单并支付
  ③ 如果都正常，改成 paid，并给客户发一条通知"你的订单已激活"
```

**这节课先实现状态机本身，第 174 节实现"主动查单"。**

**但状态机里要留出这个转移，** 不能把 `expired` 设成真终态。

## 1.4 写 `src/orders/state.js`

```js
const STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDING: 'refunding',
  REFUNDED: 'refunded',
  EXPIRED: 'expired',
  CANCELED: 'canceled',
};

const ALLOWED = {
  pending: ['paid', 'expired', 'canceled'],
  paid: ['refunding'],
  refunding: ['refunded', 'paid'],
  refunded: [],
  expired: ['paid'],
  canceled: ['paid'],
};

const TERMINAL = ['refunded'];

function canTransition(from, to) {
  if (from === to) return true;
  const list = ALLOWED[from];
  if (!list) return false;
  return list.includes(to);
}

function isTerminal(status) {
  return TERMINAL.includes(status);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(
      `非法状态转移：${from} → ${to}`
    );
    err.code = 'ILLEGAL_TRANSITION';
    err.from = from;
    err.to = to;
    throw err;
  }
}

module.exports = { STATUS, ALLOWED, canTransition, isTerminal, assertTransition };
```

## 1.5 三个设计点

### 为什么 `if (from === to) return true`

**因为重复回调会说"改成 paid"，而现在已经是 paid。**

**这不是非法转移，是"什么都没变"。**

**但"允许"不等于"要执行副作用"。** 状态机只判断状态合法性，**幂等要靠下一层。**

**这个区分很重要：**

```text
状态机说：pending → paid 合法
幂等层说：这次转移真的发生了吗？如果订单已经是 paid，副作用不能重复执行
```

### 为什么 `expired → paid` 和 `canceled → paid` 都允许

**见上面 1.3。**

**但要注意 `canceled → paid` 有额外风险：** 客户主动取消后，可能会重新下单。**如果两个订单都变成 paid，客户付了两次钱。**

**处理方式：在 `canceled` 时记录"这个客户有没有正在支付的新订单"。**

**这个逻辑在服务层（`service.js`）做，不在状态机里。** 状态机只管"这个转移本身合不合法"。

### 为什么 `refunded` 是唯一的终态

**`expired` 和 `canceled` 都可能被迟到的支付回调翻回来。**

**`refunded` 不会：** 钱已经退回去了，不可能再变成"已支付"。**如果回调说已支付，那是数据不一致，要人工介入。**

## 1.6 自检点

**先用纯逻辑测一遍，不碰数据库：**

```js
const { canTransition } = require('../src/orders/state');

const cases = [
  ['pending', 'paid', true],
  ['pending', 'refunding', false],
  ['paid', 'paid', true],
  ['paid', 'refunding', true],
  ['refunding', 'refunded', true],
  ['refunding', 'paid', true],
  ['refunded', 'paid', false],
  ['refunded', 'refunding', false],
  ['expired', 'paid', true],
  ['canceled', 'paid', true],
  ['paid', 'expired', false],
  ['pending', 'refunded', false],
];

for (const [from, to, expect] of cases) {
  const got = canTransition(from, to);
  console.log(got === expect ? '✓' : '✗', from, '→', to, '=', got, '（期望', expect + '）');
}
```

**全部 ✓ 才往下走。**

---

# 第 2 步：幂等键（25 分钟）

## 2.1 幂等键是什么

**一句话：客户（或平台）生成一个唯一的值，同一个值第二次来，你直接返回上次的结果，不做任何操作。**

**两种典型场景：**

```text
下单：前端生成一个 requestId，随"创建订单"请求一起发
      同一个 requestId 第二次来 → 返回上次创建的那个订单，不新建

回调：平台给每个通知一个 transaction_id 或 notify_id
      同一个 id 第二次来 → 返回 200，不做任何操作
```

## 2.2 为什么前端生成而不是后端

**客户点了两次，发的是两个 HTTP 请求。**

**如果后端在收到请求时生成，两个请求各有各的 id，无法去重。**

**必须前端在"渲染这个按钮"的时候就生成一个，两次点击用同一个。**

```js
// 前端
const requestId = crypto.randomUUID();   // 页面加载时生成一次

async function submit() {
  await fetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ ..., requestId }),
  });
}
```

**加上按钮置灰之后，实际出错的机会很少。但网络重试、用户刷新重提、前端 bug 都会让同一个 `requestId` 发多次。**

## 2.3 幂等表

**新建 `migrations/011_idempotency.sql`：**

```sql
create table idempotency_keys (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  key          text not null,
  scope        text not null,
  request_hash text not null,
  response     jsonb,
  status_code  integer,
  created_at   timestamptz not null default now(),
  primary key (tenant_id, scope, key)
);

create index idempotency_keys_created_idx
  on idempotency_keys (created_at);

alter table idempotency_keys enable row level security;
alter table idempotency_keys force row level security;

create policy tenant_isolation on idempotency_keys
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**`scope` 是什么：** 不同接口的幂等键可能撞。

```text
scope = 'create_order'  → 下单
scope = 'refund'        → 退款
```

**不区分 scope 的话，一个订单 id 恰好等于另一个请求的 requestId，就会互相干扰。**

**`request_hash` 是什么：** 存请求体的哈希。

**为什么要它：** 同一个 `requestId` 配不同的请求体，说明前端有 bug 或者有人在攻击。

```text
requestId = abc，body 是"买 1 个"
requestId = abc，body 是"买 100 个"
```

**第二种情况必须拒绝，否则攻击者可以复用别人的 `requestId` 干别的。**

## 2.4 写幂等中间件

**新建 `src/middleware/idempotency.js`：**

```js
const crypto = require('crypto');
const { withTenant } = require('../db/tenant-db');

function hashBody(body) {
  const normalized = JSON.stringify(body || {}, Object.keys(body || {}).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function idempotency(scope) {
  return async function (req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PATCH') {
      return next();
    }

    const key = req.headers['idempotency-key'] || req.body.requestId;

    if (!key || typeof key !== 'string' || key.length < 8 || key.length > 128) {
      return res.status(400).json({
        error: '缺少幂等键',
        hint: '请在请求头带 Idempotency-Key，或者在请求体里带 requestId（至少 8 个字符）',
      });
    }

    const requestHash = hashBody(req.body);
    const tenantId = req.tenant.id;

    let preview;

    try {
      preview = await withTenant(tenantId, async (db) => {
        const inserted = await db.client.query(
          `insert into idempotency_keys (tenant_id, key, scope, request_hash)
           values ($1, $2, $3, $4)
           on conflict (tenant_id, scope, key) do nothing
           returning key`,
          [tenantId, key, scope, requestHash]
        );

        if (inserted.rowCount === 1) {
          return { fresh: true };
        }

        const { rows } = await db.client.query(
          `select request_hash, response, status_code
           from idempotency_keys
           where tenant_id = $1 and scope = $2 and key = $3`,
          [tenantId, key, scope]
        );

        return { fresh: false, prev: rows[0] || null };
      });
    } catch (err) {
      return next(err);
    }

    if (!preview.fresh) {
      const prev = preview.prev;

      if (!prev) {
        return res.status(409).json({ error: '幂等键冲突，请重试' });
      }

      if (prev.request_hash !== requestHash) {
        return res.status(422).json({
          error: '同一个幂等键用了不同的请求内容',
          hint: '每次新的请求请生成新的幂等键',
        });
      }

      if (prev.response === null) {
        return res.status(409).json({
          error: '上一次相同请求还在处理中',
          hint: '请等待几秒后重试',
        });
      }

      res.setHeader('Idempotent-Replayed', 'true');
      return res.status(prev.status_code || 200).json(prev.response);
    }

    req.idempotency = { key, scope, requestHash, tenantId, fresh: true };

    const originalJson = res.json.bind(res);
    res.json = function (payload) {
      const code = res.statusCode;

      withTenant(tenantId, async (db) => {
        if (code >= 200 && code < 300) {
          await db.client.query(
            `update idempotency_keys
             set response = $1::jsonb, status_code = $2
             where tenant_id = $3 and scope = $4 and key = $5`,
            [JSON.stringify(payload), code, tenantId, scope, key]
          );
        } else {
          await db.client.query(
            `delete from idempotency_keys
             where tenant_id = $1 and scope = $2 and key = $3`,
            [tenantId, scope, key]
          );
        }
      }).catch((err) => console.error('[idempotency] 保存响应失败', err.message));

      return originalJson(payload);
    };

    next();
  };
}

module.exports = { idempotency, hashBody };
```

**注意它自己开两次短事务，不依赖路由把 `db.client` 传进来。** 为什么这样设计，第 4.3 节会讲。

## 2.5 五个关键设计

### `insert ... on conflict do nothing returning key`

**这一句同时做了两件事：**

```text
① 插入成功（rowCount = 1）→ 这是第一次请求，继续处理
② 冲突了（rowCount = 0）→ 这是重复请求，去查上次的结果
```

**这是整个幂等的核心。原子性由主键保证——两个并发请求同时插，数据库只会让一个成功。**

**这比"先查后插"可靠得多。** 和 167 节的配额扣减是同一个思想。

### 为什么不保存失败的响应

```js
if (code >= 200 && code < 300) { 保存 }
else { 删除 }
```

**因为"失败"通常是暂时的：网络抖、数据库锁、参数校验。**

**如果保存了，客户改完参数用同一个 key 重试，会拿到上次的错误——永远改不好。**

**删除之后，客户可以用同一个 key 重试。**

**但注意：参数校验失败（400）删掉是合理的；如果是 500，也应该删掉让客户重试。**

**所以规则是：只有 2xx 保存，其他都删。**

### `Idempotent-Replayed: true` 这个头

**让前端知道"这是重放，不是新执行"。**

**有什么好处：** 前端可以提示"这个操作之前已经成功了"，而不是让客户以为又下了一单。

**调试时也有用：** 你能一眼看出这次是真实执行还是重放。

### 处理中状态（`response === null`）

**场景：**

```text
请求 A：插入成功，开始处理（要 2 秒）
请求 B（同一 key，200ms 后到）：插入失败，查上一次 → response 是 null
```

**说明 A 还在跑。**

**返回 409 "还在处理中"，让客户端等几秒重试。**

**另一种做法是"等待 A 完成然后返回 A 的结果"，但要实现轮询或者 PostgreSQL 的 advisory lock，这一节不做。**

**409 已经能解决问题：客户的重试请求会过几秒再来，那时候 A 早就完成了。**

### `res.json` 被覆盖

**这是唯一能"自动保存响应"的办法——在 `res.json` 上包一层。**

**风险：** 如果某个路由完全不用 `res.json`（比如 `res.send`、`res.end`），这一层就失效了。

**所以规矩是：所有带幂等的路由都必须用 `res.json` 返回。**

**写在项目 README 里。**

## 2.6 自检点

**先别接进路由，手工测一下中间件的逻辑：**

**新建 `scripts/idem-key-test.js`：**

```js
const pool = require('../src/db/pool');

(async () => {
  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  const tenantId = t.rows[0].id;
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id', $1, true)", [String(tenantId)]);

    const key = 'test-key-12345678';
    const hash = 'abc';

    const r1 = await client.query(
      `insert into idempotency_keys (tenant_id, key, scope, request_hash)
       values ($1, $2, 'test', $3)
       on conflict do nothing
       returning key`,
      [tenantId, key, hash]
    );
    console.log('第一次插入 rowCount：', r1.rowCount, '（期望 1）');

    const r2 = await client.query(
      `insert into idempotency_keys (tenant_id, key, scope, request_hash)
       values ($1, $2, 'test', $3)
       on conflict do nothing
       returning key`,
      [tenantId, key, hash]
    );
    console.log('第二次插入 rowCount：', r2.rowCount, '（期望 0）');
  } finally {
    await client.query('rollback');
    client.release();
    await pool.end();
  }
})();
```

**期望输出 `1` 和 `0`。**

**如果第二次也是 1，说明主键没生效——检查 `primary key (tenant_id, scope, key)`。**

---

# 第 3 步：原子更新状态（30 分钟）

**这是这节课技术上最关键的部分。**

## 3.1 先写错的版本

```js
// ❌ 先查后改
const order = await getOrder(orderId);
if (order.status === 'paid') {
  return;   // 已经付了，不重复处理
}
await updateStatus(orderId, 'paid');
await addQuota(order.tenant_id, 1);
```

**并发下会出现：**

```text
时刻 1  回调 A：查状态 = pending
时刻 2  回调 B：查状态 = pending
时刻 3  回调 A：改成 paid，加额度
时刻 4  回调 B：改成 paid，加额度     ← 加了两次
```

**和 167 节的配额超卖是一模一样的形状。**

## 3.2 正确的写法

**新建 `src/orders/service.js`：**

```js
const { assertTransition, STATUS } = require('./state');

async function markPaid(db, tenantId, orderId, paymentInfo) {
  const result = await db.client.query(
    `update orders
     set status = 'paid',
         paid_cents = amount_cents,
         paid_at = now(),
         payment_no = $1
     where tenant_id = $2
       and id = $3
       and status = 'pending'
     returning id, order_no, amount_cents, tenant_id`,
    [paymentInfo.paymentNo, tenantId, orderId]
  );

  if (result.rowCount === 0) {
    const { rows } = await db.client.query(
      'select status from orders where tenant_id = $1 and id = $2',
      [tenantId, orderId]
    );

    if (rows.length === 0) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const current = rows[0].status;

    if (current === 'paid') {
      return { ok: false, reason: 'ALREADY_PAID', status: current };
    }

    if (current === 'expired' || current === 'canceled') {
      return { ok: false, reason: 'NEEDS_REVIVAL', status: current };
    }

    return { ok: false, reason: 'BAD_STATE', status: current };
  }

  const order = result.rows[0];

  await db.client.query(
    `update tenants
     set plan = 'pro',
         plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + interval '30 days'
     where id = $1`,
    [tenantId]
  );

  return { ok: true, order };
}

module.exports = { markPaid };
```

## 3.3 关键点：`and status = 'pending'` 在 `where` 里

**这一句是整个幂等的技术实现。**

```sql
update orders
set status = 'paid', ...
where tenant_id = $1 and id = $2 and status = 'pending'
```

**数据库执行 UPDATE 时会锁住匹配的行。**

```text
回调 A：锁住这一行 → status 是 pending → 更新成功 → rowCount = 1 → 提交 → 解锁
回调 B：等锁 → 拿到锁 → 再检查 status → 已经是 paid → 不匹配 → rowCount = 0
```

**B 得到 `rowCount = 0`，就不会去加额度。**

**没有任何时间窗口。这是唯一正确的做法。**

## 3.4 `rowCount === 0` 的四种原因要分清

**`rowCount = 0` 只说明"没更新到"，但原因有四种：**

| 原因 | 返回 | 处理 |
|---|---|---|
| 订单不存在 | `NOT_FOUND` | 404 |
| 已经是 paid | `ALREADY_PAID` | **200（幂等成功）** |
| 是 expired / canceled | `NEEDS_REVIVAL` | 走复活流程（第 174 节） |
| 是 refunded / refunding | `BAD_STATE` | 500 + 告警，这是数据不一致 |

**第二种最关键：重复回调要返回 200。**

**因为平台认为"200 = 收到了，不再重试"。如果你返回 4xx，它会一直重试到超时。**

## 3.5 为什么加额度的 SQL 和改状态的 SQL 在同一个事务里

**`withTenant` 保证了这一点。**

```text
改状态成功 → 加额度 → commit
改状态成功 → 加额度失败 → rollback（状态也回滚）
```

**不会有"状态变了但额度没加"这种中间状态。**

**但要注意：这里的"加额度"实际是改 `tenants.plan`。真实场景可能是写 `usage_events` 一条"充值"记录。**

**关键是：这两件事必须原子。**

## 3.6 `paid_cents = amount_cents` 这个写法

**为什么不从请求里读金额：**

```js
// ❌ 绝对不行
paid_cents = req.body.amount
```

**因为请求里的金额是外部来的，不可信。**

**回调里的金额只能用来"校验"，不能用来"赋值"：**

```js
if (callbackAmount !== order.amount_cents) {
  // 金额不一致，拒绝
}
```

**赋值必须用你自己的 `amount_cents`。**

**这就是 README 里第四条铁律："下单金额只从服务端算，永远不信前端传的金额"。**

**回调同理。**

## 3.7 复活流程（`NEEDS_REVIVAL`）

**第 1 步说的场景：订单 expired 了，但客户真的付了钱。**

**在第 174 节会实现。这里先留一个明确的返回，不要糊弄过去。**

**`NEEDS_REVIVAL` 的处理原则：**

```text
1. 主动查单，确认平台那边是"已支付"（不能只信回调）
2. 查这个租户在订单过期后有没有新的已支付订单
3. 没有 → 改成 paid，正常返还会员
4. 有 → 标记为"重复支付"，走退款流程
```

**第 2 步是防止客户付两次。** 这一步必须有，不能省。

---

# 第 4 步：下单接口（25 分钟）

## 4.1 加字段

**新建 `migrations/012_order_payment.sql`：**

```sql
alter table orders
  add column if not exists paid_at timestamptz,
  add column if not exists payment_no text,
  add column if not exists expires_at timestamptz,
  add column if not exists request_id text;

create unique index if not exists orders_payment_no_idx
  on orders (tenant_id, payment_no)
  where payment_no is not null;

create index if not exists orders_pending_expiry_idx
  on orders (expires_at)
  where status = 'pending';
```

**跑：**

```text
npm run migrate
```

**三处要讲：**

### `where payment_no is not null` 的部分唯一索引

**因为 `payment_no` 在订单还是 pending 的时候是 `null`。**

**普通唯一索引允许多个 `null`（PostgreSQL 里 `null` 不等于任何值），所以其实不加 `where` 也行。但加了更明确，而且索引更小。**

**这个索引的真正作用：** 防止同一个支付流水号绑到两个订单上。

**如果平台的回调里 `payment_no` 重复（它不应该，但万一），数据库会拒绝——这是好事。**

### `where status = 'pending'` 的部分索引

**定时任务要扫"到期的未支付订单"。**

**全部订单可能几百万条，但 pending 的最多几百条。部分索引只索引那几百个，扫描快得多。**

**这个技巧在"状态字段的索引"上很有用：**

```sql
create index on orders (expires_at) where status = 'pending';
```

**代价：每次状态从 pending 变成别的，索引要更新。但这个代价很小。**

### `request_id`

**把幂等键也存到订单上。**

**为什么：** 双重保险。即使 `idempotency_keys` 表被清理了（比如设了过期），你还能靠这个字段查"这个 requestId 是不是已经建过订单"。

```sql
select id from orders where tenant_id = $1 and request_id = $2;
```

## 4.2 下单接口

**新建 `src/routes/orders.js`：**

```js
const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { idempotency } = require('../middleware/idempotency');
const { withTenant } = require('../db/tenant-db');
const { PLANS } = require('../billing/plans');

const router = express.Router();

router.use(auth, tenant);

router.post('/', idempotency('create_order'), async (req, res, next) => {
  try {
    const planCode = req.body.plan;
    const plan = PLANS[planCode];

    if (!plan || plan.priceCents === null || plan.priceCents <= 0) {
      return res.status(400).json({ error: '请选择可购买的套餐' });
    }

    const order = await withTenant(req.tenant.id, async (db) => {
      const orderNo =
        'P' + Date.now().toString(36).toUpperCase() +
        crypto.randomBytes(2).toString('hex').toUpperCase();

      const { rows } = await db.client.query(
        `insert into orders
           (tenant_id, order_no, customer_name, order_date,
            quantity, unit_price_cents, amount_cents, discount_cents, tax_cents,
            tax_inclusive, status, source, expires_at, request_id)
         values ($1, $2, $3, current_date, 1, $4, $5, 0, 0, true,
                 'pending', 'plan', now() + interval '15 minutes', $6)
         returning id, order_no, amount_cents, status, expires_at`,
        [
          req.tenant.id,
          orderNo,
          req.tenant.name + ' - ' + plan.name,
          plan.priceCents,
          plan.priceCents,
          req.idempotency.key,
        ]
      );

      return rows[0];
    });

    res.status(201).json({
      order,
      plan: { code: plan.code, name: plan.name, priceCents: plan.priceCents },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select id, order_no, customer_name, order_date, quantity,
                unit_price_cents, amount_cents, discount_cents, tax_cents,
                paid_cents, refunded_cents, refunded_qty, status,
                expires_at, paid_at, created_at
         from orders
         where tenant_id = $1 and id = $2`,
        [req.tenant.id, req.params.id]
      );
      return r.rows[0] || null;
    });

    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const orderRoutes = require('./routes/orders');
app.use('/api/orders', orderRoutes);
```

## 4.3 为什么不能用"一个事务包住整个请求"

**你可能想：既然幂等中间件和业务处理都需要 `db.client`，那我开一个事务包住整个请求，让它们共用不就行了。**

**不行，三个原因：**

```text
① 事务开着整场请求 → 一个连接被占着几秒到几十秒
   十个人同时下单 → 连接池满了 → 第十一个人排队等 5 秒超时

② 如果客户端断开（关浏览器、切网络），事务要等超时才回滚
   这期间那条连接一直挂着，PostgreSQL 显示 idle in transaction

③ 长事务会让 PostgreSQL 的 autovacuum 无法回收死行
   表会一直膨胀
```

**所以正确的分层是：**

```text
幂等中间件    → 自己开一个短事务，判断完就提交/回滚
业务处理      → 自己开一个短事务
保存幂等响应  → 再开一个短事务（异步执行）
```

**代价：三次连接往返，而不是一次。**

**代价换来了什么：连接不会被长期占用。**

**而且那个"异步保存响应"有一个副作用：响应已经发出去了，保存可能失败。失败了下次重复请求会拿到 409 而不是重放结果。**

**这是可接受的——客户重试一次就成功了，只是体验略差。**

**要彻底解决就得在返回响应前完成写入，那又回到"事务包住整个请求"。**

**这个权衡写进笔记。** 这就是工程判断：**没有完美方案，只有你清楚代价的方案。**

## 4.4 自检点

**同一个 `requestId` 发两次：**

```text
curl -X POST http://localhost:3000/api/orders -b cookies.txt -H "Content-Type: application/json" -d "{\"plan\":\"pro\",\"requestId\":\"req-test-0001\"}"
```

**第二次会拿到：**

```text
Idempotent-Replayed: true
同样的 order.id
```

**然后 `?` 三次、五次，都是同一个 id。**

**检查数据库：**

```sql
select count(*) from orders where request_id = 'req-test-0001';
```

**必须是 1。**

**如果第二行是 `Bad request: 缺少幂等键`，检查前端有没有传 `requestId`——这一节用 curl 就要手动带上。**

---

# 第 5 步：并发测一次（25 分钟）

**看并发问题只有一个办法：同时发。**

## 5.1 写并发脚本

**新建 `scripts/concurrent-order.js`：**

```js
const BASE = 'http://localhost:3000';

async function login(email) {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test12345' }),
  });
  const raw = res.headers.getSetCookie
    ? res.headers.getSetCookie()[0]
    : res.headers.get('set-cookie');
  return raw.split(';')[0];
}

async function main() {
  const cookie = await login('seed-alpha@test.local');

  const N = 5;
  const sameKey = 'concurrent-test-' + Date.now();

  console.log(`\n== 实验一：${N} 个并发请求，用同一个 requestId ==`);
  const sameTasks = Array.from({ length: N }, () =>
    fetch(BASE + '/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ plan: 'pro', requestId: sameKey }),
    }).then(async (r) => ({
      status: r.status,
      replayed: r.headers.get('idempotent-replayed'),
      body: await r.json(),
    }))
  );

  const sameResults = await Promise.all(sameTasks);
  const orderIds = new Set();
  for (const r of sameResults) {
    console.log('  status=' + r.status, 'replayed=' + r.replayed, 'order=' + (r.body.order ? r.body.order.id.slice(0, 8) : r.body.error));
    if (r.body.order) orderIds.add(r.body.order.id);
  }
  console.log('  → 不同的订单 id 数量：', orderIds.size, orderIds.size === 1 ? '（正确）' : '（错了，重复下单）');

  console.log(`\n== 实验二：${N} 个并发请求，各用不同 requestId ==`);
  const diffTasks = Array.from({ length: N }, (_, i) =>
    fetch(BASE + '/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ plan: 'pro', requestId: 'diff-' + Date.now() + '-' + i }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }))
  );

  const diffResults = await Promise.all(diffTasks);
  console.log('  状态码：', diffResults.map((r) => r.status).join(', '));
  console.log('  → 建了', diffResults.filter((r) => r.status === 201).length, '个订单（这是对的，客户真的点了 5 次）');
}

main().catch(console.error);
```

**跑：**

```text
node scripts/concurrent-order.js
```

## 5.2 期望结果

```text
== 实验一：5 个并发请求，用同一个 requestId ==
  status=201 replayed=null order=8f3a2b1c
  status=409 replayed=null order=上一次相同请求还在处理中
  status=409 replayed=null order=上一次相同请求还在处理中
  status=409 replayed=null order=上一次相同请求还在处理中
  status=200 replayed=true  order=8f3a2b1c
  → 不同的订单 id 数量： 1（正确）

== 实验二：5 个并发请求，各用不同 requestId ==
  状态码： 201, 201, 201, 201, 201
  → 建了 5 个订单（这是对的）
```

**实验一是关键：只有一个 201，一个 200（重放），三个 409（还在处理）。**

**三个 409 不理想，但它证明幂等生效了——客户不会拿到两个订单。**

**如果 `订单 id 数量` 是 5，说明幂等完全没生效。**

## 5.3 再试一次不带幂等键

**把 `idempotency('create_order')` 中间件临时去掉，改成直接 `router.post('/', ...)`。**

**再跑实验一（5 个并发，同一个 key）。**

**这次 `requestId` 是同一个，但后面没人管它了。**

**会建出 5 个订单。**

**这就是没有幂等的世界。** 尤其是前端"网络慢点两次"的时候——**那两次不会严格并发，但隔着 300ms，两次都会成功。**

---

# 第 6 步：过期清理（15 分钟）

**`pending` 订单不能永远挂着。** 客户下了一单没付，一个月后账户里还有一条"待支付"。

## 6.1 写清理脚本

**新建 `scripts/expire-orders.js`：**

```js
const pool = require('../src/db/pool');

(async () => {
  const dryRun = !process.argv.includes('--run');

  const { rows } = await pool.query(`
    select id, order_no, tenant_id, expires_at,
           now() - expires_at as overdue
    from orders
    where status = 'pending'
      and expires_at < now()
    order by expires_at
    limit 100
  `);

  console.log('已过期待处理：', rows.length, '条');

  if (rows.length === 0) {
    await pool.end();
    return;
  }

  if (dryRun) {
    rows.slice(0, 10).forEach((r) =>
      console.log('  ', r.order_no, '过期于', r.expires_at)
    );
    console.log('\n这是预演。加 --run 才真的改状态。');
    await pool.end();
    return;
  }

  const { rowCount } = await pool.query(`
    update orders
    set status = 'expired'
    where status = 'pending'
      and expires_at < now()
  `);

  console.log('处理了', rowCount, '条');
  await pool.end();
})();
```

**这条 `update` 里没有 `tenant_id` 条件——这是对的。**

**因为它是跨租户的系统级任务，不是"某个租户的请求"。**

**但要注意：RLS 会拦住它。** 因为没设 `app.tenant_id`，`orders` 表的策略会返回 0 行。

**解决方式有两种：**

```text
① 用数据库超级用户连接（不受 RLS 约束）
② 临时设置一个"系统租户"的上下文
```

**第一种更简单。在 `.env` 里加一个 `SYSTEM_DATABASE_URL`，用超级用户连，专门给这类脚本用。**

**但这样就要注意：这些脚本里的 SQL 必须自己保证正确性，因为没有 RLS 兜底了。**

**这一节先用方案 ①，你要在笔记里记下这个风险。**

## 6.2 为什么必须在 `where` 里写 `status = 'pending'`

```sql
update orders
set status = 'expired'
where status = 'pending' and expires_at < now()
```

**如果只写 `where expires_at < now()`：**

```text
一条 10 点下单、10:05 支付、10:20 才跑的清理脚本
→ 这条订单 11:20 会被改成"已过期"
→ 客户付了钱，订单变过期
```

**`and status = 'pending'` 这一句，就是这个脚本的安全带。**

**和第 3 步 `markPaid` 里那句 `and status = 'pending'` 是同一个思想：条件在 `where` 里，不在代码里。**

## 6.3 定时跑

**Windows 上用任务计划程序，Linux 上用 cron。**

**这一节不接。** 你手动跑两次，确认它工作正常就行。

**第 30 周（持续集成与部署）会讲怎么部署这些定时任务。**

---

# 第 7 步：最终验收

## A. 状态机

- [ ] 六个状态（pending / paid / refunding / refunded / expired / canceled）
- [ ] 十二个转移用例全部通过
- [ ] `expired → paid` 和 `canceled → paid` 是允许的
- [ ] `refunded` 是唯一真终态
- [ ] 我能解释为什么 `expired` 不能设成终态

## B. 幂等

- [ ] `idempotency_keys` 表有 `(tenant_id, scope, key)` 主键
- [ ] 用 `on conflict do nothing returning` 判断首次 / 重复
- [ ] 同 key 不同 body 返回 422
- [ ] 处理中返回 409
- [ ] 重放返回 `Idempotent-Replayed: true`
- [ ] 失败响应不保存（2xx 才保存）

## C. 原子更新

- [ ] `markPaid` 的 `where` 里有 `and status = 'pending'`
- [ ] `rowCount === 0` 时能区分四种原因
- [ ] `ALREADY_PAID` 返回 200，不是 4xx
- [ ] 改状态和加额度在同一个事务里
- [ ] `paid_cents` 用的是 `amount_cents`，不是请求里的金额

## D. 并发

- [ ] 5 个并发同 key → 只有 1 个订单
- [ ] 5 个并发不同 key → 5 个订单
- [ ] 去掉幂等中间件 → 5 个订单（证明中间件真的在起作用）

## E. 过期

- [ ] `expire-orders.js` 默认 dry-run
- [ ] 加 `--run` 才真的改
- [ ] `update` 的 `where` 里有 `status = 'pending'`
- [ ] 我知道 RLS 会拦住跨租户脚本，用了系统连接

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"为什么只有 2xx 才保存幂等响应"
- [ ] 我记下了"长事务 vs 偶发 409"这个权衡

## 提交

```text
git add -A
git commit -m "第173节课: 订单状态机 + 幂等键 + 原子状态更新 + 过期清理"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `缺少幂等键` | 前端没传 `requestId` | 页面加载时生成一次，提交时带上 |
| `同一个幂等键用了不同的请求内容` | 前端每次提交重新生成了 key | key 要在页面加载时生成，不是提交时 |
| `上一次相同请求还在处理中` | 并发请求，第一个还没写完 | 客户端 1—2 秒后重试 |
| 并发还是建了多个订单 | `idempotency_keys` 主键少了 `scope` 或 `tenant_id` | 检查主键定义 |
| `非法状态转移：paid → paid` | 状态机把"同状态"判成非法 | `if (from === to) return true` |
| 回调重复加额度 | `markPaid` 的 `where` 里没有 `status = 'pending'` | 加上 |
| `ALREADY_PAID` 时返回了 500 | 没处理这个 reason | 返回 200，这是幂等成功 |
| 清理脚本把已支付订单标成过期 | `where` 里缺 `status = 'pending'` | 加上 |
| 清理脚本处理了 0 条 | RLS 拦住了，没设 `app.tenant_id` | 用系统连接（超级用户） |
| `violates check constraint "orders_money_check"` | `amount_cents` 和公式不符 | 用 `computeOrderAmounts` 算，别手写 |
| 订单 `payment_no` 撞了 | 同一个支付流水号绑了两个订单 | 这是好事，说明有重复回调；去查来源 |

---

## 本节课要能说出口的一句话

> **"检查状态"和"更新状态"必须在同一条 SQL 的 `where` 里，任何"先查后改"在并发下都会重复执行；幂等键不是锦上添花，是"客户点两次"这件事的唯一解法。**
