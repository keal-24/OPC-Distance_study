# 第 156 节课：短信的规矩

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天不发真短信（要报备 + 充值）。**今天做的是"把规则变成代码里的检查"。**
> 因为短信的坑不在技术，在"模板审核不过，业务就停摆"。

**建议用时**：110 分钟
**你需要先完成**：第 155 节的 `notify/mailer.js`
**今天要装**：什么都不用装

---

# 第 0 步：短信和邮件完全不是一回事（20 分钟）

## 0.1 五个硬差别

| 维度 | 邮件 | 短信 |
|---|---|---|
| 发送前要审核 | 不要 | **模板必须报备，1–3 工作日** |
| 内容能随便写 | 能 | **只能填变量，不能改固定文字** |
| 失败能重试 | 随便 | 频繁重试会被运营商限流 |
| 成本 | 几乎为 0 | **按条计费（约 ¥0.03–0.05/条）** |
| 长度限制 | 无（但有建议） | **70 字一条，超过按多条计费** |
| 到达率 | 依赖域名信誉 | 依赖"签名 + 模板 + 号码质量" |
| 退订 | 必须有链接 | 营销类必须有"回 T 退订" |

## 0.2 一条短信的固定结构

```text
【签名】模板内容，变量1，变量2
 ↑      ↑
必须   必须提前报备
```

**实际例子：**

```text
【某某科技】您的验证码是 123456，5 分钟内有效。如非本人操作请忽略。
```

**你能改的只有：**

```text
· 变量值（123456）
· 5 分钟这个数字也得报备（不能动态改）
```

**你不能改的：**

```text
· 【某某科技】（签名，单独报备）
· "您的验证码是"（固定文字）
· "5 分钟内有效。如非本人操作请忽略。"（固定文字）
```

## 0.3 为什么这么严

```text
因为短信是被诈骗用得最狠的渠道。
运营商必须能"追责到具体企业"。
→ 签名 = 企业身份
→ 模板 = 内容承诺
→ 两者都要审核
```

**这意味着：**

```text
你临时想改一句文案 → 要重新报备 → 1–3 天
你上线新功能要发新短信 → 提前一周准备
你的模板被驳回 → 业务停摆
```

## 0.4 今天要建的东西

```text
notify/sms.js            短信发送（假网关 + 模板校验）
notify/templates.js      模板定义（含"哪些字符能填"）
scripts/check-sms.js     模板合规检查
SMS-TEMPLATES.md         报备清单（给运营商看的）
```

**今天最值钱的产出是 `SMS-TEMPLATES.md`** —— 它是你提交给运营商的材料。

---

# 第 1 步：先把模板写成"可检查的结构"（30 分钟）

## 1.1 模板不能是字符串

```javascript
// ❌ 错：模板是一段字符串
const TEMPLATE = "【某某科技】您的验证码是 ${code}，5 分钟内有效。";
// → 你无法检查"变量名对不对"、"字数超没超"、"有没有违规词"
```

```javascript
// ✅ 对：模板是结构化对象
const TEMPLATES = {
  verify_code: {
    id: "SMS_123456789",           // 运营商给的模板 ID
    sign: "某某科技",               // 签名
    body: "您的验证码是 {code}，{ttl} 分钟内有效。如非本人操作请忽略。",
    vars: {
      code: { type: "digits", len: 6 },     // 6 位数字
      ttl:  { type: "enum", values: ["5", "10", "30"] },
    },
    kind: "verify",                 // verify / notify / marketing
    maxLen: 70,
  },
};
```

## 1.2 完整实现

```javascript
// notify/templates.js

export const SIGNS = {
  main: "某某科技",
  // 同一家公司可以有多个签名，但每个都要单独报备
};

export const TEMPLATES = {
  // ===== 验证码类（最高优先级，必须 100% 可达） =====
  verify_code: {
    id: "SMS_100001",
    sign: SIGNS.main,
    body: "您的验证码是 {code}，{ttl} 分钟内有效。如非本人操作请忽略。",
    vars: {
      code: { type: "digits", len: 6 },
      ttl: { type: "enum", values: ["5", "10", "30"] },
    },
    kind: "verify",
    // 验证码短信不能带链接、不能带营销词
    forbidden: ["http", "点击", "优惠", "活动", "领取", "限时", "免费", "中奖"],
  },

  // ===== 通知类 =====
  ticket_created: {
    id: "SMS_100002",
    sign: SIGNS.main,
    body: "您的工单 {ticket_no} 已受理，我们将在 {sla} 小时内处理。",
    vars: {
      ticket_no: { type: "alnum", minLen: 6, maxLen: 20 },
      sla: { type: "enum", values: ["2", "4", "8", "24"] },
    },
    kind: "notify",
    forbidden: ["http", "点击", "优惠", "活动"],
  },

  ticket_done: {
    id: "SMS_100003",
    sign: SIGNS.main,
    body: "您的工单 {ticket_no} 已处理完成。如有疑问请回复本短信。",
    vars: {
      ticket_no: { type: "alnum", minLen: 6, maxLen: 20 },
    },
    kind: "notify",
    forbidden: ["http", "点击", "优惠", "活动"],
  },

  // ===== 营销类（必须有退订） =====
  promo: {
    id: "SMS_100004",
    sign: SIGNS.main,
    body: "{content} 回 T 退订",
    vars: {
      content: { type: "text", maxLen: 40 },
    },
    kind: "marketing",
    // 营销类硬性要求
    required: ["退订"],
    forbidden: ["贷款", "博彩", "中奖", "秒杀"],
    // 发送时段限制
    hours: [9, 20],       // 只在 9:00–20:00 发
  },
};

// ===== 变量校验 =====
const CHECKERS = {
  digits: (v, spec) => {
    if (!/^\d+$/.test(v)) return "必须是纯数字";
    if (spec.len && v.length !== spec.len) return `必须 ${spec.len} 位`;
    return null;
  },
  alnum: (v, spec) => {
    if (!/^[A-Za-z0-9]+$/.test(v)) return "只能是字母和数字";
    if (spec.minLen && v.length < spec.minLen) return `至少 ${spec.minLen} 位`;
    if (spec.maxLen && v.length > spec.maxLen) return `最多 ${spec.maxLen} 位`;
    return null;
  },
  enum: (v, spec) => {
    if (!spec.values.includes(String(v))) return `只能是 ${spec.values.join("/")}`;
    return null;
  },
  text: (v, spec) => {
    if (spec.maxLen && [...String(v)].length > spec.maxLen) return `最多 ${spec.maxLen} 字`;
    if (/[{}]/.test(v)) return "变量值里不能有 { 或 }";
    return null;
  },
};

/**
 * 渲染短信。任何一项不合规 → 抛错，绝不发出半成品。
 */
export function renderSms(name, vars = {}) {
  const tpl = TEMPLATES[name];
  if (!tpl) throw new Error(`未知模板：${name}`);

  // ① 变量齐全
  const missing = Object.keys(tpl.vars).filter((k) => vars[k] === undefined);
  if (missing.length) {
    throw new Error(`模板 ${name} 缺少变量：${missing.join(", ")}`);
  }

  // ② 变量类型
  for (const [k, spec] of Object.entries(tpl.vars)) {
    const err = CHECKERS[spec.type]?.(String(vars[k]), spec);
    if (err) throw new Error(`模板 ${name} 的变量 ${k}：${err}（实际 "${vars[k]}"）`);
  }

  // ③ 替换
  let body = tpl.body;
  for (const [k, v] of Object.entries(vars)) {
    body = body.replaceAll(`{${k}}`, String(v));
  }

  // ④ 替换后不能残留 {xxx}
  const left = body.match(/\{[a-zA-Z_]+\}/g);
  if (left) throw new Error(`模板 ${name} 有未替换的变量：${left.join(", ")}`);

  // ⑤ 长度（含签名，运营商按总字数算）
  const full = `【${tpl.sign}】${body}`;
  const fullLen = [...full].length;
  if (tpl.maxLen && fullLen > tpl.maxLen) {
    // 不抛错，但警告（超长会按多条计费，不是错误）
    return { text: full, warn: `超长 ${fullLen}/${tpl.maxLen} 字，会按 ${Math.ceil(fullLen / 70)} 条计费` };
  }

  // ⑥ 禁用词
  const bad = (tpl.forbidden ?? []).filter((w) => body.includes(w));
  if (bad.length) throw new Error(`模板 ${name} 含禁用词：${bad.join(", ")}`);

  // ⑦ 必含词
  const lack = (tpl.required ?? []).filter((w) => !body.includes(w));
  if (lack.length) throw new Error(`模板 ${name} 缺少必须包含：${lack.join(", ")}`);

  return { text: full, warn: null, tplId: tpl.id, kind: tpl.kind };
}
```

## 1.3 逐段解释五个关键设计

**① 为什么变量要声明类型**

```javascript
// ❌ 不声明
code: {}      // 什么都能传 → 传了 "abc" 也会发出去

// ✅ 声明
code: { type: "digits", len: 6 }   // 传 "abc" 直接报错
```

**因为短信发出去了就收不回。**

```text
用户收到"您的验证码是 abcdef" → 他没法用 → 来找你 → 你重发
一条 ¥0.03，但用户的耐心更贵
```

**② 为什么 `ttl` 用 `enum` 不用 `digits`**

```text
运营商的模板是"5 分钟"
如果你传 7，发出的短信和报备的不一致 → 可能被拦截
→ 用 enum 限定为报备过的值
```

**这条规则来自真实事故：** 有人把"5 分钟"改成"10 分钟"没重新报备，短信全被拦。

**③ 为什么长度超了只警告不抛错**

```text
超长不是错误，是"多花钱"
→ 抛错会让业务停摆（用户收不到验证码）
→ 警告让业务继续，但你知道自己在按 2 条计费
```

**判断标准：这个"不合规"会导致发不出去吗？**

```text
会 → 抛错
只是多花钱 → 警告
```

**④ 为什么禁用词要按"模板类别"区分**

```text
验证码模板禁 "点击"（验证码不该让人点链接）
营销模板必须有 "退订"
```

**一刀切会导致：**

```text
验证码模板也要求有"退订" → 荒谬
营销模板也不许有"活动" → 没法做营销
```

**⑤ 为什么渲染后要检查残留 `{xxx}`**

```javascript
// 变量名拼错了
renderSms("verify_code", { code: "123456", ttlMin: 5 })
// → body 里 {ttl} 没被替换
// → 发出"您的验证码是 123456，{ttl} 分钟内有效"
```

**这个检查是最后一道防线。** 它抓住"变量名拼错"这种低级错误。

## 1.4 立即验证

```javascript
// scripts/test-templates.js
import { renderSms } from "../notify/templates.js";

const CASES = [
  { name: "verify_code", vars: { code: "123456", ttl: "5" }, ok: true },
  { name: "verify_code", vars: { code: "12345", ttl: "5" }, ok: false, why: "code 5 位" },
  { name: "verify_code", vars: { code: "abcdef", ttl: "5" }, ok: false, why: "code 非数字" },
  { name: "verify_code", vars: { code: "123456", ttl: "7" }, ok: false, why: "ttl 不在 enum" },
  { name: "verify_code", vars: { code: "123456" }, ok: false, why: "缺 ttl" },
  { name: "ticket_created", vars: { ticket_no: "T20261117001", sla: "2" }, ok: true },
  { name: "ticket_created", vars: { ticket_no: "T-2026-11", sla: "2" }, ok: false, why: "含横线" },
  { name: "promo", vars: { content: "新品上市" }, ok: false, why: "缺退订" },
  { name: "promo", vars: { content: "新品上市 回 T 退订" }, ok: true },
];

let pass = 0;
for (const c of CASES) {
  try {
    const r = renderSms(c.name, c.vars);
    if (c.ok) { pass++; console.log(`✅ ${c.name}  ${r.text}`); }
    else console.log(`❌ ${c.name}  应该失败但成功了：${r.text}`);
  } catch (e) {
    if (!c.ok) { pass++; console.log(`✅ ${c.name}  正确拒绝：${e.message}`); }
    else console.log(`❌ ${c.name}  不该失败：${e.message}`);
  }
}
console.log(`\n${pass}/${CASES.length} 通过`);
```

**跑它。9 条全过，模板层就合格了。**

---

# 第 2 步：假短信网关（25 分钟）

## 2.1 为什么不能真发

```text
① 要报备（模板 + 签名，1–3 工作日）
② 要充值（最低几十到几百元）
③ 真发会花钱，而且测试环境不该发真实短信
④ 你要测"发送失败"的分支，真网关不会配合你
```

## 2.2 假网关实现

```javascript
// notify/fake-sms.js
// 假短信网关。记录所有发送，支持模拟失败。
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.FAKE_SMS_DIR ?? "./smsdump";
fs.mkdirSync(OUT, { recursive: true });

let seq = 0;
const sent = [];
let mode = process.env.FAKE_SMS_MODE ?? "ok";   // ok / fail / rate_limit

export function setMode(m) { mode = m; }
export function getSent() { return [...sent]; }
export function reset() { sent.length = 0; seq = 0; }

/**
 * 假发送。返回结构对齐真实服务商（阿里云/腾讯云）。
 */
export async function sendSms({ phone, templateId, params, sign }) {
  seq++;
  const ts = new Date().toISOString();

  const rec = {
    seq,
    ts,
    phone: maskPhone(phone),
    phoneRaw: phone,
    templateId,
    params,
    sign,
    mode,
  };

  // 模拟各种失败
  if (mode === "fail") {
    rec.status = "failed";
    rec.code = "isv.MOBILE_NUMBER_ILLEGAL";
    rec.message = "手机号码格式错误";
    sent.push(rec);
    return { ok: false, code: rec.code, message: rec.message, serialNo: null };
  }

  if (mode === "rate_limit") {
    rec.status = "failed";
    rec.code = "isv.BUSINESS_LIMIT_CONTROL";
    rec.message = "触发流控";
    sent.push(rec);
    return { ok: false, code: rec.code, message: rec.message, serialNo: null };
  }

  // 手机号格式校验（真实的网关会做）
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    rec.status = "failed";
    rec.code = "isv.MOBILE_NUMBER_ILLEGAL";
    rec.message = "手机号码格式错误";
    sent.push(rec);
    return { ok: false, code: rec.code, message: rec.message, serialNo: null };
  }

  rec.status = "ok";
  rec.serialNo = `FAKE-${Date.now()}-${seq}`;
  sent.push(rec);

  fs.appendFileSync(
    path.join(OUT, `sms-${ts.slice(0, 10)}.jsonl`),
    JSON.stringify(rec) + "\n"
  );

  return { ok: true, serialNo: rec.serialNo };
}

function maskPhone(p) {
  const s = String(p ?? "");
  return s.length === 11 ? `${s.slice(0, 3)}****${s.slice(-4)}` : "***";
}
```

## 2.3 一个必须做的实验：三种 failure

```javascript
// scripts/test-sms-modes.js
import { sendSms, setMode, getSent, reset } from "../notify/fake-sms.js";

for (const mode of ["ok", "fail", "rate_limit"]) {
  reset();
  setMode(mode);
  const r = await sendSms({
    phone: "13812345678",
    templateId: "SMS_100001",
    params: { code: "123456", ttl: "5" },
    sign: "某某科技",
  });
  console.log(`${mode.padEnd(12)} ok=${r.ok}  code=${r.code ?? "-"}  serialNo=${r.serialNo ?? "-"}`);
}

// 手机号非法
reset(); setMode("ok");
const bad = await sendSms({ phone: "12345", templateId: "SMS_100001", params: {}, sign: "x" });
console.log(`非法号码       ok=${bad.ok}  code=${bad.code}`);
```

**期望：**

```text
ok           ok=true   code=-  serialNo=FAKE-...
fail         ok=false  code=isv.MOBILE_NUMBER_ILLEGAL
rate_limit   ok=false  code=isv.BUSINESS_LIMIT_CONTROL
非法号码       ok=false  code=isv.MOBILE_NUMBER_ILLEGAL
```

**注意错误码用了阿里云的风格（`isv.xxx`）** —— 让你提前熟悉真实接口的返回。

---

# 第 3 步：接起来（20 分钟）

```javascript
// notify/sms.js
import { renderSms } from "./templates.js";
import { sendSms as fakeSend } from "./fake-sms.js";
import { config } from "../app/config/index.js";
import { log } from "../app/lib/logger.js";
import { db } from "../app/lib/db.js";

/**
 * 发短信。渲染失败 → 抛错；网关失败 → 返回 ok:false。
 */
export async function sendSms({ phone, template, vars }) {
  // ① 渲染（失败就抛，绝不发半成品）
  const r = renderSms(template, vars);
  if (r.warn) log.warn("sms_long", { template, warn: r.warn });

  // ② 发送时段检查（营销类）
  const tplKind = r.kind;
  if (tplKind === "marketing") {
    const h = new Date().getHours();
    const [start, end] = [9, 20];
    if (h < start || h >= end) {
      throw new Error(`营销短信不在发送时段（${start}:00–${end}:00），当前 ${h} 点`);
    }
  }

  // ③ 调网关（真环境换成阿里云/腾讯云 SDK）
  const res = await fakeSend({
    phone,
    templateId: r.tplId,
    params: vars,
    sign: config.sms?.sign ?? "某某科技",
  });

  // ④ 落库
  db.prepare(`
    INSERT INTO sms_log (serial_no, phone, template, status, code, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(res.serialNo ?? "", mask(phone), template, res.ok ? "submitted" : "failed", res.code ?? null, Date.now());

  if (!res.ok) {
    log.error("sms_failed", { template, code: res.code, phone: mask(phone) });
  } else {
    log.info("sms_sent", { template, phone: mask(phone), serial_no: res.serialNo });
  }

  return { ok: res.ok, text: r.text, serialNo: res.serialNo, code: res.code };
}

function mask(p) {
  const s = String(p ?? "");
  return s.length === 11 ? `${s.slice(0, 3)}****${s.slice(-4)}` : "***";
}
```

**表结构：**

```sql
CREATE TABLE IF NOT EXISTS sms_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  serial_no  TEXT,
  phone      TEXT NOT NULL,
  template   TEXT NOT NULL,
  status     TEXT NOT NULL,        -- submitted / delivered / failed
  code       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sms_phone ON sms_log(phone, created_at DESC);
CREATE INDEX idx_sms_serial ON sms_log(serial_no);
```

## 3.1 验证

```bash
node -e "
import('./notify/sms.js').then(async ({ sendSms }) => {
  const r = await sendSms({ phone: '13812345678', template: 'verify_code', vars: { code: '123456', ttl: '5' } });
  console.log(r);
});
"
```

**期望：**

```text
{
  ok: true,
  text: "【某某科技】您的验证码是 123456，5 分钟内有效。如非本人操作请忽略。",
  serialNo: "FAKE-1763...-1",
  code: undefined
}
```

**同时 `smsdump/` 里有一条记录。**

---

# 第 4 步：报备清单（25 分钟）★ 今天最值钱的产出

## 4.1 `SMS-TEMPLATES.md`

**这份文件是你要提交给运营商的材料。写好了，一次过审。**

```markdown
# 短信模板报备清单

> 提交给运营商/服务商审核用。每条模板必须独立报备，审核约 1–3 个工作日。
> **任何固定文字的改动都需要重新报备。**

## 签名

| 签名 | 用途 | 报备状态 |
|---|---|---|
| 【某某科技】 | 全部业务短信 | 待报备 |

**签名规范：**
- 3–8 个字，不含"中国""国家""银行"等敏感词
- 需要营业执照 + 授权书佐证
- 一个签名可服务多个模板，但每个模板仍要单独报备

---

## 模板 1：验证码（verify_code）

**模板 ID**：SMS_100001（服务商分配）
**类别**：验证码
**内容**：

```
您的验证码是 {code}，{ttl} 分钟内有效。如非本人操作请忽略。
```

**变量**：

| 变量 | 类型 | 取值范围 | 说明 |
|---|---|---|---|
| `{code}` | 数字 | 6 位 | 随机验证码 |
| `{ttl}` | 枚举 | 5 / 10 / 30 | 有效期（分钟） |

**变量个数**：2
**适用场景**：用户注册、登录、找回密码
**发送频率**：同一号码每分钟最多 1 条，每天最多 10 条
**为什么这样写**：
- 纯文字，无链接（验证码短信带链接会被重点审查）
- 开头就是"验证码"，用户一眼看到
- 有"如非本人操作请忽略"（合规要求，也是安全提示）

---

## 模板 2：工单受理（ticket_created）

**模板 ID**：SMS_100002
**类别**：通知
**内容**：

```
您的工单 {ticket_no} 已受理，我们将在 {sla} 小时内处理。
```

**变量**：

| 变量 | 类型 | 取值范围 |
|---|---|---|
| `{ticket_no}` | 字母+数字 | 6–20 位 |
| `{sla}` | 枚举 | 2 / 4 / 8 / 24 |

**为什么 `{sla}` 用枚举**：运营商要求"承诺时效"必须是确定值，不能动态生成。

---

## 模板 3：工单完成（ticket_done）

```
您的工单 {ticket_no} 已处理完成。如有疑问请回复本短信。
```

**变量**：`{ticket_no}`（字母+数字，6–20 位）

---

## 模板 4：营销（promo）

**类别**：营销
**内容**：

```
{content} 回 T 退订
```

**变量**：`{content}`（文本，≤40 字）

**硬性要求**：
- 必须含"退订"字样（运营商强制）
- 只能在 9:00–20:00 发送（运营商强制）
- 内容不得含"贷款""博彩""中奖""秒杀"等词

---

## 常见驳回原因（提前避开）

| 驳回原因 | 怎么改 |
|---|---|
| 含链接 | 验证码/通知类去掉所有 URL |
| 变量太多（>3 个） | 合并变量，或拆成两条模板 |
| 变量位置在开头 | 开头必须是固定文字（否则用户看不出是谁发的） |
| 承诺收益/效果 | 删掉"保证""100%""稳赚" |
| 营销模板无退订 | 加"回 T 退订" |
| 签名与营业执照不符 | 用营业执照上的字号 |
| 内容像诈骗话术 | 去掉"冻结""异常""立即处理"等恐吓词 |

---

## 发送频率限制（运营商强制）

| 类别 | 单号码限制 |
|---|---|
| 验证码 | 1 条/分钟，10 条/天 |
| 通知 | 5 条/小时，20 条/天 |
| 营销 | 1 条/天，同一内容 7 天内不重复 |

**超过限制会被运营商拦截，且可能影响整个账号的发送资格。**

---

## 备用模板（必做准备）

**每个业务场景至少准备 2 个模板**，因为：
- 主模板可能被驳回
- 主模板可能被运营商下线
- A/B 测试需要

```
verify_code_a  → 主模板（见上）
verify_code_b  → 备用：「验证码 {code}，{ttl} 分钟内有效。」
```

**备用模板也要报备。** 上线前一天想起来"还有个备用"，来不及。
```

## 4.2 为什么这份清单这么长

**因为审核不过的代价是"业务停摆"。**

```text
你上线新功能 → 需要发新短信 → 提交报备 → 被驳回
→ 改 → 再提交 → 1–3 天
→ 总共 1 周
→ 你的功能上线晚了 1 周
```

**提前把清单写好，一次性过审。**

**清单里每一行都是真实的驳回原因。**

## 4.3 一个必须做的动作

**把模板和代码同步检查：**

```javascript
// scripts/check-sms.js
// 对比 templates.js 和 SMS-TEMPLATES.md，看有没有漏报备的
import fs from "node:fs";
import { TEMPLATES } from "../notify/templates.js";

const md = fs.readFileSync("SMS-TEMPLATES.md", "utf8");

let missing = 0;
for (const [name, tpl] of Object.entries(TEMPLATES)) {
  const idInMd = md.includes(tpl.id);
  const bodyInMd = md.includes(tpl.body.replace(/\{(\w+)\}/g, "{$$$1}")) ||
                   md.includes(tpl.body);
  if (!idInMd) { console.log(`❌ ${name}：模板 ID ${tpl.id} 没写进报备清单`); missing++; }
  if (!bodyInMd) { console.log(`⚠️  ${name}：模板内容可能改过，确认是否重新报备`); }
}

console.log(missing ? `\n❌ ${missing} 个模板漏报备` : "\n✅ 全部已报备");
process.exit(missing ? 1 : 0);
```

**跑它。任何模板改了内容没更新清单，都会被提醒。**

**这条检查能防止"改了文案忘了重新报备"这个致命错误。**

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **模板为什么要结构化**
- **变量类型检查抓住了哪些错**
- **`ttl` 为什么用 enum**
- **报备清单里你最没想到的一条**

---

# 第 6 步：课后练习

## 练习一：加"发送频率限制"（25 分钟）

**运营商有硬限制，你自己也要限制（防刷）。**

```javascript
// 同一号码 1 分钟内只能发 1 条验证码
export function checkSmsRate(phone, kind = "verify") {
  const now = Date.now();
  const limits = {
    verify: { perMinute: 1, perDay: 10 },
    notify: { perHour: 5, perDay: 20 },
    marketing: { perDay: 1 },
  };
  const lim = limits[kind];

  if (lim.perMinute) {
    const n = db.prepare(`
      SELECT COUNT(*) c FROM sms_log
      WHERE phone = ? AND created_at > ?
    `).get(mask(phone), now - 60_000).c;
    if (n >= lim.perMinute) return { ok: false, reason: "per_minute" };
  }

  // ... perHour / perDay 同理
  return { ok: true };
}
```

**写完测一下：连发 2 条，第 2 条应该被拒。**

**这个功能是第 8 周"防刷"的直接延续。**

## 练习二：算清短信成本（15 分钟）

```text
验证码：每天 ____ 条 × ¥0.035 = ¥____
通知：  每天 ____ 条 × ¥0.035 = ¥____
────────────────────────
合计：  ¥____/天 = ¥____/月
```

**然后回答：**

```text
如果被刷（每个号码每天 10 次上限，1 万个号码）：
  → ¥____/天
  → 你需要什么防护？
```

**参考答案：**

```text
1 万号码 × 10 条 × ¥0.035 = ¥3500/天 = ¥10.5 万/月
→ 必须做：图形验证码（第 8 周）、IP 限频、行为分析
→ 而且"每天 10 条"这个上限是运营商给的，不是你设的
```

**这个数字就是"验证码被刷一夜破产"的真实规模。**

## 练习三：判断这个短信实现错在哪（15 分钟）

```javascript
async function sendCode(phone) {
  const code = Math.random().toString().slice(2, 8);
  await fetch("https://sms.api.com/send", {
    method: "POST",
    body: JSON.stringify({
      phone,
      content: `【某某科技】您的验证码是 ${code}，5 分钟内有效。`,
    }),
  });
}
```

**错在哪？至少五条。**

**参考答案：**

```text
① 直接传 content → 真实服务商不允许"自由内容"，必须传 templateId + params
   → 这样发出去会被拒，或者用"无模板"通道（成本更高、更容易被拦）
② 没检查 res.ok → 失败也当成功
③ code 用 Math.random → 不是密码学安全的（可预测）
   → 应该用 crypto.randomInt / randomBytes
④ 没有落库 → 无法查状态、无法算成本、无法排查
⑤ 没有频率限制 → 会被刷
⑥ 没有长度检查 → code 可能是 "1234"（4 位）或 "12345678"（8 位）
   因为 Math.random().toString() 长度不固定
```

**第 ③ 和第 ⑥ 条最隐蔽。**

```javascript
Math.random().toString()     // "0.123456789012345" 
  .slice(2, 8)               // "123456"  ← 看起来对
Math.random().toString()     // "0.001234567890123"
  .slice(2, 8)               // "001234"  ← 前导零，还是 6 位
Math.random().toString()     // "0.000012345678901"
  .slice(2, 8)               // "000012"  ← 还是 6 位
```

**长度居然稳定？** 因为 `Math.random()` 在小数 15 位内几乎总有 6 位非零。**但 `Math.random()` 可能返回 `0.000001` 这种，`toString()` 变成 `"0.000001"` → slice 得 `"000001"`，还是 6 位。**

**用 `crypto.randomInt(100000, 1000000)` 才是正确做法。**

---

# 第 7 步：最终验收

## A. 模板结构化

- [ ] `notify/templates.js` 有 4 个以上模板
- [ ] 每个模板有 `id` / `sign` / `body` / `vars` / `kind`
- [ ] 变量都声明了 `type`（digits / alnum / enum / text）
- [ ] 有 `forbidden`（禁用词）或 `required`（必含词）
- [ ] 营销模板有 `hours`（发送时段）

## B. 渲染校验

- [ ] 缺变量 → 抛错
- [ ] 变量类型不对 → 抛错
- [ ] 残留 `{xxx}` → 抛错
- [ ] 含禁用词 → 抛错
- [ ] 营销缺"退订" → 抛错
- [ ] 超长 → **只警告，不抛错**
- [ ] `test-templates.js` 9 条全过

## C. 假网关

- [ ] `notify/fake-sms.js` 支持 `ok` / `fail` / `rate_limit`
- [ ] 手机号格式校验
- [ ] 返回结构对齐真实服务商（`serialNo` / `code`）
- [ ] `smsdump/` 有 jsonl 记录

## D. 接起来

- [ ] `notify/sms.js` 渲染 → 时段检查 → 网关 → 落库
- [ ] `sms_log` 表 + 两个索引
- [ ] 日志里手机号脱敏

## E. 报备清单

- [ ] `SMS-TEMPLATES.md` 有签名 + 4 个模板
- [ ] 每个模板有"为什么这样写"
- [ ] **有"常见驳回原因"表（≥6 条）**
- [ ] 有"发送频率限制"
- [ ] **有备用模板**
- [ ] `check-sms.js` 能对比代码和清单

## F. 提交

```bash
git add -A
git commit -m "第156节：短信模板结构化+假网关+报备清单"
git push
```

---

## 本节课要能说出口的一句话

> **短信的坑不在技术，在"模板审核不过，业务就停摆"。所以模板必须是结构化的，报备必须是提前的。**

---

# 附：常见问题速查

**Q：为什么不能用"自由内容"发短信？**

A：**三个原因：**

```text
① 运营商禁止（无模板通道会被重点监控，容易封号）
② 成本更高（无模板通道单价 2–3 倍）
③ 到达率更低（内容不可控 → 更容易被判定为垃圾）
```

**必须用"签名 + 模板 + 变量"的三段式。**

**Q：模板里能放链接吗？**

A：**验证码/通知类：不要。**

```text
带链接的短信是被诈骗用得最多的形式
→ 运营商重点审查
→ 进"疑似诈骗"的概率大增
→ 用户也会警惕（"这是钓鱼吗"）
```

**营销类可以放，但要报备短链（不能是直接 URL）。**

**Q：`{ttl}` 为什么必须 enum 不能用数字？**

A：**因为运营商的模板是"5 分钟"这个确定值。**

```text
你报备"5 分钟"
实际发"7 分钟"
→ 内容与报备不符 → 被拦
```

**如果业务需要可变时长，把 5/10/30 都在模板里列出来，报备三个值。**

**Q：手机号格式校验，`1[3-9]\d{9}` 够吗？**

A：**够用于"排除明显错误的"，不够用于"判断号码真实存在"。**

```text
1[3-9]\d{9}  过滤掉：长度不对、不以 1[3-9] 开头
但 13800000000 这种"格式对但不存在"的，正则判断不出来
```

**真正的号码存在性要靠"发送结果"（`isv.MOBILE_NUMBER_ILLEGAL` 或"空号"回执）。**

**Q：为什么 `Math.random()` 不能生成验证码？**

A：**因为它可预测。**

```text
V8 的 Math.random 用 xorshift128+
→ 观察到 5–10 个连续输出，就能推算出内部状态
→ 后续所有输出都能算出来
```

**用 `crypto.randomInt(100000, 1000000)`（Node 内置，密码学安全）。**

**Q：营销短信的"回 T 退订"真的有用吗？**

A：**有，而且必须有。**

```text
① 运营商强制要求（不写直接被拒）
② 用户真的会回 T（你要能处理这个回复，第 159 节讲回执）
③ 不处理"回 T"会导致用户投诉 → 你的签名被拉黑
```

**最简单的处理：收到"T"就把该号码加进退订名单，后续营销短信全部跳过。**

**Q：报备要多久？能加急吗？**

A：**1–3 个工作日，通常不能加急。**

```text
阿里云/腾讯云：1–2 工作日（工作时间提交）
三大运营商直连：3–5 工作日
```

**所以：**

```text
新功能上线前 1 周就要提交模板报备
不要"今天写完代码，明天想上线"
```
