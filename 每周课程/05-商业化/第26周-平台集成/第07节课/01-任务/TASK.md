# 第 182 节课：交付一个"长在飞书里"的系统

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前面六节把零件做齐了：token、事件、四件套、卡片、同步。这节课把它们装成一台机器，**然后写成一份客户能照着操作的对接说明。**
> 最后那件事比代码更容易被跳过，但它决定客户**会不会真的用起来**。

**建议用时**：165 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（75 分钟）一次，第 3—5 步（90 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 176—181 节，`saas-lab` 里六个零件都能单独跑通

---

# 第 0 步：先承认一件事（10 分钟）

## 0.1 你现在有一个"能跑的 demo"，不是一个"能用的产品"

```text
能跑：  推一条事件 → 处理 → 发一条消息     ✅
不能用：客户不知道怎么配                   ❌
        出错了客户不知道找谁               ❌
        客户想改一个设置要找你             ❌
        你自己过两周也忘了当时怎么配的     ❌
```

**"技术通了"和"能交付"之间有段距离。**

**这段距离不填上，你的系统只有你自己会用。** **而一人公司，你是不能当客服的。**

## 0.2 这一节要做的四件事

```text
① 一个"集成总览"页面（客户能看到状态）
② 一次完整的端到端剧本（第 25 周那种）
③ 一份对接说明（客户照着做就能配好）
④ 一份运维手册（出问题了看哪里）
```

**第 ③ 项是这节课最大的产出。** **它比任何一行代码都值钱——** **因为你写一次，能服务每一个客户。**

---

# 第 1 步：做一个集成的"仪表盘"（35 分钟）

**客户不需要看代码，但他需要知道"我的集成现在是好的还是坏的"。**

## 1.1 接口

**新建 `src/routes/integrations.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');
const { withTenantFromPool } = require('../db/tenant-db');

const router = express.Router();
router.use(auth, tenant);

router.get('/status', async (req, res, next) => {
  try {
    const data = await withTenant(req.tenant.id, async (db) => {
      const app = await db.client.query(
        `select platform, app_id, status, last_ok_at, last_error, updated_at
         from platform_apps where tenant_id = $1`,
        [req.tenant.id]
      );

      const events = await db.client.query(
        `select
           count(*) filter (where received_at > now() - interval '24 hours')::int as total_24h,
           count(*) filter (where status = 'done' and received_at > now() - interval '24 hours')::int as done_24h,
           count(*) filter (where status = 'failed' and received_at > now() - interval '24 hours')::int as failed_24h,
           count(*) filter (where status = 'failed_permanently')::int as dead_total,
           count(*) filter (where status = 'processing' and received_at < now() - interval '10 minutes')::int as stuck
         from platform_events
         where tenant_id = $1`,
        [req.tenant.id]
      );

      const contacts = await db.client.query(
        `select
           count(*) filter (where status = 'active')::int as active,
           count(*) filter (where local_user_id is not null)::int as linked,
           count(*) filter (where status = 'active' and local_user_id is null)::int as unlinked,
           max(synced_at) as last_synced
         from platform_contacts where tenant_id = $1`,
        [req.tenant.id]
      );

      const approvals = await db.client.query(
        `select
           count(*) filter (where status = 'pending')::int as pending,
           count(*) filter (where status = 'pending' and created_at < now() - interval '48 hours')::int as overdue
         from approvals where tenant_id = $1`,
        [req.tenant.id]
      );

      return {
        apps: app.rows,
        events: events.rows[0],
        contacts: contacts.rows[0],
        approvals: approvals.rows[0],
      };
    });

    const issues = [];

    if (data.apps.length === 0) {
      issues.push({
        level: 'error',
        code: 'NO_APP',
        title: '还没有配置平台应用',
        action: '去「设置 → 平台集成」填 app_id 和 app_secret',
      });
    }

    for (const app of data.apps) {
      if (app.last_error) {
        issues.push({
          level: 'error',
          code: 'APP_ERROR',
          title: app.platform + ' 应用上次调用失败',
          detail: app.last_error.slice(0, 200),
          action: '点「测试连接」确认凭证有效',
        });
      }
    }

    if (Number(data.events.stuck) > 0) {
      issues.push({
        level: 'warn',
        code: 'STUCK_EVENTS',
        title: '有 ' + data.events.stuck + ' 条事件卡在处理中超过 10 分钟',
        action: '检查 worker 是否在运行；稍等会自动回收',
      });
    }

    if (Number(data.events.dead_total) > 0) {
      issues.push({
        level: 'warn',
        code: 'DEAD_EVENTS',
        title: '有 ' + data.events.dead_total + ' 条事件永久失败',
        action: '在「事件日志」里查看原因，修复后重放',
      });
    }

    if (Number(data.contacts.unlinked) > 0) {
      issues.push({
        level: 'info',
        code: 'UNLINKED_CONTACTS',
        title: '有 ' + data.contacts.unlinked + ' 个成员还没关联到系统账号',
        action: '这些人将无法在卡片上审批',
      });
    }

    if (Number(data.approvals.overdue) > 0) {
      issues.push({
        level: 'warn',
        code: 'OVERDUE_APPROVALS',
        title: '有 ' + data.approvals.overdue + ' 条审批等待超过 48 小时',
        action: '在群里 @ 一下审批人',
      });
    }

    res.json({
      healthy: issues.filter((i) => i.level === 'error').length === 0,
      issues,
      ...data,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/events', async (req, res, next) => {
  const status = req.query.status || null;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  try {
    const rows = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select id, platform, event_id, event_type, status, attempts,
                last_error, received_at, processed_at
         from platform_events
         where tenant_id = $1
           and ($2::text is null or status = $2)
         order by received_at desc
         limit $3`,
        [req.tenant.id, status, limit]
      );
      return r.rows;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/events/:id/replay', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能重放事件' });
  }

  try {
    const result = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `update platform_events
         set status = 'pending', attempts = 0, next_retry_at = now(), last_error = null
         where tenant_id = $1 and id = $2
         returning id, event_id, event_type`,
        [req.tenant.id, req.params.id]
      );
      return r.rows[0] || null;
    });

    if (!result) {
      return res.status(404).json({ error: '事件不存在' });
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const integrationRoutes = require('./routes/integrations');
app.use('/api/integrations', integrationRoutes);
```

## 1.2 为什么 `issues` 比数字有用

**看这个响应：**

```json
{
  "healthy": false,
  "issues": [
    {
      "level": "warn",
      "code": "UNLINKED_CONTACTS",
      "title": "有 133 个成员还没关联到系统账号",
      "action": "这些人将无法在卡片上审批"
    }
  ],
  "events": { "total_24h": 42, "done_24h": 42, "failed_24h": 0 }
}
```

**客户看到 133 这个数字会问"那是什么意思"。**

**看到 `action` 那句话，他知道"哦，这些人审批不了，我得处理"。**

**`title` 说"是什么"，`action` 说"怎么办"。**

**这两个字段是"仪表盘"和"数据展示"的区别。** **只有数字的是数据展示；有"怎么办"的才是仪表盘。**

## 1.3 自检点

**先造点问题出来：**

```sql
-- 造一条永久失败的事件
update platform_events
set status = 'failed_permanently', attempts = 5, last_error = '测试用'
where id = (select id from platform_events limit 1);
```

**然后：**

```text
curl http://localhost:3000/api/integrations/status -b cookies.txt
```

**期望看到 `issues` 里有一条 `DEAD_EVENTS`。**

**修回来：**

```sql
update platform_events set status = 'done' where last_error = '测试用';
```

---

# 第 2 步：完整剧本（30 分钟）

**第 25 周有一个 11 步的剧本。这一周也来一个。**

## 2.1 十二步

```text
【配置阶段 —— 只做一次】
1.  配平台应用（app_id / app_secret / encrypt_key / verify_token）
2.  测试连接 → 拿到 token
3.  配事件订阅 URL（在平台后台，这里用假平台代替）
4.  同步通讯录 → 137 人进来
5.  关联账号 → 按邮箱匹配上 1 个

【日常阶段 —— 每天发生】
6.  群里发"查 ABC" → 机器人回复订单
7.  建一个审批 → 群里出现卡片
8.  点"通过" → 状态变 approved，卡片变绿
9.  重复点"通过" → 状态不变（幂等）
10. 白名单外的人点 → 被拒（权限）

【异常阶段 —— 偶尔发生】
11. 平台回调超时 → 事件还是收进来了（后台处理）
12. 回调丢失 → 用主动拉取补偿（这一周的"拉审批"）
```

**第 12 步现在还没做。做一个简单的。**

## 2.2 补上"拉审批"（第 12 步）

**为什么不只靠回调：** **和第 174 节的"主动查单"是同一个道理——回调会丢。**

**在 `src/integrations/approvals-pull.js` 里：**

```js
const { withTenantFromPool } = require('../db/tenant-db');

async function findStaleApprovals(tenantId) {
  return withTenantFromPool(tenantId, async (db) => {
    const { rows } = await db.client.query(
      `select id, title, status, card_message_id, card_chat_id, created_at
       from approvals
       where tenant_id = $1
         and status = 'pending'
         and created_at < now() - interval '1 hour'
         and created_at > now() - interval '7 days'
       order by created_at
       limit 20`,
      [tenantId]
    );
    return rows;
  });
}

async function refreshStaleApprovals(tenantId) {
  const stale = await findStaleApprovals(tenantId);

  if (stale.length === 0) {
    return { checked: 0, changed: 0 };
  }

  const changed = [];

  for (const a of stale) {
    const fresh = await withTenantFromPool(tenantId, async (db) => {
      const { rows } = await db.client.query(
        'select status, decided_by, decided_at from approvals where tenant_id = $1 and id = $2',
        [tenantId, a.id]
      );
      return rows[0];
    });

    if (fresh && fresh.status !== a.status) {
      changed.push({ id: a.id, from: a.status, to: fresh.status });
    }
  }

  return { checked: stale.length, changed: changed.length, details: changed };
}

module.exports = { findStaleApprovals, refreshStaleApprovals };
```

**这个实现有个问题：它读的是你自己的数据库，什么都没校验。** **它只验证了"状态有没有被别的路径改过"。**

**这在我们的架构里是有意义的——** **因为状态只能从卡片回调改。如果回调丢了，状态就是"pending"。**

**真实的"拉审批"要调平台 API 查审批单状态。** **这个 mock 平台没做审批 API，所以这里只做"一致性检查"。**

**把这段说明写进代码注释，别让人以为这是完整的"拉"。**

## 2.3 跑完整剧本

**把十二步做成一个脚本。**

**新建 `scripts/full-scenario.js`：**

```js
const BASE = 'http://localhost:3000';
const GATEWAY = 'http://localhost:5000';

let cookie = '';

function line(t) {
  console.log('\n=== ' + t + ' ===');
}

async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    body = text;
  }

  return { status: res.status, body, headers: res.headers };
}

async function main() {
  line('1. 登录');
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'seed-alpha@test.local', password: 'test12345' }),
  });

  if (!login.ok) {
    console.error('登录失败', login.status);
    return;
  }

  const raw = login.headers.getSetCookie
    ? login.headers.getSetCookie()[0]
    : login.headers.get('set-cookie');
  cookie = raw.split(';')[0];
  console.log('  ok');

  line('2. 配平台应用');
  const cfg = await api('/api/platform/apps/feishu', {
    method: 'PUT',
    body: JSON.stringify({
      appId: 'cli_mock_app',
      appSecret: 'mock-app-secret',
      encryptKey: 'mock-event-aes-key-32byteslong!!',
      verifyToken: 'mock-verify-token',
    }),
  });
  console.log('  ', cfg.status, cfg.body.app_id || cfg.body.error);

  line('3. 测试连接');
  const test = await api('/api/platform/apps/feishu/test', { method: 'POST' });
  console.log('  ', test.status, test.body.ok ? 'token ' + test.body.tokenPrefix : test.body.error);

  line('4. 同步通讯录');
  const apply = await api('/api/contacts/apply', { method: 'POST' });
  console.log('  ', apply.status, JSON.stringify(apply.body));

  line('5. 关联账号');
  const linked = await api('/api/contacts/preview');
  console.log('  未关联人数：', linked.body.willInsert === undefined ? '?' : '看 contacts 表');

  line('6. 群里发消息');
  const push = await fetch(GATEWAY + '/mock/push-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'im.message.receive_v1', text: 'ping' }),
  }).then((r) => r.json());
  console.log('   回调耗时：', push.elapsedMs + 'ms', '状态', push.status);

  line('7. 建审批并发卡片');
  const approval = await api('/api/approvals', {
    method: 'POST',
    body: JSON.stringify({
      title: '采购申请',
      amountCents: 4800000,
      applicantName: '张伟',
      department: '市场部',
    }),
  });
  console.log('  ', approval.status, approval.body.id, approval.body.cardMessageId);

  if (!approval.body.id) {
    console.error('  建审批失败，后面跳过');
    return;
  }

  line('8. 点通过');
  const click = await fetch(GATEWAY + '/mock/click-button', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approval_id: approval.body.id,
      action: 'approve',
      open_id: (process.env.APPROVER_OPEN_IDS || 'ou_zhangwei').split(',')[0],
      message_id: approval.body.cardMessageId,
    }),
  }).then((r) => r.json());
  console.log('  ', click.status);

  await new Promise((r) => setTimeout(r, 1500));

  const after1 = await api('/api/approvals/' + approval.body.id);
  console.log('   状态：', after1.body.status || after1.body.error);

  line('9. 再点一次（幂等）');
  const click2 = await fetch(GATEWAY + '/mock/click-button', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approval_id: approval.body.id,
      action: 'approve',
      open_id: (process.env.APPROVER_OPEN_IDS || 'ou_zhangwei').split(',')[0],
      message_id: approval.body.cardMessageId,
    }),
  }).then((r) => r.json());
  console.log('  ', click2.status);

  await new Promise((r) => setTimeout(r, 1500));
  const after2 = await api('/api/approvals/' + approval.body.id);
  console.log('   状态：', after2.body.status, '（应该还是 approved）');

  line('10. 白名单外的人点');
  const approval2 = await api('/api/approvals', {
    method: 'POST',
    body: JSON.stringify({
      title: '第二笔',
      amountCents: 10000,
      applicantName: '李四',
    }),
  });

  const badClick = await fetch(GATEWAY + '/mock/click-button', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approval_id: approval2.body.id,
      action: 'approve',
      open_id: 'ou_stranger',
    }),
  }).then((r) => r.json());
  console.log('  ', badClick.status);

  await new Promise((r) => setTimeout(r, 1500));
  const after3 = await api('/api/approvals/' + approval2.body.id);
  console.log('   状态：', after3.body.status, '（应该还是 pending）');

  line('11. 看集成状态');
  const status = await api('/api/integrations/status');
  console.log('   healthy：', status.body.healthy);
  console.log('   issues：', (status.body.issues || []).map((i) => i.code).join(', ') || '无');
  console.log('   24h 事件：', JSON.stringify(status.body.events));

  line('完成');
}

main().catch((err) => console.error('脚本出错：', err.message));
```

**跑之前确认两个服务都在，然后：**

```text
node scripts/full-scenario.js
```

**这个脚本的价值：**

```text
① 它是"系统能工作"的证明
② 它是回归测试（改完代码跑一遍，看有没有坏）
③ 它是交接文档（新人跑一遍就懂整个流程）
```

**第 ③ 点最实用。** **你两个月后回来，跑一遍这个脚本，全部通过，说明系统是好的。**

---

# 第 3 步：写对接说明（50 分钟）

**这是这节课最重要的产出。**

**新建 `docs/integration-guide.md`：**

```markdown
# 飞书集成配置说明

> 这份文档给你（客户）的 IT 管理员。按步骤操作，大约 15 分钟。

## 你需要准备什么

- 飞书企业管理员权限（能进入「管理后台」）
- 我们系统的管理员账号（邮箱 + 密码）

## 第一步：创建自建应用

1. 用管理员账号登录 [飞书开放平台](https://open.feishu.cn/app)
2. 点右上角「创建企业自建应用」
3. 填写：
   - 应用名称：`XXX 业务助手`（可以自己起）
   - 应用描述：`用于 XXX 系统的审批与通知`
   - 应用图标：随便上传一张
4. 点「创建」

**做完之后你会看到：** 一个应用详情页，左侧有「凭证与基础信息」。

## 第二步：拿到 App ID 和 App Secret

1. 左侧点「凭证与基础信息」
2. 复制两样东西：
   - `App ID`（形如 `cli_a1b2c3d4e5f6`）
   - `App Secret`（点「查看」，会要求验证管理员身份）

**注意：** App Secret 等同于密码，不要在群里、邮件里发。填进我们系统的配置页即可。

## 第三步：开启权限

1. 左侧点「权限管理」
2. 搜索并添加以下权限：

| 权限名称 | 权限标识 | 用途 |
|---|---|---|
| 获取与发送单聊、群组消息 | `im:message` | 机器人发消息 |
| 接收消息事件 | `im:message.receive_v1` | 接收群里的 @ |
| 获取用户 ID | `contact:user.base:readonly` | 识别是谁操作的 |
| 获取通讯录 | `contact:contact:readonly` | 同步成员列表 |
| 更新卡片 | `im:message:update` | 点了按钮后更新卡片 |

3. 点「批量开通」

**做完之后你会看到：** 权限列表里这五项显示「已开通」。

## 第四步：配置事件订阅

1. 左侧点「事件与回调」→「事件配置」
2. 「订阅方式」选「将事件发送至开发者服务器」
3. 填入请求地址：`https://你的域名/api/webhooks/platform/feishu`

4. 点「保存」
5. 如果提示「请求地址校验失败」，检查：
   - 你的域名是不是 HTTPS（飞书不接收 HTTP）
   - 地址路径有没有拼错
   - 我们的服务是不是在运行

6. 校验通过后，点「添加事件」，添加这两个：
   - `接收消息 v2.0`（`im.message.receive_v1`）
   - `卡片回传交互`（`card.action.trigger`）

## 第五步：配置加密

1. 左侧「事件与回调」→「加密策略」
2. 点「重置」生成一个 `Encrypt Key`
3. 复制这个 Key
4. 在「Verification Token」那里也复制一份

## 第六步：填进我们系统

1. 登录我们的系统
2. 左侧「设置」→「平台集成」→「飞书」
3. 填入四个值：
   - App ID
   - App Secret
   - Encrypt Key
   - Verification Token
4. 点「保存」
5. 点「测试连接」

**做完之后你会看到：** 绿色的「连接成功」和一个 `t-xxxx` 开头的 token 前缀。

## 第七步：把机器人拉进群

1. 打开飞书，进入你想接收通知的群
2. 点群名 → 「设置」→「群机器人」→「添加机器人」
3. 搜索你刚创建的应用名，添加

**做完之后你会看到：** 群成员列表里多了你的机器人。

## 第八步：同步通讯录

1. 回到我们的系统，「平台集成」→「通讯录」
2. 点「预览」
3. 看数字：
   - 「新增」是还没进系统的人
   - 「更新」是信息变了的人
   - 「缺失」是平台上已经删了的人
4. 确认没问题，点「执行同步」
5. 等几秒，看结果

**做完之后你会看到：** 「已同步 137 人，其中 133 人还没关联账号。」

## 第九步：关联账号

1. 在「通讯录」页面点「自动关联」
2. 系统会按邮箱匹配
3. 剩下的人需要你手工邀请

**做完之后你会看到：** 已关联的人可以审批，未关联的人不能。

## 第十步：试一下

1. 在群里发：`ping`
2. 机器人应该回复 `pong`

**如果没回复，看文末「出问题了怎么办」。**

## 出问题了怎么办

| 现象 | 先检查什么 | 找谁 |
|---|---|---|
| 群里 @ 机器人没反应 | 事件订阅配了吗（第四步）；机器人拉进群了吗（第七步） | — |
| 系统里显示「连接失败」 | App Secret 是不是复制错了（多一个空格） | — |
| 提示「签名不合法」 | Encrypt Key 和系统里填的是不是同一个 | — |
| 卡片发不出来 | 权限 `im:message` 开了吗 | — |
| 点按钮没反应 | 权限 `im:message:update` 开了吗 | — |
| 提示「校验失败」 | 域名是不是 HTTPS；服务是不是在跑 | — |

**上面都检查过了还不行：** 把系统里「平台集成」页面截图发给我，我看一下 `last_error`。

## 注意事项

**App Secret 和 Encrypt Key 不要发在群里。** 填进系统配置页就行。

**应用创建后需要「发布」才能正式使用。** 在应用详情页右上角点「创建版本」→「申请发布」→ 管理员审核通过。
```

## 3.1 这份文档的六个设计

### 每一步都有"做完之后你会看到"

**这是这份文档最值钱的部分。**

**客户不看"这一步成功了"，客户看"我看到的和你说的一样吗"。**

**对不上，他就知道卡在这一步了。**

### 权限表里有"用途"列

**只说"开这五个权限"，客户会问"为什么要开通讯录权限"。**

**说了"同步成员列表"，他就明白了。**

**客户的 IT 管理员最反感"给我开一堆权限但我不知道为什么"。**

### 地址给了完整路径

```text
https://你的域名/api/webhooks/platform/feishu
```

**不是"填入你的回调地址"。**

**客户不知道你的路径规则。** **给完整格式，他只需要替换域名。**

### 第七步"把机器人拉进群"单列

**这是最容易被漏的一步。**

**客户配完应用、事件、权限，然后在群里 @ 机器人——没反应。**

**因为他没把机器人拉进群。**

**这个坑几乎每个客户都会踩。** **所以它必须是独立的一步，不能混在别的地方。**

### 排错表按"现象"列，不按"错误码"

**客户不知道 `99991663` 是什么。他知道"连接失败"。**

**所以左列写他看到的，右列写该查什么。**

### 明确说"截图发给我"

**不要写"请联系技术支持"。**

**说"把哪个页面截图发给我"，客户就知道该做什么，你也能直接定位。**

---

# 第 4 步：写运维手册（25 分钟）

**这份文档是给你自己的。**

**新建 `docs/ops-runbook.md`：**

````markdown
# 平台集成运维手册

## 每天要看什么

**任何一个都可以（选顺手的）：**

```text
① GET /api/integrations/status 的 healthy 字段
② 群里有没有收到"【系统告警】"
③ 数据库：select count(*) from platform_events where status = 'failed_permanently'
```

## 五个常见故障

### 故障一：群里没反应

**判断：**

```sql
-- 最近 1 小时有没有收到事件
select count(*), max(received_at) from platform_events
where received_at > now() - interval '1 hour';
```

**如果 0 条：** 平台那边的问题。检查：
- 应用是不是被停用了
- 事件订阅 URL 是不是变了
- 域名解析/HTTPS 证书是不是过期了

**如果很多条但都失败：**

```sql
select event_type, status, last_error, count(*)
from platform_events
where received_at > now() - interval '1 hour'
group by 1, 2, 3 order by 4 desc;
```

**如果收到了但没回复：** handler 的问题。看日志里的 `[handler]`。

### 故障二：token 一直失败

**判断：**

```sql
select platform, last_error, last_ok_at from platform_apps;
```

**如果 `last_error` 里有 `10003`：** App Secret 错。让客户重新填。
**如果 `99991663`：** 应用被停用或权限被收回。让客户检查应用状态。
**如果 `99991400`：** 被限流。检查是不是有并发换 token 的 bug。

### 故障三：事件卡在 processing

```sql
select id, event_type, attempts, received_at
from platform_events
where status = 'processing' and received_at < now() - interval '15 minutes';
```

**worker 里的 `reclaimStuck` 会自动回收（10 分钟）。**

**如果持续出现，说明 worker 一直崩。看这段时间的服务器日志。**

### 故障四：同步了但人数不对

**先看差异：**

```text
GET /api/contacts/preview
```

**如果 `willInsert` 不为 0（明明同步过了）：** `platform_uid` 对不上。检查存的是不是 `open_id`。

**如果 `willDeactivate` 异常大：** 平台那边可能出问题了（返回了空列表）。**这时候千万不要执行同步。**

**这是一条铁律：**

```text
willDeactivate 超过本地总数的 30% → 停下来，人工确认
```

**为什么：** 平台 API 出错返回空列表，你的同步会把所有人标记为"已删除"。**客户的审批记录全部断链。**

**把这条加进代码：**

```js
if (plan.toDeactivate.length > plan.localCount * 0.3) {
  return res.status(409).json({
    error: '本次同步将删除超过 30% 的成员，已中止',
    willDeactivate: plan.toDeactivate.length,
    localCount: plan.localCount,
    hint: '平台可能返回了异常数据，请先在平台后台确认成员还在',
  });
}
```

**这个检查值一条命。**

### 故障五：卡片按钮点了没反应

**判断顺序：**

```text
① 日志里有没有 [webhook:feishu] 收到 card.action？
   没有 → 事件订阅没配 card.action.trigger
② 有 [card] 但状态没变 → 是不是白名单外的人
③ 状态变了但卡片没变 → 更新卡片失败了，看 [card] 更新卡片失败
```

## 三个危险操作

```text
一、改 platform_apps 的 app_secret
   会影响所有正在跑的 token。改完必须 invalidate 缓存。
   用 API 改，不要直接 SQL update。

二、删 platform_contacts
   审批记录里的 decided_by 是 open_id，删了就查不到是谁批的。
   永远用 status = 'deleted'，不要 DELETE。

三、重放大量事件
   一次重放 1000 条会瞬间打满数据库连接。
   一次最多 50 条，分批来。
```

## 数据清理

```sql
-- 90 天前处理成功的事件
delete from platform_events
where status = 'done' and processed_at < now() - interval '90 days';

-- 30 天前 ignored 的
delete from platform_events
where status = 'ignored' and received_at < now() - interval '30 days';

-- 永远不要删 failed_permanently，除非确认处理完了
```

**为什么 `done` 可以删：** 因为业务已经处理完了，事件本身只是日志。

**为什么 `failed_permanently` 不能删：** 因为那意味着"有件事没做完"。

## 备份

**跟着第 32 周的统一备份走。**

**但单独确认一件事：`platform_apps.app_secret_enc` 能不能解回来？**

**如果 `SECRET_ENCRYPTION_KEY` 丢了，所有客户的 secret 都解不开。**

**所以这个密钥必须：**

```text
① 单独备份（不和数据库备份放一起）
② 记在你自己的密码管理器里
③ 换服务器的时候第一时间复制
```
````

## 4.1 三个设计点

### "每天要看什么"要具体到 SQL

**不是"检查系统状态"，是"跑这一条 SQL"。**

**因为"检查状态"在忙的时候会被跳过。** **而"复制这条 SQL 跑一下"只要 5 秒。**

### 危险操作单独一节

**列出三个最容易造成不可恢复损失的操作。**

**这一节的存在本身就在起作用：** **你某天想"直接 SQL 改一下 secret 吧"，看到这一节会停一下。**

### 清理给的是 SQL，不是"定期清理"

**同样：可执行的东西才会被执行。**

**而且 `delete` 的条件写清楚了：`done` + 90 天，`ignored` + 30 天，`failed_permanently` 不删。**

**这三条规则你以后能直接抄到别的项目里。**

---

# 第 5 步：把危险检查加进代码（15 分钟）

**刚才运维手册里提到"删除超过 30% 要中止"。现在实现它。**

**改 `src/routes/contacts.js` 的 `apply`：**

```js
router.post('/apply', async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: '只有创建者能同步通讯录' });
  }

  try {
    const plan = await planSync(req.tenant.id, 'feishu');

    if (plan.localCount > 0 && plan.toDeactivate.length > plan.localCount * 0.3) {
      return res.status(409).json({
        error: '本次同步将标记删除超过 30% 的成员，已中止',
        willDeactivate: plan.toDeactivate.length,
        localCount: plan.localCount,
        ratio: Math.round((plan.toDeactivate.length / plan.localCount) * 100) + '%',
        hint: '平台可能返回了异常数据。请先在平台后台确认成员还在，再执行。',
        force: '确认无误后，用 { "force": true } 重试',
      });
    }

    const force = req.body && req.body.force === true;

    if (force && plan.toDeactivate.length > plan.localCount * 0.3) {
      console.warn(
        '[contacts] 强制同步：将标记删除',
        plan.toDeactivate.length,
        '人（本地',
        plan.localCount,
        '人）'
      );
    }

    const result = await applySync(req.tenant.id, 'feishu', plan);

    res.json({ ok: true, ...result, remoteCount: plan.remoteCount });
  } catch (err) {
    next(err);
  }
});
```

## 5.1 三个要点

### 30% 这个阈值

**为什么是 30%：**

```text
正常的离职波动：一个月 5%—10%
组织架构调整：可能一次 20%
平台 API 出错：可能 100%
```

**30% 是一个"正常业务不太可能达到，但异常一定会超过"的分界。**

**你可以调，但不要设成 50%——** **50% 太高，异常的时候还是会删掉一半人。**

### 提供 `force` 逃生口

**有时候你真的要删掉一半人（比如客户重组了公司，删了 3 个部门）。**

**没有 `force`，客户会来找你手工改代码。**

**有 `force`，他确认一下就能执行。**

**而且 `force` 会打日志，你能看到"有人强制删了一半人"。**

### `localCount > 0` 那个判断

```js
if (plan.localCount > 0 && plan.toDeactivate.length > plan.localCount * 0.3)
```

**为什么加 `localCount > 0`：**

**第一次同步时 `localCount = 0`，`0 * 0.3 = 0`，** **而 `toDeactivate` 也是 0，所以不会触发。**

**但如果逻辑写反了（`>=` 而不是 `>`），第一次同步会因为 `0 >= 0` 被拦住。**

**加 `localCount > 0` 是防御性的，避免"零的边界"。**

**这类边界检查写多了不亏。**

---

# 第 6 步：最终验收（也是整周验收）

## A. 仪表盘

- [ ] `GET /api/integrations/status` 返回 `healthy` 和 `issues`
- [ ] 每条 issue 有 `title`（是什么）和 `action`（怎么办）
- [ ] 能造出 `DEAD_EVENTS` 和 `UNSTABLE` 两种 issue
- [ ] `GET /api/integrations/events?status=failed` 能筛
- [ ] 能重放单条事件

## B. 完整剧本

- [ ] `full-scenario.js` 十二步能跑完
- [ ] 第 8 步点通过后状态变 `approved`
- [ ] 第 9 步重复点状态不变
- [ ] 第 10 步白名单外的人点不动
- [ ] 第 11 步 `healthy` 是 `true`

## C. 对接文档

- [ ] `docs/integration-guide.md` 有十个步骤
- [ ] 每一步有"做完之后你会看到"
- [ ] 权限表有"用途"列
- [ ] 排错表按"现象"列
- [ ] 单独列了"把机器人拉进群"

## D. 运维手册

- [ ] `docs/ops-runbook.md` 有五个故障
- [ ] 每个故障有可执行的 SQL
- [ ] 有"三个危险操作"
- [ ] 有清理 SQL
- [ ] 提醒了 `SECRET_ENCRYPTION_KEY` 单独备份

## E. 危险检查

- [ ] `apply` 在删除超过 30% 时返回 409
- [ ] 有 `force` 逃生口
- [ ] `force` 会打日志
- [ ] 第一次同步（`localCount = 0`）不会被拦

## F. 整周回归

- [ ] `npm test` 九条隔离测试全绿
- [ ] `npm run check` 通过
- [ ] 新表都有 RLS（`platform_apps`、`platform_events`、`approvals`、`platform_contacts`）
- [ ] 没有 `app_secret` 明文出现在日志里
- [ ] `.env` 不在 Git 里

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"仪表盘要有 action 字段"
- [ ] 我记下了 30% 那个阈值为什么是 30%

## 提交

```text
git add -A
git commit -m "第182节课: 集成仪表盘 + 完整剧本 + 对接文档 + 运维手册 + 安全阀"
git push
```

---

# 附：常见问题速查

| 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `full-scenario.js` 第 2 步失败 | 没登录成功，cookie 是空 | 检查 `seed-alpha` 用户存在 |
| 第 4 步同步 0 人 | 假平台的通讯录接口路径不对 | 检查 `/open-apis/contact/v3/users` |
| 第 8 步状态没变 | 白名单没配 `APPROVER_OPEN_IDS` | `.env` 加上 |
| 第 10 步居然成功了 | 白名单检查没生效 | 检查 handler 里的白名单逻辑 |
| `healthy` 一直是 false | 有 `NO_APP` 或者 `APP_ERROR` | 看 `issues` 里的 `action` |
| `willDeactivate` 是全部 | 平台返回空列表 | **不要执行**，先查平台 |
| 强制同步后数据没了 | 用了 `force` 但平台真的出错了 | 从备份恢复；这就是为什么要有 30% 检查 |
| 对接文档客户看不懂 | 缺"做完之后你会看到" | 每一步补上 |
| 客户配完还是不通 | 忘了把机器人拉进群 | 文档里单列这一步 |

---

## 本节课（也是这一周）要能说出口的一句话

> **平台集成的交付物不是"接通了"，是"客户能自己配好、自己看出哪里不对、自己知道找谁"；这三件事都不成立的时候，接通了也只有你一个人会用。**
