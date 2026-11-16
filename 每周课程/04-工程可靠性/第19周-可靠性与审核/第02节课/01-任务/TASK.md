# 第 128 节课：备用模型与熔断

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天要做的：**主模型挂掉的那 30 秒里，用户不应该知道。**
> 而且你要能从日志里看出"刚才切过备用"，而不是以为一切正常。

**建议用时**：120 分钟
**你需要先完成**：第 127 节的 `reliable/call.js`
**今天要装**：什么都不用装（备用模型只要另一个 model 名）

---

# 第 0 步：先算清"挂一次"的代价（15 分钟）

## 0.1 三种"挂"完全不是一回事

```text
类型 A：硬挂（502 / 连接被拒）
  上游直接不可用。你的 fetch 立刻抛错。
  用户感受：3 秒内看到"系统错误"

类型 B：软挂（200 但内容是废的）
  上游返回了 200，但 text 是空的、或被截断、或是一大段 HTML 错误页。
  用户感受：看到空白 / 看到一堆乱码

类型 C：慢挂（.30 秒才回，或者永远不回）
  上游活着但很慢。你的请求挂在那里。
  用户感受：一直转圈，最后超时

三种挂，处理方式完全不同：
  A → 立刻切备用（不用重试，因为上游明确说了不行）
  B → 重试一次（可能是偶发），仍失败才切
  C → 首字超时就切（第 129 节）
```

**大部分人只处理了 A。** 因为 A 会抛错，有报错日志。**B 和 C 是静默的** —— 你的代码"成功"了，只是结果是垃圾。

## 0.2 一个具体的账

```text
假设上游可用性 99.5%（很不错的水平）
每天 1000 条 → 每天 5 条遇到故障
每月 150 条

如果每条故障的处理是：
  客服收到投诉 → 查日志 → 重发 → 回复客户
  20 分钟/条 × 150 = 50 小时/月
```

**50 小时/月换来的，只是"5 条/天的故障变成 0 条"。**

而今天要做的事，代码量大概 80 行。

## 0.3 今天要产出的东西

```text
reliable/fallback.js    主备切换 + 熔断
reliable/health.js      健康检查（区分三种挂）
reliable/chaos.js       故障注入（kill 主模型、返回 500、返回空）
```

**`chaos.js` 是今天的关键。** 没有它，你写的切换逻辑永远不知道能不能用。

---

# 第 1 步：先把"失败"分类（25 分钟）

## 1.1 五种失败，五种处理

```javascript
// reliable/health.js
// 把"调用失败"分成五种，每种给不同处置

export const FAIL = {
  RETRY: "retry",           // 临时抖动，重试一次就好
  FALLBACK: "fallback",     // 上游不行了，切备用
  FATAL: "fatal",           // 配置错了，切备用也没用
  SLOW: "slow",             // 慢，走首字超时逻辑
  EMPTY: "empty",           // 返回了但是空的/废的
};

export function classify(err, res, text) {
  // ① 网络层
  if (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return FAIL.SLOW;
    const msg = String(err.message ?? "");
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)) return FAIL.FALLBACK;
    return FAIL.RETRY;
  }

  // ② HTTP 层
  if (res) {
    const s = res.status;

    if (s === 401 || s === 403) return FAIL.FATAL;     // key 错了，换谁都没用
    if (s === 400 || s === 404) return FAIL.FATAL;     // 请求格式错 / 模型名错
    if (s === 429) return FAIL.FALLBACK;               // 限流，切备用能救
    if (s >= 500) return FAIL.FALLBACK;                // 上游挂了
    if (s === 408) return FAIL.RETRY;
  }

  // ③ 内容层 —— 这是最容易被忽略的一层
  if (typeof text === "string") {
    const t = text.trim();
    if (!t) return FAIL.EMPTY;
    if (/^<!DOCTYPE|^<html/i.test(t)) return FAIL.EMPTY;       // 拿到错误页
    if (t.length < 20) return FAIL.EMPTY;                       // 短得不像话
    if (!t.includes("{") && !t.includes("}")) return FAIL.EMPTY; // 没 JSON 结构
  }

  return null;   // 没问题
}
```

## 1.2 逐条解释为什么这么分

**① 401/403/400/404 → FATAL，不切备用**

**这是最容易做错的地方。**

```text
401 → 你的 key 错了 → 切到备用也一样错（如果共用 key）
400 → 你发的请求格式有问题 → 换模型可能好，但更可能是两边都不接受
404 → 模型名写错 → 换备用模型名可能对，但更可能是你的配置写错了
```

**正确做法：FATAL 就是"报警给人看"，不自动切换。**

因为自动切换会掩盖配置错误。**你会在三个月后发现自己一直在用备用模型，因为主模型的 key 早过期了。**

**但有一个例外：如果主备用的是不同的 key（推荐），401 切备用是合理的。**

```javascript
// 判断依据：主备 key 是否相同
if (s === 401 && cfg.backupKey !== cfg.primaryKey) return FAIL.FALLBACK;
if (s === 401) return FAIL.FATAL;
```

**② 429 → FALLBACK**

限流切备用是最有效的场景之一。**因为限流是"这家不行"，另一家可能行。**

**③ 内容层三种 → EMPTY**

```text
空字符串         → 上游返回了空（常见于内容过滤误伤）
<!DOCTYPE html>  → 中间有个代理返回了错误页（Nginx 502 页面）
没有 { }         → 模型没按格式输出，或者被截断
```

**这三种，HTTP 状态码都是 200。** 你不做内容检查，会当成成功。

**④ `t.length < 20` 这条要小心**

短输出可能是合法的（比如 `{"a":1}`）。**所以它应该放在 `!t.includes("{")` 后面判断**，或者干脆只用在"你的输出一定有 5 个字段"这种场景。

**你的场景输出 100+ 字符是正常的，所以 20 是安全的。**

## 1.3 一个必须写的测试

```javascript
// reliable/test-classify.js
import { classify, FAIL } from "./health.js";

const cases = [
  { name: "连接被拒",     err: new Error("fetch failed: ECONNREFUSED"), expect: FAIL.FALLBACK },
  { name: "超时",         err: Object.assign(new Error("timeout"), { name: "TimeoutError" }), expect: FAIL.SLOW },
  { name: "401",         res: { status: 401 }, expect: FAIL.FATAL },
  { name: "429",         res: { status: 429 }, expect: FAIL.FALLBACK },
  { name: "503",         res: { status: 503 }, expect: FAIL.FALLBACK },
  { name: "空输出",       res: { status: 200 }, text: "   ", expect: FAIL.EMPTY },
  { name: "HTML 错误页",  res: { status: 200 }, text: "<!DOCTYPE html><html>502</html>", expect: FAIL.EMPTY },
  { name: "正常",         res: { status: 200 }, text: '{"summary":"x","category":"other","urgency":"low","suggested_action":"y","need_human":false}', expect: null },
];

let pass = 0;
for (const c of cases) {
  const got = classify(c.err, c.res, c.text);
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${c.name.padEnd(14)} 期望 ${String(c.expect).padEnd(9)} 实际 ${got}`);
}
console.log(`\n${pass}/${cases.length} 通过`);
```

**跑它，全绿才算这一步做完。** 8 行断言，能省你后面几小时的调试。

---

# 第 2 步：写切换逻辑（30 分钟）

## 2.1 最小可用版本

```javascript
// reliable/fallback.js
import { classify, FAIL } from "./health.js";

export function makeResilientCaller({ primary, backup, log = () => {} }) {
  // 熔断状态（按模型分开记）
  const state = {
    primary: { consecutiveFails: 0, openUntil: 0 },
    backup:  { consecutiveFails: 0, openUntil: 0 },
  };

  const BREAK_AFTER = 3;        // 连续失败 3 次 → 熔断
  const BREAK_MS = 30_000;      // 熔断 30 秒

  function isOpen(which) {
    return Date.now() < state[which].openUntil;
  }

  function recordFail(which) {
    state[which].consecutiveFails++;
    if (state[which].consecutiveFails >= BREAK_AFTER) {
      state[which].openUntil = Date.now() + BREAK_MS;
      log("circuit_open", { which, until: state[which].openUntil });
    }
  }

  function recordOk(which) {
    state[which].consecutiveFails = 0;
    state[which].openUntil = 0;
  }

  async function tryOne(which, cfg, input, opt) {
    if (isOpen(which)) {
      const e = new Error(`${which} circuit open`);
      e.__skip = true;
      throw e;
    }

    let res, text;
    try {
      res = await fetch(`${cfg.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          temperature: opt.temperature ?? 0,
          max_tokens: opt.max_tokens ?? 400,
          messages: [
            { role: "system", content: cfg.prompt },
            { role: "user", content: input },
          ],
        }),
        signal: AbortSignal.timeout(opt.timeout ?? 60_000),
      });

      text = res.ok ? (await res.json())?.choices?.[0]?.message?.content : await res.text();
    } catch (err) {
      const kind = classify(err, null, null);
      recordFail(which);
      log("call_fail", { which, kind, err: String(err.message).slice(0, 80) });
      const e = new Error(`${which} ${kind}`);
      e.kind = kind;
      throw e;
    }

    const kind = classify(null, res, text);
    if (kind) {
      recordFail(which);
      log("call_bad", { which, kind, status: res.status });
      const e = new Error(`${which} ${kind}`);
      e.kind = kind;
      throw e;
    }

    recordOk(which);
    return { text, which, status: res.status };
  }

  return {
    async call(input, opt = {}) {
      const t0 = Date.now();

      // ① 先主
      try {
        const r = await tryOne("primary", primary, input, opt);
        return { ...r, degraded: false, ms: Date.now() - t0 };
      } catch (e) {
        // FATAL 不切备用（除了 key 不同的情况，那已在 classify 里处理）
        if (e.kind === FAIL.FATAL) {
          log("fatal", { err: e.message });
          throw e;
        }
      }

      // ② 再备
      try {
        const r = await tryOne("backup", backup, input, opt);
        log("degraded", { ms: Date.now() - t0 });
        return { ...r, degraded: true, ms: Date.now() - t0 };
      } catch (e) {
        log("both_fail", { err: e.message });
        throw e;
      }
    },

    stats: () => ({
      primaryFails: state.primary.consecutiveFails,
      primaryOpen: isOpen("primary"),
      backupFails: state.backup.consecutiveFails,
      backupOpen: isOpen("backup"),
    }),
  };
}
```

## 2.2 四个设计要点

**① 熔断按模型分开记**

```text
主模型挂了 → 主熔断 30 秒 → 这 30 秒内所有请求直接走备用
                    → 省掉"每次都先去撞一次墙"的 3 秒
```

**不分开记会怎样？** 备用模型偶发一次失败，你也把备用熔断了，然后两边都开着，全部报错。

**② `BREAK_AFTER = 3`，不是 1**

1 次就熔断太敏感（偶发抖动）。3 次连续失败是个合理信号。

**但如果你一天只有 10 个请求，"3 次"可能横跨一整天** —— 那就该用"时间窗口"而不是"连续次数"。

```javascript
// 更稳的做法：30 秒内失败 3 次
state[which].failsInWindow.push(Date.now());
state[which].failsInWindow = state[which].failsInWindow.filter((t) => Date.now() - t < 30_000);
if (state[which].failsInWindow.length >= 3) { /* open */ }
```

**③ 熔断 30 秒后自动半开**

上面代码是"30 秒后自动关闭"（`isOpen` 返回 false）。这叫**半开**：允许一个请求去试，成功就全关，失败就再开 30 秒。

**严格意义上应该只放 1 个请求过去。** 但你的量很小，直接全放也没问题。**知道这个差别就够。**

**④ 降级必须被记录，而且要显眼**

```javascript
log("degraded", { ms });
```

**这一行不是给调试用的，是给"事后追责"用的。**

因为备用模型的表现可能比主模型差（第 18 节测过）。**你不记录，就永远不知道"那段时间为什么准确率掉了 8 个点"。**

第 132 节的日志会把 `degraded` 做成一个可查询的维度。

## 2.3 一个必须加的字段：`degraded`

```text
返回值里带 degraded: true/false
```

**它要一路传下去，直到落在数据库里。**

```text
第 131 节：degraded 的条目 → 进抽检队列（因为它是用备用模型跑的）
第 132 节：degraded 的条目 → 日志里标记，方便统计"降级期间的表现"
第 133 节：故障演练 → 验证 degraded 有没有被正确记录
```

**不加这个字段，你今天做的事等于没做。** 因为"用户无感知"和"系统无记录"是两个极端，只有中间那个是对的。

---

# 第 3 步：写故障注入（25 分钟）★ 关键

## 3.1 三种注入方式

```javascript
// reliable/chaos.js
// 三种故障注入：代理层 / 环境变量 / 直接改配置

// 方式一：起一个假上游（最好，最真实）
import http from "node:http";

export function startFakeUpstream(mode = "ok", port = 4001) {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      switch (mode) {
        case "ok":
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            choices: [{ message: { content: JSON.stringify({
              summary: "客户反馈商品破损",
              category: "quality", urgency: "medium",
              suggested_action: "核实订单并安排换货", need_human: true,
            }) } }],
            usage: { prompt_tokens: 800, completion_tokens: 120 },
            model: "fake-ok",
          }));
          break;

        case "500":
          res.writeHead(500); res.end("upstream error");
          break;

        case "429":
          res.writeHead(429); res.end("rate limited");
          break;

        case "empty":
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ choices: [{ message: { content: "  " } }] }));
          break;

        case "html":
          // 最阴的一种：200 + HTML 错误页
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<!DOCTYPE html><html><body>502 Bad Gateway</body></html>");
          break;

        case "slow":
          // 首字前卡住 20 秒
          setTimeout(() => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ choices: [{ message: { content: '{"summary":"x"}' } }] }));
          }, 20_000);
          break;

        case "hang":
          // 永不响应
          break;
      }
    });
  });

  return new Promise((r) => srv.listen(port, () => r({ srv, port, mode })));
}
```

## 3.2 用假上游做验证

```javascript
// reliable/test-fallback.js
import { makeResilientCaller } from "./fallback.js";
import { startFakeUpstream } from "./chaos.js";

const logs = [];
const log = (evt, data) => { logs.push({ evt, ...data }); console.log("  [log]", evt, JSON.stringify(data)); };

const P = { baseURL: "http://localhost:4001/v1", model: "primary", apiKey: "x", prompt: "test" };
const B = { baseURL: "http://localhost:4002/v1", model: "backup",  apiKey: "x", prompt: "test" };

const caller = makeResilientCaller({ primary: P, backup: B, log });

// 六个场景
const scenarios = [
  { name: "主正常",        primaryMode: "ok",    backupMode: "ok",    expectDegraded: false },
  { name: "主 500",        primaryMode: "500",   backupMode: "ok",    expectDegraded: true  },
  { name: "主 429",        primaryMode: "429",   backupMode: "ok",    expectDegraded: true  },
  { name: "主返回空",      primaryMode: "empty", backupMode: "ok",    expectDegraded: true  },
  { name: "主返回 HTML",   primaryMode: "html",  backupMode: "ok",    expectDegraded: true  },
  { name: "主备都挂",      primaryMode: "500",   backupMode: "500",   expectThrow: true     },
];

for (const s of scenarios) {
  const a = await startFakeUpstream(s.primaryMode, 4001);
  const b = await startFakeUpstream(s.backupMode, 4002);

  try {
    const r = await caller.call("我买的杯子碎了", { timeout: 5000 });
    const ok = s.expectThrow ? false : r.degraded === s.expectDegraded;
    console.log(`${ok ? "✅" : "❌"} ${s.name.padEnd(14)} degraded=${r.degraded} which=${r.which}`);
  } catch (e) {
    const ok = s.expectThrow === true;
    console.log(`${ok ? "✅" : "❌"} ${s.name.padEnd(14)} 抛出 ${e.message}`);
  } finally {
    a.srv.close(); b.srv.close();
  }
}
```

## 3.3 你现在应该看到什么

```text
✅ 主正常         degraded=false which=primary
✅ 主 500         degraded=true  which=backup
✅ 主 429         degraded=true  which=backup
✅ 主返回空       degraded=true  which=backup
✅ 主返回 HTML    degraded=true  which=backup
✅ 主备都挂       抛出 both_fail
```

**六个全绿，你今天这件事就做成了。**

**特别看第 4、5 条：** 状态码 200，但内容是垃圾。**这两条是最多人漏掉的** —— 因为他们的代码里 `if (res.ok)` 就认为成功了。

## 3.4 还要测熔断

```javascript
// 连打 4 次，看第 4 次是不是直接跳过主模型
const a = await startFakeUpstream("500", 4001);
const b = await startFakeUpstream("ok", 4002);

for (let i = 1; i <= 5; i++) {
  const t0 = Date.now();
  const r = await caller.call("test", { timeout: 3000 });
  console.log(`第 ${i} 次：${Date.now() - t0}ms degraded=${r.degraded}`);
}

// 期望：
// 第 1-3 次：都要先撞一下主模型（几百 ms）
// 第 4-5 次：直接走备用（明显更快）
```

**如果第 4 次还是慢，说明熔断没生效。** 检查 `isOpen` 和 `openUntil` 的写入。

---

# 第 4 步：真杀一次进程（20 分钟）

## 4.1 假上游不能替代真杀

因为真实场景有 DNS 缓存、连接池、TCP 状态。**假上游关掉是"连接被拒"，真的是"连不上"。**

**两种做法：**

```text
做法一：把 primary 的 baseURL 指向一个不存在的端口
  baseURL: "http://localhost:4999/v1"
  → 测试 ECONNREFUSED 路径

做法二：把 primary 的域名指向黑洞
  在 hosts 里加 127.0.0.1 api.primary.com
  → 但会影响全局，测完要删
```

**做法一够用了。** 而且它顺便验证了你对 DNS/连接错误的分类。

## 4.2 一个必须看的指标：切换耗时

```javascript
const t0 = Date.now();
const r = await caller.call("test", { timeout: 5000 });
console.log(`总耗时 ${Date.now() - t0}ms  degraded=${r.degraded}`);
```

**期望值：**

```text
连接被拒：  200-3000ms（取决于 TCP 重试）
500：       200-800ms
超时：      等于你的 timeout（这是最慢的）
```

**如果连接被拒花了 30 秒，说明你只设了 `AbortSignal.timeout`，没有更短的连接超时。**

**第 129 节会解决这个。今天先记住这个数字。**

## 4.3 一个反思

**用户"无感知"的真实含义是什么？**

```text
不是"没感觉" —— 是"没有变差"。

正常：3.2 秒
降级：4.1 秒（多撞了一次墙）

差 0.9 秒，用户感觉不到。
但如果降级是 30 秒，用户就感觉到了。

所以"无感知"的门槛是：切换的额外开销 < 1 秒。
超过 1 秒，用户会觉得"今天好像有点慢"。
```

**这个数字决定你在第 129 节要设多短的超时。**

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **五种失败分类，各自的处置**
- **六种注入场景的验证结果**
- **切换耗时实测**（三种故障各多少 ms）
- **熔断生效了吗**（第 4、5 次是否明显更快）

---

# 第 6 步：课后练习

## 练习一：加一个"降级预算"（20 分钟）

**问题：如果备用模型连续用了 2 小时，说明主模型挂了很久。你该知道。**

```text
实现：记录"连续降级开始时间"，超过 30 分钟就：
  ① 打一条 error 级日志
  ② 在页面上显示一个内部提示（只有你看得到）
  ③ 停止自动切回（避免在两个都不健康的状态间反复横跳）
```

**这个功能的价值：它把"静默降级"变成"账单上的提醒"。**

**不写它，你会在月底看到一个奇怪的准确率下降，然后花两天查原因。**

## 练习二：算清这三种故障各占多少（15 分钟）

去翻你项目的历史记录（第 16 周的 `jobs` 表里应该有 `last_error`）：

```text
硬挂（连接错/5xx）：__ 次
软挂（空/非 JSON）：__ 次
慢挂（超时）：      __ 次
```

**如果"软挂"占比超过 20%，说明你的 `classify` 里内容检查是必须的，不能省。**

**大部分人的比例是：硬挂 60%、软挂 25%、慢挂 15%。** 所以只处理硬挂的人漏掉了 40%。

## 练习三：判断这个方案错在哪（15 分钟）

```text
某人的方案：
  主模型失败 → 重试 3 次 → 切备用
  备用失败 → 再重试 3 次 → 报错
  总共最多 6 次调用
```

**错在哪？至少三条。**

**参考答案：**

```text
① 主模型 500 时重试 3 次是纯浪费 —— 5xx 通常不是抖动，重试 3 次花 3 倍时间
   正确：5xx 直接切，只对 429 和网络抖动重试
② 最坏情况耗时 = 6 × 60s = 6 分钟，用户早走了
   正确：必须有一个总预算（比如 30 秒），超预算就放弃
③ 没用熔断 —— 主模型挂了之后，每个请求还要白撞 3 次
   正确：熔断后 30 秒内直接走备用
④ 没区分 FATAL —— key 错了会重试 6 次，日志里 6 条一样的错
```

**第 ② 条最要紧。** 重试的代价不是钱，是**用户的等待时间**。**给重试加预算，是这一节最实用的技巧。**

---

# 第 7 步：最终验收

## A. 失败分类器

- [ ] `health.js` 有五种分类（RETRY / FALLBACK / FATAL / SLOW / EMPTY）
- [ ] `test-classify.js` 8 条断言全绿
- [ ] 内容层检查覆盖三种：空 / HTML 错误页 / 无 JSON 结构

## B. 切换逻辑

- [ ] 主失败自动切备用
- [ ] `degraded` 字段被正确设置，并且往外传
- [ ] FATAL（401/400/404）**不**自动切（或者按"key 是否相同"判断）
- [ ] 熔断：连续 3 次失败 → 30 秒内直接走备用

## C. 六种注入全过

- [ ] 主正常 → `degraded=false`
- [ ] 主 500 → `degraded=true`
- [ ] 主 429 → `degraded=true`
- [ ] 主返回空 → `degraded=true`
- [ ] 主返回 HTML → `degraded=true`
- [ ] 主备都挂 → 抛错

## D. 实测数据

- [ ] 连接被拒切换耗时：__ ms
- [ ] 500 切换耗时：__ ms
- [ ] 超时切换耗时：__ ms
- [ ] 熔断后第 4、5 次明显更快（快了 __ ms）

## E. 真杀过一次

- [ ] 用不存在的端口测过 `ECONNREFUSED`
- [ ] 确认了切换总耗时 < 1 秒（或者知道为什么超了）

## F. 提交

```bash
git add 每周课程/04-工程可靠性/第19周-可靠性与审核/第02节课 03-练习代码/reliable
git commit -m "第128节：主备切换+熔断，六种注入全过，切换耗时XXXms"
git push
```

---

## 本节课要能说出口的一句话

> **"用户无感知"不等于"系统无记录"。降级必须打日志，否则你会在月底看到一个查不出原因的准确率下跌。**

---

# 附：常见问题速查

**Q：我只有一个 key，能用同一个模型当备用吗？**

A：**没有意义**（同一个上游，挂了就是一起挂）。

**但可以用同一个供应商的另一个模型**（比如便宜档 vs 标准档）。这也是降级 —— 你的准确率会掉，但服务不断。

**这时 `degraded` 的意义更大**，因为质量确实变了。第 131 节会把它送进抽检队列。

**Q：401 到底该不该切？**

A：看你的主备 key 是否独立。

```text
主备共用一个 key   → 401 不切（切了也一样错）
主备各自一个 key   → 401 切（可能是这个 key 被限/被停）
```

**推荐主备各自一个 key**，因为限额也是故障源。

**Q：熔断 30 秒会不会太长？**

A：**对"服务整体挂"来说，30 秒是合理的**（恢复通常要几分钟）。

**但对"限流"来说太长** —— 限流往往几秒就恢复。所以更细的做法是：

```text
429  → 熔断 5 秒
5xx  → 熔断 30 秒
超时 → 熔断 15 秒
```

**按失败类型给不同的熔断时长。** 这个细节能把恢复速度提升一倍。

**Q：为什么 400 也算 FATAL？上游可能只是这次请求有问题。**

A：因为 **400 通常意味着你的请求构造有 bug**（字段名错、超长、格式不对）。

**换模型不解决请求构造的 bug。** 而且 400 往往是"所有请求都 400"，不是"这一个 400"。

**发现 400 的第一件事是去看错误响应体**，不是切备用。

**Q：`degraded` 要传到哪一层？**

A：**一路传到底**：

```text
① 返回值里（代码层）
② 数据库记录里（第 16 周的 jobs 表加一列）
③ 日志里（第 132 节的 trace）
④ 复盘报表里（"本月降级 37 次，平均持续 4 分钟"）
```

**只传到代码层的人，等于没传。** 因为代码层的信息活不过这次请求。

**Q：我怎么知道备用模型"能用"？**

A：**跑第 18 周的测试集。** 你已经有了判分器，一条命令的事。

```text
主模型：通过率 70%，致命 4 条
备用：  通过率 54%，致命 9 条   ← 这个数必须知道
```

**不知道这个数字，你就是在赌"备用模型勉强能看"。**

**而且这个数字要写进第 126 节的 `DECISION.md`** —— 它决定了"降级时要不要同时提高人工复核比例"。
