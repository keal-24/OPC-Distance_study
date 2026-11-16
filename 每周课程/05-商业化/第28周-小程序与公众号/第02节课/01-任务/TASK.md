# 第 191 节课：页面之间怎么走

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课做了三个页面的骨架，但只有一个能看。这一节把三个页面连起来，**而且要把"带参数"和"返回"这两件事做对。**
> 看起来很基础，但小程序的路由规则和网页差别很大，**尤其"页面栈只有 10 层"这一条。**

**建议用时**：105 分钟（4 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—1 步（55 分钟）一次，第 2—3 步（50 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 190 节（三页骨架 + request 封装）

---

# 第 0 步：先看路由的四种方式（20 分钟）

## 0.1 四种跳转

| 方法 | 效果 | 返回时 |
|---|---|---|
| `wx.navigateTo` | 压入新页面，有返回箭头 | 能返回上一页 |
| `wx.redirectTo` | 替换当前页面，**没有返回箭头** | 回不到刚才那页 |
| `wx.switchTab` | 切到 tabBar 页面 | tab 页之间不能带参数 |
| `wx.reLaunch` | 关掉所有页面，重开 | 回不到任何页 |

**外加一个 `wx.navigateBack`（返回上一页或上 N 页）。**

**常用的是前三个：**

```text
进入下一级        → navigateTo
从登录页进首页    → reLaunch（不要留"返回"回登录页）
切 tab            → switchTab
```

## 0.2 页面栈只有 10 层

**这是小程序和网页最大的差别之一。**

```text
页面 A → 页面 B → 页面 C → ... → 第 10 层
再 navigateTo → 报错
```

**报错：**

```text
navigateTo:fail webview count limit exceed
```

**这个限制在"链式跳转"的场景下很容易撞：**

```text
订单列表 → 订单详情 → 客户详情 → 订单列表（又一层）→ 订单详情...
```

**客户来回点十几下就卡住了。而且他不知道为什么点不动。**

**解法：**

```text
① 循环型的跳转（A→B→A→B），用 redirectTo
② 返回上一级，用 navigateBack
③ 跨级跳转（比如从详情回首页），用 switchTab 或 reLaunch
```

## 0.3 tabBar 页面不能带参数

**`switchTab` 不能传 `?id=xxx`。**

```js
// ❌ 不生效
wx.switchTab({ url: '/pages/orders/index?status=paid' });

// ✅ 用全局变量或者 storage
getApp().globalData.pendingFilter = 'paid';
wx.switchTab({ url: '/pages/orders/index' });
```

**然后在目标页的 `onShow` 里读出来。**

**为什么这样设计：** **tab 页面是长期存在的，"参数什么时候失效"没法定义。**

**用全局变量是"约定"——** **你放进去，目标页读出来，自己清掉。**

---

# 第 1 步：列表 → 详情（35 分钟）

## 1.1 列表里加跳转

**`pages/orders/index.js` 里已经有：**

```js
goDetail(e) {
  const { id } = e.currentTarget.dataset;
  wx.navigateTo({
    url: '/pages/order-detail/index?id=' + encodeURIComponent(id),
  });
},
```

**注意 `encodeURIComponent`。**

**你的 id 是 UUID，只有字母数字和 `-`，不编码也不会出问题。**

**但"习惯性编码"比"因为这次不会出问题所以不写"可靠。** **哪天换成带特殊字符的 id，你会感谢自己。**

## 1.2 详情页接收参数

**`pages/order-detail/index.js`：**

```js
const { request } = require('../../utils/request');

const STATUS_TEXT = {
  pending: '待支付',
  paid: '已支付',
  refunding: '退款中',
  refunded: '已退款',
  expired: '已过期',
  canceled: '已取消',
};

function money(cents) {
  const n = Number(cents) || 0;
  const yuan = Math.floor(Math.abs(n) / 100);
  const fen = String(Math.abs(n) % 100).padStart(2, '0');
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + grouped + '.' + fen;
}

Page({
  data: {
    id: '',
    loading: true,
    error: '',
    order: null,
    refunding: false,
  },

  onLoad(query) {
    const id = query.id ? decodeURIComponent(query.id) : '';

    if (!id) {
      this.setData({ loading: false, error: '缺少订单 ID' });
      return;
    }

    this._refundKey = 'mp-refund-' + id + '-' + Date.now();

    this.setData({ id });
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });

    try {
      const o = await request({ path: '/api/orders/' + encodeURIComponent(this.data.id) });

      this.setData({
        loading: false,
        order: {
          ...o,
          amount_text: money(o.amount_cents),
          paid_text_amount: money(o.paid_cents || 0),
          refunded_text: money(o.refunded_cents || 0),
          unit_price_text: money(o.unit_price_cents),
          status_text: STATUS_TEXT[o.status] || o.status,
          created_text: String(o.created_at || '').slice(0, 19).replace('T', ' '),
          paid_time: o.paid_at ? String(o.paid_at).slice(0, 19).replace('T', ' ') : '',
        },
      });
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' });
    }
  },

  onRefund() {
    wx.showModal({
      title: '确认退款',
      content: '这笔 ¥' + this.data.order.amount_text + ' 会退回原支付账户，确定吗？',
      confirmText: '确认退款',
      confirmColor: '#c1121f',
      success: (res) => {
        if (res.confirm) this.doRefund();
      },
    });
  },

  async doRefund() {
    this.setData({ refunding: true });

    try {
      await request({
        path: '/api/orders/' + encodeURIComponent(this.data.id) + '/refund',
        method: 'POST',
        data: { reason: '小程序端申请', requestId: this._refundKey },
      });

      wx.showToast({ title: '退款已提交', icon: 'success' });
      this.load();
    } catch (err) {
      wx.showToast({ title: err.message || '退款失败', icon: 'none' });
    } finally {
      this.setData({ refunding: false });
    }
  },
});
```

**`pages/order-detail/index.wxml`：**

```xml
<view class="page">
  <view class="loading" wx:if="{{loading}}">加载中……</view>

  <view class="error" wx:elif="{{error}}">
    <view class="error__text">{{error}}</view>
    <button class="btn btn--primary btn--sm" bindtap="load">重试</button>
  </view>

  <block wx:elif="{{order}}">
    <view class="card">
      <view class="card__head">
        <text class="card__title">{{order.order_no}}</text>
        <text class="badge badge--{{order.status}}">{{order.status_text}}</text>
      </view>

      <view class="row">
        <text class="row__label">客户</text>
        <text class="row__value">{{order.customer_name}}</text>
      </view>
      <view class="row">
        <text class="row__label">下单日期</text>
        <text class="row__value">{{order.order_date}}</text>
      </view>
      <view class="row">
        <text class="row__label">数量</text>
        <text class="row__value">{{order.quantity}}</text>
      </view>
      <view class="row">
        <text class="row__label">单价</text>
        <text class="row__value">¥{{order.unit_price_text}}</text>
      </view>
      <view class="row row--total">
        <text class="row__label">总金额</text>
        <text class="row__value row__value--big">¥{{order.amount_text}}</text>
      </view>
    </view>

    <view class="card" wx:if="{{order.paid_cents > 0}}">
      <view class="row">
        <text class="row__label">已付</text>
        <text class="row__value">¥{{order.paid_text_amount}}</text>
      </view>
      <view class="row" wx:if="{{order.refunded_cents > 0}}">
        <text class="row__label">已退</text>
        <text class="row__value">¥{{order.refunded_text}}</text>
      </view>
      <view class="row" wx:if="{{order.paid_time}}">
        <text class="row__label">支付时间</text>
        <text class="row__value">{{order.paid_time}}</text>
      </view>
    </view>

    <view class="card">
      <view class="row">
        <text class="row__label">创建时间</text>
        <text class="row__value">{{order.created_text}}</text>
      </view>
    </view>

    <view class="actions" wx:if="{{order.status === 'paid' || order.status === 'refunding'}}">
      <button class="btn btn--ghost btn--block" bindtap="onRefund" loading="{{refunding}}" disabled="{{refunding}}">
        {{refunding ? '处理中' : '申请退款'}}
      </button>
    </view>
  </block>
</view>
```

## 1.3 四处要讲清

### `wx:elif` 和 `<block>`

```xml
<view wx:if="{{loading}}">…</view>
<view wx:elif="{{error}}">…</view>
<block wx:elif="{{order}}">…</block>
```

**`wx:if / wx:elif / wx:else` 是条件渲染，和 JS 的 if/else 一样。**

**`<block>` 是"逻辑包装"——它本身不渲染，只给一组元素套一个条件。**

**为什么用 `<block>` 而不用 `<view>`：**

**`<view>` 会渲染成一个真实的元素，带 `display: block`。** **如果里面已经有多个卡片，再套一层 `<view>` 会多一层，影响 CSS 布局。**

**`<block>` 在渲染结果里什么都不留。** **这是小程序特有的"逻辑标签"。**

### 金额全部在 JS 里算好

**注意 `order` 对象里有 `amount_text`、`unit_price_text`。**

**为什么不在 WXML 里算：**

**WXML 只支持极简单的表达式（`{{a + b}}`），不支持函数调用。**

```xml
<!-- ❌ 不支持 -->
<text>{{money(order.amount_cents)}}</text>

<!-- ✅ 提前算好 -->
<text>{{order.amount_text}}</text>
```

**这个限制会改变你的写法习惯：** **"能算的都在 JS 里算完"。**

**好处：** **逻辑集中在 JS 里，WXML 只负责显示，好调试。**

### `wx.showModal` 是原生确认框

**比自制弹窗好在：**

```text
① 样式跟微信一致
② 客户熟悉
③ 不用写 CSS，不用管层级
```

**坏处：**

```text
① 内容只支持纯文本（不能有链接、加粗）
② 按钮只有两个
```

**`confirmColor: '#c1121f'` —— 危险操作的确认按钮用红色，这是约定。**

**不加的话默认是绿色，客户会以为"确认"是安全操作。**

### 幂等键在 `onLoad` 生成，整页复用

```js
onLoad(query) {
  this._refundKey = 'mp-refund-' + id + '-' + Date.now();
}
```

**为什么不在每次点击时生成：**

```text
每次点击生成  → 客户手抖点两次 = 两个 key = 退两次
页面加载生成  → 手抖点两次 = 同一个 key = 服务端幂等生效
```

**为什么带 `Date.now()`：** **因为"关掉页面重新进来"应该是新的一次退款意图。**

**这个粒度是对的吗？**

**大部分情况对。** **极端情况下（客户关页面重进、再退一次），会真的再退一次——** **但那本来就是客户的操作意图。**

## 1.4 列表页"返回时刷新"

**场景：**

```text
列表 → 详情 → 点退款 → 返回列表
列表上还显示"已支付"
```

**解法：`onShow` + 标记。**

```js
onShow() {
  if (this._needsRefresh) {
    this._needsRefresh = false;
    this.load(true);
  }
},

goDetail(e) {
  const { id } = e.currentTarget.dataset;
  this._needsRefresh = true;
  wx.navigateTo({ url: '/pages/order-detail/index?id=' + encodeURIComponent(id) });
},

onPageScroll(e) {
  this._scrollTop = e.scrollTop;
},
```

**`load(keepScroll)` 里恢复位置。**

**注意这是列表页的 `load`（第 190 节写的那个），不是上面详情页的。**

**把 `pages/orders/index.js` 里的 `load` 整个换掉：**

```js
async load(keepScroll = false) {
  if (this._loading) return;

  const scrollTop = keepScroll ? this._scrollTop || 0 : 0;

  this._loading = true;
  this.setData({ loading: true, error: '' });

  try {
    await getApp().globalData.ready;

    const rows = await request({ path: '/api/orders?page=1&limit=20' });

    const orders = (Array.isArray(rows) ? rows : rows.items || []).map((o) => ({
      id: o.id,
      order_no: o.order_no,
      customer_name: o.customer_name,
      order_date: String(o.order_date || '').slice(0, 10),
      amount: (o.amount_cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      status: o.status,
      status_text: STATUS_TEXT[o.status] || o.status,
    }));

    this.setData({ loading: false, orders });
  } catch (err) {
    this.setData({ loading: false, error: err.message || '加载失败' });
  } finally {
    this._loading = false;
  }

  if (keepScroll && scrollTop > 0) {
    wx.pageScrollTo({ scrollTop, duration: 0 });
  }
},
```

**`wx.pageScrollTo` 必须放在 `setData` 之后。**

**不放在后面的话，页面还没渲染出新列表，`pageScrollTo` 滚到的是"旧内容的高度"——** **如果新列表比旧的短，它会滚到一个不存在的位置，然后弹回顶部。**

**这个现象和"完全没恢复"很像，但原因完全不同。** **遇到"恢复位置偶尔失灵"，先看这一行的位置。**

**`onPageScroll` 每次滚动都触发，只存一个数字，没有性能问题。**

**但不要在里面 `setData`。** **那会让每次滚动都触发一次视图更新，手机直接卡。**

## 1.5 自检点

**五个检查：**

```text
① 列表点一条 → 详情显示正确的订单号
② 详情左上角"‹" → 回到列表
③ 列表滚到第 10 条 → 点进去 → 返回，还停在第 10 条附近
④ 金额格式是 ¥1,299.00（两位小数 + 千分位）
⑤ 退款按钮出现过，点了会弹确认框
```

**第 ③ 条最容易失败。**

**如果失败，检查：`onShow` 里是不是调了不带参数的 `load()`（那会跳回顶部）。**

---

# 第 2 步："我的"页面（30 分钟）

## 2.1 `pages/mine/index.js`

```js
const { request, login } = require('../../utils/request');

Page({
  data: {
    loading: true,
    me: null,
    error: '',
    stats: { orders: 0, pending: 0 },
  },

  onShow() {
    const elapsed = Date.now() - (this._lastLoad || 0);
    if (elapsed < 60000 && this.data.me) return;

    this._lastLoad = Date.now();
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });

    try {
      let me;

      try {
        me = await request({ path: '/api/me' });
      } catch (err) {
        if (err.status === 401) {
          await login();
          me = await request({ path: '/api/me' });
        } else {
          throw err;
        }
      }

      this.setData({
        loading: false,
        me: {
          email: me.user.email,
          role: me.user.role,
          roleText: me.user.role === 'owner' ? '创建者' : me.user.role === 'admin' ? '管理员' : '成员',
          tenantName: me.tenant.name,
          plan: me.tenant.plan,
        },
      });

      this.loadStats();
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' });
    }
  },

  async loadStats() {
    try {
      const rows = await request({ path: '/api/orders' });
      const list = Array.isArray(rows) ? rows : rows.items || [];

      this.setData({
        stats: {
          orders: list.length,
          pending: list.filter((o) => o.status === 'pending').length,
        },
      });
    } catch (err) {
      // 统计失败不影响主内容
    }
  },

  copyEmail() {
    if (!this.data.me) return;
    wx.setClipboardData({
      data: this.data.me.email,
      success: () => wx.showToast({ title: '已复制', icon: 'none' }),
    });
  },

  openWeb() {
    wx.showModal({
      title: '打开网页版',
      content: '小程序只提供常用功能。导入数据、导出报表、配置集成请用网页版。',
      confirmText: '复制网址',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: 'https://yoursite.com',
            success: () => wx.showToast({ title: '已复制，去浏览器打开', icon: 'none' }),
          });
        }
      },
    });
  },
});
```

**`pages/mine/index.wxml`：**

```xml
<view class="page">
  <view class="loading" wx:if="{{loading}}">加载中……</view>

  <view class="error" wx:elif="{{error}}">
    <view class="error__text">{{error}}</view>
    <button class="btn btn--primary btn--sm" bindtap="load">重试</button>
  </view>

  <block wx:else>
    <view class="card profile">
      <view class="profile__name">{{me.tenantName}}</view>
      <view class="profile__email" bindtap="copyEmail">{{me.email}}</view>
      <view class="profile__tags">
        <text class="tag">{{me.roleText}}</text>
        <text class="tag">{{me.plan}}</text>
      </view>
    </view>

    <view class="card stats">
      <view class="stat">
        <view class="stat__num">{{stats.orders}}</view>
        <view class="stat__label">订单总数</view>
      </view>
      <view class="stat">
        <view class="stat__num">{{stats.pending}}</view>
        <view class="stat__label">待支付</view>
      </view>
    </view>

    <view class="card">
      <view class="cell" bindtap="openWeb">
        <text class="cell__label">去网页版</text>
        <text class="cell__arrow">›</text>
      </view>
    </view>
  </block>
</view>
```

## 2.2 三个设计点

### `onShow` + 60 秒节流

```js
onShow() {
  const elapsed = Date.now() - (this._lastLoad || 0);
  if (elapsed < 60000 && this.data.me) return;
  this._lastLoad = Date.now();
  this.load();
}
```

**为什么需要节流：**

**客户可能在两个 tab 之间来回切十次。** **每次都请求 `/api/me` 和 `/api/orders`，就是 20 次请求。**

**60 秒内复用已有数据，够用。**

**注意 `&& this.data.me`：** **第一次进入时 `me` 是 `null`，必须请求。**

### 统计失败不阻塞主内容

```js
this.loadStats();      // 注意没有 await
```

**统计是"次要信息"，它挂了不该让整个页面变成错误页。**

**这个判断标准：** **"如果这块挂了，页面还能用吗？"**

**能，就不要 `await` 它，也不要让它进主 `try`。**

### 不能直接打开外部网页

**小程序里 `wx.navigateTo` 只能跳小程序内页面。**

**`web-view` 组件可以打开网页，但要求：**

```text
① 域名在"业务域名"白名单里
② 只对企业主体开放
③ 个人主体的小程序完全不能用 web-view
```

**所以"引导客户去网页版"最实用的做法是：复制链接 + 告诉他去浏览器。**

**看起来很土，但它是唯一在所有情况下都能用的方案。**

**如果你的小程序是企业主体，可以用 `web-view` 直接打开。** **这一节先不依赖它。**

## 2.3 自检点

**四个检查：**

```text
① 切到"我的"，能看到租户名和邮箱
② 点邮箱，弹出"已复制"
③ 在"订单"和"我的"之间来回切 5 次，看控制台请求次数（应该是 1 次）
④ 点"去网页版"，弹出说明，确认后复制链接
```

**第 ③ 条要用 Network 面板数请求。**

**如果切 5 次发了 5 次请求，说明节流没生效。**

---

# 第 3 步：撞一次页面栈（20 分钟）

## 3.1 造一个循环跳转

**在详情页加一个按钮，跳回列表：**

```js
goList() {
  wx.navigateTo({ url: '/pages/orders/index' });
}
```

**注意用的是 `navigateTo`。**

**然后手动来回点：**

```text
列表 → 详情 → 查看同类 → 列表 → 详情 → 查看同类 → ...
```

**点 10 次之后，控制台报：**

```text
navigateTo:fail webview count limit exceed
```

**页面不动了。**

**客户会以为"卡死了"，然后杀掉小程序。**

## 3.2 修法：看"返回应该回到哪"

**两种情况：**

**情况一：这是"回到列表"（横向跳转）**

```js
goList() {
  wx.redirectTo({ url: '/pages/orders/index' });
}
```

**`redirectTo` 替换当前页，栈深度不增加。**

**代价：客户按返回，回不到详情页了。** **这在"详情 → 列表"这种场景下可以接受。**

**情况二：这是"退回上一页"**

```js
goList() {
  wx.navigateBack();
}
```

**栈深度减少 1。**

**什么时候用哪个：**

```text
从详情回到"刚才那个列表"  → navigateBack
从详情跳到"另一个筛选的列表" → redirectTo
```

## 3.3 一个判断表

**跳转前问一句：**

```text
这个跳转，客户按"返回"应该回到哪？
  回到刚才那页      → navigateTo
  回到更上一层      → redirectTo
  回到 tab 首页     → switchTab
  回到小程序开始    → reLaunch
  就是这个意思，退回去 → navigateBack
```

**"返回应该回到哪"是唯一需要想的问题。**

**答对了，方法就定了。**

## 3.4 自检点

**三个检查：**

```text
① 修好之后来回点 20 次，不报错
② 每次"返回"都回到预期的地方
③ 用 redirectTo 之后，按返回确实回不到详情页
```

---

# 第 4 步：最终验收

## A. 跳转

- [ ] 列表 → 详情用 `navigateTo`
- [ ] 详情 → 返回用 `navigateBack`
- [ ] tab 之间用 `switchTab`
- [ ] 参数都做了 `encodeURIComponent`
- [ ] 我知道页面栈只有 10 层

## B. 详情页

- [ ] `onLoad(query)` 能拿到 `id`
- [ ] 有 loading / error / 正常三态
- [ ] 金额格式是 `¥1,299.00`
- [ ] 退款按钮只在 `paid` / `refunding` 时显示

## C. 退款

- [ ] 有 `wx.showModal` 二次确认
- [ ] 确认按钮是红色
- [ ] 幂等键在 `onLoad` 生成，整页复用
- [ ] 请求中按钮有 loading 且禁用

## D. 我的

- [ ] 显示邮箱、租户名、角色
- [ ] `onShow` 有 60 秒节流
- [ ] 统计失败不阻塞主内容
- [ ] 有"去网页版"的引导

## E. 页面栈

- [ ] 我撞过 `webview count limit exceed`
- [ ] 我用 `redirectTo` 修好了
- [ ] 我能说出四种跳转分别用在哪

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"返回应该回到哪"这个判断方法
- [ ] 我记下了 `wx:elif` 和 `<block>`

## 提交

```text
git add -A
git commit -m "第191节课: 三页互通 + 详情动作 + 我的页 + 页面栈限制"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `navigateTo:fail webview count limit exceed` | 页面栈满 10 层 | 用 `redirectTo` 或 `navigateBack` |
| `switchTab` 带参数不生效 | tab 页不支持参数 | 用 `globalData` 或 storage |
| 详情页拿不到 id | `onLoad` 参数名和 URL 不一致 | 检查 `query.id` |
| 点进去 id 是 `undefined` | `dataset` 命名转换 | `data-order-id` → `dataset.orderId` |
| 返回后列表滚到顶部 | `onShow` 里调了不带参数的 `load()` | 传 `true` 恢复位置 |
| `wx.navigateBack` 没反应 | 已经是第一页 | 判断 `getCurrentPages().length` |
| 退款点了两次退了两笔 | 幂等键带了 `Date.now()` | 改成 `onLoad` 生成一次 |
| `web-view` 打不开 | 域名没加"业务域名"，或非企业主体 | 后台配置 |
| 金额显示 `1299` 不是 `1299.00` | 没 `toFixed(2)` | 用 `money()` |
| 切 tab 请求太频繁 | 没有节流 | 加 60 秒时间窗 |

---

## 本节课要能说出口的一句话

> **跳转方式的选择只有一个判据：客户按"返回"应该回到哪；答对了方法就定了，答不对就会出现"卡在第 10 层"或者"返回回到了不该回的地方"。**
