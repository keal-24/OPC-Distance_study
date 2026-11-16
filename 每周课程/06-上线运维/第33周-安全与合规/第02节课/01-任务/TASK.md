# 第 226 节课：输入校验——前端校验等于没有

> 上一节我们把钥匙收好了。但钥匙是给"你自己"用的，门是给"所有人"开的。
> 这一节开始看门：**别人递进来的数据，你有没有在服务端自己看一遍。**
> 现在你会亲手用 `curl` 绕过自己写的所有前端校验。

**建议用时**：120 分钟
**你需要先完成**：第 225 节（`.env` 已不在仓库里）、第 30 周的测试基础（会用 `curl` 发请求）

---

# 第 0 步：为什么前端校验不算校验（10 分钟）

## 0.1 你现在会什么

你的表单大概是这样：

```html
<input name="email" type="email" required maxlength="50">
<select name="role">
  <option value="user">普通用户</option>
</select>
```

```js
if (!email.includes("@")) {
  alert("邮箱格式不对");
  return;
}
```

**这两段都"有用"，但它们拦的是"正常用户的手滑"，不是"攻击者"。**

## 0.2 你以后会遇到什么

```text
① 有人把 maxlength 从 50 改成 50000，提交了 5 万字，页面撑爆
② 有人用 curl 直接 POST，一个字段都没带，你的代码在 req.body.name.trim() 上崩
③ 有人在注册接口多传一个 role: "admin"，你把它原样写进了数据库
④ 有人把 age 传成 "abc"，你的 parseInt 得到 NaN，写进了数据库
⑤ 有人传一个 20MB 的 JSON，你的进程内存涨到 2G
```

**这五件事有一个共同点：浏览器上的校验一个都拦不住。**

## 0.3 今天要建立的三个概念

```text
① 输入面（input surface）：所有"外部数据能进来的地方"。
   body、query、params、header、cookie、上传的文件名。全都算。

② 边界校验：在"数据刚进门"那一刻检查，而不是"准备用它"的时候。
   进门查一次，之后代码里就可以当它是安全的。

③ 白名单（allowlist）：只允许"明确列出来的值"。
   黑名单（把危险字符删掉）永远会漏，因为你想不全。
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 8 个请求的记录表 |
| `validate.js` | `03-练习代码` | 你自己写的校验函数 |
| `requests.md` | `03-练习代码` | 8 条 curl 和对应的响应 |

---

# 第 1 步：先亲手证明前端校验拦不住（20 分钟）

## 1.1 这一步干什么

**先破除幻觉。** 你要亲眼看到自己写的校验是怎么被绕过去的，之后才愿意在服务端再写一遍。

## 1.2 准备一个"有前端校验"的接口

```bash
mkdir -p 03-练习代码/valid-lab
cd 03-练习代码/valid-lab
npm init -y
npm install express
```

**应该看到：**

```text
added 68 packages in 2s
```

**建 `server.js`（故意只有前端校验、后端什么都不做）：**

```js
const express = require("express");
const app = express();
app.use(express.json());
app.use(express.static("public"));

app.post("/api/register", (req, res) => {
  const { email, age, role } = req.body;
  res.json({ ok: true, saved: { email, age, role } });
});

app.listen(3000, () => console.log("http://127.0.0.1:3000"));
```

**建 `public/index.html`（这就是"前端校验"）：**

```html
<form id="f">
  <input id="email" type="email" required maxlength="50" placeholder="邮箱">
  <input id="age" type="number" min="1" max="120" required placeholder="年龄">
  <button>注册</button>
</form>
<script>
  document.getElementById("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const age = document.getElementById("age").value;
    if (!email.includes("@")) return alert("邮箱格式不对");
    if (age < 1 || age > 120) return alert("年龄不对");
    const r = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, age }),
    });
    alert(JSON.stringify(await r.json()));
  });
</script>
```

```bash
node server.js
```

**应该看到：**

```text
http://127.0.0.1:3000
```

**先在浏览器里正常提交一次**，确认走通。然后开始绕。

## 1.3 绕过一：改 `maxlength`

**操作：** 打开页面 → F12 → Elements → 双击 `maxlength="50"` → 改成 `maxlength="50000"` → 粘贴 50000 个字 → 提交。

**会怎样：**

```text
浏览器放行了，后端也放行了，50000 字进了数据库。
```

**为什么：** `maxlength` 是 HTML 属性，**它存在于你下载到本地的那个 HTML 文件里**。你能改，谁都能改。

## 1.4 绕过二：根本不打开浏览器

```bash
curl -s -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"x","age":999,"role":"admin"}'
```

**应该看到：**

```json
{"ok":true,"saved":{"email":"x","age":999,"role":"admin"}}
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `-X POST` | 用 POST 方法 |
| `-H "Content-Type: application/json"` | 告诉服务端"这是 JSON" |
| `-d '{...}'` | 请求体内容 |
| `"email":"x"` | **不是邮箱，也进去了** |
| `"age":999` | **超出 1—120，也进去了** |
| `"role":"admin"` | **前端根本没这个字段，它自己加上去的** |

**这三行就是这节课的全部理由。**

```text
前端校验 = 在"你的页面上"限制普通人
服务端校验 = 在"你的代码里"限制所有人
```

**而攻击者根本不在你的页面上。**

## 1.5 绕过三：连 `Content-Type` 都不给

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -d "email=x"
```

**应该看到：**

```text
TypeError: Cannot destructure property 'email' of 'req.body' as it is undefined.
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| 没有 `Content-Type: application/json` | `express.json()` 不解析这个请求体 |
| `req.body` 是 `undefined` | 所以解构直接抛异常 |
| `TypeError` | 服务端 500 —— **但把堆栈暴露给了客户端** |

**这一个 500 说明两件事：**

```text
① 你没校验"请求体是不是 JSON"
② 你的错误处理把内部细节吐出去了
```

**第二件比第一件更危险。** 攻击者靠报错信息能猜出你用什么框架、什么版本、哪一行代码。

---

# 第 2 步：盘点你的输入面（15 分钟）

## 2.1 为什么校验会漏

**校验漏，通常不是"写错了"，是"忘了写"。** 所以要先把"所有入口"列出来。

```bash
git grep -nE "req\.(body|query|params|headers|cookies)" -- "*.js"
```

**应该看到类似：**

```text
server.js:24:  const { email, password } = req.body;
server.js:41:  const id = req.params.id;
server.js:55:  const page = req.query.page;
server.js:72:  const { title, content } = req.body;
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `req.body` | 请求体（POST/PUT 的 JSON 或表单） |
| `req.query` | URL 问号后面的部分，`?page=2` |
| `req.params` | 路径里的变量，`/api/messages/:id` |
| `req.headers` | 请求头，比如 `authorization` |
| `req.cookies` | Cookie（要装 `cookie-parser` 才有） |

**每一行都是一个输入面。**

## 2.2 填一张输入面表

**在 `requests.md` 里建表：**

| 入口 | 方法 | 字段 | 类型 | 必填 | 长度/范围 | 枚举 |
|---|---|---|---|---|---|---|
| `/api/register` | POST | `email` | string | 是 | ≤254 | — |
| `/api/register` | POST | `password` | string | 是 | 8—72 | — |
| `/api/register` | POST | `role` | string | 否 | — | `user` / `admin`（仅内部） |
| `/api/messages` | POST | `content` | string | 是 | 1—2000 | — |
| `/api/messages/:id` | GET | `id` | 整数 | 是 | 1—2^31 | — |
| `/api/messages` | GET | `page` | 整数 | 否 | 1—1000 | — |
| 任意 | — | `authorization` | string | — | ≤200 | `Bearer ...` |

**填完你会发现：**

```text
一个只有 6 个接口的小项目，输入字段 7 个。
每个字段至少 3 个维度（类型、必填、长度/范围/枚举）。
20 多个检查点。
凭记忆写，一定会漏。
```

## 2.3 两个容易漏的输入面

```text
① 上传文件的文件名 —— 你觉得"文件名是系统给的"，不，是客户端发的（第 229 节）
② 从数据库读出来、再拼进 HTML 的内容 —— 它带着攻击者写过的东西（第 228 节）
```

**第 ② 类不是"输入"，但它是"二次输入"。** 后面会讲。

---

# 第 3 步：手写一个 `validate()`（30 分钟）

## 3.1 先写最小可用版

**不要一开始就上库。** 先手写一遍，你会知道库在替你做什么。

**建 `validate.js`：**

```js
function isNonEmptyString(v, max) {
  return typeof v === "string" && v.trim().length > 0 && [...v].length <= max;
}

function isIntInRange(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

module.exports = { isNonEmptyString, isIntInRange };
```

**逐行读：**

| 行 | 为什么这么写 |
|---|---|
| `typeof v === "string"` | **先看类型**。`"123"` 和 `123` 不是一回事 |
| `v.trim().length > 0` | 防止 `"   "` 这种"看着有内容其实是空的" |
| `[...v].length <= max` | 按**字符**数算，不是按字节 |
| `Number.isInteger(v)` | `12.5`、`"12"`、`NaN` 全部返回 false |

**为什么长度要用 `[...v].length`：**

```js
"👍".length            // 2（UTF-16 码元）
[..."👍"].length       // 1（字符）
```

**用 `v.length` 算，一个 emoji 占两个额度，用户会觉得"我明明没写那么多"。**

## 3.2 用它写一个接口

```js
const express = require("express");
const { isNonEmptyString, isIntInRange } = require("./validate");
const app = express();
app.use(express.json({ limit: "10kb" }));

app.post("/api/register", (req, res) => {
  const body = req.body || {};
  const errors = {};

  if (!isNonEmptyString(body.email, 254)) errors.email = "邮箱必填，且不超过 254 个字符";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.email = "邮箱格式不对";

  if (!isIntInRange(body.age, 1, 120)) errors.age = "年龄必须是 1—120 的整数";

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "VALIDATION_FAILED", fields: errors });
  }

  res.json({ ok: true, saved: { email: body.email, age: body.age } });
});

app.listen(3000);
```

**注意三处：**

```text
① express.json({ limit: "10kb" })  —— 请求体最大 10KB，超了直接拒
② const body = req.body || {}      —— 防止 body 是 undefined
③ 只把 email 和 age 写进结果        —— role 根本没读，传什么都没用
```

**第 ③ 条是最省事的防护：不读、不存，就等于不存在。**

## 3.3 验证：四个请求

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -H "Content-Type: application/json" -d '{}'
```

**应该看到：**

```json
{"error":"VALIDATION_FAILED","fields":{"email":"邮箱必填，且不超过 254 个字符","age":"年龄必须是 1—120 的整数"}}
```

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -H "Content-Type: application/json" -d '{"email":"a@b.co","age":"18"}'
```

**应该看到：**

```json
{"error":"VALIDATION_FAILED","fields":{"age":"年龄必须是 1—120 的整数"}}
```

**注意：`"18"` 是字符串，被拒了。** 这叫"不做隐式转换" —— **如果服务端帮它转，那 `"18abc"` 该转成什么？**

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -H "Content-Type: application/json" -d '{"email":"a@b.co","age":18,"role":"admin"}'
```

**应该看到：**

```json
{"ok":true,"saved":{"email":"a@b.co","age":18}}
```

**`role` 传了，但没进 saved。** 因为代码里根本没读它。

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -d "email=x"
```

**现在应该看到：**

```json
{"error":"VALIDATION_FAILED","fields":{...}}
```

**不再是 500 了。** 因为 `req.body || {}` 兜住了 `undefined`。

## 3.4 手写版的四个缺点

```text
① 每个接口都要重复写 errors 拼装
② 字段一多就长，容易漏
③ 类型定义和校验逻辑分开，改字段忘了改校验
④ 嵌套对象（比如 address.city）很难写
```

**所以真实项目里会用库。** 但你现在知道它在替你做什么了。

---

# 第 4 步：用 zod 重写一遍（25 分钟）

## 4.1 装

```bash
npm install zod
```

**应该看到：**

```text
added 1 package in 800ms
```

**`zod` 是什么：** 一个"用代码描述数据长什么样，再拿数据去对"的库。**你写一次描述，它同时给你类型检查和错误信息。**

**版本会变（v3 / v4 的 API 略有差异），以你装到的版本文档为准。**

## 4.2 写 schema

**建 `schema.js`：**

```js
const { z } = require("zod");

const registerSchema = z.object({
  email: z.string().trim().min(1, "邮箱必填").max(254, "邮箱太长").email("邮箱格式不对"),
  age: z.number().int("年龄必须是整数").min(1, "年龄不能小于 1").max(120, "年龄不能大于 120"),
});

const messageSchema = z.object({
  content: z.string().trim().min(1, "内容不能为空").max(2000, "内容不能超过 2000 字"),
});

module.exports = { registerSchema, messageSchema };
```

**逐行读：**

| 写法 | 意思 |
|---|---|
| `z.object({...})` | 描述"一个对象，字段如下" |
| `z.string()` | 必须是字符串，数字不行 |
| `.trim()` | **先去掉首尾空格再检查** |
| `.min(1)` / `.max(254)` | 长度范围 |
| `.email()` | 内置的邮箱格式检查 |
| `z.number().int()` | 必须是整数，`"18"` 不行 |

**注意每个检查后面那个字符串：** 那是**给用户看的错误信息**。不写的话，zod 会给一句英文默认信息，用户看不懂。

## 4.3 在接口里用

```js
const { registerSchema } = require("./schema");

app.post("/api/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const fields = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({ error: "VALIDATION_FAILED", fields });
  }
  res.json({ ok: true, saved: parsed.data });
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `safeParse` | **不抛异常**的解析。失败返回 `{ success: false, error }` |
| `parsed.error.issues` | 所有不合格的地方，每项有 `path` 和 `message` |
| `issue.path.join(".")` | 出错字段路径，嵌套时是 `address.city` |
| `if (!fields[key])` | **同字段只留第一条错误**，别把 5 条全丢给用户 |
| `parsed.data` | **只有校验过的字段**才在 `data` 里 |

**`parsed.data` 这个细节很关键：**

```text
你传 {"email":"a@b.co","age":18,"isAdmin":true}
parsed.data 只有 {"email":"a@b.co","age":18}
```

**schema 里没声明的字段，默认被丢掉。** 这叫"剥离"（strip）。**这一条就堵住了"多传一个 isAdmin"的洞。**

## 4.4 两种写法怎么选

| | 手写 `validate()` | `zod` |
|---|---|---|
| 依赖 | 0 | 1 个包（几百 KB） |
| 字段多时 | 很长，容易漏 | 一屏写完 |
| 错误信息 | 自己拼 | 每个检查点单独指定 |
| 多余字段 | 要自己挑 | 默认剥离 |
| 学习成本 | 0 | 半小时 |

```text
3 个字段以内的小脚本  → 手写
5 个以上接口的项目    → zod（或同类库）
```

**不要两个都用。** 混着来最麻烦。

## 4.5 一条铁律：校验必须发生在"用之前"

**反例：**

```js
app.post("/api/messages", async (req, res) => {
  const id = await db.insert("messages", req.body);   // ❌ 先写库
  const parsed = messageSchema.safeParse(req.body);   // 再校验
  if (!parsed.success) return res.status(400).json({ error: "bad" });
});
```

**为什么错：**

```text
脏数据已经进库了。
你返回 400，用户以为没成功，但数据在库里。
而且它可能已经在某个列表页显示出来了。
```

**正例：**

```js
app.post("/api/messages", async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_FAILED" });
  const id = await db.insert("messages", parsed.data);   // 只用校验过的 data
});
```

**规则：`parsed.data` 之外的任何东西，都不许进数据库。**

---

# 第 5 步：六个必须处理的细节（25 分钟）

## 5.1 请求体大小

```js
app.use(express.json({ limit: "10kb" }));
```

**应该看到（传 1MB）：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(printf 'a%.0s' {1..1000000})\"}"
```

```json
{"error":"PAYLOAD_TOO_LARGE"}
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `limit: "10kb"` | 超过 10KB 直接拒，**根本不进你的代码** |
| `printf 'a%.0s' {1..1000000}` | 生成 100 万个 `a` |
| `PAYLOAD_TOO_LARGE` | 你在错误处理里给它的名字 |

**为什么必须在"解析前"限制：**

```text
等到 JSON.parse 之后再检查长度，内存已经吃掉了。
10 个并发请求 × 20MB = 200MB，2G 内存的服务器就开始 swap。
```

**这个错误要单独接：**

```js
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "BAD_JSON" });
  }
  next(err);
});
```

**`entity.parse.failed` 是什么：** 请求体不是合法 JSON。**没有这一条，客户端的 JSON 写错会变成 500。**

## 5.2 类型：`"18"` 不是 `18`

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -H "Content-Type: application/json" -d '{"email":"a@b.co","age":"18"}'
```

**应该看到：**

```json
{"error":"VALIDATION_FAILED","fields":{"age":"年龄必须是 1—120 的整数"}}
```

**为什么不做自动转换：**

```js
Number("18")      // 18      ✅
Number("18abc")   // NaN     ❌
parseInt("18abc") // 18      ❌ 更糟：静默截断
Number("")        // 0       ❌ 空字符串变成 0
Number(true)      // 1       ❌ 布尔变成数字
```

**`parseInt("18abc") === 18` 是最坑的一个：** 它不报错，直接把后面的垃圾扔了。

**结论：类型不对就返回 400，让调用方改。** 不要"帮它转一下"。

## 5.3 数组：`?id=1&id=2` 会变成数组

```bash
curl -s "http://127.0.0.1:3000/api/messages?id=1&id=2"
```

**在 Express 里，`req.query.id` 是：**

```js
[ '1', '2' ]
```

**如果你的代码是：**

```js
const id = Number(req.query.id);     // NaN
db.query("... WHERE id = ?", [id]);  // 查不到，或者报错
```

**更糟：**

```js
if (req.query.id.startsWith("1")) { ... }   // TypeError: startsWith is not a function
```

**修法：校验时显式拒绝非字符串：**

```js
const idSchema = z.string().regex(/^\d+$/, "id 必须是数字").transform(Number);
const parsed = idSchema.safeParse(req.query.id);
```

| 片段 | 意思 |
|---|---|
| `z.string()` | **必须是字符串**，数组直接不合格 |
| `.regex(/^\d+$/)` | 只允许数字，`"1a"` 不行 |
| `.transform(Number)` | 校验通过后转成数字 |

**注意顺序：先校验"是不是纯数字字符串"，再转。** 反过来就晚了。

## 5.4 枚举：别用 `in` 判

**反例：**

```js
if (req.body.role in { user: 1, admin: 1 }) { ... }   // ❌
```

**为什么错：**

```js
"toString" in { user: 1, admin: 1 }    // true —— 原型链上有
"constructor" in { user: 1, admin: 1 } // true
```

**用 `in` 判枚举，`"constructor"` 能通过。**

**正确写法：**

```js
const ROLES = new Set(["user", "admin"]);
if (!ROLES.has(req.body.role)) return res.status(400).json({ error: "BAD_ROLE" });
```

**`Set.has` 只查自己的元素，不查原型链。**

## 5.5 多余字段：只挑你认识的

**这是"批量赋值"（mass assignment）漏洞：**

```js
const user = { ...req.body, createdAt: Date.now() };   // ❌
db.insert("users", user);
```

**会怎样：**

```bash
curl -X POST .../api/register -d '{"email":"a@b.co","role":"admin","balance":99999}'
```

```text
数据库里多了一个 role=admin、balance=99999 的用户。
```

**修法两种，选一种：**

```js
// ① zod 的 parsed.data（schema 里没声明的自动丢掉）
const { email, age } = parsed.data;

// ② 手写白名单
const user = { email: body.email, age: body.age };
```

**永远不要写 `...req.body`。** 这是这节课最该记住的一行。

## 5.6 原型污染：`__proto__`

```bash
curl -s -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.co","age":18,"__proto__":{"isAdmin":true}}'
```

**如果代码里写了：**

```js
const merged = Object.assign({}, req.body);   // ❌
console.log({}.isAdmin);                      // true —— 全局被污染了
```

**为什么：** `Object.assign` 对 `__proto__` 这个 key 会走"设置原型"的分支，**不是设一个普通属性**。于是你改的是"所有对象的原型"。

**修法：** 不要 `Object.assign` / 展开运算符处理用户输入；只挑白名单字段。**zod 的 `parsed.data` 里不会有 `__proto__`，因为 schema 里没它。**

---

# 第 6 步：错误信息不能泄露内部（20 分钟）

## 6.1 先看一个真实的泄露

```js
app.post("/api/messages", async (req, res) => {
  try {
    await db.run(`INSERT INTO messages (content) VALUES ('${req.body.content}')`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });   // ❌
  }
});
```

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"it's\"}"
```

**应该看到：**

```json
{"error":"SQLITE_ERROR: near \"s\": syntax error"}
```

**这一个响应泄露了三件事：**

```text
① 你用的是 SQLite
② 你的 SQL 是字符串拼接的（否则单引号不会出问题）
③ 拼接位置在 content 字段
```

**第 ② 条最致命：** 它在告诉攻击者"这里可以注入"。**下一节他就会来试 `' OR '1'='1`。**

## 6.2 统一错误处理

**放在所有路由后面：**

```js
app.use((err, req, res, next) => {
  const id = require("crypto").randomUUID();
  console.error(`[${id}]`, err.stack);

  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE", requestId: id });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "BAD_JSON", requestId: id });
  }
  res.status(500).json({ error: "INTERNAL_ERROR", requestId: id });
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| 4 个参数 | **Express 靠"4 个参数"识别错误中间件**，少一个就变成普通中间件 |
| `randomUUID()` | 生成随机 ID，把"用户的报错"和"你的日志"对上 |
| `console.error(err.stack)` | 堆栈**只进服务器日志**，不出现在响应里 |
| `{ error: "INTERNAL_ERROR", requestId: id }` | 用户只看到一句通用错误 + 一个编号 |

**为什么要有 `requestId`：**

```text
用户说"我提交失败了，编号 3f2a1b0c"。
你去日志里 grep 3f2a1b0c，三秒找到完整堆栈。
没有它，你只能问"你什么时候点的？用的什么浏览器？"
```

## 6.3 验证

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages -H "Content-Type: application/json" -d "{\"content\":\"it's\"}" | grep -icE "sqlite|syntax|at Object|/srv|node_modules"
```

**应该看到：**

```text
0
```

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages -d "not json" -H "Content-Type: application/json"
```

**应该看到：**

```json
{"error":"BAD_JSON","requestId":"6f1c2d3e-..."}
```

**不是 500，也没有 `Unexpected token` 这种解析器原文。**

## 6.4 什么能给用户看，什么不能

| 能给 | 不能给 |
|---|---|
| `邮箱格式不对` | `SQLITE_ERROR: near "s": syntax error` |
| `内容不能超过 2000 字` | `at Object.<anonymous> (/srv/app/server.js:88:15)` |
| `INTERNAL_ERROR` + `requestId` | `connect ECONNREFUSED 10.0.0.5:5432` |
| `文件太大` | `ENOENT: ... open '/srv/app/uploads/x.png'` |

**判断标准：**

```text
这句话会不会帮攻击者判断"我用的是什么、代码长什么样、内网长什么样"？
会 → 不能给。
```

**"给用户看"和"给日志看"是两件事：**

```text
用户：一句人话 + 一个编号
日志：完整堆栈 + 请求参数（脱敏后）+ 同一个编号
```

---

# 第 7 步：八个构造请求，全部打一遍（20 分钟）

## 7.1 记录表

**在 `requests.md` 里建这张表，每打一个填一行：**

| # | 攻击意图 | 请求 | 期望 | 实际 |
|---|---|---|---|---|
| 1 | 空 body | `-d '{}'` | 400 | |
| 2 | 类型错 | `age:"18"` | 400 | |
| 3 | 超长字段 | 5000 字邮箱 | 400 | |
| 4 | 枚举外 | `role:"root"` | 不生效 | |
| 5 | 数组注入 | `?id=1&id=2` | 400 | |
| 6 | 非 JSON | 无 `Content-Type` | 400 | |
| 7 | 多余字段 | `isAdmin:true` | 被剥离 | |
| 8 | 超大 body | 1MB | 413 | |

## 7.2 逐条跑

```bash
# 1 空 body
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" -d '{}'

# 2 类型错
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" -d '{"email":"a@b.co","age":"18"}'

# 3 超长字段（300 字，在 10KB 限制内）
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(printf 'a%.0s' {1..300})@b.co\",\"age\":18}"

# 4 枚举外
curl -s -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" -d '{"email":"a@b.co","age":18,"role":"root"}'

# 5 数组
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/messages?id=1&id=2"

# 6 非 JSON
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/register -d "email=x"

# 7 多余字段
curl -s -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" -d '{"email":"a@b.co","age":18,"isAdmin":true}'

# 8 超大
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" -d "{\"email\":\"$(printf 'a%.0s' {1..1000000})\"}"
```

**`-o /dev/null -w "%{http_code}\n"` 是什么：** 只打印状态码，不看响应体。**批量验证时最省事。**

## 7.3 应该看到

| # | 期望状态码 | 期望响应里的关键字段 |
|---|---|---|
| 1 | `400` | `fields.email`、`fields.age` |
| 2 | `400` | `fields.age` |
| 3 | `400` | `fields.email`（"邮箱太长"） |
| 4 | `200` | 响应里**没有** `role` |
| 5 | `400` | `id 必须是数字` |
| 6 | `400` | `BAD_JSON` 或 `VALIDATION_FAILED` |
| 7 | `200` | 响应里**没有** `isAdmin` |
| 8 | `413` | `PAYLOAD_TOO_LARGE` |

**第 3 条和第 8 条要分开测，因为它们是两道门：**

```text
第 8 条验的是"请求体大小"（10KB 这道门）
第 3 条验的是"字段长度"（254 这道门）
```

**只测一个，你会以为另一个也没问题。**

## 7.4 一个"看起来通过其实没通过"的陷阱

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -d "email=x"
```

**如果返回 `200`：**

```text
说明你的应用接受"没有 Content-Type 的请求"。
通常是因为你写了 app.use(express.urlencoded())，
或者路由对空 body 做了默认值。
```

**`200` 不一定安全。** 要看它到底存了什么：

```json
{"ok":true,"saved":{"email":null,"age":null}}
```

**空值进了库，比 400 糟得多。**

---

# 第 8 步：故意犯五个错（30 分钟）

## 错误 1：只做前端校验

**操作：** 删掉 `server.js` 里所有 `if`，只留 `res.json({ ok: true, saved: req.body })`。

**会怎样：** 正常用户在页面上怎么点都没问题。一跑 `curl`：

```json
{"ok":true,"saved":{"email":"x","age":999,"role":"admin"}}
```

**为什么：** 前端校验的代码存在"用户下载到的那份文件"里。**用户可以改，可以删，可以根本不下载。**

**怎么修：** 在服务端补校验（第 3 或第 4 步）。

**怎么验证补住了：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" -d '{"email":"x","age":999}'
```

**应该看到 `400`。** 还是 200 的话，说明校验没接在这个路由上。

## 错误 2：用 `if (!name)` 判必填

**操作：**

```js
if (!body.name) errors.name = "名字必填";
```

**会怎样：**

```text
-d '{"name":0}'         → 通过（0 是假值）
-d '{"name":""}'        → 被拒（对的）
-d '{"name":"   "}'     → 通过（"   " 是真值）
-d '{"name":false}'     → 通过
```

**为什么：** `0`、`""`、`false`、`null`、`undefined`、`NaN` 都是"假值"。**`!x` 分不清"没填"和"填了 0"。**

**怎么修：**

```js
if (typeof body.name !== "string" || body.name.trim() === "") {
  errors.name = "名字必填";
}
```

**先判类型，再判内容。**

**怎么验证补住了：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -H "Content-Type: application/json" -d '{"name":"   "}'
```

**应该返回 400，`fields.name` 有内容。**

## 错误 3：只校验类型，不校验长度

**操作：**

```js
if (typeof body.content !== "string") return res.status(400).end();
```

**会怎样：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"$(printf 'a%.0s' {1..8000})\"}"
```

**通过了，8000 字进了库。**

**为什么是问题：**

```text
① 列表页一次渲染 50 条，每条 8000 字 → 页面卡死
② 数据库字段如果是 VARCHAR(2000)，直接报错 → 500
③ 如果把它拼进 HTML，8000 字里能塞很多标签
```

**怎么修：** 加 `.max(2000)`，或手写 `[...v].length <= 2000`。

**怎么验证补住了：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages -H "Content-Type: application/json" \
  -d "{\"content\":\"$(printf 'a%.0s' {1..3000})\"}" | grep -o "2000"
```

**应该看到 `2000`。** 看不到说明错误信息里没提长度 —— 用户不知道改到多短才算对。

## 错误 4：把 `err.message` 返回给前端

**操作：**

```js
catch (err) { res.status(500).json({ error: err.message }); }
```

**会怎样：** 传一个带单引号的内容：

```json
{"error":"SQLITE_ERROR: near \"s\": syntax error"}
```

**为什么严重：** 它在告诉攻击者"我用 SQLite、我拼接 SQL、拼的是 content 字段"。**下一节他就来注入。**

**怎么修：** 统一错误处理 + `requestId`（第 6.2 步）。

**怎么验证补住了：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages -H "Content-Type: application/json" -d "{\"content\":\"it's\"}" | grep -icE "sqlite|syntax|at Object"
```

**应该看到 `0`。**

## 错误 5：信任 `req.body.role`

**操作：**

```js
const user = { ...req.body };
db.insert("users", user);
```

**会怎样：**

```text
数据库里多了一个 role=admin 的用户。
而且你完全不知道 —— 页面上根本没有这个字段。
```

**为什么这是最危险的一个：**

```text
其它四个错会让你"看到报错"或者"数据不对"。
这个错什么现象都没有：注册成功，一切正常。
直到某天你发现多了 30 个 admin 账号。
```

**怎么修：** 只挑白名单字段，或者用 `parsed.data`。

**怎么验证补住了：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/register -H "Content-Type: application/json" \
  -d '{"email":"a@b.co","age":18,"role":"admin"}' | grep -c "admin"
```

**应该看到 `0`。**

---

# 第 9 步：写学习笔记（10 分钟）

```markdown
# 第 226 节课学习笔记

## 一、我是怎么绕过自己写的前端校验的

| 绕法 | 具体操作 | 结果 |
|---|---|---|
| 改 maxlength | | |
| curl 直接 POST | | |
| 不给 Content-Type | | |

## 二、前端校验和服务端校验的分工

前端校验负责：
服务端校验负责：

## 三、我的输入面表

| 入口 | 字段 | 类型 | 必填 | 长度/范围 | 枚举 |
|---|---|---|---|---|---|
| | | | | | |

一共几个字段：____ 检查点大约：____

## 四、手写版和 zod 的对比

| | 手写 | zod |
|---|---|---|
| 代码行数 | | |
| 多余字段怎么处理 | | |
| 嵌套对象好写吗 | | |

## 五、八个请求的结果

| # | 意图 | 期望 | 实际 | 通过？ |
|---|---|---|---|---|
| 1 | 空 body | 400 | | |
| 2 | 类型错 | 400 | | |
| 3 | 超长字段 | 400 | | |
| 4 | 枚举外 | 不生效 | | |
| 5 | 数组 | 400 | | |
| 6 | 非 JSON | 400 | | |
| 7 | 多余字段 | 被剥离 | | |
| 8 | 超大 body | 413 | | |

## 六、`parsed.data` 和 `req.body` 的区别

## 七、错误响应里我原来泄露了什么

原来：
现在：

`requestId` 怎么用：

## 八、五个错误里，哪个最危险

为什么：

## 九、我还不懂的词

## 十、完成检查

- [ ] 我用 curl 绕过了自己的前端校验
- [ ] 每个写接口都有服务端校验
- [ ] 多余字段进不了数据库
- [ ] 错误响应里没有 SQL、堆栈、内部路径
- [ ] 请求体有大小限制
```

---

# 第 10 步：课后练习

## 练习一：给真实项目补校验

**要求：**

1. 用 `git grep -nE "req\.(body|query|params)"` 列出所有输入面；
2. 挑 3 个最重要的接口（注册、发消息、改资料）；
3. 每个都补上服务端校验；
4. 每个都跑 4 个 curl：空、类型错、超长、多余字段。

**记录：** 补之前有几个接口完全没有服务端校验？

**思考题：** 只在"管理员页面"用到的字段，还需要校验吗？

**提示：** 想想管理员页面是不是也在浏览器里。

## 练习二：把 `validate()` 写成可复用的

**要求：**

1. 不要每个接口重复拼 `errors`；
2. 写一个 `check(rules)`，接收 `{ 字段: [检查函数...] }`；
3. 返回 `{ ok, data, fields }`。

**记录：** 你的版本和 zod 比，少了哪些能力？

**思考题：** 为什么所有校验库都是"先收集所有错误，再一起返回"，而不是"遇到第一个错就返回"？

**提示：** 用户填 5 个字段错了 3 个，一次告诉他 vs 让他改 3 次。

## 练习三：写一份"错误信息规范"

**要求：**

1. 列出你的项目会给用户看的 10 条错误信息；
2. 每条必须是"人话"，不含技术词；
3. 同时写下"这条错误对应的日志里记什么"。

**记录：** 有几条你原来写的是 `err.message`？

**思考题：** "邮箱已注册"和"邮箱或密码错误"，哪个更安全？

**提示：** 前者等于告诉别人"这个邮箱在你这儿有账号"。

## 练习四：模拟一次内存打爆

**要求：**

1. 去掉 `limit: "10kb"`；
2. 用 `curl` 并发发 20 个 2MB 请求（`xargs -P 10` 或者开 20 个终端）；
3. 观察 `node` 进程内存（`pm2 monit` 或任务管理器）；
4. 加回 `limit` 再试一次。

**记录：** 两次的内存峰值差多少？

**思考题：** 服务器只有 2G 内存，20 个 100MB 的请求会发生什么？

**⚠️ 只在本地做。** 不要对线上服务器发包。

## 练习五：用一句话解释给客户听

**要求：** 写 100 字以内，回答："你们前端已经限制了输入，为什么后台还要再检查一遍？"

**记录：** 写了几版？

**思考题：** 客户听懂了吗？如果没懂，换什么比喻？

**提示：** 门口贴的告示（前端）和门卫真的查证件（服务端）。

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清"前端校验"和"服务端校验"分别拦住了谁
- [ ] 我知道输入面包括 body、query、params、header、cookie
- [ ] 我知道白名单和黑名单的区别，为什么白名单更可靠
- [ ] 我知道 `parsed.data` 和 `req.body` 的区别
- [ ] 我知道为什么类型不对要返 400，而不是"帮它转"

## B. 实操

- [ ] 我用 `curl` 绕过了自己的前端校验（至少 3 种绕法）
- [ ] 我手写过 `validate()`，也用过 zod
- [ ] 我给请求体加了大小限制，验证过 413
- [ ] 我做了统一错误处理，响应里有 `requestId`
- [ ] 我处理了 `?id=1&id=2` 变成数组的情况
- [ ] 我验证过多余字段（`isAdmin`）进不了数据库

## C. 排错

- [ ] 请求体不是 JSON 时，我的服务返回 400 而不是 500
- [ ] `req.body` 是 `undefined` 时，我的代码不崩
- [ ] 我知道 `parseInt("18abc")` 返回 18，所以不用它做校验
- [ ] 我知道 `"x" in obj` 会查到原型链，所以不用它判枚举
- [ ] 我知道 `Object.assign({}, req.body)` 有原型污染风险

## D. 交付

- [ ] `requests.md` 里 8 条请求都有"期望 / 实际"
- [ ] 输入面表覆盖了所有写接口
- [ ] `validate.js` 或 `schema.js` 存在且被路由引用
- [ ] 错误响应里搜不到 `SQLITE` / `at Object` / `/srv`

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 8 个请求的记录表没有空格
- [ ] "我还不懂的词"有内容

## 本节课要能说出口的一句话

> **用户能改的东西都不算校验；服务端没检查过的数据，一律当作是攻击者写的。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `Cannot destructure property ... of 'req.body'` | 没有 JSON body，或没装 `express.json()` | 加中间件，并判 `req.body \|\| {}` |
| `Unexpected token` 出现在响应里 | 把 `err.message` 返回了 | 统一错误处理，只返通用文案 |
| 413 一直触发 | `limit` 设太小 | 按业务调，但要配合字段长度校验 |
| 前端明明限制了，还是收到超长数据 | 前端校验可绕过 | 服务端必须再校验一次 |
| `age: "18"` 被拒，用户抱怨 | 类型严格 | 让前端 `Number()` 后再发 |
| `?id=1&id=2` 报 `startsWith is not a function` | query 变成了数组 | 校验时先判 `typeof === "string"` |
| zod 报 `Expected number, received string` | 类型不符 | 这是对的，改调用方 |
| zod 通过但数据里有 `__proto__` | 没用 `parsed.data` | 只落 `parsed.data` |
| `in` 判枚举时 `"constructor"` 通过了 | 查到原型链 | 改用 `Set.has` |
| 用户说"提交失败"但你说不清哪次 | 没有 `requestId` | 加 `randomUUID()` 打到日志 |
| 校验写了但脏数据还是进库 | 校验在写库之后 | 校验提到最前，只落 `parsed.data` |
| 中文长度总是不对 | 用 `v.length` 算码元 | 用 `[...v].length` |
| `express.json` 报 `entity.parse.failed` | 请求体不是合法 JSON | 单独接这个错误，返 400 |
| 加了错误中间件但不生效 | 只写了 3 个参数 | 错误中间件必须 4 个参数 |
