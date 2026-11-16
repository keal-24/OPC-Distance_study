# 第 68 节课：缩略图——让列表页从 6MB 变成 200KB

> **这份文件是你（学员）一步一步照着做的手册。**
> 上节课你把 12MB 压到了 300KB。但列表页加载 20 张 300KB 的图，还是 6MB。
> 今天做缩略图：**300px 宽，8-15KB 一张。20 张 200KB。**

**建议用时**：155 分钟
**你需要先完成**：第 67 节课（压缩能用，数据库有 `width`/`height`）

---

# 第 0 步：先量一下"不做的代价"（10 分钟）

## 0.1 一个能算的数字

**你现在的列表页（第 66 节的 `files.html`）：**

```javascript
const previewUrl = file.thumbUrl || file.url;   // thumbUrl 还是 null
```

**所以它加载的是原图（压缩后的 300KB）。**

**20 张 × 300KB = 6MB。**

**在 4G 网络下（实际下载约 1MB/s）：6 秒。**

**在弱网下（200KB/s）：30 秒。**

**用户看到的是：一片空白，慢慢一个个冒出来。**

## 0.2 缩略图能省多少

**300px 宽、质量 75 的 JPEG：约 8-15KB。**

**20 张 × 10KB = 200KB。**

| 方案 | 20 张总传输 | 4G | 弱网 |
|---|---|---|---|
| 原图（压缩后） | 6 MB | 6 秒 | 30 秒 |
| 缩略图 300px | 200 KB | 0.2 秒 | 1 秒 |

**30 倍。**

**这就是"必须做缩略图"的全部理由。**

## 0.3 为什么"前端缩放显示"不算数

**有人会想：**

```html
<img src="/api/files/1/raw" style="width: 300px" />
```

**图片还是原图（300KB），只是显示成 300px。**

**问题：**

```text
① 网络传输一点没省（300KB 还是 300KB）
② 浏览器要解码原图（1600×1200）→ 约 7.7MB 位图内存
③ 20 张 = 154MB 内存 → 移动端会崩
```

**前端缩放只解决"看起来小"，不解决"传输和解码的代价"。**

**必须服务端生成真的小图。**

## 0.4 今天做两种尺寸

| 尺寸 | 用途 | 参数 |
|---|---|---|
| **small** | 列表网格、头像 | 300px，q75 |
| **medium** | 详情页预览 | 800px，q80 |

**为什么不做更多：**

**每多一种尺寸，就多一份磁盘占用、多一次编码耗时。**

**两种覆盖 95% 的场景。**

**真实项目里电商可能需要三种（列表/详情/放大镜），按业务定，不要"预防性地"生成 6 种。**

## 0.5 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/image.js` | `src/` | 加 `THUMB_SPECS` / `makeThumb` |
| `src/thumbs.js` | `src/` | 缩略图管理（生成/查找/删除） |
| `src/files.js` | `src/` | 加 `updateFileThumbs` |
| `src/files-routes.js` | `src/` | 改：上传后生成 + `thumb` 接口 |
| `public/files.html` | `public/` | 改：用 small 缩略图 |
| `scripts/rebuild-thumbs.js` | `scripts/` | 为老文件补生成 |
| `results/e05.md` | `results/` | 前后传输量对比 |

---

# 第 1 步：加缩略图生成（25 分钟）

## 1.1 在 `src/image.js` 里加

**打开 `src/image.js`，在末尾加：**

```javascript
/** 缩略图规格。改这里就能调所有尺寸。 */
export const THUMB_SPECS = {
  small: { maxSide: 300, quality: 75 },
  medium: { maxSide: 800, quality: 80 },
};

/**
 * 生成一张缩略图。
 * 返回 { ok, width, height, size }
 */
export const makeThumb = async ({ inputPath, outputPath, size = "small" }) => {
  const spec = THUMB_SPECS[size];

  if (!spec) {
    return { ok: false, reason: "UNKNOWN_SIZE" };
  }

  return compressImage({
    inputPath,
    outputPath,
    maxSide: spec.maxSide,
    quality: spec.quality,
  });
};
```

## 1.2 为什么复用 `compressImage`

**缩略图和压缩的技术细节完全一样（rotate、resize、jpeg quality）。**

**区别只有参数。**

**复用意味着：**

```text
① 第 67 节修好的 bug（rotate 顺序、withoutEnlargement）自动生效
② 以后换引擎只改一处
```

**如果你重写一遍 resize 逻辑，将来改了 `compressImage` 的默认参数，缩略图不会跟着变 —— 两个地方行为不一致，很难查。**

## 1.3 为什么规格放 `image.js` 不放 `thumbs.js`

**"300px 质量 75"是图片编码参数，属于技术层。**

**放 `image.js` 里，和 `compressImage` 的默认值放在一起，改的时候一眼能对比。**

**`thumbs.js` 只负责"文件在哪、叫什么、什么时候删" —— 业务层。**

**边界清楚。**

---

# 第 2 步：写缩略图管理（30 分钟）

## 2.1 新建 `src/thumbs.js`

```javascript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeThumb, THUMB_SPECS } from "./image.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const ORIGINAL_DIR = path.join(ROOT, "uploads", "originals");
const THUMB_DIR = path.join(ROOT, "uploads", "thumbs");

export const ensureThumbDir = () => {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
};

/**
 * 缩略图的存储键。可从 storage_key 反推。
 * 例：abc.jpg + small → abc.small.jpg
 */
export const thumbKeyOf = (storageKey, size) =>
  `${String(storageKey).replace(/\.[a-z0-9]{1,8}$/i, "")}.${size}.jpg`;

/**
 * 为一个原图生成所有规格的缩略图。
 *
 * 返回 {
 *   small: "abc.small.jpg" | null,
 *   medium: "abc.medium.jpg" | null,
 *   generated: [{ size, key, width, height, bytes, ms }],
 *   failed: [{ size, reason }]
 * }
 */
export const generateThumbs = async ({ storageKey }) => {
  ensureThumbDir();

  const inputPath = path.join(ORIGINAL_DIR, storageKey);
  const result = { small: null, medium: null, generated: [], failed: [] };

  if (!fs.existsSync(inputPath)) {
    result.failed.push({ size: "all", reason: "NO_SOURCE" });
    return result;
  }

  for (const size of Object.keys(THUMB_SPECS)) {
    const key = thumbKeyOf(storageKey, size);
    const outputPath = path.join(THUMB_DIR, key);
    const started = Date.now();

    const thumb = await makeThumb({ inputPath, outputPath, size });

    if (thumb.ok) {
      result[size] = key;
      result.generated.push({
        size,
        key,
        width: thumb.width,
        height: thumb.height,
        bytes: thumb.size,
        ms: Date.now() - started,
      });
    } else {
      result.failed.push({ size, reason: thumb.reason || "FAILED" });
      await fs.promises.unlink(outputPath).catch(() => {});
    }
  }

  return result;
};

/** 找缩略图路径。不存在返回 null。 */
export const findThumbPath = (storageKey, size) => {
  const filePath = path.join(THUMB_DIR, thumbKeyOf(storageKey, size));
  return fs.existsSync(filePath) ? filePath : null;
};

/** 删掉一个原图的所有缩略图（不依赖数据库字段）。 */
export const removeThumbs = async (storageKey) => {
  const removed = [];

  for (const size of Object.keys(THUMB_SPECS)) {
    const filePath = path.join(THUMB_DIR, thumbKeyOf(storageKey, size));

    try {
      await fs.promises.unlink(filePath);
      removed.push(size);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`[thumbs] 删除失败 ${filePath}：`, error.message);
      }
    }
  }

  return removed;
};
```

## 2.2 四个关键设计

### 设计一：文件名可反推

```javascript
`${storageKey.replace(/\.[a-z0-9]{1,8}$/i, "")}.${size}.jpg`
```

**`abc.jpg` + `small` → `abc.small.jpg`**

**为什么这么设计：**

```text
① 从 storage_key 能直接算出缩略图名（不用查数据库）
② 删原图时能顺手删掉所有缩略图
③ 补生成时能判断"已存在就不用再生成"
④ 数据库丢了也能从磁盘重建映射关系
```

**对比"缩略图用随机名"：**

**随机名必须查数据库才知道对应关系。**

**而"可反推"让文件系统操作不依赖数据库 —— 这在补生成、清理时会大幅简化代码。**

### 设计二：失败时删掉半成品

```javascript
await fs.promises.unlink(outputPath).catch(() => {});
```

**为什么：**

**`sharp` 编码中途失败时，可能已创建文件但没写完。**

**这个"半个文件"如果被读到，是破图。**

**删掉，`findThumbPath` 返回 null，前端能降级。**

**"没缩略图"比"坏缩略图"好。**

### 设计三：返回 `generated` 和 `failed` 两个数组

**为什么不只返回成功/失败布尔：**

**你需要知道"哪个尺寸成功了"。**

**场景：`small` 成功、`medium` 因内存失败。**

**数据库要存 `thumb_small`（有值）、`thumb_medium`（null）。**

**布尔分不清。**

### 设计四：`removeThumbs` 不依赖数据库字段

```javascript
export const removeThumbs = async (storageKey) => { ... }
```

**只传 `storageKey`，就能算出所有缩略图名。**

**为什么重要：**

**第 66 节的 `softDeleteFile` 是按数据库字段（`thumb_small`）删的。**

**如果数据库字段是 null（比如缩略图生成失败过），就删不掉磁盘上的残留。**

**`removeThumbs(storageKey)` 兜底：不管数据库怎么说，按命名规则全删。**

---

# 第 3 步：接进上传流程（30 分钟）

## 3.1 在 `src/files.js` 里加 `updateFileThumbs`

```javascript
export const updateFileThumbs = (id, { thumbSmall, thumbMedium }) => {
  db.prepare("UPDATE files SET thumb_small = ?, thumb_medium = ? WHERE id = ?").run(
    thumbSmall || null,
    thumbMedium || null,
    Number(id)
  );
};
```

## 3.2 改 `files-routes.js` 的上传接口

**在 `createFile(...)` 之后加：**

```javascript
import { generateThumbs } from "./thumbs.js";
import { createFile, getFileById, updateFileThumbs } from "./files.js";

// ... record = createFile({ ... }); 之后 ...

  // 生成缩略图（失败不影响上传）
  if (kind === "image") {
    try {
      const thumbs = await generateThumbs({ storageKey: finalKey });

      updateFileThumbs(record.id, {
        thumbSmall: thumbs.small,
        thumbMedium: thumbs.medium,
      });

      if (thumbs.generated.length > 0) {
        console.log(
          `[upload] 缩略图 ${finalKey}: ` +
            thumbs.generated.map((item) => `${item.size}=${item.bytes}B`).join(" ")
        );
      }

      if (thumbs.failed.length > 0) {
        console.warn(
          `[upload] 缩略图部分失败 ${finalKey}: ` +
            thumbs.failed.map((item) => `${item.size}(${item.reason})`).join(" ")
        );
      }

      record = getFileById(record.id);
    } catch (error) {
      console.warn(`[upload] 生成缩略图异常（不影响上传）：`, error.message);
    }
  }
```

## 3.3 为什么在 `createFile` 之后

**如果先做缩略图再入库：**

```text
缩略图生成失败 → 抛错 → 文件已搬但没入库 → 孤儿文件
```

**先入库（核心），再补缩略图（增强）：**

```text
入库成功 → 缩略图失败 → 文件可用（列表加载原图）→ 下次补生成
```

**用户的文件一定在，只是"快"和"慢"的区别。**

## 3.4 加 `thumb` 读取接口

**在 `files-routes.js` 的 `/:id/raw` 旁边：**

```javascript
import { findThumbPath, ensureThumbDir } from "./thumbs.js";

filesRouter.get("/:id/thumb", (req, res) => {
  const size = ["small", "medium"].includes(req.query.size) ? req.query.size : "small";
  const file = getFileById(req.params.id);

  if (!file || file.deletedAt) {
    return res.status(404).json({ error: "文件不存在" });
  }

  // 归属检查（和第 66 节一致）
  if (file.userId !== req.user.id) {
    return res.status(404).json({ error: "文件不存在" });
  }

  const thumbPath = findThumbPath(file.storageKey, size);

  if (!thumbPath) {
    // 没有缩略图：302 到原图，前端永远能拿到一张图
    return res.redirect(302, `/api/files/${file.id}/raw`);
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");

  fs.createReadStream(thumbPath).pipe(res);
});
```

## 3.5 三个关键点

### 关键点一：没有缩略图时 302 到原图，不是 404

```javascript
return res.redirect(302, `/api/files/${file.id}/raw`);
```

**为什么：**

**前端 `<img src="/api/files/1/thumb?size=small">`。**

**返回 404 → 页面上是破图。**
**302 到原图 → 用户至少能看到图，只是大一点。**

**"慢"比"破"好。**

### 关键点二：缩略图缓存 1 天，原图只 1 小时

```javascript
res.setHeader("Cache-Control", "private, max-age=86400");
```

**为什么缩略图能更长：**

**缩略图是"派生数据"，内容不会变。而原图理论上可能被替换（虽然这个系统不支持）。**

**更重要的是：**

**列表页会被反复打开。缩略图缓存住，第二次打开是 0 请求。**

**这是"体验提升"最大的单点 —— 一行头，换掉所有重复加载。**

**注意 `private`：第 66 节讲过，带鉴权的资源不能用 `public`。**

### 关键点三：`ensureThumbDir` 在上传时调过

**注意这里没有 import 用途 —— 目录在上传时已建。**

**但如果用户直接访问 `thumb` 接口（比如页面打开时老文件还没缩略图），`findThumbPath` 里的 `existsSync` 会安全返回 false，不会报错。**

**所以读路径不需要建目录。**

**写路径（`generateThumbs`）才需要。**

## 3.6 测试

**1. 上传一张照片。**

**终端应该看到：**

```text
[upload] xxx.jpg: 3245678 → 312456 字节（sharp）
[upload] 缩略图 xxx.jpg: small=8245B medium=52310B
```

**2. 检查磁盘：**

```text
dir uploads\thumbs
```

**应该有 `xxx.small.jpg` 和 `xxx.medium.jpg`。**

**3. 查数据库：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,storage_key,thumb_small,thumb_medium FROM files ORDER BY id DESC LIMIT 3').all()))"
```

**两个 thumb 字段应该有值。**

## 3.7 改列表页

**打开 `public/files.html`，找到：**

```javascript
const previewUrl = file.thumbUrl || file.url;
```

**改成：**

```javascript
// 优先 small（列表用小图），没有回退原图
const previewUrl = file.thumbSmall
  ? `/api/files/${file.id}/thumb?size=small`
  : file.url;
```

**为什么用 `small` 不用 `medium`：**

**列表格子是 180px 宽，`small`（300px）够用且更小。**

**`medium` 留给详情页/大图预览。**

**刷新列表，F12 看 Network：**

**应该看到一堆 `/api/files/N/thumb?size=small`，每个 8-15KB。**

**总传输量从 6MB 降到 200KB 左右。**

---

# 第 4 步：写补生成脚本（25 分钟）

## 4.1 为什么需要

**三种情况会让老文件没缩略图：**

```text
① 第 67 节之前上传的文件（那时还没这功能）
② 缩略图生成失败的文件
③ 缩略图被误删的文件
```

**手动一个个重传很蠢。**

## 4.2 新建 `scripts/rebuild-thumbs.js`

```javascript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/db.js";
import { generateThumbs, thumbKeyOf } from "../src/thumbs.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const THUMB_DIR = path.join(ROOT, "uploads", "thumbs");

const force = process.argv.includes("--force");
const apply = process.argv.includes("--apply");

const main = async () => {
  console.log(`模式：${apply ? "执行" : "只检查（加 --apply 执行）"}${force ? "，强制重建" : ""}\n`);

  const rows = db
    .prepare(
      `SELECT id, storage_key, original_name
       FROM files
       WHERE deleted_at IS NULL AND kind = 'image'
       ORDER BY id`
    )
    .all();

  const todo = [];

  rows.forEach((row) => {
    const smallExists = fs.existsSync(path.join(THUMB_DIR, thumbKeyOf(row.storage_key, "small")));
    const mediumExists = fs.existsSync(path.join(THUMB_DIR, thumbKeyOf(row.storage_key, "medium")));

    if (force ? false : smallExists && mediumExists) return;

    todo.push({
      row,
      missing: [
        force || !smallExists ? "small" : null,
        force || !mediumExists ? "medium" : null,
      ].filter(Boolean),
    });
  });

  console.log(`图片总数：${rows.length}　需要处理：${todo.length}\n`);

  if (todo.length === 0) {
    console.log("全部完整，无需处理。");
    return;
  }

  todo.forEach((item) => {
    console.log(`  #${item.row.id} ${item.row.storage_key}　缺 ${item.missing.join(" ")}`);
  });

  if (!apply) {
    console.log("\n（没有生成任何文件。加 --apply 执行）");
    return;
  }

  console.log("\n开始生成……\n");

  const update = db.prepare("UPDATE files SET thumb_small = ?, thumb_medium = ? WHERE id = ?");
  let ok = 0;
  let fail = 0;
  let totalBytes = 0;

  for (const item of todo) {
    const result = await generateThumbs({ storageKey: item.row.storage_key });

    if (result.generated.length > 0) {
      update.run(result.small, result.medium, item.row.id);

      const bytes = result.generated.reduce((sum, entry) => sum + entry.bytes, 0);
      totalBytes += bytes;
      ok += 1;

      console.log(
        `  ✅ #${item.row.id}　${result.generated.map((e) => `${e.size}=${e.bytes}B`).join(" ")}`
      );
    } else {
      fail += 1;
      console.log(
        `  ❌ #${item.row.id}　${result.failed.map((e) => `${e.size}(${e.reason})`).join(" ")}`
      );
    }
  }

  console.log(`\n完成：成功 ${ok}，失败 ${fail}，共生成 ${(totalBytes / 1024).toFixed(1)} KB`);
};

main().catch((error) => {
  console.error("跑挂了：", error.message);
  process.exitCode = 1;
});
```

## 4.3 加脚本

```json
    "thumbs:rebuild": "node --env-file=.env scripts/rebuild-thumbs.js"
```

## 4.4 三个关键点

### 关键点一：默认只检查

**和第 66 节 `clean-orphans` 一致。**

**这个脚本会写磁盘。参数写错（比如没原图还跑 `--force`）会浪费时间。**

**先看清单，确认后再执行。**

### 关键点二：`--force` 的场景

**默认只补"缺的"。**

**但改了 `THUMB_SPECS` 之后，所有老缩略图尺寸都不对了，要全部重建。**

**`npm run thumbs:rebuild` 会跳过（因为文件存在）。**

**`node scripts/rebuild-thumbs.js --force --apply` 才全重建。**

### 关键点三：只处理 `kind = 'image'`

```sql
WHERE deleted_at IS NULL AND kind = 'image'
```

**PDF 不需要缩略图（第 69 节用别的方式预览）。**

**不筛的设计会尝试给 PDF 生成缩略图 —— `sharp` 处理 PDF 需要额外的依赖（poppler），默认不支持，会全部失败。**

## 4.5 测试

**1. dry-run：**

```text
npm run thumbs:rebuild
```

**应该列出缺缩略图的老文件。**

**2. 执行：**

```text
node --env-file=.env scripts/rebuild-thumbs.js --apply
```

**逐个生成。**

**3. 再跑 dry-run：**

**应该显示"全部完整，无需处理"。**

**这就是幂等。**

---

# 第 5 步：五个必须知道的坑（30 分钟）

## 坑 1：列表还是加载原图

**原因：`thumbSmall` 是 null（老文件没缩略图）。**

**排查：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,thumb_small,thumb_medium FROM files').all()))"
```

**有 null 就 `npm run thumbs:rebuild`。**

**注意：前端代码 `file.thumbSmall ? ... : file.url` 的回退是故意的（不是 bug）。**

**但生产环境里，你应该让所有文件都有缩略图，不该长期依赖回退。**

## 坑 2：`ERR_TOO_MANY_REDIRECTS`

**如果你把 302 写成重定向到自己：**

```javascript
// 错
return res.redirect(302, `/api/files/${file.id}/thumb`);
```

**浏览器无限重定向。**

**修法：目标必须是 `/raw`。**

**排查：F12 → Network 里会看到同一个 URL 反复请求。**

## 坑 3：缩略图比原图大

**场景：原图是 100×100 的 PNG 图标。**

**`maxSide: 300` + `withoutEnlargement` 不会放大，所以缩略图是 100×100 的 JPEG q75。**

**如果原 PNG 很小（5KB），转 JPEG 可能变成 8KB。**

**验证：**

**上传一个小 PNG，对比数据库 `size` 和缩略图文件大小。**

**这一周不做优化（罕见）。真实项目里的处理：**

```javascript
if (thumb.size >= originalSize) {
  thumbs.small = null;   // 不用缩略图
}
```

## 坑 4：删了文件，缩略图还在

**第 66 节的 `softDeleteFile` 是按数据库字段删的。**

**如果 `thumb_small` 是 null（生成失败过），就删不掉磁盘残留。**

**修法：在 `softDeleteFile` 里加一次按命名反推的删除。**

**改 `src/files.js`：**

```javascript
import { removeThumbs } from "./thumbs.js";

// 在 softDeleteFile 里，删完数据库、删完原图之后：
if (row.kind === "image") {
  const removed = await removeThumbs(row.storage_key);
  removed.forEach((size) => {
    if (!deletedKeys.includes(size)) deletedKeys.push(`thumb:${size}`);
  });
}
```

**这样即使数据库字段是 null，也能删干净（因为文件名可反推）。**

**这正是"命名可反推"的价值 —— 让数据不一致时还能兜底。**

## 坑 5：`max-age` 太长 + id 复用

**SQLite 的 `AUTOINCREMENT` 保证 id 不复用。**

**如果你用了 `INTEGER PRIMARY KEY`（不带 `AUTOINCREMENT`），删掉最后一条后，新插入的会复用那个 id。**

**然后：**

```text
用户删了文件 5，又传了新文件（id 还是 5）
浏览器缓存里 /api/files/5/thumb 还是旧图
→ 显示的是删掉的那张
```

**这个 bug 极难查（"我明明删了"）。**

**检查你的建表语句：**

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT   -- ✅ 严格递增，不复用
id INTEGER PRIMARY KEY                 -- ⚠️ 可能复用
```

**第 66 节的迁移里写的是 `AUTOINCREMENT`，所以没问题。**

**但你以后建表要记得。**

---

# 第 6 步：故意做五个实验（30 分钟）

## 实验 1：传输量对比（核心）

**1. 先记录"用原图"：**

**临时改成：**

```javascript
const previewUrl = file.url;
```

**F12 → Network → 勾 Disable cache → 刷新 → 看最下面的总大小。**

**记下（比如 `6.2 MB`）。**

**2. 改回缩略图：**

```javascript
const previewUrl = file.thumbSmall ? `/api/files/${file.id}/thumb?size=small` : file.url;
```

**同样勾 Disable cache，刷新，看总大小。**

**记下（比如 `186 KB`）。**

**3. 算倍数。这是本周最有说服力的数字。**

## 实验 2：删掉缩略图看 302

```text
del uploads\thumbs\*.small.jpg
```

**刷新列表。**

**图还能显示（302 到原图），但 Network 里那些请求是 `302` 然后跟 `200`。**

**这就是"降级可用"。**

**用 `thumbs:rebuild --apply` 恢复。**

## 实验 3：`--force` 重建

**把 `THUMB_SPECS.small.maxSide` 从 300 改成 200。**

**跑 `npm run thumbs:rebuild` → "全部完整"（因为文件还在）。**

**跑 `node scripts/rebuild-thumbs.js --force --apply` → 全部重建。**

**验证尺寸：**

```text
node --env-file=.env -e "import('./src/image.js').then(async m => console.log(await m.readImageMeta({inputPath:'uploads/thumbs/这里填文件名.small.jpg'})))"
```

**应该是 200px。**

**改回 300，重建。**

## 实验 4：竖拍方向

**上传一张竖拍手机照片。**

**对比 `originals/xxx.jpg` 和 `thumbs/xxx.small.jpg`。**

**两个都应该是竖的。**

## 实验 5：第二次打开走缓存

**1. 正常刷新列表（第一次），F12 看请求数和总大小。**

**2. 再刷新一次（不清缓存），看请求数。**

**应该全是 `(disk cache)` 或 `(memory cache)`，传输量接近 0。**

**这就是 `max-age=86400` 的效果。**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 原图 vs 缩略图的传输量（两个数字 + 倍数）
2. small / medium 的实际大小
3. 302 降级的效果
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：改 `toDto` 加 `thumbSmallUrl`

**要求：**

```javascript
thumbSmallUrl: row.thumb_small ? `/api/files/${row.id}/thumb?size=small` : null,
```

**然后前端直接用 `file.thumbSmallUrl || file.url`。**

**为什么：**

**URL 格式应该只有后端知道。前端拼是耦合。**

## 练习二：加 `large`（1200px）并想清楚一个问题

**要求：** 加 `large: { maxSide: 1200, quality: 82 }`。

**然后回答：**

```text
什么时候用 large？
它和"压缩后的原图"（1600px）有什么区别？
如果只需要 1200px，为什么上传时要压到 1600px？
```

**这个问题引出一个真实的设计选择：**

**方案 A（现在）：上传时压到 1600，生成 300/800 两种缩略图。详情页用 1600，列表用 300。**

**方案 B：上传时存原图（12MB），生成 300/800/1600 三种。详情页用 1600，下载用原图。**

| | A | B |
|---|---|---|
| 磁盘 | 小（300KB） | 大（12MB） |
| 详情页质量 | 1600（压过） | 1600（从原图生成，更清晰） |
| 保留原图 | ❌ | ✅ |
| 用户体验 | 够用 | 可以下载高清 |

**电商选 B（用户要高清），社交选 A（省钱）。**

**你的项目要哪个？写进笔记。**

## 练习三：加懒加载

**要求：** 列表用 `<img loading="lazy">` 代替 `background-image`。

```html
<div class="pic">
  <img src="..." loading="lazy" style="width:100%;height:100%;object-fit:cover" />
</div>
```

**为什么：**

**一次显示 20 张，但用户只看到前 6 张。`loading="lazy"` 让浏览器"滚到附近才加载"，省 70% 请求。**

**零成本优化 —— 加一个属性。**

**注意：**

**改完要处理 `<img>` 的样式（`object-fit: cover` 让图片填满格子不变形）。**

## 练习四：想清楚这四个问题

```text
1. 为什么缩略图文件名要能"从 storage_key 反推"？
2. 为什么 thumb 接口 302 到原图而不是 404？
3. 为什么缩略图缓存 1 天而原图只 1 小时？
4. 为什么缩略图生成失败不能影响上传？
```

---

# 第 9 步：最终验收

## A. 代码

- [ ] `image.js` 有 `THUMB_SPECS` / `makeThumb`
- [ ] `thumbs.js` 有 `generateThumbs` / `findThumbPath` / `removeThumbs` / `thumbKeyOf`
- [ ] 上传后生成缩略图并更新数据库
- [ ] 缩略图失败不影响上传
- [ ] `thumb` 接口有归属检查
- [ ] 没有缩略图时 302 到原图
- [ ] `Cache-Control: private, max-age=86400`
- [ ] `rebuild-thumbs.js` 默认 dry-run，支持 `--force`

## B. 实测

- [ ] `thumbs/` 里有 `.small.jpg` 和 `.medium.jpg`
- [ ] 数据库 `thumb_small` / `thumb_medium` 有值
- [ ] 列表页用 small
- [ ] 传输量从 MB 降到 200KB 级（记下两个数字）
- [ ] 删掉缩略图后 302 降级可用
- [ ] `rebuild-thumbs` 能补生成
- [ ] 竖拍方向正确
- [ ] 第二次刷新几乎 0 传输（缓存生效）

## C. 认知

- [ ] 我知道"前端缩放"为什么不省流量
- [ ] 我知道为什么只做两种尺寸
- [ ] 我知道命名可反推的价值
- [ ] 我知道 302 降级和 `max-age` 的作用

## 本节课要能说出口的一句话

> **列表页加载原图是 6MB，加载缩略图是 200KB。30 倍的差距，用户感受是"卡"和"秒开"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 列表还是原图 | `thumbSmall` 是 null | 跑 `thumbs:rebuild` |
| 缩略图方向错 | 没走 `compressImage` | 检查是否复用 |
| `ERR_TOO_MANY_REDIRECTS` | 302 到自己 | 改成 `/raw` |
| 缩略图比原图大 | 原图本来就小 | 接受，或用练习的方案 |
| 删了文件缩略图还在 | 只按数据库字段删 | 加 `removeThumbs` |
| 新图显示旧图 | id 复用 | 用 `AUTOINCREMENT` |
| 没生成也没报错 | 异常被 catch | 看 `[upload]` 日志 |
| `rebuild` 说全完整 | 文件在但内容旧 | 加 `--force` |
| PDF 也尝试生成 | 没筛 `kind` | `WHERE kind = 'image'` |
| 第二次还是全下载 | 没缓存 | 检查 `Cache-Control` |
