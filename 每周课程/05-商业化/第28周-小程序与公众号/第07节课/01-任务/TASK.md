# 第 196 节课：交付小程序原型

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这是第 05 阶段的最后一节课。前面六节做了零件，这一节把它们装起来，**并且真正在手机上扫码打开。**
> 最后一节还有一件事：**把这五个阶段收个尾**。

**建议用时**：150 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（65 分钟）一次，第 3—5 步（85 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 190—195 节

---

# 第 0 步：先确认三件事（15 分钟）

**在打包之前，先确认你的环境是干净的。**

## 0.1 三个检查

```text
① 后端能跑（npm run dev 在 3000）
② 数据库迁移都跑过（npm run migrate 报"跳过"）
③ 小程序在开发者工具里能打开（不是白屏）
```

**任何一条不通，先修，别急着打包。**

## 0.2 一个必须准备的域名

**真机上小程序不能访问 `localhost`。**

**你需要一个 HTTPS 的域名。**

**三条路：**

```text
① 你已经有域名 → 配 HTTPS → 最省事
② 没有域名     → 用内网穿透（ngrok / cpolar / frp）
③ 都不想搞     → 这一节只能做到"开发者工具里能跑"
```

**这一节假设你用内网穿透。**

**以 ngrok 为例：**

```text
ngrok http 3000
```

**它会给你一个 `https://xxxx.ngrok.io` 的地址。**

**注意：**

```text
① 免费版每次重启地址会变 → 要重新配白名单
② 免费版有连接数限制
③ 微信要求域名"已备案" → ngrok 的域名没备案，体验版可能也过不去
```

**第三条是真问题。**

**微信的白名单校验会检查域名是否备案（中国大陆的域名）。**

**ngrok 给的是境外域名，过不了。**

**所以：**

```text
有备案域名 → 真机能跑
没备案域名 → 只能在开发者工具里跑（勾选"不校验合法域名"）
```

**这一节两种都支持：** **开发者工具里完整跑通是底线，真机能跑是加分。**

---

# 第 1 步：加检测与首页（25 分钟）

## 1.1 一个"环境自检"页

**新建 `pages/health/index.js`：**

```js
const { BASE_URL, request } = require('../../utils/request');

Page({
  data: {
    baseUrl: BASE_URL,
    checks: [],
    running: false,
    allOk: false,
  },

  onLoad() {
    this.run();
  },

  async run() {
    this.setData({ running: true, checks: [], allOk: false });

    const checks = [];

    checks.push({
      name: '网络（调 /api/health）',
      ...(await this.check(async () => {
        const r = await request({ path: '/api/health', retry: false });
        return r.ok ? 'ok' : '响应异常';
      })),
    });

    checks.push({
      name: '登录（拿 token）',
      ...(await this.check(async () => {
        const { login } = require('../../utils/request');
        try {
          const r = await login(true);
          return r && r.token ? 'ok' : '没有拿到 token';
        } catch (err) {
          // 第 193 节之后，"没绑定"是一个正常的登录结果，不是失败
          if (err.code === 'NEED_BIND') {
            return '还没绑定账号（正常，去输邀请码）';
          }
          throw err;
        }
      })),
    });

    checks.push({
      name: '身份（/api/me）',
      ...(await this.check(async () => {
        const me = await request({ path: '/api/me', retry: false });
        return me.user && me.user.email ? okLabel(me) : '返回结构不对';
      })),
    });

    checks.push({
      name: '数据（/api/orders）',
      ...(await this.check(async () => {
        const r = await request({ path: '/api/orders?limit=1', retry: false });
        const list = r.items || r;
        return '共 ' + (Array.isArray(list) ? list.length : 0) + ' 条（首页）';
      })),
    });

    const allOk = checks.every((c) => c.ok);

    this.setData({ checks, running: false, allOk });
  },

  async check(fn) {
    const started = Date.now();

    try {
      const detail = await fn();
      return { ok: true, detail, ms: Date.now() - started };
    } catch (err) {
      return { ok: false, detail: err.message || '失败', ms: Date.now() - started };
    }
  },
});

function okLabel(me) {
  return me.user.email + ' / ' + (me.tenant && me.tenant.name ? me.tenant.name : '');
}
```

**`pages/health/index.wxml`：**

```xml
<view class="page">
  <view class="card">
    <view class="row">
      <text class="row__label">接口地址</text>
      <text class="row__value row__value--mono">{{baseUrl}}</text>
    </view>
  </view>

  <view class="card">
    <view class="check" wx:for="{{checks}}" wx:key="name">
      <view class="check__head">
        <text class="check__icon">{{item.ok ? '✓' : '✕'}}</text>
        <text class="check__name">{{item.name}}</text>
        <text class="check__ms">{{item.ms}}ms</text>
      </view>
      <view class="check__detail {{item.ok ? '' : 'check__detail--err'}}">{{item.detail}}</view>
    </view>

    <view class="check__empty" wx:if="{{checks.length === 0}}">
      {{running ? '检查中……' : '还没检查'}}
    </view>
  </view>

  <button class="btn btn--primary btn--block" bindtap="run" loading="{{running}}" disabled="{{running}}">
    {{running ? '检查中' : '重新检查'}}
  </button>

  <view class="tips">
    <view class="tips__title">如果有一项失败</view>
    <view class="tips__item">网络失败 → 检查域名白名单 / 后端是否在跑</view>
    <view class="tips__item">登录失败 → 检查 AppID / 后端 WECHAT_MOCK 设置</view>
    <view class="tips__item">身份失败 → 检查 wechat_users 有没有绑定记录（需要先输邀请码）</view>
    <view class="tips__item">数据失败 → 检查 orders 表里有没有数据</view>
  </view>
</view>
```

**加进 `app.json`：**

```json
"pages": [
  "pages/orders/index",
  "pages/order-detail/index",
  "pages/mine/index",
  "pages/order-new/index",
  "pages/health/index",
  "pages/bind/index"
]
```

## 1.2 为什么先做一个自检页

**因为这个页面能省掉你两小时的瞎猜。**

**没有它：**

```text
打开小程序 → 白屏 → 不知道是哪一层的问题
→ 改代码 → 还是白屏
→ 换域名 → 还是白屏
→ 怀疑 AppID → 还是白屏
```

**有它：**

```text
打开自检页 → "网络 ✓ 登录 ✕ 没有拿到 token"
→ 问题在登录这一层
→ 查 AppID 和 mock 配置
```

**把"白屏"变成"第几步失败"，是排查效率的 10 倍差别。**

**这个思路对所有"客户端 + 服务端"的系统都适用。**

**你以后每交付一个客户端，都该有一个自检页。**

## 1.3 后端加一个 `/api/health`

**这个接口不需要登录。**

**在 `server.js` 里加（要在所有需要 auth 的路由之前）：**

```js
app.get('/api/health', async (req, res) => {
  const started = Date.now();

  try {
    await pool.query('select 1');

    res.json({
      ok: true,
      db: 'up',
      ms: Date.now() - started,
      time: new Date().toISOString(),
      mock: {
        wechat: process.env.WECHAT_MOCK === '1',
        pay: process.env.WXPAY_MOCK === '1',
      },
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      db: 'down',
      error: err.message,
    });
  }
});
```

**注意返回了 `mock` 字段。**

**为什么：** **如果生产环境的 `mock.wechat` 是 `true`，** **你在自检页上能一眼看到"完了，mock 没关"。**

**这比"事后从日志里发现"好一百倍。**

## 1.4 自检点

**在开发者工具里打开 `pages/health/index`。**

**期望看到四行全绿：**

```text
✓ 网络（调 /api/health）        12ms
✓ 登录（拿 token）              180ms
✓ 身份（/api/me）               25ms
✓ 数据（/api/orders）           30ms
```

**任何一行红，按 tips 排查。**

---

# 第 2 步：加"新建订单"入口（25 分钟）

**上节课写了 `pages/order-new`，但列表页没有入口。**

## 2.1 列表页加按钮

**`pages/orders/index.wxml` 里加一个悬浮按钮：**

```xml
<view class="fab" bindtap="goNew">
  <text class="fab__icon">＋</text>
</view>
```

```css
.fab {
  position: fixed;
  right: 32rpx;
  bottom: calc(48rpx + env(safe-area-inset-bottom));
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: #1f6feb;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(31, 111, 235, 0.35);
  z-index: 10;
}

.fab:active {
  transform: scale(0.94);
}

.fab__icon {
  color: #fff;
  font-size: 56rpx;
  line-height: 1;
  margin-top: -4rpx;
}
```

```js
goNew() {
  this._needsRefresh = true;
  wx.navigateTo({ url: '/pages/order-new/index' });
},
```

## 2.2 三个细节

### `env(safe-area-inset-bottom)` 要加

**iPhone 底部有横条。**

**不加的话，按钮会被横条挡住一半，点不准。**

**`calc(48rpx + env(safe-area-inset-bottom))` 让按钮在横条上方。**

**和第 183 节一样，注意 `viewport-fit=cover`。**

**但小程序不需要那个 meta——** **它默认就用安全区。**

### `:active` 缩小反馈

```css
.fab:active { transform: scale(0.94); }
```

**手机上"按下去有反馈"极其重要。**

**没有反馈，客户会连点，可能创建多个订单。**

**而 `transform: scale` 是最轻的反馈（不改布局，不触发重排）。**

### 列表页和新建页之间的"刷新"

**`goNew` 里设了 `_needsRefresh = true`。**

**新建成功后会 `redirectTo` 到详情页，** **然后客户从详情返回列表 → `onShow` 触发 → 刷新。**

**这个链路要自己走一遍，确认新的订单出现在列表里。**

## 2.3 自检点

**三个检查：**

```text
① 列表页右下角有一个圆形按钮
② 点它进新建页
③ 填完保存 → 跳到详情 → 返回列表 → 新订单在最上面
```

**第 ③ 条最容易断。**

**如果新订单没出现，检查 `_needsRefresh` 是不是在 `goNew` 里设的。**

---

# 第 3 步：真机预览（30 分钟）

## 3.1 开发者工具"预览"

**点右上角"预览" → 生成二维码 → 用手机微信扫。**

**注意事项：**

```text
① 手机和电脑要在同一个网络（或者用公网域名）
② 开发者工具的账号要和小程序账号关联
③ 体验版需要把测试者加到"体验成员"里
```

**扫开之后大概率会遇到三个问题之一。**

## 3.2 问题一：白屏

**原因：`BASE_URL` 还是 `localhost`。**

**修：**

**改 `utils/request.js`：**

```js
const BASE_URL = (() => {
  if (wx.getAccountInfoSync) {
    const env = wx.getAccountInfoSync().miniProgram.envVersion;
    if (env === 'develop') return 'http://localhost:3000';
    if (env === 'trial') return 'https://你的域名';
    return 'https://你的域名';
  }
  return 'https://你的域名';
})();
```

**注意：** **真机预览时 `envVersion` 是 `trial`。**

**所以 `trial` 那个分支必须是公网地址。**

## 3.3 问题二：接口全部失败

**报错：**

```text
request:fail url not in domain list
```

**修：**

**在微信公众平台 → 开发 → 开发设置 → 服务器域名 → 添加 `https://你的域名`。**

**注意：**

```text
① 必须是 HTTPS
② 不能带端口
③ 一个月只能改 5 次
④ 域名要备案（境内主体）
```

**第 ④ 条是国内小程序的硬门槛。**

**没有备案域名，真机就是跑不通（除了"开发版"和"体验版"在某些情况下）。**

**这就是第 190 节说的"小程序的税"。**

## 3.4 问题三：登录失败

**报错：**

```text
微信登录失败（40029）  或者  没有拿到 token
```

**排查顺序：**

```text
① 自检页看哪一步失败
② 后端日志有没有 [wechat] 登录
③ WECHAT_MOCK 是 '1' 吗（开发阶段应该是）
④ 如果是真 AppID，检查 AppSecret 有没有填错
```

**注意：** **`WECHAT_MOCK=1` 时不需要真 AppID，所以"登录失败"大概率是后端的问题，不是微信的问题。**

## 3.5 如果真机就是跑不通

**接受它。**

**这一节的验收标准是"开发者工具里完整跑通"，真机是加分项。**

**你可以这样交付：**

```text
"小程序原型已完成，开发者工具里可完整运行。
 真机体验需要：备案域名 + 小程序备案 + 服务器域名白名单。
 这三件事要 15—20 个工作日，建议现在就开始办。"
```

**这句话是诚实的，也是专业的。**

**比"我这边都通了，你那边有问题"好一万倍。**

## 3.6 自检点

**三个数字记下来：**

```text
打开小程序到看见列表：____ 秒
点订单到看见详情：____ 秒
点保存到看见"已保存"：____ 秒
```

**任何一个超过 3 秒，回头看第 185 节的"四态"。**

---

# 第 4 步：写交付说明（25 分钟）

**新建 `docs/miniprogram-handoff.md`：**

```markdown
# 小程序交付说明

## 现在能做什么

- 查看订单列表（分页加载）
- 查看订单详情
- 新建订单
- 申请退款
- 微信登录（首次进入自动创建身份）
- 支付（当前是模拟环境，真实支付需要商户号）
- 订单支付成功后的订阅消息通知

## 怎么在开发者工具里跑

1. 下载微信开发者工具
2. 导入 `miniprogram/` 目录
3. 填 AppID（没有就用测试号）
4. 详情 → 本地设置 → 勾选"不校验合法域名"
5. 确保后端在 `localhost:3000` 运行
6. 点"编译"

**自检：** 打开 `pages/health/index`，四行应该全绿。

## 真机体验还需要什么

| 事项 | 谁办 | 大概时间 |
|---|---|---|
| 域名 + ICP 备案 | 你（客户） | 7—20 工作日 |
| 小程序注册（企业主体） | 你（客户） | 1 天 |
| 小程序备案 | 你（客户） | 7—20 工作日 |
| 服务器域名白名单 | 我们 | 5 分钟 |
| 微信支付商户号 | 你（客户） | 3—7 工作日 |

**这三件事没有一件是技术问题，但每一件都是时间问题。建议现在就开始办。**

## 数据在哪

- 订单数据：和网页版共用同一个数据库
- 微信身份：`wechat_users` 表（openid → user_id 映射）
- 消息记录：`wechat_messages` 表

## 安全说明

- 小程序不存 openid（只存 token）
- session_key 只在服务端，不下发
- **首次进入需要邀请码才能看到数据**，没有邀请码只能看到引导页
- 邀请码 7 天有效、一次性、绑定到指定成员、连错 5 次自动锁
- 所有金额在后端计算，小程序只传数量和单价
- 支付回调有验签和幂等

## 已知限制

1. **邀请码需要管理员手工发**：客户第一次进入要输 6 位码。
   目前没有"手机号自助绑定"——那需要企业主体资质（个人小程序拿不到手机号）。
   如果客户觉得"发码"麻烦，上线后再加手机号那一条。
2. **支付是 mock**：没有真实扣款。接真商户号时需要换签名算法和密钥。
3. **订阅消息是一次性的**：每次发之前需要用户重新授权，
   所以授权请求绑在"提交订单"这个动作上。
4. **没有做好友分享**：需要配置 `onShareAppMessage`。
5. **`systemPool` 用的是数据库超级用户**：本地开发为了省事。
   上线前必须改成专用角色 `app_system`（SQL 见第 165 节 5.4）。

## 上线检查清单

- [ ] `SYSTEM_DATABASE_URL` 指向专用角色 `app_system`，不是 `postgres`（**必须**）
- [ ] `app_system` 只授了 `tenants` / `users` / `wechat_users` / `invite_codes` 四张表（**必须**）
- [ ] `WECHAT_MOCK=0`、`WXPAY_MOCK=0`
- [ ] 域名白名单配好
- [ ] 服务器域名是 HTTPS 且备案
- [ ] 支付用真实商户号
- [ ] 订阅消息用真实模板 ID
- [ ] `miniprogram_state` 改成 `formal`
- [ ] 加 `onShareAppMessage`（如果要分享）
- [ ] 隐私协议（小程序要求）
- [ ] 提交审核
```

## 4.1 这份文档的三个关键

### "现在能做什么"要具体

**不要写"实现了订单管理"。**

**写"查看订单列表（分页加载）"——** **客户能对照着点。**

### "真机还需要什么"要标时间和责任方

**这张表是你避免纠纷的东西。**

**客户问"为什么还不能用"，你指着这张表说：** **"域名备案还没下来，这一项是您那边办。"**

### "已知限制"要写全

**特别是两条：** **"邀请码要手工发"和"`systemPool` 用的是超级用户"。**

**第一条不写，客户会以为"员工打开就能用"，然后打电话问你"为什么我员工看不到订单"。** **你要说"你要先给他发码"，而他觉得"这不该是自动的吗"。** **先说清楚，就不算问题。**

**第二条不写，就是给自己埋雷。** **`systemPool` 是这一阶段唯一一个"能绕过租户隔离"的连接，它用的是 `postgres` 超级用户——** **这意味着你的应用进程里，有一条随时能看到所有客户数据的通道。**

**本地开发这样没问题。上线必须换。** **写进"上线检查清单"的第一条，是因为它最容易在紧张的上线日被忘掉。**

**写出来，是为了保护你自己，也是为了保护他。**

---

# 第 5 步：把五个阶段收个尾（30 分钟）

**这是第 05 阶段的最后一节课。**

**前五个阶段你做了什么：**

```text
W1—W5    元技能与基础    AI 工具、前端、后端、Git、SQL
W6—W10   AI 应用骨架     提示词、成本流式、账号防刷、后台、文件
W11—W15  数据与智能      采集、解析、RAG、Agent、多模态
W16—W23  工程可靠性      队列、实时、评测、测试、性能、通知
W24—W28  商业化          多租户、Excel支付、平台集成、前端、小程序
```

## 5.1 你现在手上的东西

**一个能交付的系统：**

```text
一个 PostgreSQL 库，七张核心表 + 十几张辅助表
一个 Node 后端，30+ 个接口
一个网页前端，五个页面
一个飞书/企微集成（事件、卡片、通讯录）
一个小程序原型（三页 + 登录 + 支付流程）
一套测试（隔离测试九条 + 金额测试）
一套文档（对接说明、运维手册、交付清单）
```

**这已经超过很多"接活工作室"的交付水准了。**

## 5.2 还差什么

**三个硬缺口：**

```text
① 部署    它现在只在你电脑上跑（第 29—34 周解决）
② 监控    出问题你不知道（第 32 周）
③ 安全    没有系统性地检查过（第 33 周）
```

**两个软缺口：**

```text
④ 获客    系统再好，没人买（第 35 周）
⑤ 合同    收了钱但没签协议（第 36 周）
```

**这就是后面八周要做的事。**

## 5.3 一个必须现在做的事

**把这五个阶段的代码，完整提交一次。**

```text
cd saas-lab
git add -A
git commit -m "第05阶段完成：多租户 + Excel/支付 + 平台集成 + 前端 + 小程序"
git push
```

**然后：**

```text
git log --oneline | head -40
```

**数一下你这个阶段提交了多少次。**

**如果少于 30 次，说明你攒了太多提交在一起。**

**后果：** **哪天出了问题，你没法用 `git bisect` 定位是哪个改动引入的（第 24 节课学的）。**

**这不是批评，是提醒：** **下一个阶段开始，坚持每节课一提交。**

## 5.4 一份阶段总结

**新建 `docs/phase-05-retro.md`，写四段：**

```markdown
# 第 05 阶段回顾

## 我做出来的东西（一句话能说清吗）

## 最难的三件事
1.
2.
3.

## 我踩过的坑（写具体的报错）
1.
2.
3.

## 如果重做一遍，我会改什么
1.
2.
```

**这份文档的价值：** **两个月后你会忘了现在的痛苦。** **忘了痛苦，就会重复犯同样的错。**

**把"最难的三件事"写下来，下次遇到类似的能省一半时间。**

---

# 第 6 步：最终验收（也是阶段验收）

## A. 小程序

- [ ] 自检页四行全绿（或者"登录"那行显示"还没绑定账号"，这是正常的）
- [ ] 列表、详情、新建、我的四个页面都能用
- [ ] 分页能加载更多
- [ ] 新建订单能成功，返回列表能看到
- [ ] 退款能提交
- [ ] 订阅消息能发（mock 模式）
- [ ] **没绑定时看到的是"输入邀请码"引导，不是报错**
- [ ] **输对邀请码后能看到订单，且身份是那个指定成员**

## B. 真机

- [ ] 开发者工具"预览"能生成二维码
- [ ] 手机上打开不白屏（或者知道为什么白屏）
- [ ] 三个时间都小于 3 秒

## C. 后端

- [ ] `/api/health` 返回 `mock` 状态
- [ ] Bearer 和 Cookie 都能认
- [ ] 支付回调验签 + 幂等 + 金额校验
- [ ] 查单脚本能救回丢失的回调
- [ ] **`npm run check` 列出的 `systemPool` 位置，每一处我都能说出理由**

## D. 文档

- [ ] `docs/miniprogram-handoff.md` 写完
- [ ] "已知限制"里写了"邀请码要手工发"
- [ ] "已知限制"里写了"`systemPool` 用的是超级用户，上线必须换"
- [ ] "真机还需要什么"有责任方和时间
- [ ] 上线检查清单第一条是"改 `SYSTEM_DATABASE_URL`"

## E. 阶段收尾

- [ ] 五个阶段的代码全部提交并 push
- [ ] `git log` 里这个阶段有 30 次以上提交
- [ ] `docs/phase-05-retro.md` 写完四段
- [ ] `npm test` 九条隔离测试全绿
- [ ] `npm run check` 通过
- [ ] 数据库迁移能重复跑（第二次全是"跳过"）

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"自检页能省两小时"
- [ ] 我记下了"上线前第一件事是换 `SYSTEM_DATABASE_URL`"
- [ ] 我记下了"RLS 一加，所有'还不知道租户'的路径都要单独开系统连接"

## 提交

```text
git add -A
git commit -m "第196节课: 自检页 + 真机预览 + 交付说明 + 阶段总结"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 真机白屏 | `BASE_URL` 是 `localhost` | 改成公网 HTTPS |
| `url not in domain list` | 域名没白名单 | 后台配 |
| 白名单加不上 | 域名没备案 | 先备案（7—20 天） |
| 二维码扫了打不开 | 不是体验成员 | 后台加体验成员 |
| 自检页"登录 ✕" | `WECHAT_MOCK` 没开，或者 AppSecret 错 | 检查 `.env` |
| 自检页全绿但列表空 | 数据库没订单 | 去网页版建一单 |
| 真机很慢 | 手机网络差 | 正常，看具体多少 ms |
| `envVersion` 一直是 `trial` | 正常（预览就是 trial） | — |
| 改了域名白名单不生效 | 有缓存 | 重新编译；等几分钟 |
| 提交审核被拒 | 类目不符 / 有测试数据 | 看审核意见，改类目或清数据 |

---

## 本节课（也是这一阶段）要能说出口的一句话

> **交付不是"我这边能跑"，是"对方能自己照着文档跑起来，并且知道哪些是已知限制"；一份写清"还需要什么"的说明，能挡掉后面八十次追问。**
