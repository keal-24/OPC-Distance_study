# 第 13 节课：让页面听得见——事件

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你的计算器要点一下按钮才更新。这节课让它**一输入就算**。
> 事件是"用户做了什么"和"页面怎么反应"之间的那根线。**没有事件，页面就是死的。**

**建议用时**：110 分钟
**你需要先完成**：第 12 节课（会写 JS 函数、会改页面内容）

---

# 第 0 步：什么是事件（5 分钟）

## 0.1 一句大白话

```text
事件 = 用户做了什么
监听 = 页面怎么知道他做了什么
处理函数 = 知道了以后要做什么
```

**举一个完整例子：**

```text
用户点了按钮           → 这是事件（click）
我们提前挂了监听器     → addEventListener
监听器调用一个函数     → 处理函数开始执行
函数里改了页面文字     → 用户看到结果
```

## 0.2 上节课用的那行代码

```javascript
document.querySelector("#calcBtn").addEventListener("click", update);
```

**拆开读：**

| 部分 | 意思 |
|---|---|
| `document.querySelector("#calcBtn")` | 找到那个按钮 |
| `.addEventListener("click", update)` | 给它加监听：当 click 发生时，执行 update |
| `"click"` | 事件类型 |
| `update` | 函数名，**不加括号** |

**为什么 `update` 不加括号：**

```javascript
addEventListener("click", update)      // ✅ 传"函数本身"
addEventListener("click", update())    // ❌ 传"函数执行后的返回值"
```

**第二种会在绑定时立刻执行一次，然后传一个 `undefined` 给监听器。** 这是新手最常见的事件错误。

## 0.3 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `event.html` | `03-练习代码` | 事件练习页 |
| `event.js` | `03-练习代码` | 事件代码 |

---

# 第 1 步：先做四种最基本的事件（20 分钟）

## 1.1 建文件

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第02周-网页与前端基础\第06节课\03-练习代码
   ```

2. 新建 `event.html` 和 `event.js`。
3. **自己敲。**

**`event.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>事件练习</title>
  <style>
    body {
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      max-width: 560px;
      margin: 40px auto;
      padding: 0 16px;
      color: #333;
      line-height: 1.7;
    }
    section {
      margin-bottom: 32px;
      padding: 20px;
      background: #f7f7f7;
      border-radius: 8px;
    }
    h2 {
      font-size: 18px;
      margin: 0 0 12px 0;
    }
    button {
      padding: 8px 16px;
      font-size: 15px;
      font-family: inherit;
      color: #fff;
      background: #1a73e8;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    input {
      padding: 8px 10px;
      font-size: 15px;
      font-family: inherit;
      border: 1px solid #d0d0d0;
      border-radius: 6px;
    }
    .out {
      margin-top: 12px;
      padding: 10px 12px;
      background: #fff;
      border-radius: 6px;
      font-size: 15px;
      color: #1a73e8;
      min-height: 24px;
    }
  </style>
</head>
<body>

  <h1>事件练习</h1>

  <section>
    <h2>1. 点击事件（click）</h2>
    <button type="button" id="btn1">点我</button>
    <div class="out" id="out1">还没点</div>
  </section>

  <section>
    <h2>2. 输入事件（input）</h2>
    <input type="text" id="input2" placeholder="在这里打字">
    <div class="out" id="out2">等你输入</div>
  </section>

  <section>
    <h2>3. 变化事件（change）</h2>
    <select id="select3">
      <option value="">请选择</option>
      <option value="a">选项 A</option>
      <option value="b">选项 B</option>
    </select>
    <div class="out" id="out3">还没选</div>
  </section>

  <section>
    <h2>4. 提交事件（submit）</h2>
    <form id="form4">
      <input type="text" id="input4" placeholder="输入点什么" required>
      <button type="submit">提交</button>
    </form>
    <div class="out" id="out4">还没提交</div>
  </section>

  <script src="event.js" defer></script>
</body>
</html>
```

**`event.js`：**

```javascript
// 1. click：点击
const btn1 = document.querySelector("#btn1");
const out1 = document.querySelector("#out1");

btn1.addEventListener("click", () => {
  out1.textContent = `你点了按钮，时间：${new Date().toLocaleTimeString()}`;
});

// 2. input：输入
const input2 = document.querySelector("#input2");
const out2 = document.querySelector("#out2");

input2.addEventListener("input", () => {
  out2.textContent = `你输入了 ${input2.value.length} 个字符：${input2.value}`;
});

// 3. change：选择变化
const select3 = document.querySelector("#select3");
const out3 = document.querySelector("#out3");

select3.addEventListener("change", () => {
  out3.textContent = `你选了：${select3.value || "（清空了）"}`;
});

// 4. submit：表单提交
const form4 = document.querySelector("#form4");
const input4 = document.querySelector("#input4");
const out4 = document.querySelector("#out4");

form4.addEventListener("submit", (event) => {
  event.preventDefault();     // 阻止页面刷新
  out4.textContent = `提交成功：${input4.value}`;
});
```

**保存，双击打开 `event.html`。**

## 1.2 逐个试

### 试第一个：点按钮

**点"点我"。**

**应该看到：** 下面文字变成"你点了按钮，时间：14:32:05"。

**再点几次：** 时间会更新。

### 试第二个：打字

**在输入框里打 `hello`。**

**应该看到：** 每打一个字，下面数字就变。

- 打 `h` → "你输入了 1 个字符：h"
- 打 `he` → "你输入了 2 个字符：he"

**这就是 `input` 事件：每输入一个字符都触发。**

### 试第三个：选下拉框

**选"选项 A"。**

**应该看到：** "你选了：a"。

**注意：显示的是 `a` 不是"选项 A"。** 因为 `select3.value` 拿的是 `value` 属性的值。

**想看显示文字：**

```javascript
select3.options[select3.selectedIndex].text
```

- `options`：所有选项的列表；
- `selectedIndex`：当前选中第几个；
- `.text`：那一个的文字。

### 试第四个：提交表单

**输入点什么，点"提交"。**

**应该看到：**

- 页面**没有刷新**；
- 下面显示"提交成功：你输入的内容"。

**为什么页面没刷新？**

```javascript
event.preventDefault();
```

**`preventDefault` 是什么：** 阻止元素的"默认行为"。

**`<form>` 的默认行为就是提交后刷新页面。** 我们用 JS 处理了，就不需要它刷新。

**如果不写这一行会怎样：**
页面刷新，`out4.textContent` 刚设置的内容立刻被冲掉，你什么都看不到。

**这是表单处理的必备一行。忘了它，99% 的人会以为"代码没生效"。**

## 1.3 四种事件的对比

| 事件 | 什么时候触发 | 典型用途 |
|---|---|---|
| `click` | 点击 | 按钮、链接、卡片 |
| `input` | 每输入一个字符 | 实时搜索、字数统计 |
| `change` | 值改变且失去焦点 | 下拉框、复选框 |
| `submit` | 表单提交 | 登录、注册、搜索 |

## 1.4 `input` 和 `change` 的关键区别

**这是最容易搞混的一对。**

**做这个实验：**

1. 在第二个输入框里打 `abc`；
2. 先不要做别的，看下面的文字。

**`input`：** 每打一个字就更新（3 次更新）。

**现在测 `change`：**

1. 在 `event.js` 里，把第二个输入框的 `input` 改成 `change`：

   ```javascript
   input2.addEventListener("change", () => {
   ```

2. 保存刷新；
3. 打 `abc`，看下面。

**`change`：** 打字时**完全不更新**。

4. 现在用鼠标点到页面空白处（让输入框失去焦点）。

**`change`：** 这时才更新，显示"你输入了 3 个字符：abc"。

**结论：**

```text
input  = 边打边触发（实时）
change = 打完、离开这个框才触发（最终值）
```

**什么时候用哪个：**

- 实时搜索、字数统计、即时校验 → `input`
- 下拉框选择、复选框、日期选择 → `change`
- 文本框只想在"确定后"处理 → `change`

**记得把 `change` 改回 `input`。**

---

# 第 2 步：`event` 参数里有什么（15 分钟）

## 2.1 处理函数能收到一个"事件对象"

```javascript
btn1.addEventListener("click", (event) => {
  console.log(event);
});
```

**`event` 是浏览器自动传进来的一个对象，里面装着这次事件的所有信息。**

**试一下：**

1. 把处理函数改成上面这样；
2. 保存刷新，点按钮；
3. 看控制台，展开那个对象。

**你会看到很多属性。** 常用的有这几个：

| 属性 | 意思 |
|---|---|
| `event.target` | 触发事件的那个元素 |
| `event.type` | 事件类型，如 `"click"` |
| `event.clientX` / `clientY` | 鼠标点击位置（相对窗口） |
| `event.key` | 键盘按了哪个键（键盘事件用） |
| `event.preventDefault()` | 阻止默认行为 |
| `event.stopPropagation()` | 阻止冒泡（后面讲） |

## 2.2 `event.target` 最有用

```javascript
document.querySelector("#out1").addEventListener("click", (event) => {
  console.log(event.target);
});
```

**`event.target` = "真正被点的那个元素"。**

**为什么重要：**
当一个容器里有很多子元素，你可以只给容器绑一个监听器，然后通过 `event.target` 知道用户点的是哪个。

**这就是"事件委托"，第 4 步会讲。**

## 2.3 键盘事件

```javascript
document.addEventListener("keydown", (event) => {
  console.log(`按了：${event.key}`);
});
```

**`keydown`：按下键时触发。**

**常用的键名：**

```text
"Enter"     回车
"Escape"    Esc
" "         空格
"ArrowUp"   上箭头
"a"         字母 a
```

**注意：** `event.key` 是"这个键代表什么字符"，受输入法和 Shift 影响。

- 按 `a` → `"a"`
- 按 `Shift + a` → `"A"`
- 按空格 → `" "`

**另一种：`event.code`** 是"物理按键位置"，不受输入法影响。

- 按 `a` → `"KeyA"`
- 按 `Shift + a` → `"KeyA"`（还是同一个键）

**做游戏（WASD 移动）要用 `code`，做文字输入要用 `key`。**

## 2.4 一个实用例子：按回车搜索

```javascript
const input5 = document.querySelector("#input2");

input5.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    console.log(`搜索：${input5.value}`);
  }
});
```

**加进 `event.js`，试一下：**

1. 在第二个输入框里打几个字；
2. 按回车。

**控制台会输出"搜索：xxx"。**

**为什么用 `keydown` 不用 `keypress`：**

`keypress` 已废弃，而且它拿不到方向键、功能键。**统一用 `keydown`。**

---

# 第 3 步：把这套用到上节课的计算器上（20 分钟）

## 3.1 现在的问题

上节课的计算器要点按钮才更新。**用户改一个数字，还得去点按钮，很别扭。**

## 3.2 改成"一输入就算"

**操作：**

1. 把上节课的 `calc.html` 和 `calc.js` **自己重新敲一份**到本节课的 `03-练习代码`（改成 `calc-live.html` 和 `calc-live.js`）。
2. 在 `calc-live.js` 里改绑定方式。

**关键改动：**

```javascript
// 原来（上节课）：只绑按钮
document.querySelector("#calcBtn").addEventListener("click", update);
update();

// 现在：绑到所有输入框的 input 事件
priceInput.addEventListener("input", update);
rateInput.addEventListener("input", update);
update();
```

**完整版本：**

```javascript
const priceInput = document.querySelector("#price");
const rateInput = document.querySelector("#rate");
const output = document.querySelector("#output");

const calcDiscount = (price, rate) => {
  if (typeof price !== "number" || Number.isNaN(price)) return null;
  if (typeof rate !== "number" || Number.isNaN(rate)) return null;
  return Math.round(price * rate);
};

const formatMoney = (yuan) => {
  if (typeof yuan !== "number" || Number.isNaN(yuan)) return "—";
  return `¥${yuan.toFixed(2)}`;
};

const update = () => {
  const priceText = priceInput.value.trim();
  const rateText = rateInput.value.trim();

  if (priceText === "" || rateText === "") {
    output.textContent = "请输入原价和折扣率";
    return;
  }

  const price = Number(priceText);
  const rate = Number(rateText);

  if (Number.isNaN(price) || Number.isNaN(rate)) {
    output.textContent = "请输入有效的数字";
    return;
  }

  output.textContent = formatMoney(calcDiscount(price, rate));
};

priceInput.addEventListener("input", update);
rateInput.addEventListener("input", update);

update();
```

**保存，双击打开。**

**现在试：把原价从 100 改成 200，结果立刻变 ¥160.00。不用点任何按钮。**

## 3.3 一个性能问题，现在先记下

**看起来很好，但有个隐患：**

`input` 事件**每打一个字符都触发**。如果 `update` 里要做很重的事（比如发网络请求查数据库），用户打 10 个字就会发 10 次请求。

**这叫"请求风暴"。**

**标准解法叫"防抖"（debounce）：**

```text
用户停止输入 300 毫秒后，才真正执行
```

**实现大概长这样（今天先看，不要求会写）：**

```javascript
const debounce = (fn, delay) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

priceInput.addEventListener("input", debounce(update, 300));
```

**逐句读：**

- `timer` 记住上一次的定时器；
- 每次触发先 `clearTimeout` 取消上一次；
- 再设一个新的 300ms 定时器；
- 如果 300ms 内又触发了，前一个就被取消。

**效果：** 用户连续打字时，只有停下来 300ms 后才执行一次。

**这个技巧在搜索框、表单校验里是必须的。** 第 16 周会专门讲。

---

# 第 4 步：事件委托——一个监听器管一片（20 分钟）

## 4.1 先看问题

**假设有一个待办列表，每项都有删除按钮：**

```html
<ul id="list">
  <li>买菜 <button class="del">删除</button></li>
  <li>写代码 <button class="del">删除</button></li>
  <li>睡觉 <button class="del">删除</button></li>
</ul>
```

**笨办法：给每个按钮都绑一次。**

```javascript
document.querySelectorAll(".del").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.target.parentElement.remove();
  });
});
```

**这个办法有三个问题：**

**问题一：新加的项目没有监听器**

```javascript
// 用户新加一条待办
const li = document.createElement("li");
li.innerHTML = `学习 <button class="del">删除</button>`;
list.appendChild(li);
// 这个新按钮点了没反应！
```

**为什么：** 因为在绑定监听器的那一刻，它还不存在。

**问题二：每加一条就要重新绑一次**

**问题三：100 条待办就有 100 个监听器，占内存**

## 4.2 事件委托的解法

**只给"父容器"绑一个监听器：**

```javascript
const list = document.querySelector("#list");

list.addEventListener("click", (event) => {
  if (event.target.classList.contains("del")) {
    event.target.parentElement.remove();
  }
});
```

**为什么这样能工作——靠"事件冒泡"。**

## 4.3 什么是事件冒泡

**做这个实验：**

```html
<div id="outer">
  外层
  <div id="inner">内层</div>
</div>
```

```javascript
document.querySelector("#outer").addEventListener("click", () => {
  console.log("外层被点了");
});

document.querySelector("#inner").addEventListener("click", () => {
  console.log("内层被点了");
});
```

**点"内层"，看控制台。**

**你会看到：**

```text
内层被点了
外层被点了
```

**两次！** 因为事件会从内往外"冒泡"——像水里的气泡一样往上走。

```text
点击内层
  ↓ 触发内层的监听器
  ↓ 事件往上冒到父元素
  ↓ 触发外层的监听器
  ↓ 继续往上冒到 body、html、document
```

**这就是"冒泡"（bubbling）。**

## 4.4 事件委托的原理

```text
子元素被点击 → 事件冒泡 → 父元素的监听器被触发
                           → 通过 event.target 知道是哪个子元素
```

**所以只绑父元素就够，而且新加的子元素自动生效**（因为它的事件也会冒泡到父元素）。

## 4.5 完整实现待办列表

**`todo.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>待办清单</title>
  <style>
    body {
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      max-width: 480px;
      margin: 40px auto;
      padding: 0 16px;
      color: #333;
    }
    form { display: flex; gap: 8px; margin-bottom: 20px; }
    input {
      flex: 1;
      padding: 10px 12px;
      font-size: 15px;
      font-family: inherit;
      border: 1px solid #d0d0d0;
      border-radius: 6px;
    }
    button {
      padding: 10px 16px;
      font-size: 15px;
      font-family: inherit;
      color: #fff;
      background: #1a73e8;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    ul { list-style: none; padding: 0; margin: 0; }
    li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #f7f7f7;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    li button {
      padding: 4px 10px;
      font-size: 13px;
      background: #e53935;
    }
    .empty { color: #999; padding: 16px 0; }
  </style>
</head>
<body>

  <h1>待办清单</h1>

  <form id="addForm">
    <input type="text" id="todoInput" placeholder="要做什么？" required>
    <button type="submit">添加</button>
  </form>

  <ul id="list"></ul>
  <p class="empty" id="empty">还没有待办</p>

  <script src="todo.js" defer></script>
</body>
</html>
```

**`todo.js`：**

```javascript
const addForm = document.querySelector("#addForm");
const todoInput = document.querySelector("#todoInput");
const list = document.querySelector("#list");
const empty = document.querySelector("#empty");

const renderEmpty = () => {
  empty.style.display = list.children.length === 0 ? "block" : "none";
};

// 添加
addForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = todoInput.value.trim();
  if (text === "") return;

  const li = document.createElement("li");
  li.textContent = text;

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "del";
  delBtn.textContent = "删除";
  li.appendChild(delBtn);

  list.appendChild(li);

  todoInput.value = "";
  todoInput.focus();
  renderEmpty();
});

// 删除（事件委托：只绑父元素）
list.addEventListener("click", (event) => {
  if (!event.target.classList.contains("del")) return;
  event.target.parentElement.remove();
  renderEmpty();
});

renderEmpty();
```

## 4.6 逐段理解

### `document.createElement`

```javascript
const li = document.createElement("li");
```

**创建一个新的 `<li>` 元素。** 它此时还不在页面上，只存在于内存里。

### `appendChild`

```javascript
list.appendChild(li);
```

**把 `li` 加到 `list` 的最后。** 这时才真正出现在页面上。

### 为什么用 `textContent` 而不是 `innerHTML`

```javascript
li.textContent = text;
```

**因为 `text` 来自用户输入。**

**如果用 `innerHTML`：**

```javascript
li.innerHTML = text;   // ❌ 危险
```

**用户输入 `<img src=x onerror="alert(1)">`，这个脚本就会执行。**

**这是第 12 节课学过的 XSS，这里再强调一次：只要是用户输入，一律 `textContent`。**

### `classList.contains`

```javascript
if (!event.target.classList.contains("del")) return;
```

**检查这个元素有没有 `del` 这个 class。**

**为什么需要这一句：**
因为用户点的可能是 `<li>` 本身，也可能是文字。**只有点到"删除"按钮时才处理。**

**不写这句会怎样：** 点 `li` 任何位置都会删掉整条。**这可能不是你想要的行为。**

### `todoInput.focus()`

```javascript
todoInput.focus();
```

**让输入框重新获得焦点。**

**为什么：** 添加完一条，用户可能想接着加下一条。**自动聚焦能省一次点击。**

## 4.7 现在验证"委托"的价值

**做这个实验：**

1. 打开页面，添加三条待办；
2. 点前两条的删除按钮 → 都能删。

**这证明什么：** 这三个按钮从来没单独绑过监听器，**但它们都能响应**。

**再看新加的：**

3. 再添加一条新的，点它的删除按钮 → **也能删**。

**因为这个按钮是在父元素的监听器范围内，事件冒泡上去了。**

**如果是笨办法（给每个按钮单独绑），第 3 步就会失败。**

---

# 第 5 步：故意犯五个错（15 分钟）

## 错误 1：`addEventListener` 里函数加括号

**操作：**

```javascript
btn1.addEventListener("click", update());
```

**会怎样：**

- 页面加载时 `update()` 立刻执行一次（但这时元素可能还没准备好）；
- 之后点按钮没有任何反应。

**为什么：** `update()` 是"执行函数并把结果传进去"，`update()` 的结果是 `undefined`，所以实际是 `addEventListener("click", undefined)`。

**这是最经典的事件错误。记住：传函数名，不加括号。**

## 错误 2：忘了 `preventDefault`

**操作：** 在 `form4` 的 submit 处理里删掉 `event.preventDefault()`。

**会怎样：** 点提交后页面立刻刷新，`out4` 的内容一闪就没了。

**怎么查：** 如果在处理函数里 `console.log`，你会看到它只闪一下。

**规则：所有 `<form>` 的 submit 处理，第一行都写 `event.preventDefault()`。**

## 错误 3：`input` 和 `change` 用错

**操作：** 把实时字数统计的 `input` 改成 `change`。

**会怎样：** 打字时数字不动，要离开输入框才更新。

**判断：**

```text
要"边打边看" → input
要"确定后才处理" → change
```

## 错误 4：事件委托里没判断 target

**操作：** 在 `todo.js` 的删除处理里删掉 `if (!event.target.classList.contains("del")) return;`。

**会怎样：** 点 `li` 的任何位置（包括文字）都会删掉整条。

**为什么：** 因为冒泡上来的可能是 `li` 本身，`event.target` 就是 `li`，`li.parentElement` 是 `ul`。**你以为删的是一条，实际可能删掉整个列表。**

**实验：点一下列表空白处，看会发生什么。**

**这是很严重的 bug。**

## 错误 5：绑定时元素还不存在

**操作：** 把 `todo.js` 里的 `list` 相关代码包在一个 `setTimeout` 外面，然后在 `#list` 还没渲染时就绑。

**构造方式：**

```html
<script src="todo.js"></script>   <!-- 放在 <body> 开头 -->
...
<ul id="list"></ul>
```

**会怎样：** `document.querySelector("#list")` 是 `null`，报 `Cannot read properties of null`。

**修法：** `<script>` 放在 `</body>` 前，或加 `defer`。

## 五个错误总结

```text
函数加括号        → 绑定时执行一次，之后失效
忘 preventDefault → 页面刷新，结果一闪而过
input/change 用错 → 时机不对
委托不判 target   → 误删整块
绑定时机太早      → null 报错
```

---

# 第 6 步：写学习笔记（10 分钟）

```markdown
# 第 13 节课学习笔记

## 一、事件的三个词

| 词 | 意思 |
|---|---|
| 事件 | |
| 监听 | |
| 处理函数 | |

## 二、四种基本事件

| 事件 | 什么时候触发 | 典型用途 |
|---|---|---|
| click | | |
| input | | |
| change | | |
| submit | | |

## 三、`input` 和 `change` 的区别（我自己实验的结论）

## 四、为什么函数名不能加括号

```javascript
addEventListener("click", update)      // 
addEventListener("click", update())    // 
```

## 五、`preventDefault` 的作用

不写会怎样：

## 六、`event` 对象里我常用的属性

| 属性 | 意思 |
|---|---|
| event.target | |
| event.key | |
| event.preventDefault() | |

## 七、什么是事件冒泡

我的理解：

实验现象（点内层时控制台输出了什么）：

## 八、事件委托

为什么只绑父元素就够：

比"每个都绑"好在哪：

## 九、`event.key` 和 `event.code` 的区别

| | key | code |
|---|---|---|
| 按 a | | |
| 按 Shift+a | | |
| 什么时候用 | | |

## 十、五个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 函数加括号 | | |
| 忘 preventDefault | | |
| input/change 用错 | | |
| 委托不判 target | | |
| 绑定时机太早 | | |

## 十一、防抖是什么

我的理解：

为什么搜索框一定要防抖：

## 十二、我还不懂的词

- 

## 十三、完成检查

- [ ] 我做出了四种事件都能工作的页面
- [ ] 我知道 input 和 change 的区别
- [ ] 我知道函数名不能加括号
- [ ] 我知道 form 提交必须 preventDefault
- [ ] 我看过事件冒泡的实验现象
- [ ] 我用事件委托做出了待办列表
- [ ] 我验证过"新加的项目也能删除"
- [ ] 我做过五个错误的实验
```

---

# 第 7 步：课后练习

## 练习一：给待办加"完成"标记

**要求：**

1. 点 `li` 的文字区域（不是删除按钮），切换一个"已完成"状态；
2. 已完成的项目加删除线、变灰；
3. 用事件委托实现。

**提示：**

```javascript
if (event.target.classList.contains("del")) { ... }
else { event.target.classList.toggle("done"); }
```

**CSS：**

```css
li.done { text-decoration: line-through; color: #999; }
```

**`classList.toggle` 是什么：** 有就删掉，没有就加上。

## 练习二：做一个实时字数统计

**要求：**

```text
一个 textarea，最多 200 字
下面实时显示 "已输入 35 / 200"
超过 180 字时数字变橙色
超过 200 字...（想想怎么处理：拦还是提示？）
```

**提示：** `maxlength="200"` 会直接拦住输入。**但那样用户不知道为什么打不进去。** 更好的做法是允许打，但显示红色警告。

## 练习三：按 Esc 关闭弹窗

**要求：**

1. 做一个按钮，点击显示一个提示框（`div`）；
2. 按 `Esc` 键关闭它。

**提示：** 在 `document` 上监听 `keydown`。

**思考：** 为什么绑在 `document` 上，不是绑在弹窗上？

## 练习四：找出这段代码的四个问题

```javascript
document.querySelector("#btn").addEventListener("click", handleClick());

function handleClick() {
  console.log("点了");
}

document.querySelector("#form").addEventListener("submit", () => {
  console.log("提交");
});

document.querySelector("#list").addEventListener("click", (e) => {
  e.target.remove();
});
```

**提示方向：** 加括号、preventDefault、委托不判 target、还有一个隐藏的（`body` 里放 script 的位置）。

## 练习五：用自己的话讲

```text
为什么事件会从内往外冒泡？
为什么事件委托能解决"新元素没监听器"的问题？
为什么 form 的 submit 一定要 preventDefault？
为什么实时搜索一定要防抖？
```

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能说清事件、监听、处理函数的关系
- [ ] 我知道 `addEventListener` 的三个部分
- [ ] 我知道函数名不能加括号，并知道为什么

## B. 事件类型

- [ ] 我知道 `click`、`input`、`change`、`submit` 的区别
- [ ] 我知道 `input` 和 `change` 的触发时机差异
- [ ] 我知道 `keydown` 和 `keypress` 该用哪个

## C. 事件对象

- [ ] 我会用 `event.target`
- [ ] 我会用 `event.preventDefault()`
- [ ] 我会用 `event.key`

## D. 冒泡与委托

- [ ] 我做过事件冒泡的实验，看到两次输出
- [ ] 我能解释事件委托的原理
- [ ] 我用事件委托实现了待办列表
- [ ] 我验证过"新加的元素也能响应"
- [ ] 我知道委托里必须判断 `event.target`

## E. 实操

- [ ] `03-练习代码/event.html` 存在
- [ ] `03-练习代码/event.js` 存在
- [ ] 四种事件都能正常工作
- [ ] `03-练习代码/todo.html` 存在
- [ ] 待办能添加、能删除
- [ ] 新添加的待办也能删除
- [ ] 计算器改成实时更新

## F. 排错

- [ ] 事件没反应，我知道先查函数名有没有加括号
- [ ] 表单提交后刷新，我知道是缺 `preventDefault`
- [ ] 委托误删，我知道是没判断 `target`

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有冒泡实验的实际输出
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **事件不是"绑定后就永远有效"，而是"事件发生时沿着 DOM 往上冒泡，谁在监听谁响应"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 点了没反应 | 函数名加了括号 | 改成传函数名 |
| 点了没反应 | `<script>` 太早执行 | 放 `</body>` 前或加 `defer` |
| 点了报 `null` | 元素 id 写错或还没渲染 | 查 id、查 script 位置 |
| 表单提交后页面刷新 | 缺 `preventDefault` | 处理函数第一行加 |
| 打字时字数不更新 | 用了 `change` | 改成 `input` |
| `change` 不触发 | 输入框还有焦点 | 点空白处让它失焦 |
| 新加的元素点不动 | 单独绑定的监听器 | 改用事件委托 |
| 委托点哪都删 | 没判断 `event.target` | 加 `classList.contains` 判断 |
| `event.key` 拿不到中文 | 输入法还在组合中 | 用 `compositionend` 事件配合 |
| 按空格触发按钮 | 按钮有焦点时按空格等于点击 | 正常行为，注意别误操作 |
| 移动端 click 有延迟 | 老浏览器问题 | 现代浏览器已无此问题 |
| 实时搜索发太多请求 | 没做防抖 | 加 `debounce` |
