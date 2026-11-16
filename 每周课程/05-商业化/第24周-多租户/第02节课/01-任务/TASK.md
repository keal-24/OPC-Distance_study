# 第 163 节课：给每张表加 tenant_id

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课开始动真格：**建表，而且一次建对。**
> 表结构的错误发现得越晚，修起来越贵——数据已经在里面了，改约束要停机、要备份、要跟客户约时间。

**建议用时**：110 分钟
**你需要先完成**：第 162 节课（`saas-lab` 建好，`npm run ping` 能跑通）

---

# 第 0 步：这节课要建什么（5 分钟）

**六张表，一个迁移工具，三条设计关键点。**

```text
tenants           客户清单，一行一个客户
users             用户，靠 tenant_id 归属
conversations     对话
messages          消息
files             文件
schema_migrations 迁移台账（工具自己建）
```

**这节课不是"能建表就行"。** 第 5 周你已经会建表了。这节的重点在三件事：

```text
① 唯一约束怎么改（不改，第二个客户就注册不了）
② 跨租户的关联怎么防（消息能挂到别人的对话上）
③ 已经在跑的表怎么加列（不能锁表，不能丢数据）
```

**第三件是这一节最值钱的部分。** 你现在是新建库，可以随便 DROP 重建。但客户的数据不行。

---

# 第 1 步：先写迁移工具（20 分钟）

## 1.1 为什么不能直接跑 SQL 文件

新手做法是这样：

```text
打开 pgAdmin / DBeaver → 粘贴建表 SQL → 执行 → 关掉
```

**问题：**

```text
① 三个环境（开发、测试、线上），你记不清哪个跑过哪个没跑
② 团队里来个人，他不知道这个库现在是什么状态
③ 半年后你要加一列，得先想"当时到底建了什么"
④ 出错了没法回退，因为没人知道刚才改了什么
```

**正确做法：** 所有表结构改动都写成编号的 SQL 文件，用一个脚本按顺序执行，执行过的记下来。

**这个记录本身也是张表：**

```sql
create table schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
```

**跑一个文件就插一行。下次再跑，看见已经记过就跳过。**

**这就是"迁移（migration）"。** 名字唬人，原理就一句话：**按顺序跑，跑过的别重复跑。**

## 1.2 写 `scripts/migrate.js`

**新建文件 `scripts/migrate.js`：**

```js
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');

(async () => {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query('select filename from schema_migrations');
  const done = new Set(rows.map((r) => r.filename));

  let count = 0;

  for (const file of files) {
    if (done.has(file)) {
      console.log('跳过  ' + file + '（已经跑过）');
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
      console.log('执行  ' + file);
      count += 1;
    } catch (err) {
      await client.query('rollback');
      console.error('失败  ' + file);
      console.error('      ' + err.message);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }

  console.log('---');
  console.log('本次执行 ' + count + ' 个文件');

  await pool.end();
})();
```

**逐段解释，因为这几行以后天天用：**

| 代码 | 干什么 | 少它会怎样 |
|---|---|---|
| `create table if not exists schema_migrations` | 建台账 | 第一次跑就报"表不存在" |
| `.sort()` | 按文件名排序 | `010_` 可能跑在 `002_` 前面，表建反了 |
| `done.has(file)` | 跳过已跑过的 | 重复跑，第二次一定报"表已存在" |
| `begin` / `commit` | 一个文件一个事务 | 跑到一半失败，库里剩半张表 |
| `rollback` | 失败全退 | 半张表留在库里，后面全部迁移报错 |
| `break` | 第一个失败就停 | 后面的文件在残缺的库上继续跑，越跑越乱 |

**注意 `begin/commit` 那句。** PostgreSQL 的建表语句支持事务，这是它的一个大优势（MySQL 的 DDL 会隐式提交，做不到）。

**这条区别以后客户问"为什么不用 MySQL"的时候，你可以答得出来。**

## 1.3 自检点

**`migrations` 文件夹还是空的，脚本跑起来会输出：**

```text
---
本次执行 0 个文件
```

**能不能跑起来是第一关：**

```text
npm run migrate
```

**跑到这句就不对：**

```text
npm ERR! Missing script: "migrate"
```

**说明第 162 节改 `package.json` 那一步没保存。回去看第 162 节 3.2。**

---

# 第 2 步：建第一版表结构（30 分钟）

## 2.1 新建 `migrations/001_init.sql`

```sql
create extension if not exists pgcrypto;

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan        text not null default 'free',
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

create table users (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  email          text not null,
  password_hash  text not null,
  role           text not null default 'member',
  created_at     timestamptz not null default now(),
  unique (tenant_id, email)
);

create index users_tenant_idx on users (tenant_id);

create table conversations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  title       text not null default '新对话',
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

create index conversations_tenant_created_idx
  on conversations (tenant_id, created_at desc);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  conversation_id  uuid not null,
  role             text not null check (role in ('user', 'assistant', 'system')),
  content          text not null,
  created_at       timestamptz not null default now(),
  foreign key (tenant_id, conversation_id)
    references conversations (tenant_id, id) on delete cascade
);

create index messages_tenant_conv_created_idx
  on messages (tenant_id, conversation_id, created_at);

create table files (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  path        text not null,
  size        bigint not null default 0,
  created_at  timestamptz not null default now()
);

create index files_tenant_created_idx
  on files (tenant_id, created_at desc);
```

## 2.2 逐条讲这些设计，一条都不能瞎写

### `id` 用 UUID，不用自增数字

```text
自增 id：/api/orders/1024     ← 客户改个数字就能试别人家的
UUID：  /api/orders/8f3a...   ← 猜不到
```

**这是最便宜的一层防护。** 它不替代租户隔离（第 165 节还要做），但能挡掉"批量改 URL 试一遍"这种低级攻击。

**代价：** UUID 占 16 字节，自增 int 占 4 字节。这个规模上不用考虑。

### `create extension if not exists pgcrypto`

`gen_random_uuid()` 在 PostgreSQL 13 以后是内置的，不需要装扩展。

**这句留着没坏处**——万一客户给你的是 PostgreSQL 12，没有它会报 `function gen_random_uuid() does not exist`。

**这句在扩展已存在时重复执行不会报错**，因为写了 `if not exists`。

### `unique (tenant_id, email)` —— 这节课第一个关键点

**看对比：**

```sql
-- 错的
email text not null unique

-- 对的
unique (tenant_id, email)
```

**用错的那个会怎样：**

客户 A 有个员工 `zhang@abc.com` 注册了。过了一个月，客户 B 也有个员工叫 `zhang@abc.com`（不同公司，同一个人跳槽，或者干脆同名）。

**客户 B 注册时你会看到：**

```text
duplicate key value violates unique constraint "users_email_key"
DETAIL:  Key (email)=(zhang@abc.com) already exists.
```

**然后你会对着这句报错愣半小时**——因为你完全想不到这跟客户 A 有什么关系。

**加上 `tenant_id` 之后，唯一性的含义变成"同一个公司里邮箱不能重复"。** 这才是你真正想要的。

**这个改法适用于所有带唯一约束的业务表：**

| 原来是 | 应该改成 |
|---|---|
| `unique (email)` | `unique (tenant_id, email)` |
| `unique (order_no)` | `unique (tenant_id, order_no)` |
| `unique (slug)` | `unique (tenant_id, slug)` |

**唯一的例外是 `tenants` 自己的 `slug`。** 它全站唯一，因为要用来做访问入口（`/t/abc`），第 168 节讲。

### `unique (tenant_id, id)` 在 conversations 上 —— 这节课第二个关键点

**这个约束看起来完全多余：`id` 已经是主键了，全局唯一，再加个 `(tenant_id, id)` 有什么意义？**

**意义在这里：它是给 `messages` 的复合外键用的。**

**先看没有它的情况：**

```sql
-- messages 的外键只指 id
conversation_id uuid not null references conversations(id)
```

**这段 SQL 允许这种事发生：**

```text
租户 A 的对话        id = c-aaa，tenant_id = A
租户 B 发一条消息    tenant_id = B，conversation_id = c-aaa
```

**数据库一点都不拦。** 因为 `c-aaa` 确实存在于 `conversations` 表里。

**结果就是：租户 B 的人往租户 A 的对话里插了一条消息。**

**这个洞怎么被利用：** 一个接口允许"在当前对话里发消息"，如果它只校验 `conversation_id` 存在、没校验这个对话是不是当前租户的，攻击者拿到一个别人的对话 id 就能往里写。

**加上复合外键之后：**

```sql
foreign key (tenant_id, conversation_id)
  references conversations (tenant_id, id)
```

**含义变成：这条消息的 `tenant_id` 和它所属对话的 `tenant_id` 必须是同一个。**

**租户 B 想往 A 的对话里插消息，数据库直接拒绝：**

```text
insert or update on table "messages" violates foreign key constraint "messages_tenant_id_conversation_id_fkey"
DETAIL:  Key (tenant_id, conversation_id)=(...) is not present in table "conversations".
```

**这一条约束，让"跨租户挂数据"在数据库层面变成不可能。**

**记住这个手法：所有"子表通过父表归属租户"的关系，都应该用复合外键，而不是只关联 id。**

### `on delete cascade`

**客户注销，删 `tenants` 里那一行，他的用户、对话、消息、文件全部跟着删。**

**没有这句，你会看到：**

```text
update or delete on table "tenants" violates foreign key constraint "users_tenant_id_fkey"
DETAIL:  Key (id)=(...) is still referenced from table "users".
```

**然后你得手工按顺序删六张表，漏一张就删不掉。**

**要注意：`cascade` 是物理删除，很危险。** 第 168 节讲注销时会加"软删除 + 冷静期"，不会直接跑这条。

### 索引为什么要 `(tenant_id, xxx)` 开头

**因为你的每一条查询都会带 `tenant_id`。**

```sql
select * from conversations where tenant_id = $1 order by created_at desc limit 20;
```

**索引只建在 `created_at` 上：**

```text
数据库要扫描全表所有租户的对话，按时间排序，再筛出这个租户的
客户数据一多，这条查询从 5 毫秒变成 2 秒
```

**索引建在 `(tenant_id, created_at)` 上：**

```text
数据库直接跳到这个租户那一段，本来就是按时间排好的
前 20 条一扫就出来
```

**这叫复合索引，顺序有意义：** 等值条件（`tenant_id`）放前面，范围/排序（`created_at`）放后面。**反了就没用。**

**第 5 周学过索引，这里只是把它用到多租户上。判断标准很简单：**

> **看你的 `WHERE` 里第一个条件是什么，索引第一个字段就放什么。**

## 2.3 跑迁移

```text
npm run migrate
```

**你会看到：**

```text
执行  001_init.sql
---
本次执行 1 个文件
```

**再跑一次：**

```text
跳过  001_init.sql（已经跑过）
---
本次执行 0 个文件
```

**这个"跳过"是整套机制的价值。** 以后每次加表，只要重跑 `npm run migrate`，它自己知道哪些该跑。

**自检点：去数据库里看一眼，应该有六张表。**

```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```

**应该是：**

```text
conversations
files
messages
schema_migrations
tenants
users
```

**六张，少一张就是 001 文件里漏了。** 这时候直接改 001 重跑是不行的（已经记录成跑过了）。做法：删库重建，或者手工 `drop table` 那几张再删掉 `schema_migrations` 里那条记录。

**新建库的时候允许这么干。客户的数据不允许。** 这就是为什么第 2 步要把 SQL 一次写对。

---

# 第 3 步：验一遍约束到底生效没有（20 分钟）

**建完表就跑，是最容易留坑的做法。** 约束写错了不会报错，它只会在某个客户注册的时候炸。

**新建 `scripts/verify.js`：**

```js
const pool = require('../src/db/pool');

async function main() {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const a = await client.query(
      "insert into tenants (name, slug) values ('客户甲', 'jia') returning id"
    );
    const b = await client.query(
      "insert into tenants (name, slug) values ('客户乙', 'yi') returning id"
    );
    const tenantA = a.rows[0].id;
    const tenantB = b.rows[0].id;
    console.log('两个租户建好了');

    await client.query(
      'insert into users (tenant_id, email, password_hash) values ($1, $2, $3)',
      [tenantA, 'zhang@abc.com', 'x']
    );
    await client.query(
      'insert into users (tenant_id, email, password_hash) values ($1, $2, $3)',
      [tenantB, 'zhang@abc.com', 'x']
    );
    console.log('测试1 通过：两个租户可以用同一个邮箱');

    let dupBlocked = false;
    try {
      await client.query(
        'insert into users (tenant_id, email, password_hash) values ($1, $2, $3)',
        [tenantA, 'zhang@abc.com', 'x']
      );
    } catch (err) {
      dupBlocked = true;
      console.log('测试2 通过：同租户重复邮箱被拦住');
    }
    if (!dupBlocked) {
      throw new Error('测试2 失败：同租户重复邮箱竟然插进去了');
    }

    const conv = await client.query(
      'insert into conversations (tenant_id, title) values ($1, $2) returning id',
      [tenantA, '甲的对话']
    );
    const convA = conv.rows[0].id;

    let crossBlocked = false;
    try {
      await client.query(
        'insert into messages (tenant_id, conversation_id, role, content) values ($1, $2, $3, $4)',
        [tenantB, convA, 'user', '我往别人的对话里写']
      );
    } catch (err) {
      crossBlocked = true;
      console.log('测试3 通过：跨租户挂消息被拦住');
    }
    if (!crossBlocked) {
      throw new Error('测试3 失败：跨租户挂消息竟然成功了');
    }

    await client.query(
      'insert into messages (tenant_id, conversation_id, role, content) values ($1, $2, $3, $4)',
      [tenantA, convA, 'user', '我自己说话']
    );
    console.log('测试4 通过：同租户正常发消息');

    let cascadeOk = false;
    const del = await client.query('delete from tenants where id = $1', [tenantA]);
    if (del.rowCount === 1) {
      const left = await client.query(
        'select count(*)::int as n from messages where tenant_id = $1',
        [tenantA]
      );
      if (left.rows[0].n === 0) {
        cascadeOk = true;
        console.log('测试5 通过：删租户连带删掉消息');
      }
    }
    if (!cascadeOk) {
      throw new Error('测试5 失败：删租户后消息还在');
    }

    await client.query('rollback');
    console.log('全部通过，数据已回滚（库里没留测试数据）');
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

**跑：**

```text
node scripts/verify.js
```

**五条全过你会看到：**

```text
两个租户建好了
测试1 通过：两个租户可以用同一个邮箱
测试2 通过：同租户重复邮箱被拦住
测试3 通过：跨租户挂消息被拦住
测试4 通过：同租户正常发消息
测试5 通过：删租户连带删掉消息
全部通过，数据已回滚（库里没留测试数据）
```

**这个脚本里有个细节值得学：最后那个 `rollback`。**

**整个过程包在一个事务里，验证完直接回滚，库里一条测试数据都没留。** 你可以随时重跑，不用先清理。

**用这套写法测任何"插入 / 约束"类的东西，都不会污染数据。**

---

# 第 4 步：故意踩一次唯一约束的坑（10 分钟）

**上面的测试2 是"对的做法"通过的样子。现在看"错的做法"报什么。**

## 4.1 临时把约束改错

**新建 `migrations/002_bad_unique.sql`：**

```sql
alter table users drop constraint users_tenant_id_email_key;
alter table users add constraint users_email_key unique (email);
```

**跑 `npm run migrate`，然后跑 `node scripts/verify.js`。**

**你会看到：**

```text
两个租户建好了
失败： duplicate key value violates unique constraint "users_email_key"
```

**注意它是死在测试1，不是测试2。**

```text
测试1 是"两个租户用同一个邮箱"——本来应该成功的
现在失败了
```

**这就是那个坑的真实样子：** 客户的第二个公司注册不了，报错里提到的却是一个跟当前操作毫无关系的邮箱。

**而且这个错误只在"第二个客户恰好用了同一个邮箱"时才出现。** 你的测试环境里只有你一个账号，永远测不出来。

## 4.2 改回来

**新建 `migrations/003_fix_unique.sql`：**

```sql
alter table users drop constraint users_email_key;
alter table users add constraint users_tenant_id_email_key unique (tenant_id, email);
```

**跑 `npm run migrate`，再跑 `node scripts/verify.js`，五条全过。**

**这里有个重要的习惯：出错的迁移不要删掉重写，新建一个修它的文件。**

```text
❌ 删掉 002 重新编辑 —— 你本机能跑，客户那边已经跑过 002 了，状态不一致
✅ 新建 003 修它 —— 所有环境按顺序跑一遍，结果一样
```

**这条规矩从今天开始生效，一直到第 36 周。**

**已提交的错误就是历史，历史只能往前走，不能改写。** 和第 4 周学的"已经 push 的提交只用 revert，不用 reset"是同一个道理。

---

# 第 5 步：已经在跑的表怎么加列（25 分钟）

**前面都是新建库。真实情况是：库里已经有客户的数据了，你要给它加 `tenant_id`。**

**这个动作做错会把线上锁死。** 分三步，一步都不能合并。

## 5.1 先看清三件事

**假设要给一个已经跑了三个月的 `orders` 表加租户。**

```text
① 表现在有多少行？          （10 万行加列只要几秒，1000 万行要规划）
② 加了 NOT NULL 会怎样？    （现有行没有值，直接被拒绝）
③ 加列的时候会不会锁表？    （加可空列不锁，加带默认值的要看版本）
```

**第三条最容易被忽略：**

```sql
-- PostgreSQL 11 以前，这句会锁住整张表，期间不能读不能写
alter table orders add column tenant_id uuid not null default '...';
```

**PostgreSQL 11 以后，加带常量默认值的列不重写表了**，所以这句现在不锁。但**加 `not null` 且没有默认值，直接失败**。

**稳妥的做法永远是三步。**

## 5.2 第一步：加可空列

**`migrations/004_orders_tenant.sql`：**

```sql
alter table orders add column tenant_id uuid;

create index orders_tenant_created_idx on orders (tenant_id, created_at desc);
```

**这一步立刻能跑，不影响任何现有查询。** 老代码不知道有这个列，`select *` 会多一列，也不影响。

**大表还要注意索引：**

```sql
-- 大表上建索引会锁写操作，这个写法不锁
create index concurrently orders_tenant_created_idx on orders (tenant_id, created_at desc);
```

**但 `concurrently` 不能在事务里跑。** 而迁移脚本把每个文件包在 `begin/commit` 里——这句会报：

```text
CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

**处理方式：小表（几十万行以下）不用 `concurrently`；大表就把这条索引单独挪到一个文件，手工执行，不进迁移脚本。**

**这个取舍要记下来，因为线上锁表 20 分钟是会被客户投诉的。**

## 5.3 第二步：回填数据

**老数据属于谁？三种情况：**

```text
情况一：系统本来只有一个客户 → 全部归到"默认租户"
情况二：表里有 user_id → 通过 users 表反查 tenant_id
情况三：什么都查不到 → 归到"未分配"租户，人工处理
```

**情况一，先建默认租户（返回的 id 复制下来，你的和我的不一样）：**

```sql
insert into tenants (name, slug) values ('默认租户', 'default')
returning id;
```

```sql
update orders
set tenant_id = '把你复制的那个-id-粘在这里'
where tenant_id is null;
```

**情况二，通过关联表反查：**

```sql
update orders o
set tenant_id = u.tenant_id
from users u
where o.user_id = u.id
  and o.tenant_id is null;
```

**回填之前数一遍，回填之后再数一遍：**

```sql
select count(*) from orders where tenant_id is null;
```

**这个数字不是 0，就不要往下走。** 这些行加完 `not null` 之后会变成永远查不到的幽灵数据——数据在库里，界面上一条都看不到。

## 5.4 第三步：加约束

**确认上面那个 `count(*)` 是 0 之后：**

```sql
alter table orders alter column tenant_id set not null;

alter table orders
  add constraint orders_tenant_fk
  foreign key (tenant_id) references tenants (id) on delete cascade;
```

**为什么不能一步到位：**

**直接 `add column tenant_id uuid not null` 在 100 万行的表上要校验全表，期间可能锁写。** 时间长的那几分钟里客户看到的是 502。

**拆成三步，每一步都是秒级或可控的：**

```text
① 加可空列          → 只改元数据，毫秒
② 分批回填          → 可以断点续跑，每次几千行
③ 加 not null       → 只校验，不重写数据
```

**表很大时分批回填：**

```sql
update orders
set tenant_id = '你的默认租户-id'
where id in (
  select id from orders
  where tenant_id is null
  limit 5000
);
```

**跑一次更新 5000 行，跑几十次跑完。每次之间可以停，不影响线上。**

**这三步是你以后给任何线上表加列的标准动作。** 记住它，比记住任何命令都有用。

---

# 第 6 步：最终验收

## A. 迁移机制

- [ ] `npm run migrate` 能跑
- [ ] 重跑显示"跳过"
- [ ] `schema_migrations` 表里有 `001_init.sql` 这条记录
- [ ] 我知道一个迁移文件失败会 `rollback`，不会留半张表

## B. 表结构

- [ ] 六张表都在（`tenants`、`users`、`conversations`、`messages`、`files`、`schema_migrations`）
- [ ] 每张业务表都有 `tenant_id not null`
- [ ] `users` 的唯一约束是 `(tenant_id, email)`，不是 `(email)`
- [ ] `messages` 的外键是复合外键 `(tenant_id, conversation_id)`
- [ ] 每个索引都以 `tenant_id` 开头

## C. 约束验证

- [ ] `node scripts/verify.js` 五条全过
- [ ] 我亲手制造过 `duplicate key value violates unique constraint "users_email_key"` 并修好
- [ ] 我知道跨租户挂消息会被数据库拦住，不靠代码

## D. 加列

- [ ] 我能说出"线上表加 not null 列"的三步
- [ ] 我知道 `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` 是为什么
- [ ] 我知道回填之后要数一次 `where tenant_id is null`

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我抄下了自己项目里所有要改的唯一约束

## 提交

```text
git add -A
git commit -m "第163节课: 建表 + 迁移工具 + 复合唯一约束与复合外键"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `duplicate key value violates unique constraint "users_email_key"` | 唯一约束没带 `tenant_id` | 改成 `unique (tenant_id, email)` |
| `Key (tenant_id, conversation_id)=(...) is not present in table "conversations"` | 跨租户挂子表数据 | 这是**正确**的拦截，去查业务代码为什么要这么插 |
| `null value in column "tenant_id" violates not-null constraint` | 插入时没带租户 | 第 164 节会从会话推导；现在先确认代码传了 |
| `insert or update on table "users" violates foreign key constraint` | `tenant_id` 不是真实存在的租户 | 先建租户再建用户 |
| `update or delete on table "tenants" violates foreign key constraint` | 有子表没写 `on delete cascade` | 补上，或者按顺序手工删 |
| `function gen_random_uuid() does not exist` | PostgreSQL 版本低于 13 | 加 `create extension pgcrypto;` |
| `relation "xxx" already exists` | 迁移文件重复跑了 | 查 `schema_migrations`；不要删记录重跑，新建修复文件 |
| `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` | `concurrently` 不能进事务 | 大表索引单独手工执行，不进迁移脚本 |
| `column "tenant_id" contains null values` | 回填没做完就加 `not null` | 先跑 `update ... where tenant_id is null` |
| 迁移跑到一半失败，库里剩半张表 | 没用事务 | 检查脚本有没有 `begin/commit/rollback` |
| `permission denied for table schema_migrations` | 云数据库给的账号权限不够 | 用 owner 账号跑迁移 |

---

## 本节课要能说出口的一句话

> **多租户的表结构里三处必改：每张业务表加 `tenant_id`、每个唯一约束带上 `tenant_id`、每个父子关系用复合外键锁住租户；这三处漏一处，隔离就是假的。**
