# 第 131 节课：人工复核队列

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前面四节把"不该自动处理的"都挑出来了。**今天要解决：挑出来之后，谁处理、按什么顺序、多久处理完。**
> 90% 的人做到"有个队列"就收工了 —— 那个队列会变成一个 200 条的坟场。

**建议用时**：130 分钟
**你需要先完成**：第 127–130 节（闸门 + 超时落库 + 双向审核）
**今天要装**：什么都不用装

---

# 第 0 步：先看一个失败的队列长什么样（15 分钟）

## 0.1 大多数人的队列

```text
review_queue
├─ id
├─ input
├─ created_at
└─ status    pending | done
```

**上线第一周：**

```text
周一  12 条  → 你处理完了
周二  28 条  → 处理了 20 条
周三  41 条  → 处理了 15 条
周四  55 条  → 处理了 8 条
周五  73 条  → 你没打开
```

**第二周你已经不看它了。**

## 0.2 为什么失败

**不是因为你懒。是因为队列的设计有三个致命缺陷：**

```text
缺陷一：没有优先级
  最危险的那条（越权承诺，客户以为已经退款了）和
  最安全的那条（一个空白输入的误报）
  排在同一个位置。
  → 你按顺序处理，先处理了 20 条误报，最危险的那条还在第 30 位。

缺陷二：没有 SLA
  没有"多久必须处理完"的约束。
  → 队列只会越来越长，因为它没有"必须清空"的压力。

缺陷三：没有回流
  你处理完就完了。那条输入再也不会被用到。
  → 同类问题下周还会来，你还是手工处理。
```

## 0.3 今天要建的四件事

```text
① 优先级算法    —— 按"错的代价"排序，不按时间
② 分级处理      —— 60% 的条目只需要 10 秒确认，不是 1.5 分钟重写
③ SLA 与超时升级 —— 超过时限自动升级，不是默默烂掉
④ 结果回流      —— 处理完的条目变成测试集的一部分
```

**第 ④ 件最容易被跳过，但它是唯一能让队列变短的事。**

## 0.4 一个必须先算的数

```text
你的队列每天进多少条？（第 127–130 节的四层拦下来的总和）
  entry_blocked      12 条   ← 这些不需要处理，直接拒了
  output_to_human     3 条
  output_dropped      0 条
  low_confidence     34 条
  timeout             2 条
  ────────────────────────
  真正要人处理的     39 条/天
```

**39 条/天 × 1.5 分钟 = 1 小时/天。**

**如果没有分级，这是 1 小时。如果分级做对了，可能是 20 分钟。**

**这个差距就是今天要赚的。**

---

# 第 1 步：优先级算法（30 分钟）

## 1.1 排序的依据不是"什么时候进来的"，是"错了会怎样"

```text
一个具体的对比：

条目 A：一条空白输入，被误判成"需要复核"
  代价：忽略它，客户重新发一条

条目 B：一条"客户以为已退款"的越权承诺输出
  代价：3 天后客户发现没退款 → 投诉 → 可能退款 + 赔偿 + 差评
```

**B 必须排在 A 前面，哪怕 A 早来了 3 天。**

## 1.2 五种进入原因，五种代价

```javascript
// reliable/review.js

export const REASON_COST = {
  // 高代价：客户会因此做出错误决定
  overpromise:    { cost: 100, label: "越权承诺", sla: 2 },      // 2 小时
  pii_invented:   { cost: 90,  label: "编造敏感信息", sla: 2 },
  timeout:        { cost: 70,  label: "超时未处理", sla: 4 },

  // 中代价：客户拿到的东西不好用
  low_confidence: { cost: 40,  label: "低置信", sla: 8 },
  pii_copied:     { cost: 35,  label: "复制敏感信息", sla: 8 },
  profanity:      { cost: 25,  label: "复述脏话", sla: 12 },

  // 低代价：基本是误报或小事
  injection_warn: { cost: 15,  label: "疑似注入", sla: 24 },
  format_fixed:   { cost: 5,   label: "已自动修复", sla: 48 },
  sample:         { cost: 3,   label: "抽检", sla: 72 },
};
```

**`cost` 是什么？它不是钱，是一个相对权重。** 用它排序，不用它算账。

**`sla` 是小时数** —— 这类条目在几小时内必须处理完。

## 1.3 优先级要叠加，不是取最大

```javascript
export function priorityOf(item) {
  const reasons = item.reasons ?? [];
  let score = 0;

  for (const r of reasons) {
    score += REASON_COST[r]?.cost ?? 10;
  }

  // ① 时间衰减：等得越久越紧急
  const hours = (Date.now() - item.created_at) / 3_600_000;
  score += Math.min(hours * 0.5, 50);      // 最多加 50，防止无限增长

  // ② 金额放大：涉及钱的一律上调
  const money = extractMaxMoney(item.input);
  if (money >= 500) score += 40;
  else if (money >= 100) score += 15;

  // ③ 客户标志：同一个客户反复来，上调
  if (item.repeat_count >= 2) score += 30;
  if (item.repeat_count >= 4) score += 60;

  return Math.round(score);
}
```

## 1.4 为什么"时间衰减"要有上限

```javascript
score += Math.min(hours * 0.5, 50);
```

**没有上限会怎样？**

```text
一条"抽检"条目（cost 3）等了 10 天
→ 3 + 10×24×0.5 = 3 + 120 = 123
→ 超过了"越权承诺"的新条目（100）
→ 一条抽检的垃圾排到了最前面
```

**这会让整个排序失效** —— 因为队列里最老的永远是垃圾（好的早就处理了）。

**上限 50 的意思是：等待最多把优先级提高一档，不能翻盘。**

## 1.5 分级：三类处理动作

```text
不是所有条目都要"重写"。

A 类 确认型（10 秒）
  只读一眼，点"通过"或"驳回"
  例：抽检、已自动修复、疑似注入的低置信

B 类 修正型（1-3 分钟）
  需要改一两个字段，但结构是对的
  例：低置信、PII 复制、复述脏话

C 类 重做型（3-10 分钟）
  整条要重写，或者要联系客户
  例：越权承诺、编造敏感信息、超时
```

```javascript
export const ACTION = {
  sample:         "confirm",   // A
  format_fixed:   "confirm",   // A
  injection_warn: "confirm",   // A
  low_confidence: "fix",       // B
  pii_copied:     "fix",       // B
  profanity:      "fix",       // B
  overpromise:    "redo",      // C
  pii_invented:   "redo",      // C
  timeout:        "redo",      // C
};
```

## 1.6 一个具体的分布

**假设你的 39 条/天是这样分布的：**

```text
抽检              18 条 × 10 秒 = 3 分钟
已自动修复         4 条 × 10 秒 = 0.7 分钟
疑似注入          3 条 × 10 秒 = 0.5 分钟
低置信            9 条 × 1.5 分 = 13.5 分钟
PII 复制           2 条 × 1 分钟 = 2 分钟
复述脏话           1 条 × 1 分钟 = 1 分钟
越权承诺           1 条 × 5 分钟 = 5 分钟
超时               1 条 × 5 分钟 = 5 分钟
────────────────────────────────
合计                            30.7 分钟/天
```

**对比不分级的 39 × 1.5 = 58.5 分钟。**

**省了 47%。** 而且这是保守估计 —— 分级之后你会更愿意打开队列，实际处理率会从 60% 提到 95%。

---

# 第 2 步：写队列表与查询（25 分钟）

## 2.1 表结构

```sql
CREATE TABLE review_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id      TEXT NOT NULL UNIQUE,        -- 防重复入队
  input         TEXT NOT NULL,               -- 客户原话（唯一副本！）
  output        TEXT,                        -- 模型输出（可能是 NULL，比如超时）
  reasons       TEXT NOT NULL,               -- JSON 数组
  action        TEXT NOT NULL,               -- confirm / fix / redo
  score         REAL NOT NULL,               -- 优先级分
  sla_hours     INTEGER NOT NULL,            -- 时限
  due_at        INTEGER NOT NULL,            -- 到期时间戳
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending / done / escalated
  repeated      INTEGER NOT NULL DEFAULT 0,  -- 同一客户第几次
  created_at    INTEGER NOT NULL,
  started_at    INTEGER,
  done_at       INTEGER,
  resolver      TEXT,                        -- 谁处理的
  resolution    TEXT,                        -- fixed / rejected / rewritten
  final_output  TEXT                         -- 处理后的最终输出（回流用）
);

CREATE INDEX idx_pending ON review_queue(status, score DESC);
CREATE INDEX idx_due ON review_queue(status, due_at);
```

**`trace_id UNIQUE` 这一条是必须的。**

```text
没有 UNIQUE 会怎样：
  同一个请求因为重试被入队 3 次 → 你处理 3 遍 → 幻影工作量
```

**`output` 允许 NULL** —— 因为超时的时候模型什么都没返回。

**`input` 是唯一副本**，第 129 节强调过。

## 2.2 入队函数

```javascript
export function enqueue(db, { traceId, input, output, reasons, repeated = 0 }) {
  const rows = reasons.map((r) => REASON_COST[r]).filter(Boolean);
  const maxSla = rows.length ? Math.min(...rows.map((x) => x.sla)) : 24;

  const score = (() => {
    let s = reasons.reduce((acc, r) => acc + (REASON_COST[r]?.cost ?? 10), 0);
    const money = extractMaxMoney(input);
    if (money >= 500) s += 40;
    else if (money >= 100) s += 15;
    if (repeated >= 2) s += 30;
    if (repeated >= 4) s += 60;
    return Math.round(s);
  })();

  const action = (() => {
    const acts = reasons.map((r) => ACTION[r]).filter(Boolean);
    if (acts.includes("redo")) return "redo";
    if (acts.includes("fix")) return "fix";
    return "confirm";
  })();

  return db.prepare(`
    INSERT OR IGNORE INTO review_queue
      (trace_id, input, output, reasons, action, score, sla_hours, due_at, repeated, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    traceId, input, output,
    JSON.stringify(reasons), action, score, maxSla,
    Date.now() + maxSla * 3_600_000,
    repeated, Date.now()
  );
}
```

**注意 `Math.min(...sla)`** —— 多个原因取最严的那个时限。

```text
reasons = ["low_confidence", "overpromise"]
sla: 8 小时 和 2 小时
取 2 小时 ← 对，因为越权承诺更急
```

## 2.3 三条取任务的查询

**① 按优先级取（正常路径）**

```sql
SELECT * FROM review_queue
WHERE status = 'pending'
ORDER BY score DESC, created_at ASC
LIMIT 1;
```

**② 取已超时的（升级）**

```sql
SELECT * FROM review_queue
WHERE status = 'pending' AND due_at < ?
ORDER BY due_at ASC;
```

**③ 按动作类型取（批量处理）**

```sql
SELECT * FROM review_queue
WHERE status = 'pending' AND action = 'confirm'
ORDER BY created_at ASC
LIMIT 20;
```

**第 ③ 条是效率的关键。**

```text
confirm 类不需要"逐条深思"，可以批量过：
  一次看 20 条，点 20 次"通过"

fix 类要逐条看，但可以连续处理同类型（改字段的手感一样）
redo 类要单独安排时间（要联系客户，要专心）
```

## 2.4 一个必须有字段：`repeated`

```javascript
// 入队前先查这个客户最近来几次
const recent = db.prepare(`
  SELECT COUNT(*) AS n FROM review_queue
  WHERE input LIKE ? AND created_at > ?
`).get(`%${phoneOrId}%`, Date.now() - 7 * 86_400_000);
```

**为什么这个字段重要？**

```text
同一个客户第 1 次来 → 正常处理
同一个客户第 4 次来 → 说明前 3 次都没解决 → 必须人工打电话
```

**这个信号能抓住"系统性失败"** —— 而单条看待，每条都只是"一个普通工单"。

**实现简化版：** 如果 `input` 里有手机号/订单号，用那个做 key；没有就用 `input` 的 hash。

---

# 第 3 步：写一个能用的界面（30 分钟）

## 3.1 不要做"后台管理系统"

**你需要的是一个能 30 秒处理一条的页面，不是 CRUD。**

```javascript
// reliable/review-ui.js  —— 一个 HTML 页面，40 行
import http from "node:http";

const HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>复核</title>
<style>
  body { font: 14px/1.6 system-ui; max-width: 900px; margin: 0 auto; padding: 16px; }
  .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
  .meta { color: #666; font-size: 12px; }
  .score { font-weight: bold; color: #c00; }
  pre { background: #f6f6f6; padding: 8px; overflow: auto; max-height: 200px; }
  button { padding: 6px 14px; margin-right: 8px; cursor: pointer; }
  .pass { background: #2a2; color: #fff; border: 0; }
  .reject { background: #666; color: #fff; border: 0; }
  .redo { background: #c60; color: #fff; border: 0; }
  textarea { width: 100%; min-height: 80px; }
</style></head>
<body>
<h2>复核队列 <span id="cnt" class="meta"></span></h2>
<div id="app"></div>
<script>
let cur = null;

async function load() {
  const r = await fetch("/api/next");
  if (r.status === 204) { document.getElementById("app").innerHTML = "<p>队列空了 ✅</p>"; return; }
  cur = await r.json();

  document.getElementById("cnt").textContent =
    "剩余 " + cur.pending_count + " 条 | 已超时 " + cur.overdue_count + " 条";

  document.getElementById("app").innerHTML = \`
    <div class="card">
      <div class="meta">
        <span class="score">分 \${cur.score}</span> ·
        \${cur.action} · \${cur.reasons.join(" / ")} ·
        等 \${cur.waiting_hours}h · 剩余 SLA \${cur.sla_left}h
      </div>
      <p><b>客户原话</b></p>
      <pre>\${cur.input}</pre>
      \${cur.output ? "<p><b>模型输出</b></p><pre>" + cur.output + "</pre>" : "<p class=meta>（无输出：超时）</p>"}
      <p><b>处理后（可编辑）</b></p>
      <textarea id="fix">\${cur.output ?? ""}</textarea>
      <p>
        <button class="pass" onclick="submit('fixed')">通过（用上面的内容）</button>
        <button class="reject" onclick="submit('rejected')">驳回（不回复）</button>
        <button class="redo" onclick="submit('rewritten')">重写完成</button>
      </p>
    </div>
  \`;
}

async function submit(resolution) {
  const final_output = document.getElementById("fix").value;
  await fetch("/api/done", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: cur.id, resolution, final_output }),
  });
  load();
}

// 键盘快捷键 —— 这是"10 秒处理一条"的关键
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA") return;
  if (e.key === "1") submit("fixed");
  if (e.key === "2") submit("rejected");
  if (e.key === "3") submit("rewritten");
});

load();
</script></body></html>`;

export function startReviewUI(db, port = 3100) {
  http.createServer(async (req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(HTML);
    }

    if (req.url === "/api/next") {
      const next = db.prepare(`
        SELECT * FROM review_queue WHERE status = 'pending'
        ORDER BY score DESC, created_at ASC LIMIT 1
      `).get();

      if (!next) { res.writeHead(204); return res.end(); }

      const counts = db.prepare(`
        SELECT
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS p,
          SUM(CASE WHEN status='pending' AND due_at < ? THEN 1 ELSE 0 END) AS o
        FROM review_queue
      `).get(Date.now());

      const hours = (Date.now() - next.created_at) / 3_600_000;
      const slaLeft = (next.due_at - Date.now()) / 3_600_000;

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        ...next,
        reasons: JSON.parse(next.reasons),
        waiting_hours: hours.toFixed(1),
        sla_left: slaLeft.toFixed(1),
        pending_count: counts.p ?? 0,
        overdue_count: counts.o ?? 0,
      }));
    }

    if (req.url === "/api/done" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const { id, resolution, final_output } = JSON.parse(body);

      db.prepare(`
        UPDATE review_queue
        SET status='done', done_at=?, resolution=?, final_output=?
        WHERE id=?
      `).run(Date.now(), resolution, final_output, id);

      // 关键：回流（第 4 步）
      await collectForEval({ id, resolution, final_output });

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    res.writeHead(404); res.end();
  }).listen(port, () => console.log(`复核界面 http://localhost:${port}`));
}
```

## 3.2 三个让速度翻倍的设计

**① 键盘快捷键（1/2/3）**

```text
鼠标点按钮：约 2 秒
键盘按 1：约 0.2 秒
```

**一天 39 条，省 70 秒。听着不多，但真正的差别是"愿不愿意打开它"。**

**② 默认填好"处理后"的输入框**

```javascript
<textarea id="fix">${cur.output ?? ""}</textarea>
```

**大部分条目只需要小改，预填输出就不用重新敲。**

**③ 一次只显示一条**

**不要做列表页。**

```text
列表页的问题：你会先扫一遍，挑"简单的"先做，把难的留着
单条流：你只能处理眼前这条，处理完自动下一条
```

**单条流看起来效率低，实际上处理率更高** —— 因为它没有"选择跳过"这个动作。

## 3.3 一个必须做的显示

```
剩余 SLA 2.3h   ← 负数意味着已超时
```

**这个东西的心理作用极强。** 看到 "剩余 0.5h"，你会现在就处理；看到 "创建于 3 天前"，你会想"再等等"。

**同一个事实，换一种呈现方式，行为完全不同。**

---

# 第 4 步：SLA 与升级（20 分钟）

## 4.1 三条规则

```text
① 到期前 30% 时间 → 提醒（才发现有这个条目）
② 到期        → 升级（提到最高优先级，并通知）
③ 超期 2 倍   → 强制处理（标记为事故，进复盘）
```

```javascript
// reliable/sla.js
export function checkSla(db, notify) {
  const now = Date.now();

  // ① 即将到期（剩余时间 < 30% 总时限）
  const soon = db.prepare(`
    SELECT * FROM review_queue
    WHERE status='pending'
      AND due_at > ?
      AND (due_at - created_at) * 0.3 > (due_at - ?)
  `).all(now, now);

  for (const r of soon) {
    notify.warn("sla_soon", { id: r.id, left_h: ((r.due_at - now) / 3.6e6).toFixed(1) });
  }

  // ② 已超期 → 升级
  const overdue = db.prepare(`
    SELECT * FROM review_queue WHERE status='pending' AND due_at < ?
  `).all(now);

  for (const r of overdue) {
    db.prepare(`UPDATE review_queue SET score = score + 100 WHERE id = ?`).run(r.id);
    notify.error("sla_overdue", { id: r.id, hours: ((now - r.due_at) / 3.6e6).toFixed(1) });
  }

  // ③ 超期 2 倍 → 事故
  const disaster = db.prepare(`
    SELECT * FROM review_queue
    WHERE status='pending' AND due_at + (due_at - created_at) < ?
  `).all(now);

  for (const r of disaster) {
    db.prepare(`UPDATE review_queue SET status='escalated' WHERE id = ?`).run(r.id);
    notify.error("sla_disaster", { id: r.id, input_head: r.input.slice(0, 30) });
  }

  return { soon: soon.length, overdue: overdue.length, disaster: disaster.length };
}
```

## 4.2 为什么"升级"要加 100 分

因为要把超期条目**推到队列最前面**。

```text
正常越权承诺：100 分
超期的抽检：  3 + 最多 50 + 100 = 153 分  ← 排到前面
```

**这看起来不合理（抽检排在越权承诺前），但实际是对的：**

```text
抽检超期 3 天 → 说明你的流程失控了 → 停下来看一眼流程
越权承诺刚进来 → 还有 2 小时，不急
```

**超期本身就是一个信号：你的 SLA 定错了，或者你的处理能力不够。** 这个信号比任何单条的风险都重要。

## 4.3 一个必须诚实面对的事

**如果你的队列每天都超期，那 SLA 就是假的。**

```text
真实情况：每天进 39 条，你只能处理 20 条
你的 SLA 定 8 小时 → 每天有 19 条超期

正确做法（二选一）：
① 降低进入量（收紧闸门，让 39 变 20）
② 提高处理能力（分级、批量、快捷键）
③ 承认现状，SLA 改成 24 小时，并写进报告
```

**第 ③ 个选项听着像认输，其实是最专业的。** 因为一个不真实的 SLA 比没有 SLA 更糟 —— 它会让你对"超期"麻木。

**第 126 节教过：写清"已知风险"比假装没问题更可信。** 这里同理。

---

# 第 5 步：回流（20 分钟）★ 让队列变短的唯一办法

## 5.1 回流的三种形式

```text
形式一：变成新测试题
  人工处理过的条目 → 加进 dev.jsonl（不是 cases.jsonl，已冻结）
  → 下次改提示词时，用这些真实案例验证

形式二：变成规则
  同一类问题出现 3 次以上 → 加一条规则/词表项
  → 下次不用人工处理

形式三：变成提示词的一行
  同一类失败在提示词层面能解决 → 改 prompt.txt
  → 从源头减少
```

## 5.2 收集函数

```javascript
// reliable/collect.js
import fs from "node:fs";

export async function collectForEval({ id, resolution, final_output }) {
  const row = db.prepare(`SELECT * FROM review_queue WHERE id = ?`).get(id);
  if (!row) return;

  // 只收集"人工改过的" —— 直接通过的没有新信息
  if (resolution === "fixed" && row.output === final_output) return;

  const rec = {
    id: `R-${row.id}`,
    layer: "real",
    input: row.input,
    output_model: row.output,
    output_final: final_output,
    reason: JSON.parse(row.reasons),
    resolution,
    collected_at: new Date().toISOString(),
  };

  fs.appendFileSync("../eval/dev.jsonl", JSON.stringify(rec) + "\n");
}
```

## 5.3 每周一次的分类动作

```javascript
// reliable/triage.js
// 每周跑一次，看人工处理的条目能归纳出什么

const rows = db.prepare(`
  SELECT * FROM review_queue
  WHERE status='done' AND done_at > ?
`).all(Date.now() - 7 * 86_400_000);

// ① 按原因分组
const byReason = {};
for (const r of rows) {
  for (const reason of JSON.parse(r.reasons)) {
    byReason[reason] ??= [];
    byReason[reason].push(r);
  }
}

// ② 每个原因下，找"模型错在哪"的共性
for (const [reason, items] of Object.entries(byReason)) {
  console.log(`\n=== ${reason}（${items.length} 条）===`);

  // 统计"人工改了什么"
  const changes = items
    .filter((x) => x.final_output)
    .map((x) => diffFields(x.output, x.final_output));

  const fieldCount = {};
  for (const c of changes) {
    for (const f of c) fieldCount[f] ??= 0, fieldCount[f]++;
  }
  console.log("最常被改的字段：", Object.entries(fieldCount).sort((a, b) => b[1] - a[1]).slice(0, 3));
}
```

## 5.4 一个硬规则

```text
同一类问题，人工处理超过 3 次 → 必须做一件事：
  ① 加一条规则，或
  ② 改一行提示词，或
  ③ 明确写"这一类我们不解决，接受人工"

三者必选其一。不允许"下次再说"。
```

**这条规则是队列不变成坟场的唯一保证。**

**为什么是 3 次？**

```text
1 次 → 偶发，不值得动系统
2 次 → 可能是巧合
3 次 → 是模式
```

**这个数字你自己可以调，但必须有。**

## 5.5 一个必须看的指标

```text
队列长度趋势
```

```text
第 1 周  39 条/天  队列 39
第 2 周  39 条/天  队列 78     ← 没有回流
第 3 周  39 条/天  队列 117    ← 坟场形成

vs

第 1 周  39 条/天  队列 39
第 2 周  31 条/天  队列 40     ← 加了 3 条规则
第 3 周  24 条/天  队列 26     ← 改了提示词
第 4 周  22 条/天  队列 22     ← 稳定，可维护
```

**如果在第 4 周你的队列长度还在涨，说明回流没做。**

**这个指标要每周看一眼。** 它是你今天所有工作的验收标准。

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **39 条/天里，三类动作各多少**
- **分级之后的总耗时**（对比不分级）
- **优先级算法里"时间衰减上限"为什么是 50**
- **队列长度趋势**（哪怕只有一周数据）

---

# 第 7 步：课后练习

## 练习一：加一个"同类合并"（25 分钟）

**如果队列里有 8 条都是同一个客户发的同一类问题：**

```text
现在的做法：处理 8 次
正确的做法：合并成 1 条，标注"×8"，处理 1 次
```

**实现思路：**

```text
① 按 (客户标识 + 原因类型) 分组
② 组内 > 2 条 → 只显示第一条，标注"还有 7 条同类"
③ 处理完 → 整组一起标记
```

**这个功能能把工作量直接砍掉 20–30%。**

**但注意：合并之后不能丢失"高频"这个信号。** 一个客户来了 8 次同一类问题，本身就是需要升级的事。

## 练习二：算清 SLA 该怎么定（20 分钟）

```text
你每天能处理 ___ 条（按 30 分钟/天 ÷ 平均处理时间）
你每天进 ___ 条

如果进入量 > 处理量：
  SLA 必须放宽，或者降低进入量
  写清楚你的选择：
```

**参考答案框架：**

```text
我的处理能力：30 分钟/天 ÷ 45 秒/条（平均） = 40 条/天
进入量：39 条/天
余量：1 条/天  ← 太紧，没有任何缓冲

所以：
  ① 抽检从每天 18 条降到 8 条（抽检率 20% → 10%）
  ② 或者让 confirm 类批量过（一次 20 条）
```

**任何"每天正好处理完"的设计都是脆弱的** —— 你生病一天就积压。

## 练习三：判断这个队列设计错在哪（15 分钟）

```text
某人的设计：
  review_queue 表，字段 id / input / created_at / status
  界面：一个列表页，按 id 正序
  SLA：无
  回流：无
  他自己每天花 1 小时处理
```

**错在哪？至少五条。**

**参考答案：**

```text
① 无优先级 → 最危险的排在第 30 位
② 按 id 正序 = 按时间 → 老垃圾永远在最前面
③ 列表页 → 你会挑简单的先做，难的永远留着
④ 无 SLA → 没有"必须清空"的压力
⑤ 无回流 → 队列只增不减，必然变坟场
⑥ 没有 output 字段 → 你处理时看不到模型给了什么，无法判断改了哪里
⑦ 没有 action 分级 → 每条都按 1.5 分钟算，工作量高估一倍
```

**第 ⑤ 条是根本问题。** 其他都只是效率问题，第 ⑤ 条决定这个队列能不能活过一个月。

---

# 第 8 步：最终验收

## A. 表结构

- [ ] `trace_id UNIQUE`（防重复入队）
- [ ] `input` 非空（唯一副本）
- [ ] `output` 允许 NULL（超时场景）
- [ ] `score` / `sla_hours` / `due_at` / `action` 都有
- [ ] `resolution` / `final_output` 用于回流
- [ ] 两个索引：`(status, score DESC)` 和 `(status, due_at)`

## B. 优先级

- [ ] 五种以上原因各有 `cost` 和 `sla`
- [ ] `score` 叠加，不取最大
- [ ] 时间衰减有上限（50），不会让老垃圾翻盘
- [ ] 金额放大生效（≥500 加 40）
- [ ] 重复客户上调（≥2 次加 30）

## C. 分级

- [ ] 三类动作（confirm / fix / redo）都有条目落进去
- [ ] confirm 类能批量处理
- [ ] 实测：分级后的日耗时比不分级少 40% 以上

## D. 界面

- [ ] 一次只显示一条（不是列表页）
- [ ] 有键盘快捷键（1/2/3）
- [ ] "处理后"输入框预填了模型输出
- [ ] 显示剩余 SLA
- [ ] 显示队列剩余条数和超时条数

## E. SLA

- [ ] 到期前 30% 提醒
- [ ] 超期自动 +100 分
- [ ] 超期 2 倍标记 escalated
- [ ] 你诚实评估了：SLA 定得现实吗

## F. 回流

- [ ] 人工改过的条目写进 `dev.jsonl`
- [ ] 有 `triage.js` 每周跑一次
- [ ] 写了"同类 3 次必须处理"的硬规则
- [ ] 有队列长度趋势的记录

## G. 提交

```bash
git add 每周课程/04-工程可靠性/第19周-可靠性与审核/第05节课 03-练习代码/reliable
git commit -m "第131节：复核队列，分级后日耗时XX分钟，队列长度XX"
git push
```

---

## 本节课要能说出口的一句话

> **复核队列的敌人不是"条目太多"，是"没有回流"——只进不出的队列，三周就变成坟场。**

---

# 附：常见问题速查

**Q：我一天只有 20 分钟，39 条根本处理不完。**

A：**那就别想着全处理。**

```text
正确做法：
  ① 只处理 redo 类（3 条/天，15 分钟）—— 这些是真正危险的
  ② fix 类抽样 30%（4 条，3 分钟）
  ③ confirm 类完全不看（它们是误报和抽检，不看不会出事）
```

**关键认知：`confirm` 类的存在意义是"留证据"，不是"必须处理"。**

**它们的价值在于：万一三个月后出事，你能翻出这批条目说"我们检查过"。**

**Q：抽检率定多少合适？**

A：**10–20%。**

```text
5%  → 太少，抓不到系统性漂移
20% → 够用，成本可接受
50% → 你会放弃
```

**抽检的目的不是"审每一条"，是"及时发现模型变差了"。** 10% 的抽样足以在 3 天内发现 30% 的准确率下降。

**Q：`repeated` 字段怎么实现最简单？**

A：**用 `input` 的 hash 前 8 位当 key。**

```javascript
const key = crypto.createHash("md5").update(input).digest("hex").slice(0, 8);
```

**它抓不到"同一个客户换说法"的情况**，但能抓到"同一条消息重复发"（这才是高频场景）。

**要抓"换说法"，就得用手机号/订单号 —— 但那需要先做 PII 提取。**

**Q：合并同类会不会丢掉信息？**

A：会丢"我处理了 8 次"这个工作量信息，**但不该丢"这个客户来了 8 次"这个信号。**

**正确做法：**

```text
合并显示，但保留 repeat_count
处理时看到 "×8" 的标记 → 你会意识到这不是单个问题
```

**Q：SLA 定 2 小时，但我晚上睡觉怎么办？**

A：**这是最实际的问题，也是 SLA 必须带"工作时段"的原因。**

```javascript
// 只算工作时段（9:00-21:00）
function workingHoursBetween(from, to) {
  let h = 0;
  for (let t = from; t < to; t += 3_600_000) {
    const hour = new Date(t).getHours();
    if (hour >= 9 && hour < 21) h++;
  }
  return h;
}
```

**或者在 SLA 里明确写"工作时段内 2 小时"，并把进入时间戳的夜间部分剔除。**

**不处理这个问题，你的 SLA 每天都会被"半夜进来的条目"破坏。**

**Q：回流到 `dev.jsonl` 和 `cases.jsonl` 有什么区别？**

A：**`cases.jsonl` 已冻结（第 121 节），只能加不能改，用于跨版本对比。`dev.jsonl` 随便改，用于调提示词。**

```text
人工处理的条目 → dev.jsonl（因为你要用它改提示词）
稳定 3 个月后、确认没争议的 → 可以提升进 cases.jsonl（作为新增题，新 id）
```

**直接塞进 `cases.jsonl` 会让你的历史对比失效** —— 因为分母变了。

**Q：队列清空的时候我该做什么？**

A：**做这三件事，比清空队列更值钱：**

```text
① 跑 triage.js，看这周的模式
② 找一条"同类 3 次"的，去改规则或提示词
③ 看一眼队列长度的周趋势
```

**队列空的时候是优化系统的最佳时机。** 忙的时候你只会救火。
