# 第 202 节课：容器网络与 compose——一次起两个服务

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 201 节课你的应用有了卷，数据不会丢了。但你的数据还在 JSON 文件里。
> 今天起两个容器：`app` 和 `postgres`，并且让它们互相找得到。然后把这些命令写成一个 `compose.yaml`，一条命令全起来。

**建议用时**：130 分钟
**你需要先完成**：第 201 节课。具体要求：`chat-data` 卷存在，你知道 `docker rm` 之后数据还在卷里。

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
docker run -d -p -v --env-file      起一个容器
docker exec / logs                  进去、看日志
```

**你会的都是"一个容器"。**

**真实项目至少两个：应用 + 数据库。**

## 0.2 你以后会遇到什么

```text
① "app 里连数据库，我写 localhost:5432，怎么连不上"
② "我把 IP 写成 172.17.0.2，重启之后就连不上了"
③ "compose up 了，app 一直重启，说数据库没起来"
④ "每次部署要敲五条 docker run，忘一条就出错"
⑤ "客户要我把整套东西给他，我总不能写五页命令给他"
```

**这五个场景，今天全解决。**

## 0.3 今天要建立的三个概念

```text
① 容器网络 —— Docker 自己的一块虚拟网络。同一网络里的容器，能用名字互相访问
② compose —— 一个 yaml 文件，把"要起哪几个容器、怎么配"写下来
③ 健康检查 —— "容器起来了"不等于"服务能用了"。数据库要几秒才准备好
```

**第 ① 个的关键事实：**

```text
同一个自定义网络里，容器名就是主机名。
默认的 bridge 网络没有这个功能。
```

**第 ③ 个是今天最容易被忽略的，也是最容易在生产上出事的。**

## 0.4 今天的交付物

| 产出 | 位置 | 内容 |
|---|---|---|
| `compose.yaml` | `第06节课/03-练习代码/` | app + postgres 两个服务 |
| `pg-data` 卷 | Docker 里 | 数据库数据 |
| 一份能跑的全栈 | 你的电脑 | `docker compose up -d` 后两个服务都 running |
| 笔记 | `NOTES.md` | 三种"连不上"的报错和修法 |

---

# 第 1 步：先复现"两个容器连不上"（20 分钟）

## 1.1 起一个数据库容器

```bash
docker run -d --name pg \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=chatdb \
  -v pg-data:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `-e POSTGRES_PASSWORD=devpass` | **必填**。不填会直接退出（错误 3） |
| `-e POSTGRES_DB=chatdb` | 自动创建一个叫 `chatdb` 的库 |
| `-v pg-data:/var/lib/postgresql/data` | 数据卷。**这个路径是 postgres 镜像定死的** |
| `-p 127.0.0.1:5432:5432` | 只给本机访问。**注意不是 `0.0.0.0`** |

**为什么 `-p` 要写 `127.0.0.1`：** 数据库绝不能被局域网访问。你本地开发也一样，养成习惯。

**等几秒，看它起来没：**

```bash
docker ps
```

```text
CONTAINER ID   IMAGE                STATUS          PORTS                      NAMES
3a4b5c6d7e8f   postgres:16-alpine   Up 10 seconds   127.0.0.1:5432->5432/tcp   pg
```

**看日志确认它准备好了：**

```bash
docker logs pg
```

```text
The files belonging to this database system will be owned by user "postgres".
...
2026-11-16 04:10:22.123 UTC [1] LOG:  database system is ready to accept connections
```

**看到 `ready to accept connections` 才算好了。**

**这一行是今天的关键。它出现之前，数据库是启动中，连不上。**

## 1.2 从你的电脑连（可以）

**你电脑上有 psql 客户端的话：**

```bash
psql "postgres://postgres:devpass@localhost:5432/chatdb" -c "select 1;"
```

**能连。** 因为 `-p 127.0.0.1:5432:5432` 把端口暴露给你电脑了。

**没有 psql 也没关系，用容器里的：**

```bash
docker exec -it pg psql -U postgres -d chatdb -c "select 1;"
```

```text
 ?column?
----------
        1
(1 row)
```

## 1.3 起 app 容器，用 `localhost` 连

```bash
docker run -d --name app \
  -p 3000:3000 \
  -e DATABASE_URL="postgres://postgres:devpass@localhost:5432/chatdb" \
  chat-app:4.0
```

**（`chat-app:4.0` 换成你当前的镜像 tag。如果你的 app 还没接数据库，这一步照样能观察到现象 —— 看日志里连数据库的报错。）**

**看日志：**

```bash
docker logs app
```

**会看到类似：**

```text
Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1595:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 5432
}
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `ECONNREFUSED` | **连接被拒绝**（那个端口上没人听） |
| `127.0.0.1:5432` | 它去连**它自己**的 5432 |
| `errno: -111` | Linux 的 `ECONNREFUSED` 错误码 |
| `syscall: 'connect'` | 出在建立连接这一步 |

**为什么：**

`app` 容器里的 `localhost` = `app` 容器自己。

**它的 5432 端口上什么都没跑。** 数据库在另一个容器里。

**这就是第 199 节课"三个 localhost"那张表的最后一行。**

## 1.4 换成容器 IP，能通，但不能用

**查 postgres 的 IP：**

```bash
docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' pg
```

**输出类似：**

```text
172.17.0.2
```

**用它连：**

```bash
docker rm -f app
docker run -d --name app -p 3000:3000 \
  -e DATABASE_URL="postgres://postgres:devpass@172.17.0.2:5432/chatdb" \
  chat-app:4.0
docker logs app
```

**这次连上了（日志里没有 ECONNREFUSED）。**

**但是：**

```text
① 这个 IP 是 Docker 分配的，重启容器可能变
② 换台机器就完全不一样
③ 你把它写进 .env，就再也不敢重启了
```

**删掉容器再起一个，看 IP 变不变：**

```bash
docker rm -f pg
docker run -d --name pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=chatdb -v pg-data:/var/lib/postgresql/data -p 127.0.0.1:5432:5432 postgres:16-alpine
docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' pg
```

**这次可能是 `172.17.0.3`（旧 IP 被回收了）。**

**结论：IP 不可靠。要用名字。**

## 1.5 试试用容器名

```bash
docker rm -f app
docker run -d --name app -p 3000:3000 \
  -e DATABASE_URL="postgres://postgres:devpass@pg:5432/chatdb" \
  chat-app:4.0
docker logs app
```

**会看到：**

```text
Error: getaddrinfo ENOTFOUND pg
    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:120:26) {
  errno: -3008,
  code: 'ENOTFOUND',
  syscall: 'getaddrinfo',
  hostname: 'pg'
}
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `ENOTFOUND` | **域名解析失败**（找不到这个名字） |
| `getaddrinfo` | 这是"把名字变成 IP"的系统调用 |
| `hostname: 'pg'` | 它想解析 `pg`，但解析不出来 |

**为什么：**

**它们都在默认的 `bridge` 网络上，而默认 `bridge` 网络不做名字解析。**

**这是 Docker 的一个历史遗留设计：**

```text
默认 bridge 网络：只能靠 IP 互相访问，容器名不解析
自定义网络     ：内置 DNS，容器名就是主机名
```

**⚠️ 这条非常反直觉。** 很多教程说"用容器名就行"，那是因为他们用了自定义网络（或者 compose，compose 会自动建一个自定义网络）。

**你手动 `docker run` 不指定 `--network`，就在默认 bridge 里，名字不生效。**

**（这句话不是笔误：默认 bridge 网络里，容器名确实解析不了。）**

## 1.6 一张"三种连法"的表

| 你写的 | 在容器里 | 结果 |
|---|---|---|
| `localhost:5432` | 容器自己的 5432 | ❌ ECONNREFUSED |
| `172.17.0.2:5432` | 那个 IP | ⚠️ 能通，但 IP 会变 |
| `pg:5432`（默认网络） | 名字 | ❌ ENOTFOUND |
| `pg:5432`（同一自定义网络） | 名字 | ✅ 通 |

**最后一行是正确答案。下面两步把它做出来。**

---

# 第 2 步：自定义网络和内置 DNS（20 分钟）

## 2.1 建一个网络

```bash
docker network create chat-net
```

**输出网络 ID：**

```text
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

**看网络列表：**

```bash
docker network ls
```

**应该看到：**

```text
NETWORK ID     NAME        DRIVER    SCOPE
a1b2c3d4e5f6   bridge      bridge    local
b2c3d4e5f6a7   chat-net    bridge    local
c3d4e5f6a7b8   host        host      local
d4e5f6a7b8c9   none        null      local
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `NETWORK ID` | 网络 ID |
| `NAME` | 名字。`bridge` / `host` / `none` 是自带的三个 |
| `DRIVER` | 用什么驱动。`bridge` 是最常用的 |
| `SCOPE` | `local` = 只在这台机器上 |

**`docker network create` 默认建的就是 `bridge` 驱动的自定义网络。**

**它和默认的 `bridge` 网络有什么区别：**

```text
默认 bridge：所有容器自动接入，没有 DNS
自定义网络：只有你指定 --network 的容器接入，有 DNS
```

**"隔离"也是好处：不同项目的容器在各自网络里，不会互相干扰。**

## 2.2 把两个容器放进这个网络

```bash
docker rm -f pg app

docker run -d --name pg --network chat-net \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=chatdb \
  -v pg-data:/var/lib/postgresql/data \
  postgres:16-alpine

docker run -d --name app --network chat-net \
  -p 3000:3000 \
  -e DATABASE_URL="postgres://postgres:devpass@pg:5432/chatdb" \
  chat-app:4.0
```

**注意：`pg` 这次没有 `-p`。**

```text
数据库不需要暴露给宿主机
app 容器通过 chat-net 直接连它
只有 app 需要 -p（给浏览器访问）
```

**这就是生产环境的标准做法：数据库不暴露端口。**

**等几秒，看日志：**

```bash
docker logs app
```

**应该没有 `ECONNREFUSED` / `ENOTFOUND` 了。**

## 2.3 验证 DNS

```bash
docker exec app sh -c "getent hosts pg"
```

**输出：**

```text
172.18.0.2      pg
```

**`getent hosts` 是"查这个名字对应的 IP"。**

**alpine 里可能没有 `getent`，用 `ping`：**

```bash
docker exec app ping -c 2 pg
```

```text
PING pg (172.18.0.2): 56 data bytes
64 bytes from 172.18.0.2: seq=0 ttl=64 time=0.081 ms
64 bytes from 172.18.0.2: seq=1 ttl=64 time=0.079 ms

--- pg ping statistics ---
2 packets transmitted, 2 packets received, 0% packet loss
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `PING pg (172.18.0.2)` | **名字 `pg` 解析成了 `172.18.0.2`** |
| `64 bytes from 172.18.0.2` | 通了 |
| `0% packet loss` | 没丢包 |

**`pg` 这个名字被解析了。这就是自定义网络的能力。**

**⚠️ 有些精简镜像没有 `ping`。** 那就用 `node -e`：

```bash
docker exec app node -e "require('dns').lookup('pg', (e,a)=>console.log(e||a))"
```

```text
172.18.0.2
```

## 2.4 DNS 是谁在做

**Docker 给每个自定义网络内置了一个 DNS 服务器，地址固定是 `127.0.0.11`。**

**看容器的 DNS 配置：**

```bash
docker exec app cat /etc/resolv.conf
```

```text
nameserver 127.0.0.11
options ndots:0
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `nameserver 127.0.0.11` | **Docker 内置 DNS** |
| `options ndots:0` | 域名里没有点时，直接当成完整名字查 |

**`127.0.0.11` 不是真实存在的地址，它是 Docker 在容器网络命名空间里挂的一个"钩子"。**

**它的工作方式：**

```text
容器发 DNS 查询 → 127.0.0.11 → 先查"这个网络里有没有叫 pg 的容器"
                               → 有，返回它的 IP
                               → 没有，转发给上游 DNS（查公网域名）
```

**所以：**

```text
✅ 同一个网络里的容器名能解析
✅ 公网域名（api.example.com）也能解析
❌ 别的网络里的容器名不能解析
```

## 2.5 网络排错的三个命令

```bash
# ① 这个容器在哪个网络
docker inspect --format '{{json .NetworkSettings.Networks}}' app
```

```text
{"chat-net":{"IPAMConfig":null,"Links":null,"Aliases":["8f3a2b1c9d4e"],"NetworkID":"a1b2...","EndpointID":"...","Gateway":"172.18.0.1","IPAddress":"172.18.0.3","IPPrefixLen":16,"MacAddress":"...","DriverOpts":null}}
```

**`IPAddress: 172.18.0.3`，`NetworkID` 对应 `chat-net`。**

```bash
# ② 这个网络里有哪些容器
docker network inspect chat-net --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

```text
pg 172.18.0.2/16
app 172.18.0.3/16
```

```bash
# ③ 从 app 里连 pg 的端口通不通
docker exec app sh -c "nc -zv pg 5432"
```

```text
pg (172.18.0.2:5432) open
```

**`nc` 是 netcat，很多镜像没有。** 没有就用 Node：

```bash
docker exec app node -e "require('net').connect(5432,'pg').on('connect',()=>{console.log('端口通');process.exit(0)}).on('error',e=>{console.log(e.code);process.exit(1)})"
```

**这两个排错命令在第 7 步会反复用。**

---

# 第 3 步：写 `compose.yaml`（30 分钟）

## 3.1 为什么要 compose

**你现在起两个容器要敲：**

```bash
docker network create chat-net
docker run -d --name pg --network chat-net -e POSTGRES_PASSWORD=... -v pg-data:... postgres:16-alpine
docker run -d --name app --network chat-net -p 3000:3000 -e DATABASE_URL=... chat-app:4.0
```

**三条命令，五个参数，两个容器名。**

**忘一条、写错一个，就是半小时。**

**compose 把这些写进一个文件：**

```bash
docker compose up -d
```

**一条命令。而且这个文件可以给客户、可以进 Git、可以在 CI 里用（第 30 周）。**

## 3.2 compose 文件的三个顶层块

```yaml
services:      # 要起哪几个容器
  ...

volumes:       # 要哪几个卷
  ...

networks:      # 要哪几个网络（一般不用写，compose 自动建）
  ...
```

**`services` 是必须的，另外两个按需。**

**⚠️ 旧版 compose 文件开头有 `version: "3"`。新版不需要，写了会警告：**

```text
the attribute `version` is obsolete, it will be ignored,
please remove it to avoid potential confusion
```

**别写 `version`。**

## 3.3 完整文件

**在 `第06节课/03-练习代码/` 里新建 `chat-stack/` 目录，进去建 `compose.yaml`。**

**（注意是 `compose.yaml`，不是 `docker-compose.yml`。两个名字都认，新版推荐前者。）**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: chat-postgres
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: chatdb
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d chatdb"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
    restart: unless-stopped

  app:
    build:
      context: ../chat-app-docker
      dockerfile: Dockerfile
    container_name: chat-app
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/chatdb
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pg-data:
```

**这个文件里有 11 个概念。下面逐块读。**

## 3.4 逐行读 `postgres` 服务

| 行 | 意思 | 不写会怎样 |
|---|---|---|
| `postgres:` | **服务名**。这就是主机名 | — |
| `image: postgres:16-alpine` | 用官方镜像，alpine 版小 | — |
| `container_name: chat-postgres` | 容器名。见 3.7 的说明 | 名字变成 `chat-stack-postgres-1` |
| `environment:` | 环境变量 | — |
| `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}` | **从 `.env` 读**（见第 6 步） | 空值，容器启动失败 |
| `POSTGRES_DB: chatdb` | 自动建库 | 库名变成 `postgres` |
| `volumes: - pg-data:/var/lib/postgresql/data` | 数据卷 | 数据随容器消失 |
| `healthcheck.test` | 怎么判断"好了" | `depends_on` 只能等"启动了" |
| `interval: 5s` | 每 5 秒查一次 | 默认 30s，等太久 |
| `timeout: 3s` | 一次查询最多 3 秒 | — |
| `retries: 10` | 连续失败 10 次才算 unhealthy | — |
| `start_period: 10s` | 启动后 10 秒内失败不计入 | 数据库初始化慢时会被误判 |
| `restart: unless-stopped` | 挂了自动重启 | 崩了就一直停着 |

**`pg_isready` 是什么：**

postgres 自带的一个小工具，作用是"问一下数据库能不能接连接"。

```bash
pg_isready -U postgres -d chatdb
```

**返回码：**

```text
0    能接连接（healthy）
1    在拒绝连接（starting / unhealthy）
2    没响应
3    参数错
```

**这是官方推荐的健康检查方式。** 别自己写 `nc -z localhost 5432` —— 端口开了不代表数据库能接查询（初始化过程中端口就开了）。

## 3.5 逐行读 `app` 服务

| 行 | 意思 |
|---|---|
| `build.context: ../chat-app-docker` | **用哪个目录当构建上下文**（相对 compose.yaml 所在目录） |
| `build.dockerfile: Dockerfile` | 用哪个 Dockerfile |
| `ports: - "3000:3000"` | 端口映射，**引号不能省**（见下面） |
| `env_file: - .env` | 把 `.env` 里的变量注进容器 |
| `environment.DATABASE_URL` | 单独覆盖一个变量 |
| `depends_on.postgres.condition` | **等 postgres 变成 healthy 再启动** |
| `restart` | 同上 |

**`build` 和 `image` 二选一：**

```yaml
# 方式一：用自己的 Dockerfile 构建
build:
  context: ../chat-app-docker

# 方式二：直接用现成镜像
image: chat-app:4.0

# 也可以两个都写：构建并打上这个 tag
build:
  context: ../chat-app-docker
image: chat-app:4.0
```

**`ports` 为什么必须加引号：**

```yaml
✅ ports:
     - "3000:3000"
❌ ports:
     - 3000:3000
```

**YAML 里 `3000:3000` 会被解析成"六十进制数"（sexagesimal），结果是一个奇怪的数字。**

**实际报错：**

```text
services.app.ports.0 must be a string
```

**或者更奇怪：端口变成了别的东西。**

**规则：compose 里的端口一律加引号。**

## 3.6 验证文件语法

**在 `chat-stack/` 目录里：**

```bash
docker compose config
```

**这个命令做两件事：**

```text
① 检查 yaml 语法
② 把 ${变量} 替换成真实值，打印最终配置
```

**应该看到（节选）：**

```yaml
name: chat-stack
services:
  app:
    build:
      context: B:\OPC-Distance_study\...\chat-app-docker
      dockerfile: Dockerfile
    container_name: chat-app
    depends_on:
      postgres:
        condition: service_healthy
        required: true
    environment:
      DATABASE_URL: postgres://postgres:devpass@postgres:5432/chatdb
    ...
```

**⚠️ `DATABASE_URL` 里会打印出你的数据库密码。**

**别把 `docker compose config` 的输出贴到群里。**

**如果 `${POSTGRES_PASSWORD}` 是空的：**

```text
DATABASE_URL: postgres://postgres:@postgres:5432/chatdb
```

**中间是两个 `@`，密码空了。** 说明 `.env` 没读到（第 6 步讲）。

## 3.7 起起来

**先建 `.env`（compose 目录下）：**

```text
POSTGRES_PASSWORD=devpass
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_BASE_URL=https://api.example.com/v1
```

**然后：**

```bash
docker compose up -d
```

**第一次会 build（因为 `app` 配了 `build`），输出很长：**

```text
[+] Building 12.3s (11/11) FINISHED
 => [internal] load build definition from Dockerfile
 ...
 => => naming to docker.io/library/chat-stack-app
[+] Running 3/3
 ✔ Network chat-stack_default       Created      0.1s
 ✔ Container chat-postgres          Healthy     12.4s
 ✔ Container chat-app               Started      0.3s
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Network chat-stack_default Created` | **compose 自动建了一个网络**，名字是 `目录名_default` |
| `Container chat-postgres Healthy` | 数据库起来了，而且健康检查通过了 |
| `Container chat-app Started` | app 起来了。**注意它在 postgres 之后** |

**关键：`Healthy 12.4s` —— 它等了 12 秒。**

**因为 `depends_on` 配了 `condition: service_healthy`。** 没有这个配置，app 会在 0.3 秒后就启动，然后连不上库。

**看状态：**

```bash
docker compose ps
```

```text
NAME             IMAGE                  COMMAND                  SERVICE    CREATED          STATUS                    PORTS
chat-app         chat-stack-app         "docker-entrypoint.s…"   app        30 seconds ago   Up 29 seconds             0.0.0.0:3000->3000/tcp
chat-postgres    postgres:16-alpine     "docker-entrypoint.s…"   postgres   40 seconds ago   Up 40 seconds (healthy)   5432/tcp
```

**逐列读（比 `docker ps` 多了两列）：**

| 列 | 意思 |
|---|---|
| `NAME` | 容器名 |
| `SERVICE` | **对应 yaml 里的服务名** |
| `STATUS` | 注意 `(healthy)` 这个标记 |
| `PORTS` | postgres 那个 `5432/tcp` **没有宿主端口**，说明没暴露到宿主机 |

**`5432/tcp` 前面没有 `0.0.0.0:xxxxx->`，意思是"只在容器网络里"。这是对的。**

## 3.8 服务名就是主机名

**验证：**

```bash
docker compose exec app node -e "require('dns').lookup('postgres',(e,a)=>console.log(e||a))"
```

```text
172.19.0.2
```

**`postgres` 这个名字解析成功了。**

**为什么是 `postgres` 而不是 `postgres:5432` 里的 `pg`：**

**服务名是什么，主机名就是什么。**

```yaml
services:
  postgres:        ← 这个名字就是主机名
```

**你可以改成 `db`：**

```yaml
services:
  db:
    image: postgres:16-alpine
```

**那 `DATABASE_URL` 就要变成 `@db:5432`。**

**⚠️ 改服务名要同时改所有引用它的地方。** 这是 compose 里最常见的低级错误。

## 3.9 `container_name` 要不要写

**不写：** 容器名自动变成 `<项目名>-<服务名>-<序号>`，比如 `chat-stack-postgres-1`。

**写了：** 就是 `chat-postgres`。

**建议：**

```text
本地开发：可以不写。自动名字很清楚
要固定名字（脚本里引用）：写
要跑两套同样的栈（端口不同）：别写，否则名字冲突
```

**这一节写了 `container_name`，是为了后面命令好打。**

## 3.10 常用命令

| 命令 | 干什么 |
|---|---|
| `docker compose up -d` | 后台起来（会 build） |
| `docker compose up -d --build` | 强制重新 build |
| `docker compose ps` | 看状态 |
| `docker compose logs -f app` | 看某个服务的日志 |
| `docker compose logs -f` | 看所有服务的日志（混在一起） |
| `docker compose exec app sh` | 进某个服务 |
| `docker compose restart app` | 重启某个服务 |
| `docker compose stop` | 停，但容器还在 |
| `docker compose down` | 停 + 删容器 + 删网络，**保留卷** |
| `docker compose down -v` | **⚠️ 连卷一起删** |
| `docker compose build` | 只 build，不启动 |
| `docker compose config` | 打印最终配置 |
| `docker compose top` | 看每个服务里的进程 |

**`up -d` 和 `start` 的区别：**

```text
up -d     读 yaml，该建的建，该改的改（改了 image/ports 会重建容器）
start     把上次的容器原样起来，不读 yaml
```

---

# 第 4 步：`depends_on` 不等于"数据库好了"（20 分钟）

## 4.1 先看一个错误配置

**把 `depends_on` 改成最简单的形式：**

```yaml
    depends_on:
      - postgres
```

**（这是"短语法"，只表示"先启动它"。）**

**并且把 healthcheck 删掉。**

**然后：**

```bash
docker compose down
docker compose up -d
docker compose logs app
```

**会看到：**

```text
Error: connect ECONNREFUSED 172.19.0.2:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1595:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '172.19.0.2',
  port: 5432
}
```

**注意这次 IP 是对的（`172.19.0.2`），端口也对，但连接被拒绝。**

**为什么：**

```text
postgres 容器 0.5 秒就"启动"了
app 容器 0.6 秒就启动了
但 postgres 要 10 秒才能接受连接（初始化数据目录、建库、启动监听）
```

**`depends_on` 只保证"容器启动了"，不保证"服务能用了"。**

**这就是它的定义：**

```text
depends_on（短语法） = 启动顺序，不是就绪顺序
```

**⚠️ 这条一定要记住。** 它是 compose 里最大的认知陷阱。

## 4.2 看 app 怎么死的

```bash
docker compose ps
```

```text
NAME          STATUS
chat-app      Restarting (1) 2 seconds ago
chat-postgres Up 15 seconds
```

**`Restarting (1)`：app 一直崩一直重启，因为 `restart: unless-stopped`。**

**看它重启了几次：**

```bash
docker inspect --format '{{.RestartCount}}' chat-app
```

```text
7
```

**7 次。**

**这就是"数据库没起来，应用一直重试"的样子。** 如果 postgres 只是慢，第 8 次可能就成功了 —— **所以有时候它"自己好了"，让你以为没问题。**

**这种"看起来好了"最危险。**

## 4.3 正确配置：healthcheck + condition

**把 3.3 那份配置改回来：**

```yaml
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d chatdb"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
```

```yaml
    depends_on:
      postgres:
        condition: service_healthy
```

**重新起来：**

```bash
docker compose down
docker compose up -d
```

**这次输出：**

```text
[+] Running 2/2
 ✔ Container chat-postgres  Healthy  12.1s
 ✔ Container chat-app       Started   0.2s
```

**`Healthy 12.1s` —— compose 等了 12 秒才启动 app。**

**app 的日志：**

```bash
docker compose logs app
```

```text
Server running at http://0.0.0.0:3000
数据库连接成功
```

**没有再重启。**

## 4.4 `condition` 的三个值

| 值 | 意思 |
|---|---|
| `service_started` | 相当于短语法：容器启动了就行 |
| `service_healthy` | **等健康检查通过** |
| `service_completed_successfully` | 等它正常退出（用于"一次性任务"，比如迁移脚本） |

**第三个很有用：**

```yaml
  migrate:
    build: ../chat-app-docker
    command: ["node", "scripts/migrate.js"]
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"
```

**这个服务跑完就退出（执行数据库迁移），`app` 可以 `depends_on` 它用 `service_completed_successfully`。**

**第 7 节会用到这个模式。**

## 4.5 三层防护，缺一不可

**光有 healthcheck 还不够。真实的系统要三层：**

```text
第一层：healthcheck + depends_on   保证启动顺序
第二层：应用自己重试              数据库短暂抖动时能扛住
第三层：连不上就明确报错          别让用户先发现
```

**第二层在代码里做：**

```js
async function waitForDb(retries = 10, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query("select 1")
      console.log("数据库连接成功")
      return
    } catch (err) {
      console.log(`第 ${i} 次连接数据库失败，${delayMs / 1000} 秒后重试：${err.code}`)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw new Error("数据库连不上，放弃启动")
}
```

**逐行读：**

| 行 | 干什么 |
|---|---|
| `for (let i = 1; i <= retries; i++)` | 最多试 10 次 |
| `await pool.query("select 1")` | 一次最轻量的查询，通了就说明能用 |
| `catch` | 失败就等 2 秒再试 |
| `throw new Error(...)` | 10 次都不行，**明确失败**，别装作没事 |

**为什么 healthcheck 之外还要重试：**

```text
healthcheck 只在启动时管一次
运行中数据库可能重启（升级、OOM）
那时 app 已经跑起来了，healthcheck 管不了
```

**第三层就是 6.3 讲的 fail fast。**

---

# 第 5 步：compose 的 `.env` 是两回事（15 分钟）

## 5.1 两个 `.env`，两个用途

**这是 compose 最让人困惑的地方。**

```text
compose.yaml 同目录下的 .env     →  给 compose 自己做变量替换用的
应用自己的 .env（env_file 指定）  →  给容器里的程序用的
```

**区别：**

| | compose 的 `.env` | 应用的 `.env` |
|---|---|---|
| 谁读 | `docker compose` 命令 | 容器里的程序（通过 `env_file` 注入） |
| 什么时候读 | 解析 yaml 时 | 容器启动时 |
| 用途 | 替换 `${POSTGRES_PASSWORD}` | 变成容器的环境变量 |
| 会不会进容器 | **不会**（除非 `env_file` 也指向它） | 会 |

## 5.2 实验：把两个混在一起会怎样

**你的目录现在长这样：**

```text
chat-stack/
├── compose.yaml
├── .env                  ← 给 compose 做变量替换
└── ../chat-app-docker/
    └── .env              ← 给应用用（但容器里没有它！）
```

**注意：`app` 服务的 `env_file: - .env` 指的是 `chat-stack/.env`，不是 `chat-app-docker/.env`。**

**为什么：`env_file` 的路径是相对 `compose.yaml` 所在目录的。**

**所以你现在只有一个 `.env`，同时干两件事：**

```text
① 提供 ${POSTGRES_PASSWORD} 给 compose 替换
② 被 env_file 注进 app 容器（于是 OPENAI_API_KEY 也进去了）
```

**能工作，但有两个隐患：**

```text
① 你可能会不小心把 POSTGRES_PASSWORD 也注进 app 容器
② 客户拿到这套文件时，分不清哪个 .env 该改什么
```

**更清楚的做法：**

```text
chat-stack/
├── compose.yaml
├── .env              ← 只放 compose 需要的（POSTGRES_PASSWORD）
└── app.env           ← 只放应用需要的（OPENAI_API_KEY 等）
```

```yaml
  app:
    env_file:
      - app.env
```

## 5.3 `${VAR}` 为空会怎样

**把 `.env` 里的 `POSTGRES_PASSWORD` 删掉，然后：**

```bash
docker compose config
```

**输出里：**

```yaml
      DATABASE_URL: postgres://postgres:@postgres:5432/chatdb
```

**密码位是空的。**

**再看 postgres 容器：**

```bash
docker compose up -d
docker compose logs postgres
```

```text
Error: Database is uninitialized and superuser password is not specified.
       You must specify POSTGRES_PASSWORD to a non-empty value for the
       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".

       You must also specify a password for the "postgres" user.

       Note that this password is not used if you use "trust" authentication
       and you should delete it from your environment before deploying.
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `Database is uninitialized` | 卷是空的，要初始化 |
| `superuser password is not specified` | **没给超级用户密码** |
| `You must specify POSTGRES_PASSWORD` | 必须给 |
| `to a non-empty value` | **不能是空字符串** |

**这就是"变量没读到"的表现。**

**怎么查：**

```bash
docker compose config | grep -A2 DATABASE_URL
```

**看到空密码就是它。**

## 5.4 变量的三种来源和优先级

| 来源 | 写法 | 优先级 |
|---|---|---|
| shell 环境变量 | `export POSTGRES_PASSWORD=xxx` | **最高** |
| `.env` 文件 | `POSTGRES_PASSWORD=xxx` | 中 |
| yaml 里的默认值 | `${POSTGRES_PASSWORD:-devpass}` | 最低 |

**`${VAR:-默认值}` 这个语法很有用：**

```yaml
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-devpass}
```

**意思是：有就用，没有就用 `devpass`。**

**⚠️ 但生产环境不要给密码默认值。** 忘了配就用 `devpass`，等于没有密码。

**规则：**

```text
本地开发：可以给默认值，方便
生产环境：不给默认值，缺了就报错
```

---

# 第 6 步：故意犯七个错（25 分钟）

## 错误 1：`DATABASE_URL` 里写 `localhost`

**操作：**

```yaml
    environment:
      DATABASE_URL: postgres://postgres:devpass@localhost:5432/chatdb
```

**会怎样：**

```bash
docker compose up -d
docker compose logs app
```

```text
Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1595:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 5432
}
```

**为什么：**

`localhost` 在 app 容器里指的是 app 自己。它自己没有 5432。

**怎么查：**

```bash
docker compose exec app cat /etc/hosts
```

```text
127.0.0.1       localhost
::1             localhost ip6-localhost ip6-loopback
172.19.0.3      8f3a2b1c9d4e
```

**`127.0.0.1` 就是它自己。** 而 postgres 的 IP 是 `172.19.0.2`。

**怎么修：**

```yaml
      DATABASE_URL: postgres://postgres:devpass@postgres:5432/chatdb
```

**把 `localhost` 换成服务名。**

> **这条是这一周最高频的错误。** 记住：**容器里连别的容器，用服务名；连自己，才用 localhost。**

## 错误 2：服务名拼错

**操作：**

```yaml
    environment:
      DATABASE_URL: postgres://postgres:devpass@postgresql:5432/chatdb
```

**（服务叫 `postgres`，你写了 `postgresql`。）**

**会怎样：**

```text
Error: getaddrinfo ENOTFOUND postgresql
    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:120:26) {
  errno: -3008,
  code: 'ENOTFOUND',
  syscall: 'getaddrinfo',
  hostname: 'postgresql'
}
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `ENOTFOUND` | 名字解析失败 |
| `hostname: 'postgresql'` | **找不到叫这个名字的容器** |

**为什么：**

compose 的网络里只有 `postgres` 和 `app` 两个名字。`postgresql` 不存在。

**怎么查：**

```bash
docker compose exec app sh -c "cat /etc/resolv.conf"
docker network inspect chat-stack_default --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}'
```

**会列出网络里所有容器名。**

**怎么修：**

**把 `postgresql` 改回 `postgres`。改完 `docker compose up -d` 会自动重建 app 容器。**

## 错误 3：没设 `POSTGRES_PASSWORD`

**操作：** 删掉 `POSTGRES_PASSWORD` 那一行。

**会怎样：**

```bash
docker compose up -d
docker compose ps
```

```text
NAME             STATUS
chat-postgres    Exited (1) 5 seconds ago
```

**看日志：**

```text
Error: Database is uninitialized and superuser password is not specified.
       You must specify POSTGRES_PASSWORD to a non-empty value for the
       superuser.
```

**为什么：**

postgres 镜像的初始化逻辑强制要求这个变量。**空密码的数据库等于没有密码。**

**怎么修：**

```yaml
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

**并且在 `.env` 里：**

```text
POSTGRES_PASSWORD=devpass
```

**⚠️ 这个变量只在"第一次初始化"时生效。**

**卷里已经有数据了，你再改密码，它不会变。** 要改密码得进数据库执行 `ALTER USER`。

## 错误 4：端口冲突

**操作：** 你电脑上已经有一个 postgres 在 5432 上（或者你上一个实验的容器没删）。

```yaml
    ports:
      - "5432:5432"
```

```bash
docker compose up -d
```

**会怎样：**

```text
Error response from daemon: driver failed programming external connectivity
on endpoint chat-postgres (a1b2c3...):
Bind for 0.0.0.0:5432 failed: port is already allocated
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `driver failed programming external connectivity` | 网络配置失败 |
| `on endpoint chat-postgres` | 出在 postgres 这个容器 |
| `Bind for 0.0.0.0:5432 failed` | 绑定 0.0.0.0:5432 失败 |
| `port is already allocated` | **端口已被分配** |

**怎么查：**

```bash
docker ps --filter "publish=5432"
```

**或者：**

```bash
docker compose ps -a
```

**看是不是上次的容器还在。**

**怎么修：**

```bash
# 本地的 postgres 服务（如果装了）
# Windows：服务里停掉 postgresql 服务

# 或者不暴露数据库端口（推荐）
```

**其实你根本不需要暴露 postgres 的端口。** 改成：

```yaml
  postgres:
    # 不写 ports
```

**只有 app 需要 `ports`。**

**如果确实要用 psql 连，改成非默认端口：**

```yaml
    ports:
      - "127.0.0.1:5433:5432"
```

**记得写 `127.0.0.1`。**

## 错误 5：yaml 缩进错了

**操作：** 把 `environment` 下面的两行少缩进两个空格：

```yaml
  postgres:
    image: postgres:16-alpine
    environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: chatdb
```

**会怎样：**

```text
yaml: line 5: did not find expected key
```

**或者：**

```text
yaml: line 6: mapping values are not allowed in this context
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `yaml:` | yaml 解析器报的 |
| `line 5` | 第 5 行（**注意：compose 报的行号有时会偏，看附近几行**） |
| `did not find expected key` | 这里应该有个键，但没找到 |

**为什么：**

**YAML 用缩进表示层级。缩进错了，层级就错了。**

**而且 YAML 不允许 Tab，只能用空格。**

**怎么查：**

```bash
docker compose config
```

**它会直接告诉你第几行。**

**VS Code 里装 YAML 插件，缩进错会标红。**

**怎么修：**

**`environment` 是一个键，它下面的 `POSTGRES_PASSWORD` 要比它多缩进（通常 2 或 4 空格，全文件一致）。**

```yaml
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: chatdb
```

**规则：**

```text
① 只用空格，不用 Tab
② 同一层级缩进量必须一致
③ 列表项 `-` 后面要有一个空格
```

## 错误 6：用了 `docker-compose`（带横线）

**操作：**

```bash
docker-compose up -d
```

**会怎样：**

```text
bash: docker-compose: command not found
```

**Windows PowerShell 里：**

```text
docker-compose : 无法将“docker-compose”项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
```

**为什么：**

`docker-compose`（带横线）是 **v1**，用 Python 写的，**2023 年已经停止维护**。

现在是 **v2**，作为 Docker CLI 的插件，命令是 `docker compose`（空格）。

**怎么查你有没有：**

```bash
docker compose version
```

```text
Docker Compose version v2.29.7
```

**有输出就是 v2，能用。**

```bash
docker-compose --version
```

**报"找不到"是正常的，也别去装它。**

**怎么修：**

```text
把所有 docker-compose 换成 docker compose（空格）
```

**⚠️ 网上 2023 年之前的教程大部分是 `docker-compose`。** 看到带横线的，把横线换成空格就对了。

## 错误 7：`version` 字段的警告

**操作：** compose 文件开头写：

```yaml
version: "3.8"
services:
  ...
```

**会怎样：**

```text
WARN[0000] The "version" attribute is obsolete.
It will be ignored. Please remove it to avoid potential confusion.
```

**或者中文版：**

```text
the attribute `version` is obsolete, it will be ignored,
please remove it to avoid potential confusion
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `WARN` | 警告，不是错误 |
| `obsolete` | 已废弃 |
| `It will be ignored` | **会被忽略** |
| `Please remove it` | 删掉它 |

**为什么：**

v2 的 compose 规范不再需要 `version`，它靠文件内容自动判断。

**这是个警告，不影响运行。** 但每次 `up` 都刷一行，很烦。

**怎么修：** 删掉那一行。

**⚠️ 但有些老教程会说要写 `version: "3"`。** 那是 v1/v2 早期的事。**现在删掉。**

---

# 第 7 步：写学习笔记（10 分钟）

**打开 `第06节课/02-笔记/NOTES.md` 填。**

**重点填三处：**

```text
① 我用 localhost 连数据库时的报错原文
② docker compose ps 里 (healthy) 那个标记出现在哪里
③ docker network inspect 列出的容器名和 IP
```

---

# 第 8 步：课后练习

## 练习一：把 `depends_on` 换回短语法

**要求：**

1. 备份 `compose.yaml`；
2. 把 `depends_on` 改成短语法，删掉 healthcheck；
3. `docker compose down && docker compose up -d`；
4. 连续看 30 秒日志，记录 app 重启了几次。

**记录：** `RestartCount` 的变化，以及最终有没有连上。

**思考：如果 postgres 只是慢 3 秒，app 会"自己好了"。这种情况下你怎么发现配置有问题？**

## 练习二：加一个 `migrate` 服务

**要求：**

1. 加一个服务：

   ```yaml
     migrate:
       build:
         context: ../chat-app-docker
       command: ["node", "scripts/migrate.js"]
       env_file:
         - .env
       environment:
         DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/chatdb
       depends_on:
         postgres:
           condition: service_healthy
       restart: "no"
   ```

2. 让 `app` 依赖它：

   ```yaml
     app:
       depends_on:
         migrate:
           condition: service_completed_successfully
         postgres:
           condition: service_healthy
   ```

3. `docker compose up -d`，看 `ps -a` 里 migrate 的状态。

**记录：** migrate 的退出码，以及 app 有没有等它。

**思考：为什么 migrate 要写 `restart: "no"`？不写会怎样？**

## 练习三：两个栈同时跑

**要求：**

1. 复制一份 `chat-stack` 成 `chat-stack-2`；
2. 删掉两个服务里的 `container_name`；
3. 把 app 端口改成 3001；
4. 两个目录分别 `up -d`。

**记录：** 两套容器的名字分别是什么。

**思考：为什么要删 `container_name`？两套栈的网络是同一个吗？**

## 练习四：用 `docker network` 手工复现 compose 做的事

**要求：** 不用 compose，只用 `docker network` 和 `docker run`，把 app + postgres 跑起来，用名字连通。

**记录：** 你敲了几条命令。

**思考：compose 到底帮你做了什么？它省掉的是"敲命令"还是"记参数"？**

## 练习五：画一张网络图

**要求：** 在纸上画出：

```text
你的 Windows
  ├── 3000 端口 → chat-app 容器
  ├── chat-net 网络
  │     ├── chat-app（172.19.0.3）
  │     └── chat-postgres（172.19.0.2）
  └── pg-data 卷
```

**记录：** 图上标出：哪个箭头是 `-p`，哪个是 DNS 解析，哪个是卷挂载。

**思考：为什么 postgres 的 5432 不需要映射到宿主机？**

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我知道容器里的 `localhost` 是它自己
- [ ] 我知道默认 `bridge` 网络不解析容器名，自定义网络解析
- [ ] 我知道 compose 的服务名就是主机名
- [ ] 我知道 `depends_on` 短语法只保证启动顺序
- [ ] 我知道 `healthcheck` + `condition: service_healthy` 才是"等它好了"

## B. 实操

- [ ] 我能用 `docker network create` + `--network` 让两个容器按名字连通
- [ ] 我写了一个 `compose.yaml`，里面有 app + postgres
- [ ] `docker compose up -d` 之后 `docker compose ps` 两个都是 Up
- [ ] postgres 显示 `(healthy)`
- [ ] 我会 `docker compose logs -f app` / `exec` / `down`
- [ ] 我会 `docker compose config` 检查语法

## C. 排错

- [ ] 看到 `ECONNREFUSED 127.0.0.1:5432`，我知道是写了 `localhost`
- [ ] 看到 `ENOTFOUND`，我知道是服务名拼错或不在同一网络
- [ ] 看到 `port is already allocated`，我知道去查谁占了
- [ ] 看到 `yaml: line N`，我知道去改缩进
- [ ] 看到 `docker-compose: command not found`，我知道换成 `docker compose`

## D. 交付

- [ ] `chat-stack/compose.yaml` 能一条命令起全栈
- [ ] `.env` 里有 `POSTGRES_PASSWORD`，`docker compose config` 显示正常
- [ ] `pg-data` 卷存在，`down` 之后 `up` 数据还在
- [ ] 我试过 `down` 和 `down -v` 的区别

## E. 笔记

- [ ] 三种连不上的报错原文都贴了
- [ ] 网络图自己画了一遍
- [ ] 「我卡在哪」写了真实内容

## 本节课要能说出口的一句话

> **容器之间用名字说话，不用 IP；compose 的服务名就是主机名；但 `depends_on` 只保证"启动了"，不保证"能用了" —— 要 `healthcheck` 才算真的等到了。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | 用了 `localhost` | 换服务名 |
| `ENOTFOUND postgres` | 名字拼错 / 不在同一网络 | 核对服务名；检查 network |
| `ECONNREFUSED 172.x.x.x:5432` | 数据库还没准备好 | 加 healthcheck + `service_healthy` |
| `Restarting (1)` 一直重启 | 启动就崩 | 先 `restart: "no"`，看日志 |
| `POSTGRES_PASSWORD ... not specified` | 变量空 | `.env` 里配；`compose config` 确认 |
| `port is already allocated` | 端口被占 | 不暴露数据库端口；或换端口 |
| `yaml: line N` | 缩进/Tab | 只用空格；`compose config` 看行号 |
| `docker-compose: command not found` | v1 已废弃 | 用 `docker compose` |
| `version is obsolete` | 写了 `version` | 删掉 |
| `ports.0 must be a string` | 端口没加引号 | `- "3000:3000"` |
| `service "app" depends on undefined service` | 依赖的服务名不存在 | 检查 spelling |
| 改了 yaml 没生效 | 没重建容器 | `up -d`（会自动重建）或 `--force-recreate` |
| 改了代码没生效 | 没重新 build | `up -d --build` |
| `down -v` 之后数据库空了 | `-v` 删了卷 | 用 `down` |
| 容器名冲突 | 两个目录都写了 `container_name` | 删掉 `container_name` |
| `compose config` 里密码是空 | `.env` 不在 compose 目录 | 把 `.env` 放到 `compose.yaml` 旁边 |
| 数据库密码改了但没变 | 变量只在首次初始化生效 | 进库 `ALTER USER` |
