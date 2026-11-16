# 第 219 节课：备案与绑定——国内这条硬门槛

> 上节课 `ping your-domain.com` 已经能返回你的服务器 IP 了。但 IP 通了不等于"能合法对外提供访问"。
> 这节课讲两件事：**在中国大陆，什么情况下你根本不允许开站**；以及**Nginx 怎么知道"这个域名找的是我"**。

**建议用时**：110 分钟
**你需要先完成**：第 218 节课（`ping your-domain.com` 返回你的服务器 IP）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
域名解析生效了              ping your-domain.com → 47.98.xx.xx
Nginx 在跑                  systemctl status nginx → active
浏览器输 IP 能打开应用      http://47.98.xx.xx → 你的页面
浏览器输域名也能打开        但打开的是"哪个站点"说不清
```

**注意最后一行：**

> **"能打开"和"打开的是对的站点"是两件事。**

## 0.2 你以后会遇到什么

```text
① 你在国内服务器上配好了，域名一解析，访问被拦截到一个提示页
② 客户问你"这个要备案吗，多久"，你答不上来
③ 你在一台服务器上放了两个客户的项目，两个域名打开的是同一个站
④ 你按教程改了 Nginx 配置，reload 完网站直接 502
⑤ 备案下来了，但网站底部没放备案号，被人举报
```

**这五件事，前两件是"资格"问题，后三件是"绑定"问题。今天两件都解决。**

## 0.3 今天要建立的三个概念

```text
① 备案 = 主体 + 域名 + 服务器 三者的绑定，缺一个都不成立
② server_name = Nginx 用来判断"这个请求该给哪个站点"的钥匙
③ 默认站点 = 没有匹配到任何 server_name 时，Nginx 兜底的那一个
```

**第 ③ 个概念是 90% 的"两个域名打开同一个站"的根因。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `server_name-修改记录.md` | `03-练习代码/` | 改前 / 改后的配置片段 + `nginx -t` 输出 |
| `备案判断表.md` | `03-练习代码/` | 你的项目要不要备案、依据、要做什么 |
| `NOTES.md` | `02-笔记` | 学习记录 |

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **三个地方，按顺序：**<br><code>① 浏览器：备案系统（如果要备案）</code><br><code>② 服务器：改 nginx 的 server_name</code><br><code>③ 你的 Windows：验证</code> |
| **用哪个终端** | **浏览器 + Git Bash（SSH 到服务器）+ Git Bash（本地验证）**，可能同时开三个窗口。 |
| **现在在哪个目录** | **服务器：**<br><code>ssh root@你的服务器IP</code><br><code>cd /srv/app</code><br>**本地验证：**<br><code>cd "B:/OPC-Distance_study/每周课程/06-上线运维/第32周-域名与运维/第02节课/03-练习代码"</code> |
| **本节新建什么** | `备案记录.md`（备案号、提交日期、预计下号日期；不需要备案就写清原因）<br>服务器上：`server_name` 改成真域名 |

## 开工前先跑这一条

确认你没站错地方：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://your-domain.com
```

**应该看到：**

**两种都可能，都对：**

```text
200
```

或

```text
000
```

**`000` 也正常** —— 如果域名还没解析到这台服务器，或备案还没下来。这一节就是要把 `000` 变成 `200`。

## 如果不对

**`200` 但页面不是你的应用** → `server_name` 没改，nginx 给了默认站点。

**`403`** → 目录没有 index，或 `root` 指错了。

**`000`** → 先回第 218 节确认解析生效。

---

# 第 1 步：备案，先判断你要不要（25 分钟）

## 1.1 一句话规则

> **服务器在中国大陆境内，域名必须备案。没有例外。**

**反过来也成立：**

> **服务器不在大陆，就不用备案，但访问会慢。**

## 1.2 四种情况，对号入座

| 你的服务器在哪 | 要备案吗 | 国内访问速度 | 适合什么 |
|---|---|---|---|
| **中国大陆**（北京/上海/广州/成都…） | **必须** | 快（20—50ms） | 正经做生意、客户在国内 |
| **中国香港** | 不用 | 中等（30—80ms） | 备案没下来时的过渡、海外客户 |
| **海外**（新加坡/日本/美国） | 不用 | 慢（100—300ms） | 客户在海外 |
| **只是本地开发**（localhost） | 不用 | —— | 学习和开发 |

**⚠️ 一个真实的误区：**

```text
"我服务器在香港，域名解析到香港，应该也算国内吧？"
→ 不算。备案看的是"服务器物理位置"，不是"域名的注册地"。
```

**另一个误区：**

```text
"我先用香港服务器上线，等备案下来再迁回国内。"
→ 可以做，但要提前规划迁移。
→ 迁移 = 换 IP = 改解析 = 等 TTL。第 218 节学的 TTL 预热在这里用上。
```

## 1.3 备案到底是什么

**大白话：向工信部登记"这个域名、这个人、这台服务器"三者的关系。**

```text
主体（谁）     你的身份证 / 公司营业执照
域名（什么名字） your-domain.com
服务器（在哪）  你买的那台国内服务器的"备案服务码"
```

**三者必须对得上：**

```text
域名持有者   =  备案主体
服务器       =  备案时填的那台
网站内容     =  备案时填的"网站名称和内容"
```

**⚠️ 三条最常见的驳回原因：**

| 驳回原因 | 具体表现 |
|---|---|
| 域名持有者与主体不一致 | 域名在张三名下，用李四的身份证备案 |
| 网站名称违规 | 名字里带"中国""国家""金融""新闻"等敏感词 |
| 网站内容与主体不符 | 个人备案，但网站是"XX 科技提供技术服务" |

**第三条最容易踩：**

```text
个人备案 → 网站只能是"个人分享/博客"性质
公司备案 → 才能写"提供产品和服务"
你用个人身份备案一个要收钱的 SaaS，审核会卡。
```

## 1.4 要准备什么材料

| 材料 | 说明 |
|---|---|
| 身份证正反面 | 个人备案 |
| 营业执照 | 公司备案，还要法人身份证 |
| 手机号 | 要能接收验证码，且实名在本人名下 |
| 已实名的域名 | 域名先做实名认证，否则不能备案 |
| 服务器的备案服务码 | 在云厂商控制台申请，一台服务器通常 5 个码 |
| 网站名称 | 2—20 个字，不能有敏感词 |
| 网站内容说明 | 一段话，写清这个站是干什么的 |
| 人脸核验 | 现在基本都要，手机上按提示做 |

**⚠️ "备案服务码"是有数量限制的。**

```text
一台服务器通常给 5 个备案服务码 = 最多备 5 个域名。
用完就没了，要买新服务器才有新的。
```

**这就是为什么"一个主域名 + 无限子域名"这么重要** —— 一个备案码能覆盖整个主域名下的所有子域名。

## 1.5 备案是按主域名备的

**这是最省事的一条规则：**

```text
你备案了 your-domain.com
  → your-domain.com          ✅ 可以用
  → www.your-domain.com      ✅ 可以用
  → api.your-domain.com      ✅ 可以用
  → client-a.your-domain.com ✅ 可以用
  → 任何 xxx.your-domain.com ✅ 都可以用
```

**子域名不需要单独备案。**

**但反过来不成立：**

```text
你备案了 api.your-domain.com（单独备一个子域名）
  → your-domain.com 仍然不能在国内服务器上开
```

**所以永远按主域名备。**

## 1.6 时间：7 到 20 个工作日

```text
提交 → 云厂商初审（1—2 天）
     → 管局审核（5—20 个工作日）
     → 下发备案号
```

**"工作日"是不含周末和节假日的。**

**最坏情况：**

```text
春节前提交 → 赶上放假 → 实际等一个月
```

**⚠️ 所以：**

```text
决定用国内服务器的那一刻，就去提交备案。
不要等代码写完、不要等设计定稿、不要等"准备好了"。
备案和开发并行。
```

## 1.7 备案期间，网站不能对外访问

**这是硬规定，不是建议。**

```text
备案审核期间，域名不能解析到国内服务器上提供访问。
有些云厂商会监测 80 端口的访问，发现未备案域名有流量，会直接拦截。
```

**"拦截"长什么样：**

```text
浏览器打开 → 一个提示页，写着"该网站未备案"或"无法访问"
curl -I → 返回 403 或一个奇怪的 200（拦截页）
```

**正确的过渡方案：**

| 阶段 | 怎么做 |
|---|---|
| 提交备案前 | 本地开发 + `localhost` |
| 备案审核中 | 用**香港服务器**或**临时 IP 访问**（IP 访问不受域名备案限制，但不适合给客户） |
| 备案下来后 | 解析指向国内服务器 |
| 上线后 | 网站底部放备案号 |

**⚠️ 不要做的事：**

```text
❌ 备案期间把域名解析到国内服务器"试试能不能访问"
   → 会被监测到，可能影响审核，甚至被要求整改

❌ 备案期间用国内服务器 + 域名给客户演示
   → 同上，而且客户看到拦截页，印象全毁
```

## 1.8 备案号要放在网站上

**备案通过后，你会拿到一个号，长这样：**

```text
京ICP备2026000000号-1
```

**要求：**

```text
① 放在网站首页底部
② 必须链接到 https://beian.miit.gov.cn
③ 不能藏起来（不能用白色字、不能 display:none）
```

**HTML 大概长这样（放在 footer 里）：**

```html
<footer>
  <a href="https://beian.miit.gov.cn" target="_blank" rel="noopener">
    京ICP备2026000000号-1
  </a>
</footer>
```

**⚠️ 还有一种备案：公安联网备案。**

```text
ICP 备案通过后，通常要求在 30 日内到"全国互联网安全管理服务平台"做公安备案。
拿到第二个号，也要放在网站底部。
具体要求以你所在地区管局的通知为准。
```

**这两个号都要放。少一个都算不合规。**

## 1.9 写你的《备案判断表》

**在 `03-练习代码/备案判断表.md` 里填：**

```markdown
# 备案判断表

## 1. 我的情况

- 服务器位置：中国大陆 / 香港 / 海外
- 域名：
- 域名注册商：
- 主体类型：个人 / 公司
- 网站用途：

## 2. 判断

要不要备案：
依据：

## 3. 如果要备案

- 备案服务码有没有：
- 域名实名做了吗：
- 材料齐了吗：
- 计划提交日期：
- 预计下来日期：
- 备案期间网站怎么办：

## 4. 如果不用备案

- 为什么不用的依据：
- 速度能不能接受：
- 以后要不要迁回国内：如果要，迁移计划是什么

## 5. 备案号（下来后填）

- ICP 备案号：
- 公安备案号：
- 放在哪个文件里：
```

**这张表不是作业，是决策记录。** 三个月后你会忘了为什么选香港，这张表能告诉你。

---

# 第 2 步：先看懂 Nginx 的配置文件结构（20 分钟）

## 2.1 为什么不能直接改

**因为你可能改错文件。**

Nginx 的配置有**两层**：

```text
/etc/nginx/nginx.conf                  主配置（全局）
/etc/nginx/sites-available/default     站点配置（每个站一个文件）
/etc/nginx/sites-enabled/default       软链接，指向上面那个
```

**关系是这样：**

```text
nginx.conf
   └── include /etc/nginx/sites-enabled/*;
         ├── default        →  软链接  →  ../sites-available/default
         └── mysite         →  软链接  →  ../sites-available/mysite
```

**为什么要这么绕：**

```text
sites-available   = 所有写好的站点配置（不一定启用）
sites-enabled     = 当前真正生效的站点（都是软链接）
```

**好处：想临时关掉一个站，删掉 `sites-enabled` 里的软链接就行，配置本身还在。**

## 2.2 先看清楚现状

**登录服务器：**

```bash
ssh root@47.98.xx.xx
```

**看目录：**

```bash
ls -l /etc/nginx/sites-enabled/
```

**应该看到：**

```text
total 0
lrwxrwxrwx 1 root root 34 Nov 10 10:12 default -> /etc/nginx/sites-available/default
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `lrwxrwxrwx` | 开头的 `l` 表示这是一个**软链接**（不是真文件） |
| `1` | 硬链接数 |
| `root root` | 所有者 / 所属组 |
| `34` | 链接目标路径的长度（字节） |
| `Nov 10 10:12` | 创建时间 |
| `default -> /etc/nginx/sites-available/default` | **箭头右边才是真文件** |

**看真文件：**

```bash
sudo cat /etc/nginx/sites-available/default
```

**应该看到类似（Ubuntu 默认配置，版本不同会有差异）：**

```nginx
##
# You should look at the following URL's in order to grasp a solid understanding
# of Nginx configuration files in order to fully unleash the power of Nginx.
##

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

**如果你在第 31 周改过，`root` 和 `location` 可能已经是你的项目了：**

```nginx
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**逐行读这个 server 块：**

| 行 | 意思 | 现在的问题 |
|---|---|---|
| `server {` | 一个站点配置的开始 | —— |
| `listen 80 default_server;` | 监听 80 端口，**并且是默认站点** | `default_server` 是关键，见 4.3 |
| `listen [::]:80 default_server;` | 同上，IPv6 | 没有 IPv6 可以删，但留着也无害 |
| `root /var/www/html;` | 网站根目录（静态文件） | 用 `proxy_pass` 时这行不起作用 |
| `index index.html;` | 默认首页文件 | 同上 |
| `server_name _;` | **"我是默认站点，什么域名都接"** | **这就是今天要改的** |
| `location / { ... }` | 所有路径都按这个规则处理 | —— |
| `proxy_pass http://127.0.0.1:3000;` | 转发给本机 3000 端口的 Node | 第 31 周配的 |
| `}` | 这个站点结束 | —— |

## 2.3 `server_name _;` 到底什么意思

**`_` 是一个"不可能成为真实域名"的占位符。**

**它的作用是：**

```text
当请求的 Host 头匹配不到任何其他 server_name 时，
Nginx 就把请求交给这个站点。
```

**注意：真正让它"兜底"的不是 `_`，是 `default_server` 这个标记。**

```text
listen 80 default_server;   ← 这才是"我是默认"的声明
server_name _;              ← 这只是个占位，写 _ 是习惯
```

**如果你把 `default_server` 去掉，`server_name _;` 就只是一个永远不会匹配的站点，请求会落到"第一个被加载的 server 块"。**

**这个细节很重要，因为它是"两个域名打开同一个站"的第二种成因。**

---

# 第 3 步：改 `server_name`（25 分钟）

## 3.1 先备份

**⚠️ 改任何配置前，先备份。这条规则跟一辈子。**

```bash
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak-$(date +%F)
```

**`$(date +%F)` 是什么：** 插入今天的日期，格式 `2026-11-16`。

**验证备份存在：**

```bash
ls -l /etc/nginx/sites-available/
```

**应该看到：**

```text
-rw-r--r-- 1 root root 2412 Nov 10 10:12 default
-rw-r--r-- 1 root root 2412 Nov 16 17:40 default.bak-2026-11-16
```

**两个文件大小一样，说明备份成功。**

**为什么要带日期：**

```text
default.bak           → 第二次备份会覆盖第一次
default.bak-2026-11-16 → 每次都是新文件，能回退到任意一天
```

## 3.2 编辑配置

```bash
sudo nano /etc/nginx/sites-available/default
```

**nano 的五个键（第 31 周学过，再确认一次）：**

```text
直接打字              输入
Ctrl + O              保存（然后按 Enter 确认文件名）
Ctrl + X              退出
Ctrl + W              搜索
Ctrl + K              删掉当前行
```

**把 `server_name _;` 改成你的域名：**

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**⚠️ 三个细节，错一个就出问题：**

| 细节 | 正确 | 错误 | 后果 |
|---|---|---|---|
| 分号 | `server_name a.com;` | `server_name a.com` | 启动失败 |
| 协议 | `server_name a.com;` | `server_name http://a.com;` | 启动失败 |
| 多个域名 | 空格分隔 | 逗号分隔 | 启动失败或只认第一个 |

**为什么 `server_name` 里不能写 `http://`：**

```text
server_name 匹配的是 HTTP 请求头里的 Host 字段。
Host 字段里只有域名和端口，从来没有 "http://"。
```

**为什么多个域名用空格不用逗号：**

```text
Nginx 的配置语法里，空格是分隔符。
逗号会被当成域名的一部分，变成 "a.com," 这个不存在的名字。
```

## 3.3 检查语法

```bash
sudo nginx -t
```

**应该看到：**

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `syntax is ok` | 语法没问题（括号、分号、指令名都对） |
| `test is successful` | 语义也没问题（文件存在、端口不冲突） |

**⚠️ 这两行必须都有。只有第一行不算通过。**

**如果报错，看第 6 步的错误列表。不要硬 reload。**

## 3.4 生效

```bash
sudo systemctl reload nginx
```

**`reload` 和 `restart` 的区别：**

| 命令 | 做什么 | 影响 |
|---|---|---|
| `reload` | 重新读配置，**老连接不断** | 用户无感 |
| `restart` | 停掉进程再启动 | 有几秒 502 |

**改配置永远优先用 `reload`。**

**应该看到：没有任何输出。**

**⚠️ "没有输出"就是成功。** Linux 的哲学：不报错就是对的。

**验证它在跑：**

```bash
systemctl status nginx --no-pager
```

**应该看到：**

```text
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-11-16 17:42:10 CST; 12s ago
```

**逐行读：**

| 行 | 意思 | 你要确认什么 |
|---|---|---|
| `Loaded: loaded (...; enabled; ...)` | 已加载，**开机自启** | `enabled` 必须有 |
| `Active: active (running)` | 正在运行 | 必须是 `running` |
| `since ... 12s ago` | 12 秒前启动的 | 时间应该是你刚 reload 的时间 |

**如果是 `failed`：**

```text
Active: failed (Result: exit-code) since ...
```

**说明 reload 失败了。Nginx 会继续用旧配置跑 —— 你以为改了，其实没生效。**

## 3.5 从外面验证

**在你自己的电脑上（不是服务器）：**

```bash
curl -I http://your-domain.com
```

**应该看到：**

```text
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Date: Mon, 16 Nov 2026 09:45:12 GMT
Content-Type: text/html; charset=utf-8
Connection: keep-alive
X-Powered-By: Express
```

**逐行读：**

| 行 | 意思 | 说明 |
|---|---|---|
| `HTTP/1.1 200 OK` | 成功 | 404 / 502 都不算成功 |
| `Server: nginx/1.24.0 (Ubuntu)` | 是 Nginx 在回应 | **这行证明请求到了 Nginx** |
| `Date:` | 服务器时间（GMT） | 如果差很多，服务器时区/时间有问题 |
| `Content-Type: text/html` | 返回的是网页 | —— |
| `X-Powered-By: Express` | **后端是 Express** | 这行证明 `proxy_pass` 生效了 |

**⚠️ 如果没有 `X-Powered-By: Express`：**

```text
说明你访问到的是 Nginx 的静态页，不是你的 Node 应用。
可能是 server_name 没匹配上，落到了默认站点的 root 目录。
```

**再看一次正文：**

```bash
curl -s http://your-domain.com | head -20
```

**应该看到你的应用返回的 HTML。**

**如果是这个：**

```html
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
```

**那就是 Nginx 默认页 —— `server_name` 还是没生效。**

---

# 第 4 步：两个子域名，两个站点（25 分钟）

## 4.1 为什么要多个 server 块

**因为你要区分：**

```text
your-domain.com        →  主站（前端页面）
api.your-domain.com    →  接口服务（另一个 Node 进程，跑在 3001）
admin.your-domain.com  →  后台（可能要限制 IP）
```

**一个 `server` 块只能有一套规则。多个域名要不同行为，就得多写几个块。**

## 4.2 写法

**在同一个文件里再加两个块：**

```nginx
# ---------- 主站 ----------
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# ---------- 接口 ----------
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# ---------- 后台 ----------
server {
    listen 80;
    server_name admin.your-domain.com;

    # 只允许你的办公 IP 访问（把 1.2.3.4 换成你的真实 IP）
    allow 1.2.3.4;
    deny all;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
    }
}
```

**逐行读这三个块的区别：**

| 块 | `server_name` | `proxy_pass` | 特殊规则 |
|---|---|---|---|
| 主站 | `your-domain.com www.your-domain.com` | `3000` | 无 |
| 接口 | `api.your-domain.com` | `3001` | 无 |
| 后台 | `admin.your-domain.com` | `3002` | `allow` / `deny` |

**注意：**

```text
第一个块没有 default_server 了。
因为现在有三个站，"谁是默认"必须明确指定，不能靠"第一个"。
```

## 4.3 `default_server` 只能有一个

**这是 Nginx 的硬规则：**

```text
同一个 listen 端口上，default_server 只能出现一次。
写两次 → 启动失败。
```

**正确的做法：**

```nginx
# 专门做一个"兜底站点"，什么域名都不匹配时用它
server {
    listen 80 default_server;
    server_name _;
    return 444;        # 444 是 Nginx 特有：直接断开连接，不返回任何内容
}
```

**`return 444` 是什么：**

```text
Nginx 收到请求，不回任何东西，直接关掉 TCP 连接。
对扫描器和乱填域名的人，这是最省事的处理方式。
对正常用户，表现为"连接被重置"。
```

**为什么需要兜底站点：**

```text
有人把一台乱七八糟的域名解析到你的 IP（这叫"域名指向攻击"），
如果没有兜底站点，请求会落到"第一个 server 块"，
别人就能用你的服务器、你的备案号，挂一个垃圾站。
```

**⚠️ 这是个真实的攻击手法。** 加了 `return 444` 之后，所有不匹配的 Host 直接被断开。

**如果你不想这么激进，用：**

```nginx
server {
    listen 80 default_server;
    server_name _;
    return 403;
}
```

**返回 403，至少对方知道"被拒绝了"。**

## 4.4 域名多的时候，用独立文件

**所有站点都写在 `default` 里，改起来会乱。**

**更好的做法：**

```bash
# 一个站一个文件
sudo nano /etc/nginx/sites-available/your-domain.com
sudo nano /etc/nginx/sites-available/api.your-domain.com
```

**然后建软链接启用：**

```bash
sudo ln -s /etc/nginx/sites-available/your-domain.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.your-domain.com /etc/nginx/sites-enabled/
```

**应该看到（`ls -l`）：**

```text
lrwxrwxrwx 1 root root 47 Nov 16 18:02 your-domain.com -> /etc/nginx/sites-available/your-domain.com
lrwxrwxrwx 1 root root 42 Nov 16 18:02 api.your-domain.com -> /etc/nginx/sites-available/api.your-domain.com
```

**⚠️ `ln -s` 的路径要用绝对路径。** 用相对路径会建出一个"指向相对位置"的软链接，从 `sites-enabled` 目录看过去就是断的。

**关掉一个站点（不删配置）：**

```bash
sudo rm /etc/nginx/sites-enabled/api.your-domain.com
sudo nginx -t && sudo systemctl reload nginx
```

**⚠️ `rm` 删的是软链接，真文件还在 `sites-available` 里。** 这是这个设计的好处。

**但注意：**

```bash
rm /etc/nginx/sites-available/api.your-domain.com   # 这才是删真文件
```

**这两条命令长得像，后果完全不同。删之前先 `ls -l` 看清楚。**

## 4.5 一次改多个站，还要 `nginx -t`

**改完之后：**

```bash
sudo nginx -t
```

**如果三个块里有一个写错：**

```text
nginx: [emerg] unexpected "}" in /etc/nginx/sites-enabled/default:47
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**这里有个非常重要的点：**

```text
nginx -t 失败时，Nginx 继续用旧配置跑。
所以你的网站看起来"还是好的"，
但实际上你的修改一点都没生效。
```

**这就是为什么必须看 `nginx -t` 的输出，不能只看网站还能不能打开。**

---

# 第 5 步：用 Host 头验证"到底匹配到了谁"（20 分钟）

## 5.1 这一招能省你几个小时

**问题：** 你改了 `server_name`，网站也能打开，但你怎么知道"打开的是你改的那个块"？

**答案：** 手动指定 `Host` 头，绕过 DNS，直接问 Nginx。

```bash
curl -I -H "Host: your-domain.com" http://127.0.0.1
```

**`-H "Host: xxx"` 做了什么：**

```text
正常请求：浏览器根据 URL 自动填 Host 头
手动指定：你告诉 Nginx "假装有人来访问这个域名"
```

**这样你测的是纯 Nginx 的匹配逻辑，不涉及 DNS、不涉及防火墙。**

## 5.2 三个实验，看清机制

**在服务器上跑：**

**实验 A —— 匹配主站：**

```bash
curl -I -H "Host: your-domain.com" http://127.0.0.1
```

**应该看到：**

```text
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
X-Powered-By: Express
```

**实验 B —— 匹配接口：**

```bash
curl -I -H "Host: api.your-domain.com" http://127.0.0.1
```

**应该看到：**

```text
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
```

**如果两个都返回 `X-Powered-By: Express`，看不出区别。** 那就看正文：

```bash
curl -s -H "Host: api.your-domain.com" http://127.0.0.1 | head -5
```

**应该看到接口服务的返回（可能是 JSON 或不同的 HTML）。**

**实验 C —— 一个不存在的域名：**

```bash
curl -I -H "Host: nothing.your-domain.com" http://127.0.0.1
```

**如果配了 `return 444` 兜底：**

```text
curl: (52) Empty reply from server
```

**如果配了 `return 403`：**

```text
HTTP/1.1 403 Forbidden
Server: nginx/1.24.0 (Ubuntu)
```

**如果没有兜底站点：**

```text
HTTP/1.1 200 OK
X-Powered-By: Express
```

**⚠️ 最后这个结果是最危险的：**

```text
一个不存在的域名，也能打开你的应用。
说明所有请求都落到了"第一个 server 块"。
别人把任意域名解析到你的 IP，就能用你的服务器。
```

## 5.3 逐行读这三个结果

| 实验 | 请求的 Host | 结果 | 说明 |
|---|---|---|---|
| A | `your-domain.com` | 200 + Express | 匹配到主站块，转发到 3000 |
| B | `api.your-domain.com` | 200 + 接口内容 | 匹配到接口块，转发到 3001 |
| C | `nothing.your-domain.com` | 444 / 403 | 匹配到兜底块，被拒绝 |

**如果 A 和 B 结果一样：**

```text
排查顺序：
① 两个块的 proxy_pass 端口是不是写的一样了
② 3001 那个进程是不是根本没起（没起会 502，不是 200）
③ 你是不是只 reload 没 restart（reload 会读新配置，一般够）
④ 你改的是不是 sites-available 而没建软链接到 sites-enabled
```

**第 ④ 条最常见。**

```bash
ls -l /etc/nginx/sites-enabled/
```

**只能看到 `default`，说明你新建的文件根本没启用。**

## 5.4 这一招在日常排错里的用法

**客户说"api.your-domain.com 打不开"，你在服务器上：**

```bash
curl -I -H "Host: api.your-domain.com" http://127.0.0.1
```

| 结果 | 结论 |
|---|---|
| 200 | Nginx 没问题，问题在 DNS 或客户端 |
| 502 | Nginx 匹配对了，后端 3001 挂了 |
| 404 | `server_name` 没匹配，落到别的站了 |
| 444 / 连接被重置 | 落到兜底站了，说明 `server_name` 写错了 |

**这一步把"域名问题"和"后端问题"一刀切开。** 比你在浏览器里刷新二十次有用得多。

---

# 第 6 步：故意犯七个错（30 分钟）

## 错误 1：`server_name` 里写 `http://`

**操作：**

```nginx
server_name http://your-domain.com;
```

```bash
sudo nginx -t
```

**会怎样：**

```text
nginx: [emerg] invalid server name or wildcard "http://your-domain.com" on 0.0.0.0:80
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**为什么：**

```text
server_name 匹配的是 HTTP 请求头里的 Host 字段。
Host 字段的值只有 "your-domain.com" 或 "your-domain.com:8080"，
永远不会有协议前缀。
```

**怎么修：**

```nginx
server_name your-domain.com;
```

**⚠️ 如果这时你直接 `systemctl reload nginx`（没跑 `-t`）：**

```text
Job for nginx.service failed because the control process exited with error code.
See "systemctl status nginx.service" and "journalctl -xe" for details.
```

**Nginx 会继续用旧配置跑。** 网站还能开，你以为改成功了，其实没有。

## 错误 2：两个块都写 `default_server`

**操作：**

```nginx
server {
    listen 80 default_server;
    server_name your-domain.com;
}

server {
    listen 80 default_server;
    server_name api.your-domain.com;
}
```

**会怎样：**

```text
nginx: [emerg] a duplicate default server for 0.0.0.0:80 in /etc/nginx/sites-enabled/default:14
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**逐字读：**

| 部分 | 意思 |
|---|---|
| `duplicate default server` | 重复的默认站点 |
| `for 0.0.0.0:80` | 在 80 端口上 |
| `in /etc/nginx/sites-enabled/default:14` | **第 14 行是重复的那个** |

**为什么：**

```text
一个端口只能有一个"兜底"。
两个都兜底，Nginx 不知道没匹配上时该给谁。
```

**怎么修：**

```text
只留一个 default_server（建议放在专门的兜底块里），
其他块去掉这个标记。
```

## 错误 3：少写一个分号

**操作：**

```nginx
server {
    listen 80
    server_name your-domain.com;
}
```

**会怎样：**

```text
nginx: [emerg] unexpected "}" in /etc/nginx/sites-enabled/default:12
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**为什么报的是"第 12 行的 `}` 有问题"，不是"第 11 行少了分号"：**

```text
Nginx 是"读到分号才算一条指令结束"。
少了分号，它会把下一行也当成上一条指令的一部分，
一直读到 `}` 才发现"这条指令怎么在这里结束了"，于是报错在 `}` 上。
```

**这就是为什么"报错行号"经常不是"错误行号"。**

**排查方法：**

```text
看报错行的前 3—5 行，找少分号 / 少括号 / 多字符的地方。
```

**怎么修：**

```nginx
listen 80;
```

## 错误 4：改了配置没 reload

**操作：**

1. 把 `server_name` 改成 `your-domain.com`；
2. 保存；
3. **不跑 `nginx -t`，不跑 `reload`**；
4. `curl -I http://your-domain.com`。

**会怎样：**

```text
HTTP/1.1 200 OK
```

**看起来成功了？**

**再做一步验证：**

```bash
curl -s http://your-domain.com | head -3
```

**如果返回的是 Nginx 欢迎页：**

```html
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
```

**说明你的修改根本没生效。**

**为什么：**

```text
Nginx 在工作进程启动时把配置读进内存。
你改了磁盘上的文件，内存里的还是旧的。
不 reload，永远不会变。
```

**怎么修：**

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**记住这个组合：**

```text
nginx -t && systemctl reload nginx
```

**`&&` 的意思是"前一条成功才执行后一条"。** 这样语法错了就不会 reload，Nginx 继续用旧配置跑，网站不会挂。

**⚠️ 绝对不要写 `systemctl reload nginx && nginx -t`。** 顺序反了，等于先闭眼跳再看脚下。

## 错误 5：改了 `sites-available`，但没建软链接

**操作：**

1. 新建 `/etc/nginx/sites-available/api.your-domain.com`；
2. 写了一个完整的 server 块；
3. `nginx -t` 通过，`reload` 成功；
4. `curl -H "Host: api.your-domain.com" 127.0.0.1`。

**会怎样：**

```text
HTTP/1.1 200 OK
X-Powered-By: Express
```

**返回的是主站的内容 —— 因为你新建的文件根本没被加载。**

**为什么：**

```text
nginx.conf 里写的是 include /etc/nginx/sites-enabled/*;
它只看 sites-enabled 目录。
你放在 sites-available 里的文件，不在这个范围内。
```

**怎么查：**

```bash
ls -l /etc/nginx/sites-enabled/
```

**只看到 `default`，没有你的新文件 → 就是这个错。**

**怎么修：**

```bash
sudo ln -s /etc/nginx/sites-available/api.your-domain.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**⚠️ 注意 `nginx -t` 不会告诉你"你有配置文件没启用"。** 它只检查"已加载的配置对不对"。这个错只能靠自己 `ls` 发现。

## 错误 6：备案没下来就解析到国内服务器

**操作：**

1. 服务器在国内；
2. 备案还在审核中；
3. 你把 `@` 的 A 记录指向了这台服务器；
4. 浏览器访问。

**会怎样：**

```text
浏览器：一个提示页，写着"该网站尚未备案"或"无法访问此网站"
```

**或者：**

```text
curl: (52) Empty reply from server
```

**或者：**

```text
HTTP/1.1 403 Forbidden
```

**为什么：**

```text
云厂商会监测 80 端口的 HTTP 请求里的 Host 头。
发现是未备案域名，直接在网络层拦截，请求到不了你的 Nginx。
```

**怎么验证是"被拦截"而不是"你没配好"：**

```bash
# 在服务器上自己访问（不经过外网，不会被拦截）
curl -I -H "Host: your-domain.com" http://127.0.0.1
```

**如果服务器内部 200，外面打不开 → 100% 是备案拦截。**

**怎么修：**

```text
① 等备案下来（没有别的办法）
② 过渡期：解析到香港服务器，或者直接给客户 IP
③ 立刻去查备案进度，不要干等
```

**⚠️ 不要尝试"绕过"：**

```text
换端口（8080）不能绕过。云厂商是按域名 + 端口 综合监测的。
用 IP 访问不违规，但不适合给客户。
```

## 错误 7：网站底部没放备案号

**操作：**

1. 备案下来了；
2. 网站正常上线；
3. footer 里什么都没写。

**会怎样：**

**短期：没人管。**

**长期：**

```text
① 管局抽查 / 被人举报 → 收到整改通知
② 整改不及时 → 备案被注销
③ 备案注销 → 域名立刻不能在国内服务器上访问
④ 重新备案 → 再等 7—20 个工作日
```

**为什么这是"最冤"的一种：**

```text
你花了三周备案，最后因为"少了一行 HTML"被注销。
```

**怎么做：**

**在你的前端 footer 里加：**

```html
<footer style="text-align:center;padding:20px;font-size:12px;color:#888">
  <a href="https://beian.miit.gov.cn" target="_blank" rel="noopener"
     style="color:#888;text-decoration:none">
    京ICP备2026000000号-1
  </a>
</footer>
```

**验证：**

```bash
curl -s http://your-domain.com | grep -i "ICP备"
```

**应该看到：**

```html
<a href="https://beian.miit.gov.cn" ...>京ICP备2026000000号-1</a>
```

**⚠️ 号码换成你自己的。上面这个是示例，不要照抄。**

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 219 节课学习笔记

## 一、我的项目要不要备案

- 服务器位置：
- 结论：
- 依据：
- 如果要：现在是什么状态（未提交 / 审核中 / 已通过）

## 二、备案是什么的三者绑定

| 要素 | 我的是什么 |
|---|---|
| 主体 | |
| 域名 | |
| 服务器 | |

为什么三者必须一致：

备案是按主域名还是子域名：

子域名要不要单独备案：

## 三、备案期间网站怎么办

我打算怎么做：

为什么不能在备案期间把域名解析到国内服务器：

## 四、Nginx 配置的三层结构

| 路径 | 作用 |
|---|---|
| `/etc/nginx/nginx.conf` | |
| `/etc/nginx/sites-available/` | |
| `/etc/nginx/sites-enabled/` | |

`sites-enabled` 里的文件是真的配置文件还是软链接：

`ls -l` 输出里怎么看出是软链接：

## 五、`server_name`

我改之前是什么：

我改之后是什么：

`server_name _;` 是什么意思：

`default_server` 是什么意思：

为什么 `server_name` 里不能写 `http://`：

## 六、`nginx -t` 和 `reload`

`nginx -t` 通过时输出什么：

我的输出：

为什么必须 `nginx -t && systemctl reload nginx` 这个顺序：

`reload` 和 `restart` 的区别：

## 七、用 Host 头验证

命令：`curl -I -H "Host: your-domain.com" http://127.0.0.1`

我的输出：

访问不存在的子域名时，返回什么：

这说明我的兜底站点配好了吗：

## 八、七个错误的后果

| 错误 | 报错原文 | 怎么修 |
|---|---|---|
| server_name 带 http:// | | |
| 两个 default_server | | |
| 少分号 | | |
| 没 reload | | |
| 没建软链接 | | |
| 备案没下来就解析 | | |
| 没放备案号 | | |

## 九、我还不懂的词

-

## 十、完成检查

- [ ] 我知道我的项目要不要备案
- [ ] 我的 `server_name` 写的是域名，不是 `_`
- [ ] 我改配置前备份了
- [ ] 我每次都先 `nginx -t` 再 `reload`
- [ ] 我用 Host 头验证过匹配结果
- [ ] 我配了一个兜底站点
- [ ] 我做过至少五个错误实验
```

---

# 第 8 步：课后练习（40 分钟）

## 练习一：画出你的 Nginx 加载链路

**要求：**

1. 在服务器上 `cat /etc/nginx/nginx.conf`，找到 `include` 那几行；
2. `ls -l /etc/nginx/sites-enabled/`；
3. 画一张图，标出"哪个文件被哪个文件包含"。

**记录什么：**

```text
nginx.conf 里 include 了哪些目录/文件：
sites-enabled 里有哪些软链接，各指向哪里：
最后真正生效的 server 块有几个：
```

**思考题：**

> 如果你直接改 `/etc/nginx/sites-enabled/default`（那个软链接），实际改的是哪个文件？

## 练习二：加一个只允许你自己 IP 访问的后台

**要求：**

1. 加一个 `admin.your-domain.com` 的 server 块；
2. 用 `allow` / `deny` 限制只有你的 IP 能访问；
3. 先用错误的 IP 测试，确认被拒绝；
4. 再改成正确 IP，确认能访问。

**记录什么：**

```text
我用什么查自己的公网 IP：
被拒绝时 curl 返回什么：
允许时 curl 返回什么：
```

**思考题：**

> `deny all;` 写在 `allow` 前面会怎样？（提示：Nginx 是按顺序匹配的）

## 练习三：制造一次"两个域名打开同一个站"

**要求：**

1. 把 `api.your-domain.com` 的 server 块注释掉；
2. `nginx -t && systemctl reload nginx`；
3. 访问 `api.your-domain.com`，看打开的是什么；
4. 解释为什么。

**记录什么：**

```text
返回的状态码：
返回的内容是主站还是 404：
我认为请求落到了哪个 server 块：
```

**思考题：**

> 如果没有 `default_server` 标记，Nginx 会怎么选？（提示：按配置加载顺序，选第一个 `listen 80` 的）

## 练习四：把备案号放进页面

**要求：**

1. 在你项目的 footer 里加备案号（还没下来就先用占位符）；
2. 部署到服务器；
3. `curl -s http://your-domain.com | grep -i "ICP备"` 验证；
4. 浏览器打开，点一下那个链接，看是否跳到 `beian.miit.gov.cn`。

**记录什么：**

```text
grep 的输出：
链接跳到了哪里：
手机上看排版有没有乱：
```

**思考题：**

> 为什么备案号必须是"链接"而不能只是"文字"？

## 练习五：用自己的话讲

```text
① 为什么"服务器在香港"就不用备案？这个判断依据是什么？
② 为什么一个主域名备案后，所有子域名都能用？
③ `server_name _;` 和 `default_server` 各管什么？为什么两个都要有？
④ 为什么 `nginx -t` 失败时网站还能打开？这是好事还是坏事？
⑤ 客户把别人的域名解析到你的服务器，你能怎么防？
```

---

# 第 9 步：最终验收（10 分钟）

## A. 概念

- [ ] 我能说出"备案 = 主体 + 域名 + 服务器"三者绑定
- [ ] 我知道服务器在大陆必须备案，香港/海外不用
- [ ] 我知道备案按主域名，子域名不用单独备
- [ ] 我知道备案期间网站不能对外访问
- [ ] 我知道 `default_server` 一个端口只能有一个

## B. 实操

- [ ] 我把 `server_name` 改成了我的域名，`curl` 返回 200
- [ ] 我改配置前做了带日期的备份
- [ ] 我每次都跑 `nginx -t && systemctl reload nginx`
- [ ] 我配了至少两个 server 块（主站 + 一个子域名）
- [ ] 我配了兜底站点（`return 444` 或 `403`）
- [ ] 我用 `curl -H "Host: ..."` 验证过匹配结果
- [ ] 备案号（或占位符）已经放进页面底部

## C. 排错

- [ ] 看到 `invalid server name`，我知道是 `server_name` 里写了协议或路径
- [ ] 看到 `duplicate default server`，我知道要去掉多余的 `default_server`
- [ ] 看到 `unexpected "}"`，我知道去看报错行的前几行找少写的分号
- [ ] 改完没效果，我知道先 `ls -l sites-enabled` 看有没有启用
- [ ] 服务器内部 200、外面打不开，我知道先怀疑备案拦截

## D. 交付

- [ ] `03-练习代码/备案判断表.md` 填完
- [ ] `03-练习代码/server_name-修改记录.md` 有改前/改后 + `nginx -t` 输出
- [ ] 我的域名能在浏览器正常打开我的应用（不是 Nginx 欢迎页）

## E. 笔记

- [ ] `NOTES.md` 十栏都填了
- [ ] 「七个错误的后果」写了真实报错原文
- [ ] 「我还不懂的词」有内容

## 本节课要能说出口的一句话

> **备案决定你"能不能开"，`server_name` 决定"打开的是不是你的站"；前者要等三周，后者错一个字符就永远等不到。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 域名打开是 Nginx 欢迎页 | `server_name` 还是 `_`，落到 root 目录 | 改成域名，`nginx -t && reload` |
| 两个域名打开同一个站 | 只有一个 server 块 / 都是 `default_server` | 拆成多个块，只留一个兜底 |
| `invalid server name or wildcard` | `server_name` 里有 `http://` 或 `/` | 只写域名 |
| `duplicate default server` | 两个块都写了 `default_server` | 只留一个 |
| `unexpected "}"` | 上一行少了分号 | 看报错行前 3—5 行 |
| `unknown directive "server_nmae"` | 单词拼错 | 改成 `server_name` |
| `nginx: configuration file ... test failed` | 语法或语义错 | 先修 `-t`，别 reload |
| reload 报 `Job for nginx.service failed` | 配置有错，reload 被拒 | 看 `systemctl status nginx`，改回备份 |
| 改了配置没效果 | 没 reload / 没建软链接 | `ls -l sites-enabled`，再 reload |
| 服务器内 200，外面 403 | 备案未通过被拦截 | 等备案，或先解析到香港 |
| 外面一直 404 | `server_name` 不匹配，且没有兜底 | 用 `-H "Host:"` 定位 |
| 访问任意域名都能打开我的站 | 没有兜底站点 | 加 `return 444` 的 default_server |
| `ln -s` 之后 `ls -l` 是红的 | 软链接指向的路径不存在 | 用绝对路径重建 |
| 删了 `sites-enabled` 里的文件，配置还在 | 删的是软链接 | 正常，真文件在 `sites-available` |
| 备案被驳回 | 主体/域名/内容不一致 | 按驳回原因改，重新提交 |
| 备案号被要求整改 | 页面没放号 / 没链接 | 加 `<a href="https://beian.miit.gov.cn">` |
| 公安备案没做 | ICP 下来了但没做公安备案 | 30 日内去全国互联网安全管理服务平台 |
| 香港服务器访问慢 | 跨境线路 | 客户在国内就尽早迁回大陆 |
| `curl` 返回 502 | 后端进程挂了 | `pm2 list`，`pm2 restart` |
| `curl` 返回 444 / 连接被重置 | 落到兜底块了 | 检查 `server_name` 拼写 |
