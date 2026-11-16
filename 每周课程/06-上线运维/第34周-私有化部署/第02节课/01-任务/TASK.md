# 第 233 节课：部署方案与交付边界——画一张图，写清不做什么

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上一节课你拿到了 12 个答案，填完了一张签字的确认单。
> 这一节课把答案变成方案：**一张架构图、一份 `docker-compose.yml`、一份写清"不做什么"的合同附件。**
> 没有这三样东西，你在客户机房就是凭感觉施工。

**建议用时**：120 分钟
**你需要先完成**：第 232 节课（确认单填完）、第 202 节课（用过 `docker-compose.yml` 起两个服务）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

第 29 周你做过这件事：

```text
写一个 docker-compose.yml
起 app + postgres 两个服务
用服务名当主机名互相访问
docker compose up -d 一条命令全起来
```

**这套东西已经能跑。但它只是一份"能跑"的文件，不是"能交付"的方案。**

差别在哪：

| 能跑 | 能交付 |
|---|---|
| 你自己电脑上起来 | 客户机房里起来，且三个月后还在跑 |
| 端口随便映射 | 端口按客户网络策略开，只开必须的 |
| 数据在匿名卷里 | 数据在指定目录，能备份能迁移 |
| 密码写在文件里 | 密码在 `.env`，文件不进版本库 |
| 挂了手动起 | 开机自启、挂了自动重启 |
| 没图 | 有一张客户能看懂的架构图 |
| 没边界 | 合同里写清不做什么 |

**这一节课就是把左边一列换成右边一列。**

## 0.2 你以后会遇到什么

```text
① 客户信息科：你们这套东西是怎么部署的？画个图给我，我要报给领导。
② 客户领导：能不能做双机热备？我们这是核心系统。
③ 现场发现客户给了两台机器，问你要不要做负载均衡。
④ 安全扫描报告出来：数据库端口对全网开放，高危。
⑤ 项目做完，客户说"你们当时说能对接我们的 OA"，你说没说过。
```

**第 ⑤ 条最要命。** 它不是技术问题，是"你没写下来"的问题。

## 0.3 今天要建立的三个概念

```text
① 架构图：不是画给你自己看的，是画给客户领导和客户 IT 看的。它要能回答"数据从哪进、从哪出"。
② 单机 compose：私有化最省事的部署形态。一台机器、一个目录、一份 compose、一条命令。
③ 交付边界：你不做什么，以及做这些的前提是什么。写进合同附件，双方签字。
```

**第三个概念决定你能不能安全地把活干完。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `部署方案.md` | `03-练习代码` | 含架构图、端口表、容量估算 |
| `docker-compose.yml` | `03-练习代码` | 三个服务：nginx / app / postgres |
| `交付边界.md` | `03-练习代码` | 可直接作为合同附件 |

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **只有你的 Windows 电脑。**<br>**⚠️ 这一周的 `/opt/app` 是本机模拟**，不是真客户的机器。<br>**注意：Git Bash 里的 `/opt` 会被映射到 Git 安装目录下面，不是一个真的根分区。所以这一周统一用 `/c/opt/app` 代替 `/opt/app`。** 等你以后真上客户机器，把 `/c` 去掉就是 `/opt/app`。 |
| **用哪个终端** | **Git Bash。** |
| **现在在哪个目录** | <code>mkdir -p /c/opt/app && cd /c/opt/app</code> |
| **本节新建什么** | `/c/opt/app/docker-compose.yml`（单机编排）<br>`架构图.md`（交付边界，含「不做什么」）<br>`交付边界.md` |

## 开工前先跑这一条

确认你没站错地方：

```bash
docker compose version 2>/dev/null || docker-compose version 2>/dev/null || echo "Docker 没启动"
```

**应该看到：**

```text
Docker Compose version v2.29.1
```

**只要有 `version` 字样就行。**

注意：`docker-compose`（带横线）是老版本，`docker compose`（空格）是新版本，两者命令一样。

## 如果不对

**两个都报 `Docker 没启动`** → 打开 Docker Desktop。

**只有 `docker-compose`（老版）** → 也能用，课件里把空格换成横线即可。

---

# 第 1 步：先定三条原则（15 分钟）

## 1.1 原则一：一台机器，不搞集群

**客户问"能不能做高可用"，标准回答：**

```text
可以做，但那是另一个方案、另一个价格。
本次交付是单机部署：一台服务器、一套 compose。
单机故障时，恢复手段是"换机器 + 恢复备份"，恢复时间约 2—4 小时。
如果你需要故障自动切换，我们要另做双机方案。
```

**为什么不主动做集群：**

| 单机 | 集群 |
|---|---|
| 1 台机器 | 至少 3 台 |
| 1 份 compose | K8s 或至少 keepalived + 主从 |
| 备份恢复是主要手段 | 要处理脑裂、数据同步、会话共享 |
| 你能独立交付 | 通常要一个团队 |
| 报价 6—8 万 | 报价 30 万起 |

**你一个人，做单机就是最优解。** 说清楚，客户反而觉得你专业。

**不懂这个会怎样：** 你在合同里含糊答应"高可用"，最后用一台机器交付，验收时被抓住"说好的双机呢"。

## 1.2 原则二：一个目录装下所有东西

**所有东西放 `/opt/app`，不要散在系统各处。**

```text
/opt/app/
├── docker-compose.yml          编排文件
├── .env                        密码等配置（权限 600）
├── nginx/
│   └── default.conf            反向代理配置
├── data/
│   ├── postgres/               数据库文件（挂载进容器）
│   └── uploads/                上传的文件
├── logs/
│   ├── app/                    应用日志
│   └── nginx/                  访问日志
├── backup/
│   └── 20260310/               每日备份
└── scripts/
    ├── install.sh              安装脚本（第 3 节课）
    ├── upgrade.sh              升级脚本（第 6 节课）
    └── rollback.sh             回滚脚本（第 6 节课）
```

**为什么必须集中：**

```text
① 备份只要 tar 一个目录
② 迁移只要拷一个目录
③ 卸载只要删一个目录（客户最喜欢这一条）
④ 出问题你知道去哪找
```

**散着放会怎样：** 数据库在 `/var/lib/docker/volumes/...`，日志在 `/var/log/`，配置在 `/etc/nginx/`，备份脚本在 `/root/`。三个月后你自己都找不齐。

**为什么这里用 `/opt/app`，而第 31 周用的是 `/srv/app`：**

```text
两种都是 Linux 惯例，没有对错：
  /srv    = "这台机器对外提供的服务"（你自己运营时用这个）
  /opt    = "额外装进来的独立软件包"（交付给客户时用这个）

私有化项目用 /opt 更合适，因为：
① 客户机器上 /srv 可能已经有别的系统在用
② /opt/app 对客户的 IT 来说更像"装了一个软件"，而不是"占了一个系统目录"
③ 卸载时告诉客户"删掉 /opt/app 就行"，比解释 /srv 更好懂
```

**⚠️ 但有一条：一个项目里只用一个路径，从头到尾不许换。** 文档里写 `/opt/app`、脚本里写 `/srv/app`，是私有化交付最经典的事故 —— 客户照着文档做，脚本跑到另一个目录，装出一套残废系统。

## 1.3 原则三：镜像不用 `latest`

**`latest` 是标签，不是版本。**

```text
chat-app:latest       ← 三个月后你 pull 到的可能是另一个东西
chat-app:1.2.0        ← 永远是这个
```

**规则：**

```text
生产环境只用明确版本号：postgres:16.3、nginx:1.25.3、chat-app:1.2.0
不用 latest，不用 latest-alpine 这种浮动标签
```

**为什么离线环境更要用版本号：**

```text
离线环境你根本 pull 不到 latest。
如果 compose 里写 latest，docker load 进来的镜像 tag 是 1.2.0，
compose 找不到 latest，直接报 "image not found"。
```

**这条第 3 节课会变成真实报错。**

## 1.4 逐行读：目录结构和权限

**建好目录后执行：**

```bash
ls -la /opt/app
```

**应该看到：**

```text
total 40
drwxr-xr-x 8 root root 4096 Mar 10 09:12 .
drwxr-xr-x 4 root root 4096 Mar 10 09:05 ..
-rw-r--r-- 1 root root  812 Mar 10 09:12 docker-compose.yml
-rw------- 1 root root  356 Mar 10 09:10 .env
drwxr-xr-x 3 root root 4096 Mar 10 09:08 backup
drwxr-xr-x 3 root root 4096 Mar 10 09:08 data
drwxr-xr-x 2 root root 4096 Mar 10 09:08 logs
drwxr-xr-x 2 root root 4096 Mar 10 09:08 nginx
drwxr-xr-x 2 root root 4096 Mar 10 09:08 scripts
```

**逐列读：**

| 列 | 意思 | 你要关注什么 |
|---|---|---|
| `drwxr-xr-x` | 目录，属主可读写执行，其他人只读执行 | 普通目录正常 |
| `-rw-r--r--` | 普通文件，其他人可读 | `docker-compose.yml` 可以这样 |
| `-rw-------` | **只有属主可读写** | `.env` 必须是这个 |
| `root root` | 属主和属组都是 root | 用 root 部署最简单 |
| `4096` | 目录本身占的块大小 | 不代表内容大小 |
| `Mar 10 09:12` | 修改时间 | 排错时看这个 |

**`.env` 是 `-rw-------` 才算对。**

**如果看到 `-rw-r--r--  .env`，说明任何登录用户都能读到数据库密码。**

**修：**

```bash
chmod 600 /opt/app/.env
```

**为什么用 root 部署：**

```text
私有化环境通常只有一个 root 账号。
另建账号要客户配合，而且 Docker 本身就要 root 权限。
先用 root 把东西跑起来，第 5 节课交接时再谈账号。
```

---

# 第 2 步：画一张客户能看懂的架构图（25 分钟）

## 2.1 先说清楚：这张图给谁看

| 看的人 | 他想从图里知道什么 |
|---|---|
| 客户领导 | 数据有没有出我们的网 |
| 客户 IT | 要开哪些端口、占多少资源、装在哪 |
| 你自己 | 三个月后回来还能看懂 |
| 等保测评 | 边界在哪、有没有对外通道 |

**所以图上必须有：**

```text
① 一条明确的"内网边界"线，边界外面写"互联网（不连接）"
② 每个组件的名字和端口
③ 数据存在哪（哪个目录、哪块盘）
④ 谁访问谁（箭头方向）
⑤ 外部依赖（如果有）
```

**图上不能有：**

```text
✗ 真实 IP
✗ 真实密码
✗ 你没实现的东西（画了将来要被问）
```

## 2.2 最小架构图（先画这个）

```text
┌────────────────────────── 客户内网（无互联网出口） ──────────────────────────┐
│                                                                             │
│   ┌──────────────┐                                                          │
│   │ 内网用户 PC   │  浏览器访问 http://10.20.30.40                           │
│   │ 40 台         │                                                          │
│   └───────┬──────┘                                                          │
│           │ 80                                                              │
│           ▼                                                                 │
│   ┌──────────────────────────── 服务器 10.20.30.40 ─────────────────────┐    │
│   │                                                                     │    │
│   │   ┌──────────────────┐        ┌──────────────────────────┐          │    │
│   │   │ nginx 容器        │ 3000   │ app 容器                  │          │    │
│   │   │ 端口 80           │───────▶│ Node.js 应用              │          │    │
│   │   │ 静态文件 + 反向代理│        │ 端口 3000（不对外）        │          │    │
│   │   └──────────────────┘        └───────────┬──────────────┘          │    │
│   │                                           │ 5432                     │    │
│   │                                           ▼                          │    │
│   │                               ┌──────────────────────────┐           │    │
│   │                               │ postgres 容器             │           │    │
│   │                               │ 端口 5432（不对外）        │           │    │
│   │                               └───────────┬──────────────┘           │    │
│   │                                           │                          │    │
│   │   ┌───────────────────────────────────────▼──────────────────────┐   │    │
│   │   │ 宿主目录 /opt/app/data                                        │   │    │
│   │   │   postgres/   数据库文件                                      │   │    │
│   │   │   uploads/    用户上传的文件                                   │   │    │
│   │   └──────────────────────────────────────────────────────────────┘   │    │
│   │                                                                     │    │
│   │   备份：每天 02:00 → /opt/app/backup/YYYYMMDD/（保留 30 天）          │    │
│   └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────── 互联网 ────────────────────────┐
│  不连接。本系统不访问任何外部地址。                      │
│  （第 235 节课换成 Ollama 后，模型也在本机）             │
└────────────────────────────────────────────────────────┘
```

**这张图回答了三个问题：**

```text
① 用户从哪访问：内网 PC，80 端口
② 数据存在哪：/opt/app/data
③ 有没有出口：没有
```

## 2.3 加一个组件之前先问三个问题

**客户说"能不能接我们的统一登录（LDAP）"：**

| 问题 | 如果答案是…… |
|---|---|
| 这个组件装在哪？ | 客户已有的域控 → 要开 389 端口到域控 |
| 方向是谁连谁？ | 应用连域控（出） → 防火墙要放行 |
| 它挂了系统还能用吗？ | 不能 → 它变成关键依赖，方案要写进去 |

**图上每加一个箭头，合同里就要多一行。**

**这一句话请记住：**

```text
架构图不是装饰，它是"你要负责的范围"的可视化。画上去的，你都要负责。
```

## 2.4 带本地模型的架构图（第 235 节课会用）

```text
                      内网用户
                         │ 80
                         ▼
                  ┌─────────────┐
                  │   nginx     │
                  └──────┬──────┘
                         │ 3000
                         ▼
                  ┌─────────────┐       11434        ┌──────────────┐
                  │   app       │───────────────────▶│  ollama      │
                  │             │ http://ollama:11434 │  7B 模型     │
                  └──────┬──────┘                     └──────┬───────┘
                         │ 5432                              │
                         ▼                                   ▼
                  ┌─────────────┐                     /opt/app/data/
                  │  postgres   │                     ollama/models/
                  └─────────────┘
```

**注意箭头方向：`app` 连 `ollama`，不是反过来。**

**而且 `ollama` 的端口不映射到宿主机。** 只有 compose 内部网络能访问。

## 2.5 逐行读：架构图里的五个关键点

| 图上元素 | 为什么这么画 | 画错会怎样 |
|---|---|---|
| `nginx` 在 80，`app` 在 3000 | 只暴露一个入口，app 不直接对外 | 直接暴露 3000，安全扫描会报"应用端口对全网开放" |
| 数据库 5432 "不对外" | 数据库只能被 app 访问 | 映射出去，等于把库交出去 |
| `data/` 在宿主目录 | 容器删了数据还在 | 用匿名卷，`docker compose down -v` 数据全没 |
| 边界线写"无互联网出口" | 客户领导最关心这一句 | 不写，客户会一直问"数据会不会传出去" |
| 备份路径写在图上 | 运维的人知道去哪找 | 不写，出事时找不到备份 |

**这五个点，每一个都能单独变成一个事故。**

## 2.6 给客户的"一页纸"

**领导不看技术细节。给他这一页：**

```text
一、部署形态
   单台服务器，Docker 容器化部署。全部组件运行在客户机房内。

二、数据流向
   用户浏览器 → 内网服务器。数据不经过互联网，不上传任何第三方。

三、资源占用
   CPU 4 核 / 内存 8G / 磁盘 200G（含 30 天备份）

四、对外端口
   仅 80（或客户指定的端口）。数据库、应用内部端口不对外开放。

五、备份
   每日自动备份数据库，保留 30 天，存放于 /opt/app/backup。

六、故障恢复
   单机故障时，在新机器上重装并恢复备份，预计 2—4 小时。

七、不包含
   高可用/双机热备、异地容灾、7×24 值守。
```

**这一页纸能挡掉 80% 的"你们这个靠不靠谱"的问题。**

---

# 第 3 步：写 docker-compose.yml（30 分钟）

## 3.1 先看完整文件

**文件：`/opt/app/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16.3
    container_name: chatapp-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      TZ: Asia/Shanghai
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
    mem_limit: 2g

  app:
    image: chat-app:1.2.0
    container_name: chatapp-app
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      TZ: Asia/Shanghai
    volumes:
      - ./data/uploads:/app/uploads
      - ./logs/app:/app/logs
    networks:
      - backend
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
    mem_limit: 2g

  nginx:
    image: nginx:1.25.3
    container_name: chatapp-nginx
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./logs/nginx:/var/log/nginx
    networks:
      - backend
    depends_on:
      - app
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

networks:
  backend:
    driver: bridge
```

**先别看细节。只看一件事：**

```text
数据库和应用都没有 ports。只有 nginx 有 "80:80"。
```

**这一句就是整套方案的安全底线。**

## 3.2 逐段读：为什么这样写

| 配置 | 作用 | 不写会怎样 |
|---|---|---|
| `restart: unless-stopped` | 容器挂了自动重启，服务器重启后自动起来 | 机器重启一次，网站挂到客户打电话 |
| `image: postgres:16.3` | 锁定版本 | 用 latest，离线环境找不到镜像 |
| `volumes: ./data/postgres:...` | 数据存在宿主目录 | 用匿名卷，容器删了数据没 |
| `networks: backend` | 三个容器在同一内部网络，用服务名互访 | 用默认网络也能跑，但容易和别的东西混 |
| 没有 `ports` 的 db/app | 不对外暴露 | 映射出去，等于把数据库交给内网所有人 |
| `depends_on ... service_healthy` | 等数据库真正能连了再起 app | app 先起，连不上库，报错重启循环 |
| `healthcheck` | 让 Docker 知道服务"活没活" | 只看进程在不在，进程在但不响应也算"活" |
| `logging max-size` | 日志轮转，防止写满磁盘 | 三个月后磁盘满，整台机器挂 |
| `env_file: .env` | 密码从文件读，不写在 compose 里 | 密码进版本库，等于公开 |
| `mem_limit: 2g` | 限制容器内存 | 一个容器吃光内存，整机 OOM |

**十行配置，十种事故。**

## 3.3 为什么 nginx 也要放进 compose

**你可能会想：直接在宿主机 `apt install nginx` 不是更简单？**

| 方案 | 优点 | 缺点 |
|---|---|---|
| 宿主机装 nginx | 性能略好，配置在 `/etc/nginx` | 多一个系统依赖，离线环境要装包 |
| nginx 进 compose | 一条命令全起，配置在项目目录里 | 多一层容器 |

**离线环境选后者。** 理由：

```text
① 不用在客户机器上装任何系统包（离线装包很麻烦）
② 配置跟着项目走，迁移时一起拷
③ 版本固定，不受客户系统影响
④ 卸载干净，删目录就没了
```

**第 3 节课你会看到：离线环境少装一个系统包，就少一个坑。**

## 3.4 `.env` 长什么样

**文件：`/opt/app/.env`（权限 600）**

```bash
DB_NAME=chatapp
DB_USER=chatapp
DB_PASSWORD=换成客户现场的强密码
SESSION_SECRET=换成 32 位随机串
ADMIN_EMAIL=admin@customer.local
LOG_LEVEL=info
```

**生成强密码（在你能用的任何 Linux 上）：**

```bash
openssl rand -base64 24
```

**应该看到（每次不同）：**

```text
k7Qm2XvT9pLzR4sN8wYcB6dF
```

**逐字读：**

| 部分 | 意思 |
|---|---|
| `openssl rand` | 用 OpenSSL 生成随机字节 |
| `-base64` | 输出成可打印字符（避免特殊符号进 shell 出问题） |
| `24` | 24 字节，编码后约 32 个字符 |

**如果客户机器上没有 `openssl`（内网精简系统常见）：**

```bash
head -c 24 /dev/urandom | base64
```

**应该看到类似：**

```text
5Jk8sQ2mZ7pX1vN4tR9wL3cB
```

**`/dev/urandom` 是 Linux 的随机数设备，任何 Linux 都有。**

## 3.5 验证 compose 文件

**在 `/opt/app` 下执行：**

```bash
docker compose config
```

**应该看到（内容被展开，密码显示为实际值）：**

```yaml
name: app
services:
  app:
    container_name: chatapp-app
    depends_on:
      postgres:
        condition: service_healthy
        required: true
    environment:
      DATABASE_URL: postgres://chatapp:实际密码@postgres:5432/chatapp
      NODE_ENV: production
      PORT: "3000"
      TZ: Asia/Shanghai
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))
      timeout: 5s
      interval: 30s
      retries: 3
      start_period: 20s
    image: chat-app:1.2.0
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `name: app` | compose 项目名，默认取目录名 |
| `DATABASE_URL` 里密码被替换成真实值 | 说明 `.env` 读到了 |
| `PORT: "3000"` | 数字被加引号，这是正常的 |
| `depends_on ... condition: service_healthy` | 语法被正确解析 |
| `test:` 变成数组 | YAML 的 `[]` 写法被展开 |

**`docker compose config` 是最便宜的检查。**

**为什么先跑它：**

```text
它只解析文件，不起容器。
缩进错一个空格，它会直接告诉你哪一行错了，而不是等你 up 到一半失败。
```

**报错示例（缩进错）：**

```text
yaml: line 12: did not find expected key
```

**看到这个，去第 12 行看缩进。** YAML 只用空格，不许用 Tab。

## 3.6 启动并验证

```bash
docker compose up -d
```

**应该看到：**

```text
[+] Running 4/4
 ✔ Network app_backend       Created    0.1s
 ✔ Container chatapp-db      Healthy   12.3s
 ✔ Container chatapp-app     Started    2.1s
 ✔ Container chatapp-nginx   Started    0.8s
```

**逐行读：**

| 行 | 意思 | 正常耗时 |
|---|---|---|
| `Network app_backend Created` | 建了内部网络 | 瞬间 |
| `Container chatapp-db Healthy` | 数据库起来了，健康检查通过 | 10—20 秒 |
| `Container chatapp-app Started` | 应用起来了 | 1—3 秒 |
| `Container chatapp-nginx Started` | nginx 起来了 | 1 秒内 |

**注意 `Healthy` 这个词。** 它说明 `pg_isready` 成功了，不是"进程起来了"。

**验证：**

```bash
docker compose ps
```

**应该看到：**

```text
NAME             IMAGE                COMMAND                  SERVICE    CREATED         STATUS                   PORTS
chatapp-app      chat-app:1.2.0       "docker-entrypoint.s…"   app        2 minutes ago   Up 2 minutes (healthy)   3000/tcp
chatapp-db       postgres:16.3        "docker-entrypoint.s…"   postgres   2 minutes ago   Up 2 minutes (healthy)   5432/tcp
chatapp-nginx    nginx:1.25.3         "/docker-entrypoint.…"   nginx      2 minutes ago   Up 2 minutes             0.0.0.0:80->80/tcp
```

**逐列读：**

| 列 | 关键看什么 |
|---|---|
| `STATUS` | `(healthy)` 才算真起来 |
| `PORTS` | **只有 nginx 有 `0.0.0.0:80->80`**，其他是 `3000/tcp` 不带映射 |
| `IMAGE` | 是不是你要的版本号 |

**`3000/tcp` 和 `0.0.0.0:3000->3000/tcp` 的区别，就是"内网隔离"和"全网开放"的区别。**

---

# 第 4 步：端口与网络规划（20 分钟）

## 4.1 端口表：这份表要发给客户 IT

| 端口 | 谁监听 | 对谁开放 | 用途 | 能不能不开 |
|---|---|---|---|---|
| 22 | sshd | 客户 IT 跳板机 | 运维登录 | 不能（否则你进不去） |
| 80 | nginx | 内网用户网段 | HTTP | 不能 |
| 443 | nginx | 内网用户网段 | HTTPS（可选） | 内网可以用 80 |
| 3000 | app | 仅本机 compose 网络 | 应用 | **不对外，必须** |
| 5432 | postgres | 仅本机 compose 网络 | 数据库 | **不对外，必须** |
| 11434 | ollama（可选） | 仅本机 compose 网络 | 模型 API | **不对外，必须** |

**发给客户 IT 时，只写前三行。** 后三行是"你内部的事"，客户不需要开。

**如果客户安全部门问"有没有其他端口"，答：**

```text
容器内部端口不占用宿主机端口，不对网络可见。
宿主机上监听的只有 22 和 80。
```

## 4.2 验证：宿主机到底开了哪些端口

```bash
ss -lntp
```

**应该看到：**

```text
State   Recv-Q  Send-Q  Local Address:Port   Peer Address:Port  Process
LISTEN  0       128           0.0.0.0:22          0.0.0.0:*      users:(("sshd",pid=1121,fd=3))
LISTEN  0       4096          0.0.0.0:80          0.0.0.0:*      users:(("docker-proxy",pid=8842,fd=4))
LISTEN  0       128              [::]:22             [::]:*      users:(("sshd",pid=1121,fd=6))
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `0.0.0.0:22` | SSH，所有网卡 |
| `0.0.0.0:80` + `docker-proxy` | **说明是 Docker 映射的端口**，不是宿主机 nginx |
| `[::]:22` | IPv6 的 SSH |

**关键：只有 22 和 80。没有 3000，没有 5432。**

**如果看到 `0.0.0.0:5432`，说明你端口映射写错了，立刻改：**

```yaml
# 错
ports:
  - "5432:5432"

# 对：不写 ports，只留在内部网络
```

## 4.3 为什么数据库绝对不能映射

**真实案例的因果链：**

```text
你把 5432 映射出去
  → 内网任何人能连
  → 有人用弱密码字典跑一遍
  → 数据库被加密，勒索
  → 客户说：你们交付的东西有漏洞
```

**即使内网也一样。** 内网不等于可信网络，勒索病毒在内网传播是常态。

**如果客户 IT 说"我们要用客户端连数据库查数据"：**

```text
不建议直接开放 5432。
可以提供两种方式：
① 我们做一个只读查询页面；
② 用 SSH 隧道：ssh -L 5432:127.0.0.1:5432 用户@服务器
```

**SSH 隧道的意思是：**

```text
把远程的 5432 通过 SSH 通道映射到你本地。
这样端口不对外开，但你能连。走的是 22 端口。
```

## 4.4 网络隔离的写法

**compose 里定义 `backend` 网络，三个服务都加入。**

**为什么不用 default：**

```text
默认网络的名字是 <项目名>_default。
如果这台机器上还有别的 compose 项目，网络名字不同，不会冲突。
但如果你用 host 网络模式，就会和宿主机端口抢。
用自定义 bridge 网络，隔离最干净。
```

**验证网络：**

```bash
docker network ls
```

**应该看到：**

```text
NETWORK ID     NAME           DRIVER    SCOPE
a1b2c3d4e5f6   app_backend    bridge    local
f6e5d4c3b2a1   bridge         bridge    local
c9d8e7f6a5b4   host           host      local
b3a2c1d0e9f8   none           null      local
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `app_backend` | 你的 compose 建的，三个容器在这里 |
| `bridge` | Docker 默认网络，不用的容器在这里 |
| `host` | 容器直接用宿主机网络，**不要用** |
| `none` | 无网络 |

**`host` 模式为什么不用的：**

```text
用 host 模式，容器里的 5432 就直接是宿主机的 5432，
等于把数据库端口开出去了。你以为没映射，其实开了。
```

---

# 第 5 步：容量与资源限制（15 分钟）

## 5.1 40 个用户的估算

| 资源 | 估算方法 | 结果 |
|---|---|---|
| CPU | 40 用户，峰值 10% 同时用 = 4 并发，每次请求 50ms | 1 核够，留 4 核 |
| 内存 | app 512M + postgres 1G + nginx 50M + 系统 1G | 约 3G，留 8G |
| 磁盘 | 镜像 5G + 数据 10G/年 + 备份 30 份 | 200G |
| 带宽 | 内网千兆，不是瓶颈 | 忽略 |

**为什么都留这么多余量：**

```text
私有化环境你不在现场，扩容要客户配合。
宁可多留，不要算得太紧。
```

## 5.2 资源限制怎么配

**compose v2 支持 `mem_limit` 和 `cpus`：**

```yaml
  postgres:
    mem_limit: 2g
    cpus: 2.0

  app:
    mem_limit: 2g
    cpus: 2.0
```

**注意版本差异：**

```text
docker compose v2（现在的版本）支持 mem_limit / cpus
老的 docker-compose v1 用 deploy.resources.limits
用之前先 docker compose version 看一眼
```

**验证版本：**

```bash
docker compose version
```

**应该看到：**

```text
Docker Compose version v2.24.6
```

**如果是 `v1.29.2`，那是老的 Python 版，很多新语法不支持。**

**私有化环境建议统一用 v2，第 3 节课会把二进制直接带进去。**

## 5.3 看实际资源占用

```bash
docker stats --no-stream
```

**应该看到：**

```text
CONTAINER ID   NAME             CPU %   MEM USAGE / LIMIT   MEM %   NET I/O         BLOCK I/O     PIDS
3f2a1b9c8d7e   chatapp-app      0.42%   118.2MiB / 2GiB     5.77%   1.2MB / 860kB   0B / 4.1MB   11
8e7d6c5b4a3f   chatapp-db       0.11%   42.6MiB / 2GiB      2.08%   860kB / 1.2MB   12MB / 0B    9
1a2b3c4d5e6f   chatapp-nginx    0.00%   8.4MiB / 64MiB      13.1%   1.3MB / 1.1MB   0B / 0B      3
```

**逐列读：**

| 列 | 意思 | 什么时候要警惕 |
|---|---|---|
| `CPU %` | 当前占用 | 持续 > 80% 要扩 |
| `MEM USAGE / LIMIT` | 用了多少 / 上限 | 接近上限会被 OOM kill |
| `MEM %` | 百分比 | 同上 |
| `NET I/O` | 网络收发 | 异常大可能是攻击或死循环 |
| `BLOCK I/O` | 磁盘读写 | 数据库写入多正常 |
| `PIDS` | 进程数 | 一直涨可能是进程泄漏 |

**`--no-stream` 是什么：**

```text
不加这个参数，docker stats 会一直刷新，要按 Ctrl+C 才停。
加了只输出一次，适合截图给客户看。
```

## 5.4 磁盘水位要能看见

```bash
df -h /opt/app
```

**应该看到：**

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vdb1       400G   38G  342G  10% /opt/app
```

**判断标准：**

| 使用率 | 动作 |
|---|---|
| < 70% | 正常 |
| 70—85% | 清理旧备份、旧镜像 |
| > 85% | 立即处理，否则数据库可能写不进去 |
| > 95% | 数据库可能已经只读或崩溃 |

**为什么单独看 `/opt/app`：**

```text
如果 /opt/app 在根分区上，数据库写满会连带系统服务一起挂。
所以第 1 节课才要求有独立数据盘。
```

---

# 第 6 步：把"不做什么"写成合同附件（25 分钟）

## 6.1 五条不承诺

**这五条，写在方案的最后一页，也写在合同附件里。**

| 序号 | 不承诺 | 为什么 | 客户会怎么争 |
|---|---|---|---|
| 1 | 不承诺 7×24 小时响应 | 你一个人，做不到就是撒谎 | "别的公司都能" |
| 2 | 不承诺跨版本兼容 | 你只保证升级路径走得通，不保证任意跳版本 | "我直接从 1.0 升到 3.0 不行吗" |
| 3 | 不含硬件 | 硬件是另一个供应链 | "你们一起报了省事" |
| 4 | 不承诺模型效果与公网一致 | 7B 和千亿参数不是一个量级 | "演示的时候不是挺好" |
| 5 | 不承诺等保测评通过 | 测评是第三方做的，你只能提供材料 | "你们不是专业的吗" |

**每一句"不承诺"，后面都要跟一句"但我们提供什么"。**

**只写"不"，客户会觉得你在推责任。写"不 + 替代方案"，是专业。**

## 6.2 合同附件全文（可直接改）

```markdown
# 附件二：交付范围与责任边界

## 一、交付范围

1. 在甲方提供的 1 台服务器上完成系统部署，系统可通过内网访问。
2. 交付容器镜像、docker-compose.yml、.env 模板、Nginx 配置。
3. 交付《安装手册》《运维手册》《验收单》《培训要点》四份文档。
4. 提供 1 次不少于 2 小时的现场或远程培训。
5. 提供首年远程技术支持（工作日 9:00—18:00）。

## 二、不在交付范围

1. 服务器、存储、网络设备等硬件采购与上架。
2. 操作系统安装、网络策略配置、防火墙策略开通。
3. 等保测评、整改施工、安全设备部署。
4. 历史数据清洗、格式转换、去重。
5. 与甲方其他系统（OA、ERP、统一登录）的对接开发。
6. 新增功能开发、界面定制。
7. 高可用、双机热备、异地容灾、负载均衡。
8. 7×24 小时值守与驻场。
9. 模型输出质量达到公网大模型水平。

## 三、甲方需提供

1. 符合《需求确认单》配置的服务器 1 台，已安装指定操作系统。
2. 可用的 IP 地址、端口开通（22、80）。
3. 数据库账号（若使用甲方现有数据库）。
4. 现场实施期间的配合人员 1 名。
5. 数据导入所需的原始数据及导入窗口。

## 四、响应时间

| 级别 | 定义 | 响应时间 |
|---|---|---|
| 紧急 | 系统完全不可用 | 4 小时内（工作日） |
| 一般 | 部分功能异常 | 1 个工作日内 |
| 咨询 | 使用问题 | 2 个工作日内 |

因甲方网络限制导致无法远程接入时，响应时间按甲方配合人员可用时间计算。

## 五、验收

1. 验收依据为《验收单》所列功能项，逐条勾选。
2. 系统上线后 15 个工作日内，甲方应组织验收。
3. 逾期未组织验收且未提出书面异议的，视为验收通过。

## 六、变更

任何超出本附件第一条范围的需求，均按变更单处理，单独评估工期与费用。

甲方（盖章）：____________    乙方（盖章）：____________
日期：____________            日期：____________
```

**这份附件有六条。** 你只需要改客户名、机器数量、响应时间。

## 6.3 责任矩阵：一张表说清谁干什么

| 事项 | 甲方 | 乙方 |
|---|---|---|
| 服务器采购 | ✅ | ❌ |
| 操作系统安装 | ✅ | ❌ |
| 网络与端口开通 | ✅ | ❌ |
| Docker 环境安装 | ❌ | ✅ |
| 应用部署 | ❌ | ✅ |
| 数据导入 | 提供数据 | 执行导入 |
| 日常重启 | ✅ | 提供手册 |
| 备份 | ✅（按手册） | 提供脚本 |
| 版本升级 | 审批 | 执行 |
| 故障排查 | 配合 | ✅ |
| 等保测评 | ✅ | 提供材料 |

**这张表打印出来，贴在机房。** 出事时指着表说话。

## 6.4 逐行读：为什么"验收逾期视为通过"这条必须有

| 条款 | 表面意思 | 实际作用 |
|---|---|---|
| 15 个工作日内组织验收 | 给客户一个期限 | 防止无限期拖 |
| 逾期未组织且无书面异议 | 客户没动作 | 排除"我们还在内部走流程" |
| 视为验收通过 | 自动成立 | 你才能收尾款 |

**没有这一条会怎样：**

```text
系统跑了半年，客户一直说"还在走流程"。
你的尾款 50% 拿不到，因为合同里没有"什么时候算验收完成"。
```

**这一条不是防客户，是防"流程"。**

---

# 第 7 步：把方案写成文档（20 分钟）

## 7.1 方案文档的六个部分

| 部分 | 内容 | 给谁看 |
|---|---|---|
| 1. 项目概述 | 客户、目标、范围 | 领导 |
| 2. 部署架构 | 架构图 + 组件说明 | 客户 IT |
| 3. 资源需求 | 服务器配置、端口、磁盘 | 客户 IT |
| 4. 实施计划 | 分几天、每天做什么 | 项目经理 |
| 5. 交付边界 | 不做什么 | 商务、领导 |
| 6. 验收标准 | 怎么算完成 | 双方 |

**顺序不能反。** 先讲"要解决什么问题"，再讲"怎么解决"。

## 7.2 实施计划怎么写

```text
D1    现场勘察，确认机器、网络、端口、系统版本
D2—D3 离线包制作（在你自己公司做，需要联网）
D4    进场，装 Docker 环境，导入镜像
D5    起服务，配置 nginx，本地验证
D6    数据导入，功能验证
D7    客户试用，收集问题
D8—D9 修问题，补文档
D10   培训 2 小时，签验收单
```

**为什么把"离线包制作"单独列出来：**

```text
这一步不在客户现场做，但它是关键路径。
客户看不到，但你要让客户知道"这两天我在为你准备"。
```

## 7.3 方案文档模板骨架

```markdown
# 某医院 智能文档问答系统 私有化部署方案

版本：v1.0
日期：2026-XX-XX
编制：XXX

## 一、项目概述
### 1.1 建设目标
### 1.2 建设内容
### 1.3 术语说明

## 二、部署架构
### 2.1 总体架构（图）
### 2.2 组件说明（表）
### 2.3 数据流向
### 2.4 网络边界

## 三、资源需求
### 3.1 服务器配置
### 3.2 端口清单
### 3.3 存储规划

## 四、实施计划
### 4.1 时间安排
### 4.2 双方分工
### 4.3 前置条件

## 五、交付边界
### 5.1 交付内容
### 5.2 不包含内容
### 5.3 响应时间

## 六、验收
### 6.1 验收标准
### 6.2 验收流程
```

**这份骨架给客户看，客户会觉得"这家公司做事有条理"。**

**文档能力本身就是私有化项目的竞争力。** 技术差不多的时候，客户选文档好的那家。

## 7.4 方案要跟着确认单走

**逐条对应检查：**

| 确认单上的答案 | 方案里的对应位置 | 有没有写 |
|---|---|---|
| 不能上网 | 3.1 离线安装说明 | |
| aarch64 | 3.1 镜像架构 linux/arm64 | |
| 麒麟 V10 | 3.1 操作系统适配说明 | |
| 80 被占用 | 3.2 复用现有 nginx 或改用 8080 | |
| 达梦 | 2.2 数据库适配说明 | |
| 等保二级 | 5.2 不含测评，提供材料 | |
| 不能远程 | 5.3 响应时间按客户配合时间算 | |
| 4 : 5 : 1 付款 | 合同正文 | |

**这张表填不满，说明你的方案漏了东西。**

---

# 第 8 步：故意犯 6 个错（35 分钟）

## 错误 1：把数据库端口映射出去

**操作：**

为了让客户 IT"方便连数据库看看"，你加了这一行：

```yaml
  postgres:
    ports:
      - "5432:5432"
```

**会怎样：**

```text
$ ss -lntp
LISTEN  0  4096  0.0.0.0:5432  0.0.0.0:*  users:(("docker-proxy",pid=9102,fd=4))
```

**安全扫描报告里会出现：**

```text
【高危】PostgreSQL 数据库服务暴露
主机：10.20.30.40
端口：5432
建议：关闭对外访问，或限制源 IP
```

**为什么：**

```text
"5432:5432" 的含义是"宿主机的 0.0.0.0:5432 转发到容器的 5432"。
0.0.0.0 表示所有网卡，内网任何人扫一下就能连。
```

**怎么修：**

```yaml
  postgres:
    # 删掉 ports 整段
```

**如果确实要临时连一下：**

```bash
# 在客户 IT 的电脑上（不是服务器上）
ssh -L 15432:127.0.0.1:5432 root@10.20.30.40
```

**然后本地连 `127.0.0.1:15432`。**

**为什么这样安全：**

```text
SSH 隧道只在 SSH 会话存活期间有效，走的是 22 端口。
会话一断，通道就没了，不会在服务器上留下监听端口。
```

## 错误 2：compose 里写 `latest`，离线环境起不来

**操作：**

```yaml
  app:
    image: chat-app:latest
```

**会怎样：**

```text
$ docker compose up -d
[+] Running 1/1
 ✔ Container chatapp-app  Error
Error response from daemon: No such image: chat-app:latest
```

**或者（如果 Docker 尝试去拉）：**

```text
Error response from daemon: pull access denied for chat-app,
repository does not exist or may require 'docker login'
```

**为什么：**

```text
docker load 导入的镜像 tag 是 chat-app:1.2.0。
compose 要找的是 chat-app:latest，两个 tag 对不上。
Docker 找不到本地镜像，就去仓库拉；离线环境没有仓库，所以失败。
```

**怎么修：**

```bash
# 先看本地到底有什么 tag
docker images | grep chat-app
```

**应该看到：**

```text
chat-app   1.2.0   3f2a1b9c8d7e   2 days ago   182MB
```

**然后改 compose：**

```yaml
    image: chat-app:1.2.0
```

**或者给镜像补一个 tag：**

```bash
docker tag chat-app:1.2.0 chat-app:latest
```

**但补 tag 是治标。** 治本是**永远不用 latest**。

## 错误 3：数据用匿名卷，`down -v` 之后全没了

**操作：**

```yaml
  postgres:
    volumes:
      - /var/lib/postgresql/data
```

**会怎样：**

```text
$ docker compose down -v
[+] Running 4/4
 ✔ Container chatapp-nginx  Removed
 ✔ Container chatapp-app    Removed
 ✔ Container chatapp-db     Removed
 ✔ Volume app_pgdata        Removed
```

**下次起来：**

```text
$ docker compose up -d
$ docker compose exec postgres psql -U chatapp -d chatapp -c "\dt"
Did not find any relations.
```

**为什么：**

```text
只写容器内路径（不带冒号前的主机路径），Docker 会建一个匿名卷。
docker compose down -v 里的 -v 就是"连卷一起删"。
数据在卷里，卷被删了，数据就没了。
```

**怎么修：**

```yaml
  postgres:
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
```

**改完要验证：**

```bash
docker compose exec postgres psql -U chatapp -d chatapp -c "SELECT count(*) FROM messages;"
```

**应该看到：**

```text
 count
-------
  1284
(1 row)
```

**然后：**

```bash
docker compose down
docker compose up -d
docker compose exec postgres psql -U chatapp -d chatapp -c "SELECT count(*) FROM messages;"
```

**数字还是 1284，才算真的安全。**

**⚠️ 注意：** 换成 bind mount 之前，旧数据还在匿名卷里。要先导出来，否则改完配置数据"看起来丢了"。

## 错误 4：没写 `restart`，服务器重启后服务没起来

**操作：**

compose 里没写 `restart`，手工 `docker compose up -d` 起好了，验收通过。

**会怎样：**

两周后客户打电话：

```text
客户：系统打不开了。
你：重启过服务器吗？
客户：上周机房断电，重启了一次。
你：……容器没设自启。
```

**你登上去看：**

```text
$ docker compose ps
NAME                IMAGE               STATUS
```

**空的。一个容器都没有。**

**为什么：**

```text
Docker 默认 restart=no。
宿主机重启后，Docker 服务会起来，但不会自动启动容器。
```

**怎么修：**

```yaml
services:
  app:
    restart: unless-stopped
```

**三个值的区别：**

| 值 | 容器异常退出 | 宿主机重启 | 手动 stop 后 |
|---|---|---|---|
| `no` | 不重启 | 不启动 | 不启动 |
| `always` | 重启 | 启动 | **仍然启动** |
| `unless-stopped` | 重启 | 启动 | 不启动 |

**用 `unless-stopped`。** 因为你要"手动停掉做维护"时，它不该自己又爬起来。

**验证：**

```bash
sudo reboot
```

**等两分钟重连：**

```bash
docker compose ps
```

**应该看到三个都是 `Up`。**

## 错误 5：合同里答应"高可用"，交付的是单机

**操作：**

客户问"能不能双机热备"，你说"可以的，我们会做高可用"。

**会怎样：**

验收时客户 IT 问：

```text
客户：主备切换怎么测？我把主库停了，备库多久接管？
你：这个……本期是单机部署。
客户：合同里写了高可用。
```

**为什么：**

```text
"高可用"在客户理解里 = 一台挂了另一台自动接管。
在技术上它意味着：至少两台应用、数据库主从、VIP 漂移或负载均衡。
这是 3 倍的工作量，不是配置项。
```

**怎么修：**

**当场把话说清楚（在第 1 次会上就说）：**

```text
本期是单机部署。单机故障的恢复方式是"换机器 + 恢复备份"，2—4 小时。
如果你需要自动切换，我们另做双机方案，工期和费用单独评估。
```

**已经说错了怎么办：**

```text
立刻出变更单：双机方案增加 X 万、Y 周。
不要试图用"我尽量"糊过去，验收时一定会被问。
```

## 错误 6：密码写进 compose，还提交到了 Git

**操作：**

```yaml
  postgres:
    environment:
      POSTGRES_PASSWORD: MyPass123456
```

**然后：**

```bash
git add docker-compose.yml
git commit -m "部署配置"
git push
```

**会怎样：**

```text
三个月后你发现仓库是公开的（或者客户要求你交源码）。
这个密码同时是客户生产库的密码。
```

**为什么危险：**

```text
Git 历史里的东西删不掉。你后面再改成 ${DB_PASSWORD}，
历史提交里那个明文密码还在，git log -p 就能看到。
```

**怎么修：**

```yaml
  postgres:
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
```

**加 `.gitignore`：**

```text
.env
data/
logs/
backup/
```

**验证密码没进版本库：**

```bash
git log -p --all -- docker-compose.yml | grep -i password
```

**应该看到只有：**

```text
+      POSTGRES_PASSWORD: ${DB_PASSWORD}
```

**如果看到了明文密码，去客户现场改密码，然后强制轮换。**

**已经泄露的处理顺序：**

```text
① 改密码（先做这个，最紧急）
② 改 .env
③ 重启服务验证
④ 如果仓库是公开的，联系平台删除，但仍视为已泄露
```

---

# 第 9 步：写学习笔记（10 分钟）

**把下面这份模板复制到 `02-笔记/NOTES.md`，然后填。**

````markdown
# 第 233 节课学习笔记

## 一、我的架构图（用字符画一遍）

```text

```

## 二、三个容器各自负责什么

| 容器 | 端口 | 对外吗 | 负责什么 |
|---|---|---|---|
| nginx | | | |
| app | | | |
| postgres | | | |

## 三、为什么数据库不能写 ports

## 四、`restart` 三个值的区别

| 值 | 异常退出 | 宿主机重启 | 手动 stop 后 |
|---|---|---|---|
| no | | | |
| always | | | |
| unless-stopped | | | |

## 五、我的端口表

| 端口 | 用途 | 对谁开放 |
|---|---|---|
| | | |

## 六、容量估算

| 资源 | 我的估算 | 依据 |
|---|---|---|
| CPU | | |
| 内存 | | |
| 磁盘 | | |

## 七、五条不承诺

1.
2.
3.
4.
5.

## 八、六个错误的后果

| 错误 | 现象 | 怎么避免 |
|---|---|---|
| 映射 5432 | | |
| 用 latest | | |
| 匿名卷 | | |
| 没写 restart | | |
| 承诺高可用 | | |
| 密码进仓库 | | |

## 九、我还不懂的词

-

## 十、完成检查

- [ ] 我画完了一张能看懂的架构图
- [ ] 我的 compose 文件 `docker compose config` 通过
- [ ] 我的数据库和应用没有 `ports`
- [ ] 我验证过重启后服务会自己起来
- [ ] 我写了五条不承诺
- [ ] 我做了至少 3 个错误实验
````

---

# 第 10 步：课后练习（60 分钟）

## 练习 1：把你的应用改成"能交付"的 compose

**要求：**

拿第 29 周那份 compose，按第 3 步的模板改：加 `restart`、加 `healthcheck`、加 `logging`、数据改 bind mount、密码改 `.env`。

**记录什么：**

```text
改了几处，每处对应什么问题。
docker compose config 有没有报错。
```

**思考题：**

```text
你的镜像有没有 healthcheck 需要的 /health 端点？没有的话第几步要补？
```

## 练习 2：画一张给领导看的图

**要求：**

只用 10 个以内的方框，画出"用户 → 服务器 → 数据存在哪"，并且标出"互联网不连接"。

**记录什么：**

```text
你的图里有没有出现 IP。
你的图能不能让一个不懂技术的人看懂"数据没出去"。
```

**思考题：**

```text
如果客户领导问"我们的数据会不会传到你们公司"，你的图怎么回答？
```

## 练习 3：给自己写一份交付边界

**要求：**

按第 6 步的模板，写一份属于你自己的附件，至少 8 条"不在交付范围"。

**记录什么：**

| 不在范围 | 客户可能怎么反驳 | 我的回答 |
|---|---|---|
| | | |

**思考题：**

```text
哪一条最容易被客户当成"你应该做的"？
```

## 练习 4：验证端口

**要求：**

在你能用的机器上起这套 compose，然后跑 `ss -lntp`，确认只有 22 和 80。

**记录什么：**

```text
实际看到的监听端口。
有没有意外的 3000 / 5432。
```

**思考题：**

```text
如果客户的 80 已经被占用，你会改成 8080 还是复用他们的 nginx？各自的代价是什么？
```

## 练习 5：做一次"重启演练"

**要求：**

`sudo reboot`，等机器起来，`docker compose ps` 看三个容器是不是都自己起来了。

**记录什么：**

```text
重启到服务可用用了多久。
有没有容器没起来，为什么。
```

**思考题：**

```text
如果客户机房半夜断电，第二天早上谁会先发现系统没起来？
```

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清私有化为什么优先选单机 compose
- [ ] 我能解释为什么数据库不能映射端口
- [ ] 我能说清 `restart` 三个值的区别
- [ ] 我能说清"交付边界"里为什么要有"不承诺"

## B. 实操

- [ ] 我写了一份能 `docker compose config` 通过的 compose 文件
- [ ] 三个服务都起来了，`docker compose ps` 全是 `Up`
- [ ] 只有 nginx 有端口映射
- [ ] 我跑过 `ss -lntp`，确认没有 5432 对外
- [ ] 我跑过 `docker stats --no-stream`，看懂了内存占用

## C. 排错

- [ ] 我看到 `No such image` 能想到 tag 不匹配
- [ ] 我看到 `exec format error` 能想到架构不匹配
- [ ] 我看到容器起不来会先看 `docker compose logs`
- [ ] 我知道 `down -v` 会删卷

## D. 交付

- [ ] `03-练习代码/` 里有部署方案、compose 文件、交付边界三份
- [ ] 架构图里没有真实 IP
- [ ] 交付边界里有响应时间表
- [ ] 交付边界里有"验收逾期视为通过"

## E. 笔记

- [ ] `02-笔记/NOTES.md` 填完
- [ ] 我自己画过一遍架构图
- [ ] 我能说出六个错误里任意四个的修法

## 本节课要能说出口的一句话

> **方案不是"我打算怎么做"，是"我做哪些、不做哪些、做不到时怎么算"。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `docker compose up` 报 `No such image` | tag 不匹配 | `docker images` 看实际 tag，改 compose |
| `exec format error` | 镜像架构和机器不符 | 用 `--platform linux/arm64` 重建 |
| 容器起来又退出 | 启动命令错或依赖没就绪 | `docker compose logs app` 看日志 |
| app 连不上数据库 | 用了 `localhost` 而不是服务名 | 改成 `postgres:5432` |
| 数据库反复重启 | 数据目录权限不对 | `chown -R 999:999 ./data/postgres` |
| 80 端口起不来 | 被宿主机 nginx 占了 | `ss -lntp` 查，然后复用或换端口 |
| 页面 502 | nginx 转发地址错 | 检查 `proxy_pass http://app:3000` |
| 页面 404 | `server_name` 不匹配 | 内网访问可以写 `_` 兜底 |
| 重启后服务没起来 | 没写 `restart` | 加 `restart: unless-stopped` |
| 磁盘满了 | 日志没轮转 | 加 `logging` 限制，清旧备份 |
| 容器内存被打满 | 没 `mem_limit` | 加限制，并查是不是内存泄漏 |
| 客户要求开 5432 | 想直连查数据 | 给只读页面或 SSH 隧道 |

---

## 下一节课要带什么

第 234 节课讲离线安装。你需要带着：

```text
这份 docker-compose.yml
三个镜像的名字和版本号（chat-app:1.2.0 / postgres:16.3 / nginx:1.25.3）
确认单上的 CPU 架构（x86_64 还是 aarch64）
```

**第 234 节课会把这些东西打成一个包，带进没有网的机房。**
