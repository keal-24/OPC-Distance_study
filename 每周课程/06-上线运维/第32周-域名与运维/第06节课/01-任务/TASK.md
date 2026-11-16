# 第 223 节课：日志、成本、续费——三张表

> 前五节你让网站能开、有锁、有备份、有告警。这一节处理三件"平时不显眼、出事就要命"的事：
> **出问题时去哪儿看（日志）、一个月到底花多少钱（成本）、什么时候会突然消失（续费）。**

**建议用时**：120 分钟
**你需要先完成**：第 222 节课（UptimeRobot 在监控，停服务能收到告警）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
网站能开             https://your-domain.com
有锁                 证书 89 天
有健康检查           /health 返回 503
有备份               每天 3 点
有监控               挂了会发邮件
```

**遇到下面这些问题，你还答不上来：**

```text
昨天下午三点，有没有人访问过 /admin？
这个月服务器 + 域名 + 模型，一共花了多少？
域名什么时候到期？
磁盘为什么只剩 2G？
```

## 0.2 你以后会遇到什么

```text
① 客户说"我昨天下的单没了"，你要查日志，但不知道日志在哪
② 服务器突然 500，登录一看磁盘 100%，日志文件 18G
③ 月底账单一来，发现模型费是你预估的 6 倍
④ 某天早上域名打不开，因为昨天到期了，而你完全没印象
⑤ 你给客户报价 3000 元，结果第一个月服务器+模型就花了 800
```

**这五件事，全部是"没有表"造成的。**

```text
没有日志表      → 出事只能猜
没有成本表      → 报价靠感觉，亏了才知道
没有续费清单    → 到期靠记忆，忘了就消失
```

## 0.3 今天要建立的三个概念

```text
① 日志是"事后唯一的证据"，但它会自己长胖，必须有人管
② 成本要拆成三笔：开发费、固定成本、按量成本（模型）
③ 续费不是"记性"问题，是"流程"问题
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `日志速查.md` | `03-练习代码/` | 日志位置 + 五条常用命令 + 真实输出 |
| `成本表.md` | `03-练习代码/` | 单价 × 用量 = 月成本，含模型费公式和算例 |
| `续费清单.md` | `03-练习代码/` | 项目 / 到期日 / 价格 / 提前提醒 |
| `NOTES.md` | `02-笔记` | 学习记录 |

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **服务器**（看日志、算磁盘）**+ 你的 Windows**（算成本、写续费清单）。 |
| **用哪个终端** | **Git Bash → SSH 到服务器** + **Git Bash 本地**（写表格）。 |
| **现在在哪个目录** | <code>ssh root@你的服务器IP</code> |
| **本节新建什么** | `成本表.md`（服务器 + 域名 + 证书 + 模型费四笔）<br>`续费清单.md`（域名、服务器、证书三个到期日） |

## 开工前先跑这一条

确认你没站错地方：

```bash
sudo du -sh /var/log/nginx/ 2>/dev/null; echo "---"; df -h / | tail -1
```

**应该看到：**

```text
86M     /var/log/nginx/
---
/dev/vda1        40G  5.2G   33G  14% /
```

**如果 `/var/log` 超过 1GB**，说明 logrotate 没配好或根本没生效。这一节第 6 步会处理。

## 如果不对

**`/var/log/nginx/` 不存在** → nginx 日志位置不一样，`sudo find /var/log -name '*access*'` 找一下。

**`df` 显示根分区快满了（超过 85%）** → 先清日志，不然网站会全站 500。

---

# 第 1 步：先找到日志在哪（20 分钟）

## 1.1 一个请求会留下三份记录

```text
用户请求
   ↓
Nginx               → /var/log/nginx/access.log（谁来了）
                    → /var/log/nginx/error.log（Nginx 自己出错了）
   ↓
Node (pm2)          → ~/.pm2/logs/my-app-out.log（应用打印的）
                    → ~/.pm2/logs/my-app-error.log（应用崩了）
   ↓
PostgreSQL          → /var/log/postgresql/postgresql-14-main.log（数据库）
```

**三份日志各有各的用途：**

| 想知道什么 | 看哪份 |
|---|---|
| 有没有人来过、来的哪个 URL、返回什么状态码 | Nginx `access.log` |
| Nginx 转发失败、配置报错 | Nginx `error.log` |
| 我的代码里 `console.log` 打了什么 | pm2 `out.log` |
| 我的代码抛异常了 | pm2 `error.log` + Sentry |
| 数据库慢查询 / 连接失败 | PostgreSQL 日志 |

## 1.2 看 Nginx 日志

```bash
ls -lh /var/log/nginx/
```

**应该看到：**

```text
total 2.1M
-rw-r----- 1 www-data adm  184K Nov 16 14:32 access.log
-rw-r----- 1 www-data adm  1.2M Nov 16 14:30 error.log
-rw-r----- 1 www-data adm  312K Nov  9 03:12 access.log.1
-rw-r----- 1 www-data adm   98K Nov  9 03:12 error.log.1
-rw-r----- 1 www-data adm   44K Nov  2 03:12 access.log.2.gz
```

**逐列读：**

| 列 | 意思 | 说明 |
|---|---|---|
| `-rw-r-----` | 权限 | 所有者读写，同组只读，其他人不能碰 |
| `www-data adm` | 所有者和组 | Nginx 以 `www-data` 运行 |
| `184K` | 大小 | —— |
| `Nov 16 14:32` | 最后修改时间 | **接近现在 = 有流量** |
| `access.log` | 当前日志 | 正在写 |
| `access.log.1` | 上一份（轮转出来的） | 数字越大越旧 |
| `access.log.2.gz` | 更旧的，已压缩 | `.gz` = gzip |

**⚠️ 看到 `.1` 和 `.gz` 说明 logrotate 已经在工作了。**

```text
如果只有 access.log 一个文件，而且特别大，说明轮转没生效。
第 3 步会讲。
```

**看最后 10 行：**

```bash
sudo tail -10 /var/log/nginx/access.log
```

**应该看到：**

```text
47.98.xx.xx - - [16/Nov/2026:14:30:02 +0800] "GET /chat HTTP/1.1" 200 5314 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
47.98.xx.xx - - [16/Nov/2026:14:30:15 +0800] "POST /api/chat HTTP/1.1" 200 218 "-" "Mozilla/5.0 ..."
47.98.xx.xx - - [16/Nov/2026:14:30:16 +0800] "GET /favicon.ico HTTP/1.1" 404 153 "https://your-domain.com/chat" "Mozilla/5.0 ..."
```

## 1.3 逐字段读一行 access.log

**上面第一行拆开：**

```text
47.98.xx.xx - - [16/Nov/2026:14:30:02 +0800] "GET /chat HTTP/1.1" 200 5314 "-" "Mozilla/5.0 ..."
```

| 字段 | 值 | 意思 |
|---|---|---|
| `$remote_addr` | `47.98.xx.xx` | **客户端 IP**（可能是代理/负载均衡的 IP） |
| `-` | `-` | `$remote_user`，HTTP 基本认证的用户名，一般没有 |
| `-` | `-` | 占位符（历史原因） |
| `[$time_local]` | `16/Nov/2026:14:30:02 +0800` | **服务器本地时间**，`+0800` 是时区 |
| `"$request"` | `GET /chat HTTP/1.1` | 方法 + 路径 + 协议 |
| `$status` | `200` | **HTTP 状态码** |
| `$body_bytes_sent` | `5314` | 响应正文大小（字节，不含头） |
| `"$http_referer"` | `-` | 从哪个页面跳过来的（`-` = 直接访问） |
| `"$http_user_agent"` | `Mozilla/5.0 ...` | 浏览器/客户端标识 |

**这个格式定义在 `nginx.conf` 里：**

```bash
grep -A 5 "log_format" /etc/nginx/nginx.conf
```

**应该看到：**

```nginx
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent" "$http_x_forwarded_for"';
```

**⚠️ 如果你的 Nginx 前面有 CDN 或负载均衡：**

```text
$remote_addr 拿到的是 CDN 的 IP，不是真实用户 IP。
真实 IP 在 $http_x_forwarded_for 里（如果有配）。
```

**这一周不做 CDN，先不管。但要知道这个字段可能是假的。**

## 1.4 看 pm2 日志

```bash
ls -lh ~/.pm2/logs/
```

**应该看到：**

```text
total 12M
-rw-r--r-- 1 root root 6.2M Nov 16 14:32 my-app-out.log
-rw-r--r-- 1 root root 5.8M Nov 16 14:32 my-app-error.log
```

**实时看：**

```bash
pm2 logs my-app --lines 50
```

**应该看到：**

```text
[TAILING] Tailing last 50 lines for [my-app] process (change the value with --lines option)
/root/.pm2/logs/my-app-out.log last 50 lines:
0|my-app  | [2026-11-16T14:30:02.113] POST /api/chat 200 128ms
0|my-app  | [2026-11-16T14:30:15.442] POST /api/chat 200 96ms
0|my-app  | [2026-11-16T14:30:16.201] GET /favicon.ico 404 2ms

/root/.pm2/logs/my-app-error.log last 50 lines:
0|my-app  | (empty)
```

**逐行读：**

| 部分 | 意思 |
|---|---|
| `0\|my-app` | 进程 id 0，名字 my-app |
| `[2026-11-16T14:30:02.113]` | **ISO 时间戳** |
| `POST /api/chat 200 128ms` | 你代码里打印的内容 |
| `(empty)` | 错误日志是空的（好事） |

**⚠️ `pm2 logs` 是"持续输出"，不会退出。**

```text
按 Ctrl + C 退出。
```

**只想看一次：**

```bash
pm2 logs my-app --lines 100 --nostream
```

**`--nostream` = 打完就退出。**

## 1.5 看 Nginx error.log

```bash
sudo tail -20 /var/log/nginx/error.log
```

**应该看到类似：**

```text
2026/11/16 14:30:16 [error] 1234#1234: *5678 open() "/usr/share/nginx/html/favicon.ico" failed (2: No such file or directory), client: 47.98.xx.xx, server: your-domain.com, request: "GET /favicon.ico HTTP/1.1", host: "your-domain.com"
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `2026/11/16 14:30:16` | 时间 |
| `[error]` | 级别（`notice` / `warn` / `error` / `crit`） |
| `1234#1234` | Nginx 进程号 |
| `*5678` | 连接号（同一个连接的所有日志会带同一个号） |
| `open() "..." failed (2: No such file or directory)` | 具体错误 |
| `client: 47.98.xx.xx` | 哪个客户端触发的 |
| `server: your-domain.com` | 匹配到哪个 server 块 |
| `request: "GET /favicon.ico HTTP/1.1"` | 哪个请求 |

**这个例子是"找不到 favicon"，无害。**

**真正要看的 error：**

```text
connect() failed (111: Connection refused) while connecting to upstream
```

**出现这句 = 后端挂了。**

```text
upstream: "http://127.0.0.1:3000/api/chat"
```

**这行会告诉你"转发到哪个地址失败了"。**

**这是排查 502 的第一手证据。**

## 1.6 日志级别

| 级别 | 意思 | 要不要管 |
|---|---|---|
| `debug` | 调试信息 | 生产不开 |
| `info` | 正常信息 | 一般不看 |
| `notice` | 值得注意 | 偶尔看 |
| `warn` | 警告 | 要看 |
| `error` | 错误 | **必看** |
| `crit` | 严重 | 立刻处理 |
| `alert` / `emerg` | 更严重 | 立刻处理 |

**统计一下有多少 error：**

```bash
sudo grep -c "\[error\]" /var/log/nginx/error.log
```

**应该看到：**

```text
37
```

**37 条 error，去看是什么：**

```bash
sudo grep "\[error\]" /var/log/nginx/error.log | tail -5
```

---

# 第 2 步：五条命令，够你查 90% 的问题（25 分钟）

## 2.1 命令一：谁在刷我

```bash
sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10
```

**应该看到：**

```text
   1284 47.98.xx.xx
    312 66.249.66.1
     88 157.55.39.22
     41 47.98.yy.yy
```

**逐段读这条管道：**

| 段 | 作用 |
|---|---|
| `awk '{print $1}'` | 取第一列（IP） |
| `sort` | 排序（`uniq` 要求先排序） |
| `uniq -c` | 统计每行出现几次，`-c` = count |
| `sort -rn` | 按数字倒序（`-r` 反序，`-n` 按数值） |
| `head -10` | 前 10 个 |

**结果怎么读：**

```text
第一行 1284 次 → 这是你自己（或你的监控）
第二行 312 次  → 66.249.66.x 是 Googlebot
第三行 88 次   → 157.55.x.x 是 Bingbot
```

**如果某一行的次数是几千：**

```text
要么是监控频率太高，
要么是有人在扫你，
要么是被攻击了。
```

**⚠️ 注意 UptimeRobot 也会出现在这里。** 它的 IP 段会固定出现，频率 = 监控间隔。

## 2.2 命令二：哪些请求在报错

```bash
sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn
```

**应该看到：**

```text
   1520 200
     84 304
     37 404
     12 502
      3 500
```

**逐列读：**

| 状态码 | 次数 | 意思 |
|---|---|---|
| `200` | 1520 | 正常 |
| `304` | 84 | 缓存有效（正常） |
| `404` | 37 | 找不到（可能是 favicon 或扫描） |
| `502` | 12 | **后端挂了 12 次** |
| `500` | 3 | **代码报错 3 次** |

**⚠️ 502 和 500 出现就要查。**

```bash
sudo grep " 502 " /var/log/nginx/access.log | tail -5
```

**应该看到：**

```text
47.98.xx.xx - - [16/Nov/2026:13:02:11 +0800] "POST /api/chat HTTP/1.1" 502 157 "-" "Mozilla/5.0 ..."
```

**时间 `13:02` 和 `pm2 list` 里的重启时间对得上吗？**

```text
对得上 → 那段时间服务在重启
对不上 → 另有原因
```

## 2.3 命令三：哪些页面最热

```bash
sudo awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10
```

**应该看到：**

```text
   812 /api/chat
   401 /chat
   214 /favicon.ico
    88 /
     12 /admin
```

**`$7` 是"请求路径"（含查询参数）。**

**⚠️ 如果看到 `/admin` 有很多次，而且不是你：**

```text
有人在扫后台。
第 33 周会讲怎么防。现在先知道"日志能告诉你这件事"。
```

**⚠️ 查询参数会一起被记下来：**

```text
/api/chat?token=abc123&user=42
```

**这意味着 token 被写进了日志。** 第 7 步的错误 7 会讲这个。

## 2.4 命令四：实时看

```bash
sudo tail -f /var/log/nginx/access.log
```

**应该看到（新请求不断滚出来）：**

```text
47.98.xx.xx - - [16/Nov/2026:14:40:02 +0800] "GET /chat HTTP/1.1" 200 5314 "-" "Mozilla/5.0 ..."
```

**`-f` = follow，文件长了也不会退出，一直跟着。**

**用途：**

```text
你让客户"再试一次"，你在这边实时看他有没有打到你。
如果他试了但这里没出现 → 请求根本没到你的服务器（DNS / 防火墙 / CDN 问题）。
```

**⚠️ 这是最有用的一条命令。**

**退出：`Ctrl + C`。**

## 2.5 命令五：找某个时间段的请求

```bash
sudo grep "16/Nov/2026:14:3" /var/log/nginx/access.log | head -20
```

**`14:3` 会匹配 `14:30` 到 `14:39`。**

**应该看到那十分钟的所有请求。**

**更精确：**

```bash
sudo grep "16/Nov/2026:14:32:" /var/log/nginx/access.log
```

**只匹配 14:32 这一分钟。**

**⚠️ 注意时间格式：**

```text
日志里的时间是 16/Nov/2026:14:32:11 +0800
你要按这个格式搜，不是 2026-11-16 14:32
```

**这个格式由 `$time_local` 决定，可以在 nginx.conf 里改，但默认就是这个。**

## 2.6 一条"万能"排查命令

**客户说"我十分钟前打不开"：**

```bash
sudo tail -2000 /var/log/nginx/access.log | grep " 502 \| 500 " | tail -20
```

**应该看到那段时间的所有错误请求。**

**如果什么都没有：**

```text
说明请求没到 Nginx。
去查 DNS / 安全组 / 客户自己的网络。
```

**这一步的价值：**

```text
"请求到没到"是排查的第一个分叉点。
到了 → 查你的代码和 Nginx
没到 → 查网络和 DNS
```

## 2.7 把命令记进 `日志速查.md`

```markdown
# 日志速查

## 位置

| 日志 | 路径 |
|---|---|
| Nginx access | /var/log/nginx/access.log |
| Nginx error | /var/log/nginx/error.log |
| pm2 out | ~/.pm2/logs/my-app-out.log |
| pm2 error | ~/.pm2/logs/my-app-error.log |
| PostgreSQL | /var/log/postgresql/ |

## 五条命令

| 想干什么 | 命令 |
|---|---|
| 谁在刷 | awk '{print $1}' access.log \| sort \| uniq -c \| sort -rn \| head |
| 哪些在报错 | awk '{print $9}' access.log \| sort \| uniq -c \| sort -rn |
| 哪些页面最热 | awk '{print $7}' access.log \| sort \| uniq -c \| sort -rn \| head |
| 实时看 | tail -f access.log |
| 找时间段 | grep "16/Nov/2026:14:32:" access.log |

## 我的真实输出

（把第 2 步每条命令的输出粘在这里）
```

---

# 第 3 步：日志会自己长胖，必须有东西管（25 分钟）

## 3.1 日志能长多快

**一天几百次访问的个人项目：**

```text
access.log   每天 1—10 MB
error.log    每天几百 KB（如果没报错）
pm2 out.log  取决于你 console.log 得多不多
```

**看起来不多。但：**

```text
被扫描器扫一次 → 几万行 404
加一个每 5 分钟的健康检查 → 每天 288 行
一个 bug 反复打日志 → 一天 GB 级
```

**真实数据：**

```bash
sudo du -sh /var/log/nginx/ /root/.pm2/logs/
```

**应该看到：**

```text
184M    /var/log/nginx/
6.2G    /root/.pm2/logs/
```

**`6.2G` 的 pm2 日志，是因为你某个 `console.log` 在循环里打。**

## 3.2 先看磁盘还剩多少

```bash
df -h
```

**应该看到：**

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G   31G  7.2G  82% /
tmpfs           974M     0  974M   0% /dev/shm
```

**逐列读：**

| 列 | 意思 | 你要看什么 |
|---|---|---|
| `Filesystem` | 设备名 | `/dev/vda1` 是主分区 |
| `Size` | 总容量 | 40G |
| `Used` | 已用 | 31G |
| `Avail` | 可用 | 7.2G |
| `Use%` | **使用率** | **超过 85% 就要处理** |
| `Mounted on` | 挂载点 | `/` 是根分区 |

**⚠️ 云服务器还有一件"看不见的占用"：**

```text
df 显示 82%，但 du -sh / 加起来只有 20G。
差额可能是：
① 被删除但还被进程占用的文件（第 7 步错误 2）
② 系统保留块（ext4 默认给 root 留 5%）
③ 快照 / 镜像缓存
```

## 3.3 看谁占了空间

```bash
sudo du -sh /* 2>/dev/null | sort -h | tail -10
```

**应该看到：**

```text
4.0K    /srv
120M    /opt
1.2G    /usr
2.1G    /var
6.2G    /root
18G     /srv-old
```

**`sort -h` = human-readable 排序（1K < 1M < 1G）。**

**逐行读：**

| 行 | 意思 |
|---|---|
| `18G /srv-old` | **最大的嫌疑犯** |
| `6.2G /root` | 里面大概率是 `.pm2/logs` |
| `2.1G /var` | 日志和数据库 |
| `1.2G /usr` | 系统程序，不能动 |

**再往下钻一层：**

```bash
sudo du -sh /var/* 2>/dev/null | sort -h | tail -5
```

**应该看到：**

```text
120M    /var/cache
340M    /var/lib
1.6G    /var/log
```

**继续：**

```bash
sudo du -sh /var/log/* 2>/dev/null | sort -h | tail -5
```

**应该看到：**

```text
88M     /var/log/nginx
1.4G    /var/log/journal
```

**⚠️ `journalctl` 的日志（`/var/log/journal`）经常是隐藏的胖子。**

```bash
journalctl --disk-usage
```

**应该看到：**

```text
Archived and active journals take up 1.4G in the file system.
```

**清理（只保留最近 7 天）：**

```bash
sudo journalctl --vacuum-time=7d
```

**应该看到：**

```text
Vacuuming done, freed 1.1G of archived journals from /var/log/journal.
```

## 3.4 logrotate 是什么

**大白话：一个"自动把旧日志改名 + 压缩 + 删掉"的程序，通常每天跑一次。**

**它做的事：**

```text
access.log        →  改名成 access.log.1
新建 access.log   →  Nginx 继续往里写
access.log.1      →  下次轮转时压缩成 access.log.1.gz
超过保留数量       →  删掉最旧的
```

**Ubuntu 装 Nginx 时，会自动装一个配置：**

```bash
cat /etc/logrotate.d/nginx
```

**应该看到：**

```text
/var/log/nginx/*.log {
	daily
	missingok
	rotate 14
	compress
	delaycompress
	notifempty
	create 0640 www-data adm
	sharedscripts
	postrotate
		[ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
	endscript
}
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `/var/log/nginx/*.log` | 对这些文件生效 |
| `daily` | 每天轮转一次 |
| `missingok` | 文件不存在也不报错 |
| `rotate 14` | **保留 14 份**（14 天） |
| `compress` | 旧的用 gzip 压缩 |
| `delaycompress` | **延迟一轮再压缩**（因为 Nginx 可能还开着旧文件） |
| `notifempty` | 文件是空的就不轮转 |
| `create 0640 www-data adm` | 新建的文件用这个权限和所有者 |
| `sharedscripts` | 多个日志只跑一次 `postrotate` |
| `postrotate ... endscript` | 轮转后执行的命令 |
| `kill -USR1 $(cat nginx.pid)` | **告诉 Nginx"重新打开日志文件"** |

**⚠️ 最后那条是关键。**

```text
Nginx 启动时打开了 access.log 这个文件句柄。
你把文件改名了，Nginx 还在往"原来那个 inode"里写。
不发 USR1，新文件永远是空的，旧文件一直变大。
```

**这就是第 7 步错误 2 的机制。**

## 3.5 验证 logrotate 会正常工作

**`-d` = debug，只打印"会做什么"，不真的做：**

```bash
sudo logrotate -d /etc/logrotate.d/nginx
```

**应该看到：**

```text
reading config file /etc/logrotate.d/nginx
...
considering log /var/log/nginx/access.log
  Now: 2026-11-16 14:50
  Last rotated at 2026-11-16 03:00
  log does not need rotating (log has already been rotated)
considering log /var/log/nginx/error.log
  Now: 2026-11-16 14:50
  Last rotated at 2026-11-16 03:00
  log does not need rotating (log has already been rotated)
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `considering log ...` | 正在考虑这个文件 |
| `Last rotated at` | 上次轮转时间 |
| `log does not need rotating` | 今天已经轮过了，不用再轮 |

**如果看到：**

```text
log needs rotating
```

**说明它认为该轮转了，但还没轮（因为你用的是 `-d`）。**

**想真轮一次（谨慎）：**

```bash
sudo logrotate -f /etc/logrotate.d/nginx
```

**`-f` = force，强制轮转。**

**⚠️ `-f` 会立刻触发轮转。** 在流量大的时候做，会有几毫秒的日志写入切换，一般无感，但没必要别乱用。

## 3.6 给 pm2 日志也配上

**pm2 有自己的日志管理：**

```bash
pm2 install pm2-logrotate
```

**应该看到：**

```text
[PM2][Module] Installing module: pm2-logrotate
...
[PM2][Module] Module successfully installed
```

**配置（默认保留 30 天、单个文件 10M）：**

```bash
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

**逐条读：**

| 命令 | 作用 |
|---|---|
| `max_size 50M` | 单个文件超过 50M 就切 |
| `retain 14` | 保留 14 份 |
| `compress true` | 压缩旧的 |

**验证配置：**

```bash
pm2 conf pm2-logrotate
```

**应该看到类似：**

```text
max_size: 50M
retain: 14
compress: true
```

**⚠️ pm2-logrotate 是"模块"，不是 pm2 自带功能。** 装了才有。

---

# 第 4 步：成本表——一个月到底花多少（25 分钟）

## 4.1 为什么要算这张表

**因为你要报价。**

**客户问"这个一年多少钱"，你要能当场答出来。**

**如果你答"大概几百块"，会发生两件事：**

```text
① 客户觉得你不专业
② 你自己也不知道会不会亏
```

## 4.2 先把成本分成三类

| 类型 | 举例 | 特点 |
|---|---|---|
| **一次性** | 开发费、设计费、域名首年 | 只发生一次 |
| **固定月付** | 服务器、对象存储、短信包 | 每月一样（或差不多） |
| **按量** | 模型调用、流量、短信条数 | **随用量线性增长，最难估** |

**⚠️ 报价亏钱，90% 亏在第三类。**

```text
服务器 80 块，你算得清。
模型费 800 块，你没算。
客户付你 500/月，你每月亏 400。
```

## 4.3 固定成本表

**以"AI 聊天应用，50 用户"为例：**

| 项目 | 单价 | 用量 | 月成本 | 备注 |
|---|---|---|---|---|
| 服务器（2核2G） | 80 元/月 | 1 台 | **80 元** | 轻量应用服务器 |
| 域名 | 80 元/年 | 1 个 | **≈ 6.7 元** | 80 ÷ 12 |
| SSL 证书 | 0 | —— | **0 元** | Let's Encrypt |
| 对象存储（备份） | 0.1 元/GB/月 | 5 GB | **0.5 元** | 会变，以官网为准 |
| 备份流量 | 按量 | 5 GB | **≈ 1 元** | 内网/外网价不同 |
| **固定合计** | | | **≈ 88 元/月** | |

**⚠️ 所有价格都会变，以官网为准。**

**这一张表的每一行都要写"单价 × 用量 = 小计"。**

```text
不写单价，三个月后你忘了为什么是 80。
不写用量，客户加了一倍用户，你不知道该加多少钱。
```

## 4.4 模型成本：必须给公式

**公式：**

```text
月成本 = 每天请求次数 × 30 × (每次输入 token × 输入单价 + 每次输出 token × 输出单价)
```

**单位注意：**

```text
单价通常是"元 / 百万 token"。
所以 token 数要先除以 1,000,000。
```

**完整写法：**

```text
月成本 = 日请求数 × 30 × (输入token × 输入单价 + 输出token × 输出单价) ÷ 1,000,000
```

## 4.5 算例一：不带历史

**假设：**

```text
每天 200 次对话
每次输入 800 token
每次输出 300 token
输入单价 1 元 / 百万 token
输出单价 3 元 / 百万 token
```

**计算：**

```text
每月请求数 = 200 × 30 = 6000 次

每月输入 token = 6000 × 800 = 4,800,000 = 4.8 百万
每月输出 token = 6000 × 300 = 1,800,000 = 1.8 百万

输入成本 = 4.8 × 1 = 4.8 元
输出成本 = 1.8 × 3 = 5.4 元

模型月成本 = 4.8 + 5.4 = 10.2 元
```

**这个例子里，模型费比服务器便宜。**

## 4.6 算例二：带 20 条历史

**同样 200 次/天，但每次带上最近 20 条对话。**

**假设每条历史平均 200 token：**

```text
每次输入 = 系统提示 800 + 历史 20 × 200 = 4,800 token
```

**计算：**

```text
每月输入 token = 6000 × 4800 = 28,800,000 = 28.8 百万
输入成本 = 28.8 × 1 = 28.8 元
输出成本 = 5.4 元（不变）

模型月成本 = 34.2 元
```

**对比：**

| 场景 | 每月输入 token | 模型月成本 |
|---|---|---|
| 不带历史 | 4.8 百万 | 10.2 元 |
| 带 20 条历史 | 28.8 百万 | **34.2 元** |
| 带 20 条历史 + 用户翻倍 | 57.6 百万 | **63 元** |

**⚠️ 关键结论：**

> **输入 token 是成本的大头，而它主要来自"历史对话"。**

**所以"要不要带历史"是一个成本决策，不只是产品决策。**

## 4.7 算例三：一个"看起来很小"的功能

**你在每次请求里加了一段 2000 token 的系统提示（比如很长的角色设定）。**

```text
每次输入 = 2000 + 800 = 2800 token
每月 = 6000 × 2800 = 16.8 百万
输入成本 = 16.8 元
```

**一段提示词，让成本从 10.2 涨到 22.2 元。**

**这就是为什么"算过"和"没算过"差别很大。**

## 4.8 把三笔钱分开报价

**合同/报价单上必须写清这三笔：**

| 项目 | 金额 | 谁付 | 怎么付 |
|---|---|---|---|
| **开发费** | 一次性 X 元 | 客户 | 签约 50%，验收 50% |
| **服务器 + 域名** | Y 元/月（或 /年） | 客户 | **用客户的账号买，或提前预付** |
| **模型调用费** | 按量，约 Z 元/月 | **必须写清** | 预充值 / 月度结算 |

**⚠️ 第三笔是最容易扯皮的。**

**三种常见纠纷：**

```text
① 你以为客户付，客户以为你包在开发费里
   → 第一个月账单 800，你自己吞

② 客户付了，但你没给上限
   → 有人恶意刷接口，一夜烧掉几千

③ 客户用超了不认账
   → 你说"用了这么多"，他说"我没看到"
```

**解决办法：**

```text
① 合同里写清"模型费由甲方承担，按月据实结算"
② 代码里加每日额度上限（第 33 周会讲）
③ 每月出一份用量报表给客户
```

## 4.9 写你的成本表

**在 `03-练习代码/成本表.md` 里：**

```markdown
# 成本表

## 一、固定成本

| 项目 | 单价 | 用量 | 月成本 |
|---|---|---|---|
| 服务器 | | | |
| 域名 | | | |
| SSL | | | |
| 对象存储 | | | |
| **合计** | | | |

## 二、模型成本公式

月成本 = 日请求数 × 30 × (输入token × 输入单价 + 输出token × 输出单价) ÷ 1,000,000

## 三、算例（我的项目）

- 日请求数：
- 每次输入 token：
- 每次输出 token：
- 输入单价：
- 输出单价：

计算过程：

结论：模型月成本 = ____ 元

## 四、总成本

| 项目 | 月成本 |
|---|---|
| 固定 | |
| 模型 | |
| **合计** | |

## 五、报价

| 项目 | 金额 | 谁付 | 备注 |
|---|---|---|---|
| 开发费 | | | |
| 服务器+域名 | | | |
| 模型费 | | | |
```

## 4.10 一张"涨价预警"表

**成本不是静态的。这些变化会让成本翻倍：**

| 变化 | 影响 |
|---|---|
| 用户数翻倍 | 模型费翻倍 |
| 每次带的历史从 5 条变 20 条 | 输入 token 涨 4 倍 |
| 换了一个更贵的模型 | 单价涨 3—10 倍 |
| 加了图片理解 | 一张图可能几百到几千 token |
| 加了"每次自动总结" | 每个请求变两次调用 |

**⚠️ 最后一条最容易忽略：**

```text
"总结一下这段对话" 看起来是一个功能，
实际上是"每次用户说话，你都要再调一次模型"。
成本翻倍。
```

---

# 第 5 步：续费清单（20 分钟）

## 5.1 忘记续费会发生什么

**域名：**

| 阶段 | 时间 | 后果 |
|---|---|---|
| 到期 | 第 0 天 | 解析立即停止，网站打不开 |
| 宽限期 | 0—30 天 | 可以原价续回来（各厂商不同） |
| 赎回期 | 30—75 天 | 要付几百到几千元赎回费 |
| 释放 | 75 天后 | **公开可注册，谁都能买** |

**服务器：**

| 阶段 | 后果 |
|---|---|
| 到期当天 | 可能停机 |
| 到期 7—15 天 | **可能被释放，数据一起删** |
| 释放后 | 无法恢复，只能靠备份 |

**证书：**

```text
自动续期，但前提是 80 端口开着、解析没变。
不会"忘记"，只会"悄悄失败"。
```

## 5.2 建一张续费清单

**在 `03-练习代码/续费清单.md` 里：**

```markdown
# 续费清单

| 项目 | 到期日 | 价格 | 在哪续 | 提前提醒 | 自动续费 |
|---|---|---|---|---|---|
| 域名 your-domain.com | 2027-05-12 | 80 元/年 | 域名商控制台 | 30 天 | 开 |
| 服务器（2核2G） | 2027-03-01 | 80 元/月 | 云厂商控制台 | 15 天 | 开 |
| SSL 证书 | 2027-02-14 | 0 | certbot 自动 | 30 天 | 自动 |
| 对象存储 | 按量 | ~1 元/月 | 云厂商 | —— | 自动扣费 |
| 模型 API 余额 | —— | 预充值 | 平台 | 余额 < 50 元 | 手动 |
```

**⚠️ "自动续费"这一列不是万能的：**

```text
① 绑定的银行卡可能过期
② 余额可能不足
③ 有些"自动续费"只是"到期前发邮件提醒你手动续"
```

**所以"自动续费"和"日历提醒"要同时有。**

## 5.3 把到期日写进日历

**三个必须加的提醒：**

| 提醒 | 时间 | 内容 |
|---|---|---|
| 域名到期前 30 天 | 提前 30 天 | 检查自动续费是否成功 |
| 服务器到期前 15 天 | 提前 15 天 | 同上 |
| 证书到期前 30 天 | 提前 30 天 | 跑一次 `certbot renew --dry-run` |

**⚠️ 提醒要设在"你能处理的时间"，不是半夜。**

```text
设成"到期日 30 天前的上午 10 点"。
不要设成"到期日当天 00:00"，那时候你起不来。
```

**手机日历操作（大致）：**

```text
新建日程 → 标题"域名续费检查" → 日期 2027-04-12 → 时间 10:00
→ 重复：每年 → 提醒：当天 09:00
```

**⚠️ 每年重复的日程，在换手机时容易丢。** 建议同时在云端日历（腾讯日历 / Google Calendar）建一份。

## 5.4 一个真实的"消失"时间线

```text
2026-05-12  域名到期（你在忙一个项目，没注意）
2026-05-12  网站打不开。客户发消息，你以为是服务器挂了
2026-05-12  你重启服务器、重启 Nginx，都没用
2026-05-13  你终于想到查域名，发现已过期
2026-05-13  续费，但解析要等 2 小时
2026-05-13  网站恢复。 downtime 约 20 小时
```

**20 小时的 downtime，可能就是一个客户的流失。**

**而这 20 小时，只需要一条日历提醒就能避免。**

## 5.5 续费也要考虑"要不要继续"

**不是所有东西都值得续。**

| 情况 | 怎么办 |
|---|---|
| 项目还在跑，有客户 | 立刻续 |
| 项目停了，但域名还想留着 | 续域名，退服务器 |
| 项目彻底不做了 | 把数据备份下来，再让它过期 |
| 客户换了你 | 按合同处理域名归属 |

**⚠️ 最后一条很重要：**

```text
如果域名是用你的名字买的，客户要搬走时，
你得配合过户。合同里要写清"域名归属"和"过户条件"。
```

**最常见的纠纷：**

```text
客户说"域名是我们付的钱"，你说"注册人是我"。
双方都觉得自己有理。
```

**解决办法：一开始就用客户的账号买，或者合同里写清。**

## 5.6 每月一次的"运维 15 分钟"

**把这几件事做成一个固定动作（建议每月 1 号）：**

```text
□ 看一次 df -h（磁盘）
□ 看一次 certbot certificates（证书剩几天）
□ 看一次续费清单（有没有下个月到期的）
□ 看一次成本表（这个月花了多少，和上月比）
□ 看一次 UptimeRobot 可用率（是不是 100%）
□ 看一次备份日志（有没有 ALL DONE）
```

**第 224 节会把这个做成 RUNBOOK 的一部分。**

---

# 第 6 步：把三张表连起来（10 分钟）

## 6.1 日志 → 成本

**日志能告诉你"用量"。**

```bash
# 这个月有多少次模型调用
sudo grep -c "POST /api/chat" /var/log/nginx/access.log
```

**应该看到：**

```text
5821
```

**这个数字 × 每次 token 数 = 模型成本。**

```text
日志是"用量"的原始凭证。
成本表是"用量 × 单价"。
没有日志，成本表只能靠估。
```

## 6.2 成本 → 续费

**成本表告诉你"每月要花多少"。**

**续费清单告诉你"什么时候要付"。**

**两张表合起来 = 现金流。**

```text
月固定成本 88 元
客户付 500 元/月
毛利 412 元/月

但如果模型费 300 元（没算进固定成本），
实际毛利只有 112 元。
```

## 6.3 三张表的关系图

```text
日志  ──提供用量──→  成本表
                      │
                      │ 决定
                      ↓
                   报价 / 续费预算
                      │
                      │ 记录
                      ↓
                   续费清单
                      │
                      │ 到期触发
                      ↓
                   RUNBOOK（第 224 节）
```

**⚠️ 这三张表不是"作业"，是你以后接每个项目都要做的三件事。**

---

# 第 7 步：故意犯七个错（30 分钟）

## 错误 1：日志不轮转，磁盘写满

**操作：**

**在一台测试服务器上，把 logrotate 的配置禁用（或者干脆没有）：**

```bash
sudo mv /etc/logrotate.d/nginx /root/nginx.logrotate.bak
```

**然后疯狂产生日志（模拟被扫描）：**

```bash
for i in $(seq 1 200000); do echo "47.98.xx.xx - - [16/Nov/2026:15:00:00 +0800] \"GET /scan-$i HTTP/1.1\" 404 153 \"-\" \"curl/8.0\"" | sudo tee -a /var/log/nginx/access.log > /dev/null; done
```

**⚠️ 这条命令会写 20 万行。** 只在测试机做，或者把数字改小（比如 20000）。

**会怎样：**

```bash
df -h /
```

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G   40G     0 100% /
```

**然后：**

```bash
curl -i https://your-domain.com/health
```

```text
HTTP/1.1 502 Bad Gateway
```

**日志里：**

```text
Error: ENOSPC: no space left on device, open '/root/.pm2/logs/my-app-out.log'
```

**逐字读：**

| 部分 | 意思 |
|---|---|
| `ENOSPC` | No Space |
| `open '...out.log'` | 连日志文件都打不开了 |
| `no space left on device` | 磁盘没有剩余空间 |

**为什么整站挂了：**

```text
① Nginx 写不了 access.log → 可能直接返回 500
② Node 写不了日志 → console.log 抛错 → 进程崩
③ pm2 写不了日志 → 重启失败
④ PostgreSQL 写不了 WAL → **数据库直接拒绝所有写入**
```

**怎么修：**

```bash
# ① 先找出大文件
sudo du -sh /var/log/* | sort -h | tail -5

# ② 清掉（⚠️ 不要直接 rm 正在写的日志，见错误 2）
sudo truncate -s 0 /var/log/nginx/access.log

# ③ 恢复 logrotate
sudo mv /root/nginx.logrotate.bak /etc/logrotate.d/nginx

# ④ 手动跑一次确认
sudo logrotate -d /etc/logrotate.d/nginx
```

**`truncate -s 0` 是什么：**

```text
把文件大小设为 0，但"文件本身"还在。
Nginx 的句柄还有效，会继续往这个（空的）文件里写。
```

## 错误 2：`rm access.log`，空间没释放

**操作：**

```bash
sudo rm /var/log/nginx/access.log
df -h /
```

**会怎样：**

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G   40G     0 100% /
```

**文件删了，空间一点没回来。**

**为什么：**

```text
Nginx 还开着这个文件的句柄。
Linux 的规则是"没有进程引用它，才真正删除"。
你 rm 的只是目录项，文件本身还被 Nginx 占着。
```

**怎么证明：**

```bash
sudo lsof +L1 | grep nginx
```

**应该看到：**

```text
nginx   1234  www-data    6w   REG  253,1 21474836480  0 123456 /var/log/nginx/access.log (deleted)
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `nginx` | 进程名 |
| `1234` | PID |
| `6w` | 文件描述符 6，`w` 表示写 |
| `REG` | 普通文件 |
| `21474836480` | **大小：约 20 GB** |
| `(deleted)` | **已删除，但还被占用** |

**`+L1` 是什么：** 显示"链接数为 0"的文件，也就是"已经删了但还被打开"的。

**怎么修：**

```bash
# 方法一：让 Nginx 重新打开日志（会创建新文件）
sudo systemctl reload nginx

# 方法二：直接清空（但对已删除的文件无效）
# 这个方法在"文件还在"时才有用
```

**⚠️ 正确做法永远是：**

```bash
sudo truncate -s 0 /var/log/nginx/access.log
```

**不要 `rm`。**

## 错误 3：成本表漏了模型费

**操作：**

**只算固定成本：**

```text
服务器 80 + 域名 7 + SSL 0 = 87 元/月
```

**给客户报价 200 元/月（觉得有 113 元毛利）。**

**一个月后：**

```text
云厂商账单：80 元
域名摊销：7 元
模型平台账单：620 元
--------------------------------
实际成本：707 元
收入：200 元
净亏：507 元
```

**为什么模型费会到 620：**

```text
① 用户比预估多（不是 50 个，是 180 个）
② 每次带 20 条历史（输入 token 涨 6 倍）
③ 你以为的"每次 1 次调用"，实际是"1 次对话调 2 次"（一次回答、一次总结）
```

**怎么修（事中）：**

```text
① 立刻加每日额度上限
② 和客户沟通，把模型费单独结算
③ 把"带历史条数"从 20 降到 6
```

**怎么修（事前）：**

```text
① 成本表必须包含模型费，且给"最坏情况"估算
② 报价单上三笔钱分开写
③ 合同里写"模型费由甲方承担"
```

**⚠️ 一个具体的估算方法：**

```text
最坏情况 = 预估用户数 × 2 × 每天次数 × 2 × (输入token × 2) × 单价
```

**每个 × 2 都是"可能会翻倍"的地方。**

## 错误 4：域名过期，没有提醒

**操作：**

**把域名的自动续费关掉，日历里也没有提醒。**

**到期当天：**

```bash
ping your-domain.com
```

**会怎样：**

```text
Ping 请求找不到主机 your-domain.com。请检查该名称，然后重试。
```

**`nslookup`：**

```text
*** UnKnown 找不到 your-domain.com: Non-existent domain
```

**浏览器：**

```text
DNS_PROBE_FINISHED_NXDOMAIN
```

**逐字读：**

| 部分 | 意思 |
|---|---|
| `DNS_PROBE` | DNS 查询 |
| `FINISHED` | 完成了 |
| `NXDOMAIN` | **域名不存在** |

**为什么这个错最"安静"：**

```text
服务器好好的，Nginx 好好的，证书好好的。
什么都没坏。
只是"这个名字不属于你了"。
```

**你所有的排查都会指向服务器，而问题在域名。**

**怎么修：**

```text
① 立刻去域名商续费（宽限期内原价）
② 如果过了宽限期，准备付赎回费
③ 续费后等解析生效（可能 2 小时）
```

**怎么防：**

```text
① 自动续费打开
② 日历提前 30 天
③ 把域名到期日写进 RUNBOOK
```

## 错误 5：服务器到期，数据一起没了

**操作：**

**服务器包月到期，你没续。**

**会怎样：**

```text
第 1 天：服务器停机，网站打不开
第 7 天：云厂商发邮件"将于 X 日后释放资源"
第 15 天：服务器被释放，磁盘数据删除
```

**然后你登录控制台：**

```text
实例不存在
```

**为什么这比域名过期更严重：**

```text
域名过期还能赎回来（贵，但能）。
服务器释放后，数据是真的没了。
```

**唯一能救你的：**

```text
异地备份。
```

**⚠️ 这就是第 221 节"备份要异地"的真正原因。**

```text
本地备份和服务器一起被删，
异地备份还在。
```

**怎么防：**

```text
① 包年比包月便宜，也更不容易忘（一年只想一次）
② 自动续费 + 余额充足
③ 日历提前 15 天
④ 备份异地（必须）
```

## 错误 6：日志里记了敏感信息

**操作：**

**你的接口用 query 参数传 token：**

```text
GET /api/messages?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx
```

**Nginx 的默认日志格式会把它完整记下来：**

```bash
sudo grep "token=" /var/log/nginx/access.log | head -3
```

**会怎样：**

```text
47.98.xx.xx - - [16/Nov/2026:15:12:03 +0800] "GET /api/messages?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx HTTP/1.1" 200 842 "-" "Mozilla/5.0 ..."
```

**为什么这是事故：**

```text
① 任何人拿到日志（运维、被入侵、误传），就能冒充这个用户
② 日志会被备份、被同步、被复制到别的地方
③ token 的有效期可能是 7 天，够用了
```

**更糟的：**

```text
有些系统把密码放在 URL 里（?password=xxx）。
日志里就是明文密码。
```

**怎么修：**

```text
① token 放 Header（Authorization: Bearer xxx），不放 URL
② 如果必须放 URL，改 Nginx 日志格式，不记录查询参数
③ 已经泄露的 token，立刻让它失效（改密钥 / 踢下线）
```

**改日志格式（去掉 `$request`，换成不含参数的）：**

```nginx
log_format main '$remote_addr - $remote_user [$time_local] '
                '"$request_method $uri $server_protocol" '
                '$status $body_bytes_sent "$http_referer" "$http_user_agent"';

access_log /var/log/nginx/access.log main;
```

**`$uri` vs `$request`：**

| 变量 | 值 |
|---|---|
| `$request` | `GET /api/messages?token=abc HTTP/1.1` |
| `$uri` | `/api/messages`（**不含查询参数**） |

**⚠️ 改完之后要 `nginx -t && systemctl reload nginx`。**

**但注意：历史日志里的 token 还在。要清掉：**

```bash
sudo truncate -s 0 /var/log/nginx/access.log
```

## 错误 7：备份和日志在同一个分区

**操作：**

**`/srv/backups` 和 `/var/log` 都在 `/` 上。**

**日志写满磁盘。**

**会怎样：**

```bash
df -h /
```

```text
/dev/vda1        40G   40G     0 100% /
```

**然后备份脚本跑：**

```bash
sudo /srv/app/backup.sh
```

**会看到：**

```text
pg_dump: error: could not write to output file "": No space left on device
```

**或者：**

```text
[2026-11-16 03:00:02] db backup ok: /srv/backups/appdb-2026-11-16-0300.dump (0)
```

**注意 `(0)` —— 备份文件是 0 字节。**

**为什么这次特别危险：**

```text
① 日志把磁盘写满
② 备份写不进去，生成 0 字节文件
③ 你的清理逻辑（保留 7 天）把"7 天前的正常备份"删了
④ 现在你手上：一堆 0 字节的新备份 + 没有旧备份
⑤ 磁盘满还导致数据库挂了
→ 你既没有备份，网站也挂了
```

**怎么修：**

```text
① 立刻清日志（truncate）
② 检查备份文件大小，删掉 0 字节的
③ 把备份目录挪到独立分区 / 对象存储
④ 给备份加"大小检查"：小于 1KB 视为失败
```

**给脚本加检查：**

```bash
DB_FILE="$BACKUP_DIR/${DB_NAME}-${DATE}.dump"
pg_dump ... -f "$DB_FILE"

SIZE=$(stat -c%s "$DB_FILE")
if [ "$SIZE" -lt 1024 ]; then
  echo "[ERROR] backup too small: $SIZE bytes" >&2
  exit 1
fi
echo "[OK] backup size: $SIZE bytes"
```

**`stat -c%s` 是什么：** 输出文件字节数。

**⚠️ 这一步比"备份成功"更重要：**

```text
pg_dump 返回 0，不等于备份可用。
只有"文件大小合理"，才算真的备份了。
```

---

# 第 8 步：写学习笔记（10 分钟）

```markdown
# 第 223 节课学习笔记

## 一、日志在哪

| 日志 | 路径 |
|---|---|
| Nginx access | |
| Nginx error | |
| pm2 out | |
| pm2 error | |
| 数据库 | |

一个请求会在这几处留下记录：

## 二、读一行 access.log

我随便挑一行：

逐字段拆开：

## 三、五条命令

| 想干什么 | 命令 | 我的输出 |
|---|---|---|
| 谁在刷 | | |
| 哪些在报错 | | |
| 哪些页面最热 | | |
| 实时看 | | |
| 找时间段 | | |

## 四、我的磁盘

`df -h` 的输出：

最大的三个目录：

`du -sh /* | sort -h | tail -5` 的输出：

## 五、logrotate

`cat /etc/logrotate.d/nginx` 里 `rotate 14` 是什么意思：

`postrotate` 里的 `kill -USR1` 是干什么的：

为什么 `rm` 日志文件不会释放空间：

正确做法是什么：

## 六、成本表

固定成本合计：

模型成本公式：

我的算例（日请求数 / 输入 token / 输出 token / 单价）：

算出来的模型月成本：

总月成本：

## 七、三笔报价

| 项目 | 金额 | 谁付 |
|---|---|---|
| 开发费 | | |
| 服务器+域名 | | |
| 模型费 | | |

为什么第三笔最容易扯皮：

## 八、续费清单

| 项目 | 到期日 | 价格 | 提前几天提醒 |
|---|---|---|---|
| | | | |

域名过期会经历哪几个阶段：

服务器到期后多久会被释放：

我加了哪几个日历提醒：

## 九、七个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 日志不轮转 | | |
| rm 日志文件 | | |
| 漏算模型费 | | |
| 域名过期 | | |
| 服务器释放 | | |
| 日志记 token | | |
| 备份同分区 | | |

## 十、完成检查

- [ ] 我知道五份日志各在哪
- [ ] 我能读懂一行 access.log
- [ ] 我跑过五条统计命令
- [ ] 我知道 logrotate 在干什么
- [ ] 我算过自己项目的月成本
- [ ] 我的续费清单有到期日和提醒
- [ ] 我做过至少五个错误实验
```

---

# 第 9 步：课后练习（45 分钟）

## 练习一：给你的日志做一次"体检"

**要求：**

1. 统计最近 1000 行里，状态码分布；
2. 找出请求最多的 5 个 IP；
3. 找出请求最多的 5 个路径；
4. 统计 4xx 和 5xx 各多少。

**记录什么：**

```text
状态码分布：
Top 5 IP：
Top 5 路径：
4xx 数量：
5xx 数量：
```

**思考题：**

> 如果 5xx 有 30 条，你怎么判断是"某一次故障"还是"一直有问题"？

## 练习二：算一次"如果用户翻倍"

**要求：**

1. 用你现在的成本表；
2. 把日请求数 × 2；
3. 把历史条数从 5 改成 20；
4. 重新算模型成本；
5. 算出"涨价倍数"。

**记录什么：**

```text
现在：日请求 __ 次，历史 __ 条，模型成本 __ 元
翻倍后：日请求 __ 次，历史 20 条，模型成本 __ 元
涨价倍数：
我的报价能不能覆盖：
```

**思考题：**

> 如果涨价 6 倍，你会"涨价"还是"改产品（少带历史）"？各自的代价是什么？

## 练习三：建一份"到期日历"

**要求：**

1. 把域名、服务器、证书、对象存储、模型余额的到期日全找出来；
2. 在手机日历里各建一个提前 30 天（或 15 天）的提醒；
3. 截图保存。

**记录什么：**

```text
我找到的到期日：
我加的提醒：
有没有哪个"根本查不到到期日"：
```

**思考题：**

> 哪个"到期"最容易被忽略？为什么？

## 练习四：把 logrotate 手动跑一次

**要求：**

1. `logrotate -d` 看它打算做什么；
2. `logrotate -f` 真的跑一次；
3. 看 `ls -l /var/log/nginx/` 多了什么文件；
4. 确认 Nginx 还在正常写新日志（`tail -f` 看有没有新行）。

**记录什么：**

```text
-d 的输出：
-f 之后 ls -l 的变化：
tail -f 有没有新行：
```

**思考题：**

> 如果 `postrotate` 里的 `kill -USR1` 写错了，会发生什么？

## 练习五：用自己的话讲

```text
① 为什么 `rm` 日志文件不释放空间，而 `truncate` 可以？
② 为什么模型费是最容易亏的一笔？
③ 域名过期和服务器到期，哪个更严重？为什么？
④ 日志里为什么会出现在 token？怎么避免？
⑤ 三张表（日志、成本、续费）之间是什么关系？
```

---

# 第 10 步：最终验收（10 分钟）

## A. 概念

- [ ] 我知道五份日志各自在哪、各看什么
- [ ] 我能逐字段解释一行 `access.log`
- [ ] 我知道 logrotate 的 `rotate` / `compress` / `postrotate` 各干什么
- [ ] 我知道成本要分固定和按量，模型费必须单列
- [ ] 我知道域名过期有宽限期和赎回期

## B. 实操

- [ ] 我跑过五条日志统计命令，有真实输出
- [ ] 我知道我的磁盘用了多少、谁占得最多
- [ ] 我验证过 logrotate 配置（`-d` 或 `-f`）
- [ ] 我给 pm2 装了 `pm2-logrotate`
- [ ] 我算出了自己项目的月成本（含模型费）
- [ ] 我的续费清单有至少 4 项，且有到期日
- [ ] 我在日历里加了提醒

## C. 排错

- [ ] 看到 `ENOSPC`，我知道先 `df -h`，再 `du -sh /*`
- [ ] 知道 `rm` 日志不释放空间，要用 `truncate` 或 `reload`
- [ ] 会用 `lsof +L1` 找"已删除但被占用"的文件
- [ ] 看到 `NXDOMAIN`，我知道先查域名到期
- [ ] 备份文件 0 字节时，我知道是磁盘满了

## D. 交付

- [ ] `03-练习代码/日志速查.md` 有位置 + 五条命令 + 真实输出
- [ ] `03-练习代码/成本表.md` 有公式 + 算例 + 三笔报价
- [ ] `03-练习代码/续费清单.md` 有到期日和提醒
- [ ] 我能说出"我这个项目一个月大概花多少"

## E. 笔记

- [ ] `NOTES.md` 十栏都填了
- [ ] 成本那一栏是真算过的，不是估的
- [ ] 「七个错误的后果」有真实报错原文

## 本节课要能说出口的一句话

> **日志是事后唯一的证据，但它会自己长胖；成本要拆成三笔算，最贵的那笔永远是模型；忘记续费不会报错，只会让网站在某个凌晨消失。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 找不到 access.log | 路径不是默认的 | `grep access_log /etc/nginx/nginx.conf` |
| access.log 是空的 | 请求没到 Nginx / 日志路径改了 | `tail -f` 同时访问一次 |
| 磁盘 100%，但 `du` 加起来不多 | 有已删除但被占用的文件 | `lsof +L1` |
| `rm` 日志后空间没释放 | 进程还开着句柄 | `truncate -s 0` 或 `reload` |
| `No space left on device` | 磁盘满 | `df -h` → `du -sh /*` → 清日志 |
| logrotate 不生效 | 配置放错目录 / cron 没跑 | `logrotate -d` 看输出 |
| 轮转后新日志是空的 | 没发 `USR1` 给 Nginx | 检查 `postrotate` |
| pm2 日志几个 G | 没装 logrotate | `pm2 install pm2-logrotate` |
| 日志里出现 token | URL 带参数 | 改日志格式用 `$uri`，token 放 Header |
| 日志时间是 UTC | 服务器时区 | `timedatectl set-timezone Asia/Shanghai` |
| 统计命令报 `awk: not found` | 极简系统 | `apt install gawk` |
| `journalctl` 占几个 G | 系统日志没限制 | `journalctl --vacuum-time=7d` |
| 客户说打不开，日志里没记录 | 请求没到服务器 | 查 DNS / 安全组 / CDN |
| 成本比预估高很多 | 漏算模型费 / 历史太长 | 重算，加额度上限 |
| 域名过期 | 忘了续 | 宽限期内立刻续，加日历 |
| 服务器被释放 | 忘了续 | 只能靠异地备份 |
| 证书"自己"过期了 | 自动续期失败 | `certbot renew --dry-run` 查原因 |
| 续费价格比首年贵很多 | 首年促销价 | 按续费价做预算 |
| 备份文件是 0 字节 | 磁盘满 / 命令失败 | 加大小检查 |
| 改了日志格式没生效 | 没 reload | `nginx -t && systemctl reload nginx` |
