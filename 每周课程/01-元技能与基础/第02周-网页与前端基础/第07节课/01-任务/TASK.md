# 第 14 节课：做出第一个作品——个人介绍页

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这一周你学了 HTML、语义化、CSS、表单、JS 变量函数、事件。
> 这节课不教新东西，**把这些全用一遍，做出一个能拿给别人看的页面。**

**建议用时**：120 分钟
**你需要先完成**：第 8—13 节课

---

# 第 0 步：为什么这节课重要（5 分钟）

## 0.1 前六节课的问题

你学了七个知识点，但每一个都是"碎片"：

```text
第 8 节课：HTML 标签
第 9 节课：语义化
第 10 节课：CSS 样式
第 11 节课：表单
第 12 节课：JS 变量函数
第 13 节课：事件
```

**如果不去组装，一周后你会忘掉一半。**

## 0.2 这节课的目标

```text
把六个碎片拼成一样东西：一个能打开、能交互、能给别人看的页面。
```

**这个页面可以直接放进你的作品集。**

## 0.3 为什么"个人介绍页"是最好的第一个作品

- 内容是你自己的，不用编；
- 用到的技术刚好覆盖这一周全部内容；
- 面试时可以打开给人看；
- 做完之后你会知道"一个完整页面是怎么攒出来的"。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `index.html` | `03-练习代码` | 你的个人介绍页 |
| `style.css` | `03-练习代码` | 样式 |
| `main.js` | `03-练习代码` | 交互 |

---

# 第 1 步：先规划，别急着写代码（15 分钟）

## 1.1 为什么必须先规划

**新手最常见的失败方式：**

1. 打开编辑器；
2. 从 `<html>` 开始写；
3. 写到一半发现结构不对；
4. 删掉重写；
5. 重复三次，放弃。

**规划只要 15 分钟，能省掉两小时。**

## 1.2 规划要用纸

**拿一张纸（或记事本），做三件事：**

**第一件：列出这一页要有什么**

```text
- 我的名字
- 一句话介绍
- 三个技能
- 联系方式
- 一个"留言给我"的小表单
- 一个"切换深浅色"的按钮（用事件）
```

**第二件：画出大概的布局**

画方框就行，不用精细：

```text
┌─────────────────────────┐
│  名字 + 一句话           │  ← 页头
├─────────────────────────┤
│  技能 1  技能 2  技能 3  │  ← 主体
├─────────────────────────┤
│  留言表单                │  ← 主体
├─────────────────────────┤
│  联系方式                │  ← 页脚
└─────────────────────────┘
```

**第三件：标出哪块用什么标签**

```text
页头      → <header>
技能区    → <section>（里面用 <ul>）
留言表单  → <section> + <form>
联系方式  → <footer>
切换按钮  → 放在 <header> 里
```

## 1.3 现在自己写你的规划

**在 `NOTES.md` 里写：**

```markdown
## 我的页面规划

### 内容清单
1.
2.
3.
4.
5.

### 布局草图
（用文字画方框）

### 标签分配
| 区块 | 用什么标签 | 为什么 |
|---|---|---|
| | | |
| | | |
```

**写完再往下。不要跳。**

## 1.4 一个提醒：内容要真实

**不要写"精通 XXX""全栈专家"这种。**

**写你真实的：**

- 学过什么（哪怕只学了一周）；
- 在学什么；
- 想做什么。

**为什么：**
因为这是你第一个作品，面试官一看就知道你的水平。**写得实在，反而显得靠谱。**

**示例文案（可以直接模仿）：**

```text
你好，我是 XXX。
我正在学习用 AI 做开发，第 2 周结束。
这一周我做了：一个日期显示程序、一个折扣计算器、一个待办清单、这个页面。
下面的技能是我**会一点**的，不是精通。
```

---

# 第 2 步：先搭结构，不加样式（25 分钟）

## 2.1 建三个空文件

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第02周-网页与前端基础\第07节课\03-练习代码
   ```

2. 新建三个文件：`index.html`、`style.css`、`main.js`。

## 2.2 写 HTML 骨架（自己敲）

**先只写结构，先不管好不好看。**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XXX 的个人主页</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <header class="site-header">
    <button type="button" id="themeBtn" class="theme-btn">切换深色</button>

    <h1 class="name">XXX</h1>
    <p class="tagline">正在学习用 AI 做开发 · 第 2 周</p>
  </header>

  <main>

    <section class="card">
      <h2>关于我</h2>
      <p>
        我正在系统地学一件事：<strong>怎么用 AI 把想法做成能用的东西</strong>。<br>
        目前会写一点 HTML、CSS、JavaScript，能自己做简单的页面和交互。<br>
        还不算熟练，但每一周都会有一个能打开的作品。
      </p>
    </section>

    <section class="card">
      <h2>我会的</h2>
      <ul class="skills">
        <li>写 HTML 结构，用语义化标签</li>
        <li>用 CSS 做排版、配色、间距</li>
        <li>用 JavaScript 处理输入、计算、事件</li>
        <li>用 Git 存档，改坏了能回退</li>
      </ul>
    </section>

    <section class="card">
      <h2>我的作品</h2>
      <ol class="works">
        <li>日期显示程序（第 1 节课）</li>
        <li>折扣计算器（第 12 节课）</li>
        <li>待办清单（第 13 节课）</li>
        <li>这个页面（第 14 节课）</li>
      </ol>
    </section>

    <section class="card">
      <h2>给我留言</h2>

      <form id="contactForm" class="contact-form">
        <p>
          <label for="visitorName">你的名字</label>
          <input
            type="text"
            id="visitorName"
            name="visitorName"
            placeholder="怎么称呼你"
            maxlength="20"
            required
          >
        </p>

        <p>
          <label for="message">留言内容</label>
          <textarea
            id="message"
            name="message"
            rows="4"
            placeholder="想说什么都可以，最多 100 字"
            maxlength="100"
            required
          ></textarea>
          <span class="counter" id="counter">0 / 100</span>
        </p>

        <p>
          <button type="submit">发送</button>
        </p>
      </form>

      <div class="notice" id="notice" hidden></div>
    </section>

  </main>

  <footer class="site-footer">
    <h2 class="footer-title">联系我</h2>
    <p>
      邮箱：<a href="mailto:you@example.com">you@example.com</a>
    </p>
    <p class="copyright">© 2026 XXX</p>
  </footer>

  <script src="main.js" defer></script>
</body>
</html>
```

## 2.3 先把 `XXX` 换成你自己的

**操作：**

1. 用 `Ctrl + H` 打开替换；
2. 查找 `XXX`；
3. 替换成你的名字；
4. 全部替换。

**邮箱也换成你的（没有就写一个假但格式对的）。**

## 2.4 新出现的三个东西

### `<meta name="viewport" content="width=device-width, initial-scale=1.0">`

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

**这是干什么的：让手机浏览时按手机屏幕宽度显示，不做缩放。**

**不写会怎样：**
手机上打开会显示成"缩小版的电脑页面"，字小到看不清。

**`viewport` 是什么：** 视口，浏览器用来显示网页的那块区域。

**`width=device-width`：** 宽度等于设备宽度。

**`initial-scale=1.0`：** 初始缩放 1 倍（不放大不缩小）。

**规则：所有要给别人看的页面都必须写这一行。** 忘写的话手机上体验极差。

### 外部 CSS 和 JS 的正确加载

```html
<link rel="stylesheet" href="style.css">      <!-- 在 head 里 -->
<script src="main.js" defer></script>         <!-- 在 body 末尾 -->
```

**为什么 CSS 放 `head`、JS 放末尾：**

- CSS 放 `head`：先加载样式，避免"先看到无样式的裸页面再突然变好看"（这现象叫 FOUC）；
- JS 放末尾 + `defer`：先让页面渲染出来，再执行脚本，避免白屏。

### `hidden` 属性

```html
<div class="notice" id="notice" hidden></div>
```

**`hidden` 是 HTML 原生属性，效果是 `display: none`（不显示、不占位）。**

**为什么用它而不是用 CSS 类：**
因为它可以一行 JS 控制：

```javascript
notice.hidden = false;   // 显示
notice.hidden = true;    // 隐藏
```

**这比加删 class 简单。**

## 2.5 现在打开看效果

**双击 `index.html`。**

**你会看到：** 一个非常难看的页面——所有东西从上往下堆，没有间距，没有颜色，按钮是灰方块。

**这是正常的。** 因为 `style.css` 还是空的。

**但先做一件事：验证结构对不对。**

**用 `F12` 打开开发者工具，点"元素"标签，展开 `<body>`。**

**对照检查：**

- [ ] 有一个 `<header>`，里面有一个按钮、一个 `<h1>`、一个 `<p>`；
- [ ] 有一个 `<main>`，里面有四个 `<section class="card">`；
- [ ] 第四个 `<section>` 里有一个 `<form>`；
- [ ] 有一个 `<footer>`；
- [ ] `<script>` 在最后。

**结构对了，再谈样式。**

---

# 第 3 步：加样式（40 分钟）

## 3.1 分三段写

**不要一次性写完。** 分三段，每段写完刷新看一眼：

```text
第一段：基础（字体、背景、容器宽度）
第二段：卡片和排版（间距、圆角、标题）
第三段：表单和按钮（输入框、按钮、交互状态）
```

## 3.2 第一段：基础

**`style.css`：**

```css
/* ========== 基础 ========== */

* {
  box-sizing: border-box;
}

:root {
  --bg: #f5f5f5;
  --card-bg: #ffffff;
  --text: #333333;
  --text-light: #808080;
  --primary: #1a73e8;
  --border: #e0e0e0;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--bg);
  color: var(--text);
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.7;
  transition: background-color 0.3s, color 0.3s;
}

h1, h2, h3 {
  line-height: 1.3;
  margin: 0 0 12px 0;
}

p {
  margin: 0 0 16px 0;
}

a {
  color: var(--primary);
}
```

**保存，刷新。**

**现在应该看到：** 背景浅灰，字体正常，链接蓝色。**还是很难看，但有基础了。**

## 3.3 `:root` 和 CSS 变量——这是新东西

```css
:root {
  --bg: #f5f5f5;
  --primary: #1a73e8;
}

body {
  background-color: var(--bg);
}
```

**`:root` 是什么：** 代表"整个文档的根元素"，也就是 `<html>`。

**`--bg: #f5f5f5;` 是什么：** 定义一个"CSS 变量"，名字必须以 `--` 开头。

**`var(--bg)` 是什么：** 使用这个变量。

**为什么要用变量：**

**做深色模式时，只需要改变量的值，不用改 20 处颜色。**

**验证一下：**

```css
:root {
  --bg: #000000;   /* 改成黑色 */
}
```

**刷新，整个页面背景变黑了。** 你只改了一行。

**这就是变量的价值。第 4 步的深色模式就靠它。**

## 3.4 第二段：卡片和排版

**在 `style.css` 后面加：**

```css
/* ========== 页头 ========== */

.site-header {
  position: relative;
  padding: 48px 24px 40px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border);
  text-align: center;
}

.name {
  font-size: 32px;
  margin-bottom: 8px;
}

.tagline {
  color: var(--text-light);
  font-size: 15px;
  margin: 0;
}

.theme-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 6px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text);
  background-color: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.theme-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* ========== 主体容器 ========== */

main {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 16px;
}

/* ========== 卡片 ========== */

.card {
  background-color: var(--card-bg);
  padding: 28px;
  margin-bottom: 20px;
  border-radius: 12px;
}

.card h2 {
  font-size: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

/* ========== 列表 ========== */

.skills,
.works {
  margin: 0;
  padding-left: 22px;
}

.skills li,
.works li {
  margin-bottom: 8px;
}

/* ========== 页脚 ========== */

.site-footer {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  text-align: center;
  color: var(--text-light);
  font-size: 14px;
}

.footer-title {
  font-size: 16px;
  color: var(--text);
}

.copyright {
  margin-top: 24px;
  margin-bottom: 0;
}
```

**保存，刷新。**

**现在应该好看多了：**

- 页头白色居中，名字大字；
- 右上角有个小圆角按钮；
- 四张白色圆角卡片，居中，最大宽 720px；
- 卡片标题下面有分割线；
- 列表有缩进；
- 页脚灰色小字居中。

## 3.5 新出现的两个知识点

### `position: absolute`

```css
.site-header {
  position: relative;
}

.theme-btn {
  position: absolute;
  top: 16px;
  right: 16px;
}
```

**这两个必须配对使用：**

- 父元素 `position: relative` —— 成为"定位参考系"；
- 子元素 `position: absolute` —— 相对父元素定位。

**`top: 16px; right: 16px;` 的意思：距父元素顶部 16px、右侧 16px。**

**如果父元素没写 `relative`：**
子元素会相对"整个页面"定位，跑到页面角落，滚动时还跟着动。**这是最常见的定位 bug。**

**`position` 的五个值：**

| 值 | 意思 |
|---|---|
| `static` | 默认，正常流 |
| `relative` | 相对自己原来的位置偏移，**并且成为子元素的定位参考** |
| `absolute` | 相对最近的已定位祖先元素定位，脱离文档流 |
| `fixed` | 相对浏览器窗口定位，滚动不动 |
| `sticky` | 滚动到某个位置就"粘住" |

### `transition`

```css
body {
  transition: background-color 0.3s, color 0.3s;
}
```

**让属性变化时"平滑过渡"，不是突变。**

**读法：**

```text
transition: 属性 时长, 属性 时长;
```

**为什么加在 `body` 上：**
因为深色模式切换时，背景色突变会刺眼。**加 0.3 秒过渡，视觉上舒服很多。**

## 3.6 第三段：表单和按钮

**继续加：**

```css
/* ========== 表单 ========== */

.contact-form p {
  margin-bottom: 18px;
}

.contact-form label {
  display: block;
  font-size: 14px;
  color: var(--text-light);
  margin-bottom: 6px;
}

.contact-form input,
.contact-form textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 15px;
  font-family: inherit;
  color: var(--text);
  background-color: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
}

.contact-form input:focus,
.contact-form textarea:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.contact-form textarea {
  resize: vertical;
  min-height: 96px;
}

.counter {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-light);
  text-align: right;
}

.counter.warn {
  color: #e53935;
}

.contact-form button {
  padding: 10px 24px;
  font-size: 15px;
  font-family: inherit;
  font-weight: 500;
  color: #ffffff;
  background-color: var(--primary);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.contact-form button:hover {
  background-color: #1765cc;
}

/* ========== 提示消息 ========== */

.notice {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 14px;
  background-color: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}
```

**保存，刷新。**

**现在表单应该好看了：** 输入框有内边距和圆角，点进去有蓝色焦点框，按钮蓝色。

**`resize: vertical` 是什么：** 允许用户竖直方向拖拽改变 textarea 高度，但不允许横向拖（横向拖会破坏布局）。

## 3.7 加上深色模式

**在 `style.css` 最后加：**

```css
/* ========== 深色模式 ========== */

body.dark {
  --bg: #1a1a1a;
  --card-bg: #262626;
  --text: #e0e0e0;
  --text-light: #9e9e9e;
  --primary: #64b5f6;
  --border: #3a3a3a;
}

body.dark .contact-form input:focus,
body.dark .contact-form textarea:focus {
  box-shadow: 0 0 0 3px rgba(100, 181, 246, 0.25);
}

body.dark .notice {
  background-color: #1b3a1d;
  color: #a5d6a7;
  border-color: #2e7d32;
}
```

**现在还没有 `dark` 这个 class，所以看不出变化。第 4 步会用 JS 加上。**

**注意一个关键点：**

```css
body.dark {
  --bg: #1a1a1a;
}
```

**这是"重新定义变量"。**

**原理：** CSS 变量有"作用域"。在 `body.dark` 里重新定义，这个范围里所有 `var(--bg)` 都会用新值。

**所以整个深色模式只用了 6 行变量定义，没有改任何一条具体规则。**

**这就是变量的威力。**

**深色模式的配色要注意：**

| 用途 | 浅色 | 深色 | 为什么 |
|---|---|---|---|
| 背景 | `#f5f5f5` | `#1a1a1a` | 不是纯黑，纯黑会显得刺眼 |
| 卡片 | `#ffffff` | `#262626` | 比背景稍亮，形成层次 |
| 文字 | `#333333` | `#e0e0e0` | 不是纯白，纯白在深色上太刺眼 |
| 次要文字 | `#808080` | `#9e9e9e` | 深色上要更亮才看得清 |

---

# 第 4 步：加交互（JS）（25 分钟）

## 4.1 三个交互

```text
① 切换深色/浅色
② 留言字数统计
③ 提交表单后显示提示
```

## 4.2 写 main.js

**自己敲：**

```javascript
// ========== 元素 ==========
const themeBtn = document.querySelector("#themeBtn");
const contactForm = document.querySelector("#contactForm");
const messageInput = document.querySelector("#message");
const counter = document.querySelector("#counter");
const notice = document.querySelector("#notice");

const MAX_LEN = 100;

// ========== 1. 切换深色模式 ==========
const applyTheme = (isDark) => {
  document.body.classList.toggle("dark", isDark);
  themeBtn.textContent = isDark ? "切换浅色" : "切换深色";
};

let isDark = false;

themeBtn.addEventListener("click", () => {
  isDark = !isDark;
  applyTheme(isDark);
});

// ========== 2. 字数统计 ==========
const updateCounter = () => {
  const len = messageInput.value.length;
  counter.textContent = `${len} / ${MAX_LEN}`;
  counter.classList.toggle("warn", len >= MAX_LEN * 0.9);
};

messageInput.addEventListener("input", updateCounter);

// ========== 3. 提交 ==========
contactForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = document.querySelector("#visitorName").value.trim();
  const message = messageInput.value.trim();

  if (name === "" || message === "") {
    showNotice("名字和留言都要填。", false);
    return;
  }

  showNotice(`谢谢 ${name}，留言已收到（这个页面还没有后端，所以不会真的发出去）。`, true);

  contactForm.reset();
  updateCounter();
});

// ========== 提示消息 ==========
const showNotice = (text, isSuccess) => {
  notice.textContent = text;
  notice.hidden = false;
  notice.style.backgroundColor = isSuccess ? "" : "#ffebee";
  notice.style.color = isSuccess ? "" : "#c62828";
  notice.style.borderColor = isSuccess ? "" : "#ef9a9a";
};

// ========== 初始化 ==========
updateCounter();
```

**保存，刷新。**

## 4.3 逐个测试

### 测试一：切换深色

**点右上角"切换深色"。**

**应该看到：**

- 背景、卡片、文字全部变深色；
- 按钮文字变成"切换浅色"；
- 过渡是平滑的，不是突变。

**再点一次：** 变回浅色。

### 测试二：字数统计

**在留言框里打字。**

**应该看到：**

- 右下角数字随打字更新；
- 打到 90 字以上，数字变红。

**注意 `maxlength="100"` 会**阻止**超过 100 字。** 所以"变红"是在快到上限时提醒。

### 测试三：提交

**填名字和留言，点"发送"。**

**应该看到：**

- 页面**没有刷新**；
- 下面出现绿色提示"谢谢 XXX，留言已收到……"；
- 表单被清空；
- 字数回到 `0 / 100`。

**只填名字不填留言，点发送：** 出现红色提示（或者被 `required` 拦住，取决于浏览器）。

## 4.4 逐段理解

### `classList.toggle(class, 条件)`

```javascript
document.body.classList.toggle("dark", isDark);
```

**两个参数的版本：**

```text
第二个参数是 true  → 加上这个 class
第二个参数是 false → 去掉这个 class
```

**比 `if/else` 简洁得多。**

### `!isDark` 翻转

```javascript
isDark = !isDark;
```

**`!` 是"取反"。`true` 变 `false`，`false` 变 `true`。**

**为什么用 `let` 而不是 `const`：**
因为要改它的值。**这正是 `let` 的用途。**

### `contactForm.reset()`

```javascript
contactForm.reset();
```

**清空表单里所有输入框，恢复成初始值。**

**为什么用它而不是一个个清空：**
一行搞定，而且会恢复 `value="100"` 这种初始值。

### `showNotice` 里的 `style.xxx`

```javascript
notice.style.backgroundColor = isSuccess ? "" : "#ffebee";
```

**这是"行内样式"，直接改元素的 style。**

**注意 `""` 的意思：** 清空这个样式，回到 CSS 里定义的值。

**为什么不全用 CSS class：**
因为这里只有两种状态，用行内样式更直接。**但状态多了（比如三种以上），就该用 class。**

**`backgroundColor` 为什么是驼峰写法：**
CSS 里是 `background-color`（短横线），JS 里要转成 `backgroundColor`（驼峰）。**所有带短横线的 CSS 属性都要转。**

| CSS | JS |
|---|---|
| `background-color` | `backgroundColor` |
| `font-size` | `fontSize` |
| `border-color` | `borderColor` |

---

# 第 5 步：自己检查六个细节（15 分钟）

**这一步决定你的页面是"作业"还是"作品"。**

## 5.1 检查一：手机上能不能看

**操作：**

1. 在 Chrome 里按 `F12`；
2. 点左上角的"切换设备模拟"图标（手机形状）；
3. 选一个手机型号（如 iPhone SE）。

**检查：**

- [ ] 字不会小到看不清；
- [ ] 内容不会横向溢出（不出现左右滚动条）；
- [ ] 按钮够大，手指能点中；
- [ ] 卡片没有贴边。

**如果横向溢出了：**
最常见原因是某个元素宽度超出。**检查有没有 `width: 720px` 这种固定宽度**（应该用 `max-width` + `margin: 0 auto`）。

## 5.2 检查二：只用键盘能不能操作

**操作：**

1. 点一下浏览器地址栏；
2. 按 `Tab` 键，一步步往下走。

**检查：**

- [ ] 能 Tab 到"切换深色"按钮；
- [ ] 能 Tab 到第一个输入框；
- [ ] 能 Tab 到留言框；
- [ ] 能 Tab 到"发送"按钮；
- [ ] **每一步都能看出焦点在哪**（有蓝色边框或光晕）。

**如果看不出焦点：**
说明你写了 `outline: none` 但没补 `:focus` 样式。**这是无障碍问题，必须修。**

## 5.3 检查三：深色模式下所有文字都看得清吗

**切到深色，逐块检查：**

- [ ] 卡片标题清楚；
- [ ] 次要文字（灰色）还看得清；
- [ ] 输入框里的文字清楚；
- [ ] 输入框的边框能看见；
- [ ] 链接颜色够亮；
- [ ] 提示消息没有变成白底白字。

**最容易漏的：** 输入框。很多人在深色模式下没改输入框背景，结果白底白字。

## 5.4 检查四：刷新后状态对不对

**操作：**

1. 切到深色；
2. 按 `F5` 刷新。

**你会看到：** 变回浅色。

**这是正常的**，因为没做"记住选择"。

**要记住选择需要什么：** `localStorage`（浏览器本地存储）。**这个第 6 周会讲。**

**先接受这个限制，但要知道原因。**

## 5.5 检查五：控制台有没有报错

**按 `F12` → 控制台。**

**要求：一个红色错误都不能有。**

**如果有，按第 4 节课的方法读：**

```text
类型 → 消息 → 位置
```

## 5.6 检查六：断网后还能打开吗

**操作：**

1. 按 `F12` → 网络（Network）标签；
2. 勾上"离线"（Offline）；
3. 刷新。

**你的页面应该几乎不变**，因为你没引用任何外部资源。

**这说明：** 你的页面是"自包含"的，不依赖 CDN。**这是好事。**

**如果页面变样了：** 说明你引用了外部字体、图标或图片。**现在应该去掉，等第 5 周会教怎么正确处理。**

---

# 第 6 步：把页面改成你真正想要的（10 分钟）

## 6.1 现在开始改内容

**上面所有代码都是"骨架 + 示例内容"。现在换成你自己的。**

**至少改这五处：**

1. **名字和一句话介绍** —— 写真实的；
2. **"关于我"那段** —— 用你自己的话，不要用我写的；
3. **"我会的"列表** —— 只写你真会的，**不要写"精通"**；
4. **"我的作品"** —— 换成你这周真做过的东西；
5. **邮箱** —— 换成你的。

## 6.2 加一个你自己的东西

**从下面选一个加到页面里：**

- **加一张头像**（用 `<img>`，`alt` 要写）；
- **加一个"技能进度条"**（用 `<div>` + 宽度百分比）；
- **加一个"回到顶部"按钮**（点击滚动到顶）；
- **加一个"复制邮箱"按钮**（点击复制到剪贴板）；
- **加一个"当前时间"显示**（每秒更新）。

**这是让页面"属于你"的关键。** 抄来的页面没有价值。

## 6.3 如果你想加"回到顶部"

**HTML（加在 `</body>` 前）：**

```html
<button type="button" id="topBtn" class="top-btn">↑</button>
```

**CSS：**

```css
.top-btn {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 44px;
  height: 44px;
  font-size: 20px;
  color: #fff;
  background-color: var(--primary);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.top-btn:hover {
  background-color: #1765cc;
}
```

**JS：**

```javascript
document.querySelector("#topBtn").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
```

**`position: fixed` 是什么：** 相对浏览器窗口定位，滚动页面时它不动。

**`window.scrollTo({ top: 0, behavior: "smooth" })`：**
- `top: 0` —— 滚到顶部；
- `behavior: "smooth"` —— 平滑滚动，不是瞬间跳。

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 14 节课学习笔记

## 一、我的页面规划（做之前写的）

### 内容清单
1.
2.
3.
4.
5.

### 布局草图

### 标签分配

| 区块 | 用什么标签 | 为什么 |
|---|---|---|
| | | |

## 二、我用到了这一周哪些知识

| 节课 | 知识点 | 在这个页面哪里用到了 |
|---|---|---|
| 第 8 节 | HTML 标签 | |
| 第 9 节 | 语义化 | |
| 第 10 节 | CSS 颜色间距 | |
| 第 11 节 | 表单 | |
| 第 12 节 | 变量函数 | |
| 第 13 节 | 事件 | |

## 三、CSS 变量

定义：

使用：

为什么深色模式只改了几行变量就生效：

## 四、`position` 的两个值

| 值 | 意思 | 我用在哪 |
|---|---|---|
| relative | | |
| absolute | | |
| fixed | | |

父元素不写 relative，子元素 absolute 会怎样：

## 五、六个细节检查结果

| 检查项 | 结果 | 发现的问题 | 怎么修的 |
|---|---|---|---|
| 手机模拟 | | | |
| 键盘 Tab | | | |
| 深色模式可读性 | | | |
| 刷新后状态 | | | |
| 控制台报错 | | | |
| 断网访问 | | | |

## 六、我自己加的那个东西

我加的是：

为什么想加：

遇到什么问题：

## 七、刷新后深色模式丢失

现象：

原因：

需要学什么才能解决：

## 八、我还不懂的词

- 

## 九、完成检查

- [ ] 我的页面能在浏览器打开，没有报错
- [ ] 内容全是真实的，没有"精通"这种夸大
- [ ] 用了语义化标签（header/main/section/footer）
- [ ] 有表单，label 和 input 正确关联
- [ ] 有事件交互（至少切换深色和字数统计）
- [ ] 深色模式下所有文字都看得清
- [ ] 手机模拟下不横向溢出
- [ ] 只用键盘能操作所有功能
- [ ] 我自己加了至少一个功能
- [ ] 我把这个页面记进了 CONTEXT.md 的"作品"里
```

---

# 第 8 步：课后练习

## 练习一：用 localStorage 记住深色模式

**目标：** 刷新页面后，深色模式还在。

**提示：**

```javascript
// 存
localStorage.setItem("theme", "dark");

// 读
const saved = localStorage.getItem("theme");

// 在页面加载时恢复
if (saved === "dark") { ... }
```

**注意：`localStorage` 只能存字符串。**

**做完在笔记里记下：`localStorage` 和普通变量的区别是什么？**

## 练习二：加一个"技能进度条"

**要求：**

```text
HTML 会一点    ████████░░  80%
CSS 会一点     ██████░░░░  60%
JS 刚开始      ███░░░░░░░  30%
```

**提示：**

```html
<div class="bar">
  <span style="width: 80%"></span>
</div>
```

```css
.bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--primary);
}
```

**思考：进度条用 `width: 80%` 是"行内样式"，这样好吗？有没有更好的做法？**

## 练习三：做成两列布局（选做）

**目标：** 宽屏时，"关于我"和"我会的"并排；窄屏时上下堆叠。

**提示：** 需要 `display: flex` 或 `grid`。**这是第 12 节课之后的内容，第 27 周会系统讲。** 现在可以试着搜一下怎么写。

**试不出来没关系。** 但要记住这个需求叫什么：**响应式布局**。

## 练习四：找出这个页面还能改的五个地方

打开你的页面，从"如果我是面试官"的角度看：

1. 哪里让人一眼看出是新手？
2. 哪里内容太空？
3. 哪里配色不好看？
4. 哪里交互不顺畅？
5. 哪里少了必要信息？

**把五个都写下来，至少改掉三个。**

## 练习五：用自己的话讲

```text
为什么要先规划再写代码？
CSS 变量为什么能让深色模式只改几行？
position: relative 和 absolute 为什么要配对？
为什么刷新后深色模式会丢失？
```

---

# 第 9 步：最终验收

## A. 结构

- [ ] 有 `<!DOCTYPE html>` 和 `lang="zh-CN"`
- [ ] 有 `<meta charset="UTF-8">`
- [ ] 有 `<meta name="viewport" ...>`
- [ ] 用了 `<header>`、`<main>`、`<section>`、`<footer>`
- [ ] 只有一个 `<h1>`
- [ ] 标题层级不跳级
- [ ] 外部 CSS 在 `head`，JS 在末尾 + `defer`

## B. 内容

- [ ] 名字是真的
- [ ] "关于我"是自己写的，不是抄课件
- [ ] 技能列表没有"精通"
- [ ] 作品列表是真实做过的
- [ ] 邮箱格式正确

## C. 表单

- [ ] 每个输入框都有 `<label>` 且 `for`/`id` 对应
- [ ] 每个输入框都有 `name`
- [ ] 有 `required` 和 `maxlength`
- [ ] 提交时有 `preventDefault`

## D. 样式

- [ ] 用了 CSS 变量
- [ ] 卡片有 `padding`、`margin`、`border-radius`
- [ ] 内容居中，`max-width` 而不是固定 `width`
- [ ] 输入框有 `:focus` 样式
- [ ] 按钮有 `:hover` 效果
- [ ] 有 `transition` 让切换平滑

## E. 交互

- [ ] 深色模式能切换
- [ ] 字数统计实时更新
- [ ] 快到上限时变红
- [ ] 提交后显示提示
- [ ] 提交后表单清空

## F. 质量

- [ ] 控制台没有任何红色报错
- [ ] 手机模拟下不横向溢出
- [ ] 只用键盘能操作所有功能
- [ ] 深色模式下所有文字可读
- [ ] 自己加了至少一个功能

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有做之前的规划
- [ ] 有六个细节检查的记录
- [ ] “我还不懂的词”有内容

## H. 归档

- [ ] 把这个页面的路径记进了 `CONTEXT.md`
- [ ] 已 `git commit`

## 本节课要能说出口的一句话

> **一个作品不是"用了多少技术"，而是"别人打开能不能看懂、能不能用"。**

---

# 第 10 步：这一周的收尾

## 10.1 你这一周实际做出了什么

```text
第 8 节课：一个能显示文字的网页
第 9 节课：语义化改造的博客骨架
第 10 节课：有配色和间距的页面
第 11 节课：一个完整的注册表单
第 12 节课：一个能算折扣的计算器
第 13 节课：一个能增删的待办清单
第 14 节课：一个能给别人看的个人主页
```

**七个东西，每一个都能在浏览器打开。**

## 10.2 周验收

- [ ] 这一周每节课都有 commit
- [ ] 每节课的 `NOTES.md` 都有内容
- [ ] 我有七个能打开的页面
- [ ] 我能用一句话说清"HTML / CSS / JS 各管什么"
- [ ] 我能不看课件写出一个带样式的表单

## 10.3 提交这一周

```text
git add 每周课程/01-元技能与基础/第02周-网页与前端基础
git commit -m "第02周完成：HTML/CSS/JS 基础 + 个人主页"
git push
```

## 10.4 更新 CONTEXT.md

**打开根目录的 `CONTEXT.md`，加一段：**

```markdown
## 我的作品

- 第 2 周：个人主页
  路径：每周课程/01-元技能与基础/第02周-网页与前端基础/第07节课/03-练习代码/index.html
  技术：HTML + CSS + 原生 JS，无框架、无依赖
```

**为什么记这个：**
因为三个月后你会在面试时被问"你做过什么"。**这份清单就是答案。**

## 10.5 三个自问

1. 如果给你一张设计图，你知道大概怎么拆成 HTML 吗？
2. 如果页面样式乱了，你知道从哪查吗？
3. 如果按钮点了没反应，你知道先查什么吗？

**三个都能答出来，第二周才算真的结束。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 手机上字很小 | 缺 viewport meta | 加 `<meta name="viewport" ...>` |
| 手机上横向滚动 | 某元素宽度超出 | 改用 `max-width`，检查 `width: 720px` |
| 深色模式下输入框白底白字 | 没改变量或没覆盖 | 检查 `--card-bg` 是否被覆盖 |
| 切换深色后刷新丢失 | 没存 localStorage | 练习一 |
| 按钮跑到页面角落 | 父元素没写 `position: relative` | 给父元素加 |
| 焦点看不出来 | 写了 `outline: none` 没补样式 | 加 `:focus` 样式 |
| 字体和别处不一致 | 表单控件不继承字体 | 加 `font-family: inherit` |
| 卡片宽度不对 | 用了固定 `width` | 改成 `max-width` + `margin: 0 auto` |
| 提交后页面刷新 | 缺 `preventDefault` | 处理函数第一行加 |
| 提示消息不显示 | 忘了改 `hidden` | `notice.hidden = false` |
| 过渡没效果 | `transition` 加错元素 | 加在要变化的元素上 |
| 控制台 404 | 文件路径错 | 检查文件名和位置 |
| `Cannot read properties of null` | 元素 id 错或 script 太早 | 查 id、加 `defer` |
