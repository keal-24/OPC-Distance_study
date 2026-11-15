# 第 12 节课：让页面会算——JavaScript 变量与函数

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前三节课你做的都是"静态"页面：写什么就显示什么。
> 这节课开始让页面**会算、会变**。这是所有交互的基础。

**建议用时**：120 分钟
**你需要先完成**：第 11 节课（会写表单）

---

# 第 0 步：JavaScript 在网页里的角色（5 分钟）

## 0.1 三件套回顾

```text
HTML  → 有什么（结构）
CSS   → 长什么样（外观）
JS    → 能做什么（行为）
```

**你已经做完前两件。现在做第三件。**

## 0.2 一个具体例子

**HTML：**

```html
<p>原价：<span id="price">100</span> 元</p>
<p>打 8 折后：<span id="final">?</span> 元</p>
```

**没有 JS 时：** 页面上永远显示 `?`。

**有了 JS：** 它能算出 80，并填进那个位置。

**这就是"会算"。**

## 0.3 JS 最容易让小白卡住的三件事

```text
① 变量：东西存在哪里
② 函数：一段能重复用的操作
③ 找元素、改元素：怎么把结果放到页面上
```

**今天把这三件学会，你就能做绝大多数基础功能。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `calc.html` | `03-练习代码` | 折扣计算器 |
| `calc.js` | `03-练习代码` | 你自己的 JS |

---

# 第 1 步：JS 写在哪，怎么看到结果（10 分钟）

## 1.1 三种写法

### 方式一：单独 `.js` 文件（推荐）

**HTML 里：**

```html
<body>
  ...
  <script src="calc.js"></script>
</body>
```

**`calc.js` 里：**

```javascript
console.log("你好");
```

**`<script>` 放在 `</body>` 前面。**

**为什么放最后：**
因为浏览器从上往下执行。如果 `<script>` 放在 `<head>` 里，执行时页面元素还没创建好，`document.getElementById` 会找不到东西。

### 方式二：`<script>` 里直接写

```html
<script>
  console.log("你好");
</script>
```

**适用：** 只有几行，或者临时测试。

### 方式三：行内事件属性（不推荐）

```html
<button onclick="alert('你点了')">点我</button>
```

**为什么不推荐：**

- HTML 里混 JS，难维护；
- 只能写简单代码；
- 一个按钮绑多个事件很麻烦。

**今天用方式一。**

## 1.2 `console.log` 是什么

```javascript
console.log("你好");
```

**作用：** 把内容打印到浏览器的**控制台**，用户看不到，是给开发者看的。

**怎么打开控制台：**

1. 在浏览器里按 `F12`；
2. 点"控制台"（Console）标签。

**你会看到：** 一行 `你好`。

**这是你调试 JS 最主要的工具。** 比 `alert()` 好用一万倍——它不打扰用户，可以打很多条，可以看对象内容。

## 1.3 建第一个 JS 文件

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第02周-网页与前端基础\第05节课\03-练习代码
   ```

2. 新建 `calc.html` 和 `calc.js`。
3. **自己敲。**

**`calc.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>折扣计算器</title>
</head>
<body>

  <h1>折扣计算器</h1>

  <script src="calc.js"></script>
</body>
</html>
```

**`calc.js`：**

```javascript
console.log("JS 接上了");
```

4. 保存两个文件，双击 `calc.html`。
5. 按 `F12`，看控制台。

**应该看到：** `JS 接上了`

**如果没看到，检查：**

1. 两个文件在同一个文件夹吗？
2. `<script src="calc.js">` 的文件名对吗？
3. 控制台有没有红色 404？
4. 按 `F5` 刷新了吗？

---

# 第 2 步：变量——把东西存起来（20 分钟）

## 2.1 变量是什么

**变量 = 一个有名字的盒子，用来装数据。**

```javascript
const price = 100;
```

**逐字读：**

- `const` —— 声明一个"常量"（constant）；
- `price` —— 盒子名字；
- `=` —— 把右边的东西放进左边（**注意：这不是数学的"等于"**）；
- `100` —— 装进去的值；
- `;` —— 结尾。

**读作：** "创建一个叫 price 的盒子，里面装 100。"

## 2.2 `const` 和 `let` 的区别

```javascript
const price = 100;      // 常量，不能重新赋值
let total = 0;          // 变量，可以重新赋值
```

**关键区别：**

```javascript
const price = 100;
price = 200;            // ❌ 报错：Assignment to constant variable
```

```javascript
let total = 0;
total = 100;            // ✅ 可以
total = 200;            // ✅ 可以
```

**怎么选：**

```text
默认用 const。
确实需要改这个值的时候，才用 let。
```

**为什么默认 `const`：**
因为它能防止你（或 AI）不小心改了不该改的值。**这是最省 bug 的习惯。**

## 2.3 不要用 `var`

**你可能会在老代码里看到：**

```javascript
var price = 100;
```

**`var` 是旧写法，有历史遗留的坑（变量提升、作用域混乱）。**

**规则：不要用 `var`。** 用 `const` 或 `let`。

## 2.4 六种常见数据类型

```javascript
const name = "小明";           // 字符串（string），用引号包起来
const age = 25;                // 数字（number），不用引号
const isMember = true;         // 布尔（boolean），只有 true / false
const nothing = null;          // 空值（null），表示"故意没有"
let notSet;                    // undefined，表示"还没赋值"
const user = { name: "小明" }; // 对象（object），一堆键值对
```

**最容易搞混的一对：**

```javascript
const a = 100;      // 数字 100
const b = "100";    // 字符串 "100"，是两个字符
```

**它们不一样：**

```javascript
console.log(100 + 100);      // 200（数字相加）
console.log("100" + "100");  // "100100"（字符串拼接）
console.log(100 + "100");    // "100100"（数字被转成字符串）
```

**最后一行是 JS 最坑的地方之一。** 这就是为什么第 7 节课的硬规则里写"判断相等用 `===`"。

## 2.5 `===` 和 `==` 的区别

```javascript
console.log(100 === "100");   // false（类型不同）
console.log(100 == "100");    // true（== 会先转类型）
```

**`==` 会做"类型转换"，然后比较。**

**为什么危险——几个经典例子：**

```javascript
console.log(0 == "");         // true    ← 0 和空字符串相等？
console.log(0 == "0");        // true
console.log("" == "0");       // false   ← 但空串和 "0" 不相等
console.log(null == undefined); // true
console.log(null == 0);       // false   ← null 不等于 0
console.log(false == "0");    // true    ← false 和 "0" 相等？！
```

**看出来了吗：`==` 的比较规则极难预测。**

**规则（硬性要求）：**

```text
永远用 ===，永远不用 ==。
```

**`===` 的意思是"值和类型都必须一样"。**

**例外（唯一）：** 判断 `null` 时可以用 `== null`，因为它同时覆盖 `null` 和 `undefined`。**但这个例外等你熟练了再用，现在只用 `===`。**

## 2.6 模板字符串

**老写法（拼接）：**

```javascript
const name = "小明";
const msg = "你好，" + name + "，欢迎回来";
```

**新写法（模板字符串）：**

```javascript
const name = "小明";
const msg = `你好，${name}，欢迎回来`;
```

**注意符号：**

- 外层用**反引号** `` ` ``（键盘左上角，`Esc` 下面，和 `~` 同一个键）；
- 里面用 `${}` 包住变量。

**为什么新写法更好：**

- 不用到处写 `+` 和引号；
- 可以换行；
- 不容易漏引号。

**反引号的坑：**

```javascript
const msg = "你好，${name}";   // ❌ 单引号，${} 不生效，原样显示
const msg = `你好，${name}`;   // ✅ 反引号，才会替换
```

**怎么确认自己敲的是反引号：**
反引号是**斜的**，单引号是**直的**。` vs '

## 2.7 自己练：把数据存起来

**在 `calc.js` 里写：**

```javascript
const originalPrice = 100;
const discountRate = 0.8;
const finalPrice = originalPrice * discountRate;

console.log(originalPrice);
console.log(discountRate);
console.log(finalPrice);

const label = `原价 ${originalPrice} 元，打 8 折后 ${finalPrice} 元`;
console.log(label);
```

**保存，刷新，看控制台。**

**应该看到：**

```text
100
0.8
80
原价 100 元，打 8 折后 80 元
```

## 2.8 自己试三次

**操作：**

**第一次：** 把 `const finalPrice` 改成 `let finalPrice`，然后在后面加一行 `finalPrice = 90;`。

**结果：** 能改。

**第二次：** 改回 `const`，再加 `finalPrice = 90;`。

**结果：** 控制台报错 `Assignment to constant variable`。

**第三次：** 把 `discountRate` 改成 `"0.8"`（加引号）。

**结果：** `finalPrice` 变成 `"1000.8"`？还是别的？

**实际结果：** `originalPrice * discountRate` 里，字符串 `"0.8"` 会被转成数字 0.8，所以结果还是 80。

**但如果你改成 `"abc"`：** 结果是 `NaN`。

**`NaN` 是什么：** Not a Number（不是数字）。**任何算不出数字的运算都会得到 NaN，而且它会一路传染下去。**

**验证：**

```javascript
console.log(Number("abc"));   // NaN
console.log(typeof NaN);      // "number"  ← 注意！NaN 的类型是 number
```

**这就是为什么金额必须用整数分，且要做类型检查。**

---

# 第 3 步：函数——一段能重复用的操作（25 分钟）

## 3.1 函数是什么

**函数 = 一个"加工机器"。给它原料，它给你成品。**

```javascript
function calcDiscount(price, rate) {
  return price * rate;
}
```

**逐字读：**

- `function` —— 声明一个函数；
- `calcDiscount` —— 函数名字；
- `(price, rate)` —— 括号里是"原料"，叫**参数**；
- `{ ... }` —— 花括号里是"加工过程"，叫**函数体**；
- `return` —— 把结果交出去。

**怎么用：**

```javascript
const result = calcDiscount(100, 0.8);
console.log(result);   // 80
```

**读作：** "把 100 和 0.8 交给 calcDiscount，它返回 80。"

## 3.2 参数、返回值、调用

**三个词必须分清：**

| 词 | 是什么 | 例子 |
|---|---|---|
| 参数（parameter） | 函数定义时的变量名 | `function f(price, rate)` 里的 `price` |
| 实参（argument） | 调用时真正传的值 | `f(100, 0.8)` 里的 `100` |
| 返回值（return value） | 函数交回的结果 | `return price * rate` 的结果 |

**日常说话时，参数和实参经常混着叫"参数"，但你要知道区别。**

## 3.3 三种写法

### 写法一：函数声明

```javascript
function calcDiscount(price, rate) {
  return price * rate;
}
```

**特点：可以在声明之前调用（"提升"）。**

```javascript
console.log(calcDiscount(100, 0.8));   // 80，即使函数声明在下面

function calcDiscount(price, rate) {
  return price * rate;
}
```

### 写法二：函数表达式

```javascript
const calcDiscount = function (price, rate) {
  return price * rate;
};
```

**特点：** 必须先声明后调用。

**注意结尾有分号。** 因为它是一个赋值语句。

### 写法三：箭头函数（现代写法）

```javascript
const calcDiscount = (price, rate) => {
  return price * rate;
};
```

**简写（只有一句 return 时）：**

```javascript
const calcDiscount = (price, rate) => price * rate;
```

**只有一句 return，可以省略 `{}` 和 `return`。**

**箭头函数的特点：**

- 短，尤其在作为参数传递时；
- `this` 行为和普通函数不同（现在不用管，等第 6 周会讲）；
- **不能用 `arguments`**。

**本课程统一用箭头函数。** 因为它最短、最现代，而且你在 AI 生成的代码里会大量看到。

## 3.4 `return` 的三个坑

### 坑一：忘记 `return`

```javascript
const calcDiscount = (price, rate) => {
  price * rate;      // 没有 return
};

console.log(calcDiscount(100, 0.8));   // undefined
```

**为什么是 `undefined`：**
因为函数没交出任何东西。**JS 里没 return 的函数，返回值是 `undefined`。**

### 坑二：`return` 后面的代码不执行

```javascript
const test = () => {
  return "A";
  console.log("B");    // 永远不执行
};
```

**为什么：** `return` 会立刻结束函数。

**这就是第 3 节课实验一的核心。** 那个"规则顺序不能反"的原因就在这里。

### 坑三：换行导致 return 失效（极隐蔽）

```javascript
const test = () => {
  return
    "A";
};
```

**结果：** 返回 `undefined`。

**为什么：**
JS 有一个"自动插入分号"的规则。`return` 后面换行，它会在 `return` 后面自动补一个分号，变成：

```javascript
return;      // 返回 undefined
"A";         // 这行永远不执行
```

**规则：`return` 后面不要换行，值要和 `return` 在同一行。**

## 3.5 默认参数

```javascript
const calcDiscount = (price, rate = 0.9) => price * rate;

console.log(calcDiscount(100));       // 90（用了默认的 0.9）
console.log(calcDiscount(100, 0.8));  // 80（用传入的 0.8）
```

**`rate = 0.9` 的意思是：如果不传这个参数，就用 0.9。**

**什么时候用：**
有合理默认值的参数。**但不该滥用——如果这个值必须由调用方提供，就不要给默认值。**

## 3.6 参数校验：必须做的事

**问题：** 如果调用方传了错的东西会怎样？

```javascript
const calcDiscount = (price, rate) => price * rate;

console.log(calcDiscount("abc", 0.8));   // NaN
console.log(calcDiscount(null, 0.8));    // 0  ← 更危险，不报错
console.log(calcDiscount(undefined, 0.8)); // NaN
```

**`null * 0.8` 得到 0。** 它会静默地算出一个错误的 0，不报错。

**正确做法：先校验，再计算。**

```javascript
const calcDiscount = (price, rate) => {
  if (typeof price !== "number" || Number.isNaN(price)) {
    return null;
  }
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    return null;
  }
  return price * rate;
};

console.log(calcDiscount("abc", 0.8));   // null
console.log(calcDiscount(null, 0.8));    // null
console.log(calcDiscount(100, 0.8));     // 80
```

**`typeof` 是什么：** 返回一个值的类型名。

```javascript
console.log(typeof 100);        // "number"
console.log(typeof "abc");      // "string"
console.log(typeof true);       // "boolean"
console.log(typeof null);       // "object"  ← 这是 JS 的历史 bug，记住就好
console.log(typeof undefined);  // "undefined"
console.log(typeof []);         // "object"  ← 数组也是 object
console.log(typeof {});         // "object"
```

**为什么 `typeof null` 是 `"object"`：**
这是 JS 诞生时的 bug，因为修了会破坏大量老代码，所以一直留着。**面试常问。**

**所以判断 null 不能靠 typeof：**

```javascript
if (value === null) { ... }         // 对
if (typeof value === "object" && value !== null) { ... }  // 判断"是对象且不是 null"
```

## 3.7 自己练三个函数

**在 `calc.js` 里写（自己敲）：**

```javascript
// 1. 算折扣价
const calcDiscount = (price, rate) => {
  if (typeof price !== "number" || Number.isNaN(price)) {
    return null;
  }
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    return null;
  }
  return Math.round(price * rate);
};

// 2. 算含税总价
const addTax = (price, taxRate = 0.06) => {
  if (typeof price !== "number" || Number.isNaN(price)) {
    return null;
  }
  return Math.round(price * (1 + taxRate));
};

// 3. 格式化金额
const formatMoney = (yuan) => {
  if (typeof yuan !== "number" || Number.isNaN(yuan)) {
    return "金额无效";
  }
  return `¥${yuan.toFixed(2)}`;
};

console.log("折扣价：", calcDiscount(100, 0.8));
console.log("折扣价（错误输入）：", calcDiscount("abc", 0.8));
console.log("含税价：", addTax(80));
console.log("含税价（自定义税率）：", addTax(80, 0.1));
console.log("格式化：", formatMoney(86.4));
console.log("格式化（错误输入）：", formatMoney(null));
```

**保存刷新，看控制台。**

**应该看到：**

```text
折扣价： 80
折扣价（错误输入）： null
含税价： 85
含税价（自定义税率）： 88
格式化： ¥86.40
格式化（错误输入）： 金额无效
```

**验算：**

- `calcDiscount(100, 0.8)` = `Math.round(80)` = 80
- `addTax(80)` = `Math.round(80 * 1.06)` = `Math.round(84.8)` = 85
- `addTax(80, 0.1)` = `Math.round(80 * 1.1)` = `Math.round(88)` = 88

**新出现的 `Math.round`：** 四舍五入取整。

```javascript
console.log(Math.round(84.5));   // 85
console.log(Math.round(84.4));   // 84
console.log(Math.floor(84.9));   // 84（向下取整）
console.log(Math.ceil(84.1));    // 85（向上取整）
```

---

# 第 4 步：找到页面元素、改它的内容（20 分钟）

## 4.1 现在 JS 只在控制台输出，用户看不到

**要让结果出现在页面上，需要三步：**

```text
① 在 HTML 里给元素一个 id
② 用 JS 找到它
③ 改它的内容
```

## 4.2 第一步：HTML 里加 id

**改造 `calc.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>折扣计算器</title>
  <style>
    body {
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      max-width: 480px;
      margin: 40px auto;
      padding: 0 16px;
      color: #333;
    }
    .row {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 14px;
      color: #666;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      font-size: 15px;
      font-family: inherit;
      border: 1px solid #d0d0d0;
      border-radius: 6px;
    }
    .result {
      margin-top: 24px;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 8px;
      font-size: 18px;
    }
    .result strong {
      color: #1a73e8;
    }
  </style>
</head>
<body>

  <h1>折扣计算器</h1>

  <div class="row">
    <label for="price">原价（元）</label>
    <input type="number" id="price" value="100">
  </div>

  <div class="row">
    <label for="rate">折扣率（0.8 表示 8 折）</label>
    <input type="number" id="rate" value="0.8" step="0.1">
  </div>

  <div class="result">
    折后价：<strong id="output">—</strong>
  </div>

  <script src="calc.js"></script>
</body>
</html>
```

**注意三个 `id`：** `price`、`rate`、`output`。

**`value="100"` 是什么：** 输入框的初始值。

**`step="0.1"` 是什么：** 数字输入框每次加减 0.1。**不加的话，上下箭头只能走整数，调不到 0.8。**

## 4.3 第二步：JS 找元素

**`calc.js` 换成：**

```javascript
// 找到三个元素
const priceInput = document.getElementById("price");
const rateInput = document.getElementById("rate");
const output = document.getElementById("output");

console.log(priceInput);
console.log(rateInput);
console.log(output);
```

**保存刷新，看控制台。**

**应该看到三个 HTML 元素对象。** 点开能看它们的属性。

**`document.getElementById` 逐字读：**

- `document` —— 整个页面文档；
- `.getElementById` —— 按 id 获取元素；
- `("price")` —— id 是 price。

**这是最基础的"找元素"方法。**

**常见的其它找法：**

```javascript
document.querySelector(".card")        // 找第一个 class="card" 的
document.querySelector("#price")       // 按 id 找（推荐统一用这个）
document.querySelectorAll(".item")     // 找所有 class="item" 的，返回列表
```

**为什么推荐 `querySelector`：**
因为它用 CSS 选择器语法，**你第 10 节课学的 `.class` 和 `#id` 直接能用**，不用记两套。

**`getElementById` 和 `querySelector` 都可以。本课程统一用 `querySelector`。**

**改写：**

```javascript
const priceInput = document.querySelector("#price");
const rateInput = document.querySelector("#rate");
const output = document.querySelector("#output");
```

## 4.4 第三步：读值、改值

**读输入框的值：**

```javascript
console.log(priceInput.value);   // "100"
```

**注意：输入框的值**永远是字符串**！**

```javascript
console.log(typeof priceInput.value);   // "string"
```

**这是最坑的地方：** 哪怕 `input type="number"`，`.value` 也是字符串 `"100"`，不是数字 `100`。

**所以必须转换：**

```javascript
const price = Number(priceInput.value);
console.log(typeof price);   // "number"
```

**`Number()` 是什么：** 把字符串转成数字。

```javascript
console.log(Number("100"));      // 100
console.log(Number("100.5"));    // 100.5
console.log(Number("abc"));      // NaN
console.log(Number(""));         // 0    ← 注意！空字符串转成 0
console.log(Number("  100  "));  // 100（自动去空格）
```

**`Number("")` 得 0 是个坑。** 用户什么都没填，你会算出 0 元。**所以必须先判断空值。**

**改文本内容：**

```javascript
output.textContent = "80";
```

**`textContent` 是什么：** 元素的文字内容。

**为什么不叫 `innerHTML`：**

```javascript
output.textContent = "<b>80</b>";   // 显示字面的 "<b>80</b>"
output.innerHTML = "<b>80</b>";     // 显示粗体的 80
```

**`innerHTML` 会解析 HTML 标签，`textContent` 不会。**

**安全规则（必须记住）：**

```text
凡是"用户能输入的内容"，一律用 textContent，绝不用 innerHTML。
```

**为什么：**
因为 `innerHTML` 会执行用户输入的 HTML 和脚本。这是 **XSS 攻击**（跨站脚本攻击）最常见的原因。

**举例：** 用户把昵称设成

```html
<img src=x onerror="alert('你的密码被偷了')">
```

你用 `innerHTML` 渲染昵称，这段代码就会在别人的浏览器里执行。

**这个坑每年造成大量安全事故。第 33 周会专门讲。**

## 4.5 完整版本：算出结果并显示

**`calc.js` 完整版（自己敲）：**

```javascript
// 1. 找到元素
const priceInput = document.querySelector("#price");
const rateInput = document.querySelector("#rate");
const output = document.querySelector("#output");

// 2. 计算函数
const calcDiscount = (price, rate) => {
  if (typeof price !== "number" || Number.isNaN(price)) {
    return null;
  }
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    return null;
  }
  return Math.round(price * rate);
};

// 3. 格式化
const formatMoney = (yuan) => {
  if (typeof yuan !== "number" || Number.isNaN(yuan)) {
    return "—";
  }
  return `¥${yuan.toFixed(2)}`;
};

// 4. 更新页面
const update = () => {
  const priceText = priceInput.value.trim();
  const rateText = rateInput.value.trim();

  if (priceText === "" || rateText === "") {
    output.textContent = "请输入原价和折扣率";
    return;
  }

  const price = Number(priceText);
  const rate = Number(rateText);

  const finalPrice = calcDiscount(price, rate);
  output.textContent = formatMoney(finalPrice);
};

// 5. 先算一次，让页面一打开就有结果
update();
```

**保存刷新。**

**应该看到：** 折后价显示 `¥80.00`。

## 4.6 逐段理解

### `.trim()` 是什么

```javascript
const priceText = priceInput.value.trim();
```

**去掉字符串首尾的空格。**

```javascript
console.log("  100  ".trim());   // "100"
console.log("   ".trim());       // ""（变成空字符串）
```

**为什么必须做：**
用户可能输入一个空格。**不 trim，`" "` 会被 `Number(" ")` 转成 0，算出 0 元。**

### 为什么先判断空字符串

```javascript
if (priceText === "" || rateText === "") {
  output.textContent = "请输入原价和折扣率";
  return;
}
```

**为什么不能直接 `Number("")`：**
因为 `Number("")` 是 `0`，不是 `NaN`。**你会算出 0 元，用户以为是"免费"，其实是没填。**

**这是"输入校验必须做在转换之前"的典型例子。**

### `return;` 在函数里是什么

```javascript
const update = () => {
  ...
  if (...) {
    return;      // 直接结束这个函数
  }
  ...
};
```

**`return;` 后面什么都没有，表示"到此为止，不返回任何值"。**

**注意：`return;` 在 `update` 里不会有返回值，所以 `update` 的返回值是 `undefined`。** 这没问题，因为它只用来"做事"，不用来"算东西"。

## 4.7 现在它还是"静态"的

**问题：** 你改了输入框的值，结果不会变。**必须刷新页面才更新。**

**为什么：** 因为 `update()` 只在页面加载时调用了一次。

**让它在用户输入时也更新——这就是第 13 节课的内容（事件）。**

**今天的最后一步，先加一个"手动刷新"按钮试试：**

**在 `calc.html` 的 `<div class="result">` 前面加：**

```html
<button type="button" id="calcBtn">计算</button>
```

**在 `calc.js` 最后加：**

```javascript
document.querySelector("#calcBtn").addEventListener("click", update);
```

**这就是绑定事件。** 现在点"计算"按钮，会执行 `update`。

**`addEventListener` 是什么：** 给元素加一个监听器，等某个事件发生时执行某个函数。

```text
addEventListener("click", update)
                  ↑        ↑
              事件类型   事件发生时执行的函数
```

**这个第 13 节课详细讲。** 今天先看到效果：**点按钮，结果变了。**

---

# 第 5 步：故意犯五个错（15 分钟）

## 错误 1：`<script>` 放在 `<head>` 里

**操作：**

1. 把 `<script src="calc.js"></script>` 从 `</body>` 前移到 `<head>` 里。
2. 保存刷新，看控制台。

**你会看到：**

```text
Uncaught TypeError: Cannot read properties of null (reading 'value')
```

**为什么：**
因为 `<script>` 执行时，`<body>` 里的元素还没创建。`querySelector("#price")` 返回 `null`，然后 `null.value` 就报错了。

**这就是第 4 节课学的 `TypeError: Cannot read properties of null`。**

**两种修法：**

**修法一（推荐）：把 `<script>` 放回 `</body>` 前；**

**修法二：加 `defer` 属性：**

```html
<script src="calc.js" defer></script>
```

**`defer` 是什么：** 告诉浏览器"先解析完 HTML，再执行这个脚本"。

**`defer` 和 `async` 的区别：**

| 属性 | 什么时候执行 |
|---|---|
| 无 | 立刻执行，会阻塞 HTML 解析 |
| `defer` | HTML 解析完后执行，**按顺序** |
| `async` | 下载完就执行，**不保证顺序** |

**本课程统一用 `defer`。** 它既安全又保证顺序。

**记得改回去。**

## 错误 2：忘了 `.value`

**操作：**

```javascript
const price = Number(priceInput);
```

（少了 `.value`）

**会怎样：** `Number(元素对象)` 得到 `NaN`，结果全是"金额无效"。

**怎么查：** `console.log(priceInput)` 看它是什么。如果是一个 HTML 元素，说明你忘了 `.value`。

**这是新手最常见的错误之一。**

## 错误 3：用 `== ` 比较

**操作：**

```javascript
if (priceText == "") { ... }
```

**会怎样：** 这次碰巧能工作（因为两者都是字符串）。

**但下面这个就出问题了：**

```javascript
if (price == 0) { ... }
```

**如果 `price` 是 `""`：** `"" == 0` 是 `true`。所以"用户没填"会被判断成"用户填了 0"。

**规则：一律用 `===`。**

## 错误 4：`return` 后面换行

**操作：**

```javascript
const calcDiscount = (price, rate) => {
  return
    price * rate;
};
```

**会怎样：** 返回 `undefined`，`formatMoney(undefined)` 显示"金额无效"。

**怎么查：** `console.log(calcDiscount(100, 0.8))` 看是不是 `undefined`。

**修法：`return price * rate;` 写在同一行。**

## 错误 5：用 `innerHTML` 显示用户输入

**操作：**

```javascript
output.innerHTML = priceInput.value;
```

**然后在原价输入框里填：**

```html
<b>测试</b>
```

**会怎样：** 显示成**粗体的测试**，不是字面的 `<b>测试</b>`。

**这意味着：如果用户输入的是恶意脚本，它也会被执行。**

**修法：改成 `textContent`。**

## 五个错误总结

```text
script 放 head     → TypeError: null
忘了 .value        → NaN，结果全错
用 == 比较         → 空字符串被当成 0
return 后换行      → 返回 undefined
用 innerHTML       → XSS 漏洞
```

---

# 第 6 步：写学习笔记（10 分钟）

```markdown
# 第 12 节课学习笔记

## 一、`const` / `let` / `var`

| 关键字 | 能不能改 | 我用不用 |
|---|---|---|
| const | | |
| let | | |
| var | | |

## 二、六种数据类型

| 类型 | 例子 | typeof 结果 |
|---|---|---|
| 字符串 | | |
| 数字 | | |
| 布尔 | | |
| null | | |
| undefined | | |
| 对象 | | |

`typeof null` 返回什么，为什么：

## 三、`==` 和 `===` 的区别

```javascript
console.log(0 == "");       // 
console.log(0 === "");      // 
console.log(null == undefined);  // 
console.log(false == "0");  // 
```

我的结论：

## 四、模板字符串

老写法：

新写法：

反引号在哪里：

## 五、函数的三种写法

1.
2.
3.

本课程用哪种：

## 六、`return` 的三个坑

1.
2.
3.

## 七、找元素和改内容

| 操作 | 代码 |
|---|---|
| 按 id 找元素 | |
| 读输入框的值 | |
| 改文字内容 | |

`.value` 的类型永远是什么：

## 八、`textContent` 和 `innerHTML`

| | textContent | innerHTML |
|---|---|---|
| 会不会解析标签 | | |
| 该不该用于用户输入 | | |
| 为什么 | | |

## 九、`Number()` 的三个坑

```javascript
console.log(Number(""));      // 
console.log(Number("abc"));   // 
console.log(Number("  100  ")); // 
```

## 十、五个错误的后果

| 错误 | 报错或现象 | 怎么查 |
|---|---|---|
| script 放 head | | |
| 忘了 .value | | |
| 用 == | | |
| return 后换行 | | |
| 用 innerHTML | | |

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 我的 JS 文件接上了，控制台能看到输出
- [ ] 我用 const 声明常量，用 let 声明要改的值
- [ ] 我全程没用 var
- [ ] 我用 === 比较，没用 ==
- [ ] 我会写箭头函数
- [ ] 我的函数有参数校验
- [ ] 我能找到页面元素并改它的文字
- [ ] 我知道 .value 永远是字符串
- [ ] 我用了 textContent 不用 innerHTML
- [ ] 点"计算"按钮能得到正确结果
- [ ] 我做过五个错误的实验
```

---

# 第 7 步：课后练习

## 练习一：加一个"税费"输入框

**要求：**

1. 加一个输入框，`id="tax"`，默认值 `0.06`；
2. 计算结果改成：`原价 × 折扣率 × (1 + 税率)`；
3. 显示三个数：折后价、税额、含税总价。

**示例：** 原价 100，折扣 0.8，税率 0.06

```text
折后价：¥80.00
税额：¥4.80
含税总价：¥84.80
```

## 练习二：加"清空"按钮

**要求：**

- 一个 `type="button"` 的清空按钮；
- 点击后把三个输入框清空，结果显示"—"；
- **注意不要用 `type="submit"`，避免页面刷新。**

## 练习三：让函数更严格

**现在的 `calcDiscount` 允许折扣率是 5 或者 -1。**

**要求：** 加校验，折扣率必须在 0.1 到 1 之间，否则返回 `null`。

**思考：** 折扣率是 0.1（打 1 折）和 1（不打折）都合理，为什么不能是 0 或负数？

## 练习四：找出这段代码的五个问题

```javascript
var price = document.querySelector("#price").value;

function calc() {
  return
    price * 0.8;
}

if (price == 0) {
  console.log("没填");
}

document.querySelector("#out").innerHTML = calc();
```

**提示方向：** var、.value 没转数字、return 换行、==、innerHTML。

## 练习五：用自己的话讲

```text
为什么输入框的 .value 永远是字符串？
为什么不能直接 Number("")？
为什么必须用 textContent 而不是 innerHTML？
为什么 <script> 要放在 </body> 前或加 defer？
```

---

# 第 8 步：最终验收

## A. 变量

- [ ] 我知道 `const` 和 `let` 的区别
- [ ] 我知道不用 `var` 的原因
- [ ] 我能说出六种数据类型
- [ ] 我知道 `100` 和 `"100"` 不一样
- [ ] 我知道 `typeof null` 是 `"object"`

## B. 比较

- [ ] 我知道 `==` 和 `===` 的区别
- [ ] 我能说出至少两个 `==` 的坑
- [ ] 我全程用 `===`

## C. 字符串

- [ ] 我会用模板字符串和 `${}`
- [ ] 我知道必须用反引号
- [ ] 我会用 `.trim()`

## D. 函数

- [ ] 我会写函数声明、函数表达式、箭头函数
- [ ] 我分得清参数和实参
- [ ] 我知道忘 `return` 会得到 `undefined`
- [ ] 我知道 `return` 后面换行会失效
- [ ] 我的函数有参数校验

## E. DOM

- [ ] 我会用 `querySelector` 找元素
- [ ] 我知道 `.value` 永远是字符串
- [ ] 我会用 `Number()` 转换
- [ ] 我知道 `Number("")` 是 0，不是 NaN
- [ ] 我会用 `textContent` 改文字
- [ ] 我知道为什么不能用 `innerHTML` 显示用户输入

## F. 实操

- [ ] `03-练习代码/calc.html` 存在
- [ ] `03-练习代码/calc.js` 存在
- [ ] 页面打开显示 `¥80.00`
- [ ] 改输入框再点"计算"能更新结果
- [ ] 输入框空着会提示
- [ ] 输入 `abc` 不会崩溃
- [ ] 我做过五个错误的实验

## G. 排错

- [ ] 遇到 `Cannot read properties of null` 我知道是元素没找到
- [ ] 我知道先 `console.log` 看真实值，不靠猜
- [ ] 我知道在控制台能看报错的行号

## H. 笔记

- [ ] `NOTES.md` 填完
- [ ] 记录了 `==` 的实际测试结果
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **输入框里拿到的永远是字符串，页面上显示的文字必须当成不可信内容处理。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `Cannot read properties of null` | 元素没找到 | 查 id、查 script 位置 |
| 结果全是 `NaN` | 忘了 `.value` 或 `.value` 没转数字 | 用 `Number()` 并检查 |
| 结果是 `0` 但用户没填 | `Number("")` 是 0 | 先判断空字符串 |
| `Assignment to constant variable` | 给 const 重新赋值 | 改用 let |
| `return` 得到 `undefined` | 忘了 return 或换行 | 值写在同一行 |
| 页面上显示了 HTML 标签 | 用了 `innerHTML` | 改 `textContent` |
| `${name}` 原样显示 | 用了单引号不是反引号 | 改成 `` ` `` |
| 控制台没有任何输出 | JS 没接上或报错 | 查 404、查报错 |
| 改代码后没变化 | 没保存或没刷新 | `Ctrl + S` + `F5` |
| `typeof null` 是 object | JS 历史 bug | 记住，判断用 `=== null` |
| 数字输入框调不到小数 | 缺 `step` | 加 `step="0.1"` |
| `100 + "100"` 变成拼接 | 一边是字符串 | 用 `Number()` 先转 |
