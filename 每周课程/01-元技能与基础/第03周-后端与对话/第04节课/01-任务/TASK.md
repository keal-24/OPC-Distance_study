# 第 18 节课：让页面和服务器说上话——静态文件与 fetch

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前两节课你一直在用 curl 和浏览器地址栏测服务器。**但真正的网站，是页面自己去请求服务器。**
> 这节课把第 2 周的页面接到第 3 周的服务器上，**让它们真的对话。**

**建议用时**：120 分钟
**你需要先完成**：第 17 节课（有 Express 项目）

---

# 第 0 步：为什么页面和服务器要分开（5 分钟）

## 0.1 现在的状况

```text
第 2 周的页面      → 在浏览器里打开，纯静态，不能存数据
第 3 周的服务器    → 能处理数据，但没有界面
```

**两者没连起来。**

## 0.2 真实网站的结构

```text
浏览器                         服务器
┌──────────────┐              ┌──────────────┐
│ index.html   │  ─请求──>     │ /api/xxx     │
│ style.css    │  <──JSON──    │ 查/存数据     │
│ main.js      │              │              │
└──────────────┘              └──────────────┘
```

**分工：**

| 浏览器端（前端） | 服务器端（后端） |
|---|---|
| 显示界面 | 存数据 |
| 收集用户输入 | 校验数据 |
| 发请求 | 返回结果 |
| 渲染结果 | 不做界面 |

**关键理解：**

```text
浏览器 = 显示和交互
服务器 = 数据和规则
```

## 0.3 两个必须分清的概念

### 静态文件

**HTML、CSS、JS、图片。** 内容写死在文件里，服务器原样发出去。

**特点：** 谁来访问都一样，跟用户没关系。

### 接口（API）

**服务器根据请求，动态算出一个结果返回。**

**特点：** 每次可能不一样，跟参数、用户、时间有关。

**一个网站通常两者都有：**

```text
/                 → 静态 index.html
/style.css        → 静态 CSS
/api/users        → 接口，返回 JSON
```

## 0.4 今天的交付物

| 文件/目录 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `public/index.html` | `03-练习代码/chat-app` | 前端页面 |
| `public/main.js` | `03-练习代码/chat-app` | 前端请求逻辑 |
| `src/app.js` | `03-练习代码/chat-app` | 服务器 + 接口 |

---

# 第 1 步：搭好项目骨架（15 分钟）

## 1.1 建目录

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第03周-后端与对话\第04节课\03-练习代码
   ```

2. 新建文件夹 `chat-app`，进去。
3. 在里面新建两个文件夹：`src` 和 `public`。

**结构：**

```text
chat-app/
├── src/        ← 服务器代码
└── public/     ← 浏览器能直接访问的文件
```

**为什么要叫 `public`：**
这是约定俗成的名字。**放在这里的文件会被"原样暴露"给任何访问者。** 名字本身就在提醒你：**这里的东西都是公开的。**

## 1.2 初始化项目

**在 `chat-app` 里打开终端（地址栏输入 `cmd`），然后：**

```text
npm init -y
npm install express
```

**改 `package.json`：**

```json
{
  "name": "chat-app",
  "version": "1.0.0",
  "description": "第18节课练习：前端页面与后端接口通信",
  "type": "module",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js"
  },
  "dependencies": {
    "express": "^4.22.3"
  },
  "license": "ISC"
}
```

**注意 `dependencies` 里的版本号要和你实际装的一致。** 不要照抄我的，看你自己 `npm install` 之后的样子。

## 1.3 建 `.gitignore`

```text
node_modules/
.env
*.log
.DS_Store
```

---

# 第 2 步：让 Express 提供静态文件（20 分钟）

## 2.1 写 `src/app.js`

**自己敲：**

```javascript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 静态文件：把 public 目录暴露出去
app.use(express.static(path.join(__dirname, "..", "public")));

// 接口
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`已启动：http://localhost:${PORT}`);
});
```

## 2.2 逐行读懂

### 为什么需要 `__dirname`

**这一段是最让人困惑的地方，必须讲清楚。**

```javascript
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

**问题背景：**

**CommonJS 里有 `__dirname`（当前文件所在目录），但 ES Module 里没有。**

**为什么没有：**
因为 ES Module 设计时考虑浏览器环境，浏览器里没有"文件目录"这个概念。

**所以 ESM 里要自己算出来：**

| 步骤 | 得到什么 |
|---|---|
| `import.meta.url` | `file:///B:/.../src/app.js` |
| `fileURLToPath(...)` | `B:\...\src\app.js` |
| `path.dirname(...)` | `B:\...\src` |

**三步拼起来，就装作有了 `__dirname`。**

> **如果你觉得这段太绕：** 是的，确实绕。这是 Node 从 CommonJS 过渡到 ESM 时期的历史包袱。**这段代码背下来就行，每个 ESM 项目都这么写。**

**`import.meta.url` 是什么：** 当前模块的完整 URL。

**为什么不能直接用相对路径：**

**看这个写法：**

```javascript
app.use(express.static("public"));
```

**它其实也能工作，但有个隐患：** 它相对于"启动 Node 时的当前目录"。

**如果你在别的目录启动：**

```text
cd ..
node chat-app/src/app.js
```

**`"public"` 就变成 `../public`，找不到了。**

**用 `__dirname` 拼出来的绝对路径，不管从哪启动都对。** 这是生产环境的做法。

### `path.join(__dirname, "..", "public")`

```javascript
path.join(__dirname, "..", "public")
```

**`__dirname` 是 `B:\...\chat-app\src`。**

**`".."` 是上一级，得到 `B:\...\chat-app`。**

**再拼 `"public"`，得到 `B:\...\chat-app\public`。**

**为什么不直接写 `__dirname + "/public"`：**
因为 Windows 用 `\`，Linux 用 `/`。**`path.join` 会自动用对的分隔符。** 这样代码在两种系统上都能跑。

**这是"跨平台"的基本功。**

### `express.static(...)`

```javascript
app.use(express.static(path.join(__dirname, "..", "public")));
```

**做了什么：**

1. 收到请求时，先看 `public` 目录里有没有对应的文件；
2. 有就原样返回（自动设置正确的 `Content-Type`）；
3. 没有就 `next()`，继续走后面的路由。

**自动处理的细节：**

| 请求 | 返回 | Content-Type |
|---|---|---|
| `/` | `public/index.html` | `text/html` |
| `/style.css` | `public/style.css` | `text/css` |
| `/main.js` | `public/main.js` | `text/javascript` |
| `/logo.png` | `public/logo.png` | `image/png` |

**注意第一行：访问 `/` 会自动返回 `index.html`。** 这是 `express.static` 的默认行为（叫 `index` 选项）。

## 2.3 写一个测试页面

**新建 `public/index.html`，自己敲：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>连接测试</title>
  <style>
    body {
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      max-width: 560px;
      margin: 40px auto;
      padding: 0 16px;
      color: #333;
      line-height: 1.7;
    }
    button {
      padding: 10px 20px;
      font-size: 15px;
      font-family: inherit;
      color: #fff;
      background: #1a73e8;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    pre {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 13px;
    }
  </style>
</head>
<body>

  <h1>连接测试</h1>
  <p>点下面按钮，让页面去问服务器要数据。</p>

  <p><button type="button" id="pingBtn">问服务器：你在吗？</button></p>

  <pre id="output">还没有请求</pre>

  <script src="main.js"></script>
</body>
</html>
```

**注意 `<script src="main.js">` —— 是 `main.js`，不是 `./public/main.js`。**

**为什么：**
因为从浏览器的角度看，它访问的是 `http://localhost:3000/main.js`。**`public` 这个目录名在 URL 里是看不到的。**

**这一点很关键：**

```text
磁盘上的路径：public/main.js
浏览器访问的：/main.js
```

**`express.static` 就是把 `public` 这个前缀去掉了。**

## 2.4 写 `public/main.js`

**自己敲：**

```javascript
const pingBtn = document.querySelector("#pingBtn");
const output = document.querySelector("#output");

pingBtn.addEventListener("click", async () => {
  output.textContent = "请求中……";

  try {
    const response = await fetch("/api/ping");
    const data = await response.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent = `出错了：${error.message}`;
  }
});
```

## 2.5 启动并测试

**运行：**

```text
npm run dev
```

**打开 `http://localhost:3000`。**

**点按钮。**

**应该看到：**

```json
{
  "ok": true,
  "time": "2026-11-16T07:30:00.000Z"
}
```

**再点一次：时间变了。** 说明真的在请求服务器。

## 2.6 `fetch` 是什么

**`fetch` 是浏览器内置的"发 HTTP 请求"的函数。**

**基本写法：**

```javascript
const response = await fetch("/api/ping");
const data = await response.json();
```

**三步：**

1. `fetch(地址)` —— 发请求，返回一个 Promise；
2. `await` —— 等响应回来；
3. `response.json()` —— 把响应体解析成对象（**也是一个 Promise，也要 await**）。

**`async` 和 `await` 是什么：**
让"等异步操作"看起来像同步代码。**这是第 4 周的核心内容**，今天先会用一个固定套路。

**最基础的模板（背下来）：**

```javascript
const response = await fetch("/接口地址");
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}
const data = await response.json();
```

**注意：`fetch` 不会因为 404 或 500 而"失败"。**

**这很反直觉，但必须记住：**

```javascript
const r = await fetch("/api/不存在");   // 不会抛错
console.log(r.ok);        // false
console.log(r.status);    // 404
```

**`fetch` 只有在"网络断了"、"域名解析失败"这种时候才抛错。**

**所以必须自己判断 `response.ok`。**

**`response.ok` 是什么：** 状态码在 200-299 之间时为 `true`。

**不判断会怎样：**
拿到 404 的响应，然后 `response.json()` 解析一段 HTML 错误页，报一个莫名其妙的 `Unexpected token '<'`。

**这是第 2 周第 11 节课学过的"JSON 解析失败"的经典场景。**

---

# 第 3 步：POST 请求——页面把数据发给服务器（25 分钟）

## 3.1 GET 和 POST 的区别（回顾 + 深入）

| | GET | POST |
|---|---|---|
| 用途 | 获取数据 | 提交数据 |
| 参数在哪 | URL（`?a=1`） | 请求体 |
| 长度限制 | 有（URL 长度限制） | 基本没有 |
| 能否缓存 | 能 | 不能 |
| 幂等（重复执行结果一样吗） | 是 | 否 |
| 浏览器后退 | 安全 | 会提示"重新提交" |

**"幂等"是什么意思：**
执行一次和执行十次，结果一样。

```text
GET /api/users/1     执行 10 次，还是那一个用户 → 幂等
POST /api/messages   执行 10 次，会多 10 条消息 → 不幂等
```

**为什么这个区别重要：**
因为**浏览器、爬虫、CDN 都可能重复发 GET 请求**。**所以 GET 绝对不能用来改数据。**

**这是 HTTP 的基本约定。违反了会导致非常难查的 bug。**

## 3.2 加一个 POST 接口

**在 `src/app.js` 里加（注意 `express.json()` 必须在路由之前）：**

```javascript
app.use(express.json());

app.post("/api/echo", (req, res) => {
  const { message } = req.body || {};

  if (typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "message 必填，且必须是非空字符串" });
    return;
  }

  res.json({
    ok: true,
    youSaid: message.trim(),
    length: message.trim().length,
    serverTime: new Date().toISOString(),
  });
});
```

## 3.3 前端发 POST

**在 `public/index.html` 里加一块：**

```html
<h2>发一条消息</h2>
<p>
  <input type="text" id="msgInput" placeholder="随便写点什么" maxlength="100">
  <button type="button" id="sendBtn">发送</button>
</p>
<pre id="echoOutput">还没有发送</pre>
```

**在 `public/main.js` 里加：**

```javascript
const msgInput = document.querySelector("#msgInput");
const sendBtn = document.querySelector("#sendBtn");
const echoOutput = document.querySelector("#echoOutput");

sendBtn.addEventListener("click", async () => {
  const message = msgInput.value.trim();

  if (message === "") {
    echoOutput.textContent = "请先输入内容";
    return;
  }

  echoOutput.textContent = "发送中……";

  try {
    const response = await fetch("/api/echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();

    if (!response.ok) {
      echoOutput.textContent = `服务器说：${data.error || "未知错误"}`;
      return;
    }

    echoOutput.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    echoOutput.textContent = `出错了：${error.message}`;
  }
});
```

## 3.4 POST 请求的三个必须项

```javascript
{
  method: "POST",                              // ① 方法
  headers: { "Content-Type": "application/json" },  // ② 内容类型
  body: JSON.stringify({ message })            // ③ 请求体
}
```

**少任何一个都会出问题，逐个说：**

### 少了 `method`

**默认是 GET。** 服务器收到 GET 请求，但你的路由是 `app.post`，**匹配不上，返回 404。**

**你会以为"接口写错了"，其实是方法错了。**

### 少了 `Content-Type`

**`express.json()` 会检查这个头，不是 `application/json` 就跳过不解析。**

**结果：`req.body` 是 `undefined`（Express 4 里是 `{}`）。**

**你会看到类似 `{"error":"message 必填"}`，但明明传了。**

**这个坑非常难查**，因为请求确实发出去了，数据确实在那儿，只是没被解析。

### 少了 `JSON.stringify`

**`body` 必须是一个字符串**（或 FormData、Blob）。

**直接传对象会怎样：**

```javascript
body: { message: "hi" }    // ❌
```

**浏览器会把它转成 `"[object Object]"`，服务器收到的就是这串字。**

**然后 `JSON.parse("[object Object]")` 失败，`express.json()` 直接返回 400。**

**规则：`body` 必须是字符串，用 `JSON.stringify` 转。**

## 3.5 完整的 `public/main.js`

**自己敲（整理过的版本）：**

```javascript
const output = document.querySelector("#output");
const pingBtn = document.querySelector("#pingBtn");
const msgInput = document.querySelector("#msgInput");
const sendBtn = document.querySelector("#sendBtn");
const echoOutput = document.querySelector("#echoOutput");

// GET 请求
pingBtn.addEventListener("click", async () => {
  output.textContent = "请求中……";

  try {
    const response = await fetch("/api/ping");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent = `出错了：${error.message}`;
  }
});

// POST 请求
sendBtn.addEventListener("click", async () => {
  const message = msgInput.value.trim();

  if (message === "") {
    echoOutput.textContent = "请先输入内容";
    return;
  }

  echoOutput.textContent = "发送中……";

  try {
    const response = await fetch("/api/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();

    if (!response.ok) {
      echoOutput.textContent = `服务器说：${data.error || "未知错误"}`;
      return;
    }

    echoOutput.textContent = JSON.stringify(data, null, 2);
    msgInput.value = "";
  } catch (error) {
    echoOutput.textContent = `出错了：${error.message}`;
  }
});
```

---

# 第 4 步：用浏览器开发者工具看请求（20 分钟）

## 4.1 这是最重要的调试技能

**很多"接口不对"的问题，看一眼网络面板就清楚了。**

## 4.2 打开网络面板

**操作：**

1. 在页面上按 `F12`；
2. 点"网络"（Network）标签；
3. 点一下按钮发请求；
4. 会看到一条记录，点它。

## 4.3 逐个标签看

### 标头（Headers）

**能看到：**

```text
请求 URL: http://localhost:3000/api/echo
请求方法: POST
状态代码: 200

请求头：
  Content-Type: application/json
  ...

响应头：
  Content-Type: application/json; charset=utf-8
  ...
```

**这里能验证三件事：**

- 方法对不对；
- `Content-Type` 有没有带；
- 状态码是多少。

### 载荷（Payload）

**能看到你发出去的内容：**

```json
{ "message": "你好" }
```

**如果这里显示 `[object Object]`**，说明你忘了 `JSON.stringify`。

**如果这里是空的**，说明 `body` 没传。

### 响应（Response）

**能看到服务器返回的内容。**

**如果返回的是 HTML 而不是 JSON**，说明请求打到了 404 兜底或某个中间件。

### 计时（Timing）

**能看到各阶段耗时。**

**如果"等待服务器响应"很长**，说明你的接口慢。

## 4.4 一个必须练的场景

**故意制造一个错，然后用网络面板找原因：**

**操作：**

1. 把 `main.js` 里的 `method: "POST"` 删掉；
2. 保存，刷新，点发送；
3. 按 `F12` 看网络面板。

**你会看到：**

```text
请求方法: GET
状态代码: 404
响应: {"error":"Not Found","path":"/api/echo"}
```

**看到了吗：方法变成了 GET，所以匹配不到 `app.post`。**

**如果没有网络面板，你会怎么猜？** 大概会以为是接口地址写错、服务器没启动、参数拼错……**要试很多次。**

**有了网络面板，一眼就看到原因。**

**记得改回来。**

## 4.5 三个必看的信号

```text
① 状态码不是 2xx → 服务器那边有问题
② 响应是 HTML → 打到了 404 兜底或错误页
③ 载荷是空的 → body 没传或没 stringify
```

**这三条能解决 80% 的"接口调不通"。**

---

# 第 5 步：做一个真正能用的功能（25 分钟）

## 5.1 目标：一个能存消息的留言板

**需求：**

```text
① 输入消息，点发送
② 消息存到服务器内存
③ 页面显示所有消息
④ 刷新页面后消息还在（因为存在服务器，不在页面）
```

**注意第 ④ 条：** 这是"服务器"和"页面变量"的本质区别。

## 5.2 后端：三个接口

**新建 `src/app.js`（完整版，自己敲）：**

```javascript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// 内存里的消息列表。重启服务器就没了。
const messages = [];
let nextId = 1;

// 健康检查
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 拿全部消息
app.get("/api/messages", (req, res) => {
  res.json({
    total: messages.length,
    items: messages,
  });
});

// 发一条消息
app.post("/api/messages", (req, res) => {
  const { text, author } = req.body || {};

  if (typeof text !== "string" || text.trim() === "") {
    res.status(400).json({ error: "text 必填，且必须是非空字符串" });
    return;
  }

  if (text.trim().length > 200) {
    res.status(400).json({ error: "text 最多 200 个字符" });
    return;
  }

  const item = {
    id: nextId++,
    text: text.trim(),
    author: typeof author === "string" && author.trim() !== "" ? author.trim() : "匿名",
    createdAt: new Date().toISOString(),
  };

  messages.push(item);

  res.status(201).json(item);
});

// 404 兜底
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error("捕获到错误：", err.message);
  res.status(500).json({ error: "服务器内部错误" });
});

app.listen(PORT, () => {
  console.log(`已启动：http://localhost:${PORT}`);
});
```

## 5.3 前端：`public/index.html`

**自己敲：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>留言板</title>
  <style>
    body {
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      max-width: 620px;
      margin: 40px auto;
      padding: 0 16px;
      color: #333;
      line-height: 1.7;
    }
    h1 { font-size: 26px; }
    .form-row { margin-bottom: 12px; }
    label {
      display: block;
      font-size: 14px;
      color: #666;
      margin-bottom: 6px;
    }
    input, textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      font-size: 15px;
      font-family: inherit;
      border: 1px solid #d0d0d0;
      border-radius: 6px;
      outline: none;
    }
    input:focus, textarea:focus {
      border-color: #1a73e8;
      box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
    }
    textarea { resize: vertical; min-height: 80px; }
    button {
      padding: 10px 20px;
      font-size: 15px;
      font-family: inherit;
      color: #fff;
      background: #1a73e8;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    button:disabled { background: #b0bec5; cursor: not-allowed; }
    .counter { font-size: 13px; color: #999; text-align: right; }
    .counter.warn { color: #e53935; }
    .status { font-size: 14px; margin: 12px 0; min-height: 20px; }
    .status.error { color: #c62828; }
    .status.ok { color: #2e7d32; }
    .msg-list { list-style: none; padding: 0; margin: 24px 0 0; }
    .msg-item {
      background: #f7f7f7;
      padding: 14px 16px;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .msg-meta {
      font-size: 13px;
      color: #888;
      margin-bottom: 6px;
    }
    .msg-text { white-space: pre-wrap; }
    .empty { color: #999; }
  </style>
</head>
<body>

  <h1>留言板</h1>
  <p>消息存在服务器里。刷新页面，消息还在；重启服务器，消息就没了。</p>

  <div class="form-row">
    <label for="author">你的名字（可不填）</label>
    <input type="text" id="author" placeholder="匿名" maxlength="20">
  </div>

  <div class="form-row">
    <label for="text">留言内容</label>
    <textarea id="text" placeholder="最多 200 字" maxlength="200" required></textarea>
    <div class="counter" id="counter">0 / 200</div>
  </div>

  <div class="form-row">
    <button type="button" id="sendBtn">发送</button>
  </div>

  <div class="status" id="status"></div>

  <h2>全部留言</h2>
  <ul class="msg-list" id="msgList"></ul>
  <p class="empty" id="empty">还没有留言</p>

  <script src="main.js"></script>
</body>
</html>
```

## 5.4 前端：`public/main.js`

**自己敲：**

```javascript
const authorInput = document.querySelector("#author");
const textInput = document.querySelector("#text");
const counter = document.querySelector("#counter");
const sendBtn = document.querySelector("#sendBtn");
const status = document.querySelector("#status");
const msgList = document.querySelector("#msgList");
const empty = document.querySelector("#empty");

const MAX_LEN = 200;

const setStatus = (message, type = "") => {
  status.textContent = message;
  status.className = `status ${type}`;
};

// 字数统计
const updateCounter = () => {
  const len = textInput.value.length;
  counter.textContent = `${len} / ${MAX_LEN}`;
  counter.classList.toggle("warn", len >= MAX_LEN * 0.9);
};

textInput.addEventListener("input", updateCounter);

// 渲染消息列表
const renderMessages = (items) => {
  msgList.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "msg-item";

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = `${item.author} · ${new Date(item.createdAt).toLocaleString("zh-CN")}`;

    const text = document.createElement("div");
    text.className = "msg-text";
    text.textContent = item.text;

    li.appendChild(meta);
    li.appendChild(text);
    msgList.appendChild(li);
  });

  empty.style.display = items.length === 0 ? "block" : "none";
};

// 拉取消息
const loadMessages = async () => {
  try {
    const response = await fetch("/api/messages");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderMessages(data.items);
  } catch (error) {
    setStatus(`加载失败：${error.message}`, "error");
  }
};

// 发送消息
sendBtn.addEventListener("click", async () => {
  const text = textInput.value.trim();
  const author = authorInput.value.trim();

  if (text === "") {
    setStatus("请先写点什么", "error");
    return;
  }

  sendBtn.disabled = true;
  setStatus("发送中……");

  try {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, author }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || "发送失败", "error");
      return;
    }

    textInput.value = "";
    updateCounter();
    setStatus("发送成功", "ok");
    await loadMessages();
  } catch (error) {
    setStatus(`网络出错：${error.message}`, "error");
  } finally {
    sendBtn.disabled = false;
  }
});

// 初始化
updateCounter();
loadMessages();
```

## 5.5 测试

**重启服务器，打开页面。**

**按顺序试：**

1. **直接看到"还没有留言"**（因为服务器里没数据）；
2. **写一条留言，点发送** → 状态显示"发送成功"，列表出现一条；
3. **刷新页面（F5）** → 留言还在！

**第 3 步是关键：** 消息不在页面里，在服务器里。**刷新不会丢。**

4. **重启服务器（`Ctrl + C` 再 `npm run dev`）**；
5. **刷新页面** → 留言没了。

**为什么会没：** 因为 `messages` 是内存里的数组，**服务器重启，内存清零。**

**这就是为什么需要数据库。** 第 19 节课会讲（但真正的数据库在第 5 周）。

## 5.6 逐段理解几个新东西

### `finally`

```javascript
try {
  ...
} catch (error) {
  ...
} finally {
  sendBtn.disabled = false;
}
```

**`finally` 里的代码，不管成功还是失败都会执行。**

**为什么需要：**
因为"恢复按钮"这件事必须做。**不加 `finally`，成功时忘了恢复，按钮就永远点不了了。**

**这个 bug 叫"按钮卡死"，很常见。**

### 按顺序 `await`

```javascript
textInput.value = "";
updateCounter();
setStatus("发送成功", "ok");
await loadMessages();
```

**为什么清空输入框在 `loadMessages` 之前：**
因为清空是"立刻做"（不需要等服务器），刷新列表要等。**先做快的，体验更好。**

### `msgList.innerHTML = ""`

```javascript
msgList.innerHTML = "";
```

**清空列表。**

**这里用 `innerHTML` 是安全的，因为赋的是空字符串，不涉及用户输入。**

**但下面这行必须用 `textContent`：**

```javascript
text.textContent = item.text;    // ✅
text.innerHTML = item.text;      // ❌ 用户输入会造成 XSS
```

**这是第 2 周第 12 节课学过的规则。** 在这里再强调一次：**渲染用户内容，只能用 `textContent`。**

### `white-space: pre-wrap`

```css
.msg-text { white-space: pre-wrap; }
```

**作用：保留用户输入里的换行和空格。**

**不加会怎样：**
用户在留言里换行，显示时全挤成一行。

**`pre-wrap` 和 `pre` 的区别：**

```text
pre       保留空格换行，但不会自动折行（长文本会溢出）
pre-wrap  保留空格换行，并且超出宽度会自动折行
```

**用 `pre-wrap`。**

---

# 第 6 步：故意犯六个错（20 分钟）

## 错误 1：`fetch` 没判断 `response.ok`

**操作：** 在 `loadMessages` 里删掉 `if (!response.ok) throw ...`。

**然后访问一个不存在的接口：把 `/api/messages` 改成 `/api/message`（少个 s）。**

**会怎样：** 页面报错 `Unexpected token '<'`。

**为什么：**
404 返回的是 HTML（`{"error":"Not Found"}` 是 JSON，但如果打到 Express 默认 404 就是 HTML），`response.json()` 解析 HTML 失败。

**规则：`fetch` 之后必须判断 `response.ok`。**

## 错误 2：忘了 `Content-Type`

**操作：**

```javascript
headers: { "Content-Type": "text/plain" },
```

**会怎样：** 服务器返回 400 `text 必填`。

**为什么：`express.json()` 只解析 `application/json` 的请求体。**

## 错误 3：忘了 `JSON.stringify`

**操作：**

```javascript
body: { text, author },
```

**会怎样：** 服务器返回 400，因为收到的 body 是 `"[object Object]"`，不是合法 JSON。

**怎么查：** 网络面板的"载荷"里显示 `[object Object]`。

## 错误 4：静态目录路径写错

**操作：**

```javascript
app.use(express.static("pulbic"));
```

（拼错了）

**会怎样：** 访问 `/` 返回 404，但 `/api/ping` 正常。

**为什么：**
静态文件全找不到，接口还能用。

**怎么查：**
**"页面 404 但接口正常" → 一定是静态目录的问题。**

## 错误 5：`<script>` 路径写错

**操作：** 把 `<script src="main.js">` 改成 `<script src="public/main.js">`。

**会怎样：** 控制台 404，所有按钮没反应。

**为什么：**
从浏览器角度，`public` 已经被 `express.static` 去掉了。

**正确：** `/main.js` 或 `main.js`。

**这个坑和第 2 周第 10 节课的 CSS 路径是同一类问题。**

## 错误 6：用了 `innerHTML` 渲染用户内容

**操作：**

```javascript
text.innerHTML = item.text;
```

**然后发一条留言：**

```html
<img src=x onerror="alert('XSS')">
```

**会怎样：** 弹出一个 `alert`。

**这说明：** 任何能往你页面里注入脚本的人，都能偷走用户的登录状态。

**修法：** `text.textContent = item.text;`

**这个实验一定要自己做。** 你会第一次亲眼看到 XSS。

## 六个错误总结

```text
不判 response.ok     → Unexpected token '<'
忘 Content-Type      → 服务器收不到 body
忘 JSON.stringify    → 收到 "[object Object]"
静态路径拼错         → 页面 404 但接口正常
script 路径错        → 控制台 404，按钮没反应
innerHTML 渲染输入   → XSS 弹窗
```

**排查顺序：**

```text
① F12 → 网络 → 看状态码
② 状态码 404 → 查路径（静态？接口？）
③ 状态码 400 → 查 body 和 Content-Type
④ 报 Unexpected token '<' → 响应不是 JSON，看 Raw
⑤ 按钮没反应 → 查控制台有没有 JS 报错
```

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 18 节课学习笔记

## 一、静态文件和接口的区别

| | 静态文件 | 接口 |
|---|---|---|
| 内容 | | |
| 谁生成 | | |
| 典型路径 | | |
| 浏览器怎么用 | | |

## 二、为什么需要 `__dirname`

ESM 里有 `__dirname` 吗：

三步怎么算出来：

```javascript
import.meta.url      →
fileURLToPath(...)   →
path.dirname(...)    →
```

为什么不用 `express.static("public")`：

## 三、`express.static` 做了什么

访问 `/` 时返回什么：

`public/main.js` 在浏览器里的路径是什么：

## 四、`fetch` 的基本模板

```javascript
（默写一遍完整模板，包含 ok 判断）
```

为什么必须判断 `response.ok`：

不判断会报什么错：

## 五、POST 请求的三个必须项

1.
2.
3.

少第一个会怎样：

少第二个会怎样：

少第三个会怎样：

## 六、网络面板能看什么

| 标签 | 能看什么 |
|---|---|
| 标头 | |
| 载荷 | |
| 响应 | |

我要找"方法对不对"看哪里：

我要找"body 传了什么"看哪里：

## 七、数据存在哪

消息存在服务器的什么里：

刷新页面为什么还在：

重启服务器为什么没了：

## 八、`finally` 的作用

不加会怎样：

## 九、六个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 不判 response.ok | | |
| 忘 Content-Type | | |
| 忘 JSON.stringify | | |
| 静态路径拼错 | | |
| script 路径错 | | |
| innerHTML 渲染 | | |

## 十、我做的 XSS 实验

我输入的内容：

发生了什么：

如果这是真实网站，攻击者能做什么：

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 页面能通过 `localhost:3000` 打开
- [ ] 静态文件（HTML/CSS/JS）能正常加载
- [ ] GET 接口能返回数据
- [ ] POST 接口能接收数据
- [ ] 我能用网络面板看请求和响应
- [ ] 留言发送后刷新页面还在
- [ ] 重启服务器后留言消失，我知道原因
- [ ] 我做过六个错误的实验
- [ ] 我亲眼看到过 XSS 弹窗
```

---

# 第 8 步：课后练习

## 练习一：加"删除"功能

**要求：**

1. 后端加 `DELETE /api/messages/:id`；
2. 每条留言后面加一个"删除"按钮；
3. 点击后调接口，然后刷新列表。

**提示：**

```javascript
await fetch(`/api/messages/${id}`, { method: "DELETE" });
```

**注意：** 删除是危险操作。**真实项目里删除需要权限验证。** 现在先不验证，但你要知道这是个缺口。

## 练习二：加"筛选"

**要求：**

1. 后端 `GET /api/messages?author=小明` 只返回小明的；
2. 前端加一个筛选输入框。

**提示：** 用 `req.query.author` 过滤数组。

## 练习三：做"加载中"状态

**要求：**

1. 请求发出后，按钮文字变成"发送中…"并禁用；
2. 完成后恢复。

**思考：** 如果用户网络很慢，他可能会点很多次。**禁用按钮解决了什么？**

## 练习四：找出这段代码的五个问题

```javascript
const r = await fetch("/api/data");
const data = await r.json();
console.log(data);

await fetch("/api/save", {
  method: "POST",
  body: { name: "x" },
});

document.querySelector("#out").innerHTML = data.text;
```

**提示方向：** 不判 ok、忘 Content-Type、忘 stringify、innerHTML、还有一处（`await` 之后没用返回值）。

## 练习五：用自己的话讲

```text
为什么 GET 不能用来改数据？
为什么 fetch 拿到 404 不会抛错？
为什么静态文件的 URL 里看不到 public？
为什么渲染用户内容必须用 textContent？
```

---

# 第 9 步：最终验收

## A. 项目结构

- [ ] `chat-app/` 存在，有 `src/` 和 `public/`
- [ ] `package.json` 有 `"type": "module"`
- [ ] `.gitignore` 忽略了 `node_modules`
- [ ] `npm run dev` 能启动

## B. 静态文件

- [ ] 访问 `/` 返回页面
- [ ] CSS 生效
- [ ] `main.js` 能加载（控制台无 404）
- [ ] 我知道 `public` 在 URL 里是看不到的

## C. 接口

- [ ] `GET /api/ping` 返回 JSON
- [ ] `GET /api/messages` 返回列表
- [ ] `POST /api/messages` 能新建并返回 201
- [ ] 空 text 返回 400
- [ ] 超长 text 返回 400
- [ ] 不存在的路径返回 404 JSON
- [ ] 有错误处理中间件（4 个参数）

## D. 前端

- [ ] 我用 `fetch` 发 GET
- [ ] 我用 `fetch` 发 POST 且写了 `method`、`headers`、`body`
- [ ] 我判断了 `response.ok`
- [ ] 我用 `try/catch/finally`
- [ ] 按钮在请求期间被禁用
- [ ] 我用 `textContent` 渲染用户内容
- [ ] 空列表时显示提示

## E. 调试

- [ ] 我会用网络面板看请求方法
- [ ] 我会看载荷确认 body
- [ ] 我会看响应确认返回类型
- [ ] 我知道"页面 404 但接口正常"是静态目录问题
- [ ] 我知道 `Unexpected token '<'` 说明响应不是 JSON

## F. 数据

- [ ] 刷新页面消息还在
- [ ] 重启服务器消息消失
- [ ] 我能解释这两个现象的原因

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有 XSS 实验记录
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **页面负责显示，服务器负责存数据；两者之间唯一的桥就是 fetch 发出的那一个请求。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 页面 404 但接口正常 | 静态目录路径错 | 检查 `express.static` 的参数 |
| 按钮没反应 | `main.js` 没加载 | 控制台看 404 |
| `Unexpected token '<'` | 响应是 HTML 不是 JSON | 先判断 `response.ok` |
| `req.body` 空 | 忘 `Content-Type` | 加 `application/json` |
| 收到 `[object Object]` | 忘 `JSON.stringify` | 包一层 |
| POST 返回 404 | `method` 没写，变成 GET | 加 `method: "POST"` |
| 按钮点一次就卡住 | 没在 `finally` 里恢复 | 加 `finally` |
| 留言换行丢失 | 缺 `white-space: pre-wrap` | 加上 |
| 页面弹 alert | XSS，用了 `innerHTML` | 改 `textContent` |
| `__dirname is not defined` | ESM 里没有 | 用 `fileURLToPath` 算 |
| 路径在不同系统上失效 | 硬编码了 `/` 或 `\` | 用 `path.join` |
| 刷新后数据没了 | 存在页面变量里 | 存到服务器 |
| 重启后数据没了 | 存在服务器内存里 | 需要数据库 |
