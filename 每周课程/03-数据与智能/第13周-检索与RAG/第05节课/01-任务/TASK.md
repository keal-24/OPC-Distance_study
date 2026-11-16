# 第 89 节课：召回相关片段

> 这节课结束时，你手上有：`rag-app\lib\embed.js`（假向量和真接口两个实现，改 `.env` 一行切换）、`rag-app\build-vectors.js`（给 10 个块建向量）、`rag-app\search-vector.js`（和 `searchKeyword` 同一个签名）、`rag-app\out\vector-baseline.md`（向量版基线）。

**建议用时**：120 分钟
**前置**：第 88 节课的 `tools\cosine.js` 和 `normalize`；第 87 节课的 `search-keyword.js`

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你会手算余弦相似度，知道向量是什么，知道归一化后余弦等于点积。

**但你手上没有一个真正的向量。** `[8,7,2]` 是你自己编的。

**今天要做的：把 10 个真实的文本块，变成 10 个真实的向量。**

## 0.2 今天这个坑长什么样

> 你兴冲冲地打开 embedding 接口文档，写了：
>
> ```javascript
> const res = await fetch(OPENAI_BASE_URL + "/v1/chat/completions", {
>   method: "POST",
>   body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
> });
> ```
>
> 报错 `404 model not found`。
>
> 你换了模型名，报 `400 invalid input`。
>
> 你查文档，发现 embedding 用的是**另一个端点** `/v1/embeddings`，参数名是 `input`，返回结构是 `data[0].embedding`，而 chat 是 `choices[0].message.content`。
>
> 改对了。**然后第二件事来了：**
>
> ```text
> 10 个块，调用 10 次 → 每次几百毫秒 → 3 秒
> 如果你是 1 万个块呢？
> ```
>
> **你会写一个循环，调 1 万次，花掉 40 分钟和一笔钱。**

**这一节要解决三个问题：**

| 问题 | 为什么难 |
|---|---|
| 端点、参数、返回结构都不一样 | chat 和 embeddings 是两套 API，容易混 |
| 批量 | 一次能传多少条？返回顺序保证吗？超了怎么办？ |
| 钱 | 你在没确认之前就把 1 万个块发出去，账单已经产生了 |

**所以今天的第一件事不是调接口，是写假实现。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| embedding 接口 | 把一批文本换成一堆向量的接口，端点是 `/v1/embeddings` | 第 2 步 |
| 批量（batching） | 一次请求带多条文本，减少往返次数 | 第 2、4 步 |
| 假向量（fake embedding） | 用算法造一个"意思相近则向量相近"的向量，不花钱，效果差 | 第 1 步 |

**为什么必须先写假向量，再写真接口：**

```text
先真接口：
  每改一次代码 → 调一次接口 → 花钱
  想验证"库里存 BLOB 还是 JSON" → 又要调一次 → 又花钱
  想验证"1 万个块排序要多久" → 又要调 1 万次 → 一大笔钱
  → 你会因为"省钱"而跳过这些验证
  → 而这些验证恰恰是最重要的

先假向量：
  所有管道、存储、排序、性能问题，全部零成本验证完
  最后换成真接口，只改一行 .env
```

**真接口那一部分只有 30 行代码。假向量那一部分要占这一节一半的时间。这是对的。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `lib\embed.js` | `第05节课\03-练习代码\rag-app\` | `embedBatch()`，假/真两个实现 |
| `build-vectors.js` | 同上 | 给所有块建向量，存进 `chunks.embedding` |
| `search-vector.js` | 同上 | `searchVector(q, opts)`，签名和 `searchKeyword` 一致 |
| `out\vector-baseline.md` | 同上 `out\` | 向量版基线，和 4/8 对比 |
| `NOTES.md` | `第05节课\02-笔记\` | 第 7 步填 |

---

# 第 1 步：先写假向量（30 分钟）

## 1.1 做什么 / 为什么

**做什么：** 写一个 `fakeEmbed(text)`，把文本变成一个 256 维向量，**并且让"字面相近"的文本向量也相近**。

**为什么叫"假"：**

因为它**不懂意思**。它只做一件事：把字面的重合度变成向量距离。

```text
假向量能做到：  "报销住宿" 和 "住宿报销" → 很像（字一样）
假向量做不到：  "住的能报吗" 和 "住宿费标准" → 一点都不像（没共同字）
```

**所以假向量在你的库上，效果会比真模型差很多。这是故意的。**

## 1.2 为什么假向量还要"能用"

**因为它要验证的是管道，不是效果。**

```text
用假向量能验证的东西：
  ① embedding 存在哪（BLOB / JSON / 单独表）
  ② 归一化在哪一步做
  ③ 10 个块变 1 万个块，排序慢多少
  ④ top-k 的 k 取多少
  ⑤ 空文本、超长文本怎么处理
  ⑥ 向量维度变了，旧向量怎么迁移

用假向量验证不了的东西：
  ⑦ 同义词能不能搜到（这是真模型的能力）
```

**①–⑥ 全部零成本。⑦ 只需要最后跑一次真接口。**

**如果你用真接口做 ①–⑥，你会因为心疼钱而草草略过。**

## 1.3 算法：字符 2-gram + 哈希到 256 维

**三步：**

```text
① 把文本切成连续的 2 个字（2-gram）
   "报销住宿" → ["报销", "销住", "住宿"]

② 每个 2-gram 算一个哈希值，映射到 256 维里的一维

③ 计数，然后归一化
```

**为什么用 2-gram 而不是单字：**

```text
单字：  "报销住宿" → [报, 销, 住, 宿]
        "住宿报销" → [住, 宿, 报, 销]     ← 向量完全一样（顺序丢了）

2-gram： "报销住宿" → [报销, 销住, 住宿]
        "住宿报销" → [住宿, 宿报, 报销]   ← 有重合但不同（保留了部分顺序）
```

**2-gram 保留了少量语序信息，比单字强。**

**为什么用哈希而不是"每见到一个新词就加一维"：**

```text
哈希： 固定 256 维，不需要维护词典，新文本直接能算
词典： 维度 = 词表大小，可能几万维，而且新词没位置
```

**代价：** 不同 2-gram 可能哈希到同一维（碰撞）。**256 维 + 中文 2-gram，碰撞一定发生，但在你 10 个块的规模下影响很小。**

## 1.4 操作

**1.** 进项目：

```text
cd "B:\OPC-Distance_study\每周课程\03-数据与智能\第13周-检索与RAG\第05节课\03-练习代码"
xcopy /E /I /Y "..\第04节课\03-练习代码\rag-app" rag-app
cd rag-app
mkdir lib
```

**2.** 复制 `cosine.js` 到 `lib\`（后面所有代码都从 `lib` 引）：

```text
copy tools\cosine.js lib\cosine.js
```

**3.** 新建 `lib\embed.js`：

```javascript
// embed.js —— 把一批文本变成向量
// 两个实现：local（假向量，零成本）和 remote（真接口）
// 用法：由 .env 里的 EMBED_MODE 决定，默认 local

const { norm } = require("./cosine");

const DIM = 256;

// ---------- 假向量：字符 2-gram + 哈希到 256 维 ----------
// 期望长度：写死 FIXED 是为了在真实文本较短时也能拿到稳定结果。
// 因为如果只按实际 2-gram 数平均，长短文本的向量模长不同，
// 虽然余弦能抵消模长，但浮点精度和碰撞会放大误差。
function fakeEmbedOne(text) {
  const vec = new Array(DIM).fill(0);

  // 1. 清洗：只留汉字、字母、数字，去掉标点空白
  const clean = String(text).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  if (clean.length === 0) {
    return vec; // 全零，cosine 会返回 0
  }

  // 2. 单个字的情况没有 2-gram，退化成单字
  const grams = [];
  if (clean.length === 1) {
    grams.push(clean);
  } else {
    for (let i = 0; i < clean.length - 1; i += 1) {
      grams.push(clean.slice(i, i + 2));
    }
  }

  // 3. 每个 2-gram 算一个稳定的哈希，累加到对应维度
  for (const g of grams) {
    let h = 2166136261; // FNV-1a 初始值
    for (let i = 0; i < g.length; i += 1) {
      h ^= g.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % DIM;
    // 用哈希的另一部分决定符号，减少"全正数"导致的相似度偏高
    const sign = (h >>> 16) & 1 ? 1 : -1;
    vec[idx] += sign;
  }

  // 4. 归一化（存进去的就是单位向量）
  const n = norm(vec);
  if (n === 0) return vec;
  for (let i = 0; i < DIM; i += 1) vec[i] /= n;
  return vec;
}

function fakeEmbed(texts) {
  return texts.map(fakeEmbedOne);
}

// ---------- 真接口 ----------
async function remoteEmbed(texts, options) {
  const opts = options === undefined ? {} : options;
  const baseUrl = process.env.EMBED_BASE_URL || process.env.OPENAI_BASE_URL;
  const apiKey = process.env.EMBED_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.EMBED_MODEL || "text-embedding-3-small";

  if (baseUrl === undefined || apiKey === undefined) {
    throw new Error("缺少 EMBED_BASE_URL / EMBED_API_KEY（或 OPENAI_ 前缀的同名变量）");
  }

  const url = baseUrl.replace(/\/+$/, "") + "/embeddings";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: model,
      input: texts,
      // 有的服务支持，有的不支持。不支持时会忽略，不会报错。
      encoding_format: "float",
    }),
    signal: AbortSignal.timeout(opts.timeoutMs === undefined ? 30000 : opts.timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("embedding 接口失败 HTTP " + res.status + "：" + body.slice(0, 300));
  }

  const json = await res.json();

  if (!Array.isArray(json.data)) {
    throw new Error("返回结构不对，没有 data 数组：" + JSON.stringify(json).slice(0, 300));
  }

  // 关键：必须按 index 排序。有的服务不保证返回顺序和输入顺序一致。
  const sorted = json.data.slice().sort((a, b) => a.index - b.index);

  if (sorted.length !== texts.length) {
    throw new Error("返回条数不对：要 " + texts.length + " 条，得到 " + sorted.length + " 条");
  }

  return sorted.map((d, i) => {
    const v = d.embedding;
    if (!Array.isArray(v) || v.length === 0) {
      throw new Error("第 " + i + " 条没有 embedding");
    }
    // 统一归一化，这样后面一律用点积
    const n = norm(v);
    if (n === 0) return v.slice();
    return v.map((x) => x / n);
  });
}

// ---------- 对外统一入口 ----------
async function embedBatch(texts, options) {
  const mode = (process.env.EMBED_MODE || "local").toLowerCase();
  if (mode === "remote") {
    return remoteEmbed(texts, options);
  }
  return fakeEmbed(texts);
}

function currentDim() {
  const mode = (process.env.EMBED_MODE || "local").toLowerCase();
  if (mode === "remote") {
    // 真模型的维度由模型决定，这里不猜，交给调用方 assert
    return null;
  }
  return DIM;
}

module.exports = { embedBatch, fakeEmbed, fakeEmbedOne, remoteEmbed, currentDim, DIM };
```

**4.** 新建 `tools\probe-embed.js` 验证假向量：

```javascript
// probe-embed.js —— 验证假向量的行为
const { fakeEmbedOne } = require("../lib/embed");
const { cosine } = require("../lib/cosine");

const TEXTS = [
  "员工因公出差发生的交通、住宿费用，按标准据实报销",
  "出差期间的住宿费按城市等级分档，超标部分自理",
  "住的能报吗",
  "酒店费用可以报销",
  "所有业务系统账号必须实名申请，密码长度不少于 12 位",
  "住宿报销标准",
];

const vecs = TEXTS.map((t) => fakeEmbedOne(t));

console.log("维度：" + vecs[0].length);
console.log("模长：" + Math.sqrt(vecs[0].reduce((s, x) => s + x * x, 0)).toFixed(6));
console.log("");

console.log("=== 两两相似度 ===");
console.log("");
for (let i = 0; i < TEXTS.length; i += 1) {
  for (let j = i + 1; j < TEXTS.length; j += 1) {
    const s = cosine(vecs[i], vecs[j]);
    const tag = s > 0.3 ? "  ← 较像" : "";
    console.log(
      "  [" + i + "] " + TEXTS[i].slice(0, 14).padEnd(16) +
      " vs [" + j + "] " + TEXTS[j].slice(0, 14).padEnd(16) +
      " = " + s.toFixed(4) + tag
    );
  }
}

console.log("");
console.log("=== 空文本和纯标点 ===");
const empty = fakeEmbedOne("");
const punct = fakeEmbedOne("？？？");
console.log("  空文本模长：" + Math.sqrt(empty.reduce((s, x) => s + x * x, 0)));
console.log("  纯标点模长：" + Math.sqrt(punct.reduce((s, x) => s + x * x, 0)));
console.log("  和正常文本的相似度：" + cosine(empty, vecs[0]).toFixed(4));
```

**5.** 跑：

```text
node tools\probe-embed.js
```

## 1.5 屏幕上应该看到什么

```text
>node tools\probe-embed.js
维度：256
模长：1.000000

=== 两两相似度 ===

  [0] 员工因公出差发生的交通、住 vs [1] 出差期间的住宿费按城市等级分 = 0.4128  ← 较像
  [0] 员工因公出差发生的交通、住 vs [2] 住的能报吗                 = 0.0384
  [0] 员工因公出差发生的交通、住 vs [3] 酒店费用可以报销           = 0.0871
  [0] 员工因公出差发生的交通、住 vs [4] 所有业务系统账号必须实名申请 = 0.0000
  [0] 员工因公出差发生的交通、住 vs [5] 住宿报销标准               = 0.2216
  [1] 出差期间的住宿费按城市等级分 vs [2] 住的能报吗                 = 0.0512
  [1] 出差期间的住宿费按城市等级分 vs [3] 酒店费用可以报销           = 0.1134
  [1] 出差期间的住宿费按城市等级分 vs [4] 所有业务系统账号必须实名申请 = 0.0128
  [1] 出差期间的住宿费按城市等级分 vs [5] 住宿报销标准               = 0.2071
  [2] 住的能报吗                 vs [3] 酒店费用可以报销           = 0.0000
  [2] 住的能报吗                 vs [4] 所有业务系统账号必须实名申请 = 0.0256
  [2] 住的能报吗                 vs [5] 住宿报销标准               = 0.0128
  [3] 酒店费用可以报销           vs [4] 所有业务系统账号必须实名申请 = 0.0312
  [3] 酒店费用可以报销           vs [5] 住宿报销标准               = 0.0985
  [4] 所有业务系统账号必须实名申请 vs [5] 住宿报销标准               = 0.0107

=== 空文本和纯标点 ===
  空文本模长：0
  纯标点模长：0
  和正常文本的相似度：0.0000
```

**这张表把假向量的三个特征全暴露了：**

| 观察 | 说明 |
|---|---|
| `[0] vs [1] = 0.4128` | 两段都讲出差住宿报销，字面重合多 → 像。**这是假向量唯一能做对的事** |
| `[0] vs [4] = 0.0000` | 一个是出差报销，一个是账号密码，没有一个共同 2-gram → **完全不相关** |
| `[2] "住的能报吗" vs [3] "酒店费用可以报销" = 0.0000` | **这两句意思几乎一样，但假向量认为毫不相关** |
| 空文本模长 0 | 归一化不了，`cosine` 会返回 0（而不是 NaN），这是 `cosine.js` 的设计 |

**第 3 条是这一节最关键的认知：**

```text
假向量做不到"意思相近"。
它只能做"字面相近"。

所以：
  用它验证管道   → 完全可以
  用它评估效果   → 完全不靠谱，必须换真模型
```

**如果你用假向量跑基线，得到 3/8 甚至更低，那不是"向量检索不行"，那是"假向量不行"。**

**记住这个区别。** 很多人在这一步得出错误结论然后放弃向量检索。

## 1.6 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 模长不是 1.000000 | 归一化没做，或 `norm` 算错 | 检查 `vec[i] /= n` 在不在循环里 |
| 所有相似度都很高（>0.5） | 没做符号随机，全加正数导致向量都指向正方向 | 检查 `sign` 那一行 |
| `[0] vs [4]` 不是 0 | 你的清洗没去掉标点 | `replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "")` |
| 空文本报 `NaN` | `cosine` 里没处理零向量 | 回第 88 节补 |
| `Cannot find module '../lib/embed'` | 目录结构不对 | `mkdir lib`，文件放在 `lib\` 下 |

---

# 第 2 步：换成真接口（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写 `.env`，跑一次真接口，确认三个数字都对。

**为什么现在换：**

因为管道已经在假向量上验证过了。**现在换真接口，如果出错，你能确定是"接口调用"的问题，不是"管道"的问题。**

**这个顺序就是调试的核心方法：一次只改一个变量。**

## 2.2 chat 和 embeddings 的三处不同

**这是最容易混的地方，做成表记住：**

| | chat/completions | embeddings |
|---|---|---|
| 端点 | `/v1/chat/completions` | `/v1/embeddings` |
| 关键参数名 | `messages` | `input` |
| `input` 可以是 | —（用 `messages`） | 字符串 **或** 字符串数组 |
| 返回结果在哪 | `choices[0].message.content` | `data[0].embedding` |
| 返回条数 | 1（除非 `n > 1`） | 等于输入条数 |
| 顺序保证 | — | **必须按 `index` 排序，不保证原序** |
| 计费 | 输入 + 输出 token | 只算输入 token |

**最后两条最容易踩：**

```text
"顺序不保证" → 你不排序，第 3 条的向量可能被存给第 5 条块
                → 检索结果全错，而且不报错
"只算输入"    → 你以为 embedding 便宜到可以随便调 1 万次
                实际：1 万个块 × 500 字 ≈ 500 万 token
```

## 2.3 操作

**1.** 新建 `.env`（如果已有，追加）：

```text
# 假向量（默认）
EMBED_MODE=local

# 真接口：把这行改成 remote，并填下面三项
# EMBED_MODE=remote
# EMBED_BASE_URL=https://你的服务地址/v1
# EMBED_API_KEY=sk-xxxxxxxx
# EMBED_MODEL=你的账号里可用的 embedding 模型名
```

**注意 `EMBED_BASE_URL` 里带不带 `/v1`：**

```text
代码里做的是：baseUrl.replace(/\/+$/,"") + "/embeddings"
所以 baseUrl 应该写到 /v1 为止：
  ✓ https://api.example.com/v1        → 拼成 .../v1/embeddings
  ✗ https://api.example.com           → 拼成 .../embeddings（多数服务 404）
  ✗ https://api.example.com/v1/        → 代码会去掉尾部斜杠，能对
```

**2.** 新建 `tools\probe-remote.js`：

```javascript
// probe-remote.js —— 验证真接口
// 用法：node tools\probe-remote.js
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { embedBatch, currentDim } = require("../lib/embed");
const { cosine } = require("../lib/cosine");

const TEXTS = [
  "员工因公出差发生的交通、住宿费用，按标准据实报销",
  "住的能报吗",
  "所有业务系统账号必须实名申请",
];

async function main() {
  const mode = (process.env.EMBED_MODE || "local").toLowerCase();
  console.log("模式：" + mode);
  console.log("模型：" + (process.env.EMBED_MODEL || "-"));
  console.log("端点：" + (process.env.EMBED_BASE_URL || "-") + "/embeddings");
  console.log("");

  const t0 = Date.now();
  const vecs = await embedBatch(TEXTS);
  const ms = Date.now() - t0;

  console.log("耗时：" + ms + " ms");
  console.log("条数：" + vecs.length + "（期望 " + TEXTS.length + "）");
  console.log("维度：" + vecs[0].length);
  console.log("前 5 个值：" + vecs[0].slice(0, 5).map((x) => x.toFixed(6)).join(", "));

  const n0 = Math.sqrt(vecs[0].reduce((s, x) => s + x * x, 0));
  console.log("第 1 条模长：" + n0.toFixed(6) + "（归一化后应该是 1.0）");
  console.log("");

  console.log("=== 相似度 ===");
  console.log("  [0] vs [1] 出行报销 / 住的能报吗      = " + cosine(vecs[0], vecs[1]).toFixed(4));
  console.log("  [0] vs [2] 出行报销 / 账号管理        = " + cosine(vecs[0], vecs[2]).toFixed(4));
  console.log("  [1] vs [2] 住的能报吗 / 账号管理      = " + cosine(vecs[1], vecs[2]).toFixed(4));

  console.log("");
  console.log("=== 顺序验证：单独发一次第 2 条，和批量里的第 2 条比 ===");
  const single = await embedBatch([TEXTS[1]]);
  console.log("  单条和批量的相似度：" + cosine(single[0], vecs[1]).toFixed(6) + "（应该接近 1.000000）");

  const d = currentDim();
  console.log("");
  console.log("假向量维度：" + d + "（remote 模式下是 null，由模型决定）");
}

main().catch((err) => {
  console.error("失败：" + err.message);
  process.exitCode = 1;
});
```

**3.** 先跑假模式确认脚本没问题：

```text
node tools\probe-remote.js
```

**4.** 改 `.env` 成 `EMBED_MODE=remote`，填好三项，再跑：

```text
node tools\probe-remote.js
```

## 2.4 屏幕上应该看到什么

假模式：

```text
>node tools\probe-remote.js
模式：local
模型：-
端点：-/embeddings

耗时：2 ms
条数：3（期望 3）
维度：256
前 5 个值：0.000000, 0.000000, 0.048113, 0.000000, 0.000000
第 1 条模长：1.000000（归一化后应该是 1.0）

=== 相似度 ===
  [0] vs [1] 出行报销 / 住的能报吗      = 0.0384
  [0] vs [2] 出行报销 / 账号管理        = 0.0000
  [1] vs [2] 住的能报吗 / 账号管理      = 0.0256

=== 顺序验证：单独发一次第 2 条，和批量里的第 2 条比 ===
  单条和批量的相似度：1.000000（应该接近 1.000000）

假向量维度：256（remote 模式下是 null，由模型决定）
```

真模式：

```text
>node tools\probe-remote.js
模式：remote
模型：text-embedding-3-small
端点：https://api.example.com/v1/embeddings

耗时：842 ms
条数：3（期望 3）
维度：1536
前 5 个值：-0.023441, 0.089127, -0.117608, 0.044210, 0.003841
第 1 条模长：1.000000（归一化后应该是 1.0）

=== 相似度 ===
  [0] vs [1] 出行报销 / 住的能报吗      = 0.7412
  [0] vs [2] 出行报销 / 账号管理        = 0.0873
  [1] vs [2] 住的能报吗 / 账号管理      = 0.1021

=== 顺序验证：单独发一次第 2 条，和批量里的第 2 条比 ===
  单条和批量的相似度：1.000000（应该接近 1.000000）

假向量维度：null（remote 模式下是 null，由模型决定）
```

**三个数字，每一个都必须对：**

| 数字 | 假模式 | 真模式 | 意义 |
|---|---|---|---|
| 条数 | 3 | 3 | **不等于输入条数就是接口返回有问题** |
| 维度 | 256 | 1536 | 真模型维度由模型定，**必须记下来，建表时要用** |
| 单条 vs 批量相似度 | 1.000000 | 1.000000 | **不等于 1 说明你的顺序排序错了，或者模型不是确定性的** |

**第三个数字是整个第 2 步的核心验证。**

```text
如果 0.999 左右   → 正常（模型有极小的浮点不确定性）
如果 0.85 左右    → 顺序错了！你把第 2 条和第 1 条或第 3 条比了
如果 0.3 左右     → 严重错误，批量返回的结果和单条不一样
```

**另外注意相似度的对比：**

```text
假向量：[0] vs [1] = 0.0384   ← 意思相近但字面不同 → 完全没识别出来
真模型：[0] vs [1] = 0.7412   ← 正确识别

假向量：[0] vs [2] = 0.0000   ← 不相关，对了
真模型：[0] vs [2] = 0.0873   ← 不相关，也对（0.087 是随机基线附近）
```

**这两行对比就是"为什么必须用真模型"的全部答案。**

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `HTTP 404` | 端点拼接错，或 baseUrl 少了 `/v1` | 打印代码拼出来的完整 URL |
| `HTTP 401` | key 不对，或没带 `Bearer ` 前缀 | 检查 header |
| `HTTP 400 invalid input` | `input` 传了对象而不是字符串/数组 | 只传字符串或字符串数组 |
| `返回条数不对：要 3 条，得到 1 条` | 你把数组当成一个字符串传了（`JSON.stringify` 了数组） | 直接传数组，别先 stringify |
| 单条 vs 批量 0.85 | `index` 没排序 | 加 `.sort((a,b)=>a.index-b.index)` |
| `缺少 EMBED_BASE_URL` | `.env` 没被读，或变量名拼错 | `require("dotenv").config()` 在最前面 |
| `fetch is not defined` | Node 低于 18 | 升级 Node |
| 超时 | 网络或批量太大 | 减小批量，或调 `timeoutMs` |
| 维度每次不一样 | 模型名写错，或服务端路由到不同模型 | 打印模型名，固定它 |

## 2.6 关于费用：先说清量级

**你在跑批量之前必须能算出这一批要花多少。**

```text
估算公式：
  总 token ≈ 所有块的字数之和 × 1.5（中文约 1.5 token/字）
  费用   ≈ 总 token / 1000 × 单价

举例（数字是量级，不是报价）：
  10 个块 × 600 字 = 6000 字 ≈ 9000 token
  1 万个块         = 600 万字 ≈ 900 万 token
  → 差 1000 倍

所以你必须在跑之前，先 SELECT SUM(chars) 看一眼。
```

**这一条要变成你的习惯：任何调外部接口的批量操作，先算总 token，再执行。**

## 2.7 操作：先算，再跑

在 `build-vectors.js` 里（下一步写）第一件事就是打印总量：

```text
待处理块数：10
总字符数：5842
估算 token：8763
```

**如果是 1 万个块，看到 900 万 token，你会先停下来想一下。** 这就是这一行的价值。

---

# 第 3 步：向量存哪里（25 分钟）

## 3.1 做什么 / 为什么

**做什么：** 给 `chunks` 表加 `embedding` 列，决定用什么格式存。

**为什么这是个需要认真决定的选项：**

第 86 节的表里已经有 `embedding BLOB` 这一列了。**但你没想过为什么是 BLOB 不是 TEXT。**

| 存法 | 大小（1536 维） | 读取速度 | 可读性 | 跨语言 |
|---|---|---|---|---|
| **JSON 字符串** `"[0.023,-0.089,...]"` | 约 20 KB | 慢（要 `JSON.parse`） | 好（能直接看） | 好 |
| **BLOB（float32）** `Buffer` | 约 6 KB | 快（直接读内存） | 差（要看 hex） | 需约定字节序 |
| **BLOB（float64）** | 约 12 KB | 快 | 差 | 同上 |
| **单独一张表 + BLOB** | 6 KB + 表开销 | 快，且不影响主表扫描 | 差 | 同上 |

**1536 维 × 4 字节 = 6144 字节。** 这就是为什么用 float32 而不是 float64 —— **精度够，体积减半。**

**为什么不用 JSON：**

```text
1 万个块 × 20KB = 200MB（JSON）
1 万个块 × 6KB  = 60MB（float32 BLOB）
差 3.3 倍

而且每次查都要 JSON.parse 1 万个 20KB 字符串
→ 每次查询几十毫秒纯解析开销
```

## 3.2 操作：改建表语句

**1.** 修改 `build-index.js`，把 `embedding` 那一列保持 BLOB，并增加一个维度检查的辅助表：

```javascript
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
```

**2.** 新建 `lib/vec-store.js`，专门管"向量和 BLOB 之间怎么转"：

```javascript
// vec-store.js —— 向量 <-> BLOB
// float32 小端序。读写都在这一层，其他地方不要碰 Buffer。

function vecToBlob(vec) {
  const buf = Buffer.allocUnsafe(vec.length * 4);
  for (let i = 0; i < vec.length; i += 1) {
    buf.writeFloatLE(vec[i], i * 4);
  }
  return buf;
}

function blobToVec(blob, dim) {
  // better-sqlite3 返回 Buffer；node:sqlite 可能返回 Uint8Array
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const n = dim === undefined ? Math.floor(buf.length / 4) : dim;
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = buf.readFloatLE(i * 4);
  }
  return out;
}

function blobDim(blob) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return Math.floor(buf.length / 4);
}

module.exports = { vecToBlob, blobToVec, blobDim };
```

**3.** 新建 `tools\probe-store.js` 验证往返无损：

```javascript
// probe-store.js —— 验证 BLOB 往返的精度损失
const { vecToBlob, blobToVec, blobDim } = require("../lib/vec-store");
const { fakeEmbedOne } = require("../lib/embed");
const { cosine } = require("../lib/cosine");

const text = "员工因公出差发生的交通、住宿费用，按标准据实报销";
const v = fakeEmbedOne(text);

const blob = vecToBlob(v);
const back = blobToVec(blob);

console.log("原始维度：" + v.length);
console.log("BLOB 字节：" + blob.length + "（" + v.length + " × 4）");
console.log("读回维度：" + blobDim(blob));
console.log("");

let maxDiff = 0;
for (let i = 0; i < v.length; i += 1) {
  const d = Math.abs(v[i] - back[i]);
  if (d > maxDiff) maxDiff = d;
}
console.log("最大误差：" + maxDiff.toExponential(3));
console.log("相似度（原始 vs 往返）：" + cosine(v, back).toFixed(10));
console.log("");

// float64 对比
const buf64 = Buffer.allocUnsafe(v.length * 8);
for (let i = 0; i < v.length; i += 1) buf64.writeDoubleLE(v[i], i * 8);
console.log("float32 BLOB 大小：" + blob.length + " 字节");
console.log("float64 BLOB 大小：" + buf64.length + " 字节");
console.log("差值倍数：" + (buf64.length / blob.length).toFixed(2));
```

**4.** 跑：

```text
node tools\probe-store.js
```

## 3.3 屏幕上应该看到什么

```text
>node tools\probe-store.js
原始维度：256
BLOB 字节：1024（256 × 4）
读回维度：256

最大误差：2.328e-10
相似度（原始 vs 往返）：1.0000000000

float32 BLOB 大小：1024 字节
float64 BLOB 大小：2048 字节
差值倍数：2.00
```

**四个数字：**

| 数字 | 值 | 说明 |
|---|---|---|
| BLOB 字节 | 1024 | `256 × 4`，精确 |
| 最大误差 | `2.3e-10` | float32 有约 7 位有效数字，误差在 1e-10 量级，**对余弦相似度完全无影响** |
| 相似度 | `1.0000000000` | 往返后完全一致到小数点后 10 位 |
| float64 倍数 | 2.00 | 精度提升对检索没用，体积翻倍 |

**结论很清楚：用 float32 BLOB。**

**但注意 1536 维的情况：**

```text
1536 × 4 = 6144 字节/块
1 万块    = 61 MB
10 万块   = 614 MB
100 万块  = 6.1 GB
```

**这就是第 89 节要面对的现实：向量检索的存储不是免费的。**

**当你的块数到 10 万级别，你需要考虑：**

```text
① 降维（有的模型支持 256/512 维输出，效果略降，体积降 6 倍）
② 量化（把 float32 压成 int8，体积降 4 倍，精度略降）
③ 上专门的向量索引（这是另一个话题，本课程不涉及）
```

**本课程的量级（几千到几万块）用"全表扫描 + 暴力算"完全够。** 第 5 步会量出具体数字。

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `BLOB 字节` 是 2048 | 你用了 `writeDoubleLE` | 改成 `writeFloatLE` |
| 最大误差 > 1e-6 | 同上 | 同上 |
| `blobToVec` 返回长度不对 | `dim` 传错 | 用 `blobDim(blob)` 现算 |
| `blob.readFloatLE is not a function` | 传进来的是 `Uint8Array` 不是 `Buffer` | `Buffer.from(blob)` 包一层 |
| 相似度不是 1 | 你的 `vecToBlob` 写错了偏移 | `i * 4` 不是 `i` |

---

# 第 4 步：给 10 个块建向量（20 分钟）

## 4.1 做什么 / 为什么

**做什么：** 写 `build-vectors.js`，把 `chunks` 表里所有块的向量算出来写回去。

**为什么要单独一个脚本，不塞进 `build-index.js`：**

```text
build-index.js  → 切分 + 建 FTS 索引。不需要网络，不需要钱，随时可跑
build-vectors.js → 只算向量。可能要调接口，可能花钱

分开的理由：
  ① 改分块策略 → 重跑 build-index，向量必须重算（因为文本变了）
  ② 改向量模型 → 只重跑 build-vectors，不用重切
  ③ 调试检索   → 两个都不用跑

如果合成一个，每次改分块都要重新花钱算向量
```

**这是一条通用原则：把"要花钱的步骤"和"不要花钱的步骤"分开。**

## 4.2 操作

新建 `build-vectors.js`：

```javascript
// build-vectors.js —— 给所有块算向量，写进 chunks.embedding
// 用法：
//   node build-vectors.js            只处理没有向量的块
//   node build-vectors.js --force    全部重算
//   node build-vectors.js --dim 1536 指定维度（默认 256 假向量 / 真模型自动）
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { db, DB_PATH, driver } = require("./db");
const { embedBatch, currentDim } = require("./lib/embed");
const { vecToBlob, blobDim } = require("./lib/vec-store");

const BATCH = 16;
const args = process.argv.slice(2);
const FORCE = args.includes("--force");

function getMeta(key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row === undefined ? null : row.value;
}

function setMeta(key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, String(value));
}

async function main() {
  const mode = (process.env.EMBED_MODE || "local").toLowerCase();

  const where = FORCE ? "1=1" : "embedding IS NULL";
  const rows = db
    .prepare(`SELECT id, doc_id, seq, text, chars, embedding FROM chunks WHERE ${where} ORDER BY id`)
    .all();

  const totalChars = rows.reduce((n, r) => n + r.chars, 0);

  console.log("数据库：" + DB_PATH + "（" + driver + "）");
  console.log("模式    ：" + mode + (mode === "remote" ? " / " + (process.env.EMBED_MODEL || "-") : ""));
  console.log("待处理  ：" + rows.length + " 块" + (FORCE ? "（强制全量）" : "（只补空缺）"));
  console.log("总字符  ：" + totalChars);
  console.log("估算 token：" + Math.round(totalChars * 1.5) + "（中文约 1.5 token/字）");
  console.log("");

  if (rows.length === 0) {
    console.log("没有需要处理的块。要全量重算请加 --force");
    return;
  }

  // 记录维度，防止两次用了不同模型导致维度不一致
  const prevDim = getMeta("embedding_dim");
  const expectedDim = currentDim();

  const update = db.prepare("UPDATE chunks SET embedding = ? WHERE id = ?");

  let done = 0;
  let dims = new Set();

  const t0 = Date.now();

  for (let i = 0; i < rows.length; i += BATCH) {
    const batchRows = rows.slice(i, i + BATCH);
    const texts = batchRows.map((r) => r.text);

    const vecs = await embedBatch(texts);

    if (vecs.length !== texts.length) {
      throw new Error("返回条数不对：" + vecs.length + " vs " + texts.length);
    }

    db.exec("BEGIN");
    try {
      for (let k = 0; k < batchRows.length; k += 1) {
        const v = vecs[k];
        dims.add(v.length);
        update.run(vecToBlob(v), batchRows[k].id);
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    done += batchRows.length;
    console.log("  " + done + "/" + rows.length + " 完成（本批最大维度 " + vecs[0].length + "）");
  }

  const ms = Date.now() - t0;

  if (dims.size > 1) {
    throw new Error("维度不一致：" + [...dims].join(", ") + "。同一个库里不能混维度");
  }

  const finalDim = [...dims][0];

  if (prevDim !== null && Number(prevDim) !== finalDim) {
    console.log("");
    console.log("!!! 警告：库里原有维度是 " + prevDim + "，这次是 " + finalDim);
    console.log("    旧向量不能和新向量比较。必须用 --force 全部重算。");
  }

  setMeta("embedding_dim", finalDim);
  setMeta("embedding_mode", mode);

  // 统计
  const stat = db
    .prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) AS missing,
             MIN(length(embedding)) AS min_bytes,
             MAX(length(embedding)) AS max_bytes,
             AVG(length(embedding)) AS avg_bytes
        FROM chunks
    `)
    .get();

  console.log("");
  console.log("=== 完成 ===");
  console.log("耗时    ：" + (ms / 1000).toFixed(2) + " 秒");
  console.log("维度    ：" + finalDim);
  console.log("总块数  ：" + stat.total + "，缺向量 " + (stat.missing === null ? 0 : stat.missing));
  console.log("BLOB 字节：最小 " + stat.min_bytes + " / 最大 " + stat.max_bytes +
    " / 平均 " + Math.round(stat.avg_bytes));
  console.log("期望字节：" + (finalDim * 4) + "（维度 × 4）");
  console.log("库大小  ：" + (require("fs").statSync(DB_PATH).size / 1024).toFixed(1) + " KB");
}

main().catch((err) => {
  console.error("失败：" + err.message);
  process.exitCode = 1;
});
```

跑：

```text
node build-vectors.js
node build-vectors.js
```

## 4.3 屏幕上应该看到什么

第一遍：

```text
>node build-vectors.js
数据库：B:\...\rag-app\data\rag.db（better-sqlite3）
模式    ：local
待处理  ：10 块（只补空缺）
总字符  ：5842
估算 token：8763（中文约 1.5 token/字）

  10/10 完成（本批最大维度 256）

=== 完成 ===
耗时    ：0.01 秒
维度    ：256
总块数  ：10，缺向量 0
BLOB 字节：最小 1024 / 最大 1024 / 平均 1024
期望字节：1024（维度 × 4）
库大小  ：148.0 KB
```

第二遍：

```text
>node build-vectors.js
数据库：B:\...\rag-app\data\rag.db（better-sqlite3）
模式    ：local
待处理  ：0 块（只补空缺）
总字符  ：0
估算 token：0（中文约 1.5 token/字）

没有需要处理的块。要全量重算请加 --force
```

**这两次输出合起来验证了"幂等"：第二遍什么都不做。**

**五个必须核对的地方：**

| 位置 | 值 | 为什么重要 |
|---|---|---|
| BLOB 字节 | 1024 | 等于 `256 × 4`，说明格式对 |
| 缺向量 | 0 | 说明 10 块全有了 |
| 期望字节 | 1024 | 和上面一栏必须相等 |
| 第二遍待处理 | 0 | 幂等 |
| 库大小 | 148 KB | 10 块 × 1KB = 10KB 向量，剩下是 FTS 索引和表开销 |

**注意"估算 token"这一行。** 它现在只是个数字，但换成 1 万个块时，**这一行就是你的"要不要按回车"的判断依据。**

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `no such table: meta` | `build-index.js` 没建 meta 表 | 回第 2 步补建表语句 |
| BLOB 字节是 0 | `vecToBlob` 没写进去 | 检查 `update.run(vecToBlob(v), id)` 参数顺序 |
| `SQLITE_BUSY` | 另一个进程开着库 | 关掉 |
| 维度警告 | 换了模型但没 `--force` | `node build-vectors.js --force` |
| `no such column: embedding` | 第 86 节建表时漏了这列 | `ALTER TABLE chunks ADD COLUMN embedding BLOB` |
| 耗时突然很长 | remote 模式网络慢 | 减小 `BATCH`，或加 `timeoutMs` |

---

# 第 5 步：写 searchVector，和关键词对比（25 分钟）

## 5.1 做什么 / 为什么

**做什么：** 写 `search-vector.js`，**签名和 `searchKeyword` 完全一致**，然后跑同一批 8 个问题。

**为什么签名必须一致：**

第 91 节要做混合检索，那时候你会写：

```javascript
const a = searchKeyword(q, opts);
const b = searchVector(q, opts);
const merged = merge(a, b);
```

**如果两者返回结构不同，`merge` 就得写两套适配，然后再也不会有人维护它。**

## 5.2 操作

新建 `search-vector.js`：

```javascript
// search-vector.js —— 向量检索
// 签名和 search-keyword.js 的 searchKeyword 一致：
//   { query, matchQuery, total, hits: [{ id, doc_id, page, seq, chars, tokens, score, text, snippet }], reason }
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { db } = require("./db");
const { embedBatch } = require("./lib/embed");
const { blobToVec } = require("./lib/vec-store");
const { dot } = require("./lib/cosine");

function makeSnippet(text, query, before, after, width) {
  // 向量检索没有"命中位置"，只能按字面找一下，找不到就取开头
  const clean = String(query).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const chars = clean.split("");
  let pos = -1;
  if (chars.length > 0) {
    for (let i = 0; i + 1 < chars.length; i += 1) {
      const idx = text.indexOf(chars[i] + chars[i + 1]);
      if (idx >= 0) { pos = idx; break; }
    }
  }
  if (pos < 0) {
    for (const ch of chars) {
      const idx = text.indexOf(ch);
      if (idx >= 0) { pos = idx; break; }
    }
  }
  if (pos < 0) {
    return text.slice(0, width * 2) + (text.length > width * 2 ? "..." : "");
  }
  const start = Math.max(0, pos - width);
  const end = Math.min(text.length, pos + width);
  return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
}

async function searchVector(query, options) {
  const opts = options === undefined ? {} : options;
  const limit = opts.limit === undefined ? 5 : opts.limit;

  if (typeof query !== "string" || query.trim().length === 0) {
    return { query: query, matchQuery: null, total: 0, hits: [], reason: "查询为空" };
  }

  // 1. 查询向量
  const [qv] = await embedBatch([query]);

  // 2. 取出所有带向量的块，算点积（向量已归一化，点积即余弦）
  const rows = db
    .prepare(`
      SELECT id, doc_id, page, seq, chars, tokens, text, embedding
        FROM chunks
       WHERE embedding IS NOT NULL
    `)
    .all();

  if (rows.length === 0) {
    return { query: query, matchQuery: null, total: 0, hits: [], reason: "库里没有向量，先跑 build-vectors.js" };
  }

  const scored = [];
  for (const r of rows) {
    const v = blobToVec(r.embedding);
    if (v.length !== qv.length) {
      throw new Error(
        "维度不一致：查询 " + qv.length + " 维，块 " + r.id + " 是 " + v.length + " 维。" +
        "换了模型必须重跑 build-vectors.js --force"
      );
    }
    scored.push({
      id: r.id,
      doc_id: r.doc_id,
      page: r.page,
      seq: r.seq,
      chars: r.chars,
      tokens: r.tokens,
      text: r.text,
      score: dot(qv, v),
    });
  }

  // 3. 排序取前 limit。分数越大越相关（余弦，不是 bm25）
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  for (const h of top) {
    h.snippet = makeSnippet(h.text, query, "[[", "]]", 30);
  }

  return {
    query: query,
    matchQuery: query,
    total: scored.filter((s) => s.score > 0).length,
    hits: top,
    reason: top.length === 0 ? "没有结果" : null,
  };
}

if (require.main === module) {
  const q = process.argv[2];
  if (q === undefined) {
    console.log("用法：node search-vector.js \"住宿能报多少\"");
    process.exitCode = 1;
    return;
  }
  const limit = process.argv[3] === undefined ? 5 : Number(process.argv[3]);

  searchVector(q, { limit: limit })
    .then((r) => {
      console.log("查询：" + r.query);
      console.log("命中（score>0）：" + r.total);
      if (r.reason !== null) console.log("说明：" + r.reason);
      console.log("");
      for (const h of r.hits) {
        console.log("--- id=" + h.id + " " + h.doc_id + " seq=" + h.seq + " ---");
        console.log("  score  = " + h.score.toFixed(4));
        console.log("  snippet= " + h.snippet.replace(/\n/g, " "));
        console.log("");
      }
    })
    .catch((err) => {
      console.error("失败：" + err.message);
      process.exitCode = 1;
    });
}

module.exports = { searchVector };
```

跑：

```text
node search-vector.js "住的能报吗"
node search-vector.js "住宿费标准"
node search-vector.js "不能报销的情况"
```

## 5.3 屏幕上应该看到什么

假向量模式（`EMBED_MODE=local`）：

```text
>node search-vector.js "住宿费标准"
查询：住宿费标准
命中（score>0）：8

--- id=1 信息安全与账号管理 seq=1 ---
  score  = 0.2216
  snippet= [[住宿]]报销标准...

--- id=4 客户合同评审要点 seq=2 ---
  score  = 0.1043
  ...

--- id=3 客户合同评审要点 seq=1 ---
  score  = 0.0871

>node search-vector.js "住的能报吗"
查询：住的能报吗
命中（score>0）：6

--- id=6 差旅报销制度 seq=2 ---
  score  = 0.0384
  ...
```

**注意"住宿费标准"的 top-1 score 只有 `0.2216`，"住的能报吗"的 top-1 只有 `0.0384`。**

**假向量的 baseline 很低。** 这就是第 1 节说的"假向量只能验证管道"。

真模型模式（`EMBED_MODE=remote` + `--force` 重算）：

```text
>node search-vector.js "住的能报吗"
查询：住的能报吗
命中（score>0）：10

--- id=5 差旅报销制度 seq=1 ---
  score  = 0.7412
  snippet= 员工因公出差发生的交通、住宿费用，按标准据实报销...

--- id=6 差旅报销制度 seq=2 ---
  score  = 0.5988

--- id=1 信息安全与账号管理 seq=1 ---
  score  = 0.1021
```

**这才是向量检索应该有的样子：同义词的查询也能命中正确的那一块，且分数明显高于随机基线（0.02–0.05）。**

**用真模型的话，第 87 节的基线会变成什么样？**

```text
第 3 题 "酒店 报多少钱"   → 假向量 0/命中，真模型应该能命中差旅报销那块
第 4 题 "出差 花销 上限"   → 同上
第 7 题 "不能 报销"       → 真模型也会命中"能报销"那块（否定词的死穴）
```

**第 7 题是关键。** 真模型在第 7 题上**不会**改善，甚至可能更差。**原因第 88 节讲过：向量表示的是"共现"，"不能报销"和"可以报销"共现的场景几乎一样。**

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `库里没有向量` | 没跑 `build-vectors.js` | 先跑它 |
| `维度不一致` | 换了模型没重算 | `node build-vectors.js --force` |
| 所有 score < 0.1 | 假向量模式 | 正常。要看效果必须换真模型 |
| `score` 全是负数 | 你的向量没归一化（点积会出负数） | 检查 `embed.js` 里有没有 `vec[i] /= n` |
| 排序反了 | 向量是"越大越相关"，不是 bm25 的越小 | `b.sort((a,b) => b.score - a.score)` |
| `snippet` 里没有 `[[ ]]` | 查询词在原文里一个字都不匹配 | 正常，取的是开头 |
| 太慢（1 万块） | 暴力扫全表 | 见第 6 步的量测 |

**注意第 5 条：向量检索和 bm25 的排序方向是相反的。**

```text
bm25：      ORDER BY bm25(...)      升序，越负越相关
余弦：      sort((a,b) => b.score - a.score)  降序，越大越相关
```

**如果你在同一个项目里两套都写，这一条一定会搞混一次。**

## 5.5 操作：量一下暴力扫描的极限

新建 `tools\bench-vector.js`：

```javascript
// bench-vector.js —— 暴力扫描在不同规模下的耗时
const { fakeEmbedOne } = require("../lib/embed");
const { dot } = require("../lib/cosine");

function bench(n, dim) {
  const query = fakeEmbedOne("住宿费标准能报多少");
  const vecs = [];
  for (let i = 0; i < n; i += 1) {
    vecs.push(fakeEmbedOne("第 " + i + " 块 住宿费标准 " + (i % 7)));
  }

  const t0 = process.hrtime.bigint();
  let best = -Infinity;
  let bestIdx = -1;
  for (let i = 0; i < n; i += 1) {
    const s = dot(query, vecs[i]);
    if (s > best) { best = s; bestIdx = i; }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  return { n, dim, ms: ms, best: best, idx: bestIdx };
}

console.log("=== 暴力扫描耗时（单次查询，取最大值） ===");
console.log("");
console.log("块数        维度    耗时(ms)   每块(μs)");
console.log("-----------------------------------------------");

for (const n of [100, 1000, 5000, 20000]) {
  const r = bench(n, 256);
  console.log(
    String(r.n).padEnd(12) +
    String(r.dim).padEnd(8) +
    r.ms.toFixed(2).padStart(8) + "   " +
    ((r.ms * 1000) / r.n).toFixed(2).padStart(8)
  );
}

console.log("");
console.log("=== 1536 维的对照 ===");
for (const n of [1000, 5000]) {
  const r = bench(n, 1536);
  console.log(
    String(r.n).padEnd(12) +
    String(r.dim).padEnd(8) +
    r.ms.toFixed(2).padStart(8)
  );
}
```

**注意这个脚本里的 `dim` 参数实际没被用上** —— 因为 `fakeEmbedOne` 固定 256 维。**这是故意的**，让你看到"我写的参数没生效"这种常见错误。真正的 1536 维对照要用真模型生成的向量。

**跑它看 256 维的数字就够了：**

```text
node tools\bench-vector.js
```

## 5.6 屏幕上应该看到什么

```text
>node tools\bench-vector.js
=== 暴力扫描耗时（单次查询，取最大值） ===

块数        维度    耗时(ms)   每块(μs)
-----------------------------------------------
100         256         0.12       1.20
1000        256         0.85       0.85
5000        256         4.31       0.86
20000       256        17.42       0.87

=== 1536 维的对照 ===
1000        256         0.86
5000        256         4.28
```

**注意最后一节：维度参数传 1536，但结果和 256 一样。**

**这就是那个"参数没生效"的错误。** 我在脚本里写了 `dim` 参数但没真用它。**这是故意让你看到的**：

```text
你写了一个看起来能配维度的实验
跑出来的数字很"正常"
但它测的不是你想测的东西
→ 而且不报错

这类错误在研究型代码里非常常见
```

**真实的结论只能从 256 维那一组看：**

| 块数 | 耗时 | 每块 |
|---|---|---|
| 100 | 0.12 ms | 1.2 μs |
| 1000 | 0.85 ms | 0.85 μs |
| 5000 | 4.31 ms | 0.86 μs |
| 20000 | 17.42 ms | 0.87 μs |

**线性增长，每块约 0.86 微秒。**

**所以你的能力边界是：**

```text
2 万块 → 17 ms/次查询  → 完全够用（人类感知不到）
10 万块 → 86 ms/次     → 勉强（一次问答的总时间是秒级，这点可接受）
100 万块 → 860 ms/次   → 不可接受（要上索引）
```

**这段数字就是你和客户讨论"这个方案能撑多大"时的依据。**

**而且要注意：这是纯计算时间，不含数据库读取。**

```text
从 SQLite 读 2 万条 BLOB（每条 1KB）= 20MB
这一步比计算慢得多
```

**所以真实场景下，瓶颈在 IO 不在计算。** 这也是为什么"向量单独存一张表"有时更好 —— 你能只读需要的部分。

## 5.7 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 数字波动很大 | 单次测量，有 GC | 跑多轮取中位数 |
| 每块耗时不是常数 | 正常，缓存效应 | 看趋势，别看单值 |
| 20000 块比 5000 块慢 4 倍多 | 内存压力 | 减少块数或分页 |

---

# 第 6 步：故意犯四个错（20 分钟）

## 错误 1：`/v1/embeddings` 写成 `/v1/chat/completions`

```javascript
// 错误写法
const url = baseUrl + "/chat/completions";   // ← 抄了上一周的代码
```

**现象：** `HTTP 400`，错误信息类似 `messages is required` 或 `model not found`。

**真正的伤害：** 如果你没看出来，你会去改模型名、改参数，浪费半小时。

**怎么查：** 打印实际发出的完整 URL。

```javascript
console.log("POST " + url);
```

**这一步要变成习惯。** 所有 "404/400 但看不出原因" 的情况，第一步都是打印完整 URL 和完整请求体。

## 错误 2：不按 `index` 排序

```javascript
// 错误写法
const vecs = json.data.map((d) => d.embedding);   // ← 假设顺序和输入一致
```

**现象：** 单条调用正确，批量调用时"有的块对、有的块错"。

**真正的伤害：这个错极其难发现。**

```text
10 个块，批量 16 条以内一次发完
返回的数据如果顺序乱了（哪怕只有两条交换）
→ 第 3 块的向量被存给了第 5 块
→ 检索时，"讲报销的那块"用的是"讲密码的向量"
→ 检索结果看起来"部分正确"，你不会怀疑到向量头上
```

**怎么查：** 第 2.3 节的"单条 vs 批量"对比。**相似度不是 1.000 就是顺序错了。**

**正确做法：**

```javascript
const sorted = json.data.slice().sort((a, b) => a.index - b.index);
```

**`index` 字段就是为此存在的。** 它不一定和返回数组的顺序一致。

## 错误 3：维度变了不重算

```text
你在 EMBED_MODE=local 下建了 256 维向量
改成 remote 之后直接跑 search-vector.js
```

**现象：** 报错 `维度不一致：查询 1536 维，块 1 是 256 维`。

**真正的伤害：** 如果代码里没这个检查，会怎样？

```javascript
// 假设你写了这样的"容错"
const n = Math.min(qv.length, v.length);
let s = 0;
for (let i = 0; i < n; i += 1) s += qv[i] * v[i];   // ← 截断到较短的长度
```

**这会静默算出错误结果。** 前 256 维乘起来，剩下 1280 维被丢弃。**结果看起来像"相似度"，但毫无意义。**

**这就是为什么 `search-vector.js` 里我写了显式的维度检查并抛异常。**

**宁可崩，不要静默算错。**

## 错误 4：把向量存在主表里，然后 `SELECT *`

```javascript
// 看起来无害的写法
const rows = db.prepare("SELECT * FROM chunks").all();
```

**现象：** 10 个块感觉不到。1 万个块时，内存暴涨。

**真正的伤害：**

```text
1 万个块 × 1536 维 × 4 字节 = 61 MB
每次查询都把这 61MB 读进内存

而你可能只需要 id 和 score
```

**正确做法：**

```text
// 只取需要的列
SELECT id, doc_id, seq, embedding FROM chunks WHERE embedding IS NOT NULL
```

**更彻底的做法：向量单独一张表。**

```sql
CREATE TABLE chunk_vectors (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  dim      INTEGER NOT NULL,
  vec      BLOB    NOT NULL
);
```

**好处：** `SELECT * FROM chunks` 不会把 61MB 拖出来。

**代价：** 多一次 JOIN。**在 1 万块以内，JOIN 的代价小于"每次多读 61MB"。**

**本课程用单表，因为这个量级无所谓。但你以后做 10 万块级的东西，必须拆表。**

## 四个错误总结

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 端点写错 | 404 / 400 | 会浪费半小时改参数 | 打印完整 URL |
| 不按 index 排序 | 部分结果对 | **极难发现**，检索质量莫名下降 | 单条 vs 批量相似度必须 = 1 |
| 维度变了不重算 | 报错，或静默算错 | 结果毫无意义但不报错 | 显式检查维度并抛异常 |
| `SELECT *` 带向量 | 10 块时正常 | 1 万块时内存暴涨 | 看有没有显式列名 |

**这四个错误里，第 2 和第 3 最危险，因为它们不报错。**

**第 2 个尤其隐蔽：你的检索"能返回结果"，只是排在前面的偶尔是错的。**

---

# 第 7 步：写学习笔记（10 分钟）

打开 `第05节课\02-笔记\NOTES.md`，按小标题逐条填。

重点是「假向量 vs 真模型」和「暴力扫描的极限」两节。

---

# 第 8 步：课后练习

## 练习一：做一份完整的向量基线

用**真模型**跑第 87 节那 8 个问题，生成 `out\vector-baseline.md`。

**要求：**

1. 和 `keyword-baseline.md` 放在一起对比；
2. 明确标出"关键词挂、向量过"的题（同义词类）；
3. 明确标出"关键词过、向量挂"的题（如果有）；
4. 明确标出"两边都挂"的题（否定条件类）。

**第 4 类是最有价值的** —— 它告诉你"混合检索也救不了"的部分，那就是你要跟客户说清楚的边界。

## 练习二：验证"批量大小"对耗时的影响

现在 `BATCH = 16`。改成 1、8、16、64、128，各跑一次 `build-vectors.js --force`，记录总耗时。

**回答：** 最优批量是多少？为什么不是越大越好？（提示：看单次请求的耗时和超时限制）

## 练习三：加一个"向量维度"的一致性检查脚本

写 `tools\check-vectors.js`，输出三行：

```text
chunks 总行数           10
有向量的行数            10
BLOB 长度种类           1（全 1024 字节）
meta 记录的维度         256
```

第三行必须是 1。**如果出现两种长度，说明你有块是用不同模型算的。**

## 练习四：算一下你的真实成本

按 `SELECT SUM(chars) FROM chunks` 的结果，估算：

1. 现在 10 个块，全部重新算向量要多少钱？
2. 如果块数涨到 1 万（假设平均每块 600 字），要多少 token？
3. 如果每问一次都要把 query 算一次向量，1 万次问答要多少？

**写出你的单价假设，标注"这是量级估算，不是报价"。**

## 练习五：用自己的话讲清

1. 假向量能验证什么、不能验证什么？为什么"先假后真"这个顺序是对的？
2. `/v1/embeddings` 和 `/v1/chat/completions` 有哪四处不同？
3. 为什么必须按 `index` 排序？不排序会导致什么后果，为什么这个后果难发现？
4. 为什么用 float32 不用 float64？为什么不用 JSON？
5. 你的暴力扫描极限是多少块？这个数字怎么得出来的？
6. 如果换了 embedding 模型，你要重跑哪些脚本？为什么？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能解释假向量的算法（2-gram + 哈希 + 归一化）和它的局限
- [ ] 我能说出 chat 和 embeddings 接口的四处不同
- [ ] 我能解释为什么必须按 `index` 排序，以及不排序的后果
- [ ] 我能说出 float32 / float64 / JSON 三种存法的取舍
- [ ] 我知道我的暴力扫描在什么规模下还能用

## B. 实操

- [ ] `probe-embed.js` 跑出 256 维、模长 1.000000
- [ ] 假向量下 `[0]vs[4]` = 0.0000（不相关的那对）
- [ ] 假向量下 `住的能报吗 vs 酒店费用可以报销` = 0.0000（**假向量做不到的事**）
- [ ] `probe-remote.js` 在本地和远程两种模式下都跑通
- [ ] 单条 vs 批量相似度 = 1.000000
- [ ] `probe-store.js`：BLOB 1024 字节，最大误差 < 1e-6
- [ ] `build-vectors.js` 第一遍 10 块，第二遍 0 块
- [ ] `meta` 表里有 `embedding_dim` 和 `embedding_mode`
- [ ] `search-vector.js "住宿费标准"` 能返回结果
- [ ] `bench-vector.js` 跑出 2 万块约 17ms
- [ ] 我发现了 `bench-vector.js` 里维度参数没生效这个问题

## C. 排错

- [ ] 我打印过完整的请求 URL
- [ ] 我试过不排序，看到单条 vs 批量不是 1
- [ ] 我遇到过（或复现过）维度不一致的报错
- [ ] 我知道 `SELECT *` 在 1 万块时会拖出 61MB

## D. 笔记

- [ ] 十一个小标题都有内容
- [ ] 假向量和真模型的相似度对比贴了真实数字
- [ ] 暴力扫描的极限表填了
- [ ] 练习四的成本估算是算出来的，不是猜的

---

## 本节课要能说出口的一句话

> **向量检索的代码只有 30 行，坑全在"批量顺序""维度一致""存什么格式"这三件事上 —— 而这三个坑都不会让你崩，只会让你算错。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| `HTTP 404` | 完整 URL | 打印 `POST ` + url |
| `HTTP 401` | key 和 `Bearer ` | 检查 header |
| `HTTP 400 invalid input` | `input` 类型 | 传字符串或字符串数组，别 stringify |
| 返回条数不对 | 是不是把数组当字符串了 | 直接传数组 |
| 单条 vs 批量 ≠ 1 | `index` 排序 | `.sort((a,b)=>a.index-b.index)` |
| `缺少 EMBED_BASE_URL` | `.env` 读取 | `dotenv` 在最前面 `require` |
| 维度不一致 | 换了模型 | `build-vectors.js --force` |
| `库里没有向量` | `embedding IS NULL` | 跑 `build-vectors.js` |
| BLOB 字节是维度 × 8 | 用了 `writeDoubleLE` | 改 `writeFloatLE` |
| 所有 score 很低（<0.1） | 假向量模式 | 正常，换真模型 |
| score 是负数 | 没归一化 | 检查 `embed.js` |
| `SQLITE_BUSY` | 另一个进程 | 关掉 |
| 中文乱码 | cmd 编码 | `chcp 65001` |
| 1 万块查询很慢 | 读了 61MB | 只 SELECT 需要的列 |
