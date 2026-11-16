# 第 214 节课：上传项目——`git clone` 与 `.env`

> **机器装好了，现在把 `chat-app` 搬上去。**
> 这一步有两个"看起来成功、其实缺东西"的陷阱：**代码上去了但 `.env` 没上去**（程序起来就 500），**依赖装了一半被杀了**（以为装完了）。
> 今天不启动服务，只把"代码 + 配置 + 依赖"三样摆整齐。

**建议用时**：100 分钟
**你需要先完成**：第 213 节课（`node -v` 是 22.x，`git --version` 有输出，swap 是 2G）

---

# 第 0 步：为什么"传代码"值得一节课（10 分钟）

## 0.1 你现在会什么

```text
服务器：Ubuntu 22.04 + Node 22 + git + nginx + 2G swap
本地：chat-app 代码（在 GitHub 上，.env 不在里面）
```

**两个世界还没连起来。**

## 0.2 你以后会遇到什么

```text
① "代码改了，怎么更新到服务器？" —— git pull，一条命令
② "线上报 500，本地好的" —— .env 没建
③ "npm ci 装完了，怎么起不来" —— 装了一半，缺依赖
④ "我要退回昨天的版本" —— git reset，不用重新上传
⑤ "别传 node_modules，几百兆" —— 用 git 就不会传
```

**这五件事，都取决于你今天用什么方式把代码弄上去。**

## 0.3 今天要建立的三个概念

```text
① 部署目录 /srv/app —— 代码该放哪，为什么不是 /root
② 构建产物 vs 源码 —— node_modules 是"算出来的"，不是"存起来的"
③ .env 的边界 —— 它必须存在，但绝不能进 git
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | `.env` 的格式规则、`npm ci` 的记录 |
| `上传记录.md` | `03-练习代码` | 你自己建：仓库地址、部署路径、`.env` 有几个变量（不写值） |
| 代码 | 服务器 `/srv/app` | `git clone` 下来的完整项目 |
| `.env` | 服务器 `/srv/app/.env` | 手动建，600 权限 |
| 依赖 | 服务器 `/srv/app/node_modules` | `npm ci` 装出来的 |

**验收标准是一条命令：**

```bash
cd /srv/app && ls -la
```

**能看到 `package.json`、`server.js`、`.env`（隐藏）、`node_modules/`，就对了。**

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **服务器**（clone 代码、建 `.env`、装依赖）。 |
| **用哪个终端** | **Git Bash → SSH 到服务器。** |
| **现在在哪个目录** | <code>ssh root@你的服务器IP</code><br><code>cd /srv/app</code> |
| **本节新建什么** | 服务器上：`/srv/app/` 里的项目代码、`/srv/app/.env`、`/srv/app/node_modules/`<br>本地：`上传记录.md` |

## 开工前先跑这一条

确认你没站错地方：

```bash
cd /srv/app && ls -la | head
```

**应该看到：**

```text
total 8
drwxr-xr-x 2 root root 4096 ... .
drwxr-xr-x 3 root root 4096 ... ..
```

**开工时应该是空的（只有 `.` 和 `..`）。** 这一节第 4 步才 `git clone`。

## 如果不对

**已经有 `chat-app/` 或 `package.json`** → 你之前做过，先 `ls` 看清，别直接覆盖（可能把上次的 `.env` 冲掉）。

**`git clone` 报 `Could not resolve host`** → 服务器 DNS 有问题，`cat /etc/resolv.conf` 看有没有 `nameserver`。

---

# 第 1 步：三种传法，选对一种（15 分钟）

## 1.1 你能想到的三种办法

```text
① 把项目打成 zip，用 scp 传上去，再解压
② 用 FTP/SFTP 工具（FileZilla）拖上去
③ 用 git clone
```

**只有第三种能长期用。**

## 1.2 三种办法对比

| | zip + scp | FileZilla 拖拽 | git clone |
|---|---|---|---|
| 第一次传 | 可以 | 可以 | 可以 |
| 以后更新 | 整个重传 | 手动挑文件 | `git pull` 一条命令 |
| 会不会传 `node_modules` | **会（几百 MB）** | 容易误传 | **不会（.gitignore 挡住了）** |
| 能不能回滚 | 不能（除非你留了一堆 zip） | 不能 | `git reset` 到任意版本 |
| 能不能看到改了什么 | 不能 | 不能 | `git log`、`git diff` |
| 多人协作 | 灾难 | 灾难 | 天然支持 |

**关键差异在第二行和第三行。**

## 1.3 `scp` 到底慢在哪

**你自己试一次就知道了：**

```bash
scp -r ./chat-app root@47.98.xx.xx:/root/
```

**会发生什么：**

```text
chat-app/server.js                 100%  2KB   1.2MB/s   00:00
chat-app/package.json              100%  1KB   1.5MB/s   00:00
chat-app/node_modules/.package-lock.json  100%  120KB  800KB/s  00:00
chat-app/node_modules/express/...  100%  45KB   ...
（接下来是 3 万个文件）
```

**一个带 `node_modules` 的 Express 项目，通常是 2 万—5 万个文件、300—600MB。**

**传一次 20—60 分钟，取决于你的上行带宽。**

**而且：**

```text
① 传完你还要 npm ci 吗？不用，因为 node_modules 已经传了
② 但你的 node_modules 是在 Windows 上装的
③ 里面可能有编译好的原生模块（.node 文件），是 Windows 版
④ 在 Linux 上跑 → Invalid ELF header / cannot open shared object
```

**这就是为什么"传 node_modules"是个坑：平台不一样，二进制不通用。**

## 1.4 `git clone` 好在哪

```text
① 只传源码，几百 KB，几秒钟
② node_modules 被 .gitignore 挡住，永远不会传
③ 以后更新：git pull（只传改动的部分）
④ 回滚：git reset --hard <某个commit>
⑤ 服务器上的代码 = 仓库里的代码，不会"多一个文件少一个文件"
```

**最后一条最重要。**

**用 scp 传，你永远不知道服务器上现在到底是哪个版本。**
**用 git，`git log -1` 一句话就说清了。**

## 1.5 一句话

> **部署不是"把文件搬过去"，是"让服务器 checkout 到某个版本"。**

---

# 第 2 步：建部署目录（10 分钟）

## 2.1 代码该放哪

**大多数人会放到 `/root/chat-app`。这不是不行，但不好。**

| 路径 | 用途 | 建议 |
|---|---|---|
| `/root/` | root 用户的家目录 | ❌ 别放项目，家目录是给人用的 |
| `/home/ubuntu/` | 普通用户家目录 | 可以，但用户切换会有权限麻烦 |
| `/var/www/` | 传统网站根目录 | 适合纯静态站点 |
| **`/srv/`** | **service 的缩写，专门放对外提供的服务** | ✅ **放这里** |
| `/opt/` | 可选软件包 | 适合装第三方软件，不适合放自己的代码 |

**`/srv` 是 Linux 的惯例。** 它明明白白地说："这里面是给外面用的服务。"

**好处：**

```text
① 你半年后 `ls /` 一眼就知道项目在哪
② 备份脚本好写：备份 /srv 就行
③ 权限好管：/srv/app 可以给固定用户
```

## 2.2 建目录

```bash
mkdir -p /srv/app
```

**`-p` 是什么：** parents，父目录不存在就一起建。**不加 `-p` 会报 `No such file or directory`（如果 `/srv` 不存在）。**

**验证：**

```bash
ls -ld /srv /srv/app
```

**应该看到：**

```text
drwxr-xr-x  3 root root 4096 Nov 16 10:55 /srv
drwxr-xr-x  2 root root 4096 Nov 16 10:56 /srv/app
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `d` | 是目录 |
| `rwxr-xr-x` | root 可读写执行，其他人可读可进 |
| `root root` | 属主 root，属组 root |
| `2` | 目录的链接数（空目录是 2） |

## 2.3 为什么用 `app` 这个名字

**因为它是"这个服务"，不是"这个项目"。**

```text
/srv/app         ← 服务代码（可以随时被替换）
/srv/app/.env    ← 这台机器的配置（不能丢）
/srv/backup/     ← 以后放备份
```

**如果你以后有第二个服务：**

```text
/srv/app
/srv/admin
/srv/api
```

**每个目录一个服务，清清楚楚。**

---

# 第 3 步：仓库是 public 还是 private（15 分钟）

## 3.1 先确认

**打开 GitHub 仓库页面，看标题下面那行：**

```text
Public        ← 全世界都能看
Private       ← 只有你和你邀请的人能看
```

**你的仓库一定是 Public 吧？**

**如果是 Public，`.env` 里绝对不能有真 key。** 第 4 周讲过，这里再强调一次。

## 3.2 Public 仓库：直接 clone

```bash
git clone https://github.com/你的用户名/chat-app.git
```

**不需要用户名密码。**

**但注意：**

```text
Public 仓库的代码，全世界都能下载。
如果你的 .env 曾经被提交过（哪怕后来删了），
去 GitHub 的历史里还能找到。
```

**检查一下（在本地做）：**

```bash
git log --all --oneline -- .env
```

**如果这条命令有输出：**

```text
⚠️ 你的 .env 进过仓库历史。
立刻做的事：
① 去模型平台吊销那个 key
② 重新发一个
③ 不要在服务器上用那个旧 key
```

**历史清理是另一门技术（`git filter-repo`），这一周不做。吊销 + 换 key 是最快最稳的解法。**

## 3.3 Private 仓库：要用凭据

**Private 仓库 clone 会问你要用户名和密码。但 GitHub 的"密码"现在不管用了：**

```text
$ git clone https://github.com/你的用户名/chat-app.git
Cloning into 'chat-app'...
Username for 'https://github.com': 你的用户名
Password for 'https://你的用户名@github.com':
remote: Support for password authentication was removed on August 13, 2021.
remote: Please see https://docs.github.com/... for information on currently recommended modes of authentication.
fatal: Authentication failed for 'https://github.com/你的用户名/chat-app.git'
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Username for ...` | 输你的 GitHub 用户名（不是邮箱） |
| `Password for ...` | **这里要输的不是登录密码** |
| `Support for password authentication was removed` | 2021 年 8 月起，密码认证被取消 |
| `Authentication failed` | 认证失败 |

**为什么取消：**

```text
① 很多人密码复用，泄露一个就全泄露
② 密码可以被暴力猜
③ token 可以精确控制权限、可以单独吊销
```

## 3.4 用 Personal Access Token（PAT）

**操作：**

1. GitHub → 右上角头像 → `Settings`；
2. 左下角 `Developer settings`；
3. `Personal access tokens` → `Tokens (classic)`；
4. `Generate new token (classic)`；
5. Note 写 `server-deploy`；
6. Expiration 选 90 天（**别选 No expiration**）；
7. 勾选 `repo`（只要这一个）；
8. 生成，**立刻复制**（离开页面就看不到了）。

**然后：**

```bash
git clone https://github.com/你的用户名/chat-app.git
```

```text
Username for 'https://github.com': 你的用户名
Password for 'https://你的用户名@github.com': 粘贴你的 token
```

**⚠️ 有三个坑：**

```text
① 粘贴时终端不显示（和输密码一样），别以为没粘上
② 在 Git Bash 里，Ctrl+V 可能不好使，用右键粘贴
③ 粘贴完直接回车，不要多按空格（空格会变成 token 的一部分）
```

**成功的话：**

```text
Cloning into 'chat-app'...
remote: Enumerating objects: 143, done.
remote: Counting objects: 100% (143/143), done.
remote: Compressing objects: 100% (98/98), done.
remote: Total 143 (delta 32), reused 130 (delta 26), pack-reused 0
Receiving objects: 100% (143/143), 45.21 KiB | 2.10 MiB/s, done.
Resolving deltas: 100% (32/32), done.
```

## 3.5 ⚠️ 不要把 token 写进 URL

**你会在网上看到这种写法：**

```bash
git clone https://ghp_xxxxxxxxxxxx@github.com/你的用户名/chat-app.git
```

**它能用。但它会把 token 明文存进 `.git/config`：**

```bash
cat .git/config
```

```text
[remote "origin"]
	url = https://ghp_xxxxxxxxxxxx@github.com/你的用户名/chat-app.git
```

**这意味着：**

```text
① 任何能读这个目录的人，都能看到你的 token
② 你哪天把这个目录打包发给别人，token 就跟着走了
③ token 有 repo 权限 = 能读写你所有私有仓库
```

**正确做法：**

```text
✅ clone 时手动输一次 token（不落盘）
✅ 或者用 SSH deploy key（下面说）
❌ 不要把 token 拼进 URL
```

## 3.6 更正规的做法：Deploy Key

**给服务器单独生成一对密钥，只读权限，只对这一个仓库有效。**

**思路（这节课不要求做，知道有这条路就行）：**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub
```

**把这行公钥贴到 GitHub 仓库 → Settings → Deploy keys → Add deploy key（不勾 "Allow write access"）。**

**然后在服务器上配 `~/.ssh/config`：**

```text
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_key
    IdentitiesOnly yes
```

**再用 SSH 地址 clone：**

```bash
git clone git@github.com:你的用户名/chat-app.git
```

**好处：**

```text
① 只对这一个仓库有效（token 是全账号）
② 只读（勾了 write 才能推）
③ 可以单独吊销
④ 不会过期（token 会）
```

**为什么这节课不强制：** 步骤多，容易在 SSH 配置上卡住。**你先把 PAT 走通，第 30 周的 CI 里用 Deploy Key 更合适。**

---

# 第 4 步：clone 到 `/srv/app`（15 分钟）

## 4.1 一个坑：目录不能非空

**如果你直接：**

```bash
cd /srv/app
git clone https://github.com/你的用户名/chat-app.git
```

**会得到：**

```text
Cloning into 'chat-app'...
```

**然后代码在 `/srv/app/chat-app/`，多了一层。**

**这不是错，但你的路径就变成 `/srv/app/chat-app`，后面所有命令都要多打一层。**

**两种解法：**

```text
解法 A：clone 到上一级，再改名
解法 B：在 /srv/app 里 clone，用 "." 表示"就放这儿"
```

**用 B。**

## 4.2 正确命令

```bash
cd /srv/app
git clone https://github.com/你的用户名/chat-app.git .
```

**注意最后那个 `.`（一个英文句点，前面有空格）。**

**它是什么意思：**

```text
"把这个仓库，clone 到当前目录"。
不加 . 就会在当前目录下新建一个 chat-app 子目录。
```

**⚠️ 当前目录必须是空的。**

**如果里面有东西：**

```text
fatal: destination path '.' already exists and is not an empty directory.
```

**怎么修：**

```bash
ls -la /srv/app
```

**看看里面是什么。如果只有 `.` 和 `..`，那是空目录，`git clone .` 应该能成功。**

**如果真有不想要的文件：**

```bash
rm -rf /srv/app/*
```

**⚠️ `rm -rf` 是这一周最危险的命令之一。** 执行前先 `pwd` 确认你在 `/srv/app`，并且 `ls -la` 确认里面没有你要的东西。

## 4.3 应该看到

```text
Cloning into '.'...
remote: Enumerating objects: 143, done.
remote: Counting objects: 100% (143/143), done.
remote: Compressing objects: 100% (98/98), done.
remote: Total 143 (delta 32), reused 130 (delta 26), pack-reused 0
Receiving objects: 100% (143/143), 45.21 KiB | 2.10 MiB/s, done.
Resolving deltas: 100% (32/32), done.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Cloning into '.'...` | 正在 clone 到当前目录 |
| `Enumerating objects: 143` | 服务器那边在数"这个仓库有多少个对象" |
| `Counting objects: 100%` | 数完了 |
| `Compressing objects` | 服务器在打包压缩 |
| `Total 143 (delta 32)` | 一共 143 个对象，其中 32 个是"差异" |
| `Receiving objects: 100%` | **你这边收完了** |
| `45.21 KiB` | **总共才 45KB**（对比 scp 的 400MB） |
| `Resolving deltas` | 在本地把差异还原成完整文件 |

**`delta` 是什么：** Git 不存完整副本，它存"和上一个版本的差异"。clone 时要把这些差异"展开"。

**45KB vs 400MB —— 这就是 `.gitignore` 的价值。**

## 4.4 看目录里有什么

```bash
ls -la
```

**应该看到：**

```text
total 96
drwxr-xr-x 6 root root  4096 Nov 16 11:02 .
drwxr-xr-x 3 root root  4096 Nov 16 10:56 ..
drwxr-xr-x 8 root root  4096 Nov 16 11:02 .git
-rw-r--r-- 1 root root    72 Nov 16 11:02 .env.example
-rw-r--r-- 1 root root   189 Nov 16 11:02 .gitignore
-rw-r--r-- 1 root root  1523 Nov 16 11:02 README.md
-rw-r--r-- 1 root root 24310 Nov 16 11:02 package-lock.json
-rw-r--r-- 1 root root   412 Nov 16 11:02 package.json
-rw-r--r-- 1 root root  6120 Nov 16 11:02 server.js
drwxr-xr-x 3 root root  4096 Nov 16 11:02 public
```

**逐项读：**

| 文件 | 是什么 | 你要注意什么 |
|---|---|---|
| `.git/` | 版本历史 | 别手动改 |
| `.env.example` | **模板**，列出需要哪些变量 | 有它就能照着建 `.env` |
| `.gitignore` | 哪些文件不进 git | **必须有 `node_modules` 和 `.env`** |
| `README.md` | 项目说明 | 可以看部署要求 |
| `package-lock.json` | **依赖的精确版本锁** | 有它才能 `npm ci` |
| `package.json` | 依赖清单 + scripts | 看 `"start"` 写的是什么 |
| `server.js` | 程序入口 | 一会儿要跑它 |
| `public/` | 静态文件 | 前端页面 |

**⚠️ 三个"没有"也很重要：**

```text
没有 node_modules/   ← 正常，要 npm ci 装
没有 .env            ← 正常，要手动建
没有 dist/ build/    ← 正常，需要构建的话自己跑
```

**如果你看到 `node_modules/` 在仓库里：**

```text
⚠️ 说明 .gitignore 写错了，而且已经提交过。
后果：仓库巨大、clone 慢、可能带上 Windows 的二进制。
这周先不改（能跑），但记在笔记里，以后清理。
```

## 4.5 确认你 clone 的是哪个版本

```bash
git log -1 --oneline
```

**应该看到：**

```text
a1b2c3d (HEAD -> main, origin/main, origin/HEAD) 第30节课：接上 CI 流水线
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `a1b2c3d` | 这次提交的短哈希 |
| `HEAD -> main` | 你现在在 main 分支的最新提交 |
| `origin/main` | 远程的 main 也在这里 |
| `第30节课：...` | 提交信息 |

**这一行以后天天用。**

```text
出问题时第一句话应该是："服务器上是哪个 commit？"
不是你猜的版本，是 git log -1 输出的那个。
```

## 4.6 看 `.gitignore`

```bash
cat .gitignore
```

**应该看到类似：**

```text
node_modules/
.env
.env.local
*.log
.DS_Store
dist/
```

**逐行读：**

| 行 | 挡住了什么 | 为什么 |
|---|---|---|
| `node_modules/` | 依赖目录 | 太大、平台相关、能重新装 |
| `.env` | 真实配置 | **里面有 key，绝不能进仓库** |
| `.env.local` | 本地覆盖配置 | 同上 |
| `*.log` | 日志 | 天天变，不该进版本 |
| `.DS_Store` | Mac 的目录缓存 | 垃圾文件 |
| `dist/` | 构建产物 | 能重新构建 |

**⚠️ `.env.example` 不在 `.gitignore` 里，这是对的。**

```text
.env.example    进仓库（只有键名，没有值）
.env            不进仓库（有真实的值）
```

**这个模式叫"配置模板"。** 新人 clone 下来，复制一份改名就能跑。

---

# 第 5 步：手动建 `.env`（20 分钟）

## 5.1 为什么必须手动

**因为 `.env` 永远不在 git 里。**

```text
这是安全的代价：
  代码可以公开，密钥不行。
  所以密钥永远不走 git，只在你和服务器之间手动同步。
```

**这意味着：**

```text
① 每换一台服务器，都要手动建一次
② 同事 clone 下来，也要手动建一次
③ 忘了建 → 程序起来就报错
```

**第 ① 条就是你今天要做的。**

## 5.2 先看模板要什么

```bash
cat .env.example
```

**应该看到：**

```text
# 服务端口
PORT=3000

# 模型 API
MODEL_API_KEY=your_key_here
MODEL_BASE_URL=https://api.example.com/v1
MODEL_NAME=your-model-name

# 数据库
DATABASE_URL=postgres://user:pass@host:5432/db
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `# 服务端口` | 注释，`#` 开头 |
| `PORT=3000` | 变量名=值，**中间不能有空格** |
| `MODEL_API_KEY=your_key_here` | 占位符，你要换成真 key |
| `DATABASE_URL=postgres://...` | 一整串 URL，里面有 `://` 也没关系 |

**模板里的值都是假的。** 你要填真的。

## 5.3 建文件

```bash
nano /srv/app/.env
```

**nano 的五个键，再背一遍：**

```text
Ctrl + O    保存（字母 O）
Enter       确认文件名
Ctrl + X    退出
Ctrl + W    搜索
Ctrl + K    删掉当前行
```

**在 nano 里输入（把值换成你自己的）：**

```text
PORT=3000
MODEL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
MODEL_BASE_URL=https://api.example.com/v1
MODEL_NAME=your-model-name
DATABASE_URL=postgres://user:pass@host:5432/db
```

**保存退出：**

```text
Ctrl + O
Enter
Ctrl + X
```

**⚠️ 粘贴 key 的时候注意：**

```text
① 终端粘贴可能有尾部空格 → 值变成 "sk-xxx "（后面带空格）
② 粘贴可能有换行 → 一行被拆成两行
③ 从网页复制可能带不可见字符
```

**保存后一定验证（第 5.5 节）。**

## 5.4 `.env` 的格式规则（这几条能省你两小时）

| 规则 | 对的 | 错的 | 后果 |
|---|---|---|---|
| 等号两边**不要空格** | `PORT=3000` | `PORT = 3000` | 变量名变成 `PORT `（带空格），读不到 |
| **不要加引号** | `KEY=abc123` | `KEY="abc123"` | 值变成 `"abc123"`（带引号） |
| 一行一个 | 两行分开写 | 用逗号连 | 只读到第一个 |
| `#` 开头是注释 | `# 这是注释` | 值里有 `#` 要小心 | `KEY=ab#cd` 可能被截断 |
| 不要有空行在中间？ | 空行没关系 | — | 无影响 |
| 文件末尾要有换行 | 有 | 没有 | 某些解析器会漏最后一行 |

**最常见的两个坑：**

**坑一：等号两边有空格**

```text
PORT = 3000
```

**读出来 `process.env.PORT` 是 `undefined`，程序用了默认值或崩了。**

**为什么：** dotenv 把 `PORT ` （带空格）当成变量名。**你在代码里读 `PORT`，永远读不到。**

**坑二：加了引号**

```text
MODEL_API_KEY="sk-abc123"
```

**读出来是 `"sk-abc123"`（含引号），发给模型 API 会报 401。**

**为什么：** dotenv 不会自动去掉引号（有些版本会，有些不会，**不要赌**）。

**规则：裸写，不加引号。**

**如果值里真的有空格怎么办：**

```text
✅ 加引号是允许的，但你要知道 dotenv 会保留引号
✅ 更稳的做法：值里不要有空格
```

## 5.5 验证格式

**先看文件内容（确认没粘多东西）：**

```bash
cat -A /srv/app/.env
```

**`cat -A` 是什么：** 把所有不可见字符显示出来。**行尾显示 `$`，Tab 显示 `^I`。**

**应该看到：**

```text
PORT=3000$
MODEL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx$
MODEL_BASE_URL=https://api.example.com/v1$
```

**⚠️ 如果看到：**

```text
PORT=3000 $
```

**`3000` 后面有个空格再 `$` —— 值里带空格了。** 回到 nano 删掉。

**⚠️ 如果看到 `^M$`：**

```text
这是 Windows 的换行符（CRLF）。
Linux 上一般能容忍，但某些解析器会把 \r 当成值的一部分。
```

**怎么修：**

```bash
sed -i 's/\r$//' /srv/app/.env
```

**再用 `cat -A` 确认没有 `^M` 了。**

## 5.6 设权限

```bash
chmod 600 /srv/app/.env
ls -l /srv/app/.env
```

**应该看到：**

```text
-rw------- 1 root root 218 Nov 16 11:15 /srv/app/.env
```

**`-rw-------` 是什么意思：**

```text
只有属主（root）能读写。
同组不能读，其他人不能读。
```

**为什么这么设：**

```text
① 服务器上可能有其他用户（以后加的）
② 备份脚本、日志采集程序会扫目录
③ 万一有漏洞能读文件，权限是第一道墙
```

## 5.7 验证 `.env` 真的不在 git 里

**这一步非常关键，做完再往下。**

```bash
cd /srv/app
git status --short
```

**应该看到：**

```text
（什么都没有）
```

**为什么"什么都没有"是对的：**

```text
.env 被 .gitignore 挡住了，git 根本不看它。
所以它不出现在 status 里 —— 这说明它不会被误提交。
```

**再确认一次（更强的方法）：**

```bash
git check-ignore -v .env
```

**应该看到：**

```text
.gitignore:2:.env	.env
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `.gitignore:2` | 是 `.gitignore` 的第 2 行挡住的 |
| `:.env` | 规则内容 |
| `\t.env` | 被挡住的文件 |

**如果这条命令没有输出：**

```text
⚠️ 说明 .env 没有被忽略！
立刻：
① 打开 .gitignore 加上 .env
② 确认 git status --short 里能看到它（说明能被提交，危险）
③ 这周先别 commit，记在笔记里
```

**⚠️ 还有一个更隐蔽的情况：**

```bash
git status --short
```

**如果输出了：**

```text
?? .env
```

**`??` 是"未跟踪"的意思 —— 说明 git 看见了它，只是还没 add。**

**这就是危险状态：哪天你 `git add .` 就进去了。**

**修：**

```bash
echo ".env" >> .gitignore
git status --short
```

**再看，应该没有了。**

---

# 第 6 步：`npm ci`（20 分钟）

## 6.1 `ci` 和 `install` 的区别

**这是本周最值得搞清楚的一对命令：**

| | `npm install` | `npm ci` |
|---|---|---|
| 读什么 | `package.json` | **`package-lock.json`** |
| 会不会改 lock 文件 | **会**（可能升级版本） | **不会**（一个字节都不改） |
| 会不会先删 `node_modules` | 不会（增量更新） | **会（全删重装）** |
| 速度 | 慢一点 | **快**（能并行、不用算依赖树） |
| 没有 lock 文件时 | 正常装 | **直接报错** |
| 适合场景 | 开发机、加新依赖 | **服务器、CI** |

**一句话：**

```text
开发的时候用 install（你可能要加包）
部署的时候用 ci（你只想"照 lock 文件装一模一样的东西"）
```

**为什么部署必须用 `ci`：**

```text
install 可能会"顺手升级"某个依赖的小版本。
结果：本地跑得好，服务器上装出来是另一个版本。
ci 保证：装的和你本地完全一致（精确到每个包的每个版本）。
```

**这是"可重复构建"的基础。** 第 30 周的 CI 里也是 `npm ci`。

## 6.2 跑

```bash
cd /srv/app
npm ci
```

**应该看到：**

```text
npm WARN deprecated inflight@1.0.6: This module is not supported, and leaks memory.
npm WARN deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
npm WARN deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported

added 132 packages, and audited 133 packages in 8s

12 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

**逐行读：**

| 行 | 意思 | 要不要管 |
|---|---|---|
| `npm WARN deprecated` | 某个包已经废弃 | 不用管，是依赖的依赖 |
| `added 132 packages` | 装了 132 个包 | 正常 |
| `audited 133 packages` | 检查了 133 个包的安全问题 | 正常 |
| `in 8s` | 用了 8 秒 | 有 swap 之后应该这么快 |
| `12 packages are looking for funding` | 作者在要赞助 | 忽略 |
| `found 0 vulnerabilities` | 没有已知漏洞 | **这条最重要** |

**如果 `found 3 vulnerabilities`：**

```text
先看是 low / moderate / high / critical。
critical 或 high 的话，`npm audit` 看详情。
这一周不处理（能跑优先），记进笔记，第 33 周安全那周处理。
```

## 6.3 如果只看到 `Killed`

**这正是第 213 节加 swap 要防的事。**

**如果你看到：**

```text
$ npm ci
npm WARN ...
Killed
```

**确认是内存问题：**

```bash
dmesg | tail -5
```

**应该看到：**

```text
[ 4521.123456] Out of memory: Killed process 7823 (node) total-vm:1983420kB, anon-rss:1756280kB
```

**三步处理：**

```bash
# 1. 确认 swap 开着
free -h

# 2. 没开就开
swapon /swapfile

# 3. 重试，顺便关掉审计（省一点内存和时间）
npm ci --no-audit --no-fund
```

**`--no-audit --no-fund` 是什么：**

```text
--no-audit  不跑安全检查（省内存、省时间）
--no-fund   不显示"求赞助"那一堆
```

**⚠️ 每次都用 `--no-audit` 的话，你就看不到漏洞了。** 建议：**装的时候加上，装完单独跑一次 `npm audit`。**

**如果 swap 开了还是被杀：**

```text
说明 2G 内存 + 2G swap 都不够（依赖太多）。
两个办法：
① 临时加更多 swap（4G）
② 在本地装好，把 node_modules 打包传上去（不推荐，平台可能不兼容）
```

## 6.4 验证装好了

```bash
ls node_modules | head -5
```

**应该看到：**

```text
accepts
array-flatten
body-parser
bytes
content-disposition
```

**数一下有多少个：**

```bash
ls node_modules | wc -l
```

**应该看到类似：**

```text
131
```

**看关键的那个在不在：**

```bash
ls node_modules/.bin/ | head
```

**应该看到：**

```text
nodemon
...
```

**`.bin/` 是什么：** 依赖里带的可执行命令。**`npm run` 就是从这里找命令的。**

## 6.5 看一眼 `package.json` 的 `start`

```bash
cat package.json
```

**应该看到：**

```json
{
  "name": "chat-app",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.18.2"
  }
}
```

**逐项读：**

| 项 | 意思 | 你要注意什么 |
|---|---|---|
| `main: server.js` | 入口文件 | 和 `start` 一致就行 |
| `"start": "node server.js"` | **启动命令** | 第 215 节 pm2 要用 |
| `"dev": "nodemon ..."` | 开发用，改代码自动重启 | **服务器上不要用 dev** |
| `dependencies` | 运行时依赖 | 必须有 `dotenv`（读 `.env` 靠它） |

**⚠️ 如果没有 `dotenv`：**

```text
那你的 .env 根本不会被读取。
程序会报 "MODEL_API_KEY is undefined"。
这不是 .env 写错了，是代码里没 require('dotenv').config()。
```

**确认一下：**

```bash
grep -n "dotenv" server.js | head -3
```

**应该看到：**

```text
1:require('dotenv').config()
```

**如果没有这一行，`nano server.js` 加上（放在最前面）。**

---

# 第 7 步：手动跑一次（15 分钟）

**⚠️ 这一步只是"验证代码在服务器上能跑"，不是"上线"。**

**跑完必须 `Ctrl+C` 停掉。** 正式常驻是第 215 节的事。

## 7.1 跑

```bash
cd /srv/app
node server.js
```

**应该看到：**

```text
[dotenv@16.4.5] injecting env (5) from .env
Server running at http://localhost:3000
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `injecting env (5) from .env` | **读到了 5 个变量** |
| `Server running at http://localhost:3000` | 在 3000 端口监听 |

**`(5)` 这个数字很重要。**

```text
你的 .env 里有几行有效变量，这里就应该是几。
如果是 (0)，说明 .env 没找到或格式不对。
如果是 (3)，而你写了 5 个，说明有 2 个格式错了（比如带了引号）。
```

## 7.2 在另一个窗口测

**不要关这个窗口。开一个新的 Git Bash，登进去：**

```bash
ssh myserver
```

**然后：**

```bash
curl -s http://127.0.0.1:3000/ | head -20
```

**应该看到 HTML：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Chat App</title>
...
```

**再测一个接口（如果有 `/api/health`）：**

```bash
curl -i http://127.0.0.1:3000/api/health
```

**应该看到：**

```text
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 15
ETag: W/"f-V8p2F3kL9mN"
Date: Mon, 16 Nov 2026 03:25:41 GMT
Connection: keep-alive

{"ok":true}
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `HTTP/1.1 200 OK` | 成功 |
| `X-Powered-By: Express` | **是 Express 在回答**（说明请求到了你的程序） |
| `Content-Type: application/json` | 返回 JSON |
| `{"ok":true}` | 正文 |

**这一步证明了一件事：**

```text
代码 + 依赖 + .env 三样都对，程序能处理请求。
```

**如果这里是 500：**

```bash
# 回到第一个窗口看报错
```

**那才是 `.env` 问题的暴露点。**

## 7.3 停掉

**回到第一个窗口，按：**

```text
Ctrl + C
```

**应该看到：**

```text
^C
root@VM-0-12-ubuntu:/srv/app#
```

**为什么必须停：**

```text
① 它占着 3000 端口，第 215 节 pm2 启动会报 EADDRINUSE
② 它会跟着你的 SSH 会话一起死（这正是下节课要解决的）
```

**确认端口空了：**

```bash
ss -lntp | grep 3000
```

**应该没有任何输出。**

**`ss -lntp` 是什么：**

```text
ss      查看网络连接（socket statistics）
-l      只看监听中的（listening）
-n      显示数字端口，不解析成服务名
-t      TCP
-p      显示是哪个进程
```

**这一条以后天天用。** 第 215 节判断"程序有没有在监听"就靠它。

## 7.4 一个必须现在就改的习惯

**打开 `server.js`，找 `app.listen`：**

```bash
grep -n "listen" server.js
```

**你可能会看到：**

```js
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000')
})
```

**⚠️ 这种写法会监听 `0.0.0.0`，也就是"所有网卡"，包括公网。**

**改成：**

```js
app.listen(3000, '127.0.0.1', () => {
  console.log('Server running at http://127.0.0.1:3000')
})
```

**为什么：**

```text
0.0.0.0      → 监听所有网卡。如果安全组不小心开了 3000，外面就能直连
127.0.0.1    → 只听本机回环。外面怎么都连不上，只能通过 Nginx 转发
```

**这是"纵深防御"：**

```text
就算你哪天手滑在安全组开了 3000，
因为程序只听 127.0.0.1，外面还是进不来。
```

**⚠️ 改完记得在本地提交并 push，服务器上 `git pull`。别在服务器上直接改代码。**

---

# 第 8 步：故意犯七个错（30 分钟）

## 错误 1：clone 到非空目录

**操作：**

```bash
cd /srv/app
touch 一个测试文件.txt
git clone https://github.com/你的用户名/chat-app.git .
```

**会怎样：**

```text
fatal: destination path '.' already exists and is not an empty directory.
```

**为什么：**

```text
git clone 不覆盖任何东西。
它宁可拒绝，也不冒险删你的文件。
```

**怎么修：**

```bash
ls -la /srv/app
rm 一个测试文件.txt
git clone https://github.com/你的用户名/chat-app.git .
```

**⚠️ 如果里面真有一堆文件，不要 `rm -rf *`。先看清楚是什么。**

## 错误 2：`.env` 的等号两边加了空格

**操作：**

```text
PORT = 3000
MODEL_API_KEY = sk-abc123
```

**会怎样：**

**程序启动看起来正常：**

```text
Server running at http://localhost:3000
```

**但一请求接口就 500：**

```text
Error: MODEL_API_KEY is not defined
```

**或者（更隐蔽）：**

```text
401 Unauthorized: invalid api key
```

**为什么：**

```text
dotenv 把 "PORT " 当成变量名（带空格）。
你代码里读的是 process.env.PORT，读不到。
于是走了默认值或者 undefined。
```

**看它到底读到了什么：**

```bash
node -e "require('dotenv').config(); console.log(JSON.stringify(process.env.PORT)); console.log(JSON.stringify(process.env.MODEL_API_KEY))"
```

**会输出：**

```text
undefined
undefined
```

**怎么修：**

```bash
nano /srv/app/.env
```

**改成：**

```text
PORT=3000
MODEL_API_KEY=sk-abc123
```

**再验证：**

```bash
node -e "require('dotenv').config(); console.log(process.env.PORT)"
```

```text
3000
```

## 错误 3：`.env` 的值加了引号

**操作：**

```text
MODEL_API_KEY="sk-abc123"
```

**会怎样：**

**`console.log` 一看就明白：**

```bash
node -e "require('dotenv').config(); console.log(JSON.stringify(process.env.MODEL_API_KEY))"
```

```text
"\"sk-abc123\""
```

**注意那个 `\"` —— 值里真的带引号。**

**然后请求模型 API：**

```text
401 {"error":{"message":"Incorrect API key provided: \"sk-abc***123\". ..."}}
```

**逐段读报错：**

| 部分 | 意思 |
|---|---|
| `401` | 认证失败 |
| `Incorrect API key provided` | key 不对 |
| `\"sk-abc***123\"` | **它看到的 key 带着引号** |

**为什么：**

```text
dotenv 对引号的处理：有些版本会去掉，有些会保留。
不同版本行为不一样 —— 所以最稳的做法是"不加引号"。
```

**怎么修：**

```bash
nano /srv/app/.env
```

**删掉引号。**

## 错误 4：忘了建 `.env`

**操作：**

```bash
cd /srv/app
mv .env .env.bak
node server.js
```

**会怎样：**

```text
Server running at http://localhost:3000
```

**启动成功，但：**

```bash
curl -i http://127.0.0.1:3000/api/health
```

```text
HTTP/1.1 500 Internal Server Error
...

Error: getaddrinfo ENOTFOUND undefined
    at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:71:26)
```

**为什么：**

```text
没 .env → 没有 MODEL_BASE_URL → 代码里是 undefined
fetch('undefined/v1/chat') → DNS 解析失败
```

**为什么这个错最难查：**

```text
① 程序启动是"成功"的（因为没有启动时校验）
② 报错在 DNS 层，看起来像"网络问题"
③ 你会在代码里找，而问题在文件系统里
```

**怎么修：**

```bash
mv .env.bak .env
ls -la .env
```

**然后做个长期改进（可选）：**

**在 `server.js` 最前面加一段启动校验：**

```js
const required = ['MODEL_API_KEY', 'MODEL_BASE_URL']
for (const k of required) {
  if (!process.env[k]) {
    console.error(`缺少环境变量: ${k}`)
    process.exit(1)
  }
}
```

**好处：**

```text
缺变量时，程序直接启动失败，并在日志里写清缺哪个。
比"起来了但每个请求 500"好查一百倍。
```

**这是"快速失败"原则。**

## 错误 5：用 `npm install` 而不是 `npm ci`

**操作：**

```bash
rm -rf node_modules
npm install
```

**会怎样：**

```text
added 134 packages, and audited 135 packages in 12s
```

**注意：132 → 134。**

**为什么多了两个：**

```text
npm install 会按 package.json 里的 ^ 范围，装"最新的兼容版本"。
package.json 写 express: ^4.18.2，实际可能装 4.19.2。
lock 文件也被改了。
```

**后果：**

```bash
git status --short
```

```text
 M package-lock.json
```

**你的 lock 文件被改了。**

**这意味着：**

```text
① 服务器上的依赖和本地不一致了
② 如果有人 git pull 这个改动，所有人的版本都变了
③ 出了问题你无法复现（因为"上次是哪个版本"说不清）
```

**怎么修：**

```bash
git checkout -- package-lock.json
rm -rf node_modules
npm ci
```

**规则：**

```text
服务器上永远 `npm ci`。
`npm install` 只在你的开发机上用。
```

## 错误 6：把 `.env` 提交了

**操作：**

**⚠️ 别真做，看完这段。**

```bash
cd /srv/app
echo ".env" >> .gitignore   # 假装忘了这步
git add .
git commit -m "部署"
git push
```

**会怎样：**

```bash
git status --short
```

**提交前你会看到：**

```text
A  .env
```

**`A` 是"已加入暂存区"。**

**push 之后：**

```text
Enumerating objects: 5, done.
...
To https://github.com/你的用户名/chat-app.git
   a1b2c3d..f4e5d6c  main -> main
```

**看起来一切正常。**

**但实际上：**

```text
① 你的 API key 现在在 GitHub 上
② 如果仓库是 public，全世界都能看到（爬虫几分钟内就会抓到）
③ 如果是 private，所有有权限的人都能看到
④ 即使你下一秒删掉，历史里还在
```

**怎么确认有没有发生：**

```bash
git log --all --oneline -- .env
```

**有任何输出 = 发生过。**

**怎么修（三步，顺序不能错）：**

```text
第一步：吊销 key（去模型平台删掉这个 key，重新发一个）
第二步：把新 key 写进服务器和本地的 .env
第三步：从 git 里移除（但历史还在，所以第一步必须做）
```

```bash
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "移除误提交的 .env"
git push
```

**⚠️ 第三步只是"以后不再跟踪"，不会清除历史。**

**清除历史要 `git filter-repo`，会让所有人的仓库都要重新 clone —— 你一个人做项目时可以做，但要小心。**

**判断标准：**

```text
key 已经泄露了 → 吊销是第一优先级，清理历史是第二优先级。
不要为了"清历史"拖一天不吊销。
```

## 错误 7：`.env` 权限 644

**操作：**

```bash
chmod 644 /srv/app/.env
ls -l /srv/app/.env
```

**会怎样：**

```text
-rw-r--r-- 1 root root 218 Nov 16 11:40 /srv/app/.env
```

**程序照样能跑。什么都不会报错。**

**为什么这仍然是错：**

```text
644 = 所有人可读。
服务器上如果有第二个用户（以后加运维、加部署用户），
他 cat 一下就能看到你的 key。
```

**而且：**

```text
如果哪天你的程序有"任意文件读取"漏洞，
攻击者能读的第一个文件就是 .env。
权限是最后一道墙。
```

**怎么修：**

```bash
chmod 600 /srv/app/.env
ls -l /srv/app/.env
```

```text
-rw------- 1 root root 218 Nov 16 11:40 /srv/app/.env
```

**记住：**

```text
私钥 600，.env 600，.ssh 目录 700。
```

---

# 第 9 步：写学习笔记（10 分钟）

```markdown
# 第 214 节课学习笔记

## 一、三种传代码的方式

| | zip+scp | FileZilla | git clone |
|---|---|---|---|
| 以后怎么更新 | | | |
| 会不会传 node_modules | | | |
| 能不能回滚 | | | |

## 二、为什么放 `/srv/app`

我的部署路径：

`ls -ld /srv/app` 的输出：

## 三、clone

我用的命令：

最后那个 `.` 是什么意思：

`git log -1 --oneline` 的输出：

## 四、目录里有什么、没什么

| 有 | 没有 |
|---|---|
| | |
| | |

`.gitignore` 里挡了哪些：

## 五、`.env`

为什么它不在 git 里：

我建的命令：

我的 `.env` 有几行（不写值）：

`cat -A` 看到了什么（有没有 `$`、`^M`、空格）：

三条格式规则：

1.
2.
3.

权限是多少：

`git check-ignore -v .env` 的输出：

## 六、`npm ci` 和 `npm install`

| | install | ci |
|---|---|---|
| 读什么 | | |
| 改不改 lock | | |
| 删不删 node_modules | | |

我的 `npm ci` 输出（`added ... packages` 那一行）：

有没有看到 `Killed`：

## 七、手动跑一次

`node server.js` 的输出：

`injecting env (n)` 里的 n 是几？和我的 `.env` 行数对得上吗：

`curl -i` 的状态码：

为什么要改 `app.listen(3000, '127.0.0.1')`：

## 八、七个错误的后果

| 错误 | 现象 | 怎么修 |
|---|---|---|
| clone 到非空目录 | | |
| 等号两边空格 | | |
| 值加引号 | | |
| 忘了建 .env | | |
| 用 npm install | | |
| 提交 .env | | |
| 权限 644 | | |

## 九、卡在哪

## 十、我还不懂的词

-

## 十二、完成检查

- [ ] `/srv/app` 里有完整代码，没有 `node_modules` 的历史
- [ ] `.env` 是我手动建的，600 权限，`git status` 看不到
- [ ] `git check-ignore -v .env` 有输出
- [ ] `npm ci` 装完了，`node_modules` 数量正常
- [ ] `node server.js` 能起，`curl` 返回 200
- [ ] 跑完已经 `Ctrl+C` 停掉，`ss -lntp | grep 3000` 没输出
```

---

# 第 10 步：课后练习

## 练习一：算一次传输量

**要求：**

1. 在本地看 `node_modules` 有多大：`du -sh node_modules`；
2. 看仓库 clone 下来多大：`du -sh .git`；
3. 算倍数。

**记录：** 两个数字。

**思考题：** 如果每次部署都传 `node_modules`，一天部署 5 次，一个月多传多少流量？

## 练习二：用 `.env.example` 重建一次

**要求：**

1. 把服务器的 `.env` 改名；
2. 照着 `.env.example` 重新建一份；
3. 启动，看 `injecting env (n)` 是几；
4. 对比两份有没有差异。

**记录：** 你漏了哪个变量？

**思考题：** 为什么模板里要有 `.env.example`，而不是让新人自己猜？

## 练习三：验证 `.env` 真的没有进 git

**要求：**

1. `git check-ignore -v .env`；
2. `git log --all --oneline -- .env`；
3. `git ls-files | grep env`。

**记录：** 三条命令的输出分别是什么？

**思考题：** 第二条有输出意味着什么？你该怎么办？

## 练习四：故意把 `.env` 写坏三次

**要求：**

分别制造这三种错误，每种都记录报错，然后修好：

```text
① 等号两边加空格
② 值加引号
③ 删掉一整行（比如 MODEL_NAME）
```

**记录：** 三种错误的表现一样吗？

**思考题：** 哪种错误最难查？为什么？

## 练习五：给 `server.js` 加启动校验

**要求：**

1. 按第 8 步错误 4 的代码，加一段"缺变量就退出"；
2. 故意删掉 `.env` 里一行；
3. 看启动是否立刻失败，日志是否说清缺什么。

**记录：** 输出的原文。

**思考题：** 为什么"启动就失败"比"起来了但每个请求 500"更好？

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清为什么部署用 `git clone` 不用 scp
- [ ] 我知道 `node_modules` 为什么不能传
- [ ] 我知道 `.env` 为什么永远不进 git
- [ ] 我知道 `npm ci` 和 `npm install` 的四个区别
- [ ] 我知道为什么 `app.listen` 要绑 `127.0.0.1`

## B. 实操

- [ ] 代码在 `/srv/app`（不是 `/srv/app/chat-app`）
- [ ] `git log -1 --oneline` 能看到版本
- [ ] `.env` 手动建好，600 权限
- [ ] `git check-ignore -v .env` 有输出
- [ ] `npm ci` 成功，`node_modules` 里包数量正常
- [ ] `node server.js` 能起，`curl` 拿到 200
- [ ] 停掉之后 `ss -lntp | grep 3000` 没输出

## C. 排错

- [ ] 我知道 `injecting env (0)` 是什么意思
- [ ] 我知道 `Killed` 要去 `dmesg` 找
- [ ] 我知道 `401` 可能是 `.env` 值带了引号
- [ ] 我知道 `A .env` 出现在 `git status` 里有多危险
- [ ] 我知道 `git rm --cached` 和 `rm` 的区别

## D. 交付

- [ ] `03-练习代码/上传记录.md`
- [ ] `02-笔记/NOTES.md` 填完
- [ ] 服务器上代码、`.env`、依赖三样齐全

## E. 笔记

- [ ] 记录了真实的 `npm ci` 输出
- [ ] 记录了 `injecting env (n)` 的数字
- [ ] 「卡在哪」写了真实内容

## 本节课要能说出口的一句话

> **部署不是搬文件，是让服务器 checkout 到某个版本；`node_modules` 是算出来的所以不传，`.env` 是秘密所以手抄 —— 三样（代码、配置、依赖）缺一样，程序起来了也是 500。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `destination path '.' already exists and is not an empty directory` | `/srv/app` 非空 | 清空后重试 |
| `Authentication failed` on clone | 用了登录密码 | 改用 PAT |
| `Support for password authentication was removed` | GitHub 政策 | 同上 |
| `Permission denied (publickey)` on git clone | SSH 方式但没配 key | 改用 HTTPS，或配 deploy key |
| `injecting env (0)` | `.env` 没找到 | 确认路径是 `/srv/app/.env` |
| `injecting env (3)` 但写了 5 行 | 有 2 行格式错 | `cat -A` 看空格和引号 |
| 接口 500，`ENOTFOUND undefined` | 缺 `MODEL_BASE_URL` | 补 `.env` |
| 接口 401 | key 错 / 带引号 | `JSON.stringify(process.env.KEY)` 看真实值 |
| `npm ci` 报 `can only install with an existing package-lock.json` | 仓库里没有 lock | 本地跑一次 `npm install` 生成并提交 |
| `npm ci` 只输出 `Killed` | 内存不够 | 开 swap，`--no-audit --no-fund` |
| `EADDRINUSE: address already in use :::3000` | 有个 node 还在跑 | `ss -lntp \| grep 3000` 找到 PID，`kill` |
| `git status` 里出现 `?? .env` | `.gitignore` 没配 | `echo ".env" >> .gitignore` |
| `git status` 里出现 `A .env` | 已经 add 了 | `git rm --cached .env`，**并吊销 key** |
| `package-lock.json` 被改动 | 用了 `npm install` | `git checkout -- package-lock.json`，改回 `npm ci` |
| `Cannot find module 'express'` | 依赖没装 / 装到别处 | `cd /srv/app && npm ci` |
| `Invalid ELF header` | 传了 Windows 的 `node_modules` | 删掉重装 |
