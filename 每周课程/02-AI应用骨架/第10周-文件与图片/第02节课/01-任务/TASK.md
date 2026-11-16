# 第 65 节课：类型和大小限制——扩展名是用户写的，魔数是文件说的

> **这份文件是你（学员）一步一步照着做的手册。**
> 上节课你的接口能收文件了。但它现在**什么都收** —— 包括一个改了名字的 `.exe`。
> 今天做三重校验，并且**亲手用假文件去打它**。

**建议用时**：150 分钟
**你需要先完成**：第 64 节课（能上传、文件能打开）

---

# 第 0 步：三种"类型"和可信度（15 分钟）

## 0.1 客户端能伪造的两样

**当浏览器发一个文件时，它带三个信息：**

```text
① filename       photo.jpg
② Content-Type   image/jpeg
③ 文件内容        FF D8 FF E0 ...
```

**前两个都可以随便伪造。**

**你怎么伪造：**

```text
① 把一个 exe 改名成 photo.jpg        → filename 变成 photo.jpg
② 用 curl 手动设 Content-Type        → 想写什么都行
```

**用 curl 伪造：**

```text
curl.exe -X POST http://localhost:4030/api/files/upload -H "Cookie: auth_token=xxx" -F "files=@malware.exe;type=image/jpeg;filename=photo.jpg"
```

**服务端收到的：**

```text
filename: photo.jpg
Content-Type: image/jpeg
内容: MZ...（这是 Windows 可执行文件的头部）
```

**三个信息里，只有第三个是"文件自己说的"。**

## 0.2 魔数（magic number）

**几乎所有的文件格式，都在文件最开头几个字节写了"我是什么"。**

| 格式 | 魔数（hex） | 前几个字节的样子 |
|---|---|---|
| JPEG | `FF D8 FF` | ÿØÿ |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | ‰PNG.... |
| GIF | `47 49 46 38` | GIF8 |
| WEBP | `52 49 46 46` … `57 45 42 50` | RIFF....WEBP |
| PDF | `25 50 44 46 2D` | %PDF- |
| ZIP | `50 4B 03 04` | PK.. |
| EXE (Windows) | `4D 5A` | MZ |
| ELF (Linux) | `7F 45 4C 46` | .ELF |

**注意两件事：**

**第一，`MZ` 是 `4D 5A`，就是字母 M 和 Z。**

**第二，ZIP 的 `PK` 是 `50 4B`（Phil Katz 的名字缩写）。**

**这些是真实的历史，不是随便编的。**

## 0.3 三重校验，各有作用

| 校验 | 挡什么 | 能伪造吗 |
|---|---|---|
| **扩展名白名单** | 挡住 `.exe`、`.sh`、`.php` | 能改 |
| **Content-Type 白名单** | 挡住明显不对的声明 | 能写 |
| **魔数** | 挡住"改名的假文件" | 不能（除非真的构造一个合法头 + 恶意内容） |

**三个都要，因为：**

```text
只验扩展名 → 改名就绕过
只验 Content-Type → curl 随便写
只验魔数   → 一个真的 JPEG 里可以藏 PHP 代码（polyglot）
```

**第三种（polyglot 文件）确实存在，但它需要攻击者真的构造一个"既是合法 JPEG 又是合法 PHP"的文件。**

**你的防护目标不是"绝对安全"，是"把攻击成本提高到一个不值得的程度"。**

**第 33 节会讲更深的（内容扫描、沙箱）。今天做前三层。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/file-type.js` | `src/` | 魔数检测器 |
| `src/upload-policy.js` | `src/` | 白名单 + 大小限制 |
| `src/files-routes.js` | `src/` | 改：接上三重校验 |
| `experiments/e02-detect.js` | `experiments/` | 造样本 + 验证检测器 |
| `experiments/e02-attack.js` | `experiments/` | 打自己的接口 |

---

# 第 1 步：写魔数检测器（40 分钟）

## 1.1 新建 `src/file-type.js`

**自己敲：**

```javascript
import fs from "node:fs";

/**
 * 文件类型签名表。
 * check 是函数，因为有些格式的魔数不在开头连续（比如 WEBP）。
 */
const SIGNATURES = [
  {
    type: "jpeg",
    mime: "image/jpeg",
    ext: ".jpg",
    check: (head) => head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  },
  {
    type: "png",
    mime: "image/png",
    ext: ".png",
    check: (head) =>
      head.length >= 8 &&
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47 &&
      head[4] === 0x0d &&
      head[5] === 0x0a &&
      head[6] === 0x1a &&
      head[7] === 0x0a,
  },
  {
    type: "gif",
    mime: "image/gif",
    ext: ".gif",
    check: (head) =>
      head.length >= 6 &&
      head.toString("latin1", 0, 4) === "GIF8" &&
      (head[4] === 0x37 || head[4] === 0x39),
  },
  {
    type: "webp",
    mime: "image/webp",
    ext: ".webp",
    check: (head) =>
      head.length >= 12 &&
      head.toString("latin1", 0, 4) === "RIFF" &&
      head.toString("latin1", 8, 12) === "WEBP",
  },
  {
    type: "pdf",
    mime: "application/pdf",
    ext: ".pdf",
    check: (head) => head.length >= 5 && head.toString("latin1", 0, 5) === "%PDF-",
  },
  {
    type: "zip",
    mime: "application/zip",
    ext: ".zip",
    check: (head) => head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04,
  },
  {
    type: "exe",
    mime: "application/x-msdownload",
    ext: ".exe",
    check: (head) => head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a,
  },
];

/**
 * 读文件头部（默认 32 字节）判断类型。
 * 未知返回 { type: "unknown", matched: false }
 */
export const detectFileType = async (filePath, headBytes = 32) => {
  const handle = await fs.promises.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(headBytes);
    const { bytesRead } = await handle.read(buffer, 0, headBytes, 0);

    return matchSignature(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};

/** 同步版，测试和小文件用 */
export const detectFileTypeSync = (filePath, headBytes = 32) => {
  const fd = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.alloc(headBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, headBytes, 0);

    return matchSignature(buffer.subarray(0, bytesRead));
  } finally {
    fs.closeSync(fd);
  }
};

const matchSignature = (head) => {
  for (const signature of SIGNATURES) {
    if (signature.check(head)) {
      return { type: signature.type, mime: signature.mime, ext: signature.ext, matched: true };
    }
  }

  return { type: "unknown", mime: "application/octet-stream", ext: "", matched: false };
};
```

## 1.2 五个关键点

### 关键点一：只读前 32 字节

```javascript
const buffer = Buffer.alloc(headBytes);   // 32
const { bytesRead } = await handle.read(buffer, 0, headBytes, 0);
```

**为什么不用 `readFileSync` 读整个文件：**

```text
① 12MB 的图片全读进内存，只为了看前 3 个字节
② 100 个用户并发上传 = 1.2GB
```

**`open` + `read(n)` + `close` 只读前 32 字节，内存占用是常数。**

**3 行代码省 12MB，这是最划算的优化。**

### 关键点二：`check` 是函数，不是字节数组

**有人会这么写：**

```javascript
{ header: [0xff, 0xd8, 0xff], mime: "image/jpeg" }
// 然后 buffer.subarray(0,3).equals(Buffer.from(header))
```

**这对 JPEG 能工作，但对 WEBP 不行：**

```text
偏移 0-3:   RIFF
偏移 4-7:   文件大小（可变！）
偏移 8-11:  WEBP
```

**魔数被"文件大小"隔开了，中间 4 个字节是任意的。**

**所以 `check` 必须是函数，能做任意判断。**

**这个设计让"加新格式"变成"加一个函数"，不用改解析逻辑。**

### 关键点三：`MZ` 也要加进签名表

**为什么检测一个"不该允许"的类型：**

**因为你要能明确说出"这是 exe"，而不是笼统的"未知类型"。**

**错误信息不同：**

```text
检测到 exe  → "检测到文件实际类型是 exe"
unknown    → "无法识别文件类型（可能是伪造的文件）"
```

**第一种更清楚，而且它证明你真的在按内容检测。**

### 关键点四：`bytesRead` 可能小于 32

```javascript
return matchSignature(buffer.subarray(0, bytesRead));
```

**如果文件只有 10 个字节，`bytesRead` 是 10。**

**直接用 `buffer`（32 字节），后面 22 个字节是 `0`。**

**对"找 JPEG 头"没影响，但如果某个签名检查了"第 20 字节必须是 X"，就会被多余的 0 干扰。**

**`subarray(0, bytesRead)` 更严谨。**

### 关键点五：`finally` 里 `close`

```javascript
} finally {
  await handle.close();
}
```

**不 close 会怎样：**

```text
文件句柄泄漏
Windows 上：文件被占用，无法删除/重命名（EBUSY）
```

**症状：上传成功后 `rename` 报 `EBUSY: resource busy or locked`。**

**这个 bug 在 Linux 上不出现（Linux 允许删除已打开的文件），所以你本地测不出、部署到 Windows 服务器才爆。**

**`finally` 保证"无论成功失败都关"。**

## 1.3 造样本 + 验证

**新建 `experiments/e02-detect.js`：**

```javascript
import fs from "node:fs";
import path from "node:path";
import { detectFileTypeSync } from "../src/file-type.js";

const DIR = "experiments/samples";
fs.mkdirSync(DIR, { recursive: true });

const samples = [
  { name: "real.jpg", head: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) },
  { name: "real.png", head: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { name: "real.gif", head: Buffer.from("GIF89a", "latin1") },
  { name: "real.pdf", head: Buffer.from("%PDF-1.7", "latin1") },
  { name: "real.webp", head: Buffer.from("RIFF\0\0\0\0WEBP", "latin1") },
  { name: "fake.jpg", head: Buffer.from("MZ\x90\x00\x03\x00", "latin1") },
  { name: "weird.png", head: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) },
];

samples.forEach((sample) => {
  const file = path.join(DIR, sample.name);
  fs.writeFileSync(file, Buffer.concat([sample.head, Buffer.alloc(64)]));

  const result = detectFileTypeSync(file);

  console.log(
    `${sample.name.padEnd(12)} → ${result.type.padEnd(8)} ${result.mime.padEnd(28)} 建议扩展名 ${result.ext || "（无）"}`
  );
});

console.log("\n注意 fake.jpg：文件名是 .jpg，但检测出 exe。");
console.log("注意 weird.png：扩展名是 .png，但检测出 unknown。");
```

**跑：**

```text
node experiments/e02-detect.js
```

**应该看到七行，其中两行是重点：**

```text
fake.jpg     → exe      application/x-msdownload     建议扩展名 .exe
weird.png    → unknown  application/octet-stream     建议扩展名 （无）
```

---

# 第 2 步：写上传策略（25 分钟）

## 2.1 新建 `src/upload-policy.js`

```javascript
import path from "node:path";
import { detectFileType } from "./file-type.js";

/**
 * 上传策略。想加新类型，只改这里。
 */
export const POLICY = {
  image: {
    maxBytes: 20 * 1024 * 1024,
    types: ["jpeg", "png", "gif", "webp"],
    ext: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    label: "图片",
  },
  document: {
    maxBytes: 20 * 1024 * 1024,
    types: ["pdf"],
    ext: [".pdf"],
    label: "文档",
  },
};

export class UploadError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * 校验一个已落盘（在 .tmp/ 里）的文件。
 * 通过返回元信息；不通过抛 UploadError。
 */
export const validateUpload = async ({ tmpPath, filename, size, kind = "image" }) => {
  const policy = POLICY[kind];

  if (!policy) {
    throw new UploadError(`未知的上传类别：${kind}`, "UNKNOWN_KIND");
  }

  // 第一层：大小
  if (size === 0) {
    throw new UploadError("文件是空的", "EMPTY_FILE");
  }

  if (size > policy.maxBytes) {
    throw new UploadError(
      `文件超过 ${Math.round(policy.maxBytes / 1024 / 1024)}MB 上限`,
      "TOO_LARGE",
      413
    );
  }

  // 第二层：扩展名（用户提供的信息，只作参考）
  const ext = path.extname(String(filename || "")).toLowerCase();

  if (!policy.ext.includes(ext)) {
    throw new UploadError(
      `不允许的文件扩展名：${ext || "（无扩展名）"}，只接受 ${policy.ext.join(" ")}`,
      "BAD_EXT"
    );
  }

  // 第三层：魔数（文件自己说的，最可信）
  const detected = await detectFileType(tmpPath);

  if (!detected.matched) {
    throw new UploadError("无法识别文件类型（可能是伪造的文件）", "UNKNOWN_TYPE");
  }

  if (!policy.types.includes(detected.type)) {
    throw new UploadError(
      `检测到文件实际类型是 ${detected.type}，不在允许范围内（${policy.types.join(" ")}）`,
      "TYPE_MISMATCH"
    );
  }

  return {
    detectedType: detected.type,
    mime: detected.mime,
    ext: detected.ext || ext,
    size,
    label: policy.label,
  };
};
```

## 2.2 四个关键设计

### 设计一：三段检查，三句不同的错误

```text
大小超了      → TOO_LARGE     413
扩展名不对    → BAD_EXT       400
魔数不认识    → UNKNOWN_TYPE  400
类型不在白名单 → TYPE_MISMATCH 400
```

**为什么区分：**

```text
① 用户知道怎么改（换个小的 vs 改扩展名 vs 换个文件）
② 你看日志时能分清"用户手滑"和"有人在试探"
```

**统一报"文件类型不对"，你什么都判断不出来。**

### 设计二：`kind` 分开策略

```text
头像上传    → kind=image，只允许图片，20MB
合同上传    → kind=document，只允许 PDF，20MB
```

**不同场景的允许范围不同，用 `kind` 分开。**

**这个设计在第 12 周（文档解析）会直接用上。**

### 设计三：`size === 0` 单独报

**空文件是常见误操作，不是"类型错误"。**

**"文件是空的"比"无法识别类型"有用得多。**

### 设计四：`UploadError` 带 `code`

**`code` 给程序判断，`message` 给人看。**

**前端可以按 code 给不同的引导：**

```javascript
const GUIDE = {
  TOO_LARGE: "请压缩后再传，或换个更小的文件",
  BAD_EXT: "只支持 jpg/png/gif/webp",
  UNKNOWN_TYPE: "这个文件可能已损坏，或者是伪造的",
  TYPE_MISMATCH: "文件内容和扩展名不一致",
};
```

---

# 第 3 步：接进接口（25 分钟）

## 3.1 改 `src/files-routes.js`

**整份替换（保留原有结构，插入校验）：**

```javascript
import express from "express";
import fs from "node:fs";
import { requireAuth } from "./auth.js";
import { receiveMultipart, moveToOriginals } from "./upload.js";
import { validateUpload, UploadError } from "./upload-policy.js";
import { log, actorFrom } from "./audit.js";

export const filesRouter = express.Router();

filesRouter.use(requireAuth);

filesRouter.post("/upload", async (req, res, next) => {
  const started = Date.now();
  const kind = String(req.query.kind || "image");

  try {
    const { fields, files } = await receiveMultipart({
      req,
      maxFileSize: 20 * 1024 * 1024,
      maxFiles: 5,
    });

    if (files.length === 0) {
      return res.status(400).json({ error: "没有收到文件", code: "NO_FILE" });
    }

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
        // 校验失败：清理所有临时文件（不只是这一个）
        await cleanupTmp(files);

        log({
          ...actorFrom(req),
          action: "file.upload",
          targetType: "file",
          targetId: null,
          ok: false,
          note: `${error.code || "VALIDATE_FAIL"}: ${file.filename}`,
        });

        throw error;
      }

      // 用检测到的真实扩展名覆盖（防止 .jpg 里装着 png）
      const finalKey = replaceExt(file.storageKey, meta.ext);
      await moveToOriginals(file.tmpPath, finalKey);

      saved.push({
        field: file.field,
        filename: file.filename,
        detectedType: meta.detectedType,
        contentType: meta.mime,
        size: meta.size,
        storageKey: finalKey,
      });
    }

    console.log(
      `[upload] uid=${req.user.id} ok=${saved.length} ` +
        `字节=${saved.reduce((sum, file) => sum + file.size, 0)} ` +
        `耗时=${Date.now() - started}ms`
    );

    saved.forEach((file) => {
      log({
        ...actorFrom(req),
        action: "file.upload",
        targetType: "file",
        targetId: file.storageKey,
        ok: true,
        note: `${file.filename} (${file.size} 字节, ${file.detectedType})`,
      });
    });

    res.status(201).json({ message: `已上传 ${saved.length} 个文件`, fields, files: saved });
  } catch (error) {
    if (error instanceof UploadError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }

    next(error);
  }
});

const cleanupTmp = async (files) => {
  await Promise.all(
    files.map((file) =>
      fs.promises.unlink(file.tmpPath).catch(() => {
        // 已经不存在就算了
      })
    )
  );
};

const replaceExt = (key, ext) => `${key.replace(/\.[a-z0-9]{1,8}$/i, "")}${ext}`;
```

## 3.2 三个关键点

### 关键点一：任何文件校验失败，清理**所有**临时文件

```javascript
} catch (error) {
  await cleanupTmp(files);   // 传整个数组
  throw error;
}
```

**为什么不只清理失败的那一个：**

**因为前面的文件已经通过校验，但还没搬走（还在 `.tmp/` 里）。**

**整个请求失败时，它们都要删。**

**不删的后果：**

```text
用户传 5 个文件，第 3 个不合法 → 请求失败
但前 2 个的临时文件留在 .tmp/
一天几十次 → .tmp 塞满磁盘
```

**这个泄漏很隐蔽，因为"接口报错"看起来像"什么都没发生"。**

### 关键点二：用检测到的扩展名覆盖

```javascript
const finalKey = replaceExt(file.storageKey, meta.ext);
```

**场景：**

**用户传了 `photo.jpg`，但内容是 PNG。**

```text
扩展名检查：.jpg 在白名单 ✅
魔数检查：png 在白名单 ✅
→ 通过
```

**但存下来的文件名是 `.jpg`，内容是 PNG。**

**有些不严格的解码器按扩展名处理，就会出错。**

**用检测结果 `.png`，避免混乱。**

**这是"相信文件自己说的"延伸到存储层。**

### 关键点三：失败也记审计日志

```javascript
log({
  ...actorFrom(req),
  action: "file.upload",
  ok: false,
  note: `${error.code || "VALIDATE_FAIL"}: ${file.filename}`,
});
```

**为什么：**

**如果有人在反复尝试上传 exe，日志里能看出来。**

```text
10 分钟内有 20 条 TYPE_MISMATCH → 有人在试探你的上传接口
```

**这是第 63 节审计的实际用途。**

## 3.3 四个测试

**先重启服务。**

**测试 1：正常图片**

**页面上传一张真实照片。应该成功，`detectedType: "jpeg"`。**

**测试 2：`fake.jpg`（MZ 内容）**

**把 `experiments/samples/fake.jpg` 上传。**

**应该返回：**

```json
{"error":"检测到文件实际类型是 exe，不在允许范围内（jpeg png gif webp）","code":"TYPE_MISMATCH"}
```

**测试 3：真图改名成 `.exe`**

```text
copy experiments\samples\real.jpg experiments\samples\real-as-exe.exe
```

**上传。应该返回：**

```json
{"error":"不允许的文件扩展名：.exe，只接受 .jpg .jpeg .png .gif .webp","code":"BAD_EXT"}
```

**测试 4：`weird.png`（随机字节）**

**上传。应该返回：**

```json
{"error":"无法识别文件类型（可能是伪造的文件）","code":"UNKNOWN_TYPE"}
```

## 3.4 检查 `.tmp` 是空的

**做完上面四个测试（其中三个失败后）：**

```text
dir uploads\.tmp
```

**应该是空的。**

**如果有 `.part` 文件残留，说明 `cleanupTmp` 没生效。**

---

# 第 4 步：五个必须知道的坑（30 分钟）

## 坑 1：只验扩展名

**这是最常见的做法，也是最大的漏洞。**

```javascript
// 错
if (![".jpg", ".png"].includes(ext)) return 400;
```

**绕过方法（一条命令）：**

```text
copy malware.exe photo.jpg
→ 扩展名是 .jpg → 通过检查 → 上传成功
```

**如果服务器配置错误（比如 uploads 被当静态目录），这个文件还能被下载。**

**这是很多真实漏洞的成因。**

## 坑 2：先搬位置再校验

```javascript
// 错
await moveToOriginals(file.tmpPath, file.storageKey);
await validateUpload(...);   // 太晚
```

**问题：**

```text
校验失败时，文件已经在 originals/ 里了
要"删掉它"，但删除也可能失败
→ 留下垃圾在最终位置
```

**正确顺序：校验 → 搬位置。**

**记住这个原则：**

> **"非法状态"不要落到"最终位置"。先放临时区，校验通过再搬。**

**这个思路在幂等键（第 55 节）、软删除（第 61 节）里都用过。**

## 坑 3：`detectFileType` 没 close

**见 1.2 关键点五。**

**Linux 上不出现，Windows 上必现。**

**症状：`rename` 报 `EBUSY`。**

**如果你在 macOS 上开发、部署到 Windows，这个 bug 会在部署后突然出现。**

## 坑 4：把 `unknown` 当成"允许"

```javascript
// 错
if (detected.type === "unknown") {
  // 未知类型，放过吧（万一是某种特殊图片呢）
}
```

**这就是"允许所有"的另一种写法。**

**`unknown` 必须拒。**

**如果用户传了你的检测器不认识的新格式（比如 AVIF）：**

```text
① 加进签名表（如果业务需要）
② 或者拒掉，让他转格式
```

**不能"因为不认识所以放行"。**

**这就是"deny by default"（第 62 节讲过）。**

## 坑 5：信任 `info.mimeType`

```javascript
// 错
if (!info.mimeType.startsWith("image/")) return 400;
```

**攻击者一行 curl 就伪造了：**

```text
-F "files=@malware.exe;type=image/jpeg"
```

**`info.mimeType` 是 `image/jpeg`，内容是 exe。**

**所以 `Content-Type` 只能当"提示"，不能当"判据"。**

**这一周的代码里，`info.mimeType` 被存进 `file.contentType`，但**从未用于校验**。**

**这是对的。**

---

# 第 5 步：故意做六个实验（30 分钟）

## 实验 1：改名的 exe

**见 3.3 测试 2。必须做。**

## 实验 2：真图改名为 .exe

**见 3.3 测试 3。**

**再把它改回 `.jpg`，确认能上传成功。**

**这说明扩展名检查是独立有效的（不是"所有 .exe 都拒"）。**

## 实验 3：0 字节文件

```text
node -e "require('fs').writeFileSync('experiments/samples/empty.jpg', '')"
```

**上传。应该返回"文件是空的"（`EMPTY_FILE`）。**

**如果把 `size === 0` 的检查去掉，会返回"无法识别文件类型" —— 错误信息不够准确。**

## 实验 4：polyglot（进阶但值得看）

**一个文件可以既是合法 GIF 又是合法 PHP：**

```text
node -e "require('fs').writeFileSync('experiments/samples/poly.gif', 'GIF89a<?php system($_GET[\"c\"]); ?>')"
```

**上传。**

**会通过（前 6 字节是 `GIF89a`）。**

**为什么：**

**检测器只看前 32 字节的签名，不扫描内容。**

**风险有多大：**

```text
如果你的服务器会执行 .gif 文件 → 危险
但正常配置下不会执行 .gif → 风险低
```

**结合第 64 节的设计（文件不放 `public/`，通过接口读），这个文件即使被上传，也只会被当图片返回，不会被执行。**

**结论：**

> **魔数检测挡的是"傻瓜攻击"，不是"深度攻击"。真正的防线是"不执行用户上传的文件"。**

## 实验 5：`unknown` 类型

**见 3.3 测试 4。**

**注意扩展名是 `.png`，但内容是随机字节。**

**这说明你没被扩展名骗到。**

## 实验 6：`.tmp` 残留检查

**做一个"5 个文件里第 3 个是假图"的测试。**

**用 curl 一次传多个：**

```text
curl.exe -X POST "http://localhost:4030/api/files/upload?kind=image" -H "Cookie: auth_token=ALICE" -F "files=@experiments/samples/real.jpg" -F "files=@experiments/samples/real.png" -F "files=@experiments/samples/fake.jpg" -F "files=@experiments/samples/real.gif"
```

**应该失败（第 3 个是假图）。**

**然后检查 `uploads\.tmp`：**

```text
dir uploads\.tmp
```

**必须是空的（4 个文件的临时文件都被清理了，包括前两个合法的）。**

**如果有残留，你的 `cleanupTmp(files)` 传的不是整个数组。**

---

# 第 6 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. `e02-detect.js` 的完整输出（七行）
2. 四个测试的结果（状态码 + code）
3. polyglot 实验的结论
4. 「卡在哪」

---

# 第 7 步：课后练习

## 练习一：加 HEIC 和 MP4

**HEIC（iPhone 默认）：**

```text
偏移 4-7:   "ftyp"
偏移 8-11:  "heic" / "heix" / "mif1" / "msf1"
```

**MP4：**

```text
偏移 4-7:   "ftyp"
偏移 8-11:  "isom" / "mp42" / "avc1"
```

**两者都在偏移 4 开始，所以 `check` 要写得细。**

**为什么加 HEIC：**

**iPhone 拍的照片默认是 HEIC，浏览器不支持显示（Safari 除外）。**

**如果你不支持检测，用户上传 HEIC 会被拒 —— 而 iPhone 用户占很大比例。**

**支持检测后，第 67 节会做"HEIC 转 JPEG"。**

## 练习二：读图片尺寸，拒绝超大图

**要求：** 10000×10000 以上的图直接拒。

**为什么：**

**`sharp` 处理这么大的图会占 1-2GB 内存。**

**一个用户就能把你的服务打挂。**

**JPEG 的宽高在前几百字节就能拿到：**

```javascript
export const readJpegSize = (buffer) => {
  let offset = 2;

  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) return null;

    const marker = buffer[offset + 1];

    // SOF0-SOF15，排除 DHT(C4) / JPG(C8) / DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    if (offset + 3 >= buffer.length) return null;
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }

  return null;
};
```

**注意：读尺寸要从 `.tmp/` 的文件里读，所以要把 `headBytes` 调大（比如 4096）。**

## 练习三：加"同一用户上传频率限制"

**要求：** 复用第 54 节的 `rateLimit`，给上传接口加限频。

```javascript
import { rateLimit } from "./ratelimit.js";

filesRouter.use(
  rateLimit({
    name: "upload",
    limit: 20,
    windowMs: 60 * 1000,
    keyFn: (req) => `u${req.user?.id || req.ip}`,
  })
);
```

**为什么：**

**上传是最容易被滥用的接口（磁盘 IO 密集）。**

**20 次/分钟足够正常用户，能挡住批量上传脚本。**

## 练习四：想清楚这四个问题

```text
1. 为什么 `Content-Type` 不可信？
2. 为什么"未知类型"必须拒？
3. polyglot 为什么能通过魔数检测？真正的防线是什么？
4. 为什么 `finally` 里 close 在 Windows 上特别重要？
```

---

# 第 8 步：最终验收

## A. 代码

- [ ] `file-type.js` 有 7 种签名
- [ ] 只读前 32 字节
- [ ] `finally` 里有 `close`
- [ ] `upload-policy.js` 有 `POLICY` / `validateUpload` / `UploadError`
- [ ] 四段校验（空/大小/扩展名/魔数）报不同 `code`
- [ ] 校验在 `moveToOriginals` 之前
- [ ] 失败时清理**所有**临时文件
- [ ] 用检测到的扩展名覆盖

## B. 实测

- [ ] `e02-detect.js` 输出 7 行，`fake.jpg → exe`
- [ ] `fake.jpg` 被拒，`TYPE_MISMATCH`
- [ ] 真图改名 `.exe` 被拒，`BAD_EXT`
- [ ] 空文件被拒，`EMPTY_FILE`
- [ ] 随机字节 `.png` 被拒，`UNKNOWN_TYPE`
- [ ] 多文件部分失败后 `.tmp` 是空的

## C. 认知

- [ ] 我能说出三种类型的可信度排序
- [ ] 我知道 polyglot 为什么能过
- [ ] 我知道"未知类型必须拒"的原则名
- [ ] 我知道为什么校验要在搬位置之前

## 本节课要能说出口的一句话

> **扩展名是用户写的，`Content-Type` 是 curl 能改的，只有文件头部的魔数是文件自己说的。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 真图被拒 | 签名表不认这个格式 | 加签名（如 HEIC） |
| `EBUSY` 删不掉 | 句柄没 close | `finally` 里 close |
| `.tmp` 有残留 | 失败没清理全部 | `cleanupTmp(files)` |
| 假图通过了 | 校验在搬位置之后 | 调整顺序 |
| 错误信息太笼统 | 统一报"类型不对" | 分四段报不同 code |
| `unknown` 被放过 | 逻辑写反 | 必须拒 |
| 扩展名和内容对不上 | 没 `replaceExt` | 用检测结果覆盖 |
| 上传后图片打不开 | `.jpg` 里装着 png | 同上 |
| 413 而不是 400 | 大小检查在前 | 这是对的 |
