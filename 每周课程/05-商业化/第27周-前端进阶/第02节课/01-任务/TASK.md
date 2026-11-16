# 第 184 节课：别写一千行的页面

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你做出了第一个页面。如果你照着自己的习惯写，`orders.html` 里现在有 200 行 HTML、150 行 CSS、200 行 JS 混在一起。
> **再加三个页面，你就会开始复制粘贴；加五个页面，改一个样式要改五处。**

**建议用时**：140 分钟
**你需要先完成**：第 183 节（`orders.html` 在 375px 下能用）

---

# 第 0 步：先看清"一千行页面"的代价（15 分钟）

## 0.1 三个具体的痛

**第一：改一个颜色要改五处**

```html
<!-- orders.html -->
<span style="color: #0a7b34">已支付</span>

<!-- approvals.html -->
<span style="color: #0a7b34">已通过</span>

<!-- settings.html -->
<span style="color: rgb(10, 123, 52)">正常</span>
```

**你想把"成功色"改深一点，要搜遍所有文件。**

**第二：同一个列表写了四遍**

```text
orders.html      订单列表
approvals.html   审批列表
contacts.html    成员列表
files.html       文件列表
```

**四份几乎一样的 HTML 结构，只有字段名不同。**

**客户说"列表项右边能不能加一个删除按钮"——你要改四处，而且很可能漏一处。**

**第三：新人（或者三个月后的你）看不懂**

```html
<div class="app-main">
  <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:500">P2601A</div>
        <div style="font-size:14px;color:#8b919c">杭州甲乙公司 · 2026-11-16</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:600">¥1,299.00</div>
        <span style="background:#e7f6ec;color:#0a7b34;padding:2px 8px;border-radius:999px;font-size:12px">已支付</span>
      </div>
    </div>
  </div>
</div>
```

**这段代码没有错。但它把"结构"和"样式"混在一起，** **你想改"所有卡片的内边距"，只能一个个找。**

## 0.2 拆分的三个层次

**不是"把代码拆成文件"这么简单。要按三个层次拆：**

```text
第一层：样式 → CSS 文件（上节课做了）
第二层：结构 → 可复用的渲染函数（这节课做）
第三层：数据 → 状态管理 + 请求（第 185 节做）
```

**这一节做第二层：把"一段 HTML"变成"一个函数"。**

## 0.3 一个必须接受的取舍

**不用框架，就没有"组件"这个现成的东西。**

**React 的组件是：**

```jsx
function OrderItem({ order }) {
  return <div>...</div>;
}
```

**原生的等价物是：**

```js
function orderItem(order) {
  return `<div>...</div>`;
}
```

**差别在哪：**

| | React | 原生模板字符串 |
|---|---|---|
| 状态更新 | 自动重渲染 | 手动 `innerHTML` |
| 事件绑定 | 声明式 | 手动 `addEventListener` |
| 性能 | 虚拟 DOM diff | 整体替换 |
| 心智负担 | 要学 hooks / 生命周期 | 就是字符串拼接 |

**对"表单 + 列表 + 详情"这类页面，原生的差别可以忽略。**

**但有一个坑必须提前防：**

```js
// ❌ 这样会把用户输入当 HTML 执行（XSS）
element.innerHTML = `<div>${userInput}</div>`;
```

**所以每个插值都必须 `escapeHtml`。**

**这一节的每个渲染函数都带了 `escapeHtml`，你抄的时候别省。**

---

# 第 1 步：定一套命名规则（20 分钟）

**在拆之前先定规则。不定规则，拆完还是乱的。**

## 1.1 三层命名

```text
区块（Block）    页面上的一个独立区域     app-header / app-tabbar / order-list
组件（Component） 可复用的最小单元        list-item / badge / empty-state
变体（Variant）   同一组件的不同形态      btn--primary / badge--paid
```

**规则：**

```text
区块用名词：      order-list / approval-card / settings-form
组件用名词：      list-item / form-field / toast
变体用双横线：    btn--primary / input--error
状态用 is- 前缀： is-loading / is-empty / is-error
```

**为什么加 `is-` 前缀：** **因为"状态"和"变体"是两个维度。**

```html
<button class="btn btn--primary is-loading">保存</button>
```

**这个按钮：外观是主按钮（变体），当前正在加载（状态）。**

**混在一起写成 `btn--loading` 会让你以后分不清"这是一个独立样式"还是"一个临时状态"。**

## 1.2 文件划分

**新建两个 JS 文件，职责分开：**

```text
public/js/ui.js       纯渲染函数，不碰网络、不碰状态
public/js/pages.js    页面级逻辑（组装 ui 的零件 + 调接口）
```

**为什么分开：**

```text
ui.js    可以被任何页面 import，且不依赖 api.js
pages.js 依赖 api.js / ui.js，每个页面一段
```

**这样 `ui.js` 里永远不会出现 `fetch`，** **而"渲染函数里偷偷发请求"是最容易让代码变乱的做法。**

## 1.3 自检点

**先看一眼你现在的 `orders.html`，数一下：**

```text
HTML 里有多少行是"写死的结构"？
CSS 里有多少条规则只在一个页面用过？
JS 里有多少行是"拼字符串"？
```

**把这三个数字记在笔记里。**

**拆完之后你会看到它们都变小了。** **这是拆分成败的唯一硬指标。**

---

# 第 2 步：拆出基础组件（50 分钟）

## 2.1 重写 `public/js/ui.js`

**这次不是"几个函数"，是一套组件。**

```js
// ---------- 基础工具 ----------

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attrs(map) {
  return Object.entries(map)
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? k : `${k}="${escapeHtml(v)}"`))
    .join(' ');
}

// ---------- 格式化 ----------

const money = (cents) => {
  const yuan = Math.floor(Math.abs(cents) / 100);
  const fen = String(Math.abs(cents) % 100).padStart(2, '0');
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (cents < 0 ? '-' : '') + '¥' + grouped + '.' + fen;
};

const date = (input, opts = {}) => {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const style = opts.withTime ? 'dateTime' : 'date';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: style,
    timeZone: 'Asia/Shanghai',
  }).format(d);
};

const relative = (input) => {
  if (!input) return '';
  const ms = Date.now() - new Date(input).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const h = Math.floor(min / 60);
  if (h < 24) return h + ' 小时前';
  const d = Math.floor(h / 24);
  if (d < 30) return d + ' 天前';
  return date(input);
};

const text = (s, fallback = '—') => (s == null || s === '' ? fallback : String(s));

// ---------- 组件 ----------

function Badge({ kind = 'default', label }) {
  return `<span class="badge badge--${escapeHtml(kind)}">${escapeHtml(label)}</span>`;
}

function Button({
  label,
  variant = 'default',
  block = false,
  size = '',
  href = '',
  type = 'button',
  disabled = false,
  loading = false,
  action = '',
  testId = '',
}) {
  const cls = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    block ? 'btn--block' : '',
    size ? `btn--${size}` : '',
    loading ? 'is-loading' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const common = {
    class: cls,
    disabled: disabled || loading,
    'data-action': action || null,
    'data-testid': testId || null,
  };

  const inner = loading
    ? `<span class="btn__spinner" aria-hidden="true"></span><span>处理中</span>`
    : escapeHtml(label);

  if (href && !disabled && !loading) {
    return `<a ${attrs({ ...common, href, role: 'button' })}>${inner}</a>`;
  }

  return `<button ${attrs({ ...common, type })}>${inner}</button>`;
}

function Field({
  name,
  label,
  type = 'text',
  value = '',
  placeholder = '',
  required = false,
  hint = '',
  error = '',
  autocomplete = '',
  inputmode = '',
  maxlength = '',
  rows = '',
}) {
  const invalid = error ? 'field--invalid' : '';
  const inputCls = ['input', error ? 'input--error' : ''].filter(Boolean).join(' ');

  const control =
    type === 'textarea'
      ? `<textarea ${attrs({
          class: inputCls,
          id: name,
          name,
          placeholder,
          rows: rows || 4,
          maxlength: maxlength || null,
        })}>${escapeHtml(value)}</textarea>`
      : `<input ${attrs({
          class: inputCls,
          id: name,
          name,
          type,
          value,
          placeholder,
          autocomplete: autocomplete || null,
          inputmode: inputmode || null,
          maxlength: maxlength || null,
        })}>`;

  return `
    <div class="field ${invalid}" data-field="${escapeHtml(name)}">
      <label ${attrs({
        class: 'field__label' + (required ? ' field__label--required' : ''),
        for: name,
      })}>${escapeHtml(label)}</label>
      ${control}
      ${hint ? `<div class="field__hint">${escapeHtml(hint)}</div>` : ''}
      <div class="field__error" data-error-for="${escapeHtml(name)}">${escapeHtml(error)}</div>
    </div>
  `;
}

function ListItem({ id, title, meta, right, rightSub, action = '', href = '' }) {
  const body = `
    <div class="list__main">
      <div class="list__title">${escapeHtml(title)}</div>
      ${meta ? `<div class="list__meta">${escapeHtml(meta)}</div>` : ''}
    </div>
    ${
      right || rightSub
        ? `<div class="list__side">
             ${right ? `<div class="list__amount">${escapeHtml(right)}</div>` : ''}
             ${rightSub || ''}
           </div>`
        : ''
    }
  `;

  if (href) {
    return `<a class="list__item" href="${escapeHtml(href)}" ${attrs({
      'data-id': id,
      'data-action': action || null,
    })}>${body}</a>`;
  }

  return `<div class="list__item" ${attrs({
    'data-id': id,
    'data-action': action || null,
    role: 'button',
    tabindex: '0',
  })}>${body}</div>`;
}

function List({ items, emptyText = '暂无数据' }) {
  if (!items || items.length === 0) {
    return EmptyState({ title: '还没有数据', text: emptyText });
  }
  return `<div class="list">${items.join('')}</div>`;
}

function EmptyState({ title, text: desc, actionLabel, actionHref, action = '' }) {
  return `
    <div class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="8" y="12" width="24" height="18" rx="3" stroke="#c8ccd4" stroke-width="2"/>
          <path d="M8 18h24" stroke="#c8ccd4" stroke-width="2"/>
        </svg>
      </div>
      <div class="empty-state__title">${escapeHtml(title)}</div>
      ${desc ? `<div class="empty-state__text">${escapeHtml(desc)}</div>` : ''}
      ${
        actionLabel
          ? Button({
              label: actionLabel,
              variant: 'primary',
              href: actionHref,
              action,
            })
          : ''
      }
    </div>
  `;
}

function ErrorState({ title = '加载失败', message, retryAction = 'retry' }) {
  return `
    <div class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="13" stroke="#c1121f" stroke-width="2"/>
          <path d="M20 13v9" stroke="#c1121f" stroke-width="2" stroke-linecap="round"/>
          <circle cx="20" cy="27" r="1.5" fill="#c1121f"/>
        </svg>
      </div>
      <div class="empty-state__title">${escapeHtml(title)}</div>
      ${message ? `<div class="empty-state__text">${escapeHtml(message)}</div>` : ''}
      ${Button({ label: '重试', variant: 'primary', action: retryAction })}
    </div>
  `;
}

function SkeletonList(count = 5) {
  return `
    <div class="list" aria-hidden="true">
      ${Array.from({ length: count })
        .map(
          () => `
        <div class="list__item">
          <div class="list__main">
            <div class="skeleton" style="height:16px;width:55%;margin-bottom:6px"></div>
            <div class="skeleton" style="height:14px;width:75%"></div>
          </div>
          <div class="list__side">
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

function Section({ title, extra, body }) {
  return `
    <section class="section">
      ${title ? `<div class="section__head"><h2 class="section__title">${escapeHtml(title)}</h2>${extra || ''}</div>` : ''}
      ${body}
    </section>
  `;
}

function Card({ body, flush = false }) {
  return `<div class="card${flush ? ' card--flush' : ''}">${body}</div>`;
}

function PageHeader({ title, back = '', actionLabel = '', action = '' }) {
  return `
    <header class="app-header">
      ${back ? `<a class="app-header__back" href="${escapeHtml(back)}" aria-label="返回">‹</a>` : ''}
      <div class="app-header__title">${escapeHtml(title)}</div>
      ${
        actionLabel
          ? `<button class="app-header__action" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>`
          : ''
      }
    </header>
  `;
}

function TabBar({ active }) {
  const tabs = [
    { key: 'home', label: '首页', href: '/index.html' },
    { key: 'orders', label: '订单', href: '/orders.html' },
    { key: 'settings', label: '设置', href: '/settings.html' },
  ];

  return `
    <nav class="app-tabbar">
      ${tabs
        .map(
          (t) => `
        <a class="app-tabbar__item" href="${t.href}" ${t.key === active ? 'aria-current="page"' : ''}>
          ${escapeHtml(t.label)}
        </a>
      `
        )
        .join('')}
    </nav>
  `;
}

window.UI = {
  escapeHtml,
  attrs,
  money,
  date,
  relative,
  text,
  Badge,
  Button,
  Field,
  ListItem,
  List,
  EmptyState,
  ErrorState,
  SkeletonList,
  Section,
  Card,
  PageHeader,
  TabBar,
};
```

## 2.2 六个设计决定

### 每个组件是一个函数，参数是"数据"，返回是"字符串"

```js
Badge({ kind: 'paid', label: '已支付' })
// → '<span class="badge badge--paid">已支付</span>'
```

**没有 `this`，没有生命周期，没有状态。**

**这就是"纯函数"：同样的输入，永远同样的输出。**

**好处：** **你能在浏览器控制台里直接试：** `UI.Badge({kind:'paid',label:'已支付'})`。

**这个"可以在控制台里试"的能力，是排查 UI 问题最快的路径。**

### `attrs()` 处理布尔属性

```js
attrs({ class: 'btn', disabled: true, 'data-id': null })
// → 'class="btn" disabled'
```

**`true` 变成只有属性名（HTML 的布尔属性写法），`null` / `false` 被过滤掉。**

**不写这个辅助函数，你会写出：**

```js
`<button ${disabled ? 'disabled' : ''}>`     // 全是三元表达式
```

**几十个属性的时候，字符串拼接到处是 bug。**

### `Field` 把错误放在结构里

```html
<div class="field field--invalid" data-field="email">
  <label>邮箱 *</label>
  <input class="input input--error" ...>
  <div class="field__error" data-error-for="email">请填写邮箱</div>
</div>
```

**注意三个地方：**

```text
① 外层 .field--invalid  → CSS 控制 .field__error 的显隐
② input 加 .input--error → 边框变红
③ data-error-for="email" → JS 能定位到"哪个字段的错误提示"
```

**为什么不直接 `display: none` 写在 style 里：** **因为后来的校验逻辑要"只改文字，不改结构"。** **有 `data-error-for` 就能精确替换。**

### `ListItem` 的 `right` 是 HTML 不是文本

```js
ListItem({ title: 'P2601A', right: '¥1,299.00', rightSub: Badge({...}) })
```

**`right` 经过 `escapeHtml`，`rightSub` 不经过（因为它是已经生成好的 HTML）。**

**这个区别要清楚：**

```text
用户数据 → 必须 escapeHtml
你自己生成的 HTML → 直接插入
```

**分不清这两个，要么 XSS，要么界面显示成 `<span>...</span>` 这种字面量。**

**命名上区分：`right`（数据）vs `rightSub`（HTML）。** **不够清楚，但比混着好。**

### `EmptyState` 里有一个手写的 SVG

**为什么不放一张图片：**

```text
图片    10—50KB，要多一次请求
SVG     500 字节，内联，永远不会 404
```

**而且 SVG 能跟着主题变色（改 `stroke` 就行）。**

**这个空状态图标是最简单的那个——一个方框加一条线（像一张空表格）。**

**不好看，但比"暂无数据"四个字好得多。**

### `PageHeader` 和 `TabBar` 是"区块"不是"组件"

**因为它们只出现一次（每页一个）。**

**但仍要做成函数，因为：**

```text
① 五个页面都要用，不做函数就要复制五遍
② 以后改导航结构（比如加一个 tab），改一个地方
```

**判断标准：**

```text
用两次以上 → 做成函数
只用一次   → 可以直接写在 HTML 里
```

**但"页面骨架"（header + tabbar）建议一律做成函数，因为改的概率很高。**

## 2.3 配套的 CSS

**在 `components.css` 里补：**

```css
.btn__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn--default .btn__spinner,
.btn--ghost .btn__spinner {
  border-color: rgba(0, 0, 0, 0.15);
  border-top-color: var(--color-text);
}

.list__side {
  text-align: right;
  flex-shrink: 0;
}

.empty-state {
  padding: var(--space-7) var(--space-4);
  text-align: center;
}

.empty-state__icon {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-4);
}

.empty-state__title {
  font-size: var(--text-base);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.empty-state__text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.6;
  margin-bottom: var(--space-5);
  max-width: 320px;
  margin-left: auto;
  margin-right: auto;
}

.section {
  margin-bottom: var(--space-5);
}

.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.section__title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}
```

## 2.4 自检点

**在浏览器控制台里试四个组件：**

```js
document.body.insertAdjacentHTML('beforeend', UI.Badge({ kind: 'paid', label: '已支付' }));
document.body.insertAdjacentHTML('beforeend', UI.Button({ label: '保存', variant: 'primary' }));
document.body.insertAdjacentHTML('beforeend', UI.EmptyState({ title: '还没有订单', text: '导入第一份 Excel 就能开始', actionLabel: '去导入', actionHref: '/imports.html' }));
document.body.insertAdjacentHTML('beforeend', UI.SkeletonList(2));
```

**四个都要能正常显示。**

**如果 `UI` 是 `undefined`，说明 `ui.js` 里的 `window.UI = {...}` 没执行——** **检查是不是某个函数抛错了（比如 `Intl.DateTimeFormat` 的 `dateStyle` 在旧环境不支持）。**

---

# 第 3 步：重写 orders.html（40 分钟）

## 3.1 用组件重写

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
<div class="app" id="app">
  <div id="header"></div>
  <main class="app-main" id="main"></main>
  <div id="tabbar"></div>
</div>

<script src="/js/api.js"></script>
<script src="/js/ui.js"></script>
<script src="/js/pages/orders.js"></script>
</body>
</html>
```

**新建 `public/js/pages/orders.js`：**

```js
(function () {
  const { PageHeader, TabBar, SkeletonList, ErrorState, EmptyState, List, ListItem, Badge, money, date, Button } = window.UI;

  const state = {
    loading: true,
    error: null,
    orders: [],
    filter: 'all',
  };

  const FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待支付' },
    { key: 'paid', label: '已支付' },
  ];

  const STATUS_TEXT = {
    pending: '待支付',
    paid: '已支付',
    refunding: '退款中',
    refunded: '已退款',
    expired: '已过期',
    canceled: '已取消',
  };

  const STATUS_KIND = {
    pending: 'pending',
    paid: 'paid',
    refunding: 'pending',
    refunded: 'refunded',
    expired: 'refunded',
    canceled: 'refunded',
  };

  function renderHeader() {
    document.getElementById('header').innerHTML = PageHeader({
      title: '订单',
      actionLabel: '刷新',
      action: 'refresh',
    });
  }

  function renderTabbar() {
    document.getElementById('tabbar').innerHTML = TabBar({ active: 'orders' });
  }

  function renderFilters() {
    return `
      <div class="row" style="margin-bottom:12px;gap:8px">
        ${FILTERS.map(
          (f) => `
          <button class="btn btn--sm ${state.filter === f.key ? 'btn--primary' : 'btn--ghost'}"
                  data-action="filter" data-filter="${f.key}">
            ${f.label}
          </button>
        `
        ).join('')}
      </div>
    `;
  }

  function visibleOrders() {
    if (state.filter === 'all') return state.orders;
    return state.orders.filter((o) => o.status === state.filter);
  }

  function renderMain() {
    const main = document.getElementById('main');

    if (state.loading) {
      main.innerHTML = SkeletonList(6);
      return;
    }

    if (state.error) {
      main.innerHTML = ErrorState({
        title: '订单加载失败',
        message: state.error,
        retryAction: 'reload',
      });
      return;
    }

    const list = visibleOrders();

    if (state.orders.length === 0) {
      main.innerHTML = EmptyState({
        title: '还没有订单',
        text: '第一次使用可以从 Excel 导入历史订单，或者新建一笔',
        actionLabel: '去导入',
        actionHref: '/imports.html',
      });
      return;
    }

    if (list.length === 0) {
      main.innerHTML =
        renderFilters() +
        EmptyState({
          title: '这个状态下没有订单',
          text: '换个筛选条件看看',
        });
      return;
    }

    main.innerHTML =
      renderFilters() +
      List({
        items: list.map((o) =>
          ListItem({
            id: o.id,
            title: o.order_no,
            meta: `${o.customer_name} · ${date(o.order_date)}`,
            right: money(o.amount_cents),
            rightSub: Badge({
              kind: STATUS_KIND[o.status] || 'default',
              label: STATUS_TEXT[o.status] || o.status,
            }),
            href: '/order-detail.html?id=' + encodeURIComponent(o.id),
          })
        ),
        emptyText: '',
      });
  }

  async function load() {
    state.loading = true;
    state.error = null;
    renderMain();

    try {
      const data = await window.API.get('/api/orders');
      state.orders = Array.isArray(data) ? data : data.items || [];
      state.loading = false;
    } catch (err) {
      state.loading = false;
      state.error = err.message || '网络错误';
    }

    renderMain();
  }

  function bind() {
    document.getElementById('app').addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;

      if (action === 'refresh' || action === 'reload') {
        load();
        return;
      }

      if (action === 'filter') {
        state.filter = el.dataset.filter;
        renderMain();
      }
    });
  }

  renderHeader();
  renderTabbar();
  bind();
  load();
})();
```

## 3.2 五个关键点

### 一个 `state` 对象

```js
const state = {
  loading: true,
  error: null,
  orders: [],
  filter: 'all',
};
```

**页面上看到的一切，都由这个对象决定。**

**好处：**

```text
① 想知道"现在是什么状态"，看这一处
② 想加一个字段（比如排序），加在这里
③ 调试时 console.log(state) 就够
```

**这是"状态驱动渲染"的最小实现。** **React 的那套 `setState` 触发的重渲染，手写就是 `renderMain()`。**

### `renderMain` 一个函数管所有状态

**看它的结构：**

```js
if (state.loading) { 骨架屏; return; }
if (state.error)   { 错误界面; return; }
if (空)            { 空状态; return; }
if (筛选后为空)    { 空状态（不同文案）; return; }
普通列表;
```

**四个 `return` 把四种状态彻底分开。**

**这就是第 185 节的核心，这一节先按这个结构写，下一节补细节。**

### 事件委托

```js
document.getElementById('app').addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  ...
});
```

**为什么不用给每个按钮 `addEventListener`：**

```text
因为 renderMain() 会整体替换 innerHTML
之前绑的事件全丢了
```

**事件委托挂在不会变的 `#app` 上，就永远不会丢。**

**而且新渲染出来的元素自动有事件，不用重新绑。**

**这是"手写渲染"必须掌握的一个技巧。** **不掌握的话，你会陷入"每次渲染后重新绑事件"的泥潭。**

### `data-action` 而不是 `onclick`

**因为 `onclick="..."` 里的代码是字符串，无法用闭包访问 `state`。**

```html
<!-- ❌ 这样访问不到 load() -->
<button onclick="load()">刷新</button>
```

**而且 `onclick` 会被 CSP（内容安全策略）拦掉——** **第 33 周做安全的时候你会需要 CSP。**

**`data-action` 是"声明意图"，事件处理里"解释意图"。** **这个分离让代码可读性好得多。**

### `API.get` 还不存在

**上节课没写 `api.js`。这一节先写一个最小的。**

**新建 `public/js/api.js`：**

```js
(function () {
  async function request(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    if (res.status === 204) return null;

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
      const message =
        (body && body.error) ||
        (res.status === 401 ? '登录已过期，请重新登录' : `请求失败（${res.status}）`);

      const err = new Error(message);
      err.status = res.status;
      err.body = body;

      if (res.status === 401) {
        window.location.href = '/login.html';
      }

      throw err;
    }

    return body;
  }

  window.API = {
    get: (p) => request(p, { method: 'GET' }),
    post: (p, data) => request(p, { method: 'POST', body: JSON.stringify(data) }),
    patch: (p, data) => request(p, { method: 'PATCH', body: JSON.stringify(data) }),
    put: (p, data) => request(p, { method: 'PUT', body: JSON.stringify(data) }),
    del: (p) => request(p, { method: 'DELETE' }),
  };
})();
```

**注意 `credentials: 'include'`。**

**没有它，cookie 不会带上，所有接口都是 401。**

**这是"用 cookie 做登录"时最容易漏的一行。**

### 四个状态的文案要不一样

**注意"完全没有订单"和"这个筛选下没有订单"用了不同的文案：**

```text
完全空   → "还没有订单，去导入" + 按钮
筛选空   → "这个状态下没有订单，换个筛选"
```

**如果都用"暂无数据"，客户不知道是"真的空"还是"筛错了"。**

**这个区别在第 185 节会展开。**

## 3.3 自检点

**访问 `/orders.html`，五个检查：**

```text
① 先看到骨架屏（6 行）
② 数据回来变成列表
③ 点"待支付"，只剩待支付的
④ 点"刷新"，又看到骨架屏（不是直接跳变）
⑤ 断开后端（停掉 npm run dev），点刷新 → 错误界面 + 重试按钮
```

**第 ⑤ 条很重要。** **很多人只测"有数据"的情况，从不测"接口挂了"。**

**而客户遇到"接口挂了"的概率远高于你的想象——** **他在地铁里、在电梯里、在 WiFi 切换的瞬间。**

**点"重试"应该能恢复（后端起来之后）。**

---

# 第 4 步：让四个页面长得一样（20 分钟）

**拆组件的真正收益：** **四个页面用同一套零件，看起来是同一个产品。**

## 4.1 写一个页面骨架模板

**新建 `public/js/layout.js`：**

```js
(function () {
  function mount({ title, activeTab, headerAction, containerId = 'app' }) {
    const app = document.getElementById(containerId);
    if (!app) throw new Error('找不到容器 #' + containerId);

    app.innerHTML = `
      <div id="header"></div>
      <main class="app-main" id="main"></main>
      <div id="tabbar"></div>
    `;

    document.getElementById('header').innerHTML = window.UI.PageHeader({
      title,
      actionLabel: headerAction && headerAction.label,
      action: headerAction && headerAction.action,
    });

    document.getElementById('tabbar').innerHTML = window.UI.TabBar({ active: activeTab });

    return {
      main: document.getElementById('main'),
      header: document.getElementById('header'),
      tabbar: document.getElementById('tabbar'),
    };
  }

  window.Layout = { mount };
})();
```

**现在每个页面只需要三行：**

```js
const { main } = Layout.mount({ title: '订单', activeTab: 'orders', headerAction: { label: '刷新', action: 'refresh' } });
```

**而这个页面的 HTML 永远是这十行：**

```html
<div class="app" id="app"></div>
<script src="/js/api.js"></script>
<script src="/js/ui.js"></script>
<script src="/js/layout.js"></script>
<script src="/js/pages/orders.js"></script>
```

## 4.2 为什么这个"骨架"值得单独抽

**因为改版的时候你会同时想改五个页面的头部。**

```text
想给头部加一个"返回"箭头 → 改 PageHeader
想给底部加一个 tab       → 改 TabBar
想改头部高度             → 改 CSS 变量
```

**每一处都只需要改一个地方。**

**这就是"组件化"的实际收益：不是代码变少了，是**改动的半径变小了**。**

**"改动半径"是个好指标。** **判断一个项目好不好维护，就看"改一个需求要碰几个文件"。**

## 4.3 自检点

**把 `settings.html` 也用这套重写一遍（哪怕只有一张"集成状态"卡片）。**

**然后对照检查：**

```text
① 两个页面的头部高度一样吗
② 底部 tab 的位置一样吗
③ 内容区左右留白一样吗
④ 卡片的圆角和阴影一样吗
```

**四条都一样，说明组件真的复用了。**

**如果哪一条不一样，说明你在某个页面里写了"一次性的样式"——** **把它挪进 `components.css`。**

---

# 第 5 步：故意破坏一次（15 分钟）

## 5.1 删掉 `escapeHtml`

**把 `ListItem` 里的 `escapeHtml(title)` 改成 `title`：**

```js
<div class="list__title">${title}</div>
```

**然后让后端返回一个带 HTML 的客户名。**

**最快的做法：在 `ui.js` 的控制台里试：**

```js
document.getElementById('main').innerHTML = UI.ListItem({
  title: '<img src=x onerror="alert(1)">恶意客户名',
  meta: '测试',
});
```

**你会看到 `alert(1)` 弹出来。**

**这就是 XSS：一个客户名里的 HTML 被执行了。**

**真实场景里：**

```text
客户从别的系统导入客户名
别人给他发一条消息，名字里带 <script>
他打开列表 → 脚本执行 → 偷走他的 cookie → 攻击者用他的身份登录
```

**改回来。**

**记住这条规矩：**

```text
凡是"用户能看到的数据"插进 HTML，必须 escapeHtml
凡是"你自己生成的 HTML"，才可以直接插入
```

## 5.2 删掉事件委托

**把 `bind()` 改成给每个 `list__item` 单独绑定：**

```js
document.querySelectorAll('.list__item').forEach((el) => {
  el.addEventListener('click', () => { ... });
});
```

**然后点"刷新"。**

**列表重新渲染了，但点击没有反应了——** **因为新的 DOM 元素没有绑定事件。**

**这就是"为什么必须用事件委托"。**

**改回来。**

## 5.3 只测"有数据"，不测"没数据"

**把 `state.orders` 强制清空：**

```js
state.orders = [];
state.loading = false;
renderMain();
```

**你应该看到一个空状态 + 一个"去导入"按钮。**

**如果什么都不显示（一片空白），说明你的空状态分支写漏了。**

**客户第一次登录时看到的就是这个界面。** **空白页 = 他以为坏了。**

---

# 第 6 步：最终验收

## A. 组件

- [ ] `ui.js` 里有至少 8 个组件函数
- [ ] 每个组件都返回纯字符串，不发请求
- [ ] 所有用户数据都经过 `escapeHtml`
- [ ] `attrs()` 能处理布尔和 `null`

## B. 页面

- [ ] `orders.html` 只有十行
- [ ] 逻辑在 `pages/orders.js` 里
- [ ] 有一个 `state` 对象
- [ ] `renderMain()` 有四个 `return`（loading / error / empty / list）
- [ ] 用事件委托，不是给每个元素绑

## C. API

- [ ] `api.js` 有 `get/post/patch/put/del`
- [ ] 带 `credentials: 'include'`
- [ ] 401 自动跳登录
- [ ] 错误信息从 `body.error` 里取

## D. 复用

- [ ] `layout.js` 的 `mount()` 能一行生成页面骨架
- [ ] 两个页面的头部、底部、留白完全一致
- [ ] 没有页面里写"一次性样式"

## E. 破坏验证

- [ ] 删 `escapeHtml` 后 `alert(1)` 弹出来了
- [ ] 删事件委托后刷新就点不动了
- [ ] 清空数据能看到空状态

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"改动半径"这个指标
- [ ] 我数了拆分前后的行数

## 提交

```text
git add -A
git commit -m "第184节课: 组件化渲染函数 + 状态驱动 + 事件委托 + 页面骨架"
git push
```

---

# 附：常见问题速查

| 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `UI is undefined` | `ui.js` 某个函数抛错 | 看控制台的第一个错误 |
| `dateStyle` 不支持 | 旧浏览器 | 改用 `year/month/day` 手拼 |
| 点击没反应 | 没用事件委托，渲染后事件丢了 | 挂在 `#app` 上 |
| 所有接口 401 | `fetch` 没带 cookie | `credentials: 'include'` |
| 数据不显示但接口有返回 | 返回结构不是数组 | 兼容 `data.items` |
| 骨架屏一直不消失 | `load()` 里某个 `await` 抛错但没 `catch` | 检查 try/catch |
| 页面空白 | `renderMain()` 少了一个分支 | 四个 `return` 都要有 |
| 用户输入里 `<` 显示成 `&lt;` | 你 escape 了两次 | 只 escape 一次 |
| 组件里显示成字符串 `<span>` | 用了 `escapeHtml` 包住自己生成的 HTML | 区分"数据"和"HTML" |

---

## 本节课要能说出口的一句话

> **组件化的收益不是"代码变少"，是"改动的半径变小"——改一个头部高度只碰一个文件，而不是五个页面各改一遍。**
