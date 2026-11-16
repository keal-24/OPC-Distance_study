# 第 160 节课：发信域名认证（SPF / DKIM / DMARC）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天不写业务代码。**今天配三条 DNS 记录，然后用命令验证它们生效了。**
> 这三条是"能进收件箱"的入门门槛，缺一条就大概率进垃圾箱。

**建议用时**：130 分钟
**你需要先完成**：第 159 节的 `notify/status.js`
**今天要装**：不用装（用 `nslookup` / `dig` / Node 内置 `dns`）

---

# 第 0 步：三条记录各解决什么问题（25 分钟）

## 0.1 一个必须理解的比喻

**你寄一封信，收件方要确认三件事：**

```text
① 这封信真的是"某某公司"寄的，不是别人冒名？        → SPF
② 这封信的内容没被中途改过？                        → DKIM
③ 如果前两个都验不过，"某某公司"希望我怎么处理？      → DMARC
```

**三条记录的分工：**

| 记录 | 放在哪 | 证明什么 | 谁验 |
|---|---|---|---|
| **SPF** | `TXT @ yourdomain.com` | **哪些 IP 有权代表这个域名发信** | 收件方查你的 DNS |
| **DKIM** | `TXT selector._domainkey.yourdomain.com` | **这封信确实是你的服务器发的，且内容未被篡改** | 用你的公钥验签名 |
| **DMARC** | `TXT _dmarc.yourdomain.com` | **SPF/DKIM 都失败时怎么办（拒收/隔离/放行）+ 报告发到哪** | 收件方按你的策略执行 |

## 0.2 三个具体的失败场景

**场景 1：没有 SPF**

```text
攻击者用 yourdomain.com 作为发件人，从自己的服务器发 10 万封诈骗邮件
收件方查你的 DNS：没有 SPF 记录 → 无法验证
→ 结果：你的正常邮件和诈骗邮件"看起来一样"
→ 你的域名信誉被拉低 → 你的正常邮件更容易进垃圾箱
```

**场景 2：没有 DKIM**

```text
你的邮件在传输中被中间服务器修改（加了个广告尾巴）
收件方无法验证"内容是否被改"
→ 无法区分"你发的"和"被篡改的"
```

**场景 3：没有 DMARC**

```text
前两条都失败了，但收件方不知道该怎么做
→ 默认行为（放行或隔离）可能让诈骗邮件进收件箱
→ 而且你收不到"有人冒用你域名"的报告
```

## 0.3 一条硬数据

**业界统计（公开的）：**

```text
没有 SPF/DKIM/DMARC 的邮件：
  Gmail    → 约 60% 进垃圾箱，或直接被拒
  Outlook  → 约 50% 进垃圾箱
  企业邮箱 → 部分直接 550 拒收

三条齐全 + 域名有信誉：
  进收件箱率 > 95%
```

**所以这三条不是"优化"，是"能不能用"。**

## 0.4 今天的产出

```text
DNS-SETUP.md            三条记录的完整配置（可直接照抄）
scripts/check-dns.js    用 Node 的 dns 模块验证三条记录
```

**注意：今天不需要你真的有域名。**

**用 `example.com` 演示结构，你可以：**

```text
① 有域名 → 真的配，然后验证
② 没域名 → 只写 DNS-SETUP.md，用脚本验证 example.com 的记录（学习用）
```

---

# 第 1 步：SPF（25 分钟）

## 1.1 格式

```text
v=spf1 <机制1> <机制2> ... <all限定符>
```

**一个真实的例子：**

```text
v=spf1 include:_spf.google.com include:sendgrid.net ip4:203.0.113.10 -all
```

**逐段解释：**

```text
v=spf1                         版本（固定）
include:_spf.google.com        允许 Google 的 IP
include:sendgrid.net           允许 SendGrid 的 IP
ip4:203.0.113.10               允许你自己的服务器 IP
-all                           其他所有 IP 都不允许（硬失败）
```

**四种 `all` 限定符：**

| 写法 | 含义 | 效果 |
|---|---|---|
| `-all` | 硬失败 | 不在列表里的 IP 发的信 → **拒收**（推荐） |
| `~all` | 软失败 | 标记为可疑，可能进垃圾箱（过渡期用） |
| `?all` | 中立 | 不表态（等于没配） |
| `+all` | 通过 | **任何 IP 都允许（等于没配，千万不要）** |

## 1.2 三个必须知道的限制

**① 只能有一条 SPF 记录**

```text
❌ 错：
  TXT @ "v=spf1 include:a.com -all"
  TXT @ "v=spf1 include:b.com -all"
  → 两条 SPF 记录 = 语法错误 → 所有 SPF 验证都失败（permerror）

✅ 对：
  TXT @ "v=spf1 include:a.com include:b.com -all"
```

**这个坑极常见** —— 你用了两个服务商，各给一条 SPF 记录，你直接加了两条。

**② DNS 查询次数上限 10 次**

```text
每个 include: 会触发一次 DNS 查询
嵌套 include 也算
超过 10 次 → permerror → SPF 验证失败
```

**检查方法：**

```bash
# 用在线工具，或者自己数
# 你的记录里有几个 include: / a / mx / ptr / exists
```

**如果你的服务商很多，考虑"扁平化"（把所有 IP 展开成 ip4:）。**

**③ 长度上限 255 字符**

```text
一条 TXT 记录最长 255 字符
超过 → 需要拆成多条（DNS 库会自动拼接）
但很多服务商的界面不让拆 → 你必须精简
```

## 1.3 推荐配置

**场景一：只用一家发信服务**

```text
TXT @ "v=spf1 include:_spf.yourprovider.com -all"
```

**场景二：你自己的服务器 + 一家服务**

```text
TXT @ "v=spf1 ip4:203.0.113.10 include:_spf.yourprovider.com -all"
```

**场景三：过渡期（还不确定所有发信源）**

```text
TXT @ "v=spf1 include:_spf.yourprovider.com ~all"
```

**先用 `~all` 观察 2 周，确认没有正常邮件被拒，再改 `-all`。**

## 1.4 验证

```bash
nslookup -type=TXT example.com
# 或
dig TXT example.com +short
```

**期望：**

```text
"v=spf1 -all"
```

**（`example.com` 的 SPF 是 `v=spf1 -all`，意思是"任何 IP 都不许代表它发信" —— 这是正确的，因为 example.com 不发信。）**

**用 Node 验证：**

```javascript
// scripts/check-dns.js（先写 SPF 部分）
import dns from "node:dns/promises";

async function checkSpf(domain) {
  let records;
  try {
    records = await dns.resolveTxt(domain);
  } catch (e) {
    return { ok: false, reason: `DNS 查询失败：${e.code}` };
  }

  const flat = records.map((r) => r.join(""));
  const spfRecords = flat.filter((r) => r.startsWith("v=spf1"));

  if (spfRecords.length === 0) {
    return { ok: false, reason: "没有 SPF 记录", all: flat };
  }
  if (spfRecords.length > 1) {
    return { ok: false, reason: `有 ${spfRecords.length} 条 SPF 记录（只能有一条）`, records: spfRecords };
  }

  const record = spfRecords[0];
  const qualifier = record.match(/([-~+?])all\b/)?.[1] ?? null;
  const includes = [...record.matchAll(/include:(\S+)/g)].map((m) => m[1]);
  const ip4 = [...record.matchAll(/ip4:(\S+)/g)].map((m) => m[1]);

  const problems = [];
  if (!qualifier) problems.push("没有 all 限定符（建议加 -all）");
  if (qualifier === "+") problems.push("用了 +all（等于允许任何 IP，必须改）");
  if (qualifier === "?") problems.push("用了 ?all（等于没表态）");
  if (record.length > 255) problems.push(`记录 ${record.length} 字符，超过 255`);
  if (includes.length + ip4.length > 10) problems.push(`机制 ${includes.length + ip4.length} 个，可能超过 DNS 查询上限`);

  return {
    ok: problems.length === 0,
    record,
    qualifier,
    includes,
    ip4,
    problems,
  };
}

const r = await checkSpf(process.argv[2] ?? "example.com");
console.log(JSON.stringify(r, null, 2));
```

```bash
node scripts/check-dns.js example.com
```

**期望：**

```json
{
  "ok": true,
  "record": "v=spf1 -all",
  "qualifier": "-",
  "includes": [],
  "ip4": [],
  "problems": []
}
```

**如果你的域名还没配，这条会返回 `ok: false, reason: "没有 SPF 记录"` —— 这就是你要修的。**

---

# 第 2 步：DKIM（30 分钟）

## 2.1 原理（必须懂，不然配不对）

```text
① 你生成一对密钥（公钥 + 私钥）
② 私钥放在你的发信服务器（或服务商后台）
③ 公钥发布到 DNS：selector._domainkey.yourdomain.com
④ 你发信时，服务器用私钥对"指定头部 + 正文"算签名，加到 DKIM-Signature 头
⑤ 收件方收到后，从 DNS 取你的公钥，验证签名
```

**关键：收件方永远不知道你的私钥。它只验签名。**

## 2.2 一个真实的 DNS 记录

```text
selector._domainkey.yourdomain.com  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
```

**逐段：**

```text
v=DKIM1                     版本
k=rsa                       密钥类型
p=MIIB...                   公钥（Base64，通常 200–400 字符）
```

**`selector` 是什么？**

```text
一个域名可以有多个 selector（比如 default / s1 / google）
→ 对应不同的密钥
→ 用途：轮换密钥时，新旧并存
```

**注意：这条记录通常有 400+ 字符，超过 255。**

```text
DNS 规定单条 TXT 字符串 ≤ 255 字符
→ 实际做法是拆成多个字符串，DNS 库会拼接
→ 大多数服务商的界面会自动处理
```

## 2.3 三种获取方式

**方式一：发信服务商给你的（最常见）**

```text
你在 Resend / SendGrid / 阿里云 后台"验证域名"
→ 它们生成密钥对，给你 3 条 DNS 记录
→ 你复制粘贴到域名管理后台
→ 它们定期检查
```

**这是最简单的方式。** 你不需要碰私钥。

**方式二：自己生成（自建 SMTP）**

```bash
# 生成 2048 位 RSA 密钥
openssl genrsa -out dkim-private.pem 2048
openssl rsa -in dkim-private.pem -pubout -out dkim-public.pem

# 提取公钥（去掉头尾，拼成一行）
grep -v "PUBLIC KEY" dkim-public.pem | tr -d '\n'
```

**然后：**

```text
privkey  → 给 nodemailer 的 dkim 配置
公钥     → 发到 DNS
```

```javascript
// notify/mailer.js 加 DKIM
transporter = nodemailer.createTransport({
  host, port, secure, auth,
  dkim: {
    domainName: "yourdomain.com",
    keySelector: "s1",
    privateKey: fs.readFileSync("./dkim-private.pem", "utf8"),
  },
});
```

**方式三：服务商 API 自动配（部分支持）**

**大多数不支持，需要手动加 DNS。**

## 2.4 验证

```bash
# 先看有没有记录（selector 换成你的）
nslookup -type=TXT s1._domainkey.yourdomain.com
dig TXT s1._domainkey.yourdomain.com +short
```

**期望：**

```text
"v=DKIM1; k=rsa; p=MIIBIjANBgkqh..."
```

**Node 验证：**

```javascript
// scripts/check-dns.js 加
async function checkDkim(domain, selector) {
  const name = `${selector}._domainkey.${domain}`;
  let records;
  try {
    records = await dns.resolveTxt(name);
  } catch (e) {
    return { ok: false, reason: `查询 ${name} 失败：${e.code}` };
  }

  const flat = records.map((r) => r.join(""));
  const dkim = flat.find((r) => r.includes("v=DKIM1") || r.includes("p="));

  if (!dkim) return { ok: false, reason: `${name} 里没有 DKIM 记录`, all: flat };

  const p = dkim.match(/p=([A-Za-z0-9+/=]+)/)?.[1] ?? "";
  const k = dkim.match(/k=(\w+)/)?.[1] ?? "rsa";

  const problems = [];
  if (!p) problems.push("没有 p=（公钥）");
  if (p && p.length < 100) problems.push(`公钥只有 ${p.length} 字符，太短（可能不是完整公钥）`);
  if (dkim.includes("p=;") || /p=\s*;/.test(dkim)) problems.push("p 为空（表示"此密钥已撤销"）");

  return {
    ok: problems.length === 0,
    name,
    keyType: k,
    keyLen: p.length,
    problems,
  };
}
```

```bash
node scripts/check-dns.js example.com --dkim default
```

**`example.com` 没有 DKIM 记录，所以会返回"没有 DKIM 记录" —— 这是正常的（它不发信）。**

**如果你的域名配好了，应该看到 `keyLen` 在 380–400 之间（2048 位 RSA 的 Base64 长度）。**

## 2.5 一个必须知道的事

**DKIM 只签"你指定的头部"。**

```text
默认签名：From / To / Subject / Date / Message-ID / MIME-Version / Content-Type

不签的：Received（因为每一跳都会改）
```

**所以 DKIM 通过 ≠ 内容完全没改。** 它只保证"被签名的部分没改"。

**这在实践中够用** —— 因为收件方关心的是 From/Subject/正文。

---

# 第 3 步：DMARC（30 分钟）

## 3.1 格式

```text
v=DMARC1; p=<策略>; rua=<报告地址>; ruf=<取证地址>; pct=<百分比>; sp=<子域策略>
```

**一个真实的例子：**

```text
v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100; adkim=r; aspf=r
```

**逐段：**

```text
v=DMARC1                      版本（固定）
p=none                        策略：不做处理，只观察（起步用）
p=quarantine                  策略：SPF/DKIM 都失败的邮件进隔离区（垃圾箱）
p=reject                      策略：直接拒收（最终目标）
rua=mailto:dmarc@...          聚合报告发到这里（XML，每天一封）
ruf=mailto:forensic@...       取证报告（含原始邮件，隐私敏感，多数人不启用）
pct=100                       策略应用比例（100 = 全部）
adkim=r                        DKIM 对齐模式（r=宽松 s=严格）
aspf=r                         SPF 对齐模式
```

## 3.2 三步上线法（关键）

**不要一上来就 `p=reject`。** 因为你会把"还没配好 SPF/DKIM 的合法发信源"拒掉。

```text
第 1 周：p=none
  → 不做任何处理，只收报告
  → 从报告里看出"谁在代表我的域名发信"
  → 把合法的补进 SPF/DKIM

第 3 周：p=quarantine; pct=10
  → 只对 10% 的失败邮件做隔离
  → 观察：有没有正常邮件被误隔离

第 5 周：p=quarantine; pct=100
  → 全部失败邮件隔离
  → 观察一周

第 6 周：p=reject; pct=100
  → 直接拒收（最终状态）
```

**这个渐进过程必须走 —— 跳过去会打挂你的正常邮件。**

## 3.3 "对齐"（alignment）是理解 DMARC 的关键

**DMARC 通过的条件：**

```text
SPF 通过 AND SPF 的域名与 From 的域名"对齐"
  或者
DKIM 通过 AND DKIM 的域名与 From 的域名"对齐"
```

**什么叫对齐？**

```text
From: noreply@yourdomain.com       ← 用户在邮件里看到的发件人

SPF 检查的是 "MAIL FROM"（信封发件人）：
  MAIL FROM: bounce@yourprovider.com   ← 服务商的退信地址
  → SPF 通过（因为 yourprovider.com 的 SPF 允许它）
  → 但与 From 的 yourdomain.com **不对齐** → DMARC 不通过 ❌

DKIM 签名用的是 d=yourdomain.com
  → 与 From 对齐 → DMARC 通过 ✅
```

**这就是为什么"DKIM 比 SPF 更重要"：**

```text
很多服务商用"自己的域名"做 MAIL FROM（为了处理退信）
→ SPF 通过但不与 From 对齐
→ 只有 DKIM 能与 From 对齐
→ 所以必须配 DKIM
```

**宽松（r）vs 严格（s）：**

```text
宽松：子域匹配即可（mail.yourdomain.com 与 yourdomain.com 算对齐）
严格：必须完全一致
```

**推荐宽松（`adkim=r; aspf=r`）** —— 否则你用子域发信会失败。

## 3.4 验证

```bash
nslookup -type=TXT _dmarc.yourdomain.com
dig TXT _dmarc.yourdomain.com +short
```

**期望：**

```text
"v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
```

**Node 验证：**

```javascript
// scripts/check-dns.js 加
async function checkDmarc(domain) {
  const name = `_dmarc.${domain}`;
  let records;
  try {
    records = await dns.resolveTxt(name);
  } catch (e) {
    return { ok: false, reason: `查询 ${name} 失败：${e.code}` };
  }

  const flat = records.map((r) => r.join(""));
  const r = flat.find((x) => x.startsWith("v=DMARC1"));

  if (!r) return { ok: false, reason: `${name} 里没有 DMARC 记录`, all: flat };

  const p = r.match(/p=(\w+)/)?.[1] ?? null;
  const rua = [...r.matchAll(/rua=([^;]+)/g)].map((m) => m[1].trim());
  const pct = r.match(/pct=(\d+)/)?.[1] ?? "100";
  const adkim = r.match(/adkim=(\w)/)?.[1] ?? "r";
  const aspf = r.match(/aspf=(\w)/)?.[1] ?? "r";

  const problems = [];
  if (!p) problems.push("没有 p=（策略）");
  if (!["none", "quarantine", "reject"].includes(p)) problems.push(`p=${p} 不合法`);
  if (!rua.length) problems.push("没有 rua=（收不到报告，等于闭眼）");
  if (r.length > 255) problems.push(`记录 ${r.length} 字符，超过 255`);

  return {
    ok: problems.length === 0,
    record: r,
    policy: p,
    rua,
    pct: Number(pct),
    alignment: { dkim: adkim, spf: aspf },
    problems,
  };
}
```

## 3.5 一个必须理解的事：报告是 XML

**`rua` 收到的聚合报告，是 XML 附件（通常压缩成 .gz）。**

**它长这样：**

```xml
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <date_range><begin>1763337600</begin><end>1763423999</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>yourdomain.com</domain>
    <adkim>r</adkim><aspf>r</aspf>
    <p>none</p><pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>203.0.113.10</source_ip>
      <count>245</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim><spf>fail</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>yourdomain.com</header_from>
    </identifiers>
    <auth_results>
      <dkim><domain>yourdomain.com</domain><result>pass</result></dkim>
      <spf><domain>bounce.provider.com</domain><result>fail</result></spf>
    </auth_results>
  </record>
</feedback>
```

**你要读的是 `<record>` 里的：**

```text
source_ip          谁在发信
count              发了多少封
dkim / spf         各自结果
header_from        From 是什么域名
```

**如果看到"你没见过的 source_ip"，说明有人在冒用你的域名。**

**这就是 DMARC 报告的唯一价值：让你知道"谁在代表你发信"。**

---

# 第 4 步：完整验证脚本（25 分钟）

## 4.1 三条记录一起验

```javascript
// scripts/check-dns.js（完整版）
import dns from "node:dns/promises";

const args = process.argv.slice(2);
const domain = args[0] ?? "example.com";
const selector = args[args.indexOf("--dkim") + 1] || "default";

const results = {};

// ===== SPF =====
async function checkSpf(d) {
  try {
    const records = (await dns.resolveTxt(d)).map((r) => r.join(""));
    const spf = records.filter((r) => r.startsWith("v=spf1"));
    if (!spf.length) return { ok: false, problems: ["没有 SPF 记录"] };
    if (spf.length > 1) return { ok: false, problems: [`有 ${spf.length} 条 SPF（只能一条）`], records: spf };

    const r = spf[0];
    const q = r.match(/([-~+?])all\b/)?.[1] ?? null;
    const includes = [...r.matchAll(/include:(\S+)/g)].map((m) => m[1]);
    const ip4 = [...r.matchAll(/ip4:(\S+)/g)].map((m) => m[1]);

    const problems = [];
    if (!q) problems.push("没有 all 限定符");
    if (q === "+") problems.push("+all 等于不设防");
    if (q === "?") problems.push("?all 等于没表态（建议 -all 或 ~all）");
    if (r.length > 255) problems.push(`长度 ${r.length} > 255`);
    if (includes.length > 9) problems.push(`${includes.length} 个 include，可能超过 10 次查询上限`);

    return { ok: problems.length === 0, record: r, qualifier: q, includes, ip4, problems };
  } catch (e) {
    return { ok: false, problems: [`查询失败：${e.code}`] };
  }
}

// ===== DKIM =====
async function checkDkim(d, sel) {
  const name = `${sel}._domainkey.${d}`;
  try {
    const flat = (await dns.resolveTxt(name)).map((r) => r.join(""));
    const r = flat.find((x) => /v=DKIM1|p=/.test(x));
    if (!r) return { ok: false, name, problems: ["没有 DKIM 记录"] };

    const p = r.match(/p=([A-Za-z0-9+/=]+)/)?.[1] ?? "";
    const k = r.match(/k=(\w+)/)?.[1] ?? "rsa";

    const problems = [];
    if (!p) problems.push("没有 p=（公钥）");
    if (p && p.length < 100) problems.push(`公钥 ${p.length} 字符，可能不完整`);
    if (/p=(\s*);/.test(r)) problems.push("p 为空（密钥已撤销）");

    return { ok: problems.length === 0, name, keyType: k, keyLen: p.length, problems };
  } catch (e) {
    return { ok: false, name, problems: [`查询失败：${e.code}`] };
  }
}

// ===== DMARC =====
async function checkDmarc(d) {
  const name = `_dmarc.${d}`;
  try {
    const flat = (await dns.resolveTxt(name)).map((r) => r.join(""));
    const r = flat.find((x) => x.startsWith("v=DMARC1"));
    if (!r) return { ok: false, name, problems: ["没有 DMARC 记录"] };

    const p = r.match(/p=(\w+)/)?.[1] ?? null;
    const rua = [...r.matchAll(/rua=([^;]+)/g)].map((m) => m[1].trim());
    const pct = Number(r.match(/pct=(\d+)/)?.[1] ?? 100);

    const problems = [];
    if (!p) problems.push("没有 p=（策略）");
    if (!["none", "quarantine", "reject"].includes(p)) problems.push(`p=${p} 不合法`);
    if (!rua.length) problems.push("没有 rua=（收不到报告）");
    if (r.length > 255) problems.push(`长度 ${r.length} > 255`);

    return { ok: problems.length === 0, name, record: r, policy: p, rua, pct, problems };
  } catch (e) {
    return { ok: false, name, problems: [`查询失败：${e.code}`] };
  }
}

// ===== 汇总 =====
console.log(`\n检查域名：${domain}\n`);

const spf = await checkSpf(domain);
const dkim = await checkDkim(domain, selector);
const dmarc = await checkDmarc(domain);

const fmt = (name, r) => {
  console.log(`${r.ok ? "✅" : "❌"} ${name}`);
  if (r.record) console.log(`   ${r.record.slice(0, 100)}${r.record.length > 100 ? "…" : ""}`);
  if (r.name && r.name !== domain) console.log(`   ${r.name}`);
  if (r.qualifier) console.log(`   all 限定符：${r.qualifier}${r.qualifier === "-" ? "（硬失败，推荐）" : ""}`);
  if (r.keyLen) console.log(`   公钥长度：${r.keyLen} 字符（${r.keyType}）`);
  if (r.policy) console.log(`   策略：p=${r.policy}  pct=${r.pct}%  rua=${r.rua.join(",") || "无"}`);
  r.problems?.forEach((p) => console.log(`   ⚠️  ${p}`));
  console.log();
};

fmt("SPF", spf);
fmt(`DKIM（selector=${selector}）`, dkim);
fmt("DMARC", dmarc);

const allOk = spf.ok && dkim.ok && dmarc.ok;
console.log(allOk ? "✅ 三条齐全" : "❌ 至少一条有问题");

if (!allOk) {
  console.log("\n下一步：");
  if (!spf.ok)   console.log("  · 加 TXT @ \"v=spf1 include:<服务商> -all\"");
  if (!dkim.ok)  console.log(`  · 到发信服务商后台"验证域名"，它会给你 ${selector}._domainkey 的 TXT 记录`);
  if (!dmarc.ok) console.log(`  · 加 TXT _dmarc "v=DMARC1; p=none; rua=mailto:dmarc@${domain}"`);
}

process.exit(allOk ? 0 : 1);
```

## 4.2 跑它

```bash
# 检查 example.com（能跑通，因为它配了 SPF）
node scripts/check-dns.js example.com

# 检查你的域名
node scripts/check-dns.js yourdomain.com --dkim s1
```

**`example.com` 的期望输出：**

```text
检查域名：example.com

✅ SPF
   v=spf1 -all
   all 限定符：-（硬失败，推荐）

❌ DKIM（selector=default）
   default._domainkey.example.com
   ⚠️  查询失败：ENOTFOUND

❌ DMARC
   _dmarc.example.com
   ⚠️  查询失败：ENOTFOUND

❌ 至少一条有问题
```

**这是正确结果** —— `example.com` 是保留域名，只配了 SPF（表示"任何 IP 都不许代表它发信"）。

**`gmail.com` 呢？**

```bash
node scripts/check-dns.js gmail.com --dkim 20230601
```

**你应该看到三条全绿**（Gmail 的记录是教科书级的）。

**这就是"配好"的样子。**

## 4.3 一个必做的对照

**跑三个域名，看差异：**

```bash
for d in example.com gmail.com qq.com; do
  echo "===== $d ====="
  node scripts/check-dns.js "$d" 2>&1 | head -20
done
```

**你会看到：**

```text
example.com  → SPF 有（v=spf1 -all），DKIM/DMARC 没有
gmail.com    → 三条齐全
qq.com       → 三条齐全
```

**这个对照让你"看到"配置的差异。**

---

# 第 5 步：写 DNS-SETUP.md（20 分钟）

```markdown
# 发信域名认证配置

> 三条 DNS 记录。缺一条，进垃圾箱的概率翻倍。
> 验证命令：`node scripts/check-dns.js yourdomain.com --dkim s1`

## 前置

- 你有自己的域名（不要用 QQ/163/Gmail 发业务邮件）
- 你能改这个域名的 DNS（在域名注册商或 Cloudflare 后台）
- 你在用一家发信服务（Resend / SendGrid / 阿里云邮件推送 / 腾讯云 SES）

---

## 第一条：SPF

**位置**：`yourdomain.com` 的 TXT 记录

**内容**：

```
v=spf1 include:_spf.yourprovider.com -all
```

**要点**：
- 只能有**一条** SPF 记录。如果你之前已经有一条，把它合并（不是新增）
- `-all` 表示"不在列表里的 IP 一律拒收"（推荐）
- 过渡期可以用 `~all`（软失败），观察 2 周再改 `-all`
- `include:` 总数不超过 10 个（含嵌套）

**验证**：
```bash
dig TXT yourdomain.com +short | grep spf1
```

---

## 第二条：DKIM

**位置**：`s1._domainkey.yourdomain.com` 的 TXT 记录（`s1` 是 selector，各家不同）

**获取方式**：到发信服务商后台 → 域名设置 → 验证域名 → 它会给你 3 条记录（其中一条是 DKIM）

**内容示例**（实际的由服务商生成）：

```
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
```

**要点**：
- 这条记录通常 400+ 字符，超过 DNS 单条 255 字符限制
- 大多数 DNS 后台会自动拆分，不用管
- 如果你的后台报"太长"，用它的"多行 TXT"功能
- 改动后 24–48 小时全球生效

**验证**：
```bash
dig TXT s1._domainkey.yourdomain.com +short
```

**为什么 DKIM 比 SPF 更重要**：
很多服务商用"自己的域名"做 MAIL FROM（为了处理退信），导致 SPF 通过但**与 From 不对齐**，DMARC 仍然失败。只有 DKIM 能与 From 对齐。

---

## 第三条：DMARC

**位置**：`_dmarc.yourdomain.com` 的 TXT 记录

**第一阶段（第 1–2 周）**：

```
v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; pct=100; adkim=r; aspf=r
```

**作用**：不做任何处理，只收报告。用来发现"谁在代表你的域名发信"。

**第二阶段（第 3–4 周）**：

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=10; adkim=r; aspf=r
```

**作用**：10% 的失败邮件进隔离区。观察有没有正常邮件被误伤。

**第三阶段（第 5 周起）**：

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100; adkim=r; aspf=r
```

**第四阶段（确认无误后）**：

```
v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com; pct=100; adkim=r; aspf=r
```

**要点**：
- **不要一上来就 `p=reject`** —— 会打挂还没配好的合法发信源
- `rua` 必须填（否则收不到报告，等于闭眼）
- `adkim=r; aspf=r`（宽松对齐）：允许子域匹配

**验证**：
```bash
dig TXT _dmarc.yourdomain.com +short
```

---

## 一个"检查清单"

配完之后，逐条打勾：

- [ ] `dig TXT yourdomain.com` 能看到 `v=spf1`（只有一条）
- [ ] `dig TXT s1._domainkey.yourdomain.com` 能看到 `v=DKIM1`（公钥 > 300 字符）
- [ ] `dig TXT _dmarc.yourdomain.com` 能看到 `v=DMARC1`（有 `rua`）
- [ ] 发一封测试邮件到 Gmail，看原始邮件头里的 `Authentication-Results`
- [ ] 三项都是 `pass`

**怎么在 Gmail 里看原始头**：
1. 打开那封邮件
2. 右上角"更多"（三个点）→"显示原始邮件"
3. 搜索 `Authentication-Results`
4. 应该看到：
   ```
   Authentication-Results: mx.google.com;
     spf=pass smtp.mailfrom=yourdomain.com;
     dkim=pass header.i=@yourdomain.com;
     dmarc=pass header.from=yourdomain.com
   ```

---

## 常见问题

| 现象 | 原因 | 修法 |
|---|---|---|
| SPF `permerror` | 有两条 SPF 记录，或超过 10 次查询 | 合并成一条，精简 include |
| SPF `softfail` | 用了 `~all` 且 IP 不在列表 | 把你的 IP 加进 `ip4:` |
| DKIM `fail` | 私钥和公钥不匹配，或 selector 写错 | 重新生成密钥，或检查 selector |
| DKIM `none` | 邮件里没有 `DKIM-Signature` 头 | 检查发信端有没有配 DKIM |
| DMARC `fail` | SPF 和 DKIM 都没对齐 | 配 DKIM（最重要） |
| 进了垃圾箱但三项 pass | 域名信誉差 / 内容像垃圾 | 降低发送频率，改进内容，积累信誉 |

---

## 域名信誉（第三条记录之外的事）

**配好三条只是"入门"，进收件箱还要"信誉"。**

积累信誉的做法：
- 新域名先小量发（每天 < 50 封），逐步加量
- 不发给买来的地址列表
- 控制退信率 < 2%
- 控制投诉率 < 0.1%
- 保持稳定的发送量（不要今天 0 封明天 1 万封）

**新域名需要 2–4 周才能建立起基本的信誉。**
```

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **三条记录各解决什么**
- **为什么 `p=reject` 不能一上来就配**
- **为什么 DKIM 比 SPF 更重要**
- **`example.com` / `gmail.com` / `qq.com` 的对照结果**

---

# 第 7 步：课后练习

## 练习一：检查你的邮件服务商给了几条记录（20 分钟）

**去你用的服务商后台，看"域名验证"页面，数一下：**

```text
它要求你加几条 DNS 记录？
  ① TXT（SPF）
  ② TXT（DKIM）
  ③ CNAME（追踪域名）？
  ④ TXT（DMARC）
```

**为什么有的服务商要 4 条？**

**参考答案：**

```text
③ CNAME 是"点击追踪域名"（mail.yourdomain.com → 服务商的追踪服务器）
   → 用于统计"打开了"（第 159 节的 opened 状态）
   → 不是必须的
```

**但要小心：`mail.yourdomain.com` 这个子域如果配了 CNAME，就不能同时配 SPF（因为 CNAME 和 TXT 不能共存于同一名字）。**

## 练习二：算清"不配 DMARC"的风险（15 分钟）

```text
假设有人冒用你的域名发 10 万封诈骗邮件：
  ① 你的域名被列入黑名单 → 你的正常邮件也被拦
  ② 客户收到"你发的"诈骗邮件 → 你的品牌受损
  ③ 你要花多久才能恢复？
```

**参考答案：**

```text
① 从黑名单移除需要 1–4 周（提交申请 + 等各服务商更新）
② 品牌恢复更久（客户信任）
③ 期间你的注册邮件全部进垃圾箱 → 新用户无法注册
```

**DMARC 的 `p=reject` 能在 30 秒内阻止这一切。**

## 练习三：判断这个配置错在哪（15 分钟）

```text
TXT @ "v=spf1 include:a.com -all"
TXT @ "v=spf1 include:b.com -all"
TXT _dmarc "v=DMARC1; p=reject"
```

**错在哪？至少四条。**

**参考答案：**

```text
① 两条 SPF 记录 → permerror → SPF 完全失效
   → 必须合并成 "v=spf1 include:a.com include:b.com -all"

② 没有 DKIM 记录 → DMARC 只能靠 SPF 对齐
   → 但很多服务商的 MAIL FROM 是自己的域名 → 不对齐
   → DMARC 会失败

③ 一上来就 p=reject → 会把"还没配好的合法发信源"全部拒掉
   → 应该先 p=none 观察 2 周

④ DMARC 没有 rua → 收不到报告
   → 你不知道"谁在冒用你"，也不知道"哪些信被拒了"
```

**第 ① 条是最常见的致命错误。** 而且它的症状很有欺骗性：**你"加了一条 SPF"，看起来更安全了，实际上 SPF 完全失效。**

---

# 第 8 步：最终验收

## A. SPF

- [ ] 我的域名有 `v=spf1` 记录
- [ ] **只有一条**（不是两条）
- [ ] 有 `all` 限定符（`-all` 或过渡期 `~all`）
- [ ] `include:` 的个数 ≤ 10
- [ ] 记录长度 ≤ 255（或拆成多条）
- [ ] `check-dns.js` 的 SPF 部分通过

## B. DKIM

- [ ] `s1._domainkey.yourdomain.com` 有 `v=DKIM1`
- [ ] 公钥长度 > 300 字符（2048 位 RSA）
- [ ] 知道 selector 是什么（服务商给的）
- [ ] `check-dns.js` 的 DKIM 部分通过

## C. DMARC

- [ ] `_dmarc.yourdomain.com` 有 `v=DMARC1`
- [ ] 有 `p=`（none / quarantine / reject）
- [ ] **有 `rua=`**（否则收不到报告）
- [ ] `adkim=r; aspf=r`（宽松对齐）
- [ ] `check-dns.js` 的 DMARC 部分通过

## D. 三步上线

- [ ] 我理解"不能一上来就 p=reject"
- [ ] 写出了四个阶段（none → quarantine 10% → quarantine 100% → reject）
- [ ] 每个阶段的观察点

## E. 验证

- [ ] `node scripts/check-dns.js yourdomain.com --dkim s1` 三条全绿
- [ ] 跑过 `example.com`（SPF 有、DKIM/DMARC 无）
- [ ] 跑过 `gmail.com`（三条齐全）
- [ ] 发了一封测试邮件到 Gmail
- [ ] **在 Gmail 原始邮件里看到三个 `pass`**

## F. 交付物

- [ ] `DNS-SETUP.md` 写完
- [ ] 三条记录的内容可直接复制
- [ ] 有"检查清单"（5 个勾）
- [ ] 有"常见问题"表（6 条以上）
- [ ] 有"域名信誉"这一节

## G. 提交

```bash
git add -A
git commit -m "第160节：SPF/DKIM/DMARC 三条记录 + 验证脚本"
git push
```

---

## 本节课要能说出口的一句话

> **配好 SPF/DKIM/DMARC 只是"入门"。进收件箱还要域名信誉 —— 而信誉要 2–4 周才能积累。**

---

# 附：常见问题速查

**Q：我已经有一条 SPF 了，服务商让我"再加一条"，怎么办？**

A：**绝对不要加第二条。**

```text
两条 SPF 记录 → permerror → 所有 SPF 验证都失败
→ 比"没有 SPF"更糟
```

**正确做法：把新的 `include:` 合并进已有的那条。**

```text
已有：v=spf1 include:a.com -all
新的：v=spf1 include:b.com -all
合并：v=spf1 include:a.com include:b.com -all
```

**Q：DKIM 记录太长，后台报"超过 255 字符"？**

A：**用"多行 TXT"或"拆成两段"。**

```text
大多数 DNS 后台支持：
  v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
  （如果超长，后台会自动拆分，或者提供"分成多条字符串"的输入方式）
```

**Cloudflare 会自动处理。阿里云/腾讯云的 DNS 也支持。**

**如果实在不行 → 改用 1024 位密钥（公钥短一半，但安全性降低）。**

**Q：DMARC 报告收不到？**

A：**三个原因：**

```text
① rua 没填（最常见）
② 邮箱地址写错
③ 报告是每天一封，且可能进垃圾箱（发件人是 noreply-dmarc-support@google.com，容易被自己的过滤器拦）
```

**检查方法：搜一下 `dmarc@yourdomain.com` 的收件箱，或者配一个专门的转发规则。**

**Q：`p=none` 会不会"没有保护作用"？**

A：**对"阻止冒用"没有作用，但对"发现问题"有作用。**

```text
p=none  → 冒用邮件照样进收件箱
        → 但你每天收到报告，知道"谁在冒用"
        → 用它来"发现并修复合法发信源"
```

**所以 `p=none` 是"必经阶段"，不是"最终状态"。**

**Q：我能不能只配 DKIM 不配 SPF？**

A：**技术上能，但会限制你的发信能力。**

```text
DMARC 通过的条件：SPF 对齐 OR DKIM 对齐
→ 只有 DKIM 也能通过 DMARC
→ 但很多收件方（尤其是企业邮箱）会单独检查 SPF
→ 没有 SPF 会被扣分
```

**三条都配，是成本最低的选择。**

**Q：新域名发多少封算"安全"？**

A：**行业经验值：**

```text
第 1 周：每天 < 50 封
第 2 周：每天 < 200 封
第 3 周：每天 < 500 封
第 4 周起：逐步加量，观察退信/投诉率
```

**突然从 0 跳到 1 万封是"垃圾邮件特征"** → 会被限流或直接拦。

**Q：为什么 `Authentication-Results` 只在"收到的邮件"里？**

A：**因为那是收件方写的。**

```text
你发信 → 头部里没有验证结果（你没法自己证明自己）
收件方收到 → 它去查你的 DNS → 验证 → 把结果写进 Authentication-Results
```

**所以你必须"真的收到一封邮件"才能看到验证结果 —— 这是第 155 节假 SMTP 存在的更深层理由。**
