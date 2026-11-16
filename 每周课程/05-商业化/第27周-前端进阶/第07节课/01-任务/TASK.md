# 第 189 节课：交付一个能看的界面

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前六节各做了一个零件。这一节把它们装成一台交付得出去的机器，**然后用一份清单逐项检查。**
> 清单比代码重要——**因为你交付前一定会漏掉某一条，而清单会拦住你。**

**建议用时**：150 分钟
**你需要先完成**：第 183—188 节全部

---

# 第 0 步：先定义"能看的界面"（15 分钟）

## 0.1 三个层次

```text
第一层：能用      点对地方、看到数据、不出错
第二层：不难看    间距一致、字体统一、颜色克制
第三层：专业      知道该看什么、知道下一步做什么、出错知道怎么办
```

**第一层是前六节做的。这一节补第二层和第三层。**

**"专业"不等于"好看"。**

```text
好看：配色大胆、动效丰富、插画精致
专业：信息层次清楚、每个数字都有对比、每个空状态都有引导
```

**客户的判断标准是第二种。** **他不懂设计，但他知道"这个系统用起来顺不顺"。**

## 0.2 五个"不专业"的具体信号

| 信号 | 客户的感觉 |
|---|---|
| 间距忽大忽小（12/16/20 混着用） | "这做得挺随意的" |
| 字体大小有 6 种（13/14/15/16/18/22） | "看着乱" |
| 颜色有 8 种（每个状态一个色） | "花" |
| 页面顶部没有标题 | "我在哪？" |
| 按钮有三种圆角（4/8/12） | "不像一个产品" |

**这五个都不是"审美问题"，是"一致性"问题。**

**一致性靠什么：靠变量，不靠记性。**

## 0.3 这一节要做的四件事

```text
① 把设计 token 收拢（间距、字号、圆角、颜色）
② 补全所有页面（至少五个）
③ 走一遍视觉检查清单
④ 做一次慢网络 + 真机的完整体验
```

---

# 第 1 步：收拢设计 token（30 分钟）

**第 183 节已经写了一部分。这一节把它变成"约束"。**

## 1.1 定死四个尺度

**新建 `public/css/tokens.css`（放在 `base.css` 之前引入）：**

```css
:root {
  /* 间距：只用这七个 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  /* 字号：只用这六个 */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;

  /* 圆角：只用这三个 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* 颜色：语义命名，不用颜色名 */
  --color-bg: #ffffff;
  --color-bg-subtle: #f7f8fa;
  --color-bg-inverse: #1a1a1a;

  --color-text: #1a1a1a;
  --color-text-secondary: #5c6370;
  --color-text-muted: #8b919c;
  --color-text-inverse: #ffffff;

  --color-border: #e3e5e9;
  --color-border-strong: #c8ccd4;

  --color-primary: #1f6feb;
  --color-primary-hover: #1a5fd0;
  --color-primary-soft: #eaf2fe;

  --color-danger: #c1121f;
  --color-danger-soft: #fdecee;

  --color-success: #0a7b34;
  --color-success-soft: #e7f6ec;

  --color-warning: #b45309;
  --color-warning-soft: #fff4e5;

  /* 尺寸 */
  --tap-target: 44px;
  --header-height: 52px;
  --tab-height: 56px;
  --content-max: 720px;
}
```

## 1.2 为什么要"只用这几个"

**因为"随心所欲选间距"是"看起来不专业"的第一原因。**

```css
/* ❌ 这些数字看起来都对，但它们不是一套 */
.card { padding: 14px; }
.card__title { margin-bottom: 10px; }
.list__item { padding: 13px 15px; }
.btn { padding: 0 18px; }

/* ✅ 全部来自同一套 */
.card { padding: var(--space-4); }
.card__title { margin-bottom: var(--space-2); }
.list__item { padding: var(--space-3) var(--space-4); }
.btn { padding: 0 var(--space-4); }
```

**第一组的问题：14 / 10 / 13 / 15 / 18 —— 五个数字没有规律。**

**客户说不出哪里不对，但会觉得"这个界面有点糙"。**

**第二组：16 / 8 / 12+16 / 16 —— 全部是 4 的倍数，有节奏。**

**这就是"设计系统"的实际作用：不是让你好看，是让你一致。**

## 1.3 语义化颜色命名

**注意这些名字：**

```css
--color-danger        /* ✅ 危险 */
--color-success       /* ✅ 成功 */
--color-warning       /* ✅ 警告 */

--color-red           /* ❌ 红 */
--color-green         /* ❌ 绿 */
```

**为什么：**

```text
用 --color-red      → 你想"这个提示用什么色" → 想"红色合适吗"
用 --color-danger   → 你想"这是个错误" → 直接用
```

**语义命名让"选颜色"变成"判断语义"。**

**而且换主题时（比如深色模式），你只需要改值，不用改用法。**

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #16181d;
    --color-text: #e8eaed;
    --color-border: #2a2e36;
    /* 用法一行不用改 */
  }
}
```

**这一节不做深色模式，但结构留好了。**

## 1.4 加一个"一致性检查"

**新建 `scripts/check-css.js`：**

```js
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'css');
const ALLOWED_PX = new Set([
  '0', '1px', '2px', '3px', '4px', '6px', '8px', '12px', '16px',
  '24px', '32px', '48px', '44px', '52px', '56px', '100px', '120px',
  '160px', '200px', '320px', '375px', '999px',
]);

const problems = [];

for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith('.css')) continue;
  if (file === 'tokens.css' || file === 'base.css') continue;

  const lines = fs.readFileSync(path.join(DIR, file), 'utf8').split('\n');

  lines.forEach((line, i) => {
    if (line.trim().startsWith('/*') || line.trim().startsWith('*')) return;

    const matches = line.match(/(?<![\w-])(\d+)px/g);
    if (!matches) return;

    for (const m of matches) {
      if (!ALLOWED_PX.has(m)) {
        problems.push({
          file,
          line: i + 1,
          value: m,
          code: line.trim(),
        });
      }
    }
  });
}

if (problems.length === 0) {
  console.log('✅ 间距和尺寸都在允许范围内');
  process.exit(0);
}

console.log('❌ 发现 ' + problems.length + ' 处"随手写的 px"：\n');
problems.slice(0, 30).forEach((p) => {
  console.log('  ' + p.file + ':' + p.line + '  ' + p.value);
  console.log('    ' + p.code.slice(0, 100));
});

if (problems.length > 30) {
  console.log('\n...还有 ' + (problems.length - 30) + ' 处');
}

console.log('\n改成 var(--space-N) 或者用允许的固定尺寸。');
process.exit(1);
```

**跑：**

```text
node scripts/check-css.js
```

**第一次跑一定会报一堆。**

**逐个改成 `var(--space-N)`。**

**这个脚本的价值：** **它把"审美"变成"规则"，可以机械检查。**

**两个人（或者你和 AI）写代码，靠"我们注意一下"是没用的，靠脚本才行。**

## 1.5 自检点

**改完之后再跑一次：**

```text
node scripts/check-css.js
```

**应该是 `✅`。**

**然后做一件事：把浏览器窗口调到 375px，看五个页面，问自己"间距有节奏吗"。**

**如果你看不出来，把每个元素的间距标出来看：**

```js
// 在控制台里跑
[...document.querySelectorAll('.card, .list__item, .btn')].slice(0, 10).forEach((el) => {
  const s = getComputedStyle(el);
  console.log(el.className.slice(0, 30), s.padding, s.marginBottom);
});
```

**如果 padding 出现了 14px / 18px 这种，说明有地方没走变量。**

---

# 第 2 步：补全五个页面（50 分钟）

## 2.1 页面清单

**一个能交付的系统，至少这五页：**

```text
① login.html       登录（无导航）
② index.html       首页 / 仪表盘
③ orders.html      订单列表
④ settings.html    设置（含平台集成状态）
⑤ order-detail.html 详情（从列表点进去）
```

**为什么是这五个：**

```text
login     客户第一次进来
index     他每天打开看到的
orders    他最主要的工作
detail    他处理具体一件事
settings  他改配置 / 看集成状态
```

**少了任何一个，客户都会觉得"这不完整"。**

## 2.2 统一的页面模板

**每个页面都是这个结构：**

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<title>订单 · 业务助手</title>
<link rel="stylesheet" href="/vendor/uplot.min.css">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/layout.css">
<link rel="stylesheet" href="/css/components.css">
</head>
<body>
<div class="app" id="app"></div>

<script src="/vendor/uplot.min.js"></script>
<script src="/js/api.js"></script>
<script src="/js/ui.js"></script>
<script src="/js/layout.js"></script>
<script src="/js/state.js"></script>
<script src="/js/action.js"></script>
<script src="/js/validate.js"></script>
<script src="/js/errors.js"></script>
<script src="/js/chart.js"></script>
<script src="/js/track.js"></script>
<script src="/js/pages/orders.js"></script>
</body>
</html>
```

**八个 CSS/JS 文件，每个页面都引。**

**为什么不做"按需加载"：**

```text
总量：CSS ~15KB + JS ~40KB（gzip 后 ~20KB）
客户 4G 加载 20KB：约 100ms
收益：几乎没有
成本：打包工具、路径管理、调试复杂
```

**这个规模上，"全部引入"是对的。**

**什么时候该按需：** **总量超过 200KB 的时候。**

## 2.3 登录页要特别处理

**登录页和其他页面不一样：**

```text
没有顶部导航（客户还没登录，没有"返回"的地方）
没有底部 tab
垂直居中
```

**新建 `public/login.html`：**

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>登录 · 业务助手</title>
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/components.css">
<style>
  .auth-wrap {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: var(--space-6) var(--space-4);
    max-width: 400px;
    margin: 0 auto;
  }
  .auth-brand {
    text-align: center;
    margin-bottom: var(--space-6);
  }
  .auth-brand h1 {
    font-size: var(--text-xl);
    font-weight: 700;
    margin-bottom: var(--space-2);
  }
  .auth-brand p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
</head>
<body>
<div class="auth-wrap">
  <div class="auth-brand">
    <h1>业务助手</h1>
    <p>登录后管理订单与审批</p>
  </div>
  <div id="form-host"></div>
</div>

<script src="/js/api.js"></script>
<script src="/js/ui.js"></script>
<script src="/js/validate.js"></script>
<script src="/js/action.js"></script>
<script src="/js/track.js"></script>
<script src="/js/pages/login.js"></script>
</body>
</html>
```

**`public/js/pages/login.js`：**

```js
(function () {
  const { Field, Button } = window.UI;

  const form = Validate.createForm({
    fields: {
      email: { rules: [Validate.RULES.required, Validate.RULES.email] },
      password: { rules: [Validate.RULES.required] },
    },
  });

  Track.track('login_viewed');

  function render() {
    return `
      <form id="login-form" novalidate>
        ${Field({ name: 'email', label: '邮箱', required: true, type: 'email', inputmode: 'email', placeholder: 'name@company.com', autocomplete: 'username' })}
        ${Field({ name: 'password', label: '密码', required: true, type: 'password', autocomplete: 'current-password' })}
        <div class="action-host" style="margin-top:var(--space-5)">
          ${Button({ label: '登录', variant: 'primary', block: true, type: 'submit' })}
        </div>
        <p style="margin-top:var(--space-4);text-align:center;font-size:var(--text-sm);color:var(--color-text-muted)">
          还没有账号？<a href="/signup.html">注册一个</a>
        </p>
      </form>
    `;
  }

  async function handleSubmit(el) {
    const btn = el.querySelector('button[type="submit"]');

    const result = await Action.run(btn, async () => {
      const outcome = await form.submit((values) =>
        API.post('/api/auth/login', { email: values.email, password: values.password })
      );

      if (!outcome.ok) {
        const err = new Error('请检查邮箱和密码');
        err.fieldErrors = form.state.errors;
        throw err;
      }

      return outcome.result;
    });

    if (result.ok) {
      Track.track('login_succeeded');
      Track.flush();
      window.location.href = '/index.html';
      return;
    }

    Track.track('login_failed', {
      code: result.error && result.error.status ? String(result.error.status) : 'unknown',
    });
  }

  const host = document.getElementById('form-host');
  host.innerHTML = render();
  form.bind(host);

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit(e.currentTarget);
  });
})();
```

## 2.4 四个细节

### `autocomplete` 让密码管理器能填

```html
autocomplete="username"        <!-- 邮箱 -->
autocomplete="current-password" <!-- 登录时的密码 -->
autocomplete="new-password"     <!-- 注册时的密码 -->
```

**不加的话，客户每次都要手动打密码。**

**手机上的密码管理器（iCloud Keychain、Chrome）靠这个字段识别"这是登录表单"。**

**写错（比如登录用 `new-password`）会导致"密码管理器不提示保存"。**

**这个细节直接影响客户的登录成功率。**

### `type="email"` + `inputmode="email"`

**手机上会弹出带 `@` 和 `.` 的键盘。**

**不带 `inputmode`，客户要切到符号键盘找 `@`——** **多两次操作，多一次放弃的机会。**

### `theme-color`

```html
<meta name="theme-color" content="#ffffff">
```

**安卓 Chrome 会把地址栏染成这个颜色。**

**不加的话，地址栏是默认灰色，跟你的页面不搭。**

**一行 meta，看起来就"像个 App"。**

### `100dvh` 而不是 `100vh`

**登录页是垂直居中的，`vh` 在移动端会因为地址栏而错位。**

**第 183 节讲过，这里再用一次。**

## 2.5 自检点

**五个页面都能打开，然后做一个"跳转闭环"检查：**

```text
① 打开 /orders.html（未登录）
   → 应该跳到 /login.html
② 登录
   → 应该跳到 /index.html
③ 点底部"订单"
   → /orders.html
④ 点一个订单
   → /order-detail.html?id=xxx
⑤ 点左上角"‹"
   → 回 /orders.html
⑥ 点底部"设置"
   → /settings.html
```

**六步都能走通，说明导航是完整的。**

**最容易漏第 ① 步。**

**现在 `api.js` 里 401 会跳 `/login.html`——** **但要确认它真的生效（用一个过期的 cookie 试）。**

---

# 第 3 步：视觉检查清单（35 分钟）

**这是这一节最值钱的部分。**

## 3.1 新建 `docs/ui-checklist.md`

```markdown
# 界面检查清单

> 交付前逐项过一遍。任何一条不过，不要交付。

## A. 一致性

- [ ] 所有间距都是 4 的倍数（`--space-1` 到 `--space-7`）
- [ ] 所有字号只有 6 种（12/14/16/18/22/28）
- [ ] 所有圆角只有 3 种（4/8/12）
- [ ] 所有颜色都来自 `tokens.css`，没有硬编码的 `#xxxxxx`
- [ ] 所有按钮高度 ≥ 44px
- [ ] 所有可点击元素点击时有视觉反馈（`:active` 有变化）
- [ ] 页面顶部都有标题
- [ ] 加载骨架屏的形状和真实内容一致

## B. 375px

- [ ] 没有横向滚动条
- [ ] 长客户名被省略号截断，没撑破布局
- [ ] 金额一列用 `tabular-nums`，小数点对齐
- [ ] 两个 KPI 并排不换行
- [ ] 底部 tab 三项都点得准
- [ ] 顶部右侧的图标按钮单手够得到

## C. 状态

- [ ] 每个异步区域都有骨架屏
- [ ] 每个列表都有空状态，且文案说清"为什么空"
- [ ] 每个可能失败的操作都有错误提示
- [ ] 403 显示"联系管理员"，不显示"重试"
- [ ] 断网时显示"网络好像断了"
- [ ] 提交按钮点击后有加载态，且防重复点击

## D. 表单

- [ ] 每条错误提示都能让人知道怎么改
- [ ] 提交失败会自动滚到第一个错误
- [ ] 输入框有 `inputmode`（数字/邮箱/电话）
- [ ] 输入框字号 ≥ 16px（iOS 不放大）
- [ ] 最下面的输入框不被键盘挡住
- [ ] 必填项有 `*` 标记

## E. 真机

- [ ] 用真手机（不是模拟器）走过全部流程
- [ ] 系统字体调到最大，布局不崩
- [ ] 横屏不崩
- [ ] 慢网络（Slow 3G）下不会一直转圈
- [ ] 微信内置浏览器打开正常（如果客户会从微信点进来）

## F. 内容

- [ ] 没有错别字
- [ ] 没有 "TODO" / "test" / "xxx" 这类占位
- [ ] 时间都带时区（`Asia/Shanghai`）
- [ ] 金额都是 `¥1,299.00` 格式（两位小数、千分位）
- [ ] 空状态文案不说"暂无数据"
```

## 3.2 六组里的重点

### A 组：靠脚本查，不靠眼睛

**第 1.4 节的 `check-css.js` 能自动查前四条。**

**后四条要手工，但很快：**

```js
// 在控制台里查"所有按钮的高度"
[...document.querySelectorAll('button, .btn, a[role="button"]')].forEach((el) => {
  const h = el.getBoundingClientRect().height;
  if (h < 44) console.warn('太小的按钮：', el.className || el.textContent.slice(0, 20), h);
});
```

**这个检查比"看着差不多"可靠。**

### B 组：375px 是硬标准

**"长客户名被省略号截断"这一条最容易漏。**

**测试数据要找最长的那个：**

```js
// 在控制台里把某个可见客户名改成超长
document.querySelector('.list__title').textContent = '这是一个特别特别长的客户名称用来测试省略号是否生效以及布局会不会被撑破';
```

**然后看：金额和状态还在原来的位置吗？**

### C 组：断网和 403

**这两条需要用工具造：**

```text
断网    F12 → Network → Offline
403     用一个普通成员的账号访问只有 owner 能看的页面
```

**第 ② 条需要你在数据库里改一个用户的 `role`：**

```sql
update users set role = 'member' where id = '<某个用户id>';
```

**然后登录那个账号，访问 `/settings.html`。**

**应该看到"没有访问权限"，不是"加载失败"。**

### D 组：错误提示的"能让人知道怎么改"

**这一条要自己读一遍：**

**把页面上的所有错误提示截下来，逐条问：**

```text
"请填写这一项"               → 知道要填，但填什么？
"邮箱格式像这样：a@b.com"    → 知道了
"请填写 11 位手机号，以 1 开头"  → 知道了
"密码至少 8 位，现在还差 2 位" → 知道了
```

**第一条要改。**

### E 组：微信内置浏览器

**如果客户会从微信点链接进来，这一条必须有。**

**微信内置浏览器（X5 内核）的三个坑：**

```text
① 不支持某些现代 CSS（position: sticky 在旧版本上有问题）
② 下载文件被拦（不能直接下载 xlsx）
③ localStorage 在"清理缓存"后会清空
```

**第 ② 条对你的"导出 Excel"功能是致命的。**

**解法：** **让客户"在浏览器中打开"，或者走"复制链接到浏览器"。**

**在导出按钮旁边加一句提示：**

```html
<p style="font-size:14px;color:#8b919c">
  如果在微信里打不开，点右上角「⋯」→「在浏览器打开」
</p>
```

**这一句话能省掉一次客服。**

---

# 第 4 步：走一遍真实客户路径（30 分钟）

**清单过完了，但清单是"逐项检查"，不是"真实使用"。**

**这一节要走一遍完整路径。**

## 4.1 五个步骤，全部在手机上

```text
① 从微信收到一条链接，点开
② 看到登录页，输入邮箱密码
③ 进入首页，看到两个数字和一张图
④ 点"订单"，看到列表
⑤ 点一个订单，看到详情，返回
```

**每一步记下三件事：**

```text
用了多久？
哪里犹豫了？
哪里想返回/退出？
```

## 4.2 一个真实的发现清单

**你大概率会遇到这些（我已经替你踩过）：**

| 现象 | 原因 | 修法 |
|---|---|---|
| 微信里点链接，页面空白 | X5 内核不支持某个语法 | 检查控制台报错；必要时降级写法 |
| 输入密码时，键盘盖住"登录"按钮 | 没做键盘处理 | `scroll-margin-bottom` |
| 首页的图加载不出来 | 图表宽度是 0（元素还没插入） | 先插 HTML 再画图 |
| 点订单列表没反应 | 事件监听没绑上（用了事件委托但容器不对） | 挂到 `#app` |
| 详情页返回后列表滚动位置丢了 | 每次都是重新加载 | 用 `history.back()` 或者 `sessionStorage` 存位置 |
| 底部 tab 在 iPhone 上被横条挡住 | 没加 `safe-area-inset-bottom` | 加上 |
| 慢网络下首页白屏 3 秒 | 没有骨架屏，或者 JS 阻塞了渲染 | 先渲染骨架屏再请求 |

**最后一条"详情页返回后滚动位置丢了"是最容易被忽略的。**

**客户翻了 20 条，点进第 15 条看详情，返回——** **回到顶部了。**

**他会骂人。**

**修法（最简版）：**

```js
// 列表页
window.addEventListener('pagehide', () => {
  sessionStorage.setItem('orders-scroll', String(window.scrollY));
});

window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    const y = Number(sessionStorage.getItem('orders-scroll') || 0);
    if (y > 0) window.scrollTo(0, y);
  }
});
```

**注意 `e.persisted`：** **只有在"从缓存恢复"（bfcache）时才恢复位置。**

**如果是主动刷新，不该恢复。**

## 4.3 用 Lighthouse 跑一次

**Chrome DevTools → Lighthouse → Mobile → 只勾 Performance 和 Accessibility → Analyze。**

**四个指标看两个：**

```text
Performance ≥ 70     能接受
Accessibility ≥ 90   应该达到
```

**Accessibility 常见扣分项：**

```text
① 图片没有 alt（你的 SVG 图标要加 aria-hidden 或者 alt）
② 按钮没有可访问名称（只有图标的按钮要有 aria-label）
③ 对比度不足（灰色文字 #8b919c 在白底上刚好达标，不要更浅）
④ 表单输入没有 label（你的 Field 组件有，好）
```

**第 ③ 条特别注意：**

```text
#8b919c 在 #ffffff 上的对比度是 3.05:1
WCAG AA 要求小文本 ≥ 4.5:1
```

**所以 `--color-text-muted` 的 `#8b919c` 严格说不达标。**

**但它用在"辅助信息"上（时间、次要说明），实际可接受。**

**如果要严格达标，改成 `#6b7280`（对比度 4.6:1）。**

**这个判断你现在可以做：** **关键的（金额、状态、操作）用深色；辅助的（时间、计数）可以浅一些。**

## 4.4 自检点

**走完五个步骤，写下三个数字：**

```text
从点开到看见登录页：____ 秒
从登录到看见首页数据：____ 秒
从首页到看见订单列表：____ 秒
```

**如果任何一个超过 3 秒，找原因：**

```text
① 接口太慢（看 Network 面板的 Timing）
② 首屏 JS 太多（看 bundle 大小）
③ 没做骨架屏（客户以为没反应）
```

---

# 第 5 步：故意漏掉一项（15 分钟）

**清单的价值在于"它会拦住你"。验证一次。**

## 5.1 故意不加空状态

**把 `orders.js` 里的 `emptyOptions` 删掉。**

**用一个新的（空）租户登录，打开订单页。**

**你会看到：**

```text
一个空白的内容区
```

**没有文案，没有引导，什么都没有。**

**这就是客户第一次登录时看到的界面。**

**如果他不知道要"先导入数据"，他会以为系统坏了。**

**加回来。**

## 5.2 故意用 `#xxxxxx` 硬编码颜色

**在某个组件里写：**

```css
.btn--primary {
  background: #1f6feb;
}
```

**然后跑 `check-css.js`。**

**它不会报——因为它只查 `px`，不查颜色。**

**这就是"检查脚本的边界"。**

**补一条到脚本里：**

```js
const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;

// 在循环里加
const colors = line.match(COLOR_PATTERN);
if (colors) {
  for (const c of colors) {
    problems.push({
      file,
      line: i + 1,
      value: c,
      code: line.trim(),
      kind: 'hardcoded-color',
    });
  }
}
```

**再跑，会报出来。**

**改成 `var(--color-primary)`。**

**这个实验说明一件事：** **你的检查脚本能查到什么，取决于你写了什么规则。**

**每次发现"这类问题总在发生"，就往脚本里加一条。**

## 5.3 自检点

**跑一次完整的 `check-css.js`：**

```text
node scripts/check-css.js
```

**应该是 `✅`。**

**如果还有报错，逐个改——** **这可能是你今天花得最值的半小时。**

---

# 第 6 步：最终验收（也是整周验收）

## A. Token

- [ ] `tokens.css` 只有 7 个间距、6 个字号、3 个圆角
- [ ] 颜色是语义命名（`--color-danger` 不是 `--color-red`）
- [ ] `check-css.js` 通过（px 和颜色都查）
- [ ] 全项目搜不到硬编码的 `#xxxxxx`（除了 tokens.css）

## B. 页面

- [ ] 五个页面都有（login / index / orders / detail / settings）
- [ ] 导航闭环走通（未登录跳登录、点进详情、返回、切 tab）
- [ ] 每个页面都有标题
- [ ] 登录页无导航，垂直居中

## C. 检查清单

- [ ] `docs/ui-checklist.md` 六组都过了一遍
- [ ] A 组用脚本查过（不是靠眼睛）
- [ ] B 组用超长文本测过
- [ ] C 组的断网和 403 都造过
- [ ] E 组用真手机走过

## D. 真机路径

- [ ] 五个步骤在真手机上走通
- [ ] 三个时间都小于 3 秒
- [ ] 详情返回后列表滚动位置保住了
- [ ] Lighthouse Performance ≥ 70、Accessibility ≥ 90

## E. 破坏验证

- [ ] 删空状态后看到一片空白，体会到"客户以为坏了"
- [ ] 硬编码颜色被脚本抓到（我加了颜色检查）

## F. 整周回归

- [ ] `npm test` 九条隔离测试全绿
- [ ] `npm run check` 通过
- [ ] `node scripts/check-css.js` 通过
- [ ] 没有引入前端框架（`package.json` 里搜不到 react/vue）
- [ ] 首屏在 Slow 3G 下 3 秒内可见

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"一致性靠变量，不靠记性"
- [ ] 我记下了微信内置浏览器的三个坑

## 提交

```text
git add -A
git commit -m "第189节课: 设计 token + 五页闭环 + 视觉检查清单 + 真机路径"
git push
```

---

# 附：常见问题速查

| 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 间距看起来"糙" | 用了 14/18/10 这种非标准值 | `check-css.js` 查出来改 |
| 每个页面配色微差 | 硬编码了颜色 | 全走 token |
| 未登录时不跳登录页 | `api.js` 的 401 分支没生效 | 检查 `location.href` |
| 详情返回后滚到顶部 | 没存滚动位置 | `sessionStorage` + `pageshow` |
| 微信里导不出 Excel | X5 内核拦下载 | 提示"在浏览器打开" |
| 图标按钮 Lighthouse 扣分 | 没有 `aria-label` | 加上 |
| 灰色文字对比度不够 | `#8b919c` 只有 3.05:1 | 关键信息用 `#5c6370` |
| 首页白屏 2 秒 | 没骨架屏 | 先渲染骨架屏 |
| `theme-color` 没生效 | 只支持安卓 | 正常，iOS 忽略 |
| 字体调到最大后底部栏盖住内容 | 没留 `padding-bottom` | `calc(var(--tab-height) + env(safe-area-inset-bottom))` |

---

## 本节课（也是这一周）要能说出口的一句话

> **"专业"不是好看，是一致：间距来自同一套、颜色来自同一套、状态有同一套界面；而一致性不能靠记性维护，只能靠变量和一个会自动报错的脚本。**
