# 第 16 节课：把项目搭起来——npm 与项目结构

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你把所有代码写在一个 `server.js` 里。文件一长就乱。
> 这节课学三件事：**用 npm 管理项目、用 `package.json` 记录依赖、把代码拆成多个文件。**

**建议用时**：110 分钟
**你需要先完成**：第 15 节课（能启动一个服务器）

---

# 第 0 步：为什么需要"项目"这个概念（5 分钟）

## 0.1 上节课的代码，问题在哪

```text
03-练习代码/
└── server.js       ← 一个文件，200 行
```

**如果项目变大：**

```text
路由 50 行
处理逻辑 200 行
数据读写 100 行
错误处理 50 行
配置 30 行
```

**全部塞进一个文件，会有三个问题：**

1. **找不到东西**：想改一个路由，得滚几百行；
2. **改坏了不知道**：两个功能在同一个文件里，容易互相影响；
3. **别人接不上**：同事打开文件，看不出结构。

## 0.2 三个要解决的问题

```text
① 我怎么告诉别人"这个项目需要装什么才能跑"？   → package.json
② 我怎么知道装了哪些依赖、什么版本？            → package.json + node_modules
③ 我怎么把代码拆开，但不改坏引用？              → 目录结构 + import/export
```

## 0.3 一个类比

**把项目想成一套家具：**

| 概念 | 家具里的对应 |
|---|---|
| `package.json` | 装箱单：写了这套家具包括哪些件、每个件什么型号 |
| `node_modules` | 仓库：真正存放零件的地方 |
| `npm install` | 按装箱单去仓库取件 |
| `.gitignore` | "仓库不要寄"的备注 |

**关键理解：**

```text
package.json 会被提交到 Git
node_modules 绝对不提交
```

**为什么 `node_modules` 不提交：**
因为它可能有几百 MB、几万个文件。**只要有 `package.json`，别人一条 `npm install` 就能重建出来。**

## 0.4 今天的交付物

| 文件/目录 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `package.json` | `03-练习代码/hello-server` | 项目说明书 |
| `src/server.js` | `03-练习代码/hello-server/src` | 入口 |
| `src/routes.js` | `03-练习代码/hello-server/src` | 路由 |
| `src/config.js` | `03-练习代码/hello-server/src` | 配置 |
| `.gitignore` | `03-练习代码/hello-server` | 忽略规则 |

---

# 第 1 步：建一个真正的项目目录（15 分钟）

## 1.1 为什么要单独建一个子目录

**上节课你直接在 `03-练习代码` 里写 `server.js`。**

**这节课要建一个子文件夹，因为一个项目会有很多文件：**

```text
03-练习代码/
└── hello-server/        ← 这个项目的根目录
    ├── package.json
    ├── .gitignore
    └── src/
```

**为什么不能直接放在 `03-练习代码` 里：**
因为你以后还会有别的项目。**每个项目一个大文件夹，互不干扰。**

## 1.2 创建目录结构

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第03周-后端与对话\第02节课\03-练习代码
   ```

2. 右键 → 新建 → 文件夹，命名 `hello-server`。
3. 进入 `hello-server`，再新建一个文件夹 `src`。

**现在结构是：**

```text
03-练习代码/
└── hello-server/
    └── src/
```

## 1.3 在项目目录里打开终端

**这一步很关键，做错了后面全乱。**

**操作（方式一，推荐）：**

1. 在文件资源管理器里进入 `hello-server` 文件夹；
2. 在**地址栏**里输入 `cmd`，回车。

**为什么要这样：**
因为你打开终端时，"当前目录"就是 `hello-server`。**后面所有命令都是相对这个目录执行的。**

**操作（方式二）：**

1. 在 Visual Studio Code 里，用"文件 → 打开文件夹"，选 `hello-server`；
2. 按 `Ctrl + ~` 打开终端。

**验证当前目录对不对：**

```text
cd
```

**应该输出类似：**

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第03周-后端与对话\第02节课\03-练习代码\hello-server
```

**如果路径里没有 `hello-server`，先 `cd` 进去再说。**

**这是新手最容易出错的地方：在错误的目录里跑命令，报错看不懂。**

---

# 第 2 步：`npm init`——生成装箱单（15 分钟）

## 2.1 运行 npm init

**操作：**

```text
npm init -y
```

**`-y` 是什么：** yes，全部用默认值，不一个个问你。

**你会看到类似：**

```text
Wrote to B:\...\hello-server\package.json:

{
  "name": "hello-server",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
```

**目录里多了一个文件：`package.json`。**

## 2.2 逐字段读懂 package.json

**打开 `package.json`，逐行看：**

### `name`

```json
"name": "hello-server"
```

**项目名。** 默认取文件夹名。

**规则：**

- 只能用**小写字母**、数字、`-`、`_`；
- **不能有中文**；
- 不能有空格。

**如果你文件夹名是中文，这里会是乱码或被拒。** 所以**项目文件夹一定要用英文**。

### `version`

```json
"version": "1.0.0"
```

**版本号。** 三段：`主版本.次版本.修订号`。

```text
1.0.0 → 1.0.1   修了个 bug
1.0.1 → 1.1.0   加了功能，但兼容
1.1.0 → 2.0.0   不兼容的大改
```

**这叫"语义化版本"（semver）。** 记住这个规则，因为以后装依赖时会看到 `^1.2.3` 这种写法。

### `main`

```json
"main": "index.js"
```

**入口文件。** 别人 `require` 你的包时默认加载这个。

**本项目用不到**，我们会有自己的启动脚本。

### `scripts`

```json
"scripts": {
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

**这是最有用的部分。**

**`scripts` 里定义的是"命令别名"。**

```json
"scripts": {
  "start": "node src/server.js",
  "dev": "node --watch src/server.js"
}
```

**然后你可以这样运行：**

```text
npm run start
npm run dev
```

**为什么要用别名：**

- 命令短，不用记长路径；
- **团队统一**：所有人都 `npm run dev`，不管背后跑的是什么；
- 换实现时不用通知所有人。

**注意：** `npm start` 可以省略 `run`，是例外。其他都要 `npm run xxx`。

### `license`

```json
"license": "ISC"
```

**开源协议。** 学习项目不用管。

**但注意：** 如果你以后要商用，得改。第 36 周会讲。

## 2.3 改造 package.json

**打开 `package.json`，自己改成下面这样（自己敲，不要复制）：**

```json
{
  "name": "hello-server",
  "version": "1.0.0",
  "description": "第16节课练习：把服务器拆成多个文件",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
```

**改了四处：**

| 改动 | 为什么 |
|---|---|
| 加了 `description` | 说明这个项目干什么 |
| 加了 `"type": "module"` | 见下 |
| `main` 改成 `src/server.js` | 真实入口 |
| 加了 `start` 和 `dev` 两个脚本 | 方便启动 |

## 2.4 `"type": "module"` 是什么——这是本节最重要的一个知识点

**Node 有两种模块写法：**

### 写法一：CommonJS（老写法，默认）

```javascript
const http = require("http");

module.exports = { something };
```

- 用 `require` 引入；
- 用 `module.exports` 导出。

**这是第 15 节课用的写法。**

### 写法二：ES Module（新写法，现代标准）

```javascript
import http from "http";

export const something = 1;
```

- 用 `import` 引入；
- 用 `export` 导出。

**这是浏览器原生支持的写法，也是前端的主流写法。**

### 怎么选

**关键：加了 `"type": "module"` 之后，`.js` 文件就按 ES Module 解析。**

**不加就是 CommonJS。**

**本课程统一用 ES Module。** 理由：

1. 和前端一致（第 2 周学的 `<script>` 就是 ES Module 的语法基础）；
2. 是未来标准；
3. 你看到的现代 AI 生成的代码，大多用 `import`。

### 加了 `"type": "module"` 之后，`require` 会报错

**如果你在 `"type": "module"` 的项目里写：**

```javascript
const http = require("http");
```

**报错是：**

```text
ReferenceError: require is not defined in ES module scope, you can use import instead
This file is being treated as an ES module because it has a '.js' file extension and
'...\package.json' contains "type": "module".
```

**这个报错的意思非常清楚：** 你在 ES Module 里用了 CommonJS 的写法。

**修法：改成 `import`。**

**如果某个文件必须用 CommonJS：**
把文件名改成 `.cjs` 后缀。**（本项目不需要）**

### 内置模块也要 import

```javascript
import http from "http";
import fs from "fs/promises";
import path from "path";
```

**Node 内置模块用 `import xxx from "xxx"` 就能拿到。** 不需要装。

**命名导入写法（部分导出）：**

```javascript
import { readFile, writeFile } from "fs/promises";
```

**区别：**

```javascript
import fs from "fs/promises";           // 拿到整个模块对象
import { readFile } from "fs/promises"; // 只拿其中的 readFile
```

**两种都常用。`fs` 这种模块用整体导入更清楚：`fs.readFile(...)`。**

---

# 第 3 步：把单文件拆成多个文件（25 分钟）

## 3.1 要拆成什么

**上节课的 `server.js` 有三块内容：**

```text
① 配置（端口号、站点名）
② 路由（根据 url 返回不同内容）
③ 启动服务器
```

**拆成三个文件：**

```text
src/
├── config.js    配置
├── routes.js    路由处理
└── server.js    入口：启动服务器
```

## 3.2 写 `src/config.js`

**在这个文件里只放"会变的东西"。**

**自己敲：**

```javascript
// 项目配置。以后改端口、改站点名，只改这里。
export const CONFIG = {
  port: 3000,
  siteName: "我的第一个 Node 项目",
  version: "1.0.0",
};
```

**`export const` 是什么：** 导出这个常量，别的文件可以用 `import` 拿到。

**为什么单独放一个文件：**

- 改配置不用翻遍所有文件；
- 别人一眼能看到这个项目有哪些可配置项；
- 以后可以从环境变量读取（第 31 周会讲）。

## 3.3 写 `src/routes.js`

**这个文件负责"根据路径决定返回什么"。**

**自己敲：**

```javascript
// 所有路由的处理逻辑。这里不启动服务器，只处理请求。
import { CONFIG } from "./config.js";

const sendHtml = (res, statusCode, html) => {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
};

const sendJson = (res, statusCode, data) => {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
};

const sendText = (res, statusCode, text) => {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
};

export const handleRequest = (req, res) => {
  const url = req.url.split("?")[0];

  console.log(`${req.method} ${url}`);

  if (url === "/") {
    sendHtml(
      res,
      200,
      `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${CONFIG.siteName}</title></head>
<body>
  <h1>${CONFIG.siteName}</h1>
  <p>版本 ${CONFIG.version}</p>
  <ul>
    <li><a href="/about">关于</a></li>
    <li><a href="/api/info">API 信息</a></li>
    <li><a href="/time">当前时间</a></li>
    <li><a href="/nope">一个不存在的页面（测试 404）</a></li>
  </ul>
</body>
</html>`
    );
    return;
  }

  if (url === "/about") {
    sendHtml(res, 200, `<h1>关于</h1><p>这是一个用来学习 Node 结构的练习项目。</p>`);
    return;
  }

  if (url === "/api/info") {
    sendJson(res, 200, {
      name: CONFIG.siteName,
      version: CONFIG.version,
      time: new Date().toISOString(),
    });
    return;
  }

  if (url === "/time") {
    sendText(res, 200, `现在时间：${new Date().toLocaleString("zh-CN")}`);
    return;
  }

  sendHtml(res, 404, `<h1>404</h1><p>页面不存在：${url}</p>`);
};
```

**注意三个 helper 函数：`sendHtml`、`sendJson`、`sendText`。**

**为什么写它们：**
因为 `res.writeHead(200, { "Content-Type": "..." })` 这行会重复很多次。**抽成函数，以后改一处就全改。**

**这是"重构"的第一步：把重复的东西抽出来。**

**注意 `import { CONFIG } from "./config.js"`：**

**`./` 是什么：**
表示"当前文件所在的目录"。

```javascript
"./config.js"    当前目录下的 config.js
"../config.js"   上一级目录
"config.js"      ❌ 没有 ./ 会被当成"第三方包"，找不到
"http"           第三方包或内置模块，不加 ./
```

**这个 `.js` 后缀不能省**（在 ES Module 里必须写全）。

**这是从 CommonJS 转过来最容易忘的一点。** CommonJS 可以写 `require("./config")`，ESM 必须写 `./config.js`。

**注意 `req.url.split("?")[0]`：**

```javascript
const url = req.url.split("?")[0];
```

**为什么要切掉 `?` 后面的部分：**

因为访问 `/api/info?x=1` 时，`req.url` 是 `"/api/info?x=1"`。

**如果不切，`url === "/api/info"` 就不成立，会掉到 404。**

**`split("?")` 用问号切开：**

```text
"/api/info?x=1"  →  ["/api/info", "x=1"]
                         ↑ [0] 就是要的
```

## 3.4 写 `src/server.js`

**这个文件只做一件事：启动服务器。**

**自己敲：**

```javascript
// 入口文件：创建服务器并启动。这里不写业务逻辑。
import http from "http";
import { CONFIG } from "./config.js";
import { handleRequest } from "./routes.js";

const server = http.createServer(handleRequest);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${CONFIG.port} 已被占用。请关掉占用它的程序，或改 config.js 里的 port。`);
    return;
  }
  console.error("服务器启动失败：", error);
});

server.listen(CONFIG.port, () => {
  console.log(`${CONFIG.siteName} v${CONFIG.version}`);
  console.log(`已启动：http://localhost:${CONFIG.port}`);
});
```

**三个新东西：**

### `http.createServer(handleRequest)`

```javascript
const server = http.createServer(handleRequest);
```

**注意：这里传的是函数名，没有括号。**

**和上节课的对比：**

```javascript
// 上节课：直接写匿名函数
http.createServer((req, res) => { ... });

// 现在：传一个已定义的函数
http.createServer(handleRequest);
```

**这两个完全等价。** 后者更清晰，因为路由逻辑搬到了别的文件。

**记住第 13 节课的规则：传函数名，不加括号。**

### `server.on("error", ...)`

```javascript
server.on("error", (error) => { ... });
```

**监听服务器的错误事件。**

**为什么必须写：**

**不写的话，端口被占用时会直接崩溃：**

```text
node:events:497
      throw er; // Unhandled 'error' event
      ^

Error: listen EADDRINUSE: address already in use :::3000
    at Server.setupListenHandle [as _listen2] (node:net:1940:16)
```

**这堆报错对新手非常不友好。** 加了错误处理，就变成一句人话：

```text
端口 3000 已被占用。请关掉占用它的程序，或改 config.js 里的 port。
```

**这就是"错误处理"的价值：把机器的话翻译成人话。**

### `error.code === "EADDRINUSE"`

**错误对象上有一个 `code` 属性，是机器可读的错误码。**

**常见的网络错误码：**

| code | 意思 |
|---|---|
| `EADDRINUSE` | 端口被占用 |
| `EACCES` | 权限不足（比如监听 80 端口需要管理员） |
| `ECONNREFUSED` | 连接被拒绝（对方没启动） |
| `ETIMEDOUT` | 超时 |
| `ENOTFOUND` | 域名解析失败 |

**为什么用 `code` 而不是匹配错误消息：**
因为消息文字可能变（不同语言、不同 Node 版本），**`code` 是稳定的。**

## 3.5 最终结构

```text
hello-server/
├── package.json
└── src/
    ├── config.js
    ├── routes.js
    └── server.js
```

## 3.6 启动它

**操作：**

```text
npm run dev
```

**应该看到：**

```text
我的第一个 Node 项目 v1.0.0
已启动：http://localhost:3000
```

**打开浏览器访问 `http://localhost:3000`，应该看到一个带链接的页面。**

**点每个链接，确认都能用。**

## 3.7 验证热重载

**这是 `--watch` 的价值，一定要试。**

**操作：**

1. **不要关掉终端。**
2. 打开 `src/config.js`，把 `siteName` 改成别的（比如加个"改过了"）。
3. 保存。
4. **看终端。**

**你会看到：**

```text
Restarting 'src/server.js'
我的第一个 Node 项目改过了 v1.0.0
已启动：http://localhost:3000
```

**它自动重启了！**

**刷新浏览器，看到新的站点名。**

**这就是 `--watch` 的作用：改代码自动重启，不用手动 `Ctrl + C`。**

**上节课你手动重启了几十次。现在省了。**

**注意：`--watch` 只监听 `import` 链上的文件。**

**比如你改了 `src/routes.js`，它也会重启**（因为 `server.js` import 了它）。

**但你改 `package.json` 不会重启**（那不算代码文件）。

---

# 第 4 步：`.gitignore`——别把垃圾提交上去（15 分钟）

## 4.1 现在的问题

**如果你现在 `git add`，会发生什么：**

`node_modules` 里有几万个文件，全部会被提交。

**现在还早**（还没装依赖），但第 17 节课装了 Express 就会有 `node_modules`。

## 4.2 建 `.gitignore`

**操作：**

1. 在 `hello-server` 目录（不是 `src`）里新建文件。
2. **文件名必须是 `.gitignore`**（前面有个点，没有扩展名）。

**在 Windows 上建点开头的文件有点麻烦：**

**方法一：用 Visual Studio Code 建**

1. 在 VS Code 里右键项目文件夹 → "新建文件"；
2. 输入 `.gitignore`；
3. 回车。

**方法二：用命令行**

```text
type nul > .gitignore
```

**方法三：先建成 `gitignore.txt`，再重命名去掉 `.txt`**

**注意：Windows 资源管理器不允许文件名只有扩展名（比如 `.gitignore` 会被当成无文件名）。** 用 VS Code 最省事。

**写入内容：**

```text
# 依赖包，几万个文件，不提交
node_modules/

# 环境变量，存密钥，绝对不能提交
.env
.env.local

# 日志
*.log
npm-debug.log*

# 系统和编辑器
.DS_Store
Thumbs.db
.vscode/
.idea/

# 构建产物
dist/
build/

# 缓存
.cache/
```

## 4.3 逐行解释

### `node_modules/`

**结尾的 `/` 表示"这是一个目录"。**

**为什么必须忽略：**
它可能有 200MB、5 万个文件。**只要有 `package.json`，别人 `npm install` 就能重建。**

### `.env` 和 `.env.local`

**这是最重要的两行。**

**`.env` 通常存着：**

```text
DATABASE_URL=postgres://user:password@host/db
OPENAI_API_KEY=sk-xxxxxxxxxxxx
JWT_SECRET=my-secret-key
```

**一旦提交到 GitHub，等于把密码公开。**

**注意：即使你之后删掉，Git 历史里还有。** 别人能翻出来。

**这个坑每年都有大量真实事故。** 第 33 周会专门讲密钥管理。

### `*.log`

**`*` 是通配符，表示"任何字符"。**

**`*.log` = 所有 `.log` 结尾的文件。**

### `.vscode/` 和 `.idea/`

**编辑器的个人配置。**

**为什么忽略：**
因为你喜欢的设置别人不一定喜欢。**除非团队统一了配置，否则不提交。**

### `dist/` 和 `build/`

**构建产物。**

**为什么忽略：**
因为它们是"从源码生成的"。**源码在 Git 里，产物可以重新生成。**

## 4.4 验证 `.gitignore` 生效

**操作：**

```text
git status
```

**在 `hello-server` 目录里运行。**

**应该看到类似：**

```text
Untracked files:
  package.json
  src/

nothing added to commit but untracked files present
```

**注意 `node_modules` 没出现在列表里**（因为还没有这个目录，但规则已生效）。

**验证规则生效的更直接方法：**

```text
git check-ignore -v node_modules
```

**应该输出：**

```text
.gitignore:2:node_modules/    node_modules
```

**读法：** `.gitignore` 第 2 行的规则 `node_modules/` 命中了。

**如果什么都没输出：** 说明规则没生效，检查文件是不是真的叫 `.gitignore`。

## 4.5 一个必须知道的坑

**`.gitignore` 只对"还没被 Git 跟踪的文件"生效。**

**如果你先 `git add` 了 `node_modules`，之后再加 `.gitignore`，它不会自动移除。**

**怎么补救：**

```text
git rm -r --cached node_modules
```

**`--cached` 是什么：** 只从 Git 索引里删掉，**不删本地文件**。

**然后再 `git add .gitignore` 并提交。**

**这是很常见的操作。** 记住 `git rm -r --cached`。

---

# 第 5 步：故意犯五个错（20 分钟）

## 错误 1：在错误的目录跑 `npm init`

**操作：**

1. `cd` 到 `03-练习代码`（上一级，不是 `hello-server`）；
2. 运行 `npm init -y`。

**会怎样：** 在 `03-练习代码` 里生成了一个 `package.json`。

**问题：**
这个目录是"本节所有练习文件的容器"，不是项目。**在这里放 `package.json` 会让 Node 把整个目录当成一个项目。**

**后果：** 以后在子目录里跑 `node`，它会往上找到这个 `package.json`，行为可能不符合预期。

**怎么修：** 删掉那个 `package.json`，回到 `hello-server` 里做。

**怎么避免：** **每次 `npm init` 前，先跑一次 `cd` 确认路径。**

## 错误 2：`"type": "module"` 里用 `require`

**操作：** 在 `src/server.js` 里把 `import http from "http"` 改成 `const http = require("http")`。

**会怎样：**

```text
ReferenceError: require is not defined in ES module scope, you can use import instead
```

**怎么修：** 改回 `import`。

**记住：**
**`"type": "module"` 一旦加上，`.js` 文件全部用 ES Module 语法。**

## 错误 3：import 路径忘了 `./` 或忘了 `.js`

**操作：**

```javascript
import { CONFIG } from "config.js";     // 少了 ./
```

**会怎样：**

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'config.js' imported from ...
```

**注意报错说的是 "package"，不是 "file"。**

**为什么：**
因为 Node 把 `"config.js"` 当成"一个叫 config.js 的第三方包"，去 `node_modules` 里找，找不到。

**修法：** 写 `"./config.js"`。

**另一种错法：**

```javascript
import { CONFIG } from "./config";      // 少了 .js
```

**会怎样：**

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\config' imported from ...
```

**ES Module 必须写完整扩展名。** CommonJS 可以不写，ESM 不行。

**这个坑从 CommonJS 转过来的人 100% 会踩。**

## 错误 4：`server.on("error")` 写错位置

**操作：** 把 `server.on("error", ...)` 放在 `server.listen(...)` 后面。

**会怎样：** **其实也没问题，能工作。**

**但有个更常见的错法：**

```javascript
server.listen(3000);
```

（不传回调，直接调 `listen` 之后什么都不做）

**然后端口被占时：** 报一大段 `Unhandled 'error' event`。

**为什么：**
因为没监听 `error` 事件，Node 就按"未处理错误"处理，直接崩溃。

**规则：**

```text
任何 EventEmitter（服务器、socket、流）都要监听 error 事件。
```

**不监听会怎样：** 出错时直接崩溃，而且报错信息很难懂。

**这条规则在第 1 周第 8 节课的"硬规则"里出现过。现在你看到它为什么重要了。**

## 错误 5：`.gitignore` 名字写错

**操作：** 把文件命名成 `gitignore`（没有前面的点）或 `.gitignore.txt`。

**会怎样：** `git status` 里能看到 `node_modules`，规则不生效。

**怎么查：**

```text
git check-ignore -v node_modules
```

**没输出就是没生效。**

**Windows 上这个坑特别常见**，因为资源管理器不让建点开头的文件。

## 五个错误总结

```text
npm init 在错目录     → 多出一个不该有的 package.json
type=module 用 require → require is not defined
import 路径不全        → ERR_MODULE_NOT_FOUND（说是 package 找不到）
不监听 error 事件      → 端口被占时一大段难懂报错
.gitignore 名字写错    → 规则不生效
```

---

# 第 6 步：这样拆到底好在哪（10 分钟）

## 6.1 做一次对比

**上节课的单文件：**

```javascript
const http = require("http");

const server = http.createServer((req, res) => {
  // 50 行路由判断
  // 每个分支里还混着 writeHead 和 end
});

server.listen(3000);
```

**现在的三文件：**

| 文件 | 行数 | 职责 |
|---|---|---|
| `config.js` | 5 | 配置 |
| `routes.js` | 上 70 | 处理请求 |
| `server.js` | 15 | 启动 |

**区别在哪：**

**区别一：改配置不用找**

想改端口，直接开 `config.js`。**不用在 200 行里搜索 `3000`。**

**区别二：加路由只改一处**

加一个新页面，只在 `routes.js` 里加一个 `if`。

**区别三：能单独测试**

`routes.js` 里的 `handleRequest` 是一个纯函数（接收 req/res，不依赖启动逻辑）。**理论上可以单独测试**（第 21 周会讲）。

**区别四：别人能看懂**

新人打开项目，看文件名就知道每个文件干什么。

## 6.2 一个原则：单一职责

```text
一个文件只做一件事。
```

**判断标准：**

```text
如果我用一句话说不清这个文件干什么，说明它该拆了。
```

**比如：**

- `config.js` —— "存配置" ✓ 一句话
- `routes.js` —— "决定每个路径返回什么" ✓
- `server.js` —— "启动服务器" ✓
- `server.js` —— "启动服务器、处理路由、读写文件、发邮件" ✗ 该拆

## 6.3 但也不要过度拆分

**反例：**

```text
src/
├── config-port.js          ← 只有一行 port
├── config-name.js          ← 只有一行 siteName
├── route-home.js           ← 只有一个路由
├── route-about.js
├── route-api.js
```

**问题：** 文件太多，跳来跳去，反而更乱。

**本课程的拆分原则：**

```text
一个文件超过 100 行，或者明显有两种以上职责，才拆。
```

**现在这个项目 90 行分三个文件，刚好。** 等项目变大了（第 5 周会有十几个路由），再按功能拆成 `routes/home.js`、`routes/api.js` 这样。

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 16 节课学习笔记

## 一、package.json 五个关键字段

| 字段 | 作用 | 我的项目里是什么值 |
|---|---|---|
| name | | |
| version | | |
| type | | |
| main | | |
| scripts | | |

## 二、`npm run dev` 背后执行的是什么

## 三、CommonJS 和 ES Module

| | CommonJS | ES Module |
|---|---|---|
| 引入 | | |
| 导出 | | |
| 怎么启用 | | |

本课程用哪种：

## 四、`"type": "module"` 之后 require 会怎样

报错原文：

## 五、import 路径的三种写法

```javascript
import http from "http";              // 
import { CONFIG } from "./config.js"; // 
import x from "../a/b.js";            // 
```

为什么 `"./config.js"` 不能写成 `"config.js"`：

为什么 `.js` 后缀不能省：

## 六、为什么必须监听 error 事件

不监听会怎样：

我遇到的 `EADDRINUSE` 原始报错：

```text
（贴在这里）
```

## 七、`.gitignore` 必须忽略的四类东西

1.
2.
3.
4.

`node_modules` 为什么不提交：

`.env` 为什么不提交：

## 八、`.gitignore` 名字写错怎么查

## 九、拆成三个文件的好处

1.
2.
3.

## 十、`--watch` 的效果

我改了什么文件：

终端输出了什么：

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 我有 `hello-server` 目录，里面有 `package.json`
- [ ] `package.json` 里有 `"type": "module"`
- [ ] `npm run dev` 能启动，且有热重载
- [ ] 我的代码拆成了 config / routes / server 三个文件
- [ ] 访问 /、/about、/api/info、/time 都正常
- [ ] 不存在的路径返回 404
- [ ] `.gitignore` 生效（`git check-ignore` 有输出）
- [ ] 我做过五个错误的实验
- [ ] 我能解释"为什么不能提交 node_modules"
```

---

# 第 8 步：课后练习

## 练习一：加一条配置项

**要求：**

1. 在 `config.js` 里加一个 `author`（你的名字）；
2. 在首页显示出来；
3. 在 `/api/info` 里也返回。

**验证：** 用 `--watch`，改 `config.js` 保存后自动生效。

## 练习二：再加一个路由文件

**要求：**

1. 新建 `src/routes-extra.js`；
2. 在里面写一个 `handleExtra`，处理 `/health` 路由（返回 `{"status":"ok"}`）；
3. 在 `routes.js` 里先试 `/health`，没有就交给后续处理。

**这题让你体会"路由该在哪里分流"。**

**提示：** 在两个文件之间做判断，需要一个顺序。想想 `if` 的顺序。

## 练习三：把 `sendHtml` 之类的函数抽到单独文件

**要求：**

1. 新建 `src/respond.js`；
2. 把 `sendHtml`、`sendJson`、`sendText` 移过去并 `export`；
3. `routes.js` 改成 `import` 它们。

**这个练习叫"提取模块"。** 你以后会经常做。

## 练习四：找出这段代码的五个问题

```javascript
const express = require("express");
import { CONFIG } from "./config";

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("ok");
});

server.listen(CONFIG.port);
```

**提示方向：** `type=module` 下用 `require`、import 少了 `.js`、`http` 没引入、没有 `server.on("error")`、`Content-Type`。

## 练习五：用自己的话讲

```text
package.json 是干什么的？为什么它比 node_modules 重要？
为什么 ESM 里 import 路径必须写 ./ 和 .js？
为什么必须监听 error 事件？
为什么 .env 绝对不能提交？
```

---

# 第 9 步：最终验收

## A. 项目结构

- [ ] `03-练习代码/hello-server/` 存在
- [ ] 里面有 `package.json`、`.gitignore`、`src/`
- [ ] `src/` 里有 `config.js`、`routes.js`、`server.js`
- [ ] 没有多余嵌套（`hello-server/hello-server/`）

## B. package.json

- [ ] `name` 是小写英文，没有中文和空格
- [ ] 有 `"type": "module"`
- [ ] `main` 指向 `src/server.js`
- [ ] `scripts` 里有 `start` 和 `dev`
- [ ] `npm run dev` 能启动

## C. 模块

- [ ] 我用 `import` 不用 `require`
- [ ] import 路径都写了 `./` 和 `.js`
- [ ] 我能解释 `"type": "module"` 的作用
- [ ] 我知道 ESM 里用 `require` 会报什么错

## D. 代码

- [ ] `config.js` 只有配置
- [ ] `routes.js` 只有路由逻辑，不启动服务器
- [ ] `server.js` 只有启动逻辑
- [ ] `routes.js` 里的重复代码抽成了 helper 函数
- [ ] `server.on("error")` 已监听，且有 `EADDRINUSE` 的中文提示

## E. .gitignore

- [ ] 文件名是 `.gitignore`（有前面的点）
- [ ] 忽略了 `node_modules/`
- [ ] 忽略了 `.env`
- [ ] `git check-ignore -v node_modules` 有输出

## F. 功能

- [ ] `/` 返回 HTML 页面
- [ ] `/about` 正常
- [ ] `/api/info` 返回合法 JSON
- [ ] `/time` 返回当前时间
- [ ] 不存在的路径返回 404
- [ ] 改代码后 `--watch` 自动重启

## G. 排错

- [ ] 遇到 `ERR_MODULE_NOT_FOUND` 我知道先检查 `./` 和 `.js`
- [ ] 遇到 `require is not defined` 我知道是 ESM 项目
- [ ] 遇到一大段 `Unhandled 'error' event` 我知道是没监听 error

## H. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有 `EADDRINUSE` 原始报错
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **package.json 是项目的说明书，node_modules 只是按说明书取来的零件——说明书必须留下，零件可以重建。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `require is not defined in ES module scope` | `type: module` 下用了 require | 改成 `import` |
| `ERR_MODULE_NOT_FOUND` 说 package 找不到 | import 路径少了 `./` | 加 `./` |
| `ERR_MODULE_NOT_FOUND` 说 module 找不到 | 少了 `.js` 后缀 | ESM 必须写全扩展名 |
| `npm run dev` 报 script 不存在 | `scripts` 里没定义 | 检查 `package.json` |
| `Unhandled 'error' event` | 没监听 error | 加 `server.on("error", ...)` |
| 端口占用报错难懂 | 同上 | 同上，并判断 `error.code` |
| `npm init` 生成到错目录 | 当前目录不对 | `cd` 到项目目录再执行 |
| `.gitignore` 不生效 | 文件名错或无点 | 用 VS Code 新建 |
| `node_modules` 已被跟踪 | 先 add 了再加 ignore | `git rm -r --cached node_modules` |
| 改代码没自动重启 | 用了 `node` 不是 `--watch` | 改用 `npm run dev` |
| `--watch` 改了不重启 | 改的不是 import 链上的文件 | 手动重启或改 `src` 里的文件 |
| 中文乱码 | 又忘了 `charset=utf-8` | 检查每个 `writeHead` |
