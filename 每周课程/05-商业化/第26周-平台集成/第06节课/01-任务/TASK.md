# 第 181 节课：把平台当数据源

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前面五节都在"接"平台推来的东西。这节课反过来：**你主动去拉平台的数据——通讯录、审批、文档。**
> 拉和推的容错策略完全不同：推要"快 + 幂等"，拉要"稳 + 能断点续传 + 不重复"。

**建议用时**：180 分钟（7 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—3 步（105 分钟）一次，第 4—6 步（75 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 180 节（卡片能发能点，审批能改状态）

---

# 第 0 步：拉数据比推数据更麻烦（20 分钟）

## 0.1 五个新问题

**推数据（第 178—180 节）你只需要处理"来了一条"。**

**拉数据要处理五件事：**

```text
① 分页          一个部门 3000 人，一次只给你 100 个
② 增量          第二次拉，怎么只拉变化的部分
③ 删除          平台上删了一个人，你怎么知道
④ 限流          拉太快会被限流，要退避
⑤ 全量 vs 增量  第一次全量，之后增量，偶尔要重新全量
```

**这五个问题，每一个都能让"同步"这件事出错。**

## 0.2 最重要的一条：**先写"对账"，再写"同步"**

**很多人写同步是这样的：**

```js
for (const platformUser of platformUsers) {
  await upsertLocal(platformUser);
}
```

**跑完之后，本地有 300 个用户，平台上有 305 个。**

**那 5 个在哪？** **你不知道。**

**为什么少：**

```text
① 平台删了 5 个人 → 你没删（本地多 5 个，不是少）
② 某个部门的分页没拉完
③ 某次 API 调用失败了，你 catch 住了继续跑
④ 有人改了名字，你的唯一键匹配不上，当成新用户插了一条
```

**正确的顺序：**

```text
① 拉全量（记下"这次拉到 N 个"）
② 和本地比对
③ 算出：新增 X 个、更新 Y 个、本地需要标记删除 Z 个
④ 显示这个报告，让你确认
⑤ 才执行写入
```

**这就是"对账式同步"。**

**为什么先算再写：** 因为**同步出错比不同步更糟**。**你把人删错了、把权限改错了，客户会立刻发现。**

## 0.3 这一节要建的四样东西

```text
① platform_contacts 表（平台身份 → 本地用户）
② 分页拉取器（带限流退避）
③ 对账报告（新增/更新/缺失）
④ 同步执行（幂等 upsert + 软删除）
```

---

# 第 1 步：联系人映射表（25 分钟）

## 1.1 建表

**新建 `migrations/019_platform_contacts.sql`：**

```sql
create table platform_contacts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  platform       text not null check (platform in ('feishu', 'wecom', 'dingtalk')),
  platform_uid   text not null,
  union_id       text,
  email          text,
  mobile         text,
  name           text,
  department_ids text[] not null default '{}',
  job_title      text,
  avatar_url     text,
  status         text not null default 'active'
                 check (status in ('active', 'inactive', 'deleted')),
  local_user_id  uuid references users(id) on delete set null,
  raw            jsonb,
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (tenant_id, platform, platform_uid)
);

create index platform_contacts_lookup_idx
  on platform_contacts (tenant_id, platform, platform_uid);

create index platform_contacts_email_idx
  on platform_contacts (tenant_id, lower(email));

create index platform_contacts_local_idx
  on platform_contacts (local_user_id) where local_user_id is not null;

alter table platform_contacts enable row level security;
alter table platform_contacts force row level security;

create policy tenant_isolation on platform_contacts
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

## 1.2 六个字段要讲清

### `unique (tenant_id, platform, platform_uid)`

**这是第 176 节就强调过的那条：必须带 `platform`。**

**因为同一个人：**

```text
飞书    open_id = "ou_abc123"
企微    userid  = "zhangsan"
钉钉    userid  = "123456"
```

**三个完全不同的字符串。如果主键只有 `(tenant_id, platform_uid)`，接第二家平台会覆盖第一家。**

### `union_id` 单独一列

**飞书有三个 id：**

```text
open_id   应用内唯一（同一个用户，不同应用不同 open_id）
union_id  开发者内唯一（同一个开发者，所有应用相同）
user_id   企业内唯一（同一个企业相同）
```

**为什么要存 `union_id`：**

**如果你以后建了第二个飞书应用（比如一个内部管理应用），`open_id` 会变，但 `union_id` 不变。**

**存了 `union_id`，你就能跨应用识别同一个人。**

**现在不用，但加一列的成本是零。** **不加，以后要重新同步一遍。**

### `local_user_id` 可以为 null

**因为分两种情况：**

```text
平台上有这个人，但你系统里还没有 → local_user_id = null（待邀请）
平台上有，你系统里也有          → local_user_id = 指向 users.id
```

**为 null 的怎么办：**

**你的业务代码要能处理"这个人还没有本地账号"。** **比如审批卡片上，点击者的 `open_id` 找不到 `local_user_id`——** **那就按"未知用户"处理，或者自动邀请。**

**这一节先只建映射，不做自动邀请。**

### `raw` 存原始 JSON

**因为平台的字段会变。**

**如果平台某天加了一个"职位"字段，你想用它，但你的表里没有——** **有 `raw` 就能拿到，不用重新同步。**

**代价是存储。** **一个人 2KB，1000 人 2MB。可以接受。**

### `status` 三个值

```text
active    正常
inactive  平台标记为停用（离职、休假）
deleted   平台上已经删了
```

**为什么不直接删行：**

**因为"这个人三个月前还是员工，那段时间的审批是他批的"。** **删掉映射，历史记录就断链了。**

**所以用 `status` 软删除。** **这是所有"人员/组织"数据的通用做法。**

### `department_ids` 用数组

**多平台、多部门的情况：**

```text
飞书  一个人可以在多个部门
企微  一个部门（主部门）
钉钉  一个部门
```

**用 `text[]` 存所有部门 id。**

**查询：**

```sql
select * from platform_contacts
where tenant_id = $1 and 'od_xxx' = any(department_ids);
```

**这个语法（`= any(数组)`）第 170 节用过，很好用。**

---

# 第 2 步：给假平台加通讯录（25 分钟）

## 2.1 加数据

**在 `scripts/mock-platform.js` 里加：**

```js
const departments = [
  { department_id: 'od_root', name: '模拟公司', parent_id: null },
  { department_id: 'od_mkt', name: '市场部', parent_id: 'od_root' },
  { department_id: 'od_dev', name: '技术部', parent_id: 'od_root' },
  { department_id: 'od_fin', name: '财务部', parent_id: 'od_root' },
];

const contacts = [];

for (let i = 1; i <= 137; i++) {
  const dept = departments[1 + (i % 3)];
  contacts.push({
    open_id: 'ou_user_' + String(i).padStart(3, '0'),
    union_id: 'on_union_' + String(i).padStart(3, '0'),
    user_id: 'uid_' + String(i).padStart(3, '0'),
    name: '员工' + String(i).padStart(3, '0'),
    email: 'user' + i + '@mock-company.com',
    mobile: '138' + String(10000000 + i).slice(-8),
    job_title: i % 3 === 0 ? '工程师' : i % 3 === 1 ? '专员' : '经理',
    department_ids: ['od_root', dept.department_id],
    status: i % 37 === 0 ? 'inactive' : 'active',
  });
}
```

**137 个人，故意用奇数——这样分页会有一段"不完整"的最后一页。**

**这是故意的：** **如果总人数正好是每页的整数倍，你永远测不出"最后一页不满"的 bug。**

## 2.2 分页接口

```js
app.get('/open-apis/contact/v3/users', (req, res) => {
  const v = verifyToken(req);
  if (!v.ok) return res.status(401).json({ code: v.code, msg: v.msg });

  const pageSize = Math.min(Number(req.query.page_size) || 50, 100);
  const pageToken = req.query.page_token || '';
  const departmentId = req.query.department_id;

  let list = contacts;

  if (departmentId) {
    list = contacts.filter((c) => c.department_ids.includes(departmentId));
  }

  const start = pageToken ? Number(Buffer.from(pageToken, 'base64').toString('utf8')) : 0;
  const slice = list.slice(start, start + pageSize);
  const nextStart = start + pageSize;

  const hasMore = nextStart < list.length;

  console.log(
    `[mock-platform] 拉通讯录 page_size=${pageSize} start=${start} → ${slice.length} 条`
  );

  res.json({
    code: 0,
    msg: 'ok',
    data: {
      has_more: hasMore,
      page_token: hasMore ? Buffer.from(String(nextStart), 'utf8').toString('base64') : '',
      items: slice.map((c) => ({
        open_id: c.open_id,
        union_id: c.union_id,
        user_id: c.user_id,
        name: c.name,
        email: c.email,
        mobile: c.mobile,
        job_title: c.job_title,
        department_ids: c.department_ids,
        status: c.status === 'active' ? 'activated' : 'deactivated',
      })),
    },
  });
});

app.get('/open-apis/contact/v3/departments', (req, res) => {
  const v = verifyToken(req);
  if (!v.ok) return res.status(401).json({ code: v.code, msg: v.msg });

  res.json({
    code: 0,
    msg: 'ok',
    data: { items: departments },
  });
});

app.post('/mock/rate-limit/next', (req, res) => {
  const times = Number(req.body.times || 2);
  rateLimitNext = times;
  res.json({ ok: true, times });
});

let rateLimitNext = 0;
```

**注意 `rateLimitNext` 的声明要放在使用之前。**

**把它挪到文件顶部（`let rateLimitNext = 0;` 放在 `const contacts = [];` 下面）。**

**然后在通讯录接口开头加限流模拟：**

```js
if (rateLimitNext > 0) {
  rateLimitNext -= 1;
  console.log('[mock-platform] 故意返回限流 429');
  return res.status(429).json({ code: 99991400, msg: 'request trigger frequency limit' });
}
```

**加在 `verifyToken` 之后、取数据之前。**

## 2.3 四个设计点

### `page_token` 用 base64 编码的偏移量

**真实平台用的是不透明 token（内部可能是 cursor）。**

**用 base64 编码偏移量，让它看起来像 token——** **这样你就不会想去"自己算下一页"（真实平台不允许）。**

**这个约束很重要：** **你必须老老实实传 `page_token`，不能自己拼 `page=2`。**

### `has_more` 和 `page_token` 两个字段都要

**只用 `has_more` 不知道下一页从哪开始。**
**只用 `page_token` 不知道还有没有下一页（空字符串是"没有"还是"最后一页"？）。**

**两个都要。这是分页接口的标配。**

### `page_size` 上限 100

**真实飞书的上限是 50（通讯录）或 100（群成员）。**

**这里定 100，但代码应该用 50——** **因为真实平台不会给你 100。**

**这一节用 `page_size = 50`。** **137 个人 → 3 页（50+50+37）。**

### `99991400` 这个限流码

**飞书的限流错误码是 `99991400`。**

**记住它。你的重试逻辑要能识别这个码，然后退避。**

---

# 第 3 步：写拉取器（35 分钟）

## 3.1 带限流退避的分页拉取

**新建 `src/integrations/contacts.js`：**

```js
const { callPlatform } = require('../platform/client');

const RATE_LIMIT_CODES = new Set([99991400, 45009, 45033]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllPages(tenantId, platform, path, buildQuery = () => ({})) {
  const all = [];
  let pageToken = '';
  let page = 0;
  const maxPages = 500;

  while (page < maxPages) {
    page += 1;

    const query = { ...buildQuery(), page_size: 50, ...(pageToken ? { page_token: pageToken } : {}) };
    const qs = new URLSearchParams(query).toString();
    const fullPath = path + (qs ? '?' + qs : '');

    let attempt = 0;
    let data = null;

    while (attempt < 6) {
      attempt += 1;

      try {
        const res = await callPlatform(tenantId, platform, fullPath, { method: 'GET' });

        if (RATE_LIMIT_CODES.has(res.code)) {
          const waitMs = Math.min(30000, Math.pow(2, attempt) * 1000) + Math.floor(Math.random() * 1000);
          console.warn(
            `[contacts] 被限流，第 ${attempt} 次退避 ${waitMs}ms（第 ${page} 页）`
          );
          await sleep(waitMs);
          continue;
        }

        if (res.code !== 0) {
          throw new Error('拉取失败 code=' + res.code + ' ' + res.msg);
        }

        data = res.data;
        break;
      } catch (err) {
        if (attempt >= 6) throw err;

        const waitMs = Math.min(15000, Math.pow(2, attempt) * 500);
        console.warn(`[contacts] 请求失败，${waitMs}ms 后重试：${err.message}`);
        await sleep(waitMs);
      }
    }

    if (!data) {
      throw new Error('拉取第 ' + page + ' 页重试 6 次仍失败');
    }

    const items = data.items || [];
    all.push(...items);

    console.log(
      `[contacts] 第 ${page} 页：${items.length} 条，累计 ${all.length}，has_more=${data.has_more}`
    );

    if (!data.has_more) break;

    if (!data.page_token) {
      throw new Error('has_more 是 true 但没有 page_token，接口异常');
    }

    pageToken = data.page_token;

    await sleep(120);
  }

  return all;
}

async function fetchContacts(tenantId, platform) {
  const items = await fetchAllPages(tenantId, platform, '/open-apis/contact/v3/users');

  return items.map((u) => ({
    platformUid: u.open_id,
    unionId: u.union_id || null,
    userId: u.user_id || null,
    name: u.name || '',
    email: u.email || null,
    mobile: u.mobile || null,
    jobTitle: u.job_title || null,
    departmentIds: u.department_ids || [],
    status: u.status === 'deactivated' ? 'inactive' : 'active',
    raw: u,
  }));
}

async function fetchDepartments(tenantId, platform) {
  return fetchAllPages(tenantId, platform, '/open-apis/contact/v3/departments');
}

module.exports = { fetchContacts, fetchDepartments, fetchAllPages };
```

## 3.2 五个关键点

### 三层循环，每层管一件事

```text
while (page < maxPages)        外层：翻页
  while (attempt < 6)          中层：单页重试（含限流）
    await callPlatform          内层：一次请求
```

**分开写的好处：**

```text
限流 → 退避后重试这一页，不影响已拉到的数据
翻页 → 只关心 page_token
```

**混在一起写会一团糟：** **"重试的时候要不要重新翻页？"**

### 限流退避和错误退避不一样

```js
// 限流：等更久（2^n 秒，最多 30 秒）
const waitMs = Math.min(30000, Math.pow(2, attempt) * 1000) + jitter;

// 错误：等短一些（2^n 半秒，最多 15 秒）
const waitMs = Math.min(15000, Math.pow(2, attempt) * 500);
```

**为什么：**

```text
限流  → 平台明确说"你太快了"，等久一点才有用
错误  → 可能是网络抖动，等一下就好
```

**如果限流也用短退避，你会一直撞在限流的墙上。**

### 限流重试 6 次，错误也重试 6 次

**为什么要 6 次：**

```text
第 1 次：1 秒
第 2 次：2 秒
第 3 次：4 秒
第 4 次：8 秒
第 5 次：16 秒
第 6 次：32 秒（被上限截到 30）
```

**总共约 61 秒。真实平台的限流窗口通常是"每分钟 N 次"，60 秒足够过去。**

**只试 3 次（1+2+4=7 秒）是不够的。**

### `has_more` 和 `page_token` 都要检查

```js
if (!data.has_more) break;
if (!data.page_token) throw new Error('has_more 是 true 但没有 page_token，接口异常');
```

**第二个检查很重要。**

**如果平台返回 `has_more: true` 但 `page_token` 是空，你会在下一页拿到同样的数据——** **无限循环，直到 `maxPages`。**

**`maxPages = 500` 是你的最后保险。** **500 × 50 = 25000 人，超过这个数说明有 bug。**

### 页间 120ms 间隔

```js
await sleep(120);
```

**这是主动限速。**

**别等被限流了才退避——** **提前慢一点，比被踢回来再等 30 秒快得多。**

**120ms × 3 页 = 360ms，拉 137 个人总共 0.4 秒。** **完全可以接受。**

**这个数字要根据平台的限额算：**

```text
飞书通讯录：约 50 次/秒
保守取 8 次/秒 → 125ms
```

## 3.3 自检点

**新建 `scripts/contacts-fetch.js`：**

```js
const pool = require('../src/db/pool');
const { fetchContacts, fetchDepartments } = require('../src/integrations/contacts');

(async () => {
  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  const tenantId = t.rows[0].id;

  console.log('== 拉部门 ==');
  const depts = await fetchDepartments(tenantId, 'feishu');
  console.log('部门数：', depts.length);
  depts.forEach((d) => console.log('  ', d.department_id, d.name));

  console.log('\n== 拉通讯录 ==');
  const started = Date.now();
  const users = await fetchContacts(tenantId, 'feishu');
  console.log('总人数：', users.length, '耗时：', Date.now() - started, 'ms');

  const active = users.filter((u) => u.status === 'active').length;
  console.log('active：', active, 'inactive：', users.length - active);

  console.log('\n前三个：');
  users.slice(0, 3).forEach((u) =>
    console.log('  ', u.platformUid, u.name, u.email, u.status, JSON.stringify(u.departmentIds))
  );

  const byDept = {};
  for (const u of users) {
    for (const d of u.departmentIds) {
      byDept[d] = (byDept[d] || 0) + 1;
    }
  }
  console.log('\n按部门：', byDept);

  await pool.end();
})();
```

**跑：**

```text
node scripts/contacts-fetch.js
```

**期望：**

```text
== 拉部门 ==
部门数： 4
   od_root 模拟公司
   od_mkt 市场部
   od_dev 技术部
   od_fin 财务部

== 拉通讯录 ==
[contacts] 第 1 页：50 条，累计 50，has_more=true
[contacts] 第 2 页：50 条，累计 100，has_more=true
[contacts] 第 3 页：37 条，累计 137，has_more=false
总人数： 137 耗时： 420ms
active： 133 inactive： 4
```

**四个数字要核对：**

```text
总人数 137           ✓（和假平台造的一致）
三页 50/50/37        ✓（最后一页不满）
inactive 4           ✓（137 里 i%37==0 的有 37、74、111、148→ 实际 37/74/111 三个，加上...）
```

**等一下，`i % 37 === 0` 在 1—137 之间：37、74、111，三个。**

**所以 `inactive` 应该是 3，`active` 是 134。**

**如果你算出来 4，说明假平台造数据的时候我把条件写错了。** **自己核对一下——** **这就是"对数字敏感"的习惯，做数据同步必须养出来。**

**正确答案：`inactive = 3`。**

## 3.4 测限流退避

**先让假平台返回 2 次限流：**

```text
curl -X POST http://localhost:5000/mock/rate-limit/next -H "Content-Type: application/json" -d "{\"times\":2}"
```

**再拉一次：**

```text
node scripts/contacts-fetch.js
```

**期望日志：**

```text
[contacts] 被限流，第 1 次退避 2000ms（第 1 页）
[contacts] 被限流，第 2 次退避 4000ms（第 1 页）
[contacts] 第 1 页：50 条，累计 50，has_more=true
[contacts] 第 2 页：50 条，累计 100，has_more=true
[contacts] 第 3 页：23 条，累计 123，has_more=false
[contacts] 拉取完成：123 条
```

**三页，共 123 条。** **数字对得上就说明分页正确。**

**如果不确定你的平台有多少人，先去管理后台看成员总数——两边应该一样。** **差一个都要查，因为"少一个人"意味着同步完你会少一条映射，那个人从此看不见任何审批。**

**总耗时会多出 6 秒，但最终成功。**

**这就是"退避"的价值：** **多等 6 秒，比"失败重来"好得多。**

---

# 第 4 步：对账报告（40 分钟）

**这是这一节的核心。先算差异，再决定写不写。**

## 4.1 新建 `src/integrations/contacts-sync.js`

```js
const { withTenantFromPool } = require('../db/tenant-db');
const { fetchContacts } = require('./contacts');

async function planSync(tenantId, platform) {
  const remote = await fetchContacts(tenantId, platform);

  const local = await withTenantFromPool(tenantId, async (db) => {
    const { rows } = await db.client.query(
      `select id, platform_uid, email, name, status, local_user_id, synced_at
       from platform_contacts
       where tenant_id = $1 and platform = $2`,
      [tenantId, platform]
    );
    return rows;
  });

  const localByUid = new Map(local.map((r) => [r.platform_uid, r]));
  const remoteByUid = new Map(remote.map((r) => [r.platformUid, r]));

  const toInsert = [];
  const toUpdate = [];
  const toDeactivate = [];
  const unchanged = [];

  for (const r of remote) {
    const l = localByUid.get(r.platformUid);

    if (!l) {
      toInsert.push(r);
      continue;
    }

    const changed =
      l.email !== r.email ||
      l.name !== r.name ||
      l.status !== r.status;

    if (changed) {
      toUpdate.push({ before: l, after: r });
    } else {
      unchanged.push(r);
    }
  }

  for (const l of local) {
    if (!remoteByUid.has(l.platform_uid) && l.status !== 'deleted') {
      toDeactivate.push(l);
    }
  }

  return {
    platform,
    remoteCount: remote.length,
    localCount: local.length,
    toInsert,
    toUpdate,
    toDeactivate,
    unchangedCount: unchanged.length,
    remote,
  };
}

async function applySync(tenantId, platform, plan) {
  return withTenantFromPool(tenantId, async (db) => {
    let inserted = 0;
    let updated = 0;
    let deactivated = 0;

    if (plan.toInsert.length > 0) {
      const uids = plan.toInsert.map((r) => r.platformUid);
      const emails = plan.toInsert.map((r) => r.email);
      const names = plan.toInsert.map((r) => r.name);
      const mobiles = plan.toInsert.map((r) => r.mobile);
      const depts = plan.toInsert.map((r) => (r.departmentIds || []).join(','));
      const jobs = plan.toInsert.map((r) => r.jobTitle);
      const unions = plan.toInsert.map((r) => r.unionId);
      const statuses = plan.toInsert.map((r) => r.status);

      const res = await db.client.query(
        `insert into platform_contacts
           (tenant_id, platform, platform_uid, union_id, email, mobile, name,
            department_ids, job_title, status)
         select $1, $2, t.uid, t.union_id, t.email, t.mobile, t.name,
                coalesce(string_to_array(nullif(t.depts_str, ''), ','), '{}'::text[]),
                t.job, t.status
         from unnest(
           $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
           $8::text[], $9::text[], $10::text[]
         ) as t(uid, union_id, email, mobile, name, depts_str, job, status)
         on conflict (tenant_id, platform, platform_uid) do nothing
         returning id`,
        [
          tenantId,
          platform,
          uids,
          unions,
          emails,
          mobiles,
          names,
          depts,
          jobs,
          statuses,
        ]
      );

      inserted = res.rowCount;
    }

    for (const item of plan.toUpdate) {
      await db.client.query(
        `update platform_contacts
         set email = $1, name = $2, status = $3, mobile = $4,
             department_ids = $5, job_title = $6, union_id = $7,
             synced_at = now()
         where tenant_id = $8 and platform = $9 and platform_uid = $10`,
        [
          item.after.email,
          item.after.name,
          item.after.status,
          item.after.mobile,
          item.after.departmentIds,
          item.after.jobTitle,
          item.after.unionId,
          tenantId,
          platform,
          item.after.platformUid,
        ]
      );
      updated += 1;
    }

    if (plan.toDeactivate.length > 0) {
      const uids = plan.toDeactivate.map((r) => r.platform_uid);
      const res = await db.client.query(
        `update platform_contacts
         set status = 'deleted', synced_at = now()
         where tenant_id = $1 and platform = $2 and platform_uid = any($3::text[])
         returning id`,
        [tenantId, platform, uids]
      );
      deactivated = res.rowCount;
    }

    return { inserted, updated, deactivated };
  });
}

module.exports = { planSync, applySync };
```

## 4.2 部门数组怎么传：一个真实的坑

**`department_ids` 是 `text[]` 类型，但 `unnest` 只能展开**一维**数组。**

**如果你想让"每个用户带一个 `text[]`"，那就是"数组的数组"（二维）。**

**PostgreSQL 的 `unnest` 多数组形式要求所有参数是同一维度、同一长度的一维数组。**

```sql
-- ❌ 这样不行
from unnest($8::text[][], $9::text[]) as t(depts, job)
-- 报错：malformed array literal 或者维度不匹配
```

**解法：把部门 id 用逗号拼成字符串，插入时再拆回数组。**

```js
const depts = plan.toInsert.map((r) => (r.departmentIds || []).join(','));
```

```sql
coalesce(string_to_array(nullif(t.depts_str, ''), ','), '{}'::text[])
```

**三处细节：**

```text
① nullif(t.depts_str, '')      空字符串 → null
② string_to_array(null, ',')   返回 null（不是空数组）
③ coalesce(..., '{}'::text[])  所以要用 coalesce 兜成空数组
```

**少了第 ③ 步，没有部门的用户会变成 `null`，而列定义是 `not null default '{}'`——会报错。**

**完整写法：**

```sql
insert into platform_contacts
  (tenant_id, platform, platform_uid, union_id, email, mobile, name,
   department_ids, job_title, status)
select $1, $2, t.uid, t.union_id, t.email, t.mobile, t.name,
       coalesce(string_to_array(nullif(t.depts_str, ''), ','), '{}'::text[]),
       t.job, t.status
from unnest(
  $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
  $8::text[], $9::text[], $10::text[]
) as t(uid, union_id, email, mobile, name, depts_str, job, status)
on conflict (tenant_id, platform, platform_uid) do nothing
returning id
```

**参数就是 8 个数组，对应 8 个列。**

**这个坑很典型：** **`unnest` 只能展开一维。想传数组的数组，要用字符串序列化。**

**把这个写进笔记。**

## 4.3 三条判断规则

### 新增：本地没有这个 `platform_uid`

```js
if (!l) toInsert.push(r);
```

**注意用的是 `platform_uid` 判断，不是 email。**

**为什么不用 email：**

```text
员工改邮箱 → 按 email 判断会认为"这是新人"→ 插入重复
员工同名不同人 → 按 name 判断会合并错
```

**`platform_uid` 是平台给的，稳定不变。**

### 更新：只更新"真的变了"的字段

```js
const changed = l.email !== r.email || l.name !== r.name || l.status !== r.status;
```

**为什么要判断：**

**如果不判断，每次都 update 全部行——** **137 个人，每次同步 137 次 UPDATE。** **1000 人就是 1000 次。**

**而且每次 update 都会写 WAL、更新索引、产生死行。**

**"只写变化的"是同步的基本功。**

### 删除：本地有、远程没有的，标记 `deleted`

```js
if (!remoteByUid.has(l.platform_uid) && l.status !== 'deleted') {
  toDeactivate.push(l);
}
```

**注意两个条件：**

```text
① 远程没有这个 uid
② 本地还不是 deleted（避免重复标记）
```

**为什么不 `delete from`：**

**第 1.2 节讲过——历史记录要能追溯。**

## 4.4 对账报告接口

**新建 `src/routes/contacts.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { planSync, applySync } = require('../integrations/contacts-sync');
const { withTenant } = require('../db/tenant-db');

const router = express.Router();
router.use(auth, tenant);

router.get('/preview', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能同步通讯录' });
  }

  try {
    const plan = await planSync(req.tenant.id, 'feishu');

    res.json({
      platform: plan.platform,
      remoteCount: plan.remoteCount,
      localCount: plan.localCount,
      unchanged: plan.unchangedCount,
      willInsert: plan.toInsert.length,
      willUpdate: plan.toUpdate.length,
      willDeactivate: plan.toDeactivate.length,
      samples: {
        insert: plan.toInsert.slice(0, 5).map((r) => ({
          uid: r.platformUid,
          name: r.name,
          email: r.email,
        })),
        update: plan.toUpdate.slice(0, 5).map((u) => ({
          uid: u.after.platformUid,
          name: u.after.name,
          changes: {
            email: u.before.email !== u.after.email
              ? [u.before.email, u.after.email]
              : undefined,
            name: u.before.name !== u.after.name
              ? [u.before.name, u.after.name]
              : undefined,
            status: u.before.status !== u.after.status
              ? [u.before.status, u.after.status]
              : undefined,
          },
        })),
        deactivate: plan.toDeactivate.slice(0, 5).map((r) => ({
          uid: r.platform_uid,
          name: r.name,
          email: r.email,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/apply', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能同步通讯录' });
  }

  try {
    const plan = await planSync(req.tenant.id, 'feishu');
    const result = await applySync(req.tenant.id, 'feishu', plan);

    res.json({
      ok: true,
      ...result,
      remoteCount: plan.remoteCount,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select id, platform_uid, name, email, job_title, status,
                local_user_id, synced_at
         from platform_contacts
         where tenant_id = $1 and platform = $2 and status <> 'deleted'
         order by name
         limit 200`,
        [req.tenant.id, 'feishu']
      );
      return r.rows;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const contactsRoutes = require('./routes/contacts');
app.use('/api/contacts', contactsRoutes);
```

## 4.5 自检点：走完整流程

**一、先看预览（什么都不写）**

```text
curl http://localhost:3000/api/contacts/preview -b cookies.txt
```

**期望：**

```json
{
  "remoteCount": 137,
  "localCount": 0,
  "unchanged": 0,
  "willInsert": 137,
  "willUpdate": 0,
  "willDeactivate": 0,
  "samples": { "insert": [ ... 5 条 ... ] }
}
```

**二、执行**

```text
curl -X POST http://localhost:3000/api/contacts/apply -b cookies.txt
```

**期望：**

```json
{"ok":true,"inserted":137,"updated":0,"deactivated":0,"remoteCount":137}
```

**三、再看预览（应该什么都不用做）**

```text
curl http://localhost:3000/api/contacts/preview -b cookies.txt
```

**期望：**

```json
{
  "remoteCount": 137,
  "localCount": 137,
  "unchanged": 137,
  "willInsert": 0,
  "willUpdate": 0,
  "willDeactivate": 0
}
```

**这个"第二次预览全是 0"就是幂等性的证明。**

**四、改一个名字，再预览**

**在假平台的 `contacts` 里改一个人的名字（或者加一个接口改）：**

**直接改假平台代码，加：**

```js
app.post('/mock/rename-user', (req, res) => {
  const { open_id: openId, name } = req.body;
  const u = contacts.find((c) => c.open_id === openId);
  if (!u) return res.status(404).json({ error: '不存在' });
  u.name = name;
  res.json({ ok: true, open_id: openId, name });
});
```

**重启假平台，改一个：**

```text
curl -X POST http://localhost:5000/mock/rename-user -H "Content-Type: application/json" -d "{\"open_id\":\"ou_user_001\",\"name\":\"改过的名字\"}"
```

**再预览：**

```json
{
  "willUpdate": 1,
  "samples": {
    "update": [{ "uid": "ou_user_001", "name": "改过的名字", "changes": { "name": ["员工001", "改过的名字"] } }]
  }
}
```

**能看到"从什么改成什么"，这就是"对账"的价值。**

**五、删一个人，再预览**

**加接口：**

```js
app.post('/mock/delete-user', (req, res) => {
  const idx = contacts.findIndex((c) => c.open_id === req.body.open_id);
  if (idx < 0) return res.status(404).json({ error: '不存在' });
  contacts.splice(idx, 1);
  res.json({ ok: true, remaining: contacts.length });
});
```

**删一个，再预览：**

```json
{ "willDeactivate": 1, "remoteCount": 136, "localCount": 137 }
```

**注意 `remoteCount` 和 `localCount` 不一样——** **这就是你要看到的信号。**

---

# 第 5 步：故意让同步出错（20 分钟）

**同步最怕的是"悄悄出错"。**

## 5.1 造一个"中途失败"

**改 `applySync`，加一个可选的 `failAfter`。改两处：函数签名，和 update 循环的第一行。**

**只改这两处，函数其余部分（insert 和 deactivate 两段）完全不动。**

**第一处，签名（760 行）：**

```js
async function applySync(tenantId, platform, plan, options = {}) {
```

**第二处，`for (const item of plan.toUpdate) {` 这个循环的第一行（806 行下面）：**

```js
    const failAfter = options.failAfter ?? Infinity;

    for (const item of plan.toUpdate) {
      if (updated >= failAfter) {
        throw new Error('模拟中途失败');
      }

      await db.client.query(
```

**注意 `??` 不是 `||`。**

**写 `options.failAfter || Infinity` 的话，传 `failAfter: 0`（"第一次更新就失败"）会被当成假值，直接变成 `Infinity`——** **你想测"立刻失败"，结果一次都不失败，然后开始怀疑事务没回滚。**

**`??` 只对 `null` / `undefined` 兜底，`0` 是合法值。**

**然后写个脚本，只在第 5 步的验证里用。**

**新建 `scripts/sync-fail-test.js`（这个文件不用提交，验证完可以删）：**

```js
require('dotenv').config();
const { planSync, applySync } = require('../src/integrations/contacts-sync');
const pool = require('../src/db/pool');

(async () => {
  const tenantId = process.argv[2];
  const platform = process.argv[3] || 'feishu';

  if (!tenantId) {
    console.error('用法：node scripts/sync-fail-test.js <tenantId> [platform]');
    process.exit(1);
  }

  const before = await pool.query(
    'select count(*)::int as n from platform_contacts where tenant_id = $1',
    [tenantId]
  );

  console.log('[test] 同步前的条数', before.rows[0].n);

  const plan = await planSync(tenantId, platform);
  console.log('[test] 计划：更新', plan.toUpdate.length, '条');

  try {
    await applySync(tenantId, platform, plan, { failAfter: 1 });
    console.log('[test] 居然成功了？说明 failAfter 没生效');
  } catch (err) {
    console.log('[test] 如预期失败：', err.message);
  }

  const after = await pool.query(
    'select count(*)::int as n from platform_contacts where tenant_id = $1',
    [tenantId]
  );

  console.log('[test] 同步后的条数', after.rows[0].n);
  console.log(
    before.rows[0].n === after.rows[0].n
      ? '[test] ✓ 回滚成功，一条都没写'
      : '[test] ✗ 有数据被写进去了，事务没有包住'
  );

  await pool.end();
})();
```

**跑：**

```text
node scripts/sync-fail-test.js <你的租户id>
```

**期望：**

```text
[test] 同步前的条数 123
[test] 计划：更新 7 条
[test] 如预期失败： 模拟中途失败
[test] 同步后的条数 123
[test] ✓ 回滚成功，一条都没写
```

**然后测试：如果 update 到一半失败，会怎样？**

**关键问题：`applySync` 在 `withTenantFromPool` 里，所以整个是一个事务。**

**中途抛错 → `rollback` → 什么都没写。**

**这就是"要么全成功要么全失败"。**

**验证：**

```sql
select count(*) from platform_contacts where tenant_id = '<id>';
```

**应该还是同步前的数量。**

## 5.2 但事务有个问题

**如果 137 个人里有 1 个数据有问题（比如 name 是 `null`，而你的列是 `not null`），** **整批 137 个都失败。**

**你可能希望"那 1 个跳过，其他 136 个成功"。**

**两个选择：**

```text
方案 A：全有或全无（现在这样）
  ✅ 数据一致性最好
  ❌ 一个坏数据卡住整批

方案 B：逐条处理，记录失败
  ✅ 其他 136 个能同步
  ❌ 需要记录"哪 1 个失败了"
```

**哪个对：**

**对"通讯录同步"这种场景，选 A。**

**为什么：** 因为通讯录数据应该是"全对"的。**如果有 1 个坏了，说明平台数据有问题，你该先修数据，不是跳过。**

**什么时候选 B：** 当"部分成功"是有意义的业务结果时（比如第 170 节的 Excel 导入——客户自己传的文件，错一半也该进一半）。

**这个判断标准：**

```text
数据来自"可信源"（平台）→ 全有或全无（坏数据要修源头）
数据来自"不可信源"（客户上传）→ 部分成功 + 错误清单
```

**写在笔记里。**

## 5.3 一个真实的坑：`null` 字段

**假平台的数据里，`email` 可能是 `null`（有些人没邮箱）。**

**你的表 `email text` 是可空的，没问题。**

**但 `name` 是 `text not null`（我在建表时写了）。**

**如果平台的 `name` 是空字符串 `''`，能插进去（`''` 不是 `null`）。**

**如果是 `null`，插入失败。**

**修：在 `fetchContacts` 里统一处理：**

```js
name: (u.name || '').trim() || u.open_id,
```

**用 `open_id` 兜底。**

**为什么用 `open_id` 而不是"未知用户"：** 因为 `open_id` 至少唯一，能区分出"这是谁"。**填"未知用户"的话，十个空名字变成十个同名的人。**

---

# 第 6 步：把映射接上（15 分钟）

**现在 `local_user_id` 全是 `null`。要把它填上。**

## 6.1 按邮箱匹配

**新建 `scripts/link-contacts.js`：**

```js
const pool = require('../src/db/pool');
const { withTenantFromPool } = require('../src/db/tenant-db');

(async () => {
  const dryRun = !process.argv.includes('--run');

  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  const tenantId = t.rows[0].id;

  const result = await withTenantFromPool(tenantId, async (db) => {
    const links = await db.client.query(
      `with matched as (
         select c.id as contact_id, u.id as user_id
         from platform_contacts c
         join users u
           on u.tenant_id = c.tenant_id
          and lower(u.email) = lower(c.email)
         where c.tenant_id = $1
           and c.local_user_id is null
           and c.email is not null
           and c.status = 'active'
       )
       select count(*)::int as n from matched`,
      [tenantId]
    );

    return { matchable: links.rows[0].n };
  });

  console.log('可以按邮箱匹配上的：', result.matchable, '条');

  if (dryRun) {
    console.log('预演。加 --run 执行。');
    await pool.end();
    return;
  }

  const updated = await withTenantFromPool(tenantId, async (db) => {
    const r = await db.client.query(
      `update platform_contacts c
       set local_user_id = u.id
       from users u
       where u.tenant_id = c.tenant_id
         and lower(u.email) = lower(c.email)
         and c.tenant_id = $1
         and c.local_user_id is null
         and c.email is not null
         and c.status = 'active'
       returning c.id`,
      [tenantId]
    );
    return r.rowCount;
  });

  console.log('已关联：', updated, '条');

  const left = await withTenantFromPool(tenantId, async (db) => {
    const r = await db.client.query(
      `select count(*)::int as n from platform_contacts
       where tenant_id = $1 and local_user_id is null and status = 'active'`,
      [tenantId]
    );
    return r.rows[0].n;
  });

  console.log('还没关联上的：', left, '条（这些人需要邀请，或者邮箱对不上）');

  await pool.end();
})();
```

## 6.2 三个要点

### 用 `lower(email)` 匹配

**因为邮箱不区分大小写。** **`Zhang@ABC.com` 和 `zhang@abc.com` 是同一个人。**

**第 164 节注册时统一小写化了，但平台的数据可能没统一。**

### 只在 `local_user_id is null` 时更新

```sql
and c.local_user_id is null
```

**为什么：**

**已经关联过的不要覆盖。** **因为人工可能手工修正过（比如邮箱一样但是两个人）。**

**"人工优先"是一条重要原则。**

### 只匹配 `status = 'active'` 的

**离职的人不需要关联。**

**如果以后他回来了（`status` 变回 `active`），下次同步会重新关联。**

## 6.3 自检点

**先造一个本地用户，邮箱和平台上的某个人一致：**

```sql
insert into users (tenant_id, email, password_hash, role)
values ('<租户id>', 'user1@mock-company.com', 'x', 'member');
```

**跑：**

```text
node scripts/link-contacts.js
```

**期望：`可以按邮箱匹配上的： 1 条`**

```text
node scripts/link-contacts.js --run
```

**期望：`已关联： 1 条`，`还没关联上的： 133 条`（活跃的总数是 134，减去 1）。**

**这个数字对不上就说明前面某一步错了。**

**"还没关联上的"那 133 个人怎么办：**

**两种做法：**

```text
① 自动邀请（发一封邮件给他们"你的账号已创建"）
② 显示在后台，让客户管理员手工邀请
```

**这一节选 ②。** **因为自动邀请发邮件涉及第 23 节的送达率问题，而且客户可能不想给所有人开账号。**

---

# 第 7 步：最终验收

## A. 表

- [ ] `platform_contacts` 有 `unique (tenant_id, platform, platform_uid)`
- [ ] `union_id` 单独一列
- [ ] `department_ids` 是 `text[]`
- [ ] `status` 三个值（active / inactive / deleted）
- [ ] `raw` 存原始 JSON

## B. 拉取

- [ ] 分页拉完 137 个人（50/50/37）
- [ ] `has_more` 和 `page_token` 都检查了
- [ ] 限流退避（2^attempt 秒，上限 30 秒）
- [ ] 页间 120ms 间隔
- [ ] 限流测试：造 2 次限流能成功绕过

## C. 对账

- [ ] 预览能看到"新增/更新/缺失"三类
- [ ] 能看到"从什么改成什么"
- [ ] 第二次预览全是 0（幂等）
- [ ] 改一个人名字，预览显示 1 条更新
- [ ] 删一个人，预览显示 1 条缺失

## D. 执行

- [ ] `applySync` 在一个事务里
- [ ] 中途失败全部回滚
- [ ] 用 `unnest` 批量插入，不是循环
- [ ] 部门 id 用逗号序列化（`unnest` 不能传二维数组）

## E. 关联

- [ ] 按邮箱匹配能填上 `local_user_id`
- [ ] 只更新 `is null` 的
- [ ] 只有 `active` 的才关联

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"可信源用全有或全无，不可信源用部分成功"
- [ ] 我记下了 `unnest` 不能传二维数组

## 提交

```text
git add -A
git commit -m "第181节课: 通讯录同步 + 分页限流退避 + 对账式同步 + 邮箱关联"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `request trigger frequency limit` | 被限流了 | 退避重试；提前加页间间隔 |
| 只拉到 50 个人 | 没翻页 | 检查 `has_more` 和 `page_token` |
| 无限循环 | `page_token` 一直不变 | 检查平台返回值；加 `maxPages` |
| 每次预览都显示"全部新增" | `platform_uid` 匹配不上 | 检查存的是 `open_id` 还是别的 id |
| 每次预览都显示"全部更新" | 有字段一直在变（比如 `synced_at` 比较了） | 只比较业务字段 |
| `malformed array literal` | `unnest` 传二维数组 | 用逗号拼字符串再 `string_to_array` |
| `null value in column "name"` | 平台返回 null 姓名 | `(u.name \|\| '').trim() \|\| u.open_id` |
| 同步后本地人数比平台多 | 有 `deleted` 的没过滤 | 查询加 `status <> 'deleted'` |
| 关联不上 | 邮箱大小写不一致 | `lower()` 两边都转 |
| 中途失败后数据只写了一半 | 没在事务里 | 检查 `withTenantFromPool` |

---

## 本节课要能说出口的一句话

> **同步的正确姿势是"先算差异、再决定写不写"；直接 upsert 一遍跑完，你永远不知道少的那 5 个人是"被删了"还是"你没拉到"。**
