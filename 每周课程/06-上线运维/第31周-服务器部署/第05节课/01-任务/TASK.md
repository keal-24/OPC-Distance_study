# 第 215 节课：启动服务——pm2 常驻与开机自启

> **上一节课你 `node server.js` 跑通了，然后按了 `Ctrl+C`。**
> 现在要让它**一直跑**：关掉终端不断、程序崩了自己重启、服务器重启自己回来。
> 三件事，三条命令：`start`、`save`、`startup`。**少一条，某个时刻网站就挂。**

**建议用时**：110 分钟
**你需要先完成**：第 214 节课（`/srv/app` 里代码 + `.env` + `node_modules` 齐全，`node server.js` 能起，且已经停掉）

---

# 第 0 步：为什么"跑起来"不等于"上线"（10 分钟）

## 0.1 你现在会什么

```text
cd /srv/app
node server.js
→ Server running at http://127.0.0.1:3000
```

**能跑。**

**但你现在一按 `Ctrl+C`，或者一关窗口，它就没了。**

## 0.2 你以后会遇到什么

```text
① 半夜程序崩了，第二天客户说"打不开"
② 云厂商维护，重启了机器，网站再也没起来
③ 你 ssh 上去看日志，一关窗口服务就断了
④ 内存泄漏，进程被系统杀掉，没人知道
⑤ 你想看昨天的错误，日志早就被覆盖了
```

**这五件事，`node server.js` 一件都解决不了。**

## 0.3 今天要建立的三个概念

```text
① 进程管理器 —— 有一个"保姆"盯着你的程序，死了就扶起来
② 进程列表 —— 服务器上"现在跑着哪些服务"，一个文件说了算
③ 开机自启 —— 机器重启后，谁负责把它们叫起来
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 三条命令的输出、重启验证记录 |
| `pm2-笔记.md` | `03-练习代码` | 你自己建：应用名、日志路径、常用命令卡片 |
| 一个常驻进程 | `pm2 list` | `chat-app` 状态 `online` |
| 一个 systemd 单元 | `/etc/systemd/system/pm2-root.service` | 开机自动恢复 |

**验收标准是两句话：**

```text
① 关掉 SSH 窗口，再打开浏览器，网站还在。
② 服务器 reboot 一次，等 1 分钟，网站自己回来了。
```

---

# 第 1 步：先看清"为什么不能用 `&`"（20 分钟）

## 1.1 做个实验

**登录服务器，跑：**

```bash
cd /srv/app
node server.js &
```

**应该看到：**

```text
[1] 4821
[dotenv@16.4.5] injecting env (5) from .env
Server running at http://127.0.0.1:3000
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `[1] 4821` | 放到后台运行，作业号 1，进程号 4821 |
| `injecting env (5)` | 环境变量读到了 |
| `Server running...` | 起来了 |

**`&` 是什么：** 把命令放到后台，shell 不等它结束就还你提示符。

**验证它活着：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

**应该看到：**

```text
200
```

**`-o /dev/null` 是什么：** 丢弃正文。**`-w "%{http_code}\n"` 只打印状态码。**

**现在，退出 SSH：**

```bash
exit
```

## 1.2 再进来看看

```bash
ssh myserver
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

**应该看到：**

```text
curl: (7) Failed to connect to 127.0.0.1 port 3000: Connection refused
```

**`000`（如果用 `-w` 输出）或者这条报错 —— 服务没了。**

**确认：**

```bash
ss -lntp | grep 3000
```

**没有输出。**

## 1.3 为什么

**因为 SSH 会话结束时，内核会给这个会话里的所有进程发一个信号：`SIGHUP`。**

```text
SIGHUP = "hang up"，挂断。
本意是"电话线断了"。
默认行为：终止进程。
```

**机制：**

```text
你 ssh 进来 → 开了一个会话（session）
你在会话里跑 node → 它是这个会话的"子进程"
你 exit 或关窗口 → 会话结束
内核：这个会话的所有子进程，全部 SIGHUP
node 没有处理 SIGHUP → 默认动作 = 退出
```

**这不是 bug，是设计。**

```text
否则你每次退出终端，都会留下一个孤儿进程。
```

## 1.4 `nohup` 能救吗

**能救一半。**

```bash
nohup node server.js > app.log 2>&1 &
```

**拆开读：**

```text
nohup          忽略 SIGHUP（no hang up）
> app.log      标准输出写到 app.log
2>&1           标准错误也指向同一个地方
&              放后台
```

**验证：**

```bash
exit
ssh myserver
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

**应该看到：**

```text
200
```

**这次活了。**

**但它还有四个问题：**

```text
① 程序崩了不会自己起来（PHP 那种"一次请求一次执行"才行，Node 是常驻）
② 日志文件会无限增长（一个月后磁盘满）
③ 服务器重启后不会自动起来
④ 你不知道它现在是不是活着，得 ps 一下
```

**第 ① 条最致命：**

```text
Node 程序只要有一个未捕获的异常，整个进程就退出。
没有"重新拉起"的机制，网站就一直是 502，直到你发现。
```

**先把它清掉：**

```bash
pkill -f "node server.js"
```

**应该没有任何输出。**

**验证：**

```bash
ss -lntp | grep 3000
```

**没有输出 = 清干净了。**

**⚠️ `pkill -f` 会按"命令行里包含这个字符串"杀进程。** 用之前先 `ps aux | grep "node server.js"` 确认只匹配到你想要的那个。

## 1.5 四种方案对比

| 方案 | 关窗口不断 | 崩了自动重启 | 开机自启 | 日志管理 | 适合 |
|---|---|---|---|---|---|
| `node server.js` | ❌ | ❌ | ❌ | ❌ | 本地调试 |
| `nohup ... &` | ✅ | ❌ | ❌ | ❌ | 临时跑一下 |
| `systemd` 自己写 unit | ✅ | ✅ | ✅ | 要自己配 | 生产（进阶） |
| **`pm2`** | ✅ | ✅ | ✅ | ✅ 内置 | **本课** |

**为什么不用 `systemd` 直接写：**

```text
它更"正统"，但你得会写 unit 文件、配日志、配环境变量。
pm2 把这些都包好了，一条命令启动，一条命令看日志。
等你熟了再换 systemd，不迟。
```

**为什么不用 `screen` / `tmux`：**

```text
它们解决的是"关窗口不断"，不解决"崩了重启"和"开机自启"。
它们是给人用的，不是给服务用的。
```

---

# 第 2 步：装 pm2（10 分钟）

## 2.1 装

```bash
npm install -g pm2
```

**`-g` 是什么：** global，全局安装。**不加 `-g` 只会装到当前项目的 `node_modules` 里，命令行里敲 `pm2` 找不到。**

**应该看到：**

```text
added 5 packages in 3s
```

**只有 5 个包？** 对。pm2 的依赖很少，装得很快。

**如果看到一堆 `npm WARN deprecated`：**

```text
正常，忽略。
```

## 2.2 验证

```bash
pm2 -v
which pm2
```

**应该看到：**

```text
5.4.2
/usr/bin/pm2
```

**逐行读：**

| 输出 | 意思 |
|---|---|
| `5.4.2` | pm2 版本 |
| `/usr/bin/pm2` | **命令在系统路径里**，任何用户、任何会话都能找到 |

**⚠️ 如果 `which pm2` 输出的是：**

```text
/root/.nvm/versions/node/v20.11.1/bin/pm2
```

**或者：**

```text
/usr/local/bin/pm2
```

**注意：`/usr/local/bin` 一般没问题（它在 systemd 的 PATH 里），但 nvm 的路径会有问题。**

**检查 systemd 能不能找到：**

```bash
sudo env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin which pm2
```

**应该输出 `/usr/bin/pm2` 或 `/usr/local/bin/pm2`。**

**如果输出 `which: no pm2 in ...`：**

```text
说明 pm2 不在系统路径里，开机自启会失败。
回去检查 node 是不是用 NodeSource 装的（第 213 节）。
```

## 2.3 pm2 到底装到哪了

```bash
ls /usr/lib/node_modules/
```

**应该看到：**

```text
npm  pm2
```

**`/usr/lib/node_modules/` 是全局包的"库"，`/usr/bin/pm2` 是一个指向它的软链接。**

**验证：**

```bash
ls -l /usr/bin/pm2
```

```text
lrwxrwxrwx 1 root root 35 Nov 16 12:01 /usr/bin/pm2 -> ../lib/node_modules/pm2/bin/pm2
```

**`->` 后面就是真实文件。**

---

# 第 3 步：启动（15 分钟）

## 3.1 一个必须做对的前提：在哪个目录启动

**⚠️ 这一条决定了你的 `.env` 能不能被读到。**

**`cd /srv/app` 之后再启动。**

```bash
cd /srv/app
pwd
```

**必须输出：**

```text
/srv/app
```

**为什么：**

```text
pm2 启动时，会把"你当前所在目录"记成进程的 cwd（工作目录）。
dotenv 找 .env 的方式是：从 cwd 开始找。
如果你在 /root 启动，cwd 就是 /root，找不到 /srv/app/.env。
```

**后果（第 8 步会详细讲）：**

```text
pm2 list 显示 online
但访问网站 500
pm2 logs 里：injecting env (0) from .env
             Error: MODEL_NAME is not defined
```

## 3.2 启动

```bash
pm2 start server.js --name chat-app
```

**拆开读：**

```text
pm2 start            启动一个程序
server.js            入口文件（相对当前目录）
--name chat-app      给它起个名字，后面所有命令都用这个名字
```

**为什么一定要 `--name`：**

```text
不起名的话，pm2 用文件名当名字，叫 "server"。
你以后有三个服务都叫 server.js，就分不清了。
```

**应该看到：**

```text
[PM2] Starting /srv/app/server.js in fork_mode (1 instance)
[PM2] Done.
┌────┬──────────┬─────────────┬─────────┬─────────┬──────────┬────────┬────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name     │ namespace   │ version │ mode    │ pid      │ uptime │ ↺  │ status   │ cpu      │ mem      │ user     │
├────┼──────────┼─────────────┼─────────┼─────────┼──────────┼────────┼────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ chat-app │ default     │ 1.0.0   │ fork    │ 5123     │ 0s     │ 0  │ online   │ 0%       │ 45.2mb   │ root     │
└────┴──────────┴─────────────┴─────────┴─────────┴──────────┴────────┴────┴──────────┴──────────┴──────────┴──────────┘
```

**逐列读：**

| 列 | 意思 | 你要注意什么 |
|---|---|---|
| `id` | pm2 内部编号 | 可以用 `pm2 restart 0` |
| `name` | **你起的名字** | 后面所有命令用这个 |
| `namespace` | 分组，默认 `default` | 不用管 |
| `version` | 从 `package.json` 读的 | 1.0.0 |
| `mode` | `fork` 或 `cluster` | `fork` = 单进程，够用 |
| `pid` | 系统进程号 | 和 `ps` 对得上 |
| `uptime` | 跑了多久 | 刚起来是 `0s` |
| `↺` | **重启次数** | **关键指标，见下** |
| `status` | `online` / `errored` / `stopped` | **必须 online** |
| `cpu` | CPU 占用 | 0% 正常（在等请求） |
| `mem` | 内存占用 | 45MB 左右正常 |
| `user` | 用哪个用户跑的 | root |

**`↺` 这一列非常重要：**

```text
它是"重启次数"。
刚启动是 0。
如果过一会儿变成 3、5、20，说明进程在反复崩溃、pm2 在反复拉起。
这时候 status 可能还是 online（因为你正好看到它起来的那一瞬），
但日志里全是错误。
```

**看到 `↺` 一直涨 = 程序有启动就崩的问题。** 去 `pm2 logs` 看。

## 3.3 看列表

```bash
pm2 list
```

**应该看到和上面一样的表格。**

**`pm2 list` 和 `pm2 status` 是一回事。**

**这一条命令以后每天第一眼看它。**

## 3.4 看日志

```bash
pm2 logs chat-app --lines 30
```

**应该看到：**

```text
[TAILING] Tailing last 30 lines for [chat-app] process (change the value with --lines option)
/root/.pm2/logs/chat-app-error.log last 30 lines:
/root/.pm2/logs/chat-app-out.log last 30 lines:
0|chat-app | [dotenv@16.4.5] injecting env (5) from .env
0|chat-app | Server running at http://127.0.0.1:3000
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `[TAILING]` | 正在"跟踪"日志（像 `tail -f`） |
| `chat-app-error.log last 30 lines:` | 错误日志，现在是空的 |
| `chat-app-out.log last 30 lines:` | **普通输出在这个文件** |
| `0\|chat-app \|` | `id\|名字 \|` 前缀 |
| `injecting env (5)` | **5 个变量读到了** |
| `Server running at ...` | 起来了 |

**⚠️ `pm2 logs` 会一直挂着（跟踪模式）。**

**退出：`Ctrl + C`。**

**只想看一次不跟踪：**

```bash
pm2 logs chat-app --lines 30 --nostream
```

**`--nostream` 是什么：** 打印完就退出，不跟着。

**⚠️ 注意 `(5)` 这个数字。**

```text
它必须等于你 .env 里的有效变量数。
是 (0) → .env 没读到（路径错，见第 3.1 节）
是 (3) 而你写了 5 个 → 有 2 行格式错（第 214 节的引号/空格问题）
```

## 3.5 确认端口

**另开一个窗口（或者 `Ctrl+C` 退出日志后）：**

```bash
ss -lntp | grep 3000
```

**应该看到：**

```text
LISTEN 0      511        127.0.0.1:3000       0.0.0.0:*    users:(("node",pid=5123,fd=20))
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `LISTEN` | 正在监听 |
| `0` | 接收队列（Recv-Q） |
| `511` | 发送队列（Send-Q），Node 默认 511  backlog |
| `127.0.0.1:3000` | **监听地址：只听本机 3000** |
| `0.0.0.0:*` | 对端地址不限 |
| `users:(("node",pid=5123,fd=20))` | **是 node 进程，PID 5123** |

**`127.0.0.1:3000` 和 `0.0.0.0:3000` 的区别：**

```text
127.0.0.1:3000   只听本机。外面连不上，只能通过 Nginx 转发。✅ 你要的
0.0.0.0:3000     听所有网卡。如果安全组开了 3000，全世界都能直连。❌ 危险
```

**如果你看到 `*:3000` 或 `0.0.0.0:3000`：**

```bash
grep -n "listen" /srv/app/server.js
```

**改成：**

```js
app.listen(3000, '127.0.0.1', () => { ... })
```

**然后：**

```bash
pm2 restart chat-app
ss -lntp | grep 3000
```

## 3.6 验证能访问

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

**应该看到：**

```text
200
```

**这一条通了，说明"程序在跑且能响应"。**

**浏览器现在打 `http://47.98.xx.xx` 还是 nginx 欢迎页，别急 —— 第 216 节才配转发。**

---

# 第 4 步：把常用命令练一遍（15 分钟）

## 4.1 命令表

| 命令 | 干什么 | 什么时候用 |
|---|---|---|
| `pm2 list` | 看所有进程 | 每天第一眼 |
| `pm2 logs chat-app` | 实时日志 | 排错 |
| `pm2 logs chat-app --lines 100 --nostream` | 看最近 100 行 | 事后查 |
| `pm2 restart chat-app` | 重启 | 改完代码/配置 |
| `pm2 stop chat-app` | 停止（留在列表里） | 临时停 |
| `pm2 start chat-app` | 启动（从停止状态） | 恢复 |
| `pm2 delete chat-app` | 从列表里删掉 | 不要这个服务了 |
| `pm2 describe chat-app` | 看详细信息 | 查 cwd、日志路径、环境变量 |
| `pm2 monit` | 实时监控面板 | 看 CPU/内存 |
| `pm2 flush` | 清空所有日志 | 日志太大时 |
| `pm2 save` | **保存当前列表** | 每次改动后 |
| `pm2 startup` | **配置开机自启** | 只做一次 |

## 4.2 `restart` 和 `stop` 的区别

```text
stop      → 进程停了，但还在 pm2 的列表里（status: stopped）
delete    → 从列表里彻底移除
start     → 只能启动"还在列表里但停了"的
```

**所以：**

```bash
pm2 stop chat-app
pm2 list              # 看到 stopped
pm2 start chat-app    # 能起来
```

**但：**

```bash
pm2 delete chat-app
pm2 start chat-app    # 报错：Script not found
```

**`delete` 之后要重新 `pm2 start server.js --name chat-app`。**

## 4.3 改代码之后必须 restart

**做这个实验：**

1. 改一下 `server.js` 里的一句话（比如把首页标题改掉）；
2. **不要重启**；
3. 浏览器刷新。

**你会发现：没变。**

**为什么：**

```text
Node 把代码加载进内存之后就一直在用内存里的那份。
文件改了，进程不知道。
```

**所以：**

```bash
pm2 restart chat-app
```

**应该看到：**

```text
┌────┬──────────┬─────────────┬─────────┬─────────┬──────────┬────────┬────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name     │ namespace   │ version │ mode    │ pid      │ uptime │ ↺  │ status   │ cpu      │ mem      │ user     │
├────┼──────────┼─────────────┼─────────┼─────────┼──────────┼────────┼────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ chat-app │ default     │ 1.0.0   │ fork    │ 5341     │ 0s     │ 1  │ online   │ 0%       │ 42.1mb   │ root     │
└────┴──────────┴─────────────┴─────────┴─────────┴──────────┴────────┴────┴──────────┴──────────┴──────────┴──────────┘
```

**注意两列变了：**

```text
pid     5123 → 5341   （新进程）
↺       0 → 1          （重启次数 +1）
```

**`↺` 是判断"有没有重启过"的最快方式。**

**⚠️ 不要在服务器上直接改代码。** 正确流程是：

```text
本地改 → git commit → git push → 服务器 git pull → pm2 restart
```

**第 217 节的 `deploy.sh` 就是把这四步写成脚本。**

## 4.4 `describe` 看全貌

```bash
pm2 describe chat-app
```

**应该看到：**

```text
Describing process with id 0 - name chat-app
┌───────────────────┬──────────────────────────────────────────┐
│ status            │ online                                   │
│ name              │ chat-app                                 │
│ namespace         │ default                                  │
│ version           │ 1.0.0                                    │
│ restarts          │ 1                                        │
│ uptime            │ 45s                                      │
│ script path       │ /srv/app/server.js                       │
│ script args       │ N/A                                      │
│ error log path    │ /root/.pm2/logs/chat-app-error.log       │
│ out log path      │ /root/.pm2/logs/chat-app-out.log         │
│ pid path          │ /root/.pm2/pids/chat-app-0.pid           │
│ interpreter       │ node                                     │
│ interpreter args  │ N/A                                      │
│ script id         │ 0                                        │
│ exec cwd          │ /srv/app                                 │
│ exec mode         │ fork_mode                                │
│ node.js version   │ 20.11.1                                  │
│ node env          │ N/A                                      │
│ watch & reload    │ ✖                                        │
│ unstable restarts │ 0                                        │
│ created           │ 2026-11-16T12:03:11.204Z                 │
└───────────────────┴──────────────────────────────────────────┘
```

**逐行读（只挑关键的）：**

| 字段 | 意思 | 为什么要看 |
|---|---|---|
| `script path` | `/srv/app/server.js` | 是绝对路径，说明启动时在哪 |
| **`exec cwd`** | **`/srv/app`** | **`.env` 能读到靠的就是它** |
| `node.js version` | 20.11.1 | 是不是你要的版本 |
| `restarts` | 1 | 重启次数 |
| `error log path` | 具体文件 | 排错直接去看 |

**如果 `exec cwd` 是 `/root`：**

```bash
pm2 delete chat-app
cd /srv/app
pm2 start server.js --name chat-app
```

**这一条是"程序 online 但 500"的头号原因。**

## 4.5 `monit` 看一眼

```bash
pm2 monit
```

**应该看到一个全屏面板：**

```text
┌─ Process List ────────────┐┌─ chat-app Logs ────────────────────────┐
│ chat-app     Mem: 45 MB   ││ [dotenv] injecting env (5) from .env    │
│ CPU: 0%     ↺ 1           ││ Server running at http://127.0.0.1:3000│
└───────────────────────────┘└────────────────────────────────────────┘
┌─ Custom Metrics ──────────┐┌─ Metadata ─────────────────────────────┐
│ Heap Size   12.3 MiB      ││ PID      5341                          │
│ Heap Usage  45.2 %        ││ Uptime   2m                            │
│ Used Heap   5.6 MiB       ││ Restarts 1                             │
└───────────────────────────┘└────────────────────────────────────────┘
```

**`q` 退出。**

**这个面板看"内存有没有一直涨"很有用。** 一天看一次，涨到几百 MB 就是有泄漏。

---

# 第 5 步：`pm2 save`：记住现在跑着什么（10 分钟）

## 5.1 一个反直觉的事实

**pm2 启动的进程，只活在内存里。**

```text
你把服务器重启一下，pm2 自己也没了，列表就是空的。
```

**`save` 做的事：把当前列表写到一个文件里。**

```bash
pm2 save
```

**应该看到：**

```text
[PM2] Saving current process list...
[PM2] Successfully saved in /root/.pm2/dump.pm2
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Saving current process list...` | 正在保存 |
| `Successfully saved in /root/.pm2/dump.pm2` | **存到这个文件了** |

## 5.2 看那个文件

```bash
ls -l /root/.pm2/dump.pm2
```

**应该看到：**

```text
-rw-r--r-- 1 root root 1024 Nov 16 12:10 /root/.pm2/dump.pm2
```

**它是二进制/JSON 混合格式，不用读。**

**但你要知道：**

```text
这个文件就是"重启后要恢复哪些进程"的清单。
它不在的时候，pm2 重启后什么都不会起。
```

## 5.3 什么时候要重新 save

```text
① 新增了一个服务并 start 之后
② delete 了一个服务之后
③ 改了启动参数（--name、--watch、环境变量）之后
```

**规则：每次 `pm2 start/delete` 之后，跟一条 `pm2 save`。**

**为什么：**

```text
你 start 了 B 服务，但没 save。
重启后 pm2 只恢复 dump 文件里的 A 服务。
B 服务不见了，你以为是"B 有问题"。
```

---

# 第 6 步：`pm2 startup`：开机自启（20 分钟）

## 6.1 只 `save` 是不够的

**`save` 只是写了个清单。**

**问题是：服务器重启后，谁去读这个清单？**

```text
pm2 自己不会开机启动。
系统启动时，没人叫它，它就不在。
它不在，清单就没人读，服务全都不起来。
```

**`startup` 做的事：给系统装一个"开机时启动 pm2"的配置。**

## 6.2 跑

```bash
pm2 startup
```

**应该看到：**

```text
[PM2] Init System found: systemd
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

**⚠️ 关键：它不会自己装，它只是"告诉你要执行哪条命令"。**

**你必须把最后那行复制下来执行。**

**为什么这么设计：**

```text
写 systemd 配置需要 root 权限。
pm2 不想偷偷提权，所以让你手动执行带 sudo 的那条。
```

## 6.3 逐字读那行命令

```text
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
 │    │   │                │                                              │      │       │       │
 │    │   │                │                                              │      │       │       └─ --hp /root：root 的家目录
 │    │   │                │                                              │      │       └─ -u root：以 root 用户身份
 │    │   │                │                                              │      └─ systemd：用 systemd 作为 init 系统
 │    │   │                │                                              └─ startup 子命令
 │    │   │                └─ pm2 的完整路径（不是靠 PATH 找，避免找不到）
 │    │   └─ PATH 加上 /usr/bin（保证 node 能被找到）
 │    └─ env：临时设置环境变量
 └─ sudo：用 root 权限
```

**为什么要 `env PATH=$PATH:/usr/bin`：**

```text
systemd 的环境变量很少。
pm2 生成的 unit 文件里要写死一个 PATH，
不然开机时它找不到 node。
```

**为什么路径是 `/usr/lib/node_modules/pm2/bin/pm2` 而不是 `pm2`：**

```text
开机时 PATH 可能还没配好。
用绝对路径最稳。
```

## 6.4 执行它

**复制你屏幕上那一行（不要抄课件的，你的路径可能不同），回车。**

**应该看到：**

```text
[PM2] Generating systemd service file
[PM2] Writing init configuration in /etc/systemd/system/pm2-root.service
[PM2] Making script booting at startup...
[PM2] [-] Executing: systemctl enable pm2-root...
[PM2] [v] Command successfully executed.
+---------------------------------------+
[PM2] Freeze a process list on reboot via:
$ pm2 save

[PM2] Remove init script via:
$ pm2 unstartup systemd
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Generating systemd service file` | 正在生成 systemd 配置 |
| `Writing init configuration in /etc/systemd/system/pm2-root.service` | **写到这个文件了** |
| `Executing: systemctl enable pm2-root...` | 设置开机启用 |
| `[v] Command successfully executed` | **成功** |
| `Freeze a process list on reboot via: pm2 save` | 提醒你还要 save |

## 6.5 验证

```bash
systemctl status pm2-root
```

**应该看到：**

```text
● pm2-root.service - PM2 process manager
     Loaded: loaded (/etc/systemd/system/pm2-root.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-11-16 12:15:02 CST; 30s ago
       Docs: https://pm2.keymetrics.io/
     Main PID: 5341 (PM2 v5.4.2: God)
      Tasks: 10 (limit: 1100)
     Memory: 82.1M
        CPU: 120ms
     CGroup: /system.slice/pm2-root.service
             ├─5341 PM2 v5.4.2: God Daemon (/root/.pm2)
             ├─5345 node /srv/app/server.js
             └─...
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Loaded: ... enabled` | **开机自启已开启**（这是你要的） |
| `Active: active (running)` | 现在在跑 |
| `Main PID: 5341 (PM2 v5.4.2: God)` | **pm2 的守护进程（它自称 God，意为"总管"）** |
| `node /srv/app/server.js` | **你的程序是它的子进程** |

**`God Daemon` 是什么：** pm2 的核心进程，负责"盯着所有子进程"。**它不是宗教，是它的命名习惯。**

## 6.6 最后再做一次 save

```bash
pm2 save
```

**应该看到：**

```text
[PM2] Saving current process list...
[PM2] Successfully saved in /root/.pm2/dump.pm2
```

**为什么 startup 之后还要 save：**

```text
startup 解决"开机时启动 pm2"。
save 解决"pm2 启动后恢复哪些进程"。
两个都要。
```

## 6.7 三件事的完整链条

```text
pm2 start server.js --name chat-app
        ↓  现在跑着
pm2 save
        ↓  写进 dump.pm2（"重启后恢复什么"）
pm2 startup → 执行它输出的那条 sudo 命令
        ↓  写进 systemd unit（"开机时启动 pm2"）
服务器重启
        ↓
systemd 启动 pm2-root.service
        ↓
pm2 读 dump.pm2
        ↓
chat-app 回来
```

**链条上任何一环断了，重启后就是"网站打不开"。**

---

# 第 7 步：真的重启一次（20 分钟）

**⚠️ 这一步是验收，不是可选项。**

**不重启验证，你永远不知道自己配的对不对。**

## 7.1 重启前记录

```bash
pm2 list
date
uptime
```

**应该看到：**

```text
┌────┬──────────┬─────────────┬─────────┬─────────┬──────────┬────────┬────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name     │ namespace   │ version │ mode    │ pid      │ uptime │ ↺  │ status   │ cpu      │ mem      │ user     │
├────┼──────────┼─────────────┼─────────┼─────────┼──────────┼────────┼────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ chat-app │ default     │ 1.0.0   │ fork    │ 5345     │ 3m     │ 1  │ online   │ 0%       │ 46.3mb   │ root     │
└────┴──────────┴─────────────┴─────────┴─────────┴──────────┴────────┴────┴──────────┴──────────┴──────────┴──────────┘

Mon Nov 16 12:20:33 CST 2026

 12:20:33 up 2 days,  1:15,  1 user,  load average: 0.00, 0.01, 0.05
```

**记下 `uptime` 那一行（up 2 days）。**

## 7.2 重启

```bash
reboot
```

**应该看到：**

```text
Connection to 47.98.xx.xx closed by remote host.
```

**你的 SSH 窗口会断开。这是正常的。**

**`reboot` 是什么：** 重启系统。**它不会问你"确定吗"，敲了就执行。**

**⚠️ 不要在跑着 `npm ci` 或者写数据库的时候 reboot。** 现在你的应用只读，安全。

## 7.3 等，然后重连

**等 30—60 秒。** 然后：

```bash
ssh myserver
```

**如果连不上：**

```text
再等 30 秒。云服务器重启 + 启动服务，1—2 分钟是正常的。
如果 5 分钟还连不上，去控制台看实例状态。
```

## 7.4 验证一：系统重启过了

```bash
uptime
```

**应该看到：**

```text
 12:23:41 up 1 min,  1 user,  load average: 0.15, 0.08, 0.03
```

**`up 1 min` = 开机 1 分钟。** 说明真的重启了。

**对比重启前的 `up 2 days`。**

## 7.5 验证二：pm2 自己起来了

```bash
pm2 list
```

**应该看到：**

```text
┌────┬──────────┬─────────────┬─────────┬─────────┬──────────┬────────┬────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name     │ namespace   │ version │ mode    │ pid      │ uptime │ ↺  │ status   │ cpu      │ mem      │ user     │
├────┼──────────┼─────────────┼─────────┼─────────┼──────────┼────────┼────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ chat-app │ default     │ 1.0.0   │ fork    │ 812      │ 40s    │ 1  │ online   │ 0%       │ 44.8mb   │ root     │
└────┴──────────┴─────────────┴─────────┴─────────┴──────────┴────────┴────┴──────────┴──────────┴──────────┴──────────┘
```

**三件事对上了：**

```text
① id 和 name 还在（说明是从 dump.pm2 恢复的）
② pid 变了（812，新进程）
③ ↺ 是 1（不是 2，说明不是"崩溃重启"，是"恢复"）
```

**⚠️ 如果 `pm2 list` 是空的：**

```text
说明 dump.pm2 没生效。
检查：
① ls -l /root/.pm2/dump.pm2（文件在不在）
② systemctl status pm2-root（服务起来没）
③ 手动恢复：pm2 resurrect
```

## 7.6 验证三：端口和访问

```bash
ss -lntp | grep 3000
```

**应该看到：**

```text
LISTEN 0      511        127.0.0.1:3000       0.0.0.0:*    users:(("node",pid=812,fd=20))
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

**应该看到：**

```text
200
```

**到这一步，你的服务就"自愈"了。**

## 7.7 如果没起来，三步查

**第一步：pm2 的 systemd 服务活着吗**

```bash
systemctl status pm2-root
```

**如果 `Active: failed`：**

```bash
journalctl -u pm2-root -n 50 --no-pager
```

**第二步：dump 文件在吗**

```bash
ls -l /root/.pm2/dump.pm2
```

**没有的话：**

```bash
pm2 resurrect   # 用当前内存里的列表恢复（重启后内存是空的，所以没用）
```

**⚠️ `resurrect` 是从 dump 文件读。文件没了就没得读。这时候要重新 `pm2 start` + `pm2 save`。**

**第三步：日志**

```bash
pm2 logs chat-app --lines 50 --nostream
```

**常见：**

```text
Error: Cannot find module '/root/server.js'
```

**→ 说明 `exec cwd` 是 `/root`，启动时在错误的目录。**

```bash
pm2 delete chat-app
cd /srv/app
pm2 start server.js --name chat-app
pm2 save
```

---

# 第 8 步：日志怎么管（10 分钟）

## 8.1 日志在哪

```bash
ls -lh /root/.pm2/logs/
```

**应该看到：**

```text
-rw-r--r-- 1 root root  4.2K Nov 16 12:25 chat-app-error.log
-rw-r--r-- 1 root root   12K Nov 16 12:25 chat-app-out.log
```

**命名规则：**

```text
<名字>-out.log     标准输出（console.log）
<名字>-error.log   标准错误（console.error、未捕获异常）
```

**为什么分两个文件：**

```text
排错时你只想看错误。
混在一起，一个 500 的堆栈会被几十行正常日志埋掉。
```

## 8.2 一条日志长什么样

**触发一次错误（比如请求一个不存在的接口），然后：**

```bash
pm2 logs chat-app --lines 20 --nostream
```

**应该看到：**

```text
/root/.pm2/logs/chat-app-error.log last 20 lines:
0|chat-app | Error: getaddrinfo ENOTFOUND undefined
0|chat-app |     at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:71:26)
0|chat-app |     at GetAddrInfoReqWrap.callbackTrampoline (node:internal/async_hooks:130:17)

/root/.pm2/logs/chat-app-out.log last 20 lines:
0|chat-app | [dotenv@16.4.5] injecting env (5) from .env
0|chat-app | Server running at http://127.0.0.1:3000
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Error: getaddrinfo ENOTFOUND undefined` | **DNS 解析失败，主机名是 `undefined`** |
| `at GetAddrInfoReqWrap.onlookup` | 出错的位置（Node 内部） |
| `0\|chat-app \|` | pm2 加的前缀：`id\|名字 \|` |

**`ENOTFOUND undefined` 这个报错，99% 是 `.env` 没读到。** 见第 214 节错误 4。

## 8.3 日志会无限增长

**这是 `nohup` 方案的第四个大问题，pm2 也有，但有解。**

**默认情况下 pm2 不轮转日志。** 跑一个月，`out.log` 可能有几百 MB。

**看当前大小：**

```bash
du -sh /root/.pm2/logs/
```

**解决：**

```bash
pm2 install pm2-logrotate
```

**应该看到：**

```text
[PM2][Module] Installing module: pm2-logrotate
...
[PM2][Module] Module successfully installed and launched
```

**它默认做的事（不用你配）：**

```text
① 单个文件超过 10M 就切分
② 保留 30 个历史文件
③ 每天凌晨压缩
```

**查看配置：**

```bash
pm2 conf pm2-logrotate
```

**这一节只要装一次。** 详细配置第 32 周讲。

## 8.4 清空日志

**日志太大想立刻清掉：**

```bash
pm2 flush
```

**应该看到：**

```text
[PM2] Flushing /root/.pm2/pm2.log
[PM2] Flushing /root/.pm2/logs/chat-app-out.log
[PM2] Flushing /root/.pm2/logs/chat-app-error.log
```

**⚠️ `flush` 是清空，不是删除。历史就没了。**

**只想清一个：**

```bash
pm2 flush chat-app
```

---

# 第 9 步：故意犯七个错（30 分钟）

## 错误 1：`node server.js &` 然后关窗口

**操作：**

```bash
pkill -f "node server.js"
cd /srv/app
node server.js &
exit
```

**再进来：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

**会怎样：**

```text
curl: (7) Failed to connect to 127.0.0.1 port 3000: Connection refused
000
```

**为什么：**

```text
SSH 会话结束 → 内核给会话内所有进程发 SIGHUP → node 默认退出。
```

**怎么修：**

```bash
cd /srv/app
pm2 start server.js --name chat-app
```

**这就是这节课存在的理由。**

## 错误 2：在 `/root` 目录下 `pm2 start`

**操作：**

```bash
pm2 delete chat-app
cd /root
pm2 start /srv/app/server.js --name chat-app
pm2 list
```

**会怎样：**

**`pm2 list` 显示 `online`。**

**但访问：**

```bash
curl -i http://127.0.0.1:3000/api/health
```

```text
HTTP/1.1 500 Internal Server Error
```

**日志：**

```text
0|chat-app | [dotenv@16.4.5] injecting env (0) from .env
0|chat-app | Error: getaddrinfo ENOTFOUND undefined
```

**`injecting env (0)` —— 一个变量都没读到。**

**为什么：**

```text
你给的是绝对路径 /srv/app/server.js，pm2 能找到脚本。
但 cwd（工作目录）是你执行命令时所在的 /root。
dotenv 从 cwd 找 .env，/root/.env 不存在 → 0 个变量。
```

**怎么查：**

```bash
pm2 describe chat-app | grep cwd
```

```text
│ exec cwd          │ /root                                    │
```

**怎么修：**

```bash
pm2 delete chat-app
cd /srv/app
pm2 start server.js --name chat-app
pm2 save
```

**另一个办法（不推荐新手用）：**

```bash
pm2 start /srv/app/server.js --name chat-app --cwd /srv/app
```

**规则：**

```text
永远在项目目录里 pm2 start。
```

## 错误 3：入口文件名写错

**操作：**

```bash
cd /srv/app
pm2 start app.js --name chat-app
```

**会怎样：**

```text
[PM2][ERROR] Script not found : /srv/app/app.js
```

**如果文件存在但代码有语法错：**

```bash
pm2 start broken.js --name test
```

**`pm2 list` 会看到：**

```text
│ 1  │ test     │ default     │ N/A     │ fork    │ 0        │ 0      │ 3  │ errored  │ 0%       │ 0b       │ root     │
```

**注意 `status: errored`，`pid: 0`，`↺: 3`。**

**日志：**

```text
0|test | /srv/app/broken.js:1
0|test | require('x
0|test |         ^^
0|test | SyntaxError: Invalid or unexpected token
```

**为什么 `↺` 是 3：**

```text
pm2 会尝试重启几次，每次都在启动阶段崩，重启次数累加。
超过阈值后放弃，标记 errored。
```

**怎么修：**

```bash
pm2 delete test
node /srv/app/broken.js   # 手动跑，看完整报错
```

**⚠️ 记住这个模式：**

```text
pm2 list 里 status 是 errored → 一定是"启动就崩"。
别在 pm2 里瞎试，先 node 手动跑一次看报错。
```

## 错误 4：只 `save` 不 `startup`

**操作：**

```bash
pm2 start server.js --name chat-app
pm2 save
reboot
```

**会怎样：**

**重启后：**

```bash
ssh myserver
pm2 list
```

```text
┌────┬──────────┬─────────────┬─────────┬─────────┬──────────┬────────┬────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name     │ namespace   │ version │ mode    │ pid      │ uptime │ ↺  │ status   │ cpu      │ mem      │ user     │
└────┴──────────┴─────────────┴─────────┴─────────┴──────────┴────────┴────┴──────────┴──────────┴──────────┴──────────┘
```

**空表。**

**为什么：**

```text
pm2 save 写了"要恢复什么"的清单。
但服务器启动时，没有任何东西去启动 pm2。
pm2 不在 → 清单没人读 → 服务全不在。
```

**这就是"只做一半"的典型。**

**怎么修：**

```bash
pm2 resurrect        # 先手动恢复
pm2 startup          # 它会打印一行命令
# 复制那一行，执行
pm2 save
reboot               # 再验一次
```

**⚠️ 这个错误的杀伤力在于：**

```text
它不会立刻报错。
它只在你重启之后才暴露。
而云厂商的"计划内维护重启"通常发生在凌晨。
你第二天早上才知道网站挂了 6 小时。
```

## 错误 5：`startup` 输出那行没执行

**操作：**

```bash
pm2 startup
```

**看到：**

```text
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

**然后你就关掉了，以为配好了。**

**会怎样：**

```bash
systemctl status pm2-root
```

```text
Unit pm2-root.service could not be found.
```

**为什么：**

```text
`pm2 startup`（不带参数）只是"检测你的系统，然后告诉你该执行什么"。
它没有真的写文件。
真正写文件的是那条带 sudo 的命令。
```

**怎么修：**

**老老实实复制那一行执行。** 注意：

```text
① 用你自己的输出，不要抄课件（路径里的用户名/家目录可能不同）
② 必须带 sudo
③ 如果提示 sudo: command not found（root 一般不需要 sudo，直接去掉 sudo 也行）
```

**验证：**

```bash
ls -l /etc/systemd/system/pm2-root.service
```

```text
-rw-r--r-- 1 root root 421 Nov 16 12:15 /etc/systemd/system/pm2-root.service
```

## 错误 6：改完代码不 restart

**操作：**

1. 在服务器上 `nano /srv/app/server.js`，把首页标题改掉；
2. `curl http://127.0.0.1:3000/`。

**会怎样：**

**还是旧标题。**

**为什么：**

```text
Node 启动时把代码读进内存。
改文件 = 改了硬盘上的副本。
内存里的那份没变。
```

**怎么修：**

```bash
pm2 restart chat-app
```

**验证 `↺` 加了 1：**

```bash
pm2 list
```

**⚠️ 更严重的问题：**

```text
如果你在服务器上直接改代码，
下次 git pull 会冲突：
  error: Your local changes to the following files would be overwritten by merge
```

**规则：**

```text
服务器上只读代码，不改代码。
要改就在本地改，push，然后 pull。
```

**（如果你已经改了：`git checkout -- server.js` 丢掉，然后从本地重新 push。）**

## 错误 7：端口被占用

**操作：**

```bash
cd /srv/app
node server.js &          # 先手动起一个
pm2 start server.js --name chat-app
```

**会怎样：**

```bash
pm2 list
```

```text
│ 1  │ chat-app │ default     │ 1.0.0   │ fork    │ 5841     │ 2s     │ 3  │ online   │ 0%       │ 45mb     │ root     │
```

**看起来 online。但日志：**

```text
0|chat-app | node:events:496
0|chat-app |       throw er; // Unhandled 'error' event
0|chat-app |       ^
0|chat-app | Error: listen EADDRINUSE: address already in use 127.0.0.1:3000
0|chat-app |     at Server.setupListenHandle [as _listen2] (node:net:1740:16)
0|chat-app |     at listenInCluster (node:net:1795:12)
0|chat-app |     at Server.listen (node:net:1815:20)
0|chat-app |     at Object.<anonymous> (/srv/app/server.js:42:5)
0|chat-app |   code: 'EADDRINUSE',
0|chat-app |   errno: -98,
0|chat-app |   syscall: 'listen',
0|chat-app |   address: '127.0.0.1',
0|chat-app |   port: 3000
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `EADDRINUSE` | address already in use，地址已被占用 |
| `127.0.0.1:3000` | 就是你要的那个端口 |
| `errno: -98` | Linux 的 "地址已使用" 错误号 |

**为什么 `pm2 list` 还是 online：**

```text
pm2 看的是"进程活着没"。
进程活着，但它在启动阶段就崩了 —— pm2 会重启它，再崩，再重启。
你正好看到它"活着"的那一瞬。
所以要看 ↺，不是只看 status。
```

**怎么修：**

```bash
ss -lntp | grep 3000
```

```text
LISTEN 0  511  127.0.0.1:3000  0.0.0.0:*  users:(("node",pid=5790,fd=20))
```

**找到占用者 PID 5790，杀掉：**

```bash
kill 5790
```

**如果杀不掉：**

```bash
kill -9 5790
```

**⚠️ `kill -9` 是强制杀，进程来不及清理。** 先试 `kill`（等于 `kill -15`，礼貌地请它退出）。

**然后：**

```bash
pm2 restart chat-app
```

---

# 第 10 步：写学习笔记（10 分钟）

```markdown
# 第 215 节课学习笔记

## 一、为什么 `node server.js &` 不行

我做的实验：

关窗口后 `curl` 的输出：

机制（哪个信号，谁发的）：

`nohup` 解决了什么，没解决什么：

## 二、四种方案对比

| 方案 | 关窗口不断 | 崩了重启 | 开机自启 |
|---|---|---|---|
| `node server.js` | | | |
| `nohup ... &` | | | |
| pm2 | | | |

## 三、装 pm2

`pm2 -v` 输出：

`which pm2` 输出：

## 四、启动

我在哪个目录启动的：

`pm2 start` 的命令：

`pm2 list` 里我的应用：

| 列 | 我的值 |
|---|---|
| name | |
| pid | |
| status | |
| ↺ | |
| mem | |

`pm2 logs` 里 `injecting env (n)` 的 n 是：

`pm2 describe` 里 `exec cwd` 是：

## 五、端口

`ss -lntp | grep 3000` 的输出：

`127.0.0.1:3000` 和 `0.0.0.0:3000` 的区别：

## 六、三条命令

| 命令 | 解决什么 | 我执行了吗 |
|---|---|---|
| `pm2 start` | | |
| `pm2 save` | | |
| `pm2 startup`（+ 那行 sudo） | | |

`pm2 save` 输出：

`pm2 startup` 让我执行的那行命令（抄下来）：

## 七、重启验证

重启前 `uptime`：

重启后 `uptime`：

重启后 `pm2 list` 的 status 和 ↺：

重启后 `curl` 的状态码：

## 八、日志

日志路径：

`out.log` 和 `error.log` 分别装什么：

`pm2-logrotate` 装了没：

## 九、七个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| `&` 关窗口 | | |
| 在 /root 启动 | | |
| 入口名写错 | | |
| 只 save 不 startup | | |
| startup 那行没执行 | | |
| 改代码不 restart | | |
| 端口占用 | | |

## 十、卡在哪

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `pm2 list` 是 online
- [ ] 关窗口再连，服务还在
- [ ] 真的 reboot 过一次，服务自己回来了
- [ ] `injecting env (n)` 的 n 对得上
- [ ] 我知道 `↺` 一直涨意味着什么
```

---

# 第 11 步：课后练习

## 练习一：制造一次崩溃，看它自己起来

**要求：**

1. 找到 `pm2 list` 里的 PID；
2. 在另一个窗口 `kill <PID>`；
3. 立刻看 `pm2 list`（每 2 秒看一次，看三次）。

**记录：** status 怎么变的？`↺` 加了几？uptime 归零了吗？

**思考题：** 如果程序是"每 5 分钟崩一次"，你怎么发现？

## 练习二：把 `cwd` 改错，再改回来

**要求：**

1. `pm2 delete chat-app`；
2. 在 `/root` 下 `pm2 start /srv/app/server.js --name chat-app`；
3. `pm2 describe chat-app | grep cwd`；
4. 访问接口，记录报错；
5. 改回正确目录启动。

**记录：** `injecting env (n)` 两次分别是多少？

**思考题：** 为什么 `pm2 list` 显示 online，但接口是 500？

## 练习三：写一张"三分钟恢复卡"

**要求：**

假设你换了一台全新服务器，只能带一张卡片。写下最短的恢复步骤（不超过 10 行命令）。

**记录：** 你的卡片。

**思考题：** 哪些步骤可以写进脚本？哪些必须手动？

## 练习四：看一次内存

**要求：**

1. `pm2 monit` 看 1 分钟；
2. 用 `ab` 或循环 `curl` 打 200 次；
3. 再看内存。

**记录：** 内存涨了多少？会掉回去吗？

**思考题：** 如果每次请求涨 1MB 且不下降，说明什么？

## 练习五：解释给外行

```text
① 为什么关掉终端程序就没了？
② pm2 是什么？
③ 为什么"保存"和"开机自启"是两件事？
```

**记录：** 对方哪个问题问得最刁？

---

# 第 12 步：最终验收

## A. 概念

- [ ] 我能说清 SIGHUP 和"关窗口就断"的关系
- [ ] 我知道 `nohup` 解决了什么、没解决什么
- [ ] 我知道 `save` 和 `startup` 各管什么
- [ ] 我知道 `↺` 这一列的意义
- [ ] 我知道 `exec cwd` 为什么影响 `.env`

## B. 实操

- [ ] `pm2 list` 里 `chat-app` 是 `online`
- [ ] `pm2 logs` 里 `injecting env (n)` 数字正确
- [ ] `ss -lntp | grep 3000` 显示 `127.0.0.1:3000`
- [ ] `curl 127.0.0.1:3000` 返回 200
- [ ] `pm2 save` 成功
- [ ] `systemctl status pm2-root` 是 `enabled` + `active`
- [ ] **重启过一次服务器，服务自己回来了**

## C. 排错

- [ ] `status: errored` 我知道要先手动 `node` 跑
- [ ] `EADDRINUSE` 我知道用 `ss` 找 PID
- [ ] `injecting env (0)` 我知道查 `exec cwd`
- [ ] `↺` 一直涨我知道看日志
- [ ] 重启后空表我知道查 dump 和 systemd

## D. 交付

- [ ] `03-练习代码/pm2-笔记.md`
- [ ] `02-笔记/NOTES.md` 填完
- [ ] 服务在跑，且能自愈

## E. 笔记

- [ ] 三条命令的输出都抄了
- [ ] 重启前后的 `uptime` 都记了
- [ ] 「卡在哪」写了真实内容

## 本节课要能说出口的一句话

> **`node server.js` 是"我在的时候它活着"；pm2 是"我不在、它崩了、机器重启了，它都还活着" —— 而这靠的是三件事：`start` 让它跑，`save` 记住它，`startup` 让机器记得叫它。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 关掉 SSH 服务就没了 | 用了 `&` / `nohup` 没配好 | 用 pm2 |
| `pm2: command not found` | 没加 `-g` / PATH 问题 | `npm i -g pm2`，看 `which pm2` |
| `pm2 list` 空表 | 没 `start` / `dump.pm2` 丢了 | `pm2 start ...` + `pm2 save` |
| 重启后空表 | 没 `startup` 或没执行那行 sudo | `pm2 startup` + 执行输出 |
| status 是 `errored` | 启动就崩 | `node server.js` 手动跑看报错 |
| `↺` 一直涨 | 反复崩溃重启 | `pm2 logs --err` |
| online 但 500 | `exec cwd` 错，`.env` 没读到 | 在项目目录重新 start |
| `injecting env (0)` | 同上 | 同上 |
| `EADDRINUSE` | 端口被占 | `ss -lntp \| grep 3000`，`kill` |
| `Cannot find module` | 依赖没装 / cwd 错 | `cd /srv/app && npm ci` |
| 改了代码没生效 | 没 restart | `pm2 restart chat-app` |
| `pm2-root.service not found` | 没执行 startup 那行 | 复制执行 |
| `systemctl status pm2-root` 是 failed | unit 有错 / node 路径不对 | `journalctl -u pm2-root -n 50` |
| 日志文件几个 G | 没轮转 | `pm2 install pm2-logrotate` |
| 内存一直涨 | 代码有泄漏 | 先 `pm2 restart` 顶上，再查代码 |
| 想让 pm2 跟着代码变自动重启 | `--watch` | **服务器上不要用**，生产环境手动 restart |
