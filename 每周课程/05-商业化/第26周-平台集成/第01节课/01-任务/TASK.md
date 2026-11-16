# 第 176 节课：客户不在你的网站里

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课不写代码。它解决一个更前置的问题：**你的系统应该长在哪里。**
> 答错了，后面六节课全白做。

**建议用时**：110 分钟
**你需要先完成**：第 175 节课（支付和对账都跑通，`saas-lab` 完整）

---

# 第 0 步：先算一笔"打开率"的账（20 分钟）

## 0.1 两种客户，两种行为

**你自己做的系统，客户会多久打开一次？**

```text
一个 CRM：销售每天打开 3—5 次
一个审批系统：员工每周打开 1—2 次
一个报表系统：老板每月打开 1 次
```

**而客户每天必开的软件是哪些：**

```text
飞书 / 企业微信 / 钉钉 / 微信    ← 上班第一件事，一天几十次
Excel                           ← 一直都在
```

**这个差距是量级上的。**

## 0.2 一个真实的对比

**假设你给客户做了一个"每月自动生成经营报表"的功能。**

**方案一：自己做界面**

```text
客户每月 1 号收到你的邮件 → 点链接 → 登录 → 找菜单 → 下载
```

**实际上会发生：**

```text
第 1 个月：打开了
第 2 个月：忘了
第 3 个月：客户说"这个功能我们没用起来，能不能退"
```

**方案二：直接推到群里**

```text
每月 1 号 09:00，飞书群里出现一条卡片：
「11 月经营简报已生成」
 收入 ¥128,400  ↑ 12%
 订单 1,024 笔   ↑ 8%
 [ 查看完整报表 ]  [ 下载 Excel ]
```

**实际上会发生：**

```text
客户点开看了
第二个月主动问"这个月的怎么还没来"
```

**同样的功能，同样的数据。差别只在"客户要不要改变习惯"。**

## 0.3 这节课要得出的结论

```text
不要让客户来你的系统。
把你的系统送到客户已经在的地方。
```

**这条原则会影响你后面所有的产品决策：**

```text
通知从哪发      群里，不发邮件
审批在哪做       卡片按钮，不进后台
数据怎么给       推摘要 + 一键展开，不让他登录看
```

**但要注意：这条原则有个前提——你已经有一个能用的系统了。** 平台集成是"入口"，不是"系统本身"。

**先把第 24、25 周的系统做扎实，再来做这一周。** 反过来做，你只会做出一个"群里很热闹，点进去什么都没有"的空壳。

---

# 第 1 步：三家平台，先看清区别（30 分钟）

## 1.1 一张对照表

| | 飞书 | 企业微信 | 钉钉 |
|---|---|---|---|
| 主要客户 | 互联网、新兴公司、外企 | 零售、制造、传统企业、有微信生态需求的 | 制造、政府、国企、传统大企业 |
| 消息卡片能力 | 强（交互卡片，按钮、表单、下拉） | 中（模板卡片，按钮有限） | 中（ActionCard，按钮） |
| 回调超时 | **3 秒** | **5 秒** | 3 秒 |
| 通讯录 API | 完整，权限细 | 完整，但需要"通讯录同步"权限 | 完整 |
| 文档能力 | 很强（云文档、多维表格、可编程） | 弱 | 中 |
| 调试工具 | 好（API 调试台、事件订阅可视化） | 一般 | 一般 |
| 自建应用门槛 | 企业管理员建应用，秒级 | 管理员建应用 + 可信域名 + IP 白名单 | 管理员建应用 |
| 免费额度 | 有 | 有 | 有 |

## 1.2 怎么选（不是技术问题）

**看客户已经在用什么。** 这一条比上面所有对比都重要。

```text
客户公司用飞书 → 你就接飞书，不要去说服他换
客户公司用企微 → 你就接企微
客户说"我们两个都在用" → 先接他现在推的那个（一般是老板用的那个）
```

**为什么：** 因为你的系统要长在他工作的地方。**他公司有 200 人在飞书里，你接企微，等于要 200 人装一个新软件。**

## 1.3 如果你的客户还没定

**一人公司接活时的真实情况：客户往往没有明确偏好。**

**这是你的机会，也是你的风险：**

```text
机会：你可以引导他用哪个，选你更熟的
风险：你引导错了，他会觉得"这个系统不好用"，但实际是平台选错了
```

**给你的建议：**

| 客户情况 | 建议 |
|---|---|
| 30 人以下的新公司 | 飞书。上手快，卡片能力强 |
| 有零售/门店/工厂 | 企微。和微信打通，员工熟悉 |
| 国企/政府/大型制造 | 钉钉。合规，采购流程熟 |
| 客户已经有明确的 | **跟着客户，别争** |

## 1.4 一个必须提前说的技术限制

**三家的回调都是"你必须快速应答"。**

```text
飞书：3 秒
企微：5 秒
钉钉：3 秒
```

**超时会怎样：**

```text
① 平台认为你没收到，重推同一条事件
② 重推时你如果又超时，继续重推（飞书最多重试若干次）
③ 你的日志里会出现大量重复事件
④ 如果业务逻辑不幂等，客户会收到多条一样的通知
```

**这一条决定了第 178 节的整个设计：回调只做记账和应答，重活全丢后台。**

**现在先记住这个数字：3 秒。**

---

# 第 2 步：把这一周的概念先理清（25 分钟）

**平台集成有七个概念，混在一起就会乱。分开看，每个都简单。**

## 2.1 七个概念

```text
① 自建应用     你在平台后台建的一个应用，有 app_id 和 app_secret
② tenant_access_token  用 app_id + app_secret 换来的调用凭证，2 小时有效
③ 事件订阅     平台把"发生了什么事"推给你的一个 URL
④ 回调验签     证明这个请求真的来自平台，不是伪造的
⑤ 消息 / 卡片  你主动给用户或群发的东西
⑥ 卡片回调     用户在卡片上点了按钮，平台推给你一个事件
⑦ 通讯录 / 开放接口  你去平台拉数据（不是推，是你主动拉）
```

## 2.2 它们之间的关系

```text
                 ┌─────────────────┐
                 │   你的系统       │
                 └────────┬────────┘
                          │
      ① 换 token ←────────┤
                          │
      ⑤ 发消息 ──────────→│──→ 平台 ──→ 客户
                          │
      ③ 事件 ←────────────│←── 平台（推，带超时）
                          │
      ⑥ 卡片回调 ←────────│←── 平台（推，带超时）
                          │
      ⑦ 拉数据 ──────────→│──→ 平台（拉，你有控制权）
```

**关键区别：**

```text
推（事件、卡片回调）  平台决定什么时候发，你必须快速应答，随时可能重推
拉（开放接口）        你决定什么时候拉，可以慢慢处理，失败可以重试
```

**这两种的容错策略完全不同。** 推的要"快 + 幂等"，拉的要"稳 + 断点续传"。

## 2.3 一个常被搞混的地方

**"事件订阅"和"卡片回调"是两个不同的入口，但可以共用一个 URL。**

**飞书是这样：**

```text
事件订阅 URL      https://yoursite.com/webhook/feishu
卡片回调 URL      https://yoursite.com/webhook/feishu   ← 可以一样
```

**平台靠 payload 里的字段区分：**

```json
// 事件
{ "schema": "2.0", "header": { "event_type": "im.message.receive_v1" }, "event": {...} }

// 卡片回调
{ "open_id": "...", "action": { "value": {...} }, "token": "..." }
```

**同一个 URL，两套 payload，你的代码要先判断是哪种。**

**这一点在第 178 节会处理。**

---

# 第 3 步：设计你的消息格式（30 分钟）

**这是这节课唯一"要动脑"的部分。**

## 3.1 三种消息形态

**形态一：纯文本**

```text
【经营简报】11 月收入 ¥128,400，环比 +12%；订单 1,024 笔，环比 +8%。
完整报表：https://yoursite.com/r/abc
```

**优点：** 一定能显示，任何平台都支持。
**缺点：** 没层次，数字多了看不清。

**形态二：卡片**

```text
┌────────────────────────────────┐
│ 11 月经营简报                    │
├────────────────────────────────┤
│ 收入      ¥128,400   ↑ 12%      │
│ 订单      1,024 笔   ↑ 8%       │
│ 客单价    ¥125.39    ↑ 3%       │
├────────────────────────────────┤
│ [ 查看报表 ]  [ 下载 Excel ]     │
└────────────────────────────────┘
```

**优点：** 一眼看清，可交互。
**缺点：** 各平台 JSON 格式不同，你要写适配。

**形态三：一张图片**

**优点：** 排版完全可控。
**缺点：** 不能点击，数字看不清的时候客户只能放大看。

**结论：**

```text
能用卡片就用卡片（90% 的场合）
卡片做不了的再用文本（降级方案）
图片只用在真正的图表上
```

## 3.2 卡片内容的四个设计原则

**原则一：第一条信息必须是"要不要看"的判断依据**

```text
❌ 「系统通知：您有一条新的待办」
✅ 「待审批：采购申请 ¥48,000（张伟提交，已等 2 天）」
```

**客户看第一行就要能决定"现在处理还是待会儿"。**

**原则二：数字要带对比**

```text
❌ 收入 ¥128,400
✅ 收入 ¥128,400（环比 +12%）
```

**没有对比的数字没有意义。** 客户不知道 128,400 是好还是坏。

**原则三：按钮不超过两个**

```text
✅ [ 通过 ]  [ 驳回 ]
❌ [ 通过 ] [ 驳回 ] [ 转交 ] [ 查看详情 ] [ 催办 ]
```

**超过两个，客户要想"点哪个"。** 想了一下就会关掉。

**原则四：一定要有"查看详情"的出口**

**卡片上永远写不全。** 客户想深挖的时候，给他一个链接。

**但注意：这个链接点进去要能直接登录（免登），不能让他输密码。**

---

# 第 4 步：写一份消息清单（25 分钟）

**把你系统里所有"需要主动通知客户"的场景列出来。**

**这份清单决定了你后面六节课要做什么。**

## 4.1 照着业务过一遍

**新建 `docs/notify-list.md`：**

| # | 场景 | 发给谁 | 形态 | 紧急度 | 有没有按钮 |
|---|---|---|---|---|---|
| 1 | 有新的待审批 | 审批人 | 卡片 | 高 | 通过 / 驳回 |
| 2 | 审批结果 | 申请人 | 卡片 | 中 | 无 |
| 3 | 每日经营简报 | 老板 / 群 | 卡片 | 低 | 查看报表 |
| 4 | 订单支付成功 | 客户管理员 | 文本 | 中 | 无 |
| 5 | 额度快用完 | 客户管理员 | 卡片 | 高 | 去升级 |
| 6 | 试用 3 天后到期 | 客户管理员 | 卡片 | 高 | 去付费 |
| 7 | 导入失败 | 操作人 | 卡片 | 中 | 下载错误清单 |
| 8 | 系统异常（回调连续失败） | 你自己 | 文本 | 极高 | 无 |

**注意第 8 行：给自己发。**

**平台集成不只是给客户发通知，也可以是给你的运维告警。** 这一条很实用——**你不可能天天盯着服务器，但你会看群。**

## 4.2 给每条标紧急度

**紧急度决定用什么通道：**

| 紧急度 | 通道 | 例子 |
|---|---|---|
| 极高 | 私聊 + @人 + 短信 | 系统挂了、客户数据异常 |
| 高 | 私聊 | 待审批、额度告急 |
| 中 | 群消息 | 支付成功、导入完成 |
| 低 | 群消息，可静音 | 每日简报 |

**为什么分：** 如果你所有通知都发私聊，客户会烦，然后关掉你的通知。**那你的系统就聋了。**

**区分"必须马上看"和"可以晚点看"，是通知系统设计的第一原则。**

## 4.3 一个反直觉的建议

**少发，比发得多更重要。**

```text
客户第一天：收到 3 条通知，都看了
客户第一周：收到 20 条通知，看了 5 条
客户第一月：全部静音
```

**你的系统一旦被静音，就等于不存在。**

**所以每条通知都要能回答："如果我不发这条，客户会损失什么？"**

**答不出来就别发。**

**把这条写进笔记。** 以后每次想加一个通知，先问自己一遍。

---

# 第 5 步：建假平台（25 分钟）

**这一周所有代码都对着它写。**

## 5.1 新建 `scripts/mock-platform.js`

```js
const express = require('express');
const crypto = require('crypto');

const PORT = Number(process.env.MOCK_PLATFORM_PORT || 5000);
const APP_ID = process.env.MOCK_APP_ID || 'cli_mock_app';
const APP_SECRET = process.env.MOCK_APP_SECRET || 'mock-app-secret';
const EVENT_KEY = process.env.MOCK_EVENT_KEY || 'mock-event-aes-key-32byteslong!!';
const CALLBACK_URL = process.env.MOCK_CALLBACK_URL || 'http://localhost:3000/api/webhooks/platform/event';

const app = express();
app.use(express.json({ limit: '2mb' }));

const tokens = new Map();
const events = [];

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

app.post('/open-apis/auth/v3/tenant_access_token/internal', (req, res) => {
  const { app_id: appId, app_secret: appSecret } = req.body || {};

  if (appId !== APP_ID || appSecret !== APP_SECRET) {
    return res.status(400).json({ code: 10003, msg: 'app_id or app_secret invalid' });
  }

  const token = 't-' + crypto.randomBytes(16).toString('hex');
  const expire = 7200;

  tokens.set(token, { issuedAt: nowSec(), expire });
  console.log('[mock-platform] 发放 token', token.slice(0, 12) + '...', '有效期', expire, '秒');

  res.json({
    code: 0,
    msg: 'ok',
    tenant_access_token: token,
    expire,
  });
});

function verifyToken(req) {
  const raw = req.headers.authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '');
  const rec = tokens.get(token);

  if (!rec) return { ok: false, code: 99991663, msg: 'invalid token' };

  if (nowSec() > rec.issuedAt + rec.expire) {
    tokens.delete(token);
    return { ok: false, code: 99991663, msg: 'token expired' };
  }

  return { ok: true, token };
}

app.post('/open-apis/im/v1/messages', (req, res) => {
  const v = verifyToken(req);
  if (!v.ok) return res.status(401).json({ code: v.code, msg: v.msg });

  const { receive_id: receiveId, msg_type: msgType, content } = req.body || {};

  if (!receiveId || !msgType) {
    return res.status(400).json({ code: 10001, msg: 'receive_id and msg_type required' });
  }

  let parsed = content;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      return res.status(400).json({ code: 10002, msg: 'content is not valid json' });
    }
  }

  const messageId = 'om_' + crypto.randomBytes(10).toString('hex');

  console.log('[mock-platform] 发消息', messageId, msgType, '→', receiveId);
  if (msgType === 'interactive') {
    console.log('  标题：', parsed.header && parsed.header.title && parsed.header.title.content);
  }

  res.json({
    code: 0,
    msg: 'ok',
    data: { message_id: messageId },
  });
});

app.post('/mock/push-event', async (req, res) => {
  const eventType = req.body.event_type || 'im.message.receive_v1';
  const eventId = req.body.event_id || 'ev_' + crypto.randomBytes(8).toString('hex');

  const payload = {
    schema: '2.0',
    header: {
      event_id: eventId,
      event_type: eventType,
      create_time: String(Date.now()),
      token: APP_ID,
      app_id: APP_ID,
      tenant_key: 'mock_tenant',
    },
    event: req.body.event || {
      sender: { sender_id: { open_id: 'ou_mock_user' } },
      message: {
        message_id: 'om_' + crypto.randomBytes(6).toString('hex'),
        chat_id: 'oc_mock_chat',
        content: JSON.stringify({ text: req.body.text || '你好' }),
      },
    },
  };

  const bodyStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', EVENT_KEY).update(bodyStr).digest('base64');
  const ts = String(nowSec());
  const nonce = crypto.randomBytes(8).toString('hex');

  console.log('[mock-platform] 推送事件', eventId, eventType);
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
      signal: AbortSignal.timeout(Number(req.body.timeoutMs || 3000)),
    });

    const elapsed = Date.now() - started;
    const text = await r.text();

    console.log(`[mock-platform] 回调返回 ${r.status}，耗时 ${elapsed}ms`);

    events.push({
      event_id: eventId,
      event_type: eventType,
      status: r.status,
      elapsed_ms: elapsed,
      response: text.slice(0, 200),
      at: new Date().toISOString(),
    });

    res.json({ ok: true, status: r.status, elapsedMs: elapsed, eventId });
  } catch (err) {
    const elapsed = Date.now() - started;
    console.log(`[mock-platform] 回调失败 ${err.message}，耗时 ${elapsed}ms`);

    events.push({
      event_id: eventId,
      event_type: eventType,
      status: 'TIMEOUT_OR_ERROR',
      elapsed_ms: elapsed,
      response: err.message,
      at: new Date().toISOString(),
    });

    res.json({ ok: false, error: err.message, elapsedMs: elapsed, eventId });
  }
});

app.post('/mock/push-event-n/:count', async (req, res) => {
  const count = Number(req.params.count || 3);
  const eventId = 'ev_replay_' + crypto.randomBytes(6).toString('hex');

  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const r = await fetch('http://localhost:' + PORT + '/mock/push-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          event_type: req.body.event_type || 'im.message.receive_v1',
          text: req.body.text || '重放测试',
        }),
      });
      results.push(await r.json());
    } catch (err) {
      results.push({ ok: false, error: err.message });
    }
  }

  res.json({ eventId, times: count, results });
});

app.get('/mock/events', (req, res) => {
  res.json(events.slice(-50).reverse());
});

app.get('/mock/tokens', (req, res) => {
  res.json({
    count: tokens.size,
    tokens: [...tokens.keys()].map((t) => t.slice(0, 12) + '...'),
  });
});

app.post('/mock/expire-all-tokens', (req, res) => {
  const n = tokens.size;
  tokens.clear();
  console.log('[mock-platform] 清空所有 token（模拟过期）');
  res.json({ expired: n });
});

app.listen(PORT, () => {
  console.log('mock 平台已启动 http://localhost:' + PORT);
  console.log('  app_id      ', APP_ID);
  console.log('  回调地址    ', CALLBACK_URL);
  console.log('  推事件      POST /mock/push-event');
  console.log('  重放 N 次   POST /mock/push-event-n/3');
  console.log('  看 token    GET  /mock/tokens');
  console.log('  清空 token  POST /mock/expire-all-tokens');
});
```

## 5.2 五个设计点

### 它真的会签 HMAC 签名

```js
const signature = crypto.createHmac('sha256', EVENT_KEY).update(bodyStr).digest('base64');
```

**飞书的事件订阅有两种验证模式：**

```text
明文模式   直接推明文，签名在请求头里
加密模式   payload 整体 AES 加密，你要解密
```

**这里用明文 + 请求头签名，因为先跑通主流程。**

**加密模式在第 179 节会讲。**

### 它真的会超时

```js
signal: AbortSignal.timeout(Number(req.body.timeoutMs || 3000))
```

**默认 3 秒，和你线上会遇到的完全一致。**

**你可以传 `timeoutMs: 1000` 造一个更严苛的场景。**

### `token` 真的会过期

```js
if (nowSec() > rec.issuedAt + rec.expire) { ... }
```

**`expire` 是 7200 秒，和飞书一致。**

**但你可以调小来测：**

```text
把 expire 改成 60，然后等一分钟，看你的 token 缓存会不会自动续期
```

**这个测试必须做。** 因为 token 过期的 bug 只会在上线 2 小时后出现——**而你测试的时候永远遇不到。**

### `/mock/push-event-n/:count` 一次推 N 次同 id

**这是测幂等的工具。**

**真实平台重推，你只能等。这里随时造。**

### `/mock/expire-all-tokens`

**模拟"平台那边把 token 提前作废了"。**

**真实场景：管理员改了应用权限、重置了密钥、平台故障。这些时候旧 token 会突然失效。**

**你的代码必须能自动重新换 token 并重试一次。** 第 177 节会实现。

## 5.3 `.env` 加四行

```text
MOCK_PLATFORM_PORT=5000
MOCK_APP_ID=cli_mock_app
MOCK_APP_SECRET=mock-app-secret
MOCK_EVENT_KEY=mock-event-aes-key-32byteslong!!
PLATFORM_BASE_URL=http://localhost:5000
```

**最后一行是给你的 `adapter.js` 用的：换真实平台时改成 `https://open.feishu.cn`。**

## 5.4 启动并测一遍

**新开一个窗口：**

```text
node scripts/mock-platform.js
```

**换 token：**

```text
curl -X POST http://localhost:5000/open-apis/auth/v3/tenant_access_token/internal -H "Content-Type: application/json" -d "{\"app_id\":\"cli_mock_app\",\"app_secret\":\"mock-app-secret\"}"
```

**期望：**

```json
{"code":0,"msg":"ok","tenant_access_token":"t-...","expire":7200}
```

**自检点：用错的 secret 再试一次。**

```text
curl -X POST http://localhost:5000/open-apis/auth/v3/tenant_access_token/internal -H "Content-Type: application/json" -d "{\"app_id\":\"cli_mock_app\",\"app_secret\":\"wrong\"}"
```

**期望：**

```json
{"code":10003,"msg":"app_id or app_secret invalid"}
```

**记住 `10003` 这个错误码。** 上线后如果看到它，说明 `.env` 里的 `APP_SECRET` 填错了——**这是最常见的配置错误。**

---

# 第 6 步：决定你接哪家（15 分钟）

**别三家都接。选一家做深，另外两家留接口。**

## 6.1 为什么只接一家

```text
接一家   2—3 天（你会踩一遍所有坑）
接三家   7—10 天（每家坑不同，而且你记不住）
```

**对一人公司，前两个客户几乎一定用同一家平台**（同一个行业，习惯相似）。

**所以：**

```text
第一个客户用什么 → 你就把他用的那家做到能用
第二个客户如果用另一家 → 再补
```

## 6.2 但要留好扩展点

**代码结构上，从第一天就分三层：**

```text
routes/webhook-platform.js    ← 平台无关：验签、幂等、分发
platform/adapter.js           ← 平台相关：签名算法、payload 结构、消息格式
platform/client.js            ← 平台相关：发消息的 HTTP 细节
```

**routes 层不知道是哪家平台。** 它只接收"归一化"之后的事件：

```js
{
  platform: 'feishu',
  eventId: 'ev_xxx',
  eventType: 'message.received',
  tenantId: 'xxx',
  actor: { openId: 'ou_xxx' },
  payload: { text: '你好', chatId: 'oc_xxx' },
}
```

**这样接第二家的时候，只需要写一个新的 `adapter`，路由一行不改。**

**这就是这节课最重要的工程决策。**

## 6.3 一个真实的坑

**飞书和企微的"用户标识"完全不同：**

```text
飞书   open_id（应用内唯一）/ union_id（开发者内唯一）/ user_id（企业内唯一）
企微   userid（企业内唯一）
钉钉   userid（企业内唯一）
```

**同一个员工，在飞书的 `open_id` 和企微的 `userid` 是两个完全不同的字符串。**

**所以你的 `platform_contacts` 表必须存"平台 + 平台标识"的组合：**

```sql
create table platform_contacts (
  tenant_id    uuid not null,
  platform     text not null,        -- feishu / wecom / dingtalk
  platform_uid text not null,        -- open_id 或 userid
  local_user_id uuid,                -- 映射到你的 users 表
  ...
  primary key (tenant_id, platform, platform_uid)
);
```

**主键必须带 `platform`。** 不然接入第二家的时候，两个平台的 id 会互相覆盖。

**这一点在第 181 节做通讯录同步时会用到。现在先记下来。**

---

# 第 7 步：最终验收

## A. 认知

- [ ] 我能说出"为什么不要让客户打开你的网站"
- [ ] 我知道三家平台各自的客户群和主要区别
- [ ] 我知道三家的回调超时分别是多少（飞书 3 秒、企微 5 秒、钉钉 3 秒）
- [ ] 我能解释"推"和"拉"的容错策略为什么不同

## B. 消息设计

- [ ] 我写了一份 `docs/notify-list.md`，至少 5 条
- [ ] 每条都标了紧急度和有没有按钮
- [ ] 我知道为什么"少发"比"多发"重要
- [ ] 我的卡片第一行能让客户直接判断"要不要现在看"

## C. 假平台

- [ ] `mock-platform.js` 能启动
- [ ] 换 token 成功，错的 secret 返回 `10003`
- [ ] `/mock/expire-all-tokens` 能让 token 失效
- [ ] 我知道怎么用它造"回调 3 秒超时"

## D. 决策

- [ ] 我决定了先接哪一家，以及为什么
- [ ] 我知道 `platform_contacts` 的主键为什么要带 `platform`
- [ ] 我理解"路由层不知道是哪家平台"这个设计

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了三家平台的回调超时数字

## 提交

```text
git add -A
git commit -m "第176节课: 平台选型 + 消息清单 + mock 假平台"
git push
```

---

# 附：常见问题速查

| 现象 | 原因 | 怎么修 |
|---|---|---|
| `10103` / `10003` 换 token 失败 | app_id / app_secret 错 | 对一遍 `.env`，注意有没有多余空格 |
| `99991663` | token 无效或过期 | 重新换；检查是不是用了别的应用的 token |
| 假平台启动报端口占用 | 5000 被别的程序占了 | `set MOCK_PLATFORM_PORT=5001` |
| 推事件超时 | 你的回调没启动，或者耗时太长 | 检查 3000 端口；看你的回调日志 |
| 真实飞书推事件报 `challenge` | 首次配置要验证 URL | 见第 178 节 |
| 企微提示"可信域名不匹配" | 你的域名没加进白名单 | 企微后台 → 应用 → 网页授权 → 可信域名 |
| 真实平台拿不到事件 | 权限没开 | 飞书：开发者后台 → 事件与回调 → 添加事件 |

---

## 本节课要能说出口的一句话

> **平台集成的价值不在于"接上了"，而在于"客户不用改变习惯就能用到你的系统"；所以选哪家不是技术问题，是"客户已经在哪"的问题。**
