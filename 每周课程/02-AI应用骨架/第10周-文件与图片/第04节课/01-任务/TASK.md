# 第 67 节课：图片压缩——12MB 压到 300KB，画质还够用

> **这份文件是你（学员）一步一步照着做的手册。**
> 上节课你的文件能存了。但一张手机照片 12MB，直接给前端加载，20 张就是 240MB。
> 今天压到 300KB，并且**自己用眼睛判断"能不能接受"**。

**建议用时**：160 分钟
**你需要先完成**：第 66 节课（`files` 表有记录，列表能显示）

---

# 第 0 步：先搞清楚在压什么（15 分钟）

## 0.1 一张手机照片的真相

**iPhone 14 拍的 4032×3024 照片：**

```text
格式：HEIC（默认）或 JPEG（兼容模式）
大小：3-5MB（HEIC），8-15MB（JPEG）
像素：1220 万
```

**你在网页上要显示多大：**

```text
详情页大图：1200px 宽足够（占屏幕 1/3）
列表缩略图：300px 宽足够
```

**所以：**

```text
1220 万像素 → 只需要 144 万像素（1200×900）
减少 88% 的像素
```

**像素减少，文件自然小。这是"第一层压缩"，无损感知。**

**第二层是"降低 JPEG 质量"：质量 95 → 82，文件再小一半，肉眼几乎看不出。**

**两者叠加：12MB → 300KB，40 倍。**

## 0.2 三个参数，各自的代价

| 参数 | 作用 | 副作用 |
|---|---|---|
| **最大边长** | 超过就等比缩小 | 太小会糊（尤其文字截图） |
| **JPEG 质量** | 1-100，越低文件越小 | 太低有"方块噪点"（尤其渐变区域） |
| **格式** | JPEG / WEBP / AVIF | WEBP 更小但兼容性略差（现在都支持） |

**这一周用 JPEG，质量 82，最大边 1600。**

**为什么不用 WEBP：**

```text
① 同质量下 WEBP 比 JPEG 小 25-35%
② 但 sharp 编码 WEBP 更慢（CPU 成本）
③ 而且用户下载后可能要在老软件里打开（JPEG 兼容性绝对）
```

**真实项目里 WEBP 值得用（省流量=省钱）。这一周先用 JPEG 把流程跑通。**

**练习里会让你改成 WEBP 并对比。**

## 0.3 一个必须处理的坑：EXIF 方向

**手机拍照时，传感器是横的。竖着拍的照片，实际存储是横的，但在 EXIF 里标记"要旋转 90°"。**

**如果不处理：**

```text
用户上传竖拍的照片
→ 网站上显示成横的（躺倒）
→ 用户投诉
```

**处理方式：**

```javascript
sharp(buffer).rotate()   // 不带参数 = 按 EXIF 自动旋转
```

**这一行是必须的。** 不写的话，所有竖拍照片都是躺倒的。

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/image.js` | `src/` | 可替换的图片处理层 |
| `src/files-routes.js` | `src/` | 改：上传后压缩 |
| `experiments/e04-compress.js` | `experiments/` | 三档参数对比 |
| `results/e04.md` | `results/` | 数据 + 主观判断 |

---

# 第 1 步：装图片库（20 分钟）

## 1.1 先试 sharp

```text
npm install sharp
```

**两种结果：**

### 结果一：成功

```text
added 20 packages
```

**直接跳到 1.3。**

### 结果二：失败

**常见报错：**

```text
Error: Could not load the "sharp" module using the win32-x64 runtime
npm ERR! sharp: Installation error: unable to verify the first certificate
gyp ERR! stack Error: `gyp` failed with exit code: 1
```

**原因（三种）：**

```text
① 网络问题（要下预编译二进制，可能被墙）
② Node 版本太新，没有对应的预编译包
③ Windows 缺 Visual C++ 运行库（只有源码编译才需要）
```

**如果你遇到失败，不要在这上面耗。**

**装 `jimp` 代替：**

```text
npm install jimp
```

**`jimp` 是纯 JS，一定能装，但慢 5-10 倍。**

**这一周的设计让你"两个都能用"，见 1.3。**

## 1.2 验证

**sharp：**

```text
node -e "const s = require('sharp'); console.log('sharp ok', s.versions)"
```

**jimp：**

```text
node -e "const { Jimp } = require('jimp'); console.log('jimp ok')"
```

**注意：**

**新版 `jimp`（v1.x）是 ESM 风格，导入方式变了：**

```javascript
// jimp v1
import { Jimp } from "jimp";

// jimp v0.x（旧版）
import Jimp from "jimp";
```

**看你装的是哪个版本：**

```text
npm ls jimp
```

**如果显示 `jimp@0.x`，用 `import Jimp from "jimp"`。**

**这一周的代码按 v1 写（新项目应该用新版）。**

## 1.3 写可替换的抽象层

**新建 `src/image.js`：**

```javascript
/**
 * 图片处理。优先 sharp，失败降级 jimp，都失败就跳过压缩。
 *
 * 为什么要有这一层：
 * ① sharp 在某些环境装不上（Windows / 网络 / Node 版本）
 * ② 业务代码不该关心"用哪个库"
 * ③ 以后换库只改这个文件
 */

let engine = null;

const initEngine = async () => {
  if (engine !== null) return engine;

  try {
    const sharpModule = await import("sharp");
    engine = { name: "sharp", lib: sharpModule.default };

    console.log("[image] 使用 sharp");
    return engine;
  } catch (error) {
    console.warn("[image] sharp 不可用：", error.message);
  }

  try {
    const jimpModule = await import("jimp");
    const Jimp = jimpModule.Jimp || jimpModule.default;

    if (!Jimp) throw new Error("jimp 导出格式不识别");

    engine = { name: "jimp", lib: Jimp };

    console.log("[image] 使用 jimp（较慢）");
    return engine;
  } catch (error) {
    console.warn("[image] jimp 也不可用：", error.message);
  }

  engine = { name: "none", lib: null };
  console.error("[image] 没有可用的图片引擎，将跳过压缩");

  return engine;
};

export const getEngineName = async () => (await initEngine()).name;

/**
 * 压缩图片。
 *
 * 参数：
 *   inputPath  源文件
 *   outputPath 目标文件
 *   maxSide    最大边长（超过等比缩放）
 *   quality    JPEG 质量 1-100
 *
 * 返回 { ok, width, height, size, engine }
 * 如果没引擎，返回 { ok: false, reason: "NO_ENGINE" }（调用方应保留原图）
 */
export const compressImage = async ({ inputPath, outputPath, maxSide = 1600, quality = 82 }) => {
  const current = await initEngine();

  if (current.name === "sharp") {
    return compressWithSharp({ lib: current.lib, inputPath, outputPath, maxSide, quality });
  }

  if (current.name === "jimp") {
    return compressWithJimp({ Jimp: current.lib, inputPath, outputPath, maxSide, quality });
  }

  return { ok: false, reason: "NO_ENGINE" };
};

const compressWithSharp = async ({ lib, inputPath, outputPath, maxSide, quality }) => {
  try {
    const pipeline = lib(inputPath)
      .rotate()                                    // 按 EXIF 自动旋转
      .resize({
        width: maxSide,
        height: maxSide,
        fit: "inside",                             // 等比缩放，不裁切
        withoutEnlargement: true,                  // 小图不放大
      })
      .jpeg({ quality, mozjpeg: true });

    const info = await pipeline.toFile(outputPath);

    return {
      ok: true,
      engine: "sharp",
      width: info.width,
      height: info.height,
      size: info.size,
    };
  } catch (error) {
    console.warn("[image] sharp 压缩失败：", error.message);
    return { ok: false, reason: "COMPRESS_FAILED", detail: error.message };
  }
};

const compressWithJimp = async ({ Jimp, inputPath, outputPath, maxSide, quality }) => {
  try {
    const image = await Jimp.read(inputPath);

    const { width, height } = image.bitmap;

    if (Math.max(width, height) > maxSide) {
      // jimp 的 resize 只接受一个维度，等比时另一个传 Jimp.AUTO
      if (width >= height) {
        image.resize({ w: maxSide });
      } else {
        image.resize({ h: maxSide });
      }
    }

    image.quality(quality);
    await image.write(outputPath);

    const size = (await import("node:fs")).statSync(outputPath).size;

    return {
      ok: true,
      engine: "jimp",
      width: image.bitmap.width,
      height: image.bitmap.height,
      size,
    };
  } catch (error) {
    console.warn("[image] jimp 压缩失败：", error.message);
    return { ok: false, reason: "COMPRESS_FAILED", detail: error.message };
  }
};

/**
 * 读图片元信息（宽高），不压缩。
 */
export const readImageMeta = async ({ inputPath }) => {
  const current = await initEngine();

  if (current.name === "sharp") {
    try {
      const meta = await current.lib(inputPath).metadata();
      return { ok: true, width: meta.width || null, height: meta.height || null, format: meta.format };
    } catch {
      return { ok: false };
    }
  }

  if (current.name === "jimp") {
    try {
      const image = await current.lib.read(inputPath);
      return { ok: true, width: image.bitmap.width, height: image.bitmap.height, format: null };
    } catch {
      return { ok: false };
    }
  }

  return { ok: false };
};
```

## 1.4 五个关键点

### 关键点一：`await import()` 而不是顶层 `import`

```javascript
const sharpModule = await import("sharp");
```

**为什么：**

**顶层 `import "sharp"` 在模块加载时就执行。**

**如果 `sharp` 没装，整个 `image.js` 都加载失败 —— 连带 `files-routes.js` 也起不来，服务直接崩。**

**用动态 `import()`，失败可以 catch，降级到 jimp。**

**这是"可选依赖"的标准写法。**

**代价：第一次调用是异步的（多几毫秒）。用 `engine !== null` 缓存避免重复。**

### 关键点二：`.rotate()` 不带参数

```javascript
.rotate()   // 省略参数 = 按 EXIF 自动旋转
```

**`sharp` 的 `rotate()` 有三种用法：**

```javascript
.rotate()        // 按 EXIF 自动（推荐）
.rotate(90)      // 强制旋转 90°
.rotate(90, { background: "#fff" })   // 带背景色
```

**用第一种。** 它是"纠正方向"的标准做法。

**注意：**`.rotate()` 在 `.resize()` 之前。

**为什么：**

**如果先 resize 再 rotate，宽高会被算错（因为旋转后宽高互换）。**

**`sharp` 的 pipeline 是按顺序执行的，`.rotate()` 放前面才对。**

### 关键点三：`fit: "inside"` + `withoutEnlargement: true`

```javascript
.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
```

**`fit: "inside"`：**

```text
把图片缩放到"能在 maxSide × maxSide 的框里放下"
保持宽高比
不裁切
```

**对比其他 fit：**

| fit | 行为 |
|---|---|
| `cover` | 填满框，多余裁掉（会丢内容） |
| `contain` | 完整放进框，可能留白（可能加背景） |
| `inside` | 等比缩到框内（不裁不白） |
| `fill` | 强行拉伸到框（变形） |

**图片处理默认用 `inside`。只有头像/封面这种"必须固定尺寸"的才用 `cover`。**

**`withoutEnlargement: true`：**

**小图不放大。**

**为什么：**

```text
用户传了一张 200×200 的图
maxSide 是 1600
不加这个参数 → 会被放大到 1600×1600（模糊 + 文件变大）
```

**放大图片是纯损失：更模糊、更大、更慢。**

### 关键点四：`mozjpeg: true`

```javascript
.jpeg({ quality, mozjpeg: true })
```

**`mozjpeg` 是 Mozilla 改进的 JPEG 编码器。**

**效果：同质量下文件小 10-15%。**

**代价：编码慢 20-30%。**

**值得。因为"编码慢"发生在服务端一次，"文件小"是每次传输都省。**

**这是"一次成本换持续收益"的典型。**

### 关键点五：没有引擎时返回 `ok: false`

```javascript
return { ok: false, reason: "NO_ENGINE" };
```

**为什么不抛异常：**

**调用方（上传接口）应该"保留原图，继续走流程"，而不是"上传失败"。**

**用户传了文件，你压不了，但文件本身是合法的 —— 该存还是要存。**

**这个设计让"图片库装不上"从"服务不可用"降级成"没压缩"。**

**降级的艺术：让次要功能的失败不影响主要功能。**

---

# 第 2 步：三档参数对比（30 分钟）

## 2.1 新建 `experiments/e04-compress.js`

**先准备一张真实照片。**

**如果没有手机照片，用系统自带的壁纸（`C:\Windows\Web\Wallpaper\`）。**

**或者用 curl 下一张：**

```text
curl.exe -o experiments/samples/big.jpg "https://picsum.photos/4000/3000"
```

**（如果网络不通，就用系统壁纸。）**

```javascript
import fs from "node:fs";
import path from "node:path";
import { compressImage, getEngineName } from "../src/image.js";

const SAMPLES = ["experiments/samples/big.jpg"];
const OUT = "experiments/samples/out";

fs.mkdirSync(OUT, { recursive: true });

const PRESETS = [
  { label: "A 高质量", maxSide: 2400, quality: 90 },
  { label: "B 平衡", maxSide: 1600, quality: 82 },
  { label: "C 小体积", maxSide: 1200, quality: 60 },
  { label: "D 缩略图", maxSide: 300, quality: 80 },
];

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const main = async () => {
  console.log(`引擎：${await getEngineName()}\n`);

  for (const sample of SAMPLES) {
    if (!fs.existsSync(sample)) {
      console.error(`找不到样本：${sample}`);
      console.error("请放一张真实照片到 experiments/samples/big.jpg");
      return;
    }

    const originalSize = fs.statSync(sample).size;
    console.log(`原图：${sample}　${fmtSize(originalSize)}\n`);

    const rows = [];

    for (const preset of PRESETS) {
      const output = path.join(OUT, `${preset.label.replace(/\s+/g, "-")}.jpg`);
      const started = Date.now();

      const result = await compressImage({
        inputPath: sample,
        outputPath: output,
        maxSide: preset.maxSide,
        quality: preset.quality,
      });

      const ms = Date.now() - started;

      if (!result.ok) {
        console.log(`${preset.label}：失败（${result.reason}）`);
        continue;
      }

      rows.push({
        档位: preset.label,
        参数: `${preset.maxSide}px / q${preset.quality}`,
        尺寸: `${result.width}×${result.height}`,
        大小: fmtSize(result.size),
        压缩比: `${(originalSize / result.size).toFixed(1)}×`,
        耗时: `${ms}ms`,
        文件: output,
      });
    }

    console.table(rows);

    console.log("\n请用系统看图软件打开 experiments/samples/out/ 里的四个文件，");
    console.log("和原图对比，判断哪一档的清晰度可以接受。");
  }
};

main().catch((error) => {
  console.error("跑挂了：", error.message);
  process.exitCode = 1;
});
```

## 2.2 跑，然后**真的去看图**

```text
node experiments/e04-compress.js
```

**你会看到一张表：**

```text
档位        参数            尺寸        大小      压缩比   耗时
A 高质量    2400px / q90    2400×1800   1.82 MB   6.6×     420ms
B 平衡      1600px / q82    1600×1200   620 KB    19.4×    180ms
C 小体积    1200px / q60    1200×900    195 KB    61.5×    120ms
D 缩略图    300px / q80     300×225     14 KB     857×     45ms
```

**然后打开 `experiments/samples/out/` 文件夹，逐个看。**

## 2.3 判断标准（自己看，不要信数字）

**四个必看的点：**

**第一：放大到 100% 看细节**

**在 A 和 B 之间，大多数人看不出差别。**

**B 和 C 之间，能看出 C 略软（尤其头发、树叶这种细节多的区域）。**

**第二：看渐变区域**

**天空、墙面这种大面积渐变，最能暴露 JPEG 压缩。**

**质量 60 时会出现"色带"（banding）—— 平滑渐变变成一条条色块。**

**第三：看文字**

**如果图片里有文字，低质量会让文字边缘发虚、出现"蚊虫噪点"（mosquito noise）。**

**这一条对截图特别重要：** 截图压缩不要低于质量 85。

**第四：在目标尺寸下看**

**如果这张图在页面上显示宽度只有 400px，你就在浏览器里缩到 400px 看。**

**12MB 的原图和 300KB 的压缩图在 400px 宽下，一般看不出区别。**

**记住这个结论：**

> **判断画质要在"实际显示尺寸"下看，不是"100% 放大"下看。**

**很多人压缩完放大到 100% 说"糊了"，但用户永远只看 400px —— 那这个"糊"没有意义。**

## 2.4 记录到 `results/e04.md`

```markdown
# 第 67 节 图片压缩实测

引擎：
原图：___×___，___ MB

| 档位 | 参数 | 尺寸 | 大小 | 压缩比 | 耗时 | 我的主观判断 |
|---|---|---|---|---|---|---|
| A | 2400/q90 | | | | | |
| B | 1600/q82 | | | | | |
| C | 1200/q60 | | | | | |
| D | 300/q80 | | | | | |

## 结论
详情页大图用 ___ 档，因为：
列表缩略图用 ___ 档，因为：
```

---

# 第 3 步：接进上传流程（30 分钟）

## 3.1 改 `files-routes.js`

**在 `moveToOriginals` 之后、`createFile` 之前插入压缩。**

**完整流程变成：**

```text
接收 → .tmp/ → 校验 → 压缩（如果是图片）→ 搬到 originals/ → 写数据库
```

**注意：压缩在 `.tmp/` 里做，输出也写 `.tmp/`，最后只搬压缩后的文件。**

**为什么要这样：**

**原图 12MB 如果先搬到 `originals/` 再压缩覆盖，中间有一瞬间磁盘占 24MB。**

**而且在 `.tmp/` 里做，失败时清理逻辑不变。**

**改代码：**

```javascript
import { compressImage, readImageMeta } from "./image.js";

// ... 在 for 循环里，validateUpload 之后 ...

// 第三步：图片压缩（在 .tmp/ 里做）
let finalTmpPath = file.tmpPath;
let compressedSize = meta.size;
let width = null;
let height = null;
let compressionNote = "未压缩";

if (kind === "image") {
  const compressedKey = `${file.storageKey}.compressed`;
  const compressedPath = path.join(TMP_DIR, `${compressedKey}.jpg`);

  const result = await compressImage({
    inputPath: file.tmpPath,
    outputPath: compressedPath,
    maxSide: 1600,
    quality: 82,
  });

  if (result.ok) {
    // 压缩成功：用压缩后的文件，删掉原图临时文件
    finalTmpPath = compressedPath;
    compressedSize = result.size;
    width = result.width;
    height = result.height;
    compressionNote = `${meta.size} → ${result.size} 字节（${result.engine}）`;

    await fs.promises.unlink(file.tmpPath).catch(() => {});
  } else {
    // 压缩失败：保留原图（降级）
    const imageMeta = await readImageMeta({ inputPath: file.tmpPath });
    if (imageMeta.ok) {
      width = imageMeta.width;
      height = imageMeta.height;
    }

    compressionNote = `跳过压缩（${result.reason}）`;
    console.warn(`[upload] 压缩失败，保留原图：${result.reason}`);
  }
}

// 第四步：搬到 originals/（注意：用 finalTmpPath）
const finalKey = replaceExt(file.storageKey, kind === "image" ? ".jpg" : meta.ext);
const movedPath = await moveToOriginals(finalTmpPath, finalKey);

// 第五步：写数据库（用 compressedSize 和宽高）
record = createFile({
  userId: req.user.id,
  storageKey: finalKey,
  originalName: file.filename.slice(0, 200),
  mime: "image/jpeg",       // 压缩后统一是 JPEG
  kind,
  size: compressedSize,
  width,
  height,
});

console.log(`[upload] ${file.filename}: ${compressionNote}`);
```

## 3.2 四个关键点

### 关键点一：压缩后的扩展名统一是 `.jpg`

```javascript
const finalKey = replaceExt(file.storageKey, kind === "image" ? ".jpg" : meta.ext);
```

**为什么：**

**用户传的是 PNG，压缩后输出的是 JPEG。**

**如果还叫 `.png`，浏览器可能按 PNG 解析（虽然 sniff 能纠正，但会混乱）。**

**统一成 `.jpg`，和实际内容一致。**

**副作用：**

**PNG 的透明背景会丢失（JPEG 不支持透明）。**

**处理方案（这一周简化）：**

**如果检测到 PNG，判断有没有透明通道；有的话保留 PNG（不转 JPEG）。**

**这需要 `sharp` 的 `metadata().hasAlpha`。练习里会让你做。**

**这一周的做法：所有图片统一转 JPEG，接受"PNG 透明变白底"。**

**这是真实的取舍：**

```text
统一转 JPEG → 简单、体积小，但丢透明
保留原格式   → 保留透明，但 PNG 可能比 JPEG 大 3 倍
```

**真实项目里常见做法：**

```text
有透明 → PNG（或 WEBP）
无透明 → JPEG
```

### 关键点二：压缩后的 MIME 写死 `image/jpeg`

```javascript
mime: "image/jpeg",
```

**为什么不用 `meta.mime`：**

**`meta.mime` 是"上传时的类型"（可能是 `image/png`）。**

**压缩后实际是 JPEG。**

**数据库里存"实际类型"才对，否则读接口的 `Content-Type` 会说谎。**

**浏览器看到 `Content-Type: image/png` 但内容是 JPEG，可能会显示破图。**

**（实际上浏览器会 sniff，但为什么不写对呢。）**

### 关键点三：压缩在 `.tmp/` 里做

```javascript
const compressedPath = path.join(TMP_DIR, `${compressedKey}.jpg`);
```

**为什么不在 `originals/` 里做：**

```text
① 失败时 pin 位置会留下"半个文件"
② 原图和压缩图会混在一起（两个文件都在 originals/，你分不清哪个是最终版）
③ 清理逻辑变复杂
```

**在 `.tmp/` 里做完，只搬最终版。`originals/` 里永远只有"可用的最终文件"。**

### 关键点四：压缩后删原临时文件

```javascript
await fs.promises.unlink(file.tmpPath).catch(() => {});
```

**为什么：**

**原图 12MB 还在 `.tmp/` 里，不删就白占空间。**

**注意 `.catch(() => {})`：**

**如果删除失败（Windows 上文件被占用），不该让上传失败。**

**最坏情况：留下一个孤儿临时文件，第 66 节的清理脚本会扫（虽然它扫的是 `originals/` 和 `thumbs/`，不扫 `.tmp/`）。**

**所以更好的做法：清理脚本也扫 `.tmp/` 目录中超过 1 小时的文件。练习里会让你加。**

## 3.3 测试

**1. 上传一张 3MB 的照片。**

**看终端日志：**

```text
[upload] IMG_2024.jpg: 3245678 → 312456 字节（sharp）
```

**2. 打开 `/files.html`，看"大小"列。**

**应该是 `305.1 KB`，不是 `3.09 MB`。**

**3. 点"查看"，确认图能显示。**

**4. 查数据库：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,original_name,size,width,height,mime FROM files ORDER BY id DESC LIMIT 5').all()))"
```

**应该看到：**

```text
id  original_name    size     width  height  mime
5   IMG_2024.jpg     312456   1600   1200    image/jpeg
```

**注意 `width` 是 1600（被缩到最大边），`height` 按比例。**

**如果 `width` 是 `null`，说明压缩失败了（可能没装库），走了降级路径。**

**5. 检查磁盘：**

```text
dir uploads\originals
```

**应该只有一个文件，大小约 300KB（不是 3MB）。**

---

# 第 4 步：五个必须知道的坑（30 分钟）

## 坑 1：忘了 `.rotate()`

**这是最常见的坑，而且只有"竖拍的照片"才暴露。**

**验证：**

**找一张手机竖拍的照片（大部分手机照片都是竖的）。**

**上传后，在 `/files.html` 里看缩略。**

**如果图是躺倒的 → 你没加 `.rotate()`。**

**为什么会这样：**

**手机传感器是横向的。竖拍时，图像数据是横的，但 EXIF 里有个"Orientation: 6"标记"要旋转 90°"。**

**看图软件会读 EXIF 并旋转。**

**但 `sharp` 默认**不读** EXIF 的方向（因为它做的是"像素级处理"，不是"显示"）。**

**所以你必须显式 `.rotate()`。**

## 坑 2：`withoutEnlargement` 忘了设

**症状：**

**上传一张 200×200 的 logo，被放大到 1600×1600。**

**文件从 5KB 变成 400KB（模糊的大图）。**

**为什么：**

**`resize({ width: 1600 })` 会**拉伸**到 1600，不管原图多小。**

**`withoutEnlargement: true` 让"小于目标尺寸的图保持不变"。**

**这个细节对小图（图标、logo）影响巨大。**

## 坑 3：PNG 透明变黑底

**原因：**

**PNG 有 alpha 通道，JPEG 没有。**

**`sharp` 转 JPEG 时，透明区域会被填成**黑色**（默认）。**

**修法（如果必须转）：**

```javascript
.flatten({ background: "#ffffff" })   // 透明变白
```

**放在 `.jpeg()` 之前。**

**更好的做法：保留 PNG（见 3.2 关键点一）。**

## 坑 4：`quality` 设得太低，文字截图变糊

**UI 截图、图表、含文字的图片，压缩比照片敏感得多。**

**因为文字的高频边缘会产生"蚊虫噪点"。**

**经验值：**

| 内容类型 | 建议质量 |
|---|---|
| 自然照片 | 78-85 |
| 商品图 | 82-88 |
| 含文字的截图 | 88-92 |
| 图表/线稿 | 用 PNG，不要 JPEG |

**这一周统一 82。真实项目里要按 `kind` 区分。**

## 坑 5：`sharp` 的 `limitInputPixels`

**默认 `sharp` 会拒绝超过 268402689 像素（约 16383×16383）的图。**

**但 10000×10000 = 1 亿像素，在限制内，处理它要 1-2GB 内存。**

**显式收紧：**

```javascript
import sharp from "sharp";

sharp.cache(false);   // 关掉内部缓存（省内存）

lib(inputPath, { limitInputPixels: 50000000 })   // 5000 万像素上限
```

**5000 万像素 ≈ 7070×7070。对任何正常照片都够。**

**超限会抛错，你的降级逻辑会"保留原图" —— 但原图也是 1 亿像素，还是占空间。**

**所以更好的做法：在第 65 节的 `validateUpload` 里先读尺寸，超限直接拒。**

**这就是第 65 节练习二的内容。**

---

# 第 5 步：故意做五个实验（30 分钟）

## 实验 1：去掉 `.rotate()`

**上传一张竖拍照片。**

**看结果是不是躺倒的。**

**加回来。**

## 实验 2：去掉 `withoutEnlargement`**

**上传一张小图（比如 200×200 的图标）。**

**看尺寸是不是被放大到 1600。**

**加回来。**

## 实验 3：质量设成 20

**用一个真实照片跑 `e04-compress.js`，把某一档的 `quality` 改成 20。**

**打开输出文件。**

**你会看到明显的"方块"（8×8 的 JPEG 块）。**

**这就是质量太低的代价。**

**这也让你理解"为什么质量 82 是个好默认值"。**

## 实验 4：上传 PNG 带透明的图

**找一个 PNG logo（带透明背景）。**

**上传，看结果。**

**应该是白底或黑底（透明丢了）。**

**这就是 3.2 关键点一的取舍。**

## 实验 5：卸载 sharp，测降级

```text
npm uninstall sharp
```

**重启服务，上传图片。**

**看终端：**

```text
[image] sharp 不可用：Cannot find package 'sharp'
[image] 使用 jimp（较慢）
[upload] xxx.jpg: 3245678 → 512345 字节（jimp）
```

**压缩还是发生了，只是慢一点、体积大一点。**

**再卸载 jimp：**

```text
npm uninstall jimp
```

**重启，上传。**

**应该看到：**

```text
[image] 没有可用的图片引擎，将跳过压缩
[upload] xxx.jpg: 跳过压缩（NO_ENGINE）
```

**文件能上传，只是没压缩。**

**这就是"降级"的价值。**

**装回 sharp（或 jimp）：**

```text
npm install sharp
```

---

# 第 6 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 三档参数的实际数字（尺寸/大小/耗时）
2. 你的主观判断（哪一档"够用"）
3. 竖拍照片的方向问题（有没有踩到）
4. 「卡在哪」

---

# 第 7 步：课后练习

## 练习一：PNG 透明处理

**要求：** PNG 有 alpha 通道时保留 PNG，无透明时转 JPEG。

```javascript
const meta = await sharp(inputPath).metadata();

if (meta.format === "png" && meta.hasAlpha) {
  // 输出 PNG，只缩放不转格式
  await sharp(inputPath).rotate().resize({...}).png({ compressionLevel: 9 }).toFile(out);
} else {
  // 转 JPEG
  await sharp(inputPath).rotate().resize({...}).jpeg({ quality }).toFile(out);
}
```

**验证：** 传一张透明 logo，下载后确认透明还在。

**为什么 `compressionLevel: 9`：**

**PNG 是无损格式，`compressionLevel` 只影响"编码耗时和文件大小"，不影响画质。**

**9 是最小体积（最慢）。服务端一次编码，客户端每次下载都省。**

## 练习二：按 kind 区分质量

**要求：** 商品图 88，普通图 82，截图 92。

**参数从哪来：**

**让用户在上传时选"图片用途"（下拉框），或者按业务场景固定。**

**这一周简化：加一个 `?quality=88` 的 query 参数（带白名单校验）。**

## 练习三：WEBP 对比

**要求：** 加一个 `format: "webp"` 的选项，跑 `e04-compress.js` 对比 JPEG 和 WEBP 的体积。

**你会看到 WEBP 小 25-35%。**

**为什么这一周不用：**

**兼容性（老版 Safari 不支持），以及编码更慢。**

**但你要知道"它存在，而且更省"。**

## 练习四：想清楚这四个问题

```text
1. 为什么 `.rotate()` 要在 `.resize()` 之前？
2. `withoutEnlargement` 防的是什么浪费？
3. 为什么压缩要在 `.tmp/` 里做？
4. 为什么"没有引擎"要降级而不是报错？
```

---

# 第 8 步：最终验收

## A. 代码

- [ ] `image.js` 有 `compressImage` / `readImageMeta` / `getEngineName`
- [ ] 动态 `import()` 加载引擎
- [ ] `.rotate()` 在 `.resize()` 之前
- [ ] `fit: "inside"` + `withoutEnlargement: true`
- [ ] 压缩在 `.tmp/` 里做
- [ ] 压缩成功删掉原临时文件
- [ ] 失败降级到"保留原图"
- [ ] 数据库存压缩后的大小和宽高

## B. 实测

- [ ] 3MB 照片压到 400KB 以内
- [ ] 竖拍照片方向正确
- [ ] 小图不被放大
- [ ] 数据库 `width` / `height` 有值
- [ ] 磁盘文件大小和数据库一致
- [ ] 卸载 sharp 后能降级（或 jimp）

## C. 认知

- [ ] 我知道 EXIF 方向是什么
- [ ] 我知道 `.rotate()` 为什么必须在 resize 前
- [ ] 我知道 PNG 转 JPEG 会丢透明
- [ ] 我知道"没有引擎"为什么降级不报错

## 本节课要能说出口的一句话

> **压缩不是"越小越好"，是"在实际显示尺寸下看不出差别"。12MB 到 300KB，就是 40 倍的省。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 竖拍照片躺倒 | 没 `.rotate()` | 加上 |
| 小图被放大 | 没 `withoutEnlargement` | 加上 |
| 透明变黑 | PNG 转 JPEG | `.flatten({background:"#fff"})` 或保留 PNG |
| `sharp` 装不上 | 网络/Node 版本 | 换 `jimp` |
| 压缩后更大 | 原图很小，参数过大 | 加 `withoutEnlargement` |
| 内存爆 | 巨图 | `limitInputPixels` |
| 文字糊 | 质量太低 | 截图用 88-92 |
| `width` 是 null | 压缩失败降级 | 看终端日志 |
| 压缩慢 | 用了 jimp | 能装 sharp 就装 |
| 文件没变小 | 压缩失败 | 查 `[image]` 日志 |
