# 第 140 节课：建立项目规范

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的标准只有一句：**规范里的每一条，都有一个脚本能检查。**
> 检查不了的规范，三个月后就不存在了。

**建议用时**：110 分钟
**你需要先完成**：第 134–139 节的 `app/` 目录和 `API.md`
**今天要装**：什么都不用装（用 Node 内置 + 一条 `grep`）

---

# 第 0 步：为什么"我们约定"等于"没有约定"（15 分钟）

## 0.1 一个真实的坍塌过程

```text
第 1 周：你写 CONVENTIONS.md，列了 20 条约定
第 2 周：你遵守
第 3 周：赶功能，有一条没遵守（"下次补上"）
第 5 周：又有三条没遵守
第 8 周：你自己都不记得有几条
第 12 周：有人问"我们用什么命名风格"，你答不上来
```

**坍塌的原因不是懒，是"违反没有代价"。**

```text
约束有代价 → 你会遵守
约束没代价 → 你会绕过
```

## 0.2 唯一的解法：让违反可见

```text
❌ 写进文档  → 靠自觉
✅ 写进脚本  → 违反就报错（或者至少打印警告）
```

**今天的核心交付物不是 `CONVENTIONS.md`，是 `scripts/lint.js`。**

```text
CONVENTIONS.md  → 说清"为什么这么定"
scripts/lint.js → 说清"违反了哪一条"
```

**这两个文件必须是配套的：每一条约定都有对应的检查编号。**

## 0.3 一个判断标准

**写任何一条约定之前，先问：**

```text
"如果违反了，我怎么知道？"
  答不出来 → 这条约定不会被执行，别写
  答得出来 → 写下来，并写清检查方法
```

**用这一条筛，你原来的 20 条大概会剩下 8 条。** 那 8 条是真规范，剩下 12 条是愿望。

---

# 第 1 步：只写能检查的约定（25 分钟）

## 1.1 八条约定（每条都有检查）

```markdown
# 项目规范

> 每条都有对应的检查编号，运行 `node scripts/lint.js` 会报出违反项。
> 检查不了的约定不写在这里 —— 它不会被执行。

## 一、文件与目录

### C1 每个文件只做一件事，文件名要说清是什么事
禁止 `utils.js` / `helpers.js` / `common.js` / `misc.js`。
**检查**：lint.js 扫文件名黑名单。
**为什么**：一个叫 utils 的文件超过 200 行，说明不知道里面为什么放在一起。

### C2 目录层级不超过 4 层
`app/services/billing/invoice/detail.js` = 5 层，不行。
**检查**：lint.js 扫路径深度。
**为什么**：5 层之后你找文件靠搜索，不靠结构。

## 二、配置

### C3 代码里不许出现硬编码的 key / 端口 / 路径
**检查**：lint.js 正则扫 `sk-`、`:3000`、`./data/`、`https://`（排除 config/ 和注释）。
**为什么**：第 135 节讲过，配错一次能删掉生产数据。

### C4 所有配置从 config/index.js 读
**检查**：lint.js 检查 `process.env` 是否只出现在 `app/config/` 下。
**为什么**：散落的 `process.env.XXX` 等于散落的配置，多环境时必然出错。

## 三、错误与日志

### C5 不许 `console.log`，只许 `log.*`
**检查**：lint.js 扫 `console.log(` / `console.error(`（排除 scripts/ 和测试）。
**为什么**：console 不走日志文件、没结构、没 trace_id、没脱敏。

### C6 抛错必须用 `fail()` 或 `new AppError()`
禁止 `throw new Error("...")`（除了 lib 层内部转换）。
**检查**：lint.js 扫 `throw new Error`。
**为什么**：裸 Error 会走到 `INTERNAL`，前端看到"处理失败"，而实际可能是参数问题。

## 四、数据

### C7 SQL 只许出现在 `app/repos/`
**检查**：lint.js 在 `app/services/`、`app/routes/`、`app/lib/` 里扫 `SELECT|INSERT|UPDATE|DELETE FROM`。
**为什么**：第 134 节讲过，换数据库时不该改业务代码。

### C8 日志和响应里不许出现 PII
**检查**：lint.js 扫源码里的测试数据；`scripts/log.sh pii` 扫运行时日志。
**为什么**：第 132 节讲过。
```

## 1.2 为什么只有八条

```text
20 条 → 你记不住，且检查不了
8 条  → 每条都有脚本，忘了也会被拦

而且这八条覆盖了最容易出事的四类：
  结构（C1 C2）→ 影响可维护性
  配置（C3 C4）→ 影响能不能上线
  错误（C5 C6）→ 影响能不能查
  数据（C7 C8）→ 影响安全和可移植性
```

## 1.3 被筛掉的那些（写进"不建议但不强制"）

```markdown
## 不建议但不强制（没法自动检查）

- 函数不超过 50 行
- 每个函数有注释
- 变量名不缩写（`cfg` → `config`）
- commit message 用祈使句

这些靠 code review，不靠脚本。**单人开发时你会违反它们，接受这个现实。**
```

**为什么要把"不强制"的也列出来？**

因为**把它们混进强制列表，会让整个规范失去可信度。**

```text
"20 条都要遵守" → 你违反了 12 条 → 你开始无视全部
"8 条必须遵守 + 4 条尽量" → 你遵守 8 条 → 规范活着
```

---

# 第 2 步：写检查脚本（35 分钟）★ 核心

## 2.1 完整实现

```javascript
// scripts/lint.js
// 项目规范检查。每条对应 CONVENTIONS.md 里的编号。
// 用法：node scripts/lint.js [--fix]

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = ["app", "scripts", "public"];

// 排除的目录
const SKIP_DIRS = new Set(["node_modules", ".git", "logs", "data", "dist", "coverage"]);
// 排除的文件（脚本和测试允许特殊写法）
const isScriptOrTest = (f) => /(^|[\\/])(scripts|test|tests|__tests__)[\\/]/.test(f) || /\.test\.js$/.test(f);

// ===== 收集所有 js 文件 =====
function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (/\.(js|mjs)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = SRC.flatMap((d) => walk(path.join(ROOT, d)));

// ===== 规则定义 =====
// 每条：{ id, check(file, content) → [{line, msg}] }

const RULES = [
  {
    id: "C1",
    desc: "禁止 utils/helpers/common/misc 这类文件",
    check(file, content) {
      const base = path.basename(file).replace(/\.(js|mjs)$/, "");
      if (/^(utils?|helpers?|common|misc|shared|stuff)$/i.test(base)) {
        return [{ line: 1, msg: `文件名 "${path.basename(file)}" 说了等于没说，改成具体名字` }];
      }
      // 也检查超过 300 行的文件
      const lines = content.split("\n").length;
      if (lines > 300) {
        return [{ line: 1, msg: `文件有 ${lines} 行，超过 300，考虑拆开` }];
      }
      return [];
    },
  },
  {
    id: "C2",
    desc: "目录层级不超过 4 层",
    check(file) {
      const rel = path.relative(ROOT, file);
      const depth = rel.split(path.sep).length;
      if (depth > 5) {          // app/services/a/b/c.js = 6 段
        return [{ line: 1, msg: `路径 ${rel} 有 ${depth - 1} 层目录，超过 4 层` }];
      }
      return [];
    },
  },
  {
    id: "C3",
    desc: "禁止硬编码 key / 端口 / 路径 / URL",
    check(file, content) {
      const rel = path.relative(ROOT, file);
      if (rel.startsWith(path.join("app", "config"))) return [];   // config 里是允许的
      if (isScriptOrTest(file)) return [];

      const out = [];
      const patterns = [
        { re: /\bsk-[A-Za-z0-9_-]{10,}/g, what: "疑似 key" },
        { re: /["']:?(3000|3001|8080|5000)["']/g, what: "疑似硬编码端口" },
        { re: /["']\.\/(data|logs)\//g, what: "疑似硬编码相对路径" },
        { re: /["']https?:\/\/(?!localhost)[^"']+["']/g, what: "疑似硬编码外部 URL" },
      ];

      const lines = content.split("\n");
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;   // 注释放过

        for (const p of patterns) {
          p.re.lastIndex = 0;
          if (p.re.test(line)) out.push({ line: i + 1, msg: `${p.what}：${trimmed.slice(0, 70)}` });
        }
      });
      return out;
    },
  },
  {
    id: "C4",
    desc: "process.env 只许出现在 app/config/",
    check(file, content) {
      const rel = path.relative(ROOT, file);
      if (rel.startsWith(path.join("app", "config"))) return [];
      if (isScriptOrTest(file)) return [];

      const out = [];
      content.split("\n").forEach((line, i) => {
        if (/\bprocess\.env\b/.test(line) && !line.trim().startsWith("//")) {
          out.push({ line: i + 1, msg: `process.env 应该只在 config 里读：${line.trim().slice(0, 60)}` });
        }
      });
      return out;
    },
  },
  {
    id: "C5",
    desc: "禁止 console.log / console.error",
    check(file, content) {
      if (isScriptOrTest(file)) return [];
      const out = [];
      content.split("\n").forEach((line, i) => {
        if (/\bconsole\.(log|error|warn|info|debug)\s*\(/.test(line) && !line.trim().startsWith("//")) {
          out.push({ line: i + 1, msg: `用 log.* 代替 console.*：${line.trim().slice(0, 60)}` });
        }
      });
      return out;
    },
  },
  {
    id: "C6",
    desc: "禁止裸 throw new Error",
    check(file, content) {
      if (isScriptOrTest(file)) return [];
      // lib/ 层内部转换允许（比如 model.js 把 fetch 错误包装）
      const rel = path.relative(ROOT, file);
      if (rel.includes(path.join("app", "lib"))) return [];

      const out = [];
      content.split("\n").forEach((line, i) => {
        if (/throw\s+new\s+Error\s*\(/.test(line) && !line.trim().startsWith("//")) {
          out.push({ line: i + 1, msg: `用 fail("CODE") 或 new AppError() 代替：${line.trim().slice(0, 60)}` });
        }
      });
      return out;
    },
  },
  {
    id: "C7",
    desc: "SQL 只许出现在 app/repos/",
    check(file, content) {
      const rel = path.relative(ROOT, file);
      if (rel.startsWith(path.join("app", "repos"))) return [];
      if (rel.startsWith(path.join("app", "lib")) && rel.endsWith("db.js")) return [];   // 建表
      if (isScriptOrTest(file)) return [];

      const out = [];
      const re = /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i;
      content.split("\n").forEach((line, i) => {
        if (re.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
          out.push({ line: i + 1, msg: `SQL 应该在 app/repos/：${line.trim().slice(0, 60)}` });
        }
      });
      return out;
    },
  },
  {
    id: "C8",
    desc: "源码里不许出现疑似真实 PII",
    check(file, content) {
      const out = [];
      const re = /1[3-9]\d{9}|[1-9]\d{5}(19|20)\d{2}\d{4}\d{3}[\dXx]/g;
      content.split("\n").forEach((line, i) => {
        re.lastIndex = 0;
        if (re.test(line)) {
          // 允许明显的假值
          if (/13800138000|13812345678|12345678901/.test(line)) return;
          out.push({ line: i + 1, msg: `疑似真实手机号/身份证：${line.trim().slice(0, 60)}` });
        }
      });
      return out;
    },
  },
];

// ===== 执行 =====
const results = [];

for (const file of files) {
  let content;
  try { content = fs.readFileSync(file, "utf8"); } catch { continue; }

  for (const rule of RULES) {
    const hits = rule.check(file, content);
    for (const h of hits) {
      results.push({
        rule: rule.id,
        file: path.relative(ROOT, file),
        line: h.line,
        msg: h.msg,
      });
    }
  }
}

// ===== 输出 =====
const byRule = {};
for (const r of results) (byRule[r.rule] ??= []).push(r);

console.log(`\n扫描 ${files.length} 个文件\n`);

if (!results.length) {
  console.log("✅ 全部通过\n");
  process.exit(0);
}

for (const [id, items] of Object.entries(byRule)) {
  const rule = RULES.find((r) => r.id === id);
  console.log(`\n${id}  ${rule.desc}  （${items.length} 处）`);
  for (const it of items.slice(0, 10)) {
    console.log(`  ${it.file}:${it.line}  ${it.msg}`);
  }
  if (items.length > 10) console.log(`  ...还有 ${items.length - 10} 处`);
}

console.log(`\n合计 ${results.length} 处违反。`);
console.log(`规范原文见 CONVENTIONS.md。\n`);
process.exit(1);
```

## 2.2 逐条解释四个关键设计

**① 为什么 `isScriptOrTest` 要放过**

```text
scripts/lint.js 自己就用了 console.log 和 process.env
scripts/dangerous.js 里就是拼 SQL
test 里需要造脏数据
```

**如果不放过，你的 lint 脚本会报自己。**

**这是所有 lint 工具的第一个问题**，而大部分人会在第一步就放弃。

**② 为什么 `app/config` 要白名单**

```text
config/index.js 的整个职责就是读 process.env
```

**规则 C4（process.env 只在 config 里）如果不在 config 里放过，它就是自相矛盾的。**

**③ 为什么注释要跳过**

```text
// 不要用 console.log    ← 这行不该被报
const port = 3000;       ← 这行该被报
```

**跳过注释的代价是"有人把违规代码写进注释来绕过"** —— 但那不是你的问题。

**④ 为什么只输出前 10 条**

```text
第一次跑可能有 200 处违反
输出 200 行 → 你不想看 → 关掉 → 永远不修
输出 10 行 → 你修完这 10 条 → 再跑 → 又 10 条 → 有进度感
```

**这是"让它可被修复"的关键设计。**

## 2.3 一个必须做的实验

```bash
node scripts/lint.js
```

**第一次跑，你大概率会看到 30–100 处。**

**然后分三步修：**

```text
第一步：修 C5（console.log）—— 最容易，机械替换
第二步：修 C3（硬编码）—— 需要搬到 config，但你第 135 节已经搬过大半
第三步：修 C7（SQL 位置）—— 需要移动函数，可能要改 import
```

**C6（裸 throw）和 C8（PII）通常很少，顺手修掉。**

## 2.4 修不完怎么办

**如果第一次有 200 处，不要试图一天修完。**

```json
{
  "C5": ["app/routes/old.js:42", "app/routes/old.js:88"],
  "C3": ["app/lib/legacy.js:15"]
}
```

```javascript
// lint.js 里加
const baseline = JSON.parse(fs.readFileSync("scripts/lint-baseline.json", "utf8"));
const isKnown = (r) => (baseline[r.rule] ?? []).includes(`${r.file}:${r.line}`);

const newViolations = results.filter((r) => !isKnown(r));
const knownViolations = results.length - newViolations.length;

console.log(`新增 ${newViolations.length} 处，历史遗留 ${knownViolations} 处`);
if (newViolations.length) process.exit(1);
```

**这个机制叫 "baseline"，是所有成熟 lint 工具的标配。**

**它的价值：让你可以"从现在开始不许新增"，而不是"必须先修完 200 处才能用"。**

**后者 100% 会失败。**

---

# 第 3 步：让它自动跑（20 分钟）

## 3.1 三个触发点

```text
① 提交前（pre-commit hook）
② 保存时（编辑器）
③ 部署前（脚本里加一行）
```

## 3.2 提交前

**不用 husky，直接写 `.git/hooks/pre-commit`：**

```bash
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# 提交前跑 lint，不通过就拒绝提交
node scripts/lint.js
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 有规范违反，提交被拒绝。"
  echo "   修完再提交，或用 git commit --no-verify 临时跳过（不推荐）"
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

**注意：`.git/hooks/` 不进版本库。**

**如果要团队共享，得放在 `scripts/` 里然后复制：**

```bash
# package.json
"prepare": "node scripts/install-hooks.js"
```

```javascript
// scripts/install-hooks.js
import fs from "node:fs";
fs.mkdirSync(".git/hooks", { recursive: true });
fs.copyFileSync("scripts/pre-commit.sh", ".git/hooks/pre-commit");
fs.chmodSync(".git/hooks/pre-commit", 0o755);
console.log("已安装 pre-commit hook");
```

**你自己一个人开发时，直接写 `.git/hooks/` 更简单。**

## 3.3 一个必须做的实验

```bash
# ① 造一个违规
echo 'console.log("test");' >> app/lib/model.js

# ② 提交
git add app/lib/model.js
git commit -m "test"
```

**期望：提交被拒，输出 C5 的违反。**

```bash
# ③ 修掉
git checkout app/lib/model.js
git commit -m "test"     # 这次能过
```

**这个实验必须做** —— 因为 pre-commit hook 最常见的失败是"设了但没生效"（权限不对、路径不对）。

## 3.4 `package.json` 里加三个 script

```json
{
  "scripts": {
    "dev": "cross-env NODE_ENV=development node --watch app/index.js",
    "start": "cross-env NODE_ENV=production node app/index.js",
    "test": "cross-env NODE_ENV=test node --test",
    "lint": "node scripts/lint.js",
    "check-docs": "node scripts/check-docs.js",
    "check": "npm run lint && npm run check-docs"
  }
}
```

**`npm run check` 是"上线前一条命令"** —— 第 21 周的清单里会用到它。

---

# 第 4 步：写 README（20 分钟）

## 4.1 项目 README 的五个问题

**新人（或三个月后的你）打开仓库，会问五个问题：**

```text
① 这是什么？             → 一句话描述
② 我要怎么跑起来？        → 三条命令
③ 代码在哪？             → 目录说明
④ 我要改 X，该动哪个文件？ → 常见任务导航
⑤ 出问题了怎么办？        → 排查入口
```

**README 只需要回答这五个。** 不需要架构图、不需要设计理念、不需要"项目愿景"。

## 4.2 模板

```markdown
# 客服工单助手

把客户的一段话整理成结构化工单，不确定时转人工。

## 跑起来

\`\`\`bash
cp .env.example .env.development
# 编辑 .env.development，填 KEY_PRIMARY
npm install
npm run dev
\`\`\`

打开 http://localhost:3000

**验证**：
\`\`\`bash
curl -s localhost:3000/health
# {"ok":true,"env":"development"}
\`\`\`

## 目录

| 路径 | 是什么 |
|---|---|
| `app/routes/` | URL 到函数的映射，只解析参数 |
| `app/services/` | 业务规则（分类、紧急度、转人工判断） |
| `app/repos/` | 数据库操作，SQL 只在这里 |
| `app/lib/` | 模型调用、日志、脱敏、队列 |
| `app/config/` | 所有环境配置 |
| `app/errors/` | 错误码表 |
| `scripts/` | lint、文档验证、危险操作 |
| `eval/` | 评测集和判分器（第 18 周） |
| `API.md` | 接口文档 |
| `CONVENTIONS.md` | 项目规范 |

## 我要改 X

| 我想改 | 动这个文件 |
|---|---|
| 分类规则 | `app/services/ticket.js` 的 `decideCategory` |
| 紧急度门槛（500 元） | `app/services/ticket.js` 的 `decideUrgency` |
| 提示词 | `prompt.txt`（改完要重启） |
| 模型 / key | `.env.development` |
| 超时时间 | `.env.development` |
| 错误文案 | `app/errors/index.js` |
| 加一个接口 | 新建 `app/routes/xxx.js`，在 `app/index.js` 挂上 |
| 加一张表 | `app/lib/db.js` 的 `migrate()`，然后在 `app/repos/` 加函数 |

## 出问题了

\`\`\`bash
npm run check              # 规范和文档检查
./scripts/log.sh errors    # 今天的错误
./scripts/log.sh today     # 今天的事件漏斗
./scripts/log.sh trace tr_xxx   # 某条请求的完整链路
node scripts/daily-digest.js    # 昨天的摘要
\`\`\`

**服务起不来**：看启动日志的 `❌ 配置检查未通过`，它会告诉你是哪一项。
**接口报错**：响应里有 `trace_id`，用上面第 3 条命令查。
**数据不对**：先看 `curl localhost:3000/api/admin/env` 确认连的是哪个库。
```

## 4.3 "我要改 X"这张表是整份 README 最值钱的部分

**为什么？**

```text
三个月后你回来，想改"金额门槛从 500 改成 300"
→ 你不记得在哪个文件
→ grep "500" 得到 47 个结果
→ 逐个看，20 分钟
```

**有这张表：5 秒。**

**这张表怎么写？**

```text
回想你这周做过的每一次"改一个东西"
把它记下来
```

**你今天已经在做了 —— 就是现在，把你已经知道的写进去。**

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **八条约定各自的检查结果**（第一次跑的数字）
- **baseline 机制**（如果你用了）
- **pre-commit 生效了吗**
- **README 的"我要改 X"表有几行**

---

# 第 6 步：课后练习

## 练习一：加一条"禁止超长函数"（25 分钟）

```text
规则 C9：单个函数不超过 80 行

实现思路：
① 一个粗糙但够用的办法：找 `function xxx(` 或 `xxx(...) => {` 开始，
   数到与之匹配的 `}` 结束
② 更简单的办法：找连续 80 行没有空行的代码块（空行是你的朋友）
③ 最实用的办法：只检查"文件里最长的一段连续非空行"
```

**为什么 80 行？**

```text
20 行  → 很难做到，会逼你拆出很多小函数，反而更难读
80 行  → 大部分函数能做到，超过的就是真的该拆
200 行 → 太宽松，等于没约束
```

**这个规则的价值不在于"严格执行 80"，在于"超过 80 时你会想一下"。**

## 练习二：让 lint 输出可点击（20 分钟）

**很多终端支持"点击文件:行号跳转"（VS Code 的终端、iTerm2）。**

```javascript
// 把输出格式改成
console.log(`  ${it.file}:${it.line}:${it.col ?? 1}  ${it.msg}`);
```

**注意：必须是 `file:line:col` 三段，某些终端才认。**

**这个改动很小，但会让"修违规"从"手动找文件"变成"点一下"。**

## 练习三：判断这个规范错在哪（15 分钟）

```markdown
# 团队规范

1. 代码要整洁、可读。
2. 变量命名要有意义。
3. 函数不要太长。
4. 注释要写清楚。
5. 提交信息要规范。
6. 不要复制粘贴代码。
7. 遇到问题及时沟通。
8. 保持学习。
9. 代码 review 要认真。
10. 遵守团队的编码风格。
```

**错在哪？至少五条。**

**参考答案：**

```text
① 十条全是形容词，没有一条可判定 → "整洁"是多少行？"太长"是多长？
② 没有一条能自动化检查 → 等于零执行
③ 第 7、8、9 条不是规范，是鸡汤
④ 第 10 条是循环定义（"遵守编码风格"—— 风格是什么？）
⑤ 没有说明"违反了会怎样"
⑥ 没有编号对应关系 → 没法引用"你违反了第 3 条"
```

**这份规范的真实作用：贴在墙上，没人看。**

**替换成"文件不许叫 utils.js"这种能 grep 的，才有意义。**

---

# 第 7 步：最终验收

## A. 规范文件

- [ ] `CONVENTIONS.md` 有 8 条左右，每条有编号
- [ ] 每条都有"检查方式"（对应 lint 的规则 id）
- [ ] 每条都有"为什么"
- [ ] 有一节"不建议但不强制"，且和强制项分开
- [ ] 没有纯形容词的条款（"整洁""有意义""不要太长"）

## B. 检查脚本

- [ ] `scripts/lint.js` 有 C1–C8 八条规则
- [ ] 跳过 `node_modules` / `logs` / `data`
- [ ] 放过 `scripts/` 和测试文件
- [ ] 放过 `app/config/`（C3/C4 的白名单）
- [ ] 输出 `<file>:<line>` 可点击格式
- [ ] 每类只显示前 10 条
- [ ] 有违反时 exit code = 1

## C. 全绿或 baseline

- [ ] 要么跑到全绿
- [ ] 要么有 `lint-baseline.json`，且"新增 0 处"
- [ ] 我修掉了至少 C5（console.log）全部

## D. 自动执行

- [ ] `.git/hooks/pre-commit` 存在且可执行
- [ ] 造一个违规 → 提交被拒（**我实测过**）
- [ ] `npm run lint` 能跑
- [ ] `npm run check` 串了 lint + check-docs

## E. README

- [ ] 一句话说清"这是什么"
- [ ] 三条命令能跑起来
- [ ] 目录说明表
- [ ] **"我要改 X"导航表至少 8 行**
- [ ] 出问题的排查入口

## F. 提交

```bash
git add -A
git commit -m "第140节：CONVENTIONS.md + lint.js（C1-C8）+ pre-commit + README"
git push
```

---

## 本节课要能说出口的一句话

> **检查不了的规范等于不存在。写规范之前先问"违反了怎么知道"。**

---

# 附：常见问题速查

**Q：我的项目就我一个人，需要规范吗？**

A：**更需要。**

```text
有团队 → 有人 review，自然形成约定
一个人 → 没有任何外力，三个月后习惯全变
```

**而唯一的"外力"就是脚本。**

**而且三个月后的你就是"另一个人"** —— 他不记得你今天为什么这么写。

**Q：lint 报 200 处，我不想修。**

A：**用 baseline。**

```bash
# 生成 baseline（把当前所有违规都记成"历史遗留"）
node scripts/lint.js --snapshot > scripts/lint-baseline.json
```

**然后规则变成"新增零容忍"。**

**这个机制的作用：让你能"今天就开始"，而不是"等我修完 200 处"。**

**后者从来不会发生。**

**Q：pre-commit 太慢了，每次提交等 3 秒。**

A：**三个选择：**

```text
① 只检查改动的文件（git diff --name-only）
② 把 lint 移到 pre-push（提交快，推送慢）
③ 接受 3 秒（3 秒换"永远不会有违规"，很值）
```

**推荐 ①：**

```javascript
// lint.js 支持 --changed
const changed = execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" })
  .split("\n").filter((f) => f.endsWith(".js"));
```

**这会把 3 秒降到 0.3 秒。**

**Q：`console.log` 完全不能用吗？脚本里怎么办？**

A：**脚本里可以（`scripts/` 在白名单里）。**

**应用代码里不行**，因为：

```text
console → stdout → 你的日志系统看不到（如果日志写文件）
console → 没结构 → jq 查不了
console → 没 trace_id → 关联不了
console → 没脱敏 → PII 泄露
```

**用 `log.info()` 代替，一行替换。**

**Q：`throw new Error` 完全不能写？**

A：**理论上不能，但有两类例外：**

```text
① lib 层包装外部错误
   fetch 抛的错要转成带 kind 的错误，那里必须 new Error
   → lint 白名单了 app/lib/

② 断言（不应该发生的情况）
   if (!config) throw new Error("config 没初始化")   ← 这是启动期断言
   → 这类会被报，改成 fail("INTERNAL") 也行
```

**如果 lint 报了你的启动断言，加一行 `// eslint-disable` 式的注释，或者在 baseline 里放过。**

**但不要因为"偶尔需要"就关掉整条规则。**

**Q：README 的"我要改 X"表，我怎么知道该写哪些行？**

A：**回看你这一周的每次修改。**

```text
这个月你改了：
  · 分类规则（加了一个 category）
  · 提示词（三次）
  · 超时（两次）
  · 错误文案（一次）
  · 加了一个接口（两次）
→ 这五行就是表格的第一批内容
```

**然后每次你"找了三分钟才找到该改哪个文件"的时候，就往表里加一行。**

**三个月后这张表会是你最常打开的东西。**
