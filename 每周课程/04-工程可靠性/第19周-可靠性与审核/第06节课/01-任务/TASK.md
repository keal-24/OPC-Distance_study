# 第 132 节课：结构化日志与异常追溯

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天要做的事：**出事的时候，一条 trace_id 能看到全链路六个步骤，而且日志里搜不到任何手机号。**
> 这两句话是矛盾的 —— 今天的全部难度都在这个矛盾上。

**建议用时**：120 分钟
**你需要先完成**：第 127–131 节（闸门、切换、超时、审核、队列）
**今天要装**：什么都不用装

---

# 第 0 步：先看看你现在的日志（15 分钟）

## 0.1 打开你的服务日志，找这三件事

```text
① 一条出错的请求，从进入到失败，中间经过了哪几步？
② 那次调用花了多少 token？
③ 是主模型还是备用模型返回的？
```

**大概率你答不出来。**

因为你的日志长这样：

```text
[INFO] 收到请求
[INFO] 调用模型
[ERROR] 请求失败
[INFO] 收到请求
[INFO] 调用模型
[INFO] 调用模型
```

**两个致命问题：**

```text
① 无法关联 —— 哪条"调用模型"属于哪个"收到请求"？日志里没有 ID。
② 信息太少 —— 没有 token、没有耗时、没有 which（主/备）、没有 trace 阶段。
```

## 0.2 你现在的调试方式

```text
客户投诉 → 问客户"你什么时候发的" → 猜一个时间 → 
grep 那个时间段 → 看到 30 条日志 → 逐条看 → 
在其中一条里看到 "请求失败" → 不知道是哪次 → 
只能重放一次试试
```

**这个过程 20–40 分钟。** 而正确设计的日志，应该是：

```text
客户给你 trace_id（在错误提示里）
→ 一条命令查出完整时间线
→ 30 秒定位
```

## 0.3 为什么"记原文"是错的

**你第一反应肯定是："那我记下客户的原文，就能复现了。"**

```javascript
log.info("收到请求", { input: req.body.message });
```

**然后你的日志表变成了这样：**

```text
input: "我叫张伟，电话 13812345678，住北京市朝阳区建国路88号3单元502，
        身份证 110101199001011234，我买的电饭煲内胆裂了"
```

**现在回答三个问题：**

```text
① 谁有权限看这张表？（运维、实习生、你的外包、云服务商）
② 这个客户如果要求"删除我的数据"，你怎么删？（日志里的能删吗）
③ 你的服务器被入侵，攻击者拿到了什么？
```

**这就是为什么日志不能记原文。**

## 0.4 今天的矛盾

```text
要能查  ←→  不能记原文
```

**解法只有三条路，三条都要用：**

```text
① 记指纹（hash）—— 同样的输入 hash 相同，能判断"是不是同一条"
② 记摘要（脱敏后的前 N 字）—— 能看出"大概在说什么"
③ 原文另存 —— 加密、单独表、30 天删除、访问有记录
```

---

# 第 1 步：设计日志字段（30 分钟）

## 1.1 一条日志应该长什么样

```javascript
// 一条日志记录（带注释，方便看每个字段干什么）
const rec = {
  "ts": "2026-11-16T09:31:22.412Z",
  "level": "info",
  "event": "model_call_end",        // 事件名（可枚举，不是自由文本）
  "trace_id": "tr_8f3a2b1c",        // 贯穿全链路
  "span": "call.primary",           // 在哪个阶段
  "dur_ms": 2341,                   // 这一步花了多久
  "ok": true,
  "fields": {                       // 这一步特有的字段
    "model": "cheap-2026-10",
    "tok_in": 860,
    "tok_out": 118,
    "degraded": false,
    "first_byte_ms": 890
  }
};
```

**六个必须有：`ts` / `level` / `event` / `trace_id` / `span` / `dur_ms`**

## 1.2 为什么 `event` 必须可枚举

```text
❌ event: "调用模型失败了，原因是超时"      ← 自由文本，无法统计
✅ event: "call_fail" + fields.reason:"first_byte_timeout"
```

**因为你要能跑这种查询：**

```sql
SELECT event, COUNT(*) FROM logs
WHERE ts > ? GROUP BY event ORDER BY 2 DESC;
```

**自由文本的日志，这个查询做不了。**

## 1.3 事件清单（九个够了）

```javascript
export const EVENTS = {
  REQ_IN:        "req_in",          // 请求进入
  GUARD_IN:      "guard_in",        // 入口审核结果
  CACHE_HIT:     "cache_hit",       // 缓存命中
  CALL_START:    "call_start",      // 开始调模型
  CALL_END:      "call_end",        // 模型返回
  CALL_FAIL:     "call_fail",       // 调用失败（含 kind）
  GUARD_OUT:     "guard_out",       // 输出审核结果
  GATE:          "gate",            // 置信度闸门结果
  REQ_OUT:       "req_out",         // 返回给用户
};
```

**九个事件，覆盖整条链路。** 不需要更多 —— 事件太多会导致你记了一堆没人看的字段。

## 1.4 `span` 的命名规则

```text
req                    整个请求
guard.in               入口审核
call.primary           调用主模型
call.backup            调用备用模型
guard.out              输出审核
gate                   置信度闸门
queue                  入队
```

**用点号分层，这样你可以查 `span LIKE 'call.%'` 得到所有模型调用。**

## 1.5 一个必须做的决定：原文存哪

```text
方案 A：不存原文
  优点：最安全
  缺点：出事时无法复现，只能靠 hash 对不上就完了

方案 B：原文进日志
  优点：方便
  缺点：日志表成 PII 库 ← 绝大多数人这么干，然后出事

方案 C：原文单独存，加密 + 限期 + 审计
  优点：能复现，且可控
  缺点：多一张表，多一套加密
```

**推荐 C。实现成本大概是 40 行代码，但它决定了你出事时是"能查"还是"能查但不能说"。**

```sql
CREATE TABLE payload_vault (
  trace_id   TEXT PRIMARY KEY,
  input_enc  BLOB NOT NULL,          -- AES-256-GCM 加密
  iv         BLOB NOT NULL,
  tag        BLOB NOT NULL,
  input_len  INTEGER NOT NULL,       -- 长度（明文可查）
  input_hash TEXT NOT NULL,          -- sha256 前 16 位
  input_head TEXT NOT NULL,          -- 脱敏前 20 字
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL        -- 默认 30 天
);
```

**注意 `input_head` 和 `input_len` 是明文** —— 它们足够让你"判断这条大概是什么"，又不足以泄露。

## 1.6 脱敏函数

```javascript
// reliable/redact.js

export function redact(text) {
  let s = String(text ?? "");

  // ① 手机号：保留前 3 后 2
  s = s.replace(/1[3-9]\d{9}/g, (m) => `${m.slice(0, 3)}*****${m.slice(-2)}`);

  // ② 身份证：只保留前 6 后 2
  s = s.replace(/[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
    (m) => `${m.slice(0, 6)}**********${m.slice(-2)}`);

  // ③ 银行卡
  s = s.replace(/\b\d{16,19}\b/g, (m) => `${m.slice(0, 4)}********${m.slice(-4)}`);

  // ④ 邮箱：保留 @ 前 2 位 + 域名
  s = s.replace(/([\w.+-]{1,2})[\w.+-]*(@[\w-]+\.[\w.]+)/g, "$1***$2");

  // ⑤ 地址：把"省/市/区/路/号/单元/室"之间的具体内容削掉
  s = s.replace(/[\u4e00-\u9fa5]{2,8}(省|市)/g, (m) => m[0] + "**$1");
  s = s.replace(/\d+(号|单元|室|楼)/g, "***$1");

  // ⑥ 订单号：保留前后各 3 位
  s = s.replace(/\b([A-Z]{2,3})\d{6,}\b/g, (m, p) => `${p}****${m.slice(-3)}`);

  return s;
}

export function head(text, n = 20) {
  const r = redact(text).replace(/\s+/g, " ").trim();
  return r.length <= n ? r : r.slice(0, n) + "…";
}

export function hash(text) {
  // 用 node:crypto，不用第三方
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(String(text ?? "")).digest("hex").slice(0, 16);
}
```

## 1.7 一个必须验证的事

```javascript
// 拿第 121 节测试集里的真实输入跑一遍
const samples = [
  "我叫张伟，电话 13812345678，住朝阳区建国路88号3单元502，电饭煲内胆裂了",
  "订单 SF1234567890 显示签收但我没收到，两千多的显示器",
  "邮箱 zhangsan@example.com，发票抬头写错了",
];

for (const s of samples) {
  console.log("原文：", s);
  console.log("脱敏：", redact(s));
  console.log("摘要：", head(s));
  console.log("指纹：", hash(s));
  console.log("---");
}
```

**输出应该长这样：**

```text
原文：我叫张伟，电话 13812345678，住朝阳区建国路88号3单元502，电饭煲内胆裂了
脱敏：我叫张伟，电话 138*****78，住朝**区建国路***号***单元***，电饭煲内胆裂了
摘要：我叫张伟，电话 138*****78，住朝…（20 字）
指纹：a3f8c2e91b4d7f05
```

**注意"张伟"没被脱敏** —— 因为姓名脱敏很难做到不误伤（"东西坏了"里的"东西"不是姓名）。

**这是一个必须承认的局限：**

```text
姓名漏过 → 但它通常不构成合规风险（姓名本身不是敏感信息）
电话/身份证/银行卡 → 必须拦住（这些是《个人信息保护法》明确列举的）
```

**写进 NOTES：实名信息我没有强制脱敏，因为误伤率太高。这是个已知取舍。**

---

# 第 2 步：写 logger（30 分钟）

## 2.1 一个 60 行的 logger

```javascript
// reliable/log.js
import fs from "node:fs";
import { createHash } from "node:crypto";
import { redact, head } from "./redact.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[process.env.LOG_LEVEL ?? "info"] ?? 20;

let fileStream = null;
if (process.env.LOG_FILE) {
  fileStream = fs.createWriteStream(process.env.LOG_FILE, { flags: "a" });
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

    // 关键：所有字符串字段过一遍脱敏
    for (const k of Object.keys(rec)) {
      if (typeof rec[k] === "string" && k !== "event" && k !== "level" && k !== "ts" && k !== "service") {
        rec[k] = redact(rec[k]);
      }
    }

    const line = JSON.stringify(rec);
    if (fileStream) fileStream.write(line + "\n");
    else process.stdout.write(line + "\n");
  }

  return {
    debug: (e, f) => emit("debug", e, f),
    info:  (e, f) => emit("info", e, f),
    warn:  (e, f) => emit("warn", e, f),
    error: (e, f) => emit("error", e, f),

    // 带 trace 的子 logger
    child(extra) {
      return makeLogger({ service, bindings: { ...bindings, ...extra } });
    },
  };
}
```

## 2.2 三个设计决定

**① 全局脱敏，而不是"调用时记得脱敏"**

```javascript
for (const k of Object.keys(rec)) {
  if (typeof rec[k] === "string" && ...) rec[k] = redact(rec[k]);
}
```

**为什么这样做？**

因为**你一定会忘**。

```text
你在第 127 节记了 input
你在第 129 节记了 error.message
你在第 131 节记了 row.input
→ 三处都要记得脱敏，忘一处就漏
```

**放在 logger 里兜底，忘不了。** 代价是性能（每条日志多一次正则），但日志量不大的话可以接受。

**② `child()` 累积 bindings**

```javascript
const log = makeLogger().child({ trace_id, span: "call.primary" });
log.info("call_start");    // 自动带上 trace_id 和 span
```

**不用每次手动传 trace_id。** 手动传的结果是"有一半地方忘了传"。

**③ 输出 JSONL，不是格式化文本**

```text
❌ [2026-11-16 09:31:22] INFO 收到请求 trace=abc
✅ {"ts":"...","level":"info","event":"req_in","trace_id":"abc"}
```

**因为你要用 `jq` 查：**

```bash
# 查某个 trace 的完整时间线
grep '"trace_id":"tr_8f3a2b1c"' logs/app.jsonl | jq -r '[.ts, .event, .span, .dur_ms, .ok] | @tsv'
```

**格式化文本用 `grep` 也能查，但没法做聚合统计。**

## 2.3 trace_id 的生成

```javascript
// reliable/trace.js
import { randomBytes } from "node:crypto";

export function newTraceId() {
  // 8 字节 = 64 位，碰撞概率极低，且短（用户能念出来）
  return "tr_" + randomBytes(4).toString("hex");
}
```

**为什么不用 UUID？**

```text
UUID:   550e8400-e29b-41d4-a716-446655440000   （36 字符，用户无法口述）
tr_8f3a2b1c                                     （11 字符，用户可以说）
```

**因为你要把它显示给用户。** 用户在电话里说"我的单号是 8f3a2b1c"，比念 UUID 可行得多。

**碰撞概率：**

```text
32 位 = 42 亿种组合
你每天 1000 条，一年 36.5 万条
碰撞概率 ≈ 1 - exp(-365000²/(2×4.29e9)) ≈ 1.5%
```

**每年 1.5% 的碰撞率不能接受？**

```text
实际上可以接受，因为：
① 碰撞的两条请求几乎不可能同时被查
② 你可以在 trace_id 里加日期前缀：tr_20261116_8f3a2b1c
```

**加日期前缀后碰撞率降到 0（只要同一天不超过 42 亿条）。**

## 2.4 一个必须做的：让 trace_id 出现在用户端

```javascript
// 返回给用户的响应里带 trace_id
return {
  ok: false,
  message: "这条处理失败了，请把下面的编号告诉我们：tr_20261116_8f3a2b1c",
  trace_id: traceId,
};
```

**这是本节最实用的一个动作。**

```text
没有 trace_id：客户说"我昨天发的一条没回复" → 你翻 24 小时日志
有 trace_id：  客户直接把编号发给你 → 你 5 秒定位
```

**而且客户会觉得你专业** —— 有编号的系统，看起来就是"有人管"的。

---

# 第 3 步：把 trace 串起来（30 分钟）

## 3.1 六个阶段各自记什么

```javascript
// reliable/pipeline-logged.js
import { makeLogger } from "./log.js";
import { newTraceId } from "./trace.js";

export async function handleLogged(input, deps) {
  const traceId = newTraceId();
  const base = makeLogger().child({ trace_id: traceId });
  const t0 = Date.now();

  // ① 请求进入（只记长度 + 指纹 + 摘要，不记原文）
  const inputHash = hash(input);
  const L = deps.vault;
  await L.put({ traceId, input });          // 原文进保险箱

  base.info("req_in", {
    input_len: String(input).length,
    input_hash: inputHash,
    input_head: head(input, 20),
  });

  // ② 入口审核
  const gi = deps.guardInput(input);
  base.info("guard_in", {
    ok: gi.ok,
    blocking: gi.blocking,
    reasons: (gi.reasons ?? []).join(","),
    span_dur: Date.now() - t0,
  });

  if (gi.blocking) {
    base.warn("req_out", { route: "rejected", dur_ms: Date.now() - t0 });
    return deps.entryRejection(gi.reasons);
  }

  // ③ 模型调用
  const tCall = Date.now();
  base.info("call_start", { span: "call.primary" });

  let r;
  try {
    r = await deps.caller.call(input, traceId);
  } catch (e) {
    base.error("call_fail", {
      span: "call.primary",
      kind: e.kind ?? "unknown",
      err: String(e.message).slice(0, 120),
      dur_ms: Date.now() - tCall,
    });
    throw e;
  }

  base.info("call_end", {
    span: r.degraded ? "call.backup" : "call.primary",
    dur_ms: Date.now() - tCall,
    first_byte_ms: r.firstByteMs,
    tok_in: r.usage?.in,
    tok_out: r.usage?.out,
    degraded: r.degraded,
    model: r.modelReturned,
  });

  // ④ 输出审核
  const go = deps.guardOutput(input, r.text);
  base.info("guard_out", {
    ok: go.ok,
    reasons: (go.reasons ?? []).join(","),
    fatal: go.fatal,
  });

  // ⑤ 置信度闸门
  const gate = await deps.gate(input, r.text, deps.caller.call);
  base.info("gate", {
    route: gate.route,
    confidence: gate.confidence,
    reason: gate.reason,
  });

  // ⑥ 入队（如需）
  if (gate.route === "human" || !go.ok) {
    await deps.enqueue({ traceId, input, output: r.text, reasons: [...(go.reasons ?? []), gate.reason] });
    base.warn("queue", { queue_reason: gate.reason ?? go.reasons?.join(",") });
  }

  // ⑦ 返回
  base.info("req_out", {
    route: gate.route,
    dur_ms: Date.now() - t0,
    total_ok: go.ok && gate.route !== "human",
  });

  return { ok: go.ok && gate.route !== "human", data: go.parsed ?? r.text, trace_id: traceId };
}
```

## 3.2 一次完整的时间线

```bash
grep '"trace_id":"tr_20261116_8f3a2b1c"' logs/app.jsonl \
  | jq -r '[.ts[11:23], .event, (.span//"-"), (.dur_ms//"-"), (.ok//.route//"-")] | @tsv'
```

**输出：**

```text
09:31:22.412  req_in        -              -      -
09:31:22.413  guard_in      -              1      true
09:31:22.441  call_start    call.primary   -      -
09:31:24.782  call_end      call.primary   2341   -
09:31:24.790  guard_out     -              8      true
09:31:25.180  gate          -              390    auto
09:31:25.181  req_out       -              2769   true
```

**七个事件，2.7 秒。** 一眼看到：**模型花了 2.3 秒（85%），审核和闸门加起来 0.4 秒。**

**这就是"能查"的意思。**

## 3.3 一个降级请求的时间线

```text
09:41:02.100  req_in        -              -      -
09:41:02.101  guard_in      -              1      true
09:41:02.110  call_start    call.primary   -      -
09:41:10.220  call_fail     call.primary   8110   first_byte_timeout
09:41:10.230  call_start    call.primary   -      -
09:41:13.880  call_end      call.backup    3650   -
09:41:13.890  guard_out     -              10     true
09:41:14.120  gate          -              230    auto
09:41:14.121  req_out       -              12021  true
```

**看出来了：**

```text
① 主模型首字超时（8.1 秒）
② 切备用成功（3.65 秒）
③ 总耗时 12 秒
```

**但这 12 秒里，用户在等。** 这个时间线告诉你"为什么要 12 秒" —— 因为超时设了 8 秒。

**如果客户投诉"你们太慢"，你可以拿这条日志说："主模型挂了，我们 8 秒后切的备用，总共 12 秒。"**

**没有这台日志，你只能说"可能是网络问题"。**

---

# 第 4 步：查询与聚合（20 分钟）

## 4.1 五条你会天天用的查询

```bash
# ① 某个 trace 的完整时间线
grep '"trace_id":"tr_xxx"' logs/app.jsonl | jq -c

# ② 今天各事件的次数（看漏斗）
jq -r 'select(.ts > "2026-11-16") | .event' logs/app.jsonl | sort | uniq -c | sort -rn

# ③ 所有失败请求
jq -c 'select(.event=="call_fail" or .level=="error")' logs/app.jsonl | tail -20

# ④ 降级了多少次、平均多久
jq -r 'select(.event=="req_out" and .route=="auto") | [.dur_ms, .degraded] | @tsv' logs/app.jsonl

# ⑤ 检查日志里有没有 PII（上线前必跑）
grep -oE '1[3-9][0-9]{9}|[1-9][0-9]{16}[0-9Xx]' logs/app.jsonl | head
```

**第 ⑤ 条是必跑的。**

```text
如果输出了任何东西 → 你的脱敏漏了某个字段 → 立刻修
```

**把它做成 CI 里的一个检查（第 21 周会做测试，那时可以自动化）：**

```bash
if grep -qE '1[3-9][0-9]{9}' logs/app.jsonl; then
  echo "❌ 日志里有手机号，脱敏失效"; exit 1
fi
```

## 4.2 一个聚合脚本

```javascript
// reliable/stats.js
import fs from "node:fs";
import readline from "node:readline";

const since = process.argv[2] ? new Date(process.argv[2]) : new Date(Date.now() - 86_400_000);

const rl = readline.createInterface({ input: fs.createReadStream("logs/app.jsonl") });

const ev = {};
const fails = {};
const durations = { call: [], gate: [], total: [] };
let degraded = 0, totalReq = 0, queued = 0;

for await (const line of rl) {
  let r;
  try { r = JSON.parse(line); } catch { continue; }
  if (new Date(r.ts) < since) continue;

  ev[r.event] = (ev[r.event] ?? 0) + 1;

  if (r.event === "call_fail") fails[r.kind ?? "unknown"] = (fails[r.kind ?? "unknown"] ?? 0) + 1;
  if (r.event === "call_end") { durations.call.push(r.dur_ms); if (r.degraded) degraded++; }
  if (r.event === "gate") durations.gate.push(r.dur_ms);
  if (r.event === "req_out") { durations.total.push(r.dur_ms); totalReq++; }
  if (r.event === "queue") queued++;
}

const pct = (a, q) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length * q)] : 0;

console.log("=== 事件漏斗 ===");
for (const [k, v] of Object.entries(ev).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(6)}`);
}

console.log("\n=== 失败原因 ===");
for (const [k, v] of Object.entries(fails).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(18)} ${String(v).padStart(5)}`);
}

console.log("\n=== 耗时 ===");
console.log(`  模型调用  P50 ${pct(durations.call, 0.5)}ms  P90 ${pct(durations.call, 0.9)}ms  P99 ${pct(durations.call, 0.99)}ms`);
console.log(`  闸门      P50 ${pct(durations.gate, 0.5)}ms  P90 ${pct(durations.gate, 0.9)}ms`);
console.log(`  端到端    P50 ${pct(durations.total, 0.5)}ms  P90 ${pct(durations.total, 0.9)}ms`);

console.log("\n=== 质量 ===");
console.log(`  降级率    ${((degraded / Math.max(totalReq, 1)) * 100).toFixed(1)}%  (${degraded}/${totalReq})`);
console.log(`  入队率    ${((queued / Math.max(totalReq, 1)) * 100).toFixed(1)}%  (${queued}/${totalReq})`);
```

## 4.3 你会看到的东西

```text
=== 事件漏斗 ===
  req_in            1042
  guard_in          1042
  call_start        1038
  call_end          1035
  guard_out         1035
  gate               890
  req_out           1042
  call_fail            3
  queue              145

=== 失败原因 ===
  first_byte_timeout   2
  connect_timeout      1

=== 耗时 ===
  模型调用  P50 2341ms  P90 5120ms  P99 8900ms    ← 注意 P99 接近 8000，说明首字超时设得刚好
  闸门      P50 210ms   P90 680ms
  端到端    P50 2769ms  P90 5900ms

=== 质量 ===
  降级率    0.3%  (3/1035)
  入队率    14.0%  (145/1042)
```

**三个立刻能用的结论：**

```text
① 模型调用 P99 = 8900ms 接近首字超时 8000ms → 说明首字超时可能太紧了（有正常请求在被判超时）
② 入队率 14% 比第 127 节预期的 32% 低 → 闸门可能太松了
③ 降级率 0.3% → 正常水平
```

**没有这些统计，你只会看到"系统在跑"。有了它，你能看到"系统在哪变差"。**

---

# 第 5 步：异常分类（15 分钟）

## 5.1 什么样的异常值得单独记

```text
❌ 记所有 throw —— 日志会被噪音淹没
✅ 只记"需要人做决定"的异常
```

```javascript
export const ALERTS = {
  // 立刻要人看（半夜也要叫醒）
  P0: ["both_models_fail", "vault_write_fail", "queue_write_fail"],
  // 每天看一次
  P1: ["degraded_spike", "queue_backlog", "sla_disaster"],
  // 每周看一次
  P2: ["gate_rate_drift", "parse_fail_spike", "repair_rate_spike"],
};
```

## 5.2 三个阈值告警

```javascript
// reliable/alert.js
export function checkAlerts(db, notify) {
  const now = Date.now();
  const h1 = 3_600_000;

  // ① 降级率突增（1 小时内 > 20%）
  const deg = db.prepare(`
    SELECT
      SUM(CASE WHEN degraded=1 THEN 1 ELSE 0 END) AS d,
      COUNT(*) AS n
    FROM request_log WHERE created_at > ?
  `).get(now - h1);

  if (deg.n > 10 && deg.d / deg.n > 0.2) {
    notify.error("degraded_spike", { rate: (deg.d / deg.n).toFixed(2), n: deg.n });
  }

  // ② 队列积压（pending > 100 或 最老的一条超期 2 倍）
  const q = db.prepare(`SELECT COUNT(*) AS n FROM review_queue WHERE status='pending'`).get();
  if (q.n > 100) notify.error("queue_backlog", { pending: q.n });

  // ③ 解析失败率（1 小时内 > 15%）
  const pf = db.prepare(`
    SELECT
      SUM(CASE WHEN parse_ok=0 THEN 1 ELSE 0 END) AS f,
      COUNT(*) AS n
    FROM request_log WHERE created_at > ?
  `).get(now - h1);

  if (pf.n > 10 && pf.f / pf.n > 0.15) {
    notify.error("parse_fail_spike", { rate: (pf.f / pf.n).toFixed(2) });
  }
}
```

## 5.3 为什么阈值要用"比率 + 最小样本数"

```javascript
if (deg.n > 10 && deg.d / deg.n > 0.2)
```

**为什么要有 `deg.n > 10`？**

```text
没有它：凌晨 3 点进来 1 个请求，失败了 → 降级率 100% → 半夜被叫醒
有它：  至少 10 个请求才判断比率
```

**这个细节能救你一晚上的睡眠。**

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **一条完整时间线的实际输出**（截图或贴文字）
- **日志里有没有 PII**（跑那个 grep）
- **聚合统计的三个结论**
- **姓名为什么没强制脱敏**

---

# 第 7 步：课后练习

## 练习一：做一个"trace 查询页"（25 分钟）

```text
输入框：粘贴 trace_id 或手机号（脱敏后的）
输出：时间线 + 每步的字段
```

**关键：支持按"脱敏后的手机号"查。**

```text
客户在电话里说"我的手机号是 138****78"
你输入 138****78
→ 查出所有匹配的 trace
```

**这比让客户念 trace_id 更现实**（他手机里可能没存那个编号）。

**实现：`payload_vault` 里存一个 `input_head`，直接 `LIKE '%138****78%'` 查。**

## 练习二：算清日志的存储成本（15 分钟）

```text
每条日志约 300 字节
每天 1042 条请求 × 7 个事件 = 7294 条日志
= 2.2 MB/天 = 66 MB/月 = 800 MB/年
```

**这个量不大，可以全留。**

**但如果你的请求量是 10 万/天：**

```text
220 MB/天 = 6.6 GB/月 = 80 GB/年
```

**这时必须分层：**

```text
① 热数据（7 天）：完整日志
② 温数据（90 天）：只留 req_in / call_fail / req_out 三个事件
③ 冷数据（1 年）：只留 trace_id + 时间 + 结果
```

**算一下你的量，写进 NOTES。**

## 练习三：判断这个日志设计错在哪（15 分钟）

```text
某人的日志：
  console.log(`[${new Date()}] 收到消息: ${msg}`)
  console.log(`[${new Date()}] 调用模型 ${model}`)
  console.log(`[${new Date()}] 返回: ${result}`)

  写到 logs/app.log，每天一个文件，保留 7 天。
```

**错在哪？至少五条。**

**参考答案：**

```text
① 没有 trace_id → 无法关联，只能靠时间猜
② 记了原文 msg → 日志里全是 PII
③ 记了完整 result → 输出里可能有客户信息
④ 没有结构化 → 无法聚合统计（只能 grep）
⑤ 没有事件名 → 无法区分"这是哪个阶段"
⑥ 没有耗时 → 不知道慢在哪
⑦ 保留 7 天 → 客户第 8 天投诉，你什么都查不到
```

**第 ⑦ 条很少人想到。** 7 天太短 —— 客户投诉的典型延迟是 3–14 天。

**建议：热数据 7 天可查，冷数据 90 天可归档，原文保险箱 30 天。**

---

# 第 8 步：最终验收

## A. 日志格式

- [ ] 六个基本字段齐（ts / level / event / trace_id / span / dur_ms）
- [ ] `event` 是可枚举的九个之一，不是自由文本
- [ ] 输出 JSONL，能被 `jq` 解析
- [ ] `child()` 能累积 bindings，不用手动传 trace_id

## B. 脱敏

- [ ] 手机号、身份证、银行卡、邮箱、地址、订单号都脱敏
- [ ] 脱敏放在 logger 里统一做（不是靠"调用时记得"）
- [ ] 跑了 `grep -E '1[3-9][0-9]{9}'` 确认零命中
- [ ] 姓名没强制脱敏，且写清了原因

## C. 原文保险箱

- [ ] `payload_vault` 表存在，加密存储
- [ ] 有 `input_hash`（指纹）和 `input_head`（脱敏摘要）
- [ ] 有 `expires_at`（默认 30 天）
- [ ] 日志里只记 hash + 长度 + 摘要，不记原文

## D. trace 串起来了

- [ ] 七个阶段都有日志（req_in / guard_in / call / guard_out / gate / queue / req_out）
- [ ] 一条 `grep + jq` 能打出完整时间线
- [ ] trace_id 返回给用户了，且是能念出来的短格式
- [ ] 能看出降级请求的完整路径

## E. 聚合

- [ ] `stats.js` 能跑，输出事件漏斗 / 失败原因 / 耗时分布 / 降级率 / 入队率
- [ ] 从统计里得出了至少两个"系统在哪变差"的结论
- [ ] 三个阈值告警都写了（降级率 / 队列积压 / 解析失败率）
- [ ] 告警有"比率 + 最小样本数"双条件

## F. 提交

```bash
git add 每周课程/04-工程可靠性/第19周-可靠性与审核/第06节课 03-练习代码/reliable
git commit -m "第132节：结构化日志+trace，脱敏零命中，一条命令查全链路"
git push
```

---

## 本节课要能说出口的一句话

> **日志的价值不在"记了很多"，在"出事时能用一条 ID 串起来，且串起来的每一步都不含隐私"。**

---

# 附：常见问题速查

**Q：为什么不直接记原文？我又不是大公司。**

A：**因为"不是大公司"不代表"不会被追责"。**

```text
① 客户的员工会看到工单系统 → 里面有 PII
② 你的外包/兼职有数据库权限
③ 你的云服务器被入侵
④ 客户要求"删除我的数据"，你删不掉日志里的
```

**第四条最现实。** 《个人信息保护法》明确给了删除权。你的日志里有他三个月的原话和手机号，你无法证明你删了。

**Q：脱敏会不会影响调试？**

A：**会，但影响很小，而且有补偿方案。**

```text
影响：看不到完整的手机号/地址
补偿：payload_vault 里有加密原文，需要时可以解（有审计记录）
```

**而且 90% 的调试不需要看原文** —— 你需要的是"哪一步失败、耗时多少、走的哪条路"。

**Q：`child()` 这种设计会不会让日志臃肿？**

A：**每个 logger 实例多几个字段，但只有几 KB 内存。**

**真正会让日志臃肿的是"每个事件都记二十个字段"。** 所以事件清单要短（九个够了）。

**Q：trace_id 8 位够吗？**

A：**加日期前缀后够。**

```text
tr_20261116_8f3a2b1c
```

**不加前缀，一年 36.5 万条时有 1.5% 碰撞概率**（某个新条目和某个旧条目撞号）。加了前缀，只要同一天不超过 42 亿条就是唯一。

**Q：客户投诉说"你们太慢了"，怎么用日志回答？**

A：**查那条 trace 的时间线，逐段说。**

```text
"您这条：入口检查 1ms，模型调用 2341ms，输出审核 8ms，闸门 390ms，总共 2.7 秒。
 其中 85% 是模型思考时间，这是正常的。"
```

**这比"我们的系统比较快"有说服力一万倍。而且如果真的是故障，你能直接说出"主模型挂了，我们 8 秒后切了备用"。**

**Q：日志写文件会不会太慢？**

A：**异步写，不会阻塞请求。**

```javascript
fileStream.write(line + "\n");   // stream 内部是异步的
```

**日请求 1000 条的话，每天 2 MB，完全不是瓶颈。** 真到 100 万条/天时再考虑缓冲批量写（那时你已经上云日志服务了）。

**Q：聚合脚本每天手动跑？**

A：**做成定时任务（第 16 节学的），每天早上 9 点跑一次，输出发到你微信/邮箱。**

```text
看到 "降级率 0.3%，入队率 14%，P99 8900ms" 你就知道昨天正常。
看到 "入队率 34%" 你就知道闸门出问题了。
```

**这个每日一句话，比任何监控大盘都实用。**
