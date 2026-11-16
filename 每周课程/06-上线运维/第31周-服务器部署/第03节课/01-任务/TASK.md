# 第 213 节课：装运行环境——Node、git、nginx、swap

> **上一节课你能安全地进出了。这节课要把这台空机器变成"能跑 Node 的机器"。**
> 听起来只是几条 `apt install`。但这里有两个大坑：**`apt install nodejs` 给你的是十年前的思路**，**2G 内存不加 swap 会在 `npm ci` 时被杀掉**。
> 这两个坑不提前填，第 214 节你会以为是代码写错了。

**建议用时**：110 分钟
**你需要先完成**：第 212 节课（`ssh myserver` 能进，密码登录已关闭）

---

# 第 0 步：这台机器现在有多空（10 分钟）

## 0.1 你现在会什么

你能进服务器了，会 `pwd`、`ls -la`、`df -h`、`free -h`。

**但你会敲的命令，还不足以跑一个 Node 项目。**

## 0.2 你以后会遇到什么

```text
① "服务器上装 node 了吗？" —— 你得装
② "npm ci 跑到一半被杀掉了" —— 没有 swap
③ "80 端口怎么是 nginx 的欢迎页？" —— 那是默认站点，第 216 节才改
④ "git clone 不了，没装 git" —— 基础工具没装
⑤ "我 apt install nodejs 装了，怎么是 v12？" —— 装错源
```

**这五件事，全在今天的两个小时里。**

## 0.3 今天要建立的三个概念

```text
① 包管理器（apt）—— Linux 装软件的方式，和 Windows 双击 exe 完全不同
② 软件源（repository）—— 决定你装到的是哪个版本
③ swap（交换分区）—— 内存不够时，拿硬盘当内存用
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 版本号、swap 配置、五个错误的记录 |
| `环境清单.md` | `03-练习代码` | 你自己建：每个软件的版本 + 安装方式 + 验证命令 |

**今天的验收只有四行命令的输出：**

```text
node -v      → v20.x.x
npm -v       → 10.x.x
nginx -v     → nginx version: nginx/1.18.0 (Ubuntu)
free -h      → Swap: 2.0Gi
```

**四行全对，这节课就过了。**

---

# 第 1 步：先看清这台机器（10 分钟）

## 1.1 看系统版本

**登录进去，跑：**

```bash
cat /etc/os-release
```

**应该看到：**

```text
PRETTY_NAME="Ubuntu 22.04.4 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.4 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=jammy
```

**逐行读：**

| 行 | 意思 | 你要注意什么 |
|---|---|---|
| `PRETTY_NAME` | 给人看的版本名 | 是不是 22.04？ |
| `VERSION_ID` | 版本号 | **装软件源时要对得上这个数** |
| `VERSION_CODENAME=jammy` | 代号 | Ubuntu 每个版本有个动物代号 |
| `ID=ubuntu` | 发行版标识 | 有些脚本靠这个判断 |
| `ID_LIKE=debian` | 它是 Debian 系 | 所以用 `apt` 而不是 `yum` |

**为什么要看这个：**

```text
① 后面装 Node 源时，要选对"给 22.04 用的源"
② 你搜到的教程可能是给 Ubuntu 20.04 或 CentOS 的，命令不一样
③ 出问题时，你要能说清"我是什么系统"
```

**`jammy` 这个词你会在很多地方看到**，比如 apt 源地址里就有 `jammy`。看到它就知道"这是 22.04 的东西"。

## 1.2 看 CPU 架构

```bash
uname -m
```

**应该看到：**

```text
x86_64
```

**这是什么：** 你的 CPU 是 64 位 x86 架构（Intel/AMD）。

**为什么要注意：** 如果显示 `aarch64`，说明是 ARM 机器（有些云厂商的"轻量"用的是 ARM）。**两种架构的安装包不通用**，下载二进制文件时要选对。

## 1.3 看内存和硬盘

```bash
free -h
df -h /
```

**应该看到：**

```text
               total        used        free      shared  buff/cache   available
Mem:           1.9Gi       341Mi       1.2Gi       1.0Mi       412Mi       1.4Gi
Swap:             0B          0B          0B

Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G  4.7G   33G  13% /
```

**逐行读：**

| 行 | 意思 | 现在的状态 |
|---|---|---|
| `Mem: 1.9Gi` | 物理内存 2G（系统占一点，显示 1.9） | 正常 |
| `available 1.4Gi` | 现在还能用 1.4G | 还算宽裕 |
| `Swap: 0B` | **没有交换分区** | **今天要加 2G** |
| `/dev/vda1 40G` | 系统盘 40G | 够用 |
| `Use% 13%` | 用了 13% | 健康 |

**记住 `Swap: 0B` 这一行。** 第 8 步你会让它变成 `2.0Gi`。

## 1.4 现在的结论

```text
系统：Ubuntu 22.04 LTS ✅
架构：x86_64 ✅
内存：2G，没 swap ⚠️（今天补）
硬盘：40G，用了 13% ✅
软件：几乎什么都没有（连 git 都没装）
```

**接下来一件一件装。**

---

# 第 2 步：apt 是什么，为什么第一步永远是 update（15 分钟）

## 2.1 大白话

> **apt 是 Linux 的"应用商店"，但是命令行的。**

**在 Windows 上你装软件：**

```text
打开浏览器 → 搜 → 下载 exe → 双击 → 下一步下一步 → 完成
```

**在服务器上你装软件：**

```bash
apt install nginx -y
```

**然后就装完了。** 没有安装包，没有"下一步"。

**为什么服务器上要这样：**

```text
① 服务器没有图形界面，你点不了"下一步"
② 软件来自"官方仓库"，来源可信
③ 一条命令能装几十个依赖，不用你一个个找
④ 升级也是一条命令
```

## 2.2 `update` 和 `upgrade` 不是一回事

**这是新手最容易混的一对：**

| 命令 | 干什么 | 类比 |
|---|---|---|
| `apt update` | **更新"有哪些软件、什么版本"的清单** | 刷新商店的商品目录 |
| `apt upgrade` | **把已装的软件升级到新版本** | 把家里的旧东西换成新款 |
| `apt install X` | 装一个新软件 | 从商店买一个新东西 |

**关键理解：**

```text
apt update 不装任何东西，也不升级任何东西。
它只是让 apt 知道"现在仓库里有什么"。
```

**不跑 `update` 会怎样：**

```text
apt 用的是几天前（或几个月前）的清单。
清单里写的版本可能已经被仓库删了。
于是 install 报 404。
```

**这就是为什么所有教程第一行都是 `apt update`。**

## 2.3 跑 update

```bash
apt update
```

**应该看到：**

```text
Hit:1 http://mirrors.tencentyun.com/ubuntu jammy InRelease
Get:2 http://mirrors.tencentyun.com/ubuntu jammy-updates InRelease [119 kB]
Get:3 http://mirrors.tencentyun.com/ubuntu jammy-backports InRelease [108 kB]
Get:4 http://mirrors.tencentyun.com/ubuntu jammy-security InRelease [110 kB]
Get:5 http://mirrors.tencentyun.com/ubuntu jammy-updates/main amd64 Packages [1,203 kB]
...
Reading package lists... Done
Building dependency tree... Done
Reading state information... Done
42 packages can be upgraded. Run 'apt list --upgradable' to see them.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Hit:` | 这个源没变化，直接用本地缓存 |
| `Get:` | 这个源有更新，下载了 |
| `jammy` | 22.04 的代号（跟第 1.1 节对上了） |
| `main / updates / security` | 仓库的四个分区，`security` 是安全补丁 |
| `Reading package lists... Done` | 清单读完了 |
| `42 packages can be upgraded` | **有 42 个已装软件可以升级** |

**注意 `mirrors.tencentyun.com`：**

```text
这是云厂商的内网镜像源，不是官方的 archive.ubuntu.com。
内网镜像不计流量、速度快，云厂商默认就配好了。
```

**你不用改源。** 这是买国内服务器的一个隐藏好处。

## 2.4 要不要 upgrade

**建议做一次：**

```bash
apt upgrade -y
```

**会刷很长，最后：**

```text
...
Setting up libssl3:amd64 (3.0.2-0ubuntu1.15) ...
Processing triggers for libc-bin (2.35-0ubuntu3.6) ...
Processing triggers for man-db (2.10.2-1) ...
```

**`-y` 是什么：** 所有"是否继续？[Y/n]"自动回答 yes。**不加会卡在提问上**，你可能以为它死了。

**⚠️ 两个注意：**

```text
① 升级过程中如果问 "What do you want to do about modified configuration file?"，
   选 "keep the local version currently installed"（保留你改过的配置）。
   你现在还没改过任何配置，选默认即可。

② 升级内核之后，有些改动要重启才生效。
   现在可以重启一次：reboot
   重启后等 30 秒，重新 ssh 进去。
```

**这个词是怎么拼的：** `upgrade` 不是 `update`。**拼错了会提示 `E: Invalid operation upgradee`。**

---

# 第 3 步：装基础工具（10 分钟）

## 3.1 一条命令装三个

```bash
apt install -y git curl nano
```

**应该看到：**

```text
Reading package lists... Done
Building dependency tree... Done
Reading state information... Done
curl is already the newest version (7.81.0-1ubuntu1.15).
nano is already the newest version (6.2-1).
The following NEW packages will be installed:
  git git-man liberror-perl
0 upgraded, 3 newly installed, 0 to remove and 0 not upgraded.
Need to get 4,213 kB of archives.
After this operation, 21.4 MB of additional disk space will be used.
Get:1 http://mirrors.tencentyun.com/ubuntu jammy/main amd64 liberror-perl all 0.17029-1 [26.3 kB]
...
Setting up git (1:2.34.1-1ubuntu1.10) ...
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `curl is already the newest version` | 这个已经有了，不用装 |
| `nano is already the newest version` | 同上（云镜像通常预装了） |
| `The following NEW packages will be installed` | **真正要新装的** |
| `git git-man liberror-perl` | git 依赖另外两个包（自动带上） |
| `Need to get 4,213 kB` | 要下载 4MB |
| `After this operation, 21.4 MB` | 装完占 21MB 硬盘 |
| `Setting up git (1:2.34.1...)` | 正在配置 git |

**看到 `Setting up ...` 一串，就是装完了。**

## 3.2 验证

```bash
git --version
curl --version | head -1
nano --version | head -1
```

**应该看到：**

```text
git version 2.34.1
curl 7.81.0 (x86_64-pc-linux-gnu) libcurl/7.81.0 OpenSSL/3.0.2 zlib/1.2.11
GNU nano, version 6.2
```

**逐行读：**

| 输出 | 意思 |
|---|---|
| `git version 2.34.1` | git 装好了，版本 2.34（Ubuntu 22.04 自带的） |
| `curl 7.81.0` | curl 能用了（后面装 Node 源要用它） |
| `GNU nano, version 6.2` | nano 能用了（后面改配置文件要用它） |

**为什么在服务器上要装 git：**

```text
第 214 节你要 git clone 把代码拉下来。
以后更新代码是 git pull。
回滚是 git reset。
没有 git，你只能 scp 传 zip，每次都要传 node_modules。
```

**⚠️ 不需要在服务器上配 `user.name` / `user.email`。**

```text
git config 是"提交代码时用的身份"。
服务器上只读代码、不改代码、不提交，所以不用配。
```

---

# 第 4 步：先故意装错一次 Node（15 分钟）

**这一步是故意的。** 你要亲眼看到"最直觉的做法"给你什么。

## 4.1 最直觉的做法

```bash
apt install -y nodejs
```

**应该看到：**

```text
Reading package lists... Done
...
The following NEW packages will be installed:
  libnode72 nodejs
0 upgraded, 2 newly installed, 0 to remove and 0 not upgraded.
Need to get 12.4 MB of archives.
After this operation, 32.1 MB of additional disk space will be used.
...
Setting up nodejs (12.22.9~dfsg-1ubuntu3) ...
```

**注意最后一行括号里的 `12.22.9`。**

## 4.2 看版本

```bash
node -v
npm -v
```

**应该看到：**

```text
v12.22.9
8.5.1
```

**逐行读：**

| 输出 | 意思 | 问题 |
|---|---|---|
| `v12.22.9` | Node 12，**2022 年就已经停止维护** | ❌ 你要 20.x |
| `8.5.1` | npm 8，老版本 | ❌ 有些包要求 npm 9+ |

**Node 12 是什么年代的东西：**

```text
Node 12 的维护期在 2022 年 4 月结束。
它不支持：
  - 顶层 await（部分）
  - 新的 ES 模块特性
  - fetch（Node 18 才有）
  - 很多 npm 包的最低引擎要求是 >=18
```

## 4.3 为什么会这样

**因为 Ubuntu 的软件仓库，追求的是"稳定"，不是"新"。**

```text
Ubuntu 22.04 是 2022 年 4 月发布的。
它发布时，仓库里冻结了当时的软件版本。
Node 12 就是那时候的"稳定版"。
之后只打安全补丁，不升大版本。
```

**这个策略对操作系统是合理的**（不会因为升级 Node 把你的系统搞崩）。

**但对你的项目是灾难：**

```bash
npm ci
```

**会报：**

```text
npm ERR! code EBADENGINE
npm ERR! engine Unsupported engine
npm ERR! engine Not compatible with your version of node/npm: some-package@2.0.0
npm ERR! notsup Required: {"node":">=18.0.0"}
npm ERR! notsup Actual:   {"npm":"8.5.1","node":"v12.22.9"}
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `EBADENGINE` | 引擎（Node 版本）不匹配 |
| `Required: {"node":">=18.0.0"}` | 这个包要求 Node 18 以上 |
| `Actual: {"node":"v12.22.9"}` | 你现在是 12 |

**这就是"装错源"的后果：不是装不上，是装上了跑不了。**

**这种错最难查**，因为报错里写的是某个依赖包的名字，不是"你的 Node 太老"。

## 4.4 先把它卸掉

```bash
apt remove -y nodejs
apt autoremove -y
```

**应该看到：**

```text
The following packages will be REMOVED:
  libnode72 nodejs
...
```

**`autoremove` 是什么：** 把"因为装 nodejs 才装上的、现在没人用的"依赖也删掉。

**为什么不直接装新的覆盖：**

```text
因为 apt 的 nodejs 包和 NodeSource 的 nodejs 包是"同一个包名、不同来源"。
留着旧的源，apt 会犯迷糊，可能又给你装回 12。
先清干净，再换源。
```

---

# 第 5 步：用 NodeSource 装 Node 20（20 分钟）

## 5.1 三条路，你只需要知道两条

**想在 Ubuntu 上装 Node 20，有三条路：**

| 方式 | 命令 | 结果 | 适合谁 |
|---|---|---|---|
| Ubuntu 官方源 | `apt install nodejs` | **v12** | ❌ 不要 |
| NodeSource 源 | 加一个第三方 apt 源 | **v20** | ✅ **推荐** |
| nvm | 一个版本管理脚本 | v20，但装在用户目录 | 开发机，不适合服务器跑服务 |

**这一节用 NodeSource。**

## 5.2 加源

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
```

**拆开读：**

```text
curl                          下载工具
-f                            失败就报错，不要静默继续
-s                            安静模式，不显示进度条
-S                            但如果出错了，还是要显示错误
-L                            跟随重定向（这个地址会跳转）
https://deb.nodesource.com/setup_20.x   一个脚本，自动帮你配源
|                             把下载的内容交给下一个命令
bash -                        用 bash 执行（- 表示从标准输入读）
```

**看到 `| bash -` 要警觉：**

```text
这是"下载一个脚本，直接执行"。
它等于让远端代码在你机器上以 root 跑。
所以：只对可信来源这么做（官方文档给的地址）。
永远不要 `curl 某个论坛的链接 | bash`。
```

**应该看到类似：**

```text
## Installing the NodeSource Node.js 20.x repo...

## Populating apt-get cache...

+ apt-get update
Hit:1 http://mirrors.tencentyun.com/ubuntu jammy InRelease
...
## Confirming "jammy" is supported...

+ curl -sLf -o /dev/null 'https://deb.nodesource.com/node_20.x/dists/jammy/Release'

## Adding the NodeSource signing key to your keyring...

+ curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

## Creating apt sources list file for the NodeSource Node.js 20.x repo...

+ echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main' > /etc/apt/sources.list.d/nodesource.list

## Run `sudo apt-get install -y nodejs` to install Node.js 20.x and npm
## You may also need development tools to build native addons:
     sudo apt-get install -y g++ make
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Installing the NodeSource Node.js 20.x repo` | 正在装 20.x 的源 |
| `Confirming "jammy" is supported` | **确认 22.04（jammy）被支持** |
| `Adding the NodeSource signing key` | 加签名密钥（防止有人伪造这个源） |
| `Creating apt sources list file` | 把源地址写进一个文件 |
| `Run sudo apt-get install -y nodejs` | 下一步该干什么 |

**两个关键文件：**

```text
/etc/apt/keyrings/nodesource.gpg         签名密钥
/etc/apt/sources.list.d/nodesource.list  源地址
```

**`signed-by=` 是什么：**

```text
它告诉 apt："从这个地址下载的包，必须用这把密钥验签"。
验不过就拒绝安装。
这是防"源被劫持"的机制。
```

## 5.3 确认源加上了

```bash
cat /etc/apt/sources.list.d/nodesource.list
```

**应该看到：**

```text
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main
```

**再看 apt 能不能读到它：**

```bash
apt update
```

**这次会多出一行：**

```text
Get:6 https://deb.nodesource.com/node_20.x nodistro InRelease [4,893 B]
```

**看到 `deb.nodesource.com`，说明源生效了。**

## 5.4 装

```bash
apt install -y nodejs
```

**应该看到：**

```text
Reading package lists... Done
...
The following NEW packages will be installed:
  nodejs
0 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.
Need to get 28.7 MB of archives.
After this operation, 189 MB of additional disk space will be used.
Get:1 https://deb.nodesource.com/node_20.x nodistro/main amd64 nodejs amd64 20.11.1-1nodesource1 [28.7 MB]
...
Setting up nodejs (20.11.1-1nodesource1) ...
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `1 newly installed` | 只装一个包（NodeSource 把 node 和 npm 打包在一起了） |
| `Get:1 https://deb.nodesource.com/...` | **从新源下载**（不是 Ubuntu 的源） |
| `20.11.1-1nodesource1` | 版本号。`1nodesource1` 说明是 NodeSource 打的包 |
| `189 MB` | Node 挺大，正常 |

## 5.5 验证（这一行是今天的核心）

```bash
node -v
npm -v
```

**应该看到：**

```text
v20.11.1
10.2.4
```

**如果 `node -v` 还是 `v12`：**

```bash
which node
```

**应该看到：**

```text
/usr/bin/node
```

**`which` 是什么：** 告诉你"这个命令实际是哪个文件"。

**如果输出是 `/usr/local/bin/node` 或 `/root/.nvm/...`：**

```text
说明还有另一个 node 在前面。
检查：
  echo $PATH
  ls -l /usr/bin/node
```

**这个排查方式以后通用：** 命令行为不对，先 `which`，看它到底跑了哪个文件。

## 5.6 为什么不用 nvm

**nvm 是开发机上很好用的工具**（能随时切 Node 版本）。**但服务器上不建议：**

| 问题 | 说明 |
|---|---|
| 装在用户目录 | `/root/.nvm/versions/node/v20.x/bin/node` |
| pm2 找不到它 | pm2 通过 systemd 启动时，PATH 里没有 nvm |
| 开机自启失败 | 服务器重启后，systemd 不知道 nvm 在哪 |
| 换用户就没了 | `su ubuntu` 之后 nvm 不生效 |

**真实症状：**

```text
你 ssh 进去，node -v 是 v20。
你 pm2 start server.js，起来了。
服务器重启后，pm2 说 online，但日志里：
  /usr/bin/env: 'node': No such file or directory
```

**因为 systemd 启动时的 PATH 和你的交互式 shell 不一样。**

**结论：**

```text
开发机（你的 Windows、Mac）→ 用 nvm，方便
服务器（跑服务）→ 用系统级安装（apt + NodeSource），稳定
```

## 5.7 顺手装编译工具（可选但建议）

```bash
apt install -y build-essential
```

**为什么：**

```text
有些 npm 包带 C++ 扩展（比如 bcrypt、sharp、sqlite3），
安装时要现场编译。
没有 g++ / make 就会报 node-gyp 错误。
```

**现在装上，比出错了再装省事。**

**验证：**

```bash
g++ --version | head -1
make --version | head -1
```

**应该看到：**

```text
g++ (Ubuntu 11.4.0-1ubuntu1~22.04) 11.4.0
GNU Make 4.3
```

---

# 第 6 步：换 npm 源（5 分钟）

## 6.1 为什么要换

**npm 默认从 `registry.npmjs.org` 下载，服务器在国外。**

**在国内服务器上：**

```text
装一个 100MB 的依赖 → 可能要 5 分钟，还可能中途超时
```

**换国内镜像：**

```text
同样的包 → 30 秒
```

## 6.2 换

```bash
npm config set registry https://registry.npmmirror.com
```

**应该没有任何输出。**

**验证：**

```bash
npm config get registry
```

**应该看到：**

```text
https://registry.npmmirror.com/
```

**测试一下速度：**

```bash
time npm view express version
```

**应该看到：**

```text
4.18.2

real    0m0.8s
```

**`time` 是什么：** 测量这条命令跑了多久。

**0.8 秒 = 快。** 如果超过 10 秒，说明源没生效。

## 6.3 这个配置存在哪

```bash
cat ~/.npmrc
```

**应该看到：**

```text
registry=https://registry.npmmirror.com/
```

**注意 `~/.npmrc`：**

```text
它在 /root 下。
所以它只对 root 用户生效。
你在服务器上用 root 跑服务，没问题。
但如果以后用别的用户跑，要重新配。
```

**⚠️ 不要把 `~/.npmrc` 提交到仓库。** 它可能有 token（如果你哪天 `npm login` 过）。

---

# 第 7 步：装 nginx（15 分钟）

## 7.1 装

```bash
apt install -y nginx
```

**应该看到：**

```text
Reading package lists... Done
...
The following NEW packages will be installed:
  fontconfig-config fonts-dejavu-core libfontconfig1 libgd3 libjpeg-turbo8
  libjpeg8 libnginx-mod-http-image-filter libnginx-mod-http-xslt-filter
  libnginx-mod-mail libnginx-mod-stream libwebp7 libxpm4 nginx nginx-common
  nginx-core
...
Setting up nginx (1.18.0-6ubuntu14.4) ...
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `libnginx-mod-*` | nginx 的模块（图片过滤、邮件、流） |
| `nginx-core` | 主体 |
| `1.18.0-6ubuntu14.4` | 版本。Ubuntu 22.04 自带 1.18，够用 |
| `Setting up nginx` | 装完了，**并且已经自动启动了** |

**注意最后一点：**

```text
apt 装 nginx 会自动启动它，还会设置开机自启。
你不用手动 systemctl start。
```

## 7.2 看它活着没

```bash
systemctl status nginx
```

**应该看到：**

```text
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-11-16 10:12:44 CST; 2min ago
       Docs: man:nginx(8)
    Process: 3120 ExecStartPre=/usr/sbin/nginx -t -q -g daemon on; master_process on; (code=exited, status=0/SUCCESS)
    Process: 3121 ExecStart=/usr/sbin/nginx -g daemon on; master_process on; (code=exited, status=0/SUCCESS)
   Main PID: 3122 (nginx)
      Tasks: 3 (limit: 1100)
     Memory: 5.2M
        CPU: 12ms
     CGroup: /system.slice/nginx.service
             ├─3122 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"
             ├─3123 "nginx: worker process"
             └─3124 "nginx: worker process"
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Loaded: ... enabled` | **开机自启已开启** |
| `Active: active (running)` | 正在跑 |
| `ExecStartPre=/usr/sbin/nginx -t` | **systemd 启动前会自动跑 `nginx -t`** |
| `Main PID: 3122 (nginx)` | 主进程号 |
| `worker process` | 干活的进程，2 个（对应 2 核） |

**`enabled` 这个词你以后要会看：**

```text
enabled  = 开机自启
disabled = 开机不自启
```

**按 `q` 退出。**

## 7.3 验证端口

```bash
curl -I http://127.0.0.1
```

**应该看到：**

```text
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Date: Mon, 16 Nov 2026 02:20:11 GMT
Content-Type: text/html
Content-Length: 612
Last-Modified: Mon, 16 Nov 2026 02:12:30 GMT
Connection: keep-alive
ETag: "612-5e9b1c2d-3f4a"
Accept-Ranges: bytes
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `HTTP/1.1 200 OK` | **200 = 成功**，这是你要的 |
| `Server: nginx/1.18.0 (Ubuntu)` | 是 nginx 在回答 |
| `Content-Type: text/html` | 返回的是网页 |
| `Content-Length: 612` | 612 字节（nginx 的欢迎页） |
| `Connection: keep-alive` | 连接保持 |

**`curl -I` 是什么：** 只请求响应头，不下载正文。`-I` 是大写 i（`--head`）。

**为什么用 `127.0.0.1` 而不是公网 IP：**

```text
127.0.0.1 = 本机回环地址，请求不出网卡。
测试 nginx 本身，不测网络和安全组。
```

**这体现一个原则：**

```text
先证明"本机内部的链路通"，再去证明"外面能进来"。
两边一起查，你分不清是哪边的问题。
```

## 7.4 从你自己电脑试

**在你 Windows 的浏览器里打开：**

```text
http://47.98.xx.xx
```

**如果看到：**

```text
Welcome to nginx!
If you see this page, the nginx web server is successfully installed and working.
Further configuration is required.
```

**说明 80 端口是通的。**

**如果一直转圈然后超时：**

```text
安全组没开 80。
去控制台 → 防火墙 → 添加规则 → TCP 80 → 0.0.0.0/0
```

**⚠️ 这个欢迎页说明"nginx 在跑"，但不能证明"你的应用在跑"。**

**第 216 节会把它换成你的 chat-app。现在先让它挂着。**

## 7.5 记住四个路径

**后面每天都要用：**

```text
/etc/nginx/nginx.conf              主配置
/etc/nginx/sites-available/        可用的站点配置
/etc/nginx/sites-enabled/          已启用的站点（软链接）
/var/log/nginx/access.log          访问日志
/var/log/nginx/error.log           错误日志
```

**验证一下它们都在：**

```bash
ls -la /etc/nginx/sites-enabled/
ls -l /var/log/nginx/
```

**应该看到：**

```text
lrwxrwxrwx 1 root root 34 Nov 16 10:12 default -> /etc/nginx/sites-available/default

-rw-r--r-- 1 www-data adm  0 Nov 16 10:12 access.log
-rw-r--r-- 1 www-data adm  0 Nov 16 10:12 error.log
```

**`lrwxrwxrwx` 里的 `l` 是什么：** 软链接（快捷方式）。

**`sites-enabled` 里全是软链接，指向 `sites-available`。** 这是 nginx 的惯例：

```text
sites-available  写好的配置放这里（可能没启用）
sites-enabled    启用的放这里（软链接过去）
```

**为什么这么设计：** 想临时关掉一个站点，删掉软链接就行，配置还留着。

**`www-data` 是什么：** nginx 的工作进程用的低权限用户。**root 起服务，worker 用 www-data 干活**，这是安全设计。

---

# 第 8 步：加 2G swap（20 分钟）

## 8.1 先说清楚会出什么事

**2G 内存跑 `npm ci`，很容易被杀。**

**你会看到：**

```text
$ npm ci
npm WARN ...
Killed
```

**然后就没了。没有任何 npm 的错误信息，就一个 `Killed`。**

**为什么：**

```text
npm ci 在解压、链接依赖时，内存峰值能到 1.5G—2.5G。
系统本身占 300—400M。
内存不够 → 内核的 OOM killer 出手 → 挑一个"最占内存"的进程杀掉。
被杀的通常就是 node。
```

**证据在 `dmesg` 里：**

```bash
dmesg | grep -i "killed process"
```

**应该看到：**

```text
[ 1234.567890] Out of memory: Killed process 4521 (node) total-vm:2154320kB, anon-rss:1892140kB, file-rss:0kB, shmem-rss:0kB
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `Out of memory` | 内存用完了 |
| `Killed process 4521 (node)` | **被杀的进程是 4521 号，名字叫 node** |
| `total-vm:2154320kB` | 它申请了 2.1G 虚拟内存 |
| `anon-rss:1892140kB` | 实际占了 1.8G 物理内存 |

**这就是"Killed"的真凶。**

**如果你不知道这条，你会以为：**

```text
① 代码有问题 → 改代码（改一天）
② 依赖有问题 → 换依赖（改一天）
③ 服务器坏了 → 重装（半天）
```

**实际上只要加 2G swap，五分钟解决。**

## 8.2 加

**四步，四条命令：**

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

**逐条读：**

```text
fallocate -l 2G /swapfile   创建一个 2G 的文件（瞬间完成，不写零）
chmod 600 /swapfile         只有 root 能读写
mkswap /swapfile            把这个文件格式化成 swap 格式
swapon /swapfile            启用它
```

**每一步的应该看到：**

**第一步没有输出。** 验证：

```bash
ls -lh /swapfile
```

```text
-rw------- 1 root root 2.0G Nov 16 10:40 /swapfile
```

**注意 `-rw-------`。** 如果显示 `-rw-r--r--`，说明 `chmod` 没生效。

**第三步：**

```text
Setting up swapspace version 1, size = 2 GiB (2147479552 bytes)
no label, UUID=3f2b1a4c-5d6e-7f80-9a1b-2c3d4e5f6a7b
```

**第四步没有输出。** 但会有警告的可能：

```text
swapon: /swapfile: insecure permissions 0644, 0600 suggested.
```

**看到这个 = 你跳过了 `chmod 600`。**

## 8.3 验证

```bash
free -h
```

**应该看到：**

```text
               total        used        free      shared  buff/cache   available
Mem:           1.9Gi       352Mi       1.0Gi       1.0Mi       552Mi       1.4Gi
Swap:          2.0Gi          0B       2.0Gi
```

**`Swap: 2.0Gi` —— 这就是今天要的那一行。**

**再看详细一点：**

```bash
swapon --show
```

**应该看到：**

```text
NAME      TYPE  SIZE USED PRIO
/swapfile file    2G   0B   -2
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `NAME` | `/swapfile`，就是一个普通文件 |
| `TYPE: file` | 文件型 swap（不是独立分区） |
| `SIZE: 2G` | 2G |
| `USED: 0B` | 还没用到（正常） |
| `PRIO: -2` | 优先级，只有一个时无所谓 |

## 8.4 ⚠️ 关键一步：让它开机自动挂载

**现在这个 swap 是临时的。重启就没了。**

**为什么：**

```text
swapon 只是"现在启用"。
它没写进任何配置文件。
重启时内核只按 /etc/fstab 挂载东西。
```

**写进 fstab：**

```bash
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**`>>` 是追加，不是覆盖。** **⚠️ 用 `>` 会清空 fstab，你的服务器下次启动会进不了系统。**

**验证写进去了：**

```bash
tail -3 /etc/fstab
```

**应该看到：**

```text
UUID=xxxx-xxxx / ext4 defaults 0 1
/swapfile none swap sw 0 0
```

## 8.5 ⚠️ 验证 fstab 没写错（这一步能救你的服务器）

**fstab 写错，服务器重启会卡在"emergency mode"，SSH 进不去。**

**验证命令：**

```bash
mount -a
```

**应该没有任何输出。**

**为什么"没有输出"是好事：**

```text
mount -a = "按 fstab 挂载所有东西"。
如果有错，它会报错。
没错就不说话。
```

**如果报错，比如：**

```text
mount: /swapfile: unknown filesystem type 'swapp'.
```

**立刻改回来：**

```bash
nano /etc/fstab
```

**把那一行改对，再 `mount -a`，直到没有输出。**

**⚠️ `mount -a` 通过了，才允许重启。** 这条规则以后一直有效。

## 8.6 顺手调两个参数（可选）

**默认情况下，系统"能不换出就不换出"，swap 用得很少。对 2G 小机器，稍微积极一点更好：**

```bash
sysctl vm.swappiness=20
```

**应该看到：**

```text
vm.swappiness = 20
```

**`swappiness` 是什么：** 0—100，越大越愿意用 swap。默认 60。

**为什么设 20 而不是 100：**

```text
swap 在硬盘上，比内存慢几百倍。
设太高 → 频繁换出换入 → 系统变卡。
设 20 → 只在真的紧张时用。
```

**⚠️ 这个设置重启也会丢。** 想持久化要写进 `/etc/sysctl.conf`。**这节课不要求**，因为默认值 60 也能用，只是没那么从容。

## 8.7 现在再跑一次 `npm ci` 就不会被杀

**这一节最后要理解的是"因果"：**

```text
Killed 不是代码错误，是内存不够。
内存不够不是"机器太差"，是"没给备用的地儿"。
swap 就是那块备用地。
```

**它不是万能药：**

```text
swap 让"峰值"过得去，但不能让"长期超载"变好。
如果你的程序常驻内存就要 2G，swap 只会让它变慢。
```

**你的应用常驻内存大概 80—150MB。** swap 只是给 `npm ci` 这种"短时高峰"兜底。

---

# 第 9 步：写一份环境清单（10 分钟）

**在 `03-练习代码/` 里新建 `环境清单.md`，把下面这些真实输出抄进去：**

```bash
echo "===== OS ====="
cat /etc/os-release | head -3
echo "===== CPU ====="
nproc
uname -m
echo "===== 内存 ====="
free -h
echo "===== 硬盘 ====="
df -h /
echo "===== 版本 ====="
git --version
node -v
npm -v
nginx -v
echo "===== npm 源 ====="
npm config get registry
echo "===== swap ====="
swapon --show
```

**应该看到类似：**

```text
===== OS =====
PRETTY_NAME="Ubuntu 22.04.4 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
===== CPU =====
2
x86_64
===== 内存 =====
               total        used        free      shared  buff/cache   available
Mem:           1.9Gi       352Mi       1.0Gi       1.0Mi       552Mi       1.4Gi
Swap:          2.0Gi          0B       2.0Gi
===== 硬盘 =====
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G  6.1G   32G  17% /
===== 版本 =====
git version 2.34.1
v20.11.1
10.2.4
nginx version: nginx/1.18.0 (Ubuntu)
===== npm 源 =====
https://registry.npmmirror.com/
===== swap =====
NAME      TYPE  SIZE USED PRIO
/swapfile file    2G   0B   -2
```

**这份清单以后有大用：**

```text
① 换服务器时，照着它装一遍
② 出问题时，先看"版本对不对"
③ 交付给客户时，写进文档
```

---

# 第 10 步：故意犯六个错（25 分钟）

## 错误 1：不 `apt update` 直接 install

**操作：**

新开一台机器（或者就当你的源很旧），直接：

```bash
apt install -y nginx
```

**会怎样：**

```text
Reading package lists... Done
Building dependency tree... Done
Reading state information... Done
E: Unable to locate package nginx
```

**为什么：**

```text
apt 的"包清单"是空的，或者是很久以前的。
它根本不知道有个叫 nginx 的包。
```

**怎么修：**

```bash
apt update
apt install -y nginx
```

**这个错看起来低级，但它是"新机器上第一条命令"最常见的失败原因。**

## 错误 2：装了 `apt` 的 nodejs，然后用 `npm ci`

**操作：**

```bash
apt install -y nodejs
cd /srv/app    # 第 214 节才有，现在可以先建一个测试目录
npm ci
```

**会怎样：**

```text
npm ERR! code EBADENGINE
npm ERR! engine Unsupported engine
npm ERR! engine Not compatible with your version of node/npm: express@5.0.0
npm ERR! notsup Required: {"node":">=18.0.0"}
npm ERR! notsup Actual:   {"npm":"8.5.1","node":"v12.22.9"}
```

**或者更隐晦的：**

```text
SyntaxError: Unexpected token '??'
```

**`??` 是什么：** 空值合并运算符，Node 14 才有。**Node 12 不认识，直接语法错误。**

**为什么难查：**

```text
报错指向某一行的代码，看起来像是"代码写错了"。
实际上是"运行环境太老"。
```

**怎么修：**

```bash
apt remove -y nodejs && apt autoremove -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
```

## 错误 3：swapfile 不 `chmod 600`

**操作：**

```bash
fallocate -l 2G /swapfile
mkswap /swapfile
swapon /swapfile
```

**会怎样：**

```text
swapon: /swapfile: insecure permissions 0644, 0600 suggested.
```

**但 swap 还是启用了。**

**为什么是警告不是错误：**

```text
0644 意味着"所有用户都能读这个文件"。
swap 文件里可能有内存里的敏感数据（密码、密钥）。
所以官方建议 600。
它警告但不阻止，因为技术上能跑。
```

**怎么修：**

```bash
chmod 600 /swapfile
swapoff /swapfile
swapon /swapfile
```

**验证：**

```bash
ls -l /swapfile
```

```text
-rw------- 1 root root 2147483648 Nov 16 10:40 /swapfile
```

**看到 `-rw-------` 才对。**

## 错误 4：`/etc/fstab` 写错，重启进不了系统

**操作：**

**⚠️ 别真做。** 假设你写成了：

```text
/swapfile none swap swapp 0 0
```

（`sw` 写成了 `swapp`）

**会怎样：**

重启后 SSH 连不上。控制台 VNC 进去看到：

```text
[FAILED] Failed to mount /swapfile.
See 'systemctl status swapfile.swap' for details.
[DEPEND] Dependency failed for /swapfile.
You are in emergency mode. After logging in, type "journalctl -xb" to view
system logs, "systemctl reboot" to reboot, "systemctl default" or "exit"
to boot into default mode.
Give root password for maintenance
(or press Control-D to continue):
```

**为什么：**

```text
systemd 在启动时要挂载 fstab 里所有的东西。
有一项失败，它会认为"系统状态不完整"，进入 emergency mode。
这是保护机制：宁可停下让你修，也不要带着错误跑。
```

**怎么修：**

```text
① VNC 进去
② 输入 root 密码（如果设过）
③ nano /etc/fstab
④ 把那行改对或删掉
⑤ mount -a 确认没输出
⑥ reboot
```

**所以第 8.5 节的 `mount -a` 必须跑。** 它能在重启前发现这个错。

## 错误 5：装完 nginx 以为"网站就好了"

**操作：**

装完 nginx，浏览器打开 IP，看到 `Welcome to nginx!`，然后以为部署完了。

**会怎样：**

**第 217 节你打开的还是这个页面，不是你的应用。**

**为什么：**

```text
nginx 装完自带一个"默认站点"。
它会把 80 端口的请求，指向 /var/www/html/index.nginx-debian.html。
你的 Node 程序在 3000 端口，nginx 根本不知道它的存在。
```

**怎么修：**

第 216 节会做两件事：

```text
① 在 sites-available 里写一个新配置，把 80 转发到 127.0.0.1:3000
② 删掉/禁用默认站点
```

**这个错的价值：** 它让你知道"nginx 能跑"和"你的应用能被访问"是两件事。

## 错误 6：以为 `node -v` 对就行，忘了看 `which node`

**操作：**

```bash
node -v
```

```text
v20.11.1
```

**看起来没问题。但：**

```bash
which node
```

```text
/usr/local/bin/node
```

**会怎样：**

**你现在这个 ssh 会话里能用。但 pm2 通过 systemd 启动时用不了。**

**症状（第 215 节会遇到）：**

```text
pm2 list 显示 online
但访问网站 502
pm2 logs 里：
  /usr/bin/env: 'node': No such file or directory
```

**为什么：**

```text
systemd 启动服务时的 PATH 是 /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
它不读你的 .bashrc，也不读 nvm 的设置。
如果 node 是通过 nvm 装在 /root/.nvm/... 的，systemd 找不到。
```

**怎么修：**

```bash
which node
```

**必须是 `/usr/bin/node`。** 如果是别的路径：

```bash
ls -l /usr/bin/node
```

**不存在就说明你装的方式不对，回去用 NodeSource 重装。**

**结论一句话：**

```text
服务器上装软件，要装在"系统路径"里，不要装在"某个用户的目录"里。
```

---

# 第 11 步：写学习笔记（10 分钟）

```markdown
# 第 213 节课学习笔记

## 一、这台机器的原始状态

| 项目 | 值 |
|---|---|
| 系统版本 | |
| 架构 | |
| 内存 | |
| swap | |
| 硬盘 | |

## 二、apt 的三个动词

| 命令 | 干什么 | 类比 |
|---|---|---|
| `apt update` | | |
| `apt upgrade` | | |
| `apt install` | | |

不 `update` 直接 install 会怎样：

## 三、Node 版本

`apt install nodejs` 装出来是：______

为什么 Ubuntu 仓库给这么老的版本：

那为什么不能用它（写一条我遇到的或想象的报错）：

## 四、NodeSource 做了什么

| 文件 | 内容 |
|---|---|
| `/etc/apt/keyrings/nodesource.gpg` | |
| `/etc/apt/sources.list.d/nodesource.list` | |

`signed-by=` 是什么意思：

## 五、为什么服务器不用 nvm

| 问题 | 说明 |
|---|---|
| 装在哪 | |
| pm2 能找到吗 | |
| 重启后呢 | |

`which node` 我的输出是：

## 六、nginx

`nginx -v` 输出：

`systemctl status nginx` 的 `Loaded` 那一行：

`curl -I http://127.0.0.1` 第一行：

四个路径分别是什么：

| 路径 | 干什么 |
|---|---|
| `/etc/nginx/nginx.conf` | |
| `/etc/nginx/sites-available/` | |
| `/etc/nginx/sites-enabled/` | |
| `/var/log/nginx/access.log` | |

## 七、swap

为什么要加 swap（写出 `Killed` 和 `dmesg` 的关系）：

| 步骤 | 命令 |
|---|---|
| 建文件 | |
| 改权限 | |
| 格式化 | |
| 启用 | |
| 开机自动 | |

`free -h` 里 Swap 那一行现在是：

`mount -a` 的输出是：

## 八、六个错误的后果

| 错误 | 现象 | 怎么修 |
|---|---|---|
| 不 update | | |
| 用 apt 的 node | | |
| swapfile 权限 | | |
| fstab 写错 | | |
| 以为 nginx 好了 | | |
| 不看 `which node` | | |

## 九、我的环境清单

（把 `环境清单.md` 里的版本号抄关键几行）

## 十、卡在哪

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `node -v` 是 v20.x，`which node` 是 `/usr/bin/node`
- [ ] `nginx -v` 有输出，`systemctl status nginx` 是 active
- [ ] `free -h` 里 Swap 是 2.0Gi
- [ ] `/etc/fstab` 里有 swap 那行，`mount -a` 没报错
- [ ] 我跑过一次 `dmesg | grep -i "killed process"`
```

---

# 第 12 步：课后练习

## 练习一：把 `Killed` 复现一次

**要求：**

1. 临时关掉 swap：`swapoff /swapfile`；
2. 用一个吃内存的命令模拟：`node -e "const a=[];while(true)a.push(Buffer.alloc(1024*1024))"`；
3. 看它被杀；
4. `dmesg | tail -5` 找证据；
5. 重新 `swapon /swapfile`。

**记录：** `Killed` 出现用了多久？`dmesg` 里那行写了什么？

**⚠️ 这个实验会让机器短暂卡顿，做完立刻恢复 swap。**

**思考题：** 为什么这个命令不会把整台机器搞崩，而是"自己被杀"？

## 练习二：对比两个 Node 源

**要求：**

1. `apt-cache policy nodejs` 看当前可装的版本和来源；
2. 记录三个字段：`Installed`、`Candidate`、来源地址。

**记录：** Candidate 是多少？

**思考题：** 如果哪天你 `apt install nodejs` 又装回 12，最可能是什么原因？

## 练习三：算一次内存账

**要求：**

1. `free -m` 记下 total / used / available；
2. 起一个 node 进程占 200M；
3. 再看一次 `free -m`。

**记录：** 三个数字怎么变的？

**思考题：** 为什么 `available` 比 `free` 大很多？

## 练习四：找 nginx 的默认页面文件

**要求：**

1. 从 `curl -I 127.0.0.1` 的 `Content-Length: 612` 出发；
2. 找到那个 612 字节的文件；
3. 用 `nano` 打开看一眼，**不要改**。

**记录：** 文件路径。

**思考题：** 第 216 节你改配置后，这个文件还需要吗？

## 练习五：把环境清单变成脚本

**要求：**

1. 把第 9 步那串 `echo` 命令写进 `check-env.sh`；
2. `chmod +x check-env.sh`；
3. 跑一次。

**记录：** 脚本输出和你手动跑的一样吗？

**思考题：** 为什么脚本第一行要写 `#!/bin/bash`？

---

# 第 13 步：最终验收

## A. 概念

- [ ] 我能说清 `apt update` 和 `apt upgrade` 的区别
- [ ] 我知道 Ubuntu 仓库的 nodejs 为什么是 12
- [ ] 我知道 swap 是干什么的，什么时候会用上
- [ ] 我知道 nginx 的 `sites-available` 和 `sites-enabled` 的关系
- [ ] 我知道为什么服务器不用 nvm

## B. 实操

- [ ] `node -v` 是 v20.x
- [ ] `which node` 是 `/usr/bin/node`
- [ ] `npm -v` 是 10.x
- [ ] `git --version` 有输出
- [ ] `nginx -v` 有输出
- [ ] `curl -I http://127.0.0.1` 返回 200
- [ ] `free -h` 里 Swap 是 2.0Gi
- [ ] `swapon --show` 能看到 `/swapfile`

## C. 排错

- [ ] 我知道 `Killed` 要去 `dmesg` 里找原因
- [ ] 我知道 `EBADENGINE` 是 Node 版本太老
- [ ] 我知道 `mount -a` 没输出才是对的
- [ ] 我会用 `which` 排查"命令跑了哪个文件"

## D. 交付

- [ ] `03-练习代码/环境清单.md`
- [ ] `02-笔记/NOTES.md` 填完
- [ ] `/etc/fstab` 里有 swap 那行，且 `mount -a` 通过

## E. 笔记

- [ ] 真实的版本号都记了
- [ ] `dmesg` 的输出抄了一行
- [ ] 「卡在哪」写了真实内容

## 本节课要能说出口的一句话

> **服务器上的软件不是"下载双击"，是"从哪个源装"；`apt install nodejs` 给你的是一台 2022 年的机器，而 2G 内存不加 swap，`npm ci` 会连错误信息都不给你，只留一个 `Killed`。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `E: Unable to locate package nginx` | 没 `apt update` | 先 `apt update` |
| `E: Could not get lock /var/lib/dpkg/lock-frontend` | 另一个 apt 在跑 | 等它结束；别 `rm` 那个锁文件 |
| `node -v` 是 v12 | 用了 Ubuntu 的源 | 卸掉，用 NodeSource |
| `EBADENGINE` | Node 版本低于包要求 | 升到 20.x |
| `SyntaxError: Unexpected token '??'` | Node 太老，不认识新语法 | 同上 |
| `npm ci` 只输出 `Killed` | 内存不够，OOM killer | 加 swap；看 `dmesg` |
| `swapon: insecure permissions 0644` | 没 `chmod 600` | 改权限后 `swapoff` + `swapon` |
| 重启后 swap 没了 | 没写 `/etc/fstab` | 加 `/swapfile none swap sw 0 0` |
| 重启进 emergency mode | fstab 写错 | VNC 进去改回来 |
| `nginx: command not found` | 没装或没装完 | `apt install -y nginx` |
| `curl: (7) Failed to connect to 127.0.0.1 port 80` | nginx 没跑 | `systemctl status nginx` |
| 浏览器打 IP 超时 | 安全组没开 80 | 控制台加规则 |
| `which node` 不是 `/usr/bin/node` | 装在用户目录 | 重装到系统路径 |
| `g++: command not found` | 没装编译工具 | `apt install -y build-essential` |
| `npm view` 很慢 | 没换源 | `npm config set registry ...npmmirror.com` |
| 磁盘满了 | 日志/`node_modules` 堆积 | `df -h`、`du -sh /*` 找大户 |
