# 第 245 节课：完成获客页面——把这一周的六份文档变成一个能发出去的链接

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天真的写代码。但代码只是壳子，里面装的是前六节课的东西：
> **客户画像 → 一句话介绍 → 三个案例 → 三档报价 → 一个能点的联系方式。**
>
> 做完这一课，你有一个**能发给任何人的链接**。这是你第一个"销售资产"。

**建议用时**：150 分钟
**你需要先完成**：第 241 节课（案例）、第 242 节课（服务介绍）、第 243 节课（三档报价）、第 244 节课（提案）

---

# 第 0 步：先定这一页要干什么（10 分钟）

## 0.1 一个页面只能有一个目标

| 页面的目标 | 不是 |
|---|---|
| 让对的人**给你发一条消息** | 展示设计水平 |
| | 把所有功能列一遍 |
| | 显得公司很大 |

**整页只为一件事服务：让他点"加我微信/发邮件"。**

## 0.2 受众只有一类人

**这一页不是给所有人看的。是给第 239 节课那张画像卡上的人看的。**

> **写完自己检查：如果一个人看完说"这是给 XX 做的吧"，就对了。**
>
> **如果说"看起来挺通用"，就失败了。**

## 0.3 页面结构（五段，顺序不能换）

```text
1. 首屏     ← 一句话版 + 一句话补充 + 一个按钮
2. 你有这个问题吗  ← 3 条，用客户原话
3. 我做过什么      ← 3 个案例卡
4. 怎么合作        ← 三档 + 说明"不含什么"
5. 怎么找我        ← 联系方式 + 一个简单的表单
```

**为什么这个顺序：**

| 顺序 | 他脑子里的问题 |
|---|---|
| 1 | 这是干什么的？ |
| 2 | 说的是不是我？ |
| 3 | 他真做过吗？ |
| 4 | 多少钱？ |
| 5 | 怎么联系？ |

**顺序错了，他在第 2 段就走了。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `landing/index.html` | `03-练习代码` | 完整页面 |
| `landing/styles.css` | `03-练习代码` | 样式 |
| `landing/screenshots/` | 同上 | 案例图 |

---

# 第 1 步：搭骨架（25 分钟）

## 1.1 建文件

在 `03-练习代码/` 里新建文件夹 `landing`，里面新建两个文件：

```text
landing/
├── index.html
└── styles.css
```

> **不要用记事本建 `index.html.txt`。** 建的时候把"文件扩展名"显示打开（资源管理器 → 查看 → 文件扩展名）。

## 1.2 先写最小 HTML（自己敲，不要复制）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>产品参数问答助手 · 我帮制造厂解决新销售查参数的问题</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <header class="hero">
    <h1>新销售查参数不用再问老销售</h1>
    <p>手机里问一句，答案带着原文出处出来。</p>
    <a class="btn" href="#contact">聊聊你的情况</a>
  </header>

  <main>
    <section id="problem"> </section>
    <section id="cases"> </section>
    <section id="price"> </section>
    <section id="contact"> </section>
  </main>

  <footer> </footer>

  <script src="main.js"></script>
</body>
</html>
```

**存盘，双击 `index.html`。你应该看到：一行大标题、一行小字、一个按钮。**

**看不到 → 先解决这个问题，不要往下走。**

## 1.3 三个 `meta` 的作用

| 标签 | 作用 | 不写会怎样 |
|---|---|---|
| `charset="UTF-8"` | 中文编码 | 满屏乱码 |
| `viewport` | 手机上按手机宽度显示 | 手机上字小得要放大 |
| `title` | 浏览器标签页文字、微信分享标题 | 分享出去是一串网址 |

> **`title` 要写"干什么 + 给谁"，不要写"我的主页"。**

---

# 第 2 步：写首屏（20 分钟）

## 2.1 首屏三件套

```html
<header class="hero">
  <h1>新销售查参数不用再问老销售</h1>
  <p>手机里问一句，答案带着原文出处出来。120 份产品资料，5 秒出结果。</p>
  <a class="btn" href="#contact">聊聊你的情况</a>
</header>
```

**三件的分工：**

| 元素 | 写什么 | 长度 |
|---|---|---|
| `h1` | 他的**痛**被解决后的样子 | 12-18 字 |
| `p` | 怎么做到的 + 一个数字 | 20-40 字 |
| 按钮 | 一个**成本很低**的动作 | 4-8 字 |

## 2.2 `h1` 的四种写法，哪种最好

| 写法 | 评价 |
|---|---|
| "专业 AI 应用开发服务" | 最差，谁都能说 |
| "产品参数智能问答系统" | 差，是产品名不是结果 |
| "我帮制造厂做 AI 助手" | 中，有对象但没结果 |
| **"新销售查参数不用再问老销售"** | **最好，说的是他昨天遇到的事** |

## 2.3 按钮文字的三个版本

| 文字 | 评价 |
|---|---|
| "立即咨询" | 像广告，压力大 |
| "了解更多" | 没有动作 |
| **"聊聊你的情况"** | 成本低，不像推销 |

> **按钮的目的是让他"愿意点"，不是让他"决定买"。**

---

# 第 3 步：写"你有这个问题吗"（20 分钟）

## 3.1 直接用客户原话

```html
<section id="problem">
  <h2>如果你也遇到这些</h2>
  <ul class="pains">
    <li>新来的销售答错了型号，客户直接不理了。</li>
    <li>同一个参数在三个文件里不一样，谁也不敢确定哪个对。</li>
    <li>答错了要等客户投诉才知道。</li>
  </ul>
  <p class="note">这三条，是 XX 机械的销售总监原话。</p>
</section>
```

**最后那句"是客户原话"非常重要：**

| 作用 | 说明 |
|---|---|
| 证明你真做过 | 不是编的场景 |
| 让他自己对照 | "我们也是这样" |
| 建立"同行"感 | 他会想认识那个总监 |

> **如果他不是这类客户，看到这里就会走。这正好，你不想要他。**

## 3.2 三条就够了，不要六条

**三条他能对上两条，就会往下看。六条他一条都对不上，就关了。**

---

# 第 4 步：写三个案例卡（25 分钟）

## 4.1 卡片结构

```html
<section id="cases">
  <h2>我做过的</h2>

  <article class="card">
    <h3>笔记问答助手（自建）</h3>
    <p class="oneliner">600 篇笔记，从"翻 10 分钟找不到"到"5 秒出答案"。</p>
    <img src="screenshots/case1.png" alt="问答界面：输入一句话，下面是带出处的答案">
    <dl>
      <dt>之前</dt><dd>找一条三个月前记的命令，翻 10 分钟</dd>
      <dt>之后</dt><dd>5 秒，答案下面有原文片段</dd>
    </dl>
    <p class="limits">还做不到：扫描版 PDF 里的图识别不了。</p>
  </article>

  <!-- 再写两个 article -->
</section>
```

## 4.2 卡片里必须有"还做不到"

**这一行是整页最容易被信任的地方。**

| 只写好的 | 写了一条"做不到" |
|---|---|
| 像广告 | 像工程师 |
| 他会怀疑数字 | 他会相信数字 |

## 4.3 图片的三条规矩

| 规矩 | 说明 |
|---|---|
| `alt` 必须写 | 图挂了、读屏软件、微信预览都靠它 |
| 图不要超过 200KB | 手机上加载慢，他会关掉 |
| 宽度自适应 | CSS 里 `img { max-width: 100%; height: auto; }` |

**压缩图片：** 用系统画图工具"重新调整大小"，或者在线压缩工具，把 3000px 宽压到 1200px。

---

# 第 5 步：写三档报价（20 分钟）

## 5.1 用表格，不要用三个大卡片

```html
<section id="price">
  <h2>怎么合作</h2>

  <table class="plans">
    <thead>
      <tr><th></th><th>基础</th><th class="pick">标准（多数人选的）</th><th>完整</th></tr>
    </thead>
    <tbody>
      <tr><th>价格</th><td>¥9,000</td><td class="pick">¥16,500</td><td>¥30,000</td></tr>
      <tr><th>文档导入</th><td>30 份</td><td class="pick">120 份</td><td>120 份 + 自助导入</td></tr>
      <tr><th>答案出处</th><td>文件名</td><td class="pick">文件名 + 页码</td><td>+ 原文高亮</td></tr>
      <tr><th>后台管理</th><td>无</td><td class="pick">改文案 / 传文档</td><td>用户 / 权限 / 日志</td></tr>
      <tr><th>维护期</th><td>1 个月</td><td class="pick">3 个月</td><td>6 个月</td></tr>
    </tbody>
  </table>

  <p class="note">
    模型调用按实际用量另计（约 ¥0.002/千字），服务器约 ¥100/月。
  </p>
  <p class="note">
    不包含：手机 App、扫描件 OCR、与现有 ERP 的自动同步、内容录入。
  </p>
</section>
```

## 5.2 三个细节决定成不成

| 细节 | 为什么 |
|---|---|
| **中间列加底色 + 标"多数人选的"** | 80% 的人直接选中间 |
| **"不包含"必须出现** | 挡掉不合适的人，省双方时间 |
| **模型费另计写在价格下面** | 不写，两个月后吵架 |

## 5.3 表格在手机上会挤，怎么办

**两种做法，任选一种：**

| 做法 | CSS |
|---|---|
| 允许横向滚动（简单） | `.plans { display: block; overflow-x: auto; white-space: nowrap; }` |
| 手机上改成卡片（好看，费劲） | 用 `@media` + `display: block` 重排 |

**第一版就用横向滚动。** 能用比好看重要。

---

# 第 6 步：写联系方式（15 分钟）

## 6.1 最简版：一个 mailto

```html
<section id="contact">
  <h2>聊聊你的情况</h2>
  <p>把你的场景说一句，我看能不能帮上。不合适我也会直说。</p>
  <p class="contact-line">
    <a class="btn" href="mailto:you@example.com?subject=咨询：产品参数问答助手">发邮件给我</a>
  </p>
  <p class="note">或者加微信：<strong>your_id</strong>（备注"问答助手"）</p>
</section>
```

## 6.2 为什么第一版不做表单

| 表单 | 问题 |
|---|---|
| 需要后端接收 | 你没有后端，前端表单点了没反应 |
| 第三方表单服务 | 多一个依赖，还要注册 |
| **`mailto`** | **零成本，点开就是邮件客户端** |

**缺点：** 有人电脑没配邮件客户端，点了没反应。
**补救：** 页面上**同时写微信号**，用文字，不要只放二维码。

> **二维码在电脑上扫不了。** 这是最常见的错误。

## 6.3 加一句降低门槛的话

```text
"把你的场景说一句，我看能不能帮上。不合适我也会直说。"
```

**这句话的作用：** 他知道"问了不会被硬推销"，所以敢问。

---

# 第 7 步：写 CSS（25 分钟）

## 7.1 第一版只要 60 行

```css
/* styles.css */

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.7;
  color: #1a1a1a;
  background: #fff;
}

/* 内容居中，最宽 720px —— 一行字超过 40 个汉字就难读 */
main, .hero, footer {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 20px;
}

.hero {
  padding-top: 80px;
  padding-bottom: 60px;
}

.hero h1 {
  font-size: 32px;
  line-height: 1.4;
  margin: 0 0 16px;
}

.hero p {
  font-size: 17px;
  color: #555;
  margin: 0 0 28px;
}

.btn {
  display: inline-block;
  padding: 12px 24px;
  background: #1a1a1a;
  color: #fff;
  text-decoration: none;
  border-radius: 6px;
  font-size: 16px;
}

section { padding: 40px 0; border-top: 1px solid #eee; }

h2 { font-size: 22px; margin: 0 0 20px; }

.pains { padding-left: 20px; }
.pains li { margin-bottom: 10px; }

.card {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.card img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  border: 1px solid #eee;
}

.oneliner { font-weight: 600; }
.limits { color: #888; font-size: 14px; }
.note { color: #666; font-size: 14px; }

.plans { width: 100%; border-collapse: collapse; font-size: 15px; }
.plans th, .plans td {
  border: 1px solid #e5e5e5;
  padding: 10px;
  text-align: left;
}
.plans .pick { background: #f7f7f5; font-weight: 600; }

footer { padding: 40px 0; color: #999; font-size: 13px; }
```

## 7.2 三条设计纪律

| 纪律 | 原因 |
|---|---|
| **一行字不超过 40 个汉字** | 超过就难读，`max-width: 720px` 就是这个作用 |
| **正文 16-17px** | 小于 15px 手机上要放大 |
| **全页只用黑/白/一个灰** | 花哨的颜色会让它像广告 |

> **不要引入 Bootstrap/Tailwind。** 第一版手写 60 行，你才知道每一行在干什么。
>
> **样式库会让你做出"看起来像模板"的页面**，而模板页面最不被信任。

## 7.3 手机上看一眼

**按 F12 → 点左上角的手机图标 → 选 iPhone SE（375px）。**

**检查三件事：**

| 检查 | 不合格的样子 |
|---|---|
| 有没有横向滚动条 | 页面左右能拖动 |
| 标题会不会太大挤出屏幕 | 字被切掉 |
| 表格能不能滚 | 表格撑破页面 |

---

# 第 8 步：加 `main.js`（可选，但建议做）（15 分钟）

```javascript
// main.js
// 第一版只做一件事：平滑滚动 + 记录来源
document.querySelectorAll('a[href^="#"]').forEach(function (a) {
  a.addEventListener('click', function (e) {
    var target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// 如果地址栏带 ?from=xxx，把它塞进邮件标题，你就知道客户从哪来的
(function () {
  var from = new URLSearchParams(location.search).get('from');
  if (!from) return;
  var mail = document.querySelector('a[href^="mailto:"]');
  if (!mail) return;
  mail.href = mail.href + encodeURIComponent('（来源：' + from + '）');
})();
```

**为什么要 `?from=`：**

**你把链接发到 5 个群，不知道哪个群有用。加上 `?from=群名`，客户发邮件时你就知道来源。**

> **这是最小的增长分析，一行代码就够。**

---

# 第 9 步：自检（15 分钟）

## 9.1 八项检查

| # | 检查 | 怎么做 |
|---|---|---|
| 1 | 双击能打开，没有报错 | F12 → Console，看有没有红字 |
| 2 | 手机上不横向滚动 | F12 手机模式，375px |
| 3 | 所有链接点得开 | 一个个点 |
| 4 | 图片都显示 | 看图有没有裂 |
| 5 | 标题页（`title`）写对了 | 看浏览器标签 |
| 6 | `mailto` 点了有反应 | 点一下，看邮件客户端有没有弹 |
| 7 | 首屏 3 秒内能看完 | 自己掐表 |
| 8 | 全文没有"赋能""一站式""数字化转型" | Ctrl+F 搜这三个词 |

## 9.2 让一个不懂技术的人看

**找一个非技术的人（家人、朋友），给他看 30 秒，然后问三个问题：**

```text
1. 这个人是干什么的？
2. 他是给谁做的？
3. 你会想联系他吗？为什么？
```

**三个问题答不全 → 首屏要重写。**

> **这是最有效的一次测试，比你自己看十遍都管用。**

## 9.3 用 AI 再挑一遍

```text
下面是我个人服务页面的文案（贴首屏 + 三个小标题）。

请扮演一位 48 岁的工厂老板，只有 30 秒时间：
1. 我能不能在三秒内知道你是干什么的、给谁干的？
2. 哪句话让我觉得"这人在推销"？
3. 我会不会往下滚？如果不会，卡在哪一句？

只回答这三个问题，不要给建议。
```

---

# 第 10 步：发布（可选，但强烈建议）（20 分钟）

**放在你电脑上，客户看不到。发布出去，它才是"资产"。**

| 方式 | 成本 | 适合 |
|---|---|---|
| GitHub Pages | 免费 | **首选，第 30 节课学过** |
| 自己的域名 + 服务器 | 已有服务器就用 | 显得正式 |
| 内网穿透 | 临时 | 只适合演示 |

**GitHub Pages 步骤：**

1. 在仓库里建分支 `gh-pages`（或者用 `main` 的 `/docs` 目录）；
2. 把 `landing/` 里的文件推到那个分支的根目录；
3. 仓库 Settings → Pages → Source 选分支 → Save；
4. 等 1 分钟，得到 `https://用户名.github.io/仓库名/`；
5. **手机上打开测一遍。**

> **注意：** 发布出去的东西是公开的。**先把脱敏做干净。**

---

# 第 11 步：提交（5 分钟）

```bash
git add -A
git commit -m "第245节课：获客页面（landing）"
git push
```

---

# 本节课验收

- [ ] `landing/index.html` 双击能打开，Console 无红字
- [ ] 五段齐全，顺序是：首屏 → 问题 → 案例 → 价格 → 联系
- [ ] 首屏 `h1` 写的是"他的痛被解决后的样子"，不是"专业 XX 服务"
- [ ] 问题段用的是**客户原话**，并且标注了来源
- [ ] 三个案例卡都有：一句话、图、之前/之后、"还做不到"
- [ ] 三档表中间列有底色 + "多数人选的"
- [ ] 价格下面写了模型费另计 + "不包含"清单
- [ ] 联系方式是**文字微信号 + mailto**，不是只有二维码
- [ ] 375px 宽度下**没有横向滚动条**
- [ ] 全文搜不到"赋能/一站式/数字化转型"
- [ ] 找了一个非技术的人看 30 秒，三个问题他答得上
- [ ] （可选）已发布，手机能打开
- [ ] `NOTES.md` 写完了

---

# 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 打开是白屏 | HTML 标签没闭合 | F12 → Console 看报错 |
| 中文乱码 | 缺 `charset` | head 里加 `meta charset="UTF-8"` |
| 样式完全没生效 | CSS 路径错，或文件名是 `style.css` | 检查 `href` 和实际文件名 |
| 手机上字特别小 | 缺 `viewport` | 加上那行 meta |
| 手机上出现横向滚动 | 某个元素超宽（常见是表格、图片） | 给表格包 `overflow-x:auto`，图片加 `max-width:100%` |
| 图片显示不出来 | 路径大小写不对 / 空格 | 用 `screenshots/case1.png`，不要有中文和空格 |
| 看起来像模板 | 用了框架或花哨配色 | 换成纯手写 60 行 CSS |
| 客户看了不说话 | 首屏是"我做什么"，不是"你的问题" | 重写 `h1` |

---

# 本节课笔记模板

在 `02-笔记/NOTES.md` 写：

```markdown
# 第 245 节课笔记

## 我的页面想解决的唯一一件事

## 我的首屏三件套

| 元素 | 文字 |
|---|---|
| h1 | |
| p | |
| 按钮 | |

## 我写废的 h1（至少两个）

## 问题段用的三句原话

## 三个案例卡的一句话版

## 三档里我标"多数人选的"是哪档，为什么

## 我写的"不包含"清单

## 手机上遇到的问题和怎么解决的

## 非技术朋友看 30 秒后的三个回答

## 我卡在哪

## 我怎么解决的

## 页面链接（如果发布了）
```

---

## 本节课要能说出口的一句话

> **这一页不是作品集，是你的销售员。它会 24 小时替你说话。**
>
> **判断它成不成，只有一个标准：有没有一个陌生人，因为看了它，给你发了一条消息。**
