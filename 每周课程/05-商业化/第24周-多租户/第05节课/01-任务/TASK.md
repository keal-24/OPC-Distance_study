# 第 166 节课：自己当黑客攻一次

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前两节你做了隔离。**这一节要证明它真的有效**——不是"我觉得有效"，是"我拿客户 A 的身份去打客户 B，八次全部失败"。
> 这套测试写完，客户问"你们怎么保证不串数据"，你有东西给他看。

**建议用时**：110 分钟
**你需要先完成**：第 165 节课（`withTenant` 和 RLS 都跑通，`npm run check` 通过）

---

# 第 0 步：为什么必须是"测试"，不是"我试过了"（10 分钟）

## 0.1 "我试过了"的问题

**你现在可能会这样做验证：**

```text
登录客户 A → 打开列表 → 看到的是自己的 → 嗯，隔离没问题
```

**这只验证了一件事：正常路径能看到自己的数据。**

**它完全没验证：**

```text
用别人家的 id 能不能访问
改别人家的数据能不能成功
删别人家的东西会不会真的删掉
加一个 ?tenant_id= 参数会不会绕过
不带登录态能不能读
```

**这些才是攻击者会做的事。**

## 0.2 测试和手工验证的三个区别

| | 手工验证 | 自动化测试 |
|---|---|---|
| 跑一次要多久 | 五分钟，还要手动登录两个账号 | 一条命令，三秒 |
| 三个月后还跑得动吗 | 你懒得跑了 | 每次提交都跑 |
| AI 改代码破坏隔离，谁知道 | 没人知道 | 测试变红 |

**第三条最重要。** 第 165 节的检查脚本只能查"有没有用 `withTenant`"，它查不出"用了但方法内部写错了 SQL"。

**测试是唯一能验证行为的东西。**

## 0.3 这节课要建立的东西

```text
tests/isolation.test.js    八个攻击用例，必须全绿
scripts/seed.js            造两个租户和它们各自的数据
npm test                   一条命令跑完
```

**跑完之后你的标准是：**

```text
八条全绿 → 敢给客户用
有一条红 → 不准提交
```

---

# 第 1 步：造种子数据（20 分钟）

**测试要可重复跑。** 每次跑之前，库里必须是同一份数据。

**所以种子脚本必须幂等：跑一百次结果一样。**

## 1.1 写 `scripts/seed.js`

```js
const pool = require('../src/db/pool');
const bcrypt = require('bcryptjs');

const SEED_PASSWORD = 'test12345';

async function main() {
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  const client = await pool.connect();

  try {
    await client.query('begin');

    await client.query("delete from tenants where slug in ('seed-alpha', 'seed-beta')");

    const tenants = [];

    for (const [name, slug] of [
      ['测试公司甲', 'seed-alpha'],
      ['测试公司乙', 'seed-beta'],
    ]) {
      const t = await client.query(
        'insert into tenants (name, slug) values ($1, $2) returning id',
        [name, slug]
      );
      const tenantId = t.rows[0].id;

      const u = await client.query(
        `insert into users (tenant_id, email, password_hash, role)
         values ($1, $2, $3, 'owner') returning id`,
        [tenantId, slug + '@test.local', hash]
      );

      await client.query('update tenants set owner_user_id = $1 where id = $2', [
        u.rows[0].id,
        tenantId,
      ]);

      const c = await client.query(
        'insert into conversations (tenant_id, title) values ($1, $2) returning id',
        [tenantId, name + '的对话']
      );

      await client.query(
        `insert into messages (tenant_id, conversation_id, role, content)
         values ($1, $2, 'user', $3)`,
        [tenantId, c.rows[0].id, name + '的私密内容']
      );

      tenants.push({
        name,
        slug,
        tenantId,
        userId: u.rows[0].id,
        conversationId: c.rows[0].id,
        email: slug + '@test.local',
      });
    }

    await client.query('commit');

    console.log('种子数据建好了：');
    for (const t of tenants) {
      console.log(`  ${t.name}`);
      console.log(`    租户   ${t.tenantId}`);
      console.log(`    对话   ${t.conversationId}`);
      console.log(`    账号   ${t.email} / ${SEED_PASSWORD}`);
    }
    console.log('\n把这两个 id 写进 tests/isolation.test.js 的期望值里（或者让测试自己查）');
  } catch (err) {
    await client.query('rollback');
    console.error('失败：', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
```

**注意第一句 `delete from tenants where slug in (...)`。**

**这句话会让两个租户下的用户、对话、消息全部级联删除**（第 163 节写的 `on delete cascade`）。

**所以种子脚本能反复跑，不会越积越多。**

## 1.2 跑一次

```text
node scripts/seed.js
```

**你会看到两个租户的信息。**

**自检点：再跑一次，输出应该完全一样（id 会变，但数量不变）。**

```sql
select count(*) from tenants where slug like 'seed-%';
```

**结果必须是 2。** 是 4 就说明 `delete` 那句没生效 —— 检查 `tenants.slug` 上有没有唯一约束（第 163 节建表时有）。

**题外话：为什么种子数据用 `seed-alpha` 这种 slug，不用"客户甲"**

```text
"客户甲"可能和你手工测试时建的数据重名
slug 是英文，不会因为编码问题变成乱码
```

**给测试用的数据，名字要一眼能认出"这是测试的"，不然哪天你想清理都不敢确定删哪个。**

---

# 第 2 步：先手写一个攻击脚本（25 分钟）

**在写测试之前，先写一个"能打印出结果"的脚本。** 因为它比测试好读，出问题时你能看到完整的响应。

## 2.1 写 `scripts/attack.js`

```js
const BASE = 'http://localhost:3000';

let alpha;
let beta;

async function login(email) {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test12345' }),
  });

  if (!res.ok) {
    throw new Error('登录失败 ' + email + ' ' + res.status);
  }

  const setCookie = res.headers.getSetCookie
    ? res.headers.getSetCookie()[0]
    : res.headers.get('set-cookie');

  return setCookie.split(';')[0];
}

function call(path, cookie, options = {}) {
  return fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...(options.headers || {}),
    },
  });
}

async function main() {
  const cookieA = await login('seed-alpha@test.local');
  const cookieB = await login('seed-beta@test.local');
  console.log('两个账号都登录了');

  const meA = await (await call('/api/me', cookieA)).json();
  const meB = await (await call('/api/me', cookieB)).json();
  alpha = meA;
  beta = meB;
  console.log('甲：', meA.tenant.name);
  console.log('乙：', meB.tenant.name);

  const listA = await (await call('/api/conversations', cookieA)).json();
  console.log('\n[1] 甲的对话列表里有几条：', listA.length);

  const convB = beta.conversationId;
  if (!convB) {
    console.log('乙没有对话 id，跳过后面几条');
  }

  console.log('\n[2] 甲不知道乙的对话 id，先去数据库查一个');
  const { execSync } = require('child_process');
  const bConvId = execSync(
    `node -e "const p=require('./src/db/pool');p.query(\\"select id from conversations where tenant_id='${beta.tenant.id}' limit 1\\").then(r=>{console.log(r.rows[0].id);return p.end()})"`
  )
    .toString()
    .trim();
  console.log('    乙的对话 id：', bConvId);

  const r3 = await call('/api/conversations/' + bConvId, cookieA);
  console.log('\n[3] 甲直接查乙的对话：', r3.status, await r3.text());

  const r4 = await call('/api/conversations/' + bConvId, cookieA, {
    method: 'PATCH',
    body: JSON.stringify({ title: '我被甲改名了' }),
  });
  console.log('[4] 甲改乙的对话名：', r4.status, await r4.text());

  const r5 = await call('/api/conversations/' + bConvId + '/messages', cookieA);
  console.log('[5] 甲读乙的消息：', r5.status, await r5.text());

  const r6 = await call('/api/conversations/' + bConvId + '/messages', cookieA, {
    method: 'POST',
    body: JSON.stringify({ content: '甲往乙的对话写' }),
  });
  console.log('[6] 甲往乙的对话发消息：', r6.status, await r6.text());

  const r7 = await call('/api/conversations?tenant_id=' + beta.tenant.id, cookieA);
  const list7 = await r7.json();
  console.log('[7] 甲加 ?tenant_id=乙 的 id：', r7.status, '返回', list7.length, '条');

  const r8 = await call('/api/conversations/' + bConvId, cookieA, {
    method: 'DELETE',
  });
  console.log('[8] 甲删乙的对话：', r8.status, await r8.text());
}

main().catch((err) => {
  console.error('脚本出错：', err.message);
  process.exitCode = 1;
});
```

**这段脚本里有个丑陋的地方（`child_process` 那几行），只是为了先拿到乙的对话 id。**

**在真测试里不能这么写。** 下一步会改成从 API 正常获取。

## 2.2 先启动服务

**另开一个窗口：**

```text
cd saas-lab
npm run dev
```

**然后跑：**

```text
node scripts/attack.js
```

## 2.3 如果全部防守正确，你会看到

```text
两个账号都登录了
甲： 测试公司甲
乙： 测试公司乙

[1] 甲的对话列表里有几条： 1
[3] 甲直接查乙的对话： 404 {"error":"对话不存在"}
[4] 甲改乙的对话名： 404 {"error":"对话不存在"}
[5] 甲读乙的消息： 404 {"error":"对话不存在"}
[6] 甲往乙的对话发消息： 404 {"error":"对话不存在"}
[7] 甲加 ?tenant_id=乙 的 id： 200 返回 1 条
[8] 甲删乙的对话： 404 {"error":"对话不存在"}
```

**看清楚第 7 条：`200` 返回 1 条。**

**这是对的。** 因为 `?tenant_id=` 这个参数根本没被读取，甲拿到的还是自己的那一条。

**它返回 200 不代表有漏洞。** 判断漏洞的标准是"有没有拿到别人的数据"，不是"有没有报错"。

**这也是自动化测试比手工验证靠谱的原因：手工看到 200 会吓一跳，然后你可能"修"一个本来没问题的东西。**

---

# 第 3 步：把攻击脚本变成测试（30 分钟）

## 3.1 为什么手写脚本不够

```text
① 它只打印结果，不判断对错 —— 你得用眼睛看
② 它没有"通过 / 失败"的概念，跑了也没法自动化
③ 它跑在一个人工启动的服务上，容易忘记跑
```

**测试要做的是：把"我刚才看到 404，这是对的"变成"必须是 404，否则报错"。**

## 3.2 新建 `tests/isolation.test.js`

**用 Node 自带的测试框架，不装任何东西：**

```js
const test = require('node:test');
const assert = require('node:assert');
const pool = require('../src/db/pool');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASSWORD = 'test12345';

async function login(email) {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.strictEqual(res.status, 200, '登录失败：' + email);
  const raw = res.headers.getSetCookie
    ? res.headers.getSetCookie()[0]
    : res.headers.get('set-cookie');
  return raw.split(';')[0];
}

function call(path, cookie, options = {}) {
  return fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...(options.headers || {}),
    },
  });
}

async function setup() {
  const cookieA = await login('seed-alpha@test.local');
  const cookieB = await login('seed-beta@test.local');

  const meA = await (await call('/api/me', cookieA)).json();
  const meB = await (await call('/api/me', cookieB)).json();

  const listB = await (await call('/api/conversations', cookieB)).json();
  assert.ok(listB.length > 0, '乙没有对话，先跑 scripts/seed.js');
  const bConvId = listB[0].id;

  return { cookieA, cookieB, meA, meB, bConvId };
}

test('隔离测试', async (t) => {
  const ctx = await setup();

  await t.test('1. 甲只能看到自己的对话', async () => {
    const res = await call('/api/conversations', ctx.cookieA);
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list));
    for (const c of list) {
      assert.ok(!c.id, '返回体里不该有异常');
    }
    const ids = list.map((c) => c.id);
    assert.ok(!ids.includes(ctx.bConvId), '甲的列表里出现了乙的对话');
  });

  await t.test('2. 甲用乙的对话 id 查详情，返回 404', async () => {
    const res = await call('/api/conversations/' + ctx.bConvId, ctx.cookieA);
    assert.strictEqual(res.status, 404);
  });

  await t.test('3. 甲改乙的对话名，返回 404 且数据没变', async () => {
    const res = await call('/api/conversations/' + ctx.bConvId, ctx.cookieA, {
      method: 'PATCH',
      body: JSON.stringify({ title: '被甲改掉了' }),
    });
    assert.strictEqual(res.status, 404);

    const { rows } = await pool.query('select title from conversations where id = $1', [
      ctx.bConvId,
    ]);
    assert.ok(rows.length === 1);
    assert.notStrictEqual(rows[0].title, '被甲改掉了', '乙的标题真的被改了');
  });

  await t.test('4. 甲读乙对话里的消息，返回 404', async () => {
    const res = await call(
      '/api/conversations/' + ctx.bConvId + '/messages',
      ctx.cookieA
    );
    assert.strictEqual(res.status, 404);
  });

  await t.test('5. 甲往乙的对话发消息，返回 404 且没写进去', async () => {
    const res = await call(
      '/api/conversations/' + ctx.bConvId + '/messages',
      ctx.cookieA,
      {
        method: 'POST',
        body: JSON.stringify({ content: '甲偷偷塞的' }),
      }
    );
    assert.strictEqual(res.status, 404);

    const { rows } = await pool.query(
      'select count(*)::int as n from messages where conversation_id = $1 and content = $2',
      [ctx.bConvId, '甲偷偷塞的']
    );
    assert.strictEqual(rows[0].n, 0, '越权写入居然成功了');
  });

  await t.test('6. 甲加 ?tenant_id=乙 的 id 没用', async () => {
    const res = await call(
      '/api/conversations?tenant_id=' + ctx.meB.tenant.id,
      ctx.cookieA
    );
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    const ids = list.map((c) => c.id);
    assert.ok(!ids.includes(ctx.bConvId), '?tenant_id= 参数起作用了，这是漏洞');
  });

  await t.test('7. 甲伪造 x-tenant-id 请求头没用', async () => {
    const res = await call('/api/conversations', ctx.cookieA, {
      headers: { 'x-tenant-id': ctx.meB.tenant.id },
    });
    const list = await res.json();
    const ids = list.map((c) => c.id);
    assert.ok(!ids.includes(ctx.bConvId), 'x-tenant-id 请求头起作用了，这是漏洞');
  });

  await t.test('8. 不带登录态一律 401', async () => {
    const paths = [
      '/api/conversations',
      '/api/conversations/' + ctx.bConvId,
      '/api/conversations/' + ctx.bConvId + '/messages',
    ];
    for (const p of paths) {
      const res = await fetch(BASE + p);
      assert.strictEqual(res.status, 401, p + ' 没有要求登录');
    }
  });

  await t.test('9. 甲删乙的对话，返回 404 且乙的对话还在', async () => {
    const res = await call('/api/conversations/' + ctx.bConvId, ctx.cookieA, {
      method: 'DELETE',
    });
    assert.strictEqual(res.status, 404);

    const { rows } = await pool.query('select id from conversations where id = $1', [
      ctx.bConvId,
    ]);
    assert.strictEqual(rows.length, 1, '乙的对话真的被甲删掉了');
  });

  await t.run?.({ skip: true });
  await pool.end();
});
```

**跑：**

```text
npm test
```

**你应该看到九条全绿：**

```text
# tests 9
# pass 9
# fail 0
```

## 3.3 三个写法值得学

### 每条测试都必须验证"数据真的没变"

**看第 3 条和第 9 条：它们不只检查 `status === 404`，还去数据库里查了一遍。**

```js
const { rows } = await pool.query('select title from conversations where id = $1', [...]);
assert.notStrictEqual(rows[0].title, '被甲改掉了');
```

**为什么要多这一步：** 有一种漏洞是"接口返回了 404，但数据已经改了"。这通常发生在"先执行、后校验"的代码里。

**只检查状态码的测试会放过它。**

### 第 5 条专门查"有没有写进去"

```js
select count(*) from messages where conversation_id = $1 and content = $2
```

**用内容作为查询条件，比用 id 更可靠**——因为如果写进去了，你不知道它拿的是什么 id。

### 第 6、7 条是"反着测"

```text
别的测试是：攻击应该失败
这两条是：攻击不会成功，但接口会正常返回 200
```

**这是一种容易被忽略的漏洞类型：参数被读取了，但没造成越权。**

**比如代码写了 `const tenantId = req.query.tenant_id || req.user.tenant_id`——如果 `tenant_id` 传的是自己的 id，看起来一切正常。但它是个后门，第 164 节演示过。**

## 3.4 把 `npm test` 接上

**`package.json`：**

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "ping": "node scripts/ping.js",
    "migrate": "node scripts/migrate.js",
    "seed": "node scripts/seed.js",
    "check": "node scripts/check-tenant.js",
    "test": "node --test tests/"
  }
}
```

**跑测试的完整流程：**

```text
node scripts/seed.js       造数据
npm run dev                启动服务（另一个窗口）
npm test                   九条全绿
```

**注意测试要求服务在跑。** 这不是最优雅的做法（更专业的做法是测试里自己起服务），但它最直观，你现在不需要再学一层。

---

# 第 4 步：故意制造一个漏洞（20 分钟）

**全绿的测试看不出它有没有用。造一个漏洞，看它变红。**

## 4.1 改坏 `tenant-db.js`

**找到 `conversations.rename`，把 `tenant_id` 条件删掉：**

```js
async rename(id, title) {
  const { rows } = await client.query(
    `update conversations
     set title = $1
     where id = $2
     returning id, title`,
    [title, id]
  );
  return rows[0] || null;
},
```

**注意：`tenant_id` 条件和它对应的参数都删了。**

## 4.2 跑测试

```text
npm test
```

**你会看到第 3 条红：**

```text
not ok 3 - 甲改乙的对话名，返回 404 且数据没变
  error: '乙的标题真的被改了'
```

**而且注意第 3 条的前半部分也失败了：**

```text
assert.strictEqual(res.status, 404);
实际是 200
```

**因为 `update ... where id = $2` 真的改到了乙那一行，`rowCount = 1`，路由返回了 200。**

**这就是第 165 节说的：漏写租户条件的 UPDATE 会"成功"。**

## 4.3 为什么 RLS 没拦住

**你已经开了 RLS，为什么还能改？**

```text
RLS 的 with check 会拦"写入后不满足策略"的行
但你这次是 UPDATE，行本身还是乙的
策略 using 检查的是"你能不能看到这一行"
```

**关键在于：`withTenant` 设的上下文是甲，而这条 UPDATE 命中的是乙的行。**

**RLS 的 `using` 应该让这条 UPDATE 匹配不到任何行才对。**

**如果它真的改成功了，说明 RLS 没生效。** 回去检查：

```text
① 005 里的 force row level security 还在吗
② withTenant 里的 set_config 还在吗
③ 你刚才是不是跑了第 165 节 5.3 那个"删掉 force"的实验，忘了改回来
```

**这就是那个实验的价值：它会让你真实地混乱一次，你就记住了。**

**改回来，再跑测试，应该九条全绿。**

## 4.4 清理

**把 `rename` 改回带 `tenant_id` 的版本。**

**验证：**

```text
npm run check
npm test
```

**两个都过才算收工。**

---

# 第 5 步：把测试写进日常（10 分钟）

## 5.1 提交前检查清单

**写在笔记里，也写进项目根目录的 `README.md`：**

```text
每次提交前：
  1. npm run check     路由层没有裸 SQL
  2. npm test          九条隔离测试全绿
  3. git diff 看一眼    没有 .env、没有 node_modules
```

## 5.2 一个更狠的做法（可选）

**在 `.git/hooks/pre-commit` 里放一个脚本，不通过就不让提交。**

**但这需要写 shell 脚本，Windows 上还有路径问题。** 你现在不必做。

**养成"先跑再提交"的手动习惯，比自动化钩子更管用**——因为钩子只会拦你，不会告诉你为什么。

## 5.3 这些测试以后还会长

```text
第 25 周（Excel 导出）   加一条：A 导出的 Excel 里没有 B 的数据
第 25 周（支付）         加一条：A 用 B 的订单号查订单，404
第 26 周（Webhook）      加一条：A 的 webhook 收不到 B 的事件
第 27 周（前端）         前端缓存串了：切租户后看到上一个的
```

**每加一个涉及数据的接口，就在这里加一条测试。**

**这个文件会跟着你到第 36 周，它会变成你唯一敢改代码的理由。**

---

# 第 6 步：最终验收

## A. 种子数据

- [ ] `scripts/seed.js` 能跑，跑两次结果一样（库里只有两个 `seed-` 租户）
- [ ] 两个测试账号能登录
- [ ] 每个租户有一个对话和一条消息

## B. 攻击脚本

- [ ] `attack.js` 跑通了，八条输出我都看过
- [ ] 我明白第 7 条返回 200 不代表漏洞
- [ ] 我看到过所有该 404 的都返回 404

## C. 测试

- [ ] `tests/isolation.test.js` 有九条
- [ ] `npm test` 九条全绿
- [ ] 第 3、5、9 条去数据库里查过数据有没有真的变
- [ ] 第 6、7 条验证的是"参数没用"，不是"报错了"

## D. 破坏验证

- [ ] 我删过 `rename` 的租户条件，看到第 3 条变红
- [ ] 我知道为什么 RLS 没拦住它（或者查清了为什么拦住了）
- [ ] 改回来之后九条全绿

## E. 日常

- [ ] `package.json` 里有 `seed`、`check`、`test` 三个 script
- [ ] 我知道提交前要跑哪三条
- [ ] 笔记里写了"以后每加一个接口，加一条测试"

## 提交

```text
git add -A
git commit -m "第166节课: 种子数据 + 九条越权测试 + 破坏验证"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `登录失败：seed-alpha@test.local` | 没跑 `seed.js`，或者跑完又被删了 | 重新 `node scripts/seed.js` |
| `乙没有对话，先跑 scripts/seed.js` | 同上 | 同上 |
| `fetch failed` | 服务没启动 | 另一个窗口 `npm run dev` |
| `ECONNREFUSED 3000` | 端口不对 | 检查 `.env` 里的 `PORT` |
| 第 3 条一直红，报"乙的标题真的被改了" | `rename` 漏了 `tenant_id` | 加回来 |
| 第 3 条报 `实际是 200` | 同上 | 同上 |
| 第 6 条红 | 有接口读了 `?tenant_id=` | `npm run check` 找出位置 |
| 第 7 条红 | 有接口读了 `x-tenant-id` | 同上 |
| 第 8 条红，返回 200 | 路由没挂 `auth` 中间件 | `router.use(auth, tenant)` |
| `getSetCookie is not a function` | Node 版本低于 18 | 升级 Node，或者用 `headers.get('set-cookie')` |
| 测试跑完进程不退出 | `pool.end()` 没调 | 测试末尾 `await pool.end()` |
| 九条全绿但你知道有漏洞 | 测试没覆盖那个接口 | 加一条测试，不要凭感觉 |

---

## 本节课要能说出口的一句话

> **"我们做了隔离"这句话没有意义，有意义的是"我拿客户 A 的身份打了客户 B 九次，九次都失败，而且这个测试每次提交都会跑"。**
