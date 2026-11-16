# 第 183 节课：手机上点不到按钮

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课只做一件事：**在 375px 宽的屏幕上，把界面做到"能用"。**
> 不是"能看"——能看是排版不崩；能用是**拇指够得到、不用横向滚、键盘不挡输入框**。

**建议用时**：175 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（105 分钟）一次，第 3—5 步（70 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 182 节（`saas-lab` 后端完整，但那 12 个接口都只能 curl）

---

# 第 0 步：先量一遍你现在的东西（20 分钟）

## 0.1 三种"不能用的样子"

**打开 Chrome，按 F12，点左上角的手机图标（Toggle device toolbar），选 iPhone SE（375×667）。**

**然后访问你现在的系统（如果有页面的话）。你会看到三种问题之一：**

```text
问题一：横向滚动条
  页面宽度超过 375，出现横向滚动
  右侧的内容永远看不到

问题二：字太小
  你按 1440 设计，字 14px
  在手机上看着像 8px，点不准

问题三：按钮够不到
  顶部导航、右上角的"保存"，单手拇指完全够不到
```

**这三种是不同的问题，要不同的解法。**

## 0.2 为什么"先做手机，再做桌面"

**绝大多数人的顺序：**

```text
① 在 1440px 的屏幕上做出漂亮的界面
② 加媒体查询，"适配"手机
```

**结果：**

```text
媒体查询变成了"打补丁"
每加一个组件，要在两种宽度下各调一遍
而且手机版永远是"功能少一点"的那个
```

**反过来：**

```text
① 在 375px 上做到"能用"
② 桌面版加宽、加栏、加侧边栏
```

**客户端最常打开的入口是手机。** **所以手机优先是对的，不是"照顾小屏"，是"照顾主要场景"。**

**这个方法叫 mobile-first。它的核心不是"先写手机样式"，是"先想清楚信息的主次"。**

**因为在 375px 上放不下所有东西，你被迫决定"什么最重要"。**

**这个决定做对了，桌面版自然就对。** **这个决定没做，你做出来的东西在哪个屏幕上都乱。**

---

# 第 1 步：写基础 CSS（40 分钟）

## 1.1 新建 `public/css/base.css`

```css
:root {
  --color-bg: #ffffff;
  --color-bg-subtle: #f7f8fa;
  --color-text: #1a1a1a;
  --color-text-secondary: #5c6370;
  --color-text-muted: #8b919c;
  --color-border: #e3e5e9;
  --color-primary: #1f6feb;
  --color-primary-hover: #1a5fd0;
  --color-danger: #c1121f;
  --color-success: #0a7b34;
  --color-warning: #b45309;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Consolas, 'Courier New', monospace;

  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;

  --tap-target: 44px;
  --header-height: 52px;
  --tab-height: 56px;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg-subtle);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, p, figure, blockquote, dl, dd {
  margin: 0;
}

ul, ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

img, svg, video {
  display: block;
  max-width: 100%;
}

button, input, select, textarea {
  font: inherit;
  color: inherit;
}

a {
  color: var(--color-primary);
  text-decoration: none;
}

input,
textarea,
select {
  font-size: var(--text-base);
}

table {
  border-collapse: collapse;
  width: 100%;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

## 1.2 六个必须讲清的点

### `box-sizing: border-box` 全局

**默认的 `content-box` 让 `width: 100%` 加上 `padding` 就超出容器。**

```css
/* 不加 box-sizing */
.box { width: 100%; padding: 16px; }
/* 实际宽度 = 100% + 32px → 溢出 → 横向滚动 */
```

**这就是"横向滚动条"最常见的原因。**

**全局设置一次，一辈子不用管。**

### `input, textarea, select { font-size: var(--text-base) }`

**iOS Safari 有个著名的行为：** **输入框的 `font-size` 小于 16px 时，聚焦会自动放大页面。**

```text
客户点输入框 → 页面放大 → 他看不见上下文了 → 手动缩回去 → 又点输入框 → 又放大
```

**这个 bug 让无数客户放弃填表。**

**解法：输入框的 `font-size` 必须 ≥ 16px。**

**注意：这个规则只对 `input` 有效，不对 `div` 有效。** **所以正文可以是 14px，输入框必须 16px。**

**这一条值得单独记在笔记里。** **它是最容易被忽略、影响最大的一个细节。**

### `-webkit-text-size-adjust: 100%`

**防止 iOS 在横屏时自动放大字体。**

**不加的话，客户横过手机，字体突然变大，布局全乱。**

### `--tap-target: 44px`

**Apple 的人机界面指南说：可点击区域不应小于 44×44pt。**

**Google 的 Material Design 说：48×48dp。**

**取 44px 是安全值。**

**这个变量后面所有按钮、图标按钮、列表项都要用。**

### 中文系统的字体栈

```css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
  'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
```

**顺序有意义：**

```text
-apple-system        iOS / macOS 的系统字体
BlinkMacSystemFont   Chrome on Mac
'Segoe UI'           Windows 的英文
'PingFang SC'        macOS / iOS 中文
'Hiragino Sans GB'   老版 macOS 中文
'Microsoft YaHei'    Windows 中文
sans-serif           兜底
```

**为什么英文在前：** 英文字体先匹配，中文字体只负责中文。**这样英文的数字和字母更好看。**

**这个顺序几乎所有中文网站都用，直接用。**

### `margin: 0` 重置

**不同浏览器对 `h1`、`p`、`ul` 的默认 `margin` 不一样。**

**不重置的话，你的间距在 Chrome 里对，在 Safari 里不一样。**

**重置一遍，所有间距都是你自己控制的。**

## 1.3 自检点

**建一个测试页 `public/test.html`：**

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>基础 CSS 测试</title>
<link rel="stylesheet" href="/css/base.css">
<style>
  body { padding: 16px; }
  .row { margin-bottom: 24px; }
  h2 { font-size: 18px; margin-bottom: 8px; }
</style>
</head>
<body>
  <div class="row">
    <h2>标题层级</h2>
    <p style="font-size:22px">22px 标题</p>
    <p style="font-size:16px">16px 正文</p>
    <p style="font-size:14px;color:#5c6370">14px 辅助文字</p>
  </div>

  <div class="row">
    <h2>输入框（在手机上点一下，看会不会放大）</h2>
    <input type="text" placeholder="点我" style="width:100%;padding:12px;border:1px solid #e3e5e9;border-radius:8px;margin-bottom:8px">
    <input type="text" placeholder="再点我" style="width:100%;padding:12px;border:1px solid #e3e5e9;border-radius:8px">
  </div>

  <div class="row">
    <h2>长文本换行</h2>
    <p>这是一段很长很长的文字用来测试在窄屏下的换行行为看看会不会撑破容器导致横向滚动条出现如果出现了说明哪里写错了。</p>
    <p style="word-break:break-all">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA</p>
  </div>
</body>
</html>
```

**用真手机访问（同一个 WiFi，访问你的电脑 IP + 端口），或者用 Chrome 的设备模拟。**

**三个检查：**

```text
① 有没有横向滚动条 → 不能有
② 点输入框会不会放大页面 → 不能放大
③ 长英文串会不会撑破 → 不能撑破
```

**服务端要能提供静态文件。**

**如果 `server.js` 还没配静态目录，加上：**

```js
app.use(express.static(path.join(__dirname, '..', 'public')));
```

**注意放在所有 API 路由之后。**

---

# 第 2 步：写布局（45 分钟）

## 2.1 移动端的三种布局

```text
① 顶部导航 + 内容（最常用）
   ┌──────────────┐
   │ ← 标题    ⋯  │  ← 52px 固定
   ├──────────────┤
   │              │
   │   内容区      │  ← 滚动
   │              │
   ├──────────────┤
   │ 首页 订单 我的 │  ← 56px 固定（可选）
   └──────────────┘

② 顶部导航 + 内容（无底部栏）
   用于二级页面（详情、表单）

③ 全屏内容
   用于登录页、引导页
```

## 2.2 新建 `public/css/layout.css`

```css
.app {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-subtle);
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: var(--header-height);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  padding-top: env(safe-area-inset-top);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.app-header__back,
.app-header__action {
  min-width: var(--tap-target);
  min-height: var(--tap-target);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 calc(var(--space-2) * -1);
  border: 0;
  background: transparent;
  font-size: var(--text-lg);
  cursor: pointer;
}

.app-header__title {
  flex: 1;
  font-size: var(--text-lg);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-main {
  flex: 1;
  padding: var(--space-4);
  padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom));
  overflow-x: hidden;
}

.app-tabbar {
  position: sticky;
  bottom: 0;
  z-index: 50;
  height: var(--tab-height);
  display: flex;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
}

.app-tabbar__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
}

.app-tabbar__item[aria-current='page'] {
  color: var(--color-primary);
  font-weight: 600;
}

.card {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}

.card--flush {
  padding: 0;
  overflow: hidden;
}

.stack > * + * {
  margin-top: var(--space-3);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.row--between {
  justify-content: space-between;
}

.row__grow {
  flex: 1;
  min-width: 0;
}

@media (min-width: 768px) {
  .app-main {
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
    padding: var(--space-6);
  }
}

@media (min-width: 1024px) {
  .app-main {
    max-width: 880px;
  }
}
```

## 2.3 六个关键点

### `100dvh` 而不是 `100vh`

```css
min-height: 100vh;
min-height: 100dvh;   /* 新浏览器用这个 */
```

**`vh` 在移动端的问题是：手机浏览器的地址栏会隐藏/显示，`100vh` 永远是"地址栏显示时"的高度。**

**结果：**

```text
地址栏隐藏后，页面底部有一段空白
或者：内容超出，出现纵向滚动
```

**`dvh`（dynamic viewport height）是"当前实际可视高度"。**

**两行都写：旧的浏览器用 `vh`，新的用 `dvh`。** **不支持 `dvh` 的浏览器会忽略第二行。**

**这是 CSS 的"渐进增强"写法，很常用。**

### `env(safe-area-inset-*)`

**iPhone X 之后有"刘海"和底部横条。**

**不加 `safe-area-inset-bottom`：**

```text
底部导航栏被 iPhone 的"横条"挡住
客户点不动"我的"
```

**`padding-bottom: env(safe-area-inset-bottom)` 在需要的地方留出那段空间。**

**另外要在 `<meta viewport>` 里加 `viewport-fit=cover`，否则 `env()` 永远是 0。**

**这两个必须配套。** **少一个都没用。**

### `position: sticky` 而不是 `fixed`

**`fixed` 的问题：**

```text
fixed 元素脱离文档流
iOS 上键盘弹出时，fixed 元素会跑到屏幕外或者压在键盘上
```

**`sticky` 的问题：**

```text
它只在滚动容器内生效
如果父元素有 overflow: hidden，sticky 会失效
```

**这一节用 `sticky`，因为：**

```text
① 不会有 iOS 键盘的问题
② 结构更简单（不需要给内容加 padding-top）
```

**注意 `top: 0` 和 `bottom: 0` 要写上。** **不写 `top`，`sticky` 不知道该粘在哪。**

### `min-width: 0` 那个小东西

```css
.row__grow {
  flex: 1;
  min-width: 0;
}
```

**为什么不写 `min-width: 0` 会出问题：**

**Flex 子项的默认 `min-width` 是 `auto`，意思是"不能小于内容的宽度"。**

```html
<div class="row">
  <div class="row__grow">一段非常非常长的文字...</div>
  <button>按钮</button>
</div>
```

**长文字撑破了容器，按钮被挤出去。**

**加 `min-width: 0` 才能让 `overflow: hidden` / `text-overflow: ellipsis` 生效。**

**这个坑在"列表项 + 右侧操作按钮"的布局里 100% 会遇到。** **记住它。**

### 媒体查询只调宽，不改结构

```css
@media (min-width: 768px) {
  .app-main { max-width: 720px; margin: 0 auto; }
}
```

**只做两件事：限制最大宽度、居中。**

**为什么不改成"桌面版布局"（侧边栏 + 内容区）：**

**因为你现在只有 5—15 个页面。** **侧边栏在有 3 个菜单项的时候很难看，在 30 个菜单项的时候才有用。**

**而且改结构意味着要维护两套布局逻辑。**

**这条取舍写进笔记：**

```text
页面少于 10 个 → 单列居中，不做侧边栏
页面 10—30 个 → 加侧边栏（但手机端还是单列）
页面 30 个以上 → 才需要真正的"响应式布局系统"
```

### `.card--flush` 这个变体

**列表项外面包卡片时，卡片的内边距要去掉（列表项自己带内边距）。**

**不用变体的话，你会在每个列表页写 `style="padding:0"`。**

**组件变体比内联样式好，因为改一处就全变了。**

## 2.4 自检点：做一个真实页面

**新建 `public/orders.html`：**

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>订单 · 业务助手</title>
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/layout.css">
<link rel="stylesheet" href="/css/components.css">
</head>
<body>
<div class="app">
  <header class="app-header">
    <div class="app-header__title">订单</div>
    <button class="app-header__action" aria-label="筛选">⋯</button>
  </header>

  <main class="app-main">
    <div id="app-content">
      <div class="card">
        <p>加载中……</p>
      </div>
    </div>
  </main>

  <nav class="app-tabbar">
    <button class="app-tabbar__item" data-tab="home">
      <span>首页</span>
    </button>
    <button class="app-tabbar__item" aria-current="page" data-tab="orders">
      <span>订单</span>
    </button>
    <button class="app-tabbar__item" data-tab="settings">
      <span>设置</span>
    </button>
  </nav>
</div>
<script src="/js/api.js"></script>
<script>
  // 先只验证布局，脚本下一步再加
</script>
</body>
</html>
```

**在 Chrome 的 375px 模拟下看，五个检查：**

```text
① 顶部栏高度 52px，标题居中偏左
② 底部分栏三格均分，图标+文字
③ 中间内容区可以滚动
④ 没有横向滚动条
⑤ 把内容改多（复制 20 个卡片），底部栏还固定在下面
```

**第 ⑤ 条最容易出问题。** **如果底部栏跟着内容滚上去了，说明你用的不是 `sticky` 或 `fixed`，或者父元素有 `overflow`。**

---

# 第 3 步：组件 CSS（35 分钟）

## 3.1 新建 `public/css/components.css`

```css
.btn {
  min-height: var(--tap-target);
  padding: 0 var(--space-4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.btn:active {
  opacity: 0.75;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.btn--danger {
  background: var(--color-danger);
  color: #fff;
}

.btn--ghost {
  border-color: var(--color-border);
}

.btn--block {
  display: flex;
  width: 100%;
}

.btn--sm {
  min-height: 36px;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
}

.field {
  margin-bottom: var(--space-4);
}

.field__label {
  display: block;
  margin-bottom: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.field__label--required::after {
  content: ' *';
  color: var(--color-danger);
}

.input {
  display: block;
  width: 100%;
  min-height: var(--tap-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-base);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.12);
}

.input--error {
  border-color: var(--color-danger);
}

.input--error:focus {
  box-shadow: 0 0 0 3px rgba(193, 18, 31, 0.12);
}

textarea.input {
  padding: var(--space-3);
  min-height: 96px;
  resize: vertical;
  line-height: 1.6;
}

.field__error {
  display: none;
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-danger);
}

.field--invalid .field__error {
  display: block;
}

.field__hint {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.list {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.list__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.list__item:last-child {
  border-bottom: 0;
}

.list__item:active {
  background: var(--color-bg-subtle);
}

.list__main {
  flex: 1;
  min-width: 0;
}

.list__title {
  font-size: var(--text-base);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list__meta {
  margin-top: 2px;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list__amount {
  font-size: var(--text-lg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 500;
  white-space: nowrap;
}

.badge--pending { background: #fff4e5; color: var(--color-warning); }
.badge--paid { background: #e7f6ec; color: var(--color-success); }
.badge--refunded { background: #eef0f3; color: var(--color-text-muted); }
.badge--danger { background: #fdecee; color: var(--color-danger); }

.empty {
  padding: var(--space-7) var(--space-4);
  text-align: center;
}

.empty__title {
  font-size: var(--text-base);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.empty__text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
}

.skeleton {
  background: linear-gradient(90deg, #eef0f3 25%, #f7f8fa 50%, #eef0f3 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--tab-height) + var(--space-4) + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  max-width: calc(100% - var(--space-6));
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(26, 26, 26, 0.92);
  color: #fff;
  font-size: var(--text-sm);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
}

.toast--show {
  opacity: 1;
  transform: translateX(-50%) translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 3.2 五个关键点

### `min-height: var(--tap-target)` 而不是 `height`

**用 `height` 的话，文字长了会被裁掉。**

**用 `min-height`，内容多了自动长高。**

**所有可点击元素都用 `min-height: 44px`。**

### `-webkit-tap-highlight-color: transparent`

**手机浏览器点击时会有一块灰色高亮。**

**它会盖住你的 `:active` 效果，看起来像"没反应"。**

**关掉它，用自己的 `:active { opacity: 0.75 }`。**

**这个细节让"点上去有反馈"变得可控。** **没有反馈的按钮，客户会连点三次。**

### `font-variant-numeric: tabular-nums`

**金额用等宽数字。**

**不等宽的话：**

```text
¥1,299.00
¥899.00      ← 小数点对不齐，看着乱
¥12,000.00
```

**等宽之后：**

```text
¥1,299.00
¥  899.00
¥12,000.00
```

**一列金额能对齐，客户扫一眼就能比较大小。**

**一个 CSS 属性，效果很明显。**

### `skeleton` 而不是"加载中……"

**"加载中"三个字的问题：**

```text
客户不知道要等多久
客户不知道加载完是什么样
内容出现时页面"跳"一下
```

**骨架屏（skeleton）解决三个问题：**

```text
形状就是内容的形状 → 客户知道会出来什么
有动画 → 客户知道"它在动"
位置固定 → 内容出现时不跳动
```

**这一节用骨架屏，第 185 节会完整实现四态。**

### `@media (prefers-reduced-motion: reduce)`

**有些用户（前庭功能障碍）会对动画不适。**

**系统里开了"减少动态效果"，你的动画应该关掉。**

**这不是"讲究"，是一行代码的事。** **而且它也能让低端设备省电。**

## 3.3 自检点：做一个完整的订单列表

**新建 `public/js/ui.js`：**

```js
const fmtMoney = (cents) => {
  const yuan = Math.floor(Math.abs(cents) / 100);
  const fen = String(Math.abs(cents) % 100).padStart(2, '0');
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (cents < 0 ? '-' : '') + '¥' + grouped + '.' + fen;
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

const STATUS_TEXT = {
  pending: '待支付',
  paid: '已支付',
  refunding: '退款中',
  refunded: '已退款',
  expired: '已过期',
  canceled: '已取消',
};

const STATUS_CLASS = {
  pending: 'badge--pending',
  paid: 'badge--paid',
  refunding: 'badge--pending',
  refunded: 'badge--refunded',
  expired: 'badge--refunded',
  canceled: 'badge--refunded',
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderOrderItem(o) {
  return `
    <div class="list__item" data-id="${escapeHtml(o.id)}">
      <div class="list__main">
        <div class="list__title">${escapeHtml(o.order_no)}</div>
        <div class="list__meta">
          ${escapeHtml(o.customer_name)} · ${fmtDate(o.order_date)}
        </div>
      </div>
      <div style="text-align:right">
        <div class="list__amount">${fmtMoney(o.amount_cents)}</div>
        <span class="badge ${STATUS_CLASS[o.status] || ''}">
          ${STATUS_TEXT[o.status] || o.status}
        </span>
      </div>
    </div>
  `;
}

function renderOrderList(orders) {
  return `<div class="list">${orders.map(renderOrderItem).join('')}</div>`;
}

function renderSkeletonList(count = 5) {
  return `
    <div class="list">
      ${Array.from({ length: count })
        .map(
          () => `
        <div class="list__item">
          <div class="list__main">
            <div class="skeleton" style="height:16px;width:55%;margin-bottom:6px"></div>
            <div class="skeleton" style="height:14px;width:75%"></div>
          </div>
          <div style="text-align:right">
            <div class="skeleton" style="height:18px;width:72px;margin-bottom:6px"></div>
            <div class="skeleton" style="height:14px;width:48px"></div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function renderEmpty({ title, text, actionLabel, actionHref }) {
  return `
    <div class="card">
      <div class="empty">
        <div class="empty__title">${escapeHtml(title)}</div>
        <div class="empty__text">${escapeHtml(text || '')}</div>
        ${
          actionLabel
            ? `<a class="btn btn--primary" href="${escapeHtml(actionHref || '#')}">${escapeHtml(actionLabel)}</a>`
            : ''
        }
      </div>
    </div>
  `;
}

function toast(message, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('toast--show'));

  setTimeout(() => {
    el.classList.remove('toast--show');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

window.UI = {
  fmtMoney,
  fmtDate,
  escapeHtml,
  renderOrderItem,
  renderOrderList,
  renderSkeletonList,
  renderEmpty,
  toast,
  STATUS_TEXT,
  STATUS_CLASS,
};
```

**改 `orders.html` 的脚本部分，用假数据先看效果：**

```html
<script src="/js/ui.js"></script>
<script>
  const box = document.getElementById('app-content');

  box.innerHTML = UI.renderSkeletonList(5);

  setTimeout(() => {
    const fake = [
      { id: '1', order_no: 'P2601A', customer_name: '杭州甲乙公司', order_date: '2026-11-16', amount_cents: 129900, status: 'paid' },
      { id: '2', order_no: 'P2602B', customer_name: '上海丙丁集团', order_date: '2026-11-15', amount_cents: 89900, status: 'pending' },
      { id: '3', order_no: 'P2603C', customer_name: '广州戊己公司', order_date: '2026-11-14', amount_cents: 1200000, status: 'refunded' },
      { id: '4', order_no: 'P2604D', customer_name: '这是一个特别特别长的客户名称用来测试省略号是否生效', order_date: '2026-11-13', amount_cents: 500, status: 'expired' },
    ];
    box.innerHTML = UI.renderOrderList(fake);
  }, 1200);
</script>
```

## 3.4 五个必须检查的细节

```text
① 375px 下三条金额对齐了吗（tabular-nums 生效了吗）
② 第四个特别长的客户名，被省略号截断了吗（没撑破布局）
③ 骨架屏的形状像不像真实的列表
④ 点一下列表项，有没有变灰的反馈
⑤ 把状态改成不认识的（比如 status: 'unknown'），会不会显示成空
```

**第 ⑤ 条是为了测试防御性：** **如果后端加了一个新状态，前端不该显示成空白。**

**现在的代码会显示原始值 `unknown`——比空白好，但仍然不友好。**

**第 185 节会处理"未知状态"的兜底。**

---

# 第 4 步：真机测试（20 分钟）

**模拟器不等于真机。** **有三个东西模拟器测不出来：**

```text
① 实际的触摸精度（拇指 vs 鼠标）
② 系统字体大小设置（客户可能把手机字体调大了）
③ 键盘弹起时的遮挡
```

## 4.1 用真手机访问

**查你的电脑 IP：**

```text
ipconfig
```

**找 IPv4 地址，比如 `192.168.1.100`。**

**手机连同一个 WiFi，浏览器访问：**

```text
http://192.168.1.100:3000/orders.html
```

**注意：**

```text
Windows 防火墙可能拦。第一次访问会弹窗，选"允许"
如果还是不通，检查 `server.js` 是不是只监听了 localhost
```

**如果 `app.listen(port)` 没写 host，默认监听所有网卡，应该能通。**

**如果有 `app.listen(port, '127.0.0.1')`，改成 `'0.0.0.0'` 或者去掉第二个参数。**

## 4.2 五个真机检查

```text
① 单手能点到顶部右边那个"⋯"吗
② 底部三个 tab 都能点准吗
③ 把系统字体调到最大，布局还正常吗
④ 横屏，布局崩了吗
⑤ 双击缩放，会误触发吗
```

**第 ③ 条最容易被忽略。**

**手机系统字体调到"特大"时：**

```text
你写的 14px 会变成 20px 左右
固定高度 52px 的顶部栏会装不下
按钮文字会溢出
```

**解法：**

```css
.app-header {
  min-height: var(--header-height);    /* 不用 height */
}

.list__item {
  min-height: 56px;                    /* 不用 height */
}
```

**把所有固定的 `height` 改成 `min-height`。**

**这个改动一行，能救回一批用大字体手机的客户（中老年客户比例不低）。**

**第 ⑤ 条：双击缩放。**

**`<meta viewport>` 里如果写了 `user-scalable=no`，会禁止缩放——** **这是无障碍问题，而且 iOS 10 以后会忽略这个设置。**

**正确的做法：** **不禁用缩放，但用 `touch-action: manipulation` 消除双击缩放的延迟和误触。**

```css
.btn, .list__item {
  touch-action: manipulation;
}
```

---

# 第 5 步：故意做一次错（15 分钟）

**三个最常见的移动端错误，你要亲手撞一次。**

## 5.1 错误一：写死宽度

**给 `.app-main` 加：**

```css
.app-main {
  width: 1200px;
}
```

**在 375px 下看：横向滚动条出现了，右侧内容看不到。**

**改回来。** **然后记住这句话：**

```text
移动端布局里，不要出现任何固定的 width（除了 max-width）
```

**例外：图标、头像、徽标这类"尺寸固定的小元素"。**

## 5.2 错误二：固定高度

**给 `.list__item` 加：**

```css
.list__item {
  height: 56px;
}
```

**然后在真机上把系统字体调到最大（或者把某个客户名改得很长）。**

**文字溢出了，压在下一行上。**

**改成 `min-height: 56px`，正常了。**

## 5.3 错误三：忘了 `min-width: 0`

**把 `ui.js` 里的 `list__main` 的 `min-width: 0` 删掉：**

```css
.list__main {
  flex: 1;
  /* min-width: 0; 删掉 */
}
```

**然后用那个"特别特别长的客户名称"的数据。**

**金额和状态被挤出容器，或者整行横向溢出。**

**加回来，正常。**

**这个坑 100% 会在这个布局里遇到。** **今天撞一次，以后写 `<div class="flex-1"><span class="truncate">` 时你会条件反射地加 `min-width: 0`。**

---

# 第 6 步：最终验收

## A. 基础

- [ ] `base.css` 有 `box-sizing: border-box` 全局
- [ ] 输入框 `font-size` 是 16px（真机上点不放大）
- [ ] 有 `-webkit-text-size-adjust: 100%`
- [ ] 有 `--tap-target: 44px` 变量
- [ ] 中文字体栈按顺序写了

## B. 布局

- [ ] 顶部栏用 `sticky` + `top: 0`
- [ ] 底部栏用 `sticky` + `bottom: 0`
- [ ] 有 `env(safe-area-inset-*)` + viewport 的 `viewport-fit=cover`
- [ ] 用 `100dvh` 兜底 `100vh`
- [ ] 375px 下没有横向滚动条

## C. 组件

- [ ] 按钮都是 `min-height: 44px`
- [ ] 输入框有 `:focus` 的可视反馈
- [ ] 金额用 `tabular-nums`
- [ ] 有骨架屏，不只是"加载中"

## D. 真机

- [ ] 用真手机访问过（不是只用模拟器）
- [ ] 单手能点到所有按钮
- [ ] 系统字体调到最大，布局不崩
- [ ] 横屏不崩

## E. 三个错误

- [ ] 我写死过 `width: 1200px`，看到横向滚动
- [ ] 我写过 `height: 56px`，看到文字溢出
- [ ] 我删过 `min-width: 0`，看到金额被挤出去

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"输入框 font-size 必须 16px"
- [ ] 我记下了"min-width: 0 是干什么的"

## 提交

```text
git add -A
git commit -m "第183节课: 移动端基础 CSS + 三段式布局 + 组件样式"
git push
```

---

# 附：常见问题速查

| 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 有横向滚动条 | 某个元素 `width` 写死了，或者 `padding` 没算进 `box-sizing` | 全局 `border-box`；搜 `width:` 改成 `max-width` |
| 输入框聚焦时页面放大 | `font-size` < 16px | `input { font-size: 16px }` |
| 底部栏被 iPhone 挡住 | 没有 `safe-area-inset-bottom` | 加 `padding-bottom: env(...)` + `viewport-fit=cover` |
| `env()` 一直是 0 | viewport 里没写 `viewport-fit=cover` | 加上 |
| 顶部栏跟着内容滚 | 用了 `position: static`，或者父元素有 `overflow` | 用 `sticky` + `top: 0`，去掉父元素的 `overflow` |
| 长文字撑破布局 | flex 子项缺 `min-width: 0` | 加上 |
| 按钮点不准 | `min-height` 小于 44px | 改成 44px |
| 点按钮有灰色方块 | `-webkit-tap-highlight-color` 默认值 | 设成 `transparent` |
| 金额小数点不齐 | 数字不等宽 | `font-variant-numeric: tabular-nums` |
| 大字体下布局崩 | 用了固定 `height` | 全部改 `min-height` |
| 横屏字体突然变大 | 缺 `text-size-adjust` | 加 `-webkit-text-size-adjust: 100%` |
| 真机访问不了 | 防火墙，或者只监听了 127.0.0.1 | 允许防火墙；`listen(port)` 不带 host |

---

## 本节课要能说出口的一句话

> **移动端不是"缩小版的桌面"，是"拇指 + 一只手 + 会弹键盘"的完全不同的场景；所以在 375px 上先做到能用，是唯一不会返工的顺序。**
