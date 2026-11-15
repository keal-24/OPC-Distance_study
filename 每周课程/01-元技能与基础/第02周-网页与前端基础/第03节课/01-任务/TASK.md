# 第 10 节课：让页面好看——CSS 颜色、字号、间距

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前两节课你搭好了骨架。这节课给骨架"穿衣服"：**颜色、字号、间距、边框。**
> 你要学的是 CSS 最常用的 8 个属性，学完就能把一个难看的页面救回来。

**建议用时**：100 分钟
**你需要先完成**：第 9 节课（有语义化的 `index.html`）

---

# 第 0 步：CSS 到底怎么写（5 分钟）

## 0.1 CSS 就三个东西

```text
选择器 {
  属性: 值;
}
```

**举一个完整例子：**

```css
h1 {
  color: red;
}
```

**逐字读：**

- `h1` —— **选择器**，意思是"选中所有的 `<h1>` 标签"；
- `color` —— **属性**，意思是"文字颜色"；
- `red` —— **值**，意思是"红色"；
- `;` —— 每条声明结尾必须有分号。

**连起来读：** "把所有的 h1 的文字颜色改成红色。"

## 0.2 CSS 写在哪

**三种方式，按推荐顺序：**

### 方式一：单独一个 `.css` 文件（推荐）

**HTML 里：**

```html
<head>
  <meta charset="UTF-8">
  <title>我的页面</title>
  <link rel="stylesheet" href="style.css">
</head>
```

**`style.css` 里：**

```css
h1 {
  color: red;
}
```

**为什么推荐：**
一个页面可能有几百行 CSS。写在 HTML 里会把 HTML 淹掉，改起来找不到地方。

### 方式二：`<style>` 标签（小页面可以）

```html
<head>
  <style>
    h1 {
      color: red;
    }
  </style>
</head>
```

**适用：** 临时测试，或者只有几行样式的小页面。

### 方式三：行内 `style` 属性（不推荐）

```html
<h1 style="color: red;">标题</h1>
```

**为什么不推荐：**

- 只能给一个元素用，10 个标题要写 10 次；
- 修改时到处找；
- 优先级最高，以后想用 CSS 覆盖很麻烦。

**今天用方式一。** 后面的课都用方式一。

## 0.3 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `index.html` | `03-练习代码` | 上节课的页面（会加一行 link） |
| `style.css` | `03-练习代码` | 你自己写的样式 |

---

# 第 1 步：先把 CSS 接上（10 分钟）

## 1.1 复制上节课的页面过来

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第02周-网页与前端基础\第02节课\03-练习代码\index.html
   ```

2. **全选复制**（这次可以复制，因为是你自己写的）。
3. 打开本节课的 `03-练习代码` 文件夹。
4. 新建 `index.html`，粘贴。
5. 保存。

**如果你上节课没做完：**
现在自己敲一遍这个骨架。**不能跳过**，因为整节课都建立在它上面。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>小栈笔记</title>
</head>
<body>

  <header>
    <h1>小栈笔记</h1>
    <nav>
      <a href="#">首页</a>
      <a href="#">文章</a>
      <a href="#">关于</a>
    </nav>
  </header>

  <main>
    <article>
      <header>
        <h2>第一篇文章</h2>
        <p><time datetime="2026-11-16">2026-11-16</time></p>
      </header>
      <p>这是第一段内容。我用 AI 帮忙写代码，但我自己检查每一行。</p>
      <p>这是第二段内容。学会读代码比会写代码更重要。</p>
    </article>

    <article>
      <header>
        <h2>第二篇文章</h2>
        <p><time datetime="2026-11-15">2026-11-15</time></p>
      </header>
      <p>这是另一篇文章的内容。</p>
    </article>
  </main>

  <aside>
    <h2>标签</h2>
    <ul>
      <li><a href="#">记录</a></li>
      <li><a href="#">学习</a></li>
    </ul>
  </aside>

  <footer>
    <p>版权所有 2026</p>
  </footer>

</body>
</html>
```

## 1.2 新建 style.css 并接上

**操作：**

1. 在同一个文件夹新建 `style.css`。
2. 先只写一行，用来测试有没有接上：

   ```css
   body {
     background-color: #f5f5f5;
   }
   ```

   **`background-color` 是背景色，`#f5f5f5` 是一个很浅的灰色。**

3. 保存 `style.css`。
4. 在 `index.html` 的 `<head>` 里加一行：

   ```html
   <link rel="stylesheet" href="style.css">
   ```

   **放在 `<title>` 后面，`</head>` 前面。**

5. 保存 `index.html`。
6. 浏览器按 `F5` 刷新。

## 1.3 屏幕上应该看到什么

**页面背景从白色变成了浅灰色。**

**如果没变，按顺序检查：**

1. `style.css` 保存了吗？
2. `index.html` 保存了吗？
3. 浏览器刷新了吗？
4. `<link>` 那行的 `href` 是不是 `style.css`（不是 `style.css.txt`，不是别的名字）？
5. **两个文件在同一个文件夹里吗？**
6. 按 `F12` 打开开发者工具，看"控制台"（Console）有没有红色的 `404` 报错。

**`404` 是什么意思：** "找不到文件"。说明路径写错了。

## 1.4 `<link>` 那行逐字读

```html
<link rel="stylesheet" href="style.css">
```

| 部分 | 意思 |
|---|---|
| `link` | 链接外部文件 |
| `rel="stylesheet"` | 关系是"样式表"（relation = 关系） |
| `href="style.css"` | 文件地址（hypertext reference） |

**`rel="stylesheet"` 必须写对。** 写成 `rel="css"` 就不生效。

**`href` 的路径规则：**

```text
style.css         → 同一个文件夹
css/style.css     → 子文件夹里
../style.css      → 上一层文件夹
/styles/style.css → 网站根目录
```

**今天用第一种。两个文件必须放在一起。**

---

# 第 2 步：认识颜色怎么写（15 分钟）

## 2.1 三种写法

### 写法一：颜色名

```css
color: red;
color: blue;
color: black;
color: white;
```

**优点：** 好记。
**缺点：** 只有 140 多个颜色名，不够用。

**常用颜色名：**

```text
black 黑    white 白    red 红     blue 蓝
green 绿    yellow 黄   orange 橙   gray 灰
```

### 写法二：十六进制（最常用）

```css
color: #ff0000;
color: #333333;
color: #f5f5f5;
```

**怎么读 `#ff0000`：**

```text
#  +  ff  +  00  +  00
     红色   绿色   蓝色
```

**每两位是一个颜色通道，范围 00 到 ff（也就是 0 到 255）。**

- `#ff0000` = 红 255，绿 0，蓝 0 → **纯红**
- `#00ff00` = 纯绿
- `#0000ff` = 纯蓝
- `#ffffff` = 三个都是 255 → **纯白**
- `#000000` = 三个都是 0 → **纯黑**
- `#333333` = 三个都是 51 → **深灰**
- `#f5f5f5` = 三个都是 245 → **很浅的灰**

**为什么实际项目里很少用纯黑 `#000000`：**
因为纯黑配纯白对比太强，看久了眼睛累。**常用 `#333` 代替纯黑，`#f5f5f5` 代替纯白背景。**

**缩写规则：**
如果每两位的两个字符一样，可以缩成一位：

```css
#ffffff  →  #fff
#000000  →  #000
#333333  →  #333
#ff0000  →  #f00
```

**注意：** `#f5f5f5` 不能缩写（因为 `f` 和 `5` 不一样）。

### 写法三：`rgb()` 和 `rgba()`

```css
color: rgb(255, 0, 0);
color: rgba(0, 0, 0, 0.5);
```

- `rgb(红, 绿, 蓝)`：三个数字，0-255；
- `rgba(红, 绿, 蓝, 透明度)`：多一个透明度，0 到 1。

**`rgba(0, 0, 0, 0.5)` = 黑色，50% 透明。**

**什么时候用 `rgba`：**
需要半透明遮罩、阴影、玻璃效果的时候。**`rgba` 的第四个参数不能用百分比写法混用**，写 `0.5` 不要写 `50%`。

## 2.2 自己试五个颜色

**把下面代码加进 `style.css`，每加一条就刷新看效果：**

```css
/* 先清掉之前的，从头开始 */

body {
  background-color: #f5f5f5;
  color: #333333;
}

h1 {
  color: #1a73e8;
}

h2 {
  color: #202124;
}

a {
  color: #1a73e8;
}

footer {
  color: #808080;
}
```

**你应该看到：**

- 背景浅灰；
- 正文深灰（不是纯黑）；
- 大标题蓝色；
- 小标题近黑；
- 链接蓝色；
- 页脚中灰。

## 2.3 为什么要建立"色阶"意识

**看这个层次：**

```text
#202124  标题（最深）
#333333  正文（深灰）
#808080  次要文字（中灰）
#f5f5f5  背景（很浅）
```

**为什么要分层次：**
因为所有字一样黑，读者不知道先看哪。**颜色深浅来表达重要性，这是排版的基本功。**

**一个实用规则：**

```text
主要文字：不要用纯黑，用 #333 或 #202124
次要文字：用 #666 或 #808080
边框线条：用 #e0e0e0 或 #ddd
页面背景：用 #f5f5f5 或 #fafafa
```

## 2.4 一个必须知道的坑

**下面两种写法都对：**

```css
color: #FF0000;
color: #ff0000;
```

**大小写不敏感。** 但**项目里要统一**，建议全小写。

**这个写法是错的：**

```css
color: #ff00;    /* 只有 4 位，不对 */
color: ff0000;   /* 少了 # */
color: #gg0000;  /* g 不是十六进制字符 */
```

**十六进制只有 0-9 和 a-f 这 16 个字符。** 没有 `g`。

---

# 第 3 步：字号、字体、行高（15 分钟）

## 3.1 `font-size`：字号

```css
h1 {
  font-size: 32px;
}

p {
  font-size: 16px;
}
```

**单位是什么：**

| 单位 | 意思 | 什么时候用 |
|---|---|---|
| `px` | 像素 | 最常用，直观 |
| `rem` | 相对根元素字号 | 需要整体缩放时用 |
| `em` | 相对父元素字号 | 少用，容易算错 |
| `%` | 百分比 | 少用 |

**今天统一用 `px`。** 后面讲响应式时会用 `rem`。

**常用字号参考：**

```text
h1       32px
h2       24px
h3       20px
正文     16px   ← 浏览器默认值
小字     14px
注释     12px
```

**注意：正文不要小于 14px。** 手机上 14px 已经偏小了。

## 3.2 `font-weight`：字重（粗细）

```css
h1 {
  font-weight: 700;
}

p {
  font-weight: 400;
}
```

**数值含义：**

```text
100-300  细
400      正常（默认）
500      中等
600      半粗
700      粗（和 bold 一样）
800-900  特粗
```

**也可以用关键字：**

```css
font-weight: normal;  /* = 400 */
font-weight: bold;    /* = 700 */
```

**注意：** 不是所有字体都支持所有字重。中文字体通常只有 400 和 700 两档。

## 3.3 `line-height`：行高

```css
p {
  line-height: 1.6;
}
```

**这是什么：** 每行文字占据的高度。

**为什么重要：**
行高太小，多行文字挤在一起，读起来累。**这是最容易被忽略、但影响最大的属性之一。**

**推荐值：**

```text
标题：1.2 - 1.3
正文：1.6 - 1.8
```

**为什么用无单位数字（`1.6`）而不用 `px`：**
因为无单位数字是"字号的倍数"。字号变了，行高自动跟着变。写 `line-height: 24px` 的话，你改字号就得改行高。

## 3.4 `font-family`：字体

```css
body {
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

**这一长串是什么意思：**

浏览器从左往右试，用第一个能找到的：

1. `-apple-system` —— 苹果系统的默认字体；
2. `"PingFang SC"` —— 苹果的苹方（中文）；
3. `"Microsoft YaHei"` —— 微软雅黑（Windows 中文）；
4. `sans-serif` —— 最后兜底：无衬线字体。

**为什么要写一串：**
因为用户可能用 Windows、Mac、手机。**你不能指定一个只在自己电脑上有的字体。**

**`sans-serif` 是什么：**
"无衬线字体"。衬线是字母边上的小装饰。

```text
有衬线（serif）：Times New Roman —— 笔画末端有小横线
无衬线（sans-serif）：Arial —— 笔画干净
```

**屏幕上用无衬线更好读。** 印刷品常用衬线。

**含空格的字体名必须加引号：**

```css
font-family: "Microsoft YaHei";   /* 对 */
font-family: Microsoft YaHei;     /* 错 */
```

## 3.5 四个属性一起试

**在 `style.css` 里加上：**

```css
body {
  background-color: #f5f5f5;
  color: #333333;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

h1 {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
}

h2 {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

p {
  font-size: 16px;
  line-height: 1.7;
}
```

**保存刷新。**

**现在应该明显好看一些：** 字号有层次，行距舒服，字体也是系统中文字体。

## 3.6 做一个对比实验

**操作：**

1. 把 `line-height: 1.7` 改成 `line-height: 1`；
2. 保存刷新。

**你会看到：** 段落里的多行文字挤成一坨。

**再改成 `line-height: 2.5`。**

**你会看到：** 行距太宽，读起来断断续续。

**结论：** 行高不是越大越好。**1.6-1.8 是舒适区。**

**实验完改回 1.7。**

---

# 第 4 步：间距——`margin` 和 `padding`（20 分钟）

## 4.1 这是 CSS 最核心的概念

**先看一个盒子模型：**

```text
┌─────────────────────────────────┐  ← 外边距 margin
│  ┌───────────────────────────┐  │
│  │  边框 border              │  │
│  │  ┌─────────────────────┐  │  │
│  │  │ 内边距 padding      │  │  │
│  │  │  ┌───────────────┐  │  │  │
│  │  │  │  内容 content │  │  │  │
│  │  │  └───────────────┘  │  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**四个层的区别：**

| 层 | 中文 | 作用 |
|---|---|---|
| `content` | 内容 | 文字、图片本身 |
| `padding` | 内边距 | 内容和边框之间的空隙（**在盒子里面**） |
| `border` | 边框 | 盒子的边线 |
| `margin` | 外边距 | 这个盒子和别的盒子之间的距离（**在盒子外面**） |

**最容易混的是 padding 和 margin：**

```text
padding = 盒子里的填充（撑大盒子）
margin  = 盒子外的间距（推远别人）
```

**一个好记的比喻：**

```text
你穿了一件衣服（content + padding 是衣服本身）
衣服和身体之间塞了棉花 → padding
衣服和别人之间的距离 → margin
```

## 4.2 `padding` 怎么写

```css
article {
  padding: 20px;
}
```

**意思是：四个方向都是 20px。**

**四种写法：**

```css
padding: 20px;                  /* 上下左右都是 20 */
padding: 10px 20px;             /* 上下 10，左右 20 */
padding: 10px 20px 30px;        /* 上 10，左右 20，下 30 */
padding: 10px 20px 30px 40px;   /* 上 右 下 左（顺时针） */
```

**记忆口诀：**

```text
一个值：全一样
两个值：上下 / 左右
三个值：上 / 左右 / 下
四个值：上 右 下 左（顺时针，从上面开始）
```

**也可以单独写：**

```css
padding-top: 10px;
padding-right: 20px;
padding-bottom: 30px;
padding-left: 40px;
```

## 4.3 `margin` 怎么写

**规则和 `padding` 完全一样：**

```css
margin: 0 auto;        /* 上下 0，左右自动（水平居中） */
margin-top: 20px;
margin-bottom: 16px;
```

**`margin: 0 auto` 是什么：**
- 上下 0；
- 左右 `auto` = 自动平均分配 → **实现水平居中**。

**这个写法要求元素有明确宽度。**

```css
main {
  max-width: 800px;
  margin: 0 auto;
}
```

**`max-width` 是"最大宽度"，`margin: 0 auto` 让它居中。**

**这是最常用的页面居中写法。记下来。**

## 4.4 一个必须知道的坑：margin 塌陷

**做这个实验：**

```css
article {
  margin-bottom: 30px;
}

section {
  margin-top: 20px;
}
```

**如果 `article` 下面紧跟着 `section`：**

**你以为的间距：** 30 + 20 = 50px。

**实际的间距：** **30px**（取大的那个）。

**这叫"外边距合并"（margin collapse）。** 垂直方向的相邻 margin 不会相加，而是取最大值。

**为什么这样设计：**
为了让段落间距自然。如果每段都写 `margin: 16px`，段间距就是 16px，不是 32px。

**怎么避免踩坑：**

- 统一用 `margin-bottom`，不用 `margin-top`（一个方向就不会合并）；
- 或者用 `gap`（后面讲 flex 时会用）。

**今天先做一件事：全项目统一只写 `margin-bottom`。**

## 4.5 用 padding 和 margin 改造页面

**在 `style.css` 里加上：**

```css
body {
  background-color: #f5f5f5;
  color: #333333;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
}

header {
  background-color: #ffffff;
  padding: 24px 32px;
  margin-bottom: 24px;
  border-bottom: 1px solid #e0e0e0;
}

h1 {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 12px 0;
}

nav a {
  color: #1a73e8;
  text-decoration: none;
  margin-right: 16px;
}

main {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 16px;
}

article {
  background-color: #ffffff;
  padding: 24px;
  margin-bottom: 20px;
  border-radius: 8px;
}

article h2 {
  font-size: 24px;
  margin: 0 0 8px 0;
}

aside {
  max-width: 800px;
  margin: 0 auto 24px;
  padding: 16px 24px;
  background-color: #ffffff;
  border-radius: 8px;
}

footer {
  text-align: center;
  padding: 24px;
  color: #808080;
  font-size: 14px;
}
```

**保存刷新。**

## 4.6 现在应该看到什么

- 页面有浅灰背景；
- 页头是白色条，下面有一条细线；
- 文章卡片是白色圆角块，之间有间距；
- 内容居中，左右不会贴边；
- 页脚文字居中、灰色、小字。

**如果看起来乱，检查：**

1. 有没有漏分号？
2. 花括号配对了吗？
3. 刷新了吗？

## 4.7 新出现的四个属性

### `border-bottom: 1px solid #e0e0e0`

**拆开读：**

```text
1px      粗细
solid    样式（实线）
#e0e0e0  颜色
```

**`solid` 的其他选择：**

```text
solid   实线
dashed  虚线
dotted  点线
none    无边框
```

### `border-radius: 8px`

**圆角。** 数值越大越圆。

```css
border-radius: 8px;     /* 小圆角 */
border-radius: 50%;     /* 圆形（元素是正方形时） */
```

### `text-decoration: none`

**去掉链接默认的下划线。**

**为什么要去掉：**
默认链接有下划线，看起来旧。但**去掉后要保证链接颜色和正文不同**，不然用户不知道能点。

### `text-align: center`

**文字居中。**

```css
text-align: left;     /* 左对齐（默认） */
text-align: center;   /* 居中 */
text-align: right;    /* 右对齐 */
```

**注意：** 这个只影响"文字"，不影响"元素位置"。

---

# 第 5 步：`class` 和 `id`——精准选择元素（15 分钟）

## 5.1 为什么要用 class

**现在的问题：**

```css
article {
  background-color: #ffffff;
  padding: 24px;
}
```

**这会让所有 `article` 都变成白卡片。**

**如果我只想让"置顶的那一篇"特别一点呢？**

**这就需要用 `class`。**

## 5.2 `class` 的用法

**HTML 里：**

```html
<article class="pinned">
  <h2>置顶文章</h2>
</article>
```

**CSS 里：**

```css
.pinned {
  border-left: 4px solid #1a73e8;
}
```

**注意前面的点 `.`** —— 这表示"class 选择器"。

**一个元素可以有多个 class：**

```html
<article class="card pinned">
```

```css
.card { background: #fff; }
.pinned { border-left: 4px solid #1a73e8; }
```

**两个都会生效。**

## 5.3 `id` 的用法

**HTML 里：**

```html
<main id="top">
```

**CSS 里：**

```css
#top {
  padding-top: 20px;
}
```

**注意前面的 `#`** —— 这表示"id 选择器"。

## 5.4 `class` 和 `id` 的区别

| 对比项 | `class` | `id` |
|---|---|---|
| CSS 选择器写法 | `.name` | `#name` |
| 一个页面能用几次 | 无数次 | **只能一次** |
| 一个元素能有几个 | 多个 | 一个 |
| 用途 | 样式 | 锚点跳转、JS 定位 |
| 优先级 | 低 | 高 |

**最重要的差别：** **`id` 在一个页面里必须唯一。**

```html
<div id="a">一</div>
<div id="a">二</div>   ← 错，不能重复
```

**为什么 `id` 要唯一：**
因为它是"身份证号"。重复了，锚点跳转和 JS 都会找错。

## 5.5 什么时候用哪个

**规则（本课程统一）：**

```text
样式 → 一律用 class
锚点跳转（<a href="#top">）、JS 定位 → 用 id
```

**为什么样式不用 id：**
因为 `id` 优先级比 `class` 高很多，以后想覆盖很难。**而且一个样式如果只能用一次，就不该定成样式。**

## 5.6 复合选择器

**后代选择器（空格）：**

```css
article h2 {
  color: red;
}
```

**意思是：`article` 里面的所有 `h2`。**

**注意：** 不管嵌套多少层，只要是 `article` 里面的 `h2` 都会命中。

**子元素选择器（`>`）：**

```css
article > h2 {
  color: red;
}
```

**意思是：只选 `article` 的"直接子元素" `h2`，不管更深层的。**

**多个选择器（逗号）：**

```css
h1, h2, h3 {
  font-weight: 700;
}
```

**意思是：三个都应用同样的样式。**

**这个写法很实用。** 不用重复写三遍。

## 5.7 现在给页面加 class

**改造 HTML，加三个 class：**

```html
<article class="card pinned">
  <header>
    <h2>第一篇文章</h2>
    <p class="meta"><time datetime="2026-11-16">2026-11-16</time></p>
  </header>
  <p>这是第一段内容。我用 AI 帮忙写代码，但我自己检查每一行。</p>
  <p>这是第二段内容。学会读代码比会写代码更重要。</p>
</article>

<article class="card">
  <header>
    <h2>第二篇文章</h2>
    <p class="meta"><time datetime="2026-11-15">2026-11-15</time></p>
  </header>
  <p>这是另一篇文章的内容。</p>
</article>
```

**对应的 CSS：**

```css
.card {
  background-color: #ffffff;
  padding: 24px;
  margin-bottom: 20px;
  border-radius: 8px;
}

.pinned {
  border-left: 4px solid #1a73e8;
}

.meta {
  color: #808080;
  font-size: 14px;
  margin-bottom: 16px;
}
```

**现在第一篇有蓝色左边框，第二篇没有。** 这就是 class 的作用。

## 5.8 一个必须注意的点

**class 名字不要用中文，也不要用保留词。**

**错误：**

```css
.卡片 { }      /* 中文在大多数情况能用但不建议 */
.card-title { } /* 这个是对的 */
.1st { }        /* 不能以数字开头 */
```

**命名建议（本课程统一）：**

```text
小写字母
多个单词用短横线连接（kebab-case）
不要用下划线
```

**例子：**

```css
.card { }
.card-title { }
.card-meta { }
.is-pinned { }
```

**为什么用短横线：**
CSS 里 `-` 是最通用的分隔符。而且和第 7 节课的 CONTEXT.md 约定一致。

---

# 第 6 步：最终整理——把页面做完（10 分钟）

## 6.1 完整的 style.css

**现在把你的 `style.css` 整理成下面的样子。自己敲，不要复制。**

```css
/* ========== 基础 ========== */

body {
  background-color: #f5f5f5;
  color: #333333;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
}

/* ========== 页头 ========== */

header {
  background-color: #ffffff;
  padding: 24px 32px;
  margin-bottom: 24px;
  border-bottom: 1px solid #e0e0e0;
}

h1 {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 12px 0;
}

nav a {
  color: #1a73e8;
  text-decoration: none;
  margin-right: 16px;
  font-size: 15px;
}

nav a:hover {
  text-decoration: underline;
}

/* ========== 主体 ========== */

main {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 16px;
}

.card {
  background-color: #ffffff;
  padding: 24px;
  margin-bottom: 20px;
  border-radius: 8px;
}

.pinned {
  border-left: 4px solid #1a73e8;
}

.card h2 {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.meta {
  color: #808080;
  font-size: 14px;
  margin-bottom: 16px;
}

/* ========== 侧栏 ========== */

aside {
  max-width: 800px;
  margin: 0 auto 24px;
  padding: 16px 24px;
  background-color: #ffffff;
  border-radius: 8px;
}

aside h2 {
  font-size: 18px;
  margin: 0 0 12px 0;
}

aside ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

aside li {
  display: inline-block;
  margin-right: 12px;
}

aside a {
  color: #1a73e8;
  text-decoration: none;
  font-size: 14px;
}

/* ========== 页脚 ========== */

footer {
  text-align: center;
  padding: 24px;
  color: #808080;
  font-size: 14px;
}
```

## 6.2 新出现的三个东西

### `nav a:hover`

**`hover` 是什么：** 鼠标悬停时的状态。

```css
nav a:hover {
  text-decoration: underline;
}
```

**意思是：鼠标移到链接上时，显示下划线。**

**`hover` 是"伪类"，用冒号连接。** 常用的还有：

```text
:hover   鼠标悬停
:active  按下时
:focus   获得焦点（比如用 Tab 键选中输入框）
```

### `list-style: none`

**去掉列表前面的圆点。**

**为什么需要：**
`<ul>` 默认有圆点。做成导航或标签时，圆点很难看。

### `display: inline-block`

**让元素"横着排"。**

**默认情况下：**

```text
<div> <p> <h2> 是"块级元素"，各占一行
<a> <span> 是"行内元素"，可以横着排
```

**`display: inline-block` 让一个块级元素既能横排，又能设置宽高。**

**今天先知道可以用它横排。** 更规范的横排方式（`flex`）第 12 节课会讲。

## 6.3 最终效果

**刷新浏览器，你应该看到：**

- 浅灰背景，白色页头带底线；
- 大标题深色粗体，导航链接蓝色横排；
- 内容居中，最大宽 800px；
- 两篇文章都是白色圆角卡片，下面有间距；
- 第一篇左边有蓝色竖线；
- 日期是灰色小字；
- 侧栏白卡片，标签横排；
- 页脚居中灰色小字。

**这就是一个"能看"的页面了。**

**对比第 8 节课那个纯文字堆砌的版本，差别是巨大的。**

## 6.4 检查清单

- [ ] 背景是浅灰不是纯白？
- [ ] 正文不是纯黑？
- [ ] 行距舒服，不挤？
- [ ] 内容没有贴屏幕左边缘？
- [ ] 卡片之间有间距？
- [ ] 卡片是圆角？
- [ ] 链接没有下划线，悬停时有？
- [ ] 日期是灰色小字？
- [ ] 第一篇有蓝色左边框，第二篇没有？

**有一项不对，回去找对应的 CSS 规则。**

---

# 第 7 步：故意犯五个错（10 分钟）

**CSS 的特点是：写错了不报错，只是"样式不生效"。** 所以你必须认识这五种情况。

## 错误 1：漏分号

**操作：**

```css
h1 {
  font-size: 32px
  color: red;
}
```

（`32px` 后面少了分号）

**会怎样：** `color: red` 不生效，可能连 `font-size` 也失效。

**为什么：** 浏览器看到 `32px color: red` 觉得语法不对，可能整条规则都丢掉。

**这是最常见的 CSS 错误。** 每次样式"莫名其妙不生效"，先看上一行有没有分号。

## 错误 2：中文冒号

**操作：**

```css
h1 {
  color：red;
}
```

（`color` 后面是中文冒号 `：`）

**会怎样：** 完全不生效。

**为什么：** 浏览器不认识中文冒号。

**这个坑极难发现，因为两个冒号看起来几乎一样。**

**怎么查：** 把光标放到冒号后面，删掉重新用英文输入法打一个。

## 错误 3：选择器拼错

**操作：**

```html
<article class="card">
```

```css
.crad {
  background: #fff;
}
```

（`card` 拼成了 `crad`）

**会怎样：** 卡片没有白背景。

**怎么查：** 打开 `F12` 开发者工具，用"选择元素"工具点一下卡片，看右侧样式面板里有没有 `.card` 规则。

**这是排查 CSS 最有效的方法。**

## 错误 4：路径写错

**操作：**

```html
<link rel="stylesheet" href="styles.css">
```

（文件名是 `style.css`，写成了 `styles.css`）

**会怎样：** 整个样式表都不生效，页面回到无样式状态。

**怎么查：** `F12` → 控制台（Console），会有红色 `404` 报错。

## 错误 5：优先级被覆盖

**操作：** 在 HTML 里写行内样式：

```html
<h1 style="color: red;">标题</h1>
```

**同时在 CSS 里写：**

```css
h1 {
  color: blue;
}
```

**会怎样：** 显示红色。

**为什么：** 行内样式优先级高于外部 CSS。

**这就是为什么第 0 步说不要用行内样式。** 它会让你的 CSS 失效，而且很难查。

## 五个错误总结

```text
漏分号     → 整条规则可能失效
中文冒号   → 完全不生效
选择器拼错 → 只影响那个元素
路径写错   → 整个样式表失效
行内样式   → 覆盖你的 CSS
```

**排查顺序（背下来）：**

```text
① F12 看控制台有没有 404
② F12 看元素面板有没有这条规则
③ 检查上一行有没有分号
④ 检查冒号、引号是不是中文
⑤ 检查 class 名字拼写
```

---

# 第 8 步：写学习笔记（10 分钟）

```markdown
# 第 10 节课学习笔记

## 一、CSS 的三个部分

```css
（写一个完整的 CSS 规则，并标注哪部分是选择器、属性、值）
```

## 二、CSS 写在哪三种地方

1.
2.
3.
（哪种最推荐，为什么）

## 三、颜色的三种写法

1. 颜色名：例子
2. 十六进制：例子，怎么读
3. rgb/rgba：例子，什么时候用

## 四、我的配色方案

| 用途 | 颜色值 |
|---|---|
| 页面背景 | |
| 卡片背景 | |
| 主要文字 | |
| 次要文字 | |
| 链接 | |
| 边框 | |

## 五、字号层次

| 元素 | 字号 | 字重 | 行高 |
|---|---|---|---|
| h1 | | | |
| h2 | | | |
| 正文 | | | |
| 小字 | | | |

## 六、盒子模型

（画出来，标出 content、padding、border、margin）

padding 和 margin 的区别：

## 七、padding 四种写法的含义

```css
padding: 20px;                 /* */
padding: 10px 20px;            /* */
padding: 10px 20px 30px;       /* */
padding: 10px 20px 30px 40px;  /* */
```

## 八、class 和 id 的区别

| 对比项 | class | id |
|---|---|---|
| 选择器写法 | | |
| 页面能用几次 | | |
| 一个元素能有几个 | | |
| 我该什么时候用 | | |

## 九、五个错误的后果

| 错误 | 后果 | 怎么查 |
|---|---|---|
| 漏分号 | | |
| 中文冒号 | | |
| 选择器拼错 | | |
| 路径写错 | | |
| 行内样式 | | |

## 十、行高实验的结果

行高 1：
行高 1.7：
行高 2.5：
我的结论：

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 我的页面接上了外部 CSS 文件
- [ ] 背景、文字、链接颜色都改了
- [ ] 字号有层次（h1 > h2 > 正文 > 小字）
- [ ] 行高在 1.6-1.8 之间
- [ ] 内容居中，没有贴边
- [ ] 卡片有 padding、margin、圆角
- [ ] 用了 class 选择器
- [ ] 我做过五个错误的实验
- [ ] 我能用 F12 排查样式不生效的原因
```

---

# 第 9 步：课后练习

## 练习一：做一套配色

给下面 6 个用途各选一个颜色，做成一个"配色方案"写进笔记：

```text
页面背景
卡片背景
主要文字
次要文字
链接
边框线
```

**要求：**

- 不能全用纯黑纯白；
- 主要文字和背景的对比要够（看久了不累）；
- 链接颜色要能区分出来。

**提示：** 可以用浏览器的取色工具（`F12` → 样式面板里点颜色方块）。

## 练习二：改成一个"暗色版"

复制一份 `style.css` 改成 `style-dark.css`，把配色反过来：

- 背景深色（如 `#1a1a1a`）；
- 文字浅色（如 `#e0e0e0`）；
- 卡片稍浅（如 `#262626`）。

然后在 `index.html` 里换成 `style-dark.css`，看效果。

**注意：暗色模式下纯白文字会刺眼，要用 `#e0e0e0` 这类柔和的浅色。**

## 练习三：调出三种间距感觉

**同一份 HTML，只改 CSS 的间距，做出三种效果：**

1. 紧凑版：`padding: 12px`，`margin-bottom: 8px`；
2. 舒适版：`padding: 24px`，`margin-bottom: 20px`；
3. 宽松版：`padding: 40px`，`margin-bottom: 32px`。

**分别截图或记录你的感受：哪种最适合阅读？为什么？**

## 练习四：找出下面这段 CSS 的四个错误

```css
body {
  background-color：#f5f5f5
  color: #333
  font-size: 16px;
}

.card {
  padding: 24px
  margin-bottom: 20px;
}

.crad-title {
  font-size: 22px;
}
```

## 练习五：用自己的话讲

```text
为什么正文不用纯黑？
padding 和 margin 的区别是什么？
为什么样式要用 class 不用 id？
CSS 写错了为什么不会报错？
```

---

# 第 10 步：最终验收

## A. 基础

- [ ] 我能说出 CSS 规则的三个部分
- [ ] 我知道 CSS 写在哪三种地方，以及哪种最推荐
- [ ] 我知道 `<link rel="stylesheet" href="...">` 每个部分的意思
- [ ] 我知道路径写错会出现什么现象

## B. 颜色

- [ ] 我能读十六进制颜色（知道 `#ff0000` 是什么）
- [ ] 我知道 `#fff` 是 `#ffffff` 的缩写
- [ ] 我知道正文不该用纯黑
- [ ] 我会用 `rgba` 做半透明

## C. 文字

- [ ] 我知道常用字号（h1 32、正文 16）
- [ ] 我知道正文行高该是 1.6-1.8
- [ ] 我知道 `font-family` 为什么要写一串
- [ ] 我知道无单位行高比 `px` 好

## D. 间距

- [ ] 我能画出盒子模型
- [ ] 我能说清 padding 和 margin 的区别
- [ ] 我知道 `padding: 10px 20px` 是什么意思
- [ ] 我知道 `margin: 0 auto` 是水平居中
- [ ] 我知道垂直 margin 会合并

## E. 选择器

- [ ] 我知道 `.name` 是 class 选择器
- [ ] 我知道 `#name` 是 id 选择器
- [ ] 我知道 id 一个页面只能用一个
- [ ] 我知道样式该用 class 不用 id
- [ ] 我会用后代选择器 `article h2`
- [ ] 我会用逗号同时选多个

## F. 实操

- [ ] `03-练习代码/index.html` 接上了 `style.css`
- [ ] 页面背景不是纯白
- [ ] 有字号层次
- [ ] 内容居中没有贴边
- [ ] 卡片有 padding、margin、border-radius
- [ ] 用了至少 3 个 class
- [ ] 链接有 hover 效果
- [ ] 我做过五个错误的实验

## G. 排错

- [ ] 我会用 `F12` 看控制台的 404
- [ ] 我会用 `F12` 看元素面板的样式
- [ ] 我知道“样式不生效”先查上一行分号
- [ ] 我知道中文标点会导致不生效

## H. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有完整的配色方案表
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **CSS 写错了不会报错，只会"不生效"。所以排查能力比记属性重要。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 样式完全没生效 | `<link>` 路径错 | `F12` 看控制台 404，改对文件名 |
| 只有部分样式生效 | 某条规则漏分号或语法错 | 从失效那条往上找 |
| 改了 CSS 没变化 | 没保存或没刷新 | `Ctrl + S` 后 `F5` |
| 颜色没变 | 选择器拼错或被覆盖 | `F12` 元素面板看命中的规则 |
| 中文显示成方框 | 字体不含中文 | `font-family` 加中文字体 |
| 内容贴屏幕边 | 没有 `padding` 或 `margin` | 给 `body` 加 `padding: 0`，给容器加 `padding` |
| 卡片间距比预期大 | margin 合并取大值 | 统一只用 `margin-bottom` |
| 居中不生效 | 没写 `max-width` | `margin: 0 auto` 需要配合宽度 |
| 圆角不显示 | 元素没有背景色 | 圆角需要背景或边框才看得见 |
| 文字竖排了 | 误用了 `display: block` 在小元素上 | 改回 `inline-block` 或加 `flex` |
| `hover` 不生效 | 写成了 `a.hover` | 要写 `a:hover`（冒号不是点） |
| `#fff` 和 `#ffffff` 效果一样 | 它们就是同一个颜色 | 缩写只是简写，这不算错 |
| 中文冒号看起来一样 | 字体渲染 | 放大看，或用 `F12` 检查实际字符 |
