# 第 15 节课：认识服务器——你的电脑也能当服务器

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前两周你做的页面，只在你自己的电脑上能看。别人要访问，打不开。
> 这节课你要做一件事：**让一个程序在你的电脑上"等着接电话"，然后你自己给它打电话。**

**建议用时**：100 分钟
**你需要先完成**：第 1—14 节课（会用 Node.js 跑 `.js` 文件）

---

# 第 0 步：服务器到底是什么（10 分钟）

## 0.1 先破除神秘感

**"服务器"不是一台特殊的机器，是一个"一直在等着的程序"。**

**你已经在用的两个词，要先分清：**

| 词 | 是什么 |
|---|---|
| 服务器（硬件） | 一台不关机的电脑，放在机房里 |
| 服务器（程序） | 一个一直在监听某个端口的程序 |

**今天做的是第二种：** 一个跑在你自己电脑上的程序。

**它和普通 `.js` 文件的区别只有一点：**

```text
普通脚本：跑完就结束，退出
服务器程序：跑起来不退出，一直等着别人来请求
```

## 0.2 用餐厅比喻一次讲清

| 概念 | 餐厅里的对应 |
|---|---|
| 服务器程序 | 餐厅本身（一直开着门） |
| 端口（port） | 门牌号（3000 号门） |
| 请求（request） | 客人走进来说"我要一碗面" |
| 路由（route） | 菜单上不同的菜（点面走一个流程，点饭走另一个） |
| 响应（response） | 服务员端上来的东西 |
| 状态码（status code） | 服务员说的话："好的马上来"（200）、"这个没有"（404） |

**关键理解：** 服务器不是"主动做事"的。**它只是站在那里等，有人来才动。**

## 0.3 你其实每天都在当客户端

打开浏览器输入网址，浏览器就是**客户端**（client）。它发出请求，服务器给回应。

```text
你的浏览器（客户端）  ──请求──>  服务器
                      <──响应──
```

**今天你要同时扮演两个角色：**

1. 写一个服务器程序（当服务器）；
2. 用浏览器 / 命令行去访问它（当客户端）。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `server.js` | `03-练习代码` | 你的第一个服务器 |
| `logs.md` | `03-练习代码` | 你的请求记录 |

---

# 第 1 步：先确认环境（10 分钟）

## 1.1 检查 Node.js 版本

**操作：**

1. 按 `Win + R`，输入 `cmd`，回车。
2. 在黑窗口里输入：

   ```text
   node -v
   ```

3. 回车。

**应该看到类似：**

```text
v22.22.2
```

**为什么要在意版本：**
本课程用 Node.js 22 的写法。如果显示 `v20`、`v16` 或更低，去 `参考手册/01-环境搭建.md` 升级。

**版本必须是 v22 或更高。** 22 以下跑不了第 5 周的 `node:sqlite`（Node 22 才加的模块），越早升级越省事——等到第 5 周才发现要重装，前面几节课的终端输出会和课件对不上。

## 1.2 检查 npm

```text
npm -v
```

**应该看到类似：**

```text
10.9.7
```

**`npm` 是什么：**
Node Package Manager，Node 的"包管理器"。用来下载别人写好的代码库。

**后面第 17 节课会用它装 Express。今天还用不到，但先确认它有。**

## 1.3 进入本节课文件夹

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第03周-后端与对话\第01节课\03-练习代码
```

**你会看到只有一个 `说明.md`。服务器代码要你自己写。**

---

# 第 2 步：写第一个服务器（20 分钟）

## 2.1 新建 server.js

**操作：**

1. 在 `03-练习代码` 里右键 → 新建 → 文本文档。
2. 改名 `server.js`，扩展名提示点“是”。
3. 用 Visual Studio Code 打开。
4. **自己敲**下面代码。

```javascript
const http = require("http");

const server = http.createServer((req, res) => {
  console.log("收到请求：", req.method, req.url);

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("你好，这是第一个服务器返回的内容");
});

server.listen(3000, () => {
  console.log("服务器已启动：http://localhost:3000");
});
```

5. `Ctrl + S` 保存。

## 2.2 逐行读懂

### 第 1 行：`require("http")`

```javascript
const http = require("http");
```

**`require` 是什么：**
把 Node 内置的某个模块"拿过来用"。

**`"http"` 是什么：**
Node 自带的 HTTP 模块。**HTTP 是浏览器和服务器说话用的那套规则（协议）。**

**为什么不需要安装：**
`http` 是 Node 内置的，装了 Node 就有。**只有第三方模块（比如 Express）才需要 `npm install`。**

### 第 2—8 行：创建服务器

```javascript
const server = http.createServer((req, res) => {
  ...
});
```

**`http.createServer` 做什么：** 创建一个服务器对象。

**括号里那个函数是什么：**
**"有人来请求时，要执行什么"。** 这个函数叫**处理函数**（handler）。

**它每次被调用时会收到两个东西：**

| 参数 | 是什么 | 你可以用它做什么 |
|---|---|---|
| `req` | request（请求） | 看对方要什么：方法、路径、参数、提交的数据 |
| `res` | response（响应） | 决定返回什么：状态码、内容类型、内容 |

**注意：这个函数不是"运行一次"，而是"每次有请求就运行一次"。**

### 第 3 行：打印日志

```javascript
console.log("收到请求：", req.method, req.url);
```

**`req.method`：** 请求方法。常见的有：

```text
GET     获取（打开页面、读数据）
POST    提交（提交表单、发消息）
PUT     整体更新
DELETE  删除
```

**`req.url`：** 请求的路径。比如访问 `http://localhost:3000/abc`，它就是 `"/abc"`。

**为什么要打印这个：**
因为这是你唯一能"看到服务器在想什么"的方式。**这是最基础的调试手段。**

### 第 4 行：`res.writeHead(200, {...})`

```javascript
res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
```

**`writeHead` 做什么：** 写"响应头"（response header）。

**两个参数：**

**第一个 `200`：状态码。**

| 状态码 | 意思 | 什么时候用 |
|---|---|---|
| `200` | 成功 | 正常返回内容 |
| `301` / `302` | 重定向 | 页面搬家了 |
| `400` | 请求有问题 | 用户提交的数据格式不对 |
| `401` | 没登录 | 需要先登录 |
| `403` | 没权限 | 登录了但不该看 |
| `404` | 找不到 | 路径不存在 |
| `500` | 服务器内部错误 | 你的代码崩了 |

**记住这四个就够：`200` 成功、`400` 你传错了、`404` 没这东西、`500` 我崩了。**

**第二个 `{ "Content-Type": ... }`：内容类型。**

```text
text/plain              纯文本
text/html               网页
application/json        JSON 数据
image/png               图片
```

**`; charset=utf-8` 是什么：**
告诉浏览器"这段内容用 UTF-8 编码"。

**不写会怎样：** 中文会变成乱码 `ä½ å¥½`。

**这一步是新手最容易漏的。** 明明代码对了，看到乱码就以为写错了。

### 第 5 行：`res.end(...)`

```javascript
res.end("你好，这是第一个服务器返回的内容");
```

**做什么：** 把内容发出去，**并结束这次响应**。

**关键：每次请求必须有且只有一次 `end`。**

**为什么：**
因为 HTTP 是"一问一答"。`end` 就是"我说完了"。

**不调用 `end` 会怎样：** 浏览器一直转圈，等到超时才放弃。

**这是服务器编程最常见的错误之一。** 你的代码可能看起来跑通了（控制台有日志），但浏览器一直加载。

### 第 10—12 行：启动监听

```javascript
server.listen(3000, () => {
  console.log("服务器已启动：http://localhost:3000");
});
```

**`listen(3000)` 做什么：** 让服务器开始监听 3000 端口。

**`端口（port）` 是什么：**
一台电脑上可以同时跑很多服务。**端口就是"门牌号"，用来区分是哪个服务。**

**`localhost` 是什么：**
"本机"。`http://localhost:3000` 和 `http://127.0.0.1:3000` 是同一个东西。

**为什么用 3000：**
习惯用法。前端开发服务器常用 3000、5173、8080。**只要是 1024 以上的数字，基本都能用。**

**回调函数（第二个参数）什么时候执行：**
服务器启动成功后执行一次。**只是打个提示，不是必须的。**

## 2.3 现在启动它

**操作：**

1. 在 Visual Studio Code 里按 `Ctrl + ~` 打开终端。
2. 确认路径是 `第01节课\03-练习代码`（不是的话，`cd` 加空格，把文件夹拖进来）。
3. 输入：

   ```text
   node server.js
   ```

4. 回车。

**屏幕上应该看到：**

```text
服务器已启动：http://localhost:3000
```

**然后……光标不动了，没有回到提示符。**

**这不是卡住了。这是正常的。**

**为什么：**
因为服务器程序不会结束，它在等请求。**终端被这个程序"占住"了。**

**`Ctrl + C` 可以停止它。** 记住这个，等下要用很多次。

---

# 第 3 步：给它发第一个请求（15 分钟）

## 3.1 用浏览器访问

**操作：**

1. **不要关掉那个终端。** 让它一直跑着。
2. 打开浏览器，在地址栏输入：

   ```text
   http://localhost:3000
   ```

3. 回车。

**你会看到：**

```text
你好，这是第一个服务器返回的内容
```

**同时看终端，会多出一行：**

```text
收到请求： GET /
```

**恭喜，你刚刚完成了一次完整的 HTTP 交互。**

## 3.2 再试几个路径

**在浏览器里依次访问：**

```text
http://localhost:3000/abc
http://localhost:3000/hello
http://localhost:3000/a/b/c
```

**你会发现：返回的内容完全一样。**

**为什么：** 因为你的代码根本没看 `req.url`。**不管请求什么路径，都返回同一句话。**

**这就是为什么需要"路由"。** 第 17 节课会讲。

**但注意终端：** 每次访问都会打印不同的路径。**服务器知道对方要什么，只是我们没处理。**

## 3.3 用命令行访问（更专业的方式）

**打开一个新的 cmd 窗口（不要关掉服务器那个），输入：**

```text
curl http://localhost:3000
```

**你会看到返回的内容直接打印出来。**

**`curl` 是什么：**
一个命令行工具，用来发 HTTP 请求。**Windows 10 以后自带。**

**为什么推荐用它而不是浏览器：**

- 能看到完整的响应头；
- 能发 POST 请求；
- 能自定义请求头；
- 脚本化，能自动化测试。

**看响应头：**

```text
curl -i http://localhost:3000
```

**`-i` 是"include headers"，把响应头也显示出来。**

**你应该看到类似：**

```text
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Date: Mon, 16 Nov 2026 07:20:00 GMT
Connection: keep-alive
Content-Length: 60

你好，这是第一个服务器返回的内容
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `HTTP/1.1 200 OK` | 协议版本 + 状态码 + 状态说明 |
| `Content-Type` | 内容类型和编码 |
| `Date` | 服务器时间（UTC） |
| `Connection: keep-alive` | 这个连接可以复用 |
| `Content-Length` | 内容有多少字节 |

**这就是 HTTP 响应的真实样子。**

## 3.4 记录你的第一次请求

**在 `03-练习代码` 里新建 `logs.md`，写下：**

```markdown
# 我的服务器请求记录

## 第一次成功

- 时间：
- 请求路径：http://localhost:3000
- 浏览器显示：
- 终端显示：
- curl 看到的响应头：

## 我试过的其它路径

| 路径 | 返回内容 | 终端打印的 url |
|---|---|---|
| /abc | | |
| /hello | | |
| /a/b/c | | |
```

---

# 第 4 步：让服务器"认路"（20 分钟）

## 4.1 现在的问题

不管访问什么路径都返回同一句话。**这不像一个真正的网站。**

## 4.2 根据路径返回不同内容

**改造 `server.js`。自己敲。**

```javascript
const http = require("http");

const server = http.createServer((req, res) => {
  console.log("收到请求：", req.method, req.url);

  const url = req.url;

  if (url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>首页</h1><p>欢迎来到我的服务器</p>");
    return;
  }

  if (url === "/about") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>关于</h1><p>这是一个学习用的服务器</p>");
    return;
  }

  if (url === "/time") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`现在时间：${new Date().toLocaleString()}`);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>404</h1><p>这个页面不存在</p>");
});

server.listen(3000, () => {
  console.log("服务器已启动：http://localhost:3000");
});
```

## 4.3 重启服务器

**关键操作：改了服务器代码必须重启。**

**操作：**

1. 回到终端，按 `Ctrl + C` 停止旧服务器。
2. 再输入 `node server.js` 启动新的。

**为什么必须重启：**
因为 Node 启动时把代码读进内存了。**改了文件，内存里还是旧代码。**

**这个问题第 16 节课会用一个工具解决（热重载）。今天先手动重启。**

## 4.4 逐个测试

**在浏览器里访问：**

| 地址 | 应该看到 |
|---|---|
| `http://localhost:3000/` | 首页 + 欢迎语 |
| `http://localhost:3000/about` | 关于 + 说明 |
| `http://localhost:3000/time` | 当前时间 |
| `http://localhost:3000/xxx` | 404 + 页面不存在 |

**注意 `/time`：** 每刷新一次，时间会变。**这说明服务器是"实时计算"，不是返回固定内容。**

## 4.5 理解这几个 `return`

```javascript
if (url === "/") {
  ...
  return;
}
```

**为什么每个分支后面都有 `return`：**

因为如果没有，代码会继续往下走。**假设访问 `/`：**

```text
url === "/" 成立 → 返回首页 → 没有 return
↓
继续检查 url === "/about" → 不成立
↓
继续检查 url === "/time" → 不成立
↓
执行最后的 404 代码 → 报错！
```

**报错内容要看你漏的是哪一种：**

**情况 A：你漏了 `return`，后面又执行了 `res.writeHead`**

```text
Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client
    at ServerResponse.writeHead (node:_http_server:354:11)
```

**情况 B：你漏了 `return`，后面又执行了 `res.end`（没再调 writeHead）**

```text
Error [ERR_STREAM_WRITE_AFTER_END]: write after end
    at ServerResponse.end (node:_http_outgoing:1100:15)
```

**两个报错的意思是同一件事：一次请求只能响应一次。**

- `HEADERS_SENT` = "响应头已经发出去了，不能再改"
- `WRITE_AFTER_END` = "已经说完了，不能再说话"

**这个错误在服务器开发里极其常见。** 记住：**每个分支结尾必须有 `return`。**

**还有一个更坑的地方：** 这两种报错发生时，**浏览器可能已经正常收到第一次的内容了**。所以你在浏览器里看不出问题，只有终端在报错。

**这就是为什么"服务器一定要看终端"。**

## 4.6 故意制造这个错误

**操作：**

1. 把 `/` 分支里的 `return;` 删掉；
2. 重启，访问首页。

**你会看到：** 页面可能正常显示，但终端报 `ERR_HTTP_HEADERS_SENT`。

**为什么页面正常但报错：**
因为第一次 `res.end` 已经把内容发出去了，浏览器收到了。后面的 `res.end` 是第二次，服务器内部就报错了。

**这种"页面看起来正常但服务器报错"的情况最危险。** 因为你在浏览器里看不出问题。

**记得改回来。**

---

# 第 5 步：认识请求的四个部分（15 分钟）

## 5.1 一个请求长什么样

```text
GET /about HTTP/1.1
Host: localhost:3000
User-Agent: Mozilla/5.0 ...
Accept: text/html
```

**拆开看：**

| 部分 | 内容 | 在代码里怎么拿 |
|---|---|---|
| 方法 | `GET` | `req.method` |
| 路径 | `/about` | `req.url` |
| 协议版本 | `HTTP/1.1` | 不用管 |
| 请求头 | `Host`、`User-Agent` 等 | `req.headers` |
| 请求体 | GET 没有，POST 有 | 后面讲 |

## 5.2 看请求头

**改造代码，加一个 `/headers` 路由：**

```javascript
if (url === "/headers") {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(req.headers, null, 2));
  return;
}
```

**重启，访问 `http://localhost:3000/headers`。**

**你会看到类似：**

```json
{
  "host": "localhost:3000",
  "connection": "keep-alive",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  "accept": "text/html,application/xhtml+xml,...",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "zh-CN,zh;q=0.9"
}
```

**这些是什么：**

| 头 | 意思 |
|---|---|
| `host` | 你访问的域名和端口 |
| `user-agent` | 你用的浏览器和系统 |
| `accept` | 你希望收到什么类型的内容 |
| `accept-language` | 你希望什么语言 |

**为什么这些很重要：**

- `user-agent` 能判断用户用什么设备（做移动端适配）；
- `accept-language` 能判断用户语言（做多语言网站）；
- **但也都能伪造**（所以不能用来做安全判断）。

**`JSON.stringify(对象, null, 2)` 是什么：**

```text
第一个参数：要转换的对象
第二个参数：null（表示不做过滤）
第三个参数：2（缩进 2 个空格，为了好读）
```

**去掉第三个参数会变成一行。** 调试时加缩进很有用。

## 5.3 用 curl 发 POST 请求

**现在的服务器只处理 GET。我们加一个 POST 路由：**

```javascript
if (url === "/echo" && req.method === "POST") {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ received: body }));
  });

  return;
}
```

**这段代码在干什么：**

- `req.on("data", ...)` —— 数据是一块一块来的，每来一块就累加到 `body`；
- `req.on("end", ...)` —— 全部收完了，才开始处理。

**为什么要这样：**
因为请求体可能很大（比如上传文件）。**服务器是一边收一边处理的，不是一次性拿到完整内容。**

**这是 Node 的"流（stream）"机制。** 今天只要会用这个模式就行。

**重启，用 curl 测试：**

```text
curl -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d "{\"msg\":\"hello\"}"
```

**参数解释：**

| 参数 | 意思 |
|---|---|
| `-X POST` | 用 POST 方法 |
| `-H "..."` | 加一个请求头 |
| `-d "..."` | 请求体内容 |

**注意 Windows cmd 里的引号很麻烦。** 上面的写法用了 `\"` 转义。

**在 PowerShell 里更简单：**

```text
curl.exe -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d '{"msg":"hello"}'
```

**应该看到：**

```json
{"received":"{\"msg\":\"hello\"}"}
```

**你看到的是原始字符串，不是解析后的对象。** 因为 `body` 就是一段文字，我们没解析它。

**第 19 节课会讲怎么把它解析成对象。第 17 节课用 Express 之后会简单很多。**

## 5.4 一个必须知道的坑

**在 Windows 上，`curl` 可能是 PowerShell 的别名。**

**验证：**

```text
curl --version
```

**如果输出的是 `curl 8.x.x (x86_64-w64-mingw32)` 之类的，是真正的 curl。**

**如果报错说"无法识别 cmdlet"，说明你用错了。**

**解决：用 `curl.exe` 明确指定。**

**或者干脆用浏览器 + 一个简单的 HTML 页面来发 POST（第 18 节课会做）。**

---

# 第 6 步：故意犯五个错（15 分钟）

## 错误 1：端口被占用

**操作：**

1. 先启动一次服务器（`node server.js`）。
2. **不关这个终端**，再开一个新的终端，也运行 `node server.js`。

**你会看到：**

```text
Error: listen EADDRINUSE: address already in use :::3000
```

**`EADDRINUSE` 是什么：**
"Address already in use"，地址已被占用。

**为什么：** 3000 端口已经被第一个服务器占了。**一个端口同时只能被一个程序监听。**

**怎么解决：**

**方法一（推荐）：** 关掉旧的那个（`Ctrl + C`）。

**方法二：** 换个端口，改成 `listen(3001)`。

**方法三：** 找到占用端口的进程杀掉：

```text
netstat -ano | findstr :3000
taskkill /PID <上面查到的PID> /F
```

**这个错误在开发时天天遇到。** 记住 `EADDRINUSE` 这个名字就够了。

## 错误 2：忘了 `res.end()`

**操作：** 在 `/about` 分支里删掉 `res.end(...)` 这一行，只留 `writeHead`。

**会怎样：** 浏览器一直转圈，最后超时。

**为什么：**
`writeHead` 只是"准备要说"，`end` 才是"说完了"。**没说完整，浏览器就一直等。**

**怎么查：**
终端有"收到请求"日志，但浏览器没反应 → **先查 `res.end` 有没有调用。**

## 错误 3：`Content-Type` 写错

**操作：** 把首页的 `text/html` 改成 `text/plain`。

**会怎样：** 页面上直接显示 `<h1>首页</h1><p>欢迎...</p>` 这样的标签文字，不会渲染成标题。

**为什么：**
因为浏览器按 `Content-Type` 决定怎么处理内容。`text/plain` 就是"当纯文本显示"。

**怎么查：** 看 `curl -i` 输出的 `Content-Type` 那一行。

## 错误 4：忘写 `charset=utf-8`

**操作：** 把 `Content-Type` 改成只有 `text/html`，去掉 `; charset=utf-8`。

**会怎样：** 中文变成乱码。

**为什么：**
浏览器不知道用什么编码，可能默认用 ISO-8859-1（西欧编码），中文就乱了。

**规则：只要内容里有中文，必须写 `; charset=utf-8`。**

## 错误 5：漏了 `return` 导致重复响应

**操作：** 删掉 `/` 分支的 `return;`。

**会怎样：** 终端报错。**页面可能看起来还正常**（因为第一次响应已经发出去了）。

**报错是这两种之一：**

```text
Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client
```

```text
Error [ERR_STREAM_WRITE_AFTER_END]: write after end
```

**为什么：** 见第 4.6 步。**一次请求只能响应一次。**

## 五个错误总结

```text
EADDRINUSE                → 端口被占，关旧的或换端口
忘了 res.end()            → 浏览器一直转圈
Content-Type 错           → 标签被当文字显示
忘 charset=utf-8          → 中文乱码
漏 return                 → ERR_HTTP_HEADERS_SENT 或 WRITE_AFTER_END
```

**排查顺序：**

```text
① 终端有没有报错？
② 终端有没有打印"收到请求"？（有=请求到了，问题在响应）
③ 浏览器转圈 → 查 res.end
④ 中文乱码 → 查 charset
⑤ 页面显示标签 → 查 Content-Type
```

---

# 第 7 步：一个必须建立的概念（10 分钟）

## 7.1 服务器一直在跑，这是特性不是 bug

**你现在可能觉得"终端被占住了很麻烦"。**

**但这就是服务器的本质：它必须一直跑着，才能随时响应请求。**

**真实的服务器就是这样：**

```text
一台机器上，一个程序 24 小时不停跑着
有人访问，它响应
没人访问，它就在那里等着
```

**你以后部署到云服务器上，也是一模一样。**

## 7.2 那开发时怎么改代码

**开发时你需要"改了就生效"，而不是每次 `Ctrl + C` 再 `node server.js`。**

**第 16 节课会用一个工具解决：`node --watch`。**

**现在先记住这个手动流程：**

```text
改代码 → Ctrl + S 保存 → 回终端 Ctrl + C → node server.js → 刷新浏览器
```

**这五个动作会重复几百次。先练熟。**

## 7.3 你现在做的事情，和真实项目的差别

**你现在的服务器和真实的生产服务器，差别在这几块：**

| 现在 | 真实项目 |
|---|---|
| 端口 3000 | 通常 80 / 443，通过反向代理转发 |
| `localhost` | 真实域名 |
| 手动 `Ctrl + C` | 用进程管理器（pm2 / systemd） |
| 代码里写路由 | 用框架（Express） |
| 没日志 | 结构化日志 + 监控 |
| 没错误处理 | 全局错误捕获 |

**但核心一模一样：** 一个程序监听端口，收到请求，给响应。

**后面 21 周的内容，都是在这个核心上加东西。**

---

# 第 8 步：写学习笔记（10 分钟）

```markdown
# 第 15 节课学习笔记

## 一、服务器是什么

我的理解（不要抄课件）：

## 二、餐厅比喻对应表

| 概念 | 餐厅里的对应 |
|---|---|
| 服务器程序 | |
| 端口 | |
| 请求 | |
| 响应 | |
| 状态码 | |

## 三、第一个服务器的四行核心代码

```javascript
（凭记忆默写，不要看课件）
```

每行在做什么：

1.
2.
3.
4.

## 四、`req` 和 `res`

| 参数 | 全称 | 我用它做什么 |
|---|---|---|
| req | | |
| res | | |

## 五、状态码

| 码 | 意思 | 什么时候用 |
|---|---|---|
| 200 | | |
| 400 | | |
| 404 | | |
| 500 | | |

## 六、`Content-Type`

| 值 | 用于 |
|---|---|
| text/plain | |
| text/html | |
| application/json | |

为什么必须加 `; charset=utf-8`：

## 七、我实际看到的响应头

```text
（把 curl -i 的完整输出贴在这里）
```

逐行解释：

## 八、五个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| EADDRINUSE | | |
| 忘 res.end() | | |
| Content-Type 错 | | |
| 忘 charset | | |
| 漏 return | | |

## 九、`req.on("data")` 和 `req.on("end")`

为什么不能一次性拿到完整的请求体：

## 十、我还不懂的词

- 

## 十一、完成检查

- [ ] 我的服务器能启动，终端显示"服务器已启动"
- [ ] 浏览器访问 localhost:3000 能看到内容
- [ ] 我做出了 /、/about、/time 三个路由
- [ ] 不存在的路径返回 404
- [ ] 我用 curl 看过完整的响应头
- [ ] 我知道改了代码要重启
- [ ] 我做过五个错误的实验
- [ ] 我能画出"客户端 → 服务器 → 响应"的流程
```

---

# 第 9 步：课后练习

## 练习一：加三个你自己的路由

**要求：** 至少加三个新路由，并且用不同的 `Content-Type`：

```text
/food        返回一个 HTML 页面，介绍你喜欢的食物
/data        返回 JSON，包含你的名字、学习周数、会的东西
/plain       返回纯文本，一段话
```

**要求：** `/data` 要返回合法 JSON，能在浏览器里正确显示。

**提示：** 用 `JSON.stringify()` 转换对象。

## 练习二：做一个"计算器"路由

**要求：**

```text
访问 /calc?a=10&b=20    → 返回 {"sum":30,"diff":-10}
访问 /calc?a=abc&b=20   → 返回 400 + 错误提示
访问 /calc              → 返回 400 + "缺少参数"
```

**提示：**

- 从 `req.url` 里取参数需要解析 `?a=10&b=20`；
- Node 内置 `URL` 类可以帮忙：

```javascript
const urlObj = new URL(req.url, "http://localhost");
const a = urlObj.searchParams.get("a");
```

**这一题会让人有点抓狂。** 因为手动解析 URL 很麻烦——**这正是第 17 节课要引入 Express 的原因。**

## 练习三：加一个"访问计数"

**要求：**

- 每访问一次 `/count`，计数加 1；
- 返回当前次数。

**提示：** 用一个外部变量。

**思考：** 服务器重启后计数会怎样？为什么？真实项目该怎么存这个数？

## 练习四：找出这段代码的四个问题

```javascript
const http = require("http");

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>首页</h1>");
  }
  if (req.url === "/a") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>A</h1>");
  }
  res.end("404");
});

server.listen(3000);
```

**提示方向：** `return`、`charset`、404 的状态码、最后的 `res.end` 会怎样。

## 练习五：用自己的话讲

```text
为什么服务器程序不会自己结束？
为什么一个端口只能被一个程序占用？
为什么每次请求必须有且只有一次 res.end()？
为什么改了代码必须重启服务器？
```

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清"服务器"是程序不是机器
- [ ] 我能说出端口的作用
- [ ] 我能区分"客户端"和"服务器"
- [ ] 我能用餐厅比喻讲清请求/响应/状态码
- [ ] 我知道服务器是"等着"，不是"主动做事"

## B. 代码

- [ ] 我会用 `require("http")`
- [ ] 我会用 `http.createServer`
- [ ] 我知道 `req` 和 `res` 是什么
- [ ] 我会用 `req.method` 和 `req.url`
- [ ] 我会用 `res.writeHead` 设状态码和 Content-Type
- [ ] 我会用 `res.end` 返回内容
- [ ] 我会用 `server.listen` 启动

## C. 状态码与类型

- [ ] 我知道 200 / 400 / 404 / 500 的区别
- [ ] 我知道 `text/html` 会渲染，`text/plain` 不会
- [ ] 我知道中文必须加 `charset=utf-8`
- [ ] 我会用 `JSON.stringify` 返回 JSON

## D. 实操

- [ ] `03-练习代码/server.js` 存在
- [ ] 服务器能启动
- [ ] 有至少 3 个路由
- [ ] 不存在的路径返回 404
- [ ] 我用 curl 看过响应头
- [ ] `03-练习代码/logs.md` 有请求记录

## E. 排错

- [ ] 遇到 `EADDRINUSE` 我知道是端口被占
- [ ] 浏览器转圈我知道查 `res.end`
- [ ] 中文乱码我知道查 `charset`
- [ ] 页面显示标签我知道查 `Content-Type`
- [ ] 遇到 `ERR_HTTP_HEADERS_SENT` 我知道是漏了 `return`

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 核心四行代码是默写的
- [ ] 有 curl 响应头的完整记录
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **服务器就是一个一直等着接电话的程序，端口是门牌号，路径是菜单，状态码是它回你的那句话。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `EADDRINUSE` | 端口被占用 | 关旧进程或换端口 |
| 浏览器一直转圈 | 没调 `res.end()` | 检查每个分支都有 `end` |
| 中文乱码 | 缺 `charset=utf-8` | 加到 Content-Type 里 |
| 页面显示 HTML 标签 | `Content-Type` 是 `text/plain` | 改成 `text/html` |
| `ERR_HTTP_HEADERS_SENT` | 重复响应 | 每个分支加 `return` |
| `Cannot find module` | 文件路径不对 | 确认在文件所在目录执行 |
| 改了代码没生效 | 没重启 | `Ctrl + C` 后重新 `node` |
| `curl` 命令报错 | Windows 上可能是别名 | 用 `curl.exe` |
| `localhost` 打不开 | 服务器没启动 | 看终端有没有报错 |
| POST 拿不到数据 | 没监听 `data` 和 `end` | 用 `req.on("data")` |
| `JSON.parse` 报错 | 收到的不是合法 JSON | 先打印原始 `body` 看 |
| 端口 3000 被占但找不到进程 | 可能是别的程序 | 换 3001 试 |
