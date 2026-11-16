# 第 64 节课：选择文件上传——手写一遍 multipart

> **这份文件是你（学员）一步一步照着做的手册。**
> 你可能用过上传组件。但你说不清"文件是怎么到服务器的"。
> 今天你会**手写一个 multipart 解析器**，把一段原始请求体切开，取出文件。做完你就再也不会被上传库坑了。

**建议用时**：160 分钟
**你需要先完成**：第 63 节课（后台能跑，日志能用）

---

# 第 0 步：先看一个上传请求长什么样（15 分钟）

## 0.1 一个真实的请求体

**当你在页面里选了一个文件，点上传，浏览器发出的请求体是这样的（`\r\n` 是回车换行，这里用 ↵ 表示）：**

```text
------WebKitFormBoundary7MA4YWxkTrZu0gW↵
Content-Disposition: form-data; name="title"↵
↵
我的照片↵
------WebKitFormBoundary7MA4YWxkTrZu0gW↵
Content-Disposition: form-data; name="file"; filename="photo.jpg"↵
Content-Type: image/jpeg↵
↵
\xFF\xD8\xFF\xE0\x00\x10JFIF...（这里是图片的二进制内容）
↵
------WebKitFormBoundary7MA4YWxkTrZu0gW--↵
```

## 0.2 拆开看三个部分

**第一：边界字符串（boundary）**

```text
------WebKitFormBoundary7MA4YWxkTrZu0gW
```

**它在请求头里声明：**

```text
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW
```

**作用：分隔每个"段"（part）。**

**为什么需要边界：**

**因为文件内容是任意的二进制，可能包含任何字节。**

**你必须用一个"绝对不会出现在内容里"的字符串来分隔。**

**浏览器用随机字符串保证这一点。**

**注意：请求体里的边界前面多了两个 `--`。**

```text
请求头声明：----WebKitFormBoundary7MA4YWxkTrZu0gW
请求体里是：------WebKitFormBoundary7MA4YWxkTrZu0gW
             └─ 多了两个，总共 6 个减号
```

**这是最容易搞错的一点。记住：请求体里的分隔符 = `--` + `boundary`。**

**结束标记 = `--` + `boundary` + `--`。**

**第二：每一段的头**

```text
Content-Disposition: form-data; name="file"; filename="photo.jpg"
Content-Type: image/jpeg

```

**`name` 是表单字段名（你的 `FormData.append("file", ...)` 里的 "file"）。**

**`filename` 是原文件名。**

**`Content-Type` 是这个文件声明的类型（注意：是浏览器猜的，不可信）。**

**头之后是一个空行（`\r\n\r\n`），然后就是内容。**

**第三：内容**

**普通文本字段：`我的照片`。**

**文件字段：原始的二进制字节。**

## 0.3 为什么文件不能"一次读完"

**因为一个 12MB 的文件，一次读进内存意味着：**

```text
① 单次请求占 12MB 内存
② 20 个用户同时上传 = 240MB
③ 100 个 = 1.2GB → 服务崩
```

**而且 Node 的请求体是**流**：数据一块一块来的。**

**正确做法：**

```text
解析器一边读流，一边判断"当前这块属于哪个段"
遇到文件段 → 直接写到磁盘文件（不存内存）
```

**这就是为什么 `busboy` 是流式的，而不是"先解析完整个 body"。**

**今天你会先手写一个"简易版"（能处理小文件，理解原理），再用 `busboy` 做生产版。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/multipart-lite.js` | `src/` | 手写解析器（理解原理用） |
| `src/upload.js` | `src/` | busboy 封装（生产用） |
| `src/files-routes.js` | `src/` | 上传接口 |
| `public/upload.html` | `public/` | 上传页 |
| `uploads/` | 项目根 | 文件存储目录 |

---

# 第 1 步：先造一个测试请求（20 分钟）

**没有测试样本，你没法验证解析器对不对。**

## 1.1 手工构造一个 multipart 请求体

**新建 `experiments/e01-build-multipart.js`：**

```javascript
import fs from "node:fs";

const BOUNDARY = "----TestBoundary1234567890";

// 一段文本字段
const fieldPart = [
  `--${BOUNDARY}`,
  'Content-Disposition: form-data; name="title"',
  "",
  "我的照片",
].join("\r\n");

// 一段文件字段（用一个假的 JPEG：真实的 JPEG 魔数 + 一些字节）
const fakeJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const fileHeader = [
  `--${BOUNDARY}`,
  'Content-Disposition: form-data; name="file"; filename="photo.jpg"',
  "Content-Type: image/jpeg",
  "",
].join("\r\n");

const endMark = `--${BOUNDARY}--`;

// 拼成完整的 body
const body = Buffer.concat([
  Buffer.from(fieldPart + "\r\n", "utf8"),
  Buffer.from(fileHeader + "\r\n", "binary"),
  fakeJpeg,
  Buffer.from("\r\n" + endMark + "\r\n", "utf8"),
]);

fs.writeFileSync("experiments/sample-multipart.bin", body);

console.log(`boundary: ${BOUNDARY}`);
console.log(`body 大小: ${body.length} 字节`);
console.log(`前 200 字节（转成可读）:`);
console.log(
  body
    .subarray(0, 200)
    .toString("latin1")
    .replace(/\r\n/g, "↵\n")
);
```

**跑：**

```text
node experiments/e01-build-multipart.js
```

**你会看到请求体的结构，`↵` 表示 `\r\n`。**

**对照 0.1 的示例，你应该能看出三段：**

```text
1. title = 我的照片
2. file = photo.jpg（JPEG 二进制）
3. 结束
```

## 1.2 为什么要用 `latin1` 而不是 `utf8` 打印

```javascript
body.subarray(0, 200).toString("latin1")
```

**因为二进制内容用 `utf8` 解会变成一堆 `�`。**

**`latin1` 是"一个字节一个字符"，能原样看到字节。**

**这是调试二进制数据的基本技巧。**

---

# 第 2 步：手写解析器（40 分钟）

## 2.1 新建 `src/multipart-lite.js`

**这个版本只能处理小文件（整个 body 在内存里），但它能让你看懂原理。**

**自己敲：**

```javascript
/**
 * 简易 multipart 解析器。
 * 只为理解原理 —— 生产用 busboy。
 *
 * 输入：完整 body（Buffer）+ boundary（从 Content-Type 头里取）
 * 输出：{ fields: {name: value}, files: [{name, filename, contentType, data}] }
 */
export const parseMultipart = (body, boundary) => {
  if (!Buffer.isBuffer(body)) body = Buffer.from(body);
  if (!boundary) throw new Error("缺少 boundary");

  // 请求体里的分隔符 = "--" + boundary
  const delimiter = Buffer.from(`--${boundary}`, "latin1");
  const endDelimiter = Buffer.from(`--${boundary}--`, "latin1");

  const fields = {};
  const files = [];

  // 从头开始找第一个分隔符
  let cursor = body.indexOf(delimiter);

  if (cursor === -1) throw new Error("找不到 boundary，请求体格式不对");

  while (cursor !== -1) {
    // 分隔符后面是 \r\n，然后是这一段的头
    const start = cursor + delimiter.length;

    // 结束标记（--boundary--）
    if (body.subarray(start, start + 2).toString("latin1") === "--") {
      break;
    }

    // 跳过 \r\n
    const partStart = body.indexOf("\r\n", start);

    if (partStart === -1) break;

    const contentStart = partStart + 2;

    // 找下一个分隔符（它就是这一段的结束）
    const nextCursor = body.indexOf(delimiter, contentStart);

    if (nextCursor === -1) break;

    // 这一段的"内容"是 contentStart 到 nextCursor 前
    // 注意：内容后面还有 \r\n，要去掉
    let contentEnd = nextCursor;

    if (body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) {
      contentEnd -= 2;
    }

    const headerText = body.subarray(partStart + 2, contentStart - 2).toString("utf8");
    const content = body.subarray(contentStart, contentEnd);

    const part = parsePartHeaders(headerText);

    if (part.filename !== null) {
      files.push({
        name: part.name,
        filename: part.filename,
        contentType: part.contentType,
        data: content,
      });
    } else {
      fields[part.name] = content.toString("utf8");
    }

    cursor = nextCursor;
  }

  return { fields, files };
};

/**
 * 解析一段的头。
 * 例：
 *   Content-Disposition: form-data; name="file"; filename="photo.jpg"
 *   Content-Type: image/jpeg
 */
const parsePartHeaders = (text) => {
  const lines = text.split("\r\n");

  let name = null;
  let filename = null;
  let contentType = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith("content-disposition:")) {
      const value = line.slice("content-disposition:".length);
      name = extractParam(value, "name");
      filename = extractParam(value, "filename");
    }

    if (lower.startsWith("content-type:")) {
      contentType = line.slice("content-type:".length).trim();
    }
  }

  return { name, filename, contentType };
};

/**
 * 从 `form-data; name="file"; filename="photo.jpg"` 里取某个参数。
 * 没找到返回 null。
 */
const extractParam = (text, key) => {
  const pattern = new RegExp(`${key}="([^"]*)"`, "i");
  const match = text.match(pattern);

  if (!match) return null;

  return decodeFilename(match[1]);
};

/**
 * 解码文件名。处理三种情况：
 * 1. 明文（photo.jpg）
 * 2. RFC 2047 编码（=?UTF-8?B?...?=）
 * 3. 百分号编码（%E4%BD%A0%E5%A5%BD.jpg）
 */
export const decodeFilename = (raw) => {
  let name = String(raw ?? "");

  // RFC 2047：=?UTF-8?B?base64?= 或 =?UTF-8?Q?...?=
  const rfc2047 = name.match(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/);

  if (rfc2047) {
    const charset = rfc2047[1];
    const encoding = rfc2047[2].toUpperCase();
    const payload = rfc2047[3];

    try {
      if (encoding === "B") {
        name = Buffer.from(payload, "base64").toString(charset === "UTF-8" ? "utf8" : "latin1");
      } else {
        name = Buffer.from(payload.replace(/_/g, " "), "latin1").toString("utf8");
      }
    } catch {
      // 解码失败就用原字符串
    }
  }

  // 百分号编码
  if (name.includes("%")) {
    try {
      name = decodeURIComponent(name);
    } catch {
      // 不是合法的百分号编码，保留原样
    }
  }

  return name;
};
```

## 2.2 五个关键点

### 关键点一：`body.indexOf(delimiter)` 是核心

**整个解析就是"循环找分隔符"：**

```text
找到分隔符 → 它后面到下一个分隔符之间，就是这一段的头和内容
```

**`indexOf` 对 Buffer 也有效，返回字节位置。**

**这是"用最简单的方法解决看似复杂的问题"的典型。**

### 关键点二：注意内容的 `\r\n` 要去掉

```javascript
if (body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) {
  contentEnd -= 2;
}
```

**为什么：**

**请求体是：**

```text
...内容\r\n--boundary...
    ↑   ↑
   内容  这里有个 \r\n 是"分隔符前的换行"，不属于内容
```

**不去掉的话，每个文件末尾都会多出两个字节 `0D 0A`。**

**对于图片，多两个字节可能还能打开（有些解码器容忍），但对于文本文件就会多出空行。**

**这个细节不处理，你会在"下载下来的文件比原来的大 2 字节"上困惑很久。**

### 关键点三：`latin1` 用于分隔符，`utf8` 用于文本

```javascript
const delimiter = Buffer.from(`--${boundary}`, "latin1");     // 分隔符
const headerText = ....toString("utf8");                       // 头部
const fields[part.name] = content.toString("utf8");            // 文本值
```

**为什么分隔符用 `latin1`：**

**因为分隔符是 ASCII（减号和字母数字），`latin1` 和 `utf8` 对 ASCII 的编码完全一样。**

**但 `latin1` 是"字节到字符一一对应"，不会因为你写了一个非 ASCII 字符就变多字节。**

**安全起见，协议层面的字符串用 `latin1`。**

**文本内容用 `utf8`，因为要正确显示中文。**

### 关键点四：`parsePartHeaders` 用 `split("\r\n")`

**不能用 `split("\n")`。**

**因为头部的行分隔符是 `\r\n`。**

**用 `\n` 切，每行末尾会多一个 `\r`，导致 `content-type:` 的判断和值提取出问题。**

**这个坑和 SSE 的 `\n\n` 是同一类（第 47 节）。**

### 关键点五：`decodeFilename` 处理三种情况

**浏览器在不同场景下的编码方式不同：**

```text
Chrome（一般）：photo.jpg                    明文
Safari（某些版本）：=?UTF-8?B?cGhvdG8uanBn?=  RFC 2047
filename* 参数：%E4%BD%A0%E5%A5%BD.jpg        百分号编码
```

**三种都要处理，否则中文文件名会变乱码或者报错。**

**注意 `decodeURIComponent` 要 try/catch：**

**如果文件名里有单个 `%`（比如 `100%.jpg`），`decodeURIComponent` 会抛 `URIError: URI malformed`。**

**这个错会让整个上传失败。** 必须 catch。

## 2.3 写测试验证

**新建 `experiments/e01-test-parse.js`：**

```javascript
import fs from "node:fs";
import { parseMultipart } from "../src/multipart-lite.js";

const body = fs.readFileSync("experiments/sample-multipart.bin");
const boundary = "----TestBoundary1234567890";

const result = parseMultipart(body, boundary);

console.log("=== 解析结果 ===");
console.log("fields:", result.fields);
console.log("files:", result.files.length, "个");

result.files.forEach((file, index) => {
  console.log(`\n文件 ${index + 1}:`);
  console.log("  name:", file.name);
  console.log("  filename:", file.filename);
  console.log("  contentType:", file.contentType);
  console.log("  大小:", file.data.length, "字节");
  console.log("  前 4 字节（hex）:", file.data.subarray(0, 4).toString("hex"));

  // 验证是 JPEG
  const isJpeg = file.data[0] === 0xff && file.data[1] === 0xd8 && file.data[2] === 0xff;
  console.log("  是 JPEG 吗:", isJpeg ? "是" : "否");
});
```

**跑：**

```text
node experiments/e01-test-parse.js
```

**应该看到：**

```text
=== 解析结果 ===
fields: { title: '我的照片' }
files: 1 个

文件 1:
  name: file
  filename: photo.jpg
  contentType: image/jpeg
  大小: 22 字节
  前 4 字节（hex）: ffd8ffe0
  是 JPEG 吗: 是
```

**四个验证点：**

```text
① fields 里的中文正确（说明 utf8 解码对）
② filename 正确
③ 大小是 22 字节（和造的时候一致，说明没多出 \r\n）
④ 前 4 字节是 ffd8ffe0（说明二进制没被破坏）
```

**第 ③ 条最重要。** 如果显示 24 字节，说明你没去掉末尾的 `\r\n`。

---

# 第 3 步：理解为什么生产环境要用流式（20 分钟）

## 3.1 手写版的问题

**现在的解析器：**

```javascript
const body = fs.readFileSync("sample.bin");   // 整个读进内存
```

**换成 HTTP 请求：**

```javascript
app.post("/upload", express.raw({ limit: "50mb" }), (req, res) => {
  const result = parseMultipart(req.body, boundary);   // req.body 是 50MB Buffer
});
```

**问题：**

```text
① 50MB 在内存里（Buffer）
② parseMultipart 又创建了一堆 subarray（虽然共享内存，但 slice 会有引用）
③ 20 个并发 = 1GB
④ 而且如果用户传 200MB，express.raw 的 limit 会拦（但你要设多大？）
```

## 3.2 流式解析的核心思路

**不用"先收集完整 body"，而是：**

```text
边收边扫，找到分隔符就切
        
模式匹配状态机：
  状态 A：正在找分隔符
  状态 B：正在读头部
  状态 C：正在读内容 → 直接写到目标文件
```

**难点：分隔符可能跨越两个数据块。**

```text
块 1 结尾：...------WebKitFormBoun
块 2 开头：dary7MA4YWxkTrZu0gW...
```

**必须保留一段"尾部缓冲"，和下一块拼起来再找。**

**这就是第 47 节 SSE 解析里的同一个技巧（`buffer` 保留残余）。**

## 3.3 装 busboy

```text
npm install busboy
```

**为什么用 busboy 而不是 multer：**

```text
multer 内部就是 busboy
但 multer 把"存哪里、怎么命名"也管了，抽象太多

busboy 只做一件事：把流解析成"字段"和"文件流"
你自己决定怎么处理
```

**这一周要"自己决定"，因为文件名重命名、魔数校验、压缩都要在中间插进去。**

**`npm ls busboy` 确认装上了。**

## 3.4 新建 `src/upload.js`

**自己敲：**

```javascript
import Busboy from "busboy";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const ORIGINAL_DIR = path.join(UPLOAD_DIR, "originals");
const TMP_DIR = path.join(UPLOAD_DIR, ".tmp");

export const ensureUploadDirs = () => {
  [UPLOAD_DIR, ORIGINAL_DIR, TMP_DIR].forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });
};

/**
 * 生成安全的存储文件名。
 * 永远不用用户提供的名字做磁盘文件名。
 */
export const makeStorageKey = (originalName) => {
  const ext = path.extname(String(originalName || "")).toLowerCase().slice(0, 10);
  const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
  const random = crypto.randomBytes(12).toString("hex");

  return `${Date.now().toString(36)}-${random}${safeExt}`;
};

/**
 * 流式接收 multipart。
 *
 * 返回值：
 *   { fields, files }
 *
 * files 里每项：{ field, filename, contentType, size, storageKey, tmpPath }
 *
 * 注意：文件先落到 .tmp/，调用方校验通过后再搬到 originals/。
 */
export const receiveMultipart = ({ req, maxFileSize = 20 * 1024 * 1024, maxFiles = 10 }) =>
  new Promise((resolve, reject) => {
    ensureUploadDirs();

    let busboy;

    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: maxFileSize,
          files: maxFiles,
          fields: 20,
          fieldSize: 100 * 1024,
        },
      });
    } catch (error) {
      return reject(Object.assign(new Error("上传格式不正确"), { statusCode: 400 }));
    }

    const fields = {};
    const files = [];
    const pending = [];
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;

      // 清理已落盘的临时文件
      files.forEach((file) => {
        fs.promises.unlink(file.tmpPath).catch(() => {});
      });

      reject(error);
    };

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      const filename = decodeFilename(info.filename);
      const storageKey = makeStorageKey(filename);
      const tmpPath = path.join(TMP_DIR, `${storageKey}.part`);

      const writeStream = fs.createWriteStream(tmpPath);
      const record = {
        field: name,
        filename,
        contentType: info.mimeType || "application/octet-stream",
        size: 0,
        storageKey,
        tmpPath,
        truncated: false,
      };

      files.push(record);

      stream.on("data", (chunk) => {
        record.size += chunk.length;
      });

      // busboy 在超过 fileSize 时截断流并设置事件
      stream.on("limit", () => {
        record.truncated = true;
      });

      const done = new Promise((resolveDone, rejectDone) => {
        writeStream.on("finish", resolveDone);
        writeStream.on("error", rejectDone);
        stream.on("error", rejectDone);
      });

      pending.push(done);

      stream.pipe(writeStream);
    });

    busboy.on("filesLimit", () => {
      fail(Object.assign(new Error(`最多上传 ${maxFiles} 个文件`), { statusCode: 400 }));
    });

    busboy.on("error", (error) => {
      fail(Object.assign(new Error("解析上传数据失败"), { statusCode: 400, cause: error }));
    });

    busboy.on("finish", async () => {
      if (settled) return;

      try {
        await Promise.all(pending);

        const oversize = files.find((file) => file.truncated);

        if (oversize) {
          return fail(
            Object.assign(
              new Error(`文件超过 ${Math.round(maxFileSize / 1024 / 1024)}MB 上限`),
              { statusCode: 413 }
            )
          );
        }

        settled = true;
        resolve({ fields, files });
      } catch (error) {
        fail(error);
      }
    });

    req.pipe(busboy);
  });

/** 把临时文件搬到最终位置 */
export const moveToOriginals = async (tmpPath, storageKey) => {
  ensureUploadDirs();

  const target = path.join(ORIGINAL_DIR, storageKey);
  await fs.promises.rename(tmpPath, target);

  return target;
};

/** 解码文件名（和 multipart-lite 里同一个函数，这里再写一次避免耦合） */
export const decodeFilename = (raw) => {
  let name = String(raw ?? "");

  const rfc2047 = name.match(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/);

  if (rfc2047) {
    const [, charset, encoding, payload] = rfc2047;

    try {
      name =
        encoding.toUpperCase() === "B"
          ? Buffer.from(payload, "base64").toString("utf8")
          : Buffer.from(payload.replace(/_/g, " "), "latin1").toString("utf8");
    } catch {
      // 保留原样
    }
  }

  if (name.includes("%")) {
    try {
      name = decodeURIComponent(name);
    } catch {
      // 不是合法编码
    }
  }

  return name;
};
```

## 3.5 六个关键点

### 关键点一：文件先落 `.tmp/`，校验通过才搬走

```javascript
const tmpPath = path.join(TMP_DIR, `${storageKey}.part`);
// ...
await moveToOriginals(file.tmpPath, file.storageKey);
```

**为什么：**

```text
如果直接写到 originals/：
  校验失败 → 要删掉 → 万一删失败 → 留下垃圾文件
  而且"未校验的文件"和"合法文件"混在一起

先写 .tmp/：
  校验失败 → 删 tmp → 干净
  校验通过 → rename 到 originals/（原子操作）
```

**`fs.rename` 在同一分区内是原子的。**

**所以 `originals/` 里永远不会出现"写了一半"的文件。**

### 关键点二：`limits.fileSize` 是"截断"不是"报错"

```javascript
limits: { fileSize: maxFileSize }
```

**busboy 的行为：**

```text
文件超过 fileSize → 触发 stream 的 'limit' 事件
                  → 流被截断，后续数据丢弃
                  → 但它不会自动报错！
```

**所以你必须在 `'limit'` 事件里记录，然后在 `finish` 时判断。**

**很多新手以为"设了 limit 就会自动拒绝"，结果发现文件被截断了但接口返回成功。**

**这就是为什么代码里有 `record.truncated`。**

### 关键点三：`pending` 数组收集所有写流的 Promise

```javascript
pending.push(done);
// ...
busboy.on("finish", async () => {
  await Promise.all(pending);
});
```

**为什么需要：**

**`busboy.on("finish")` 在"所有数据都解析完"时触发，但此时**文件写流可能还没写完**（磁盘 IO 比内存慢）。**

**不 await，你会拿到"大小正确但内容不完整"的文件。**

**症状：图片打不开，或者显示一半。**

**这个 bug 极难查，因为 `size` 是对的（`data` 事件已经把大小加完了）。**

### 关键点四：`decodeFilename` 重复写了一次

**为什么不在 `multipart-lite.js` 里 import：**

**因为那个文件是"实验用"的，生产不该依赖它。**

**代价是 30 行重复代码。**

**这是合理的重复：一个给学习用，一个给生产用，两者独立演进。**

**如果你觉得难受，可以抽成 `src/filename.js`。练习里会让你做。**

### 关键点五：错误对象带 `statusCode`

```javascript
Object.assign(new Error("上传格式不正确"), { statusCode: 400 })
```

**为什么：**

**你的统一错误处理（第 56 节）会检查 `error.statusCode`。**

**带了，就能返回 400；不带，就变成 500。**

**"用户传了坏数据"是 400，"服务器崩了"是 500。** 不能混。

### 关键点六：`req.pipe(busboy)`

**这一行是"流式"的关键。**

**它把 HTTP 请求体直接交给 busboy 解析，**没有中间缓冲**。**

**对比：**

```javascript
// 错（先攒完再解析）
app.post("/upload", express.raw({ limit: "50mb" }), handler);   // 50MB 在内存

// 对（流式）
app.post("/upload", (req, res) => {
  const { files } = await receiveMultipart({ req });   // 边收边解析
});
```

**第二种的内存占用是常数（缓冲区大小），与文件大小无关。**

---

# 第 4 步：写上传接口（30 分钟）

## 4.1 新建 `src/files-routes.js`

```javascript
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { requireAuth } from "./auth.js";
import { receiveMultipart, moveToOriginals, ensureUploadDirs } from "./upload.js";

export const filesRouter = express.Router();

filesRouter.use(requireAuth);

filesRouter.post("/upload", async (req, res, next) => {
  const started = Date.now();

  try {
    const { fields, files } = await receiveMultipart({
      req,
      maxFileSize: 20 * 1024 * 1024,
      maxFiles: 5,
    });

    if (files.length === 0) {
      return res.status(400).json({ error: "没有收到文件" });
    }

    const saved = [];

    for (const file of files) {
      // 第 65 节会在这里加"类型和大小校验"
      // 现在先只搬位置

      await moveToOriginals(file.tmpPath, file.storageKey);

      saved.push({
        field: file.field,
        filename: file.filename,
        contentType: file.contentType,
        size: file.size,
        storageKey: file.storageKey,
      });
    }

    console.log(
      `[upload] uid=${req.user.id} 收到 ${saved.length} 个文件，` +
        `共 ${saved.reduce((sum, file) => sum + file.size, 0)} 字节，` +
        `耗时 ${Date.now() - started}ms`
    );

    res.status(201).json({
      message: `已上传 ${saved.length} 个文件`,
      fields,
      files: saved,
    });
  } catch (error) {
    // 任何失败：清理可能残留的临时文件
    console.error("[upload] 失败：", error.message);
    next(error);
  }
});
```

## 4.2 在 `app.js` 里挂上

**两个改动：**

### 改动一：挂路由（在 `adminRouter` 附近）

```javascript
import { filesRouter } from "./files-routes.js";

// ... 其他 app.use ...

app.use("/api/files", filesRouter);
```

**注意：不要给这个路由加 `express.json()`。** 因为它是 multipart，不需要 JSON 解析。

**`app.use(express.json({ limit: "64kb" }))` 是全局的，但它只处理 `Content-Type: application/json` 的请求，对 multipart 会自动 `next()`。**

**所以不会冲突。**

### 改动二：启动时建目录

**在 `app.listen` 之前加：**

```javascript
import { ensureUploadDirs } from "./upload.js";

ensureUploadDirs();
```

**为什么：**

**不建目录，第一次上传会报 `ENOENT: no such file or directory`。**

**虽然 `receiveMultipart` 里也调了，但启动时建一次更清楚（而且能早发现权限问题）。**

### 改动三：静态目录不要包含 uploads

**检查 `app.js` 里的 `express.static`：**

```javascript
app.use(express.static(path.join(DIR, "..", "public")));
```

**确认它指向 `public/`，不是项目根。**

**`uploads/` 在项目根，所以不会被静态服务暴露。**

**验证方法（做完一定要试）：**

```text
curl.exe http://localhost:4030/uploads/originals/xxxx.jpg
```

**应该 404。**

**如果 200，说明你的静态目录指错了 —— 这是严重漏洞（任何人能下载任何人的文件）。**

## 4.3 写上传页

**新建 `public/upload.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>上传文件</title>
  <link rel="stylesheet" href="/admin.css" />
</head>
<body>
  <div class="layout">
    <aside class="sidebar"></aside>

    <main class="main">
      <div class="page-head">
        <div>
          <h1>上传文件</h1>
          <div class="sub">单文件最大 20MB，一次最多 5 个</div>
        </div>
      </div>

      <div class="alert" id="alert"></div>

      <div class="panel">
        <div class="panel-body">
          <div class="field">
            <label for="title">标题（文本字段，用来验证表单混合提交）</label>
            <input id="title" type="text" placeholder="例如：产品实拍" />
          </div>

          <div class="field">
            <label for="files">选择文件</label>
            <input id="files" type="file" multiple />
            <div class="hint">
              提示：`accept` 只是给用户看的建议，服务端仍会自己校验
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:18px">
            <button id="submit" class="primary">上传</button>
            <button id="clear">清空</button>
          </div>

          <div id="progress" style="margin-top:16px;font-size:13px;color:#6b7280"></div>

          <div id="result" style="margin-top:16px"></div>
        </div>
      </div>
    </main>
  </div>

  <script type="module">
    import { guard, renderSidebar, esc, showAlert } from "/admin.js";

    const alertEl = document.getElementById("alert");
    const filesEl = document.getElementById("files");
    const titleEl = document.getElementById("title");
    const progressEl = document.getElementById("progress");
    const resultEl = document.getElementById("result");

    const fmtSize = (bytes) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const upload = async () => {
      const files = [...filesEl.files];

      if (files.length === 0) {
        showAlert(alertEl, "请先选择文件", "error");
        return;
      }

      const form = new FormData();
      form.append("title", titleEl.value);
      files.forEach((file) => form.append("files", file));

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);

      resultEl.innerHTML = "";
      progressEl.textContent = `上传中…… ${files.length} 个文件，共 ${fmtSize(totalSize)}`;

      const btn = document.getElementById("submit");
      btn.disabled = true;
      const started = performance.now();

      try {
        const response = await fetch("/api/files/upload", {
          method: "POST",
          body: form,   // 注意：不要设 Content-Type，让浏览器自己设（带 boundary）
          credentials: "same-origin",
        });

        const data = await response.json().catch(() => ({}));
        const ms = Math.round(performance.now() - started);

        if (!response.ok) {
          progressEl.textContent = "";
          showAlert(alertEl, data.error || `上传失败（HTTP ${response.status}）`, "error");
          return;
        }

        progressEl.textContent = `完成，用时 ${ms}ms`;

        resultEl.innerHTML = `
          <div style="font-size:13px;color:#15803d;margin-bottom:8px">
            ✅ ${esc(data.message)}　耗时 ${ms}ms
          </div>
          <table>
            <thead>
              <tr><th>原文件名</th><th class="num">大小</th><th>声明的类型</th><th>存储键</th></tr>
            </thead>
            <tbody>
              ${data.files
                .map(
                  (file) => `
                <tr>
                  <td>${esc(file.filename)}</td>
                  <td class="num">${fmtSize(file.size)}</td>
                  <td><span class="tag gray">${esc(file.contentType)}</span></td>
                  <td style="font-family:monospace;font-size:11.5px;color:#6b7280">${esc(file.storageKey)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        `;
      } catch (error) {
        progressEl.textContent = "";
        showAlert(alertEl, `网络错误：${error.message}`, "error");
      } finally {
        btn.disabled = false;
      }
    };

    const main = async () => {
      const user = await guard();
      if (!user) return;

      renderSidebar("files", user);

      document.getElementById("submit").addEventListener("click", upload);

      document.getElementById("clear").addEventListener("click", () => {
        filesEl.value = "";
        titleEl.value = "";
        progressEl.textContent = "";
        resultEl.innerHTML = "";
        alertEl.classList.remove("show");
      });
    };

    main();
  </script>
</body>
</html>
```

## 4.4 把"文件"加进侧栏（5 分钟，必须做）

**上面代码里 `renderSidebar("files", user)` 用了一个新的 key。**

**但第 57 节的 `NAV_ITEMS` 里只有三个菜单（总览 / 用户 / 日志），没有"文件"。**

**所以侧栏不会高亮任何一项 —— 用户看页面时不知道自己在哪。**

**打开 `public/admin.js`，找到 `NAV_ITEMS`，加上第四项：**

```javascript
const NAV_ITEMS = [
  { href: "/admin/index.html", label: "总览", key: "index" },
  { href: "/admin/users.html", label: "用户", key: "users" },
  { href: "/admin/logs.html", label: "日志", key: "logs" },
  { href: "/upload.html", label: "上传", key: "files" },
];
```

**注意三件事：**

1. **`key` 是 `"files"`，不是 `"upload"`。** 因为 `files.html`（第 66 节）建好之后，上传和列表会合成一个页面，这个 key 要一直用下去。现在写成 `"upload"`，第 66 节还得改回来。
2. **`href` 是 `/upload.html`，不是 `/files.html`。** `files.html` 第 66 节才建，现在写进去点一下就 404。
3. **`href` 不带 `admin/` 前缀。** 文件页放在 `public/` 根，不在 `public/admin/` 下（原因见下）。

**第 66 节建完 `files.html` 之后，把这一行的 `href` 改成 `/files.html`、`label` 改成 `"文件"` —— 到那一步我会提醒你。**

**改完 `NAV_ITEMS` 后保存，`admin.js` 是浏览器直接加载的，不用重启服务，刷新页面就生效。**

**为什么文件页放在 `public/` 根而不是 `public/admin/`：**

**因为"上传自己的文件"是所有登录用户都该有的功能，不是管理员专属。**

**但这一周有一个已知限制，你必须知道：**

**第 57 节的 `guard()` 只放行 `admin` 和 `operator`。**

**所以你现在这两个文件页实际上只有这两种角色能进。**

**普通 `user` 角色访问会被 `guard()` 挡在"没有访问权限"页。**

**这一周先接受这个限制**（你的测试库里只有 alice=admin、bob=operator，都进得去），

**第 24 周做多租户时会把 `guard()` 拆成两个：**

```text
guardAdmin()     只放 admin / operator（后台管理页用）
guardLoggedIn()  任何登录用户（文件页、个人中心用）
```

**到那时把文件页的 `guard()` 换成 `guardLoggedIn()` 就行，其他代码不用改。**

**这也是为什么"守卫逻辑"要独立成一个函数而不是各页自己写 —— 改一处就全生效。**

**刷新页面，侧栏应该出现"上传"，并且当前高亮。**

**顺手验证一下：点侧栏"总览"能回去，点"上传"能回来。来回切三次，高亮要跟着变。**

**如果高亮不动（一直停在"总览"），说明 `renderSidebar` 的第一个参数传错了 —— 它必须和 `key` 完全一样。**

## 4.5 三个关键点

### 关键点一：不要手动设 `Content-Type`

```javascript
const response = await fetch("/api/files/upload", {
  method: "POST",
  body: form,   // 不要加 headers: { "Content-Type": "multipart/form-data" }
});
```

**为什么：**

**浏览器会自动设置成：**

```text
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW
```

**`boundary` 是随机生成的，只有浏览器知道。**

**如果你手动设 `Content-Type: multipart/form-data`（不带 boundary），服务端无法解析。**

**症状：**

```text
busboy 抛 "Multipart: Boundary not found"
→ 400 上传格式不正确
```

**这是最常见的上传错误。记住：`fetch` + `FormData` 时不要设 `Content-Type`。**

### 关键点二：`fields` 和文件可以在同一个请求里

```javascript
form.append("title", titleEl.value);        // 文本字段
files.forEach((file) => form.append("files", file));   // 文件
```

**这就是 multipart 的价值：混合提交。**

**服务端能同时拿到：**

```javascript
{ fields: { title: "产品实拍" }, files: [...] }
```

**如果用 `application/json`，你没法传文件。**

**如果用 `application/octet-stream`（纯二进制），你没法传其他字段。**

### 关键点三：进度用 performance.now()，但没有真实上传进度

**`fetch` 上传**不提供进度事件**（除非用 `XMLHttpRequest` 或 `ReadableStream`）。**

**所以这里只显示"上传中……"和总耗时。**

**要真实进度条，两种方案：**

```text
A. 用 XMLHttpRequest（有 upload.onprogress）
B. 用 fetch + ReadableStream 上传（浏览器支持度不好）
```

**这一周不做进度条。20MB 在本地是秒传，用不上。**

**真实项目里，如果客户经常传大文件，就值得做（用 XHR）。**

## 4.6 测试

**1. 登录后台，打开：**

```text
http://localhost:4030/upload.html
```

**2. 找一张真实照片（手机拍的更好，最好有几 MB）。**

**3. 填标题，选文件，点上传。**

**4. 应该看到：**

```text
✅ 已上传 1 个文件　耗时 320ms

原文件名            大小      声明的类型      存储键
IMG_2024.jpg       3.42 MB   image/jpeg     ly8x2a-3f9c8b...
```

**5. 去磁盘确认：**

```text
dir uploads\originals
```

**应该看到一个文件名类似 `ly8x2a-3f9c8b1d2e3f.jpg` 的文件。**

**6. 确认文件是真的（能打开）：**

**在资源管理器里双击它。**

**应该能用系统看图软件打开。**

**如果能打开，说明你的流式写入是正确的（字节没错、没被截断）。**

**如果打不开或只显示一半，回到 3.5 关键点三：`pending` 的 await 有没有写。**

---

# 第 5 步：五个必须知道的坑（30 分钟）

## 坑 1：手动设了 `Content-Type`

**见 4.4 关键点一。**

**症状：**

```text
busboy 报 "Multipart: Boundary not found"
```

**排查：**

**F12 → Network → 点上传请求 → Headers → 看 `Content-Type`。**

**正确的应该是：**

```text
multipart/form-data; boundary=----WebKitFormBoundaryxxxx
```

**如果你看到的是 `multipart/form-data` 没有 `boundary`，就是这个问题。**

## 坑 2：`express.json()` 把 multipart 请求吃了

**`express.json()` 只处理 `Content-Type: application/json`。**

**理论上不会吃 multipart。**

**但如果你用了 `express.raw({ type: "*/*" })`：**

```javascript
app.use(express.raw({ type: "*/*" }));   // 灾难
```

**它会把**所有**请求体读成 Buffer，包括 multipart。**

**然后 `req.pipe(busboy)` 时，流已经被消费完了（空流）。**

**症状：**

```text
busboy 收到空请求体 → finish 立即触发 → files 是空数组
→ 接口返回"没有收到文件"
```

**排查：**

```javascript
console.log("req.readableEnded:", req.readableEnded);
```

**在 `receiveMultipart` 开头打印。如果 `true`，说明流已经被读完了。**

**修法：不要用 `type: "*/*"` 的 raw 中间件。**

## 坑 3：413 来自全局 `express.json` 的 limit

**现象：**

**传 5MB 的文件，返回 413，但错误信息是 `request entity too large`，而且你的上传代码根本没执行。**

**原因：**

**虽然 `express.json` 不处理 multipart，但 **Express 在读取请求体时会受 `limit` 影响**？**

**不，`express.json()` 只对匹配的 `Content-Type` 生效。**

**413 更可能来自：**

```text
① 你的上传接口用了 express.raw({ limit: "1mb" })
② 反向代理（Nginx 默认 1MB）—— 第 31 周才有
③ Node 的默认限制（一般没有）
```

**排查：**

**在 `receiveMultipart` 第一行加日志：**

```javascript
console.log("[upload] 开始接收，content-length:", req.headers["content-length"]);
```

**如果这行没打印，说明请求根本没到你的代码 —— 是被上游中间件拦了。**

**如果打印了但立刻报错，看 `error.type`。**

## 坑 4：中文文件名乱码

**现象：**

```text
原文件名显示成 "ä½ å¥½.jpg"
或者 "=?UTF-8?B?5L2g5aW9LmpwZw==?="
```

**原因：**

```text
① 浏览器发的是 RFC 2047 编码
② 或者拉丁字符集误解
③ 你的 decodeFilename 没生效
```

**验证：**

**在上传接口里打印原始 filename：**

```javascript
console.log("[upload] 原始 filename:", JSON.stringify(info.filename));
```

**如果打印出来是 `=?UTF-8?B?...?=`，说明需要解码。**

**如果打印出来是 `ä½ å¥½`，说明是"UTF-8 字节被当成 latin1 解了"。**

**后者的修法：**

```javascript
const fixed = Buffer.from(info.filename, "latin1").toString("utf8");
```

**为什么：**

**busboy 在解析时，如果头部不是 UTF-8 编码的，会让字节以 latin1 形式穿过。**

**你用 `Buffer.from(x, "latin1")` 拿回原字节，再用 `utf8` 解，就对了。**

**把这一句加到 `decodeFilename` 里（作为第一种处理的兜底）：**

```javascript
export const decodeFilename = (raw) => {
  let name = String(raw ?? "");

  // 处理"UTF-8 字节被当 latin1"的情况
  if (/[\u0080-\u00ff]/.test(name) && !/[\u4e00-\u9fa5]/.test(name)) {
    const guess = Buffer.from(name, "latin1").toString("utf8");
    if (!guess.includes("\uFFFD")) name = guess;
  }

  // ... RFC 2047 和百分号解码 ...
};
```

**注意 `!guess.includes("\uFFFD")`：**

**`\uFFFD` 是替换字符 `�`。如果解码后出现它，说明这不是合法的 UTF-8，不该用这个猜测。**

**这个"猜测"策略很重要 —— 你不能盲目转，否则会把正常的 ASCII 文件名搞坏。**

## 坑 5：文件写了一半

**见 3.5 关键点三。**

**症状：**

```text
① response 里 size 是对的
② 文件存在
③ 但打不开 / 只显示一半
```

**排查：**

```javascript
// 对比磁盘文件实际大小和记录的大小
const stat = fs.statSync(path.join(ORIGINAL_DIR, storageKey));
console.log("记录大小:", file.size, "磁盘大小:", stat.size);
```

**不相等 → 你的 `pending` 没 await。**

**这个 bug 特别坑，因为：**

```text
① 小文件不会出现（一次写完就 finish 了）
② 大文件才出现（写流比数据流慢）
③ 所以你在开发时传小图测试，一切正常，上线后客户传大图才崩
```

---

# 第 6 步：故意做五个实验（30 分钟）

## 实验 1：手写版 vs busboy 版对比

**用同一个文件，跑两遍：**

```text
① 用 multipart-lite 解析（先 express.raw 读完整 body）
② 用 busboy 解析
```

**记录：**

```text
文件大小：12MB
lite 版内存峰值：？
busboy 版内存峰值：？
```

**怎么测内存：**

```javascript
// 在解析前后各打印一次
const before = process.memoryUsage().heapUsed;
// ... 解析 ...
const after = process.memoryUsage().heapUsed;
console.log("增加:", Math.round((after - before) / 1024 / 1024), "MB");
```

**你会看到 lite 版增加约等于文件大小，busboy 版增加很小（几 MB）。**

**这就是"流式"的意义。**

## 实验 2：手动设 `Content-Type`

**改前端：**

```javascript
headers: { "Content-Type": "multipart/form-data" },
```

**点上传。**

**应该报错 `Multipart: Boundary not found`。**

**改回来（删掉 headers）。**

## 实验 3：传一个 25MB 的文件

**先造一个大文件：**

```text
node -e "require('fs').writeFileSync('big.bin', Buffer.alloc(25*1024*1024))"
```

**在页面上传它。**

**应该返回 413（或者 400），错误信息是"文件超过 20MB 上限"。**

**注意看 `uploads/.tmp/` 里有没有残留：**

```text
dir uploads\.tmp
```

**应该是空的（失败时清理了）。**

**如果有残留，说明你的 `fail()` 里的清理没生效。**

## 实验 4：文件名用中文

**把照片改名成 `我的照片.jpg`，上传。**

**看响应里的 `filename`。**

**应该正确显示中文。**

**如果乱码，按坑 4 处理。**

## 实验 5：同时传 6 个文件

**选 6 个文件上传（`maxFiles` 是 5）。**

**应该返回 400，错误是"最多上传 5 个文件"。**

**检查 `.tmp/` 是否干净。**

## 6.x 清理实验产生的垃圾

```text
del uploads\originals\*.jpg
del uploads\.tmp\*.part
del big.bin
```

**（`del` 不存在的文件会报"找不到"，忽略即可。）**

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 一个真实的 multipart 请求体（贴前 300 字节，用 `↵` 表示 `\r\n`）
2. lite 版和 busboy 版的内存对比
3. 五个实验各自的现象
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：把 `decodeFilename` 抽成 `src/filename.js`

**要求：**

1. 新建 `src/filename.js`，把 `decodeFilename` 移过去
2. `multipart-lite.js` 和 `upload.js` 都 import 它
3. 加单元测试（`node:test`），测这五种输入：

```text
photo.jpg                      → photo.jpg
我的照片.jpg                    → 我的照片.jpg
=?UTF-8?B?5oiR55qE54Wn54mHLmpwZw==?=  → 我的照片.jpg
%E6%88%91%E7%9A%84%E7%85%A7%E7%89%87.jpg → 我的照片.jpg
100%.jpg                       → 100%.jpg（不能抛错）
```

**为什么做：** 文件名处理是最容易出错、最值得有测试的地方。

## 练习二：加"上传进度"

**要求：** 用 `XMLHttpRequest` 替换 `fetch`，实现真实进度条。

```javascript
const xhr = new XMLHttpRequest();
xhr.upload.onprogress = (event) => {
  if (event.lengthComputable) {
    const percent = Math.round((event.loaded / event.total) * 100);
    progressEl.textContent = `上传中 ${percent}%`;
  }
};
xhr.open("POST", "/api/files/upload");
xhr.withCredentials = true;
xhr.send(form);
```

**为什么 `fetch` 不行：**

**`fetch` 没有上传进度事件，这是它的已知局限。**

**（新的 `fetch` 有 `Request.body` 流上传，但浏览器支持不好。）**

## 练习三：把上传记录到审计日志

**要求：** 上传成功后调 `audit.log()`：

```javascript
log({
  ...actorFrom(req),
  action: "file.upload",
  targetType: "file",
  targetId: file.storageKey,
  note: `${file.filename} (${file.size} 字节)`,
  ok: true,
});
```

**为什么：** 第 63 节刚做的审计，上传也是"改数据"，该记。

## 练习四：想清楚这四个问题

```text
1. 为什么请求体里的分隔符比请求头里的 boundary 多两个减号？
2. 为什么不能用"一次读完整个 body"的方式处理上传？
3. `limits.fileSize` 为什么不会自动报错？
4. 为什么上传的文件不能放 public/？
```

---

# 第 9 步：最终验收

## A. 环境

- [ ] `npm install busboy` 成功
- [ ] `uploads/`、`uploads/originals/`、`uploads/.tmp/` 三个目录自动创建
- [ ] `uploads/` 在 `.gitignore` 里（不要提交用户文件）

**检查 `.gitignore`：**

```text
grep -n "uploads" .gitignore
```

**没有就加：**

```text
uploads/
```

## B. 代码

- [ ] `multipart-lite.js` 能正确解析样本（三个验证点：中文字段、filename、字节数）
- [ ] `upload.js` 用 busboy，流式
- [ ] 文件先落 `.tmp/`，成功后 `rename` 到 `originals/`
- [ ] `pending` 里 await 了所有写流
- [ ] `limits.fileSize` 触发时返回 413
- [ ] 失败时清理临时文件
- [ ] 错误对象带 `statusCode`

## C. 实测

- [ ] 传一张 3MB 照片成功，磁盘文件能打开
- [ ] 传 25MB 文件被拒，`.tmp` 干净
- [ ] 传 6 个文件被拒（maxFiles=5）
- [ ] 中文文件名正确
- [ ] `curl /uploads/originals/xxx` 返回 404
- [ ] 我做过 lite vs busboy 的内存对比
- [ ] 侧栏出现"上传"，点进去能打开上传页且当前高亮

## D. 认知

- [ ] 我能画出 multipart 请求体的结构
- [ ] 我知道边界字符串在请求头和请求体里的差别
- [ ] 我知道流式解析为什么省内存
- [ ] 我知道为什么文件不能放 `public/`

## 本节课要能说出口的一句话

> **`multipart/form-data` 就是"用边界字符串切段"。文件内容可能是任意二进制，所以边界必须随机。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `Boundary not found` | 手动设了 `Content-Type` | 删掉，让浏览器设 |
| 收到 0 个文件 | 流已被中间件读完 | 检查有没有 `express.raw({type:"*/*"})` |
| 文件只有一半 | 没 await 写流 | `await Promise.all(pending)` |
| 中文名乱码 | 没解码 | `decodeFilename` |
| 413 但代码没执行 | 上游中间件拦了 | 加日志确认 |
| `ENOENT` | 目录不存在 | `ensureUploadDirs()` |
| 每次文件名都一样 | 用了原文件名 | `makeStorageKey` 加随机 |
| `.tmp` 有残留 | 失败没清理 | 检查 `fail()` |
| 传 100MB 卡死 | 没设 `fileSize` | 设 20MB |
| `uploads` 被提交进 Git | 没加 `.gitignore` | 加上 |
