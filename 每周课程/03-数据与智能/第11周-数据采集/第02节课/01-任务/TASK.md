# 第 72 节课：读取公开接口

> 这节课结束时，你手上有：`第02节课/03-练习代码/collector/mock-server.js`（跑在 3001 端口的假数据服务）和 `collector/first-fetch.js`（能读接口、能识别 500 / 429 / 超时的脚本）。

**时间**：约 120 分钟
**前置**：第 71 节课填完的 `数据来源判断表.md`；会用 `fetch` 调自己第 3 周的 Express 后端

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你会用 `fetch` 调**自己写的**后端。那种调用有个隐藏好处：**你清楚对方会返回什么**。

```javascript
const res = await fetch("/api/chat");
const data = await res.json();   // 你从不怀疑这一定是 JSON
```

写自己项目时，你不会想"万一返回的不是 JSON 呢"。

**今天开始，对方不再是你。**

## 0.2 今天这个坑长什么样

> 你写了个脚本读某个公开接口，跑起来报错：
>
> ```text
> SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
> ```
>
> 你的第一反应通常是这三种，三种都错：
>
> | 你的猜测 | 实际原因 |
> |---|---|
> | "对方网站挂了" | 没挂，它返回了 500，还给了你一张很客气的错误页 |
> | "我网络有问题" | 网络通着，你拿到了 100% 完整的响应 |
> | "Node 的 fetch 有 bug" | 没有，它在忠实地说"这不是 JSON" |

**因果链是这样的：**

```text
对方  →  status 500  →  Content-Type: text/html  →  body 是一张错误页
你    →  不看 status  →  不看 Content-Type  →  直接 res.json()
      →  拿 HTML 去 JSON.parse  →  Unexpected token '<'
```

**四个环节你跳过了一个校验，报错就指错了方向。** 这节课要建立的动作顺序：**先看状态码，再看内容类型，最后才解析。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| 状态码（status code） | 服务器对这次请求的"结论"：`200` 成功，`4xx` 你有问题，`5xx` 它有问题 | 第 3 步，先看 `res.status` |
| `Content-Type` | 响应体的真实格式，`application/json` 才是 JSON | 第 4 步，决定能不能 `.json()` |
| 超时（timeout） | 你不能无限等一个不回复的服务器 | 第 6 步，`AbortSignal.timeout` |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `mock-server.js` | `第02节课/03-练习代码/collector/` | 11 个端点的假数据服务，端口 3001 |
| `first-fetch.js` | 同上 | 能读列表、能识别 500 / 429 / 超时 |
| `接口清单.md` | 同上 | 你亲手请求过的端点记录 |
| `NOTES.md` | `第02节课/02-笔记/` | 第 9 步填 |

**从这一节开始，后面五节课都用这个 `collector` 文件夹。** 第 73 节不要重新 `npm install`，直接 `xcopy` 整个文件夹过去。

---

# 第 1 步：建项目，装 Express（15 分钟）

## 1.1 做什么 / 为什么

**做什么：** 在 `第02节课/03-练习代码/` 下建一个 `collector` 项目，装 Express。

**为什么：** 这一周所有练习都要一个"能返回各种坏情况的服务器"。真站不会配合你演练 429、超时、HTML 错误页 —— 你得自己造一个。

**为什么用 Express 造而不是 Node 原生 `http`：** 因为要写 11 个端点，原生 `http` 得手写路由匹配、手写 `Content-Type`、手写 JSON 序列化，大约 250 行；Express 每个端点两三行。**理由是省你自己的时间，不是 Express 更高级。** 如果只要一个端点，原生 `http` 就够，不用装包。

## 1.2 操作

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第02节课\03-练习代码"
mkdir collector
cd collector
npm init -y
npm install express
```

## 1.3 屏幕上应该看到什么

`npm init -y` 之后：

```text
Wrote to B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第02节课\03-练习代码\collector\package.json:

{
  "name": "collector",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "license": "ISC"
}
```

`npm install express` 之后（包数量和秒数每次不同）：

```text
added 65 packages in 3s
```

`dir` 应该看到：

```text
2026/11/16  15:40    <DIR>          node_modules
2026/11/16  15:40             1,203 package-lock.json
2026/11/16  15:40               253 package.json
```

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `'npm' 不是内部或外部命令` | Node 没装好或没进 PATH | 回 `参考手册/01-环境搭建.md` 重装 |
| `npm error code ENOENT` | 当前目录不对 | `cd` 到 `collector` 再执行，`dir` 里要有 `package.json` |
| `npm error network` / `ETIMEDOUT` | 到不了 npm 源 | 换网络重试；公司网络需代理就先配 `npm config set proxy` |
| 装完了却没有 `express` | 装到上一层目录了 | `dir node_modules\express` 确认，没有就 `cd` 对了再装 |

---

# 第 2 步：写 mock-server 并逐个验收（35 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写一个 11 个端点的假数据服务，然后把每个端点都请求一遍。

**为什么一次写完：** 后面五节课每个坑都要一个端点。**这一节写的这个文件，第 73 到 77 节一行都不用动。**

| 端点 | 用来练什么 | 哪一节用 |
|---|---|---|
| `GET /api/items?page=1&size=10` | 正常分页，共 3 页 | 72、74 |
| `GET /api/items?page=999` | 翻过头返回空数组 | 74 |
| `GET /api/items-offset?offset=0&limit=10` | offset + limit 分页 | 74 |
| `GET /api/items-cursor?cursor=0&limit=10` | cursor 分页 | 74 |
| `GET /api/dirty` | 脏数据：全角空格、`¥1,299.00`、三种日期、缺字段 | 75 |
| `GET /api/limit` | 连着请求，第 3 次 `429` | 72 |
| `GET /api/html-error` | 500 时返回 HTML 错误页 | 72 |
| `GET /slow` | 拖 5 秒，测超时 | 72 |
| `GET /api/echo` | 回显请求头，看 User-Agent | 72 |
| `GET /html?page=1` | 静态 HTML 列表页 | 73 |
| `GET /html?page=1&version=2` | 改版后的 HTML（结构变了） | 73 |
| `GET /api/change` | 改一条数据，验证增量更新 | 76 |
| `GET /api/reset` | 还原成初始 30 条 | 74、76 |

## 2.2 操作

在 `collector` 里新建 `mock-server.js`，完整敲一遍：

```javascript
const express = require("express");

const app = express();
const PORT = 3001;

// 30 条假数据：3 页，每页 10 条
const ITEMS = [];
for (let i = 1; i <= 30; i += 1) {
  ITEMS.push({
    id: i,
    title: "示例条目 " + i,
    price: 100 + i,
    published_at: "2026-10-" + String((i % 28) + 1).padStart(2, "0"),
    url: "http://localhost:3001/item/" + i,
  });
}

// 运行时可修改的副本：第 76 节课用来演示"只更新变化的行"
const items = ITEMS.map((it) => ({ ...it }));

let limitHits = 0;

// 1. 正常分页接口
app.get("/api/items", (req, res) => {
  const page = Number(req.query.page === undefined ? 1 : req.query.page);
  const size = Number(req.query.size === undefined ? 10 : req.query.size);
  if (!Number.isInteger(page) || page < 1) {
    res.status(400).json({ error: "page 必须是大于 0 的整数" });
    return;
  }
  if (!Number.isInteger(size) || size < 1 || size > 50) {
    res.status(400).json({ error: "size 必须是 1 到 50 的整数" });
    return;
  }
  const start = (page - 1) * size;
  const data = items.slice(start, start + size);
  res.json({
    page: page,
    size: size,
    total: items.length,
    has_next: start + data.length < items.length,
    data: data,
  });
});

// 2. offset + limit 分页
app.get("/api/items-offset", (req, res) => {
  const offset = Number(req.query.offset === undefined ? 0 : req.query.offset);
  const limit = Number(req.query.limit === undefined ? 10 : req.query.limit);
  res.json({
    offset: offset,
    limit: limit,
    total: items.length,
    data: items.slice(offset, offset + limit),
  });
});

// 3. cursor 分页：cursor 传上一页最后一条的 id，0 表示从头开始
app.get("/api/items-cursor", (req, res) => {
  const cursor = Number(req.query.cursor === undefined ? 0 : req.query.cursor);
  const limit = Number(req.query.limit === undefined ? 10 : req.query.limit);
  const rest = items.filter((it) => it.id > cursor);
  const data = rest.slice(0, limit);
  res.json({
    cursor: cursor,
    limit: limit,
    next_cursor: rest.length > limit ? data[data.length - 1].id : null,
    data: data,
  });
});

// 4. 脏数据
app.get("/api/dirty", (req, res) => {
  res.json({
    data: [
      { id: 1, name: "　无线鼠标  ", price: "¥1,299.00", date: "2026/10/01", note: "黑色" },
      { id: 2, name: "机械键盘", price: "８９９元", date: "2026-10-02", note: "" },
      { id: 3, name: " 显示器　27寸 ", price: "1299", date: "2026年10月3日", note: null },
      { id: 4, name: "USB 集线器", price: "", date: "10/04/2026", note: "缺价格" },
      { id: 5, name: "　　", price: "¥ 59.90", date: "2026/10/5", note: "名字是空白" },
      { id: 6, name: "支架", price: "1,099.50", date: "2026-10-06T08:30:00Z", note: "带时间" },
      { id: 7, name: "耳机", price: "¥299", date: "2026.10.07" },
    ],
  });
});

// 5. 连续请求第 3 次返回 429
app.get("/api/limit", (req, res) => {
  limitHits += 1;
  if (limitHits % 3 === 0) {
    res.set("Retry-After", "2");
    res.status(429).json({ error: "请求太快了，第 " + limitHits + " 次被限流" });
    return;
  }
  res.json({ ok: true, hit: limitHits, message: "第 " + limitHits + " 次请求成功" });
});

// 6. 500 时返回一张 HTML 错误页
app.get("/api/html-error", (req, res) => {
  res.status(500).type("html").send(`<!DOCTYPE html>
<html><head><title>500 Internal Server Error</title></head>
<body><h1>Internal Server Error</h1><p>服务器开小差了，请稍后再试。</p></body></html>`);
});

// 7. 故意拖 5 秒
app.get("/slow", (req, res) => {
  setTimeout(() => {
    res.json({ ok: true, message: "我等了 5 秒才回复" });
  }, 5000);
});

// 8. 回显请求头，用来看自己的 User-Agent
app.get("/api/echo", (req, res) => {
  res.json({ headers: req.headers });
});

// 9. 静态 HTML 列表页，第 73 节课用
//    version=2 时结构和 class 名都变了，用来模拟"对方改版"
app.get("/html", (req, res) => {
  const page = Number(req.query.page === undefined ? 1 : req.query.page);
  const version = req.query.version === "2" ? 2 : 1;
  const start = (page - 1) * 10;
  const data = items.slice(start, start + 10);

  let list;
  if (version === 2) {
    const cards = data
      .map(
        (it) =>
          `<div class="item-card"><span class="name">${it.title}</span><em class="cost">${it.price} 元</em></div>`
      )
      .join("\n      ");
    list = `<div class="grid">\n      ${cards}\n    </div>`;
  } else {
    const rows = data
      .map(
        (it) =>
          `<tr><td class="title">${it.title}</td><td class="price">${it.price}</td><td class="date">${it.published_at}</td></tr>`
      )
      .join("\n      ");
    list = `<table id="list">\n      <thead><tr><th>标题</th><th>价格</th><th>日期</th></tr></thead>\n      <tbody>\n      ${rows}\n      </tbody>\n    </table>`;
  }

  res.type("html").send(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>商品列表 第 ${page} 页</title></head>
<body>
    <h1>商品列表</h1>
    ${list}
    <div class="pager">第 ${page} 页 / 共 3 页</div>
</body>
</html>`);
});

// 10. 改一条数据，用来验证"增量更新"
app.get("/api/change", (req, res) => {
  const target = items.find((it) => it.id === 5);
  target.price = target.price + 1;
  target.title = target.title + "（已改价）";
  res.json({ ok: true, changed: target });
});

// 11. 还原成初始数据
app.get("/api/reset", (req, res) => {
  items.length = 0;
  for (const it of ITEMS) {
    items.push({ ...it });
  }
  limitHits = 0;
  res.json({ ok: true, message: "数据已还原为初始 30 条" });
});

const ENDPOINTS = [
  "GET /api/items?page=1&size=10",
  "GET /api/items-offset?offset=0&limit=10",
  "GET /api/items-cursor?cursor=0&limit=10",
  "GET /api/dirty",
  "GET /api/limit",
  "GET /api/html-error",
  "GET /slow",
  "GET /api/echo",
  "GET /html?page=1        (加 &version=2 看改版后的结构)",
  "GET /api/change",
  "GET /api/reset",
];

app.listen(PORT, () => {
  console.log("mock-server 已启动：http://localhost:" + PORT);
  console.log("可用端点：");
  for (const line of ENDPOINTS) {
    console.log("  " + line);
  }
});
```

**三个地方要看懂，别看过去：**

**第一，`has_next` 是服务器算给你的**，公式 `start + data.length < items.length`。第 74 节要用它，但它**不可信** —— 第 74 节会讲为什么。

**第二，`/api/limit` 用 `% 3`。** 是"第 3、6、9 次"返回 429，不是"第 3 次之后一直 429"。这个设计让你能反复试。

**第三，`/html` 有两个版本。** 默认 `<table>`，`version=2` 变成 `<div class="item-card">`。这是第 73 节"结构变了"的道具。

## 2.3 屏幕上应该看到什么

**启动：**

```text
node mock-server.js
```

```text
mock-server 已启动：http://localhost:3001
可用端点：
  GET /api/items?page=1&size=10
  GET /api/items-offset?offset=0&limit=10
  GET /api/items-cursor?cursor=0&limit=10
  GET /api/dirty
  GET /api/limit
  GET /api/html-error
  GET /slow
  GET /api/echo
  GET /html?page=1        (加 &version=2 看改版后的结构)
  GET /api/change
  GET /api/reset
```

**光标不动了，没回到提示符 —— 正常的**，服务器在等请求。`Ctrl + C` 结束。

**另开一个 cmd 窗口**（别关服务器那个），逐个请求。**cmd 里 URL 带 `&` 必须加引号**，否则 cmd 会把 `&` 当命令分隔符，把 `size=10` 当成另一条命令执行。

```text
curl.exe -i "http://localhost:3001/api/items?page=1&size=10"
curl.exe -i "http://localhost:3001/api/items?page=999"
curl.exe -i "http://localhost:3001/api/html-error"
curl.exe -i "http://localhost:3001/api/limit"
curl.exe -i "http://localhost:3001/api/limit"
curl.exe -i "http://localhost:3001/api/limit"
```

**`/api/items?page=1&size=10`：**

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 1043

{"page":1,"size":10,"total":30,"has_next":true,"data":[{"id":1,"title":"示例条目 1","price":101,"published_at":"2026-10-02","url":"http://localhost:3001/item/1"},...
```

**`/api/items?page=999`：**

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"page":999,"size":10,"total":30,"has_next":false,"data":[]}
```

**注意：状态码 `200` 不是 404，`data` 是空数组。** "没有更多数据"在 HTTP 层面是成功，不是错误。第 74 节定终止条件时这点很关键。

**`/api/html-error`：**

```text
HTTP/1.1 500 Internal Server Error
Content-Type: text/html; charset=utf-8

<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head><body><h1>Internal Server Error</h1><p>服务器开小差了，请稍后再试。</p></body></html>
```

**看第二行 `text/html`。** 这就是第 4 步那个坑的全部原因。

**`/api/limit` 连打三次：**

```text
HTTP/1.1 200 OK
{"ok":true,"hit":1,"message":"第 1 次请求成功"}

HTTP/1.1 200 OK
{"ok":true,"hit":2,"message":"第 2 次请求成功"}

HTTP/1.1 429 Too Many Requests
Retry-After: 2
{"error":"请求太快了，第 3 次被限流"}
```

**把这次验收记进 `接口清单.md`：**

```markdown
# 接口清单（我自己请求过的）

| 端点 | 状态码 | Content-Type | 关键内容 |
|---|---|---|---|
| /api/items?page=1&size=10 | 200 | application/json | total=30, has_next=true, 10 条 |
| /api/items?page=999 | 200 | application/json | data=[] 空数组 |
| /api/items-offset | 200 | application/json | offset=0, 10 条 |
| /api/items-cursor | 200 | application/json | next_cursor=10 |
| /api/html-error | 500 | text/html | HTML 错误页 |
| /api/limit（第 3 次） | 429 | application/json | Retry-After: 2 |
```

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Cannot find module 'express'` | 不在 `collector` 里跑，或没装 | `dir node_modules\express`，没有就 `npm install express` |
| `EADDRINUSE :::3001` | 3001 被占 | 见第 8 步错误 3 |
| `SyntaxError: Invalid or unexpected token` | 混进了中文引号 `“”` | 搜一下 `“`，全换成 `"` |
| `curl: (7) Failed to connect` | 服务器没跑 | 回服务器窗口看日志 |
| `'size' 不是内部或外部命令` | URL 没加引号 | 整个 URL 用双引号包住 |
| 浏览器打开 `/` 是空白 | 没有根路由 | 用具体端点，如 `/api/items` |

---

# 第 3 步：写第一个 fetch（20 分钟）

## 3.1 做什么 / 为什么

**做什么：** 写 `first-fetch.js`，读 `/api/items`，打印状态码、内容类型、条数。

**为什么先打印这三样而不是直接拿数据：** 因为要建立"**先看结论，再看内容**"的习惯。状态码和内容类型是这次请求的体检报告，数据是报告合格之后才看的东西。

## 3.2 操作

新建 `first-fetch.js`：

```javascript
// first-fetch.js —— 第一个能读接口的脚本
// 用法：node first-fetch.js（mock-server 要在 3001 端口跑着）

const API = "http://localhost:3001/api/items?page=1&size=10";

async function main() {
  const res = await fetch(API);

  console.log("status:", res.status);
  console.log("content-type:", res.headers.get("content-type"));

  const body = await res.json();

  console.log("total:", body.total, "has_next:", body.has_next);
  console.log("这一页几条:", body.data.length);
  console.log("第一条:", body.data[0].title);
}

main();
```

```text
node first-fetch.js
```

**注意 `API` 里的 `&` 不用加引号。** 它是 JS 字符串，不经过 cmd 解析；加了引号反而会变成 URL 的一部分（见第 8 步错误 1）。

## 3.3 屏幕上应该看到什么

```text
status: 200
content-type: application/json; charset=utf-8
total: 30 has_next: true
这一页几条: 10
第一条: 示例条目 1
```

| 行 | 说明 | 不看会怎样 |
|---|---|---|
| `status: 200` | 请求成功 | 不看的话，500 也会往下走 |
| `content-type: application/json` | 响应体确实是 JSON | 不看的话，拿到 HTML 也去 `.json()` |
| `total: 30` | 服务器说一共 30 条 | 这是"应该有 30 条"，不是你抓到了 30 条 |
| `这一页几条: 10` | 你实际拿到 10 条 | 和上一行一比，就知道还有 20 条没抓 |
| `第一条: 示例条目 1` | 数据可用 | 这一行对了，整条链路才通 |

**第三行和第四行的对比，是这一周最重要的一次比较。** `total` 是对方说的，`data.length` 是你拿到的 —— **不等，就还有下一页。**

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `TypeError: fetch failed` / `ECONNREFUSED` | 服务器没跑 | 起 mock-server |
| `status: 404` | URL 拼错（比如 `/api/item`） | 对照第 2 步的端点表 |
| `Cannot read properties of undefined` | `data` 不存在，返回结构和你想的不一样 | 先 `console.log(body)`，别猜 |
| `total: undefined` | 字段名不对（真站可能叫 `count`） | 同上，先打印整个 body |

---

# 第 4 步：`res.json()` 的坑（20 分钟）

## 4.1 做什么 / 为什么

**做什么：** 故意请求 `/api/html-error`，亲手触发 `SyntaxError`，再改成正确写法。

**为什么这是这一周最值钱的 20 分钟：** 这个错你以后每个月都会遇到一次，每次第一反应都是"对方挂了"。看清一次因果链，以后省掉无数次瞎猜。

## 4.2 操作

新建 `error-case.js`：

```javascript
// error-case.js —— 亲手制造 SyntaxError
// 用法：node error-case.js

async function main() {
  const res = await fetch("http://localhost:3001/api/html-error");

  console.log("status:", res.status);
  console.log("content-type:", res.headers.get("content-type"));

  const body = await res.json();

  console.log(body);
}

main();
```

```text
node error-case.js
```

再写正确版本 `error-case-fixed.js`：

```javascript
// error-case-fixed.js —— 先看类型再解析
// 用法：node error-case-fixed.js

async function fetchJson(url) {
  const res = await fetch(url);
  const type = res.headers.get("content-type") || "";

  // 第一层：状态码
  if (!res.ok) {
    const text = await res.text();
    const preview = text.slice(0, 120).replace(/\s+/g, " ");
    throw new Error("HTTP " + res.status + "，响应开头：" + preview);
  }

  // 第二层：内容类型
  if (!type.includes("application/json")) {
    const text = await res.text();
    throw new Error("对方返回的不是 JSON，而是 " + type + "，开头：" + text.slice(0, 80));
  }

  // 两层都过了，才解析
  return await res.json();
}

async function main() {
  try {
    const body = await fetchJson("http://localhost:3001/api/html-error");
    console.log(body);
  } catch (err) {
    console.log("抓到错误：", err.message);
  }
}

main();
```

## 4.3 屏幕上应该看到什么

**错误版本：**

```text
status: 500
content-type: text/html; charset=utf-8
<anonymous_script>:1
<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head><body><h1>Internal Server Error</h1><p>服务器开小差了，请稍后再试。</p></body></html>
^

SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
    at JSON.parse (<anonymous>)
    at parseJSONFromBytes (node:internal/deps/undici/undici:5880:19)
    at successSteps (node:internal/deps/undici/undici:5861:27)
    at fullyReadBody (node:internal/deps/undici/undici:4753:9)
    at async consumeBody (node:internal/deps/undici/undici:5870:7)
    at async file:///B:/OPC-Distance_study/.../error-case.js:9:24

Node.js v22.22.2
```

**读这段报错，只看四个地方：**

| 位置 | 内容 | 说明 |
|---|---|---|
| 第一行 | `status: 500` | **你的日志已经告诉你原因了** |
| 第二行 | `content-type: text/html` | 第二重证据 |
| `^` 指的那行 | `<!DOCTYPE html>` | 它解析的是 HTML |
| 最后一句 | `Unexpected token '<'` | 具体是 `<` 让它失败 |

**"Unexpected token '<'" 的正确读法：拿到以 `<` 开头的内容，就是拿到了 HTML。** 以后看到这个错直接查 `content-type`，不要在 JSON 格式上找问题。

**修好的版本：**

```text
抓到错误： HTTP 500，响应开头：<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head><body><h1>Internal Server Error</h1><p>服务器开小差了，请稍后再试。</p></body></html>
```

一条能读的日志。它给足了三件事：状态码、对方返回的格式、开头长什么样。拿它去问 AI 或去搜索，一次就能问对。

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 报错指向 `res.json()` 但状态是 200 | 200 也可能返回 HTML（很多站出错时返回 200 + 错误页） | 状态码不够，**必须再看 `content-type`** |
| `res.ok` 判断不出 429 | `res.ok` 只对 200—299 为 true | 429 会走 `!res.ok` 分支，正确 |
| `err.message` 是空的 | 抛的不是 `Error` 对象 | 用 `err.message \|\| String(err)` |

**为什么 `res.ok` 比 `res.status === 200` 好：** `204 No Content`、`201 Created` 也是成功，用 `res.ok` 不会误判。

---

# 第 5 步：处理 429 限流（15 分钟）

## 5.1 做什么 / 为什么

**做什么：** 识别 429，按 `Retry-After` 等待，再重试。

**为什么必须处理：** **不处理 429 的脚本会在第 3 页静默停下。** 如果代码不检查状态码，`429` 返回的 JSON 里没有 `data`，`body.data.length` 直接抛错；更糟的是你 `try/catch` 了却直接 `continue` —— 于是"30 条抓了 20 条"，你还以为抓全了。

## 5.2 操作

新建 `limit-case.js`：

```javascript
// limit-case.js —— 识别 429 并等待重试
// 用法：node limit-case.js

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, maxRetry) {
  for (let attempt = 1; attempt <= maxRetry; attempt += 1) {
    const res = await fetch(url);
    console.log("第 " + attempt + " 次请求，status = " + res.status);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") || 2);
      console.log("  被限流，等 " + retryAfter + " 秒后重试");
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    return await res.json();
  }
  throw new Error("重试 " + maxRetry + " 次仍然被限流，放弃");
}

async function main() {
  try {
    const body = await fetchWithRetry("http://localhost:3001/api/limit", 4);
    console.log("拿到数据：", body);
  } catch (err) {
    console.log("失败：", err.message);
  }
}

main();
```

## 5.3 屏幕上应该看到什么

**第一次跑**（服务刚启动，计数从 0 开始）：

```text
第 1 次请求，status = 200
拿到数据： { ok: true, hit: 1, message: '第 1 次请求成功' }
```

**第二次跑：**

```text
第 1 次请求，status = 200
拿到数据： { ok: true, hit: 2, message: '第 2 次请求成功' }
```

**第三次跑：**

```text
第 1 次请求，status = 429
  被限流，等 2 秒后重试
第 2 次请求，status = 200
拿到数据： { ok: true, hit: 4, message: '第 4 次请求成功' }
```

**注意 `hit` 从 2 跳到 4。** 因为第 3 次是 429、第 4 次才 200。这说明：**被限流的请求也计入对方的计数，重试不是免费的。**

**把 `maxRetry` 改成 1 再跑：**

```text
第 1 次请求，status = 429
  被限流，等 2 秒后重试
失败：重试 1 次仍然被限流，放弃
```

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 一直 200，试不出 429 | 重启了服务器，计数清零 | 别重启，连着跑三次 |
| 无限循环 | `attempt` 没递增，或写成了 `while(true)` | 用 `for (let attempt = 1; attempt <= maxRetry; attempt += 1)` |
| 等太久 | `Retry-After` 单位是秒，你当毫秒用了 | 乘 1000 |
| 真站没给 `Retry-After` | 这个头是可选的 | 兜底 2 秒，之后每次翻倍（指数退避） |

**为什么重试次数必须设上限：** 对方封你一整天时，脚本会一直等、一直重试、把日志写满。**上限 3—5 次，超过就报错退出，让人来看。**

---

# 第 6 步：处理超时（15 分钟）

## 6.1 做什么 / 为什么

**做什么：** 请求 `/slow`（拖 5 秒），用 `AbortSignal.timeout` 在 2 秒时主动放弃。

**为什么必须有超时：** **没有超时的 `fetch` 会一直等下去。** 对方连接建立了但不回数据，脚本就挂在那里，一晚上过去一条没抓，日志里连错误都没有。**这是最难排查的故障：没有报错，也没有进展。**

## 6.2 操作

新建 `timeout-case.js`：

```javascript
// timeout-case.js —— 2 秒超时，主动放弃
// 用法：node timeout-case.js

async function fetchWithTimeout(url, ms) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  return await res.json();
}

async function main() {
  const start = Date.now();
  try {
    const body = await fetchWithTimeout("http://localhost:3001/slow", 2000);
    console.log("成功：", body);
  } catch (err) {
    const used = Date.now() - start;
    console.log("耗时约 " + Math.round(used / 100) / 10 + " 秒");
    console.log("err.name:", err.name);
    console.log("err.message:", err.message);
  }
}

main();
```

## 6.3 屏幕上应该看到什么

```text
耗时约 2 秒
err.name: TimeoutError
err.message: The operation was aborted due to timeout
```

**注意 `err.name` 是 `TimeoutError`，不是 `AbortError`。**

| 情况 | `err.name` |
|---|---|
| 时间到了，`AbortSignal.timeout` 触发 | `TimeoutError` |
| 你用 `controller.abort()` 手动取消 | `AbortError` |

**为什么分清：** 处理方式不同。超时该重试；手动取消（比如用户点了"停止"）不该重试。

**把超时改成 6000 毫秒再跑：**

```text
成功： { ok: true, message: '我等了 5 秒才回复' }
```

**这一对对比说明：超时不是"请求失败"，是"你不想再等了"。** 对方 5 秒后确实回了，只是你没等。

## 6.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `AbortSignal.timeout is not a function` | Node 低于 18 | `node -v` 确认，低于 18 就升级 |
| 5 秒后成功，没有超时 | 超时值太大 | 确认传的是 `2000` 不是 `2000 * 1000` |
| name 是 `AbortError` | 你用了 `setTimeout(() => controller.abort())` | 那种写法也能用，`AbortSignal.timeout` 更短 |

**为什么不用更简单的做法：** 你可能想"加个 `Promise.race` 不就行了"：

```javascript
Promise.race([fetch(url), sleep(2000).then(() => { throw new Error("超时"); })]);
```

**不行。** `Promise.race` 只是让**你**不等了，那个 `fetch` 底层连接还开着、还占资源。跑几千次会撞上 `EMFILE: too many open files`。`AbortSignal` 才是真的把连接掐掉。

---

# 第 7 步：User-Agent 与换成真实站点（10 分钟）

## 7.1 做什么 / 为什么

**做什么：** 用 `/api/echo` 看自己的请求头，决定要不要改 `User-Agent`；再写清"换真站要改哪三行"。

**结论先给：不改。**

## 7.2 操作

新建 `ua-case.js`：

```javascript
// ua-case.js —— 看自己发出去的请求头
// 用法：node ua-case.js

async function main() {
  const res = await fetch("http://localhost:3001/api/echo");
  const body = await res.json();
  console.log(JSON.stringify(body.headers, null, 2));
}

main();
```

## 7.3 屏幕上应该看到什么

```text
{
  "host": "localhost:3001",
  "connection": "keep-alive",
  "accept": "*/*",
  "accept-language": "*",
  "sec-fetch-mode": "cors",
  "user-agent": "node",
  "accept-encoding": "gzip, deflate"
}
```

**`user-agent: node` 就是你的身份。** 你的 Node 版本可能显示 `undici`，意思一样：一个自动程序。用 `curl` 请求时是 `"user-agent": "curl/8.21.0"`。

**三个想改的理由，都不成立：**

| 想改的理由 | 为什么不成立 |
|---|---|
| "不改会被拦" | 被拦的真实原因是**频率**和**要登录**，不是 UA。1 秒 1 次请求，UA 是 `node` 一样能拿到 |
| "改了就像真人" | 你一秒请求 10 次，UA 写 `Chrome` 反而更可疑 —— 真人不会这么干 |
| "别人都这么写" | 伪装 UA 在很多站条款里明确算"规避技术措施"。这不是技术，是把柄 |

**三条不改的理由：**

```text
一、诚实标注身份，是"善意"的证据。出事时你能证明自己没有隐藏。
二、改 UA 而不改请求节奏，等于穿帮的伪装，比不伪装更容易被风控。
三、这一周所有练习都在自己的服务器上，伪装没有收益。
```

**唯一要改的情况：** 对方明确要求你标注自己。有的开放平台要求 `User-Agent: MyApp/1.0 (联系邮箱)`，方便出问题时联系你。这时候改是遵守约定，不是伪装。

## 7.4 换成真实站点要改哪三行

**只改三行：**

```javascript
// 第 1 行：地址
const API = "https://真实域名/api/items";

// 第 2 行：请求之间加 1 秒间隔
await sleep(1000);

// 第 3 行：超时给到 10 秒
const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
```

**除此之外一个字都不用改。** 第 4 步的 `fetchJson`（先判状态码再判类型）、第 5 步的 429 重试、第 6 步的超时，全都和数据从哪来无关。**这就是那六个假端点的价值：把异常处理练熟，换真站时只有地址变了。**

**换之前必须做三件事（第 71 节的结论，这里执行）：**

```text
一、看 真实域名/robots.txt，确认要抓的路径不在 Disallow 里。
二、看服务条款有没有"禁止自动化抓取"。
三、确认返回字段里没有个人信息。
```

## 7.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `user-agent` 是 `undici` | Node 版本不同，默认值不同 | 正常，不是错误 |
| 改了 UA 被拦得更狠 | 伪装被识别 | 改回默认，把频率降下来 |
| 请求真站被 403 | 可能按 UA 或 IP 拦 | 先确认条款允许；不允许就换数据源 |

---

# 第 8 步：故意犯四个错（15 分钟）

## 错误 1：把引号加进 JS 字符串里的 URL

**现象：** 请求返回 404，参数完全没生效。因为引号变成了 URL 的一部分，实际路径是 `/"http://...`。

**操作：** 把 `API` 改成：

```javascript
const API = '"http://localhost:3001/api/items?page=1&size=10"';
```

**原因：** `&` 要在 **cmd 里**加引号保护；JS 字符串不需要，字符串边界已经是双引号了。

**怎么查：** `console.log(API)` 看真实字符串；或在服务器端打印 `req.url`，你会看到带引号的怪路径。

## 错误 2：不看状态码直接 `.json()`

**现象：**

```text
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

**操作：** 把 `error-case-fixed.js` 的两层判断删掉，直接 `return await res.json()`。

**原因：** 对方返回 500 + HTML 错误页，你拿 HTML 去 `JSON.parse`。

**怎么查：** 三个动作按顺序 —— ① 打印 `res.status`；② 打印 `res.headers.get("content-type")`；③ 打印 `(await res.text()).slice(0, 200)`。三行日志定位 90% 的接口问题。

## 错误 3：端口被占

**现象：**

```text
Error: listen EADDRINUSE: address already in use :::3001
    at Server.setupListenHandle [as _listen2] (node:net:1937:16)
  code: 'EADDRINUSE',
  syscall: 'listen',
  address: '::',
  port: 3001
```

**操作：** 服务器还在跑，你在另一个窗口又 `node mock-server.js`。

**原因：** 一个端口同时只能被一个程序监听。

**怎么查：**

```text
netstat -ano | findstr :3001
```

```text
  TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       23144
```

最后一列是 PID，`taskkill /PID 23144 /F`。**更常见的做法是回那个终端按 `Ctrl + C` —— 先找终端，别急着杀进程。**

## 错误 4：超时设成 0，或者没设

**现象 A（设 0）：** 每个请求立刻失败：

```text
err.name: TimeoutError
err.message: The operation was aborted due to timeout
```

**现象 B（没设）：** 请求 `/slow` 卡 5 秒以上；对方彻底不回时一直卡着，终端没有任何输出。

**原因：** `AbortSignal.timeout(0)` 是"0 毫秒后取消"，等于立刻取消。不传 `signal` 就是永远等。

**怎么查：** 在 `fetch` 外面套计时：

```javascript
const start = Date.now();
const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
console.log("本次耗时", Date.now() - start, "毫秒");
```

**合理的值：** 本地 2 秒；真实公开接口 10 秒；文件下载 60 秒。**没有通用值，只有"这批请求正常耗时 × 3"。**

---

# 第 9 步：写学习笔记（10 分钟）

**打开 `第02节课/02-笔记/NOTES.md`，按这十二个小标题填，一个字都不要改。**

```markdown
# 第 72 节课学习笔记

## 一、mock-server 是干什么的，为什么不用真网站

## 二、我请求过的端点

| 端点 | 状态码 | Content-Type | 说明 |
|---|---|---|---|
| /api/items?page=1&size=10 | | | |
| /api/items?page=999 | | | |
| /api/html-error | | | |
| /api/limit（第 3 次） | | | |
| /slow | | | |

## 三、`total` 和 `data.length` 的区别

## 四、`res.json()` 报 SyntaxError 的完整因果链

从"我发请求"写到"我看到报错"，中间有几步：

## 五、先看状态码再看类型再看内容

| 顺序 | 看什么 | 决定什么 |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |

## 六、429 的处理流程

`Retry-After` 是什么：

我的重试上限是几次，为什么：

## 七、超时的两种错误名

| 情况 | `err.name` | 该不该重试 |
|---|---|---|
| `AbortSignal.timeout` 触发 | | |
| 手动 `controller.abort()` | | |

## 八、User-Agent 我为什么不改

三条理由：

## 九、换成真实站点要改哪三行

```javascript
（凭记忆写，不要看课件）
```

## 十、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| URL 里加引号 | | |
| 不看状态码 | | |
| 端口被占 | | |
| 超时设 0 或没设 | | |

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] mock-server 能启动，11 个端点在终端里列出来了
- [ ] 我用 `curl.exe -i` 看过至少 5 个端点的完整响应头
- [ ] 我亲手触发过 `Unexpected token '<'` 这个报错
- [ ] 我写过一个能重试 429 的 `fetchWithRetry`
- [ ] 我看到过 `TimeoutError`，也说得出它和 `AbortError` 的区别
- [ ] `接口清单.md` 填完了
```

`02-笔记` 目录不存在就新建。**不要在 `01-任务` 里建笔记**，两个文件夹用途不同。

---

# 第 10 步：课后练习

## 练习一：让 `fetchJson` 支持重试 5xx

现在遇到 500 直接抛错。改成 **500—599 重试，最多 2 次，每次间隔 1 秒**，并打印每一次：

```text
第 1 次：HTTP 500，1 秒后重试
第 2 次：HTTP 500，1 秒后重试
第 3 次：HTTP 500，放弃
```

用 `/api/html-error` 测，它永远返回 500。

## 练习二：给 429 加日志

现在只在最后抛一句"重试 N 次仍然被限流"。改成每次被限流都记一行：第几次、等了多久、`Retry-After` 的值。跑第三次触发 429，把完整日志贴进 `接口清单.md`。

## 练习三：做一个体检脚本

写 `health-check.js`，依次请求四个端点，最后打印一张表。**任何一个端点失败都不能中断**，全部跑完再输出：

```text
端点                     状态   类型                 结果
/api/items?page=1       200    application/json     OK
/api/items?page=999     200    application/json     空数组
/api/html-error         500    text/html            对方出错
/slow                   200    application/json     超时（2秒）
```

## 练习四：把超时做成命令行参数

```text
node timeout-case.js 500
node timeout-case.js 8000
```

**提示：** `process.argv[2]` 是字符串，要 `Number()`。

## 练习五：用自己的话讲清

```text
1. 为什么"对方返回了 500"会导致我这里报 JSON 解析错误？
2. `res.ok` 和 `res.status === 200` 有什么区别？
3. 为什么 429 之后要等，而不是立刻重试？
4. 为什么用了 `Promise.race` 做超时还不够？
5. 换成真实站点，除了改地址还要做哪三件事？
```

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说出 2xx / 4xx / 5xx 各是谁的问题
- [ ] 我知道 `res.ok` 什么时候为 true
- [ ] 我能解释 `content-type` 为什么比状态码更可信
- [ ] 我知道 429 是什么，以及 `Retry-After` 的作用
- [ ] 我知道 `TimeoutError` 和 `AbortError` 的区别
- [ ] 我能说出不改 User-Agent 的三条理由

## B. 实操

- [ ] `collector/mock-server.js` 能启动，打印 11 个端点
- [ ] `collector/first-fetch.js` 输出 5 行，`total` 是 30
- [ ] `collector/error-case-fixed.js` 打印一条能读的错误信息，不是堆栈
- [ ] `collector/limit-case.js` 第三次能自动等待并重试成功
- [ ] `collector/timeout-case.js` 打印 `err.name: TimeoutError`
- [ ] `collector/接口清单.md` 至少 6 行

## C. 排错

- [ ] 看到 `Unexpected token '<'` 我知道去查 `content-type`
- [ ] 看到 `EADDRINUSE` 我知道先找终端，再 `netstat -ano | findstr :3001`
- [ ] 看到 `fetch failed` 我知道先确认服务器在跑
- [ ] cmd 里 URL 带 `&` 我知道必须加引号
- [ ] 脚本"跑完但一条数据没有"时，我知道先怀疑软封禁和状态码

## D. 笔记

- [ ] 十二个小标题都在，顺序和课件一致
- [ ] 第四节我自己画出了因果链
- [ ] 第九节三行代码是默写的
- [ ] "我还不懂的词"至少 2 个

## 本节课要能说出口的一句话

> **读接口的顺序是死的：先看状态码，再看内容类型，最后才解析；`res.json()` 报 `Unexpected token '<'` 不是对方挂了，是它给你返回了一张 HTML 错误页。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `Cannot find module 'express'` | 当前目录 | `dir node_modules\express`，没有就 `npm install express` |
| `EADDRINUSE :::3001` | 有没有旧进程 | `Ctrl + C`，或 `netstat -ano \| findstr :3001` 后 `taskkill` |
| `curl: (7) Failed to connect` | 服务器在不在跑 | 回服务器窗口看日志 |
| `'size' 不是内部或外部命令` | URL 没加引号 | 整个 URL 用双引号包住 |
| `Unexpected token '<'` | `content-type` | 是 `text/html` 就别 `.json()`，先 `res.text()` |
| `Cannot read properties of undefined (reading 'length')` | `body.data` 存在吗 | 先 `console.log(body)` 看真实结构 |
| 429 一直不恢复 | 是不是没等 | 按 `Retry-After` 等，或指数退避 |
| `TimeoutError` 但对方其实很快 | 超时值太小 | 本地 2 秒，真站 10 秒 |
| 改了 UA 更糟 | 伪装被识别 | 改回默认，压频率 |
| 中文变成 `\u` 转义 | 正常 | Express 的 JSON 序列化行为 |
