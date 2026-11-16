# 第 44 节课：记账——让每一次调用都留下痕迹

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你会算"一次多少钱"。但一个真实系统一天几千次调用，你要回答的是"这周花了多少、哪个功能最贵、谁用的最多"。
> 今天建账本：**每一次调用写一行，然后学会用一行命令查出任意维度。**

**建议用时**：130 分钟
**你需要先完成**：第 43 节课（`calcCost` 能算，`chat` 返回 `usage`）

---

# 第 0 步：为什么必须落成文件（10 分钟）

## 0.1 只 `console.log` 的问题

**第 43 节你算完就打印了。这在开发时够用，在生产里不行：**

```text
① 终端关了，数据没了
② 一天几千行，滚上去找不到
③ 没法按天/按用户/按功能聚合
④ 出问题时你没法回答"昨天下午三点那次为什么花了 0.4 元"
```

## 0.2 记账要回答的六个问题

**一张表设计得对不对，看它能不能回答这六个：**

| # | 问题 | 需要什么字段 |
|---|---|---|
| 1 | 今天花了多少 | 时间、成本 |
| 2 | 哪个功能最贵 | 功能标识 |
| 3 | 哪个用户花最多 | 用户标识 |
| 4 | 平均每次多少钱 | 成本、次数 |
| 5 | 有没有异常贵的调用 | 成本、输入输出 token |
| 6 | 是不是有人在刷 | 用户、时间、次数 |

**六个问题 → 至少六个字段。少一个，你就有一类问题答不出来。**

## 0.3 为什么用 JSONL 不用数据库

```text
优点：
① 追加写，不会锁，多进程也安全
② 坏了只坏一行，不会整个库坏
③ 一行一条，grep/awk 直接能用
④ git 里能 diff（虽然是数据，但小规模时很有用）

缺点：
① 文件会一直变大
② 复杂聚合要写代码
```

**这一周用 JSONL 是对的。** 到了第 5 周（SQL）你会换成数据库表，但**字段设计完全一样** —— 这才是今天真正要学的东西。

## 0.4 今天的交付物

| 文件 | 位置（都在 `第43节课/03-练习代码/token-lab` 里） | 内容 |
|---|---|---|
| `src/meter.js` | `src/` | 记账：写一行、读全部、聚合 |
| `src/llm.js` | `src/` | 改：调用后自动记账 |
| `experiments/e02-meter.js` | `experiments/` | 造 30 条假记录 + 跑聚合 |
| `scripts/report.js` | `scripts/` | 命令行报表 |
| `data/usage.jsonl` | `data/` | 账本本体 |

---

# 第 1 步：设计一条记录（20 分钟）

## 1.1 完整字段表

**先写下来，再写代码。**

```text
必填（没有这些，账就没意义）：
  ts            时间戳（ISO 8601）
  cost          成本（元，浮点）
  promptTokens  输入 token
  completionTokens 输出 token

强烈建议：
  model         用的哪个模型
  feature       哪个功能（chat / extract / rewrite ...）
  userId        谁用的（匿名时用 "anon"）
  requestId     一次请求的唯一 id（用来串日志）

排错用：
  ms            耗时（毫秒）
  ok            成功/失败
  status        状态（200 / 429 / 500 / 499）
  errCode       错误码（TIMEOUT / ABORTED / UPSTREAM / JSON_FAILED）
  estimated     token 是否是估算的
  stream       是否流式
```

## 1.2 一条真实的记录

```json
{"ts":"2026-11-16T07:31:12.482Z","userId":"u_1024","feature":"chat","model":"mid-model","promptTokens":1230,"completionTokens":198,"cost":0.004044,"ms":3210,"ok":true,"status":200,"estimated":false,"stream":false,"requestId":"r_8f3a2c"}
```

**四个设计决策，逐个说清为什么：**

### 决策一：`ts` 用 ISO 字符串，不用时间戳数字

```text
"2026-11-16T07:31:12.482Z"   人能直接读，grep 能按天匹配
1794900000000                要换算才知道是哪天
```

**代价：** 字符串比较比数字慢。**但你这里一天几千条，不在乎。**

**能用 `grep "2026-11-16"` 直接筛，比省那几微秒值钱得多。**

### 决策二：`cost` 存"元"，不存"分"或"厘"

**理由：和你的价格表单位对齐，减少换算。**

**但必须注意浮点：**

```javascript
0.1 + 0.2 === 0.30000000000000004   // 经典问题
```

**存的时候用 `Number(cost.toFixed(6))`，保留 6 位小数（微元级）。**

**为什么 6 位：** 一次调用可能是 0.000004 元，4 位就变成 0 了。

### 决策三：`userId` 必须有，即使现在是匿名

**否则你第 8 周加了登录，所有历史记录的 `userId` 都是 `undefined`，没法归集。**

**现在写 `"anon"`，以后换成真 id。字段不用改，只是值变了。**

**这就是"提前留字段"的价值：改字段要迁移数据，改值不用。**

### 决策四：`ok` 和 `status` 分开

```text
ok: false, status: 429   → 限流，没扣钱
ok: false, status: 499   → 用户取消，扣了一部分钱
ok: false, status: 500   → 上游错误，可能没扣钱
ok: true,  status: 200   → 正常
```

**失败也要记账。** 因为：

```text
① 失败率高说明系统有问题（要告警）
② 有些失败是花钱的（499 中断前已经生成了 300 token）
③ 不记失败，你会以为"失败不花钱"，实际在漏
```

## 1.3 一个必须想清的问题：一条记录对应什么

**三种可能：**

```text
A. 一次 HTTP 请求 → 一次模型调用      （最简单，一对一）
B. 一次 HTTP 请求 → 多次模型调用      （比如第 41 节的流水线，2-6 次）
C. 一次模型调用 → 拆成多个子项        （罕见，忽略）
```

**你现在是 A 和 B 混着。**

**选 A 还是 B 的关键是：`requestId` 怎么用。**

**推荐做法：**

```text
每条记录一次模型调用（A 粒度）
同一个用户请求的多次调用，共用同一个 requestId
```

**这样：**

```text
按 requestId 分组求和 = 一次用户请求的真实成本
按记录条数 = 模型调用次数
两个指标都有了
```

**这是能同时回答"用户觉得贵"和"我们花了多少"的唯一设计。**

---

# 第 2 步：写记账模块（30 分钟）

## 2.1 新建 `src/meter.js`

```javascript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const DATA_DIR = path.join(ROOT, "data");
const USAGE_FILE = path.join(DATA_DIR, "usage.jsonl");

const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

export const newRequestId = () =>
  `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const record = (entry) => {
  ensureDir();

  const line = JSON.stringify({
    ts: entry.ts || new Date().toISOString(),
    userId: entry.userId || "anon",
    feature: entry.feature || "unknown",
    requestId: entry.requestId || newRequestId(),
    model: entry.model || "unknown",
    promptTokens: entry.promptTokens || 0,
    completionTokens: entry.completionTokens || 0,
    cost: Number((entry.cost || 0).toFixed(6)),
    ms: entry.ms || 0,
    ok: Boolean(entry.ok),
    status: entry.status || 0,
    errCode: entry.errCode || null,
    estimated: Boolean(entry.estimated),
    stream: Boolean(entry.stream),
  });

  // 追加写，一行一条
  fs.appendFileSync(USAGE_FILE, `${line}\n`, "utf8");
};

export const readAll = () => {
  if (!fs.existsSync(USAGE_FILE)) return [];

  return fs
    .readFileSync(USAGE_FILE, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null; // 坏行跳过，不要让一行坏数据毁掉整个报表
      }
    })
    .filter(Boolean);
};

export const dayOf = (isoString) => isoString.slice(0, 10);
```

## 2.2 逐段讲清四个技术点

### 技术点一：`appendFileSync` 而不是 `writeFileSync`

```javascript
writeFileSync(file, line)        // 每次覆盖！只留最后一行
appendFileSync(file, line)       // 追加，保留所有
```

**用 `writeFileSync` 是这一节最容易犯的错，而且不会报错 —— 你会以为记了 30 条，实际只有 1 条。**

**验证方式：跑完看 `usage.jsonl` 的行数。**

### 技术点二：`appendFileSync` 是同步的

**你可能会想"同步会阻塞，应该用异步"。**

**这里必须同步，理由：**

```text
① 它是本地小文件追加，微秒级
② 异步的话，进程退出时可能还没写完 → 丢账
③ 多进程同时追加时，同步写更不容易交错
```

**在"记账"这种场景，可靠 > 性能。** 一天几千行的小文件，同步完全不是瓶颈。

### 技术点三：坏行跳过，不抛错

```javascript
try { return JSON.parse(line); } catch { return null; }
```

**为什么：**

```text
① 进程被杀时，最后一行可能写了一半
② 有人手动编辑过文件
③ 磁盘满了写坏了
```

**一行坏数据不能让你整个报表打不开。** 这是"数据是脏的"这个现实的应对。

**但要能发现：** 加一个统计"跳过了几行"的返回值（练习会做）。

### 技术点四：`Number((cost).toFixed(6))`

**为什么不是 `toFixed(6)` 直接用：**

```javascript
typeof (0.004044).toFixed(6)   // "string"
```

**`toFixed` 返回字符串，`JSON.stringify` 之后会变成 `"0.004044"`。**

**然后你的 `sum += entry.cost` 会变成字符串拼接！**

```javascript
0 + "0.004" = "00.004"
```

**这个 bug 极隐蔽。** 报表会显示一个巨大的数字，你会以为是算错了，实际是拼字符串。

## 2.3 加聚合函数

**继续在 `meter.js` 里加：**

```javascript
export const sumBy = (rows, groupFn) => {
  const map = new Map();

  rows.forEach((row) => {
    const key = groupFn(row) ?? "unknown";
    const current = map.get(key) || { cost: 0, calls: 0, promptTokens: 0, completionTokens: 0, fails: 0 };

    current.cost += row.cost;
    current.calls += 1;
    current.promptTokens += row.promptTokens;
    current.completionTokens += row.completionTokens;
    if (!row.ok) current.fails += 1;

    map.set(key, current);
  });

  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value, avgCost: value.cost / value.calls }))
    .sort((a, b) => b.cost - a.cost);
};
```

**这个函数一个函数干四件事（按天、按功能、按用户、按模型）。**

**为什么不做四个函数：** 因为聚合逻辑完全一样，只是分组键不同。**一个 `sumBy(rows, r => r.feature)` 就够了。**

---

# 第 3 步：把记账接进调用（25 分钟）

**这是最关键的一步：让记账自动发生，而不是"记得去记"。**

## 3.1 改 `src/llm.js`

**在 `chat` 函数里包一层。** 不要改原有逻辑，在出口处记账。

```javascript
import { record, newRequestId } from "./meter.js";
import { calcCost } from "./pricing.js";

// 把原来的 chat 改名成 chatRaw（一行不改）
const chatRaw = async (messages, options = {}) => {
  // ... 第 43 节的原代码 ...
};

// 新的 chat：包一层记账
export const chat = async (messages, options = {}) => {
  const started = Date.now();
  const requestId = options.requestId || newRequestId();

  try {
    const result = await chatRaw(messages, options);

    const cost = calcCost({
      model: result.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    });

    record({
      userId: options.userId,
      feature: options.feature,
      requestId,
      model: result.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      cost: cost.total,
      ms: Date.now() - started,
      ok: true,
      status: 200,
      estimated: result.usage.estimated,
      stream: Boolean(options.stream),
    });

    return { ...result, requestId };
  } catch (error) {
    record({
      userId: options.userId,
      feature: options.feature,
      requestId,
      model: options.model || CONFIG.llm.model,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      ms: Date.now() - started,
      ok: false,
      status: error.statusCode || 500,
      errCode: error.statusCode === 504 ? "TIMEOUT" : error.statusCode === 499 ? "ABORTED" : "UPSTREAM",
    });

    throw error;
  }
};
```

## 3.2 四个关键设计

### 设计一：失败也记，但 `cost: 0`

**这里有个陷阱：失败真的免费吗？**

```text
上游 500 之前就报错    → 没生成，0 成本 ✅
超时前已生成 300 token → 已经花掉了 ❌
用户 499 中断          → 已生成的 token 已经花了 ❌
```

**所以"失败记 0"是不准确的。**

**准确做法：失败时也估算已消耗的 token。**

**但你现在还不知道怎么拿（超时的时候响应都没回来）。**

**折中方案（今天采用）：**

```text
失败记 cost: 0，但记 status 和 errCode
报表里单独给出"失败次数"和"失败率"
把这些当作"已知的账目误差"，在心里留 1-3% 的余量
```

**这个余量要写进你的报价。** 第 49 节会算进去。

### 设计二：`requestId` 由最外层生成，往下传

```javascript
// 一次用户请求
const requestId = newRequestId();

await chat(messages, { requestId, feature: "chat" });   // 第 1 次
await chat(messages2, { requestId, feature: "chat" });  // 第 2 次（比如审核）
```

**这样两条记录 `requestId` 相同，你能算出"一次用户请求的真实成本"。**

**如果每次调用自己生成，你就永远算不出这个数。**

### 设计三：`feature` 手工传，不自动推断

**有人会想"从调用栈推断"或"从 messages 内容猜"。**

**别做。** 显式传 `feature: "extract"`，一个字段的事，比任何推断都可靠。

**推断错了，你的成本归因整个是错的。**

### 设计四：`record` 失败不能影响主流程

**如果磁盘满 / 没有写权限，`appendFileSync` 会抛错。**

**这个错会冒到用户那里，变成"AI 功能坏了" —— 而实际只是记账记不上。**

**加保护（练习会让你做）：**

```javascript
export const record = (entry) => {
  try {
    // ... 原逻辑
  } catch (error) {
    console.error("[meter] 记账失败：", error.message);
    // 不抛
  }
};
```

**记账是旁路，不能拖垮主路。**

## 3.3 改 `e01-price.js` 验证

**`e01` 里调用 `chat` 时补两个参数：**

```javascript
      { temperature: 0.7, maxTokens: 800, feature: "price-test", userId: "u_self" }
```

**跑一遍：**

```text
npm run e01
```

**然后看账本：**

```text
type data\usage.jsonl
```

**应该是 4 行。**

**如果只有 1 行，你用了 `writeFileSync`。**

---

# 第 4 步：造 30 条假数据（15 分钟）

**真跑 30 次要花钱。用假数据学聚合更快。**

## 4.1 新建 `experiments/e02-meter.js`

```javascript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, sumBy, dayOf } from "../src/meter.js";
import { calcCost, formatMoney } from "../src/pricing.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const DATA_DIR = path.join(ROOT, "data");
const SEED_FILE = path.join(DATA_DIR, "usage.seed.jsonl");

const FEATURES = ["chat", "extract", "rewrite", "classify"];
const USERS = ["u_1024", "u_2048", "u_4096", "anon"];
const MODELS = ["cheap-model", "mid-model"];

const pick = (arr, i) => arr[i % arr.length];

const buildSeed = () => {
  const rows = [];
  const base = Date.now() - 3 * 24 * 3600 * 1000;

  for (let i = 0; i < 30; i += 1) {
    const ts = new Date(base + i * 2.5 * 3600 * 1000).toISOString();
    const model = pick(MODELS, i);
    const promptTokens = 200 + ((i * 137) % 1800);
    const completionTokens = 80 + ((i * 53) % 400);
    const cost = calcCost({ model, promptTokens, completionTokens }).total;
    const failed = i % 11 === 0;

    rows.push({
      ts,
      userId: pick(USERS, i),
      feature: pick(FEATURES, i % 4),
      requestId: `r_seed_${i}`,
      model,
      promptTokens: failed ? 0 : promptTokens,
      completionTokens: failed ? 0 : completionTokens,
      cost: failed ? 0 : Number(cost.toFixed(6)),
      ms: 800 + ((i * 91) % 5000),
      ok: !failed,
      status: failed ? 500 : 200,
      errCode: failed ? "UPSTREAM" : null,
      estimated: false,
      stream: false,
    });
  }

  return rows;
};

const printTable = (title, rows) => {
  console.log(`\n===== ${title} =====`);
  console.table(
    rows.map((row) => ({
      分组: row.key,
      次数: row.calls,
      成本: formatMoney(row.cost),
      平均: formatMoney(row.avgCost),
      失败: row.fails,
      输入token: row.promptTokens,
      输出token: row.completionTokens,
    }))
  );
};

const main = () => {
  // 写种子文件（不污染真实账本）
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEED_FILE, buildSeed().map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");

  const rows = fs
    .readFileSync(SEED_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  console.log(`种子数据：${rows.length} 条`);

  const total = rows.reduce((sum, row) => sum + row.cost, 0);
  const calls = rows.length;
  const fails = rows.filter((row) => !row.ok).length;

  console.log(`总成本：${formatMoney(total)}　调用次数：${calls}　平均：${formatMoney(total / calls)}`);
  console.log(`失败：${fails} 次（${((fails / calls) * 100).toFixed(1)}%）`);

  printTable("按天", sumBy(rows, (row) => dayOf(row.ts)));
  printTable("按功能", sumBy(rows, (row) => row.feature));
  printTable("按用户", sumBy(rows, (row) => row.userId));
  printTable("按模型", sumBy(rows, (row) => row.model));

  // 最贵的十次
  console.log("\n===== 最贵的 5 次 =====");
  console.table(
    [...rows]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map((row) => ({
        ts: row.ts,
        用户: row.userId,
        功能: row.feature,
        成本: formatMoney(row.cost),
        输入: row.promptTokens,
        输出: row.completionTokens,
      }))
  );
};

main();
```

## 4.2 加脚本并跑

```json
    "e02": "node experiments/e02-meter.js"
```

```text
npm run e02
```

**不花钱，秒出结果。**

## 4.3 你要从输出里读出的四件事

### 第一：按天

```text
2026-11-14  10 次  0.0312 元
2026-11-15  10 次  0.0289 元
2026-11-16  10 次  0.0331 元
```

**这一列就是"日成本"。乘以 30 就是月成本（如果用量稳定）。**

### 第二：按功能

```text
extract   8 次  0.0412 元   ← 最贵
chat      8 次  0.0189 元
rewrite   7 次  0.0155 元
classify  7 次  0.0133 元
```

**这张表告诉你优化哪里最值：extract 最贵，先优化它。**

**不看这张表就去优化"感觉最慢的"，是常见错误。**

### 第三：按用户

```text
u_4096  8 次  0.0298 元
u_1024  7 次  0.0261 元
...
```

**这张表是第 8 周"配额"和"计费"的基础。**

**如果某个用户成本是别人的 10 倍，你就知道该限谁了。**

### 第四：最贵的 5 次

**这一列能抓到"异常调用"：**

```text
有一次 0.42 元  → 有人粘了一篇长文
```

**没有这张表，你永远不知道谁在用你的钱。**

## 4.4 一个必须做的验证

**故意破坏种子文件，看会怎样：**

**在 `usage.seed.jsonl` 中间插入一行 `{坏数据`，重跑。**

**你应该看到 `JSON.parse` 抛错（因为种子脚本里没做 try/catch）。**

**这是故意的 —— 让你看到"没保护会怎样"。**

**然后去改：**

```javascript
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        console.warn("跳过坏行：", line.slice(0, 40));
        return null;
      }
    })
    .filter(Boolean);
```

**改完再跑，坏行被跳过，报表正常。**

**这一步建立的习惯：读数据的地方都要假设数据是脏的。**

---

# 第 5 步：写命令行报表（25 分钟）

**上面是"造数据看效果"。现在要的是"读真实账本出报表"。**

## 5.1 新建 `scripts/report.js`

```javascript
import { readAll, sumBy, dayOf } from "../src/meter.js";
import { formatMoney } from "../src/pricing.js";

const arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};

const mode = arg("by", "day");
const since = arg("since", null);
const feature = arg("feature", null);

const pickGroup = {
  day: (row) => dayOf(row.ts),
  feature: (row) => row.feature,
  user: (row) => row.userId,
  model: (row) => row.model,
  status: (row) => String(row.status),
};

const main = () => {
  let rows = readAll();

  if (rows.length === 0) {
    console.log("账本是空的。先跑一次 npm run e01。");
    return;
  }

  if (since) rows = rows.filter((row) => row.ts >= since);
  if (feature) rows = rows.filter((row) => row.feature === feature);

  if (rows.length === 0) {
    console.log("按你的条件筛完，一条也没有。");
    return;
  }

  const groupFn = pickGroup[mode];

  if (!groupFn) {
    console.log(`不支持的 --by 值：${mode}。可用：${Object.keys(pickGroup).join(" / ")}`);
    return;
  }

  const total = rows.reduce((sum, row) => sum + row.cost, 0);
  const fails = rows.filter((row) => !row.ok).length;
  const estimated = rows.filter((row) => row.estimated).length;

  console.log(`\n筛选后：${rows.length} 条调用${since ? `，自 ${since}` : ""}${feature ? `，功能 ${feature}` : ""}`);
  console.log(`总成本：${formatMoney(total)}　平均：${formatMoney(total / rows.length)}`);
  console.log(`失败：${fails} 次（${((fails / rows.length) * 100).toFixed(1)}%）　估算 token：${estimated} 条`);

  const grouped = sumBy(rows, groupFn);

  console.log(`\n===== 按 ${mode} 汇总 =====`);
  grouped.forEach((row) => {
    console.log(
      `${row.key.padEnd(22)} 次数 ${String(row.calls).padStart(4)}　` +
        `成本 ${formatMoney(row.cost).padStart(12)}　` +
        `平均 ${formatMoney(row.avgCost).padStart(12)}　` +
        `失败 ${row.fails}`
    );
  });
};

main();
```

## 5.2 加脚本并试用

```json
    "report": "node scripts/report.js",
    "report:day": "node scripts/report.js --by=day",
    "report:feature": "node scripts/report.js --by=feature",
    "report:user": "node scripts/report.js --by=user"
```

**跑：**

```text
npm run report:day
npm run report:feature
```

**应该看到和 `e02` 类似的输出，但数据来自真实账本。**

## 5.3 三个命令行参数的意义

```text
--by=day       按天（查趋势）
--by=feature   按功能（查哪里贵）
--by=user      按用户（查谁在用）
--since=2026-11-15T00:00:00Z   只看某时间之后
--feature=chat 只看某个功能
```

**为什么 `--since` 用字符串比较而不是 `new Date()`：**

```text
ISO 8601 格式的字符串，字典序 = 时间序
"2026-11-15T00:00:00Z" < "2026-11-16T07:31:12Z"   ✅
```

**这是 ISO 8601 的设计目的之一。用字符串比较，又快又不会踩时区。**

## 5.4 一个必须处理的现实

**账本会一直变大。**

```text
一天 3000 条 → 一年 100 万条 → 一个文件几百 MB
```

**`readFileSync` 全读进内存，会越来越慢。**

**今天不管它（数据量小），但要知道：**

```text
① 第 5 周（SQL）会换成数据库表
② 或者按天分文件：usage-2026-11-16.jsonl
③ 或者定期归档：把三个月前的挪到 archive/
```

**现在能跑就行，别过早优化。** 但要留一句注释在代码里，提醒未来的自己。

---

# 第 6 步：五个必须知道的坑（15 分钟）

## 坑 1：用 `writeFileSync` 记账

**见 2.2 技术点一。** 每次覆盖，只留最后一行。

**症状：** 明明跑了 10 次，账本只有 1 行。

**这个错很常见，因为 `writeFileSync` 更"顺手"。**

## 坑 2：`toFixed` 返回字符串

```javascript
entry.cost = (0.004044).toFixed(6)   // "0.004044" 字符串
entry.cost += 0.001                  // "0.0040440.001"
```

**症状：** 报表金额是一个越来越长的数字。

**修法：** `Number(x.toFixed(6))`。

## 坑 3：并发追加导致行交错

**两个进程同时 `appendFileSync`，理论上可能交错。**

**实际上：**

```text
Windows：文件锁会保证单次小写入原子（一般）
Linux：O_APPEND 保证原子（小于 PIPE_BUF）
```

**风险很低，但要加一条自保：**

```javascript
// 每行一个完整 JSON，靠 \n 分隔
// 读的时候坏行跳过（已做）
```

**这就是为什么用 JSONL 而不是 JSON 数组：数组必须整体重写，JSONL 可以单行追加。**

## 坑 4：时区

**`new Date().toISOString()` 永远是 UTC。**

```text
北京时间 11-16 15:30  →  记录成 "2026-11-16T07:30:00Z"
```

**按天分组时，`slice(0, 10)` 得到 `2026-11-16` —— 但这个"天"是 UTC 的天。**

**后果：**

```text
北京时间 11-17 早上 7:00（UTC 11-16 23:00）的调用，会被算到 11-16
```

**如果你的业务是"按自然日看报表"，这会差 8 小时。**

**修法（二选一）：**

```text
A. 记录时用本地时间：加一个 localTs 字段
B. 报表时统一 +8 小时再分组
```

**推荐 A：**

```javascript
const now = new Date();
const local = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
```

**注意这行把时间"假装"成 UTC 存了本地值。** 简单粗暴但够用，**代价是失去时区信息。**

**更正规的做法：用 `Intl.DateTimeFormat` 格式化到 `Asia/Shanghai`。**

**今天先按 UTC 记，在 `NOTES.md` 里写清这个偏差，第 49 节做看板时会处理。**

## 坑 5：失败记录的成本是 0，但实际花了钱

**见 3.2 设计一。**

**症状：** 账单比你的报表高 5%。

**应对：**

```text
① 报表里显式打印"失败率"，让你记得有这个偏差
② 报价时留 5-10% 余量
③ 第 48 节做中断后，这个偏差会变小（因为能拿到部分 usage）
```

**不要追求"精确到分"。** 追求"知道偏差有多大"。

---

# 第 7 步：故意做四个实验（15 分钟）

## 实验 1：把 `appendFileSync` 改成 `writeFileSync`

**跑一次 `npm run e01`（4 次调用），看账本几行。**

**然后改回来。**

**这一条亲手做过，你就永远不会犯。**

## 实验 2：去掉 `Number()` 包一层

**把 `cost: Number((entry.cost || 0).toFixed(6))` 改成 `cost: (entry.cost || 0).toFixed(6)`。**

**跑 `npm run e02`，看"总成本"。**

**你会看到一个天文数字。** 把它记进 `NOTES.md`。

## 实验 3：删掉一行的 `\n`

**在 `appendFileSync` 里去掉 `\n`。**

**跑两次，看 `readAll()` 返回几条。**

**两条记录会粘成一行 → JSON 解析失败 → 被跳过 → 你以为没记上。**

**这就是为什么要 `\n`，以及为什么读的时候要跳过坏行。**

## 实验 4：让 `record` 抛错

**把 `ensureDir` 改成 `fs.mkdirSync("/nonexistent_dir/xx")`（不存在的根路径）。**

**跑一次 `e01`，看是"记账失败"还是"整个调用失败"。**

**如果整个调用失败了，说明记账拖垮了主路 —— 这就是 3.2 设计四要防的事。**

**练习里会让你加 try/catch。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 一条完整的记录（贴真实的）
2. 按功能/按用户的汇总数字
3. 最贵的那一次是多少、为什么贵
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：给 `record` 加保护

**要求：** 记账失败时打印错误但不抛出。

**测试方法：** 临时把 `DATA_DIR` 指向一个不可写路径，确认 `e01` 仍然正常返回。

## 练习二：加"坏行统计"

**要求：** `readAll()` 返回 `{ rows, badLines }`。

`report.js` 里打印"跳过了 N 行坏数据"。

**为什么：** 坏行说明有并发写问题或者磁盘问题，**静默跳过等于掩盖故障**。

## 练习三：加 `--top=N`

**要求：** `npm run report --by=user --top=3` 只显示成本最高的 3 组。

**这个参数你以后天天用。**

## 练习四：算"每次用户请求的成本"

**要求：** 按 `requestId` 分组，算出"一次用户请求（可能含多次模型调用）的平均成本"。

**提示：**

```javascript
const byRequest = sumBy(rows, (row) => row.requestId);
const avgPerRequest = byRequest.reduce((s, r) => s + r.cost, 0) / byRequest.length;
```

**这个数字和第 43 节的"每次调用成本"不是一回事。** 你要能说清区别。

## 练习五：想清楚这四个问题

```text
1. 为什么失败也要记账？
2. 为什么 userId 现在就要留，哪怕还是匿名？
3. 为什么 requestId 要由最外层生成？
4. UTC 记录会让"按天报表"偏差多少？怎么处理？
```

---

# 第 10 步：最终验收

## A. 代码

- [ ] `meter.js` 有 `record` / `readAll` / `sumBy` / `dayOf` / `newRequestId`
- [ ] `record` 用 `appendFileSync`
- [ ] `cost` 是数字（经过 `Number(toFixed())`）
- [ ] `readAll` 跳过坏行
- [ ] `llm.js` 的 `chat` 自动记账（成功和失败都记）
- [ ] `record` 有 try/catch 保护

## B. 数据

- [ ] 我跑过 `e01`，账本里有 4 行以上
- [ ] 我跑过 `e02`，看到了四个维度的汇总
- [ ] `report.js` 能按 day/feature/user 出报表
- [ ] 我的记录里有 `requestId`、`feature`、`userId`

## C. 认知

- [ ] 我知道为什么用 JSONL 不用 JSON 数组
- [ ] 我知道 `toFixed` 返回字符串的危害
- [ ] 我知道失败记账的成本是 0 会造成偏差
- [ ] 我知道 UTC 记录会让按天报表差 8 小时

## 本节课要能说出口的一句话

> **不记账的优化都是猜。记账之后，每一个判断都能落到一个数字上。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 账本只有 1 行 | 用了 `writeFileSync` | 改 `appendFileSync` |
| 总成本是个天文数字 | `toFixed` 字符串拼接 | 加 `Number()` |
| `readAll` 返回条数少 | 写的时候漏了 `\n` | 每行结尾加 `\n` |
| 报表打不开 | 有一行坏 JSON | `try/catch` 跳过 |
| 记账失败导致接口 500 | 没保护 | `record` 里 try/catch |
| 按天数字和实际差 8 小时 | UTC vs 本地 | 加 `localTs` 或报表时偏移 |
| 某用户成本异常高 | 有人在粘长文 | 看"最贵 N 次" |
| 账本越来越大 | 单文件无归档 | 按天分文件，或第 5 周换数据库 |
| 并发写丢数据 | 多进程同时写 | JSONL + 坏行跳过已能容忍 |
| `feature` 都是 unknown | 调用时没传 | 每个调用点显式传 |
