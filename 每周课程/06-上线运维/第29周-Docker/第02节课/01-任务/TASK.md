# 第 198 节课：写 Dockerfile——把一个 Node 项目装进镜像

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 197 节课你装好了 Docker，跑通了 `hello-world`。但那是个别人做好的镜像。
> 今天你要给你的 `chat-app` 写一个 Dockerfile，把它装成镜像。**这是这一周唯一一次"从零写文件"，也是第 30 周 CI 要用的那份文件。**

**建议用时**：120 分钟
**你需要先完成**：第 197 节课。具体要求：`docker version` 有 Client 和 Server 两段，`docker run hello-world` 能跑通。

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
docker pull hello-world    拉别人的镜像
docker run hello-world     跑别人的镜像
docker images              看本地有什么镜像
```

**你会用镜像，但你不会做镜像。**

**这一周解决的实际问题是"我的项目要能搬走"。** 搬走的单位是镜像，而镜像只能用 Dockerfile 做出来。

## 0.2 你以后会遇到什么

```text
① "服务器上 npm install 报 node-gyp 错，缺 python"
② "客户那边是内网，只能给一个镜像文件"
③ "每次改一行代码，CI 要跑 5 分钟装依赖"
④ "同事拉了我的代码，跑起来报 Cannot find module"
⑤ "上线前一查镜像 1.2GB，传了半小时"
```

**这五件事，第 ①③⑤ 条今天就能解决，第 ② 条第 34 周解决，第 ④ 条看你会不会写 `.dockerignore`。**

## 0.3 今天要建立的三个概念

```text
① Dockerfile —— 一个文本文件，写"这个镜像怎么装"。一行一条指令。
② 构建上下文（build context）—— docker build 时打包送给引擎的那个目录。就是那个 `.`
③ 分层缓存（layer cache）—— 每条指令算一层，没变就复用。改代码不该重装依赖。
```

**第 ③ 个是今天真正的主角。** 写得出能跑的 Dockerfile 只算及格；写得出"改代码不重装依赖"的 Dockerfile 才算会。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `chat-app-docker/` | `第02节课/03-练习代码` | 你项目的副本，专门用来做容器实验 |
| `Dockerfile` | `chat-app-docker/` | 今天手写的，7 条指令 |
| `.dockerignore` | `chat-app-docker/` | 防止 `node_modules` 和 `.env` 进镜像 |
| `NOTES.md` | `第02节课/02-笔记` | 你的学习记录 |

---

# 第 1 步：先复制一份项目（15 分钟）

## 1.1 为什么不在原项目上改

**这一周会在项目目录里增加三样东西：**

```text
Dockerfile
.dockerignore
compose.yaml（第 6 节）
```

**这三样东西迟早要进你的正式项目**，但不是现在。

**现在的问题是：**

```text
① 你还不确定 Dockerfile 写成什么样
② 你会反复 build 失败十几次
③ 第 5 节会删数据、第 7 节会删镜像
```

**在副本上折腾，坏了重新复制一份就行。**

**规则：这一周所有实验在 `03-练习代码/` 的副本里做。第 7 节收口时，再把最终版抄回正式项目。**

## 1.2 复制项目

**操作：**

1. 打开 `第02节课/03-练习代码`；
2. 在这里新建文件夹 `chat-app-docker`；
3. 把你 `chat-app` 里的文件**复制**进 `chat-app-docker`。

**复制哪些：**

```text
✅ server.js（或你的入口文件）
✅ package.json
✅ package-lock.json
✅ public/（如果有）
✅ src/（如果有）
✅ data/（有就复制，但后面要排除它进镜像）
❌ node_modules/       不要复制，几千个文件，没用
❌ .env                可以先复制过来用于本地测试，但绝不能进镜像
❌ .git/               如果你有，不要复制
```

**复制完检查结构，应该类似：**

```text
chat-app-docker/
├── package.json
├── package-lock.json
├── server.js
├── .env
├── public/
│   └── index.html
└── data/
    └── messages.json
```

**你的项目文件可能不一样。** 文件名不同没关系，后面 Dockerfile 里对应改就行。

> **⚠️ 没有 `package-lock.json` 会怎样：** 你会被迫用 `npm install` 而不是 `npm ci`，装出来的依赖版本可能和本地不同 —— 那 Docker 就白用了。
>
> **先在原项目里跑一次 `npm install` 生成 lock 文件，再复制。**

## 1.3 先确认它在你电脑上能跑

**在 `chat-app-docker` 里打开终端：**

```bash
npm install
node server.js
```

**应该看到类似：**

```text
Server running at http://localhost:3000
```

**浏览器打开 `http://localhost:3000`，页面能出来。**

**然后回车关掉（`Ctrl + C`）。**

**这一步不能跳过。**

如果你电脑上都跑不起来，容器里一定也跑不起来，而且报错会更难看。**先在原地跑通，再装箱。**

## 1.4 记下你的启动命令和端口

**打开 `package.json`，看 `scripts` 那一段：**

```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js"
}
```

**两个信息要记住：**

```text
① 入口文件叫什么（server.js / index.js / app.js）
② 监听哪个端口（3000 / 8080 / 5000）
```

**去 `server.js` 里搜 `listen`：**

```js
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000")
})
```

**记下这两个值。** 等一下 Dockerfile 里要用。

**如果你的代码是这样写的：**

```js
app.listen(3000, "127.0.0.1", () => { ... })
```

**先改成：**

```js
app.listen(3000, "0.0.0.0", () => { ... })
```

**为什么必须改：** 第 3 节会专门讲。**现在先改，不然等下容器跑起来你打不开，会以为 Dockerfile 写错了。**

---

# 第 2 步：先写 `.dockerignore`，再写 Dockerfile（20 分钟）

## 2.1 顺序为什么不能反

**很多人先写 Dockerfile，build 的时候发现慢，才想起 `.dockerignore`。**

**那时候已经晚了。**

**`docker build -t chat-app .` 里最后那个点 `.`，意思是：**

```text
把当前目录的全部内容，打包送给 Docker 引擎
```

**全部。** 包括：

```text
node_modules/     几十万个文件，几百 MB
.env              你的模型 API key、数据库密码
.git/             整个 Git 历史
data/             本地测试数据
```

**没有 `.dockerignore` 的时候，每次 build 都要把这几百 MB 传一遍。** 你会看到：

```text
[+] Building 45.2s (1/6)
 => [internal] load build context
 => => transferring context: 312.44MB 12.3s
```

**`312MB` 的上下文，其中 99% 是 `node_modules`。**

**更严重的是：**

**如果 Dockerfile 里有 `COPY . .`，上面这些文件会全部进镜像。**

**`.env` 进了镜像 = 你的 key 跟着镜像走。** 镜像推到仓库、发给客户、被 `docker history` 扒开，key 就在里面。

**这不是"可能"，是"一定"。** 第 4 节会亲手验证一次。

## 2.2 建 `.dockerignore`

**在 `chat-app-docker/` 里新建文件 `.dockerignore`。**

**Windows 上建以点开头的文件：**

```text
方法一：在 VS Code 里新建文件，文件名直接输入 .dockerignore
方法二：Git Bash 里 touch .dockerignore
方法三：新建 "新建文本文档.txt"，改名成 ".dockerignore."（末尾多个点，Windows 会自动去掉）
```

**内容：**

```text
node_modules
npm-debug.log
.env
.env.*
.git
.gitignore
data
README.md
.vscode
.DS_Store
Dockerfile
.dockerignore
compose.yaml
```

## 2.3 逐行读 `.dockerignore`

| 行 | 为什么要排除 |
|---|---|
| `node_modules` | **必须在容器里重新装**。你 Windows 上装的是给 Windows 用的，容器里是 Linux |
| `npm-debug.log` | 日志文件，没用，还可能带路径信息 |
| `.env` | **里面有 key。绝对不能进镜像** |
| `.env.*` | `.env.local`、`.env.production` 这类变体也一起排掉 |
| `.git` | 整个历史几百 MB，镜像里不需要 |
| `.gitignore` | 镜像里不需要 Git 配置 |
| `data` | 本地测试数据，不该进镜像。容器里的数据要用卷（第 5 节） |
| `README.md` | 文档，不影响运行 |
| `.vscode` | 编辑器配置 |
| `.DS_Store` | Mac 的垃圾文件，你在 Windows 上没有也无害 |
| `Dockerfile` | 镜像里不需要 Dockerfile 本身 |
| `.dockerignore` | 同上 |
| `compose.yaml` | 第 6 节才建，先写上免得忘 |

**注意：`.dockerignore` 的语法和 `.gitignore` 很像，但不完全一样。**

```text
node_modules     排除任何位置的 node_modules 目录
/node_modules    只排除根目录那个
*.log            所有 .log 文件
!important.log   例外：这个不排除（感叹号是"反向"）
```

**这一节你只需要最简单的写法，一行一个名字。**

## 2.4 验证 `.dockerignore` 生效

**先写一个最小的 Dockerfile（下一节写正式的），或者直接用一个临时镜像测：**

```bash
docker build -t ignore-test -f- . <<'EOF'
FROM alpine
COPY . /app
RUN ls -a /app
EOF
```

> **上面这段用的是 `-f-`（从标准输入读 Dockerfile）和 heredoc。** Git Bash 支持，PowerShell 不支持。
>
> **在 PowerShell 里会报错，那就跳过这一步，用下一节的正式 Dockerfile 验证。**

**如果觉得上面的写法别扭，用最土的办法：先跳到第 3 步把 Dockerfile 写出来，build 完再回来验证。**

**正式验证（第 3 步 build 完之后做）：**

```bash
docker run --rm chat-app:1.0 ls -a /app
```

**应该看到：**

```text
.  ..  package.json  package-lock.json  public  server.js  src
```

**不该出现 `node_modules`、`.env`、`data`、`.git`。**

**如果 `.env` 出现在列表里：** 你的 `.dockerignore` 没生效，回去检查文件名是不是写成了 `.dockerignore.txt`。

> **不懂这个会怎样：** 你以为 `.env` 只是"没提交到 Git"，很安全。但镜像里有一份，任何人 `docker run --rm 你的镜像 cat /app/.env` 就能看到。**第 33 周讲密钥泄露时，这是最常见的三种泄露路径之一。**

---

# 第 3 步：写第一个 Dockerfile（25 分钟）

## 3.1 先写一个"能跑就行"的版本

**在 `chat-app-docker/` 里新建文件 `Dockerfile`（没有扩展名，D 大写）。**

**内容：**

```dockerfile
FROM node:20

WORKDIR /app

COPY . .

RUN npm install

CMD ["node", "server.js"]
```

**六行。** 这就是一个能用的 Dockerfile。

**现在 build：**

```bash
docker build -t chat-app:1.0 .
```

## 3.2 应该看到

**BuildKit 的输出（Docker Desktop 默认用 BuildKit）：**

```text
[+] Building 38.4s (9/9) FINISHED                                    docker:desktop-linux
 => [internal] load build definition from Dockerfile                                0.0s
 => => transferring dockerfile: 132B                                                0.0s
 => [internal] load metadata for docker.io/library/node:20                          2.1s
 => [internal] load .dockerignore                                                   0.0s
 => => transferring context: 108B                                                   0.0s
 => [1/4] FROM docker.io/library/node:20@sha256:3f4c1a...                         12.4s
 => [internal] load build context                                                   3.8s
 => => transferring context: 2.41MB                                                 3.8s
 => [2/4] WORKDIR /app                                                              0.1s
 => [3/4] COPY . .                                                                  0.3s
 => [4/4] RUN npm install                                                          19.2s
 => exporting to image                                                              0.4s
 => => exporting layers                                                             0.4s
 => => writing image sha256:8a1b2c3d...                                             0.0s
 => => naming to docker.io/library/chat-app:1.0                                     0.0s
```

**逐行读（这张表以后你会天天看）：**

| 行 | 意思 |
|---|---|
| `[+] Building 38.4s (9/9) FINISHED` | 一共 9 个步骤，全做完了，花了 38 秒 |
| `load build definition from Dockerfile` | 读你的 Dockerfile |
| `load metadata for docker.io/library/node:20` | 查 `node:20` 这个镜像的最新信息 |
| `load .dockerignore` | **读 `.dockerignore`，证明它生效了** |
| `[1/4] FROM node:20` | 第一步：拉基础镜像。**这一步就花了 12 秒 + 1.1GB** |
| `load build context ... transferring context: 2.41MB` | 把当前目录打包送过去。**2.41MB，说明 `.dockerignore` 起作用了** |
| `[2/4] WORKDIR /app` | 创建并进入 `/app` 目录 |
| `[3/4] COPY . .` | 把上下文里的所有文件复制进 `/app` |
| `[4/4] RUN npm install` | **在容器里装依赖。19 秒** |
| `exporting to image` | 把结果存成镜像 |
| `naming to docker.io/library/chat-app:1.0` | 起名叫 `chat-app`，标签 `1.0` |

**两个数字要记住：**

```text
transferring context: 2.41MB    ← 如果这里是 312MB，说明 .dockerignore 没生效
[1/4] FROM node:20 ... 12.4s    ← 1.1GB 的基础镜像，每次新机器都要拉
```

**（`2.41MB` 和 `12.4s` 是我的数字，你的会不一样。这个数会变。）**

## 3.3 跑起来看看

```bash
docker run -d --name chat-app-1 -p 3000:3000 chat-app:1.0
```

**逐个参数读：**

| 参数 | 意思 |
|---|---|
| `-d` | detached，后台跑。不占用你的终端 |
| `--name chat-app-1` | 给容器起个名字，比 `clever_morse` 好记 |
| `-p 3000:3000` | 端口映射，**左边宿主机，右边容器**（第 3 节细讲） |
| `chat-app:1.0` | 用哪个镜像 |

**应该输出一长串容器 ID：**

```text
8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

**现在浏览器打开 `http://localhost:3000`。**

**页面出来了？恭喜，你的项目装进镜像了。**

**没出来？** 别改 Dockerfile，先看第 3 节的日志：

```bash
docker logs chat-app-1
```

**先确认容器是不是还活着：**

```bash
docker ps
```

**如果它在列表里，状态是 `Up 20 seconds`，说明程序在跑，问题在端口或监听地址。**

## 3.4 收工前把它删掉

```bash
docker stop chat-app-1
docker rm chat-app-1
```

**或者一条命令：**

```bash
docker rm -f chat-app-1
```

**`-f` 是 force，会先 stop 再 rm。** 这个容器是实验用的，可以这么干。**别对正式环境的容器用 `-f`。**

## 3.5 现在看这个 Dockerfile 的三个毛病

**它能跑，但有三处要改：**

```text
① 基础镜像 node:20 是 1.1GB。换个小的能省 900MB
② COPY . . 放在 npm install 前面 —— 改一行代码，依赖全部重装
③ npm install 不保证版本一致 —— 应该用 npm ci
```

**第 ① 条第 7 节处理。第 ②③ 条现在就处理，因为它们是每天都会痛的东西。**

---

# 第 4 步：分层与缓存——本节的核心（25 分钟）

## 4.1 先看镜像有几层

```bash
docker history chat-app:1.0
```

**应该看到（只贴了关键几行）：**

```text
IMAGE          CREATED          CREATED BY                                      SIZE      COMMENT
8a1b2c3d4e5f   2 minutes ago    CMD ["node" "server.js"]                        0B        buildkit.dockerfile.v0
<missing>      2 minutes ago    RUN /bin/sh -c npm install # buildkit           42.1MB    buildkit.dockerfile.v0
<missing>      2 minutes ago    COPY . . # buildkit                             1.8MB     buildkit.dockerfile.v0
<missing>      2 minutes ago    WORKDIR /app                                    0B        buildkit.dockerfile.v0
<missing>      2 minutes ago    /bin/sh -c #(nop)  CMD ["node"]                 0B
<missing>      2 minutes ago    /bin/sh -c #(nop)  ENV NODE_VERSION=20.18.0     0B
...
<missing>      2 weeks ago      /bin/sh -c set -eux;  apk add --no-cache ...    52.3MB
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `IMAGE` | 只有最上面那层是真镜像 ID，`<missing>` 表示"这一层不在本地单独存在" |
| `CREATED BY` | **这一层是哪条指令做出来的** |
| `SIZE` | 这一层占多大 |
| `COMMENT` | `buildkit.dockerfile.v0` 表示是 BuildKit 构建的 |

**关键观察：**

```text
你写的 5 条指令 → 5 层
基础镜像 node:20 自己还有十几层
```

**每一层都是"在上层基础上叠加的改动"，不是完整拷贝。**

## 4.2 为什么分层能加速

**做这个实验，改一行代码：**

1. 打开 `server.js`，随便改一个字符串（比如 `console.log` 里的文字）；
2. 保存；
3. 重新 build：

   ```bash
   docker build -t chat-app:1.1 .
   ```

**你会看到：**

```text
[+] Building 22.7s (10/10) FINISHED
 => [internal] load build definition from Dockerfile                                0.0s
 => [internal] load .dockerignore                                                   0.0s
 => [1/4] FROM docker.io/library/node:20@sha256:3f4c1a...                           0.0s
 => CACHED [2/4] WORKDIR /app                                                       0.0s
 => [internal] load build context                                                   0.6s
 => => transferring context: 2.41MB                                                 0.5s
 => [3/4] COPY . .                                                                  0.3s
 => [4/4] RUN npm install                                                          21.4s
 => exporting to image                                                              0.4s
```

**注意这三行：**

```text
=> CACHED [2/4] WORKDIR /app         ← 缓存命中，0 秒
=> [3/4] COPY . .                    ← 没缓存，0.3 秒（内容变了）
=> [4/4] RUN npm install             ← 没缓存，21.4 秒（重装了！）
```

**`CACHED` 的意思：这一步和上次一模一样，直接用上次的结果。**

**问题出在哪：**

**`COPY . .` 变了（你改了 `server.js`），所以它下面所有层都失效。**

**`npm install` 在 `COPY . .` 的下一层，跟着一起失效。**

**所以"改一行代码"= 重装 42MB 依赖。**

**这就是本节要解决的问题。**

## 4.3 修法：让依赖先装，代码后拷

**把 Dockerfile 改成：**

```dockerfile
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]
```

**对比一下顺序：**

```text
❌ 旧顺序：COPY . .  →  npm install
✅ 新顺序：COPY package*.json .  →  npm install  →  COPY . .
```

**为什么这样就能命中缓存：**

```text
Docker 的判断规则：一层的内容没变 → 这一层和它下面全部用缓存
                   一层的内容变了 → 这一层重做，下面全部重做
```

**`package.json` 和 `package-lock.json` 什么时候变？**

```text
装新依赖的时候变
改版本号的时候变
平时改业务代码的时候不变
```

**所以：**

```text
改 server.js → package*.json 没变 → npm install 那层 CACHED → 只重跑 COPY . .
改依赖     → package*.json 变了   → npm install 重跑（这是应该的）
```

**再 build 一次验证：**

```bash
docker build -t chat-app:1.2 .
```

**这次应该看到：**

```text
 => CACHED [2/5] WORKDIR /app                         0.0s
 => CACHED [3/5] COPY package*.json ./                0.0s
 => CACHED [4/5] RUN npm install                      0.0s
 => [5/5] COPY . .                                    0.3s
```

**`[4/5] RUN npm install` 变成了 `CACHED`，0.0s。**

**总时间从 22 秒降到 1 秒以内。**

> **这就是那些"改一行代码 CI 跑 5 分钟"的项目的问题所在。** 它们把 `COPY . .` 放在了装依赖前面。
>
> **这一条会跟着你到第 30 周的 CI。** CI 每次都是全新的机器，缓存主要靠 `COPY package*.json` 这一招 + 平台自带的缓存机制。

## 4.4 `package*.json` 里的 `*` 是什么

```dockerfile
COPY package*.json ./
```

**这是通配符，匹配 `package.json` 和 `package-lock.json`。**

**展开就是：**

```text
COPY package.json package-lock.json ./
```

**为什么用通配符：**

```text
有的项目有 package-lock.json，有的没有
用 * 两种都能一次拷进去
```

**`./` 是容器里的当前目录 `/app`。**

**注意：`COPY` 的源路径是相对于"构建上下文"（那个 `.`），不是相对于你的 C 盘根目录。**

```text
COPY package.json ./       ← 上下文根目录下的 package.json → /app/package.json
COPY src/ ./src            ← 上下文里的 src 目录 → /app/src
```

## 4.5 如果你想看更详细的日志

**BuildKit 默认输出是折叠的，有时候看不清哪一步慢。**

```bash
docker build --progress=plain -t chat-app:1.3 .
```

**输出变成这样（每一步都完整打印）：**

```text
#8 [4/5] RUN npm install
#8 0.512 added 87 packages, and audited 88 packages in 512ms
#8 0.514
#8 0.516 12 packages are looking for funding
#8 0.516   run `npm fund` for details
#8 DONE 0.6s
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `#8` | 这是第 8 个"步骤节点" |
| `[4/5]` | 你 Dockerfile 的第 4 条（共 5 条） |
| `#8 0.512` | 这一步开始后 0.512 秒时的输出 |
| `DONE 0.6s` | 这一步完成了，花了 0.6 秒 |

**装依赖报错的时候，`--progress=plain` 是唯一能看清错在哪的办法。**

**记住这条命令。** 第 6 部分的七个错，有一半要靠它才能定位。

---

# 第 5 步：写成正式版（20 分钟）

## 5.1 完整的 Dockerfile

**把 `chat-app-docker/Dockerfile` 整个替换成：**

```dockerfile
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com \
 && npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

## 5.2 逐行读这 13 行

| 行 | 干什么 | 为什么这么写 |
|---|---|---|
| `FROM node:20-alpine` | 基础镜像 | `alpine` 版约 130MB，完整版约 1.1GB |
| `WORKDIR /app` | 设工作目录 | 之后所有命令都在 `/app` 里执行；目录不存在会自动建 |
| `ENV NODE_ENV=production` | 设环境变量 | 让 Express 等库走生产模式（关掉调试） |
| `COPY package*.json ./` | **先只拷依赖清单** | 这是缓存的关键 |
| `RUN npm config set registry ...` | 换 npm 源 | 国内装依赖快十倍 |
| `&& npm ci --omit=dev` | 装生产依赖 | `ci` 保证版本一致；`--omit=dev` 不装开发依赖 |
| `COPY . .` | 再拷源码 | 放最后，改代码只重跑这一层 |
| `EXPOSE 3000` | 声明端口 | **只是文档说明，不真的开放端口** |
| `CMD ["node", "server.js"]` | 容器启动时跑什么 | 用 exec 格式（方括号） |

**`EXPOSE` 是最容易被误解的一条：**

```text
它不开放端口
它不映射端口
它只是"写在这里告诉别人这个镜像想用 3000"
真正对外开放要 docker run -p
```

**删掉 `EXPOSE`，容器一样能跑。** 但留着有好处：`docker run -P`（大写 P）会自动映射它声明的端口，别人看 `docker inspect` 也能知道该映射哪个端口。

**`CMD` 为什么用方括号：**

```dockerfile
✅ CMD ["node", "server.js"]     exec 格式，直接启动进程，node 是 1 号进程
❌ CMD node server.js            shell 格式，实际是 /bin/sh -c "node server.js"
```

**shell 格式的问题：**

```text
① 你的 node 不是 1 号进程，是 sh 的子进程
② docker stop 发的信号到不了 node，要等 10 秒超时才强杀
③ 改一行 CMD 参数就要重 build
```

**规则：`CMD` 和 `ENTRYPOINT` 一律用方括号格式。**

## 5.3 `npm ci` 和 `npm install` 的区别

| | `npm install` | `npm ci` |
|---|---|---|
| 读什么 | `package.json` + 可能改 `package-lock.json` | **只读 `package-lock.json`** |
| 版本会不会变 | 可能会（补丁版本升级） | **绝对不会** |
| `node_modules` 已存在 | 增量更新 | **整个删掉重装** |
| 没有 lock 文件 | 能跑 | **直接报错** |
| 速度 | 慢一些 | 快一些 |
| 用在 | 开发时加依赖 | **CI / 镜像构建** |

**一句话：`npm ci` 是"照 lock 文件一模一样地装"，`npm install` 是"尽量满足 package.json"。**

**镜像里必须用 `npm ci`。** 否则你今天 build 的镜像和下周 build 的镜像，依赖版本可能不同 —— 那 Docker 保证的"环境一致"就破了。

**`--omit=dev` 是什么：**

```text
devDependencies 里是 nodemon、eslint、prettier 这些
生产环境不需要它们
不装能省几十 MB，还少了几个攻击面
```

**注意：** 如果你的项目把 `express` 之类放错了位置（放进了 `devDependencies`），`--omit=dev` 之后容器会报 `Cannot find module 'express'`。**去 `package.json` 里确认所有运行时要用的包都在 `dependencies` 里。**

**老版本 npm 的写法是 `--production`，npm 8 之后推荐 `--omit=dev`。** 你的 Node 20 自带 npm 10，用新写法。

## 5.4 换 npm 源那一行

```dockerfile
RUN npm config set registry https://registry.npmmirror.com \
 && npm ci --omit=dev
```

**为什么两件事写在一个 `RUN` 里：**

**每条 `RUN` 是一层。两个 `RUN` 就是两层。**

```dockerfile
❌ RUN npm config set registry https://registry.npmmirror.com
   RUN npm ci --omit=dev
   → 2 层

✅ RUN npm config set registry https://registry.npmmirror.com && npm ci --omit=dev
   → 1 层
```

**但注意：`npm config set` 写进的是容器里的 `~/.npmrc`，构建完成后这个配置还在镜像里。**

**更干净的做法是用 `ARG`：**

```dockerfile
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --omit=dev --registry=$NPM_REGISTRY
```

**这个 `ARG` 不会留在最终镜像的环境变量里。** 你现在用简单写法就行，知道有这回事。

## 5.5 build 正式版

```bash
docker build -t chat-app:2.0 .
```

**注意第一次会因为基础镜像从 `node:20` 换成 `node:20-alpine` 而重新拉（约 130MB，比 1.1GB 快得多）。**

**应该看到最后：**

```text
 => => naming to docker.io/library/chat-app:2.0
```

**看大小对比：**

```bash
docker images
```

**应该看到：**

```text
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
chat-app     2.0       a1b2c3d4e5f6   10 seconds ago   178MB
chat-app     1.2       9f8e7d6c5b4a   20 minutes ago   1.24GB
```

**逐列读这个对比：**

| 镜像 | 大小 | 差在哪 |
|---|---|---|
| `chat-app:1.2` | 1.24GB | `node:20` 完整版（含完整 Debian + 编译工具链） |
| `chat-app:2.0` | 178MB | `node:20-alpine` + 不装开发依赖 |

**省了 1GB。** 这个差别在 CI 里就是"每次构建少拉 1GB"。

**（这两个数字会随版本变化，你看到的可能不同。看趋势就对了。）**

## 5.6 确认新镜像还能跑

```bash
docker run -d --name chat-app-2 -p 3000:3000 chat-app:2.0
docker logs chat-app-2
```

**应该看到：**

```text
Server running at http://localhost:3000
```

**浏览器再确认一次，然后删掉：**

```bash
docker rm -f chat-app-2
```

## 5.7 一个必须知道的坑：alpine 和原生模块

**`alpine` 用的是 `musl libc`，不是常见的 `glibc`。**

**大部分纯 JS 的包没问题。但有些包带"原生模块"（C++ 编译出来的 .node 文件），在 alpine 上会装不上或者跑不起来。**

**典型受害者：**

```text
better-sqlite3
sqlite3
bcrypt
sharp
canvas
```

**症状（build 阶段）：**

```text
npm ERR! gyp ERR! find Python
npm ERR! gyp ERR! stack Error: Can't find Python executable "python", you can set the PYTHON env variable.
```

**症状（运行阶段）：**

```text
Error: Error loading shared library ld-linux-x86-64.so.2: No such file or directory
```

**三种解法：**

```text
① 换 node:20-slim（Debian 精简版，约 200MB，兼容性好）
② 在 alpine 里装编译工具（镜像会变大，白折腾）
③ 确认这个包有没有 musl 的预编译版本（看它的文档）
```

**如果你的项目用了上面那几个包，直接换 `node:20-slim`。**

**这就是第 197 节课练习二里说的"alpine 会咬你一口"。**

---

# 第 6 步：故意犯七个错（25 分钟）

## 错误 1：忘了 `.dockerignore`，`.env` 进了镜像

**操作：** 把 `.dockerignore` 改名成 `.dockerignore.bak`，重新 build。

```bash
mv .dockerignore .dockerignore.bak
docker build -t chat-app:leak .
```

**会怎样：** build 完全成功，你会以为没事。

**然后验证：**

```bash
docker run --rm chat-app:leak cat /app/.env
```

**输出：**

```text
PORT=3000
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgres://user:password@localhost:5432/app
```

**你的 key 完整地打印在屏幕上了。**

**再看镜像里有没有：**

```bash
docker run --rm chat-app:leak ls -a /app
```

```text
.  ..  .env  .git  data  node_modules  package.json  package-lock.json  public  server.js
```

**`node_modules`、`.git`、`data` 全在里面。**

**为什么：**

`COPY . .` 会复制构建上下文里的**所有**文件。`.dockerignore` 是唯一能拦住它的东西。

**为什么危险：** 镜像一旦推到仓库（第 30 周要推），任何能 pull 的人都能扒出来。

```bash
docker save chat-app:leak -o leak.tar
# 解开 tar，一层层找，key 就在里面
```

**删掉镜像也没用**，构建缓存里还有。

**怎么修：**

```bash
mv .dockerignore.bak .dockerignore
docker build -t chat-app:2.1 .
```

**然后重新验证：**

```bash
docker run --rm chat-app:2.1 ls -a /app
```

**应该只剩：**

```text
.  ..  package.json  package-lock.json  public  server.js
```

**⚠️ 如果 key 真的进过镜像并且推过仓库，第一件事不是删镜像，是去后台吊销那个 key。** 第 33 周会详细讲。

## 错误 2：`COPY . .` 放在最前面，缓存全废

**操作：** 把 Dockerfile 改成：

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm ci --omit=dev

CMD ["node", "server.js"]
```

**会怎样：** build 能成功，但每次改代码都重装依赖。

**改一个字符，再 build：**

```bash
docker build -t chat-app:slow .
```

```text
 => [3/5] COPY . .                                    0.4s
 => [4/5] RUN npm ci --omit=dev                      24.7s
```

**`RUN npm ci` 没有 `CACHED`，跑了 24.7 秒。**

**为什么：**

`COPY . .` 的内容变了（`server.js` 变了），它这一层失效。

**缓存规则是"一层失效，下面全部失效"。** `RUN npm ci` 在它下面，所以跟着重跑。

**怎么修：**

**把 `COPY package*.json ./` 提到 `RUN` 前面，`COPY . .` 放最后。**

```dockerfile
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
```

**这就是 4.3 讲的顺序。**

> **判断标准：如果你改了 `server.js`，build 输出里 `RUN npm ci` 应该是 `CACHED`。不是的话，顺序错了。**

## 错误 3：`COPY failed: file not found`

**操作：** 在项目**上一级目录**执行 build，但 Dockerfile 里写的是 `COPY package.json`。

```bash
cd ..
docker build -t chat-app:wrong ./chat-app-docker
```

**或者更常见的：** `.dockerignore` 里写了 `*.json`（本意是排除日志），把 `package.json` 也排掉了。

**会怎样：**

```text
[+] Building 1.2s (6/6) FINISHED
 => [internal] load build definition from Dockerfile                                0.0s
 => [1/5] FROM docker.io/library/node:20-alpine                                     0.0s
 => [2/5] WORKDIR /app                                                              0.0s
 => ERROR [3/5] COPY package*.json ./                                               0.0s
------
 > [3/5] COPY package*.json ./:
------
Dockerfile:5
--------------------
   3 | WORKDIR /app
   4 |
   5 | >>> COPY package*.json ./
   6 |     RUN npm ci --omit=dev
--------------------
ERROR: failed to solve: failed to compute cache key:
"/package.json" not found: not found
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `ERROR [3/5] COPY package*.json ./` | 第 3 步失败 |
| `Dockerfile:5` | 出问题的是 Dockerfile 第 5 行 |
| `>>> COPY package*.json ./` | 就是这一行 |
| `failed to compute cache key` | 算不出这一层的哈希 |
| `"/package.json" not found` | **上下文根目录里没有 `package.json`** |

**为什么：**

`COPY` 的源路径是**相对构建上下文**的，不是相对 Dockerfile 所在的目录。

```bash
docker build -f ../Dockerfile .          # 上下文是当前目录
docker build -t x .                      # 上下文是当前目录
docker build -t x ./chat-app-docker      # 上下文是 chat-app-docker
```

**上面第三种，上下文是 `chat-app-docker`，但你如果在上一级执行，你的 Dockerfile 也得在上一级或者用 `-f` 指定。**

**怎么修：**

```bash
# 进到项目目录里再 build
cd chat-app-docker
docker build -t chat-app:2.2 .
```

**如果 `.dockerignore` 有嫌疑，临时改成空文件试：**

```bash
mv .dockerignore .dockerignore.bak
docker build -t chat-app:test .
```

**能过就是 `.dockerignore` 排错了。**

## 错误 4：`Cannot find module '/app/server.js'`

**操作：** Dockerfile 里把入口写成 `server.js`，但你实际的入口是 `src/server.js`。

```dockerfile
CMD ["node", "server.js"]
```

**会怎样：**

```bash
docker run --rm chat-app:2.2
```

```text
node:internal/modules/cjs/loader:1215
  throw err;
  ^

Error: Cannot find module '/app/server.js'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1212:15)
    at Module._load (node:internal/modules/cjs/loader:1032:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:144:5)
    at node:internal/main/run_main_module:28:49 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v20.18.0
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Error: Cannot find module '/app/server.js'` | **在 `/app` 里找不到 `server.js`** |
| `code: 'MODULE_NOT_FOUND'` | Node 的标准"文件不存在"错误码 |
| `requireStack: []` | 没有调用栈，因为是入口文件 |
| `Node.js v20.18.0` | 容器里的 Node 版本 |

**为什么：**

`WORKDIR /app` 之后，`CMD` 里的相对路径是相对 `/app` 的。

你的文件在 `/app/src/server.js`，但你写的是 `server.js`，Node 去 `/app/server.js` 找，没有。

**怎么查：**

```bash
docker run --rm chat-app:2.2 ls -R /app
```

**会看到：**

```text
/app:
package.json  package-lock.json  public  src

/app/src:
server.js
routes
```

**`src` 目录里有 `server.js`。**

**怎么修：**

```dockerfile
CMD ["node", "src/server.js"]
```

**或者如果你的 `package.json` 里已经写了 `"start": "node src/server.js"`，直接用：**

```dockerfile
CMD ["npm", "start"]
```

**但注意：用 `npm start` 会多一个 npm 进程，信号传递要多绕一层。** 能直接写 `node` 就写 `node`。

## 错误 5：`npm ci` 报 lock 文件不同步

**操作：** 你手动改了 `package.json` 里的版本号，但没重新生成 `package-lock.json`，然后 build。

**会怎样：**

```text
[4/5] RUN npm ci --omit=dev
0.412 npm ERR! code EUSAGE
0.413 npm ERR!
0.413 npm ERR! `npm ci` can only install packages when your package.json and
0.413 npm ERR! package-lock.json or npm-shrinkwrap.json are in sync. Please update
0.413 npm ERR! your lock file with `npm install` before continuing.
0.413 npm ERR!
0.413 npm ERR! Missing: express@4.21.2 from lock file
0.413 npm ERR!
0.413 npm ERR! A complete log of this run can be found in: /root/.npm/_logs/...
------
Dockerfile:8
ERROR: failed to solve: process "/bin/sh -c npm ci --omit=dev" did not return a zero exit code: 1
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `code EUSAGE` | 用法错误（不是网络问题） |
| `can only install packages when ... are in sync` | 两个文件的版本对不上 |
| `Please update your lock file with npm install` | **它就告诉你怎么办了** |
| `Missing: express@4.21.2 from lock file` | lock 文件里没有 `express` 这个版本 |
| `did not return a zero exit code: 1` | 命令退出码 1，构建失败 |

**为什么：**

`npm ci` 严格按 lock 文件装。你改了 `package.json`，lock 文件没跟上，它不敢乱装，直接报错。

**这不是 bug，这是特性。** 它就是在防你"本地和服务器装出不同版本"。

**怎么修：**

```bash
# 在你电脑上（项目目录里）
npm install
# 这会更新 package-lock.json
```

**然后重新 build。**

**注意顺序：先 `npm install` 生成 lock，再复制进 Docker 上下文。** 如果你的 Dockerfile 已经从上下文拷了旧的 lock，得先把新 lock 复制过去。

## 错误 6：镜像名带大写

**操作：**

```bash
docker build -t Chat-App:1.0 .
```

**会怎样：**

```text
ERROR: failed to solve: invalid reference format: repository name must be lowercase
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `invalid reference format` | 镜像引用格式不合法 |
| `repository name must be lowercase` | **仓库名必须小写** |

**为什么：**

镜像名要符合 Docker 的命名规则：

```text
✅ 小写字母、数字、下划线、点、斜杠、连字符
❌ 大写字母
❌ 空格
❌ 中文
```

**为什么不让大写：** 因为镜像名最终会变成 URL 路径的一部分（`docker.io/library/chat-app`），大小写混用会有兼容问题。

**怎么修：**

```bash
docker build -t chat-app:1.0 .
```

**标签（冒号后面）可以有大写，仓库名不行。**

## 错误 7：在错误的目录 build，上下文几百 MB

**操作：** 你在 `第02节课/` 目录下执行：

```bash
docker build -t chat-app:big .
```

**而 Dockerfile 在 `03-练习代码/chat-app-docker/` 里。**

**会怎样：**

```text
[+] Building 0.8s (1/1) FINISHED
 => [internal] load build definition from Dockerfile                                0.0s
 => => transferring dockerfile: 2B                                                  0.0s
ERROR: failed to solve: failed to read dockerfile:
open Dockerfile: no such file or directory
```

**或者如果那里有别的 Dockerfile：**

```text
 => [internal] load build context
 => => transferring context: 1.24GB 38.2s
```

**`1.24GB` —— 它把整个目录（含 `node_modules`）都打包送过去了。**

**为什么：**

`docker build .` 的那个 `.` 就是"上下文"。**上下文是整棵树，不是只有你要的文件。**

**怎么修：**

```bash
cd 03-练习代码/chat-app-docker
docker build -t chat-app:3.0 .
```

**或者用 `-f` 指定 Dockerfile，但上下文还是当前目录：**

```bash
docker build -f chat-app-docker/Dockerfile -t chat-app:3.0 chat-app-docker
```

**这条的意思是：**

```text
-f chat-app-docker/Dockerfile   用这个 Dockerfile
chat-app-docker                 但上下文是这个目录
```

**上下文永远在最后那个位置参数。**

> **一条经验：`docker build` 的输出第一眼看 `transferring context` 那个大小。**
>
> **超过 10MB 就要怀疑 `.dockerignore` 或者上下文选错了。**

---

# 第 7 步：写学习笔记（10 分钟）

**打开 `第02节课/02-笔记/NOTES.md`，按里面的模板填。**

**重点填这四处：**

```text
① 我的 build 输出里，transferring context 是多少 MB
② 改代码前后，RUN npm ci 那一行是 CACHED 还是重新跑
③ 两个版本镜像的大小差多少
④ .env 进了镜像之后，我是怎么验证它真的在里面
```

**这四处填不出来，说明这一节没过。**

---

# 第 8 步：课后练习

## 练习一：把 `latest` 换成具体版本

**要求：**

1. 现在你的 Dockerfile 是 `FROM node:20-alpine`；
2. 去 Docker Hub 查 `node` 这个镜像有哪些 tag（搜 `node alpine`）；
3. 挑一个具体版本，比如 `node:20.18.0-alpine`，写进去；
4. 重新 build。

**记录：** 两个 tag 拉下来的镜像大小一样吗？build 时间有变化吗？

**思考：为什么生产环境要写具体版本？如果 `node:20-alpine` 半年后指向了 Node 20.25，你的项目会不会挂？**

## 练习二：测量缓存带来的时间差

**要求：**

1. 用 4.3 的正确顺序，改一行 `server.js`，build，记时间；
2. 把 `COPY . .` 移到 `RUN npm ci` 前面，再改一行，build，记时间；
3. 两个时间对比。

**记录：** 表格。

```text
| 顺序 | 改代码后 build 耗时 | RUN npm ci 是 CACHED 吗 |
|---|---|---|
| 正确（package*.json 在前） | | |
| 错误（COPY . . 在前） | | |
```

**思考：如果你的 CI 每次要跑 5 分钟，一天 push 20 次，一个月浪费多少时间？**

## 练习三：故意让 `.env` 进镜像，再清掉

**要求：**

1. 备份 `.dockerignore`；
2. 删掉 `.dockerignore`，build 成 `chat-app:leak`；
3. `docker run --rm chat-app:leak cat /app/.env` 看输出；
4. 恢复 `.dockerignore`，重新 build 成 `chat-app:2.1`；
5. 再 `cat /app/.env`，应该报 `No such file or directory`。

**记录：** 第 3 步和第 5 步的输出。

**思考：第 3 步那个镜像如果已经推到公开仓库，你删掉本地镜像有用吗？应该做什么？**

## 练习四：读一次完整的 build 日志

**要求：**

1. `docker build --progress=plain -t chat-app:debug . 2>&1 | tee build.log`；
2. 打开 `build.log`，找出每一层对应哪条 Dockerfile 指令；
3. 数一数一共几层。

**记录：** 每一层的编号、指令、耗时。

**思考：`FROM node:20-alpine` 这一层为什么耗时 0 秒（第二次 build 时）？它去哪了？**

## 练习五：给你的项目加一条健康检查命令

**要求：**

1. 在 Dockerfile 里加一条 `HEALTHCHECK`；
2. 语法：

   ```dockerfile
   HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
     CMD wget -qO- http://localhost:3000/ || exit 1
   ```

3. build 并 run；
4. 等 30 秒，`docker ps` 看 STATUS 那一列。

**记录：** STATUS 变成了什么？如果故意把 `server.js` 改坏让它起不来，STATUS 又是什么？

**思考：`healthy` 和 `unhealthy` 这两个状态，第 6 节的 compose 会怎么用？**

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我知道 Dockerfile 里每条指令会变成一层
- [ ] 我知道"构建上下文"是 `docker build` 最后那个点指向的目录
- [ ] 我知道为什么 `COPY package*.json` 要单独一行放在 `COPY . .` 前面
- [ ] 我知道 `EXPOSE` 只是声明，不真的开端口
- [ ] 我知道 `npm ci` 和 `npm install` 的区别，以及为什么镜像里要用 `ci`

## B. 实操

- [ ] 我有一个 `chat-app-docker/` 副本，里面有 `package-lock.json`
- [ ] 我写了 `.dockerignore`，里面有 `node_modules` 和 `.env`
- [ ] `docker build -t chat-app:2.0 .` 成功
- [ ] 改一行代码再 build，`RUN npm ci` 那一行是 `CACHED`
- [ ] `docker images` 里能看到 `chat-app` 的两个版本，大小不同
- [ ] 容器跑起来后浏览器能打开 `localhost:3000`
- [ ] 我会用 `--progress=plain` 看完整日志

## C. 排错

- [ ] 看到 `COPY failed: file not found`，我知道先查上下文和 `.dockerignore`
- [ ] 看到 `Cannot find module`，我知道是 `CMD` 的路径不对
- [ ] 看到 `npm ci ... not in sync`，我知道要跑一次 `npm install`
- [ ] 看到 `invalid reference format`，我知道镜像名要大写改小写
- [ ] 看到 `transferring context: 1.2GB`，我知道上下文选错了

## D. 交付

- [ ] `Dockerfile` 和 `.dockerignore` 两个文件都在 `chat-app-docker/` 里
- [ ] `Dockerfile` 里的 `CMD` 路径和你项目的真实入口一致
- [ ] 镜像大小在 300MB 以内（用 alpine 的话）

## E. 笔记

- [ ] `NOTES.md` 里填了 build 上下文大小、缓存命中情况、镜像大小对比
- [ ] 「我卡在哪」写了真实报错
- [ ] 我记录了 `alpine` 有没有踩到原生模块的坑

## 本节课要能说出口的一句话

> **Dockerfile 不只是"怎么装"，它还是"哪一步可以跳过"的说明书；`COPY package*.json` 单独一行，是为了让你改代码时不用重装依赖。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `failed to read dockerfile: open Dockerfile: no such file or directory` | 当前目录没有 Dockerfile | `cd` 到项目目录，或 `-f` 指定 |
| `failed to compute cache key: "/package.json" not found` | 上下文里没有这个文件 / `.dockerignore` 排掉了 | 检查上下文路径和 `.dockerignore` |
| `transferring context: 1.2GB` | 上下文选错，或没写 `.dockerignore` | 进对目录；加 `.dockerignore` |
| `npm ci ... are in sync` | lock 文件和 package.json 不一致 | 本地 `npm install` 后重 build |
| `npm ERR! code EUSAGE` | 同上，是 `npm ci` 的用法错误 | 同上 |
| `Cannot find module '/app/xxx.js'` | `CMD` 路径不对 | `docker run --rm 镜像 ls /app` 看实际结构 |
| `Error: Cannot find module 'express'` | 依赖被 `--omit=dev` 排掉了 | 确认 express 在 `dependencies` 里 |
| `invalid reference format` | 镜像名有大写 | 全小写 |
| `gyp ERR! find Python` | alpine 上装原生模块 | 换 `node:20-slim` |
| `Error loading shared library ld-linux-x86-64.so.2` | 原生模块在 alpine 上跑不起来 | 换 `node:20-slim` |
| 容器起来就退出，`Exited (1)` | 程序自己报错 | `docker logs <容器>` |
| `docker logs` 什么都没有 | 程序还没输出就崩了 | `docker run --rm 镜像 node server.js` 前台跑看输出 |
| 页面打不开，但容器 `Up` | 监听在 `127.0.0.1`，或端口映射错 | 改成监听 `0.0.0.0`；检查 `-p` |
| 构建很慢，卡在 `load metadata` | 网络连不上镜像仓库 | 配加速器（第 197 节课） |
| `port is already allocated` | 宿主机的 3000 被占用 | 换个端口 `-p 3001:3000` |
| 改了代码但容器里还是旧代码 | 用的是旧镜像，或忘了重新 build | 重新 `docker build`，再 `docker run` |
| `docker build` 成功但 `docker images` 找不到 | 标签重名覆盖了旧的 | 看 `CREATED` 时间，用不同 tag |
| 镜像比预期大很多 | `COPY . .` 带进了 `node_modules` | 确认 `.dockerignore` 有 `node_modules` |
