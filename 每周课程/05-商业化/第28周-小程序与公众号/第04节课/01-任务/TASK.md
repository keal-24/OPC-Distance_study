# 第 193 节课：微信登录

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课是整个小程序里**最容易做错身份模型**的地方。
> 三句话概括：**`code` 换 `openid`，`openid` 换你的 `user_id`，前端只拿 token。**

**建议用时**：215 分钟（4 个步骤，含动手敲代码的时间）
**时间怎么排**：这一节比别处长得多，必须分三次：第 0—1 步（115 分钟）→ 第 2 步（60 分钟）→ 第 3 步（40 分钟）。第一次断开时你应该能用 curl 走通"登录拿到 bindTicket"，那就是好检查点。
**你需要先完成**：第 192 节（Bearer 认证能通，分页和表单能跑）

---

# 第 0 步：先看懂这条链路（25 分钟）

## 0.1 完整流程

```text
小程序                 你的服务器                微信服务器
   │                       │                        │
   │ wx.login()            │                        │
   │─────→ 得到 code       │                        │
   │                       │                        │
   │ POST /api/auth/wechat │                        │
   │ { code }              │                        │
   │──────────────────────→│                        │
   │                       │ GET /sns/jscode2session│
   │                       │ ?code=CODE             │
   │                       │ &appid=APPID           │
   │                       │ &secret=SECRET         │
   │                       │───────────────────────→│
   │                       │                        │
   │                       │←───────────────────────│
   │                       │ { openid, session_key }│
   │                       │                        │
   │                       │ 查 wechat_users        │
   │                       │ 有没有这个 openid      │
   │                       │                        │
   │                       │ 没有 → 建一个          │
   │                       │ 有   → 取 user_id      │
   │                       │                        │
   │←──────────────────────│                        │
   │ { token, isNew }      │                        │
   │                       │                        │
   │ 存 token 到 storage   │                        │
```

## 0.2 四个必须记住的点

### `code` 只能用一次，5 分钟有效

```text
wx.login() → code（一次性，5 分钟）
```

**用过就作废。**

**所以：**

```text
❌ 前端拿 code 存起来，以后每次请求都带 code
✅ 前端拿 code 换 token，之后只用 token
```

**这个设计是微信故意的：** **防止你把 code 当凭证到处传。**

### `session_key` 绝对不能下发到前端

**`jscode2session` 返回两个东西：**

```json
{ "openid": "oXXXX", "session_key": "YYYY" }
```

**`session_key` 是用来解密"加密数据"的（手机号、用户信息）。**

**它能解开这个用户的所有敏感数据。**

**所以：**

```text
❌ 返回给前端 → 前端被反编译 → 拿到 session_key → 能解密任何人的数据
✅ 服务端存着，永不下发
```

**这一条是安全红线。**

### `openid` 不是用户 id

**`openid` 是"这个用户 + 这个小程序"的组合。**

```text
同一个用户，两个小程序 → 两个不同的 openid
同一个用户，小程序和公众号 → 不同的 openid（但 unionid 相同）
```

**所以你的 `users` 表要有一个自己的 `id`，`openid` 只是一列映射。**

**如果你把 `openid` 当主键：**

```text
以后做了第二个小程序 → openid 变了 → 客户的数据全丢了
```

### `unionid` 才是"跨应用的同一个人"

**如果你的小程序和公众号绑在同一个开放平台账号下，** **`jscode2session` 会额外返回 `unionid`。**

```text
openid   应用内唯一
unionid  开放平台账号内唯一（跨小程序、公众号、网站应用）
```

**用 `unionid` 做"同一个人"的判断。**

**但注意：** **不是所有情况都有 `unionid`。** **没绑开放平台就是空的。**

---

# 第 1 步：建表、连接和三个接口（90 分钟）

## 1.1 建表

**新建 `migrations/021_wechat.sql`：**

```sql
create table wechat_users (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  app_id      text not null,
  open_id     text not null,
  union_id    text,
  user_id     uuid references users(id) on delete cascade,
  nickname    text,
  avatar_url  text,
  last_login_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (app_id, open_id)
);

create index wechat_users_tenant_idx on wechat_users (tenant_id, user_id);
create index wechat_users_union_idx on wechat_users (union_id) where union_id is not null;

alter table wechat_users enable row level security;
alter table wechat_users force row level security;

create policy tenant_isolation on wechat_users
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create table invite_codes (
  code        text primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  created_by  uuid references users(id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references wechat_users(id) on delete set null,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index invite_codes_user_idx on invite_codes (tenant_id, user_id);

alter table invite_codes enable row level security;
alter table invite_codes force row level security;

create policy tenant_isolation on invite_codes
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

**两张表，各管一件事：**

```text
wechat_users   openid → user_id 的映射（一个微信人只能绑一个系统账号）
invite_codes   一次性口令（谁生成的、给谁用、什么时候过期）
```

**`invite_codes` 那四个字段是这节课的关键，先看清楚：**

| 字段 | 为什么要有 |
|---|---|
| `user_id` | 码绑的是**某个具体成员**，不是"整个公司"。这样绑上去身份才确定 |
| `used_at` | 一次性。用过就作废，防止一条码传遍全公司 |
| `used_by` | 谁用的。出问题时能查"这个码被哪个微信绑了" |
| `attempts` | 试错次数。配合限流，防止 6 位码被暴力猜 |

**`attempts` 这一列很多人不建。** 6 位码（去掉易混字符后约 32^6 ≈ 10 亿）听着安全，但你的接口如果没有限流，一台机器一天能试几百万次。**`attempts` 让你能在数据库层面兜住"同一条码被反复试"。**

## 1.2 四个字段要讲清

### `unique (app_id, open_id)`

**注意：唯一约束是 `(app_id, open_id)`，不是 `(tenant_id, open_id)`。**

**为什么：**

```text
openid 是"用户 + 小程序"的组合，跟租户无关
同一个小程序可以被多个租户用吗？理论上不行（一个 AppID 对应一个小程序）
但如果你做"SaaS 版小程序"（一个 AppID，多个客户），那就需要
```

**你现在是"一个 AppID 一个客户"的模型，所以 `(app_id, open_id)` 够了。**

**如果你的产品是"一个 AppID 服务多个客户公司"（多租户小程序），** **那 `(app_id, open_id)` 仍然唯一（一个人只能有一个 openid），** **但 `tenant_id` 要在首次进入时由客户选择或用邀请码确定。**

**这一节先做单租户模型。**

### `user_id` 可以是 null

**因为"微信用户"和"你的系统用户"不是一回事。**

```text
有人第一次打开你的小程序 → 有 openid，但没有 user_id
他输入邀请码并绑定成功 → 才有 user_id
```

**如果强制要求 `user_id` 非空，** **你就得"打开小程序就要求注册"，客户会跑。**

**正确做法：**

```text
先给一个"游客态"（只有 openid，只能看到"请输入邀请码"）
绑定成功后才给 token（能看订单）
```

**这一节就按这个做。** **游客态不是"简化版"，它是安全模型的一部分：** **没有 `user_id` 的微信用户，拿不到任何业务 token，因此也调不了任何业务接口。**

**注意 `on delete cascade`，不是 `set null`。**

**这和第 181 节的 `platform_contacts` 不一样，那边用 `set null`。** **区别在于：** **通讯录是"平台上的一个人"，人走了记录要留着（审批记录要能追溯是谁批的）；这里 `user_id` 是"绑定关系"，账号被删了这个绑定就该跟着消失，否则会留下一条指向不存在用户的孤儿记录。**

**如果留 `set null`，会出一个很隐蔽的 bug：** **那个人被删了，但他的 `wechat_users` 还在，`user_id` 变成 null。他再打开小程序，会重新走一遍"请输入邀请码"——** **看起来正常，但数据库里会攒下一堆同一个 openid 的空记录，因为唯一约束是 `(app_id, open_id)`，插入会撞重复键报错。**

### `union_id` 单独一列，可空

**见第 0.2 节。**

**加它的成本是零，不加以后要重新同步一遍。** **第 181 节讲过同样的道理。**

### `last_login_at`

**每次登录更新。**

**用途：**

```sql
-- 30 天没打开过小程序的用户
select * from wechat_users where last_login_at < now() - interval '30 days';
```

**这是"客户流失预警"的数据来源。** **第 188 节的埋点做的是"页面级"，这个做的是"入口级"。**

## 1.3 `code2session`

**新建 `src/wechat/session.js`：**

```js
const APP_ID = process.env.WECHAT_APP_ID || '';
const APP_SECRET = process.env.WECHAT_APP_SECRET || '';
const MOCK = process.env.WECHAT_MOCK === '1';

async function code2session(code) {
  if (!code || typeof code !== 'string') {
    throw Object.assign(new Error('缺少 code'), { code: 'NO_CODE' });
  }

  if (MOCK) {
    const hash = require('crypto')
      .createHash('sha256')
      .update(code)
      .digest('hex')
      .slice(0, 20);

    return {
      openid: 'mock_open_' + hash,
      unionid: 'mock_union_' + hash,
      session_key: 'mock_session_' + hash,
      mock: true,
    };
  }

  if (!APP_ID || !APP_SECRET) {
    throw Object.assign(new Error('服务器没有配置小程序 AppID / AppSecret'), {
      code: 'NOT_CONFIGURED',
    });
  }

  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    '?appid=' + encodeURIComponent(APP_ID) +
    '&secret=' + encodeURIComponent(APP_SECRET) +
    '&js_code=' + encodeURIComponent(code) +
    '&grant_type=authorization_code';

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

  if (!res.ok) {
    throw Object.assign(new Error('微信接口请求失败 HTTP ' + res.status), {
      code: 'UPSTREAM_HTTP',
    });
  }

  const data = await res.json();

  if (data.errcode) {
    const map = {
      40029: '登录凭证已失效，请重新进入小程序',
      45011: '登录太频繁，请稍后再试',
      40163: '登录凭证已被使用',
      40226: '高风险用户，登录被拒',
    };

    throw Object.assign(new Error(map[data.errcode] || '微信登录失败（' + data.errcode + '）'), {
      code: 'WECHAT_' + data.errcode,
      errcode: data.errcode,
    });
  }

  if (!data.openid) {
    throw Object.assign(new Error('微信没有返回 openid'), { code: 'NO_OPENID' });
  }

  return {
    openid: data.openid,
    unionid: data.unionid || null,
    session_key: data.session_key,
    mock: false,
  };
}

module.exports = { code2session };
```

## 1.4 五处关键

### `WECHAT_MOCK=1` 的 mock 模式

**为什么需要：**

**你现在可能没有小程序 AppSecret（或者不想为了测试去配）。**

**mock 模式让 `code` 变成"确定性的 openid"——** **同一个 `code` 永远得到同一个 `openid`。**

**这样你能测完整流程，不用真连微信。**

**注意：** **生产环境必须 `WECHAT_MOCK=0`，而且要在启动时检查：**

```js
if (process.env.NODE_ENV === 'production' && process.env.WECHAT_MOCK === '1') {
  console.error('!!! 生产环境不能开 WECHAT_MOCK');
  process.exit(1);
}
```

**这五行能防住一次灾难。** **忘了关 mock，任何人都能伪造登录。**

### 错误码翻译成人话

**新建 `miniprogram/utils/wechat-errors.js`：**

```js
const MESSAGES = {
  '-1': '系统繁忙，请稍后再试',
  40001: '登录配置有问题，请联系管理员',
  40013: 'AppID 填错了',
  40029: '登录凭证已失效，请重新进入小程序',
  40163: '登录凭证已经用过了，请重新进入小程序',
  41008: '缺少登录凭证',
  45011: '操作太频繁，请等一分钟再试',
  45009: '接口调用次数超了，等一会儿再试',
};

function translate(errcode, errmsg) {
  const key = String(errcode);
  if (MESSAGES[key]) return MESSAGES[key];
  return '登录遇到问题（' + errcode + '），请稍后重试';
}

module.exports = { translate, MESSAGES };
```

**用后端返回的字段挑一句：**

```js
const { translate } = require('../utils/wechat-errors');

// 后端返回 { error: '...', wechat: { errcode: 45011, errmsg: '...' } }
const message = res.wechat ? translate(res.wechat.errcode) : res.error;
```

**微信的原始错误是 `errcode: 40029`。**

**客户看到这个完全不懂。** **翻译成"请重新进入小程序"——** **他就知道该做什么。**

**`45011`（登录太频繁）在客户快速重进小程序时会出现。** **这个提示能救掉一次"登录不了"的投诉。**

**注意 `translate` 里那个兜底分支带了 `errcode`。** **不带的话，遇到没收录的码你完全不知道发生了什么；带了，客户截图给你，你一眼能查微信文档。**

### 不返回 `session_key` 给调用方之外的人

**注意 `code2session` 返回了 `session_key`。**

**但调用它的地方（路由）绝对不能把它放进响应。**

**这一节不会用到 `session_key`（不解密手机号），** **但返回值里保留它，是为了以后"解密手机号"时不用改函数签名。**

**在路由里只取 `openid` 和 `unionid`。**

### `AbortSignal.timeout(8000)`

**微信的接口偶尔会慢（几秒）。**

**没有超时，整个登录会一直挂着。**

**8 秒是合理值：** **正常 100—300ms，超过 8 秒基本就是出问题了。**

### `fetch` 的 URL 参数要 `encodeURIComponent`

**`code` 里可能有 `+`、`/`、`=`（base64 风格的字符）。**

**不编码的话，`+` 会被解析成空格，`code` 就错了。**

**这个 bug 会表现成"偶尔登录失败（大部分时候成功）"——** **因为只有包含特殊字符的 code 才会失败。**

**极难查。** **养成"所有 URL 参数都编码"的习惯。**

## 1.5 先解决一个绕不过去的问题：这个接口用不了 `pool`

**在写路由之前，有一个必须先想清楚的事。**

**你第 165 节给 `users` 表加了 RLS，第 1.1 节又给 `wechat_users` 和 `invite_codes` 也加了 RLS，而且是 `force row level security`。**

**而 `src/db/pool.js` 那个连接，默认没有设 `app.tenant_id`。**

**结果就是：**

```text
pool.query('select ... from wechat_users where open_id = $1')
→ 0 行。永远。
```

**这不是"可能"，是必然。** **按第 165 节的策略，`current_setting('app.tenant_id', true)` 没设值时返回空字符串，`nullif(...,'')::uuid` 得到 `null`，`tenant_id = null` 恒不成立，策略不通过。**

**所以你会看到一个非常诡异的现象：**

```text
数据库里明明有一条 wechat_users 记录
登录接口查出来是 0 行
于是走"新建"分支 → 插入 → 撞唯一约束 (app_id, open_id) → 500
```

**第一步就卡死，而且报错完全指向"唯一约束冲突"，让你以为是并发问题。**

### 为什么登录接口天然无法设租户上下文

**因为整件事的顺序是反的：**

```text
要知道 tenant_id → 得先知道这个 openid 绑在哪家公司
要知道绑在哪家 → 得先查 wechat_users
要查 wechat_users → 得有 tenant_id 才能过 RLS
```

**这是个死循环。** **登录接口的唯一职责就是"从零确定身份"，它必然运行在"还没有租户"的状态下。**

**所以它必须用一个不受 RLS 约束的连接。**

### 新建 `src/db/system-pool.js`

```js
const { Pool } = require('pg');
require('dotenv').config();

// 系统连接：绕过 RLS，只给"无法确定租户"的场景用
// 唯一合法用途：登录 / 注册 / 回调 / 定时任务
const systemPool = new Pool({
  connectionString: process.env.SYSTEM_DATABASE_URL || process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

systemPool.on('error', (err) => {
  console.error('[system-db] 空闲连接出错：', err.message);
});

module.exports = systemPool;
```

**`.env` 里加一行：**

```text
SYSTEM_DATABASE_URL=postgres://postgres:你的密码@localhost:5432/saas_lab
```

**这是第 175 节提过一句的 `SYSTEM_DATABASE_URL`，那里只说了"加一个"，没给代码。现在补上。**

**四个决定，每个都有代价：**

| 决定 | 理由 | 代价 |
|---|---|---|
| `max: 3` | 这连接能看所有数据，池子越小泄漏面越小 | 登录高峰期会排队（你的规模不可能遇到） |
| 回退到 `DATABASE_URL` | 本地开发省一步配置 | **生产必须显式配，否则不起作用** |
| 单独一个文件 | 谁 `require` 它，一眼能 grep 出来 | 没有机制强制"只准登录用" |
| 打 `[system-db]` 前缀 | 日志里能分清是哪条连接出的错 | 无 |

**第三条必须靠自律。** **这个池子给谁用，是靠约定，不是靠类型系统。** **第 4 步会写一个脚本把它抓出来。**

**⚠️ 生产环境一定要单独建一个数据库用户给它**，不要直接用 `postgres`：

```sql
create role app_system login password '换成一个长密码';
grant select, insert, update on wechat_users, invite_codes, tenants, users to app_system;
-- 不要给 delete，也不要给全库权限
```

**这才是正规做法。** **这一节为了不让篇幅失控，先直接用 `postgres`——但你必须在笔记里写清"上线前改成专用角色"。**

## 1.6 登录路由

**新建 `src/routes/wechat.js`。两个接口：`/auth/wechat` 登录、`/auth/wechat/bind` 绑邀请码。**

```js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const systemPool = require('../db/system-pool');
const { code2session } = require('../wechat/session');

const router = express.Router();

const APP_ID = process.env.WECHAT_APP_ID || 'mock_app';
const MAX_BIND_ATTEMPTS = 5;

function signToken(userId) {
  return jwt.sign({ uid: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// 从 code 拿到 openid，顺便把"这个人是谁"查出来
async function resolveIdentity(code) {
  const session = await code2session(code);

  const found = await systemPool.query(
    `select w.id, w.tenant_id, w.user_id
     from wechat_users w
     where w.app_id = $1 and w.open_id = $2`,
    [APP_ID, session.openid]
  );

  return { session, row: found.rowCount > 0 ? found.rows[0] : null };
}

router.post('/auth/wechat', async (req, res, next) => {
  try {
    const { session, row } = await resolveIdentity((req.body || {}).code);

    console.log('[wechat] 登录', {
      openid: session.openid ? session.openid.slice(0, 12) + '...' : null,
      mock: session.mock,
      bound: !!(row && row.user_id),
    });

    // 情况一：已绑定 → 直接发 token
    if (row && row.user_id) {
      await systemPool.query(
        'update wechat_users set last_login_at = now() where id = $1',
        [row.id]
      );

      return res.json({
        token: signToken(row.user_id),
        expiresIn: 7 * 24 * 3600,
        needBind: false,
      });
    }

    // 情况二：没绑定（含"从没来过"）→ 不发 token，回一个待绑定凭证
    // 这个 bindTicket 不是登录凭证，它只能用来调 /auth/wechat/bind
    const bindTicket = jwt.sign(
      { openid: session.openid, unionid: session.unionid || null, appId: APP_ID },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    return res.json({
      token: null,
      needBind: true,
      bindTicket,
      expiresIn: 7 * 24 * 3600,
    });
  } catch (err) {
    if (err.code && err.code.startsWith('WECHAT_')) {
      return res.status(400).json({ error: err.message, code: err.code });
    }

    if (err.code === 'NOT_CONFIGURED') {
      return res.status(503).json({ error: err.message, code: err.code });
    }

    next(err);
  }
});

router.post('/auth/wechat/bind', async (req, res, next) => {
  const { bindTicket, inviteCode } = req.body || {};

  if (!bindTicket || !inviteCode) {
    return res.status(400).json({ error: '缺少参数', code: 'MISSING' });
  }

  let ticket;

  try {
    ticket = jwt.verify(bindTicket, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      error: '绑定超时了，请退回首页重新进入',
      code: 'TICKET_EXPIRED',
    });
  }

  if (!ticket.openid) {
    return res.status(401).json({ error: '绑定凭证无效', code: 'TICKET_INVALID' });
  }

  const code = String(inviteCode).trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: '邀请码是 6 位字母数字', code: 'BAD_FORMAT' });
  }

  const client = await systemPool.connect();

  try {
    await client.query('begin');

    // 锁住这条码，防止两个人同时用它
    const found = await client.query(
      `select code, tenant_id, user_id, expires_at, used_at, attempts
       from invite_codes
       where code = $1
       for update`,
      [code]
    );

    const row = found.rows[0];

    if (!row) {
      await client.query('rollback');
      return res.status(404).json({ error: '邀请码不对', code: 'NOT_FOUND' });
    }

    if (row.attempts >= MAX_BIND_ATTEMPTS) {
      await client.query('rollback');
      return res.status(429).json({ error: '这个码试错太多次，请让管理员重新生成', code: 'LOCKED' });
    }

    if (row.used_at) {
      await client.query('rollback');
      return res.status(409).json({ error: '这个邀请码已经被用过了', code: 'USED' });
    }

    if (new Date(row.expires_at) < new Date()) {
      await client.query('rollback');
      return res.status(410).json({ error: '邀请码过期了，请让管理员重新生成', code: 'EXPIRED' });
    }

    // 这个 openid 之前如果来过（有游客记录），复用；否则新建
    const existing = await client.query(
      `select id, user_id from wechat_users where app_id = $1 and open_id = $2`,
      [ticket.appId || APP_ID, ticket.openid]
    );

    let wechatUserId;

    if (existing.rowCount > 0) {
      if (existing.rows[0].user_id) {
        await client.query('rollback');
        return res.status(409).json({ error: '这个微信已经绑过账号了', code: 'ALREADY_BOUND' });
      }

      wechatUserId = existing.rows[0].id;

      await client.query(
        `update wechat_users
         set user_id = $1, union_id = coalesce($2, union_id), last_login_at = now()
         where id = $3`,
        [row.user_id, ticket.unionid, wechatUserId]
      );
    } else {
      const inserted = await client.query(
        `insert into wechat_users
           (tenant_id, app_id, open_id, union_id, user_id, last_login_at)
         values ($1, $2, $3, $4, $5, now())
         returning id`,
        [row.tenant_id, ticket.appId || APP_ID, ticket.openid, ticket.unionid, row.user_id]
      );

      wechatUserId = inserted.rows[0].id;
    }

    await client.query(
      `update invite_codes
       set used_at = now(), used_by = $1
       where code = $2`,
      [wechatUserId, code]
    );

    await client.query('commit');

    return res.json({
      token: signToken(row.user_id),
      needBind: false,
      expiresIn: 7 * 24 * 3600,
    });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
```

**在 `server.js` 里挂上（注意不要把 `auth` 加进去，这两个接口本来就用于获取 token）：**

```js
const wechatRoutes = require('./src/routes/wechat');
app.use('/api', wechatRoutes);
```

**注意 `app.use('/api', ...)` + `router.post('/auth/wechat', ...)`，** **最终路径是 `/api/auth/wechat`，和 `request.js` 里的一致。**

## 1.7 这个路由里的六个决定

### 没绑定时返回 `token: null`，不是返回一个假 token

**原来的写法是"没有 user_id 就自动绑一个"，现在改成"没有就返回 `needBind: true`"。**

**关键在 `token: null` 这一行。** **不能返回空字符串，也不能返回一个 `role: 'guest'` 的 token——**

**因为你的所有业务中间件都是 `auth`，它拿到任何合法签名的 token 就去查 `users` 表。** **你给一个假 token，等于给了一个"能过验签但查不到人"的凭证，401 报错会五花八门。**

**返回 `null`，客户端就明确知道"这次没有登录态"，乖乖去绑。**

### `bindTicket` 和 `token` 是两种东西，不能混

```text
token        里是 { uid }，能调所有业务接口，7 天有效
bindTicket   里是 { openid }，只能调 /auth/wechat/bind，10 分钟有效
```

**为什么不能直接用 `token` 承载 `openid`：**

**因为 `auth` 中间件是 `jwt.verify` 之后直接 `payload.uid` 查库。** **如果你的 token 里是 `openid` 没有 `uid`，`auth` 查出来是 `undefined`，报 `账号不存在`——** **你会以为是用户被删了。**

**两个 payload 结构不同，就必须是两个不同的签发点。** **10 分钟有效期，是因为"输邀请码"这个动作不会超过 10 分钟；过期了让客户重进小程序，比给一个 7 天的绑定凭证安全得多。**

### `for update` 是这段代码里最不能删的一行

```sql
select ... from invite_codes where code = $1 for update
```

**没有它，两个人在同一秒用同一条码：**

```text
请求 A: 查 code → 未使用 → 通过
请求 B: 查 code → 未使用 → 通过     ← 因为 A 还没提交
请求 A: update used_at, 绑定 user_1
请求 B: update used_at, 绑定 user_2
```

**结果：一条码绑了两个微信账号。** **而且两个人都在同一家公司，看起来"没有越权"，所以你不会发现——直到某天要追责"这个操作是谁做的"。**

**`for update` 让 B 卡在 `select` 上，等 A 提交后它再读，读到 `used_at` 已填，直接返回 409。**

**这也是为什么必须用同一个 `client` 而不是 `systemPool.query`：** **`for update` 的锁活在事务里，而事务活在连接上。** **用 `pool.query` 每次拿的是不同连接，锁立刻释放，等于没加。**

### `attempts` 的检查放在 `used_at` 之前

**顺序看着无所谓，其实有讲究：**

```text
先判 attempts  → 被锁的码立刻回 429，不给任何"这个码存不存在"的信息
先判 used_at   → 攻击者能通过 409/404 的差别枚举出哪些码是有效的
```

**这一条叫"不泄露存在性"。** **现在这个顺序下，一个被锁的码和一个不存在的码，攻击者拿到的信息量是一样的（都是 4xx，但猜不出原因）。**

**严格说这里还做得不够——`NOT_FOUND` 和 `LOCKED` 的状态码不同（404 vs 429），还是能区分。** **要彻底修得让它俩都返回同一个通用错误。** **这一节先保持可读性，你记下这个取舍。**

### 绑定时才写 `invite_codes`，登录时不碰它

**`/auth/wechat` 那条路径对 `invite_codes` 一次都不查。**

**因为登录是高频的（每次冷启动都会调），绑定是一次性的。** **在登录路径上加一张表的查询，等于给每次启动多一次往返。**

### 游客记录先建后绑，还是绑的时候一起建

**这段代码选的是"绑的时候才建 `wechat_users` 记录"。**

**好处：** **没绑过的人，库里一条记录都没有，不会攒垃圾。**

**代价：** **你没法统计"有多少人打开了小程序但没绑"——而这恰恰是最有价值的漏斗数据。**

**要这个数据就得在 `/auth/wechat` 里也插一条 `user_id` 为 null 的记录。** **那一版的代价是：每次冷启动都要写库，而且要想办法清理长期不绑的游客。**

**这一节选"干净"那一边。** **你以后要漏斗数据时，改法很明确：在 `/auth/wechat` 里加一个 `insert ... on conflict do nothing`。**

## 1.8 网页版生成邀请码（管理员用）

**这一节选"邀请码"，因为它是三种方案里唯一不需要任何资质的。**

**另外两种顺便说清，你自己判断：**

```text
② 手机号：小程序调 getPhoneNumber → 和 users 表比对
   最顺手，客户不用记码。但要求企业主体 —— 个人小程序拿不到手机号

③ 邮箱密码：小程序里也能登录（复用 /api/auth/login）
   零成本，但你得让客户在小程序里打字输密码 —— 手机上体验极差
```

**改 `src/routes/tenant.js`，加一个生成接口：**

```js
const crypto = require('crypto');

// 去掉容易看错的 0/O/1/I/L，剩 31 个字符
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  let out = '';

  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }

  return out;
}

router.post('/members/:userId/invite', async (req, res, next) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员能生成邀请码' });
  }

  try {
    const target = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        'select id, email, role from users where tenant_id = $1 and id = $2',
        [req.tenant.id, req.params.userId]
      );
      return r.rows[0] || null;
    });

    if (!target) {
      return res.status(404).json({ error: '这个人不在你的公司里' });
    }

    // 同一个人如果已经有未用的码，先作废，避免一堆码在外面传
    const created = await withTenant(req.tenant.id, async (db) => {
      await db.client.query(
        `update invite_codes
         set used_at = now()
         where tenant_id = $1 and user_id = $2 and used_at is null`,
        [req.tenant.id, target.id]
      );

      const r = await db.client.query(
        `insert into invite_codes (tenant_id, user_id, created_by, code, expires_at)
         values ($1, $2, $3, $4, now() + interval '7 days')
         returning code, expires_at`,
        [req.tenant.id, target.id, req.user.id, randomCode(6)]
      );

      return r.rows[0];
    });

    res.json({
      code: created.code,
      expiresAt: created.expires_at,
      for: { id: target.id, email: target.email },
      hint: '把这个码发给本人，让他/她在小程序里输入。7 天内有效，只能用一次。',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/invites', async (req, res, next) => {
  const rows = await withTenant(req.tenant.id, async (db) => {
    const r = await db.client.query(
      `select i.code, i.user_id, u.email, i.expires_at, i.used_at, i.created_at,
              (i.expires_at < now()) as is_expired
       from invite_codes i
       join users u on u.id = i.user_id
       where i.tenant_id = $1
       order by i.created_at desc
       limit 50`,
      [req.tenant.id]
    );
    return r.rows;
  });

  res.json(rows);
});
```

**三个决定：**

**一、码绑的是"某个具体成员"，不是"整个公司"。**

**路径是 `/members/:userId/invite`，因为码里必须有一个确定的 `user_id`。** **如果码不绑人，一个人用完你的小程序，他就成了"这个公司的第一个人"，权限完全没法确定。**

**二、`randomCode` 用 `crypto` 不用 `Math.random`。**

```js
Math.random().toString(36).slice(2, 8)   // ❌ 可预测
crypto.randomBytes(6)                    // ✅ 密码学安全
```

**`Math.random` 是伪随机，种子可推。** **攻击者拿到一个码，能算出你下一批码可能长什么样。** **邀请码是一次性凭证，和密码同级，必须用 `crypto`。**

**注意 `bytes[i] % 31` 有一个微小偏差**（256 不是 31 的整数倍，靠前的字符概率略高）。**对 6 位码这个安全等级完全够用，不用管。** **真要较真是"拒绝采样"，但那属于过度设计。**

**三、生成新码时先作废旧码。**

**不加这句，客户点五次"生成"，外面就有五条都能用的码。** **后来他不知道哪条发出去了，也不知道要作废哪条。**

**每次生成都只剩一条有效码，"哪个码有效"这个问题永远只有一个答案。**

---

# 第 2 步：小程序端的登录与绑定页（60 分钟）

## 2.1 `utils/request.js` 里的 `login`

**第 190 节写过一版，那一版是"登录必成功"。现在不一样了——登录可能返回"需要绑定"。**

**把 `login` 整个换掉：**

```js
let loginPromise = null;

// 未绑定异常：页面捕获它，跳去绑定页
function NeedBindError(bindTicket) {
  const err = new Error('需要绑定账号');
  err.code = 'NEED_BIND';
  err.bindTicket = bindTicket;
  return err;
}

async function login(force) {
  if (!force) {
    const existing = wx.getStorageSync('token');
    if (existing) return { token: existing, cached: true };
  }

  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    const { code } = await new Promise((resolve, reject) => {
      wx.login({ success: resolve, fail: reject });
    });

    if (!code) {
      throw new Error('微信登录失败：没拿到 code');
    }

    const res = await request({
      path: '/api/auth/wechat',
      method: 'POST',
      data: { code },
      retry: false,
    });

    // 没绑定：不抛普通错误，抛一个带票据的特定错误
    if (res.needBind) {
      wx.setStorageSync('bindTicket', res.bindTicket);
      throw NeedBindError(res.bindTicket);
    }

    if (!res.token) {
      throw new Error('服务器没有返回登录凭证');
    }

    wx.removeStorageSync('bindTicket');
    wx.setStorageSync('token', res.token);

    return res;
  })().finally(() => {
    loginPromise = null;
  });

  return loginPromise;
}

async function bind(inviteCode) {
  const bindTicket = wx.getStorageSync('bindTicket');

  if (!bindTicket) {
    throw new Error('绑定凭证过期了，请退回首页重新进入');
  }

  const res = await request({
    path: '/api/auth/wechat/bind',
    method: 'POST',
    data: { bindTicket, inviteCode },
    retry: false,
  });

  if (!res.token) {
    throw new Error('绑定失败，请重试');
  }

  wx.removeStorageSync('bindTicket');
  wx.setStorageSync('token', res.token);

  return res;
}

function logout() {
  wx.removeStorageSync('token');
  wx.removeStorageSync('bindTicket');
}
```

## 2.2 四处关键

### `loginPromise` 做并发合并

**和 177 节的 token 单飞是同一个思路。**

**场景：**

```text
小程序启动，同时发 3 个请求（me / orders / stats）
三个都 401 → 三个都调 login() → 三次 wx.login → 三次换 token
```

**前两次的 token 会被第三次覆盖，甚至可能触发微信的"登录太频繁"（45011）。**

**用 `loginPromise` 合并：**

```text
第一个调 login() → 创建 promise
第二个调 login() → 返回同一个 promise
第三个调 login() → 返回同一个 promise
全部拿到同一个 token
```

**`.finally(() => { loginPromise = null })` 保证下次能重新登录。**

**这是所有"有登录态的客户端"都要有的东西。**

**注意 `needBind` 这条路径也会走 `finally`，所以 `loginPromise` 一样会被清空。** **这是对的：客户绑完码之后需要重新登录一次（`force: true`），不能被旧的失败 promise 卡住。**

### 有缓存就不重复登录

```js
if (!force) {
  const existing = wx.getStorageSync('token');
  if (existing) return { token: existing, cached: true };
}
```

**为什么：** **`wx.login()` 也有频率限制。**

**不是每次请求都要 `code2session`。** **token 有效期 7 天，7 天内复用。**

**`force: true` 用于"用户主动退出"或者"token 校验失败"。**

**注意这里只判断 `token`，不判断 `bindTicket`。** **因为游客态不算登录成功——有 `bindTicket` 但没有 `token` 时，仍然应该走一次完整的登录流程，让服务端再确认一次。**

### "需要绑定"是一个正常返回，不是错误

**这是这一节最容易被写错的地方。**

**看客户实际会经历什么：**

```text
第一次打开小程序 → 登录 → 服务端说"你还没绑"
```

**这既不是网络错误，也不是代码 bug，是一件完全正常的事。**

**所以服务端返回的是 200 + `needBind: true`，不是 4xx。**

**如果返回 401，你的 `request.js` 里那段"401 就清 token 重登"会被触发——** **它会把 token 删掉、重新 login、又拿到 `needBind`、又 401、又重登……** **死循环，而且客户看到的是"一直转圈然后报网络错误"。**

**这个循环我在第一版里就写出来了。** **判据很简单：401 的含义是"你的凭证无效"，而 `needBind` 的含义是"你没有凭证，但这是预期的"。** **两件事不能共用一个状态码。**

### 绑完之后必须让页面重新拉数据

**`bind()` 成功后只是把 token 存进去了，页面上的数据还是空的。**

**所以绑定页在成功后要做两件事：**

```js
wx.showToast({ title: '绑定成功', icon: 'success' });

// ① 让 app 的 ready 重新跑一次（此时能拿到 token 了）
getApp().relogin();

// ② 回到列表页。用 reLaunch，把绑定页从栈里清掉
setTimeout(() => wx.reLaunch({ url: '/pages/orders/index' }), 600);
```

**`reLaunch` 而不是 `navigateBack`。** **因为绑定页是从"游客态"进来的，栈里没有可返回的正常页面。** **`navigateBack` 会回到那个正在报错的页面。**

### 启动了先登录一次

**`app.js`：**

```js
const { login } = require('./utils/request');

App({
  globalData: {
    ready: null,
    needBind: false,
  },

  onLaunch() {
    this.relogin();
  },

  // 统一入口：登录失败/需要绑定 都走这里
  relogin(force) {
    this.globalData.ready = login(force)
      .then((res) => {
        this.globalData.needBind = false;
        return res;
      })
      .catch((err) => {
        if (err.code === 'NEED_BIND') {
          this.globalData.needBind = true;
        } else {
          console.error('[app] 启动登录失败', err.message);
        }
        return Promise.reject(err);
      });

    return this.globalData.ready;
  },
});
```

**`onLaunch` 是小程序启动时执行一次。**

**把 `login()` 的 promise 存进 `globalData`，** **页面里 `await getApp().globalData.ready` 就能等它完成。**

**这样第一个页面不会因为"token 还没拿到"而 401。**

**`relogin()` 抽出来是为了给绑定页用。** **不抽的话，绑定成功后你得在绑定页里手写一遍"调 login、存 token"——** **两份逻辑，改一份忘一份。**

## 2.3 页面里怎么用

**改 `pages/orders/index.js`。第 190 节写的 `load()` 现在要加三件事：等登录、处理 `needBind`、带分页参数。**

**把整个 `load()` 换成这版（`onLoad` 也一起改）：**

```js
onLoad() {
  this.load(true);
},

onPullDownRefresh() {
  this.load(true).finally(() => wx.stopPullDownRefresh());
},

onShow() {
  // 从绑定页回来后重新拉一次
  if (getApp().globalData.needBind === false && this._wasNeedBind) {
    this._wasNeedBind = false;
    this.load(true);
  }
},

async load(reset) {
  if (this._loading) return;

  this._loading = true;
  this.setData({ loading: true, error: '' });

  if (reset) {
    this._page = 1;
    this._hasMore = true;
  }

  try {
    // 先等启动时那次登录完成（app.js 里存进 globalData 的 promise）
    await getApp().globalData.ready;

    const res = await request({
      path: '/api/orders?page=' + this._page + '&limit=20',
      retry: false,
    });

    const list = Array.isArray(res) ? res : res.items || [];
    const orders = list.map((o) => ({
      id: o.id,
      order_no: o.order_no,
      customer_name: o.customer_name,
      order_date: String(o.order_date || '').slice(0, 10),
      amount: (o.amount_cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      status: o.status,
      status_text: STATUS_TEXT[o.status] || o.status,
    }));

    this._hasMore = list.length >= 20;

    this.setData({
      loading: false,
      orders: reset ? orders : this.data.orders.concat(orders),
    });
  } catch (err) {
    // 需要绑定：不是错误，是"该去输邀请码了"
    if (err.code === 'NEED_BIND') {
      this._wasNeedBind = true;
      this.setData({ loading: false, error: '', needBind: true });
      return;
    }

    this.setData({ loading: false, error: err.message || '加载失败' });
    wx.showToast({ title: err.message || '加载失败', icon: 'none' });
  } finally {
    this._loading = false;
  }
},

goBind() {
  wx.navigateTo({ url: '/pages/bind/index' });
},
```

**对应的 WXML 要加一层：**

```xml
<view class="page">
  <!-- 需要绑定：不显示列表，只显示引导 -->
  <view class="bind-hint" wx:if="{{needBind}}">
    <view class="bind-hint__title">还需要一步</view>
    <view class="bind-hint__text">
      请向公司管理员索要 6 位邀请码，输入后即可查看订单。
    </view>
    <button class="btn btn--primary btn--block" bindtap="goBind">输入邀请码</button>
  </view>

  <block wx:else>
    <!-- 原来的 loading / error / 列表三态，一行都不用改 -->
  </block>
</view>
```

**四处新增，各自的原因：**

```text
① await getApp().globalData.ready
   小程序冷启动时，onLaunch 里的 login() 还没回来，
   页面就发请求 → 401 → 又被 catch 吃掉 → 显示"加载失败"。
   等它，是唯一不靠 setTimeout 蒙的办法。

② err.code === 'NEED_BIND' 单独一个分支
   不能掉进通用 catch。掉进去的结果是"显示网络错误"，
   客户会去查 WiFi，而真正的问题是"你还没绑账号"。

③ needBind 是一个页面状态，不是一个 error
   error 有"重试"按钮，needBind 有"输入邀请码"按钮。
   两个按钮要做的事完全不同，所以必须是两个状态。

④ if (this._loading) return;
   下拉刷新和"加载更多"可能同时触发，
   不挡就会插进来两个请求，列表里出现重复行。
```

**注意：** **`app.globalData.ready` 可能是 rejected（登录失败 或 需要绑定）。**

**`await` 一个 rejected promise 会抛错，被 `catch` 捕获。** **这个设计在这里刚好合用——** **因为 `catch` 里能通过 `err.code` 分辨是"网络炸了"还是"该绑定了"。**

## 2.4 绑定页

**新建 `pages/bind/index.js`：**

```js
const { bind } = require('../../utils/request');

Page({
  data: {
    code: '',
    submitting: false,
    error: '',
  },

  onInput(e) {
    this.setData({
      code: String(e.detail.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
    });
  },

  async onSubmit() {
    if (this.data.submitting) return;

    const code = this.data.code;

    if (code.length !== 6) {
      this.setData({ error: '邀请码是 6 位，请检查' });
      return;
    }

    this.setData({ submitting: true, error: '' });

    try {
      await bind(code);

      wx.showToast({ title: '绑定成功', icon: 'success' });

      // 让 app 的 ready 重新跑一次，此时能拿到 token
      getApp().relogin(true);

      setTimeout(() => wx.reLaunch({ url: '/pages/orders/index' }), 600);
    } catch (err) {
      this.setData({ submitting: false, error: err.message || '绑定失败' });
    }
  },

  goBack() {
    wx.reLaunch({ url: '/pages/orders/index' });
  },
});
```

**`pages/bind/index.wxml`：**

```xml
<view class="page">
  <view class="bind">
    <view class="bind__title">输入邀请码</view>
    <view class="bind__text">
      请向公司管理员索要 6 位邀请码。\n邀请码 7 天内有效，只能用一次。
    </view>

    <input
      class="bind__input"
      type="text"
      maxlength="6"
      placeholder="6 位字母或数字"
      value="{{code}}"
      bindinput="onInput"
    />

    <view class="bind__error" wx:if="{{error}}">{{error}}</view>

    <button
      class="btn btn--primary btn--block"
      bindtap="onSubmit"
      loading="{{submitting}}"
      disabled="{{submitting || code.length !== 6}}"
    >
      {{submitting ? '绑定中' : '确认绑定'}}
    </button>

    <view class="bind__back" bindtap="goBack">先随便看看</view>
  </view>
</view>
```

**`pages/bind/index.wxss`：**

```css
@import '../../app.wxss';

.page {
  padding: 64rpx 48rpx;
  min-height: 100vh;
  box-sizing: border-box;
}

.bind__title {
  font-size: 44rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 16rpx;
}

.bind__text {
  font-size: 28rpx;
  line-height: 1.7;
  color: #6b7280;
  margin-bottom: 56rpx;
  white-space: pre-line;
}

.bind__input {
  height: 112rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 16rpx;
  padding: 0 32rpx;
  font-size: 44rpx;
  font-family: ui-monospace, Menlo, monospace;
  letter-spacing: 12rpx;
  text-align: center;
  text-transform: uppercase;
  margin-bottom: 24rpx;
}

.bind__error {
  min-height: 40rpx;
  font-size: 26rpx;
  color: #c1121f;
  margin-bottom: 32rpx;
}

.bind__back {
  margin-top: 48rpx;
  text-align: center;
  font-size: 28rpx;
  color: #9ca3af;
}
```

**`pages/bind/index.json`（这个文件最容易忘）：**

```json
{
  "navigationBarTitleText": "绑定账号"
}
```

**新建页面是四个文件，不是三个。** **少了 `.json` 小程序照样能跑，但那个页面顶部没有标题，看着像没做完。** **内容就一行，写它就是省掉一次"为什么这个页面和别的页面不一样"的疑问。**

**加进 `app.json`：**

```json
"pages": [
  "pages/orders/index",
  "pages/order-detail/index",
  "pages/mine/index",
  "pages/order-new/index",
  "pages/health/index",
  "pages/bind/index"
]
```

**五个设计点：**

**一、输入框自己清洗字符，不依赖后端。**

```js
.replace(/[^A-Z0-9]/g, '').slice(0, 6)
```

**客户从微信聊天里复制邀请码，会带上空格、全角字符、甚至前后换行。** **在 `onInput` 里洗掉，客户粘贴进来就是干净的 6 位。**

**不洗的话，客户粘贴 → 提交 → 后端说"格式不对"→ 他看不出来哪里有空格。**

**二、`text-transform: uppercase` + `toUpperCase()` 两处都要。**

**CSS 那个只管显示，`setData` 里的值还是小写。** **只写 CSS，客户看到的是大写，提交的是小写，后端 `toUpperCase()` 能兜住——** **但你的前端"6 位才能提交"的判断用的是原始值，长度对得上的话没问题；一旦将来加了字母校验就会错。**

**两处都做，永远一致。**

**三、`letter-spacing: 12rpx` 让 6 位码看起来像 6 位。**

**不加的话，客户一眼看不出自己输了几位，删错了也不知道。**

**四、成功后 `reLaunch` 而不是 `navigateBack`。**

**因为绑定页可能是从"游客态列表页" `navigateTo` 过来的。`navigateBack` 回到那个页面，它的 `data.needBind` 还是 `true`，还是显示"输入邀请码"。**

**`reLaunch` 把整个栈清掉重开，一切从零开始，最干净。**

**五、"先随便看看"这个入口不能少。**

**客户打开小程序，第一屏就是"输入邀请码"，而他手上没有码——** **他会直接关掉。**

**给一个"先随便看看"，他至少能看到"这个系统里有什么"，然后再去找管理员要码。** **这是转化率问题，不是技术问题。**

**（这个按钮现在回到的列表页仍然会显示"需要绑定"——因为确实没绑。但它至少让客户知道"小程序能打开"，而不是"这个 App 坏了"。）**

---

# 第 3 步：故意做错三次 + 跑通绑定（40 分钟）

## 3.1 错误一：把 `session_key` 返回给前端

**在路由里加：**

```js
res.json({ token, openid: session.openid, session_key: session.session_key });
```

**然后用抓包工具（或者开发者工具的 Network）看响应。**

**你会看到 `session_key` 明文躺在响应里。**

**这等于把你的"解密钥匙"交给了客户。**

**删掉。**

**记住这条规矩：**

```text
session_key 只在服务端用，永远不出现在：
① 响应体
② 日志
③ 数据库（除非加密存）
```

## 3.2 错误二：用 `openid` 当用户身份

**把 `jwt.sign({ uid: row.user_id }, ...)` 改成：**

```js
jwt.sign({ openid: session.openid }, ...)
```

**然后 `auth.js` 里试着用它：**

```js
const { rows } = await pool.query(
  'select id, email, role, tenant_id from users where openid = $1',
  [payload.openid]
);
```

**跑不起来——`users` 表没有 `openid` 列。**

**而且就算你加了这个列，也会遇到：**

```text
① 客户换了小程序 → openid 变了 → 找不到用户 → 数据全丢
② 客户在公众号里 → 另一个 openid → 又是新用户
```

**改回来。**

**记住：** **`openid` 是"外部系统的标识"，`user_id` 才是"你的系统的身份"。**

## 3.3 错误三：不处理 `45011`

**在 `code2session` 的错误映射里删掉 `45011`。**

**然后快速点十次"刷新"（或者写个循环调 `/api/auth/wechat`）。**

**你会看到：**

```text
微信登录失败（45011）
```

**客户看到这句话完全不知道怎么办。**

**加回来：** **"登录太频繁，请稍后再试"。**

**这一条在真实场景里很容易出现：** **客户在小程序里反复进出、网络不稳时重试。**

## 3.4 自检点

**三个都改回来之后：**

```text
① 响应里没有 session_key
② token 里的 payload 是 { uid: 'uuid' }
③ 快速重试能看到"登录太频繁"的中文提示
```

## 3.5 还要验一遍绑定流程（这是这一节的核心）

**光看代码没用，要真的把六种情况跑一遍。**

**准备：先在网页版给某个成员生成一个邀请码。**

```text
curl -X POST http://localhost:3000/api/members/<成员id>/invite -b cookies.txt
```

**期望：**

```json
{"code":"K7M2PQ","expiresAt":"2026-11-24T...","for":{"id":"...","email":"..."},"hint":"..."}
```

**把这个码记下来，下面要用。然后逐条跑：**

**① 全新微信用户，第一次登录 → 应该拿不到 token**

```text
curl -X POST http://localhost:3000/api/auth/wechat -H "Content-Type: application/json" -d "{\"code\":\"test-code-001\"}"
```

**期望：**

```json
{"token":null,"needBind":true,"bindTicket":"eyJ...","expiresIn":604800}
```

**如果返回了一个非 null 的 `token`，说明自动绑定的代码没删干净。**

**② 用这个 bindTicket + 邀请码绑定 → 应该拿到 token**

```text
curl -X POST http://localhost:3000/api/auth/wechat/bind -H "Content-Type: application/json" -d "{\"bindTicket\":\"<上一步的>\",\"inviteCode\":\"K7M2PQ\"}"
```

**期望：**

```json
{"token":"eyJ...","needBind":false,"expiresIn":604800}
```

**③ 用同一个 bindTicket 再绑一次 → 应该 409 `ALREADY_BOUND`**

**为什么不是 200：** **因为这个 openid 已经有 `user_id` 了。** **再绑一次等于"改绑"，那是另一个功能（换账号），不能让它悄悄发生。**

**④ 换一个新 openid（换一个 code），用同一个邀请码绑 → 应该 409 `USED`**

**这一步验证的是码的一次性。**

**⑤ 换一个新 openid，用一个不存在的码 → 应该 404 `NOT_FOUND`**

**⑥ 用刚绑好的 token 打 `/api/me` → 应该返回那个成员的信息**

```text
curl http://localhost:3000/api/me -H "Authorization: Bearer <上一步的token>"
```

**期望的 `user.email` 应该等于生成邀请码时那个成员。** **如果等于"租户第一个账号"，说明你还在用旧逻辑。**

**六条全过，这一节才算做完。**

**最后再验一条**反向**的：**

**⑦ 直接查数据库，确认 `wechat_users` 里只有一条记录，`user_id` 指向你指定的那个人**

```sql
select w.open_id, w.user_id, u.email
from wechat_users w left join users u on u.id = w.user_id;
```

**只有一条，而且 `email` 对得上。** **如果有多条 `user_id` 为 null 的游客记录，说明你在 `/auth/wechat` 里插了记录（这一节的设计是不插）。**

---

# 第 4 步：最终验收

## A. 表

- [ ] `wechat_users` 有 `unique (app_id, open_id)`
- [ ] 有 `union_id`（可空）
- [ ] `user_id` 可以为 null
- [ ] `user_id` 外键是 `on delete cascade`（不是 `set null`）
- [ ] 有 `last_login_at`
- [ ] 有 RLS（`enable` + `force`）
- [ ] `invite_codes` 有 `used_at` / `used_by` / `attempts` / `expires_at`

## B. 接口

- [ ] `POST /api/auth/wechat` 接收 `code`
- [ ] 未绑定时返回 `token: null` + `needBind: true` + `bindTicket`
- [ ] **没有**任何"自动绑定租户第一个账号"的代码
- [ ] `POST /api/auth/wechat/bind` 接收 `bindTicket` + `inviteCode`
- [ ] `code2session` 有 mock 模式
- [ ] 错误码翻译成中文
- [ ] **不返回** `session_key`

## C. 身份

- [ ] token 里只有 `uid`
- [ ] `bindTicket` 里只有 `openid`，和 token 是两种东西
- [ ] 不用 `openid` 当用户 id
- [ ] 知道 `openid` / `unionid` / `user_id` 三者的区别
- [ ] **能说出为什么 `bindTicket` 必须是 10 分钟而不是 7 天**

## D. 连接

- [ ] `src/db/system-pool.js` 存在，`.env` 有 `SYSTEM_DATABASE_URL`
- [ ] 登录路由用的是 `systemPool`，不是 `pool`
- [ ] 知道为什么这个路由**不可能**用 `withTenant`（死循环）

## E. 绑定流程

- [ ] 网页版能生成邀请码（`POST /api/members/:userId/invite`）
- [ ] 生成新码时旧码会被作废
- [ ] 码用 `crypto.randomBytes`，不是 `Math.random`
- [ ] 未绑定登录 → 拿到 `bindTicket`
- [ ] 用正确码绑定 → 拿到 token
- [ ] 同一个码用第二次 → 409 `USED`
- [ ] 同一个 bindTicket 绑第二次 → 409 `ALREADY_BOUND`
- [ ] 不存在的码 → 404 `NOT_FOUND`
- [ ] 绑完 `curl /api/me` 返回的是**那个指定成员**，不是"租户第一个人"

## F. 客户端

- [ ] `loginPromise` 做并发合并
- [ ] `needBind` 抛的是 `code: 'NEED_BIND'` 的特定错误，不是普通 Error
- [ ] 列表页有 `needBind` 这个独立状态（不是塞进 `error`）
- [ ] `pages/bind/index` 能输入、能提交、成功后会 `reLaunch`
- [ ] `app.js` 有 `relogin()`，绑定页复用它
- [ ] `app.json` 里加了 `pages/bind/index`

## G. 三个错误

- [ ] 我返回过 `session_key`，看到它在响应里
- [ ] 我试过用 `openid` 当身份，发现行不通
- [ ] 我删过 `45011` 的处理，看到客户看不懂的报错

## H. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"`session_key` 永不下发"
- [ ] 我记下了"没绑定时返回 200 + needBind，不能返回 401"（否则客户端死循环）
- [ ] 我记下了"`for update` 是防同码两用的唯一手段"

## 提交

```text
git add -A
git commit -m "第193节课: code2session + openid 映射 + loginPromise 并发合并"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `invalid code` (40029) | code 用过或超过 5 分钟 | 重新 `wx.login()` |
| `45011` | 登录太频繁 | 退避重试；用 `loginPromise` 合并 |
| `40163` | code 已被使用 | 同上 |
| `session_key` 出现在响应里 | 忘了过滤 | 只返回 `token` |
| 小程序里一直 401 | token 没存或者没带 | 检查 `wx.setStorageSync` |
| 换手机登录后数据没了 | 用了 `openid` 当身份 | 改用 `user_id` |
| 公众号和小程序不是同一个人 | `openid` 不同 | 用 `unionid` |
| `NO_TENANT` | 数据库里没有租户 | 先跑 `seed.js` |
| mock 模式下 openid 每次都变 | `code` 每次都不同 | 正常；mock 是按 code 哈希的 |
| 生产环境忘了关 mock | `WECHAT_MOCK=1` | 加启动检查 |

---

## 本节课要能说出口的一句话

> **微信登录的本质是"code 换 openid，openid 换你自己的 user_id"；任何把 openid 当用户身份、或者把 session_key 下发到前端的做法，都是把安全和数据可迁移性一起丢掉。**
