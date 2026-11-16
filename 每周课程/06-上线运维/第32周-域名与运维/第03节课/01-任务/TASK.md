# 第 220 节课：HTTPS——没有锁客户会慌

> 上节课你的域名能打开应用了，但地址栏写着"不安全"。客户第一次打开会犹豫，第二次就不来了。
> 这节课把锁装上，并且**让它不会在三个月后自己掉下来**。

**建议用时**：120 分钟
**你需要先完成**：第 219 节课（`http://your-domain.com` 能打开你的应用，`curl -I` 返回 200 且有 `X-Powered-By: Express`）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
http://your-domain.com          → 你的应用
安全组 80 端口                   → 已放行
nginx server_name               → 写的是你的域名
curl -I                         → 200 OK
```

**但你打开浏览器，地址栏左边写着：**

```text
不安全   |  your-domain.com
```

**Chrome 会在地址栏标"不安全"，Edge 会标"不安全"，Safari 会标"未加密"。**

## 0.2 你以后会遇到什么

```text
① 客户截图问你"这里为什么写着不安全，是不是骗子网站"
② 用户在你的页面里输入手机号，数据在公网上明文传输
③ 你要接微信支付 / 小程序，对方要求"必须 HTTPS"
④ 某天早上网站打不开，浏览器显示"您的连接不是私密连接"
⑤ 你把页面改成 https 了，但图片加载不出来，控制台一片红
```

**第 ④ 条是最常见的：证书过期。** 它不会提前通知你，只会让网站在某个早上直接打不开。

## 0.3 今天要建立的三个概念

```text
① 证书是"这个域名属于这个服务器"的证明，由第三方签发
② 免费证书 90 天到期，靠"自动续期"活着，不靠记性
③ http 和 https 是两个不同的入口，必须显式做跳转
```

**第 ② 条是这节课的核心。** 签下来只要 3 分钟，让它一直有效才是真本事。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `证书信息.md` | `03-练习代码/` | 域名、签发日、到期日、`certbot certificates` 输出 |
| `https-验证.md` | `03-练习代码/` | 跳转验证 + 续期演练输出 |
| `NOTES.md` | `02-笔记` | 学习记录 |

---

# 第 1 步：签之前先检查三个前提（15 分钟）

## 1.1 为什么必须先检查

**certbot 失败的原因，90% 不是你操作错了，是这三个前提没满足：**

```text
① 域名解析到这台服务器了吗
② 80 端口从公网能访问吗
③ 服务器上有没有别的程序占着 80
```

**certbot 的验证方式叫 HTTP-01：**

```text
Let's Encrypt 的服务器会来访问
http://your-domain.com/.well-known/acme-challenge/一串随机字符
如果你能返回那个随机字符，就证明"这个域名真的指向你"。
```

**所以：DNS 必须对，80 必须通，Nginx 必须能响应。**

## 1.2 检查一：解析

**在你自己的电脑上：**

```bash
ping your-domain.com
```

**应该看到：**

```text
正在 Ping your-domain.com [47.98.xx.xx] 具有 32 字节的数据:
```

**方括号里的 IP 必须是你的服务器。**

**如果不对：**

```text
回到第 218 节。不要在这一步硬试，签不过的。
```

**⚠️ 顺便检查 www：**

**你要签的域名列表，每一个都要能解析。**

```bash
ping www.your-domain.com
```

**如果 `www` 没配 A 记录，就不要在 certbot 命令里加 `-d www.your-domain.com`。** 否则整次签发失败。

## 1.3 检查二：80 端口从公网能访问

**在服务器上：**

```bash
curl -I http://127.0.0.1
```

**应该看到 200 或 301（不是连接被拒）。**

**再从你的电脑上：**

```bash
curl -I http://your-domain.com
```

**同样要通。**

**⚠️ 如果服务器内部通、外面不通：**

```text
① 云厂商安全组没放行 80
② 系统防火墙（ufw / firewalld）没放行 80
③ 备案没过（国内服务器）
```

**查系统防火墙：**

```bash
sudo ufw status
```

**应该看到：**

```text
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

**如果没有 80：**

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

**⚠️ 先确认 22 是 ALLOW 再动防火墙。** 不然你 `ufw enable` 之后就把自己锁在外面了。

## 1.4 检查三：80 端口被谁占着

```bash
sudo ss -tlnp | grep :80
```

**应该看到：**

```text
LISTEN 0      511          0.0.0.0:80         0.0.0.0:*    users:(("nginx",pid=1234,fd=6))
LISTEN 0      511             [::]:80            [::]:*    users:(("nginx",pid=1234,fd=7))
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `LISTEN` | 正在监听 |
| `0.0.0.0:80` | 所有 IPv4 地址的 80 端口 |
| `[::]:80` | 所有 IPv6 地址的 80 端口 |
| `users:(("nginx",pid=1234,fd=6))` | **是 nginx 占着，进程号 1234** |

**如果看到的是 `node` 或 `apache2`：**

```text
certbot --nginx 会失败，因为它要改 Nginx 配置。
先停掉占 80 的程序，或者改用 webroot 模式（这一节不讲）。
```

**⚠️ `ss` 是什么：** `socket statistics`，看端口占用。比 `netstat` 新，Ubuntu 22.04 自带。

## 1.5 把检查结果记下来

**在 `03-练习代码/证书信息.md` 里先写：**

```markdown
# HTTPS 证书信息

## 签发前检查

- 域名：
- 服务器 IP：
- ping 出的 IP：
- 80 端口内部可访问：是 / 否
- 80 端口外部可访问：是 / 否
- 80 端口占用程序：
```

**这份记录在排错时会救你。**

---

# 第 2 步：装 certbot（10 分钟）

## 2.1 一条命令

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
```

**两个包各干什么：**

| 包 | 作用 |
|---|---|
| `certbot` | 主程序，负责和 Let's Encrypt 通信、申请、续期 |
| `python3-certbot-nginx` | 插件，让 certbot **自动改 Nginx 配置** |

**⚠️ 第二个包不能漏。**

**漏了会怎样：**

```text
Saving debug log to /var/log/letsencrypt/letsencrypt.log
The requested nginx plugin does not appear to be installed
```

**那时候你得手动改 Nginx 配置，多写十几行，还容易错。**

## 2.2 应该看到

**输出会很长，最后几行是：**

```text
...
Setting up python3-certbot-nginx (2.1.0-4) ...
Processing triggers for man-db (2.10.2-1) ...
```

**版本号会变，`2.1.0` 只是举例。**

**验证装好了：**

```bash
certbot --version
```

**应该看到：**

```text
certbot 2.1.0
```

**⚠️ 版本号必须记一下。** 不同版本的交互提示文字不一样，你按教程对不上时，先看版本。

## 2.3 Let's Encrypt 是什么

**一句话：一个非营利机构，免费发证书，被所有浏览器信任。**

| 项目 | 说明 |
|---|---|
| 谁办的 | ISRG（互联网安全研究小组），非营利 |
| 收费吗 | 免费 |
| 有效期 | **90 天** |
| 为什么这么短 | 逼你自动化。短证书 + 自动续期，比长证书 + 手动更新更安全 |
| 有频率限制吗 | 有。同一域名每周签发次数有限制 |

**⚠️ "90 天"这件事，是这节课所有麻烦的来源，也是所有设计的出发点。**

```text
如果证书是一年期的，你会忘了续，然后在第 366 天出事。
证书 90 天 + 自动续期，反而更可靠。
```

**为什么免费还可靠：**

```text
它验证的是"你能控制这个域名"（通过 HTTP 文件或 DNS 记录），
不验证"你是谁"。所以它不能用于银行那种高保证场景，
但对普通网站完全够用。
```

---

# 第 3 步：签发证书（25 分钟）

## 3.1 一条命令

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

**拆开读：**

| 部分 | 意思 |
|---|---|
| `certbot` | 主程序 |
| `--nginx` | 用 Nginx 插件（自动改配置） |
| `-d your-domain.com` | 要签的第一个域名 |
| `-d www.your-domain.com` | 第二个域名（有几条 `-d` 就签几个） |

**⚠️ 三个细节：**

```text
① -d 后面直接跟域名，中间有空格，没有等号
② 每个域名一个 -d，不要写成 -d a.com,b.com
③ 只签你确定能解析的域名
```

**如果只有一个域名：**

```bash
sudo certbot --nginx -d your-domain.com
```

## 3.2 交互第一关：邮箱

**运行后会先问你：**

```text
Saving debug log to /var/log/letsencrypt/letsencrypt.log
Enter email address (used for urgent renewal and security notices)
 (Enter 'c' to cancel):
```

**填一个你**真的会看**的邮箱。**

```text
you@example.com
```

**为什么必须是真的：**

```text
① 证书快到期且自动续期失败时，Let's Encrypt 会发邮件到这个地址
② 账号出问题时，这是唯一能找回的方式
```

**⚠️ 不要填 `test@test.com` 这种。** 你收不到，等于没有。

## 3.3 交互第二关：同意条款

```text
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Please read the Terms of Service at
https://letsencrypt.org/documents/LE-SA-v1.4-April-03-2024.pdf. You must
agree in order to register with the ACME server. Do you agree?
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
(Y)es/(N)o:
```

**输入 `y` 回车。**

**条款链接里的版本号会变，以你看到的为准。**

## 3.4 交互第三关：要不要共享邮箱

```text
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Would you be willing, once your first certificate is successfully issued, to
share your email address with the Electronic Frontier Foundation, a founding
partner of the Let's Encrypt project and the non-profit organization that
develops Certbot? We'd like to send you email about our work encrypting the web,
EFF news, campaigns, and ways to support digital freedom.
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
(Y)es/(N)o:
```

**这是"要不要给 EFF 捐款宣传邮件"，和证书无关。输入 `n`。**

## 3.5 关键输出

**然后你会看到：**

```text
Account registered.
Requesting a certificate for your-domain.com and www.your-domain.com

Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/your-domain.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/your-domain.com/privkey.pem
This certificate expires on 2027-02-14.
These files will be updated when the certificate renews.
Certbot has set up a scheduled task to automatically renew this certificate in the background.
```

**逐行读：**

| 行 | 意思 | 你要确认什么 |
|---|---|---|
| `Account registered.` | 你的账号在 Let's Encrypt 建好了 | 第一次才有，以后不会出现 |
| `Requesting a certificate for ...` | 正在申请，**这里列出所有域名** | 域名对不对 |
| `Successfully received certificate.` | 拿到了 | **没有这行就是失败** |
| `Certificate is saved at: ...fullchain.pem` | 证书文件（含中间证书） | 路径记下来 |
| `Key is saved at: ...privkey.pem` | 私钥文件 | **这个绝不能泄露** |
| `expires on 2027-02-14` | 到期日 | **记进日历**（第 223 节） |
| `These files will be updated when the certificate renews.` | 续期时自动覆盖这两个文件 | 所以不用改 Nginx 路径 |
| `set up a scheduled task` | 自动续期任务已装 | 第 5 步验证 |

**⚠️ 注意 `certificate` 和 `key` 是两个文件。**

```text
fullchain.pem   证书（可以给别人看）
privkey.pem     私钥（等于你家钥匙，泄露了别人就能冒充你）
```

**`fullchain` 里的 "chain" 是什么：**

```text
证书链。你的证书 → 中间证书 → 根证书。
浏览器只信任根证书，中间证书要一起发过去，链条才连得上。
用 fullchain.pem 就不会出"证书链不完整"的问题。
```

## 3.6 交互第四关：要不要跳转

```text
Deploying certificate
Successfully deployed certificate for your-domain.com to /etc/nginx/sites-enabled/default
Successfully deployed certificate for www.your-domain.com to /etc/nginx/sites-enabled/default
Congratulations! You have successfully enabled HTTPS on https://your-domain.com and https://www.your-domain.com

Please choose whether or not to redirect HTTP traffic to HTTPS, removing HTTP access.
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
1: No redirect - Make no further changes to the webserver configuration.
2: Redirect - Make all requests redirect to secure HTTPS access. Choose this for
new sites, or if you're confident your site works on HTTPS. You can undo this
change by editing your web server's configuration.
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Select the appropriate number [1-2] then [enter] (press 'c' to cancel):
```

**选 `2`。**

**为什么选 2：**

```text
选 1：http 和 https 都能访问，两个地址，两份缓存，SEO 分散，用户可能停在 http。
选 2：所有 http 自动 301 跳到 https，只有一个正确地址。
```

**⚠️ 选 2 之后，如果你的站还有 http 资源，会出混合内容问题（第 6 步）。**

**但这是必须走的一步。** 不跳转等于"锁装了但门一直开着"。

## 3.7 应该看到"Congratulations"

```text
Congratulations! You have successfully enabled HTTPS on https://your-domain.com and https://www.your-domain.com
```

**看到这句，签发成功。**

**如果没看到，跳到第 7 步的错误列表。不要重复运行命令 —— Let's Encrypt 有频率限制。**

---

# 第 4 步：验证证书真的生效（20 分钟）

## 4.1 浏览器验证

**打开：**

```text
https://your-domain.com
```

**应该看到：**

```text
🔒  your-domain.com
```

**点那个锁：**

```text
连接是安全的
证书有效
```

**点"证书有效"能看到：**

```text
颁发给：your-domain.com
颁发者：R3（或 E1 / E5，Let's Encrypt 的中间证书）
有效期：2026年11月16日 - 2027年2月14日
```

**⚠️ 锁的图标和文字会随浏览器版本变，以你看到的为准。**

## 4.2 命令行验证

**在你的电脑上：**

```bash
curl -I https://your-domain.com
```

**应该看到：**

```text
HTTP/2 200
server: nginx/1.24.0 (Ubuntu)
date: Mon, 16 Nov 2026 10:22:41 GMT
content-type: text/html; charset=utf-8
x-powered-by: Express
```

**逐行读：**

| 行 | 意思 | 说明 |
|---|---|---|
| `HTTP/2 200` | **HTTP/2**，说明走了 TLS 协商 | http 是 `HTTP/1.1` |
| `server: nginx/1.24.0` | Nginx 回应 | —— |
| `x-powered-by: Express` | 后端是 Express | 转发正常 |

**⚠️ 如果 `curl` 报这个：**

```text
curl: (60) SSL certificate problem: unable to get local issuer certificate
```

**说明服务器只发了自己的证书，没发中间证书 —— 你用的不是 `fullchain.pem`。**

**如果报这个：**

```text
curl: (60) SSL: no alternative certificate subject name matches target host name 'your-domain.com'
```

**说明证书上的域名和你访问的域名不一致。** 比如你只签了 `www`，却访问裸域名。

## 4.3 用 openssl 看到期日

**在你自己的电脑上（Git Bash 里有 openssl）：**

```bash
echo | openssl s_client -connect your-domain.com:443 -servername your-domain.com 2>/dev/null | openssl x509 -noout -dates
```

**应该看到：**

```text
notBefore=Nov 16 09:58:12 2026 GMT
notAfter=Feb 14 09:58:11 2027 GMT
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `notBefore` | 从这一刻起有效（签发时间） |
| `notAfter` | **到这一刻失效** |

**⚠️ 两个都是 GMT 时间，不是北京时间。** 北京时间 = GMT + 8。

**这条命令拆开看：**

| 部分 | 作用 |
|---|---|
| `echo \|` | 给 openssl 一个空输入，让它连上就退出 |
| `openssl s_client -connect host:443` | 像浏览器一样连上去，打印握手信息 |
| `-servername your-domain.com` | **SNI**：告诉服务器"我要访问这个域名" |
| `2>/dev/null` | 把握手过程的杂音丢掉 |
| `openssl x509 -noout -dates` | 只输出有效期，不输出整个证书 |

**为什么必须带 `-servername`：**

```text
一台服务器上可能有多个域名、多张证书。
不带 SNI，服务器不知道你要哪一张，可能返回默认的那张。
```

## 4.4 `certbot certificates`：看所有证书

```bash
sudo certbot certificates
```

**应该看到：**

```text
Found the following certs:
  Certificate Name: your-domain.com
    Serial Number: 4a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8
    Key Type: ECDSA
    Domains: your-domain.com www.your-domain.com
    Expiry Date: 2027-02-14 09:58:11+00:00 (VALID: 89 days)
    Certificate Path: /etc/letsencrypt/live/your-domain.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/your-domain.com/privkey.pem
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Certificate Name` | 证书的名字（通常是你第一个 `-d` 的域名） |
| `Serial Number` | 证书序列号，唯一 |
| `Key Type: ECDSA` | 密钥算法。ECDSA 比 RSA 短、快；老系统可能需要 RSA |
| `Domains` | **这张证书覆盖的所有域名** |
| `Expiry Date ... (VALID: 89 days)` | **到期时间 + 还剩几天** |
| `Certificate Path` | 证书文件路径 |
| `Private Key Path` | 私钥路径 |

**⚠️ 这行最重要：**

```text
(VALID: 89 days)
```

**以后你每次上服务器，先跑这一条，看还剩几天。**

```text
剩 30 天以下 → 自动续期可能有问题，去查
剩 7 天以下  → 立刻手动 renew
剩 0 天      → 已经挂了
```

**注意：certbot 在到期前 30 天才续期。所以看到"还剩 20 天"是正常的，看到"还剩 5 天"就有问题。**

## 4.5 证书文件长什么样

```bash
sudo ls -l /etc/letsencrypt/live/your-domain.com/
```

**应该看到：**

```text
lrwxrwxrwx 1 root root   41 Nov 16 09:58 cert.pem -> ../../archive/your-domain.com/cert1.pem
lrwxrwxrwx 1 root root   42 Nov 16 09:58 chain.pem -> ../../archive/your-domain.com/chain1.pem
lrwxrwxrwx 1 root root   43 Nov 16 09:58 fullchain.pem -> ../../archive/your-domain.com/fullchain1.pem
lrwxrwxrwx 1 root root   44 Nov 16 09:58 privkey.pem -> ../../archive/your-domain.com/privkey1.pem
```

**逐行读：**

| 文件 | 是什么 | 给谁看 |
|---|---|---|
| `cert.pem` | 只有你自己的证书 | 一般不用 |
| `chain.pem` | 中间证书 | 一般不用 |
| `fullchain.pem` | **你的 + 中间证书** | **Nginx 的 `ssl_certificate` 用这个** |
| `privkey.pem` | **私钥** | **Nginx 的 `ssl_certificate_key` 用这个，绝不能给任何人** |

**⚠️ 注意这几个都是软链接，指向 `archive/` 里的 `cert1.pem`、`cert2.pem`……**

```text
每次续期，certbot 会新建 cert2.pem，然后把 live/ 里的软链接指过去。
Nginx 读的是 live/fullchain.pem，永远指向最新那份。
所以你不需要改 Nginx 配置。
```

**这就是"自动续期"能无缝工作的原因。**

---

# 第 5 步：自动续期，以及必须做的演练（25 分钟）

## 5.1 证书 90 天，靠什么活下来

**certbot 装的时候会同时装一个 systemd 定时任务。**

**查它：**

```bash
systemctl list-timers | grep -i certbot
```

**应该看到：**

```text
Mon 2026-11-16 23:14:02 CST  2h 51min left  Mon 2026-11-16 11:14:02 CST  9h ago  certbot.timer  certbot.service
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `Mon 2026-11-16 23:14:02 CST` | 下次运行时间 |
| `2h 51min left` | 还有多久 |
| `9h ago` | 上次运行是多久前 |
| `certbot.timer` | 定时器名字 |
| `certbot.service` | 定时器会启动的服务 |

**它每天跑两次（带随机延迟），每次检查"有没有证书快到期"。**

```text
到期前 30 天内 → 真的续
还没到 30 天   → 什么都不做，退出
```

**这就是为什么你看到"还剩 89 天"时，它一直没动静 —— 正常。**

## 5.2 必须做：`--dry-run` 演练

**`--dry-run` 是什么：**

```text
走完整个续期流程，但不真的申请证书、不真的替换文件。
等于"彩排"。
```

**为什么必须做：**

```text
不演练，你不知道它到底能不能续。
等到第 60 天真的去续，才发现 80 端口被封了，
而那时你可能正在出差。
```

**跑它：**

```bash
sudo certbot renew --dry-run
```

**应该看到：**

```text
Saving debug log to /var/log/letsencrypt/letsencrypt.log
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Processing /etc/letsencrypt/renewal/your-domain.com.conf
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Simulating renewal of an existing certificate for your-domain.com and www.your-domain.com
Congratulations, all simulated renewals succeeded:
  /etc/letsencrypt/live/your-domain.com/fullchain.pem (success)
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
```

**逐段读：**

| 段 | 意思 | 你要确认什么 |
|---|---|---|
| `Processing .../your-domain.com.conf` | 处理这个证书的续期配置 | 文件名对不对 |
| `Simulating renewal ...` | **模拟**续期 | 有 `Simulating` 就是没真签 |
| `all simulated renewals succeeded` | **全部成功** | 必须是 `succeeded` |
| `(success)` | 这个证书成功了 | 每张证书一行 |

**⚠️ 只要看到 `Congratulations, all simulated renewals succeeded`，就说明：**

```text
① 域名解析还是对的
② 80 端口还能从公网访问
③ Nginx 配置没被改坏
④ 续期流程能跑通
```

**这四件事任何一件坏了，这句都不会出现。**

## 5.3 演练失败长什么样

**最常见的一种：**

```text
Simulating renewal of an existing certificate for your-domain.com
Attempting to renew cert (your-domain.com) from /etc/letsencrypt/renewal/your-domain.com.conf produced an unexpected error: Failed authorization procedure. your-domain.com (http-01): urn:ietf:params:acme:error:connection :: The server could not connect to the client to verify the domain :: 47.98.xx.xx: Fetching http://your-domain.com/.well-known/acme-challenge/xxxx: Timeout during connect (likely firewall problem). Skipping.
All simulated renewals failed. The following certificates could not be renewed:
  /etc/letsencrypt/live/your-domain.com/fullchain.pem (failure)
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `Failed authorization procedure` | 验证失败（证明不了域名是你的） |
| `http-01` | 用的是 HTTP 文件验证 |
| `The server could not connect` | **对方连不上你的服务器** |
| `47.98.xx.xx: Fetching http://...` | 它试图访问这个地址 |
| `Timeout during connect (likely firewall problem)` | **超时，大概率是防火墙** |
| `All simulated renewals failed` | 全部失败 |

**怎么查（按顺序）：**

```bash
# ① 80 端口还在监听吗
sudo ss -tlnp | grep :80

# ② 本机能访问吗
curl -I http://127.0.0.1

# ③ 防火墙
sudo ufw status

# ④ 安全组（去云控制台看）
```

**⚠️ 最常见的真实原因：**

```text
你为了"安全"，把 80 端口从安全组里删了，只留 443。
→ 网站能访问（https），但续期永远失败。
→ 90 天后证书过期，网站打不开。
```

**80 端口必须一直开着，就是为了续期。** 这不是"多余的门"，这是"续期的通道"。

## 5.4 手动续期（演练之外）

**如果真的快过期了，可以立刻续：**

```bash
sudo certbot renew
```

**它只会续"30 天内到期"的证书。想强行续：**

```bash
sudo certbot renew --force-renewal
```

**⚠️ `--force-renewal` 会消耗 Let's Encrypt 的频率配额。** 同一域名每周签发次数有限，不要反复跑。

**续完要 reload Nginx 吗：**

```text
certbot 的续期钩子会自动 reload nginx。
你可以查：sudo certbot renew --dry-run 的输出里有没有 "Running post-hook"。
如果你自己改过配置，最好手动 reload 一次确认。
```

## 5.5 一张"证书生命周期"表

| 时间点 | 证书状态 | 你要做什么 |
|---|---|---|
| 第 0 天 | 签发，89 天 | 做一次 `--dry-run` |
| 第 30 天 | 还剩 60 天 | 看一次 `certbot certificates` |
| 第 55 天 | 还剩 35 天 | 确认 `--dry-run` 还是成功 |
| 第 60 天 | 还剩 30 天 | **certbot 开始自动续期** |
| 第 61 天 | 应该已续到 89 天 | 看 `certbot certificates` 确认到期日变新了 |
| 第 90 天 | 如果没续上 → **过期** | 网站打不开 |

**⚠️ 重点：第 60 天之后要去确认一次"到期日真的变了"。**

```text
如果自动续期一直在失败，你会在第 60—90 天之间有一整个月的时间发现它。
但如果你从来不查，就会在第 90 天早上发现网站挂了。
```

**第 223 节会把"每月查一次证书"写进运维日历。**

---

# 第 6 步：跳转与混合内容（20 分钟）

## 6.1 跳转是怎么实现的

**certbot 选 `2` 之后，你的 Nginx 配置被改成了这样：**

```bash
sudo cat /etc/nginx/sites-available/default
```

**应该看到类似：**

```nginx
server {
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = www.your-domain.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    if ($host = your-domain.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 404; # managed by Certbot
}
```

**逐段读：**

| 段 | 干什么 |
|---|---|
| 第一个 `server` 的 `listen 443 ssl;` | **监听 443，启用 TLS** |
| `ssl_certificate .../fullchain.pem` | 证书（含中间证书） |
| `ssl_certificate_key .../privkey.pem` | 私钥 |
| `include .../options-ssl-nginx.conf` | certbot 生成的"推荐加密参数"（协议版本、加密套件） |
| `ssl_dhparam .../ssl-dhparams.pem` | DH 参数（某些加密套件需要） |
| 第二个 `server` 的 `if ($host = ...) { return 301 ...; }` | **http 请求 301 跳到 https** |
| `return 404;` | 兜底：跳转条件都不满足时，返回 404 |

**⚠️ `# managed by Certbot` 是什么意思：**

```text
这行是 certbot 自动加的，续期时它会来找这些标记。
你手动改了这些行，续期可能出问题。
```

**所以：不要手改带 `# managed by Certbot` 的行。**

## 6.2 `301` 是什么

```text
301 Moved Permanently（永久重定向）
```

**浏览器收到 301 会做两件事：**

```text
① 立刻跳到新地址
② 把"这个旧地址要跳新地址"记在缓存里（可能记很久）
```

**验证跳转：**

```bash
curl -I http://your-domain.com
```

**应该看到：**

```text
HTTP/1.1 301 Moved Permanently
Server: nginx/1.24.0 (Ubuntu)
Date: Mon, 16 Nov 2026 10:30:12 GMT
Content-Type: text/html
Location: https://your-domain.com/
```

**逐行读：**

| 行 | 意思 | 你要确认什么 |
|---|---|---|
| `301 Moved Permanently` | 永久重定向 | 不是 302 / 307 |
| `Location: https://...` | 跳到这个地址 | **必须是 https** |

**⚠️ 用 `-L` 跟着跳一次：**

```bash
curl -IL http://your-domain.com
```

**`-L` = follow location，自动跳转。**

**应该看到两段响应：**

```text
HTTP/1.1 301 Moved Permanently
Location: https://your-domain.com/

HTTP/2 200
server: nginx/1.24.0 (Ubuntu)
x-powered-by: Express
```

**第一段是跳转，第二段是最终结果。**

## 6.3 为什么 301 而不是 302

| 状态码 | 名字 | 浏览器会缓存吗 | 用在哪 |
|---|---|---|---|
| 301 | 永久重定向 | **会，而且很久** | http → https（地址永久变了） |
| 302 | 临时重定向 | 一般不 | 登录后跳转、AB 测试 |

**用 301 的风险：**

```text
浏览器把它记死了。
你以后想改回 http（或者想换域名），老用户的浏览器还会往 https 跳。
```

**所以测试阶段不要用 301，用 302。** 上生产再用 301。

**⚠️ 这个坑在第 7 步的错误 5 里会演示。**

## 6.4 混合内容（Mixed Content）

**定义：https 的页面里，加载了 http 的资源。**

```text
页面本身：https://your-domain.com     ✅ 加密
页面里的图片：http://cdn.example.com/a.png   ❌ 明文
```

**浏览器会怎么处理：**

| 资源类型 | 浏览器行为 |
|---|---|
| 图片 / 音频 / 视频 | **拦截**（不显示） |
| CSS / JS | **拦截**（样式错乱、功能失效） |
| iframe | **拦截** |
| XHR / fetch | **拦截**（接口 404 或 CORS 报错） |

**控制台报错（Chrome）：**

```text
Mixed Content: The page at 'https://your-domain.com/' was loaded over HTTPS,
but requested an insecure image 'http://cdn.example.com/a.png'.
This content should also be served over HTTPS.
```

**或者：**

```text
Mixed Content: The page at 'https://your-domain.com/' was loaded over HTTPS,
but requested an insecure script 'http://cdn.example.com/app.js'.
This request has been blocked; the content must be served over HTTPS.
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `Mixed Content` | 混合内容 |
| `loaded over HTTPS` | 页面是 https |
| `requested an insecure image` | 请求了一个不安全的图片 |
| `has been blocked` | **被拦截了** |
| `must be served over HTTPS` | 必须用 https 提供 |

## 6.5 怎么修混合内容

**三种情况，三种修法：**

**情况 A：资源是你自己的**

```html
❌ <img src="http://your-domain.com/a.png">
✅ <img src="/a.png">                      相对路径，自动跟随页面协议
✅ <img src="https://your-domain.com/a.png"> 写死 https
```

**首选相对路径。** 它不关心当前是 http 还是 https，永远跟页面一致。

**情况 B：资源在第三方 CDN**

```html
❌ <script src="http://cdn.example.com/lib.js"></script>
✅ <script src="https://cdn.example.com/lib.js"></script>
```

**⚠️ 先确认对方支持 https。** 有些不正规的 CDN 只有 http，那就得换一个。

**情况 C：接口地址**

```js
❌ fetch('http://api.your-domain.com/data')
✅ fetch('https://api.your-domain.com/data')
✅ fetch('/api/data')            // 同域，走相对路径最省事
```

**如果你在代码里写死了 `http://`，全局搜一遍：**

```bash
grep -rn "http://" src/ --include="*.js" --include="*.html" --include="*.jsx"
```

**应该看到所有可疑的地方。**

**⚠️ 注意：`http://localhost` 和 `http://127.0.0.1` 不算混合内容问题**（浏览器对 localhost 有豁免）。但如果这段代码部署到线上，就会出问题。

## 6.6 HSTS：一个不能随便开的开关

**HSTS = HTTP Strict Transport Security。**

**加了这个响应头之后：**

```text
浏览器会记住"这个域名以后只能用 https"，
连 http 都不尝试，直接内部跳转。
```

**Nginx 写法：**

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

**`max-age=31536000` = 一年。**

**⚠️ 这是一个"单向门"：**

```text
一旦浏览器收到这个头，它在 max-age 期间会强制走 https。
你的证书要是过期了，用户连"继续访问（不安全）"的按钮都点不到，
页面直接打不开，而且清缓存没用。
```

**所以：**

```text
① 不要在上线第一天就加
② 要加，先从小值开始：max-age=300（5 分钟）
③ 稳定运行一个月后，再改成 31536000
④ includeSubDomains 更要谨慎 —— 它会影响所有子域名，
   包括你还没上 https 的那些
```

**这一节不要求你加 HSTS。** 先让 https 稳定跑一个月。

---

# 第 7 步：故意犯七个错（30 分钟）

## 错误 1：解析没生效就签证书

**操作：**

1. 把 `www` 的 A 记录删掉；
2. 立刻运行：

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

**会怎样：**

```text
Requesting a certificate for your-domain.com and www.your-domain.com
An unexpected error occurred:
Error creating new order :: Cannot issue for "www.your-domain.com": Domain name does not end with a valid public suffix (TLD)
Ask for help or search for solutions at https://community.letsencrypt.org. See the logfile /var/log/letsencrypt/letsencrypt.log or re-run Certbot with -v for more details.
```

**或者更常见的：**

```text
Detail: DNS problem: NXDOMAIN looking up A for www.your-domain.com
 - check that a DNS record exists for this domain
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `Error creating new order` | 创建订单失败 |
| `DNS problem: NXDOMAIN` | 查不到这个域名的 A 记录 |
| `check that a DNS record exists` | 去检查解析记录 |

**为什么：**

```text
HTTP-01 验证的第一步是"解析这个域名，看它指向哪台服务器"。
解析不出来，后面全免谈。
```

**怎么修：**

```text
① 把 www 的 A 记录加回来
② 等生效（ping 确认）
③ 再签
```

**⚠️ 不要反复重试。** Let's Encrypt 对"验证失败"有频率限制：

```text
too many failed authorizations recently: see https://letsencrypt.org/docs/failed-validation-limit/
```

**看到这句，说明你已经被限流了 —— 等一小时再试。**

## 错误 2：80 端口没开

**操作：**

1. 在云厂商安全组里，把 80 端口删掉（只留 22 和 443）；
2. `ping` 是通的，`curl -I https://` 也是通的；
3. 运行 `sudo certbot renew --dry-run`。

**会怎样：**

```text
Simulating renewal of an existing certificate for your-domain.com
Failed authorization procedure. your-domain.com (http-01): urn:ietf:params:acme:error:connection :: The server could not connect to the client to verify the domain :: 47.98.xx.xx: Fetching http://your-domain.com/.well-known/acme-challenge/AbCdEf123: Timeout during connect (likely firewall problem)
All simulated renewals failed.
```

**为什么：**

```text
certbot 用的是 HTTP-01 验证，走的是 80 端口。
你关了 80，验证服务器连不上，续期必然失败。
```

**为什么这个错最阴：**

```text
网站现在好好的（443 通）。
你测网站，正常。
你以为一切正常。
60 天后证书过期，网站突然打不开，而你已经忘了自己删过 80。
```

**怎么修：**

```text
把 80 加回安全组。不是为了访问网站，是为了续期。
```

**⚠️ 记住这条：**

> **80 端口有两个用途：跳转到 https，和续期。第二个用途不能省。**

## 错误 3：只签了裸域名，没签 www

**操作：**

```bash
sudo certbot --nginx -d your-domain.com
```

**然后浏览器访问：**

```text
https://www.your-domain.com
```

**会怎样：**

**Chrome：**

```text
您的连接不是私密连接
攻击者可能会试图从 www.your-domain.com 窃取您的信息（例如：密码、消息或信用卡）。
NET::ERR_CERT_COMMON_NAME_INVALID
```

**点"高级"：**

```text
此服务器无法证明它是 www.your-domain.com；
其安全证书来自 your-domain.com。
错误代码：NET::ERR_CERT_COMMON_NAME_INVALID
```

**Firefox：**

```text
警告：面临潜在的安全风险
www.your-domain.com 使用了无效的安全证书。
该证书仅对以下名称有效：your-domain.com
错误代码：SSL_ERROR_BAD_CERT_DOMAIN
```

**为什么：**

```text
证书上写的是"我证明 your-domain.com 是这台服务器"。
它没有说 www.your-domain.com。
浏览器严格比对，不一致就报错。
```

**怎么修：**

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com --expand
```

**`--expand` 是什么：** "如果已有证书覆盖了一部分域名，扩展它，而不是新建一张"。

**⚠️ 不加 `--expand` 会怎样：**

```text
certbot 会新建一张证书，覆盖两个域名，
然后问你"要不要替换旧的"。
多一步交互，结果一样，但容易选错。
```

**更省事的做法：一开始就把 `-d www` 加上。** 子域名不花钱，证书也不花钱。

## 错误 4：证书过期（模拟）

**操作：**

**真实过期要等 90 天，这里用"看一个过期证书"的方式模拟。**

**方法：连一个知名网站的旧证书，或者用 `-servername` 指向一个证书已过期的测试域名。**

**更实际的做法（不用等）：**

```bash
# 看当前证书还剩多久
sudo certbot certificates
```

**假设你看到：**

```text
Expiry Date: 2026-11-10 09:58:11+00:00 (INVALID: EXPIRED)
```

**浏览器会显示：**

```text
您的连接不是私密连接
NET::ERR_CERT_DATE_INVALID
```

**点"高级"：**

```text
此服务器的日期/时间不正确。
NET::ERR_CERT_DATE_INVALID
```

**为什么这句话会误导人：**

```text
浏览器说"日期不正确"，你会以为是服务器时间错了。
实际上 90% 的情况是"证书过期了"，不是"服务器时间错了"。
```

**怎么确认：**

```bash
date -u
```

**服务器 UTC 时间：**

```text
Mon Nov 16 10:45:12 UTC 2026
```

**再对比证书的 `notAfter`。**

**如果是证书过期：**

```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

**⚠️ 这也是为什么第 5 步的 `--dry-run` 必须做。** 演练过，你就知道真过期时该敲哪条命令。

## 错误 5：跳转写成了死循环

**操作：**

**把 certbot 生成的跳转块改成一个错误的版本：**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 错误写法：把所有 http 请求转到 https
    return 301 https://your-domain.com$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    # 错误写法：443 又转回 http
    return 301 http://your-domain.com$request_uri;

    ssl_certificate ...;
}
```

**浏览器访问：**

```text
https://your-domain.com
```

**会怎样：**

```text
ERR_TOO_MANY_REDIRECTS
此网页无法正常运作
your-domain.com 将您重定向的次数过多。
```

**为什么：**

```text
http → https → http → https → ...
浏览器跳了 20 次左右就放弃，报这个错。
```

**⚠️ 更隐蔽的一种死循环：**

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # 用了 $scheme 做判断，但写错了
    if ($scheme = http) {
        return 301 https://$host$request_uri;
    }
}
```

**在 443 的 server 块里，`$scheme` 永远是 `https`，这个 `if` 永远不会触发 —— 不报错，但也不起作用。**

**怎么修：**

```text
跳转只写在 80 的 server 块里，443 的块里只放正常业务。
```

**正确写法（手写版）：**

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

**`$host` 和 `$request_uri` 各是什么：**

| 变量 | 值（举例） |
|---|---|
| `$host` | `your-domain.com`（不带协议、不带路径） |
| `$request_uri` | `/chat?id=3`（带路径和参数） |

**拼起来就是完整的跳转地址。**

## 错误 6：混合内容

**操作：**

**在你的页面里加一张 http 图片：**

```html
<img src="http://your-domain.com/logo.png" alt="logo">
```

**用 https 打开页面，按 F12 看 Console。**

**会怎样：**

```text
Mixed Content: The page at 'https://your-domain.com/' was loaded over HTTPS,
but requested an insecure image 'http://your-domain.com/logo.png'.
This content should also be served over HTTPS.
```

**页面表现：**

```text
图片位置是一个破图标，或者干脆什么都没有。
```

**如果是 JS：**

```html
<script src="http://your-domain.com/app.js"></script>
```

**报错变成：**

```text
Mixed Content: The page at 'https://your-domain.com/' was loaded over HTTPS,
but requested an insecure script 'http://your-domain.com/app.js'.
This request has been blocked; the content must be served over HTTPS.
```

**后果更严重：**

```text
整个脚本不执行，页面的交互全部失效。
而你在本地 http 环境下测试，一切正常。
```

**为什么本地测不出来：**

```text
本地是 http://localhost:3000，页面和资源都是 http，不存在"混合"。
一上 https 就暴露。
```

**怎么修：**

```html
<img src="/logo.png">
<script src="/app.js"></script>
```

**用相对路径。** 它跟着页面协议走，http 页面加载 http 资源，https 页面加载 https 资源，永远不会混。

## 错误 7：用 IP 访问 https

**操作：**

```bash
curl -I https://47.98.xx.xx
```

**或者浏览器打开：**

```text
https://47.98.xx.xx
```

**会怎样：**

```text
curl: (60) SSL: no alternative certificate subject name matches target host name '47.98.xx.xx'
More details here: https://curl.se/docs/sslcerts.html
```

**浏览器：**

```text
您的连接不是私密连接
NET::ERR_CERT_COMMON_NAME_INVALID
此服务器的证书仅对以下域名有效：your-domain.com
```

**为什么：**

```text
证书是签给"域名"的，不是签给"IP"的。
Let's Encrypt 不签 IP 证书。
浏览器比对 URL 里的主机名和证书上的域名，不一致就报错。
```

**这意味着：**

```text
① 你的客户永远要用域名访问，不能给 IP
② 任何"用 IP 访问 https"的测试都是无效测试
③ 如果域名解析挂了，https 也一起挂 —— 没有"IP 兜底"这回事
```

**怎么修：**

```text
用域名访问。这就是第 218 节必须先做的原因。
```

---

# 第 8 步：写学习笔记（10 分钟）

```markdown
# 第 220 节课学习笔记

## 一、签发前我检查了什么

| 检查项 | 我的结果 |
|---|---|
| 域名解析 | |
| www 解析 | |
| 80 端口内部 | |
| 80 端口外部 | |
| 80 端口占用程序 | |

为什么 HTTP-01 验证需要 80 端口：

## 二、我的证书信息

- 域名：
- 签发日期：
- 到期日期：
- 还剩几天：
- 证书路径：
- 私钥路径：

`fullchain.pem` 和 `cert.pem` 的区别：

`privkey.pem` 泄露会怎样：

## 三、签发命令

我用的完整命令：

`-d` 可以写几个：

`--expand` 是干什么的：

## 四、验证

浏览器地址栏显示什么：

`curl -I https://` 的第一行：

`openssl ... -dates` 的输出：

`certbot certificates` 里 `(VALID: xx days)` 是多少：

## 五、自动续期

`systemctl list-timers | grep certbot` 的输出：

`certbot renew --dry-run` 最后两行：

为什么 90 天的证书反而比 1 年的更可靠：

certbot 在到期前多少天开始续：

## 六、跳转

`curl -I http://` 返回什么：

`Location:` 是什么：

301 和 302 的区别：

为什么测试阶段不要用 301：

## 七、混合内容

我在控制台看到的报错原文：

我是怎么修的：

为什么用相对路径就不会有这个问题：

## 八、七个错误的后果

| 错误 | 报错原文 | 怎么修 |
|---|---|---|
| 解析没生效就签 | | |
| 80 端口没开 | | |
| 只签裸域名 | | |
| 证书过期 | | |
| 跳转死循环 | | |
| 混合内容 | | |
| 用 IP 访问 https | | |

## 九、我还不懂的词

-

## 十、完成检查

- [ ] 我的网站 https 能打开，地址栏有锁
- [ ] http 会自动跳到 https
- [ ] 我跑过 `certbot renew --dry-run` 且成功
- [ ] 我知道证书什么时候到期
- [ ] 我用 openssl 看过证书的有效期
- [ ] 我做过至少五个错误实验
```

---

# 第 9 步：课后练习（40 分钟）

## 练习一：给你的证书做一张"身份证"

**要求：**

1. `sudo certbot certificates` 拿全部信息；
2. `openssl` 看 `notBefore` / `notAfter`；
3. 算一下"还剩几天"；
4. 把到期日加进手机日历，提前 30 天提醒。

**记录什么：**

```text
域名列表：
签发时间（GMT / 北京时间）：
到期时间（GMT / 北京时间）：
还剩几天：
我加的日历提醒日期：
```

**思考题：**

> 为什么"提前 30 天"提醒，而不是"提前 3 天"？

## 练习二：把跳转改成手写版

**要求：**

1. 备份当前配置；
2. 把 certbot 生成的 `if ($host = ...)` 跳转块删掉；
3. 手写一个 `return 301 https://$host$request_uri;` 的 80 块；
4. `nginx -t && systemctl reload nginx`；
5. `curl -IL http://your-domain.com` 确认还是跳转。

**记录什么：**

```text
改之前第二个 server 块的内容：
改之后的内容：
curl -IL 的两段响应：
```

**思考题：**

> certbot 用 `if` 判断 `$host`，你用一个 `return` 直接跳。两种写法在"有多个域名"时行为一样吗？

## 练习三：制造一次混合内容并修好

**要求：**

1. 在页面里加一张 `http://` 的图片；
2. 用 https 打开，F12 记录完整报错；
3. 改成相对路径；
4. 刷新，确认报错消失、图片出现。

**记录什么：**

```text
报错原文（完整复制）：
改之前 src 是什么：
改之后 src 是什么：
```

**思考题：**

> 如果这张图片在第三方服务器上，而那个服务器**不支持 https**，你有什么办法？

## 练习四：模拟一次证书过期

**要求（不要真的把线上搞挂）：**

1. 在一个**不重要的测试域名**上做；
2. 或者只做"读"的部分：找到 `certbot certificates` 里的到期日；
3. 写下"如果今天过期了，我要按什么顺序操作"；
4. 把命令抄在纸上，不看课件敲一遍（在测试环境）。

**记录什么：**

```text
证书过期时浏览器的报错：
第一步敲什么：
第二步敲什么：
怎么确认修好了：
```

**思考题：**

> 如果证书过期时你正好在国外，只有一个手机，你能修好吗？需要什么前提？

## 练习五：用自己的话讲

```text
① 为什么证书只能签给域名，不能签给 IP？
② certbot 的 HTTP-01 验证，为什么必须要 80 端口？
③ 为什么 90 天的证书比 1 年的更安全？
④ 301 和 302 的区别，为什么测试时不能用 301？
⑤ 混合内容为什么在本地测不出来？
```

---

# 第 10 步：最终验收（10 分钟）

## A. 概念

- [ ] 我知道证书是"域名属于这台服务器"的证明
- [ ] 我知道 Let's Encrypt 免费、90 天、需要自动续期
- [ ] 我知道 `fullchain.pem` 和 `privkey.pem` 各自的用途
- [ ] 我知道 80 端口必须一直开着，因为续期要用
- [ ] 我知道混合内容是什么，以及为什么相对路径能避免

## B. 实操

- [ ] `https://your-domain.com` 能打开，地址栏有锁
- [ ] `http://` 自动 301 跳到 `https://`
- [ ] `curl -I https://` 第一行是 `HTTP/2 200`
- [ ] 我用 `openssl` 看过证书有效期
- [ ] `certbot certificates` 能列出我的证书和剩余天数
- [ ] `certbot renew --dry-run` 输出 `all simulated renewals succeeded`
- [ ] 我把到期日加进了日历

## C. 排错

- [ ] 看到 `NXDOMAIN looking up A`，我知道是解析问题
- [ ] 看到 `Timeout during connect (likely firewall problem)`，我知道是 80 端口
- [ ] 看到 `ERR_CERT_COMMON_NAME_INVALID`，我知道是证书没覆盖这个域名
- [ ] 看到 `ERR_CERT_DATE_INVALID`，我先去查证书到期日，不是去改系统时间
- [ ] 看到 `ERR_TOO_MANY_REDIRECTS`，我知道是跳转写成了环
- [ ] 控制台一片 `Mixed Content`，我知道要去改资源地址

## D. 交付

- [ ] `03-练习代码/证书信息.md` 有域名、签发日、到期日
- [ ] `03-练习代码/https-验证.md` 有跳转验证 + dry-run 输出
- [ ] 页面里没有 `http://` 的资源引用

## E. 笔记

- [ ] `NOTES.md` 十栏都填了
- [ ] 「七个错误的后果」写了真实报错原文
- [ ] 「我还不懂的词」有内容

## 本节课要能说出口的一句话

> **证书签下来只要三分钟，让它一直在才叫运维；而 80 端口不是给用户走的门，是给续期走的通道。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `DNS problem: NXDOMAIN` | 域名没解析 / 解析没生效 | 先 `ping`，确认 IP 对 |
| `Timeout during connect` | 80 端口没开 / 防火墙 | 安全组 + `ufw status` |
| `too many failed authorizations` | 反复失败被限流 | 等一小时，别重试 |
| `The requested nginx plugin does not appear to be installed` | 漏装插件 | `apt install python3-certbot-nginx` |
| `Problem binding to port 80` | 80 被别的程序占了 | `ss -tlnp \| grep :80` |
| 浏览器 `ERR_CERT_COMMON_NAME_INVALID` | 证书没覆盖这个域名 | `--expand` 加 `-d` |
| 浏览器 `ERR_CERT_DATE_INVALID` | 证书过期 / 系统时间错 | `certbot certificates` 看到期日 |
| 浏览器 `ERR_TOO_MANY_REDIRECTS` | 跳转成环 | 只在一个方向写 301 |
| `curl: (60) unable to get local issuer certificate` | 用了 `cert.pem` 不是 `fullchain.pem` | 改成 fullchain |
| `curl: (60) no alternative certificate subject name` | 证书域名不匹配 | 用域名访问，别用 IP |
| 页面图片不显示，控制台 `Mixed Content` | 资源是 http | 改相对路径或 https |
| `certbot renew --dry-run` 失败 | 80 端口 / 解析 / Nginx 配置 | 按报错逐项查 |
| 续期成功但浏览器还是旧证书 | 没 reload Nginx | `systemctl reload nginx` |
| `certbot certificates` 里没我的证书 | 当时签发失败了 | 看 `/var/log/letsencrypt/letsencrypt.log` |
| 想删掉重签 | —— | 先 `certbot delete`，注意频率限制 |
| 加了 HSTS 后无法回退 | 浏览器记住了 | 清 HSTS 缓存，或等 max-age 过期 |
| 手机能开、电脑报证书错 | 电脑时间不对 / 缓存 | 校准系统时间，清浏览器缓存 |
| `www` 打不开但裸域名可以 | 只签了一个域名 | `--expand` 补上 |
| 证书还剩 20 天没续 | 正常（30 天内才续） | 等到 30 天内再看 |
| 证书还剩 5 天没续 | 自动续期坏了 | 手动 `certbot renew`，查原因 |
| `apt install` 卡住不动 | 网络 / 源慢 | 换国内源，或重试 |
