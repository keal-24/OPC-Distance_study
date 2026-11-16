# 第 165 节课：把查询封死在一个入口

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上一节解决了"租户身份从哪来"。这一节解决"每条 SQL 怎么保证带上了它"。
> **答案是：不靠自觉，靠结构。** 手写 `WHERE tenant_id = $1` 一定会漏，早晚的事。

**建议用时**：190 分钟（7 个步骤，含动手敲代码的时间）
**时间怎么排**：这一节偏长，建议分三次：第 0—2 步（60 分钟）→ 第 3—4 步（40 分钟）→ 第 5—6 步（90 分钟）。第二次断开之前 `npm run check` 应该是绿的；第三次断开之前 `rls-test.js` 应该全部通过。这两个都是很好的检查点。
**你需要先完成**：第 164 节课（注册登录能跑，`/api/me` 正常）

---

# 第 0 步：先算一下漏写的概率（10 分钟）

## 0.1 一个中型项目有多少条 SQL

**你现在只有六个接口。做完这一周，大概会有二十个。做完第 25、26 周，会有五十个。**

**一条接口平均写三条 SQL（列表、详情、写入），每条要带租户条件的地方平均两处（主查询 + 关联查询）。**

```text
50 个接口 × 3 条 SQL × 2 处 = 300 处
```

**假设你状态好的时候 99% 写对。**

```text
300 × 1% = 3 处漏写
```

**3 个漏洞。而且这些漏洞不会报错、不会告警、功能完全正常。**

**99% 的正确率在别的领域叫优秀，在这里叫"随时会被客户发现"。**

## 0.2 更麻烦的是：漏写的位置你猜不到

**最容易被漏掉的地方，通常不是主查询：**

```text
✅ 列表接口      你一定记得加条件
✅ 详情接口      你会记得
❌ 导出接口      你复制了旧代码，忘了改
❌ 文件下载      你觉得"这是文件不是数据"
❌ 搜索结果计数  你单独写了一条 count
❌ 后台管理接口  你觉得"只有我能访问"
❌ 定时任务      你觉得"没有请求，哪来的租户"
```

**最后两条最危险。** 后台和定时任务里常常直接拿 `pool.query` 跑 SQL，因为它们不经过路由、不经过中间件。

## 0.3 两条路

| 做法 | 结果 |
|---|---|
| 靠自觉：每条 SQL 自己记得写 `where tenant_id = $1` | 300 处里漏 3 处，半年后发现 |
| 靠结构：查询只能从一个入口出，入口自己带上租户 | 想漏也漏不掉 |

**这一节做第二种。具体是两层半：**

```text
第一层（代码）：所有查询走 withTenant()，路由里根本拿不到原始连接池
第二层（数据库）：行级安全（RLS），绕过第一层也读不到
那"半层"：一条受控的系统连接，只给"还不知道租户是谁"的那几处用
```

**前两层都做，第三层是被迫的。**

**不是不信任自己的代码，是代码会被改，包括被 AI 改。**

**那"半层"是这一节最反直觉的部分：** **RLS 不是"加上就完事"——它会让"登录"这个动作直接失效，因为登录的本质就是从零确定身份，而 RLS 要求你先知道身份。** **5.5 节专门处理这个矛盾。**

---

# 第 1 步：设计这个入口（15 分钟）

## 1.1 它要长什么样

**理想状态下，写业务代码的人应该是这样用的：**

```js
router.get('/conversations', auth, tenant, async (req, res) => {
  const rows = await withTenant(req.tenant.id, (db) => db.conversations.list());
  res.json(rows);
});
```

**注意这条路由里：**

```text
✅ 有 req.tenant.id
✅ 有 withTenant
❌ 没有 SQL
❌ 没有 $1
❌ 没有 pool
```

**写这条路由的人，就算完全不知道"多租户"是什么，也漏不了。** 因为他手上根本没有能执行裸 SQL 的东西。

**这就是"靠结构"的意思：让错误的写法写不出来。**

## 1.2 三个设计决定

**决定一：仓储方法里，`tenant_id` 不通过参数传，从闭包里拿。**

```js
function createRepo(client, tenantId) {
  return {
    conversations: {
      list: () => client.query(
        'select * from conversations where tenant_id = $1', [tenantId]
      ),
      //                                ↑ 从闭包来，调用方没法传错
    },
  };
}
```

**对比错误的写法：**

```js
// ❌ tenantId 作为参数 —— 调用方可以传别人的
db.conversations.list(tenantId)
```

**参数能被传错、能被省略、能被 AI 顺手改成 `req.body.tenantId`。闭包不能。**

**决定二：SQL 里仍然显式写 `tenant_id = $1`，不完全依赖 RLS。**

**因为 RLS 只在 PostgreSQL 上有，而且配置错了会静默失效**（下面第 5 步会看到它有个大坑）。显式写条件，是给自己留的证据。

**决定三：每个请求一个事务。**

**这样 RLS 的上下文（`app.tenant_id`）能干净地随事务销毁，不会串到下一个请求。**

**这件事必须做对。** 连接池复用连接，如果租户上下文没清，下一个用到这条连接的请求会继承上一个租户的身份——**这是 RLS 最经典的事故。**

---

# 第 2 步：写 `src/db/tenant-db.js`（35 分钟）

```js
const pool = require('./pool');

function createRepo(client, tenantId) {
  return {
    conversations: {
      async list(limit = 20) {
        const { rows } = await client.query(
          `select id, title, created_at
           from conversations
           where tenant_id = $1
           order by created_at desc
           limit $2`,
          [tenantId, limit]
        );
        return rows;
      },

      async find(id) {
        const { rows } = await client.query(
          `select id, title, created_at
           from conversations
           where tenant_id = $1 and id = $2`,
          [tenantId, id]
        );
        return rows[0] || null;
      },

      async create(title) {
        const { rows } = await client.query(
          `insert into conversations (tenant_id, title)
           values ($1, $2)
           returning id, title, created_at`,
          [tenantId, title]
        );
        return rows[0];
      },

      async rename(id, title) {
        const { rows } = await client.query(
          `update conversations
           set title = $1
           where tenant_id = $2 and id = $3
           returning id, title`,
          [title, tenantId, id]
        );
        return rows[0] || null;
      },

      async remove(id) {
        const { rowCount } = await client.query(
          'delete from conversations where tenant_id = $1 and id = $2',
          [tenantId, id]
        );
        return rowCount > 0;
      },
    },

    messages: {
      async listByConversation(conversationId, limit = 100) {
        const { rows } = await client.query(
          `select id, role, content, created_at
           from messages
           where tenant_id = $1 and conversation_id = $2
           order by created_at asc
           limit $3`,
          [tenantId, conversationId, limit]
        );
        return rows;
      },

      async add(conversationId, role, content) {
        const { rows } = await client.query(
          `insert into messages (tenant_id, conversation_id, role, content)
           values ($1, $2, $3, $4)
           returning id, role, content, created_at`,
          [tenantId, conversationId, role, content]
        );
        return rows[0];
      },

      async count() {
        const { rows } = await client.query(
          'select count(*)::int as n from messages where tenant_id = $1',
          [tenantId]
        );
        return rows[0].n;
      },
    },

    files: {
      async list(limit = 50) {
        const { rows } = await client.query(
          `select id, name, size, created_at
           from files
           where tenant_id = $1
           order by created_at desc
           limit $2`,
          [tenantId, limit]
        );
        return rows;
      },

      async find(id) {
        const { rows } = await client.query(
          'select id, name, path, size from files where tenant_id = $1 and id = $2',
          [tenantId, id]
        );
        return rows[0] || null;
      },
    },
  };
}

async function withTenant(tenantId, fn) {
  if (!tenantId) {
    throw new Error('withTenant 需要一个租户 id');
  }

  const client = await pool.connect();

  try {
    await client.query('begin');

    await client.query("select set_config('app.tenant_id', $1, true)", [
      String(tenantId),
    ]);

    const db = createRepo(client, tenantId);
    const result = await fn(db);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withTenant };
```

## 2.1 逐段讲五个关键点

### `set_config('app.tenant_id', $1, true)` 这一句

**它在干什么：给当前事务打一个标记，把"现在是哪个租户在操作"写进数据库会话。**

**参数 `true` 的意思是"只在这个事务里有效"，事务结束自动清空。**

**为什么必须是 `true`：**

```text
设成 false 或省略 → 这个连接上一直带着这个租户
                  → 连接被还回池子、被别的租户的请求拿走
                  → 那个请求的 RLS 会认为自己是这个租户
                  → 数据串了，而且是随机的、偶发的、极难复现的
```

**这是 RLS 最经典的事故，事故报告里通常写成"偶发数据错乱，无法复现"。**

**`String(tenantId)` 也要解释：** `set_config` 第二个参数要求文本，传 uuid 对象某些驱动版本会报参数类型错误。

### `begin` / `commit` / `rollback`

**一个请求一个事务。** 三个好处：

```text
① RLS 上下文随事务销毁，绝对不串
② 一次请求里多处写入，要么全成要么全败
③ 出错了 `rollback` 自动回滚，不用手工清理
```

**代价：事务开得久了会锁住行、占着连接。** 所以 `fn` 里不能有慢操作——**特别是不要在里面调大模型接口。**

```js
// ❌ 绝对不要这样
await withTenant(tenantId, async (db) => {
  const msg = await db.messages.add(cid, 'user', text);
  const reply = await fetch('https://api.openai.com/...');   // 等 20 秒
  await db.messages.add(cid, 'assistant', reply);
});
```

**这 20 秒里事务一直开着，数据库连接被占着。** 十个并发就把连接池占满，第 11 个请求开始排队等 5 秒后超时。

**正确做法：先在事务里存用户消息、提交；调完模型再开一个新事务存回复。**

```js
await withTenant(tenantId, (db) => db.messages.add(cid, 'user', text));
const reply = await callModel(text);
await withTenant(tenantId, (db) => db.messages.add(cid, 'assistant', reply));
```

**这个坑第 16 周（异步与队列）会专门处理，现在先知道"事务里不能等慢操作"。**

### `find` 返回 `null` 而不是抛错

```js
return rows[0] || null;
```

**因为"找不到"有两种情况，而这两种必须返回一样的结果：**

```text
① 这个 id 不存在
② 这个 id 存在，但是别人家的
```

**两种情况都返回 `null`，路由层统一 404。** 攻击者没法通过"403 还是 404"来判断这个 id 到底存不存在。

**这就是第 0 步说的"403 会泄露存在性"。**

### `remove` 返回布尔而不是行数

```js
return rowCount > 0;
```

**因为调用方只需要知道"删没删掉"。** 暴露具体行数没有意义，而且万一哪天条件写错删了 100 行，返回值会变成一个刺眼的 100——**但只有你注意到才有用。**

**写成布尔，行为是"删了 / 没删"，测试也好写。**

### 为什么这些方法都不接受 `tenantId` 参数

**再强调一次：因为参数能被传错。**

**给 AI 写代码时的差别：**

```text
有参数：AI 看到 db.messages.list(cid, tenantId)，它可能改成 db.messages.list(cid, req.body.tenantId)
       ——因为看起来"tenantId 就是个参数，传进去就行"

无参数：AI 只能写 db.messages.list(cid)，它没有地方塞 tenantId
       ——想塞也塞不进去
```

**把安全约束从"人的记忆"搬到"函数的签名"，这是这一节最重要的思想。**

---

# 第 3 步：改路由，只用 `withTenant`（20 分钟）

## 3.1 新建 `src/routes/conversations.js`

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');

const router = express.Router();

router.use(auth, tenant);

router.get('/', async (req, res, next) => {
  try {
    const rows = await withTenant(req.tenant.id, (db) => db.conversations.list());
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const title = (req.body.title || '新对话').trim();

  if (title.length === 0 || title.length > 100) {
    return res.status(400).json({ error: '标题要在 1—100 字之间' });
  }

  try {
    const row = await withTenant(req.tenant.id, (db) => db.conversations.create(title));
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await withTenant(req.tenant.id, (db) => db.conversations.find(req.params.id));
    if (!row) {
      return res.status(404).json({ error: '对话不存在' });
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  const title = (req.body.title || '').trim();

  if (title.length === 0 || title.length > 100) {
    return res.status(400).json({ error: '标题要在 1—100 字之间' });
  }

  try {
    const row = await withTenant(req.tenant.id, (db) =>
      db.conversations.rename(req.params.id, title)
    );
    if (!row) {
      return res.status(404).json({ error: '对话不存在' });
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await withTenant(req.tenant.id, (db) =>
      db.conversations.remove(req.params.id)
    );
    if (!ok) {
      return res.status(404).json({ error: '对话不存在' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**注意 `router.use(auth, tenant)` 这一行。** 它让下面五个路由全都要先过认证和租户检查，不用每条都写一遍。

**这就是为什么中间件要拆成两个：拆开了才能这样组合。**

## 3.2 新建 `src/routes/messages.js`

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');

const router = express.Router();

router.use(auth, tenant);

router.get('/:conversationId', async (req, res, next) => {
  const { conversationId } = req.params;

  try {
    const result = await withTenant(req.tenant.id, async (db) => {
      const conv = await db.conversations.find(conversationId);
      if (!conv) {
        return null;
      }
      const messages = await db.messages.listByConversation(conversationId);
      return { conversation: conv, messages };
    });

    if (!result) {
      return res.status(404).json({ error: '对话不存在' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:conversationId', async (req, res, next) => {
  const { conversationId } = req.params;
  const content = (req.body.content || '').trim();

  if (content.length === 0 || content.length > 4000) {
    return res.status(400).json({ error: '内容要在 1—4000 字之间' });
  }

  try {
    const msg = await withTenant(req.tenant.id, async (db) => {
      const conv = await db.conversations.find(conversationId);
      if (!conv) {
        return null;
      }
      return db.messages.add(conversationId, 'user', content);
    });

    if (!msg) {
      return res.status(404).json({ error: '对话不存在' });
    }
    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**注意"先 `find` 一次再写"这个动作。**

**为什么不直接 `insert`？** 因为 `messages` 有复合外键，往别人家的对话里插会被数据库拒绝（第 163 节做的）。**但那样会抛出 `23503` 错误，返回 500。**

**先 `find` 一次的意义是两个：**

```text
① 返回体面的 404，而不是 500
② 少一次异常处理
```

**多一次查询（几毫秒）换一个干净的响应，值得。**

## 3.3 挂到 `server.js`

```js
const conversationsRoutes = require('./routes/conversations');
const messagesRoutes = require('./routes/messages');

app.use('/api/conversations', conversationsRoutes);
app.use('/api/conversations', messagesRoutes);
```

**两条路由都挂 `/api/conversations`，为什么不冲突：**

```text
GET  /api/conversations            → conversations.js 里的 '/'
GET  /api/conversations/:id        → conversations.js 里的 '/:id'
GET  /api/conversations/:conversationId/messages
```

**等等，最后一条路径对不上。** `messages.js` 里写的是 `/:conversationId`，挂在 `/api/conversations` 就是 `/api/conversations/:conversationId`，和 `/:id` 撞了。

**改一下 `messages.js` 里的路径：**

```js
router.get('/:conversationId/messages', ...)
router.post('/:conversationId/messages', ...)
```

**这样就不冲突了。重启服务测试：**

```text
curl http://localhost:3000/api/conversations -b cookies.txt
```

**返回：**

```json
[]
```

**新建一个：**

```text
curl -X POST http://localhost:3000/api/conversations -b cookies.txt -H "Content-Type: application/json" -d "{\"title\":\"第一个对话\"}"
```

**自检点：现在你的 `src/routes/` 里，一条 `pool.query` 都不应该有。**

**搜一遍：**

```text
grep -rn "pool.query" src/routes/
```

**结果应该是空。**

---

# 第 4 步：加一个检查脚本，防止以后退回去（20 分钟）

**规矩写在文档里没用，写成脚本才有用。** 因为三个月后你会忘，AI 更不知道有这条规矩。

## 4.1 写 `scripts/check-tenant.js`

```js
const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'src', 'routes');
const patterns = [
  { re: /pool\.query/g, why: '路由里直接用了连接池，绕过了租户隔离' },
  { re: /require\(['"]\.\.\/db\/pool['"]\)/g, why: '路由里直接引了 pool' },
  { re: /req\.(body|query|headers)[^\n]*tenant/i, why: '从请求里读了 tenant' },
  { re: /x-tenant-id/gi, why: '出现了 x-tenant-id 请求头' },
];

let problems = 0;

for (const name of fs.readdirSync(routesDir)) {
  if (!name.endsWith('.js')) continue;

  const file = path.join(routesDir, name);
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    for (const p of patterns) {
      p.re.lastIndex = 0;
      if (p.re.test(line)) {
        console.log(`❌ ${name}:${i + 1}  ${p.why}`);
        console.log(`   ${line.trim()}`);
        problems += 1;
      }
    }
  });
}

if (problems === 0) {
  console.log('✅ 路由层检查通过');
} else {
  console.log(`\n共 ${problems} 处问题`);
  process.exitCode = 1;
}
```

**跑：**

```text
node scripts/check-tenant.js
```

**应该输出：**

```text
✅ 路由层检查通过
```

## 4.2 故意让它抓到一次

**在 `conversations.js` 里临时加一行注释掉的代码：**

```js
// const t = req.query.tenant_id;
```

**再跑脚本：**

```text
❌ conversations.js:23  从请求里读了 tenant
   // const t = req.query.tenant_id;
```

**注意：注释掉的代码也算。**

**这不是误报。** 注释掉的代码是最危险的——**因为你三个月后可能把注释解开，或者 AI 看到注释以为是"参考实现"照抄一遍。**

**删掉，别留。**

## 4.3 再加一段：把 `systemPool` 全部列出来

**第 5.4 节引入了 `systemPool`——一个合法的越权入口。**

**它能不能用对，全靠你记得"哪几处是故意的"。** **所以脚本要反过来做一件事：不报错，只列清单。**

**在 `check-tenant.js` 末尾（`process.exitCode` 那段之前）加：**

```js
// systemPool 是"合法的越权"，不禁止，但必须让人看见
const srcDir = path.join(__dirname, '..', 'src');
const uses = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);

    if (fs.statSync(full).isDirectory()) {
      walk(full);
      continue;
    }

    if (!name.endsWith('.js')) continue;

    const lines = fs.readFileSync(full, 'utf8').split('\n');

    lines.forEach((line, i) => {
      if (/systemPool\.(query|connect)/.test(line)) {
        uses.push({
          file: path.relative(srcDir, full).replace(/\\/g, '/'),
          line: i + 1,
          code: line.trim(),
        });
      }
    });
  }
}

walk(srcDir);

console.log('\n— 绕过 RLS 的位置（每一条都要能说出理由）—');

if (uses.length === 0) {
  console.log('  （没有）');
} else {
  for (const u of uses) {
    console.log(`  ${u.file}:${u.line}  ${u.code}`);
  }
}

console.log(`  共 ${uses.length} 处`);
```

**跑一遍，你现在应该看到三处：**

```text
— 绕过 RLS 的位置（每一条都要能说出理由）—
  middleware/auth.js:19  const { rows } = await systemPool.query(
  routes/auth.js:31  const { rows } = await systemPool.query(
  routes/auth.js:88  const client = await systemPool.connect();
  共 3 处
```

**这三处正好对应 5.4 节那张表的前三行。** **数字对得上，说明你没有多开、也没有漏改。**

**以后每加一处 `systemPool`，这个数字就 +1。** **加的时候你要能在心里回答一句："这里确实还不知道租户是谁。"**

**回答不出来，就说明你写错了，应该用 `withTenant`。**

**这个脚本不改 `exitCode`，只打印。** **因为它不是"错误"，是"需要人判断的地方"——工具不该替你判断安全边界，只该让边界清晰可见。**

## 4.4 加到 `package.json`

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "ping": "node scripts/ping.js",
    "migrate": "node scripts/migrate.js",
    "check": "node scripts/check-tenant.js",
    "test": "node tests/isolation.test.js"
  }
}
```

**以后每次提交之前跑一次 `npm run check`。**

**这个习惯比任何文档都管用：**

```text
写代码 → npm run check → 绿了 → 提交
```

**四个月后 AI 帮你加了一个接口，忘了走 `withTenant`，这个脚本会拦下来。**

---

# 第 5 步：第二层门 —— 数据库行级安全（75 分钟）

**第一层门（仓储层）能挡住"正常写代码的自己"。但它挡不住两件事：**

```text
① 你在 scripts/ 里写了一个一次性脚本，直接 pool.query
② 你为了"应急查一下"，直接在数据库客户端里跑了 SQL
```

**第二层门放在数据库里，绕过应用也能拦。**

## 5.1 新建 `migrations/005_rls.sql`

```sql
alter table conversations enable row level security;
alter table conversations force row level security;

alter table messages enable row level security;
alter table messages force row level security;

alter table files enable row level security;
alter table files force row level security;

alter table users enable row level security;
alter table users force row level security;

create policy tenant_isolation on conversations
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_isolation on messages
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_isolation on files
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_isolation on users
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

## 5.2 两个必须理解的词 + 一个会让你白折腾的坑

### `force row level security` —— 少了这一句，整段白写

**默认情况下，RLS 对表的所有者（owner）不生效。**

```sql
-- 只写这句
alter table messages enable row level security;
```

**效果：策略建好了，但你建表用的那个账号是 owner，**直接无视它**，该读到什么读到什么。**

**你会以为 RLS 生效了，实际上一点用都没有。**

**`force` 的意思就是"连 owner 也要受策略约束"。**

**这个坑非常隐蔽：策略建了、语句没报错、查询也正常返回——只是隔离不存在。**

### ⚠️ 但 `force` 对超级用户无效 —— 这一条会让你白折腾一小时

**PostgreSQL 文档里有一句硬话：**

```text
Superusers and roles with the BYPASSRLS attribute
always bypass the row security system when accessing a table.
```

**翻译：** **超级用户，以及带 `BYPASSRLS` 属性的角色，**永远**绕过 RLS——不管你有没有写 `force`。**

**而第 162 节让你用 `postgres` 连的。`postgres` 就是超级用户。**

**所以如果你的 `.env` 是：**

```text
DATABASE_URL=postgres://postgres:密码@localhost:5432/saas_lab
```

**那么你写一百个 `force`，策略一个都不会生效。**

**具体表现：** **5.3 节那个验证脚本会输出**

```text
不设上下文能读到几条消息： 2      ← 而你期望是 0
```

**你会以为是 `force` 没生效，回去反复检查那五行 SQL——** **查半天也查不出来，因为问题不在 SQL，在"你用什么身份连的"。**

**这是一个会让你怀疑自己的坑。** **先看清楚，再往下做。**

## 5.3 先建两个数据库角色

**既然超级用户永远绕过 RLS，那你的应用就不能用 `postgres` 连。**

**建两个角色，各管一件事：**

**用 `psql` 连上数据库（要用 `postgres` 身份，因为它有建角色的权限）：**

```text
psql -U postgres -d saas_lab
```

**然后逐段执行（`密码自己换`）：**

```sql
-- ① 应用角色：受 RLS 约束，日常业务全用它
create role app_user login password '换成你的密码';

grant connect on database saas_lab to app_user;
grant usage on schema public to app_user;

-- 现在库里已有的表
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;

-- 以后新建的表也自动授（必须写，否则每次加表都要手动 grant）
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public
  grant usage, select on sequences to app_user;
```

```sql
-- ② 系统角色：绕过 RLS，只给"还不知道租户"的路径用
create role app_system login password '换成另一个更长的密码' bypassrls;

grant connect on database saas_lab to app_system;
grant usage on schema public to app_system;

alter default privileges in schema public
  grant select, insert, update, delete on tables to app_system;
alter default privileges in schema public
  grant usage, select on sequences to app_system;
```

**三个关键点，每一个不加都会出问题：**

**一、`app_user` 绝对不能有 `superuser` 或 `bypassrls`。**

**这是整套设计的根基。** **有任何一个，RLS 就形同虚设。**

**验证一下（这句很重要）：**

```sql
select rolname, rolsuper, rolbypassrls
from pg_roles
where rolname in ('app_user', 'app_system', 'postgres');
```

**期望：**

```text
 rolname    | rolsuper | rolbypassrls
------------+----------+--------------
 app_system | f        | t          ← 只有它是 t
 app_user   | f        | f          ← 必须是 f / f
 postgres   | t        | t
```

**如果 `app_user` 那行的 `rolsuper` 是 `t`，说明你建角色时写错了，删掉重建。**

**二、`alter default privileges` 那两句不能省。**

**它管的是"以后新建的表自动授权"。** **不写的话，你每加一张表都要手动 `grant` 一次——** **忘了就报 `permission denied for table xxx`。** **而且这个报错出现的时间点很随机（通常是跑到某节课中途），很难联想到权限。**

**注意：`alter default privileges` 只对"执行这句之后新建的表"生效。** **前面已经建的表，靠上面那句 `on all tables` 授。**

**三、`app_system` 给了 `bypassrls`，但不要给它 `superuser`。**

**`bypassrls` 只做一件事：绕过行级安全。** **`superuser` 能做所有事，包括 `drop database`。**

**最小权限：够用就行。**

### 改 `.env`，从现在开始用 `app_user`

```text
DATABASE_URL=postgres://app_user:你的密码@localhost:5432/saas_lab
SYSTEM_DATABASE_URL=postgres://app_system:另一个密码@localhost:5432/saas_lab
```

**两个连接串都改了。**

**注意：** **`SYSTEM_DATABASE_URL` 是 5.4 节才要用的，但现在就写进 `.env`，避免到时候忘了。**

**改完之后立刻验证：**

```text
npm run ping
```

**如果报：**

```text
error: permission denied for table schema_migrations
```

**说明 `grant ... on all tables` 没跑到，或者你在我给的 SQL 里漏了一段。回 `psql` 里重跑那两句 `grant`。**

**这个报错本身就是个好消息：它证明你的应用连的确实不是超级用户了。** **超级用户不会有权限问题。**

### 如果你用的是云端数据库

**Neon / Supabase / Railway 给的那个连接串，用户一般**不是**超级用户。**

**所以 RLS 会生效，但你可能没有权限建新角色。**

**这种情况下的做法：**

```text
① 用平台给的那个用户当 app_user —— 通常它已经没有 bypassrls
② app_system 用平台的 "superuser" 连接串（Neon 的 "Postgres role" 一般可以）
   如果没有，就把 SYSTEM_DATABASE_URL 也指向同一个用户，
   然后在需要绕过 RLS 的地方改用"临时设一个通用租户上下文"的方案
```

**Supabase 特别要注意：** **它默认给你的 `postgres` 角色其实是 `supabase_admin` 的成员，行为接近超级用户。** **用 `select rolname, rolsuper, rolbypassrls from pg_roles` 那条查一下，别猜。**

**如果云端实在给不了两个角色：** **这一节的 RLS 部分你可以只"理解"，不"验证"。** **但你要知道，那样你的系统只有仓储层一层防护。** **把这一点写进 `docs/上线清单.md`。**

### `nullif(..., '')::uuid` —— 少了这个，没设上下文时直接报错

**`current_setting('app.tenant_id', true)` 在没设置过的时候返回空字符串，不是 `null`。**

**直接 `::uuid` 转空字符串会报：**

```text
invalid input syntax for type uuid: ""
```

**用 `nullif(..., '')` 把它变成真正的 `null`，然后再转 uuid。**

**`null` 和任何值比较的结果都是"不成立"，所以策略不通过，返回 0 行。**

**也就是说：没设租户上下文 = 什么都查不到。这是对的。**

## 5.4 验证 RLS 真的生效

**写一个临时脚本 `scripts/rls-test.js`：**

**注意它 `require` 的是 `pool`（也就是 `app_user`），不是 `systemPool`。** **`systemPool` 有 `bypassrls`，用它测什么都"通过"，等于没测。**

```js
const pool = require('../src/db/pool');

(async () => {
  // 先自证身份：如果这里是超级用户，后面全白测
  const who = await pool.query(
    `select current_user as me,
            (select rolsuper from pg_roles where rolname = current_user) as is_super,
            (select rolbypassrls from pg_roles where rolname = current_user) as bypass`
  );

  console.log('当前连接身份：', who.rows[0]);

  if (who.rows[0].is_super || who.rows[0].bypass) {
    console.error('\n❌ 这个连接是超级用户或带 BYPASSRLS，RLS 对它永远无效。');
    console.error('   把 DATABASE_URL 改成 app_user 再跑。');
    await pool.end();
    process.exit(1);
  }

  const t = await pool.query("select id, name from tenants order by created_at limit 2");
  console.log('租户：', t.rows.map((r) => r.name).join(' / '));

  const noCtx = await pool.query('select count(*)::int as n from messages');
  console.log('不设上下文能读到几条消息：', noCtx.rows[0].n);

  if (t.rows.length < 2) {
    console.log('只有一个租户，先注册第二个再测');
    await pool.end();
    return;
  }

  const a = t.rows[0].id;
  const b = t.rows[1].id;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id', $1, true)", [String(a)]);
    const onlyA = await client.query('select distinct tenant_id from messages');
    console.log('租户A 上下文能看到的 tenant_id：', onlyA.rows.map((r) => r.tenant_id));
    console.log('是不是只有 A：', onlyA.rows.every((r) => r.tenant_id === a));

    const bId = b;
    const insertBlocked = await (async () => {
      try {
        const conv = await client.query(
          'select id from conversations where tenant_id = $1 limit 1',
          [bId]
        );
        if (conv.rowCount === 0) return 'B 没有对话，跳过';
        await client.query(
          `insert into messages (tenant_id, conversation_id, role, content)
           values ($1, $2, 'user', '越权写入')`,
          [bId, conv.rows[0].id]
        );
        return false;
      } catch (err) {
        return err.message;
      }
    })();
    console.log('用 A 的上下文往 B 写：', insertBlocked === false ? '竟然成功了（错）' : '被拦住');
  } finally {
    await client.query('rollback');
    client.release();
    await pool.end();
  }
})();
```

**跑：**

```text
node scripts/rls-test.js
```

**第一行必须先看这个：**

```text
当前连接身份： { me: 'app_user', is_super: false, bypass: false }
```

**三个值都对，才有必要往下看。** **只要 `is_super` 或 `bypass` 是 `true`，脚本会直接报错退出——** **因为那种情况下后面的数字全部不可信。**

**然后看这两行：**

```text
租户： 客户甲 / 客户乙
不设上下文能读到几条消息： 0
```

**如果这个数字不是 0，说明 `force row level security` 没生效。**

**自检点：现在把 005 里的四个 `force` 全删掉，重跑一次。**

**你会看到"不设上下文能读到几条消息：2"。**

**这就是那个坑的真实样子：策略在，但不起作用。**

**改回来，别忘了。**

**再做一个反向实验（比上一个更值）：**

**把 `.env` 的 `DATABASE_URL` 临时改回 `postgres`，重跑这个脚本。**

**你会看到脚本在自证身份那一步就红了：**

```text
❌ 这个连接是超级用户或带 BYPASSRLS，RLS 对它永远无效。
   把 DATABASE_URL 改成 app_user 再跑。
```

**这个实验只用三十秒，但它能永久性地在你脑子里钉住一件事：** **RLS 生效的前提是"你的连接不是超级用户"，而不是"你写了 force"。**

**改回来。**

## 5.5 加了 RLS 之后，你的登录接口立刻就坏了

**这是这一节最重要的十五分钟。不做这一步，第 24 周后面的所有接口全部返回 401。**

**先想清楚一件事：`users` 表现在有 `force row level security` 了。**

**而 `src/middleware/auth.js` 里那句是这么写的：**

```js
const { rows } = await pool.query(
  'select id, email, role, tenant_id from users where id = $1',
  [payload.uid]
);
```

**它用的是 `pool`，没有 `withTenant`，也就没有 `app.tenant_id`。**

**结果：**

```text
登录成功了（token 签出来了）
↓
下一个请求带 token → auth 中间件 → 查 users → 0 行
↓
返回 401 "账号不存在"
```

**客户的表现：** **登录页点"登录" → 跳转 → 立刻被踢回登录页 → 再登 → 再被踢。** **而他输的密码完全正确。**

**这就是 `force row level security` 的第一个代价，而且它砸的是最核心的那条路径。**

### 为什么不能用 withTenant 解决

**因为这是个死循环，和上一节小程序登录遇到的一模一样：**

```text
要设 tenant_id → 得知道这个用户属于哪个租户
要知道属于哪个租户 → 得先查 users
要查 users → 得先有 tenant_id
```

**`auth` 中间件的唯一职责就是"从 token 里的 uid 反查出这个人的一切"——它必然运行在"还不知道租户"的状态下。**

**同理还有三处：**

```text
auth.js        查 users           ← 最致命，所有接口都挂
tenant.js      查 tenants         ← tenants 表没有 RLS，暂时没事
登录路由        查 users（按 email） ← 直接查不到，登不进去
注册路由        插 users           ← with check 拦，插不进去
```

**所以这不是"某一处要改"，是"凡是在知道租户之前就要读写的表，都不能走 RLS"。**

### 建 `src/db/system-pool.js`

**新建这个文件：**

```js
const { Pool } = require('pg');
require('dotenv').config();

// 系统连接：绕过 RLS。
// 只给"还不知道租户是谁"的场景用：登录、注册、auth 反查、回调、定时任务。
// 其他任何地方用 pool + withTenant。
const systemPool = new Pool({
  connectionString: process.env.SYSTEM_DATABASE_URL || process.env.DATABASE_URL,
  max: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

systemPool.on('error', (err) => {
  console.error('[system-db] 空闲连接出错：', err.message);
});

module.exports = systemPool;
```

**`.env` 加一行：**

```text
SYSTEM_DATABASE_URL=postgres://postgres:你的密码@localhost:5432/saas_lab
```

**本地开发时它和 `DATABASE_URL` 一样。** **生产环境必须不一样——见本节最后。**

### 改三处，改完立刻验证

**第一处：`src/middleware/auth.js`**

```js
const jwt = require('jsonwebtoken');
const systemPool = require('../db/system-pool');   // ← 改这里

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

  // 这一句必须用 systemPool：
  // 此刻还不知道 tenant_id，用 pool 会被 RLS 拦成 0 行
  const { rows } = await systemPool.query(
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

**第二处：`src/routes/auth.js` 的登录**

**`select ... from users where email = $1` 这句换成 `systemPool.query`。**

**注意 `users` 的唯一约束是 `(tenant_id, email)`，不是 `email`。** **所以同一个邮箱在不同公司里可以各有一份——你的登录查询必须处理这个：**

```js
const { rows } = await systemPool.query(
  `select id, email, password_hash, role, tenant_id
   from users where email = $1
   order by created_at
   limit 2`,
  [email]
);

if (rows.length === 0) {
  return res.status(401).json({ error: '邮箱或密码不对' });
}

if (rows.length > 1) {
  // 同一个邮箱属于多家公司：让客户选，或者约定"只允许第一个"
  return res.status(409).json({
    error: '这个邮箱在多家公司都有账号，请联系管理员处理',
    code: 'MULTI_TENANT_EMAIL',
  });
}
```

**第三处：`src/routes/auth.js` 的注册**

**注册要 `insert into users`，`with check` 会拦住它（因为 `app.tenant_id` 是空）。**

**注册整个流程都在"还没有租户上下文"的状态下（先建 `tenants`，再建 `users`），所以整段都用 `systemPool`：**

```js
const client = await systemPool.connect();
```

**把这一个 `pool.connect()` 换成 `systemPool.connect()` 就够了，后面那些 `client.query` 全都不用改。**

### 验证：三步，缺一不可

**第一步：重启服务，用 curl 登录**

```text
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"alpha@test.local\",\"password\":\"test12345\"}" -c cookies.txt
```

**期望：**

```json
{"user":{"id":"...","email":"alpha@test.local","role":"owner"},"tenant":{"id":"...","name":"客户甲"}}
```

**如果返回 `401 邮箱或密码不对`，说明登录那次 `systemPool` 没生效。**

**第二步：用 cookie 打 `/api/me`**

```text
curl http://localhost:3000/api/me -b cookies.txt
```

**期望：** 正常的用户 + 租户信息。

**如果返回 `401 账号不存在`，说明 `auth` 中间件那次 `systemPool` 没生效。**

**第三步：确认业务接口仍然受 RLS 保护**

```text
curl http://localhost:3000/api/conversations -b cookies.txt
```

**期望：** 只返回自己公司的对话。

**这一步是反向验证——** **如果你把 `withTenant` 也改成了 `systemPool`，这里会返回所有公司的对话。** **那就白做了。**

### 三处改完后，这张表要背下来

| 场景 | 用哪个 | 为什么 |
|---|---|---|
| `auth` 里按 uid 查 user | `systemPool` | 还不知道租户 |
| 登录按 email 查 user | `systemPool` | 还不知道租户 |
| 注册建 tenant + user | `systemPool` | 还没有租户 |
| 业务接口的读写 | `pool` + `withTenant` | 知道租户，必须受 RLS 约束 |
| 支付回调按 order_no 反查租户 | `systemPool` | 还不知道租户 |
| 定时任务跨租户扫描 | `systemPool` | 有意跨租户 |
| 后台管理查所有租户 | `systemPool` | 有意跨租户 |

**判据只有一句话：** **"执行这条 SQL 的那一刻，我知道租户是谁吗？"** **不知道 → `systemPool`；知道 → `withTenant`。**

### 上线前把 `app_system` 的权限收紧

**5.3 节建的 `app_system` 我给了 `alter default privileges ... on tables`——** **也就是"以后所有新表都自动给它权限"。**

**这在开发阶段是必要的（不然每加一张表你都要手动 `grant`，忘了就报 `permission denied`）。** **但它意味着：`app_system` 最终能读写你所有的表。**

**这不是最小权限。上线前必须收紧：**

```sql
-- 先收掉宽授权
revoke all on all tables in schema public from app_system;

-- 只给四张表，只给需要的动作
grant select on tenants to app_system;
grant select, insert, update on users, wechat_users, invite_codes to app_system;
grant select, insert, update on wechat_messages to app_system;
grant select, insert, update on wechat_subscribe_grants to app_system;
```

**为什么后两张也要：** **第 194 节的订阅消息，`sendOrderStatus` 里的写操作走的是 `withTenantFromPool`（`app_user`）——** **但 `scripts/retry-messages.js` 那个重试脚本跨租户扫，用的是 `systemPool`。** **它需要读写 `wechat_messages`。**

**所以是六张表，不是四张。** **我第一版只写了四张，跑重试脚本时会报 `permission denied for table wechat_messages`。**

**这个权限清单不要求你现在做。** **但把它复制到 `docs/上线清单.md`，标上"必须"，并写清一件事：** **上线后如果你加了新表，而新表也需要被 `systemPool` 访问，你得回来加一行 `grant`。** **忘了就会在某个深夜收到 `permission denied`。**

## 5.6 RLS 的代价

**说清代价，你才知道什么时候该用它。**

```text
✅ 绕过应用也拦得住
✅ 新增的表只要加了策略，历史代码自动受保护
❌ 每条查询多一层判断，性能损失 5%—15%（这个规模感觉不到）
❌ 报错信息会很奇怪：明明有数据，查出来 0 行
❌ 事务里必须设上下文，忘了就是 0 行
❌ 凡是"还没确定租户"的路径，都得单独开一条 systemPool，多维护一套连接
```

**第四条最容易浪费你的时间。**

**以后遇到"数据明明在库里，接口返回空"，第一个要查的是：这个请求有没有设 `app.tenant_id`。**

**第五条最容易留下安全隐患。** **`systemPool` 是一个"合法的越权入口"，它必须被严格限制用途。** **第 166 节会写一个脚本，把所有 `systemPool` 的使用位置列出来——你要能对每一处说出"为什么这里必须绕过 RLS"。**

**这两条排查经验都记在笔记里。**

---

# 第 6 步：故意写一个漏租户的 UPDATE（15 分钟）

**这是这一节最该亲手做一次的事。** 因为漏写的 `SELECT` 你能看出来，漏写的 `UPDATE` 你看不出来。

## 6.1 写一个错的

**新建 `scripts/bad-update.js`：**

```js
const pool = require('../src/db/pool');

(async () => {
  const before = await pool.query(
    "select title, tenant_id from conversations order by created_at"
  );
  console.log('改之前：');
  before.rows.forEach((r) => console.log('  ', r.tenant_id.slice(0, 8), r.title));

  const result = await pool.query(
    "update conversations set title = '我改的' where id = $1",
    [before.rows[0].id]
  );
  console.log('影响行数：', result.rowCount);

  await pool.end();
})();
```

**注意这条 SQL：`where id = $1`。没有 `tenant_id`。**

**跑：**

```text
node scripts/bad-update.js
```

**它改成功了，影响 1 行，没有任何报错。**

## 6.2 为什么这个比 SELECT 漏写更危险

```text
SELECT 漏写 → 你看到多余的（或别人的）数据 → 界面不对劲 → 你发现
UPDATE 漏写 → 界面上一切正常 → 你改的是别人的数据 → 谁都没发现
DELETE 漏写 → 同理，别人的数据没了，客户来投诉才知道
```

**而且 `id` 是 UUID，你猜不到别人的 id，看起来"很安全"。**

**但 id 会泄露：**

```text
① 客户分享链接里的 id
② 导出的 Excel 里的 id 列
③ 你自己在客服时截图给客户的表格
④ 前端页面源码里的 hidden input
⑤ 接口返回体里带出来的每一个 id
```

**所以"UUID 猜不到"是一层防护，不是隔离。**

## 6.3 改成对的

**在 `tenant-db.js` 里，`rename` 方法已经是这样：**

```sql
update conversations
set title = $1
where tenant_id = $2 and id = $3
```

**注意 `rowCount` 的差别：**

```text
漏租户：改到了别人那一行 → rowCount = 1 → 你以为成功了
带租户：别人的行不匹配   → rowCount = 0 → 返回 404 → 你立刻知道有问题
```

**所以 `rowCount === 0` 不只是一个返回值，它是你的告警信号。**

**路由里必须处理它：**

```js
if (!row) {
  return res.status(404).json({ error: '对话不存在' });
}
```

**写 `res.json(row)` 而不判断，等于把这个信号扔掉了。**

## 6.4 清理

**删掉 `scripts/bad-update.js`（或者留着，改成永远不跑）。**

**把刚才被改的那条对话标题改回来。** 这一节故意破坏的数据要自己收拾。

---

# 第 7 步：最终验收

## A. 仓储层

- [ ] `src/db/tenant-db.js` 存在，导出 `withTenant`
- [ ] 所有方法都显式写了 `tenant_id = $n`
- [ ] 没有任何方法接受 `tenantId` 参数
- [ ] `find` / `rename` / `remove` 找不到时返回 `null` / `false`，不抛错

## B. 路由层

- [ ] `src/routes/` 里搜不到 `pool.query`
- [ ] `src/routes/` 里搜不到 `require('../db/pool')`
- [ ] 每条路由都用了 `withTenant`
- [ ] 找不到资源时返回 404，不是 200 空对象，也不是 403

## C. 检查脚本

- [ ] `npm run check` 输出"✅ 路由层检查通过"
- [ ] 我加过一行注释形式的 `req.query.tenant_id`，脚本能抓到
- [ ] `package.json` 里有 `check` 这个 script
- [ ] 脚本末尾会打印"绕过 RLS 的位置"清单
- [ ] 那个清单现在是 **3 处**（`middleware/auth.js` 1 处 + `routes/auth.js` 2 处）

## D. RLS

- [ ] 005 迁移跑过，四张表都有 `enable` 和 `force`
- [ ] **建了 `app_user`（无 super / 无 bypassrls）和 `app_system`（有 bypassrls）**
- [ ] `select rolname, rolsuper, rolbypassrls from pg_roles` 查过，`app_user` 是 `f / f`
- [ ] `.env` 的 `DATABASE_URL` 已经是 `app_user`，不是 `postgres`
- [ ] `npm run ping` 用 `app_user` 能通
- [ ] `rls-test.js` 第一行输出 `is_super: false, bypass: false`
- [ ] `rls-test.js` 里"不设上下文能读到几条消息"是 0
- [ ] 我删过 `force`，看到它变成非 0，再改回来
- [ ] **我把 `DATABASE_URL` 临时改回 `postgres`，看到脚本在第一行就红了**
- [ ] 我知道 `nullif(current_setting(...), '')` 少了会报什么错
- [ ] 我能说出为什么 `force` 对超级用户无效

## E. 加了 RLS 之后登录还能用（**这一条最容易漏**）

- [ ] `src/db/system-pool.js` 存在
- [ ] `.env` 里有 `SYSTEM_DATABASE_URL`
- [ ] `middleware/auth.js` 用的是 `systemPool`，不是 `pool`
- [ ] `routes/auth.js` 的登录查询用 `systemPool`
- [ ] `routes/auth.js` 的注册连接用 `systemPool.connect()`
- [ ] `curl POST /api/auth/login` 能拿到 200 + cookie
- [ ] `curl GET /api/me` 带 cookie 返回正常用户，不是"账号不存在"
- [ ] `curl GET /api/conversations` 只返回自己公司的数据（**反向验证：这证明 `withTenant` 没有被你一起改坏**）
- [ ] 我能说出那张"哪个场景用哪个连接"的表
- [ ] 我把 `app_user` / `app_system` 那两段 SQL 复制进了 `docs/上线清单.md`

## F. 理解

- [ ] 我能说出为什么 `tenantId` 不通过参数传
- [ ] 我能说出事务里为什么不能等慢接口
- [ ] 我知道 `rowCount = 0` 是告警信号，不是正常返回
- [ ] 我能说出为什么 `auth` 中间件**必须**用 `systemPool`（而不是"为了省事"）

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 记下了"接口返回空但库里有数据"的排查第一步
- [ ] 记下了"凡是在知道租户之前就要读写的表，不能走 RLS"

## 提交

```text
git add -A
git commit -m "第165节课: withTenant 仓储层 + RLS 兜底 + 路由检查脚本"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 接口返回空数组，但库里明明有数据 | 没设 `app.tenant_id`，RLS 拦了 | 确认走了 `withTenant`；确认 `set_config` 的第三个参数是 `true` |
| `invalid input syntax for type uuid: ""` | `current_setting` 返回空串直接转 uuid | 加 `nullif(..., '')` |
| RLS 策略建了但不生效 | 缺 `force row level security`（owner 绕过策略） | 补上 `force` |
| 数据随机串户，偶发无法复现 | `set_config` 用了 `false`，上下文跟着连接串了 | 改成 `true`（事务级） |
| `withTenant 需要一个租户 id` | `req.tenant` 没挂上 | 检查路由有没有 `router.use(auth, tenant)` |
| `current transaction is aborted` | 前面有语句报错，事务进入失败状态 | 检查 `fn` 里有没有被吞掉的异常 |
| 请求排队、大量 5 秒超时 | 事务里等了慢接口，连接被占满 | 把慢操作挪到事务外 |
| `idle in transaction` 连接堆积 | 拿了 `client` 没 `release` | `withTenant` 的 `finally` 里必须有 `release()` |
| `npm run check` 报 `pool.query` | 有路由绕过仓储层 | 换成 `withTenant`，别加例外 |
| 迁移 005 报策略已存在 | 重复跑 | 检查 `schema_migrations`；用 `drop policy if exists` 再建 |

---

## 本节课要能说出口的一句话

> **隔离不能靠写代码的人记得，要靠结构：`tenant_id` 从闭包进来、不从参数进来，路由里拿不到裸连接池，数据库再用 RLS 兜一道——三层里任何一层单独存在，都不算做完。**
