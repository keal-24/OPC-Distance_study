# 第 146 节课：压力测试

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天要得到一个数字：**你的系统在多少并发下，P95 会超过 3 秒。**
> 不是"能跑多少 QPS"，是"从哪个并发数开始变慢"。

**建议用时**：120 分钟
**你需要先完成**：第 145 节的 `e2e.test.js`
**今天要装**：什么都不用装（自己写 50 行压测脚本）

---

# 第 0 步：三个必须先想清的问题（15 分钟）

## 0.1 压测不是为了"看能扛多少"

**你打开一个压测工具，跑 1000 QPS，看到"全部成功"，然后呢？**

```text
· 1000 QPS 是你的上限吗？还是只是你测了 1000？
· 如果真实流量是 50 QPS，这个数字有什么用？
· 你的模型调用 3 秒一次，怎么可能 1000 QPS？
```

**压测的目的是找到一个拐点：**

```text
并发 1   → P95 = 3.2 秒
并发 5   → P95 = 3.4 秒
并发 10  → P95 = 5.1 秒   ← 这里开始明显变慢
并发 20  → P95 = 12 秒
并发 50  → P95 = 40 秒，部分超时
```

**答案不是"能扛 50"，而是"超过 5 就开始劣化"。**

**这个数字告诉你：**

```text
· 现在的服务器能撑多少真实用户
· 什么时候该加机器（而不是等到挂了才加）
· 哪个环节是先撑不住的（模型？数据库？你的代码？）
```

## 0.2 你的系统有个硬上限

```text
模型单次调用 = 3 秒（第 18 节测过 P50）
你的服务 = 单进程 Node
Node 是单线程事件循环

那么：
  并发 10 个请求 → 10 个 fetch 同时在等 → 都 3 秒返回 → 看起来能扛 3.3 QPS
  并发 100 个     → 100 个 fetch 同时 → 上游开始限流 → 全部变慢或失败
```

**关键洞察：**

```text
你的 QPS 上限 ≈ 1 / 平均响应时间
  3 秒响应 → 单线程最多 0.33 QPS（如果同步处理）
  但 Node 是异步的 → 10 个并发时，实际 QPS ≈ 10/3 = 3.3

所以：并发数 / 响应时间 = QPS
      并发 10 / 3 秒 = 3.3 QPS
```

**这个公式是压测的核心。** 你想提高 QPS，只有两条路：

```text
① 降低响应时间（换更快的模型、加缓存）
② 提高并发（加进程、加机器）
```

## 0.3 今天要测的四条曲线

```text
① 并发 vs 响应时间      → 找拐点
② 并发 vs 成功率         → 找崩溃点
③ 并发 vs 队列深度       → 看是否在积压
④ 单请求各阶段耗时        → 找瓶颈
```

**第四条最重要** —— 它告诉你"3 秒里有多少是模型，多少是你的代码"。

---

# 第 1 步：先量单个请求的耗时分解（30 分钟）

## 1.1 为什么要先做这个

**如果直接压测，你只会得到"P95 = 5 秒"，但不知道这 5 秒里：**

```text
· 模型 4.8 秒（那压测没意义，你改不了上游）
· 你的代码 0.2 秒
```

**必须先分解，否则优化方向全靠猜。**

## 1.2 写一个单请求计时脚本

```javascript
// scripts/profile-once.js
// 发一个请求，记录各阶段耗时

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3999";

async function once(label, body) {
  const t0 = performance.now();

  const res = await fetch(`${BASE}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const t1 = performance.now();
  const json = await res.json();
  const t2 = performance.now();

  return {
    label,
    status: res.status,
    ttfb_ms: +(t1 - t0).toFixed(0),        // time to first byte（含服务端全部处理）
    parse_ms: +(t2 - t1).toFixed(0),       // 读 body
    total_ms: +(t2 - t0).toFixed(0),
    trace_id: json.trace_id,
  };
}

const cases = [
  { label: "正常", body: { message: "我买的杯子碎了" } },
  { label: "正常", body: { message: "快递还没到，三天了" } },
  { label: "正常", body: { message: "发票抬头错了" } },
  { label: "空", body: { message: "" } },
  { label: "超长", body: { message: "a".repeat(5000) } },
];

for (const c of cases) {
  const r = await once(c.label, c.body);
  console.log(`${r.label.padEnd(6)} ${String(r.status).padEnd(4)} ttfb ${String(r.ttfb_ms).padStart(5)}ms  total ${String(r.total_ms).padStart(5)}ms  ${r.trace_id ?? ""}`);
}
```

## 1.3 跑它，然后看日志的分阶段耗时

```bash
# 起测试服务
NODE_ENV=test PORT=3999 node app/index.js &

# 跑单请求计时
node scripts/profile-once.js
```

**输出：**

```text
正常   200  ttfb  3120ms  total  3124ms  tr_20261117_a1b2c3d4
正常   200  ttfb  3085ms  total  3088ms  tr_xxx
空     400  ttfb     3ms  total     4ms  tr_xxx
超长   400  ttfb     2ms  total     3ms  tr_xxx
```

**关键对比：**

```text
正常请求    3120ms
被拦的请求     3ms  ← 入口审核省了 3000ms
```

**这就是第 130 节"入口拦掉省 100%"的量化证明。**

## 1.4 从日志拿分阶段耗时

```bash
# 拿某条正常请求的时间线
./scripts/log.sh trace tr_20261117_a1b2c3d4
```

**如果输出的是"日志里没这个 trace_id"**，说明你的 `logs/test` 目录和 `log.sh` 找的目录不一致。手动查：

```bash
cat logs/test/app-*.jsonl | grep tr_20261117_a1b2c3d4 | jq -r '[.ts[11:23], .event, (.dur_ms//"-")] | @tsv'
```

**你应该看到类似：**

```text
14:02:11.120  req_in        -
14:02:11.121  guard_in      1
14:02:11.131  call_start    -
14:02:14.205  call_end      3074      ← 模型 3 秒
14:02:14.212  guard_out     7
14:02:14.230  gate          18
14:02:14.231  req_out       3111
```

**结论：3111ms 里有 3074ms 是模型（98.8%）。**

**你的代码 + 数据库 + 审核 + 闸门 = 37ms。**

**这就是那个必须知道的数字** —— 你不可能通过优化代码把 3 秒变成 1 秒。

## 1.5 用一个"不调模型"的接口做对比

**你已经有 `/health`：**

```bash
node -e "
const t0 = performance.now();
fetch('http://127.0.0.1:3999/health').then(r => r.json()).then(() => {
  console.log('health:', (performance.now() - t0).toFixed(0), 'ms');
});
"
```

**期望 2–10ms。**

**这个数字是"你的框架 + 网络"的基础开销。**

```text
health    3ms      → 框架开销
正常请求  3120ms   → 框架 3ms + 模型 3074ms + 你的逻辑 43ms
```

**压测时，`/health` 能扛多少并发，就是"纯框架上限"。**

---

# 第 2 步：写压测脚本（35 分钟）

## 2.1 一个 50 行的并发压测器

```javascript
// scripts/load.js
// 用法：
//   node scripts/load.js --url /api/tickets --method POST --body '{"message":"东西坏了"}' --concurrency 5 --duration 20
//   node scripts/load.js --url /health --concurrency 20 --duration 10

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const BASE = arg("base", process.env.BASE_URL ?? "http://127.0.0.1:3999");
const PATH = arg("url", "/health");
const METHOD = arg("method", "GET").toUpperCase();
const BODY = arg("body", null);
const CONCURRENCY = Number(arg("concurrency", 5));
const DURATION = Number(arg("duration", 10));      // 秒
const RAMP = Number(arg("ramp", 0));               // 爬坡秒数（0 = 立刻全上）

const URL = BASE + PATH;

const stats = {
  sent: 0, ok: 0, fail: 0,
  latencies: [],
  statuses: {},
  errors: {},
};

let stopAt = Date.now() + DURATION * 1000;

async function one() {
  const t0 = performance.now();
  stats.sent++;
  try {
    const res = await fetch(URL, {
      method: METHOD,
      headers: BODY ? { "Content-Type": "application/json" } : {},
      body: BODY ?? undefined,
    });
    const text = await res.text();
    const ms = performance.now() - t0;

    stats.latencies.push(ms);
    stats.statuses[res.status] = (stats.statuses[res.status] ?? 0) + 1;
    if (res.status >= 200 && res.status < 400) stats.ok++;
    else stats.fail++;
  } catch (e) {
    const ms = performance.now() - t0;
    stats.latencies.push(ms);
    stats.fail++;
    const k = String(e.message).slice(0, 40);
    stats.errors[k] = (stats.errors[k] ?? 0) + 1;
  }
}

// 一个 worker：不停地发，直到时间到
async function worker(id) {
  // 爬坡：第 id 个 worker 延迟 id * (RAMP/n) 秒启动
  if (RAMP > 0) await new Promise((r) => setTimeout(r, (id / CONCURRENCY) * RAMP * 1000));
  while (Date.now() < stopAt) {
    await one();
  }
}

console.log(`压测 ${METHOD} ${URL}`);
console.log(`并发 ${CONCURRENCY}  时长 ${DURATION}s${RAMP ? `  爬坡 ${RAMP}s` : ""}\n`);

const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
const elapsed = (Date.now() - t0) / 1000;

// ===== 统计 =====
const lat = stats.latencies.sort((a, b) => a - b);
const p = (q) => lat.length ? lat[Math.min(Math.floor(lat.length * q), lat.length - 1)] : 0;

const qps = stats.sent / elapsed;
const successRate = stats.sent ? (stats.ok / stats.sent) * 100 : 0;

console.log("=== 结果 ===");
console.log(`请求数     ${stats.sent}`);
console.log(`成功/失败  ${stats.ok} / ${stats.fail}  (${successRate.toFixed(1)}%)`);
console.log(`QPS        ${qps.toFixed(2)}`);
console.log(`耗时       P50 ${p(0.5).toFixed(0)}ms  P90 ${p(0.9).toFixed(0)}ms  P95 ${p(0.95).toFixed(0)}ms  P99 ${p(0.99).toFixed(0)}ms  max ${lat[lat.length - 1]?.toFixed(0)}ms`);

if (Object.keys(stats.statuses).length) {
  console.log(`状态码     ${Object.entries(stats.statuses).map(([k, v]) => `${k}:${v}`).join(" ")}`);
}
if (Object.keys(stats.errors).length) {
  console.log(`网络错误   ${Object.entries(stats.errors).map(([k, v]) => `"${k}":${v}`).join(" ")}`);
}

// 一行 CSV，方便多次跑之后汇总
console.log(`\nCSV,${new Date().toISOString()},${PATH},${CONCURRENCY},${qps.toFixed(2)},${p(0.5).toFixed(0)},${p(0.95).toFixed(0)},${successRate.toFixed(1)}`);
```

## 2.2 逐段解释三个关键设计

**① 为什么用"固定并发 + 固定时长"，不用"固定请求数"**

```text
固定请求数（发 1000 个）→ 不知道持续多久 → 算不出 QPS
固定并发 + 时长       → 每个 worker 不停地发 → 能算出真实吞吐
```

**而且"固定并发"才是真实场景** —— 你有 10 个用户同时在用，不是"一共发 1000 次"。

**② 为什么要 `--ramp`（爬坡）**

```text
立刻全上 20 并发 → 服务瞬间被压满 → 测出的是"最坏情况"
爬坡 10 秒        → 逐渐加压 → 能看出"从哪个并发开始劣化"
```

**第二个才是你要的拐点。**

**③ 为什么输出一行 CSV**

```bash
for c in 1 2 5 10 20 50; do
  node scripts/load.js --url /health --concurrency $c --duration 5 | tail -1
done | tee load-health.csv
```

**然后你就有了一张表。**

## 2.3 先压 `/health`（纯框架）

```bash
for c in 1 5 10 20 50 100; do
  node scripts/load.js --url /health --concurrency $c --duration 5 | tail -1
done
```

**期望（示意）：**

```text
CSV,...,/health,1,320.4,3,4,100.0
CSV,...,/health,5,1450.2,3,5,100.0
CSV,...,/health,10,2100.5,4,7,100.0
CSV,...,/health,20,2600.1,7,12,100.0
CSV,...,/health,50,2800.3,17,28,100.0
CSV,...,/health,100,2900.0,34,55,100.0
```

**读法：**

```text
并发 1   → 320 QPS，P95 = 4ms      ← 单请求极快
并发 10  → 2100 QPS，P95 = 7ms     ← 早就有排队了
并发 50  → 2800 QPS，P95 = 28ms    ← 接近上限
并发 100 → 2900 QPS，P95 = 55ms    ← 到顶了（QPS 不涨，延迟涨）
```

**结论：你的 Node 服务纯框架能扛约 2900 QPS。**

**这个数字和你的真实需求（每天 1000 条 = 0.012 QPS）差 24 万倍。**

**所以：你的瓶颈不在框架，在模型。**

## 2.4 再压真实接口

```bash
for c in 1 2 5 10 20; do
  node scripts/load.js \
    --url /api/tickets --method POST --body '{"message":"东西坏了"}' \
    --concurrency $c --duration 10
done
```

**注意：这会让假上游被调用 `sent` 次。** 假上游是纯内存响应，不慢。

**如果你想模拟真实模型的 3 秒延迟，给假上游加一个 delay 模式：**

```javascript
// helper.js 的假上游加
case "slow_3s":
  setTimeout(() => send({ ... }), 3000);
  break;
```

**然后压测时指向那个模式。**

## 2.5 一个关键对比

| 压测目标 | 并发 10 的 QPS | P95 | 说明 |
|---|---|---|---|
| `/health` | 2100 | 7ms | 纯框架 |
| `/api/tickets`（假上游立即返回） | ? | ? | 你的逻辑 + DB |
| `/api/tickets`（假上游 3 秒） | ? | ? | 加模型延迟 |

**第三个的 QPS 应该在 3.3 左右**（10 并发 / 3 秒）。

**如果它只有 1，说明你的代码里有同步阻塞。**

**这就是压测真正的作用：找同步阻塞。**

---

# 第 3 步：找拐点（25 分钟）

## 3.1 标准做法：并发扫一遍

```bash
cat > scripts/sweep.sh << 'EOF'
#!/bin/bash
# 用法：./scripts/sweep.sh /health 5
URL=${1:-/health}
DUR=${2:-5}
METHOD=${3:-GET}
BODY=${4:-}

echo "并发,QPS,P50,P95,成功率"
for c in 1 2 3 5 8 10 15 20 30 50; do
  OUT=$(node scripts/load.js --url "$URL" --method "$METHOD" ${BODY:+--body "$BODY"} --concurrency $c --duration $DUR | tail -1)
  # CSV,ts,url,concurrency,qps,p50,p95,success
  echo "$OUT" | awk -F, '{print $4","$5","$6","$7","$8}'
done
EOF
chmod +x scripts/sweep.sh
```

```bash
./scripts/sweep.sh /health 5
```

## 3.2 拐点的判定标准

**三个信号，出现任意一个就是拐点：**

```text
① P95 超过 2 倍基线
   基线（并发 1）P95 = 4ms → 拐点是 P95 超过 8ms 时

② QPS 增长停滞
   并发 10 → 2100 QPS，并发 20 → 2300 QPS（只涨 10%）
   → 已经到上限

③ 成功率开始下降
   从 100% 掉到 99% → 崩溃边缘
```

**三个信号通常在不同并发数出现。取最早的那个。**

## 3.3 一个具体读法

```text
并发  QPS    P95    成功率
1     320    4      100
2     620    5      100
3     900    6      100
5    1450    5      100
8    1900    8      100      ← P95 翻倍了（信号①）
10   2100    7      100
15   2500    12     100
20   2600    12     100
30   2750    20     100      ← QPS 只涨 6%（信号②）
50   2800    28     100
```

**拐点在并发 8（P95 从 5 涨到 8）。**

**但对你来说这个拐点毫无意义** —— 因为你的真实流量是 0.012 QPS。

**真正有意义的拐点在"模型接口 + 3 秒延迟"那条曲线上。**

## 3.4 一个必须算的数

```text
你的真实需求：
  每天 ____ 条请求
  集中在 8 小时（假设）→ 每小时 ____ 条 → 每秒 ____ 条 = ____ QPS

你的模型响应时间：____ 秒

需要的并发数 = QPS × 响应时间 = ____
```

**举例：**

```text
每天 1000 条，集中在 8 小时
→ 1000 / (8 × 3600) = 0.035 QPS
→ 模型 3 秒
→ 需要并发 = 0.035 × 3 = 0.1
→ 也就是"根本不需要并发，一个一个来都够"
```

**这个数字很扎心，但很有用：**

```text
你现在根本不需要考虑性能
你该考虑的是"什么时候会有 100 倍流量"
```

## 3.5 那为什么还要学压测

**三个理由：**

```text
① 你的假设可能错。
   如果客户说"我们每天 50 万条"，你需要重新算。

② 你不知道自己的上限，就不敢接大单。
   客户问"你能处理多少"，你答"应该没问题" → 单子没了。

③ 劣化不是突然的。
   从 5 并发到 10 并发，P95 从 12ms 到 7ms（因为并发反而让 CPU 更满）
   你以为"再加点也行"，实际上已经在悬崖边上。
```

---

# 第 4 步：一个必须做的实验：找同步阻塞（25 分钟）

## 4.1 故意加一个同步操作

```javascript
// app/routes/tickets.js 临时加一个
ticketsRouter.post("/tickets-sync", wrap(async (req, res) => {
  // 故意做一个同步的重活
  const t0 = Date.now();
  let x = 0;
  for (let i = 0; i < 5e7; i++) x += i;      // 约 50-100ms 的同步计算
  const ms = Date.now() - t0;

  res.json({ ok: true, sync_ms: ms, sum: x });
}));
```

## 4.2 分别压两个接口

```bash
# 异步（正常接口）
./scripts/sweep.sh /health 5

# 同步 50ms
./scripts/sweep.sh /api/tickets-sync 5 POST '{"message":"x"}'
```

**你会看到：**

```text
/health          并发 10 → QPS 2100
/tickets-sync    并发 10 → QPS 12       ← 因为每个请求阻塞 50ms，10 并发 × 50ms = 500ms/轮
```

**算一下：**

```text
QPS = 并发 / 单请求耗时 = 10 / 0.05 = 200（理论上限）
实际 12 → 说明你的同步计算不是 50ms，可能是 800ms
```

**这就是"同步阻塞"的代价：它把整个事件循环卡住，所有请求排队。**

## 4.3 找出你代码里可能的同步阻塞

```bash
# 搜索可能的重活
grep -rn "for (let i = 0; i <" app/ --include="*.js"
grep -rn "readFileSync\|writeFileSync\|execSync" app/ --include="*.js"
grep -rn "JSON.parse(JSON.stringify" app/ --include="*.js"
grep -rn "\.sort(\|\.reduce(" app/ --include="*.js"
```

**四类危险操作：**

```text
① 大循环（> 1 万次迭代）
② 同步 IO（readFileSync）
③ 深拷贝（JSON.parse(JSON.stringify) 大对象）
④ 大数组排序 / 归约
```

**你的项目里大概率有 ① 和 ②。**

**逐条评估：**

```text
app/lib/logger.js 里的 `for (const k of Object.keys(rec))` → 每条日志几百次循环
  → 日志量大时会有影响，但每条只 10 个字段 → 可忽略

app/config/index.js 的 readFileSync → 只在启动时读 → 没问题

scripts/ 里的 execSync → 不在请求路径上 → 没问题
```

**关键判断：这个操作在不在"每个请求都要走"的路径上？**

## 4.4 一个反直觉的结论

**压测最大的收获往往不是"我扛多少 QPS"，是"我发现了一个 50ms 的同步操作"。**

```text
如果你不压测：
  单请求 3.1 秒 → 你以为 "3 秒都是模型"
  实际上：模型 3 秒 + 你的同步计算 0.1 秒
  优化你的代码 → 3.1 秒变 3.0 秒 → "没什么用"

如果你压测：
  并发 10 时 QPS 从 3.3 掉到 1.2 → 明显不对
  → 查出来是那个同步计算
  → 改成异步 → QPS 回到 3.3
```

**压测让"看不见的阻塞"变成"看得见的 QPS 差距"。**

---

# 第 5 步：写一份压测报告（20 分钟）

```markdown
# 压测报告

## 环境
- 机器：__________（CPU / 内存）
- Node：__________
- 上游：假上游（纯内存响应 / 加 3 秒延迟）
- 数据库：SQLite（内存 / 文件）

## 单请求耗时分解

| 阶段 | 耗时 |
|---|---|
| 框架 + 网络 | 3ms |
| 入口审核 | 1ms |
| 模型调用 | 3074ms |
| 输出审核 | 7ms |
| 置信度闸门 | 18ms |
| 数据库写入 | 8ms |
| **合计** | **3111ms** |

**结论：模型占 98.8%。优化代码的天花板是 1.2%。**

## 并发曲线

| 并发 | QPS | P50 | P95 | 成功率 |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 5 | | | | |
| 10 | | | | |
| 20 | | | | |

## 拐点

- P95 翻倍发生在并发 ____
- QPS 停滞发生在并发 ____
- **综合拐点：并发 ____**

## 真实需求对比

- 当前流量：____ QPS
- 模型响应时间：____ 秒
- 需要的并发：____（= QPS × 响应时间）
- **结论：当前余量 ____ 倍**

## 已知瓶颈（按影响排序）

1. 模型调用（98.8%）
2. ______
3. ______

## 如果要提升 10 倍流量，做什么

1. ______（预计提升 ____ 倍）
2. ______
3. ______

## 不做什么（因为没意义）

- 优化框架（只占 0.1%）
- 加索引（表只有 ____ 行）
```

## 5.1 "不做什么"这一节为什么重要

**因为你会被"性能优化"这件事吸引，去做一堆没用的事。**

```text
典型浪费：
  · 给 100 行的表加索引（查询 1ms 变 1ms）
  · 优化 JSON 序列化（省 0.3ms）
  · 换更快的框架（省 3ms，但模型要 3000ms）
```

**写下"不做什么"，你就有了拒绝这些诱惑的依据。**

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **单请求五阶段耗时分解**
- **三张表（/health、正常接口、同步阻塞接口）**
- **你的拐点在哪**
- **真实需求 vs 余量**

---

# 第 7 步：课后练习

## 练习一：测"数据库变慢"的影响（25 分钟）

**往表里插 10 万行，再压测。**

```bash
node -e "
import('./app/lib/db.js').then(({ db, migrate }) => {
  migrate();
  const stmt = db.prepare('INSERT INTO tickets (trace_id, input, created_at) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (let i = 0; i < 100000; i++) stmt.run('tr_bulk_' + i, 'x'.repeat(100), Date.now());
  });
  tx();
  console.log('插完:', db.prepare('select count(*) c from tickets').get());
});
"
```

**然后压测 `/api/tickets`（列表接口）：**

```bash
./scripts/sweep.sh /api/tickets?limit=20 5
```

**对比插之前和插之后。**

**如果 P95 从 5ms 涨到 200ms** → 你会亲身体会到"第 22 周为什么要讲索引"。

## 练习二：算清"加一台机器能提升多少"（15 分钟）

```text
当前：并发 10，QPS 3.3，CPU 40%
加一台机器 + 负载均衡：QPS 变 6.6？
```

**答案是"不一定"。**

```text
因为瓶颈在模型（上游限流）
→ 加机器反而可能让上游更早限流
```

**写出你的判断和理由。**

## 练习三：判断这份压测报告错在哪（15 分钟）

```markdown
# 压测报告

用 autocannon 跑了 30 秒，1000 并发。
结果：
- QPS 8500
- 平均延迟 118ms
- 0 错误

结论：系统性能良好，可以支撑生产。
```

**错在哪？至少五条。**

**参考答案：**

```text
① 1000 并发从哪来的？没有需求依据
② 平均延迟误导 —— 应该看 P95/P99（1000 并发下平均 118ms，P99 可能 2 秒）
③ "0 错误"不代表成功 —— 202 也是"非错误"，但用户没拿到结果
④ 没测上游有没有被限流（如果假上游或缓存，测的不是真实链路）
⑤ 没有分阶段耗时 → 不知道 118ms 里模型占多少
⑥ 没和真实需求对比 → "能扛 1000 并发"但实际只需要 0.03 QPS
⑦ 结论"可以支撑生产"没有依据 —— 支撑多少生产？什么规模的客户？
```

**第 ② 条最典型。** "平均延迟 118ms" 掩盖了"1% 的用户等了 2 秒"这一事实。

---

# 第 8 步：最终验收

## A. 单请求耗时分解

- [ ] 有 `profile-once.js`
- [ ] 测了正常请求（约 3 秒）
- [ ] 测了被拦请求（约 3ms）
- [ ] 从日志拿到五阶段耗时
- [ ] **算出了"模型占多少 %"**

## B. 压测脚本

- [ ] `load.js` 支持 url / method / body / concurrency / duration / ramp
- [ ] 输出 QPS / P50 / P90 / P95 / P99 / max
- [ ] 输出状态码分布
- [ ] 输出一行 CSV
- [ ] `sweep.sh` 能扫并发

## C. 三张表

- [ ] `/health`（纯框架）
- [ ] `/api/tickets`（假上游立即返回）
- [ ] `/api/tickets`（假上游 3 秒）**← 最关键**
- [ ] 有 `/tickets-sync` 的同步阻塞对比

## D. 拐点

- [ ] P95 翻倍发生在并发 __
- [ ] QPS 停滞发生在并发 __
- [ ] 综合拐点是 __

## E. 真实需求

- [ ] 当前流量 __ QPS
- [ ] 模型响应 __ 秒
- [ ] 需要的并发 = __
- [ ] **余量 __ 倍**

## F. 报告

- [ ] `LOAD-REPORT.md` 写完
- [ ] 有单体耗时分解表
- [ ] 有并发曲线
- [ ] 有"已知瓶颈"排序
- [ ] 有"如果要 10 倍流量做什么"
- [ ] **有"不做什么"清单**

## G. 提交

```bash
git add -A
git commit -m "第146节：压测，拐点并发X，模型占98.8%"
git push
```

---

## 本节课要能说出口的一句话

> **压测的目的不是"看能扛多少"，是"找出那个 50ms 的同步阻塞"。**

---

# 附：常见问题速查

**Q：QPS 和并发的公式是什么？**

A：**`QPS = 并发数 / 平均响应时间（秒）`**

```text
并发 10，响应 3 秒 → QPS = 10/3 = 3.3
并发 10，响应 0.05 秒 → QPS = 200
```

**这个公式能让你一眼看出"为什么加了并发 QPS 不涨"** —— 因为响应时间也在涨。

**Q：平均延迟为什么不能用？**

A：**因为它掩盖了尾部。**

```text
100 个请求：99 个 10ms，1 个 3000ms
平均 = (99×10 + 3000)/100 = 40ms

你看"平均 40ms"觉得很好
但那 1% 的用户等了 3 秒
```

**看 P95（95% 的人在这之内）和 P99。**

**Q：`/health` 能扛 2800 QPS，真实接口只有 3 QPS，冲突吗？**

A：**不冲突，这正是关键结论。**

```text
框架上限 2800 QPS
真实接口 3 QPS
→ 差距 900 倍，全部来自模型调用
→ 优化代码没有意义
```

**这个对比就是压测最大的价值。**

**Q：我的同步阻塞在哪找？**

A：**四个 grep：**

```bash
grep -rn "for (let i = 0; i <" app/ --include="*.js"
grep -rn "Sync(" app/ --include="*.js"
grep -rn "JSON.parse(JSON.stringify" app/ --include="*.js"
grep -rn "\.sort(\|\.reduce(" app/ --include="*.js"
```

**然后逐个问："它在每个请求的路径上吗？"**

**Q：`--ramp` 参数怎么用？**

```bash
# 10 秒内从 0 逐渐加到 20 并发
node scripts/load.js --url /health --concurrency 20 --duration 30 --ramp 10
```

**第一个 worker 立刻启动，最后一个在 10 秒时启动。**

**爬坡能让你看出"从哪个并发开始劣化"，比"一口气全上"信息量大得多。**

**Q：压测会不会把数据库写满？**

A：**会。**

```text
并发 10 × 10 秒 × 3 QPS = 300 条
```

**测试环境用 `:memory:` 就没问题（进程退出即清空）。**

**但如果你压的是 dev 环境（文件库），压完要清：**

```bash
node -e "import('./app/lib/db.js').then(({db}) => db.exec('DELETE FROM tickets'))"
```

**Q：为什么"0 错误"不代表成功？**

A：**因为你的接口在"转人工"时返回 202，它不是错误。**

```text
202 = "收到了，正在处理"  → HTTP 层面成功，业务层面未完成
```

**压测脚本把它算成"成功"，但用户没拿到结果。**

**所以看压测结果要同时看：**

```text
状态码分布（200 多少、202 多少）
业务成功率（200 的比例）
```
