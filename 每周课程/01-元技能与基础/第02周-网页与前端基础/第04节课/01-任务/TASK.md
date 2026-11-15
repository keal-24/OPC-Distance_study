# 第 11 节课：让人能操作——按钮和表单

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你让页面好看了。但页面还是"只能看不能动"。
> 这节课做**能让人输入、能点的地方**：表单和按钮。这是所有网站的基础——注册、登录、搜索、下单，全靠它。

**建议用时**：110 分钟
**你需要先完成**：第 10 节课（会写 CSS 基础）

---

# 第 0 步：表单是什么（5 分钟）

## 0.1 你每天都在用表单

- 登录页输入手机号和密码 → 表单
- 搜索框输入关键词 → 表单
- 下单填收货地址 → 表单
- 反馈页写字 → 表单

**表单 = 一组让用户输入内容、然后提交的控件。**

## 0.2 一个完整的表单有四个部分

```text
① 输入控件（input / textarea / select）
② 说明文字（label）
③ 提交按钮（button）
④ 包裹它们的 form 容器
```

**少任何一个都会出问题：**

- 少 `label`：用户不知道这格填什么，读屏软件也读不出来；
- 少 `button`：用户没法提交；
- 少 `form`：按回车不会提交，也没法统一处理。

## 0.3 今天不做"真的能提交"

**为什么：**
因为提交需要后端服务器接收数据。现在还没有后端。

**今天做的是：**

- 表单长什么样；
- 怎么让输入框和标签正确关联；
- 怎么让浏览器帮你做基础校验（比如"必填""必须是邮箱"）；
- 怎么让表单看起来专业。

**真正提交数据要等到第 3 周（后端）**。今天把前端这半边做对。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `form.html` | `03-练习代码` | 注册表单 |
| `style.css` | `03-练习代码` | 表单样式 |

---

# 第 1 步：先做一个最丑的表单（10 分钟）

## 1.1 新建文件

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第02周-网页与前端基础\第04节课\03-练习代码
   ```

2. 新建 `form.html` 和 `style.css`。
3. **自己敲**下面代码。

## 1.2 最原始的表单

**`form.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>注册 - 最原始版</title>
</head>
<body>

  <h1>注册账号</h1>

  <form>
    <p>用户名：<input type="text"></p>
    <p>密码：<input type="password"></p>
    <p>邮箱：<input type="email"></p>
    <p><button type="submit">注册</button></p>
  </form>

</body>
</html>
```

**保存，双击打开。**

## 1.3 屏幕上会看到什么

三行输入框，一个按钮。**看起来极其简陋：**

- 输入框很小；
- 没有间距；
- 按钮是系统默认样式（灰色小方块）；
- 用户名、密码、邮箱是普通文字，不是可点击的标签。

**但现在它能用。** 你可以在输入框里打字，可以点按钮。

## 1.4 试三件事

**操作：**

**第一件：** 在"密码"框里打字。

**你会看到：** 显示成圆点 `••••`。这是 `type="password"` 的作用。

**第二件：** 在"邮箱"框里输入 `abc`（不是邮箱格式），然后点"注册"。

**你会看到：** 浏览器弹出提示，大概类似"请在电子邮件地址中包括 @ 符号"。

**这就是浏览器自带的校验。** 你一行 JS 都没写，它就会检查。

**第三件：** 输入一个合法邮箱，点"注册"，看地址栏。

**你会看到：** 页面刷新了，地址栏后面多了个 `?`。

**为什么：**
因为 `form` 默认用 GET 方式把数据拼在地址栏里。**今天不处理这个，第 3 周会讲。**

## 1.5 认识 `type` 属性

```html
<input type="text">
```

**`type` 决定这个输入框长什么样、怎么工作。**

| `type` 值 | 长什么样 | 用途 |
|---|---|---|
| `text` | 普通文本框 | 用户名、标题 |
| `password` | 圆点隐藏字符 | 密码 |
| `email` | 文本框 | 邮箱，会自动校验格式 |
| `tel` | 文本框，手机上调数字键盘 | 电话 |
| `number` | 带上下箭头的数字框 | 数量、年龄 |
| `date` | 带日期选择器 | 生日、预约日期 |
| `checkbox` | 复选框 | 多选、同意条款 |
| `radio` | 单选按钮 | 性别、套餐 |
| `file` | 文件选择 | 上传头像 |
| `hidden` | 看不见 | 隐藏数据 |
| `search` | 搜索框 | 搜索 |
| `color` | 颜色选择器 | 选颜色 |
| `range` | 滑块 | 音量、评分 |

**这张表不用背。** 知道有哪些，用的时候查。

---

# 第 2 步：`label`——必须学会的一件事（15 分钟）

## 2.1 现在的表单有个大问题

```html
<p>用户名：<input type="text"></p>
```

**"用户名："是普通文字。** 它不是标签。

**后果一：** 点击"用户名："这几个字，输入框不会获得焦点。

**后果二：** 读屏软件读到这行，只会念"用户名，编辑框"，不会说这是一个整体。

**后果三：** 在手机上，点文字不会唤起键盘。

## 2.2 正确写法

```html
<p>
  <label for="username">用户名：</label>
  <input type="text" id="username">
</p>
```

**两个关键：**

1. `<label>` 上加 `for="username"`；
2. `<input>` 上加 `id="username"`。

**这两个值必须**完全一样**。**

## 2.3 `for` 和 `id` 的关系

```html
<label for="username">  ← 我要关联的是 id 为 username 的那个控件
<input id="username">   ← 我的 id 是 username
```

**这两个值完全一样，就等于"用一根线连起来"。**

**为什么用 `for` 和 `id` 配对，而不是把 input 包在里面：**

**其实也可以包在里面：**

```html
<label>
  用户名：
  <input type="text">
</label>
```

**这样不用写 `for` 和 `id`，也能关联。**

**那为什么要写 `for`/`id`？**

- 包裹式布局受限制（`label` 里面不能随便放别的元素）；
- `for`/`id` 更清晰，样式也好控制。

**本课程统一用 `for`/`id` 配对。**

**注意：`for` 不是 `htmlFor`。** 那是 React 的写法，纯 HTML 就是 `for`。

## 2.4 验证一下

**改造你的表单：**

```html
<form>
  <p>
    <label for="username">用户名：</label>
    <input type="text" id="username" name="username">
  </p>
  <p>
    <label for="password">密码：</label>
    <input type="password" id="password" name="password">
  </p>
  <p>
    <label for="email">邮箱：</label>
    <input type="email" id="email" name="email">
  </p>
  <p>
    <button type="submit">注册</button>
  </p>
</form>
```

**保存，刷新，试这个动作：**

**用鼠标点"用户名："这几个字。**

**你会看到：** 光标跳进用户名输入框。

**这就是 `label` 生效了。**

**再试：点"密码："三个字，光标应该跳进密码框。**

## 2.5 `name` 属性是什么

**你可能注意到我加了 `name="username"`。**

```html
<input type="text" id="username" name="username">
```

**`id` 和 `name` 完全不同：**

| 属性 | 给谁看的 | 用途 |
|---|---|---|
| `id` | 浏览器、CSS、JS | 唯一标识，给 `label` 关联、给 JS 找元素 |
| `name` | **提交到服务器时用的字段名** | 后端收到的数据里，这个值叫什么 |

**举个具体例子：**

用户输入了用户名 `小明`，点提交后，浏览器发给服务器的数据长这样：

```text
username=小明&password=123456&email=a@b.com
```

**这里的 `username` 就是 `name` 属性的值。**

**重要规则：**

```text
id     要唯一，给人读的
name   是给服务器的字段名，可以有多个元素同名（比如一组单选按钮）
两者可以相同，也可以不同，但建议写成一样，好维护
```

**最容易犯的错：只写 `id` 不写 `name`。**

**后果：** 前端看着正常，但提交时这个字段根本没数据。

## 2.6 自我检查

不看上面回答：

1. `label` 的 `for` 要和 `input` 的什么属性对上？
2. `id` 和 `name` 有什么区别？
3. 如果只写 `id` 不写 `name`，会发生什么？

---

# 第 3 步：`placeholder` 和 `required`（10 分钟）

## 3.1 `placeholder`：框里的提示文字

```html
<input type="text" id="username" name="username" placeholder="请输入 3-20 个字符">
```

**效果：** 输入框里显示灰色的提示字，一旦开始输入就消失。

**什么时候用：**

- 告诉用户格式要求；
- 给一个例子。

**什么时候不该用：**

**不要把 `label` 换成 `placeholder`。** 这是很常见的错误做法。

**为什么不对：**

- 一开始输入，提示就消失了，用户忘了这格填什么；
- 对比度太低，视力不好的人看不清；
- 读屏软件读取不稳定。

**正确做法：** `label` 一定保留，`placeholder` 只用来补充格式说明。

## 3.2 `required`：必填

```html
<input type="email" id="email" name="email" required>
```

**效果：** 不填就点提交，浏览器会拦下来，提示"请填写此字段"。

**注意：** `required` 是**布尔属性**，只写名字，不写值。

```html
<input required>          <!-- 对 -->
<input required="true">   <!-- 也可以，但没必要 -->
<input required="false">  <!-- 错！写了这个它仍然是必填！ -->
```

**这是个非常容易踩的坑：** 布尔属性只要出现，就代表 true。**想取消，就整个删掉，不能写 false。**

## 3.3 其它常用的校验属性

```html
<input type="text" minlength="3" maxlength="20">
<input type="number" min="1" max="100">
<input type="text" pattern="[0-9]{11}">
```

| 属性 | 作用 |
|---|---|
| `minlength` | 最少几个字符 |
| `maxlength` | 最多几个字符 |
| `min` | 数值最小值 |
| `max` | 数值最大值 |
| `pattern` | 正则表达式规则 |

**`maxlength` 和 `minlength` 的区别要注意：**

- `maxlength` 会**阻止**继续输入（敲不进去了）；
- `minlength` 只在提交时检查（可以敲少，但提交会报错）。

## 3.4 `pattern` 的用法

```html
<input type="text" id="phone" name="phone" pattern="[0-9]{11}" placeholder="11 位手机号">
```

**`[0-9]{11}` 是什么意思：**

- `[0-9]` = 任意一个数字；
- `{11}` = 重复 11 次。

**合起来：必须是 11 个数字。**

**正则表达式（regular expression）** 现在只要知道：它是一串规则，用来描述"什么格式算合法"。**后面第 12 周会专门学。**

**`pattern` 的两个坑：**

1. 它**默认要求整串完全匹配**，不用写 `^` 和 `$`；
2. 它**只在提交时校验**，输入时不拦。

## 3.5 加上这些属性

**改造表单：**

```html
<form>
  <p>
    <label for="username">用户名：</label>
    <input
      type="text"
      id="username"
      name="username"
      placeholder="3-20 个字符"
      minlength="3"
      maxlength="20"
      required
    >
  </p>
  <p>
    <label for="password">密码：</label>
    <input
      type="password"
      id="password"
      name="password"
      placeholder="至少 8 位"
      minlength="8"
      required
    >
  </p>
  <p>
    <label for="email">邮箱：</label>
    <input
      type="email"
      id="email"
      name="email"
      placeholder="you@example.com"
      required
    >
  </p>
  <p>
    <label for="phone">手机号：</label>
    <input
      type="text"
      id="phone"
      name="phone"
      placeholder="11 位手机号"
      pattern="[0-9]{11}"
    >
  </p>
  <p>
    <button type="submit">注册</button>
  </p>
</form>
```

**注意多行属性的写法：**
一个 `<input>` 有很多属性时，可以每个属性占一行，方便看。**这是排版习惯，不是语法要求。**

## 3.6 自己试五次提交

**按顺序试，每次看浏览器提示什么：**

1. 全部空着点"注册" → 应该提示用户名必填；
2. 用户名填 `ab`（2 个字符）点提交 → 应该提示太短；
3. 用户名填 `abc`，密码空着 → 应该提示密码必填；
4. 密码填 `1234567`（7 位）→ 应该提示太短；
5. 手机号填 `abc` → 应该提示格式不符。

**把这些提示语记在笔记里。** 它们的措辞取决于浏览器，Chrome / Edge / Firefox 不完全一样。

**重要认识：**

> **这些校验只是"帮用户少犯错"，不是"安全防护"。**
>
> 用户可以改 HTML、可以关掉 JS、可以直接发请求绕过。**真正的校验必须在服务器做。** 这个坑每年都有大量事故，第 3 周会讲。

---

# 第 4 步：`textarea`、`select`、`checkbox`、`radio`（20 分钟）

## 4.1 `textarea`：多行文本

```html
<p>
  <label for="bio">个人简介：</label>
  <textarea id="bio" name="bio" rows="4" cols="40" placeholder="简单介绍一下自己"></textarea>
</p>
```

**和 `<input>` 的区别：**

| `<input type="text">` | `<textarea>` |
|---|---|
| 只能一行 | 可以多行 |
| 空元素，无闭合标签 | **需要闭合标签** |
| 用 `value` 属性设初值 | 内容写在标签中间 |

**`<textarea>` 有闭合标签，这点和 `<input>` 不一样：**

```html
<textarea></textarea>          <!-- 对 -->
<input></input>                <!-- 错，input 自闭合 -->
```

**`rows` 和 `cols`：** 初始的行数和列数（字符数）。**但实际大小一般用 CSS 控制。**

**一个坑：`<textarea>` 里的内容不转义会出问题。**

```html
<textarea>这里写 <b>粗体</b> 会怎样？</textarea>
```

**浏览器会把它当成真的 HTML 标签。** 如果你要让用户输入 `<` 这种字符，得用 HTML 实体。

## 4.2 `select` 和 `option`：下拉菜单

```html
<p>
  <label for="city">城市：</label>
  <select id="city" name="city">
    <option value="">请选择</option>
    <option value="bj">北京</option>
    <option value="sh">上海</option>
    <option value="gz">广州</option>
  </select>
</p>
```

**三层结构：**

```text
<select>     整个下拉框
  <option>   每个选项
```

**`value` 是关键：**

```html
<option value="bj">北京</option>
```

- 用户看到"北京"；
- 提交给服务器的是 `bj`。

**为什么要分开：**
因为显示给用户看的文字可能会改（比如"北京"改成"北京市"），但提交的代码值不能随便改，否则后端认不出来。

**`value=""` 的空选项为什么要有：**

```html
<option value="">请选择</option>
```

**用途：** 当默认占位提示。配合 `required` 使用，用户如果没选真正的项，提交会失败。

**但注意：** 空的 `value=""` 会被当成"有值"。**要让它真的无效，需要加 `disabled` 或 `selected`。**

```html
<option value="" selected disabled>请选择</option>
```

- `selected`：默认选中这一项；
- `disabled`：这一项不能被选中。

**这样用户必须手动选一个真的选项。**

## 4.3 `checkbox`：复选框（可多选）

```html
<p>
  <label>
    <input type="checkbox" name="hobby" value="reading">
    阅读
  </label>
</p>
<p>
  <label>
    <input type="checkbox" name="hobby" value="coding">
    编程
  </label>
</p>
```

**和前面不一样的地方：这里用"包裹式 label"。**

**为什么：**
复选框本身很小，不容易点中。**包在 `<label>` 里，点文字也能选中。**

**`name` 相同，`value` 不同：**

```html
<input type="checkbox" name="hobby" value="reading">
<input type="checkbox" name="hobby" value="coding">
```

**这样提交时，服务器收到的是一组值：**

```text
hobby=reading&hobby=coding
```

**如果用户只选了一个，就只有那一个。**

**如果 `name` 不同：**

```html
<input type="checkbox" name="hobby1" value="reading">
<input type="checkbox" name="hobby2" value="coding">
```

**服务器收到：** `hobby1=reading&hobby2=coding`（没选的那个不发）。

**两种都合法，但含义不同。** 一组多选要同名，独立开关要不同名。

## 4.4 `radio`：单选按钮（只能选一个）

```html
<p>
  <label>
    <input type="radio" name="gender" value="male">
    男
  </label>
  <label>
    <input type="radio" name="gender" value="female">
    女
  </label>
</p>
```

**`radio` 的核心规则：**

```text
同一组的 radio，name 必须完全相同。
```

**为什么：**
浏览器靠 `name` 判断"这几个是一组的"。同名才会互斥。

**验证一下：**

1. 给两个 radio 都写 `name="gender"`，点一个，另一个会自动取消；
2. 改成 `name="g1"` 和 `name="g2"`，你会发现两个都能选中。

**第二个是最常见的错误。** 很多新手写完发现"单选能多选"，就是 `name` 不一样。

**`radio` 也要用包裹式 label。** 因为圆点太小了。

## 4.5 `radio` 和 `checkbox` 的区别

| | `radio` | `checkbox` |
|---|---|---|
| 形状 | 圆点 | 方框 |
| 能选几个 | 一组只能一个 | 可以选多个 |
| `name` | **必须相同** | 可以相同（一组）或不同（独立） |
| 什么场景 | 性别、套餐、支付方式 | 兴趣爱好、同意条款 |

## 4.6 加进你的表单

**完整表单（自己敲）：**

```html
<form>
  <p>
    <label for="username">用户名：</label>
    <input type="text" id="username" name="username" placeholder="3-20 个字符" minlength="3" maxlength="20" required>
  </p>

  <p>
    <label for="password">密码：</label>
    <input type="password" id="password" name="password" placeholder="至少 8 位" minlength="8" required>
  </p>

  <p>
    <label for="email">邮箱：</label>
    <input type="email" id="email" name="email" placeholder="you@example.com" required>
  </p>

  <p>
    <label for="phone">手机号：</label>
    <input type="text" id="phone" name="phone" placeholder="11 位手机号" pattern="[0-9]{11}">
  </p>

  <p>
    <label for="birthday">生日：</label>
    <input type="date" id="birthday" name="birthday">
  </p>

  <p>
    <label for="city">城市：</label>
    <select id="city" name="city">
      <option value="" selected disabled>请选择</option>
      <option value="bj">北京</option>
      <option value="sh">上海</option>
      <option value="gz">广州</option>
    </select>
  </p>

  <p>
    <label for="bio">个人简介：</label>
    <textarea id="bio" name="bio" rows="4" placeholder="简单介绍一下自己"></textarea>
  </p>

  <fieldset>
    <legend>性别</legend>
    <label><input type="radio" name="gender" value="male"> 男</label>
    <label><input type="radio" name="gender" value="female"> 女</label>
  </fieldset>

  <fieldset>
    <legend>兴趣爱好</legend>
    <label><input type="checkbox" name="hobby" value="reading"> 阅读</label>
    <label><input type="checkbox" name="hobby" value="coding"> 编程</label>
    <label><input type="checkbox" name="hobby" value="sports"> 运动</label>
  </fieldset>

  <p>
    <label>
      <input type="checkbox" name="agree" value="yes" required>
      我已阅读并同意用户协议
    </label>
  </p>

  <p>
    <button type="submit">注册</button>
  </p>
</form>
```

## 4.7 新出现的两个标签：`<fieldset>` 和 `<legend>`

```html
<fieldset>
  <legend>性别</legend>
  ...单选按钮...
</fieldset>
```

- `fieldset` = 字段组，把相关的控件框在一起；
- `legend` = 图例，给这个组一个标题。

**视觉效果：** 浏览器会画一个边框，标题嵌在边框上。

**为什么需要：**

- 读屏软件会读"性别 分组"，用户知道这一组是干什么的；
- 一组单选按钮必须有组名，否则用户不知道选什么。

**`<legend>` 必须是 `<fieldset>` 的第一个子元素。**

---

# 第 5 步：按钮的三种类型（10 分钟）

## 5.1 `type` 必须写

```html
<button type="submit">提交</button>
<button type="button">普通按钮</button>
<button type="reset">重置</button>
```

| `type` | 行为 |
|---|---|
| `submit` | 提交表单（默认值） |
| `button` | 什么也不做（等 JS 绑定） |
| `reset` | 清空表单 |

## 5.2 最危险的一个坑

**如果你在 `<form>` 里写：**

```html
<form>
  <input type="text" name="a">
  <button>点我</button>
</form>
```

**这个按钮不写 `type`，它就是 `submit`。**

**后果：用户点它，整个表单就提交了。**

**这个坑在实际项目里叫什么：** "按钮意外提交表单"。

**最典型的场景：**

```html
<form>
  <input type="text" name="keyword">
  <button onclick="doSomething()">添加标签</button>
  <button type="submit">搜索</button>
</form>
```

**用户点"添加标签"，结果搜索表单被提交了，页面刷新，刚输入的东西全没了。**

**正确做法：**

```html
<button type="button" onclick="doSomething()">添加标签</button>
```

**规则（背下来）：**

```text
只要按钮不在"提交表单"的意图下，一定写 type="button"。
```

## 5.3 `submit` 和 `button` 的区别验证

**做这个实验：**

```html
<form>
  <p>
    <label for="t1">测试输入：</label>
    <input type="text" id="t1" name="t1">
  </p>
  <p>
    <button>没写 type 的按钮</button>
  </p>
</form>
```

**操作：**

1. 在输入框里打几个字；
2. 点"没写 type 的按钮"。

**你会看到：** 页面刷新了，输入的内容消失，地址栏多了 `?t1=xxx`。

**改成：**

```html
<button type="button">没写 type 的按钮</button>
```

**再试一次：** 页面不刷新了。

**这个实验一定要自己做。** 因为以后你会无数次遇到"点了个按钮页面就刷新"，原因就是这个。

---

# 第 6 步：给表单加样式（25 分钟）

## 6.1 现在的问题

功能全了，但看起来像 1998 年的网站：输入框很小、按钮是灰色方块、所有东西挤在一起。

## 6.2 表单样式的四个要点

```text
① 输入框要够大（高度、内边距）
② 标签和输入框要有清晰的对齐关系
③ 焦点状态要明显（点进去能看出来）
④ 错误状态要能区分（这个今天先不做）
```

## 6.3 完整 style.css

**在 `style.css` 里自己敲：**

```css
/* ========== 基础 ========== */

body {
  background-color: #f5f5f5;
  color: #333333;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
  padding: 32px 16px;
}

/* ========== 表单容器 ========== */

form {
  max-width: 520px;
  margin: 0 auto;
  background-color: #ffffff;
  padding: 32px;
  border-radius: 12px;
}

h1 {
  max-width: 520px;
  margin: 0 auto 24px;
  font-size: 28px;
  text-align: center;
}

/* ========== 每一行 ========== */

form p {
  margin: 0 0 20px 0;
}

/* ========== 标签 ========== */

label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #555555;
  margin-bottom: 6px;
}

/* ========== 输入框（三种一起写） ========== */

input[type="text"],
input[type="password"],
input[type="email"],
input[type="date"],
select,
textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font-size: 15px;
  font-family: inherit;
  color: #333333;
  background-color: #ffffff;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  outline: none;
}

/* ========== 焦点状态 ========== */

input:focus,
select:focus,
textarea:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

/* ========== 按钮 ========== */

button {
  width: 100%;
  padding: 12px;
  font-size: 16px;
  font-family: inherit;
  font-weight: 500;
  color: #ffffff;
  background-color: #1a73e8;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

button:hover {
  background-color: #1765cc;
}

/* ========== 分组 ========== */

fieldset {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px 16px;
  margin: 0 0 20px 0;
}

legend {
  font-size: 14px;
  font-weight: 500;
  color: #555555;
  padding: 0 6px;
}

/* ========== 单选复选框的标签不要块级 ========== */

fieldset label {
  display: inline-block;
  margin-right: 16px;
  margin-bottom: 0;
  font-weight: 400;
  color: #333333;
  cursor: pointer;
}

/* ========== 同意条款那一行 ========== */

form > p:last-of-type label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-weight: 400;
  color: #333333;
  cursor: pointer;
}
```

**保存，刷新。**

## 6.4 现在应该看到什么

- 页面背景浅灰；
- 白色圆角卡片，最大宽 520px，居中；
- 每个输入框占满宽度，有内边距，圆角，浅灰边框；
- 标签在输入框上方，灰色小字；
- 点进输入框，边框变蓝，外面有一圈淡蓝光晕；
- 按钮是蓝色通栏，悬停变深蓝；
- 单选和复选横排，可点文字；
- 分组有边框和标题。

**对比第 1 步那个原始版，差别是巨大的。**

## 6.5 新出现的六个知识点

### `input[type="text"]` —— 属性选择器

```css
input[type="text"] {
  ...
}
```

**这是"属性选择器"：选中所有 `type="text"` 的 `input`。**

**为什么不能直接写 `input`：**
因为 `input` 包括文本框、按钮、复选框、单选框、文件选择……**直接写 `input` 会把复选框也变成全宽输入框，那就毁了。**

**属性选择器的三种写法：**

```css
input[type="text"]     /* 完全等于 */
input[type^="text"]    /* 以...开头 */
input[type$="text"]    /* 以...结尾 */
input[type*="text"]    /* 包含 */
```

### `box-sizing: border-box` —— 必须写的一行

```css
box-sizing: border-box;
```

**不写会出什么问题？**

**默认行为（`content-box`）：**

```css
input {
  width: 100%;
  padding: 10px;
  border: 1px solid;
}
```

**实际宽度 = 100% + 20px（左右 padding）+ 2px（左右边框）**

**结果：输入框会超出容器，出现横向滚动条。**

**写了 `border-box` 之后：**

```text
实际宽度 = 100%（padding 和 border 算在里面）
```

**所以：`width: 100%` 一定要配 `box-sizing: border-box`。**

**这是 CSS 里最容易踩的坑之一。** 现在大多项目会在全局写：

```css
* {
  box-sizing: border-box;
}
```

**`*` 是"所有元素"的意思。** 这样写一次，全项目都安全。

### `:focus` —— 焦点状态

```css
input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}
```

**什么触发的：** 用户点击输入框，或用 Tab 键跳到它，它就"获得焦点"。

**为什么必须做焦点样式：**
因为用键盘操作的用户（比如不方便用鼠标的人）必须能看出"我现在在哪个框里"。**这是无障碍的基本要求。**

**`outline: none` 的危险：**

```css
outline: none;   /* 去掉默认的焦点框 */
```

**很多人加这句是为了"好看"。**

**但如果你加了 `outline: none` 又没自己写 `:focus` 样式，键盘用户就完全看不出焦点了。** 这是很严重的可用性问题。

**正确做法：**

```css
input:focus {
  outline: none;              /* 去掉默认 */
  border-color: #1a73e8;      /* 自己写一个更明显的 */
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}
```

### `box-shadow` —— 阴影

```css
box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
```

**五个值依次是：**

```text
0                     水平偏移
0                     垂直偏移
0                     模糊半径
3px                   扩散半径
rgba(26,115,232,0.15) 颜色和透明度
```

**这里 `0 0 0 3px` 的意思是：** 不偏移、不模糊、向外扩 3px。**结果是一圈均匀的边框光晕。**

**这个技巧很常用：** 焦点框、卡片悬停效果都用它。

### `font-family: inherit`

```css
font-family: inherit;
```

**为什么输入框要单独写这句：**

**因为表单控件不继承字体！** 这是浏览器的历史遗留行为。

**不写的后果：** 输入框里的字是系统默认的（Windows 上是宋体或微软雅黑），**和你页面其他地方的字体不一样**，看起来很不搭。

**`inherit` 是什么意思：** 继承父元素的样式。

**规则：给 `input`、`button`、`select`、`textarea` 都写 `font-family: inherit`。**

### `cursor: pointer`

```css
cursor: pointer;
```

**鼠标移上去变成小手。**

**为什么按钮要写：**
虽然 `button` 通常自动是小手，但如果你用 `<div>` 做按钮，就必须手动加。**用户看到小手才知道"这个能点"。**

---

# 第 7 步：故意犯四个错（10 分钟）

## 错误 1：`label` 的 `for` 和 `id` 不匹配

**操作：**

```html
<label for="user">用户名：</label>
<input type="text" id="username">
```

（`for="user"` 但 `id="username"`）

**会怎样：** 点"用户名"三个字，光标不会跳进输入框。

**怎么查：** 逐个字符对照 `for` 和 `id` 的值。

**这个错误极其常见。** 因为改了一边忘了改另一边。

## 错误 2：忘了 `name`

**操作：**

```html
<input type="text" id="username">
```

（没有 `name`）

**会怎样：** 输入框能打字，看起来正常。但提交时这个字段**完全没有数据**。

**怎么查：** 提交后看地址栏（GET 方式），或者打开 `F12` → 网络（Network）看请求。

**这个错最难发现**，因为前端看着一切正常。

## 错误 3：`radio` 的 `name` 不一样

**操作：**

```html
<label><input type="radio" name="g1" value="male"> 男</label>
<label><input type="radio" name="g2" value="female"> 女</label>
```

**会怎样：** 两个都能选中，单选变多选。

**怎么改：** 两个 `name` 都改成 `gender`。

## 错误 4：按钮没写 `type`

**操作：**

```html
<form>
  <input type="text" name="a">
  <button>点我</button>
</form>
```

**会怎样：** 点按钮页面就刷新了。

**怎么改：** 加 `type="button"`。

## 四个错误总结

```text
for 和 id 不匹配  → 点标签没反应（体验问题）
漏 name           → 数据发不出去（功能问题，最隐蔽）
radio name 不同   → 单选变多选（功能问题）
按钮漏 type       → 意外提交（功能问题，最烦人）
```

**排查顺序：**

```text
① 点标签，光标跳不跳？→ 查 for/id
② 提交后数据对不对？→ 查 name
③ 单选能不能多选？→ 查 name 是否相同
④ 点了按钮页面刷不刷新？→ 查 type
```

---

# 第 8 步：写学习笔记（10 分钟）

```markdown
# 第 11 节课学习笔记

## 一、表单的四个部分

1.
2.
3.
4.

## 二、`id` 和 `name` 的区别

| 属性 | 给谁看 | 用途 |
|---|---|---|
| id | | |
| name | | |

只写 id 不写 name 会怎样：

## 三、`label` 的两种写法

写法一（for/id）：

写法二（包裹）：

本课程用哪种，为什么：

## 四、`input` 的 type

| type | 长什么样 | 用途 |
|---|---|---|
| text | | |
| password | | |
| email | | |
| number | | |
| date | | |
| checkbox | | |
| radio | | |
| file | | |

## 五、`radio` 和 `checkbox` 的区别

| | radio | checkbox |
|---|---|---|
| 能选几个 | | |
| name 怎么写 | | |
| 什么场景 | | |

## 六、按钮的三种 type

| type | 行为 | 什么时候用 |
|---|---|---|
| submit | | |
| button | | |
| reset | | |

不写 type 会怎样：

## 七、我实际测试的校验提示

| 我做的操作 | 浏览器提示的原话 |
|---|---|
| 用户名空着提交 | |
| 用户名 2 个字符 | |
| 密码 7 位 | |
| 手机号填 abc | |
| 邮箱填 abc | |

## 八、`box-sizing: border-box` 解决什么问题

## 九、`font-family: inherit` 为什么必须给表单控件写

## 十、四个错误的后果

| 错误 | 后果 | 怎么查 |
|---|---|---|
| for 和 id 不匹配 | | |
| 漏 name | | |
| radio name 不同 | | |
| 按钮漏 type | | |

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 我的表单有用户名、密码、邮箱、手机号、生日、城市、简介
- [ ] 每个输入框都有 label，点标签能聚焦
- [ ] 每个输入框都有 id 和 name
- [ ] 用了 required、minlength、pattern
- [ ] 有 radio 和 checkbox，各自成组
- [ ] 有 fieldset 和 legend
- [ ] 有提交按钮
- [ ] 表单有完整样式，输入框有焦点效果
- [ ] 我做过四个错误的实验
- [ ] 我知道浏览器校验不等于安全防护
```

---

# 第 9 步：课后练习

## 练习一：做一个登录表单

只做最简的：

```text
标题：登录
邮箱（必填，type=email）
密码（必填，minlength=8）
"记住我" 复选框
登录按钮
"忘记密码？" 链接
"还没有账号？去注册" 链接
```

**要求：**

- 所有输入框都有 label；
- 所有输入框都有 id 和 name；
- 样式和注册表单一致（复用同一份 `style.css`）。

## 练习二：做一个搜索框

**要求：**

```text
一个输入框（placeholder："搜索文章"）
一个搜索按钮
两者在同一行（提示：用 display: flex）
```

**这一题会用到第 12 节课的内容，先试一下。** 试不出来也没关系，第 12 节课会讲。

## 练习三：找出这段表单的五个问题

```html
<form>
  <p>姓名：<input type="text"></p>
  <p><input type="text" placeholder="邮箱"></p>
  <p>
    <input type="radio" name="a" value="1"> 选项一
    <input type="radio" name="b" value="2"> 选项二
  </p>
  <p>
    <label for="agree">同意条款</label>
    <input type="checkbox" id="agree-yes">
  </p>
  <button>提交</button>
</form>
```

**提示方向：** label、name、radio 分组、for/id 匹配、按钮 type。

## 练习四：想清楚这个场景

**场景：** 你做了一个删除按钮，放在一个表单里。用户点它，页面刷新了，而且什么都没删掉。

**问：**

1. 最可能的原因是什么？
2. 怎么改？
3. 为什么"什么都没删掉"？如果真删掉了会怎样？

## 练习五：用自己的话讲

```text
为什么必然要有 label，不能只用 placeholder？
为什么 radio 的 name 必须相同？
为什么前端校验不等于安全？
为什么按钮必须写 type？
```

---

# 第 10 步：最终验收

## A. 结构

- [ ] 我知道表单的四个组成部分
- [ ] 我知道 `<form>` 的作用
- [ ] 我知道 `<fieldset>` 和 `<legend>` 怎么用

## B. label

- [ ] 我能写出 `for`/`id` 配对的 label
- [ ] 我知道包裹式 label 怎么写
- [ ] 我知道为什么不能用 placeholder 代替 label

## C. 属性

- [ ] 我能说出 `id` 和 `name` 的区别
- [ ] 我知道只写 id 不写 name 的后果
- [ ] 我知道 `required` 是布尔属性，写 `false` 无效
- [ ] 我知道 `maxlength` 和 `minlength` 的行为差异
- [ ] 我知道 `pattern` 是整串匹配

## D. 控件

- [ ] 我会写 `<textarea>`（有闭合标签）
- [ ] 我会写 `<select>` + `<option>`，知道 `value` 的作用
- [ ] 我会写一组 `radio`，知道 `name` 要相同
- [ ] 我会写一组 `checkbox`
- [ ] 我知道 radio 和 checkbox 的区别

## E. 按钮

- [ ] 我知道三种 `type` 的行为
- [ ] 我知道不写 `type` 默认是 `submit`
- [ ] 我做过"按钮意外提交"的实验

## F. 样式

- [ ] 我的输入框有 `padding`、`border`、`border-radius`
- [ ] 我写了 `box-sizing: border-box`
- [ ] 我写了 `:focus` 样式
- [ ] 我给表单控件写了 `font-family: inherit`
- [ ] 按钮有 hover 效果

## G. 排错

- [ ] 点标签没反应，我知道查 `for`/`id`
- [ ] 数据发不出去，我知道查 `name`
- [ ] 单选能多选，我知道查 `name` 是否相同
- [ ] 点按钮页面刷新，我知道查 `type`

## H. 安全

- [ ] 我知道浏览器校验可以被绕过
- [ ] 我知道真正的校验必须在服务器做

## I. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有浏览器校验提示的原话记录
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **表单的价值不在"好看"，在于用户填的东西能被正确识别、正确送到服务器。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 点标签光标不跳 | `for` 和 `id` 不一致 | 逐字符对照 |
| 输入框里字体和别处不同 | 表单控件不继承字体 | 加 `font-family: inherit` |
| 输入框超出容器 | `width: 100%` 加 padding 溢出 | 加 `box-sizing: border-box` |
| 单选按钮能多选 | `name` 不同 | 改成同一个 name |
| 复选框只能选一个 | 误用了 `type="radio"` | 改成 `checkbox` |
| 点按钮页面刷新 | 按钮默认 `type="submit"` | 写 `type="button"` |
| 提交后数据为空 | 输入框没写 `name` | 补上 `name` |
| 提交后被 `required` 拦住但看不出哪一项 | 缺焦点样式或提示不够 | 加 `:focus` 和错误提示 |
| 用键盘 Tab 看不出焦点 | 写了 `outline: none` 但没补样式 | 自己写 `:focus` |
| `textarea` 里输入 HTML 被解析 | 用户输入未转义 | 后端要转义输出 |
| 下拉框默认项能被选中 | 缺 `disabled` | `<option value="" selected disabled>` |
| 日期选择器不出现 | `type` 写错 | 必须是 `type="date"` |
| 手机输入邮箱没带 @ 键 | `type` 用了 `text` | 改成 `type="email"` |
