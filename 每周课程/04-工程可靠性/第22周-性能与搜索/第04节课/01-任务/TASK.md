# 第 151 节课：分页（OFFSET 的坑与 keyset）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 昨天那个 `offset=20000` 还有 40ms。今天把它降到和第一页一样快。
> 而且你会亲手看到 `OFFSET` 为什么注定会崩。

**建议用时**：120 分钟
**你需要先完成**：第 150 节的 counter 表
**今天要装**：什么都不用装

---

# 第 0 步：OFFSET 到底在做什么（20 分钟）

## 0.1 一个必须知道的实现细节

```sql
SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20 OFFSET 20000;
```

**数据库实际做的事：**

```text
① 找到 created_at 最大的那行
② 取第 1 行 → 不要（offset 还没到）
③ 取第 2 行 → 不要
...
② 取第 20000 行 → 不要
③ 取第 20001 行 → 要
...
④ 取到第 20020 行 → 停
```

**它读了 20020 行，只给你 20 行。**

**所以：**

```text
offset 0      → 读 20 行
offset 20000  → 读 20020 行（1000 倍）
offset 200000 → 读 200020 行（10000 倍）
```

**这就是"第 1000 页比第 1 页慢 1000 倍"的原因。** 不是索引的问题，是 `OFFSET` 的语义如此。

## 0.2 索引能帮多少

```text
没有索引：
  读 20020 行（每行从磁盘读，约 30 字节元数据 + 数据）
  62ms

有 (created_at) 索引：
  读 20020 个索引项（每项约 20 字节，只有 created_at + rowid）
  再按 rowid 取 20 行数据
  12ms  ← 快 5 倍，但还是要读 20020 个索引项
```

**索引把"读 20020 行表数据"变成"读 20020 个索引项 + 20 行表数据"。**

**快了 5 倍，但没有改变"读 20020 个"这个事实。**

## 0.3 为什么这会在某天变成事故

```text
现在：offset 最大 5000（第 250 页）
  → 12ms，用户能忍

一年后：数据涨 10 倍，用户翻到第 2000 页
  → offset 40000
  → 24ms
  → 还是能忍

但如果有爬虫/导出工具在翻页？
  → 每分钟 100 次 offset=40000 的请求
  → 每次都读 4 万个索引项
  → CPU 打满
  → 整个服务变慢
```

**这就是"分页打死服务"的经典事故。**

**而且触发条件很隐蔽：** 一个用了三年的老客户，习惯性地翻到最后一页看看"总共多少条"。

## 0.4 今天的解法

```text
keyset 分页（又叫游标分页 / seek 分页）

不用 OFFSET，用"上一页最后一条的排序值"作为起点：
  WHERE created_at < ?     ← 上一页最后一条的时间
  ORDER BY created_at DESC
  LIMIT 20
```

**数据库做的事：**

```text
在索引里定位到 created_at < 那个时间点
读 20 个索引项
取 20 行数据
→ 不管第几页，都是 20 行
```

**第 1 页和第 1000 页一样快。**

---

# 第 1 步：先量出 OFFSET 的曲线（25 分钟）

## 1.1 量 7 个 offset

```javascript
// scripts/bench-offset.js
import { db } from "../app/lib/db.js";

function time(sql, params = [], n = 20) {
  const stmt = db.prepare(sql);
  for (let i = 0; i < 3; i++) stmt.all(...params);    // 预热

  const lat = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    stmt.all(...params);
    lat.push(performance.now() - t0);
  }
  lat.sort((a, b) => a - b);
  return lat[Math.floor(lat.length * 0.5)];
}

console.log("offset 分页的耗时曲线（10 万行）\n");
console.log("offset".padStart(9) + "P50".padStart(12) + "  说明");
console.log("-".repeat(48));

const OFFSETS = [0, 100, 1000, 5000, 20000, 50000, 99980];

for (const off of OFFSETS) {
  const ms = time(
    "SELECT * FROM tickets ORDER BY created_at DESC LIMIT 20 OFFSET ?",
    [off]
  );
  const page = Math.floor(off / 20) + 1;
  console.log(
    String(off).padStart(9) +
    `${ms.toFixed(2)}ms`.padStart(12) +
    `  第 ${page} 页`
  );
}
```

**跑它：**

```bash
NODE_ENV=development node scripts/bench-offset.js
```

**期望输出：**

```text
offset 分页的耗时曲线（10 万行）

   offset        P50  说明
------------------------------------------------
        0      0.31ms  第 1 页
      100      0.42ms  第 6 页
     1000      1.12ms  第 51 页
     5000      4.31ms  第 251 页
    20000     16.42ms  第 1001 页
    50000     41.28ms  第 2501 页
    99980     78.91ms  第 5000 页
```

**一条近乎直线的曲线。**

```text
offset 0     → 0.31ms
offset 99980 → 78.91ms（255 倍）
```

**注意：这是"只返回 20 条"的耗时。** 用户看起来"只拿到 20 条数据"，但数据库读了 10 万行。

## 1.2 一个必须算的数

```text
每次请求读的行数 = offset + limit
翻到最后一页 → 读 100000 行

如果 10 个用户同时翻到最后一页：
  → 读 100 万行
  → 如果一行 300 字节 = 300MB 内存扫描
  → 磁盘 IO 打满
```

**这就是"第 5000 页"的危险：它不是慢，是"一次请求等于一次全表扫"。**

**而全表扫的攻击成本极低** —— 一个 URL 参数就能触发。

## 1.3 你的接口在哪个 offset 会开始变慢

**填这个表：**

| offset | 耗时 | 你能接受吗 |
|---|---|---|
| 0 | | |
| 1000 | | |
| 5000 | | |
| 20000 | | |

**判断标准：**

```text
P50 < 20ms  → 可接受
P50 20–100ms → 需要优化（用户能感觉到）
P50 > 100ms  → 必须优化（用户抱怨）
```

**写下你的临界 offset。**

---

# 第 2 步：实现 keyset 分页（35 分钟）★ 核心

## 2.1 原理

```sql
-- 第一页（没有 cursor）
SELECT * FROM tickets
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 后续页（带 cursor = 上一页最后一条的 created_at + id）
SELECT * FROM tickets
WHERE (created_at < ?) OR (created_at = ? AND id < ?)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

**两个关键点：**

**① 为什么要带 `id`？**

```text
created_at 可能重复（同一毫秒插入了多条）
如果只用 created_at < ?，会漏掉"同一毫秒但 id 更小"的行
→ 用 (created_at, id) 做复合游标
```

**② 为什么是 `OR (created_at = ? AND id < ?)`？**

```text
这是"复合键的字典序比较"：
  (created_at, id) < (游标时间, 游标id)
  等价于：
    created_at < 游标时间
    OR (created_at = 游标时间 AND id < 游标id)
```

**注意不能用 `(created_at, id) < (?, ?)` 这种行值比较** —— SQLite 从 3.15 开始支持，但为了兼容性，手写展开更安全。

## 2.2 仓储层实现

```javascript
// app/repos/ticket.js

/**
 * keyset 分页。
 * @param {object} opts
 * @param {number} opts.limit
 * @param {string|null} opts.cursor   形如 "1763332282412_50000"，为 null 表示第一页
 * @param {string|null} opts.category
 */
export function listByKeyset({ limit = 20, cursor = null, category = null }) {
  const where = [];
  const params = [];

  if (category) {
    where.push("category = ?");
    params.push(category);
  }

  let cursorTs = null, cursorId = null;
  if (cursor) {
    const [tsStr, idStr] = String(cursor).split("_");
    cursorTs = Number(tsStr);
    cursorId = Number(idStr);
    if (!Number.isFinite(cursorTs) || !Number.isFinite(cursorId)) {
      throw new Error("cursor 格式不对，应为 <created_at>_<id>");
    }
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    params.push(cursorTs, cursorTs, cursorId);
  }

  const sql = `
    SELECT * FROM tickets
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params, limit + 1);   // 多取 1 条判断有没有下一页

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? `${last.created_at}_${last.id}` : null;

  return { rows, hasMore, nextCursor };
}
```

## 2.3 逐段解释四个关键设计

**① 为什么 `LIMIT limit + 1`**

```text
取 21 条：
  如果拿到 21 条 → 说明还有下一页（去掉第 21 条，返回 20 条）
  如果只拿到 20 条 → 到底了
```

**不用 `COUNT(*)`，不用额外查询。**

**这和昨天 `has_more` 方案是同一个技巧。**

**② 为什么 cursor 是 `"时间_id"` 而不是 base64**

```text
简单可读：
  cursor=1763332282412_50000
  → 你一眼知道"时间 1763332282412，id 50000"

base64：
  cursor=MTc2MzMzMjI4MjQxMl81MDAwMA==
  → 你要解码才知道是什么
```

**唯一的缺点：客户端能改它（但改它只是"跳到别的位置"，没有安全风险）。**

**如果你的 cursor 里要放敏感信息（比如权限），才需要签名。你的场景不需要。**

**③ 为什么要 `ORDER BY created_at DESC, id DESC`（双列）**

```text
只按 created_at DESC 排序：
  同一毫秒的多条 → 顺序不确定（数据库返回顺序可能变）
  → 翻页时会重复或漏掉

加上 id DESC：
  完全确定
  → 分页稳定
```

**这是分页正确性的基础。**

**④ 为什么 `category` 筛选也要进 WHERE**

**因为 keyset 分页必须让筛选条件和游标条件同时生效。**

```sql
WHERE category = 'quality'
  AND (created_at < ? OR (created_at = ? AND id < ?))
ORDER BY created_at DESC, id DESC
LIMIT 21
```

**这正好用得上 `(category, created_at)` 复合索引。**

## 2.4 路由层

```javascript
// app/routes/tickets.js
ticketsRouter.get("/tickets", wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const cursor = req.query.cursor ?? null;
  const category = req.query.category ?? null;

  const { rows, hasMore, nextCursor } = repo.listByKeyset({ limit, cursor, category });

  res.json({
    ok: true,
    trace_id: req.traceId,
    data: rows,
    has_more: hasMore,
    next_cursor: nextCursor,
    // 注意：不再返回 total（需要用 counter，见第 150 节）
    total: getCounter(category ? `tickets:${category}` : "tickets"),
  });
}));
```

## 2.5 量它

```javascript
// scripts/bench-keyset.js
import { listByKeyset } from "../app/repos/ticket.js";

function time(fn, n = 20) {
  for (let i = 0; i < 3; i++) fn();
  const lat = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    lat.push(performance.now() - t0);
  }
  lat.sort((a, b) => a - b);
  return lat[Math.floor(lat.length * 0.5)];
}

console.log("keyset 分页：翻到第 N 页的耗时\n");
console.log("第 N 页".padStart(8) + "P50".padStart(12));
console.log("-".repeat(24));

let cursor = null;
for (let page = 1; page <= 5000; page++) {
  const r = listByKeyset({ limit: 20, cursor });

  if ([1, 10, 100, 500, 1000, 2500, 5000].includes(page)) {
    const ms = time(() => listByKeyset({ limit: 20, cursor }));
    console.log(String(page).padStart(8) + `${ms.toFixed(2)}ms`.padStart(12));
  }

  cursor = r.nextCursor;
  if (!r.hasMore) break;
}
```

**期望输出：**

```text
第 N 页        P50
------------------------
       1      0.31ms
      10      0.30ms
     100      0.32ms
     500      0.31ms
    1000      0.33ms
    2500      0.30ms
    5000      0.34ms
```

**一条水平线。** 这就是目标。

**注意：这个脚本本身要翻 5000 次页才能到第 5000 页 —— 会跑一会儿（约 2 秒）。**

## 2.6 对照表

**把你的数字填进来：**

| 第 N 页 | OFFSET 分页 | keyset 分页 | 倍数 |
|---|---|---|---|
| 1 | | | |
| 51 | | | |
| 251 | | | |
| 1001 | | | |
| 2501 | | | |
| 5000 | | | |

**这张表就是你今天的成果。**

---

# 第 3 步：四个必须处理的坑（25 分钟）

## 3.1 坑一：结果不稳定（同一毫秒多条）

**测一下：**

```javascript
// scripts/test-cursor-stability.js
import { db } from "../app/lib/db.js";
import { listByKeyset } from "../app/repos/ticket.js";

// 找到一组 created_at 相同的行
const dup = db.prepare(`
  SELECT created_at, COUNT(*) n FROM tickets
  GROUP BY created_at HAVING n > 1
  ORDER BY n DESC LIMIT 1
`).get();

if (!dup) {
  console.log("没有重复时间戳，造几条");
  const ts = Date.now();
  const stmt = db.prepare("INSERT INTO tickets (trace_id, input, category, urgency, need_human, route, degraded, created_at) VALUES (?,?,?,?,?,?,?,?)");
  for (let i = 0; i < 30; i++) stmt.run(`tr_dup_${i}`, "x".repeat(50), "other", "low", 0, "auto", 0, ts);
  console.log("已造 30 条同一时刻的数据，ts =", ts);
} else {
  console.log(`最多重复：${dup.created_at} 有 ${dup.n} 条`);
}

// 翻页，检查有没有重复或遗漏
const seen = new Set();
let cursor = null, dupCount = 0, total = 0;

for (let i = 0; i < 100; i++) {
  const r = listByKeyset({ limit: 7, cursor });     // 7 不是 30 的约数，容易暴露问题
  for (const row of r.rows) {
    if (seen.has(row.id)) { dupCount++; console.log("❌ 重复:", row.id); }
    seen.add(row.id);
    total++;
  }
  if (!r.hasMore) break;
  cursor = r.nextCursor;
}

console.log(`\n翻了 ${total} 条，重复 ${dupCount} 条`);
```

**期望：`重复 0 条`。**

**如果把 `ORDER BY` 的 `, id DESC` 去掉，你会看到重复。**

**这就是"为什么要双列排序"的实验证明。**

## 3.2 坑二：新数据插入导致"翻页重复"

**场景：**

```text
第 1 页：你看到 id 100, 99, 98 ... 81（按 created_at DESC）
此时有人插入 id 101（最新）
第 2 页：cursor = "ts_of_81_81"
  → WHERE created_at < ts_of_81 → 从 id 80 开始
  → 不会重复
```

**keyset 天然免疫这个问题** —— 因为它是"从某个位置往后读"，不是"跳过 N 条"。

**而 OFFSET 会有问题：**

```text
第 1 页：offset 0 → id 100..81
插入 id 101
第 2 页：offset 20 → 现在全表变成 101,100,...,81,80...
  → offset 20 是 id 81
  → 你看到 id 81（第 1 页的最后一条）重复了
```

**这是 keyset 的第二个优势：翻页期间有新数据也不会重复。**

**验证：**

```javascript
// 用 offset 分页，翻页中间插入一条，检查重复
const page1 = db.prepare("SELECT id FROM tickets ORDER BY created_at DESC, id DESC LIMIT 20").all();
db.prepare("INSERT INTO tickets (trace_id,input,category,urgency,need_human,route,degraded,created_at) VALUES (?,?,?,?,?,?,?,?)")
  .run("tr_new_" + Date.now(), "x", "other", "low", 0, "auto", 0, Date.now());
const page2 = db.prepare("SELECT id FROM tickets ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 20").all();

const p1 = new Set(page1.map(r => r.id));
const dup = page2.filter(r => p1.has(r.id));
console.log("重复的条数:", dup.length);   // 应该是 1 或更多
```

## 3.3 坑三：删除导致"翻页遗漏"

**场景：**

```text
第 1 页：offset 0 → id 100..81
删除 id 90
第 2 页：offset 20 → 现在总数少 1，offset 20 对应 id 80
  → id 80 之前的 id 81？被跳过了吗？
  
实际：
  第 1 页拿到 100..81
  删掉 90 后，列表变成 100,99,...,91,89,...,81,80,...
  offset 20 是第 21 个 = id 80
  但 id 81 是第 20 个（已经在第 1 页了）
  → 没有遗漏
  
再想：
  如果删的是 id 100（第 1 页的第一条）
  列表变成 99,...,81,80,...
  offset 20 = 第 21 个 = id 79
  → id 80 被跳过！❌
```

**结论：OFFSET 分页在"翻页期间有删除"时会漏数据。**

**keyset 不会**（因为它是"从游标位置往后读"，删了谁都不影响"往后"）。

**这就是为什么"实时变化的列表"必须用 keyset。**

## 3.4 坑四：不能跳页

**keyset 的代价：**

```text
能做的：
  · 下一页（用 next_cursor）
  · 上一页（需要记录历史 cursor 栈，或者反向查询）
  · 从头开始

不能做的：
  · 直接跳到第 5000 页
```

**为什么？**

```text
要知道第 5000 页从哪开始，你必须先知道第 4999 页的最后一条
→ 必须一页一页翻过去
→ 那还不如用 OFFSET
```

**你的 UI 如果必须有"跳到第 N 页"，怎么办？**

```text
方案一：不提供跳页（改成"加载更多"或无限滚动）
方案二：搜索/筛选代替跳页（用户真正需要的是"找到某条"，不是"第 5000 页"）
方案三：保留 OFFSET 但限制最大 offset（比如 1000），超过就提示"请用搜索"
方案四：混合（前 50 页用 OFFSET，之后用 keyset）
```

**推荐方案二或三。**

**方案三的实现：**

```javascript
if (offset > 2000) {
  return res.status(400).json({
    ok: false,
    code: "BAD_INPUT",
    message: "翻页太深了，请用搜索或筛选来缩小范围",
    hint: "最多翻到第 100 页",
    trace_id: req.traceId,
  });
}
```

**这个"拒绝"比"慢 3 秒"更好** —— 它给了用户一个可行动的提示。

## 3.5 一个必须做的决定

**你的列表页要哪种？**

```text
[ ] 纯 keyset（加载更多 / 无限滚动）
[ ] 纯 OFFSET（页码 + 限制最大 offset）
[ ] 混合（OFFSET 前 N 页 + keyset 之后）
```

**写下你的选择和理由。**

**我的建议：**

```text
后台管理列表 → 纯 OFFSET + 限制 offset ≤ 2000
  理由：运营需要"跳到某页"，且通常只翻前几页

面向用户的列表 → 纯 keyset
  理由：无限滚动是主流，且要防"翻页打死服务"

搜索结果 → 纯 keyset
  理由：搜索结果本来就"每次都不同"，跳页没意义
```

---

# 第 4 步：给接口加保护（15 分钟）

## 4.1 限制最大 offset

```javascript
// app/routes/tickets.js
ticketsRouter.get("/tickets", wrap(async (req, res) => {
  const rawOffset = Number(req.query.offset ?? 0);

  // 防"翻页打死服务"
  if (rawOffset > 2000) {
    fail("BAD_INPUT", {
      detail: `offset=${rawOffset} 超过上限 2000`,
      extra: { hint: "翻页太深了，请用搜索或筛选来缩小范围" },
    });
  }

  // ... 其余逻辑
}));
```

**注意 `extra: { hint }`** —— 第 137 节的 `AppError` 支持额外字段，前端能显示提示。

## 4.2 加一个"深翻页监控"

```javascript
// 在列表接口里
if (offset > 500) {
  log.warn("deep_pagination", {
    trace_id: req.traceId,
    offset,
    ua: String(req.headers["user-agent"] ?? "").slice(0, 60),
  });
}
```

**为什么？**

```text
偶尔有用户翻到 500 页 → 正常
每分钟 100 次 offset>500 → 是爬虫 / 恶意 / 导出脚本
```

**这条日志让你在"服务变慢"之前看到征兆。**

## 4.3 一个反面例子：为什么不能"静默降级"

```javascript
// ❌ 不要这样
if (offset > 2000) offset = 2000;   // 静默改成 2000
```

**后果：**

```text
用户请求 offset=5000
→ 你返回 offset=2000 的数据
→ 用户看到"数据重复了"（因为 2000 和 5000 有交集？没有）
→ 实际上用户看到的是第 101 页，但他以为是第 251 页
→ 用户困惑，且不知道该信什么
```

**必须明确报错，不能静默改。**

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **OFFSET 的曲线（7 个点）**
- **keyset 的曲线（7 个点）**
- **两个坑的实测（重复 / 遗漏）**
- **你选了哪种分页方案**

---

# 第 6 步：课后练习

## 练习一：实现"上一页"（25 分钟）

**keyset 只能往后，怎么往前？**

**三种做法：**

```text
① 记住历史 cursor（前端保存一个栈）
   [null, c1, c2, c3]
   点上一页 → 用 c2

② 反向查询（后端支持 direction=prev）
   WHERE (created_at > ?) OR (created_at = ? AND id > ?)
   ORDER BY created_at ASC, id ASC
   LIMIT 21
   → 拿到后反转数组

③ 不做上一页（只有"加载更多"）
```

**实现 ② 是最干净的（后端无状态）。**

**注意：`ORDER BY` 要反过来（ASC），取完再 `reverse()`。**

## 练习二：算清"最大 offset"该设多少（15 分钟）

```text
你的数据量：____ 行
每页 20 条 → 最多 ____ 页

如果限制 offset ≤ 2000（第 101 页）：
  → 用户能翻到第 101 页
  → 覆盖了 ____% 的用户需求？
```

**参考数据（业界经验）：**

```text
90% 的用户只看第 1 页
99% 的用户只看前 5 页
只有 < 0.1% 会翻到第 100 页以后
```

**所以"限制 100 页"能满足 99.9% 的用户。**

**写下你的选择和依据。**

## 练习三：判断这个 keyset 实现错在哪（15 分钟）

```javascript
export function listByKeyset({ limit, cursor }) {
  const sql = cursor
    ? "SELECT * FROM tickets WHERE created_at < ? ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM tickets ORDER BY created_at DESC LIMIT ?";
  const params = cursor ? [cursor, limit] : [limit];
  return db.prepare(sql).all(...params);
}
```

**错在哪？至少四条。**

**参考答案：**

```text
① 只用 created_at 做游标 → 同一毫秒的多条会重复或遗漏
   → 必须加 id 做复合游标
② ORDER BY 只有 created_at → 排序不稳定
   → 必须 ORDER BY created_at DESC, id DESC
③ 没有多取 1 条 → 无法判断"有没有下一页"
   → 前端永远显示"下一页"，点了才发现是空的
④ 没有返回 next_cursor → 前端不知道下一页从哪开始
⑤ 没有 limit 上限 → limit=1000000 会一次拿全表
⑥ cursor 没有格式校验 → cursor="abc" 会得到 created_at < NaN，返回空
```

**第 ① 条是最隐蔽的。** 它只在"同一毫秒有多条数据"时出问题 —— **而你的 `seed-big.js` 在批量插入时，极可能产生大量同毫秒数据。**

**所以这个 bug 会在测试环境暴露，在生产环境（真实间隔插入）可能永远不会触发。** **这正是"必须造真实分布数据"的价值。**

---

# 第 7 步：最终验收

## A. 量出 OFFSET 的曲线

- [ ] `scripts/bench-offset.js` 跑了 7 个 offset
- [ ] offset 0 的 P50 = __ms
- [ ] offset 99980 的 P50 = __ms
- [ ] 倍数 = __ 倍
- [ ] 我的"临界 offset" = __（P50 超过 20ms 的位置）

## B. 实现 keyset

- [ ] `listByKeyset({ limit, cursor, category })` 存在
- [ ] **双列排序** `ORDER BY created_at DESC, id DESC`
- [ ] **复合游标** `"<created_at>_<id>"`
- [ ] **游标条件** `(created_at < ?) OR (created_at = ? AND id < ?)`
- [ ] **`LIMIT limit + 1`** 判断 has_more
- [ ] 返回 `next_cursor`
- [ ] cursor 格式校验（非法值报错，不是返回空）

## C. 量出 keyset 的曲线

| 第 N 页 | OFFSET | keyset | 倍数 |
|---|---|---|---|
| 1 | | | |
| 51 | | | |
| 251 | | | |
| 1001 | | | |
| 2501 | | | |
| 5000 | | | |

- [ ] keyset 的第 1 页和第 5000 页耗时差 < 2 倍

## D. 四个坑

- [ ] **坑一**：造了 30 条同毫秒数据，翻页 0 重复
- [ ] 去掉 `, id DESC` 后能看到重复（**我实测过**）
- [ ] **坑二**：OFFSET 翻页中间插入 → 重复；keyset 不重复
- [ ] **坑三**：OFFSET 翻页中间删除 → 遗漏；keyset 不漏
- [ ] **坑四**：写清了"不能跳页"，并选了应对方案

## E. 保护

- [ ] offset > 2000 会报 `BAD_INPUT`（**不是静默改成 2000**）
- [ ] 错误里有 `hint` 提示"用搜索缩小范围"
- [ ] offset > 500 会记 `warn` 级 `deep_pagination`

## F. 分页方案

- [ ] 我选了：`[ ] 纯 keyset [ ] 纯 OFFSET+限深 [ ] 混合`
- [ ] 写了理由
- [ ] UI 已经相应调整（或者记录了"暂不调整"）

## G. 提交

```bash
git add -A
git commit -m "第151节：keyset分页，第5000页 79ms→0.34ms，双列游标"
git push
```

---

## 本节课要能说出口的一句话

> **`OFFSET 20000` 不是"慢 20 倍"，是"读 20020 行只为给你 20 行"。而一个 URL 参数就能让任何人触发它。**

---

# 附：常见问题速查

**Q：`OFFSET` 到底读了哪些行？**

A：**读 `offset + limit` 行，然后丢掉前 `offset` 行。**

```sql
-- 数据库实际做的
读第 1 行    → 丢
读第 2 行    → 丢
...
读第 20000 行 → 丢
读第 20001 行 → 返回
...
读第 20020 行 → 返回
```

**有索引时"读"的是索引项（更窄），所以快 5 倍。但"读 20020 个"这个事实不变。**

**Q：为什么游标要带 `id`？**

A：**因为 `created_at` 会重复。**

```text
同一毫秒插入 30 条（批量导入时非常常见）
→ 30 条的 created_at 完全一样
→ WHERE created_at < ? 会把它们全部跳过或全部包含
→ 翻页时重复或遗漏
```

**`(created_at, id)` 组合唯一，游标才稳定。**

**Q：keyset 怎么实现"跳页"？**

A：**做不到，也不需要。**

```text
只在"前端保存所有访问过的 cursor"时能跳回已访问的页
跳到"没访问过的第 5000 页"必须一页页翻（比 OFFSET 还慢）
```

**用户真正需要的是"找到某条"，用搜索，不用跳页。**

**Q：我的 UI 必须有页码，怎么办？**

A：**三个选择：**

```text
① 前 100 页用 OFFSET（用户体验不变），超过就提示"用搜索"
② 改成"加载更多"
③ 保留 OFFSET，但加"最大 offset"限制（推荐，改动最小）
```

**方案 ③ 的代码就是第 4 步那 6 行。**

**Q：keyset 和"总数"能一起用吗？**

A：**能。总数用 counter（第 150 节），位置用 cursor。**

```javascript
res.json({
  ok: true,
  data: rows,
  total: getCounter("tickets"),      // 0.01ms
  has_more: hasMore,
  next_cursor: nextCursor,
});
```

**但注意：`total` 和 `cursor` 不是同一个"坐标系"。**

```text
total = 100000
cursor 指向"第 5000 条附近"
→ 你无法算出"这是第几页"
→ 所以不能显示"第 250/5000 页"
```

**这就是"keyset 不能显示页码"的根本原因。**

**Q：为什么"静默改 offset"很危险？**

A：**因为它会让用户看到错误的数据，且不知道为什么。**

```text
用户请求 offset=5000
你静默改成 2000
→ 用户看到第 101 页的数据
→ 但他以为是第 251 页
→ 他找不到自己要找的东西，也不知道问题在哪
```

**明确报错（400 + hint）比"悄悄给错数据"好一百倍。**
