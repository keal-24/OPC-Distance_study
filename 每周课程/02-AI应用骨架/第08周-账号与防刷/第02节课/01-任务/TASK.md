# 第 51 节课：密码安全——哈希不是加密，找回密码只能重置

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你存了哈希。但你可能还没搞清：**这个哈希到底安全在哪、多长的密码算够、被人拖库了会怎样。**
> 今天把这几件事全部实测一遍。

**建议用时**：130 分钟
**你需要先完成**：第 50 节课（`users` 表有数据，哈希长度 60）

---

# 第 0 步：先分清三个词（10 分钟）

## 0.1 编码 / 加密 / 哈希

**这三个词天天被混用，但它们是三件完全不同的事。**

| 词 | 能否还原 | 例子 | 用途 |
|---|---|---|---|
| **编码** | 能（不需要密钥） | Base64、URL 编码 | 传输、存储格式转换 |
| **加密** | 能（需要密钥） | AES、RSA | 需要还原的敏感数据（比如身份证号） |
| **哈希** | **不能** | bcrypt、SHA-256 | 密码、文件指纹 |

**一个必须记住的判断：**

```text
如果某段数据"以后需要原样取出来用" → 加密
如果只需要"验证是否一致"          → 哈希
```

**密码属于第二类。** 你永远不需要知道用户的密码原文，只需要验证"他输入的和当初设的一样"。

## 0.2 Base64 不是加密

**有人看到 JWT 是 `eyJhbGci...` 这种乱码，就以为"加密了"。**

**不是。它是 Base64 编码。**

```text
node -e "console.log(Buffer.from('{\"password\":\"123456\"}').toString('base64'))"
→ eyJwYXNzd29yZCI6IjEyMzQ1NiJ9

node -e "console.log(Buffer.from('eyJwYXNzd29yZCI6IjEyMzQ1NiJ9','base64').toString())"
→ {"password":"123456"}
```

**两行就还原了。** 编码不是安全措施。

**这就是为什么第 52 节你会学到：JWT 的 payload 里不能放敏感信息。**

## 0.3 那"哈希 + 盐"呢

**纯哈希有个致命问题：同样的密码，哈希值一样。**

```text
用户 A 密码 123456 → 哈希 $2a$10$abc...
用户 B 密码 123456 → 哈希 $2a$10$abc...   ← 一样！
```

**攻击者做一张"彩虹表"（常见密码的哈希预计算表），一查就能反推。**

**解法：加盐（salt）。**

```text
给每个用户一个随机的盐，拼进密码再哈希
用户 A：hash("123456" + salt_A) → 完全不同的哈希
用户 B：hash("123456" + salt_B) → 完全不同的哈希
```

**bcrypt 自动做了这件事。** 每个哈希里都嵌着盐：

```text
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
 ││ │└──────┬──────┘└──────────────┬─────────────┘
 ││ │       │                      └─ 哈希值（31 字符）
 ││ │       └─ 盐（22 字符，随机生成）
 ││ └─ 成本因子（10，即 2^10 轮）
 │└─ bcrypt 版本（2a = 原始版本）
 └─ 分隔符 $
```

**这就是为什么"同一个密码在 bcrypt 里哈希不同"——盐不一样。**

**你不需要自己加盐。** bcrypt 的 `hash()` 每次自动生成新盐。

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/password.js` | `src/` | 强度校验、长度按字节算 |
| `src/users.js` | `src/` | 改：密码重置、改密码 |
| `experiments/e02-hash.js` | `experiments/` | bcrypt 成本实测 |
| `experiments/e02-crack.js` | `experiments/` | 弱密码撞击演示 |
| `src/app.js` | `src/` | 加 `/api/password/strength`、`/api/password/reset` |

---

# 第 1 步：实测 bcrypt 的成本（30 分钟）

## 1.1 为什么要测

**`BCRYPT_ROUNDS = 10` 这个数字，你是抄来的还是算出来的？**

**今天自己测，你就知道为什么是 10。**

## 1.2 新建 `experiments/e02-hash.js`

```javascript
import bcrypt from "bcryptjs";

const run = async (rounds, times = 5) => {
  const durations = [];

  for (let i = 0; i < times; i += 1) {
    const started = process.hrtime.bigint();
    await bcrypt.hash("test-password-123", rounds);
    const ended = process.hrtime.bigint();
    durations.push(Number(ended - started) / 1e6);
  }

  durations.sort((a, b) => a - b);

  return {
    rounds,
    min: durations[0],
    median: durations[Math.floor(times / 2)],
    max: durations[durations.length - 1],
  };
};

const main = async () => {
  const results = [];

  for (const rounds of [4, 6, 8, 10, 12, 14]) {
    const result = await run(rounds);
    results.push(result);

    console.log(
      `rounds=${String(rounds).padStart(2)}　` +
        `中位 ${result.median.toFixed(1)}ms　` +
        `最慢 ${result.max.toFixed(1)}ms`
    );
  }

  console.log("\n===== 对比表 =====");
  console.table(
    results.map((item) => ({
      轮数: item.rounds,
      计算次数: `2^${item.rounds} = ${Math.pow(2, item.rounds)}`,
      中位耗时: `${item.median.toFixed(1)}ms`,
      最慢: `${item.max.toFixed(1)}ms`,
    }))
  );

  // 关键推算：攻击者每秒能试多少个密码
  console.log("\n===== 攻击者视角（单核 CPU）=====");
  results.forEach((item) => {
    const secondsPerHash = item.median / 1000;
    const perSecond = 1 / secondsPerHash;
    console.log(
      `rounds=${item.rounds}：单核每秒约 ${perSecond.toFixed(0)} 次，` +
        `试完 100 万个常见密码需要 ${(1e6 / perSecond / 3600).toFixed(1)} 小时`
    );
  });
};

main().catch((error) => {
  console.error("跑挂了：", error.message);
  process.exitCode = 1;
});
```

**这是纯本地计算，不联网，不花钱。**

**加脚本：**

```json
    "e02:hash": "node experiments/e02-hash.js"
```

**跑：**

```text
npm run e02:hash
```

## 1.3 你要从结果里得出的三个结论

### 结论一：轮数每加 1，耗时翻倍

```text
rounds=8   约 25ms
rounds=10  约 100ms
rounds=12  约 400ms
```

**因为 2^8 = 256 次，2^10 = 1024 次，2^12 = 4096 次。**

**这就是"成本因子"的含义：不是"难度"，是"计算次数"。**

### 结论二：`10` 是"用户能忍"和"攻击者够痛"的平衡点

**你的登录接口要跑一次哈希：**

```text
rounds=10 → 100ms → 用户完全感觉不到
rounds=12 → 400ms → 开始能感觉到
rounds=14 → 1.6s   → 用户会抱怨
```

**攻击者要跑上百万次：**

```text
rounds=10 → 每次 100ms → 单核 10 次/秒 → 100 万次要 27 小时
rounds=8  → 每次 25ms  → 单核 40 次/秒 → 100 万次要 7 小时
```

**注意：攻击者用 GPU 会快 100-1000 倍。** 但 bcrypt 是"内存硬"的算法，GPU 加速效果远不如 SHA-256。**这就是为什么密码要用 bcrypt，不用 SHA-256。**

**第 2 步会实测这个差别。**

### 结论三：你的机器决定具体数字

**在慢的云服务器（1 核 1G）上，`rounds=10` 可能要 200-300ms。**

**所以在服务器上再测一遍。**

**规则：`rounds` 调到"单次哈希 100-250ms"的那个值。**

## 1.4 记录你的数字

**在 `NOTES.md` 里写：**

```text
我的机器：
rounds=10 耗时：___ ms
rounds=12 耗时：___ ms
我选的 rounds：___
理由：___
```

---

# 第 2 步：为什么不能用 SHA-256（25 分钟）

## 2.1 一个必须亲眼看到的对比

**新建 `experiments/e02-crack.js`：**

```javascript
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const TARGET_PASSWORD = "123456";

// 一个"常见密码字典"（真实攻击者会用几十 GB 的字典，这里取最典型的）
const DICTIONARY = [
  "123456", "password", "12345678", "qwerty", "123456789",
  "12345", "1234", "111111", "1234567", "dragon",
  "123123", "abc123", "000000", "iloveyou", "1234567890",
  "test1234", "admin", "letmein", "welcome", "monkey",
  "password1", "qwerty123", "123qwe", "888888", "666666",
];

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

const main = async () => {
  console.log("=== 实验一：SHA-256 撞字典 ===\n");

  const targetSha = sha256(TARGET_PASSWORD);
  console.log(`目标密码：${TARGET_PASSWORD}`);
  console.log(`SHA-256：${targetSha}`);
  console.log(`哈希长度：${targetSha.length}\n`);

  const t1 = Date.now();

  for (const candidate of DICTIONARY) {
    if (sha256(candidate) === targetSha) {
      console.log(`✅ 命中：${candidate}（用时 ${Date.now() - t1}ms）`);
      break;
    }
  }

  // 真实攻击者的速度
  const shaSpeedTest = Date.now();
  for (let i = 0; i < 100000; i += 1) sha256(`candidate-${i}`);
  const shaPerSec = 100000 / ((Date.now() - shaSpeedTest) / 1000);

  console.log(`\nSHA-256 单核速度：约 ${Math.round(shaPerSec).toLocaleString()} 次/秒`);
  console.log(`25 个常见密码：${(25 / shaPerSec * 1000).toFixed(3)}ms`);
  console.log(`100 万个密码：${(1e6 / shaPerSec / 60).toFixed(1)} 分钟`);

  console.log("\n=== 实验二：bcrypt 撞同一个字典 ===\n");

  const targetHash = await bcrypt.hash(TARGET_PASSWORD, 10);
  console.log(`bcrypt 哈希：${targetHash}`);
  console.log(`哈希长度：${targetHash.length}\n`);

  const t2 = Date.now();
  let attempts = 0;

  for (const candidate of DICTIONARY) {
    attempts += 1;
    const match = await bcrypt.compare(candidate, targetHash);

    if (match) {
      console.log(`✅ 命中：${candidate}（试了 ${attempts} 次，用时 ${Date.now() - t2}ms）`);
      break;
    }
  }

  const bcryptPerSec = attempts / ((Date.now() - t2) / 1000);

  console.log(`\nbcrypt 单核速度：约 ${bcryptPerSec.toFixed(1)} 次/秒`);
  console.log(`100 万个密码：${(1e6 / bcryptPerSec / 3600).toFixed(1)} 小时`);

  console.log("\n===== 对比 =====");
  console.log(`SHA-256：${Math.round(shaPerSec).toLocaleString()} 次/秒`);
  console.log(`bcrypt ：${bcryptPerSec.toFixed(1)} 次/秒`);
  console.log(`慢 ${Math.round(shaPerSec / bcryptPerSec).toLocaleString()} 倍`);
};

main().catch((error) => {
  console.error("跑挂了：", error.message);
  process.exitCode = 1;
});
```

**加脚本：**

```json
    "e02:crack": "node experiments/e02-crack.js"
```

**跑：**

```text
npm run e02:crack
```

## 2.2 你会看到的数字

```text
SHA-256 单核速度：约 800,000 次/秒
bcrypt 单核速度：约 10 次/秒
慢 80,000 倍
```

**80,000 倍。**

**这就是本节的核心数字。**

**为什么差这么多：**

```text
SHA-256 是"快速哈希"，设计目标就是"算得快"（用于文件校验、签名）
bcrypt 是"慢速哈希"，设计目标就是"算得慢"（用于密码）
```

**用 SHA-256 存密码，等于用一个"专门优化过让你破解得更快"的算法。**

## 2.3 一个常见的错误说法

**"我在 SHA-256 上加了盐，应该够了吧？"**

**不够。**

**盐解决的是"彩虹表"问题（同样的密码哈希不同）。**

**但它不解决"速度"问题。** 加了盐的 SHA-256 依然是 80 万次/秒。

**攻击者拿到你的库（含盐），可以：**

```text
对每个用户：用他的盐 + 字典里的 100 万个密码，逐个算 SHA-256
单核 80 万次/秒 → 100 万个密码只要 1.25 秒
1000 个用户 → 21 分钟
```

**换成 bcrypt：**

```text
100 万个密码 × 100ms = 27 小时（一个用户）
1000 个用户 → 3 年
```

**这就是"慢"的价值。**

**结论：密码必须用专门的"慢哈希"（bcrypt / scrypt / argon2），不能用 SHA / MD5。**

## 2.4 一个必须知道的现实

**bcrypt 的 72 字节限制。**

**已经在上节课提过，今天要实测：**

**在 `e02-hash.js` 里加一段：**

```javascript
const longA = "a".repeat(72) + "X";
const longB = "a".repeat(72) + "Y";

const hashA = await bcrypt.hash(longA, 10);

console.log("\n=== 72 字节截断实验 ===");
console.log(`密码 A：72 个 a + X`);
console.log(`密码 B：72 个 a + Y`);
console.log(`A 的哈希能否验证 B：${await bcrypt.compare(longB, hashA)}`);
```

**输出会是 `true`。**

**因为 bcrypt 只看前 72 字节，`X` 和 `Y` 都在第 73 位，被忽略了。**

**后果：**

```text
用户设了 100 位密码，后 28 位完全无效
他以为很安全，实际只要前 72 位对上就能登录
```

**更危险的场景：**

```text
用户用"密码管理器生成的 80 位随机串"
前 72 位被存，后 8 位丢失
换密码管理器重新生成时，他以为密码变了，实际前半段一样就能登
```

**处理：明确拒绝超长密码，或用 SHA-256 预哈希再 bcrypt。**

**下一节做。**

---

# 第 3 步：写密码强度规则（30 分钟）

## 3.1 先破除一个误区

**"密码必须包含大写、小写、数字、符号" —— 这条规则已经被证明是错的。**

**NIST（美国国家标准与技术研究院）2024 年的建议明确说：**

```text
❌ 不要强制组合规则（大小写数字符号）
❌ 不要强制定期更换
❌ 不要用"安全问题"
✅ 要求最小长度（8 位起，建议 12）
✅ 检查是否在"已泄露密码库"里
✅ 允许任意字符（包括空格、中文、emoji）
```

**为什么强制组合规则是错的：**

```text
"Password1!" 满足所有规则，但它在所有字典里排前 100
"correct horse battery staple" 不满足任何组合规则，但极难破解
```

**组合规则会让人用"可预测的变形"（Password1、Password2、Password3），实际更不安全。**

**所以今天不写组合规则。**

## 3.2 新建 `src/password.js`

```javascript
import crypto from "node:crypto";
import { CONFIG } from "./config.js";

const MIN_LENGTH = CONFIG.limits.passwordMinLength;   // 8
const BCRYPT_MAX_BYTES = 72;

// 最常见的弱密码（真实项目用 1 万条以上，或调用 HIBP API）
const COMMON_PASSWORDS = new Set([
  "123456", "password", "12345678", "qwerty", "123456789",
  "12345", "1234", "111111", "1234567", "dragon",
  "123123", "abc123", "000000", "iloveyou", "1234567890",
  "test1234", "admin", "letmein", "welcome", "monkey",
  "password1", "qwerty123", "123qwe", "888888", "666666",
  "woaini", "5201314", "a123456", "123456a", "qwe123",
]);

export const byteLength = (text) => Buffer.byteLength(String(text ?? ""), "utf8");

/**
 * 校验密码。返回 { ok, errors[], warnings[], score }
 * errors 非空 → 拒绝
 * warnings 非空 → 接受但提示
 */
export const checkPassword = (password) => {
  const value = String(password ?? "");
  const errors = [];
  const warnings = [];

  if (value.length === 0) {
    errors.push("密码不能为空");
    return { ok: false, errors, warnings, score: 0 };
  }

  const bytes = byteLength(value);

  if (value.length < MIN_LENGTH) {
    errors.push(`密码至少 ${MIN_LENGTH} 个字符`);
  }

  // 按字节判断 bcrypt 的上限，不是按字符
  if (bytes > BCRYPT_MAX_BYTES) {
    errors.push(`密码太长（${bytes} 字节，上限 ${BCRYPT_MAX_BYTES} 字节）`);
  }

  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    errors.push("这个密码在常见密码库里，换个别的");
  }

  // 全是一个字符
  if (/^(.)\1+$/.test(value)) {
    errors.push("密码不能是同一个字符重复");
  }

  // 连续数字/字母（12345678、abcdefgh）
  if (isSequential(value)) {
    errors.push("密码不能是连续字符");
  }

  // 包含邮箱的本地部分（在注册时检查，这里只提示）
  if (/\s/.test(value)) {
    warnings.push("密码里有空格，注意别多输漏输");
  }

  const score = estimateStrength(value);

  return { ok: errors.length === 0, errors, warnings, score, bytes };
};

const isSequential = (value) => {
  if (value.length < 4) return false;

  let ascending = 0;
  let descending = 0;

  for (let i = 1; i < value.length; i += 1) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (diff === 1) ascending += 1;
    if (diff === -1) descending += 1;
  }

  return ascending >= value.length - 1 || descending >= value.length - 1;
};

/**
 * 粗略估算强度（0-100）。不是精确熵值，够用来给用户反馈。
 */
export const estimateStrength = (password) => {
  const value = String(password ?? "");
  if (value.length === 0) return 0;

  let score = 0;

  // 长度贡献（最多 50 分）
  score += Math.min(50, value.length * 4);

  // 字符种类贡献（最多 30 分）
  const kinds = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^a-zA-Z0-9]/.test(value),
  ].filter(Boolean).length;

  score += kinds * 7.5;

  // 惩罚项
  if (COMMON_PASSWORDS.has(value.toLowerCase())) score -= 40;
  if (/^(.)\1+$/.test(value)) score -= 30;
  if (isSequential(value)) score -= 25;
  if (/^[a-z]+\d{1,4}$/i.test(value)) score -= 15;   // 单词+少量数字

  return Math.max(0, Math.min(100, Math.round(score)));
};

/**
 * 预哈希：解决 bcrypt 72 字节限制
 * 对超长密码先做 SHA-256（产出固定 64 字符 hex），再交给 bcrypt
 */
export const prehashIfNeeded = (password) => {
  const value = String(password ?? "");

  if (byteLength(value) <= BCRYPT_MAX_BYTES) return value;

  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
};
```

## 3.3 五个关键设计

### 设计一：不强制字符组合

**只要求长度 + 不在常见库里 + 不是重复/连续。**

**理由见 3.1。**

**这样用户能用"correct horse battery staple"这种长短语，既好记又安全。**

### 设计二：`errors` 和 `warnings` 分开

```javascript
errors   → 拒绝（密码不能用）
warnings → 接受但提示（"注意别多输空格"）
```

**为什么：**

**密码里有空格是合法的（而且推荐），但用户可能是不小心。</strong>

**给提示但不拦截，是"尊重用户 + 帮他避免麻烦"的平衡。**

### 设计三：`score` 只用来"显示"

**不是用来"拦截"的。**

```text
score 20 但通过了 errors → 允许注册，只是显示"弱"
```

**为什么：**

**分数是启发式的，不准。** 用分数拦截会误伤（比如 `"xkj29fks!a"` 这种看起来随机但分数不高的）。

**用明确的规则拦截（长度、常见库），用分数提示。**

### 设计四：`isSequential` 要同时检查升序和降序

```javascript
if (diff === 1) ascending += 1;
if (diff === -1) descending += 1;
```

**只检查升序，`87654321` 就漏了。**

### 设计五：`prehashIfNeeded`

**解决 72 字节限制的两个方案：**

```text
方案 A：拒绝超过 72 字节的密码（简单，但限制用户）
方案 B：先用 SHA-256 压缩，再交给 bcrypt（推荐）
```

**方案 B 的做法：**

```javascript
if (bytes > 72) return `sha256:${sha256(password)}`;
```

**注意加了 `sha256:` 前缀。**

**为什么：**

```text
用户在 72 字节边界上，可能恰好某个密码本身就是 "sha256:xxxx" 格式
加前缀能保证"预处理过的"和"没预处理的"永远不会撞
```

**这个细节很小，但它是"设计上的洁癖"——正常项目里几乎不会撞，但不撞比担心好。**

**注意：你不能"有时预哈希有时不预哈希"。**

**同一个用户每次登录，走的分支必须一致。**

**因为 `prehashIfNeeded` 是基于密码长度判断的，同一个密码每次结果一样，所以安全。**

---

# 第 4 步：改进 `users.js`（25 分钟）

## 4.1 加密码重置

**真实的"找回密码"流程：**

```text
① 用户输入邮箱
② 生成一个随机 token（不是验证码，是长随机串）
③ 存 token 的哈希 + 过期时间
④ 发邮件（假邮件：打印到控制台）
⑤ 用户点链接 → 带 token 访问重置页
⑥ 后端校验 token → 允许设新密码
⑦ 用掉就删
```

**为什么存 token 的哈希，不存 token 原文：**

**和密码同理。** 你的数据库泄露了，攻击者拿到 token 就能改所有人的密码。

**新建一个表：**

```javascript
// 加到 db.js 的 migrations 里
{
  version: "002_create_reset_tokens",
  sql: `
    CREATE TABLE reset_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      token_hash TEXT    NOT NULL UNIQUE,
      expires_at TEXT    NOT NULL,
      used_at    TEXT,
      created_at TEXT    NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_reset_token_hash ON reset_tokens(token_hash);
    CREATE INDEX idx_reset_user ON reset_tokens(user_id);
  `,
}
```

**注意 `ON DELETE CASCADE`：删用户时自动删他的 token。**

**这就是 2.3 里 `PRAGMA foreign_keys = ON` 的用处。** 不开这个，删用户后会留下孤儿 token。

**在 `users.js` 里加：**

```javascript
import crypto from "node:crypto";
import { prehashIfNeeded, checkPassword } from "./password.js";

const RESET_TTL_MINUTES = 30;

export const createResetToken = async (email) => {
  const user = findByEmail(email);

  // 关键：即使邮箱不存在，也要返回一个"看起来正常"的结果
  // 否则又成了"用户枚举"
  if (!user) {
    return { ok: true, token: null, note: "如果没有这个邮箱，就不会收到邮件" };
  }

  // 生成 32 字节随机 = 64 位 hex，暴力猜的概率为 0
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000);

  // 先作废这个用户所有未用的 token（防止多封邮件都能用）
  db.prepare("UPDATE reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(
    now.toISOString(),
    user.id
  );

  db.prepare(
    `INSERT INTO reset_tokens (user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(user.id, tokenHash, expiresAt.toISOString(), now.toISOString());

  return { ok: true, token, resetUrl: `/reset.html?token=${token}` };
};

export const consumeResetToken = async (token, newPassword) => {
  const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");

  const row = db
    .prepare("SELECT * FROM reset_tokens WHERE token_hash = ? AND used_at IS NULL")
    .get(tokenHash);

  if (!row) return { ok: false, reason: "INVALID" };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }

  const check = checkPassword(newPassword);

  if (!check.ok) {
    return { ok: false, reason: "WEAK_PASSWORD", errors: check.errors };
  }

  const hash = await hashPassword(prehashIfNeeded(newPassword));
  const now = new Date().toISOString();

  db.exec("BEGIN");

  try {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      hash,
      now,
      row.user_id
    );

    db.prepare("UPDATE reset_tokens SET used_at = ? WHERE id = ?").run(now, row.id);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { ok: true, userId: row.user_id };
};

export const changePassword = async (userId, oldPassword, newPassword) => {
  const user = findById(userId);

  if (!user) return { ok: false, reason: "NO_USER" };

  const match = await bcrypt.compare(prehashIfNeeded(oldPassword), user.password_hash);

  if (!match) return { ok: false, reason: "WRONG_OLD" };

  const check = checkPassword(newPassword);

  if (!check.ok) return { ok: false, reason: "WEAK_PASSWORD", errors: check.errors };

  const hash = await hashPassword(prehashIfNeeded(newPassword));

  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    hash,
    new Date().toISOString(),
    userId
  );

  return { ok: true };
};
```

## 4.2 四个关键设计

### 设计一：改密码要验证旧密码

**为什么：**

```text
用户的会话被劫持（比如他在网吧忘了登出）
攻击者能改密码 → 真用户被锁在外面
```

**要求旧密码，攻击者就改不了（除非他知道密码）。**

**这也是"改密码"和"重置密码"的区别：**

```text
改密码 → 已登录 + 知道旧密码
重置密码 → 未登录 + 能访问邮箱
```

### 设计二：重置 token 一次性

```javascript
db.prepare("UPDATE reset_tokens SET used_at = ? WHERE id = ?").run(now, row.id);
```

**不标记，同一个链接能反复用。**

**如果用户把链接转发到群里，任何人都能改他的密码。**

### 设计三：新申请 token 时作废旧的

```javascript
db.prepare("UPDATE reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(...);
```

**为什么：**

```text
用户点了 3 次"重新发送"
如果三个 token 都有效，攻击者猜中任何一个都行
作废旧的是"只保留最新一个有效链接"
```

### 设计四：整个"改密码+标记token"包在事务里

**如果改密码成功但标记 token 失败，同一个链接还能用第二次。**

**事务保证"要么都做，要么都不做"。**

---

# 第 5 步：加两个接口（15 分钟）

**在 `app.js` 里加：**

```javascript
import { checkPassword } from "./password.js";
import { createResetToken, consumeResetToken } from "./users.js";

app.post("/api/password/strength", (req, res) => {
  const { password } = req.body ?? {};
  const result = checkPassword(password);

  res.json({
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    score: result.score,
    bytes: result.bytes,
  });
});

app.post("/api/password/forgot", async (req, res) => {
  const { email } = req.body ?? {};

  if (typeof email !== "string" || !isValidEmail(email)) {
    return res.status(400).json({ error: "邮箱格式不正确" });
  }

  const result = await createResetToken(email);

  // 假邮件：开发环境打印到控制台
  if (result.token && CONFIG.env === "development") {
    console.log("\n===== 假邮件 =====");
    console.log(`收件人：${email}`);
    console.log(`主题：重置你的密码`);
    console.log(`链接：http://localhost:${CONFIG.port}${result.resetUrl}`);
    console.log(`有效期：30 分钟`);
    console.log("==================\n");
  }

  // 无论邮箱是否存在，都返回同样的话
  res.json({ message: "如果该邮箱已注册，你会收到重置邮件" });
});

app.post("/api/password/reset", async (req, res) => {
  const { token, password } = req.body ?? {};

  if (typeof token !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "参数不正确" });
  }

  const result = await consumeResetToken(token, password);

  if (!result.ok) {
    const messages = {
      INVALID: "链接无效或已使用",
      EXPIRED: "链接已过期，请重新申请",
      WEAK_PASSWORD: result.errors?.join("；") || "密码不符合要求",
    };

    return res.status(400).json({ error: messages[result.reason] || "重置失败" });
  }

  res.json({ message: "密码已重置，请用新密码登录" });
});
```

## 5.1 测试完整流程

**1. 启动：**

```text
npm run dev
```

**2. 申请重置：**

```text
curl.exe -X POST http://localhost:4030/api/password/forgot -H "Content-Type: application/json" -d "{\"email\":\"test1@example.com\"}"
```

**看终端，会打印出假邮件，里面有 `?token=...`。**

**3. 复制 token，重置密码：**

```text
curl.exe -X POST http://localhost:4030/api/password/reset -H "Content-Type: application/json" -d "{\"token\":\"粘贴token\",\"password\":\"newpass12345\"}"
```

**4. 再用同一个 token 试一次：**

**应该返回"链接无效或已使用"。**

**这就是"一次性"生效了。**

**5. 申请一个不存在的邮箱：**

```text
curl.exe -X POST http://localhost:4030/api/password/forgot -H "Content-Type: application/json" -d "{\"email\":\"nobody@example.com\"}"
```

**返回的话完全一样（"如果该邮箱已注册……"），但终端不会打印假邮件。**

**这就是"不泄露存在性"。**

---

# 第 6 步：五个必须知道的坑（15 分钟）

## 坑 1：用 `Math.random()` 生成 token

```javascript
const token = Math.random().toString(36).slice(2);   // 错
```

**`Math.random()` 是伪随机，可预测。**

**攻击者知道几个输出，能推算出你的种子和后续输出。**

**必须用 `crypto.randomBytes()`：**

```javascript
const token = crypto.randomBytes(32).toString("hex");   // 对
```

**32 字节 = 256 bit 熵 = 2^256 种可能。** 暴力猜的概率是 0。

**规则：任何"安全相关"的随机数，用 `crypto.randomBytes()`，不用 `Math.random()`。**

## 坑 2：token 存原文

```javascript
db.prepare("INSERT INTO reset_tokens (token) VALUES (?)").run(token);   // 错
```

**你的库被拖走，攻击者能改所有人的密码。**

**必须存哈希：**

```javascript
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
```

**为什么这里用 SHA-256 而不是 bcrypt：**

```text
token 是 32 字节随机串，熵足够高（不像密码是"人脑想出来的"）
攻击者无法通过字典穷举它
所以不需要"慢哈希"
用 SHA-256 是"够用且快"（重置接口要快）
```

**这是重要的区别：bcrypt 是防"弱密码"的，SHA-256 是防"token 泄露"的。两者目的不同。**

## 坑 3：重置后不失效所有会话

```javascript
// 只改了密码，没动 token
db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
```

**问题：**

```text
用户发现账号被盗 → 重置密码
但攻击者的 JWT 还有效（7 天）→ 继续能访问
```

**正确做法：加一个 `token_version` 字段。**

```sql
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;
```

**JWT 里放 `ver`。每次校验时比对 `payload.ver === user.token_version`。**

**改密码时 `token_version += 1`，所有旧 token 立即失效。**

**这个设计第 52 节会用上。今天先把字段加上：**

```javascript
{
  version: "003_add_token_version",
  sql: `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;`,
}
```

## 坑 4：错误信息区分"用户不存在"和"密码错误"

```javascript
if (!user) return res.status(401).json({ error: "用户不存在" });     // 错
if (!match) return res.status(401).json({ error: "密码错误" });      // 错
```

**两句不同的错误，等于告诉攻击者"这个邮箱存在"。**

**正确做法：统一返回"邮箱或密码错误"。**

**第 52 节写登录时会做。**

## 坑 5：计时攻击

**即使你返回的话一样，如果"用户不存在"时秒回、"密码错误"时 100ms 后回，攻击者能从响应时间推断。**

```javascript
if (!user) return res.status(401).json({ error: "邮箱或密码错误" });   // 0ms
const match = await bcrypt.compare(password, user.password_hash);       // 100ms
if (!match) return res.status(401).json({ error: "邮箱或密码错误" });   // 100ms
```

**时间差暴露了用户是否存在。**

**修法：用户不存在时，也跑一次假的哈希比对：**

```javascript
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

if (!user) {
  await bcrypt.compare(password, DUMMY_HASH);   // 消耗同样的时间
  return res.status(401).json({ error: "邮箱或密码错误" });
}
```

**这就是"恒定时间"（constant time）处理。**

**这一条很细，但真实的安全审计会查它。**

---

# 第 7 步：故意做四个实验（10 分钟）

## 实验 1：把 `rounds` 改成 4

**跑 `e02:hash` 和 `e02:crack`。**

**看 bcrypt 的每秒次数从 10 涨到多少。**

**你会发现安全性大幅下降。**

**改回 10。**

## 实验 2：用 SHA-256 存密码（临时）

**把 `hashPassword` 改成 `crypto.createHash("sha256").update(p).digest("hex")`。**

**注册一个用户，跑 `peek.js`。**

**看哈希长度从 60 变成 64，而且没有盐（同一个密码两次注册，哈希一样）。**

**这个实验让你理解"没有盐"意味着什么。**

**改回来。**

## 实验 3：重置 token 用两次

**走一遍重置流程，然后用同一个 token 再试一次。**

**应该失败。如果成功，说明你的 `used_at` 没更新。**

## 实验 4：超长密码

**注册一个 100 字节的密码（`"a".repeat(100)`）。**

**应该被 `checkPassword` 拒绝（超过 72 字节）。**

**然后把 `prehashIfNeeded` 接上，看能不能通过。**

**注意：接上 `prehashIfNeeded` 之后，`checkPassword` 里的 72 字节检查要不要保留？**

**答案：保留。**

**为什么：**

```text
prehashIfNeeded 是"技术兼容"方案
checkPassword 的 72 字节限制是"产品决策"
```

**你可以选择：**

```text
A. 允许超长密码（用 prehash）+ 去掉 checkPassword 的 72 限制
B. 不允许超长密码（明确提示用户）+ 保留限制
```

**两者都对，但要一致。这一周选 B（简单），然后保留 `prehashIfNeeded` 作为"以后想改"的路径。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. bcrypt 六个轮数的耗时数字
2. SHA-256 vs bcrypt 的速度对比（两个具体数字）
3. 你的 `rounds` 选择及理由
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：把 `token_version` 接上

**要求：** 加字段（迁移 003），`changePassword` 和 `consumeResetToken` 时 `token_version += 1`。

**第 52 节签发 JWT 时会把 `ver` 放进去，那时验证。**

**今天先把"改密码时递增"写好。**

## 练习二：做密码强度提示页面

**要求：** 在 `public/register.html` 里，用户输入密码时调 `/api/password/strength`（防抖 300ms），显示：

```text
进度条（按 score）
errors 列表（红色）
warnings 列表（黄色）
```

**为什么要做：** 让用户在提交前就知道"密码不合格"，避免"填完才被拒"的挫败感。

## 练习三：加"常见密码"列表

**要求：** 把 `COMMON_PASSWORDS` 扩到 200 条以上。

**从哪来：**

```text
① 你自己见过的最常见密码
② 公开的 top-10000 密码列表
③ 第 56 节会讲怎么用 HIBP API（haveibeenpwned）
```

**注意：不要真的把 100 万条密码打进代码里，那会让你的仓库爆掉。200 条够用，真实项目用 API。**

## 练习四：想清楚这四个问题

```text
1. 为什么"必须包含大小写数字符号"的规则反而降低了安全性？
2. 为什么重置 token 用 SHA-256 而不是 bcrypt？
3. 计时攻击怎么泄露"用户是否存在"？
4. `prehashIfNeeded` 加了 "sha256:" 前缀，是为了什么？
```

---

# 第 10 步：最终验收

## A. 代码

- [ ] `password.js` 有 `checkPassword` / `estimateStrength` / `prehashIfNeeded` / `byteLength`
- [ ] `checkPassword` 不强制字符组合
- [ ] 长度按字节判断（72 字节）
- [ ] `users.js` 有 `createResetToken` / `consumeResetToken` / `changePassword`
- [ ] `reset_tokens` 表存在，有 `used_at`
- [ ] 重置 token 存哈希

## B. 实测

- [ ] 我跑过 `e02:hash`，有六个轮数的数字
- [ ] 我跑过 `e02:crack`，知道 SHA-256 比 bcrypt 快多少倍
- [ ] 我自己走过一遍重置流程，假邮件打印出来了
- [ ] 同一个 token 用第二次失败
- [ ] 不存在的邮箱返回同样的话，但不打印邮件

## C. 认知

- [ ] 我能说清编码/加密/哈希的区别
- [ ] 我知道 bcrypt 哈希里哪部分是盐
- [ ] 我知道 SHA-256 为什么不能存密码
- [ ] 我知道 72 字节限制是什么
- [ ] 我知道计时攻击怎么修

## 本节课要能说出口的一句话

> **密码不加密，只哈希。哈希要慢，慢到攻击者破产；盐要随机，随机到彩虹表失效。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `bcrypt.compare` 总是 false | 存的是 `prehash` 但比对时没 prehash | 两边都调 `prehashIfNeeded` |
| 同一个密码哈希不同 | 正常，盐不同 | 这是对的 |
| 哈希长度 60 | 正常 | bcrypt 固定 60 字符 |
| 超过 72 字节的密码被拒 | `checkPassword` 拦了 | 这是设计，或接 `prehash` |
| `SQLITE_ERROR: no such table reset_tokens` | 没跑迁移 | 重启服务 |
| 重置链接过期 | 30 分钟 TTL | 重新申请 |
| 重置两次都成功 | `used_at` 没更新 | 检查事务 |
| token 打印出来了但点不开 | 端口不对 | 检查 `CONFIG.port` |
| `crypto is not defined` | 没 import | `import crypto from "node:crypto"` |
