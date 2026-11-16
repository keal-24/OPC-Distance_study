# 第 147 节课：上线前清单

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的标准：**12 项以内，其中至少 5 项能被一条命令验证。**
> 清单不是给你看的，是给"发布前 5 分钟的你"用的。

**建议用时**：110 分钟
**你需要先完成**：第 141–146 节的全部
**今天要装**：什么都不用装

---

# 第 0 步：清单为什么会失效（15 分钟）

## 0.1 一个真实的坍塌

```text
第 1 次发布：你写了 30 项清单，逐项检查，用了 40 分钟
第 2 次发布：跳过了"看起来不会错"的 12 项，用了 20 分钟
第 3 次发布：只看前 5 项，用了 5 分钟
第 5 次发布：不看了，"我记得"
第 8 次发布：事故。你回头找清单，发现它在某个 md 文件里，已经两个月没打开
```

**三个阶段的原因：**

```text
① 太长（30 项）→ 你有理由跳
② 太多"人工检查"→ 每项都要想"这个该怎么查"
③ 没有"不检查的代价"→ 你不知道哪几项是致命的
```

## 0.2 三个设计原则

```text
原则一：12 项以内
  超过 12 项，你会开始跳。这是认知负荷的硬限制。

原则二：至少 5 项是命令
  能跑命令的项，你 3 秒就能过完。人工项每项要 30 秒。

原则三：标出"跳过会怎样"
  每项后面写"跳过 → 什么后果"。
  后果严重的（数据丢失、泄露）绝不跳；后果轻的（格式不好看）可以跳。
```

## 0.3 一个反直觉的结论

**清单的价值不在"列出了什么"，在"它让你在发布前停下来 5 分钟"。**

```text
你有清单 → 你会打开它 → 你会看到"生产环境 DB 路径"这一项
         → 你会去确认 → 你发现它指向了开发库
         → 你救了自己

你没清单 → 你直接 npm start → 一周后发现数据在开发库里
```

**那 5 分钟的"仪式感"本身就是价值。**

---

# 第 1 步：先做一个"一条命令检查全部"（30 分钟）★ 核心

## 1.1 五个能自动化的检查

```text
① 测试全绿               npm test
② 规范无违反             npm run lint
③ 文档命令能跑           npm run check-docs
④ 配置检查通过           启动时自动跑（第136节）
⑤ 关键接口能响应         curl /health + /api/admin/env
```

**五个，一条命令串起来。**

## 1.2 写 `scripts/preflight.js`

```javascript
// scripts/preflight.js
// 上线前自动检查。任何一项失败 → 退出码 1 → 不发布。
// 用法：node scripts/preflight.js [--env production]

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const envArg = args.includes("--env") ? args[args.indexOf("--env") + 1] : "test";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3999";

const results = [];
function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  const icon = pass ? "✅" : "❌";
  console.log(`${icon} ${name}${detail ? "  — " + detail : ""}`);
}

function sh(cmd) {
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? "") + String(e.stderr ?? ""), code: e.status };
  }
}

console.log(`\n=== 上线前检查（env=${envArg}）===\n`);

// ===== 1. 测试全绿 =====
{
  const r = sh("npm test");
  const m = r.out.match(/ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/);
  const pass = m && Number(m[2]) === 0 && Number(m[1]) > 0;
  record("单元 + 接口测试全绿", Boolean(pass), m ? `pass ${m[1]} / fail ${m[2]}` : "解析失败");
}

// ===== 2. 规范无违反 =====
{
  const r = sh("node scripts/lint.js");
  const m = r.out.match(/合计 (\d+) 处违反/);
  const n = m ? Number(m[1]) : NaN;
  record("规范检查", n === 0, Number.isFinite(n) ? `${n} 处违反` : (r.ok ? "通过" : "有违反"));
}

// ===== 3. 没有硬编码密钥 =====
{
  const r = sh(`grep -rnE "sk-[A-Za-z0-9_-]{20,}" app/ --include="*.js" || true`);
  const hit = r.out.trim().length > 0;
  record("代码里没有真实 key", !hit, hit ? r.out.split("\n")[0].slice(0, 60) : "");
}

// ===== 4. .env 没被提交 =====
{
  const r = sh("git ls-files | grep -E '(^|/)\\.env$' || true");
  const hit = r.out.trim().length > 0;
  record(".env 不在版本库里", !hit, hit ? r.out.trim() : "");
}

// ===== 5. 配置自检（起一个临时服务，打 /health 和 /api/admin/env）=====
{
  // 这依赖服务已经在跑；如果没跑，跳过并提示
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    const j = await res.json();
    record("服务 /health 可达", res.ok && j.ok === true, `env=${j.env}`);
  } catch (e) {
    record("服务 /health 可达", false, "服务没起（先 npm run dev 或用 --skip-live）");
  }
}

// ===== 6. 生产配置的形状 =====
{
  // 只检查"文件里写了什么"，不启动
  const prodEnv = ".env.production";
  if (!fs.existsSync(prodEnv)) {
    record("生产配置存在", false, `${prodEnv} 不存在`);
  } else {
    const txt = fs.readFileSync(prodEnv, "utf8");
    const checks = [
      { name: "DB_FILE 是绝对路径", re: /^DB_FILE=\//m },
      { name: "LOG_LEVEL 不是 debug", re: /^LOG_LEVEL=(?!debug)/m },
      { name: "API_BASE 不是本地", re: /^API_BASE=https?:\/\/(?!localhost|127\.0\.0\.1)/m },
    ];
    const fails = checks.filter((c) => !c.re.test(txt));
    record(
      "生产配置三项形状正确",
      fails.length === 0,
      fails.length ? fails.map((f) => f.name).join(" / ") : ""
    );
  }
}

// ===== 7. 关键字段的枚举值一致 =====
{
  // 检查提示词里的枚举和代码里的枚举一致
  const codeCats = (() => {
    try {
      const src = fs.readFileSync("app/services/ticket.js", "utf8");
      const m = src.match(/CATEGORIES\s*=\s*\[([^\]]+)\]/);
      if (!m) return null;
      return m[1].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) ?? [];
    } catch { return null; }
  })();

  const promptCats = (() => {
    try {
      const src = fs.readFileSync("prompt.txt", "utf8");
      const line = src.match(/category[：:].*?((?:logistics|quality|refund|invoice|account|other).*(?:\/|、|\s).*)/i);
      if (!line) return null;
      return ["logistics","quality","refund","invoice","account","other"].filter((c) => line[0].includes(c));
    } catch { return null; }
  })();

  if (!codeCats) {
    record("提示词与代码枚举一致", false, "读不到 CATEGORIES");
  } else if (!promptCats) {
    record("提示词与代码枚举一致", false, "读不到 prompt.txt 里的枚举（可能格式不同，人工确认）");
  } else {
    const missing = codeCats.filter((c) => !promptCats.includes(c));
    record("提示词与代码枚举一致", missing.length === 0, missing.length ? `提示词缺：${missing.join(",")}` : `${codeCats.length} 个`);
  }
}

// ===== 8. 测试集已冻结（没被偷改）=====
{
  const r = sh("git diff eval-v1 -- eval/cases.jsonl 2>/dev/null | grep '^-' | grep -v '^---' || true");
  const changed = r.out.trim().length > 0;
  record("测试集没被修改（只加不改）", !changed, changed ? "有删除或修改" : "");
}

// ===== 9. 依赖锁文件更新 =====
{
  const r = sh("git status --porcelain package-lock.json");
  const dirty = r.out.trim().length > 0;
  record("package-lock.json 已提交", !dirty, dirty ? "有未提交改动" : "");
}

// ===== 汇总 =====
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} 通过 ===`);

if (failed.length) {
  console.log(`\n❌ ${failed.length} 项未通过：`);
  failed.forEach((f) => console.log(`   · ${f.name}  ${f.detail}`));
  console.log(`\n修完再发布。\n`);
  process.exit(1);
}

console.log(`\n✅ 全部通过，可以发布。\n`);
```

## 1.3 逐段解释三个设计

**① 为什么第 1 项是 `npm test`，而不是"检查代码看着对不对"**

```text
"看着对"无法自动化，且不可靠
npm test 有明确的 pass/fail，且是 1 分钟
```

**把最重要的检查放在第一条，因为如果第一条就红，你不用看后面。**

**② 为什么第 7 项检查"提示词和代码枚举一致"**

**这是最容易出错、最难发现的地方。**

```text
你给数据库加了 `complaint` 类别
→ 改了 app/services/ticket.js 的 CATEGORIES
→ 改了数据库的 CHECK 约束
→ 忘了改 prompt.txt 里的枚举列表
→ 模型永远不会返回 complaint
→ 你以为"这个类别没人用"
```

**这一项能抓住它。**

**③ 为什么第 8 项检查"测试集没被改"**

```text
第 121 节讲了"只加不改"
但你会偷改（"就改这一条，不影响"）
→ 你的历史分数全部不可比
```

**用 `git diff eval-v1` 检测。**

## 1.4 加进 package.json

```json
{
  "scripts": {
    "preflight": "cross-env NODE_ENV=test node scripts/preflight.js",
    "preflight:prod": "node scripts/preflight.js --env production"
  }
}
```

```bash
npm run preflight
```

**期望输出：**

```text
=== 上线前检查（env=test）===

✅ 单元 + 接口测试全绿  — pass 52 / fail 0
✅ 规范检查
✅ 代码里没有真实 key
✅ .env 不在版本库里
✅ 服务 /health 可达  — env=test
❌ 生产配置存在  — .env.production 不存在
✅ 提示词与代码枚举一致  — 6 个
✅ 测试集没被修改（只加不改）
✅ package-lock.json 已提交

=== 8/9 通过 ===
```

**那个 ❌ 是你今天的作业** —— 把 `.env.production` 建起来（不用真值，用占位符）。

---

# 第 2 步：写人工检查项（25 分钟）

## 2.1 剩下 3 项，全部是"必须要人看一眼"

```markdown
## 人工检查（3 项）

### M1 手动走一遍主流程

```bash
# 1. 打开页面，提交一条"会转人工"的输入
curl -X POST localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"message":"上次那个事你们什么时候给我个说法"}'

# 2. 应该返回 202，记下 trace_id

# 3. 打开 /review.html，应该看到这一条
# 4. 按 1 通过
# 5. 刷新，队列空了
```

**跳过 → 你可能上线一个"页面白屏"或"按钮没反应"的版本**

### M2 看一眼日志

```bash
./scripts/log.sh errors
```

**应该是空的，或者只有你认识的错。**

**跳过 → 你可能带着一个"每分钟 10 条 error"的版本上线**

### M3 确认回滚方式

```bash
git log --oneline -3        # 记下当前 commit
git tag release-$(date +%Y%m%d-%H%M)
```

**跳过 → 出事时你不知道该回滚到哪个版本**
```

## 2.2 为什么只有 3 项人工

```text
因为人工项最贵（每项 30 秒到 5 分钟）
而且最容易被跳过（"我记得上次是好的"）
所以只保留"机器验不了 + 跳过后果严重"的三项
```

**其他所有能自动化的，都已经在第 141–146 节变成测试了。**

**这是这一周的最大红利：** 你前六节的测试，让今天的清单从 30 项降到 12 项。

## 2.3 一个必须加的"回滚脚本"

```bash
# scripts/rollback.sh
#!/bin/bash
# 回滚到上一个 release tag
set -e

LAST=$(git tag --sort=-creatordate | grep '^release-' | head -1)
PREV=$(git tag --sort=-creatordate | grep '^release-' | sed -n '2p')

if [ -z "$PREV" ]; then
  echo "❌ 没有上一个 release tag，无法回滚"
  git tag --sort=-creatordate | grep '^release-' | head -5
  exit 1
fi

echo "当前：$LAST"
echo "回滚到：$PREV"
read -p "确认？(yes/no) " ok
[ "$ok" = "yes" ] || exit 1

git checkout "$PREV" -- .
npm ci
echo "✅ 已回滚到 $PREV，请重启服务"
```

```bash
chmod +x scripts/rollback.sh
```

**注意：这是"代码回滚"，不含数据回滚。** 数据回滚更复杂（要看有没有改表结构），**写进 `NOTES.md`。**

---

# 第 3 步：整份清单（20 分钟）

```markdown
# RELEASE.md · 上线前清单

> 12 项。9 项自动（`npm run preflight`），3 项人工。
> 每项的"跳过会怎样"必须看 —— 那是你判断"能不能跳"的依据。

## 一次性执行

```bash
npm run preflight      # 9 项自动检查，全绿才继续
```

## 自动检查明细（9 项）

| # | 检查 | 命令 | 跳过会怎样 |
|---|---|---|---|
| A1 | 测试全绿 | `npm test` | 带着已知 bug 上线 |
| A2 | 规范无违反 | `node scripts/lint.js` | 硬编码的 key 被提交 |
| A3 | 代码里没真实 key | grep `sk-` | key 泄露到 git |
| A4 | `.env` 不在版本库 | `git ls-files` | 同上 |
| A5 | 服务 `/health` 可达 | curl | 上线即挂 |
| A6 | 生产配置三项形状 | 读 `.env.production` | 连错库 / debug 日志 |
| A7 | 提示词与代码枚举一致 | 读两边对比 | 某个类别永远不生效 |
| A8 | 测试集没被改 | `git diff eval-v1` | 历史分数不可比 |
| A9 | lock 文件已提交 | `git status` | 服务器装到不同版本 |

## 人工检查（3 项）

### M1 手动走一遍主流程（2 分钟）

```bash
curl -X POST localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"message":"上次那个事你们什么时候给我个说法"}'
# 期望 202

# 打开 /review.html → 看到这条 → 按 1 通过 → 刷新空了
```

- [ ] 提交返回 202
- [ ] 页面能看到
- [ ] 按 1 能通过
- [ ] 刷新后队列空

**跳过 → 页面白屏 / 按钮无反应**

### M2 看日志（30 秒）

```bash
./scripts/log.sh errors
```

- [ ] 空的，或只有认识的错

**跳过 → 带着"每分钟 10 条 error"上线**

### M3 打 tag + 记住回滚方式（30 秒）

```bash
git tag release-$(date +%Y%m%d-%H%M)
git log --oneline -3
```

- [ ] tag 打了
- [ ] 知道回滚命令：`./scripts/rollback.sh`

**跳过 → 出事时不知道回滚到哪**

## 发布后 10 分钟

- [ ] `curl /api/admin/env` → 确认 `env=production`、`db` 行数合理
- [ ] `./scripts/log.sh errors` → 没有新错
- [ ] `./scripts/log.sh today` → 事件漏斗正常

**这三条是"发布成功"的证明。** 不确认，你不知道自己是不是发了个 500 上去。

## 数据回滚（这个清单不覆盖）

代码回滚用 `rollback.sh`，数据回滚要看：
- 有没有改表结构（有 → 要反向迁移）
- 有没有删数据（有 → 只能从备份恢复）

**每次改表结构时，单独写一份"如何撤销"。**
```

## 3.1 "跳过会怎样"这一列的价值

**它让你能理直气壮地跳。**

```text
A9（lock 文件）跳过 → 后果轻 → 赶时间可以跳
A6（生产配置形状）跳过 → 后果是数据丢失 → 绝不跳
M3（打 tag）跳过 → 后果是回滚困难 → 不跳
```

**没有这一列，你不知道哪些能跳，最后全部跳掉。**

## 3.2 "发布后 10 分钟"为什么必须单独一节

**因为"发布成功"和"部署成功"是两件事。**

```text
部署成功（npm start 没报错）  ≠  发布成功（用户能正常用）
```

**三个确认：**

```text
① /api/admin/env → 连的是生产库，行数正常（不是 0 行）
② 日志无新错
③ 事件漏斗正常（有请求进来，有 normal 的 req_out）
```

**10 分钟能做的三件事，省你"发完才发现挂了"的尴尬。**

---

# 第 4 步：走一遍完整流程（20 分钟）

## 4.1 现在就做一次"彩排发布"

```bash
# 1. 确认工作区干净
git status

# 2. 跑自动检查
npm run preflight

# 3. 人工三项
#    M1: curl 提交 → 打开 /review.html → 按 1
#    M2: ./scripts/log.sh errors
#    M3: git tag release-$(date +%Y%m%d-%H%M)
```

## 4.2 故意让一项失败

```bash
# 造一个规范违反
echo 'console.log("test");' >> app/lib/model.js

npm run preflight
```

**期望：A2 红，退出码 1。**

```bash
git checkout app/lib/model.js
```

## 4.3 记录"彩排用了多久"

```text
自动检查：____ 秒
人工三项：____ 分钟
合计：____ 分钟
```

**如果超过 15 分钟** → 说明有项太慢 → 优化它（比如把 `npm test` 的慢测试分开）。

**如果少于 3 分钟** → 说明你可能有项没认真做。

---

# 第 5 步：把清单变成"每次发布必用"（15 分钟）

## 5.1 三个让它不被遗忘的机制

```text
① 放在仓库根目录，名字显眼（RELEASE.md，不是 docs/release-checklist-v2.md）
② README 里第一句就提它（"发布前必读 RELEASE.md"）
③ 做成 npm script（`npm run release`），让你敲命令时自然想起
```

```json
{
  "scripts": {
    "release": "npm run preflight && echo '\n✅ 自动检查通过，去做 RELEASE.md 里的 3 项人工检查'"
  }
}
```

## 5.2 给发布打 tag 的规范

```bash
# 格式：release-YYYYMMDD-HHMM
git tag release-20261117-1430
git push --tags
```

**为什么带时间？**

```text
release-v1.2.3  → 你要维护版本号，且不知道是哪天发的
release-20261117-1430 → 时间就在名字里，回滚时一眼看出
```

**小项目不需要语义化版本。** 需要的是"快速定位到某个时刻"。

## 5.3 一个"发布日志"

```markdown
# 发布记录

| 时间 | tag | 改了什么 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-11-17 14:30 | release-20261117-1430 | 加复核队列接口 | ✅ | 10 分钟后确认正常 |
| 2026-11-20 09:15 | release-20261120-0915 | 分类加 complaint | ⚠️ | 上线后发现 trace 缺失，10:20 修复 |
```

**这张表的价值：**

```text
三个月后你想知道"complaint 是什么时候加的、有没有出问题"
→ 一眼看到
```

**而且它会暴露一个事实："⚠️ 那次的备注"比 ✅ 的那些更有信息量。**

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **9 项自动检查的通过情况**
- **哪一项最难写**
- **彩排用了多久**
- **数据回滚你打算怎么做**

---

# 第 7 步：课后练习

## 练习一：加一条"依赖有已知漏洞"检查（20 分钟）

```bash
npm audit --audit-level=high
```

**加进 `preflight.js`：**

```javascript
{
  const r = sh("npm audit --audit-level=high --json");
  let parsed;
  try { parsed = JSON.parse(r.out); } catch { parsed = null; }
  const high = parsed?.metadata?.vulnerabilities?.high ?? 0;
  const critical = parsed?.metadata?.vulnerabilities?.critical ?? 0;
  record("依赖无高危漏洞", high === 0 && critical === 0, `high ${high} / critical ${critical}`);
}
```

**注意：`npm audit` 经常报"间接依赖有漏洞但无法修"** —— 这时你要么接受（记进 NOTES），要么换依赖。

**不要让这条永远红着** —— 那会让你习惯"有一条红的也能发"。

## 练习二：给"数据库迁移"写撤销方案（25 分钟）

**你加了 `complaint` 类别，如果上线后要撤销：**

```sql
-- 前向迁移
ALTER TABLE tickets ADD COLUMN sub_category TEXT;

-- 反向迁移
ALTER TABLE tickets DROP COLUMN sub_category;
```

**但注意：**

```text
SQLite 的 DROP COLUMN 在旧版本不支持（3.35 之前）
→ 需要重建表
→ 数据要迁移
→ 这是一次真正的风险
```

**写出你的撤销步骤，以及"如果不可撤销怎么办"（比如保留列，只是代码不用）。**

**"不可撤销"往往是最优解** —— 留一个没用的列，比"重建表时丢数据"安全。

## 练习三：判断这份清单错在哪（15 分钟）

```markdown
# 上线清单

1. 检查代码有没有 bug
2. 检查数据库连接
3. 检查 key 对不对
4. 检查日志有没有报错
5. 测试一下主要功能
6. 看看性能怎么样
7. 记得备份
8. 记得通知客户
9. 记得改版本号
10. 记得更新文档
11. 记得告诉同事
12. 检查一下安全
```

**错在哪？至少五条。**

**参考答案：**

```text
① 没有一条能自动化 → 每项都要"想一下怎么查" → 你会跳过
② "检查有没有 bug" 不可执行 → 这是愿望不是检查
③ "看看性能怎么样" 没有阈值 → 多少算好？
④ "记得备份" 没说备份什么、备份到哪、怎么验证成功
⑤ "检查一下安全" 太宽泛 → 安全有 20 个方面
⑥ 没有"跳过会怎样" → 无法判断优先级
⑦ 没有命令 → 每项都要手动操作
⑧ 12 项里 5 项是"记得" → 说明这些事经常忘，但没做成机制
```

**第 ⑧ 条最有意思：** 写"记得做 X"的人，其实是在承认"我做 X 时经常忘"。**正确做法是把 X 变成脚本或 hook，不是写进清单。**

---

# 第 8 步：最终验收

## A. 自动检查脚本

- [ ] `scripts/preflight.js` 存在
- [ ] 9 项检查齐全（A1–A9）
- [ ] 任何一项失败 → 退出码 1
- [ ] 输出用 ✅/❌ 一眼可读
- [ ] `npm run preflight` 能跑

## B. 九项自动检查各自能跑

- [ ] A1 `npm test` 全绿
- [ ] A2 `lint` 零违反
- [ ] A3 无真实 key
- [ ] A4 `.env` 不在 git
- [ ] A5 `/health` 可达
- [ ] A6 `.env.production` 三项形状正确
- [ ] A7 提示词与代码枚举一致
- [ ] A8 测试集没被改
- [ ] A9 lock 文件已提交

## C. 三项人工

- [ ] M1 手动走主流程（4 个小勾）
- [ ] M2 看日志
- [ ] M3 打 tag + 知道回滚命令

## D. 回滚

- [ ] `scripts/rollback.sh` 存在
- [ ] 至少有两个 `release-*` tag 能测
- [ ] **写清了"数据回滚怎么做"**

## E. 发布后确认

- [ ] `RELEASE.md` 里有"发布后 10 分钟"三条
- [ ] 我知道"部署成功 ≠ 发布成功"

## F. 彩排

- [ ] 完整走了一遍
- [ ] 总耗时 __ 分钟（3–15 分钟之间）
- [ ] 故意让 A2 失败，确认会红

## G. 提交

```bash
git add -A
git commit -m "第147节：RELEASE.md 12项（9自动+3人工）+ preflight.js + rollback.sh"
git push --tags
```

---

## 本节课要能说出口的一句话

> **清单的价值不在"列了什么"，在"它逼你在发布前停 5 分钟"。**

---

# 附：常见问题速查

**Q：12 项是不是太少了？我担心漏东西。**

A：**不少。你的测试已经覆盖了大部分。**

```text
第 141–146 节做的：
  · 52 条测试（单元 + 接口 + 错误 + e2e）
  · 压测报告（知道上限）
  · lint（8 条规范）
  · 文档验证（curl 全跑通）

这些都在 A1/A2/A5 里被"一条命令"覆盖了。
清单不需要重复它们，只需要"触发"它们。
```

**如果你想加更多，先问："这一项能不能变成测试？"** 能，就去做测试；不能，才进清单。

**Q：`preflight.js` 里 A5 需要服务已经在跑，怎么办？**

A：**两个办法：**

```text
① 要求先 npm run dev，然后跑 preflight（简单，但多一步）
② preflight 自己 spawn 一个临时服务（自动，但要处理端口清理）
```

**推荐 ①** —— 因为你要"发布"，服务本来就在跑。

**但如果没跑，A5 会红**，提示"服务没起"。**这不是 bug，是正确的检查。**

**Q：A7（提示词与代码枚举一致）的正则太脆弱，怎么办？**

A：**脆弱是必然的 —— 你在解析自然语言。**

**两个改进：**

```text
① 让 prompt.txt 里的枚举列表有固定格式（比如单独一行 `CATEGORIES: a, b, c`）
   → 正则稳定
   
② 或者不做静态检查，改成"运行时验证"：
   发一条请求，看模型返回的 category 是否在 CATEGORIES 里
   → 但这依赖模型
```

**推荐 ①：改 prompt.txt 的格式，让机器能读。**

**这也是"文档要能被验证"（第 139 节）的同一条原则。**

**Q：`git tag` 多了会不会乱？**

A：**会。三个清理规则：**

```text
① 只给"真的发布到生产"的版本打 tag
② 名字统一 release-YYYYMMDD-HHMM
③ 每季度清一次旧的（保留最近 10 个 + 每次事故对应的）
```

```bash
# 看所有 release tag
git tag --sort=-creatordate | grep '^release-' | head -20
```

**Q：数据回滚到底怎么做？**

A：**三种情况，三种做法：**

```text
① 只改了代码 → git 回滚就够
② 加了列/表 → 保留（反向迁移风险大），代码不再用它
③ 删了数据 → 只能从备份恢复，且有丢失窗口
```

**② 是最常见的，也是最容易被忽略的** —— 你加了一个列，回滚代码后那个列还在，不影响。**这没问题。**

**但如果你改了一个列的语义（"urgency=high 现在表示另一件事"），回滚就会出错。**

**规则：永远不改变已有字段的语义，只加新字段。**

**Q：彩排要不要真的发布到生产？**

A：**第一次不要。**

```text
第一次彩排 → 在测试环境走完整流程
第二次     → 发布到生产，但选一个低峰时段（比如周二上午 10 点）
第三次以后 → 按清单走
```

**"低峰时段"很重要** —— 万一挂了，影响的人少。

**Q：这一周学完了，我最大的收获应该是什么？**

A：不是"会写测试"，是下面这句话：

```text
你现在能对着客户说：
"我改完之后跑 52 条测试，1 分钟。全绿就发，40 秒跑完上线检查。
 如果出问题，一条命令回滚到上一个版本。
 我知道系统在多少并发下开始变慢，也知道瓶颈在哪。"
```

**而绝大多数单人开发者，说的是"我在本地试了，应该没问题"。**
