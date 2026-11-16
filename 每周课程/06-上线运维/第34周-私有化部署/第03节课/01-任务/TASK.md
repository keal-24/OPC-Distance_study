# 第 234 节课：离线安装——没有网也能装

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上一节课你有了方案和 compose 文件。它们在你自己电脑上跑得好好的。
> 这一节课把"跑得好好的"变成"能装进一个不能上网的机房"。
> **这一步是私有化项目最容易翻车的地方，也是最能体现专业度的地方。**

**建议用时**：130 分钟
**你需要先完成**：第 233 节课（compose 能起来）、第 197—203 节课（懂镜像和容器）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你的部署流程一直是这样：

```text
docker pull postgres:16.3
docker build -t chat-app:1.2.0 .
docker compose up -d
```

**这三条命令，每一条都假设"机器能上网"。**

| 命令 | 它偷偷访问了什么 |
|---|---|
| `docker pull` | `registry-1.docker.io` |
| `docker build`（有 `FROM node:20`） | 同上，拉基础镜像 |
| `docker compose up`（镜像不存在时） | 同上，自动 pull |
| `apt install docker.io` | 客户内网的 apt 源（通常没有） |
| `npm install` | `registry.npmjs.org` |

**客户机房里，这五个地址一个都连不上。**

## 0.2 你以后会遇到什么

```text
① 客户说：我们机房不能上网，你带个 U 盘进来装。
② 你 load 完镜像，docker compose up 报 No such image。
③ 你发现客户机器上没有 docker compose 这个子命令。
④ 你打了 5G 的包，U 盘是 FAT32，拷到 4G 就报"文件过大"。
⑤ 你在现场发现机器上没有 curl，你的健康检查脚本全废了。
```

**这五件事，每一件都能让你在现场多待一天。**

## 0.3 今天要建立的三个概念

```text
① 镜像归档：docker save 把镜像变成一个 tar 文件，docker load 把它变回去。镜像可以像文件一样拷。
② 离线依赖：不只是镜像。Docker 引擎、compose 插件、系统工具，凡是"装"的东西都要提前准备。
③ 内网 registry：机器多了以后，用一台内网机器当"私有应用商店"，其他机器从它拉。
```

**第二个概念最容易被忽略。** 大多数人只记得打包镜像，忘了打包"装镜像的工具"。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `offline-package/` | `03-练习代码` | 离线包目录（结构 + 清单 + 校验和） |
| `install.sh` | `03-练习代码` | 一键安装脚本 |
| `安装记录.md` | `03-练习代码` | 现场每一步的实际输出 |

**⚠️ 今天所有实验都在你自己的机器上做，用 `docker save` / `load` 模拟"送进去"。**
**不要真去删本机 Docker，也不要 `docker system prune -a`。**

---

# 第 1 步：先列清单，再打包（20 分钟）

## 1.1 离线包必须包含什么

**先看这张表，这是你这节课的购物清单。**

| 类别 | 内容 | 为什么必须有 | 大概体积 |
|---|---|---|---|
| 应用镜像 | `chat-app:1.2.0` | 你的程序 | 150—400 M |
| 数据库镜像 | `postgres:16.3` | 数据存储 | 150 M |
| 代理镜像 | `nginx:1.25.3` | 反向代理 | 60 M |
| 可选模型镜像 | `ollama/ollama:0.5.x` | 第 235 节课 | 1.5 G |
| 模型文件 | `qwen2.5:7b`（约 4.7 G） | 第 235 节课 | 4.7 G |
| Docker 引擎 | `docker-27.x.tgz` 静态包 | 客户机器可能没装 | 70 M |
| compose 插件 | `docker-compose-linux-x86_64` | 客户机器没有 compose 子命令 | 60 M |
| 应用代码 | `app.tar.gz`（含 node_modules） | 备查、改配置 | 100—300 M |
| 配置 | `docker-compose.yml`、`nginx/default.conf` | 编排 | 几 K |
| 脚本 | `install.sh`、`upgrade.sh`、`rollback.sh` | 自动化 | 几十 K |
| 文档 | 四件套 | 交付 | 几 M |
| 校验和 | `SHA256SUMS` | 验证包没坏 | 几 K |

**合计：不含模型约 1 G，含模型约 7 G。**

## 1.2 为什么 `node_modules` 也要打进去

**你的 Dockerfile 里如果是这样：**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "server.js"]
```

**这个 `RUN npm ci` 在 build 的时候执行，此时能联网，没问题。**

**但如果你在现场要改代码、重新 build：**

```text
客户机器没有网
  → npm ci 连不上 registry.npmjs.org
  → build 失败
```

**所以离线包里要带一份"已经装好依赖的代码"：**

```text
app/
├── server.js
├── package.json
├── node_modules/      ← 从你的机器上拷过来的
└── ...
```

**这样现场有两种选择：**

| 情况 | 做法 |
|---|---|
| 镜像能用 | 直接 `docker load`，不碰代码 |
| 要改一行配置再 build | 用带 `node_modules` 的代码，`docker build` 时不跑 `npm ci` |

**Dockerfile 要写成能跳过安装：**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# 如果离线包里已带 node_modules，这一步会很快返回
RUN if [ ! -d node_modules ]; then npm ci --omit=dev; fi
COPY . .
CMD ["node", "server.js"]
```

**为什么写 `if`：**

```text
COPY . . 在 RUN 之后，所以 RUN 的时候 node_modules 还不在。
这种写法在"本地构建"和"离线构建"两种场景都能用，
但真正省事的做法是：离线包里直接带一个已经构建好的镜像，不要现场 build。
```

**结论：**

```text
首选：带镜像，现场不 build。
备选：带代码 + node_modules，现场能 build。
两个都带，体积多 200M，但能救命。
```

## 1.3 写一份清单文件

**为什么要有 `manifest.txt`：**

```text
现场你打开一个 U 盘，里面有 12 个文件。
哪个是必须的？哪个是备用的？版本对不对？
一张清单能省你半小时。
```

**文件：`offline-package/manifest.txt`**

```text
包名：chat-app-offline
版本：1.2.0
构建日期：2026-03-10
构建机器：x86_64 / Ubuntu 22.04
目标架构：linux/amd64

镜像：
  chat-app:1.2.0        images/chat-app-1.2.0.tar
  postgres:16.3         images/postgres-16.3.tar
  nginx:1.25.3          images/nginx-1.25.3.tar

工具：
  Docker 27.3.1         tools/docker-27.3.1.tgz
  compose v2.24.6       tools/docker-compose-linux-x86_64

配置：
  docker-compose.yml    config/docker-compose.yml
  nginx/default.conf    config/default.conf
  .env.example          config/.env.example

脚本：
  install.sh            scripts/install.sh

文档：
  安装手册.md           docs/安装手册.md
  运维手册.md           docs/运维手册.md

校验：
  SHA256SUMS            ./SHA256SUMS
```

**这张清单同时是"交付清单"。** 客户签收时对一遍。

## 1.4 包里的目录结构

```text
offline-package/
├── manifest.txt
├── SHA256SUMS
├── images/
│   ├── chat-app-1.2.0.tar
│   ├── postgres-16.3.tar
│   └── nginx-1.25.3.tar
├── tools/
│   ├── docker-27.3.1.tgz
│   └── docker-compose-linux-x86_64
├── config/
│   ├── docker-compose.yml
│   ├── default.conf
│   └── .env.example
├── scripts/
│   ├── install.sh
│   ├── upgrade.sh
│   └── rollback.sh
└── docs/
    ├── 安装手册.md
    └── 运维手册.md
```

**检查一下体积：**

```bash
du -sh offline-package
du -sh offline-package/*
```

**应该看到：**

```text
1.1G    offline-package
380M    offline-package/images
130M    offline-package/tools
8.0K    offline-package/config
24K     offline-package/scripts
180K    offline-package/docs
```

**逐行读：**

| 行 | 意思 | 判断 |
|---|---|---|
| `1.1G` 总计 | 不含模型 | 一个 16G U 盘够 |
| `380M images` | 三个镜像 | 正常 |
| `130M tools` | Docker 引擎 + compose | 正常 |
| `8.0K config` | 纯文本 | 正常，别嫌小 |
| `180K docs` | 文档 | 正常 |

**如果 `images` 只有 2M，说明你 `save` 的是空镜像或者只存了一层，回头检查。**

---

# 第 2 步：在能联网的机器上制作离线包（35 分钟）

> **⚠️ 这一步在你的开发机 / 公司服务器上做，那台机器必须能上网。**
> **从第 3 步开始，所有命令都假设"没有网"。**

## 2.1 准备目录

```bash
mkdir -p offline-package/{images,tools,config,scripts,docs}
cd offline-package
```

**应该看到：什么都没输出。**

**Linux 的哲学：没消息就是好消息。** 命令成功时不打印东西。

**验证：**

```bash
ls
```

**应该看到：**

```text
config  docs  images  scripts  tools
```

## 2.2 拉取三个镜像

```bash
docker pull chat-app:1.2.0
docker pull postgres:16.3
docker pull nginx:1.25.3
```

**应该看到（第三个为例）：**

```text
1.25.3: Pulling from library/nginx
a2abf6c4d29d: Pull complete
f4c1c8f0e8b1: Pull complete
3f5a7d1b2c4e: Pull complete
Digest: sha256:6b1f3e2c9a8d4f7b0e5c2a1d8f3b6e9c4a7d0f2b5e8c1a4d7f0b3e6c9a2d5f
Status: Downloaded newer image for nginx:1.25.3
docker.io/library/nginx:1.25.3
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Pulling from library/nginx` | 从 Docker Hub 官方库拉 |
| `a2abf6c4d29d: Pull complete` | 一层下载完成（镜像分层） |
| `Digest: sha256:...` | 整个镜像的内容摘要，用于校验 |
| `Status: Downloaded newer image` | 拉成功了 |
| `docker.io/library/nginx:1.25.3` | 完整镜像名 |

**为什么每个镜像单独 `save` 一个 tar：**

| 方式 | 优点 | 缺点 |
|---|---|---|
| 一个镜像一个 tar | 可以只带需要的那几个；坏了只重传一个 | 文件多 |
| 全部打进一个 tar | 文件少，`load` 一条命令 | 5G 一个文件，U 盘拷贝中断要重来 |

**推荐：一个镜像一个 tar。** 现场少一次全量重拷。

## 2.3 导出镜像

```bash
docker save -o images/chat-app-1.2.0.tar chat-app:1.2.0
docker save -o images/postgres-16.3.tar postgres:16.3
docker save -o images/nginx-1.25.3.tar nginx:1.25.3
```

**每条命令执行时都会卡几秒到几十秒。** 没有进度条，这是正常的。

**`docker save` 到底存了什么：**

```text
镜像的所有层（layer）+ 元数据（config）+ tag 信息，打成一个 tar。
它是"原样导出"，不做压缩。
```

**所以体积和 `docker images` 里看到的大小相近。**

**验证：**

```bash
ls -lh images/
```

**应该看到：**

```text
total 372M
-rw-r--r-- 1 root root 182M Mar 10 10:02 chat-app-1.2.0.tar
-rw-r--r-- 1 root root 128M Mar 10 10:03 postgres-16.3.tar
-rw-r--r-- 1 root root  62M Mar 10 10:04 nginx-1.25.3.tar
```

**逐列读：**

| 列 | 意思 | 判断 |
|---|---|---|
| `-rw-r--r--` | 普通文件 | 正常 |
| `182M` | 文件大小 | 和 `docker images` 的 SIZE 接近 |
| `Mar 10 10:02` | 导出时间 | 三个文件时间接近说明是一次做的 |
| `chat-app-1.2.0.tar` | 文件名带版本 | **文件名一定要带版本** |

**为什么文件名必须带版本：**

```text
三个月后你翻 U 盘，看到 chat-app.tar 和 chat-app-new.tar，
你不知道哪个是 1.2.0，哪个是 1.3.0。
```

## 2.4 顺便查一下镜像架构

**这是第 232 节课埋下的伏笔，现在验证。**

```bash
docker image inspect chat-app:1.2.0 --format '{{.Os}}/{{.Architecture}}'
```

**应该看到：**

```text
linux/amd64
```

**逐段读：**

```text
linux        操作系统
amd64        CPU 架构，等同于 x86_64
```

**如果客户是 ARM 机器，你需要的输出是：**

```text
linux/arm64
```

**检查三个镜像：**

```bash
for img in chat-app:1.2.0 postgres:16.3 nginx:1.25.3; do
  echo -n "$img  "
  docker image inspect "$img" --format '{{.Os}}/{{.Architecture}}'
done
```

**应该看到：**

```text
chat-app:1.2.0  linux/amd64
postgres:16.3  linux/amd64
nginx:1.25.3  linux/amd64
```

**三个必须一致。** 有一个不一样，现场就起不来。

**如果客户是 ARM，怎么做出 ARM 镜像：**

```bash
docker buildx build --platform linux/arm64 -t chat-app:1.2.0-arm64 --load .
```

**注意 `--load`：**

```text
不加 --load，buildx 只把结果放在构建缓存里，不导入本地镜像列表，
你 docker save 的时候会找不到这个镜像。
```

## 2.5 准备 Docker 引擎和 compose 插件

**客户机器上可能根本没装 Docker。**

**先确认你要带哪个版本：**

```bash
docker version --format '{{.Server.Version}}'
```

**应该看到：**

```text
27.3.1
```

**下载静态二进制包（在能联网的机器上）：**

```bash
curl -fL -o tools/docker-27.3.1.tgz \
  https://download.docker.com/linux/static/stable/x86_64/docker-27.3.1.tgz
```

**应该看到：**

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 68.2M  100 68.2M    0     0  8.4M/s  0:00:08  0:00:08 --:--:-- 9.1M/s
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `100 68.2M` | 下载了 68.2M |
| `8.4M/s` | 速度 |
| `0:00:08` | 用了 8 秒 |

**ARM 机器要把 `x86_64` 换成 `aarch64`：**

```text
https://download.docker.com/linux/static/stable/aarch64/docker-27.3.1.tgz
```

**版本号会变，去 `download.docker.com` 看当前稳定版。**

**下载 compose 插件：**

```bash
curl -fL -o tools/docker-compose-linux-x86_64 \
  https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-linux-x86_64
```

**应该看到类似：**

```text
100 58.7M  100 58.7M    0     0  6.2M/s  0:00:09  0:00:09 --:--:-- 7.4M/s
```

**ARM 版本文件名是 `docker-compose-linux-aarch64`。**

**验证下载的东西是真的二进制，不是 HTML 错误页：**

```bash
file tools/docker-compose-linux-x86_64
```

**应该看到：**

```text
tools/docker-compose-linux-x86_64: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, Go BuildID=..., stripped
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `ELF 64-bit LSB executable` | 是 Linux 可执行文件 |
| `x86-64` | 架构对 |
| `statically linked` | 静态链接，不依赖系统库（重要） |
| `stripped` | 去掉了调试符号，体积小 |

**如果看到的是：**

```text
HTML document, ASCII text
```

**说明你下到了一个 404 页面。** 检查 URL 和版本号。

## 2.6 打包配置、脚本、代码

```bash
cp ../docker-compose.yml config/
cp ../nginx/default.conf config/
cp ../.env.example config/
cp ../scripts/*.sh scripts/
```

**`cp` 是什么：** 复制文件。`../` 是上一级目录。

**把应用代码打包（含 node_modules）：**

```bash
tar -czf images/app-src-1.2.0.tar.gz app/
```

**`tar` 四个参数：**

```text
-c   创建归档
-z   用 gzip 压缩
-f   指定文件名（后面紧跟文件名）
app/ 要打包的目录
```

**应该看到：没有输出。** 成功了。

**验证：**

```bash
ls -lh images/app-src-1.2.0.tar.gz
```

**应该看到：**

```text
-rw-r--r-- 1 root root 96M Mar 10 10:20 images/app-src-1.2.0.tar.gz
```

**如果只有 2M，说明你没把 `node_modules` 打进去，或者 `.dockerignore` 影响了。**

**检查里面有没有 node_modules：**

```bash
tar -tzf images/app-src-1.2.0.tar.gz | grep -c node_modules
```

**应该看到：**

```text
1842
```

**`-t` 是"列出内容不解压"，`-c` 数行数。1842 表示有 1842 个 node_modules 下的条目。**

## 2.7 生成校验和

**为什么要校验：**

```text
U 盘拷 5G 文件，中断、坏块、杀毒软件改文件，都可能发生。
不校验，你在客户面前 load 到一半报 "unexpected EOF"，很难看。
```

```bash
cd offline-package
find . -type f ! -name SHA256SUMS -exec sha256sum {} \; > SHA256SUMS
```

**应该看到：没有输出。**

**看一眼前几行：**

```bash
head -5 SHA256SUMS
```

**应该看到：**

```text
9f2c1a4e7b3d5f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6  ./images/chat-app-1.2.0.tar
3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5  ./images/nginx-1.25.3.tar
7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9  ./images/postgres-16.3.tar
```

**逐段读：**

```text
9f2c1a4e...   64 位十六进制，文件的 SHA-256 指纹
两个空格      格式要求
./images/...  相对路径
```

**为什么用 `find` 而不是 `sha256sum *`：**

```text
sha256sum * 只处理当前目录的文件，不进子目录。
find . -type f 会递归所有文件。
```

**在客户现场校验：**

```bash
sha256sum -c SHA256SUMS
```

**应该看到：**

```text
./images/chat-app-1.2.0.tar: OK
./images/nginx-1.25.3.tar: OK
./images/postgres-16.3.tar: OK
./tools/docker-27.3.1.tgz: OK
./tools/docker-compose-linux-x86_64: OK
./config/docker-compose.yml: OK
./config/default.conf: OK
./config/.env.example: OK
./scripts/install.sh: OK
```

**逐行读：**

| 输出 | 意思 |
|---|---|
| `: OK` | 校验通过 |
| `: FAILED` | 文件坏了，**不能用** |
| `sha256sum: WARNING: 1 computed checksum did NOT match` | 有文件不对 |

**看到 `FAILED` 就重新拷，不要抱侥幸心理。**

## 2.8 打成总包（可选）

**如果 U 盘够大，直接把整个目录拷进去就行。**

**如果要压缩：**

```bash
tar -czf chat-app-offline-1.2.0.tar.gz offline-package/
```

**应该看到：没有输出。**

```bash
ls -lh chat-app-offline-1.2.0.tar.gz
```

**应该看到：**

```text
-rw-r--r-- 1 root root 980M Mar 10 10:30 chat-app-offline-1.2.0.tar.gz
```

**⚠️ 这里有个坑：**

```text
.tar.gz 压缩后接近 1G，但你解压后是 1.1G。
如果 U 盘是 FAT32，单文件上限 4G，暂时没问题。
但如果加上模型（7G），就会超。
```

**FAT32 单文件上限 4G 这件事，第 3 步会详细讲。**

---

# 第 3 步：把包送进内网（20 分钟）

## 3.1 传输方式的三种选择

| 方式 | 适用 | 注意 |
|---|---|---|
| U 盘（exFAT / NTFS） | 最常见 | 单文件无 4G 限制 |
| U 盘（FAT32） | 客户强制要求 | **单文件最大 4G** |
| 移动硬盘 | 包很大（含模型） | 要确认客户允许接 |
| 摆渡机 / 网闸 | 政府、医院 | 可能限制文件类型和大小 |

**先问一句：**

```text
你们的 U 盘是什么格式？能接移动硬盘吗？文件大小有限制吗？
```

## 3.2 FAT32 的 4G 陷阱与拆包

**现象：**

```text
复制 chat-app-offline-1.2.0.tar.gz 到 U 盘...
文件“chat-app-offline-1.2.0.tar.gz”对于目标文件系统过大。
```

**为什么：**

```text
FAT32 用 32 位记录文件大小，单文件上限 4,294,967,295 字节，约 4G。
exFAT 和 NTFS 没有这个限制。
```

**不用格式化 U 盘（客户的东西不要动），直接拆：**

```bash
split -b 3G -d chat-app-offline-1.2.0.tar.gz part-
```

**应该看到：没有输出。**

```bash
ls -lh part-*
```

**应该看到：**

```text
-rw-r--r-- 1 root root 3.0G Mar 10 10:40 part-00
-rw-r--r-- 1 root root 2.9G Mar 10 10:41 part-01
```

**逐段读：**

| 参数 | 意思 |
|---|---|
| `-b 3G` | 每块 3G（留余量，不要正好 4G） |
| `-d` | 用数字后缀（00、01），不用字母 |
| `part-` | 前缀 |

**现场合并：**

```bash
cat part-* > chat-app-offline-1.2.0.tar.gz
```

**应该看到：没有输出。**

**`cat` 在这里不是"看文件"，是"按顺序拼接输出"。**

**然后校验：**

```bash
sha256sum chat-app-offline-1.2.0.tar.gz
```

**应该和你打包时算出来的值一样。**

**如果不一样：**

```text
① 某一块拷贝不完整 → 重新拷那一块
② 某一块顺序错了 → part-00 必须在 part-01 前面（* 会按名字排序，通常没问题）
③ U 盘有坏块 → 换 U 盘
```

## 3.3 现场解包

**U 盘挂载后（内网 Linux 通常自动挂到 `/media` 或 `/run/media`）：**

```bash
ls /run/media/
```

**应该看到：**

```text
root
```

```bash
ls /run/media/root/
```

**应该看到：**

```text
KINGSTON
```

**这就是 U 盘的卷标。**

```bash
ls /run/media/root/KINGSTON/
```

**应该看到：**

```text
chat-app-offline-1.2.0.tar.gz
```

**拷到本地再解压（不要在 U 盘上直接解压）：**

```bash
mkdir -p /opt/offline
cp /run/media/root/KINGSTON/chat-app-offline-1.2.0.tar.gz /opt/offline/
cd /opt/offline
tar -xzf chat-app-offline-1.2.0.tar.gz
```

**应该看到：没有输出。**

**为什么不在 U 盘上直接解压：**

```text
U 盘读写慢，解压小文件（node_modules 有几千个）会非常慢。
拷到本地磁盘再解压，快十倍。
```

**验证：**

```bash
ls offline-package/
```

**应该看到：**

```text
SHA256SUMS  config  docs  images  manifest.txt  scripts  tools
```

## 3.4 先校验，再安装

```bash
cd /opt/offline/offline-package
sha256sum -c SHA256SUMS
```

**应该看到全部 `OK`。**

**如果有 `FAILED`：**

```text
不要继续装。停下来，重新拷那个文件。
装到一半发现镜像是坏的，比现在多花两小时。
```

---

# 第 4 步：在没有网的机器上装 Docker（30 分钟）

## 4.1 先看客户机器有没有

```bash
docker version
```

**情况 A：已经有了**

```text
Client: Docker Engine - Community
 Version:           27.3.1
 ...
Server: Docker Engine - Community
 Engine:
  Version:          27.3.1
```

**跳到 4.4 检查 compose。**

**情况 B：没有**

```text
bash: docker: command not found
```

**`command not found` 是什么意思：**

```text
shell 在 PATH 里的所有目录找了一遍，没有叫 docker 的可执行文件。
不是权限问题，是根本没装。
```

**情况 C：有 docker 命令但没有守护进程**

```text
Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Is the docker daemon running?
```

**这是"装了但没启动"，先试：**

```bash
systemctl start docker
systemctl enable docker
```

**如果 `systemctl` 也报错（有些精简系统没有 systemd），才走静态安装。**

## 4.2 静态二进制安装（不需要包管理器）

**为什么用静态包：**

```text
客户机器不能用 apt/yum（没有源、或者源里没有 docker）。
静态包是一堆编译好的二进制文件，解压就能用，不依赖系统库。
```

```bash
cd /opt/offline/offline-package/tools
tar -xzf docker-27.3.1.tgz
```

**应该看到：**

```text
docker/
docker/containerd
docker/containerd-shim-runc-v2
docker/ctr
docker/docker
docker/docker-init
docker/docker-proxy
docker/dockerd
docker/runc
```

**逐行读：**

| 文件 | 作用 |
|---|---|
| `dockerd` | Docker 守护进程（后台服务） |
| `docker` | 命令行客户端 |
| `containerd` | 真正管容器生命周期的组件 |
| `runc` | 真正创建容器的底层工具 |
| `docker-proxy` | 端口映射用的 |
| `ctr` | containerd 自带的命令行（一般不用） |

**五个组件的关系：**

```text
你敲 docker  →  客户端把请求发给 dockerd
dockerd      →  调 containerd 创建容器
containerd   →  调 runc 真正启动进程
```

**复制到系统路径：**

```bash
cp docker/* /usr/bin/
chmod +x /usr/bin/docker* /usr/bin/containerd* /usr/bin/runc /usr/bin/ctr
```

**应该看到：没有输出。**

**验证：**

```bash
docker --version
```

**应该看到：**

```text
Docker version 27.3.1, build 8f5a1b2
```

**逐段读：**

```text
27.3.1     主版本.次版本.修订号
build ...  构建编号，用于精确对应某个发布
```

## 4.3 配 systemd 让 dockerd 常驻

**直接跑 `dockerd &` 的问题：**

```text
SSH 一断，dockerd 可能被带走。
机器重启，dockerd 不会自己起来。
```

**写一个 service 文件：**

```bash
cat > /etc/systemd/system/docker.service <<'EOF'
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/dockerd
ExecReload=/bin/kill -s HUP $MAINPID
TimeoutStartSec=0
Restart=always
RestartSec=2
LimitNOFILE=infinity
LimitNPROC=infinity
TasksMax=infinity

[Install]
WantedBy=multi-user.target
EOF
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `[Unit]` | 这个服务的基本信息 |
| `After=network-online.target` | 等网络就绪再启动 |
| `Type=notify` | dockerd 启动完会主动通知 systemd |
| `ExecStart=/usr/bin/dockerd` | 启动命令 |
| `Restart=always` | 挂了自动重启 |
| `LimitNOFILE=infinity` | 不限制打开文件数（容器多的时候必须） |
| `WantedBy=multi-user.target` | 开机自启 |

**启动：**

```bash
systemctl daemon-reload
systemctl enable docker
systemctl start docker
```

**应该看到（第三条）：没有输出。**

**`daemon-reload` 是干什么的：**

```text
你改了 /etc/systemd/system/ 下的文件，systemd 不会自动知道。
daemon-reload 让它重新读一遍配置。
不跑这一步，start 会用旧配置，或者报 "Unit docker.service not found"。
```

**验证：**

```bash
systemctl status docker
```

**应该看到：**

```text
● docker.service - Docker Application Container Engine
     Loaded: loaded (/etc/systemd/system/docker.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-03-10 11:02:14 CST; 12s ago
TriggeredBy: ● docker.socket
       Docs: https://docs.docker.com
   Main PID: 2841 (dockerd)
      Tasks: 9
     Memory: 48.2M
```

**逐行读：**

| 行 | 关键信息 |
|---|---|
| `loaded (...; enabled; ...)` | **enabled 表示开机自启已开** |
| `Active: active (running)` | 正在跑 |
| `Main PID: 2841 (dockerd)` | 进程号 |
| `Memory: 48.2M` | 空载内存 |

**如果 `Active: failed`：**

```bash
journalctl -u docker -n 50 --no-pager
```

**看最后 50 行日志找原因。**

## 4.4 装 compose 插件

**Docker 27 不带 `docker compose` 子命令，要单独放插件。**

```bash
mkdir -p /usr/local/lib/docker/cli-plugins
cp /opt/offline/offline-package/tools/docker-compose-linux-x86_64 \
   /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

**为什么是这个路径：**

```text
Docker 会在这几个目录找插件：
/usr/local/lib/docker/cli-plugins
/usr/lib/docker/cli-plugins
~/.docker/cli-plugins
放在第一个最稳，所有用户都能用。
```

**文件名必须是 `docker-compose`：**

```text
Docker 是按文件名找插件的：docker-compose → docker compose
你放成 docker-compose-linux-x86_64，它认不出来。
```

**验证：**

```bash
docker compose version
```

**应该看到：**

```text
Docker Compose version v2.24.6
```

**如果报：**

```text
docker: 'compose' is not a docker command.
```

**说明插件没被识别。检查三件事：**

```bash
ls -l /usr/local/lib/docker/cli-plugins/
docker info --format '{{.ClientInfo.Plugins}}'
```

**应该看到：**

```text
-rwxr-xr-x 1 root root 61513728 Mar 10 10:15 docker-compose
```

**插件列表里应该有 `compose`。**

---

# 第 5 步：导入镜像并起服务（25 分钟）

## 5.1 导入三个镜像

```bash
cd /opt/offline/offline-package
docker load -i images/chat-app-1.2.0.tar
docker load -i images/postgres-16.3.tar
docker load -i images/nginx-1.25.3.tar
```

**应该看到（第一个为例）：**

```text
Loaded image: chat-app:1.2.0
```

**如果是大镜像，会多几行：**

```text
b3a2c1d0e9f8: Loading layer [==================================================>]  65.4MB/65.4MB
Loaded image: postgres:16.3
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Loading layer` | 一层一层解压导入 |
| `65.4MB/65.4MB` | 这一层的大小 |
| `Loaded image: xxx:tag` | 导入完成，tag 已恢复 |

**注意最后一行：tag 是 `chat-app:1.2.0`，不是 `latest`。**

```text
docker save 会把 tag 一起存进去，load 的时候原样恢复。
所以第 233 节课强调"不要用 latest"——你 saved 的是什么，load 出来就是什么。
```

## 5.2 验证镜像

```bash
docker images
```

**应该看到：**

```text
REPOSITORY   TAG       IMAGE ID       CREATED       SIZE
chat-app     1.2.0     3f2a1b9c8d7e   2 days ago    182MB
nginx        1.25.3    1a2b3c4d5e6f   3 weeks ago   62MB
postgres     16.3      8e7d6c5b4a3f   5 weeks ago   128MB
```

**逐列读：**

| 列 | 看什么 |
|---|---|
| `TAG` | **必须是 1.2.0 / 1.25.3 / 16.3，不能是 `<none>`** |
| `IMAGE ID` | 每次构建会变，核对时用 tag 不用 ID |
| `SIZE` | 和打包时接近 |

**如果 TAG 是 `<none>`：**

```text
说明 load 的包没有 tag 信息（可能是 docker export 出来的，不是 docker save）。
docker export 只导出文件系统，不带镜像元数据和 tag。
必须用 docker save。
```

**验证架构：**

```bash
docker image inspect chat-app:1.2.0 --format '{{.Os}}/{{.Architecture}}'
```

**应该看到：**

```text
linux/amd64
```

**必须和客户机器一致。** 如果客户是 `aarch64` 而这里是 `amd64`，现在停下来，回头做 ARM 镜像。

**验证方法：**

```bash
uname -m
```

**两个输出必须"匹配"：**

| `uname -m` | 镜像架构 |
|---|---|
| `x86_64` | `linux/amd64` |
| `aarch64` | `linux/arm64` |

## 5.3 准备目录和配置

```bash
mkdir -p /opt/app/{data/postgres,data/uploads,logs/app,logs/nginx,nginx,backup,scripts}
cp /opt/offline/offline-package/config/docker-compose.yml /opt/app/
cp /opt/offline/offline-package/config/default.conf /opt/app/nginx/
cp /opt/offline/offline-package/config/.env.example /opt/app/.env
chmod 600 /opt/app/.env
cd /opt/app
```

**应该看到：没有输出。**

**编辑 `.env`，填真实密码：**

```bash
vi /opt/app/.env
```

**不会用 `vi` 就用 `nano`：**

```bash
nano /opt/app/.env
```

**`nano` 五个键：**

```text
直接打字
Ctrl + O   保存
Enter      确认文件名
Ctrl + X   退出
Ctrl + K   删一整行
```

**填完检查：**

```bash
cat /opt/app/.env
```

**应该看到：**

```text
DB_NAME=chatapp
DB_USER=chatapp
DB_PASSWORD=客户现场的强密码
SESSION_SECRET=随机串
```

**确认权限：**

```bash
ls -l /opt/app/.env
```

**应该看到：**

```text
-rw------- 1 root root 356 Mar 10 11:20 /opt/app/.env
```

## 5.4 起服务

```bash
docker compose up -d
```

**应该看到：**

```text
[+] Running 4/4
 ✔ Network app_backend       Created   0.2s
 ✔ Container chatapp-db      Healthy  13.1s
 ✔ Container chatapp-app     Started   2.4s
 ✔ Container chatapp-nginx   Started   0.9s
```

**如果卡在 `Container chatapp-db Starting` 很久：**

```bash
docker compose logs postgres --tail 30
```

**常见原因：**

```text
data/postgres 目录权限不对（容器里 postgres 用户是 uid 999）
或者目录里有旧版本的数据文件，版本不匹配
```

**修：**

```bash
chown -R 999:999 /opt/app/data/postgres
docker compose restart postgres
```

## 5.5 验证

**第一步：容器状态**

```bash
docker compose ps
```

**应该看到三个都是 `Up`，两个 `(healthy)`。**

**第二步：本机访问**

```bash
curl -s http://127.0.0.1/health
```

**应该看到：**

```text
{"status":"ok","db":"ok","version":"1.2.0"}
```

**如果客户机器没有 `curl`：**

```text
这是内网精简系统的常见问题。
用 wget：
wget -qO- http://127.0.0.1/health

如果两个都没有，用 node：
docker compose exec app node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(console.log)"
```

**第三步：从另一台机器访问**

```bash
curl -I http://10.20.30.40/
```

**应该看到：**

```text
HTTP/1.1 200 OK
Server: nginx/1.25.3
Content-Type: text/html
```

**逐行读：**

| 行 | 意思 | 不对说明什么 |
|---|---|---|
| `HTTP/1.1 200 OK` | 成功 | 502 是后端挂了，404 是配置错 |
| `Server: nginx/1.25.3` | 是 nginx 在响应 | 版本不对说明连到别的服务了 |
| `Content-Type: text/html` | 返回网页 | 返回 json 可能打到了 API |

**第四步：端口**

```bash
ss -lntp
```

**应该只有 22 和 80。**

---

# 第 6 步：写一个 install.sh（30 分钟）

## 6.1 为什么要脚本

**手工敲 20 条命令的问题：**

```text
① 敲错一条，后面全错
② 第二台机器要重敲一遍
③ 三个月后你不记得当时敲了什么
④ 客户 IT 问你"怎么装的"，你只能凭记忆
```

**脚本解决这四个问题，顺便变成交付文档的一部分。**

## 6.2 脚本全文

**文件：`scripts/install.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# chat-app 离线安装脚本
# 用法：sudo ./install.sh /opt/offline/offline-package
# ============================================================

PKG_DIR="${1:-}"
APP_DIR="/opt/app"
COMPOSE_BIN="/usr/local/lib/docker/cli-plugins/docker-compose"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

# ---------- 0. 前置检查 ----------
[ "$(id -u)" -eq 0 ] || fail "请用 root 运行：sudo $0 $*"
[ -n "$PKG_DIR" ] || fail "用法：$0 <离线包目录>"
[ -d "$PKG_DIR" ] || fail "目录不存在：$PKG_DIR"

log "离线包目录：$PKG_DIR"

# ---------- 1. 校验完整包 ----------
log "校验文件完整性"
cd "$PKG_DIR"
sha256sum -c SHA256SUMS --quiet || fail "校验失败，包可能损坏，请重新拷贝"

# ---------- 2. 检查架构 ----------
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  WANT="amd64" ;;
  aarch64) WANT="arm64" ;;
  *)       fail "不支持的架构：$ARCH" ;;
esac
log "本机架构：$ARCH（需要镜像 linux/$WANT）"

# ---------- 3. 安装 Docker（如果没有） ----------
if ! command -v docker >/dev/null 2>&1; then
  log "未检测到 docker，使用离线包安装"
  tar -xzf "$PKG_DIR/tools/docker-27.3.1.tgz" -C /tmp
  cp /tmp/docker/* /usr/bin/
  chmod +x /usr/bin/docker* /usr/bin/containerd* /usr/bin/runc
  cp "$PKG_DIR/scripts/docker.service" /etc/systemd/system/docker.service
  systemctl daemon-reload
  systemctl enable docker
  systemctl start docker
  sleep 5
else
  log "已安装 docker：$(docker --version)"
fi

systemctl is-active --quiet docker || fail "docker 服务未启动"

# ---------- 4. 安装 compose 插件 ----------
if ! docker compose version >/dev/null 2>&1; then
  log "安装 compose 插件"
  mkdir -p "$(dirname "$COMPOSE_BIN")"
  cp "$PKG_DIR/tools/docker-compose-linux-x86_64" "$COMPOSE_BIN"
  chmod +x "$COMPOSE_BIN"
fi
log "compose 版本：$(docker compose version)"

# ---------- 5. 导入镜像 ----------
log "导入镜像"
for f in "$PKG_DIR"/images/*.tar; do
  log "  load $(basename "$f")"
  docker load -i "$f"
done

# ---------- 6. 架构复核 ----------
IMG_ARCH="$(docker image inspect chat-app:1.2.0 --format '{{.Architecture}}')"
[ "$IMG_ARCH" = "$WANT" ] || fail "镜像架构 $IMG_ARCH 与本机 $WANT 不匹配"
log "架构复核通过：$IMG_ARCH"

# ---------- 7. 准备目录 ----------
log "准备目录 $APP_DIR"
mkdir -p "$APP_DIR"/{data/postgres,data/uploads,logs/app,logs/nginx,nginx,backup,scripts}
cp "$PKG_DIR/config/docker-compose.yml" "$APP_DIR/"
cp "$PKG_DIR/config/default.conf" "$APP_DIR/nginx/"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$PKG_DIR/config/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  fail "已生成 $APP_DIR/.env，请先填写密码，然后重新运行本脚本"
fi
chown -R 999:999 "$APP_DIR/data/postgres"

# ---------- 8. 启动 ----------
cd "$APP_DIR"
log "启动服务"
docker compose up -d

# ---------- 9. 健康检查 ----------
log "等待服务就绪"
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    log "应用健康检查通过（第 ${i} 次尝试）"
    break
  fi
  [ "$i" -eq 30 ] && fail "健康检查超时，查看：docker compose logs app"
  sleep 2
done

# ---------- 10. 汇总 ----------
log "安装完成"
docker compose ps
IP="$(hostname -I | awk '{print $1}')"
log "访问地址：http://${IP}/"
```

## 6.3 逐段读脚本

| 段 | 作用 | 少了会怎样 |
|---|---|---|
| `set -euo pipefail` | 出错立即停、未定义变量报错、管道错误也报错 | 出错继续跑，装出一半坏一半 |
| `[ "$(id -u)" -eq 0 ]` | 检查是不是 root | 后面所有 `cp` 到 `/usr/bin` 全失败 |
| `sha256sum -c` | 校验包 | 坏包也照装，load 到一半失败 |
| `uname -m` → `WANT` | 架构映射 | ARM 机器装 x86 镜像，起不来 |
| `command -v docker` | 有没有 docker | 重复安装，覆盖客户原有版本 |
| `systemctl is-active` | 服务真的在跑 | 以为装好了，其实没起来 |
| `docker image inspect` | 复核架构 | 前一步的映射白做 |
| `[ ! -f .env ]` | 只在没有时生成 | 覆盖客户已填好的密码 |
| `chown 999:999` | postgres 权限 | 数据库容器反复重启 |
| 健康检查循环 | 确认真的能用 | 脚本跑完报成功，实际 502 |

**`set -euo pipefail` 三个参数拆开：**

| 参数 | 作用 |
|---|---|
| `-e` | 任何命令返回非 0 就退出 |
| `-u` | 用了未定义的变量就报错 |
| `-o pipefail` | 管道里任何一个命令失败，整条管道算失败 |

**为什么 `pipefail` 重要：**

```text
docker load -i x.tar | tee log.txt
没有 pipefail，tee 成功就返回 0，即使 docker load 失败了，脚本也继续。
```

## 6.4 运行脚本

```bash
chmod +x scripts/install.sh
./scripts/install.sh /opt/offline/offline-package
```

**第一次运行（.env 还没填）应该看到：**

```text
[11:30:01] 离线包目录：/opt/offline/offline-package
[11:30:01] 校验文件完整性
[11:30:18] 本机架构：x86_64（需要镜像 linux/amd64）
[11:30:18] 已安装 docker：Docker version 27.3.1, build 8f5a1b2
[11:30:19] compose 版本：Docker Compose version v2.24.6
[11:30:19] 导入镜像
[11:30:19]   load chat-app-1.2.0.tar
[11:30:24]   load nginx-1.25.3.tar
[11:30:26]   load postgres-16.3.tar
[11:30:30] 架构复核通过：amd64
[11:30:30] 准备目录 /opt/app
[ERROR] 已生成 /opt/app/.env，请先填写密码，然后重新运行本脚本
```

**这个"报错"是设计好的。** 脚本故意停下来，让你填密码。

**填完 `.env` 再跑一次：**

```text
[11:35:02] 离线包目录：/opt/offline/offline-package
[11:35:02] 校验文件完整性
[11:35:19] 本机架构：x86_64（需要镜像 linux/amd64）
[11:35:19] 已安装 docker：Docker version 27.3.1, build 8f5a1b2
[11:35:19] compose 版本：Docker Compose version v2.24.6
[11:35:19] 导入镜像
[11:35:33] 架构复核通过：amd64
[11:35:33] 准备目录 /opt/app
[11:35:33] 启动服务
[+] Running 4/4
 ✔ Network app_backend       Created
 ✔ Container chatapp-db      Healthy
 ✔ Container chatapp-app     Started
 ✔ Container chatapp-nginx   Started
[11:35:48] 等待服务就绪
[11:35:51] 应用健康检查通过（第 2 次尝试）
[11:35:51] 安装完成
```

**最后会打印 `docker compose ps` 和访问地址。**

**把整段输出存下来：**

```bash
./scripts/install.sh /opt/offline/offline-package 2>&1 | tee /opt/app/install-20260310.log
```

**`2>&1 | tee` 是什么：**

```text
2>&1    把错误输出合并到标准输出
|       交给下一个命令
tee     同时打印到屏幕和写入文件
```

**这份日志就是《安装记录》，交付时要给客户。**

---

# 第 7 步：内网 registry（多机时才需要）（20 分钟）

## 7.1 什么时候需要

| 场景 | 要不要 registry |
|---|---|
| 1 台机器 | 不需要，`docker load` 就够 |
| 2—3 台机器 | 可以 load，也可以搭 |
| 5 台以上 / 经常升级 | **需要**，否则每台都要拷 1G |

**搭了之后的好处：**

```text
镜像只存一份在这台 registry 上。
其他机器 docker pull 10.20.30.40:5000/chat-app:1.2.0 就行。
升级时 push 一次，所有机器 pull 一次。
```

## 7.2 起一个 registry

**镜像已经在离线包里（如果没有，先在能联网的机器上 save）：**

```bash
docker load -i images/registry-2.tar
```

**起服务：**

```bash
docker run -d \
  --name registry \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /opt/registry:/var/lib/registry \
  registry:2
```

**应该看到：**

```text
3f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a
```

**逐行读：**

| 参数 | 意思 |
|---|---|
| `-d` | 后台运行 |
| `--name registry` | 容器名 |
| `-p 5000:5000` | **这个端口要对内网开放** |
| `-v /opt/registry:...` | 镜像存在宿主目录，容器删了不丢 |
| `registry:2` | 官方 registry 镜像 |

**⚠️ 注意：这是唯一一个"要开放端口"的内部服务。**

```text
5000 端口只对需要拉镜像的机器开放，不要对整个内网开。
```

## 7.3 让 Docker 信任这个 registry

**HTTP 的 registry，Docker 默认不信任。**

```bash
cat > /etc/docker/daemon.json <<'EOF'
{
  "insecure-registries": ["10.20.30.40:5000"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" }
}
EOF
```

**应该看到：没有输出。**

**`insecure-registries` 是什么意思：**

```text
允许 Docker 用 HTTP（不加密）访问这个地址。
生产环境最好配 HTTPS，但内网自签证书很麻烦，
很多私有化项目就用 HTTP + 限制网段。
这是一个真实的取舍，要写进方案。
```

**重启 Docker 让配置生效：**

```bash
systemctl daemon-reload
systemctl restart docker
```

**⚠️ 重启 Docker 会重启所有容器。**

```text
如果你已经在跑 app，docker restart docker 会让它们全部重启。
虽然 restart 策略会让它们自动起来，但会有几十秒中断。
要在维护窗口做，不要在生产时段做。
```

## 7.4 push 和 pull

**给镜像打上 registry 前缀：**

```bash
docker tag chat-app:1.2.0 10.20.30.40:5000/chat-app:1.2.0
```

**push：**

```bash
docker push 10.20.30.40:5000/chat-app:1.2.0
```

**应该看到：**

```text
The push refers to repository [10.20.30.40:5000/chat-app]
5f70bf18a086: Pushed
8a1b2c3d4e5f: Pushed
1.2.0: digest: sha256:9f2c1a4e... size: 1365
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `The push refers to repository [...]` | 推到哪个仓库 |
| `5f70bf18a086: Pushed` | 这一层推完了 |
| `digest: sha256:...` | 整个镜像的摘要 |

**在另一台机器上 pull：**

```bash
docker pull 10.20.30.40:5000/chat-app:1.2.0
```

**应该看到：**

```text
1.2.0: Pulling from chat-app
Digest: sha256:9f2c1a4e...
Status: Downloaded newer image for 10.20.30.40:5000/chat-app:1.2.0
```

**验证仓库里有什么：**

```bash
curl -s http://10.20.30.40:5000/v2/_catalog
```

**应该看到：**

```text
{"repositories":["chat-app","postgres","nginx"]}
```

**如果 `curl` 不存在：**

```bash
wget -qO- http://10.20.30.40:5000/v2/_catalog
```

**`_catalog` 是什么：**

```text
registry 的 API，列出所有仓库名。
它不列 tag，要看 tag 用：
curl -s http://10.20.30.40:5000/v2/chat-app/tags/list
```

**应该看到：**

```text
{"name":"chat-app","tags":["1.2.0","1.1.0"]}
```

---

# 第 8 步：故意犯 7 个错（40 分钟）

## 错误 1：用 FAT32 的 U 盘拷 5G 的包

**操作：**

```bash
cp chat-app-offline-1.2.0.tar.gz /run/media/root/KINGSTON/
```

**会怎样：**

```text
cp: error writing '/run/media/root/KINGSTON/chat-app-offline-1.2.0.tar.gz':
File too large
```

**Windows 上更直白：**

```text
文件“chat-app-offline-1.2.0.tar.gz”对于目标文件系统过大。
```

**为什么：**

```text
FAT32 用 32 位无符号整数记录文件长度，上限 4,294,967,295 字节。
你的包 5.2G，超过上限，文件系统直接拒绝。
不是 U 盘坏了，也不是空间不够。
```

**怎么修：**

**方案一：拆包（不动客户的 U 盘）**

```bash
split -b 3G -d chat-app-offline-1.2.0.tar.gz part-
```

**现场合并：**

```bash
cat part-* > chat-app-offline-1.2.0.tar.gz
sha256sum chat-app-offline-1.2.0.tar.gz
```

**方案二：不压缩，直接拷目录**

```text
目录里的单个文件最大是 380M 的镜像包，FAT32 完全放得下。
先拷 offline-package/ 整个目录，到现场再装。
```

**方案三：让客户准备 exFAT 的 U 盘**

```text
提前在确认单里写清"离线包约 X G，请准备 exFAT 格式 U 盘或移动硬盘"。
```

## 错误 2：忘了带 compose 插件

**操作：**

你只带了镜像，觉得"客户机器上有 docker 就行"。

**会怎样：**

```text
$ docker compose up -d
docker: 'compose' is not a docker command.
See 'docker --help'
```

**为什么：**

```text
Docker 27 把 compose 拆成了独立插件。
docker 命令本身不带 compose，它会在 cli-plugins 目录里找名为 docker-compose 的可执行文件。
你没有这个文件，它就报"不是一个 docker 命令"。
```

**怎么修：**

```bash
mkdir -p /usr/local/lib/docker/cli-plugins
cp tools/docker-compose-linux-x86_64 /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

**应该看到：**

```text
Docker Compose version v2.24.6
```

**如果还是不行，检查：**

```bash
docker info --format '{{.ClientInfo.Plugins}}'
```

**应该看到列表里有 `compose`。**

**文件名必须叫 `docker-compose`。** 带版本号的后缀它不认。

## 错误 3：用 `docker export` 代替 `docker save`

**操作：**

```bash
docker export $(docker create chat-app:1.2.0) > images/chat-app.tar
```

**会怎样：**

```bash
docker load -i images/chat-app.tar
```

```text
Loaded image: sha256:3f2a1b9c8d7e...
```

```bash
docker images
```

**应该看到：**

```text
REPOSITORY   TAG       IMAGE ID       CREATED       SIZE
<none>       <none>    3f2a1b9c8d7e   2 days ago    182MB
```

**为什么：**

```text
docker export 只导出容器里的文件系统，是一个"扁平的文件快照"。
它不带镜像的元数据：没有 tag、没有历史层、没有 Entrypoint、没有 Env。
docker load 只能给它一个假的 <none> 名字。
```

**怎么修：**

```bash
# 先给它打 tag 才能用
docker tag 3f2a1b9c8d7e chat-app:1.2.0

# 但更正确的是重新用 save 导出
docker save -o images/chat-app-1.2.0.tar chat-app:1.2.0
```

**两个命令的区别，一句话记住：**

```text
docker save     存"镜像"（带元数据、tag、分层），用 docker load 还原
docker export   存"容器的文件系统"（扁平），用 docker import 还原
交付镜像永远用 save / load。
```

## 错误 4：包在传输中坏了，没有校验

**操作：**

拷完直接装：

```bash
docker load -i images/chat-app-1.2.0.tar
```

**会怎样：**

```text
b3a2c1d0e9f8: Loading layer [==============================>       ]  120.3MB/182MB
Error processing tar file(exit status 1): unexpected EOF
```

**为什么：**

```text
tar 文件在拷贝时被截断（U 盘拔早了、空间不足、坏块）。
docker load 读到一半发现"文件应该还有，但没了"，就是 unexpected EOF。
```

**怎么修：**

```bash
sha256sum -c SHA256SUMS
```

**应该看到：**

```text
./images/chat-app-1.2.0.tar: FAILED
sha256sum: WARNING: 1 computed checksum did NOT match
```

**然后重新拷这一个文件。**

**养成习惯：**

```text
① 打包时生成 SHA256SUMS
② 拷完立刻校验
③ 校验通过才开始装
```

**不校验的后果：**

```text
你会在装了 40 分钟、客户站在旁边看的时候，发现第 3 个镜像坏了。
```

## 错误 5：磁盘空间不够

**操作：**

```bash
docker load -i images/app-src-1.2.0.tar.gz
```

**会怎样：**

```text
write /var/lib/docker/tmp/GetImageBlob123456: no space left on device
```

**为什么：**

```text
docker load 要先解压到 /var/lib/docker/tmp，再移动到最终位置。
这个过程需要大约 2 倍镜像大小的临时空间。
你只剩 500M，导 1G 的镜像，必然失败。
```

**怎么修：**

**先看空间：**

```bash
df -h /var/lib/docker
```

**应该看到：**

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        50G   48G  1.2G  98% /
```

**98%，这就是原因。**

**清理：**

```bash
# 看 docker 占了多少
docker system df
```

**应该看到：**

```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          8         3         4.2GB     2.8GB (66%)
Containers      3         3         120MB     0B (0%)
Local Volumes   5         2         1.1GB     800MB (72%)
Build Cache     12        0         1.4GB     1.4GB
```

**⚠️ 下一步是危险操作，先看清楚再敲：**

```bash
# 只删"没有容器在用"的镜像
docker image prune -a
```

**`-a` 会把所有没被容器引用的镜像都删掉，包括你准备用的。**

```text
删之前先 docker images 看一遍，确认要保留的镜像有容器在用。
在客户生产环境上，这一步要客户签字。
```

**更安全的做法：**

```bash
# 只清理构建缓存
docker builder prune

# 只清理停止的容器
docker container prune
```

**长期方案：**

```text
把 /var/lib/docker 单独挂一块盘，或者装 Docker 时就指定 data-root。
在 /etc/docker/daemon.json 里加：
{ "data-root": "/opt/docker" }
```

## 错误 6：离线包没带 node_modules，现场 build 失败

**操作：**

你在现场改了一行配置，重新 build：

```bash
docker build -t chat-app:1.2.1 .
```

**会怎样：**

```text
[+] Building 12.4s (6/8)
 => [3/5] RUN npm ci --omit=dev
#9 8.412 npm ERR! code ENOTFOUND
#9 8.412 npm ERR! syscall getaddrinfo
#9 8.412 npm ERR! errno ENOTFOUND
#9 8.412 npm ERR! network request to https://registry.npmjs.org/express failed
#9 8.412 npm ERR! network This is a problem related to network connectivity
```

**为什么：**

```text
npm ci 要连 registry.npmjs.org 下载依赖。
内网没有出口，DNS 都解析不了，所以是 ENOTFOUND（找不到主机），
不是 ETIMEDOUT（连不上）。
```

**怎么修：**

**方案一：不 build，直接改容器里的文件（临时）**

```bash
docker compose exec app sh -c "sed -i 's/old/new/' /app/config.js"
docker compose restart app
```

**⚠️ 这个改动在容器重建后消失，只能应急。**

**方案二：用带 node_modules 的源码重新 build**

```bash
tar -xzf images/app-src-1.2.0.tar.gz
cd app
# 确认 node_modules 在
ls node_modules | head -3
docker build -t chat-app:1.2.1 .
```

**前提是 Dockerfile 写成"有 node_modules 就跳过安装"：**

```dockerfile
RUN if [ ! -d node_modules ]; then npm ci --omit=dev; fi
```

**方案三：在内网搭一个 npm 镜像（不推荐，维护成本高）**

```text
要同步整个 registry，几个 G，还要定期更新。
私有化项目里通常不值得。
```

**最好的做法：**

```text
离线包里同时带"构建好的镜像"和"带 node_modules 的源码"。
现场优先用镜像，实在要改才 build。
```

## 错误 7：客户机器没有 curl，健康检查误判

**操作：**

你的 `install.sh` 里写：

```bash
if curl -s http://127.0.0.1/health | grep -q ok; then
  echo "OK"
fi
```

**会怎样：**

```text
./install.sh: line 42: curl: command not found
[ERROR] 健康检查失败
```

**但服务其实是好的。**

**为什么：**

```text
客户用的是精简版系统，只装了最少的包，没有 curl。
你的脚本把"命令不存在"当成了"服务不健康"。
```

**怎么修：**

**检查有哪些工具：**

```bash
command -v curl wget nc python3 node
```

**应该看到（举例）：**

```text
/usr/bin/wget
/usr/bin/node
```

**说明没有 curl，有 wget 和 node。**

**改脚本，按可用性降级：**

```bash
check_health() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1/health >/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- http://127.0.0.1/health >/dev/null
  else
    # 用容器里的 node，完全不依赖宿主工具
    docker compose exec -T app node -e \
      "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  fi
}
```

**最稳的是第三种：**

```text
它用的是应用镜像里的 node，不依赖客户宿主机装了什么。
只要容器起来了，这个检查就能跑。
```

**这也是第 6 步的 install.sh 里用 node 而不是 curl 的原因。**

---

# 第 9 步：写学习笔记（10 分钟）

**把下面这份模板复制到 `02-笔记/NOTES.md`，然后填。**

````markdown
# 第 234 节课学习笔记

## 一、离线包清单（我自己列一遍）

| 类别 | 文件 | 体积 | 不带会怎样 |
|---|---|---|---|
| 应用镜像 | | | |
| 数据库镜像 | | | |
| 代理镜像 | | | |
| Docker 引擎 | | | |
| compose 插件 | | | |
| 源码 + node_modules | | | |
| 配置 | | | |
| 脚本 | | | |
| 校验和 | | | |

## 二、`docker save` 和 `docker export` 的区别

| | save | export |
|---|---|---|
| 导出对象 | | |
| 带不带 tag | | |
| 还原命令 | | |

## 三、我导出的镜像架构

`docker image inspect chat-app:1.2.0 --format '{{.Os}}/{{.Architecture}}'` 输出：

本机 `uname -m` 输出：

两者匹配吗：

## 四、装 Docker 的五步

1.
2.
3.
4.
5.

## 五、compose 插件放在哪

路径：

文件名必须是：

验证命令和输出：

## 六、我的 install.sh 加/减了什么

## 七、七个错误

| 错误 | 报错原文 | 修法 |
|---|---|---|
| FAT32 拷大包 | | |
| 没带 compose | | |
| export 代替 save | | |
| 包损坏 | | |
| 磁盘满 | | |
| 缺 node_modules | | |
| 没有 curl | | |

## 八、现场安装记录（时间 + 做了什么 + 看到什么）

| 时间 | 做什么 | 结果 |
|---|---|---|
| | | |

## 九、我还不懂的词

-

## 十、完成检查

- [ ] 我做出过一个离线包目录结构
- [ ] 我跑过 `docker save` 和 `docker load`
- [ ] 我验证过镜像架构
- [ ] 我装过（或模拟装过）compose 插件
- [ ] 我的 install.sh 能跑通
- [ ] 我做了至少 4 个错误实验
````

---

# 第 10 步：课后练习（70 分钟）

## 练习 1：做一个最小离线包

**要求：**

打一个只含 `nginx:1.25.3` 的离线包，含 `SHA256SUMS` 和 `manifest.txt`。

**记录什么：**

```text
包多大。
校验和是多少。
manifest 里写了哪几行。
```

**思考题：**

```text
如果客户只要一个 nginx，你还需要带 Docker 引擎吗？为什么？
```

## 练习 2：完整走一遍 save → load

**要求：**

```bash
docker save -o /tmp/nginx.tar nginx:1.25.3
docker rmi nginx:1.25.3
docker load -i /tmp/nginx.tar
docker images | grep nginx
```

**记录什么：**

```text
rmi 之后 docker images 还有没有 nginx。
load 之后 tag 是不是 1.25.3。
```

**思考题：**

```text
如果 load 之后 tag 变成 <none>，最可能是什么原因？
```

## 练习 3：写一个能降级的健康检查函数

**要求：**

按错误 7 的写法，写一个函数：有 curl 用 curl，有 wget 用 wget，都没有用容器里的 node。

**记录什么：**

```text
你的机器上有哪几个工具。
三种分支你各测了哪一条。
```

**思考题：**

```text
为什么"用容器里的 node"最稳？它依赖客户机器上的什么？
```

## 练习 4：算一次传输时间

**要求：**

你的包 1.1G，U 盘写入速度 15MB/s，读取 80MB/s。算拷贝要多久、装机要多久。

**记录什么：**

| 步骤 | 数据量 | 速度 | 时间 |
|---|---|---|---|
| 拷到 U 盘 | | | |
| 从 U 盘拷到服务器 | | | |
| load 三个镜像 | | | |
| 起服务 + 健康检查 | | | |
| **合计** | | | |

**思考题：**

```text
如果客户只给你 2 小时窗口，这个包来得及吗？哪一步可以提前做？
```

## 练习 5：写一份《现场安装检查表》

**要求：**

把第 3—6 步拆成 15 条可勾选的检查项，每条写"怎么验"。

**记录什么：**

```text
哪几条是"不做就会返工"的。
哪几条是"客户要签字的"。
```

**思考题：**

```text
如果只能保留 5 条，你保留哪 5 条？
```

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清 `docker save` 和 `docker export` 的区别
- [ ] 我能说清为什么离线包要带 Docker 引擎和 compose 插件
- [ ] 我能解释为什么 `load` 出来的 tag 是 `<none>`
- [ ] 我能说清 `set -euo pipefail` 三个参数各管什么

## B. 实操

- [ ] 我做出过一个离线包目录（images / tools / config / scripts）
- [ ] 我生成并校验过 `SHA256SUMS`
- [ ] 我跑过 `docker save` → `docker rmi` → `docker load`
- [ ] 我验证过镜像架构是 `linux/amd64` 或 `linux/arm64`
- [ ] 我装过 compose 插件，`docker compose version` 有输出

## C. 排错

- [ ] 我看到 `unexpected EOF` 会先跑 `sha256sum -c`
- [ ] 我看到 `no space left on device` 会先看 `df -h` 和 `docker system df`
- [ ] 我看到 `'compose' is not a docker command` 知道去装插件
- [ ] 我看到 `: <none>` 知道是 export 用错了

## D. 交付

- [ ] `03-练习代码/` 里有离线包结构、`install.sh`、安装记录
- [ ] `install.sh` 有 root 检查、校验、架构检查、健康检查
- [ ] 安装记录里有真实的时间和输出
- [ ] manifest 里写清了每个文件的版本

## E. 笔记

- [ ] `02-笔记/NOTES.md` 填完
- [ ] 我列过自己的离线包清单
- [ ] 我能说出七个错误里任意五个的修法

## 本节课要能说出口的一句话

> **离线安装的难点不是装，是"你以为带齐了"。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 拷包报"文件过大" | U 盘是 FAT32 | `split` 拆包，或换 exFAT |
| `docker: 'compose' is not a docker command` | 没装插件 | 放 `docker-compose` 到 cli-plugins |
| `No such image: xxx:latest` | tag 不匹配 | `docker images` 看实际 tag |
| `exec format error` | 镜像架构不对 | 用对应架构重建 |
| `unexpected EOF` | 包损坏 | 校验后重拷 |
| `no space left on device` | 磁盘满 | 清镜像/缓存，或扩盘 |
| tag 显示 `<none>` | 用了 `docker export` | 改用 `docker save` |
| `npm ERR! ENOTFOUND` | 内网无 DNS/出口 | 用带 node_modules 的源码 |
| `curl: command not found` | 精简系统 | 用 wget 或容器内 node |
| `docker load` 很慢 | 镜像大 + 磁盘慢 | 正常，等；或改用 registry |
| registry `http: server gave HTTP response to HTTPS client` | 没配 insecure-registries | 改 `daemon.json` 重启 docker |
| 客户机器 `systemctl` 不存在 | 非 systemd 系统 | 用 `dockerd &` + 启动脚本 |

---

## 下一节课要带什么

第 235 节课讲本地模型。你需要带着：

```text
一个能跑起来的离线环境（或者你自己的 Docker）
确认单上的机器配置（内存够不够跑 7B）
这一节课做出来的 install.sh（后面要往里加 ollama）
```

**第 235 节课会往这个离线包里再加一个 1.5G 的镜像和 4.7G 的模型文件。**
**你的 U 盘要够大。**
