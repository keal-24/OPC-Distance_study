# 第 194 节课：主动推一条消息

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这一节解决第 26 周没解决的一件事：**客户不会天天打开你的系统，你得能推他一下。**
> 但推送在微信生态里有严格规则，**踩错了会被封号，不是封你的接口，是封你的公众号/小程序。**

**建议用时**：190 分钟（7 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—3 步（110 分钟）一次，第 4—6 步（80 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 193 节（小程序登录能拿到 token）

---

# 第 0 步：三条通道，三种规则（25 分钟）

## 0.1 全景

| 通道 | 能发给谁 | 需要授权吗 | 有次数限制吗 | 资质要求 |
|---|---|---|---|---|
| **小程序订阅消息** | 用过小程序的用户 | **一次授权发一条** | 一次一条 | 个人也能用（类目限制） |
| **公众号模板消息** | 关注公众号的用户 | 关注即可 | 有（但宽松） | 服务号（订阅号不行） |
| **公众号客服消息** | 48 小时内互动过的用户 | 互动即可 | 48 小时内不限 | 服务号/订阅号都行 |

**看第二行和第三行，这是最关键的差别：**

```text
小程序订阅消息：客户点"允许" → 你只能发一条 → 再发要再问
公众号模板消息：关注了 → 能一直发（但有内容限制和频率限制）
```

**第 0.3 节会详细讲订阅消息为什么"一次一条"。**

## 0.2 你的场景该用哪条

```text
"订单状态变了，通知一下客户"    → 小程序订阅消息
"每月经营简报"                 → 公众号模板消息（如果客户关注了）
"客户 3 天没登录，提醒一下"     → 不能用（微信不允许营销骚扰）
"系统告警给管理员"             → 企业微信/飞书（第 26 周做的）
```

**第三条要特别注意：** **"唤醒沉睡用户"在微信生态里是明确禁止的营销骚扰。**

**《微信公众平台运营规范》里写了：** **不得发送与用户操作无关的营销消息。**

**你一旦被举报，先警告，后封号。而封号意味着客户再也收不到你的消息。**

## 0.3 订阅消息为什么"一次一条"

**这是很多人做错的地方。**

**客户在小程序里点"允许接收通知"，看起来像"长期授权"。**

**实际上：**

```text
一次点击 = 一次授权 = 你能发一条
发完这条，授权就消耗掉了
下一条要再问一次
```

**这就是"一次性订阅"。**

**为什么微信这样设计：** **防止开发者骚扰用户。**

**所以正确的产品设计是：**

```text
❌ 在"设置页"放一个"开启通知"开关
   → 客户点一次，你以为永久开启，实际只能发一条

✅ 在每个"会产生通知的动作"前，先请求授权
   → 客户点"提交订单" → 顺便问"要不要通知你结果" → 客户点允许
   → 订单完成时发一条
```

**这个设计会改变你的产品流程：** **授权和业务动作绑定，不是单独一个开关。**

**这就是这一节最重要的产品认知。**

**"长期订阅"只有少数类目能申请：**

```text
政务、医疗、交通、金融、教育（部分）……
一般商业类目申请不到
```

**所以默认按"一次性订阅"设计。**

## 0.4 这一节要做的三件事

```text
① 小程序订阅消息（申请模板 → 请求授权 → 发送）
② 公众号模板消息（服务号才有）
③ 一个"发送记录"表（不然你不知道发没发、客户有没有收到）
```

---

# 第 1 步：申请模板（25 分钟）

**这一步在微信公众平台后台做，不是写代码。**

## 1.1 小程序订阅消息

**路径：**

```text
小程序后台 → 功能 → 订阅消息 → 我的模板 → 选用
```

**选什么模板：**

**模板库里是"公共模板"，按类目分组。** **你的类目决定你能选哪些。**

**如果找不到合适的，可以"申请自定义模板"，但要审核（1—3 天）。**

**一个典型模板的结构：**

```json
{
  "title": "订单状态通知",
  "keyword1": { "value": "订单号" },
  "keyword2": { "value": "订单状态" },
  "keyword3": { "value": "更新时间" }
}
```

**注意：** **模板里的字段名是平台定的（`keyword1`、`character_string1`、`amount2`……）。**

**你必须按它的类型填值：**

| 类型 | 要求 | 例子 |
|---|---|---|
| `thing` | 20 字以内 | 商品名称 |
| `character_string` | 32 位以内，字母数字 | 订单号 |
| `amount` | 金额，带币种 | 1299.00 元 |
| `date` | 日期时间 | 2026-11-16 14:30 |
| `phrase` | 5 个字以内 | 已发货 |

**填错类型的后果：**

```text
thing 超 20 字 → 报 47003（参数错误）
character_string 里有中文 → 报 47003
amount 里写 "1299" 不带 "元" → 可能通过，但显示奇怪
```

**这些错误码不会告诉你"是哪个字段错了"，只会说"参数错误"。**

**所以你要在代码里做长度截断。**

## 1.2 公众号模板消息（服务号）

**路径：**

```text
公众号后台 → 广告与服务 → 模板消息 → 模板库
```

**注意：** **订阅号（个人主体）没有模板消息功能。**

**只有服务号才有。** **而服务号要企业主体。**

**所以：**

```text
客户有服务号   → 可以用模板消息
客户只有订阅号 → 只能发"客服消息"（48 小时内）
客户什么都没有 → 只能靠小程序订阅消息
```

## 1.3 记下三个东西

**不管哪种，你都需要：**

```text
① 模板 ID（template_id）
② 要填的字段列表
③ 字段的类型和长度限制
```

**写进笔记，后面代码要用。**

---

# 第 2 步：建表（25 分钟）

**为什么要记发送记录：**

```text
① 客户说"我没收到" → 你能查"发了没有、微信返回什么"
② 订阅授权用完没有 → 必须记数
③ 发送失败了要不要重试 → 要区分"永久失败"和"临时失败"
```

## 2.1 建表

**新建 `migrations/023_wechat_messages.sql`：**

```sql
create table wechat_subscribe_grants (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  open_id     text not null,
  template_id text not null,
  total       integer not null default 0,
  used        integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (tenant_id, open_id, template_id)
);

create table wechat_messages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  open_id       text not null,
  channel       text not null,
  template_id   text,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending',
  errcode       integer,
  errmsg        text,
  msgid         text,
  attempts      integer not null default 0,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index wechat_messages_tenant_time_idx
  on wechat_messages (tenant_id, created_at desc);

create index wechat_messages_open_idx
  on wechat_messages (open_id, created_at desc);

alter table wechat_subscribe_grants enable row level security;
alter table wechat_subscribe_grants force row level security;
alter table wechat_messages enable row level security;
alter table wechat_messages force row level security;

create policy tenant_isolation on wechat_subscribe_grants
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_isolation on wechat_messages
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

## 2.2 两个设计

### `total` 和 `used` 分两列

**因为一次授权可能包含"多次"（如果客户连续点了两次允许）。**

```text
total = 2, used = 0  → 能发 2 条
total = 2, used = 2  → 用完了，要再请求授权
```

**判断逻辑：**

```text
total - used > 0  → 能发
total - used = 0  → 不能发，前端要再请求授权
```

**为什么不直接存"还能发几条"：**

**因为"已用"是可追溯的。** **客户投诉"我没同意你发这么多"时，你能拿出 `used` 的记录。**

### `status` 分四种

```text
pending    还没发成功。可能是刚记录，也可能是上次发失败等着重试
sent       微信返回 0（成功），终态
failed     微信明确拒绝（永久失败），终态，重试没用
no_grant   没有授权，没发
skipped    业务判断"不需要发"（比如客户关闭了通知）
```

**注意 `pending` 是"还没成功"，不是"还没开始发"。**

**这个区别很重要：** **发送失败了但还能重试的，状态也要回到 `pending`。** **这样重试脚本只要 `where status = 'pending'` 一句话就能捞出来所有该重发的。**

**如果失败时写成 `failed`，你就同时丢掉了"这条还需要重发"这个信息——** **而 `failed` 里混着"永久失败"和"临时失败"两种，重试脚本没法区分。**

**`failed` 和 `no_grant` 要分开：**

```text
failed    → 微信那边出了问题，你可以排查
no_grant  → 客户没授权，你发了就是违规
```

**把这两类混在一起，你永远不知道"到底是真的发失败了，还是根本没资格发"。**

---

# 第 3 步：请求授权（35 分钟）

**这是最容易做错的一步。**

## 3.1 小程序端

**`wx.requestSubscribeMessage` 必须在"用户点击"的回调里调用。**

```js
async onSubmit() {
  // ① 先请求授权（在点击的同步链里）
  const granted = await this.requestSubscribe();

  // ② 再提交业务
  await this.doSubmit();

  // ③ 提交成功后，通知会由服务端发
}

requestSubscribe() {
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: (res) => {
        const status = res[TEMPLATE_ID];
        resolve(status === 'accept');
      },
      fail: (err) => {
        console.warn('[subscribe] fail', err.errMsg);
        resolve(false);
      },
    });
  });
}
```

## 3.2 四处关键

### 必须在用户点击的"同步链"里

**这是微信的硬性要求。**

```text
✅ 点击 → 直接调 requestSubscribeMessage
❌ 点击 → 请求接口 → 接口返回后再调 requestSubscribeMessage
```

**第二种会报：**

```text
requestSubscribeMessage:fail can only be invoked by user TAP gesture
```

**这个限制防的是"页面一加载就弹授权窗"。**

**所以"先授权，再提交"这个顺序不能调换。**

### 用户拒绝不影响业务

```js
const granted = await this.requestSubscribe();
await this.doSubmit();      // 不管 granted 是什么，都要提交
```

**客户拒绝授权，** **不代表他不想要这个订单。**

**很多人的错误做法：**

```js
if (!granted) {
  wx.showToast({ title: '需要开启通知才能提交', icon: 'none' });
  return;      // ❌ 拒绝授权就不让提交
}
```

**这会直接损失一半转化。**

**正确做法：** **拒绝就拒绝，业务照做，只是"不发通知"。**

### 三种返回值

```js
res[TEMPLATE_ID] 可能是：
  'accept'     同意
  'reject'     拒绝
  'ban'        被后台封禁（用户在设置里关了这个模板）
```

**`ban` 要单独处理：** **说明客户明确不想要这类通知，** **你应该记下来，以后别再问。**

**这一节简化成"只区分 accept 和其他"，但你要知道有 `ban`。**

### 授权结果要上报给服务端

**前端只知道自己点了"允许"，** **但"能发几条"是服务端要记的。**

**所以提交业务时要把 `granted` 带上去：**

```js
await request({
  path: '/api/orders',
  method: 'POST',
  data: {
    ...orderData,
    subscribeGranted: granted,
    subscribeTemplateId: TEMPLATE_ID,
  },
});
```

**服务端根据这个值更新 `wechat_subscribe_grants`。**

## 3.3 服务端记录授权

**在 `src/wechat/subscribe.js` 里：**

```js
const { withTenantFromPool } = require('../db/tenant-db');

async function recordGrant(tenantId, openId, templateId, count = 1) {
  await withTenantFromPool(tenantId, async (db) => {
    await db.client.query(
      `insert into wechat_subscribe_grants (tenant_id, open_id, template_id, total, used)
       values ($1, $2, $3, $4, 0)
       on conflict (tenant_id, open_id, template_id)
       do update set total = wechat_subscribe_grants.total + $4, updated_at = now()`,
      [tenantId, openId, templateId, count]
    );
  });
}

async function availableGrants(tenantId, openId, templateId) {
  return withTenantFromPool(tenantId, async (db) => {
    const { rows } = await db.client.query(
      `select total, used from wechat_subscribe_grants
       where tenant_id = $1 and open_id = $2 and template_id = $3`,
      [tenantId, openId, templateId]
    );

    if (rows.length === 0) return 0;
    return Math.max(0, rows[0].total - rows[0].used);
  });
}

module.exports = { recordGrant, availableGrants };
```

**为什么这里必须用 `withTenantFromPool`，不能用 `pool`：**

**`wechat_subscribe_grants` 在 2.1 节建表时加了 `force row level security`（第 234—235 行）。**

**用 `pool.query` 的话，`insert` 会被 `with check` 拦下来，报：**

```text
new row violates row-level security policy for table "wechat_subscribe_grants"
```

**而 `select` 不报错，只是安静地返回 0 行。**

**这两个的差别很要命：** **写失败会立刻看到报错，能马上改；** **读失败没有声音，你只会看到"授权数是 0"，然后以为是"客户没同意"。** **——而客户明明点了两次同意。**

**`on conflict ... do update set total = total + $4`：**

**每次授权都是"加一次"，不是"设成 1"。**

**因为客户可能连续授权两次（点了两次某个按钮），** **那就是 2 次授权，能发 2 条。**

---

# 第 4 步：发送（40 分钟）

## 4.1 先拿 `access_token`

**小程序发订阅消息需要 `access_token`。**

**注意：这个 `access_token` 和公众号的是**同一个**（如果两者绑在同一个开放平台账号下），** **但获取接口不同：**

```text
小程序  GET /cgi-bin/token?grant_type=client_credential&appid=小程序AppID&secret=小程序Secret
公众号  GET /cgi-bin/token?grant_type=client_credential&appid=公众号AppID&secret=公众号Secret
```

**两个 token 不能混用。**

## 4.2 复用第 177 节的缓存

**`src/wechat/access-token.js`：**

```js
const cache = new Map();
const inflight = new Map();

const APP_ID = process.env.WECHAT_APP_ID;
const APP_SECRET = process.env.WECHAT_APP_SECRET;
const MOCK = process.env.WECHAT_MOCK === '1';

async function fetchToken() {
  if (MOCK) {
    return { token: 'mock_access_token', expiresIn: 7200 };
  }

  const url =
    'https://api.weixin.qq.com/cgi-bin/token' +
    '?grant_type=client_credential' +
    '&appid=' + encodeURIComponent(APP_ID) +
    '&secret=' + encodeURIComponent(APP_SECRET);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json();

  if (data.errcode) {
    throw Object.assign(new Error('获取 access_token 失败：' + data.errcode + ' ' + data.errmsg), {
      code: 'TOKEN_ERROR',
      errcode: data.errcode,
    });
  }

  return { token: data.access_token, expiresIn: data.expires_in || 7200 };
}

async function getAccessToken() {
  const hit = cache.get('wx');
  if (hit && Date.now() < hit.expiresAt) return hit.token;

  const existing = inflight.get('wx');
  if (existing) return existing;

  const p = (async () => {
    const { token, expiresIn } = await fetchToken();
    const marginSec = Math.min(300, Math.floor(expiresIn * 0.1));
    const ttlSec = Math.max(30, expiresIn - marginSec);
    cache.set('wx', { token, expiresAt: Date.now() + ttlSec * 1000 });
    return token;
  })().finally(() => {
    inflight.delete('wx');
  });

  inflight.set('wx', p);
  return p;
}

function invalidate() {
  cache.delete('wx');
}

module.exports = { getAccessToken, invalidate };
```

**这部分和第 177 节几乎一样。**

**为什么"几乎一样"还要重写一遍：** **因为小程序和公众号的 token 是两个独立的，缓存 key 要区分。** **如果你直接把第 177 节的代码拿来用，会互相覆盖。**

**（这一节只做小程序，所以 key 是 `'wx'`。如果以后加公众号，改成 `'wx:mp'` 和 `'wx:oa'`。）**

## 4.3 发送订阅消息

**`src/wechat/subscribe.js` 继续加。**

**先看一个必须提前解决的问题：`wechat_messages` 也有 `force RLS`（2.1 节第 236—237 行），所以这里所有对它的写操作都要走 `withTenantFromPool`。**

**但 `sendOrderStatus` 里有一个 HTTP 请求（调微信接口）。** **不能把那个请求包在事务里——第 165 节那条规矩：事务里不等外部接口。**

**所以这个函数的结构必须是"三段式"：**

```text
段一（短事务）：写 pending 记录，拿 messageId
段二（无事务）：调微信，拿结果
段三（短事务）：按结果更新状态
```

**三段各自独立提交。** **中间任何一步崩了，库里留下的都是"可恢复的状态"（pending），而不是"半个事务"。**

```js
const { getAccessToken, invalidate } = require('./access-token');
const { withTenantFromPool } = require('../db/tenant-db');

const TEMPLATE_ORDER_STATUS = process.env.WECHAT_TEMPLATE_ORDER || '';
const MOCK = process.env.WECHAT_MOCK === '1';

function clampThing(s, max = 20) {
  const v = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return v.length <= max ? v : v.slice(0, max - 1) + '…';
}

function clampString(s, max = 32) {
  const v = String(s == null ? '' : s).replace(/\s+/g, '').trim();
  return v.length <= max ? v : v.slice(0, max);
}

// 段一：只负责"记一条 pending"，返回 id
async function createPendingMessage({ tenantId, openId, payload, status, errmsg }) {
  return withTenantFromPool(tenantId, async (db) => {
    const r = await db.client.query(
      `insert into wechat_messages
         (tenant_id, open_id, channel, template_id, payload, status, errmsg, attempts)
       values ($1, $2, 'subscribe', $3, $4::jsonb, $5, $6, 1)
       returning id`,
      [tenantId, openId, TEMPLATE_ORDER_STATUS, JSON.stringify(payload), status, errmsg || null]
    );
    return r.rows[0].id;
  });
}

// 段三：按结果更新，各种结果都从这里走
async function finishMessage({ tenantId, messageId, status, msgid, errcode, errmsg }) {
  return withTenantFromPool(tenantId, async (db) => {
    await db.client.query(
      `update wechat_messages
       set status = $1,
           msgid = coalesce($2, msgid),
           errcode = coalesce($3, errcode),
           errmsg = coalesce($4, errmsg),
           sent_at = case when $1 = 'sent' then now() else sent_at end,
           attempts = attempts + case when $1 = 'pending' then 1 else 0 end
       where id = $5`,
      [status, msgid || null, errcode || null, errmsg || null, messageId]
    );
  });
}

async function sendOrderStatus({ tenantId, openId, orderNo, statusText, timeText }) {
  if (!TEMPLATE_ORDER_STATUS) {
    return { ok: false, reason: 'NO_TEMPLATE' };
  }

  const grants = await availableGrants(tenantId, openId, TEMPLATE_ORDER_STATUS);

  // 没授权：记一条 no_grant 就结束，绝不调微信
  if (grants <= 0) {
    await createPendingMessage({
      tenantId,
      openId,
      payload: { orderNo, statusText, timeText },
      status: 'no_grant',
      errmsg: '没有可用的订阅授权',
    });

    return { ok: false, reason: 'NO_GRANT' };
  }

  const payload = {
    touser: openId,
    template_id: TEMPLATE_ORDER_STATUS,
    page: 'pages/orders/index',
    miniprogram_state: process.env.NODE_ENV === 'production' ? 'formal' : 'trial',
    lang: 'zh_CN',
    data: {
      character_string1: { value: clampString(orderNo) },
      phrase2: { value: clampThing(statusText, 5) },
      time3: { value: timeText },
    },
  };

  // 段一
  const messageId = await createPendingMessage({
    tenantId,
    openId,
    payload,
    status: 'pending',
  });

  // mock：直接标成成功，不调微信，也不消耗真实配额
  if (MOCK) {
    await finishMessage({ tenantId, messageId, status: 'sent', msgid: 'mock_' + messageId });
    await consumeGrant(tenantId, openId, TEMPLATE_ORDER_STATUS);
    return { ok: true, mock: true, messageId };
  }

  // 段二：无事务，纯 HTTP
  let data;

  try {
    const token = await getAccessToken();

    const res = await fetch(
      'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' +
        encodeURIComponent(token),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      }
    );

    data = await res.json();
  } catch (err) {
    // 网络失败：回到 pending 等重试脚本捞
    await finishMessage({
      tenantId,
      messageId,
      status: 'pending',
      errmsg: String(err.message).slice(0, 500),
    });

    return { ok: false, reason: 'NETWORK', error: err.message, retryable: true };
  }

  // 段三
  if (data.errcode === 0) {
    await finishMessage({ tenantId, messageId, status: 'sent', msgid: String(data.msgid || '') });
    await consumeGrant(tenantId, openId, TEMPLATE_ORDER_STATUS);
    return { ok: true, messageId, msgid: data.msgid };
  }

  if ([40001, 42001].includes(data.errcode)) {
    invalidate();
  }

  const permanent = [40003, 40037, 43101, 47003].includes(data.errcode);

  await finishMessage({
    tenantId,
    messageId,
    status: permanent ? 'failed' : 'pending',
    errcode: data.errcode,
    errmsg: data.errmsg || '',
  });

  return {
    ok: false,
    reason: 'WECHAT_ERROR',
    errcode: data.errcode,
    errmsg: data.errmsg,
    retryable: !permanent,
  };
}

async function consumeGrant(tenantId, openId, templateId) {
  await withTenantFromPool(tenantId, async (db) => {
    await db.client.query(
      `update wechat_subscribe_grants
       set used = used + 1, updated_at = now()
       where tenant_id = $1 and open_id = $2 and template_id = $3
         and used < total`,
      [tenantId, openId, templateId]
    );
  });
}

module.exports = {
  recordGrant,
  availableGrants,
  sendOrderStatus,
  createPendingMessage,
  finishMessage,
  clampThing,
  clampString,
};
```

**为什么拆成 `createPendingMessage` / `finishMessage` 两个函数：**

**不拆的话，你会写成"一个 `withTenantFromPool` 从插入一路包到 `fetch` 返回"。** **那是一个长事务，而且里面握着一条数据库连接等微信——** **微信慢 8 秒，这条连接就被占 8 秒。**

**10 个并发送消息 = 10 条连接全被占住。你的 `max: 10` 池子瞬间打满，整个系统卡死。**

**这是"长事务"最现实的死法：** **不是锁冲突，是连接耗尽。**

**拆开之后：** **段一几十毫秒释放连接，段二不占连接，段三几十毫秒。** **同一时刻最多只占用一条连接，而且是极短的。**

**注意 `finishMessage` 里那个 `attempts` 的写法：**

```sql
attempts = attempts + case when $1 = 'pending' then 1 else 0 end
```

**只有"回到 pending（要重试）"才 +1。** **成功和永久失败都不加——因为它们不会再被重试脚本捞出来。**

**写成无条件 `attempts = attempts + 1` 的后果：** **一条成功了但 `attempts` 是 5 的消息，你从统计里看会以为它"失败了五次"。** **而 `attempts` 是你要用来判断"要不要继续重试"的唯一依据。**

**`consumeGrant` 也改成 `withTenantFromPool`。** **它是"扣一次配额"，必须租户隔离。**

## 4.4 五个关键点

### 先查授权，没授权根本不发

```js
if (grants <= 0) {
  // 记一条 no_grant，返回失败
}
```

**为什么重要：** **没有授权就发，微信会返回 `43101`（用户未订阅）。**

**但更严重的是：** **反复违规会被降级或封禁。**

**所以"没授权"这条路必须在你自己这边断掉，不要指望微信帮你拦。**

### 字段用 `clampThing` / `clampString` 截断

```js
phrase2: { value: clampThing(statusText, 5) },
```

**`phrase` 类型限制 5 个字。**

**"已支付"是 3 个字，没问题。**

**但如果状态是"部分退款处理中"（7 个字），不截断就会报 `47003`。**

**而且报错只说"参数错误"，不说哪个字段。**

**所以所有字段都要截断。**

**注意 `phrase` 的 5 字限制用 `slice(0, 4) + '…'` 实现——** **保留 4 个字加省略号，正好 5 个字符。**

### `miniprogram_state`

```js
miniprogram_state: process.env.NODE_ENV === 'production' ? 'formal' : 'trial'
```

**三个值：**

```text
formal    正式版（客户扫码进的是正式版）
trial     体验版（开发测试用）
developer 开发版
```

**配错的后果：** **消息发出去了，但客户点开找不到页面（因为消息指向的是"体验版"的页面，而客户手机上是"正式版"）。**

**这个 bug 很难查——** **消息显示正常，客户点进去白屏。**

### 只有成功才 `consumeGrant`

**看 `sendOrderStatus` 里这两处：**

```js
  // 段三
  if (data.errcode === 0) {
    await finishMessage({ tenantId, messageId, status: 'sent', msgid: String(data.msgid || '') });
    await consumeGrant(tenantId, openId, TEMPLATE_ORDER_STATUS);      // ← 只有这里扣
    return { ok: true, messageId, msgid: data.msgid };
  }
```

**`consumeGrant` 在 `sendOrderStatus` 里只出现两次（一次在这里，一次在 mock 分支里）。**

**失败的那两条路（微信返回非 0、网络异常）都不扣。**

**为什么：** **失败了客户没收到，** **这一条授权应该还给他，下次重试还能用。**

**如果失败也扣，客户会"授权了 3 次，一条都没收到"。**

### `47003` 是永久失败，不要重试

```js
const permanent = [40003, 40037, 43101, 47003].includes(data.errcode);

await finishMessage({
  tenantId,
  messageId,
  status: permanent ? 'failed' : 'pending',
  errcode: data.errcode,
  errmsg: data.errmsg || '',
});
```

**四个码是"内容/授权/用户"层面的问题，重试一万次也一样：**

```text
40003  openid 无效
40037  模板 ID 无效
43101  用户未订阅
47003  参数值不符合规则（长度/类型）
```

**重试只会浪费配额，而且可能触发风控。**

**`40001` / `42001`（token 失效）是可恢复的——** **清缓存，下次用新 token 重试。**

**注意那个三元：`permanent ? 'failed' : 'pending'`。**

**写成 `permanent ? 'failed' : 'failed'`（两个都一样）是个很容易犯的复制粘贴错误。** **它不会报错，但你的重试脚本永远捞不到东西——所有失败都被标成了终态。**

**这个 bug 我在第 194 节的第一版里就写进去了，是在下面第 6 步跑自检点的时候才发现的。** **你照着敲的时候留意一下自己有没有写对。**

**再加一个重试脚本，验证 `pending` 确实能被捞出来。**

**新建 `scripts/retry-messages.js`：**

```js
require('dotenv').config();
const systemPool = require('../src/db/system-pool');
const { getAccessToken, invalidate } = require('../src/wechat/access-token');

const MAX_ATTEMPTS = 3;
const PERMANENT = [40003, 40037, 43101, 47003];

// 更新单条消息状态（走 systemPool，因为是运维脚本，没有请求上下文）
async function mark(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;

  for (const [k, v] of Object.entries(fields)) {
    sets.push(k + ' = $' + i);
    values.push(v);
    i++;
  }

  sets.push('attempts = attempts + 1');
  values.push(id);

  await systemPool.query(
    'update wechat_messages set ' + sets.join(', ') + ' where id = $' + i,
    values
  );
}

async function main() {
  // 跨租户扫，所以要绕过 RLS —— 这是 systemPool 的合法用途
  const { rows } = await systemPool.query(
    `select id, open_id, payload, attempts
     from wechat_messages
     where status = 'pending'
       and attempts < $1
       and created_at > now() - interval '24 hours'
     order by created_at
     limit 50`,
    [MAX_ATTEMPTS]
  );

  console.log('[retry] 待重发', rows.length, '条');

  let ok = 0;
  let dead = 0;

  for (const m of rows) {
    try {
      const token = await getAccessToken();

      const res = await fetch(
        'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' +
          encodeURIComponent(token),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(m.payload),
          signal: AbortSignal.timeout(10000),
        }
      );

      const data = await res.json();

      if (data.errcode === 0) {
        await mark(m.id, {
          status: 'sent',
          sent_at: new Date(),
          msgid: String(data.msgid || ''),
        });
        ok++;
        continue;
      }

      if ([40001, 42001].includes(data.errcode)) invalidate();

      const isDead = PERMANENT.includes(data.errcode);

      if (isDead) dead++;

      await mark(m.id, {
        status: isDead ? 'failed' : 'pending',
        errcode: data.errcode,
        errmsg: data.errmsg || '',
      });
    } catch (err) {
      await mark(m.id, { errmsg: String(err.message).slice(0, 500) });
    }
  }

  // 用尽次数的，直接标成 failed，不要再捞
  const { rowCount } = await systemPool.query(
    `update wechat_messages set status = 'failed'
     where status = 'pending' and attempts >= $1 returning id`,
    [MAX_ATTEMPTS]
  );

  console.log('[retry] 成功', ok, '永久失败', dead, '用尽次数转 failed', rowCount);

  await systemPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**五处要注意：**

```text
① 直接发 m.payload      payload 是当时存下来的完整请求体，不用重新组装
② attempts 只在 mark() 里加一次   不要在多处各加一遍
③ 最后那条 UPDATE       把"重试 3 次还不成"的收尾成 failed，不留垃圾
④ 用 systemPool 而不是 pool  重试脚本要跨租户扫，没有请求上下文
⑤ systemPool.end()      脚本退出前必须关，否则进程挂着不退
```

**第 ④ 条就是这张表的最后一行：** **"定时任务跨租户扫描 → `systemPool` → 有意跨租户"。**

**如果你这里用 `pool`，会得到一个非常安静的失败：** `select` 返回 0 行，脚本输出"待重发 0 条"，你以为一切正常——**而那些消息永远卡在 `pending` 里，客户永远收不到通知。**

**第 ⑤ 条不加的话，`node scripts/retry-messages.js` 跑完不会退出。** **因为池子里的空闲连接让事件循环一直有东西可等。** **表现是"命令跑完了但终端不返回"，你会以为卡住了。**

**第 ③ 条不能省。** **不省的话，每跑一次脚本，那些毒消息都会被再捞出来重发一遍——** **脚本跑得越勤，对微信的无效请求越多。**

**加进 `package.json`：**

```json
"retry:messages": "node scripts/retry-messages.js"
```

---

# 第 5 步：接上业务（20 分钟）

## 5.1 订单状态变时发消息

**新建 `src/notify/order-paid.js`。**

**不要写进 `service.js`。** **`service.js` 是订单状态的核心，通知是"顺带做的事"。** **混在一起，将来写测试 `markPaid` 时，就得连微信 token、模板 ID 一起 mock 掉。**

**注意这里用的是 `withTenantFromPool`，不是 `pool`。** **因为 `wechat_users` 表在第 193 节加了 `force RLS`——** **直接 `pool.query` 且带 `tenant_id = $1` 也查不到，RLS 是先决条件，不是"你写了 where 就行"。**

```js
const { withTenantFromPool } = require('../db/tenant-db');
const { sendOrderStatus } = require('../wechat/subscribe');

async function notifyOrderPaid(tenantId, order) {
  try {
    const wx = await withTenantFromPool(tenantId, async (db) => {
      const r = await db.client.query(
        `select open_id from wechat_users
         where tenant_id = $1 and user_id is not null
         order by last_login_at desc nulls last
         limit 1`,
        [tenantId]
      );
      return r.rows[0] || null;
    });

    if (!wx) return;

    await sendOrderStatus({
      tenantId,
      openId: wx.open_id,
      orderNo: order.order_no,
      statusText: '已支付',
      timeText: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    });
  } catch (err) {
    console.error('[notify] 发送订阅消息失败', err.message);
  }
}

module.exports = { notifyOrderPaid };
```

**这里有个值得记下来的细节：查询里 `where tenant_id = $1` 这一句其实可以删了。**

**因为 `withTenantFromPool` 已经设了 `app.tenant_id`，RLS 策略会自动过滤到当前租户。**

**但不要删。** **原因是：** **这条 SQL 将来可能被复制到别的地方（比如一个用 `systemPool` 的管理脚本），那时候 `where tenant_id = $1` 就是唯一的防线。** **多写一句不会有性能问题，少写一句会在迁移场景里出事。**

**"能在 where 里写清楚的，就不要只依赖 RLS"——这是第 165 节那条规矩的延续。**

**然后在 `src/orders/service.js` 里接上。总共改两处。**

**第一处：文件顶部加一行 `require`（在已有那句 `const { assertTransition, STATUS } = require('./state');` 下面）：**

```js
const { notifyOrderPaid } = require('../notify/order-paid');
```

**第二处：找到 `markPaid` 末尾的 `return { ok: true, order };`，在它前面插一行：**

```js
  notifyOrderPaid(tenantId, order).catch(() => {});

  return { ok: true, order };
```

**只有这两处。别的地方都不要动。**

**这里有个坑必须提前说。**

**如果你习惯性地写成这样：**

```js
  if (result.ok) {
    const order = result.order;
    notifyOrderPaid(tenantId, order).catch(() => {});
  }
```

**跑起来会报：**

```text
TypeError: Cannot read properties of undefined (reading 'order')
```

**因为 `markPaid` 里面根本没有 `result` 这个变量——它自己就是那个函数，`result` 是它内部 `db.client.query()` 的返回值，早在第 632 行就用完了。**

**这类"从别处抄一段上下文不一致的代码"是新手最常见的错误来源。** **遇到 `Cannot read properties of undefined`，第一件事永远是回去看这个变量在不在当前作用域里。**

**为什么不用 `await`，本节 5.2 第一小节讲。**

## 5.2 三个设计点

### 通知失败不能影响主流程

```js
notifyOrderPaid(tenantId, order).catch(() => {});
```

**不加 `await`。**

**为什么：** **订单已经支付成功了。** **通知发不出去是"体验问题"，不是"数据问题"。**

**如果 `await` 并且抛错，整个 `markPaid` 会失败——** **客户付了钱，订单却没生效。**

**这是第 174 节那条规矩的再次应用：**

```text
数据错了 → 抛错
体验差了 → 记日志
```

### 发给"最近登录的那个微信用户"

```sql
order by last_login_at desc nulls last limit 1
```

**因为一个租户可能有多个微信用户。**

**这一节简化成"发给最近登录的那个"。**

**生产环境应该：**

```text
① 订单是谁创建的，就发给谁
② 或者发给"有权限的人"（owner / admin）
```

**这个绑定关系在 `orders` 表里没有（订单是小程序建的，`applicant_open_id` 可以存）。**

**如果你要精确，加一个 `orders.created_by_open_id` 列。**

### `toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })`

**时间字段要给微信"人眼可读"的格式。**

**`toISOString()` 是 `2026-11-16T06:20:31.000Z`——** **客户看到会懵。**

**用 `toLocaleString` 得到 `2026/11/16 14:20:31`。**

**注意 `timeZone` 一定要写，** **第 180 节讲过这个坑。**

---

# 第 6 步：故意做错三次（20 分钟）

## 6.1 错误一：不顺字段长度

**把 `clampThing(statusText, 5)` 改成直接用 `statusText`。**

**然后造一个长状态：**

```js
statusText: '部分退款处理中'      // 7 个字
```

**发一条。**

**（mock 模式下不会报错，所以要先关掉 mock。）**

**真实环境会返回：**

```json
{ "errcode": 47003, "errmsg": "argument invalid" }
```

**"argument invalid" 不会告诉你"是 `phrase2` 超了 5 个字"。**

**你只能一个个试。**

**改回来。**

## 6.2 错误二：没授权就发

**把 `availableGrants` 的检查删掉：**

```js
// if (grants <= 0) { ... return }
```

**然后发一条。**

**真实环境返回：**

```json
{ "errcode": 43101, "errmsg": "user refuse to accept the msg" }
```

**客户根本没点过"允许"。**

**你会以为"客户拒绝了"，实际上你从来没问过他。**

**加回来。**

## 6.3 错误三：失败也扣授权

**把 `consumeGrant` 移到 `if (data.errcode === 0)` 外面：**

```js
if (data.errcode === 0) { ... }

await consumeGrant(...);      // 移到这里，无论成败都扣
```

**然后连发三条（其中两条会失败）。**

**查授权余额：**

```sql
select total, used from wechat_subscribe_grants where open_id = '...';
```

**`used` 变成了 3，但客户只收到 1 条。**

**客户：我授权了 3 次，只收到 1 条？**

**改回来。**

## 6.4 自检点

**三个都改回来之后：**

```text
① 长状态会被截断成 5 个字
② 没有授权时记录 no_grant，不发
③ 失败不扣授权
```

---

# 第 7 步：最终验收

## A. 表

- [ ] `wechat_subscribe_grants` 有 `total` / `used`
- [ ] `wechat_messages` 有五种 `status`
- [ ] 两张表都有 RLS
- [ ] `failed` 和 `no_grant` 分开

## B. 授权

- [ ] 前端在"点击的同步链"里调 `wx.requestSubscribeMessage`
- [ ] 拒绝不影响业务
- [ ] 授权结果上报给服务端
- [ ] 服务端 `on conflict do update set total = total + 1`

## C. 发送

- [ ] 先查授权，没授权不发
- [ ] 字段都截断（`thing` 20 字，`phrase` 5 字，`character_string` 32 位）
- [ ] `miniprogram_state` 按环境切换
- [ ] 只有成功才 `consumeGrant`
- [ ] `47003` / `43101` 标记为永久失败
- [ ] `40001` / `42001` 清 token 缓存

## D. 业务

- [ ] `markPaid` 成功后发通知
- [ ] 通知失败不影响订单状态
- [ ] 时间用 `toLocaleString` + `Asia/Shanghai`

## E. 三个错误

- [ ] 不截断会报 `47003`（我试了，或者查了文档确认）
- [ ] 没授权发会报 `43101`
- [ ] 失败也扣会导致"授权 3 次收 1 条"

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"一次授权只能发一条"
- [ ] 我记下了授权必须绑在业务动作上

## 提交

```text
git add -A
git commit -m "第194节课: 订阅消息 + 授权记录 + 字段截断 + 发送状态机"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `can only be invoked by user TAP gesture` | 授权没在点击的同步链里 | 先授权再请求接口 |
| `47003` | 字段超长或类型不对 | 截断；检查 `thing` 20 字、`phrase` 5 字 |
| `43101` | 用户未订阅（或授权已用完） | 先查 `availableGrants` |
| `40003` | openid 无效 | 检查是不是别的 AppID 的 openid |
| `40037` | 模板 ID 无效 | 检查后台的模板 ID |
| `40001` / `42001` | access_token 失效 | 清缓存重试 |
| 消息收到了，点开白屏 | `miniprogram_state` 和客户手机上的版本不一致 | 生产用 `formal` |
| 客户说没收到 | 授权用完了，或者 `43101` | 查 `wechat_messages` 的 `status` |
| 授权了但发不出去 | `total - used <= 0` | 每次发成功都要扣减 |
| 重复发送被限 | 没有 `no_grant` 的检查 | 自己先拦，别靠微信 |

---

## 本节课要能说出口的一句话

> **小程序订阅消息是"一次授权发一条"，所以授权必须绑在"会产生通知的那个业务动作"上，而不是做成一个设置开关；把这两件事搞混，客户会以为你从来没通知过他。**
