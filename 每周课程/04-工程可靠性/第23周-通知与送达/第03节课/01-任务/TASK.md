# 第 157 节课：模板渲染与测试

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 昨天做了短信模板的"结构"，今天做**能测的模板系统**：变量缺失必须报错、链接必须能验、多语言不能乱码。
> 而且你会写一条测试，专门抓"发出 `{{name}}` 这种半成品"。

**建议用时**：120 分钟
**你需要先完成**：第 156 节的 `notify/templates.js`
**今天要装**：什么都不用装

---

# 第 0 步：一个真实的事故（15 分钟）

## 0.1 事故现场

```text
用户收到的邮件：

  尊敬的 {{name}}：
  
  您的订单 {{order_no}} 已发货，预计 {{eta}} 到达。
  
  感谢您的支持！
```

**三个问题：**

```text
① 用户不知道该怎么称呼自己（{{name}} 没被替换）
② 不知道订单号
③ 不知道什么时候到
```

**这封邮件的"发送"完全成功** —— API 返回 200，日志显示"已发送"。

**但它是一封废邮件。**

## 0.2 为什么会发生

```javascript
// 原因一：变量名拼错
render(tpl, { userName: "张三" })     // 模板里是 {{name}}
// → 简单替换不会报错，只是替换不上

// 原因二：变量值是 undefined
const name = user?.profile?.name;      // undefined
render(tpl, { name })
// → String(undefined) === "undefined"，更糟

// 原因三：嵌套变量
render(tpl, { order: { no: "SF123" } })  // 模板里是 {{order_no}}
// → 替换不上

// 原因四：模板里有多余的大括号
"{{name}}"  → 正常
"{{{name}}}" → 可能渲染成 "{张三}" 或 "{undefined}"
```

**四种原因，没有一个会抛错。**

## 0.3 今天的三个防线

```text
防线一：渲染后检查残留占位符（{{xxx}} / {xxx} / ${xxx}）
防线二：变量值不能是 undefined / null / "undefined" / "null"
防线三：渲染失败的邮件"绝不发出"（抛出，让调用方处理）
```

**三条都做了，你就不会发出废邮件。**

---

# 第 1 步：一个能报错的渲染器（30 分钟）

## 1.1 三种占位符语法，都要防

```javascript
"尊敬的 {{name}}"     // 双大括号（Handlebars 风格）
"尊敬的 ${name}"      // 美元大括号（模板字符串风格）
"尊敬的 {name}"       // 单大括号（我们短信用的）
```

**你的项目可能混用**（邮件用 `{{}}`，短信用 `{}`）。

**所以渲染后要检查所有三种残留。**

## 1.2 实现

```javascript
// notify/render.js
// 通用渲染器：支持 {{x}} / ${x} / {x}，渲染后检查残留

const PATTERNS = [
  { name: "双大括号", re: /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g },
  { name: "美元大括号", re: /\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g },
  { name: "单大括号", re: /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g },
];

/**
 * 渲染模板。任何异常都抛错，绝不返回半成品。
 *
 * @param {string} tpl    模板文本
 * @param {object} vars   变量
 * @param {object} opts
 * @param {"brace"|"dollar"|"double"} opts.syntax  使用哪种语法（默认 brace）
 * @param {boolean} opts.strict  变量值为 undefined/null 时抛错（默认 true）
 */
export function render(tpl, vars = {}, opts = {}) {
  const { syntax = "brace", strict = true } = opts;
  const pat = PATTERNS.find((p) => p.name === (syntax === "double" ? "双大括号" : syntax === "dollar" ? "美元大括号" : "单大括号"));
  if (!pat) throw new Error(`未知语法：${syntax}`);

  if (typeof tpl !== "string") throw new Error("模板必须是字符串");

  // ① 找出模板里用到的所有变量
  const used = [...tpl.matchAll(pat.re)].map((m) => m[1]);
  const uniqueUsed = [...new Set(used)];

  // ② 变量齐全性检查
  const missing = uniqueUsed.filter((k) => vars[k] === undefined);
  if (missing.length) {
    throw new Error(`模板缺少变量：${missing.join(", ")}（模板声明了 ${uniqueUsed.length} 个）`);
  }

  // ③ 变量值合法性（strict 模式）
  if (strict) {
    for (const k of uniqueUsed) {
      const v = vars[k];
      if (v === null) throw new Error(`变量 ${k} 是 null`);
      const s = String(v);
      if (s === "undefined" || s === "null") {
        throw new Error(`变量 ${k} 的值会渲染成 "${s}"`);
      }
      if (s.trim() === "") {
        throw new Error(`变量 ${k} 是空字符串`);
      }
    }
  }

  // ④ 替换
  let out = tpl;
  for (const k of uniqueUsed) {
    // 用 split/join 而不是 replace，避免 $ 符号被当成特殊替换模式
    out = out.split(`{{${k}}}`).join(String(vars[k]));
    out = out.split(`{{ ${k} }}`).join(String(vars[k]));
    out = out.split(`\${${k}}`).join(String(vars[k]));
    out = out.split(`{${k}}`).join(String(vars[k]));
  }

  // ⑤ 残留检查（三种语法都查）
  const leftovers = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    const m = out.match(p.re);
    if (m) leftovers.push(...m);
  }
  if (leftovers.length) {
    throw new Error(`渲染后仍有未替换的占位符：${[...new Set(leftovers)].join(", ")}`);
  }

  return out;
}

/**
 * 只检查模板是否"能安全渲染"，不实际渲染。
 * 用于 lint / 测试。
 */
export function validateTemplate(tpl, syntax = "brace") {
  const pat = PATTERNS.find((p) => p.name === (syntax === "double" ? "双大括号" : syntax === "dollar" ? "美元大括号" : "单大括号"));
  const used = [...new Set([...tpl.matchAll(pat.re)].map((m) => m[1]))];

  const problems = [];

  // 嵌套或残缺大括号
  if (/\{\{\{|\}\}\}/.test(tpl)) problems.push("出现三连大括号");
  if (/\{[^}\w\s]/.test(tpl)) problems.push("大括号内有非法字符");

  // 变量名重复但写法不同
  const raw = [...tpl.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
  const weird = raw.filter((r) => r !== r.trim() || /[^A-Za-z0-9_]/.test(r));
  if (weird.length) problems.push(`变量名有异常：${weird.join(", ")}`);

  return { vars: used, problems, ok: problems.length === 0 };
}
```

## 1.3 逐段解释四个关键设计

**① 为什么用 `split().join()` 而不是 `replace()`**

```javascript
// ❌ 用户输入里有 $ 会出错
"价格 ${price}".replace("${price}", "$100")
// → 结果可能是 "价格 00"（$1 被当成"第一个捕获组"）

// ✅ 安全
"价格 ${price}".split("${price}").join("$100")
```

**这是 JS 字符串替换的经典坑。** 用户变量值里可能有 `$`（价格、代码）。

**② 为什么 `strict` 要检查 `"undefined"` 字符串**

```javascript
const name = user?.profile?.name;   // undefined
String(undefined)                    // "undefined"
// 渲染后："尊敬的 undefined"
```

**比"没替换"更糟：** 用户会看到 `undefined` 这个词，觉得你的系统坏了。

**所以要显式拒绝 `"undefined"` / `"null"` 字符串值。**

**③ 为什么空字符串也拒绝**

```javascript
render("尊敬的 {{name}}：", { name: "" })
// → "尊敬的 ："   ← 语法上没错，但看起来像 bug
```

**空字符串在 90% 的场景下是"数据问题"，不是"合理值"。**

**如果你的场景确实允许空（比如"备注"可以为空），用 `strict: false` 或给个显式的默认值。**

**④ 为什么 `validateTemplate` 检查"三连大括号"**

```javascript
"{{{name}}}"   // Handlebars 里这是"不转义输出"，但很多模板引擎会渲染成 "{张三}"
```

**混用语法时会出这种怪结果。** 检查出来，统一用一种。

## 1.4 立即验证

```javascript
// scripts/test-render.js
import { render, validateTemplate } from "../notify/render.js";

const CASES = [
  { name: "正常",      tpl: "尊敬的 {{name}}，订单 {{no}} 已发货。", vars: { name: "张三", no: "SF123" }, ok: true },
  { name: "缺变量",    tpl: "尊敬的 {{name}}", vars: {}, ok: false },
  { name: "值为 undefined", tpl: "尊敬的 {{name}}", vars: { name: undefined }, ok: false },
  { name: "值为 null", tpl: "尊敬的 {{name}}", vars: { name: null }, ok: false },
  { name: "值为空串",  tpl: "尊敬的 {{name}}", vars: { name: "" }, ok: false },
  { name: "值为字符串undefined", tpl: "尊敬的 {{name}}", vars: { name: "undefined" }, ok: false },
  { name: "残留占位符", tpl: "尊敬的 {{name}} {{other}}", vars: { name: "张三", other: "x" }, ok: true },
  { name: "值含美元符", tpl: "价格 ${price}", vars: { price: "$100" }, ok: true, syntax: "dollar" },
  { name: "三连括号",  tpl: "{{{name}}}", vars: { name: "张三" }, ok: false },
  { name: "单括号",    tpl: "您的验证码是 {code}", vars: { code: "123456" }, ok: true },
];

let pass = 0;
for (const c of CASES) {
  try {
    const out = render(c.tpl, c.vars, { syntax: c.syntax });
    if (c.ok) { pass++; console.log(`✅ ${c.name.padEnd(16)} → ${out}`); }
    else console.log(`❌ ${c.name.padEnd(16)} 应该失败但成功了 → ${out}`);
  } catch (e) {
    if (!c.ok) { pass++; console.log(`✅ ${c.name.padEnd(16)} 正确拒绝：${e.message.slice(0, 50)}`); }
    else console.log(`❌ ${c.name.padEnd(16)} 不该失败：${e.message}`);
  }
}

console.log(`\n${pass}/${CASES.length} 通过`);

console.log("\n=== 模板静态检查 ===");
for (const t of ["尊敬的 {{name}}", "{{{bad}}}", "{{ name }}", "{{a-b}}"]) {
  const v = validateTemplate(t);
  console.log(`${v.ok ? "✅" : "⚠️ "} "${t}"  变量=${v.vars.join(",") || "-"}  ${v.problems.join(" / ") || ""}`);
}
```

**期望：10/10 通过。**

**特别注意三条：**

```text
✅ 值为字符串undefined  正确拒绝   ← 这条最值钱
✅ 值含美元符            → 价格 $100   ← 证明 $ 没问题
✅ 三连括号             正确拒绝
```

---

# 第 2 步：链接必须能验（25 分钟）

## 2.1 一个隐藏的坑

```text
你的邮件里："点击链接验证：https://app.example.com/verify?token=abc"
```

**如果 `token` 是假的，或者 `app.example.com` 没配 DNS，链接就是死的。**

**而你不会知道** —— 因为邮件发出去了。

## 2.2 两个检查

```javascript
// notify/links.js

/**
 * 从文本里抽出所有 URL。
 */
export function extractLinks(text) {
  const re = /https?:\/\/[^\s<>"'）)]+/g;
  return [...new Set(String(text ?? "").match(re) ?? [])];
}

/**
 * 检查链接的"形状"。
 * 不做真实请求（那是 smoke test 的事），只做静态检查。
 */
export function checkLinks(text, opts = {}) {
  const { allowedHosts = [], requireHttps = true, maxLen = 2000 } = opts;
  const links = extractLinks(text);
  const problems = [];

  for (const url of links) {
    let u;
    try { u = new URL(url); }
    catch { problems.push(`${url} 不是合法 URL`); continue; }

    if (requireHttps && u.protocol !== "https:" && u.hostname !== "localhost") {
      problems.push(`${url} 不是 https`);
    }
    if (allowedHosts.length && !allowedHosts.includes(u.hostname)) {
      problems.push(`${url} 的域名 ${u.hostname} 不在白名单`);
    }
    if (url.length > maxLen) {
      problems.push(`${url} 太长（${url.length} > ${maxLen}）`);
    }
    // 常见错误：token 没填
    if (/\{|\}|undefined|null|%7B/.test(url)) {
      problems.push(`${url} 里含未替换的占位符或 undefined`);
    }
  }

  return { links, problems, ok: problems.length === 0 };
}

/**
 * 真实可达性检查（会发请求，只在测试环境用）。
 */
export async function probeLinks(text, { timeout = 5000 } = {}) {
  const { links } = checkLinks(text);
  const results = [];

  for (const url of links) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeout), redirect: "follow" });
      results.push({ url, status: res.status, ok: res.ok, ms: Date.now() - t0 });
    } catch (e) {
      results.push({ url, status: 0, ok: false, error: String(e.message).slice(0, 80), ms: Date.now() - t0 });
    }
  }

  return results;
}
```

## 2.3 三个必须验的场景

```javascript
// scripts/test-links.js
import { checkLinks, probeLinks } from "../notify/links.js";

console.log("=== 静态检查 ===\n");

const CASES = [
  { text: "验证链接：https://app.example.com/verify?token=abc123", ok: true },
  { text: "验证链接：http://app.example.com/verify", ok: false, why: "非 https" },
  { text: "验证链接：https://app.example.com/verify?token={token}", ok: false, why: "占位符未替换" },
  { text: "验证链接：https://app.example.com/verify?token=undefined", ok: false, why: "token 是 undefined" },
  { text: "验证链接：https://evil.com/phish", ok: false, why: "域名不在白名单" },
  { text: "没有链接的纯文本", ok: true },
];

for (const c of CASES) {
  const r = checkLinks(c.text, { allowedHosts: ["app.example.com"] });
  const pass = r.ok === c.ok;
  console.log(`${pass ? "✅" : "❌"} ${c.text.slice(0, 45).padEnd(47)} ${r.ok ? "通过" : r.problems[0]}`);
}

console.log("\n=== 真实探测（只在测试环境） ===\n");
const real = await probeLinks("https://example.com 和 https://example.com/404-not-exist");
for (const r of real) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.status} ${r.ms}ms  ${r.url}`);
}
```

**期望：6 条静态检查全过。**

**真实探测那两条**（`example.com` 是真实域名）：

```text
✅ 200  xxxms  https://example.com
❌ 404  xxxms  https://example.com/404-not-exist
```

## 2.4 为什么"静态检查"和"真实探测"要分开

```text
静态检查：
  · 零成本、零网络
  · 能进单元测试、进 CI
  · 抓"格式错、占位符残留、非 https、域名不对"

真实探测：
  · 要发请求（慢、可能不稳）
  · 只在"发布前"或"每天巡检"时跑
  · 抓"链接真的打不开、返回 500"
```

**两种都要有，但用在不同场合。**

---

# 第 3 步：五个真实模板（25 分钟）

## 3.1 邮件模板（多语言 + 纯文本）

```javascript
// notify/mail-templates.js
import { render } from "./render.js";

export const MAIL_TEMPLATES = {
  verify_code: {
    subject: "您的验证码是 {{code}}",
    text: [
      "您好，",
      "",
      "您的验证码是 {{code}}，{{ttl}} 分钟内有效。",
      "",
      "如果不是您本人操作，请忽略本邮件。",
      "",
      "—— 本邮件由系统自动发送，请勿回复",
    ].join("\n"),
    vars: ["code", "ttl"],
  },

  verify_link: {
    subject: "请验证您的邮箱",
    text: [
      "您好，",
      "",
      "请点击下面的链接完成验证：",
      "{{link}}",
      "",
      "链接 {{ttl}} 分钟内有效。如果链接无法点击，请复制到浏览器打开。",
      "",
      "如果不是您本人操作，请忽略本邮件。",
    ].join("\n"),
    vars: ["link", "ttl"],
    // 这个模板带链接 → 要检查
    checkLinks: true,
  },

  order_shipped: {
    subject: "订单 {{order_no}} 已发货",
    text: [
      "您好，",
      "",
      "您的订单 {{order_no}} 已于 {{ship_date}} 发出。",
      "承运商：{{carrier}}",
      "运单号：{{tracking_no}}",
      "预计 {{eta}} 送达。",
      "",
      "查询物流：{{track_url}}",
      "",
      "—— 本邮件由系统自动发送，请勿回复",
    ].join("\n"),
    vars: ["order_no", "ship_date", "carrier", "tracking_no", "eta", "track_url"],
    checkLinks: true,
  },

  ticket_created: {
    subject: "工单 {{ticket_no}} 已受理",
    text: [
      "您好，",
      "",
      "您的工单 {{ticket_no}} 已受理。",
      "问题描述：{{summary}}",
      "我们将在 {{sla}} 小时内处理，处理完成后会再次通知您。",
      "",
      "—— 本邮件由系统自动发送，请勿回复",
    ].join("\n"),
    vars: ["ticket_no", "summary", "sla"],
  },

  weekly_digest: {
    subject: "本周共有 {{count}} 条新工单",
    text: [
      "您好，",
      "",
      "本周（{{range}}）您共有 {{count}} 条新工单：",
      "",
      "{{details}}",
      "",
      "查看全部：{{link}}",
      "",
      "—— 本邮件由系统自动发送，请勿回复",
    ].join("\n"),
    vars: ["count", "range", "details", "link"],
    checkLinks: true,
  },
};

/**
 * 渲染邮件（subject + text），任何错误都抛。
 */
export function renderMail(name, vars) {
  const tpl = MAIL_TEMPLATES[name];
  if (!tpl) throw new Error(`未知邮件模板：${name}`);

  const subject = render(tpl.subject, vars, { syntax: "double" });
  const text = render(tpl.text, vars, { syntax: "double" });

  return { subject, text, tplName: name, checkLinks: Boolean(tpl.checkLinks) };
}
```

## 3.2 一个必须做的"全模板体检"

```javascript
// scripts/test-all-templates.js
import { MAIL_TEMPLATES, renderMail } from "../notify/mail-templates.js";
import { TEMPLATES, renderSms } from "../notify/templates.js";
import { checkLinks } from "../notify/links.js";
import { validateTemplate } from "../notify/render.js";

// 每个模板给一份"理想变量"（用于体检）
const SAMPLE_VARS = {
  verify_code:            { code: "123456", ttl: "5" },
  verify_link:            { link: "https://app.example.com/verify?token=abc123", ttl: "30" },
  order_shipped:          { order_no: "SO20261117001", ship_date: "2026-11-17", carrier: "顺丰", tracking_no: "SF1234567890", eta: "2026-11-19", track_url: "https://app.example.com/track/SF1234567890" },
  ticket_created:         { ticket_no: "T20261117001", summary: "内胆开裂", sla: "2" },
  weekly_digest:          { count: "12", range: "11-11 至 11-17", details: "1. 内胆开裂\n2. 物流延迟", link: "https://app.example.com/tickets" },
};

let fail = 0;

console.log("=== 邮件模板 ===\n");
for (const name of Object.keys(MAIL_TEMPLATES)) {
  const vars = SAMPLE_VARS[name] ?? {};

  // ① 变量声明 vs 实际用到的
  const declared = MAIL_TEMPLATES[name].vars;
  const v = validateTemplate(MAIL_TEMPLATES[name].text, "double");
  const usedNotDeclared = v.vars.filter((x) => !declared.includes(x));
  const declaredNotUsed = declared.filter((x) => !v.vars.includes(x));

  if (usedNotDeclared.length) { console.log(`❌ ${name}：用了但没声明 ${usedNotDeclared.join(",")}`); fail++; }
  if (declaredNotUsed.length) { console.log(`⚠️  ${name}：声明但没用 ${declaredNotUsed.join(",")}`); }

  // ② 能不能渲染
  let r;
  try { r = renderMail(name, vars); }
  catch (e) { console.log(`❌ ${name}：渲染失败 ${e.message}`); fail++; continue; }

  // ③ 链接检查
  if (r.checkLinks) {
    const lk = checkLinks(r.text, { allowedHosts: ["app.example.com"] });
    if (!lk.ok) { console.log(`❌ ${name}：链接问题 ${lk.problems.join("; ")}`); fail++; continue; }
  }

  // ④ 正文不能太长（邮件正文超过 1 万字符会进"被截断"提示）
  if (r.text.length > 10000) { console.log(`⚠️  ${name}：正文 ${r.text.length} 字符，可能被截断`); }

  console.log(`✅ ${name.padEnd(16)} 主题="${r.subject}"  正文 ${r.text.length} 字符`);
}

console.log("\n=== 短信模板 ===\n");
for (const name of Object.keys(TEMPLATES)) {
  const tpl = TEMPLATES[name];
  // 构造最小合法变量
  const vars = {};
  for (const [k, spec] of Object.entries(tpl.vars)) {
    vars[k] = spec.type === "enum" ? spec.values[0]
      : spec.type === "digits" ? "1".repeat(spec.len ?? 6)
      : spec.type === "alnum" ? "A".repeat(spec.minLen ?? 6)
      : "测试内容 回 T 退订";
  }

  try {
    const r = renderSms(name, vars);
    console.log(`✅ ${name.padEnd(16)} ${r.text}${r.warn ? "  ⚠️ " + r.warn : ""}`);
  } catch (e) {
    console.log(`❌ ${name.padEnd(16)} ${e.message}`);
    fail++;
  }
}

console.log(fail ? `\n❌ ${fail} 处问题` : "\n✅ 全部模板合格");
process.exit(fail ? 1 : 0);
```

**跑它。任何模板有问题都会报出来。**

**这条脚本应该进 `npm test` 或 `npm run check`（第 147 节的 preflight）。**

## 3.3 一个必须做的破坏实验

```javascript
// 把 verify_link 的 link 变量改成一个坏链接
const r = renderMail("verify_link", {
  link: "http://app.example.com/verify?token={token}",   // http + 占位符
  ttl: "30",
});
checkLinks(r.text, { allowedHosts: ["app.example.com"] });
```

**期望：两个问题都报出来。**

```text
http://... 不是 https
...token={token} 里含未替换的占位符
```

**如果没报出来** → 你的 `checkLinks` 有 bug（可能正则没匹配到，或者 `allowedHosts` 没生效）。

---

# 第 4 步：把渲染失败变成"不发"（20 分钟）

## 4.1 在发信入口拦住

```javascript
// notify/mailer.js 里加一层（在 nodemailer 之前）
import { renderMail } from "./mail-templates.js";
import { checkLinks } from "./links.js";

export async function sendTemplatedMail({ to, template, vars, allowedHosts = [] }) {
  // ① 渲染（失败就抛，绝不发半成品）
  let rendered;
  try {
    rendered = renderMail(template, vars);
  } catch (e) {
    log.error("mail_render_failed", { template, err: String(e.message).slice(0, 150) });
    throw new Error(`模板渲染失败：${e.message}`);
  }

  // ② 链接检查
  if (rendered.checkLinks) {
    const lk = checkLinks(rendered.text, { allowedHosts });
    if (!lk.ok) {
      log.error("mail_link_invalid", { template, problems: lk.problems.join("; ").slice(0, 200) });
      throw new Error(`邮件链接不合规：${lk.problems.join("; ")}`);
    }
  }

  // ③ 真正发送
  return sendMail({
    to,
    subject: rendered.subject,
    text: rendered.text,
    headers: { "X-Template": template },
  });
}
```

## 4.2 为什么"抛错"而不是"返回 ok:false"

```text
渲染失败 = 代码/数据 bug（不是"外部服务出问题"）
→ 这是"绝不该发生"的错误
→ 必须抛，让调用方知道"这条根本没发出去"
→ 而且不该重试（重试还是同样的数据，还是失败）
```

**和"网关失败"（`ok:false`）区分开：**

```text
渲染失败  → throw     （不重试，去修代码/数据）
网关失败  → ok:false  （可重试，第 158 节）
```

**这个区分很重要** —— 混在一起，你的重试逻辑会去重试"永远失败"的渲染错误。

## 4.3 一个必须做的验证

```javascript
// scripts/test-fail-fast.js
import { sendTemplatedMail } from "../notify/mailer.js";

const CASES = [
  {
    name: "缺变量",
    args: { to: "a@example.test", template: "order_shipped", vars: { order_no: "SO1" } },
    expectThrow: true,
  },
  {
    name: "坏链接",
    args: {
      to: "a@example.test", template: "verify_link",
      vars: { link: "http://x.com/v?t={token}", ttl: "30" },
      allowedHosts: ["app.example.com"],
    },
    expectThrow: true,
  },
];

for (const c of CASES) {
  try {
    await sendTemplatedMail(c.args);
    console.log(`${c.expectThrow ? "❌" : "✅"} ${c.name} 应该失败但成功了`);
  } catch (e) {
    console.log(`${c.expectThrow ? "✅" : "❌"} ${c.name} ${e.message.slice(0, 70)}`);
  }
}

// 关键：假 SMTP 里不该有这两封
console.log("\n检查 maildump：");
const fs = await import("node:fs");
const files = fs.readdirSync("maildump").filter((f) => f.endsWith(".eml"));
console.log(`  当前 .eml 数量：${files.length}`);
console.log(`  （如果比之前多了，说明渲染失败的邮件被发出去了 ❌）`);
```

**这是"不发半成品"的最终证明。**

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **10 条渲染测试的结果**
- **"值为字符串 undefined" 这条为什么最值钱**
- **`$` 符号的坑**
- **静态检查和真实探测的分工**

---

# 第 6 步：课后练习

## 练习一：加"HTML 版和文本版一致性检查"（25 分钟）

**反垃圾系统会检查"HTML 里有没有文本版没有的隐藏内容"。**

```javascript
// 简单版：把 HTML 的纯文字抽出来，和 text 做相似度
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function checkConsistency(text, html) {
  const a = String(text ?? "").replace(/\s+/g, "");
  const b = htmlToText(html).replace(/\s+/g, "");

  if (!a || !b) return { ok: true, note: "只有一种格式" };

  // 关键内容（数字、链接）必须在两边都有
  const nums = (s) => new Set(s.match(/\d{4,}/g) ?? []);
  const aNums = nums(a), bNums = nums(b);
  const missing = [...aNums].filter((n) => !bNums.has(n));

  if (missing.length) {
    return { ok: false, problems: [`HTML 版缺少文本版里的数字：${missing.join(",")}`] };
  }
  return { ok: true };
}
```

**用你第 155 节那封"验证码 + HTML"的邮件测一下：验证码 654321 在两边都有吗？**

## 练习二：算清"模板数量"的成本（15 分钟）

```text
邮件模板 ____ 个
短信模板 ____ 个（含备用）
每个要维护：变量声明、变量说明、测试用例、报备材料

如果 5 个模板，要维护 ____ 份东西
```

**然后回答：**

```text
为什么"模板数量要控制"？
```

**参考答案：**

```text
每多一个模板 = 多一处"可能渲染失败" + 多一处"可能审核不过" + 多一处"可能变量漏填"
而且模板之间会分叉（"这个功能用 A 模板还是 B 模板？"）

→ 能用变量表达的，不要新建模板
   例："订单已发货"和"订单已签收" → 用 {{status}} 变量，一个模板
```

## 练习三：判断这个渲染实现错在哪（15 分钟）

```javascript
function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k]);
}
```

**错在哪？至少五条。**

**参考答案：**

```text
① vars[k] 是 undefined 时，返回字符串 "undefined"
   → "尊敬的 undefined"
② 没有检查"残留占位符"（如果模板里是 {{ a-b }}，\w+ 匹配不到，原样留下）
③ 用 replace 而不是 split/join → 值里有 $ 会出错
④ 没有检查空字符串
⑤ 没有报告"哪些变量没被用到"（模板写了 {{x}} 但 vars 没给 x 也不报错）
⑥ 不支持 ${x} 或 {x} 语法（如果项目混用）
```

**第 ① 条最致命：** `vars[k]` 返回 `undefined`，`String(undefined)` 是 `"undefined"`，**替换后用户看到这个词，而不是"没替换"**。

---

# 第 7 步：最终验收

## A. 渲染器

- [ ] 支持三种语法（`{{x}}` / `${x}` / `{x}`）
- [ ] 缺变量 → 抛错（报出缺哪几个）
- [ ] 值为 `undefined` / `null` → 抛错
- [ ] 值为字符串 `"undefined"` / `"null"` → 抛错
- [ ] 值为空字符串 → 抛错
- [ ] 渲染后残留占位符 → 抛错
- [ ] **用 `split().join()` 不用 `replace()`**（`$` 的坑）
- [ ] `test-render.js` 10 条全过

## B. 链接检查

- [ ] `extractLinks` 能抽出所有 URL
- [ ] 非 https → 报问题
- [ ] 域名不在白名单 → 报问题
- [ ] 含 `{` / `}` / `undefined` → 报问题
- [ ] 静态检查 6 条全过
- [ ] 真实探测能跑（`probeLinks`）

## C. 五个模板

- [ ] verify_code（无链接）
- [ ] verify_link（**有链接，标记 checkLinks**）
- [ ] order_shipped（有链接）
- [ ] ticket_created
- [ ] weekly_digest（有链接 + 多行 details）
- [ ] `test-all-templates.js` 全部模板合格
- [ ] 每个模板的 `vars` 声明和实际用到的一致

## D. 失败即不发

- [ ] `sendTemplatedMail` 渲染失败会 throw
- [ ] 链接不合规会 throw
- [ ] 坏确认过：**`maildump/` 里没有这些失败邮件**

## E. 破坏实验

- [ ] 把 link 改成 `http://` + 占位符 → 两个问题都报
- [ ] 把某个 var 改成 `undefined` → 抛错

## F. 提交

```bash
git add -A
git commit -m "第157节：能报错的渲染器+链接检查+五模板体检"
git push
```

---

## 本节课要能说出口的一句话

> **`String(undefined)` 是 `"undefined"` —— 所以变量缺了不会报错，只会让用户看到"尊敬的 undefined"。这就是必须显式检查的原因。**

---

# 附：常见问题速查

**Q：为什么用 `split().join()` 而不是 `replace()`？**

A：**因为用户变量值里可能有 `$`。**

```javascript
"价格 ${price}".replace("${price}", "$100")     // → "价格 00"（$1 被当成捕获组）
"价格 ${price}".split("${price}").join("$100")  // → "价格 $100" ✅
```

**价格、代码、正则这类值里 `$` 很常见。**

**Q：`{{ name }}`（带空格）和 `{{name}}` 要都支持吗？**

A：**你的模板自己写，统一一种就行。**

**但要检查"同一份模板里混用"** —— `validateTemplate` 会报出来。

**混用的后果：** 你以为改了 `{{name}}`，实际模板里是 `{{ name }}`，渲染失败。

**Q：`allowedHosts` 白名单要维护吗？**

A：**要，而且这是安全防线。**

```text
如果你的模板变量里能填任意 URL：
  攻击者控制某个变量 → 让邮件里出现 https://evil.com
  → 用户点了 → 钓鱼
```

**白名单让"只能是这几个域名"变成硬约束。**

**Q：链接的真实探测会不会太慢？**

A：**每条 1–5 秒，5 个链接就是 25 秒。**

**所以：**

```text
单元测试  → 只做静态检查（0 秒）
发布前    → 跑真实探测（25 秒可接受）
每天巡检  → 跑真实探测（后台异步）
```

**不要把它放进 `npm test`。**

**Q：为什么"值为空字符串"也要报错？**

A：**因为 90% 的场景下是数据问题。**

```javascript
render("尊敬的 {{name}}：", { name: "" })
// → "尊敬的 ："   ← 看起来像 bug
```

**如果某字段确实允许空（比如"备注"），用 `strict: false`，或者给它一个显式的默认值（"（无备注）"）。**

**Q：`weekly_digest` 的 `{{details}}` 是多行文本，怎么处理？**

A：**注意两点：**

```text
① 多行文本在纯文本邮件里，换行要保留（\n）
   → 渲染时不要做任何 strip / 合并空格

② 如果 details 里包含用户输入（工单标题），要防止它破坏排版
   → 截断每行到 60 字
   → 或者只显示前 5 条 + "等 N 条"
```

**这也是一处"模板渲染"和"数据准备"的分界：`details` 应该在调用方拼好，模板只负责占位。**

**Q：这条测试怎么进 CI？**

A：**放 `npm test` 里（都是纯函数，毫秒级）。**

```json
"test": "cross-env NODE_ENV=test node --test test/"
```

**把 `test-all-templates.js` 改成一个 `test()` 用例，或者单独跑：**

```json
"check:templates": "node scripts/test-all-templates.js"
```

**然后加进第 147 节的 `preflight.js`（A 项之一）。**
