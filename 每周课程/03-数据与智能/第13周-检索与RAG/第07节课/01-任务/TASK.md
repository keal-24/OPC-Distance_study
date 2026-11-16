# 第 91 节课：完成资料问答

> 这节课结束时，你手上有：`rag-app\search-hybrid.js`（关键词 + 向量融合，RRF 排序）、`rag-app\eval.js`（一套能重复跑的评测）、`rag-app\out\compare.md`（三种检索在 10 个问题上的完整对比 + 你的结论），以及一个能对外交付的资料问答应用。

**时间**：约 120 分钟
**前置**：第 90 节课的 `ask.js` 和 `out\ask-log.md`，第 87 节课的 `out\keyword-baseline.md`

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你有两条检索通道，各自有明确的强弱：

| | 关键词（FTS5 + BM25） | 向量（embedding + 余弦） |
|---|---|---|
| 字面命中 | 强 | 中（也碰得上） |
| 同义词 | **零** | 强 |
| 否定条件 | 弱 | **弱** |
| 跨块 | 弱（AND 太严） | 中 |
| 排序方向 | 越负越相关 | 越大越相关 |
| 需要联网 | 不需要 | 建库和查询都要 |
| 成本 | 0 | 每块一次 + 每问一次 |
| 可解释 | 能指出命中了哪个词 | **不能** |

**两边的弱点不重叠。这是今天要做混合的唯一理由。**

## 0.2 今天这个坑长什么样

> 你决定做混合。最直接的做法：
>
> ```javascript
> const a = searchKeyword(q, { limit: 5 });
> const b = searchVector(q, { limit: 5 });
> const all = [...a.hits, ...b.hits];
> all.sort((x, y) => y.score - x.score);   // ← 直接按分数混排
> ```
>
> 跑出来，第一名是关键词结果里最相关的那条。
>
> **因为 bm25 的分数是 `-1.64`，余弦是 `0.74`。** 按"大的在前"排，所有余弦都在前面。
>
> 你把排序反过来，所有 bm25 都在前面。
>
> **两边的分数根本不在一个尺度上。**

**这是混合检索的第一个、也是最关键的坑：**

```text
bm25 分数：负数，越负越相关，绝对值大小和"块数"强相关
余弦分数：[-1, 1]，越大越相关，有统一基线

→ 两个分数不能直接比较，也不能简单归一化（归一化会丢掉"这批结果整体相关度低"这个信息）
```

**今天要学的是：不比较分数，只比较"名次"。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| RRF（Reciprocal Rank Fusion，倒数排名融合） | 只看"排第几"，不看"多少分"，把两边的名次加起来 | 第 2 步 |
| 评测集（eval set） | 一批问题 + 每个问题的标准答案在哪一块 | 第 4 步 |
| 召回率 / 命中率 | 正确的那一块，有没有出现在前 k 条里 | 第 4 步 |

**RRF 的公式（只有一行）：**

```text
score(d) = Σ  1 / (k + rank_i(d))
          i
```

**其中：**

```text
d        = 某个文档块
rank_i(d)= 这个块在第 i 个检索器里的名次（第 1 名 = 1，没出现就不算）
k        = 一个常数，通常取 60
```

**为什么是 `1/(k+rank)` 而不是 `1/rank`：**

```text
k=0   → 第 1 名得分 1.0，第 2 名 0.5，第 3 名 0.33，衰减太陡
k=60  → 第 1 名 1/61=0.0164，第 2 名 1/62=0.0161，第 10 名 1/70=0.0143

→ 加了 k 之后，前几名的差距被压平
→ 避免"某个检索器的第 1 名"压倒性地决定结果
```

**`k=60` 是原论文的经验值。你不用调它，除非有数据证明该调。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `search-hybrid.js` | `第07节课\03-练习代码\rag-app\` | RRF 融合，签名和另外两个一致 |
| `eval.js` | 同上 | 评测：命中率、top-1 准确、MRR |
| `eval-cases.js` | 同上 | 12 个带标准答案的问题 |
| `out\compare.md` | 同上 `out\` | 三种检索的完整对比 + 结论 |
| `NOTES.md` | `第07节课\02-笔记\` | 第 7 步填 |

---

# 第 1 步：先把评测集做出来（25 分钟）

## 1.1 做什么 / 为什么

**做什么：** 先写 12 个"问题 + 正确答案在哪一块"的对照，**在写混合检索之前。**

**为什么评测集要先做：**

因为**没有评测集，你无法判断混合到底有没有用。**

```text
做完了混合，你问自己："效果好了吗？"
两种可能的回答：
  ✗ "感觉好一点"          → 没法跟客户说，也没法判断值不值
  ✓ "命中率从 5/12 到 9/12" → 能写进方案
```

**还有一个更重要的原因：**

```text
如果你先做混合，你会不自觉地"挑几个混合效果好的问题"来验证自己
如果你先定评测集，你就没法挑

顺序决定的不是效率，是诚实。
```

## 1.2 评测集要记什么

**每个问题必须记四件事：**

| 字段 | 作用 | 例子 |
|---|---|---|
| `q` | 问题原文 | "住的能报多少钱" |
| `gold` | **标准答案在那几块里**（可以有多个） | `[5]` |
| `type` | 类型，用于分类统计 | "同义词" |
| `why` | 为什么这块是标准答案（一句话） | "第 5 块写了住宿费分档标准" |

**`gold` 是块 id，不是文档名。** 因为你要算"正确的那一块有没有出现在前 k 条"。

**为什么可以有多个 `gold`：**

```text
问："出差报销要什么材料"
答案可能在第 6 块（流程）和第 7 块（材料清单）
两个都对
→ gold: [6, 7]，命中任一都算对
```

## 1.3 五种题型，各占多少

| 类型 | 数量 | 为什么要有 |
|---|---|---|
| 字面 | 3 | 关键词的主场，混合后不能变差 |
| 同义词 | 3 | 向量的主场，混合应该能救回来 |
| 跨块 | 2 | 需要多块，考验 top-k 是否够 |
| 否定条件 | 2 | **两边都弱，看混合能不能至少不更差** |
| 无答案 | 2 | 库里没有，应该拒答 |

**"无答案"这一类必须单独算。**

```text
因为"命中率"对"无答案"的问题没有意义（没有 gold）
它们只统计"拒答率"
```

## 1.4 操作

**1.** 进项目：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第13周-检索与RAG\第07节课\03-练习代码"
xcopy /E /I /Y "..\第06节课\03-练习代码\rag-app" rag-app
cd rag-app
```

**2.** 先把库里的块看一遍，你才知道 gold 该填什么：

新建 `tools\dump-chunks.js`：

```javascript
// dump-chunks.js —— 把库里所有块打出来，用来确认 gold
const { db } = require("../db");

const rows = db
  .prepare("SELECT id, doc_id, page, seq, chars, substr(text,1,80) AS head FROM chunks ORDER BY id")
  .all();

console.log("共 " + rows.length + " 块");
console.log("");
for (const r of rows) {
  console.log("[" + r.id + "] " + r.doc_id + " 第" + r.seq + "块 (" + r.chars + "字)");
  console.log("    " + r.head.replace(/\s+/g, " "));
  console.log("");
}
```

```text
node tools\dump-chunks.js
```

**屏幕上应该看到什么：**

```text
共 10 块

[1] 信息安全与账号管理 第1块 (508字)
    所有业务系统账号必须实名申请，密码长度不少于 12 位，每 90 天更换一次……

[2] 信息安全与账号管理 第2块 (694字)
    客户名单、合同原件、财务明细属于机密数据，不得对外发送……

[3] 客户合同评审要点 第1块 (548字)
    合同评审由法务部牵头，金额超过 50 万元的合同必须经总经理审批……

[4] 客户合同评审要点 第2块 (722字)
    合同签署前须确认对方主体资格，留存营业执照复印件……

[5] 差旅报销制度 第1块 (603字)
    员工因公出差发生的交通、住宿费用，按标准据实报销。住宿费按城市等级分档……

[6] 差旅报销制度 第2块 (712字)
    报销流程：出差前填写申请单，经部门负责人审批后，凭发票和行程单在 15 个工作日内报销……

...
```

**注意：如果你 dump 出来的 id 和我这里不一样，以你的为准。** 后面的 `gold` 要按你的实际 id 填。

**3.** 新建 `eval-cases.js`：

```javascript
// eval-cases.js —— 评测集。gold 填块 id，先跑 tools\dump-chunks.js 确认。
module.exports = [
  // ---------- 字面：关键词的主场 ----------
  {
    id: 1, type: "字面", q: "密码长度不少于几位",
    gold: [1],
    why: "第 1 块写了密码长度 12 位",
  },
  {
    id: 2, type: "字面", q: "住宿费按什么分档",
    gold: [5],
    why: "第 5 块写了按城市等级分档",
  },
  {
    id: 3, type: "字面", q: "合同超过多少万要总经理审批",
    gold: [3],
    why: "第 3 块写了 50 万元",
  },

  // ---------- 同义词：向量的主场 ----------
  {
    id: 4, type: "同义词", q: "住的能报多少钱",
    gold: [5],
    why: "问的是住宿费标准，原文用「住宿费」不用「酒店/住的」",
  },
  {
    id: 5, type: "同义词", q: "出差花销有上限吗",
    gold: [5],
    why: "问的是费用标准，原文用「按标准据实报销」",
  },
  {
    id: 6, type: "同义词", q: "发给外部的资料有什么限制",
    gold: [2],
    why: "问的是不得外发，原文用「不得对外发送」不用「发给外部」",
  },

  // ---------- 跨块：需要多块 ----------
  {
    id: 7, type: "跨块", q: "出差报销要什么材料、多久之内报",
    gold: [6],
    why: "第 6 块同时写了「凭发票和行程单」和「15 个工作日内」",
  },
  {
    id: 8, type: "跨块", q: "签合同前要确认对方什么",
    gold: [4],
    why: "第 4 块写了主体资格和营业执照",
  },

  // ---------- 否定条件：两边都弱 ----------
  {
    id: 9, type: "否定", q: "什么情况不得对外发送",
    gold: [2],
    why: "第 2 块写了机密数据不得外发。注意：否定词容易把检索带偏",
  },
  {
    id: 10, type: "否定", q: "住宿超标了还能报销吗",
    gold: [5],
    why: "第 5 块写「超标部分由员工自理」。注意：问「还能报吗」，检索容易返回「可以报」的内容",
  },

  // ---------- 无答案：应该拒答 ----------
  {
    id: 11, type: "无答案", q: "公司年会什么时候办",
    gold: [],
    why: "库里没有年会相关信息，应该拒答",
  },
  {
    id: 12, type: "无答案", q: "食堂几点开饭",
    gold: [],
    why: "库里没有食堂信息，应该拒答",
  },
];
```

**4.** 核对你的 gold 填得对不对。新建 `tools\check-gold.js`：

```javascript
// check-gold.js —— 核对评测集的 gold 是否真实存在于库里，且内容确实相关
const { db } = require("../db");
const CASES = require("../eval-cases");

let bad = 0;

for (const c of CASES) {
  if (c.gold.length === 0) {
    console.log("[" + c.id + "] " + c.type + "  " + c.q + "  → 无 gold（应拒答）");
    continue;
  }
  const parts = [];
  for (const g of c.gold) {
    const row = db.prepare("SELECT id, doc_id, seq, substr(text,1,50) AS head FROM chunks WHERE id = ?").get(g);
    if (row === undefined) {
      console.log("[" + c.id + "] !!! gold " + g + " 不存在于库里");
      bad += 1;
      continue;
    }
    parts.push("[" + g + "] " + row.doc_id + " 第" + row.seq + "块");
  }
  console.log("[" + c.id + "] " + c.type.padEnd(6) + " " + c.q);
  console.log("      gold → " + parts.join(" / "));
}

console.log("");
console.log(bad === 0 ? "全部 gold 都存在" : "有 " + bad + " 个 gold 不存在，去修");
```

```text
node tools\check-gold.js
```

**屏幕上应该看到什么：**

```text
[1] 字面   密码长度不少于几位
      gold → [1] 信息安全与账号管理 第1块
[2] 字面   住宿费按什么分档
      gold → [5] 差旅报销制度 第1块
[3] 字面   合同超过多少万要总经理审批
      gold → [3] 客户合同评审要点 第1块
[4] 同义词 住的能报多少钱
      gold → [5] 差旅报销制度 第1块
[5] 同义词 出差花销有上限吗
      gold → [5] 差旅报销制度 第1块
[6] 同义词 发给外部的资料有什么限制
      gold → [2] 信息安全与账号管理 第2块
[7] 跨块   出差报销要什么材料、多久之内报
      gold → [6] 差旅报销制度 第2块
[8] 跨块   签合同前要确认对方什么
      gold → [4] 客户合同评审要点 第2块
[9] 否定   什么情况不得对外发送
      gold → [2] 信息安全与账号管理 第2块
[10] 否定   住宿超标了还能报销吗
      gold → [5] 差旅报销制度 第1块
[11] 无答案 公司年会什么时候办  → 无 gold（应拒答）
[12] 无答案 食堂几点开饭  → 无 gold（应拒答）

全部 gold 都存在
```

**注意第 1、2、3 题和第 4、5、9、10 题的 gold 是同一块（[5] 和 [2]）。**

**这是故意的，而且很重要：**

```text
第 2 题（字面）→ gold [5]：关键词能命中，因为"住宿费""分档"都是原词
第 4 题（同义词）→ gold [5]：关键词命不中，因为原文没有"住的""酒店"

同一个答案，两种问法。
→ 这是检验"混合到底有没有用"的最干净的实验设计

如果两题在混合后都命中，说明混合真的把这个缺口补上了
如果只有第 2 题命中，说明混合没起作用（只是关键词在干活）
```

**这个设计比"12 个完全不同的问题"有价值得多。**

## 1.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| gold 不存在 | 你的块 id 和样本不同 | 按 `dump-chunks.js` 的实际 id 填 |
| gold 存在但内容不相关 | 你没看清就填了 | 逐个打开 `text` 确认 |
| 第 11、12 题有 gold | 你的库里有无关内容 | `gold: []` 才是对的 |
| `Cannot find module '../eval-cases'` | 文件位置 | 放在 `rag-app\` 根目录 |

---

# 第 2 步：写 RRF 混合（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `search-hybrid.js`，用 RRF 把两条通道的结果融合。

**先明确一件事：不合并分数，只合并名次。**

```javascript
// ✗ 错误：合并分数
all.sort((a, b) => b.score - a.score);

// ✗ 也错：归一化后合并分数
// 因为分数归一化会丢掉"这批结果整体都不相关"这个信息

// ✓ 正确：只看名次
rank_a = 在第 1 个检索器里排第几
rank_b = 在第 2 个检索器里排第几
score = 1/(60+rank_a) + 1/(60+rank_b)
```

**为什么"归一化分数"是错的：**

```text
假设查询 A 真的相关，硬检索 top-1 余弦 0.85
假设查询 B 无关，硬检索 top-1 余弦 0.21（但仍然是 top-1）

归一化（min-max）之后：两次的 top-1 都变成 1.0
→ "这批结果整体有多相关"这个信息被抹掉了
→ 而它恰恰是"该不该拒答"的依据

RRF 只看名次，不做归一化。
所以拒答判断不能靠 RRF 分数，必须靠原始分数（另设一道闸）。
```

**这是一个非常重要的设计点：**

```text
混合排序 → 用 RRF（只看名次）
拒答判断 → 用原始余弦分数（绝对值有意义）
两件事分开做，不要混在一起
```

## 2.2 操作

新建 `search-hybrid.js`：

```javascript
// search-hybrid.js —— 关键词 + 向量，RRF 融合
// 签名和 searchKeyword / searchVector 一致
//
// 关键设计：
// ① 排序用 RRF（只看名次，不看分数）
// ② 拒答用原始余弦分数（另设闸，不受 RRF 影响）
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { searchKeyword } = require("./search-keyword");
const { searchVector } = require("./search-vector");

const RRF_K = 60;

function rrfFuse(lists) {
  // lists: [{ name, hits }]，每个 hits 已按相关度排好序
  // 返回：合并后的数组，每项带 rrfScore 和 每个通道的名次

  const acc = new Map(); // key = chunk id

  for (const list of lists) {
    for (let i = 0; i < list.hits.length; i += 1) {
      const h = list.hits[i];
      const rank = i + 1;
      const key = h.id;

      if (!acc.has(key)) {
        acc.set(key, {
          hit: h,
          rrfScore: 0,
          ranks: {},
          rawScores: {},
        });
      }
      const item = acc.get(key);
      item.rrfScore += 1 / (RRF_K + rank);
      item.ranks[list.name] = rank;
      item.rawScores[list.name] = h.score;
    }
  }

  const merged = [...acc.values()];
  merged.sort((a, b) => b.rrfScore - a.rrfScore);

  return merged.map((m) => ({
    ...m.hit,
    rrfScore: m.rrfScore,
    ranks: m.ranks,
    rawScores: m.rawScores,
    // score 字段保持"原始余弦"，因为下游要用它做拒答判断
    score: m.rawScores.vector === undefined ? m.rawScores.keyword : m.rawScores.vector,
  }));
}

async function searchHybrid(query, options) {
  const opts = options === undefined ? {} : options;
  const limit = opts.limit === undefined ? 5 : opts.limit;
  // 每个通道多取一些，给融合留空间
  const perChannel = opts.perChannel === undefined ? Math.max(limit * 2, 6) : opts.perChannel;

  const kw = searchKeyword(query, { limit: perChannel });
  const vec = await searchVector(query, { limit: perChannel });

  const fused = rrfFuse([
    { name: "keyword", hits: kw.hits },
    { name: "vector", hits: vec.hits },
  ]);

  const top = fused.slice(0, limit);

  return {
    query: query,
    matchQuery: kw.matchQuery,
    total: fused.length,
    hits: top,
    reason: top.length === 0 ? "两个通道都没有结果" : null,
    // 额外信息，给评测和调试用
    channels: {
      keyword: kw.hits.length,
      vector: vec.hits.length,
    },
  };
}

if (require.main === module) {
  const q = process.argv[2];
  if (q === undefined) {
    console.log("用法：node search-hybrid.js \"住的能报多少钱\"");
    process.exitCode = 1;
    return;
  }
  const limit = process.argv[3] === undefined ? 5 : Number(process.argv[3]);

  searchHybrid(q, { limit: limit })
    .then((r) => {
      console.log("查询：" + r.query);
      console.log("关键词通道：" + r.channels.keyword + " 条，向量通道：" + r.channels.vector + " 条");
      console.log("融合后：" + r.total + " 条");
      console.log("");
      console.log("排名  id  文书                         RRF      余弦    关键词名次  向量名次");
      console.log("--------------------------------------------------------------------------");
      for (let i = 0; i < r.hits.length; i += 1) {
        const h = r.hits[i];
        const kr = h.ranks.keyword === undefined ? "-" : String(h.ranks.keyword);
        const vr = h.ranks.vector === undefined ? "-" : String(h.ranks.vector);
        const cs = h.rawScores.vector === undefined ? "-" : h.rawScores.vector.toFixed(3);
        console.log(
          "  " + String(i + 1).padEnd(4) +
          String(h.id).padEnd(4) +
          (h.doc_id + " 第" + h.seq + "块").padEnd(28) +
          h.rrfScore.toFixed(5).padEnd(10) +
          String(cs).padEnd(8) +
          kr.padEnd(11) +
          vr
        );
      }
    })
    .catch((err) => {
      console.error("失败：" + err.message);
      process.exitCode = 1;
    });
}

module.exports = { searchHybrid, rrfFuse, RRF_K };
```

**跑三个不同的问题：**

```text
node search-hybrid.js "住宿费按什么分档"
node search-hybrid.js "住的能报多少钱"
node search-hybrid.js "什么情况不得对外发送"
```

## 2.3 屏幕上应该看到什么

字面题（关键词和向量都应该命中）：

```text
>node search-hybrid.js "住宿费按什么分档"
查询：住宿费按什么分档
关键词通道：6 条，向量通道：6 条
融合后：7 条

排名  id  文书                         RRF      余弦    关键词名次  向量名次
--------------------------------------------------------------------------
  1   5   差旅报销制度 第1块            0.03279   0.712    1           1
  2   6   差旅报销制度 第2块            0.01613   0.489    2           2
  3   2   信息安全与账号管理 第2块       0.01587   -       -           3
  ...
```

**第 5 块的 RRF 是 `0.03279`：**

```text
1/(60+1) + 1/(60+1) = 0.016393 + 0.016393 = 0.032787
```

**`0.03279` 就是"两个通道都是第 1 名"的分数。** 这个数你应该能一眼认出来。

**第 6 块是 `0.01613`：**

```text
1/(60+2) + 1/(60+2) = 0.016129 + 0.016129 = 0.016258
```

**等等，输出给的是 `0.01613`，不是 `0.016258`。**

```text
因为第 6 块在关键词里是第 2 名，在向量里可能不是第 2 名
1/(60+2) + 1/(60+3) = 0.016129 + 0.015873 = 0.032002  ← 不对，太大了

实际是 0.01613，差不多是 1/(60+2) = 0.016129
→ 说明第 6 块只在一个通道里出现了
```

**所以看这张表要以你的实际输出为准，别按我这里的数字推。** 你要做的是**看懂 `ranks` 那两列**：

```text
关键词名次 = 1，向量名次 = 1  → 两个通道都认它 → RRF 最高
关键词名次 = 1，向量名次 = -  → 只有关键词认它 → RRF 只有一半
关键词名次 = 1，向量名次 = 8  → 关键词认，向量几乎不认 → RRF 略高于"只有关键词"
```

**同义题（关键词应该挂，向量应该过）：**

```text
>node search-hybrid.js "住的能报多少钱"
查询：住的能报多少钱
关键词通道：0 条，向量通道：6 条
融合后：6 条

排名  id  文书                         RRF      余弦    关键词名次  向量名次
--------------------------------------------------------------------------
  1   5   差旅报销制度 第1块            0.01639   0.741    -           1
  2   6   差旅报销制度 第2块            0.01613   0.612    -           2
  ...
```

**注意"关键词通道：0 条"。**

```text
这是第 87 节那个死穴的直接体现：
  用户说"住的能报多少钱"，文档里叫"住宿费"
  → FTS5 搜"住 的 能 报 多 少 钱"，一个字面都对不上（"报"能对上，因为"报销"里有"报"）
  → 但 "报" 这一个字太常见，被 AND 卡死后变成 0 条

而向量检索给出了 0.741 的高分
→ 混合之后，第 5 块仍然是第 1 名 ✓
```

**这一行就是"混合检索有用"的最直接证据。**

**否定题（两边都该弱）：**

```text
>node search-hybrid.js "什么情况不得对外发送"
查询：什么情况不得对外发送
关键词通道：2 条，向量通道：6 条
融合后：7 条

排名  id  文书                         RRF      余弦    关键词名次  向量名次
--------------------------------------------------------------------------
  1   2   信息安全与账号管理 第2块       0.03252   0.681    1           1
  2   1   信息安全与账号管理 第1块       0.01639   0.402    2           -
  ...
```

**这一题居然两个通道都命中了。**

```text
为什么？因为"不得"和"对外"是原文用词
  → 关键词能命中（"不 得 对 外"）
  → 向量也能命中

这是运气好的情况。换一个问法：
  "哪些东西不能发给客户" → 关键词会挂（"客户"和"发给"）
                          → 向量可能命中，也可能被"客户名单"带偏
```

**所以否定类的结论不能从这个例子下。** 你要在评测里用多个否定题，看整体表现。

## 2.4 那个 `score` 字段要注意

**`rrfFuse` 里我做了一件需要明确的事：**

```javascript
score: m.rawScores.vector === undefined ? m.rawScores.keyword : m.rawScores.vector,
```

**意思是：`score` 字段优先放原始余弦，没有余弦就放 bm25 分数。**

**为什么这样设计：**

```text
下游（ask.js 的拒答判断）需要"绝对值有意义的相关度"
  → bm25 没有绝对值意义（第 87 节讲过）
  → 余弦有（随机基线 0.02–0.05）

所以拒答只能靠余弦。
但关键词命中了、向量没命中（或没跑）的块，score 是 bm25 分数
  → 这类块不能参与"score >= MIN_SCORE"的判断
  → 否则会被 bm25 的负数全部过滤掉
```

**正确做法：拒答判断只对"有向量分数"的块做，且要求至少有一块过线。**

```javascript
const vectorScores = hits
  .map((h) => h.rawScores.vector)
  .filter((s) => s !== undefined);

const bestVector = vectorScores.length === 0 ? 0 : Math.max(...vectorScores);

if (bestVector < minScore) {
  // 整批都不够相关 → 拒答
}
```

**注意是 `Math.max`，不是取第一名的分数。** 因为 RRF 排序后第一名可能是"关键词命中但向量没命中"的块，它的 `rawScores.vector` 是 `undefined`。

**这个细节不说清，你会写出一个"有时候拒答有时候不拒答、还找不出规律"的系统。**

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| RRF 分数全是 `0.0164` 左右 | 每个块只在一个通道出现 | 正常。两个通道都命中的块才是 `0.032` |
| 融合后比单个通道少 | 两个通道结果完全重合 | 正常，`Map` 去重了 |
| 关键词通道 0 条 | 同义词问题 | 正常，这正是向量的价值 |
| `rrfFuse is not a function` | 导出名 | 检查 `module.exports` |
| 中文查询关键词 0 条但原文里明明有 | `segment` 规则不一致 | 回第 86 节 |
| 排序和单个通道都不一样 | 正常 | RRF 会重排 |
| `rawScores.vector` 是 `undefined` | 该块没进向量通道 | 正常，拒答判断要跳过它 |

---

# 第 3 步：把混合接进 ask.js（15 分钟）

## 3.1 做什么 / 为什么

**做什么：** 让 `ask.js` 支持 `RETRIEVE_MODE=hybrid`。

**为什么这一步很轻：**

因为**三个检索器的签名是一样的**（第 87 节定的规矩，现在收利息了）。

```javascript
// ask.js 里只需要加两行
const { searchHybrid } = require("./search-hybrid");

// retrieve() 里加一个分支
if (MODE === "hybrid") return searchHybrid(question, { limit: limit });
```

**这就是"接口稳定"的价值。** 如果你当时给三个函数设计了三种返回结构，这一步要改三十行。

## 3.2 操作

改 `ask.js` 的 `retrieve`：

```javascript
const { searchKeyword } = require("./search-keyword");
const { searchVector } = require("./search-vector");
const { searchHybrid } = require("./search-hybrid");

const MODE = process.env.RETRIEVE_MODE || "hybrid";

async function retrieve(question, limit) {
  if (MODE === "keyword") return searchKeyword(question, { limit: limit });
  if (MODE === "vector") return searchVector(question, { limit: limit });
  if (MODE === "hybrid") return searchHybrid(question, { limit: limit });
  throw new Error("RETRIEVE_MODE 只能是 keyword / vector / hybrid");
}
```

改 `ask()` 里的过滤逻辑，因为 hybrid 的分数语义不同：

```javascript
  // 按分数过滤
  let hits;
  let dropped = 0;

  if (MODE === "vector") {
    hits = r.hits.filter((h) => h.score >= minScore);
    dropped = r.hits.length - hits.length;
  } else if (MODE === "keyword") {
    if (r.hits.length === 0) {
      hits = [];
    } else {
      const best = r.hits[0].score;
      hits = r.hits.filter((h) => h.score <= best / 3);
      dropped = r.hits.length - hits.length;
    }
  } else {
    // hybrid：RRF 分数没有绝对意义，不能用它过滤。
    // 用"原始余弦"判断整批是否相关。
    const vecScores = r.hits
      .map((h) => (h.rawScores === undefined ? undefined : h.rawScores.vector))
      .filter((s) => s !== undefined);

    const bestVector = vecScores.length === 0 ? 0 : Math.max(...vecScores);

    if (bestVector < minScore) {
      // 整批都不够相关 → 全部丢掉，走拒答
      dropped = r.hits.length;
      hits = [];
    } else {
      hits = r.hits;
    }
  }
```

**注意这里是"整批保留或整批丢弃"，不是逐条过滤。**

```text
为什么向量模式可以逐条过滤，hybrid 不行：
  向量模式：每条的 score 都是余弦，逐条比 0.3 有意义
  hybrid：每条的 score 可能是 bm25（负数），逐条比 0.3 会把正面命中全丢掉
          所以只能"看整批里最好的余弦够不够"
```

**如果整批够，就全都留着（包括那些只有 bm25 分数的块）。**

**这个取舍是对的：** 只要这批结果里有一块真的相关，说明用户问的是库里有的东西，其余几条作为上下文给模型也无害。

## 3.3 屏幕上应该看到什么

```text
>set RETRIEVE_MODE=hybrid
>node ask.js "住的能报多少钱"
问：住的能报多少钱
检索：hybrid，命中 6 块，过滤后留 6 块
模型：mock（假答案）

答：住宿费超标部分由员工自理。[1]如因客户到访等特殊情况需要超标，应提前提交申请并经部门负责人审批。[1][2]

【依据】
[1] 差旅报销制度 第 1 块：...
[2] 差旅报销制度 第 2 块：...

=== 引用核查 ===
结论：有问题
  [high] UNSUPPORTED：这句话的引用不足以支撑：关键词覆盖率 33% < 60%
```

```text
>node ask.js "公司年会什么时候办"
问：公司年会什么时候办
检索：hybrid，命中 7 块，过滤后留 0 块（丢掉 7 条低分）
模型：-
拒答原因：所有检索结果都低于相关度阈值 0.3

答：资料里没有相关规定。
```

**两个都要对：**

| 问题 | 应该 | 说明 |
|---|---|---|
| 同义题 | 命中并保留 | 向量通道把这块带进来了 |
| 无答案 | 拒答 | 最好的余弦也低于 0.3 |

**注意 `set RETRIEVE_MODE=hybrid` 用的是 cmd 的 `set`。** 在 Git Bash 里要用 `export`。**这是环境差异，不要混。**

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 同义题被拒答 | `bestVector` 算错，或取了第一名的 `rawScores.vector` | 用 `Math.max`，不是取 `[0]` |
| 无答案没拒答 | `bestVector` 恰好过线 | 打印真实值，看是不是该调阈值 |
| `RETRIEVE_MODE` 没生效 | 环境变量没设对 | `set X=Y` 后必须重新运行命令 |
| `r.hits[0].rawScores` 是 `undefined` | 你跑的是 keyword 模式 | 只在 hybrid 分支里用 `rawScores` |

---

# 第 4 步：写评测，量出三种检索的差异（30 分钟）

## 4.1 做什么 / 为什么

**做什么：** 写 `eval.js`，对三种检索跑 12 个问题，算出四个指标。

**四个指标，每个回答一个不同的问题：**

| 指标 | 算法 | 回答什么 |
|---|---|---|
| **命中率 @k** | gold 里任一块出现在前 k 条 | "找得到吗" |
| **Top-1 准确率** | 第 1 条就是 gold | "排得对吗" |
| **MRR** | `1/第一个 gold 出现的名次` 的平均 | "排得有多对" |
| **拒答正确率** | 无答案题有没有拒答 | "会不会乱答" |

**为什么不能只看命中率：**

```text
命中率 @5 = 100% 听起来很好
但如果所有 gold 都排在第 5 名：
  → 你把 top-5 交给模型，它要在 5 块里找
  → 而上下文越多，模型抓错重点的概率越高
  → 实际效果可能是"有资料但答不对"

Top-1 和 MRR 补上这个：它们衡量"排得有多靠前"。
```

**MRR 怎么算：**

```text
第 1 题 gold 排第 1 名 → 1/1 = 1.0
第 2 题 gold 排第 3 名 → 1/3 = 0.333
第 3 题 gold 没进前 k → 0

MRR = (1.0 + 0.333 + 0) / 3 = 0.444
```

**MRR 的范围是 `[0, 1]`，越接近 1 越好。**

## 4.2 操作

新建 `eval.js`：

```javascript
// eval.js —— 对三种检索跑评测集，输出对比
// 用法：node eval.js [k]
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const fs = require("fs");
const path = require("path");

const { searchKeyword } = require("./search-keyword");
const { searchVector } = require("./search-vector");
const { searchHybrid } = require("./search-hybrid");
const CASES = require("./eval-cases");

const K = process.argv[2] === undefined ? 5 : Number(process.argv[2]);

const RETRIEVERS = [
  { name: "keyword", fn: (q, k) => Promise.resolve(searchKeyword(q, { limit: k })) },
  { name: "vector", fn: (q, k) => searchVector(q, { limit: k }) },
  { name: "hybrid", fn: (q, k) => searchHybrid(q, { limit: k }) },
];

async function runOne(retriever, c) {
  let r;
  try {
    r = await retriever.fn(c.q, K);
  } catch (err) {
    return { error: err.message };
  }
  const ids = r.hits.map((h) => h.id);

  if (c.gold.length === 0) {
    // 无答案题：只关心"有没有捞出东西"
    return {
      ids: ids,
      noAnswer: true,
      // 这里的"拒答"由 ask.js 判断，eval 只记录"检索到了几条"
      pulled: ids.length,
    };
  }

  let firstRank = null;
  for (let i = 0; i < ids.length; i += 1) {
    if (c.gold.includes(ids[i])) { firstRank = i + 1; break; }
  }

  return {
    ids: ids,
    hit: firstRank !== null,
    top1: firstRank === 1,
    rr: firstRank === null ? 0 : 1 / firstRank,
    firstRank: firstRank,
  };
}

function summarize(rows) {
  const answerable = rows.filter((r) => r.case.gold.length > 0);
  const noAnswer = rows.filter((r) => r.case.gold.length === 0);

  const hit = answerable.filter((r) => r.result.hit === true).length;
  const top1 = answerable.filter((r) => r.result.top1 === true).length;
  const mrr = answerable.reduce((s, r) => s + (r.result.rr === undefined ? 0 : r.result.rr), 0) /
    (answerable.length === 0 ? 1 : answerable.length);

  return {
    n: answerable.length,
    hit: hit,
    hitRate: answerable.length === 0 ? 0 : hit / answerable.length,
    top1: top1,
    top1Rate: answerable.length === 0 ? 0 : top1 / answerable.length,
    mrr: mrr,
    noAnswerN: noAnswer.length,
  };
}

function summarizeByType(rows) {
  const out = {};
  for (const r of rows) {
    if (r.case.gold.length === 0) continue;
    const t = r.case.type;
    if (out[t] === undefined) out[t] = { n: 0, hit: 0, top1: 0 };
    out[t].n += 1;
    if (r.result.hit) out[t].hit += 1;
    if (r.result.top1) out[t].top1 += 1;
  }
  return out;
}

async function main() {
  console.log("评测集：" + CASES.length + " 题，k=" + K);
  console.log("检索模式：" + (process.env.EMBED_MODE || "local") + " embedding");
  console.log("");

  const all = {}; // name -> rows

  for (const rv of RETRIEVERS) {
    const rows = [];
    for (const c of CASES) {
      const result = await runOne(rv, c);
      rows.push({ case: c, result: result });
    }
    all[rv.name] = rows;

    const s = summarize(rows);
    console.log(
      rv.name.padEnd(9) +
      "命中 " + String(s.hit + "/" + s.n).padEnd(7) +
      "Top1 " + String(s.top1 + "/" + s.n).padEnd(7) +
      "MRR " + s.mrr.toFixed(3)
    );
  }

  // ---------- 逐题对照 ----------
  console.log("");
  console.log("=== 逐题对照（gold 的第一次出现名次，- 表示没进前 " + K + "）===");
  console.log("");
  console.log("id  类型    问题                          keyword  vector  hybrid");
  console.log("-----------------------------------------------------------------------");

  for (let i = 0; i < CASES.length; i += 1) {
    const c = CASES[i];
    const cells = [];
    for (const rv of RETRIEVERS) {
      const row = all[rv.name][i];
      if (c.gold.length === 0) {
        cells.push(String(row.result.pulled === undefined ? 0 : row.result.pulled) + "条");
      } else {
        cells.push(row.result.firstRank === null ? "-" : String(row.result.firstRank));
      }
    }
    console.log(
      String(c.id).padEnd(4) +
      c.type.padEnd(7) +
      c.q.slice(0, 28).padEnd(30) +
      cells[0].padEnd(8) +
      cells[1].padEnd(8) +
      cells[2]
    );
  }

  // ---------- 按类型 ----------
  console.log("");
  console.log("=== 按类型命中（命中/题数）===");
  console.log("");
  const byType = {};
  for (const rv of RETRIEVERS) {
    byType[rv.name] = summarizeByType(all[rv.name]);
  }
  const types = [...new Set(CASES.filter((c) => c.gold.length > 0).map((c) => c.type))];

  console.log("类型      " + RETRIEVERS.map((r) => r.name.padEnd(10)).join(""));
  for (const t of types) {
    const cells = RETRIEVERS.map((rv) => {
      const v = byType[rv.name][t];
      return (v === undefined ? "-" : v.hit + "/" + v.n).padEnd(10);
    });
    console.log(t.padEnd(10) + cells.join(""));
  }

  // ---------- 写 markdown ----------
  const outDir = path.join(__dirname, "out");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const L = [];
  L.push("# 三种检索对比");
  L.push("");
  L.push("生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
  L.push("");
  L.push("embedding：" + (process.env.EMBED_MODE || "local") +
    (process.env.EMBED_MODEL ? " / " + process.env.EMBED_MODEL : ""));
  L.push("k：" + K);
  L.push("");

  L.push("## 一、总览");
  L.push("");
  L.push("| 检索 | 命中率@" + K + " | Top-1 | MRR |");
  L.push("|---|---|---|---|");
  for (const rv of RETRIEVERS) {
    const s = summarize(all[rv.name]);
    L.push("| " + rv.name + " | " + s.hit + "/" + s.n + "（" + Math.round(s.hitRate * 100) + "%） | " +
      s.top1 + "/" + s.n + "（" + Math.round(s.top1Rate * 100) + "%） | " + s.mrr.toFixed(3) + " |");
  }
  L.push("");

  L.push("## 二、按类型（命中/题数）");
  L.push("");
  L.push("| 类型 | " + RETRIEVERS.map((r) => r.name).join(" | ") + " |");
  L.push("|---|" + RETRIEVERS.map(() => "---").join("|") + "|");
  for (const t of types) {
    const cells = RETRIEVERS.map((rv) => {
      const v = byType[rv.name][t];
      return v === undefined ? "-" : v.hit + "/" + v.n;
    });
    L.push("| " + t + " | " + cells.join(" | ") + " |");
  }
  L.push("");

  L.push("## 三、逐题（gold 首次出现名次）");
  L.push("");
  L.push("| id | 类型 | 问题 | gold | " + RETRIEVERS.map((r) => r.name).join(" | ") + " |");
  L.push("|---|---|---|---|" + RETRIEVERS.map(() => "---").join("|") + "|");
  for (let i = 0; i < CASES.length; i += 1) {
    const c = CASES[i];
    const cells = RETRIEVERS.map((rv) => {
      const row = all[rv.name][i];
      if (c.gold.length === 0) {
        return (row.result.pulled === undefined ? 0 : row.result.pulled) + " 条";
      }
      return row.result.firstRank === null ? "-" : "第 " + row.result.firstRank;
    });
    L.push("| " + c.id + " | " + c.type + " | " + c.q + " | " + (c.gold.length === 0 ? "（无）" : c.gold.join(",")) +
      " | " + cells.join(" | ") + " |");
  }
  L.push("");

  L.push("## 四、结论");
  L.push("");
  L.push("（见第 7 步笔记）");
  L.push("");

  const outPath = path.join(outDir, "compare.md");
  fs.writeFileSync(outPath, L.join("\n"), "utf8");
  console.log("");
  console.log("已写入：" + outPath);
}

main().catch((err) => {
  console.error("评测失败：" + err.message);
  process.exitCode = 1;
});
```

```text
node eval.js 5
```

## 4.3 屏幕上应该看到什么

```text
>node eval.js 5
评测集：12 题，k=5
检索模式：remote embedding

keyword  命中 5/10   Top1 5/10   MRR 0.500
vector   命中 7/10   Top1 6/10   MRR 0.683
hybrid   命中 9/10   Top1 8/10   MRR 0.817

=== 逐题对照（gold 的第一次出现名次，- 表示没进前 5）===

id  类型    问题                          keyword  vector  hybrid
-----------------------------------------------------------------------
1   字面    密码长度不少于几位                    1        1       1
2   字面    住宿费按什么分档                      1        1       1
3   字面    合同超过多少万要总经理审批              1        2       1
4   同义词  住的能报多少钱                        -        1       1
5   同义词  出差花销有上限吗                      -        1       1
6   同义词  发给外部的资料有什么限制               -        2       1
7   跨块    出差报销要什么材料、多久之内报          2        2       1
8   跨块    签合同前要确认对方什么                  1        3       1
9   否定    什么情况不得对外发送                    1        1       1
10  否定    住宿超标了还能报销吗                    -        5       3
11  无答案  公司年会什么时候办                      0条       5条      5条
12  无答案  食堂几点开饭                          0条       5条      5条

=== 按类型命中（命中/题数）===

类型      keyword   vector    hybrid
字面      3/3       3/3       3/3
同义词    0/3       3/3       3/3
跨块      2/2       2/2       2/2
否定      1/2       2/2       2/2
```

**这张表是这一节的全部价值。逐个看：**

| 观察 | 证据 | 结论 |
|---|---|---|
| 字面：三个都是 3/3 | 关键词本来就能干这个 | **混合没有让它变差**（这是必须验证的） |
| 同义词：keyword `0/3`，vector `3/3` | 第 87 节的死穴被补上了 | **向量的价值在这里体现得清清楚楚** |
| 同义词：hybrid `3/3` | 混合把两边都拿到了 | ✓ |
| 否定：keyword `1/2`，hybrid `2/2` | 第 10 题 keyword 挂（`-`），hybrid 拿到第 3 名 | 混合确实补了缺口 |
| **跨块：全 2/2** | 大家都找到了 | **你原以为跨块会是难点，实际不是** |
| Top-1：hybrid `8/10` 最好 | 第 10 题是第 3 名 | **混合不是万能的** |
| MRR：`0.500 → 0.683 → 0.817` | 每加一个通道，平均名次提高 | 量化了改进 |

**三个必须写进结论的发现：**

```text
① 同义词从 0/3 到 3/3 —— 这是"值不值得上向量"的核心证据
② 跨块本来就 2/2 —— 说明"跨块难"是一个假设，不是事实
   （你原以为要两块拼，但每题的答案都恰好在一块里）
③ 第 10 题最好只到第 3 名 —— 否定条件仍然是弱点，
   混合改善了但不解决。这个必须跟客户说清
```

**第 ② 条特别值得学。**

```text
你在第 1 步设计评测集时，把"跨块"当成一个难点，专门放了两题。
结果两题的关键词检索都是 2/2。

为什么？因为你写"出差报销要什么材料、多久之内报"时，
答案恰好全在第 6 块里（那块同时写了材料和时限）。

→ 你的"跨块"假设没被验证，因为你的题没真的跨块
→ 换一个真的跨块的题（比如"超标的审批流程和合同审批有什么区别"），结果会不同
```

**这是评测设计最常见的问题：你以为测了 X，其实没测到 X。**

**发现它，比得到"2/2"这个好成绩更有价值。**

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| keyword 命中率也是 3/3（同义词） | 你的库里有那些词 | 换更远的问题（"落脚""旅店"） |
| hybrid 比 vector 还差 | RRF 没写好，或 `perChannel` 太小 | `perChannel` 至少 `limit*2` |
| vector 全部命中 1 名 | 块太少（10 块），区分度不够 | 真的。10 块的库，向量检索几乎不会错 |
| 全部 MRR 都是 1.000 | 同上 | 你的库太小，测不出差异 |
| 无答案题也命中 | 正常（top-k 永远返回 k 条） | **拒答由 `ask.js` 的阈值判断，不在 eval 里** |
| `EMBED_MODE=local` 时同义词全挂 | 假向量只做字面 | **必须用真模型才能看出向量的价值** |

**最后一条是第一重要的：**

```text
用假向量跑这个评测，你会得到：
  keyword 5/10, vector 5/10, hybrid 6/10
  → 结论："向量没什么用"

用真模型：
  keyword 5/10, vector 7/10, hybrid 9/10
  → 结论："向量补上了同义词，混合最好"

同一个评测集，同一个代码，两个完全相反的结论。
差别只在 EMBED_MODE。
```

**这就是为什么第 89 节要花那么多篇幅讲"假向量只能验证管道"。**

**如果你的时间只够做一个实验，就做这个：**

```text
同一批问题，EMBED_MODE=local 跑一遍，=remote 跑一遍
把两份 compare.md 放在一起对比
```

**这两份文件的差异，就是"为什么 embedding 值这个钱"的全部答案。**

## 4.5 10 个块的库测不出真问题

**必须说清这件事：**

```text
你的库只有 10 块。
→ 无论用哪种检索，前 5 条就覆盖了半个库
→ 命中率必然高
→ 测不出真实差异

真实的库：
  500 篇文档 → 约 1200 块
  前 5 条只占 0.4%
  → 这时候"排序"才真正决定成败
```

**所以这个评测的结论只能用于"验证管道和方向"，不能用于"承诺效果"。**

**给客户的话必须是这样：**

```text
✗ "我们的检索命中率 90%"
✓ "我在 10 块的小样本上验证了三种方案，混合最好。
   上了你们 500 篇的库之后，我会重跑一遍同样的评测，
   再给你一个真实数字。现在这个 90% 不能作为承诺。"
```

**这就是专业和不专业的区别。** 不是"有没有数据"，是"知不知道这个数据能说明什么"。

---

# 第 5 步：故意犯四个错（20 分钟）

## 错误 1：直接合并分数

```javascript
// 错误写法
const a = searchKeyword(q, { limit: 5 }).hits;
const b = await searchVector(q, { limit: 5 });
const all = [...a, ...b];
all.sort((x, y) => y.score - x.score);   // 想按"大的在前"
```

**现象：** 所有向量结果排在前面，所有关键词结果排在后面。

**原因：** bm25 分数是负数。

**真正的伤害：** 看起来"能跑"，但你的混合**等于只有向量**。关键词通道的数据进去了，但永远排不上来。

**怎么查：** 打印混合结果的 `score` 那一列，看有没有负数。

```text
如果一列里既有 0.7 又有 -1.6，说明你在混排两个尺度。
```

**这就是第 2 步必须用 RRF 的原因。**

## 错误 2：用 RRF 分数做拒答

```javascript
// 错误写法
if (hits[0].rrfScore < 0.02) {
  return "资料里没有相关规定";
}
```

**现象：** 有时候该拒答的不拒答，有时候该答的被拒了。而且改不出正确的阈值。

**原因：** **RRF 分数没有绝对意义。**

```text
RRF 分数只取决于"名次"
→ 只要有 5 条结果，第 1 名必然约 1/61 = 0.0164（单通道）
→ 无论这 5 条有多不相关，这个数都一样

→ 所以 RRF 分数不能用来判断"相关不相关"
→ 它只能用来"排序"
```

**这是本节最需要记住的一条：**

```text
排序用 RRF
拒答用原始余弦
两件事必须分开
```

**如果你把它们混在一起，你会做出一个"看起来有阈值、实际随机"的系统。**

## 错误 3：以为混合一定比两边都好

```javascript
// 心里想"混合应该最好"，然后只跑混合
const r = searchHybrid(q);
```

**现象：** 你没有任何对比数据。

**真正的伤害：**

```text
混合不一定最好。它可能在某一类问题上更差：
  字面题：关键词是 1 名，向量是 3 名
        → RRF = 1/61 + 1/63 = 0.0323
        纯关键词 = 1/61 = 0.0164
        → 混合后它还是第 1（因为另一个通道没有更高的）
        但如果向量通道把一块无关内容排到第 1，
          而关键词把正确块排第 1，混合可能是：
          错误块 1/61 + 1/61 = 0.0328（第 1 名）
          正确块 1/63 + 没进向量 = 0.0159（第 2 名）
        → 混合把正确答案挤下去了
```

**这个场景是真实的。** 向量通道的"自信度"不稳，会污染关键词的准确结果。

**怎么查：** 必须有三种检索的并列数据。**没有对比，你无法知道混合是帮了还是害了。**

**正确做法：** 永远保留三条通道的开关，出问题时能一键切换。

## 错误 4：在 10 块的库上下"效果好"的结论

```text
你在 10 块的库上测出 hybrid 9/10
然后在方案里写"检索命中率 90%"
```

**现象：** 客户验收时用 500 篇文档，命中率掉到 60%。

**原因：** 库太小，前 5 条覆盖了半个库。

**真正的伤害：** 这不是技术问题，是**承诺问题**。

```text
10 块库测出 90%：
  不是"系统能到 90%"
  是"在这个不可能失败的样本上，管道是通的"
```

**正确做法：**

```text
① 明确写"这是小样本验证，用于比较三种方案"
② 不写"命中率 90%"，写"三种方案相对排序：hybrid > vector > keyword"
③ 承诺的是"我会上你的真实数据重跑这个评测"，不是"效果能到 90%"
```

**这一条已经在第 4.5 节讲过了，但值得再讲一遍，因为它是这行最容易犯的错。**

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 直接合并分数 | 能跑 | 等于只有向量 | 分数列有负数 |
| RRF 做拒答 | 阈值调不出来 | 拒答随机 | 判断是不是用了 `rrfScore` |
| 只跑混合 | 没对比 | 不知道是帮还是害 | 有没有三种并列数据 |
| 小库下大结论 | 数字好看 | 验收时崩 | 方案里有没有"90%" |

**这四个错误的共同点：它们都让你得到一个"看起来有结论"的东西。**

**第一条还能靠"看懂分数"发现。后三条只有靠"多做一遍对照实验"才能发现。**

---

# 第 6 步：写学习笔记（10 分钟）

打开 `第07节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「三种检索的对比数据」和「我的结论能给客户说什么」两节。

---

# 第 7 步：课后练习

## 练习一：修好"跨块"那两题

现在的第 7、8 题，答案恰好都在一块里，所以你的"跨块"假设没被验证。

**设计两个真的需要跨块的问题**，答案必须分布在两块里，然后重跑评测。

**提示：** 比较两类制度的差异（"住宿超标的审批"和"合同的审批"）；或者问一个需要"条件 + 例外"的问题。

**写出：** 新题、新的 gold（两块）、重跑后的三种检索表现。

## 练习二：给 RRF 加权重

现在的 RRF 是两个通道等权：

```javascript
item.rrfScore += 1 / (RRF_K + rank);
```

改成可以调权重：

```javascript
item.rrfScore += w[name] * (1 / (RRF_K + rank));
```

**试三组：**

```text
① w = { keyword: 1.0, vector: 1.0 }   （现在）
② w = { keyword: 0.5, vector: 1.5 }   （偏向语义）
③ w = { keyword: 1.5, vector: 0.5 }   （偏向字面）
```

**记录每组的 MRR。回答：哪组最好？为什么？（提示：看你的评测集里哪类题多）**

## 练习三：测一下 `perChannel` 的影响

`perChannel` 现在默认 `max(limit*2, 6)`。改成 3、6、10、20，各跑一次评测，记录 MRR。

**回答：** 是不是越大越好？为什么不是？（提示：多取的结果如果全是垃圾，会把好东西的名次往后推）

## 练习四：做一份给客户的说明

写一页 markdown，回答四个问题：

1. 这套问答能答什么、不能答什么（各举两个例子）；
2. 命中率数字的来源和局限（必须写明"10 块小样本"）；
3. 已知的三个弱点（否定条件、多跳推理、专业术语）；
4. 上线后你要做的第一件事（用真实数据重跑评测）。

**要求：不给客户"90%"这样的承诺，只给"三种方案的相对排序"和"下一步怎么验证"。**

## 练习五：用自己的话讲清

1. 为什么 bm25 和余弦的分数不能直接合并？两种"看起来合理"的错误做法各是什么？
2. RRF 的公式是什么？`k=60` 那个 60 起什么作用？
3. 为什么排序用 RRF、拒答用余弦？混用会怎样？
4. 混合检索一定比单个通道好吗？举一个它可能更差的场景。
5. 你的 10 块库测出 9/10，能跟客户说"命中率 90%"吗？为什么？

---

# 第 8 步：最终验收

## A. 概念

- [ ] 我能说出 bm25 和余弦不能直接比较的两个原因
- [ ] 我能默写 RRF 公式，并解释 `k` 的作用
- [ ] 我能解释为什么"排序用 RRF、拒答用原始分数"
- [ ] 我能说出四个评测指标各自回答什么问题
- [ ] 我能解释为什么 10 块库上的命中率不能当承诺

## B. 实操

- [ ] `dump-chunks.js` 把所有块打出来，我能确认 gold 填得对
- [ ] `check-gold.js` 全部通过，每个 gold 都存在
- [ ] `search-hybrid.js` 跑出三种问题的结果，`ranks` 两列能看懂
- [ ] 字面题：两个通道都是第 1 名，RRF 约 0.0328
- [ ] 同义题：关键词 **0 条**，向量第 1 名
- [ ] `ask.js` 支持 `RETRIEVE_MODE=hybrid`
- [ ] 同义题在 hybrid 下不再被拒答
- [ ] 无答案题在 hybrid 下仍然拒答
- [ ] `eval.js 5` 跑出三种检索的命中率 / Top-1 / MRR
- [ ] `out\compare.md` 生成，含总览、按类型、逐题三张表
- [ ] **`EMBED_MODE=local` 和 `remote` 各跑一遍 eval，两份结果对比过**

## C. 排错

- [ ] 我试过直接合并分数，看到所有 bm25 结果排到最后
- [ ] 我试过用 `rrfScore` 做拒答，看到阈值调不出来
- [ ] 我发现在 10 块的库上 vector 几乎不会错，理解了这个局限
- [ ] 我检查过"跨块"两题其实没真的跨块

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 三种检索的对比表贴的是真实输出
- [ ] 「我的结论能给客户说什么」写的是能直接说出口的话
- [ ] 练习四那份客户说明写完了

---

## 本节课要能说出口的一句话

> **混合检索的价值不是"更好"，是"两边的弱点不重叠"。而你要能说出它在你自己的数据上好了多少 —— 说不出，就等于没做。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| RRF 分数全是 0.0164 | 每块只在一个通道出现 | 正常。两块都命中才是 0.032 |
| 混合结果和向量完全一样 | 你在混排分数 | 用 RRF |
| 同义题在 hybrid 下被拒答 | `bestVector` 取了 `hits[0]` | 用 `Math.max(...vecScores)` |
| 无答案题不拒答 | `MIN_SCORE` 太低 | 打印真实余弦值 |
| `rawScores` 是 `undefined` | 跑的是 keyword 模式 | 只在 hybrid 分支用 |
| eval 全部 MRR = 1.000 | 库太小 | 正常，10 块测不出差异 |
| 同义词 keyword 也命中 | 你的库里有那个词 | 换更远的问法 |
| `RETRIEVE_MODE` 不生效 | cmd 的 `set` 还是 bash 的 `export` | cmd 用 `set X=Y`，同一条命令里不能用 `&&` 后立刻用 |
| `check-gold.js` 报某个 id 不存在 | 你的块 id 不同 | 按 `dump-chunks.js` 改 |
| `compare.md` 表格错乱 | 问题里有 `\|` | 转义 |
| 中文乱码 | cmd 编码 | `chcp 65001` |
| hybrid 比 keyword 慢 | 向量通道要算 query 向量 | 正常（远程模式约 200–800ms） |
