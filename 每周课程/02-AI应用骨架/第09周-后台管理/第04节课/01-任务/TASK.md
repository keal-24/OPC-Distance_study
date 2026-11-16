# 第 60 节课：分页——`COUNT` 和 `SELECT` 的 `WHERE` 必须一模一样

> **这份文件是你（学员）一步一步照着做的手册。**
> 上节课你有了筛选。上上节课你做 1000 条数据时已经体验过"不分页会卡"。
> 今天做分页。**核心只有一条规则，但九成人第一次都会写错。**

**建议用时**：150 分钟
**你需要先完成**：第 59 节课（筛选能用，URL 带参数）

---

# 第 0 步：先看那个最经典的 bug（10 分钟）

## 0.1 错误代码长这样

```javascript
// 列表：带筛选
const rows = db
  .prepare("SELECT * FROM users WHERE role = ? LIMIT 20 OFFSET ?")
  .all(role, offset);

// 总数：忘了筛选
const total = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
```

**跑起来会怎样：**

```text
数据库里有 5000 个用户，其中 3 个是 admin
筛选 role=admin，第 1 页 → 显示 3 条
总数 → 5000
页码 → 5000 / 20 = 250 页
```

**用户看到：**

```text
共 5000 条　1 2 3 ... 250
当前显示 3 条
```

**然后点第 2 页 → 空白。**

**用户的判断：**

```text
"这个后台有 bug"（对）
"或者我的数据丢了"（更可怕）
```

## 0.2 为什么九成人会写错

**因为这两个查询在代码里隔得很远：**

```javascript
const rows = db.prepare(`SELECT ... ${where} LIMIT ? OFFSET ?`).all(...);
// ↑ 这里有 where

// ... 中间隔了 30 行代码 ...

const total = db.prepare("SELECT COUNT(*) FROM users").get().c;
// ↑ 这里忘了 where
```

**或者在改代码时：**

```text
① 先做了列表接口（无筛选）
② 加了筛选，改了 SELECT
③ 忘了 COUNT 也要改
```

**这个 bug 不会报错，只会显示错的页码。**

## 0.3 唯一可靠的写法：共用同一个 `WHERE`

**把条件构造抽出来，`SELECT` 和 `COUNT` 都用它。**

```javascript
const { where, params } = buildUserWhere(filters);

const total = db.prepare(`SELECT COUNT(*) AS c FROM users ${where}`).get(...params).c;
const rows = db.prepare(`SELECT ... FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
  .all(...params, limit, offset);
```

**`where` 和 `params` 是同一个源，不可能不一致。**

**这是今天唯一要记住的一句话。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/admin.js` | `src/` | 改：抽出 `buildUserWhere`，加分页 |
| `src/admin-routes.js` | `src/` | 改：读 `page` / `pageSize` |
| `public/admin.js` | `public/` | 加：`renderPager` 分页组件 |
| `public/admin/users.html` | `public/admin/` | 改：加页码区 |

---

# 第 1 步：抽出条件构造（30 分钟）

## 1.1 改造 `src/admin.js`

**打开 `src/admin.js`，找到 `listUsers`，整个替换成下面这一组函数。**

**先看清楚整体结构：**

```text
buildUserWhere(filters)      → 只负责"生成 WHERE 和参数"
countUsers(filters)          → 只负责"算总数"
listUsers(filters)           → 只负责"查一页数据"
```

**三个函数，一个条件源。**

**自己敲：**

```javascript
/**
 * 构造用户查询的 WHERE 子句和参数。
 * listUsers 和 countUsers 都调用它 —— 这是保证一致的唯一方法。
 */
const buildUserWhere = ({ q = "", role = "", status = "", includeDeleted = false } = {}) => {
  const conditions = [];
  const params = [];

  if (!includeDeleted) {
    conditions.push("deleted_at IS NULL");
  }

  const keyword = String(q).trim().slice(0, 100);

  if (keyword) {
    const escaped = escapeLike(keyword);
    conditions.push("(email LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\')");
    params.push(`%${escaped}%`, `%${escaped}%`);
  }

  if (role && ["admin", "user"].includes(role)) {
    conditions.push("role = ?");
    params.push(role);
  }

  if (status && ["active", "disabled", "deleted"].includes(status)) {
    conditions.push("status = ?");
    params.push(status);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
    applied: {
      q: keyword,
      role: ["admin", "user"].includes(role) ? role : "",
      status: ["active", "disabled", "deleted"].includes(status) ? status : "",
    },
  };
};

const escapeLike = (text) => String(text).replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * 总数。和 listUsers 用同一个 buildUserWhere。
 */
export const countUsers = (filters = {}) => {
  const { where, params } = buildUserWhere(filters);

  const row = db.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get(...params);

  return Number(row.total);
};

/**
 * 用户列表（第三版：分页）。
 *
 * filters: { q, role, status, includeDeleted, page, pageSize }
 * 返回 { users, total, page, pageSize, totalPages, hasPrev, hasNext, applied }
 */
export const listUsers = (filters = {}) => {
  const pageSize = clampInt(filters.pageSize, 20, 1, 100);
  const page = clampInt(filters.page, 1, 1, Number.MAX_SAFE_INTEGER);

  const { where, params, applied } = buildUserWhere(filters);

  const total = countUsers(filters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 页码越界：请求第 100 页但只有 3 页 → 拉回最后一页
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = db
    .prepare(
      `SELECT id, email, nickname, role, status, created_at, updated_at, deleted_at, last_login_at
       FROM users
       ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  return {
    users: rows.map(toListItem),
    total,
    page: safePage,
    pageSize,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    requestedPage: page,
    applied,
  };
};

/**
 * 把任意输入转成"在 [min, max] 之间的整数"，非法值用 fallback。
 */
const clampInt = (value, fallback, min, max) => {
  const num = Number(value);

  if (!Number.isFinite(num)) return fallback;

  const int = Math.trunc(num);

  if (int < min) return min;
  if (int > max) return max;

  return int;
};
```

## 1.2 七个关键点

### 关键点一：`buildUserWhere` 返回三个东西

```javascript
return { where, params, applied };
```

**为什么 `applied` 也在这里算：**

**因为"哪些条件实际生效了"这个判断，`buildUserWhere` 最清楚。**

**如果放在外面算，就要重复一遍白名单判断，两处容易不一致。**

**一个逻辑只写一次，是最重要的原则之一。**

### 关键点二：`countUsers` 单独导出

**为什么不把它塞进 `listUsers` 里面：**

```text
① 总览页可能只需要"总数"，不需要数据
② 方便单独测试
③ 读代码时"算总数"和"查数据"分开，一眼能看出用了同一个 where
```

**但它内部一定调用 `buildUserWhere`。** 这就是一致性保证。

### 关键点三：页码越界拉回最后一页

```javascript
const safePage = Math.min(page, totalPages);
```

**为什么不返回空：**

```text
用户在第 2 页，然后输入搜索词（只剩 1 页）
如果还请求第 2 页 → 空
用户看到"没有符合条件的用户" → 以为搜不到
实际有 1 条数据
```

**拉回最后一页，用户能看到真实结果。**

**注意返回了 `requestedPage`：**

```javascript
requestedPage: page,   // 用户请求的页码
page: safePage,        // 实际用的页码
```

**为什么两个都返回：**

**前端可以用这个发现"我被修正了"，然后更新 URL：**

```javascript
if (result.requestedPage !== result.page) {
  setParams({ page: result.page }, { replace: true });
}
```

**不更新 URL 的话，地址栏显示 `page=100` 但实际显示第 3 页 —— 用户刷新又回到 100，又被修正。**

**这个细节让"越界"这件事变得干净。**

### 关键点四：`clampInt` 而不是 `parseInt`

```javascript
// 错
const pageSize = parseInt(req.query.pageSize) || 20;
```

**问题：**

```text
parseInt("abc")      → NaN → || 20 → 20  ✅
parseInt("-5")       → -5  → || 20 → -5  ❌ 负数！
parseInt("999999")   → 999999        ❌ 一次查 100 万条
parseInt("20.7")     → 20            （可接受）
```

**`clampInt` 处理了所有情况：**

```text
clampInt("abc", 20, 1, 100)     → 20
clampInt("-5", 20, 1, 100)      → 1
clampInt("999999", 20, 1, 100)  → 100
clampInt("0", 20, 1, 100)       → 1
clampInt(undefined, 20, 1, 100) → 20
```

**注意 `clampInt` 的签名是 `(value, fallback, min, max)`，不是 `(value, min, max, fallback)`。**

**我故意让 `fallback` 放第二个，因为你读代码时 `clampInt(filters.pageSize, 20, 1, 100)` 一眼能看出"默认 20，范围 1-100"。**

### 关键点五：`pageSize` 上限 100

**为什么必须设上限：**

```text
?pageSize=1000000 → 一次查 100 万条 → 内存爆、数据库卡
```

**这是"最便宜的 DoS"—— 一个 URL 就能打垮你的服务。**

**上限 100 是经验值：**

```text
20   → 默认，一屏刚好
50   → 表格密一点，能看
100  → 极限，再大就没意义了（人看不完）
```

### 关键点六：`LIMIT ? OFFSET ?` 的参数位置

```javascript
.all(...params, pageSize, offset);
```

**注意顺序：**

```text
SQL 里 ? 出现的顺序：... WHERE 的 ? ... LIMIT ? OFFSET ?
                       └── params ──┘  └─ 后面两个 ─┘
```

**`params` 里是筛选条件的值，`pageSize` 和 `offset` 在最后。**

**顺序错了会怎样：**

```text
LIMIT "admin" OFFSET "user"  → 报错或返回 0 条
```

**这个错很容易犯，因为 `...params` 展开后看不出来。**

**规则：`?` 的数量和参数数量必须相等，顺序必须对应。**

**自检方法：**

```javascript
console.log("SQL ? 个数:", (sql.match(/\?/g) || []).length);
console.log("参数个数:", params.length + 2);   // +2 是 pageSize 和 offset
```

### 关键点七：`ORDER BY id DESC` + `LIMIT/OFFSET` 的顺序必须稳定

**为什么"稳定排序"重要：**

```text
第 1 页：id 100, 99, 98, ..., 81
翻开第 2 页时，如果新插入了一个用户（id 101）
第 2 页：id 80, 79, ..., 61
→ 没问题，因为 id 是唯一的、递增的

但如果按 created_at 排序：
第 1 页：..., id=85（时间 10:00:00）
新用户插入（时间 10:00:00，和 id=85 同一秒）
第 2 页：可能又出现 id=85（因为排序不稳定）
→ 同一条记录出现两次
```

**用唯一字段（id）排序，永远不会有重复。**

**如果必须按时间排序，就 `ORDER BY created_at DESC, id DESC` —— 加 id 作为"决胜字段"。**

---

# 第 2 步：接口传参（15 分钟）

## 2.1 改 `admin-routes.js`

```javascript
adminRouter.get("/users", (req, res) => {
  const { q, role, status, page, pageSize, deleted } = req.query;

  const result = listUsers({
    q: typeof q === "string" ? q : "",
    role: typeof role === "string" ? role : "",
    status: typeof status === "string" ? status : "",
    page: typeof page === "string" ? page : "1",
    pageSize: typeof pageSize === "string" ? pageSize : "20",
    includeDeleted: deleted === "1",
  });

  res.json(result);
});
```

**注意 `includeDeleted: deleted === "1"`：不用 `typeof` 检查，因为是布尔判断。**

**`deleted` 是 `"1"` 就 true，其他（包括 undefined）都是 false。**

## 2.2 curl 测四种情况

**1. 默认：**

```text
curl.exe "http://localhost:4030/api/admin/users" -H "Cookie: auth_token=ALICE"
```

**应该看到：**

```json
{
  "users": [...],      // 最多 20 条
  "total": 2,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1,
  "hasPrev": false,
  "hasNext": false,
  "requestedPage": 1,
  "applied": { "q": "", "role": "", "status": "" }
}
```

**2. 指定每页 1 条：**

```text
curl.exe "http://localhost:4030/api/admin/users?pageSize=1" -H "Cookie: auth_token=ALICE"
```

**应该：`users` 1 条，`total` 2，`totalPages` 2，`hasNext: true`。**

**3. 越界：**

```text
curl.exe "http://localhost:4030/api/admin/users?page=99&pageSize=20" -H "Cookie: auth_token=ALICE"
```

**应该：`page` 变成 1（拉回），`requestedPage` 是 99。**

**4. 超大的 pageSize：**

```text
curl.exe "http://localhost:4030/api/admin/users?pageSize=999999" -H "Cookie: auth_token=ALICE"
```

**应该：`pageSize` 变成 100。**

**这四个测试做完，你的分页逻辑就是可靠的。**

## 2.3 关键的第五个测试：`COUNT` 和 `SELECT` 是否一致

**这一条是今天最重要的人工验证。**

**1. 先看全部：**

```text
curl.exe "http://localhost:4030/api/admin/users?pageSize=100" -H "Cookie: auth_token=ALICE"
```

**记下 `total` 和 `users.length`。应该相等（如果总数小于 100）。**

**2. 加筛选：**

```text
curl.exe "http://localhost:4030/api/admin/users?role=admin&pageSize=100" -H "Cookie: auth_token=ALICE"
```

**`total` 应该是 1（只有 Alice 是 admin），`users.length` 也是 1。**

**3. 如果 `total` 还是 2 —— 恭喜，你复现了本节开头那个 bug。**

**修法：检查 `countUsers` 是不是真的调用了 `buildUserWhere`。**

**这个测试以后每个列表接口都要做一遍。** 三行 curl，能抓出最典型的 bug。

---

# 第 3 步：写分页组件（30 分钟）

## 3.1 在 `public/admin.js` 里加

**打开 `public/admin.js`，在末尾加：**

```javascript
// ============ 9. 分页组件 ============

/**
 * 渲染分页控件。
 *
 * onGo(page) 会在用户点击页码时被调用。
 * 组件自己不改 URL，交给调用方处理。
 */
export const renderPager = (container, { page, pageSize, total, totalPages, hasPrev, hasNext, onGo }) => {
  if (!container) return;

  if (total === 0) {
    container.innerHTML = "";
    return;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages = buildPageList(page, totalPages);

  const buttons = pages
    .map((item) => {
      if (item === "...") {
        return '<span style="padding:7px 4px;color:#9ca3af">…</span>';
      }

      const active = item === page;
      return `<button class="small ${active ? "primary" : ""}" data-page="${item}" ${
        active ? 'aria-current="page"' : ""
      }>${item}</button>`;
    })
    .join("");

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid #eef0f3">
      <div style="font-size:12.5px;color:#6b7280">
        第 ${start}-${end} 条，共 ${total} 条
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="small" data-page="${page - 1}" ${hasPrev ? "" : "disabled"}>上一页</button>
        ${buttons}
        <button class="small" data-page="${page + 1}" ${hasNext ? "" : "disabled"}>下一页</button>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = Number(btn.dataset.page);

      if (!Number.isInteger(target) || target < 1 || target > totalPages) return;
      if (target === page) return;

      onGo(target);
    });
  });
};

/**
 * 生成页码列表，中间用 "..." 省略。
 * 例：当前 5，共 20 → [1, "...", 4, 5, 6, "...", 20]
 */
const buildPageList = (current, totalPages, span = 1) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages]);

  for (let offset = -span; offset <= span; offset += 1) {
    const value = current + offset;
    if (value >= 1 && value <= totalPages) pages.add(value);
  }

  // 当前页靠前时，补齐前几个
  if (current <= 3) {
    [2, 3, 4].forEach((value) => value <= totalPages && pages.add(value));
  }

  // 当前页靠后时，补齐后几个
  if (current >= totalPages - 2) {
    [totalPages - 1, totalPages - 2, totalPages - 3].forEach(
      (value) => value >= 1 && pages.add(value)
    );
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];

  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push("...");
    result.push(value);
  });

  return result;
};
```

## 3.2 四个关键点

### 关键点一：组件不改 URL

**`renderPager` 只做两件事：画控件、回调 `onGo`。**

**改 URL 交给调用方：**

```javascript
renderPager(pagerEl, {
  ...result,
  onGo: (nextPage) => {
    setParams({ page: nextPage }, { replace: false });   // 翻页用 push
    load();
  },
});
```

**为什么不内嵌 `setParams`：**

```text
① 日志页可能要"翻页不记历史"（replace）
② 有些列表不用 URL（弹窗里的小列表）
③ 组件只管视图，不该知道路由
```

**这叫"单一职责"。** 组件可复用性来自"不知道上下文"。

### 关键点二：页码省略算法

**`buildPageList(5, 20)` 返回：**

```javascript
[1, "...", 4, 5, 6, "...", 20]
```

**为什么这样：**

```text
第 1 页和第 20 页永远显示（用户可能想跳首尾）
当前页 ±1 显示（相邻页可能想看）
中间省略（页太多，全显示放不下）
```

**如果 20 页全显示：**

```text
[1][2][3][4][5][6][7][8][9][10][11][12][13][14][15][16][17][18][19][20]
```

**一屏放不下，而且要缩到 8px 字才勉强。**

**省略是必须的。**

**注意 `span = 1`：只显示 `current-1`、`current`、`current+1` 三个。**

**如果要显示更多（比如 ±2），改参数即可。**

### 关键点三：`start` 和 `end` 的计算

```javascript
const start = (page - 1) * pageSize + 1;
const end = Math.min(page * pageSize, total);
```

**例：page=2, pageSize=20, total=25**

```text
start = (2-1)*20+1 = 21
end = min(2*20, 25) = min(40, 25) = 25
→ "第 21-25 条，共 25 条"
```

**`Math.min` 是必须的。**

**不加的话：**

```text
end = 40 → "第 21-40 条，共 25 条"
```

**用户会想"哪来的 40 条"。**

### 关键点四：`disabled` 而不是隐藏

```javascript
<button ... ${hasPrev ? "" : "disabled"}>上一页</button>
```

**为什么不用隐藏：**

```text
隐藏 → 按钮消失，布局跳动
禁用 → 按钮在但不亮，布局稳定
```

**布局稳定比"干净"重要。** 尤其是表格上方的控件，跳动会让用户失去位置感。

**还有一个更重要的理由：**

**禁用状态告诉用户"这里有上一页，但现在是第一页"。**

**隐藏的话，用户不知道有没有上一页。** 这是"可发现性"问题。

---

# 第 4 步：接到页面（30 分钟）

## 4.1 改 `users.html`

**改动三处：**

```text
① 表格下面加一个分页容器
② load() 里读 page 参数
③ load() 结束后调 renderPager
```

**具体操作：**

### 第一步：在表格面板里加分页容器

**找到这段：**

```html
      <div class="panel">
        <div class="panel-body" style="padding:0" id="table"></div>
      </div>
```

**改成：**

```html
      <div class="panel">
        <div class="panel-body" style="padding:0" id="table"></div>
        <div id="pager"></div>
      </div>
```

**注意：`#pager` 在 `#table` 的**兄弟位置**，不在它内部。**

**为什么：**

**因为 `renderTable` 会整体替换 `#table` 的 `innerHTML`。**

**如果分页容器在 `#table` 里面，每次重新渲染表格都会把分页控件擦掉。**

**这是个很隐蔽的 bug，表现为"翻页控件消失"。**

### 第二步：`load()` 里读 page

**在 `readControls` 里加：**

```javascript
    const readControls = () => {
      const params = getParams();

      return {
        q: qEl.value.trim(),
        role: roleEl.value,
        status: statusEl.value,
        page: params.page || "1",
      };
    };
```

**注意：`page` 不从控件读，从 URL 读。**

**为什么：**

**页面上没有"页码输入框"，页码只存在于 URL 里。**

**所以读 URL 是唯一来源。**

### 第三步：请求带 page

**在 `load()` 里构造查询字符串时加：**

```javascript
      const condition = readControls();
      const search = new URLSearchParams();

      if (condition.q) search.set("q", condition.q);
      if (condition.role) search.set("role", condition.role);
      if (condition.status) search.set("status", condition.status);
      if (condition.page && condition.page !== "1") search.set("page", condition.page);
```

**为什么 `page !== "1"` 就不写：**

**保持 URL 干净。第 1 页是默认，不写。**

### 第四步：渲染分页

**在 `load()` 的 `renderTable(...)` 之后加：**

```javascript
      const pagerEl = document.getElementById("pager");

      renderPager(pagerEl, {
        page: result.data.page,
        pageSize: result.data.pageSize,
        total: result.data.total,
        totalPages: result.data.totalPages,
        hasPrev: result.data.hasPrev,
        hasNext: result.data.hasNext,
        onGo: (nextPage) => {
          setParams({ page: nextPage }, { replace: false });
          load();
        },
      });

      // 如果后端修正了页码（越界），同步 URL
      if (result.data.requestedPage !== result.data.page) {
        setParams({ page: result.data.page === 1 ? null : result.data.page }, { replace: true });
      }
```

### 第五步：加载中/出错时清空分页

**在 `load()` 开头加：**

```javascript
      renderTable(tableEl, { columns: COLUMNS, state: "loading" });
      document.getElementById("pager").innerHTML = "";
```

**为什么：**

**如果不清理，加载时你会看到"旧的页码 + 新的骨架屏"。**

**用户会以为"数据没变"。**

**出错时也要清（或者在出错分支里清）：**

```javascript
      if (!result.ok) {
        subEl.textContent = "";
        document.getElementById("pager").innerHTML = "";
        renderTable(tableEl, { ... state: "error" ... });
        return;
      }
```

## 4.2 测试完整链路

**先造够多的数据（至少 30 个），否则看不到分页。**

**用第 58 节实验五的脚本：**

```text
node --env-file=.env src/seed-many.js
```

**然后：**

**1. 打开用户列表。**

**应该看到"第 1-20 条，共 1002 条"，页码是 `1 2 3 ... 51`。**

**2. 点第 2 页。**

**URL 变成 `?page=2`，显示"第 21-40 条"。**

**3. 按 F5。**

**还在第 2 页。**

**4. 点浏览器后退。**

**回到第 1 页。**

**5. 搜 `bulk1`。**

**应该只有 11 条（bulk1, bulk10-19, bulk100-199 等），页码变成 1 页。**

**注意：搜索时 `page` 被清掉了（因为 `applyFilter` 里传了 `page: null`）。**

**6. 在搜索状态下点第 99 页（手动改 URL）。**

**应该被拉回第 1 页，并且 URL 里的 `page` 被改成 1（或删掉）。**

**这就是 `requestedPage` 的作用。**

## 4.3 清理测试数据

**跑完测试，清理批量用户：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { const r = m.db.prepare(\"UPDATE users SET deleted_at=?, status='deleted' WHERE email LIKE 'bulk%@example.com'\").run(new Date().toISOString()); console.log('软删除', r.changes, '条'); })"
```

---

# 第 5 步：五个必须知道的坑（25 分钟）

## 坑 1：`COUNT` 忘了 `WHERE`

**本节的核心。已经在第 0 步讲透。**

**自检方法（每次改完列表接口都跑）：**

```text
# 总数
curl "URL/api/admin/users?role=admin&pageSize=100"
```

**看 `total` 是不是等于 `users.length`（当总数小于 pageSize 时）。**

**不等就是 bug。**

## 坑 2：`LIMIT ?` 传了 `NaN`

```javascript
.all(...params, req.query.pageSize, offset);
```

**如果 `req.query.pageSize` 是 `"abc"`：**

```text
SQLite: LIMIT "abc" → 报错 "datatype mismatch"
或 → 返回 0 条
```

**所以必须 `clampInt`。**

**验证：**

```text
curl "URL/api/admin/users?pageSize=abc"
```

**应该返回 20 条（fallback），不报错。**

## 坑 3：分页容器被 `renderTable` 擦掉

**见 4.1 第一步。**

**症状：翻页控件消失。**

**排查：F12 → Elements，看 `#pager` 还在不在。如果不在，检查它是不是被放在了 `#table` 里面。**

## 坑 4：OFFSET 很大时越来越慢

**这是 offset 分页的固有问题。**

```sql
SELECT * FROM users ORDER BY id DESC LIMIT 20 OFFSET 100000
```

**数据库要：**

```text
① 扫过前 100020 行（丢弃前 100000 行）
② 返回 20 行
```

**页码越大越慢。10 万页时可能要几秒。**

**什么时候能接受：**

```text
总数 < 1 万    → 没问题
总数 1-10 万   → 明显变慢，但还能用
总数 > 10 万   → 必须换方案
```

**换什么方案（知道就行，这一周不实现）：**

```sql
-- 键集分页（keyset pagination）
-- 不用 OFFSET，用"上一页最后一条的 id"
SELECT * FROM users WHERE id < ? ORDER BY id DESC LIMIT 20
```

**优点：不管翻到第几页，都一样快（走索引）。**
**缺点：不能"跳到第 50 页"，只能"上一页/下一页"。**

**后台一般不需要跳页，所以键集分页很适合。第 22 周（性能）会正式做。**

## 坑 5：`pageSize` 修改后 `page` 没重置

**场景：**

```text
用户在第 5 页（每页 20 条）
改成每页 100 条
```

**如果不重置 `page`：**

```text
第 5 页 × 100 条/页 = 从第 401 条开始
但总数可能只有 300 条 → 越界 → 拉回最后一页
```

**看起来能工作（因为越界被修正了），但用户会困惑"为什么我跳到最后一页"。**

**正确做法：改 `pageSize` 时把 `page` 重置为 1。**

```javascript
pageSizeEl.addEventListener("change", () => {
  setParams({ pageSize: pageSizeEl.value, page: null }, { replace: false });
  load();
});
```

**`page: null` 会从 URL 里删掉 `page`，等于回到第 1 页。**

---

# 第 6 步：故意做五个实验（25 分钟）

## 实验 1：`COUNT` 去掉 `WHERE`

**改 `countUsers`：**

```javascript
export const countUsers = (filters = {}) => {
  // 故意不用 buildUserWhere
  const row = db.prepare(`SELECT COUNT(*) AS total FROM users`).get();
  return Number(row.total);
};
```

**重启，筛选 `role=admin`。**

**你会看到：**

```text
共 1002 条，显示 1 条
页码：1 2 3 ... 51
```

**点第 2 页 → 空白。**

**这就是本节开头的 bug。**

**改回来。**

## 实验 2：去掉页码越界修正

**把 `const safePage = Math.min(page, totalPages)` 改成 `const safePage = page`。**

**手动访问 `?page=999`。**

**你会看到：**

```text
表格是空的（0 条）
但总数显示 1002
页码显示 "第 19981-20000 条，共 1002 条"（数学上荒谬）
```

**这个"荒谬的文案"就是没有越界修正的样子。**

**改回来。**

## 实验 3：`pageSize=1000000`

**改之前先测：**

```text
curl "http://localhost:4030/api/admin/users?pageSize=1000000" -H "Cookie: auth_token=ALICE"
```

**看响应时间和大小。**

**现在 `clampInt` 会把它限制到 100，所以很快。**

**把 `clampInt(filters.pageSize, 20, 1, 100)` 的 `max` 改成 `10000000`，再测。**

**观察：**

```text
① 响应时间（可能 1-2 秒）
② 响应体大小（1002 条完整 JSON，可能 500KB）
```

**1000 条还行。如果你有 10 万条，这个请求会让服务卡死。**

**改回来。**

## 实验 4：故意让排序不稳定

**把 `ORDER BY id DESC` 改成 `ORDER BY role DESC`。**

**（很多人都是 `user` 角色，`role` 重复度极高。）**

**然后造一条"翻页时数据变化"的场景：**

```text
① 打开第 1 页，记下第一行的 id
② 在第 2 个终端里插入一个新用户
③ 点第 2 页
④ 看有没有和第 1 页重复的 id
```

**因为 `role` 有大量重复值，排序不稳定，很可能出现重复。**

**改回 `ORDER BY id DESC`，重复消失。**

**这个实验让你理解"为什么排序字段必须唯一（或加唯一字段兜底）"。**

## 实验 5：把分页容器放到 `#table` 里面

**改 `users.html`：**

```html
<div class="panel-body" style="padding:0" id="table">
  <div id="pager"></div>
</div>
```

**刷新页面。**

**分页控件应该显示一瞬间，然后消失（被 `renderTable` 擦掉）。**

**这就是坑 3。**

**改回来（`#pager` 放外面）。**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. `COUNT` 和 `SELECT` 共用 `where` 的代码（贴关键几行）
2. 五个 curl 测试的结果
3. offset 分页的性能问题（什么时候该换键集）
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：加"每页条数"选择器

**要求：** 在筛选区加一个下拉：20 / 50 / 100。

**URL 参数：`?pageSize=50`**

**改 `pageSize` 时 `page` 要重置为 1（见坑 5）。**

**验证：选 100 后刷新，还是 100。**

## 练习二：加"跳到第 N 页"

**要求：** 分页区右边加一个输入框，回车跳到指定页。

**注意：**

```javascript
const target = clampInt(input.value, 1, 1, totalPages);
```

**必须 `clamp`，否则用户输 99999 会触发越界。**

**虽然后端会修正，但前端的表现会"跳一下再弹回来"，很难看。**

## 练习三（选做）：把 `items` 也做成列表页

**注意：这是选做，不是主线。七节课的主线只有三个页面：`index.html` / `users.html` / `logs.html`。**

**想做的话，工作量比你想的大 —— 不是"复制一个 HTML"就完事：**

```text
① 后端没有 /api/admin/items 接口，你要照着 admin-routes.js 的写法加一个
② 查询层要写 listItems，WHERE 也要和 COUNT 共用
③ 前端要新建 public/admin/items.html
④ 侧栏 NAV_ITEMS 要加一项（否则侧栏不高亮）
```

**四个地方都要动。这就是"复制一个页面"的真实成本。**

**如果你只想要练手，不想动后端，做一个更小的练习：**

**打开 `users.html`，把 `COLUMNS` 里的"角色"列删掉，把"状态"列改成"注册天数"。**

**改列定义就能改表格 —— 这才是 `renderTable` 抽象的价值。先验证这一点，再去动后端。**

**提示：真要把三个列表页都做出来之后，重复代码会很明显，那时再抽通用初始化函数：**

```javascript
export const initListPage = ({ endpoint, columns, filters, emptyText }) => { ... };
```

**这一周不做这个抽象。抽象要在你有两份以上真实重复代码之后做，提前抽象出来的接口十有八九是错的。**

## 练习四：想清楚这四个问题

```text
1. 为什么 COUNT 和 SELECT 必须共用同一个 where？
2. 页码越界时，为什么"拉回最后一页"比"返回空"好？
3. offset 分页在什么数据量下必须换方案？
4. 为什么排序字段必须唯一？
```

---

# 第 9 步：最终验收

## A. 后端

- [ ] `buildUserWhere` 被 `countUsers` 和 `listUsers` 共用
- [ ] `clampInt` 处理了 `pageSize`（默认 20，上限 100）
- [ ] 页码越界拉回
- [ ] 返回 `requestedPage` 和 `page` 两个值
- [ ] 返回 `hasPrev` / `hasNext` / `totalPages`
- [ ] `role=admin` 筛选时 `total` 和 `users.length` 一致

## B. 前端

- [ ] 表格下面有分页控件
- [ ] 显示"第 X-Y 条，共 Z 条"
- [ ] 页码有省略号
- [ ] 上一页/下一页在第一页/最后一页时禁用
- [ ] 翻页 URL 有 `page=2`
- [ ] F5 刷新还在第 2 页
- [ ] 后退能回上一页
- [ ] 改筛选会回到第 1 页
- [ ] 加载时分页控件被清空

## C. 认知

- [ ] 我能立刻说出那个经典 bug 是什么
- [ ] 我知道 `pageSize` 为什么必须有上限
- [ ] 我知道 offset 分页什么时候会变慢
- [ ] 我知道排序字段为什么要唯一

## 本节课要能说出口的一句话

> **`COUNT` 和 `SELECT` 的 `WHERE` 必须来自同一个函数。分开写，就一定会在某次改动后不一致。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 总数对但翻页是空 | `COUNT` 没带筛选 | 共用 `buildWhere` |
| `LIMIT "abc"` 报错 | 没 `clampInt` | 加上 |
| 分页控件消失 | 放在 `#table` 里了 | 移到兄弟位置 |
| 一页显示 0 条 | `OFFSET` 算错 | 检查 `(page-1)*pageSize` |
| `?page=999` 显示空 | 没越界修正 | `Math.min` |
| 数据显示重复 | 排序字段不唯一 | 加 `id` 兜底 |
| 改 pageSize 跳到末页 | `page` 没重置 | 传 `page: null` |
| 加载时新旧混杂 | 没清分页容器 | 开头清 `innerHTML` |
| 页码 `1 2 3 ... 999` | 没做省略 | `buildPageList` |
| 全部数据一次返回 | 没传 `pageSize` | 后端必须有默认值 |
