# 第 217 节课：收口——公网 IP 打开就是你的应用

> **前六节课你分别装了一块零件。今天是拧最后一颗螺丝，然后通一次电。**
> 通电之后可能不通。**不通的时候，你需要的不是"再试一次"，是一张从外往里走的表。**
> 今天要交付三样东西：**能打开的 IP、一张八步排查表、一个能回滚的 `deploy.sh`。**

**建议用时**：120 分钟
**你需要先完成**：第 216 节课（浏览器打开 IP 能看到应用，`curl -I 127.0.0.1` 有 `X-Powered-By`）

---

# 第 0 步：收口要收什么（10 分钟）

## 0.1 你现在会什么

```text
一台服务器（2 核 2G，Ubuntu 22.04）
密钥登录（密码已关）
Node 20 / git / nginx / 2G swap
代码在 /srv/app，.env 手动建
pm2 常驻 + 开机自启
nginx 80 → 127.0.0.1:3000
```

**七块零件都装好了。**

## 0.2 你以后会遇到什么

```text
① "网站打不开了" —— 你要能在 10 分钟内定位到哪一层
② "我要发个新版本" —— 一条命令，不能手忙脚乱敲五条
③ "新版本有 bug，退回去" —— 一条命令，不能重新传代码
④ "为什么昨天还好好的" —— 你要有日志和版本号
⑤ "客户问一个月多少钱" —— 你要能报出一个数
```

**这五件事，今天一次解决。**

## 0.3 今天要建立的三个概念

```text
① 证据链 —— 一次请求在三个地方留下痕迹（nginx 日志、pm2 日志、浏览器）
② 八步排查 —— 从外往里，每步只回答一个是/否
③ 可回滚发布 —— 发布脚本必须自带"不行就退回去"
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 八步表、三次演练、回滚记录 |
| `deploy.sh` | `03-练习代码` | 你自己写：拉代码 → 装依赖 → 重启 → 健康检查 → 失败回滚 |
| `RUNBOOK.md` | `03-练习代码` | 你自己写：一页，出什么事敲什么 |
| 能打开的 IP | 浏览器 | `http://47.98.xx.xx` |

**验收标准是三句话：**

```text
① 浏览器打开 IP，是你的应用，不是 404/502/欢迎页。
② 我能不看课件，按顺序说出八步排查法的前四步。
③ 我用 deploy.sh 发布过一次，也用它回滚过一次。
```

---

# 第 1 步：先通一次电，留下证据（15 分钟）

## 1.1 用浏览器打开

```text
http://47.98.xx.xx
```

**应该看到你的 chat-app 页面。**

**⚠️ 记住你打开的时间，精确到分钟。** 例如 `14:05`。

## 1.2 三个地方对暗号

**证据一：nginx 的 access.log**

```bash
ssh myserver
tail -5 /var/log/nginx/access.log
```

**应该看到刚才那几条：**

```text
113.xx.xx.xx - - [16/Nov/2026:14:05:12 +0800] "GET / HTTP/1.1" 200 1832 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ..."
113.xx.xx.xx - - [16/Nov/2026:14:05:12 +0800] "GET /style.css HTTP/1.1" 200 4210 "http://47.98.xx.xx/" "Mozilla/5.0 ..."
113.xx.xx.xx - - [16/Nov/2026:14:05:13 +0800] "GET /app.js HTTP/1.1" 200 18302 "http://47.98.xx.xx/" "Mozilla/5.0 ..."
```

**逐字段确认：**

| 字段 | 你的值 | 说明什么 |
|---|---|---|
| IP | `113.xx.xx.xx` | **是你家的公网 IP**（不是 127.0.0.1） |
| 时间 | `14:05:12` | **和你按刷新的时间对得上** |
| 请求 | `GET /` | 你访问的是首页 |
| 状态 | `200` | 成功 |
| Referer 第二行 | `http://47.98.xx.xx/` | 是首页引用的 CSS |

**证据二：pm2 的日志**

```bash
pm2 logs chat-app --lines 20 --nostream
```

**应该看到：**

```text
/root/.pm2/logs/chat-app-out.log last 20 lines:
0|chat-app | [dotenv@16.4.5] injecting env (5) from .env
0|chat-app | Server running at http://127.0.0.1:3000
```

**如果程序里给每个请求打了日志：**

```text
0|chat-app | GET / 200 12ms
```

**证据三：浏览器的开发者工具**

**按 F12 → Network → 刷新。**

**应该看到一堆请求，每个都是 200。**

**点开第一个 `47.98.xx.xx`，看 Response Headers：**

```text
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
X-Powered-By: Express
Content-Type: text/html; charset=utf-8
```

**`X-Powered-By: Express` 这一行，是"请求真的到了你的程序"的铁证。**

## 1.3 为什么要在这一步停下来

**因为你现在有一个"已知可用"的状态。**

```text
出问题的时候，你需要一个"上次好的时候是什么样"的参照。
这个参照就是：access.log 里有 200、pm2 日志有启动记录、浏览器有 X-Powered-By。
```

**先把这三样截图或抄下来。**

**以后每次改完东西，都回来对一遍这三样。** 这叫"基线"。

---

# 第 2 步：八步排查法（35 分钟，本节课的核心）

## 2.1 先记住顺序

```text
① DNS 解析对不对
② 服务器活着吗
③ SSH 能进吗
④ 程序在跑吗
⑤ 程序能本地访问吗
⑥ Nginx 活着吗
⑦ Nginx 配置对吗
⑧ 转发对吗
```

**顺序是"从外往里"。**

**为什么不能反过来：**

```text
你一上来就看代码。
改了两小时，发现是安全组没开 80。
这两小时里，你的代码一行问题都没有。
```

**每一关只回答一个是/否。** 是 → 往下走；否 → 停在这一关修。

## 2.2 第 1 步：DNS 解析对不对

**命令（在你本地电脑上，不是服务器上）：**

```bash
ping your-domain.com
```

**为什么第一步是这个：**

```text
因为如果域名没解析对，后面的六步全都白查。
你连"哪台机器"都没找对。
```

**通过标准：**

```text
Reply from 47.98.xx.xx: bytes=32 time=24ms TTL=52
```

**这个 IP 必须是你服务器。**

**不通过怎么办：**

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `Ping request could not find host` | 域名不存在 / 没解析 | 去域名后台加 A 记录 |
| 返回的 IP 不是你服务器 | A 记录填错 | 改记录，等 10 分钟 |
| 返回旧 IP | 本地 DNS 缓存 | `ipconfig /flushdns`，或用手机 4G 测 |

**⚠️ 这一周你用 IP 访问，所以这一步可以跳过。**

**但表要背下来，第 32 周马上要用。**

**用 IP 的时候，第 1 步的等价物是：**

```text
这个 IP 是不是我那台机器？
去控制台看一眼实例的公网 IP，一个数字一个数字对。
```

**听起来很傻，但"IP 抄错一位"是真实发生过的事。**

## 2.3 第 2 步：服务器活着吗

**命令：**

```bash
ping 47.98.xx.xx
```

**通过标准：**

```text
Reply from 47.98.xx.xx: bytes=32 time=24ms TTL=52
```

**⚠️ 但 ping 不通不代表死了。**

```text
很多云厂商默认禁 ICMP。
ping 不通 → 不能下结论
ping 通了 → 一定活着
```

**ping 不通时，用这个代替：**

```bash
ssh -o ConnectTimeout=8 root@47.98.xx.xx
```

**能看到 `password:` 或 `Permission denied (publickey)`，就说明网络层是通的。**

**不通过怎么办：**

| 现象 | 原因 |
|---|---|
| 超时 + `ssh` 也超时 | 服务器关机 / 安全组封了 22 / IP 错了 |
| `Destination Host Unreachable` | 网络路由问题（少见） |

**去控制台看实例状态是不是"运行中"。**

## 2.4 第 3 步：SSH 能进吗

**命令：**

```bash
ssh myserver
```

**通过标准：**

```text
root@VM-0-12-ubuntu:~#
```

**不通过怎么办：**

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `Connection timed out` | 22 没开 / 机器没起 | 查安全组、查实例状态 |
| `Connection refused` | sshd 没跑 | VNC 进去 `systemctl status ssh` |
| `Permission denied (publickey)` | 密钥问题 | 查本地私钥、查 `authorized_keys` |
| `Host key verification failed` | 重装过系统，指纹变了 | `ssh-keygen -R 47.98.xx.xx` |

**这一关过不了，后面全都不用查。** 因为你没法进机器。

## 2.5 第 4 步：程序在跑吗

**命令（在服务器上）：**

```bash
pm2 list
```

**通过标准：**

```text
│ 0  │ chat-app │ default │ 1.0.0 │ fork │ 812 │ 35m │ 1 │ online │ 0% │ 44.8mb │ root │
```

**三个都要对：**

```text
① status 是 online
② ↺ 没有一直涨（比如几秒内从 1 变成 5）
③ uptime 是合理的（不是 0s 一直重置）
```

**不通过怎么办：**

```bash
pm2 start server.js --name chat-app     # 没在列表里
pm2 restart chat-app                     # 在列表里但 stopped
pm2 logs chat-app --lines 50 --nostream  # errored 时看日志
```

**⚠️ 注意：`online` 也可能是假的。**

```text
如果程序启动就崩，pm2 会反复拉起，
你每次看都是 online，但 ↺ 在涨。
所以要连着看两次，中间隔 5 秒。
```

## 2.6 第 5 步：程序能本地访问吗

**命令（在服务器上）：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

**通过标准：**

```text
200
```

**这一步排除了 nginx，只测程序本身。**

**为什么这一步这么重要：**

```text
如果第 5 步不通，第 6/7/8 步全都不用查 —— 问题在你的程序，不在 nginx。
如果第 5 步通了，第 6/7/8 步不通 —— 问题在 nginx 或网络，不在你的代码。
```

**这一条把"查代码"和"查配置"彻底分开了。**

**不通过怎么办：**

| 输出 | 原因 | 怎么做 |
|---|---|---|
| `000` + `Connection refused` | 程序没监听 3000 | `ss -lntp \| grep 3000` |
| `500` | 程序在跑但报错 | `pm2 logs --err` |
| `404` | 程序在跑，但没这个路由 | 换一个你知道存在的路径试 |
| 卡住不返回 | 程序死循环 / 等外部 API | 看日志，加超时 |

## 2.7 第 6 步：Nginx 活着吗

**命令：**

```bash
systemctl status nginx
```

**通过标准：**

```text
Active: active (running)
```

**不通过怎么办：**

```bash
systemctl start nginx
```

**如果起不来：**

```bash
journalctl -u nginx -n 50 --no-pager
```

**最常见的两条：**

```text
nginx: [emerg] unknown directive ...     → 配置拼写错
nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)  → 80 被别的程序占了
```

**80 被谁占了：**

```bash
ss -lntp | grep ':80'
```

**如果看到 `apache2`，说明你装了 Apache：**

```bash
systemctl stop apache2
systemctl disable apache2
```

## 2.8 第 7 步：Nginx 配置对吗

**命令：**

```bash
nginx -t
```

**通过标准：**

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**不通过怎么办：**

**按报错的行号改。** 报错会写成 `in /etc/nginx/sites-enabled/chat-app:9`。

**⚠️ 注意：`nginx -t` 通过，不代表"你改的那个文件被加载了"。**

**验证"真的加载了"：**

```bash
nginx -T | grep -n "proxy_pass"
```

**应该看到你的配置。**

**如果看不到：**

```text
① 软链接没建：ls -l /etc/nginx/sites-enabled/
② 改错了文件：你可能改的是 available，但 enabled 指向别处
③ 改完没 reload：systemctl reload nginx
```

## 2.9 第 8 步：转发对吗

**命令：**

```bash
curl -I http://127.0.0.1
```

**通过标准：**

```text
HTTP/1.1 200 OK
X-Powered-By: Express
```

**不通过怎么办：**

| 输出 | 原因 | 下一步 |
|---|---|---|
| `404` | `server_name` 不匹配 / 没站点接 | 改成 `_`，`nginx -T` 看 |
| `502` | upstream 连不上 | `tail error.log` 看 `Connection refused` |
| `504` | upstream 太慢 | 看 `$request_time`、程序日志 |

**502 时看：**

```bash
tail -3 /var/log/nginx/error.log
```

```text
[error] ... connect() failed (111: Connection refused) while connecting to upstream, ... upstream: "http://127.0.0.1:3000/"
```

**这一行告诉你三件事：**

```text
① 往哪连的（upstream）
② 为什么失败（Connection refused = 没人监听）
③ 谁访问的（client）
```

## 2.10 把这八步做成一张卡

| 步 | 查什么 | 命令 | 通过 |
|---|---|---|---|
| 1 | 名字对不对 | `ping 域名` | 返回你的 IP |
| 2 | 机器活不活 | `ping IP` / `ssh IP` | 有回应 |
| 3 | 能进去吗 | `ssh myserver` | 出现提示符 |
| 4 | 程序在跑吗 | `pm2 list` | online 且 ↺ 不涨 |
| 5 | 程序能答吗 | `curl 127.0.0.1:3000` | 200 |
| 6 | nginx 活吗 | `systemctl status nginx` | active |
| 7 | 配置对吗 | `nginx -t` | ok + successful |
| 8 | 转发对吗 | `curl -I 127.0.0.1` | 200 + X-Powered-By |

**这张表就是今天最重要的交付物。**

---

# 第 3 步：三次故障演练（25 分钟）

**⚠️ 演练会短暂让网站打不开。你现在没有真实用户，正是练的时候。**

## 3.1 演练 A：制造"超时"（模拟安全组没开 80）

**操作：**

去云控制台 → 防火墙 → 把 80 那条规则**暂时禁用**（或者删掉，记下来一会儿加回来）。

**浏览器刷新：**

```text
ERR_CONNECTION_TIMED_OUT
或
无法访问此网站，47.98.xx.xx 响应时间过长。
```

**按八步走：**

| 步 | 结果 | 结论 |
|---|---|---|
| 1 | IP 对 | 过 |
| 2 | `ssh` 能进 | 过（说明机器活着） |
| 3 | 能进 | 过 |
| 4 | `pm2 list` online | 过 |
| 5 | `curl 127.0.0.1:3000` = 200 | 过 |
| 6 | nginx active | 过 |
| 7 | `nginx -t` 通过 | 过 |
| 8 | `curl -I 127.0.0.1` = 200 | 过 |

**八步全过，但浏览器打不开。**

**这说明什么：**

```text
问题不在服务器内部（内部全通），
在"从外面到服务器"这一段 —— 也就是安全组。
```

**这正是八步法的价值：** 它把"服务器内部"和"网络入口"分开了。

**修：** 把 80 规则加回去。

**⚠️ 加回去的时候注意：**

```text
协议 TCP
端口 80
来源 0.0.0.0/0
```

**加完立刻生效，不用重启服务器。**

## 3.2 演练 B：制造 502（模拟程序挂了）

**操作：**

```bash
pm2 stop chat-app
```

**浏览器刷新：**

```text
502 Bad Gateway
nginx/1.18.0 (Ubuntu)
```

**按八步走：**

| 步 | 结果 | 结论 |
|---|---|---|
| 4 | `pm2 list` 是 `stopped` | **停在这一步** |

**不用看第 5 步之后的任何东西。**

**日志证据：**

```bash
tail -2 /var/log/nginx/error.log
```

```text
[error] ... connect() failed (111: Connection refused) while connecting to upstream, ... upstream: "http://127.0.0.1:3000/"
```

**修：**

```bash
pm2 start chat-app
```

**验证：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

```text
200
```

## 3.3 演练 C：制造 404（模拟 `server_name` 配错）

**操作：**

1. 备份配置：

```bash
cp /etc/nginx/sites-available/chat-app /etc/nginx/sites-available/chat-app.bak
```

2. 改 `server_name`：

```bash
sed -i 's/server_name _;/server_name wrong-domain.com;/' /etc/nginx/sites-available/chat-app
```

3. 检查并重载：

```bash
nginx -t && systemctl reload nginx
```

**浏览器刷新：**

```text
404 Not Found
nginx/1.18.0 (Ubuntu)
```

**按八步走：**

| 步 | 结果 | 结论 |
|---|---|---|
| 7 | `nginx -t` 通过 | 过 |
| 8 | `curl -I 127.0.0.1` = **404** | **停在这一步** |

**为什么 `nginx -t` 通过但 404：**

```text
配置语法没问题（所以 -t 过），
但逻辑上：Host 是 47.98.xx.xx，你的 server_name 是 wrong-domain.com，
匹配不上，default 又被删了，没有任何 server 能接 → 404。
```

**怎么快速确认是这个问题：**

```bash
curl -I -H "Host: wrong-domain.com" http://127.0.0.1
```

**应该看到：**

```text
HTTP/1.1 200 OK
X-Powered-By: Express
```

**这一招很重要：**

```text
用 -H "Host: xxx" 手动指定 Host 头，
可以验证"到底是 server_name 匹配的问题，还是别的问题"。
```

**修：**

```bash
cp /etc/nginx/sites-available/chat-app.bak /etc/nginx/sites-available/chat-app
nginx -t && systemctl reload nginx
curl -I http://127.0.0.1
```

## 3.4 演练 D（可选）：制造 500

**操作：**

```bash
mv /srv/app/.env /srv/app/.env.bak
pm2 restart chat-app
```

**浏览器：**

```text
500 Internal Server Error
```

**按八步走：**

| 步 | 结果 | 结论 |
|---|---|---|
| 4 | online | 过 |
| 5 | `curl 127.0.0.1:3000` = **500** | **停在这一步** |

**看日志：**

```bash
pm2 logs chat-app --lines 30 --nostream
```

```text
0|chat-app | [dotenv@16.4.5] injecting env (0) from .env
0|chat-app | Error: getaddrinfo ENOTFOUND undefined
```

**修：**

```bash
mv /srv/app/.env.bak /srv/app/.env
pm2 restart chat-app
```

---

# 第 4 步：写 `deploy.sh`（30 分钟）

## 4.1 为什么需要脚本

**现在发布一个版本，你要敲：**

```bash
ssh myserver
cd /srv/app
git pull
npm ci
pm2 restart chat-app
pm2 save
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

**六条命令。** 一天发三次，就是十八次输入。

**漏一条会怎样：**

```text
漏 git pull     → 发的还是旧代码
漏 npm ci       → 缺新依赖，启动就崩
漏 restart      → 内存里还是旧代码
漏 save         → 重启服务器回退到旧版本
漏 curl         → 不知道发布成功没有
```

**脚本的作用：把这六条固定下来，并且加上"失败就回滚"。**

## 4.2 脚本要做什么

```text
① 记下当前 commit（回滚的锚点）
② git pull（只允许快进，不允许合并）
③ npm ci（按 lock 装依赖）
④ pm2 restart（加载新代码）
⑤ pm2 save（记住新状态）
⑥ 健康检查（循环重试，给程序启动时间）
⑦ 失败 → git reset 回旧 commit → 重装 → 重启 → 报错退出
```

## 4.3 在本地写，还是服务器上写

**在本地写，提交进仓库。**

**为什么：**

```text
① 有版本记录，改坏了能回退
② 换服务器时 clone 下来就有
③ 团队里每个人用同一份
```

**但注意：**

```text
脚本里绝对不能写密码、密钥。
它只会用到 git / npm / pm2 / curl，全都不需要密码。
```

**路径：**

```text
chat-app/
├── deploy.sh            ← 放仓库根目录
├── package.json
├── server.js
└── ...
```

**部署到服务器后就是 `/srv/app/deploy.sh`。**

## 4.4 写脚本

**在本地项目根目录新建 `deploy.sh`：**

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/srv/app
APP_NAME=chat-app
HEALTH_URL=http://127.0.0.1:3000/api/health

cd "$APP_DIR"

PREV=$(git rev-parse HEAD)
echo "[1/5] 当前版本: $PREV"

echo "[2/5] 拉取代码"
git pull --ff-only

echo "[3/5] 安装依赖"
npm ci --no-audit --no-fund

echo "[4/5] 重启服务"
pm2 restart "$APP_NAME" --update-env
pm2 save

echo "[5/5] 健康检查"
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)
  if [ "$code" = "200" ]; then
    echo "发布成功，HTTP $code"
    exit 0
  fi
  echo "第 $i 次检查: HTTP $code"
  sleep 2
done

echo "健康检查失败，回滚到 $PREV"
git reset --hard "$PREV"
npm ci --no-audit --no-fund
pm2 restart "$APP_NAME" --update-env
pm2 save
exit 1
```

## 4.5 逐行读

| 行 | 意思 | 为什么 |
|---|---|---|
| `#!/usr/bin/env bash` | 用 bash 执行 | 不用 `sh`，因为要用 `pipefail` |
| `set -euo pipefail` | **三条保险** | 见下面逐条拆 |
| `APP_DIR=/srv/app` | 变量 | 换路径只改一处 |
| `cd "$APP_DIR"` | 进目录 | **不 cd 就会在错误目录跑** |
| `PREV=$(git rev-parse HEAD)` | 记下当前 commit | 回滚要用 |
| `git pull --ff-only` | 只允许快进 | 防止自动合并出冲突 |
| `npm ci` | 按 lock 装 | 不用 install |
| `pm2 restart --update-env` | 重启并重读环境变量 | **不带 `--update-env` 可能还用旧 env** |
| `pm2 save` | 存状态 | 否则重启服务器回退 |
| `for i in $(seq 1 10)` | 最多试 10 次 | 给程序启动时间 |
| `curl ... \|\| true` | 失败也不退出 | **因为 `set -e` 会让脚本中断** |
| `sleep 2` | 等 2 秒 | 共 20 秒窗口 |
| `git reset --hard "$PREV"` | 回到旧版本 | **⚠️ 会丢掉服务器上的本地改动**（本来就不该有） |

**`set -euo pipefail` 拆开：**

```text
-e   任何一条命令失败（非 0 退出），脚本立刻停
-u   用了未定义的变量就报错（防止 APP_DIR 拼错变成空，cd 到根目录）
-o pipefail  管道里任何一段失败，整条就算失败
```

**为什么 `-e` 这么重要：**

```text
没有 -e：
  npm ci 失败了 → 脚本继续 → pm2 restart（用旧的 node_modules）→ 健康检查可能还过 → 你以为发布成功了

有 -e：
  npm ci 失败 → 立刻停 → 你知道"这次没发出去"
```

**这是"发布脚本"和"一串命令"的根本区别。**

## 4.6 一个必须有的健康检查接口

**脚本里用了 `/api/health`。你的程序里要有这个路由：**

```js
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() })
})
```

**为什么不能用 `/` 当健康检查：**

```text
① 首页可能是静态文件，程序挂了 nginx 还能从缓存给
② 首页可能很慢（要查数据库）
③ 首页可能返回 200 但业务逻辑已经坏了
```

**健康检查要满足三条：**

```text
① 快（不查外部 API）
② 只要程序活着就一定 200
③ 路径固定，不会被前端路由抢走
```

## 4.7 上传并给执行权限

**本地：**

```bash
git add deploy.sh
git commit -m "add: 部署脚本"
git push
```

**服务器：**

```bash
cd /srv/app
git pull
chmod +x deploy.sh
ls -l deploy.sh
```

**应该看到：**

```text
-rwxr-xr-x 1 root root 1204 Nov 16 14:30 deploy.sh
```

**`x` 就是可执行。**

**⚠️ 忘了 `chmod +x` 会怎样：**

```text
bash: ./deploy.sh: Permission denied
```

**另一个办法（不用 chmod）：**

```bash
bash deploy.sh
```

**但推荐 `chmod +x`，这样 `./deploy.sh` 就能跑。**

## 4.8 跑一次

```bash
cd /srv/app
./deploy.sh
```

**应该看到：**

```text
[1/5] 当前版本: a1b2c3d4e5f6...
[2/5] 拉取代码
Already up to date.
[3/5] 安装依赖
added 132 packages, and audited 133 packages in 8s
found 0 vulnerabilities
[4/5] 重启服务
[PM2] Applying action restartProcessId on app [chat-app](ids: [ 0 ])
[PM2] [chat-app](0) ✓
[PM2] Saving current process list...
[PM2] Successfully saved in /root/.pm2/dump.pm2
[5/5] 健康检查
发布成功，HTTP 200
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `当前版本` | 回滚锚点 |
| `Already up to date.` | 没有新提交（正常） |
| `added 132 packages` | 依赖重装了（`ci` 每次都全删重装） |
| `Applying action restartProcessId` | pm2 在重启 |
| `✓` | 成功 |
| `Successfully saved` | dump 文件更新了 |
| `发布成功，HTTP 200` | 健康检查通过 |

**注意 `npm ci` 每次都重装：**

```text
它会先删 node_modules 再装。
132 个包，8 秒。
这是"可重复"的代价，值得。
```

---

# 第 5 步：回滚演练（20 分钟）

## 5.1 造一个坏版本

**在本地：**

1. 打开 `server.js`；
2. 在 `/api/health` 里故意写一个错误：

```js
app.get('/api/health', (req, res) => {
  throw new Error('故意的故障')
})
```

3. 提交并推送：

```bash
git add server.js
git commit -m "测试：故意弄坏健康检查"
git push
```

## 5.2 发布它

**在服务器上：**

```bash
cd /srv/app
./deploy.sh
```

**应该看到：**

```text
[1/5] 当前版本: a1b2c3d...
[2/5] 拉取代码
Updating a1b2c3d..f9e8d7c
Fast-forward
 server.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
[3/5] 安装依赖
added 132 packages, and audited 133 packages in 8s
[4/5] 重启服务
[PM2] [chat-app](0) ✓
[5/5] 健康检查
第 1 次检查: HTTP 500
第 2 次检查: HTTP 500
第 3 次检查: HTTP 500
...
第 10 次检查: HTTP 500
健康检查失败，回滚到 a1b2c3d...
HEAD is now at a1b2c3d 第216节课：配置 Nginx
added 132 packages, and audited 133 packages in 8s
[PM2] [chat-app](0) ✓
```

**注意最后几行：**

```text
它自己退回去了。
exit code 是 1（脚本失败）。
```

**验证：**

```bash
echo $?
```

```text
1
```

**再看版本：**

```bash
git log -1 --oneline
```

```text
a1b2c3d (HEAD -> main) 第216节课：配置 Nginx
```

**回到了旧版本。**

**再验证服务：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health
```

```text
200
```

**⚠️ 但这里有个坑：**

```text
git reset --hard 只改了"服务器上的文件"。
远程仓库（GitHub）上还是坏版本。
所以你下次 git pull 会又拉下来。
```

**正确的处理：**

```text
① 本地 git revert 那个坏提交，push
② 或者在本地修好，push 一个新提交
```

**回滚的是"服务器"，不是"仓库"。**

## 5.3 手动回滚（脚本不管用的时候）

**场景：** 脚本自己挂了 / 你要回到更早的版本。

```bash
cd /srv/app
git log --oneline -5
```

**应该看到：**

```text
f9e8d7c (origin/main, origin/HEAD) 测试：故意弄坏健康检查
a1b2c3d (HEAD -> main) 第216节课：配置 Nginx
9b8a7c6 第215节课：pm2 常驻
...
```

**回退到 `a1b2c3d`：**

```bash
git reset --hard a1b2c3d
```

```text
HEAD is now at a1b2c3d 第216节课：配置 Nginx
```

**⚠️ 关键：必须重启，否则内存里还是新代码。**

```bash
pm2 restart chat-app
pm2 save
```

**验证：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health
```

**⚠️ `git reset --hard` 会丢掉服务器上所有未提交的改动。**

**规则：服务器上不该有任何未提交的改动。** 如果有，说明你在服务器上直接改代码了 —— 这是错的。

**检查：**

```bash
git status --short
```

**应该是空的。**

## 5.4 把坏版本从仓库里清掉

**本地：**

```bash
git revert f9e8d7c --no-edit
git push
```

**`revert` 和 `reset` 的区别（第 4 周讲过，这里再用一次）：**

```text
reset  改历史（只能在自己机器上、没人拉过时用）
revert 生成一个"反向提交"，历史保留，安全
```

**服务器上再跑一次：**

```bash
./deploy.sh
```

**这次应该成功。**

---

# 第 6 步：写一页 RUNBOOK（20 分钟）

## 6.1 什么是 RUNBOOK

**大白话：一张"出事了照着念"的纸。**

**它不是给客户看的，是给你自己凌晨三点看的。**

## 6.2 结构

**在 `03-练习代码/` 里新建 `RUNBOOK.md`：**

```markdown
# chat-app 运维手册

## 这台机器

| 项目 | 值 |
|---|---|
| IP | 47.98.xx.xx |
| 系统 | Ubuntu 22.04 |
| 配置 | 2 核 2G |
| 代码目录 | /srv/app |
| 应用名 | chat-app |
| 端口 | 127.0.0.1:3000 |
| 域名 | 暂无（第 32 周加） |
| 到期日 | 2026-xx-xx |

## 五条最常用的命令

```bash
ssh myserver
cd /srv/app && ./deploy.sh
pm2 list
pm2 logs chat-app --lines 50 --nostream
tail -20 /var/log/nginx/error.log
```

## 网站打不开

按顺序走，不要跳：

| 步 | 命令 | 通过 |
|---|---|---|
| 1 | `ping 47.98.xx.xx` | 有回应（不通也可能是禁 ICMP） |
| 2 | `ssh myserver` | 有提示符 |
| 3 | `pm2 list` | online，↺ 不涨 |
| 4 | `curl 127.0.0.1:3000` | 200 |
| 5 | `systemctl status nginx` | active |
| 6 | `nginx -t` | ok |
| 7 | `curl -I 127.0.0.1` | 200 + X-Powered-By |

## 常见症状对照

| 症状 | 先查 | 命令 |
|---|---|---|
| 浏览器超时 | 安全组 80 | 控制台 |
| 404 | server_name | `nginx -T \| grep server_name` |
| 502 | 程序 | `pm2 list` |
| 500 | 程序日志 | `pm2 logs --err` |
| 504 | 程序太慢 | `pm2 logs`、模型 API |

## 回滚

```bash
cd /srv/app
git log --oneline -5
git reset --hard <上一个好的 commit>
npm ci --no-audit --no-fund
pm2 restart chat-app --update-env
pm2 save
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health
```

## 我绝对不能做的事

```text
❌ 在服务器上直接改代码（要改在本地，走 git）
❌ 把 .env 提交到仓库
❌ 在安全组开 3000 / 3306
❌ 不 nginx -t 就 reload
❌ 在服务器上跑 rm -rf
```

## 出事找谁

```text
第一阶段：我自己
第二阶段：云厂商工单（服务器本身的问题）
第三阶段：（还没有客户，先不用写）
```
```

## 6.3 为什么现在就写

**因为现在你还记得。**

```text
三个月后你会忘记：
- 应用叫什么名字
- 日志在哪
- 回滚要几条命令
```

**RUNBOOK 是"给未来的自己写的一封信"。**

**第 32 周会把它扩充成完整版（加监控、备份、续费）。**

---

# 第 7 步：算一次成本（10 分钟）

**客户问你"一个月多少钱"，你要当场报出来。**

| 项目 | 单价 | 用量 | 月成本 |
|---|---|---|---|
| 服务器（2 核 2G） | 80 元/月 | 1 台 | 80 元 |
| 域名 | 80 元/年 | 1 个 | 约 7 元 |
| SSL 证书 | 免费 | — | 0 元 |
| 备份（对象存储） | 0.1 元/GB | 1 GB | 0.1 元 |
| **模型调用** | 按 token | 看用量 | **几十到几百** |
| **合计（不含模型）** | | | **约 87 元/月** |

**逐行读：**

| 行 | 你要能说什么 |
|---|---|
| 服务器 | "2 核 2G 撑几十个用户，80 一个月" |
| 域名 | "一年八十，摊到每月七块" |
| 证书 | "免费的，别买几百块的" |
| 备份 | "几毛钱，但能救命" |
| **模型** | **"这个按量算，要单独报价"** |

**报价必须分开三笔：**

```text
① 开发费（一次性）
② 服务器 + 域名（每月固定，约 90）
③ 模型费（按量，谁用谁付）
```

**第三条最容易扯皮。** 你不说清，最后就是自己吃。

**算一次模型费（假设）：**

```text
每天 200 次对话
每次输入 800 token，输出 300 token
一个月 30 天

输入：200 × 30 × 800 = 4.8 百万 token
输出：200 × 30 × 300 = 1.8 百万 token

假设 输入 1 元/百万，输出 3 元/百万：
4.8 × 1 + 1.8 × 3 = 10.2 元
```

**注意：**

```text
如果每次带 20 条历史，输入会翻 5—10 倍。
月成本可能变成 50—100 元。
```

**这就是为什么"钱要花在 token 上，不是核数上"这句话要反过来说：**

```text
省下来的服务器钱，可能还不够多带几条历史。
```

---

# 第 8 步：故意犯七个错（30 分钟）

## 错误 1：脚本没写 `set -e`

**操作：**

把 `deploy.sh` 改成：

```bash
#!/usr/bin/env bash
cd /srv/app
git pull --ff-only
npm ci
pm2 restart chat-app
```

（删掉 `set -euo pipefail`）

**然后制造一个 `npm ci` 失败：**

```bash
# 临时把 package-lock.json 改名
mv package-lock.json package-lock.json.bak
./deploy.sh
```

**会怎样：**

```text
Already up to date.
npm ERR! The `npm ci` command can only install with an existing package-lock.json
...
[PM2] Applying action restartProcessId on app [chat-app](ids: [ 0 ])
[PM2] [chat-app](0) ✓
```

**注意：`npm ci` 失败了，但脚本继续跑了，还重启了服务。**

**后果：**

```text
node_modules 还是旧的（可能缺新依赖）
但服务被重启了
你看到"重启成功"，以为发布成功
实际上线上跑的是一个"半新半旧"的状态
```

**为什么：**

```text
没有 -e，shell 不看退出码，一条失败就继续下一条。
```

**怎么修：**

```bash
mv package-lock.json.bak package-lock.json
```

**加回 `set -euo pipefail`。**

## 错误 2：服务器上有本地改动，`git pull` 冲突

**操作：**

```bash
cd /srv/app
echo "// 我随手加的" >> server.js
./deploy.sh
```

**会怎样：**

```text
[1/5] 当前版本: a1b2c3d...
[2/5] 拉取代码
error: Your local changes to the following files would be overwritten by merge:
	server.js
Please commit your changes or stash them before you merge.
Aborting
```

**然后脚本因为 `set -e` 停在第二步。**

**为什么：**

```text
git pull 要更新 server.js，
但你有未提交的改动，
git 不敢覆盖（怕丢你的东西）。
```

**怎么修：**

```bash
git checkout -- server.js
git status --short
./deploy.sh
```

**⚠️ `git checkout -- 文件名` 会丢掉你的改动，且不可恢复。**

**更重要的教训：**

```text
服务器上不该有任何本地改动。
如果你需要改代码，在本地改，走 git。
```

**如果确实是紧急修复：**

```bash
# 在服务器上改完，先提交
git add -A
git commit -m "hotfix: 紧急修复"
# 然后立刻在本地 pull 回来，保持同步
```

**⚠️ 这是"例外"，不是"流程"。** 每次 hotfix 都要补一次"本地同步"，否则下次部署必冲突。

## 错误 3：回滚后忘了 restart

**操作：**

```bash
cd /srv/app
git reset --hard a1b2c3d
```

**然后直接刷新浏览器。**

**会怎样：**

**还是坏的那个页面。**

**为什么：**

```text
git reset 改的是硬盘上的文件。
Node 进程内存里跑的还是旧代码（坏的那个）。
```

**验证：**

```bash
pm2 list
```

**看 `↺` 没有变化，`uptime` 还是很久之前。**

**怎么修：**

```bash
pm2 restart chat-app
pm2 save
```

**规则：**

```text
任何改动代码文件的操作之后，都要 pm2 restart。
git pull / git reset / 手动编辑，都一样。
```

## 错误 4：健康检查用了公网地址

**操作：**

把脚本里的：

```bash
HEALTH_URL=http://127.0.0.1:3000/api/health
```

改成：

```bash
HEALTH_URL=http://47.98.xx.xx/api/health
```

**会怎样：**

**多数时候能通。但某天：**

```text
① 安全组 80 被临时关了 → 健康检查失败 → 误回滚
② 域名还没备案，用域名访问被拦 → 误回滚
③ nginx 挂了但程序好的 → 误回滚（其实不该回滚）
```

**为什么：**

```text
健康检查要回答的问题是"我的程序活着吗"。
用公网地址，它回答的是"整条链路通吗"。
这两个问题不一样。
```

**规则：**

```text
健康检查只查 127.0.0.1:3000。
整条链路用浏览器/curl 单独验。
```

**这一条和第 2 步的第 5 步是同一个道理：**

```text
先把"程序本身"和"链路"分开。
```

## 错误 5：忘了 `chmod +x`

**操作：**

```bash
git pull    # 拉下来一个新的 deploy.sh
./deploy.sh
```

**会怎样：**

```text
bash: ./deploy.sh: Permission denied
```

**为什么：**

```text
git 不保存"可执行位"以外的权限，但它确实保存 x 位。
如果你的文件在本地就没有 x 位，push 上去也没有。
Windows 上尤其容易丢（Windows 没有这个概念）。
```

**怎么修：**

```bash
chmod +x deploy.sh
```

**长期解法：**

```bash
git update-index --chmod=+x deploy.sh
git commit -m "chmod: deploy.sh 可执行"
git push
```

**`git update-index --chmod=+x` 是什么：** 在 git 索引里把文件标记成可执行，这样 clone 下来就有 x 位。

**这也是 Windows 用户的常见坑：** 在 Windows 上 commit 的 `.sh` 文件，到了 Linux 经常没有执行权限。

## 错误 6：把密码写进脚本

**操作：**

```bash
git clone https://用户名:密码@github.com/xxx/chat-app.git
```

或者：

```bash
export DB_PASSWORD=abc123
```

**会怎样：**

**第一种：密码进了 `.git/config` 和 shell 历史。**

```bash
cat .git/config
```

```text
[remote "origin"]
	url = https://用户名:密码@github.com/xxx/chat-app.git
```

**第二种：密码进了 `deploy.sh`，然后被提交到仓库。**

**后果：**

```text
① 任何人看到仓库就看到密码
② 密码改一次，所有脚本都要改
③ 一旦泄露，你要改的不是一行代码，是"所有用过这个密码的地方"
```

**怎么修：**

```text
① 用 SSH key 或 PAT（不进 URL）
② 密钥放 .env，脚本只读环境变量
③ 如果真的写进去了：
   - 立刻改密码
   - git rm --cached 那个文件
   - 检查 git 历史
```

**规则：**

```text
脚本里只允许出现"变量名"，不允许出现"值"。
```

## 错误 7：健康检查只查一次

**操作：**

把循环改成：

```bash
code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")
if [ "$code" != "200" ]; then
  echo "失败，回滚"
  ...
fi
```

**会怎样：**

**重启后程序需要 1—3 秒才能开始监听。**

**你立刻 curl，得到：**

```text
000
```

**然后脚本判定"失败"，把刚发布的版本回滚了。**

**明明代码没问题。**

**为什么：**

```text
pm2 restart 返回时，进程刚被创建，还没 listen。
curl 立刻打过去 → 连接被拒 → 000
```

**怎么修：**

```bash
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)
  [ "$code" = "200" ] && break
  sleep 2
done
if [ "$code" != "200" ]; then
  # 回滚
fi
```

**这就是"重试"的价值：**

```text
它容忍"启动需要时间"，但不容忍"一直起不来"。
20 秒的窗口，足够一个 Express 应用启动。
```

**判断标准：**

```text
如果 20 秒还没起来，多半是真的起不来了。
```

---

# 第 9 步：写学习笔记（10 分钟）

```markdown
# 第 217 节课学习笔记

## 一、八步排查法

| 步 | 查什么 | 命令 | 通过标准 |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |

为什么从外往里：

第 4 步和第 5 步把什么问题分开了：

## 二、三次演练

| 演练 | 我制造的现象 | 停在第几步 | 修法 |
|---|---|---|---|
| A 关 80 | | | |
| B pm2 stop | | | |
| C server_name | | | |

演练 A 特别在哪（八步全过但打不开）：

## 三、`deploy.sh`

`set -euo pipefail` 三个字母各是什么意思：

| 字母 | 意思 | 不写会怎样 |
|---|---|---|
| e | | |
| u | | |
| pipefail | | |

为什么 `git pull` 要用 `--ff-only`：

为什么健康检查循环要重试：

为什么健康检查不用公网地址：

## 四、回滚

脚本自动回滚时，我看到的输出（关键几行）：

手动回滚的五条命令：

1.
2.
3.
4.
5.

`reset` 和 `revert` 的区别：

回滚之后为什么必须 restart：

## 五、成本和报价

| 项目 | 月成本 |
|---|---|
| 服务器 | |
| 域名 | |
| 证书 | |
| 模型 | |

报价要分哪三笔：

## 六、七个错误的后果

| 错误 | 现象 | 怎么修 |
|---|---|---|
| 没 set -e | | |
| 服务器有本地改动 | | |
| 回滚不 restart | | |
| 健康检查用公网 | | |
| 没 chmod +x | | |
| 密码写进脚本 | | |
| 只查一次 | | |

## 七、RUNBOOK

我的 RUNBOOK 放在：

里面写了哪几块：

## 八、卡在哪

## 九、我还不懂的词

-

## 十、完成检查

- [ ] 浏览器打开 IP 是我的应用
- [ ] 我能背出八步的前四步
- [ ] `./deploy.sh` 能跑通
- [ ] 我体验过一次"自动回滚"
- [ ] 我有 RUNBOOK.md
```

---

# 第 10 步：课后练习

## 练习一：把八步表做成真正的卡片

**要求：**

1. 把第 2.10 节的表抄到一张 A4 纸上（或者 `RUNBOOK.md` 里）；
2. 不看课件，从第 1 步走到第 8 步；
3. 每一步都真的敲命令。

**记录：** 哪一步你卡住了？为什么？

**思考题：** 如果第 5 步是 500，你会去查第 6 步吗？

## 练习二：制造 504

**要求：**

1. 在 `server.js` 里加一个故意很慢的接口：

```js
app.get('/slow', async (req, res) => {
  await new Promise(r => setTimeout(r, 120000))
  res.send('done')
})
```

2. 发布；
3. 浏览器访问 `/slow`，等。

**记录：** 多久之后出现 504？`error.log` 里写了什么？

**思考题：** 504 是 nginx 的问题还是程序的问题？

## 练习三：给 `deploy.sh` 加"发布记录"

**要求：**

在脚本最后加一段，把"发布时间 / commit / 结果"追加到一个文件：

```bash
echo "$(date '+%F %T') $PREV $(git rev-parse HEAD) OK" >> /srv/app/deploy.log
```

**记录：** 跑三次，看文件里有几行。

**思考题：** 这个文件该不该进 git？为什么？

## 练习四：只回滚不重装

**要求：**

1. 记下当前 commit；
2. 把 `server.js` 改坏；
3. 只做 `git reset --hard <旧commit>` + `pm2 restart`，**不跑 `npm ci`**；
4. 看能不能恢复。

**记录：** 能恢复吗？为什么？

**思考题：** 什么情况下"只回滚代码不重装依赖"会出问题？

## 练习五：算一次真实报价

**要求：**

假设客户要"50 人用，每人每天 20 次对话，每次带 10 条历史"。

1. 估算 token 用量；
2. 算服务器 + 域名；
3. 写一份三行报价。

**记录：** 你的三行报价。

**思考题：** 如果客户说"太贵了"，你能砍哪一项？不能砍哪一项？

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能按顺序说出八步排查法
- [ ] 我知道为什么从外往里查
- [ ] 我知道第 5 步把"代码问题"和"配置问题"分开了
- [ ] 我知道 502 / 504 / 500 / 404 各该查哪里
- [ ] 我知道 `reset` 和 `revert` 的区别

## B. 实操

- [ ] 浏览器打开 `http://47.98.xx.xx` 是我的应用
- [ ] `./deploy.sh` 能一次跑通
- [ ] 我制造过一个坏版本，看它自动回滚
- [ ] 我手动回滚过一次（`git reset --hard` + `pm2 restart`）
- [ ] 我能在 `access.log` 里找到自己的访问
- [ ] 我能在 `pm2 logs` 里看到启动记录

## C. 排错

- [ ] 八步里每一步不通过，我都知道下一步查什么
- [ ] 我知道 `set -e` 不写会导致"假发布成功"
- [ ] 我知道服务器上有本地改动会让 `git pull` 失败
- [ ] 我知道健康检查为什么要循环
- [ ] 我知道 502 时看 `error.log` 的哪一行

## D. 交付

- [ ] `03-练习代码/deploy.sh`
- [ ] `03-练习代码/RUNBOOK.md`
- [ ] `02-笔记/NOTES.md` 填完
- [ ] 一个能发给别人的 IP

## E. 笔记

- [ ] 八步表抄全了
- [ ] 三次演练的真实输出记了
- [ ] 回滚前后的 `git log` 记了
- [ ] 「卡在哪」写了真实内容

## 本节课要能说出口的一句话

> **网站打不开，不是"再试一次"，是按八步从外往里走，每一步只回答一个是/否；而发布不是"敲六条命令"，是一条自带回滚的脚本 —— 发不出去，就退回来。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 浏览器超时 | 安全组 80 没开 | 控制台加规则 |
| `Welcome to nginx!` | default 站点还在 | `unlink` 后 reload |
| `404` | `server_name` 不匹配 | 改成 `_` 或正确域名 |
| `502` | 程序没跑 / 端口不对 | `pm2 list`、`ss -lntp` |
| `504` | 程序太慢 | 看 `$request_time`，加超时 |
| `500` | 程序报错 | `pm2 logs --err` |
| `./deploy.sh: Permission denied` | 没 `chmod +x` | `chmod +x deploy.sh` |
| `git pull` 报 `local changes would be overwritten` | 服务器有本地改动 | `git checkout -- .`，改在本地做 |
| 发布后还是旧页面 | 没 restart / 浏览器缓存 | `pm2 restart`、`Ctrl+F5` |
| 回滚后还是坏页面 | 没 restart | `pm2 restart` + `pm2 save` |
| 脚本失败但服务被重启了 | 没 `set -e` | 加上 |
| 健康检查老失败但网站好的 | 用了公网地址 | 改 `127.0.0.1:3000` |
| 健康检查一次就判失败 | 没重试 | 加循环 + `sleep` |
| `pm2 list` 是 online 但 502 | `↺` 在涨，启动就崩 | `pm2 logs --err` |
| 服务器重启后网站挂了 | 没 `pm2 save` / `startup` | 回第 215 节补 |
| 磁盘满了 | 日志/依赖堆积 | `df -h`、`du -sh /var/log/*` |
| 想改端口 | 要同时改 `server.js` + nginx + 安全组 | 这一周别改 |
