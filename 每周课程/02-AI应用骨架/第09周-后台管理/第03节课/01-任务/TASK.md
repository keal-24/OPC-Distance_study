# 第 59 节课：搜索与筛选——把条件写进 URL

> **这份文件是你（学员）一步一步照着做的手册。**
> 上节课你能看到全部用户。今天加两个东西：**搜索框**和**筛选下拉**。
> 但真正要学的不是这两个控件，是：**条件必须存进 URL，否则刷新就丢。**

**建议用时**：150 分钟
**你需要先完成**：第 58 节课（用户列表能显示，四种状态都对）

---

# 第 0 步：先看"条件不存 URL"有多难受（10 分钟）

## 0.1 一个具体场景

**如果你的筛选条件存在 JS 变量里：**

```javascript
let currentFilter = { q: "", role: "" };

input.addEventListener("input", () => {
  currentFilter.q = input.value;
  load();
});
```

**用户做的事：**

```text
① 输入"alice"，看到 1 条结果
② 想再看一遍，按了 F5
③ 页面回到默认状态，1 条变回 100 条
④ 用户："我刚才筛的呢？"
```

**更难受的：**

```text
⑤ 用户想把"筛选后的结果"发给同事
⑥ 复制地址栏的 URL
⑦ 同事打开 → 全量数据
⑧ 同事："没筛啊？"
```

## 0.2 存进 URL 之后

```text
http://localhost:4030/admin/users.html?q=alice&role=admin
```

**这一个改动带来四件事：**

```text
① F5 刷新，条件还在
② 链接能分享（同事打开就是同样的筛选）
③ 浏览器前进/后退能用（改筛选 = 一条历史记录）
④ 收藏夹能存
```

**这就是"后台好不好用"的第一分水岭。**

## 0.3 URL 里放什么

**四个参数：**

```text
q        搜索词（匹配邮箱/昵称）
role     角色筛选（空 = 全部，admin / user）
status   状态筛选（空 = 全部，active / disabled）
page     页码（第 60 节用）
```

**URL 长这样：**

```text
?q=alice&role=admin&status=active&page=1
```

**注意：空值不写进 URL。**

```text
❌ ?q=&role=&status=&page=1      （丑，且没有意义）
✅ ?page=1                       （干净）
```

**规则：只管"非默认值"写进 URL。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/admin.js` | `src/` | 改：`listUsers` 支持筛选 |
| `src/admin-routes.js` | `src/` | 改：读 query 参数 |
| `public/admin.js` | `public/` | 加：`getParams` / `setParams` / `debounce` |
| `public/admin/users.html` | `public/admin/` | 改：加搜索框和筛选 |

---

# 第 1 步：后端支持筛选（30 分钟）

## 1.1 改造 `src/admin.js` 的 `listUsers`

**先看清楚要改什么。现在的版本：**

```javascript
export const listUsers = ({ includeDeleted = false } = {}) => {
  const where = includeDeleted ? "1 = 1" : "deleted_at IS NULL";
  // ...
};
```

**改成支持三个筛选条件。**

**注意拼接 SQL 的方式 —— 这是本节最重要的技术点。**

**打开 `src/admin.js`，把 `listUsers` 整个替换掉：**

```javascript
/**
 * 用户列表（第二版：支持搜索和筛选，仍不分页）。
 *
 * filters: { q, role, status, includeDeleted }
 * 返回 { users, total, applied }
 */
export const listUsers = ({ q = "", role = "", status = "", includeDeleted = false } = {}) => {
  const conditions = [];
  const params = [];

  // 1. 软删除过滤（默认排除）
  if (!includeDeleted) {
    conditions.push("deleted_at IS NULL");
  }

  // 2. 关键词搜索：匹配 email 或 nickname
  const keyword = String(q).trim();

  if (keyword) {
    // 关键：转义 LIKE 的通配符
    const escaped = escapeLike(keyword);
    conditions.push("(email LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\')");
    params.push(`%${escaped}%`, `%${escaped}%`);
  }

  // 3. 角色筛选：白名单
  if (role && ["admin", "user"].includes(role)) {
    conditions.push("role = ?");
    params.push(role);
  }

  // 4. 状态筛选：白名单
  if (status && ["active", "disabled", "deleted"].includes(status)) {
    conditions.push("status = ?");
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT id, email, nickname, role, status, created_at, updated_at, deleted_at, last_login_at
       FROM users
       ${where}
       ORDER BY id DESC`
    )
    .all(...params);

  return {
    users: rows.map(toListItem),
    total: rows.length,
    applied: { q: keyword, role, status },
  };
};

/**
 * 转义 LIKE 的特殊字符。
 * 不转义的话，用户输入 "%" 会匹配全部，"_" 会匹配任意单字符。
 */
const escapeLike = (text) =>
  String(text).replace(/[\\%_]/g, (char) => `\\${char}`);
```

## 1.2 五个关键点，逐个说透

### 关键点一：条件用数组拼，不用字符串拼

```javascript
const conditions = [];
const params = [];

conditions.push("deleted_at IS NULL");
conditions.push("role = ?");
params.push(role);

const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
db.prepare(`SELECT ... ${where}`).all(...params);
```

**为什么这么写：**

```text
① 条件可能 0-4 个，用数组自然处理"有几个拼几个"
② 值和 SQL 分离：SQL 里只有 ?，值全在 params 里
③ 加新条件只加两行（push 条件 + push 参数）
```

**对比新手写法：**

```javascript
// 错：手动拼值，SQL 注入
let where = "deleted_at IS NULL";
if (q) where += ` AND email LIKE '%${q}%'`;   // 危险！

// 也错：手动处理 AND 的位置
let where = "WHERE 1=1";
if (q) where += ` AND email LIKE ?`;
if (role) where += ` AND role = ?`;
// 参数顺序容易和条件顺序错位
```

**第一种是漏洞。第二种能跑但容易出错（参数顺序和条件顺序要对齐）。**

**数组法两个问题都没有。**

### 关键点二：`escapeLike` 不可省

**假设用户输入 `%`：**

```javascript
conditions.push("email LIKE ?");
params.push(`%${"%"}}%`);   // 实际值是 "%%%"
```

**`LIKE '%%%'` 匹配所有行。**

**用户以为"我搜了个 %"，实际是"什么都没筛"。**

**用户输入 `_`：**

**`LIKE '%_%'` 匹配"至少有一个字符"的所有行。** 也是全部。

**转义后：**

```javascript
escapeLike("%")   // "\\%"
escapeLike("a_b") // "a\\_b"
```

**SQL 变成 `LIKE '%\%%' ESCAPE '\'`，正确匹配"包含 % 字符的"行。**

**注意 `ESCAPE '\\'` 在 JS 字符串里是两个反斜杠，在 SQL 里是一个反斜杠。**

**容易搞混。记住：**

```javascript
// JS 源码里写
"ESCṀ ... ESCAPE '\\'"
// 实际发给 SQLite 的是
// ESCAPE '\'
```

### 关键点三：`role` 和 `status` 用白名单

```javascript
if (role && ["admin", "user"].includes(role)) { ... }
```

**为什么：**

**即使这里用的是 `?` 占位符（不会注入），白名单仍然有必要：**

```text
① 用户传 role=hacker → 不加条件 → 返回全部（等于静默忽略）
   比返回 0 条更好：用户不会困惑"为什么没结果"
② 避免无效查询浪费数据库
③ 让"合法值"这件事在代码里明确
```

**注意我选了"静默忽略"而不是"报错"。**

**为什么不报错：**

**URL 是用户能改的。他改错了不该看到红色错误，应该看到"筛选条件无效，显示全部"。**

**但也有另一种做法：返回 400。** 这个取舍看产品。

**这一周选"忽略"，因为后台是给自己的工具，宽容一点更好用。**

### 关键点四：`applied` 字段回传实际生效的条件

```javascript
return {
  users: ...,
  total: ...,
  applied: { q: keyword, role, status },
};
```

**为什么：**

**因为前端传了 `role=hacker`，后端忽略了。前端需要知道"实际生效的是什么"。**

**用途：**

```javascript
// 前端拿到 applied 后，把输入框的值同步成实际生效的值
input.value = result.applied.q;
select.value = result.applied.role;
```

**这样用户看到"我输了 hacker，但下拉框回到'全部'"，就明白了。**

**不回传的话，输入框显示 `hacker` 但实际没筛 —— 用户会以为"这个筛选坏了"。**

### 关键点五：`SELECT` 依然明确列字段

**保留了第 58 节的好习惯。`password_hash` 依然不在查询里。**

## 1.3 接口读参数

**在 `src/admin-routes.js` 里改 `/users`：**

```javascript
adminRouter.get("/users", (req, res) => {
  const { q, role, status } = req.query;

  const result = listUsers({
    q: typeof q === "string" ? q : "",
    role: typeof role === "string" ? role : "",
    status: typeof status === "string" ? status : "",
  });

  res.json(result);
});
```

**为什么检查 `typeof === "string"`：**

**`req.query.q` 可能是数组。**

```text
?q=a&q=b   →  req.query.q 是 ["a", "b"]
```

**攻击者能构造这种 URL。**

**如果直接传给 `listUsers`，`String(["a","b"])` 会变成 `"a,b"` —— 不崩，但行为诡异。**

**检查类型，只接受字符串。这是"输入校验"的一部分，成本 20 个字符。**

## 1.4 用 curl 测四种情况

**拿 Alice 的 token（`ALICE`），依次测：**

**1. 不带参数（全量）：**

```text
curl.exe "http://localhost:4030/api/admin/users" -H "Cookie: auth_token=ALICE"
```

**应该返回全部未删除用户。**

**2. 搜索：**

```text
curl.exe "http://localhost:4030/api/admin/users?q=alice" -H "Cookie: auth_token=ALICE"
```

**应该只返回 alice。**

**3. 筛角色：**

```text
curl.exe "http://localhost:4030/api/admin/users?role=admin" -H "Cookie: auth_token=ALICE"
```

**应该只返回 admin。**

**4. 组合：**

```text
curl.exe "http://localhost:4030/api/admin/users?q=example&role=admin" -H "Cookie: auth_token=ALICE"
```

**应该返回"邮箱含 example 且是 admin"的用户。**

**5. 恶意输入（关键测试）：**

```text
curl.exe "http://localhost:4030/api/admin/users?q=%25" -H "Cookie: auth_token=ALICE"
```

**`%25` 是 URL 编码的 `%`。**

**应该返回 0 条（因为没有用户的邮箱里真的有 `%` 字符）。**

**如果返回全部 → 你的 `escapeLike` 没生效。**

**6. SQL 注入测试：**

```text
curl.exe "http://localhost:4030/api/admin/users?q=%27%20OR%201%3D1--" -H "Cookie: auth_token=ALICE"
```

**`%27` 是 `'`，`%20` 是空格，`%3D` 是 `=`。**

**解码后是 `' OR 1=1--`。**

**应该返回 0 条（因为这个字符串不在任何邮箱里）。**

**如果返回全部 → 你有 SQL 注入漏洞（但你应该没有，因为用了 `?` 占位符）。**

**这两个测试做完，你对"参数化查询"的理解就不是纸上的了。**

---

# 第 2 步：写 URL 参数工具（30 分钟）

## 2.1 在 `public/admin.js` 里加

**三个函数：读参数、写参数、防抖。**

```javascript
// ============ 7. URL 参数 ============

/**
 * 读取 URL 参数。
 * 返回普通对象，只包含非空值。
 */
export const getParams = () => {
  const params = new URLSearchParams(window.location.search);
  const result = {};

  params.forEach((value, key) => {
    const trimmed = value.trim();
    if (trimmed !== "") result[key] = trimmed;
  });

  return result;
};

/**
 * 更新 URL 参数（不刷新页面）。
 * 值为空字符串或 null 的参数会被删掉。
 */
export const setParams = (patch, { replace = false } = {}) => {
  const params = new URLSearchParams(window.location.search);

  Object.entries(patch).forEach(([key, value]) => {
    const str = value === null || value === undefined ? "" : String(value).trim();

    if (str === "") params.delete(key);
    else params.set(key, str);
  });

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;

  if (replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
};

// ============ 8. 防抖 ============

/**
 * 防抖：停止输入 delay 毫秒后才执行。
 * 用于搜索框，避免每按一个键就发一次请求。
 */
export const debounce = (fn, delay = 350) => {
  let timer = null;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
```

## 2.2 三个函数的关键点

### `getParams`：只保留非空值

```javascript
const trimmed = value.trim();
if (trimmed !== "") result[key] = trimmed;
```

**为什么：**

```text
?q=&role=admin   →  { role: "admin" }   （q 被丢掉）
```

**这样代码里只需要判断 `if (params.role)`，不用判断"有 key 但值为空"。**

**少一层判断，少一个 bug。**

### `setParams`：用 `replaceState` 还是 `pushState`

```javascript
if (replace) {
  window.history.replaceState({}, "", url);   // 替换当前历史记录
} else {
  window.history.pushState({}, "", url);      // 新增一条历史记录
}
```

**区别：**

```text
pushState    → 浏览器的"后退"按钮能回上一个筛选状态
replaceState → 不新增历史记录，后退直接跳走
```

**什么时候用哪个：**

| 操作 | 用哪个 | 为什么 |
|---|---|---|
| 输入搜索词（防抖后） | `replace` | 每个字都记历史，后退要按 10 次 |
| 切换下拉筛选 | `push` | 用户可能想退回上一个筛选 |
| 翻页 | `push` | 想后退回上一页 |
| 点"清空筛选" | `push` | 是一次明确的操作 |

**这一节的做法：**

```javascript
// 搜索框（防抖后）：replace，避免历史记录爆炸
searchDebounced = debounce(() => {
  setParams({ q: input.value, page: null }, { replace: true });
  load();
});

// 下拉框：push
select.addEventListener("change", () => {
  setParams({ role: select.value, page: null }, { replace: false });
  load();
});
```

**注意 `page: null`：**

**任何筛选条件变化，都要回到第 1 页。**

**为什么：**

```text
你在第 5 页，然后输入"alice"（只有 1 条结果）
如果还在第 5 页 → 显示空
用户以为"没搜到"
```

**回到第 1 页才是对的。第 60 节会正式做分页，但这里先把这个逻辑埋进去。**

### `debounce`：为什么是 350ms

**各值的影响：**

| 延迟 | 体验 |
|---|---|
| 0ms（不防抖） | 输入 "alice" 发 5 次请求 |
| 150ms | 打字快的人还是发好几次 |
| **350ms** | 大多数人的打字间隔内只发 1 次 |
| 800ms | 感觉"卡顿"，输入完要等一下才出结果 |

**350ms 是常见经验值。**

**但有个问题：防抖会让用户"输入完等 350ms 才看到结果"。**

**替代方案：节流（throttle）—— 每 350ms 最多发一次，不等用户停。**

**这一周用防抖，因为"等用户输入完再查"更符合搜索的心智。**

---

# 第 3 步：改造页面（35 分钟）

## 3.1 改 `public/admin/users.html`

**这次要改三处：**

```text
① 页面顶部加一排筛选控件
② URL 参数初始化筛选控件的值
③ 任何筛选变化 → 更新 URL → 重新加载
```

**完整文件（整份替换，但结构不变，只是加了筛选区）：**

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

      <!-- 筛选区 -->
      <div class="panel">
        <div class="panel-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="margin:0;flex:1;min-width:200px">
            <label for="q">搜索</label>
            <input id="q" type="search" placeholder="邮箱或昵称，支持部分匹配" autocomplete="off" />
          </div>

          <div class="field" style="margin:0;width:130px">
            <label for="role">角色</label>
            <select id="role">
              <option value="">全部</option>
              <option value="admin">管理员</option>
              <option value="user">普通用户</option>
            </select>
          </div>

          <div class="field" style="margin:0;width:120px">
            <label for="status">状态</label>
            <select id="status">
              <option value="">全部</option>
              <option value="active">正常</option>
              <option value="disabled">已禁用</option>
            </select>
          </div>

          <button id="clear" class="small" style="margin-bottom:1px">清空</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-body" style="padding:0" id="table"></div>
      </div>
    </main>
  </div>

  <script type="module">
    import {
      guard,
      renderSidebar,
      renderTable,
      api,
      esc,
      fmtTime,
      fmtAgo,
      getParams,
      setParams,
      debounce,
    } from "/admin.js";

    const alertEl = document.getElementById("alert");
    const subEl = document.getElementById("sub");
    const tableEl = document.getElementById("table");
    const qEl = document.getElementById("q");
    const roleEl = document.getElementById("role");
    const statusEl = document.getElementById("status");

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
        render: (row) =>
          row.nickname ? esc(row.nickname) : '<span style="color:#c4c8cf">未设置</span>',
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
        width: "110px",
        render: (row) =>
          row.lastLoginAt
            ? `<span title="${esc(fmtTime(row.lastLoginAt))}">${esc(fmtAgo(row.lastLoginAt))}</span>`
            : '<span style="color:#c4c8cf">从未</span>',
      },
      {
        key: "createdAt",
        title: "注册时间",
        width: "140px",
        render: (row) => `<span style="color:#6b7280">${esc(fmtTime(row.createdAt))}</span>`,
      },
    ];

    /** 从 URL 读条件，写进控件 */
    const syncControlsFromUrl = () => {
      const params = getParams();
      qEl.value = params.q || "";
      roleEl.value = params.role || "";
      statusEl.value = params.status || "";
      return params;
    };

    /** 从控件读条件 */
    const readControls = () => ({
      q: qEl.value.trim(),
      role: roleEl.value,
      status: statusEl.value,
    });

    const load = async () => {
      document.getElementById("alert").classList.remove("show");
      subEl.textContent = "加载中……";
      renderTable(tableEl, { columns: COLUMNS, state: "loading" });

      const condition = readControls();
      const search = new URLSearchParams();

      if (condition.q) search.set("q", condition.q);
      if (condition.role) search.set("role", condition.role);
      if (condition.status) search.set("status", condition.status);

      const query = search.toString();
      const result = await api(`/api/admin/users${query ? `?${query}` : ""}`);

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

      const { users, total, applied } = result.data;

      // 用后端回传的 applied 同步控件（后端可能忽略了非法值）
      qEl.value = applied.q || "";
      roleEl.value = applied.role || "";
      statusEl.value = applied.status || "";

      // 统计文案分三种：无条件、有搜索、有筛选
      const hasFilter = Boolean(applied.q || applied.role || applied.status);

      subEl.textContent = hasFilter ? `筛选出 ${total} 个用户` : `共 ${total} 个用户`;

      // 空状态文案要区分"真的没人"和"筛不出来"
      const isEmpty = users.length === 0;

      renderTable(tableEl, {
        columns: COLUMNS,
        rows: users,
        state: isEmpty ? "empty" : "ready",
        emptyText: isEmpty && hasFilter ? "没有符合条件的用户" : "还没有用户",
        emptyHint:
          isEmpty && hasFilter
            ? "试试放宽筛选条件，或点「清空」"
            : "用户注册后会自动出现在这里",
        rowKey: (row) => row.id,
      });
    };

    /** 条件变了：写 URL + 重新加载 */
    const applyFilter = (patch, { replace }) => {
      setParams({ ...patch, page: null }, { replace });
      load();
    };

    const searchDebounced = debounce(() => {
      applyFilter({ q: qEl.value.trim() }, { replace: true });
    }, 350);

    const main = async () => {
      const user = await guard();
      if (!user) return;

      renderSidebar("users", user);

      // 首屏：URL 有参数就同步到控件
      syncControlsFromUrl();

      qEl.addEventListener("input", searchDebounced);

      qEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          // 回车立即搜（不等防抖）
          applyFilter({ q: qEl.value.trim() }, { replace: true });
        }
      });

      roleEl.addEventListener("change", () => {
        applyFilter({ role: roleEl.value }, { replace: false });
      });

      statusEl.addEventListener("change", () => {
        applyFilter({ status: statusEl.value }, { replace: false });
      });

      document.getElementById("clear").addEventListener("click", () => {
        qEl.value = "";
        roleEl.value = "";
        statusEl.value = "";
        setParams({ q: null, role: null, status: null, page: null }, { replace: false });
        load();
      });

      document.getElementById("refresh").addEventListener("click", load);

      // 浏览器后退/前进：URL 变了要重新读
      window.addEventListener("popstate", () => {
        syncControlsFromUrl();
        load();
      });

      await load();
    };

    main();
  </script>
</body>
</html>
```

## 3.2 六个关键点

### 关键点一：首屏从 URL 读，不是从默认值开始

```javascript
syncControlsFromUrl();   // 在 main() 里，load() 之前
```

**不调这个，直接打开 `?q=alice` 的链接，输入框会是空的。**

**然后 `load()` 读控件得到空值，又去请求全部数据 —— 用户看到的是全量。**

**这个 bug 的表现是"分享的链接不管用"。**

### 关键点二：`load()` 从**控件**读条件，不从 URL 读

```javascript
const condition = readControls();   // 读 DOM
```

**为什么不从 URL 读：**

**因为用户刚才可能在输入框里打了字（还没更新 URL）。**

**流程是：**

```text
用户输入 → 防抖 350ms → applyFilter → setParams（写 URL）→ load()
                                                                  ↓
                                                        load 读控件（和 URL 一致）
```

**两者在稳态下一致。但"读控件"更直接。**

**如果 `load()` 从 URL 读，就要保证"URL 一定先更新"，多一个隐含依赖。**

### 关键点三：`applied` 回写控件

```javascript
const { users, total, applied } = result.data;

qEl.value = applied.q || "";
roleEl.value = applied.role || "";
statusEl.value = applied.status || "";
```

**为什么：**

**用户可能在 URL 里手动输 `?role=hacker`。**

**后端忽略了它，`applied.role` 是空。**

**回写后，下拉框回到"全部" —— 用户立刻明白"这个值不合法"。**

**不回写的话，下拉框显示... 等等，`role=hacker` 不在 `<option>` 里，浏览器会显示空白或第一个选项。用户会困惑。**

**回写是明确的。**

### 关键点四：回车立即搜

```javascript
qEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyFilter({ q: qEl.value.trim() }, { replace: true });
  }
});
```

**为什么：**

**防抖 350ms，但用户按回车是"我确定要搜了"的明确信号。**

**不该让他再等 350ms。**

**注意 `event.key === "Enter"`，不是 `keyCode === 13`。**

**`keyCode` 已废弃。**

### 关键点五：`popstate` 处理浏览器后退

```javascript
window.addEventListener("popstate", () => {
  syncControlsFromUrl();
  load();
});
```

**为什么必须：**

**`pushState` 加了一条历史记录。用户点后退，URL 变了，但页面不会自动重新加载（这是 SPA 的行为）。**

**所以你要监听 `popstate`，重新读 URL 并刷新数据。**

**不加这个，用户点后退会发现"地址栏变了但内容没变"。**

**这个 bug 很常见，而且用户会觉得"你的系统有毛病"。**

### 关键点六：空状态文案要区分两种

```javascript
emptyText: isEmpty && hasFilter ? "没有符合条件的用户" : "还没有用户",
emptyHint: isEmpty && hasFilter ? "试试放宽筛选条件，或点「清空」" : "用户注册后会自动出现在这里",
```

**为什么：**

```text
没筛选但空 → "还没有用户"（系统新部署，正常）
有筛选但空 → "没有符合条件的用户"（筛太严，不是系统的问题）
```

**第二种如果显示"还没有用户"，用户会以为"我的用户全没了"，实际是筛没了。**

**这个细节能省掉一次惊慌。**

## 3.3 打开页面测试

**1. 打开：**

```text
http://localhost:4030/admin/users.html
```

**2. 在搜索框输入 `alice`。**

**等 350ms，列表变 1 条，URL 变成 `?q=alice`。**

**3. 按 F5。**

**列表还是 1 条，输入框里还是 `alice`。**

**这就是本节的核心成果。**

**4. 点"清空"。**

**列表恢复全部，URL 变回 `/admin/users.html`。**

**5. 选角色"管理员"。**

**列表只剩 Alice，URL 是 `?role=admin`。**

**6. 点浏览器后退。**

**回到上一步（全部）。**

**这说明 `popstate` 生效了。**

**7. 复制 URL `?q=alice`，开一个新的匿名窗口（或无痕窗口）粘贴。**

**会跳到登录页（因为没登录）。** 这是对的。

**登录后再粘贴，应该看到筛选结果。**

---

# 第 4 步：五个必须知道的坑（25 分钟）

## 坑 1：`LIKE` 没转义，`%` 匹配全部

**验证方法：**

**在搜索框输入一个 `%`。**

**如果列表还是全部 → 你的 `escapeLike` 没生效。**

**正确行为：应该显示"没有符合条件的用户"（因为没有邮箱含 `%`）。**

**排查：**

```javascript
// 在 escapeLike 里加一行临时日志
const escapeLike = (text) => {
  const result = String(text).replace(/[\\%_]/g, (char) => `\\${char}`);
  console.log("escapeLike:", JSON.stringify(text), "→", JSON.stringify(result));
  return result;
};
```

**输入 `%`，应该打印：**

```text
escapeLike: "%" → "\\%"
```

**如果没有打印，说明 `escapeLike` 没被调用（可能 `keyword` 是空的）。**

## 坑 2：`ESCAPE '\'` 写成 `ESCAPE '\\'` 之后 SQL 报错

**JS 字符串和 SQL 字符串的反斜杠要数清楚。**

```javascript
// JS 源码
"(email LIKE ? ESCAPE '\\')"

// JS 解析后（发给 SQLite 的）
(column LIKE ? ESCAPE '\')

// SQLite 看到的是
ESCAPE '\'
```

**如果数据库报：**

```text
ESCAPE expression must be a single character
```

**说明你传了 `ESCAPE '\\'`（两个反斜杠），SQLite 把它当成两个字符。**

**修法：JS 里写 `'\\'`（两个），实际是 SQL 里的一个。**

**这个坑很小但很烦。**

## 坑 3：搜索框 `input` 事件没防抖 → 请求风暴

**不防抖的现象：**

**输入 `alice`（5 个字符），发 5 次请求。**

**F12 → Network 里能看到 5 个 `/api/admin/users` 请求。**

**而且响应顺序可能乱：**

```text
请求 1（"a"）   → 200，100 条
请求 2（"al"）  → 200，10 条
请求 3（"ali"） → 200，3 条
请求 4（"alic"）→ 200，1 条
请求 5（"alice"）→ 200，1 条
```

**如果请求 1 最慢，最后返回，你会在搜索框显示 `alice` 时看到"100 条"。**

**这叫"竞态"（race）。**

**防抖解决 90%。剩下 10% 的极端情况（防抖后仍可能乱序），要靠"请求序号"：**

```javascript
let requestSeq = 0;

const load = async () => {
  const seq = ++requestSeq;
  const result = await api(...);

  if (seq !== requestSeq) return;   // 有更新的请求了，丢弃这次结果

  renderTable(...);
};
```

**这一周先做防抖，练习里会让你加序号。**

## 坑 4：`popstate` 不触发（因为用了 `replaceState`）

**`replaceState` 不产生历史记录，所以后退会跳到更早的页面，不会在当前页触发一次 `popstate` 让 URL 变回上一个筛选。**

**结果：**

```text
用户输入 alice（replace，无新历史）
用户再选"管理员"（push，新历史）
用户点后退 → 回到 alice 的状态（有 popstate，正常）
用户再点后退 → 跳到上一个页面（比如总览页）
```

**第二种后退是"离开当前页面"，符合预期。**

**但如果你全部用 `replaceState`：**

```text
输入 alice（replace）
选管理员（replace）
点后退 → 直接跳回总览页，中间的筛选状态全丢
```

**用户会觉得"后退按钮坏了"。**

**所以：搜索用 replace（避免记录爆炸），下拉用 push（值得记录）。**

**这个取舍要理解，不是随便选。**

## 坑 5：URL 参数没做长度限制

**用户（或攻击者）可以构造：**

```text
?q=<10000 个字符>
```

**后果：**

```text
① URL 超长，某些浏览器/代理会拒绝
② 后端 `LIKE '%xxxx...%'` 慢查询
③ 日志里一大堆垃圾
```

**修法：后端截断。**

```javascript
const keyword = String(q).trim().slice(0, 100);
```

**100 字符够搜索用了。**

**前端也可以加 `maxlength="100"`，但那是体验，后端截断才是必须的。**

---

# 第 5 步：故意做五个实验（25 分钟）

## 实验 1：去掉防抖

**把 `debounce(..., 350)` 改成直接调用。**

**在搜索框里慢慢输入 `alice`。**

**F12 → Network，数一下有几个请求。**

**应该是 5 个。**

**加回防抖，再数一次，应该是 1 个。**

## 实验 2：去掉 `escapeLike`

**把 `const escaped = escapeLike(keyword)` 改成 `const escaped = keyword`。**

**在搜索框输入 `%`。**

**列表应该是全部（所有行都匹配）。**

**这就是"LIKE 通配符注入"。**

**加回来。**

## 实验 3：手动改 URL 参数

**在地址栏把 URL 改成：**

```text
http://localhost:4030/admin/users.html?role=hacker
```

**回车。**

**页面应该显示全量（后端忽略了非法值），下拉框回到"全部"。**

**这就是 `applied` 回写的作用。**

**然后改成：**

```text
http://localhost:4030/admin/users.html?q=zzzzz
```

**应该显示"没有符合条件的用户"（不是"还没有用户"）。**

**这就是空状态文案的区分。**

## 实验 4：把搜索框改成 `sessionStorage`

**临时改成"条件存 sessionStorage 不存 URL"：**

```javascript
// 存
sessionStorage.setItem("filter", JSON.stringify(readControls()));

// 读
const saved = JSON.parse(sessionStorage.getItem("filter") || "{}");
```

**然后：**

```text
① 搜索 alice
② 复制 URL（现在 URL 还是干净的）
③ 粘贴到新标签页
```

**新标签页看不到筛选结果。**

**这就是"条件不存 URL"的代价。**

**改回 URL 方案。**

## 实验 5：URL 参数超长

**在地址栏输入：**

```text
http://localhost:4030/admin/users.html?q=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa(重复到 500 个字符)
```

**观察：**

```text
① 请求发出去了吗？
② 返回什么？
③ 页面卡吗？
```

**然后加后端截断，再试。**

**感受一下"输入校验"的必要性。**

---

# 第 6 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 五种 curl 测试的结果（尤其是 `%` 和注入那两个）
2. URL 参数方案的四个好处
3. `replaceState` 和 `pushState` 的取舍
4. 「卡在哪」

---

# 第 7 步：课后练习

## 练习一：加"是否包含已删除"的筛选

**要求：** 加一个复选框"包含已删除"。

**URL 参数：`?deleted=1`**

**后端：**

```javascript
includeDeleted: req.query.deleted === "1"
```

**注意：**

**勾选后要能看到 `deleted_at` 有值的用户，并且状态列显示"已删除"。**

**这一条是为第 61 节的"恢复"功能铺路。**

## 练习二：加"请求序号"防竞态

**要求：** 在 `load()` 里加序号判断，丢弃过期响应。

```javascript
let requestSeq = 0;

const load = async () => {
  const seq = ++requestSeq;
  // ...
  const result = await api(...);
  if (seq !== requestSeq) return;
  // ...
};
```

**验证方法：**

**在 Network 里把网速调成"Slow 3G"（F12 → Network → Throttling）。**

**快速输入 `a` `al` `ali`，看最终结果对不对。**

**不加序号时，可能显示 `a` 的结果（100 条），因为它的响应最慢最后到。**

## 练习三：加"搜索高亮"

**要求：** 搜索 `alice` 时，列表里的 `alice` 三个字背景变黄。

**实现思路：**

```javascript
const highlight = (text, keyword) => {
  if (!keyword) return esc(text);

  const safeText = esc(text);
  const safeKeyword = esc(keyword);

  // 转义正则特殊字符
  const pattern = safeKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return safeText.replace(new RegExp(pattern, "gi"), (match) => `<mark>${match}</mark>`);
};
```

**注意顺序：先 `esc` 再高亮，不能反过来。**

**反过来会怎样：**

```javascript
// 错
`<mark>${keyword}</mark>` 插进未转义的 text → XSS
```

**为什么先 esc：**

**`esc` 把 `<` 变成 `&lt;`。之后的 `<mark>` 是你自己加的，不会被转义。**

**这个顺序是"安全"和"功能"同时正确的前提。**

## 练习四：想清楚这四个问题

```text
1. 为什么筛选条件必须放 URL？
2. 为什么搜索用 replaceState，下拉用 pushState？
3. `applied` 回写控件的目的是什么？
4. 为什么不防抖会导致"显示的结果和输入框不匹配"？
```

---

# 第 8 步：最终验收

## A. 后端

- [ ] `listUsers` 支持 `q` / `role` / `status`
- [ ] `escapeLike` 能转义 `%` `_` `\`
- [ ] `role` / `status` 有白名单
- [ ] `q` 有长度上限
- [ ] 返回 `applied` 字段
- [ ] 用 `%` 搜索返回 0 条（不是全部）
- [ ] 用 `' OR 1=1--` 搜索返回 0 条

## B. 前端

- [ ] 搜索框 350ms 防抖
- [ ] 回车立即搜
- [ ] 试完筛选 URL 有对应参数
- [ ] F5 刷新条件还在
- [ ] 后退按钮能用
- [ ] 空状态文案分两种
- [ ] `applied` 能回写控件

## C. 认知

- [ ] 我能说出 URL 存条件的四个好处
- [ ] 我知道 `LIKE` 通配符注入是什么
- [ ] 我知道 `pushState` 和 `replaceState` 的区别
- [ ] 我知道空状态为什么要分两种文案

## 本节课要能说出口的一句话

> **刷新不丢条件、链接能分享，这才叫"筛选做完了"。存 JS 变量里的一律不算。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 输入 `%` 返回全部 | 没 `escapeLike` | 加上 |
| `ESCAPE expression must be a single character` | JS 里反斜杠数错 | 源码写 `'\\'` |
| 输入中文搜不到 | 正常（`LIKE` 对中文可用） | 检查是否 `escape` 过 |
| 刷新后条件丢了 | 没从 URL 读 | `syncControlsFromUrl()` |
| 后退按钮内容不变 | 没监听 `popstate` | 加上 |
| 每个字都发请求 | 没防抖 | `debounce` |
| 显示的结果和输入框不匹配 | 竞态 | 加请求序号 |
| 非法 role 返回 0 条 | 白名单分支写了 return | 改成"忽略条件" |
| 空状态说"还没有用户"但实际有 | 没区分两种文案 | 判断 `hasFilter` |
| URL 特别长 | 没截断 | `slice(0, 100)` |
