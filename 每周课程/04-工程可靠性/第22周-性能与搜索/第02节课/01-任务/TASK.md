# 第 149 节课：索引

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天把昨天那五个 `SCAN` 改成 `SEARCH`。**而且你要亲手体验一次"加错索引反而更慢"。**
> 后半句才是重点 —— 加索引不难，加对才难。

**建议用时**：130 分钟
**你需要先完成**：第 148 节的 `PERF-BASELINE.md`（10 万行数据还在）
**今天要装**：什么都不用装

---

# 第 0 步：先看清索引是什么（20 分钟）

## 0.1 一个必须建立的心智模型

**没有索引时，数据库找一行 = 逐页翻书。**

```text
查 WHERE category='quality' 的第 1 条：
  读第 1 行 → 不是 → 读第 2 行 → 不是 → ...
  直到读到第 N 行命中
  要读 100000 次（最坏）
```

**有索引时 = 先查目录。**

```text
索引是一棵排好序的树：
  quality → [行 3, 行 17, 行 42, ...]
  refund  → [行 5, 行 88, ...]

查 WHERE category='quality'：
  在树里找 "quality"（约 17 次比较，log2(100000)）
  → 直接拿到行号列表
  → 按行号取数据
```

**从 100000 次降到 17 次。** 这就是几百倍的来源。

## 0.2 一个反直觉的事实

**索引本身也占空间、也要维护。**

```text
表 10 万行，30MB
加 1 个索引 → +2MB
加 5 个索引 → +10MB（表大小的 1/3）

每次 INSERT：
  写表 1 次
  + 每个索引都要插入一个键
  → 5 个索引 = 写 6 次
```

**这就是"索引越多越慢"的原因。** 不是查询慢，是写入慢。

## 0.3 今天的路线

```text
① 先看五个 SCAN 各需要什么索引
② 一个一个加，每加一个立刻量
③ 故意加一个"错的"索引，看它为什么不生效
④ 故意加五个索引，看写入慢多少
⑤ 删掉没用的，留下三个
```

**第 ⑤ 步最重要。** 大部分人停在 ④。

---

# 第 1 步：五个 SCAN 各需要什么（25 分钟）

## 1.1 回到昨天的 EXPLAIN

```bash
NODE_ENV=development node scripts/explain.js
```

**你昨天的输出：**

```text
=== COUNT(*) ===
  SCAN tickets

=== ORDER BY created_at ===
  SCAN tickets
  USE TEMP B-TREE FOR ORDER BY

=== offset=20000 ===
  SCAN tickets
  USE TEMP B-TREE FOR ORDER BY

=== GROUP BY category ===
  SCAN tickets
  USE TEMP B-TREE FOR GROUP BY

=== WHERE category ===
  SCAN tickets

=== LIKE 前置 ===
  SCAN tickets
```

## 1.2 逐个分析：哪些能救，哪些不能

**建一个表：**

| 查询 | 现在的计划 | 索引能救吗 | 需要什么索引 |
|---|---|---|---|
| `COUNT(*)` | SCAN | **部分** | 任意索引都行（覆盖索引更快） |
| `ORDER BY created_at DESC LIMIT 20` | SCAN + TEMP B-TREE | **能** | `(created_at)` |
| `... OFFSET 20000` | SCAN + TEMP B-TREE | **只能救一半** | `(created_at)` 让扫描变快，但还是要跳 2 万行 |
| `GROUP BY category` | SCAN + TEMP B-TREE | **能** | `(category)` |
| `WHERE category='quality'` | SCAN | **能** | `(category)` |
| `LIKE '%裂%'` | SCAN | **不能** | 索引对前置通配符无效，要 FTS5（第 152 节） |

## 1.3 逐条解释"为什么"

**① `COUNT(*)` 能被索引部分救**

```text
SQLite 的 COUNT(*) 会选"最小的索引"来数（因为它比表窄）
如果有一个 (category) 索引，它会扫那个索引而不是表
→ 从 28ms 降到 8ms（索引小 3.5 倍）
→ 但还是 O(n)，不是 O(1)
```

**所以"加索引让 COUNT 变快"只能快 3 倍，不能快 100 倍。真正的解法是第 150 节的"别每次都数"。**

**② `ORDER BY created_at` 能被索引完全救**

```text
有 (created_at) 索引时：
  索引本身就是按 created_at 排序的
  → 从末尾往前读 20 个
  → 不需要扫全表，也不需要排序

从 "SCAN + TEMP B-TREE" → "SCAN ... USING INDEX ... ORDER BY"
时间从 31ms → 0.3ms
```

**③ `OFFSET 20000` 只能救一半**

```text
有 (created_at) 索引：
  还是要跳过前 20000 个索引项
  → 20000 次索引项读取（比读表行快，但还是要读）

从 62ms → 12ms
→ 快 5 倍，但第 1000 页还是比第 1 页慢
→ 这就是第 151 节要换 keyset 分页的原因
```

**④ `GROUP BY category` 能被索引救**

```text
有 (category) 索引：
  同类的行在索引里是连续的
  → 顺序扫索引，遇到新值就切换
  → 不需要临时 B-tree

从 29ms → 2ms
```

**⑤ `WHERE category='quality'` 能被索引救**

```text
有 (category) 索引：
  直接定位到 quality 那一段
  → 读前 20 条就够
  → 0.3ms
```

**⑥ `LIKE '%裂%'` 救不了**

```text
索引是"按前缀排序"的
'%裂%' 要匹配"任意位置含裂"
→ 索引里的排序信息完全用不上
→ 只能全表扫

唯一出路：FTS5 全文索引（第 152 节）
```

## 1.4 一个必须现在就接受的结论

**加索引能让五个 SQL 里的四个变快，但：**

```text
· COUNT(*) 只能快 3 倍（真解法是"别数"）
· OFFSET 大页只能快 5 倍（真解法是 keyset）
· LIKE '%x%' 完全救不了（真解法是 FTS5）
```

**索引不是万能药。** 这一周后面三节都在讲"索引救不了的部分怎么办"。

---

# 第 2 步：一个一个加（40 分钟）★ 核心

## 2.1 先加 `(created_at)` 索引

```javascript
// app/lib/db.js 的 migrate() 里加
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tickets_created
    ON tickets(created_at);
`);
```

**注意：`IF NOT EXISTS` 很重要** —— 让你可以重复跑 migrate。

**跑一次：**

```bash
NODE_ENV=development node -e "
import('./app/lib/db.js').then(({ migrate, db }) => {
  const t0 = Date.now();
  migrate();
  console.log('建索引耗时', Date.now() - t0, 'ms');
  console.log('库大小', (require('node:fs').statSync('./data/dev.db').size / 1e6).toFixed(1), 'MB');
});
"
```

**10 万行建一个索引约 200–400ms。**

**立刻量：**

```bash
NODE_ENV=development node scripts/profile-api.js
```

**看这两行变化：**

```text
                                     改之前     改之后
ORDER BY created_at DESC LIMIT 20    31.87ms   ?
offset=20000                         62.14ms   ?
```

**期望：**

```text
ORDER BY → 0.3ms（快 100 倍）
offset=20000 → 12ms（快 5 倍）
```

**确认走索引：**

```bash
NODE_ENV=development node scripts/explain.js
```

**应该看到：**

```text
=== ORDER BY created_at ===
  SCAN tickets USING INDEX idx_tickets_created      ← 不再有 TEMP B-TREE
```

**注意：还是 `SCAN`，但是 `USING INDEX`。**

```text
SCAN tickets                          → 全表扫（最差）
SCAN tickets USING INDEX idx_x        → 扫索引（好，因为索引窄）
SEARCH tickets USING INDEX idx_x      → 走索引定位（最好）
```

**`ORDER BY ... LIMIT` 的场景，`SCAN USING INDEX` 就够了** —— 因为它按顺序读，读到 20 条就停。

## 2.2 再加 `(category)` 索引

```javascript
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tickets_category
    ON tickets(category);
`);
```

**量：**

```text
                                     改之前     改之后
GROUP BY category                    28.94ms   ?
WHERE category='quality'             12.31ms   ?
```

**期望：**

```text
GROUP BY → 2ms
WHERE category → 0.5ms
```

## 2.3 一个必须做的实验：加"错的"索引

**现在加一个 `(input)` 索引，然后看 `LIKE '%裂%'` 有没有变快：**

```javascript
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tickets_input ON tickets(input);
`);
```

```bash
node scripts/profile-api.js   # 看 LIKE '%裂%'
node scripts/explain.js       # 看 LIKE 的计划
```

**你会发现：**

```text
LIKE '%裂%' 耗时：41ms → 41ms（没变）
EXPLAIN：还是 SCAN tickets
```

**为什么？**

```text
索引是"按字符串前缀排序"的
'%裂%' 没有前缀
→ 优化器知道用不上
→ 直接忽略这个索引
```

**但代价是：**

```text
你多了一个 5MB 的索引
每次 INSERT 多写一次
查询一点没快
```

**这就是"加错索引"的完整代价。** 立刻删掉：

```javascript
// 不要加这行，或者
db.exec(`DROP INDEX IF EXISTS idx_tickets_input;`);
```

## 2.4 三个索引够了（暂时）

```text
idx_tickets_created   → ORDER BY created_at, 分页
idx_tickets_category  → WHERE category, GROUP BY category
（trace_id 上的 UNIQUE 是建表时自动有的，不用额外加）
```

**现在量一遍完整的 benchmark：**

```bash
NODE_ENV=development PORT=3999 node app/index.js &
sleep 2
node scripts/bench.js
```

**期望：**

```text
接口                       改之前 P95    改之后 P95
列表（第1页）               45.8ms       12ms       ← COUNT(*) 28ms 还在
列表（offset=2000）         68.9ms       14ms
列表（offset=20000）       224.6ms       ~40ms      ← OFFSET 还在
按分类统计                  148.2ms       6ms        ← 大幅改善
```

**剩下的瓶颈：**

```text
① 列表接口还有 12ms → 主要是 COUNT(*)
② offset=20000 还有 40ms → OFFSET 语义问题
```

**这两个是第 150、151 节的事。**

---

# 第 3 步：复合索引（30 分钟）★ 容易搞错

## 3.1 什么时候需要复合索引

**你有一个真实场景：**

```javascript
// 列表页要支持按分类筛选
listTickets({ limit, offset, category })
// SQL: SELECT * FROM tickets WHERE category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
```

**这个查询需要什么索引？**

```text
只用 (category) 索引：
  定位到 quality 那 1.6 万行
  然后要按 created_at 排序
  → TEMP B-TREE 排序 1.6 万行
  → 慢

用 (category, created_at) 复合索引：
  定位到 quality 段
  这个段内部已经按 created_at 排序
  → 直接取前 20 条
  → 不用排序
  → 快
```

## 3.2 加复合索引

```javascript
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tickets_cat_created
    ON tickets(category, created_at);
`);
```

**注意列的顺序：`(category, created_at)` 不是 `(created_at, category)`。**

**为什么？**

```text
复合索引的排序规则是"先按第一列，第一列相同再按第二列"

(category, created_at)：
  quality → 内部按 created_at 排  ← 这正是你要的
  refund  → 内部按 created_at 排

(created_at, category)：
  按时间排 → 同一时刻的按 category
  → 你没法"跳到 quality 段"
```

**规则：等值条件放前面，范围/排序放后面。**

## 3.3 验证

```javascript
// scripts/explain.js 加一条
["WHERE category + ORDER BY", 
 "SELECT * FROM tickets WHERE category='quality' ORDER BY created_at DESC LIMIT 20"],
```

```bash
node scripts/explain.js
```

**期望：**

```text
=== WHERE category + ORDER BY ===
  SEARCH tickets USING INDEX idx_tickets_cat_created (category=?)
```

**`SEARCH` + 没有 `TEMP B-TREE`。** 这就是最优。

**量一下：**

```javascript
time("WHERE category + ORDER BY", () =>
  db.prepare("SELECT * FROM tickets WHERE category='quality' ORDER BY created_at DESC LIMIT 20").all());
```

**期望 0.5ms。**

## 3.4 一个必须理解的概念：最左前缀

**`(category, created_at)` 这个索引，能服务哪些查询？**

| 查询 | 能用吗 | 为什么 |
|---|---|---|
| `WHERE category='x'` | ✅ | 用了第一列 |
| `WHERE category='x' ORDER BY created_at` | ✅ | 两列都用 |
| `WHERE created_at > x` | ❌ | 跳过第一列，用不上 |
| `WHERE category='x' AND created_at > y` | ✅ | 第一列等值 + 第二列范围 |
| `ORDER BY created_at` | ⚠️ 部分 | 能读但要做合并（多个 category 段） |

**核心规则：复合索引只能从第一列开始用，不能跳过。**

**这条规则解释了两件事：**

```text
① 为什么 (created_at) 单独的索引还要保留？
   → 因为 "ORDER BY created_at 全表" 这个查询用不上 (category, created_at)
   → 它跳过第一列了

② 为什么 (created_at, category) 不行？
   → 因为 "WHERE category='x'" 会跳过第一列
```

## 3.5 所以现在要几个索引

```text
idx_tickets_created           → ORDER BY created_at（全表，不筛分类）
idx_tickets_category          → 纯 GROUP BY category（不带排序）
idx_tickets_cat_created       → WHERE category + ORDER BY created_at
```

**三个索引，每个服务不同的查询形状。**

**能不能砍掉一个？**

```text
idx_tickets_category 能被 idx_tickets_cat_created 替代吗？
  → GROUP BY category（不带排序）能走 (category, created_at)
  → 能！
  → 所以可以删掉 idx_tickets_category
```

**验证：删掉它，看 GROUP BY 还快不快。**

```javascript
db.exec(`DROP INDEX IF EXISTS idx_tickets_category;`);
```

```bash
node scripts/explain.js
# GROUP BY category 应该还是 SEARCH USING INDEX idx_tickets_cat_created
```

**如果还快 → 删对了。这一步能让你少维护一个索引。**

---

# 第 4 步：故意加五个索引，看写入慢多少（25 分钟）

## 4.1 先量基准

```bash
NODE_ENV=development node scripts/profile-write.js
```

**记录：**

```text
单条 INSERT          ____ ms/次
批量（1000/事务）    ____ ms/次
```

## 4.2 加到八个索引

```javascript
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_t_urgency ON tickets(urgency);
  CREATE INDEX IF NOT EXISTS idx_t_route ON tickets(route);
  CREATE INDEX IF NOT EXISTS idx_t_degraded ON tickets(degraded);
  CREATE INDEX IF NOT EXISTS idx_t_needhuman ON tickets(need_human);
  CREATE INDEX IF NOT EXISTS idx_t_output ON tickets(output);
`);
```

**再量：**

```bash
node scripts/profile-write.js
```

**你会看到：**

```text
                3 个索引     8 个索引
单条 INSERT      1.24ms      ~3.1ms      ← 慢 2.5 倍
批量             0.021ms     ~0.052ms    ← 慢 2.5 倍
```

**而且：**

```bash
ls -lh data/dev.db
# 30MB → 55MB
```

**磁盘涨了 25MB，查询一点没快**（因为你没有这些字段的查询）。

## 4.3 清理

```javascript
db.exec(`
  DROP INDEX IF EXISTS idx_t_urgency;
  DROP INDEX IF EXISTS idx_t_route;
  DROP INDEX IF EXISTS idx_t_degraded;
  DROP INDEX IF EXISTS idx_t_needhuman;
  DROP INDEX IF EXISTS idx_t_output;
`);
```

**回量一次，确认写入回到 1.24ms。**

## 4.4 一个必须记住的数字

```text
每个多余的索引 = 写入慢 +20~30%  + 磁盘 +2~5MB
```

**三个多余索引 = 写入慢 2.5 倍。**

**这就是"索引不是越多越好"的量化证明。** 你以后不会再"给所有字段加索引"了。

---

# 第 5 步：写索引清单（20 分钟）

## 5.1 `INDEXES.md`

**这份文件必须存在，否则三个月后你不知道为什么有这些索引。**

```markdown
# 索引清单

> 每个索引都必须回答"服务于哪个查询"。答不出来的，删掉。

## 现有索引（3 个）

| 索引 | 列 | 服务的查询 | 加之前的耗时 | 加之后 |
|---|---|---|---|---|
| `sqlite_autoindex_tickets_1` | `(trace_id)` UNIQUE | `WHERE trace_id = ?` | 12ms | 0.05ms |
| `idx_tickets_created` | `(created_at)` | `ORDER BY created_at DESC LIMIT n` | 31ms | 0.3ms |
| `idx_tickets_cat_created` | `(category, created_at)` | `WHERE category=? ORDER BY created_at DESC` | 45ms | 0.5ms |

## 被删掉的索引（及原因）

| 索引 | 为什么删 |
|---|---|
| `idx_tickets_input` | `LIKE '%x%'` 用不上前置通配符，纯浪费 |
| `idx_tickets_category` | 被 `idx_tickets_cat_created` 覆盖（最左前缀） |
| `idx_t_urgency` 等 5 个 | 没有对应的查询，只让写入慢 2.5 倍 |

## 写入代价实测

| 索引数 | 单条 INSERT | 批量 INSERT | 库大小 |
|---|---|---|---|
| 3 | 1.24ms | 0.021ms | 30MB |
| 8 | 3.10ms | 0.052ms | 55MB |

## 不知道该怎么建的两种情况

**① `LIKE '%关键词%'`**
索引救不了。→ 第 152 节用 FTS5。

**② `OFFSET 20000`**
索引只能快 5 倍。→ 第 151 节用 keyset 分页。

## 怎么判断该不该新建索引

```text
① 这个查询每天跑多少次？
   < 10 次 → 不值得（优化它省下的时间不够维护成本）

② 这个查询扫多少行？
   < 1000 行 → 不需要索引（全表扫也就 0.3ms）

③ 这个查询的 WHERE/ORDER BY 是什么形状？
   写下来，按"等值在前、范围在后"排列

④ 现有索引能覆盖吗？
   看最左前缀 —— 能就不要再加
```
```

## 5.2 为什么"被删掉的"也要记

**因为三个月后你会想"要不要给 input 加索引"。**

```text
有记录 → 你看到"试过，无效，因为前置通配符" → 不再试
没记录 → 你再试一次，再浪费 20 分钟
```

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **三个索引各带来多少提升**（改之前 / 改之后）
- **加错索引的完整代价**（耗时没变，磁盘涨了）
- **八个索引时写入慢了多少**
- **为什么 `(category, created_at)` 不能反**

---

# 第 7 步：课后练习

## 练习一：给"查某人的工单"建索引（25 分钟）

**假设你要支持"查某个客户的所有工单"：**

```sql
SELECT * FROM tickets WHERE input LIKE '%13812345678%' ORDER BY created_at DESC LIMIT 20;
```

**这个查询能用索引吗？为什么？**

**参考答案：**

```text
不能。前置通配符。
而且用手机号搜是"用 LIKE 做等值匹配"，这本身就错了。
```

**正确做法：**

```text
① 给 tickets 加一列 phone（或 customer_id）
② 在写入时从 input 里提取出来
③ 给 (phone, created_at) 建索引
④ 查 WHERE phone = ? ORDER BY created_at DESC
```

**这个练习的目的是让你体会：** "查询慢"的根因有时不是缺索引，是**数据模型不对**。

## 练习二：算清"建索引要多久"（15 分钟）

```text
10 万行建一个索引 ____ ms
如果表有 100 万行，估计要 ____ 秒（大致线性）
```

**然后回答：**

```text
在生产环境给 100 万行的表加索引，会锁表多久？
→ SQLite：整个 CREATE INDEX 期间写操作被阻塞
→ 100 万行约 3–5 秒
→ 这 5 秒内所有写入请求排队
```

**这可能是个事故。** 所以：

```text
做法一：低峰期做（凌晨 3 点）
做法二：SQLite 不支持在线建索引，只能接受
做法三：先用第 30 周的 CI/CD 在预发环境测一遍耗时
```

## 练习三：判断这个索引方案错在哪（15 分钟）

```sql
CREATE INDEX idx1 ON tickets(category, urgency, need_human, created_at);
CREATE INDEX idx2 ON tickets(created_at, category);
CREATE INDEX idx3 ON tickets(urgency);
CREATE INDEX idx4 ON tickets(input);
CREATE INDEX idx5 ON tickets(output);
CREATE INDEX idx6 ON tickets(route);
```

**错在哪？至少四条。**

**参考答案：**

```text
① idx1 有 4 列 → 索引很宽（存储大、写入慢），但你的查询只用 (category, created_at)
   → 中间两列是浪费
② idx2 的列顺序反了 → "WHERE category=? ORDER BY created_at" 用不上
   → 应该 (category, created_at)
③ idx3、idx6 单列索引 → urgency/route 只有 3 个值，区分度极低
   → 扫索引还不如全表扫（优化器会忽略它）
④ idx4、idx5 给大文本建索引 → 完全无效（LIKE 用不上），而且索引巨大
⑤ 六个索引 → 写入慢 2.5 倍以上
```

**第 ③ 条最少人知道：** **基数低的列（只有几个值）不适合建单列索引。**

```text
urgency 只有 3 个值 → 索引把 10 万行分成 3 段
→ 查 urgency='high' 还是要读 3 万行
→ 和不建索引差不多
→ 优化器会忽略它（你白建）
```

**判断标准：** `COUNT(DISTINCT col) / COUNT(*) < 0.01` 的列，单列索引基本没用。

---

# 第 8 步：最终验收

## A. 五个 SCAN 的处理

| 查询 | 加索引前 | 加索引后 | EXPLAIN |
|---|---|---|---|
| `COUNT(*)` | __ms | __ms | 应该还是 SCAN（但更快） |
| `ORDER BY created_at` | __ms | __ms | `SCAN USING INDEX` |
| `offset=20000` | __ms | __ms | 部分改善 |
| `GROUP BY category` | __ms | __ms | `SEARCH USING INDEX` |
| `WHERE category` | __ms | __ms | `SEARCH USING INDEX` |
| `LIKE '%裂%'` | __ms | __ms | **还是 SCAN（正确，救不了）** |

- [ ] 四个变快了，`LIKE` 没变（这是对的）
- [ ] 每个至少快了 3 倍

## B. 三个索引

- [ ] `idx_tickets_created (created_at)`
- [ ] `idx_tickets_cat_created (category, created_at)`
- [ ] `trace_id` 的 UNIQUE（建表自带）
- [ ] 每个索引都能说出"服务于哪个查询"

## C. 最左前缀

- [ ] 我能解释为什么 `(created_at, category)` 不行
- [ ] 我验证过 `idx_tickets_category` 能被复合索引替代（删掉了）
- [ ] 我知道复合索引"不能跳过第一列"

## D. 加错索引的代价

- [ ] 给 `input` 加索引后，`LIKE` 耗时**没变**（实测）
- [ ] `EXPLAIN` 显示优化器**忽略**了这个索引
- [ ] 我把它删掉了

## E. 多索引的写入代价

- [ ] 3 个索引：单条 __ms / 批量 __ms / 库 __MB
- [ ] 8 个索引：单条 __ms / 批量 __ms / 库 __MB
- [ ] **写入慢了 __ 倍，磁盘涨了 __ MB**
- [ ] 删掉多余的，回到 3 个

## F. `INDEXES.md`

- [ ] 有现有索引表（含"服务的查询"和"改前改后"）
- [ ] 有被删索引表（含原因）
- [ ] 有写入代价实测表
- [ ] 有"怎么判断该不该建"

## G. 提交

```bash
git add -A
git commit -m "第149节：3个索引，列表P95 XXms→XXms，加错索引实测"
git push
```

---

## 本节课要能说出口的一句话

> **索引对着查询建，不是对着字段建。每个索引必须能说出"服务于哪条 SQL"。**

---

# 附：常见问题速查

**Q：`SCAN USING INDEX` 和 `SEARCH USING INDEX` 差在哪？**

A：**一个读全部，一个定位。**

```text
SCAN ... USING INDEX      顺索引从头读到尾（但索引比表窄，所以比扫表快）
SEARCH ... USING INDEX    在索引里定位到起始点，读需要的部分

ORDER BY ... LIMIT 20  → SCAN USING INDEX 就够（读完 20 条就停）
WHERE x = ?            → 需要 SEARCH
```

**看到 `SCAN USING INDEX` + 没有 `TEMP B-TREE` 就是好的。**

**Q：为什么加了索引，`COUNT(*)` 只快了 3 倍？**

A：**因为 SQLite 的 `COUNT(*)` 必须遍历。**

```text
它选最小的索引来遍历（索引比表窄 3 倍）
→ 28ms → 9ms
→ 快 3 倍，但还是 O(n)
```

**要真的快，必须"别每次都数"（第 150 节）。**

**Q：我加了 `(category)` 索引，但 `GROUP BY` 还是慢？**

A：**检查 `EXPLAIN` 有没有 `USE TEMP B-TREE FOR GROUP BY`。**

```text
如果有 → 优化器没用你的索引
  可能原因：索引统计信息过期 → 跑 `ANALYZE tickets`
  或者：你的 GROUP BY 还带了别的列

如果再没有 → 已经最优了
```

**`ANALYZE` 是"更新统计信息"，让优化器做更准的判断。10 万行跑一次约 100ms。**

**Q：复合索引的列顺序怎么定？**

A：**两条规则：**

```text
① 等值条件在前，范围/排序在后
   WHERE a=? AND b>?  →  (a, b)
   WHERE a=? ORDER BY b  →  (a, b)

② 基数高的在前（如果两个都是等值）
   WHERE status=? AND user_id=?  →  (user_id, status)
   因为 user_id 有几万个不同值，status 只有几个
```

**第 ② 条的原因是"更早缩小范围"。**

**Q：`ANALYZE` 要定期跑吗？**

A：**数据变化超过 10% 时跑一次。**

```javascript
// 在 seed 之后、或者每天低峰期
db.exec("ANALYZE");
```

**或者用 `PRAGMA optimize`（SQLite 3.18+ 会自动判断要不要 ANALYZE）：**

```javascript
db.pragma("optimize");
```

**推荐后者，一行搞定。**

**Q：为什么给 `input` 加索引完全没用？**

A：**因为 `LIKE '%裂%'` 的前缀是通配符。**

```text
索引按"字符串开头"排序
'%裂%' 要匹配"任意位置"
→ 排序信息用不上
→ 优化器直接忽略这个索引（EXPLAIN 里看不到它）
```

**唯一例外：`LIKE '裂%'`（前缀匹配）能用索引。**

**Q：怎么知道某个索引有没有被用到？**

A：**SQLite 没有"索引使用统计"。两个办法：**

```text
① 逐个 DROP 测试（笨但可靠）
   删掉一个索引 → 跑测试 → 如果变慢，说明它在用

② 读 EXPLAIN
   看查询计划里有没有 USING INDEX idx_x
```

**推荐 ①** —— 它顺便验证了"这个索引真的有用"。

**具体做法：**

```bash
# 备份库
cp data/dev.db data/dev.db.bak

# 删一个索引
node -e "import('./app/lib/db.js').then(({db}) => db.exec('DROP INDEX idx_x'))"

# 跑 benchmark
node scripts/bench.js

# 对比，决定要不要恢复
```
