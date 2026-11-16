# 第 63 节课：操作记录——客户问"谁改的"，你不能说不知道

> **这份文件是你（学员）一步一步照着做的手册。**
> 前六节课你有了一个能干活的仓库后台。今天补上最后一块：**审计日志。**
> 没有它，客户投诉"我的商品被人改了"时，你只能说"不知道"。

**建议用时**：160 分钟
**你需要先完成**：第 62 节课（权限能用，operator 越权被拒）

---

# 第 0 步：审计日志到底记什么（10 分钟）

## 0.1 三个真实问题

**客户会问的三个问题：**

```text
① "这个用户是谁删的？"           → 需要 who + what
② "我的商品价格怎么变成 99 了？"  → 需要 when + before/after
③ "昨天下午三点谁在后台操作？"    → 需要 when + 列表
```

**日志要能回答这三个，缺一不可。**

## 0.2 一条日志最少要有七个字段

| 字段 | 例子 | 为什么 |
|---|---|---|
| `actor_id` | 1 | 谁 |
| `actor_email` | alice@example.com | 冗余存一份（用户可能被删） |
| `action` | `user.delete` | 干了什么 |
| `target_type` | `user` | 对什么类型的对象 |
| `target_id` | 2 | 具体哪个对象 |
| `before` | `{"nickname":"Bob"}` | 改之前 |
| `after` | `{"nickname":"Bob 2"}` | 改之后 |
| `created_at` | 2026-11-16T... | 什么时候 |
| `ip` | 127.0.0.1 | 从哪来 |

**注意 `actor_email` 是冗余的。**

**为什么冗余：**

```text
如果 actor 后来被删了，actor_id 就查不到人了
但还是要知道"当时是 alice@example.com 操作的"
```

**审计日志的第一原则：不依赖其他表。**

**它必须是"自包含"的 —— 即使 `users` 表空了，日志还能读懂。**

**这叫"反规范化"（denormalization），在审计场景里是必须的。**

## 0.3 什么该记，什么不该记

**该记：**

```text
✅ 登录、登出（尤其失败）
✅ 创建、修改、删除任何业务数据
✅ 权限变更（角色改了）
✅ 导出数据
✅ 敏感操作（重置密码、改邮箱）
```

**不该记：**

```text
❌ 每一次 GET 请求（日志会爆炸，一天几十万条）
❌ 密码明文（永远不要）
❌ 完整的请求体（可能含密码）
```

**折中：**

```text
GET 不记日志（要看访问量用 Nginx access log）
写操作记日志
```

## 0.4 今天的关键设计：记"差异"，不记"全部"

**错误做法：**

```javascript
audit.log({ before: 整个用户对象, after: 整个用户对象 });
```

**问题：**

```text
① 存了很多没变的字段，日志表膨胀
② 看不出"到底改了什么"
③ 用户对象里可能有敏感字段
```

**正确做法：只记变化的字段。**

```json
{
  "before": { "nickname": "Bob", "role": "user" },
  "after": { "nickname": "Bob 2", "role": "user" }
}
```

**更好：只记变了的。**

```json
{ "changes": { "nickname": ["Bob", "Bob 2"] } }
```

**今天用第二种格式：`changes` 对象，key 是字段名，value 是 `[旧值, 新值]`。**

**它一眼能看出"昵称从 Bob 改成 Bob 2"，而且体积小。**

## 0.5 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/db.js` | `src/` | 迁移 010：`audit_logs` 表 |
| `src/audit.js` | `src/` | 写日志 + diff + 查询 |
| `src/admin-routes.js` | `src/` | 每个写接口调 `audit` |
| `public/admin/logs.html` | `public/admin/` | 日志页 |
| `results/e07.md` | `results/` | 本周总结 |

---

# 第 1 步：建表（20 分钟）

## 1.1 在 `db.js` 加迁移

```javascript
{
  version: "010_create_audit_logs",
  sql: `
    CREATE TABLE audit_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id     INTEGER,
      actor_email  TEXT    NOT NULL,
      actor_role   TEXT    NOT NULL,
      action       TEXT    NOT NULL,
      target_type  TEXT    NOT NULL,
      target_id    TEXT,
      changes      TEXT,
      note         TEXT,
      ip           TEXT,
      user_agent   TEXT,
      ok           INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    NOT NULL
    );

    CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
    CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id);
    CREATE INDEX idx_audit_action ON audit_logs(action);
  `,
}
```

## 1.2 每个字段的设计

| 字段 | 类型 | 说明 |
|---|---|---|
| `actor_id` | INTEGER（可空） | 操作人 id。**可空**是因为系统操作（定时任务）没有操作人 |
| `actor_email` | TEXT NOT NULL | 冗余存一份 |
| `actor_role` | TEXT NOT NULL | 当时的角色（事后角色变了也能查到"当时是什么身份"） |
| `action` | TEXT NOT NULL | 如 `user.delete` |
| `target_type` | TEXT NOT NULL | `user` / `item` / `system` |
| `target_id` | TEXT | 为什么是 TEXT 不是 INTEGER：有些对象 id 是 uuid |
| `changes` | TEXT | JSON 字符串（SQLite 没有 JSON 类型，当文本存） |
| `note` | TEXT | 人写的备注（"用户投诉后清理"） |
| `ip` | TEXT | 来源 IP |
| `ok` | INTEGER | 1 = 成功，0 = 失败（失败也要记） |
| `created_at` | TEXT | ISO 时间 |

**注意 `ok` 字段：失败也要记。**

**为什么：**

```text
"谁试图删这个用户但被拒了"  → 可能是攻击
"谁登录失败了 100 次"       → 撞库
```

**只记成功的日志，等于只记了事情的一半。**

## 1.3 四个索引

```sql
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
```

**为什么每个都要：**

```text
按时间倒序查（日志页默认视图）        → created_at
"这个人都干了什么"                    → actor_id
"这个用户被谁改过"                    → target_type + target_id
"所有删除操作"                        → action
```

**日志表的查询模式很固定：永远是"按某个维度筛 + 按时间倒序"。**

**索引正是为这四种查询建的。**

**注意 `created_at DESC` 的索引：**

**SQLite 支持索引的排序方向。`DESC` 让"按时间倒序"这个最常用的查询直接命中索引，不用额外排序。**

---

# 第 2 步：写审计模块（40 分钟）

## 2.1 新建 `src/audit.js`

**自己敲：**

```javascript
import { db } from "./db.js";

/**
 * 计算两个对象之间的差异。
 * 只返回变化的字段，格式 { 字段: [旧值, 新值] }
 */
export const diff = (before, after) => {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  keys.forEach((key) => {
    const oldValue = before?.[key];
    const newValue = after?.[key];

    // 用 JSON 比较（处理数组/对象）
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = [oldValue ?? null, newValue ?? null];
    }
  });

  return changes;
};

/**
 * 写一条审计日志。
 *
 * 注意：这个函数永远不抛异常。
 * 日志写失败不能影响主业务 —— 和第 44 节的 record() 是同一个原则。
 */
export const log = (entry) => {
  try {
    const changes =
      entry.changes && Object.keys(entry.changes).length > 0 ? JSON.stringify(entry.changes) : null;

    db.prepare(
      `INSERT INTO audit_logs
       (actor_id, actor_email, actor_role, action, target_type, target_id,
        changes, note, ip, user_agent, ok, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.actorId ?? null,
      entry.actorEmail || "system",
      entry.actorRole || "system",
      entry.action,
      entry.targetType || "system",
      entry.targetId === undefined || entry.targetId === null ? null : String(entry.targetId),
      changes,
      entry.note || null,
      entry.ip || null,
      entry.userAgent ? String(entry.userAgent).slice(0, 200) : null,
      entry.ok === false ? 0 : 1,
      new Date().toISOString()
    );
  } catch (error) {
    console.error("[audit] 写日志失败：", error.message);
  }
};

/**
 * 从 req 里提取"操作人"信息。
 * 让调用点少写几个字段。
 */
export const actorFrom = (req) => ({
  actorId: req.user?.id ?? null,
  actorEmail: req.user?.email ?? "anonymous",
  actorRole: req.user?.role ?? "anonymous",
  ip: req.ip || null,
  userAgent: req.get?.("user-agent") || null,
});

/**
 * 查日志（带筛选和分页）。
 */
export const listLogs = ({ action = "", targetType = "", actorId = "", q = "", page = 1, pageSize = 20 } = {}) => {
  const conditions = [];
  const params = [];

  if (action && /^[a-z_]+\.[a-z_]+$/.test(action)) {
    conditions.push("action = ?");
    params.push(action);
  }

  if (targetType && ["user", "item", "system"].includes(targetType)) {
    conditions.push("target_type = ?");
    params.push(targetType);
  }

  const actor = Number(actorId);

  if (Number.isInteger(actor) && actor > 0) {
    conditions.push("actor_id = ?");
    params.push(actor);
  }

  const keyword = String(q).trim().slice(0, 100);

  if (keyword) {
    const escaped = keyword.replace(/[\\%_]/g, (char) => `\\${char}`);
    conditions.push("(actor_email LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')");
    params.push(`%${escaped}%`, `%${escaped}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const pageSizeSafe = Math.min(100, Math.max(1, Math.trunc(Number(pageSize) || 20)));
  const pageSafe = Math.max(1, Math.trunc(Number(page) || 1));

  const total = Number(
    db.prepare(`SELECT COUNT(*) AS total FROM audit_logs ${where}`).get(...params).total
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSizeSafe));
  const safePage = Math.min(pageSafe, totalPages);
  const offset = (safePage - 1) * pageSizeSafe;

  const rows = db
    .prepare(
      `SELECT * FROM audit_logs
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSizeSafe, offset);

  return {
    logs: rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      changes: row.changes ? safeParse(row.changes) : null,
      note: row.note,
      ip: row.ip,
      ok: row.ok === 1,
      createdAt: row.created_at,
    })),
    total,
    page: safePage,
    pageSize: pageSizeSafe,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
};

const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: String(text).slice(0, 200) };
  }
};
```

## 2.2 六个关键设计

### 设计一：`diff` 用 `JSON.stringify` 比较

```javascript
if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
```

**为什么不用 `!==`：**

```javascript
// 对象和数组用 !== 永远为 true（引用不同）
{a: 1} !== {a: 1}     // true（但值相同）
[1,2] !== [1,2]       // true

// 字符串化之后能正确比较
JSON.stringify({a:1}) === JSON.stringify({a:1})   // true
```

**注意局限：**

```javascript
JSON.stringify({a:1, b:2}) !== JSON.stringify({b:2, a:1})   // 顺序不同！
```

**所以如果字段是对象，且 key 顺序可能变，会误判"改了"。**

**审计场景里字段多为字符串/数字，影响不大。但要记住这个局限。**

**更严谨的做法是深比较，或者用库。这一周不引入依赖。**

### 设计二：`changes[key] = [旧值, 新值]`

**为什么用数组不用对象：**

```javascript
// 数组：短、有序、易读
{ "nickname": ["Bob", "Bob 2"] }

// 对象：长、冗余
{ "nickname": { "from": "Bob", "to": "Bob 2" } }
```

**日志量大时，每条的字节数会累积成 MB 级差异。**

**而且数组渲染更简单：`changes.nickname[0]` 和 `[1]`。**

### 设计三：`log()` 永不大抛异常

```javascript
try {
  // 写日志
} catch (error) {
  console.error("[audit] 写日志失败：", error.message);
}
```

**为什么：**

**审计是"旁路"。日志写不进去（磁盘满、表被锁）不该让业务失败。**

**这和第 44 节的 `record()` 完全一致。**

**但要注意一个反面的观点：**

**在合规要求严格的场景（金融、医疗），"审计失败"应该阻止业务。**

**那时的做法是：`log()` 失败 → 抛异常 → 业务回滚。**

**这一周的取舍是"可用性优先"。真实的医疗系统会选另一个方向。**

**你要知道这个取舍存在。**

### 设计四：`actorFrom(req)` 减少重复

```javascript
log({
  ...actorFrom(req),
  action: "user.update",
  targetType: "user",
  targetId: id,
  changes,
});
```

**为什么抽出来：**

**每个调用点都要写 `actorId` / `actorEmail` / `actorRole` / `ip` / `userAgent`，重复 5 次。**

**抽出来后调用点只写业务字段。**

**而且以后要加"从哪个页面点的"（`referer`），改一处就够。**

### 设计五：`ORDER BY created_at DESC, id DESC`

**为什么加 `id DESC`：**

**同一毫秒可能有多条日志（批量操作）。**

**只按 `created_at` 排序，顺序不稳定，翻页会重复/漏行。**

**加 `id DESC` 作为决胜字段，绝对稳定。**

**这就是第 60 节讲的"排序字段必须唯一"。**

### 设计六：`safeParse` 兜底

```javascript
const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: String(text).slice(0, 200) };
  }
};
```

**为什么：**

**如果 `changes` 字段被人手动改坏了（或写入时截断），`JSON.parse` 会抛异常。**

**一条坏日志不该让整个日志页打不开。**

**回退成 `{ _raw: "..." }`，前端能看到原始文本。**

---

# 第 3 步：接到每个写接口（35 分钟）

## 3.1 改 `admin-routes.js`

**在顶部加 import：**

```javascript
import { log, actorFrom, diff, listLogs } from "./audit.js";
```

## 3.2 PATCH 加日志

**找到 PATCH 的处理函数，改「成功分支」：**

```javascript
  const result = updateUser(req.params.id, { ... });

  if (!result.ok) {
    // 失败也要记（重要）
    if (result.reason === "CONFLICT" || result.reason === "LAST_ADMIN") {
      log({
        ...actorFrom(req),
        action: "user.update",
        targetType: "user",
        targetId: req.params.id,
        ok: false,
        note: result.reason === "CONFLICT" ? "乐观锁冲突" : "不能降级最后一个管理员",
      });
    }

    // ... 原错误处理
  }

  // 成功：算差异并记日志
  const before = getUserById(req.params.id);   // 注意：这是改之后的
  // 所以要在改之前取 before，见下方说明

  log({
    ...actorFrom(req),
    action: "user.update",
    targetType: "user",
    targetId: req.params.id,
    changes: result.changes,
    ok: true,
  });

  res.json({ message: "已保存", user: result.user });
```

**这里有个问题：`before` 怎么拿？**

**`updateUser` 执行完，数据已经变了。**

**两个方案：**

```text
A. updateUser 内部把 before/after 一起返回
B. 在调 updateUser 之前先查一次
```

**选 A。** 因为 `updateUser` 内部已经查过 `existing`，再查一次是浪费。

**改 `src/admin.js` 的 `updateUser`，让它返回 `changes`：**

```javascript
export const updateUser = (id, { nickname, role, status, expectedUpdatedAt }) => {
  // ... 前面的检查 ...

  const next = { ... };

  const now = new Date().toISOString();

  const result = db
    .prepare(`UPDATE users SET nickname = ?, role = ?, status = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL`)
    .run(next.nickname, next.role, next.status, now, userId, existing.updated_at);

  if (result.changes === 0) {
    const current = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    return { ok: false, reason: "CONFLICT", current: current ? toListItem(current) : null };
  }

  // 新增：算差异
  const changes = diff(
    { nickname: existing.nickname, role: existing.role, status: existing.status },
    { nickname: next.nickname, role: next.role, status: next.status }
  );

  return { ok: true, user: getUserById(userId), changes };
};
```

**注意 `admin.js` 要 import `diff`：**

```javascript
import { diff } from "./audit.js";
```

**这会造成循环依赖吗：**

```text
audit.js  → import db from "./db.js"
admin.js  → import db from "./db.js", import diff from "./audit.js"
```

**没有循环。`audit.js` 不 import `admin.js`。**

**好。**

## 3.3 DELETE 加日志

```javascript
adminRouter.delete("/users/:id", requirePermission(PERMISSIONS.USER_DELETE), (req, res) => {
  const result = softDeleteUser(req.params.id);

  if (!result.ok) {
    log({
      ...actorFrom(req),
      action: "user.delete",
      targetType: "user",
      targetId: req.params.id,
      ok: false,
      note: result.reason,
    });

    // ... 原错误处理
    return;
  }

  log({
    ...actorFrom(req),
    action: "user.delete",
    targetType: "user",
    targetId: req.params.id,
    note: `删除用户 ${result.originalEmail}`,
    changes: { deleted_at: [null, "now"] },
    ok: true,
  });

  res.json({ message: "已删除，可在「包含已删除」中恢复" });
});
```

## 3.4 RESTORE 加日志

```javascript
adminRouter.post("/users/:id/restore", requirePermission(PERMISSIONS.USER_RESTORE), (req, res) => {
  const result = restoreUser(req.params.id);

  if (!result.ok) {
    log({
      ...actorFrom(req),
      action: "user.restore",
      targetType: "user",
      targetId: req.params.id,
      ok: false,
      note: result.reason,
    });
    // ... 原错误处理
    return;
  }

  log({
    ...actorFrom(req),
    action: "user.restore",
    targetType: "user",
    targetId: req.params.id,
    note: `恢复用户 ${result.user.email}`,
    ok: true,
  });

  res.json({ message: "已恢复", user: result.user });
});
```

## 3.5 登录也要记（在 `app.js` 里）

**登录不在 `adminRouter` 下，所以要在 `app.js` 里加。**

**找到 `/api/login`，成功和失败都加：**

```javascript
import { log, actorFrom } from "./audit.js";

app.post("/api/login", async (req, res) => {
  // ... 前面的校验 ...

  const user = findByEmail(email);

  if (!user) {
    // 用户不存在：记一次失败的登录尝试
    log({
      ...actorFrom(req),
      actorEmail: email,
      actorRole: "unknown",
      action: "auth.login",
      targetType: "system",
      ok: false,
      note: "邮箱不存在",
    });

    await bcrypt.compare(prehashIfNeeded(password), DUMMY_HASH).catch(() => {});
    return res.status(401).json({ error: "邮箱或密码错误" });
  }

  const match = await bcrypt.compare(prehashIfNeeded(password), user.password_hash);

  if (!match) {
    log({
      ...actorFrom(req),
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "auth.login",
      targetType: "system",
      ok: false,
      note: "密码错误",
    });

    return res.status(401).json({ error: "邮箱或密码错误" });
  }

  // ... 更新 last_login_at、签发 token ...

  log({
    ...actorFrom(req),
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: "auth.login",
    targetType: "system",
    ok: true,
  });

  res.json({ message: "登录成功", user: toPublicUser(user) });
});
```

## 3.6 五个关键点

### 关键点一：登录失败也要记（而且很重要）

**为什么：**

```text
同一 IP 一分钟失败 50 次 → 撞库攻击
同一账号失败 10 次      → 有人在猜密码
```

**没有这条日志，你发现不了攻击。**

**第 54 节做了限频，但那是"拦住"，日志是"留下证据"。**

**两者都要。**

### 关键点二：`actorFrom(req)` 在登录接口里要覆盖字段

**登录时 `req.user` 还是 `undefined`（还没认证）。**

**所以 `actorFrom(req)` 返回的 `actorEmail` 是 `"anonymous"`。**

**要手动覆盖：**

```javascript
log({
  ...actorFrom(req),          // 拿到 ip 和 userAgent
  actorEmail: email,          // 覆盖成用户输入的邮箱
  actorRole: "unknown",
  // ...
});
```

**注意展开顺序：`...actorFrom(req)` 在前，覆盖字段在后。**

**反过来就会被 `actorFrom` 的值盖掉。**

### 关键点三：`changes` 只在"有变化"时写

**`diff` 返回空对象 `{}` 时，`log()` 里会把它变成 `null`（见 2.1 的实现）。**

**为什么：**

**用户点了保存但什么都没改，不该记一条"空白改动"的日志。**

**否则日志会被"无意义保存"淹没。**

### 关键点四：`note` 写人话

```javascript
note: `删除用户 ${result.originalEmail}`,
```

**为什么 `note` 重要：**

**`target_id: 2` 对人没意义。**

**三个月后你看日志，`note: "删除用户 bob@example.com"` 一眼就懂。**

**`note` 是"给人看的"，`changes` 是"给机器比对的"。两个都要。**

### 关键点五：失败日志的 `note` 用错误码

```javascript
note: result.reason,   // "LAST_ADMIN" / "CONFLICT" / "NOT_FOUND"
```

**为什么用错误码而不是中文：**

**日志是给开发者查的，错误码能 grep。**

**中文描述放在前端（日志页里做映射）。**

**规则：数据库存"机器可读"，界面显示"人可读"。**

---

# 第 4 步：写日志接口和页面（40 分钟）

## 4.1 加接口

```javascript
adminRouter.get("/logs", requirePermission(PERMISSIONS.LOG_READ), (req, res) => {
  const { action, targetType, actorId, q, page, pageSize } = req.query;

  res.json(
    listLogs({
      action: typeof action === "string" ? action : "",
      targetType: typeof targetType === "string" ? targetType : "",
      actorId: typeof actorId === "string" ? actorId : "",
      q: typeof q === "string" ? q : "",
      page: typeof page === "string" ? page : "1",
      pageSize: typeof pageSize === "string" ? pageSize : "20",
    })
  );
});
```

## 4.2 新建 `public/admin/logs.html`

**自己敲（结构和 users.html 一致，只是列定义和筛选不同）：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>操作日志 · 管理后台</title>
  <link rel="stylesheet" href="/admin.css" />
</head>
<body>
  <div class="layout">
    <aside class="sidebar"></aside>

    <main class="main">
      <div class="page-head">
        <div>
          <h1>操作日志</h1>
          <div class="sub" id="sub">加载中……</div>
        </div>
        <button id="refresh" class="small">刷新</button>
      </div>

      <div class="alert" id="alert"></div>

      <div class="panel">
        <div class="panel-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="margin:0;flex:1;min-width:180px">
            <label for="q">搜索</label>
            <input id="q" type="search" placeholder="操作人邮箱或备注" autocomplete="off" />
          </div>

          <div class="field" style="margin:0;width:150px">
            <label for="action">操作</label>
            <select id="action">
              <option value="">全部</option>
              <option value="auth.login">登录</option>
              <option value="user.update">改用户</option>
              <option value="user.delete">删用户</option>
              <option value="user.restore">恢复用户</option>
            </select>
          </div>

          <div class="field" style="margin:0;width:110px">
            <label for="targetType">对象</label>
            <select id="targetType">
              <option value="">全部</option>
              <option value="user">用户</option>
              <option value="system">系统</option>
            </select>
          </div>

          <button id="clear" class="small" style="margin-bottom:1px">清空</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-body" style="padding:0" id="table"></div>
        <div id="pager"></div>
      </div>
    </main>
  </div>

  <script type="module">
    import {
      guard,
      renderSidebar,
      renderTable,
      renderPager,
      api,
      esc,
      fmtTime,
      fmtAgo,
      getParams,
      setParams,
      debounce,
      showAlert,
    } from "/admin.js";

    const alertEl = document.getElementById("alert");
    const subEl = document.getElementById("sub");
    const tableEl = document.getElementById("table");
    const qEl = document.getElementById("q");
    const actionEl = document.getElementById("action");
    const targetEl = document.getElementById("targetType");

    const ACTION_LABEL = {
      "auth.login": "登录",
      "user.update": "改用户",
      "user.delete": "删用户",
      "user.restore": "恢复用户",
    };

    /** 把 changes 对象渲染成 "昵称: Bob → Bob 2" */
    const renderChanges = (changes) => {
      if (!changes || Object.keys(changes).length === 0) {
        return '<span style="color:#c4c8cf">—</span>';
      }

      const FIELD_LABEL = {
        nickname: "昵称",
        role: "角色",
        status: "状态",
        deleted_at: "删除标记",
      };

      return Object.entries(changes)
        .map(([key, pair]) => {
          const label = FIELD_LABEL[key] || key;
          const [before, after] = Array.isArray(pair) ? pair : [pair, pair];

          const fmt = (value) => {
            if (value === null || value === undefined) return '<span style="color:#c4c8cf">空</span>';
            if (value === "now") return "现在";
            return `<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:11.5px">${esc(String(value))}</code>`;
          };

          return `<div style="font-size:12px;line-height:1.9">${esc(label)}：${fmt(before)} → ${fmt(after)}</div>`;
        })
        .join("");
    };

    const COLUMNS = [
      {
        key: "createdAt",
        title: "时间",
        width: "130px",
        render: (row) =>
          `<span title="${esc(fmtTime(row.createdAt))}" style="color:#6b7280;font-size:12.5px">${esc(fmtAgo(row.createdAt))}</span>`,
      },
      {
        key: "actorEmail",
        title: "操作人",
        width: "170px",
        render: (row) => `
          <div style="font-size:12.5px">${esc(row.actorEmail)}</div>
          <div style="font-size:11px;color:#9ca3af">${esc(row.actorRole)}</div>
        `,
      },
      {
        key: "action",
        title: "操作",
        width: "100px",
        render: (row) => {
          const label = ACTION_LABEL[row.action] || row.action;
          const cls = row.ok ? "blue" : "red";
          return `<span class="tag ${cls}">${esc(label)}</span>`;
        },
      },
      {
        key: "targetId",
        title: "对象",
        width: "90px",
        render: (row) =>
          row.targetId
            ? `<span style="font-size:12px;color:#6b7280">${esc(row.targetType)} #${esc(row.targetId)}</span>`
            : '<span style="color:#c4c8cf">—</span>',
      },
      {
        key: "changes",
        title: "变更",
        render: (row) => renderChanges(row.changes),
      },
      {
        key: "note",
        title: "备注",
        width: "170px",
        render: (row) =>
          row.note
            ? `<span style="font-size:12px;color:#6b7280" title="${esc(row.note)}">${esc(row.note)}</span>`
            : '<span style="color:#c4c8cf">—</span>',
      },
      {
        key: "ip",
        title: "IP",
        width: "110px",
        render: (row) => `<span style="font-size:11.5px;color:#9ca3af">${esc(row.ip || "—")}</span>`,
      },
    ];

    const syncFromUrl = () => {
      const params = getParams();
      qEl.value = params.q || "";
      actionEl.value = params.action || "";
      targetEl.value = params.targetType || "";
      return params;
    };

    const load = async () => {
      alertEl.classList.remove("show");
      subEl.textContent = "加载中……";
      document.getElementById("pager").innerHTML = "";
      renderTable(tableEl, { columns: COLUMNS, state: "loading" });

      const params = getParams();
      const search = new URLSearchParams();

      if (qEl.value.trim()) search.set("q", qEl.value.trim());
      if (actionEl.value) search.set("action", actionEl.value);
      if (targetEl.value) search.set("targetType", targetEl.value);
      if (params.page && params.page !== "1") search.set("page", params.page);

      const query = search.toString();
      const result = await api(`/api/admin/logs${query ? `?${query}` : ""}`);

      if (!result.ok) {
        subEl.textContent = "";
        renderTable(tableEl, {
          columns: COLUMNS,
          state: "error",
          emptyText: result.data?.error || "无法加载日志",
          onRetry: load,
        });
        return;
      }

      const { logs, total, page, pageSize, totalPages, hasPrev, hasNext, requestedPage } = result.data;

      subEl.textContent = `共 ${total} 条记录`;

      renderTable(tableEl, {
        columns: COLUMNS,
        rows: logs,
        state: logs.length === 0 ? "empty" : "ready",
        emptyText: "还没有操作记录",
        emptyHint: "做过登录或修改后，日志会出现在这里",
        rowKey: (row) => row.id,
      });

      renderPager(document.getElementById("pager"), {
        page,
        pageSize,
        total,
        totalPages,
        hasPrev,
        hasNext,
        onGo: (nextPage) => {
          setParams({ page: nextPage }, { replace: false });
          load();
        },
      });

      if (requestedPage && requestedPage !== page) {
        setParams({ page: page === 1 ? null : page }, { replace: true });
      }
    };

    const applyFilter = (patch, { replace }) => {
      setParams({ ...patch, page: null }, { replace });
      load();
    };

    const main = async () => {
      const user = await guard();
      if (!user) return;

      renderSidebar("logs", user);
      syncFromUrl();

      qEl.addEventListener(
        "input",
        debounce(() => applyFilter({ q: qEl.value.trim() }, { replace: true }), 350)
      );

      actionEl.addEventListener("change", () => applyFilter({ action: actionEl.value }, { replace: false }));
      targetEl.addEventListener("change", () =>
        applyFilter({ targetType: targetEl.value }, { replace: false })
      );

      document.getElementById("clear").addEventListener("click", () => {
        qEl.value = "";
        actionEl.value = "";
        targetEl.value = "";
        setParams({ q: null, action: null, targetType: null, page: null }, { replace: false });
        load();
      });

      document.getElementById("refresh").addEventListener("click", load);

      window.addEventListener("popstate", () => {
        syncFromUrl();
        load();
      });

      await load();
    };

    main();
  </script>
</body>
</html>
```

## 4.3 四个关键点

### 关键点一：`renderChanges` 把 JSON 变成人话

```text
数据库里：{"nickname": ["Bob", "Bob 2"], "role": ["user", "admin"]}

渲染成：
  昵称：Bob → Bob 2
  角色：user → admin
```

**为什么必须做这个转换：**

**直接把 JSON 贴到表格里，没人看得懂。**

**日志的用途是"给人看"，不是"给机器看"。**

**注意 `esc(String(value))`：**

**`changes` 里的值来自数据库，可能含恶意内容（用户把昵称设成 `<script>`）。**

**必须 `esc`。**

### 关键点二：`fmt` 处理 `null` 和 `"now"`

```javascript
if (value === null || value === undefined) return '<span style="color:#c4c8cf">空</span>';
if (value === "now") return "现在";
```

**为什么：**

```text
null      → 显示"空"（而不是 "null" 字符串）
"now"     → 我在 DELETE 日志里用的占位值，显示"现在"
```

**"null" 显示成 "null" 是技术细节泄露给用户。**

**显示"空"才对。**

### 关键点三：`ACTION_LABEL` 映射

```javascript
const ACTION_LABEL = { "auth.login": "登录", "user.update": "改用户", ... };
```

**为什么不在数据库里存中文：**

**同一套逻辑（第 61 节讲过）：**

```text
数据库存机器可读（user.update）
界面显示人可读（改用户）
```

**以后要加英文界面，只改前端映射。**

**而且 `action` 字段有索引，用 `user.update` 查比较方便。**

### 关键点四：失败日志用红色标签

```javascript
const cls = row.ok ? "blue" : "red";
```

**为什么：**

**失败的登录尝试需要一眼看到。**

**如果全是蓝的，撞库攻击的记录会淹没在正常日志里。**

**这一点颜色，让你在 100 条日志里立刻找到异常。**

---

# 第 5 步：验证（20 分钟）

## 5.1 制造五条日志

**按顺序做：**

1. **登录一次**（成功）→ `auth.login` OK
2. **改 Bob 的昵称**（成功）→ `user.update` OK + changes
3. **改 Alice 的角色**（会被拒，LAST_ADMIN）→ `user.update` FAIL
4. **删 Bob**（成功）→ `user.delete` OK
5. **恢复 Bob**（成功）→ `user.restore` OK

**然后打开：**

```text
http://localhost:4030/admin/logs.html
```

**应该看到 5 条（加上之前的登录可能更多）。**

## 5.2 检查三件事

### 检查一：changes 显示对不对

**第 2 条应该显示：**

```text
昵称：Bob → Bob 改过了
```

**如果显示 `{"nickname":["Bob","Bob 改过了"]}`，说明 `renderChanges` 没生效。**

### 检查二：失败的是红色

**第 3 条应该是红色的"改用户"标签，备注是 `LAST_ADMIN`。**

### 检查三：筛选能用

**选"操作 = 删用户"。**

**应该只剩第 4 条。**

**URL 变成 `?action=user.delete`。**

**刷新还在。**

## 5.3 用 curl 验证日志表

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,actor_email,action,target_id,ok,changes,note FROM audit_logs ORDER BY id DESC LIMIT 10').all()))"
```

**应该看到十行，`changes` 那一列有 JSON 字符串（或者 null）。**

## 5.4 一个必须做的验证：日志会不会写坏业务

**把 `audit_logs` 表改名（模拟"表不存在"）：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.exec('ALTER TABLE audit_logs RENAME TO audit_logs_bak'); console.log('done'); })"
```

**然后改一个用户的昵称。**

**应该：**

```text
① 终端里有 "[audit] 写日志失败：no such table: audit_logs"
② 但接口返回 200，保存成功
```

**这就是"审计是旁路"的证明。**

**恢复表：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.exec('ALTER TABLE audit_logs_bak RENAME TO audit_logs'); console.log('done'); })"
```

**注意：这期间写的日志丢了。这是"可用性优先"的代价。**

---

# 第 6 步：五个必须知道的坑（25 分钟）

## 坑 1：只记成功，不记失败

**这是最常见的漏。**

**只记成功的话，你看不到：**

```text
① 撞库攻击（100 次失败登录）
② 越权尝试（operator 试图删用户被拒）
③ 用户在反复犯同一个错（乐观锁冲突 20 次 → 说明两个人协作有问题）
```

**规则：失败日志和成功日志一样重要。**

## 坑 2：日志表无限增长

**一天 100 次操作 = 一年 3.6 万条。**

**看起来不多。但如果是：**

```text
一天 1000 次登录 + 500 次改数据 = 一年 55 万条
每条 300 字节 = 165 MB
```

**SQLite 处理 55 万行没问题，但你的备份会变大。**

**方案：**

```text
① 定期归档：一年前的日志导出成文件，从表里删
② 分区表：按月分表（第 5 周的 SQL 知识）
③ 保留策略：只留 180 天（合规要求的常见值，问客户）
```

**这一周不做归档，但要知道它会增长。**

**练习里会让你写归档脚本。**

## 坑 3：`changes` 里塞了敏感字段

**如果你用 `diff(整个用户对象, 整个用户对象)`：**

```javascript
diff(beforeRow, afterRow)
```

**`beforeRow` 是 `SELECT *` 的结果，含 `password_hash`。**

**日志里就有密码哈希了。**

**这就是为什么第 37 行我用的是：**

```javascript
const changes = diff(
  { nickname: existing.nickname, role: existing.role, status: existing.status },
  { nickname: next.nickname, role: next.role, status: next.status }
);
```

**只挑三个字段。**

**绝对不要 `diff` 整行。**

## 坑 4：日志的 `actor_email` 用了当前值

**如果你这么写：**

```javascript
log({
  actorEmail: req.user.email,   // 来自数据库的"当前"值
});
```

**问题：**

```text
alice 今天邮箱是 a@x.com
她明天改成了 b@x.com
昨天的日志里的 actor_email 会显示什么？
```

**答案：不会变。因为日志写的是"当时的快照"。**

**这是对的。**

**但如果 `req.user` 是从 JWT 里读的（不是数据库），那就可能读到旧值。**

**我们的 `req.user` 来自数据库（第 52 节的设计），所以是"操作时刻的真实值"。**

**正确。**

**要注意的是：`req.user.email` 在"删除用户"时是真邮箱，但在"改邮箱"操作后，日志里旧日志还是旧邮箱 —— 这正是审计要的。**

## 坑 5：日志页能看到别人的日志

**如果 `listLogs` 没按权限过滤：**

**operator 能看到 admin 的所有操作。**

**这一周的做法是：所有有 `log.read` 权限的人看全部日志。**

**什么时候需要隔离：**

```text
多租户（第 24 周）：A 公司的 operator 不能看 B 公司的日志
```

**那时要在 `listLogs` 里加 `tenant_id` 条件。**

**现在单租户，不需要。但要知道这个缺口。**

---

# 第 7 步：故意做五个实验（25 分钟）

## 实验 1：不记失败日志

**把 PATCH 失败分支里的 `log(...)` 注释掉。**

**然后故意制造 3 次"改最后一个管理员"的错误。**

**刷新日志页 → 看不到任何记录。**

**你失去了"有人在反复尝试违规操作"的信号。**

**加回来。**

## 实验 2：`diff` 整行（含 password_hash）

**把 `updateUser` 里的 `diff` 改成：**

```javascript
const changes = diff(existing, { ...existing, ...next });
```

**改一个昵称，然后看日志表：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { const r = m.db.prepare('SELECT changes FROM audit_logs ORDER BY id DESC LIMIT 1').get(); console.log(r.changes); })"
```

**你会看到 `password_hash` 在里面。**

**这就是"日志泄露密码"的具体形态。**

**改回去（只挑三个字段）。**

## 实验 3：日志表不存在

**见 5.4。**

**做完记得恢复表名。**

## 实验 4：不记登录失败

**把 `/api/login` 里"用户不存在"和"密码错误"两个 `log()` 都注释掉。**

**然后用错密码登录 5 次。**

**日志页看不到任何记录。**

**这就是"撞库无痕迹"。**

**加回来。**

## 实验 5：`ORDER BY created_at` 不带 `id`

**把 `listLogs` 的 `ORDER BY created_at DESC, id DESC` 改成 `ORDER BY created_at DESC`。**

**批量造 100 条日志（同一秒内），然后翻页。**

**可能出现：同一条日志在第 1 页和第 2 页都出现。**

**这就是第 60 节讲的"排序不稳定"。**

**改回来。**

**造批量日志的脚本：**

```text
node --env-file=.env -e "
import('./src/audit.js').then(({ log }) => {
  for (let i = 0; i < 100; i += 1) {
    log({ actorEmail: 'bulk@test.com', actorRole: 'admin', action: 'user.update', targetType: 'user', targetId: String(i), ok: true });
  }
  console.log('造了 100 条');
});
"
```

**清理：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { const r = m.db.prepare(\"DELETE FROM audit_logs WHERE actor_email='bulk@test.com'\").run(); console.log('删了', r.changes, '条'); })"
```

---

# 第 8 步：写本周总结（20 分钟）

**这是第 9 周的收尾。`results/e07.md`。**

```markdown
# 第 9 周 后台管理总结

## 一、做了什么

| 节 | 产出 |
|---|---|
| 57 | 后台骨架 + `/api/admin/*` 全挂 `requireRole`/权限 + 总览页 |
| 58 | 用户列表（四种状态：加载/有/空/错） |
| 59 | 搜索筛选（条件进 URL） |
| 60 | 服务端分页（`COUNT` 与 `SELECT` 共用一个 where） |
| 61 | 编辑/软删除/乐观锁 |
| 62 | 权限点 + 三种角色 + 每个接口挂权限 |
| 63 | 审计日志（who/when/what/before→after） |

## 二、关键数字

| 指标 | 值 |
|---|---|
| 数据表 | users / items / audit_logs / schema_migrations / idempotency_keys / verification_codes / reset_tokens |
| 迁移数 | 10 |
| 后台页面 | 4 |
| 权限点 | 9 |
| 角色 | 3 |

## 三、踩过的坑（按严重程度）

| # | 坑 | 后果 | 修法 |
|---|---|---|---|
| 1 | `COUNT` 没带筛选 | 页码全错，用户以为数据丢了 | 共用 `buildUserWhere` |
| 2 | 只做页面守卫，接口裸奔 | 普通用户 curl 拿全部数据 | `adminRouter.use()` 统一挂 |
| 3 | `SELECT *` 带出 `password_hash` | 密码哈希泄露 | 明确列字段 |
| 4 | `esc` 漏在 `data-email` | 属性注入，点删除就执行 JS | 所有动态属性都 esc |
| 5 | 软删除不改邮箱 | 同一邮箱无法重新注册 | tombstone 后缀 |
| 6 | `finally` 漏了 | 按钮永久禁用 | 每个异步按钮都用 |
| 7 | `permissionsOf` 没复制 | 运行时提权 | 展开运算符 |
| 8 | PATCH 只检查 `USER_UPDATE` | operator 能把自己变 admin | 两段检查 |

## 四、我不确定的地方

（写三条，这是给自己看的）

1.
2.
3.

## 五、下一步

第 10 周：文件上传、图片压缩、缩略图、在线预览。
```

## 8.1 为什么这份总结重要

**"踩过的坑"这一节是给自己看的资产。**

**三个月后你接新项目，翻这份总结，能避免重复踩坑。**

**"我不确定的地方"更重要 —— 它标记了你的知识边界。**

**写"我不确定 `updated_at` 乐观锁会不会在同一毫秒失效"，比写"乐观锁已完美实现"诚实得多。**

---

# 第 9 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 一条完整的日志记录（贴 JSON）
2. `renderChanges` 的渲染效果
3. "日志表不存在但业务正常"的实验现象
4. 「卡在哪」

---

# 第 10 步：课后练习

## 练习一：加日志归档

**要求：** `npm run archive:logs`，把 90 天前的日志导出成 `data/archive/audit-2026-08.jsonl`，然后从表里删。

```javascript
import fs from "node:fs";
import { db } from "./src/db.js";

const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
const rows = db.prepare("SELECT * FROM audit_logs WHERE created_at < ?").all(cutoff);

// 写到文件
// 然后 DELETE
```

**为什么要归档而不是直接删：**

**合规要求（很多行业要留 1-3 年）。**

**而且"去年的日志"偶尔要查。**

## 练习二：加"日志详情"弹窗

**要求：** 点一行日志，弹出完整的 `changes` JSON（格式化后）。

**为什么：** 表格里只能显示简要，详细内容需要展开。

## 练习三：加"用户操作时间线"

**要求：** 在用户编辑弹窗里，显示"这个用户被谁改过几次"。

**查询：**

```sql
SELECT * FROM audit_logs
WHERE target_type = 'user' AND target_id = ?
ORDER BY created_at DESC
LIMIT 10
```

**这是客户最常问的"我的账号怎么回事"。**

## 练习四：想清楚这四个问题

```text
1. 为什么日志要冗余存 actor_email？
2. 为什么失败也要记日志？
3. 为什么 `diff` 不能对整行做？
4. 审计失败时"阻止业务"还是"放行"，怎么选？
```

---

# 第 11 步：最终验收

## A. 数据库

- [ ] `audit_logs` 表存在，四个索引
- [ ] `changes` 存的是 `{字段: [旧, 新]}`
- [ ] `ok` 字段区分成功/失败

## B. 代码

- [ ] `audit.js` 有 `diff` / `log` / `actorFrom` / `listLogs`
- [ ] `log()` 有 try/catch
- [ ] `updateUser` 返回 `changes`
- [ ] 每个写接口都有 `log()`
- [ ] 登录成功/失败都记
- [ ] `listLogs` 的 `ORDER BY` 带 `id`

## C. 页面

- [ ] `/admin/logs.html` 能打开
- [ ] `changes` 渲染成人话（"昵称：Bob → Bob 2"）
- [ ] 失败日志是红色
- [ ] 筛选能用，URL 带参数
- [ ] 分页能用

## D. 验证

- [ ] 五条测试日志都有
- [ ] 我做过"日志表不存在但业务正常"的实验
- [ ] 我做过"只记成功"的实验
- [ ] 我做过 `diff` 整行的实验（看到 password_hash）
- [ ] `results/e07.md` 写完

## E. 认知

- [ ] 我能说清审计日志要记七个字段
- [ ] 我知道为什么日志要冗余
- [ ] 我知道为什么失败也要记
- [ ] 我知道"审计失败阻止业务"是个取舍

## 本节课要能说出口的一句话

> **审计日志不是"给开发者看的调试信息"，是"出事时你唯一能拿出的证据"。它必须自包含、能回答谁在什么时候把什么改成了什么。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 日志页空白 | 表不存在 | 重启跑迁移 010 |
| `changes` 显示 `[object Object]` | 没 `JSON.stringify` | 检查 `log()` |
| 日志里有密码 | `diff` 整行了 | 只挑业务字段 |
| 日志表暴涨 | 没归档 | 写归档脚本 |
| 失败日志看不到 | 只记成功 | 补失败分支 |
| 排序不稳 | 没加 `id DESC` | 加上 |
| 写日志报错导致接口 500 | 没 try/catch | 包一层 |
| `actor_email` 是 `anonymous` | `req.user` 未设置 | 登录接口手动覆盖 |
| 日志时间差 8 小时 | 显示 UTC | `fmtTime` |
| 弹窗里 JSON 太长 | 没截断 | 只显示前 200 字 |
