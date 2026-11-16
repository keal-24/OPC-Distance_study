# 第 164 节课：tenant_id 从哪来

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 表建好了，字段留着了，但有个问题没回答：**一条请求进来，系统凭什么知道这是哪个客户？**
> 这节课的答案只有一句：**从服务端会话里推导出来，客户端传过来的一律不算。**

**建议用时**：120 分钟
**你需要先完成**：第 163 节课（六张表建好，`verify.js` 五条全过）

---

# 第 0 步：先看一个错了的写法（15 分钟）

## 0.1 最常见的错法

**"前端登录之后不是知道自己是哪个公司了吗？让它带上不就行了。"**

于是接口变成这样：

```js
// ❌ 这是错的，先看清楚为什么错
app.get('/api/messages', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'];   // 或者 req.query.tenant_id
  const { rows } = await db.query(
    'select * from messages where tenant_id = $1',
    [tenantId]
  );
  res.json(rows);
});
```

**这段代码逻辑通顺、功能正常、测试通过。**

**问题在于：`x-tenant-id` 这个头是客户端发的，客户端就是浏览器，浏览器是用户的。**

用户想改，一条命令就行：

```text
curl http://localhost:3000/api/messages -H "x-tenant-id: 别人家的租户id"
```

**你会看到别人的消息。**

## 0.2 为什么很多人会这么写

**因为它在开发阶段很方便。** 你不用做登录就能测接口，Postman 里随便填个头。

**然后你就会一直这么用下去，直到某天客户问："你们怎么保证我们看不到别家的数据？"**

**你答不上来。**

## 0.3 判断标准：这个值，用户能不能改

**记住这一条，以后所有类似问题都能自己判断：**

```text
浏览器发出去的东西，用户全都能改。
包括：URL 参数、请求头、请求体、Cookie 的明文部分、localStorage、隐藏表单域。
```

**唯一不能改的是：服务端签名过的东西**（比如 JWT），**以及服务端自己存着的东西**（比如数据库里的 session 记录、你的表里的 tenant_id）。

## 0.4 正确的链路

```text
① 用户登录 → 服务端查出他是谁、属于哪个租户
② 服务端把"他是谁"签成一个 token，放进 HttpOnly Cookie
③ 之后每个请求带这个 Cookie
④ 服务端验签 → 得到 user_id（不是 tenant_id）
⑤ 用 user_id 去数据库查 → 得到 tenant_id
⑥ 挂到 req.tenant 上，后面的代码只用它
```

**注意第 ④ 步和第 ⑤ 步：token 里只放 `user_id`，不放 `tenant_id`。**

**为什么不放 `tenant_id`：** 用户可能被移出公司、租户可能被停用。**token 能活 7 天，租户状态随时会变。** 把会变的东西签进 token，等于让它七天不生效。

**这个细节很多人做错。你只要记住：token 里放"你是谁"，不放"你有什么权限"。**

---

# 第 1 步：先讲清楚一个模型选择（15 分钟）

**这里有个岔路口，很多人做到一半才发现，然后要重构。**

## 1.1 模型 A：一个邮箱，每个公司一个账号

```text
张伟 在 A 公司  zhang@abc.com  →  users 一行，tenant_id = A
张伟 在 B 公司  zhang@abc.com  →  users 另一行，tenant_id = B
```

**特点：**

```text
✅ 简单，表结构就是第 163 节建的样子
✅ 每个公司的数据彻底分开，连"同一个人"这件事都不共享
❌ 同一个人要记两套密码
❌ 一个人在两家公司之间切换要退出再登录
```

**这是第 163 节建的表支持的模型。** 客户 A 和客户 B 都可以有 `zhang@abc.com`，互不影响。

## 1.2 模型 B：一个邮箱一个账号，可以加入多个公司

```text
users        zhang@abc.com，一行，没有 tenant_id
memberships  zhang → A 公司（角色 owner）
             zhang → B 公司（角色 member）
```

**特点：**

```text
✅ 一个账号进出所有公司，切换不用重新登录（Slack、Notion 都是这个）
✅ 员工离职、换公司、加公司，都只是 memberships 里加一行
❌ 表结构复杂一层
❌ "张伟是谁"和"张伟在哪家公司"要分开处理
```

## 1.3 你现在该选哪个

| 你的客户情况 | 选哪个 |
|---|---|
| 客户是一个个独立的中小企业，彼此没关系 | **模型 A** |
| 你的产品会有"一个人同时用好几家客户公司"的场景 | 模型 B |
| 你还没想清楚 | **模型 A**，改起来有路（下面 1.4 讲） |

**这一周按模型 A 做。** 不是因为它更好，是因为**表已经建好了，而且 90% 的中小企业接活场景用不上模型 B。**

**但你要知道改的路怎么走，客户提出来的时候不至于慌。**

## 1.4 从 A 改成 B 的路（先看懂，不用现在做）

**三步，都不破坏数据：**

```sql
-- 1. 建 memberships，把现有 users 的归属搬过来
create table memberships (
  user_id    uuid not null references users(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

insert into memberships (user_id, tenant_id, role)
select id, tenant_id, role from users;

-- 2. users 里去掉 tenant_id（先留着不动，等代码改完再删）
-- 3. 登录后先选公司，选中的那个写进 session，而不是 token
```

**关键在第 3 步：** 模型 B 的"当前租户"是**登录之后的一次选择**，存在服务端 session 里，不是签在 token 里。

**这也是为什么第 0 步说 token 里别放 tenant_id——放进去了，切换公司就得重新登录。**

**看到这里你应该明白：这不是"哪个更先进"的问题，是"你的客户怎么用"的问题。**

---

# 第 2 步：装依赖，加两个字段（15 分钟）

## 2.1 装三个包

**在 `saas-lab` 目录里：**

```text
npm install bcryptjs jsonwebtoken cookie-parser
```

| 包 | 干什么 |
|---|---|
| `bcryptjs` | 给密码做哈希。**永远不存明文密码** |
| `jsonwebtoken` | 签发和验证 token |
| `cookie-parser` | 让 `req.cookies` 能读到 cookie |

**`bcryptjs` 不是 `bcrypt`。** 后者要编译原生模块，Windows 上经常装不上（要 Python 和 VS Build Tools）。`bcryptjs` 是纯 JS，慢一点点，但装得上。

**这个坑记下来：给客户装环境的时候，`bcrypt` 会浪费你半小时。**

## 2.2 加一个环境变量

**打开 `.env`，加一行：**

```text
JWT_SECRET=换成一串你自己乱敲的字符，至少32位
PORT=3000
DATABASE_URL=postgres://...
```

**`JWT_SECRET` 是什么：** 签 token 用的密钥。谁能拿到它，谁就能伪造任何人的登录态。

**生成一个够乱的：** 在命令行跑

```text
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**把这串粘进去。**

**三条规矩：**

```text
① 不能是 "secret"、"123456"、你的生日
② 不能进 Git（.env 已经在 .gitignore 里了）
③ 一旦泄露，所有用户的登录态都要作废 —— 换密钥就能做到，代价是所有人都要重登
```

## 2.3 给 `tenants` 加一个字段

**客户的合同里经常需要"我们公司叫什么、几个人、什么套餐"。`tenants` 已经有了。这节只需要一个访问标识。**

**新建 `migrations/004_tenant_slug.sql`：**

```sql
alter table tenants add column if not exists owner_user_id uuid;
```

**`owner_user_id` 记"谁是这家公司的创建者"。** 现在没用到，第 167 节做配额、第 168 节做转让会用到。

**为什么现在加：** 迁移一次加好，比以后想起来再加省事。**而且新建的表还没数据，加字段零风险。**

**跑：**

```text
npm run migrate
```

---

# 第 3 步：注册接口（30 分钟）

**注册要一次做三件事，而且必须同时成功或同时失败：**

```text
① 建一个租户（客户公司）
② 建一个用户（这个人就是公司的第一个账号，角色 owner）
③ 把这两件事写进同一个事务
```

**漏了 ③ 会怎样：租户建了，用户建失败（比如密码哈希出错），库里就多了一个没有任何人的空公司。** 这种脏数据你以后清理起来很烦。

## 3.1 写 `src/routes/auth.js`

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ uid: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function setCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post('/register', async (req, res) => {
  const company = (req.body.company || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (company.length < 2) {
    return res.status(400).json({ error: '公司名称至少 2 个字' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不对' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '密码至少 8 位' });
  }

  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();

  try {
    await client.query('begin');

    const tenant = await client.query(
      'insert into tenants (name, slug) values ($1, $2) returning id',
      [company, 't' + Date.now().toString(36)]
    );
    const tenantId = tenant.rows[0].id;

    const user = await client.query(
      `insert into users (tenant_id, email, password_hash, role)
       values ($1, $2, $3, 'owner')
       returning id, email, role`,
      [tenantId, email, hash]
    );
    const userId = user.rows[0].id;

    await client.query('update tenants set owner_user_id = $1 where id = $2', [
      userId,
      tenantId,
    ]);

    await client.query('commit');

    setCookie(res, signToken(userId));
    res.status(201).json({
      user: { id: userId, email: user.rows[0].email, role: 'owner' },
      tenant: { id: tenantId, name: company },
    });
  } catch (err) {
    await client.query('rollback');

    if (err.code === '23505') {
      return res.status(409).json({ error: '这个邮箱已经注册过了' });
    }

    console.error('[register]', err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  const { rows } = await pool.query(
    `select id, email, password_hash, role, tenant_id
     from users where email = $1`,
    [email]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: '邮箱或密码不对' });
  }

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);

  if (!ok) {
    return res.status(401).json({ error: '邮箱或密码不对' });
  }

  setCookie(res, signToken(user.id));
  res.json({
    user: { id: user.id, email: user.email, role: user.role },
    tenant: { id: user.tenant_id },
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

module.exports = router;
```

## 3.2 逐段讲，四个地方值得停一下

### `email` 为什么在查询里也 `toLowerCase()`

**因为邮箱不区分大小写，但数据库的 `=` 区分。**

客户注册时写 `Zhang@ABC.com`，第二天登录写 `zhang@abc.com`——**按现在的代码，登录失败，提示"邮箱或密码不对"，客户会以为你丢了他的账号。**

**统一在入口小写化，是最省事的做法。**

（严格说邮箱的本地部分技术上区分大小写，但全世界没有一个邮件服务商真的这么干。**跟着现实走。**）

### 登录失败为什么两种情况返回同一句话

```js
rows.length === 0  → '邮箱或密码不对'
密码比对失败        → '邮箱或密码不对'
```

**如果分开写"该邮箱未注册"和"密码错误"，攻击者可以用它来批量探测哪些邮箱在你的系统里注册过。**

**这个技巧叫"防用户枚举"。** 客户的安全检查里经常问这个。

### `23505` 是什么

**PostgreSQL 的错误码，意思是"唯一约束冲突"。**

我们只在 `users` 上有可能撞它——但注意：**第 163 节把唯一约束改成了 `(tenant_id, email)`，也就是"同一公司内邮箱不重复"。**

**注册时租户是新建的，里面一个人都没有，所以永远不会撞。**

**那这个 `23505` 分支还有什么用？**

**防刷。** 两个同样的注册请求同时到达（用户手抖点了两次），第一个建了租户 A 和用户，第二个也会建一个新租户 B——因为租户不同，邮箱不冲突。

**结果：同一个邮箱在两家公司里各有一个账号，客户登录后看到的是空数据，以为丢了。**

**所以注册必须再加一道闸：先查这个邮箱是不是已经存在（任意租户）。**

**在 `begin` 之前加：**

```js
const exists = await pool.query('select 1 from users where email = $1 limit 1', [email]);
if (exists.rowCount > 0) {
  return res.status(409).json({ error: '这个邮箱已经注册过了' });
}
```

**这一段和前面的唯一约束不冲突，它们管的是两件事：**

```text
数据库唯一约束 (tenant_id, email)  → 保证"同一公司内不重复"
应用层先查一次                    → 保证"一个人不会莫名其妙有两个公司"
```

**两层都要有。** 数据库约束是最后的底线，应用层的检查是给用户看的提示。

### `httpOnly` 和 `sameSite`

| 参数 | 作用 | 不写会怎样 |
|---|---|---|
| `httpOnly: true` | JS 读不到这个 cookie | XSS 一注入就能偷走登录态 |
| `sameSite: 'lax'` | 跨站请求默认不带 cookie | 别人的网站能拿你的用户身份发请求（CSRF） |
| `secure: true` | 只在 HTTPS 下发送 | 生产环境必须开，本地 http 开了就带不上 |
| `maxAge` | 有效期 | 关浏览器就退出登录 |

**`secure` 那行写成 `process.env.NODE_ENV === 'production'` 是有意的。** 本地 `http://localhost` 开了 `secure` 会导致 cookie 完全无法设置，你会花两小时怀疑人生。

**这个坑几乎所有教程都踩过一遍。**

## 3.3 写 `src/server.js` 把路由挂上

```js
const express = require('express');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器错误' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('服务已启动 http://localhost:' + port);
});
```

**启动：**

```text
npm run dev
```

**看到"服务已启动"就对了。**

## 3.4 测一次注册

**命令行（另开一个窗口）：**

```text
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"company\":\"客户甲\",\"email\":\"a@a.com\",\"password\":\"12345678\"}" -c cookies.txt
```

**Windows 的 cmd 里引号转义很烦，用 PowerShell 更省事：**

```text
curl.exe -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d '{\"company\":\"客户甲\",\"email\":\"a@a.com\",\"password\":\"12345678\"}' -c cookies.txt
```

**你会看到：**

```json
{"user":{"id":"...","email":"a@a.com","role":"owner"},"tenant":{"id":"...","name":"客户甲"}}
```

**`-c cookies.txt` 是把返回的 cookie 存到文件里，下次请求用 `-b cookies.txt` 带上。**

**自检点：去数据库看一眼。**

```sql
select t.name, u.email, u.role from tenants t join users u on u.tenant_id = t.id;
```

**应该只有一行：客户甲 / a@a.com / owner。**

**多跑一次注册（用同一个邮箱）会返回 `这个邮箱已经注册过了`。** 如果返回的是 500 或者建出第二个租户，说明 3.2 末尾那段没加。

---

# 第 4 步：两个中间件（25 分钟）

**中间件的顺序不能反：先知道"你是谁"，才能知道"你属于哪"。**

## 4.1 `src/middleware/auth.js`

```js
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

module.exports = async function auth(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  const { rows } = await pool.query(
    'select id, email, role, tenant_id from users where id = $1',
    [payload.uid]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: '账号不存在' });
  }

  req.user = rows[0];
  next();
};
```

**注意它做了两件事：验签 + 查库。**

**只验签不查库的写法很常见：**

```js
req.user = jwt.verify(token, process.env.JWT_SECRET);   // ❌ 少了一半
```

**问题：** token 签出去之后，你把这个人删了、把他的公司停用了、把他的角色从 `owner` 改成 `member`——**在 token 过期前（7 天）这些改动全部无效。**

**所以：token 只负责证明"这个请求是这个人发的"，其余一切从数据库拿。**

**多查一次库的代价是几毫秒。省掉它的代价是七天。**

## 4.2 `src/middleware/tenant.js`

```js
const pool = require('../db/pool');

module.exports = async function tenant(req, res, next) {
  const tenantId = req.user.tenant_id;

  if (!tenantId) {
    return res.status(500).json({ error: '账号没有归属的租户' });
  }

  const { rows } = await pool.query(
    'select id, name, plan, status from tenants where id = $1',
    [tenantId]
  );

  if (rows.length === 0) {
    return res.status(500).json({ error: '租户不存在' });
  }

  const t = rows[0];

  if (t.status !== 'active') {
    return res.status(403).json({ error: '账户已停用，请联系客服' });
  }

  req.tenant = t;
  next();
};
```

**三个地方要说清：**

### 为什么缺租户返回 500，不是 401

**401 是"你没登录"，403 是"你登录了但没权限"，500 是"服务器自己有问题"。**

用户登录了、token 有效、但数据库里 `tenant_id` 是空——**这是你的数据坏了，不是用户的问题。** 返回 500 才是诚实的。

**而且 500 会让你的日志系统抓到它。** 返回 401 的话，它会被当成普通的未登录，永远没人发现。

### 为什么查 `tenants` 要多一次

**这是客户停用、欠费、试用到期的统一开关。**

```text
客户欠费 → update tenants set status = 'suspended'
         → 这个客户下所有人立刻不能用了，不用去改每个用户
```

**没有这道检查，你只能一个个禁用用户，漏一个就漏一个。**

### 为什么把 `status` 放在租户上而不是用户上

**因为付款的是公司，不是员工。** 这个判断以后在收费、配额、试用期上会反复用到。

## 4.3 挂一个 `/api/me` 验证

**新建 `src/routes/me.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = express.Router();

router.get('/me', auth, tenant, (req, res) => {
  res.json({
    user: { id: req.user.id, email: req.user.email, role: req.user.role },
    tenant: { id: req.tenant.id, name: req.tenant.name, plan: req.tenant.plan },
  });
});

module.exports = router;
```

**在 `server.js` 里加一行：**

```js
const meRoutes = require('./routes/me');
app.use('/api', meRoutes);
```

**重启服务，测：**

```text
curl http://localhost:3000/api/me -b cookies.txt
```

**你会看到：**

```json
{"user":{"id":"...","email":"a@a.com","role":"owner"},"tenant":{"id":"...","name":"客户甲","plan":"free"}}
```

**不带 cookie 测一次：**

```text
curl http://localhost:3000/api/me
```

**返回：**

```json
{"error":"未登录"}
```

**这两条都对了，说明中间件链路通了。**

**自检点：现在改数据库里那个租户的 `status`，看接口会怎样。**

```sql
update tenants set status = 'suspended' where name = '客户甲';
```

**再请求 `/api/me`：**

```json
{"error":"账户已停用，请联系客服"}
```

**改回来：**

```sql
update tenants set status = 'active' where name = '客户甲';
```

**这个开关是你在客户欠费时唯一要动的地方。记住它。**

---

# 第 5 步：故意写错一次（15 分钟）

**现在把第 0 步那个错误写法真的实现一遍，亲眼看到它怎么被利用。**

## 5.1 建第二个租户和它的数据

**注册第二个客户：**

```text
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"company\":\"客户乙\",\"email\":\"b@b.com\",\"password\":\"12345678\"}" -c cookies-b.txt
```

**登录客户乙之后，往数据库里塞一条消息：**

```sql
-- 先查客户乙的租户 id
select id, name from tenants;
```

**复制客户乙的 id，插数据：**

```sql
insert into conversations (tenant_id, title) values ('客户乙的id', '乙的私密对话') returning id;
```

```sql
insert into messages (tenant_id, conversation_id, role, content)
values ('客户乙的id', '上一步返回的conversation id', 'user', '这是客户乙不能外泄的内容');
```

## 5.2 加一个错误接口

**在 `src/routes/me.js` 里临时加：**

```js
// ❌ 只有这一节用来演示，演示完删掉
router.get('/bad-messages', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] || req.user.tenant_id;
  const pool = require('../db/pool');
  const { rows } = await pool.query(
    'select id, content from messages where tenant_id = $1',
    [tenantId]
  );
  res.json(rows);
});
```

**注意这一行：**

```js
const tenantId = req.headers['x-tenant-id'] || req.user.tenant_id;
```

**写法看起来还挺"贴心"——没传就用自己家的。**

**这就是最典型的漏洞形状：一个"为了方便测试"的后门。**

## 5.3 攻击

**用客户甲的身份（`cookies.txt`），去读客户乙的数据：**

**先查客户乙的租户 id：**

```sql
select id, name from tenants where name = '客户乙';
```

**然后：**

```text
curl http://localhost:3000/api/bad-messages -b cookies.txt -H "x-tenant-id: 客户乙的id"
```

**你会看到客户乙那条"不能外泄的内容"。**

**攻击成本：一条命令。攻击者需要的：一个别人家的租户 id。**

**而租户 id 会出现在哪里？** 分享链接里、导出的 Excel 里、客服截图里、你给客户看的演示环境里。**它不是秘密。**

## 5.4 删掉它

**把这一段从 `me.js` 里删掉，重启，再试同一条命令。**

**现在返回的是客户甲自己的消息（空），因为 `req.headers[...]` 那句已经不存在了。**

**这一节要带走的一句话：**

> **任何"从请求里读 tenant_id"的代码，不管有没有 `|| 兜底`，都是漏洞。兜底只会让漏洞更隐蔽。**

---

# 第 6 步：最终验收

## A. 代码

- [ ] `bcryptjs`、`jsonwebtoken`、`cookie-parser` 装好了
- [ ] `.env` 里有 `JWT_SECRET`，32 位以上随机串
- [ ] `POST /api/auth/register` 能建租户 + 用户（同一个事务）
- [ ] 重复邮箱注册返回 409，不会建出第二个公司
- [ ] `POST /api/auth/login` 能登录，返回 cookie
- [ ] `GET /api/me` 带 cookie 返回自己的信息，不带返回 401

## B. 中间件

- [ ] `auth.js` 验签之后还查了库（不是只验签）
- [ ] `tenant.js` 检查了 `status !== 'active'`
- [ ] 缺 `tenant_id` 返回 500，不是 401
- [ ] 我改过 `status = 'suspended'`，看到 403

## C. 安全

- [ ] token 的 payload 里只有 `uid`，没有 `tenant_id`
- [ ] cookie 有 `httpOnly`、`sameSite`
- [ ] 我实现过 `x-tenant-id` 那个漏洞，并用 curl 成功读到了客户乙的数据
- [ ] 我删掉了那段代码，再试已经读不到

## D. 理解

- [ ] 我能说清模型 A 和模型 B 的区别，以及什么时候该换
- [ ] 我知道为什么 token 里不放 `tenant_id`
- [ ] 我知道为什么登录失败统一返回一句话

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了这次攻击的完整命令

## 提交

```text
git add -A
git commit -m "第164节课: 注册登录 + auth/tenant 中间件"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `req.cookies` 是 `undefined` | 没挂 `cookieParser()` | `app.use(cookieParser())` 要在路由之前 |
| 登录成功但 `/api/me` 返回 401 | cookie 没带上 | 本地是 `http`，检查 `secure` 是不是被设成 `true` 了 |
| `secretOrPrivateKey must have a value` | `.env` 里没有 `JWT_SECRET`，或者 `dotenv` 没加载 | 确认 `require('dotenv').config()` 在文件最上面 |
| `Cannot find module 'bcrypt'` | 装的是 `bcrypt` 不是 `bcryptjs` | `npm uninstall bcrypt && npm install bcryptjs` |
| 注册接口 500，日志里是 `23505` | 唯一约束冲突 | 通常是把 `(tenant_id, email)` 改回了 `(email)` |
| `invalid signature` | 换了 `JWT_SECRET`，旧 token 失效 | 正常现象，重新登录 |
| `jwt expired` | token 过期 | 7 天，重登 |
| 两个公司同名也能注册 | `tenants.slug` 生成用了时间戳，不重复 | 正常，这一节不要求 slug 唯一可读 |
| 客户乙能看到客户甲消息 | 有接口从 header / query 读了 tenant_id | 全局搜 `headers[` 和 `query.tenant`，全部删掉 |
| 修改 `status` 后没生效 | 浏览器缓存了响应，或者服务没重启 | 加 `Cache-Control: no-store`，或者用 curl 测 |

---

## 本节课要能说出口的一句话

> **租户身份只能从"服务端验过的会话 + 数据库里的记录"推导，token 里只放你是谁，不放你属于谁；任何从请求参数读 tenant_id 的接口，不管写得多贴心，都是漏洞。**
