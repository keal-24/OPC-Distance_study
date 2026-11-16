# 第 177 节课：token 过期了

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课看起来只是"存个凭证、换个 token"，但它是整个平台集成里**最容易在半夜出事**的部分。
> 上一个真实的故事：某应用每个请求换一次 token，并发一高被平台限流，**整个应用 40 分钟不可用**——因为所有功能都要 token。

**建议用时**：145 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（85 分钟）一次，第 3—5 步（60 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 176 节课（假平台能跑，`docs/notify-list.md` 写好了）

---

# 第 0 步：先看清 token 有三层坑（15 分钟）

## 0.1 第一层：每次请求都换

```js
async function sendMessage(...) {
  const token = await getAccessToken();    // ❌
  await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
}
```

**看起来没问题，实际有两个后果：**

```text
① 每次多一次网络往返（200ms），发 100 条消息就多 20 秒
② 换 token 接口有频率限制（飞书按应用计，分钟级）
   → 并发 20 个请求一起换 → 触发限流 → 403
   → 之后的请求连 token 都拿不到 → 全部功能瘫痪
```

**第 ② 条最致命：** 你的系统不"慢"了，它"死"了。

## 0.2 第二层：缓存了，但没处理过期

```js
let cachedToken = null;

async function getAccessToken() {
  if (cachedToken) return cachedToken;     // ❌ 永远不过期

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });

  const data = await res.json();
  cachedToken = data.tenant_access_token;
  return cachedToken;
}
```

**这段代码"能跑"——第一次调用会正确换到 token，第二次开始走缓存。**

**问题在 `if (cachedToken) return cachedToken;` 这一行：它只判断"有没有值"，不判断"这值还能不能用"。**

**这个 bug 的可怕之处：上线后 2 小时内一切正常。**

**2 小时后 token 过期，你的系统开始返回 `99991663`。**

**而你正在睡觉。**

## 0.3 第三层：缓存了、也判断过期了，但并发时换了 N 次

```js
let cachedToken = null;
let expiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < expiresAt) return cachedToken;

  const res = await fetch(...);            // 10 个并发同时走到这里
  cachedToken = res.token;                 // 换了 10 次
  expiresAt = Date.now() + res.expire * 1000;
  return cachedToken;
}
```

**10 个并发请求同时发现"token 过期了"，同时去换，换了 10 次。**

**看起来"只是浪费 10 次请求"，但：**

```text
① 平台的换 token 接口可能有限流，10 次就够触发
② 后换的覆盖先换的，如果平台让旧的立即失效，你手上那一份可能已经无效
③ 每次换 token 都是 200ms，10 个并发不一定都成功，有的会超时
```

## 0.4 正确的做法：单飞（single-flight）

**一句话：同一时刻只允许一个请求去换 token，其他请求等它换完，拿同一份结果。**

```text
并发 10 个请求 → 全部发现过期
→ 第一个开始换，其余 9 个挂起等待
→ 换完，10 个都拿到同一份 token
→ 平台只被调用 1 次
```

**这个模式叫 `single-flight` 或者 `promise coalescing`。**

**这节课的核心就是实现它。**

---

# 第 1 步：应用凭证存哪（25 分钟）

## 1.1 两种存法

```text
方案 A：.env 里
  FEISHU_APP_ID=cli_xxx
  FEISHU_APP_SECRET=xxx

方案 B：数据库表里
  platform_apps 表，一个租户一行
```

**你现在该用哪个：**

| 情况 | 用哪个 |
|---|---|
| 你自己运营一个应用，所有客户共用 | **方案 A**（`.env`） |
| 每个客户要建自己的应用（客户自己的飞书） | **方案 B**（数据库） |
| 还不确定 | 先 A，需要时再加 B |

**为什么：** 方案 A 更简单，而且密钥不进数据库、不进备份，泄露面更小。

**但注意：** 如果你的产品是"给客户公司内部署一个应用"，那就必须用方案 B——**每个客户的应用 `app_id` 都不一样。**

**这一节做方案 B，因为它更完整，而且方案 A 是它的简化版。**

## 1.2 建表

**新建 `migrations/016_platform_apps.sql`：**

```sql
create table platform_apps (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  platform       text not null check (platform in ('feishu', 'wecom', 'dingtalk')),
  app_id         text not null,
  app_secret_enc text not null,
  verify_token   text,
  encrypt_key    text,
  bot_webhook    text,
  status         text not null default 'active',
  last_ok_at     timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, platform)
);

create index platform_apps_tenant_idx on platform_apps (tenant_id);

alter table platform_apps enable row level security;
alter table platform_apps force row level security;

create policy tenant_isolation on platform_apps
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

## 1.3 为什么字段叫 `app_secret_enc`

**因为不能明文存。**

**加密存，读出来的时候解密。用一个环境变量里的密钥：**

```text
SECRET_ENCRYPTION_KEY=一串32字节的随机十六进制
```

**新建 `src/crypto/secret-box.js`：**

```js
const crypto = require('crypto');

const KEY_HEX = process.env.SECRET_ENCRYPTION_KEY || '';

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error(
      'SECRET_ENCRYPTION_KEY 必须是 64 位十六进制（32 字节）。' +
      '生成方法：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(KEY_HEX, 'hex');
}

function encrypt(plain) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function maskSecret(secret) {
  if (!secret) return '';
  const s = String(secret);
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '****' + s.slice(-4);
}

module.exports = { encrypt, decrypt, maskSecret };
```

## 1.4 四个要点

### 为什么用 AES-256-GCM，不用 AES-256-CBC

```text
CBC  只加密，不防篡改。攻击者改一个字节，你解密出一堆垃圾，程序可能继续往下跑
GCM  加密 + 认证。密文被改过，解密直接抛错
```

**存密钥这种场景必须用 GCM。** 因为"解密出错误的值"比"解密失败"危险得多——**你会拿着一个错误的 secret 去换 token，然后拿到一个莫名其妙的错误。**

### `iv` 必须每次随机

```js
const iv = crypto.randomBytes(12);
```

**同一个 key 配同一个 iv 加密两次不同的明文，攻击者可以 XOR 出明文。**

**这个坑很经典，`crypto.randomBytes` 一行就避开了。**

### 存 `iv` 和 `tag` 在密文前面

```js
return Buffer.concat([iv, tag, enc]).toString('base64');
```

**解密时按固定长度切出来：**

```js
const iv = buf.subarray(0, 12);     // GCM 的 iv 固定 12 字节
const tag = buf.subarray(12, 28);   // GCM 的 tag 固定 16 字节
const enc = buf.subarray(28);
```

**顺序和长度都必须固定。** 写错了不会报"格式错误"，只会解密失败或者解出垃圾。

### `maskSecret` 给前端看

**客户在设置页看到的不应该是完整的 secret，而是 `cli_****a1b2`。**

**这是给客户的安全感，也是给你自己的——** **你不该在日志里、在截图里、在客服的时候看到客户的密钥。**

## 1.5 `.env` 加一行

```text
SECRET_ENCRYPTION_KEY=用下面的命令生成
```

```text
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**把这串 64 位十六进制填进去。**

**注意：这个密钥一旦丢失，所有客户的 `app_secret` 都解不开了。** 客户要重新填一遍。

**所以它要备份，但绝对不能进 Git。**

## 1.6 自检点

**新建 `scripts/secret-test.js`：**

```js
const { encrypt, decrypt, maskSecret } = require('../src/crypto/secret-box');

const plain = 'my-super-secret-app-key-12345';
const enc = encrypt(plain);

console.log('原文：', plain);
console.log('密文：', enc.slice(0, 40) + '...');
console.log('长度：', enc.length, '（原文', plain.length, '）');
console.log('解回：', decrypt(enc));
console.log('一致：', decrypt(enc) === plain);

const enc2 = encrypt(plain);
console.log('两次加密结果相同吗：', enc === enc2, '（必须是 false，因为 iv 随机）');
console.log('但都能解回原值：', decrypt(enc) === plain && decrypt(enc2) === plain);
console.log('打码：', maskSecret(plain));

const tampered = enc.slice(0, -4) + 'AAAA';
try {
  decrypt(tampered);
  console.log('!!! 篡改的密文居然解开了');
} catch (err) {
  console.log('篡改被拒绝：', err.message);
}
```

**跑，期望最后四行：**

```text
两次加密结果相同吗： false （必须是 false，因为 iv 随机）
但都能解回原值： true
打码： my-s****2345
篡改被拒绝： Unsupported state or unable to authenticate data
```

**最后一行是关键——它证明 GCM 的认证在起作用。**

---

# 第 2 步：token 缓存（45 分钟）

**这是这节课的核心。**

## 2.1 先写错的版本，看清它的行为

**新建 `src/platform/token.js`，先写这一版：**

```js
const pool = require('../db/pool');
const { decrypt } = require('../crypto/secret-box');

const cache = new Map();

async function getTokenNaive(tenantId, platform) {
  const key = tenantId + ':' + platform;
  const hit = cache.get(key);

  if (hit && Date.now() < hit.expiresAt) {
    return hit.token;
  }

  const { rows } = await pool.query(
    `select app_id, app_secret_enc from platform_apps
     where tenant_id = $1 and platform = $2 and status = 'active'`,
    [tenantId, platform]
  );

  if (rows.length === 0) {
    throw new Error('没有配置 ' + platform + ' 应用');
  }

  const secret = decrypt(rows[0].app_secret_enc);

  const res = await fetch(process.env.PLATFORM_BASE_URL + '/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: rows[0].app_id, app_secret: secret }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error('换 token 失败 HTTP ' + res.status);
  }

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error('换 token 失败 code=' + data.code + ' ' + data.msg);
  }

  cache.set(key, {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 300) * 1000,
  });

  return data.tenant_access_token;
}

module.exports = { getTokenNaive };
```

**注意 `(data.expire - 300)` 这个 `- 300`。**

**提前 5 分钟过期。为什么：**

```text
如果按 expire 精确失效，你在过期前 1 秒发出的请求会失败
提前 5 分钟，留出安全边界
```

**这个"提前量"是必须的。真实系统里所有缓存都有提前量，否则一定会遇到"临界时刻失败"。**

## 2.2 压测，看清问题

**新建 `scripts/token-stress.js`：**

```js
const pool = require('../src/db/pool');
const { getTokenNaive } = require('../src/platform/token');

(async () => {
  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  const tenantId = t.rows[0].id;

  await pool.query(
    `insert into platform_apps (tenant_id, platform, app_id, app_secret_enc)
     values ($1, 'feishu', $2, $3)
     on conflict (tenant_id, platform) do update
     set app_id = excluded.app_id, app_secret_enc = excluded.app_secret_enc`,
    [
      tenantId,
      process.env.MOCK_APP_ID,
      require('../src/crypto/secret-box').encrypt(process.env.MOCK_APP_SECRET),
    ]
  );

  console.log('清空平台侧的 token：');
  await fetch(process.env.PLATFORM_BASE_URL + '/mock/expire-all-tokens', { method: 'POST' });

  const before = await (await fetch(process.env.PLATFORM_BASE_URL + '/mock/tokens')).json();
  console.log('  当前 token 数量：', before.count);

  const N = 10;
  console.log(`\n并发 ${N} 个请求同时换 token：`);
  const started = Date.now();

  const tasks = Array.from({ length: N }, () =>
    getTokenNaive(tenantId, 'feishu').then(
      (token) => ({ ok: true, token }),
      (err) => ({ ok: false, error: err.message })
    )
  );

  const results = await Promise.all(tasks);
  const elapsed = Date.now() - started;

  const okCount = results.filter((r) => r.ok).length;
  const tokens = new Set(results.filter((r) => r.ok).map((r) => r.token));

  console.log(`  耗时：${elapsed}ms`);
  console.log(`  成功：${okCount}/${N}`);
  console.log(`  拿到几种不同的 token：${tokens.size}  （理想是 1）`);

  const after = await (await fetch(process.env.PLATFORM_BASE_URL + '/mock/tokens')).json();
  console.log(`  平台上被创建的 token 数量：${after.count}  （理想是 1，实际是 ${after.count}）`);

  await pool.end();
})();
```

**先启动假平台，然后跑：**

```text
node scripts/token-stress.js
```

**你会看到类似：**

```text
清空平台侧的 token：
  当前 token 数量： 0

并发 10 个请求同时换 token：
  耗时：312ms
  成功：10/10
  拿到几种不同的 token： 10
  平台上被创建的 token 数量： 10  （理想是 1）
```

**10 个并发 → 平台被调用 10 次。**

**现在只是"浪费"。但如果平台限流是"每分钟 5 次"，你就死在这里。**

## 2.3 改成单飞

**在 `src/platform/token.js` 里加：**

```js
const inflight = new Map();

async function getToken(tenantId, platform) {
  const key = tenantId + ':' + platform;
  const hit = cache.get(key);

  if (hit && Date.now() < hit.expiresAt) {
    return hit.token;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const p = fetchAndCache(tenantId, platform, key).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, p);
  return p;
}

async function fetchAndCache(tenantId, platform, key) {
  const { rows } = await pool.query(
    `select app_id, app_secret_enc from platform_apps
     where tenant_id = $1 and platform = $2 and status = 'active'`,
    [tenantId, platform]
  );

  if (rows.length === 0) {
    throw new Error('没有配置 ' + platform + ' 应用');
  }

  const secret = decrypt(rows[0].app_secret_enc);
  const url =
    process.env.PLATFORM_BASE_URL +
    '/open-apis/auth/v3/tenant_access_token/internal';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: rows[0].app_id, app_secret: secret }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error('换 token 失败 HTTP ' + res.status);
  }

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error('换 token 失败 code=' + data.code + ' ' + data.msg);
  }

  const expiresAt = Date.now() + Math.max(60, data.expire - 300) * 1000;

  cache.set(key, { token: data.tenant_access_token, expiresAt });
  return data.tenant_access_token;
}

function invalidate(tenantId, platform) {
  cache.delete(tenantId + ':' + platform);
}

function clearAll() {
  cache.clear();
}

module.exports = { getToken, getTokenNaive, invalidate, clearAll };
```

## 2.4 单飞的三处关键

### `inflight` 存的是 Promise，不是结果

```js
const p = fetchAndCache(...);
inflight.set(key, p);
return p;
```

**存 Promise 的好处：后来的请求直接 `await` 同一个 Promise，拿到同一份结果。**

**如果存结果，你就要写"等一下再查一次"的轮询逻辑。** 存 Promise 是零成本的。

### `.finally()` 里删除

```js
const p = fetchAndCache(tenantId, platform, key).finally(() => {
  inflight.delete(key);
});
```

**为什么用 `finally` 而不是 `.then()`：**

```text
成功 → 要删除（不然下次永远拿到这个旧 Promise）
失败 → 也要删除（不然一直拿到这个失败的 Promise，永远重试不了）
```

**`finally` 两种都覆盖。**

**这是一个真实的坑：** 只用 `.then()` 删除的话，**换 token 失败一次之后，这个应用就永远换不了了**——因为 `inflight` 里一直挂着一个 rejected Promise。

### 失败的结果要不要缓存

**看 `fetchAndCache`：失败时 `throw`，没有写 `cache`。**

**对。失败的 token 不能缓存。**

**但 `inflight` 会缓存那个失败的 Promise 几毫秒**（直到 `finally` 执行）。**这个窗口很短，无害。**

**不要把失败结果放进 `cache`。** 否则一次网络抖动会让你在 2 小时内都用不上。

## 2.5 再压测一次

**改 `token-stress.js` 的 import：**

```js
const { getToken } = require('../src/platform/token');
```

**把 `getTokenNaive` 换成 `getToken`。**

**跑：**

```text
node scripts/token-stress.js
```

**期望：**

```text
并发 10 个请求同时换 token：
  耗时：210ms
  成功：10/10
  拿到几种不同的 token： 1
  平台上被创建的 token 数量： 1
```

**10 个并发 → 平台只被调用 1 次。耗时也从 312ms 降到 210ms。**

**这就是单飞的价值。**

## 2.6 但缓存是进程内的，多进程怎么办

**这是一个必须现在就想清楚的问题。**

**如果你部署 3 个进程（或者 3 台服务器），每个进程有自己的 `cache`，就会有 3 份 token，各自换各自的。**

```text
进程 1：token A
进程 2：token B
进程 3：token C
```

**平台那边有 3 个有效 token。**

**这不会直接出错（三个都能用），但：**

```text
① 3 倍调用量（限流风险）
② 每个进程独立过期，你排查问题时会看到"有时好有时坏"
```

**解决方案（按复杂度排）：**

| 方案 | 做法 | 代价 |
|---|---|---|
| 保持进程内 | 接受 3 倍调用 | 免费，够用 |
| 定时刷新到一个地方 | 一个进程换，写进 Redis/数据库，其他进程读 | 要 Redis 或加锁 |
| 每个进程只换一次，不做协调 | 现在的方案 | 免费 |

**这一节建议：保持进程内缓存。**

**理由：**

```text
一人公司的部署规模：1—2 个进程
每个进程 2 小时换一次 token
总量：每小时 1 次
平台的限流通常在"每分钟几十次"级别
```

**完全够用。**

**但如果你的客户 100 个，100 个应用，2 个进程 → 每小时 200 次换 token。那时候要考虑共享缓存。**

**把这个判断写进笔记。** 这是"什么时候该优化"的例子——**不是现在就上 Redis，是知道什么时候该上。**

---

# 第 3 步：token 失效了怎么办（25 分钟）

**真实场景：管理员在平台后台改了应用权限、重置了密钥、或者平台自己抽风。**

**你的 token 还在缓存里，但平台那边已经作废了。**

**表现：**

```text
调用发消息接口 → 返回 99991663（token invalid）
```

## 3.1 自动重试一次

**新建 `src/platform/client.js`：**

```js
const { getToken, invalidate } = require('./token');

const BASE = process.env.PLATFORM_BASE_URL;

const TOKEN_INVALID_CODES = new Set([99991663, 99991661, 40001, 40014]);

async function callPlatform(tenantId, platform, path, options = {}) {
  const attempt = async (isRetry) => {
    const token = await getToken(tenantId, platform);

    const res = await fetch(BASE + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(options.timeoutMs || 10000),
    });

    if (!res.ok && res.status !== 400) {
      const text = await res.text();
      throw new Error('平台调用失败 HTTP ' + res.status + ' ' + text.slice(0, 200));
    }

    const data = await res.json().catch(() => ({}));

    const isTokenError =
      TOKEN_INVALID_CODES.has(data.code) ||
      /token/i.test(String(data.msg || ''));

    if (isTokenError && !isRetry) {
      console.warn(
        '[platform] token 失效，清缓存后重试一次',
        'tenant=' + tenantId,
        'platform=' + platform
      );
      invalidate(tenantId, platform);
      return attempt(true);
    }

    return data;
  };

  return attempt(false);
}

module.exports = { callPlatform, TOKEN_INVALID_CODES };
```

## 3.2 三处关键

### 只重试一次

```js
if (isTokenError && !isRetry) { ... return attempt(true); }
```

**为什么 "只重试一次"：**

**如果重试还是 token 错误，说明不是"缓存旧了"，是别的问题（应用被删了、权限没了、密钥错了）。**

**无限重试会：**

```text
① 把平台打爆
② 掩盖真正的问题（你看到的是"一直在重试"，而不是"密钥错了"）
```

**"重试一次"是这类问题的标准做法：覆盖"缓存过期"这一种情况，其他情况让它暴露。**

### 用错误码集合判断，不用字符串匹配

```js
const TOKEN_INVALID_CODES = new Set([99991663, 99991661, 40001, 40014]);
```

**这几个码分别是：**

```text
99991663  飞书：token 无效
99991661  飞书：token 缺失
40001     企微：token 无效
40014     企微：token 不合法
```

**为什么不全靠 `/token/i.test(msg)`：**

**因为 `msg` 是英文/中文混的，而且平台会改文案。**

**错误码稳定得多。**

**但也要留着字符串匹配兜底**——因为新平台、新版本可能给你一个不在集合里的码。

### `res.status === 400` 也要读 body

```js
if (!res.ok && res.status !== 400) { throw }
```

**为什么单独放行 400：**

**飞书的很多错误是 HTTP 400 + JSON body 里带 `code`。**

**如果不放行 400，你会抛一个 `HTTP 400` 的错误，然后永远看不到 `99991663`，也就永远触发不了重试。**

**这是飞书 API 的一个特点，企微/钉钉大多用 200 + body 里的 code。**

**把这个差异记下来。**

## 3.3 自检点

**新建 `scripts/token-expire-test.js`：**

```js
const pool = require('../src/db/pool');
const { getToken } = require('../src/platform/token');
const { callPlatform } = require('../src/platform/client');

(async () => {
  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  const tenantId = t.rows[0].id;

  const token1 = await getToken(tenantId, 'feishu');
  console.log('第一次拿到 token：', token1.slice(0, 12) + '...');

  console.log('\n清空平台侧所有 token（模拟过期）：');
  await fetch(process.env.PLATFORM_BASE_URL + '/mock/expire-all-tokens', { method: 'POST' });

  console.log('现在用缓存的 token 调接口，应该先失败再自动重试：');

  const result = await callPlatform(tenantId, 'feishu', '/open-apis/im/v1/messages', {
    method: 'POST',
    body: JSON.stringify({
      receive_id: 'oc_mock_chat',
      msg_type: 'text',
      content: JSON.stringify({ text: '自动重试测试' }),
    }),
  });

  console.log('最终结果：', result);

  const token2 = await getToken(tenantId, 'feishu');
  console.log('\n重试后拿到的新 token：', token2.slice(0, 12) + '...');
  console.log('和旧的相同吗：', token1 === token2, '（应该是 false）');

  await pool.end();
})();
```

**跑，期望：**

```text
第一次拿到 token： t-abc123...
清空平台侧所有 token（模拟过期）：
现在用缓存的 token 调接口，应该先失败再自动重试：
[platform] token 失效，清缓存后重试一次 tenant=... platform=feishu
最终结果： { code: 0, msg: 'ok', data: { message_id: 'om_...' } }
重试后拿到的新 token： t-def456...
和旧的相同吗： false （应该是 false）
```

**看到那行 `[platform] token 失效，清缓存后重试一次`，说明机制生效了。**

**如果你的代码没有这行日志，直接成功了——说明你的 `invalidate` 从没被调用，或者假平台没有真的让 token 失效。**

---

# 第 4 步：配置界面（20 分钟）

**客户要能自己填凭证。**

## 4.1 接口

**新建 `src/routes/platform.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');
const { encrypt, maskSecret } = require('../crypto/secret-box');
const { getToken, invalidate } = require('../platform/token');

const router = express.Router();
router.use(auth, tenant);

router.get('/apps', async (req, res, next) => {
  try {
    const rows = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select id, platform, app_id, status, last_ok_at, last_error, created_at
         from platform_apps where tenant_id = $1`,
        [req.tenant.id]
      );
      return r.rows;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.put('/apps/:platform', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能配置应用' });
  }

  const platform = req.params.platform;

  if (!['feishu', 'wecom', 'dingtalk'].includes(platform)) {
    return res.status(400).json({ error: '不支持的平台' });
  }

  const appId = String(req.body.appId || '').trim();
  const appSecret = String(req.body.appSecret || '').trim();

  if (!appId || !appSecret) {
    return res.status(400).json({ error: 'appId 和 appSecret 都要填' });
  }

  try {
    const row = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `insert into platform_apps (tenant_id, platform, app_id, app_secret_enc)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, platform) do update
         set app_id = excluded.app_id,
             app_secret_enc = excluded.app_secret_enc,
             status = 'active',
             last_error = null,
             updated_at = now()
         returning id, platform, app_id, status`,
        [req.tenant.id, platform, appId, encrypt(appSecret)]
      );
      return r.rows[0];
    });

    invalidate(req.tenant.id, platform);

    res.json({ ...row, appSecret: maskSecret(appSecret) });
  } catch (err) {
    next(err);
  }
});

router.post('/apps/:platform/test', async (req, res, next) => {
  const platform = req.params.platform;

  try {
    invalidate(req.tenant.id, platform);
    const token = await getToken(req.tenant.id, platform);

    await withTenant(req.tenant.id, async (db) => {
      await db.client.query(
        `update platform_apps
         set last_ok_at = now(), last_error = null
         where tenant_id = $1 and platform = $2`,
        [req.tenant.id, platform]
      );
    });

    res.json({
      ok: true,
      message: '连接成功',
      tokenPrefix: token.slice(0, 8) + '...',
    });
  } catch (err) {
    await withTenant(req.tenant.id, async (db) => {
      await db.client.query(
        `update platform_apps set last_error = $1
         where tenant_id = $2 and platform = $3`,
        [err.message.slice(0, 500), req.tenant.id, platform]
      );
    }).catch(() => {});

    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/apps/:platform', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能删除配置' });
  }

  try {
    await withTenant(req.tenant.id, async (db) => {
      await db.client.query(
        'delete from platform_apps where tenant_id = $1 and platform = $2',
        [req.tenant.id, req.params.platform]
      );
    });

    invalidate(req.tenant.id, req.params.platform);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const platformRoutes = require('./routes/platform');
app.use('/api/platform', platformRoutes);
```

## 4.2 四个设计点

### `PUT` 而不是 `POST`

**因为"保存配置"是幂等的：填什么就是什么，调两次结果一样。**

**`POST` 语义上是"创建一个新东西"，用在这里会让客户端以为会重复创建。**

**这个细节看起来学究气，但它决定了"网络超时后能不能安全重试"。**

### 保存时调 `invalidate`

```js
invalidate(req.tenant.id, platform);
```

**因为客户改了 secret，旧 token 已经不对了。**

**不清缓存的话，客户点"测试连接"会拿到旧 token 的成功结果，然后真正用的时候失败。**

**"改了配置就清缓存"是一条必须遵守的规矩。**

### `test` 接口里先 `invalidate`

```js
invalidate(req.tenant.id, platform);
const token = await getToken(req.tenant.id, platform);
```

**"测试连接"必须真的换一次 token。**

**如果只检查"缓存里有没有"，客户填了错的 secret 也会显示"连接成功"——** **因为他之前填对过一次。**

### `last_error` 存起来

**客户可以随时看到"上次失败的原因"。**

**没有这个，客户会说"我这里用不了"，而你只能问"你能截个图吗"。**

## 4.3 自检点

**配置一个应用：**

```text
curl -X PUT http://localhost:3000/api/platform/apps/feishu -b cookies.txt -H "Content-Type: application/json" -d "{\"appId\":\"cli_mock_app\",\"appSecret\":\"mock-app-secret\"}"
```

**测试连接：**

```text
curl -X POST http://localhost:3000/api/platform/apps/feishu/test -b cookies.txt
```

**期望：**

```json
{"ok":true,"message":"连接成功","tokenPrefix":"t-abc123..."}
```

**填错的 secret 再试：**

```text
curl -X PUT http://localhost:3000/api/platform/apps/feishu -b cookies.txt -H "Content-Type: application/json" -d "{\"appId\":\"cli_mock_app\",\"appSecret\":\"wrong-secret\"}"
curl -X POST http://localhost:3000/api/platform/apps/feishu/test -b cookies.txt
```

**期望：**

```json
{"ok":false,"error":"换 token 失败 code=10003 app_id or app_secret invalid"}
```

**而且 `GET /api/platform/apps` 里 `last_error` 应该有这个信息。**

**记得改回来。**

---

# 第 5 步：故意让 token 提前过期（15 分钟）

**这是这节课最值得做的一次实验。**

## 5.1 改假平台的 expire

**打开 `scripts/mock-platform.js`，找到：**

```js
const expire = 7200;
```

**改成：**

```js
const expire = 30;
```

**重启假平台。**

## 5.2 写一个循环，每 10 秒发一次消息，跑 2 分钟

**新建 `scripts/token-loop.js`：**

```js
const pool = require('../src/db/pool');
const { callPlatform } = require('../src/platform/client');

(async () => {
  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  const tenantId = t.rows[0].id;

  const rounds = 12;

  for (let i = 1; i <= rounds; i++) {
    const started = Date.now();

    try {
      const r = await callPlatform(tenantId, 'feishu', '/open-apis/im/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          receive_id: 'oc_mock_chat',
          msg_type: 'text',
          content: JSON.stringify({ text: '第 ' + i + ' 次' }),
        }),
      });

      console.log(
        `第 ${i} 轮  ok  ${Date.now() - started}ms  messageId=${r.data ? r.data.message_id : '-'}`
      );
    } catch (err) {
      console.log(`第 ${i} 轮  失败  ${err.message}`);
    }

    if (i < rounds) {
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  await pool.end();
})();
```

**注意假平台的 `expire = 30`，而你的缓存是 `expire - 300`。**

**`Math.max(60, 30 - 300)` = `60`。**

**所以你的缓存会把 30 秒有效期的 token 缓存 60 秒——** **比平台的实际有效期还长。**

**这就是一个真实的 bug：** 你的提前量（300 秒）比平台给的有效期（30 秒）还大。

**代码里那个 `Math.max(60, ...)` 就是为了兜住这个——但它兜不住"平台给的有效期比 60 秒还短"的情况。**

**这个实验会暴露它。**

**你要跑 8 轮，每轮隔 10 秒（脚本里已经写了 `setTimeout(r, 10000)`）。** **8 轮 × 10 秒 = 80 秒，跨过了 60 秒那条线。**

```text
第 1 轮  ok
第 2 轮  ok
第 3 轮  ok
第 4 轮  ok        ← 60 秒内，全走缓存
第 5 轮  ok
第 6 轮  ok
第 7 轮  ok        ← 60 秒到了，缓存失效，重新换
第 8 轮  失败      ← 真实平台在这里会 401
```

**中间的 3—6 轮我故意省略了，因为它们和第 2 轮完全一样。** **这个省略不影响你验证——你只需要盯第 1 轮和第 8 轮的差别。**

**但这个脚本用的是假平台（本地起的 mock，`expire` 固定返回 30），所以第 8 轮不会真的失败。** **要看真实失败，得把 `BASE_URL` 换成真的飞书地址，并且让 `expire` 变小。**

**这个实验的真正价值不是"看到失败"，是"看到日志里出现 `token 失效，清缓存后重试一次`"。**

**等等，有自动重试。所以实际会是：**

```text
第 7 轮  平台返回 token invalid → 清缓存 → 重换 → 成功
```

**日志里会出现 `[platform] token 失效，清缓存后重试一次`。**

## 5.3 正确的提前量算法

**`Math.max(60, data.expire - 300)` 有问题。**

**改成：**

```js
const rawExpire = Number(data.expire) || 7200;
const marginSec = Math.min(300, Math.floor(rawExpire * 0.1));
const ttlSec = Math.max(30, rawExpire - marginSec);
const expiresAt = Date.now() + ttlSec * 1000;
```

**逻辑：**

```text
正常情况（7200 秒）：margin = min(300, 720) = 300 → 缓存 6900 秒
短有效期（30 秒）：  margin = min(300, 3) = 3   → 缓存 27 秒
极端情况（10 秒）：  ttl = max(30, 7) = 30     → 缓存 30 秒（还是会过期，但至少有自动重试兜底）
```

**"提前量取有效期的 10%，最多 5 分钟"是一个通用规则。**

**为什么不用固定 5 分钟：** 因为有的平台给的有效期就是 5 分钟，固定提前量会让缓存永远"刚好过期"。

**改成这个版本，再跑一次循环。这次第 7 轮之前就会换，不会看到 token 失效。**

## 5.4 把 expire 改回 7200

**别忘了。** 不然你后面所有测试都会遇到 30 秒过期。

**自检点：跑 `token-loop.js` 两分钟，所有轮次都成功，而且日志里没有 `token 失效`。**

---

# 第 6 步：最终验收

## A. 加密存储

- [ ] `platform_apps.app_secret_enc` 存的是密文
- [ ] `secret-test.js` 全过
- [ ] 两次加密结果不同（iv 随机）
- [ ] 篡改密文会抛错（GCM 认证）
- [ ] `SECRET_ENCRYPTION_KEY` 是 64 位十六进制，不在 Git 里

## B. token 缓存

- [ ] 10 个并发只换 1 次 token（压测验证）
- [ ] `inflight` 用 `finally` 清理
- [ ] 失败的 token 不写进 `cache`
- [ ] 提前量是 `min(300, expire*0.1)`
- [ ] 我知道多进程部署时会有几份 token，以及什么时候该优化

## C. 失效重试

- [ ] 平台清空 token 后，调用能自动重试成功
- [ ] 日志里有 `token 失效，清缓存后重试一次`
- [ ] 只重试一次，不是无限重试
- [ ] 用错误码集合判断，不靠中文文案
- [ ] `res.status === 400` 也读 body（飞书特性）

## D. 配置界面

- [ ] 客户能自己填 `appId` / `appSecret`
- [ ] 保存时 `invalidate` 缓存
- [ ] "测试连接"真的换一次 token
- [ ] 失败时 `last_error` 有内容
- [ ] 返回给前端的 secret 是打码的

## E. 提前过期实验

- [ ] 改 `expire = 30` 后跑循环，看到过 token 失效
- [ ] 改提前量算法后再跑，不再失效
- [ ] 改回 7200 了

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"什么时候该用共享 token 缓存"

## 提交

```text
git add -A
git commit -m "第177节课: 凭证加密存储 + token 单飞缓存 + 失效自动重试"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `10003 app_id or app_secret invalid` | 密钥错，或者解密出来的值不对 | 重新填；检查 `SECRET_ENCRYPTION_KEY` 有没有换过 |
| `99991663 token invalid` | token 过期或作废 | 有自动重试会自愈；没有就加 |
| `99991661 token missing` | 请求头里没带 Authorization | 检查 `client.js` 的 header 拼接 |
| `Unsupported state or unable to authenticate data` | 密文被改过，或者 key 不对 | 检查 `SECRET_ENCRYPTION_KEY` |
| `SECRET_ENCRYPTION_KEY 必须是 64 位十六进制` | 环境变量没设或者长度不对 | 用 `randomBytes(32).toString('hex')` 生成 |
| 并发换了 10 次 token | 没实现单飞 | 用 `inflight` Map 存 Promise |
| 换 token 失败一次后再也换不了 | `inflight` 用 `.then()` 清理，失败时没删 | 改成 `.finally()` |
| 缓存永远不过期 | `expiresAt` 算错了，或者判断写成 `<` | 检查 `Date.now() < hit.expiresAt` |
| 每隔 5 分钟失败一次 | 提前量等于有效期 | 用 `min(300, expire*0.1)` |
| 客户填对了 secret 但测试总是失败 | 没 `invalidate`，用的是旧缓存 | 测试前先 `invalidate` |
| 多进程时有时好有时坏 | 每个进程独立缓存、独立过期 | 接受，或者上共享缓存 |

---

## 本节课要能说出口的一句话

> **token 缓存的关键不是"缓存"，是"同一时刻只有一个请求去换"——并发各换各的，既浪费又会被限流，而限流之后你的整个应用就瞎了。**
