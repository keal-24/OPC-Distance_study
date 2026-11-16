# 第 62 节课：角色权限——从"能不能进"到"能做什么"

> **这份文件是你（学员）一步一步照着做的手册。**
> 前五节课只有两种人：管理员（什么都能做）和普通用户（什么都做不了）。
> 今天加一层：**同样是管理员，也有"能做什么"的区别**。而且**每一条权限都在服务端校验。**

**建议用时**：150 分钟
**你需要先完成**：第 61 节课（编辑删除能用，乐观锁生效）

---

# 第 0 步：为什么"只有两种角色"不够（10 分钟）

## 0.1 一个真实场景

**客户说：**

```text
"我想让运营的同事能看用户列表、能改昵称，但不能删用户，也不能改角色。"
```

**只有 `admin` / `user` 两种角色，你只能：**

```text
方案 A：给他 admin → 他能删你的数据库
方案 B：给他 user  → 他什么都干不了
```

**两个都不行。**

**所以需要"权限"这一层。**

## 0.2 两种模型

**模型一：角色（Role）—— 现在用的**

```text
user   → 能看自己的东西
admin  → 什么都能做
```

**优点：简单。缺点：粒度太粗。**

**模型二：权限（Permission）—— 今天加的**

```text
权限点：user.read, user.update, user.delete, user.role
角色 → 权限集合的映射
```

**优点：粒度细。缺点：复杂。**

**中间方案（这一周用）：**

```text
角色不变（user / admin）
但 admin 的操作再细分：
  user.read     看列表
  user.update   改昵称/状态
  user.delete   删除
  user.role     改角色（最敏感）
```

**然后加第三种角色 `operator`（运营）：**

```text
user      → []
operator  → [user.read, user.update]
admin     → [user.read, user.update, user.delete, user.role]
```

**这样"运营"的诉求就满足了，而且不用改表结构（还是 `role` 字段）。**

## 0.3 关键认知：权限必须在服务端每一条都校验

**这是本节课最重要的一句话。**

**新手做法：**

```javascript
// 前端
if (user.role === "admin") showDeleteButton();

// 后端
app.delete("/api/admin/users/:id", requireAuth, handler);   // ← 只有 requireAuth
```

**攻击者：**

```text
运营同事（operator）打开 F12
发现"删除"按钮被前端藏了
在 Console 里跑：
fetch("/api/admin/users/2", { method: "DELETE", credentials: "same-origin" })
→ 用户被删
```

**这就是"前端隐藏不是权限"。**

**今天每个接口都要挂具体的权限检查。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/permissions.js` | `src/` | 权限点定义 + 角色映射 + `can()` |
| `src/auth.js` | `src/` | 加 `requirePermission(perm)` |
| `src/admin-routes.js` | `src/` | 每个接口挂具体权限 |
| `public/admin.js` | `public/` | 加 `can()` 用于前端显示 |
| `public/admin/users.html` | `public/admin/` | 按权限显示按钮 |

---

# 第 1 步：定义权限（30 分钟）

## 1.1 新建 `src/permissions.js`

**自己敲：**

```javascript
/**
 * 权限点。命名规则：<资源>.<动作>
 * 只有这里列出的权限点才是合法的。
 */
export const PERMISSIONS = {
  USER_READ: "user.read",
  USER_UPDATE: "user.update",
  USER_DELETE: "user.delete",
  USER_ROLE: "user.role",
  USER_RESTORE: "user.restore",

  ITEM_READ: "item.read",
  ITEM_UPDATE: "item.update",
  ITEM_DELETE: "item.delete",

  LOG_READ: "log.read",
};

/**
 * 角色 → 权限集合。
 * 注意：这里是"唯一真相源"。
 * 前端拿到的权限列表也从这里来（通过 /api/me 返回）。
 */
export const ROLE_PERMISSIONS = {
  user: [],

  // 运营：能看、能改基本信息，不能删、不能改角色
  operator: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.ITEM_READ,
    PERMISSIONS.ITEM_UPDATE,
  ],

  admin: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.USER_ROLE,
    PERMISSIONS.USER_RESTORE,
    PERMISSIONS.ITEM_READ,
    PERMISSIONS.ITEM_UPDATE,
    PERMISSIONS.ITEM_DELETE,
    PERMISSIONS.LOG_READ,
  ],
};

/** 所有合法角色 */
export const ROLES = Object.keys(ROLE_PERMISSIONS);

/**
 * 判断某个角色是否拥有某个权限。
 * 注意：未知角色返回 false（安全默认值）。
 */
export const can = (role, permission) => {
  const list = ROLE_PERMISSIONS[role];

  if (!Array.isArray(list)) return false;

  return list.includes(permission);
};

/** 取某个角色的全部权限（给前端用） */
export const permissionsOf = (role) => [...(ROLE_PERMISSIONS[role] || [])];
```

## 1.2 五个关键设计

### 设计一：权限点用常量，不用裸字符串

```javascript
// 好
if (can(role, PERMISSIONS.USER_DELETE)) { ... }

// 坏
if (can(role, "user.delete")) { ... }
```

**为什么：**

```text
打错字 ("user.delet") → 常量报 undefined，立刻发现
                     → 裸字符串静默为 false，权限永远不生效
```

**"权限永远不生效"和"权限永远生效"都是灾难。** 前者用户抱怨"我点不了"，后者是漏洞。

**用常量，打错就报错。**

### 设计二：`user: []` 是空数组，不是 `undefined`

**为什么：**

```javascript
ROLE_PERMISSIONS.user   // []   ✅
ROLE_PERMISSIONS.user   // undefined  ❌
```

**`[].includes(x)` 安全返回 false。**

**`undefined.includes(x)` 会抛 `TypeError`。**

**而且 `can()` 里已经防了（`if (!Array.isArray(list)) return false`），但空数组更清楚。**

### 设计三：`can()` 对未知角色返回 false

```javascript
if (!Array.isArray(list)) return false;
```

**如果数据库里 `role` 是 `"superadmin"`（历史遗留或手工改的）：**

```text
返回 false → 什么都不能做
返回 true  → 全都能做（危险）
```

**安全的默认值是"什么都不允许"（deny by default）。**

**这条原则在所有权限系统里都一样。**

### 设计四：`ROLE_PERMISSIONS` 是"唯一真相源"

**前端需要知道"我有哪些权限"来决定显示哪些按钮。**

**两种做法：**

```text
A. 前端写一份 role → permission 的映射（重复，容易不一致）
B. 后端通过 /api/me 返回 permissions 数组
```

**选 B。前端只判断 `permissions.includes("user.delete")`，不知道角色和权限的映射关系。**

**好处：**

```text
① 改权限只在后端改一处
② 前端不需要知道"operator 有哪些权限"
③ 加新角色时前端不用改
```

### 设计五：`permissionsOf` 返回副本

```javascript
return [...(ROLE_PERMISSIONS[role] || [])];
```

**为什么用展开运算符：**

**如果直接返回 `ROLE_PERMISSIONS[role]`，调用方 `push` 一个新权限，会改到全局配置！**

```javascript
// 危险
const list = permissionsOf("operator");
list.push("user.delete");        // ← 改了全局！
// 现在所有 operator 都能删用户了
```

**展开运算符创建新数组，隔断引用。**

**这个坑很隐蔽，而且后果严重（运行时提权）。**

---

# 第 2 步：写中间件（30 分钟）

## 2.1 在 `src/auth.js` 里加 `requirePermission`

**打开 `src/auth.js`，先加 import：**

```javascript
import { can, permissionsOf } from "./permissions.js";
```

**然后在 `requireRole` 后面加：**

```javascript
/**
 * 权限中间件。必须放在 requireAuth 之后（要 req.user）。
 *
 * 用法：
 *   adminRouter.delete("/users/:id", requirePermission(PERMISSIONS.USER_DELETE), handler)
 */
export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "请先登录", code: "NO_TOKEN" });
  }

  if (!can(req.user.role, permission)) {
    return res.status(403).json({
      error: "你没有执行这个操作的权限",
      code: "NO_PERMISSION",
      required: permission,
      yourRole: req.user.role,
    });
  }

  next();
};
```

## 2.2 改 `requireRole` 支持多个角色（顺便）

**现在的版本：**

```javascript
export const requireRole = (...roles) => (req, res, next) => { ... };
```

**已经是多角色了。但要改进一点：把 `ROLES` 用上，防止打错角色名。**

**现在的检查：**

```javascript
if (!roles.includes(req.user.role)) { 403 }
```

**如果调 `requireRole("admni")`（拼错），所有人都被拒 —— 你会立刻发现。**

**这个方向是安全的（失败即拒绝）。留着。**

## 2.3 改 `/api/me` 返回权限

**找到 `app.get("/api/me", requireAuth, ...)`，改成：**

```javascript
app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    user: req.user,
    permissions: permissionsOf(req.user.role),
  });
});
```

**注意：普通用户的 `permissions` 是空数组 `[]`。**

**前端判断"我能不能做某事"时用这个数组，不用判断角色。**

## 2.4 三个关键点

### 关键点一：`required` 和 `yourRole` 一起返回

```javascript
res.status(403).json({
  error: "你没有执行这个操作的权限",
  code: "NO_PERMISSION",
  required: permission,
  yourRole: req.user.role,
});
```

**为什么：**

**排错时你需要知道"缺哪个权限"。**

```text
客户说"我点不了删除"
→ 看日志：required: "user.delete", yourRole: "operator"
→ 立刻知道"运营角色没有删除权限，这是设计如此"
```

**不返回这两个字段，你只能猜。**

**而 `yourRole` 确实返回了，所以只有这两个字段。**

**为什么 `permissions` 不返回：**

**`permissionsOf` 有 9 项，每次 403 都返回一大坨，日志会很脏。**

**要查完整的权限列表，去 `/api/me`。**

**日志只给"最小诊断信息"。**

### 关键点二：`code: "NO_PERMISSION"` 和 `code: "FORBIDDEN"` 区分

**`requireRole` 失败时返回 `code: "FORBIDDEN"`。**
**`requirePermission` 失败时返回 `code: "NO_PERMISSION"`。**

**前端可以据此区分：**

```javascript
if (data.code === "FORBIDDEN") → "你不是管理员，请联系管理员"
if (data.code === "NO_PERMISSION") → "你的角色没有这个权限，请联系管理员开通"
```

**两种提示不同，因为原因不同。**

### 关键点三：中间件顺序

**必须是：**

```javascript
adminRouter.use(requireAuth);         // 1. 谁在操作
adminRouter.use(requireRole(ROLES));  // 2. 是不是后台用户
adminRouter.delete("/users/:id", requirePermission(PERMISSIONS.USER_DELETE), handler);  // 3. 具体权限
```

**`requirePermission` 必须在 `requireAuth` 之后，因为它读 `req.user`。**

**如果顺序反了：**

```javascript
adminRouter.delete("/users/:id", requirePermission(...), requireAuth, handler);
// requirePermission 里 req.user 是 undefined → 永远 401
```

**症状：所有人都 401，包括管理员。**

**这个错很容易犯，因为"权限检查看起来应该在最前面"。**

---

# 第 3 步：把权限挂到每个接口（35 分钟）

## 3.1 改造 `admin-routes.js`

**现在的接口是"全都只要 admin"。现在要细分。**

**先看清目标：**

| 接口 | 需要的权限 |
|---|---|
| `GET /overview` | 无（只要能进后台） |
| `GET /ping` | 无 |
| `GET /users` | `user.read` |
| `GET /users/:id` | `user.read` |
| `PATCH /users/:id` | **分两段**（见下） |
| `DELETE /users/:id` | `user.delete` |
| `POST /users/:id/restore` | `user.restore` |
| `GET /logs` | `log.read` |

**注意 `PATCH` 这一条要特殊处理：**

```text
改昵称/状态  → user.update
改角色      → user.role（更敏感）
```

**所以一个接口要"看请求内容决定要什么权限"。**

## 3.2 完整改写

**打开 `src/admin-routes.js`，整个替换：**

```javascript
import express from "express";
import { requireAuth, requirePermission } from "./auth.js";
import { PERMISSIONS, can } from "./permissions.js";
import {
  getOverview,
  listUsers,
  getUserById,
  updateUser,
  softDeleteUser,
  restoreUser,
} from "./admin.js";

export const adminRouter = express.Router();

// ============ 第 1 层：登录 ============
adminRouter.use(requireAuth);

// ============ 第 2 层：必须是后台用户 ============
// operator 和 admin 都能进后台；user 不行
adminRouter.use((req, res, next) => {
  const backendRoles = ["admin", "operator"];

  if (!backendRoles.includes(req.user.role)) {
    return res.status(403).json({
      error: "你没有访问后台的权限",
      code: "FORBIDDEN",
      yourRole: req.user.role,
    });
  }

  next();
});

// ============ 接口 ============

adminRouter.get("/ping", (req, res) => {
  res.json({
    ok: true,
    operator: { id: req.user.id, email: req.user.email, role: req.user.role },
    serverTime: new Date().toISOString(),
  });
});

adminRouter.get("/overview", (req, res) => {
  res.json(getOverview());
});

adminRouter.get("/users", requirePermission(PERMISSIONS.USER_READ), (req, res) => {
  const { q, role, status, page, pageSize, deleted } = req.query;

  res.json(
    listUsers({
      q: typeof q === "string" ? q : "",
      role: typeof role === "string" ? role : "",
      status: typeof status === "string" ? status : "",
      page: typeof page === "string" ? page : "1",
      pageSize: typeof pageSize === "string" ? pageSize : "20",
      includeDeleted: deleted === "1",
    })
  );
});

adminRouter.get("/users/:id", requirePermission(PERMISSIONS.USER_READ), (req, res) => {
  const user = getUserById(req.params.id);

  if (!user) return res.status(404).json({ error: "用户不存在" });

  res.json({ user });
});

/**
 * PATCH 比较特殊：改角色需要额外权限。
 * 所以不能简单挂一个 requirePermission。
 */
adminRouter.patch("/users/:id", (req, res, next) => {
  const { role } = req.body ?? {};

  // 基础权限：能改基本信息
  if (!can(req.user.role, PERMISSIONS.USER_UPDATE)) {
    return res.status(403).json({
      error: "你没有修改用户的权限",
      code: "NO_PERMISSION",
      required: PERMISSIONS.USER_UPDATE,
      yourRole: req.user.role,
    });
  }

  // 如果要改角色，还需要额外权限
  if (role !== undefined && !can(req.user.role, PERMISSIONS.USER_ROLE)) {
    return res.status(403).json({
      error: "你没有修改用户角色的权限",
      code: "NO_PERMISSION",
      required: PERMISSIONS.USER_ROLE,
      yourRole: req.user.role,
    });
  }

  next();
}, (req, res) => {
  const { nickname, role, status, updatedAt } = req.body ?? {};

  if (nickname !== undefined && typeof nickname !== "string") {
    return res.status(400).json({ error: "昵称必须是字符串" });
  }

  if (role !== undefined && typeof role !== "string") {
    return res.status(400).json({ error: "角色必须是字符串" });
  }

  if (status !== undefined && typeof status !== "string") {
    return res.status(400).json({ error: "状态必须是字符串" });
  }

  const result = updateUser(req.params.id, {
    nickname,
    role,
    status,
    expectedUpdatedAt: typeof updatedAt === "string" ? updatedAt : null,
  });

  if (!result.ok) {
    const messages = {
      NOT_FOUND: ["用户不存在", 404],
      CONFLICT: ["这条数据已被他人修改，请刷新后重试", 409],
      LAST_ADMIN: ["不能降级最后一个管理员", 409],
    };

    const [message, code] = messages[result.reason] || ["更新失败", 400];

    return res.status(code).json({
      error: message,
      reason: result.reason,
      current: result.current || null,
    });
  }

  res.json({ message: "已保存", user: result.user });
});

adminRouter.delete(
  "/users/:id",
  requirePermission(PERMISSIONS.USER_DELETE),
  (req, res) => {
    const result = softDeleteUser(req.params.id);

    if (!result.ok) {
      const messages = {
        NOT_FOUND: ["用户不存在", 404],
        LAST_ADMIN: ["不能删除最后一个管理员", 409],
      };

      const [message, code] = messages[result.reason] || ["删除失败", 400];
      return res.status(code).json({ error: message, reason: result.reason });
    }

    res.json({ message: "已删除，可在「包含已删除」中恢复" });
  }
);

adminRouter.post(
  "/users/:id/restore",
  requirePermission(PERMISSIONS.USER_RESTORE),
  (req, res) => {
    const result = restoreUser(req.params.id);

    if (!result.ok) {
      const messages = {
        NOT_FOUND: ["用户不存在", 404],
        NOT_DELETED: ["这个用户没有被删除", 400],
        EMAIL_TAKEN: [`邮箱 ${result.email} 已被其他账号占用，无法恢复`, 409],
      };

      const [message, code] = messages[result.reason] || ["恢复失败", 400];
      return res.status(code).json({ error: message, reason: result.reason });
    }

    res.json({ message: "已恢复", user: result.user });
  }
);
```

## 3.3 四个关键点

### 关键点一：`can` 从 `permissions.js` import，不从 `auth.js`

**`can` 定义在 `permissions.js`，不在 `auth.js`。**

**所以正确的 import 是：**

```javascript
import { requireAuth, requirePermission } from "./auth.js";
import { PERMISSIONS, can } from "./permissions.js";
```

**这是本节最容易犯的错（import 来源写错）。**

**`auth.js` 里也 import 了 `can`，但它不是 re-export，所以外面不能从 `auth.js` 拿。**

**如果报 `The requested module './auth.js' does not provide an export named 'can'`，就是这个问题。**

**如果你真想从 `auth.js` 统一导出，要在 `auth.js` 里加：**

```javascript
export { can } from "./permissions.js";
```

**这一周不用，直接从 `permissions.js` import 更清楚。**

### 关键点二：后台入口用"内联中间件"而不是 `requireRole`

```javascript
adminRouter.use((req, res, next) => {
  const backendRoles = ["admin", "operator"];
  if (!backendRoles.includes(req.user.role)) { 403 }
  next();
});
```

**为什么不用 `requireRole("admin", "operator")`：**

**可以用，效果一样。**

**但内联写法能写更清楚的错误码（`code: "FORBIDDEN"` 表示"进不了后台"，区别于"能进但没这个权限"）。**

**两种都行。这里选内联，因为错误信息更具体。**

### 关键点三：PATCH 的两段检查写在同一层

```javascript
adminRouter.patch("/users/:id", (req, res, next) => {
  // 检查 1：基础权限
  // 检查 2：改角色时的额外权限
  next();
}, (req, res) => {
  // 真正的处理
});
```

**为什么不拆成两个 `requirePermission`：**

**第二个检查依赖 `req.body.role`，不能用静态的 `requirePermission(PERMISSIONS.USER_ROLE)`。**

**因为"改昵称"的请求不带 `role`，不该要求 `user.role` 权限。**

**所以必须"看请求内容决定"。**

**这类检查叫"条件权限"，必须写在中间件里手写。**

### 关键点四：错误信息要说清"缺哪个权限"

**三个 403 分支，每个都有 `required` 字段。**

**排查时一眼能看出问题：**

```text
operator 尝试删用户
→ required: "user.delete", yourRole: "operator"
→ 立刻明白"运营没有删除权限"
```

**这是设计如此，不是 bug。**

---

# 第 4 步：前端按权限显示（35 分钟）

## 4.1 在 `public/admin.js` 里加权限工具

**打开 `public/admin.js`，在 `guard()` 后面加：**

```javascript
// ============ 10. 权限 ============

/**
 * 当前用户的权限列表。guard() 会填充。
 */
let currentPermissions = [];

export const setPermissions = (list) => {
  currentPermissions = Array.isArray(list) ? list : [];
};

export const hasPermission = (permission) => currentPermissions.includes(permission);
```

## 4.2 改 `guard()` 让它同时拿权限

**现在的 `guard()`：**

```javascript
const result = await api("/api/me");
// ...
const user = result.data.user;
```

**改成：**

```javascript
export const guard = async () => {
  const result = await api("/api/me");

  if (!result.ok || !result.data?.user) {
    if (result.status !== 401) {
      window.location.href = "/login.html?next=/admin/index.html";
    }
    return null;
  }

  const user = result.data.user;

  // 关键：把权限也存下来
  setPermissions(result.data.permissions || []);

  const backendRoles = ["admin", "operator"];

  if (!backendRoles.includes(user.role)) {
    document.body.innerHTML = `...`;
    return null;
  }

  return user;
};
```

**注意 `setPermissions` 必须在 `return user` 之前调。**

## 4.3 在页面上按权限显示按钮

**改 `users.html` 的 `COLUMNS` 里"操作"那一列：**

```javascript
      {
        key: "actions",
        title: "操作",
        width: "150px",
        align: "right",
        render: (row) => {
          const parts = [];

          if (hasPermission("user.update")) {
            parts.push(`<button class="small" data-action="edit" data-id="${row.id}">编辑</button>`);
          }

          if (hasPermission("user.delete") && row.status !== "deleted") {
            parts.push(
              `<button class="small danger" data-action="delete" data-id="${row.id}" data-email="${esc(row.email)}">删除</button>`
            );
          }

          if (hasPermission("user.restore") && row.status === "deleted") {
            parts.push(
              `<button class="small" data-action="restore" data-id="${row.id}">恢复</button>`
            );
          }

          return parts.length > 0
            ? parts.join(" ")
            : '<span style="color:#c4c8cf;font-size:12px">无可用操作</span>';
        },
      },
```

**同时 import 要加 `hasPermission`：**

```javascript
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
      renderPager,
      showAlert,
      hasPermission,
    } from "/admin.js";
```

## 4.4 编辑弹窗里"角色"下拉也要控

**如果用户没有 `user.role` 权限，角色下拉应该禁用。**

**在 `openEdit` 里加：**

```javascript
      // 没有改角色的权限 → 禁用这个字段
      const canChangeRole = hasPermission("user.role");
      editRole.disabled = !canChangeRole;
      document.getElementById("field-role").title = canChangeRole
        ? ""
        : "你的角色不能修改用户角色";
```

**为什么要禁用而不是隐藏：**

**隐藏的话，用户不知道"这里有个角色字段"。**

**禁用 + 提示，用户知道"这个字段存在，但我不能改"。**

**这是"可发现性"和"权限透明"的平衡。**

## 4.5 恢复按钮的逻辑

**在事件委托里加：**

```javascript
      tableEl.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const { action, id, email } = btn.dataset;

        if (action === "edit") openEdit(id);
        if (action === "delete") openDelete(id, email);

        if (action === "restore") {
          btn.disabled = true;
          const result = await api(`/api/admin/users/${id}/restore`, { method: "POST" });

          if (!result.ok) {
            showAlert(document.getElementById("alert"), result.data?.error || "恢复失败", "error");
            btn.disabled = false;
            return;
          }

          await load();
          showAlert(document.getElementById("alert"), "已恢复", "ok");
        }
      });
```

## 4.6 关键点

### 关键点一：`hasPermission` 判断的是权限，不是角色

```javascript
// 好
if (hasPermission("user.delete")) { ... }

// 坏
if (currentUser.role === "admin") { ... }
```

**为什么：**

**如果以后加一个 `superadmin` 角色，或者给 `operator` 开了删除权限：**

```text
判断角色 → 前端要改（漏改就显示错按钮）
判断权限 → 不用改（后端配置变了，前端自动跟上）
```

**这是"权限驱动 UI"的核心。**

### 关键点二：`row.status !== "deleted"` 和权限是两个独立条件

```javascript
if (hasPermission("user.delete") && row.status !== "deleted") { 显示删除 }
if (hasPermission("user.restore") && row.status === "deleted") { 显示恢复 }
```

**"有权限"和"这个状态下能做这个操作"是两件事。**

**两个都要判断。**

**如果只判断权限，已删除的行也会显示"删除"按钮 —— 点了会怎样？**

**`softDeleteUser` 里查 `WHERE deleted_at IS NULL`，找不到，返回 404。**

**用户看到"用户不存在"，很困惑。**

**所以状态判断必须在前端也做（后端也做，双保险）。**

### 关键点三：`disabled` 的按钮不会触发 `click`

**`btn.disabled = true` 之后，点击不会触发事件。**

**所以"防重复点击"可以直接用 `disabled`。**

**但注意：如果是 `<a>` 标签，`disabled` 无效，要用 `pointer-events: none`。**

**这里用的是 `<button>`，`disabled` 有效。**

---

# 第 5 步：关键验证（20 分钟）

## 5.1 造一个 operator 账号

**先把 Bob 改成 operator：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { const r = m.db.prepare('UPDATE users SET role=? WHERE email=?').run('operator','bob@example.com'); console.log('改了', r.changes, '行'); })"
```

**注意：Bob 需要重新登录才能拿到新权限。**

**为什么：**

**`/api/me` 返回的 `permissions` 是"登录时按当时 role 算的"吗？**

**不是。`/api/me` 每次调都重新算：**

```javascript
res.json({ user: req.user, permissions: permissionsOf(req.user.role) });
```

**`req.user` 来自数据库（第 52 节的设计），所以 `role` 是最新的。**

**所以不用重新登录。刷新页面就行。**

**但浏览器的 `hasPermission` 缓存是 `guard()` 时设置的 —— 刷新页面会重新 `guard()`，所以也是最新的。**

**验证方法：Bob 登录后刷新后台页面，能看到"编辑"但没有"删除"。**

## 5.2 五个必须做的测试

**用 curl（或浏览器 F12 的 Console）：**

**1. operator 读列表（应该有权限）：**

```text
curl.exe "http://localhost:4030/api/admin/users" -H "Cookie: auth_token=BOB"
```

**应该 200。**

**2. operator 改昵称（应该有权限）：**

```text
curl.exe -X PATCH "http://localhost:4030/api/admin/users/2" -H "Cookie: auth_token=BOB" -H "Content-Type: application/json" -d "{\"nickname\":\"运营改的\"}"
```

**应该 200。**

**3. operator 改角色（应该被拒）：**

```text
curl.exe -X PATCH "http://localhost:4030/api/admin/users/2" -H "Cookie: auth_token=BOB" -H "Content-Type: application/json" -d "{\"role\":\"admin\"}"
```

**应该 403，`required: "user.role"`。**

**4. operator 删用户（应该被拒）：**

```text
curl.exe -X DELETE "http://localhost:4030/api/admin/users/2" -H "Cookie: auth_token=BOB"
```

**应该 403，`required: "user.delete"`。**

**5. 普通 user 进后台（应该被拒）：**

**用一个 `role: "user"` 的账号（新建一个，或者把某个改成 user）。**

```text
curl.exe "http://localhost:4030/api/admin/users" -H "Cookie: auth_token=USER的token"
```

**应该 403，`code: "FORBIDDEN"`（不是 `NO_PERMISSION`）。**

**这五个测试做完，权限系统就是可靠的。**

**第 3、4 两个是最重要的 —— 它们证明"运营不能越权"。**

---

# 第 6 步：五个必须知道的坑（20 分钟）

## 坑 1：只在前端控，后端没挂 `requirePermission`

**这是本节的核心漏洞。**

**验证方法（现在就做）：**

**把 `admin-routes.js` 里 `DELETE /users/:id` 的 `requirePermission(...)` 删掉，重启，用 operator 的 token 删用户。**

**应该返回 200（删成功了）。**

**这就是"前端藏了按钮但接口裸奔"。**

**前端藏按钮只是"体验"，后端权限才是"安全"。**

**加回来。**

## 坑 2：`requirePermission` 放在 `requireAuth` 之前

```javascript
// 错
adminRouter.delete("/users/:id", requirePermission(PERMISSIONS.USER_DELETE), handler);
// 这里的 req.user 是 undefined → 永远 401
```

**注意：`adminRouter.use(requireAuth)` 是路由级中间件，会在所有接口前执行。**

**所以只要 `adminRouter.use(requireAuth)` 在上面，单独接口挂 `requirePermission` 就没问题。**

**但如果你忘了 `adminRouter.use(requireAuth)`：**

**结果：所有人 401，包括管理员。**

**排查方法：**

```text
Alice 调 DELETE → 401
→ 检查 adminRouter.use(requireAuth) 在不在
```

## 坑 3：`permissionsOf` 返回的不是副本

```javascript
// 错
export const permissionsOf = (role) => ROLE_PERMISSIONS[role] || [];

// 对
export const permissionsOf = (role) => [...(ROLE_PERMISSIONS[role] || [])];
```

**不复制会怎样：**

```javascript
const list = permissionsOf("operator");
list.push("user.delete");   // 改了全局配置
// 现在 operator 都有删除权限了
```

**这个坑在真实项目里造成过运行时提权。**

**验证方法：**

```javascript
import { permissionsOf } from "./permissions.js";

const a = permissionsOf("operator");
a.push("user.delete");
console.log(permissionsOf("operator").includes("user.delete"));   // 应该是 false
```

**如果不复制，会是 `true`。**

## 坑 4：`can()` 用了 `||` 而不是 `Array.isArray` 判断

```javascript
// 错
export const can = (role, permission) => (ROLE_PERMISSIONS[role] || []).includes(permission);
```

**这个"错"其实能工作（`|| []` 处理了 undefined）。**

**但它掩盖了"角色不存在"这件事。**

**如果 `role` 是 `"operatorr"`（拼错），`|| []` 返回 `[]`，`includes` 返回 false —— 安全，但你不知道哪里错了。**

**用 `Array.isArray` 判断，可以加一条警告日志：**

```javascript
export const can = (role, permission) => {
  const list = ROLE_PERMISSIONS[role];

  if (!Array.isArray(list)) {
    console.warn("[permissions] 未知角色：", role);
    return false;
  }

  return list.includes(permission);
};
```

**多一行日志，能提前发现"数据里有脏角色"。**

## 坑 5：`PATCH` 的两段检查漏了一段

**如果你只检查了 `USER_UPDATE` 没检查 `USER_ROLE`：**

**operator 能把自己的角色改成 admin。**

```text
① operator 打开自己的编辑页
② 角色下拉框是禁用的（前端）
③ F12 或 curl 直接发 PATCH {role: "admin"}
④ 如果后端只检查 USER_UPDATE → 成功
⑤ operator 变成 admin，拿到所有权限
```

**这叫"垂直提权"（privilege escalation），是最严重的一类漏洞。**

**验证方法（必须做）：**

```text
curl -X PATCH /api/admin/users/2 -H "Bob的Cookie" -d '{"role":"admin"}'
```

**必须 403。**

---

# 第 7 步：故意做五个实验（20 分钟）

## 实验 1：operator 提权

**见坑 5。用 Bob 的 token 调 PATCH 改角色。**

**应该 403。**

**然后把 `USER_ROLE` 的检查注释掉，再试一次。**

**这次应该成功 —— Bob 变成 admin。**

**把 Bob 改回 operator：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => m.db.prepare('UPDATE users SET role=? WHERE email=?').run('operator','bob@example.com'))"
```

**恢复检查。**

## 实验 2：`permissionsOf` 不复制

**见坑 3。**

**把 `[...]` 去掉，跑验证代码，看是不是改到了全局。**

**改回来。**

## 实验 3：前端按钮不按权限显示

**把"操作"列改回"总是显示编辑和删除"。**

**用 Bob（operator）登录后台。**

**看到"删除"按钮了。**

**点它 → 应该 403，显示"你没有执行这个操作的权限"。**

**这说明：**

```text
① 前端显示错误（按钮不该出现）
② 但后端拦住了（安全）
```

**后端拦住最重要。前端显示错了只是体验问题。**

**改回来（按权限显示）。**

## 实验 4：给 operator 加删除权限

**在 `permissions.js` 里给 `operator` 加 `PERMISSIONS.USER_DELETE`。**

**重启，用 Bob 刷新页面。**

**"删除"按钮出现了。**

**这说明：**

```text
① 改一处配置，前端和后端都跟着变
② 前端不用改代码
```

**这就是"权限驱动"的价值。**

**改回来。**

## 实验 5：未知角色

**把 Bob 的 role 改成 `"operatorr"`（拼错）。**

**再用 Bob 的 token 调接口。**

**应该：**

```text
后台入口检查失败 → 403 FORBIDDEN
控制台有警告："未知角色：operatorr"
```

**这就是坑 4 的日志。**

**改回来。**

---

# 第 8 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 三个角色各自的权限表
2. 五个 curl 测试的结果
3. PATCH 的两段检查（为什么必须两段）
4. 「卡在哪」

---

# 第 9 步：课后练习

## 练习一：加第四种角色 `viewer`

**要求：** 只能看，不能改。

```javascript
viewer: [PERMISSIONS.USER_READ, PERMISSIONS.ITEM_READ, PERMISSIONS.LOG_READ],
```

**验证：能看到"编辑"按钮吗？**

**应该看不到（因为没有 `user.update`）。**

**而且表格的"操作"列应该显示"无可用操作"。**

## 练习二（选做）：为什么 `item.*` 三个权限点现在就写好了

**打开 `permissions.js`，你会发现 `ITEM_READ` / `ITEM_UPDATE` / `ITEM_DELETE` 已经在里面了。**

**但这一周你只做了用户管理，`items.html` 根本没建。**

**这不是我写错 —— 这是故意的，原因是"权限点要一次定义完整，页面可以后面加"。**

**为什么：**

**权限点一旦上线，就会被写进：**

```text
① 数据库里的角色配置（如果有自定义角色）
② 前端缓存的 /api/me 返回值
③ 别的服务调用的接口
```

**上线之后再改名字（比如 `item.update` 改成 `content.update`），要清理三处。**

**所以先定义，先不用 —— 成本是零。**

**反过来，"用到的时候再补权限点"看起来省事，实际上一补就要改前端、改文档、改测试。**

**你可以验证这一点：把 `ITEM_*` 三个删掉，看有没有任何东西报错。**

**答案是没有。因为没有任何代码引用它们。**

**这就是"预留"和"死代码"的区别 —— 预留是有明确计划的占位，死代码是忘了删的垃圾。**

## 练习三：给权限检查加日志

**要求：** 每次 403 都记一行日志：

```text
[permission] DENY uid=2 role=operator required=user.delete path=DELETE /api/admin/users/2
```

**用途：**

```text
① 客户投诉"我点不了删除" → 查日志立刻知道缺什么
② 有人在尝试越权 → 日志里能看到
```

**写到 `results/permission.log`（用 `fs.appendFileSync`）。**

**这就是第 63 节审计日志的雏形。**

## 练习四：想清楚这四个问题

```text
1. 为什么"前端隐藏按钮"完全不算权限控制？
2. 为什么 `permissionsOf` 要返回副本？
3. `PATCH` 为什么必须两段检查？
4. "未知角色返回 false"为什么是安全默认值？
```

---

# 第 10 步：最终验收

## A. 后端

- [ ] `permissions.js` 有 `PERMISSIONS` / `ROLE_PERMISSIONS` / `can` / `permissionsOf`
- [ ] 三种角色（user / operator / admin）
- [ ] `requirePermission` 在 `auth.js` 里
- [ ] `/api/me` 返回 `permissions`
- [ ] 每个接口挂对应权限
- [ ] `PATCH` 两段检查（`USER_UPDATE` + 条件 `USER_ROLE`）

## B. 前端

- [ ] `hasPermission()` 能用
- [ ] 编辑/删除/恢复按钮按权限显示
- [ ] 角色下拉按权限禁用
- [ ] 无可用操作时显示提示

## C. 验证

- [ ] operator 能读列表（200）
- [ ] operator 能改昵称（200）
- [ ] operator 改角色被拒（403 `user.role`）
- [ ] operator 删用户被拒（403 `user.delete`）
- [ ] 普通 user 进后台被拒（403 `FORBIDDEN`）
- [ ] 我做过 `permissionsOf` 不复制的实验
- [ ] 我做过 operator 提权实验

## D. 认知

- [ ] 我能说清角色和权限的区别
- [ ] 我知道为什么前端判断权限而不是角色
- [ ] 我知道"垂直提权"是什么
- [ ] 我知道"deny by default"为什么重要

## 本节课要能说出口的一句话

> **前端隐藏按钮是体验，后端每个接口的权限检查才是安全。中间少任何一个，运营同事都能删你的库。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 管理员也 401 | `requireAuth` 顺序错 | 检查 `adminRouter.use` |
| operator 能删用户 | 没挂 `requirePermission` | 逐个检查 |
| operator 能改角色 | PATCH 第二段漏了 | 加 `USER_ROLE` 检查 |
| 按钮该隐藏没隐藏 | 用 role 判断而不是权限 | 改 `hasPermission` |
| 改了权限前端没变 | 页面没刷新 | 刷新（`guard` 会重拿） |
| `未知角色` 警告刷屏 | 数据里有脏角色 | 查数据库 `role` 字段 |
| 提权实验没复现 | 后端检查到位 | 这是好消息 |
| `required` 字段没返回 | 403 分支漏了 | 加上，排错要用 |
