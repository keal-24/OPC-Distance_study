# 第 216 节课：Nginx 反向代理与日志

> **你的程序在 3000 端口跑着，但外面访问的是 80。**
> 中间缺一个"接线员"。这节课把线接上，并且学会它不接线的时候，去哪里看为什么。
> **这一节有一个操作顺序错了会让你以为"改了没生效"** —— `nginx -t` 必须在 `reload` 前面。

**建议用时**：110 分钟
**你需要先完成**：第 215 节课（`pm2 list` 是 online，`curl 127.0.0.1:3000` 返回 200）

---

# 第 0 步：现在缺的到底是什么（10 分钟）

## 0.1 你现在会什么

```text
浏览器 http://47.98.xx.xx   → Welcome to nginx!（nginx 的欢迎页）
服务器 curl 127.0.0.1:3000   → 200（你的应用）
```

**两个东西都在跑，但互不相干。**

```text
                    ┌──────────────┐
  用户 80 端口 ───→ │    nginx     │ ───→ /var/www/html（欢迎页）
                    └──────────────┘

                    ┌──────────────┐
  你手动 curl ────→ │  node :3000  │ ───→ 你的 chat-app
                    └──────────────┘
```

**用户走上面那条，永远看不到下面那条。**

## 0.2 你以后会遇到什么

```text
① "为什么访问 IP 是欢迎页？" —— 没配转发
② "502 Bad Gateway" —— 转发了，但后面的程序没跑
③ "404 Not Found" —— 转发了，但路径或 server_name 不对
④ "改了配置怎么没生效？" —— nginx -t 没过，reload 悄悄失败了
⑤ "谁在打我？" —— 去 access.log 看 IP
```

**这五件事，都在今天这一节里。**

## 0.3 今天要建立的三个概念

```text
① 反向代理 —— nginx 站在门口，把请求转给里面的程序
② upstream —— nginx 眼里"后面那台机器"的名字（这里就是 127.0.0.1:3000）
③ 访问日志 —— 每一次请求一行，谁、什么时候、要了什么、结果如何
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 配置全文、`nginx -t` 输出、日志样例行 |
| `nginx-笔记.md` | `03-练习代码` | 你自己建：配置路径、三条排查命令 |
| 站点配置 | `/etc/nginx/sites-available/chat-app` | 80 → 127.0.0.1:3000 |
| 软链接 | `/etc/nginx/sites-enabled/chat-app` | 启用它 |

**验收标准：**

```bash
curl -I http://127.0.0.1
```

**返回 `HTTP/1.1 200 OK`，并且 `X-Powered-By: Express`（说明是你的程序在回答，不是 nginx 欢迎页）。**

---

# 第 1 步：为什么需要反向代理（15 分钟）

## 1.1 三种"让用户访问到"的做法

| 做法 | 怎么做 | 问题 |
|---|---|---|
| ① 直接把 3000 开到公网 | 安全组加 3000，用户访问 `IP:3000` | 地址难看、没 HTTPS、没限流、程序直接暴露 |
| ② 让 node 监听 80 | `app.listen(80)` | **1024 以下端口要 root 权限**、以后上 HTTPS 要改代码 |
| ③ nginx 监听 80，转发到 3000 | 今天要做的 | 多一层，但所有好处都在这一层 |

## 1.2 逐行读这张"为什么选 ③"

| 好处 | 具体是什么 |
|---|---|
| **地址干净** | 用户访问 `http://47.98.xx.xx`，不是 `:3000` |
| **能上 HTTPS** | 证书配在 nginx，你的 Node 代码一行不用改（第 220 节） |
| **能限流** | nginx 能限制"每个 IP 每分钟 60 次"，防止被刷（第 33 周） |
| **能挡掉扫描** | 扫描器打 `/.env`、`/wp-admin`，nginx 直接 404，请求到不了你的程序 |
| **能服务静态文件** | 图片、CSS、JS 由 nginx 直接给，比 Node 快十倍 |
| **能多服务共存** | 80 端口一个，按域名分给不同程序（第 32 周） |
| **程序可以随便重启** | 重启 Node 时 nginx 还在，用户看到 502 而不是"连接被拒" |

**最后一条很多人忽略：**

```text
没有 nginx：程序重启的 2 秒里，用户看到"无法连接"（浏览器直接报错）
有 nginx：用户看到 502（nginx 活着，只是后面没人）
```

**502 比"连不上"好，因为它说明"你的服务器是活的"。**

## 1.3 "反向代理"和"代理"的区别

**一句话：**

```text
正向代理：替"客户端"出面（你翻墙用的那种）
反向代理：替"服务器"出面（nginx 这种）
```

**你不用记名词，记这个画面：**

```text
用户 → [nginx] → 你的程序
        ↑
     用户以为 nginx 就是网站
     其实 nginx 只是个前台
```

## 1.4 完整链路图

```text
浏览器
  │  http://47.98.xx.xx:80
  ↓
[ 安全组 80 端口 ]       ← 第一道门（云控制台配）
  ↓
[ nginx :80 ]            ← 第二道门（这节课配）
  │  proxy_pass http://127.0.0.1:3000
  ↓
[ node :3000 ]           ← 你的程序（只听 127.0.0.1）
  ↓
[ .env 里的模型 API ]     ← 外面
```

**任何一段断了，用户看到的东西都不一样。**

**记住这张图，第 217 节的八步排查就是沿着它走。**

---

# 第 2 步：先看懂 nginx 的配置结构（15 分钟）

## 2.1 主配置文件

```bash
cat /etc/nginx/nginx.conf
```

**你会看到一百多行。** 只挑三段看。

**第一段（开头）：**

```text
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `user www-data` | 干活的进程用 `www-data` 这个低权限用户 |
| `worker_processes auto` | 工作进程数 = CPU 核数（你的是 2） |
| `pid /run/nginx.pid` | 主进程号写在这里 |
| `include ...modules-enabled/*.conf` | 加载模块配置 |

**第二段（http 块里）：**

```text
http {
    ...
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

**这两行是关键：**

```text
nginx 会把 /etc/nginx/sites-enabled/ 下的所有文件当成配置读进来。
所以你不用改 nginx.conf，只在 sites-enabled 里放文件就行。
```

**第三段（日志格式）：**

```text
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
```

**这一节后面会逐字段拆这一行。先记住它在哪。**

## 2.2 `sites-available` 和 `sites-enabled`

```bash
ls -la /etc/nginx/sites-available/ /etc/nginx/sites-enabled/
```

**应该看到：**

```text
/etc/nginx/sites-available/:
total 12
drwxr-xr-x 2 root root 4096 Nov 16 10:12 .
drwxr-xr-x 8 root root 4096 Nov 16 10:12 ..
-rw-r--r-- 1 root root 2412 Nov 16 10:12 default

/etc/nginx/sites-enabled/:
total 8
drwxr-xr-x 2 root root 4096 Nov 16 10:12 .
drwxr-xr-x 8 root root 4096 Nov 16 10:12 ..
lrwxrwxrwx 1 root root   34 Nov 16 10:12 default -> /etc/nginx/sites-available/default
```

**逐列读：**

| 项 | 意思 |
|---|---|
| `sites-available/default` | 配置文件本体（普通文件） |
| `sites-enabled/default` | **软链接（`l` 开头）**，指向 available |
| `-> /etc/nginx/sites-available/default` | 指向哪里 |

**为什么要两个目录：**

```text
available  存放"写好的配置"，可能启用也可能不启用
enabled    只放"现在要用的"，全是软链接
```

**好处：**

```text
想临时关掉一个站点 → 删掉 enabled 里的软链接
配置本身还在 available 里，下次 ln 一下又回来了
```

## 2.3 一个 `server` 块的最小骨架

**nginx 的配置是"块套块"：**

```text
http {
    server {              ← 一个站点
        listen 80;
        server_name ...;

        location / {      ← 一类请求
            ...
        }
    }
}
```

**你只需要关心 `server` 和 `location` 两层。**

| 指令 | 在哪一层 | 干什么 |
|---|---|---|
| `listen` | server | 听哪个端口 |
| `server_name` | server | 哪个域名/主机名找这个站点 |
| `location` | server | 哪类路径（`/` 是全部） |
| `proxy_pass` | location | 转给谁 |

## 2.4 看一眼默认站点

```bash
cat /etc/nginx/sites-available/default
```

**关键几行：**

```text
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;

    server_name _;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `listen 80 default_server` | 听 80，**并且是"默认站点"** |
| `listen [::]:80 default_server` | IPv6 也一样 |
| `root /var/www/html` | 网页文件在这个目录 |
| `index index.html ...` | 默认找这些文件名 |
| `server_name _` | 匹配任何域名（占位符） |
| `try_files $uri $uri/ =404` | 找文件，找不到就 404 |

**`default_server` 是关键：**

```text
当请求的 Host 头匹配不到任何 server_name 时，
nginx 用 default_server 那个站点来回答。
```

**这就是为什么你现在访问 IP 看到欢迎页。**

**`_` 是什么：** 一个不可能成为真实域名的占位符（下划线不是合法域名）。**它表示"随便什么都行"。**

---

# 第 3 步：写你的站点配置（20 分钟）

## 3.1 建文件

```bash
nano /etc/nginx/sites-available/chat-app
```

**文件是空的（新建）。**

## 3.2 写进去

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**保存退出：**

```text
Ctrl + O
Enter
Ctrl + X
```

## 3.3 逐行读这 13 行

| 行 | 意思 | 为什么这么写 |
|---|---|---|
| `server {` | 开始一个站点 | — |
| `listen 80;` | 听 IPv4 的 80 | 用户的入口 |
| `listen [::]:80;` | 听 IPv6 的 80 | 有些客户端会走 IPv6 |
| `server_name _;` | 匹配任何域名 | 现在用 IP 访问，没有域名 |
| `location / {` | 所有路径都走这里 | `/` 是"全部" |
| `proxy_pass http://127.0.0.1:3000;` | **转给本机 3000** | 不是公网 IP，见 3.4 |
| `proxy_http_version 1.1;` | 用 HTTP/1.1 转发 | 支持 keepalive，SSE 必须 |
| `proxy_set_header Host $host;` | 把原始 Host 传过去 | 程序里 `req.hostname` 才是对的 |
| `proxy_set_header X-Real-IP $remote_addr;` | 传真实客户端 IP | 否则程序看到的都是 `127.0.0.1` |
| `proxy_set_header X-Forwarded-For ...;` | 传 IP 链 | 经过多层代理时用 |
| `proxy_set_header X-Forwarded-Proto ...;` | 传原始协议 | 生成绝对 URL 时要知道是 http 还是 https |
| `}` | 结束 location | — |
| `}` | 结束 server | — |

**`$host`、`$remote_addr` 这些是什么：**

```text
nginx 的内置变量。
$host           请求头里的 Host（没有就是 server_name）
$remote_addr    直连 nginx 的那个 IP
$scheme         http 或 https
$proxy_add_x_forwarded_for   原来的 XFF + 客户端 IP
```

## 3.4 为什么 `proxy_pass` 写 `127.0.0.1` 不写公网 IP

**有人会写成：**

```nginx
proxy_pass http://47.98.xx.xx:3000;
```

**技术上"可能"能用，但这是错的：**

```text
① 请求会从 nginx 出去，绕到公网，再回到同一台机器的 3000
   —— 多走一圈，慢，而且占带宽
② 3000 没对公网开（你也不该开），所以这条路根本走不通
③ 以后换 IP，你要改配置
```

**`127.0.0.1` 是"本机回环"，请求不出网卡。**

```text
nginx 和 node 在同一台机器上，走回环最快、最安全。
```

**这也是为什么第 215 节要求 `app.listen(3000, '127.0.0.1')`：**

```text
两边都说"只听本机"，就形成了一个闭环：
外面 → nginx → 本机 3000。
外面直接打 3000 → 打不到。
```

## 3.5 现在 `server_name` 为什么是 `_`

**因为你现在用 IP 访问，没有域名。**

```text
用域名访问时：server_name your-domain.com;
用 IP 访问时：server_name _;   （或者干脆不写，但要保证只有一个 server）
```

**第 32 周会改成域名。**

**⚠️ 注意：如果你保留 `server_name _;` 又删掉 default 站点，那么"任何 Host"都会进你的应用。**

**这在现在是对的**（你就想让 IP 能访问）。**但以后上了域名，要改成具体的域名**，否则别人拿他的域名解析到你的 IP，也能访问。

**这个攻击叫"域名指向"（domain fronting 的一种），第 33 周会讲。**

---

# 第 4 步：启用它（10 分钟）

## 4.1 建软链接

```bash
ln -s /etc/nginx/sites-available/chat-app /etc/nginx/sites-enabled/chat-app
```

**`ln -s` 是什么：** 建软链接（symbolic link），相当于 Windows 的快捷方式。

**参数顺序：**

```text
ln -s  目标文件  链接文件
       ↑          ↑
    真实配置    放到 enabled 里的名字
```

**应该没有任何输出。**

**验证：**

```bash
ls -l /etc/nginx/sites-enabled/
```

**应该看到：**

```text
lrwxrwxrwx 1 root root 38 Nov 16 13:02 chat-app -> /etc/nginx/sites-available/chat-app
lrwxrwxrwx 1 root root 34 Nov 16 10:12 default -> /etc/nginx/sites-available/default
```

**两个都在。**

## 4.2 处理默认站点

**现在有两个 `server` 都听 80：**

```text
default    listen 80 default_server
chat-app   listen 80
```

**这本身不冲突**（一个 default，一个非 default），但 default 会抢走"匹配不到"的请求。

**你的 `server_name _;` 也是"匹配任何"，所以两个都能接。**

**结果：nginx 会选哪个？**

```text
优先精确匹配 server_name；都是 _ 时，选 default_server。
所以你大概率还是会看到欢迎页。
```

**必须把 default 停掉。**

**⚠️ 不要 `rm`，用 `unlink`：**

```bash
unlink /etc/nginx/sites-enabled/default
```

**`unlink` 是什么：** 只删软链接，**不删目标文件**。

**为什么不用 `rm`：**

```text
rm 删软链接也不会删目标（这点一样）。
但 unlink 语义更清楚："我只是断开这个链接"。
而且 unlink 不能删目录，更安全一点点。
```

**真正的风险是：**

```bash
rm -rf /etc/nginx/sites-enabled/default
```

**手滑多打一个 `/` 或者路径写错，可能删掉别的东西。** **⚠️ `rm -rf` 之前永远先 `ls` 确认。**

**验证：**

```bash
ls -l /etc/nginx/sites-enabled/
```

**应该只剩：**

```text
lrwxrwxrwx 1 root root 38 Nov 16 13:02 chat-app -> /etc/nginx/sites-available/chat-app
```

**`/etc/nginx/sites-available/default` 还在，只是没启用。**

```bash
ls -l /etc/nginx/sites-available/
```

```text
-rw-r--r-- 1 root root 2412 Nov 16 10:12 default
-rw-r--r-- 1 root root  412 Nov 16 13:02 chat-app
```

## 4.3 如果两个文件都写了 `default_server`

**你会遇到：**

```text
nginx: [emerg] a duplicate default server for 0.0.0.0:80 in /etc/nginx/sites-enabled/chat-app:1
```

**为什么：**

```text
一个端口只能有一个 default_server。
default 站点已经占了 80 的 default_server，
你的 chat-app 如果也写 listen 80 default_server，就冲突了。
```

**怎么修：**

```text
二选一：
① 你的配置不写 default_server（课件就是这样）
② 或者把 default 那行改成 listen 80;（去掉 default_server）
```

**课件选 ①，更简单。**

---

# 第 5 步：`nginx -t`（10 分钟，不许跳）

## 5.1 跑

```bash
nginx -t
```

**应该看到：**

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `syntax is ok` | 语法没问题（括号配对、分号齐全） |
| `test is successful` | 整体测试通过（包括文件能不能打开、端口能不能绑） |

**两行都出现，才算过。**

## 5.2 为什么必须先 `-t`

**因为 `reload` 失败时，nginx 会继续用旧配置跑，而且不一定大声告诉你。**

**真实场景：**

```text
你改了配置 → reload → 看到一行 "Job for nginx.service failed"
你以为没事（或者没看到）
刷新浏览器 → 还是老样子
你改来改去半小时
最后发现是配置里少了一个分号
```

**`nginx -t` 会立刻告诉你哪一行错：**

```text
nginx: [emerg] unexpected end of file, expecting "}" in /etc/nginx/sites-enabled/chat-app:13
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**这句话里的信息量：**

| 部分 | 意思 |
|---|---|
| `[emerg]` | emergency，严重错误 |
| `unexpected end of file` | 文件意外结束了 |
| `expecting "}"` | 它在等一个右花括号 |
| `in /etc/nginx/sites-enabled/chat-app:13` | **第 13 行**（注意是 enabled 里的软链接路径） |

**规则（写进肌肉记忆）：**

```text
改配置 → nginx -t → 通过了才 reload → reload 后再看一眼 status
```

## 5.3 一个容易误解的点

**`nginx -t` 不需要停服务，也不会影响正在跑的请求。**

```text
它只是"读一遍配置，检查一下"，不改变任何运行状态。
所以你可以随便跑，跑一百次都行。
```

**这一条很重要：它意味着"先检查"的成本是零。**

---

# 第 6 步：`reload`（5 分钟）

## 6.1 跑

```bash
systemctl reload nginx
```

**应该没有任何输出。**

**"没有输出"就是成功。** Linux 的老规矩。

## 6.2 验证

```bash
systemctl status nginx
```

**应该看到：**

```text
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-11-16 13:05:12 CST; 1min ago
    Process: 4210 ExecReload=/usr/sbin/nginx -g daemon on; master_process on; -s reload (code=exited, status=0/SUCCESS)
   Main PID: 3122 (nginx)
```

**关键两行：**

| 行 | 意思 |
|---|---|
| `Active: active (running)` | 活着 |
| `ExecReload=... -s reload (status=0/SUCCESS)` | **重载成功** |

**按 `q` 退出。**

## 6.3 `reload` 和 `restart` 的区别

| | reload | restart |
|---|---|---|
| 老进程 | 处理完手上的请求再退 | 立刻杀掉 |
| 新配置 | 生效 | 生效 |
| 用户感知 | 无 | 可能有几十毫秒的中断 |
| 何时用 | **改配置（99% 的情况）** | 换二进制、改 `user`、卡死了 |

**为什么改配置用 `reload`：**

```text
nginx 的 master 进程收到 reload 信号后：
① 用新配置启动新的 worker
② 老的 worker 把手上的请求处理完，自己退出
③ 整个过程用户无感
```

**这一套叫"平滑重载"。**

---

# 第 7 步：从本机验证（10 分钟）

## 7.1 测

```bash
curl -I http://127.0.0.1
```

**应该看到：**

```text
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Date: Mon, 16 Nov 2026 05:10:22 GMT
Content-Type: text/html; charset=utf-8
Content-Length: 1832
Connection: keep-alive
X-Powered-By: Express
ETag: W/"728-abcdefg"
```

**逐行读：**

| 行 | 意思 | 说明什么 |
|---|---|---|
| `HTTP/1.1 200 OK` | 成功 | 链路通 |
| `Server: nginx/1.18.0` | **nginx 在回话** | 请求到了 nginx |
| `Content-Type: text/html` | 返回网页 | — |
| `Content-Length: 1832` | 1832 字节 | **不再是欢迎页的 612** |
| **`X-Powered-By: Express`** | **你的程序加的响应头** | **说明请求转到了 Node** |
| `ETag` | 内容指纹 | Express 默认会加 |

**`X-Powered-By: Express` 这一行是关键证据。**

```text
它证明：请求经过了 nginx → 转到了 Node → Node 的响应又经 nginx 返回。
整条链路通了。
```

**如果没有这一行，而 `Content-Length` 是 612：**

```text
说明你还在看 nginx 欢迎页。
回去检查：
① sites-enabled 里有没有 chat-app
② default 有没有 unlink
③ nginx -t 过了没
④ reload 了没
```

## 7.2 看正文

```bash
curl -s http://127.0.0.1 | head -20
```

**应该看到你的页面 HTML，不是 nginx 的欢迎页。**

**如果看到：**

```html
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
```

**说明还是默认站点。**

## 7.3 测一个接口

```bash
curl -i http://127.0.0.1/api/health
```

**应该看到：**

```text
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 15

{"ok":true}
```

**到这一步，"本机链路"就打通了。**

---

# 第 8 步：从外网验证（10 分钟）

## 8.1 先确认安全组

**去云控制台 → 防火墙/安全组 → 看有没有这一条：**

```text
方向    协议    端口    来源
入站    TCP     80      0.0.0.0/0
```

**没有就加一条。**

**⚠️ 来源写 `0.0.0.0/0`，意思是"任何 IP"。**

**如果你想只让自己访问，可以写你的公网 IP + `/32`。但那样客户也进不来。**

## 8.2 浏览器打开

```text
http://47.98.xx.xx
```

**应该看到你的 chat-app 页面。**

## 8.3 如果看到的是别的东西

**这张表要背下来：**

| 你看到 | 状态码 | 说明 | 最可能的原因 |
|---|---|---|---|
| 一直转圈，最后"无法访问" | — | 请求根本没到 | 安全组没开 80 |
| `Welcome to nginx!` | 200 | nginx 在，但没转发 | default 没停 / 软链接没建 / 没 reload |
| `404 Not Found` | 404 | nginx 在，但路径没人接 | `server_name` 不匹配，落到了 default |
| `502 Bad Gateway` | 502 | nginx 在，后面的程序连不上 | 程序没跑 / 端口不对 / 只听 127.0.0.1 但 nginx 转到了别的地址 |
| `504 Gateway Timeout` | 504 | 后面的程序太慢 | 模型 API 卡住 / 程序死循环 |
| `500 Internal Server Error` | 500 | **程序在跑，但它自己报错了** | `.env` 没读到 / 代码 bug |

**逐行读这张表最重要的三行：**

**① 502 和 500 的区别：**

```text
502 = nginx 连不上后面的程序（"电话打不通"）
500 = 后面的程序接了电话，但它自己出错了（"接了但说不了话"）
```

**这个区别决定了你去查 nginx 还是查 Node。**

**② 404 不一定是"文件不存在"：**

```text
在反向代理场景里，404 常常是"请求没进到你的 location"。
你的程序根本没收到这个请求。
```

**③ 504 通常不是服务器慢：**

```text
是你的程序在等别人（模型 API）。
nginx 等不住了，先返回 504。
```

## 8.4 502 的三种具体原因

```text
① Node 没在跑
   → pm2 list 看 status

② Node 在跑，但监听的不是 3000
   → ss -lntp | grep node 看实际端口

③ Node 只听 127.0.0.1，但 proxy_pass 写了 0.0.0.0 或公网 IP
   → 改成 127.0.0.1:3000
```

**第 ③ 条很隐蔽：**

```text
proxy_pass http://0.0.0.0:3000;
```

**`0.0.0.0` 在"监听"时表示"所有网卡"，但在"连接"时它不是一个有效目标。**

**你会看到 502，error.log 里：**

```text
connect() failed (111: Connection refused) while connecting to upstream
```

**记住：`proxy_pass` 永远写 `127.0.0.1`。**

---

# 第 9 步：日志（25 分钟，本节的一半价值）

## 9.1 两个日志文件

```bash
ls -lh /var/log/nginx/
```

**应该看到：**

```text
-rw-r----- 1 www-data adm  4.2K Nov 16 13:20 access.log
-rw-r----- 1 www-data adm  1.1K Nov 16 13:20 error.log
```

**区别：**

| 文件 | 记什么 | 什么时候看 |
|---|---|---|
| `access.log` | **每一次请求一行**（成功的也记） | 谁在访问、访问了什么、返回了什么 |
| `error.log` | 只有错误和警告 | 502、配置错误、权限问题 |

**权限 `640 www-data:adm`：**

```text
www-data 是 nginx 的工作用户，它要写。
adm 组里的人能读（系统的日志查看组）。
root 当然能读。
```

## 9.2 看 `access.log`

```bash
tail -5 /var/log/nginx/access.log
```

**应该看到：**

```text
113.xx.xx.xx - - [16/Nov/2026:13:18:02 +0800] "GET / HTTP/1.1" 200 1832 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
113.xx.xx.xx - - [16/Nov/2026:13:18:02 +0800] "GET /style.css HTTP/1.1" 200 4210 "http://47.98.xx.xx/" "Mozilla/5.0 ..."
113.xx.xx.xx - - [16/Nov/2026:13:18:03 +0800] "GET /app.js HTTP/1.1" 200 18302 "http://47.98.xx.xx/" "Mozilla/5.0 ..."
127.0.0.1 - - [16/Nov/2026:13:18:40 +0800] "HEAD / HTTP/1.1" 200 0 "-" "curl/7.81.0"
```

**逐字段拆第一行：**

| 字段 | 值 | 意思 |
|---|---|---|
| `$remote_addr` | `113.xx.xx.xx` | **访问者的 IP** |
| `-` | `-` | `$remote_user`，HTTP 基础认证的用户名，没开就是 `-` |
| `-` | `-` | 第二个占位（日志格式里的分隔） |
| `[$time_local]` | `[16/Nov/2026:13:18:02 +0800]` | **时间 + 时区** |
| `"$request"` | `"GET / HTTP/1.1"` | **方法 + 路径 + 协议** |
| `$status` | `200` | **状态码** |
| `$body_bytes_sent` | `1832` | 返回了多少字节（不含头） |
| `"$http_referer"` | `"-"` | 从哪个页面跳来的（直接访问是 `-`） |
| `"$http_user_agent"` | `"Mozilla/5.0 ..."` | **什么浏览器/什么程序** |

**你能从这一行读出什么：**

```text
① 有人从 113.xx.xx.xx 来
② 下午 1 点 18 分
③ 用 Chrome 访问了首页
④ 成功了（200）
⑤ 拿到 1832 字节
```

**这就是"日志"的价值：把"用户说打不开"变成"我看到了什么"。**

## 9.3 最后一行是 `curl` 打的

```text
127.0.0.1 - - [16/Nov/2026:13:18:40 +0800] "HEAD / HTTP/1.1" 200 0 "-" "curl/7.81.0"
```

**`127.0.0.1` 说明这是本机测的。**
**`HEAD` 是 `curl -I` 发的方法。**
**`body_bytes_sent` 是 0，因为 HEAD 不返回正文。**

**这也是一个排查技巧：**

```text
你分不清"是我的测试"还是"真的有用户"，
看 IP 和 User-Agent 就知道。
```

## 9.4 实时看

```bash
tail -f /var/log/nginx/access.log
```

**然后去浏览器刷新页面。**

**应该立刻多出几行：**

```text
113.xx.xx.xx - - [16/Nov/2026:13:25:11 +0800] "GET / HTTP/1.1" 200 1832 "-" "Mozilla/5.0 ..."
113.xx.xx.xx - - [16/Nov/2026:13:25:11 +0800] "GET /style.css HTTP/1.1" 200 4210 "http://47.98.xx.xx/" "Mozilla/5.0 ..."
```

**`-f` 是什么：** follow，跟着文件末尾，新内容自动显示。

**退出：`Ctrl + C`。**

**这条命令以后是你排错的第一反应。**

## 9.5 看 `error.log`

```bash
tail -20 /var/log/nginx/error.log
```

**正常情况你可能看到：**

```text
2026/11/16 13:05:12 [notice] 4210#4210: signal process started
```

**`[notice]` 是通知，不是错误。**

**`signal process started` 是你刚才 `reload` 留下的。**

**真正要看的是 `[error]` 和 `[crit]`：**

```text
2026/11/16 13:30:02 [error] 4211#4211: *12 connect() failed (111: Connection refused) while connecting to upstream, client: 113.xx.xx.xx, server: _, request: "GET / HTTP/1.1", upstream: "http://127.0.0.1:3000/", host: "47.98.xx.xx"
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `2026/11/16 13:30:02` | 时间 |
| `[error]` | 级别（还有 `warn`、`crit`、`alert`） |
| `4211#4211` | nginx 进程号 |
| `*12` | 连接编号（同一次请求的日志能串起来） |
| **`connect() failed (111: Connection refused)`** | **连不上上游** |
| `while connecting to upstream` | 在"连接上游"这一步失败的 |
| `client: 113.xx.xx.xx` | 谁在访问 |
| `server: _` | 命中哪个 server 块 |
| `request: "GET / HTTP/1.1"` | 请求什么 |
| `upstream: "http://127.0.0.1:3000/"` | **尝试连哪里** |
| `host: "47.98.xx.xx"` | 请求头里的 Host |

**这一行几乎把 502 的所有信息都给了：**

```text
① 谁访问的（client）
② 请求什么（request）
③ 往哪转的（upstream）
④ 为什么失败（Connection refused = 那个端口没人听）
```

**`111` 是什么：** Linux 的 errno，`ECONNREFUSED`，"连接被拒绝"。

**"拒绝"和"超时"的区别：**

```text
refused  = 目标机器活着，但那个端口没程序在听（立刻返回）
timeout  = 目标机器不回话（要等很久）
```

**所以 502 + `Connection refused` 几乎总是：**

```text
pm2 list 里不是 online
或者程序监听的不是 3000
```

## 9.6 `journalctl`：nginx 启动失败的证据

**如果 nginx 起不来，`error.log` 可能都没写。**

```bash
journalctl -u nginx -n 50 --no-pager
```

**应该看到类似：**

```text
Nov 16 13:35:01 VM-0-12-ubuntu systemd[1]: Starting A high performance web server and a reverse proxy server...
Nov 16 13:35:01 VM-0-12-ubuntu nginx[4310]: nginx: [emerg] unknown directive "proxy_pas" in /etc/nginx/sites-enabled/chat-app:9
Nov 16 13:35:01 VM-0-12-ubuntu nginx[4310]: nginx: configuration file /etc/nginx/nginx.conf test failed
Nov 16 13:35:01 VM-0-12-ubuntu systemd[1]: nginx.service: Control process exited, code=exited, status=1/FAILURE
Nov 16 13:35:01 VM-0-12-ubuntu systemd[1]: nginx.service: Failed with result 'exit-code'.
Nov 16 13:35:01 VM-0-12-ubuntu systemd[1]: Failed to start A high performance web server and a reverse proxy server.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Starting ...` | 尝试启动 |
| `unknown directive "proxy_pas"` | **打错字了：`proxy_pas` 少了个 `s`** |
| `in ...chat-app:9` | 第 9 行 |
| `test failed` | 配置测试失败 |
| `status=1/FAILURE` | 退出码 1 |
| `Failed to start ...` | 启动失败 |

**`journalctl` 和 `error.log` 的分工：**

```text
error.log       nginx 启动之后，运行时的错误
journalctl      nginx 启动之前/启动过程中的错误（systemd 记的）
```

**这就是为什么两个都要会看。**

**`--no-pager` 是什么：** 不要用 `less` 分页，直接输出完。**不加的话会进一个可滚动界面，要按 `q` 退出。**

## 9.7 日志轮转

**日志会一直涨。** 看现在的：

```bash
du -sh /var/log/nginx/
```

**Ubuntu 装 nginx 时，已经配好了 `logrotate`。**

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
	prerotate
		if [ -d /etc/logrotate.d/httpd-prerotate ]; then \
			run-parts /etc/logrotate.d/httpd-prerotate; \
		fi \
	endscript
	postrotate
		invoke-rc.d nginx rotate >/dev/null 2>&1
	endscript
}
```

**逐行读：**

| 指令 | 意思 |
|---|---|
| `daily` | 每天轮转一次 |
| `missingok` | 文件不存在也不报错 |
| `rotate 14` | **保留 14 份**（两周） |
| `compress` | 压缩旧的（`.gz`） |
| `delaycompress` | 延迟一次再压缩（防止正在写的文件被压） |
| `notifempty` | 空文件不轮转 |
| `create 0640 www-data adm` | 新文件的权限和属主 |
| `sharedscripts` | 多个日志只跑一次脚本 |
| `postrotate ... nginx rotate` | 轮转后通知 nginx 重新打开日志文件 |

**为什么需要"通知 nginx"：**

```text
nginx 打开日志文件后，一直拿着那个文件句柄。
你把 access.log 改名成 access.log.1，
nginx 还在往"原来那个 inode"写（现在叫 access.log.1）。
新的 access.log 是空的，nginx 不知道。
所以 postrotate 要让它重新打开。
```

**手动测试轮转（不会丢数据）：**

```bash
logrotate -d /etc/logrotate.d/nginx
```

**`-d` 是 debug/dry-run：只打印它会做什么，不真做。**

**输出会很长，看前几行：**

```text
reading config file /etc/logrotate.d/nginx
...
considering log /var/log/nginx/access.log
  Now: 2026-11-16 13:40
  Last rotated at 2026-11-16 00:00
  log does not need rotating (log has already been rotated)
```

**看到 `does not need rotating` 就对了。** 今天已经轮转过了。

## 9.8 一个必须知道的隐私问题

**`access.log` 里记了：**

```text
① 每个访问者的 IP
② 访问的完整 URL（可能带查询参数）
③ User-Agent
```

**如果 URL 里带敏感信息：**

```text
/api/chat?token=abc123&message=我的病历
```

**它会原样进日志。**

**三个原则（第 33 周会展开）：**

```text
① 敏感信息不要放 URL（放 header 或 body）
② 日志保留 14 天够了（默认就是）
③ 日志文件权限 640，别设成 644
```

---

# 第 10 步：故意犯七个错（30 分钟）

## 错误 1：改完配置不 `-t` 就 reload

**操作：**

1. `nano /etc/nginx/sites-available/chat-app`；
2. 把 `proxy_pass` 改成 `proxy_pas`（少一个 s）；
3. 直接 `systemctl reload nginx`。

**会怎样：**

```text
Job for nginx.service failed because the control process exited with error code.
See "systemctl status nginx.service" and "journalctl -xe" for details.
```

**然后：**

```bash
systemctl status nginx
```

```text
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-11-16 13:05:12 CST; 40min ago
    Process: 4402 ExecReload=/usr/sbin/nginx -g daemon on; master_process on; -s reload (code=exited, status=1/FAILURE)
```

**注意：`Active: active (running)` 但 `ExecReload ... status=1/FAILURE`。**

**这就是最坑的地方：**

```text
服务还是 running（因为老进程还在跑）
但你的新配置根本没生效
你刷新浏览器，一切正常（还是旧配置在服务）
你以为改成功了
```

**为什么：**

```text
reload 的流程：
① systemd 调 nginx -s reload
② nginx 读新配置
③ 语法错 → 拒绝重载 → 老 worker 继续用旧配置
④ 整个 nginx 不退出，只是"这次重载失败"
```

**怎么修：**

```bash
nginx -t
```

**会明确告诉你：**

```text
nginx: [emerg] unknown directive "proxy_pas" in /etc/nginx/sites-enabled/chat-app:9
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**改回来，`nginx -t` 通过，再 reload。**

## 错误 2：没建软链接

**操作：**

```bash
unlink /etc/nginx/sites-enabled/chat-app
nginx -t
systemctl reload nginx
```

**`nginx -t` 会说 `successful`（因为配置根本没被加载）。**

**然后访问：**

```bash
curl -I http://127.0.0.1
```

```text
HTTP/1.1 404 Not Found
Server: nginx/1.18.0 (Ubuntu)
Content-Type: text/html
Content-Length: 162
```

**注意：没有 `X-Powered-By`。**

**为什么是 404 而不是 502：**

```text
没有 server 块匹配你的请求（default 也被删了），
nginx 找不到任何站点 → 404。
请求根本没到 proxy_pass 那一步。
```

**怎么修：**

```bash
ln -s /etc/nginx/sites-available/chat-app /etc/nginx/sites-enabled/chat-app
nginx -t
systemctl reload nginx
```

**⚠️ `ln -s` 重复执行会报：**

```text
ln: failed to create symbolic link '/etc/nginx/sites-enabled/chat-app': File exists
```

**说明已经建过了。不用担心。**

## 错误 3：`server_name` 写死成域名，但用 IP 访问

**操作：**

```nginx
server_name your-domain.com;
```

（`_` 改成域名）

**然后：**

```bash
nginx -t && systemctl reload nginx
curl -I http://127.0.0.1
```

**会怎样：**

```text
HTTP/1.1 404 Not Found
Server: nginx/1.18.0 (Ubuntu)
```

**为什么：**

```text
你用 IP 访问，请求头里的 Host 是 47.98.xx.xx。
你的 server_name 是 your-domain.com。
匹配不上。
default 站点又被你删了。
→ 没有 server 能接 → 404。
```

**怎么修（现在）：**

```nginx
server_name _;
```

**第 32 周上了域名之后：**

```nginx
server_name your-domain.com www.your-domain.com;
```

**再配一个"兜底"的 server 挡住别人的域名指向：**

```nginx
server {
    listen 80 default_server;
    server_name _;
    return 444;      # 直接断开，不回任何东西
}
```

**第 33 周会讲这个。**

## 错误 4：`proxy_pass` 写公网 IP

**操作：**

```nginx
proxy_pass http://47.98.xx.xx:3000;
```

**然后：**

```bash
nginx -t && systemctl reload nginx
curl -I http://127.0.0.1
```

**会怎样：**

```text
HTTP/1.1 502 Bad Gateway
Server: nginx/1.18.0 (Ubuntu)
```

**`error.log`：**

```text
2026/11/16 13:50:11 [error] 4402#4402: *31 connect() failed (111: Connection refused) while connecting to upstream, client: 127.0.0.1, request: "HEAD / HTTP/1.1", upstream: "http://47.98.xx.xx:3000/", host: "127.0.0.1"
```

**注意 `upstream: "http://47.98.xx.xx:3000/"`。**

**为什么 refused：**

```text
① 你的程序只听 127.0.0.1:3000
② nginx 去连 47.98.xx.xx:3000（走公网网卡）
③ 那个地址上没有程序在监听 → 拒绝
```

**就算你哪天把 3000 开到公网了，这也是错的：**

```text
请求会绕出去再回来，多走一圈公网，慢，还占你的带宽。
```

**怎么修：**

```nginx
proxy_pass http://127.0.0.1:3000;
```

## 错误 5：`proxy_pass` 末尾多了一个斜杠

**操作：**

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/;
}
```

**然后请求：**

```bash
curl -i http://127.0.0.1/api/health
```

**会怎样：**

**你的程序收到的是 `GET /health`，不是 `GET /api/health`。**

**如果程序只有 `/api/health` 这个路由：**

```text
HTTP/1.1 404 Not Found
X-Powered-By: Express
```

**为什么：**

```text
proxy_pass 末尾带 URI（这里是 "/"）时，
nginx 会把 location 匹配到的前缀（/api/）替换成这个 URI（/）。
所以 /api/health → /health。

末尾不带 URI（proxy_pass http://127.0.0.1:3000;）时，
nginx 原样转发，/api/health 还是 /api/health。
```

**对比表：**

| 配置 | 请求 `/api/health` 转发成 |
|---|---|
| `proxy_pass http://127.0.0.1:3000;` | `/api/health` |
| `proxy_pass http://127.0.0.1:3000/;` | `/health` |
| `proxy_pass http://127.0.0.1:3000/v1/;` | `/v1/health` |

**怎么修：**

```text
如果你想让程序收到完整路径 → 去掉末尾斜杠
如果你就想剥掉 /api 前缀 → 保留斜杠（但要确认程序的路由是 /health）
```

**课件里的配置用的是不带斜杠的，因为 `location /` 匹配全部，加不加都一样。**

**但 `location /api/` 这种就要小心了。**

## 错误 6：两个 `default_server` 抢 80

**操作：**

把 `chat-app` 的 `listen 80;` 改成 `listen 80 default_server;`，但 default 站点还在。

**会怎样：**

```bash
nginx -t
```

```text
nginx: [emerg] a duplicate default server for 0.0.0.0:80 in /etc/nginx/sites-enabled/chat-app:2
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `duplicate default server` | 重复的 default server |
| `for 0.0.0.0:80` | 在 80 端口上 |
| `in ...chat-app:2` | 你的文件第 2 行 |

**为什么：**

```text
nginx 规定：同一个 端口+协议 只能有一个 default_server。
它需要唯一确定"匹配不到时用哪个"。
```

**怎么修：**

```text
二选一：
① 你的配置不写 default_server（推荐）
② unlink default 站点，让你的配置当 default
```

**这也是"为什么 default 要删掉"的技术原因之一。**

## 错误 7：改了配置，reload 了，但浏览器看到旧的

**操作：**

1. 把 `proxy_pass` 改到 3001（一个没有程序的端口）；
2. `nginx -t`（通过）；
3. `systemctl reload nginx`；
4. 浏览器刷新。

**会怎样：**

**有时候你看到 502，有时候还是旧页面。**

**为什么"有时候"：**

```text
① 浏览器有缓存（HTML、CSS、JS 都可能缓存）
② reload 是平滑的：老 worker 还在处理"已经建立的连接"
③ 你刷新得太快，请求还是老 worker 接的
```

**怎么确认配置真的生效了：**

```bash
curl -I http://127.0.0.1
```

**用 `curl` 不用浏览器：**

```text
curl 不走浏览器缓存，每次都是新请求。
```

**如果 `curl` 是 502 而浏览器是旧页面：**

```text
配置生效了，是浏览器缓存。
Ctrl + F5 强制刷新，或者开无痕窗口。
```

**如果 `curl` 也是旧结果：**

```bash
nginx -T | grep proxy_pass
```

**`nginx -T` 是什么：** 大写 T，**打印"当前实际加载的完整配置"**（包括 include 进来的）。

**这条命令能解决 90% 的"我明明改了"的疑问：**

```text
你改的是 sites-available，但 enabled 里的软链接指向别处？
你改的是另一个文件，根本没被 include？
nginx -T 一打印，全都露出来。
```

---

# 第 11 步：写学习笔记（10 分钟）

```markdown
# 第 216 节课 Nginx 学习笔记

## 一、为什么要反向代理

三种做法：

| 做法 | 问题 |
|---|---|
| 直接开 3000 | |
| node 监听 80 | |
| nginx 转 3000 | |

反向代理的四个好处：

1.
2.
3.
4.

## 二、配置结构

| 路径 | 干什么 |
|---|---|
| `/etc/nginx/nginx.conf` | |
| `/etc/nginx/sites-available/` | |
| `/etc/nginx/sites-enabled/` | |
| `/var/log/nginx/access.log` | |
| `/var/log/nginx/error.log` | |

`nginx.conf` 里哪一行把 sites-enabled 加载进来：

## 三、我的配置

（把我写的完整配置抄在这里，五行以上）

逐行解释这四行：

| 行 | 意思 |
|---|---|
| `listen 80;` | |
| `server_name _;` | |
| `proxy_pass http://127.0.0.1:3000;` | |
| `proxy_set_header X-Real-IP $remote_addr;` | |

为什么 `proxy_pass` 不写公网 IP：

## 四、`nginx -t`

我的输出：

如果 `-t` 不过就 reload，会发生什么：

## 五、验证

`curl -I http://127.0.0.1` 的完整输出：

哪一行证明"请求到了我的程序"：

`Content-Length` 是多少？欢迎页是多少？

## 六、状态码

| 状态码 | 意思 | 最可能的原因 |
|---|---|---|
| 502 | | |
| 504 | | |
| 404 | | |
| 500 | | |

502 和 500 的区别：

## 七、日志

`access.log` 一行拆开：

| 字段 | 我的值 | 意思 |
|---|---|---|
| IP | | |
| 时间 | | |
| 请求 | | |
| 状态码 | | |
| 字节数 | | |
| User-Agent | | |

`error.log` 里 `connect() failed (111: Connection refused)` 是什么意思：

`journalctl -u nginx` 和 `error.log` 分工：

日志轮转配置在哪，保留几天：

## 八、七个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 不 -t 就 reload | | |
| 没建软链 | | |
| server_name 不匹配 | | |
| proxy_pass 写公网 IP | | |
| 末尾斜杠 | | |
| 两个 default_server | | |
| 浏览器缓存 | | |

## 九、卡在哪

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] 浏览器打开 IP 是我的应用，不是欢迎页
- [ ] `curl -I` 里有 `X-Powered-By: Express`
- [ ] `nginx -t` 通过
- [ ] 我能在 `access.log` 里找到自己刚才那次访问
- [ ] 我知道 `nginx -T` 干什么
```

---

# 第 12 步：课后练习

## 练习一：故意制造三种状态码

**要求：**

分别制造 502、404、500，每种都记录：

```text
① 浏览器看到的
② access.log 那一行
③ error.log 有没有内容
```

**提示：**

```text
502 → pm2 stop chat-app
404 → server_name 改成域名
500 → 把 .env 改名再 pm2 restart
```

**记录：** 三个状态码在 access.log 里怎么区分？

**思考题：** 哪种情况 error.log 里会有 `upstream` 字样？

## 练习二：读懂十条访问日志

**要求：**

1. `tail -20 /var/log/nginx/access.log`；
2. 挑 10 行；
3. 每行写一句"谁在什么时候要了什么，结果如何"。

**记录：** 有几条是扫描器打的？（提示：看 `/.env`、`/wp-admin`、`User-Agent` 是 `curl` 或空）

**思考题：** 扫描器打 `/.env` 会得到什么？为什么？

## 练习三：把日志格式加一个字段

**要求：**

1. 在 `nginx.conf` 的 `log_format` 里加 `$request_time`（请求耗时）；
2. reload；
3. 访问几次，看日志末尾多了什么。

**记录：** 一次页面加载的耗时是多少秒？

**思考题：** 如果 `$request_time` 是 3 秒，是 nginx 慢还是你的程序慢？

## 练习四：`nginx -T` 找配置

**要求：**

1. 跑 `nginx -T | grep -n "proxy_pass"`；
2. 再跑 `nginx -T | head -30`。

**记录：** 你的配置在第几行出现？完整配置有多少行？

**思考题：** 如果你改了 `sites-available/chat-app` 但 `nginx -T` 里没有你的改动，说明什么？

## 练习五：解释给外行

```text
① 什么是反向代理？（不能用"代理"解释"代理"）
② 502 和 404 有什么区别？
③ 为什么改了配置要 reload，不能直接改？
```

**记录：** 对方哪个问题最难解释？

---

# 第 13 步：最终验收

## A. 概念

- [ ] 我能说清为什么不让用户直接访问 3000
- [ ] 我知道 `sites-available` 和 `sites-enabled` 的关系
- [ ] 我知道 `default_server` 的作用
- [ ] 我知道 502 / 504 / 404 / 500 各是谁的问题
- [ ] 我知道 `proxy_pass` 为什么写 `127.0.0.1`

## B. 实操

- [ ] 配置文件在 `/etc/nginx/sites-available/chat-app`
- [ ] 软链接在 `/etc/nginx/sites-enabled/chat-app`
- [ ] `default` 已 unlink
- [ ] `nginx -t` 两行都通过
- [ ] `systemctl reload nginx` 成功
- [ ] `curl -I http://127.0.0.1` 是 200 且有 `X-Powered-By`
- [ ] 浏览器打开公网 IP 能看到应用
- [ ] 我能在 `access.log` 找到自己

## C. 排错

- [ ] 我知道 reload 失败时 nginx 会继续用旧配置
- [ ] 我会看 `error.log` 里的 `upstream`
- [ ] 我会用 `journalctl -u nginx` 看启动失败
- [ ] 我会用 `nginx -T` 看实际生效的配置
- [ ] 我知道 `curl` 能绕过浏览器缓存

## D. 交付

- [ ] `03-练习代码/nginx-笔记.md`
- [ ] `02-笔记/NOTES.md` 填完
- [ ] 站点配置能一口气背出五个关键指令

## E. 笔记

- [ ] 配置全文抄了
- [ ] `nginx -t` 输出抄了
- [ ] 真实的一行 access.log 抄了
- [ ] 「卡在哪」写了真实内容

## 本节课要能说出口的一句话

> **反向代理就是"前台"：用户只跟 nginx 说话，nginx 转身把话递给 127.0.0.1:3000；而 `nginx -t` 是那道"递话之前先对一遍稿子"的工序 —— 不对稿子就 reload，nginx 会装作什么都没发生，继续念旧稿。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 还是 `Welcome to nginx!` | default 没停 / 软链没建 | `unlink` default，`ln -s` 新站，reload |
| `404 Not Found` | `server_name` 不匹配 / 没有 server 接 | 改成 `_`，或检查软链接 |
| `502 Bad Gateway` | 后面的程序没跑 / 端口不对 | `pm2 list`、`ss -lntp \| grep 3000` |
| `504 Gateway Timeout` | 程序太慢（等模型 API） | 看 `$request_time`，调 `proxy_read_timeout` |
| `500 Internal Server Error` | 程序自己报错 | `pm2 logs --err` |
| `nginx: [emerg] unknown directive` | 拼写错 | 按行号改 |
| `nginx: [emerg] duplicate default server` | 两个 `default_server` | 去掉一个 |
| `Job for nginx.service failed` | 配置错 / 端口占用 | `nginx -t`、`journalctl -u nginx` |
| reload 成功但没生效 | 改的文件没被 include | `nginx -T \| grep ...` |
| `ln: File exists` | 软链接已存在 | 忽略，或先 `unlink` |
| `connect() failed (111)` | upstream 没人监听 | 起程序，核对端口 |
| 日志里全是 `127.0.0.1` | 没传 `X-Real-IP` | 加 `proxy_set_header` |
| 程序里拿不到真实 IP | 同上 | 读 `X-Forwarded-For` |
| SSE / 流式响应卡住 | 没开 `proxy_http_version 1.1` + `proxy_buffering off` | 见下 |
| 上传大文件 413 | `client_max_body_size` 太小 | 在 server 块里调大 |
| 日志文件很大 | 没轮转 | 检查 `/etc/logrotate.d/nginx` |
| `Permission denied` 读日志 | 不是 root 也不是 adm 组 | `sudo tail` |
