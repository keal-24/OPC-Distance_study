# 第 190 节课：该不该做小程序

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课不写业务代码。它解决一个更要紧的问题：**客户说"做个小程序"，你该点头还是该劝住他。**
> 答错了两个方向都亏：**做多了白花两周，做少了丢单。**

**建议用时**：165 分钟（5 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—1 步（60 分钟）一次，第 2—4 步（105 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 189 节（五个页面能跑，检查清单过了一遍）

---

# 第 0 步：先算清三笔账（25 分钟）

## 0.1 时间账

**同一个功能，三种形态的开发成本：**

| | 网页（已有） | PWA（网页 + 几个 meta） | 小程序 |
|---|---|---|---|
| 改造成本 | — | 1—2 小时 | **3—5 天** |
| 技术栈 | 你熟的 | 同网页 | WXML/WXSS/JS，要学 |
| 每次需求变更 | 改完就上线 | 改完就上线 | **改完要提审，等 1—7 天** |
| 首次上线 | 已有 | 加 3 个文件 | **注册主体 + 备案 + 审核** |

**注意第三行。**

**小程序最贵的不是开发，是"每次改都要等审核"。**

```text
客户说"这个按钮颜色改一下"
网页：改完 5 分钟上线
小程序：改完提交，等 2 天，期间客户还是看到旧版
```

**这个等待在"刚上线、还在调整"的阶段是致命的。**

**你会变成"客户催你，你催审核，审核不理人"。**

## 0.2 资质账

**小程序要什么：**

```text
① 企业主体（个体工商户也可以，个人主体功能受限）
② 小程序备案（2023 年 9 月起强制，要 1—20 个工作日）
③ 某些类目要额外资质（医疗、教育、金融、电商……）
④ 微信支付要单独的商户号（要营业执照 + 对公账户）
```

**网页要什么：**

```text
① 域名（几十块一年）
② ICP 备案（要 7—20 个工作日，但一次搞定）
③ HTTPS 证书（免费）
```

**关键差别：**

```text
网页：备案一次，之后随便改
小程序：备案一次，但每次发版要审核
```

**如果你的客户还没注册公司（很多个体户、工作室），** **小程序这条路直接堵死一半。**

## 0.3 触达账

**这是唯一"小程序明显赢"的地方。**

| | 网页 | 小程序 | 公众号 |
|---|---|---|---|
| 分享到微信群 | 一个链接（灰底，点击率低） | **一张卡片（有图有标题）** | 一篇文章 |
| 主动推消息 | 不能 | **订阅消息（一次授权发一条）** | 模板消息（有严格限制） |
| 加到手机桌面 | 可以（PWA） | 不能 | 不能 |
| 扫码打开 | 可以 | **可以（原生体验）** | 可以 |

**看第一行。**

**微信群里发一个链接 vs 发一张卡片，点击率差 3—5 倍。**

**这是唯一值得为小程序多花两周的理由。**

---

# 第 1 步：把需求翻译成判断（35 分钟）

## 1.1 客户的五种说法

**客户不会说"我要一个小程序"，他会说下面某一句。**

**每句话背后是一个真实需求：**

| 客户说 | 真实需求 | 该做什么 |
|---|---|---|
| "能不能在手机上用？" | 移动端可用 | **PWA**（第 27 周已经做完了） |
| "能不能扫码打开？" | 扫码入口 | **PWA + 二维码**（指向网页 URL） |
| "能不能发到群里给同事看？" | 分享传播 | **小程序**（卡片点击率高） |
| "能不能给我们发提醒？" | 主动触达 | **小程序订阅消息** 或 公众号 |
| "能不能直接在微信里付款？" | 支付 | **PWA + JSAPI 支付**（不用小程序） |
| "别人家都有小程序" | 攀比 | **劝住**（除非有以上真实需求） |

**最后一行最常见，也最该劝。**

## 1.2 一个必须问的问题

**在答应之前，只问一句：**

> **"你希望客户怎么找到这个系统？"**

**三种答案，三种方案：**

```text
"我发链接给他"           → PWA
"他扫我们门口的码"        → PWA + 二维码
"他在群里看到别人发的"     → 小程序
"我要主动发消息提醒他"     → 小程序 / 公众号
```

**这一个问题能挡掉 70% 的"其实不需要小程序"。**

**为什么这句话有效：** **因为它把"我要小程序"这个技术选择，翻译回了"客户从哪来"这个业务问题。**

**客户一旦说出"我发链接给他"，他自己就能理解"那网页就够了"。**

## 1.3 一张判断表

**写进你的接活流程里（`docs/wechat-decision.md`）：**

```markdown
# 要不要做小程序

## 三个问题

1. 客户怎么找到这个系统？
   □ 我发链接 / 发二维码       → 不用小程序
   □ 群里互相转发              → 需要
   □ 我要主动推消息            → 需要

2. 有没有企业主体 + 能备案？
   □ 有                        → 可以做
   □ 没有                      → 只能 PWA

3. 上线后还会频繁改吗？
   □ 会（前三个月）            → 先 PWA，稳定后再做小程序
   □ 不会                      → 直接做小程序

## 结论

- 三个问题任何一个指向"不用"，就先做 PWA
- 全部指向"需要"，才做小程序

## 成本对比（给对方看的）

| | PWA | 小程序 |
|---|---|---|
| 改造 | 1—2 小时 | 3—5 天 |
| 备案 | 已有 | 7—20 工作日 |
| 每次改版 | 立即 | 等 1—7 天审核 |
| 分享卡片 | 链接 | 卡片（点击率高 3—5 倍） |
| 主动推消息 | 不能 | 能 |
```

## 1.4 自检点

**你现在的系统属于哪种情况？**

**用上面的表过一遍，把答案写在笔记里。**

**如果结论是"不用小程序"，那你这一周还是要学——** **因为客户迟早会提，你要能讲清为什么不做。**

**而且如果你手上就有企业主体（哪怕是自己的个体户），这一周可以真跑通一遍。**

---

# 第 2 步：做一个 3 页的骨架（50 分钟）

**不管最后做不做，这一节的东西你要会。**

**因为：**

```text
① "做小程序要多久"你要能估
② 客户坚持要做的时候，你要能快速交付
③ 小程序的技术栈两天就够，不学反而被动
```

## 2.1 准备环境

**三步：**

```text
① 下载微信开发者工具（稳定版）
   https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

② 注册小程序账号（用你个人的也行，先跑通）
   https://mp.weixin.qq.com/wxopen/waregister
   记住 AppID

③ 用开发者工具"导入项目"，选你的目录，填 AppID
```

**如果没有 AppID，可以选"测试号"——** **能调通大部分功能，只是不能发布。**

**自检点：** **开发者工具打开后，左边是模拟器，中间是代码，右边是调试器。**

**能看到模拟器里显示 "Hello World" 就对了。**

## 2.2 建目录

**在 `saas-lab` 下新建 `miniprogram/`：**

```text
miniprogram/
├── app.js
├── app.json
├── app.wxss
├── project.config.json
├── sitemap.json
└── pages/
    ├── orders/
    │   ├── index.js
    │   ├── index.json
    │   ├── index.wxml
    │   └── index.wxss
    ├── order-detail/
    └── mine/
```

**为什么放在 `saas-lab/miniprogram/` 而不是单独的仓库：**

**因为它和你的后端一起演进。** **接口改字段的时候，两边要一起改。**

**分开仓库，你一定会忘记同步。**

## 2.3 `app.json` —— 全局配置

```json
{
  "pages": [
    "pages/orders/index",
    "pages/order-detail/index",
    "pages/mine/index"
  ],
  "window": {
    "backgroundTextStyle": "dark",
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTitleText": "业务助手",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#f7f8fa"
  },
  "tabBar": {
    "color": "#8b919c",
    "selectedColor": "#1f6feb",
    "backgroundColor": "#ffffff",
    "borderStyle": "white",
    "list": [
      {
        "pagePath": "pages/orders/index",
        "text": "订单"
      },
      {
        "pagePath": "pages/mine/index",
        "text": "我的"
      }
    ]
  },
  "style": "v2",
  "sitemapLocation": "sitemap.json",
  "lazyCodeLoading": "requiredComponents"
}
```

## 2.4 四处关键

### `pages` 数组的第一项是首页

```json
"pages": ["pages/orders/index", ...]
```

**第一项就是启动页。** **顺序很重要，不是随便排的。**

### `tabBar` 最多 5 项，最少 2 项

**你现在只有两个（订单、我的），够用。**

**注意：**

```text
① tabBar 的页面不能有返回按钮（它是导航终点）
② tabBar 的图标是可选，但"只有文字"看起来有点空
③ tabBar 的页面必须在 pages 数组里
```

**第二条：** **图标要两张（普通 + 选中），各 81×81px PNG。**

**这一节先不配图标，** **光文字能用，只是不精致。**

### `lazyCodeLoading: "requiredComponents"`

**按需注入组件，减少启动时间。**

**这是官方推荐的优化项，一行配置，没坏处。**

### `style: "v2"`

**启用新版组件样式。**

**不加的话，按钮、输入框用的是 2018 年的旧样式，** **圆角和颜色都跟你网页版不一致。**

## 2.5 三个页面

**`pages/orders/index.wxml`：**

```xml
<view class="page">
  <view class="list">
    <view class="list-item" wx:for="{{orders}}" wx:key="id" bindtap="goDetail" data-id="{{item.id}}">
      <view class="list-item__main">
        <view class="list-item__title">{{item.order_no}}</view>
        <view class="list-item__meta">{{item.customer_name}} · {{item.order_date}}</view>
      </view>
      <view class="list-item__side">
        <view class="list-item__amount">¥{{item.amount}}</view>
        <view class="badge badge--{{item.status}}">{{item.status_text}}</view>
      </view>
    </view>
  </view>

  <view class="empty" wx:if="{{!loading && orders.length === 0}}">
    <view class="empty__title">还没有订单</view>
    <view class="empty__text">去网页版导入第一批数据</view>
  </view>

  <view class="loading" wx:if="{{loading}}">加载中……</view>
</view>
```

**`pages/orders/index.js`：**

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

Page({
  data: {
    loading: true,
    orders: [],
    error: '',
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true, error: '' });

    try {
      const rows = await request({ path: '/api/orders' });

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
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/order-detail/index?id=' + id });
  },
});
```

**`pages/orders/index.wxss`：**

```css
@import '../../app.wxss';

.page {
  padding: 24rpx 32rpx;
  min-height: 100vh;
  box-sizing: border-box;
}

.list {
  background: #fff;
  border-radius: 24rpx;
  overflow: hidden;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #e3e5e9;
}

.list-item:last-child {
  border-bottom: 0;
}

.list-item:active {
  background: #f7f8fa;
}

.list-item__main {
  flex: 1;
  min-width: 0;
}

.list-item__title {
  font-size: 32rpx;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-item__meta {
  margin-top: 4rpx;
  font-size: 26rpx;
  color: #8b919c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-item__side {
  text-align: right;
  flex-shrink: 0;
}

.list-item__amount {
  font-size: 34rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.badge {
  display: inline-block;
  margin-top: 4rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.badge--pending { background: #fff4e5; color: #b45309; }
.badge--paid { background: #e7f6ec; color: #0a7b34; }
.badge--refunded { background: #eef0f3; color: #8b919c; }

.empty,
.loading {
  padding: 120rpx 32rpx;
  text-align: center;
  color: #8b919c;
}

.empty__title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 12rpx;
}

.empty__text {
  font-size: 26rpx;
}
```

## 2.6 五个必须知道的差异

**这是小程序和你熟悉的网页最不一样的五处。**

### `rpx` 不是 `px`

```css
padding: 24rpx 32rpx;     /* 不是 24px 32px */
```

**`rpx` 是"响应式像素"。**

```text
750rpx = 屏幕宽度（任何手机）
1rpx  = 屏幕宽度 / 750
```

**在 iPhone 6/7/8（375px 宽）上，`1rpx = 0.5px`，所以 `32rpx = 16px`。**

**在更大的手机上，`32rpx` 会跟着变大。**

**好处：** **同一套样式，在所有手机上比例一致。**

**换算规则（从左到右）：**

```text
设计稿 750 宽  → 直接用 rpx（通常是设计师给的尺寸）
设计稿 375 宽  → px × 2 = rpx
你自己想 16px  → 写 32rpx
```

**这一节所有 `rpx` 都是"设计稿 750 宽"的值。**

### `view` 不是 `div`

```xml
<view>内容</view>          <!-- 等价 div -->
<text>文字</text>          <!-- 等价 span -->
<image src="..." />        <!-- 等价 img -->
<scroll-view>...</scroll-view>  <!-- 可滚动容器 -->
```

**为什么不用 HTML 标签：**

**因为小程序不是浏览器，它自己实现了一套渲染（逻辑层 + 视图层分离）。**

**只有这些内置组件能用。** **`<div>` 会渲染成一个空元素，什么都不显示。**

### `bindtap` 不是 `onclick`

**WXML 里这么写：**

```xml
<view class="list__item" bindtap="goDetail" data-id="{{item.id}}">
  <text>{{item.order_no}}</text>
</view>
```

**JS 里这么接：**

```js
goDetail(e) {
  const { id } = e.currentTarget.dataset;   // 从 data-* 里取
  if (!id) return;
  wx.navigateTo({ url: '/pages/order-detail/index?id=' + encodeURIComponent(id) });
},
```

**三个关键字都不能写错：**

```text
bindtap        不是 onclick、不是 bindTap（大小写错就是不响应）
e.currentTarget 不是 e.target
dataset        不是 data
```

**`e.currentTarget` 和 `e.target` 的区别在小程序里比网页更明显：**

```text
e.currentTarget  → 绑定 bindtap 的那个元素（<view>）—— 一定有 data-id
e.target         → 实际被点到的元素（里面的 <text>）—— 没有 data-id
```

**用 `e.target.dataset.id` 会拿到 `undefined`，而且只有点到文字上时才出错——点到 view 的空白处又是对的。** **这种"有时对有时错"的 bug 最难查。**

**注意 `dataset` 的命名转换：**

```xml
data-order-id="123"    →  e.currentTarget.dataset.orderId
data-id="123"          →  e.currentTarget.dataset.id
```

**中划线转驼峰。** **这个转换规则不记住，你会拿到 `undefined` 然后查半天。**

### `setData` 不是直接赋值

```js
// ❌ 页面不会更新
this.data.orders = rows;

// ✅
this.setData({ orders: rows });
```

**`setData` 是"逻辑层 → 视图层"的通信。**

**直接改 `this.data` 只在逻辑层生效，视图层不知道。**

**而且 `setData` 有性能代价（要跨线程传数据）。**

**优化：只传变化的部分。**

```js
// ❌ 每次都传整个数组
this.setData({ orders: newOrders });

// ✅ 只改一项
this.setData({ ['orders[' + index + '].status']: 'paid' });
```

**这个写法（`['orders[0].status']`）是微信特有的，** **意思是"只更新这个路径"，不用传整个数组。**

### `wx:for` 不是 `v-for`

```xml
<view wx:for="{{orders}}" wx:key="id">{{item.order_no}}</view>
```

**`wx:key` 必须有。**

**没有的话，列表更新时小程序会"猜"哪些元素是新的，** **猜错了就会出现"数据串行"（第 3 条显示了第 5 条的数据）。**

**这个 bug 极难查。** **`wx:key` 写一个唯一字段（通常是 `id`）。**

## 2.7 自检点

**在开发者工具的模拟器里，你应该看到：**

```text
顶部白色导航栏，标题"业务助手"
底部两个 tab：订单 / 我的
中间：加载中……（因为接口还没通）
```

**然后会变成：**

```text
一个 toast："加载失败"
空状态："还没有订单"
```

**为什么"加载失败"是正常的：**

**因为 `utils/request.js` 还没有，或者 `request` 还没配域名。**

**下一步就写它。**

---

# 第 3 步：写 request 封装（30 分钟）

**小程序的 `wx.request` 和 `fetch` 差异很大。**

## 3.1 `utils/request.js`

```js
const BASE_URL = 'http://localhost:3000';

function request(options) {
  const { path, method = 'GET', data, retry = true } = options;

  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(wx.getStorageSync('token')
          ? { Authorization: 'Bearer ' + wx.getStorageSync('token') }
          : {}),
      },
      timeout: 15000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        if (res.statusCode === 401 && retry) {
          wx.removeStorageSync('token');
          login()
            .then(() => request({ ...options, retry: false }))
            .then(resolve)
            .catch(reject);
          return;
        }

        const message =
          (res.data && res.data.error) ||
          (res.statusCode === 403 ? '没有访问权限' : '请求失败（' + res.statusCode + '）');

        reject(Object.assign(new Error(message), { status: res.statusCode, body: res.data }));
      },
      fail(err) {
        const msg = err.errMsg || '';

        let message = '网络异常，请检查网络';

        if (msg.includes('url not in domain list')) {
          message = '接口域名没有配置（开发者需要在小程序后台加白名单）';
        } else if (msg.includes('timeout')) {
          message = '请求超时，网络可能不太好';
        }

        reject(Object.assign(new Error(message), { isNetwork: true, raw: msg }));
      },
    });
  });
}

async function login() {
  const { code } = await new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });

  const res = await request({
    path: '/api/auth/wechat',
    method: 'POST',
    data: { code },
    retry: false,
  });

  if (res.token) {
    wx.setStorageSync('token', res.token);
  }

  return res;
}

module.exports = { request, login, BASE_URL };
```

**注意这个 `login` 是最简版，它假设"登录一定成功"。**

**第 193 节会把它换掉。** **因为真实情况是：第一次打开小程序的人还没绑定账号，服务端会返回 `needBind: true` 而不是 token。**

**这一节先用这一版，是因为第 193 节之前你的后端还没有 `wechat_users` 表，登录接口只会返回一个临时 token。** **别在这里提前写"绑定失败要跳转"的逻辑——** **你还没有那个页面，写出来只能注释掉，注释掉的东西三个月后会变成"看起来能用其实不能用"的代码。**

## 3.2 四处关键

### 401 自动重登录

```js
if (res.statusCode === 401 && retry) {
  wx.removeStorageSync('token');
  login()
    .then(() => request({ ...options, retry: false }))
    .then(resolve)
    .catch(reject);
}
```

**逻辑：**

```text
① 收到 401 → 清掉本地 token
② 调 wx.login 拿 code → 换新 token
③ 用新 token 重试原请求（retry: false，防止无限循环）
```

**这段现在有个隐患，第 193 节会处理：** **如果 `login()` 最终抛错（比如服务端说"需要绑定"），`.catch(reject)` 会把那个错误丢给原请求的调用方——** **原请求明明不是 401 的问题，却收到了一个来自登录的错误。** **第 193 节改成用 `code: 'NEED_BIND'` 明确区分之后，页面就能正确识别它。**

**`retry: false` 是关键。**

**不加的话，如果换 token 之后还是 401，会无限循环，把服务器打爆。**

**这个模式（"401 → 重登录 → 重试一次"）是所有带登录的客户端都要有的。**

### 域名白名单错误单独提示

```js
if (msg.includes('url not in domain list')) {
  message = '接口域名没有配置（开发者需要在小程序后台加白名单）';
}
```

**这是第 0 步说的"第一坑"。**

**原始的 `errMsg` 是：**

```text
request:fail url not in domain list
```

**客户看到这句话完全不懂。**

**翻译成"接口域名没有配置"——** **你自己排查时立刻知道去哪配。**

### `BASE_URL` 用 `http://localhost:3000`

**在小程序开发者工具里，可以勾选"不校验合法域名"，** **然后访问 `http://localhost` 是可以的。**

**步骤：**

```text
开发者工具 → 右上角"详情" → 本地设置 → 勾选"不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书"
```

**但真机上不行。**

**真机预览时，必须用 HTTPS 的公网域名。**

**所以：**

```text
开发阶段   → localhost + 关闭域名校验
真机测试   → 需要一个 HTTPS 域名（可以先用 ngrok 之类的临时隧道）
发布       → 正式域名，且要在后台白名单里
```

**三种环境，三个 `BASE_URL`。**

**写成：**

```js
const BASE_URL = (() => {
  if (wx.getAccountInfoSync) {
    const env = wx.getAccountInfoSync().miniProgram.envVersion;
    if (env === 'develop') return 'http://localhost:3000';
    if (env === 'trial') return 'https://staging.yoursite.com';
    return 'https://yoursite.com';
  }
  return 'https://yoursite.com';
})();
```

**`envVersion` 有三个值：`develop`（开发版）、`trial`（体验版）、`release`（正式版）。**

**这个判断自动切换环境，不用手工改。**

### 超时 15 秒

**`wx.request` 默认超时 60 秒。**

**60 秒太长——客户早就走了。**

**15 秒和第 185 节的约定一致。**

---

# 第 4 步：故意撞三个墙（25 分钟）

**这三件事你一定会遇到，先撞一次。**

## 4.1 墙一：域名没白名单

**在开发者工具里把"不校验合法域名"取消勾选，然后刷新页面。**

**报错：**

```text
request:fail url not in domain list
```

**这就是客户（或者你部署之后）会看到的。**

**现在你的 `request.js` 会把它翻译成"接口域名没有配置"，** **但如果翻译没生效，就是你还没写那个 `if`。**

**勾回去，继续。**

## 4.2 墙二：`dataset` 命名转换

**在 `orders/index.wxml` 里把 `data-id` 改成 `data-order-id`：**

```xml
<view bindtap="goDetail" data-order-id="{{item.id}}">
```

**但 `js` 里还是取 `dataset.id`：**

```js
const { id } = e.currentTarget.dataset;   // undefined
```

**点一下，跳转的 URL 是 `/pages/order-detail/index?id=undefined`。**

**详情页会显示"订单不存在"。**

**改成 `dataset.orderId`，正常。**

**这个坑我保证你会踩一次。** **现在踩比上线时踩好。**

## 4.3 墙三：忘了 `wx:key`

**把 `wx:key="id"` 删掉。**

**然后在下拉刷新时观察列表。**

**小数据量时看不出问题。** **但如果你把列表顺序打乱（比如按金额排序），** **你会看到"状态徽标错位"——第 3 行的"已支付"跑到了第 5 行。**

**这就是 `wx:key` 缺失的后果。**

**加回来。**

**为什么这个 bug 难查：** **因为大部分时候它是对的，只在数据顺序变化时才错。**

## 4.4 自检点

**三个墙都撞过之后，你的小程序应该：**

```text
① 能加载出订单列表（如果后端在跑，且有数据）
② 点一条能跳到详情页（带着正确的 id）
③ 下拉能刷新
```

**如果列表是空的，去网页版建一个订单。**

**注意：小程序的登录还没做，所以 `/api/orders` 会返回 401。**

**这会触发 `request.js` 里的自动登录，而 `/api/auth/wechat` 还不存在。**

**所以现在会看到"请求失败（404）"。**

**下一步就做登录。**

---

# 第 5 步：最终验收

## A. 判断

- [ ] 我能说清小程序 vs PWA 的成本差（时间和资质）
- [ ] 我能用"三个问题"问出客户的真实需求
- [ ] 我知道"分享卡片"是小程序唯一明显赢的地方
- [ ] 我写了一份 `docs/wechat-decision.md`

## B. 环境

- [ ] 微信开发者工具装好了
- [ ] 有一个 AppID（或者测试号）
- [ ] 项目能打开，模拟器显示页面

## C. 骨架

- [ ] `app.json` 里有 3 个页面 + 2 个 tab
- [ ] 三个页面都有 `.js/.json/.wxml/.wxss`
- [ ] 列表用 `rpx`，不是 `px`
- [ ] `wx:for` 都带 `wx:key="id"`

## D. request

- [ ] 有 401 自动重登录（`retry: false` 防循环）
- [ ] 域名白名单错误有中文翻译
- [ ] 超时 15 秒
- [ ] `BASE_URL` 按 `envVersion` 自动切换

## E. 三个墙

- [ ] 我关过"不校验合法域名"，看到 `url not in domain list`
- [ ] 我改过 `data-id` → `data-order-id`，看到 `undefined`
- [ ] 我删过 `wx:key`，看到数据错位

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了 `rpx` 的换算规则
- [ ] 我记下了 `dataset` 的中划线转驼峰

## 提交

```text
git add -A
git commit -m "第190节课: 小程序判断表 + 三页骨架 + request 封装"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `url not in domain list` | 域名没配白名单 | 后台加，或开发时关闭校验 |
| 页面空白，`<div>` 里有内容但看不到 | 用了 HTML 标签 | 改成 `view` / `text` |
| `e.currentTarget.dataset.id` 是 `undefined` | `data-order-id` 要取 `dataset.orderId` | 中划线转驼峰 |
| 点了没反应 | 用了 `onclick` | 改 `bindtap` |
| `this.data.orders = rows` 后页面没变 | 没调 `setData` | `this.setData({orders: rows})` |
| 列表数据错位 | 没写 `wx:key` | 加唯一字段 |
| 样式完全不生效 | 用了 `px`，或者只写了 `wxss` 没被引用 | 检查路径和 `@import` |
| `rpx` 和设计稿对不上 | 设计稿宽度不是 750 | 按 750 换算 |
| 真机预览白屏 | `BASE_URL` 是 `localhost` | 换 HTTPS 域名 |
| `request:fail` 但没有 `errMsg` | 网络断了 | 提示客户检查网络 |

---

## 本节课要能说出口的一句话

> **小程序不是"更高级的网页"，是另一个渠道，有它自己的税（备案、审核、资质）；所以先问"客户从哪来"，再决定做不做。**
