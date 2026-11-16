# 第 135 节课：配置与环境变量

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的验收标准只有一句：**换一个环境，不改一行代码。**
> 听起来简单，但你会在这节课里发现自己代码里藏着 20 个硬编码。

**建议用时**：100 分钟
**你需要先完成**：第 134 节的 `app/` 目录
**今天要装**：`dotenv`（如果你还没装）

---

# 第 0 步：先量出你现在有多"硬"（20 分钟）

## 0.1 找硬编码的五条命令

**在你的项目根目录跑这五条，把输出全部保存下来：**

```bash
# ① 端口
grep -rn "3000\|8080\|:5000" app/ --include="*.js" | grep -v "config/"

# ② key / token / 密码
grep -rniE "sk-|api[_-]?key|token|password|secret" app/ --include="*.js" | grep -v "config/"

# ③ 文件路径
grep -rn "\./data\|\./logs\|/tmp/\|C:\\\\" app/ --include="*.js" | grep -v "config/"

# ④ 模型名
grep -rn "gpt\|claude\|qwen\|deepseek\|glm\|model.*:" app/ --include="*.js" | grep -v "config/"

# ⑤ 域名 / URL
grep -rn "https\?://" app/ --include="*.js" | grep -v "config/"
```

## 0.2 把结果分类

**建一个表格，把这些命中逐条填进去：**

| # | 位置 | 是什么 | 该放哪 | 为什么 |
|---|---|---|---|---|
| 1 | `app/lib/model.js:42` | `https://api.xxx.com/v1` | config | 换供应商要改 |
| 2 | `app/lib/db.js:8` | `./data/app.db` | config | 换环境要改 |
| 3 | | | | |

**大概率你有 15–25 条。**

**其中有些不需要搬：**

```text
✅ 该搬的：
   端口、key、数据库路径、模型名、API 地址、超时时间、限流阈值、邮件发件人

❌ 不该搬的：
   业务规则的常量（"金额 ≥ 500 算 high"里的 500）
   枚举值（category 的六个值）
   文案（错误提示语）
```

**区别在哪？**

```text
会因"部署在哪"而变的 → 搬
会因"业务怎么定"而变的 → 不搬（放 services）
```

**"金额 500" 不是环境配置，是业务规则。** 它换环境不会变，换客户才会变。

## 0.3 一个具体的后果

**假设你把数据库路径硬编码了：**

```javascript
const db = new Database("./data/app.db");
```

**现在你要在服务器上跑：**

```text
本地：      /Users/you/project/data/app.db      ← 你三个月的数据
服务器：    /var/www/app/data/app.db            ← 空库

你在服务器上启动 → 一个空库被创建 → 看起来"正常" → 
你以为是新部署 → 一周后你发现生产数据全在本地那台 Mac 上
```

**更糟的情况：**

```text
你在本地测试时，误连了生产库的路径
→ 测试脚本 DELETE FROM tickets
→ 生产数据没了
```

**这就是为什么配置必须外置 —— 不只是"方便"，是"防事故"。**

---

# 第 1 步：把配置整理成三层（25 分钟）

## 1.1 三层结构

```text
第一层：默认值（写在 config/index.js 里）
   → 开发环境不用配任何东西就能跑

第二层：环境变量（.env 或 docker env）
   → 覆盖默认值

第三层：启动校验（第 136 节）
   → 生产环境缺关键配置就拒绝启动
```

**为什么要有第一层（默认值）？**

```text
没有默认值 → 新人 clone 代码后必须配 20 个环境变量才能跑
有默认值   → clone 完 npm i && npm start 就能看到一个能用的页面
```

**"能直接跑"这件事对未来的你（换电脑）和接手的人都很重要。**

## 1.2 重写 `app/config/index.js`

```javascript
// app/config/index.js
import "dotenv/config";

// ===== 读取工具 =====

class ConfigError extends Error {
  constructor(msg) { super(msg); this.name = "ConfigError"; }
}

function str(name, def) {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (def !== undefined) return def;
  throw new ConfigError(`缺少环境变量 ${name}`);
}

function num(name, def) {
  const raw = process.env[name];
  // 注意：不能写成 Number(raw ?? def)。因为 Number("") === 0
  const v = raw === undefined || raw === "" ? def : Number(raw);
  if (v === undefined) throw new ConfigError(`缺少环境变量 ${name}`);
  if (!Number.isFinite(v)) throw new ConfigError(`环境变量 ${name} 必须是数字，实际是 "${raw}"`);
  return v;
}

function bool(name, def) {
  const raw = process.env[name];
  if (raw === undefined) return def;
  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) return false;
  throw new ConfigError(`环境变量 ${name} 必须是 true/false，实际是 "${raw}"`);
}

function list(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function required(name) {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new ConfigError(
      `环境变量 ${name} 必须配置。\n` +
      `  本地开发：复制 .env.example 成 .env 然后填值\n` +
      `  服务器：  在部署配置里设置`
    );
  }
  return v;
}

// ===== 组装 =====

const env = str("NODE_ENV", "development");

export const config = {
  env,
  isProd: env === "production",
  isDev: env === "development",
  isTest: env === "test",

  server: {
    port: num("PORT", 3000),
    host: str("HOST", "127.0.0.1"),
    // 生产环境应该关掉，否则会暴露技术栈
    trustProxy: bool("TRUST_PROXY", false),
    bodyLimit: str("BODY_LIMIT", "1mb"),
  },

  db: {
    file: str("DB_FILE", "./data/app.db"),
    // SQLite 的另一个选项：内存库（测试用）
    memory: bool("DB_MEMORY", false),
  },

  model: {
    baseURL: str("API_BASE", "https://api.example.com/v1"),
    primary: {
      name: str("MODEL_PRIMARY", "cheap-model"),
      key: str("KEY_PRIMARY", ""),
    },
    backup: {
      name: str("MODEL_BACKUP", "backup-model"),
      key: str("KEY_BACKUP", ""),
      baseURL: str("API_BASE_BACKUP", str("API_BASE", "https://api.example.com/v1")),
    },
    promptFile: str("PROMPT_FILE", "./prompt.txt"),
    maxTokens: num("MODEL_MAX_TOKENS", 400),
    temperature: num("MODEL_TEMPERATURE", 0),
  },

  timeout: {
    connect: num("TIMEOUT_CONNECT_MS", 3_000),
    firstByte: num("TIMEOUT_FIRST_BYTE_MS", 8_000),
    total: num("TIMEOUT_TOTAL_MS", 30_000),
  },

  log: {
    level: str("LOG_LEVEL", env === "production" ? "info" : "debug"),
    dir: str("LOG_DIR", "./logs"),
    // 单文件上限（字节），超过就切
    rotateAt: num("LOG_ROTATE_BYTES", 10 * 1024 * 1024),
    keepDays: num("LOG_KEEP_DAYS", 7),
  },

  review: {
    backlogLimit: num("QUEUE_BACKLOG_LIMIT", 200),
  },

  // 只在需要时才要求这些（第 136 节会用到）
  _required: {
    KEY_PRIMARY: () => required("KEY_PRIMARY"),
  },
};

// ===== 打印一份脱敏后的配置（启动时用） =====

export function describeConfig() {
  const mask = (s) => (s ? `${s.slice(0, 3)}***${s.slice(-2)}（${s.length} 字符）` : "(空)");
  return {
    env: config.env,
    port: config.server.port,
    db: config.db.memory ? "(内存)" : config.db.file,
    modelPrimary: config.model.primary.name,
    keyPrimary: mask(config.model.primary.key),
    modelBackup: config.model.backup.name,
    keyBackup: mask(config.model.backup.key),
    timeouts: `${config.timeout.connect}/${config.timeout.firstByte}/${config.timeout.total} ms`,
    logLevel: config.log.level,
  };
}
```

## 1.3 逐段解释四个关键点

**① `num()` 里那行注释为什么关键**

```javascript
// ❌ 这个写法有 bug
function num(name, def) {
  const v = Number(process.env[name] ?? def);
  ...
}

// ✅ 正确
const v = raw === undefined || raw === "" ? def : Number(raw);
```

**因为：**

```javascript
Number(undefined)  → NaN
Number("")         → 0        ← 这个
Number(null)       → 0
Number("0")        → 0
```

**`PORT=` （等号后面是空）→ `process.env.PORT === ""` → `Number("") === 0` → 端口 0。**

**端口 0 在 Node 里意味着"随机分配一个可用端口"。** 所以你的服务能启动，日志说"listening on 0"，然后你访问 3000 打不开。

**这个 bug 我见过至少三个人踩。**

**② 为什么 `str()` 把 `""` 当没配**

```javascript
process.env.KEY_PRIMARY = ""     // .env 里写了 KEY_PRIMARY=
```

**如果你只用 `??` 判断：**

```javascript
process.env["KEY_PRIMARY"] ?? "默认值"
// "" ?? "默认值"  → "" ← 得到空字符串
```

**`??` 只对 `null` 和 `undefined` 生效，不对 `""` 生效。**

**所以 `.env` 里写 `KEY_PRIMARY=` 会得到空字符串，而你以为"没配就用默认"。**

**③ `bool()` 为什么要穷举四种写法**

```text
"true" / "1" / "yes" / "on"    → true
"false" / "0" / "no" / "off"   → false
其他                            → 抛错
```

**因为 `Boolean("false") === true`。**

```javascript
Boolean("false")   → true     ← 这个坑
Boolean("0")       → true
Boolean("")        → false
```

**如果你的代码是 `isProd: Boolean(process.env.PROD)`，那么 `PROD=false` 会开启生产模式。**

**④ `describeConfig()` 为什么要在启动时打印**

```text
启动日志里看到：
  env: production
  db: /var/www/app/data/app.db
  keyPrimary: sk-***ab（51 字符）
```

**这三个信息能在 3 秒内告诉你"有没有连错库、用错 key"。**

**注意 key 只打印前 3 后 2 和长度。** 长度很重要 —— 如果长度是 0 你会看到 `(空)`，如果是 51 说明是完整的 key，如果是 12 说明你填错了（填了个占位符）。

## 1.4 更新 `.env.example`

```bash
cat > .env.example << 'EOF'
# ============================================
# 复制这个文件为 .env，然后填值
# .env 不要提交到 git
# ============================================

# --- 运行环境 ---
NODE_ENV=development

# --- 服务 ---
PORT=3000
HOST=127.0.0.1
BODY_LIMIT=1mb

# --- 数据库 ---
DB_FILE=./data/app.db

# --- 模型 ---
API_BASE=https://api.example.com/v1
MODEL_PRIMARY=cheap-model
KEY_PRIMARY=
MODEL_BACKUP=backup-model
KEY_BACKUP=
PROMPT_FILE=./prompt.txt
MODEL_MAX_TOKENS=400
MODEL_TEMPERATURE=0

# --- 超时（毫秒）---
TIMEOUT_CONNECT_MS=3000
TIMEOUT_FIRST_BYTE_MS=8000
TIMEOUT_TOTAL_MS=30000

# --- 日志 ---
LOG_LEVEL=debug
LOG_DIR=./logs
LOG_ROTATE_BYTES=10485760
LOG_KEEP_DAYS=7

# --- 复核队列 ---
QUEUE_BACKLOG_LIMIT=200
EOF
```

## 1.5 一个必须验证的实验

```bash
# 1. 正常启动
npm start
# 应该看到启动日志里有 describeConfig 的输出

# 2. 改端口
PORT=4000 npm start
# 应该跑在 4000

# 3. 什么都不配（临时移走 .env）
mv .env .env.bak
npm start
# 应该能启动（因为有默认值），但 key 是空的

# 4. 恢复
mv .env.bak .env
```

**第 3 步是关键验证：没有 `.env` 也能启动。**

**如果你第 3 步启动失败** → 说明你有某个 `str()` 调用没给默认值 → 那它的确是"必须配置的"，要么给默认值，要么承认它必须配（这时应该在第 136 节用 `required()`）。

---

# 第 2 步：把硬编码一条条搬走（30 分钟）

## 2.1 先搬最危险的三个

**按"泄露后损失大小"排序，不是按"难易"排序。**

```text
① key / token / 密码         → 泄露 = 钱没了
② 数据库路径                 → 指错 = 数据没了
③ 外部 API 地址              → 指错 = 打到测试环境或别人服务器
```

**① key：从代码里删掉，只从 config 读**

```javascript
// ❌ 之前
headers: { Authorization: `Bearer sk-abc123...` }

// ✅ 之后
headers: { Authorization: `Bearer ${config.model.primary.key}` }
```

**② 数据库路径**

```javascript
// ❌ 之前
new Database("./data/app.db")

// ✅ 之后
new Database(config.db.file)
```

**③ API 地址**

```javascript
// ❌ 之前
fetch("https://api.openai.com/v1/chat/completions", ...)

// ✅ 之后
fetch(`${config.model.baseURL}/chat/completions`, ...)
```

## 2.2 再搬"看起来无害"的

```text
④ 超时时间：3000 / 8000 / 30000
⑤ 日志保留天数：7
⑥ 队列积压阈值：200
⑦ max_tokens：400
⑧ temperature：0
```

**这些为什么要搬？**

```text
你会在某个客户的场景下需要改它们，而那时你不想改代码、不想重新部署、
不想让 git 记录"为某个客户改了一个数字"。
```

**具体例子：**

```text
客户 A 的输入很短 → max_tokens 200 就够 → 省一半输出费
客户 B 的输入很长 → max_tokens 800 才不被截断
```

**同一个代码，两个 .env。**

## 2.3 不该搬的三类

**① 业务规则里的数字**

```javascript
// ❌ 不要搬到 config
if (amount >= config.urgency.highThreshold) return "high";

// ✅ 就写在 services 里
if (amount >= 500) return "high";
```

**为什么？**

```text
"500 算 high" 是业务规则 →
它应该和"high 是什么意思"写在同一个文件里 →
否则你改规则时要改 .env，而 .env 不在 git 里，没有历史记录 →
三个月后你不知道"这个 500 是哪来的"
```

**例外：如果客户要求"这个阈值我要能自己调"，那就搬到 config，并且要有一个界面上能改。**

**② 枚举值**

```javascript
// ❌ 不要搬
CATEGORIES = config.categories.split(",")

// ✅ 就是常量
export const CATEGORIES = ["logistics", "quality", "refund", "invoice", "account", "other"];
```

**因为枚举值是"你的数据结构"，不是"环境差异"。** 搬到 config 会导致"开发和生产的枚举不一样"，那是灾难。

**③ 文案**

```javascript
// ❌ 不要搬
message: config.messages.notFound

// ✅ 放 errors/index.js
NOT_FOUND: { status: 404, message: "找不到这条记录" }
```

**文案属于错误定义，不是一个环境数值。**

## 2.4 一个必须做的检查

```bash
# 搬完之后重跑五条命令
grep -rn "3000\|8080" app/ --include="*.js" | grep -v "config/"
grep -rniE "sk-|api[_-]?key|password|secret" app/ --include="*.js" | grep -v "config/"
grep -rn "\./data\|\./logs" app/ --include="*.js" | grep -v "config/"
grep -rn "https\?://" app/ --include="*.js" | grep -v "config/"
```

**目标：全部无输出，或者输出的只是注释。**

**如果还有输出，逐条判断：**

```text
这条会不会因"部署在哪"而变？
  会 → 继续搬
  不会 → 留在原地，但要在 NOTES 里写一句"这条我看着像硬编码，实际是业务规则"
```

## 2.5 一个具体的对照

**给一个完整的 before/after：**

```javascript
// ========== BEFORE: app/model.js ==========
const API = "https://api.openai.com/v1";
const KEY = "sk-proj-abc123def456";
const MODEL = "gpt-4o-mini";

export async function call(input, prompt) {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 400,
      messages: [{ role: "system", content: prompt }, { role: "user", content: input }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  return res.json();
}
```

```javascript
// ========== AFTER: app/lib/model.js ==========
import { config } from "../config/index.js";

export async function call(input, prompt) {
  const res = await fetch(`${config.model.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.model.primary.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model.primary.name,
      temperature: config.model.temperature,
      max_tokens: config.model.maxTokens,
      messages: [{ role: "system", content: prompt }, { role: "user", content: input }],
    }),
    signal: AbortSignal.timeout(config.timeout.total),
  });
  return res.json();
}
```

**六个硬编码全部消失。** 而代码结构完全一样 —— **这就是"不改逻辑只搬家"。**

---

# 第 3 步：密钥的正确处理方式（20 分钟）

## 3.1 `.gitignore` 必须有的四行

```bash
cat >> .gitignore << 'EOF'

# 环境配置
.env
.env.local
.env.*.local

# 数据
*.db
*.db-journal
*.db-wal
*.db-shm

# 日志
logs/
*.log
EOF
```

## 3.2 如果 `.env` 已经被提交过

**先检查：**

```bash
git log --all --oneline -- .env
```

**有输出 = 它曾经进过 git。**

**处理三步：**

```bash
# ① 从索引里移除（不动工作区的文件）
git rm --cached .env

# ② 提交
git commit -m "移除 .env（含密钥），改为从环境变量读"

# ③ 加进 .gitignore（如果还没有）
echo ".env" >> .gitignore
git add .gitignore
git commit -m "忽略 .env"
```

## 3.3 关键：吊销旧 key

**git 历史里的东西删不干净。**

```text
git rm --cached  → 只是"以后不再跟踪"
git 历史里的那个 commit 里，key 还在
任何人 clone 之后 git log -p 就能看到
```

**所以：**

```text
① 去供应商后台，把这个 key 吊销（revoke）
② 生成一个新的
③ 填进 .env
```

**不要跳过这一步。** 有人会说"我的仓库是私有的所以没事" —— 私有仓库也可能：

```text
· 被误设为公开
· 被协作者 clone 到本地
· 被 CI 系统缓存
· 被 fork
```

**吊销的成本是 2 分钟，不吊销的潜在成本是你的全部余额。**

## 3.4 一个更彻底的做法（可选）

**如果你想彻底从历史里删掉：**

```bash
# 需要 git-filter-repo（pip install git-filter-repo）
git filter-repo --path .env --invert-paths
```

**但这会重写全部 commit hash**，所有协作者都要重新 clone。

**判断标准：**

```text
仓库只有你一个人  → 可以这么干（但吊销 key 更简单）
有别人在用       → 别干，吊销 key 就够了
```

**推荐：永远吊销 key，不要试图删历史。** 因为删历史有风险，吊销 key 没有。

## 3.5 一个容易被忽略的地方

**你的 `.env` 可能出现在这些地方：**

```text
✅ 已经检查的：
   · git 仓库
  
❌ 容易漏的：
   · 备份文件（.env.bak / .env.old）
   · 剪贴板截图（你发给别人看"我的配置长这样"）
   · 聊天记录（你贴给同事说"帮我看看这个 key 对不对"）
   · 部署脚本里（cp .env /opt/app/）
   · Docker 镜像里（COPY . . 会把 .env 打进去）
```

**最后一条最危险：**

```dockerfile
# ❌ 这会把 .env 打进镜像
COPY . .

# ✅ 用 .dockerignore
# .dockerignore 里加：.env
```

**第 29 周会专门讲 Docker，但今天就要知道这件事。**

---

# 第 4 步：故意犯三个错（20 分钟）

## 4.1 错误一：`PORT=` 留空

```bash
# 编辑 .env，把 PORT=3000 改成 PORT=
npm start
```

**会发生什么？**

**如果你看到"listening on port 0"** → 你的 `num()` 有 bug（用了 `??` 或 `Number(...)`）。

**如果你看到 3000** → 正确（`""` 被当成没配，用了默认值）。

**然后访问 `http://localhost:3000` 验证。**

## 4.2 错误二：`PROD=false` 却开启了生产模式

**如果你的代码用了 `Boolean(process.env.X)`，试试：**

```bash
PROD=false node -e "console.log(Boolean(process.env.PROD))"
```

**输出：`true`**

**这就是为什么 `bool()` 必须穷举。**

**验证你的实现：**

```bash
node -e "
import('dotenv/config').then(() => {
  process.env.TEST_BOOL='false';
  // 模拟你的 bool 实现
  const raw = process.env.TEST_BOOL;
  const v = ['1','true','yes','on'].includes(raw.toLowerCase()) ? true
          : ['0','false','no','off'].includes(raw.toLowerCase()) ? false
          : 'ERROR';
  console.log('PROD=false 解析结果:', v);   // 应该是 false
});
"
```

## 4.3 错误三：`.env` 里写了一个占位符

```bash
# .env
KEY_PRIMARY=sk-xxxxxxxxxxxxxxxx
```

**启动，看 `describeConfig()` 的输出：**

```text
keyPrimary: sk-***xx（20 字符）
```

**20 字符 → 这是一个占位符，不是真 key。**

**而真 key 通常 40–80 字符。**

```text
如果长度 < 30 → 大概率是占位符
如果长度 = 0  → 没配
```

**把这个检查加进启动逻辑：**

```javascript
// app/config/validate.js（第136节会完善）
export function checkKeyShape(key, name) {
  if (!key) return `${name} 为空`;
  if (key.length < 30) return `${name} 长度只有 ${key.length}，像是占位符`;
  if (key.includes("xxx") || key.includes("your")) return `${name} 里含 xxx/your，像是占位符`;
  return null;
}
```

**这个检查能救你在上线前一天发现"我配的是示例值"。**

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **五条 grep 的原始输出**（搬之前）
- **搬完之后还剩什么，为什么留着**
- **三个故意的错误，实际现象**
- **`.env` 有没有进过 git，key 吊销了吗**

---

# 第 6 步：课后练习

## 练习一：给配置加一个"自检接口"（20 分钟）

```javascript
// app/routes/admin.js
adminRouter.get("/config-check", (req, res) => {
  const issues = [];

  const k = config.model.primary.key;
  if (!k) issues.push("KEY_PRIMARY 未配置");
  else if (k.length < 30) issues.push(`KEY_PRIMARY 长度 ${k.length}，疑似占位符`);

  if (config.isProd && config.log.level === "debug") {
    issues.push("生产环境 LOG_LEVEL=debug，会记录过多信息");
  }
  if (config.isProd && /localhost|127\.0\.0\.1/.test(config.model.baseURL)) {
    issues.push("生产环境 API_BASE 指向本地地址");
  }
  if (config.db.file.startsWith("./") && config.isProd) {
    issues.push("生产环境用了相对路径的数据库，启动目录不同会连到不同的库");
  }

  res.json({
    ok: issues.length === 0,
    env: config.env,
    issues,
    config: describeConfig(),
  });
});
```

**这个接口的价值：上线后第一次访问，3 秒确认全部配置正确。**

**注意：这个接口要加鉴权，或者只在非生产环境开放** —— 它暴露了配置结构（虽然 key 被脱敏了）。

## 练习二：算清"配错一次"的代价（15 分钟）

**三种配错，各算一次：**

```text
① 生产连了开发库
   后果：客户数据写进开发库 → 一周后发现 → 数据合并要多长时间？
   我的估算：____

② key 是占位符
   后果：全部请求失败 → 客户全部收到"服务不可用" → 
   我的估算：____

③ 生产 LOG_LEVEL=debug
   后果：日志量涨 10 倍 + 记录了更多细节（可能含 PII）
   我的估算：____
```

**参考答案框架：**

```text
① 最惨。开发库可能在你的笔记本上，数据要手工迁移。
   而且你可能已经跑了测试脚本删掉了部分数据。
   代价：几小时 + 可能永久丢数据

② 立刻可见（全部 500），修起来 2 分钟。代价：小
   但如果是"部分 key 错"（比如备用 key 占位符），会静默降级很久

③ 磁盘涨得快 + 合规风险。代价：月中才发现，要临时清日志
```

**注意 ② 的第二种情况 —— 它最阴。** 备用 key 是占位符时，平时不会暴露，只有主模型挂的那天才全部失败。

**所以 `checkKeyShape` 必须对主备都检查。**

## 练习三：判断这个配置设计错在哪（15 分钟）

```javascript
// config.js
export const config = {
  dbUrl: "postgres://user:pass123@localhost:5432/app",
  redisUrl: "redis://localhost:6379",
  openaiKey: "sk-proj-xxxxx",
  isProd: process.env.NODE_ENV === "production",
  maxRetries: 3,
  feeRate: 0.006,
};
```

**错在哪？至少五条。**

**参考答案：**

```text
① 数据库密码和 key 硬编码在代码里 → 提交即泄露
② isProd 是真的从环境读的，其他都是硬编码 → 一半搬了一半没搬，
   最危险（你以为"我已经做了配置化"）
③ maxRetries / feeRate 混在 config 里 → 这两是业务规则，
   应该分别在"重试逻辑"和"计费逻辑"旁边
④ 没有读取校验 → 如果环境变量写错，运行时才炸
⑤ 没有默认值兜底 → 换一台机器就要重新配
⑥ 名字叫 config.js 但在根目录 → 应该 app/config/index.js，
   否则会有人往里面塞别的
```

**第 ② 条最典型。** "半配置化"比"完全硬编码"更危险，因为它给你一种"我已经处理了"的错觉。

---

# 第 7 步：最终验收

## A. 硬编码清零

```bash
grep -rn "3000\|8080" app/ --include="*.js" | grep -v "config/"
grep -rniE "sk-|api[_-]?key|password|secret" app/ --include="*.js" | grep -v "config/"
grep -rn "\./data\|\./logs" app/ --include="*.js" | grep -v "config/"
grep -rn "https\?://" app/ --include="*.js" | grep -v "config/"
```

- [ ] 四条命令都无输出（或只有注释）
- [ ] 我逐条看过剩余命中，能说出"它为什么不是硬编码"

## B. 配置结构

- [ ] `config/index.js` 有 `str` / `num` / `bool` / `list` / `required` 五个工具
- [ ] `num` 正确处理了 `""`（不是 `Number("") === 0`）
- [ ] `bool` 穷举了四种 true 和四种 false 写法
- [ ] `str` 把 `""` 当没配

## C. 三个实验

- [ ] `PORT=4000 npm start` 跑在 4000
- [ ] 移走 `.env` 后仍能启动（默认值兜底）
- [ ] `PORT=`（留空）→ 用默认值 3000，不是端口 0

## D. 启动自检

- [ ] 启动时打印 `describeConfig()`，key 只显示前后几位和长度
- [ ] 我能从启动日志 3 秒内确认"环境对不对"
- [ ] 加了 `checkKeyShape`，占位符会被识别

## E. 密钥安全

- [ ] `.env` 在 `.gitignore` 里
- [ ] `git status` 里没有 `.env`
- [ ] 检查过 `git log --all -- .env`，如果有历史，key 已吊销
- [ ] `.env.example` 已提交，只有名字没有值
- [ ] 我检查过备份文件、部署脚本、Docker 配置里有没有 `.env`

## F. 提交

```bash
git add -A
git commit -m "第135节：配置全部外置，五条 grep 零命中"
git push
```

---

## 本节课要能说出口的一句话

> **配置外置不是为了"方便"，是为了"防止你在生产环境连到开发库"。**

---

# 附：常见问题速查

**Q：`required()` 和"给默认值"什么时候各用哪个？**

A：**问一句："这个值错了，系统会静默地做错事吗？"**

```text
会 → 用 required()，宁可启动失败
不会 → 给默认值，方便开发

例：
  KEY_PRIMARY 错了 → 所有调用失败（会报错，不是静默）→ 可以给默认值（空）
  DB_FILE 错了    → 建了一个空库，数据"消失"（静默！）→ 必须 required 或强校验
  PORT 错了       → 换个端口启动（可见）→ 给默认值
```

**注意 `DB_FILE` 这一类：指向错误路径不会报错，只会建一个新库。这是最危险的一类。**

**Q：我的 key 长度不到 30，但它是真的（内部服务的 token）？**

A：**把长度阈值做成配置项，不要写死 30。**

```javascript
keyMinLen: num("KEY_MIN_LENGTH", 30),
```

**然后你的内部服务在 `.env` 里写 `KEY_MIN_LENGTH=8`。**

**关键是"有这个检查"，不是"阈值是多少"。**

**Q：`.env.example` 里要不要写示例值？**

A：**要，但绝不能是可用的值。**

```text
✅ KEY_PRIMARY=            （留空，逼你自己填）
✅ KEY_PRIMARY=your-key-here
❌ KEY_PRIMARY=sk-proj-abc123def456    （看起来能用，有人会真用）
```

**最后一种最危险** —— 有人 clone 完直接跑，然后调不通，来问你，你才发现他用了示例值。

**留空 + `required()` 报错，是最清晰的。**

**Q：为什么业务规则的 500 不搬到 config？**

A：**因为它需要 git 历史。**

```text
在 services/ticket.js 里：
  git log -p app/services/ticket.js
  → 能看到"11月20日把 500 改成了 300，因为客户A说..."

在 .env 里：
  .env 不在 git 里 → 没有任何历史
  → 三个月后你不知道 300 是哪来的
```

**例外：如果客户要自己调，搬到 config 并配一个设置界面（第 24 周多租户会做）。**

**Q：我有很多个环境（本地/测试/预发/生产），怎么管？**

A：**四个 `.env` 文件，用 `NODE_ENV` 区分。**

```bash
.env                # 本地（不提交）
.env.test           # 测试（不提交，但内容可以是假的）
.env.staging        # 预发（不提交）
.env.example        # 模板（提交）
```

**启动时指定：**

```bash
NODE_ENV=staging node app/index.js     # dotenv 会读 .env 而不是 .env.staging
```

**注意：`dotenv` 默认只读 `.env`。** 要用其他文件必须显式：

```javascript
import dotenv from "dotenv";
dotenv.config({ path: `.env.${process.env.NODE_ENV ?? "development"}` });
```

**这个坑很常见** —— 你改了 `NODE_ENV` 但发现还是读的 `.env`。

**Q：我的 key 只能从配置文件读，不能用环境变量，怎么办？**

A：**让 config 支持"从文件读"这一种来源。**

```javascript
function fileOrEnv(envName, filePath) {
  const v = process.env[envName];
  if (v) return v;
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8").trim();
  throw new ConfigError(`既没有 ${envName} 也没有 ${filePath}`);
}
```

**这是 Docker secret / K8s secret 的标准做法** —— 密钥挂载成文件，不放进环境变量（因为环境变量会被 `ps` 看到、会被打到崩溃日志里）。
