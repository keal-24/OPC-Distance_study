# 第 139 节课：接口说明（API.md）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的验收标准是一句话：**一个没参与开发的人，照着文档能调通全部接口。**
> 而且文档里每条命令，你都要亲手跑一遍 —— **跑不通的段落直接删掉。**

**建议用时**：120 分钟
**你需要先完成**：第 137 节的 `API-ERRORS.md`
**今天要装**：什么都不用装（用 curl，不装 Swagger）

---

# 第 0 步：为什么手写 MD 而不是 Swagger（15 分钟）

## 0.1 你需要的只是一份能读懂的东西

**你的项目有 8 个接口，每个 5 个参数。** 用 OpenAPI/Swagger 写：

```yaml
paths:
  /api/tickets:
    post:
      summary: 创建工单
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [message]
              properties:
                message:
                  type: string
                  minLength: 1
                  maxLength: 4000
                  description: 客户原话
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Ticket'
        '202':
          ...
        '400':
          ...
```

**500 行 YAML，写完要 3 小时。而且：**

```text
· 你需要学 YAML 的缩进规则
· 你需要学 $ref 的引用
· 你需要一个 UI 才能看（swagger-ui 又要配）
· 改一个参数要在 4 个地方同步
· 它不能"被验证" —— 文档说返回 200，你没法自动检查
```

## 0.2 手写 MD + 可执行命令

```markdown
### 创建工单

\`\`\`bash
curl -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"message":"我买的杯子碎了"}'
\`\`\`

**成功（200）：**
\`\`\`json
{"ok":true,"route":"auto","trace_id":"tr_20261116_8f3a2b1c","data":{...}}
\`\`\`

**失败（400）：** 见 [API-ERRORS.md](./API-ERRORS.md)
```

**三行命令，五秒看懂，而且能直接复制跑。**

## 0.3 关键差别：MD 能被验证

```bash
# 从 API.md 里抽出所有 curl 命令，逐个跑
bash scripts/check-docs.sh
```

**这是 Swagger 做不到的**（YAML 描述的请求要专门的工具才能发）。

**今天的核心交付物不是文档，是"文档的验证脚本"。**

---

# 第 1 步：定文档结构（20 分钟）

## 1.1 固定五个部分

```text
API.md
├── 1. 快速开始        （3 分钟能调通第一个接口）
├── 2. 通用约定        （base URL、认证、错误格式、分页）
├── 3. 接口列表        （每个一段）
├── 4. 数据字典        （字段类型和取值范围）
└── 5. 变更记录        （每次改接口都记一条）
```

**为什么是这个顺序？**

```text
新人第一件事是"怎么调通一个" → 快速开始
调通之后要批量用 → 通用约定
遇到问题查具体 → 接口列表
看不懂字段 → 数据字典
"你这接口上周还能用" → 变更记录
```

## 1.2 第 1 部分必须真的"3 分钟能调通"

**反例（很常见的烂文档）：**

```markdown
## 快速开始

首先配置环境变量，然后启动服务，接着获取 token，之后就可以调接口了。
```

**这句话里有四个未定义的词。** 新人会卡在第一步。

**正确写法：**

```markdown
## 1. 快速开始

### 1.1 起服务

\`\`\`bash
git clone <仓库地址>
cd <项目目录>
cp .env.example .env.development
# 编辑 .env.development，填 KEY_PRIMARY
npm install
npm run dev
\`\`\`

终端应显示：
\`\`\`
[config] 读取 .env.development
✅ 配置检查通过（development）
http://localhost:3000
\`\`\`

### 1.2 验证服务活着

\`\`\`bash
curl -s http://localhost:3000/health
\`\`\`

应返回：
\`\`\`json
{"ok":true,"env":"development"}
\`\`\`

**如果这一步失败，先别往下看。** 检查端口是否被占用：`lsof -i :3000`（macOS/Linux）或 `netstat -ano | findstr 3000`（Windows）。

### 1.3 调通第一个接口

\`\`\`bash
curl -s -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"message":"我买的杯子碎了"}'
\`\`\`

应返回一个包含 `"ok":true` 的 JSON。

**到这里你已经调通了。** 下面的章节是参数细节。
```

## 1.3 "失败怎么办"必须写在每一步旁边

**这是文档质量的真正分水岭。**

```text
烂文档：curl ...  → 然后呢？报错了怎么办？
好文档：curl ...  → 应返回 X → 如果返回 Y，说明 Z，怎么修
```

**每一个 curl 后面必须跟三样：**

```text
① 期望输出（逐字，不是"类似这样的"）
② 最常见的失败（以及原因）
③ 怎么修
```

---

# 第 2 步：写通用约定（25 分钟）

## 2.1 四件事必须写清

```markdown
## 2. 通用约定

### 2.1 Base URL

| 环境 | Base URL |
|---|---|
| 本地 | `http://localhost:3000` |
| 生产 | `https://api.yourdomain.com` |

所有接口路径都相对于 Base URL。下面示例统一用本地地址。

### 2.2 认证

**当前版本不需要认证**（内部工具）。
第 24 周多租户之后会加 `Authorization: Bearer <token>`，届时此文档会更新。

### 2.3 请求格式

- `Content-Type: application/json`
- 请求体上限 **1 MB**（超过返回 `TOO_LONG`）
- 字段名 **小写下划线**（`need_human`，不是 `needHuman`）

### 2.4 响应格式

**所有响应都是 JSON，且都带 `ok` 字段。**

成功：
\`\`\`json
{ "ok": true, "data": {...}, "trace_id": "tr_xxx" }
\`\`\`

失败：
\`\`\`json
{ "ok": false, "code": "TOO_LONG", "message": "...", "hint": "...", "trace_id": "tr_xxx" }
\`\`\`

**判断成功用 `body.ok`，不要用 HTTP 状态码** —— 因为 `202` 的 `res.ok` 是 true 但业务上还在处理。

错误码完整列表见 [API-ERRORS.md](./API-ERRORS.md)。

### 2.5 分页

列表接口支持 `limit` 和 `offset`：

| 参数 | 类型 | 默认 | 上限 |
|---|---|---|---|
| `limit` | int | 20 | 100 |
| `offset` | int | 0 | —— |

响应里带 `total`：
\`\`\`json
{ "ok": true, "data": [...], "total": 12847 }
\`\`\`

**翻页到最后一页时 `data` 为空数组，不是 404。**

### 2.6 时间

所有时间字段是 **Unix 毫秒时间戳**（不是秒，不是 ISO 字符串）。

\`\`\`json
{ "created_at": 1763332282412 }
\`\`\`

### 2.7 trace_id

每个响应都有 `X-Trace-Id` 响应头和 `trace_id` 字段。

**用户报问题时，让他提供这个编号** —— 你能用它在日志里定位完整链路：

\`\`\`bash
./scripts/log.sh trace tr_20261116_8f3a2b1c
\`\`\`
```

## 2.2 四个容易被漏的约定

**① `trace_id` 在响应头还是响应体？**

**答：两个都放。** 响应体方便前端读，响应头方便 curl 抓。

```bash
curl -s -D - -o /dev/null localhost:3000/api/tickets | grep -i trace
# X-Trace-Id: tr_20261116_8f3a2b1c
```

**② 时间戳是秒还是毫秒？**

**这是最常出错的地方。** 你自己知道，但别人会猜。

```text
JavaScript 的 Date.now() → 毫秒（13 位）
PHP / Python 的默认    → 秒（10 位）
```

**写清"13 位毫秒"，并在数据字典里给一个例子。**

**③ 空数组 vs null**

```json
{"data": []}      ← 有接口但没数据
{"data": null}    ← 不该出现，但有人会这么写
```

**约定成"永远是数组，空就是 `[]`"。** 前端可以放心 `.map()`。

**④ 字段命名风格**

```text
need_human   蛇形
needHuman    驼峰
NeedHuman    帕斯卡
```

**你的数据库是蛇形，JSON 也应该是蛇形**（不用转换）。**但必须写下来，否则前端会猜错。**

---

# 第 3 步：写接口列表（35 分钟）

## 3.1 每个接口的统一模板

```markdown
### 3.1 创建工单

`POST /api/tickets`

把客户的一段话交给模型整理成结构化结果，并存进数据库。

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `message` | string | 是 | 客户原话，1–4000 字 |

**成功响应 `200`**

\`\`\`json
{
  "ok": true,
  "route": "auto",
  "trace_id": "tr_20261116_8f3a2b1c",
  "data": {
    "summary": "客户反馈收到的杯子破碎",
    "category": "quality",
    "urgency": "medium",
    "suggested_action": "让客户拍照留存，按破损流程换新",
    "need_human": true
  },
  "saved": { "category": "quality", "urgency": "medium", "needHuman": true }
}
\`\`\`

**转人工响应 `202`**

模型不确定或失败时，返回 `202`（不是错误）：

\`\`\`json
{
  "ok": false,
  "route": "human",
  "trace_id": "tr_xxx",
  "message": "正在核实，2 小时内回复"
}
\`\`\`

**前端处理：** `202` 走"提示等待"，不要走"报错"，也不要让用户重复提交。

**请求示例**

\`\`\`bash
curl -s -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"message":"我买的杯子碎了"}'
\`\`\`

**期望输出**（实测，2026-11-16）

\`\`\`json
{"ok":true,"route":"auto","trace_id":"tr_20261116_8f3a2b1c","data":{"summary":"客户反馈收到的杯子破碎","category":"quality","urgency":"medium","suggested_action":"让客户拍照留存，按破损流程换新","need_human":true},"saved":{"category":"quality","urgency":"medium","needHuman":true}}
\`\`\`

**常见失败**

| 现象 | 原因 | 怎么修 |
|---|---|---|
| `EMPTY_INPUT` | `message` 为空或只有空格 | 传至少 1 个字 |
| `TOO_LONG` | 超过 4000 字 | 精简后再传 |
| `UPSTREAM_DOWN` | 模型的 key 没配或已失效 | 检查 `.env` 里的 `KEY_PRIMARY` |
| 返回 `202` 但一直没结果 | 进了人工队列 | 去 `/api/tickets` 列表里找 `route=human` 的记录 |
```

## 3.2 三个必须遵守的规则

**① "期望输出"必须是实测的，不是你想象的**

```text
❌ 期望输出：{"ok": true, "data": {...}}       ← 省略号，别人不知道结构
❌ 期望输出：一个成功的 JSON                    ← 等于没写
✅ 期望输出：（贴完整的一行，字段顺序和实际一致）
```

**为什么必须完整？**

```text
前端的第一个动作是"照着文档拼一个 mock"
如果文档里是 {...}，他只能猜
如果他猜错了，会在联调时浪费两小时
```

**② 每个接口必须给出"最可能的三个失败"**

**不是"所有可能的失败"，是"最可能的三个"。**

```text
后端有 18 个错误码 → 前端只关心这个接口最可能遇到哪三个
```

**怎么判断"最可能"？**

```text
看你的日志：error.jsonl 里这个接口出现过哪几个 code
按次数排序，取前三
```

**③ 示例里不能出现真实的 key / 手机号 / 客户名**

```json
// ❌ 从真实日志复制的
{"message":"我叫张伟，电话 13812345678，买的杯子碎了"}

// ✅ 造一个
{"message":"我买的杯子碎了"}
```

**这条会被你违反，因为"从日志复制一个真实例子最省事"。**

**但你的文档会给客户看、会给外包看、会提交到 git。**

---

# 第 4 步：数据字典（20 分钟）

## 4.1 为什么要有单独一节

因为**同一个字段在不同接口里出现多次**：

```text
ticket 对象出现在：
  ① POST /api/tickets 的 data
  ② GET /api/tickets/:id 的 data
  ③ GET /api/tickets 的 data[]

如果每个接口都写一遍字段说明 → 改一个字段要改三处 → 必然不同步
```

**所以：字段定义写一次，接口里只引用。**

```markdown
## 4. 数据字典

### 4.1 Ticket

| 字段 | 类型 | 可能的值 | 说明 |
|---|---|---|---|
| `id` | int | 正整数 | 自增主键 |
| `trace_id` | string | `tr_YYYYMMDD_xxxxxxxx` | 创建时的追踪号 |
| `input` | string | 1–4000 字 | 客户原话（未经脱敏） |
| `output` | string \| null | JSON 字符串 | 模型原始输出，超时则为 `null` |
| `category` | string | 见 4.2 | 分类 |
| `urgency` | string | `high` / `medium` / `low` | 紧急程度 |
| `need_human` | int | `0` / `1` | SQLite 没有布尔，用 0/1 |
| `route` | string | `auto` / `human` | 是否转人工 |
| `degraded` | int | `0` / `1` | 是否用了备用模型 |
| `created_at` | int | 13 位毫秒 | 创建时间 |

### 4.2 category 取值

| 值 | 含义 | 判断依据 |
|---|---|---|
| `logistics` | 物流问题 | 慢、丢、破损、送错地址 |
| `quality` | 商品问题 | 坏、假、过期、少件、错货 |
| `refund` | 退款退货 | 明确要求退钱/退货 |
| `invoice` | 发票 | 只涉及发票、税号、抬头 |
| `account` | 账号 | 只涉及登录、密码、被锁 |
| `other` | 其他 | 以上都不沾 |

**多类别时按优先级取：** `quality` > `logistics` > `refund` > `invoice` > `account` > `other`

（这条规则是人定的，但只要一致就行。见 `app/services/ticket.js`）

### 4.3 urgency 取值

| 值 | 判断依据 |
|---|---|
| `high` | 已造成损失 / 涉及人身安全 / 金额 ≥ 500 元 / 客户提到投诉曝光律师 |
| `medium` | 未造成损失但影响使用 / 金额 < 500 元 / 表达了不满 |
| `low` | 咨询性质 / 已解决只是反馈 / 无金额无损失 |

**金额门槛 500 是拍的，不是行业标准。** 改它要改 `app/services/ticket.js`。
```

## 4.2 三个必须写进字典的东西

**① 数据库里 `0/1` 但 API 里是 `true/false` 的字段**

```text
数据库：need_human INTEGER (0/1)
API：    need_human: true/false
```

**要么统一（都转成布尔），要么写清"数据库是 0/1，API 是布尔"。**

**你的选择要一致** —— 上面例子里我用的是"数据库 0/1，API 布尔"，所以字典里标了 `int`。

**但这里有个不一致：`saved` 字段里我写的是 `needHuman: true`（布尔），而 `data` 里是 `need_human: true`。**

**这是个真实的文档 bug，正是今天要发现的东西。** 发现之后，回去统一 API 的返回（都叫 `need_human`）。

**② "这条规则是人定的"要写出来**

```markdown
金额门槛 500 是拍的，不是行业标准。
```

**为什么不写就会出问题？**

```text
三个月后客户问"为什么我这个 480 元的没标成紧急"
你翻文档，看到"金额 ≥ 500"，觉得对
但客户觉得不对
→ 你说"这是规则"，客户说"谁定的"

如果你的文档里写了"这是拍的"，你会说"当时定的是 500，我们可以改成 300"
→ 变成了讨论，不是争执
```

**③ 每个枚举值必须给"判断依据"**

```text
❌ logistics 物流问题
   → 什么叫物流问题？"快递慢"算吗？"快递员态度差"算吗？

✅ logistics 物流问题 —— 慢、丢、破损、送错地址
   → 能对着判
```

---

# 第 5 步：写验证脚本（25 分钟）★ 核心

## 5.1 从 MD 里抽 curl 并执行

```javascript
// scripts/check-docs.js
// 从 API.md 里抽出所有 ```bash 代码块中的 curl，逐个执行，比对期望

import fs from "node:fs";
import { execSync } from "node:child_process";

const md = fs.readFileSync("API.md", "utf8");

// 匹配 ```bash ... ``` 块
const blocks = [...md.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);

const curls = [];
for (const b of blocks) {
  // 一个块里可能有多条命令，按行首的 curl 切
  const lines = b.split("\n");
  let buf = null;
  for (const line of lines) {
    if (line.trim().startsWith("curl")) {
      if (buf) curls.push(buf);
      buf = line.trim();
    } else if (buf && line.trim().startsWith("-")) {
      buf += " " + line.trim();
    } else if (buf) {
      curls.push(buf);
      buf = null;
    }
  }
  if (buf) curls.push(buf);
}

console.log(`从 API.md 抽出 ${curls.length} 条 curl\n`);

let pass = 0, fail = 0;
for (const cmd of curls) {
  const oneLine = cmd.replace(/\\\s*\n/g, " ").replace(/\s+/g, " ");
  process.stdout.write(`▶ ${oneLine.slice(0, 80)}... `);

  try {
    const out = execSync(oneLine, { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    // 能执行且返回了内容
    const ok = out.trim().length > 0;
    if (ok) { pass++; console.log("✅"); }
    else { fail++; console.log("❌ 空输出"); }
  } catch (e) {
    fail++;
    const msg = String(e.stderr ?? e.message).split("\n")[0].slice(0, 100);
    console.log(`❌ ${msg}`);
  }
}

console.log(`\n通过 ${pass} / ${curls.length}`);
if (fail > 0) {
  console.log(`\n有 ${fail} 条命令失败。文档和实现对不上了，或者服务没起。`);
  process.exit(1);
}
```

## 5.2 更强的版本：比对期望输出

**上面的版本只验证"命令能跑"。** 更强的是"输出和文档写的一样"。

```javascript
// scripts/check-docs-strict.js
// 支持在文档里用注释标注期望
```

**在 API.md 里这样写：**

```markdown
\`\`\`bash
# expect: ok=true
curl -s -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"message":"我买的杯子碎了"}'
\`\`\`
```

**脚本读 `# expect:` 那一行，用 `jq` 验证：**

```javascript
const expectLines = block.split("\n")
  .filter((l) => l.trim().startsWith("# expect:"))
  .map((l) => l.replace("# expect:", "").trim());

// 对每条 expect，用 jq 检查
for (const exp of expectLines) {
  // exp 形如 "ok=true" 或 ".code=TOO_LONG"
  const [path, want] = exp.split("=");
  const got = execSync(`echo '${out}' | jq -r '${path}'`, { encoding: "utf8" }).trim();
  if (got !== want) {
    console.log(`   ❌ ${path} 期望 ${want}，实际 ${got}`);
    ok = false;
  }
}
```

## 5.3 为什么这个脚本是今天最重要的东西

```text
没有它：文档写完那一周是准的，三周后有三个接口对不上
        你不再相信它，别人也不信
        等于没有

有它：每次改接口（或改文档），跑一次就知道有没有偏差
      而且能挂进 CI（第 30 周）
```

**"文档能否被执行验证"是文档和废纸的分界线。**

## 5.4 一个必须做的实验

```bash
# ① 服务跑起来
npm run dev

# ② 跑验证
node scripts/check-docs.js

# ③ 故意改坏文档里的一条命令（比如把路径改成 /api/wrong）
# ④ 再跑
node scripts/check-docs.js
# 期望：那一条失败，退出码 1
```

**四个步骤都跑过，你才算真的有了"活文档"。**

---

# 第 6 步：变更记录（10 分钟）

## 6.1 一节最简单的表

```markdown
## 5. 变更记录

| 日期 | 版本 | 变更 | 兼容性 |
|---|---|---|---|
| 2026-11-16 | v1.2 | 新增 `/api/stats`，返回按分类统计 | 向后兼容 |
| 2026-11-15 | v1.1 | `POST /api/tickets` 增加 `202` 响应（转人工） | **前端需处理 202** |
| 2026-11-14 | v1.0 | 首版：4 个接口 | —— |
```

## 6.2 为什么"兼容性"这一列最重要

```text
向后兼容 → 前端不用改
需要前端改 → 必须提前通知
破坏性变更 → 必须加版本号或宽限期
```

**如果你改了接口但不写这一列，前端会在上线后才发现。**

## 6.3 一个硬规则

```text
破坏性变更（删字段、改字段类型、改成功状态码）
→ 必须提前 3 天通知前端
→ 必须保留旧接口一段时间（至少 1 周）
```

**为什么？**

```text
你改的时候"顺便优化一下"，前端那边可能在周六晚上发布
→ 周一早上全部报错
→ 你被叫起来
```

**单人开发者最容易犯这个错，因为"我就是前端"。**

**但第 24 周你有第二个客户的时候，改动会伤到别人。**

---

# 第 7 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **验证脚本抽出了几条 curl，通过几条**
- **发现文档和实现不一致的地方**（这是最值钱的）
- **数据字典里"人定的规则"有哪些**
- **`need_human` 的 0/1 vs 布尔，你怎么统一的**

---

# 第 8 步：课后练习

## 练习一：让文档自动更新（25 分钟）

**问题：你改了字段名，忘了改文档。**

**思路：把"错误码表"和"枚举值"从代码生成。**

```javascript
// scripts/gen-docs.js
import { CODES } from "../app/errors/index.js";
import { CATEGORIES, URGENCIES } from "../app/services/ticket.js";

const table = Object.entries(CODES).map(([code, def]) =>
  `| \`${code}\` | ${def.status} | ${def.message} | ${def.hint ?? ""} |`
).join("\n");

fs.writeFileSync("docs/ERRORS-GEN.md", `| code | HTTP | 含义 | 怎么做 |\n|---|---|---|---|\n${table}\n`);
console.log("已生成 docs/ERRORS-GEN.md");
```

**然后在 `API.md` 里：**

```markdown
错误码见 [docs/ERRORS-GEN.md](./docs/ERRORS-GEN.md)（由代码自动生成，勿手改）。
```

**这样"错误码表"永远不会过时。**

**但注意：自动生成的部分只能是"有唯一真相"的部分。** 接口描述、示例、失败排查，这些必须手写。

## 练习二：算清"文档过时"的代价（15 分钟）

```text
场景：你给客户的接口改了字段名（needHuman → need_human），忘了说
后果：
  ① 客户那边全部报错
  ② 他来找你，你排查（__ 分钟）
  ③ 改回去或者让他改（__ 分钟）
  ④ 他对你的信任度下降

如果没有文档 / 文档也过时：
  ② 变成 __ 分钟（因为不知道该信谁）
  ④ 变成"这个开发者不太靠谱"
```

**写清你的估算，然后算一下"每次改接口多花 10 分钟更新文档"值不值。**

## 练习三：判断这个 API.md 错在哪（15 分钟）

```markdown
# API

## 接口

### 创建工单
POST /api/tickets

参数：message

返回：JSON

### 查询工单
GET /api/tickets/:id

参数：id

返回：JSON
```

**错在哪？至少六条。**

**参考答案：**

```text
① 没有 base URL → 不知道该请求哪个地址
② 没有认证说明 → 不知道要不要 token
③ "参数：message" 没有类型、必填、取值 → 前端只能猜
④ "返回：JSON" 等于没写 → 字段结构、示例全缺
⑤ 没有错误说明 → 出错时前端不知道该怎么办
⑥ 没有 curl 示例 → 没法快速试
⑦ 没有 trace_id 说明 → 出问题时无法定位
⑧ 没有 202 说明 → 前端会把"正在处理"当成功
⑨ 没有分页/时间格式等约定 → 每个接口各自猜
```

**这份文档的信息量约等于零。** 唯一的用处是告诉别人"有这么两个接口"。

---

# 第 9 步：最终验收

## A. 文档结构

- [ ] 五个部分齐全（快速开始 / 通用约定 / 接口列表 / 数据字典 / 变更记录）
- [ ] 快速开始能让新人在 3 分钟内调通第一个接口
- [ ] 每一步失败后面都写了"怎么修"

## B. 通用约定

- [ ] Base URL（本地 + 生产）
- [ ] 认证说明（哪怕写"当前不需要"）
- [ ] 请求格式（Content-Type、上限、命名风格）
- [ ] 响应格式（成功/失败两个模板）
- [ ] **明确写了"用 `body.ok` 判断，不要用 HTTP 状态码"**
- [ ] 分页参数和 `total`
- [ ] 时间戳是 13 位毫秒
- [ ] `trace_id` 在响应头和响应体都有

## C. 接口列表

- [ ] 每个接口有：方法+路径、一句话说明、请求参数表、成功响应示例、失败响应、curl 示例、期望输出、常见失败表
- [ ] **期望输出是实测的，不是 `{...}`**
- [ ] **常见失败表有 2–3 条，来自真实日志**
- [ ] 202 单独说明，并写"前端不要当错误"
- [ ] 示例里没有任何真实 PII

## D. 数据字典

- [ ] 可复用的对象单独一节（如 `Ticket`）
- [ ] 每个枚举值有"判断依据"
- [ ] **写清了"哪条规则是人定的"**
- [ ] 0/1 vs 布尔的约定统一

## E. 验证脚本

- [ ] `check-docs.js` 能从 MD 抽出 curl
- [ ] 全部命令跑通（服务在跑）
- [ ] 我故意改坏一条，脚本会失败

## F. 变更记录

- [ ] 有一张表，含日期/版本/变更/**兼容性**
- [ ] 破坏性变更的规则写下来了

## G. 提交

```bash
git add -A
git commit -m "第139节：API.md + 验证脚本，X条curl全通过"
git push
```

---

## 本节课要能说出口的一句话

> **文档的价值不在"写得多全"，在"里面的每条命令都能跑通"。不能验证的文档，三周后就是废纸。**

---

# 附：常见问题速查

**Q：我的接口有 20 个，写文档要一天。**

A：**分层写。**

```text
第一优先：写"会被别人调用"的接口（外部/前端/客户）
第二优先：写"你三个月后会忘"的接口（复杂的、参数多的）
不用写：内部工具函数（代码注释够了）
```

**20 个接口里，真正需要文档的可能只有 8 个。**

**Q：`check-docs.js` 执行 curl 会不会改数据？**

A：**会。** `POST /api/tickets` 每跑一次就插一条。

**三个办法：**

```text
① 用独立的测试库（NODE_ENV=test + DB_FILE=:memory:）
② 文档里的写操作用"明显是测试"的数据（message: "文档验证用例"）
③ 只验证读接口，写接口人工试
```

**推荐 ① + ②。** 而且可以在验证脚本里加一句"跑完后删掉 message 含'文档验证用例'的记录"。

**Q：示例里的 `trace_id` 要不要写真实的？**

A：**写一个格式对的假值。**

```json
"trace_id": "tr_20261116_8f3a2b1c"
```

**真实的值没有意义**（查不到），而且会让人以为"应该就是这个"。

**但格式必须对** —— 前端可能会用正则校验它。

**Q：为什么"常见失败"要从日志里取？**

A：**因为你猜的失败和实际的不一样。**

```text
你猜的：参数错、超长
实际的：70% 是 UPSTREAM_DOWN（key 过期了）、20% 是 TOO_LONG
```

**按日志取，你会发现真正的问题是"key 总是过期"** —— 那是个更值得修的问题。

**Q：`API.md` 要不要给客户看？**

A：**要看情况。**

```text
给客户看的版本 → 只保留他需要的接口，去掉内部管理接口，
                  去掉"这条规则是拍的"这类内部说明
你自己用的版本 → 完整的，包括所有坑
```

**维护两份会很痛苦。** 折中：一份文档，用标记区分：

```markdown
<!-- internal:start -->
金额门槛 500 是拍的，不是行业标准。
<!-- internal:end -->
```

**然后写一个脚本，生成"客户版"（去掉 internal 块）。**

**Q：变更记录要写到多细？**

A：**只记"调用方需要知道的"。**

```text
✅ 新增字段 → 记（前端可能用）
✅ 改字段类型 → 记（会坏）
✅ 改错误码 → 记（前端要改 switch）
❌ 内部重构 → 不记（调用方无感）
❌ 性能优化 → 不记（除非延迟变化超过 2 倍）
```

**判断标准：调用方需要改代码吗？需要就记。**
