# 第 58 节课：列表展示——三种状态一个都不能少

> **这份文件是你（学员）一步一步照着做的手册。**
> 上节课你有了一个空的总览页。今天做第一个真表格：**用户列表**。
> 重点不是"怎么画表格"，是**三种状态**：加载中、有数据、空。少一个，用户就会以为你的系统坏了。

**建议用时**：150 分钟
**你需要先完成**：第 57 节课（后台能进，总览页有数字）

---

# 第 0 步：先想清楚三种状态（10 分钟）

## 0.1 新手只做了一种状态

**新手写法：**

```javascript
const users = await fetchUsers();
renderTable(users);
```

**只有一个状态：有数据。**

**真实情况有四种：**

| 状态 | 什么时候 | 用户看到（新手版） | 用户的判断 |
|---|---|---|---|
| 加载中 | 请求发出到返回 | 空白页 | "坏了？" |
| 有数据 | 正常 | 表格 | "好" |
| 空 | 确实没数据 | 空表格（只有表头） | "坏了？" |
| 出错 | 网络/权限问题 | 空白页 | "坏了？" |

**四种情况里有三种，用户的判断都是"坏了"。**

**这就是为什么后台"感觉不好用"——不是功能少，是状态不全。**

## 0.2 三种状态的具体表现

**正确做法：**

```text
加载中：骨架屏（灰条）或"加载中……"
有数据：表格
空：   "还没有用户"+ 一句解释 + 一个行动按钮
出错： 红色提示条 + "重试"按钮
```

**"空"状态最容易漏，但它最重要：**

**因为新部署的系统，第一次打开就是空的。** 客户第一眼看到的是"空状态"，不是"有数据"。

**空状态做得好，客户觉得"这个系统还没数据，但看起来挺专业"。**
**空状态没做，客户觉得"这系统有问题"。**

## 0.3 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/admin.js` | `src/` | 加 `listUsers`（先不分页） |
| `src/admin-routes.js` | `src/` | 加 `GET /users` |
| `public/admin/users.html` | `public/admin/` | 用户列表页 |
| `public/admin.js` | `public/` | 加 `renderTable` 通用函数 |

---

# 第 1 步：写查询（25 分钟）

## 1.1 在 `src/admin.js` 里加

**先做最简单的版本：查全部（不分页、不筛选）。第 59、60 节再加。**

**打开 `src/admin.js`，在末尾加：**

```javascript
/**
 * 用户列表（第一版：查全部，不分页）。
 * 返回给前端的数据里绝不能有 password_hash。
 */
export const listUsers = ({ includeDeleted = false } = {}) => {
  const where = includeDeleted ? "1 = 1" : "deleted_at IS NULL";

  const rows = db
    .prepare(
      `SELECT id, email, nickname, role, status, created_at, updated_at, deleted_at, last_login_at
       FROM users
       WHERE ${where}
       ORDER BY id DESC`
    )
    .all();

  return rows.map(toListItem);
};

/**
 * 把数据库行转成前端要的形状。
 * 蛇形命名转驼峰，时间统一成 ISO。
 */
const toListItem = (row) => ({
  id: row.id,
  email: row.email,
  nickname: row.nickname,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  lastLoginAt: row.last_login_at || null,
});
```

## 1.2 四个关键点

### 第一点：`SELECT` 里明确列出字段，不用 `SELECT *`

```javascript
// 错
db.prepare("SELECT * FROM users").all();   // 包含 password_hash！
```

**为什么错：**

```text
① password_hash 被查出来，只要有一处不小心返回给前端，就是泄露
② 我把"绝不能泄露的字段"变成"默认会泄露，要靠记得排除"
```

**正确：**

**明确列出要的字段。** 这样"密码字段"从来没被查出来，也就不可能泄露。

**这和 `toPublicUser` 是同一个思路：让泄露需要主动动作，而不是让防止泄露需要主动动作。**

### 第二点：`WHERE ${where}` 的拼接安全吗

```javascript
const where = includeDeleted ? "1 = 1" : "deleted_at IS NULL";
```

**安全。因为 `where` 只有两个可能值，都是代码里写死的常量，不含任何用户输入。**

**危险的是这样：**

```javascript
// 危险！
const where = `email = '${req.query.email}'`;   // SQL 注入
```

**规则：**

```text
✅ 拼接"代码里的常量" → 安全
❌ 拼接"用户输入"     → 注入
```

**如果你不确定，就用 `?` 占位符。**

### 第三点：`ORDER BY id DESC`

**为什么按 id 倒序：**

```text
新建的用户在最前面（客户最关心"谁刚注册"）
id 是递增的，等价于"按注册时间倒序"，但比按时间排序快（主键索引）
```

**为什么不按 `created_at DESC`：**

**因为时间可能重复（同一毫秒注册两个），排序不稳定，翻页时会出现"同一条记录出现两次"。**

**用 id 排序，绝无重复。**

### 第四点：`last_login_at` 可能不存在

**如果你没做第 57 节的练习一，`users` 表没有这个字段。**

**`row.last_login_at` 是 `undefined`，`undefined || null` 是 `null`，不会报错。**

**但 `SELECT ... last_login_at` 会报错：**

```text
no such column: last_login_at
```

**两个选择：**

```text
A. 现在就把字段加上（迁移 009）
B. 先不查这个字段
```

**用 A，因为第 57 节练习一已经让你加过。如果你没做，现在加：**

```javascript
// 在 db.js 的 migrations 里加
{
  version: "009_add_last_login",
  sql: `ALTER TABLE users ADD COLUMN last_login_at TEXT;`,
}
```

**加完重启服务。**

## 1.3 在 `admin-routes.js` 里加接口

```javascript
import { getOverview, listUsers } from "./admin.js";

adminRouter.get("/users", (req, res) => {
  const users = listUsers();

  res.json({
    users,
    total: users.length,
  });
});
```

## 1.4 用 curl 先测

**不要一上来就写页面。先用 curl 确认接口对。**

**拿 Alice 的 token（第 57 节的方法），然后：**

```text
curl.exe http://localhost:4030/api/admin/users -H "Cookie: auth_token=Alice的token"
```

**应该看到：**

```json
{
  "users": [
    {
      "id": 2,
      "email": "bob@example.com",
      "nickname": "Bob",
      "role": "user",
      "status": "active",
      "createdAt": "2026-11-16T...",
      "updatedAt": "...",
      "deletedAt": null,
      "lastLoginAt": null
    },
    { "id": 1, "email": "alice@example.com", ... }
  ],
  "total": 2
}
```

**三个必须检查的点：**

1. **有没有 `password_hash`？** 没有 → 对。
2. **`id` 是不是倒序？** 2 在前 → 对。
3. **`total` 是不是 2？** 是 → 对。

**如果 `total` 是 0 但 `users` 有数据，说明有两个数据源，那一定是 bug。**

---

# 第 2 步：写通用表格渲染（30 分钟）

## 2.1 为什么抽成通用函数

**你会有很多列表：用户、内容、日志。**

**每个列表的结构都是"表头 + 行 + 空状态 + 加载状态"。**

**抽成一个函数，后面每个列表只要传两样东西：**

```javascript
renderTable(container, {
  columns: [...],      // 列定义
  rows: [...],         // 数据
  state: "loading" | "ready" | "empty" | "error",
  emptyText: "...",
  onRetry: () => {},
});
```

**这样第 3 个列表（日志）只要 20 行代码。**

## 2.2 在 `public/admin.js` 里加

**打开 `public/admin.js`，在末尾加：**

```javascript
// ============ 6. 通用表格 ============

/**
 * 渲染表格。支持四种状态。
 *
 * columns: [{ key, title, align, width, render(row, index) }]
 * rows: 数据数组
 * state: "loading" | "ready" | "empty" | "error"
 */
export const renderTable = (container, { columns, rows = [], state = "ready", emptyText, emptyHint, onRetry, rowKey }) => {
  if (!container) return;

  // 加载中：骨架屏
  if (state === "loading") {
    const cells = columns.map(() => `<td><div class="skeleton"></div></td>`).join("");
    const body = Array.from({ length: 5 })
      .map(() => `<tr>${cells}</tr>`)
      .join("");

    container.innerHTML = `<div class="table-wrap"><table><tbody>${body}</tbody></table></div>`;
    return;
  }

  // 出错
  if (state === "error") {
    container.innerHTML = `
      <div class="center-box">
        <div style="color:#b91c1c;font-size:14px;font-weight:500;margin-bottom:6px">加载失败</div>
        <div style="font-size:13px;margin-bottom:16px">${esc(emptyText || "请稍后重试")}</div>
        ${onRetry ? '<button class="btn primary" data-retry="1">重试</button>' : ""}
      </div>
    `;

    if (onRetry) {
      container.querySelector('[data-retry="1"]')?.addEventListener("click", onRetry);
    }
    return;
  }

  // 空
  if (state === "empty" || rows.length === 0) {
    container.innerHTML = `
      <div class="center-box">
        <div style="font-size:15px;color:#4b5563;font-weight:500;margin-bottom:6px">
          ${esc(emptyText || "还没有数据")}
        </div>
        <div style="font-size:13px;color:#9ca3af">${esc(emptyHint || "")}</div>
      </div>
    `;
    return;
  }

  // 有数据
  const thead = columns
    .map(
      (col) =>
        `<th class="${col.align === "right" ? "num" : ""}" ${col.width ? `style="width:${col.width}"` : ""}>${esc(col.title)}</th>`
    )
    .join("");

  const tbody = rows
    .map((row, index) => {
      const cells = columns
        .map((col) => {
          const value = col.render ? col.render(row, index) : row[col.key];
          const cls = col.align === "right" ? ' class="num"' : "";

          // 注意：col.render 返回的已经是 HTML，不再 esc
          // 默认值走 esc
          return `<td${cls}>${col.render ? value : esc(value)}</td>`;
        })
        .join("");

      const key = rowKey ? ` data-key="${esc(rowKey(row))}"` : "";
      return `<tr${key}>${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
};
```

## 2.3 三个关键点

### 关键点一：`col.render` 返回的 HTML 不再 esc

```javascript
return `<td${cls}>${col.render ? value : esc(value)}</td>`;
```

**这条规则必须记住：**

```text
col.render 存在 → 你返回的已经是 HTML（比如 <span class="tag">admin</span>）
col.render 不存在 → 用 row[col.key] 的原始值，自动 esc
```

**为什么这样设计：**

**因为 `render` 里你经常要输出标签：**

```javascript
render: (row) => `<span class="tag ${row.role === "admin" ? "blue" : "gray"}">${esc(row.role)}</span>`
```

**注意 `esc(row.role)` 在 `render` 内部手动写了。**

**所以 `render` 里插入的用户数据，必须自己 esc。**

**这是"灵活性的代价"——你要记得。**

**如果你怕忘，可以约定：`render` 里只在固定 HTML 结构外使用 `esc()`。**

### 关键点二：`esc(emptyHint || "")`

**`emptyHint` 可能没传，是 `undefined`。**

**`esc(undefined)` 返回 `"undefined"` 字符串！**

**因为 `esc` 里是 `String(text ?? "")`，`??` 对 `undefined` 生效，返回空字符串。**

**等等，`String(undefined ?? "")` = `String("")` = `""`。**

**所以没问题。但为了保险，还是写 `emptyHint || ""`。**

**为什么要多这一层：**

**万一你哪天改了 `esc` 的实现（比如去掉 `?? ""`），这里不会跟着坏。**

**防御性写法，成本是 6 个字符。**

### 关键点三：`rowKey` 可选

```javascript
const key = rowKey ? ` data-key="${esc(rowKey(row))}"` : "";
```

**为什么需要：**

**第 61 节做"编辑"时，你需要知道用户点了哪一行。**

**`data-key="2"` 让你能通过事件委托拿到：**

```javascript
container.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const row = btn.closest("tr");
  const id = row.dataset.key;
  // ...
});
```

**这就是"事件委托"——一个监听器管所有行。**

**比给每行绑监听器好：更省内存，动态渲染的行也自动生效。**

---

# 第 3 步：写用户列表页（35 分钟）

## 3.1 新建 `public/admin/users.html`

**注意目录：`public/admin/`。**

**自己敲：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>用户 · 管理后台</title>
  <link rel="stylesheet" href="/admin.css" />
</head>
<body>
  <div class="layout">
    <aside class="sidebar"></aside>

    <main class="main">
      <div class="page-head">
        <div>
          <h1>用户</h1>
          <div class="sub" id="sub">加载中……</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="refresh" class="small">刷新</button>
        </div>
      </div>

      <div class="alert" id="alert"></div>

      <div class="panel">
        <div class="panel-body" style="padding:0" id="table"></div>
      </div>
    </main>
  </div>

  <script type="module">
    import { guard, renderSidebar, renderTable, api, esc, fmtTime, fmtAgo, showAlert } from "/admin.js";

    const alertEl = document.getElementById("alert");
    const subEl = document.getElementById("sub");
    const tableEl = document.getElementById("table");

    const COLUMNS = [
      {
        key: "id",
        title: "ID",
        width: "60px",
        align: "right",
        render: (row) => `<span style="color:#9ca3af">#${row.id}</span>`,
      },
      {
        key: "email",
        title: "邮箱",
        render: (row) => `<span title="${esc(row.email)}">${esc(row.email)}</span>`,
      },
      {
        key: "nickname",
        title: "昵称",
        render: (row) => (row.nickname ? esc(row.nickname) : '<span style="color:#c4c8cf">未设置</span>'),
      },
      {
        key: "role",
        title: "角色",
        width: "90px",
        render: (row) =>
          row.role === "admin"
            ? '<span class="tag blue">管理员</span>'
            : '<span class="tag gray">普通用户</span>',
      },
      {
        key: "status",
        title: "状态",
        width: "90px",
        render: (row) => {
          const map = {
            active: ["green", "正常"],
            disabled: ["red", "已禁用"],
            deleted: ["gray", "已删除"],
          };
          const [cls, label] = map[row.status] || ["gray", row.status];
          return `<span class="tag ${cls}">${esc(label)}</span>`;
        },
      },
      {
        key: "lastLoginAt",
        title: "最后登录",
        width: "120px",
        render: (row) =>
          row.lastLoginAt
            ? `<span title="${esc(fmtTime(row.lastLoginAt))}">${esc(fmtAgo(row.lastLoginAt))}</span>`
            : '<span style="color:#c4c8cf">从未</span>',
      },
      {
        key: "createdAt",
        title: "注册时间",
        width: "150px",
        render: (row) => `<span style="color:#6b7280">${esc(fmtTime(row.createdAt))}</span>`,
      },
    ];

    const load = async () => {
      document.getElementById("alert").classList.remove("show");
      subEl.textContent = "加载中……";

      renderTable(tableEl, { columns: COLUMNS, state: "loading" });

      const result = await api("/api/admin/users");

      if (!result.ok) {
        subEl.textContent = "";
        renderTable(tableEl, {
          columns: COLUMNS,
          state: "error",
          emptyText: result.data?.error || "无法加载用户列表",
          onRetry: load,
        });
        return;
      }

      const { users, total } = result.data;

      subEl.textContent = `共 ${total} 个用户`;

      renderTable(tableEl, {
        columns: COLUMNS,
        rows: users,
        state: users.length === 0 ? "empty" : "ready",
        emptyText: "还没有用户",
        emptyHint: "用户注册后会自动出现在这里",
        rowKey: (row) => row.id,
      });
    };

    const main = async () => {
      const user = await guard();
      if (!user) return;

      renderSidebar("users", user);

      document.getElementById("refresh").addEventListener("click", load);

      await load();
    };

    main();
  </script>
</body>
</html>
```

## 3.2 五个关键点

### 关键点一：`COLUMNS` 用 `render` 而不是模板字符串拼

**新手可能会这么写：**

```javascript
tableEl.innerHTML = users.map((row) => `
  <tr>
    <td>${row.id}</td>
    <td>${row.email}</td>
    <td>${row.role}</td>
  </tr>
`).join("");
```

**问题：**

```text
① 每个列表都要重写这段
② 空状态、加载状态要另外写
③ esc() 容易忘
```

**`COLUMNS` 配置化的好处：**

```text
一个 renderTable 管三种状态
列定义可复用（items 列表可能也有"注册时间"这一列）
```

### 关键点二：`title` 属性做"完整值提示"

```javascript
render: (row) => `<span title="${esc(row.email)}">${esc(row.email)}</span>`
```

**为什么：**

**邮箱长了会被 CSS 截断（虽然这里没截断，但真实项目里会）。**

**鼠标悬停能看到完整值。**

**对日志、长文本尤其有用。**

### 关键点三：状态映射表

```javascript
const map = {
  active: ["green", "正常"],
  disabled: ["red", "已禁用"],
  deleted: ["gray", "已删除"],
};
const [cls, label] = map[row.status] || ["gray", row.status];
```

**为什么在 `render` 里做映射，不在后端做：**

```text
后端：返回 status: "active"（数据原值）
前端：负责显示成"正常"
```

**这是"后端管数据，前端管展示"的分工。**

**如果后端返回 `{ status: "active", statusLabel: "正常" }`，那前端要显示英文时后端就得改。**

**保持后端返回原始值，展示层负责翻译。**

**注意 `|| ["gray", row.status]` 兜底：**

**如果后端加了新状态（比如 `pending`），前端不会崩，会显示原始值。**

**这叫"向前兼容"。**

### 关键点四：`lastLoginAt` 用 `fmtAgo`

```javascript
<span title="${esc(fmtTime(row.lastLoginAt))}">${esc(fmtAgo(row.lastLoginAt))}</span>
```

**显示"3 分钟前"，悬停看精确时间。**

**为什么这样：**

```text
"3 分钟前"  → 一眼知道"刚用过"
"2026-11-16 17:24" → 要心算差多久
```

**后台的用途是"快速判断"，不是"精确记录"。**

**要做精确记录，去看日志页（第 63 节）。**

### 关键点五：`state: users.length === 0 ? "empty" : "ready"`

**注意：`renderTable` 内部已经有这段判断：**

```javascript
if (state === "empty" || rows.length === 0) { ... }
```

**所以外面其实不用传 `state: "empty"`，传 `rows: []` 就够了。**

**那为什么还传？**

**为了表达意图。** 读代码的人一眼看到"这里是空状态"，不用去翻 `renderTable` 的实现。

**代码可读性 > 少写几个字符。**

## 3.3 打开页面

```text
http://localhost:4030/admin/users.html
```

**应该看到：**

```text
┌──────────┬────────────────────────────────────────────────────────┐
│ 管理后台  │ 用户                                    [刷新]         │
│          │ 共 2 个用户                                             │
│ 总览     │ ┌────┬────────────────────┬──────┬──────┬────┬───────┐│
│ 用户 ←   │ │ ID │ 邮箱                │ 昵称 │ 角色 │状态│最后登录││
│ 内容     │ ├────┼────────────────────┼──────┼──────┼────┼───────┤│
│ 日志     │ │ #2 │ bob@example.com    │ Bob  │普通  │正常│ 从未  ││
│          │ │ #1 │ alice@example.com  │ Alice│管理员│正常│ 从未  ││
│ ─────    │ └────┴────────────────────┴──────┴──────┴────┴───────┘│
│ 返回前台  │                                                        │
│ alice    │                                                        │
│ [登出]    │                                                        │
└──────────┴────────────────────────────────────────────────────────┘
```

**"最后登录"显示"从未"，因为你还没做登录时更新 `last_login_at`。**

**这是第 57 节练习一的内容。如果没做，现在补上（下一节）。**

---

# 第 4 步：补上"最后登录时间"（20 分钟）

**列表里显示"从未"，说明这个功能没做完。现在补。**

## 4.1 在登录成功时更新

**打开 `src/app.js`，找到 `/api/login` 里"`const token = signToken(user);`"那一行。**

**在它之前加：**

```javascript
  // 更新最后登录时间
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    user.id
  );
```

**完整的位置：**

```javascript
app.post("/api/login", async (req, res) => {
  // ... 前面所有的校验 ...

  const match = await bcrypt.compare(prehashIfNeeded(password), user.password_hash);

  if (!match) {
    return res.status(401).json({ error: "邮箱或密码错误" });
  }

  // ← 加在这里
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    user.id
  );

  const token = signToken(user);
  setAuthCookie(res, token);

  res.json({ message: "登录成功", user: toPublicUser(user) });
});
```

**注意：`app.js` 里可能没有 `import { db }`。**

**检查文件顶部，如果没有就加：**

```javascript
import { db } from "./db.js";
```

**如果已经有了（第 50 节的 `peek` 之类用过），就不用重复加。**

## 4.2 重启并验证

```text
Ctrl + C
npm run dev
```

**然后：**

1. 在浏览器里登出（侧栏的"登出"按钮）
2. 重新登录
3. 打开 `http://localhost:4030/admin/users.html`
4. Alice 那一行的"最后登录"应该显示"刚刚"

**如果还是"从未"：**

```text
① 是不是没重启服务？
② 是不是登录的账号不是你改的那个？
③ 查数据库：SELECT id,email,last_login_at FROM users;
```

**查数据库：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,email,last_login_at FROM users').all()))"
```

## 4.3 为什么在"密码验证通过之后"更新

**位置很重要。**

**如果放在验证密码之前：**

```text
攻击者用错密码登录 → 也更新了 last_login_at
→ "最后登录时间"变成"最后一次尝试登录时间"
→ 客户看到"用户 3 分钟前登录过"，其实是攻击者在试密码
```

**放在验证通过之后，才是真正的"登录成功时间"。**

**这个细节很小，但它是"日志可信度"的基础。**

---

# 第 5 步：五个必须知道的坑（25 分钟）

## 坑 1：漏了 `esc()`

**这一条以后每节课都会说，因为它是最容易犯的。**

**在 `render` 里：**

```javascript
// 错
render: (row) => `<span>${row.nickname}</span>`

// 对
render: (row) => `<span>${esc(row.nickname)}</span>`
```

**验证方法（现在就做）：**

**把 Bob 的昵称改成一个恶意值：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET nickname=? WHERE id=2').run('<img src=x onerror=alert(1)>'); console.log('done'); })"
```

**刷新用户列表页。**

**如果弹出 alert → 你有 XSS。**
**如果没有 → 你 esc 对了。**

**恢复：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET nickname=? WHERE id=2').run('Bob'); console.log('done'); })"
```

## 坑 2：`SELECT *` 把 `password_hash` 带到前端

**验证方法：**

**F12 → Network → 找到 `/api/admin/users` 请求 → Preview。**

**展开任意一个 user 对象。**

**如果没有 `password_hash` → 对。**
**如果有 → 立刻改 `SELECT`，这是严重泄露。**

**这个检查应该成为肌肉记忆：任何返回用户数据的接口，都看一眼有没有密码字段。**

## 坑 3：表格很宽时页面横向滚动

**现象：**

```text
整个页面出现横向滚动条，侧栏被推出屏幕
```

**原因：** `.main` 没有 `min-width: 0`。

**第 57 节的 CSS 里已经写了：**

```css
.main {
  flex: 1;
  min-width: 0;
}
```

**如果你删了或没写，就会出这个问题。**

**验证：把浏览器窗口拖窄，看侧栏是不是还在。**

## 坑 4：时间显示成 ISO 字符串

**如果 `render` 里直接 `${row.createdAt}`：**

```text
2026-11-16T09:31:12.482Z
```

**用户看不懂，而且这是 UTC（比北京时间早 8 小时）。**

**必须 `fmtTime(row.createdAt)`。**

**验证：你注册一个账号，看"注册时间"是不是"现在"的时间。如果是早上 9 点但你实际是下午 5 点，说明没转换。**

## 坑 5：`renderTable` 的 `state` 传了 `"empty"` 但 `rows` 有数据

```javascript
renderTable(tableEl, { columns: COLUMNS, rows: users, state: "empty" });
```

**看 `renderTable` 的实现：**

```javascript
if (state === "empty" || rows.length === 0) { 显示空状态 }
```

**`state === "empty"` 时，不管 `rows` 有没有，都显示空。**

**这个是我故意的设计：状态优先于数据。**

**但如果你手滑传错了，会看到"有数据但显示空"。**

**排查：`console.log(users.length)`，和传的 `state` 对一下。**

---

# 第 6 步：故意做五个实验（25 分钟）

## 实验 1：把 `SELECT` 改成 `SELECT *`

**打开 `src/admin.js`，把 `listUsers` 里的字段列表改成 `*`。**

**重启，刷新页面，F12 看响应。**

**你会看到 `password_hash`。**

**这就是坑 2。**

**改回来。**

## 实验 2：故意让接口报错

**在 `admin-routes.js` 里加一行：**

```javascript
adminRouter.get("/users", (req, res) => {
  throw new Error("故意报错");
  // ...
});
```

**刷新页面。**

**你会看到：**

```text
┌─────────────────────────────┐
│        加载失败              │
│  无法加载用户列表            │
│      [重试]                 │
└─────────────────────────────┘
```

**点"重试" —— 还是失败（因为错误还在）。**

**这就是"出错状态"。**

**删掉那行 `throw`。**

**注意：`throw` 在 Express 4 里，如果没被 `try/catch` 捕获，会被错误中间件处理，返回 500。**

**所以前端拿到 500，`api()` 返回 `{ ok: false, status: 500 }`。**

## 实验 3：把所有用户软删除，看空状态

**先看有几个用户：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,email,deleted_at FROM users').all()))"
```

**全删（软删除）：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET deleted_at=? WHERE deleted_at IS NULL').run(new Date().toISOString()); console.log('done'); })"
```

**刷新用户列表页。**

**应该看到：**

```text
┌─────────────────────────────┐
│        还没有用户            │
│  用户注册后会自动出现在这里   │
└─────────────────────────────┘
```

**这就是"空状态"。**

**恢复：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET deleted_at=NULL').run(); console.log('done'); })"
```

**注意：这会恢复**所有**被软删除的用户，包括你以前删的。**

**如果只想恢复这两个，用 id：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET deleted_at=NULL WHERE id IN (1,2)').run(); console.log('done'); })"
```

## 实验 4：把 `ORDER BY id DESC` 改成 `ASC`

**刷新页面。**

**Bob（id=2）跑到后面去了。**

**思考：哪种更适合"用户管理"？**

**答案：DESC。因为新用户更值得关注。**

**但如果是"日志"，可能也是 DESC（最新的在前）。**

**"排序方向"由业务决定，不是技术决定。**

**改回来。**

## 实验 5：加 1000 个假用户

**这一条是为了让你理解"为什么必须分页"。**

**跑一个脚本生成 1000 个用户：**

```javascript
// 临时文件 src/seed-many.js
import { db, migrate } from "./db.js";
import bcrypt from "bcryptjs";

migrate();

const hash = await bcrypt.hash("test1234", 4);   // 轮数调低，快
const now = new Date().toISOString();

db.exec("BEGIN");

for (let i = 1; i <= 1000; i += 1) {
  try {
    db.prepare(
      `INSERT INTO users (email, password_hash, nickname, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(`bulk${i}@example.com`, hash, `批量用户 ${i}`, now, now);
  } catch {
    // 重复就跳过
  }
}

db.exec("COMMIT");

console.log("总数：", db.prepare("SELECT COUNT(*) AS c FROM users").get().c);
```

**跑：**

```text
node --env-file=.env src/seed-many.js
```

**然后刷新用户列表页。**

**你会看到 1002 行。**

**感受一下：**

```text
① 页面渲染花了多久（明显卡顿）
② 网络传输了多少字节（F12 看 Size）
③ 上下滚动有多长
```

**这就是"没有分页"的后果。**

**1000 条还能忍。10 万条会让浏览器卡死。**

**清理（把批量用户软删除）：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { const r = m.db.prepare(\"UPDATE users SET deleted_at=? WHERE email LIKE 'bulk%@example.com'\").run(new Date().toISOString()); console.log('软删除', r.changes, '条'); })"
```

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 三种状态各自长什么样（贴截图或文字描述）
2. `SELECT *` 实验里看到了什么字段
3. 1000 条数据的渲染感受
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：加一列"内容数"

**要求：** 每个用户有 `items` 关联。在用户列表里显示"内容数"。

**SQL：**

```sql
SELECT u.id, u.email, ..., 
  (SELECT COUNT(*) FROM items WHERE user_id = u.id AND deleted_at IS NULL) AS item_count
FROM users u
WHERE u.deleted_at IS NULL
ORDER BY u.id DESC
```

**为什么用子查询而不是 JOIN：**

```text
JOIN + GROUP BY 也行，但对"每个用户一个计数"来说，子查询更直观
而且数据量小时性能差别不大
```

**注意：** 数据量大时子查询会慢（每个用户一次查询）。那时要用 `LEFT JOIN + GROUP BY` 或物化计数。

## 练习二：加"排序切换"

**要求：** 表头点击切换排序（id / email / created_at）。

**先把排序参数传给后端：**

```text
GET /api/admin/users?sort=email&order=asc
```

**后端要白名单校验（防 SQL 注入）：**

```javascript
const SORTABLE = ["id", "email", "created_at", "last_login_at"];
const sort = SORTABLE.includes(req.query.sort) ? req.query.sort : "id";
const order = req.query.order === "asc" ? "ASC" : "DESC";
```

**为什么必须白名单：**

**`ORDER BY ${req.query.sort}` 是 SQL 注入的经典入口。**

**`ORDER BY` 不能用 `?` 占位符（占位符只能用于值，不能用于标识符），所以必须白名单。**

## 练习三：给表格加"行悬停高亮"和"选中"

**要求：**

1. 悬停时行背景变浅灰（CSS 已经有 `tbody tr:hover`）
2. 点击行时加上 `.selected` 类（背景变蓝）
3. 支持按住 Shift 多选（进阶，可选）

**为什么做这个：** 第 61 节的"批量操作"需要选中行。

## 练习四：想清楚这四个问题

```text
1. 为什么"空状态"比"有数据"更重要？
2. 为什么 `SELECT` 要明确列字段，不用 `*`？
3. 为什么 `ORDER BY` 必须白名单？
4. 1000 条数据不分页，具体慢在哪一步？
```

---

# 第 9 步：最终验收

## A. 接口

- [ ] `GET /api/admin/users` 返回 `{ users, total }`
- [ ] 响应里没有 `password_hash`
- [ ] 按 id 倒序
- [ ] 软删除的用户不出现
- [ ] 带 Bob 的 Cookie 返回 403

## B. 页面

- [ ] 加载时显示骨架屏
- [ ] 有数据时表格正确
- [ ] 所有用户都软删除时显示"还没有用户"
- [ ] 接口报错时显示"加载失败 + 重试"
- [ ] "最后登录"能显示"刚刚"
- [ ] 时间格式是 `2026-11-16 17:24`

## C. 安全

- [ ] 所有动态数据都过了 `esc()`
- [ ] 我做过恶意昵称实验，没有 alert
- [ ] `SELECT` 不含 `password_hash`

## D. 认知

- [ ] 我能说出四种状态
- [ ] 我知道为什么空状态最重要
- [ ] 我知道为什么 `render` 里要手动 esc
- [ ] 我知道 1000 条数据为什么必须分页

## 本节课要能说出口的一句话

> **列表不是"把数据画出来"，是"把加载中、有、空、错四种情况都画出来"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `no such column: last_login_at` | 迁移 009 没跑 | 重启服务 |
| 表格里是 `[object Object]` | `render` 返回了对象 | 返回字符串 |
| 弹 alert | 有 XSS | 检查 `esc()` |
| 表格撑破页面 | `.main` 没 `min-width: 0` | 加上 |
| 时间差 8 小时 | 显示的是 UTC | 用 `fmtTime` |
| "最后登录"一直"从未" | 登录没更新 | 加 `UPDATE` |
| 空状态不出现 | `rows` 不是空数组 | 检查接口返回 |
| 骨架屏一直不消失 | 接口 500 | F12 看 Network |
| 中文乱码 | `esc` 把中文转义了？不会 | 检查 `charset` |
| 侧栏菜单不亮 | `renderSidebar` 的 `key` 传错 | 传 `"users"` |
