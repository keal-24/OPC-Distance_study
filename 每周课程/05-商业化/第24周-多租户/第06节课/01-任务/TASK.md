# 第 167 节课：套餐、配额与用量

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 隔离做完了，客户能安全共存了。这节课解决另一个会要命的问题：**谁用得多，谁该多付钱，用超了怎么办。**
> 一人公司最容易被拖死的方式，不是没客户，是**客户用你的模型额度用出三千块钱，你收了三百。**

**建议用时**：120 分钟
**你需要先完成**：第 166 节课（九条隔离测试全绿）

---

# 第 0 步：先算一笔真实的钱（10 分钟）

## 0.1 这件事有多容易失控

**你的系统每一句对话都要调模型。假设一次对话平均消耗 0.01 元。**

```text
一个客户 3 个人用，每人每天 50 次对话
= 150 次/天 = 4500 次/月
= 45 元/月成本
```

**你收他 200 元/月，还剩 155 元。**

**但如果他接了一个爬虫进去，或者一个人手抖写了个循环：**

```text
每分钟 1000 次 × 60 分钟 × 8 小时 = 48 万次
= 4800 元成本
```

**一天就把你三个月的利润烧完。**

**这不是危言耸听。** 客户不是坏人，他只是不知道"点一下按钮"要花钱——**因为付钱的是你。**

## 0.2 三层概念，别混

```text
套餐（plan）    ：客户买了哪一档 —— 免费 / 专业 / 企业
配额（quota）   ：这一档每个月能用多少 —— 1000 条消息 / 500MB 文件
用量（usage）   ：这个月已经用了多少 —— 已用 320 条
```

**三者关系：**

```text
plan 决定 quota 的数字
quota 和 usage 比较，决定这次请求放不放行
```

**为什么不用一个字段全搞定：**

```text
套餐会换（客户升级）       → 改 tenants.plan 一行
配额数字会调（你改价）     → 改代码里的一张表，不动数据库
用量每月清零               → 靠时间区间，不靠定时任务
```

**最后这条最值得学：不要用定时任务清零。**

**定时任务会漏跑、会重复跑、会因为服务器重启而丢。** 用"每月一号 00:00 之后的数据算这个月"这种方式，永远不会错。

**第 5 周的 `date_trunc` 就是干这个的。**

## 0.3 这节课要建的东西

```text
plans 定义（代码里）        免费 / 专业 两档
tenant_quotas 表            当月用了多少（限流用，要能原子扣减）
usage_events 表             每一笔流水的记录（对账用）
consumeQuota()              原子扣减
/api/usage                  客户自己看用量
```

**为什么是两张表，不是一张** —— 第 4 步会讲，这是这一节最重要的设计。

---

# 第 1 步：写套餐定义（10 分钟）

## 1.1 `src/billing/plans.js`

```js
const PLANS = {
  free: {
    code: 'free',
    name: '免费版',
    priceCents: 0,
    limits: {
      messages_per_month: 200,
      files_count: 5,
      members: 1,
    },
  },

  pro: {
    code: 'pro',
    name: '专业版',
    priceCents: 19900,
    limits: {
      messages_per_month: 5000,
      files_count: 200,
      members: 10,
    },
  },

  enterprise: {
    code: 'enterprise',
    name: '企业版',
    priceCents: null,
    limits: {
      messages_per_month: null,
      files_count: null,
      members: null,
    },
  },
};

function getPlan(code) {
  return PLANS[code] || PLANS.free;
}

function getLimit(code, kind) {
  const plan = getPlan(code);
  const value = plan.limits[kind];
  return value === undefined ? null : value;
}

module.exports = { PLANS, getPlan, getLimit };
```

## 1.2 三个设计决定

### 配额数字写在代码里，不写数据库

**写在数据库表里更"灵活"，但你现在不需要灵活。**

```text
写库里：每次改价格要写个迁移 + 部署，还可能改错
写代码里：改一个数字，提交，部署。历史版本能查，改错了 git 回滚
```

**什么时候该搬到数据库：** 当你有销售、要按客户单独谈价、要临时给某个客户开放额度的时候。

**那时候再加一张 `tenant_overrides` 表，覆盖 plan 的默认值。** 现在不用。

### `null` 表示"不限"

```js
limits: { messages_per_month: null }
```

**为什么不用 `-1` 或者 `999999999`：**

```text
用 -1：每个判断都要写 if (limit === -1) 跳过，漏一处就变成"负数额度，全拦"
用 999999999：某天真的有人用到了，你的"无限"变成一个诡异的错误
用 null：语义清楚，判断只有一处
```

**这个习惯值得养成：`null` 表示"没有这个限制"，`0` 表示"一条都不许"。两者完全不同。**

**`0` 是有用的：** 免费版 `members: 1`，试用期结束可以设成 `0` 让他只能看不能加人。

### `priceCents` 用分，不用元

```js
priceCents: 19900    // 199.00 元
```

**因为浮点数算钱会出这种事故：**

```js
0.1 + 0.2   // 0.30000000000000004
```

**所有涉及钱的字段，一律存最小单位（分），显示的时候再除以 100。**

**这条规矩从今天起，一辈子有效。** 第 25 周做支付时会天天用到。

---

# 第 2 步：两张表（20 分钟）

## 2.1 新建 `migrations/006_quotas.sql`

```sql
create table tenant_quotas (
  tenant_id     uuid not null references tenants(id) on delete cascade,
  kind          text not null,
  period_start  date not null,
  used          integer not null default 0 check (used >= 0),
  primary key (tenant_id, kind, period_start)
);

create table usage_events (
  id          bigserial primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null,
  qty         integer not null default 1,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index usage_events_tenant_time_idx
  on usage_events (tenant_id, kind, created_at desc);

alter table tenant_quotas enable row level security;
alter table tenant_quotas force row level security;
alter table usage_events enable row level security;
alter table usage_events force row level security;

create policy tenant_isolation on tenant_quotas
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_isolation on usage_events
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

**注意：这次把新表也加上了 RLS。** 第 165 节的教训——**新表忘了加策略，等于开了个后门**。

## 2.2 为什么 `period_start` 是 `date` 不是 `timestamptz`

**因为我们只关心"哪个自然月"，不关心"哪一秒"。**

```sql
date_trunc('month', now())              → 2026-11-01 00:00:00+08
date_trunc('month', now())::date        → 2026-11-01
```

**用 `date` 存，主键 `(tenant_id, kind, period_start)` 一眼能看出是"11 月这个租户的消息额度"。**

**存 `timestamptz` 的话，夏令时/时区切换的那一个月，同一"月"可能出现两个不同的 `period_start`。** 中国没有夏令时，但你的客户可能在国外——或者你的服务器在 UTC，客户在东八区。

**时区问题会在这里咬人，提前避开。**

**一个要注意的坑：`date_trunc('month', now())` 用的是数据库服务器的时区。**

```sql
show timezone;
```

**如果是 `UTC`，那么北京时间 11 月 1 日 07:00 之前，你的"11 月"还没开始。** 客户会在 1 号早上发现用量没清零。

**处理方式：要么把数据库时区设成 `Asia/Shanghai`，要么在 SQL 里显式转：**

```sql
date_trunc('month', now() at time zone 'Asia/Shanghai')::date
```

**这一节用显式转换的写法，不依赖服务器配置。** 因为客户的服务器不是你能控制的。

---

# 第 3 步：原子扣减（25 分钟）

**这是这一节的技术核心。**

## 3.1 先看一个错的写法

```js
// ❌ 先查后用
const used = await getUsed(tenantId, kind);
if (used + cost > limit) {
  return res.status(429).json({ error: '额度用完' });
}
await addUsage(tenantId, kind, cost);
```

**单个人用没问题。两个请求同时到达呢：**

```text
时刻 1  请求 A 查用量 = 199，limit = 200，cost = 1 → 199+1 <= 200，放行
时刻 2  请求 B 查用量 = 199，limit = 200，cost = 1 → 199+1 <= 200，放行
时刻 3  A 写入，used = 200
时刻 4  B 写入，used = 201
```

**结果：用量 201，超了 1。**

**超 1 不可怕。可怕的是这个"查"和"写"之间的时间窗口能被拉长：**

```text
如果中间还有一次模型调用（2 秒），那 2 秒内所有并发请求都读到 199
100 个并发 → used 变成 299
```

**这就是"超卖"的经典形状。** 秒杀系统超卖、库存卖成负数，都是这个原因。

## 3.2 正确的写法：让数据库一次做完判断和写入

**新建 `src/billing/quota.js`：**

```js
const { getLimit } = require('./plans');

async function consumeQuota(client, tenantId, kind, cost = 1) {
  const limit = getLimit(null, kind);

  return consumeWithLimit(client, tenantId, kind, cost, limit);
}

async function consumeWithLimit(client, tenantId, kind, cost, limit) {
  await client.query(
    `insert into tenant_quotas (tenant_id, kind, period_start, used)
     values ($1, $2, date_trunc('month', now() at time zone 'Asia/Shanghai')::date, 0)
     on conflict (tenant_id, kind, period_start) do nothing`,
    [tenantId, kind]
  );

  const result = await client.query(
    `update tenant_quotas
     set used = used + $1
     where tenant_id = $2
       and kind = $3
       and period_start = date_trunc('month', now() at time zone 'Asia/Shanghai')::date
       and ($4::int is null or used + $1 <= $4)
     returning used`,
    [cost, tenantId, kind, limit]
  );

  if (result.rowCount === 0) {
    return null;
  }
  return result.rows[0].used;
}

async function getUsage(client, tenantId, kind) {
  const { rows } = await client.query(
    `select coalesce(used, 0)::int as used
     from tenant_quotas
     where tenant_id = $1
       and kind = $2
       and period_start = date_trunc('month', now() at time zone 'Asia/Shanghai')::date`,
    [tenantId, kind]
  );
  return rows[0] ? rows[0].used : 0;
}

async function recordEvent(client, tenantId, kind, qty = 1, meta = null) {
  await client.query(
    `insert into usage_events (tenant_id, kind, qty, meta)
     values ($1, $2, $3, $4)`,
    [tenantId, kind, qty, meta]
  );
}

module.exports = { consumeQuota, consumeWithLimit, getUsage, recordEvent };
```

## 3.3 三处必须讲清

### 第一条 `insert ... on conflict do nothing`

**它的作用：保证这个月这一行存在，`used` 从 0 开始。**

**为什么不在建租户时就先插好：** 因为那样你要为每个 kind、每个月都预生成行。**懒创建更简单，而且漏不掉。**

**`on conflict do nothing` 是幂等的：** 已存在就什么都不做，不报错。

### 第二条 `update ... where used + $1 <= $4`

**这一句是整个方案的核心。判断和写入在同一个语句里，数据库执行时会加行锁。**

```text
请求 A 进来 → 锁住这一行 → used 199 + 1 <= 200 → 改成 200 → 解锁
请求 B 进来 → 等锁 → 读到 200 → 200 + 1 <= 200 不成立 → 不改 → rowCount = 0
```

**B 得到 `rowCount = 0`，你就知道"超限了"。**

**没有任何时间窗口。** 这是唯一正确的做法，其他的"加锁再查"、"先查再写"、"用 Redis 计数"都是绕远路（Redis 计数还多一个不一致的风险）。

### `($4::int is null or ...)` 那句

**因为 `limit` 可能是 `null`（企业版不限）。**

**SQL 里 `null` 参与比较的结果是 `null`，不是 `true`，`where` 会把它当假。** 所以不加这句，企业版一条都用不了。

**`$4::int` 的强制类型也有用：** 不写的话 `pg` 驱动会把它当 `text` 传，和整数比较时报 `operator does not exist: integer <= text`。

## 3.4 自检点

**这时候先别急着改路由。写一个脚本测一下这套东西：**

**新建 `scripts/quota-test.js`：**

```js
const pool = require('../src/db/pool');
const { consumeWithLimit, getUsage } = require('../src/billing/quota');

(async () => {
  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  if (t.rowCount === 0) {
    console.log('先跑 node scripts/seed.js');
    await pool.end();
    return;
  }
  const tenantId = t.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id', $1, true)", [String(tenantId)]);

    await client.query(
      "delete from tenant_quotas where tenant_id = $1 and kind = 'messages_per_month'",
      [tenantId]
    );

    for (let i = 1; i <= 3; i++) {
      const used = await consumeWithLimit(client, tenantId, 'messages_per_month', 1, 5);
      console.log(`第 ${i} 次：`, used === null ? '超限' : '已用 ' + used);
    }

    const over = await consumeWithLimit(client, tenantId, 'messages_per_month', 3, 5);
    console.log('一次要 3 条（已用 3，上限 5）：', over === null ? '超限（正确）' : '放行了 ' + over);

    const ok = await consumeWithLimit(client, tenantId, 'messages_per_month', 2, 5);
    console.log('一次要 2 条：', ok === null ? '超限' : '已用 ' + ok);

    console.log('最终用量：', await getUsage(client, tenantId, 'messages_per_month'));
  } finally {
    await client.query('rollback');
    client.release();
    await pool.end();
  }
})();
```

**跑：**

```text
node scripts/quota-test.js
```

**期望输出：**

```text
第 1 次： 已用 1
第 2 次： 已用 2
第 3 次： 已用 3
一次要 3 条（已用 3，上限 5）： 超限（正确）
一次要 2 条： 已用 5
最终用量： 5
```

**注意"一次要 3 条"那次被拒了，因为 3 + 3 = 6 > 5。**

**这就是"按次成本"的正确行为：要么整笔通过，要么完全不扣。** 不能扣了 2 条然后说超限——那样客户会看到用量莫名其妙地涨。

---

# 第 4 步：为什么还要 `usage_events`（15 分钟）

**你说：`tenant_quotas.used` 不是已经有数字了吗？为什么还要一张流水表？**

## 4.1 因为两个数字回答两个不同的问题

```text
tenant_quotas.used  →  "现在还能不能用"      （实时判断，一个数就够）
usage_events        →  "这个月这 320 条是什么时候、因为什么产生的"  （对账、排查、争议）
```

**具体场景：**

```text
场景一：客户说"我这个月才用了 50 条，你怎么显示 320"
        → 有流水：按天列出来，他一看就知道是自己团队里谁在用
        → 没流水：你只能说"系统显示的"，然后失去这个客户

场景二：你怀疑自己扣错了
        → 有流水：sum(qty) 和 used 对一下，差多少一目了然
        → 没流水：只能信 used

场景三：某天代码 bug 多扣了 10000 条
        → 有流水：按时间筛出异常那段，精确回滚
        → 没流水：手工猜
```

## 4.2 这是财务系统的通用做法

```text
流水表（events）  ：只追加，不修改。这是账本
汇总表（summary） ：为了查得快，从流水算出来的。可以随时重算
```

**判断标准：**

> **如果一个数字将来会和客户产生争议，就必须有流水。**

**用量会涉及钱，所以必须有。**

**这条原则第 25 周做支付对账时会再用一次：订单表是流水，报表是汇总。对账就是核对这两个是否一致。**

## 4.3 加一个对账查询（以后天天用）

**`scripts/reconcile.js`：**

```js
const pool = require('../src/db/pool');

(async () => {
  const { rows } = await pool.query(`
    select t.name,
           q.kind,
           q.used                        as 汇总表,
           coalesce(sum(e.qty), 0)::int  as 流水表,
           q.used - coalesce(sum(e.qty), 0)::int as 差额
    from tenant_quotas q
    join tenants t on t.id = q.tenant_id
    left join usage_events e
      on e.tenant_id = q.tenant_id
     and e.kind = q.kind
     and e.created_at >= date_trunc('month', now() at time zone 'Asia/Shanghai')
    where q.period_start = date_trunc('month', now() at time zone 'Asia/Shanghai')::date
    group by t.name, q.kind, q.used
    order by t.name, q.kind
  `);

  if (rows.length === 0) {
    console.log('这个月还没有用量');
    await pool.end();
    return;
  }

  console.table(rows);
  const bad = rows.filter((r) => r.差额 !== 0);
  console.log(bad.length === 0 ? '对得上' : `有 ${bad.length} 行对不上，去查代码`);
  await pool.end();
})();
```

**跑：**

```text
node scripts/reconcile.js
```

**现在应该是空的，或者差额为 0。** 因为前面的测试都 `rollback` 了。

**这个脚本以后要接进第 25 周的对账流程。** 差额不是 0，说明你的扣减逻辑漏了记账，或者反过来。

---

# 第 5 步：接进路由（25 分钟）

## 5.1 在发消息的接口里扣额度

**改 `src/routes/messages.js` 的 POST 部分：**

```js
const { consumeQuota, recordEvent } = require('../billing/quota');
const { getPlan, getLimit } = require('../billing/plans');

router.post('/:conversationId/messages', async (req, res, next) => {
  const { conversationId } = req.params;
  const content = (req.body.content || '').trim();

  if (content.length === 0 || content.length > 4000) {
    return res.status(400).json({ error: '内容要在 1—4000 字之间' });
  }

  try {
    const result = await withTenant(req.tenant.id, async (db) => {
      const conv = await db.conversations.find(conversationId);
      if (!conv) return { notFound: true };

      const limit = getLimit(req.tenant.plan, 'messages_per_month');
      const used = await consumeQuota(db.client, req.tenant.id, 'messages_per_month', 1, limit);
      if (used === null) {
        return { overQuota: true, limit };
      }

      const msg = await db.messages.add(conversationId, 'user', content);
      await recordEvent(db.client, req.tenant.id, 'message_sent', 1, {
        conversation_id: conversationId,
      });

      return { msg, used, limit };
    });

    if (result.notFound) {
      return res.status(404).json({ error: '对话不存在' });
    }

    if (result.overQuota) {
      return res.status(429).json({
        error: '本月消息额度已用完',
        limit: result.limit,
        resetAt: nextMonthStart(),
        upgrade: '/pricing',
      });
    }

    res.status(201).json({ message: result.msg, usage: { used: result.used, limit: result.limit } });
  } catch (err) {
    next(err);
  }
});

function nextMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
}
```

**这段代码依赖 `db.client`，第 165 节的 `createRepo` 没暴露它。**

**在 `tenant-db.js` 里加一行：**

```js
function createRepo(client, tenantId) {
  return {
    client,
    conversations: { ... },
    messages: { ... },
    files: { ... },
  };
}
```

**加 `client` 有风险吗：** 有。**拿到 `client` 就能绕过仓储层写裸 SQL。**

**但配额扣减和业务写入必须在同一个事务里**——不然会出现"扣了额度但消息没存进去"，客户会投诉。

**取舍：给 `client`，但加一条检查到 `check-tenant.js`：**

```js
{ re: /db\.client\.query/g, why: '路由里直接用了 client，请改用仓储方法' },
```

**这样你能在路由里用 `db.client` 传给 `consumeQuota`，但不能直接调 `.query`。**

## 5.2 顺序很重要：先扣额度，再写消息

```js
const used = await consumeQuota(...);     // 先
if (used === null) return over;           // 拦
const msg = await db.messages.add(...);   // 后
```

**反过来的问题：**

```text
先写消息，后扣额度 → 扣失败怎么办？消息已经存了，要回滚，但回滚的是整个事务
                  → 实际上因为在同一个事务里，回滚是可行的
```

**那为什么还是先扣：**

```text
因为"扣"这个动作是唯一可能失败的判断点
先做判断，失败就返回，不用做无用功
```

**而且先扣的话，日志里顺序清楚：额度够了 → 才去写。**

## 5.3 加一个用量查询接口

**新建 `src/routes/usage.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { getPlan } = require('../billing/plans');
const { withTenant } = require('../db/tenant-db');
const { getUsage } = require('../billing/quota');

const router = express.Router();

router.use(auth, tenant);

router.get('/', async (req, res, next) => {
  try {
    const plan = getPlan(req.tenant.plan);

    const data = await withTenant(req.tenant.id, async (db) => {
      const result = {};
      for (const kind of Object.keys(plan.limits)) {
        result[kind] = {
          used: await getUsage(db.client, req.tenant.id, kind),
          limit: plan.limits[kind],
        };
      }
      return result;
    });

    res.json({
      plan: { code: plan.code, name: plan.name },
      period: new Date().toISOString().slice(0, 7),
      usage: data,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂上：**

```js
const usageRoutes = require('./routes/usage');
app.use('/api/usage', usageRoutes);
```

**测：**

```text
curl http://localhost:3000/api/usage -b cookies.txt
```

**返回：**

```json
{
  "plan": { "code": "free", "name": "免费版" },
  "period": "2026-11",
  "usage": {
    "messages_per_month": { "used": 0, "limit": 200 },
    "files_count": { "used": 0, "limit": 5 },
    "members": { "used": 0, "limit": 1 }
  }
}
```

**注意：这个接口是给客户自己看的。** 客户看得见额度，才不会突然被拦。

**"突然被拦"是最容易丢客户的体验之一。** 第 27 周做前端时，这个数字要一直显示在页面角落。

## 5.4 自检点

**跑九条隔离测试，必须还是全绿。**

```text
npm test
```

**如果第 5 条（越权发消息）变红了，检查两件事：**

```text
① 你的扣额度是不是在 find 之前就跑了
   ——应该先 find（确认对话是自己的），再扣额度
   ——不然攻击者每次攻击都会扣掉自己的额度（虽然不严重，但逻辑错了）

② 429 分支有没有抢在 404 之前返回
```

---

# 第 6 步：故意制造一次超卖（20 分钟）

**这一节最值得做的实验。**

## 6.1 写一个并发脚本

**新建 `scripts/race.js`：**

```js
const pool = require('../src/db/pool');

const LIMIT = 5;
const CONCURRENCY = 20;

async function naive(client, tenantId, kind) {
  const { rows } = await client.query(
    `select coalesce(used, 0) as used from tenant_quotas
     where tenant_id = $1 and kind = $2
       and period_start = date_trunc('month', now() at time zone 'Asia/Shanghai')::date`,
    [tenantId, kind]
  );
  const used = rows[0] ? Number(rows[0].used) : 0;

  if (used + 1 > LIMIT) return null;

  const r = await client.query(
    `update tenant_quotas set used = used + 1
     where tenant_id = $1 and kind = $2
       and period_start = date_trunc('month', now() at time zone 'Asia/Shanghai')::date
     returning used`,
    [tenantId, kind]
  );
  return r.rows[0].used;
}

async function main() {
  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  const tenantId = t.rows[0].id;
  const kind = 'race_test';

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id', $1, true)", [String(tenantId)]);
    await client.query('delete from tenant_quotas where kind = $1', [kind]);
    await client.query(
      `insert into tenant_quotas (tenant_id, kind, period_start, used)
       values ($1, $2, date_trunc('month', now() at time zone 'Asia/Shanghai')::date, 0)`,
      [tenantId, kind]
    );
  } finally {
    client.release();
  }

  const tasks = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    tasks.push(
      (async () => {
        const c = await pool.connect();
        try {
          await c.query('begin');
          await c.query("select set_config('app.tenant_id', $1, true)", [String(tenantId)]);
          const r = await naive(c, tenantId, kind);
          await c.query('commit');
          return r;
        } catch (err) {
          await c.query('rollback');
          return 'err';
        } finally {
          c.release();
        }
      })()
    );
  }

  const results = await Promise.all(tasks);
  const passed = results.filter((r) => r !== null && r !== 'err').length;

  const final = await pool.query(
    `select used from tenant_quotas where tenant_id = $1 and kind = $2`,
    [tenantId, kind]
  );

  console.log(`上限 ${LIMIT}，并发 ${CONCURRENCY} 次请求`);
  console.log('成功放行：', passed);
  console.log('最终 used：', final.rows[0].used);
  console.log(
    Number(final.rows[0].used) > LIMIT ? '超卖了（这就是先查后写的下场）' : '没超卖'
  );

  await pool.query('delete from tenant_quotas where kind = $1', [kind]);
  await pool.end();
}

main();
```

**先启动服务，跑：**

```text
node scripts/race.js
```

**你会看到类似：**

```text
上限 5，并发 20 次请求
成功放行： 8
最终 used： 8
超卖了（这就是先查后写的下场）
```

**每次都不同，可能 6，可能 9。** 这正是最难查的那种 bug——**本地测试永远正常，客户一上量就超。**

## 6.2 换成原子扣减再跑

**把 `naive` 整个函数替换成调用 `consumeWithLimit`：**

```js
const { consumeWithLimit } = require('../src/billing/quota');

async function naive(client, tenantId, kind) {
  return consumeWithLimit(client, tenantId, kind, 1, LIMIT);
}
```

**再跑：**

```text
上限 5，并发 20 次请求
成功放行： 5
最终 used： 5
没超卖
```

**5 就是 5，一次都不多。**

**这个对比要记住。** 以后遇到"偶发超卖""库存变负数""优惠券被领超了"，第一反应就应该是：**是不是先查后写了。**

## 6.3 清理

**把 `race.js` 里删掉 `race_test` 那两行留着就行，它每次跑完会自己删。**

**`naive` 函数可以留着当反面教材。** 加一行注释：

```js
// 反面教材：先查后写，并发下必超卖。第 167 节实验用。
```

---

# 第 7 步：最终验收

## A. 套餐定义

- [ ] `src/billing/plans.js` 有三档
- [ ] `priceCents` 用分
- [ ] 不限的额度是 `null`，不是 `-1`
- [ ] `getLimit` 对不存在的 kind 返回 `null`

## B. 表

- [ ] `tenant_quotas` 和 `usage_events` 建好了
- [ ] 两张表都有 RLS 和 `force`
- [ ] `period_start` 是 `date`，用 `at time zone 'Asia/Shanghai'` 转
- [ ] 我知道为什么不用定时任务清零

## C. 扣减

- [ ] `consumeWithLimit` 是"一条 UPDATE 完成判断和写入"
- [ ] 超限时返回 `null`，不是抛错
- [ ] `$4::int is null` 那句处理了"不限"
- [ ] `quota-test.js` 的输出和预期一致

## D. 对账

- [ ] `usage_events` 每笔都记了
- [ ] `reconcile.js` 差额是 0
- [ ] 我能说清"为什么两个表都要"

## E. 接口

- [ ] 发消息时扣额度，超了返回 429 带 `upgrade` 字段
- [ ] 额度用完时消息没被写进去（同一个事务）
- [ ] `/api/usage` 能看到三档额度
- [ ] `npm test` 九条还是全绿

## F. 并发

- [ ] `race.js` 用先查后写跑出超卖
- [ ] 换成原子扣减后不超卖
- [ ] 我能解释每次结果不同的原因

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 记下了"偶发超卖先怀疑先查后写"

## 提交

```text
git add -A
git commit -m "第167节课: 套餐配额 + 原子扣减 + 用量流水与对账"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `operator does not exist: integer <= text` | `$4` 没写类型 | 写成 `$4::int` |
| 企业版一条都用不了 | `($4 is null or ...)` 这句少了 | 加上 |
| 用量一直是 0 | 没调 `consumeQuota`，或者 `period_start` 对不上 | 检查时区转换是否一致 |
| 每月一号没清零 | `period_start` 用了 `now()` 全时间戳 | 必须 `date_trunc(...)::date` |
| `duplicate key value violates unique constraint "tenant_quotas_pkey"` | 两个并发同时 insert | `on conflict do nothing` 就是修这个的，检查有没有加 |
| 超限了但消息还是存进去了 | 扣额度在写消息之后，或者不在同一事务 | 顺序调整，确保同一个 `withTenant` |
| 客户投诉"没用多少就被拦" | 把 `usage_events` 按天列给他看 | 用 `reconcile.js` 的查询改个 `group by date` |
| `date_trunc` 报时区相关错误 | 数据库时区配置和写法混用 | 全项目统一 `at time zone 'Asia/Shanghai'` |
| 429 返回了但前端还显示成功 | 前端没处理 429 | 第 27 周处理 |
| 对账差额不为 0 | 有扣减没记账，或者记账重复 | 检查 `recordEvent` 和 `consumeQuota` 是不是一对出现 |

---

## 本节课要能说出口的一句话

> **配额判断必须用一条 SQL 完成"检查 + 扣减"，先查后写在并发下必超卖；用量要留两笔账，一个是给程序看的数字，一个是给客户看的流水。**
