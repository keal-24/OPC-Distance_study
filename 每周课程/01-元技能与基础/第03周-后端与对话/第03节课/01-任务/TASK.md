# 第 17 节课：用 Express 管路由——告别一堆 if

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你用一堆 `if (url === "...")` 处理路由。加五个页面就要写五个 `if`，还要手动解析 `?a=1&b=2`。
> 这节课用 **Express** 把这件事变简单：**一行一个路由，参数自动解析。**

**建议用时**：110 分钟
**你需要先完成**：第 16 节课（有 `hello-server` 项目）

---

# 第 0 步：Express 解决了什么问题（5 分钟）

## 0.1 先看你现在的痛点

**上节课的 `routes.js`：**

```javascript
if (url === "/") { ... }
if (url === "/about") { ... }
if (url === "/api/info") { ... }
if (url === "/time") { ... }
sendHtml(res, 404, "...");
```

**三个问题：**

**问题一：加一个路由要加一个 `if`**

20 个页面就有 20 个 `if`，改起来像扫雷。

**问题二：拿参数要手动解析**

访问 `/calc?a=10&b=20`，你得自己切字符串、`decodeURIComponent`、转数字。

**问题三：处理 POST 数据要写流**

```javascript
let body = "";
req.on("data", (chunk) => { body += chunk; });
req.on("end", () => { ... });
```

**每个 POST 路由都要写一遍这段。**

## 0.2 Express 是什么

**一个 Node 的 Web 框架。** 把上面那些重复的事情都封好了。

**"框架"是什么：**
别人写好的一套代码。你按它的方式写，它帮你处理底层细节。

**对比：**

| 事情 | 原生 Node | Express |
|---|---|---|
| 定义路由 | `if (url === "/a")` | `app.get("/a", handler)` |
| 路径参数 | 手动切字符串 | `app.get("/user/:id")` + `req.params.id` |
| 查询参数 | 手动解析 | `req.query` |
| POST 数据 | 手动收流 | `express.json()` + `req.body` |
| 404 兜底 | 最后一个 `if` | `app.use(...)` |
| 错误处理 | 手动 try/catch | 专门的错误中间件 |

## 0.3 一个必须知道的现实

**Express 不是唯一选择。** 还有 Koa、Fastify、Hono、NestJS。

**为什么本课程选 Express：**

- 出现最早，文档和例子最多；
- AI 生成的 Node 代码大量用 Express；
- 概念最基础，学会了看别的框架很快。

**学会 Express 不代表只会 Express。** 路由、中间件、请求响应这套思路是通用的。

## 0.4 今天的交付物

| 文件/目录 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `express-server/` | `03-练习代码` | 新项目，用 Express 重写 |

---

# 第 1 步：新建项目并装 Express（15 分钟）

## 1.1 为什么新建项目，不在原项目上改

**因为要对比。**

**这一周结束时你会同时有两个版本：**

```text
hello-server/      原生 Node 版（第 16 节课）
express-server/    Express 版（这节课）
```

**对比着看，你才知道框架帮你做了什么。**

## 1.2 建目录和 package.json

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第03周-后端与对话\第03节课\03-练习代码
   ```

2. 新建文件夹 `express-server`，进去。
3. 在里面新建 `src` 文件夹。
4. 在 `express-server` 里打开终端（地址栏输入 `cmd`）。
5. 运行：

   ```text
   npm init -y
   ```

## 1.3 改成 ES Module 并加脚本

**打开 `package.json`，自己改成：**

```json
{
  "name": "express-server",
  "version": "1.0.0",
  "description": "第17节课练习：用 Express 重写路由",
  "type": "module",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js"
  },
  "license": "ISC"
}
```

## 1.4 装 Express

**在 `express-server` 目录里运行：**

```text
npm install express
```

**你会看到类似：**

```text
added 68 packages in 5s
```

**68 个包？我只装了一个 Express。**

**为什么：**
因为 Express 自己也依赖别的包。**这叫"传递依赖"。**

**你现在有 `node_modules` 了。** 打开看看：

```text
node_modules/
├── express/
├── body-parser/
├── cookie/
├── debug/
└── ...（几十个）
```

**这就是为什么 `node_modules` 绝对不能提交。** 68 个包上千个文件。

## 1.5 检查装了什么

**打开 `package.json`，会多出一段：**

```json
"dependencies": {
  "express": "^4.22.3"
}
```

**注意 `^` 这个符号。**

**`^4.22.3` 是什么意思：**

```text
允许安装 4.x.x 里 >= 4.22.3 的最新版
不允许升到 5.x.x
```

**为什么：**
因为 `5.0.0` 可能有破坏性改动。**`^` 保护你不被自动升级搞坏。**

**三种前缀的对比：**

| 写法 | 允许范围 |
|---|---|
| `4.22.3` | 只有这一个版本 |
| `^4.22.3` | `>=4.22.3 <5.0.0` |
| `~4.22.3` | `>=4.22.3 <4.23.0` |
| `*` | 任何版本（别用） |

**默认是 `^`，这是合理的。**

## 1.6 建 `.gitignore`

**和上节课一样，用 Visual Studio Code 新建 `.gitignore`：**

```text
node_modules/
.env
.env.local
*.log
.DS_Store
Thumbs.db
.vscode/
```

**这次特别注意 `node_modules/` —— 你现在真的有这个目录了。**

**验证：**

```text
git check-ignore -v node_modules
```

**应该输出类似：**

```text
.gitignore:1:node_modules/    node_modules
```

---

# 第 2 步：写第一个 Express 应用（20 分钟）

## 2.1 新建 `src/app.js`

**自己敲：**

```javascript
import express from "express";

const app = express();
const PORT = 3000;

// 让 Express 自动解析 JSON 请求体
app.use(express.json());

// 路由
app.get("/", (req, res) => {
  res.send("<h1>Express 版首页</h1><p>比原生简单多了</p>");
});

app.get("/about", (req, res) => {
  res.send("<h1>关于</h1>");
});

app.get("/api/info", (req, res) => {
  res.json({
    name: "Express 版",
    time: new Date().toISOString(),
  });
});

// 启动
app.listen(PORT, () => {
  console.log(`已启动：http://localhost:${PORT}`);
});
```

**保存，运行：**

```text
npm run dev
```

**应该看到：**

```text
已启动：http://localhost:3000
```

**访问 `http://localhost:3000`。**

## 2.2 对比原生写法

**同一个功能，两种写法：**

**原生 Node：**

```javascript
const url = req.url.split("?")[0];
if (url === "/") {
  sendHtml(res, 200, "<h1>首页</h1>");
  return;
}
```

**Express：**

```javascript
app.get("/", (req, res) => {
  res.send("<h1>首页</h1>");
});
```

**少了什么：**

- 不用手动判断 `req.method`（`app.get` 就是 GET）；
- 不用手动切 `?`（Express 帮你处理）；
- 不用写 `writeHead`；
- 不用写 `end`；
- 不用写 `return`（Express 不会往下走）。

**`res.send` 做了什么：**

1. 自动设置 `Content-Type`（根据内容判断是 HTML 还是文本）；
2. 自动设置 `charset=utf-8`；
3. 自动调用 `end`。

**这就是框架的价值：把你重复写的 8 行变成 1 行。**

## 2.3 `res.send` 和 `res.json`

```javascript
res.send("<h1>HTML</h1>");        // 自动判断是 HTML
res.send("纯文字");                // 自动判断是 text
res.json({ ok: true });           // 明确返回 JSON
```

**`res.json` 做了什么：**

1. 自动 `JSON.stringify`；
2. 设置 `Content-Type: application/json`；
3. 调用 `end`。

**如果用 `res.send(对象)` 会怎样：**
Express 也会自动转 JSON。**但用 `res.json` 更明确。**

**规则：** 返回 HTML/文本用 `res.send`，返回数据用 `res.json`。

## 2.4 试一下 `res.send` 传数字

**加一个路由：**

```javascript
app.get("/version", (req, res) => {
  res.send(1);
});
```

**访问 `/version`。**

**你会看到：** 返回 `1`（状态码可能是 200）。

**注意：Express 4 里 `res.send(数字)` 会被当成状态码。** 改成 `res.json(1)` 或 `res.send("1")` 更明确。

## 2.5 `app.use(express.json())` 是什么

```javascript
app.use(express.json());
```

**这一行让 `req.body` 可用。**

**试试不加会怎样：**

1. 先加一个 POST 路由（下一步会详细讲）：

   ```javascript
   app.post("/api/echo", (req, res) => {
     res.json({ received: req.body });
   });
   ```

2. **先注释掉 `app.use(express.json())`**；
3. 用 curl 发 POST：

   ```text
   curl -X POST http://localhost:3000/api/echo -H "Content-Type: application/json" -d "{\"msg\":\"hi\"}"
   ```

**你会看到：**

```json
{"received":null}
```

**`req.body` 是 `null`（或 `undefined`）。**

**为什么：**
因为 Express 默认**不解析**请求体。`express.json()` 这个"中间件"负责把 JSON 文本转成对象。

**必须加这一行，而且必须在路由之前。** （第 4 步讲"为什么要在之前"）

---

# 第 3 步：三种路由参数（25 分钟）

## 3.1 路径参数 `:id`

**用途：** 从地址本身取一段做参数。比如 `/users/42` 里的 `42`。

**加这个路由：**

```javascript
app.get("/users/:id", (req, res) => {
  res.json({
    id: req.params.id,
    message: `你在查看 ID 为 ${req.params.id} 的用户`,
  });
});
```

**测试：**

```text
curl http://localhost:3000/users/42
```

**应该返回：**

```json
{
  "id": "42",
  "message": "你在查看 ID 为 42 的用户"
}
```

**`req.params` 是什么：** 路径里 `:` 开头的那几段的集合。

**多个参数：**

```javascript
app.get("/users/:userId/posts/:postId", (req, res) => {
  res.json({
    userId: req.params.userId,
    postId: req.params.postId,
  });
});
```

**访问 `/users/7/posts/99`：**

```json
{"userId":"7","postId":"99"}
```

**重要：参数值永远是字符串**

```javascript
app.get("/num/:n", (req, res) => {
  const n = req.params.n;
  res.json({
    value: n,
    type: typeof n,
    doubled: n * 2,
  });
});
```

**访问 `/num/5`：**

```json
{"value":"5","type":"string","doubled":10}
```

**注意 `doubled` 是 10**（因为 `"5" * 2` 会自动转数字），**但 `type` 是 `"string"`。**

**规则：`req.params` 的值永远是字符串，要算数必须自己转。**

## 3.2 查询参数 `req.query`

**用途：** 地址里 `?` 后面的部分。比如 `/search?q=hello&page=2`。

**加路由：**

```javascript
app.get("/search", (req, res) => {
  res.json({
    query: req.query,
    keyword: req.query.q || null,
    page: Number(req.query.page) || 1,
  });
});
```

**测试：**

```text
curl "http://localhost:3000/search?q=hello&page=2"
```

**应该返回：**

```json
{
  "query": { "q": "hello", "page": "2" },
  "keyword": "hello",
  "page": 2
}
```

**对比原生 Node：**

**原生要这样：**

```javascript
const urlObj = new URL(req.url, "http://localhost");
const q = urlObj.searchParams.get("q");
const page = urlObj.searchParams.get("page");
```

**Express 一行搞定：`req.query.q`。**

**注意 `|| null` 这种写法：**

```javascript
keyword: req.query.q || null
```

**如果 `q` 不存在：** `req.query.q` 是 `undefined`，`undefined || null` 得到 `null`。

**如果 `q` 是空字符串：** `"" || null` 也得到 `null`。

**这个行为要注意：** 空字符串会被当成"没有"。**大多数情况下是想要的，但偶尔会让你困惑。**

## 3.3 `req.params` 和 `req.query` 的区别

| | `req.params` | `req.query` |
|---|---|---|
| 在 URL 里的位置 | 路径中间 | `?` 后面 |
| 例子 | `/users/42` | `/search?q=hello` |
| 取法 | `req.params.id` | `req.query.q` |
| 类型 | 字符串 | 字符串或数组 |
| 什么时候用 | 标识"哪个东西" | 筛选、分页、搜索 |
| 是否必填 | 是（路由规则决定了必须有） | 否（可以有可以没有） |

**判断规则：**

```text
指向"一个具体的东西" → 路径参数  /users/42、/posts/99
影响"怎么筛选"       → 查询参数  /list?page=2&sort=date
```

## 3.4 一个实际例子：分页列表

```javascript
const USERS = [
  { id: 1, name: "小明" },
  { id: 2, name: "小红" },
  { id: 3, name: "小刚" },
  { id: 4, name: "小美" },
  { id: 5, name: "小强" },
];

app.get("/api/users", (req, res) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 2;

  const start = (page - 1) * size;
  const items = USERS.slice(start, start + size);

  res.json({
    page,
    size,
    total: USERS.length,
    totalPages: Math.ceil(USERS.length / size),
    items,
  });
});

app.get("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = USERS.find((u) => u.id === id);

  if (!user) {
    res.status(404).json({ error: "用户不存在" });
    return;
  }

  res.json(user);
});
```

**测试：**

```text
curl "http://localhost:3000/api/users?page=1&size=2"
curl "http://localhost:3000/api/users?page=3&size=2"
curl http://localhost:3000/api/users/3
curl http://localhost:3000/api/users/99
```

**最后一个应该返回 404 + `{"error":"用户不存在"}`。**

**注意 `res.status(404).json(...)` 这个链式写法：**

```javascript
res.status(404).json({ error: "..." });
```

**`res.status()` 返回 `res` 本身，所以可以接着调 `.json()`。**

**这个模式在 Express 里很常见。**

## 3.5 路径参数的顺序很重要

**做这个实验：**

```javascript
app.get("/api/users/:id", (req, res) => {
  res.json({ type: "带 id 的", id: req.params.id });
});

app.get("/api/users/list", (req, res) => {
  res.json({ type: "列表" });
});
```

**访问 `/api/users/list`。**

**你会看到：** `{"type":"带 id 的","id":"list"}`

**为什么：** 因为 Express 按**定义顺序**匹配。`/api/users/:id` 先定义，`/api/users/list` 就被它吃掉了。

**修法：把更具体的路由放前面。**

```javascript
app.get("/api/users/list", ...);   // 先
app.get("/api/users/:id", ...);    // 后
```

**规则（记住）：**

```text
固定路径 放在 参数路径 前面。
```

**这个坑在真实项目里非常常见**，尤其是 `/users/me`（当前用户）和 `/users/:id` 同时存在时。

---

# 第 4 步：中间件——Express 最核心的概念（25 分钟）

## 4.1 什么是中间件

**中间件 = 在请求到达路由之前，先经过的一层处理。**

**用安检比喻：**

```text
旅客（请求）
  ↓
安检 1（检查证件）   ← 中间件
  ↓
安检 2（检查行李）   ← 中间件
  ↓
登机口（路由处理）   ← 最终处理
```

**每一层都可以：**

- 放行（继续往下走）；
- 拦下（直接返回响应）。

## 4.2 中间件的写法

```javascript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
```

**三个参数：**

| 参数 | 作用 |
|---|---|
| `req` | 请求 |
| `res` | 响应 |
| `next` | **一个函数，调用它就"放行到下一层"** |

**`next()` 是中间件的关键。**

**不调用 `next()` 会怎样：**
请求就卡在这里了。**浏览器一直转圈，永远得不到响应。**

**这就是"中间件忘了 next"这个经典 bug。**

## 4.3 写一个日志中间件

**在路由之前加：**

```javascript
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });

  next();
});
```

**这段在做什么：**

1. 记下开始时间；
2. 注册一个 `finish` 监听器（响应结束时触发）；
3. 计算耗时，打印一行日志；
4. `next()` 放行。

**`res.on("finish", ...)` 是什么：**
响应完全发出去后触发的事件。**这时才能拿到状态码。**

**访问几个页面，终端会输出：**

```text
GET / 200 3ms
GET /api/info 200 1ms
GET /nope 404 1ms
```

**这是最基础的访问日志。生产环境会用更完整的方案，但原理就是这。**

## 4.4 `express.json()` 也是一个中间件

```javascript
app.use(express.json());
```

**它做的事：**

1. 检查请求的 `Content-Type` 是不是 `application/json`；
2. 如果是，读请求体，`JSON.parse` 成对象；
3. 把结果挂到 `req.body`；
4. `next()`。

**为什么必须在路由之前：**

因为中间件是**按定义顺序执行**的。

```javascript
// ❌ 错：路由在前，中间件在后
app.post("/api/echo", (req, res) => {
  res.json({ received: req.body });   // req.body 是 undefined
});
app.use(express.json());               // 太晚了

// ✅ 对：中间件在前
app.use(express.json());
app.post("/api/echo", (req, res) => {
  res.json({ received: req.body });
});
```

**记住这个规则：**

```text
中间件按顺序执行。要在路由用到某个中间件的结果，它必须定义在路由之前。
```

## 4.5 404 兜底

**Express 默认的 404 是一段 HTML：**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error</title></head>
<body><pre>Cannot GET /nope</pre></body>
</html>
```

**这看起来很粗糙。** 而且如果是 API，返回 HTML 会让前端解析失败。

**自己写一个 404 兜底（放在所有路由之后）：**

```javascript
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.originalUrl,
  });
});
```

**为什么能兜底：**
因为中间件按顺序执行。**所有路由都没匹配上，就会走到最后一个 `app.use`。**

**为什么用 `app.use` 而不是 `app.get`：**
`app.use` 不限定方法，GET/POST/PUT/DELETE 全都会进来。

**`req.originalUrl` 是什么：**
原始完整路径，包括 `?` 后面的部分。**`req.url` 在某些情况下会被改写，`originalUrl` 不会。**

## 4.6 错误处理中间件（重点）

**Express 的错误处理中间件有四个参数，这是唯一的区别：**

```javascript
app.use((err, req, res, next) => {
  console.error("捕获到错误：", err.message);
  res.status(500).json({ error: "服务器内部错误" });
});
```

**注意第一个参数是 `err`。**

**四个参数必须都写，不能省略。** 即使你不用 `next`，也要占位。**Express 靠参数个数判断这是错误处理中间件。**

**写三个参数会怎样：**
Express 会把它当成普通中间件，**错误永远捕获不到。**

**这个坑很难发现，因为代码看起来完全正常。**

**测试它：**

```javascript
app.get("/boom", (req, res) => {
  throw new Error("故意抛错");
});
```

**访问 `/boom`。**

**如果不写错误处理中间件：**
返回一段 HTML 错误页，终端打印一大段堆栈。

**如果写了：**
返回 `{"error":"服务器内部错误"}`，终端打印 `捕获到错误：故意抛错`。

**这就是"把机器的报错翻译成用户能看的东西"。**

**重要：错误处理中间件必须放在最后。**

## 4.7 中间件的执行顺序图

```text
请求进来
  ↓
app.use(日志中间件)         ← 打印日志，next()
  ↓
app.use(express.json())     ← 解析 body，next()
  ↓
app.get("/") 匹配？          ← 匹配就响应，不匹配就继续
  ↓
app.get("/api/info") 匹配？  ← 不匹配就继续
  ↓
app.use(404 兜底)           ← 都没匹配，返回 404
  ↓
（如果任何地方 throw）→ app.use(错误处理) ← 4 个参数的那个
```

**这张图建议抄进笔记。** 以后路由不生效、body 是 undefined、错误捕获不到，都要回来看这张图。

---

# 第 5 步：把整个应用写完整（20 分钟）

## 5.1 完整 `src/app.js`

**自己敲（这份是可以在笔记里当模板用的）：**

```javascript
import express from "express";

const app = express();
const PORT = 3000;

// ========== 中间件（顺序很重要） ==========

// 1. 日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// 2. 解析 JSON 请求体
app.use(express.json());

// ========== 数据（先用内存数组，第 19 节课换数据库） ==========

const USERS = [
  { id: 1, name: "小明", role: "前端" },
  { id: 2, name: "小红", role: "后端" },
  { id: 3, name: "小刚", role: "设计" },
];

// ========== 路由 ==========

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head><meta charset="UTF-8"><title>Express 版</title></head>
    <body>
      <h1>Express 版首页</h1>
      <ul>
        <li><a href="/api/info">API 信息</a></li>
        <li><a href="/api/users">用户列表</a></li>
        <li><a href="/api/users/1">用户 1</a></li>
        <li><a href="/api/users/99">不存在的用户（测试 404）</a></li>
        <li><a href="/boom">触发一个错误（测试 500）</a></li>
      </ul>
    </body>
    </html>
  `);
});

app.get("/api/info", (req, res) => {
  res.json({
    name: "Express 版练习",
    version: "1.0.0",
    time: new Date().toISOString(),
  });
});

app.get("/api/users", (req, res) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 10;

  if (page < 1 || size < 1) {
    res.status(400).json({ error: "page 和 size 必须是正整数" });
    return;
  }

  const start = (page - 1) * size;

  res.json({
    page,
    size,
    total: USERS.length,
    totalPages: Math.max(1, Math.ceil(USERS.length / size)),
    items: USERS.slice(start, start + size),
  });
});

app.get("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id 必须是数字" });
    return;
  }

  const user = USERS.find((u) => u.id === id);

  if (!user) {
    res.status(404).json({ error: `没有 ID 为 ${id} 的用户` });
    return;
  }

  res.json(user);
});

app.post("/api/users", (req, res) => {
  const { name, role } = req.body || {};

  if (typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name 必填，且必须是非空字符串" });
    return;
  }

  const newUser = {
    id: USERS.length > 0 ? Math.max(...USERS.map((u) => u.id)) + 1 : 1,
    name: name.trim(),
    role: typeof role === "string" ? role.trim() : "",
  };

  USERS.push(newUser);

  res.status(201).json(newUser);
});

app.get("/boom", (req, res) => {
  throw new Error("这是一个故意抛出的错误");
});

// ========== 404 兜底（必须在所有路由之后） ==========

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.originalUrl,
  });
});

// ========== 错误处理（必须 4 个参数，必须放最后） ==========

app.use((err, req, res, next) => {
  console.error("捕获到错误：", err.message);
  res.status(500).json({ error: "服务器内部错误" });
});

// ========== 启动 ==========

app.listen(PORT, () => {
  console.log(`已启动：http://localhost:${PORT}`);
});
```

## 5.2 逐个测试（用浏览器 + curl）

**打开浏览器访问 `/`，点每个链接。**

**然后用 curl 测 POST（浏览器不方便发 POST）：**

```text
curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d "{\"name\":\"小新\",\"role\":\"测试\"}"
```

**应该返回：**

```json
{"id":4,"name":"小新","role":"测试"}
```

**再访问 `/api/users`，应该看到 4 个用户。**

**注意：重启服务器后，新增的用户会消失。**

**为什么会消失：**
因为 `USERS` 存在内存里。**服务器一重启，内存清空。**

**这就是为什么要数据库。第 19 节课会讲。**

## 5.3 测错误情况

**逐个试，记录状态码和返回内容：**

| 请求 | 预期状态码 | 预期内容 |
|---|---|---|
| `/api/users?page=0` | 400 | `page 和 size 必须是正整数` |
| `/api/users/abc` | 400 | `id 必须是数字` |
| `/api/users/99` | 404 | `没有 ID 为 99 的用户` |
| POST 空 body | 400 | `name 必填...` |
| `/nope` | 404 | `Not Found` + 路径 |
| `/boom` | 500 | `服务器内部错误` |

**在 PowerShell 里测 POST 空 body：**

```text
curl.exe -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d "{}"
```

**应该返回 400。**

## 5.4 注意 `Math.max(...USERS.map(...))`

```javascript
id: USERS.length > 0 ? Math.max(...USERS.map((u) => u.id)) + 1 : 1,
```

**逐段读：**

- `USERS.map((u) => u.id)` —— 把所有 id 抽成一个数组 `[1, 2, 3]`；
- `Math.max(...)` —— `...` 是展开运算符，把数组摊成参数，等于 `Math.max(1, 2, 3)`；
- `+ 1` —— 得到下一个 id。

**为什么不直接用 `USERS.length + 1`：**
因为如果你删除了 id=2，剩 `[1, 3]`，`length + 1` 是 3，**跟已有的 3 撞了**。

**用 `Math.max(...) + 1` 就不会撞。**

**`...` 展开运算符是什么：**
把数组"摊开"。

```javascript
const arr = [1, 2, 3];
console.log(Math.max(arr));      // NaN（Math.max 不接受数组）
console.log(Math.max(...arr));   // 3（摊开成 Math.max(1,2,3)）
```

**这个运算符在 React、数组复制、参数传递里到处都是。** 记住它。

**注意：真实项目里 id 由数据库生成**，不需要手动算。这里只是练习。

---

# 第 6 步：故意犯六个错（20 分钟）

## 错误 1：中间件忘了 `next()`

**操作：** 在日志中间件里删掉 `next()`。

**会怎样：** 浏览器一直转圈，最后超时。终端会打印日志，但没有响应。

**为什么：** 请求卡在中间件里，永远到不了路由。

**怎么查：**
**"有日志但没响应"，第一件事就是查 `next()`。**

## 错误 2：`express.json()` 放在路由后面

**操作：** 把 `app.use(express.json())` 移到所有路由之后。

**会怎样：** POST 请求里 `req.body` 是 `undefined`。

**为什么：** 中间件按顺序执行，路由先跑完了。

**怎么查：**
`console.log(req.body)` 看到 `undefined` → **检查 `express.json()` 的位置。**

## 错误 3：错误处理中间件只写了三个参数

**操作：**

```javascript
app.use((err, req, res) => {     // 少了 next
  res.status(500).json({ error: "错误" });
});
```

**会怎样：** 访问 `/boom` 时，这个中间件**完全不执行**，而是返回 Express 默认的 HTML 错误页。

**为什么：** Express 靠"参数个数是不是 4"来识别错误处理中间件。

**怎么查：**
错误处理不生效 → **数一下参数有几个。**

**这个坑极其隐蔽。** 因为代码看起来完全合理。

## 错误 4：404 兜底放在路由之前

**操作：** 把 404 的 `app.use` 移到第一个路由之前。

**会怎样：** **所有请求都返回 404。** 首页也打不开。

**为什么：** 中间件按顺序执行，404 兜底先执行并 `res.json` 结束了响应。

**怎么查：**
所有路径都 404 → **检查 404 兜底的位置。**

**规则：404 兜底必须在所有路由之后。**

## 错误 5：路径参数被固定路径抢走

**操作：**

```javascript
app.get("/api/users/:id", ...);    // 先定义
app.get("/api/users/list", ...);   // 后定义
```

**访问 `/api/users/list`。**

**会怎样：** 走到 `:id` 那个路由，`req.params.id` 是 `"list"`。

**修法：** 把 `/api/users/list` 放前面。

**怎么查：**
某个路由"不生效" → **检查有没有更早定义的参数路由把它吃了。**

## 错误 6：`res.send` 之后又 `res.json`

**操作：**

```javascript
app.get("/double", (req, res) => {
  res.send("第一次");
  res.json({ second: true });
});
```

**会怎样：**

```text
Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
    at ServerResponse.setHeader (node:_http_outgoing:700:11)
    at ServerResponse.header (.../express/lib/response.js:794:10)
    at ServerResponse.send (.../express/lib/response.js:174:12)
    at ServerResponse.json (.../express/lib/response.js:278:15)
```

**注意报错说的动词是 `set`，不是第 15 节课的 `write`。**

**为什么不一样：**
因为 Express 在内部调的是 `setHeader`，原生 Node 调的是 `writeHead`。**同一个问题，两个框架的措辞不同。**

**浏览器看到的是什么：** 状态码 200，内容是"第一次"。**页面看起来正常，只有终端在报错。**

**为什么：** 一次请求只能响应一次。

**怎么查：**
看到 `ERR_HTTP_HEADERS_SENT` → **检查每个分支是不是只有一个 `res.xxx`，且后面有没有 `return`。**

## 六个错误总结

```text
忘 next()              → 请求卡住，转圈超时
json 中间件位置错       → req.body 是 undefined
错误中间件只有 3 参数   → 错误捕获不到
404 兜底位置错          → 全部 404
参数路由抢了固定路由    → 路由"不生效"
重复响应                → ERR_HTTP_HEADERS_SENT
```

**排查顺序（Express 专用）：**

```text
① 有日志没响应 → 查 next()
② body 是 undefined → 查 express.json() 位置
③ 错误没捕获 → 数错误中间件参数
④ 全部 404 → 查兜底位置
⑤ 某个路由不生效 → 查有没有更早的参数路由
⑥ 报 HEADERS_SENT → 查重复响应
```

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 17 节课学习笔记

## 一、原生 Node 和 Express 的对比

| 事情 | 原生 Node | Express |
|---|---|---|
| 定义路由 | | |
| 路径参数 | | |
| 查询参数 | | |
| POST 数据 | | |
| 404 兜底 | | |
| 错误处理 | | |

## 二、`req.params` 和 `req.query`

| | params | query |
|---|---|---|
| 在 URL 哪里 | | |
| 例子 | | |
| 什么时候用 | | |
| 类型 | | |

## 三、中间件是什么

我的理解（用安检比喻）：

`next()` 的作用：

不调 `next()` 会怎样：

## 四、中间件的顺序

为什么 `express.json()` 必须在路由之前：

为什么 404 兜底必须在路由之后：

## 五、错误处理中间件的特殊之处

参数个数：

少写一个会怎样：

## 六、`res.send` 和 `res.json`

| | send | json |
|---|---|---|
| 传对象 | | |
| Content-Type | | |

`res.status(404).json(...)` 为什么能链式调用：

## 七、展开运算符

```javascript
Math.max(...[1,2,3])   // 
```

我用它做了什么：

## 八、六个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 忘 next() | | |
| json 位置错 | | |
| 错误中间件 3 参数 | | |
| 404 兜底位置错 | | |
| 参数路由抢固定路由 | | |
| 重复响应 | | |

## 九、我实际测的状态码

| 请求 | 状态码 | 返回内容 |
|---|---|---|
| /api/users?page=0 | | |
| /api/users/abc | | |
| /api/users/99 | | |
| POST 空 body | | |
| /nope | | |
| /boom | | |

## 十、数据为什么重启就没了

原因：

需要学什么才能解决：

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 我装了 express，`package.json` 里有 dependencies
- [ ] 我能写出 GET 和 POST 路由
- [ ] 我会用 `req.params` 取路径参数
- [ ] 我会用 `req.query` 取查询参数
- [ ] 我知道中间件必须有 `next()`
- [ ] 我写了日志中间件
- [ ] 我写了 404 兜底
- [ ] 我写了 4 个参数的错误处理中间件
- [ ] `/boom` 返回 500 而不是 HTML 错误页
- [ ] 我做过六个错误的实验
```

---

# 第 8 步：课后练习

## 练习一：加一个"文章"资源

**要求：** 仿照 users，做一套完整 CRUD（增删改查）：

```text
GET    /api/posts          列表（支持 ?page= & ?size=）
GET    /api/posts/:id      单篇
POST   /api/posts          新建（需要 title 和 content）
PUT    /api/posts/:id      整体更新
DELETE /api/posts/:id      删除
```

**要求：**

- 每个都要有参数校验；
- 找不到返回 404；
- 新建返回 201；
- 删除返回 204（无内容）。

**`204` 是什么：** "成功但没内容返回"。用 `res.status(204).end()`。

## 练习二：给日志中间件加耗时统计

**要求：**

1. 记录每个请求的耗时；
2. 如果耗时超过 100ms，打印成 `⚠️ SLOW`。

**提示：** 在 `/boom` 前面加一个故意慢的路由：

```javascript
app.get("/slow", async (req, res) => {
  await new Promise((r) => setTimeout(r, 300));
  res.json({ ok: true });
});
```

**这题会引出第 4 周的内容：异步。** 先试着写。

## 练习三：做一个"请求 ID"

**要求：**

1. 每个请求生成一个唯一 ID（比如用 `Date.now()` + 随机数）；
2. 挂到 `req.id`；
3. 在日志里带上这个 ID。

**为什么真实项目需要这个：**
当一个用户报"我点了没反应"时，你没法重现。**有了请求 ID，你能在日志里精确找到那一次请求的全过程。**

**这是生产环境必备的东西。**

## 练习四：找出这段代码的五个问题

```javascript
import express from "express";
const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("首页");
});

app.use((req, res, next) => {
  console.log(req.method, req.url);
});

app.post("/api/data", (req, res) => {
  res.json(req.body);
});

app.use((req, res) => {
  res.status(404).send("没有");
});

app.listen(PORT);
```

**提示方向：** 中间件没有 `next`、`express.json()` 缺失、中间件位置、没有错误处理、`listen` 没回调。

## 练习五：用自己的话讲

```text
为什么中间件必须按顺序？
为什么错误处理中间件必须是四个参数？
为什么 404 兜底要放在最后？
为什么 req.params 的值永远是字符串？
```

---

# 第 9 步：最终验收

## A. 安装与配置

- [ ] `express-server` 目录存在
- [ ] `package.json` 有 `"type": "module"`
- [ ] `dependencies` 里有 express
- [ ] `.gitignore` 忽略了 `node_modules`
- [ ] `npm run dev` 能启动

## B. 路由

- [ ] GET 路由正常
- [ ] POST 路由正常
- [ ] 我会用 `req.params`
- [ ] 我会用 `req.query`
- [ ] 我知道 `req.params` 的值是字符串
- [ ] 我知道固定路径要放在参数路径前面

## C. 中间件

- [ ] 我能说出中间件的三个参数
- [ ] 我知道必须调 `next()`
- [ ] 我写了日志中间件（含耗时）
- [ ] 我知道 `express.json()` 必须在路由之前
- [ ] 我写了 404 兜底
- [ ] 我写了 4 个参数的错误处理中间件
- [ ] `/boom` 返回 500 JSON 而不是 HTML

## D. 响应

- [ ] 我会用 `res.send`
- [ ] 我会用 `res.json`
- [ ] 我会用 `res.status().json()` 链式写法
- [ ] 我知道 201、204、400、404、500 各自的用途

## E. 实操

- [ ] `03-练习代码/express-server/src/app.js` 存在
- [ ] 首页能看到链接列表
- [ ] `/api/users` 支持分页
- [ ] `/api/users/:id` 找不到返回 404
- [ ] POST `/api/users` 新建返回 201
- [ ] 空 name 返回 400
- [ ] `/nope` 返回 404 JSON
- [ ] `/boom` 返回 500 JSON

## F. 排错

- [ ] 转圈超时我知道查 `next()`
- [ ] body undefined 我知道查 `express.json()` 位置
- [ ] 错误没捕获我知道数参数
- [ ] 全部 404 我知道查兜底位置
- [ ] 路由不生效我知道查参数路由顺序

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有 6 个状态码的实际测试结果
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **Express 把"手动判断每一个 if"变成了"声明每个路由"，把"自己收流解析"变成了"一个中间件"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 浏览器一直转圈 | 中间件没调 `next()` | 检查每个中间件 |
| `req.body` 是 undefined | 没加 `express.json()` 或在路由后 | 移到路由之前 |
| 错误没被捕获 | 错误中间件参数不是 4 个 | 补上 `next` |
| 所有路径都 404 | 404 兜底在路由之前 | 移到最后 |
| 某个路由不生效 | 被更早的参数路由吃掉 | 固定路径放前面 |
| `ERR_HTTP_HEADERS_SENT` | 重复响应 | 每个分支只 `res` 一次并 `return` |
| `Cannot find package 'express'` | 没装或在错误目录运行 | `npm install express` |
| `ERR_MODULE_NOT_FOUND` | 忘了 `./` 或 `.js` | 检查 import 路径 |
| `require is not defined` | ESM 项目里用了 require | 改 `import` |
| `req.query.x` 是 `undefined` | 参数没传 | 加默认值 `\|\| 默认` |
| `req.params.id` 算出 NaN | 没判断是不是数字 | 用 `Number.isNaN` 检查 |
| POST 后数据消失 | 存在内存里 | 需要数据库（第 19 节课） |
| `listen` 报 `EADDRINUSE` | 端口被占 | 关旧进程或换端口 |
| 中文乱码 | 用了 `res.send(字符串)` 应该没问题 | 检查是否手写了 `writeHead` |
