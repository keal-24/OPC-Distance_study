# 第 4 节课：看懂报错——从红字到原因

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你学会了读正常代码。这节课学**读出错时的代码**。
> 报错不是失败，是电脑在告诉你“哪一行不符合规则”。看不懂报错，就只能靠猜；看得懂，你自己就能修。

**建议用时**：90 分钟
**你需要先完成**：第 1、2、3 节课

---

# 第 0 步：先破除一个恐惧（5 分钟）

## 0.1 小白看到红字的第一反应

```text
完了，坏了，我得重新写
```

然后：删掉整段代码 → 重新问工具 → 它给新的 → 又报错 → 循环。

**这是最浪费时间的做法。**

## 0.2 红字其实只是一句话

每条报错都在回答三个问题：

```text
① 哪种错？（错误类型）
② 在哪一行？（文件:行号）
③ 具体是什么？（错误消息）
```

**你只要能读出这三样，就已经能修 70% 的错。**

## 0.3 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的报错档案 |
| `bug1.js` 到 `bug6.js` | `03-练习代码` | 六个故意做坏的例子 |
| `errors.md` | `03-练习代码` | 报错档案表 |

---

# 第 1 步：先认识报错长什么样（10 分钟）

## 1.1 建一个会报错的文件

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第01周-AI工具\第04节课\03-练习代码
   ```

2. 空白处右键 → 新建 → 文本文档 → 改名 `bug1.js` → 扩展名提示点“是”。

   **说明：这个文件夹里除了一份 `说明.md`，什么都没有。所有 `bug1.js` 到 `bug6.js` 都要你自己建。** 本课给出的代码都是“要你故意写坏的”，不是让你复制现成的。

3. 用 Visual Studio Code 打开。
4. 只写这一行：

```javascript
console.log(name);
```

5. `Ctrl + S` 保存。
6. `Ctrl + ~` 打开终端，确认目录是 `第04节课\03-练习代码`。
7. 输入：

```text
node bug1.js
```

8. 回车。

## 1.2 看屏幕上出现什么

**你会看到类似这样一段（注意：每个 Node 版本措辞略有不同）：**

```text
ReferenceError: name is not defined
    at Object.<anonymous> (B:\OPC-Distance_study\...\bug1.js:1:13)
    at Module._compile (node:internal/modules/cjs/loader:1234:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1123:10)
    ...
```

## 1.3 把这段红字拆成三块

### 第一块：错误类型（第一行的第一个词）

```text
ReferenceError
```

**`ReferenceError` 是什么：**
英文 `Reference` 是“引用、指向”。意思是：

> 你用了一个名字，但这个名字从来没被定义过。

就像你叫“张三”去干活，但公司里根本没有张三这个人。

### 第二块：错误消息（第一行冒号后面）

```text
name is not defined
```

**翻译：** “name 没有被定义”。

**连起来读：**

> 引用错误：`name` 这个变量没有被定义。

### 第三块：出错位置（第一行 `at` 后面）

```text
at Object.<anonymous> (B:\...\bug1.js:1:13)
```

**这块最关键。看最后两个数字：**

```text
bug1.js:1:13
       ↑ ↑
       行 列
```

- `bug1.js`：文件；
- `1`：第 1 行；
- `13`：第 13 个字符。

**后面那些 `at Module._compile` 是 Node 内部在跑，跟你无关。** 小白最容易犯的错就是盯着后面那堆看不懂的，其实答案在第一行。

## 1.3.1 一个例外：报错不一定在第一行

有些情况下，你打开终端会先看到这几行：

```text
node:internal/errors:540
      throw error;
      ^
```

**这三行不用看。** 它只是 Node 在说“我要抛出一个错误了”。

**真正的错误信息在它下面：**

```text
TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received type number (123)
    at Object.join (node:path:528:7)
    at Object.<anonymous> (B:\...\bug6.js:3:18)
```

**所以找报错的正确做法是：**

```text
往下翻，找到第一行带 "Error:" 或 "[ERR_xxx]" 的
```

**那一行才是真正的错误类型和消息。**

## 1.4 三块对照表

| 位置 | 内容 | 你要读什么 |
|---|---|---|
| 第一行第一个词 | `ReferenceError` | 哪种错 |
| 第一行冒号后 | `name is not defined` | 具体问题 |
| 第一行括号里 | `bug1.js:1:13` | 哪个文件、哪一行 |

**记住这个顺序：类型 → 消息 → 位置。**

## 1.5 修复它

`bug1.js` 里 `name` 没定义。改成：

```javascript
const name = "小明";
console.log(name);
```

保存，运行。

**应该看到：**

```text
小明
```

**这就是一次完整的“读报错 → 修好”的过程。** 你没有问任何人。

---

# 第 2 步：六种最常见的错，各做一个（30 分钟）

## 2.1 为什么要自己制造错误

因为**见过才知道长什么样**。你没见过的报错，第一次遇到一定慌。

下面六个文件，每个都只犯一个错。做完你就有了自己的“报错字典”。

## 错误 1：`ReferenceError` —— 用了没定义的名字

**文件：**`bug1.js`（刚才已经做过）

**做坏的样子：**

```javascript
console.log(name);
```

**报错：**

```text
ReferenceError: name is not defined
```

**人话原因：** 名字没定义就拿来用。

**三种常见触发：**

1. 变量名拼错：`console.log(userNmae)`；
2. 忘了声明：直接 `total = 100`（严格模式下也会报）；
3. 大小写错了：定义了 `userName`，用的时候写 `username`。

**怎么修：**
检查这个名字是否定义过，拼写和大小写是否完全一致。

---

## 错误 2：`SyntaxError` —— 语法写错

**做坏的样子（`bug2.js`）：**

```javascript
function greet(name {
  console.log("你好，" + name);
}
```

注意：`name {` 少了一个右括号 `)`。

**报错：**

```text
SyntaxError: Unexpected token '{'
```

**人话原因：** 电脑读到这里看不懂了。`Unexpected token` 的意思是“遇到了一个不该出现的符号”。

**注意：报错的措辞不一定和你想的一样。**

你少了右括号，但它说“多了个 `{`”。**这不是它说错了，而是它读到 `name {` 的时候，发现这里应该先有一个 `)`，结果遇到 `{`，所以从它的角度看是 `{` 出现得不对。**

**这个例子很重要：报错说的“位置”和“符号”，未必是你真正要改的地方，要往前看一点。**

**`Syntax` 是什么：**
英文意思是“语法”。语法错 = 电脑根本读不懂这段话，连跑都跑不起来。

**为什么语法错要特别注意：**
它不会跑到一半才报错，而是**一启动就报**，因为连“翻译”都过不去。

**怎么修：**
看它说的行号，往前找括号、引号、逗号。**括号是最常见的。**

**快速自查法：**
在 Visual Studio Code 里点一下 `{`，它会自动高亮配对的 `}`。如果没高亮，就是没配上。

---

## 错误 3：`TypeError` —— 类型不对

**做坏的样子（`bug3.js`）：**

```javascript
const user = null;
console.log(user.name);
```

**报错：**

```text
TypeError: Cannot read properties of null (reading 'name')
```

**人话原因：** 你对一个“空的”东西去取属性。

**`Type` 是什么：**
“类型”。`null` 表示“什么都没有”。你对着“什么都没有”要 `.name`，当然取不到。

**三种常见触发：**

1. 数据没查出来是 `null`，你却直接 `.name`；
2. 数组越界：`arr[10]` 但只有 3 个元素，得到 `undefined`，再取属性就报错；
3. 函数没返回值你却当对象用。

**怎么修：**

```javascript
const user = null;
console.log(user?.name);  // 用 ?. 安全取值，null 时返回 undefined 而不是崩
```

或者先判断：

```javascript
if (user) {
  console.log(user.name);
} else {
  console.log("没有用户");
}
```

**注意：** `?.` 只是让它不崩，但“没有用户”这个业务问题还在。**不崩 ≠ 处理对了。**

---

## 错误 4：`RangeError` —— 数值超出允许范围

**做坏的样子（`bug4.js`）：**

```javascript
const arr = new Array(-1);
```

**报错：**

```text
RangeError: Invalid array length
```

**人话原因：** 数组长度不能是负数。

**`Range` 是什么：**
“范围”。数值超出了允许的范围。

**三种常见触发：**

1. `new Array(-1)`：负数长度；
2. `(12345).toFixed(200)`：小数位数太大；
3. `arr.length = -5`。

**怎么修：**
检查数值来源。**特别注意：如果这个数值来自用户输入或计算结果，要用 `if` 拦住非法值。**

---

## 错误 5：`JSON.parse` 失败 —— 数据格式不对

**做坏的样子（`bug5.js`）：**

```javascript
const text = "{name: '小明'}";
const data = JSON.parse(text);
console.log(data);
```

**报错：**

```text
SyntaxError: Expected property name or '}' in JSON at position 1
```

**人话原因：** 这不是合法的 JSON。

**`JSON` 是什么：**
一种通用的数据格式，长得像 JavaScript 的对象，但**更严格**：

- 键必须用双引号 `"name"`，不能用单引号；
- 不能用尾逗号；
- 不能用单引号字符串。

**为什么这个错特别重要：**
因为你以后会大量处理接口返回的数据。接口给的应该是合法 JSON，但**如果接口报错，返回的可能是一段 HTML 错误页**，`JSON.parse` 就会报这个错。

**怎么修：**

```javascript
const text = '{"name": "小明"}';
const data = JSON.parse(text);
```

**处理外部数据时必须包起来：**

```javascript
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.log("数据格式不对：", error.message);
    return null;
  }
}
```

**这是 `try...catch` 的典型用法，第 5 步会专门讲。**

---

## 错误 6：`ERR_INVALID_ARG_TYPE` —— 参数类型不对

**做坏的样子（`bug6.js`）：**

```javascript
const path = require("path");
console.log(path.join(123));
```

**报错：**

```text
TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received type number (123)
```

**人话原因：** 这个函数要一个“路径字符串”，你给了数字。

**怎么读这种长报错：**
先看 `The "path" argument must be of type string`——这就是它想要什么。
再看 `Received type number (123)`——这就是你给了什么。

**这个模式非常好用：**

```text
expected: string  ← 它要的
received: number  ← 你给的
```

**怎么修：**

```javascript
path.join("abc", "def");
```

---

## 2.2 六个错一起对照

在 `errors.md` 里建这张表（先填你能填的）：

```markdown
| 编号 | 错误类型 | 一句话原因 | 第一眼看哪里 |
|---|---|---|---|
| 1 | ReferenceError | 名字没定义 | 变量名拼写、大小写 |
| 2 | SyntaxError | 语法不完整 | 括号、引号、逗号 |
| 3 | TypeError | 对空值取属性 | 数据是不是 null/undefined |
| 4 | RangeError | 数值超范围 | 数值来源是否合法 |
| 5 | JSON SyntaxError | 不是合法 JSON | 引号是双引号吗、有没有多余逗号 |
| 6 | ERR_INVALID_ARG_TYPE | 参数类型不对 | 它要什么类型，你给什么类型 |
```

---

# 第 3 步：学会读“报错链”（10 分钟）

## 3.1 什么叫报错链

有时候报错里会有 `Caused by` 或者多层 `at`。这表示**一个错引发了另一个错**。

## 3.2 一个真实例子：同样的错，原因可能不同

在 `bug5.js` 里把内容改成：

```javascript
const data = JSON.parse("");
```

运行。

**报错：**

```text
SyntaxError: Unexpected end of JSON input
```

**和原来的报错对比：**

| 输入 | 报错 |
|---|---|
| `"{name: '小明'}"` | `Expected property name or '}' in JSON at position 1` |
| `""` | `Unexpected end of JSON input` |

**两个都是 `SyntaxError`，但原因完全不同：**

- 第一个：有内容，但格式不对（用了单引号）；
- 第二个：根本没有内容。

**这个例子告诉我们：**
**不能只背“看到 SyntaxError 就改括号”。要读它到底在抱怨什么。**

## 3.3 读报错链的顺序

```text
1. 从上往下读，第一行通常是根因
2. 找第一个指向你自己文件的 at（不是 node:internal）
3. 看那个行号
4. 如果有多层 Caused by，从最下面一层往上看（最底层是最初的原因）
```

**注意最后一条：**
有些框架（比如数据库、网络请求）的报错，最底层才是真原因，上面几层都是“包装”。遇到这种就往下翻到底。

---

# 第 4 步：建立你自己的报错档案（15 分钟）

## 4.1 为什么要建档

因为**你会反复遇到同样的错**。第一次花 20 分钟搞懂，第二次应该 10 秒认出来。

## 4.2 建 errors.md

**操作：**

1. 在 `03-练习代码` 里新建 `errors.md`。
2. 把下面的模板粘进去。
3. 今天遇到过的错，全部填上。

```markdown
# 报错档案

> 规则：每遇到一个新报错，就在这里加一条。
> 下次遇到同类错误，先来这里搜关键词。

## 模板

### 错误：<报错类型>

- **第一次遇到**：日期
- **完整报错**：
  ```
  （原样粘贴，不要只贴最后一句）
  ```
- **出错位置**：文件:行:列
- **一句话原因**：
- **我当时怎么修的**：
- **以后怎么预防**：

---

## 已完成条目

### 错误：ReferenceError

- **第一次遇到**：
- **完整报错**：
- **出错位置**：
- **一句话原因**：
- **我当时怎么修的**：
- **以后怎么预防**：

### 错误：SyntaxError

- **第一次遇到**：
- **完整报错**：
- **出错位置**：
- **一句话原因**：
- **我当时怎么修的**：
- **以后怎么预防**：

### 错误：TypeError

- **第一次遇到**：
- **完整报错**：
- **出错位置**：
- **一句话原因**：
- **我当时怎么修的**：
- **以后怎么预防**：

### 错误：RangeError

- **第一次遇到**：
- **完整报错**：
- **出错位置**：
- **一句话原因**：
- **我当时怎么修的**：
- **以后怎么预防**：

### 错误：JSON 解析失败

- **第一次遇到**：
- **完整报错**：
- **出错位置**：
- **一句话原因**：
- **我当时怎么修的**：
- **以后怎么预防**：

### 错误：ERR_INVALID_ARG_TYPE

- **第一次遇到**：
- **完整报错**：
- **出错位置**：
- **一句话原因**：
- **我当时怎么修的**：
- **以后怎么预防**：
```

## 4.3 填写要求

**“完整报错”必须原样粘贴。**

不要写成“报了个 ReferenceError”。要贴完整的第一行加位置。

**为什么要这么严格：**
因为下一次你搜关键词 `not defined`，能一下就找到。写成“报错了”就搜不到。

---

# 第 5 步：学会用 try...catch 主动接住错误（15 分钟）

## 5.1 为什么需要它

前面六个错都是“程序崩了”。但在真实项目里，**有些错不能让它崩**。

比如：用户上传了一个损坏的图片文件，你的程序不应该整个挂掉，而应该提示“文件格式不对，请重新上传”。

## 5.2 try...catch 是什么

```javascript
try {
  // 这里放"可能出错"的代码
} catch (error) {
  // 出错时跳到这里
  // error 是一个对象，里面装着错误信息
}
```

**用话读：**

> 试着执行 `try` 里的代码。如果出错了，不要崩，跳到 `catch` 里处理。

## 5.3 做一个练习

**新建 `safe.js`（自己敲）：**

```javascript
function safeParse(text) {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

console.log(safeParse('{"name": "小明"}'));
console.log(safeParse("{name: '小明'}"));
console.log(safeParse(""));
console.log(safeParse(null));
```

**敲的时候注意这两行：**

- `try { ... }` 和 `catch (error) { ... }` 各有一对花括号；
- `safeParse('{"name": "小明"}')` 外面是单引号，里面是双引号。**这是故意的**，因为 JSON 要求键必须用双引号。

**运行，你会看到：**

```text
{ ok: true, data: { name: '小明' } }
{
  ok: false,
  message: "Expected property name or '}' in JSON at position 1 (line 1 column 2)"
}
{ ok: false, message: 'Unexpected end of JSON input' }
{ ok: true, data: null }
```

**注意最后一个：** `safeParse(null)` 返回了 `ok: true, data: null`。

**为什么？**
因为 `JSON.parse(null)` 会把 `null` 先转成字符串 `"null"`，而 `"null"` 正好是合法 JSON（表示空值），所以解析成功，结果是 `null`。

**这说明一个坑：** `ok: true` 只表示“解析没报错”，不表示“数据有用”。调用方还要自己判断 `data` 是不是 `null`。

**关键观察：**

- 程序**没有崩**；
- 四个输入都返回了结果；
- `ok` 明确告诉调用方“成功了还是失败了”。

## 5.4 为什么返回 `{ ok, data }` 而不只是 `null`

因为 `null` 有歧义：是“失败了”还是“数据本身就是 null”？

返回一个带 `ok` 标志的对象，调用方能明确判断。**这是工程上的常见写法。**

## 5.5 try...catch 的三个误区

### 误区一：把整个程序包进 try

```javascript
try {
  // 500 行代码
} catch (error) {
  console.log("出错了");
}
```

**为什么不行：**
你根本不知道哪一行错了。而且 `catch` 里只说“出错了”，等于什么都没说。

**正确做法：** 只包围“可能出错的、范围小的”那几行。

### 误区二：catch 里什么都不做

```javascript
try {
  doSomething();
} catch (error) {
  // 空着
}
```

**为什么不行：**
错误被吞掉了。程序看着正常，实际数据可能已经错了。这是最危险的做法。

**正确做法：** 至少记录，最好返回明确的状态。

### 误区三：用 try...catch 掩盖逻辑错误

```javascript
try {
  const user = getUser();
  console.log(user.name);
} catch (error) {
  console.log("没有用户");
}
```

**为什么不行：**
`user` 是 `null`，本来就是代码该判断的情况，不该靠报错来发现。

**正确做法：**

```javascript
const user = getUser();
if (!user) {
  console.log("没有用户");
  return;
}
console.log(user.name);
```

**记住这句话：**

> `try...catch` 用来接住“预料之外”的错，不用来替代正常的 `if` 判断。

## 5.6 把三个误区写进笔记

在 `NOTES.md` 里：

```text
误区一：把整个程序包进 try → 不知道哪行错了
误区二：catch 里空着 → 错误被吞掉
误区三：用 try 代替 if → 掩盖真正的逻辑问题
```

---

# 第 6 步：怎么把报错拿去问（10 分钟）

## 6.1 三种问法，效果差 10 倍

### 问法一（最没用）

```text
我的代码报错了，怎么办？
```

**为什么没用：**
没有错误信息，没有代码，它只能猜。

### 问法二（好一点）

```text
我的代码报了 ReferenceError，怎么办？
```

**为什么还不够：**
`ReferenceError` 有很多种原因。它只能给你一堆可能性。

### 问法三（最有效）

```text
我运行 bug1.js 时出现这个错误：

ReferenceError: name is not defined
    at Object.<anonymous> (B:\...\bug1.js:1:13)

出错的这一行是：
console.log(name);

我想让程序打印出用户名。
请告诉我：
1. 这个错误是什么原因
2. 只改这一行的话，应该怎么改
3. 改完应该看到什么输出
```

**为什么有效：**

- 有完整报错；
- 有出错的那一行代码；
- 有业务意图（我想打印用户名）；
- 有明确的问题清单。

## 6.2 提问模板（背下来）

```text
我运行 <文件名> 时出现这个错误：

<完整报错，从第一行到位置那行>

出错的代码是：
<贴出错位置附近的 3-5 行>

我原本想做的事是：
<一句话说清业务意图>

请告诉我：
1. 原因是什么
2. 最小改法是什么（只改必要的行）
3. 改完应该看到什么结果
```

## 6.3 一个关键附加要求

在模板最后加这一句：

```text
不要重写整个文件，只告诉我需要改哪一行、改成什么。
```

**为什么加这句：**
不然它会给你一个完全重写的新版本，你原来的代码可能还有别的东西被冲掉。

## 6.4 反例提醒

**不要这样问：**

```text
帮我看看哪里错了
（然后附上 500 行代码）
```

**为什么不行：**
它可能指出一个和你当前报错无关的地方。**范围太大，注意力就散了。**

---

# 第 7 步：故意做三个错，完整走一遍流程（15 分钟）

## 7.1 任务说明

下面三个错误，每个都要走完整流程：

```text
① 制造错误 → ② 复制完整报错 → ③ 自己判断类型和位置
→ ④ 自己先尝试修 → ⑤ 修不好再按模板问 → ⑥ 记录到档案
```

**关键：第 ④ 步必须自己先试。** 直接问，你永远学不会。

## 7.2 错误 A：拼写错误

**在 `bug1.js` 里改成：**

```javascript
const userName = "小明";
console.log(usernName);
```

**你的判断：**

- 类型：____
- 位置：____
- 原因：____
- 你的修法：____

## 7.3 错误 B：括号不配对

**在 `bug2.js` 里改成：**

```javascript
function add(a, b) {
  return a + b;
}

console.log(add(1, 2);
```

**注意最后一行少了一个右括号。**

**你的判断：**

- 类型：____
- 位置：____
- 原因：____
- 你的修法：____

## 7.4 错误 C：对 undefined 取属性

**在 `bug3.js` 里改成：**

```javascript
const users = [{ name: "小明" }];
console.log(users[3].name);
```

**你的判断：**

- 类型：____
- 位置：____
- 原因：____（提示：`users[3]` 是什么？）
- 你的修法：____

## 7.5 三个都记进 errors.md

每个都要填：完整报错、位置、原因、修法、以后怎么预防。

---

# 第 8 步：写学习笔记（10 分钟）

```markdown
# 第 4 节课学习笔记

## 一、报错三块

1. 类型：看第一行第一个词
2. 消息：看第一行冒号后面
3. 位置：看第一行括号里的 文件:行:列

## 二、六种错误类型

| 类型 | 一句话原因 | 我遇到的实际情况 |
|---|---|---|
| ReferenceError | | |
| SyntaxError | | |
| TypeError | | |
| RangeError | | |
| JSON 解析失败 | | |
| ERR_INVALID_ARG_TYPE | | |

## 三、try...catch 三个误区

1.
2.
3.

## 四、提问模板的五个部分

1. 文件名
2. 
3. 
4. 
5. 

## 五、我今天自己修好的错误

（列出不看答案、自己修好的，写清当时怎么想的）

## 六、我还不懂的词

- 

## 七、完成检查

- [ ] 我能从报错第一行读出类型、消息、位置
- [ ] 我做出了六种不同的报错
- [ ] 我建了 errors.md 并填了至少 3 条
- [ ] 我能说出 try...catch 的三个误区
- [ ] 我会用提问模板描述报错
- [ ] 我至少自己修好了 3 个错
```

---

# 第 9 步：课后练习

## 练习一：读一段不属于你的报错

下面是一段别人遇到的报错，你没有代码。仅从报错本身，你能推断出什么？

```text
TypeError: Cannot read properties of undefined (reading 'length')
    at calculateTotal (B:\app\order.js:42:18)
    at main (B:\app\index.js:15:3)
```

写出：

1. 哪个文件哪一行最先出错？
2. 它想读什么属性？
3. 那个对象是什么状态？
4. 可能是哪种情况导致的？（至少写 2 种）
5. 你会先看哪一行代码？

## 练习二：给 try...catch 加日志

改造 `safe.js`，让它在 `catch` 里除了返回 `message`，还记录：

- 出错的原始输入（截断到前 50 个字符）；
- 出错时间。

提示：用 `new Date().toISOString()` 拿时间。

## 练习三：用自己的话讲

```text
为什么不能把整个程序包进 try？
为什么 catch 里不能空着？
为什么问 AI 报错要贴完整信息？
```

---

# 第 10 步：最终验收

## A. 读报错

- [ ] 我能从第一行读出错误类型
- [ ] 我能读出错误消息
- [ ] 我能找到 `文件:行:列`
- [ ] 我知道后面的 `at node:internal` 不用管

## B. 六种错误

- [ ] 我亲手制造过 `ReferenceError`
- [ ] 我亲手制造过 `SyntaxError`
- [ ] 我亲手制造过 `TypeError`
- [ ] 我亲手制造过 `RangeError`
- [ ] 我亲手制造过 JSON 解析失败
- [ ] 我亲手制造过 `ERR_INVALID_ARG_TYPE`
- [ ] 每种我都能说出“第一眼看哪里”

## C. 工具

- [ ] 我建了 `errors.md`，至少 3 条完整记录
- [ ] 我会写 `try...catch` 并返回明确状态
- [ ] 我能说出三个误区
- [ ] 我会用提问模板描述报错

## D. 独立修复

- [ ] 我至少自己修好了 3 个错（没问 AI）
- [ ] 修的时候我是按“类型→消息→位置”的顺序找的

## 本节课要能说出口的一句话

> **报错不是让我重写，是告诉我哪一行不符合规则。先读第一行，再找自己的文件。**

---

# 附：常见问题速查

| 报错关键词 | 大概率原因 | 第一件事 |
|---|---|---|
| `is not defined` | 名字没用/拼错/大小写错 | 检查定义和拼写 |
| `missing ) after argument list` | 括号没配平 | 点 `{` 看是否高亮配对 |
| `Unexpected token` | 多了或少了符号 | 看指出的位置前后 |
| `Cannot read properties of null` | 数据是 null 还取属性 | 用 `if` 先判断或 `?.` |
| `Cannot read properties of undefined` | 索引越界或函数没返回 | 检查数组长度、函数 return |
| `Invalid array length` | 数组长度非法 | 检查数值来源 |
| `Expected property name` | JSON 用了单引号或裸键 | JSON 键和字符串都用双引号 |
| `Unexpected end of JSON input` | JSON 是空的或被截断 | 先打印原文本看是什么 |
| `ERR_INVALID_ARG_TYPE` | 参数类型不对 | 看 expected 和 received |
| `Maximum call stack size exceeded` | 递归没停 | 检查递归出口 |
| 报错里全是 `node:internal` | 没有指向你的文件 | 往上翻找第一个你的文件路径 |
| 改了代码报错没变 | 没保存或跑的旧文件 | 确认标题栏无圆点、路径正确 |
