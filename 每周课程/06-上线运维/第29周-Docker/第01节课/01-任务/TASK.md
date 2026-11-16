# 第 197 节课：认识容器——为什么"我本地能跑"是个陷阱

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 28 周你交付了小程序和公众号。这一周开始，你要把项目装进容器。装容器之前，先得把 Docker 装上，并且理解它到底在干什么。
> 这节课不写一行业务代码。今天的成果是：**你的电脑上有一个能用的 Docker，你知道镜像和容器的区别，你知道"我本地能跑"这句话为什么不算数。**

**建议用时**：120 分钟
**你需要先完成**：第 196 节课（第 28 周收口）。具体要求：你的 `chat-app` 在你电脑上能用 `npm run dev` 或 `node server.js` 跑起来，浏览器能打开 `http://localhost:3000`。

**而且——上线之前，先确认你的 `chat-app` 里到底有什么。**

打开它，走一遍这六步：注册 → 登录 → 发一条对话 → 进后台改个配置 → 传一张图 → 看文件列表。

**六步里有任何一步走不过去，先停下来补，别往下走。** 补的方法在 `final/README.md` 第三节（第 70 节收口时做过一次合并）。缺的东西就在第 8—10 周的 `auth-lab` 里，拷过来接上就行。

> **为什么现在必须停下来检查**：容器化和上服务器会把你"代码里的缺口"变成"线上的缺口"。**在这些机器上补业务代码，比在自己电脑上补贵十倍**——你要多走一遍 build、push、pull、重启，每次五分钟起步。
>
> 这一周要动的是环境和部署，不是功能。**功能有洞，先在本地补完。**

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

到这一周之前，你交付一个项目的方式是：

```text
① 在自己电脑上装 Node
② npm install
③ 建一个 .env，把 key 填进去
④ node server.js
⑤ 浏览器打开 localhost:3000，能用
```

**这套流程你自己走一遍没问题。**

**问题在于：这套流程里有一半东西不在你的项目文件夹里。**

```text
项目文件夹里有：   server.js  package.json  public/  data/
项目文件夹里没有：  Node 22.x   npm      你系统里的 C++ 运行库
                   Python（有些 npm 包要编译）  系统时区
```

**所以你交付的从来不是"一个项目"，是"你的项目 + 你的电脑"。**

## 0.2 你以后会遇到什么

```text
① "客户说他那边打不开，我本地好好的"        ← 环境不一样
② "服务器上 npm install 卡了 40 分钟还报错"   ← 服务器没有编译工具
③ "同事说你的代码我跑不起来，缺个什么包"      ← 依赖没锁全
④ "我要同时跑两个项目，一个要 Node 20，一个要 Node 22"  ← 全局只能装一个
⑤ "数据库装完，重启电脑就连不上了"            ← 服务没设开机自启
```

**这五个场景，都是同一个病：程序依赖"环境"，而环境没被管理。**

**这五个场景，装 Docker 之后全变成一件事：把环境也打包。**

## 0.3 今天要建立的三个概念

```text
① 镜像（image）—— 一个装满"程序和它要的环境"的压缩包，只读，不会变
② 容器（container）—— 镜像跑起来之后的那个"正在运行的进程"，可以随便删
③ 宿主机（host）—— 你自己的这台 Windows 电脑，容器跑在它上面
```

**这三个词今天必须分清。** 分不清，后面所有命令你都只能背。

## 0.4 今天的交付物

| 文件 / 东西 | 位置 | 内容 |
|---|---|---|
| Docker Desktop | 你的电脑，全局安装 | 能跑 `docker run hello-world` |
| `NOTES.md` | `第01节课/02-笔记` | 你的学习记录 |
| `docker-lab/` | `第01节课/03-练习代码` | 你自己建的实验目录，放命令输出记录 |
| `TASK.md` | `第01节课/01-任务` | 你正在读的这份 |

**注意：今天不产生任何项目代码。** `chat-app` 一个字都不改。

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **只有你的 Windows 电脑。** 这一节不碰服务器，不碰项目代码。 |
| **用哪个终端** | **两个都要用：** 先用 **PowerShell（管理员）** 查 WSL，再用 **Git Bash** 跑 docker 命令。<br>Git Bash 在哪：开始菜单搜 `Git Bash`，或在任意文件夹空白处右键 → `Git Bash Here`。 |
| **现在在哪个目录** | **随便哪个目录都行**，今天不建项目。建议先建一个固定实验室目录（下面这段在 Git Bash 里跑，只跑一次）：<br><code>mkdir -p "B:/OPC-Distance_study/每周课程/06-上线运维/第29周-Docker/第01节课/03-练习代码/docker-lab"</code><br><code>cd "B:/OPC-Distance_study/每周课程/06-上线运维/第29周-Docker/第01节课/03-练习代码/docker-lab"</code> |
| **本节新建什么** | `docker-lab/`（空目录，放命令输出记录）<br>`命令记录.md`（自己建，贴本章所有命令输出） |

## 开工前先跑这一条

确认你没站错地方：

```bash
docker version
```

**应该看到：**

**前半段肯定有，后半段可能报错：**

```text
Client: Docker Engine - Community
 Version: 27.x.x
...
Server: Docker Engine - Community
 Version: 27.x.x
```

**关键看有没有 `Server:` 这一段。**

- 有 `Server:` = 引擎跑起来了，可以开工
- 只有 `Client:` = 装好了但引擎没起（第 2 步解决）
- `bash: docker: command not found` = 还没装，从第 1 步走

## 如果不对

**报 `command not found`** → 还没装 Docker，正常，从第 1 步开始。

**只有 `Client` 没有 `Server`** → 引擎没起：打开 Docker Desktop，左下角等鲸鱼图标变绿，再跑一次。

---

# 第 1 步：先确认你的电脑能不能装（20 分钟）

## 1.1 三个硬条件，缺一个就装不上

Docker Desktop 在 Windows 上不是"双击下一步下一步"就能装完的。它有三个前置条件：

| 条件 | 是什么 | 缺了会怎样 |
|---|---|---|
| **CPU 虚拟化** | CPU 的一个硬件功能，要在 BIOS 里开 | 装完打不开，报"需要启用虚拟化" |
| **WSL 2** | Windows 自带的 Linux 子系统，第 2 版 | Docker 引擎跑不起来 |
| **Windows 版本** | Windows 11（或 Win10 2004 以上） | 装不上，或只能装很老的版本 |

**为什么 Docker 需要这些：**

Docker 容器本质上是 **Linux 的进程隔离技术**（`namespace` 和 `cgroups`）。

**你的电脑是 Windows，不是 Linux。** 所以 Docker 必须先在 Windows 里跑一个很小的 Linux，再在那个 Linux 里跑你的容器。

**WSL 2 就是那个"很小的 Linux"。**

> **这句话很重要，记住它：Windows 上的 Docker，容器其实跑在一个你看不见的 Linux 里。**
>
> 后面你遇到"路径怎么不对""为什么 `localhost` 连不上"，根子都在这里。

## 1.2 查 CPU 虚拟化有没有开

**操作：**

1. 按 `Ctrl + Shift + Esc` 打开任务管理器；
2. 点左边「性能」；
3. 点「CPU」；
4. 看右下角那一块。

**应该看到：**

```text
虚拟化:  已启用
```

**如果是「已禁用」：**

```text
虚拟化:  已禁用
```

**那就得进 BIOS 打开。** 名字各家不同，常见叫法：

```text
Intel CPU：Intel Virtualization Technology / VT-x / Vanderpool
AMD CPU：  SVM Mode / AMD-V
```

**进 BIOS 的方法：** 重启，开机出现厂商 logo 时连按 `Del` 或 `F2` 或 `F10`（看屏幕提示）。

**这一步没有替代方案。** 虚拟化不开，Docker 一定装不上，装上了也起不来。

**不确定就先往下走。** 装 Docker Desktop 的时候它会自己检查，检查不过会明确告诉你。

## 1.3 查 WSL 现在是几版

**打开 PowerShell（管理员）**：开始菜单搜 `PowerShell`，右键「以管理员身份运行」。

**操作：**

```powershell
wsl --status
```

**应该看到类似：**

```text
默认版本: 2
当前计算机配置支持的 WSL 默认版本。
```

**中文系统输出是中文的，英文系统是 `Default Version: 2`。看到 `2` 就对了。**

**再看装了哪些发行版：**

```powershell
wsl --list --verbose
```

**应该看到类似：**

```text
  NAME              STATE           VERSION
* Ubuntu-22.04      Running         2
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `NAME` | 这个 Linux 叫什么名字 |
| `STATE` | `Running` 正在跑 / `Stopped` 停着 |
| `VERSION` | **必须是 2**，是 1 就不行 |
| `*` | 默认进哪个 |

**如果提示"系统找不到指定的文件"或者列表是空的：**

```text
适用于 Linux 的 Windows 子系统没有已安装的分发版。
```

**那就是还没装 WSL。** 去 1.4。

**如果 `VERSION` 那一列是 `1`：**

**把它改成 2：**

```powershell
wsl --set-default-version 2
```

**如果它报错说需要更新内核：**

```text
WSL 2 requires an update to its kernel component. For information please visit https://aka.ms/wsl2kernel
```

**先跑这个：**

```powershell
wsl --update
```

**装完再跑一次 `wsl --set-default-version 2`。**

## 1.4 装 / 修 WSL

**如果你的电脑从来没装过 WSL，一条命令搞定（Windows 11）：**

```powershell
wsl --install
```

**这条命令做三件事：**

```text
① 打开「虚拟机平台」和「适用于 Linux 的 Windows 子系统」两个 Windows 功能
② 下载 WSL 2 内核
③ 装一个默认的 Ubuntu
```

**跑完它会说：**

```text
正在安装: 虚拟机平台
正在安装: 适用于 Linux 的 Windows 子系统
已安装 适用于 Linux 的 Windows 子系统。
请求的操作成功。直到重新启动系统前更改将不会生效。
```

**最后那句是关键：`直到重新启动系统前更改将不会生效`。**

**必须重启。** 不重启，下一步一定失败。

**重启后它会自动继续装 Ubuntu，要求你设一个 Linux 用户名和密码。**

**这个密码输入时屏幕不显示任何字符，这是正常的**（和第 212 节课 SSH 输密码一样）。盲打完回车。

**如果你已经有 WSL 但版本旧：**

```powershell
wsl --update
```

**应该看到：**

```text
正在检查更新。
正在下载更新...
正在安装更新...
已安装 Windows Subsystem for Linux 更新。
```

## 1.5 一个容易被忽略的坑：WSL 的内存上限

**WSL 2 默认最多能吃掉你一半的物理内存。**

**你电脑是 16G 内存的话，它最多吃 8G。** 平时没事，但你同时开 VS Code、Chrome 二十个标签、再 build 镜像，可能就卡了。

**这一节不用改。** 但如果后面 `docker build` 的时候电脑卡到动不了，回来做这件事：

1. 在 `C:\Users\你的用户名\` 下新建一个文件 `.wslconfig`；
2. 内容：

   ```ini
   [wsl2]
   memory=4GB
   processors=4
   ```

3. 在 PowerShell 里重启 WSL：

   ```powershell
   wsl --shutdown
   ```

**这个数按你电脑实际情况调。** 8G 内存的电脑就写 `memory=2GB`。

> **不懂这个会怎样：** 你会以为是 Docker 慢、是电脑不行，其实是 WSL 把内存吃满了，Windows 开始疯狂读写硬盘（虚拟内存），整机卡成幻灯片。

---

# 第 2 步：装 Docker Desktop（20 分钟）

## 2.1 下载

**只有一个官网：**

```text
https://www.docker.com/products/docker-desktop/
```

**点「Download for Windows」**，下下来一个 `Docker Desktop Installer.exe`，大概 500MB 上下。

**版本号会变，以当时官网为准。** 你下到的可能是 4.3x、4.4x，都行。

> **别去第三方站点下"绿色版""破解版"。** Docker Desktop 要装内核驱动，改过的安装包可能在你电脑上留后门，而你根本查不出来。

**关于收费：**

| 谁用 | 要不要钱 |
|---|---|
| 个人学习、个人项目 | 免费 |
| 公司规模小于 250 人，且年收入小于 1000 万美元 | 免费 |
| 超过上面任一条 | 要买订阅（Docker Business） |

**这两个数字会变，以官网为准。** 你现在一个人做产品，属于免费范围。

## 2.2 安装时的两个勾选项

**双击安装包，界面上有两个勾：**

```text
☑ Use WSL 2 instead of Hyper-V (recommended)
☑ Add shortcut to desktop
```

**第一个必须勾。** 这是选"用 WSL 2 当后端"。

**为什么不选 Hyper-V：**

| | WSL 2 | Hyper-V |
|---|---|---|
| 启动速度 | 快（秒级） | 慢 |
| 内存占用 | 按需 | 开机就占一大块 |
| 和 VirtualBox / 安卓模拟器 | 能共存 | **冲突，会导致它们全打不开** |
| 官方推荐 | ✅ | 旧方案 |

**Hyper-V 是微软的另一套虚拟化。** 开了它，很多第三方虚拟机软件会报错。

**除非你有特殊理由（比如公司规定），一律选 WSL 2。**

**装完它会提示重启。** 重启。

## 2.3 第一次启动

**重启后，从开始菜单打开「Docker Desktop」。**

**第一次启动会弹一个服务协议，勾同意，点 Accept。**

**然后它会让你登录或注册账号。** 点「Skip」跳过。**下面这些事不需要账号：**

```text
docker pull hello-world
docker build
docker run
docker compose up
```

**什么时候才需要账号：** 往 Docker Hub 推自己的镜像。**第 30 周我们用 GHCR（GitHub 的），也不一定需要 Docker Hub 账号。**

**跳过之后，左下角会有一个小鲸鱼图标在动。**

**等到它变成绿色的 `Engine running`，才算真的起来了。**

**如果鲸鱼一直红的、一直在转：** 去第 7 步看错误 2 和错误 3。

## 2.4 验证：`docker version`

**打开 Git Bash**（你平时用哪个终端就用哪个），敲：

```bash
docker version
```

**应该看到两大段，`Client` 和 `Server` 都在：**

```text
Client:
 Version:           27.3.1
 API version:       1.47
 Go version:        go1.22.7
 Git commit:        ce12230
 Built:             Fri Sep 20 11:40:59 2024
 OS/Arch:           windows/amd64
 Context:           desktop-linux

Server: Docker Desktop 4.34.3 (170107)
 Engine:
  Version:          27.3.1
  API version:      1.47 (minimum version 1.24)
  Go version:        go1.22.7
  Git commit:        41ca978
  Built:             Fri Sep 20 11:41:35 2024
  OS/Arch:           linux/amd64
  Experimental:      false
 containerd:
  Version:          1.7.21
  GitCommit:        472731909fa34bd7bc9c087e4c27943bfdc43cf2
 runc:
  Version:          1.1.13
  GitCommit:        v1.1.13-0-g58aa920
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Client:` | 你终端里敲的 `docker` 这个程序，跑在 Windows 上 |
| `OS/Arch: windows/amd64` | 客户端是 Windows 的 |
| `Context: desktop-linux` | 你现在连的是 Docker Desktop 那个 Linux 引擎 |
| `Server: Docker Desktop 4.34.3` | 引擎在跑，版本 4.34.3（桌面版编号） |
| `Engine: Version: 27.3.1` | 引擎本体版本（和 Client 一样才正常） |
| `OS/Arch: linux/amd64` | **引擎是 Linux 的。这就是 1.1 说的那件事** |
| `containerd` / `runc` | 底下真正干活的组件，不用管名字 |

**两个关键点：**

```text
① Client 和 Server 的 Version 应当一致（27.3.1 = 27.3.1）
② Client 是 windows，Server 是 linux —— 这是正常的，不是错的
```

**如果只出现了 `Client` 那一段，没有 `Server`：**

**说明引擎没起来。** 你的命令发出去了，没人接。

**别急着往下走，去第 7 步错误 2。** 不解决这个，后面每条命令都会报同样的错。

## 2.5 `docker --version` 和 `docker version` 不是一回事

**这两个命令差两个字符，作用完全不同：**

```bash
docker --version
```

**输出一行：**

```text
Docker version 27.3.1, build ce12230
```

**它只读客户端版本，不连引擎。** 所以**引擎挂了它照样能输出**。

```bash
docker version
```

**输出两大段，会去连引擎。** 引擎挂了它报错。

> **这就是为什么很多人"版本查了是对的，但什么都跑不了"。** 他查的是 `--version`。
>
> **以后排查问题，先敲 `docker version`（不带横线），看 Server 那一段在不在。**

## 2.6 `docker info`：看引擎的体检报告

```bash
docker info
```

**输出很长，前半段是 Client，后半段从 `Server:` 开始：**

```text
Server:
 Containers: 3
  Running: 1
  Paused: 0
  Stopped: 2
 Images: 5
 Server Version: 27.3.1
 Storage Driver: overlay2
 Logging Driver: json-file
 Cgroup Driver: cgroupfs
 Cgroup Version: 2
 Plugins:
  Volume: local
  Network: bridge host ipvlan macvlan null overlay
 Swarm: inactive
 Kernel Version: 5.15.153.1-microsoft-standard-WSL2
 Operating System: Docker Desktop
 OSType: linux
 Architecture: x86_64
 CPUs: 8
 Total Memory: 7.65GiB
 Name: docker-desktop
```

**逐行读（只挑有用的）：**

| 行 | 意思 |
|---|---|
| `Containers: 3` | 一共 3 个容器（含已停止的） |
| `Running: 1` | 现在正在跑 1 个 |
| `Stopped: 2` | 停了 2 个，**它们还占着硬盘** |
| `Images: 5` | 本地有 5 个镜像 |
| `Storage Driver: overlay2` | 镜像分层用的技术（第 2 节课讲） |
| `Kernel Version: ...-microsoft-standard-WSL2` | **证据：引擎跑在 WSL 2 的 Linux 里** |
| `CPUs: 8` / `Total Memory: 7.65GiB` | Docker 能用多少资源 |
| `Name: docker-desktop` | 引擎的主机名 |

**`Stopped: 2` 这一行要留意。**

**停掉的容器不占 CPU，但占硬盘。** 攒到几百个，你的 C 盘会莫名其妙少几十 G。

**清理方法在第 4 步 4.5。别用 `docker system prune -a`，那个删得太狠。**

---

# 第 3 步：国内拉不到镜像怎么办（20 分钟）

## 3.1 先说结论：国内默认拉不动

`docker pull` 默认去 **Docker Hub**（`registry-1.docker.io`）。这个地址在国内经常：

```text
① 直接超时
② 能连上但速度 10 KB/s
③ 报 TLS handshake timeout
④ 报 429 Too Many Requests（限流）
```

**这不是你装错了。** 这是网络问题，所有人都遇到。

**症状长这样：**

```bash
docker pull hello-world
```

```text
Using default tag: latest
Error response from daemon: Get "https://registry-1.docker.io/v2/":
net/http: request canceled while waiting for connection
(Client.Timeout exceeded while awaiting headers)
```

**或者：**

```text
Error response from daemon: Get "https://registry-1.docker.io/v2/":
dial tcp 44.208.254.194:443: i/o timeout
```

**`i/o timeout` / `Client.Timeout` / `TLS handshake timeout`，全是同一个原因：连不上。**

## 3.2 解法：给 Docker 配镜像加速器

**"镜像加速器"是什么：**

一个国内的服务器，它帮你从 Docker Hub 把镜像拉下来，你再从它那里拉。

```text
不加加速器：  你的电脑 ──────✗──────→ Docker Hub（美国）
加加速器：    你的电脑 ──→ 国内加速器 ──→ Docker Hub
```

**配置方法（Docker Desktop 图形界面）：**

1. 点右下角鲸鱼图标 → 「Settings」；
2. 左边选「Docker Engine」；
3. 你会看到一个 JSON 输入框，里面大概长这样：

   ```json
   {
     "builder": {
       "gc": {
         "defaultKeepStorage": "20GB",
         "enabled": true
       }
     },
     "experimental": false
   }
   ```

4. 在里面加一行 `registry-mirrors`，变成：

   ```json
   {
     "builder": {
       "gc": {
         "defaultKeepStorage": "20GB",
         "enabled": true
       }
     },
     "experimental": false,
     "registry-mirrors": [
       "https://你的加速器地址"
     ]
   }
   ```

5. 点右下角「Apply & restart」；
6. 等鲸鱼变绿。

**`registry-mirrors` 是数组，可以写多个。** 前面连不上会自动试后面。

## 3.3 逐行读这段 JSON

| 行 | 意思 | 能不能删 |
|---|---|---|
| `"builder"` | 构建器的配置 | 别删 |
| `"defaultKeepStorage": "20GB"` | 构建缓存最多留 20G | 可改 |
| `"experimental": false` | 不开实验性功能 | 别改 |
| `"registry-mirrors"` | **镜像加速器列表，就是这个** | 新增的 |
| `"https://..."` | 加速器地址，**必须带 `https://`** | 换成你能用的 |

**三个最常见的写错：**

```text
❌ 忘写 https://            → 报 "invalid mirror"
❌ 最后一项后面多个逗号      → 报 "unexpected end of JSON input"
❌ 用中文引号 “ ”            → 报 JSON 解析失败
```

**JSON 对格式非常挑。** 少一个逗号、多一个逗号，整个文件都不认。

**改完点 Apply，如果它弹红框报错，就是 JSON 格式错了。** 把整段复制到 VS Code 里，右下角会显示语言为 JSON，格式错会标红。

## 3.4 加速器地址从哪来

**这是这一节最麻烦的地方：加速器地址经常失效。**

**能用的来源（按稳定性排）：**

| 来源 | 怎么拿 | 说明 |
|---|---|---|
| **阿里云容器镜像服务** | 登录阿里云 → 容器镜像服务 → 镜像工具 → 镜像加速器 | 每人一个专属地址，最稳，但**必须登录阿里云账号** |
| **腾讯云** | 容器镜像服务控制台 | 有免费额度 |
| **中科大 / 网易等公共镜像** | 直接搜 | 时好时坏 |
| **公司/学校内网镜像** | 问运维 | 有就用 |

**阿里云那个地址长这样（`xxxx` 是你的专属 ID，不是真的）：**

```text
https://xxxxxx.mirror.aliyuncs.com
```

**每家云厂商的地址格式都不一样，不要去背，去控制台复制。**

> **不要相信任何"永久可用加速器列表"。** 这类地址被封、被限流是常态，一篇三个月前的教程里的地址，今天大概率已经失效。
>
> **规则：配一个，试一次 `docker pull hello-world`。不行就换下一个。**
>
> **以当时能用的为准。** 这节课给的是"方法"，不是"某个具体地址"。

## 3.5 验证加速器有没有生效

**配好并重启引擎之后：**

```bash
docker info
```

**在输出里找这一段（在 `Server` 部分）：**

```text
 Registry Mirrors:
  https://xxxxxx.mirror.aliyuncs.com/
```

**看到了就说明配置生效了。**

**如果这一段完全没有，说明：**

```text
① JSON 没保存成功（回去看 Apply 有没有报错）
② 引擎没重启（Apply & restart 没点）
③ 你改的是 Client 段的配置，不是 Engine 的
```

**然后实测：**

```bash
docker pull hello-world
```

**成功长这样：**

```text
Using default tag: latest
latest: Pulling from library/hello-world
e6590344b1a5: Pull complete
Digest: sha256:d211f485f2dd1dee407a80973c8f129f00d54604d2c9091047d568b64055ee1c
Status: Downloaded newer image for hello-world:latest
docker.io/library/hello-world:latest
```

**拉了 20 秒还是 0% 在动：** 说明这个加速器也不行，换一个。

## 3.6 如果所有加速器都不行

**三条退路，按推荐顺序：**

```text
① 找一个能连 Docker Hub 的网络环境（手机热点有时能过，有时不能，试）
② 让同事/朋友把他拉好的镜像导出成文件给你：
     他那边：docker save hello-world -o hello-world.tar
     你这边：docker load -i hello-world.tar
③ 换个镜像源，比如直接用云厂商自己的镜像仓库地址拉（第 30 周会讲）
```

**第 ② 条在第 34 周"客户内网离线安装"时会正式学。** 这里先知道有这么个办法。

> **不懂这个会怎样：** 你会以为 Docker 装坏了，重装三次，每次都是同样的超时。**其实装得完全没问题，只是网络连不上。**
>
> 分界线很清楚：**`docker version` 有 Server 段 = 装好了。`docker pull` 超时 = 网络问题。** 这两件事不要混。

---

# 第 4 步：跑通 hello-world（25 分钟）

## 4.1 建实验目录

**操作：**

1. 打开 `第01节课/03-练习代码`；
2. 新建文件夹 `docker-lab`；
3. 在里面新建一个文本文件，改名 `命令记录.md`。

**这个文件用来贴你今天所有命令的输出。** 后面每节课都会用到类似的记录文件。

**这个目录里不会有代码。** 今天所有实验都是敲命令，不写文件。

## 4.2 第一条命令

```bash
docker run hello-world
```

**如果本地没有这个镜像（第一次跑一定有）：**

```text
Unable to find image 'hello-world:latest' locally
latest: Pulling from library/hello-world
e6590344b1a5: Pull complete
Digest: sha256:d211f485f2dd1dee407a80973c8f129f00d54604d2c9091047d568b64055ee1c
Status: Downloaded newer image for hello-world:latest

Hello from Docker!
This message shows that your installation appears to be working correctly.

To generate this message, Docker took the following steps:
 1. The Docker client contacted the Docker daemon.
 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.
    (amd64)
 3. The Docker daemon created a new container from that image which runs the
    executable that produces the output you are currently reading.
 4. The Docker daemon streamed that output to the Docker client, which sent it
    to your terminal.

To try something more ambitious, you can run an Ubuntu container with:
 $ docker run -it ubuntu bash

Share images, automate workflows, and more with a free Docker ID:
 https://hub.docker.com/

For more examples and ideas, visit:
 https://docs.docker.com/get-started/
```

**逐行读（这是今天最重要的一张表）：**

| 行 | 意思 |
|---|---|
| `Unable to find image 'hello-world:latest' locally` | 本地没有这个镜像，要去网上拉 |
| `latest: Pulling from library/hello-world` | 正在从 `library`（官方镜像）拉 `latest` 标签 |
| `e6590344b1a5: Pull complete` | 这一"层"下载完了（分层，第 2 节课讲） |
| `Digest: sha256:...` | 这个镜像的**唯一指纹**，内容一样指纹就一样 |
| `Status: Downloaded newer image...` | 下载完成 |
| `Hello from Docker!` | **容器跑起来了，这是容器里的程序输出的** |
| `1. The Docker client contacted the Docker daemon.` | 你的命令行程序去找引擎 |
| `2. The Docker daemon pulled the image...` | 引擎去拉镜像 |
| `3. The Docker daemon created a new container...` | 引擎用镜像创建了一个容器 |
| `4. The Docker daemon streamed that output to the Docker client` | 容器输出 → 引擎 → 你的终端 |

**这四步就是 Docker 的全部工作方式。**

```text
你（Client）  →  引擎（Daemon）  →  镜像  →  容器  →  输出回你
```

**以后所有命令，都是在这条链上动某一环。**

## 4.3 容器去哪了

**刚跑完，马上查：**

```bash
docker ps
```

**你会看到这样的表头，下面什么都没有：**

```text
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

**"我刚跑成功，怎么没有了？"**

**它跑完了。**

**`hello-world` 这个镜像里只有一个程序：打印一段话然后退出。** 打印完，进程结束，容器就进入"已退出"状态。

**查所有容器（含已退出的）：**

```bash
docker ps -a
```

**应该看到：**

```text
CONTAINER ID   IMAGE         COMMAND    CREATED          STATUS                      PORTS     NAMES
a1b2c3d4e5f6   hello-world   "/hello"   2 minutes ago    Exited (0) 2 minutes ago              clever_morse
```

**逐列读（这张表后面你会看几百遍）：**

| 列 | 意思 | 常见值 |
|---|---|---|
| `CONTAINER ID` | 容器 ID，12 位十六进制 | `a1b2c3d4e5f6` |
| `IMAGE` | 用哪个镜像创建的 | `hello-world` |
| `COMMAND` | 容器里跑的什么命令 | `"/hello"` |
| `CREATED` | 创建时间（不是运行时长） | `2 minutes ago` |
| `STATUS` | 现在什么状态 | `Up 3 seconds` / `Exited (0)` |
| `PORTS` | 端口映射 | `0.0.0.0:3000->3000/tcp` |
| `NAMES` | 容器名字，不指定就随机起 | `clever_morse` |

**`Exited (0)` 里的 `0` 是什么：**

**退出码。`0` = 正常结束。** 非 0 就是出错，比如 `Exited (1)`、`Exited (137)`。

**`137` 特别常见：** 它等于 `128 + 9`，意思是"被 `kill -9` 杀了"或者"内存超了被系统杀掉"。

**`NAMES` 为什么叫 `clever_morse`：**

Docker 会随机给容器起"形容词_名人"的名字。**这些名字不好记，所以第 3 节课会教你用 `--name` 自己起。**

## 4.4 镜像在哪

```bash
docker images
```

**应该看到：**

```text
REPOSITORY    TAG       IMAGE ID       CREATED         SIZE
hello-world   latest    d211f485f2dd   11 months ago   13.3kB
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `REPOSITORY` | 镜像名（`hello-world`） |
| `TAG` | 标签，通常是版本号（`latest` = 不指定时的默认值） |
| `IMAGE ID` | 镜像 ID，**不是容器 ID** |
| `CREATED` | 镜像是什么时候做的（不是你什么时候拉的） |
| `SIZE` | 13.3kB，因为里面只有一个静态编译的小程序 |

**`TAG` 是什么：**

同一个镜像可以有多个版本，用标签区分。

```text
node:22          Node 22 的完整版（约 1.1GB）
node:22-alpine   Node 22 的精简版（约 130MB）
node:22-slim     介于两者之间（约 200MB）
```

**`latest` 不是"最新版"，是"你没指定版本时的默认标签"。** 这只是个约定，不是保证。

> **生产环境不要用 `latest`。** 因为今天 `latest` 是 20.1，明天可能变成 21.0，你什么都没改，程序就挂了。
>
> **要写具体版本：`node:22.22.2-alpine`。** 第 7 节课讲瘦身时会再强调一次。

## 4.5 删容器和删镜像（顺序不能反）

**镜像 = 模具，容器 = 用模具做出来的东西。**

**所以要删镜像，得先删掉所有用它做出来的容器。**

**先删容器：**

```bash
docker rm a1b2c3d4e5f6
```

**（把 `a1b2c3d4e5f6` 换成你自己 `docker ps -a` 里看到的 ID，前 3—4 位就够，Docker 能认出来。）**

**应该输出容器 ID：**

```text
a1b2c3d4e5f6
```

**再删镜像：**

```bash
docker rmi hello-world
```

**应该看到：**

```text
Untagged: hello-world:latest
Untagged: hello-world@sha256:d211f485f2dd1dee407a80973c8f129f00d54604d2c9091047d568b64055ee1c
Deleted: sha256:d211f485f2dd1dee407a80973c8f129f00d54604d2c9091047d568b64055ee1c
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Untagged:` | 把 `hello-world:latest` 这个"名字"摘掉 |
| `Untagged: ...@sha256:` | 把按指纹引用的名字也摘掉 |
| `Deleted: sha256:` | **真正删掉镜像的存储层** |

**注意顺序：先 `Untagged`，后 `Deleted`。** 如果还有别的标签指向同一个镜像，就不会 `Deleted`。

**如果直接删镜像（容器还在）：**

```bash
docker rmi hello-world
```

```text
Error response from daemon: conflict: unable to delete d211f485f2dd (must be forced) -
image is being used by stopped container a1b2c3d4e5f6
```

**这句话在说什么：**

```text
unable to delete ...      删不掉
image is being used by    这个镜像正被使用
stopped container         一个"已停止"的容器
```

**注意"stopped"：容器停了也还占着镜像。** 必须 `docker rm` 掉才行。

**`--force` / `-f` 能强删，但会留下一个"悬空镜像"（`<none>`）。** 不建议。

## 4.6 再拉一次，看差别

**如果你在 4.5 删了，先拉回来：**

```bash
docker pull hello-world
```

**再跑一次：**

```bash
docker run hello-world
```

**这次输出短了很多：**

```text
Hello from Docker!
This message shows that your installation appears to be working correctly.
...
```

**没有 `Unable to find image` 那几行了。**

**为什么：** 镜像已经在本地，不用再拉。

**这就是"镜像可以被无限次使用"的意思。** 拉一次，跑一万次。

**这就是为什么基础镜像要选小的：** `node:22` 是 1.1GB，你要在 CI 里跑几百次，每次都要拉，那就是几百 GB 的流量。

## 4.7 顺便看一眼磁盘

```bash
docker system df
```

**应该看到：**

```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          1         0         13.3kB    13.3kB (100%)
Containers      1         0         0B        0B
Local Volumes   0         0         0B        0B
Build Cache     0         0         0B        0B
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `TOTAL` | 一共多少个 |
| `ACTIVE` | 有几个正在被用 |
| `SIZE` | 占多大 |
| `RECLAIMABLE` | **可以回收多少**（`docker system prune` 能清掉的） |

**这是你每周该跑一次的命令。** 比 `docker system prune -a` 安全得多——它只告诉你，不动手。

---

# 第 5 步：亲手做一次"我本地能跑"的实验（25 分钟）

## 5.1 为什么要做这个实验

**光听"容器里环境是干净的"，你不会有感觉。**

**这个实验让你亲手看到：你的电脑上有 Node，容器里没有 Node。**

## 5.2 进一个 Ubuntu 容器

```bash
docker run -it ubuntu bash
```

**第一次会先拉镜像（大概 70MB），然后你会看到提示符变了：**

```text
Unable to find image 'ubuntu:latest' locally
latest: Pulling from library/ubuntu
...
Status: Downloaded newer image for ubuntu:latest
root@f3a1b2c3d4e5:/#
```

**逐段读这条命令：**

| 片段 | 意思 |
|---|---|
| `docker run` | 用镜像创建并启动一个容器 |
| `-i` | 交互式：保持输入通道打开（`interactive`） |
| `-t` | 分配一个终端（`tty`），有提示符 |
| `ubuntu` | 用哪个镜像 |
| `bash` | **在容器里执行这个命令**（不写就用镜像默认的） |

**`-it` 几乎永远一起出现。** 少一个都会怪：没有 `-t` 没有提示符，没有 `-i` 你打的字进不去。

**现在这个提示符 `root@f3a1b2c3d4e5:/#` 是什么意思：**

| 部分 | 意思 |
|---|---|
| `root` | 容器里的用户是 root（容器内最高权限） |
| `f3a1b2c3d4e5` | **容器 ID。你现在在容器里面了** |
| `:/` | 当前目录是根目录 |

**验证一下你现在不在 Windows 上了：**

```bash
ls /
```

**应该看到 Linux 的目录结构：**

```text
bin  boot  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
```

**这些是 Linux 的目录，不是你 C 盘的内容。**

## 5.3 在容器里找 Node

```bash
node -v
```

**应该看到：**

```text
bash: node: command not found
```

**`command not found` 的意思是：这个命令不存在。**

**不是"没装好"，是这个镜像里压根就没有 Node。**

**`ubuntu` 镜像里只有 Ubuntu 最基础的那点东西。** 连 `curl`、`git`、`vim` 都没有。

**再试试：**

```bash
which node
```

```text
（没有任何输出）
```

**退出去：**

```bash
exit
```

**回到你自己的终端。**

**现在在你自己的电脑上敲同一个命令：**

```bash
node -v
```

**应该看到：**

```text
v22.22.2
```

**（你的版本号可能不同。这个数会变。）**

**现在你亲眼看到了两件事：**

```text
你的电脑：node 存在，v22.x
ubuntu 容器里：node 不存在
```

**这就是"环境隔离"的真面目。**

**同一个 `node -v`，在两个地方结果完全不同，因为它们根本是两个不同的文件系统。**

> **不懂这个会怎样：** 你会以为"容器就是把我的程序拷进去跑"，然后奇怪"为什么容器里读不到我的 `.env`""为什么它说找不到 `node_modules`"。
>
> **容器不是你的电脑的一个窗口。它是一个单独的、几乎空的 Linux，只有你明确放进去的东西。** 这句话是这一周的总纲。

## 5.4 顺便验证一下：容器退出后还在，删了才没

**刚才那个 `f3a1b2c3d4e5`，现在在哪？**

```bash
docker ps
```

**空的。**

```bash
docker ps -a
```

**应该能看到它，状态是 `Exited (0)`：**

```text
CONTAINER ID   IMAGE    COMMAND   CREATED         STATUS                     PORTS   NAMES
f3a1b2c3d4e5   ubuntu   "bash"    2 minutes ago   Exited (0) 2 minutes ago           dreamy_hopper
```

**它没被删，只是停了。**

**能不能再进去？能：**

```bash
docker start f3a1b2c3d4e5
docker exec -it f3a1b2c3d4e5 bash
```

**（`exec` 是第 3 节课的内容，这里先跑一下看效果。）**

**会发现你之前创建的文件还在。** 因为容器停了，它的文件系统还在硬盘上。

**但如果 `docker rm` 掉，里面的东西全没。** 这就是第 5 节课"数据卷"要解决的问题。

## 5.5 容器 vs 虚拟机：一张表说清

**很多人把 Docker 当成"轻量虚拟机"。这个理解会让你后面一直搞错。**

| | 虚拟机（VMware / VirtualBox） | 容器（Docker） |
|---|---|---|
| 里面跑什么 | 一整套操作系统 | 一个进程 |
| 启动时间 | 几十秒到几分钟 | 毫秒到几秒 |
| 占多大 | 几个 GB 起 | 几十 MB 起 |
| 内存 | 预先分配一大块 | 用多少算多少 |
| 隔离程度 | 强（真的独立内核） | 较弱（共用宿主内核） |
| 一个宿主机上能跑几个 | 几个 | 几百个 |
| 能不能跑 Windows 程序 | 能 | ❌ Linux 容器跑 Linux 程序 |

**为什么容器这么轻：**

```text
虚拟机：  硬件 → 宿主系统 → 虚拟化层 → 完整操作系统 → 你的程序
容器：    硬件 → 宿主系统 → 容器引擎 → 你的程序（共用宿主的内核）
```

**容器省掉的正是"完整操作系统"那一层。**

**代价是隔离弱一些。** 所以：

```text
✅ 容器能隔离"环境不一样"的问题
❌ 容器不能当安全沙箱用（跑不可信代码别用容器隔离）
```

**（这一条在第 33 周安全那周还会提。）**

## 5.6 一个必须记住的推论

**既然容器里只有一个进程，那么：**

```text
容器"活着" = 它里面那个主进程还在跑
主进程退出 = 容器就停了（哪怕里面还有别的进程）
```

**所以 `hello-world` 打印完就 `Exited (0)`。**

**所以第 3 节课你的 `chat-app` 容器，只要 `node server.js` 崩了，容器就停了。**

**这条规则解释了你以后遇到的 90% 的"容器莫名其妙自己停了"。**

---

# 第 6 步：把这一周的三个词串起来（15 分钟）

## 6.1 一条命令的完整生命周期

```bash
docker run hello-world
```

**Docker 内部做了七件事：**

```text
① 解析：镜像名 hello-world，标签 latest
② 找本地：docker images 里有没有？
③ 没有 → 去 registry 拉（拉的时候是分层拉的）
④ 有了 → 用这个镜像创建一个"容器"（可写层）
⑤ 在容器里启动进程（hello-world 镜像是 /hello）
⑥ 把这个进程的 stdout 接到你的终端
⑦ 进程退出 → 容器状态变 Exited
```

**这七步里，第 ④ 步是最关键的：**

**容器 = 镜像（只读） + 一层可写层。**

```text
┌─────────────────────────────┐
│  可写层（容器自己的）        │  ← 你在容器里新建/修改的文件在这
├─────────────────────────────┤
│  镜像层 3（只读）            │
│  镜像层 2（只读）            │  ← 这些永远不会变，多个容器共享
│  镜像层 1（只读）            │
└─────────────────────────────┘
```

**所以：**

```text
同一个镜像起 10 个容器 → 硬盘上只有 1 份镜像 + 10 个很小的可写层
```

**这就是"容器很轻"的真正原因。**

## 6.2 三个词的一句话定义

```text
镜像（image）    = 只读的模板，装着程序和它需要的环境
容器（container）= 镜像 + 一层可写层 + 一个正在跑的进程
宿主机（host）   = 跑 Docker 的那台机器（你的 Windows）
```

## 6.3 一张命令对照表

**这节课你敲过的命令，按"动的是哪一层"分类：**

| 命令 | 动的是 | 后果 |
|---|---|---|
| `docker version` | 什么都没动 | 看客户端和引擎版本 |
| `docker info` | 什么都没动 | 看引擎体检报告 |
| `docker pull hello-world` | 镜像 | 从网上拉到本地 |
| `docker images` | 什么都没动 | 列出本地镜像 |
| `docker run hello-world` | 容器 | 创建一个容器并跑起来 |
| `docker ps` | 什么都没动 | 列出**正在跑**的容器 |
| `docker ps -a` | 什么都没动 | 列出**所有**容器 |
| `docker start <id>` | 容器 | 把停了的容器再跑起来 |
| `docker exec -it <id> bash` | 容器 | 进到一个**正在跑**的容器里 |
| `docker rm <id>` | 容器 | 删容器（可写层一起没） |
| `docker rmi <镜像>` | 镜像 | 删镜像（要求没有容器在用它） |
| `docker system df` | 什么都没动 | 看占了多少硬盘 |

**注意 `rm` 和 `rmi` 差一个字母：**

```text
docker rm    删容器（remove container）
docker rmi   删镜像（remove image）
```

**敲错的现象：**

```bash
docker rm hello-world
```

```text
Error response from daemon: No such container: hello-world
```

**因为 `hello-world` 是镜像名，不是容器名/ID。**

## 6.4 今天建立的"我本地能跑"的正确理解

**以前你说"我本地能跑"，意思是"在我这台电脑上能跑"。**

**从今天起，这句话应该改成：**

> **"这个项目需要的环境，我写成了 Dockerfile。任何装了 Docker 的机器，`docker build` 之后都能跑出一样的结果。"**

**"一样的结果"这句话在第 2 节课（Dockerfile）和第 30 周（CI）会被反复验证。**

**现在还差一样东西：你还没有 Dockerfile。** 那是明天的课。

---

# 第 7 步：故意犯七个错（25 分钟）

> **下面七个错，前三个会卡住你几小时。**
> **如果你已经装好了，前三个只看不练；后四个一定要动手。**

## 错误 1：CPU 虚拟化没开就装

**操作：** 在 BIOS 里虚拟化是关的状态下，直接装 Docker Desktop 并启动。

**会怎样：** Docker Desktop 起不来，弹窗报：

```text
WSL 2 installation is incomplete.

The WSL 2 kernel file is not found. Please check your WSL configuration.
Click here for more information.
```

**或者在 PowerShell 里跑 `wsl --install` 时报：**

```text
请启用虚拟机平台 Windows 功能并确保在 BIOS 中启用了虚拟化。

有关信息，请访问 https://aka.ms/wsl2
```

**为什么：**

WSL 2 本身就是一个轻量虚拟机，它需要 CPU 的硬件虚拟化功能（Intel VT-x / AMD-V）。

**这个功能在 BIOS 里，不在 Windows 里。** 所以 Windows 怎么设置都没用。

**怎么修：**

1. 重启，进 BIOS（开机连按 `Del` / `F2` / `F10`）；
2. 找 `Intel Virtualization Technology` 或 `SVM Mode`，设成 `Enabled`；
3. 保存退出（通常 `F10`）；
4. 进系统后用任务管理器确认「虚拟化: 已启用」；
5. 重新装 Docker Desktop。

**不同的主板菜单名字完全不一样。** 找不到就搜"你的笔记本型号 + 开启虚拟化"。

## 错误 2：装完不重启

**操作：** `wsl --install` 跑完，看到"操作成功"，直接开 Docker Desktop。

**会怎样：**

**Docker Desktop 转圈转到天荒地老，鲸鱼一直是红的。** 命令行里：

```bash
docker version
```

**只出 Client，Server 段报错：**

```text
Client:
 Version:           27.3.1
 ...
 OS/Arch:           windows/amd64
 Context:           desktop-linux

error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.47/version":
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

**逐行读这段报错：**

| 部分 | 意思 |
|---|---|
| `docker version` 只有 Client | 客户端程序没问题，问题在引擎 |
| `error during connect` | **连不上引擎** |
| `%2F%2F.%2Fpipe%2F...` | 一段被 URL 编码过的 Windows 命名管道路径，`%2F` 就是 `/` |
| `dockerDesktopLinuxEngine` | Docker Desktop 的 Linux 引擎 |
| `The system cannot find the file specified` | **那个管道根本不存在 = 引擎没起来** |

**为什么：**

WSL 2 的内核和功能要重启才生效。**没重启，WSL 起不来，引擎就起不来。**

**怎么修：**

```powershell
# 1. 重启电脑（最稳）
# 2. 如果已经重启过还不行，手动更新 WSL
wsl --update
# 3. 关掉所有 WSL 再重开
wsl --shutdown
# 4. 重新打开 Docker Desktop，等鲸鱼变绿
```

**另一个变体：** 老版本 Docker Desktop 上看到的是：

```text
Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
```

**意思完全一样：引擎没起。**

> **记一个判断法：`docker version` 有 Server 段 = 引擎活着。只有 Client = 引擎死了。**
>
> 以后任何"命令跑不了"的情况，先跑这一条，能省你半小时。

## 错误 3：WSL 默认版本是 1

**操作：** 电脑上早就有 WSL，但装的时候是 WSL 1。直接装 Docker Desktop，选 WSL 2 后端。

**会怎样：** Docker Desktop 启动时提示：

```text
Docker Desktop requires a newer WSL kernel version.

Please update WSL by running: wsl --update
```

**或者在 PowerShell 里查：**

```powershell
wsl --list --verbose
```

```text
  NAME            STATE           VERSION
* Ubuntu          Stopped         1
```

**`VERSION` 那一列是 `1`。**

**为什么：**

WSL 1 是"翻译层"（把 Linux 系统调用翻译成 Windows 调用），WSL 2 才是真的轻量虚拟机。

**Docker 需要真的 Linux 内核**（要用 `namespace`、`cgroups`、`overlayfs` 这些），WSL 1 提供不了。

**怎么修：**

```powershell
# 1. 升级 WSL 本体
wsl --update

# 2. 把默认版本改成 2
wsl --set-default-version 2

# 3. 已有的发行版单独转（这一步可能要几分钟）
wsl --set-version Ubuntu 2
```

**第 3 条里的 `Ubuntu` 要换成你 `wsl --list` 里看到的实际名字。**

**转换过程中会看到一个进度条，别中断。** 中断可能把那个发行版弄坏。

**验证：**

```powershell
wsl --list --verbose
```

```text
  NAME            STATE           VERSION
* Ubuntu          Stopped         2
```

**变成 2 了才算修好。**

## 错误 4：不配加速器直接 pull

**操作：** 装好 Docker，第一件事 `docker pull node:22-alpine`。

**会怎样：** 等 30 秒，然后：

```text
20-alpine: Pulling from library/node
e6590344b1a5: Pulling fs layer
error pulling image configuration: download failed after attempts=6:
dial tcp 44.208.254.194:443: i/o timeout
```

**或者：**

```text
Error response from daemon: Get "https://registry-1.docker.io/v2/":
net/http: request canceled while waiting for connection
(Client.Timeout exceeded while awaiting headers)
```

**为什么：**

`registry-1.docker.io` 在国内网络下经常连不通。

**怎么修：**

**按第 3 步配 `registry-mirrors`，然后 Apply & restart。**

**配好之后先拿小镜像试：**

```bash
docker pull hello-world
```

**13KB 的东西 5 秒内拉下来，说明加速器通了。** 再去拉大镜像。

> **别一上来就 `docker pull node:22`（1.1GB）。** 网络不通的时候，你要盯着 0% 看十分钟才知道失败。**先用 13KB 的试探。**

## 错误 5：跑完发现 `docker ps` 是空的，以为失败了

**操作：**

```bash
docker run hello-world
docker ps
```

**看到：**

```text
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

**空的。于是以为没跑成功，重装 Docker。**

**为什么：**

**`docker ps` 默认只显示"正在运行"的容器。** `hello-world` 打印完就退出了，属于"已退出"。

**怎么查：**

```bash
docker ps -a
```

**就能看到它，状态 `Exited (0)`。**

**`-a` 是 `--all`。**

**记住这条：**

```text
docker ps       只看活着的
docker ps -a    连死的也看
```

**以后你的应用"莫名其妙没了"，第一件事是 `docker ps -a`。** 如果状态是 `Exited (1)`，说明程序自己崩了；如果 `Exited (137)`，说明被杀（多半是内存）。

## 错误 6：容器还在，`docker rmi` 删不掉

**操作：**

```bash
docker rmi hello-world
```

**会怎样：**

```text
Error response from daemon: conflict: unable to delete d211f485f2dd (must be forced) -
image is being used by stopped container a1b2c3d4e5f6
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `conflict` | 冲突 |
| `unable to delete d211f485f2dd` | 删不掉这个镜像 |
| `(must be forced)` | 除非加 `-f` 强删 |
| `image is being used by stopped container` | **被一个"已停止"的容器占着** |
| `a1b2c3d4e5f6` | 那个容器 |

**为什么：**

**容器是从镜像"长"出来的。** 容器的可写层依赖镜像的只读层。

镜像删了，那个容器就再也起不来了（`docker start` 会报错）。所以 Docker 不允许。

**注意：容器只是"停了"，不是"删了"。停着的容器一样占着镜像。**

**怎么修：**

```bash
# 1. 先删容器
docker rm a1b2c3d4e5f6

# 2. 再删镜像
docker rmi hello-world
```

**如果你想一次删掉所有已停止的容器：**

```bash
docker container prune
```

**它会问你确认：**

```text
WARNING! This will remove all stopped containers.
Are you sure you want to continue? [y/N]
```

**输入 `y` 回车。**

**⚠️ 这个命令只删"已停止"的，不删运行中的。** 但它会删掉你所有停着的实验容器，包括你还没看够的。

**别用 `docker rm -f $(docker ps -aq)`。** 那会连正在跑的也一起强删，而且不问你。

## 错误 7：在 WSL 里敲 docker，连不上

**操作：** 你打开 Ubuntu（WSL）的终端，敲 `docker ps`。

**会怎样：**

```text
Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
```

**为什么：**

你在 WSL 里，Docker Desktop 默认**没有**把引擎共享给这个 WSL 发行版。

**Docker Desktop 自己有一个内部 WSL（叫 `docker-desktop`），但你自己装的 Ubuntu 是另一个。**

**怎么修：**

1. Docker Desktop → Settings → Resources → WSL Integration；
2. 打开「Enable integration with my default WSL distro」；
3. 在下面的列表里，把你的发行版（比如 `Ubuntu-22.04`）的开关打开；
4. Apply & restart；
5. 在 WSL 里**新开一个**终端（旧的那个不会自动生效）；
6. 再敲 `docker ps`。

**应该看到表头了（可能没有容器）。**

**怎么验证通了：**

```bash
docker version
```

**WSL 里也应当出现 Client + Server 两段。**

> **这一条你现在可以直接跳过。** 这个阶段所有命令都在 Windows 的 Git Bash / PowerShell 里敲。
>
> **但第 31 周上服务器之后，你会 SSH 到 Linux 里敲 docker。** 那时候这条经验就有用了：**"连不上 daemon"永远是"当前这个 shell 没连上引擎"，不是 Docker 坏了。**

---

# 第 8 步：写学习笔记（10 分钟）

**打开 `第01节课/02-笔记/NOTES.md`，按下面的模板填。**

**不许留空白。** 空着的表格等于没学。

```markdown
# 第 197 节课学习笔记

## 一、我电脑的三个前置条件

| 条件 | 我这边的情况 | 怎么查的 |
|---|---|---|
| CPU 虚拟化 | | |
| WSL 版本 | | |
| Windows 版本 | | |

## 二、`docker version` 的两段输出

Client 段我看到的关键行：

Server 段我看到的关键行：

Client 和 Server 的 Version 一样吗：

为什么 Client 是 windows、Server 是 linux：

## 三、镜像加速器

我配的地址（把 ID 部分打码）：

`docker info` 里 `Registry Mirrors` 这一段有吗：

`docker pull hello-world` 用了多久：

## 四、`hello-world` 的四步

Docker 说它做了四件事，我用我自己的话写一遍：

1.
2.
3.
4.

## 五、`docker ps` 和 `docker ps -a` 的区别

一句话：

`docker ps -a` 里我看到的 STATUS 是什么：

`Exited (0)` 里的 0 是什么意思：

## 六、镜像和容器

一句话区分：

`docker run hello-world` 之后：

- 多了几个镜像：
- 多了几个容器：
- 容器现在是死是活：

`docker rm` 和 `docker rmi` 分别删什么：

## 七、那个 Ubuntu 容器

我在容器里敲 `node -v`，输出是：

我在自己电脑上敲 `node -v`，输出是：

这两次输出为什么不一样：

## 八、容器 vs 虚拟机

| | 虚拟机 | 容器 |
|---|---|---|
| 里面跑什么 | | |
| 启动时间 | | |
| 占多大 | | |
| 隔离程度 | | |

## 九、七个错误的后果

| 错误 | 报错关键词 | 怎么修 |
|---|---|---|
| 虚拟化没开 | | |
| 装完不重启 | | |
| WSL 是 1 版 | | |
| 没配加速器 | | |
| 用 ps 找不到 | | |
| rmi 删不掉 | | |
| WSL 里连不上 | | |

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] `docker version` 有 Server 段
- [ ] `docker run hello-world` 跑通
- [ ] 我进过一个 ubuntu 容器，并且在里面看到 `command not found`
- [ ] 我删过容器和镜像
- [ ] 我配过镜像加速器（或确认不需要配）
```

---

# 第 9 步：课后练习

## 练习一：把「四步」讲给一个不懂技术的人听

**要求：**

1. 不看课件，在纸上写下 `docker run hello-world` 到底发生了什么；
2. 必须包含四个角色：你、客户端、引擎、镜像仓库；
3. 用"点外卖"或者别的什么生活比喻都行。

**记录：** 你的比喻，以及哪一步你觉得最不好解释。

**思考：如果镜像已经在本地了，这四步会少哪一步？**

## 练习二：测量镜像大小

**要求：**

1. 依次拉三个镜像：`hello-world`、`alpine`、`ubuntu`；
2. 每拉一个，跑一次 `docker images`；
3. 把三个 SIZE 记下来。

**记录：** 三个镜像各多大，加起来多大。

**思考：为什么 `alpine` 只有几 MB，而 `ubuntu` 有 70MB 以上？它们不都是 Linux 吗？**

**提示：`alpine` 用的是 `musl libc` 而不是 `glibc`。这个差别在第 2 节课会咬你一口。**

## 练习三：制造一次「容器删了，东西就没了」

**要求：**

1. `docker run -it alpine sh` 进容器；
2. 在容器里建一个文件：`echo hello > /tmp/test.txt`；
3. `cat /tmp/test.txt` 确认它在；
4. `exit` 出来；
5. `docker ps -a` 找到这个容器，`docker start` 它，`docker exec -it <id> sh` 进去，`cat /tmp/test.txt`。

**记录：** 第 5 步还能 `cat` 出来吗？

**然后再做一次：**

6. `exit`，`docker rm <id>` 删掉容器；
7. 重新 `docker run -it alpine sh`，`cat /tmp/test.txt`。

**记录：** 这次输出什么？

**思考：数据在什么时候丢的？是 `exit` 的时候，还是 `docker rm` 的时候？**

## 练习四：把加速器配坏一次

**要求：**

1. 打开 Docker Engine 的 JSON；
2. 故意把最后一个 `}` 删掉；
3. 点 Apply & restart。

**记录：** 报错原文（截图或抄下来）。

**然后修回去。**

**思考：为什么 JSON 差一个括号整个配置就废了？如果这是你的生产服务器，配置坏了会发生什么？**

## 练习五：用自己的话说清三个词

**要求：** 不看课件，写出下面三句的答案。

```text
① 镜像和容器有什么区别？用"模具和月饼"或者别的比喻说清。
② 为什么容器比虚拟机轻？少掉了哪一层？
③ "我本地能跑"这句话，为什么在交付现场不算数？
```

**记录：** 三句话。**写完再翻回第 0 步对一下，看你说的和课件说的是不是一回事。**

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清镜像、容器、宿主机三个词的区别
- [ ] 我知道 Client 是 Windows 程序，Server（引擎）跑在 WSL 的 Linux 里
- [ ] 我知道容器 = 镜像 + 一层可写层 + 一个前台进程
- [ ] 我知道容器比虚拟机少掉了"完整操作系统"那一层
- [ ] 我知道 `latest` 不是"最新版"，生产环境不该用它

## B. 实操

- [ ] `docker version` 能出 Client 和 Server 两段
- [ ] `docker info` 能看到 `Registry Mirrors`
- [ ] `docker run hello-world` 跑通
- [ ] `docker ps` / `docker ps -a` 我知道什么时候用哪个
- [ ] `docker images` 我会读五列
- [ ] `docker rm` 和 `docker rmi` 我各跑过一次
- [ ] 我用 `-it` 进过一个 ubuntu 容器并且 `exit` 出来了
- [ ] 我会 `docker system df`

## C. 排错

- [ ] 看到"只有 Client 没有 Server"，我知道是引擎没起
- [ ] 我知道 `Client.Timeout` / `i/o timeout` 是网络问题，不是安装问题
- [ ] 我知道 `docker rmi` 报 `conflict` 要先删容器
- [ ] 我知道 `docker ps` 空不一定是失败

## D. 交付

- [ ] Docker Desktop 装好，重启电脑后还能自己起来
- [ ] 加速器配好，`docker pull` 能拉下来东西
- [ ] `docker-lab/命令记录.md` 里贴了至少 5 条命令的真实输出

## E. 笔记

- [ ] `NOTES.md` 十一节都填了
- [ ] 「我还不懂的词」有内容（写"没有"不算）
- [ ] 七个错误的表格填了

## 本节课要能说出口的一句话

> **镜像是一个装着"程序 + 它的环境"的只读模板；容器是它跑起来的一个进程；容器里没有的东西，就是你下一个 bug。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `docker` 不是内部或外部命令 | 没装，或装了没重启终端 | 重开终端；还不行看重装 |
| `docker version` 只有 Client | 引擎没起 | 开 Docker Desktop，等鲸鱼变绿；`wsl --update` |
| `error during connect ... The system cannot find the file specified` | 引擎没起 / WSL 没装好 | 重启电脑 → `wsl --update` → `wsl --shutdown` |
| `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` | 同上；或你在 WSL 里没开 integration | 开 WSL Integration |
| Docker Desktop 一直 Starting | WSL 卡住 / 内存不够 | `wsl --shutdown` 再开；加大 WSL 内存 |
| `Client.Timeout exceeded while awaiting headers` | 连不上 Docker Hub | 配 `registry-mirrors` |
| `dial tcp ...: i/o timeout` | 同上 | 同上 |
| `toomanyrequests: You have reached your pull rate limit` | 没登录 Docker Hub，被限流 | 配加速器；或登录账号 |
| `docker ps` 是空的 | 容器跑完退出了 | `docker ps -a` |
| `Exited (0)` | 正常结束 | 正常 |
| `Exited (1)` | 程序自己报错退出 | `docker logs <id>` 看原因（第 3 节课） |
| `Exited (137)` | 被强杀（多半内存不够） | 看内存；调 WSL 内存上限 |
| `No such container` | ID/名字写错，或已经删了 | `docker ps -a` 拿准确 ID |
| `conflict: unable to delete ... used by stopped container` | 容器还在用这个镜像 | 先 `docker rm <容器>` |
| `invalid reference format` | 镜像名里有大写字母或空格 | 镜像名全小写 |
| Apply & restart 报 JSON 错 | 少逗号 / 多逗号 / 中文引号 | 复制到 VS Code 格式化再贴回 |
| 容器里 `command not found` | 这个镜像里没装这个程序 | 正常，或用装了它的镜像 |
| 电脑变卡、风扇狂转 | WSL 吃了太多内存 | 改 `.wslconfig` 限制内存 |
| C 盘莫名少了几十 G | 镜像和停止的容器占的 | `docker system df` 看，`docker container prune` 清 |
| 重装 Docker 后镜像全没了 | 镜像存在 WSL 的虚拟磁盘里，卸载会删 | 正常，重新拉 |
