# 第 61 节课：新增编辑删除——写操作是最危险的部分

> **这份文件是你（学员）一步一步照着做的手册。**
> 前四节课你只是在"看"。今天开始"改"。
> **读错了用户能重试，写错了数据就没了。** 所以今天的每一步都多一道保险。

**建议用时**：160 分钟
**你需要先完成**：第 60 节课（分页能用，`COUNT` 和 `SELECT` 一致）

---

# 第 0 步：写操作的四个风险（10 分钟）

## 0.1 四种会让你半夜被电话叫醒的事

| # | 事 | 后果 | 怎么防 |
|---|---|---|---|
| 1 | 删错了 | 数据没了 | 软删除 + 二次确认 |
| 2 | 改冲突 | 别人改的被覆盖 | 乐观锁 |
| 3 | 越权改 | 改了别人的数据 | 归属检查（第 53 节） |
| 4 | 没记录 | 查不出是谁改的 | 审计日志（第 63 节） |

**今天做 1、2。第 3 已经做过，第 4 是下一节。**

## 0.2 为什么"软删除"是必须的

**真实的删除请求，99% 都不是"我要永久删掉"。**

```text
"把这个测试账号删掉"         → 可能明天又要用
"删掉这个重复注册的用户"     → 可能需要看他的历史订单
"我不小心点到了"             → 唯一真正需要恢复的情况
```

**而"永久删除"的代价是：**

```text
没有备份 → 数据永久丢失
有备份   → 恢复要停服，可能几小时
```

**软删除的代价只是：**

```text
每个查询要记得加 AND deleted_at IS NULL
```

**两害相权，软删除。**

## 0.3 为什么"并发编辑"必须处理

**场景（很常见）：**

```text
管理员 A 打开用户 bob 的编辑页，准备改昵称
管理员 B 也打开同一个页面，准备改角色
A 先保存（昵称 → "Bob 2"）
B 后保存（角色 → admin）

结果：B 的请求里带着"昵称 = Bob"（他页面加载时的旧值）
     B 保存后，昵称变回 "Bob"
     A 的修改被静默覆盖
```

**A 完全不知道自己的修改被覆盖了。**

**这叫"丢失更新"（lost update）。**

**修法：乐观锁 —— 保存时检查"我看过的版本还在不在"。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/admin.js` | `src/` | 加 `getUserById` / `updateUser` / `softDeleteUser` / `restoreUser` |
| `src/admin-routes.js` | `src/` | 加 PATCH / DELETE / POST restore |
| `public/admin/users.html` | `public/admin/` | 加编辑弹窗 + 删除确认 |

---

# 第 1 步：写后端（40 分钟）

## 1.1 在 `src/admin.js` 里加四个函数

**打开 `src/admin.js`，在末尾加：**

```javascript
/**
 * 按 id 取单个用户（排除已删除）。
 * 找不到返回 null。
 */
export const getUserById = (id) => {
  const row = db
    .prepare(
      `SELECT id, email, nickname, role, status, created_at, updated_at, deleted_at, last_login_at
       FROM users
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(Number(id));

  return row ? toListItem(row) : null;
};

/**
 * 更新用户。带乐观锁。
 *
 * 返回：
 *   { ok: true, user }                成功
 *   { ok: false, reason: "NOT_FOUND" }      不存在
 *   { ok: false, reason: "CONFLICT", current } 版本冲突
 */
export const updateUser = (id, { nickname, role, status, expectedUpdatedAt }) => {
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const existing = db
    .prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL")
    .get(userId);

  if (!existing) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  // 乐观锁：客户端提交的 updated_at 必须和数据库一致
  if (expectedUpdatedAt && existing.updated_at !== expectedUpdatedAt) {
    return { ok: false, reason: "CONFLICT", current: toListItem(existing) };
  }

  // 只允许改这三个字段（白名单）
  const next = {
    nickname: nickname === undefined ? existing.nickname : String(nickname).slice(0, 40),
    role: ["admin", "user"].includes(role) ? role : existing.role,
    status: ["active", "disabled"].includes(status) ? status : existing.status,
  };

  // 自我保护：不允许把最后一个管理员降级
  if (existing.role === "admin" && next.role !== "admin") {
    const adminCount = Number(
      db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND deleted_at IS NULL").get().c
    );

    if (adminCount <= 1) {
      return { ok: false, reason: "LAST_ADMIN" };
    }
  }

  const now = new Date().toISOString();

  const result = db
    .prepare(
      `UPDATE users
       SET nickname = ?, role = ?, status = ?, updated_at = ?
       WHERE id = ? AND updated_at = ? AND deleted_at IS NULL`
    )
    .run(next.nickname, next.role, next.status, now, userId, existing.updated_at);

  // 影响 0 行 = 在这条 UPDATE 执行前，别人已经改了
  if (result.changes === 0) {
    const current = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    return { ok: false, reason: "CONFLICT", current: current ? toListItem(current) : null };
  }

  return { ok: true, user: getUserById(userId) };
};

/**
 * 软删除。同时把邮箱腾出来（加时间戳后缀）。
 * 为什么改邮箱：UNIQUE 约束还在，不改的话同一个邮箱无法重新注册。
 */
export const softDeleteUser = (id) => {
  const userId = Number(id);

  const existing = db
    .prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL")
    .get(userId);

  if (!existing) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  // 自我保护：不允许删掉最后一个管理员
  if (existing.role === "admin") {
    const adminCount = Number(
      db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND deleted_at IS NULL").get().c
    );

    if (adminCount <= 1) {
      return { ok: false, reason: "LAST_ADMIN" };
    }
  }

  const now = new Date().toISOString();
  const tombstone = `${existing.email}.deleted.${Date.now()}`;

  const result = db
    .prepare(
      `UPDATE users
       SET deleted_at = ?, status = 'deleted', email = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(now, tombstone, now, userId);

  if (result.changes === 0) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  return { ok: true, originalEmail: existing.email };
};

/**
 * 恢复软删除的用户。
 * 邮箱后缀会被去掉。
 */
export const restoreUser = (id) => {
  const userId = Number(id);

  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!existing) return { ok: false, reason: "NOT_FOUND" };
  if (!existing.deleted_at) return { ok: false, reason: "NOT_DELETED" };

  // 从 "xxx.deleted.1699999999" 里取回原邮箱
  const originalEmail = existing.email.replace(/\.deleted\.\d+$/, "");
  const now = new Date().toISOString();

  // 检查原邮箱是否已被别人占用
  const conflict = db
    .prepare("SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL")
    .get(originalEmail, userId);

  if (conflict) {
    return { ok: false, reason: "EMAIL_TAKEN", email: originalEmail };
  }

  db.prepare(
    `UPDATE users
     SET deleted_at = NULL, status = 'active', email = ?, updated_at = ?
     WHERE id = ?`
  ).run(originalEmail, now, userId);

  return { ok: true, user: getUserById(userId) };
};
```

## 1.2 六个关键设计

### 设计一：乐观锁用 `updated_at` 而不是版本号

```javascript
WHERE id = ? AND updated_at = ? AND deleted_at IS NULL
```

**为什么用 `updated_at` 而不是加一个 `version` 整数字段：**

```text
加 version 字段：
  + 精确（1、2、3，绝对不会重复）
  - 要多一个字段、多一个迁移
  - 每个 UPDATE 都要 version = version + 1

用 updated_at：
  + 不用改表
  + 语义清楚（"我看到的是这个时间点的版本"）
  - 时间戳可能重复（同一毫秒两次更新）
```

**时间戳重复的概率：**

```text
SQLite 的 ISO 字符串精确到毫秒
两次更新落在同一毫秒 → 概率极低，但不是 0
```

**更稳的做法：`updated_at` + 一个自增的 `row_version`。**

**这一周用 `updated_at`，够用。但你要知道它不是绝对可靠的。**

**练习里会让你改成 `row_version`。**

### 设计二：`result.changes === 0` 是冲突的信号

**为什么 `UPDATE` 可能影响 0 行：**

```text
WHERE id = 5 AND updated_at = '2026-11-16T09:00:00.000Z'
→ 如果数据库里这条的 updated_at 已经是 '10:00:00'
→ 没有行匹配 → changes = 0
→ 说明有人在你看过之后改过了
```

**注意：`changes === 0` 有两种可能：**

```text
① 记录被删了（deleted_at 有值）
② 记录被改了（updated_at 变了）
```

**这两种都要告诉用户"冲突"。**

**为什么不用先查再 UPDATE：**

**又是那个"先查再写"的竞态。** 查的时候一致，UPDATE 的时候可能已经变了。

**用 `WHERE ... AND updated_at = ?` 让数据库在**同一条语句里**完成"检查 + 更新"。**

### 设计三：白名单字段

```javascript
const next = {
  nickname: nickname === undefined ? existing.nickname : String(nickname).slice(0, 40),
  role: ["admin", "user"].includes(role) ? role : existing.role,
  status: ["active", "disabled"].includes(status) ? status : existing.status,
};
```

**为什么只写这三个：**

**`email` 不能随便改（涉及唯一性、登录、通知）。**

**`password_hash` 绝对不能在这里改（有专门的改密码流程）。**

**`created_at` 不该改（是事实记录）。**

**`token_version` 不该通过这个接口改（第 52 节的防踢机制）。**

**注意 `nickname === undefined ? existing.nickname : ...`：**

**这允许"只改角色不改昵称"（部分更新）。**

**如果前端只传 `{ role: "admin" }`，昵称保持原值。**

**这是 REST PATCH 的语义（部分更新）。**

**如果用 PUT（整体替换），就要传全所有字段 —— 那样前端更容易出错。**

### 设计四：不允许降级最后一个管理员

```javascript
if (existing.role === "admin" && next.role !== "admin") {
  const adminCount = ...;
  if (adminCount <= 1) return { ok: false, reason: "LAST_ADMIN" };
}
```

**这个检查为什么必要：**

```text
你是唯一的管理员
你把自己降级成普通用户
→ 再也没有人能进后台
→ 只能去数据库里手动 UPDATE
```

**这是真实发生过的运维事故。**

**同样，删除也要检查。**

**这类检查叫"业务不变量"（business invariant）—— 系统必须永远成立的条件。**

**代码里能执行的不变量，一定要写成代码，不要写在文档里。**

### 设计五：软删除时改邮箱

```javascript
const tombstone = `${existing.email}.deleted.${Date.now()}`;
```

**为什么必须改：**

```text
alice@example.com 被软删除，但 email 字段还是 alice@example.com
UNIQUE 约束还在 → 她重新注册时报"邮箱已存在"
```

**改成 `alice@example.com.deleted.1699999999`：**

```text
唯一性释放了，可以重新注册
原邮箱信息还留着（能恢复）
```

**这个后缀的格式要能可靠地反解：**

```javascript
const originalEmail = existing.email.replace(/\.deleted\.\d+$/, "");
```

**正则 `\.deleted\.\d+$` 匹配"以 .deleted.数字结尾"。**

**注意要加 `$`（结尾），否则会误伤中间含 `.deleted.123` 的邮箱。**

**另外一个坑：如果用户的邮箱本来就是 `a.deleted.1@x.com`，可能被误判。**

**但那条邮箱已经含 `@` 了，`.deleted.1@x.com` 结尾不是 `.deleted.数字`，所以不会误伤。**

**这个设计能工作，但确实不优雅。** 真正的方案是部分唯一索引（第 57 节讲过，需要重建表）。

**练习里会让你换成部分索引方案。**

### 设计六：`restoreUser` 检查邮箱冲突

```javascript
const conflict = db
  .prepare("SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL")
  .get(originalEmail, userId);

if (conflict) {
  return { ok: false, reason: "EMAIL_TAKEN" };
}
```

**为什么：**

```text
alice@example.com 被软删除（邮箱变成 alice@example.com.deleted.xxx）
然后有人用 alice@example.com 重新注册了
现在你要恢复旧的那个 → 邮箱冲突
```

**恢复不了是合理的。要提示用户"这个邮箱已被新账号占用"。**

**`id != ?` 是必须的：不排除自己的话，永远查到自己。**

---

# 第 2 步：写接口（30 分钟）

## 2.1 在 `admin-routes.js` 里加四个接口

```javascript
import { getUserById, updateUser, softDeleteUser, restoreUser } from "./admin.js";

adminRouter.get("/users/:id", (req, res) => {
  const user = getUserById(req.params.id);

  if (!user) return res.status(404).json({ error: "用户不存在" });

  res.json({ user });
});

adminRouter.patch("/users/:id", (req, res) => {
  const { nickname, role, status, updatedAt } = req.body ?? {};

  // 类型检查
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

adminRouter.delete("/users/:id", (req, res) => {
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
});

adminRouter.post("/users/:id/restore", (req, res) => {
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
});
```

## 2.2 三个关键点

### 关键点一：409 是"冲突"的标准状态码

```javascript
CONFLICT: ["这条数据已被他人修改，请刷新后重试", 409]
```

**HTTP 409 Conflict 专门表示"请求和当前资源状态冲突"。**

**为什么不用 400：**

```text
400 = 你的请求格式有问题（客户端 bug）
409 = 你的请求格式正确，但时机不对（并发冲突）
```

**前端看到 409 应该"提示用户刷新"，看到 400 应该"提示用户改输入"。**

**两种处理完全不同，所以状态码必须分开。**

### 关键点二：409 时把 `current` 一起返回

```javascript
return res.status(409).json({
  error: message,
  reason: result.reason,
  current: result.current,
});
```

**为什么：**

**用户点了保存，服务器说"冲突了"。用户想知道"那现在是什么值？"**

**给了 `current`，前端可以：**

```text
① 显示"数据库里现在是：昵称=Bob 2, 角色=user"
② 让用户选择"用我的覆盖"还是"用最新的"
③ 或者只显示差异让用户重新决定
```

**不给的话，用户只能刷新页面看，然后重新改一遍 —— 体验差很多。**

### 关键点三：`updatedAt` 参数可选

```javascript
expectedUpdatedAt: typeof updatedAt === "string" ? updatedAt : null,
```

**如果前端没传，`updateUser` 里的检查会跳过（`if (expectedUpdatedAt && ...)`）。**

**这意味着"不带乐观锁也能更新"。**

**为什么允许：**

**因为有时候你确实需要"强制覆盖"（比如修数据）。**

**但这条路径要能看出来：**

```text
带 updatedAt  → 有乐观锁保护
不带 updatedAt → 强制覆盖（要小心）
```

**前端一定会带（第 4 步会做）。**

---

# 第 3 步：先用手工测试（20 分钟）

**写页面之前，先用 curl 确认后端对。这一步能省你一半时间。**

## 3.1 拿 token

```text
curl.exe -X POST http://localhost:4030/api/login -H "Content-Type: application/json" -d "{\"email\":\"alice@example.com\",\"password\":\"test1234\"}"
```

**从响应头 `Set-Cookie` 里复制 `auth_token`。**

## 3.2 测试一：改昵称

**先看当前值（记住 `updatedAt`）：**

```text
curl.exe "http://localhost:4030/api/admin/users/2" -H "Cookie: auth_token=ALICE"
```

**假设返回：**

```json
{"user":{"id":2,"nickname":"Bob","updatedAt":"2026-11-16T09:00:00.000Z",...}}
```

**改：**

```text
curl.exe -X PATCH "http://localhost:4030/api/admin/users/2" -H "Cookie: auth_token=ALICE" -H "Content-Type: application/json" -d "{\"nickname\":\"Bob 改过了\",\"updatedAt\":\"2026-11-16T09:00:00.000Z\"}"
```

**应该返回 `{"message":"已保存","user":{...}}`。**

**再查一次，昵称应该是新的。**

## 3.3 测试二：故意用旧的 `updatedAt`（模拟冲突）

**再发一次同样的请求（还是旧的 `updatedAt`）：**

```text
curl.exe -X PATCH "http://localhost:4030/api/admin/users/2" -H "Cookie: auth_token=ALICE" -H "Content-Type: application/json" -d "{\"nickname\":\"旧版本覆盖\",\"updatedAt\":\"2026-11-16T09:00:00.000Z\"}"
```

**应该返回：**

```text
HTTP/1.1 409 Conflict
{"error":"这条数据已被他人修改，请刷新后重试","reason":"CONFLICT","current":{...}}
```

**这就是乐观锁生效了。**

**用户看到的应该是"冲突提示"，不是"保存成功但值没变"。**

## 3.4 测试三：软删除

```text
curl.exe -X DELETE "http://localhost:4030/api/admin/users/2" -H "Cookie: auth_token=ALICE"
```

**应该返回 `{"message":"已删除..."}`。**

**查数据库确认：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,email,status,deleted_at FROM users').all()))"
```

**应该看到 id=2 的 `deleted_at` 有值，`email` 变成 `bob@example.com.deleted.1699999999`。**

## 3.5 测试四：恢复

```text
curl.exe -X POST "http://localhost:4030/api/admin/users/2/restore" -H "Cookie: auth_token=ALICE"
```

**`deleted_at` 应该变回 NULL，`email` 变回 `bob@example.com`。**

## 3.6 测试五：删最后一个管理员（应该被拦）

**删 Alice（id=1，唯一管理员）：**

```text
curl.exe -X DELETE "http://localhost:4030/api/admin/users/1" -H "Cookie: auth_token=ALICE"
```

**应该返回：**

```text
HTTP/1.1 409 Conflict
{"error":"不能删除最后一个管理员","reason":"LAST_ADMIN"}
```

**这就是"业务不变量"生效。**

**如果这个测试通过了（真的删了），说明你的检查没生效 —— 那时你会把自己锁在后台外面。**

**这一组五个测试做完，后端就是可靠的。现在再写前端。**

---

# 第 4 步：写编辑弹窗（40 分钟）

## 4.1 在 `users.html` 里加弹窗结构

**在 `</main>` 之前，加：**

```html
  <!-- 编辑弹窗 -->
  <div class="modal-mask" id="edit-mask">
    <div class="modal">
      <div class="modal-head">编辑用户</div>

      <div class="modal-body">
        <div class="alert" id="edit-alert"></div>

        <div class="field">
          <label>邮箱（不可修改）</label>
          <input id="edit-email" type="text" disabled />
        </div>

        <div class="field" id="field-nickname">
          <label for="edit-nickname">昵称</label>
          <input id="edit-nickname" type="text" maxlength="40" />
          <div class="err" id="err-nickname"></div>
        </div>

        <div class="field" id="field-role">
          <label for="edit-role">角色</label>
          <select id="edit-role">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>

        <div class="field" id="field-status">
          <label for="edit-status">状态</label>
          <select id="edit-status">
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
      </div>

      <div class="modal-foot">
        <button id="edit-cancel">取消</button>
        <button id="edit-save" class="primary">保存</button>
      </div>
    </div>
  </div>

  <!-- 删除确认 -->
  <div class="modal-mask" id="del-mask">
    <div class="modal" style="max-width:400px">
      <div class="modal-head">确认删除</div>
      <div class="modal-body">
        <div style="font-size:13.5px;line-height:1.7">
          确定要删除 <b id="del-email"></b> 吗？
          <div style="color:#6b7280;margin-top:8px;font-size:12.5px">
            这是软删除，数据还在，可以在「包含已删除」里恢复。
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button id="del-cancel">取消</button>
        <button id="del-confirm" class="danger">确认删除</button>
      </div>
    </div>
  </div>
```

## 4.2 加"操作"列

**在 `COLUMNS` 数组末尾加一列：**

```javascript
      {
        key: "actions",
        title: "操作",
        width: "140px",
        align: "right",
        render: (row) => `
          <button class="small" data-action="edit" data-id="${row.id}">编辑</button>
          <button class="small danger" data-action="delete" data-id="${row.id}" data-email="${esc(row.email)}">删除</button>
        `,
      },
```

**注意 `esc(row.email)`：**

**`data-email` 属性里放用户数据，也必须转义。**

**不转的话：**

```html
data-email="a" onclick="alert(1)" x=""
```

**用户的邮箱能"跳出"属性，注入事件处理器。**

**这个坑叫"属性注入"，比标签注入更隐蔽。**

## 4.3 写事件委托和弹窗逻辑

**在 `<script type="module">` 里加（放在 `main()` 之前）：**

```javascript
    // ============ 编辑弹窗 ============
    const editMask = document.getElementById("edit-mask");
    const editAlert = document.getElementById("edit-alert");
    const editEmail = document.getElementById("edit-email");
    const editNickname = document.getElementById("edit-nickname");
    const editRole = document.getElementById("edit-role");
    const editStatus = document.getElementById("edit-status");

    let editing = null;   // 当前编辑的用户（含 updatedAt）

    const openEdit = async (id) => {
      editAlert.classList.remove("show");
      editMask.classList.add("show");

      editEmail.value = "加载中……";
      editNickname.value = "";
      editNickname.disabled = true;

      const result = await api(`/api/admin/users/${id}`);

      if (!result.ok) {
        editMask.classList.remove("show");
        const el = document.getElementById("alert");
        showAlert(el, result.data?.error || "无法加载用户", "error");
        return;
      }

      editing = result.data.user;

      editEmail.value = editing.email;
      editNickname.value = editing.nickname || "";
      editNickname.disabled = false;
      editRole.value = editing.role;
      editStatus.value = editing.status === "deleted" ? "active" : editing.status;

      editNickname.focus();
    };

    const closeEdit = () => {
      editMask.classList.remove("show");
      editing = null;
    };

    const saveEdit = async () => {
      if (!editing) return;

      const nickname = editNickname.value.trim();
      const fieldEl = document.getElementById("field-nickname");
      const errEl = document.getElementById("err-nickname");

      // 前端校验（后端还有一遍）
      if (nickname.length > 40) {
        fieldEl.classList.add("invalid");
        errEl.textContent = "昵称最多 40 个字符";
        return;
      }

      fieldEl.classList.remove("invalid");

      const btn = document.getElementById("edit-save");
      btn.disabled = true;
      btn.textContent = "保存中……";

      try {
        const result = await api(`/api/admin/users/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nickname,
            role: editRole.value,
            status: editStatus.value,
            updatedAt: editing.updatedAt,
          }),
        });

        if (result.status === 409 && result.data?.reason === "CONFLICT") {
          showAlert(
            editAlert,
            "这条数据已被他人修改。当前值已更新，请确认后重新保存。",
            "warn"
          );

          if (result.data.current) {
            editing = result.data.current;
            editNickname.value = editing.nickname || "";
            editRole.value = editing.role;
          }
          return;
        }

        if (!result.ok) {
          showAlert(editAlert, result.data?.error || "保存失败", "error");
          return;
        }

        closeEdit();
        await load();

        const el = document.getElementById("alert");
        showAlert(el, "已保存", "ok");
      } finally {
        btn.disabled = false;
        btn.textContent = "保存";
      }
    };

    // ============ 删除确认 ============
    const delMask = document.getElementById("del-mask");
    let deleting = null;

    const openDelete = (id, email) => {
      deleting = { id, email };
      document.getElementById("del-email").textContent = email;
      delMask.classList.add("show");
    };

    const closeDelete = () => {
      delMask.classList.remove("show");
      deleting = null;
    };

    const confirmDelete = async () => {
      if (!deleting) return;

      const btn = document.getElementById("del-confirm");
      btn.disabled = true;
      btn.textContent = "删除中……";

      try {
        const result = await api(`/api/admin/users/${deleting.id}`, { method: "DELETE" });

        if (!result.ok) {
          closeDelete();
          const el = document.getElementById("alert");
          showAlert(el, result.data?.error || "删除失败", "error");
          return;
        }

        closeDelete();
        await load();

        const el = document.getElementById("alert");
        showAlert(el, "已删除，可在「包含已删除」中恢复", "ok");
      } finally {
        btn.disabled = false;
        btn.textContent = "确认删除";
      }
    };
```

## 4.4 在 `main()` 里绑事件

**在 `main()` 里、`await load()` 之前加：**

```javascript
      // 表格点击（事件委托）
      tableEl.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const { action, id, email } = btn.dataset;

        if (action === "edit") openEdit(id);
        if (action === "delete") openDelete(id, email);
      });

      // 编辑弹窗
      document.getElementById("edit-cancel").addEventListener("click", closeEdit);
      document.getElementById("edit-save").addEventListener("click", saveEdit);

      editMask.addEventListener("click", (event) => {
        if (event.target === editMask) closeEdit();   // 点遮罩关闭
      });

      // 删除弹窗
      document.getElementById("del-cancel").addEventListener("click", closeDelete);
      document.getElementById("del-confirm").addEventListener("click", confirmDelete);

      delMask.addEventListener("click", (event) => {
        if (event.target === delMask) closeDelete();
      });

      // ESC 关闭
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (editMask.classList.contains("show")) closeEdit();
        if (delMask.classList.contains("show")) closeDelete();
      });
```

## 4.5 六个关键点

### 关键点一：事件委托绑在 `tableEl` 上，不是每行

**为什么不给每行的按钮绑监听器：**

```text
① 20 行 = 40 个监听器，翻页后旧的没解绑（内存泄漏）
② 新渲染的行要重新绑（容易忘）
```

**事件委托：一个监听器管所有行（包括未来渲染的）。**

**`event.target.closest("[data-action]")` 的意思是"从点击的元素往上找最近的带 `data-action` 的祖先"。**

**为什么用 `closest` 而不是判断 `event.target.dataset.action`：**

**因为按钮里可能有 `<span>` 之类的子元素，点到的可能是子元素。**

**`closest` 能正确找到按钮。**

### 关键点二：`editing.updatedAt` 是乐观锁的关键

```javascript
updatedAt: editing.updatedAt
```

**这个值来自"打开弹窗时"的 GET 结果。**

**如果中间有人改了，数据库里的 `updated_at` 就变了，PATCH 会 409。**

**这就实现了"我看的是什么，就改什么"的语义。**

**注意：`editing` 是"打开时的快照"，不是实时数据。** 这正是乐观锁要的。

### 关键点三：409 时更新本地数据并给提示

```javascript
if (result.status === 409 && result.data?.reason === "CONFLICT") {
  showAlert(editAlert, "这条数据已被他人修改。当前值已更新，请确认后重新保存。", "warn");

  if (result.data.current) {
    editing = result.data.current;         // ← 更新快照
    editNickname.value = editing.nickname || "";
    editRole.value = editing.role;
  }
  return;
}
```

**三个动作：**

```text
① 提示"冲突了"（黄色，不是红色 —— 这不是错误，是正常并发）
② 把表单更新成"数据库里的最新值"
③ 更新 editing.updatedAt（这样再点保存就能成功了）
```

**为什么不直接覆盖：**

**因为用户的修改可能和别人的冲突，要让他看到"别人改成了什么"再决定。**

**为什么不关闭弹窗：**

**用户改的内容还在，他看一眼最新值，再决定怎么改。**

### 关键点四：`editStatus.value === "deleted"` 的兜底

```javascript
editStatus.value = editing.status === "deleted" ? "active" : editing.status;
```

**为什么：**

**如果用户勾了"包含已删除"，能看到 `status = deleted` 的行。**

**但下拉框里只有"正常"和"已禁用"两项。**

**`editStatus.value = "deleted"` 会导致下拉框变成空白。**

**兜底成 `active`，是"如果你改了它，就让它恢复正常"的合理默认。**

### 关键点五：前端校验只是体验，后端必须再校验

```javascript
// 前端
if (nickname.length > 40) { 提示; return; }

// 后端（admin-routes.js 里）
if (nickname !== undefined && typeof nickname !== "string") { 400 }
// 而且 updateUser 里还有 slice(0, 40)
```

**为什么三处都要：**

```text
前端    → 用户不用等一次网络往返就知道错了
后端类型 → 防止攻击者绕过前端
后端截断 → 防止超长数据入库（即使类型对）
```

**缺任何一处都不行。但最重要的是后端那两处。**

### 关键点六：`finally` 里恢复按钮状态

```javascript
try {
  // ...
} finally {
  btn.disabled = false;
  btn.textContent = "保存";
}
```

**不写 `finally` 的风险：**

```javascript
btn.disabled = true;
const result = await api(...);   // 这里如果抛异常
btn.disabled = false;            // 永远不会执行
```

**按钮永久禁用，用户只能刷新页面。**

**`finally` 保证"无论如何都恢复"。**

**这个模式你今天会写两次（保存、删除）。以后每个异步按钮都要这么写。**

---

# 第 5 步：五个必须知道的坑（25 分钟）

## 坑 1：`data-email` 没转义 → 属性注入

**见 4.2。**

**验证方法：**

**把 Bob 的邮箱改成一个恶意值：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET email=? WHERE id=2').run('a&quot; onmouseover=&quot;alert(1)'); console.log('done'); })"
```

**（注意：邮箱格式不合法，但数据库不会拦，因为没做格式 CHECK 约束。）**

**刷新页面，鼠标移到"删除"按钮上。**

**如果弹 alert → 你有属性注入。**

**修法：`data-email="${esc(row.email)}"`（已经写了）。**

**恢复邮箱：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET email=? WHERE id=2').run('bob@example.com'); console.log('done'); })"
```

## 坑 2：`finally` 忘了，按钮永久禁用

**验证方法：**

**把 `saveEdit` 里的 `try/finally` 改成只有 `try`，然后在中间加一行 `throw new Error("test")`。**

**点保存 → 弹窗卡住，按钮变灰，再也点不了。**

**这个"看起来没事但功能永久坏了"的 bug 最难查。**

**修法：`finally`。**

## 坑 3：乐观锁用了 `updated_at` 但没检查 `changes` 为 0

```javascript
db.prepare("UPDATE ... WHERE id = ? AND updated_at = ?").run(...);
return { ok: true };   // 不管有没有更新成功
```

**用户会看到"保存成功"但值没变。**

**这是最坏的体验：说了成功，实际失败。**

**必须 `if (result.changes === 0) return { ok: false, reason: "CONFLICT" }`。**

## 坑 4：软删除后列表还是显示

**因为你漏了 `AND deleted_at IS NULL`。**

**这一条第 57 节说过，今天会再犯一次。**

**排查方法：**

```text
① 删除一个用户
② 刷新列表
③ 他还在吗？
```

**还在 → 某个查询漏了 `deleted_at IS NULL`。**

**注意：`SELECT` 和 `COUNT` 都要检查。**

**这也是为什么第 60 节要它们共用 `buildUserWhere` —— 一处漏，两处都漏，但至少能一起发现。**

## 坑 5：恢复软删除的用户时邮箱冲突

**场景：**

```text
alice@example.com 被删除（邮箱变 xxx.deleted.123）
新人注册 alice@example.com
恢复旧 Alice → UNIQUE 冲突 → 报错 500（如果没处理）
```

**这一周的 `restoreUser` 里有检查，返回 409 + `EMAIL_TAKEN`。**

**如果你自己没写，会看到：**

```text
UNIQUE constraint failed: users.email
→ 500 内部错误
```

**用户看到"服务器错误"，不知道原因。**

**验证方法（现在就做）：**

```text
① 删除 Bob（id=2）
② 用 bob@example.com 注册一个新账号
③ 尝试恢复旧 Bob
④ 应该看到 409 和"邮箱已被占用"
```

**做完记得清理新注册的账号。**

---

# 第 6 步：故意做五个实验（25 分钟）

## 实验 1：去掉乐观锁

**把 `updateUser` 里的这个条件去掉：**

```javascript
// WHERE id = ? AND updated_at = ?
// 改成
// WHERE id = ?
```

**然后模拟并发：**

```text
① 打开浏览器 A 的编辑页（不改）
② 在终端用 curl 改一次（改变 updated_at）
③ 回到浏览器 A，改昵称，保存
```

**没有乐观锁时：保存成功，覆盖了 curl 的修改。**

**有乐观锁时：409，提示冲突。**

**这个实验最能说明"丢失更新"是什么。**

## 实验 2：删最后一个管理员

**先确认只有一个 admin：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.log(m.db.prepare(\"SELECT COUNT(*) AS c FROM users WHERE role='admin' AND deleted_at IS NULL\").get()))"
```

**然后在页面上删 Alice（你自己）。**

**应该看到"不能删除最后一个管理员"。**

**如果把那个检查去掉，再试一次：**

**你会被删除，然后刷新页面 → 401 → 跳登录页 → 登录 → 403 被踢出后台。**

**你把自己锁在外面了。恢复方法：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => { m.db.prepare('UPDATE users SET deleted_at=NULL, status=?, role=? WHERE id=1').run('active','admin'); console.log('已恢复'); })"
```

**这个实验做一次，你以后每个后台都会写这个检查。**

## 实验 3：软删除不改邮箱

**把 `tombstone` 那行去掉：**

```javascript
// UPDATE users SET deleted_at = ?, status = 'deleted', updated_at = ?
// （不传 email）
```

**删除 Bob，然后用 bob@example.com 重新注册。**

**应该失败："注册成功"（我们的注册接口是静默的），但实际没插进去。**

**查数据库确认 Bob 只有一个（旧的、已删除的）。**

**这就是"邮箱被占着"的问题。**

**改回来（带 tombstone）。**

## 实验 4：`esc` 漏在 `data-email` 上

**见坑 1。**

**一定要亲手做一遍，看到 alert。**

## 实验 5：`finally` 去掉

**见坑 2。**

**做完记得加回来。**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 五个 curl 测试的结果（贴 409 的完整响应）
2. 乐观锁的两次更新流程（成功 + 冲突）
3. "删最后一个管理员"的处理
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：把 `updated_at` 换成 `row_version`

**要求：**

1. 迁移加 `row_version INTEGER NOT NULL DEFAULT 1`
2. `UPDATE` 时 `SET row_version = row_version + 1 WHERE row_version = ?`
3. 前端拿 `rowVersion` 而不是 `updatedAt`

**为什么更好：**

**整数不会在同一毫秒重复。** 时间戳理论上可能撞。

**这个改动很小，但它让乐观锁从"99.9% 可靠"变成"100% 可靠"。**

## 练习二：加"恢复"按钮

**要求：** 勾选"包含已删除"时，已删除的行显示"恢复"按钮而不是"删除"。

**点击调 `POST /api/users/:id/restore`。**

**这一条会让"包含已删除"这个筛选真正有用。**

## 练习三：加"批量删除"

**要求：** 表格每行前面加复选框，选中后顶部出现"删除选中（N）"。

**注意：**

```text
① 批量删除要逐个检查"最后一个管理员"
② 部分失败时，要告诉用户"3 个成功，1 个失败（原因）"
③ 不要用一个"全部成功/全部失败"的模糊结论
```

**这是"批量操作"的核心难点：部分失败怎么表达。**

## 练习四：想清楚这四个问题

```text
1. 为什么乐观锁不能"先查再更新"？
2. `result.changes === 0` 有哪两种可能？
3. 为什么软删除要改邮箱？
4. "不许删最后一个管理员"这类检查，属于什么性质？（提示：不是安全，是……）
```

---

# 第 9 步：最终验收

## A. 后端

- [ ] `getUserById` 查不到返回 404
- [ ] `updateUser` 有乐观锁，冲突返回 409 + `current`
- [ ] `updateUser` 只允许改 `nickname` / `role` / `status`
- [ ] 不允许降级/删除最后一个管理员（409）
- [ ] `softDeleteUser` 改邮箱（tombstone）
- [ ] `restoreUser` 检查邮箱冲突
- [ ] 所有接口都在 `adminRouter` 下（有 `requireRole`）

## B. 前端

- [ ] "操作"列有"编辑"和"删除"
- [ ] 编辑弹窗能加载、保存
- [ ] 保存冲突时显示黄色提示，并更新表单为最新值
- [ ] 删除有二次确认
- [ ] 删除后列表刷新
- [ ] 点遮罩能关闭弹窗
- [ ] ESC 能关闭弹窗
- [ ] 所有按钮都有 `finally` 恢复

## C. 安全

- [ ] `data-email` 有 `esc()`
- [ ] 我做过属性注入实验
- [ ] 我做过"删最后一个管理员"实验

## D. 认知

- [ ] 我能解释"丢失更新"是什么
- [ ] 我知道 `changes === 0` 的两种含义
- [ ] 我知道软删除为什么要改邮箱
- [ ] 我知道"业务不变量"和"安全校验"的区别

## 本节课要能说出口的一句话

> **写操作唯一不能省的是"更新前再确认一次状态"。乐观锁不是优化，是防止静默覆盖的唯一手段。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 保存成功但值没变 | 没检查 `changes` | `if (changes === 0)` |
| 保存总是 409 | `updatedAt` 传的是旧值 | 冲突后要更新本地快照 |
| 按钮永久禁用 | 没 `finally` | 加上 |
| 弹窗关不掉 | 遮罩点击判断错 | `event.target === mask` |
| 点按钮没反应 | 事件委托绑错容器 | 绑 `tableEl`，用 `closest` |
| 删除后还在列表 | 漏 `deleted_at IS NULL` | 查 `buildUserWhere` |
| 恢复报 500 | 邮箱冲突没处理 | 加 `EMAIL_TAKEN` 分支 |
| 把自己删了进不去 | 没检查最后一个 admin | 加检查 |
| 属性注入弹窗 | `data-*` 没 esc | `esc()` |
| 昵称超长没拦 | 前端没校验 | 前端 + 后端截断 |
