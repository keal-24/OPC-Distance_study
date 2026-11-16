# 第 208 节课：自动部署——push 就上线

> 第 207 节课镜像已经在仓库里了，但把它拉到服务器上、重启容器，还是你手动做的。
> 这节课把最后那一段也交出去：**CI 拿到镜像之后，自己 SSH 上去，自己拉，自己重启。**

**建议用时**：130 分钟
**你需要先完成**：第 207 节课（GHCR 上有 `sha-xxxxxxx` tag）、第 212 节课之前用一台**可以 SSH 登录的 Linux 机器**（真服务器、虚拟机、或局域网里另一台电脑都行）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

**你的上线流程还剩最后三步是手动的：**

```bash
ssh root@47.98.xx.xx
cd /srv/app
docker compose pull && docker compose up -d
```

**三条命令，二十秒。看起来不值得自动化。**

## 0.2 你以后会遇到什么

```text
① 你在客户现场，用手机热点，想紧急修一个错字 —— 手机上没有 SSH 客户端
② 你晚上十一点改完，懒得登服务器，"明天再部署吧"，结果忘了三天
③ 你部署到一半，SSH 断了，容器处于半启动状态，网站 502，你在高铁上
④ 你手动敲命令时手滑，把 up -d 敲成 down，网站直接没了
⑤ 你部署完之后，不确定"到底部署成功没有"，只能刷新浏览器猜
```

**这五个场景，靠"二十秒的手动操作"全都解决不了。**

**因为它们的问题不是"慢"，是"必须你人在、且你手不抖"。**

## 0.3 今天要建立的三个概念

```text
① 部署密钥（deploy key）：一把"只能用来部署"的 SSH 私钥，不是你的登录密码
② known_hosts：一张"我认识哪些服务器"的名单，用来防冒充
③ 幂等（idempotent）：同一个脚本跑一遍和跑三遍，结果一样
```

**第三个是今天最容易被忽略、但最重要的。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `deploy_key` / `deploy_key.pub` | 你本地一个**安全的地方** | 给 CI 用的密钥对 |
| `/srv/app/docker-compose.yml` | 服务器上 | 只描述"怎么跑这个镜像" |
| `/srv/app/deploy.sh` | 服务器上 | 幂等的部署脚本 |
| `deploy` job | `ci-lab/.github/workflows/build.yml` | SSH 上去执行脚本 |

**验收标准：你只 push，不碰服务器，网站变成新的。**

---

# 第 1 步：先把服务器上的东西准备好（25 分钟）

## 1.1 为什么先准备服务器

**因为 CI 只是"替你去敲命令"。**

**如果那些命令本身有问题，自动化只会让问题发生得更快、更频繁。**

**所以顺序是：先手动把"一次成功的部署"跑通，再把它包进 CI。**

**⚠️ 这一节所有命令都在服务器上执行。** 用 SSH 登上去：

```bash
ssh root@47.98.xx.xx
```

**（把 IP 换成你自己的。）**

**在 Windows 上一样能用这条命令。** `ssh` 是 OpenSSH 客户端，Windows 10 之后自带。

## 1.2 建目录

```bash
sudo mkdir -p /srv/app
cd /srv/app
pwd
```

**应该看到：**

```text
/srv/app
```

**`/srv` 是什么：** Linux 的惯例目录，放"这个服务器对外提供的服务"。**这不是强制的，但是个好习惯。**

**为什么不用 `/root/app`：**

```text
/root 只有 root 能进
你以后要建一个 deploy 用户，它进不去 /root
/srv 是公用的，权限好安排
```

## 1.3 建 `docker-compose.yml`

**在服务器上编辑（用 `nano`）：**

```bash
nano /srv/app/docker-compose.yml
```

**粘进去：**

```yaml
services:
  app:
    image: ${APP_IMAGE}
    container_name: ci-lab-app
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - .env
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `image: ${APP_IMAGE}` | 镜像地址从环境变量读，**不写死** |
| `container_name: ci-lab-app` | 固定容器名，方便 `docker logs ci-lab-app` |
| `restart: unless-stopped` | 容器挂了自动重启；你手动 stop 的不重启 |
| `"127.0.0.1:3000:3000"` | **只绑本机回环地址** |
| `env_file: .env` | 从 `.env` 读环境变量 |
| `logging` | 限制日志大小，防止磁盘被写满 |

**`127.0.0.1:3000:3000` 这一条要讲清楚：**

```text
左边是"宿主机上监听哪个地址:端口"
右边是"容器里的端口"

写 127.0.0.1:3000 → 只有服务器本机能访问 3000
写 3000         → 所有网卡都监听，公网也能访问（如果安全组开了）

第 31 周会配 Nginx，Nginx 在 80 端口收请求，转发到本机 3000
所以 3000 不需要、也不应该暴露到公网
```

**⚠️ 如果你现在就写 `"3000:3000"` 并在安全组开了 3000，等于把你的应用直接暴露给全网。** 第 31 周讲完 Nginx 之后再改。

**`${APP_IMAGE}` 是从哪来的：**

```text
docker compose 会读当前目录的 .env 文件
.env 里写 APP_IMAGE=ghcr.io/owner/ci-lab:sha-3f7a1c2
```

**注意：`.env` 有两重身份：**

```text
① 给 docker compose 用的变量替换（APP_IMAGE）
② 通过 env_file 注入到容器里（你的业务密钥）
```

**同一个文件，两种用途。** 这在 compose 里是常见做法，但要知道这个双重身份。

## 1.4 建 `.env`

```bash
nano /srv/app/.env
```

**内容（这些是你的真实密钥，不是示例）：**

```text
APP_IMAGE=ghcr.io/yourname/ci-lab:sha-0000000
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/app
MODEL_API_KEY=sk-你的真实密钥
```

**⚠️ 这个文件绝对不能进 Git。**

**验证它在 `.gitignore` 里（在本地仓库）：**

```bash
grep -n "^\.env$" .gitignore
```

**应该有输出。没有就加上。**

**为什么服务器上要手动建：**

```text
因为 .env 不在 Git 里（这是对的）
所以 CI 拉代码时拿不到它
服务器上必须有一份
```

**这就是"安全"的代价：**

```text
你保护了密钥不进仓库
代价是每台新服务器都要手动配一次
```

**第 234 节课（离线部署）会把这一条做成"安装清单"的一项。**

**权限收一下：**

```bash
chmod 600 /srv/app/.env
ls -l /srv/app/.env
```

**应该看到：**

```text
-rw------- 1 root root 142 Nov 16 11:02 /srv/app/.env
```

**`600` 是什么：** 只有属主能读写，其他人什么都看不到。

## 1.5 建 `deploy.sh`

**这是今天的核心文件。**

```bash
nano /srv/app/deploy.sh
```

**粘进去：**

```bash
#!/usr/bin/env bash
set -euo pipefail

NEW_SHA="${1:?用法: deploy.sh <短sha>}"

APP_DIR=/srv/app
IMAGE_PREFIX="ghcr.io/yourname/ci-lab"

cd "$APP_DIR"

echo "=== 部署开始 ==="
echo "目标 tag: sha-${NEW_SHA}"

if [ ! -f .env ]; then
  echo "错误：找不到 $APP_DIR/.env"
  exit 1
fi

if ! grep -q "^APP_IMAGE=" .env; then
  echo "APP_IMAGE=ghcr.io/yourname/ci-lab:sha-${NEW_SHA}" >> .env
fi

sed -i "s|^APP_IMAGE=.*|APP_IMAGE=${IMAGE_PREFIX}:sha-${NEW_SHA}|" .env

grep "^APP_IMAGE=" .env

docker compose pull app

docker compose up -d --no-deps app

echo "=== 等待容器启动 ==="
sleep 3

docker compose ps app

echo "=== 最近日志 ==="
docker compose logs --tail=20 app

echo "=== 部署结束 ==="
```

**逐行读（这一节最重要）：**

| 行 | 意思 |
|---|---|
| `#!/usr/bin/env bash` | 用 bash 执行（不是 sh） |
| `set -euo pipefail` | **三条保护，下面单独讲** |
| `NEW_SHA="${1:?...}"` | 取第一个参数，没给就报错退出 |
| `cd "$APP_DIR"` | 切到应用目录，**后面所有命令都在这里** |
| `if [ ! -f .env ]` | `.env` 不存在就退出 |
| `grep -q "^APP_IMAGE=" .env` | 静默检查 `.env` 里有没有这一行 |
| `sed -i "s\|^APP_IMAGE=.*\|...\|"` | 把那一行替换成新版本 |
| `docker compose pull app` | 拉新镜像 |
| `docker compose up -d --no-deps app` | **只重建 app 这一个服务** |
| `sleep 3` | 给容器 3 秒启动 |
| `docker compose ps app` | 看状态 |
| `docker compose logs --tail=20 app` | 看最后 20 行日志 |

**`set -euo pipefail` 逐字读：**

| 部分 | 意思 |
|---|---|
| `-e` | 任何一条命令失败就退出（不继续往下走） |
| `-u` | 用了未定义的变量就退出（防手滑写错变量名） |
| `-o pipefail` | 管道里任何一条失败就整体失败（第 205 节课讲过） |

**没有 `-e` 会怎样：**

```text
docker compose pull 失败了
脚本继续执行 up -d
up -d 用的是旧镜像 → 成功
脚本以 0 退出 → CI 显示绿
→ 你以为部署了，其实没变
```

**这是部署脚本里最危险的一种失败：** 明明失败了，但报告成功。

**`--no-deps` 是什么：**

```text
只重建 app 这个服务，不动它依赖的服务（比如数据库）
不加的话，compose 会把所有依赖也一起检查/重建
```

**你现在只有一个服务，加不加一样。** 但第 202 节课那种"app + postgres"的 compose 里，不加会把数据库也重启一遍。

**`sed -i` 的坑：**

```bash
sed -i "s|^APP_IMAGE=.*|APP_IMAGE=xxx|" .env
```

**为什么用 `|` 而不是 `/` 当分隔符：**

```text
镜像地址里有斜杠 ghcr.io/owner/ci-lab
用 / 当分隔符要转义每一处，很容易写错
换一个不冲突的字符（| 或 #）就不用转义
```

**`sed -i` 在 macOS 上的写法不同（要 `sed -i ''`）。** **但在 Linux 服务器上就是 `-i`。** 你现在不用管 macOS。

**给执行权限：**

```bash
chmod +x /srv/app/deploy.sh
ls -l /srv/app/deploy.sh
```

**应该看到：**

```text
-rwxr-xr-x 1 root root 812 Nov 16 11:10 /srv/app/deploy.sh
```

**`x` 就是"可执行"。** 没有 `x` 直接跑会报：

```text
bash: /srv/app/deploy.sh: Permission denied
```

## 1.6 手动跑一次

**先确认 ghcr 能拉。** 如果镜像是私有的：

```bash
echo "你的token" | docker login ghcr.io -u 你的用户名 --password-stdin
```

**然后跑：**

```bash
/srv/app/deploy.sh 3f7a1c2
```

**应该看到：**

```text
=== 部署开始 ===
目标 tag: sha-3f7a1c2
APP_IMAGE=ghcr.io/yourname/ci-lab:sha-3f7a1c2
sha-3f7a1c2: Pulling from yourname/ci-lab
...
Status: Downloaded newer image for ghcr.io/yourname/ci-lab:sha-3f7a1c2
[+] Running 1/1
 ✔ Container ci-lab-app  Started
=== 等待容器启动 ===
NAME          IMAGE                                              STATUS         PORTS
ci-lab-app    ghcr.io/yourname/ci-lab:sha-3f7a1c2               Up 3 seconds   127.0.0.1:3000->3000/tcp
=== 最近日志 ===
ci-lab-app  | listening on 3000
=== 部署结束 ===
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Status: Downloaded newer image` | 拉到了新镜像（第二次跑会显示 `Image is up to date`） |
| `✔ Container ci-lab-app Started` | 容器起来了（如果是重建，会显示 `Recreated`） |
| `Up 3 seconds` | 运行了 3 秒 |
| `127.0.0.1:3000->3000/tcp` | 端口映射，只绑回环 |
| `listening on 3000` | 你程序自己打的日志 |

**验证健康检查：**

```bash
curl -fsS http://127.0.0.1:3000/health
```

**应该看到：**

```text
{"ok":true,"uptime":5.12}
```

**`-f` 是什么：** fail，HTTP 状态码 >= 400 时返回退出码 22。

**`-sS` 是什么：**

```text
-s  静默（不显示进度条）
-S  但还是显示错误
```

**为什么这两个参数一起用：** 只要 `-s`，出错时什么都没有；加 `-S`，出错时会打印原因。

**这一条以后写"冒烟检查"时天天用。**

## 1.7 幂等性测试（重要）

**幂等的定义：同一个脚本连跑三遍，结果和跑一遍一样。**

**跑第二遍：**

```bash
/srv/app/deploy.sh 3f7a1c2
```

**应该看到：**

```text
Status: Image is up to date for ghcr.io/yourname/ci-lab:sha-3f7a1c2
[+] Running 1/1
 ✔ Container ci-lab-app  Started
```

**注意 `Image is up to date` —— 它没重新下载。**

**`up -d` 的行为：**

```text
如果镜像没变、配置没变 → 不重建容器（Started 而不是 Recreated）
如果镜像变了 → 重建容器
```

**这就是"幂等"的基础：`docker compose up -d` 本身就是幂等的。**

**跑第三遍，换成同一个 tag：结果一样。**

**现在换一个 tag（如果仓库里有别的）：**

```bash
/srv/app/deploy.sh a1b2c3d
```

**应该看到：**

```text
Status: Downloaded newer image
[+] Running 1/1
 ✔ Container ci-lab-app  Recreated
```

**`Recreated` 说明容器被重建了。** 这是对的 —— 镜像变了。

**为什么幂等这么重要：**

```text
① CI 可能重跑（你点了 Re-run）
② 部署可能中途断（网络问题）
③ 你可能手动跑一次"确认一下"

三种情况下，脚本都必须"再跑一遍不会更糟"
```

**一个不幂等的部署脚本长什么样：**

```bash
# ❌ 反面例子
git clone https://github.com/xxx/ci-lab.git /srv/app2   # 第二次跑：目录已存在，失败
git pull                                                  # 有本地改动时：冲突
docker run -d --name app ...                              # 第二次跑：名字已占用，失败
```

**三条都不幂等。** 第二次跑全挂。

---

# 第 2 步：给 CI 一把"只能部署"的钥匙（25 分钟）

## 2.1 为什么不用你自己的 SSH key

**三个理由：**

```text
① 你的私钥在你电脑上，复制到 GitHub Secrets 就多了一份副本
② 你的私钥通常能登所有服务器，泄露了全挂
③ 你换电脑、换密码、加 passphrase，CI 就断了
```

**所以要单独生成一把，只用来部署。**

**为什么叫"deploy key"：**

```text
它不是"你的身份"，是"这台 CI 机器的身份"
它可以被单独吊销、单独限制命令
```

## 2.2 生成密钥对

**在你本地（不是服务器上）执行。**

```bash
cd ~/.ssh
ssh-keygen -t ed25519 -C "ci-deploy-ci-lab" -f ./ci-lab-deploy -N ""
```

**逐段读：**

| 参数 | 意思 |
|---|---|
| `-t ed25519` | 密钥类型。ed25519 比 rsa 短、快、同样安全 |
| `-C "ci-deploy-ci-lab"` | 注释，会写在公钥末尾，方便你以后认出它 |
| `-f ./ci-lab-deploy` | 生成的文件名 |
| `-N ""` | 空 passphrase（**CI 里没法交互输入密码**） |

**⚠️ `-N ""` 意味着这把私钥没有密码保护。**

```text
任何拿到这个文件的人都能用它登录你的服务器
所以它必须只存在于 GitHub Secrets 里
```

**应该看到：**

```text
Generating public/private ed25519 key pair.
Your identification has been saved in ./ci-lab-deploy
Your public key has been saved in ./ci-lab-deploy.pub
The key fingerprint is:
SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx ci-deploy-ci-lab
The key's randomart image is:
+--[ED25519 256]--+
|                 |
...
+----[SHA256]-----+
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `identification ... ./ci-lab-deploy` | **私钥**（严格保密） |
| `public key ... ./ci-lab-deploy.pub` | **公钥**（可以随便给） |
| `SHA256:xxx...` | 指纹，用来核对"是不是同一把钥匙" |

**两个文件：**

```text
ci-lab-deploy       ← 私钥，给 GitHub Secrets
ci-lab-deploy.pub   ← 公钥，加到服务器
```

**⚠️ 绝对不要做的事：**

```text
❌ 把私钥 commit 进仓库
❌ 把私钥贴到聊天工具里
❌ 把私钥放在桌面
```

**`.pub` 可以随便传。** 公钥泄露不会导致任何安全问题（它本来就是公开的）。

## 2.3 把公钥加到服务器

**先看公钥内容：**

```bash
cat ~/.ssh/ci-lab-deploy.pub
```

**应该看到一行：**

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... ci-deploy-ci-lab
```

**复制整行。**

**然后在服务器上：**

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... ci-deploy-ci-lab" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**逐行读：**

| 命令 | 为什么 |
|---|---|
| `mkdir -p ~/.ssh` | 目录不存在就建（`-p` 不报错） |
| `chmod 700 ~/.ssh` | 只有属主能进 |
| `>> ~/.ssh/authorized_keys` | **追加**，不是覆盖（`>` 会清空别人的 key） |
| `chmod 600` | 只有属主能读写 |

**⚠️ `>>` 和 `>` 的区别，这一条很重要：**

```text
>>  追加，保留原有内容
>   覆盖，清空

authorized_keys 里可能已经有你自己的 key
用 > 会把你自己的访问权限删掉（如果这次 SSH 断了，你就进不去了）
```

**权限不对会怎样（这是第 2 个错误的伏笔）：**

```text
ssh 会拒绝使用权限过宽的 authorized_keys
报 "Authentication refused: bad ownership or modes for file"
```

**验证：**

```bash
tail -2 ~/.ssh/authorized_keys
ls -la ~/.ssh
```

**应该看到：**

```text
ssh-rsa AAAA... 你的电脑
ssh-ed25519 AAAAC3... ci-deploy-ci-lab
```

**两条都在。** 第一条是你自己的，第二条是给 CI 的。

## 2.4 在本地测试这把钥匙

**别急着配 CI。先在本地证明"这把钥匙能用"。**

**退出服务器，回到本地：**

```bash
ssh -i ~/.ssh/ci-lab-deploy -o IdentitiesOnly=yes root@47.98.xx.xx "echo ok"
```

**逐段读：**

| 参数 | 意思 |
|---|---|
| `-i ~/.ssh/ci-lab-deploy` | 指定用这把私钥 |
| `-o IdentitiesOnly=yes` | **只用指定的这把**，不要拿别的钥匙乱试 |
| `"echo ok"` | 登录后执行这一条命令，然后退出 |

**为什么 `IdentitiesOnly=yes` 很重要：**

```text
不加的话，ssh 会把你 ~/.ssh 下所有钥匙都试一遍
服务器的认证日志里会出现一堆 "Failed publickey"
某些服务器会因此临时封你的 IP
```

**应该看到：**

```text
ok
```

**如果第一次连，会问：**

```text
The authenticity of host '47.98.xx.xx (47.98.xx.xx)' can't be established.
ED25519 key fingerprint is SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

**这就是"你第一次见这台服务器，你确认它是它吗"。**

**⚠️ 这一步不要盲输 yes。**

**为什么：**

```text
如果你连的其实是一个冒充的中间人
你输 yes 就等于"我接受这个陌生人的身份"
之后所有通信它都能解密、篡改
```

**正确做法：**

**在服务器上（通过你之前的可信连接）查看它真实的指纹：**

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

**应该看到：**

```text
256 SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx root@iZbp1xxxxx (ED25519)
```

**和本地提示里的 `SHA256:xxx` 逐字符对比。**

**一样 → 输 `yes`。不一样 → 立刻停下，说明你连的不是你的服务器。**

**这就是 `known_hosts` 的全部意义：记住"我见过的服务器指纹"。**

**它存在哪：**

```bash
cat ~/.ssh/known_hosts
```

**应该看到（加了 `-H` 的会哈希主机名）：**

```text
|1|abc123...=|def456...= ssh-ed25519 AAAAC3Nza...
```

**为什么是乱码：**

```text
ssh 默认把主机名哈希后存，防止"known_hosts 泄露了你连过哪些机器"
```

**看得懂吗：看不懂。但 ssh 自己看得懂。**

## 2.5 让这把钥匙只能干一件事（可选但推荐）

**默认情况下，这把钥匙能登进来做任何事（包括 `rm -rf /`）。**

**如果它泄露了，后果是"服务器被完全控制"。**

**限缩办法：在 `authorized_keys` 里给这一行加前缀。**

**在服务器上编辑：**

```bash
nano ~/.ssh/authorized_keys
```

**把 CI 那一行改成：**

```text
command="/srv/app/deploy.sh",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... ci-deploy-ci-lab
```

**逐项读：**

| 前缀 | 意思 |
|---|---|
| `command="..."` | **不管客户端请求执行什么，都只执行这一条** |
| `no-port-forwarding` | 不许用它开隧道 |
| `no-agent-forwarding` | 不许转发 agent（防止链式登录别的机器） |
| `no-pty` | 不给交互式终端 |

**⚠️ 但这条和我们的脚本冲突：**

```text
我们的 CI 执行的是 deploy.sh 3f7a1c2 —— 带参数
而 command= 强制执行的命令不带参数
```

**所以要用 `$SSH_ORIGINAL_COMMAND` 的写法：**

**建一个包装脚本 `/srv/app/ssh-entry.sh`：**

```bash
#!/usr/bin/env bash
set -euo pipefail

case "${SSH_ORIGINAL_COMMAND:-}" in
  "deploy "*) exec /srv/app/deploy.sh "${SSH_ORIGINAL_COMMAND#deploy }" ;;
  "status")   exec /srv/app/status.sh ;;
  *) echo "不允许的命令: ${SSH_ORIGINAL_COMMAND:-<空>}"; exit 1 ;;
esac
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `${SSH_ORIGINAL_COMMAND:-}` | 客户端原本想执行什么（可能为空） |
| `"deploy "*` | 以 `deploy ` 开头 |
| `${VAR#deploy }` | 去掉开头的 `deploy ` |
| `exec` | 用这个进程替换掉当前 shell |

**然后 `authorized_keys` 里写：**

```text
command="/srv/app/ssh-entry.sh",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... ci-deploy-ci-lab
```

**CI 里调用：**

```bash
ssh ... "deploy 3f7a1c2"
```

**这样即使私钥泄露，攻击者也只能部署，不能删你的服务器。**

**⚠️ 这一节是"加分项"，不是必须。**

**它会让调试变难**（你不能再 `ssh` 进去随便敲命令了）。**学习阶段可以先不做，但要知道有这个手段。**

**第 233 节课（交付边界）会用到这个思路。**

---

# 第 3 步：把密钥放进 GitHub Secrets（20 分钟）

## 3.1 要放哪几个

| Secret 名 | 内容 | 从哪来 |
|---|---|---|
| `SSH_PRIVATE_KEY` | 私钥全文（含首尾两行） | `cat ci-lab-deploy` |
| `SSH_HOST` | 服务器 IP | 你自己知道 |
| `SSH_USER` | 登录用户名 | `root` 或 `deploy` |
| `SSH_KNOWN_HOSTS` | known_hosts 里那一行 | 见 3.4 |

**⚠️ 命名用大写加下划线。** 这是约定，不强制，但所有人都这么写。

## 3.2 复制私钥

```bash
cat ~/.ssh/ci-lab-deploy
```

**应该看到：**

```text
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
...
-----END OPENSSH PRIVATE KEY-----
```

**三行结构：**

```text
-----BEGIN OPENSSH PRIVATE KEY-----      ← 必须包含
（多行 base64）
-----END OPENSSH PRIVATE KEY-----        ← 必须包含
```

**⚠️ 首尾两行必须一起复制。**

**漏了会报：**

```text
Load key "/home/runner/.ssh/deploy_key": error in libcrypto
```

**第 6 个错误会详细讲这个。**

## 3.3 加到仓库 Secrets

**路径：**

```text
仓库 → Settings → 左侧 Secrets and variables → Actions → New repository secret
```

**逐个加：**

**第一个：**

| 字段 | 填什么 |
|---|---|
| `Name` | `SSH_PRIVATE_KEY` |
| `Secret` | 私钥全文（三行结构，一次粘贴） |

**点 `Add secret`。**

**第二个：** `SSH_HOST` = `47.98.xx.xx`（你的真实 IP）

**第三个：** `SSH_USER` = `root`（或者你建的 deploy 用户名）

**加完之后列表里应该看到：**

```text
SSH_HOST            Updated now
SSH_PRIVATE_KEY     Updated now
SSH_USER            Updated now
```

**注意：GitHub 不会让你再看 secret 的内容。**

```text
只能覆盖，不能查看
这是对的 —— 连你自己都不该能"读出来"
```

**所以：加之前先在本地备份好私钥。**

## 3.4 `SSH_KNOWN_HOSTS` 怎么来

**这是最容易做错的一步，单独讲。**

**方案 A：在 CI 里 `ssh-keyscan`（方便，但有风险）**

```yaml
      - name: 获取服务器指纹
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan -H ${{ secrets.SSH_HOST }} >> ~/.ssh/known_hosts
```

**`ssh-keyscan` 是什么：** "去连一下那台机器，把它给的公钥记下来"。

**⚠️ 它的风险：**

```text
它只是"第一次见到什么就信什么"（TOFU，Trust On First Use）
如果你连的时候有中间人 → 你记下的是中间人的公钥
→ 之后所有"验证通过"都是在跟中间人通信
```

**这就是为什么很多教程教你 `StrictHostKeyChecking=no` —— 那是把这个风险放大到 100%。**

**方案 B：在可信环境拿一次指纹，存成 secret（推荐）**

**在服务器上：**

```bash
ssh-keyscan -t ed25519 47.98.xx.xx
```

**或者更直接（本地已经有可信连接时）：**

```bash
ssh-keygen -F 47.98.xx.xx
```

**应该看到：**

```text
# Host 47.98.xx.xx found: line 12
|1|abc...=|def...= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...
```

**但这一行是哈希过的，不好直接放到另一台机器。**

**更简单的做法 —— 让 ssh 打印原始格式：**

```bash
ssh-keyscan -t ed25519 -H 47.98.xx.xx
```

**应该看到：**

```text
# 47.98.xx.xx:22 SSH-2.0-OpenSSH_8.9p1
|1|xxxxxxxxxxxxxxxxxxxxxxxxxxxx=|yyyyyyyyyyyyyyyyyyyyyyyyyyy= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...
```

**把这**一整行**（包括 `|1|...` 前缀）存进 `SSH_KNOWN_HOSTS`。**

**存之前先核对指纹：**

```bash
ssh-keyscan -t ed25519 47.98.xx.xx 2>/dev/null | ssh-keygen -lf -
```

**应该看到：**

```text
256 SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx 47.98.xx.xx (ED25519)
```

**和服务器上 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` 的输出对比。**

**一样 → 存进 secret。不一样 → 不要存。**

**为什么值得多花这 5 分钟：**

```text
你的私钥能登服务器
如果 CI 连到了假服务器，假服务器拿到的不是私钥（私钥不出门）
但它能让你的部署"看起来成功"，实际上什么都没做
而且它能记录你所有的部署命令和参数
```

**⚠️ 一个现实问题：服务器重装系统后，主机指纹会变。**

**那时候 CI 会报：**

```text
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
```

**这是"我认识的那台机器换人了"的警报。**

**正确处理：**

```text
① 先用别的方式确认"确实是重装了，不是我连错了"
② 重新取指纹，更新 SSH_KNOWN_HOSTS
③ 记录在运维笔记里"某年某月某日重装，指纹已更新"
```

**错误处理：`rm ~/.ssh/known_hosts` 然后 `StrictHostKeyChecking=no`。** 那是把警报器拆了。

## 3.5 Secrets 不能被打印

**GitHub 会自动打码 secret 的值。**

**测试一下（故意）：**

```yaml
      - run: echo "host is ${{ secrets.SSH_HOST }}"
```

**日志里会显示：**

```text
host is ***
```

**⚠️ 但这个保护有边界：**

```text
① 只对"完全匹配的字符串"生效
② base64、反转、拼接之后就不认识了
③ 分段打印也不认识
```

**举例（都不会被打码）：**

```bash
echo "${{ secrets.SSH_HOST }}" | base64
echo "${{ secrets.SSH_HOST }}" | rev
echo "${SSH_PART1}${SSH_PART2}"
```

**所以：不要试图"测试一下 secret 是什么"。** 需要验证，就在使用它的地方验证结果（比如 `ssh` 能不能连上）。

---

# 第 4 步：把 deploy 加进 CI（25 分钟）

## 4.1 先想清楚触发方式

**deploy 应该在什么时候跑：**

```text
✅ push 到 main 且测试通过且镜像推成功
❌ 每次 push 到任何分支
❌ PR 里（fork 的 PR 没有 secrets）
```

**所以 deploy job 需要三个条件：**

```yaml
on:
  push:
    branches:
      - main
```

**加上：**

```yaml
    needs: build
```

**这两个就够了。** `needs: build` 隐含了"test 也过了"（因为 build 也 needs test）。

## 4.2 加 deploy job

**打开 `.github/workflows/build.yml`，在 `jobs:` 下面加：**

```yaml
  deploy:
    name: 部署到服务器
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: 准备 SSH 目录
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh

      - name: 写入私钥
        run: |
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key

      - name: 写入 known_hosts
        run: |
          echo "${{ secrets.SSH_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - name: 执行部署
        run: |
          ssh -i ~/.ssh/deploy_key \
              -o IdentitiesOnly=yes \
              -o BatchMode=yes \
              -o ConnectTimeout=10 \
              -o ServerAliveInterval=15 \
              "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}" \
              "deploy ${GITHUB_SHA::7}"

      - name: 清理私钥
        if: always()
        run: rm -f ~/.ssh/deploy_key
```

**逐段读（每个 `-o` 都有用，不能删）：**

| 参数 | 意思 | 删了会怎样 |
|---|---|---|
| `-i ~/.ssh/deploy_key` | 用这把私钥 | 会用默认钥匙，认证失败 |
| `IdentitiesOnly=yes` | 只用指定的钥匙 | 会试遍 `~/.ssh` 下所有钥匙，可能触发服务器封禁 |
| `BatchMode=yes` | **禁止一切交互** | 卡在密码提示上，直到 10 分钟超时 |
| `ConnectTimeout=10` | 连接最多等 10 秒 | 网络不通时挂很久 |
| `ServerAliveInterval=15` | 每 15 秒发心跳 | 长时间部署时，中间防火墙可能断连 |

**`BatchMode=yes` 是最重要的一个。**

**没有它会怎样：**

```text
私钥不对 → ssh 提示 "Permission denied, please try again"
→ 然后等你输密码
→ CI 里没有键盘
→ 一直等
→ timeout-minutes: 10 到了才失败
→ 你的日志里只有一行 "Permission denied"，看不出"在等输入"
```

**有了 `BatchMode=yes`：**

```text
私钥不对 → 立刻报 "Permission denied (publickey)." → 退出码 255 → 立刻失败
```

**`"deploy ${GITHUB_SHA::7}"` 这一行要注意：**

```text
① 这是 bash 的字符串展开，取 GITHUB_SHA 前 7 位
② 它作为"远程要执行的命令"传给服务器
③ 服务器上的 ssh-entry.sh 会检查它以 deploy 开头
```

**如果你没做 2.5 节的限制，远程执行的会是 `deploy 3f7a1c2` 这个命令本身。**

**那就错了。** 需要改成：

```bash
"/srv/app/deploy.sh ${GITHUB_SHA::7}"
```

**两种写法对应两种服务器配置：**

| 服务器配置 | CI 里的命令 |
|---|---|
| 没做 command 限制 | `/srv/app/deploy.sh 3f7a1c2` |
| 做了 command 限制 + ssh-entry.sh | `deploy 3f7a1c2` |

**选一个，别混。**

## 4.3 完整文件（照这个核对）

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
          node-version: '20'
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

  deploy:
    name: 部署到服务器
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: 准备 SSH 目录
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh

      - name: 写入私钥
        run: |
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key

      - name: 写入 known_hosts
        run: |
          echo "${{ secrets.SSH_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - name: 执行部署
        run: |
          ssh -i ~/.ssh/deploy_key \
              -o IdentitiesOnly=yes \
              -o BatchMode=yes \
              -o ConnectTimeout=10 \
              -o ServerAliveInterval=15 \
              "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}" \
              "/srv/app/deploy.sh ${GITHUB_SHA::7}"

      - name: 清理私钥
        if: always()
        run: rm -f ~/.ssh/deploy_key
```

**⚠️ 两个地方要用你自己的值：**

```text
① 服务器上 deploy.sh 里的 IMAGE_PREFIX="ghcr.io/yourname/ci-lab"
② 上面这个文件不需要改镜像名（build 已经算出来了）
```

**但 deploy.sh 里的 `IMAGE_PREFIX` 必须和 GHCR 上的真实地址一致。**

**忘了改会怎样：**

```text
docker compose pull → deny / manifest unknown
```

**报错：**

```text
Error response from daemon: manifest unknown
```

**`manifest unknown` 的意思：** "这个仓库里没有这个 tag"。

**排查顺序：**

```text
① 去 GHCR 页面看这个 tag 在不在
② 对比地址的每一个字符（大小写、连字符、sha 长度）
③ 在服务器上 docker pull 那个完整地址，看报什么
```

## 4.4 push 并观察

```bash
git add .
git commit -m "第208节课：自动部署"
git push
```

**Actions 页面应该看到：**

```text
build
  #2  第208节课：自动部署
    test    ✅ 22s
    build   ✅ 1m 10s
    deploy  ✅ 18s
```

**点开 `deploy`，日志：**

```text
Run mkdir -p ~/.ssh
Run echo "***" > ~/.ssh/deploy_key
Run echo "***" > ~/.ssh/known_hosts
Run ssh -i ~/.ssh/deploy_key ...
  ssh -i ~/.ssh/deploy_key \
      -o IdentitiesOnly=yes \
      ...
  Warning: Permanently added '47.98.xx.xx' to the list of known hosts.
=== 部署开始 ===
目标 tag: sha-3f7a1c2
APP_IMAGE=ghcr.io/yourname/ci-lab:sha-3f7a1c2
...
=== 部署结束 ===
Run rm -f ~/.ssh/deploy_key
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `echo "***"` | **secret 被打码了，这是对的** |
| `Warning: Permanently added ...` | 它把主机加进了 known_hosts（我们已经预置了，所以这是覆盖/确认） |
| `=== 部署开始 ===` | 服务器上脚本的输出，通过 ssh 传回来了 |
| `Run rm -f ~/.ssh/deploy_key` | 清理步骤执行了 |

**注意这个重要事实：**

> **服务器上脚本的所有 stdout/stderr 都会出现在 CI 日志里。**

**好处：你在一处就能看到部署全过程。**

**坏处：如果脚本里 `cat .env`，你的密钥就进了 CI 日志（会存在 GitHub 上）。**

**所以：**

```text
❌ 不要在部署脚本里 cat 任何含密钥的文件
✅ 需要排查时打印"变量名"而不是"变量值"
```

**例如：**

```bash
echo "APP_IMAGE=$APP_IMAGE"                 # ✅ 这是镜像地址，不是密钥
echo "DATABASE_URL 长度: ${#DATABASE_URL}"   # ✅ 只说长度
```

## 4.5 验证"真的上线了"

**去服务器上（或者用 curl）：**

```bash
curl -fsS http://47.98.xx.xx:3000/health
```

**⚠️ 这一步大概率失败，因为安全组没开 3000，而且我们绑的是 127.0.0.1。**

**正确的验证方式（在服务器上）：**

```bash
ssh root@47.98.xx.xx "curl -fsS http://127.0.0.1:3000/health"
```

**应该看到：**

```text
{"ok":true,"uptime":12.4}
```

**再确认镜像版本：**

```bash
ssh root@47.98.xx.xx "docker inspect ci-lab-app --format '{{.Config.Image}}'"
```

**应该看到：**

```text
ghcr.io/yourname/ci-lab:sha-3f7a1c2
```

**`docker inspect --format` 是什么：** 用 Go 模板语法取容器配置里的某个字段。

**这一条比"看日志"可靠**，因为日志可能是缓存的，而这个直接读运行时状态。

**把这三条命令写进你的笔记。** 它们是你以后判断"部署到底成没成"的标准动作。

---

# 第 5 步：让部署更快更安全（15 分钟）

## 5.1 现在每次部署都要重新装一遍 SSH

**四个 step 里有三个是"准备 SSH"，每个 1 秒左右。**

**能不能省？**

```text
① 省不了多少时间（总共 2 秒）
② 但可以合并成一个 step，减少出错点
```

**合并：**

```yaml
      - name: 准备 SSH
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "${{ secrets.SSH_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts
```

**为什么用 `printf '%s\n'` 而不是 `echo`：**

```text
echo 在不同 shell 里对反斜杠的处理不同
printf '%s\n' 明确"原样输出，末尾加一个换行"
```

**为什么末尾要加换行：**

```text
ssh 读取私钥时，最后一行没有换行符有时会解析失败
（不同 OpenSSH 版本行为不一样）
加一个换行最保险
```

**这是第 6 个错误（`error in libcrypto`）的一个诱因。**

## 5.2 用 `deploy` 用户而不是 `root`

**现在你的 CI 用 root 部署。**

**问题：**

```text
① root 能删整个服务器
② 私钥泄露 = 服务器被完全控制
③ 审计日志里全是 root，分不清"人在操作"还是"CI 在操作"
```

**建一个专用用户：**

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

**逐行读：**

| 命令 | 意思 |
|---|---|
| `adduser --disabled-password` | 建用户，但禁用密码登录（只能密钥） |
| `usermod -aG docker deploy` | 把 deploy 加进 docker 组 |
| `cp ... authorized_keys` | 把公钥复制过去 |
| `chown -R deploy:deploy` | 改属主（不改的话 ssh 会拒绝） |

**⚠️ `usermod -aG docker` 意味着 deploy 用户能用 docker。**

**而"能用 docker"≈"能拿到 root"：**

```bash
docker run -v /:/host -it alpine chroot /host
```

**这一条能直接进宿主机根目录。**

**所以 docker 组本身就是高权限。** 但比直接用 root 好一点，因为：

```text
① 至少需要先拿到 deploy 的私钥
② 操作日志里能看到是 deploy
③ 可以给 deploy 加 command 限制
```

**第 231 节课（安全自查）会再讲这一条。**

**改完 CI 的 secret：**

```text
SSH_USER → deploy
```

**验证：**

```bash
ssh -i ~/.ssh/ci-lab-deploy deploy@47.98.xx.xx "whoami"
```

**应该看到：**

```text
deploy
```

## 5.3 deploy.sh 的属主问题

**`deploy.sh` 现在属主是 root，`deploy` 用户能执行但不能改。**

**这是对的。** 如果 `deploy` 能改 `deploy.sh`，那"限制命令"就形同虚设。

**验证权限：**

```bash
ls -l /srv/app/deploy.sh
```

**应该是：**

```text
-rwxr-xr-x 1 root root ... deploy.sh
```

**属主 root，其他人可读可执行、不可写。**

**但 `/srv/app` 目录呢：**

```bash
ls -ld /srv/app
```

**如果 deploy 需要写 `.env`（我们的脚本会 `sed -i .env`），它必须有写权限。**

```bash
chown root:deploy /srv/app
chmod 775 /srv/app
chown root:deploy /srv/app/.env
chmod 664 /srv/app/.env
```

**逐行读：**

| 命令 | 结果 |
|---|---|
| `chown root:deploy /srv/app` | 目录属于 root，组是 deploy |
| `chmod 775` | 组内可写（deploy 能建文件） |
| `.env` 给组写权限 | deploy 能改 APP_IMAGE |

**⚠️ `.env` 给组可读，意味着 deploy 用户能读到所有密钥。**

**这是"能部署"的必然代价**（部署要改 APP_IMAGE）。

**更严格的做法：** 把 `APP_IMAGE` 单独放一个文件，`.env` 只给 root 读写。

**你现在不用做到那么细。** 但要知道"权限每放宽一点，风险就多一点"。

---

# 第 6 步：故意犯八个错（30 分钟）

## 错误 1：`Host key verification failed`

**操作：** 删掉"写入 known_hosts"那一步。

**会怎样：**

```text
Host key verification failed.
Error: Process completed with exit code 255.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Host key verification failed.` | 主机验证失败 |
| `exit code 255` | **ssh 自己的错误码固定是 255** |

**为什么：**

```text
ssh 连上服务器，服务器给一个公钥
ssh 去 ~/.ssh/known_hosts 里找"这个 IP 对应的公钥我见过吗"
没找到 → 而且 BatchMode 禁止交互（不能问你"要不要接受"）
→ 直接拒绝
```

**为什么这是好事：**

```text
如果没有这个检查，任何能劫持你网络的人都能冒充你的服务器
你的部署会"成功"，但部署到了别人的机器上
```

**怎么修（正确顺序）：**

```text
① 在可信环境拿到服务器指纹（第 3.4 节）
② 核对指纹和服务器上的实际值
③ 存进 SSH_KNOWN_HOSTS
④ CI 里写入 ~/.ssh/known_hosts
```

**⚠️ 绝对不要这么修：**

```yaml
# ❌ 这是把警报器拆了
ssh -o StrictHostKeyChecking=no ...
```

**为什么它"看起来能用"：**

```text
它关掉了检查 → 任何主机都被接受 → 不再报错
```

**代价：**

```text
你失去了"确认对面是不是我的服务器"的唯一手段
中间人可以：
  ① 记录你所有的部署命令
  ② 假装部署成功（返回 0），实际什么都没做
  ③ 转发到真服务器，同时记录你传的所有数据
```

**如果实在要"临时绕过"（比如服务器刚重装）：**

```bash
ssh-keygen -R 47.98.xx.xx     # 从 known_hosts 删掉旧记录
ssh-keyscan -H 47.98.xx.xx >> ~/.ssh/known_hosts
```

**注意：`ssh-keygen -R` 是"删掉旧记录"，不是"关掉检查"。** 删完要重新加，检查仍然生效。

## 错误 2：私钥权限太宽

**操作：** 删掉 `chmod 600 ~/.ssh/deploy_key`。

**会怎样：**

```text
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
Permissions 0644 for '/home/runner/.ssh/deploy_key' are too open.
It is required that your private key files are NOT accessible by others.
This private key will be ignored.
Load key "/home/runner/.ssh/deploy_key": bad permissions
deploy@47.98.xx.xx: Permission denied (publickey).
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `UNPROTECTED PRIVATE KEY FILE!` | 私钥文件没受保护 |
| `Permissions 0644 ... are too open` | 权限 644 = 所有人可读 |
| `It is required that ... NOT accessible by others` | 要求：其他人不能访问 |
| `This private key will be ignored` | **它被忽略了** |
| `bad permissions` | 加载失败的原因 |
| `Permission denied (publickey)` | 最终结果：认证失败 |

**为什么 ssh 这么严格：**

```text
同机器上任何用户都能读 644 的文件
→ 他能复制你的私钥去别处用
→ ssh 干脆拒绝使用"可能已经泄露"的钥匙
```

**为什么 `echo >` 创建的默认是 644：**

```text
umask 决定新建文件的默认权限
runner 上 umask 通常是 022
→ 666 - 022 = 644
```

**怎么修：**

```bash
chmod 600 ~/.ssh/deploy_key
```

**为什么是 600 不是 700：**

```text
6 = 读写（属主）
0 = 无权限（组）
0 = 无权限（其他）
文件不需要执行权限，所以是 600
```

**目录是 700（需要"进入"权限 = 执行权限）。**

## 错误 3：公钥没加到服务器

**操作：** 只生成了密钥对，忘了把 `.pub` 追加到服务器的 `authorized_keys`。

**会怎样：**

```text
deploy@47.98.xx.xx: Permission denied (publickey).
Error: Process completed with exit code 255.
```

**为什么这个错误难查：**

```text
它和"私钥文件权限不对"的最终报错一模一样
它和"用户名写错"的报错也几乎一样
它和"服务器禁用了密钥登录"的报错也几乎一样
```

**四个可能，同一个报错。怎么区分：**

| 怀疑 | 怎么查 |
|---|---|
| 公钥没加 | 服务器上 `tail ~/.ssh/authorized_keys` 看有没有那一行 |
| 私钥权限 | 看前面有没有 `UNPROTECTED PRIVATE KEY FILE` |
| 用户名错 | `SSH_USER` 是不是 `root`/`deploy`，用户存不存在 |
| 服务器禁用密钥 | 服务器上 `grep -i pubkeyauth /etc/ssh/sshd_config` |

**最有效的排查方式是在服务器上看日志：**

```bash
tail -20 /var/log/auth.log
```

**应该能看到类似：**

```text
sshd[12345]: Connection closed by authenticating user deploy 203.0.113.5 port 51234 [preauth]
```

**或者：**

```text
sshd[12345]: Failed publickey for deploy from 203.0.113.5 port 51234 ssh2: ED25519 SHA256:xxx
```

**第二条说明"公钥试过了但不对"** —— 那就是公钥没加对，或者加到了别的用户下。

**如果是 `root` 的公钥加到了 `deploy` 的 `authorized_keys` 里 —— 那是对的。**

**如果加到了 `/root/.ssh/authorized_keys` 但登录的是 `deploy` —— 那就不对。**

**每个用户有自己的 `authorized_keys`。** 这是最常见的混淆点。

## 错误 4：deploy 用户没有 docker 权限

**操作：** 用 `deploy` 用户，但没 `usermod -aG docker deploy`。

**会怎样：**

```text
permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.24/containers/json": dial unix /var/run/docker.sock: connect: permission denied
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `permission denied while trying to connect to the Docker daemon socket` | 连不上 docker 的"控制接口" |
| `unix:///var/run/docker.sock` | 那个接口是个 Unix socket 文件 |
| `connect: permission denied` | 没权限打开它 |

**为什么：**

```text
/var/run/docker.sock 的属主是 root:docker，权限 660
deploy 不在 docker 组 → 打不开
```

**怎么修：**

```bash
usermod -aG docker deploy
```

**⚠️ 加完组之后，已经登录的会话不会生效。**

**必须重新登录（或者 `newgrp docker`）。**

**验证：**

```bash
ssh -i ~/.ssh/ci-lab-deploy deploy@47.98.xx.xx "id"
```

**应该看到：**

```text
uid=1000(deploy) gid=1000(deploy) groups=1000(deploy),999(docker)
```

**`999(docker)` 必须在里面。**

**如果不在，重登一次再看。**

**⚠️ 另一条路：用 `sudo`。**

```bash
echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/docker" >> /etc/sudoers.d/deploy
```

**`/etc/sudoers.d/` 下的文件不要直接用 `>>`，要用 `visudo -f`：**

```bash
visudo -f /etc/sudoers.d/deploy
```

**为什么：**

```text
sudoers 文件语法错了，sudo 会拒绝工作
严重的话你再也无法 sudo（把自己锁在外面）
visudo 会在保存前检查语法
```

**⚠️ 这一步很危险。** 你现在用 `usermod -aG docker` 就够了。

## 错误 5：`.env` 不存在

**操作：** 服务器上没建 `.env`，或者建在了别的目录。

**会怎样：**

```text
=== 部署开始 ===
目标 tag: sha-3f7a1c2
错误：找不到 /srv/app/.env
Error: Process completed with exit code 1.
```

**（这个报错是我在 `deploy.sh` 里写的，所以你能看到中文。）**

**如果没有那个检查，compose 会报：**

```text
env file /srv/app/.env not found: stat /srv/app/.env: no such file or directory
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `env file ... not found` | 找不到 env 文件 |
| `stat /srv/app/.env: no such file or directory` | 系统调用 `stat` 返回"文件不存在" |

**为什么这个错误很常见：**

```text
① 换服务器时要重新建（.env 不在 Git 里）
② 换目录时忘了带过去
③ 用 deploy 用户跑，但 .env 在 /root 下
```

**怎么修：**

```bash
ls -la /srv/app/
```

**如果 `.env` 不在，从备份恢复（或者重新建）。**

**⚠️ 不要用 `cp /root/.env /srv/app/` 然后忘了改权限。**

**修完权限：**

```bash
chown root:deploy /srv/app/.env
chmod 664 /srv/app/.env
```

**为什么 `deploy.sh` 里要显式检查 `.env`：**

```text
"文件不存在"这个错误，在 compose 的报错里藏得很深
你在 CI 日志里只会看到最后几行
提前检查能让报错更清楚、更早
```

**这是"防御式脚本"的一个例子：**

> **在脚本开头检查所有前提条件，比在中途出错更好。**

**第 7 节课的脚本会在开头检查：目录、文件、docker 命令、网络。**

## 错误 6：私钥有 CRLF 换行

**操作：** 在 Windows 上用记事本打开私钥，保存了一次。

**会怎样：**

```text
Load key "/home/runner/.ssh/deploy_key": error in libcrypto
deploy@47.98.xx.xx: Permission denied (publickey).
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `error in libcrypto` | OpenSSL 解析密钥失败 |
| `Permission denied (publickey)` | 结果：认证失败 |

**为什么：**

```text
Windows 记事本把 LF（\n）存成 CRLF（\r\n）
私钥的 base64 里混进了 \r
OpenSSL 解析 base64 时遇到非法字符 → 失败
```

**怎么查（在 CI 里加一步）：**

```yaml
      - name: 检查私钥格式
        run: |
          file ~/.ssh/deploy_key || true
          if grep -q $'\r' ~/.ssh/deploy_key; then
            echo "私钥里有 CR 字符，说明是 CRLF 换行"
            exit 1
          fi
```

**`$'\r'` 是什么：** bash 的 ANSI-C 引用，表示回车符。

**`grep -q` 找到就返回 0，配合 `if` 就是"如果找到 CR 就报错"。**

**怎么修（两种）：**

**修法一：在本地转成 LF（Git Bash）：**

```bash
cd ~/.ssh
dos2unix ci-lab-deploy      # 如果装了 dos2unix
# 或者
sed -i 's/\r$//' ci-lab-deploy
```

**修法二：重新生成，别用记事本碰它。**

```bash
ssh-keygen -t ed25519 -C "ci-deploy-ci-lab" -f ./ci-lab-deploy -N ""
```

**根本原因：**

```text
私钥是二进制数据的 base64 编码
它不是"文本文件"，不该被文本编辑器改
```

**这条对很多东西都成立：**

```text
.sh 脚本有 CRLF → "bad interpreter: /bin/bash^M"
.env 有 CRLF    → 变量值末尾多个 \r，导致"密钥明明对但认证失败"
```

**第 5 个错误里 `.env` 那个坑更隐蔽：**

```text
MODEL_API_KEY=sk-xxx\r
→ 你的代码读到 "sk-xxx\r"
→ API 返回 401
→ 你检查了十遍"密钥是对的"
```

**在服务器上查 `.env` 有没有 CR：**

```bash
grep -c $'\r' /srv/app/.env
```

**输出不是 0 就是有。**

## 错误 7：SSH 挂在"要不要继续连接"

**操作：** 有 `known_hosts` 是空的（比如你写了 `echo "" > known_hosts`），并且去掉了 `BatchMode=yes`。

**会怎样：**

**日志停在这里，一直到超时：**

```text
The authenticity of host '47.98.xx.xx (47.98.xx.xx)' can't be established.
ED25519 key fingerprint is SHA256:xxxxx.
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

**然后 10 分钟后：**

```text
Error: The operation was canceled.
```

**为什么：**

```text
ssh 在等标准输入
CI 里没有标准输入
→ 一直等
→ timeout-minutes 到了才被杀
```

**这个错误的代价：**

```text
① 白等 10 分钟
② 烧 10 分钟额度
③ 日志里看不出"在等输入"（因为它只是打印了一行提问）
```

**怎么修：**

```yaml
      - run: |
          ssh -o BatchMode=yes -o ConnectTimeout=10 ...
```

**`BatchMode=yes` 的效果：**

```text
任何需要交互的情况（密码、yes/no、passphrase）
直接失败，不等待
```

**这就是为什么它必须加。**

**另外一个配套参数：**

```yaml
          -o NumberOfPasswordPrompts=0
```

**它的意思是"密码提示最多问 0 次"。** 和 `BatchMode` 效果类似，但更明确。

**两个都加也不冲突。**

## 错误 8：用 root 密码登录

**操作：** 在 secrets 里存 `SSH_PASSWORD`，用 `sshpass` 登录。

```yaml
      - run: sshpass -p "${{ secrets.SSH_PASSWORD }}" ssh root@...
```

**会怎样：**

**它能工作。** 这是它危险的地方。

**四个问题：**

```text
① 服务器必须开着 PasswordAuthentication yes
   → 你的服务器暴露给全网暴力破解（第 212 节课的数据：每天几百到几千次）
② 密码在 secrets 里，但它"不会过期"
   → 泄露了就一直有效，除非你手动改
③ sshpass 把密码放在命令行参数里
   → 同机器上 ps 一下就能看到
④ 密码登录没有"这把钥匙只能部署"这种限制
   → 拿到密码 = 拿到整个服务器
```

**为什么大量教程还是这么写：**

```text
因为它"配置最简单"：不用生成密钥、不用管 known_hosts
新手第一次就能成功
```

**但它的成本在后面：**

```text
某天你发现服务器上多了个挖矿进程
某天你的服务器 IP 被云厂商封了（因为对外攻击）
```

**怎么修：**

```text
① 用密钥（第 2 步）
② 服务器上关掉密码登录（第 212 节课详细讲）
```

**关掉的配置（`/etc/ssh/sshd_config`）：**

```text
PasswordAuthentication no
PermitRootLogin prohibit-password
```

**⚠️ 改这两行之前，先确认"密钥登录已经能用"。**

**否则你会把自己锁在外面。**

**顺序必须是：**

```text
① 密钥登录测试成功
② 再改配置
③ systemctl reload sshd（不是 restart，reload 不会断开现有连接）
④ 保持当前会话不要退出
⑤ 另开一个终端测试能否登录
⑥ 确认能登录后，再退出旧会话
```

**这五步的顺序错一步，你就得去云控制台用 VNC 救。**

---

# 第 7 步：写学习笔记（10 分钟）

**把下面的模板复制到 `02-笔记/NOTES.md`，然后填空。**

````markdown
# 第 208 节课学习笔记

## 一、我手动部署的三条命令

1.
2.
3.

为什么"二十秒的手动操作"也值得自动化：

## 二、服务器上的文件

| 文件 | 作用 | 属主/权限 |
|---|---|---|
| `/srv/app/docker-compose.yml` | | |
| `/srv/app/.env` | | |
| `/srv/app/deploy.sh` | | |

为什么 `.env` 要手动建，不能进 Git：

## 三、`set -euo pipefail` 三个参数

| 参数 | 意思 | 没有它会怎样 |
|---|---|---|
| `-e` | | |
| `-u` | | |
| `-o pipefail` | | |

## 四、幂等

幂等的定义：

我跑了三遍 `deploy.sh`，分别看到：

| 次数 | 输出关键词（Downloaded / up to date / Recreated） |
|---|---|
| 1 | |
| 2 | |
| 3 | |

为什么 `docker compose up -d` 本身是幂等的：

## 五、两把钥匙

| 用途 | 文件名 | 放在哪 | 泄露的后果 |
|---|---|---|---|
| 我自己的登录 | | | |
| CI 部署 | | | |

为什么 CI 不能用自己的私钥（三个理由）：

1.
2.
3.

## 六、known_hosts

它防的是什么：

我第一次连服务器看到的提示是什么：

我是怎么核对指纹的：

`StrictHostKeyChecking=no` 到底关掉了什么：

## 七、四个 secrets

| 名字 | 内容 | 从哪来 |
|---|---|---|
| SSH_PRIVATE_KEY | | |
| SSH_HOST | | |
| SSH_USER | | |
| SSH_KNOWN_HOSTS | | |

## 八、我的 deploy job

贴完整内容：

```yaml

```

`BatchMode=yes` 的作用：

`IdentitiesOnly=yes` 的作用：

`ConnectTimeout=10` 的作用：

## 九、八个错误

| 错误 | 报错关键词 | 根本原因 | 怎么查 |
|---|---|---|---|
| 没有 known_hosts | | | |
| 私钥权限 644 | | | |
| 公钥没加 | | | |
| 没有 docker 组 | | | |
| `.env` 不存在 | | | |
| CRLF 换行 | | | |
| 卡在 yes/no | | | |
| 用密码登录 | | | |

## 十、验证部署成功

我用的三条命令：

1.
2.
3.

为什么"看日志"不如"看 `docker inspect`"：

## 十一、我还不懂的词

-
-

## 十二、完成检查

- [ ] 服务器上 `/srv/app` 有三个文件，`.env` 权限是 600/664
- [ ] `deploy.sh` 有 `set -euo pipefail`，能带参数跑
- [ ] 我手动跑过三遍，确认它是幂等的
- [ ] CI 用的私钥和我的登录私钥是两把
- [ ] 我核对过服务器指纹，没有用 `StrictHostKeyChecking=no`
- [ ] `deploy` job 在 Actions 上跑出了绿勾
- [ ] 我用 `docker inspect` 确认过容器里跑的是新 tag
- [ ] 全程没有手动 SSH 上去敲过部署命令
````

---

# 第 8 步：课后练习

## 练习一：让部署脚本"失败就停"

**要求：**

1. 在 `deploy.sh` 的 `docker compose pull` 之前插一句 `false`；
2. 跑一次，看它有没有继续执行后面的步骤；
3. 再删掉 `set -e`，重复一次。

**记录：** 两次的输出差异。

**思考题：** 如果没有 `-e`，`docker compose pull` 失败了，`up -d` 用的是哪个镜像？CI 会显示什么？

## 练习二：故意让已知指纹变化

**要求：**

1. 在 `SSH_KNOWN_HOSTS` 里改一个字符；
2. push 一次，看报错；
3. 改回来。

**记录：** 报错原文（这次是"key 不匹配"而不是"没有 key"）。

**思考题：** 这两个报错的区别说明了什么？

## 练习三：把部署时间从 18 秒压到 10 秒

**要求：**

1. 拆开看 deploy job 每一步的耗时；
2. 找出最慢的一步；
3. 试两个优化（合并 step、减少 `sleep`、`ServerAliveInterval` 调大）。

**记录：** 优化前后对比表。

**思考题：** 如果最慢的是"等容器启动"，你能把它从 `sleep 3` 变成"轮询健康检查"吗？

## 练习四：给 deploy 加一个"手动触发"

**要求：**

1. 加 `workflow_dispatch`；
2. 加一个 `inputs.sha`，默认值 `${{ github.sha }}`；
3. 部署时用 `inputs.sha` 而不是 `github.sha`；
4. 手动部署一次旧的 sha。

**记录：** 你部署回去之后，`docker inspect` 显示什么？

**思考题：** 这个功能算"回滚"吗？它和"自动回滚"差什么？

## 练习五：写一份"服务器重装后的恢复清单"

**要求：**

1. 假设服务器被重装了，你要做哪些事才能让 CI 继续部署？
2. 列成编号清单（至少 8 步）；
3. 标注哪几步"最容易被忘"。

**记录：** 清单。

**思考题：** 这份清单能不能变成脚本？哪几步不能自动化，为什么？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清"部署密钥"和"我的登录密钥"为什么要分开
- [ ] 我知道 `known_hosts` 防的是什么，也知道 `StrictHostKeyChecking=no` 关掉了什么
- [ ] 我知道幂等的定义，并能举一个不幂等的例子
- [ ] 我知道 `set -euo pipefail` 三个参数各自的作用
- [ ] 我知道 `BatchMode=yes` 是为了"不卡在交互提示"

## B. 实操

- [ ] 服务器上 `/srv/app` 有 `docker-compose.yml`、`.env`、`deploy.sh`
- [ ] `docker-compose.yml` 里端口绑的是 `127.0.0.1:3000`
- [ ] `deploy.sh` 能带参数执行，且连跑三遍结果一致
- [ ] 我生成了专门的 `ci-lab-deploy` 密钥对，公钥在服务器上
- [ ] 四个 secrets 都配好了，`SSH_KNOWN_HOSTS` 是核对过指纹的
- [ ] `deploy` job 有 `needs: build`，并且跑出了绿勾
- [ ] 我用 `docker inspect` 确认过容器里的镜像 tag

## C. 排错

- [ ] 我见过 `Host key verification failed.` + `exit code 255`
- [ ] 我见过 `UNPROTECTED PRIVATE KEY FILE!` + `bad permissions`
- [ ] 我见过 `Permission denied (publickey).`
- [ ] 我见过 `permission denied ... /var/run/docker.sock`
- [ ] 我知道 `error in libcrypto` 是换行符问题

## D. 交付

- [ ] 我只 push，不碰服务器，网站就更新了
- [ ] 我保留了 `deploy` job 的日志作为证据
- [ ] 服务器上没有我自己的私钥副本
- [ ] `.env` 没有进 Git，也没有出现在任何 CI 日志里

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 贴了完整的 `deploy` job
- [ ] 记录了"三遍部署"的输出差异

## 本节课要能说出口的一句话

> **自动部署不是"把命令搬到 CI 里"，是把命令写成一个幂等的脚本，然后让 CI 只负责"敲一下"；而能不能安全地敲，取决于那把只能部署的钥匙和那张核对过指纹的 known_hosts。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `Host key verification failed.` | known_hosts 里没有这台机器 | 核对指纹后写入 `SSH_KNOWN_HOSTS` |
| `REMOTE HOST IDENTIFICATION HAS CHANGED!` | 服务器重装 / 换 IP | 确认后重新取指纹，更新 secret |
| `UNPROTECTED PRIVATE KEY FILE!` | 私钥权限不是 600 | `chmod 600 ~/.ssh/deploy_key` |
| `error in libcrypto` | 私钥被 CRLF 污染 / 首尾行缺失 | 重新生成，别用记事本 |
| `Permission denied (publickey).` | 公钥没加对用户 / 用户名错 | 看 `/var/log/auth.log` |
| `permission denied ... docker.sock` | 用户不在 docker 组 | `usermod -aG docker deploy`，**重登** |
| `env file /srv/app/.env not found` | `.env` 没建 / 建错目录 | 建好并 `chmod 664` |
| `manifest unknown` | 镜像 tag 不存在 / 地址写错 | 去 GHCR 核对地址每一字符 |
| `Image is up to date` 但代码没变 | sha 没变（没新提交） | 正常；确认你 push 成功 |
| 部署了但网站没变 | compose 用了旧 `.env` | `grep APP_IMAGE .env` 看是不是新 tag |
| deploy job 卡 10 分钟 | 在等交互输入 | 加 `BatchMode=yes` |
| `exit code 255` | ssh 自己的错误 | 看上一行具体原因 |
| `Permission denied` 但密钥对 | `.env` 里有 `\r` 混进密钥 | `grep -c $'\r'` 检查 |
| 容器重启要等 10 秒 | `CMD` 不是数组形式，收不到 SIGTERM | 改 `CMD ["node", ...]` |
| 部署成功但 502 | 容器起来了但程序崩了 | `docker compose logs --tail=50 app` |
