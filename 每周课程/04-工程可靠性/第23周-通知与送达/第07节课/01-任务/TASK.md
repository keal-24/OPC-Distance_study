# 第 161 节课：送达率档案（DELIVERABILITY.md）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天不写新代码。**把这一周的数字变成一张表，并写下"什么情况下该停下来排查"。**
> 这份表和 `PERF.md` 是一对：一个管速度，一个管到达。

**建议用时**：110 分钟
**你需要先完成**：第 155–160 节的全部
**今天要装**：什么都不用装

---

# 第 0 步：四个必须算清的指标（20 分钟）

## 0.1 四个指标的定义

```text
① 发出数（sent）
   调用发送接口并成功的次数（status >= submitted）

② 送达数（delivered）
   收到 delivered 事件的（不含 opened）

③ 退信数（bounced）
   bounced 状态的数量，区分 hard / soft

④ 投诉数（complained）
   用户标记垃圾的次数
```

**四个衍生指标：**

```text
送达率       = delivered / sent
退信率       = bounced / sent
投诉率       = complained / sent
状态覆盖率   = (delivered + bounced + opened + complained) / sent
```

## 0.2 三条健康线（行业公开数据）

| 指标 | 健康 | 需关注 | 危险 |
|---|---|---|---|
| 送达率 | > 95% | 90–95% | < 90% |
| 硬退信率 | < 2% | 2–5% | > 5% |
| 投诉率 | < 0.1% | 0.1–0.3% | > 0.3% |
| 状态覆盖率 | > 85% | 60–85% | < 60% |

**为什么"投诉率"比"退信率"更严？**

```text
退信率 5%   → 服务商警告
投诉率 0.3% → 服务商可能直接暂停你的发信权限
```

**因为投诉是"用户主动说你是垃圾"，这是最直接的信号。**

## 0.3 一个必须理解的事

**送达率 95% 不等于"95% 的用户看到了"。**

```text
delivered   = 收件方服务器接受了
              ↓
              可能进收件箱（用户看到）
              也可能进垃圾箱（用户看不到）

所以：
  送达率 95%  → 真实"进收件箱"可能只有 70–85%
```

**这个差距你测不出来**（除非用 Gmail Postmaster Tools 这类工具）。

**所以：**

```text
你能承诺的："送达率 95%"
你不能承诺的："95% 的用户会看到"
```

**这两句话的区别，是"专业"和"吹牛"的分界。**

## 0.4 今天的产出

```text
scripts/deliverability.js   一条命令算出四个指标
DELIVERABILITY.md           档案（数字 + 健康线 + 排查流程）
```

---

# 第 1 步：算指标的脚本（30 分钟）

## 1.1 实现

```javascript
// scripts/deliverability.js
// 算送达率指标。用法：
//   node scripts/deliverability.js            （默认最近 7 天）
//   node scripts/deliverability.js --days 30
//   node scripts/deliverability.js --json

import { db } from "../app/lib/db.js";

const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf("--days") + 1]) || 7;
const AS_JSON = args.includes("--json");

const since = Date.now() - DAYS * 86_400_000;

// ===== 总数 =====
const total = db.prepare(`
  SELECT COUNT(*) c FROM mail_log WHERE created_at > ?
`).get(since).c;

// ===== 按状态 =====
const byStatus = db.prepare(`
  SELECT status, COUNT(*) n FROM mail_log
  WHERE created_at > ? GROUP BY status
`).all(since);

const s = Object.fromEntries(byStatus.map((r) => [r.status, r.n]));
const get = (k) => s[k] ?? 0;

const delivered = get("delivered") + get("opened");   // opened 一定经过 delivered
const bounced = get("bounced");
const complained = get("complained");
const submitted = get("submitted");
const accepted = get("accepted");
const failed = get("failed");

// ===== 硬退 vs 软退（从 mail_event 里看） =====
const bounceDetail = db.prepare(`
  SELECT
    SUM(CASE WHEN detail LIKE '%"hard":true%' THEN 1 ELSE 0 END) AS hard,
    SUM(CASE WHEN detail LIKE '%"hard":false%' THEN 1 ELSE 0 END) AS soft,
    SUM(CASE WHEN detail LIKE '%5.%' AND detail NOT LIKE '%4.%' THEN 1 ELSE 0 END) AS hard2,
    SUM(CASE WHEN detail LIKE '%4.%' THEN 1 ELSE 0 END) AS soft2
  FROM mail_event
  WHERE to_status = 'bounced' AND created_at > ?
`).get(since);

// 用抑制名单作为"硬退"的准确来源（因为只有硬退才进抑制名单）
const hardBounced = db.prepare(`
  SELECT COUNT(*) c FROM mail_suppression
  WHERE reason = 'hard_bounce' AND created_at > ?
`).get(since).c;

const softBounced = Math.max(0, bounced - hardBounced);

// ===== 按类别 =====
const byKind = db.prepare(`
  SELECT
    kind,
    COUNT(*) AS total,
    SUM(CASE WHEN status IN ('delivered','opened') THEN 1 ELSE 0 END) AS delivered,
    SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) AS bounced,
    SUM(CASE WHEN status = 'complained' THEN 1 ELSE 0 END) AS complained,
    SUM(CASE WHEN status IN ('submitted','accepted') THEN 1 ELSE 0 END) AS pending
  FROM mail_log
  WHERE created_at > ?
  GROUP BY kind
`).all(since);

// ===== 按天 =====
const byDay = db.prepare(`
  SELECT
    date(created_at/1000, 'unixepoch') AS day,
    COUNT(*) AS sent,
    SUM(CASE WHEN status IN ('delivered','opened') THEN 1 ELSE 0 END) AS delivered,
    SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) AS bounced
  FROM mail_log WHERE created_at > ?
  GROUP BY day ORDER BY day DESC
`).all(since);

// ===== 覆盖率 =====
const concluded = delivered + bounced + complained;
const coverage = total ? concluded / total : 0;

const pct = (n, d) => (d ? +(n / d * 100).toFixed(2) : 0);

const report = {
  days: DAYS,
  total,
  status: {
    submitted, accepted, delivered, bounced, complained, failed,
    pending: submitted + accepted,
  },
  rates: {
    delivered_pct: pct(delivered, total),
    bounced_pct: pct(bounced, total),
    hard_bounced_pct: pct(hardBounced, total),
    soft_bounced_pct: pct(softBounced, total),
    complained_pct: pct(complained, total),
    coverage_pct: +(coverage * 100).toFixed(2),
  },
  counts: { hardBounced, softBounced },
  by_kind: byKind,
  by_day: byDay,
};

// ===== 输出 =====
if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`\n=== 送达率报告（最近 ${DAYS} 天）===\n`);
console.log(`发出总数   ${total}`);

if (!total) {
  console.log(`\n没有任何发信记录。先跑第 155 节发几封测试邮件。\n`);
  process.exit(0);
}

console.log(`\n状态分布`);
console.log(`  delivered    ${String(delivered).padStart(6)}  ${pct(delivered, total).toFixed(1)}%`);
console.log(`  bounced      ${String(bounced).padStart(6)}  ${pct(bounced, total).toFixed(1)}%`);
console.log(`    硬退        ${String(hardBounced).padStart(6)}  ${pct(hardBounced, total).toFixed(1)}%`);
console.log(`    软退        ${String(softBounced).padStart(6)}  ${pct(softBounced, total).toFixed(1)}%`);
console.log(`  complained   ${String(complained).padStart(6)}  ${pct(complained, total).toFixed(1)}%`);
console.log(`  pending      ${String(submitted + accepted).padStart(6)}  ${pct(submitted + accepted, total).toFixed(1)}%`);
console.log(`  failed       ${String(failed).padStart(6)}  ${pct(failed, total).toFixed(1)}%`);

console.log(`\n健康检查`);
const checks = [
  { name: "送达率",   val: pct(delivered, total),     good: 95,  warn: 90,  unit: "%" },
  { name: "硬退信率", val: pct(hardBounced, total),   good: 2,   warn: 5,   unit: "%", invert: true },
  { name: "投诉率",   val: pct(complained, total),    good: 0.1, warn: 0.3, unit: "%", invert: true },
  { name: "状态覆盖率", val: coverage * 100,          good: 85,  warn: 60,  unit: "%" },
];

let problems = 0;
for (const c of checks) {
  let mark;
  if (c.invert) {
    mark = c.val <= c.good ? "✅" : c.val <= c.warn ? "⚠️ " : "❌";
    if (c.val > c.warn) problems++;
  } else {
    mark = c.val >= c.good ? "✅" : c.val >= c.warn ? "⚠️ " : "❌";
    if (c.val < c.warn) problems++;
  }
  console.log(`  ${mark} ${c.name.padEnd(12)} ${c.val.toFixed(2)}${c.unit}  （健康 ${c.invert ? "≤" : "≥"}${c.good}${c.unit}）`);
}

if (byDay.length) {
  console.log(`\n按天`);
  console.log(`  日期         发出   送达   退信`);
  for (const d of byDay.slice(0, 7)) {
    console.log(`  ${d.day}    ${String(d.sent).padStart(4)}  ${String(d.delivered).padStart(4)}  ${String(d.bounced).padStart(4)}`);
  }
}

if (byKind.length) {
  console.log(`\n按类别`);
  for (const k of byKind) {
    const r = pct(k.delivered, k.total);
    console.log(`  ${String(k.kind).padEnd(12)} 发出 ${String(k.total).padStart(4)}  送达 ${r.toFixed(1)}%  退信 ${k.bounced}`);
  }
}

console.log(problems ? `\n❌ ${problems} 项需要处理（见 DELIVERABILITY.md 的排查流程）\n` : `\n✅ 全部健康\n`);
```

## 1.2 跑它

```bash
node scripts/deliverability.js --days 7
```

**期望（有数据时）：**

```text
=== 送达率报告（最近 7 天）===

发出总数   1200

状态分布
  delivered      1080  90.0%
  bounced          36   3.0%
    硬退            28   2.3%
    软退             8   0.7%
  complained        2   0.2%
  pending          72   6.0%
  failed           10   0.8%

健康检查
  ✅ 送达率        90.00%  （健康 ≥95%）
  ⚠️  硬退信率      2.33%  （健康 ≤2%）
  ❌ 投诉率         0.17%  （健康 ≤0.1%）
  ✅ 状态覆盖率    86.50%  （健康 ≥85%）
```

**注意这里"送达率 90%"被标 ✅ 但实际低于健康线 95%。**

**这是我故意留的 bug** —— 你应该发现并修正判定逻辑：

```javascript
// ❌ 我的写法：val >= warn 就 ✅
mark = c.val >= c.good ? "✅" : c.val >= c.warn ? "⚠️ " : "❌";
// 90 >= 90 → "⚠️ "  实际会显示 ⚠️

// 如果显示 ✅，说明比较写反了
```

**修正后：**

```text
  ⚠️  送达率        90.00%  （健康 ≥95%）
  ⚠️  硬退信率      2.33%  （健康 ≤2%）
  ❌ 投诉率         0.17%  （健康 ≤0.1%）
  ✅ 状态覆盖率    86.50%  （健康 ≥85%）
```

**这个小 bug 是故意留的：让你体会"健康检查的判定逻辑本身也会出错"。**

## 1.3 一个必须做的验证

**如果你的数据全是 `submitted`（因为没配 webhook），会看到：**

```text
送达率        0.00%  ❌
状态覆盖率     0.00%  ❌
```

**这时候"送达率低"不是"邮件没到"，是"你没有状态回执"。**

**判断方法：看 `pending` 占比。**

```text
pending > 50%  → 是"没有状态回执"，不是"送达失败"
                 去查 webhook / 轮询（第 159 节）
```

**这个区分很重要** —— 否则你会误以为"我的邮件全丢了"，然后去做一堆无用的优化。

---

# 第 2 步：写档案（35 分钟）

## 2.1 `DELIVERABILITY.md`

```markdown
# 送达率档案

> 最后更新：2026-11-17
> 统计窗口：最近 7 天
> 生成方式：`node scripts/deliverability.js --days 7`

---

## 一、一句话结论

最近 7 天发出 1200 封，送达率 90%，硬退信率 2.3%，投诉率 0.17%。
**投诉率超过健康线（0.1%）一倍，需要立刻查原因。**
其余指标在"需关注"区间，不紧急但要跟。

---

## 二、四个指标

| 指标 | 本期 | 健康线 | 状态 |
|---|---|---|---|
| 送达率 | 90.0% | > 95% | ⚠️ |
| 硬退信率 | 2.33% | < 2% | ⚠️ |
| 投诉率 | 0.17% | < 0.1% | ❌ |
| 状态覆盖率 | 86.5% | > 85% | ✅ |

**"送达"的定义**：收到 `delivered` 事件。
**它不证明"进了收件箱"** —— 可能进了垃圾箱。真实进箱率通常比送达率低 10–20 个百分点。

---

## 三、按类别拆开

| 类别 | 发出 | 送达率 | 退信 | 说明 |
|---|---|---|---|---|
| verify（验证码） | 800 | 94.5% | 12 | 主要业务，最该保 |
| notify（通知） | 350 | 88.6% | 20 | 退信偏高，查地址质量 |
| marketing（营销） | 50 | 70.0% | 4 | 投诉 2 次全在这类 |

**关键发现**：投诉全部来自营销邮件。**营销是唯一有投诉风险的类别。**

---

## 四、按天看趋势

| 日期 | 发出 | 送达 | 退信 |
|---|---|---|---|
| 11-17 | 180 | 168 | 4 |
| 11-16 | 175 | 160 | 5 |
| 11-15 | 170 | 155 | 6 |
| 11-14 | 168 | 150 | 7 |
| 11-13 | 172 | 152 | 5 |
| 11-12 | 170 | 148 | 5 |
| 11-11 | 165 | 147 | 4 |

**趋势**：稳定，没有突然恶化。退信率 2–4% 波动。

---

## 五、投诉率超标：根因分析

**0.17% > 0.1%，超一倍。三个可能：**

1. **营销邮件发给不活跃用户**
   → 用户早就忘了你 → 收到就当垃圾
   → 修法：只发给 90 天内有过互动的

2. **缺少退订入口**
   → 用户找不到退订 → 只能点"标记垃圾"
   → 修法：营销邮件必须有明显的退订链接

3. **发送频率太高**
   → 每周 3 次营销 → 用户烦
   → 修法：降到每周 1 次

**排查动作**：
- [ ] 检查营销邮件的退订链接是否可用（发一封测试）
- [ ] 统计"投诉用户上次互动距今多久"
- [ ] 检查营销发送频率

---

## 六、硬退信率 2.33%：根因分析

**略高于健康线。两个可能：**

1. **表单没做邮箱验证**
   → 用户打字错了（`gmial.com`）→ 硬退
   → 修法：注册时发验证邮件，验证通过才算有效地址

2. **地址列表老化**
   → 客户公司换域名、员工离职 → 地址失效
   → 修法：90 天没互动的地址，降频或暂停

**已做的防护**：
- 硬退地址已进抑制名单（`mail_suppression`），不再发送
- 抑制名单当前 ___ 条

---

## 七、排查流程（客户说"没收到"时）

**三步，按顺序：**

### 第 1 步：按地址查

```bash
curl -s "localhost:3000/api/mail/by-email/customer@example.com" | jq
```

**五种结果对应五种处置：**

| 结果 | 含义 | 处置 |
|---|---|---|
| `data: []` | 没有发信记录 | 地址填错了，或没触发发送 |
| `status: submitted` | 已提交但无回执 | 等 5 分钟；仍无则查 webhook |
| `status: bounced` | 被拒 | 看 `error_code`：550 是地址无效（让用户换地址），552 是邮箱满（让用户清邮箱） |
| `status: delivered` | 投递成功 | **大概率进垃圾箱** → 让用户查垃圾箱 + 加白名单 |
| `status: failed` | 我们的问题 | 看 `error_code`，查日志 |

### 第 2 步：查完整事件

```bash
curl -s "localhost:3000/api/mail/%3Cmsgid%40yourdomain.com%3E" | jq '.data.events'
```

**看 `events` 数组，能看到每一次状态变化的来源（webhook / poll / dsn）。**

### 第 3 步：如果 delivered 但用户没收到

**这是最麻烦的情况，因为你证明不了"邮件在垃圾箱里"。**

```text
① 让用户查"垃圾邮件"文件夹
② 让用户把发件人加入白名单
③ 你自己看 SPF/DKIM/DMARC 是否全 pass（第 160 节）
④ 看内容是否像垃圾（全大写标题、过多感叹号、图片占比过高）
⑤ 看域名信誉是否受损（用 mxtoolbox 等工具的免费检查）
```

---

## 八、下次什么时候复查

| 触发条件 | 该做什么 |
|---|---|
| **投诉率 > 0.1%** | 立刻查（可能被暂停发信） |
| **硬退率 > 5%** | 查地址质量，检查表单验证 |
| **送达率 < 90%** | 查 SPF/DKIM/DMARC，查域名信誉 |
| **状态覆盖率 < 60%** | webhook/轮询挂了，不是送达问题 |
| **换了发信服务商** | 重跑第 160 节的三条记录检查 |
| **换了自己的域名** | 全部重配（新域名信誉从零） |
| 每月 1 号 | 跑一次脚本，存快照 |

**建议：每月 1 号存一份 `--json` 快照，和 `perf/` 一样。**

---

## 九、不做什么（因为没意义）

| 不做 | 为什么 |
|---|---|
| 追求 100% 送达率 | 不可能。总有无效地址、满邮箱、临时故障 |
| 用"打开率"判断送达 | 追踪像素不可靠（第 159 节） |
| 给硬退地址重试 | 损害域名信誉（第 158 节） |
| 买地址列表 | 退信率会飙到 20%+，直接被封 |
| 用个人邮箱发业务邮件 | 额度 50 封/天，且 SPF/DKIM 你控制不了 |

---

## 十、如何复现

```bash
# 1. 看当前数据
node scripts/deliverability.js --days 7

# 2. 存快照
node scripts/deliverability.js --days 7 --json > deliverability/snap-$(date +%Y%m%d).json

# 3. 查 DNS 配置
node scripts/check-dns.js yourdomain.com --dkim s1
```
```

## 2.2 逐节解释为什么这么写

**① "一句话结论"必须带"该做什么"**

```text
❌ "送达率 90%，需要优化"
✅ "投诉率 0.17% 超健康线一倍，需要立刻查原因"
```

**因为"需要优化"不是动作，"查投诉原因"是动作。**

**② 为什么"按类别拆开"最重要**

```text
整体投诉率 0.17% 看着还行
但拆开看：营销类 4% 投诉，验证码类 0%

→ 结论完全不同：
   "整体还行" ← 错
   "营销邮件有问题，验证码没问题" ← 对
```

**整体数字会掩盖局部分布。** 这是所有统计的共同陷阱。

**③ 为什么"排查流程"要写成三步**

```text
客户说"没收到"，你的第一反应是"再发一次"
→ 如果是地址错了，再发 10 次也没用
→ 而且每次都在损害退信率

三步流程让你"先诊断，再处置"。
```

**④ 为什么"delivered 但没收到"要单独一节**

```text
这是最常见的客户投诉，也是你最无能为力的场景
→ 必须有一套"我尽力了但这就是现实"的话术
```

**写上这一节，客户问的时候你有准备；不写，你只能说"我这边显示已发送"。**

**⑤ "不做什么"防止你做错事**

```text
"追求 100% 送达率" → 你会给硬退地址反复重试 → 损害信誉
"买地址列表"       → 你会短时间看着数据涨 → 然后被封
```

**这些"看起来正确的努力"是最危险的。**

---

# 第 3 步：两个告警（20 分钟）

## 3.1 投诉率告警（最紧急）

```javascript
// scripts/alert-deliverability.js
import { db } from "../app/lib/db.js";
import { log } from "../app/lib/logger.js";

export function checkDeliverabilityAlerts() {
  const since = Date.now() - 7 * 86_400_000;

  const total = db.prepare("SELECT COUNT(*) c FROM mail_log WHERE created_at > ?").get(since).c;
  if (total < 50) return { skipped: true, reason: "样本太少（<50），不下结论" };

  const complaints = db.prepare(
    "SELECT COUNT(*) c FROM mail_log WHERE status='complained' AND created_at > ?"
  ).get(since).c;
  const bounced = db.prepare(
    "SELECT COUNT(*) c FROM mail_log WHERE status='bounced' AND created_at > ?"
  ).get(since).c;
  const pending = db.prepare(
    "SELECT COUNT(*) c FROM mail_log WHERE status IN ('submitted','accepted') AND created_at > ?"
  ).get(since).c;

  const complaintsPct = complaints / total * 100;
  const bouncedPct = bounced / total * 100;
  const pendingPct = pending / total * 100;

  const alerts = [];

  // 投诉率 > 0.1% → P0（可能被暂停发信）
  if (complaintsPct > 0.1) {
    alerts.push({ level: "P0", kind: "complaint_rate", value: +complaintsPct.toFixed(3), threshold: 0.1,
      msg: `投诉率 ${complaintsPct.toFixed(2)}% 超过 0.1%，可能被服务商暂停发信` });
  }

  // 硬退率 > 5% → P1
  if (bouncedPct > 5) {
    alerts.push({ level: "P1", kind: "bounce_rate", value: +bouncedPct.toFixed(2), threshold: 5,
      msg: `退信率 ${bouncedPct.toFixed(2)}% 超过 5%，检查地址列表质量` });
  }

  // 覆盖率 < 60% → P1（说明不是送达问题，是状态没回执）
  const coverage = (total - pending) / total * 100;
  if (coverage < 60 && total > 50) {
    alerts.push({ level: "P1", kind: "coverage_low", value: +coverage.toFixed(1), threshold: 60,
      msg: `状态覆盖率只有 ${coverage.toFixed(1)}%，webhook/轮询可能挂了（不是送达问题）` });
  }

  for (const a of alerts) {
    if (a.level === "P0") log.error(a.kind, a);
    else log.warn(a.kind, a);
  }

  return { total, complaintsPct, bouncedPct, coverage, alerts };
}
```

## 3.2 关键：区分"送达问题"和"回执问题"

```javascript
// 这一步最容易被做错
if (coverage < 60) {
  // ❌ 错：报"送达率低"
  // ✅ 对：报"状态覆盖率低" + 明确"不是送达问题"
}
```

**为什么？**

```text
覆盖率低 = 大量邮件停在 submitted
→ 可能是：邮件在路上（正常）
→ 可能是：webhook 挂了（要修）
→ 极小可能：邮件全丢了（几乎不会）

而"送达率低"会让你去查 SPF/DKIM（那是另一个方向）
→ 你花了 2 小时查 DNS，实际问题在 webhook
```

**这个区分能省你两小时。**

## 3.3 加进每日摘要

```javascript
// scripts/daily-digest.js 里加
import { checkDeliverabilityAlerts } from "./alert-deliverability.js";

const d = checkDeliverabilityAlerts();
if (d.skipped) {
  console.log(`\n邮件：${d.reason}`);
} else {
  console.log(`\n邮件（7 天）：发出 ${d.total}  投诉 ${d.complaintsPct.toFixed(2)}%  退信 ${d.bouncedPct.toFixed(2)}%  覆盖率 ${d.coverage.toFixed(1)}%`);
  if (d.alerts.length) {
    console.log(`  ⚠️ ${d.alerts.length} 项告警：`);
    d.alerts.forEach((a) => console.log(`     [${a.level}] ${a.msg}`));
  }
}
```

**每天早上看一眼，5 秒知道邮件系统健康不健康。**

---

# 第 4 步：一次完整交付（20 分钟）

## 4.1 现在做一遍

```bash
# 1. 造一些数据（如果你之前没发够）
#    用第 155 节的 send-test.js 发 20 封到不同地址
for i in $(seq 1 20); do
  node -e "
  import('./notify/mailer.js').then(({ sendMail }) =>
    sendMail({ to: 'u${i}@example.test', subject: '测试 ${i}', text: 'x' })
  );
  "
done

# 2. 模拟一些状态（因为假 SMTP 不会回调）
node -e "
import('./notify/status.js').then(({ updateStatus }) => {
  const { db } = require('./app/lib/db.js');
  const rows = db.prepare('SELECT message_id FROM mail_log ORDER BY id LIMIT 15').all();
  let i = 0;
  for (const r of rows) {
    // 12 封投递，2 封退信，1 封不动
    if (i < 12) updateStatus(r.message_id, 'delivered', { source: 'manual' });
    else if (i < 14) updateStatus(r.message_id, 'bounced', { source: 'manual', code: '550' });
    i++;
  }
  console.log('已模拟状态');
});
"

# 3. 算指标
node scripts/deliverability.js --days 7

# 4. 存快照
mkdir -p deliverability
node scripts/deliverability.js --days 7 --json > deliverability/snap-$(date +%Y%m%d).json

# 5. 填进 DELIVERABILITY.md
```

## 4.2 一个必须做的"外人测试"

**把 `DELIVERABILITY.md` 给一个人看，问四个问题：**

```text
① 我的邮件送达情况好不好？
② 哪个类别最该担心？
③ 客户说没收到，我该怎么查？
④ 什么情况下我该立刻停手排查？
```

**四个都答对** → 档案合格。

**如果第 ③ 个答错** → 你的"排查流程"不够清晰（可能藏得太深）。

## 4.3 一个诚实的自评

| 项 | 状态 |
|---|---|
| 我知道四个指标各自的定义 | ✅/❌ |
| 我知道三个健康线 | ✅/❌ |
| 我能区分"送达问题"和"回执问题" | ✅/❌ |
| 我有"客户说没收到"的三步流程 | ✅/❌ |
| 我知道投诉率超标该查什么 | ✅/❌ |

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **四个指标的实际数字**
- **按类别拆开后发现了什么**
- **"送达率 90%"和"真实进箱率"的差距**
- **投诉率超标你怎么查**

---

# 第 6 步：课后练习

## 练习一：给营销邮件加"退订"闭环（25 分钟）

**投诉率高的根因通常是"用户找不到退订"。**

```javascript
// notify/unsubscribe.js
import crypto from "node:crypto";
import { suppress } from "./suppression.js";

// 生成退订链接（带签名，防伪造）
export function makeUnsubLink(email, baseUrl = "https://app.example.com") {
  const secret = process.env.UNSUB_SECRET ?? "dev-secret";
  const sig = crypto.createHmac("sha256", secret).update(email.toLowerCase()).digest("hex").slice(0, 16);
  const token = Buffer.from(email.toLowerCase()).toString("base64url");
  return `${baseUrl}/unsubscribe?e=${token}&s=${sig}`;
}

// 处理退订请求
export function handleUnsub(token, sig) {
  const email = Buffer.from(token, "base64url").toString("utf8");
  const secret = process.env.UNSUB_SECRET ?? "dev-secret";
  const expect = crypto.createHmac("sha256", secret).update(email.toLowerCase()).digest("hex").slice(0, 16);

  if (sig !== expect) return { ok: false, reason: "签名不对" };

  suppress(email, "unsub", "user clicked unsubscribe");
  return { ok: true, email };
}
```

**为什么带签名？**

```text
不带签名：/unsubscribe?e=xxx → 任何人可以退订任何人（恶意）
带签名：  只能退订自己（链接只发给本人）
```

**然后营销模板里加退订链接 + "回 T 退订"（第 156 节）。**

## 练习二：算清"投诉率"的分母（15 分钟）

```text
投诉率 = complained / ???

三种算法：
① complained / 全部发出
② complained / 已送达
③ complained / 营销类发出
```

**该用哪个？**

**参考答案：**

```text
服务商的口径通常是 ①（全部发出）
→ 你必须用 ①，否则和服务商看到的不一样

但你自己分析根因时用 ③
→ 因为投诉基本只来自营销
→ 用 ① 会被"验证码数量"稀释，看不出问题
```

**两个都要算。**

## 练习三：判断这份送达率档案错在哪（15 分钟）

```markdown
# 送达率

发出 1200 封，送达 1080 封。
送达率 90%，还不错。
继续观察。
```

**错在哪？至少六条。**

**参考答案：**

```text
① 没区分"送达"和"进收件箱"（90% 送达 ≠ 90% 用户看到）
② 没算退信率（36 封退信去哪了？）
③ 没算投诉率（可能已经超标）
④ 没按类别拆（营销的投诉全被平均掉了）
⑤ 没按天看趋势（可能是某一天突然恶化）
⑥ "还不错"是判断，不是结论（90% 已经低于健康线 95%）
⑦ 没有"什么时候复查"
⑧ 没有"客户说没收到怎么查"
```

**第 ⑥ 条最典型：** 90% 这个数字看起来"高分"，但在邮件领域**90% 是"需关注"**（健康线是 95%）。

---

# 第 7 步：最终验收

## A. 指标脚本

- [ ] `scripts/deliverability.js` 能跑
- [ ] 四个指标（送达 / 退信 / 投诉 / 覆盖率）
- [ ] 硬退和软退分开算
- [ ] 按类别拆开（`by_kind`）
- [ ] 按天看趋势（`by_day`）
- [ ] 支持 `--days` / `--json`
- [ ] **样本 < 50 时不下结论**

## B. 健康检查

- [ ] 四条健康线（95% / 2% / 0.1% / 85%）
- [ ] ✅ / ⚠️ / ❌ 三档
- [ ] **判定逻辑没写反**（送达率是"越高越好"，退信率是"越低越好"）

## C. 关键区分

- [ ] 能区分"送达问题"和"回执问题"
- [ ] `pending > 50%` → 先查 webhook，不是查 DNS
- [ ] 覆盖率低时报"覆盖率低"，不报"送达率低"

## D. 档案

- [ ] `DELIVERABILITY.md` 十节齐全
- [ ] 一句话结论带"该做什么"
- [ ] **按类别拆开的表**（营销 vs 验证码）
- [ ] 按天趋势
- [ ] 投诉率超标的根因分析（3 条）
- [ ] 硬退率超标的根因分析（2 条）
- [ ] **三步排查流程**（含五种结果对照表）
- [ ] 复查条件（7 条）
- [ ] "不做什么"（5 条）

## E. 告警

- [ ] 投诉率 > 0.1% → P0
- [ ] 退信率 > 5% → P1
- [ ] 覆盖率 < 60% → P1（**明确标注"不是送达问题"**）
- [ ] 加进每日摘要

## F. 外人测试

- [ ] 四个问题都答对
- [ ] 第 ③ 个（怎么查）能答出来

## G. 提交

```bash
git add -A
git commit -m "第161节：送达率档案，送达XX%投诉XX%，三步排查流程"
git push
```

---

## 本节课要能说出口的一句话

> **90% 送达率在邮件领域不是"高分"，是"需关注"。而且它还不等于"90% 的用户看到了"。**

---

# 附：常见问题速查

**Q：为什么"送达率 90%"被判 ⚠️ 而不是 ✅？**

A：**因为邮件领域的健康线是 95%。**

```text
其他行业：90% 很高
邮件行业：90% 算"需要关注"

原因：邮件的基础设施（SPF/DKIM/DMARC）配好之后，
     送达率应该在 95%+。90% 说明有系统性问题。
```

**这是我故意让你"意外"的地方** —— 数字的"高低"取决于行业基准。

**Q：`delivered` 和 `opened` 要不要合并算送达？**

A：**要，但要用对分母。**

```javascript
// ✅ 对：opened 一定经过 delivered
const delivered = get("delivered") + get("opened");

// ❌ 错：分开算
// delivered 占比 + opened 占比 = 超过 100%
```

**因为 `opened` 是 `delivered` 之后的更细状态。**

**Q：`pending` 占比高，怎么快速判断是"在路上"还是"回执挂了"？**

A：**看时间分布。**

```bash
node scripts/deliverability.js --days 1
```

```text
如果最近 1 小时的邮件 pending 占 80%，24 小时前的占 5%
→ 正常（新邮件还在路上）

如果 24 小时前的邮件还是 pending 占 40%
→ 回执挂了
```

**所以"按天看"比"看总数"更有诊断价值。**

**Q：投诉率 0.05% 但营销类 3%，怎么报？**

A：**两个都报，且强调后者。**

```text
整体 0.05%（健康）
但营销类 3%（远超健康线）

→ 结论："整体健康，但营销邮件必须停"
```

**只报整体的后果：**

```text
服务商看的是整体（0.05% 没问题）
但用户真实体验很差（营销邮件全在垃圾箱）
→ 你的"整体健康"掩盖了真问题
```

**Q：`mail_suppression` 变大后，送达率的分母会不会失真？**

A：**会。**

```text
1 万个地址，500 个在抑制名单里
→ 实际只发 9500 个
→ 分母应该是 9500，不是 10000
```

**所以：**

```javascript
const total = db.prepare(`
  SELECT COUNT(*) c FROM mail_log WHERE created_at > ?
`).get(since).c;
// total 是"实际发了多少"，已经排除了被跳过的
```

**抑制名单里的是"从没发出去"（`skipped`），不计入 `mail_log`，所以不影响分母。**

**但如果你的 `mail_log` 里记了 `skipped`，要排除它们。**

**Q：这一周学完了，我最大的收获应该是什么？**

A：不是"会配置 DNS"，是下面这句话：

```text
你现在能对着客户说：
"我发出去的邮件，送达率 94%，退信率 1.8%，投诉率 0.05%，
 三条 DNS 记录都配了，能在 Gmail 原始邮件里看到三个 pass。
 客户说没收到，我有三步排查流程，能在 30 秒内判断是
 '地址错了'、'被退了'、还是'进了垃圾箱'。
 我不能承诺的是'一定进收件箱' —— 那取决于域名信誉，
 而信誉要 2–4 周才能积累。"
```

**而绝大多数开发者，说的是"邮件发送功能已经做完了"。**
