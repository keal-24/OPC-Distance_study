# 第 178 节课：3 秒内必须回

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课的核心只有一句话：**回调只做两件事——把事件记下来、立刻回 200。所有重活全部丢到后台。**
> 听起来简单，但它决定了你的应用在平台眼里是"健康的"还是"不健康的"。**不健康的会被平台降权、限流、甚至停用。**

**建议用时**：160 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（80 分钟）一次，第 3—5 步（80 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 177 节课（token 缓存和自动重试都跑通）

---

# 第 0 步：先看清"3 秒"有多短（15 分钟）

## 0.1 3 秒能做什么

```text
一次数据库插入              5—20ms      ✅ 可以
一次 Redis 读取             1—3ms       ✅ 可以
一次平台 API 调用            100—500ms   ⚠️ 勉强，但不该在回调里做
一次大模型调用               2000—15000ms ❌ 绝对不行
一次 Excel 解析（1 万行）     500—3000ms  ❌ 不行
一次文件上传到对象存储        300—2000ms  ⚠️ 不该在回调里做
```

**结论：**

```text
回调里只能做"本地的、快的、不会失败的事"
——也就是：插一条记录，然后 return
```

## 0.2 超时之后发生什么

**平台的行为（以飞书为例）：**

```text
① 3 秒没收到响应 → 记为一次失败
② 过一会儿重推（间隔递增）
③ 重推 3—5 次都失败 → 标记为"投递失败"
④ 部分平台的"失败率"会影响应用健康度
⑤ 健康度低的：降低配额、限制接口调用
```

**你的行为（如果不做处理）：**

```text
每次重推都触发一次大模型调用
→ 每次都超时
→ 客户在群里看到 3 条一样的回复
→ 你的模型费用花了 3 倍
→ 平台把你的应用标记为不健康
```

**最坏的情况：**

```text
客户收到 5 条重复消息 → 投诉"你们系统有 bug"
你查日志发现"平台重复推送"
然后你回客户"是平台的问题"
客户："那是你的系统没做好"
```

**客户说得对。**

## 0.3 正确的架构

```text
平台 ──POST──→ 你的回调
                 │
                 ├─ ① 验签（1ms）
                 ├─ ② 判断事件类型（0.1ms）
                 ├─ ③ 插入 platform_events（10ms，唯一约束去重）
                 ├─ ④ 返回 200（总计 < 50ms）
                 │
                 └─ 后台：读 platform_events 里 pending 的
                          → 真正处理
                          → 标记 done
```

**这个模式有个名字：`acknowledge-then-process`（先应答后处理）。**

**它是所有 webhook 系统的标准做法。你以后接任何平台都用这个。**

---

# 第 1 步：事件留档表（25 分钟）

**为什么要落库，而不是内存队列排队：**

```text
内存队列：服务重启 → 未处理的事件全丢
          无法查历史 → 客户说"我没收到通知"，你查不到
          无法重放 → 处理失败了，只能等平台重推

落库：    重启不丢
          可查、可重放、可统计
          平台重推时靠唯一约束自动去重
```

## 1.1 建表

**新建 `migrations/017_platform_events.sql`：**

```sql
create table platform_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade,
  platform      text not null,
  event_id      text not null,
  event_type    text not null,
  payload       jsonb not null,
  status        text not null default 'pending',
  attempts      integer not null default 0,
  last_error    text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  next_retry_at timestamptz not null default now()
);

create unique index platform_events_dedup_idx
  on platform_events (platform, event_id);

create index platform_events_pending_idx
  on platform_events (next_retry_at)
  where status in ('pending', 'failed');

create index platform_events_tenant_time_idx
  on platform_events (tenant_id, received_at desc);

alter table platform_events enable row level security;
alter table platform_events force row level security;

-- 只对 app_user 生效：业务侧永远只看得到自己租户的事件。
-- 未归属（tenant_id is null）的记录只有 app_system 能读写。
create policy tenant_isolation on platform_events
  for all
  to app_user
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

## 1.2 四处要讲清

### `unique index on (platform, event_id)`

**这是幂等的全部基础。**

**平台重推同一个事件时，`event_id` 不变，插入会失败。**

**你捕获 `23505` 就返回 200——**"我已经处理过了，你不用再推"。**

**注意：唯一索引不带 `tenant_id`。**

**为什么：** 因为验签之前你还不知道这是哪个租户。**`event_id` 是平台侧全局唯一的，加 `tenant_id` 反而会让去重失效。**

**这一处和前面所有表都不同。** 前面所有业务表都必须带 `tenant_id`（第 163 节的规矩），**但事件表是"未归属"的收件箱**。

### `tenant_id` 可为空

**因为事件到达时，你可能还不知道它是哪个租户的。**

**流程：**

```text
① 收到事件 → tenant_id 是 null（收件箱）
② 验签 + 解析出平台的 tenant_key / corp_id
③ 查到对应的 platform_apps → 得到 tenant_id
④ 更新这条事件的 tenant_id
```

**如果第 ③ 步查不到（未知的应用），这条事件就保持 null，进"待处理"。**

### 那个 `to app_user` 是这一段最重要的六个字

**很多人（包括我第一版）会把策略写成这样：**

```sql
using (
  tenant_id is null                          -- ❌
  or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
)
```

**理由听起来很合理：** **"插入时 `tenant_id` 还是空的，不加这个分支就插不进去啊。"**

**但这句话打开了一个真实的越权通道。**

**看清后果：**

```text
租户 A 的某个后台页面查 platform_events
→ using 里两个分支，第二个不成立，第一个成立（tenant_id is null）
→ 于是 A 读到了所有"还没归属"的事件
→ 那些事件的 payload 里有 B 公司的消息内容、员工 open_id、群 ID
```

**而且这类越权最容易发生在"你自己加的排查页面上"。** **你为了看"有没有卡住的事件"，写了个 `select * from platform_events where status = 'failed'`——** **在旧策略下，它会把所有客户的事件都吐给你。**

**`to app_user` 怎么解决这个问题：**

**它把策略的适用范围限定到 `app_user` 这一个角色。** **而插入那些 `tenant_id` 为空的记录，走的是 `app_system`（有 `bypassrls`）——** **它本来就不受任何策略约束。**

**所以：**

```text
app_system 插入 tenant_id 为空的记录     → 不受策略约束，能插
app_user 想读到 tenant_id 为空的记录     → 策略不通过，0 行
```

**两边都对。**

**这是"策略要有意漏口子"时的标准手法。** **它比在 `using` 里写 `or` 安全，因为：**

```text
or  → "对所有连接都成立的例外"   ← 每个租户都能钻
to  → "只对某个角色不设限"       ← 只有那条连接能钻，而那条连接只在你手上
```

**判据：** **只要你想在策略里写 `or ... is null`，先问一句"这个例外是给谁的"。** **如果是"给系统进程用的"，就改成 `to 系统角色`。**

**⚠️ 如果你跳过了第 165 节的 5.3（没建 `app_user` / `app_system`），这条 `to app_user` 会直接报错：**

```text
ERROR:  role "app_user" does not exist
```

**这个报错是好消息——它逼你回去把角色建好。** **没有那两个角色，这一节的 RLS 全是摆设。**

### `status` 的四个值

```text
pending     收到，还没处理
processing  正在处理（防止两个 worker 抢同一个）
done        处理完成
ignored     不认识的事件类型，或者不需要处理
failed      处理失败，会重试
```

**`ignored` 和 `failed` 的区别很重要：**

```text
ignored  → 不重试，也不需要告警
failed   → 要重试，超过次数要告警
```

### `next_retry_at`

**这是重试调度的核心。**

```sql
create index on platform_events (next_retry_at) where status in ('pending','failed');
```

**worker 扫的是 `where status in ('pending','failed') and next_retry_at <= now()`。**

**`next_retry_at` 初始值是 `now()`，所以新事件立刻可处理。失败后往后推。**

---

# 第 2 步：回调接口（40 分钟）

## 2.1 先写验签（三种平台三种算法）

**新建 `src/platform/verify.js`：**

```js
const crypto = require('crypto');

function timingEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyFeishu({ headers, rawBody, encryptKey }) {
  const ts = headers['x-lark-request-timestamp'];
  const nonce = headers['x-lark-request-nonce'];
  const given = headers['x-lark-signature'];

  if (!ts || !nonce || !given) {
    return { ok: false, reason: 'MISSING_SIGNATURE_HEADERS' };
  }

  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > 300) {
    return { ok: false, reason: 'TIMESTAMP_TOO_OLD' };
  }

  const expected = crypto
    .createHmac('sha256', encryptKey)
    .update(ts + nonce + rawBody)
    .digest('base64');

  if (!timingEqual(given, expected)) {
    return { ok: false, reason: 'SIGNATURE_MISMATCH' };
  }

  return { ok: true };
}

function verifyWecom({ query, rawBody, token, encryptKey }) {
  const { msg_signature: given, timestamp: ts, nonce } = query || {};

  if (!given || !ts || !nonce) {
    return { ok: false, reason: 'MISSING_SIGNATURE_PARAMS' };
  }

  const parts = [token, ts, nonce, rawBody].filter(Boolean).sort();
  const expected = crypto
    .createHash('sha1')
    .update(parts.join(''))
    .digest('hex');

  if (!timingEqual(given, expected)) {
    return { ok: false, reason: 'SIGNATURE_MISMATCH' };
  }

  return { ok: true };
}

function verifyDingtalk({ headers, timestamp, sign, appSecret }) {
  const given = sign || headers['sign'];
  const ts = timestamp || headers['timestamp'];

  if (!given || !ts) {
    return { ok: false, reason: 'MISSING_SIGNATURE_PARAMS' };
  }

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(String(ts))
    .digest('base64');

  if (!timingEqual(given, expected)) {
    return { ok: false, reason: 'SIGNATURE_MISMATCH' };
  }

  return { ok: true };
}

module.exports = { verifyFeishu, verifyWecom, verifyDingtalk, timingEqual };
```

## 2.2 三种算法的差异，记下来

| 平台 | 算法 | 拼什么 | 输出 |
|---|---|---|---|
| 飞书 | HMAC-SHA256 | `timestamp + nonce + body` | base64 |
| 企微 | SHA1 | `token/ts/nonce/加密body` **排序后拼接** | hex |
| 钉钉 | HMAC-SHA256 | `timestamp`（没有 body！） | base64 |

**三个重要差异：**

### 飞书要拼 body，钉钉不拼

**飞书的签名覆盖了请求体，改一个字节都验不过。**

**钉钉的签名只覆盖 timestamp，** **这意味着钉钉的签名不能防"篡改请求体"**——只能防"重放"（因为 timestamp 有时效）。

**这是个真实的安全差异。钉钉的防护靠"加密模式"（body 整体加密），不靠签名。**

### 企微要排序后拼接

```js
const parts = [token, ts, nonce, rawBody].filter(Boolean).sort();
```

**企微官方文档写的是"字典序排序后拼接"，字符串排序。**

**不排序会一直验签失败，而且报错是"签名错误"，不会告诉你"你没排序"。**

**这个坑会耗你一小时。**

### 飞书要检查时间戳

```js
const skew = Math.abs(Date.now() / 1000 - Number(ts));
if (!Number.isFinite(skew) || skew > 300) {
  return { ok: false, reason: 'TIMESTAMP_TOO_OLD' };
}
```

**这是防重放：攻击者截获一个合法请求，5 分钟后重发。**

**300 秒（5 分钟）是常见容差。太小会误杀（时钟偏差），太大失去意义。**

## 2.3 回调路由

**关键点：验签需要原始 body 字符串，不是解析后的对象。**

**所以不能用 `express.json()` 直接解析。**

**改 `src/server.js`：**

```js
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
```

**这样每个请求都会把原始 body 存到 `req.rawBody`。**

**注意内存代价：** 大文件上传的请求不需要这个，但 2MB 上限内没问题。

**新建 `src/routes/webhook-platform.js`：**

```js
const express = require('express');
const systemPool = require('../db/system-pool');
const { verifyFeishu, verifyWecom, verifyDingtalk } = require('../platform/verify');
const { normalizeIncoming } = require('../platform/adapter');

const router = express.Router();

function pickPlatform(req) {
  const p = String(req.params.platform || '').toLowerCase();
  if (['feishu', 'wecom', 'dingtalk'].includes(p)) return p;
  return null;
}

async function loadAppConf(platform) {
  const { rows } = await pool.query(
    `select tenant_id, app_id, app_secret_enc, verify_token, encrypt_key
     from platform_apps
     where platform = $1 and status = 'active'
     order by last_ok_at desc nulls last
     limit 1`,
    [platform]
  );

  if (rows.length === 0) return null;

  const { decrypt } = require('../crypto/secret-box');
  return {
    tenantId: rows[0].tenant_id,
    appId: rows[0].app_id,
    appSecret: decrypt(rows[0].app_secret_enc),
    verifyToken: rows[0].verify_token,
    encryptKey: rows[0].encrypt_key,
  };
}

router.post('/:platform', async (req, res) => {
  const platform = pickPlatform(req);
  if (!platform) {
    return res.status(404).json({ error: 'unknown platform' });
  }

  const rawBody = req.rawBody || '';
  const conf = await loadAppConf(platform);

  if (!conf) {
    console.error('[webhook] 没有 ' + platform + ' 的应用配置');
    return res.status(503).json({ error: 'platform app not configured' });
  }

  let verified;

  if (platform === 'feishu') {
    verified = verifyFeishu({
      headers: req.headers,
      rawBody,
      encryptKey: conf.encryptKey || conf.appSecret,
    });
  } else if (platform === 'wecom') {
    verified = verifyWecom({
      query: req.query,
      rawBody,
      token: conf.verifyToken,
      encryptKey: conf.encryptKey,
    });
  } else {
    verified = verifyDingtalk({
      headers: req.headers,
      timestamp: req.query.timestamp,
      sign: req.query.sign,
      appSecret: conf.appSecret,
    });
  }

  if (!verified.ok) {
    console.warn('[webhook] 验签失败', platform, verified.reason);
    return res.status(401).json({ error: 'signature invalid', reason: verified.reason });
  }

  const body = req.body || {};

  if (platform === 'feishu' && body.type === 'url_verification') {
    console.log('[webhook] 飞书 URL 验证');
    return res.json({ challenge: body.challenge });
  }

  let normalized;

  try {
    normalized = normalizeIncoming(platform, body, conf);
  } catch (err) {
    console.error('[webhook] 归一化失败', platform, err.message);
    return res.status(200).json({ ok: true, ignored: true, reason: 'NORMALIZE_FAILED' });
  }

  if (!normalized) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  try {
    // 用 systemPool：这条 insert 可能写 tenant_id = null（未归属），
    // 而 app_user 的策略不允许它写/读 null 的行（见 1.1 的 to app_user）
    const inserted = await systemPool.query(
      `insert into platform_events
         (tenant_id, platform, event_id, event_type, payload)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (platform, event_id) do nothing
       returning id`,
      [
        normalized.tenantId || conf.tenantId || null,
        platform,
        normalized.eventId,
        normalized.eventType,
        JSON.stringify(body),
      ]
    );

    if (inserted.rowCount === 0) {
      console.log('[webhook] 重复事件，已忽略', platform, normalized.eventId);
    }

    return res.status(200).json({ ok: true, duplicated: inserted.rowCount === 0 });
  } catch (err) {
    console.error('[webhook] 落库失败', err.message);
    return res.status(500).json({ error: 'temporary failure' });
  }
});

module.exports = router;
```

**注意 `systemPool` 这个改动——它不是可选的。**

**这条 `insert` 的参数里有个 `|| null`：**

```js
normalized.tenantId || conf.tenantId || null
```

**也就是说，如果两个都拿不到，它插的就是 `tenant_id = null`。**

**而我们在 1.1 把策略改成了 `to app_user` 且 `with check (tenant_id = ...current_setting...)`——** **`current_setting` 没设值时是 `null`，`null = null` 在 SQL 里不成立（返回 `null`，当作假）。**

**所以用 `app_user` 插 `tenant_id = null` 会被直接拒绝：**

```text
ERROR:  new row violates row-level security policy for table "platform_events"
```

**改成 `systemPool` 才能插进去。**

**这就是"两条连接各有分工"的具体样子：**

```text
systemPool  → 收件箱（可能没有租户）  → 能写 null
pool        → 业务读写（一定有租户）  → 只能写自己租户
```

**同时改一下顶部的 `require`：**

```js
const express = require('express');
const systemPool = require('../db/system-pool');
const { verifyFeishu, verifyWecom, verifyDingtalk } = require('../platform/verify');
const { normalizeIncoming } = require('../platform/adapter');
```

**把 `const pool = require('../db/pool');` 整个换成 `systemPool`。** **这个文件里所有 SQL 都是"回调路径"的，本来就都在"还不知道租户"的阶段。**

**（如果你后面在这个文件里加了别的查询，注意区分：读业务数据要用 `withTenantFromPool`，不能用这里的 `systemPool`。）**

## 2.4 六个关键点

### URL 验证要放在验签之后还是之前

**飞书首次配置事件订阅时，会发一个：**

```json
{ "type": "url_verification", "challenge": "abc123", "token": "..." }
```

**你必须原样返回 `{ "challenge": "abc123" }`。**

**放在验签之后对不对？**

**飞书的 URL 验证请求**也带签名**（如果配了加密）。所以放在验签之后是安全的。**

**但如果你配的是"明文模式"，这个请求可能没有签名头。**

**保险做法：**

```js
if (platform === 'feishu' && body.type === 'url_verification') {
  // 可以额外检查 body.token === conf.verifyToken
  return res.json({ challenge: body.challenge });
}
```

**并且把它放在验签**之前**，或者对 `url_verification` 单独放行。**

**这一节放在验签之后，因为假平台会带签名。** **如果你接真实飞书遇到问题，就把这个判断提到验签前面。**

### `encryptKey || appSecret`

```js
verifyFeishu({ ..., encryptKey: conf.encryptKey || conf.appSecret });
```

**飞书的签名算法用的是 `Encrypt Key`（如果你配了加密），否则用 `App Secret`。**

**标准配置是配了 `Encrypt Key` 的。这个 fallback 是给简化配置用的。**

### 重复事件返回 200，不返回 409

```js
return res.status(200).json({ ok: true, duplicated: true });
```

**为什么：**

**平台看到非 2xx 会重推。而你"已经处理过了"这件事，对平台来说等同于"成功"。**

**返回 409 会让平台一直重推，你一直返回 409，最后被标记为失败。**

**"重复"不是错误，是正常的幂等行为。**

### 归一化失败也返回 200

```js
if (!normalized) return res.status(200).json({ ok: true, ignored: true });
```

**因为"这个事件我不关心" ≠ "我处理失败了"。**

**平台的几百种事件里，你只关心十几种。剩下的返回 200 让平台别推了。**

### 落库成功就返回，不等待处理

```js
return res.status(200).json({ ok: true, duplicated: false });
```

**整个回调里没有任何"业务处理"。**

**这就是 3 秒限制的解法。**

### 落库失败返回 500

```js
return res.status(500).json({ error: 'temporary failure' });
```

**这是唯一该返回 500 的情况：你的数据库挂了。**

**这时候让平台重推是对的——** **因为你确实没收到。**

## 2.5 写归一化层

**新建 `src/platform/adapter.js`：**

```js
function normalizeFeishu(body, conf) {
  const header = body.header || {};
  const event = body.event || {};

  const eventId = header.event_id;
  const eventType = header.event_type;

  if (!eventId || !eventType) {
    return { eventId: 'unknown-' + Date.now(), eventType: 'unknown', payload: body };
  }

  const map = {
    'im.message.receive_v1': {
      type: 'message.received',
      build: () => ({
        chatId: event.message && event.message.chat_id,
        messageId: event.message && event.message.message_id,
        senderOpenId: event.sender && event.sender.sender_id && event.sender.sender_id.open_id,
        text: extractText(event.message && event.message.content),
      }),
    },
    'im.chat.member.user.added_v1': {
      type: 'chat.member_added',
      build: () => ({
        chatId: event.chat_id,
        users: (event.users || []).map((u) => u.name),
      }),
    },
    'card.action.trigger': {
      type: 'card.action',
      build: () => ({
        openId: body.open_id,
        messageId: body.open_message_id,
        action: body.action && body.action.value,
      }),
    },
  };

  const hit = map[eventType];

  return {
    eventId,
    eventType: hit ? hit.type : eventType,
    tenantId: conf && conf.tenantId,
    payload: hit ? hit.build() : event,
  };
}

function extractText(content) {
  if (!content) return '';
  try {
    const obj = typeof content === 'string' ? JSON.parse(content) : content;
    return obj.text || '';
  } catch (err) {
    return '';
  }
}

function normalizeWecom(body, conf) {
  const msgType = body.MsgType || 'unknown';
  const eventId =
    body.MsgId ||
    body.EventKey ||
    'wecom-' + (body.CreateTime || Date.now()) + '-' + Math.random().toString(36).slice(2, 8);

  const map = {
    text: 'message.received',
    event: 'event.' + String(body.Event || 'unknown').toLowerCase(),
  };

  return {
    eventId: String(eventId),
    eventType: map[msgType] || msgType,
    tenantId: conf && conf.tenantId,
    payload: body,
  };
}

function normalizeDingtalk(body, conf) {
  const eventId =
    body.eventId ||
    body.EventId ||
    'dingtalk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  return {
    eventId: String(eventId),
    eventType: body.EventType || body.eventType || 'unknown',
    tenantId: conf && conf.tenantId,
    payload: body,
  };
}

function normalizeIncoming(platform, body, conf) {
  if (platform === 'feishu') return normalizeFeishu(body, conf);
  if (platform === 'wecom') return normalizeWecom(body, conf);
  if (platform === 'dingtalk') return normalizeDingtalk(body, conf);
  return null;
}

module.exports = { normalizeIncoming, extractText };
```

## 2.6 为什么要有这一层

**路由层只认"归一化后的事件"。**

```js
{
  eventId: 'ev_xxx',
  eventType: 'message.received',      // 平台无关
  tenantId: 'xxx',
  payload: { chatId, text, senderOpenId }
}
```

**这样：**

```text
接第二家平台时  → 写一个新的 normalizeXxx
事件处理逻辑    → 一行不改
```

**这就是第 176 节说的"路由层不知道是哪家平台"。**

**现在它实现了。**

---

# 第 3 步：后台处理（35 分钟）

## 3.1 写 worker

**新建 `src/platform/worker.js`：**

```js
const pool = require('../db/pool');
const { withTenantFromPool } = require('../db/tenant-db');

const HANDLERS = new Map();

function register(eventType, handler) {
  HANDLERS.set(eventType, handler);
}

const MAX_ATTEMPTS = 5;

function backoffSeconds(attempts) {
  const base = Math.min(300, Math.pow(2, attempts) * 5);
  const jitter = Math.floor(Math.random() * 10);
  return base + jitter;
}

async function claimBatch(limit = 10) {
  const { rows } = await pool.query(
    `with picked as (
       select id from platform_events
       where status in ('pending', 'failed')
         and next_retry_at <= now()
       order by next_retry_at
       limit $1
       for update skip locked
     )
     update platform_events e
     set status = 'processing', attempts = e.attempts + 1
     from picked
     where e.id = picked.id
     returning e.id, e.tenant_id, e.platform, e.event_type, e.payload, e.attempts`,
    [limit]
  );
  return rows;
}

async function processOne(row) {
  const handler = HANDLERS.get(row.event_type);

  if (!handler) {
    await pool.query(
      `update platform_events
       set status = 'ignored', processed_at = now()
       where id = $1`,
      [row.id]
    );
    return { id: row.id, result: 'ignored', reason: 'NO_HANDLER' };
  }

  try {
    if (!row.tenant_id) {
      throw new Error('事件没有归属租户，无法处理');
    }

    await withTenantFromPool(row.tenant_id, (db) =>
      handler({ db, event: row, payload: row.payload })
    );

    await pool.query(
      `update platform_events
       set status = 'done', processed_at = now(), last_error = null
       where id = $1`,
      [row.id]
    );

    return { id: row.id, result: 'done' };
  } catch (err) {
    const willRetry = row.attempts < MAX_ATTEMPTS;

    await pool.query(
      `update platform_events
       set status = $1,
           last_error = $2,
           next_retry_at = now() + ($3 || ' seconds')::interval
       where id = $4`,
      [
        willRetry ? 'failed' : 'failed_permanently',
        String(err.message).slice(0, 1000),
        String(backoffSeconds(row.attempts)),
        row.id,
      ]
    );

    return {
      id: row.id,
      result: willRetry ? 'retry_later' : 'gave_up',
      error: err.message,
    };
  }
}

let running = false;

async function tick(limit = 10) {
  if (running) return { skipped: true };
  running = true;

  try {
    const rows = await claimBatch(limit);
    if (rows.length === 0) return { processed: 0 };

    const results = [];
    for (const row of rows) {
      results.push(await processOne(row));
    }

    return { processed: results.length, results };
  } finally {
    running = false;
  }
}

function startLoop(intervalMs = 2000) {
  const timer = setInterval(() => {
    tick().catch((err) => console.error('[worker] tick 失败', err.message));
  }, intervalMs);

  timer.unref?.();
  return timer;
}

module.exports = { register, tick, startLoop, claimBatch, HANDLERS, MAX_ATTEMPTS };
```

## 3.2 四个关键技术点

### `for update skip locked` —— 多个 worker 不打架

```sql
select id from platform_events
where status in ('pending','failed') and next_retry_at <= now()
order by next_retry_at
limit $1
for update skip locked
```

**这是 PostgreSQL 处理"多消费者队列"的标准写法。**

```text
for update        锁住选中的行
skip locked       如果某行已经被别的 worker 锁了，跳过它，不要等
```

**没有 `skip locked`：** 两个 worker 会互相等锁，吞吐量减半。
**没有 `for update`：** 两个 worker 会拿到同一批行，重复处理。

**这一句是这节课技术上最值钱的部分。** 它让你能横向扩 worker，而不用引入 Redis 或消息队列。

### 一条 SQL 完成"认领"

```sql
with picked as (select ... for update skip locked)
update ... from picked where e.id = picked.id
returning ...
```

**`select` 和 `update` 在同一个语句里，所以"选中"和"标记为 processing"是原子的。**

**分开写会有窗口：**

```text
worker A：select 到 id=1
worker B：select 到 id=1        ← 因为 A 还没 update
worker A：update status=processing
worker B：update status=processing   ← 覆盖，两个都处理
```

### `running` 标志防重入

**这一段就是上面 `tick()` 的开头那五行（822—839 行），抽出来看：**

```js
let running = false;

async function tick(limit = 10) {
  if (running) return { skipped: true };   // ← 已经有在跑了，直接退出
  running = true;

  try {
    const rows = await claimBatch(limit);
    if (rows.length === 0) return { processed: 0 };

    const results = [];
    for (const row of rows) {
      results.push(await processOne(row));
    }

    return { processed: results.length, results };
  } finally {
    running = false;                       // ← 必须放 finally
  }
}
```

**因为 `setInterval` 不会等上一次执行完。**

**如果一次 `tick` 花了 3 秒，而间隔是 2 秒，就会有两次 `tick` 并发跑。**

**`running` 标志让第二次直接跳过。**

**`running = false` 必须在 `finally` 里。** **放在 `try` 末尾的话，`claimBatch` 抛错时 `running` 永远是 `true`——** **worker 从此彻底停摆，而且日志里只有一条错误，看起来"只失败了一次"。**

**这是"进程还活着但什么都不干"的典型症状。** **遇到"队列一直不消费"，先看这个标志是不是卡住了。**

**这是最简单有效的防重入。** 比引入锁库轻量得多。

### 指数退避 + 抖动

```js
const base = Math.min(300, Math.pow(2, attempts) * 5);
const jitter = Math.floor(Math.random() * 10);
return base + jitter;
```

**第 1 次失败：10 秒后重试**
**第 2 次：20 秒**
**第 3 次：40 秒**
**第 4 次：80 秒**
**第 5 次：160 秒，然后放弃**

**为什么加抖动：**

**如果 100 个事件同时失败，它们会在同一秒一起重试，把你的数据库打爆。**

**抖动把重试分散在 10 秒的窗口里。**

**这个技巧叫 "jitter"，所有重试系统都该有。**

## 3.3 注册 handler

**先给仓储对象加一个 `tenantId` 字段**（handler 里要用它调平台接口）：

**在 `src/db/tenant-db.js` 的 `createRepo` 里，把返回对象的开头改成：**

```js
function createRepo(client, tenantId) {
  return {
    client,
    tenantId,
    conversations: { ... },
    messages: { ... },
    files: { ... },
    users: { ... },
    exportAll() { ... },
  };
}
```

**然后新建 `src/platform/handlers.js`：**

```js
const { register } = require('./worker');
const { sendText } = require('./client');

register('message.received', async ({ db, payload }) => {
  const text = (payload.text || '').trim();

  console.log('[handler] 收到消息：', text, '来自', payload.senderOpenId);

  if (text === 'ping') {
    await sendText(db.tenantId, 'feishu', payload.chatId, 'pong');
    return;
  }

  if (text === 'slow') {
    await new Promise((r) => setTimeout(r, 10000));
    await sendText(db.tenantId, 'feishu', payload.chatId, '慢的完成了');
    return;
  }

  if (text.startsWith('查')) {
    const keyword = text.slice(1).trim();
    const { rows } = await db.client.query(
      `select order_no, customer_name, amount_cents, status
       from orders
       where tenant_id = $1
         and (order_no ilike $2 or customer_name ilike $2)
       order by created_at desc
       limit 5`,
      [db.tenantId, '%' + keyword + '%']
    );

    if (rows.length === 0) {
      await sendText(db.tenantId, 'feishu', payload.chatId, '没找到「' + keyword + '」相关的订单');
      return;
    }

    const lines = rows.map(
      (r) =>
        `${r.order_no}  ${r.customer_name}  ¥${(r.amount_cents / 100).toFixed(2)}  ${r.status}`
    );

    await sendText(db.tenantId, 'feishu', payload.chatId, lines.join('\n'));
  }
});

register('card.action', async ({ db, payload }) => {
  console.log('[handler] 卡片按钮被点击：', JSON.stringify(payload.action));
});

register('chat.member_added', async ({ db, payload }) => {
  console.log('[handler] 新成员进群：', payload.users && payload.users.join(', '));
});
```

## 3.4 在 `server.js` 里启动 worker

```js
require('./src/platform/handlers');
const { startLoop } = require('./src/platform/worker');

// 在 app.listen 之后
startLoop(2000);
console.log('[worker] 事件处理循环已启动，间隔 2 秒');
```

## 3.5 写 `sendText`

**在 `src/platform/client.js` 里加：**

```js
async function sendText(tenantId, platform, receiveId, text) {
  const data = await callPlatform(tenantId, platform, '/open-apis/im/v1/messages', {
    method: 'POST',
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });

  if (data.code !== 0) {
    throw new Error('发消息失败 code=' + data.code + ' ' + data.msg);
  }

  return data.data;
}

module.exports = { callPlatform, sendText, TOKEN_INVALID_CODES };
```

---

# 第 4 步：验证整条链路（25 分钟）

## 4.1 推一条事件

**先确保：**

```text
窗口 1：npm run dev          （3000，worker 已启动）
窗口 2：node scripts/mock-platform.js  （5000）
```

**推一条：**

```text
curl -X POST http://localhost:5000/mock/push-event -H "Content-Type: application/json" -d "{\"event_type\":\"im.message.receive_v1\",\"text\":\"ping\"}"
```

**你的服务日志应该是：**

```text
[webhook] 收到事件 ...
[worker] ...
[handler] 收到消息： ping 来自 ou_mock_user
```

**假平台日志：**

```text
[mock-platform] 推送事件 ev_xxx im.message.receive_v1
[mock-platform] 回调返回 200，耗时 12ms
```

**注意那个 `12ms`。**

**这就是这节课的核心成果：回调 12ms 就返回了，平台不会超时，不会重推。**

**自检点：检查数据库。**

```sql
select platform, event_id, event_type, status, attempts, received_at, processed_at
from platform_events order by received_at desc limit 5;
```

**应该是 `status = 'done'`，`attempts = 1`。**

## 4.2 推一条"耗时"的事件

**`ping` 很快。测一个慢的。**

**在 handler 里临时加一个 `slow` 分支：**

```js
if (text === 'slow') {
  await new Promise((r) => setTimeout(r, 10000));
  await sendText(db.tenantId, 'feishu', payload.chatId, '慢的完成了');
  return;
}
```

**推：**

```text
curl -X POST http://localhost:5000/mock/push-event -H "Content-Type: application/json" -d "{\"event_type\":\"im.message.receive_v1\",\"text\":\"slow\"}"
```

**看两边的日志：**

```text
你的服务：
[handler] 收到消息： slow ...
（10 秒后）
（发消息成功）

假平台：
[mock-platform] 回调返回 200，耗时 8ms     ← 立刻返回了！
```

**这就是"先应答后处理"的价值。**

**回调 8ms 返回，业务跑了 10 秒。平台完全不知道，也不需要知道。**

**把这句话抄进笔记。** 它是这一整节的核心。

## 4.3 推一个重复事件

**新建 `scripts/replay-event.js`：**

```js
const GATEWAY = process.env.PLATFORM_BASE_URL || 'http://localhost:5000';

(async () => {
  const count = Number(process.argv[2] || 3);

  console.log(`一次推 ${count} 次同一个 event_id`);

  const res = await fetch(GATEWAY + '/mock/push-event-n/' + count, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'im.message.receive_v1',
      text: 'ping',
    }),
  });

  const data = await res.json();
  console.log('event_id：', data.eventId);
  for (const r of data.results) {
    console.log('  ', r.status, r.elapsedMs + 'ms');
  }
})();
```

**跑：**

```text
node scripts/replay-event.js 5
```

**期望：**

```text
event_id： ev_replay_abc123
   200 11ms
   200 6ms
   200 5ms
   200 7ms
   200 6ms
```

**五次都是 200，都在 15ms 内。**

**然后查数据库：**

```sql
select count(*) from platform_events where event_id = 'ev_replay_abc123';
```

**必须是 1。**

**再查 handler 执行了几次：**

**看日志里 `[handler] 收到消息： ping` 出现了几次。**

**必须是 1 次。**

**如果出现 5 次，说明唯一索引没生效——检查 `platform_events_dedup_idx`。**

## 4.4 造一次"数据库挂了"

**这一步可选，但很有价值。**

**把 `.env` 里的 `DATABASE_URL` 改错一个字符，重启服务，推一条事件。**

**预期：**

```text
[mock-platform] 回调返回 503，耗时 3ms      ← loadAppConf 就失败了
```

**等等，`loadAppConf` 查不到配置时返回 503，但这里数据库挂了，会抛错。**

**实际的路径是：**

```text
loadAppConf 抛错 → 未捕获 → Express 的默认错误处理 → 500
```

**这暴露了一个问题：`loadAppConf` 没有 try/catch。**

**改 `src/webhook/receiver.js` 里的 `loadAppConf`（388—408 行），整个换成这版：**

```js
async function loadAppConf(platform) {
  try {
    const { rows } = await pool.query(
      `select tenant_id, app_id, app_secret_enc, verify_token, encrypt_key
       from platform_apps
       where platform = $1 and status = 'active'
       order by last_ok_at desc nulls last
       limit 1`,
      [platform]
    );

    if (rows.length === 0) return null;

    const { decrypt } = require('../crypto/secret-box');

    return {
      tenantId: rows[0].tenant_id,
      appId: rows[0].app_id,
      appSecret: decrypt(rows[0].app_secret_enc),
      verifyToken: rows[0].verify_token,
      encryptKey: rows[0].encrypt_key,
    };
  } catch (err) {
    console.error('[webhook] 读配置失败', err.message);
    return { error: 'DB_DOWN' };
  }
}
```

**然后路由里那段判断（419—422 行）也一起改，因为现在有两个"没配置好"的原因：**

```js
  const conf = await loadAppConf(platform);

  if (!conf) {
    console.error('[webhook] 没有 ' + platform + ' 的应用配置');
    return res.status(503).json({ error: 'platform app not configured' });
  }

  if (conf.error === 'DB_DOWN') {
    return res.status(503).json({ error: 'temporarily unavailable' });
  }
```

**两个都要返回 503，但日志不一样：**

```text
没有配置  → 这是配置问题，你要去补 platform_apps 表
读库失败  → 这是故障，平台重试几次可能就好了
```

**503 是"服务暂时不可用"，平台会重试。这是正确的语义。**

**为什么不返回 500：** **500 在大多数平台的约定里是"你的代码崩了，别重试"。** **数据库闪断恰恰应该重试——返回 500 等于主动放弃这条事件。**

**把数据库改回来。**

---

# 第 5 步：把"3 秒"量化（20 分钟）

**你需要一个数字来证明自己没超时。**

## 5.1 记录耗时

**改 `src/webhook/receiver.js`。三处改动。**

**第一处：`router.post('/:platform', async (req, res) => {` 之后第一行加：**

```js
router.post('/:platform', async (req, res) => {
  const started = Date.now();
  const platform = req.params.platform;
```

**第二处：找到最后那个成功返回（`catch` 块之后那句），换成三行：**

```js
    const elapsed = Date.now() - started;

    res.setHeader('X-Process-Time-Ms', String(elapsed));

    if (elapsed > 1000) {
      console.warn('[webhook] 回调耗时过长', elapsed + 'ms', platform, normalized.eventId);
    }

    return res.status(200).json({ ok: true, duplicated: inserted.rowCount === 0 });
```

**第三处：`database is down` 那个 503 分支不动。** **失败路径不需要耗时头——你测的是"成功时有多快"，不是"失败时有多快"。**

**`X-Process-Time-Ms` 这个响应头让假平台能读到耗时。**

**用自定义头而不是只打日志，原因很简单：** **假平台是另一个进程，它读不到你的日志，但读得到响应头。**

**这类"把内部数字暴露在想看的人手上"的做法，第 22 周做性能时还会再用一次（`Server-Timing` 头）。** **所有可观测性的起点都是同一个思路：让下游能看见你的内部数字。**

**改假平台，把耗时打印出来（它已经在做了）。**

## 5.2 写一个压测

**新建 `scripts/webhook-latency.js`：**

```js
const GATEWAY = process.env.PLATFORM_BASE_URL || 'http://localhost:5000';

(async () => {
  const N = 50;
  console.log(`并发推 ${N} 条事件，统计回调耗时`);

  const tasks = Array.from({ length: N }, (_, i) =>
    fetch(GATEWAY + '/mock/push-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'im.message.receive_v1',
        text: 'ping-' + i,
      }),
    }).then((r) => r.json())
  );

  const results = await Promise.all(tasks);

  const elapsed = results.map((r) => r.elapsedMs).filter((n) => typeof n === 'number');
  elapsed.sort((a, b) => a - b);

  const p = (q) => elapsed[Math.min(elapsed.length - 1, Math.floor(elapsed.length * q))];

  console.log('  样本数：', elapsed.length);
  console.log('  最小：', elapsed[0] + 'ms');
  console.log('  中位：', p(0.5) + 'ms');
  console.log('  p95：', p(0.95) + 'ms');
  console.log('  最大：', elapsed[elapsed.length - 1] + 'ms');
  console.log('  超过 1000ms 的：', elapsed.filter((n) => n > 1000).length);
  console.log('  超过 3000ms 的：', elapsed.filter((n) => n > 3000).length);
})();
```

**跑：**

```text
node scripts/webhook-latency.js
```

**期望：**

```text
  样本数： 50
  最小： 4ms
  中位： 12ms
  p95： 45ms
  最大： 120ms
  超过 1000ms 的： 0
  超过 3000ms 的： 0
```

**如果 `最大` 超过 3000ms，说明有问题：**

```text
① 连接池不够（50 个并发抢 10 个连接）
② 唯一索引缺失，插入变慢
③ 有同步的耗时操作混进了回调
```

**这个脚本以后每次改动回调都要跑一遍。**

**它就是你的"3 秒守门员"。**

## 5.3 观察连接池压力

**50 个并发，连接池是 10。会发生什么：**

```text
40 个请求排队等连接
每个请求只需要 10ms，排队 4 轮 = 40ms
总耗时 50ms
```

**所以 `最大 120ms` 是合理的。**

**但如果连接池被长期占用（比如某个接口在事务里等大模型），这里会变成 5 秒+。**

**这就是第 173 节说的"长事务"的实际影响。**

**跑压测时顺便看看：**

```sql
select count(*), state from pg_stat_activity
where datname = current_database()
group by state;
```

**如果 `idle in transaction` 有值，说明有连接被事务占着没释放。**

---

# 第 6 步：最终验收

## A. 事件表

- [ ] `platform_events` 有 `unique (platform, event_id)`
- [ ] `tenant_id` 可以为空（收件箱）
- [ ] `status` 有五个值（pending / processing / done / ignored / failed / failed_permanently）
- [ ] `next_retry_at` 有部分索引

## B. 回调

- [ ] 验签三种算法都实现了
- [ ] 飞书检查时间戳偏差（300 秒）
- [ ] 企微的拼接**排序过**
- [ ] 飞书 `url_verification` 返回 `{ challenge }`
- [ ] 重复事件返回 200，不是 409
- [ ] 归一化失败返回 200 + `ignored`
- [ ] 只有数据库挂了才返回 500/503

## C. 归一化

- [ ] 路由层只认 `{ eventId, eventType, tenantId, payload }`
- [ ] 路由层不出现任何 `feishu` / `wecom` 的判断（除了验签分支）
- [ ] 未知事件类型能返回 `ignored`

## D. Worker

- [ ] 用 `for update skip locked` 认领
- [ ] 一条 SQL 完成"查找 + 标记 processing"
- [ ] `running` 标志防重入
- [ ] 指数退避 + 抖动
- [ ] 超过 5 次标记 `failed_permanently`

## E. 实测

- [ ] `ping` 事件能触发回复
- [ ] `slow` 事件：回调 10ms 返回，业务跑 10 秒
- [ ] 重放 5 次，handler 只执行 1 次
- [ ] `webhook-latency.js` 的 p95 在 100ms 内
- [ ] 数据库挂掉时返回 503

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我抄下了"回调 8ms，业务 10 秒"这个对比
- [ ] 我记下了三家平台签名算法的差异

## 提交

```text
git add -A
git commit -m "第178节课: 事件订阅 + 验签 + 归一化 + 先应答后处理 + worker"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 飞书配 URL 时提示"校验失败" | 没返回 `{challenge}`，或者验签失败 | 先临时放开验签，确认 challenge 能返回 |
| 验签一直失败（飞书） | 用的是 `appSecret`，但配了 `Encrypt Key` | 用 `encrypt_key` |
| 验签一直失败（企微） | 拼接前没排序 | `.sort()` |
| `req.rawBody` 是 `undefined` | 没配 `express.json({verify})` | 加上 |
| 事件重复处理 | `platform_events_dedup_idx` 不存在 | 检查迁移 |
| 事件一直 `pending` | worker 没启动 | 检查 `startLoop()` |
| 事件卡在 `processing` | worker 崩了，状态没回滚 | 加一个"超时回收"任务（下一步优化） |
| `事件没有归属租户` | `platform_apps` 里没有这个平台 | 先配应用 |
| 多个 worker 重复处理 | 缺 `skip locked` | 加上 |
| 重试风暴 | 没加 jitter | 加随机抖动 |
| 回调耗时突然变长 | 连接池被占满 | 查 `pg_stat_activity` 的 `idle in transaction` |
| `slow` 事件也很快返回了，但没有回复 | 那是正常的——回复在后台 | 看日志确认 handler 跑完了 |

---

## 本节课要能说出口的一句话

> **回调只做"收件"和"应答"两件事，业务一律丢后台；3 秒不是"尽量快"，是平台的硬限制，超了就是重推、就是重复处理、就是客户收到三条一样的消息。**
