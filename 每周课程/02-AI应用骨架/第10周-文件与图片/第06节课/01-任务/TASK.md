# 第 69 节课：PDF 和图片预览——不下载也能看

> **这份文件是你（学员）一步一步照着做的手册。**
> 前五节你已经能上传、压缩、出缩略图。但用户点一个 PDF，浏览器弹"下载"，然后他用 WPS 打开。
> 今天让 PDF 在页面里翻页，图片能全屏、能切换、能缩放。

**建议用时**：155 分钟
**你需要先完成**：第 68 节课（缩略图能用，列表显示 small）

---

# 第 0 步：三个必须先搞清的问题（10 分钟）

## 0.1 为什么 PDF 会"被下载"而不是"被显示"

**浏览器决定"显示"还是"下载"，看 `Content-Disposition` 头。**

| 头 | 行为 |
|---|---|
| `inline` | 尽量在页面内显示 |
| `attachment` | 强制下载 |

**第 66 节的 `raw` 接口已经设了 `inline`：**

```javascript
res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
```

**所以 PDF 应该能直接在内嵌框里显示。**

**如果不显示，只可能是三个原因：**

```text
① 你的浏览器禁用了内置 PDF 查看器
② Content-Disposition 是 attachment
③ Content-Type 不是 application/pdf
```

**逐个排查。**

## 0.2 三种预览方案

| 方案 | 实现 | 优点 | 缺点 |
|---|---|---|---|
| **`<iframe>`** | 一行标签 | 0 依赖，浏览器原生 | 不能控制行为，样式改不了 |
| **PDF.js** | 引 300KB 的库 | 完全可控 | 重，要 CDN 或打包 |
| **转成图片** | 服务端用 poppler 渲染 | 可控 + 兼容好 | 要装系统依赖，慢 |

**这一周用 `<iframe>`。**

**为什么：**

```text
① 0 依赖，一行代码
② 现代浏览器的内置 PDF 查看器已经很好了（翻页、缩放、搜索、打印）
③ 你花三天做的 PDF.js 方案，体验还不如原生的
```

**真实项目里什么时候该用 PDF.js：**

```text
① 要"页面上叠加批注"（原生查看器做不到）
② 要"禁用下载/打印"（原生做不到）
③ 支持非常老的浏览器（IE）
```

**这三种情况，这一周都不涉及。**

## 0.3 一个真实的坑：PDF 需要 `Range` 请求

**PDF 文件可能几十页、几十MB。**

**浏览器不会"一次下载完再显示"，而是"先下前面几页，翻到后面再请求那部分"。**

**这靠 HTTP 的 `Range` 头：**

```text
请求：Range: bytes=0-1023
响应：206 Partial Content
      Content-Range: bytes 0-1023/5242880
```

**如果服务端不支持 `Range`：**

```text
① 浏览器每次都想从头下载
② 大 PDF 要等很久（几十秒）
③ 有些浏览器直接放弃，显示"加载失败"
```

**这是什么症状：**

```text
小 PDF（1MB）能看
大 PDF（20MB）点开一直转圈，或者报"文件损坏"
```

**第 66 节的 `createReadStream(...).pipe(res)` **不支持** `Range`。**

**今天要补上。这是本节最重要的技术点。**

## 0.4 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `src/range.js` | `src/` | `Range` 请求支持 |
| `src/files-routes.js` | `src/` | 改：`raw` 接口支持 Range |
| `public/view.html` | `public/` | 预览页（图片查看器 + PDF iframe） |
| `public/files.html` | `public/` | 改：点"查看"跳到 `view.html` |

---

# 第 1 步：补 `Range` 支持（40 分钟）

## 1.1 先看没有 Range 会出现什么

**在你做任何修改之前，先测一次。**

**1. 找一个大的 PDF（10MB 以上）。**

**没有的话，找一个公开的大 PDF：**

```text
curl.exe -o experiments/samples/big.pdf "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
```

**这个是小的（13KB）。要测 Range，你需要大文件。**

**造一个大的：**

```text
node -e "const fs=require('fs'); const head=Buffer.from('%PDF-1.7\n'); fs.writeFileSync('experiments/samples/big.pdf', Buffer.concat([head, Buffer.alloc(20*1024*1024, 0x20)]))"
```

**这个文件不是真 PDF（内容全是空格），但能测"文件大小 / Range 行为"。**

**要测真实预览，还得用真 PDF。折中：用 1-2MB 的真实 PDF（网上找一份公开文档）。**

**2. 上传它（`kind` 用 `?kind=document`）。**

**3. 点"查看"。**

**4. F12 → Network → 看 `raw` 请求：**

```text
Status: 200
Response Headers: 没有 Content-Length，没有 Accept-Ranges
```

**5. 用 curl 明确发 `Range` 请求：**

```text
curl.exe -i -H "Cookie: auth_token=ALICE" -H "Range: bytes=0-99" "http://localhost:4030/api/files/1/raw"
```

**现在的行为：**

```text
HTTP/1.1 200 OK
（返回整个文件，不是 206）
```

**正确行为应该是：**

```text
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-99/20971520
Content-Length: 100
（只返回前 100 字节）
```

**这就是今天要修的。**

## 1.2 新建 `src/range.js`

```javascript
import fs from "node:fs";

/**
 * 解析 Range 头。
 * 支持：bytes=0-99 / bytes=100- / bytes=-500（最后 500 字节）
 *
 * 返回 { start, end } 或 null（无法解析/不支持）
 */
export const parseRange = (rangeHeader, fileSize) => {
  if (!rangeHeader || typeof rangeHeader !== "string") return null;

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) return null;   // 多段 Range 不支持，返回 null 让调用方退化成 200

  const [, startRaw, endRaw] = match;

  // bytes=-500 → 最后 500 字节
  if (startRaw === "" && endRaw !== "") {
    const suffix = Number(endRaw);

    if (!Number.isFinite(suffix) || suffix <= 0) return null;

    return { start: Math.max(0, fileSize - suffix), end: fileSize - 1 };
  }

  // bytes=100- → 从 100 到结尾
  if (startRaw !== "" && endRaw === "") {
    const start = Number(startRaw);

    if (!Number.isFinite(start) || start < 0 || start >= fileSize) return null;

    return { start, end: fileSize - 1 };
  }

  // bytes=0-99 → 0 到 99
  const start = Number(startRaw);
  const end = Number(endRaw);

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= fileSize) return null;
  if (end < start) return null;

  return { start, end: Math.min(end, fileSize - 1) };
};

/**
 * 把文件以"支持 Range"的方式发给客户端。
 *
 * 必须在设置 Content-Type 之后、发送之前调用。
 */
export const sendFileWithRange = async ({ req, res, filePath, contentType, cacheControl }) => {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);

  if (cacheControl) res.setHeader("Cache-Control", cacheControl);

  res.setHeader("X-Content-Type-Options", "nosniff");

  const range = parseRange(req.headers.range, fileSize);

  // 没有 Range：正常返回整个文件
  if (!range) {
    res.setHeader("Content-Length", fileSize);

    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }

    res.status(200);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 有 Range：206 Partial Content
  const { start, end } = range;
  const chunkSize = end - start + 1;

  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  res.setHeader("Content-Length", chunkSize);

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath, { start, end }).pipe(res);
};
```

## 1.3 五个关键点

### 关键点一：`fs.createReadStream(filePath, { start, end })`

**这是 Node 内置的 Range 支持。**

**`start` 和 `end` 都是**闭区间**（包含 end 字节）。**

**所以 `chunkSize = end - start + 1`（不是 `end - start`）。**

**写错会少一个字节 —— PDF 解析器可能因此报"文件损坏"。**

### 关键点二：`206` 和 `Content-Range` 必须配对

```javascript
res.status(206);
res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
```

**`Content-Range` 的格式是固定的：**

```text
bytes <start>-<end>/<total>
```

**注意是 `bytes`（复数），不是 `byte`。**

**浏览器按这个格式解析，写错了它会重试或放弃。**

### 关键点三：非法 Range 退化成 200

**按 RFC 7233，如果 Range 无法满足（比如 `start >= fileSize`），应该返回 `416 Range Not Satisfiable`。**

**但这一周的做法是"退化成 200 返回全文件"。**

**为什么：**

```text
① 更宽容 —— 有些客户端发的 Range 不规范
② 用户体验更好 —— 至少能看到文件（虽然慢）
③ 416 会让某些查看器直接报错
```

**这不符合 RFC 的严格定义，但更实用。**

**如果你要做严格的（比如给 CDN 用），就返回 416：**

```javascript
if (!range && req.headers.range) {
  return res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
}
```

**这一周选宽容。**

### 关键点四：`Accept-Ranges: bytes` 要一直发

```javascript
res.setHeader("Accept-Ranges", "bytes");
```

**不管这次有没有 Range，都要告诉客户端"我支持"。**

**浏览器看到这个头，才会在需要时发 Range 请求。**

**不发的话，它会认为"不支持分段"，只能从头下载。**

### 关键点五：`HEAD` 请求要单独处理

```javascript
if (req.method === "HEAD") {
  res.status(200).end();
  return;
}
```

**为什么：**

**`HEAD` 是"只要头，不要内容"。**

**不处理的话，你会 `pipe` 一个流给一个不接收内容的响应 —— 浪费带宽（虽然客户端会丢弃）。**

**更严重：某些情况下会报 `ERR_STREAM_PREMATURE_CLOSE`。**

**处理它，成本 3 行。**

## 1.4 改进 `raw` 接口

**打开 `files-routes.js`，把 `/:id/raw` 换成：**

```javascript
import { sendFileWithRange } from "./range.js";

filesRouter.get("/:id/raw", (req, res) => {
  const file = getFileById(req.params.id);

  if (!file || file.deletedAt) {
    return res.status(404).json({ error: "文件不存在" });
  }

  if (file.userId !== req.user.id) {
    return res.status(404).json({ error: "文件不存在" });
  }

  const filePath = path.join(ORIGINAL_DIR, file.storageKey);

  if (!fs.existsSync(filePath)) {
    console.error(`[files] 记录存在但文件丢失：${file.storageKey}`);
    return res.status(404).json({ error: "文件已丢失" });
  }

  // 关键：inline 让浏览器显示（PDF / 图片）
  // 但下载场景要 attachment —— 那一节会加 ?download=1
  const disposition = req.query.download === "1" ? "attachment" : "inline";

  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
  );

  return sendFileWithRange({
    req,
    res,
    filePath,
    contentType: file.mime,
    cacheControl: "private, max-age=3600",
  });
});
```

## 1.5 验证

**重启，用 curl 测：**

**1. 不带 Range：**

```text
curl.exe -i -H "Cookie: auth_token=ALICE" "http://localhost:4030/api/files/1/raw"
```

**应该：**

```text
HTTP/1.1 200 OK
Accept-Ranges: bytes
Content-Length: 20971520
```

**2. 带 Range：**

```text
curl.exe -i -H "Cookie: auth_token=ALICE" -H "Range: bytes=0-99" "http://localhost:4030/api/files/1/raw"
```

**应该：**

```text
HTTP/1.1 206 Partial Content
Accept-Ranges: bytes
Content-Range: bytes 0-99/20971520
Content-Length: 100
```

**响应体应该只有 100 字节。**

**3. 尾部 Range：**

```text
curl.exe -i -H "Cookie: auth_token=ALICE" -H "Range: bytes=-100" "http://localhost:4030/api/files/1/raw"
```

**应该：`Content-Range: bytes 20971420-20971519/20971520`，`Content-Length: 100`。**

**这三个测试做完，Range 就是真的支持了。**

---

# 第 2 步：写预览页（35 分钟）

## 2.1 新建 `public/view.html`

**这个页面两种模式：图片查看器 / PDF iframe。**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>预览</title>
  <link rel="stylesheet" href="/admin.css" />
  <style>
    body { margin: 0; background: #10131a; color: #e5e7eb; }
    .topbar {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px; background: #181d27; border-bottom: 1px solid #262d3a;
      font-size: 13px;
    }
    .topbar .name {
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #fff; font-weight: 500;
    }
    .topbar .meta { color: #8b95a5; font-size: 12px; white-space: nowrap; }
    .topbar a, .topbar button {
      font: inherit; font-size: 12.5px; padding: 6px 12px;
      border: 1px solid #2f3847; border-radius: 7px;
      background: transparent; color: #cbd5e1; cursor: pointer;
      text-decoration: none;
    }
    .topbar a:hover, .topbar button:hover { background: #222a37; color: #fff; }

    /* 图片查看器 */
    .stage {
      position: fixed; inset: 48px 0 0 0;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden; background: #0c0f15;
      cursor: zoom-in;
    }
    .stage.zoomed { cursor: zoom-out; }
    .stage img {
      max-width: 100%; max-height: 100%;
      transition: transform 0.15s ease-out;
      will-change: transform;
      user-select: none;
    }
    .nav-btn {
      position: fixed; top: 50%; transform: translateY(-50%);
      width: 44px; height: 60px; border: none; border-radius: 8px;
      background: rgba(255,255,255,0.08); color: #fff;
      font-size: 22px; cursor: pointer; display: none;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.16); }
    .nav-btn.show { display: block; }
    .nav-prev { left: 14px; }
    .nav-next { right: 14px; }

    /* PDF */
    .pdf-frame {
      position: fixed; inset: 48px 0 0 0;
      width: 100%; border: none; background: #525659;
    }

    .msg { padding: 80px 20px; text-align: center; color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="topbar" id="topbar" style="display:none">
    <span class="name" id="name">-</span>
    <span class="meta" id="meta"></span>
    <button id="zoom-out" style="display:none">缩小</button>
    <button id="zoom-in" style="display:none">放大</button>
    <button id="zoom-fit" style="display:none">适应</button>
    <a id="download" href="#" download>下载</a>
    <a href="/files.html">返回列表</a>
  </div>

  <div class="msg" id="msg">加载中……</div>

  <div class="stage" id="stage" style="display:none">
    <img id="img" alt="" />
  </div>

  <button class="nav-btn nav-prev" id="prev" title="上一张">‹</button>
  <button class="nav-btn nav-next" id="next" title="下一张">›</button>

  <script type="module">
    import { api, esc } from "/admin.js";

    const params = new URLSearchParams(location.search);
    const fileId = params.get("id");

    const topbar = document.getElementById("topbar");
    const nameEl = document.getElementById("name");
    const metaEl = document.getElementById("meta");
    const msgEl = document.getElementById("msg");
    const stage = document.getElementById("stage");
    const img = document.getElementById("img");
    const downloadEl = document.getElementById("download");
    const prevBtn = document.getElementById("prev");
    const nextBtn = document.getElementById("next");
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");
    const zoomFitBtn = document.getElementById("zoom-fit");

    const fmtSize = (bytes) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    let zoom = 1;
    let siblings = [];   // 同类型的其他文件 id，用于左右切换
    let currentIndex = -1;

    const applyZoom = () => {
      img.style.transform = `scale(${zoom})`;
      stage.classList.toggle("zoomed", zoom > 1);
    };

    const setZoom = (next) => {
      zoom = Math.min(4, Math.max(1, Number(next.toFixed(2))));
      applyZoom();
    };

    /** 图片模式 */
    const renderImage = (file) => {
      msgEl.style.display = "none";
      stage.style.display = "flex";

      img.src = file.url;
      img.alt = file.originalName;

      zoom = 1;
      applyZoom();

      zoomInBtn.style.display = "";
      zoomOutBtn.style.display = "";
      zoomFitBtn.style.display = "";
      stage.style.cursor = "zoom-in";

      // 左右切换
      const idx = siblings.findIndex((item) => item.id === file.id);
      currentIndex = idx;

      prevBtn.classList.toggle("show", idx > 0);
      nextBtn.classList.toggle("show", idx >= 0 && idx < siblings.length - 1);
    };

    /** PDF / 其他文档模式 */
    const renderDocument = (file) => {
      msgEl.style.display = "none";
      stage.style.display = "none";

      zoomInBtn.style.display = "none";
      zoomOutBtn.style.display = "none";
      zoomFitBtn.style.display = "none";
      prevBtn.classList.remove("show");
      nextBtn.classList.remove("show");

      // 关键：用 <iframe>，浏览器内置查看器会处理翻页/缩放
      const frame = document.createElement("iframe");
      frame.className = "pdf-frame";
      frame.title = file.originalName;
      frame.src = file.url;      // 依赖 raw 接口的 Content-Disposition: inline

      // 替换旧的
      document.querySelectorAll(".pdf-frame").forEach((el) => el.remove());
      document.body.appendChild(frame);
    };

    const goTo = (id) => {
      location.search = `?id=${encodeURIComponent(id)}`;
    };

    const main = async () => {
      if (!fileId) {
        msgEl.textContent = "缺少 id 参数";
        return;
      }

      // 1. 拿文件信息
      const detail = await api(`/api/files/${fileId}`);

      if (!detail.ok) {
        msgEl.textContent = detail.data?.error || "无法加载文件";
        return;
      }

      const file = detail.data.file;

      topbar.style.display = "flex";
      nameEl.textContent = file.originalName;
      nameEl.title = file.originalName;

      const dims = file.width && file.height ? ` · ${file.width}×${file.height}` : "";
      metaEl.textContent = `${fmtSize(file.size)}${dims}`;

      downloadEl.href = `${file.url}?download=1`;

      // 2. 拿同类文件列表（用于左右切换）
      const list = await api(`/api/files?kind=${encodeURIComponent(file.kind)}&pageSize=100`);

      if (list.ok) {
        siblings = (list.data.files || []).map((item) => ({ id: item.id, name: item.originalName }));
      }

      // 3. 按类型渲染
      if (file.kind === "image") {
        renderImage(file);
      } else if (file.mime === "application/pdf") {
        renderDocument(file);
      } else {
        msgEl.innerHTML = `
          这个文件类型不支持在线预览<br /><br />
          <a class="btn primary" href="${esc(file.url)}?download=1">下载查看</a>
        `;
      }
    };

    // ============ 交互 ============

    stage.addEventListener("click", () => {
      setZoom(zoom > 1 ? 1 : 2);
    });

    zoomInBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setZoom(zoom + 0.5);
    });

    zoomOutBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setZoom(zoom - 0.5);
    });

    zoomFitBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setZoom(1);
    });

    prevBtn.addEventListener("click", () => {
      if (currentIndex > 0) goTo(siblings[currentIndex - 1].id);
    });

    nextBtn.addEventListener("click", () => {
      if (currentIndex >= 0 && currentIndex < siblings.length - 1) {
        goTo(siblings[currentIndex + 1].id);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") location.href = "/files.html";
      if (event.key === "ArrowLeft" && currentIndex > 0) goTo(siblings[currentIndex - 1].id);
      if (event.key === "ArrowRight" && currentIndex < siblings.length - 1) goTo(siblings[currentIndex + 1].id);
    });

    main();
  </script>
</body>
</html>
```

## 2.2 需要一个"单文件详情"接口

**上面的代码调了 `/api/files/:id`（GET）。**

**在 `files-routes.js` 里加：**

```javascript
filesRouter.get("/:id", (req, res) => {
  const file = getFileById(req.params.id);

  if (!file || file.deletedAt) {
    return res.status(404).json({ error: "文件不存在" });
  }

  if (file.userId !== req.user.id) {
    return res.status(404).json({ error: "文件不存在" });
  }

  res.json({ file });
});
```

**注意：这个路由要放在 `/:id/raw` 和 `/:id/thumb` **之后**。**

**为什么：**

**Express 按注册顺序匹配。**

**如果 `/:id` 在前，`/5/raw` 会被 `/:id` 匹配（`id` = "5/raw"？不，Express 的 `:id` 不匹配斜杠）。**

**实际上 `/:id` 只匹配 `/5`，不匹配 `/5/raw`。所以顺序无所谓。**

**但为了可读性，把"更具体的"放前面是好习惯。**

## 2.3 改 `files.html` 的"查看"链接

**找到：**

```html
<a class="btn small" href="${esc(file.url)}" target="_blank">查看</a>
```

**改成：**

```html
<a class="btn small" href="/view.html?id=${file.id}">查看</a>
```

**为什么改：**

**直接指向 `raw` 会在新标签里显示一张"孤零零的图"（没有导航、没有下载按钮、不能切换）。**

**`view.html` 提供完整体验。**

## 2.4 测试

**1. 上传一张图片，点"查看"。**

**应该看到：**

```text
顶部：文件名 + 大小 + 尺寸 + 缩小/放大/适应 + 下载 + 返回列表
中间：图片居中显示
```

**2. 点图片 → 放大 2 倍。再点 → 复原。**

**3. 按 `←` `→` 切换同类文件（如果有多张图）。**

**4. 按 `Esc` 返回列表。**

**5. 上传一个 PDF（`?kind=document`），点"查看"。**

**应该看到浏览器内置的 PDF 查看器（有翻页、缩放、下载按钮）。**

**如果看到"下载"弹窗，检查 `Content-Disposition`。**

---

# 第 3 步：五个必须知道的坑（25 分钟）

## 坑 1：PDF 一直是"下载"而不是"显示"

**三种原因，按概率排序：**

**第一：`Content-Disposition` 是 `attachment`。**

**验证：**

```text
curl.exe -I -H "Cookie: auth_token=ALICE" "http://localhost:4030/api/files/1/raw"
```

**（`-I` 是只发 HEAD 请求）。**

**应该看到 `Content-Disposition: inline; ...`。**

**第二：`Content-Type` 不是 `application/pdf`。**

**同一次 curl 的输出里看 `Content-Type`。**

**如果显示 `application/octet-stream`，说明数据库里的 `mime` 存错了。**

**查数据库：**

```text
node --env-file=.env -e "import('./src/db.js').then(m => console.table(m.db.prepare('SELECT id,mime,kind FROM files').all()))"
```

**第三：浏览器禁用了内置 PDF 查看器。**

**Chrome：`chrome://settings/content/pdfDocuments` → 检查"下载 PDF 而不是自动打开"。**

**这个不是你的问题，但你测试时要确认。**

## 坑 2：大 PDF 转圈或报"文件损坏"

**这就是没支持 `Range` 的症状。**

**验证：**

```text
curl.exe -i -H "Cookie: auth_token=ALICE" -H "Range: bytes=0-99" "http://localhost:4030/api/files/1/raw"
```

**如果返回 `200` 而不是 `206`，就是没支持。**

**修法：第 1 步的 `sendFileWithRange`。**

## 坑 3：`Content-Range` 少一个字节

```javascript
// 错
res.setHeader("Content-Range", `bytes ${start}-${end - 1}/${fileSize}`);

// 对
res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
```

**`end` 是**包含**的。**

**写错会导致：**

**浏览器请求 `bytes=0-99`，你返回 `Content-Range: bytes 0-99` 但只发了 99 字节。**

**PDF 解析器按 100 字节解析，最后一个字节是垃圾 → 报"损坏"。**

**这个 bug 极难查，因为 F12 里看起来"状态码对、头也对"。**

## 坑 4：`iframe` 加载被 `X-Frame-Options` 拦

**如果你以后加了安全头（第 33 节会讲）：**

```javascript
app.use(helmet());   // 默认会加 X-Frame-Options: SAMEORIGIN
```

**`SAMEORIGIN` 允许同源 iframe，所以这个场景没问题。**

**但如果设成 `DENY`，你的 `iframe` 就白屏。**

**排查：F12 → Console 里会有：**

```text
Refused to display '...' in a frame because it set 'X-Frame-Options' to 'deny'.
```

**这一周不加 helmet，不会遇到。但你要知道有这个坑。**

## 坑 5：`view.html` 直接打开没登录 → 白屏

**`view.html` 用了 `api()`，它会处理 401（跳登录页）。**

**但 `img.src = file.url` 是浏览器直接发请求，不走 `api()`。**

**如果 Cookie 过期：**

```text
① api("/api/files/1") → 401 → 跳登录页 ✅
② 但如果你只设了 img.src 没先调 api → img 请求 401 → 显示破图
```

**所以顺序很重要：先调 `api()` 拿到文件信息（顺便验证登录），再设 `img.src`。**

**上面的代码就是这么写的（`main()` 里先 `api()`，再 `renderImage`）。**

**如果你改了顺序，就会遇到"偶尔白屏"。**

---

# 第 4 步：故意做五个实验（30 分钟）

## 实验 1：去掉 `sendFileWithRange`，用回原来的 `pipe`

**把 `raw` 接口改回第 66 节的写法（直接 `createReadStream().pipe(res)`）。**

**然后上传一个大 PDF（10MB+），点"查看"。**

**观察：**

```text
① 加载要多久
② F12 里 raw 请求的状态码（200 还是 206）
③ PDF 能不能翻到第 5 页
```

**大概率：加载慢，翻页时重新下载，甚至报错。**

**改回来。**

## 实验 2：`Content-Range` 少一个字节

**按坑 3 改错一处，上传 PDF 测试。**

**看是否报"文件损坏"。**

**这个实验做一次，你以后写 Range 永远不会错。**

**改回来。**

## 实验 3：`attachment` 代替 `inline`

**改 `raw` 接口：**

```javascript
const disposition = "attachment";
```

**点"查看"。**

**应该弹下载框（在 iframe 里可能什么都不显示，或者显示一个下载图标）。**

**这就是 `Content-Disposition` 的作用。**

**改回来。**

## 实验 4：图片缩放边界

**点图片放大 4 次（每次 +0.5，从 1 到 3）。**

**再点 3 次。**

**应该最大到 4，最小到 1（不会变小到看不见，不会放大到模糊成马赛克）。**

**这就是 `Math.min/max` 的作用。**

## 实验 5：左右切换

**上传 3 张图。**

**打开第一张的 `view.html`，按 `→` 两次。**

**应该依次切到第 2、3 张。**

**按 `←` 回到第 1 张。**

**注意：切换时 `location.search` 变了，页面会重新加载（不是 SPA 式的无刷新切换）。**

**为什么不做无刷新：**

**简单。而且"切换图片"是低频操作，重新加载 200ms 用户感知不到。**

**做无刷新要维护"当前索引 + 预加载 + 历史记录"，复杂度不成比例。**

---

# 第 5 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. `Range` 请求的三个 curl 测试结果（贴状态码和头）
2. 大 PDF 在"有无 Range"下的表现差别
3. 你的 `view.html` 有哪几个功能
4. 「卡在哪」

---

# 第 6 步：课后练习

## 练习一：加"下载"和"预览"分离

**要求：**

**`view.html` 的"下载"按钮已经用 `?download=1`。**

**在列表页也加一个"下载"按钮，直接用 `?download=1`。**

**然后验证：**

```text
点"查看" → 页面内显示
点"下载" → 弹保存框，文件名是中文原名
```

**为什么重要：**

**`inline` 和 `attachment` 是两种完全不同的用户意图。**

**同一个 `raw` 接口用 query 参数切换，比做两个接口干净。**

## 练习二：加图片预加载

**要求：** 在 `view.html` 里预加载"上一张"和"下一张"的缩略图。

```javascript
const preload = (id) => {
  const image = new Image();
  image.src = `/api/files/${id}/raw`;
};

// 当前索引确定后
if (currentIndex > 0) preload(siblings[currentIndex - 1].id);
if (currentIndex < siblings.length - 1) preload(siblings[currentIndex + 1].id);
```

**效果：按 `→` 时下一张已经在缓存里，切换"瞬间完成"。**

**为什么用 `new Image()` 而不是 `fetch`：**

**`new Image()` 会让浏览器**解码**图片并放进图片缓存。**

**`fetch` 只下载字节，还要再解码一次。**

## 练习三：给 PDF 加"第几页"提示

**要求：** `<iframe>` 无法读取 PDF 的页码（跨域限制 + 无 API）。**

**所以这个做不了。**

**但你可以：**

```text
① 服务端用 pdftotext / pdfinfo 提取页数，显示在顶部
② 或者干脆不显示（原生查看器自己有页码）
```

**这一题的目的是让你认识到：**`<iframe>` 的局限是"完全不可控"。

**真需要控制（比如"跳到第 5 页"），就得上 PDF.js。**

## 练习四：想清楚这四个问题

```text
1. 为什么 PDF 需要 Range 请求而小图片不需要？
2. `Content-Range: bytes 0-99/1000` 里 `99` 是包含还是不包含？
3. 为什么非法 Range 退化成 200 而不是 416？
4. 为什么 `view.html` 要先 `api()` 再设 `img.src`？
```

---

# 第 7 步：最终验收

## A. 代码

- [ ] `range.js` 有 `parseRange` / `sendFileWithRange`
- [ ] 支持 `bytes=0-99` / `bytes=100-` / `bytes=-500` 三种格式
- [ ] `206` + `Content-Range` + `Content-Length` 三件套
- [ ] `Accept-Ranges: bytes` 一直发
- [ ] `HEAD` 请求不 pipe
- [ ] `raw` 接口支持 `?download=1`
- [ ] `GET /api/files/:id` 单文件详情
- [ ] `view.html` 存在

## B. 实测

- [ ] `Range: bytes=0-99` 返回 206 + 100 字节
- [ ] `Range: bytes=-100` 返回最后 100 字节
- [ ] 大 PDF（10MB+）能快速打开
- [ ] PDF 能翻页、缩放（浏览器内置查看器）
- [ ] 图片能点击放大
- [ ] `←` `→` 能切换
- [ ] `Esc` 能返回
- [ ] 下载按钮文件名是中文

## C. 认知

- [ ] 我知道 `inline` 和 `attachment` 的区别
- [ ] 我知道 Range 为什么对 PDF 必须
- [ ] 我知道 `Content-Range` 的 `end` 是包含的
- [ ] 我知道 `<iframe>` 的局限在哪

## 本节课要能说出口的一句话

> **PDF 不下载要两个东西：`Content-Disposition: inline` 和 `Range` 支持。少一个，大文件就打不开。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| PDF 弹下载 | `Content-Disposition` | 改成 `inline` |
| 大 PDF 打不开 | 没 `Range` | 用 `sendFileWithRange` |
| PDF 报损坏 | `Content-Range` 少一字节 | `end` 是包含的 |
| 图片点开放大没反应 | `stage` 事件没绑 | 检查监听器 |
| 左右切换不出现 | `siblings` 为空 | 检查列表接口 |
| `iframe` 白屏 | 被 `X-Frame-Options` 拦 | 检查安全头 |
| 下载文件名乱码 | 没 `filename*=` | 用 RFC 5987 |
| 中文 PDF 页数不对 | 不关你的事 | 原生查看器自己算 |
| 缩放超出边界 | 没 clamp | `Math.min/max` |
| 切换图片时闪白 | 重新加载 | 加预加载（练习二） |
