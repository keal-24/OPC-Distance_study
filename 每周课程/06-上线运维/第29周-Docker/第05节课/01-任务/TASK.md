# 第 201 节课：数据卷——为什么容器一删数据就没了

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 200 节课你把 key 从外面注进容器了。但还有一样东西没解决：**容器里的数据**。
> 今天做一个实验，让你亲眼看到 `docker rm` 之后数据没了，然后用两种方式把它救回来。

**建议用时**：110 分钟
**你需要先完成**：第 200 节课。具体要求：`chat-app` 容器能用 `--env-file` 跑起来，业务通；`.env` 确认不在镜像里。

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
docker build        做镜像
docker run -d       起容器
--env-file          注配置
docker logs / exec  看日志、进容器
```

**你的容器现在能跑、能配。但它存不住东西。**

**你现在如果往 `data/messages.json` 里写一条消息，`docker rm` 之后那条消息就没了。**

## 0.2 你以后会遇到什么

```text
① "我重新部署了一次，用户的历史消息全没了"
② "数据库容器重启之后，表都不见了"
③ "我在容器里改代码，改完刷新就没了"
④ "想备份数据，不知道从哪拷"
⑤ "为什么容器里的 node_modules 突然不见了"
```

**第 ① 条是最惨的：不是报错，是数据静默消失。** 用户不骂你打不开，用户骂你"我的记录呢"。

## 0.3 今天要建立的三个概念

```text
① 可写层 —— 容器自己那一层，读写都在这里，docker rm 就没了
② volume（命名卷）—— Docker 管的一块硬盘，和容器生命周期分开
③ bind mount（绑定挂载）—— 把宿主机的一个目录直接映射进容器
```

**一句话区分 ② 和 ③：**

```text
volume     ：Docker 帮你找地方存，你只知道一个名字
bind mount ：你指定路径，Docker 照着挂
```

## 0.4 今天的交付物

| 产出 | 位置 | 内容 |
|---|---|---|
| `chat-data` 卷 | Docker 里 | 存 `messages.json`，活过 `docker rm` |
| `data/` 目录绑定 | `chat-app-docker/data` | 改宿主机文件，容器立刻看到 |
| 一份备份文件 | `第05节课/03-练习代码/` | 用 tar 从卷里导出来的 |
| 笔记 | `NOTES.md` | 两种挂载的对比和报错 |

---

# 第 1 步：先复现"数据没了"（20 分钟）

## 1.1 看一眼你的数据结构

**你的 `chat-app` 大概是这样存数据的：**

```js
const DATA_FILE = "./data/messages.json"

function saveMessages(messages) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2))
}
```

**数据在 `/app/data/messages.json` 里。**

**注意：`data/` 在你第 198 节课的 `.dockerignore` 里被排除了。**

```text
# .dockerignore
data
```

**所以镜像里根本没有 `data/` 目录。**

**你的代码如果没做"目录不存在就创建"，启动就会报错。**

**先检查一下：**

```bash
grep -n "mkdir" server.js
```

**如果没有，加上：**

```js
if (!fs.existsSync("./data")) fs.mkdirSync("./data", { recursive: true })
```

**为什么镜像里没有 `data/` 是"对的"：**

```text
data 是运行时产生的，不是代码
它不该被打进镜像（否则每次部署都带着上次的测试数据）
它应该在容器外面，由卷提供
```

## 1.2 在容器里写一条数据

**先起容器（不带任何挂载）：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
```

**确认它在跑：**

```bash
docker ps
```

**现在往数据文件里写点东西：**

```bash
docker exec chat-app sh -c 'mkdir -p /app/data && echo "{\"msg\":\"这是第一条\"}" > /app/data/messages.json'
```

**验证写进去了：**

```bash
docker exec chat-app cat /app/data/messages.json
```

**应该看到：**

```text
{"msg":"这是第一条"}
```

**也可以从外面看：**

```bash
docker exec chat-app ls -l /app/data
```

```text
total 4
-rw-r--r--    1 root     root            28 Nov 16 03:40 messages.json
```

## 1.3 删掉容器，再起一个

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
docker exec chat-app ls -l /app/data
```

**会怎样：**

```text
ls: /app/data: No such file or directory
```

**不只是文件没了，整个 `data/` 目录都没了。**

**再试一次：**

```bash
docker exec chat-app cat /app/data/messages.json
```

```text
cat: can't open '/app/data/messages.json': No such file or directory
```

**逐段读这个报错：**

| 段 | 意思 |
|---|---|
| `cat: can't open` | 打不开 |
| `/app/data/messages.json` | 这个路径 |
| `No such file or directory` | **文件（甚至目录）不存在** |

**你刚才写的那条消息，永久消失了。**

**而且没有任何警告。** Docker 不会问你"确定要删数据吗"。

## 1.4 为什么

**回到第 197 节课那张图：**

```text
┌─────────────────────────────┐
│  可写层（容器自己的）        │  ← 你写的 data/ 在这里
├─────────────────────────────┤
│  镜像层（只读）              │  ← server.js、node_modules 在这
└─────────────────────────────┘
```

**`docker rm` 删的是什么：**

```text
它把"可写层"整个删掉
镜像层不动（那是共享的）
```

**所以：**

```text
容器里新建的文件 → 在可写层 → docker rm 就没了
镜像里原有的文件 → 在镜像层 → 一直在（但改了也写在可写层，一样会丢）
```

**这就是"容器是无状态的"这句话的真实含义。**

**"无状态"不是"没有数据"，是"不负责保存数据"。**

## 1.5 `docker diff`：看可写层被改了哪些

**再起一个容器，改点东西，然后看：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
docker exec chat-app sh -c 'mkdir -p /app/data && echo hello > /app/data/a.txt && echo x >> /app/server.js'
docker diff chat-app
```

**应该看到：**

```text
C /app
A /app/data
A /app/data/a.txt
C /app/server.js
```

**逐行读：**

| 前缀 | 意思 |
|---|---|
| `A` | Added，新增 |
| `C` | Changed，修改 |
| `D` | Deleted，删除 |

**`C /app` 是因为里面多了 `data` 目录（目录的元信息变了）。**

**这张 diff 就是"可写层里有什么"的完整清单。**

**`docker rm` 一删，这一整张表全没。**

**这就是为什么数据库容器必须挂卷。**

---

# 第 2 步：volume（命名卷）（25 分钟）

## 2.1 一条命令挂上去

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env \
  -v chat-data:/app/data \
  chat-app:3.1
```

**`-v chat-data:/app/data` 的意思是：**

```text
chat-data      卷的名字（不存在会自动创建）
:              分隔符
/app/data      容器里的路径
```

**看卷列表：**

```bash
docker volume ls
```

**应该看到：**

```text
DRIVER    VOLUME NAME
local     chat-data
```

**看这个卷的详情：**

```bash
docker volume inspect chat-data
```

**应该看到：**

```json
[
  {
    "CreatedAt": "2026-11-16T03:45:12Z",
    "Driver": "local",
    "Labels": null,
    "Mountpoint": "/var/lib/docker/volumes/chat-data/_data",
    "Name": "chat-data",
    "Options": null,
    "Scope": "local"
  }
]
```

**逐字段读：**

| 字段 | 意思 |
|---|---|
| `CreatedAt` | 卷是什么时候创建的 |
| `Driver: local` | 存在本机硬盘上 |
| `Mountpoint` | **卷在 Docker 内部的真实路径**（在 WSL 里，Windows 资源管理器看不到） |
| `Scope: local` | 只在这台机器上 |

**`Mountpoint` 那个路径你打不开。** 想访问卷里的文件，只能通过容器（或者下面 2.5 的备份方法）。

## 2.2 写数据，再删容器

```bash
docker exec chat-app sh -c 'mkdir -p /app/data && echo "{\"msg\":\"活过 rm\"}" > /app/data/messages.json'
docker exec chat-app cat /app/data/messages.json
```

```text
{"msg":"活过 rm"}
```

**现在删掉容器：**

```bash
docker rm -f chat-app
```

**卷还在吗：**

```bash
docker volume ls
```

```text
DRIVER    VOLUME NAME
local     chat-data
```

**还在。** 因为卷和容器的生命周期是分开的。

**重新起容器，挂同一个卷：**

```bash
docker run -d --name chat-app -p 3000:3000 --env-file .env \
  -v chat-data:/app/data \
  chat-app:3.1
docker exec chat-app cat /app/data/messages.json
```

**应该看到：**

```text
{"msg":"活过 rm"}
```

**数据回来了。**

**这就是今天最重要的一个实验。** 做成了，你以后部署就不会丢数据。

## 2.3 卷的四个命令

| 命令 | 干什么 |
|---|---|
| `docker volume ls` | 列出所有卷 |
| `docker volume create 名字` | 手动创建（一般不用，`-v` 会自动建） |
| `docker volume inspect 名字` | 看详情（挂载点、创建时间） |
| `docker volume rm 名字` | 删除（**卷内数据一起删**） |

**`docker volume create` 什么时候用：**

```text
① 想先建好卷，设置标签
② 想确认卷名没写错（避免 2.4 那个坑）
```

```bash
docker volume create chat-data
```

**输出卷名：**

```text
chat-data
```

## 2.4 ⚠️ 卷名拼错 = 新建一个空卷

**这是最隐蔽的一个坑。**

```bash
docker run -d --name chat-app -v chat_data:/app/data chat-app:3.1
```

**你写的是 `chat_data`（下划线），但原来的卷叫 `chat-data`（连字符）。**

**Docker 不会报错。它会新建一个叫 `chat_data` 的空卷。**

**然后你发现：**

```text
数据没了！
```

**其实数据好好的，在 `chat-data` 里，只是你没挂它。**

**怎么查：**

```bash
docker volume ls
```

```text
DRIVER    VOLUME NAME
local     chat-data
local     chat_data      ← 多了一个空的
```

**两个卷，一个有你数据，一个是空的。**

**怎么避免：**

```text
① 卷名统一用连字符（chat-data）
② 重要操作前先 docker volume ls 看一眼
③ 用 compose（第 6 节），卷名写在 yaml 里，不容易打错
```

## 2.5 从卷里导出数据（备份）

**卷在 WSL 里，你打不开。但你不需要打开它 —— 用一个临时容器挂上去，打包出来。**

```bash
mkdir -p ./backup
docker run --rm \
  -v chat-data:/data \
  -v "${PWD}/backup:/backup" \
  alpine tar czf /backup/chat-data-backup.tar.gz -C /data .
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `--rm` | 跑完就删这个临时容器 |
| `-v chat-data:/data` | 把卷挂到临时容器的 `/data` |
| `-v "${PWD}/backup:/backup"` | 把**你电脑上的** `backup/` 挂到容器的 `/backup` |
| `alpine` | 用一个只有 5MB 的小镜像 |
| `tar czf /backup/xxx.tar.gz -C /data .` | 把 `/data` 打包压缩到 `/backup/` 里 |

**`-C /data .` 是什么：**

`tar` 先 `cd /data`，然后打包 `.`（当前目录所有内容）。

**不加 `-C` 的话，包里的路径会是 `/data/xxx` 这种绝对路径，解压会出问题。**

**应该输出什么：** 什么都不输出（`tar` 安静是好事）。

**检查备份文件：**

```bash
ls -lh backup/
```

```text
total 4.0K
-rw-r--r-- 1 you 197609 143 Nov 16 03:52 chat-data-backup.tar.gz
```

**看包里有什么：**

```bash
tar tzf backup/chat-data-backup.tar.gz
```

```text
./
./messages.json
```

**恢复：**

```bash
docker run --rm \
  -v chat-data:/data \
  -v "${PWD}/backup:/backup" \
  alpine sh -c "tar xzf /backup/chat-data-backup.tar.gz -C /data"
```

**验证：**

```bash
docker exec chat-app cat /app/data/messages.json
```

**⚠️ 恢复会覆盖同名文件。** 生产环境恢复前先备份当前状态。

## 2.6 卷什么时候会被删

| 动作 | 卷会没吗 |
|---|---|
| `docker rm 容器` | ❌ 不会 |
| `docker rm -f 容器` | ❌ 不会 |
| `docker stop` | ❌ 不会 |
| `docker volume rm 名字` | ✅ 会（有容器在用时拒绝） |
| `docker volume prune` | ✅ **会删所有没被使用的卷** |
| `docker system prune -a` | ⚠️ **默认不删卷，加 `--volumes` 才删** |
| `docker compose down` | ❌ 不会 |
| `docker compose down -v` | ✅ **会** |

**⚠️ `docker volume prune` 这一条最危险：**

```text
它会删掉所有"当前没有容器在用"的卷
包括你昨天停掉的数据库容器的数据
```

**它也会问你确认：**

```text
WARNING! This will remove all local volumes not used by at least one container.
Are you sure you want to continue? [y/N]
```

**看清楚再敲 `y`。**

**⚠️ `docker compose down -v` 在第 6 节会用到。** 多一个 `-v`，数据库回到出厂状态。**这是这一周最容易造成真实数据损失的命令。**

---

# 第 3 步：bind mount（绑定挂载）（25 分钟）

## 3.1 把本地目录挂进去

**先准备目录：**

```bash
mkdir -p data
echo '{"msg":"来自宿主机"}' > data/messages.json
```

**起容器：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env \
  -v "$(pwd)/data:/app/data" \
  chat-app:3.1
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `-v` | 挂载 |
| `"$(pwd)/data"` | **你电脑上的绝对路径**（`pwd` 是当前目录） |
| `:` | 分隔 |
| `/app/data` | 容器里的路径 |

**`$(pwd)` 是 Git Bash 的写法。** PowerShell 用 `${PWD}`，cmd 用 `%cd%`。

**验证：**

```bash
docker exec chat-app cat /app/data/messages.json
```

```text
{"msg":"来自宿主机"}
```

**它读到了你电脑上的文件。**

## 3.2 双向同步

**从容器写，宿主机立刻能看到：**

```bash
docker exec chat-app sh -c 'echo "{\"msg\":\"来自容器\"}" > /app/data/messages.json'
cat data/messages.json
```

```text
{"msg":"来自容器"}
```

**从宿主机改，容器立刻能看到：**

```bash
echo '{"msg":"又改了一次"}' > data/messages.json
docker exec chat-app cat /app/data/messages.json
```

```text
{"msg":"又改了一次"}
```

**这就是 bind mount 和 volume 最大的区别：**

```text
volume     ：你不知道文件在哪，只能用容器访问
bind mount ：文件就在你电脑上那个目录，随便用 VS Code 改
```

**没有"同步"，是同一个目录。** 你在宿主机改的，容器看到的就是改后的 —— 因为它们看的是同一块硬盘。

## 3.3 开发时的经典用法：挂源码

**改一行代码要 build 一次，太慢。开发时可以把源码挂进去：**

```bash
docker rm -f chat-app
docker run -d --name chat-app-dev -p 3000:3000 --env-file .env \
  -v "$(pwd):/app" \
  -v /app/node_modules \
  chat-app:3.1 \
  node --watch server.js
```

**逐段读：**

| 片段 | 干什么 |
|---|---|
| `-v "$(pwd):/app"` | **把整个项目目录挂到 `/app`**，覆盖镜像里的 |
| `-v /app/node_modules` | **匿名卷**，保护容器里的 `node_modules` 不被覆盖（见 3.4） |
| `node --watch server.js` | 覆盖 `CMD`，用 watch 模式，改文件自动重启 |

**现在改 `server.js`，保存，看日志：**

```bash
docker logs -f chat-app-dev
```

```text
Restarting 'server.js'
Server running at http://0.0.0.0:3000
```

**不用 build 了。**

**⚠️ 这是开发用法，绝不能上生产：**

```text
① 依赖你电脑上的文件，换台机器就没了
② 你电脑上的 node_modules 可能和 Linux 不兼容
③ 镜像里装好的依赖被覆盖掉，行为不确定
```

**生产环境：代码必须在镜像里，只有数据用卷。**

## 3.4 ⚠️ 挂 `.` 会盖掉 `node_modules`

**如果你只写：**

```bash
-v "$(pwd):/app"
```

**会怎样：**

```bash
docker logs chat-app-dev
```

```text
node:internal/modules/cjs/loader:1215
  throw err;
  ^

Error: Cannot find module 'express'
Require stack:
- /app/server.js
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Cannot find module 'express'` | 找不到 express |
| `Require stack: - /app/server.js` | 是 `/app/server.js` 要的 |

**为什么：**

**挂载是"覆盖"，不是"合并"。**

```text
镜像里的 /app          →  有 node_modules（Linux 版）
你电脑上的 /app        →  也有 node_modules（Windows 版，而且被 .dockerignore 排掉了）
挂上去之后            →  容器里看到的是你电脑上那份
```

**你电脑上的 `node_modules` 是 Windows 的二进制，在 Linux 容器里用不了。**

**或者你根本没有（被 `.dockerignore` 排除了），那就是空的。**

**解法（3.3 已经用了）：**

```bash
-v "$(pwd):/app" -v /app/node_modules
```

**`-v /app/node_modules` 是一个"匿名卷"，它的作用是：**

```text
在 /app/node_modules 这个点上，不要用宿主机的内容
用镜像里原来那份
```

**这个写法看起来很怪（只写一个路径，不写宿主机路径），但它是标准做法。**

**逐段读 `-v /app/node_modules`：**

| 部分 | 意思 |
|---|---|
| 只有一个路径 | 这是匿名卷（anonymous volume） |
| `/app/node_modules` | 容器里的挂载点 |
| 内容从哪来 | **镜像里那个目录的初始内容**（首次创建时复制进去） |

**缺点：匿名卷会越攒越多。**

```bash
docker volume ls
```

```text
DRIVER    VOLUME NAME
local     3f2a1b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3
local     chat-data
```

**那一长串十六进制就是匿名卷。** `docker rm -f` 容器后它们会变成"悬空"，用 `docker volume prune` 清。

## 3.5 只读挂载

```bash
docker run --rm -v "$(pwd)/data:/app/data:ro" alpine ls /app/data
```

**`:ro` = read only。**

**容器里往这个目录写会失败：**

```bash
docker run --rm -v "$(pwd)/data:/app/data:ro" alpine sh -c 'echo x > /app/data/test.txt'
```

```text
sh: can't create /app/data/test.txt: Read-only file system
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `can't create` | 创建不了 |
| `Read-only file system` | **只读文件系统** |

**什么时候用 `:ro`：**

```text
① 挂配置文件进去（nginx.conf、证书），不希望容器改它
② 挂日志目录给一个只负责收集日志的容器
③ 安全加固：这个容器只该读，不该写
```

---

# 第 4 步：Windows 路径的四个坑（20 分钟）

## 4.1 坑一：Git Bash 会"翻译"路径

**这是 Windows 用户最莫名其妙的一个坑。**

**Git Bash（MSYS2）在把你的命令交给 `docker.exe` 之前，会做一次"POSIX 路径 → Windows 路径"的转换。**

```text
你写的：      -v chat-data:/app/data
Git Bash 看到 ：/app/data 是个 POSIX 路径
它翻译成：     C:/Program Files/Git/app/data
Docker 收到：  -v chat-data:C:/Program Files/Git/app/data
```

**容器里的路径变成了一个 Windows 路径。** Docker 会认为你想挂到一个叫 `C:` 的目录，或者直接报错。

**症状一（报错）：**

```text
docker: Error response from daemon: invalid volume specification:
'chat-data:C:/Program Files/Git/app/data'
```

**症状二（不报错，但挂错了地方）：**

```bash
docker exec chat-app ls -la /app
```

```text
total 0
```

**`/app` 是空的。** 因为数据被挂到了别处。

**怎么确认是不是这个问题：**

```bash
docker inspect --format '{{json .Mounts}}' chat-app
```

**如果看到：**

```text
[{"Type":"volume","Name":"chat-data","Source":"/var/lib/docker/volumes/chat-data/_data","Destination":"C:/Program Files/Git/app/data","RW":true}]
```

**`Destination` 是 `C:/Program Files/Git/app/data`** —— 就是被翻译了。

**怎么修（三种，推荐第三种）：**

```bash
# ① 关掉转换（只对这一条命令生效）
MSYS_NO_PATHCONV=1 docker run -v chat-data:/app/data ...

# ② 用双斜杠骗过它
docker run -v chat-data://app/data ...

# ③ 整个 Git Bash 会话关掉转换（推荐）
export MSYS_NO_PATHCONV=1
```

**第 ③ 种最省事：** 在你的 `~/.bashrc` 里加一行，以后所有命令都不转换。

**⚠️ 但要小心：** 关掉之后，`docker cp`、`docker run -v "C:/xxx"` 这些**需要 Windows 路径**的地方，你得自己写对。

**最稳的写法：宿主路径用 `$(pwd)`，容器路径前面加 `//`：**

```bash
docker run -v "$(pwd)/data://app/data" ...
```

**`//app/data` 经过转换会变成 `/app/data`。** 这是社区里最常见的绕法。

## 4.2 坑二：`B:/xxx` 和 `/b/xxx` 都对，但含义不同

| 你写的 | 谁认 |
|---|---|
| `B:/OPC-Distance_study/data` | Windows 风格，Docker Desktop 认 |
| `/b/OPC-Distance_study/data` | Git Bash 风格，会被转换成 `B:/...` |
| `$(pwd)/data` | **最稳，不依赖你怎么写盘符** |

**推荐一律用 `$(pwd)`。**

**⚠️ 盘符必须大写。** `b:/xxx` 在有些版本上不认。

## 4.3 坑三：路径里有空格或中文

```bash
docker run -v B:/My Projects/data:/app/data ...
```

**会怎样：**

```text
docker: invalid reference format.
```

**或者更奇怪：**

```text
Unable to find image 'Projects/data:/app/data' locally
```

**为什么：** shell 按空格拆参数，`B:/My` 和 `Projects/data:/app/data` 变成了两个参数。

**怎么修：加引号：**

```bash
docker run -v "B:/My Projects/data:/app/data" ...
```

**中文路径：**

```bash
docker run -v "$(pwd)/数据:/app/data" ...
```

**大多数情况能工作，但偶尔会遇到编码问题（容器里看到乱码文件名）。**

**建议：项目路径全用英文，不带空格。** 这一条能省你后面很多麻烦。

## 4.4 坑四：`-v` 的源路径不存在

```bash
docker run --rm -v "$(pwd)/no-such-dir:/app/data" alpine ls /app/data
```

**会怎样：**

**Docker 会"帮你创建"这个目录。**

```text
（没有输出，ls 显示空）
```

**然后你在宿主机上发现：**

```bash
ls -la no-such-dir
```

```text
total 0
```

**多了一个空目录。**

**为什么：**

**bind mount 的源路径不存在时，Docker 会自动创建（作为目录）。**

**这很危险：**

```text
你打错一个字母 → 挂了个空目录 → 容器读不到数据 → 你以为是代码问题
```

**怎么避免：**

```text
① 挂载前先 ls 一下源目录
② 用 compose，写相对路径，一眼能看出对不对
③ 容器启动后 ls 一下挂载点，确认有东西
```

**⚠️ 唯一会报错的情况：** 源路径是"一个已存在的文件"，你却想当目录挂。那时会报：

```text
docker: Error response from daemon: not a directory
```

## 4.5 三种终端的写法对照

| 终端 | 当前目录 | 换行符 |
|---|---|---|
| Git Bash | `$(pwd)` | `\` |
| PowerShell | `${PWD}` | `` ` `` |
| cmd | `%cd%` | `^` |

**PowerShell 例子：**

```powershell
docker run -d --name chat-app -p 3000:3000 --env-file .env -v "${PWD}/data:/app/data" chat-app:3.1
```

**cmd 例子：**

```bat
docker run -d --name chat-app -p 3000:3000 --env-file .env -v "%cd%/data:/app/data" chat-app:3.1
```

**⚠️ 不要混用。** 在 PowerShell 里写 `$(pwd)` 会报语法错误。

**建议：统一用 Git Bash。** 这套课件所有命令都是 Git Bash 写法。

---

# 第 5 步：volume 还是 bind mount（15 分钟）

## 5.1 一张表说清

| | volume | bind mount |
|---|---|---|
| 谁管理 | Docker | 你 |
| 存哪 | Docker 内部（WSL 里） | 你指定的路径 |
| 你能否直接用 VS Code 打开 | ❌ | ✅ |
| 性能（Windows） | 快 | **慢**（跨文件系统） |
| 备份 | 要用 tar 导出 | 直接复制文件 |
| 适合 | **数据（数据库、上传文件）** | **开发时代码、配置文件** |
| 生产环境 | ✅ | 一般不用 |
| 权限问题 | 少 | 多（Windows 和 Linux 的 uid 不一样） |

**"性能慢"这一条在 Windows 上很明显：**

```text
bind mount 一个有几万文件的 node_modules → npm install 要 10 分钟
volume                                    → 1 分钟
```

**因为 bind mount 要经过 WSL 和 Windows 之间的文件系统桥接。**

## 5.2 判断口诀

```text
是"程序产生的东西"吗？（数据库文件、用户上传、日志）
  → volume

是"你手写的、要随时改的东西"吗？（源码、配置文件）
  → bind mount（只在开发时）
```

**生产环境 99% 的挂载都是 volume。**

## 5.3 数据库必须用 volume

**这是硬规则。**

```bash
# ✅ 对
docker run -d --name pg -v pg-data:/var/lib/postgresql/data postgres:16

# ❌ 错（数据在可写层里，rm 就没）
docker run -d --name pg postgres:16
```

**第 6 节会用 compose 起 postgres，卷的写法就是这一条。**

## 5.4 一个容易忽略的点：容器内路径不要自己编

**`/app/data` 是你代码里的路径**（`DATA_FILE = "./data/messages.json"`，`WORKDIR` 是 `/app`）。

**数据库容器不一样：**

| 镜像 | 数据目录 |
|---|---|
| `postgres` | `/var/lib/postgresql/data` |
| `mysql` | `/var/lib/mysql` |
| `redis` | `/data` |
| `mongo` | `/data/db` |

**这些路径是官方镜像定死的。** 挂错地方 = 数据还是写在可写层里 = 一样会丢。

**每个镜像的文档里都写了，去查一下。** 别猜。

---

# 第 6 步：一个完整场景（15 分钟）

## 6.1 你的 chat-app + 卷 + 备份

**这是这一节最终要形成的操作习惯：**

```bash
# 1. 起容器，挂卷
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env \
  -v chat-data:/app/data \
  --restart unless-stopped \
  chat-app:3.1

# 2. 用一次，产生数据
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"记一下，明天要交作业"}'

# 3. 确认数据在卷里
docker exec chat-app cat /app/data/messages.json

# 4. 升级：删容器，用新镜像起，挂同一个卷
docker build -t chat-app:4.0 .
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env \
  -v chat-data:/app/data \
  --restart unless-stopped \
  chat-app:4.0

# 5. 数据还在
docker exec chat-app cat /app/data/messages.json
```

**这五步就是"升级不丢数据"的标准流程。**

**第 7 节会把它写成一条 `docker compose up -d`。**

## 6.2 权限问题（提前知道）

**如果你挂的卷是给一个"非 root 用户"用的容器（postgres、nginx），可能会遇到：**

```text
chown: changing ownership of '/var/lib/postgresql/data': Permission denied
```

**或者：**

```text
FATAL:  data directory "/var/lib/postgresql/data" has wrong ownership
```

**为什么：**

```text
卷第一次创建时，是 root 拥有的
postgres 容器里跑的是 postgres 用户（uid 999）
它写不进去
```

**解法（第 6 节会用到）：**

```bash
# 用 postgres 镜像自己的工具修
docker run --rm -v pg-data:/var/lib/postgresql/data alpine chown -R 999:999 /var/lib/postgresql/data
```

**或者更简单：让 postgres 镜像自己去初始化（第一次启动它会处理），** 前提是你挂的是**空卷**。

**如果卷里已经有别人的文件，它就拒绝启动。**

## 6.3 ⚠️ 一个真实的翻车现场

**这两个命令长得几乎一样：**

```bash
docker compose down        # 停服务，保留卷（数据在）
docker compose down -v     # 停服务，删卷（数据没了）
```

**`-v` 的意思是 `--volumes`。**

**按错一个键，数据库回到出厂状态。**

**规则：**

```text
日常重启 / 改配置：  docker compose up -d（不用 down）
要重建容器：         docker compose up -d --force-recreate
真的要清空数据：     docker compose down -v   ← 想三秒再敲
```

**这个习惯从今天开始养。**

---

# 第 7 步：故意犯七个错（25 分钟）

## 错误 1：不挂卷，数据随容器消失

**操作：** 第 1 步已经做过了。这里看一个更真实的版本。

```bash
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"message":"用户的重要消息"}'
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
docker exec chat-app cat /app/data/messages.json
```

**会怎样：**

```text
cat: can't open '/app/data/messages.json': No such file or directory
```

**为什么：** 数据在可写层，`rm` 时一起删了。

**怎么查"我的数据到底在哪"：**

```bash
docker diff chat-app
```

**看有没有 `A /app/data`。有，说明数据在可写层里 —— 这是危险信号。**

**怎么修：加 `-v chat-data:/app/data`。**

## 错误 2：Git Bash 把容器路径翻译了

**操作：**

```bash
docker run -d --name chat-app -v chat-data:/app/data chat-app:3.1
```

**注意：你没关 `MSYS_NO_PATHCONV`。**

**会怎样（版本不同，现象不同）：**

**情况 A（报错）：**

```text
docker: Error response from daemon: invalid volume specification:
'chat-data:C:/Program Files/Git/app/data'
```

**情况 B（不报错，但 `/app/data` 是空的）：**

```bash
docker exec chat-app ls -la /app
```

```text
total 0
```

**为什么：**

Git Bash 把 `/app/data` 当成 POSIX 路径，翻译成了 `C:/Program Files/Git/app/data`。

**怎么查：**

```bash
docker inspect --format '{{json .Mounts}}' chat-app
```

```text
[{"Type":"volume","Name":"chat-data","Source":"/var/lib/docker/volumes/chat-data/_data","Destination":"C:/Program Files/Git/app/data","RW":true}]
```

**`Destination` 不是 `/app/data`。** 抓到了。

**怎么修：**

```bash
export MSYS_NO_PATHCONV=1
```

**然后重新起容器。**

**或者用双斜杠：**

```bash
docker run -d --name chat-app -v "$(pwd)/data://app/data" chat-app:3.1
```

## 错误 3：挂载盖掉了 `node_modules`

**操作：**

```bash
docker run -d --name chat-app -v "$(pwd):/app" chat-app:3.1
```

**会怎样：**

```bash
docker logs chat-app
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

**为什么：**

挂载是**覆盖**。你电脑上的 `/app` 覆盖了镜像里的 `/app`，包括 `node_modules`。

**而你电脑上的 `node_modules`：**

```text
① 是 Windows 版（.node 二进制不兼容）
② 或者被 .dockerignore 排除了，根本不存在
```

**怎么查：**

```bash
docker exec chat-app ls /app
```

```text
package.json  public  server.js
```

**没有 `node_modules`。**

**怎么修：**

```bash
docker run -d --name chat-app -v "$(pwd):/app" -v /app/node_modules chat-app:3.1
```

**`-v /app/node_modules` 保住了镜像里那份。**

> **这条经验在开发时天天用。但记住：生产环境不要挂源码，只挂数据。**

## 错误 4：卷名打错，数据"消失"

**操作：**

```bash
docker run -d --name chat-app -v chatdata:/app/data chat-app:3.1
```

**（原来叫 `chat-data`，你写了 `chatdata`。）**

**会怎样：** 不报错。

```bash
docker exec chat-app cat /app/data/messages.json
```

```text
cat: can't open '/app/data/messages.json': No such file or directory
```

**你以为数据丢了。**

**怎么查：**

```bash
docker volume ls
```

```text
DRIVER    VOLUME NAME
local     chatdata
local     chat-data
```

**两个卷。`chatdata` 是刚建的空卷。**

**数据在 `chat-data` 里。**

**怎么修：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -v chat-data:/app/data ... chat-app:3.1
```

**怎么避免：**

```text
① 重要操作前 docker volume ls
② 用 compose，卷名只在 yaml 里写一次
③ 卷名不要用下划线，统一用连字符
```

## 错误 5：容器里写不进去（权限）

**操作：** 挂一个宿主机目录，容器里用非 root 用户跑。

```bash
docker run --rm -v "$(pwd)/data:/data" -u 1000:1000 alpine sh -c 'echo x > /data/a.txt'
```

**会怎样：**

```text
sh: can't create /data/a.txt: Permission denied
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `can't create /data/a.txt` | 建不了这个文件 |
| `Permission denied` | **权限不够** |

**为什么：**

宿主机上的目录属主是"你的 Windows 用户"（映射成某个 uid），容器里用 uid 1000 去写，对不上。

**怎么查：**

```bash
docker run --rm -v "$(pwd)/data:/data" alpine ls -ln /data
```

**输出里第三列就是 uid：**

```text
-rw-r--r--    1 0        0              20 Nov 16 04:02 messages.json
```

**`0 0` 是 root。**

**怎么修（三种）：**

```bash
# ① 容器里也用 root（简单，但不够安全）
docker run --rm -v "$(pwd)/data:/data" alpine sh -c 'echo x > /data/a.txt'

# ② 改宿主目录权限
chmod 777 data        # 不推荐，太宽

# ③ 生产做法：让卷第一次创建时就属于正确的 uid
docker run --rm -v chat-data:/data alpine chown -R 1000:1000 /data
```

**postgres 那个例子（6.2）就是这个问题的标准解法。**

## 错误 6：`docker volume rm` 删不掉

**操作：**

```bash
docker volume rm chat-data
```

**会怎样：**

```text
Error response from daemon: remove chat-data: volume is in use - [8f3a2b1c9d4e...]
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `remove chat-data` | 想删这个卷 |
| `volume is in use` | **有容器在用它** |
| `[8f3a2b1c...]` | 是那个容器 |

**为什么：**

**卷被挂载了就不能删。** 这和"删镜像前要删容器"是一个道理。

**怎么修：**

```bash
docker rm -f 8f3a2b1c9d4e
docker volume rm chat-data
```

**注意：`docker rm` 容器**不会**删卷**，所以删完容器卷还在，得手动删。

**如果你想看谁在用：**

```bash
docker ps -a --filter volume=chat-data
```

## 错误 7：路径带空格没加引号

**操作：**

```bash
docker run --rm -v B:/My Projects/data:/app/data alpine ls /app/data
```

**会怎样：**

```text
Unable to find image 'Projects/data:/app/data' locally
docker: Error response from daemon: pull access denied for Projects/data:/app/data,
repository does not exist or may require 'docker login': denied: requested access
to the resource is denied.
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `Unable to find image 'Projects/data:/app/data'` | **它把这个当成了镜像名** |
| `pull access denied` | 拉不到 |

**为什么：**

shell 按空格拆参数：

```text
-v
B:/My
Projects/data:/app/data      ← 变成镜像名
alpine                       ← 变成"容器里要运行的命令"
ls
/app/data
```

**怎么修：**

```bash
docker run --rm -v "B:/My Projects/data:/app/data" alpine ls /app/data
```

**根本的解法：项目路径不要有空格。**

---

# 第 8 步：写学习笔记（10 分钟）

**打开 `第05节课/02-笔记/NOTES.md` 填。**

**这一节重点填三处：**

```text
① docker rm 前后，数据文件的对比（贴两条 cat 的输出）
② docker inspect --format '{{json .Mounts}}' 的输出
③ 我的终端里，容器路径有没有被翻译（Destination 是不是 /app/data）
```

**第 ③ 条在 Windows 上特别重要。**

---

# 第 9 步：课后练习

## 练习一：三种状态对比

**要求：** 同一份数据，分别在下面三种情况下起容器，看数据还在不在。

```text
① 不挂载
② 挂 chat-data 卷
③ 挂 $(pwd)/data 目录
```

每次都是：写入 → `docker rm -f` → 重新 run → `cat`。

**记录：** 三行表格（挂载方式 / rm 之后数据在不在 / 文件在哪）。

**思考：为什么 volume 能活过 `rm`，而可写层不能？它们不都在同一块硬盘上吗？**

## 练习二：做一次完整的备份恢复

**要求：**

1. 往卷里写三条消息；
2. 用 2.5 的 tar 命令备份到 `backup/`；
3. `docker volume rm` 掉卷（先删容器）；
4. 重建卷，恢复；
5. `cat` 确认三条消息都在。

**记录：** 五步的命令和关键输出。

**思考：如果备份文件在 `03-练习代码/backup/` 里，而你把整个文件夹删了，数据还剩在哪？**

## 练习三：验证 bind mount 的"实时"

**要求：**

1. 挂 `$(pwd)/data` 起容器；
2. 在 VS Code 里改 `data/messages.json`，保存；
3. 不进容器，直接 `docker exec chat-app cat /app/data/messages.json`；
4. 再在容器里改，看宿主机的文件。

**记录：** 两个方向的输出。

**思考：为什么不需要"同步"？如果这是 volume，你能这样改吗？**

## 练习四：测量 bind mount 和 volume 的速度差

**要求：**

1. 在 bind mount 的目录里装 50 个空文件：

   ```bash
   for i in $(seq 1 200); do echo x > "data/f$i.txt"; done
   ```

2. 计时 `ls`：

   ```bash
   time docker exec chat-app ls /app/data > /dev/null
   ```

3. 把这些文件复制进一个 volume，同样计时。

**记录：** 两个时间。

**思考：为什么 Windows 上 bind mount 明显慢？这对"把 node_modules 挂进去"这件事意味着什么？**

## 练习五：写下你的"部署不丢数据"清单

**要求：** 不看课件，写五条。

必须覆盖：

```text
哪些目录必须挂卷
挂哪个路径（容器内路径从哪查）
升级时怎么保住数据
怎么备份
哪个命令会删掉卷
```

**记录：** 五条清单。

**思考：如果明天要给客户升级一次版本，你会按什么顺序操作？**

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清可写层是什么，`docker rm` 删掉了什么
- [ ] 我能说清 volume 和 bind mount 的区别
- [ ] 我知道为什么数据库必须用 volume
- [ ] 我知道 `docker compose down -v` 会删数据
- [ ] 我知道容器内路径不能自己编，要查镜像文档

## B. 实操

- [ ] 我用 volume 让数据活过了一次 `docker rm`
- [ ] 我用 bind mount 让宿主机改文件、容器立刻看到
- [ ] 我会 `docker volume ls` / `inspect` / `rm`
- [ ] 我用 tar 备份过卷，并恢复成功
- [ ] 我会 `docker inspect --format '{{json .Mounts}}'`

## C. Windows 排错

- [ ] 我知道 Git Bash 会把 `/app/data` 翻译成 Windows 路径
- [ ] 我会用 `MSYS_NO_PATHCONV=1` 或 `//app/data`
- [ ] 我知道路径带空格要加引号
- [ ] 我知道 bind mount 源目录不存在时 Docker 会自动创建

## D. 交付

- [ ] `chat-app` 容器挂着 `chat-data` 卷在跑
- [ ] `backup/chat-data-backup.tar.gz` 存在，能 `tar tzf` 看到内容
- [ ] 我做过一次"build 新镜像 → 删容器 → 用新镜像 + 老卷"的升级

## E. 笔记

- [ ] 「rm 前后对比」贴了两条真实 `cat` 输出
- [ ] `Mounts` 的 JSON 贴了
- [ ] 「我卡在哪」写了真实报错

## 本节课要能说出口的一句话

> **容器的可写层是临时的，删容器就没了；要活下来的数据必须放在容器外面 —— 生产用卷，开发用绑定挂载。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `rm` 之后数据没了 | 数据在可写层 | 挂卷 |
| 容器里 `/app/data` 是空的 | 挂载路径被 Git Bash 翻译了 | `MSYS_NO_PATHCONV=1`，或 `//app/data` |
| `invalid volume specification` | 同上 | 同上 |
| `Cannot find module`（挂了 `.` 之后） | `node_modules` 被覆盖 | `-v /app/node_modules` |
| 数据"消失"，`volume ls` 有两个 | 卷名打错，新建了空卷 | 挂对的卷名 |
| `volume is in use` | 有容器在用 | 先 `docker rm` 容器 |
| `Permission denied` 写不进挂载目录 | uid 不匹配 | `chown` 卷；或用 root 跑 |
| 挂载目录自动出现且是空的 | 源路径不存在，Docker 自动创建 | 检查路径拼写 |
| `invalid reference format`（挂载） | 路径有空格没加引号 | 加引号 |
| `not a directory` | 源是文件，你想当目录挂 | 改路径 |
| `docker compose down -v` 之后数据库空 | `-v` 删了卷 | 用 `down` 不带 `-v` |
| 卷越攒越多 | 匿名卷（`-v /app/node_modules`） | `docker volume prune`（⚠️ 会删没用的卷） |
| 找不到卷里的文件 | 卷在 WSL 里，Windows 打不开 | 用临时容器 + tar 导出 |
| postgres 启动报 ownership 错 | 卷里文件属主不对 | `chown -R 999:999` |
| bind mount 很慢 | Windows 跨文件系统 | 用 volume；开发时只挂源码不挂 `node_modules` |
| `-v` 的 `:ro` 没用 | 写成了 `-v a:b:ro` 但顺序错 | 容器路径后面才是 `:ro` |
