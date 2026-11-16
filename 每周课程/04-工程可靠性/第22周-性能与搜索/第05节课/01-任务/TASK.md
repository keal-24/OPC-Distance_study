# 第 152 节课：搜索（LIKE 的死路与 FTS5）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 昨天那个 `LIKE '%裂%'` 是 41ms，而且**加任何索引都没用**。
> 今天用 SQLite 内置的 FTS5 把它降到 8ms，而且能按相关度排序。

**建议用时**：130 分钟
**你需要先完成**：第 151 节的 keyset 分页
**今天要装**：什么都不用装（FTS5 是 SQLite 内置模块）

---

# 第 0 步：先确认你的 SQLite 支持 FTS5（10 分钟）

## 0.1 一条命令验证

```javascript
// scripts/check-fts5.js
import { db } from "../app/lib/db.js";

try {
  db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS _fts_probe USING fts5(x)");
  db.exec("DROP TABLE _fts_probe");
  console.log("✅ FTS5 可用");
} catch (e) {
  console.log("❌ FTS5 不可用：", e.message);
}

console.log("SQLite 版本:", db.prepare("SELECT sqlite_version() v").get().v);
```

```bash
NODE_ENV=development node scripts/check-fts5.js
```

**期望：**

```text
✅ FTS5 可用
SQLite 版本: 3.4x.x
```

**如果不可用：**

```text
better-sqlite3 的预编译二进制默认带 FTS5
如果报错，说明你用的是系统自带的旧版 SQLite
→ npm rebuild better-sqlite3
→ 如果还不行，重装：npm i better-sqlite3 --build-from-source
```

## 0.2 今天要解决什么

```text
昨天的 LIKE '%裂%'：41ms（10 万行）
今天的目标：< 10ms

而且还要能：
① 搜多个词（"杯子 裂" 两个词都要有）
② 按相关度排序（匹配得多的排前面）
③ 支持中文（这是最大的坑）
```

## 0.3 一个必须先知道的事实

**FTS5 默认不支持中文分词。**

```text
英文：I bought a broken cup
  → 按空格切成 [I, bought, a, broken, cup]
  → 能搜 "broken"

中文：我买的杯子裂了
  → 中间没有空格，切不出来
  → 整句变成一个"词"
  → 搜 "杯子" 搜不到
```

**三个解法：**

```text
① 用 trigram 分词器（SQLite 3.34+，按 3 字符切）
   → "我买的杯子" → [我买的, 买的杯, 的杯子]
   → 搜 "杯子" 能命中
   → 最简单，推荐

② 自己写分词（用 jieba 等库）
   → 效果好，但要装依赖

③ 按字切（unicode61 + 自建映射）
   → 复杂，不推荐
```

**今天用 ① trigram。**

---

# 第 1 步：先量出 LIKE 的真实曲线（20 分钟）

## 1.1 四种 LIKE 写法

```javascript
// scripts/bench-like.js
import { db } from "../app/lib/db.js";

function time(label, sql, params, n = 20) {
  const stmt = db.prepare(sql);
  for (let i = 0; i < 3; i++) stmt.all(...params);

  const lat = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    stmt.all(...params);
    lat.push(performance.now() - t0);
  }
  lat.sort((a, b) => a - b);
  console.log(
    label.padEnd(38) +
    `P50 ${lat[Math.floor(lat.length * 0.5)].toFixed(2)}ms`.padStart(18)
  );
}

console.log("LIKE 的四种写法（10 万行）\n");

time("LIKE '裂%'（前缀）",
  "SELECT * FROM tickets WHERE input LIKE ? LIMIT 20", ["裂%"]);

time("LIKE '%裂'（后缀）",
  "SELECT * FROM tickets WHERE input LIKE ? LIMIT 20", ["%裂"]);

time("LIKE '%裂%'（包含）",
  "SELECT * FROM tickets WHERE input LIKE ? LIMIT 20", ["%裂%"]);

time("LIKE '%裂%' + 无结果",
  "SELECT * FROM tickets WHERE input LIKE ? LIMIT 20", ["%不存在的词%"]);

time("LIKE '%裂%' + COUNT",
  "SELECT COUNT(*) c FROM tickets WHERE input LIKE ?", ["%裂%"]);
```

## 1.2 你会看到

```text
LIKE '裂%'（前缀）               P50  0.31ms    ← 走索引！
LIKE '%裂'（后缀）               P50 41.28ms    ← 全表扫
LIKE '%裂%'（包含）              P50 41.28ms    ← 全表扫
LIKE '%裂%' + 无结果             P50 48.91ms    ← 更慢（要扫完）
LIKE '%裂%' + COUNT              P50 44.12ms
```

**四个关键结论：**

**① 前缀匹配（`'裂%'`）能用索引！**

```text
如果有 (input) 索引：
  LIKE '裂%' → SEARCH USING INDEX (input>? AND input<?)
  → 0.31ms
```

**但昨天我们删掉了这个索引**（因为 `'%裂%'` 用不上）。**如果你只做前缀搜索，加回来是有用的。**

**② 后缀和包含都是全表扫，41ms**

**③ 无结果比有结果更慢**（48ms vs 41ms）

```text
有结果：扫到第 20 条命中就停（LIMIT 20）
无结果：扫完 10 万行才知道没有
```

**④ `COUNT` + `LIKE` 是双重灾难**

```text
44ms，而且如果用户连打几个字就发一次请求
→ 每次都 44ms
→ 输入框卡顿
```

## 1.3 一个必须算的数

```text
用户输入"杯子"（2 个字）
如果每输入一个字就搜一次：
  输"杯"  → 41ms
  输"杯子" → 41ms
  两次 = 82ms

如果输入"内胆裂了"（4 个字）：
  4 次搜索 = 164ms
  → 输入框明显卡顿
```

**解法有两个层次：**

```text
① 防抖（前端 300ms 后才发请求）—— 治标
② FTS5（把 41ms 降到 8ms）—— 治本
```

**两个都要做。**

---

# 第 2 步：建 FTS5 表（35 分钟）★ 核心

## 2.1 三种 FTS 表结构

**方案 A：独立 FTS 表（简单，但要手动同步）**

```sql
CREATE VIRTUAL TABLE tickets_fts USING fts5(
  input,
  content='tickets',        -- 内容来自 tickets 表
  content_rowid='id',       -- 用 tickets.id 关联
  tokenize='trigram'
);
```

**方案 B：外部内容表 + 触发器（推荐）**

```sql
CREATE VIRTUAL TABLE tickets_fts USING fts5(
  input,
  content='tickets',
  content_rowid='id',
  tokenize='trigram'
);

-- 三个触发器保持同步
CREATE TRIGGER tickets_ai AFTER INSERT ON tickets BEGIN
  INSERT INTO tickets_fts(rowid, input) VALUES (new.id, new.input);
END;

CREATE TRIGGER tickets_ad AFTER DELETE ON tickets BEGIN
  INSERT INTO tickets_fts(tickets_fts, rowid, input) VALUES ('delete', old.id, old.input);
END;

CREATE TRIGGER tickets_au AFTER UPDATE ON tickets BEGIN
  INSERT INTO tickets_fts(tickets_fts, rowid, input) VALUES ('delete', old.id, old.input);
  INSERT INTO tickets_fts(rowid, input) VALUES (new.id, new.input);
END;
```

**方案 C：内容表 + 手动维护（最灵活，但容易漏）**

```sql
CREATE VIRTUAL TABLE tickets_fts USING fts5(
  input,
  tokenize='trigram'
);
```

**你的场景：选 B。**

```text
理由：
① 自动同步（不会漏）
② 不重复存 input（省空间，content='tickets' 表示"内容从 tickets 表读"）
③ 代码不用改（insertTicket 不用加额外调用）
```

## 2.2 加进 migrate

```javascript
// app/lib/db.js 的 migrate() 里
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
    input,
    content='tickets',
    content_rowid='id',
    tokenize='trigram'
  );

  CREATE TRIGGER IF NOT EXISTS tickets_ai AFTER INSERT ON tickets BEGIN
    INSERT INTO tickets_fts(rowid, input) VALUES (new.id, new.input);
  END;

  CREATE TRIGGER IF NOT EXISTS tickets_ad AFTER DELETE ON tickets BEGIN
    INSERT INTO tickets_fts(tickets_fts, rowid, input) VALUES ('delete', old.id, old.input);
  END;

  CREATE TRIGGER IF NOT EXISTS tickets_au AFTER UPDATE ON tickets BEGIN
    INSERT INTO tickets_fts(tickets_fts, rowid, input) VALUES ('delete', old.id, old.input);
    INSERT INTO tickets_fts(rowid, input) VALUES (new.id, new.input);
  END;
`);
```

## 2.3 逐段解释四个关键点

**① `content='tickets'` 和 `content_rowid='id'` 是干什么的**

```text
这两个参数让 FTS 表变成"外部内容表"：
  · FTS 表只存"分词后的索引"，不存原文
  · 原文从 tickets 表读（用 rowid 关联到 tickets.id）
  · 省空间（索引比原文小）
  · 但查询时要 JOIN 回 tickets 表
```

**如果不用外部内容表，FTS 表会再存一份完整的 input，磁盘翻倍。**

**② 为什么 UPDATE 触发器要先 delete 再 insert**

**FTS5 的更新语义是"删旧的 + 插新的"。** 没有 `UPDATE` 语句。

```sql
-- 正确
INSERT INTO tickets_fts(tickets_fts, rowid, input) VALUES ('delete', old.id, old.input);
INSERT INTO tickets_fts(rowid, input) VALUES (new.id, new.input);

-- 错误（会留下旧索引）
INSERT INTO tickets_fts(rowid, input) VALUES (new.id, new.input);
```

**③ 为什么 DELETE 触发器也要传 old.input**

```sql
INSERT INTO tickets_fts(tickets_fts, rowid, input) VALUES ('delete', old.id, old.input);
```

**FTS5 需要知道"要删的那条原文是什么"，才能从倒排索引里移除对应的词。**

**不给 `old.input` 会删不掉。**

**④ 为什么用 `tokenize='trigram'`**

```text
trigram = 按 3 个字符切
"我买的杯子裂了" → [我买的, 买的杯, 的杯子, 杯子裂, 子裂了]
搜 "杯子" → trigram 会匹配 "的杯子" 和 "杯子裂"
→ 能命中
```

**要求：SQLite ≥ 3.34。你的版本是 3.4x，够。**

**注意：trigram 有个限制 —— 搜索词必须 ≥ 3 个字符。**

```text
搜 "杯子"（2 字）→ trigram 无法匹配 ❌
搜 "内胆裂"（3 字）→ 能匹配 ✅
```

**这是个硬限制。** 处理办法：

```text
① 前端要求至少输入 3 个字
② 或者：2 字时回退到 LIKE（但 2 字搜索本来就是模糊的，结果集大）
③ 或者：用别的分词器（要装依赖）
```

**我们选 ①：搜索框提示"至少输入 2 个字"，但 2 字时走 LIKE（快，因为结果集小，LIMIT 20 会早停）。**

**等等 —— 2 字走 LIKE 是全表扫 41ms。** 更好的办法：

```text
2 字时：用 FTS5 搜 "杯子杯"（补一个字）→ 能匹配 trigram
```

**太 hack。** 实际做法：

```text
① 搜索框最小 2 字
② 2 字时用 LIKE（41ms，可接受，因为用户不会频繁搜 2 字）
③ 3 字以上用 FTS5（8ms）
```

**或者最简单：全部要求 ≥ 3 字。** 你的客户投诉文本通常都够长。

## 2.4 回填已有数据

**触发器只管"以后"的数据。已有的 10 万行要手动回填：**

```sql
INSERT INTO tickets_fts(tickets_fts) VALUES('rebuild');
```

```javascript
// app/lib/db.js 里加一个函数
export function rebuildFts() {
  const t0 = Date.now();
  db.exec(`INSERT INTO tickets_fts(tickets_fts) VALUES('rebuild')`);
  const ms = Date.now() - t0;
  console.log(`FTS 重建完成，耗时 ${ms}ms`);
  return ms;
}
```

```bash
NODE_ENV=development node -e "
import('./app/lib/db.js').then(({ migrate, rebuildFts, db }) => {
  migrate();
  rebuildFts();
  console.log('FTS 行数:', db.prepare('SELECT COUNT(*) c FROM tickets_fts').get().c);
});
"
```

**10 万行重建约 1–3 秒。**

**注意：`rebuild` 是"清空 + 重新索引"。所以在"首次建表"或"数据大量变更"后跑。**

## 2.5 验证能搜到

```javascript
// scripts/test-fts.js
import { db } from "../app/lib/db.js";

function search(q, limit = 5) {
  return db.prepare(`
    SELECT t.id, t.input
    FROM tickets_fts f
    JOIN tickets t ON t.id = f.rowid
    WHERE tickets_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(q, limit);
}

for (const q of ["内胆裂", "杯子裂", "屏幕坏", "充不进电"]) {
  const rows = search(q);
  console.log(`\n搜 "${q}"：命中 ${rows.length} 条`);
  rows.slice(0, 2).forEach((r) => console.log(`  ${r.id}  ${r.input.slice(0, 40)}`));
}
```

**跑它。如果全部 0 条命中，检查：**

```text
① 回填跑了吗（rebuildFts）
② 搜索词是否 ≥ 3 字
③ MATCH 的语法（见下面）
```

---

# 第 3 步：MATCH 的语法（25 分钟）

## 3.1 五种查询写法

```sql
-- ① 单个词
... WHERE tickets_fts MATCH 'broken'

-- ② 多个词（OR）
... WHERE tickets_fts MATCH 'broken OR crack'

-- ③ 多个词（AND，都要有）
... WHERE tickets_fts MATCH 'broken AND crack'

-- ④ 短语（连续出现）
... WHERE tickets_fts MATCH '"broken cup"'

-- ⑤ 前缀
... WHERE tickets_fts MATCH 'brok*'
```

**中文 + trigram 时：**

```sql
-- 搜"内胆裂"（3 字）→ 直接写
MATCH '内胆裂'

-- 搜"内胆"（2 字）→ trigram 匹配不到 → 0 结果
MATCH '内胆'       -- ❌

-- 多个中文词（AND）
MATCH '内胆 AND 裂'
```

## 3.2 一个安全的封装

**用户输入的搜索词不能直接拼进 MATCH**（会语法错误，或者被注入）。

```javascript
// app/repos/search.js
import { db } from "../lib/db.js";

/**
 * 把用户输入变成 FTS5 的 MATCH 表达式。
 * 规则：按空格切词，每个词加双引号（防语法错误），默认 AND。
 */
export function buildMatchExpr(q) {
  const terms = String(q ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // 转义双引号（FTS5 里 " 要写成 ""）
    .map((t) => `"${t.replace(/"/g, '""')}"`);

  if (!terms.length) return null;

  // 单字（< 3 字符）不参与 trigram 匹配 → 直接判"太短"
  return terms.join(" AND ");
}

export function searchTickets({ q, limit = 20, cursor = null }) {
  const expr = buildMatchExpr(q);
  if (!expr) return { rows: [], hasMore: false, nextCursor: null, tooShort: true };

  const params = [expr];
  let cursorWhere = "";
  if (cursor) {
    const [ts, id] = String(cursor).split("_").map(Number);
    cursorWhere = "AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))";
    params.push(ts, ts, id);
  }
  params.push(limit + 1);

  const rows = db.prepare(`
    SELECT t.*, rank
    FROM tickets_fts f
    JOIN tickets t ON t.id = f.rowid
    WHERE tickets_fts MATCH ?
      ${cursorWhere}
    ORDER BY rank, t.created_at DESC, t.id DESC
    LIMIT ?
  `).all(...params);

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();
  const last = rows[rows.length - 1];

  return {
    rows,
    hasMore,
    nextCursor: hasMore && last ? `${last.created_at}_${last.id}` : null,
  };
}
```

## 3.3 逐段解释三个关键点

**① 为什么每个词都要加双引号**

```javascript
// ❌ 危险：用户输入 "a AND" 会变语法错误
MATCH `a AND`

// ❌ 危险：用户输入 "OR *" 会让所有词变成 OR
MATCH `OR *`

// ✅ 安全：加引号变"短语"，语法字符失效
MATCH `"a AND"`
```

**FTS5 里 `"a AND"` 是一个"包含 AND 这个词的短语"，不会被解释为运算符。**

**② 为什么用 AND 而不是 OR 默认**

```text
用户搜"杯子 裂"
  用 OR → 匹配所有含"杯子"或"裂"的（可能几万条）
  用 AND → 只匹配同时含两个词的（几十条）

用户的意图是 AND（"我要找杯子且裂的"）。
```

**如果用户想 OR，他可以自己加（但你的 UI 不支持，这是可接受的简化）。**

**③ 为什么 `ORDER BY rank` 在 `created_at` 之前**

```text
rank 是 FTS5 的相关度（越小越相关）
先按相关度，同相关度再按时间
→ 用户看到"最匹配的"而不是"最新的"
```

**如果用户想按时间，可以加一个 `sort=time` 参数切到 `ORDER BY created_at DESC`。**

## 3.4 一个必须处理的边界

**搜索词 < 3 字（trigram 限制）：**

```javascript
export function searchTickets({ q, ... }) {
  const trimmed = String(q ?? "").trim();

  // trigram 要求每个词 ≥ 3 字符
  if (trimmed.length > 0 && trimmed.length < 3) {
    return { rows: [], hasMore: false, nextCursor: null, tooShort: true, minLen: 3 };
  }
  ...
}
```

**路由层返回明确的提示：**

```javascript
if (result.tooShort) {
  return res.status(400).json({
    ok: false,
    code: "BAD_INPUT",
    message: "搜索词至少 3 个字",
    hint: `你输入了 ${q.length} 个字`,
    trace_id: req.traceId,
  });
}
```

**为什么要报错而不是"回退到 LIKE"？**

```text
回退到 LIKE → 41ms，且结果集巨大（2 个字的搜索会命中几万条）
             → 用户看到一堆不相关的结果
             → 而且你没告诉他"这次搜索比较慢"

报错 → 用户知道该输入更多字
     → 他的下一次搜索更快更准
```

**"拒绝"是更好的产品设计。**

---

# 第 4 步：量 FTS5 的性能（20 分钟）

```javascript
// scripts/bench-fts.js
import { db } from "../app/lib/db.js";
import { searchTickets } from "../app/repos/search.js";

function time(label, fn, n = 20) {
  for (let i = 0; i < 3; i++) fn();
  const lat = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    lat.push(performance.now() - t0);
  }
  lat.sort((a, b) => a - b);
  const p = (q) => lat[Math.floor(lat.length * q)];
  console.log(
    label.padEnd(30) +
    `P50 ${p(0.5).toFixed(2)}ms`.padStart(15) +
    `  P95 ${p(0.95).toFixed(2)}ms`
  );
}

console.log("FTS5 vs LIKE（10 万行）\n");

const QUERIES = ["内胆裂", "杯子裂", "屏幕坏", "充不进电", "不存在的词"];

for (const q of QUERIES) {
  console.log(`\n搜 "${q}"：`);

  time("  LIKE '%q%'",
    () => db.prepare("SELECT * FROM tickets WHERE input LIKE ? LIMIT 20").all(`%${q}%`));

  time("  FTS5 MATCH",
    () => searchTickets({ q, limit: 20 }));
}
```

**期望输出：**

```text
搜 "内胆裂"：
  LIKE '%q%'         P50 41.28ms  P95 48.91ms
  FTS5 MATCH         P50  0.82ms  P95  1.24ms

搜 "杯子裂"：
  LIKE '%q%'         P50 41.12ms  P95 47.32ms
  FTS5 MATCH         P50  0.64ms  P95  0.98ms

搜 "不存在的词"：
  LIKE '%q%'         P50 48.91ms  P95 55.21ms
  FTS5 MATCH         P50  0.11ms  P95  0.19ms
```

**三个关键对比：**

```text
① 有结果：41ms → 0.8ms（快 50 倍）
② 无结果：49ms → 0.1ms（快 490 倍！）
③ 无结果比有结果快 7 倍（因为倒排索引直接查到"没有"）
```

**第 ② 条最值钱** —— "搜不到"是最常见的搜索场景（用户打错字、搜不存在的词）。

## 4.1 一个必须算的存储代价

```bash
ls -lh data/dev.db
```

**加 FTS 之前 / 之后：**

```text
加之前：30 MB
加之后：____ MB（预计 +10~15 MB）
```

**为什么 FTS 索引比表小？**

```text
trigram 把 100 字切成 98 个 3-gram，但有很多重复
→ 倒排索引存"每个唯一 3-gram → 哪些行"
→ 唯一 3-gram 可能只有几千个
→ 索引大小约等于原文的 40%
```

## 4.2 一个必须做的实验：搜索质量

**光快没用，还得准。**

```javascript
// scripts/test-search-quality.js
import { searchTickets } from "../app/repos/search.js";

const CASES = [
  { q: "内胆裂", expectAny: ["内胆", "裂"] },
  { q: "屏幕坏点", expectAny: ["屏幕", "坏点"] },
  { q: "充不进电", expectAny: ["充电", "充不进"] },
  { q: "杯子碎", expectAny: ["杯子", "碎"] },
];

for (const c of CASES) {
  const { rows } = searchTickets({ q: c.q, limit: 5 });
  const ok = rows.some((r) => c.expectAny.some((w) => r.input.includes(w)));
  console.log(`${ok ? "✅" : "❌"} "${c.q}" 命中 ${rows.length} 条`);
  if (!ok && rows.length) console.log(`   首条：${rows[0].input.slice(0, 40)}`);
}
```

**四个都 ✅ 说明"能搜到相关的"。**

**如果某条 ❌，说明 trigram 切分和你的预期不一致** —— 通常是搜索词里有"非连续字符"（trigram 要求 3 个字符连续出现）。

---

# 第 5 步：接进接口（15 分钟）

```javascript
// app/routes/tickets.js
import { searchTickets } from "../repos/search.js";

ticketsRouter.get("/search", wrap(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const cursor = req.query.cursor ?? null;

  if (!q) fail("BAD_INPUT", { detail: "q 不能为空" });
  if (q.length < 3) {
    fail("BAD_INPUT", {
      detail: `q 长度 ${q.length}，至少 3 个字`,
      extra: { hint: "搜索词至少 3 个字，例如「内胆裂」" },
    });
  }

  const r = searchTickets({ q, limit, cursor });

  log.info("search", { trace_id: req.traceId, q_len: q.length, hits: r.rows.length });

  res.json({
    ok: true,
    trace_id: req.traceId,
    data: r.rows,
    has_more: r.hasMore,
    next_cursor: r.nextCursor,
  });
}));
```

**注意 `log.info("search", { q_len: q.length, ... })`** —— **不记搜索词本身**（可能是 PII，第 132 节的规矩）。

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **LIKE 四种写法的耗时**
- **FTS5 的耗时对比（有结果 / 无结果）**
- **trigram 的 3 字限制你怎么处理**
- **存储代价**

---

# 第 7 步：课后练习

## 练习一：加"按时间排序"选项（25 分钟）

```text
默认：ORDER BY rank（相关度）
可选：?sort=time → ORDER BY created_at DESC
```

**实现时注意：**

```javascript
const orderBy = sort === "time"
  ? "t.created_at DESC, t.id DESC"
  : "rank, t.created_at DESC, t.id DESC";
```

**但 `rank` 是 FTS5 的虚拟列，在 `ORDER BY` 里能用，在 `WHERE` 里不能用。**

**验证两种排序的结果差异（前 5 条应该不同）。**

## 练习二：给"分类 + 搜索"组合（20 分钟）

```text
GET /api/search?q=内胆裂&category=quality
```

**实现：**

```sql
SELECT t.*, rank
FROM tickets_fts f
JOIN tickets t ON t.id = f.rowid
WHERE tickets_fts MATCH ?
  AND t.category = ?
ORDER BY rank
LIMIT ?
```

**量一下：加了 `category` 条件后，是变快还是变慢？**

**答案：变慢（因为 FTS 先匹配，再过滤）。**

**如果 `category` 的选择性很高（比如只占 1/6），可以先过滤再匹配：**

```sql
-- 但 SQLite 不一定按你想要的顺序执行
-- 用 EXPLAIN 看它实际怎么做
```

**这个练习让你体会：** "两个索引同时用"往往不如"用一个 + 过滤"，因为优化器只能选一个主索引。

## 练习三：判断这个 FTS 方案错在哪（15 分钟）

```sql
CREATE VIRTUAL TABLE tickets_fts USING fts5(input);

-- 搜索
SELECT * FROM tickets_fts WHERE tickets_fts MATCH '%内胆裂%';
```

**错在哪？至少四条。**

**参考答案：**

```text
① 没有 content='tickets' → FTS 表存了完整副本（磁盘翻倍）
② 没有触发器 → 新插入的数据搜不到
③ MATCH 里用 % 是错的 → FTS5 的 MATCH 不用 LIKE 通配符
   → '%内胆裂%' 会被当成"包含 % 字符的短语"，0 结果
④ 没有 tokenize → 默认 unicode61 → 中文整句变一个词 → 搜不到
⑤ 没有 JOIN 回 tickets → 只能拿到 input，拿不到 category 等字段
⑥ 没有 ORDER BY rank → 结果是随机的
```

**第 ③ 条最典型：** 你会下意识地把 `LIKE '%x%'` 的写法搬到 `MATCH` 里，**然后得到 0 结果，且不知道为什么**。

---

# 第 8 步：最终验收

## A. FTS5 可用

- [ ] `check-fts5.js` 输出"✅ FTS5 可用"
- [ ] SQLite 版本 ≥ 3.34（trigram 需要）

## B. LIKE 的四种写法

| 写法 | P50 | 说明 |
|---|---|---|
| `'裂%'` | __ms | 走索引 |
| `'%裂'` | __ms | 全表扫 |
| `'%裂%'` | __ms | 全表扫 |
| `'%不存在的词%'` | __ms | **最慢**（要扫完） |

- [ ] 我实测了四种
- [ ] 我知道"无结果比有结果慢"（因为 LIMIT 20 会早停）

## C. FTS 表结构

- [ ] `content='tickets'`（不重复存原文）
- [ ] `content_rowid='id'`
- [ ] `tokenize='trigram'`
- [ ] 三个触发器（insert / delete / update）
- [ ] `rebuildFts()` 能回填历史数据
- [ ] 回填后 `COUNT(*) FROM tickets_fts` = 100000

## D. MATCH 语法

- [ ] `buildMatchExpr` 给每个词加双引号
- [ ] 默认用 `AND` 连接
- [ ] 转义了输入里的双引号（`"` → `""`）
- [ ] 我知道 `MATCH '%x%'` 是错的（不能用 LIKE 通配符）

## E. 性能

| 查询 | LIKE | FTS5 | 倍数 |
|---|---|---|---|
| 有结果 | __ms | __ms | |
| 无结果 | __ms | __ms | |

- [ ] 有结果快 ≥ 20 倍
- [ ] **无结果快 ≥ 100 倍**

## F. trigram 的 3 字限制

- [ ] 我知道 < 3 字搜不到
- [ ] 我选了处理方式：`[ ] 报错 [ ] 回退 LIKE [ ] 前端限制`
- [ ] 错误提示里有 `hint` 说明"至少 3 个字"

## G. 存储代价

- [ ] 加 FTS 前 __ MB
- [ ] 加 FTS 后 __ MB
- [ ] 增幅 __ MB

## H. 搜准了

- [ ] `test-search-quality.js` 四条全 ✅
- [ ] 结果按 `rank` 排序（相关度）
- [ ] 分页用的是 keyset（复用第 151 节）

## I. 提交

```bash
git add -A
git commit -m "第152节：FTS5搜索，41ms→0.8ms，trigram分词"
git push
```

---

## 本节课要能说出口的一句话

> **`LIKE '%x%'` 加任何索引都没用 —— 索引按前缀排序，前置通配符把排序信息废掉了。唯一出路是倒排索引。**

---

# 附：常见问题速查

**Q：为什么 `LIKE '裂%'` 能用索引，`'%裂'` 不能？**

A：**因为索引按字符串"从前往后"排序。**

```text
索引里的顺序：
  杯子裂了
  杯子碎了
  内胆裂了

LIKE '杯子%' → 能定位到"以杯子开头"的那一段 ✅
LIKE '%裂了' → "以裂了结尾"，在索引里散落在各处 ❌
```

**这也是为什么"前缀搜索"是个便宜的功能，而"包含搜索"必须上 FTS。**

**Q：`MATCH '%内胆裂%'` 为什么 0 结果？**

A：**因为 `MATCH` 的语法里 `%` 不是通配符，是普通字符。**

```sql
-- 它会去找"包含 % 符号和'内胆裂'这个短语"的文档 → 0 结果
MATCH '%内胆裂%'

-- 正确
MATCH '内胆裂'
```

**FTS5 里 `*` 是前缀通配符（`内胆*`），不是 `%`。**

**Q：trigram 要求 3 个字，用户搜 2 个字怎么办？**

A：**三个选择，我推荐第 3 个：**

```text
① 报错"至少 3 个字"（最干净，但用户体验轻微摩擦）
② 回退 LIKE（41ms，结果集巨大）
③ 要求 3 字，但把提示做得明确（"搜索词至少 3 个字，例如「内胆裂」"）
```

**为什么不用 ②？**

```text
2 个字的搜索会命中几万条（"杯子"可能出现在一半的记录里）
→ 用户看到一堆不相关的
→ 而且 41ms 会让输入框卡
```

**Q：`rebuild` 会很慢吗？**

A：**10 万行约 1–3 秒。100 万行约 15–30 秒。**

**什么时候需要 rebuild？**

```text
① 首次建 FTS 表
② 手动批量改了 input（绕过触发器）
③ 怀疑索引损坏
```

**正常写入（走触发器）不需要 rebuild。**

**Q：触发器会影响写入性能吗？**

A：**会。**

```text
无 FTS：单条 INSERT 1.24ms
有 FTS：单条 INSERT 约 1.9ms（+50%）
```

**因为每次 INSERT 要更新倒排索引。** 这是"搜索快"的代价。

**验证：跑第 148 节的 `profile-write.js`。**

**Q：搜索结果里能看到"高亮片段"吗？**

A：**能，用 `snippet()` 函数：**

```sql
SELECT
  t.id,
  snippet(tickets_fts, 0, '<b>', '</b>', '…', 20) AS highlight,
  t.created_at
FROM tickets_fts f JOIN tickets t ON t.id = f.rowid
WHERE tickets_fts MATCH ?
ORDER BY rank LIMIT 20;
```

**输出：**

```html
…我买的<b>内胆</b><b>裂</b>了，发票还在…
```

**前端直接渲染（注意 XSS：`<b>` 是你加的，但原文要转义）。**

**Q：为什么"无结果"比"有结果"快 490 倍？**

A：**因为倒排索引的查找是 O(log n)。**

```text
搜"不存在的词"：
  在倒排索引里找 → 找不到 → 立刻返回空
  → 0.1ms

LIKE '%不存在的词%'：
  逐行比对 10 万个 input
  → 49ms
```

**"搜不到"是最常见的场景**（打错字、搜不存在的东西），所以这个优化收益最大。
