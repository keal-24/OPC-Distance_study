# 第 180 节课：群里点一下就办完

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前面四节都是"接收"。这节课第一次做"交互"：**客户在群里看一张卡片，点一个按钮，事情就办完了——他一次都不用打开你的系统。**
> 这是平台集成里唯一能直接提升"客户愿不愿意付钱"的部分。

**建议用时**：150 分钟
**你需要先完成**：第 179 节（四件套跑通，加密模式能处理，重试能验证）

---

# 第 0 步：卡片到底解决了什么（15 分钟）

## 0.1 纯文本的极限

**你现在的系统能给群里发文本：**

```text
【待审批】采购申请 ¥48,000
申请人：张伟
申请时间：11-16 09:20
详情：https://yoursite.com/approvals/abc123
```

**客户看到之后要做什么：**

```text
① 复制链接
② 打开浏览器（手机上是切换 App）
③ 可能还要重新登录
④ 找到"通过"按钮
⑤ 点
⑥ 切回飞书
```

**六步。**

**实际上：**

```text
客户看了一眼 → "待会儿处理" → 忘了
```

## 0.2 卡片能做到什么

```text
┌──────────────────────────────────┐
│ 待审批 · 采购申请                  │
├──────────────────────────────────┤
│ 金额       ¥48,000                │
│ 申请人     张伟                    │
│ 已等待     2 天 3 小时             │
│ 部门       市场部                  │
├──────────────────────────────────┤
│ [ 通过 ]   [ 驳回 ]   [ 看详情 ]   │
└──────────────────────────────────┘
```

**客户看到之后：**

```text
① 点"通过"
```

**一步。**

**这就是差别：六步 vs 一步。** 转化率不是差 20%，是差一个量级。

## 0.3 这一节要建的四样东西

```text
① 卡片模板（JSON 结构 + 一个生成函数）
② 发卡片的接口
③ 按钮回调的处理（含"谁点的""点的哪个按钮"）
④ 点完之后更新卡片（不然卡片上还显示"待审批"）
```

**第四项最容易被忘。**

**客户点了"通过"，如果你不更新卡片，卡片上还是两个按钮。** **他会以为没点上，再点一次。**

**第二次点会发生什么：** 取决于你的幂等做得怎么样。**但客户体验已经毁了。**

---

# 第 1 步：先看卡片的 JSON 结构（30 分钟）

## 1.1 飞书卡片的最小结构

```json
{
  "config": { "wide_screen_mode": true },
  "header": {
    "title": { "tag": "plain_text", "content": "待审批 · 采购申请" },
    "template": "orange"
  },
  "elements": [
    {
      "tag": "div",
      "fields": [
        { "is_short": true, "text": { "tag": "lark_md", "content": "**金额**\n¥48,000" } },
        { "is_short": true, "text": { "tag": "lark_md", "content": "**申请人**\n张伟" } }
      ]
    },
    { "tag": "hr" },
    {
      "tag": "action",
      "actions": [
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "通过" },
          "type": "primary",
          "value": { "action": "approve", "id": "abc123" }
        },
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "驳回" },
          "type": "danger",
          "value": { "action": "reject", "id": "abc123" }
        }
      ]
    }
  ]
}
```

**四个顶层字段：**

| 字段 | 作用 |
|---|---|
| `config` | 布局配置（`wide_screen_mode` 让卡片更宽） |
| `header` | 卡片头部：标题 + 颜色 |
| `elements` | 卡片主体，一个数组，按顺序渲染 |
| （每个 element） | `div` 文本块、`hr` 分割线、`action` 按钮组、`img` 图片… |

## 1.2 `header.template` 的颜色含义

```text
blue      信息（默认）
green     成功
orange    警告 / 待处理
red       错误 / 危险
grey      已关闭 / 已处理
```

**用颜色表达状态，是卡片最便宜的信息传递方式。**

```text
待审批  →  orange
已通过  →  green
已驳回  →  red
已过期  →  grey
```

**客户在消息列表里不用看文字，看颜色就知道。**

## 1.3 `action.value` 里放什么

```json
"value": { "action": "approve", "id": "abc123" }
```

**这个对象会原样回到你的回调接口。** **所以它是你的"按钮标识"。**

**三样东西必须放进去：**

```text
① 什么操作      action: "approve"
② 对哪个对象    id: "abc123"
③ 版本标识      v: 1        ← 可选但推荐
```

**为什么要有 `v`：**

**因为卡片可能存活很久（客户三个月后才点）。** **如果你的按钮语义变了（比如 `approve` 从"直接通过"改成"提交给上级"），老卡片上的按钮会按新逻辑执行。**

**带上版本号，你能识别"这是老卡片"，然后给客户一个提示"这张卡片已过期，请重新发起"。**

**这一条现在不做，但你要知道。**

## 1.4 一个安全警告

**`action.value` 是客户端回传的，不能信。**

**客户可以改这个值，或者构造一个假的按钮回调用你的接口。**

**所以：**

```text
✅ action.value 只用来"定位"，不用来"授权"
✅ 真正的权限判断要看"谁点的"（open_id → 你的 users 表 → role）
```

**具体说：**

```js
// ❌ 危险
const { id, action, approverId } = callback.action.value;
// 如果 approverId 也在 value 里，攻击者可以伪造成别人的 id

// ✅ 安全
const { id, action } = callback.action.value;
const openId = callback.operator.open_id;   // 这是平台给的，不可伪造
const user = await findUserByOpenId(openId);
if (!user || user.role !== 'admin') return 403;
```

**"谁点的"只能从回调的 `operator` 字段来，不能从 `value` 里来。**

**这条规矩写在笔记里。** 所有卡片回调都要遵守。

---

# 第 2 步：写卡片模板（40 分钟）

**别在业务代码里手写 JSON。** **写一个模板文件，业务代码只填数据。**

## 2.1 新建 `src/platform/cards/approval.js`

```js
const TEMPLATE_BY_STATUS = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  expired: 'grey',
};

function money(cents) {
  const yuan = Math.floor(Math.abs(cents) / 100);
  const fen = String(Math.abs(cents) % 100).padStart(2, '0');
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (cents < 0 ? '-' : '') + '¥' + grouped + '.' + fen;
}

function humanDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return '不到 1 小时';
  if (hours < 24) return hours + ' 小时';
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? days + ' 天 ' + rest + ' 小时' : days + ' 天';
}

function buildApprovalCard(approval) {
  const {
    id,
    title,
    amountCents,
    applicantName,
    department,
    createdAt,
    status,
    decidedBy,
    decidedAt,
    reason,
  } = approval;

  const elapsed = Date.now() - new Date(createdAt).getTime();
  const color = TEMPLATE_BY_STATUS[status] || 'blue';

  const statusText = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已驳回',
    expired: '已过期',
  }[status] || status;

  const fields = [
    { is_short: true, text: { tag: 'lark_md', content: '**金额**\n' + money(amountCents) } },
    { is_short: true, text: { tag: 'lark_md', content: '**申请人**\n' + applicantName } },
  ];

  if (department) {
    fields.push({ is_short: true, text: { tag: 'lark_md', content: '**部门**\n' + department } });
  }

  fields.push({
    is_short: true,
    text: {
      tag: 'lark_md',
      content:
        '**' + (status === 'pending' ? '已等待' : '提交于') + '**\n' +
        (status === 'pending' ? humanDuration(elapsed) : new Date(createdAt).toLocaleString('zh-CN')),
    },
  });

  const elements = [{ tag: 'div', fields }];

  if (status !== 'pending' && decidedBy) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content:
          '**' + (status === 'approved' ? '通过人' : '驳回人') + '**\n' + decidedBy +
          (decidedAt ? '，' + new Date(decidedAt).toLocaleString('zh-CN') : ''),
      },
    });

    if (reason) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: '**原因**\n' + reason },
      });
    }
  }

  if (status === 'pending') {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '通过' },
          type: 'primary',
          value: { action: 'approve', id, v: 1 },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '驳回' },
          type: 'danger',
          value: { action: 'reject', id, v: 1 },
        },
      ],
    });
  }

  elements.push({
    tag: 'note',
    elements: [
      {
        tag: 'plain_text',
        content:
          '当前状态：' + statusText +
          (status === 'pending' ? ' · 请在 48 小时内处理' : ' · 卡片已归档'),
      },
    ],
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: title || '待审批 · 采购申请' },
      template: color,
    },
    elements,
  };
}

module.exports = { buildApprovalCard, money, humanDuration };
```

## 2.2 六个设计点

### 状态决定结构和颜色

**同一个函数，四种输出：**

```text
pending   → 橙色 + 两个按钮 + "请在 48 小时内处理"
approved  → 绿色 + 无按钮 + "通过人：张伟，11-16 14:20"
rejected  → 红色 + 无按钮 + 驳回原因
expired   → 灰色 + 无按钮 + "已过期"
```

**为什么用一个函数：**

**因为"更新卡片"的时候你要重新生成整个卡片。** **如果分成四个函数，你会漏掉某一种状态。**

### `is_short: true` 让字段并排

**`fields` 里每个项的 `is_short` 决定是"半宽"还是"整宽"。**

```text
两个 is_short    → 并排两列
一个 is_short    → 占半宽，右边留空
is_short: false  → 整宽（适合长文本）
```

**不设 `is_short` 或者设成 `false`，四个字段会竖着排，卡片变得很长。**

### `lark_md` 支持 Markdown

**`"tag": "lark_md"` 的内容支持 `**加粗**`、`[链接](url)`、`\n` 换行。**

**`"tag": "plain_text"` 不支持任何格式。**

**用哪个：**

```text
标题、按钮文字  → plain_text（不需要格式）
字段内容        → lark_md（要加粗标签）
```

### `note` 放在最后

**`note` 是一个灰色小字块，适合放"辅助信息"。**

**什么算辅助信息：**

```text
✅ 状态说明、免责声明、版本号
❌ 关键信息（会被忽略）
```

**客户不会读 `note`。** 所以关键信息绝对不能放在这里。

### 按钮的 `type` 有语义

```text
primary   蓝色（主操作）
danger    红色（危险操作）
default   灰色（次要操作）
```

**"通过"用 primary，"驳回"用 danger——这是客户的直觉。**

**反过来（驳回用蓝色）会让客户误点。**

### 时间用 `toLocaleString('zh-CN')`

```js
new Date(createdAt).toLocaleString('zh-CN')
// "2026/11/16 14:20:31"
```

**这个格式中国客户最熟。**

**不要用 `toISOString()`（`2026-11-16T06:20:31.000Z`），客户看不懂那个 `T` 和 `Z`。**

**注意时区：`toLocaleString` 用的是服务器时区。** **如果你的服务器在 UTC，客户看到的是 UTC 时间——差 8 小时。**

**修：**

```js
new Date(createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
```

**这个坑很隐蔽。** 你在本地测试（东八区）一切正常，**部署到 UTC 服务器后所有时间差 8 小时。**

**把 `timeZone` 显式写上去。** **所有面向客户展示的时间都要写。**

---

# 第 3 步：发卡片（25 分钟）

## 3.1 在 client 里加发卡片

**在 `src/platform/client.js` 里加：**

```js
async function sendCard(tenantId, platform, receiveId, card) {
  const data = await callPlatform(tenantId, platform, '/open-apis/im/v1/messages', {
    method: 'POST',
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    }),
  });

  if (data.code !== 0) {
    throw new Error('发卡片失败 code=' + data.code + ' ' + data.msg);
  }

  return data.data;
}

async function updateCard(tenantId, platform, messageId, card) {
  const data = await callPlatform(
    tenantId,
    platform,
    '/open-apis/im/v1/messages/' + encodeURIComponent(messageId),
    {
      method: 'PATCH',
      body: JSON.stringify({ content: JSON.stringify(card) }),
    }
  );

  if (data.code !== 0) {
    throw new Error('更新卡片失败 code=' + data.code + ' ' + data.msg);
  }

  return data.data;
}

module.exports = { callPlatform, sendText, sendCard, updateCard, TOKEN_INVALID_CODES };
```

## 3.2 两个细节

### `content` 是**字符串**，不是对象

```js
content: JSON.stringify(card)
```

**飞书要求 `content` 必须是序列化后的 JSON 字符串。**

**直接传对象会报：**

```text
content is not a valid json string
```

**这个报错很明确，但很多人第一次会传对象。**

**为什么平台这样设计：** 因为 `content` 的结构随 `msg_type` 变（text 是 `{"text":"..."}`，interactive 是卡片结构），统一按字符串传省事。

### 更新卡片要用 `PATCH` + `message_id`

```text
PATCH /open-apis/im/v1/messages/:message_id
```

**注意：只有"你发的"消息能更新。** **而且卡片必须是"可更新的"类型。**

**限制：只能更新 14 天内的消息。** **超过就更新不了。**

**所以卡片设计要考虑"14 天后怎么办"——** **答案：状态已经稳定了，不用更新。** **但如果你的业务要求长期跟踪（比如一个持续一个月的项目），卡片就不适合做唯一入口。**

## 3.3 建审批表

**新建 `migrations/018_approvals.sql`：**

```sql
create table approvals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  title          text not null,
  amount_cents   integer not null check (amount_cents > 0),
  applicant_name text not null,
  applicant_open_id text,
  department     text,
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'expired')),
  reason         text,
  decided_by     text,
  decided_open_id text,
  decided_at     timestamptz,
  card_message_id text,
  card_chat_id   text,
  card_version   integer not null default 1,
  created_at     timestamptz not null default now()
);

create index approvals_pending_idx
  on approvals (tenant_id, created_at desc) where status = 'pending';

alter table approvals enable row level security;
alter table approvals force row level security;

create policy tenant_isolation on approvals
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

**`card_message_id` 是做什么的：**

**更新卡片必须知道"哪条消息"。** **这个 id 是发卡片时平台返回的，你必须存下来。**

**不存的话，客户点了按钮，你没法更新那张卡片——** **卡片上永远显示"待审批"。**

**这是这节课最容易漏的字段。**

## 3.4 发卡片接口

**新建 `src/routes/approvals.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');
const { sendCard } = require('../platform/client');
const { buildApprovalCard } = require('../platform/cards/approval');

const router = express.Router();
router.use(auth, tenant);

router.post('/', async (req, res, next) => {
  const title = String(req.body.title || '').trim();
  const amountCents = req.body.amountCents;
  const applicantName = String(req.body.applicantName || '').trim();
  const department = String(req.body.department || '').trim();
  const chatId = process.env.DEFAULT_APPROVAL_CHAT_ID;

  if (!title) return res.status(400).json({ error: '标题必填' });
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return res.status(400).json({ error: '金额必须是正整数分' });
  }
  if (!applicantName) return res.status(400).json({ error: '申请人必填' });
  if (!chatId) {
    return res.status(500).json({ error: '没有配置默认审批群（DEFAULT_APPROVAL_CHAT_ID）' });
  }

  try {
    const approval = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `insert into approvals
           (tenant_id, title, amount_cents, applicant_name, department, card_chat_id)
         values ($1, $2, $3, $4, $5, $6)
         returning id, title, amount_cents, applicant_name, department, status, created_at`,
        [req.tenant.id, title, amountCents, applicantName, department || null, chatId]
      );
      return r.rows[0];
    });

    const card = buildApprovalCard(approval);
    const sent = await sendCard(req.tenant.id, 'feishu', chatId, card);

    await withTenant(req.tenant.id, async (db) => {
      await db.client.query(
        'update approvals set card_message_id = $1 where tenant_id = $2 and id = $3',
        [sent.message_id, req.tenant.id, approval.id]
      );
    });

    res.status(201).json({ ...approval, cardMessageId: sent.message_id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const approvalRoutes = require('./routes/approvals');
app.use('/api/approvals', approvalRoutes);
```

**`.env` 加：**

```text
DEFAULT_APPROVAL_CHAT_ID=oc_mock_chat
```

## 3.5 自检点

**建一个审批：**

```text
curl -X POST http://localhost:3000/api/approvals -b cookies.txt -H "Content-Type: application/json" -d "{\"title\":\"采购申请\",\"amountCents\":4800000,\"applicantName\":\"张伟\",\"department\":\"市场部\"}"
```

**期望：**

```json
{
  "id": "...",
  "title": "采购申请",
  "amount_cents": 4800000,
  "status": "pending",
  "cardMessageId": "om_..."
}
```

**假平台日志里应该有：**

```text
[mock-platform] 发消息 om_... interactive → oc_mock_chat
  标题： 待审批 · 采购申请
```

**注意 `amount_cents: 4800000` 是 48000.00 元。**

**如果你在卡片上看到 `¥48,000.00`，说明 `money()` 函数对。**

---

# 第 4 步：处理按钮回调（45 分钟）

**这是这一节最核心的部分。**

## 4.1 卡片回调的 payload 长什么样

**客户点了"通过"，飞书推给你：**

```json
{
  "schema": "2.0",
  "header": {
    "event_id": "ev_card_xxx",
    "event_type": "card.action.trigger",
    "create_time": "1763000000000"
  },
  "event": {
    "operator": {
      "open_id": "ou_real_clicker",
      "user_id": "on_real_clicker"
    },
    "action": {
      "value": { "action": "approve", "id": "abc123", "v": 1 },
      "tag": "button"
    },
    "context": {
      "open_message_id": "om_xxx",
      "open_chat_id": "oc_xxx"
    }
  }
}
```

**三个关键字段：**

```text
event.operator.open_id        谁点的（不可伪造）
event.action.value            哪个按钮（可伪造，只用来定位）
event.context.open_message_id 哪条卡片消息（用来更新）
```

## 4.2 写 handler

**在 `src/platform/handlers.js` 里加（或者新建 `src/platform/handlers/approvals.js`）：**

```js
const { register } = require('../worker');
const { buildApprovalCard } = require('../cards/approval');
const { updateCard } = require('../client');
const { withTenantFromPool } = require('../../db/tenant-db');

register('card.action', async ({ db, payload, event }) => {
  const action = payload.action || {};
  const value = action.value || {};
  const openId = payload.openId;

  if (!openId) {
    console.warn('[card] 没有 operator.open_id，忽略');
    return;
  }

  if (!['approve', 'reject'].includes(value.action)) {
    console.log('[card] 不认识的操作：', value.action);
    return;
  }

  const approvalId = value.id;
  if (!approvalId) {
    console.warn('[card] value 里没有 id');
    return;
  }

  const messageId =
    (payload.context && payload.context.open_message_id) ||
    (event.payload && event.payload.raw && event.payload.raw.event
      && event.payload.raw.event.context
      && event.payload.raw.event.context.open_message_id);

  const result = await withTenantFromPool(db.tenantId, async (tx) => {
    const { rows } = await tx.client.query(
      `select id, title, amount_cents, applicant_name, department, status,
              decided_by, decided_at, reason, card_message_id, card_chat_id
       from approvals
       where tenant_id = $1 and id = $2`,
      [db.tenantId, approvalId]
    );

    if (rows.length === 0) return { reason: 'NOT_FOUND' };

    const approval = rows[0];

    if (approval.status !== 'pending') {
      return { reason: 'ALREADY_DECIDED', status: approval.status, approval };
    }

    const newStatus = value.action === 'approve' ? 'approved' : 'rejected';

    const updated = await tx.client.query(
      `update approvals
       set status = $1, decided_by = $2, decided_open_id = $3, decided_at = now()
       where tenant_id = $4 and id = $5 and status = 'pending'
       returning id, title, amount_cents, applicant_name, department, status,
                 decided_by, decided_at, reason, card_message_id, card_chat_id`,
      [newStatus, openId, openId, db.tenantId, approvalId]
    );

    if (updated.rowCount === 0) {
      const again = await tx.client.query(
        'select status from approvals where tenant_id = $1 and id = $2',
        [db.tenantId, approvalId]
      );
      return { reason: 'RACE_LOST', status: again.rows[0] && again.rows[0].status };
    }

    return { reason: null, approval: updated.rows[0], newStatus };
  });

  if (result.reason === 'NOT_FOUND') {
    console.warn('[card] 审批不存在', approvalId);
    return;
  }

  if (result.reason === 'ALREADY_DECIDED' || result.reason === 'RACE_LOST') {
    console.log('[card] 已经处理过了', approvalId, result.status);

    if (messageId) {
      await updateCard(db.tenantId, 'feishu', messageId, buildApprovalCard(result.approval))
        .catch((err) => console.error('[card] 更新卡片失败', err.message));
    }
    return;
  }

  const approval = result.approval;

  console.log('[card] 审批已处理：', approval.id, '→', approval.status, 'by', openId);

  const targetMessageId = messageId || approval.card_message_id;

  if (targetMessageId) {
    await updateCard(db.tenantId, 'feishu', targetMessageId, buildApprovalCard(approval))
      .catch((err) => console.error('[card] 更新卡片失败', err.message));
  } else {
    console.warn('[card] 没有 message_id，无法更新卡片', approval.id);
  }
});
```

## 4.3 五个关键点

### `operator.open_id` 是唯一可信的"谁点的"

**再说一遍，因为这是最容易出的安全漏洞。**

```js
const openId = payload.openId;     // 来自 event.operator.open_id
```

**不在 `value` 里。** **`value` 是按钮定义时你写进去的，但客户端的回传可以被篡改。**

**真实攻击场景：**

**如果你在 `value` 里放了 `approverId: "ou_boss"`，然后信任这个值——** **攻击者构造一个回调，`value.approverId = "ou_boss"`，他就以老板的身份批准了。**

**而 `operator.open_id` 是平台填的，攻击者改不了（改了签名就不过）。**

### `and status = 'pending'` 在 `where` 里

**和第 173 节的 `markPaid` 一模一样。**

**两个人在同一秒点"通过"和"驳回"，必须只有一个成功。**

**`rowCount === 0` 说明别人先成功了，去查当前状态，然后更新卡片。**

### 已经处理过的，也要更新卡片

```js
if (result.reason === 'ALREADY_DECIDED' || result.reason === 'RACE_LOST') {
  if (messageId) {
    await updateCard(...buildApprovalCard(result.approval));
  }
  return;
}
```

**为什么：**

**客户看到"待审批"卡片，点"通过"，因为网络问题没反应，他又点了一次。**

**第二次你觉得"已经处理了，什么都不用做"——** **但客户手机上那张卡片还是"待审批"。**

**所以要更新卡片。这样他第二次点完，看到卡片变成"已通过"，就放心了。**

### `messageId` 有两个来源，都要试

```js
const messageId =
  (payload.context && payload.context.open_message_id) ||
  (event.payload && event.payload.raw && ... );
```

**第一个来自归一化后的 `payload.context`（如果适配器有映射），** **第二个从原始 payload 里挖。**

**两个都试，是因为适配器可能没映射 `context`。**

**更干净的做法是在适配器里把 `context.open_message_id` 映射进 `payload.messageId`。** **这一节先这样兜底。**

### 更新卡片失败不能影响主流程

```js
await updateCard(...).catch((err) => console.error('[card] 更新卡片失败', err.message));
```

**为什么：**

**审批状态已经改了（数据库已提交）。** **如果更新卡片失败就抛错，worker 会重试整个 handler——** **重试会走到 `ALREADY_DECIDED` 分支，又更新一次卡片，可能一直失败。**

**卡片更新失败是"体验问题"，不是"数据问题"。** **记日志，别让整个流程失败。**

**这个判断标准很重要：**

```text
数据错了 → 抛错，让人知道
体验差了 → 记日志，别影响主流程
```

## 4.4 让假平台能造按钮回调

**在 `scripts/mock-platform.js` 里加：**

```js
app.post('/mock/click-button', async (req, res) => {
  const { approval_id: approvalId, action, open_id: openId, message_id: messageId } = req.body;

  const eventId = 'ev_card_' + crypto.randomBytes(8).toString('hex');

  const payload = {
    schema: '2.0',
    header: {
      event_id: eventId,
      event_type: 'card.action.trigger',
      create_time: String(Date.now()),
      token: APP_ID,
      app_id: APP_ID,
    },
    event: {
      operator: { open_id: openId || 'ou_mock_user' },
      action: { value: { action: action || 'approve', id: approvalId, v: 1 }, tag: 'button' },
      context: { open_message_id: messageId, open_chat_id: 'oc_mock_chat' },
    },
  };

  const bodyStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', EVENT_KEY).update(bodyStr).digest('base64');
  const ts = String(nowSec());
  const nonce = crypto.randomBytes(8).toString('hex');

  console.log('[mock-platform] 模拟按钮点击', approvalId, action);

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

    const elapsed = Date.now() - started === undefined ? 0 : 0;
    const text = await r.text();
    console.log(`[mock-platform] 按钮回调返回 ${r.status}`);
    res.json({ ok: true, status: r.status, eventId, response: text.slice(0, 200) });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});
```

**注意那行 `const elapsed = Date.now() - started === undefined ? 0 : 0;` 是我打错了。**

**删掉它。** 直接 `res.json({ ok: true, status: r.status, eventId })`。

**（这类笔误你自己敲的时候会撞上，撞上一次比看十遍都记得。）**

## 4.5 完整测一遍

**一、建审批，记下 `id` 和 `cardMessageId`**

```text
curl -X POST http://localhost:3000/api/approvals -b cookies.txt -H "Content-Type: application/json" -d "{\"title\":\"采购申请\",\"amountCents\":4800000,\"applicantName\":\"张伟\",\"department\":\"市场部\"}"
```

**二、模拟点"通过"**

```text
curl -X POST http://localhost:5000/mock/click-button -H "Content-Type: application/json" -d "{\"approval_id\":\"<你的id>\",\"action\":\"approve\",\"open_id\":\"ou_zhangwei\",\"message_id\":\"om_xxx\"}"
```

**期望日志：**

```text
[mock-platform] 模拟按钮点击 ... approve
[webhook:feishu] 已收件 {"eventId":"ev_card_xxx","type":"card.action"}
[mock-platform] 按钮回调返回 200
[handler] ... card.action
[card] 审批已处理： ... → approved by ou_zhangwei
```

**三、查数据库**

```sql
select status, decided_by, decided_at, decided_open_id
from approvals where id = '<你的id>';
```

**`status = 'approved'`，`decided_by = 'ou_zhangwei'`。**

**四、再点一次（同样的 action）**

**期望：**

```text
[card] 已经处理过了 ... approved
```

**而且卡片**又被更新了一次**（内容一样，看起来没变化）。**

**五、点"驳回"（状态已经是 approved）**

**期望：**

```text
[card] 已经处理过了 ... approved
```

**状态**不会**变成 rejected。**

**这就是幂等的意义——** **客户手抖点两次"通过"和"驳回"，不会来回翻。**

---

# 第 5 步：故意攻击一次（20 分钟）

**"按钮 value 可伪造"这句话，你要亲手验证。**

## 5.1 造一个假审批 id

**直接构造回调，用一个不存在的 id：**

```text
curl -X POST http://localhost:5000/mock/click-button -H "Content-Type: application/json" -d "{\"approval_id\":\"00000000-0000-0000-0000-000000000000\",\"action\":\"approve\"}"
```

**期望：**

```text
[card] 审批不存在 00000000-...
```

**没有报错，没有崩溃。只是记了一条日志。**

**为什么不返回错误：**

**平台已经在等你的 200 了（回调在 3 秒内已经返回）。** **handler 在后台跑，它没有"返回给平台"的通道。**

**所以 handler 的错误只能记日志。** **这就是"先应答后处理"的代价：错误不会被平台看到。**

**这就是为什么第 179 节的死信告警这么重要——** **因为 handler 的错误只有你的日志知道。**

## 5.2 造一个"别人的"审批 id（跨租户）

**这是真正的安全测试。**

**如果你有第二个租户（`seed-beta`），用 `seed-alpha` 的审批 id 去点。**

**但注意：`withTenantFromPool(db.tenantId, ...)` 里的 `db.tenantId` 来自**事件**的 `tenant_id`，**不是来自点击者。**

**所以会发生：**

```text
事件归属 seed-beta（因为回调落在 beta 的群）
用 seed-beta 的租户上下文查 seed-alpha 的审批 id
RLS 拦住 → 查不到
→ 返回 NOT_FOUND
```

**期望：**

```text
[card] 审批不存在 ...
```

**这是对的。** **RLS 在这个位置救了你的命。**

**验证一下：先把 RLS 去掉试试。**

**在测试环境临时执行：**

```sql
alter table approvals disable row level security;
```

**然后再攻击一次。**

**这次会查到！** **然后 `update ... where tenant_id = beta and id = alpha的id` 会匹配不到（因为 `tenant_id` 条件还在），所以还是改不了。**

**所以你有两道防线：**

```text
① RLS（查都查不到）
② where tenant_id = ?（改也改不了）
```

**两道都在，才睡得着。**

**把 RLS 改回来：**

```sql
alter table approvals enable row level security;
alter table approvals force row level security;
```

## 5.3 一个真实的漏洞：不检查点击者权限

**现在的 handler 有个问题：任何人点"通过"都能通过。**

**客户群里有个实习生，点一下就把 4.8 万的采购批了。**

**这必须修。**

**在 handler 里加权限检查：**

```js
const clicker = await withTenantFromPool(db.tenantId, async (tx) => {
  const { rows } = await tx.client.query(
    `select u.id, u.email, u.role
     from platform_contacts c
     join users u on u.id = c.local_user_id
     where c.tenant_id = $1 and c.platform = 'feishu' and c.platform_uid = $2`,
    [db.tenantId, openId]
  );
  return rows[0] || null;
});

if (!clicker) {
  console.warn('[card] 点击者不在通讯录里，忽略', openId);
  return;
}

if (clicker.role !== 'owner' && clicker.role !== 'admin') {
  console.log('[card] 点击者没有审批权限', openId, clicker.role);
  return;
}
```

**注意这依赖 `platform_contacts` 表（第 181 节会建）。**

**这一节先写死一个白名单：**

```js
const APPROVER_OPEN_IDS = (process.env.APPROVER_OPEN_IDS || '').split(',').filter(Boolean);

if (!APPROVER_OPEN_IDS.includes(openId)) {
  console.log('[card] 不在审批人白名单里', openId);
  return;
}
```

**`.env` 加：**

```text
APPROVER_OPEN_IDS=ou_zhangwei,ou_boss
```

**然后再测：**

**用 `ou_stranger` 点：**

```text
curl -X POST http://localhost:5000/mock/click-button -H "Content-Type: application/json" -d "{\"approval_id\":\"<id>\",\"action\":\"approve\",\"open_id\":\"ou_stranger\"}"
```

**期望：**

```text
[card] 不在审批人白名单里 ou_stranger
```

**审批状态不变。**

**用 `ou_zhangwei` 点，能通过。**

**这个白名单在生产环境应该从数据库来，不是 `.env`。** **但先用 `.env` 跑通，第 181 节会换成通讯录。**

---

# 第 6 步：一个必须处理的体验问题（15 分钟）

**卡片回调必须在 3 秒内返回。但"更新卡片"是一次平台 API 调用，可能慢。**

**现在的时序：**

```text
平台推按钮回调 → 你收件（10ms）→ 返回 200
                              ↓
                        worker 处理（可能 500ms）
                              ↓
                        更新卡片（1000ms+）
```

**没问题——worker 在后台，不影响回调。**

**但有个更细的问题：客户点完按钮，**飞书会显示一个转圈**，等你返回。**

**飞书对这个有个专门的解决方式：** **返回一个 `toast`，立刻告诉客户"已提交"。**

**飞书卡片回调的响应可以带：**

```json
{
  "toast": {
    "type": "success",
    "content": "已通过"
  },
  "card": { ... 新的卡片结构 ... }
}
```

**但我们的架构是"先应答后处理"，回调已经返回 `{ok: true}` 了，没法再带 toast。**

**这是个真实的取舍：**

```text
方案 A：先应答后处理（现在的）
  ✅ 3 秒限制不是问题
  ❌ 客户点完没有即时反馈，要等卡片更新

方案 B：在回调里直接处理（快操作）
  ✅ 能返回 toast，客户立刻看到反馈
  ❌ 不能做耗时操作
```

**怎么选：**

**如果操作很快（< 1 秒），用方案 B。如果操作慢，用方案 A。**

**"审批"这个操作很快（改一行状态），** **所以这一节应该用方案 B。**

**但我们的架构已经改好了……**

## 6.1 折中：加一条"轻量回调"

**让卡片回调走一个特殊路径：不落库，直接在回调里处理。**

**这违反"先应答后处理"的原则，但对于"快操作 + 需要即时反馈"的场景是对的。**

**在 `createWebhookReceiver` 里加一个选项：**

```js
const { fastPath } = options;

// ...

if (fastPath && fastPath.match(parsed, verified)) {
  try {
    const result = await fastPath.handle({ parsed, verified, rawBody });
    log('fastPath 处理完成');
    return res.status(200).json(result || { ok: true });
  } catch (err) {
    log('fastPath 失败', { error: err.message });
    return res.status(200).json({ ok: true, deferred: true });
  }
}
```

**在飞书适配器里定义：**

```js
fastPath: {
  match: (parsed, verified) => {
    const body = verified.decrypted || parsed;
    return body.header && body.header.event_type === 'card.action.trigger';
  },
  handle: async ({ parsed, verified }) => {
    return handleCardActionInline(parsed, verified);
  },
},
```

**然后 `handleCardActionInline` 在 1 秒内完成，返回：**

```js
{
  toast: { type: 'success', content: '已通过' },
  card: { type: 'raw', data: buildApprovalCard(updated) }
}
```

**`card.type: 'raw'` 是飞书的语法：** **"用这个新卡片替换掉当前卡片"。**

**这样客户点完立刻看到"已通过" + 卡片变成绿色。** **不用等。**

## 6.2 但这样又违反了 3 秒原则吗

**没有，因为：**

```text
改一行数据库状态   10ms
生成卡片 JSON      1ms
返回响应           1ms
总计               12ms
```

**关键判断：这个操作会不会慢？**

```text
改一行状态        → 会慢吗？不会
发一条消息        → 会慢吗？会（网络请求 100—500ms）
调大模型          → 会慢吗？会（2—15 秒）
```

**所以：**

```text
✅ 可以走 fastPath：纯数据库操作、状态更新
❌ 不能走 fastPath：发消息、调模型、发邮件
```

**如果 fastPath 里的操作需要发消息，就不要在里面做——** **记一条待办，让 worker 发。**

**这个分层判断写进笔记。**

## 6.3 一个更简单的做法

**如果你觉得 fastPath 太复杂，还有个更简单的：**

**什么都不返回，让卡片在 worker 更新。**

**代价：客户点完要等 0.5—2 秒才能看到卡片变化。** **期间飞书可能显示"处理中"。**

**这个体验能接受吗？**

```text
1 秒内更新 → 客户感觉是"立刻"
3 秒后更新 → 客户会再点一次
10 秒后更新 → 客户会以为坏了
```

**所以：worker 必须在 3 秒内完成更新卡片。**

**怎么做：**

```text
① 提高 worker 的轮询频率（现在是 2 秒 → 改成 500ms）
② 或者用"事件到达就立即唤醒 worker"，不用等轮询
```

**这一节用方案 ①：把 `startLoop(2000)` 改成 `startLoop(500)`。**

**然后测：点按钮到卡片更新，看多久。**

**这是你的实际体验数字，记下来。**

---

# 第 7 步：最终验收

## A. 卡片模板

- [ ] `buildApprovalCard` 能生成四种状态
- [ ] 颜色对应（pending 橙、approved 绿、rejected 红、expired 灰）
- [ ] 非 pending 状态没有按钮
- [ ] 时间带 `timeZone: 'Asia/Shanghai'`
- [ ] 金额用 `money()` 显示成 `¥48,000.00`

## B. 发送

- [ ] `content` 是 JSON **字符串**
- [ ] 存了 `card_message_id`
- [ ] 假平台日志能看到标题

## C. 回调

- [ ] 用 `operator.open_id` 判断"谁点的"
- [ ] **没有**从 `action.value` 读身份
- [ ] `and status = 'pending'` 在 `where` 里
- [ ] 已经处理过的也更新卡片
- [ ] 更新卡片失败不影响主流程

## D. 安全

- [ ] 不存在的 id 不会崩
- [ ] 跨租户的 id 查不到（RLS）
- [ ] 不在白名单的人点了不生效
- [ ] 我试过"实习生点通过"，被拦住

## E. 体验

- [ ] 点按钮到卡片更新，实测多少秒
- [ ] 如果超过 3 秒，改了 worker 频率或加了 fastPath
- [ ] 重复点击不会来回翻状态

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"什么能走 fastPath，什么不能"
- [ ] 我记下了 `value` 不可信这条

## 提交

```text
git add -A
git commit -m "第180节课: 交互卡片 + 按钮回调 + 权限白名单 + 卡片更新"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `content is not a valid json string` | `content` 传了对象 | `JSON.stringify(card)` |
| 卡片显示"卡片已失效" | JSON 结构错，或者字段名错 | 拿官方样例逐字段对 |
| 按钮点了没反应 | `value` 里没有 `action`，或者 handler 没注册 | 检查 `register('card.action', ...)` |
| 卡片不更新 | 没有 `card_message_id`，或者超过 14 天 | 存 message_id；长期跟踪别用卡片 |
| `更新卡片失败 404` | message_id 不对，或者不是你的消息 | 只更新自己发的消息 |
| 时间差 8 小时 | 服务器 UTC，`toLocaleString` 用了本地时区 | 加 `timeZone: 'Asia/Shanghai'` |
| 点两次状态来回翻 | `where` 里没有 `status = 'pending'` | 加上 |
| 谁都能审批 | 没做权限检查 | 白名单或通讯录 |
| 卡片更新的 `note` 被忽略 | 客户不读 note | 关键信息放 `fields`，别放 `note` |
| `is_short` 没生效 | 放错层级（应该在 `fields` 的每一项里） | 检查结构 |

---

## 本节课要能说出口的一句话

> **卡片的全部价值在"把六步变成一步"；而它成立的前提是两件事——谁点的只能信平台给的 `open_id`，状态变更必须在同一条 SQL 的 `where` 里判断。**
