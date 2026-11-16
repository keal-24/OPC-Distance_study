# 第 168 节课：开通、导出、注销

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前六节把"数据分得清是谁的"做完了。这一节做完整的一生：**客户进来、客户留下来、客户要走。**
> 最后一段是交付前的十条检查——**这一周的东西能不能给真实客户用，就看那十条。**

**建议用时**：115 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（45 分钟）一次，第 3—5 步（70 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 167 节课（配额扣减和对账都跑通）

---

# 第 0 步：一条客户的一生（5 分钟）

**客户不是只有"注册"这一个状态。真实过程有七步：**

```text
① 注册        → 建租户，建第一个用户（owner）
② 试用        → 免费额度，14 天
③ 付费        → 改 plan
④ 加人        → 邀请同事，受 members 配额限制
⑤ 欠费 / 违规 → 停用 status = suspended，数据保留
⑥ 要走        → 导出数据，注销
⑦ 后悔了      → 30 天内能恢复
```

**这节课补的是 ④ ⑤ ⑥ ⑦。** ①②③ 前面做了一半，这一节补完。

**为什么"⑥ 要走"值得单独做：**

**客户要走的处理方式，直接决定他会不会推荐你。**

```text
❌ "注销就注销，数据我删了"
   → 客户到处说你不专业，或者更糟：他去告你

✅ 给一份完整数据，30 天冷静期，删之前再确认一次
   → 客户下次有需求还找你，甚至会介绍同行
```

**一人公司的生意靠口碑，这一段就是口碑的分水岭。**

---

# 第 1 步：补开通流程（20 分钟）

## 1.1 加试用期

**新建 `migrations/007_lifecycle.sql`：**

```sql
alter table tenants add column trial_ends_at timestamptz;
alter table tenants add column deleted_at timestamptz;

update tenants
set trial_ends_at = created_at + interval '14 days'
where trial_ends_at is null;

alter table tenant_quotas drop constraint if exists tenant_quotas_used_check;
alter table tenant_quotas add constraint tenant_quotas_used_check check (used >= 0);

create index tenants_status_idx on tenants (status);
```

**跑：**

```text
npm run migrate
```

**三件事：**

```text
trial_ends_at   试用到期时间（已有的租户补成"创建时间 + 14 天"）
deleted_at      软删除时间（第 4 步用）
status 索引     第 5 步的清理脚本要按状态扫
```

**为什么用 `update ... where trial_ends_at is null`：**

**因为迁移可能在已经有数据的库上跑。** 不写这个条件，第二次跑会把所有人的试用期重置——**包括已经付费的客户**。

**这就是第 163 节讲的"迁移要能重复跑"的具体样子。**

## 1.2 注册时写试用期

**改 `src/routes/auth.js` 的注册部分，给 `insert into tenants` 加一列：**

```js
const tenant = await client.query(
  `insert into tenants (name, slug, trial_ends_at)
   values ($1, $2, now() + interval '14 days')
   returning id, trial_ends_at`,
  [company, 't' + Date.now().toString(36)]
);
```

## 1.3 让 `tenant` 中间件检查试用期

**改 `src/middleware/tenant.js`：**

```js
const pool = require('../db/pool');

module.exports = async function tenant(req, res, next) {
  const tenantId = req.user.tenant_id;

  if (!tenantId) {
    return res.status(500).json({ error: '账号没有归属的租户' });
  }

  const { rows } = await pool.query(
    'select id, name, plan, status, trial_ends_at from tenants where id = $1',
    [tenantId]
  );

  if (rows.length === 0) {
    return res.status(500).json({ error: '租户不存在' });
  }

  const t = rows[0];

  if (t.status === 'pending_delete') {
    return res.status(403).json({ error: '账户正在注销中，可恢复', restore: '/api/tenant/restore' });
  }

  if (t.status !== 'active') {
    return res.status(403).json({ error: '账户已停用，请联系客服' });
  }

  const trialOver =
    t.plan === 'free' && t.trial_ends_at && new Date(t.trial_ends_at) < new Date();

  if (trialOver) {
    return res.status(402).json({
      error: '试用已结束，请选择套餐继续使用',
      upgrade: '/api/tenant/plan',
    });
  }

  req.tenant = t;
  next();
};
```

**注意 402。**

```text
401 没登录
402 需要付费（Payment Required）—— 这个状态码就是干这个的
403 登录了 but 没权限 / 被停用
429 太频繁 / 额度用完
```

**用对状态码，前端才能做对的事：** 402 弹付费墙，403 显示联系客服，429 显示"额度用完/太快了"。

**全用 400 是最常见的偷懒，代价是前端只能靠解析中文提示来判断。**

## 1.4 升级套餐的接口

**新建 `src/routes/tenant.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const pool = require('../db/pool');
const { PLANS } = require('../billing/plans');

const router = express.Router();

router.use(auth, tenant);

router.post('/plan', async (req, res, next) => {
  const code = req.body.plan;
  if (!PLANS[code]) {
    return res.status(400).json({ error: '没有这个套餐' });
  }

  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能改套餐' });
  }

  try {
    if (code === 'pro') {
      return res.status(402).json({
        error: '需要先完成支付',
        note: '第 25 周接入支付后，这里会跳转收银台',
      });
    }

    await pool.query('update tenants set plan = $1 where id = $2', [
      code,
      req.tenant.id,
    ]);
    res.json({ plan: code });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**注意 `req.user.role !== 'owner'` 那道检查。**

**这是"租户内的权限"，和"租户之间的隔离"是两件不同的事。**

```text
租户隔离：A 公司的人看不到 B 公司的数据
租户内权限：A 公司的普通成员不能改 A 公司的套餐
```

**第 165 节的仓储层只管第一种。第二种必须在每个接口单独判断。**

**这是个容易漏的洞：** 普通员工点一下按钮就把公司升级成企业版（或者降级），客户会非常生气。

**这一节只做 owner 这一层。** 更细的角色权限（admin / member / viewer）留到真正需要的时候——**现在加三层角色，你只会写出一个自己都记不住规则的系统。**

---

# 第 2 步：邀请成员（20 分钟）

## 2.1 为什么要配额限制

**你按"每 10 人 199 元"卖。客户邀请第 11 个人怎么办？**

```text
不限 → 客户开 200 个账号，你的成本（存储、查询、模型额度）全涨
     而收入一分没多
```

**所以 `members` 这一档配额必须真的拦。**

## 2.2 先给仓储层加一个 users 部门

**路由里不许出现 `db.client.query`（第 165 节的检查脚本会拦），所以方法要先加到 `src/db/tenant-db.js` 的 `createRepo` 里：**

```js
    users: {
      async count() {
        const { rows } = await client.query(
          'select count(*)::int as n from users where tenant_id = $1',
          [tenantId]
        );
        return rows[0].n;
      },

      async list() {
        const { rows } = await client.query(
          `select id, email, role, created_at
           from users where tenant_id = $1
           order by created_at`,
          [tenantId]
        );
        return rows;
      },

      async create(email, passwordHash, role) {
        const { rows } = await client.query(
          `insert into users (tenant_id, email, password_hash, role)
           values ($1, $2, $3, $4)
           returning id, email, role, created_at`,
          [tenantId, email, passwordHash, role]
        );
        return rows[0];
      },
    },
```

**注意 `create` 接收的是 `passwordHash`，不是明文密码。**

**哈希在路由层做（用 `bcrypt`），仓储层只管存。** 这样仓储层不需要依赖 `bcrypt`，职责更清楚。

## 2.3 接口

**在 `src/routes/tenant.js` 里加：**

```js
const bcrypt = require('bcryptjs');
const { getLimit } = require('../billing/plans');
const { withTenant } = require('../db/tenant-db');

router.post('/members', async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const role = req.body.role === 'admin' ? 'admin' : 'member';

  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员能加人' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不对' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '初始密码至少 8 位' });
  }

  const limit = getLimit(req.tenant.plan, 'members');
  const hash = await bcrypt.hash(password, 10);

  try {
    const result = await withTenant(req.tenant.id, async (db) => {
      const current = await db.users.count();

      if (limit !== null && current + 1 > limit) {
        return { overLimit: true, current, limit };
      }

      const user = await db.users.create(email, hash, role);
      return { user, current: current + 1, limit };
    });

    if (result.overLimit) {
      return res.status(402).json({
        error: `当前套餐最多 ${result.limit} 人，现在已有 ${result.current} 人`,
        upgrade: '/api/tenant/plan',
      });
    }

    res.status(201).json({ user: result.user, used: result.current, limit: result.limit });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: '这个邮箱已经在本公司里了' });
    }
    next(err);
  }
});

router.get('/members', async (req, res, next) => {
  try {
    const rows = await withTenant(req.tenant.id, (db) => db.users.list());
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
```

**注意 `count()` 和 `create()` 在同一个 `withTenant` 里，也就是同一个事务。**

**这是必要的：** 两个人同时邀请成员，都读到 `current = 9`，上限 10，两个都放行 → 变成 11 人。

**和上一节的配额扣减是同一个问题。** 严格的做法是把"数人数 + 插入"变成一条原子 SQL（或者用 `select ... for update` 锁住租户行）。

**这一节用事务 + 串行化隔离级别就够了：**

```js
await client.query('begin isolation level serializable');
```

**改在 `withTenant` 里，会影响所有请求。** 所以更合适的做法是给"加人"这一处单独写一个原子方法。

**先记住这个隐患，第 25 周做支付时会用到真正的解决方式。** 现在你要能说出"这里有并发问题"，而不是以为它没问题。

**第 163 节说"注册时不会撞 `(tenant_id, email)`，因为租户是新建的"。现在不一样了：**

```text
已有 zhang@abc.com
再加一次 zhang@abc.com → 同一个租户，唯一约束生效 → 23505
```

**这就是为什么 `unique (tenant_id, email)` 是对的：同公司内不能重复，不同公司之间互不影响。**

## 2.4 自检点

**免费版 `members: 1`。注册时那个人占掉了 1 个。**

**所以免费版加第 2 个人应该直接被拦：**

```text
curl -X POST http://localhost:3000/api/tenant/members -b cookies.txt -H "Content-Type: application/json" -d "{\"email\":\"x@x.com\",\"password\":\"12345678\"}"
```

**返回：**

```json
{"error":"当前套餐最多 1 人，现在已有 1 人","upgrade":"/api/tenant/plan"}
```

**这里有个设计问题要想清楚：**

```text
注册时第一个人算不算"1 人"？
```

**算。** 因为 `members: 1` 的意思是"这个套餐只能有 1 个账号"，那第一个人用掉了。

**但这样免费版客户根本没法邀请别人试用你的产品——这可能会降低转化。**

**更常见的做法：免费版 `members: 2`（自己 + 1 个同事）。**

**这个数字不该由技术决定，该由你的定价决定。** 你现在只是要保证"改那个数字，行为跟着变"。

---

# 第 3 步：数据导出（25 分钟）

## 3.1 为什么这是必须做的

**三个原因，一个比一个硬：**

```text
① 法律：客户的业务数据属于客户。他不续费要走，你有义务返还
② 商业：客户换系统最怕"数据搬不走"。你敢让他搬走，他反而更愿意留下
③ 自保：他在群里喊"你扣着我的数据"，你百口莫辩
```

**第三条最要命。** 一个客户在行业群里说这句话，你半年白干。

## 3.2 先在仓储层加 `exportAll`

**路由里不能出现 `db.client.query`（第 165 节的检查脚本会拦）。给 `src/db/tenant-db.js` 的 `createRepo` 加一个方法：**

```js
    exportAll() {
      return (async () => {
        const convs = await client.query(
          `select id, title, created_at from conversations
           where tenant_id = $1 order by created_at`,
          [tenantId]
        );
        const msgs = await client.query(
          `select id, conversation_id, role, content, created_at from messages
           where tenant_id = $1 order by created_at`,
          [tenantId]
        );
        const fileRows = await client.query(
          `select id, name, size, created_at from files
           where tenant_id = $1 order by created_at`,
          [tenantId]
        );
        const userRows = await client.query(
          `select id, email, role, created_at from users
           where tenant_id = $1 order by created_at`,
          [tenantId]
        );

        return {
          users: userRows.rows,
          conversations: convs.rows,
          messages: msgs.rows,
          files: fileRows.rows,
        };
      })();
    },
```

**四条查询全都带 `tenant_id = $1`，而且这个 `$1` 来自闭包，调用方传不进来。**

**导出这种"一次查多张表"的接口，是最容易漏条件的地方。放进仓储层，一次写对，以后不用再想。**

## 3.3 接口

**在 `src/routes/tenant.js` 里加：**

```js
router.get('/export', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能导出数据' });
  }

  try {
    const data = await withTenant(req.tenant.id, (db) => db.exportAll());

    const payload = {
      exported_at: new Date().toISOString(),
      tenant: { id: req.tenant.id, name: req.tenant.name, plan: req.tenant.plan },
      note: '文件内容不在此文件中，请单独联系服务方获取',
      ...data,
    };

    const filename = 'export-' + new Date().toISOString().slice(0, 10) + '.json';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
});
```

**注意那三行响应头。**

```text
Content-Disposition: attachment   → 浏览器直接下载，不在页面里显示
filename 带日期                    → 客户下三次不会互相覆盖
note 说明文件内容不含二进制       → 提前把话说清
```

## 3.4 一个必须说的限制

**这个接口一次性把所有数据读进内存。**

```text
1000 条消息     → 几百 KB，没问题
50 万条消息     → 几百 MB，Node 进程可能直接 OOM 崩掉
```

**客户数据大的时候要改成流式输出**（一边查一边写，不全部读进内存），做法是 `pg-query-stream` 或者游标分批。

**这节课不做，但你要在代码里留一句：**

```js
// TODO 数据量大时（>10 万条）改成游标分批输出，见第 22 周性能优化
```

**留 TODO 不是偷懒，是把"我知道这里有问题"写下来。** 不留的话，半年后你自己都会以为它是完好的。

## 3.5 自检点

```text
curl -o export.json http://localhost:3000/api/tenant/export -b cookies.txt
```

**打开 `export.json`，检查三件事：**

```text
① 里面的 tenant.id 是你的租户
② conversations 里只有你自己的对话
③ 没有别的租户的任何痕迹
```

**第三条最重要。** 导出接口是最容易漏租户条件的地方——**它一次查五张表，漏一张就是一次批量泄露。**

---

# 第 4 步：注销与恢复（25 分钟）

## 4.1 为什么不能直接删

**客户点"注销"，你的代码跑 `delete from tenants`。**

**如果他是误点的呢？** 或者他点完之后第二天想起来还有东西要拷？

**数据没了就是没了。** 这件事的后果不是技术问题，是**法律和口碑问题**。

## 4.2 三个状态的转换

```text
active         正常使用
pending_delete 已申请注销，30 天内可恢复，数据还在但接口全拒
deleted        已物理删除，不可恢复
```

**注意 `pending_delete` 期间所有接口返回 403，但登录还能进——不然客户没法点"恢复"。**

## 4.3 注销接口

```js
router.post('/delete-request', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能申请注销' });
  }

  const confirm = (req.body.confirm || '').trim();

  if (confirm !== req.tenant.name) {
    return res.status(400).json({
      error: '请输入公司名称确认',
      hint: '要输入：' + req.tenant.name,
    });
  }

  await pool.query(
    "update tenants set status = 'pending_delete', deleted_at = now() where id = $1",
    [req.tenant.id]
  );

  res.json({
    ok: true,
    message: '已提交注销申请，30 天内可恢复',
    purgeAfter: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    export: '/api/tenant/export',
  });
});
```

**为什么要客户手打公司名：**

```text
弹一个"确定吗？"→ 人闭着眼睛点确定
打公司名        → 必须看着屏幕，必须想一下
```

**这个交互设计能挡掉 90% 的误操作。** 大厂删仓库也是这个套路（让你打仓库名）。

## 4.4 恢复接口

**注意：`pending_delete` 状态下 `tenant` 中间件会返回 403，恢复接口会进不去。**

**所以恢复接口不能挂 `tenant` 中间件，只能挂 `auth`。**

**在 `src/server.js` 里，把它挂在另一组路由上：**

```js
const restoreRoutes = require('./routes/restore');
app.use('/api/tenant', restoreRoutes);
```

**新建 `src/routes/restore.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

router.post('/restore', auth, async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能恢复' });
  }

  try {
    const { rows } = await pool.query(
      "select id, name, status, deleted_at from tenants where id = $1",
      [req.user.tenant_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '租户不存在' });
    }

    if (rows[0].status !== 'pending_delete') {
      return res.status(400).json({ error: '当前状态不需要恢复', status: rows[0].status });
    }

    const days = (Date.now() - new Date(rows[0].deleted_at).getTime()) / 86400000;
    if (days > 30) {
      return res.status(410).json({ error: '已超过 30 天恢复期' });
    }

    await pool.query(
      "update tenants set status = 'active', deleted_at = null where id = $1",
      [rows[0].id]
    );

    res.json({ ok: true, message: '已恢复', name: rows[0].name });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**注意 `410`。** 410 是 "Gone"，意思是"这个东西曾经存在，现在永久没了"。比 404 更准确。

**这种细节没人在意，但你写的时候会想清楚"这个资源到底是什么状态"，这才是写对代码的前提。**

## 4.5 清理脚本

**新建 `scripts/purge.js`：**

```js
const pool = require('../src/db/pool');

(async () => {
  const dryRun = !process.argv.includes('--run');

  const { rows } = await pool.query(
    `select id, name, deleted_at,
            now() - deleted_at as age
     from tenants
     where status = 'pending_delete'
       and deleted_at < now() - interval '30 days'
     order by deleted_at`
  );

  if (rows.length === 0) {
    console.log('没有需要清理的租户');
    await pool.end();
    return;
  }

  console.log('待清理：');
  rows.forEach((r) => console.log('  ', r.name, r.id, '提交于', r.deleted_at));

  if (dryRun) {
    console.log('\n这是预演，没有删任何东西。确认要删就加 --run');
    await pool.end();
    return;
  }

  for (const r of rows) {
    await pool.query('delete from tenants where id = $1', [r.id]);
    console.log('已删除', r.name);
  }

  await pool.end();
})();
```

**跑：**

```text
node scripts/purge.js          # 只看不删
node scripts/purge.js --run    # 真删
```

**`--dry-run` 是必须有的。**

**所有会删数据的脚本，默认行为都必须是"只看不删"，真删要显式加参数。** 这条规矩能救你一次——**在生产库上少打一个 `--run` 不会出事，多打一个会。**

## 4.6 自检点

**完整走一遍流程：**

```text
1. 申请注销（输错公司名）→ 400，提示要输什么
2. 申请注销（输对公司名）→ 200，返回 purgeAfter
3. 再请求 /api/conversations → 403，带 restore 提示
4. 调 /api/tenant/restore → 200
5. 再请求 /api/conversations → 200
6. node scripts/purge.js → "没有需要清理的租户"
```

**六步都过，说明生命周期闭环了。**

**中间第 3 步那个 403 特别重要：** 如果它返回 200，说明你的 `tenant` 中间件没检查 `pending_delete`。

---

# 第 5 步：交付前的十条（20 分钟）

**下面是给真实客户开通之前必须过的十条。这不是技术清单，是"能不能收钱"的清单。**

## 5.1 十条检查

```text
一、npm run check 通过
    路由里没有裸 SQL，没有从请求读 tenant

二、npm test 九条全绿
    拿客户 A 的身份打客户 B，全部失败

三、.env 不在 Git 里
    搜一遍 GitHub 仓库，确认没有密码和密钥

四、数据库每天有备份，并且恢复过一次
    没恢复过的备份等于没有备份（第 32 周细讲）

五、JWT_SECRET 是随机的，不是 "secret"
    跑 node -e "..." 生成过

六、注册、登录、加人、导出、注销五条流程都手工走过一遍
    每条都看过数据库里的结果，不是只看接口返回

七、配额数字和报价单一致
    报价单写"1000 条消息"，代码里就是 1000，不能是 200

八、客户知道自己的数据存在哪里
    一句话能说清：存在某某云数据库，地区某某

九、客户知道导出的入口在哪
    把 /api/tenant/export 写进交付文档，或者做成界面按钮

十、你自己能用客户的身份完整走一遍
    不是用你自己的测试账号，是用他给你的那个
```

## 5.2 第十条为什么单列

**因为前面九条都是你按自己的理解验收的，第十条是站在客户的位置验收。**

```text
用他的邮箱注册
用他的网络（不是你的内网）
用他的电脑（不是装了各种环境的开发机）
用他的说法试一遍（"我想把上个月的东西导出来发给合伙人"）
```

**你会发现至少一个问题。** 通常是这种：

```text
❌ 注册要验证邮箱，但你的邮件进垃圾箱了
❌ 导出按钮在设置页第三层，客户找不到
❌ 手机上看表格，列全挤在一起
```

**这些问题测不出来，只有真的当一次客户才看得见。**

## 5.3 写一份交付说明

**给客户的东西不要只有账号密码。一份一页的说明：**

```markdown
# XX 系统交付说明

## 你的入口
网址：
账号：（客户自己的邮箱）
初始密码：（让他自己改）

## 你能做什么
一句话说清这个系统解决他什么问题

## 数据在哪
存在 XX 云数据库，地区 XX，每天自动备份

## 怎么导出数据
设置 → 数据导出，会下载一个 json 文件

## 出问题找谁
微信 / 电话 / 邮箱

## 计费
套餐、额度、怎么升级
```

**这份东西花你二十分钟，能省掉后面二十次微信问答。**

**而且它是专业感最便宜的来源。** 客户收到一份排版清楚的说明，对你的信任度直接上一个台阶——**比你代码写得好不好重要得多，因为他看不懂代码。**

---

# 第 6 步：这一周的总验收

## A. 架构层面

- [ ] 我能画出 `tenants → users → conversations → messages` 和 `files` 的关系
- [ ] 我能说出三种隔离方案的取舍，以及为什么选共享库
- [ ] 我知道什么时候该给大客户单独部署

## B. 数据层面

- [ ] 每张业务表都有 `tenant_id not null`
- [ ] 每个唯一约束都带 `tenant_id`
- [ ] `messages` 用的是复合外键
- [ ] 迁移能重复跑，全在 `migrations/` 里按编号排好

## C. 代码层面

- [ ] `src/routes/` 里没有 `pool.query`
- [ ] 所有查询走 `withTenant`
- [ ] RLS 在四张核心表上 `enable` + `force`
- [ ] `npm run check` 绿

## D. 测试层面

- [ ] `npm test` 九条全绿
- [ ] 我破坏过两次（删 `force`、删租户条件），都看到测试变红
- [ ] `race.js` 跑出过超卖，也跑出过不超卖
- [ ] `reconcile.js` 差额为 0

## E. 生命周期

- [ ] 注册 → 自动建租户 + owner
- [ ] 加人受 `members` 配额限制，超了返回 402
- [ ] 导出能下载 json，里面没有别人的数据
- [ ] 注销要输公司名，30 天内能恢复
- [ ] `purge.js` 默认不删，加 `--run` 才删

## F. 商业层面

- [ ] 我知道三档套餐的价格和额度
- [ ] 十条交付检查我能背下来（至少记得哪几条最容易漏）
- [ ] 我写了一份交付说明（哪怕只有一个客户）

## 提交

```text
git add -A
git commit -m "第168节课: 试用期 + 邀请成员 + 导出 + 注销恢复 + 交付清单"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `column "trial_ends_at" does not exist` | 007 迁移没跑 | `npm run migrate` |
| 所有人的试用期被重置了 | 迁移里的 `update` 没写 `where trial_ends_at is null` | 加上条件；这次要手工修数据 |
| 付费客户也被判"试用到期" | 判断写成了只看 `trial_ends_at` | 加 `t.plan === 'free'` 条件 |
| 加人一直 402，但只有自己一个人 | 配额是 `members: 1`，第一个人已经占了 | 改成 2，或者把这 1 个名额定义成"额外成员" |
| `duplicate key value violates unique constraint "users_tenant_id_email_key"` | 同一公司重复邮箱 | 返回 409，提示已经在了 |
| 导出文件是空的 | `withTenant` 里没设上下文，RLS 拦了 | 检查 `set_config` |
| 导出很慢，进程崩了 | 一次读全部进内存 | 改游标分批，或者先只导近 90 天 |
| 注销后还能访问接口 | `tenant` 中间件没判断 `pending_delete` | 补上，返回 403 |
| 恢复接口进不去 | 它挂了 `tenant` 中间件，被 403 拦了 | 只挂 `auth` |
| `purge.js` 直接删了数据 | 没做 dry-run | 所有删除脚本默认只看，显式 `--run` 才删 |
| `410` 是什么 | 资源曾经存在，现在永久没了 | 恢复期超了就用它 |

---

## 这一周要能说出口的一句话

> **多租户不是一个功能，是一条贯穿表结构、中间件、查询、测试和交付流程的约束；做对了客户感觉不到，做错了客户会带着数据离开。**

---

## 下一步

第 25 周：**Excel、支付、对账。**

这一周建好的 `tenant_quotas` 和 `usage_events` 下周会直接用来算钱。**你会看到"流水表和汇总表"这个设计在对账时怎么救命。**
