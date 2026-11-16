# 第 138 节课：日志分级与轮转

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 132 节你做了结构化日志。今天做的是**"怎么管"** —— 分级、轮转、清理、告警。
> 做完之后，你的日志目录应该能跑一年不用管。

**建议用时**：110 分钟
**你需要先完成**：第 137 节（错误中间件里有 `log.error`）
**今天要装**：什么都不用装（用 Node 内置 `fs`）

---

# 第 0 步：先看看不管理会怎样（15 分钟）

## 0.1 一个真实的数字

```bash
# 看你现在的日志文件
ls -lh logs/
du -sh logs/
```

**假设你的日志每天涨 30 MB。**（1000 请求/天 × 7 事件 × 每条约 700 字节 ≈ 5 MB，加上 debug 级别的输出，30 MB 很保守）

```text
一天      30 MB
一个月    900 MB
一年      11 GB
```

**三个问题会依次出现：**

```text
① 半年后　你的磁盘满了 → 服务写不进去 → 崩溃
② 三个月后 日志文件太大 → grep 要 30 秒 → 你不想查了
③ 一个月后 你在 20 万行里找一条 → 放弃 → 认为"日志没用"
```

## 0.2 一个更隐蔽的问题

```text
你为了"方便调试"，把 LOG_LEVEL 设成了 debug
→ 每个请求记录 12 条日志（含完整输入输出）
→ 一天 300 MB
```

**然后：**

```text
① 磁盘一周满了
② 你为了省事，写了个 rm -rf logs/*
③ 把正在写的日志文件删了 → 进程还在往"已删除的 inode"里写 → 磁盘空间不释放
④ df 显示磁盘满，但 du 找不到大文件
```

**第 ③ 条是最阴的** —— **删正在写的文件不会释放空间**（Linux 的 inode 语义）。

**这个坑能让你查两小时。**

## 0.3 今天要建的四件事

```text
① 分级       五个级别，各自记什么
② 分流       错误单独一份，正常一份
③ 轮转       按天 + 按大小，两种都要
④ 清理       超期自动删，且不删正在写的
```

**加上一个：**

```text
⑤ 可查询    一条命令能统计"今天各事件多少次"
```

---

# 第 1 步：五个级别，各自记什么（25 分钟）

## 1.1 五个级别（不是三个）

```javascript
export const LEVELS = {
  debug: 10,   // 只在你排查时打开，正常运行不记
  info:  20,   // 正常业务流（每次请求的开始和结束）
  warn:  30,   // 预期内的异常（4xx、降级、重试、超时）
  error: 40,   // 你出 bug 了，或者依赖挂了（5xx）
  fatal: 50,   // 进程要挂了，或者数据可能损坏
};
```

**为什么不是只有 info / warn / error？**

```text
debug：第 132 节你记了很多细节（first_byte_ms、tok_in、span）
       生产环境不应该全记（量大 + 可能含 PII）
       但排查问题时又需要 → 所以要有一个"能打开"的级别

fatal：有些错误必须立刻知道（数据损坏、无法恢复）
       它和 error 的区别是"要不要半夜叫醒你"
```

## 1.2 每个级别的判定标准

| 级别 | 判断标准 | 例子 | 谁会看 |
|---|---|---|---|
| `debug` | 只有排查时才需要 | 每步耗时、token 数、span 名字 | 你（临时打开） |
| `info` | 业务上的"一件事发生了" | 请求进、请求出、任务完成 | 你（日常） |
| `warn` | 不符合预期但能继续 | 4xx、降级到备用、重试、队列积压 | 你（每天扫） |
| `error` | 需要人做决定 | 5xx、主备都挂、审核拦截、数据写入失败 | 你（当天看） |
| `fatal` | 系统可能已经不安全 | 数据库损坏、配置文件被改坏、磁盘满 | 立刻 |

## 1.3 最常见的错误：`warn` 和 `error` 混用

```javascript
// ❌ 三种都记成 error
log.error("用户输入为空");           // 这是 4xx，预期内
log.error("主模型超时，已切备用");    // 这是自动恢复的
log.error("数据库连接丢失");          // 这才是真 error

// ✅ 正确
log.warn("empty_input");             // 4xx
log.warn("degraded", { which: "backup" });  // 自动恢复了
log.error("db_connection_lost");     // 需要人处理
```

**判断方法一句话：**

```text
"这件事发生之后，需要我做什么吗？"
  不需要（系统自己处理了）→ warn
  需要（我得看/得改）      → error
  立刻需要（半夜也得来）    → fatal
```

**"主模型超时切备用"为什么是 warn？**

因为**系统自己处理了，用户无感知。** 但你要知道它发生了（一天 50 次说明主模型不行了）。

**这正是 warn 的定义：不需要你动手，但你需要知道。**

## 1.4 把级别接进 logger

```javascript
// app/lib/logger.js
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";
import { redact } from "./redact.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const MIN = LEVELS[config.log.level] ?? 20;

// ===== 两个输出：全部一份 + 错误一份 =====
fs.mkdirSync(config.log.dir, { recursive: true });

const streams = {
  all: fs.createWriteStream(path.join(config.log.dir, "app.jsonl"), { flags: "a" }),
  error: fs.createWriteStream(path.join(config.log.dir, "error.jsonl"), { flags: "a" }),
};

function write(stream, line) {
  // 防止日志写满磁盘把进程搞崩
  if (!stream.write(line + "\n")) {
    // 缓冲区满了，等一下（Node 会自动 drain，这里只是不阻塞）
  }
}

export function makeLogger({ service = "app", bindings = {} } = {}) {
  function emit(level, event, fields = {}) {
    if (LEVELS[level] < MIN) return;

    const rec = {
      ts: new Date().toISOString(),
      level,
      service,
      event,
      ...bindings,
      ...fields,
    };

    // 全局脱敏
    for (const k of Object.keys(rec)) {
      if (typeof rec[k] === "string" && !["event", "level", "ts", "service"].includes(k)) {
        rec[k] = redact(rec[k]);
      }
    }

    const line = JSON.stringify(rec);
    write(streams.all, line);
    if (LEVELS[level] >= LEVELS.warn) write(streams.error, line);
  }

  return {
    debug: (e, f) => emit("debug", e, f),
    info:  (e, f) => emit("info", e, f),
    warn:  (e, f) => emit("warn", e, f),
    error: (e, f) => emit("error", e, f),
    fatal: (e, f) => emit("fatal", e, f),
    child: (extra) => makeLogger({ service, bindings: { ...bindings, ...extra } }),
  };
}

export const log = makeLogger();
```

## 1.5 为什么错误要单独一份

```text
app.jsonl    一天 30 MB，包含全部事件
error.jsonl  一天 200 KB，只含 warn 及以上
```

**用途不同：**

```text
查一个具体请求 → grep app.jsonl（有 trace_id，能查到全部上下文）
看"今天出了什么错" → 打开 error.jsonl（200 行，5 分钟看完）
```

**没有第二份，你要在 30 MB 里筛选 warn/error，然后发现里面 90% 是 info。**

## 1.6 一个必须验证的事

```bash
node -e "
import('./app/lib/logger.js').then(({ log }) => {
  log.debug('d', { x: 1 });
  log.info('i', { x: 1 });
  log.warn('w', { x: 1 });
  log.error('e', { x: 1 });
  log.fatal('f', { x: 1 });
});
"

echo '--- app.jsonl ---'; cat logs/app.jsonl | jq -r '.level + " " + .event'
echo '--- error.jsonl ---'; cat logs/error.jsonl | jq -r '.level + " " + .event'
```

**期望：**

```text
--- app.jsonl ---
debug d
info i
warn w
error e
fatal f

--- error.jsonl ---
warn w
error e
fatal f
```

**如果 `debug` 没出现** → 你的 `LOG_LEVEL` 是 `info`，正确。

---

# 第 2 步：按天轮转（25 分钟）

## 2.1 为什么"按天"是必须的

```text
你查"上周三发生了什么" → 直接打开 app-2026-11-13.jsonl
不用 grep 一个 900 MB 的文件
```

**而且按天切之后，清理就是"删整个文件"，不是"删几行"。**

## 2.2 实现：一个包装的 WriteStream

```javascript
// app/lib/rotating-stream.js
import fs from "node:fs";
import path from "node:path";

/**
 * 按天 + 按大小轮转的写入流。
 * 文件名：app.jsonl → app-2026-11-16.jsonl → app-2026-11-16.1.jsonl
 */
export function createRotatingStream({ dir, baseName, maxBytes, onRotate }) {
  fs.mkdirSync(dir, { recursive: true });

  let currentDay = today();
  let seq = 0;
  let stream = null;
  let bytes = 0;

  function today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function fileName(day, n) {
    return n === 0 ? `${baseName}-${day}.jsonl` : `${baseName}-${day}.${n}.jsonl`;
  }

  function open() {
    if (stream) stream.end();

    const file = path.join(dir, fileName(currentDay, seq));
    stream = fs.createWriteStream(file, { flags: "a" });

    try {
      bytes = fs.statSync(file).size;
    } catch {
      bytes = 0;
    }

    stream.on("error", (e) => {
      // 日志写失败不能拖死进程
      process.stderr.write(`[logger] 写入失败 ${file}: ${e.message}\n`);
    });
  }

  function maybeRotate() {
    const d = today();

    // 跨天 → 换文件
    if (d !== currentDay) {
      currentDay = d;
      seq = 0;
      open();
      onRotate?.({ reason: "day", file: fileName(currentDay, seq) });
      return;
    }

    // 超大小 → 加序号
    if (bytes >= maxBytes) {
      seq++;
      open();
      onRotate?.({ reason: "size", file: fileName(currentDay, seq) });
    }
  }

  open();

  return {
    write(line) {
      maybeRotate();
      const buf = line + "\n";
      stream.write(buf);
      bytes += Buffer.byteLength(buf);
    },
    end(cb) {
      stream.end(cb);
    },
    close() {
      stream.end();
    },
  };
}
```

## 2.3 接进 logger

```javascript
// app/lib/logger.js（改）
import { createRotatingStream } from "./rotating-stream.js";

const allStream = createRotatingStream({
  dir: config.log.dir,
  baseName: "app",
  maxBytes: config.log.rotateAt,
  onRotate: ({ reason, file }) => {
    process.stdout.write(`[logger] 轮转（${reason}）→ ${file}\n`);
    // 跨天时顺便清理旧文件
    if (reason === "day") cleanupOldLogs();
  },
});

const errStream = createRotatingStream({
  dir: config.log.dir,
  baseName: "error",
  maxBytes: config.log.rotateAt,
});

// ...
const line = JSON.stringify(rec);
allStream.write(line);
if (LEVELS[level] >= LEVELS.warn) errStream.write(line);
```

## 2.4 一个必须做的验证

**为了不等到明天，把"跨天"用一个环境变量模拟：**

```javascript
function today() {
  if (process.env.FAKE_DAY) return process.env.FAKE_DAY;
  // ...正常逻辑
}
```

```bash
# 第一次写
FAKE_DAY=2026-11-16 node -e "import('./app/lib/logger.js').then(m => m.log.info('day1'))"

# 换天
FAKE_DAY=2026-11-17 node -e "import('./app/lib/logger.js').then(m => m.log.info('day2'))"

ls -l logs/
```

**期望：**

```text
app-2026-11-16.jsonl
app-2026-11-17.jsonl
```

**两个文件，各有各的内容。这就是"按天切"。**

## 2.5 按大小的验证

```bash
# 把上限设成 200 字节
LOG_ROTATE_BYTES=200 node -e "
import('./app/lib/logger.js').then(({ log }) => {
  for (let i = 0; i < 20; i++) log.info('tick', { i, pad: 'x'.repeat(50) });
});
"

ls -l logs/app-*.jsonl
```

**期望：**

```text
app-2026-11-16.jsonl      约 200 字节
app-2026-11-16.1.jsonl    约 200 字节
app-2026-11-16.2.jsonl    约 200 字节
...
```

**注意：单个文件会略微超过 200 字节** —— 因为是在写之前检查、写之后累加。**这不是 bug，是"允许单条日志撑破上限"**（否则一条 300 字节的日志会永远写不进去）。

---

# 第 3 步：清理旧日志（20 分钟）★ 有个大坑

## 3.1 最危险的写法

```javascript
// ❌ 这个写法看着对，实际有坑
setInterval(() => {
  const cutoff = Date.now() - 7 * 86400_000;
  for (const f of fs.readdirSync(logsDir)) {
    const full = path.join(logsDir, f);
    if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
  }
}, 86400_000);
```

**三个问题：**

```text
① 可能删掉正在写的文件（如果今天的文件名匹配了 cutoff，虽然不太可能，
   但如果你的服务器时间错了呢）
② readdirSync / statSync / unlinkSync 都是同步的 → 阻塞事件循环
③ 没有错误处理 → 一个文件删不掉（权限）会让整个循环中断
```

## 3.2 正确写法

```javascript
// app/lib/log-cleanup.js
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config/index.js";
import { log } from "./logger.js";

export async function cleanupOldLogs() {
  const dir = config.log.dir;
  const keepMs = config.log.keepDays * 86_400_000;
  const cutoff = Date.now() - keepMs;

  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return { deleted: 0, skipped: 0 };
  }

  // 只处理我们自己生成的日志文件
  const mine = files.filter((f) => /^(app|error)-\d{4}-\d{2}-\d{2}(\.\d+)?\.jsonl$/.test(f));

  // ★ 关键：保护正在写的文件
  const current = currentLogNames();
  const candidates = mine.filter((f) => !current.has(f));

  let deleted = 0, skipped = 0, freed = 0;

  for (const f of candidates) {
    const full = path.join(dir, f);
    try {
      const st = await fs.stat(full);
      if (st.mtimeMs >= cutoff) { skipped++; continue; }

      const size = st.size;
      await fs.unlink(full);
      deleted++;
      freed += size;
    } catch (e) {
      // 单个文件失败不影响其他
      skipped++;
    }
  }

  if (deleted > 0) {
    log.info("log_cleanup", {
      deleted,
      skipped,
      freed_mb: (freed / 1e6).toFixed(1),
      keep_days: config.log.keepDays,
    });
  }

  return { deleted, skipped, freed };
}

function currentLogNames() {
  // 从 rotating-stream 那边拿到当前文件名
  // 简化实现：今天的日期 + 序号 0..N 都保护
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const names = new Set();
  for (const base of ["app", "error"]) {
    names.add(`${base}-${day}.jsonl`);
    for (let i = 1; i <= 20; i++) names.add(`${base}-${day}.${i}.jsonl`);
  }
  return names;
}
```

## 3.3 那个大坑：删正在写的文件

**Linux 的 inode 语义：**

```text
进程打开文件 → 得到一个 inode 引用
你 rm 这个文件 → 目录项被删，但 inode 还在（因为进程还引用着）
→ df 显示磁盘还是满的
→ du 找不到这个大文件（因为目录项没了）
→ 你不知道空间去哪了
```

**验证方法：**

```bash
# 终端 1：起一个持续写日志的进程
node -e "setInterval(()=>process.stdout.write('x'.repeat(1000)+'\n'),10)" > /tmp/test.log &
PID=$!

# 终端 2：看空间
ls -lh /tmp/test.log

# 删掉它
rm /tmp/test.log

# 看进程还在写
lsof -p $PID | grep deleted
# 输出：node ... 1w REG ... /tmp/test.log (deleted)   ← 关键

# 空间没释放
df -h /tmp
```

**正确做法：**

```text
① 你的清理函数必须排除"今天的所有文件"
② 更好的做法：用文件句柄的 ino 比对，不用文件名
③ 最稳的做法：让进程自己在跨天时关闭旧文件（rotating-stream 已经做了）
```

**另一个方案：用 `logrotate` 系统工具**

```bash
# /etc/logrotate.d/myapp
/var/www/app/logs/*.jsonl {
  daily
  rotate 7
  compress
  missingok
  notifempty
  copytruncate    ← 关键：复制后清空，而不是移动
}
```

**`copytruncate` 的作用：** 复制内容到新文件，然后把原文件**截断为 0**（不删）。**这样进程的文件句柄还有效。**

**代价：** 复制和截断之间的日志可能丢失（微秒级窗口）。**对你的项目完全可接受。**

**推荐：** 自己写清理（可控），但要知道 `logrotate` 这个选项存在。

## 3.4 一个必须验证的实验

```bash
# ① 造一批"旧文件"
for d in 01 02 03 04 05 06 07 08 09 10; do
  echo '{"ts":"2026-11-01T00:00:00Z","level":"info","event":"old"}' > "logs/app-2026-11-$d.jsonl"
  touch -d "10 days ago" "logs/app-2026-11-$d.jsonl"
done

# ② 确保今天的文件存在
FAKE_DAY=$(date +%F) node -e "import('./app/lib/logger.js').then(m=>m.log.info('today'))"

# ③ 跑清理
node -e "import('./app/lib/log-cleanup.js').then(m=>m.cleanupOldLogs()).then(r=>console.log(r))"

# ④ 看结果
ls logs/
```

**期望：10 个旧文件全被删，今天的文件还在。**

**如果你的清理把今天的删了** → 你的 `currentLogNames` 逻辑有 bug → 立刻修（这是最危险的那种 bug）。

---

# 第 4 步：让日志能查（20 分钟）

## 4.1 五个你会天天用的命令

```bash
# ① 今天各事件多少次（漏斗）
jq -r 'select(.ts > "2026-11-16") | .event' logs/app-2026-11-16*.jsonl | sort | uniq -c | sort -rn

# ② 所有的 warn/error
cat logs/error-2026-11-16*.jsonl | jq -c '{ts, level, event, code: (.code // .kind // "-")}' | tail -30

# ③ 某个 trace 的完整时间线
grep -h 'tr_20261116_8f3a2b1c' logs/app-2026-11-16*.jsonl | jq -r '[.ts[11:23], .event, (.span//"-"), (.dur_ms//"-")] | @tsv'

# ④ 降级的次数和原因
cat logs/app-*.jsonl | jq -c 'select(.event=="degraded" or .degraded==true)' | wc -l

# ⑤ 检查有没有 PII 泄漏（上线前必跑）
cat logs/*.jsonl | grep -oE '1[3-9][0-9]{9}' | head
```

## 4.2 写一个 `log` 命令

**每次都敲长的 jq 很累。做一个 shell 脚本：**

```bash
# scripts/log.sh
#!/bin/bash
# 用法：
#   ./scripts/log.sh today           今天的漏斗
#   ./scripts/log.sh errors          今天的 warn/error
#   ./scripts/log.sh trace tr_xxx    某个 trace 的时间线
#   ./scripts/log.sh pii             检查 PII

cd "$(dirname "$0")/.." || exit 1
DAY=$(date +%F)
DIR="${LOG_DIR:-./logs}"

case "$1" in
  today)
    cat "$DIR"/app-$DAY*.jsonl 2>/dev/null \
      | jq -r 'select(.level!="debug") | .event' \
      | sort | uniq -c | sort -rn
    ;;
  errors)
    cat "$DIR"/error-$DAY*.jsonl 2>/dev/null \
      | jq -r '"\(.ts[11:19]) \(.level) \(.event) \(.code // .kind // "-")"'
    ;;
  trace)
    grep -h "$2" "$DIR"/app-$DAY*.jsonl 2>/dev/null \
      | jq -r '[.ts[11:23], .event, (.span//"-"), (.dur_ms//"-")] | @tsv'
    ;;
  pii)
    HIT=$(cat "$DIR"/*.jsonl 2>/dev/null | grep -oE '1[3-9][0-9]{9}|[1-9][0-9]{16}[0-9Xx]' | head -5)
    if [ -n "$HIT" ]; then
      echo "❌ 发现疑似 PII："; echo "$HIT"
    else
      echo "✅ 没有发现"
    fi
    ;;
  sizes)
    du -sh "$DIR"
    ls -lhS "$DIR" | head -8
    ;;
  *)
    echo "用法: $0 {today|errors|trace <id>|pii|sizes}"
    ;;
esac
```

```bash
chmod +x scripts/log.sh
./scripts/log.sh today
./scripts/log.sh pii
```

## 4.3 一个每日摘要脚本

```javascript
// scripts/daily-digest.js
// 每天早上跑一次，输出一段人话
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const dir = process.env.LOG_DIR ?? "./logs";
const day = process.argv[2] ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

const files = fs.readdirSync(dir).filter((f) => f.includes(day) && f.startsWith("app"));

const stat = { events: {}, levels: {}, fails: {}, degraded: 0, reqs: 0, durs: [] };

for (const f of files) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, f)) });
  for await (const line of rl) {
    let r; try { r = JSON.parse(line); } catch { continue; }
    stat.events[r.event] = (stat.events[r.event] ?? 0) + 1;
    stat.levels[r.level] = (stat.levels[r.level] ?? 0) + 1;
    if (r.event === "call_fail") stat.fails[r.kind ?? "?"] = (stat.fails[r.kind ?? "?"] ?? 0) + 1;
    if (r.degraded === true) stat.degraded++;
    if (r.event === "req_out") { stat.reqs++; if (r.dur_ms) stat.durs.push(r.dur_ms); }
  }
}

stat.durs.sort((a, b) => a - b);
const p = (q) => stat.durs.length ? stat.durs[Math.floor(stat.durs.length * q)] : 0;

console.log(`\n📊 ${day} 日志摘要\n`);
console.log(`请求数    ${stat.reqs}`);
console.log(`降级次数  ${stat.degraded}  (${((stat.degraded / Math.max(stat.reqs, 1)) * 100).toFixed(1)}%)`);
console.log(`耗时      P50 ${p(0.5)}ms  P90 ${p(0.9)}ms  P99 ${p(0.99)}ms`);

console.log(`\n事件：`);
for (const [k, v] of Object.entries(stat.events).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${k.padEnd(16)} ${v}`);
}

if (Object.keys(stat.fails).length) {
  console.log(`\n失败原因：`);
  for (const [k, v] of Object.entries(stat.fails)) console.log(`  ${k.padEnd(20)} ${v}`);
}

console.log(`\n级别：`);
for (const [k, v] of Object.entries(stat.levels)) console.log(`  ${k.padEnd(8)} ${v}`);

// 判断"今天是否异常"
const warn = stat.levels.warn ?? 0;
const err = stat.levels.error ?? 0;
if (err > stat.reqs * 0.02) console.log(`\n⚠️  error 占请求数 ${((err / stat.reqs) * 100).toFixed(1)}%，超过 2%，需要看`);
if (stat.degraded > stat.reqs * 0.05) console.log(`\n⚠️  降级率 ${((stat.degraded / stat.reqs) * 100).toFixed(1)}%，超过 5%，检查主模型`);
```

**跑它：**

```bash
node scripts/daily-digest.js
```

**输出：**

```text
📊 2026-11-15 日志摘要

请求数    1042
降级次数  3  (0.3%)
耗时      P50 2769ms  P90 5900ms  P99 8900ms

事件：
  req_in           1042
  guard_in         1042
  call_end         1035
  ...
```

**这个脚本的价值：每天早上 30 秒看完，知道昨天正常不正常。**

**比任何监控大盘都实用** —— 因为你不会天天打开大盘，但你会看一条消息。

## 4.4 把它挂到定时任务

**第 16 节学过定时任务。这里用最简的方式：**

```bash
# cron（Linux）
# 每天 9:00 跑，结果发到你的邮箱
0 9 * * * cd /var/www/app && node scripts/daily-digest.js >> /tmp/digest.log 2>&1
```

**Windows 用任务计划程序，或者 Node 里 setInterval（但进程重启就没了）。**

---

# 第 5 步：三个必须做的防护（15 分钟）

## 5.1 日志写失败不能拖死业务

```javascript
stream.on("error", (e) => {
  process.stderr.write(`[logger] 写入失败: ${e.message}\n`);
});
```

**为什么必须有？**

```text
磁盘满 → stream.write 抛错 → 没有 error handler → 
未捕获的 'error' 事件 → 进程崩溃
```

**日志写失败导致服务崩溃，是最讽刺的一种事故。**

## 5.2 日志量限流

```javascript
// 同一个事件每秒最多记 N 条，超出丢弃并计数
const seen = new Map();
const RATE_LIMIT = 100;   // 每个事件每秒 100 条

function shouldLog(event) {
  const key = `${event}:${Math.floor(Date.now() / 1000)}`;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);

  // 清理旧 key
  if (seen.size > 1000) {
    const now = Math.floor(Date.now() / 1000);
    for (const k of seen.keys()) {
      if (Number(k.split(":")[1]) < now - 2) seen.delete(k);
    }
  }

  if (n > RATE_LIMIT) {
    if (n === RATE_LIMIT + 1) {
      process.stderr.write(`[logger] ${event} 超过 ${RATE_LIMIT}/秒，后续丢弃\n`);
    }
    return false;
  }
  return true;
}
```

**防什么？**

```text
死循环里 log.error → 一秒写 10 万条 → 磁盘瞬间满 → 
而且真正的日志被淹没
```

**这个防护在调试时会烦你（"为什么我的日志没出来"），但在出事故时会救你。**

**折中：只在 error/fatal 级别启用限流，warn 和以下不限。**

## 5.3 一个健康检查：日志能不能写

```javascript
// app/index.js 启动时
function checkLogWritable() {
  const testFile = path.join(config.log.dir, ".write-test");
  try {
    fs.writeFileSync(testFile, "1");
    fs.unlinkSync(testFile);
    return true;
  } catch (e) {
    console.error(`❌ 日志目录不可写：${config.log.dir}（${e.code}）`);
    return false;
  }
}

if (!checkLogWritable()) {
  process.exit(1);     // 没有日志的服务等于瞎子，宁可不启动
}
```

**为什么"没有日志就不启动"？**

```text
一个在跑但查不到任何东西的服务，
比一个明确报错的服务更危险 ——
因为你会以为它在正常工作。
```

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **五个级别的判定标准**（用"需不需要我动手"这一条）
- **按天/按大小的实测文件名**
- **删正在写文件的坑，你怎么验证的**
- **每日摘要脚本的输出**

---

# 第 7 步：课后练习

## 练习一：给日志加"请求耗时分布"（20 分钟）

```text
按小时统计 P50/P90/P99
→ 你能看出"每天下午 3 点特别慢"
→ 那是备份任务在同一台机器上跑
```

**实现：日摘要脚本加一维按小时分组。**

## 练习二：算清日志的存储成本（15 分钟）

```text
我的 app.jsonl 一天 ___ MB
error.jsonl 一天 ___ KB
保留 7 天 = ___ MB
保留 30 天 = ___ MB

我的磁盘还剩 ___ GB
```

**如果保留 30 天会占满，你要么缩短保留期，要么降低级别。**

**写清你的选择。**

## 练习三：判断这个日志方案错在哪（15 分钟）

```text
某人的方案：
  所有日志写进 /var/log/app/all.log
  用 logrotate 配置 size 100M rotate 3
  所有级别都记（包括 debug）
  error 不单独分
```

**错在哪？至少四条。**

**参考答案：**

```text
① 只按大小切，不按天切 → 你无法"打开上周三的日志"
② rotate 3 + 100M = 最多 300M → 只保留最近几小时（生产环境）
③ debug 全记 → 量大 3 倍 + PII 风险
④ error 不单独分 → "今天出了什么错"要 grep 300M
⑤ /var/log/app 的权限通常是 root → 你的应用用户可能写不进去
⑥ 没有"日志写失败"的防护 → 磁盘满时进程崩
```

**第 ② 条最容易被忽略。** "100M × 3" 听起来是 300M，但生产环境一天可能就 100M，意味着**你只能查最近三天，而且可能是三天内的几个片段。**

---

# 第 8 步：最终验收

## A. 五个级别

- [ ] `LEVELS` 有 debug/info/warn/error/fatal
- [ ] `LOG_LEVEL` 能控制最低输出级别
- [ ] 我能用"需不需要我动手"一句话判断 warn 和 error
- [ ] "降级切备用"记成了 warn（不是 error）

## B. 双输出

- [ ] `app-*.jsonl` 包含全部
- [ ] `error-*.jsonl` 只含 warn 及以上
- [ ] 两个文件都能被 `jq` 解析

## C. 轮转

- [ ] 按天切（用 `FAKE_DAY` 验证过两个文件）
- [ ] 按大小切（`LOG_ROTATE_BYTES=200` 验证过多个文件）
- [ ] 文件名格式是 `app-YYYY-MM-DD[.N].jsonl`
- [ ] 跨天时会触发清理

## D. 清理

- [ ] 过期文件被删
- [ ] **正在写的文件不会被删**
- [ ] 单个文件删除失败不影响其他
- [ ] 清理只处理匹配 `app-*/error-*` 的文件

## E. 查询

- [ ] `scripts/log.sh` 四个子命令都能用
- [ ] `today` 输出事件漏斗
- [ ] `pii` 检查零命中
- [ ] `daily-digest.js` 能出摘要

## F. 防护

- [ ] stream 有 error handler（磁盘满不崩进程）
- [ ] 日志量限流（error 级以上）
- [ ] 启动时检查日志目录可写，不可写就退出

## G. 提交

```bash
git add -A
git commit -m "第138节：五级日志+按天按大小轮转+清理+每日摘要"
git push
```

---

## 本节课要能说出口的一句话

> **日志的价值不在"记了多少"，在"三个月后你还找得到"。**

---

# 附：常见问题速查

**Q：`debug` 级别在生产到底开不开？**

A：**平时不开，排查时临时开，排查完关掉。**

```bash
# 临时开（不重启）
curl -X POST localhost:3000/api/admin/log-level -d '{"level":"debug"}' -H "x-admin-token: $TOKEN"

# 15 分钟后自动恢复（防止忘了关）
```

**如果做不到热切换，就重启。** 但**必须有一个"关掉"的动作** —— 有人开了 debug 就再也没关，三个月后日志 30 GB。

**Q：按天切之后，`grep` 要指定多天怎么办？**

A：**用通配符。**

```bash
grep -h 'tr_xxx' logs/app-2026-11-1*.jsonl      # 11月10-19
grep -h 'tr_xxx' logs/app-*.jsonl                # 全部
```

**`-h` 是"不显示文件名"**，不然你会看到一堆 `logs/app-2026-11-15.jsonl:...` 前缀。

**Q：删正在写的文件真的会不释放空间吗？**

A：**在 Linux / macOS 上是。Windows 上会报"文件被占用"（不能删）。**

```bash
# Linux 验证
lsof -p <pid> | grep deleted
```

**看到 `(deleted)` 就说明：文件目录项没了，但空间没释放。**

**解法：`kill -HUP` 让进程重新打开文件（如果你的程序支持），或者重启进程。**

**Q：`logrotate` 的 `copytruncate` 有什么风险？**

A：**复制和截断之间有一个微秒级窗口，这期间的日志会丢。**

```text
时刻 T1：复制 app.jsonl → app.jsonl.1（此时内容到第 1000 行）
时刻 T2：有 3 条日志写进 app.jsonl（变成 1003 行）
时刻 T3：truncate app.jsonl（变 0 行）
→ 第 1001-1003 行丢了
```

**对你的量级完全可接受。** 但如果日志用于计费或审计，要用 `create`（让进程重新打开文件）。

**Q：`error.jsonl` 里会不会有重复？**

A：**会。** warn 和以上都写进了 `app.jsonl` 和 `error.jsonl`，所以同一个事件在两个文件里都有。

**这是设计如此** —— 它们的用途不同（一个是全量查询，一个是快速扫错）。

**如果你要用 `error.jsonl` 统计总量，不要和 `app.jsonl` 相加。**

**Q：日摘要脚本要不要发邮件？**

A：**要，但要克制。**

```text
每天发 → 你会在第三周开始不看
只在异常时发 → 你会怀疑"是不是坏了，怎么没消息"
```

**折中方案：**

```text
每天 9:00 发（正常情况一行字："昨天 1042 请求，0 错误，降级 3 次"）
异常时额外发一条（"⚠️ 昨晚 23:00 起降级率 40%"）
```

**一行字的日报，你会看。** 30 行的报表，你不会。
