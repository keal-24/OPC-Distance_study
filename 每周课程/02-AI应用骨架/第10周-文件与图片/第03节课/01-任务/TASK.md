# 第 66 节课：保存文件信息——磁盘放内容，数据库放"这是什么"

> **这份文件是你（学员）一步一步照着做的手册。**
> 前两节你的文件能传了，但**列表里查不出来** —— 因为只有磁盘上有文件，数据库里什么都没有。
> 今天建 `files` 表，把"这是什么、谁传的、存在哪、多大"记下来。然后做一个**带权限检查**的读取接口。

**建议用时**：155 分钟
**你需要先完成**：第 65 节课（三重校验能用，假文件被拒）

---

# 第 0 步：为什么必须两边都存（10 分钟）

## 0.1 三种方案对比

| 方案 | 优点 | 缺点 |
|---|---|---|
| **只放磁盘** | 简单 | 查不出"谁传的"、无法分类、删了不知道 |
| **只放数据库（BLOB）** | 一起备份、事务一致 | 备份巨大、读占内存、不适合大文件 |
| **磁盘 + 数据库元信息** | 两边各自擅长 | 要维护一致性（今天的重点） |

**这一周用第三种。**

## 0.2 一个具体的例子

**你要做"我的文件列表"，需要：**

```sql
SELECT id, original_name, size, mime, thumb_key, created_at
FROM files
WHERE user_id = ? AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20
```

**如果只有磁盘：**

```text
你只能 fs.readdir() 拿到一堆 xxx.jpg
不知道谁传的、不知道原文件名、不知道 MIME
要显示缩略图也不知道哪个是缩略图
```

**所以元信息必须在数据库里。**

## 0.3 一致性怎么保证（今天的难点）

**两次写操作：**

```text
① 写数据库记录
② 写磁盘文件（你已经做了，在第 64 节）
```

**两者必然出现"一个成功一个失败"的情况：**

| 情况 | 后果 | 处理 |
|---|---|---|
| 磁盘成功，数据库失败 | 孤儿文件（占空间，用户看不见） | 定时扫描清理 |
| 数据库成功，磁盘失败 | 死记录（用户点开 404） | **绝不能发生** |

**所以顺序必须是：** 磁盘先，数据库后。

**这一周还做一件事：把数据库写和"移动文件"包在一起，失败就回滚。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/db.js` | `src/` | 迁移 011：`files` 表 |
| `src/files.js` | `src/` | 元信息 CRUD + 查询 |
| `src/files-routes.js` | `src/` | 改：上传后入库 + 读取接口 |
| `public/files.html` | `public/` | 文件列表页 |
| `scripts/clean-orphans.js` | `scripts/` | 孤儿文件清理 |
| `results/e03.md` | `results/` | 记录 |

---

# 第 1 步：建表（20 分钟）

## 1.1 在 `db.js` 的 migrations 里加

```javascript
{
  version: "011_create_files",
  sql: `
    CREATE TABLE files (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      storage_key   TEXT    NOT NULL UNIQUE,
      original_name TEXT    NOT NULL,
      mime          TEXT    NOT NULL,
      kind          TEXT    NOT NULL DEFAULT 'image',
      size          INTEGER NOT NULL,
      width         INTEGER,
      height        INTEGER,
      thumb_small   TEXT,
      thumb_medium  TEXT,
      sha256        TEXT,
      ref_count     INTEGER NOT NULL DEFAULT 1,
      deleted_at    TEXT,
      created_at    TEXT    NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_files_user ON files(user_id, deleted_at);
    CREATE INDEX idx_files_created ON files(created_at DESC);
    CREATE INDEX idx_files_sha ON files(sha256);
  `,
}
```

## 1.2 十个字段，逐个说清

| 字段 | 为什么 |
|---|---|
| `user_id` | 归属。所有查询按它过滤（第 53 节的教训） |
| `storage_key` | 磁盘上的文件名（随机生成，第 64 节）**UNIQUE 是关键** |
| `original_name` | 用户看到的文件名（可重复，不做唯一） |
| `mime` | 检测出来的真实 MIME |
| `kind` | `image` / `document`，用于业务分类 |
| `size` | 字节数，列表显示要用 |
| `width` / `height` | 图片尺寸，前端布局要用（防止加载时页面跳动） |
| `thumb_small` / `thumb_medium` | 缩略图的 storage_key（第 68 节填） |
| `sha256` | 文件内容哈希，用于秒传/去重（练习） |
| `ref_count` | 引用计数，多记录共享一个文件时用（练习） |
| `deleted_at` | 软删除（第 61 节的模式） |

**`storage_key` 为什么必须 UNIQUE：**

**它是磁盘文件的唯一标识。**

**重复意味着两条记录指向同一个文件 —— 删一条会影响另一条。**

**加 UNIQUE，数据库层面就防止了这种混乱。**

## 1.3 三个索引的用途

```sql
CREATE INDEX idx_files_user ON files(user_id, deleted_at);
CREATE INDEX idx_files_created ON files(created_at DESC);
CREATE INDEX idx_files_sha ON files(sha256);
```

**为什么 `(user_id, deleted_at)` 是复合索引：**

**列表查询永远是：**

```sql
WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
```

**复合索引让"按用户筛 + 排除删除"一次定位。**

**单独的 `user_id` 索引也能用，但复合索引对"带 `deleted_at IS NULL`"更高效。**

**为什么排序字段没进索引：**

**`ORDER BY created_at DESC` 和 `WHERE user_id = ?` 同时用，最优索引是 `(user_id, created_at DESC)`。**

**但那样会多一个索引。这一周数据量小，先不加。**

**第 22 周（性能）会讲怎么用 `EXPLAIN QUERY PLAN` 判断该建什么索引。**

## 1.4 重启确认

```text
Ctrl + C
npm run dev
```

**应该看到：**

```text
[db] 已应用迁移 011_create_files
```

**验证表结构：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('PRAGMA table_info(files)').all()))"
```

**应该看到 14 行（14 个字段）。**

---

# 第 2 步：写元信息模块（35 分钟）

## 2.1 新建 `src/files.js`

```javascript
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const ORIGINAL_DIR = path.join(ROOT, "uploads", "originals");
const THUMB_DIR = path.join(ROOT, "uploads", "thumbs");

/**
 * 建一条文件记录。
 * 返回 { id, ...完整字段 }
 */
export const createFile = ({
  userId,
  storageKey,
  originalName,
  mime,
  kind = "image",
  size,
  width = null,
  height = null,
  sha256 = null,
}) => {
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO files
       (user_id, storage_key, original_name, mime, kind, size, width, height, sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, storageKey, originalName, mime, kind, size, width, height, sha256, now);

  return getFileById(Number(result.lastInsertRowid));
};

export const getFileById = (id) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(Number(id));
  return row ? toDto(row) : null;
};

export const getFileByKey = (storageKey) => {
  const row = db.prepare("SELECT * FROM files WHERE storage_key = ?").get(String(storageKey));
  return row ? toDto(row) : null;
};

/**
 * 列出某个用户的文件。
 * 支持按 kind 筛选。
 */
export const listFiles = ({ userId, kind = "", page = 1, pageSize = 20 } = {}) => {
  const conditions = ["user_id = ?", "deleted_at IS NULL"];
  const params = [Number(userId)];

  if (kind && ["image", "document"].includes(kind)) {
    conditions.push("kind = ?");
    params.push(kind);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const pageSizeSafe = Math.min(100, Math.max(1, Math.trunc(Number(pageSize) || 20)));
  const pageSafe = Math.max(1, Math.trunc(Number(page) || 1));

  const total = Number(
    db.prepare(`SELECT COUNT(*) AS c FROM files ${where}`).get(...params).c
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSizeSafe));
  const safePage = Math.min(pageSafe, totalPages);
  const offset = (safePage - 1) * pageSizeSafe;

  const rows = db
    .prepare(
      `SELECT * FROM files ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSizeSafe, offset);

  return {
    files: rows.map(toDto),
    total,
    page: safePage,
    pageSize: pageSizeSafe,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    requestedPage: pageSafe,
  };
};

/**
 * 软删除。同时删磁盘文件。
 *
 * 顺序：先删数据库，再删磁盘。
 * 理由：磁盘删失败留下"孤儿文件"（可扫描清理）；
 *      数据库删失败留下"死记录"（用户可见的故障）。
 */
export const softDeleteFile = async (id, userId) => {
  const fileId = Number(id);

  const row = db
    .prepare("SELECT * FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .get(fileId, Number(userId));

  if (!row) return { ok: false, reason: "NOT_FOUND" };

  const now = new Date().toISOString();

  const result = db
    .prepare("UPDATE files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(now, fileId);

  if (result.changes === 0) return { ok: false, reason: "NOT_FOUND" };

  // 删磁盘文件（失败只警告，不回滚数据库）
  const removed = [];

  const targets = [
    { key: row.storage_key, dir: ORIGINAL_DIR },
    { key: row.thumb_small, dir: THUMB_DIR },
    { key: row.thumb_medium, dir: THUMB_DIR },
  ].filter((item) => item.key);

  for (const target of targets) {
    const filePath = path.join(target.dir, target.key);

    try {
      await fs.promises.unlink(filePath);
      removed.push(target.key);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`[files] 删除磁盘文件失败 ${target.key}：`, error.message);
      }
    }
  }

  return { ok: true, storageKey: row.storage_key, removed };
};

/** 数据库行 → 前端要的形状（驼峰 + 拼好 URL） */
const toDto = (row) => ({
  id: row.id,
  userId: row.user_id,
  storageKey: row.storage_key,
  originalName: row.original_name,
  mime: row.mime,
  kind: row.kind,
  size: row.size,
  width: row.width,
  height: row.height,
  thumbSmall: row.thumb_small,
  thumbMedium: row.thumb_medium,
  createdAt: row.created_at,
  deletedAt: row.deleted_at,
  url: `/api/files/${row.id}/raw`,
  thumbUrl: row.thumb_medium ? `/api/files/${row.id}/thumb?size=medium` : null,
});
```

## 2.2 五个关键设计

### 设计一：`url` 和 `thumbUrl` 由后端拼

```javascript
url: `/api/files/${row.id}/raw`,
thumbUrl: row.thumb_medium ? `/api/files/${row.id}/thumb?size=medium` : null,
```

**为什么不在前端拼：**

```text
① 前端要知道 URL 格式（耦合）
② 以后改成 CDN 或签名 URL，只改后端一处
③ 前端拿到的就是"能直接用的 URL"
```

**这是"后端负责组装，前端负责展示"的分工。**

### 设计二：删除时"先数据库后磁盘"

```javascript
// 先 UPDATE
const result = db.prepare("UPDATE files SET deleted_at = ? ...").run(...);
if (result.changes === 0) return { ok: false };

// 再删磁盘（失败只警告）
```

**为什么不反过来：**

```text
先删磁盘 → 磁盘成功、数据库失败
→ 记录还在，文件没了 → 用户点开 404（可见故障）

先删数据库 → 数据库成功、磁盘失败
→ 文件还在，记录没了 → 孤儿文件（不可见，可清理）
```

**"不可见的浪费"比"可见的故障"好。**

**这个原则在分布式系统里叫"最终一致性优于强一致"（在能接受的前提下）。**

### 设计三：`unlink` 的 `ENOENT` 忽略

```javascript
} catch (error) {
  if (error.code !== "ENOENT") {
    console.warn(...);
  }
}
```

**`ENOENT` 是"文件本来就不存在"。**

**这种情况不该警告（可能是重复删除、或者手删了）。**

**其他错误（`EBUSY`、`EACCES`）要警告 —— 那说明有问题。**

**区分错误类型是"日志有没有用"的关键。** 全都 warn，你会被噪音淹没。

### 设计四：`softDeleteFile` 按 `user_id` 过滤

```javascript
WHERE id = ? AND user_id = ? AND deleted_at IS NULL
```

**这就是第 53 节的"归属检查"。**

**用户只能删自己的文件。**

**管理员如果也要删别人的，那是另一个接口（带权限检查），不能混在用户接口里。**

### 设计五：`toDto` 把蛇形转驼峰

**数据库列名是 `storage_key`，前端要 `storageKey`。**

**两种做法：**

```text
A. SQL 里起别名：SELECT storage_key AS storageKey
B. 在 toDto 里转换
```

**选 B。因为：**

```text
① 一条 SQL 要改多处别名，容易漏
② toDto 是唯一出口，转换只写一次
③ 前端拿到的对象形状固定（不会因为忘了别名而变大写）
```

---

# 第 3 步：改上传接口（25 分钟）

## 3.1 在 `files-routes.js` 里插入入库

**找到 `saved.push(...)` 那段，改成：**

```javascript
import { createFile } from "./files.js";

// ...

const saved = [];

for (const file of files) {
  let meta;

  try {
    meta = await validateUpload({
      tmpPath: file.tmpPath,
      filename: file.filename,
      size: file.size,
      kind,
    });
  } catch (error) {
    await cleanupTmp(files);
    // ... 审计日志 ...
    throw error;
  }

  const finalKey = replaceExt(file.storageKey, meta.ext);

  // 第一步：搬文件（磁盘）
  let movedPath;

  try {
    movedPath = await moveToOriginals(file.tmpPath, finalKey);
  } catch (error) {
    await cleanupTmp(files);
    throw Object.assign(new Error("保存文件失败"), { statusCode: 500, cause: error });
  }

  // 第二步：写数据库
  let record;

  try {
    record = createFile({
      userId: req.user.id,
      storageKey: finalKey,
      originalName: file.filename.slice(0, 200),
      mime: meta.mime,
      kind,
      size: meta.size,
    });
  } catch (error) {
    // 关键：数据库写失败 → 把已搬的文件删掉（回滚）
    await fs.promises.unlink(movedPath).catch(() => {});
    await cleanupTmp(files);

    throw Object.assign(new Error("保存文件信息失败"), { statusCode: 500, cause: error });
  }

  saved.push(record);
}
```

## 3.2 三个关键点

### 关键点一：数据库失败要回滚磁盘

```javascript
} catch (error) {
  await fs.promises.unlink(movedPath).catch(() => {});   // 删掉刚搬的文件
  await cleanupTmp(files);
  throw ...;
}
```

**为什么：**

**"磁盘有文件但数据库没记录" = 孤儿文件。**

**如果不删，每次数据库失败都留一个垃圾。**

**这一处"回滚"是本节的核心。**

**注意：这只是"尽力回滚"。如果 `unlink` 也失败了，文件还是留着。**

**所以必须配合第 5 步的"孤儿扫描" —— 因为完美的一致性在文件系统 + 数据库之间做不到。**

### 关键点二：`originalName` 截断

```javascript
originalName: file.filename.slice(0, 200),
```

**为什么：**

**用户能提交任意长的 filename。**

**不截断，数据库会存 10KB 的字符串（或者被 SQLite 拒绝）。**

**200 字符足够任何正常文件名。**

**注意：这是"字段级"的防护，和 `validateUpload` 里的"类型级"防护互补。**

### 关键点三：`movedPath` 变量保存返回值

```javascript
let movedPath;
movedPath = await moveToOriginals(file.tmpPath, finalKey);
```

**为什么要存：**

**回滚时要知道"删哪个文件"。**

**如果不存，可以从 `finalKey` 拼路径 —— 但 `moveToOriginals` 内部知道确切路径，用它返回的更可靠。**

## 3.3 加读取接口

**在 `files-routes.js` 里加两个：**

```javascript
import path from "node:path";
import fs from "node:fs";
import { listFiles, getFileById, softDeleteFile } from "./files.js";

const ORIGINAL_DIR = path.join(ROOT, "uploads", "originals");

filesRouter.get("/", (req, res) => {
  const { kind, page, pageSize } = req.query;

  res.json(
    listFiles({
      userId: req.user.id,
      kind: typeof kind === "string" ? kind : "",
      page: typeof page === "string" ? page : "1",
      pageSize: typeof pageSize === "string" ? pageSize : "20",
    })
  );
});

/**
 * 读原文件。
 *
 * 关键：这个接口有鉴权。
 * 不能直接暴露磁盘路径。
 */
filesRouter.get("/:id/raw", async (req, res) => {
  const file = getFileById(req.params.id);

  if (!file || file.deletedAt) {
    return res.status(404).json({ error: "文件不存在" });
  }

  // 归属检查：只能看自己的
  if (file.userId !== req.user.id) {
    return res.status(404).json({ error: "文件不存在" });
  }

  const filePath = path.join(ORIGINAL_DIR, file.storageKey);

  if (!fs.existsSync(filePath)) {
    console.error(`[files] 记录存在但文件丢失：${file.storageKey}`);
    return res.status(404).json({ error: "文件已丢失" });
  }

  // 关键头：inline 让浏览器直接显示（而不是下载）
  res.setHeader("Content-Type", file.mime);
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
  );
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");

  fs.createReadStream(filePath).pipe(res);
});

filesRouter.delete("/:id", async (req, res, next) => {
  try {
    const result = await softDeleteFile(req.params.id, req.user.id);

    if (!result.ok) {
      return res.status(404).json({ error: "文件不存在" });
    }

    log({
      ...actorFrom(req),
      action: "file.delete",
      targetType: "file",
      targetId: req.params.id,
      ok: true,
      note: `${result.storageKey}（删除磁盘 ${result.removed.length} 个）`,
    });

    res.json({ message: "已删除" });
  } catch (error) {
    next(error);
  }
});
```

## 3.4 四个关键点

### 关键点一：读接口必须做归属检查

```javascript
if (file.userId !== req.user.id) {
  return res.status(404).json({ error: "文件不存在" });
}
```

**这是第 53 节的 IDOR 防护。**

**如果只查 `id`，用户 A 能看用户 B 的文件（改 URL 里的数字就行）。**

**返回 404 不是 403（第 53 节的规则：不确认他人数据的存在性）。**

### 关键点二：四个响应头各有作用

```javascript
res.setHeader("Content-Type", file.mime);                        // 让浏览器知道怎么处理
res.setHeader("Content-Disposition", `inline; filename*=UTF-8''...`);  // 显示而非下载
res.setHeader("Cache-Control", "private, max-age=3600");         // 私有缓存 1 小时
res.setHeader("X-Content-Type-Options", "nosniff");              // 禁止浏览器猜类型
```

**逐个说：**

| 头 | 作用 | 不设的后果 |
|---|---|---|
| `Content-Type` | 浏览器知道这是图片 | 可能被当文本显示 |
| `Content-Disposition: inline` | 直接显示，不弹下载框 | 点图片会下载 |
| `Cache-Control: private` | 只在用户自己的浏览器缓存 | 公共代理可能缓存 → 数据泄漏 |
| `X-Content-Type-Options: nosniff` | 禁止 MIME 嗅探 | 浏览器可能执行上传的脚本 |

**`nosniff` 是最重要的。**

**为什么：**

**如果用户上传了一个"实际是 HTML/JS"的文件，而你的 `Content-Type` 说它是 `image/png`：**

```text
没有 nosniff → 某些浏览器会"嗅探"内容，发现是 HTML 就执行 → XSS
有 nosniff   → 浏览器严格按声明的类型处理 → 不执行
```

**这一行是防"上传导致的 XSS"的关键。**

### 关键点三：`filename*=UTF-8''` 是 RFC 5987

```javascript
`inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
```

**为什么不用 `filename="中文.jpg"`：**

**旧标准只允许 ASCII 文件名。** 中文要么乱码，要么被截断。

**`filename*=UTF-8''<百分号编码>` 是 RFC 5987 定义的"扩展参数"，明确指定字符集。**

**现代浏览器都支持。**

**如果用户点了"另存为"，文件名就是正确的中文。**

**注意格式：**

```text
filename*=UTF-8''%E4%B8%AD%E6%96%87.jpg
         └┬┘└┬┘└──────────────┬───┘
      参数名 双单引号      百分号编码
```

**`UTF-8''` 里是两个单引号，中间没有语言标签。**

**写成 `UTF-8'zh'` 也可以（语言标签可选），但 `''` 更通用。**

### 关键点四：`createReadStream(...).pipe(res)` 而不是 `sendFile`

**为什么用流：**

**`res.sendFile` 也能工作，但它内部会用 `fs.stat` 和整个文件的 `Content-Length`。**

**对于大文件，流更省内存（对 20MB 的图，`sendFile` 其实也还好）。**

**但流有一个好处：你可以随时中断（客户端断开时，流自动销毁）。**

**注意：流式读取**没有** `Range` 支持（不能做"看视频拖进度条"）。**

**第 69 节做 PDF 预览时会加 `Range` 支持。**

## 3.5 重建 `files.html`（列表页）

**新建 `public/files.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>我的文件</title>
  <link rel="stylesheet" href="/admin.css" />
  <style>
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 14px;
    }
    .tile {
      background: #fff;
      border: 1px solid #e6e8ec;
      border-radius: 10px;
      overflow: hidden;
    }
    .tile .pic {
      height: 120px;
      background: #f3f4f6 center/cover no-repeat;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      font-size: 12px;
    }
    .tile .meta { padding: 10px 12px; }
    .tile .name {
      font-size: 12.5px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tile .sub { font-size: 11.5px; color: #9ca3af; margin-top: 4px; }
    .tile .acts { display: flex; gap: 6px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar"></aside>

    <main class="main">
      <div class="page-head">
        <div>
          <h1>我的文件</h1>
          <div class="sub" id="sub">加载中……</div>
        </div>
        <div style="display:flex;gap:8px">
          <a class="btn small primary" href="/upload.html">上传</a>
          <button id="refresh" class="small">刷新</button>
        </div>
      </div>

      <div class="alert" id="alert"></div>

      <div class="panel">
        <div class="panel-body" id="grid-wrap">
          <div class="grid" id="grid"></div>
        </div>
        <div id="pager"></div>
      </div>
    </main>
  </div>

  <script type="module">
    import { guard, renderSidebar, renderPager, api, esc, fmtTime, fmtAgo, getParams, setParams, showAlert } from "/admin.js";

    const alertEl = document.getElementById("alert");
    const subEl = document.getElementById("sub");
    const gridEl = document.getElementById("grid");
    const wrapEl = document.getElementById("grid-wrap");

    const fmtSize = (bytes) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const load = async () => {
      alertEl.classList.remove("show");
      subEl.textContent = "加载中……";
      document.getElementById("pager").innerHTML = "";

      gridEl.innerHTML = Array.from({ length: 6 })
        .map(() => `<div class="tile"><div class="pic"><div class="skeleton" style="width:60px"></div></div></div>`)
        .join("");

      const params = getParams();
      const search = new URLSearchParams();

      if (params.kind) search.set("kind", params.kind);
      if (params.page && params.page !== "1") search.set("page", params.page);

      const result = await api(`/api/files${search.toString() ? `?${search}` : ""}`);

      if (!result.ok) {
        subEl.textContent = "";
        gridEl.innerHTML = "";
        wrapEl.innerHTML = `<div class="center-box">
          <div style="color:#b91c1c;font-size:14px;margin-bottom:6px">加载失败</div>
          <div style="font-size:13px">${esc(result.data?.error || "请稍后重试")}</div>
        </div>`;
        return;
      }

      const { files, total, page, pageSize, totalPages, hasPrev, hasNext, requestedPage } = result.data;

      subEl.textContent = `共 ${total} 个文件`;

      if (files.length === 0) {
        wrapEl.innerHTML = `<div class="center-box">
          <div style="font-size:15px;color:#4b5563;margin-bottom:6px">还没有文件</div>
          <div style="font-size:13px;color:#9ca3af;margin-bottom:16px">点右上角「上传」开始</div>
          <a class="btn primary" href="/upload.html">上传第一个文件</a>
        </div>`;
        return;
      }

      // 恢复网格容器（空状态时被替换过）
      if (!document.getElementById("grid")) {
        wrapEl.innerHTML = '<div class="grid" id="grid"></div>';
      }

      const grid = document.getElementById("grid");

      grid.innerHTML = files
        .map((file) => {
          const isImage = file.kind === "image";
          const previewUrl = file.thumbUrl || file.url;

          return `
            <div class="tile" data-id="${file.id}">
              <div class="pic" style="${isImage ? `background-image:url('${esc(previewUrl)}')` : ""}">
                ${isImage ? "" : esc(file.mime)}
              </div>
              <div class="meta">
                <div class="name" title="${esc(file.originalName)}">${esc(file.originalName)}</div>
                <div class="sub">${fmtSize(file.size)} · ${esc(fmtAgo(file.createdAt))}</div>
                <div class="acts">
                  <a class="btn small" href="${esc(file.url)}" target="_blank">查看</a>
                  <button class="small danger" data-action="delete" data-id="${file.id}">删除</button>
                </div>
              </div>
            </div>
          `;
        })
        .join("");

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

    const main = async () => {
      const user = await guard();
      if (!user) return;

      renderSidebar("files", user);

      document.getElementById("refresh").addEventListener("click", load);

      document.addEventListener("click", async (event) => {
        const btn = event.target.closest('[data-action="delete"]');
        if (!btn) return;

        if (!window.confirm("确定删除这个文件？删除后无法恢复。")) return;

        btn.disabled = true;

        const result = await api(`/api/files/${btn.dataset.id}`, { method: "DELETE" });

        if (!result.ok) {
          btn.disabled = false;
          showAlert(alertEl, result.data?.error || "删除失败", "error");
          return;
        }

        await load();
        showAlert(alertEl, "已删除", "ok");
      });

      await load();
    };

    main();
  </script>
</body>
</html>
```

**三个关键点：**

**第一，缩略图用 `file.thumbUrl || file.url`。**

**现在还没做缩略图（第 68 节），所以回退到原图。**

**做完第 68 节，`thumbUrl` 有值，就不再加载原图。**

**第二，`background-image:url('...')` 里的值要 `esc()`。**

**虽然 URL 是后端拼的（安全），但 `esc` 是习惯。**

**而且 `background-image` 的 `url()` 里有引号，不转义会让引号闭合、注入 CSS。**

**第三，非图片类型显示 MIME。**

**不能 `<img src>` 一个 PDF，会显示破图。**

## 3.6 把侧栏指到 `files.html`（2 分钟，别忘）

**第 64 节你往 `NAV_ITEMS` 加的那一项，当时的写法是：**

```javascript
  { href: "/upload.html", label: "上传", key: "files" },
```

**因为那时 `files.html` 还不存在，写进去就 404。**

**现在它存在了，改回来：**

```javascript
  { href: "/files.html", label: "文件", key: "files" },
```

**`key` 不用动 —— 这就是第 64 节特意让你把它写成 `"files"` 而不是 `"upload"` 的原因。**

**如果你当时写了 `key: "upload"`，现在要改两个地方：`NAV_ITEMS` 里的 `key`，还有 `files.html` 里 `renderSidebar("files", user)` 的第一个参数。漏一个，侧栏就不高亮。**

**改完刷新页面，点侧栏"文件"，应该能看到第 64 节上传的那张图。**

**注意 `upload.html` 不要删。** 它是"只传不看"的极简页，后面调接口时（第 67 节测压缩、第 68 节测缩略图）用它比用完整页快。两个页都留着，功能上不冲突。

---

# 第 4 步：写孤儿清理脚本（25 分钟）

## 4.1 新建 `scripts/clean-orphans.js`

```javascript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/db.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const ORIGINAL_DIR = path.join(ROOT, "uploads", "originals");
const THUMB_DIR = path.join(ROOT, "uploads", "thumbs");

const dryRun = !process.argv.includes("--apply");

/** 1. 磁盘上有、数据库里没有 → 孤儿 */
const findOrphanFiles = () => {
  const known = new Set(
    db.prepare("SELECT storage_key FROM files").all().map((row) => row.storage_key)
  );

  db.prepare("SELECT thumb_small, thumb_medium FROM files")
    .all()
    .forEach((row) => {
      if (row.thumb_small) known.add(row.thumb_small);
      if (row.thumb_medium) known.add(row.thumb_medium);
    });

  const orphans = [];

  const scan = (dir, label) => {
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir).forEach((name) => {
      if (name.startsWith(".")) return;
      if (known.has(name)) return;

      const file = path.join(dir, name);
      const stat = fs.statSync(file);

      orphans.push({ dir: label, name, size: stat.size, path: file });
    });
  };

  scan(ORIGINAL_DIR, "originals");
  scan(THUMB_DIR, "thumbs");

  return orphans;
};

/** 2. 数据库有、磁盘上没有 → 死记录 */
const findMissingFiles = () => {
  const missing = [];

  db.prepare("SELECT id, storage_key, original_name FROM files").all().forEach((row) => {
    const file = path.join(ORIGINAL_DIR, row.storage_key);

    if (!fs.existsSync(file)) {
      missing.push({ id: row.id, key: row.storage_key, name: row.original_name });
    }
  });

  return missing;
};

const main = () => {
  console.log(`模式：${dryRun ? "只检查（加 --apply 才真删）" : "真的删除"}\n`);

  const orphans = findOrphanFiles();
  const missing = findMissingFiles();

  console.log("=== 孤儿文件（磁盘有、数据库没有）===");

  if (orphans.length === 0) {
    console.log("  无");
  } else {
    let totalSize = 0;

    orphans.forEach((item) => {
      totalSize += item.size;
      console.log(`  [${item.dir}] ${item.name}  ${(item.size / 1024).toFixed(1)} KB`);
      console.log(`    ${item.path}`);
    });

    console.log(`\n  共 ${orphans.length} 个，合计 ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log("\n=== 死记录（数据库有、磁盘没有）===");

  if (missing.length === 0) {
    console.log("  无");
  } else {
    missing.forEach((item) => {
      console.log(`  #${item.id} ${item.key}  (${item.name})`);
    });

    console.log("\n  这些记录点开会 404。建议软删除它们。");
  }

  if (dryRun) {
    console.log("\n（没有删除任何东西。加 --apply 执行）");
    return;
  }

  let removed = 0;

  orphans.forEach((item) => {
    try {
      fs.unlinkSync(item.path);
      removed += 1;
    } catch (error) {
      console.error(`  删除失败 ${item.name}：${error.message}`);
    }
  });

  console.log(`\n已删除 ${removed} 个孤儿文件。`);

  if (missing.length > 0) {
    const now = new Date().toISOString();
    const stmt = db.prepare("UPDATE files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL");
    let fixed = 0;

    missing.forEach((item) => {
      fixed += stmt.run(now, item.id).changes;
    });

    console.log(`已软删除 ${fixed} 条死记录。`);
  }
};

main();
```

## 4.2 加脚本

```json
    "clean:orphans": "node --env-file=.env scripts/clean-orphans.js"
```

## 4.3 测试

**1. 先造一个孤儿：**

**在 `uploads/originals/` 里放一个假文件：**

```text
node -e "require('fs').writeFileSync('uploads/originals/orphan-test.jpg', Buffer.from([0xff,0xd8,0xff]))"
```

**2. 跑 dry-run：**

```text
npm run clean:orphans
```

**应该列出那个孤儿文件，但**不删**。**

**3. 真删：**

```text
node --env-file=.env scripts/clean-orphans.js --apply
```

**应该删掉它。**

## 4.4 三个关键点

### 关键点一：默认 dry-run，加 `--apply` 才删

```javascript
const dryRun = !process.argv.includes("--apply");
```

**为什么：**

**清理脚本是"删除操作"。误删的代价极高。**

**默认只报告，人工确认后加 `--apply`。**

**这个模式在真实项目里是标准做法。** 第 36 周的数据库清理、第 33 周的安全扫描都用。

### 关键点二：同时检查两个方向

**"孤儿文件"和"死记录"是两种不同的不一致：**

```text
孤儿：磁盘有、数据库没 → 浪费空间
死记录：数据库有、磁盘没 → 用户点开 404
```

**两个都要查。只查一个，你会漏掉一半问题。**

### 关键点三：死记录是"软删除"不是"物理删"

```javascript
db.prepare("UPDATE files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL");
```

**为什么：**

**"磁盘上没有"可能是暂时的（比如你正在迁移文件、或者磁盘挂载失败）。**

**软删除保留了记录（`id`、`original_name`），万一文件找回来了还能恢复。**

**物理删就彻底没了。**

---

# 第 5 步：五个必须知道的坑（30 分钟）

## 坑 1：上传成功但列表里没有

**原因：** 数据库写入失败但磁盘成功了。

**排查：**

```text
① dir uploads\originals    → 有文件
② 查数据库                 → 没记录
```

**这就是孤儿文件。**

**如果每次都发生，说明 `createFile` 一直失败（比如列名拼错）。**

**跑 `npm run clean:orphans` 能看到它们。**

## 坑 2：读接口 404 但文件明明在

**三种可能：**

```text
① 归属检查失败（别人的文件）
② deleted_at 有值
③ storage_key 和磁盘文件名对不上
```

**排查：**

```javascript
console.log("[files] 查找:", file.storageKey, "实际路径:", filePath, "存在:", fs.existsSync(filePath));
```

**如果 `storage_key` 是 `xxx.jpg` 但磁盘上是 `xxx.png`，说明第 65 节的 `replaceExt` 有问题。**

## 坑 3：中文文件名在"另存为"时变乱码

**原因：** `Content-Disposition` 用了 `filename="中文.jpg"` 而不是 `filename*=`。

**验证：**

**F12 → Network → 点 `raw` 请求 → Response Headers → 看 `Content-Disposition`。**

**正确：**

```text
inline; filename*=UTF-8''%E4%B8%AD%E6%96%87.jpg
```

**错误：**

```text
inline; filename="???.jpg"
```

## 坑 4：列表页加载 20 张原图，卡死

**这就是第 68 节要解决的问题。**

**现在还没缩略图，所以列表用的 `file.thumbUrl || file.url` 会回退到原图。**

**验证方法：**

**F12 → Network → 刷新列表 → 看总传输量。**

**如果 20 张 3MB 的图 = 60MB，你会等很久。**

**这就是"必须做缩略图"的证据。记下这个数字（第 68 节会对比）。**

## 坑 5：`Cache-Control` 设成 `public`

```javascript
// 错
res.setHeader("Cache-Control", "public, max-age=3600");
```

**后果：**

**中间的代理服务器（CDN、公司网关）会缓存这个响应。**

**然后**另一个用户**请求同一个 URL 时，代理直接返回缓存 —— 但那个 URL 是别人的私有文件。**

**虽然 URL 里有 `id`，代理缓存是"按 URL"，所以理论上不会串。**

**但风险在于：**

```text
① 反代配置错误，把用户 Cookie 忽略了
② 用户 A 和用户 B 恰好都请求 /api/files/5/raw（如果 id 复用）
③ 日志里留下完整的 URL
```

**规则：带鉴权的资源，`Cache-Control` 必须是 `private`。**

**更严谨的：加 `Vary: Cookie`。**

---

# 第 6 步：故意做五个实验（30 分钟）

## 实验 1：数据库写入失败

**临时把 `createFile` 的 INSERT 改错（比如把 `original_name` 写成 `originalname`）：**

**重启，上传一个文件。**

**结果：**

```text
① 接口返回 500
② uploads/originals 里没有新文件（因为回滚了）
③ .tmp 里也没有
```

**这就是"数据库失败 → 回滚磁盘"。**

**改回来。**

## 实验 2：删掉回滚代码

**把 `fs.promises.unlink(movedPath)` 注释掉，重复实验 1。**

**结果：`originals/` 里留下一个文件，数据库里没记录。**

**这就是孤儿。**

**跑 `clean:orphans` 能看到它。**

**加回来。**

## 实验 3：手删磁盘文件

**上传一个文件，然后在资源管理器里删掉 `uploads/originals/` 里的那个文件。**

**刷新列表 → 应该看到缩略图位置是空白（因为 404）。**

**跑 `clean:orphans` → 应该报"死记录"。**

**加 `--apply` → 那条记录被软删除，列表里消失。**

## 实验 4：越权访问

**用 Bob 登录（另一个浏览器或无痕窗口）。**

**拿 Alice 的文件 id（比如 1），访问：**

```text
http://localhost:4030/api/files/1/raw
```

**应该 404（不是 403）。**

**这就是第 53 节的 IDOR 防护。**

## 实验 5：`Cache-Control: public`

**改成 `public`，然后：**

```text
① 用 Alice 登录，访问 /api/files/1/raw
② 用 Bob 登录，访问同一个 URL
```

**在本地（没有代理），Bob 会 404（归属检查生效）。**

**但在有 CDN 的环境里，CDN 可能缓存了 Alice 的响应，直接返回给 Bob。**

**这个风险在本地测不出来 —— 这就是为什么要在代码里预防。**

**改回 `private`。**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. `files` 表的完整字段表
2. 上传 → 入库 → 列表 → 读取 的完整链路
3. 列表页 20 张原图的总传输量（F12 里看）
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：加 SHA-256 去重（秒传）

**要求：** 上传时算文件内容的 SHA-256，如果已有相同哈希的文件，直接建一条新记录指向同一个 `storage_key`，不再存磁盘。

**关键点：**

```text
① storage_key 有 UNIQUE 约束 → 两条记录不能指向同一个 key
② 所以要改 UNIQUE 为"部分唯一"或者用 ref_count
```

**改动方案：**

```sql
-- 去掉 storage_key 的 UNIQUE
-- 改用 sha256 判断重复
CREATE INDEX idx_files_sha ON files(sha256);
```

**然后：**

```javascript
const existing = db.prepare("SELECT * FROM files WHERE sha256 = ? AND deleted_at IS NULL").get(sha256);

if (existing) {
  // 建新记录，共用 storage_key
  db.prepare("UPDATE files SET ref_count = ref_count + 1 WHERE storage_key = ?").run(existing.storage_key);
  // 插新记录
  // 删掉刚上传的临时文件
}
```

**删除时要检查 `ref_count`：**

```javascript
if (row.ref_count > 1) {
  // 只减计数，不删磁盘
  db.prepare("UPDATE files SET ref_count = ref_count - 1 WHERE storage_key = ?").run(row.storage_key);
} else {
  // 真删磁盘
}
```

**这一题有点复杂，但它带来一个真实的收益：用户传同一张图两次，只占一份空间。**

**第 25 周（Excel 与支付）会用到类似思路（上传的凭证图片去重）。**

## 练习二：加图片尺寸

**要求：** 上传时读图片宽高存入 `width` / `height`。

**为什么：**

**前端显示图片时要先占位。**

**不知道宽高，图片加载完会"跳一下"，体验差。**

**用 `aspect-ratio` CSS 或者 `<img width height>` 能避免。**

**实现：** 第 65 节练习二的 `readJpegSize`，或者用 `sharp` 的 `metadata()`（第 67 节）。

## 练习三：加"批量删除"

**要求：** 列表页支持多选删除。

**注意：**

**部分失败要报告清楚：**

```json
{
  "deleted": [1, 2, 3],
  "failed": [{ "id": 4, "reason": "NOT_FOUND" }]
}
```

**不要"全部成功/全部失败"的模糊结论。**

## 练习四：想清楚这四个问题

```text
1. 为什么删除要"先数据库后磁盘"？
2. 为什么读接口返回 404 不是 403？
3. `Cache-Control: private` 和 `public` 的区别在什么场景下致命？
4. 孤儿文件和死记录，哪个更严重？
```

---

# 第 9 步：最终验收

## A. 数据库

- [ ] `files` 表有 14 个字段
- [ ] `storage_key` 有 UNIQUE
- [ ] 三个索引
- [ ] 外键 `ON DELETE CASCADE`

## B. 代码

- [ ] `files.js` 有 `createFile` / `getFileById` / `listFiles` / `softDeleteFile`
- [ ] 上传时"磁盘 → 数据库"顺序
- [ ] 数据库失败回滚磁盘
- [ ] 读接口有归属检查
- [ ] 四个响应头齐全（含 `nosniff`）
- [ ] `Cache-Control: private`
- [ ] `clean-orphans.js` 默认 dry-run

## C. 页面

- [ ] `/files.html` 能显示文件网格
- [ ] 空状态有引导
- [ ] 分页能用
- [ ] 点"查看"能在新标签打开
- [ ] 删除有确认
- [ ] 非图片显示 MIME（不是破图）
- [ ] 侧栏那一项已改成 `href:"/files.html"` + `label:"文件"`，`key` 仍是 `"files"`
- [ ] 点侧栏"文件"能到列表页，且当前高亮

## D. 实测

- [ ] 上传后能在列表看到
- [ ] 数据库有记录，磁盘有文件
- [ ] 越权访问 404
- [ ] 孤儿脚本能发现孤儿
- [ ] 手删磁盘文件 → 脚本报死记录
- [ ] 我记录了 20 张原图的总传输量

## E. 认知

- [ ] 我能说清"孤儿"和"死记录"的区别
- [ ] 我知道为什么删除顺序是"先库后盘"
- [ ] 我知道 `nosniff` 防什么
- [ ] 我知道 `Cache-Control: private` 为什么必须

## 本节课要能说出口的一句话

> **文件内容放磁盘，文件身份放数据库。两者必然会出现不一致，所以要么能回滚，要么能扫描修复。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 上传成功列表没有 | 数据库写入失败 | 跑 `clean:orphans` |
| 读 404 但文件在 | `storage_key` 对不上 | 打印实际路径 |
| 中文名乱码 | 没 `filename*=` | 检查响应头 |
| 列表加载慢 | 加载原图 | 第 68 节做缩略图 |
| 代理缓存导致串数据 | `Cache-Control: public` | 改 `private` |
| `EBUSY` | 句柄没关 | `finally` close |
| 表结构不对 | 迁移没跑 | 重启服务 |
| `UNIQUE constraint failed: files.storage_key` | key 重复 | 加了随机数应该不会 |
| 删除后图片还在 | 只删了数据库 | 检查 `softDeleteFile` 的磁盘删除 |
| `bigint` 序列化错误 | `COUNT` 没 `Number()` | 包一层 |
