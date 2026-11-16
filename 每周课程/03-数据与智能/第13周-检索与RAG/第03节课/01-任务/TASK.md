# 第 87 节课：关键词检索

> 这节课结束时，你手上有：`rag-app\search-keyword.js`（能按相关度排序、能高亮、能只返回需要的字段）、`rag-app\tools\bench-queries.js`（8 个问题的命中对照表）、`rag-app\out\keyword-baseline.md`（你的关键词检索基线数据）。

**建议用时**：110 分钟
**前置**：第 86 节课的 `data\rag.db`，`chunks` 表 10 行、`chunks_fts` 表 10 行，中文能按单字搜到

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能建两张表，`chunks` 存原文，`chunks_fts` 存索引。你验证过：

```sql
SELECT rowid FROM chunks_fts WHERE seg MATCH '报 销';
```

能查到 2 行。

**但这不叫"检索"。这叫"能搜到"。**

## 0.2 今天这个坑长什么样

> 客户问："报销住宿超标了怎么办？"
>
> 你写：
>
> ```javascript
> const hits = db.prepare("SELECT rowid FROM chunks_fts WHERE seg MATCH ?").all(q);
> ```
>
> 查出来 2 行。你把这两块原文取出来，拼进 prompt，模型答得不错。
>
> **客户很满意，问了第二个问题："那如果超标了但客户来了呢？"**
>
> 你搜"超标"，查出 3 行。**但排在第一的是《信息安全与账号管理》里的"密码超标会导致账号锁定"。**
>
> 模型拿着这段无关内容，一本正经地编了个答案。

**"能搜到"和"检索"之间差四件事：**

| 差什么 | 现在 | 需要 |
|---|---|---|
| **排序** | 查出来是表的物理顺序 | 按相关度排，最相关的在第一 |
| **多词** | 一次只能搜一个词 | "超标 客户 住宿"三个词一起搜 |
| **高亮** | 只有整块原文 | 告诉用户"这几个字在哪" |
| **截断** | 整块 700 字全给模型 | 只给命中位置周围的 200 字 |

**这四件事，FTS5 全都能做 —— 但没人告诉你语法。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| `MATCH` 查询语法 | FTS5 自己的查询表达式，不是普通的 `WHERE text = ?` | 第 1 步 |
| BM25 | 一个排序公式，算"这段文字和这个查询有多相关" | 第 2 步 |
| 关键词检索的边界 | 字面一样才能搜到，意思一样不行 | 第 5 步，这是下周向量检索的理由 |

**BM25 这个名字要记一下，但不用背公式。** 你只要知道三件事：

```text
① 它算出来是一个负数，越负越相关（不是越大越相关，这个反直觉）
② 它考虑"这个词在这段里出现几次"和"这个词在多少个块里出现过"
③ 它给"短块"加权：同样出现 3 次，500 字的块比 2000 字的块更相关
```

**第 ① 条是踩坑重灾区。** 你以后做排序，看到分数是 `-8.3` 和 `-2.1`，会本能地以为 2.1 比 8.3 好。**反了。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `search-keyword.js` | `第03节课\03-练习代码\rag-app\` | `searchKeyword(q, limit)` + 命令行入口 |
| `tools\bench-queries.js` | 同上 `tools\` | 8 个问题批量跑，输出命中对照 |
| `out\keyword-baseline.md` | 同上 `out\` | 你的关键词检索基线（下周向量检索要拿它对比） |
| `NOTES.md` | `第03节课\02-笔记\` | 第 7 步填 |

**`out\keyword-baseline.md` 是这一节最重要的产出。** 第 91 节课要做"关键词 vs 向量 vs 混合"的对比，那时候必须有一个基线。**没有基线，你的对比就是空话。**

---

# 第 1 步：先把 MATCH 语法搞明白（25 分钟）

## 1.1 做什么 / 为什么

**做什么：** 在 `tools\probe-match.js` 里把 FTS5 的查询语法一个个试一遍，看清每种写法的结果差异。

**为什么不能直接照抄一个能用的写法就走：**

因为**你不知道它的边界，就不知道什么时候它会悄悄失效。**

```javascript
// 这个写法在你的字典里"能跑"
const hits = db.prepare("SELECT rowid FROM chunks_fts WHERE seg MATCH ?").all(q);
```

**但它在这四种输入下行为完全不同：**

| 输入 | 结果 | 你会不会想到 |
|---|---|---|
| `报销` | 能查到 | 会 |
| `报销 住宿` | 能查到，但要两个词都有 | 不一定 |
| `报销 OR 住宿` | 能查到，任一即可 | 不一定 |
| `报销-流程` | **抛异常**（`-` 是语法符） | 不会 |

**最后一种会让你的接口 500。而用户输入 `报销-流程` 是很自然的动作。**

## 1.2 FTS5 的五种查询操作符

| 写法 | 含义 | 例子 | 命中条件 |
|---|---|---|---|
| `A B` | 隐式 AND | `报销 住宿` | 两个都得有 |
| `A OR B` | OR | `报销 OR 住宿` | 有一个就行 |
| `A NOT B` | 排除 | `报销 NOT 超标` | 有 A 且没有 B |
| `"A B"` | 短语 | `"差旅报销"` | 这两个词必须相邻且同序 |
| `A*` | 前缀 | `报销*` | 以"报销"开头的词 |

**注意 `AND` 也要大写，`and` 会被当成普通词。** 这是 FTS5 的一个坑：操作符必须全大写。

## 1.3 操作

**1.** 进项目目录：

```text
cd "B:\OPC-Distance_study\每周课程\03-数据与智能\第13周-检索与RAG\第03节课\03-练习代码"
xcopy /E /I /Y "..\第02节课\03-练习代码\rag-app" rag-app
cd rag-app
```

**2.** 新建 `tools\probe-match.js`：

```javascript
// probe-match.js —— 把 FTS5 的查询语法一个个试清楚
// 用法：node tools\probe-match.js
const { db } = require("../db");

const QUERIES = [
  { label: "单词", q: "报 销" },
  { label: "隐式 AND（两个词都要有）", q: "报 销 住 宿" },
  { label: "显式 AND（大写）", q: "报 销 AND 住 宿" },
  { label: "小写 and（会被当普通词）", q: "报 销 and 住 宿" },
  { label: "OR", q: "报 销 OR 客 户" },
  { label: "NOT", q: "报 销 NOT 超 标" },
  { label: "短语（必须相邻）", q: "\"差 旅 报 销\"" },
  { label: "前缀", q: "报 销*" },
  { label: "带连字符（危险）", q: "报 销-流 程" },
  { label: "带引号但没闭合（危险）", q: "\"报 销" },
  { label: "带星号在最前（危险）", q: "* 报 销" },
  { label: "纯标点", q: "？？？" },
];

for (const item of QUERIES) {
  console.log("");
  console.log("=== " + item.label + " ===");
  console.log("查询：[" + item.q + "]");
  try {
    const rows = db
      .prepare(`
        SELECT f.rowid AS id, c.doc_id, c.seq,
               substr(replace(c.text, char(10), ' '), 1, 40) AS head
          FROM chunks_fts f
          JOIN chunks c ON c.id = f.rowid
         WHERE chunks_fts MATCH ?
         ORDER BY bm25(chunks_fts)
      `)
      .all(item.q);
    console.log("命中：" + rows.length + " 行");
    for (const r of rows.slice(0, 3)) {
      console.log("  id=" + r.id + " " + r.doc_id + " seq=" + r.seq + " | " + r.head);
    }
  } catch (err) {
    console.log("!!! 抛异常：" + err.message);
  }
}
```

**3.** 跑：

```text
node tools\probe-match.js
```

## 1.4 屏幕上应该看到什么

```text
=== 单词 ===
查询：[报 销]
命中：2 行
  id=5 差旅报销制度 seq=1 | 员工因公出差发生的交通、住宿费用，按标准据实报销……
  id=6 差旅报销制度 seq=2 | 报销流程：出差前填写申请单……

=== 隐式 AND（两个词都要有） ===
查询：[报 销 住 宿]
命中：1 行
  id=5 差旅报销制度 seq=1 | 员工因公出差发生的交通、住宿费用，按标准据实报销……

=== 显式 AND（大写） ===
查询：[报 销 AND 住 宿]
命中：1 行
  id=5 差旅报销制度 seq=1 | 员工因公出差发生的交通、住宿费用，按标准据实报销……

=== 小写 and（会被当普通词） ===
查询：[报 销 and 住 宿]
命中：0 行

=== OR ===
查询：[报 销 OR 客 户]
命中：4 行
  id=3 客户合同评审要点 seq=1 | 合同评审由法务部牵头……
  ...

=== NOT ===
查询：[报 销 NOT 超 标]
命中：1 行
  id=6 差旅报销制度 seq=2 | 报销流程：出差前填写申请单……

=== 短语（必须相邻） ===
查询：["差 旅 报 销"]
命中：0 行

=== 前缀 ===
查询：[报 销*]
命中：2 行

=== 带连字符（危险） ===
查询：[报 销-流 程]
!!! 抛异常：fts5: syntax error near "-"

=== 带引号但没闭合（危险） ===
查询：["报 销]
!!! 抛异常：fts5: syntax error near """

=== 带星号在最前（危险） ===
查询：[* 报 销]
!!! 抛异常：fts5: syntax error near "*"

=== 纯标点 ===
查询：[？？？]
命中：0 行
```

**这四条结果，每一条都是知识点：**

| 现象 | 说明 |
|---|---|
| `小写 and` 命中 0 | 操作符必须大写。**用户输入 `and` 会被当成一个词去搜，然后搜不到** |
| `"差 旅 报 销"` 命中 0 | 我的 `segment()` 给每个汉字插了空格，原文里的"差旅报销"变成了"差 旅 报 销"，中间没有别的字。**但短语查询要求词相邻，而库里存的只有单字，所以 `"差 旅 报 销"` 应该能命中才对** —— 这里为 0，说明那篇文章里没有连续的这四个字，是"出差…报销"的写法。**这就是短语查询的价值：它能区分"这四个字连在一起"和"这四个字分散出现"** |
| 三种输入直接抛异常 | **这是最危险的**。用户输入一个 `-`，你的接口就 500 |
| 纯标点命中 0，不抛异常 | 标点被分词器丢了，查询变成空，返回 0 行 |

**第 2 条要特别想一下。** 短语查询在"中文单字索引"这个场景下，语义和你想的不太一样。**它要求的是"这些单字紧挨着按这个顺序出现"，而这在中文里几乎就等于"这个词组按原样出现"。** 所以短语查询在你的库里是有用的，只是命中率会低。

## 1.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 所有查询都命中 0 | 你的 `segment()` 没跑过，`chunks_fts` 里存的是原始文本 | 回第 86 节跑 `build-index.js` |
| `no such table: chunks_fts` | 数据库路径不对，连到了新建的空库 | 看 `db.js` 里的 `DB_PATH`，`dir data` |
| `no such column: seg` | 你的虚拟表列名叫 `text` 不叫 `seg` | 按第 86 节的建表语句，列名是 `seg` |
| 所有查询都不抛异常 | 你用了 `db.prepare` 之前先 `try` 了，异常被吞 | 检查 `catch` 里有没有打印 |
| `bm25` 排序报错 | `ORDER BY` 里写的表名不对 | 必须是 `bm25(chunks_fts)`，就是 MATCH 里那个表名 |

## 1.6 为什么必须做"输入清洗"

看到第 1.4 节的三种抛异常，你应该立刻想到一件事：**这些查询来自用户输入。**

```javascript
// 危险的写法
app.get("/api/search", (req, res) => {
  const q = req.query.q;
  const rows = db.prepare("... WHERE chunks_fts MATCH ?").all(q);  // ← 用户能传任何东西
  res.json(rows);
});
```

**用户传 `-` 你的接口就 500。用户传 `"` 也一样。用户传 `*` 也一样。**

**这不是"安全问题"，这是"稳定性问题"。** 攻击者不需要恶意，一个正常的用户输入"报销-流程"就把你的服务打掉了。

**正确做法：把用户的自然语言输入，转成安全的 FTS5 查询。**

```javascript
function buildMatchQuery(userInput) {
  // 1. 去掉 FTS5 的语法字符
  const cleaned = userInput.replace(/["'*()\-:^]/g, " ");

  // 2. 按空白切开，丢掉空片段
  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);

  if (terms.length === 0) return null;

  // 3. 每个片段逐字插空格（和 build-index 的 segment 保持一致）
  const segs = terms.map((t) =>
    t.replace(/[\u4e00-\u9fa5]/g, (ch) => " " + ch + " ").replace(/\s+/g, " ").trim()
  );

  // 4. 用 AND 连起来（默认行为就是 AND，这里显式写出来便于以后改成 OR）
  return segs.join(" AND ");
}
```

**四步，每一步都有理由：**

```text
① 去语法字符：不让用户的输入改变查询结构
② 切词：用户可能输入一整句话，我们要的是词
③ 逐字插空格：必须和建索引时的 segment() 完全一致，否则搜不到
④ 拼 AND：默认就是 AND，写出来是为了以后能一眼改成 OR
```

**第 ③ 步最容易错。** 建索引时用了一个规则，查询时必须用**完全一样的规则**。**规则不一致，索引就白建了。**

---

# 第 2 步：BM25 排序，先把方向搞对（20 分钟）

## 2.1 做什么 / 为什么

**做什么：** 把 `bm25()` 的分数打出来，看它到底是什么形状。

**为什么单独一步：**

因为**它的方向和你的直觉相反。**

```text
你以为：分数越高越相关
实际是：分数越负越相关
```

**这个反直觉会害你做两件错事：**

```javascript
// 错事一：排序反了
rows.sort((a, b) => b.score - a.score);   // 把最不相关的排在第一

// 错事二：设阈值反了
if (row.score > -5) { /* 认为是相关的 */ }  // 把不相关的留下了
```

**这两种错都不会报错，只会让你觉得"检索效果不好"。**

## 2.2 BM25 在算什么（不用背公式）

```text
BM25 只看三件事：

① 词频（TF）：这个词在这块里出现了几次
   出现 5 次比出现 1 次相关 —— 但收益递减，出现 100 次不会比 5 次相关 20 倍

② 逆文档频率（IDF）：这个词在整个库里有多少块含它
   "报销"只在 2 块里 → 很有区分度 → 权重高
   "的"在 10 块里全有  → 没有区分度 → 权重接近 0

③ 长度归一化：块的长度
   同样出现 3 次，500 字的块比 2000 字的块更"集中"，更相关
```

**SQLite 的 `bm25()` 还有三个可调参数**，默认 `1.0 / 1.0 / 1.0`，对应上面三项的权重。**你不调它，除非有大量真实查询证明需要。**

## 2.3 操作

新建 `tools\probe-bm25.js`：

```javascript
// probe-bm25.js —— 看 bm25 分数的真实形状
const { db } = require("../db");

const queries = ["报 销", "住 宿", "客 户", "密 码", "报 销 住 宿"];

for (const q of queries) {
  console.log("");
  console.log("=== 查询：" + q + " ===");
  const rows = db
    .prepare(`
      SELECT f.rowid AS id,
             c.doc_id,
             c.seq,
             c.chars,
             bm25(chunks_fts) AS score
        FROM chunks_fts f
        JOIN chunks c ON c.id = f.rowid
       WHERE chunks_fts MATCH ?
       ORDER BY bm25(chunks_fts)
    `)
    .all(q);

  if (rows.length === 0) {
    console.log("  （无命中）");
    continue;
  }

  for (const r of rows) {
    console.log(
      "  score=" + r.score.toFixed(4).padStart(9) +
      "  chars=" + String(r.chars).padStart(4) +
      "  id=" + r.id + "  " + r.doc_id + " seq=" + r.seq
    );
  }

  console.log("  最相关的是 score 最" + (rows[0].score < 0 ? "小（最负）" : "大") + "的那个");
}
```

再做一个反例实验，新建 `tools\probe-weight.js`：

```javascript
// probe-weight.js —— 验证"短块占优"和"词频收益递减"
const { db } = require("../db");

// 1. 同一个词，在不同长度的块里
console.log("=== 同一个词在不同长度块里的分数 ===");
const rows = db
  .prepare(`
    SELECT f.rowid AS id, c.chars, bm25(chunks_fts) AS score
      FROM chunks_fts f JOIN chunks c ON c.id = f.rowid
     WHERE chunks_fts MATCH ?
     ORDER BY c.chars
  `)
  .all("报 销");
for (const r of rows) {
  console.log("  chars=" + String(r.chars).padStart(4) + "  score=" + r.score.toFixed(4));
}
console.log("  结论：字少的那块分数更负（更相关），即使词频一样");

// 2. 词频的影响
console.log("");
console.log("=== 词频的影响（用 doc_id 出现次数近似的观察） ===");
const freq = db
  .prepare(`
    SELECT id, doc_id, chars,
           (length(text) - length(replace(text, '报', ''))) AS n_bao
      FROM chunks
     ORDER BY n_bao DESC
     LIMIT 5
  `)
  .all();
console.log("  哪块里'报'字最多：");
for (const r of freq) {
  console.log("  n_bao=" + r.n_bao + "  chars=" + r.chars + "  id=" + r.id + "  " + r.doc_id);
}
```

## 2.4 屏幕上应该看到什么

```text
>node tools\probe-bm25.js

=== 查询：报 销 ===
  score=  -1.2831  chars= 603  id=5  ��旅报销制度 seq=1
  score=  -0.8642  chars= 712  id=6  差旅报销制度 seq=2
  最相关的是 score 最小（最负）的那个

=== 查询：住 宿 ===
  score=  -1.1044  chars= 603  id=5  差旅报销制度 seq=1
  最相关的是 score 最小（最负）的那个

=== 查询：客 户 ===
  score=  -2.3761  chars= 548  id=3  客户合同评审要点 seq=1
  score=  -1.8847  chars= 722  id=4  客户合同评审要点 seq=2
  score=  -0.4419  chars= 694  id=2  信息安全与账号管理 seq=2
  最相关的是 score 最小（最负）的那个

=== 查询：密 码 ===
  score=  -1.9508  chars= 508  id=1  信息安全与账号管理 seq=1
  最相关的是 score 最小（最负）的那个

=== 查询：报 销 住 宿 ===
  score=  -1.6398  chars= 603  id=5  差旅报销制度 seq=1
  最相关的是 score 最小（最负）的那个

>node tools\probe-weight.js
=== 同一个词在不同长度块里的分数 ===
  chars= 603  score=-1.2831
  chars= 712  score=-0.8642
  结论：字少的那块分数更负（更相关），即使词频一样

=== 词频的影响（用 doc_id 出现次数近似的观察） ===
  哪块里'报'字最多：
  n_bao=15  chars= 603  id=5  差旅报销制度
  n_bao=11  chars= 712  id=6  差旅报销制度
  n_bao=8  chars= 548  id=3  客户合同评审要点
  n_bao=7  chars= 722  id=4  客户合同评审要点
  n_bao=5  chars= 694  id=2  信息安全与账号管理
```

**从这两个输出能读出三件事：**

| 观察 | 证据 | 结论 |
|---|---|---|
| 分数全是负数 | `-1.2831` / `-0.8642` | **越负越相关，`ORDER BY bm25(...)` 升序就是对的** |
| 603 字那块比 712 字那块更负 | `-1.2831` vs `-0.8642` | 短块占优（长度归一化在起作用） |
| 加了一个词（`报销` → `报销 住宿`）分数更负 | `-1.2831` → `-1.6398` | **多命中一个词，相关度提高，这是 AND 的效果** |

**第 3 条要特别注意：** `报销 住宿` 只命中 1 行，`报销` 命中 2 行。**AND 会减少结果，但提高精度。** 这是检索里永恒的取舍。

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 分数是正数 | 你用的不是 SQLite 的 `bm25`，可能是别的引擎 | 确认 `bm25(chunks_fts)` 这个函数名 |
| 所有分数一样 | 所有命中的块长度和词频恰好相同 | 换几个查询，别用单个词 |
| `bm25` 报 `unable to use function bm25 in the requested context` | 你在 `ORDER BY` 里写错了表名 | 必须写 `bm25(chunks_fts)` |
| `汉字显示成乱码` | cmd 编码 | `chcp 65001` |
| 分数是 `-0.0` | 这个词在**所有**块里都出现，IDF 接近 0 | 正常。这正说明它没有区分度 |

**最后一条值得单独记：`-0.0` 是一个信号。**

```sql
-- 搜什么词会得到接近 0 的分数？
-- 答案：在你的库里到处都是的词
```

**如果你发现"报销"的分数接近 0，说明你的库里每一块都有"报销"，那这个词就没有检索价值了。** 这个时候你该换词（用"住宿""机票""超标"），或者上向量检索。

---

# 第 3 步：写一个能用的 searchKeyword（25 分钟）

## 3.1 做什么 / 为什么

**做什么：** 把前面两步拼成一个函数，签名固定：

```text
searchKeyword(query, options) -> [{ id, doc_id, page, seq, score, snippet, text }]
```

**为什么签名要固定下来：**

因为**第 91 节课要做"关键词 vs 向量 vs 混合"的对比。** 三种检索必须返回同样的结构，否则你没法用同一段代码评估它们。

```javascript
// 三种检索，同一个签名
searchKeyword(q, opts);   // 今天写
searchVector(q, opts);    // 第 89 节
searchHybrid(q, opts);    // 第 91 节
```

**这是软件设计里最实用的一个原则：接口稳定，实现随便换。**

## 3.2 操作

新建 `search-keyword.js`：

```javascript
// search-keyword.js —— 关键词检索（FTS5 + BM25 + snippet）
const { db } = require("./db");

// ---------- 1. 把用户输入转成安全的 FTS5 查询 ----------
function buildMatchQuery(userInput) {
  if (typeof userInput !== "string") return null;

  // 去掉 FTS5 语法字符，避免用户输入导致 syntax error
  const cleaned = userInput.replace(/["'*()\-:^+~]/g, " ");

  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return null;

  // 和 build-index.js 的 segment() 用完全一样的规则
  const segs = terms
    .map((t) =>
      t
        .replace(/[\u4e00-\u9fa5]/g, (ch) => " " + ch + " ")
        .replace(/[ \t]+/g, " ")
        .trim()
    )
    .filter((s) => s.length > 0);

  if (segs.length === 0) return null;

  return segs.join(" AND ");
}

// ---------- 2. 检索 ----------
function searchKeyword(query, options) {
  const opts = options === undefined ? {} : options;
  const limit = opts.limit === undefined ? 5 : opts.limit;
  const snipChars = opts.snipChars === undefined ? 60 : opts.snipChars;

  const matchQuery = buildMatchQuery(query);
  if (matchQuery === null) {
    return { query: query, matchQuery: null, total: 0, hits: [], reason: "查询为空或全是标点" };
  }

  // snippet() 参数：表名, 列号(0=第一列), 前后标记, 省略标记, 最多取多少个 token
  const rows = db
    .prepare(`
      SELECT f.rowid                AS id,
             c.doc_id               AS doc_id,
             c.page                 AS page,
             c.seq                  AS seq,
             c.chars                AS chars,
             c.tokens               AS tokens,
             c.text                 AS text,
             bm25(chunks_fts)       AS score,
             snippet(chunks_fts, 0, '[[', ']]', '...', ?) AS snippet
        FROM chunks_fts f
        JOIN chunks c ON c.id = f.rowid
       WHERE chunks_fts MATCH ?
       ORDER BY bm25(chunks_fts)
       LIMIT ?
    `)
    .all(snipChars, matchQuery, limit);

  return {
    query: query,
    matchQuery: matchQuery,
    total: rows.length,
    hits: rows,
    reason: rows.length === 0 ? "没有命中任何块" : null,
  };
}

// ---------- 3. 命令行入口 ----------
if (require.main === module) {
  const q = process.argv[2];
  if (q === undefined) {
    console.log("用法：node search-keyword.js \"报销住宿\"");
    console.log("      node search-keyword.js \"报销 住宿\" 3");
    process.exitCode = 1;
    return;
  }
  const limit = process.argv[3] === undefined ? 5 : Number(process.argv[3]);

  const r = searchKeyword(q, { limit: limit });
  console.log("原始查询：" + r.query);
  console.log("实际查询：" + r.matchQuery);
  console.log("命中：" + r.total + " 块");
  if (r.reason !== null) console.log("说明：" + r.reason);
  console.log("");

  for (const h of r.hits) {
    console.log("--- id=" + h.id + " " + h.doc_id + " seq=" + h.seq + " ---");
    console.log("  score  = " + h.score.toFixed(4));
    console.log("  chars  = " + h.chars + "  tokens = " + h.tokens);
    console.log("  snippet= " + h.snippet.replace(/\n/g, " "));
    console.log("");
  }
}

module.exports = { searchKeyword, buildMatchQuery };
```

跑几个：

```text
node search-keyword.js "报销住宿"
node search-keyword.js "报销 住宿"
node search-keyword.js "报销-流程"
node search-keyword.js "密码"
node search-keyword.js "报销 客户"
```

## 3.3 屏幕上应该看到什么

```text
>node search-keyword.js "报销住宿"
原始查询：报销住宿
实际查询：报 销 住 宿
命中：1 块

--- id=5 差旅报销制度 seq=1 ---
  score  = -1.6398
  chars  = 603  tokens = 482
  snippet= 员工因公出差发生的交通、[[住]][[宿]]费用，按标准据实[[报]][[销]]……

>node search-keyword.js "报销 住宿"
原始查询：报销 住宿
实际查询：报 销 AND 住 宿
命中：1 块

--- id=5 差旅报销制度 seq=1 ---
  score  = -1.6398
  chars  = 603  tokens = 482
  snippet= 员工因公出差发生的交通、[[住]][[宿]]费用，按标准据实[[报]][[销]]……

>node search-keyword.js "报销-流程"
原始查询：报销-流程
实际查询：报 销 流 程
命中：1 块

--- id=6 差旅报销制度 seq=2 ---
  score  = -1.1855
  chars  = 712  tokens = 571
  snippet= [[报]][[销]]流[[程]]：出差前填写申请单，经部门负责人审批……

>node search-keyword.js "密码"
原始查询：密码
实际查询：密 码
命中：1 块

--- id=1 信息安全与账号管理 seq=1 ---
  score  = -1.9508
  chars  = 508  tokens = 447
  snippet= 所有业务系统账号必须实名申请，[[密]][[码]]长度不少于 12 位……

>node search-keyword.js "报销 客户"
原始查询：报销 客户
实际查询：报 销 AND 客 户
命中：0 块
说明：没有命中任何块
```

**四个关键点：**

| 输入 | 发生了什么 | 你要记住的 |
|---|---|---|
| `报销住宿`（无空格） | 变成一个词，但 `segment` 后是四个独立的单字，AND 起来正好命中 | **中文短查询不加空格也能用**，因为索引是单字的 |
| `报销-流程` | 连字符被清洗成空格，变成"报销 AND 流程" | **不再抛异常**，接口不会 500 |
| `密码` | 只命中 1 块 | 正常，这个词只在那块出现 |
| `报销 客户` | 命中 0 | **AND 太严**。这两块文档里没有同时出现两个词的地方 |

**第 4 条是这一节最需要讲清的问题。**

```text
用户问："报销的时候客户来了怎么办"
你拆成："报销 AND 客户"
结果：0 条

但库里明明有一块讲报销、一块讲客户接待
问题不在数据，在你的"AND"策略
```

**这就是"关键词检索"的第一个死穴：它不理解"这两个词不一定非要在同一块里"。**

**注意 `snippet` 的 `[[ ]]` 标记。** `[[住]][[宿]]` 说明是按单字高亮的 —— 因为你的索引是单字的。**页面上要还原成人能看的样子：把相邻的 `[[x]][[y]]` 合并成 `[[xy]]`。**

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `实际查询：null` | 输入全是标点，被清洗光了 | 这是正确行为，返回空结果 |
| 中文查询命中 0，英文能命中 | `segment()` 规则不一致 | 建索引和查询必须用同一个转换函数 |
| `snippet` 是整块原文 | 第 5 个参数设太大 | 60 是"最多 60 个 token"，不是字符数 |
| `snippet` 里没有 `[[ ]]` | 参数顺序错了 | `snippet(表, 列号, 前标记, 后标记, 省略串, token数)` |
| `SQLITE_ERROR: unable to use function snippet` | 同上，表名写错 | 和 MATCH 里的表名保持一致 |

## 3.5 为什么 `snippet` 的最后一个参数不是"字符数"

**这是一个真实的坑。**

```javascript
snippet(chunks_fts, 0, '[[', ']]', '...', 60)
//                                         ↑ 这是 token 数，不是字符数
```

因为你的索引是**单字**的，所以 **1 个 token ≈ 1 个汉字**。60 个 token ≈ 60 个汉字 ≈ 前后各 30 字。**这刚好合适。**

**但如果你的索引是"词"，60 个 token 可能是 300 个汉字。** 那就长了。

**结论：`snipChars` 这个名字本身就是错的，应该叫 `snipTokens`。** 代码里我保留了这个名字是因为"调用方以为自己在传字符数"更符合直觉，但**注释必须写清楚它是 token 数**。

**这类"名字和实际语义不符"的坑，是接手别人代码时最容易踩的。**

---

# 第 4 步：做一份基线数据（20 分钟）

## 4.1 做什么 / 为什么

**做什么：** 用 8 个问题跑一遍，把结果记进 `out\keyword-baseline.md`。

**为什么必须有基线：**

第 91 节课你要回答一个问题：**"向量检索到底比关键词检索好多少？"**

```text
没有基线：
  "向量检索感觉好一些"
  → 客户问"好多少"，你答不上来
  → 你自己也不知道这笔钱花得值不值

有基线：
  "8 个问题里，关键词命中 5 个，向量命中 7 个，
   关键词在『同义词』类问题上全挂，向量全过"
  → 这句话能写进方案，能支撑报价
```

**基线的作用不是"证明我做得对"，是"以后有变化时我能说清变了多少"。**

## 4.2 八个问题的设计原则

**不能全是"能搜到的"问题。** 必须覆盖四类，每类两个：

| 类型 | 特点 | 例子 | 关键词检索的预期 |
|---|---|---|---|
| **字面命中** | 问题里的词，文档里原样出现 | "报销住宿标准" | 好 |
| **同义词** | 意思一样，字不一样 | "出差住的酒店能报多少钱"（文档里叫"住宿费"） | **差** |
| **跨块** | 答案分散在两块 | "超标了要谁批"（一块说超标，一块说审批） | **差** |
| **否定/条件** | 带"不""除…外" | "什么情况下不能报销" | **差** |

**为什么后三类注定差：**

```text
同义词  → FTS5 只认字面，"酒店"搜不到"住宿"
跨块    → AND 要求同块命中，跨块信息被切断
否定    → "不能报销"和"能报销"在单字索引里几乎一样，BM25 分不出
```

**这三类"差"不是 bug，是关键词检索的原理决定的。** 记下来，**它们就是第 88 节要转向量的理由。**

## 4.3 操作

新建 `tools\bench-queries.js`：

```javascript
// bench-queries.js —— 8 个问题跑关键词检索，输出对照表
const fs = require("fs");
const path = require("path");
const { searchKeyword } = require("../search-keyword");

const CASES = [
  { id: 1, type: "字面", q: "报销 住宿", expect: "差旅报销制度里住宿标准那一块" },
  { id: 2, type: "字面", q: "密码 长度", expect: "信息安全里的密码要求" },
  { id: 3, type: "同义词", q: "酒店 报多少钱", expect: "住宿费标准（文档里叫住宿费，不叫酒店）" },
  { id: 4, type: "同义词", q: "出差 花销 上限", expect: "住宿/交通的报销上限（文档里叫费用标准）" },
  { id: 5, type: "跨块", q: "超标 审批", expect: "一块讲超标、一块讲审批，需要两块拼起来" },
  { id: 6, type: "跨块", q: "合同 谁签字", expect: "合同评审 + 权限，可能分散" },
  { id: 7, type: "否定条件", q: "不能 报销", expect: "不予报销的情形" },
  { id: 8, type: "否定条件", q: "不得 外发", expect: "信息外发的禁止条款" },
];

const results = [];

for (const c of CASES) {
  const r = searchKeyword(c.q, { limit: 3 });
  results.push({
    id: c.id,
    type: c.type,
    q: c.q,
    expect: c.expect,
    total: r.total,
    matchQuery: r.matchQuery,
    top: r.hits.length === 0 ? null : {
      id: r.hits[0].id,
      doc_id: r.hits[0].doc_id,
      seq: r.hits[0].seq,
      score: r.hits[0].score,
      snippet: r.hits[0].snippet.replace(/\n/g, " "),
    },
    all: r.hits.map((h) => ({
      id: h.id, doc_id: h.doc_id, seq: h.seq, score: h.score,
    })),
  });
  console.log(
    "[" + c.id + "] " + c.type.padEnd(6) + " " + c.q.padEnd(14) +
    " 命中 " + r.total + "  " +
    (r.total === 0 ? "（空）" : r.hits[0].doc_id + " seq=" + r.hits[0].seq + " score=" + r.hits[0].score.toFixed(3))
  );
}

// ---------- 按类型统计 ----------
const byType = {};
for (const r of results) {
  if (byType[r.type] === undefined) byType[r.type] = { n: 0, hit: 0 };
  byType[r.type].n += 1;
  if (r.total > 0) byType[r.type].hit += 1;
}

console.log("");
console.log("=== 按类型统计 ===");
for (const k of Object.keys(byType)) {
  const v = byType[k];
  console.log("  " + k.padEnd(8) + v.hit + "/" + v.n + " 有结果");
}

// ---------- 写 markdown ----------
const outDir = path.join(__dirname, "..", "out");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const L = [];
L.push("# 关键词检索基线");
L.push("");
L.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
L.push("");
L.push("## 一、八个问题的结果");
L.push("");
L.push("| # | 类型 | 查询 | 实际 FTS 查询 | 命中数 | 第一名 | score |");
L.push("|---|---|---|---|---|---|---|");
for (const r of results) {
  L.push(
    "| " + r.id + " | " + r.type + " | `" + r.q + "` | `" + (r.matchQuery === null ? "-" : r.matchQuery) + "` | " +
    r.total + " | " + (r.top === null ? "-" : "`" + r.top.doc_id + "` seq=" + r.top.seq) + " | " +
    (r.top === null ? "-" : r.top.score.toFixed(4)) + " |"
  );
}
L.push("");

L.push("## 二、按类型统计");
L.push("");
L.push("| 类型 | 有结果的题数 | 占比 |");
L.push("|---|---|---|");
for (const k of Object.keys(byType)) {
  const v = byType[k];
  L.push("| " + k + " | " + v.hit + "/" + v.n + " | " + Math.round((v.hit / v.n) * 100) + "% |");
}
L.push("");

L.push("## 三、逐题详情");
L.push("");
for (const r of results) {
  L.push("### " + r.id + ". [" + r.type + "] " + r.q);
  L.push("");
  L.push("预期：" + r.expect);
  L.push("");
  if (r.total === 0) {
    L.push("**结果：0 条。**" + (r.matchQuery === null ? "（查询被清空）" : ""));
  } else {
    L.push("命中 " + r.total + " 条，第一名：");
    L.push("");
    L.push("```text");
    L.push("id=" + r.top.id + "  " + r.top.doc_id + " seq=" + r.top.seq + "  score=" + r.top.score.toFixed(4));
    L.push(r.top.snippet);
    L.push("```");
  }
  L.push("");
}

L.push("## 四、我的结论");
L.push("");
L.push("（这一节留给你写，见第 7 步的笔记）");
L.push("");

const outPath = path.join(outDir, "keyword-baseline.md");
fs.writeFileSync(outPath, L.join("\n"), "utf8");
console.log("");
console.log("已写入：" + outPath);
```

```text
node tools\bench-queries.js
```

## 4.4 屏幕上应该看到什么

```text
>node tools\bench-queries.js
[1] 字面     报销 住宿        命中 1  差旅报销制度 seq=1 score=-1.640
[2] 字面     密码 长度        命中 1  信息安全与账号管理 seq=1 score=-2.448
[3] 同义词   酒店 报多少钱     命中 0  （空）
[4] 同义词   出差 花销 上限    命中 0  （空）
[5] 跨块     超标 审批        命中 0  （空）
[6] 跨块     合同 谁签字      命中 1  客户合同评审要点 seq=1 score=-2.104
[7] 否定条件  不能 报销        命中 0  （空）
[8] 否定条件  不得 外发        命中 0  （空）

=== 按类型统计 ===
  字面      2/2 有结果
  同义词    0/2 有结果
  跨块      1/2 有结果
  否定条件  0/2 有结果
```

**这张统计表就是这一节的核心结论：**

```text
字面      2/2   关键词检索的主场
同义词    0/2   全挂
跨块      1/2   挂一半
否定条件  0/2   全挂
```

**注意第 6 题命中了 1 条。** 这一条值得单独看：`合同 谁签字` 命中了。为什么？因为那块里恰好同时有"合同"和"签字"。**这是运气，不是能力。** 换一个文档，同样的查询就会挂。

**这就是基线数据最诚实的地方：它不美化。** 4/8 和 8/8 是完全不同的两个产品，客户有权知道是哪个。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 全部命中 0 | `chunks_fts` 是空的 | 回第 86 节跑 `build-index.js` |
| 字面类也命中 0 | `segment()` 规则不一致 | 用同一个函数 |
| 「同义词」类竟然命中了 | 你的样本里恰好有这个词 | 这不算错，但在笔记里标注"运气成分" |
| 写文件报 `ENOENT` | `out` 目录不存在 | 代码里已 `mkdirSync` |

---

# 第 5 步：说清楚关键词检索为什么必然失败（15 分钟）

## 5.1 做什么 / 为什么

**做什么：** 用一个最小的对照实验，证明"同义词失败"不是你的代码问题，是原理问题。

**为什么要单独证明：**

因为**如果没有这一步，你会以为"是我没调好"。**

```text
你以为的调试方向：
  是不是分词不对？
  是不是阈值定错了？
  是不是 limit 太小？
  是不是该换 trigram？

实际：这些全都无关。原理决定的。
```

**你会在这个错误方向上花掉两天。** 而正确答案是"换一种检索方式"，那是第 88 节的事。

## 5.2 操作

新建 `tools\probe-synonym.js`：

```javascript
// probe-synonym.js —— 证明"同义词必然失败"是原理，不是调参问题
const { db } = require("../db");

const PAIRS = [
  { a: "住宿", b: "酒店", note: "文档里叫住宿，用户说酒店" },
  { a: "报销", b: "报账", note: "文档里叫报销，用户说报账" },
  { a: "员工", b: "职工", note: "文档里叫员工，用户说职工" },
  { a: "审批", b: "签字", note: "文档里叫审批，用户说签字" },
  { a: "禁止", b: "不得", note: "文档里叫禁止，用户说不得" },
];

function count(term) {
  const seg = term
    .replace(/[\u4e00-\u9fa5]/g, (ch) => " " + ch + " ")
    .replace(/\s+/g, " ")
    .trim();
  return db
    .prepare("SELECT COUNT(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?")
    .get(seg).n;
}

console.log("=== 同义词 vs 原文词，各自的命中数 ===");
console.log("");
console.log("原词        命中   同义词      命中   差异");
console.log("------------------------------------------------");

for (const p of PAIRS) {
  const na = count(p.a);
  const nb = count(p.b);
  console.log(
    "  " + p.a.padEnd(8) + String(na).padStart(4) + "   " +
    p.b.padEnd(8) + String(nb).padStart(4) + "   " +
    (na === nb ? "一样" : "差 " + Math.abs(na - nb))
  );
}

console.log("");
console.log("=== 逐个验证：同义词能不能搜到原词所在的块 ===");
console.log("");
for (const p of PAIRS) {
  const aIds = db
    .prepare("SELECT rowid AS id FROM chunks_fts WHERE chunks_fts MATCH ?")
    .all(p.a.replace(/[\u4e00-\u9fa5]/g, (c) => " " + c + " ").trim())
    .map((r) => r.id);
  const bIds = db
    .prepare("SELECT rowid AS id FROM chunks_fts WHERE chunks_fts MATCH ?")
    .all(p.b.replace(/[\u4e00-\u9fa5]/g, (c) => " " + c + " ").trim())
    .map((r) => r.id);
  const overlap = aIds.filter((id) => bIds.includes(id));
  console.log(
    "  " + p.a + " → [" + aIds.join(",") + "]   " +
    p.b + " → [" + bIds.join(",") + "]   交集 [" + overlap.join(",") + "]"
  );
}

console.log("");
console.log("=== '不能报销' 和 '可以报销' 的检索结果一样吗 ===");
const q1 = db.prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?").all("不 能 报 销");
const q2 = db.prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?").all("可 以 报 销");
console.log("  '不能报销' 命中：" + q1.map((r) => r.rowid).join(","));
console.log("  '可以报销' 命中：" + q2.map((r) => r.rowid).join(","));
console.log("  两者有没有区分出'不能'和'可以'：" + (q1.length === q2.length ? "看不出区别" : "有区别"));
```

## 5.3 屏幕上应该看到什么

```text
>node tools\probe-synonym.js
=== 同义词 vs 原文词，各自的命中数 ===

原词        命中   同义词      命中   差异
------------------------------------------------
  住宿       1   酒店         0   差 1
  报销       2   报账         0   差 2
  员工       1   职工         0   差 1
  审批       1   签字         1   差 0
  禁止       1   不得         0   差 1

=== 逐个验证：同义词能不能搜到原词所在的块 ===

  住宿 → [5]   酒店 → []   交集 []
  报销 → [5,6]   报账 → []   交集 []
  员工 → [5]   职工 → []   交集 []
  审批 → [5]   签字 → [3]   交集 []
  禁止 → [6]   不得 → []   交集 []

=== '不能报销' 和 '可以报销' 的检索结果一样吗 ===
  '不能报销' 命中：6
  '可以报销' 命中：6
  两者有没有区分出'不能'和'可以'：看不出区别
```

**三个致命发现，每一个都是原理级的：**

| 发现 | 证据 | 说明什么 |
|---|---|---|
| 同义词命中 0 | `住宿` 命中 1，`酒店` 命中 0 | **字面不一致就搜不到，没有"意思相近"这回事** |
| `审批`/`签字` 都命中 1，但**交集是空** | `审批→[5]`，`签字→[3]` | 两个词各命中不同块，**用户想找"审批"那件事，说"签字"就去了另一块** |
| `不能报销` 和 `可以报销` **命中同一块** | 都是 id=6 | **否定词完全被忽略**。用户问"什么不能报"，你给他"可以报"的内容，模型可能答反 |

**第 3 条最危险。**

```text
用户问："什么情况不能报销？"
你检索到："报销流程：出差前填写申请单，经部门负责人审批后可以报销"
模型看到这段，很可能回答"可以报销"
```

**这不是模型不听话，是你给它的素材本身就是反的。** 而且**你没有任何机制能发现这件事** —— 检索返回了结果，看起来"成功"。

**这就是"检索层的错误比模型层的错误更难发现"的原因：它不报错。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 所有词都命中 0 | 索引空 | 回第 86 节 |
| 同义词竟然命中了 | 你的库里有那个词 | 换一对更远的词（"住宿"→"落脚"） |
| `不能报销` 和 `可以报销` 结果不同 | 你的库里恰好有一块只含"可以" | 这是好事，但不要高兴太早 —— 多看几块 |
| `交集` 那行报错 | `bIds.includes` 在空数组上没问题 | 检查 `all()` 返回的是 `[{id: n}]` 还是 `[n]` |

## 5.5 这一节的结论要写进笔记

**你现在有了三个数字，它们决定了你下一步该做什么：**

```text
字面查询         2/2 命中   → 关键词检索能用
同义词查询       0/2 命中   → 必然失败，不是调参能解决的
否定条件查询     0/2 命中   → 更糟：会静默返回错误内容
不能报销/可以报销 命中同一块  → 语义方向完全丢失
```

**这三行合起来，就是第 88 节"为什么要上向量检索"的全部理由。**

**注意：不是"向量检索更高级"，是"关键词检索有明确的、可测量的能力边界"。** 这两句话在给客户做方案时完全不同：

```text
✗ "我们用了最新的向量检索技术" —— 客户听不懂，也不信
✓ "字面查询我们用关键词检索就够了，命中率 100%；
   但同义词查询命中率是 0，所以我们加了一条向量检索的通道，
   同类问题命中率提到了 90%。多花的成本是每千次查询约 X 元。"
```

**第二句话里每个数字都是你今天测出来的。**

---

# 第 6 步：故意犯三个错（15 分钟）

## 错误 1：不过滤用户输入

```javascript
// 危险写法
const q = req.query.q;
const hits = db.prepare("... WHERE chunks_fts MATCH ?").all(q);
```

**现象：** 用户输入 `报销-流程`，接口返回 500，错误信息 `fts5: syntax error near "-"`。

**真正的伤害：**

```text
用户不是攻击你，他只是在输入里用了一个连字符
你的服务就 500 了
而他会在工单里写"搜索功能坏了"
```

**怎么查：** 直接把 `-`、`"`、`*`、`(`、`)`、`:` 逐个当输入试一遍。**每一个都可能抛异常。**

**正确做法：** `buildMatchQuery()` 先清洗。**清洗不是可选项，是必需的。**

## 错误 2：用 `LIKE` 代替 `MATCH`

```javascript
// 看起来能用的写法
const hits = db
  .prepare("SELECT * FROM chunks WHERE text LIKE ?")
  .all("%" + q + "%");
```

**现象：** 能搜到。

**真正的伤害（三个，全都不报错）：**

```text
① 没有排序：返回的是表的物理顺序。搜"报销"，你可能先看到"报账"那块
② 慢：10 万块的时候，每次查询扫 10 万字
③ 不支持 AND：搜"报销 住宿"就是找"报销 住宿"这个连续字符串，几乎必然 0 条
```

**怎么查：** 跑第 86 节的 `bench-like.js`，看倍数。**如果你手上没有这个数字，你就没法跟客户解释"为什么不用 LIKE"。**

## 错误 3：给 `bm25` 加一个"最低分门槛"

```javascript
// 想"过滤掉不相关的结果"
const hits = db
  .prepare("... WHERE chunks_fts MATCH ? AND bm25(chunks_fts) < -5")
  .all(matchQuery);
```

**现象：** 阈值 `-5` 的时候，所有结果都被过滤掉了（因为没有人到 -5）。改成 `-0.5` 之后，又几乎全过。

**原因：** **`bm25` 的绝对值没有统一语义，它只在同一批结果之间有意义。**

```text
-1.64 这个数，只有在"报销 住宿"这个查询的这批结果里才有意义
换一个查询，-1.64 可能意味着"最相关"，也可能意味着"最不相关"
换一个库（块数从 10 变 10000），整个分数的尺度都变了
```

**真正的伤害：** 你会花很长时间调这个阈值，然后发现换了数据就不行了。

**正确做法：** 用 `LIMIT` 取前 N 条，不要设绝对阈值。

```text
ORDER BY bm25(chunks_fts) LIMIT ?   -- ← 这个就够了
```

**如果一定要设阈值，用相对阈值：**

```javascript
// 只保留"分数在最好那条的 2 倍以内"的结果（注意是负数，所以是"更接近 0"）
const best = hits[0].score;
const filtered = hits.filter((h) => h.score <= best * 2);
```

**注意 `<=` 和 `* 2` 的方向。** 因为分数是负数，`best = -2.0`，`best * 2 = -4.0`，而 `-3.0 <= -2.0` 为真、`-3.0 <= -4.0` 为假。**这个方向极容易写反，写完一定要打印两侧的实际值验证。**

## 三个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 不过滤输入 | 某些输入 500 | 正常用户能打挂你的接口 | 把 `-` `"` `*` 当输入试 |
| 用 `LIKE` | 能搜到 | 没排序、慢、不支持多词 | 看有没有 `ORDER BY bm25` |
| `bm25` 绝对阈值 | 调不准 | 换数据就失效 | 问自己"这个 -5 是哪来的" |

**这三个错误的共同点：它们都让检索"看起来在工作"。**

**第一在 500 的时候至少还报错。第二和第三是完全静默的 —— 你会一直得到一个"能用但不好用"的东西，然后用错它做决策。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第03节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「基线数据」和「为什么同义词必然失败」两节，**数字要来自你的真实运行**。

---

# 第 8 步：课后练习

## 练习一：加一个 `OR` 模式的降级

现在 `报销 客户` 命中 0。加一个参数 `mode: "and" | "or"`：

- `and`：现在的行为；
- `or`：`segs.map(...).join(" OR ")`。

**验收：** `报销 客户` 在 `or` 模式下应该命中 3 条以上。

**然后回答一个更重要的问题：** `or` 模式命中了更多，但第一名是不是更不相关了？**比较两种模式的 top-3 拿给模型，哪个答得更好？**

## 练习二：把相邻的 `[[x]][[y]]` 合并

`snippet` 现在是 `交通、[[住]][[宿]]费用`。写一个函数把它变成 `交通、[[住宿]]费用`。

提示：正则 `/\[\[(.)\]\]\[\[(.)\]\]/g` 反复替换，直到不再变化。

**为什么要做：** 这类显示层的小毛病，客户不会说"高亮标记没合并"，客户会说"看着很怪"。**你得自己先看出来。**

## 练习三：加一个"多词加权"

用户输入 `报销 住宿 超标`，三个词的重要程度不一样。给 `searchKeyword` 加一个 `weights` 参数，用 FTS5 的 `^` 语法给不同列加权。

**但你的虚拟表只有一列 `seg`，加不了列权重。** 所以这道题真正的答案是：**做不到，除非改虚拟表结构。** 

写清你为什么做不到，以及如果要做到，表该怎么改。**这比做出来更有价值。**

## 练习四：测一下"更大的库会不会变慢"

现在你的库 10 块。用第 86 节 `bench-like.js` 的办法造 2 万块，测 `MATCH` 的耗时。

**回答：** 块数从 10 涨到 20000（2000 倍），查询耗时涨了几倍？**这个数字能不能支撑"这个方案能撑到 10 万块"的说法？**

## 练习五：用自己的话讲清

1. `bm25` 的分数为什么是负数？"越负越相关"这个反直觉会导致哪两种写错的代码？
2. 为什么用户输入 `报销-流程` 会让接口 500？这是安全问题还是稳定性问题？
3. 为什么"同义词搜不到"是原理问题，调参解决不了？
4. 为什么"不能报销"和"可以报销"会命中同一块？这会导致什么后果？
5. 你的基线是 4/8，客户问"为什么只有一半"，你怎么答？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出 FTS5 的五个查询操作符，以及哪三个字符会导致语法错误
- [ ] 我能解释 `bm25` 的三项考量，以及为什么分数是负数
- [ ] 我能说清"关键词检索必然失败"的三类问题，以及背后原理
- [ ] 我能解释为什么 `bm25` 的绝对值不能当阈值用

## B. 实操

- [ ] `probe-match.js` 跑通，看到三种语法错误各抛一次异常
- [ ] `probe-bm25.js` 跑通，看到分数是负数且越负越相关
- [ ] `probe-weight.js` 验证了"短块占优"
- [ ] `search-keyword.js "报销-流程"` 不抛异常，返回 1 条
- [ ] `search-keyword.js "报销 客户"` 命中 0，说明是 AND 太严
- [ ] `snippet` 里有 `[[ ]]` 标记
- [ ] `bench-queries.js` 跑出 4/8，按类型统计四类都有
- [ ] `out\keyword-baseline.md` 生成，含逐题详情
- [ ] `probe-synonym.js` 跑出"住宿 1 / 酒店 0"和"不能/可以命中同一块"

## C. 排错

- [ ] 我亲手试过 `-` `"` `*` 三种输入，都抛过异常，并且用清洗修好了
- [ ] 我试过把 `ORDER BY bm25` 改成倒序，看到最不相关的排第一
- [ ] 我试过设 `bm25 < -5` 的阈值，看到结果全空
- [ ] 我知道我的 `snippet` 第六个参数是 token 数不是字符数

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 基线统计表贴的是真实输出
- [ ] 「为什么同义词必然失败」写了三条，每条带证据
- [ ] 练习三写清了"为什么做不到"

---

## 本节课要能说出口的一句话

> **关键词检索不是"差一点",它是有明确边界的工具：字面对得上就很好，对不上就是零，而且它不会告诉你"我没找到"。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `fts5: syntax error near "-"` | 用户输入没清洗 | `buildMatchQuery()` 去语法字符 |
| `no such column: seg` | 虚拟表列名 | 第 86 节建表时列名叫 `seg` |
| 所有查询命中 0 | `chunks_fts` 行数 | `SELECT COUNT(*) FROM chunks_fts` |
| 中文搜不到，英文能搜到 | `segment()` 规则不一致 | 建索引和查询用同一个函数 |
| `bm25` 分数为正 | 用的不是 SQLite `bm25` | 检查函数名 |
| `unable to use function bm25` | `ORDER BY` 里表名错 | 必须 `bm25(chunks_fts)` |
| `snippet` 是一大段 | 第六个参数太大 | 60 左右，它是 token 数 |
| `snippet` 里没标记 | 参数顺序 | `snippet(表,列,前,后,省略,token)` |
| 加了阈值结果全空 | 阈值是绝对值，不可移植 | 只用 `LIMIT` |
| 汉字乱码 | cmd 编码 | `chcp 65001` |
| 结果顺序每次都变 | 没写 `ORDER BY` | 必须显式排序 |
| 同一查询两次结果不同 | 有 `LIMIT` 但没 `ORDER BY` | 同上 |
