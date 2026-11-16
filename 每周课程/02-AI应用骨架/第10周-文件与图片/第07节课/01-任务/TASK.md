# 第 70 节课：完成文件管理页——把六天的零件装成一台机器

> **这份文件是你（学员）一步一步照着做的手册。**
> 六天你有了上传、校验、入库、压缩、缩略图、预览。但它们散在几个页面里。
> 今天合成一个页面，并且补上三个之前没做的：**拖拽上传、上传进度、批量删除**。

**建议用时**：170 分钟
**你需要先完成**：第 69 节课（能预览 PDF，`Range` 生效）

---

# 第 0 步：先看现在有什么、缺什么（10 分钟）

## 0.1 现状盘点

| 能力 | 现在在哪 | 问题 |
|---|---|---|
| 上传 | `/upload.html` | 和列表分开，用户要来回跳 |
| 列表 | `/files.html` | 只能单条删除 |
| 预览 | `/view.html` | 能用 |
| 校验 | 后端 | ✅ |
| 压缩/缩略图 | 后端 | ✅ |

**缺四件事：**

```text
① 上传和列表在一个页面（用户不用跳）
② 拖拽上传（比"点选文件"快很多）
③ 上传进度（大文件时用户要知道"卡在哪"）
④ 批量删除（删 20 张要确认 20 次，太蠢）
```

## 0.2 为什么"一个页面"重要

**现在的流程：**

```text
列表页 → 点"上传" → 上传页 → 传完 → 点"返回列表" → 列表页刷新
```

**五次点击。**

**合并后：**

```text
列表页 → 拖 3 个文件进去 → 完成
```

**零次跳转。**

**这就是"工具"和"流程"的区别。**

## 0.3 今天的交付物

| 文件 | 位置（都在 `auth-lab` 里） | 内容 |
|---|---|---|
| `public/files.html` | `public/` | **整份重写**：上传区 + 列表 + 批量 + 进度 |
| `public/upload.html` | `public/` | 保留（单文件上传的独立入口） |
| `src/files-routes.js` | `src/` | 加批量删除接口 |
| `results/e07.md` | `results/` | 第 10 周总结 |

---

# 第 1 步：加批量删除接口（25 分钟）

**先做后端。前端好改，后端要谨慎。**

## 1.1 在 `files-routes.js` 里加

```javascript
filesRouter.post("/batch-delete", async (req, res, next) => {
  const { ids } = req.body ?? {};

  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: "ids 必须是数组" });
  }

  if (ids.length === 0) {
    return res.status(400).json({ error: "没有选中任何文件" });
  }

  if (ids.length > 100) {
    return res.status(400).json({ error: "一次最多删除 100 个" });
  }

  const deleted = [];
  const failed = [];

  for (const rawId of ids) {
    const id = Number(rawId);

    if (!Number.isInteger(id) || id <= 0) {
      failed.push({ id: rawId, reason: "BAD_ID" });
      continue;
    }

    try {
      const result = await softDeleteFile(id, req.user.id);

      if (result.ok) {
        deleted.push(id);
      } else {
        failed.push({ id, reason: result.reason });
      }
    } catch (error) {
      failed.push({ id, reason: "ERROR", detail: error.message });
    }
  }

  log({
    ...actorFrom(req),
    action: "file.delete",
    targetType: "file",
    targetId: null,
    ok: failed.length === 0,
    note: `批量删除：成功 ${deleted.length}，失败 ${failed.length}`,
  });

  res.json({
    deleted,
    failed,
    message: `删除 ${deleted.length} 个${failed.length > 0 ? `，失败 ${failed.length} 个` : ""}`,
  });
});
```

## 1.2 四个关键点

### 关键点一：部分失败要如实返回

```javascript
res.json({ deleted, failed, message: ... });
```

**为什么不做"全成功/全失败"：**

**场景：用户选了 5 个文件，其中 1 个已经被别的标签页删了。**

**如果返回"失败"，用户以为 5 个都没删，实际删了 4 个。**

**如实报告"4 成功 1 失败"，用户能继续操作。**

**这是"批量操作"的唯一正确抽象。**

### 关键点二：逐个调用 `softDeleteFile`，不用 `WHERE id IN (...)`

**为什么：**

**`softDeleteFile` 里做了三件事：**

```text
① 检查归属（user_id）
② 更新数据库
③ 删磁盘文件（原图 + 缩略图）
```

**如果用 `UPDATE files SET deleted_at = ? WHERE id IN (...)`：**

```text
① 归属检查要做一次额外查询（或者拼 SQL 条件）
② 磁盘文件删不掉（SQL 不会删文件）
③ 逐个失败的粒度丢了
```

**逐个调用慢一点（5 个文件约 50ms），但正确、可维护。**

**什么时候该优化：**

```text
批量 1000 个 → 逐个调用会慢（每个一次 SELECT + UPDATE + 3 次 unlink）
```

**那时可以：一次 SELECT 拿全部、批量 UPDATE、再批量 unlink。**

**这一周最多 100 个，够用。**

### 关键点三：上限 100

```javascript
if (ids.length > 100) {
  return res.status(400).json({ error: "一次最多删除 100 个" });
}
```

**为什么不限：**

**攻击者传 10 万个 id，你的循环会跑几十分钟，连接卡死。**

**100 是合理上限（一页最多 100 条）。**

### 关键点四：`ids` 逐个校验

```javascript
if (!Number.isInteger(id) || id <= 0) {
  failed.push({ id: rawId, reason: "BAD_ID" });
  continue;
}
```

**为什么：**

**`ids` 里可能有 `"abc"`、`null`、`-1`、对象。**

**不校验的话，`softDeleteFile` 里 `Number("abc")` 是 `NaN`，SQL 里 `id = NaN` 可能返回奇怪结果。**

**显式拒绝，报 `BAD_ID`。**

## 1.3 测试

```text
curl.exe -X POST http://localhost:4030/api/files/batch-delete -H "Cookie: auth_token=ALICE" -H "Content-Type: application/json" -d "{\"ids\":[1,2,999]}"
```

**应该返回：**

```json
{
  "deleted": [1, 2],
  "failed": [{ "id": 999, "reason": "NOT_FOUND" }],
  "message": "删除 2 个，失败 1 个"
}
```

**这个"2 成功 1 失败"就是关键点一。**

---

# 第 2 步：重写列表页（60 分钟）

## 2.1 结构设计

**一页三段：**

```text
┌────────────────────────────────────────┐
│ 顶部：标题 + 统计 + 视图切换            │
├────────────────────────────────────────┤
│ 上传区：拖拽区 + 进度条 + 结果          │
├────────────────────────────────────────┤
│ 工具条：全选 + 批量删除 + 筛选 + 刷新   │
├────────────────────────────────────────┤
│ 文件网格（可多选）                      │
├────────────────────────────────────────┤
│ 分页                                    │
└────────────────────────────────────────┘
```

## 2.2 完整文件

**`public/files.html`（整份替换）：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>文件管理</title>
  <link rel="stylesheet" href="/admin.css" />
  <style>
    .dropzone {
      border: 2px dashed #c7cdd6;
      border-radius: 12px;
      padding: 26px 20px;
      text-align: center;
      color: #6b7280;
      background: #fbfcfd;
      transition: all 0.15s;
      cursor: pointer;
    }
    .dropzone:hover { border-color: #93b8f8; background: #f6f9ff; }
    .dropzone.dragover { border-color: #1a6dff; background: #eef4ff; color: #1a5ad8; }
    .dropzone .big { font-size: 15px; font-weight: 500; color: #374151; margin-bottom: 6px; }
    .dropzone .small { font-size: 12.5px; }

    .upload-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px;
    }
    .upload-row:last-child { border-bottom: none; }
    .upload-row .fname {
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .upload-row .status { font-size: 12px; white-space: nowrap; }
    .bar-wrap {
      height: 5px; background: #eef2f7; border-radius: 3px; overflow: hidden;
      width: 120px; flex: 0 0 120px;
    }
    .bar { height: 100%; background: #1a6dff; transition: width 0.15s; }

    .toolbar {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 10px 14px; border-bottom: 1px solid #eef0f3;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 14px;
      padding: 16px;
    }
    .tile {
      background: #fff; border: 1px solid #e6e8ec; border-radius: 10px;
      overflow: hidden; position: relative;
    }
    .tile.selected { border-color: #1a6dff; box-shadow: 0 0 0 2px #cfe0ff; }
    .tile .pick {
      position: absolute; top: 8px; left: 8px; z-index: 2;
      width: 20px; height: 20px; cursor: pointer;
      accent-color: #1a6dff;
    }
    .tile .pic {
      height: 120px; background: #f3f4f6 center/cover no-repeat;
      display: flex; align-items: center; justify-content: center;
      color: #9ca3af; font-size: 12px;
    }
    .tile .pic img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .tile .meta { padding: 10px 12px; }
    .tile .name {
      font-size: 12.5px; font-weight: 500;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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
          <h1>文件管理</h1>
          <div class="sub" id="sub">加载中……</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="refresh" class="small">刷新</button>
        </div>
      </div>

      <div class="alert" id="alert"></div>

      <!-- 上传区 -->
      <div class="panel">
        <div class="panel-body">
          <div class="dropzone" id="dropzone">
            <div class="big">把文件拖到这里，或点击选择</div>
            <div class="small">图片最大 20MB（jpg / png / gif / webp），一次最多 5 个</div>
          </div>
          <input id="file-input" type="file" multiple style="display:none" />

          <div id="upload-list" style="margin-top:12px"></div>
        </div>
      </div>

      <!-- 工具条 -->
      <div class="panel">
        <div class="toolbar">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="pick-all" style="accent-color:#1a6dff" />
            全选
          </label>

          <span style="font-size:13px;color:#6b7280" id="picked-count">未选择</span>

          <button id="batch-delete" class="small danger" disabled>批量删除</button>

          <select id="kind" style="margin-left:auto;padding:6px 9px;font:inherit;font-size:13px;border:1px solid #d7dae0;border-radius:7px">
            <option value="">全部类型</option>
            <option value="image">图片</option>
            <option value="document">文档</option>
          </select>
        </div>

        <div id="grid-wrap">
          <div class="grid" id="grid"></div>
        </div>

        <div id="pager"></div>
      </div>
    </main>
  </div>

  <script type="module">
    import {
      guard, renderSidebar, renderPager, api, esc, fmtAgo, getParams, setParams, showAlert,
    } from "/admin.js";

    const alertEl = document.getElementById("alert");
    const subEl = document.getElementById("sub");
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    const uploadListEl = document.getElementById("upload-list");
    const gridWrap = document.getElementById("grid-wrap");
    const pickAll = document.getElementById("pick-all");
    const pickedCountEl = document.getElementById("picked-count");
    const batchDeleteBtn = document.getElementById("batch-delete");
    const kindEl = document.getElementById("kind");

    const MAX_FILES = 5;
    const MAX_SIZE = 20 * 1024 * 1024;

    let currentFiles = [];
    const picked = new Set();

    const fmtSize = (bytes) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    /* ============ 上传 ============ */

    /**
     * 用 XHR 上传（fetch 没有上传进度事件）。
     * 这是本节唯一必须用 XHR 的地方。
     */
    const uploadOne = (file, rowEl, barEl, statusEl) =>
      new Promise((resolve) => {
        const form = new FormData();
        form.append("files", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/files/upload?kind=image");
        xhr.withCredentials = true;      // 带 Cookie

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          barEl.style.width = `${percent}%`;
          statusEl.textContent = `${percent}%`;
        };

        xhr.onload = () => {
          let data = null;
          try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }

          if (xhr.status >= 200 && xhr.status < 300) {
            barEl.style.width = "100%";
            barEl.style.background = "#15803d";
            statusEl.textContent = "完成";
            statusEl.style.color = "#15803d";
            resolve({ ok: true, data });
          } else {
            barEl.style.background = "#b91c1c";
            statusEl.textContent = data?.error || `失败 ${xhr.status}`;
            statusEl.style.color = "#b91c1c";
            resolve({ ok: false, data });
          }
        };

        xhr.onerror = () => {
          barEl.style.background = "#b91c1c";
          statusEl.textContent = "网络错误";
          statusEl.style.color = "#b91c1c";
          resolve({ ok: false, data: null });
        };

        xhr.send(form);
      });

    const uploadFiles = async (fileList) => {
      const files = [...fileList].slice(0, MAX_FILES);

      if (files.length === 0) return;

      if (fileList.length > MAX_FILES) {
        showAlert(alertEl, `一次最多 ${MAX_FILES} 个，已取前 ${MAX_FILES} 个`, "warn");
      }

      uploadListEl.innerHTML = "";
      let okCount = 0;

      // 逐条上传（不是为了限速，是为了"进度条各自独立"）
      for (const file of files) {
        const row = document.createElement("div");
        row.className = "upload-row";
        row.innerHTML = `
          <span class="fname">${esc(file.name)}</span>
          <span class="status" style="color:#6b7280">0%</span>
          <div class="bar-wrap"><div class="bar" style="width:0%"></div></div>
          <span class="status" style="color:#9ca3af;width:64px;text-align:right">${fmtSize(file.size)}</span>
        `;
        uploadListEl.appendChild(row);

        const statusEl = row.querySelector(".status");
        const barEl = row.querySelector(".bar");

        // 前端预检（不替代服务端校验，只是让用户早点知道）
        if (file.size > MAX_SIZE) {
          barEl.style.background = "#b91c1c";
          statusEl.textContent = "超过 20MB";
          statusEl.style.color = "#b91c1c";
          continue;
        }

        const result = await uploadOne(file, row, barEl, statusEl);
        if (result.ok) okCount += 1;
      }

      if (okCount > 0) {
        await load();
        showAlert(alertEl, `已上传 ${okCount} 个文件`, "ok");
      }
    };

    // 点选
    dropzone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      await uploadFiles(fileInput.files);
      fileInput.value = "";   // 允许重复选同一个文件
    });

    // 拖拽
    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", async (event) => {
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) await uploadFiles(files);
    });

    /* ============ 列表 ============ */

    const updatePickedState = () => {
      const count = picked.size;
      pickedCountEl.textContent = count === 0 ? "未选择" : `已选 ${count} 个`;
      batchDeleteBtn.disabled = count === 0;
      pickAll.checked = currentFiles.length > 0 && count === currentFiles.length;

      document.querySelectorAll(".tile").forEach((tile) => {
        tile.classList.toggle("selected", picked.has(Number(tile.dataset.id)));
      });
    };

    const renderGrid = (files) => {
      if (!document.getElementById("grid")) {
        gridWrap.innerHTML = '<div class="grid" id="grid"></div>';
      }

      const grid = document.getElementById("grid");

      grid.innerHTML = files
        .map((file) => {
          const isImage = file.kind === "image";
          const thumb = file.thumbSmall
            ? `/api/files/${file.id}/thumb?size=small`
            : file.url;

          return `
            <div class="tile ${picked.has(file.id) ? "selected" : ""}" data-id="${file.id}">
              <input class="pick" type="checkbox" data-pick="${file.id}" ${picked.has(file.id) ? "checked" : ""} />
              <div class="pic">
                ${isImage
                  ? `<img src="${esc(thumb)}" alt="${esc(file.originalName)}" loading="lazy" />`
                  : `<span>${esc(file.mime)}</span>`}
              </div>
              <div class="meta">
                <div class="name" title="${esc(file.originalName)}">${esc(file.originalName)}</div>
                <div class="sub">${fmtSize(file.size)} · ${esc(fmtAgo(file.createdAt))}</div>
                <div class="acts">
                  <a class="btn small" href="/view.html?id=${file.id}">查看</a>
                  <button class="small danger" data-del="${file.id}">删除</button>
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      updatePickedState();
    };

    const load = async () => {
      alertEl.classList.remove("show");
      subEl.textContent = "加载中……";
      document.getElementById("pager").innerHTML = "";

      const params = getParams();
      kindEl.value = params.kind || "";

      const search = new URLSearchParams();
      if (params.kind) search.set("kind", params.kind);
      if (params.page && params.page !== "1") search.set("page", params.page);

      const result = await api(`/api/files${search.toString() ? `?${search}` : ""}`);

      if (!result.ok) {
        subEl.textContent = "";
        gridWrap.innerHTML = `<div class="center-box">
          <div style="color:#b91c1c;font-size:14px;margin-bottom:6px">加载失败</div>
          <div style="font-size:13px">${esc(result.data?.error || "请稍后重试")}</div>
          <div style="margin-top:14px"><button class="btn primary" id="retry">重试</button></div>
        </div>`;
        document.getElementById("retry")?.addEventListener("click", load);
        return;
      }

      const { files, total, page, pageSize, totalPages, hasPrev, hasNext, requestedPage } = result.data;

      currentFiles = files;

      // 清掉"已删除但还在 picked 里"的 id
      const validIds = new Set(files.map((file) => file.id));
      [...picked].forEach((id) => {
        if (!validIds.has(id)) picked.delete(id);
      });

      subEl.textContent = `共 ${total} 个文件`;

      if (files.length === 0) {
        gridWrap.innerHTML = `<div class="center-box">
          <div style="font-size:15px;color:#4b5563;margin-bottom:6px">还没有文件</div>
          <div style="font-size:13px;color:#9ca3af">把文件拖到上方虚线框里即可上传</div>
        </div>`;
        updatePickedState();
        return;
      }

      renderGrid(files);

      renderPager(document.getElementById("pager"), {
        page, pageSize, total, totalPages, hasPrev, hasNext,
        onGo: (nextPage) => {
          setParams({ page: nextPage }, { replace: false });
          load();
        },
      });

      if (requestedPage && requestedPage !== page) {
        setParams({ page: page === 1 ? null : page }, { replace: true });
      }
    };

    /* ============ 交互 ============ */

    const deleteOne = async (id) => {
      const result = await api(`/api/files/${id}`, { method: "DELETE" });

      if (!result.ok) {
        showAlert(alertEl, result.data?.error || "删除失败", "error");
        return false;
      }

      picked.delete(id);
      return true;
    };

    const main = async () => {
      const user = await guard();
      if (!user) return;

      renderSidebar("files", user);

      document.getElementById("refresh").addEventListener("click", load);

      kindEl.addEventListener("change", () => {
        setParams({ kind: kindEl.value || null, page: null }, { replace: false });
        picked.clear();
        load();
      });

      // 单个勾选 / 删除
      gridWrap.addEventListener("click", async (event) => {
        const pick = event.target.closest("[data-pick]");
        if (pick) {
          const id = Number(pick.dataset.pick);
          if (pick.checked) picked.add(id);
          else picked.delete(id);
          updatePickedState();
          return;
        }

        const delBtn = event.target.closest("[data-del]");
        if (delBtn) {
          if (!window.confirm("确定删除这个文件？")) return;

          delBtn.disabled = true;

          if (await deleteOne(Number(delBtn.dataset.del))) {
            await load();
            showAlert(alertEl, "已删除", "ok");
          } else {
            delBtn.disabled = false;
          }
        }
      });

      // 全选
      pickAll.addEventListener("change", () => {
        if (pickAll.checked) currentFiles.forEach((file) => picked.add(file.id));
        else picked.clear();
        updatePickedState();
      });

      // 批量删除
      batchDeleteBtn.addEventListener("click", async () => {
        const ids = [...picked];

        if (ids.length === 0) return;
        if (!window.confirm(`确定删除选中的 ${ids.length} 个文件？`)) return;

        batchDeleteBtn.disabled = true;
        batchDeleteBtn.textContent = "删除中……";

        try {
          const result = await api("/api/files/batch-delete", {
            method: "POST",
            body: JSON.stringify({ ids }),
          });

          if (!result.ok) {
            showAlert(alertEl, result.data?.error || "批量删除失败", "error");
            return;
          }

          const { deleted, failed } = result.data;

          picked.clear();
          await load();

          if (failed.length === 0) {
            showAlert(alertEl, `已删除 ${deleted.length} 个`, "ok");
          } else {
            showAlert(
              alertEl,
              `删除 ${deleted.length} 个，${failed.length} 个失败（可能已被删除）`,
              "warn"
            );
          }
        } finally {
          batchDeleteBtn.disabled = false;
          batchDeleteBtn.textContent = "批量删除";
        }
      });

      window.addEventListener("popstate", load);

      await load();
    };

    main();
  </script>
</body>
</html>
```

## 2.3 六个关键点

### 关键点一：上传用 `XHR` 而不是 `fetch`

```javascript
const xhr = new XMLHttpRequest();
xhr.upload.onprogress = (event) => { ... };
```

**为什么：**

**`fetch` **没有**上传进度事件。**

**它有下载进度（`response.body` 的流），但没有上传进度。**

**所以"上传进度条"是必须用 XHR 的唯一理由。**

**这是浏览器的现实，不是你的选择。**

**注意 `xhr.withCredentials = true`：**

**等价于 `fetch` 的 `credentials: "same-origin"`。**

**不设的话，Cookie 不带，401。**

### 关键点二：逐条上传，不并发

```javascript
for (const file of files) {
  const result = await uploadOne(file, ...);
}
```

**为什么不用 `Promise.all`：**

```text
① 进度条各自独立（并发时会同时跳，看不出哪个在传）
② 内存峰值低（一张图压缩在服务端要占内存，并发 5 个 = 5 倍）
③ 单个失败不影响其他的顺序
```

**代价：总耗时是串行的（5 个各 300ms = 1.5 秒，并发是 0.4 秒）。**

**对"一次传 5 张图"来说，1.5 秒可以接受，且体验更清晰（一条条完成）。**

**什么时候该并发：**

**批量传 100 个文件时，串行太慢。那时用"最多 3 个并发"的池子。**

### 关键点三：前端预检但不禁用服务端校验

```javascript
if (file.size > MAX_SIZE) {
  barEl.style.background = "#b91c1c";
  statusEl.textContent = "超过 20MB";
  continue;   // 不发送
}
```

**为什么保留这个预检：**

**用户选了 25MB 的文件，等 20 秒上传完才被拒 —— 浪费时间。**

**前端先看大小，立刻告诉他。**

**但：**

**服务端**必须**还有一遍（第 65 节的三重校验）。**

**前端的 `continue` 只是"省一次无意义的网络往返"，不是安全措施。**

### 关键点四：`picked` 是 `Set`，不是数组

```javascript
const picked = new Set();
picked.add(id);
picked.delete(id);
picked.has(id);
```

**为什么用 `Set`：**

**判断"这个有没有被选"是 O(1)，数组是 O(n)。**

**100 条记录、每次点击都判断 100 次，Set 快 100 倍。**

**而且 `Set` 自动去重（不会因为重复点击导致"选了两次"）。**

### 关键点五：切换筛选时清空 `picked`

```javascript
kindEl.addEventListener("change", () => {
  setParams({ ... });
  picked.clear();      // ← 关键
  load();
});
```

**为什么：**

**用户在第 1 页选了 3 个，然后切到"只显示图片"。**

**这 3 个可能都不在"图片"里了。**

**不清空，批量删除会删掉"用户看不见的东西"。**

**这是"批量操作"最容易犯的错 —— 用户看到的和实际操作的集合不一致。**

**同样，`load()` 里也要清：**

```javascript
const validIds = new Set(files.map((file) => file.id));
[...picked].forEach((id) => {
  if (!validIds.has(id)) picked.delete(id);
});
```

**这条保证"选中的一定在当前列表里"。**

### 关键点六：`loading="lazy"` 在 `<img>` 上

```html
<img src="..." loading="lazy" />
```

**第 68 节的笔记里提过。这里用 `<img>` 而不是 `background-image`，就是为了这个属性。**

**效果：**

**20 个格子，用户只看到前 6 个。**

**`loading="lazy"` 让浏览器只加载视口附近的那几个。**

**省 70% 的请求。**

**注意 `object-fit: cover`：**

**不加的话，图片会被拉伸变形（因为 `<img>` 默认按原始比例但容器是固定高度的）。**

---

# 第 3 步：测试完整流程（30 分钟）

## 3.1 十一条测试

**按顺序做，每条都记下结果。**

**1. 拖拽上传**

**把 3 张图从资源管理器拖到虚线框。**

**应该：**

```text
三条进度条依次从 0% 走到 100%
每条完成时变绿
全部完成后列表自动刷新，出现 3 个新文件
顶部提示"已上传 3 个文件"
```

**2. 点选上传**

**点虚线框 → 文件选择框 → 选文件 → 确定。**

**和拖拽一样。**

**3. 超过 5 个**

**一次拖 8 个文件。**

**应该：**

```text
提示"一次最多 5 个，已取前 5 个"
只上传 5 个
```

**4. 超大文件**

**拖一个 25MB 的文件。**

**应该：立刻显示"超过 20MB"（红色），不发请求。**

**验证：F12 → Network 里没有这个请求。**

**5. 假图片**

**拖 `experiments/samples/fake.jpg`（MZ 内容）。**

**应该：进度条走到 100% 后变红，显示"检测到文件实际类型是 exe……"。**

**注意：这个文件**会**被上传（网络传输发生了），只是服务端拒了。**

**前端真正"不发请求"的只有"大小超限"那一种。**

**6. 全选**

**点工具条的"全选"。**

**应该：所有格子高亮，计数显示"已选 20 个"，"批量删除"按钮可点。**

**7. 取消全选**

**再点一次"全选"。**

**应该：全部取消，计数"未选择"，按钮禁用。**

**8. 单个勾选**

**点某个格子的复选框。**

**应该：那个格子高亮，计数 +1。**

**9. 批量删除**

**选 3 个，点"批量删除"，确认。**

**应该：**

```text
删除 3 个
列表刷新（少了 3 个）
提示"已删除 3 个"
```

**10. 部分失败**

**在两个标签页里都打开列表页。**

**在 A 里删掉文件 5。**

**在 B 里选中文件 5 和其他 2 个，点批量删除。**

**应该：**

```text
删除 2 个，1 个失败（可能已被删除）
但列表刷新后，那 3 个都不在了
```

**这个"部分失败"是正常的 —— 文件 5 已经被删，B 的操作"多余但无害"。**

**11. 切换筛选清空选择**

**选 3 个文件，然后把类型切成"文档"。**

**应该：选择被清空（计数"未选择"）。**

**如果没清空，说明你的 `picked.clear()` 没生效。**

## 3.2 记录数据

**记下三个数字：**

```text
3 张图上传耗时：___ 秒
批量删除 3 个耗时：___ 毫秒
列表页（20 张缩略图）总传输：___ KB
```

---

# 第 4 步：五个必须知道的坑（25 分钟）

## 坑 1：拖拽上传没阻止默认行为

**现象：**

**拖一个文件到页面上，浏览器**打开了这个文件**（离开你的应用）。**

**原因：**

**浏览器默认行为是"打开拖进来的文件"。**

**必须 `preventDefault()`。**

**代码里这两处都要：**

```javascript
["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();      // ← 必须
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();      // ← 必须
    dropzone.classList.remove("dragover");
  });
});
```

**注意：只在 `dropzone` 上 `preventDefault` 不够。**

**用户可能把文件丢在 `dropzone` 外面（比如面板的空白处），那时浏览器还是会打开文件。**

**完整的做法（练习）：在 `document` 上监听 `dragover` 和 `drop` 并 `preventDefault`。**

## 坑 2：`fileInput.value = ""` 忘了

```javascript
fileInput.addEventListener("change", async () => {
  await uploadFiles(fileInput.files);
  fileInput.value = "";      // ← 必须
});
```

**为什么：**

**`<input type="file">` 的 `change` 事件只在"选的文件变了"时触发。**

**用户选了 `a.jpg`，上传。然后又想传同一个 `a.jpg`。**

**不改 `value`，`change` 不触发（因为值没变）—— 用户点"选择"选了同一个文件，什么都没发生。**

**这个 bug 让用户觉得"上传坏了"。**

**清空 `value` 就解决了。**

## 坑 3：批量删除后 `picked` 没清

```javascript
picked.clear();      // 在批量删除成功后
await load();
```

**不清的结果：**

**删了 3 个，`picked` 里还有那 3 个 id。**

**下次点"批量删除"，会尝试删已经不存在的 id，返回"失败 3 个"。**

**用户困惑"怎么又失败了"。**

**清空，干净。**

## 坑 4：`XHR` 的 `onload` 里当成"成功"

```javascript
xhr.onload = () => {
  // 注意：onload 在 4xx / 5xx 时也会触发！
  if (xhr.status >= 200 && xhr.status < 300) { 成功 }
  else { 失败 }
};
```

**为什么：**

**`XMLHttpRequest.onload` 在"请求完成"时触发，不管状态码是多少。**

**`404`、`500` 都会走 `onload`。**

**所以必须检查 `xhr.status`。**

**对比 `fetch`：**

**`fetch` 在 4xx / 5xx 时**不**抛异常（除非网络错误），你要自己看 `response.ok`。**

**两者都要显式判断状态码。**

## 坑 5：上传成功但列表没更新

**原因：`load()` 在 `uploadFiles` 里调了，但 `picked` 里可能还有被删的 id。**

**更常见的原因：**

**`load()` 被调了，但 `currentFiles` 还是旧的（因为 `await load()` 里没等 API 返回就渲染了）。**

**检查你的 `load()` 是不是 `async`，以及 `uploadFiles` 里是不是 `await load()`。**

**还有个可能：**

**上传成功后 `load()` 请求了，但因为 `Cache-Control`，浏览器返回了缓存的老列表。**

**这种情况少见（`api()` 的 `fetch` 默认会带条件请求），但如果有：**

```javascript
const result = await api("/api/files", { cache: "no-store" });
```

**`cache: "no-store"` 强制不走缓存。**

**列表类接口加这个是合理的（数据会变）。**

---

# 第 5 步：故意做四个实验（25 分钟）

## 实验 1：去掉 `preventDefault`

**把 `dragover` 那段的 `event.preventDefault()` 注释掉。**

**拖一个文件到页面。**

**应该：浏览器打开了这个文件（离开了你的应用）。**

**这就是"不阻止默认行为"的后果。**

**加回来。**

## 实验 2：并发上传

**把 `uploadFiles` 的 `for ... await` 改成 `Promise.all`：**

```javascript
await Promise.all(files.map((file) => uploadOne(file, ...)));
```

**（需要改造，让每行元素先全部创建，再并发）**

**观察：**

```text
① 三条进度条同时跳（看不出哪个在传）
② 总耗时变短
③ 如果服务端压缩占内存，可能出现 500
```

**这就是串行 vs 并发的取舍。**

**改回来。**

## 实验 3：不做"清空 `picked`"

**注释掉 `load()` 里那段清理：**

```javascript
// const validIds = ...
// [...picked].forEach(...)
```

**然后：**

```text
① 选 3 个文件
② 切到"文档"筛选（只剩 PDF）
③ 点"批量删除"
```

**应该：删掉那 3 个"看不见的"图片。**

**这就是"用户看到的和实际操作不一致"。**

**加回来。**

## 实验 4：`fileInput.value = ""` 去掉

**注释掉那行。**

**然后：**

```text
① 选 a.jpg 上传
② 再点"选择文件"，再选 a.jpg
```

**第二次什么都没有发生（因为 `change` 没触发）。**

**这就是坑 2。**

**加回来。**

---

# 第 6 步：写第 10 周总结（25 分钟）

**`results/e07.md`：**

```markdown
# 第 10 周 文件与图片总结

## 一、做了什么

| 节 | 产出 |
|---|---|
| 64 | 手写 multipart 解析 + busboy 流式接收 |
| 65 | 魔数检测 + 三重校验（空/大小/扩展名/魔数） |
| 66 | `files` 表 + 归属检查 + Range-less 读取 |
| 67 | 图片压缩（12MB → 300KB） |
| 68 | 缩略图（small 300 / medium 800） |
| 69 | PDF 预览（iframe + Range 206） |
| 70 | 文件管理页（拖拽 + 进度 + 批量） |

## 二、关键数字

| 指标 | 值 |
|---|---|
| 原图 | ___ MB（___×___） |
| 压缩后 | ___ KB |
| small 缩略图 | ___ KB |
| medium 缩略图 | ___ KB |
| 列表页 20 张（原图） | ___ MB |
| 列表页 20 张（缩略图） | ___ KB |
| 省下的倍数 | ___× |

## 三、踩过的坑

| # | 坑 | 后果 | 修法 |
|---|---|---|---|
| 1 | 手动设 `Content-Type` | `Boundary not found` | 不设，让浏览器设 |
| 2 | 没 `await` 写流 | 文件只有一半 | `await Promise.all(pending)` |
| 3 | 只验扩展名 | `.exe` 改名就能过 | 三层校验 |
| 4 | 没 `.rotate()` | 竖拍照片躺倒 | `.rotate()` 在 resize 前 |
| 5 | 没有 Range | 大 PDF 打不开 | 206 + `Content-Range` |
| 6 | `Content-Range` 少一字节 | PDF 报损坏 | `end` 是包含的 |
| 7 | 缩略图用原图 | 列表 6MB | small 缩略图 |
| 8 | 拖拽没 `preventDefault` | 浏览器打开文件 | 阻止默认 |
| 9 | 切换筛选没清选择 | 删了看不见的文件 | `picked.clear()` |
| 10 | 没清 `input.value` | 重复选同一文件无效 | 上传后清空 |

## 四、我不确定的地方

1.
2.
3.

## 五、这一周最值钱的一条认知

（一句话）
```

## 6.1 为什么这份总结重要

**"踩过的坑"是资产清单。** 三个月后接新项目，翻这份能省掉重踩的时间。

**"我不确定的地方"是知识边界。** 敢写出来，才说明你知道自己不知道什么。

---

# 第 7 步：写笔记（10 分钟）

**`NOTES.md` 必填：**

1. 十一条测试的结果（哪几条有异常）
2. 三个耗时/传输数字
3. `picked.clear()` 的实验现象
4. 「卡在哪」

---

# 第 8 步：课后练习

## 练习一：在 `document` 上阻止拖拽

**要求：** 防止"丢在 `dropzone` 外面导致浏览器打开文件"。

```javascript
["dragover", "drop"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});
```

**注意：**

**如果 `document` 上 `preventDefault`，`dropzone` 的 `dragover` 高亮效果还在吗？**

**在的（因为 `dropzone` 的监听器先执行，加了 class，然后冒泡到 `document`）。**

**但要小心：`document` 上的 `drop` 如果也 `preventDefault`，`dropzone` 的 `drop` 还会触发吗？**

**会。`preventDefault` 只阻止"默认行为"，不阻止"事件传播"。**

**所以两者可以共存。**

## 练习二：加并发池（最多 3 个）

**要求：** 上传 10 个文件时，最多同时传 3 个。

```javascript
const uploadWithPool = async (files, concurrency = 3) => {
  const queue = [...files];
  const results = [];

  const worker = async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      results.push(await uploadOne(file, ...));
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
};
```

**为什么：**

**串行 10 个太慢，全并发 10 个占内存。**

**3 个并发是"速度"和"资源"的平衡。**

**这个模式在真实项目里叫"并发池"（concurrency pool），第 22 周（性能）会正式讲。**

## 练习三：加"复制链接"

**要求：** 每个文件加一个"复制链接"按钮，复制 `/view.html?id=5`。

```javascript
await navigator.clipboard.writeText(`${location.origin}/view.html?id=${file.id}`);
```

**注意：**

**`navigator.clipboard` 需要 HTTPS 或 localhost。**

**在 `http://localhost` 下能用（浏览器把 localhost 当安全上下文）。**

**部署到 HTTP 服务器上会失败 —— 那时要么上 HTTPS（第 31 周），要么用 `document.execCommand("copy")` 兜底。**

## 练习四：想清楚这四个问题

```text
1. 为什么上传进度必须用 XHR 不能用 fetch？
2. 为什么逐条上传而不是并发？
3. 为什么切换筛选要清空选择？
4. 拖拽为什么必须 preventDefault？
```

---

# 第 9 步：最终验收

## A. 后端

- [ ] `POST /api/files/batch-delete` 能用
- [ ] 返回 `{ deleted, failed }` 分开
- [ ] 上限 100
- [ ] `ids` 逐个校验

## B. 前端

- [ ] 拖拽上传能用
- [ ] 点选上传能用
- [ ] 每条有独立进度条
- [ ] 超 5 个被截断并提示
- [ ] 超大文件前端就拒
- [ ] 服务端拒绝时显示错误
- [ ] 全选/取消全选
- [ ] 单个勾选高亮
- [ ] 批量删除能用
- [ ] 部分失败如实显示
- [ ] 切换筛选清空选择
- [ ] `loading="lazy"` 生效

## C. 实测

- [ ] 十一条测试全部跑过
- [ ] 记下三个数字（上传耗时/删除耗时/传输量）
- [ ] 做过四个实验
- [ ] `results/e07.md` 写完

## D. 认知

- [ ] 我知道为什么必须用 XHR
- [ ] 我知道串行和并发的取舍
- [ ] 我知道为什么切换筛选要清选择
- [ ] 我知道拖拽必须 `preventDefault`

## 本节课要能说出口的一句话

> **上传和列表在一个页面，拖拽就能传，多选就能删 —— 这才叫"工具"。分成三个页面的，只是"功能"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 拖文件进去浏览器打开了 | 没 `preventDefault` | 加 |
| 重复选同一文件无效 | `input.value` 没清 | `fileInput.value = ""` |
| 进度条不动 | 用了 `fetch` | 改 XHR |
| 上传成功列表没变 | 没 `await load()` | 加 |
| 批量删了看不见的 | `picked` 没清 | 切换时 `clear()` |
| 批量删全失败 | id 已被删 | 正常，看 `failed` |
| 图片变形 | 没 `object-fit: cover` | 加 |
| 列表出来很慢 | 没懒加载 | `loading="lazy"` |
| XHR 4xx 当成成功 | 没检查 `xhr.status` | 显式判断 |
| Cookie 没带 | 没 `withCredentials` | 设 `true` |
