# 第 221 节课：健康检查与备份——先假设它一定会坏

> 前四天你都在让网站"能开"。这一天换个前提：**它一定会坏，只是不知道什么时候。**
> 你要做的是：坏了能立刻发现（健康检查），坏了能恢复（备份），而且**恢复这件事你亲手做过一次**。

**建议用时**：130 分钟
**你需要先完成**：第 220 节课（`https://your-domain.com` 能打开，有锁，`pm2 list` 是 online）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
https://your-domain.com        → 你的应用
pm2 list                       → my-app online
Nginx 转发                     → 正常
证书                           → 有效 89 天
```

**一切看起来都很好。**

**但这套东西有一个共同的弱点：**

```text
它们只会告诉你在"正常"的时候是什么样。
没有任何东西告诉你"现在不正常"。
```

## 0.2 你以后会遇到什么

```text
① 凌晨三点数据库连接池耗尽，页面一直转圈，早上客户打电话你才知道
② 你手滑 UPDATE 忘了加 WHERE，一张表被清空
③ 服务器磁盘写满，Node 进程崩了，pm2 一直重启，日志刷了几百兆
④ 你换了台服务器，旧数据没带过来，客户的历史对话全没了
⑤ 你以为有备份，真出事时发现备份文件是 0 字节
```

**第 ⑤ 条是最常见的。**

```text
备份脚本跑了半年，每次都"成功"，日志也写了。
真要恢复时，发现 pg_dump 早就因为密码错而失败，
只是脚本里没写 set -e，失败了也退出 0。
```

## 0.3 今天要建立的三个概念

```text
① 进程活着 ≠ 能干活。健康检查必须探到依赖。
② 备份三原则：自动、异地、定期测恢复。少一条等于没有。
③ 没测过的恢复，等于没备份。
```

**第 ③ 条是今天唯一不能跳的一步。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `/health` 端点 | 你的项目代码 | 检查数据库，返回 200 / 503 |
| `check-health.sh` | `03-练习代码/` | 用 `curl -f` 判断并输出结果 |
| `backup.sh` | `03-练习代码/`（再传到服务器 `/srv/app/`） | 每日备份 + 清理旧文件 |
| `恢复演练记录.md` | `03-练习代码/` | 删除 → 恢复 → 验数据的完整记录 |
| `NOTES.md` | `02-笔记` | 学习记录 |

---

# 第 1 步：先搞清"活着"和"能干活"的区别（15 分钟）

## 1.1 一个真实的场景

**你的 Node 进程在跑，`pm2 list` 显示 online。**

**但是：**

```text
数据库连接断了 → 每次查询都超时
磁盘满了       → 写文件失败，但进程没崩
模型 API 挂了  → 每次对话都 500
```

**这三种情况下：**

```text
进程都活着。
端口都在监听。
Nginx 都能转发。
但用户什么都干不了。
```

## 1.2 "软 200"是怎么骗人的

**很多人第一个 `/health` 长这样：**

```js
app.get('/health', (req, res) => {
  res.json({ ok: true })
})
```

**它的行为：**

```text
不管数据库、磁盘、外部 API 是什么状态，
只要 Node 进程还在接请求，它就返回 200 {ok:true}。
```

**这叫什么：**

```text
"软 200"（soft 200）
——状态码是 200，但系统实际上已经废了。
```

**后果：**

```text
监控看到 200，显示"正常"。
你在睡觉。
客户在打电话。
```

**⚠️ 一个只返回 `{ok:true}` 的 `/health` 比没有更糟。**

```text
没有健康检查时，你至少知道自己不知道。
有一个假的健康检查时，你以为自己知道。
```

## 1.3 健康检查要探什么

| 层次 | 检查什么 | 用什么 |
|---|---|---|
| **进程层** | 进程还在吗 | `pm2 list` / `systemctl status` |
| **端口层** | 端口在监听吗 | `ss -tlnp` |
| **HTTP 层** | 能返回 200 吗 | `curl -I` |
| **依赖层** | **数据库 / 缓存 / 外部 API 能通吗** | **`/health` 里真的去查一次** |
| **业务层** | 核心功能能用吗 | 更复杂的探针（这一周不做） |

**"进程层"和"端口层"是运维看的。**

**"依赖层"才是你这个应用真正需要的。**

## 1.4 一个原则：`/health` 要"轻"

**反例：**

```js
app.get('/health', async (req, res) => {
  const users = await db.query('SELECT * FROM users')       // 全表扫描
  const msgs = await db.query('SELECT * FROM messages')     // 全表扫描
  const ai = await fetch('https://api.example.com/ping')    // 外部调用
  res.json({ ok: true })
})
```

**为什么不行：**

```text
① 监控每 5 分钟调一次，你就在每 5 分钟做两次全表扫描
② 用户量一上来，这个端点自己就把数据库拖垮了
③ 外部 API 慢的时候，健康检查跟着超时，误报
```

**正确做法：**

```text
数据库：SELECT 1（不碰任何业务表）
外部 API：不检查（它挂了不该让你的站"不健康"）
超时：3 秒内必须返回
```

**记住一句：**

> **健康检查是"探一下灯亮不亮"，不是"把整个电路跑一遍"。**

---

# 第 2 步：写 `/health` 端点（25 分钟）

## 2.1 先看你现在的项目结构

**在服务器上（或本地）：**

```bash
cd /srv/app
ls -la
```

**应该看到：**

```text
drwxr-xr-x  5 root root     4096 Nov 16 10:00 .
drwxr-xr-x  3 root root     4096 Nov 15 22:10 ..
-rw-r--r--  1 root root      312 Nov 15 22:10 .env
-rw-r--r--  1 root root      186 Nov 15 22:10 package.json
drwxr-xr-x 82 root root     4096 Nov 16 09:50 node_modules
-rw-r--r--  1 root root     4210 Nov 16 09:50 server.js
```

**打开 `server.js`：**

```bash
nano server.js
```

**找到这两行附近（你的可能不同）：**

```js
const express = require('express')
const app = express()
```

**`/health` 要加在 `app.listen(...)` 之前。**

## 2.2 版本 A：用 PostgreSQL

**如果你用的是 PostgreSQL（第 5 周之后的项目）：**

```js
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
})

app.get('/health', async (req, res) => {
  const started = Date.now()
  try {
    await pool.query('SELECT 1')
    res.json({
      ok: true,
      db: 'up',
      db_latency_ms: Date.now() - started,
      uptime_s: Math.round(process.uptime()),
    })
  } catch (err) {
    res.status(503).json({
      ok: false,
      db: 'down',
      db_latency_ms: Date.now() - started,
    })
  }
})
```

**逐行读：**

| 行 | 作用 |
|---|---|
| `const started = Date.now()` | 记开始时间，用来算延迟 |
| `await pool.query('SELECT 1')` | **真的去数据库问一句"你在吗"** |
| `res.json({ ok: true, ... })` | 200 + JSON |
| `db_latency_ms` | 数据库花了几毫秒 |
| `uptime_s` | 这个进程活了多久（秒） |
| `catch` | 数据库连不上时走这里 |
| `res.status(503)` | **503 = Service Unavailable，明确告诉监控"我废了"** |

**为什么用 `SELECT 1` 而不是 `SELECT count(*) FROM users`：**

```text
SELECT 1 不需要读任何表，数据库只要"能接连接、能执行语句"就返回。
它是"心跳"，不是"体检"。
```

## 2.3 版本 B：用 JSON 文件当存储

**如果你还在用 JSON 文件（第 3、4 周的项目）：**

```js
const fs = require('fs')
const path = require('path')
const DATA_FILE = path.join(__dirname, 'data', 'messages.json')

app.get('/health', async (req, res) => {
  const started = Date.now()
  try {
    await fs.promises.access(DATA_FILE, fs.constants.R_OK | fs.constants.W_OK)
    const stat = await fs.promises.stat(DATA_FILE)
    res.json({
      ok: true,
      storage: 'up',
      storage_latency_ms: Date.now() - started,
      data_bytes: stat.size,
      uptime_s: Math.round(process.uptime()),
    })
  } catch (err) {
    res.status(503).json({
      ok: false,
      storage: 'down',
    })
  }
})
```

**`fs.constants.R_OK | fs.constants.W_OK` 是什么：**

```text
R_OK = 可读
W_OK = 可写
用 |（按位或）把两个权限合起来：既要能读，也要能写。
```

**为什么文件存储也要检查"可写"：**

```text
磁盘满了，文件还在，能读；但写不进去。
只检查"存在"会漏掉这种情况。
```

## 2.4 版本 C：数据库 + 磁盘都要

**更完整的版本：**

```js
const { execSync } = require('child_process')

app.get('/health', async (req, res) => {
  const checks = {}

  // ① 数据库
  try {
    const t = Date.now()
    await pool.query('SELECT 1')
    checks.db = { ok: true, latency_ms: Date.now() - t }
  } catch (e) {
    checks.db = { ok: false }
  }

  // ② 磁盘剩余（Linux 才有 df，Windows 上会抛错，要 try 包住）
  try {
    const out = execSync("df -P / | tail -1 | awk '{print $5}'").toString().trim()
    const usedPct = parseInt(out.replace('%', ''), 10)
    checks.disk = { ok: usedPct < 90, used_pct: usedPct }
  } catch (e) {
    checks.disk = { ok: true, note: 'not_checked' }
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    checks,
    uptime_s: Math.round(process.uptime()),
  })
})
```

**⚠️ 这个版本里有个隐患：**

```text
execSync 是同步的，会阻塞 Node 的事件循环。
健康检查每 5 分钟一次，影响不大。
但如果有人疯狂刷 /health，你的应用会被这个同步命令卡住。
```

**更稳的做法是用 `fs.statfs`（Node 18.15+ 才有）或者不检查磁盘，交给云监控。**

**这一节课，用版本 A 或 B 就够。版本 C 作为"知道有这回事"。**

## 2.5 重启服务

```bash
pm2 restart my-app
```

**应该看到：**

```text
[PM2] Applying action restartProcessId on app [my-app](ids: [ 0 ])
[PM2] [my-app](0) ✓
┌────┬──────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┐
│ id │ name     │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │
├────┼──────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┤
│ 0  │ my-app   │ default     │ 1.0.0   │ fork    │ 12345    │ 0s     │ 12   │ online    │ 0%       │ 45.2mb   │ root     │
└────┴──────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┘
```

**注意 `↺` 那一列是 `12` —— 重启次数 +1。**

## 2.6 在服务器上测

```bash
curl -s http://127.0.0.1:3000/health
```

**应该看到：**

```json
{"ok":true,"db":"up","db_latency_ms":2,"uptime_s":8}
```

**逐字段读：**

| 字段 | 值 | 意思 |
|---|---|---|
| `ok` | `true` | 整体健康 |
| `db` | `up` | 数据库能连 |
| `db_latency_ms` | `2` | 查一次花了 2 毫秒（正常应该个位数） |
| `uptime_s` | `8` | 进程刚重启 8 秒 |

**看状态码：**

```bash
curl -i -s http://127.0.0.1:3000/health | head -1
```

**应该看到：**

```text
HTTP/1.1 200 OK
```

**⚠️ 如果 `uptime_s` 很小（比如 2），说明进程一直在重启。**

```text
查：pm2 logs my-app --lines 50
```

## 2.7 从公网测

```bash
curl -s https://your-domain.com/health
```

**应该看到同样的 JSON。**

**⚠️ 如果返回的是你的首页 HTML：**

```html
<!DOCTYPE html>
<html>...
```

**说明 `/health` 这个路由被前端的 SPA 兜底路由吃掉了。**

**常见于这种写法：**

```js
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')))
```

**修法：把 `/health` 的路由写在 `app.get('*')` **之前**。**

**Express 是按注册顺序匹配的**，先注册的先赢。

## 2.8 `/health` 要不要暴露给公网

**两种做法：**

| 做法 | 优点 | 缺点 |
|---|---|---|
| 公网可访问 `https://域名/health` | UptimeRobot 这类外部监控能直接用 | 任何人能看到你的服务状态 |
| 只允许本机 `127.0.0.1` | 不泄露信息 | 外部监控用不了，只能在服务器上 curl |

**这一周建议：公网可访问，但只返回最少信息。**

```text
✅ {"ok":true,"db":"up"}
❌ {"ok":false,"error":"password authentication failed for user \"app\""}
```

**第二种会泄露数据库用户名和认证方式。**

**⚠️ 第 33 周会专门讲这个。今天先记住：`/health` 里不要返回原始错误信息。**

**如果你要返回错误详情，只写进日志：**

```js
} catch (err) {
  console.error('[health] db check failed:', err.message)   // 日志里有
  res.status(503).json({ ok: false, db: 'down' })           // 返回里没有
}
```

---

# 第 3 步：让它真的能反映故障（20 分钟）

## 3.1 先证明它是真的

**这一步必须做。** 不做，你不知道你的 `/health` 是真的在工作，还是在演戏。

### 实验：把数据库停掉

**⚠️ 这是在你自己的服务器上，且是学习环境。如果你已经有真实客户数据，先做备份。**

**查数据库服务名：**

```bash
systemctl list-units --type=service | grep -i postgres
```

**应该看到：**

```text
  postgresql.service            loaded active running PostgreSQL RDBMS
```

**停掉它：**

```bash
sudo systemctl stop postgresql
```

**再测：**

```bash
curl -i -s http://127.0.0.1:3000/health
```

**应该看到：**

```text
HTTP/1.1 503 Service Unavailable
Content-Type: application/json; charset=utf-8
...

{"ok":false,"db":"down","db_latency_ms":5001}
```

**逐行读：**

| 行 | 意思 | 说明 |
|---|---|---|
| `HTTP/1.1 503` | **服务不可用** | 这就是我们要的 |
| `{"ok":false,"db":"down"}` | 明确说了哪一项挂了 | 比 `{ok:false}` 有用 |
| `db_latency_ms: 5001` | 花了 5 秒才失败 | 连接超时的默认值 |

**为什么 `db_latency_ms` 是 5001 而不是 2：**

```text
数据库停了，连接会一直等到超时。
所以健康检查的响应时间也会变成 5 秒。
```

**这就引出一个问题：如果监控的超时设的是 3 秒，它会看到"超时"，而不是"503"。**

**两种都能触发告警，但排查时信息不同。**

**起回来：**

```bash
sudo systemctl start postgresql
```

**再测：**

```bash
curl -s http://127.0.0.1:3000/health
```

**应该看到：**

```json
{"ok":true,"db":"up","db_latency_ms":2,"uptime_s":320}
```

## 3.2 这次实验说明了什么

```text
① 你的 /health 真的在探数据库（否则不会变 503）
② 你的进程在数据库挂掉时没有崩（这是好事，能自愈）
③ 你的健康检查会把故障"暴露"出来，而不是藏起来
```

**如果没有第 ① 条：**

```text
数据库停了，/health 还是 200。
监控显示正常。
这就是"软 200"，比不监控更危险。
```

## 3.3 有依赖但更轻的做法：给检查加超时

**数据库挂掉时 `/health` 要等 5 秒，太慢。**

**加一个超时：**

```js
async function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

app.get('/health', async (req, res) => {
  try {
    await withTimeout(pool.query('SELECT 1'), 2000)
    res.json({ ok: true, db: 'up' })
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down' })
  }
})
```

**`Promise.race` 是什么：**

```text
两个 Promise 一起跑，谁先结束用谁的结果。
查询 2 秒内回来 → 用查询结果
2 秒还没回    → 用"超时"这个结果
```

**为什么需要这个：**

```text
监控通常 3—10 秒超时。
健康检查自己耗 5 秒，就可能被监控判成"超时"，
而不是"503"，你在日志里看不到原因。
```

---

# 第 4 步：`curl -f` 和退出码（15 分钟）

## 4.1 为什么脚本里要 `-f`

**`curl` 默认行为：**

```text
服务器返回 500，curl 也认为"我成功完成了这次请求"，
退出码是 0。
```

**这就是"脚本永远成功"的根源。**

**`-f` 是什么：**

```text
--fail：HTTP 状态码 >= 400 时，curl 自己返回非 0 退出码。
```

## 4.2 亲手对比一次

**先用不加 `-f` 的：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/health
echo "exit=$?"
```

**数据库正常时：**

```text
200
exit=0
```

**现在停掉数据库，再跑：**

```text
503
exit=0
```

**⚠️ 状态码 503，但退出码是 0。**

**脚本会认为"检查通过"。**

**加上 `-f`：**

```bash
curl -f -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/health
echo "exit=$?"
```

**数据库挂着时：**

```text
503
exit=22
```

**`22` 是什么：**

```text
curl 的退出码 22 = "HTTP 返回的错误码 >= 400"
```

**数据库正常时：**

```text
200
exit=0
```

## 4.3 逐字读这条命令

```bash
curl -f -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/health
```

| 参数 | 全称 | 作用 |
|---|---|---|
| `-f` | `--fail` | 状态码 >= 400 时退出码非 0 |
| `-s` | `--silent` | 不显示进度条和错误信息 |
| `-o /dev/null` | `--output` | 把响应正文丢掉（Linux 的"黑洞"） |
| `-w "%{http_code}\n"` | `--write-out` | 输出状态码 + 换行 |
| 最后的 URL | —— | 目标 |

**⚠️ Windows 的 Git Bash 也有 `/dev/null`，可以用。**

**PowerShell 里没有 `/dev/null`，用 `$null`：**

```powershell
curl.exe -f -s -o $null -w "%{http_code}`n" http://127.0.0.1:3000/health
```

## 4.4 写 `check-health.sh`

**在 `03-练习代码/` 里写：**

```bash
#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:3000/health}"
TIMEOUT="${2:-5}"

code=$(curl -f -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$URL" || echo "000")

if [ "$code" = "200" ]; then
  echo "OK   $URL  status=$code"
  exit 0
else
  echo "FAIL $URL  status=$code"
  exit 1
fi
```

**逐行读：**

| 行 | 作用 |
|---|---|
| `#!/usr/bin/env bash` | 用 bash 执行（不写这行，某些环境会用 sh） |
| `set -euo pipefail` | **三个保护**，见下 |
| `${1:-默认值}` | 第一个参数，没传就用默认值 |
| `curl ... \|\| echo "000"` | curl 失败（比如连不上）时，把状态码记成 `000` |
| `if [ "$code" = "200" ]` | 只有 200 才算健康 |
| `exit 0` / `exit 1` | **退出码给调用方（cron / 监控）判断** |

**`set -euo pipefail` 拆开：**

| 部分 | 作用 |
|---|---|
| `-e` | 任何命令失败（非 0）就立刻退出 |
| `-u` | 用了未定义的变量就报错（防止 `$DB_PASS` 拼错变成空） |
| `-o pipefail` | 管道里任何一段失败，整条管道算失败 |

**⚠️ `-u` 很重要，但也容易误伤：**

```bash
# 有 -u 时，这行会报错退出
echo "$OPTIONAL_VAR"

# 正确写法：给默认值
echo "${OPTIONAL_VAR:-}"
```

**给执行权限：**

```bash
chmod +x check-health.sh
```

**跑它：**

```bash
./check-health.sh
```

**应该看到：**

```text
OK   http://127.0.0.1:3000/health  status=200
```

**看退出码：**

```bash
echo $?
```

**应该看到：**

```text
0
```

**停掉数据库再跑：**

```bash
sudo systemctl stop postgresql
./check-health.sh
echo $?
```

**应该看到：**

```text
FAIL http://127.0.0.1:3000/health  status=503
1
```

**起回来：**

```bash
sudo systemctl start postgresql
```

## 4.5 为什么退出码比输出重要

**因为机器只认退出码。**

```bash
if ./check-health.sh; then
  echo "服务正常"
else
  echo "服务异常，发告警"
fi
```

**如果脚本永远 `exit 0`，这个 `if` 永远走第一个分支。**

**这就是为什么第 6 步的备份脚本里必须有 `set -e`，第 5 步的监控也靠退出码。**

---

# 第 5 步：写备份脚本（30 分钟）

## 5.1 备份三原则

```text
一、自动      靠手动备份的，一定会忘
二、异地      备份和原件不在同一台机器、同一块盘
三、测恢复    没测过的备份等于没备份
```

**三条缺一条，这套备份就是"心理安慰"。**

| 缺哪条 | 会怎样 |
|---|---|
| 缺自动 | 你会在"最忙的那一周"忘记备份，而那一周数据变化最大 |
| 缺异地 | 磁盘挂了 / 服务器被删 / 机房事故，原件和备份一起没 |
| 缺测恢复 | 备份文件可能是 0 字节、可能是坏的、可能少了表 |

## 5.2 先想清楚"要备份什么"

| 东西 | 在哪 | 怎么备 |
|---|---|---|
| **数据库** | PostgreSQL / MySQL | `pg_dump` / `mysqldump` |
| **上传的文件** | `/srv/app/uploads/` | `tar -czf` 打包 |
| **配置文件** | `/srv/app/.env`、Nginx 配置 | 单独存一份（**注意含密钥**） |
| **代码** | GitHub | **不用备**，git 就是备份 |
| `node_modules` | —— | **不用备**，`npm ci` 能装回来 |

**⚠️ 代码不用备，但"代码 + 配置 + 数据"要能一起恢复。**

**最常见的失误：**

```text
恢复了数据库，但忘了 .env。
应用起来连不上库，因为密码在 .env 里。
```

## 5.3 建目录

```bash
sudo mkdir -p /srv/backups
sudo chmod 700 /srv/backups
```

**`chmod 700` 是什么：**

```text
只有所有者能读、写、进入。
```

| 数字 | 权限 |
|---|---|
| 7 | rwx（读 + 写 + 执行/进入） |
| 0 | ---（什么都没有） |

**所以 `700` = 只有 root 能访问。**

**为什么：**

```text
备份文件里有全部客户数据。
644（所有人可读）等于把数据库导出放在公网上。
```

**看结果：**

```bash
ls -ld /srv/backups
```

**应该看到：**

```text
drwx------ 2 root root 4096 Nov 16 11:20 /srv/backups
```

**`drwx------` 里开头的 `d` 是目录，后面九个字符就是 700。**

## 5.4 数据库备份命令

**先手动跑一次，确认能通。**

```bash
pg_dump -h 127.0.0.1 -U app -d appdb -F c -f /srv/backups/test.dump
```

**会提示输密码（或者用 `PGPASSWORD` 环境变量）。**

**应该看到：没有输出。**

**验证文件：**

```bash
ls -lh /srv/backups/test.dump
```

**应该看到：**

```text
-rw------- 1 root root 2.3M Nov 16 11:22 /srv/backups/test.dump
```

**逐项读：**

| 项 | 意思 | 你要确认什么 |
|---|---|---|
| `-rw-------` | 只有 root 能读写 | 权限对 |
| `2.3M` | 大小 | **不能是 0** |
| `test.dump` | 文件名 | —— |

**⚠️ 如果大小是 0：**

```text
pg_dump 失败了，但你可能没看到报错（比如被 2>/dev/null 吞了）。
先手动跑一次看真实输出。
```

**参数拆开：**

| 参数 | 意思 |
|---|---|
| `-h 127.0.0.1` | 主机 |
| `-U app` | 用户名 |
| `-d appdb` | 数据库名 |
| `-F c` | **custom 格式**（压缩、能选择性恢复） |
| `-f 路径` | 输出到文件 |

**`-F c` 和其他格式的区别：**

| 格式 | 参数 | 特点 |
|---|---|---|
| plain | `-F p`（默认） | 纯 SQL 文本，能直接看，能 `psql -f` 恢复 |
| custom | `-F c` | 压缩、支持 `pg_restore` 并行/选择性恢复 |
| directory | `-F d` | 多文件，支持并行备份 |
| tar | `-F t` | 老格式，不推荐 |

**用 `-F c`。** 文件小，恢复灵活。

## 5.5 写 `backup.sh`

**在服务器上：**

```bash
sudo nano /srv/app/backup.sh
```

**内容：**

```bash
#!/usr/bin/env bash
set -euo pipefail

# ---------- 配置 ----------
APP_DIR=/srv/app
BACKUP_DIR=/srv/backups
KEEP_DAYS=7
DATE=$(date +%F-%H%M)

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=app
DB_NAME=appdb
# 密码从环境文件读，不要写死在脚本里
source /srv/app/.env

export PGPASSWORD="$DB_PASSWORD"

# ---------- 1. 数据库 ----------
DB_FILE="$BACKUP_DIR/${DB_NAME}-${DATE}.dump"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$DB_FILE"
echo "[$(date '+%F %T')] db backup ok: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

# ---------- 2. 上传的文件 ----------
if [ -d "$APP_DIR/uploads" ]; then
  UP_FILE="$BACKUP_DIR/uploads-${DATE}.tar.gz"
  tar -czf "$UP_FILE" -C "$APP_DIR" uploads
  echo "[$(date '+%F %T')] uploads backup ok: $UP_FILE ($(du -h "$UP_FILE" | cut -f1))"
fi

# ---------- 3. 配置文件 ----------
ENV_FILE="$BACKUP_DIR/env-${DATE}.tar.gz"
tar -czf "$ENV_FILE" -C /srv/app .env
chmod 600 "$ENV_FILE"
echo "[$(date '+%F %T')] env backup ok: $ENV_FILE"

# ---------- 4. 清理 7 天前的 ----------
find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "[$(date '+%F %T')] cleanup done, kept ${KEEP_DAYS} days"

# ---------- 5. 上传到对象存储（异地） ----------
# 以你实际用的工具为准，下面以 coscli 为例
if command -v coscli >/dev/null 2>&1; then
  coscli cp "$DB_FILE" cos://your-bucket/backups/ -r
  echo "[$(date '+%F %T')] uploaded to object storage"
else
  echo "[$(date '+%F %T')] WARN: coscli not found, skip remote upload"
fi

echo "[$(date '+%F %T')] ALL DONE"
```

**逐段读这个脚本：**

| 段 | 作用 | 为什么这么写 |
|---|---|---|
| `set -euo pipefail` | 任何一步失败就停 | **防止"失败也报成功"** |
| `DATE=$(date +%F-%H%M)` | 时间戳 | 文件名不重复 |
| `source .env` | 读数据库密码 | 密码不写在脚本里 |
| `export PGPASSWORD` | 让 pg_dump 免交互 | 否则 cron 里会卡住等密码 |
| `pg_dump ...` | 备份数据库 | —— |
| `du -h` | 打印文件大小 | **日志里能看到大小，0 字节一眼发现** |
| `tar -czf` | 打包上传目录 | `-c` 创建 / `-z` gzip / `-f` 文件 |
| `chmod 600` | 只有 root 能读 | `.env` 里有密钥 |
| `find ... -mtime +7 -delete` | 删 7 天前的 | 防止磁盘满 |
| `command -v coscli` | 检查工具在不在 | 不在就跳过，不要让整个脚本失败 |
| `echo ... ALL DONE` | 明确结束标记 | 日志里能确认跑完了 |

**⚠️ `-mtime +7` 的坑：**

```text
-mtime +7  = "修改时间在 8 天前或更早"（不是"7 天前"）
所以实际保留 7—8 天的文件。
差一天，不影响。
```

**给执行权限：**

```bash
sudo chmod +x /srv/app/backup.sh
```

**手动跑一次：**

```bash
sudo /srv/app/backup.sh
```

**应该看到：**

```text
[2026-11-16 11:30:02] db backup ok: /srv/backups/appdb-2026-11-16-1130.dump (2.3M)
[2026-11-16 11:30:03] uploads backup ok: /srv/backups/uploads-2026-11-16-1130.tar.gz (840K)
[2026-11-16 11:30:03] env backup ok: /srv/backups/env-2026-11-16-1130.tar.gz (4.0K)
[2026-11-16 11:30:03] cleanup done, kept 7 days
[2026-11-16 11:30:04] uploaded to object storage
[2026-11-16 11:30:04] ALL DONE
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `db backup ok ... (2.3M)` | 数据库备份成功，**2.3M 说明有内容** |
| `uploads backup ok ... (840K)` | 上传目录 840K |
| `env backup ok ... (4.0K)` | `.env` 很小，正常 |
| `cleanup done` | 清理执行了 |
| `uploaded to object storage` | 异地备份成功 |
| `ALL DONE` | **整条链跑完** |

**⚠️ 没有 `ALL DONE` 就是中途挂了。** 这是你判断"跑没跑完"的唯一标志。

**如果没有 `coscli`：**

```text
WARN: coscli not found, skip remote upload
```

**这条警告意味着：你只有本地备份，没有异地备份。**

```text
第 2 条原则没满足。
今天不解决，但要知道自己是"不完整的"。
```

## 5.6 本地备份和异地备份的区别

**用一张表说清：**

| 场景 | 只有本地备份 | 有异地备份 |
|---|---|---|
| 误删一张表 | ✅ 能恢复 | ✅ 能恢复 |
| 磁盘坏了 | ❌ 全没 | ✅ 能恢复 |
| 服务器被误释放 | ❌ 全没 | ✅ 能恢复 |
| 机房火灾 / 断水 | ❌ 全没 | ✅ 能恢复 |
| 勒索软件加密 | ❌ 备份也被加密 | ✅ 能恢复 |

**⚠️ 本地备份最大的问题：它和数据库在同一台机器上。**

```text
你备份得再勤，机器没了就全没了。
```

**异地的三种做法（按成本排序）：**

| 做法 | 成本 | 难度 |
|---|---|---|
| 对象存储（腾讯云 COS / 阿里云 OSS） | 几块钱/月 | 装个 CLI，加一行命令 |
| 另一台服务器 `scp` / `rsync` | 一台服务器的钱 | 配好密钥 |
| 你自己电脑定期下载 | 0 | **最容易忘，不算自动** |

**这一周不强求。但你要在笔记里写清"我现在是第几级"。**

## 5.7 上传到对象存储（示例）

**以腾讯云 COS 的 `coscli` 为例（工具会变，以官网文档为准）：**

```bash
coscli cp /srv/backups/appdb-2026-11-16-1130.dump cos://your-bucket/backups/
```

**应该看到：**

```text
 0.00 B / 2.30 MB [----------------------------------------] 0.00% 
2.30 MB / 2.30 MB [========================================] 100.00% ...
Upload successfully.
```

**⚠️ 桶的权限必须是"私有读写"。**

```text
公有读 = 全世界都能下载你的数据库导出。
这是真实发生过的事故，而且是被搜索引擎索引到的。
```

---

# 第 6 步：让它每天自动跑（20 分钟）

## 6.1 cron 是什么

**大白话：Linux 自带的定时任务。**

```text
你写一行"每天 3 点跑这个脚本"，
它就每天 3 点跑，不需要你记得。
```

## 6.2 打开 crontab

```bash
sudo crontab -e
```

**第一次会问你用哪个编辑器：**

```text
no crontab for root - using an empty one

Select an editor.  To change later, run 'select-editor'.
  1. /bin/nano        <---- easiest
  2. /usr/bin/vim.basic
  3. /usr/bin/vim.tiny
  4. /bin/ed

Choose 1-4 [1]:
```

**选 `1`（nano）。**

**⚠️ 一定要用 `sudo crontab -e`，不是 `crontab -e`。**

```text
你的备份脚本要读 /srv/app/.env、要写 /srv/backups（root 才能访问）。
用普通用户跑，会 Permission denied。
```

## 6.3 写一行

**在文件最后加：**

```bash
0 3 * * * /srv/app/backup.sh >> /var/log/backup.log 2>&1
```

**这行的五个时间字段，逐字读：**

```text
0    3    *    *    *    命令
│    │    │    │    │
│    │    │    │    └── 星期几（0—7，0 和 7 都是周日）
│    │    │    └─────── 月份（1—12）
│    │    └──────────── 日期（1—31）
│    └───────────────── 小时（0—23）
└────────────────────── 分钟（0—59）
```

**所以 `0 3 * * *` = 每天 03:00。**

| 写法 | 意思 |
|---|---|
| `0 3 * * *` | 每天 3:00 |
| `*/10 * * * *` | 每 10 分钟 |
| `0 */6 * * *` | 每 6 小时（0 点、6 点、12 点、18 点） |
| `30 2 * * 1` | 每周一 2:30 |
| `0 4 1 * *` | 每月 1 号 4:00 |

**命令部分：**

```text
/srv/app/backup.sh >> /var/log/backup.log 2>&1
```

| 部分 | 作用 |
|---|---|
| `/srv/app/backup.sh` | **绝对路径**（cron 的工作目录不是你想要的） |
| `>> /var/log/backup.log` | 追加输出到日志 |
| `2>&1` | **把错误输出也重定向到同一个文件** |

**⚠️ 为什么必须写 `2>&1`：**

```text
不写的话，标准输出进日志，错误输出会被 cron 用邮件发给你。
而服务器通常没配邮件，错误就消失了。
你会看到"日志里没报错"，实际上错误根本没进日志。
```

## 6.4 保存并验证

**`Ctrl + O` → `Enter` → `Ctrl + X`。**

**应该看到：**

```text
crontab: installing new crontab
```

**看当前有哪些任务：**

```bash
sudo crontab -l
```

**应该看到：**

```text
0 3 * * * /srv/app/backup.sh >> /var/log/backup.log 2>&1
```

## 6.5 不要等到明天 —— 用一个临时任务测

**把时间改成"下一分钟"：**

```bash
sudo crontab -e
```

**改成（假设现在是 11:47）：**

```bash
48 11 * * * /srv/app/backup.sh >> /var/log/backup.log 2>&1
```

**等一分钟，然后看日志：**

```bash
tail -20 /var/log/backup.log
```

**应该看到：**

```text
[2026-11-16 11:48:01] db backup ok: /srv/backups/appdb-2026-11-16-1148.dump (2.3M)
...
[2026-11-16 11:48:02] ALL DONE
```

**⚠️ 如果日志是空的：**

```text
① cron 没跑（时间写错了、cron 服务没启动）
② 脚本跑了但立刻失败，而错误没被重定向
③ 脚本没有执行权限
```

**逐项查：**

```bash
# cron 服务在跑吗
systemctl status cron --no-pager

# 脚本有执行权限吗
ls -l /srv/app/backup.sh

# 系统 cron 日志（Ubuntu）
grep CRON /var/log/syslog | tail -20
```

**`systemctl status cron` 应该看到：**

```text
● cron.service - Regular background program processing daemon
     Loaded: loaded (/lib/systemd/system/cron.service; enabled; ...)
     Active: active (running) since ...
```

**`grep CRON /var/log/syslog` 应该看到：**

```text
Nov 16 11:48:01 ubuntu-server CRON[23456]: (root) CMD (/srv/app/backup.sh >> /var/log/backup.log 2>&1)
```

**这行说明"cron 真的执行了这条命令"。**

**如果这行有，但日志是空的：问题在脚本里。**

**测完把时间改回 3 点。**

## 6.6 cron 的环境和你登录时的环境不一样

**这是 cron 最容易踩的坑。**

**你 SSH 登录后能跑：**

```bash
pg_dump --version
```

**但 cron 里可能报：**

```text
/srv/app/backup.sh: line 20: pg_dump: command not found
```

**为什么：**

```text
cron 的 PATH 通常只有 /usr/bin:/bin。
而 PostgreSQL 的客户端在 /usr/lib/postgresql/14/bin 或 /usr/pgsql-14/bin。
```

**怎么查真实路径：**

```bash
which pg_dump
```

**应该看到：**

```text
/usr/bin/pg_dump
```

**如果在 `/usr/bin`，cron 能找到。**

**如果看到的是：**

```text
/usr/lib/postgresql/14/bin/pg_dump
```

**那就要在脚本里写全路径，或者加 PATH：**

```bash
export PATH="/usr/lib/postgresql/14/bin:$PATH"
```

**⚠️ 更稳的做法：脚本里所有命令都用全路径。**

```bash
/usr/bin/pg_dump ...
/usr/bin/tar ...
/usr/bin/find ...
```

**这样不管谁在什么环境跑，都不会找不到命令。**

---

# 第 7 步：恢复演练（25 分钟，不能跳）

## 7.1 为什么这一步不能跳

**因为"备份成功"和"能恢复"是两件事。**

**真实案例的三种形态：**

```text
① 备份文件 0 字节（pg_dump 失败了，脚本没检查）
② 备份文件正常，但少了某张表（-t 参数用错了）
③ 备份文件正常，但恢复时报"版本不兼容"
```

**这三种情况下：**

```text
备份脚本跑了 180 天，日志全是 "ok"。
你要恢复的那天，才知道自己什么都没有。
```

## 7.2 ⚠️ 铁律：演练不在正式库上做

**正确做法：**

```text
建一个 restore_test 库，恢复到那里，验证数据，然后删掉。
正式库一个字节都不动。
```

**⚠️ 下面这些命令，看清楚库名再敲：**

```bash
# ❌ 绝对不要
dropdb appdb
psql -d appdb -c "DROP TABLE messages"

# ✅ 演练用这个
dropdb restore_test
createdb restore_test
```

**如果你只有一台机器、一个数据库：**

```text
先做一次完整备份，确认备份文件正常，再开始演练。
并且在演练前停掉写入（pm2 stop my-app），避免演练期间数据变化干扰比对。
```

## 7.3 演练第一步：记下"正常状态"

**在正式库上查几个数：**

```bash
psql -h 127.0.0.1 -U app -d appdb -c "SELECT count(*) FROM users;"
psql -h 127.0.0.1 -U app -d appdb -c "SELECT count(*) FROM messages;"
```

**应该看到：**

```text
 count 
-------
    37
(1 row)

 count 
-------
  1284
(1 row)
```

**记下来：**

```text
users: 37
messages: 1284
```

**再记一个具体的值，用来验证"内容级"正确：**

```bash
psql -h 127.0.0.1 -U app -d appdb -c "SELECT id, left(content, 20), created_at FROM messages ORDER BY id DESC LIMIT 3;"
```

**应该看到：**

```text
 id   |         left         |         created_at         
------+----------------------+----------------------------
 1284 | 你好，我想问一下退款 | 2026-11-16 11:02:33.412+08
 1283 | 订单号是 20261116001  | 2026-11-16 11:01:58.221+08
 1282 | 好的谢谢              | 2026-11-16 11:00:12.003+08
```

**这三行是你恢复后要对比的"指纹"。**

## 7.4 演练第二步：建测试库

```bash
createdb -h 127.0.0.1 -U app restore_test
```

**应该看到：没有输出。**

**确认建好了：**

```bash
psql -h 127.0.0.1 -U app -l | grep restore_test
```

**应该看到：**

```text
 restore_test | app  | UTF8     | en_US.UTF-8 | en_US.UTF-8 | 
```

## 7.5 演练第三步：恢复

**用最新的备份文件：**

```bash
ls -lt /srv/backups/*.dump | head -3
```

**应该看到（最新的在最上面）：**

```text
-rw------- 1 root root 2412544 Nov 16 11:48 /srv/backups/appdb-2026-11-16-1148.dump
-rw------- 1 root root 2412544 Nov 16 11:30 /srv/backups/appdb-2026-11-16-1130.dump
```

**恢复：**

```bash
pg_restore -h 127.0.0.1 -U app -d restore_test --no-owner --clean --if-exists /srv/backups/appdb-2026-11-16-1148.dump
```

**参数拆开：**

| 参数 | 作用 | 为什么 |
|---|---|---|
| `-d restore_test` | **恢复到哪个库** | **看清楚，不是 appdb** |
| `--no-owner` | 不恢复所有者信息 | 避免"角色不存在"的报错 |
| `--clean` | **恢复前先删掉目标库里已有的对象** | 避免"已存在"冲突 |
| `--if-exists` | 配合 `--clean`，不存在也不报错 | 让输出干净 |

**应该看到（可能有一些 NOTICE）：**

```text
pg_restore: warning: errors ignored on restore: 0
```

**⚠️ 注意这行的数字：**

```text
errors ignored on restore: 0    → 全部成功
errors ignored on restore: 12   → 有 12 个错误被忽略，要去查
```

**如果数字不是 0，加 `-v` 重跑看详情：**

```bash
pg_restore -h 127.0.0.1 -U app -d restore_test --no-owner --clean --if-exists -v /srv/backups/appdb-2026-11-16-1148.dump 2>&1 | grep -i error | head
```

## 7.6 演练第四步：验数据

**查行数：**

```bash
psql -h 127.0.0.1 -U app -d restore_test -c "SELECT count(*) FROM users;"
psql -h 127.0.0.1 -U app -d restore_test -c "SELECT count(*) FROM messages;"
```

**应该看到：**

```text
 count 
-------
    37

 count 
-------
  1284
```

**和 7.3 记的数字一模一样。**

**查内容指纹：**

```bash
psql -h 127.0.0.1 -U app -d restore_test -c "SELECT id, left(content, 20), created_at FROM messages ORDER BY id DESC LIMIT 3;"
```

**应该看到和 7.3 完全一样的三行。**

**⚠️ 如果行数对但内容不对：**

```text
说明你恢复的是"另一个时间点"的备份。
检查文件名里的时间戳。
```

**如果行数少了：**

```text
① 备份时数据库正在写入（没有事务一致性）
② 备份文件是旧的
③ 恢复过程中报错被忽略了（看 errors ignored）
```

## 7.7 演练第五步：真的"删一次"

**这一步是为了验证"从零恢复"。**

**在测试库里删一张表：**

```bash
psql -h 127.0.0.1 -U app -d restore_test -c "DROP TABLE messages;"
```

**应该看到：**

```text
DROP TABLE
```

**现在测试库是"坏"的。**

**再恢复一次：**

```bash
pg_restore -h 127.0.0.1 -U app -d restore_test --no-owner --clean --if-exists /srv/backups/appdb-2026-11-16-1148.dump
```

**再查：**

```bash
psql -h 127.0.0.1 -U app -d restore_test -c "SELECT count(*) FROM messages;"
```

**应该看到：**

```text
 count 
-------
  1284
```

**这一步证明：**

```text
即使数据被删了，只要有备份，就能回到删除之前的状态。
```

## 7.8 演练第六步：清理

**删掉测试库：**

```bash
dropdb -h 127.0.0.1 -U app restore_test
```

**确认删了：**

```bash
psql -h 127.0.0.1 -U app -l | grep restore_test
```

**应该看到：没有任何输出。**

**⚠️ `dropdb` 是"删库"，没有回收站。**

```text
敲之前看一眼库名。
restore_test  → 可以删
appdb         → 绝对不要
```

## 7.9 记录这次演练

**在 `03-练习代码/恢复演练记录.md` 里写：**

```markdown
# 恢复演练记录

## 基本信息

- 演练时间：
- 备份文件：
- 备份文件大小：
- 恢复到的库名：

## 演练前（正式库）

| 表 | 行数 |
|---|---|
| users | |
| messages | |

内容指纹（最新 3 条）：

## 恢复过程

创建测试库命令：
恢复命令：
恢复输出里的 `errors ignored on restore`：

## 恢复后（测试库）

| 表 | 行数 | 和正式库一致吗 |
|---|---|---|
| users | | |
| messages | | |

内容指纹：

## 删表再恢复

删除命令：
恢复后行数：

## 耗时

从开始恢复到验完数据，用了多少分钟：

## 结论

- 备份能不能用：
- 有没有发现问题：
- 下次演练计划时间：
```

**⚠️ "耗时"这一栏很重要。**

```text
如果恢复用了 40 分钟，你就要知道：
真出事时，网站至少挂 40 分钟。
这个数字要写进 RUNBOOK（第 224 节）。
```

---

# 第 8 步：故意犯七个错（30 分钟）

## 错误 1：`/health` 只返回 `ok`

**操作：**

```js
app.get('/health', (req, res) => res.json({ ok: true }))
```

**然后停掉数据库：**

```bash
sudo systemctl stop postgresql
```

**再测：**

```bash
curl -i -s http://127.0.0.1:3000/health
```

**会怎样：**

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"ok":true}
```

**数据库已经停了，健康检查还说"我很好"。**

**为什么：**

```text
这个端点只证明"Node 进程还能接请求"。
它没有探任何依赖。
```

**怎么修：**

```text
在 `/health` 里真的查一次数据库（第 2 步的代码）。
```

**⚠️ 起回数据库：**

```bash
sudo systemctl start postgresql
```

## 错误 2：`curl` 不加 `-f`

**操作：**

```bash
status=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health)
if [ "$status" = "200" ]; then echo OK; else echo FAIL; fi
```

**看起来没问题？**

**但如果你写成这样：**

```bash
if curl -s http://127.0.0.1:3000/health > /dev/null; then
  echo "OK"
else
  echo "FAIL"
fi
```

**数据库挂着时，会输出：**

```text
OK
```

**为什么：**

```text
不带 -f 时，curl 只要"完成了一次 HTTP 请求"就返回 0。
服务器回 503，curl 也认为"我成功地问到了答案"。
```

**怎么修：**

```bash
if curl -f -s http://127.0.0.1:3000/health > /dev/null; then
  echo "OK"
else
  echo "FAIL"
fi
```

**现在数据库挂着时会输出 `FAIL`。**

**验证退出码：**

```bash
curl -f -s http://127.0.0.1:3000/health > /dev/null
echo $?
```

**应该看到：**

```text
22
```

## 错误 3：备份写在同一个磁盘

**操作：**

```bash
df -h /
```

**应该看到：**

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G   12G   26G  32% /
```

**你的 `/srv/backups` 和 `/srv/app` 都在 `/dev/vda1` 上。**

**会怎样：**

```text
磁盘坏 → 数据库和备份一起没
磁盘满 → 数据库写不了，备份也写不了
误删 /srv → 一起没
```

**怎么验证它们在同一个盘：**

```bash
df -h /srv/app /srv/backups
```

**应该看到两行的 `Filesystem` 完全一样：**

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G   12G   26G  32% /
/dev/vda1        40G   12G   26G  32% /
```

**怎么修：**

```text
① 上传到对象存储（最省事，几块钱/月）
② 挂一块云硬盘单独放备份（还是同一台机器，只能防"误删"）
③ 定期 rsync 到另一台机器（真异地）
```

**⚠️ 云服务器还有第四种"全没"：**

```text
包年包月到期未续费 → 服务器被释放 → 数据一起删。
这时候唯一能救你的是"异地备份"。
```

## 错误 4：cron 里找不到命令

**操作：**

**脚本里写：**

```bash
pg_dump -h 127.0.0.1 -U app -d appdb -F c -f "$DB_FILE"
```

**手动跑正常，放进 cron 后日志里出现：**

```text
/srv/app/backup.sh: line 21: pg_dump: command not found
```

**为什么：**

```text
cron 的 PATH 只有 /usr/bin:/bin。
你在 SSH 里的 PATH 包含 /usr/lib/postgresql/14/bin。
```

**怎么查 cron 的真实环境：**

**临时加一个任务：**

```bash
* * * * * echo "PATH=$PATH" >> /tmp/cron-env.log 2>&1
```

**一分钟后看：**

```bash
cat /tmp/cron-env.log
```

**应该看到：**

```text
PATH=/usr/bin:/bin
```

**⚠️ 就这两个目录。**

**怎么修（两种）：**

```bash
# 方法一：脚本里加 PATH
export PATH="/usr/lib/postgresql/14/bin:/usr/local/bin:$PATH"

# 方法二：命令写全路径
/usr/bin/pg_dump ...
```

**方法二更稳。** 版本升级后路径变了，你会立刻发现（而不是悄悄用了旧版本）。

## 错误 5：crontab 里的 `%` 没转义

**操作：**

**在 crontab 里直接写带 `date` 格式的命令：**

```bash
0 3 * * * /srv/app/backup.sh --suffix=$(date +%F) >> /var/log/backup.log 2>&1
```

**会怎样：**

```text
脚本收到的参数是 --suffix=2026-11-16
但后面的部分被 cron 当成"换行"，命令被截断
```

**或者日志里出现奇怪的错误：**

```text
/bin/sh: 1: -16: not found
```

**为什么：**

```text
crontab 里 % 有特殊含义：表示"命令输入的结束，后面是标准输入"。
所以 date +%F 里的 % 会被 cron 解释成换行。
```

**怎么修：**

```text
① 根本不要在 crontab 里写 date，让脚本内部自己生成时间戳（推荐）
② 非要写，把 % 转义成 \%
```

```bash
0 3 * * * /srv/app/backup.sh --suffix=$(date +\%F) >> /var/log/backup.log 2>&1
```

**推荐第 ① 种。**

```text
crontab 只负责"什么时候跑"，不负责"跑什么参数"。
所有逻辑放进脚本。
```

## 错误 6：备份文件权限 644

**操作：**

```bash
chmod 644 /srv/backups/*.dump
ls -l /srv/backups/
```

**会怎样：**

```text
-rw-r--r-- 1 root root 2412544 Nov 16 11:48 appdb-2026-11-16-1148.dump
```

**`644` 是什么意思：**

```text
所有者：读写
同组：  只读
其他人：只读
```

**后果：**

```text
这台机器上任何一个普通用户（包括被入侵后建立的低权限账号）
都能把你的全部客户数据打包下载。
```

**更糟的情况：**

```text
如果这个目录恰好被 Nginx 的 root 指到，
或者被误放进网站目录，
备份文件就能通过 https://your-domain.com/backups/xxx.dump 直接下载。
```

**怎么修：**

```bash
chmod 600 /srv/backups/*.dump
chmod 700 /srv/backups
```

**验证：**

```bash
ls -ld /srv/backups
ls -l /srv/backups/ | head -3
```

**应该看到：**

```text
drwx------ 2 root root 4096 Nov 16 11:48 /srv/backups
-rw------- 1 root root 2412544 Nov 16 11:48 appdb-2026-11-16-1148.dump
```

**⚠️ 还要确认备份目录不在网站根目录下：**

```bash
ls -ld /srv/backups /srv/app/public 2>/dev/null
```

**如果 `/srv/backups` 在 `/srv/app/public` 里面，立刻移走。**

## 错误 7：只备份，不清理

**操作：**

**把清理那行注释掉：**

```bash
# find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
```

**然后假装跑了 60 天（或者手动复制几十个文件模拟）：**

```bash
for i in $(seq 1 60); do cp /srv/backups/appdb-2026-11-16-1148.dump /srv/backups/fake-$i.dump; done
df -h /
```

**会怎样：**

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G   39G  512M  99% /
```

**然后：**

```bash
curl -i -s http://127.0.0.1:3000/health
```

**会看到：**

```text
HTTP/1.1 503 Service Unavailable
```

**日志里：**

```text
Error: ENOSPC: no space left on device, write
```

**逐字读：**

| 部分 | 意思 |
|---|---|
| `ENOSPC` | **No Space**，磁盘满了 |
| `no space left on device` | 设备上没有剩余空间 |
| `write` | 写操作失败 |

**为什么这会让网站挂：**

```text
① Node 写日志失败 → 进程可能崩
② 数据库写 WAL 失败 → PostgreSQL 直接拒绝写入
③ pm2 写日志失败 → 进程起不来
④ 会话文件写不了 → 所有人都登录不上
```

**怎么修：**

```bash
# 看谁占了空间
du -sh /srv/backups /var/log /srv/app/node_modules 2>/dev/null | sort -h

# 删掉模拟文件
rm -f /srv/backups/fake-*.dump

# 确认恢复
df -h /
```

**把清理那行加回来，并且验证：**

```bash
find /srv/backups -type f -mtime +7 -print
```

**先 `-print` 看会删哪些，确认无误再改成 `-delete`。**

**⚠️ `find ... -delete` 是不可恢复的。先 `-print`。**

---

# 第 9 步：写学习笔记（10 分钟）

```markdown
# 第 221 节课学习笔记

## 一、进程活着和能干活有什么区别

举三个"进程活着但干不了活"的例子：

## 二、软 200

什么是软 200：

为什么它比"没有健康检查"更危险：

## 三、我的 `/health` 做了什么

它检查了哪些东西：

它返回 200 的条件：

它返回 503 的条件：

我停掉数据库时，它返回什么（贴状态码和正文）：

## 四、`curl -f`

不加 `-f` 时，503 的退出码是：

加上 `-f` 时，503 的退出码是：

`check-health.sh` 的完整内容（贴代码）：

## 五、备份三原则

| 原则 | 我现在做到了吗 | 差在哪 |
|---|---|---|
| 自动 | | |
| 异地 | | |
| 测恢复 | | |

我的备份包括哪些东西：

不包括哪些（为什么）：

## 六、备份脚本

`backup.sh` 里 `set -euo pipefail` 三个参数各干什么：

`PGPASSWORD` 为什么要 export：

`-mtime +7` 实际保留几天：

清理之前为什么要先 `-print`：

## 七、cron

我写的 crontab 那一行：

五个时间字段分别是什么：

为什么必须写 `2>&1`：

cron 的 PATH 和我登录时有什么不同：

我怎么验证 cron 真的跑了：

## 八、恢复演练

备份文件：
恢复到的库：
恢复前 users / messages 行数：
恢复后 users / messages 行数：
`errors ignored on restore` 是多少：
整个恢复用了多少分钟：

删表再恢复，成功了吗：

我遇到的最大问题：

## 九、七个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| /health 只返回 ok | | |
| curl 不加 -f | | |
| 备份同盘 | | |
| cron 找不到命令 | | |
| crontab % 没转义 | | |
| 备份 644 | | |
| 不清理 | | |

## 十、完成检查

- [ ] 我的 `/health` 会真的查依赖
- [ ] 我停过数据库，看到过 503
- [ ] 我的备份脚本手动跑成功，有 `ALL DONE`
- [ ] 备份进了 cron，我验证过它真的跑了
- [ ] 我做过一次完整恢复演练，行数对上了
- [ ] 我在测试库里删过表，又恢复回来了
- [ ] 我知道我的备份是不是异地
```

---

# 第 10 步：课后练习（45 分钟）

## 练习一：给 `/health` 加一个"慢"的依赖

**要求：**

1. 在 `/health` 里加一个"检查外部 API"的逻辑（可以用 `fetch` 一个公开的地址）；
2. 给它设 2 秒超时；
3. 断网（或在服务器上封掉那个地址）测试，看 `/health` 是否变 503；
4. 记录响应时间。

**记录什么：**

```text
正常时 /health 的响应时间：
断网时 /health 的响应时间：
状态码变化：
```

**思考题：**

> 外部 API 挂了，你的网站"不健康"了吗？这个检查应该加进 `/health` 吗？

## 练习二：把备份改成"两份"

**要求：**

1. 在本地 `/srv/backups` 之外，再加一份到另一个位置（对象存储 / 另一台机器 / 另一块盘）；
2. 两份都要能恢复；
3. 记录"两份备份的路径"。

**记录什么：**

```text
本地备份路径：
异地备份路径：
异地那份怎么传的（命令）：
我怎么确认异地那份存在：
```

**思考题：**

> 如果异地备份只保留 3 天，本地保留 7 天，这样做合理吗？

## 练习三：模拟一次"误删数据"

**要求（在测试库或本地做）：**

1. 备份；
2. 故意 `DELETE FROM messages WHERE id > 1200;`（删掉一部分）；
3. 记录删了多少行；
4. 从备份恢复到一个新库，把那部分数据找回来；
5. 记录整个流程。

**记录什么：**

```text
删除前 messages 行数：
删除命令：
删除后行数：
恢复后行数：
用了多久：
```

**思考题：**

> 真出这种事，你会"整库恢复"还是"只恢复那一部分"？各有什么代价？

## 练习四：让 cron 发一封"成功邮件"

**要求：**

1. 在备份脚本最后加一行"如果成功，写一个标记文件"；
2. 再写一个"每天早上 9 点检查标记文件是不是今天的"的小脚本；
3. 不是今天的，就输出警告。

**记录什么：**

```text
标记文件路径：
检查脚本的内容：
我怎么模拟"昨天没备份"：
```

**思考题：**

> 为什么不直接看备份日志，而要另做一个"检查标记"的脚本？

## 练习五：用自己的话讲

```text
① 为什么 `/health` 里不能做全表扫描？
② 为什么 `curl -f` 比"看响应正文"更可靠？
③ 「异地」到底防的是什么？本地备份防不了什么？
④ 为什么恢复演练必须在另一个库做？
⑤ 如果备份脚本失败了但退出码是 0，会有什么后果？
```

---

# 第 11 步：最终验收（10 分钟）

## A. 概念

- [ ] 我能说出"进程活着"和"能干活"的区别
- [ ] 我知道软 200 是什么，以及它为什么危险
- [ ] 我能背出备份三原则
- [ ] 我知道"没测过的备份等于没备份"
- [ ] 我知道 cron 的 PATH 和登录时不一样

## B. 实操

- [ ] `/health` 会真的查数据库，返回 `db: up/down`
- [ ] 停掉数据库时 `/health` 返回 503
- [ ] `check-health.sh` 用 `curl -f`，退出码正确
- [ ] `backup.sh` 手动跑成功，日志有 `ALL DONE`
- [ ] 备份包含数据库 + 上传文件 + `.env`
- [ ] 备份进了 cron，我验证过它真的执行
- [ ] 备份目录权限是 700，文件是 600
- [ ] 有清理逻辑，保留 7 天

## C. 排错

- [ ] 看到 `command not found` 在 cron 日志里，我知道是 PATH
- [ ] 看到 `ENOSPC`，我知道是磁盘满
- [ ] 看到 `errors ignored on restore: 12`，我知道要加 `-v` 看详情
- [ ] 备份文件 0 字节时，我知道脚本中间失败了
- [ ] 我知道怎么验证 cron 到底跑没跑（`grep CRON /var/log/syslog`）

## D. 交付

- [ ] `03-练习代码/check-health.sh` 存在且能跑
- [ ] `03-练习代码/backup.sh` 存在，服务器上 `/srv/app/backup.sh` 也在
- [ ] `03-练习代码/恢复演练记录.md` 有行数对比和耗时
- [ ] 我能说出"真出事时，恢复要多久"

## E. 笔记

- [ ] `NOTES.md` 十栏都填了
- [ ] 「备份三原则」那张表写了我"差在哪"
- [ ] 「恢复演练」写了真实耗时

## 本节课要能说出口的一句话

> **健康检查要探到依赖，不然它只会告诉你"进程还在"；备份要自动、异地、亲手恢复过，不然它只是一堆占地方的文件。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `/health` 返回 200 但数据库挂了 | 只检查了进程 | 在端点里真的查一次 |
| `/health` 返回 HTML 不是 JSON | 被 SPA 兜底路由吃了 | 把 `/health` 写在 `app.get('*')` 之前 |
| `/health` 要等 5 秒才返回 | 数据库连接超时 | 加 `Promise.race` 超时 |
| `curl` 返回 503 但退出码 0 | 没加 `-f` | 加 `-f` |
| `curl` 退出码 7 | 连不上（端口没开 / 程序没起） | 查 `ss -tlnp` |
| `curl` 退出码 22 | 状态码 >= 400（正常，说明 `-f` 生效了） | 去看服务日志 |
| `curl` 退出码 28 | 超时 | 加 `--max-time`，查服务为什么慢 |
| cron 日志是空的 | 没跑 / 没重定向 / 没权限 | `grep CRON /var/log/syslog` |
| cron 报 `command not found` | PATH 不同 | 脚本里写全路径 |
| cron 报 `-16: not found` | `%` 没转义 | 用 `\%`，或把逻辑移进脚本 |
| `pg_dump: command not found`（手动也报） | 没装客户端 | `apt install postgresql-client` |
| `pg_dump: password authentication failed` | `.env` 里的密码错 / 没 export | 手动跑一次看报错 |
| 备份文件 0 字节 | 命令失败但没 `set -e` | 加 `set -euo pipefail` |
| `No space left on device` | 磁盘满 | `du -sh /* \| sort -h` |
| `pg_restore: role "xxx" does not exist` | 恢复到新库时角色不存在 | 加 `--no-owner` |
| `pg_restore: errors ignored on restore: 12` | 有对象恢复失败 | 加 `-v` 看具体错误 |
| 恢复后行数不对 | 用了旧备份文件 / 备份时正在写入 | 看文件名时间戳，检查 `errors ignored` |
| `dropdb: database is being accessed` | 有连接占着 | `SELECT pg_terminate_backend` 或重启应用 |
| 备份上传失败 | 桶权限 / 密钥过期 | 手动跑 CLI 看报错 |
| 备份目录太大 | 没清理 | 加 `find -mtime +7 -delete` |
| `chmod 700` 后自己都进不去 | 你是普通用户 | 用 `sudo` |
