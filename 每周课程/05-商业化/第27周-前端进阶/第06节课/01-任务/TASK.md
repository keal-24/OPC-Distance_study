# 第 188 节课：客户到底卡在哪

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前五节都在猜"客户想要什么"。这一节开始**用数据代替猜**。
> 但埋点最大的陷阱不是"怎么埋"，是"**埋了一堆，一个都不看**"。

**建议用时**：170 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（75 分钟）一次，第 3—5 步（95 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 187 节（仪表盘能用，数据接口通了）

---

# 第 0 步：先问一个要命的问题（15 分钟）

## 0.1 你装埋点是为了回答什么

**如果我明天问你"你的系统用得怎么样"，你要能立刻答出来。**

**不能答"还行吧"。**

**你要能答的是这种：**

```text
上周有 8 个人注册
其中 5 个导入了数据
其中 3 个创建了第一个订单
其中 2 个付了钱

有 3 个人停在"导入"这一步，他们的共同点是：文件都超过 5000 行
```

**这句话包含三件事：**

```text
① 每一步的转化率（8 → 5 → 3 → 2）
② 卡在哪一步（导入）
③ 卡住的人有什么共同点（大文件）
```

**这才叫"知道用得怎么样"。**

## 0.2 埋点的两个失败模式

**失败一：埋太多**

```text
每个按钮的点击都记
每个页面的曝光都记
每次滚动都记
```

**结果：**

```text
一天 5 万条事件
你打开报表，看到 30 个指标
你不知道该看哪个
第二周你就不看了
```

**失败二：埋太少**

```text
只记"注册成功"
```

**结果：**

```text
你只知道有多少人注册
不知道他们注册后做了什么
不知道他们为什么不用了
```

## 0.3 这一节的核心原则

> **只记"决策点"，不记"所有动作"。**

**什么是决策点：**

```text
✅ 客户做了一个选择（提交了表单、点了购买、导入了文件）
✅ 客户放弃了一个流程（关掉了表单、退出了导入）
✅ 客户遇到了障碍（看到错误、被拦住）

❌ 客户只是看了看（滚动、停留、鼠标移动）
❌ 客户点了导航（除非"从哪来"很重要）
```

**判断方法：这个事件能回答"客户为什么留下/离开"吗？**

**不能就别记。**

## 0.4 这一节要建的三样东西

```text
① 一个埋点函数（一次调用，自动带上上下文）
② ui_events 表 + 接收接口
③ 一个漏斗报表（从注册到付款，每一步多少人）
```

---

# 第 1 步：定事件清单（30 分钟）

**先写清单，再写代码。**

## 1.1 你真正需要回答的五个问题

```text
① 客户从哪来（渠道）           → 但要 Privacy 友好，不追踪个人
② 客户走到哪一步（漏斗）       → 注册 → 导入 → 建单 → 付款
③ 客户在哪放弃（流失点）       → 哪一步的流失最多
④ 客户用了什么功能（功能使用） → 哪些功能没人用（可以砍掉）
⑤ 客户遇到什么错（障碍）       → 哪个错误最常见
```

**这五个问题，对应五类事件。**

## 1.2 事件清单

**新建 `docs/tracking-plan.md`：**

| 事件名 | 何时触发 | 带什么属性 | 回答什么问题 |
|---|---|---|---|
| `signup_started` | 打开注册页 | — | 有多少人想注册 |
| `signup_submitted` | 点注册按钮 | — | 有多少人真的提交 |
| `signup_succeeded` | 注册成功 | `plan` | 转化率 |
| `signup_failed` | 注册失败 | `code`（错误码） | 为什么失败 |
| `import_started` | 选中文件后 | `size_kb`, `rows` | 有多少人开始导入 |
| `import_finished` | 导入完成 | `ok_rows`, `failed_rows`, `duration_ms` | 成功率 |
| `import_abandoned` | 选文件后 5 分钟没提交 | `size_kb` | 有多少人放弃了 |
| `order_created` | 订单创建成功 | `amount_cents`, `source` | 核心动作 |
| `order_submit_failed` | 提交失败 | `field`（哪个字段） | 表单卡在哪 |
| `pay_started` | 点"去支付" | `amount_cents` | 有多少人想付 |
| `pay_succeeded` | 支付成功 | `amount_cents` | 收钱转化 |
| `pay_abandoned` | 到支付页 10 分钟没付 | `amount_cents` | 有多少人想付没付 |
| `feature_used` | 用了某个功能 | `feature` | 哪些功能没人用 |
| `error_shown` | 界面显示错误 | `code`, `page` | 最常见的错 |

**十一条。不多不少。**

**注意每一行都有"回答什么问题"。**

**如果没有，这个事件就不该存在。**

## 1.3 三个设计决定

### 事件名用 `名词_动词` 的过去式

```text
✅ signup_succeeded   import_finished   order_created
❌ clickRegister      doImport          createOrder
```

**为什么：**

```text
① 过去式表示"已经发生的事实"（埋点的语义）
② 名词在前，能按对象分组（所有 signup_* 在一起）
③ 不要用驼峰，因为 SQL 里大小写麻烦
```

**这个命名规范以后能省一堆事——** **你查"所有和 signup 相关的事件"时，是 `where event_name like 'signup%'`。**

### 属性要能"分组"和"筛选"，不要放自由文本

```text
✅ field: 'email'           → 能统计"哪个字段最容易出错"
❌ message: '邮箱格式不对'   → 每条都不一样，没法聚合
```

**规则：**

```text
数值型 → 能算平均、分位数
短枚举 → 能分组（错误码、状态、页面名）
时间   → 能算时长
禁止   → 自由文本、用户输入内容、任何个人信息
```

**最后一条是隐私红线。**

**客户在输入框里打的字，一个字都不能进埋点。** **那是他的业务数据。**

### 不上报 IP、不上报精确时间到秒

**为什么要小心：**

```text
IP 地址在 GDPR / 个人信息保护法里属于个人信息
精确时间戳 + 用户 id 可以还原"谁在什么时候做了什么"
```

**你不需要这些也能回答那五个问题。**

**所以：**

```text
不上报 IP（服务端拿到的 IP 不落库）
时间精确到"分钟"就够（或者干脆只存服务端接收时间）
用户只存 user_id（内部 id，不是邮箱/手机号）
```

**这一条现在做，比以后"整改"便宜一百倍。**

## 1.4 自检点

**把你的清单过一遍，每条问三个问题：**

```text
① 这个事件能回答哪个业务问题？
② 我能只靠它算出转化率/流失点吗？
③ 如果去掉它，我会失去什么判断能力？
```

**第 ① 条答不上来的，删掉。**

**第 ③ 条答"没什么"的，删掉。**

**删完应该有 8—15 条。** **超过 20 条说明你在记动作，不是在记决策。**

---

# 第 2 步：建表和接口（30 分钟）

## 2.1 建表

**新建 `migrations/020_ui_events.sql`：**

```sql
create table ui_events (
  id          bigserial primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,
  session_id  text,
  event_name  text not null,
  page        text,
  props       jsonb not null default '{}'::jsonb,
  client_ts   timestamptz,
  server_ts   timestamptz not null default now()
);

create index ui_events_tenant_name_ts_idx
  on ui_events (tenant_id, event_name, server_ts desc);

create index ui_events_tenant_user_ts_idx
  on ui_events (tenant_id, user_id, server_ts desc);

create index ui_events_props_gin_idx
  on ui_events using gin (props);

alter table ui_events enable row level security;
alter table ui_events force row level security;

create policy tenant_isolation on ui_events
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

## 2.2 五个字段要讲清

### `server_ts` 和 `client_ts` 分开

**为什么：**

```text
client_ts  客户设备的时钟（可能不准，可能被改）
server_ts  你的服务器收到的时间（可信）
```

**统计必须用 `server_ts`。**

**`client_ts` 只在一种情况下有用：** **排查"客户的时钟错了很多"导致的异常。**

**那怎么判断"客户端时钟不准"：**

```sql
select count(*) from ui_events
where abs(extract(epoch from (server_ts - client_ts))) > 300;
```

**如果这个数很大，说明有一批客户的设备时间不对。** **那时候你就知道"为什么某些事件顺序看起来乱了"。**

### `session_id` 用来算"一次访问"

**同一分钟里，客户可能打开三个页面。**

**没有 `session_id`，"停留时长"就算不出来。**

**生成方式（前端）：**

```js
const sid = sessionStorage.getItem('sid') || (() => {
  const v = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionStorage.setItem('sid', v);
  return v;
})();
```

**`sessionStorage` 在关标签页时清空——** **正好对应"一次访问"的语义。**

**不要用 `localStorage`：** **那样一个客户永远只有一个 `session_id`，统计就废了。**

### `props` 用 `jsonb` 而不是一堆列

**因为属性是变化的。**

**如果今天加一个 `size_kb`，明天加一个 `rows`，** **用列的话每次都要迁移。**

**用 `jsonb`：直接塞进去，查的时候用 `props->>'field'`。**

```sql
select props->>'field' as field, count(*)
from ui_events
where event_name = 'order_submit_failed'
group by 1 order by 2 desc;
```

**代价：** **`jsonb` 不能建普通索引（除了 GIN），查询比列慢一些。**

**这个数据量（一天几千条）完全够。**

### 为什么没有 `ip` 列

**第 1.3 节说的：不上报 IP。**

**如果需要"大概的地区"，用 `Accept-Language` 或者让客户在设置里填。**

**不要为了"分析"收集个人信息。** **你不需要它也能回答那五个问题。**

### `on delete set null` 而不是 `cascade`

```sql
user_id uuid references users(id) on delete set null
```

**因为：**

```text
客户删了一个账号
如果 cascade → 这个人的所有历史事件都没了 → 你的转化率数据出现断层
如果 set null → 事件还在，只是不知道是谁 → 统计仍然成立
```

**统计的价值在"趋势"，不在"具体某个人"。** **保住趋势比保住 id 重要。**

## 2.3 接收接口

**新建 `src/routes/track.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');

const router = express.Router();

const ALLOWED_PROPS = new Set([
  'plan', 'code', 'field', 'page', 'size_kb', 'rows',
  'ok_rows', 'failed_rows', 'duration_ms', 'amount_cents',
  'source', 'feature', 'step', 'reason',
]);

const FORBIDDEN_PROP_PATTERN = /(email|phone|mobile|password|token|name|content|message|address|card|id_no)/i;

function sanitizeProps(props) {
  if (!props || typeof props !== 'object') return {};

  const out = {};

  for (const [key, value] of Object.entries(props)) {
    if (!ALLOWED_PROPS.has(key)) continue;
    if (FORBIDDEN_PROP_PATTERN.test(key)) continue;

    if (value === null || value === undefined) continue;

    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      out[key] = value.slice(0, 100);
    }
  }

  return out;
}

router.post('/batch', auth, tenant, async (req, res, next) => {
  const events = Array.isArray(req.body.events) ? req.body.events : [];

  if (events.length === 0) {
    return res.status(400).json({ error: 'events 不能为空' });
  }

  if (events.length > 50) {
    return res.status(400).json({ error: '一次最多 50 条' });
  }

  try {
    await withTenant(req.tenant.id, async (db) => {
      for (const ev of events) {
        const name = String(ev.name || '').slice(0, 60);
        if (!name) continue;

        await db.client.query(
          `insert into ui_events
             (tenant_id, user_id, session_id, event_name, page, props, client_ts)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [
            req.tenant.id,
            req.user.id,
            String(ev.sid || '').slice(0, 40) || null,
            name,
            String(ev.page || '').slice(0, 120) || null,
            JSON.stringify(sanitizeProps(ev.props)),
            ev.ts ? new Date(ev.ts) : null,
          ]
        );
      }
    });

    res.status(202).json({ ok: true, accepted: events.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const trackRoutes = require('./src/routes/track');
app.use('/api/track', trackRoutes);
```

## 2.4 四处关键

### 白名单而不是黑名单

```js
const ALLOWED_PROPS = new Set([...]);
if (!ALLOWED_PROPS.has(key)) continue;
```

**为什么：**

**黑名单（"不要这些"）永远漏。**

**白名单（"只要这些"）是"默认拒绝"。** **加一个新属性要显式改代码，这个阻力是对的。**

**而且白名单还挡掉了一类错误：** **有人不小心把整个 `req.body` 传进 props。**

**没有白名单，客户的订单数据、客户名、备注全会进埋点表。**

### 正则兜底

```js
const FORBIDDEN_PROP_PATTERN = /(email|phone|...)/i;
```

**即使有人把 `email` 加进了白名单（不太可能，但防一下），** **这个正则还会拦。**

**双保险，成本是零。**

### 返回 `202` 而不是 `200`

**因为埋点是"异步接收"——** **你收到了，但没保证"已经分析完了"。**

**202 的语义正是"已接受，处理中"。**

**而且前端不关心结果，** **所以前端可以 `fetch(..., { keepalive: true })` 发完就不管。**

### 一次最多 50 条

**为什么批量：**

**一次页面浏览可能产生 3—5 个事件。** **每个都发一次请求，等于 5 次网络往返。**

**批量发一次，省 80% 的请求。**

**为什么限 50：** **防滥用。** **不限制的话，一个 bug 可能一次发一万条，把数据库打死。**

---

# 第 3 步：前端埋点库（35 分钟）

## 3.1 新建 `public/js/track.js`

```js
(function () {
  const ENDPOINT = '/api/track/batch';
  const MAX_BATCH = 20;
  const FLUSH_INTERVAL = 5000;

  const queue = [];
  let flushTimer = null;
  let flushing = false;

  const sid =
    sessionStorage.getItem('_sid') ||
    (() => {
      const v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem('_sid', v);
      return v;
    })();

  function page() {
    return location.pathname.replace(/\.html$/, '') || '/';
  }

  function track(name, props) {
    queue.push({
      name,
      sid,
      page: page(),
      props: props || {},
      ts: new Date().toISOString(),
    });

    if (queue.length >= MAX_BATCH) {
      flush();
      return;
    }

    if (!flushTimer) {
      flushTimer = setTimeout(flush, FLUSH_INTERVAL);
    }
  }

  function flush() {
    if (flushing || queue.length === 0) return;

    clearTimeout(flushTimer);
    flushTimer = null;
    flushing = true;

    const batch = queue.splice(0, MAX_BATCH);

    const body = JSON.stringify({ events: batch });

    const done = () => {
      flushing = false;
      if (queue.length > 0) scheduleFlush();
    };

    if (navigator.sendBeacon && batch.length > 8) {
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (ok) {
        done();
        return;
      }
    }

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body,
      keepalive: true,
    })
      .then(done)
      .catch(() => {
        queue.unshift(...batch);
        done();
      });
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 1000);
  }

  window.addEventListener('pagehide', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  window.Track = { track, flush };
})();
```

## 3.2 五个关键点

### 批量 + 定时

```js
if (queue.length >= MAX_BATCH) flush();
if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL);
```

**两个触发条件：**

```text
攒够 20 条 → 立刻发
5 秒没攒够 → 也发（避免事件一直躺在内存里）
```

**为什么两个都要：**

**只有"攒够就发"：** 客户只做了一个动作就走了，那条事件永远发不出去。
**只有"定时发"：** 一次快速操作产生 20 条，要等 5 秒。

### `pagehide` 和 `visibilitychange` 都要监听

**客户关标签页时，只靠 `beforeunload` 不可靠。**

**`pagehide` 是更现代的替代（Safari 上 `beforeunload` 经常不触发）。**

**`visibilitychange` 覆盖"切到别的 App"——** **手机上这是最常见的离开方式。**

**三个都监听，覆盖 99% 的情况。**

### `sendBeacon` 处理"离开时发送"

```js
if (navigator.sendBeacon && batch.length > 8) {
  navigator.sendBeacon(ENDPOINT, new Blob([body], {...}));
}
```

**`sendBeacon` 专为这个场景设计：** **浏览器保证"即使页面关了，请求也会发出去"。**

**普通 `fetch` 在页面关闭时会被取消。**

**条件 `batch.length > 8`：** **`sendBeacon` 有 64KB 的大小限制，** **少量事件用 `fetch` 更灵活。**

**注意 `sendBeacon` 发的是 `Blob`，要带 `type`。**

**不带的话，服务端 `express.json()` 解析不了（因为 `Content-Type` 不对）。**

### `keepalive: true`

```js
fetch(ENDPOINT, { ..., keepalive: true });
```

**让 `fetch` 在页面卸载后继续。**

**和 `sendBeacon` 类似，但 `fetch` 能带自定义头（`sendBeacon` 不能）。**

**因为你要带 cookie（`credentials: 'include'`），所以 `fetch` 是必要的。**

### 失败重试：`queue.unshift(...batch)`

```js
.catch(() => {
  queue.unshift(...batch);
  done();
});
```

**请求失败时，把这一批放回队列头部。**

**为什么放头部（不是尾部）：** **保持事件顺序。** **顺序错乱的话，"先点A后点B"会变成"先B后A"，漏斗就错了。**

**注意：这可能导致"永远失败永远重试"。**

**更严谨的做法是加重试次数上限。** **但埋点丢了不算大问题，先这样。**

## 3.3 在页面上用

**新建 `public/js/pages/signup.js`（或者改现有的注册页）：**

```js
(function () {
  const { Field, Button } = window.UI;

  const form = Validate.createForm({
    fields: {
      company: { rules: [Validate.RULES.required, Validate.RULES.minLength(2)] },
      email: { rules: [Validate.RULES.required, Validate.RULES.email] },
      password: { rules: [Validate.RULES.required, Validate.RULES.password] },
    },
  });

  Track.track('signup_started');

  function render() {
    return `
      <form id="signup-form" novalidate>
        ${Field({ name: 'company', label: '公司名称', required: true, placeholder: '比如：杭州甲乙公司' })}
        ${Field({ name: 'email', label: '邮箱', required: true, type: 'email', inputmode: 'email', placeholder: 'name@company.com' })}
        ${Field({ name: 'password', label: '密码', required: true, type: 'password', hint: '至少 8 位，含字母和数字' })}
        <div class="action-host">
          ${Button({ label: '创建账号', variant: 'primary', block: true, type: 'submit' })}
        </div>
      </form>
    `;
  }

  async function handleSubmit(el) {
    const btn = el.querySelector('button[type="submit"]');

    Track.track('signup_submitted');

    const result = await Action.run(btn, async () => {
      const outcome = await form.submit(async (values) => {
        return API.post('/api/auth/register', {
          company: values.company,
          email: values.email,
          password: values.password,
        });
      });

      if (!outcome.ok) {
        const err = new Error('请检查标红的字段');
        err.fieldErrors = form.state.errors;
        throw err;
      }

      return outcome.result;
    });

    if (result.ok) {
      Track.track('signup_succeeded', { plan: 'free' });
      Track.flush();
      setTimeout(() => { window.location.href = '/dashboard.html'; }, 500);
      return;
    }

    const firstError = Object.entries(form.state.errors).find(([, v]) => v);

    Track.track('signup_failed', {
      code: result.error && result.error.status ? String(result.error.status) : 'unknown',
      field: firstError ? firstError[0] : null,
    });
  }

  const main = document.getElementById('main');
  main.innerHTML = render();
  form.bind(main);

  document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit(e.currentTarget);
  });
})();
```

## 3.4 三个细节

### 成功时先 `flush()` 再跳转

```js
Track.track('signup_succeeded', { plan: 'free' });
Track.flush();
setTimeout(() => { window.location.href = '/dashboard.html'; }, 500);
```

**为什么：**

**`signup_succeeded` 是最重要的一条事件。** **它决定了你的转化率。**

**如果它丢了，你的整个漏斗都错了。**

**所以显式 `flush()` 强制发送，再跳转。**

**这个"关键事件立刻发送"的模式值得记住。**

### 失败时记 `field` 和 `code`

```js
Track.track('signup_failed', { code: '409', field: 'email' });
```

**这两个属性能回答两个问题：**

```text
code   → 失败的主要原因是什么（409 = 邮箱重复，500 = 服务端问题）
field  → 客户卡在哪个字段（email 最多 → 说明邮箱输入体验有问题）
```

**没有这两个，你只知道"有 3 个人失败"，不知道"为什么失败"。**

### 不要在 `track` 里放用户输入

```js
// ❌ 绝对不行
Track.track('signup_failed', { email: values.email });
```

**邮箱是个人信息，不能进埋点。**

**而且它没法聚合（每个邮箱都不一样）。**

**记 `field: 'email'` 就够了——你要的是"哪个字段出错"，不是"具体哪个邮箱"。**

---

# 第 4 步：漏斗报表（40 分钟）

**埋点埋了不看等于没埋。这一步把数据变成判断。**

## 4.1 后端：漏斗查询

**在 `src/routes/track.js` 里加（注意要放在 `module.exports` 之前）：**

```js
router.get('/funnel', auth, tenant, async (req, res, next) => {
  const days = Math.min(Number(req.query.days) || 30, 90);
  const steps = ['signup_succeeded', 'import_finished', 'order_created', 'pay_succeeded'];

  try {
    const data = await withTenant(req.tenant.id, async (db) => {
      const { rows } = await db.client.query(
        `with scoped as (
           select user_id, event_name, server_ts
           from ui_events
           where tenant_id = $1
             and server_ts > now() - ($2 || ' days')::interval
             and user_id is not null
         ),
         firsts as (
           select distinct on (user_id, event_name)
             user_id, event_name, server_ts
           from scoped
           where event_name = any($3::text[])
           order by user_id, event_name, server_ts
         )
         select event_name, count(distinct user_id)::int as users
         from firsts
         group by event_name`,
        [req.tenant.id, String(days), steps]
      );
      return rows;
    });

    const byName = new Map(data.map((r) => [r.event_name, r.users]));
    const first = byName.get(steps[0]) || 0;

    const funnel = steps.map((name, i) => {
      const users = byName.get(name) || 0;
      const prev = i === 0 ? users : byName.get(steps[i - 1]) || 0;

      return {
        step: name,
        users,
        rateOfFirst: first > 0 ? Math.round((users / first) * 1000) / 10 : 0,
        rateOfPrev: prev > 0 ? Math.round((users / prev) * 1000) / 10 : 0,
      };
    });

    let worstStep = null;
    for (let i = 1; i < funnel.length; i++) {
      const drop = funnel[i - 1].users - funnel[i].users;
      if (drop > 0 && (!worstStep || drop > worstStep.drop)) {
        worstStep = {
          step: funnel[i].step,
          drop,
          from: funnel[i - 1].step,
          rateOfPrev: funnel[i].rateOfPrev,
        };
      }
    }

    res.json({ days, funnel, worstStep });
  } catch (err) {
    next(err);
  }
});
```

## 4.2 为什么用 `count(distinct user_id)`

**不用 `count(*)`。**

**因为一个客户可能：**

```text
点了三次"去支付"
最终只付了一次
```

**`count(*)` 会算出 3，`count(distinct user_id)` 算出 1。**

**漏斗的每一步要算的是"有多少人走到了这里"，不是"发生了多少次"。**

**这个区别让数字差好几倍。**

## 4.3 前端：把漏斗画出来

**新建 `public/js/pages/funnel.js`：**

```js
(function () {
  const view = AsyncView.create({
    container: document.getElementById('main'),
    emptyWhen: (data) => !data || data.funnel.every((f) => f.users === 0),
    emptyOptions: {
      title: '还没有足够的数据',
      text: '有客户走过完整流程之后，这里会出现漏斗',
    },
    renderData: renderFunnel,
  });

  const LABELS = {
    signup_succeeded: '注册成功',
    import_finished: '导入数据',
    order_created: '创建订单',
    pay_succeeded: '完成付款',
  };

  function renderFunnel(data) {
    const max = data.funnel[0].users || 1;

    return `
      <div class="card">
        <div class="section__title">转化漏斗（近 ${data.days} 天）</div>
        ${
          data.worstStep
            ? `<div class="funnel-hint">
                 流失最多的是「${LABELS[data.worstStep.from]} → ${LABELS[data.worstStep.step]}」，
                 掉了 ${data.worstStep.drop} 人（只剩 ${data.worstStep.rateOfPrev}%）
               </div>`
            : ''
        }
        <div class="funnel">
          ${data.funnel
            .map(
              (f, i) => `
            <div class="funnel__row">
              <div class="funnel__label">${LABELS[f.step] || f.step}</div>
              <div class="funnel__bar-wrap">
                <div class="funnel__bar" style="width:${Math.max(4, (f.users / max) * 100)}%"></div>
              </div>
              <div class="funnel__num">${f.users}<span class="funnel__pct">${i === 0 ? '100%' : f.rateOfFirst + '%'}</span></div>
            </div>
            ${
              i > 0
                ? `<div class="funnel__drop">↓ ${f.rateOfPrev}%</div>`
                : ''
            }
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  view.run(() => API.get('/api/track/funnel?days=30'));
})();
```

**配套 CSS：**

```css
.funnel { margin-top: var(--space-4); }

.funnel__row {
  display: grid;
  grid-template-columns: 88px 1fr 64px;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.funnel__label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.funnel__bar-wrap {
  height: 28px;
  background: var(--color-bg-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.funnel__bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  transition: width 0.4s ease;
}

.funnel__num {
  font-size: var(--text-base);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.funnel__pct {
  display: block;
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--color-text-muted);
}

.funnel__drop {
  margin: 0 0 var(--space-2) 100px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.funnel-hint {
  margin-top: var(--space-3);
  padding: var(--space-3);
  background: #fff4e5;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--color-warning);
  line-height: 1.6;
}
```

## 4.4 最值钱的是那一句"流失最多的是"

**看这段：**

```js
data.worstStep
  ? `流失最多的是「${LABELS[data.worstStep.from]} → ${LABELS[data.worstStep.step]}」，
     掉了 ${data.worstStep.drop} 人（只剩 ${data.worstStep.rateOfPrev}%）`
  : ''
```

**为什么这句比整张漏斗图更有用：**

**客户（和你）看漏斗图只会想"哦，少了些人"。**

**看这句话会想"**哦，问题在导入这一步，去查为什么**"。**

**这就是"数据"和"洞察"的区别。**

**洞察是"我该做什么"，数据是"发生了什么"。**

**你的报表要往洞察那边多走一步。** **哪怕只是一句用模板拼出来的话。**

## 4.5 自检点

**先造数据（用 curl 直接打接口）：**

```text
# 一个"注册成功"的人
curl -X POST http://localhost:3000/api/track/batch -b cookies.txt -H "Content-Type: application/json" -d "{\"events\":[{\"name\":\"signup_succeeded\",\"props\":{\"plan\":\"free\"}}]}"

# 一个"注册成功 + 导入完成"的人
curl -X POST http://localhost:3000/api/track/batch -b cookies.txt -H "Content-Type: application/json" -d "{\"events\":[{\"name\":\"signup_succeeded\"},{\"name\":\"import_finished\",\"props\":{\"ok_rows\":100,\"failed_rows\":3}}]}"
```

**注意：`user_id` 是同一个（同一个 cookie）。**

**所以上面两次是同一个人的两条 `signup_succeeded`（`distinct` 之后只算 1 个）。**

**要看漏斗，得用不同的账号发。**

**最快的做法：跑 `node scripts/seed.js` 造几个用户，分别登录发事件。**

**或者简化：先手工验证 SQL 能跑对。**

```sql
select event_name, count(distinct user_id)
from ui_events
where tenant_id = '<id>'
  and server_ts > now() - interval '30 days'
group by event_name;
```

**然后看接口返回的数字是否一致。**

---

# 第 5 步：故意埋一个"脏"事件（20 分钟）

## 5.1 试着传个人信息

```text
curl -X POST http://localhost:3000/api/track/batch -b cookies.txt -H "Content-Type: application/json" -d "{\"events\":[{\"name\":\"test\",\"props\":{\"email\":\"a@b.com\",\"phone\":\"13800138000\",\"amount_cents\":100,\"custom_field\":\"xyz\"}}]}"
```

**然后查数据库：**

```sql
select props from ui_events where event_name = 'test' order by id desc limit 1;
```

**期望：**

```json
{"amount_cents": 100}
```

**只有 `amount_cents` 进来了。**

**`email`、`phone` 被正则拦，`custom_field` 被白名单拦。**

**如果 `email` 进来了，说明你的 `sanitizeProps` 有问题。**

## 5.2 试着传一个巨大的 props

```text
curl -X POST http://localhost:3000/api/track/batch -b cookies.txt -H "Content-Type: application/json" -d "{\"events\":[{\"name\":\"big\",\"props\":{\"feature\":\"aaaaaaaa...（一万个字符）\"}}]}"
```

**期望：`feature` 被截断到 100 字符。**

**查一下：**

```sql
select length(props->>'feature') from ui_events where event_name = 'big' order by id desc limit 1;
```

**应该是 100。**

**为什么必须截断：**

**不截断的话，有人（或者一个 bug）能往你的表里塞几 MB 的字符串。** **一天之后你的表就爆了。**

**所有"用户可控的字符串"都要有长度上限。**

## 5.3 试着一次传 100 条

```text
curl -X POST http://localhost:3000/api/track/batch -b cookies.txt -H "Content-Type: application/json" -d "{\"events\":[$(for i in $(seq 1 100); do echo -n '{"name":"x"},'; done | sed 's/,$//')]}"
```

**期望：`400 {"error":"一次最多 50 条"}`。**

**这条限制挡住的是"某个前端 bug 一次发一万条"。**

**没有它，你的数据库会被自己的 bug 打死。**

---

# 第 6 步：最终验收

## A. 事件清单

- [ ] `docs/tracking-plan.md` 有 8—15 条事件
- [ ] 每条都写了"回答什么问题"
- [ ] 没有"滚动/停留/鼠标移动"这类事件
- [ ] 属性里没有个人信息

## B. 表

- [ ] `ui_events` 有 `server_ts` 和 `client_ts`
- [ ] 有 `session_id`
- [ ] `props` 是 `jsonb`，有 GIN 索引
- [ ] `user_id` 是 `on delete set null`
- [ ] 有 RLS

## C. 接口

- [ ] 白名单过滤 `props`
- [ ] 正则兜底拦个人信息
- [ ] 字符串截断到 100
- [ ] 一次最多 50 条
- [ ] 返回 202

## D. 前端

- [ ] 批量（攒够 20 或 5 秒）
- [ ] `pagehide` + `visibilitychange` 都监听
- [ ] 大 batch 用 `sendBeacon`
- [ ] 失败放回队列头部（保顺序）
- [ ] 关键事件（`signup_succeeded`）立刻 flush

## E. 漏斗

- [ ] 用 `count(distinct user_id)`，不是 `count(*)`
- [ ] 能看到每步的"占首步的百分比"和"占上一步的百分比"
- [ ] 有"流失最多的是'X → Y'"这句话
- [ ] 数字和手工 SQL 一致

## F. 脏数据测试

- [ ] 传 `email` 被拦
- [ ] 传超长字符串被截断到 100
- [ ] 传 100 条被拒

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"只记决策点"
- [ ] 我记下了"洞察比数据多走一步"

## 提交

```text
git add -A
git commit -m "第188节课: 埋点计划 + 白名单过滤 + 批量上报 + 转化漏斗"
git push
```

---

# 附：常见问题速查

| 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 事件一条都没进来 | `Track.track` 调了但没 `flush` | 加 `pagehide` 监听，或关键事件手动 flush |
| 事件顺序乱了 | 失败重试放到队列尾部 | `unshift` 到头部 |
| `sendBeacon` 发的解析不了 | 没带 `Blob` 的 `type` | `new Blob([body], {type:'application/json'})` |
| 漏斗每一步人数一样 | 用了 `count(*)` 不是 `count(distinct user_id)` | 改 |
| 漏斗数字比实际多 | `user_id` 为 null 的事件也算了 | 加 `where user_id is not null` |
| `email` 进了 props | 白名单写漏了 | 检查 `ALLOWED_PROPS` |
| 表一天涨了几百 MB | 没限制字符串长度 | 截断到 100 |
| 数据库被埋点打死 | 一次传了几千条 | 限 50 条 |
| `session_id` 全一样 | 用了 `localStorage` | 改 `sessionStorage` |
| 页面关闭时最后几条丢了 | 只监听了 `beforeunload` | 加 `pagehide` 和 `visibilitychange` |

---

## 本节课要能说出口的一句话

> **埋点只记"决策点"不记"所有动作"；而报表的价值在于多走一步——从"发生了什么"变成"你该做什么"。**
