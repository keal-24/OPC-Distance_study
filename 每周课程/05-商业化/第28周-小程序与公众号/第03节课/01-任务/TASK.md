# 第 192 节课：小程序怎么调你的接口

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课连了三个页面，但都是"读"。这一节做"写"：**提交、上传、分页、下拉刷新、上拉加载。**
> 重点是**五个网页上不存在、小程序里必须处理的问题**。

**建议用时**：170 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（85 分钟）一次，第 3—5 步（85 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 191 节（三页互通，详情能退款）

---

# 第 0 步：五个网页没有的差异（20 分钟）

## 0.1 对比表

| | 网页 | 小程序 |
|---|---|---|
| HTTP 库 | `fetch` | `wx.request` |
| Cookie | 自动带 | **不自动带**（要自己管） |
| 超时默认 | 浏览器决定（可能 30 秒+） | 60 秒 |
| 并发上限 | 6 个/域名 | **10 个** |
| 上传 | `FormData` | `wx.uploadFile`（独立 API） |
| 域名 | 任意 | **必须白名单 + HTTPS** |

**看第二行。**

**这是最关键的一条：** **小程序不会自动带 Cookie。**

**所以你不能靠第 164 节的 `HttpOnly Cookie` 登录。**

**必须改成 `Authorization: Bearer <token>`。**

**这是"从网页迁移到小程序"最大的一处架构变化。**

## 0.2 为什么不用 Cookie

**两个原因：**

```text
① wx.request 默认不带 cookie（虽然可以开 withCredentials，但复杂）
② 小程序没有"域名"的概念来限定 cookie 作用范围
```

**而且 token 方式在这个场景里更好：**

```text
网页：Cookie 自动带，省事，但 CSRF 要防
小程序：token 手动带，麻烦一点，但天然没有 CSRF
```

**"天然没有 CSRF" 是因为：** **token 在 `header` 里，跨站请求带不上。**

**所以小程序这边反而不需要 CSRF token。**

## 0.3 这一节要做的五件事

```text
① 后端支持 Bearer token（和 Cookie 并存）
② 分页（列表页从"全量"改成"分页"）
③ 提交表单（新建订单）
④ 上传文件（选照片/文件）
⑤ 下拉刷新 + 上拉加载
```

---

# 第 1 步：后端同时支持两种凭证（30 分钟）

**网页用 Cookie，小程序用 Bearer。两套都要支持。**

## 1.1 改 `middleware/auth.js`

```js
const jwt = require('jsonwebtoken');
const systemPool = require('../db/system-pool');

function extractToken(req) {
  const header = req.headers.authorization || '';

  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

module.exports = async function auth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: '未登录', code: 'NO_TOKEN' });
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return res.status(401).json({
      error: err.name === 'TokenExpiredError' ? '登录已过期' : '登录无效',
      code,
    });
  }

  // 必须用 systemPool：此刻还不知道 tenant_id，
  // 用 pool 会被 users 表的 force RLS 拦成 0 行（第 165 节 5.4）
  const { rows } = await systemPool.query(
    'select id, email, role, tenant_id from users where id = $1',
    [payload.uid]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: '账号不存在', code: 'USER_GONE' });
  }

  req.user = rows[0];
  next();
};
```

## 1.2 四处改动

### `extractToken` 先看 header 再看 cookie

```js
if (header.startsWith('Bearer ')) return header.slice(7).trim();
if (req.cookies && req.cookies.token) return req.cookies.token;
```

**为什么先 header：**

**因为小程序只带 header（不带 cookie）。**

**网页带 cookie（不带 header）。**

**两个都支持，顺序不影响功能，但"显式的优先"更清晰。**

### 连接从 `pool` 换成 `systemPool`

**这一处不是"顺手改改"，是必须改。**

**第 165 节给 `users` 表加了 `force row level security`。而 `auth` 中间件做的第一件事就是"拿 token 里的 uid 去查 users"——** **这个动作发生在"还不知道租户"的时刻，所以 `app.tenant_id` 是空的。**

**用 `pool` 的结果：**

```text
select ... from users where id = $1  →  0 行
→ 返回 401 {"error":"账号不存在","code":"USER_GONE"}
```

**然后你调试的顺序会是这样的（我踩过）：**

```text
① 以为 token 没传 → 打印 req.headers，token 在
② 以为 uid 不对 → 打印 payload.uid，是个正常 uuid
③ 以为用户被删了 → 连数据库 select，人明明在
④ 开始怀疑 jwt 库有问题
```

**半小时之后才想到"这表是不是有 RLS"。**

**这就是第 165 节 5.4 那套 `systemPool` 的用途。** **如果你当时跳过了那一段，现在回去补。**

**顺便说清一个容易被忽略的点：** **`tenant.js` 里查 `tenants` 表那次不用改**——**因为 `tenants` 表没有 RLS（它本身就"不属于任何租户"）。** **不是所有查库都要 systemPool，只有查那些"有 RLS 的表，又还没有上下文"的才需要。**

### 401 带 `code`

```js
return res.status(401).json({ error: '登录已过期', code: 'TOKEN_EXPIRED' });
```

**为什么加 `code`：**

**小程序要区分两种情况：**

```text
TOKEN_EXPIRED → 自动重登录（客户不用操作）
TOKEN_INVALID → 也要重登录，但可能是配置问题
USER_GONE     → 账号被删了，重登录也没用
```

**没有 `code`，你只能靠中文文案判断——** **文案一改就崩。**

**所有"客户端要分支处理"的响应都要带 `code`。**

### 登录接口也要返回 `token`

**`POST /api/auth/login` 现在只设 cookie。小程序要 token。**

**改成同时返回：**

```js
router.post('/login', async (req, res) => {
  …
  const token = jwt.sign({ uid: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

  setCookie(res, token);          // 网页用

  res.json({
    token,                        // 小程序用
    expiresIn: 7 * 24 * 3600,
    user: { id: user.id, email: user.email, role: user.role },
    tenant: { id: user.tenant_id },
  });
});
```

**为什么两个都给：**

**网页读 cookie（更安全，JS 拿不到），小程序读 `token`（存 storage）。**

**不要因为"反正都给"就把 cookie 删掉——** **Cookie 有 `HttpOnly`，网页端的 XSS 偷不走 token。**

## 1.3 自检点

**用 curl 测两种方式：**

```text
# Cookie
curl http://localhost:3000/api/me -b cookies.txt

# Bearer
curl http://localhost:3000/api/me -H "Authorization: Bearer <你从登录接口拿到的 token>"
```

**两个都要返回 200。**

**再测一个错的：**

```text
curl http://localhost:3000/api/me -H "Authorization: Bearer wrong"
```

**期望：**

```json
{"error":"登录无效","code":"TOKEN_INVALID"}
```

---

# 第 2 步：分页（35 分钟）

**现在的 `/api/orders` 返回全部。** **1000 条的时候，小程序会卡死。**

## 2.1 后端加分页

**改 `src/routes/orders.js` 的列表接口：**

```js
router.get('/', async (req, res, next) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const cursor = req.query.cursor || '';

  try {
    const result = await withTenant(req.tenant.id, async (db) => {
      let cursorDate = null;
      let cursorId = null;

      if (cursor) {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        const [d, i] = decoded.split('|');
        cursorDate = d;
        cursorId = i;
      }

      const { rows } = await db.client.query(
        `select id, order_no, customer_name, order_date, quantity,
                unit_price_cents, amount_cents, paid_cents, refunded_cents,
                status, created_at
         from orders
         where tenant_id = $1
           and ($2::date is null or (created_at, id) < ($2::timestamptz, $3::uuid))
         order by created_at desc, id desc
         limit $4`,
        [req.tenant.id, cursorDate, cursorId, limit + 1]
      );

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      let nextCursor = null;

      if (hasMore && items.length > 0) {
        const last = items[items.length - 1];
        nextCursor = Buffer.from(
          new Date(last.created_at).toISOString() + '|' + last.id,
          'utf8'
        ).toString('base64');
      }

      return { items, nextCursor, hasMore };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

## 2.2 四个关键点

### 多查一条判断 `hasMore`

```js
limit $4`   // $4 = limit + 1
const hasMore = rows.length > limit;
const items = hasMore ? rows.slice(0, limit) : rows;
```

**技巧：查 `limit + 1` 条。**

```text
查到 21 条（limit=20）→ 说明还有 → hasMore = true，返回前 20
查到 20 条          → 说明正好完 → hasMore = false
```

**为什么不用 `count(*)`：**

**那是第二次查询，多一次往返。**

**而且高并发时 `count` 和实际数据可能不一致。**

**"多查一条"是零成本的判断。**

### 游标分页，不是 `OFFSET`

```sql
and (created_at, id) < ($2::timestamptz, $3::uuid)
order by created_at desc, id desc
```

**和第 171 节（导出）是同一个思路。**

```text
OFFSET 分页：翻到第 50 页时，数据库要先扫 1000 行再丢掉
游标分页：  直接从那个位置开始，每页都一样快
```

**而且游标分页不会"漏行"或"重复行"。**

**为什么：** **如果在你翻页的时候有人插了一条新订单，`OFFSET` 分页会让那条新订单挤掉你下一页的第一条——** **客户看到的列表少了一条，而且他永远不会知道。**

### 游标用 base64 编码

```js
nextCursor = Buffer.from(date + '|' + id, 'base64').toString('base64');
```

**为什么编码：**

**让客户端"不能自己构造"。**

**如果不编码（直接返回 `2026-11-16T10:00:00Z|uuid`），** **客户端可能想"那我自己拼一个跳到中间"，然后拼错，出各种诡异问题。**

**base64 之后它是一个不透明字符串——** **客户端只会老老实实传回来。**

**这是分页接口的通用做法。**

### `(created_at, id)` 两个字段一起比

**为什么不能只比 `created_at`：**

**同一秒创建的多个订单，`created_at` 相同。** **只比时间会漏掉或重复一部分。**

**加上 `id` 保证唯一。**

**这就是"排序键必须唯一"那条规则。**

## 2.3 小程序端改成分页

**`pages/orders/index.js` 重写 `load`：**

```js
const { request } = require('../../utils/request');

Page({
  data: {
    loading: true,
    loadingMore: false,
    orders: [],
    hasMore: true,
    cursor: '',
    error: '',
  },

  onLoad() {
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      this.load(false);
    }
  },

  async load(reset) {
    if (reset) {
      this.setData({ loading: true, error: '', cursor: '', hasMore: true });
    } else {
      this.setData({ loadingMore: true });
    }

    try {
      const params = ['limit=20'];

      if (!reset && this.data.cursor) {
        params.push('cursor=' + encodeURIComponent(this.data.cursor));
      }

      const res = await request({ path: '/api/orders?' + params.join('&') });

      const items = (res.items || []).map((o) => ({
        id: o.id,
        order_no: o.order_no,
        customer_name: o.customer_name,
        order_date: String(o.order_date || '').slice(0, 10),
        amount: (o.amount_cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        status: o.status,
        status_text: STATUS_TEXT[o.status] || o.status,
      }));

      this.setData({
        loading: false,
        loadingMore: false,
        orders: reset ? items : this.data.orders.concat(items),
        cursor: res.nextCursor || '',
        hasMore: Boolean(res.hasMore),
      });
    } catch (err) {
      this.setData({
        loading: false,
        loadingMore: false,
        error: err.message || '加载失败',
      });
    }
  },
});
```

## 2.4 三处关键

### `onReachBottom` 是内置的"到底了"

**页面滚动到底部时自动触发。**

**必须在 `app.json` 或页面的 `.json` 里开（默认是开的，但距离默认是 50px）：**

```json
{
  "onReachBottomDistance": 100
}
```

**`100px` 的意思是"离底部还有 100px 就开始加载"——** **客户不会看到"到底了才转圈"。**

**这个值很关键：**

```text
太小（20px）→ 客户看到列表底部，等一下才出现新数据
太大（300px）→ 还在看第 5 条就开始加载第 3 页，浪费流量
100px 左右     → 感觉"无感加载"
```

### `onPullDownRefresh` 需要开启

**页面的 `.json` 里要加：**

```json
{
  "enablePullDownRefresh": true,
  "backgroundTextStyle": "dark"
}
```

**不加的话，下拉没反应。**

**`backgroundTextStyle` 控制那个"转圈"的颜色（`dark` / `light`）。**

**白色背景上要用 `dark`，否则看不见。**

### `loadingMore` 防重复触发

```js
if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
  this.load(false);
}
```

**`onReachBottom` 会连续触发（滚动带惯性的时候可能触发三四次）。**

**不防的话，一次滚动会发 3 个请求，加载 3 页。**

**这三页可能是同一页（因为 `cursor` 还没更新），** **结果列表里出现重复数据。**

**这就是"下拉到底，列表里全是重复订单"的原因。**

## 2.5 自检点

**四个检查：**

```text
① 列表只显示 20 条，滚到底自动加载更多
② 加载时底部有"加载中"提示
③ 全部加载完之后，底部显示"没有更多了"
④ 连续快速滚动，不会出现重复的行
```

**第 ③ 条要补个 UI：**

```xml
<view class="list-footer">
  <text wx:if="{{loadingMore}}">加载中……</text>
  <text wx:elif="{{!hasMore && orders.length > 0}}">没有更多了</text>
  <text wx:elif="{{error}}">{{error}}</text>
</view>
```

**"没有更多了"这句话很重要。**

**没有它，客户会一直往下拉，以为还有。**

---

# 第 3 步：提交表单（30 分钟）

**小程序的表单和网页完全不同（没有 `<form>` 的 `submit`）。**

## 3.1 新建订单页

**新建 `pages/order-new/`：**

**`index.wxml`：**

```xml
<view class="page">
  <view class="field">
    <text class="field__label field__label--required">客户名称</text>
    <input
      class="input"
      value="{{form.customer_name}}"
      placeholder="比如：杭州甲乙公司"
      bindinput="onInput"
      data-field="customer_name"
    />
    <text class="field__error" wx:if="{{errors.customer_name}}">{{errors.customer_name}}</text>
  </view>

  <view class="field">
    <text class="field__label field__label--required">数量</text>
    <input
      class="input"
      type="number"
      value="{{form.quantity}}"
      placeholder="1"
      bindinput="onInput"
      data-field="quantity"
    />
    <text class="field__error" wx:if="{{errors.quantity}}">{{errors.quantity}}</text>
  </view>

  <view class="field">
    <text class="field__label field__label--required">单价（元）</text>
    <input
      class="input"
      type="digit"
      value="{{form.unit_price}}"
      placeholder="1299.00"
      bindinput="onInput"
      data-field="unit_price"
    />
    <text class="field__error" wx:if="{{errors.unit_price}}">{{errors.unit_price}}</text>
  </view>

  <view class="field">
    <text class="field__label field__label--required">下单日期</text>
    <picker mode="date" value="{{form.order_date}}" bindchange="onDateChange">
      <view class="input input--picker">
        {{form.order_date || '请选择'}}
      </view>
    </picker>
    <text class="field__error" wx:if="{{errors.order_date}}">{{errors.order_date}}</text>
  </view>

  <view class="preview" wx:if="{{totalText}}">
    <text class="preview__label">总金额</text>
    <text class="preview__value">¥{{totalText}}</text>
  </view>

  <button
    class="btn btn--primary btn--block"
    bindtap="onSubmit"
    loading="{{submitting}}"
    disabled="{{submitting}}"
  >
    {{submitting ? '保存中' : '保存'}}
  </button>
</view>
```

**`index.js`：**

```js
const { request } = require('../../utils/request');

Page({
  data: {
    form: {
      customer_name: '',
      quantity: '',
      unit_price: '',
      order_date: '',
    },
    errors: {},
    totalText: '',
    submitting: false,
  },

  onLoad() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');

    this.setData({ 'form.order_date': y + '-' + m + '-' + d });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;

    this.setData({ ['form.' + field]: value }, () => {
      this.clearError(field);
      this.updateTotal();
    });

    if (this.data.errors[field]) {
      this.validateField(field);
    }
  },

  onDateChange(e) {
    this.setData({ 'form.order_date': e.detail.value }, () => {
      this.clearError('order_date');
    });
  },

  clearError(field) {
    if (!this.data.errors[field]) return;
    this.setData({ ['errors.' + field]: '' });
  },

  validateField(field) {
    const error = this.checkOne(field, this.data.form[field]);
    this.setData({ ['errors.' + field]: error || '' });
    return error;
  },

  checkOne(field, value) {
    const s = String(value == null ? '' : value).trim();

    if (field === 'customer_name') {
      if (!s) return '请填写客户名称';
      if (s.length < 2) return '至少 2 个字，现在 ' + s.length + ' 个';
      if (s.length > 100) return '最多 100 字，超了 ' + (s.length - 100);
      return null;
    }

    if (field === 'quantity') {
      if (!s) return '请填写数量';
      if (!/^\d+$/.test(s)) return '只能填数字';
      if (Number(s) < 1) return '数量至少是 1';
      if (Number(s) > 10000) return '数量不能超过 10000';
      return null;
    }

    if (field === 'unit_price') {
      if (!s) return '请填写单价';
      const clean = s.replace(/[,¥\s]/g, '');
      if (!/^\d+(\.\d{1,2})?$/.test(clean)) return '最多两位小数，比如 1299.50';
      if (Number(clean) <= 0) return '单价必须大于 0';
      return null;
    }

    if (field === 'order_date') {
      if (!s) return '请选择日期';
      return null;
    }

    return null;
  },

  updateTotal() {
    const qty = Number(this.data.form.quantity);
    const price = Number(String(this.data.form.unit_price).replace(/[,¥\s]/g, ''));

    if (!qty || !price) {
      this.setData({ totalText: '' });
      return;
    }

    const cents = Math.round(qty * price * 100);
    const text = (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    this.setData({ totalText: text });
  },

  async onSubmit() {
    if (this.data.submitting) return;

    const fields = ['customer_name', 'quantity', 'unit_price', 'order_date'];
    const errors = {};

    for (const f of fields) {
      const err = this.checkOne(f, this.data.form[f]);
      if (err) errors[f] = err;
    }

    if (Object.keys(errors).length > 0) {
      this.setData({ errors });
      wx.showToast({ title: '请检查标红的字段', icon: 'none' });
      return;
    }

    this.setData({ submitting: true, errors: {} });

    try {
      const priceCents = Math.round(
        Number(String(this.data.form.unit_price).replace(/[,¥\s]/g, '')) * 100
      );

      const created = await request({
        path: '/api/orders',
        method: 'POST',
        data: {
          customerName: this.data.form.customer_name.trim(),
          quantity: Number(this.data.form.quantity),
          unitPriceCents: priceCents,
          orderDate: this.data.form.order_date,
          requestId: 'mp-order-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        },
      });

      wx.showToast({ title: '已保存', icon: 'success' });

      setTimeout(() => {
        wx.redirectTo({ url: '/pages/order-detail/index?id=' + encodeURIComponent(created.order.id) });
      }, 600);
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
```

## 3.2 四个关键点

### `bindinput` 的 `e.detail.value`

```js
onInput(e) {
  const field = e.currentTarget.dataset.field;
  const value = e.detail.value;
}
```

**`e.detail.value` 是输入框的当前值。**

**`e.currentTarget.dataset.field` 是"哪个字段"（来自 `data-field`）。**

**用一个 `onInput` 处理四个输入框，靠 `data-field` 区分。**

**不这么写的话，你要写四个 `onInputCustomer`、`onInputQuantity`……**

### `this.setData` 的回调

```js
this.setData({ ['form.' + field]: value }, () => {
  this.clearError(field);
  this.updateTotal();
});
```

**`setData` 的第二个参数是"更新完成后的回调"。**

**为什么需要：**

**因为 `setData` 是异步的（跨线程通信）。** **在它之后立刻读 `this.data.form.quantity` 拿到的是旧值。**

**这个坑很隐蔽：** **你会发现"总金额总是慢一步"。**

**所有"改完数据要立刻基于新数据算东西"的地方，都要用回调。**

### `picker` 而不是 `<input type="date">`

```xml
<picker mode="date" value="{{form.order_date}}" bindchange="onDateChange">
  <view class="input input--picker">{{form.order_date || '请选择'}}</view>
</picker>
```

**小程序没有 `<input type="date">`。**

**必须用 `<picker mode="date">`，里面套一个显示用的 `view`。**

**`<picker>` 会弹出微信原生的日期选择器——** **比任何自制的好用（滚轮、快捷选项都有）。**

### `type="number"` 和 `type="digit"` 的区别

```xml
<input type="number" />    <!-- 数字键盘，只能输整数 -->
<input type="digit" />     <!-- 数字键盘，可以输小数点 -->
```

**数量用 `number`（不能有小数点），单价用 `digit`（可以有）。**

**用错了：** **单价用 `number`，客户输不了 `1299.50`，只能输 `1299`。**

**他会以为"这个系统不能输小数"，然后打电话问。**

## 3.3 自检点

**五个检查：**

```text
① 填数量和单价，总金额立刻更新
② 客户名称填一个字 → 标红"至少 2 个字，现在 1 个"
③ 点日期 → 弹出微信的日期选择器
④ 单价用 digit → 能输小数点
⑤ 保存成功 → 跳到详情页，显示刚创建的订单
```

---

# 第 4 步：上传文件（25 分钟）

**`wx.uploadFile` 是独立 API，不能用 `wx.request`。**

## 4.1 上传头像

**新建 `pages/upload/index.js`（或者加到"我的"页面）：**

```js
const { request } = require('../../utils/request');

Page({
  data: {
    uploading: false,
    avatarUrl: '',
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0];

        if (file.size > 2 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过 2MB', icon: 'none' });
          return;
        }

        this.upload(file.tempFilePath);
      },
    });
  },

  upload(filePath) {
    this.setData({ uploading: true });

    const token = wx.getStorageSync('token');

    wx.uploadFile({
      url: 'http://localhost:3000/api/files/upload',
      filePath,
      name: 'file',
      header: {
        Authorization: 'Bearer ' + token,
      },
      formData: {
        category: 'avatar',
      },
      timeout: 60000,
      success: (res) => {
        let body;

        try {
          body = JSON.parse(res.data);
        } catch (err) {
          wx.showToast({ title: '服务器返回异常', icon: 'none' });
          return;
        }

        if (res.statusCode === 200) {
          this.setData({ avatarUrl: body.url });
          wx.showToast({ title: '上传成功', icon: 'success' });
        } else {
          wx.showToast({ title: body.error || '上传失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.showToast({
          title: err.errMsg && err.errMsg.includes('domain')
            ? '域名未配置'
            : '网络异常，上传失败',
          icon: 'none',
        });
      },
      complete: () => {
        this.setData({ uploading: false });
      },
    });
  },
});
```

## 4.2 四处关键

### `wx.chooseMedia` 不返回 base64

**它返回的是"临时文件路径"。**

```js
res.tempFiles[0].tempFilePath   // 'wxfile://tmp_xxxx.jpg'
```

**这个路径可以直接给 `<image src="...">` 显示，也可以给 `wx.uploadFile`。**

**但不能给 `wx.request` 当 body。**

**而且它是"临时的"——** **小程序退出后失效。** **所以要上传到你的服务器长期保存。**

### `res.data` 是字符串

```js
body = JSON.parse(res.data);
```

**`wx.uploadFile` 的响应体是**字符串**，不是对象。**

**不 `JSON.parse` 直接读 `res.data.error`，会得到 `undefined`。**

**这个和 `wx.request` 不同（`wx.request` 会自动解析 JSON）。**

**两个 API 的行为不一致，很容易搞混。**

### `sizeType: ['compressed']`

**让微信压缩一下再给你。**

**客户拍的照片可能 5MB。** **不压缩上传要 10 秒，压缩后 300KB，1 秒完成。**

**代价：清晰度下降。** **头像够用，票据照片可能不够——** **那种场景用 `original`。**

### `name: 'file'` 要和后端对上

**你的后端用的是 `upload.single('file')`。**

**所以这里必须 `name: 'file'`。**

**不一致会报：**

```text
MulterError: Unexpected field
```

**第 170 节讲过这个坑。**

## 4.3 后端要支持 Bearer

**现在 `/api/files/upload` 用的是 `auth` 中间件——** **第 1.1 节已经改成支持 Bearer 了，所以直接能用。**

**但要确认一件事：** **`multer` 的中间件顺序。**

```js
router.post('/upload', auth, tenant, upload.single('file'), handler);
```

**`auth` 必须在 `upload` 之前。**

**为什么：** **因为 `multer` 会先解析文件（花时间、占内存）。** **如果鉴权失败，白解析一遍。**

**而且未登录的人可以用这个接口消耗你的内存。** **这是个真实的 DoS 面。**

## 4.4 自检点

**三个检查：**

```text
① 选一张图 → 显示"上传中" → 成功后显示图片
② 选一张 5MB 的图 → 被拒（超过 2MB）
③ 断网状态下上传 → 提示"网络异常，上传失败"
```

---

# 第 5 步：故意撞五次墙（30 分钟）

**这五个坑你一定会遇到。**

## 5.1 墙一：忘了 `Authorization`

**把 `request.js` 里的 header 删掉：**

```js
header: {
  'Content-Type': 'application/json',
  // 删掉 Authorization
},
```

**刷新列表。**

**期望：**

```text
401 → 触发自动登录 → 又 401 → 报错
```

**实际上会看到：** **一个"登录已过期"的 toast，然后无限循环的请求（在 Network 面板里看）。**

**为什么会循环：**

**`login()` 走到 `/api/auth/wechat`（这个接口还没写，第 193 节做）——** **所以现在会 404，然后 `request` 抛错，`catch` 里 reject。**

**加回来。**

## 5.2 墙二：`onReachBottom` 重复触发

**把 `loadingMore` 的判断删掉：**

```js
onReachBottom() {
  if (this.data.hasMore) {        // 删掉 !this.data.loadingMore
    this.load(false);
  }
},
```

**快速滚到底部。**

**你会看到 Network 里同时有 3—4 个 `/api/orders?cursor=xxx` 请求。**

**而且它们用的是同一个 `cursor`（因为都还没更新）。**

**结果是列表里出现重复的行。**

**加回来。**

## 5.3 墙三：`setData` 异步导致总金额慢一步

**把 `setData` 的回调删掉：**

```js
this.setData({ ['form.' + field]: value });
this.updateTotal();     // 立刻调，不等 setData
```

**输入数量和单价，观察总金额。**

**你会发现：**

```text
数量填 3 → 总金额空白（因为单价还没有）
单价填 100 → 总金额 ¥300（对）
数量改成 4 → 总金额还是 ¥300（错！应该是 ¥400）
数量改成 5 → 总金额 ¥400（用上一次的值）
```

**总是慢一步。**

**这就是 `setData` 异步的后果。**

**改回用回调。**

## 5.4 墙四：单价用了 `type="number"`

**把 `type="digit"` 改成 `type="number"`：**

```xml
<input type="number" ... />
```

**试着输入 `1299.50`。**

**小数点输不进去。**

**这就是客户会遇到的"这个系统不能输小数"的问题。**

**改回 `digit`。**

## 5.5 墙五：`wx.uploadFile` 不解析 JSON

**把 `JSON.parse(res.data)` 删掉，直接用 `res.data.error`：**

```js
if (res.statusCode === 200) {
  this.setData({ avatarUrl: res.data.url });     // undefined
}
```

**上传成功，但图片不显示（`url` 是 `undefined`）。**

**而且没有报错。** **你会以为"服务器没返回 url"。**

**这就是"响应体是字符串"的坑。**

**改回来。**

## 5.6 自检点

**五个墙都撞过，你的代码应该：**

```text
① 列表能正常加载（有 Authorization）
② 滚到底只发一个请求
③ 总金额实时准确
④ 单价能输小数
⑤ 上传后图片能显示
```

---

# 第 6 步：最终验收

## A. 双凭证

- [ ] `auth.js` 支持 `Authorization: Bearer`
- [ ] 也支持 cookie（网页不变）
- [ ] 401 返回 `code`（`TOKEN_EXPIRED` / `TOKEN_INVALID` / `USER_GONE`）
- [ ] 登录接口同时返回 cookie 和 token

## B. 分页

- [ ] 后端用游标分页，不是 `OFFSET`
- [ ] 多查一条判断 `hasMore`
- [ ] 游标 base64 编码
- [ ] 排序键是 `(created_at, id)` 组合
- [ ] 小程序滚到底自动加载
- [ ] 有 `loadingMore` 防重复触发
- [ ] 底部有"没有更多了"

## C. 表单

- [ ] `onInput` 用 `data-field` 区分
- [ ] `setData` 的回调里做后续计算
- [ ] 数量用 `type="number"`，单价用 `type="digit"`
- [ ] 日期用 `<picker mode="date">`
- [ ] 提交时 `submitting` 防重复

## D. 上传

- [ ] `wx.uploadFile` 带了 `Authorization`
- [ ] `name: 'file'` 和后端对得上
- [ ] `JSON.parse(res.data)`
- [ ] 有大小限制（2MB）
- [ ] `sizeType: ['compressed']`

## E. 五个墙

- [ ] 删过 `Authorization`，看到 401 循环
- [ ] 删过 `loadingMore`，看到重复请求和重复行
- [ ] 删过 `setData` 回调，看到总金额慢一步
- [ ] 用 `type="number"` 输不了小数点
- [ ] 不 `JSON.parse` 拿到 `undefined`

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"小程序不带 cookie"
- [ ] 我记下了 `setData` 是异步的

## 提交

```text
git add -A
git commit -m "第192节课: 双凭证认证 + 游标分页 + 小程序表单 + 上传 + 五个坑"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 所有接口 401 | `wx.request` 不带 cookie | 改用 `Authorization: Bearer` |
| 401 无限循环 | 重试没设 `retry: false` | 加上 |
| 列表加载不全 | 还在用全量接口 | 改成游标分页 |
| 滚到底发多个请求 | `onReachBottom` 连续触发 | 加 `loadingMore` 判断 |
| 列表出现重复行 | 同一 cursor 并发拉了两页 | 同上 |
| 总金额慢一步 | `setData` 异步 | 用回调 |
| 单价输不了小数点 | `type="number"` | 改 `type="digit"` |
| 日期选不了 | 用了 `<input type="date">` | 改 `<picker mode="date">` |
| 上传 404 | `name` 和后端不一致 | 都改成 `file` |
| 上传成功但图片不显示 | `res.data` 是字符串没解析 | `JSON.parse` |
| `Unexpected field` | 同上 | 同上 |
| `domain not in list` | 域名白名单 | 后台配，或开发时关校验 |

---

## 本节课要能说出口的一句话

> **小程序不带 cookie，所以登录必须换成 Bearer token；而 `wx.request` / `wx.uploadFile` / `setData` 三处都有"看起来一样其实不一样"的行为，每一个都会让你误以为代码写错了。**
