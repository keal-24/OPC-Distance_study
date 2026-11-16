# 第 199 节课：启动应用容器——端口、日志、进容器

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 198 节课你 build 出了 `chat-app:2.0`。但那只是"一个躺在硬盘上的镜像"。
> 今天你要把它跑起来，并且学会三件每天都会用的事：**端口为什么连不上、日志在哪看、怎么进到容器里看文件。**

**建议用时**：110 分钟
**你需要先完成**：第 198 节课。具体要求：`docker images` 里有 `chat-app:2.0`，`docker run -d -p 3000:3000 chat-app:2.0` 之后浏览器能打开 `localhost:3000`。

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
docker build -t chat-app:2.0 .     把项目做成镜像
docker run -d -p 3000:3000 ...     让容器后台跑起来
docker ps                          看它在不在
```

**你会"启动"，但你不会"排查"。**

**容器最坑的地方不是启动，是启动之后"打不开"。** 打不开的时候，你只有三条路：看日志、进容器、查端口。**今天就把这三条路走熟。**

## 0.2 你以后会遇到什么

```text
① "容器是 Up 的，但浏览器打不开"              ← 80% 是监听地址或端口映射
② "日志刷得飞快，我抓不到报错那一行"           ← 不会 --tail 和 -f
③ "我想看看容器里那个文件到底在不在"           ← 不会 exec
④ "容器启动 2 秒就退出了"                     ← 不会看 Exited 和 logs
⑤ "改了代码，怎么容器里还是旧的"               ← 没重新 build，或不理解镜像是只读的
```

**这五个场景，今天全部解决。**

## 0.3 今天要建立的三个概念

```text
① 端口映射 —— 宿主机的哪个门，通到容器的哪个门。左边宿主，右边容器。
② 日志流 —— 容器里程序的标准输出，被 Docker 存成文件，用 docker logs 读。
③ 容器是一个"活的进程" —— 主进程结束容器就停；容器停了你 exec 不进去。
```

## 0.4 今天的交付物

| 产出 | 位置 | 内容 |
|---|---|---|
| 一个跑得起来的容器 | 你的电脑 | 名字 `chat-app`，`Up` 状态，页面能打开 |
| 一份排查记录 | `第03节课/02-笔记/NOTES.md` | 七种"打不开"的现象和修法 |
| 命令记录 | `第03节课/03-练习代码/命令记录.md` | 端口、日志、exec 的真实输出 |

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **你的 Windows 电脑。** |
| **用哪个终端** | **Git Bash。** |
| **现在在哪个目录** | <code>cd "B:/OPC-Distance_study/每周课程/06-上线运维/第29周-Docker/第03节课/03-练习代码/chat-app-docker"</code><br>（第 2 节建的目录，这一节继续用） |
| **本节新建什么** | `命令记录.md`（贴 `docker run` / `logs` / `exec` 的完整输出） |

## 开工前先跑这一条

确认你没站错地方：

```bash
docker images | grep chat-app
```

**应该看到：**

```text
chat-app    2.0    a1b2c3d4e5f6    2 hours ago    178MB
```

**必须能看到 `chat-app:2.0`。** 这一节所有实验都基于它。

## 如果不对

**什么都没输出** → 第 2 节的镜像没做成，回第 198 节课重新 build。

**`pwd` 不在 `chat-app-docker`** → 上一节目录没建对，回第 2 节 1.2。

---

# 第 1 步：用一条完整的命令启动（15 分钟）

## 1.1 先确认镜像还在

```bash
docker images
```

**应该看到：**

```text
REPOSITORY   TAG       IMAGE ID       CREATED        SIZE
chat-app     2.0       a1b2c3d4e5f6   2 hours ago    178MB
```

**没有的话，回第 198 节课重新 build。**

## 1.2 完整启动命令

```bash
docker run -d --name chat-app -p 3000:3000 --restart unless-stopped chat-app:2.0
```

**应该输出一长串 ID：**

```text
8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

## 1.3 逐个参数读

| 参数 | 全称 | 干什么 | 不写会怎样 |
|---|---|---|---|
| `-d` | `--detach` | 后台运行，命令立刻返回 | 占着你的终端，`Ctrl+C` 就把容器停了 |
| `--name chat-app` | | 给容器起名字 | 名字变成 `clever_morse`，你记不住 |
| `-p 3000:3000` | `--publish` | 端口映射 | 宿主机访问不到（2.3 演示） |
| `--restart unless-stopped` | | 挂了自己重启 | 程序崩了就一直是停的 |
| `chat-app:2.0` | | 用哪个镜像 | — |

**`--restart unless-stopped` 是什么：**

| 值 | 行为 |
|---|---|
| `no`（默认） | 崩了就崩了，不重启 |
| `on-failure` | 非 0 退出码才重启 |
| `always` | 什么都重启，包括你手动 `docker stop` 之后重启电脑 |
| `unless-stopped` | **除了你手动 stop 的，其他都重启。推荐** |

**区别在"你手动停了它，重启电脑后还要不要它自己起来"。**

`always`：你 `docker stop` 了，重启电脑它又起来了。**你以为关掉了，其实没有。**

`unless-stopped`：你 stop 了就是 stop 了，重启电脑还是停的。**符合直觉。**

**你现在是本地开发，这个参数可以先不写。** 但第 31 周上服务器，**必须写**。

## 1.4 确认它在跑

```bash
docker ps
```

**应该看到：**

```text
CONTAINER ID   IMAGE          COMMAND                  CREATED         STATUS         PORTS                    NAMES
8f3a2b1c9d4e    chat-app:2.0   "docker-entrypoint.s…"   8 seconds ago   Up 7 seconds   0.0.0.0:3000->3000/tcp   chat-app
```

**逐列读这张表（今天要读几十遍）：**

| 列 | 值 | 意思 |
|---|---|---|
| `CONTAINER ID` | `8f3a2b1c9d4e` | 容器 ID 前 12 位。命令里用前 3—4 位就够 |
| `IMAGE` | `chat-app:2.0` | 用哪个镜像 |
| `COMMAND` | `"docker-entrypoint.s…"` | **实际执行的命令**。被省略号截断了，用 `--no-trunc` 看全 |
| `CREATED` | `8 seconds ago` | 创建时间 |
| `STATUS` | `Up 7 seconds` | 正在跑，已经跑了 7 秒 |
| `PORTS` | `0.0.0.0:3000->3000/tcp` | **端口映射。左边宿主，右边容器** |
| `NAMES` | `chat-app` | 你起的名字 |

**`COMMAND` 那一列为什么是你没写过的命令：**

`node:22-alpine` 这个基础镜像里定义了 `ENTRYPOINT ["docker-entrypoint.sh"]`。

**最终执行的是 `ENTRYPOINT` + `CMD` 拼起来：**

```text
docker-entrypoint.sh node server.js
```

**那个脚本干的事：** 检查你是不是要跑 `node`，是的话就直接 `exec node server.js`（第 198 节课讲的信号传递问题，官方镜像已经帮你处理了）。

**看完整命令：**

```bash
docker ps --no-trunc
```

## 1.5 打开页面

**浏览器输入：**

```text
http://localhost:3000
```

**能看到你的聊天界面，说明这条链通了：**

```text
浏览器 → 宿主机 3000 → Docker 转发 → 容器 3000 → node 进程
```

**任何一环断了，都是"打不开"。** 今天就是把每一环单独拆出来看。

## 1.6 `docker port`：只看端口映射

```bash
docker port chat-app
```

**应该看到：**

```text
3000/tcp -> 0.0.0.0:3000
```

**左边是容器里的端口，右边是宿主机上的地址。**

**这条命令在第 3 步排查时会经常用。** 它比 `docker ps` 干净，不会截断。

## 1.7 `docker inspect`：一次看全

```bash
docker inspect chat-app
```

**输出是一大坨 JSON。** 你不需要全看，只要会挑：

```bash
docker inspect --format '{{.State.Status}}' chat-app
```

**应该输出：**

```text
running
```

**看端口：**

```bash
docker inspect --format '{{json .NetworkSettings.Ports}}' chat-app
```

**应该输出：**

```text
{"3000/tcp":[{"HostIp":"0.0.0.0","HostPort":"3000"}]}
```

**`--format` 是 Go 模板语法。** 你现在只需要背这三个常用的：

```text
{{.State.Status}}                 running / exited
{{.State.ExitCode}}               退出码
{{json .NetworkSettings.Ports}}   端口映射
```

**第 7 步讲 `Exited` 的时候会用 `ExitCode`。**

---

# 第 2 步：端口映射，左边右边（25 分钟）

## 2.1 一句话规则

```text
-p 宿主机端口:容器端口
   └── 左边 ──┘ └── 右边 ──┘
```

**记住"左边是你电脑，右边是容器"。**

**记不住就记这个：**

```text
你从外面访问，先碰到的是你电脑的门（左边）
进去之后才到容器的门（右边）
```

**⚠️ 讲反了的现象不是报错，是"打不开"。** 这是它最坑的地方。

## 2.2 实验一：换一个宿主端口

**停掉刚才的容器：**

```bash
docker rm -f chat-app
```

**用 8000 当宿主端口：**

```bash
docker run -d --name chat-app -p 8000:3000 chat-app:2.0
```

**看端口：**

```bash
docker port chat-app
```

```text
3000/tcp -> 0.0.0.0:8000
```

**现在浏览器打开 `http://localhost:8000`。能开。**

**打开 `http://localhost:3000`。打不开。**

**为什么：**

```text
容器里的程序还是监听 3000（它不知道外面的事）
你的电脑上，8000 这个门通到容器的 3000
3000 这个门，你电脑上根本没人开
```

**这就是"左边右边"最直观的样子。**

**记法：右边永远不用改，它由你的代码决定。左边随便改，改的是"从哪个门进去"。**

**什么时候需要改左边：**

```text
① 3000 被别的程序占了（第 199 节课错误 1）
② 你想同时跑两个版本对比（3000 和 3001）
③ 服务器上 80 端口要给 Nginx（第 31 周）
```

## 2.3 实验二：不写 `-p`

```bash
docker rm -f chat-app
docker run -d --name chat-app chat-app:2.0
docker ps
```

**应该看到：**

```text
CONTAINER ID   IMAGE          COMMAND    CREATED         STATUS         PORTS     NAMES
8f3a2b1c9d4e   chat-app:2.0   "..."      5 seconds ago   Up 4 seconds             chat-app
```

**`PORTS` 那一列是空的。**

**浏览器打开 `localhost:3000`：**

**打不开。**

**但是容器自己访问自己是通的。** 进去看：

```bash
docker exec -it chat-app sh -c "wget -qO- http://localhost:3000 | head -5"
```

**应该输出 HTML 的前几行。**

**为什么：**

**没有 `-p`，容器的端口只在 Docker 内部的虚拟网络里可见。你的 Windows 看不到。**

```text
你的 Windows ──────✗──────→ 容器的 3000
                    （没有 -p，就没有这条通道）
```

**⚠️ 但有一类人会说"不写 -p 也能访问"。** 那是因为他用了 `--network host`（第 6 节会提）。**在 Windows 上 `--network host` 行为和 Linux 不一样，别指望它。**

## 2.4 实验三：`-p 3000`（只有一个数字）

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000 chat-app:2.0
docker port chat-app
```

**应该看到：**

```text
3000/tcp -> 0.0.0.0:49153
```

**`49153` 这个数字是随机的。**

**`-p 3000` 的意思是："容器 3000，宿主端口你随便挑一个。"**

**用途：** 你不想占用固定端口时。**缺点是每次重启端口都变**，你的前端要跟着改，很麻烦。

**实践：一般不用。** 除非你要跑十个一模一样的东西做压测。

## 2.5 只让本机访问

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 127.0.0.1:3000:3000 chat-app:2.0
docker port chat-app
```

**应该看到：**

```text
3000/tcp -> 127.0.0.1:3000
```

**注意变成了 `127.0.0.1:3000`，不是 `0.0.0.0:3000`。**

| 写法 | 谁能访问 |
|---|---|
| `-p 3000:3000` | **同一局域网的所有机器**（同事用你的 IP 也能打开） |
| `-p 127.0.0.1:3000:3000` | 只有这台电脑自己 |

**在公司网络里，`0.0.0.0` 意味着同事能访问你正在开发的、连着测试数据库的应用。** 这不是危言耸听，很多内网渗透的第一步就是这个。

**什么时候用 `127.0.0.1`：**

```text
✅ 本地开发，不想被同事看到
✅ 服务器上跑数据库（第 31 周：-p 127.0.0.1:5432:5432）
❌ 你要用手机连你电脑测试（手机需要走局域网 IP）
```

**⚠️ 第 31 周在服务器上，数据库端口一定要写 `127.0.0.1:5432:5432`，绝不能写 `5432:5432`。**
**写错的后果是：整个互联网都能连你的数据库。** 这在第 31 周会再强调一次。

## 2.6 一张端口映射速查表

| 你写的 | 宿主机端口 | 容器端口 | 谁能访问 |
|---|---|---|---|
| `-p 3000:3000` | 3000 | 3000 | 局域网 |
| `-p 8000:3000` | 8000 | 3000 | 局域网 |
| `-p 127.0.0.1:3000:3000` | 3000 | 3000 | 只有本机 |
| `-p 3000` | 随机 | 3000 | 局域网 |
| 不写 | 无 | 无 | 谁都访问不到（容器内可以） |
| `-p 3000:8000` | 3000 | 8000 | **多半连不上**（容器里没人监听 8000） |

**最后一行是本节最常见的错。** 你代码监听 3000，`-p` 右边写 8000，Docker 会把流量转给容器的 8000 —— 那里什么都没有，连接会被重置。

**浏览器显示：**

```text
ERR_EMPTY_RESPONSE
```

**curl 显示：**

```text
curl: (52) Empty reply from server
```

**"Empty reply"（空回复）这个错，八成就是右边写错了。**

---

# 第 3 步：容器里的 `localhost` 是谁（25 分钟）

## 3.1 这是新手第一大坑

**先做实验。确认容器在跑：**

```bash
docker ps
```

**然后在你的电脑上（**不是**容器里）跑：**

```bash
curl -i http://localhost:3000
```

**应该看到：**

```text
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: text/html; charset=utf-8
...

（HTML 内容）
```

**现在进容器里跑同一条命令：**

```bash
docker exec -it chat-app sh -c "wget -qO- http://localhost:3000 | head -3"
```

**也能通。**

**两边都通，看起来没问题。** 但这不是重点，重点是下面这个实验。

## 3.2 改监听地址，制造那个经典故障

**打开 `chat-app-docker/server.js`，把 `listen` 改成：**

```js
app.listen(3000, "127.0.0.1", () => {
  console.log("Server running at http://127.0.0.1:3000")
})
```

**重新 build、重新跑：**

```bash
docker build -t chat-app:3.0 .
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 chat-app:3.0
```

**容器是 Up 的：**

```bash
docker ps
```

```text
CONTAINER ID   IMAGE          STATUS         PORTS                    NAMES
9c2b1a0f8e7d   chat-app:3.0   Up 5 seconds   0.0.0.0:3000->3000/tcp   chat-app
```

**日志也说它起来了：**

```bash
docker logs chat-app
```

```text
Server running at http://127.0.0.1:3000
```

**但是在你电脑上：**

```bash
curl -i http://localhost:3000
```

**输出：**

```text
curl: (56) Recv failure: Connection reset by peer
```

**浏览器：**

```text
ERR_EMPTY_RESPONSE
```

**容器是 Up，日志正常，端口映射也对，就是打不开。**

**这就是那个坑。**

## 3.3 为什么

**"监听在 `127.0.0.1`"的意思是：只接受来自"我自己这个网络接口"的连接。**

**三个 `127.0.0.1`，三个不同的东西：**

```text
你的 Windows 的 127.0.0.1   →  Windows 自己
容器的 127.0.0.1            →  容器自己（一个独立的网络命名空间）
另一个容器的 127.0.0.1      →  那个容器自己
```

**它们三个都叫 `localhost`，但谁也不是谁。**

**Docker 的端口转发是这样工作的：**

```text
宿主机收到 3000 的连接
  ↓
docker-proxy 把连接转给 容器的 IP（比如 172.17.0.2）:3000
  ↓
容器的 3000 端口说："我只听 127.0.0.1 的，你这个来自 172.17.0.1 的连接我不接"
  ↓
连接被重置 → Connection reset by peer
```

**所以现象是 "reset" 而不是 "refused"。**

```text
refused（拒绝）  = 那个端口上没有程序在听
reset（重置）    = 有程序在听，但它不接受你的连接
empty response   = 连接建立了，但对面一句话不说就关了
```

**这三个错误在排错时含义完全不同：**

| 报错 | 意思 | 一般原因 |
|---|---|---|
| `Connection refused` | 没人监听这个端口 | 程序没起、端口写错、`-p` 右边错 |
| `Connection reset by peer` | 有人监听但不接你 | **监听在 `127.0.0.1`** |
| `Empty reply from server` | 接了但不说话 | 程序崩在处理过程中 |
| `Connection timed out` | 包发出去没回应 | 防火墙、安全组 |

**记住这张表。** 它是容器排错的第一分界线。

## 3.4 正确写法

**改回：**

```js
app.listen(3000, "0.0.0.0", () => {
  console.log("Server running at http://0.0.0.0:3000")
})
```

**`0.0.0.0` 是什么意思：**

**"这台机器上所有网络接口，都听"。**

```text
127.0.0.1        只听本机回环
0.0.0.0          听所有接口（回环 + 局域网 + Docker 虚拟网卡）
192.168.1.5      只听这一张网卡
```

**`0.0.0.0` 有安全含义：** 它意味着"谁都能连"。所以在**你电脑上**开发时，`0.0.0.0` + `-p 3000:3000` 会让同事也能打开。

**但容器里必须写 `0.0.0.0`。** 因为你没法预知 Docker 会给容器分配什么 IP。

**Express 的默认值是什么：**

```js
app.listen(3000)          // 不写第二个参数 = 监听所有接口（等同于 0.0.0.0）
app.listen(3000, "::")    // IPv6 所有接口，通常也包含 IPv4
```

**所以很多项目本来就写对了。** 但只要你哪天为了"安全"手动加了 `"127.0.0.1"`，就会踩这个坑。

**（第 3 周你可能用 AI 生成过这段代码，AI 有时候会"贴心地"加上 `127.0.0.1`。）**

## 3.5 一张"三个 localhost"的表

| 你在哪敲 `curl localhost:3000` | 它实际连的是 | 能不能通 |
|---|---|---|
| 你的 Windows | Windows 的 3000（被 `-p` 转发到容器） | ✅ 如果 `-p` 对且容器监听 `0.0.0.0` |
| 容器里（`docker exec`） | 容器自己的 3000 | ✅ 只要程序在跑 |
| 另一个容器里 | 那个容器自己的 3000 | ❌ 除非那个容器里也跑了服务 |
| 另一个容器里，想访问 `chat-app` | **不能用 localhost** | 用容器名或服务名（第 6 节） |

**最后一行是第 6 节要讲的。** 现在先记住：

```text
localhost 永远指"我自己"。
跨容器访问，要用名字。
```

## 3.6 验证修好了

```bash
docker build -t chat-app:3.1 .
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 chat-app:3.1
curl -i http://localhost:3000
```

**应该看到 `HTTP/1.1 200 OK`。**

> **不懂这个会怎样：** 你会改 Dockerfile、改端口、重装 Docker、搜两小时"docker 端口映射不生效"，**而真正的问题是你代码里那五个字符 `"127.0.0.1"`。**
>
> **判断法：容器 Up + 日志正常 + `docker port` 对 + 打不开 = 先去看监听地址。**

---

# 第 4 步：日志（20 分钟）

## 4.1 最常用的一条

```bash
docker logs chat-app
```

**应该看到：**

```text
Server running at http://0.0.0.0:3000
GET / 200 12ms
GET /style.css 200 3ms
GET /app.js 200 5ms
```

**逐行读：**

| 行 | 是谁打的 |
|---|---|
| `Server running at ...` | 你代码里 `app.listen` 的回调 |
| `GET / 200 12ms` | 你的请求日志中间件（如果有） |

**这些不是你"配置的日志文件"，是程序打到标准输出（stdout）的东西。**

**Docker 把容器的 stdout / stderr 收走，存成一个文件。`docker logs` 就是读那个文件。**

## 4.2 三个必会参数

```bash
docker logs --tail 20 chat-app
```

**只看最后 20 行。** 日志几千行的时候用这个。

```bash
docker logs -f chat-app
```

**`-f` 是 follow，实时滚动。** 你刷新浏览器，终端里立刻多一行。

**退出：`Ctrl + C`。注意：这不会停掉容器。** 它只是停止"看日志"。

```bash
docker logs -t chat-app
```

**每行前面加时间戳：**

```text
2026-11-16T03:21:45.123456789Z Server running at http://0.0.0.0:3000
2026-11-16T03:21:52.987654321Z GET / 200 12ms
```

**`Z` 结尾是 UTC 时间。** 北京时间要 +8 小时。

**组合起来最好用：**

```bash
docker logs -f --tail 50 -t chat-app
```

**意思是：从最后 50 行开始，带时间戳，实时跟。**

**建议把这条记在笔记里。** 这是你以后 90% 场景只需要的那一条。

## 4.3 日志存在哪

**在你电脑上找不到。** 它在 Docker 的存储里（WSL 的虚拟磁盘）。

**看日志文件多大：**

```bash
docker inspect --format '{{.LogPath}}' chat-app
```

**输出类似：**

```text
/var/lib/docker/containers/8f3a.../8f3a...-json.log
```

**这是容器内的路径，你在 Windows 资源管理器里看不到。**

**看它多大：**

```bash
docker ps -s
```

**`-s` 会多两列 `SIZE` 和 `VIRTUAL SIZE`：**

```text
CONTAINER ID   ...   SIZE     VIRTUAL SIZE
8f3a2b1c9d4e   ...   12.3kB   178MB
```

**`SIZE` 是容器的可写层大小（日志也算在里面）。**

## 4.4 ⚠️ 日志会撑爆硬盘

**默认配置下，日志不轮转（不自动删旧的）。**

**你的应用一天打 1GB 日志，一个月就是 30GB，然后 C 盘满了，Docker 起不来。**

**在 `compose.yaml` 或 `docker run` 里限制：**

| 方式 | 写法 |
|---|---|
| `docker run` | `--log-opt max-size=10m --log-opt max-file=3` |
| compose | `logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }` |

**意思是：单个日志文件最大 10MB，最多留 3 个（共 30MB）。**

**现在是本地开发，可以先不管。** 但第 31 周上服务器，**不配这个迟早出事**。

## 4.5 日志为空，怎么办

**容器启动 2 秒就退出了，`docker logs` 什么都没有。**

**这种情况八成是"程序还没来得及输出就崩了"。**

**看退出码：**

```bash
docker ps -a
```

```text
CONTAINER ID   IMAGE          STATUS                     NAMES
8f3a2b1c9d4e   chat-app:3.1   Exited (1) 5 seconds ago   chat-app
```

**`Exited (1)` = 程序自己报错退出。`Exited (0)` = 正常结束（但你的服务不该"正常结束"）。**

**看不到日志的时候，用前台跑：**

```bash
docker run --rm chat-app:3.1
```

**不写 `-d`，输出直接打在你的终端上。**

**或者覆盖 CMD 手动跑：**

```bash
docker run --rm chat-app:3.1 node -e "console.log('node 能跑')"
```

**这条能跑，说明镜像没问题，是你的 `server.js` 有问题。**

**再进一步：**

```bash
docker run --rm chat-app:3.1 sh
```

**进到容器里手动 `node server.js`，报错就完整看到了。**

## 4.6 一个必须知道的事：容器删了，日志就没了

```bash
docker rm chat-app
```

**日志文件跟着容器一起删。**

**因为它在容器的可写层里。**

**所以：**

```text
❌ 出事第一反应 "docker rm 掉重新起" —— 证据没了
✅ 出事第一反应 "docker logs > 现场.log" 再动手
```

**养成这个习惯：**

```bash
docker logs chat-app > crash.log 2>&1
```

**这条命令把 stdout 和 stderr 都存到文件。第 31 周排生产问题时会救命。**

---

# 第 5 步：进容器（20 分钟）

## 5.1 `docker exec`

```bash
docker exec -it chat-app sh
```

**提示符变成：**

```text
/app #
```

**`/app` 是因为 Dockerfile 里设了 `WORKDIR /app`。**

**逐段读：**

| 片段 | 意思 |
|---|---|
| `exec` | 在一个**正在运行**的容器里执行命令 |
| `-i` | 保持输入 |
| `-t` | 分配终端 |
| `chat-app` | 容器名 |
| `sh` | 执行 `sh` 这个程序 |

**为什么是 `sh` 不是 `bash`：**

**`alpine` 镜像里没有 `bash`。** 只有 `sh`（busybox 提供的精简版）。

**试一下就知道了：**

```bash
docker exec -it chat-app bash
```

```text
OCI runtime exec failed: exec failed: unable to start container process:
exec: "bash": executable file not found in $PATH: unknown
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `OCI runtime exec failed` | 容器运行时执行失败 |
| `exec: "bash": executable file not found in $PATH` | **镜像里没有 `bash` 这个程序** |
| `unknown` | 附加信息 |

**这不是 Docker 的问题，是你的镜像太精简。**

**规则：**

```text
node:22-alpine   → 用 sh
node:22-slim     → 有 bash，可以用 bash
node:22          → 有 bash
ubuntu           → 有 bash
```

**`sh` 和 `bash` 的差别（你用得到的部分）：**

```text
bash 能用的：[[ ]] 数组 source 命令 历史记录 上下键
sh 能用的：  [ ] 函数 基本的 && || 管道
```

**你要在容器里敲的都是 `ls`、`cat`、`ps` 这种，`sh` 完全够用。**

## 5.2 进去之后能干什么

**注意：你在容器里的任何修改，`docker rm` 之后就没了。**

**看文件结构：**

```bash
ls -la /app
```

```text
total 48
drwxr-xr-x    1 root     root          4096 Nov 16 03:20 .
drwxr-xr-x    1 root     root          4096 Nov 16 03:20 ..
-rw-r--r--    1 root     root           892 Nov 16 03:20 package.json
drwxr-xr-x   87 root     root          4096 Nov 16 03:20 node_modules
drwxr-xr-x    2 root     root          4096 Nov 16 03:20 public
-rw-r--r--    1 root     root          3102 Nov 16 03:20 server.js
```

**`node_modules` 在这里，说明 `npm ci` 装进去了。**

**看环境变量：**

```bash
env
```

```text
NODE_VERSION=22.22.2
NODE_ENV=production
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOSTNAME=8f3a2b1c9d4e
HOME=/root
```

**`NODE_ENV=production` 是你 Dockerfile 里 `ENV` 设的。**

**⚠️ 这里能看到所有环境变量，包括你的 API key（如果你用 `-e` 传了）。**

**第 4 节会讲这意味着什么。**

**看进程：**

```bash
ps aux
```

```text
PID   USER     TIME  COMMAND
    1 root      0:00 node server.js
   27 root      0:00 sh
   33 root      0:00 ps aux
```

**逐行读：**

| PID | 是什么 |
|---|---|
| `1` | **`node server.js` 是 1 号进程**。它就是容器的主进程 |
| `27` | 你刚 `exec` 进来的 `sh` |
| `33` | 你正在敲的 `ps` |

**`node` 是 PID 1，这是第 198 节课用 `CMD ["node", "server.js"]` 方括号格式的结果。**

**如果 `CMD` 写成 `CMD node server.js`（不用方括号），PID 1 会是 `sh`，`node` 是它的子进程。**

**看端口：**

```bash
netstat -tlnp
```

**alpine 可能没有 `netstat`，用：**

```bash
cat /proc/net/tcp
```

**看不懂就算了。** 用这条更直观（在**宿主机**上跑）：

```bash
docker port chat-app
```

## 5.3 `exec` 和 `attach` 的区别

**另一个命令是 `docker attach chat-app`。**

| | `exec` | `attach` |
|---|---|---|
| 干什么 | **新开一个进程**进容器 | **接到容器的主进程**上 |
| 按 `Ctrl+C` | 只停你那个进程 | **停掉整个容器** |
| 退出方式 | `exit` | `Ctrl+P Ctrl+Q`（很难记） |
| 用途 | 排查、看文件 | 几乎不用 |

**结论：永远用 `exec`。**

**`attach` 最坑的地方是 `Ctrl+C` 会停掉服务。** 你在"看日志"的时候一不小心就把生产服务停了。

## 5.4 不要在容器里改代码

**你可能想：进容器改一下 `server.js` 试试。**

```bash
docker exec -it chat-app sh
vi /app/server.js     # 或者根本没有 vi
```

**三个问题：**

```text
① alpine 里没有 vi / nano（只有 sh 和最基本的工具）
② 改了只在当前容器有效，docker rm 就没了
③ 下次 docker run 从镜像启动，你的改动完全不存在
```

**正确的改代码流程：**

```text
改你电脑上的 server.js
  ↓
docker build -t chat-app:3.2 .
  ↓
docker rm -f chat-app
  ↓
docker run -d --name chat-app -p 3000:3000 chat-app:3.2
```

**四步。** 有点烦，但这是"镜像不可变"的代价。

**第 5 节会讲 bind mount，可以把本地目录挂进容器，改完刷新就生效。** 那是开发时的做法，**生产环境不用**。

## 5.5 复制文件进出

**从容器里拿出来：**

```bash
docker cp chat-app:/app/package.json ./package-from-container.json
```

**从外面放进去：**

```bash
docker cp ./test.txt chat-app:/app/test.txt
```

**用途：**

```text
① 容器里有个日志/数据库文件，想拿出来看
② 想对比"容器里的 package.json"和"我电脑上的"是不是一份
```

**`docker cp` 对**正在运行**和**已停止**的容器都能用。**

---

# 第 6 步：容器的四种状态（20 分钟）

## 6.1 状态机

```text
       docker run
          ↓
      ┌────────┐
      │ running│ ←──── docker start ────┐
      └────────┘                        │
          │ docker stop                 │
          ↓                             │
      ┌────────┐                        │
      │ exited │ ───────────────────────┘
      └────────┘
          │ docker rm
          ↓
       删除（不可恢复）
```

**只有四个动作：** `run` / `stop` / `start` / `rm`。

## 6.2 逐个验证

```bash
docker stop chat-app
```

**应该输出容器名：**

```text
chat-app
```

**看状态：**

```bash
docker ps -a
```

```text
CONTAINER ID   IMAGE          STATUS                        NAMES
8f3a2b1c9d4e   chat-app:3.1   Exited (0) 3 seconds ago      chat-app
```

**`Exited (0)`：`docker stop` 是"优雅停止"，程序正常退出，退出码 0。**

**重新启动：**

```bash
docker start chat-app
docker ps
```

```text
STATUS
Up 2 seconds
```

**注意：`docker start` 不会重新 build，也不会读新的镜像。它就是"把上次那个容器再跑起来"。**

**所以：**

```text
`docker start` 之后，代码还是上次 build 的那份。
你改了代码 → 必须 build + run（新建容器），不是 start。
```

**这就是 0.2 里第 ⑤ 条那个坑。**

## 6.3 `stop` 和 `kill` 的区别

```bash
docker stop chat-app
```

**做了什么：**

```text
① 给容器的主进程发 SIGTERM（"请你退出"）
② 等 10 秒
③ 如果还没退，发 SIGKILL（"立刻死"）
```

**那 10 秒很重要。** 你的程序如果正在写文件、处理请求，它有 10 秒收尾。

```bash
docker kill chat-app
```

**直接 SIGKILL，不给收尾机会。**

**什么时候用 `kill`：**

```text
① 容器卡死了，stop 十秒也没用
② 你在做实验，不在乎数据
```

**什么时候绝不能用：**

```text
❌ 数据库容器正在写数据的时候
❌ 生产环境
```

**改超时时间：**

```bash
docker stop -t 30 chat-app
```

**给 30 秒。**

## 6.4 退出码速查

| 退出码 | 意思 | 常见原因 |
|---|---|---|
| `0` | 正常退出 | `docker stop`；或者程序跑完了 |
| `1` | 程序报错 | 代码异常、`Cannot find module`、端口占用 |
| `125` | Docker 自己出错 | `docker run` 参数写错 |
| `126` | 命令不可执行 | 权限问题 |
| `127` | 命令不存在 | `CMD` 里写的程序镜像里没有 |
| `137` | 被 SIGKILL | **`kill -9`，或者内存超限被系统杀** |
| `143` | 被 SIGTERM | `docker stop` 十秒后仍在跑，被强杀 |

**看退出码：**

```bash
docker inspect --format '{{.State.ExitCode}}' chat-app
```

```text
0
```

**`137` 的排查：**

```text
如果是内存超了：docker inspect 看 .State.OOMKilled
docker inspect --format '{{.State.OOMKilled}}' chat-app
true   ← 被 OOM 杀了
```

**`OOMKilled: true` 说明内存不够。** 你的 Node 进程吃掉了几 GB，被系统杀了。

**这个在第 31 周 2 核 2G 的服务器上很常见**（`npm install` 或者大 JSON 处理）。

## 6.5 `--restart` 策略的实际效果

**做个实验，让容器自己崩掉：**

```bash
docker rm -f chat-app
docker run -d --name chat-app --restart unless-stopped -p 3000:3000 chat-app:3.1
docker exec chat-app kill 1
```

**`kill 1` 杀掉容器里的 1 号进程。**

**等几秒，再看：**

```bash
docker ps
```

**应该看到：**

```text
CONTAINER ID   IMAGE          STATUS                 NAMES
8f3a2b1c9d4e   chat-app:3.1   Up 3 seconds           chat-app
```

**它自己起来了。`STATUS` 的秒数重新从 0 开始。**

**为什么：**

`--restart unless-stopped` 让 Docker 在容器退出后自动重启。

**这个能力很重要，但有个前提：**

```text
程序崩了 → 自动重启 → 又崩 → 又重启 → 死循环
```

**`docker ps` 里会看到 `Restarting (1) 5 seconds ago`，一直在重启。**

**那就是"代码有 bug，重启一万次也没用"。** 看日志去。

**看重启次数：**

```bash
docker inspect --format '{{.RestartCount}}' chat-app
```

## 6.6 清理

**今天做完，把容器删掉，避免占端口：**

```bash
docker stop chat-app
docker rm chat-app
```

**或者：**

```bash
docker rm -f chat-app
```

**⚠️ 别用 `docker rm -f $(docker ps -aq)`。** 那会删掉你所有容器，包括别的实验。

**要批量清理已停止的：**

```bash
docker container prune
```

---

# 第 7 步：故意犯七个错（25 分钟）

## 错误 1：端口被占用

**操作：** 你电脑上已经有别的东西在用 3000（比如上次没删的容器，或者 `npm run dev`）。

```bash
docker run -d --name chat-app -p 3000:3000 chat-app:3.1
```

**会怎样：**

```text
docker: Error response from daemon: Ports are not available: exposing port
TCP 0.0.0.0:3000 -> 0.0.0.0:0: listen tcp 0.0.0.0:3000: bind:
Only one usage of each socket address (protocol/network address/port)
is normally permitted.
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `Ports are not available` | 端口不可用 |
| `exposing port TCP 0.0.0.0:3000` | 想占用宿主机 3000 |
| `bind: Only one usage of each socket address` | **这个端口已经被别人绑了** |
| `is normally permitted` | 直译："通常只允许一次绑定" |

**为什么：**

**一个端口同一时间只能被一个程序监听。**

**怎么查谁占了：**

```powershell
# PowerShell
netstat -ano | findstr :3000
```

**输出：**

```text
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
```

**最后一列 `12345` 是 PID。**

```powershell
tasklist | findstr 12345
```

**会告诉你是什么程序。**

**或者直接用 Docker 的视角查：**

```bash
docker ps --filter "publish=3000"
```

**如果输出一个容器，说明是你自己的旧容器。**

**怎么修：**

```bash
# 如果是旧容器
docker rm -f <那个容器>

# 或者换个宿主端口
docker run -d --name chat-app -p 3001:3000 chat-app:3.1
```

**换个端口是最省事的。** 别去纠结"谁占了 3000"，**在开发机上 3000 被占是常态。**

## 错误 2：监听 `127.0.0.1`，打不开

**操作：** 第 3 步已经做过了。这里再走一遍完整链路。

**会怎样：**

```bash
curl -i http://localhost:3000
```

```text
curl: (56) Recv failure: Connection reset by peer
```

**浏览器：`ERR_EMPTY_RESPONSE`。**

**为什么：** 见 3.3。

**怎么查（三步定位）：**

```bash
# ① 容器活着吗
docker ps
# ② 端口映射对吗
docker port chat-app
# ③ 容器内部自己通吗
docker exec -it chat-app sh -c "wget -qO- http://localhost:3000 | head -1"
```

**如果 ①② 都对，③ 也通，但外面不通 —— 就是监听地址的问题。**

**怎么修：**

```js
app.listen(3000, "0.0.0.0")
```

**然后 build + run。**

## 错误 3：端口映射左右写反

**操作：** 你的代码监听 3000，但写成：

```bash
docker run -d --name chat-app -p 3000:8000 chat-app:3.1
```

**会怎样：**

```bash
curl -i http://localhost:3000
```

```text
curl: (52) Empty reply from server
```

**浏览器：`ERR_EMPTY_RESPONSE`。**

**为什么：**

Docker 把宿主 3000 的流量，转给容器的 **8000**。

**容器里没人在 8000 上监听。** Docker 的转发机制接受了连接，但转过去没人接，连接被关掉 → "空回复"。

**注意：这里不是 `Connection refused`。** 因为宿主 3000 确实有人在听（是 Docker 在听），所以不是拒绝。**这个细节能帮你少走弯路。**

**怎么查：**

```bash
docker port chat-app
```

```text
8000/tcp -> 0.0.0.0:3000
```

**左边是容器的端口，写着 8000。** 而你的代码监听 3000。**对不上。**

**怎么修：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 chat-app:3.1
```

**记法再强调一次：`-p 左边:右边`，右边永远等于你代码里 `listen` 的端口。**

## 错误 4：`exec` 进一个停了的容器

**操作：**

```bash
docker stop chat-app
docker exec -it chat-app sh
```

**会怎样：**

```text
Error response from daemon: container 8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1 is not running
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `Error response from daemon` | 引擎返回的错误 |
| `container 8f3a...` | 那个容器 |
| `is not running` | **没在运行** |

**为什么：**

**`exec` 是"在一个活着的容器里新开一个进程"。容器死了，没有"活着的进程空间"可用。**

**这不是 bug，这是定义。**

**怎么修：**

```bash
docker start chat-app
docker exec -it chat-app sh
```

**或者一步进去看它为什么死的：**

```bash
docker logs chat-app
```

## 错误 5：alpine 里没有 `bash`

**操作：**

```bash
docker exec -it chat-app bash
```

**会怎样：**

```text
OCI runtime exec failed: exec failed: unable to start container process:
exec: "bash": executable file not found in $PATH: unknown
```

**为什么：**

`node:22-alpine` 基于 alpine，alpine 为了小，只带 busybox 的 `sh`。

**怎么查你的镜像里有什么 shell：**

```bash
docker run --rm chat-app:3.1 sh -c "ls -l /bin/ | head -20"
```

**会看到 `sh`，没有 `bash`。**

**怎么修：**

```bash
docker exec -it chat-app sh
```

**如果你确实需要 `bash`（比如要跑某个脚本）：**

```dockerfile
RUN apk add --no-cache bash
```

**但没必要。** 装进去镜像变大，而且你只是想在容器里 `ls` 一下。

## 错误 6：容器起来就退出，日志空白

**操作：** 故意把 `CMD` 写成一个不存在的文件：

```dockerfile
CMD ["node", "server.js"]
```

**但你删了 `server.js`（或者改名了）。**

**会怎样：**

```bash
docker ps
```

```text
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

**空的。**

```bash
docker ps -a
```

```text
STATUS
Exited (1) 3 seconds ago
```

```bash
docker logs chat-app
```

**什么都没有。**

**为什么：**

Node 启动时找不到模块，错误打到 stderr。**理论上 `docker logs` 能看到。**

**但如果错误发生在 Docker 接管 stdout 之前（比如 `ENTRYPOINT` 脚本自己就崩了），就什么都抓不到。**

**怎么查（三招）：**

```bash
# ① 前台跑，直接看
docker run --rm chat-app:3.1

# ② 看完整 inspect
docker inspect --format '{{.State.ExitCode}} {{.State.Error}}' chat-app

# ③ 绕过 CMD，手动跑
docker run --rm chat-app:3.1 sh -c "ls -la /app && node server.js"
```

**第 ③ 招最好用。** 它先用 `ls` 确认文件在不在，再跑 node，报错完整显示。

**怎么修：**

**如果 `ls` 显示 `server.js` 不在 `/app`，那是第 198 节课的 `COPY` / 路径问题。**

**纠正 `CMD` 的路径，或者修正 `COPY`。**

## 错误 7：容器名重复

**操作：** 你已经有一个叫 `chat-app` 的容器，又 run 一次。

```bash
docker run -d --name chat-app -p 3000:3000 chat-app:3.1
```

**会怎样：**

```text
docker: Error response from daemon: Conflict. The container name "/chat-app"
is already in use by container "8f3a2b1c9d4e...".
You have to remove (or rename) that container to be able to reuse that name.
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `Conflict` | 冲突 |
| `The container name "/chat-app" is already in use` | **这个名字已经被占了** |
| `by container "8f3a..."` | 被这个容器占的 |
| `You have to remove (or rename) that container` | 删掉或改名 |

**为什么：**

**容器名必须唯一。** 因为它被用来做 DNS 名字（第 6 节会用到）。

**怎么修（三种）：**

```bash
# ① 删掉旧的（推荐，实验环境）
docker rm -f chat-app

# ② 换个名字
docker run -d --name chat-app-v2 -p 3001:3000 chat-app:3.1

# ③ 找出来看看是什么
docker ps -a --filter "name=chat-app"
```

**最常见的原因：** 你上一个容器还在跑，你以为已经删了。

**养成习惯：每次 `docker run --name` 之前先 `docker ps -a`。**

---

# 第 8 步：写学习笔记（10 分钟）

**打开 `第03节课/02-笔记/NOTES.md` 填。**

**这一节重点填三处：**

```text
① 我的容器 PORTS 那一列，左边和右边分别是多少
② 我把监听改成 127.0.0.1 之后，curl 报的是什么（原文）
③ 我在容器里 ps aux，PID 1 是什么
```

**第 ② 条特别重要。** 那是"reset"和"refused"的区别，是你以后排错的第一判断。

---

# 第 9 步：课后练习

## 练习一：同时跑两个版本

**要求：**

1. 用 `chat-app:3.0` 起一个容器，名字 `app-a`，宿主端口 3000；
2. 用 `chat-app:3.1` 起一个容器，名字 `app-b`，宿主端口 3001；
3. 浏览器同时打开两个地址。

**记录：** 两个页面的区别（你可以故意在两个版本的页面标题里放不同文字）。

**思考：如果两个容器都监听容器的 3000，为什么还能同时跑？**

**提示：想想第 2 步的"左边右边"。**

## 练习二：制造 137

**要求：**

1. 起一个容器，限制内存 32MB：

   ```bash
   docker run -d --name oom-test --memory=32m chat-app:3.1
   ```

2. 等几秒，看状态；
3. `docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' oom-test`。

**记录：** 输出是什么。

**思考：Node 加 Express 启动本身就要几十 MB，32MB 会怎样？如果是 2 核 2G 的服务器跑数据库 + Node，内存不够时会是什么现象？**

## 练习三：把日志导出来

**要求：**

1. 起容器，浏览器刷新 10 次；
2. `docker logs chat-app > app.log 2>&1`；
3. 打开 `app.log`，数一共几行；
4. `docker logs --tail 3 -t chat-app`。

**记录：** 两种输出各贴一段。

**思考：为什么 `docker rm` 之后 `app.log` 还在，但 `docker logs` 没东西了？**

## 练习四：在容器里找你的代码

**要求：**

1. `docker exec -it chat-app sh`；
2. 依次敲：`pwd`、`ls -la`、`cat package.json`、`ps aux`、`env`；
3. 找到 `node_modules` 有多少个目录：

   ```bash
   ls node_modules | wc -l
   ```

**记录：** 五个命令的输出各一行关键内容，以及 `node_modules` 的目录数。

**思考：这个 `node_modules` 是你 Windows 里那份吗？如果不是，是哪来的？**

## 练习五：写一份「打不开」排查清单

**要求：** 不看课件，写一张你自己的排查表，按顺序列。

必须覆盖：

```text
容器活着吗
端口映射对吗（左边右边）
容器内部通吗
监听地址对不对
程序有没有报错
```

**记录：** 每一条对应哪条命令。

**思考：为什么"先查容器内部通不通"能一下子把问题范围缩小一半？**

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清 `-p 3000:3000` 左边右边分别是什么
- [ ] 我知道容器里的 `localhost` 指容器自己
- [ ] 我知道 `0.0.0.0` 和 `127.0.0.1` 的区别，以及为什么容器里必须用前者
- [ ] 我知道 `docker logs` 读的是容器的 stdout，不是某个日志文件
- [ ] 我知道容器删了日志和可写层一起没

## B. 实操

- [ ] 我能用一条完整命令起容器（`-d --name -p --restart`）
- [ ] 我会用 `docker port` / `docker ps` 的 PORTS 列
- [ ] 我会用 `docker logs -f --tail 50 -t`
- [ ] 我会 `docker exec -it <名字> sh` 并找到代码文件
- [ ] 我会 `docker cp` 从容器拿文件
- [ ] 我会 `stop` / `start` / `rm`，知道 `start` 不会更新代码

## C. 排错

- [ ] `Connection refused` / `reset` / `Empty reply` 三个错我能区分
- [ ] 端口被占我能用 `docker ps --filter "publish=3000"` 找到
- [ ] 容器名重复我知道要 `rm -f` 或换名字
- [ ] `Exited (137)` 我知道去查 `OOMKilled`
- [ ] `exec` 报 `is not running` 我知道先 `start`

## D. 交付

- [ ] 有一个 `chat-app` 容器能起来，页面能打开
- [ ] 我知道它的容器 ID、镜像标签、端口映射
- [ ] `命令记录.md` 里贴了 7 条以上真实输出

## E. 笔记

- [ ] 三个概念都用自己的话写了
- [ ] 「reset / refused / empty」那张表填了
- [ ] 「我卡在哪」有真实报错

## 本节课要能说出口的一句话

> **容器里的 `localhost` 只是它自己；端口映射左边是你电脑、右边是容器；容器打不开时，先分清是"没人听""不接你"还是"接了不说话"。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `Ports are not available ... bind` | 宿主端口被占 | `docker ps --filter publish=3000`；换端口 |
| `Conflict. The container name ... already in use` | 名字重复 | `docker rm -f 名字` 或换名字 |
| `is not running`（exec） | 容器停了 | `docker start` 再 `exec` |
| `exec: "bash": not found` | alpine 没有 bash | 用 `sh` |
| 浏览器 `ERR_EMPTY_RESPONSE` + `curl (56) reset` | 监听 `127.0.0.1` | 改 `0.0.0.0` |
| 浏览器 `ERR_EMPTY_RESPONSE` + `curl (52) empty reply` | `-p` 右边端口错 | 改成代码真实端口 |
| `curl (7) Connection refused` | 宿主端口没人听 | 检查 `-p` 有没有写、容器在不在 |
| 连接超时 | 防火墙 / 安全组（服务器上） | 第 31 周讲 |
| 容器 `Up` 但页面是旧的 | 没重新 build，或 `start` 了旧容器 | `build` + `rm` + `run` |
| `Exited (0)` | 正常结束 | 你的服务不该结束，看 `CMD` |
| `Exited (1)` | 程序报错 | `docker logs`；前台 `docker run --rm` |
| `Exited (137)` | 被 SIGKILL / OOM | `docker inspect .State.OOMKilled` |
| `Restarting (1) ...` | 一直在崩一直在重启 | 先 `--restart no` 起，看日志 |
| `docker logs` 空 | 崩在输出前 | `docker run --rm 镜像 sh` 手动跑 |
| 日志越积越大 | 没配轮转 | `--log-opt max-size=10m` |
| `docker stop` 很慢 | 程序不响应 SIGTERM，等 10 秒 | 检查信号处理；或 `-t 5` |
| 容器里改的文件没了 | 可写层随 `rm` 删除 | 正常；要持久化用卷（第 5 节） |
| `exec` 进去看不到 `node_modules` | 镜像 build 有问题 | `ls /app` 确认 |
