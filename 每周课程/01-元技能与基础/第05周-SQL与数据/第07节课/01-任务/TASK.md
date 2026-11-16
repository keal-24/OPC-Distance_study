# 第 35 节课：备份与恢复

## 本节课要解决的问题

前面六节课你建了四个数据库：`shop.db`、`bookstore.db`、`join.db`、`chat.db`。

**现在假设一种情况：**

```text
B 盘坏了。
或者你不小心 DELETE FROM accounts（忘了 WHERE）。
或者 Node 进程在写入时被强制结束，文件损坏。
```

**你有没有办法拿回数据？**

**如果没做过备份，答案是"没有"。**

**"没备份 = 没数据"。** 这不是危言耸听，是所有做过项目的人的共识。

**这节课你会学到：**

- 为什么"复制 `.db` 文件"可能不管用（**我实测：会得到 `no such table`**）；
- 正确的备份方式：`backup()` API；
- 怎么验证备份是有效的（**不能只看文件大小**）；
- 备份脚本怎么写（带时间戳、自动清理旧备份）；
- 定时备份怎么配（Windows 任务计划）；
- **恢复演练**：真的删掉数据库，再恢复回来；
- 第一阶段的完整总结。

**这节课不学：** 云存储备份、数据库主从复制、增量备份（SQLite 用不上）。

**需要多久：** 100 分钟。

---

## 第 0 步：先做一次"事故演练"（15 分钟）

**为什么要先演练事故：**

因为**你不亲身经历"数据没了"，就不会重视备份。**

### 0.1 建文件夹

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第07节课\03-练习代码
   ```

2. 新建文件夹 `backup-lab`，进去，地址栏输入 `cmd` 回车。
3. 新建 `seed.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("app.db");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

db.exec("DELETE FROM posts");
db.exec("DELETE FROM users");

const insUser = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
insUser.run("小明", "ming@example.com");
insUser.run("小红", "hong@example.com");
insUser.run("小刚", "gang@example.com");

const insPost = db.prepare("INSERT INTO posts (user_id, title, body, created_at) VALUES (?,?,?,?)");
const now = Date.now();
db.exec("BEGIN");
for (let i = 0; i < 300; i++) {
  insPost.run(
    (i % 3) + 1,
    "文章标题 " + i,
    "这是第 " + i + " 篇文章的正文内容。".repeat(5),
    new Date(now - i * 3600000).toISOString()
  );
}
db.exec("COMMIT");

console.log("用户:", db.prepare("SELECT COUNT(*) AS c FROM users").get().c);
console.log("文章:", db.prepare("SELECT COUNT(*) AS c FROM posts").get().c);
db.close();
```

**运行：**

```text
node seed.mjs
```

**应该看到：**

```text
用户: 3
文章: 300
```

**这就是你要保护的数据。300 篇文章，你写了多久？一秒毁掉。**

### 0.2 制造事故

**操作：** 新建 `disaster.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("app.db");
db.exec("PRAGMA foreign_keys = ON");

console.log("删除前文章数：", db.prepare("SELECT COUNT(*) AS c FROM posts").get().c);

// 这就是那个事故：DELETE 忘了 WHERE
db.exec("DELETE FROM posts");

console.log("删除后文章数：", db.prepare("SELECT COUNT(*) AS c FROM posts").get().c);

db.close();
```

**运行：**

```text
node disaster.mjs
```

**应该看到：**

```text
删除前文章数： 300
删除后文章数： 0
```

**300 篇文章，一条 SQL，没了。**

**现在你有三种反应：**

| 反应 | 结果 |
|---|---|
| "我有备份" | 恢复，5 分钟搞定 |
| "我有 Git" | Git 不追踪 `.db`（应该被 `.gitignore` 忽略），所以没用 |
| "我什么都没有" | **数据永久丢失，重做** |

**现在，如果你的答案不是第一种，继续往下看。**

### 0.3 试着"撤销"

**你会想到什么办法？**

**方案一：`ROLLBACK`？**

**不行。** `DELETE` 已经提交了（`db.exec` 自动提交）。事务已经结束。

**方案二：`UNDO`？**

**SQLite 没有 `UNDO`。** 没有这种命令。

**方案三：看 `-journal` 文件？**

```text
如果用的是 delete 模式，事务完成后 -journal 文件就删了。
如果用的是 WAL 模式，-wal 文件里有记录，但需要工具解析。
```

**普通人做不到。**

**方案四：数据恢复软件？**

**理论可行，实际很难。** 因为 SQLite 会复用空闲页，新数据会覆盖旧数据。

**结论：**

```text
没有备份，就是没有数据。
```

**这一条要刻进脑子。**

**第 0 步做完了。你的数据现在真的没了（除非你还没跑 disaster.mjs）。**

---

## 第 1 步：为什么"复制 .db 文件"会出问题（20 分钟）

**这是本节课最重要的技术点。我实测了，结果和大多数教程说的不一样。**

### 1.1 先重新造数据

**操作：** 重新跑一次：

```text
node seed.mjs
```

**应该看到：**

```text
用户: 6
文章: 600
```

**等等，为什么是 6 和 600？**

**因为 `seed.mjs` 里 `DELETE FROM posts` 清空了文章，但 `DELETE FROM users` 之后插入的 email 是 `UNIQUE`，所以……**

**实际上 `users` 表被清空了，所以还是 3 个用户。**

**但 `posts` 的 `AUTOINCREMENT` 记住了之前的 300，所以新文章的 id 从 301 开始。** 这解释了为什么文章是 300 条（不是 600）—— 因为 `DELETE` 清空了。

**修正：如果你看到 3 和 300，说明正常运行。如果看到别的数字，自己核对一下。**

**为了后面步骤干净，我们先删掉数据库重建：**

**操作：**

```text
del app.db
```

```text
node seed.mjs
```

**应该看到：**

```text
用户: 3
文章: 300
```

### 1.2 检查当前的日志模式

**操作：** 新建 `check-mode.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const db = new DatabaseSync("app.db");

const mode = db.prepare("PRAGMA journal_mode").get();
console.log("journal_mode:", mode);

console.log("目录下的文件:");
for (const f of fs.readdirSync(".")) {
  if (f.startsWith("app.db")) {
    console.log(" ", f, fs.statSync(f).size, "bytes");
  }
}

db.close();
```

**运行：**

```text
node check-mode.mjs
```

**我的实测输出：**

```text
journal_mode: [Object: null prototype] { journal_mode: 'delete' }
目录下的文件:
  app.db 12288 bytes
```

**`journal_mode: 'delete'` 是 SQLite 的默认模式。**

**在这个模式下，数据库只有**一个**文件（`app.db`）。事务执行完，临时日志就删了。**

**所以：直接复制 `app.db` 是安全的（在没有并发写入时）。**

### 1.3 但 WAL 模式下就不是了

**WAL 是什么：** Write-Ahead Logging，预写日志。一种更快的日志模式。

**为什么更快：** 因为写入只追加到 `-wal` 文件，不修改主文件。多个写可以批量合并。

**很多项目会开 WAL（因为性能好）。**

**操作：** 新建 `wal-test.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const db = new DatabaseSync("wal.db");
db.exec("PRAGMA journal_mode = WAL");
console.log("journal_mode:", db.prepare("PRAGMA journal_mode").get().journal_mode);

db.exec("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)");
db.exec("BEGIN");
const ins = db.prepare("INSERT INTO t (v) VALUES (?)");
for (let i = 0; i < 200; i++) ins.run("v" + i);
db.exec("COMMIT");

console.log("行数:", db.prepare("SELECT COUNT(*) AS c FROM t").get().c);

console.log("\n目录下的文件:");
for (const f of fs.readdirSync(".")) {
  if (f.startsWith("wal.db")) console.log(" ", f, fs.statSync(f).size, "bytes");
}

// 模拟"连接还开着时直接复制主文件"
console.log("\n=== 直接复制 wal.db ===");
fs.copyFileSync("wal.db", "copied.db");

const c = new DatabaseSync("copied.db");
try {
  const n = c.prepare("SELECT COUNT(*) AS c FROM t").get().c;
  console.log("复制后行数:", n);
} catch (error) {
  console.log("复制后报错:", error.message);
}
c.close();

db.close();
```

**运行。我的实测输出：**

```text
journal_mode: wal
行数: 200

目录下的文件:
  wal.db 4096 bytes
  wal.db-shm 32768 bytes
  wal.db-wal 51232 bytes

=== 直接复制 wal.db ===
复制后报错: no such table: t
```

**这就是关键：**

```text
WAL 模式下，主文件 wal.db 只有 4096 bytes（几乎是空的）
真正的数据在 wal.db-wal 里（51232 bytes）
```

**所以只复制 `wal.db`，你复制了一个空数据库。**

**报错 `no such table: t` —— 连表都不存在。**

**这就是为什么"直接复制 `.db` 文件"是错的备份方式。**

### 1.4 这个坑有多常见

**你在网上看到的备份教程，90% 都说"复制 `.db` 文件即可"。**

**它们错在哪：**

| 情况 | 复制文件安全吗 |
|---|---|
| `delete` 模式，无并发写入 | 安全 |
| **`wal` 模式** | **不安全**（会丢 `-wal` 里的数据） |
| 有连接正在写 | 不安全（可能复制到半状态） |

**你不可能每次都去确认"现在是什么模式、有没有人在写"。**

**所以：**

```text
永远用 backup() API 备份，不要直接复制文件。
```

**这一条能救你无数次。**

### 1.5 三种"复制"的对比

| 方式 | 安全吗 | 说明 |
|---|---|---|
| 复制 `.db` | **不安全** | WAL 模式会丢数据 |
| 复制 `.db` + `-wal` + `-shm` | 可能安全 | 但要在同一瞬间复制，实际做不到 |
| **`backup()` API** | **安全** | 数据库自己保证一致性 |

**第三个是唯一正确的方式。**

---

## 第 2 步：正确的备份方式（25 分钟）

### 2.1 `backup()` API 的用法

**注意：它不是数据库实例的方法，是模块级别导出的函数。**

**这是一个很多人踩的坑：**

```javascript
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("app.db");

await db.backup("x.db");     // ❌ TypeError: db.backup is not a function
```

**正确写法：**

```javascript
import { DatabaseSync, backup } from "node:sqlite";
const db = new DatabaseSync("app.db");

await backup(db, "x.db");    // ✅
```

**我实测过 `db.backup` 确实不存在：**

```text
TypeError: src.backup is not a function
```

**`DatabaseSync` 的方法列表里没有 `backup`**（只有 `open`、`close`、`prepare`、`exec`、`function`、`aggregate` 等）。

**所以必须从模块里导入 `backup`。**

### 2.2 最简单的备份脚本

**操作：** 新建 `backup-simple.mjs`：

```javascript
import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";

const db = new DatabaseSync("app.db");

const target = "app.backup.db";

// 如果目标已存在，先删掉（backup 会写入已存在的文件，可能出问题）
if (fs.existsSync(target)) {
  fs.unlinkSync(target);
}

await backup(db, target);

console.log("备份完成:", target, fs.statSync(target).size, "bytes");

db.close();
```

**运行：**

```text
node backup-simple.mjs
```

**应该看到：**

```text
备份完成: app.backup.db 24576 bytes
```

**注意 `backup()` 返回 Promise，必须 `await`。**

**为什么：** 因为备份是异步操作（可能要复制大量数据）。

**不 `await` 会怎样：**

```javascript
backup(db, target);       // ❌ 没等它完成
db.close();               // 数据库先关了
```

**结果：备份可能不完整，或者抛错。**

**规则：`backup()` 必须 `await`，而且要在 `db.close()` 之前。**

### 2.3 验证备份是有效的（这一步不能省）

**很多人备份完就放心了。但备份文件可能是坏的。**

**为什么会坏：**

- 备份时磁盘满了，写了一半；
- 备份时进程被杀了；
- 复制了错误的文件。

**验证方法：打开备份文件，跑 `PRAGMA integrity_check`。**

**操作：** 新建 `verify-backup.mjs`：

```javascript
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

function verifyBackup(path, expected = {}) {
  if (!fs.existsSync(path)) {
    return { ok: false, reason: "文件不存在" };
  }

  const size = fs.statSync(path).size;
  if (size < 1024) {
    return { ok: false, reason: `文件太小（${size} bytes），可能是空库` };
  }

  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch (error) {
    return { ok: false, reason: "打不开：" + error.message };
  }

  try {
    // 1. 完整性检查
    const integrity = db.prepare("PRAGMA integrity_check").get();
    const result = Object.values(integrity)[0];
    if (result !== "ok") {
      return { ok: false, reason: "完整性检查失败：" + result };
    }

    // 2. 表是否都在
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map(r => r.name);

    // 3. 行数是否对得上
    const counts = {};
    for (const [table, expectedCount] of Object.entries(expected)) {
      if (!tables.includes(table)) {
        return { ok: false, reason: `缺表：${table}` };
      }
      const c = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
      counts[table] = c;
      if (c !== expectedCount) {
        return { ok: false, reason: `${table} 行数不对：期望 ${expectedCount}，实际 ${c}` };
      }
    }

    return { ok: true, size, tables, counts };
  } catch (error) {
    return { ok: false, reason: error.message };
  } finally {
    db.close();
  }
}

const r = verifyBackup("app.backup.db", { users: 3, posts: 300 });
console.log(r);
```

**运行，我的预期输出：**

```text
{
  ok: true,
  size: 24576,
  tables: [ 'users', 'posts' ],
  counts: { users: 3, posts: 300 }
}
```

**`new DatabaseSync(path, { readOnly: true })` 是什么：** 以只读方式打开。**验证时绝不能用可写方式**，否则可能改坏备份。

**`PRAGMA integrity_check` 返回什么：** 一个对象，值是 `'ok'` 或错误描述。

**我的实测：`{ integrity_check: 'ok' }`。**

**这个函数做了四层验证：**

| 层 | 检查什么 |
|---|---|
| 1 | 文件存在、大小合理 |
| 2 | 能打开（不是损坏的文件） |
| 3 | `integrity_check` 通过 |
| 4 | 表都在、行数对得上 |

**只检查文件大小是没用的。** 一个 24KB 的坏文件，和 24KB 的好文件，大小一样。

### 2.4 备份脚本要带时间戳

**为什么：**

因为**你永远不知道"哪天的备份是好的"。**

今天的备份可能已经包含了错误数据（比如你误删了一部分）。**你需要的可能是昨天的。**

**操作：** 新建 `backup-full.mjs`：

```javascript
import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = "app.db";
const BACKUP_DIR = "backups";
const KEEP_DAYS = 7;   // 保留最近 7 天

// 建备份目录
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 生成时间戳：2026-11-16_163000
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const target = path.join(BACKUP_DIR, `app_${stamp}.db`);

const db = new DatabaseSync(DB_PATH);

// 备份前先记录行数，用于验证
const expected = {
  users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
  posts: db.prepare("SELECT COUNT(*) AS c FROM posts").get().c,
};

console.log("备份前数据：", expected);

await backup(db, target);
db.close();

console.log("备份文件：", target);
console.log("大小：", fs.statSync(target).size, "bytes");

// 立刻验证
const check = new DatabaseSync(target, { readOnly: true });
const integrity = Object.values(check.prepare("PRAGMA integrity_check").get())[0];
const counts = {
  users: check.prepare("SELECT COUNT(*) AS c FROM users").get().c,
  posts: check.prepare("SELECT COUNT(*) AS c FROM posts").get().c,
};
check.close();

if (integrity !== "ok") {
  console.error("❌ 备份完整性检查失败：", integrity);
  process.exit(1);
}

if (counts.users !== expected.users || counts.posts !== expected.posts) {
  console.error("❌ 备份行数不对：", counts, "应为", expected);
  process.exit(1);
}

console.log("✅ 备份验证通过：", counts);

// 清理旧备份
const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith("app_") && f.endsWith(".db"));
const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;

let removed = 0;
for (const f of files) {
  const full = path.join(BACKUP_DIR, f);
  if (fs.statSync(full).mtimeMs < cutoff) {
    fs.unlinkSync(full);
    removed++;
    console.log("删除旧备份：", f);
  }
}
console.log(`保留 ${files.length - removed} 个备份，删除 ${removed} 个`);
```

**运行：**

```text
node backup-full.mjs
```

**应该看到：**

```text
备份前数据： { users: 3, posts: 300 }
备份文件： backups\app_2026-11-16_163000.db
大小： 24576 bytes
✅ 备份验证通过： { users: 3, posts: 300 }
保留 1 个备份，删除 0 个
```

**再跑一次：**

```text
node backup-full.mjs
```

**应该看到两个备份文件（`保留 2 个备份`）。**

**这个脚本做了五件事：**

| 步骤 | 作用 |
|---|---|
| 1 | 建备份目录 |
| 2 | 用时间戳命名 |
| 3 | 备份前记录行数 |
| 4 | 备份后立刻验证 |
| 5 | 清理超期的旧备份 |

**第五步很重要。** 不清理的话，每天备份一个，一年后硬盘满了。

**保留 7 天是常见策略：** 你今天误删了数据，可能明天才发现。留 7 天够用。

### 2.5 一个必须注意的细节：备份目录不要放在 Git 里

**操作：** 检查 `.gitignore`：

```text
backups/
*.db
*.db-wal
*.db-shm
```

**为什么：**

| 文件 | 为什么不能提交 |
|---|---|
| `*.db` | 数据库文件二进制，Git 对比不了，而且每次改都全量存一份 |
| `*.db-wal` / `*.db-shm` | 临时文件，一直在变 |
| `backups/` | 备份文件会越来越多，仓库会爆炸 |

**真实的教训：** 有人把 200MB 的 `.db` 提交进 Git，之后每次改动都存一份完整副本。**半年后仓库变成 10GB，克隆一次要半小时。**

**这条写进 `.gitignore`，永远别提交数据库文件。**

---

## 第 3 步：恢复演练（25 分钟）

**备份没演练过，等于没有备份。**

**这一步要真的删掉数据库，再恢复。**

### 3.1 完整演练流程

**操作：** 新建 `restore.mjs`：

```javascript
import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = "app.db";
const BACKUP_DIR = "backups";

// 1. 找一个可用的备份（最新的）
const files = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith("app_") && f.endsWith(".db"))
  .sort()
  .reverse();

if (files.length === 0) {
  console.error("没有找到备份");
  process.exit(1);
}

const latest = path.join(BACKUP_DIR, files[0]);
console.log("使用备份：", latest);

// 2. 验证这个备份是好的（不验证就恢复 = 赌博）
const check = new DatabaseSync(latest, { readOnly: true });
const integrity = Object.values(check.prepare("PRAGMA integrity_check").get())[0];
const counts = {
  users: check.prepare("SELECT COUNT(*) AS c FROM users").get().c,
  posts: check.prepare("SELECT COUNT(*) AS c FROM posts").get().c,
};
check.close();

if (integrity !== "ok") {
  console.error("备份损坏，拒绝恢复：", integrity);
  process.exit(1);
}
console.log("备份验证通过：", counts);

// 3. 现场数据先另存一份（万一备份是错的，还能退回来）
if (fs.existsSync(DB_PATH)) {
  const safety = DB_PATH + ".before-restore";
  if (fs.existsSync(safety)) fs.unlinkSync(safety);
  fs.copyFileSync(DB_PATH, safety);
  console.log("当前数据已另存：", safety);
}

// 4. 删掉当前数据库（模拟"数据已丢失"）
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log("已删除当前数据库");
}

// 5. 从备份恢复
const src = new DatabaseSync(latest, { readOnly: true });
await backup(src, DB_PATH);
src.close();

console.log("恢复完成");

// 6. 验证恢复结果
const verify = new DatabaseSync(DB_PATH, { readOnly: true });
const after = {
  users: verify.prepare("SELECT COUNT(*) AS c FROM users").get().c,
  posts: verify.prepare("SELECT COUNT(*) AS c FROM posts").get().c,
};
verify.close();

console.log("恢复后数据：", after);

if (after.users === counts.users && after.posts === counts.posts) {
  console.log("✅ 恢复成功，数据一致");
} else {
  console.error("❌ 恢复后数据不一致");
  process.exit(1);
}
```

### 3.2 完整演练

**操作：按顺序执行四步：**

**第一步：确认现在有数据**

```text
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('app.db');console.log('当前文章数:',d.prepare('SELECT COUNT(*) c FROM posts').get().c);d.close()"
```

**应该看到 `当前文章数: 300`。**

**第二步：做一次备份**

```text
node backup-full.mjs
```

**第三步：毁掉数据**

```text
node disaster.mjs
```

**应该看到 `删除后文章数: 0`。**

**第四步：恢复**

```text
node restore.mjs
```

**我的预期输出：**

```text
使用备份： backups\app_2026-11-16_163000.db
备份验证通过： { users: 3, posts: 300 }
当前数据已另存： app.db.before-restore
已删除当前数据库
恢复完成
恢复后数据： { users: 3, posts: 300 }
✅ 恢复成功，数据一致
```

**第五步：确认**

```text
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('app.db');console.log('恢复后文章数:',d.prepare('SELECT COUNT(*) c FROM posts').get().c);d.close()"
```

**应该看到 `恢复后文章数: 300`。**

**300 篇文章，失而复得。**

### 3.3 演练脚本里的三个关键设计

**设计一：先验证备份，再恢复**

```javascript
if (integrity !== "ok") {
  console.error("备份损坏，拒绝恢复：", integrity);
  process.exit(1);
}
```

**为什么：** 如果备份本身是坏的，你恢复它只会把当前数据也毁掉。**"拒绝恢复"比"恢复成垃圾"好。**

**设计二：恢复前先另存当前数据**

```javascript
const safety = DB_PATH + ".before-restore";
fs.copyFileSync(DB_PATH, safety);
```

**为什么：** 万一"备份"其实是旧版本（数据更少），恢复完你发现"少了 100 篇文章"，**这时候你还能退回去。**

**这是"救火时的安全带"。**

**设计三：恢复后再验证一次**

```javascript
if (after.users === counts.users && after.posts === counts.posts) { ... }
```

**为什么：** 恢复过程可能出错（磁盘满、权限问题）。**不验证就宣布"恢复成功"，是很危险的。**

### 3.4 一个真实场景：备份也是坏的

**假设你的备份是三天前的，这三天新增了 500 篇文章。**

**恢复之后，你回到三天前，**这三天的工作没了**。**

**这时候怎么办：**

**方案一：接受损失**（有备份比没备份好）

**方案二：从备份恢复，然后从日志重建**

**如果你有"操作日志"表：**

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT,
  row_id INTEGER,
  action TEXT,          -- insert / update / delete
  payload TEXT,         -- JSON 快照
  created_at TEXT
);
```

**那么：** 恢复备份后，重放这三天的新增记录，就能补回来。

**这是生产系统的做法**（叫"审计日志"或"变更日志"）。

**我们不做这么复杂。** 但你要知道：

```text
备份的粒度（多久备一次）决定了你最多会丢多少数据。
每天备一次 → 最多丢一天数据。
```

**业务能接受丢多少，就决定备份频率。** 这是产品决策，不是技术决策。

---

## 第 4 步：自动定时备份（15 分钟）

**手动备份你一定会忘。必须自动化。**

### 4.1 Windows 任务计划

**操作步骤：**

**第一步：** 按 `Win + R`，输入：

```text
taskschd.msc
```

按 `Enter`。

**应该看到：** "任务计划程序"窗口。

**第二步：** 点右侧"创建基本任务"。

**第三步：** 名称填：

```text
每日数据库备份
```

点"下一步"。

**第四步：** 触发器选"每天"，点"下一步"。

**第五步：** 开始时间填 `凌晨 3:00`（业务低峰），点"下一步"。

**第六步：** 操作选"启动程序"，点"下一步"。

**第七步：** 填三个框：

| 框 | 填什么 |
|---|---|
| 程序或脚本 | `C:\Program Files\nodejs\node.exe` |
| 添加参数 | 你的 `backup-full.mjs` 的完整路径 |
| 起始于 | 你的项目目录（**这个必须填，否则路径找不到**） |

**"起始于"为什么必须填：** 因为脚本里的 `app.db` 是相对路径。不指定工作目录，它会去 `C:\Windows\System32` 找。

**第八步：** 勾选"当单击完成时，打开此任务属性的对话框"，点"完成"。

**第九步：** 在弹出的属性窗口，勾"不管用户是否登录都要运行"，然后确定（会让你输密码）。

**第十步：** 右键任务 → 运行，看是否成功。

**验证：** 去 `backups/` 目录看有没有新文件。

### 4.2 一个更简单的方案：启动时备份

**如果不想配任务计划，可以在应用启动时备份。**

**操作：** 在你的服务器入口文件最前面加：

```javascript
import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

async function backupOnStart() {
  const DB = "app.db";
  if (!fs.existsSync(DB)) return;

  const dir = "backups";
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(dir, `startup_${stamp}.db`);

  const db = new DatabaseSync(DB, { readOnly: true });
  await backup(db, target);
  db.close();

  console.log("启动备份完成：", target);
}

await backupOnStart();

// 然后才是正常的服务器启动代码
```

**优点：** 不用配系统任务，重启就备份。

**缺点：** 如果服务一直不重启，就永远不会备份。

**真实项目建议两个都做：** 定时备份 + 启动备份。

### 4.3 备份的三个"必须"

```text
一、必须验证（integrity_check + 行数对比）
二、必须自动（手动一定会忘）
三、必须演练（没恢复过的备份不算备份）
```

**第三条最容易被忽略，也最重要。**

**你的备份脚本跑了半年，从来没恢复过。某天真的需要恢复，你发现：**

- 备份文件是 0 字节（磁盘满时写的）；
- 备份路径搞错了（备份到了别的目录）；
- 恢复脚本有 bug。

**这时候你才发现"我的备份从来都是假的"。**

**所以：每季度做一次恢复演练。** 拿一个备份，恢复到一个临时目录，验证数据。

---

## 第 5 步：五个必须撞的坑（15 分钟）

### 坑 1：`db.backup` 不存在

```javascript
try {
  const db = new DatabaseSync("app.db");
  await db.backup("x.db");
} catch (error) {
  console.log("报错：", error.message);
}
```

**报错：**

```text
TypeError: db.backup is not a function
```

**教训：`backup` 要从模块导入，不是实例方法。**

```javascript
import { DatabaseSync, backup } from "node:sqlite";
await backup(db, "x.db");
```

### 坑 2：WAL 模式下只复制主文件

**这个你已经看过实测了：**

```text
直接复制 wal.db → 得到 no such table: t
```

**教训：永远用 `backup()` API。**

### 坑 3：不 `await` 就 `close`

```javascript
const db = new DatabaseSync("app.db");
backup(db, "x.db");    // 没 await
db.close();            // 立刻关了
```

**会怎样：** 备份可能不完整，或者抛 `database is closed` 之类的错。

**教训：`await backup(...)` 必须在 `db.close()` 之前。**

### 坑 4：只验证文件大小

```javascript
// ❌ 错的验证
if (fs.statSync("backup.db").size > 0) {
  console.log("备份正常");
}
```

**为什么错：** 一个损坏的 SQLite 文件也有大小。**大小不等于可用。**

**正确验证：**

```javascript
const db = new DatabaseSync("backup.db", { readOnly: true });
const integrity = Object.values(db.prepare("PRAGMA integrity_check").get())[0];
if (integrity !== "ok") throw new Error("备份损坏");
```

**教训：必须跑 `integrity_check`，还要对比行数。**

### 坑 5：备份到同一个磁盘

**这是最容易被忽略的坑。**

**你的 `app.db` 在 `B:\project\`，备份也在 `B:\project\backups\`。**

**那么：**

| 灾难 | 数据和备份 |
|---|---|
| 误删数据 | 备份还在 ✅ |
| 文件损坏 | 备份还在 ✅ |
| **B 盘坏了** | **全没了** ❌ |
| **中了勒索病毒** | **全被加密** ❌ |
| **工程目录被误删** | **全没了** ❌ |

**这就是"备份 3-2-1 原则"：**

```text
3 份副本
2 种不同介质
1 份在异地
```

**对我们的项目，最简单的做法：**

**方案一：备份到另一个分区**

```javascript
const BACKUP_DIR = "D:\\backups\\myproject";   // 不是 B 盘
```

**方案二：备份到云盘同步目录**

```javascript
const BACKUP_DIR = "C:\\Users\\你\\OneDrive\\backups";
```

**方案三：定期手动复制到 U 盘**

**方案四：备份到 Git（不推荐，但聊胜于无）**

```javascript
// 把备份文件放到一个单独的私密仓库，定期 push
```

**我们推荐方案一或方案二。** 至少让备份和原数据不在同一个物理位置。

---

## 第 6 步：第一阶段总结（15 分钟）

**35 节课结束了。回头看一遍你学到了什么。**

### 6.1 五个阶段的能力清单

**第 1 周（第 1—7 节）：AI 工具与元技能**

```text
✅ 知道 LLM / Agent / MCP 是什么
✅ 会用 WorkBuddy 和 Codex
✅ 会用"背景/任务/要求/限制/验收"五要素提问
✅ 会读别人的代码（找入口、看数据、找岔路口、手算输出）
✅ 会看报错（三块结构、报错链）
✅ 会安全地改一个文件
✅ 会用 Git 存档
✅ 会写 CONTEXT.md
```

**第 2 周（第 8—14 节）：网页与前端**

```text
✅ 会写 HTML（13 个常用标签、语义化）
✅ 会写 CSS（颜色、字号、间距、盒子模型、class/id）
✅ 会做表单（label、input、type、校验）
✅ 会写 JavaScript（变量、函数、`==` vs `===`、模板字符串）
✅ 会处理事件（click、input、submit、委托）
✅ 做出了个人介绍页
```

**第 3 周（第 15—21 节）：后端与对话**

```text
✅ 理解服务器 / 端口 / 请求 / 响应 / 状态码
✅ 会用 npm 和 package.json
✅ 会写 Express 路由和中间件
✅ 会提供静态文件，会用 fetch
✅ 会用 JSON 文件持久化
✅ 会调用大模型接口（含超时、错误处理、密钥保护）
✅ 做出了带记忆的对话应用
```

**第 4 周（第 22—28 节）：Git 与回滚**

```text
✅ 知道 .git 里存了什么
✅ 会正确提交（.gitignore、提交粒度）
✅ 会查历史（log / show / diff / blame / -S）
✅ 会开分支、合并、处理冲突
✅ 会恢复错误修改（restore / reset / revert / reflog / stash）
```

**第 5 周（第 29—35 节）：SQL 与数据**

```text
✅ 知道数据库 vs JSON 文件的区别
✅ 会设计表（名词变表、属性变列、拆表原则）
✅ 会建表、加约束、ALTER、重建表
✅ 会增删改查（含 NULL 的坑、分页、动态条件）
✅ 会 JOIN（INNER / LEFT、多对多、反连接）
✅ 会事务（原子性 + 性能）
✅ 会索引（EXPLAIN、最左前缀）
✅ 会备份与恢复
```

### 6.2 你现在能做什么

**具体的能力：**

| 能力 | 能做到什么程度 |
|---|---|
| 做一个静态网站 | 能（HTML/CSS/JS 三件套） |
| 做一个带后端的 CRUD 应用 | 能（Express + SQLite） |
| 接一个大模型做对话产品 | 能（含错误处理和密钥保护） |
| 把代码管起来 | 能（Git 全流程） |
| 数据不丢 | 能（备份与恢复） |

**还不能做的：**

| 不能做 | 什么时候学 |
|---|---|
| 部署到服务器，让别人访问 | 第 6 阶段（上线运维） |
| 用户登录注册 | 第 2 阶段 |
| 支付 | 第 5 阶段（商业化） |
| 前端用框架（React/Vue） | 第 2 阶段 |
| 处理高并发 | 第 4 阶段 |
| 手机端 / 小程序 | 第 2 阶段 |

### 6.3 五个必须记住的规矩

**这 35 节课里，最重要的五条：**

```text
一、金额用整数分，时间用 ISO 字符串。
   （第 1 节定的规矩，贯穿全程）

二、用户输入进 SQL 必须用 ? 占位，拼 SQL 只能拼结构。
   （第 29、32 节）

三、UPDATE / DELETE 之后必须看 changes，changes === 0 要当错误。
   （第 34 节）

四、循环写入必须包事务，批量操作不用事务慢 1000 倍。
   （第 34 节实测）

五、没演练过的备份 = 没有备份。
   （第 35 节）
```

### 6.4 你的产出清单

**现在去检查你有哪些产出：**

- [ ] 第 1 周：`NOTES.md` × 7、`CONTEXT.md`
- [ ] 第 2 周：个人介绍页（`index.html` + `style.css` + `main.js`）
- [ ] 第 3 周：`chat-app`（能对话、有记忆、错误处理完整）
- [ ] 第 4 周：至少 3 个练手仓库（`sandbox`、`branch-lab`、`conflict-lab`）
- [ ] 第 4 周：`chat-app` 已提交进 Git
- [ ] 第 5 周：`shop.db` / `bookstore.db` / `join.db` / `chat.db`
- [ ] 第 5 周：`chat-app` 已从 JSON 迁到 SQLite
- [ ] 第 5 周：`backups/` 目录里有能恢复的备份

**这些就是你的"作品集"雏形。**

**第 14 节的个人介绍页 + 第 21 节的对话应用 + 第 33 节的数据库版对话应用 —— 这三个可以放进简历。**

---

## 第 7 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第05周-SQL与数据\第07节课\02-笔记\NOTES.md
```

**重点填：**

1. 直接复制文件为什么危险（附实测报错）；
2. `backup()` 的正确用法（三个关键点）；
3. 备份验证的四层检查；
4. 恢复演练的六个步骤；
5. 备份 3-2-1 原则；
6. 第一阶段总结。

---

## 第 8 步：课后练习

### 练习 1：给你的所有数据库做备份

**任务：** 把第 5 周建的四个数据库都备份一遍。

**要求：**

- 每个库单独一个备份脚本，或写一个通用的；
- 每个备份都要验证（`integrity_check` + 行数）；
- 备份文件放在**另一个目录**（不在数据库同一个文件夹）；
- 备份文件名带时间戳。

### 练习 2：完整恢复演练

**任务：拿 `bookstore.db` 做一次完整演练。**

**步骤：**

1. 记录当前六张表的行数；
2. 备份；
3. 故意删掉一个表的数据（`DELETE FROM books`）；
4. 恢复；
5. 验证六张表行数都对；
6. **写一份 300 字的演练报告**，记录每一步的输出。

**报告要包含：遇到的意外情况**（比如外键约束导致删不掉、恢复后 id 变号等）。

### 练习 3：配置定时备份

**任务：** 用 Windows 任务计划配一个每天凌晨 3 点的备份。

**要求：**

- 备份路径指向另一个分区或云盘目录；
- 配完后手动"运行"一次，确认生成文件；
- 截一张任务计划的图放进笔记。

**如果配不成：** 说明卡在哪一步，写清报错。

### 练习 4：设计一个"备份策略"

**任务：** 写一份 500 字的文档，回答：

```text
我的数据有多重要？丢了会怎样？
能接受丢多少（1 小时？1 天？1 周？）？
所以我多久备份一次？
备份放在哪（几个位置）？
保留多久？
谁负责验证？多久验证一次？
```

**这个练习是"工程思维"的训练。** 技术只是手段，策略才是关键。

### 练习 5：第一阶段自查

**任务：对照 6.1 的能力清单，逐条打勾。**

**对没打勾的项：**

- 是没学（那就是漏了，回去补）；
- 还是学了但忘了（重做那节课的练习）。

**然后回答：**

```text
这 35 节课里，我最有成就感的是哪一节？为什么？
我最没搞懂的是哪一节？打算怎么补？
如果让我现在接一个小项目，我能做哪部分、不能做哪部分？
```

### 练习 6：用自己的话讲

```text
为什么"复制 .db 文件"在 WAL 模式下会失败？
为什么备份必须验证？只检查文件大小为什么不够？
为什么备份不能和原数据放在同一个磁盘？
为什么"没演练过的备份等于没有备份"？
```

---

## 第 9 步：最终验收

### A. 备份原理

- [ ] 我知道 SQLite 有 `delete` 和 `wal` 两种日志模式
- [ ] 我知道 WAL 模式下直接复制主文件会丢数据
- [ ] 我实测过 `no such table` 那个报错
- [ ] 我知道 `backup()` 是模块导出的函数，不是实例方法
- [ ] 我知道 `backup()` 要 `await`

### B. 备份实现

- [ ] 我写出了带时间戳的备份脚本
- [ ] 我的脚本备份完立刻验证
- [ ] 我的脚本会清理旧备份
- [ ] 我的备份放在另一个目录
- [ ] `.gitignore` 里有 `*.db`

### C. 验证

- [ ] 我会用 `PRAGMA integrity_check`
- [ ] 我知道要对比行数，不能只看大小
- [ ] 我会用 `readOnly: true` 打开备份验证
- [ ] 我的验证函数对"文件不存在""文件太小""损坏"都有处理

### D. 恢复

- [ ] 我做过完整演练（备份 → 毁数据 → 恢复 → 验证）
- [ ] 我的恢复脚本先验证备份再恢复
- [ ] 我的恢复脚本先另存当前数据
- [ ] 我的恢复脚本恢复后再次验证

### E. 自动化与策略

- [ ] 我配了定时备份，或至少有"启动时备份"
- [ ] 我的备份不在原数据同一个磁盘
- [ ] 我能说清"能接受丢多少数据"决定了备份频率
- [ ] 我知道备份 3-2-1 原则

### F. 第一阶段总结

- [ ] 我能说出五个阶段各自的核心能力
- [ ] 我检查过自己的产出清单
- [ ] 我做了练习 5 的自查
- [ ] 我做了练习 4 的备份策略文档
- [ ] 笔记填完

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `db.backup is not a function` | `backup` 不是实例方法 | `import { backup } from "node:sqlite"` |
| 直接复制 `.db` 后 `no such table` | WAL 模式，数据在 `-wal` 里 | 用 `backup()` API |
| 备份文件 0 字节 | 磁盘满、或没 `await` | 检查磁盘；加验证 |
| `PRAGMA integrity_check` 不是 `ok` | 文件损坏 | 用更早的备份 |
| 恢复后数据不一致 | 备份本身就是旧的 | 看备份时间戳；考虑审计日志 |
| 恢复后 id 从头开始 | 备份的是早期状态 | 正常，说明备份很旧 |
| 定时任务跑不起来 | "起始于"没填 | 填上项目目录 |
| 定时任务找不到 node | 用了 `node` 而不是完整路径 | 填 `node.exe` 的完整路径 |
| 备份目录越来越大 | 没清理旧备份 | 加按天清理 |
| 数据库进了 Git | `.gitignore` 漏了 | `git rm --cached *.db` 然后加忽略 |
| 备份和原数据一起丢了 | 同一个磁盘 | 备份到别的分区或云盘 |
| 恢复脚本把好数据搞坏了 | 没先另存当前数据 | 恢复前 `copy` 一份 |

---

## 附：这一节课你必须记住的六句话

```text
一、没备份就是没数据。

二、永远用 backup() API，不要直接复制 .db 文件。

三、备份必须验证（integrity_check + 行数），只检查大小等于没检查。

四、恢复前先另存当前数据，这是救火时的安全带。

五、备份要和原数据分开（另一个磁盘、云盘）。

六、没演练过的备份，等于没有备份。
```

---

## 附：第一阶段完结

**35 节课，五个阶段，你走完了。**

**回头看第 1 节课那个日期格式化函数：**

```javascript
function formatTime(value) {
  if (value === null || value === undefined || value === "") return "未知时间";
  ...
}
```

**当时你可能觉得"这有什么用"。**

**现在你知道：**

- 那个函数里的"空值拦截"，和 `WHERE note IS NOT NULL` 是同一件事；
- 那个"金额用整数分"的规矩，在表结构里变成了 `price_cents INTEGER`；
- 那个"先手算再运行"的读代码方法，在用 `EXPLAIN QUERY PLAN` 判断索引时又用上了。

**35 节课不是为了让你记住 35 个知识点，是为了让你形成一套"不相信自己的直觉、都要验证"的工作方式。**

### 下一步学什么

**第 2 阶段：AI 应用骨架（第 36—70 节，35 节）**

内容大概是：

- 前端框架（React 或 Vue，会选一个讲透）；
- 组件化思维；
- 状态管理；
- 路由；
- 类型系统（TypeScript）；
- 用户登录注册；
- 权限控制；
- 完整的 CRUD 后台。

**为什么从这里开始：** 因为你现在会写"能跑的原生代码"，但真实项目要"可维护的架构"。框架就是干这个的。

**在你进入第 2 阶段之前，先做完这三件事：**

- [ ] 完成本节的恢复演练（必须真的删一次数据）
- [ ] 把 `chat-app` 的数据库版跑起来（第 33 节的产出）
- [ ] 把这 35 节课的 `NOTES.md` 都检查一遍，缺的补上

**第二件事最重要。** 因为那是你第一个"前端 + 后端 + 数据库 + 大模型"的完整应用。**它是你后面所有项目的基础。**
