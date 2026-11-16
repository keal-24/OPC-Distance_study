# 第 179 节课：一套 Webhook 打三家

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课把"收事件"跑通了，但只针对飞书。这节课把这件事抽象出来：**验签、幂等、重试、留档——四件套，套到任何平台都能用。**
> 而且要做一件上节课没做的事：**加密模式**。真实平台默认开加密，不解密你就拿不到事件内容。

**建议用时**：150 分钟
**你需要先完成**：第 178 节课（事件能收、worker 能跑、重放不重复）

---

# 第 0 步：四件套到底是什么（15 分钟）

**任何 webhook 接收端，必须做这四件事。少一件，就会在某天出事。**

| # | 叫什么 | 解决什么 | 少了会怎样 |
|---|---|---|---|
| 1 | **验签** | 这个请求真的来自平台吗 | 任何人 push 一条"已支付"，你的系统就认 |
| 2 | **幂等** | 同一个事件来两次，结果一样吗 | 客户收到 3 条重复通知，或者加了 3 倍额度 |
| 3 | **重试** | 处理失败了，会再试吗 | 一次数据库抖动，这条事件永久丢失 |
| 4 | **留档** | 三个月后能查到"当时收到了什么"吗 | 客户说"我没收到"，你无法自证 |

**第 178 节已经做了 1（验签）、2（幂等）、4（留档）。重试只做了个雏形。**

**这一节把它做成一个可复用的模块，然后加上加密模式。**

## 0.1 为什么值得抽象

**你现在的代码长这样（第 178 节）：**

```js
if (platform === 'feishu') { verifyFeishu(...) }
else if (platform === 'wecom') { verifyWecom(...) }
else { verifyDingtalk(...) }
```

**加第四家（比如 Slack、Discord、企业微信客服、钉钉机器人），你就要加第四个分支。**

**分支多了会怎样：**

```text
① 某个分支漏了某个检查（比如忘了查时间戳）
② 改一处忘了改其他分支
③ 测试要覆盖 N 份逻辑
```

**抽象之后：**

```js
const receiver = createWebhookReceiver({
  name: 'feishu',
  verify: (ctx) => ...,
  normalize: (body) => ...,
});
router.post('/feishu', receiver.handler());
```

**四件套只在 `createWebhookReceiver` 里实现一次。**

**加第四家 = 写两个函数（`verify` 和 `normalize`），不碰核心逻辑。**

---

# 第 1 步：先看加密模式（30 分钟）

**真实平台的默认配置是加密的。这不是可选项。**

## 1.1 飞书的加密模式

**飞书的 payload 长这样：**

```json
{
  "encrypt": "U2FsdGVkX1+abc123..."
}
```

**就一个字段，整个真实 payload 都在 `encrypt` 里，是 AES-256-CBC 加密后再 Base64。**

**解密步骤：**

```text
① 把 encrypt 字段 Base64 解码 → 得到 密文字节
② 用 SHA256(EncryptKey) 作为 key
③ IV 是密文的前 16 字节
④ 剩下的用 AES-256-CBC 解密
⑤ 去掉 PKCS#7 padding
⑥ 得到 JSON 字符串
```

## 1.2 写解密

**新建 `src/platform/decrypt.js`：**

```js
const crypto = require('crypto');

function decryptFeishu(encrypted, encryptKey) {
  if (!encrypted || typeof encrypted !== 'string') {
    throw new Error('encrypt 字段不是一个非空字符串');
  }

  if (!encryptKey || String(encryptKey).length === 0) {
    throw new Error('缺少 Encrypt Key');
  }

  const key = crypto.createHash('sha256').update(String(encryptKey)).digest();

  const raw = Buffer.from(encrypted, 'base64');

  if (raw.length <= 16) {
    throw new Error('密文长度不够，前 16 字节是 IV');
  }

  const iv = raw.subarray(0, 16);
  const data = raw.subarray(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(true);

  const out = Buffer.concat([decipher.update(data), decipher.final()]);

  return out.toString('utf8');
}

function decryptFeishuToJson(encrypted, encryptKey) {
  const text = decryptFeishu(encrypted, encryptKey);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('解密后不是合法 JSON：' + text.slice(0, 100));
  }
}

module.exports = { decryptFeishu, decryptFeishuToJson };
```

## 1.3 四个细节

### key 是 `SHA256(EncryptKey)`，不是 EncryptKey 本身

```js
const key = crypto.createHash('sha256').update(String(encryptKey)).digest();
```

**这一步最容易漏。**

**飞书的 Encrypt Key 是一个 32 位左右的随机字符串，长度不固定。** AES-256 需要正好 32 字节的 key，所以平台规定："用 SHA256 哈希一下，取摘要"。

**直接用 `Buffer.from(encryptKey)` 会报：**

```text
Invalid key length
```

**看到这个报错就知道是这里。**

### IV 是前 16 字节，不是随机生成的

**GCM 是 12 字节 IV（第 177 节），CBC 是 16 字节。**

**飞书把 IV 拼在密文前面。所以你不需要另外存 IV。**

**这也是 CBC 的一个"便利"：IV 不保密，可以明文传。** （GCM 的 IV 同样不保密，只是飞书没放在密文里。）

### CBC 用 `setAutoPadding(true)`

**AES-CBC 要求明文长度是 16 的倍数。**

**加密时补 padding（通常 PKCS#7），解密时要去掉。**

**`setAutoPadding(true)` 是自动去掉。**

**如果密文被篡改，去掉 padding 时会抛错：**

```text
error:1C800064:Provider routines::bad decrypt
```

**看到 `bad decrypt` 两个原因：key 错，或者密文被改过。**

### CBC 没有认证，这是它的弱点

**GCM 会告诉你"密文被改过"。CBC 不会——** **它可能解密出一堆垃圾，然后 padding 恰好合法。**

**飞书的防护是靠"验签"：**

```text
签名覆盖 rawBody（含密文） → 密文被改，签名就不对
```

**所以顺序很重要：**

```text
✅ 先验签，再解密
❌ 先解密，再验签      （解密失败你就不知道是密钥错还是被攻击）
```

**这个顺序写下来。**

## 1.4 自检点：自己加密一遍再解开

**加密的代码平台不会给你，但你要能自己造测试数据。**

**新建 `scripts/encrypt-test.js`：**

```js
const crypto = require('crypto');
const { decryptFeishuToJson } = require('../src/platform/decrypt');

const ENCRYPT_KEY = 'mock-encrypt-key-1234567890';

function encryptLikeFeishu(plainObj, encryptKey) {
  const key = crypto.createHash('sha256').update(String(encryptKey)).digest();
  const text = JSON.stringify(plainObj);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

  return Buffer.concat([iv, enc]).toString('base64');
}

const original = {
  schema: '2.0',
  header: {
    event_id: 'ev_encrypt_test',
    event_type: 'im.message.receive_v1',
    create_time: String(Date.now()),
  },
  event: {
    message: { chat_id: 'oc_1', message_id: 'om_1', content: '{"text":"加密测试"}' },
  },
};

const encrypted = encryptLikeFeishu(original, ENCRYPT_KEY);
console.log('密文（前 60 字符）：', encrypted.slice(0, 60) + '...');
console.log('密文长度：', encrypted.length);

const decrypted = decryptFeishuToJson(encrypted, ENCRYPT_KEY);
console.log('\n解出来的：', JSON.stringify(decrypted, null, 2));

console.log('\n一致吗：', JSON.stringify(decrypted) === JSON.stringify(original));

console.log('\n用错的 key 试：');
try {
  decryptFeishuToJson(encrypted, 'wrong-key');
  console.log('  !!! 错的 key 居然解开了');
} catch (err) {
  console.log('  被拒绝：', err.message);
}

console.log('\n篡改密文试：');
const tampered = encrypted.slice(0, -6) + 'AAAAAA';
try {
  decryptFeishuToJson(tampered, ENCRYPT_KEY);
  console.log('  !!! 篡改的密文居然解开了（CBC 没有认证，这是它的弱点）');
} catch (err) {
  console.log('  被拒绝：', err.message);
}
```

**跑：**

```text
node scripts/encrypt-test.js
```

**期望：**

```text
密文（前 60 字符）： U2FsdGVkX1...
一致吗： true

用错的 key 试：
  被拒绝： error:1C800064:Provider routines::bad decrypt

篡改密文试：
  被拒绝： error:1C800064:Provider routines::bad decrypt
```

**注意最后一条：篡改也被拒了。**

**但这不代表 CBC 安全——** **它只是"这次恰好 padding 不合法"。多试几次会有一个篡改成功解密出垃圾的。** **真正的防护是验签。**

**如果两次都是 `bad decrypt`，你可能觉得"那 CBC 也挺安全"。** **别这么想。**

---

# 第 2 步：抽象出四件套（45 分钟）

## 2.1 设计接口

**新建 `src/integrations/webhook.js`：**

```js
const express = require('express');
const pool = require('../db/pool');

function createWebhookReceiver(options) {
  const {
    name,
    verify,
    normalize,
    onDuplicate = 'ok',
    maxBodyBytes = 2 * 1024 * 1024,
  } = options;

  if (!name || typeof verify !== 'function' || typeof normalize !== 'function') {
    throw new Error('createWebhookReceiver 需要 name / verify / normalize');
  }

  const router = express.Router();

  router.post(
    '/',
    express.raw({ type: '*/*', limit: maxBodyBytes }),
    async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

      const started = Date.now();
      const log = (msg, extra) =>
        console.log(
          `[webhook:${name}] ${msg}` + (extra ? ' ' + JSON.stringify(extra) : '')
        );

      let verified;
      try {
        verified = await verify({ req, rawBody, headers: req.headers, query: req.query });
      } catch (err) {
        log('验签异常', { error: err.message });
        return res.status(400).json({ ok: false, error: 'VERIFY_ERROR' });
      }

      if (!verified || !verified.ok) {
        log('验签失败', { reason: verified && verified.reason });
        return res.status(401).json({ ok: false, error: 'SIGN_INVALID' });
      }

      if (verified.challenge) {
        log('URL 验证');
        return res.status(200).json(verified.challenge);
      }

      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (err) {
        log('body 不是合法 JSON');
        return res.status(400).json({ ok: false, error: 'BAD_JSON' });
      }

      let normalized;
      try {
        normalized = normalize(parsed, verified);
      } catch (err) {
        log('归一化失败', { error: err.message });
        return res.status(200).json({ ok: true, ignored: true, reason: 'NORMALIZE_FAILED' });
      }

      if (!normalized) {
        log('不关心的事件');
        return res.status(200).json({ ok: true, ignored: true });
      }

      const eventId = String(normalized.eventId || '').slice(0, 200);

      if (!eventId) {
        log('事件没有 id，丢弃');
        return res.status(200).json({ ok: true, ignored: true, reason: 'NO_EVENT_ID' });
      }

      try {
        const inserted = await pool.query(
          `insert into platform_events
             (tenant_id, platform, event_id, event_type, payload)
           values ($1, $2, $3, $4, $5::jsonb)
           on conflict (platform, event_id) do nothing
           returning id`,
          [
            normalized.tenantId || null,
            name,
            eventId,
            String(normalized.eventType || 'unknown').slice(0, 100),
            JSON.stringify({
              raw: parsed,
              normalized: {
                eventType: normalized.eventType,
                payload: normalized.payload,
              },
            }),
          ]
        );

        const duplicated = inserted.rowCount === 0;
        const elapsed = Date.now() - started;

        if (duplicated) {
          log('重复事件', { eventId, elapsedMs: elapsed });
        } else {
          log('已收件', { eventId, type: normalized.eventType, elapsedMs: elapsed });
        }

        res.setHeader('X-Process-Time-Ms', String(elapsed));

        if (elapsed > 1000) {
          log('!! 收件耗时超过 1000ms', { eventId, elapsedMs: elapsed });
        }

        return res.status(200).json({ ok: true, duplicated });
      } catch (err) {
        log('落库失败', { error: err.message });
        return res.status(503).json({ ok: false, error: 'TEMPORARILY_UNAVAILABLE' });
      }
    }
  );

  return { name, router, path: '/' + name };
}

module.exports = { createWebhookReceiver };
```

## 2.2 六个设计决定

### `express.raw` 而不是 `express.json`

```js
express.raw({ type: '*/*', limit: maxBodyBytes })
```

**为什么：**

```text
express.json  → 解析成对象，原始字节丢了
express.raw   → 保留 Buffer，验签用得上
```

**上节课用的是"全局 `express.json({verify})` 存 rawBody"，这一节改成"这个路由自己用 raw"。**

**哪个好？**

```text
全局 verify      → 一处配置，所有路由都能拿到 rawBody
路由级 raw       → 只有需要的路由才保留 Buffer，其他路由正常解析
```

**路由级更好：** 因为 `verify` 那个方案会让**每个请求**都多存一份字符串，包括文件上传。

**这个改动意味着什么：**

```text
/api/webhooks/* 下的路由，req.body 是 Buffer，需要自己 JSON.parse
其他路由，req.body 是解析好的对象
```

**要注意这个差异，别在 webhook 路由里直接 `req.body.foo`。**

### `verify` 是 async 函数

```js
verified = await verify({ req, rawBody, headers: req.query ... });
```

**因为有的平台需要查数据库拿密钥（比如按 `app_id` 查）。**

**同步的验签也可以传一个不 `await` 的函数，`await` 一个非 Promise 是合法的。**

### `verify` 可以返回 `{ challenge }`

```js
if (verified.challenge) {
  return res.status(200).json(verified.challenge);
}
```

**把"URL 验证"统一到 `verify` 里。**

**为什么：** 因为 URL 验证的 payload 结构也各平台不同（飞书是 `{type:'url_verification', challenge}`，Slack 是 `{challenge}`）。

**让 `verify` 自己判断，核心逻辑就不用管了。**

### 归一化失败返回 200

```js
return res.status(200).json({ ok: true, ignored: true, reason: 'NORMALIZE_FAILED' });
```

**注意这里和上节课不同：上节课是 catch 之后返回 200，但没有 `reason`。**

**加 `reason` 是为了排查——** **如果某天你发现"事件都收不到"，能立刻看出是 `NORMALIZE_FAILED` 还是 `NO_EVENT_ID`。**

### `payload` 存两份

```js
payload: JSON.stringify({
  raw: parsed,
  normalized: { eventType, payload },
})
```

**`raw` 是平台原始数据，`normalized` 是归一化后的。**

**为什么要都存：**

```text
只存 raw    → 三个月后平台改了结构，你的 handler 要重新解析
只存 normalized → 你想查"平台原始到底给了什么"时查不到
```

**都存，代价是存储翻倍。** 但一条事件几百字节，翻倍也无所谓。

**而且这是"留档"的真正含义：留的是**证据**，不是**结论**。**

### 落库失败返回 503

```json
{"ok": false, "error": "TEMPORARILY_UNAVAILABLE"}
```

**503 让平台重试。这是唯一该让平台重试的情况。**

**为什么不用 500：** 500 是"服务器内部错误"，可能意味着代码有 bug，重试也没用。**503 明确表示"我现在不行，待会儿再来"。**

**这个区分让平台的重试策略更合理。**

## 2.3 三个平台的适配器

**新建 `src/integrations/adapters/feishu.js`：**

```js
const crypto = require('crypto');
const { decryptFeishuToJson } = require('../../platform/decrypt');
const { extractText } = require('../../platform/adapter');
const { timingEqual } = require('../../platform/verify');
const { findAppByPlatform } = require('../app-lookup');

function makeFeishuReceiver() {
  return {
    name: 'feishu',
    async verify({ rawBody, headers }) {
      const conf = await findAppByPlatform('feishu');
      if (!conf) return { ok: false, reason: 'NO_APP_CONFIG' };

      const ts = headers['x-lark-request-timestamp'];
      const nonce = headers['x-lark-request-nonce'];
      const given = headers['x-lark-signature'];
      const encryptKey = conf.encryptKey || conf.appSecret;

      let bodyObj = null;
      try {
        bodyObj = JSON.parse(rawBody);
      } catch (err) {
        return { ok: false, reason: 'BAD_JSON' };
      }

      if (bodyObj.type === 'url_verification') {
        if (bodyObj.token && conf.verifyToken && bodyObj.token !== conf.verifyToken) {
          return { ok: false, reason: 'VERIFY_TOKEN_MISMATCH' };
        }
        return { ok: true, challenge: { challenge: bodyObj.challenge } };
      }

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

      let decrypted = null;
      if (bodyObj.encrypt) {
        try {
          decrypted = decryptFeishuToJson(bodyObj.encrypt, encryptKey);
        } catch (err) {
          return { ok: false, reason: 'DECRYPT_FAILED:' + err.message };
        }
      }

      return { ok: true, conf, decrypted };
    },

    normalize(parsed, verified) {
      const body = verified.decrypted || parsed;
      const header = body.header || {};
      const event = body.event || {};

      const eventId = header.event_id;
      const eventType = header.event_type;

      if (!eventId || !eventType) return null;

      const map = {
        'im.message.receive_v1': {
          type: 'message.received',
          build: () => ({
            chatId: event.message && event.message.chat_id,
            messageId: event.message && event.message.message_id,
            senderOpenId:
              event.sender && event.sender.sender_id && event.sender.sender_id.open_id,
            text: extractText(event.message && event.message.content),
          }),
        },
        'im.chat.member.user.added_v1': {
          type: 'chat.member_added',
          build: () => ({ chatId: event.chat_id }),
        },
        'card.action.trigger': {
          type: 'card.action',
          build: () => ({
            openId: body.open_id,
            action: body.action && body.action.value,
          }),
        },
      };

      const hit = map[eventType];

      return {
        eventId,
        eventType: hit ? hit.type : eventType,
        tenantId: verified.conf && verified.conf.tenantId,
        payload: hit ? hit.build() : event,
      };
    },
  };
}

module.exports = { makeFeishuReceiver };
```

**新建 `src/integrations/adapters/wecom.js`：**

```js
const crypto = require('crypto');
const { timingEqual } = require('../../platform/verify');
const { findAppByPlatform } = require('../app-lookup');

function makeWecomReceiver() {
  return {
    name: 'wecom',
    async verify({ rawBody, query }) {
      const conf = await findAppByPlatform('wecom');
      if (!conf) return { ok: false, reason: 'NO_APP_CONFIG' };

      const { msg_signature: given, timestamp: ts, nonce } = query || {};

      if (!given || !ts || !nonce) {
        return { ok: false, reason: 'MISSING_SIGNATURE_PARAMS' };
      }

      const parts = [conf.verifyToken, ts, nonce, rawBody].filter(Boolean).sort();
      const expected = crypto.createHash('sha1').update(parts.join('')).digest('hex');

      if (!timingEqual(given, expected)) {
        return { ok: false, reason: 'SIGNATURE_MISMATCH' };
      }

      const skew = Math.abs(Date.now() / 1000 - Number(ts));
      if (!Number.isFinite(skew) || skew > 300) {
        return { ok: false, reason: 'TIMESTAMP_TOO_OLD' };
      }

      return { ok: true, conf };
    },

    normalize(parsed, verified) {
      const msgType = parsed.MsgType || 'unknown';
      const eventId =
        parsed.MsgId ||
        parsed.EventKey ||
        'wecom-' +
          (parsed.CreateTime || Date.now()) +
          '-' +
          crypto.randomBytes(4).toString('hex');

      const eventType =
        msgType === 'event'
          ? 'event.' + String(parsed.Event || 'unknown').toLowerCase()
          : msgType === 'text'
            ? 'message.received'
            : msgType;

      return {
        eventId: String(eventId),
        eventType,
        tenantId: verified.conf && verified.conf.tenantId,
        payload: {
          fromUser: parsed.FromUserName,
          toUser: parsed.ToUserName,
          content: parsed.Content,
          event: parsed.Event,
          eventKey: parsed.EventKey,
        },
      };
    },
  };
}

module.exports = { makeWecomReceiver };
```

**新建 `src/integrations/adapters/dingtalk.js`：**

```js
const crypto = require('crypto');
const { timingEqual } = require('../../platform/verify');
const { findAppByPlatform } = require('../app-lookup');

function makeDingtalkReceiver() {
  return {
    name: 'dingtalk',
    async verify({ query }) {
      const conf = await findAppByPlatform('dingtalk');
      if (!conf) return { ok: false, reason: 'NO_APP_CONFIG' };

      const given = query.sign;
      const ts = query.timestamp;

      if (!given || !ts) {
        return { ok: false, reason: 'MISSING_SIGNATURE_PARAMS' };
      }

      const expected = crypto
        .createHmac('sha256', conf.appSecret)
        .update(String(ts))
        .digest('base64');

      if (!timingEqual(given, expected)) {
        return { ok: false, reason: 'SIGNATURE_MISMATCH' };
      }

      return { ok: true, conf };
    },

    normalize(parsed, verified) {
      const eventId =
        parsed.eventId ||
        parsed.EventId ||
        'dingtalk-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');

      return {
        eventId: String(eventId),
        eventType: parsed.EventType || parsed.eventType || 'unknown',
        tenantId: verified.conf && verified.conf.tenantId,
        payload: parsed,
      };
    },
  };
}

module.exports = { makeDingtalkReceiver };
```

**新建 `src/integrations/app-lookup.js`：**

```js
const pool = require('../db/pool');
const { decrypt } = require('../crypto/secret-box');

async function findAppByPlatform(platform) {
  const { rows } = await pool.query(
    `select tenant_id, app_id, app_secret_enc, verify_token, encrypt_key
     from platform_apps
     where platform = $1 and status = 'active'
     order by last_ok_at desc nulls last, created_at desc
     limit 1`,
    [platform]
  );

  if (rows.length === 0) return null;

  return {
    tenantId: rows[0].tenant_id,
    appId: rows[0].app_id,
    appSecret: decrypt(rows[0].app_secret_enc),
    verifyToken: rows[0].verify_token,
    encryptKey: rows[0].encrypt_key,
  };
}

module.exports = { findAppByPlatform };
```

## 2.4 挂到 server

**改 `src/server.js`，删掉旧的 webhook 路由，换成：**

```js
const { createWebhookReceiver } = require('./src/integrations/webhook');
const { makeFeishuReceiver } = require('./src/integrations/adapters/feishu');
const { makeWecomReceiver } = require('./src/integrations/adapters/wecom');
const { makeDingtalkReceiver } = require('./src/integrations/adapters/dingtalk');

for (const make of [makeFeishuReceiver, makeWecomReceiver, makeDingtalkReceiver]) {
  const r = createWebhookReceiver(make());
  app.use('/api/webhooks/platform' + r.path, r.router);
}
```

**现在有三个 URL：**

```text
/api/webhooks/platform/feishu
/api/webhooks/platform/wecom
/api/webhooks/platform/dingtalk
```

**注意这段代码的好处：加第四家平台，只需要写一个 `makeXxxReceiver`，然后加进数组。**

**核心逻辑（`webhook.js`）一行不改。**

## 2.5 自检点

**假平台推一条，确认还能收：**

```text
curl -X POST http://localhost:5000/mock/push-event -H "Content-Type: application/json" -d "{\"event_type\":\"im.message.receive_v1\",\"text\":\"ping\"}"
```

**但注意：URL 变了。**

**改 `.env` 里的 `MOCK_CALLBACK_URL`：**

```text
MOCK_CALLBACK_URL=http://localhost:3000/api/webhooks/platform/feishu
```

**重启假平台。**

**再推，应该正常。**

**而且日志格式变了：**

```text
[webhook:feishu] 已收件 {"eventId":"ev_xxx","type":"message.received","elapsedMs":12}
```

**带平台名的日志，排查时能一眼看出是哪家的问题。**

---

# 第 3 步：加密模式的完整链路（30 分钟）

**现在假平台推的是明文。真实飞书推的是加密的。**

**要能处理两种。**

## 3.1 给假平台加加密推送

**在 `scripts/mock-platform.js` 里加一个函数：**

```js
function encryptLikeFeishu(plainObj, encryptKey) {
  const key = crypto.createHash('sha256').update(String(encryptKey)).digest();
  const text = JSON.stringify(plainObj);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

  return Buffer.concat([iv, enc]).toString('base64');
}
```

**然后加一个加密推送接口：**

```js
app.post('/mock/push-event-encrypted', async (req, res) => {
  const eventId = req.body.event_id || 'ev_' + crypto.randomBytes(8).toString('hex');

  const plain = {
    schema: '2.0',
    header: {
      event_id: eventId,
      event_type: req.body.event_type || 'im.message.receive_v1',
      create_time: String(Date.now()),
      token: APP_ID,
      app_id: APP_ID,
      tenant_key: 'mock_tenant',
    },
    event: {
      sender: { sender_id: { open_id: 'ou_mock_user' } },
      message: {
        message_id: 'om_' + crypto.randomBytes(6).toString('hex'),
        chat_id: 'oc_mock_chat',
        content: JSON.stringify({ text: req.body.text || '加密推送' }),
      },
    },
  };

  const bodyStr = JSON.stringify({ encrypt: encryptLikeFeishu(plain, EVENT_KEY) });

  const signature = crypto.createHmac('sha256', EVENT_KEY).update(bodyStr).digest('base64');
  const ts = String(nowSec());
  const nonce = crypto.randomBytes(8).toString('hex');

  console.log('[mock-platform] 推送加密事件', eventId);

  const started = Date.now();

  try {
    const r = await fetch(CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Lark-Request-Timestamp': ts,
        'X-Lark-Request-Nonce': nonce,
        'X-Lark-Signature': signature,
      },
      body: bodyStr,
      signal: AbortSignal.timeout(3000),
    });

    const elapsed = Date.now() - started;
    const text = await r.text();
    console.log(`[mock-platform] 加密回调返回 ${r.status}，耗时 ${elapsed}ms`);

    res.json({ ok: true, status: r.status, elapsedMs: elapsed, eventId });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});
```

## 3.2 必须配置 `encrypt_key`

**加密模式的验签用的是 `Encrypt Key`，不是 `App Secret`。**

**所以 `platform_apps` 表里要填 `encrypt_key`。**

**更新配置：**

```text
curl -X PUT http://localhost:3000/api/platform/apps/feishu -b cookies.txt -H "Content-Type: application/json" -d "{\"appId\":\"cli_mock_app\",\"appSecret\":\"mock-app-secret\",\"encryptKey\":\"mock-event-aes-key-32byteslong!!\",\"verifyToken\":\"mock-verify-token\"}"
```

**但第 177 节的 `PUT` 接口不收 `encryptKey`。要加。**

**改 `src/routes/platform.js` 的 `PUT`：**

```js
const encryptKey = String(req.body.encryptKey || '').trim();
const verifyToken = String(req.body.verifyToken || '').trim();

const row = await withTenant(req.tenant.id, async (db) => {
  const r = await db.client.query(
    `insert into platform_apps
       (tenant_id, platform, app_id, app_secret_enc, encrypt_key, verify_token)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (tenant_id, platform) do update
     set app_id = excluded.app_id,
         app_secret_enc = excluded.app_secret_enc,
         encrypt_key = coalesce(nullif(excluded.encrypt_key, ''), platform_apps.encrypt_key),
         verify_token = coalesce(nullif(excluded.verify_token, ''), platform_apps.verify_token),
         status = 'active',
         last_error = null,
         updated_at = now()
     returning id, platform, app_id, status`,
    [
      req.tenant.id,
      platform,
      appId,
      encrypt(secret),
      encryptKey,
      verifyToken,
    ]
  );
  return r.rows[0];
});
```

**注意 `coalesce(nullif(excluded.encrypt_key, ''), platform_apps.encrypt_key)`。**

**含义：如果这次没传 `encryptKey`（或者传了空串），保留原来的值。**

**这个写法很重要——** **客户只想改 `appSecret` 的时候，不该被迫重新填 `encryptKey`。**

**`nullif('', '')` 返回 `null`，`coalesce(null, 旧值)` 返回旧值。** **这是"可选字段更新"的标准 SQL 写法。**

## 3.3 测试加密推送

**推一条：**

```text
curl -X POST http://localhost:5000/mock/push-event-encrypted -H "Content-Type: application/json" -d "{\"text\":\"加密模式测试\"}"
```

**期望日志：**

```text
[mock-platform] 推送加密事件 ev_xxx
[webhook:feishu] 已收件 {"eventId":"ev_xxx","type":"message.received","elapsedMs":9}
[mock-platform] 加密回调返回 200，耗时 12ms
[handler] 收到消息： 加密模式测试 来自 ou_mock_user
```

**如果验签失败：**

```text
[webhook:feishu] 验签失败 {"reason":"SIGNATURE_MISMATCH"}
```

**检查 `encrypt_key` 是不是和假平台的 `EVENT_KEY` 一致。**

**如果解密失败：**

```text
[webhook:feishu] 验签失败 {"reason":"DECRYPT_FAILED:..."}
```

**说明验签过了，但解密不对。** **检查：**

```text
① EncryptKey 是不是同一个
② key 是不是 SHA256(EncryptKey)
③ IV 是不是前 16 字节
```

## 3.4 一个必须注意的顺序问题

**看适配器代码：**

```js
// 先验签
if (!timingEqual(given, expected)) return { ok: false, reason: 'SIGNATURE_MISMATCH' };

// 再解密
if (bodyObj.encrypt) {
  decrypted = decryptFeishuToJson(bodyObj.encrypt, encryptKey);
}
```

**为什么这个顺序是对的：**

```text
验签 → 证明请求来自平台，且没被改过
解密 → 拿到真实内容
```

**反过来会怎样：**

```text
先解密 → 攻击者发一个假的加密 body，你解密失败，报"解密错误"
        → 你不知道是"密钥错"还是"被攻击"
        → 而且非法请求消耗了你的 CPU（解密比验签贵）
```

**顺序写下来：验签 → 解密 → 解析 → 归一化 → 落库 → 应答。**

---

# 第 4 步：重试做完整（25 分钟）

**第 178 节做了基本重试。这一节补三个东西：超时回收、死信告警、手动重放。**

## 4.1 超时回收

**问题：worker 认领了一条事件（`status = 'processing'`），然后进程被杀了。**

**这条事件永远卡在 `processing`，没人处理。**

**修：加一个回收任务。**

**在 `src/platform/worker.js` 里加：**

```js
async function reclaimStuck(timeoutMinutes = 10) {
  const { rows } = await pool.query(
    `update platform_events
     set status = 'failed',
         last_error = coalesce(last_error, '') || ' [工作进程超时未完成]',
         next_retry_at = now()
     where status = 'processing'
       and received_at < now() - ($1 || ' minutes')::interval
     returning id, attempts`,
    [String(timeoutMinutes)]
  );

  if (rows.length > 0) {
    console.error('[worker] 回收了 ' + rows.length + ' 条卡住的事件', rows.map((r) => r.id));
  }

  return rows.length;
}

async function tick(limit = 10) {
  if (running) return { skipped: true };
  running = true;

  try {
    await reclaimStuck(10);

    const rows = await claimBatch(limit);
    ...
  } finally {
    running = false;
  }
}
```

## 4.2 死信告警

**连续失败 5 次的事件，标记为 `failed_permanently`。这时候需要人看。**

**加一个"给自己发通知"的机制。**

**新建 `src/integrations/alert.js`：**

```js
const { sendText } = require('../platform/client');

let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

async function alertSelf(tenantId, message) {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) {
    console.warn('[alert] 冷却中，跳过：', message);
    return;
  }
  lastAlertAt = now;

  console.error('[alert]', message);

  const chatId = process.env.ADMIN_CHAT_ID;
  if (!chatId) {
    console.error('[alert] 没有配 ADMIN_CHAT_ID，只打日志');
    return;
  }

  try {
    await sendText(tenantId, 'feishu', chatId, '【系统告警】\n' + message);
  } catch (err) {
    console.error('[alert] 发送告警失败：', err.message);
  }
}

module.exports = { alertSelf };
```

**在 worker 的 `processOne` 里，`gave_up` 时调用：**

```js
if (!willRetry) {
  const { alertSelf } = require('../integrations/alert');
  await alertSelf(
    row.tenant_id,
    `事件永久失败\n平台：${row.platform}\n类型：${row.event_type}\n事件ID：${row.event_id}\n原因：${err.message.slice(0, 200)}`
  ).catch(() => {});
}
```

## 4.3 三个设计点

### 冷却时间

```js
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
```

**为什么：**

**如果平台大范围推送失败，100 条事件会在 1 分钟内全部 `failed_permanently`。**

**没有冷却，你会收到 100 条告警消息。**

**有冷却，你只收到第一条——** **而那一条已经告诉了你"有 1 条失败"，你会去看日志，日志里有全部 100 条。**

**这就是"告警降温"（alert throttling），所有监控系统都有。**

### 告警要发给"你自己"，不是客户

```text
ADMIN_CHAT_ID  你自己的群
```

**不是客户的群。** **因为客户看不懂"事件永久失败"。**

**这一条很重要：内部告警和客户通知是两个通道，绝对不能混。**

### 只对 `failed_permanently` 告警

**不对 `failed`（还会重试的）告警。**

**因为重试成功了你就不需要知道。** **每次都告警，你会被噪音淹没。**

## 4.4 手动重放

**新建 `scripts/replay-failed.js`：**

```js
const pool = require('../src/db/pool');

(async () => {
  const dryRun = !process.argv.includes('--run');

  const { rows } = await pool.query(
    `select id, platform, event_type, event_id, attempts, last_error, received_at
     from platform_events
     where status in ('failed_permanently', 'failed')
       and attempts >= 3
     order by received_at desc
     limit 20`
  );

  console.log('近期失败的事件：', rows.length, '条\n');

  for (const r of rows) {
    console.log(
      `  ${r.event_id}  ${r.event_type}  ${r.attempts}次  ${(r.last_error || '').slice(0, 60)}`
    );
  }

  if (rows.length === 0) {
    await pool.end();
    return;
  }

  if (dryRun) {
    console.log('\n预演。加 --run 把这些事件重置为 pending 重试。');
    await pool.end();
    return;
  }

  const ids = rows.map((r) => r.id);

  const { rowCount } = await pool.query(
    `update platform_events
     set status = 'pending', attempts = 0, next_retry_at = now(), last_error = null
     where id = any($1::uuid[])`,
    [ids]
  );

  console.log('\n已重置', rowCount, '条，worker 会在下一轮处理');
  await pool.end();
})();
```

**这里有个危险的默认行为：`attempts = 0`。**

**为什么要重置成 0：** 因为你是"人工确认问题已修复"，所以给它完整的 5 次重试机会。

**为什么危险：** 如果问题没修复，它会再失败 5 次。**所以必须有 `--run`。**

**所有会改数据状态的脚本都默认 dry-run。** 这个规矩第 168 节讲过，这里再用一次。

---

# 第 5 步：故意崩一次（20 分钟）

**四件套里，"重试"最容易被写成假的。** **必须验证它真的在工作。**

## 5.1 造一个必然失败的 handler

**在 `src/platform/handlers.js` 里临时加：**

```js
register('always.fail', async () => {
  throw new Error('故意失败，用于测试重试');
});
```

**推一条这个类型的事件：**

```text
curl -X POST http://localhost:5000/mock/push-event -H "Content-Type: application/json" -d "{\"event_type\":\"always.fail\",\"text\":\"x\"}"
```

**注意：假平台推的 `event_type` 是 `always.fail`，适配器会把它原样传下去（不在 map 里就返回原值）。**

**所以它能到达 handler。**

## 5.2 观察重试

**盯日志 3 分钟。你会看到：**

```text
[handler] ...（第一次失败）
（10 秒后）
（第二次失败）
（20 秒后）
（第三次）
（40 秒后）
...
```

**查数据库：**

```sql
select event_id, status, attempts, last_error, next_retry_at
from platform_events
where event_type = 'always.fail'
order by received_at desc limit 1;
```

**`attempts` 会从 1 涨到 5，然后 `status` 变成 `failed_permanently`。**

**同时你应该收到一条告警（如果配了 `ADMIN_CHAT_ID`）。**

## 5.3 验证"修好之后重放能成功"

**把 handler 改成不抛错：**

```js
register('always.fail', async ({ db, payload }) => {
  console.log('[handler] 这次成功了');
});
```

**重启服务，然后：**

```text
node scripts/replay-failed.js
```

**看列表，然后：**

```text
node scripts/replay-failed.js --run
```

**几秒后查数据库：**

```sql
select status, attempts from platform_events where event_type = 'always.fail' order by received_at desc limit 1;
```

**应该是 `done`，`attempts = 1`。**

**如果还是 `failed_permanently`，说明你重置的 `attempts` 没生效，或者 worker 没在跑。**

## 5.4 这个实验的意义

**你会真的看到"10 秒、20 秒、40 秒、80 秒、160 秒"这个时间序列。**

**这个数字不是随便定的：**

```text
太短 → 平台刚恢复你又打上去
太长 → 客户等太久
指数退避 + 上限 300 秒  是行业共识
```

**而且你会看到** **最后一条失败之后告警只来一次**（冷却生效），**而不是每次失败都来**。

---

# 第 6 步：最终验收

## A. 四件套

- [ ] 验签：三家都能验，时间戳都检查了
- [ ] 幂等：`platform_events` 唯一约束 + `on conflict do nothing`
- [ ] 重试：指数退避 + 抖动 + 上限 5 次
- [ ] 留档：`payload` 存了 `raw` 和 `normalized`

## B. 抽象

- [ ] `createWebhookReceiver` 是唯一的入口逻辑
- [ ] 加新平台只需写 `verify` + `normalize`
- [ ] `webhook.js` 里没有任何平台名
- [ ] 日志带平台名（`[webhook:feishu]`）

## C. 加密

- [ ] `decryptFeishu` 用 `SHA256(EncryptKey)` 做 key
- [ ] IV 取前 16 字节
- [ ] 顺序是"验签 → 解密"
- [ ] `encrypt-test.js` 能自己加密再解开
- [ ] `push-event-encrypted` 能走通完整链路

## D. 重试

- [ ] `reclaimStuck` 能回收卡在 `processing` 的事件
- [ ] 失败次数和退避时间符合 10/20/40/80/160 秒
- [ ] `failed_permanently` 会告警
- [ ] 告警有冷却（不会刷屏）
- [ ] `replay-failed.js` 默认 dry-run
- [ ] 修好之后重放能成功

## E. 实测

- [ ] 明文和加密两种推送都能处理
- [ ] `always.fail` 跑完 5 次变成 `failed_permanently`
- [ ] 重放后变成 `done`
- [ ] 回调耗时 p95 < 100ms

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"验签 → 解密"的顺序为什么不能反
- [ ] 我记下了告警冷却的用处

## 提交

```text
git add -A
git commit -m "第179节课: 通用 Webhook 四件套 + 加密模式 + 超时回收 + 死信告警"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `Invalid key length` | key 没做 SHA256 | `createHash('sha256').update(k).digest()` |
| `bad decrypt` | EncryptKey 错，或密文被改 | 检查 key；检查 rawBody 是不是原始字节 |
| `DECRYPT_FAILED` 但签名通过 | 验签用的 key 和解密用的 key 不同 | 都用 `encryptKey`（不是 `appSecret`） |
| 加密推送收不到 | `platform_apps` 里没 `encrypt_key` | 补上 |
| 改了 `appSecret` 之后 `encryptKey` 丢了 | `PUT` 用了 `excluded.encrypt_key` 直接覆盖 | 用 `coalesce(nullif(...), 旧值)` |
| webhook 路由里 `req.body.foo` 是 `undefined` | 用了 `express.raw`，body 是 Buffer | 自己 `JSON.parse(rawBody)` |
| 事件卡在 `processing` | worker 崩了 | `reclaimStuck` 会回收 |
| 告警刷屏 | 没做冷却 | 加时间窗口 |
| `replay-failed --run` 后还是失败 | 问题没真的修好 | 先看 `last_error` |
| 卡住的回收太早 | `timeoutMinutes` 太小 | 10 分钟是合理值，别低于处理时间的 3 倍 |

---

## 本节课要能说出口的一句话

> **Webhook 的四件事（验签、幂等、重试、留档）必须在一个地方实现一次，然后套到所有平台；把它们散在各自的适配器里，你就是在给自己制造"某一家忘了检查某一样"的机会。**
