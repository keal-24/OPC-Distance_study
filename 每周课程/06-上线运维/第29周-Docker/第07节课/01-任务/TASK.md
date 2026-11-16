# 第 203 节课：收口——一条命令起全栈

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这一周前六节你把零件一个个做出来了：Dockerfile、端口、密钥、卷、compose。
> 今天把它们装成一台机器：**`docker compose up -d`，全栈可用，镜像瘦下来，文件能交付。**

**建议用时**：130 分钟
**你需要先完成**：第 202 节课。具体要求：`docker compose up -d` 之后 `docker compose ps` 两个服务都是 Up，postgres 显示 `(healthy)`。

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
docker build / run / exec / logs     单个容器
-v 卷                                数据不丢
compose.yaml + up -d                 app + postgres 一起起
```

**能跑，但还不能交付。**

**为什么不能交付：**

```text
① 镜像 1.2GB，客户那边拉一次要半小时
② 起服务的命令在你自己脑子里，没写下来
③ 起了之后"对不对"，你靠眼睛看
④ 出了问题怎么退回去，没想过
```

## 0.2 你以后会遇到什么

```text
① "客户说装好了，但打不开，你远程看一眼"
② "新版本有问题，怎么快速退回上一版"
③ "镜像推到仓库花了 20 分钟"
④ "服务器上 up 起来了，但我不知道它到底健康不健康"
⑤ "半年后你自己也忘了当时怎么起的"
```

**这五件事，对应今天五个交付物：compose 文件、版本 tag、瘦身镜像、冒烟脚本、一份说明。**

## 0.3 今天要建立的三个概念

```text
① 多阶段构建 —— 一个 Dockerfile 里写两段，前一段装工具，后一段只留成品
② 可交付的 compose —— 别人拿到这个文件和 .env.example，能自己起来
③ 冒烟测试 —— 起完之后用几条命令确认"核心功能真的通了"，不是"容器是绿的"
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `Dockerfile`（多阶段） | `chat-app-docker/` | 两段构建，最终镜像 < 200MB |
| `compose.yaml`（最终版） | `chat-stack/` | app + postgres + healthcheck + 日志轮转 |
| `.env.example` | `chat-stack/` | 交付必需，只有键名 |
| `smoke.sh` | `chat-stack/` | 五条冒烟检查 |
| `README.md` | `chat-stack/` | 怎么起、怎么退、怎么排查 |
| `NOTES.md` | `第07节课/02-笔记` | 本周总结 |

---

# 第 1 步：先体检，量出现在多大（15 分钟）

## 1.1 看镜像

```bash
docker images | grep chat-app
```

**应该看到类似：**

```text
chat-app   1.0   8a1b2c3d4e5f   3 days ago   1.24GB
chat-app   2.0   9c3d4e5f6a7b   2 days ago   178MB
chat-app   4.0   a5b6c7d8e9f0   1 day ago    182MB
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `REPOSITORY` | `chat-app` |
| `TAG` | `1.0` / `2.0` / `4.0`，你的版本 |
| `SIZE` | **这是解压后的大小，也就是客户拉下来要占的硬盘** |

**注意：`SIZE` 不是"下载大小"。** 网络传输的是压缩层，通常比这个大数字小 30—40%。

```text
docker images 的 SIZE   ≈ 解压后占硬盘
docker hub 上显示的大小 ≈ 压缩后传输
```

## 1.2 看每一层多大

```bash
docker history chat-app:4.0 --format "{{.Size}}\t{{.CreatedBy}}" | head -15
```

**应该看到类似（`\t` 是制表符）：**

```text
0B      CMD ["node" "server.js"]
0B      EXPOSE map[3000/tcp]
1.8MB   COPY . . # buildkit
42.1MB  RUN /bin/sh -c npm config set registry ... && npm ci --omit=dev # buildkit
1.2MB   COPY package*.json ./ # buildkit
0B      ENV NODE_ENV=production
0B      WORKDIR /app
138MB   /bin/sh -c #(nop) ADD file:... in /
```

**逐行读（从下往上看）：**

| 层 | 大小 | 是什么 |
|---|---|---|
| `ADD file:...` | **138MB** | **基础镜像 `node:20-alpine` 本身** |
| `WORKDIR /app` | 0B | 只改元数据，不占空间 |
| `ENV` | 0B | 同上 |
| `COPY package*.json` | 1.2MB | 两个 json 文件 |
| `RUN npm ci` | **42.1MB** | 依赖 |
| `COPY . .` | 1.8MB | 你的源码 |
| `EXPOSE` / `CMD` | 0B | 只是元数据 |

**结论：**

```text
138MB（基础镜像）+ 42MB（依赖）+ 3MB（代码）= 183MB
```

**其中 75% 是"Node 本身"。** 这部分很难再压。

## 1.3 记录基线

**把数字写进笔记：**

```text
chat-app:1.0   1.24GB      基础镜像 node:20（完整 Debian）
chat-app:4.0   183MB       基础镜像 node:20-alpine + npm ci --omit=dev
今天目标       < 200MB
```

**1.24GB → 183MB 已经省了 85%。** 主要靠两件事：

```text
① node:20 → node:20-alpine
② npm install → npm ci --omit=dev
```

**今天要再进一步：多阶段构建。**

---

# 第 2 步：多阶段构建（25 分钟）

## 2.1 为什么需要多阶段

**问题：装依赖需要"工具"，但运行不需要。**

**典型场景：**

| 场景 | 构建时需要 | 运行时需要 |
|---|---|---|
| 原生模块（`better-sqlite3`、`bcrypt`） | `python3`、`make`、`g++` | 只要编译好的 `.node` 文件 |
| TypeScript | `tsc`、`@types/*` | 只要编译后的 `.js` |
| 前端（Vite/React） | `vite`、`webpack`、所有源码 | 只要 `dist/` 里的静态文件 |

**如果你把工具装进最终镜像：**

```text
① 镜像大几百 MB
② 攻击面变大（g++ 能编译恶意代码）
③ 别人能更容易逆向你的构建过程
```

**多阶段构建的做法：**

```text
阶段 1（builder）：装工具、装依赖、编译 → 得到一个"半成品"
阶段 2（runtime）：从阶段 1 只复制"成品"，工具全部丢掉
```

**关键：最终镜像里**只有**阶段 2 的内容。阶段 1 整个被丢弃。**

## 2.2 先看一个真实的例子

**假设你的项目用了 `better-sqlite3`（原生模块）。**

**单阶段版本：**

```dockerfile
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "server.js"]
```

**问题：`python3`、`make`、`g++` 全部留在最终镜像里，大约多 180MB。**

**而运行时根本不需要编译器。**

## 2.3 多阶段版本

```dockerfile
# ---------- 阶段 1：构建 ----------
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com \
 && npm ci --omit=dev

# ---------- 阶段 2：运行 ----------
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

## 2.4 逐行读

| 行 | 意思 | 为什么 |
|---|---|---|
| `FROM node:20-alpine AS builder` | 阶段 1，**起名叫 `builder`** | 名字给 `COPY --from` 用 |
| `RUN apk add python3 make g++` | 装编译工具 | **这些只存在于阶段 1** |
| `RUN npm ci --omit=dev` | 装依赖（会编译原生模块） | 编译发生在阶段 1 |
| `FROM node:20-alpine AS runtime` | **重新从干净的基础镜像开始** | 前面装的东西全部丢掉 |
| `COPY --from=builder /app/node_modules ./node_modules` | **只拿依赖** | 依赖是编译好的成品 |
| `COPY . .` | 拿源码 | 从构建上下文拿，不是从阶段 1 |
| `CMD` | 启动 | 同前 |

**⚠️ 关键理解：**

```text
FROM 出现第二次 = 新的开始
第一次 FROM 里装的东西，第二次 FROM 里一点都没有
除非用 COPY --from=<阶段名> 主动拿
```

**这就是"多阶段"的全部原理。** 没有魔法。

## 2.5 build 并对比

```bash
docker build -t chat-app:5.0 .
docker images | grep chat-app
```

**应该看到：**

```text
chat-app   4.0   a5b6c7d8e9f0   1 day ago    182MB
chat-app   5.0   b6c7d8e9f0a1   5 seconds ago   184MB
```

**只小了 2MB？**

**因为你的项目没有原生模块。** 阶段 1 里只装了 `python3 make g++`，但**你根本没用到**（`npm ci` 没触发编译），而阶段 2 本来就没有它们。

**如果你确实有原生模块：**

```text
单阶段：182MB + 180MB（工具链）= 362MB
多阶段：184MB（工具链在阶段 1，被丢弃）
```

**省 180MB。**

> **不要为了"用上多阶段"而硬写多阶段。**
>
> **判断标准：阶段 1 里装的东西，运行时需不需要？**
>
> - 需要 → 单阶段就行，多阶段只是让文件变复杂
> - 不需要 → 多阶段能省空间

## 2.6 另一个更常见的场景：前端构建

**如果你的项目有前端（Vite / React），多阶段是必须的：**

```dockerfile
# ---------- 阶段 1：构建前端 ----------
FROM node:20-alpine AS frontend

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- 阶段 2：运行 ----------
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY --from=frontend /build/dist ./public

EXPOSE 3000

CMD ["node", "server.js"]
```

**逐行读关键两行：**

| 行 | 意思 |
|---|---|
| `RUN npm run build` | 在阶段 1 里把 React 编译成静态文件（`dist/`） |
| `COPY --from=frontend /build/dist ./public` | **只把编译产物拿过来** |

**阶段 1 里的 `node_modules`（含 webpack、babel，几百 MB）一个都没进最终镜像。**

**为什么这很重要：**

```text
React 项目的 node_modules 通常 300—500MB
编译出来的 dist/ 通常 1—3MB
```

**如果你不分阶段，把源码和 `node_modules` 都塞进去，镜像就是 800MB，而真正需要的只有 3MB 静态文件。**

## 2.7 验证新镜像还能跑

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env -v chat-data:/app/data chat-app:5.0
docker logs chat-app
curl -i http://localhost:3000
```

**应该 `HTTP/1.1 200 OK`。**

**多阶段最容易出的问题是"忘了拷某个东西"。** 所以每次改完 Dockerfile 都要跑一遍。

---

# 第 3 步：瘦身清单（20 分钟）

## 3.1 六条，按效果排序

| # | 做法 | 典型省下 | 代价 |
|---|---|---|---|
| 1 | `node:20` → `node:20-alpine` | **约 1GB** | 可能踩 `musl` 的坑 |
| 2 | `npm install` → `npm ci --omit=dev` | 50—100MB | 需要 lock 文件 |
| 3 | `.dockerignore` 排除 `node_modules`/`.git`/`data` | 50—500MB | 无 |
| 4 | 多阶段构建 | 100—300MB | Dockerfile 变长 |
| 5 | 清 npm 缓存 | 10—30MB | 无 |
| 6 | 固定具体版本 tag | 0MB（但避免"明天突然变大"） | 要手动升级 |

## 3.2 第 5 条：清缓存

**`npm ci` 会在镜像里留下 `/root/.npm` 缓存。**

```dockerfile
RUN npm config set registry https://registry.npmmirror.com \
 && npm ci --omit=dev \
 && npm cache clean --force
```

**为什么有效：**

`npm cache clean --force` 会删掉下载的包缓存。**运行时不需要它。**

**⚠️ 必须在同一个 `RUN` 里做。**

```dockerfile
❌ RUN npm ci --omit=dev
   RUN npm cache clean --force
   → 两条指令 = 两层。第一层的缓存还在，第二层只是"标记删除"
   → 镜像反而更大（多了一层）
```

**分层是"只增不减"的。** 后一层删文件，前一层的数据还在镜像里。

**这个道理对所有"删文件"的操作都成立：**

```dockerfile
❌ COPY secret.txt .
   RUN rm secret.txt
   → secret.txt 还在第一层里！第 3 节课讲过
```

## 3.3 第 6 条：固定版本

```dockerfile
❌ FROM node:20-alpine
✅ FROM node:20.18.0-alpine
```

**为什么：**

```text
node:20-alpine 是一个"会动的标签"
明年它可能指向 Node 20.30，基础镜像大了 30MB，或者 alpine 版本变了
你没改任何东西，镜像就变了
```

**这条对"可复现"比"瘦身"更重要。**

**（数字会变，以 Docker Hub 上当时有的为准。）**

## 3.4 不要过度瘦身

**有些"瘦身技巧"不值得：**

| 技巧 | 值不值 |
|---|---|
| `FROM scratch` + 静态编译 | ❌ Node 做不到 |
| 手动删 `/usr/local/lib/node_modules/npm` | ⚠️ 能省 20MB，但以后 `docker exec npm` 就没了 |
| `--squash` 合并所有层 | ❌ 会破坏缓存，且不是标准功能 |
| 换成 `distroless` | ⚠️ 更安全但调试极难，你这个阶段别用 |

**你的目标：< 200MB。** 到了就够了。

**真实对比（大致量级，会变）：**

| 镜像 | 大小 |
|---|---|
| `node:20` | ~1.1GB |
| `node:20-slim` | ~200MB |
| `node:20-alpine` | ~140MB |
| 你的应用（alpine + 依赖 + 代码） | ~180MB |

**再往下压 20MB，收益远小于你花的时间。**

## 3.5 一个反例：`--omit=dev` 把运行时依赖删了

**如果你 `package.json` 长这样：**

```json
"dependencies": {
  "express": "^4.21.0"
},
"devDependencies": {
  "pg": "^8.13.0"
}
```

**`pg` 是运行时要用的（连数据库），但被放进了 `devDependencies`。**

**`npm ci --omit=dev` 之后：**

```bash
docker logs chat-app
```

```text
Error: Cannot find module 'pg'
Require stack:
- /app/db.js
- /app/server.js
```

**怎么修：把 `pg` 移到 `dependencies`。**

```bash
npm uninstall pg
npm install pg
```

**怎么提前发现：**

```bash
# 在本地模拟生产安装
rm -rf node_modules
npm ci --omit=dev
node server.js
```

**能跑，说明依赖分类是对的。**

---

# 第 4 步：写最终版 compose（25 分钟）

## 4.1 目标

**一条命令起全栈，并且：**

```text
✅ 等数据库真的好了再起 app
✅ 数据放卷里
✅ 日志不会撑爆硬盘
✅ 崩了自动重启
✅ 只暴露 app 的 3000
✅ 密码从 .env 来
```

## 4.2 完整文件

**在 `第06节课/03-练习代码/chat-stack/` 里（或复制到 `第07节课/03-练习代码/chat-stack/`）改成：**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: chat-postgres
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: chatdb
      TZ: Asia/Shanghai
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d chatdb"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 15s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    restart: unless-stopped

  app:
    build:
      context: ../chat-app-docker
      dockerfile: Dockerfile
    image: chat-app:${APP_VERSION:-local}
    container_name: chat-app
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - app.env
    environment:
      DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/chatdb
      TZ: Asia/Shanghai
    volumes:
      - uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    restart: unless-stopped

volumes:
  pg-data:
  uploads:
```

## 4.3 逐块读新增的部分

| 配置 | 为什么加 |
|---|---|
| `TZ: Asia/Shanghai` | **容器默认 UTC**。日志时间会比北京时间差 8 小时，排查时抓狂 |
| `start_period: 15s` | 数据库首次初始化慢，前 15 秒失败不算数 |
| `logging.max-size: "10m"` | 单文件 10MB 上限（第 199 节课说过，不配会撑爆硬盘） |
| `logging.max-file: "3"` | 最多留 3 个，共 30MB |
| `image: chat-app:${APP_VERSION:-local}` | **build 出来的镜像打上版本 tag**，方便回滚 |
| `"127.0.0.1:3000:3000"` | 只给本机访问，**第 31 周会换成 Nginx 反向代理** |
| `uploads:/app/uploads` | 用户上传的文件也要持久化（跟数据一个道理） |
| `app.healthcheck` | **app 自己也要能被检查**（第 6 步的冒烟测试会用到） |

**`127.0.0.1:3000:3000` 这一条要特别注意：**

```text
本地开发：127.0.0.1 够用，你浏览器在自己机器上
服务器上：要让外面访问，得是 0.0.0.0，或者前面挡一个 Nginx
```

**第 31 周会讲：服务器上应该让 Nginx 监听 80/443，转发到本地的 3000。所以这里写 `127.0.0.1` 是对的。**

**`app.healthcheck` 里的 `wget`：**

**`node:20-alpine` 自带 `wget`（busybox 提供），但没有 `curl`。**

```text
✅ wget -qO- http://localhost:3000/health
❌ curl -f http://localhost:3000/health     ← alpine 里没有 curl
```

**这就是错误 5。**

## 4.4 两个 env 文件

**`chat-stack/.env`（给 compose 做变量替换）：**

```text
POSTGRES_PASSWORD=devpass
APP_VERSION=5.0
```

**`chat-stack/app.env`（给 app 容器）：**

```text
PORT=3000
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_BASE_URL=https://api.example.com/v1
```

**为什么分开：**

```text
.env     里有 POSTGRES_PASSWORD，app 不该知道它（它只需要 DATABASE_URL）
app.env  里有 OPENAI_API_KEY，compose 不需要它
```

**这就是第 202 节课 5.1 说的"两个 .env"。**

**⚠️ 两个都必须在 `.gitignore` 里。**

## 4.5 检查配置

```bash
docker compose config
```

**应该看到：**

```yaml
name: chat-stack
services:
  app:
    ...
    environment:
      DATABASE_URL: postgres://postgres:devpass@postgres:5432/chatdb
      TZ: Asia/Shanghai
    image: chat-app:5.0
    ...
```

**三个地方要确认：**

```text
① DATABASE_URL 里的密码不是空的
② image 的 tag 是你要的版本
③ ports 是 127.0.0.1:3000:3000
```

**有任何一个是空的，先别 up。**

## 4.6 起起来

```bash
docker compose up -d --build
```

**应该看到：**

```text
[+] Building 45.2s (12/12) FINISHED
 ...
 => => naming to docker.io/library/chat-app:5.0
[+] Running 3/3
 ✔ Network chat-stack_default      Created   0.1s
 ✔ Container chat-postgres         Healthy   14.2s
 ✔ Container chat-app              Started   0.4s
```

**看状态：**

```bash
docker compose ps
```

```text
NAME             IMAGE           SERVICE    STATUS                   PORTS
chat-app         chat-app:5.0    app        Up 20 seconds (healthy)  127.0.0.1:3000->3000/tcp
chat-postgres    postgres:16-alpine  postgres  Up 35 seconds (healthy)  5432/tcp
```

**两个都是 `(healthy)`。**

**`app` 的 healthy 需要等 20 秒（`start_period`）+ 30 秒（第一次 interval）。** 别急着查。

## 4.7 一条命令的解释

```bash
docker compose up -d --build
```

| 部分 | 意思 |
|---|---|
| `up` | 按 yaml 把服务起起来（缺的建，变的重建） |
| `-d` | 后台 |
| `--build` | **强制重新 build 有 `build` 配置的服务** |

**为什么不写 `--build` 有时候不生效：**

**`up` 的重建判断基于"配置有没有变"（image、ports、env）。**

**如果你的代码变了但 yaml 没变，`up` 不会重新 build。**

```text
改了 server.js，yaml 没变 → docker compose up -d        → 还是旧代码
改了 server.js，yaml 没变 → docker compose up -d --build → 新代码
```

**这就是错误 4。**

**规则：改了代码就加 `--build`。改了 yaml 就不用加（但加了也无害，只是慢）。**

---

# 第 5 步：冒烟测试（20 分钟）

## 5.1 "冒烟测试"是什么

**名字来自硬件行业：通电之后先看冒不冒烟。**

**在软件里，意思是：**

```text
部署完，用最快的几条命令确认"核心链路是通的"
不通就立刻回滚，别等用户发现
```

**不是"完整测试"**（那要跑测试套件，第 30 周学）。**就是几条，30 秒跑完。**

## 5.2 五条冒烟检查

| # | 检查 | 命令 | 不通说明 |
|---|---|---|---|
| 1 | 进程活着 | `docker compose ps` | 容器没起 |
| 2 | 健康检查 | `curl /health` | 应用内部有问题 |
| 3 | 首页能打开 | `curl /` 返回 200 | 静态资源/路由问题 |
| 4 | 数据库通 | `curl /health` 里 db 是 ok | 连接串/数据库问题 |
| 5 | 日志没报错 | `docker compose logs --tail 50` | 有隐藏错误 |

## 5.3 先加 `/health` 端点

**如果还没有，在 `server.js` 里加：**

```js
app.get("/health", async (req, res) => {
  try {
    await pool.query("select 1")
    res.json({ status: "ok", db: "ok", uptime: process.uptime() })
  } catch (err) {
    res.status(503).json({ status: "degraded", db: "down", error: err.code })
  }
})
```

**逐行读：**

| 行 | 为什么 |
|---|---|
| `await pool.query("select 1")` | **真的查一次库**，不是只回 `200` |
| `res.json({...})` | 返回结构化信息，人能看懂 |
| `res.status(503)` | **503 Service Unavailable**，监控和网关认这个码 |
| `process.uptime()` | 进程活了多久，能看出有没有重启 |

**为什么必须真的查库：**

```text
❌ 只 return 200  →  数据库挂了，health 还是 200  →  你不知道
✅ 查一次库       →  数据库挂了你立刻知道
```

**健康检查的意义就在于"能发现坏"，不是"永远返回好"。**

## 5.4 写 `smoke.sh`

**在 `chat-stack/` 里新建 `smoke.sh`：**

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"

echo "== 1. 容器状态 =="
docker compose ps

echo "== 2. /health =="
curl -fsS "$BASE/health" | tee /dev/stderr | grep -q '"status":"ok"'

echo "== 3. 首页 =="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[ "$code" = "200" ] || { echo "首页返回 $code"; exit 1; }

echo "== 4. 最近日志里有没有 error =="
if docker compose logs --tail 100 app 2>&1 | grep -iE "error|exception" ; then
  echo "日志里有 error，请人工确认"
  exit 1
fi

echo "✅ 冒烟通过"
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `set -euo pipefail` | 任何一步失败就停（`-e`）、用未定义变量就报错（`-u`）、管道里任何一段失败也算失败（`pipefail`） |
| `BASE="${BASE_URL:-http://localhost:3000}"` | 可以用环境变量覆盖地址 |
| `curl -fsS` | `-f` HTTP 错误码当失败；`-s` 静默；`-S` 但出错要显示 |
| `grep -q '"status":"ok"'` | 检查返回的 JSON 里状态是 ok |
| `-w "%{http_code}"` | 只输出状态码 |
| `grep -iE "error\|exception"` | 不区分大小写找错误关键字 |

**为什么 `set -euo pipefail` 这么重要：**

**没有它，脚本会"假装成功"。**

```bash
# 没有 set -e
curl -f http://localhost:3000/health    # 失败
echo "✅ 冒烟通过"                       # 照样打印
```

**这就是"检查脚本本身是坏的"这种最糟的情况。**

## 5.5 跑一遍

```bash
chmod +x smoke.sh
./smoke.sh
```

**应该看到：**

```text
== 1. 容器状态 ==
NAME             IMAGE           SERVICE    STATUS                   PORTS
chat-app         chat-app:5.0    app        Up 2 minutes (healthy)   127.0.0.1:3000->3000/tcp
chat-postgres    postgres:16-alpine  postgres  Up 3 minutes (healthy)  5432/tcp
== 2. /health ==
{"status":"ok","db":"ok","uptime":132.4}
== 3. 首页 ==
== 4. 最近日志里有没有 error ==
✅ 冒烟通过
```

**如果 `/health` 返回 `{"status":"degraded","db":"down","error":"ECONNREFUSED"}`：**

**脚本会在第 2 步退出，退出码非 0。** 这就是你要的。

**Windows 上跑 `.sh`：**

```bash
bash smoke.sh
```

**（Git Bash 里直接 `./smoke.sh` 也行。）**

## 5.6 故意让它失败一次

**停掉数据库：**

```bash
docker compose stop postgres
./smoke.sh
```

**会看到：**

```text
== 2. /health ==
curl: (22) The requested URL returned error: 503
```

**`curl: (22)` 是"HTTP 状态码 >= 400"。**

**脚本退出，退出码 1。这就是"冒烟测试发现了问题"。**

**恢复：**

```bash
docker compose start postgres
```

**等 10 秒再跑一次 `./smoke.sh`，应该通过。**

> **不懂这个会怎样：** 你会一直靠"容器是绿的"判断部署成功。**第 31 周上了服务器，容器绿、页面 502，你查两小时。**
>
> **冒烟脚本就是你的"上线前最后一道门"。** 30 秒，能挡掉大部分翻车。

---

# 第 6 步：交付（20 分钟）

## 6.1 要交付哪些文件

```text
chat-stack/
├── compose.yaml          必须
├── .env.example          必须（只有键名）
├── app.env.example       必须（只有键名）
├── smoke.sh              必须
└── README.md             必须

chat-app-docker/
├── Dockerfile            必须
├── .dockerignore         必须
└── （你的项目代码）        必须
```

**不交付：**

```text
❌ .env / app.env        里面有密码和 key
❌ node_modules          几千个文件，容器里会重新装
❌ backup/*.tar.gz       太大，而且里面有数据
❌ 镜像 tar 文件          几百 MB，用 registry 传（第 30 周）
```

## 6.2 `.env.example` 怎么写

**`chat-stack/.env.example`：**

```text
# 复制成 .env 然后填真实值
POSTGRES_PASSWORD=
APP_VERSION=1.0
```

**`chat-stack/app.env.example`：**

```text
# 复制成 app.env 然后填真实值
PORT=3000
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.example.com/v1
```

**⚠️ 值全部留空，不要写 `sk-xxx` 这种"看起来像真的"的值。** 有人会直接拿去用，然后报 401，查半天。

**更好的写法是写清楚格式：**

```text
# OPENAI_API_KEY 的格式：sk- 开头，51 个字符
OPENAI_API_KEY=
```

## 6.3 `README.md` 要写什么

**不要写"这是一个聊天应用"。** 写"别人拿到怎么起"。

```markdown
# chat-stack

聊天应用 + PostgreSQL，用 Docker Compose 起。

## 起之前

1. 装 Docker Desktop（Windows 需要 WSL2）
2. 复制配置：
   cp .env.example .env
   cp app.env.example app.env
3. 填 .env 里的 POSTGRES_PASSWORD
4. 填 app.env 里的 OPENAI_API_KEY

## 起来

    docker compose up -d --build

## 检查

    ./smoke.sh

## 看日志

    docker compose logs -f app

## 停

    docker compose down

## 升级

    # 改 .env 里的 APP_VERSION，然后
    docker compose up -d --build

## 回滚

    # 把 APP_VERSION 改回上一个版本，然后
    docker compose up -d --build

## ⚠️ 不要做的事

- 不要 `docker compose down -v`（会删数据库）
- 不要把 .env / app.env 提交到 Git
- 不要暴露 5432 到公网

## 出问题时

1. `docker compose ps` 看谁不健康
2. `docker compose logs --tail 100 app`
3. `curl localhost:3000/health`
```

**这张 README 的价值：**

```text
半年后你自己忘了怎么起 → 看它
交给客户 → 看它
换台电脑 → 看它
```

## 6.4 版本号怎么定

**规则：**

```text
1.0     第一个能用的版本
1.1     加了功能
1.1.1   修了 bug
```

**或者用日期：**

```text
2026.11.16
```

**关键是：每次部署打一个新 tag，别用 `latest`。**

**为什么：**

```text
用 latest  →  出问题想回滚，你不知道上一个 latest 是哪个
用 1.1     →  改回 1.0，up -d，结束
```

**`docker images` 就是你的"版本清单"。**

## 6.5 回滚演练

**现在做一次。** 假设 `5.0` 有问题，要退回 `4.0`。

**第一步：确认旧镜像还在**

```bash
docker images | grep chat-app
```

```text
chat-app   4.0   a5b6c7d8e9f0   1 day ago   182MB
chat-app   5.0   b6c7d8e9f0a1   5 min ago   184MB
```

**在。**

**第二步：改 `.env` 里的版本**

```text
APP_VERSION=4.0
```

**第三步：不 build，直接起**

```bash
docker compose up -d
```

**⚠️ 关键：不能加 `--build`。** 加了会重新 build 出一个 `4.0`（用现在的代码），那就不是回滚了。

**但这里有个问题：** 你的 `app` 服务配了 `build`，`up` 可能还是会 build。

**更可靠的回滚写法：**

```yaml
  app:
    image: chat-app:${APP_VERSION:-local}
    build:
      context: ../chat-app-docker
```

**如果镜像存在，compose 不会重新 build（除非加 `--build`）。**

**验证：**

```bash
docker compose ps
```

```text
NAME       IMAGE          STATUS
chat-app   chat-app:4.0   Up 5 seconds
```

**`IMAGE` 变成了 `chat-app:4.0`。回滚成功。**

**第四条：跑冒烟**

```bash
./smoke.sh
```

**通过就说明这个版本是好的。**

**⚠️ 数据在卷里，回滚不会丢数据。** 但如果新版本改了表结构（加了字段、改了类型），回到旧版本可能读不了 —— **这是数据库迁移的问题，第 34 周会讲。**

## 6.6 把最终版抄回正式项目

**这一周所有实验都在副本里做的。现在把最终版抄回去。**

```text
从 chat-app-docker/ 抄到你的 chat-app/：
  Dockerfile
  .dockerignore

新建：
  chat-app/compose.yaml（把 context 改成 .）
  chat-app/.env.example
  chat-app/smoke.sh
```

**`compose.yaml` 里的 `context` 要改：**

```yaml
    build:
      context: .
      dockerfile: Dockerfile
```

**然后在你正式项目里跑一次：**

```bash
docker compose up -d --build
./smoke.sh
```

**通过了，这一周才算收口。**

---

# 第 7 步：故意犯七个错（25 分钟）

## 错误 1：`COPY --from` 的阶段名写错

**操作：**

```dockerfile
FROM node:20-alpine AS builder
...
FROM node:20-alpine AS runtime
COPY --from=build /app/node_modules ./node_modules
```

**（阶段名叫 `builder`，你写成 `build`。）**

**会怎样：**

```text
 => ERROR [runtime 3/5] COPY --from=build /app/node_modules ./node_modules       0.0s
------
 > [runtime 3/5] COPY --from=build /app/node_modules ./node_modules:
------
Dockerfile:14
--------------------
  12 | ENV NODE_ENV=production
  13 |
  14 | >>> COPY --from=build /app/node_modules ./node_modules
--------------------
ERROR: failed to solve: failed to compute cache key:
failed to calculate checksum of ref xyz::abc:
"/app/node_modules": not found
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `COPY --from=build` | 想从叫 `build` 的阶段拿 |
| `failed to compute cache key` | 算不出这一层 |
| `"/app/node_modules": not found` | **那个阶段里没有这个路径** |
| `Dockerfile:14` | 第 14 行 |

**为什么报"路径不存在"而不是"阶段不存在"：**

Docker 找不到叫 `build` 的阶段时，会把它当成**镜像名**去拉。拉不到就退回"这个路径在上下文里也找不到"。

**怎么查：**

```bash
grep -n "FROM" Dockerfile
```

```text
1:FROM node:20-alpine AS builder
15:FROM node:20-alpine AS runtime
```

**阶段名是 `builder`。**

**怎么修：**

```dockerfile
COPY --from=builder /app/node_modules ./node_modules
```

**规则：`AS` 后面那个名字，大小写敏感，拼写要完全一致。**

## 错误 2：多阶段忘了拷 `node_modules`

**操作：**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
COPY . .
CMD ["node", "server.js"]
```

**（忘了 `COPY --from=builder /app/node_modules`。）**

**会怎样：** build 成功。

```bash
docker run --rm chat-app:6.0
```

```text
node:internal/modules/cjs/loader:1215
  throw err;
  ^

Error: Cannot find module 'express'
Require stack:
- /app/server.js

Node.js v20.18.0
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Cannot find module 'express'` | 找不到 express |
| `Require stack: - /app/server.js` | 是 `/app/server.js` 要的 |
| `Node.js v20.18.0` | 容器里的 Node |

**为什么：**

`npm ci` 在**阶段 1** 里跑的，装到阶段 1 的 `/app/node_modules`。

**阶段 2 是全新的镜像，什么都没有。** `COPY . .` 只拷上下文（你电脑上的文件），而你电脑上的 `node_modules` 被 `.dockerignore` 排除了。

**所以阶段 2 里一个依赖都没有。**

**怎么查：**

```bash
docker run --rm chat-app:6.0 ls /app
```

```text
package.json  package-lock.json  public  server.js
```

**没有 `node_modules`。**

**怎么修：**

```dockerfile
COPY --from=builder /app/node_modules ./node_modules
```

> **多阶段最容易漏的就是这一行。** 每次改完 Dockerfile，先 `ls /app` 确认一下。

## 错误 3：`npm ci --omit=dev` 之后连不上数据库

**操作：** 你的 `pg` 在 `devDependencies` 里，`npm ci --omit=dev` 把它排掉了。

**会怎样：**

```bash
docker compose logs app
```

```text
Error: Cannot find module 'pg'
Require stack:
- /app/db.js
- /app/server.js

Node.js v20.18.0
```

**为什么：**

`--omit=dev` 不装 `devDependencies`。

**`pg` 被放错了位置。**

**怎么查：**

```bash
cat package.json | grep -A5 devDependencies
```

**看到 `"pg": "^8.13.0"` 在里面。**

**怎么修：**

```bash
npm uninstall pg
npm install pg
```

**`npm install` 不带 `-D` 就进 `dependencies`。**

**怎么预防：**

```bash
# 本地模拟生产环境
rm -rf node_modules
npm ci --omit=dev
node server.js
```

**能启动，说明依赖分类对。**

**判断标准：** 运行时要 `require` 的，全在 `dependencies`；只在开发时用的（eslint、nodemon、typescript），才在 `devDependencies`。

## 错误 4：改了代码，`up -d` 没生效

**操作：**

```bash
# 改了 server.js
docker compose up -d
```

**会怎样：** 没有报错。

```bash
docker compose logs app
```

**日志里还是旧版本的输出。**

**为什么：**

**`up` 的重建判断看的是"配置"（image、ports、env、volumes），不看代码。**

**代码在 `COPY . .` 那一层里，`up` 不知道它变了。**

**怎么查（对比镜像 ID）：**

```bash
docker images --format "{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedSince}}" | grep chat-app
docker inspect --format '{{.Image}}' chat-app
```

**如果容器的 `Image` 和最新 build 出来的 ID 不一样，就是在跑旧镜像。**

**怎么修：**

```bash
docker compose up -d --build
```

**或者分两步：**

```bash
docker compose build app
docker compose up -d
```

**记住：**

```text
改代码 → --build
改 yaml → 不用 --build（但加了也行）
```

## 错误 5：健康检查用了 `curl`，但 alpine 没有

**操作：**

```yaml
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
```

**会怎样：**

```bash
docker compose ps
```

```text
NAME       STATUS
chat-app   Up 2 minutes (unhealthy)
```

**看健康检查的日志：**

```bash
docker inspect --format '{{json .State.Health}}' chat-app
```

```json
{
  "Status": "unhealthy",
  "FailingStreak": 3,
  "Log": [
    {
      "Start": "2026-11-16T04:30:12.123456789Z",
      "End": "2026-11-16T04:30:12.234567890Z",
      "ExitCode": 127,
      "Output": "/bin/sh: curl: not found\n"
    }
  ]
}
```

**逐段读：**

| 字段 | 意思 |
|---|---|
| `Status: unhealthy` | 不健康 |
| `FailingStreak: 3` | 连续失败 3 次 |
| `ExitCode: 127` | **127 = 命令不存在** |
| `Output: "/bin/sh: curl: not found"` | **容器里没有 curl** |

**为什么：**

`node:20-alpine` 基于 alpine，只带 busybox 的 `wget`，没有 `curl`。

**怎么查你的镜像里有什么：**

```bash
docker run --rm chat-app:5.0 sh -c "which curl wget"
```

```text
/usr/bin/wget
```

**只有 wget。**

**怎么修：**

```yaml
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
```

**`wget -qO-` 的意思：**

```text
-q     安静（不打印进度）
-O -   输出到标准输出
```

**或者用 Node 自己（最保险，因为 Node 一定在）：**

```yaml
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
```

**Node 18+ 有全局 `fetch`。** 这个写法不依赖任何系统工具。

## 错误 6：交付时漏了 `.env.example`

**操作：** 你把项目打包给客户，只给了 `compose.yaml` 和代码。

**会怎样：** 客户执行：

```bash
docker compose up -d
```

```text
WARN[0000] The "POSTGRES_PASSWORD" variable is not set. Defaulting to a blank string.
[+] Running 2/2
 ✔ Container chat-postgres  Exited (1)
 ✖ Container chat-app       Exited (1)
```

**看日志：**

```bash
docker compose logs postgres
```

```text
Error: Database is uninitialized and superuser password is not specified.
       You must specify POSTGRES_PASSWORD to a non-empty value for the
       superuser.
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `The "POSTGRES_PASSWORD" variable is not set` | **compose 警告：这个变量没设** |
| `Defaulting to a blank string` | 用空字符串代替 |
| `Exited (1)` | 两个容器都退出了 |
| `superuser password is not specified` | 数据库说：你没给密码 |

**为什么：**

`.env` 不进 Git，客户拿到的包里没有它。

**你脑子里知道"要配密码"，客户不知道。**

**怎么修：**

**交付包里必须有 `.env.example`，而且 README 第一段就写"复制它、填值"。**

```markdown
## 起之前

1. 复制配置：
   cp .env.example .env
   cp app.env.example app.env
2. 填 .env 里的 POSTGRES_PASSWORD
```

**更好：写一个 `init.sh`：**

```bash
#!/usr/bin/env bash
set -e
[ -f .env ] || cp .env.example .env
[ -f app.env ] || cp app.env.example app.env
echo "请编辑 .env 和 app.env，填好之后运行 docker compose up -d --build"
```

**这样客户少踩一个坑。**

## 错误 7：`down -v` 把数据库删了

**操作：**

```bash
docker compose down -v
docker compose up -d --build
```

**会怎样：**

```bash
curl localhost:3000/health
```

```json
{"status":"degraded","db":"down","error":"42P01"}
```

**看日志：**

```bash
docker compose logs --tail 20 app
```

```text
error: relation "messages" does not exist
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `42P01` | **PostgreSQL 的错误码：表不存在** |
| `relation "messages" does not exist` | `messages` 这张表没了 |

**为什么：**

`down -v` 删了 `pg-data` 卷。

**新容器第一次启动时，postgres 会初始化一个全新的空数据库，然后执行 `/docker-entrypoint-initdb.d/` 里的脚本（如果挂了）。**

**你的建表语句如果不在初始化脚本里，表就永远不存在了。**

**怎么查：**

```bash
docker volume ls
```

```text
DRIVER    VOLUME NAME
local     chat-stack_pg-data     ← 新卷（空的）
```

**卷名带项目前缀 `chat-stack_`。** 旧的已经删了，找不回来。

**怎么修：**

```text
① 数据没了就是没了。备份是唯一的救法（第 201 节课的 tar）
② 重建表：跑你的迁移脚本
③ 以后别按 -v
```

**⚠️ 这个错误的严重程度：**

```text
本地开发：重跑迁移，5 分钟
生产环境：用户数据永久丢失
```

**习惯：**

```text
想停服务   → docker compose stop
想删容器   → docker compose down
想清空数据 → docker compose down -v   ← 想三秒，并且先备份
```

---

# 第 8 步：写学习笔记（10 分钟）

**打开 `第07节课/02-笔记/NOTES.md` 填。**

**这一节是收口，笔记要有一个"这一周我得到了什么"的总结。**

**重点填三处：**

```text
① 瘦身前后的镜像大小对比（表格）
② 冒烟脚本跑通的输出
③ 我做的一次回滚（版本号怎么改的）
```

---

# 第 9 步：课后练习

## 练习一：把镜像压到 200MB 以下

**要求：**

1. 记录当前大小；
2. 按第 3 步的六条逐条试，每试一条记录大小；
3. 做一张表。

**记录：**

```text
| 改动 | 镜像大小 | 省了多少 |
|---|---|---|
| 初始（node:20 + npm install） | | |
| 换 alpine | | |
| 换 npm ci --omit=dev | | |
| 加 .dockerignore | | |
| 多阶段 | | |
| 清 npm 缓存 | | |
```

**思考：哪一条省得最多？为什么它不是"技巧"而是"必须做的事"？**

## 练习二：做一次完整的回滚

**要求：**

1. 用 `APP_VERSION=5.0` 起全栈，跑 `smoke.sh`；
2. 改 `APP_VERSION=4.0`，`docker compose up -d`（不加 `--build`）；
3. 确认 `docker compose ps` 里 IMAGE 变了；
4. 跑 `smoke.sh`。

**记录：** 每一步的 `ps` 输出。

**思考：如果 `4.0` 那个镜像被你 `docker rmi` 删了，回滚会怎样？**

## 练习三：把冒烟脚本加一条"写数据"

**要求：**

1. 在 `smoke.sh` 里加一条：POST 一条消息，然后 GET 回来，确认内容一致；
2. 故意把 POST 的字段名改错，看脚本会不会失败。

**记录：** 成功和失败两种输出。

**思考：冒烟测试里"写数据"这一条，在生产环境跑会不会有副作用？应该怎么处理？**

## 练习四：写一份交付清单

**要求：** 不看课件，列出"交付给客户一个 Docker 项目"要给的**所有**文件，以及"绝对不能给"的文件。

**记录：** 两张清单。

**思考：客户拿到 `.env.example` 但不知道 `OPENAI_BASE_URL` 该填什么，你会在哪写这个说明？**

## 练习五：用自己的话讲清这一周

**要求：** 不看课件，回答：

```text
① 镜像、容器、卷，三者的生命周期各是多长？
② 为什么容器里连数据库要用服务名？
③ 密钥为什么不进镜像？但它真的"安全"吗？
④ 一条命令起全栈，这条命令背后做了什么？
⑤ 出问题了，你按什么顺序查？
```

**记录：** 五段话，每段不超过三句。

**思考：这五个问题里，哪一个你现在还讲不利索？回去补那一节。**

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清多阶段构建省掉的是什么
- [ ] 我知道为什么镜像里要清 npm 缓存，而且必须在同一个 `RUN` 里
- [ ] 我知道"容器绿"不等于"服务可用"
- [ ] 我知道回滚靠的是版本 tag，不是重新 build
- [ ] 我知道 `down -v` 会删数据

## B. 实操

- [ ] 我的 Dockerfile 是多阶段的（或我能说清为什么不需要）
- [ ] 镜像 < 200MB，我能说出每一层占多少
- [ ] `compose.yaml` 有两个服务，都显示 `(healthy)`
- [ ] `./smoke.sh` 能跑通
- [ ] 我做了一次回滚（改 tag + `up -d`）
- [ ] 我把最终文件抄回了正式项目

## C. 排错

- [ ] `COPY --from` 阶段名错我知道报什么
- [ ] 多阶段忘了拷 `node_modules` 我知道报 `Cannot find module`
- [ ] `unhealthy` 我知道用 `docker inspect .State.Health` 看原因
- [ ] alpine 里没有 `curl`，我知道用 `wget` 或 `node -e`
- [ ] 改了代码没生效，我知道要 `--build`

## D. 交付

- [ ] `compose.yaml` + `Dockerfile` + `.dockerignore` 三件套齐了
- [ ] `.env.example` 和 `app.env.example` 都在，值全空
- [ ] `README.md` 写了"怎么起、怎么停、怎么回滚"
- [ ] `smoke.sh` 可执行（`chmod +x`）
- [ ] 交付包里没有 `.env`、没有 `node_modules`

## E. 笔记

- [ ] 瘦身对比表填了
- [ ] 冒烟输出贴了
- [ ] 回滚步骤写清了
- [ ] 「这一周我得到了什么」写了一段

## 本节课要能说出口的一句话

> **能交付的不是"我这边能跑"，是"别人拿到这几个文件、填两个变量、敲一条命令就能跑，而且跑完有人告诉我它是不是真的好了"。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `COPY --from=xxx: not found` | 阶段名拼错 | `grep FROM Dockerfile` 核对 |
| `Cannot find module 'xxx'`（多阶段后） | 忘了 `COPY --from=builder /app/node_modules` | 补上；`ls /app` 确认 |
| `Cannot find module 'pg'`（`--omit=dev`） | 依赖放进了 `devDependencies` | `npm install pg` |
| `Up (unhealthy)` | 健康检查命令失败 | `docker inspect --format '{{json .State.Health}}'` |
| `ExitCode: 127`（健康检查） | 容器里没有那个命令 | 换 `wget` 或 `node -e` |
| 改了代码 `up -d` 没生效 | 没 `--build` | `up -d --build` |
| 镜像还是很大 | 有 `node_modules` 进了上下文 | 查 `.dockerignore`；`docker history` |
| 镜像比上次大 | 分层只增不减 | 把"删文件"和"装文件"放同一个 `RUN` |
| `variable is not set` | `.env` 没有 | `cp .env.example .env` |
| `up` 之后立刻退出 | 配置错 / 依赖错 | `logs`；`compose config` |
| 回滚后还是新版本 | 加了 `--build`，重新构建了 | 去掉 `--build` |
| 回滚失败 `image not found` | 旧镜像被删了 | 重新 tag；以后别删旧版本 |
| 数据库表不存在 `42P01` | `down -v` 删了数据 | 从备份恢复；重建迁移 |
| `smoke.sh` 报找不到命令 | Windows 没 `chmod` 概念 | `bash smoke.sh` |
| 冒烟通过了但用户说打不开 | 冒烟没覆盖那条路径 | 补一条冒烟；别只看 `/health` |
| 日志时间差 8 小时 | 容器默认 UTC | 加 `TZ: Asia/Shanghai` |
| 端口 80 起不来（服务器） | 1024 以下端口要权限 | 用 Nginx 转发（第 31 周） |
