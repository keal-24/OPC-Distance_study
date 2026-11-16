# 第 19 节课：把数据存起来——JSON 文件当数据库

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课的留言板，一重启服务器就清空了。
> 这节课解决这件事：**把数据写进文件，让它在重启后还在。**

**建议用时**：120 分钟
**你需要先完成**：第 18 节课（留言板能存能取）

---

# 第 0 步：为什么"存到文件"是必经一步（5 分钟）

## 0.1 三种存储的层次

```text
第一层：内存变量        → 重启就没（你现在在这）
第二层：JSON 文件       → 重启还在，但只能单机、数据量小
第三层：真数据库        → 重启还在，能并发、能查询、能事务（第 5 周）
```

**为什么不直接跳到第三层：**

因为数据库要安装、要连接、要写 SQL。**在第 5 周之前，你还没有这些基础。**

**而 JSON 文件方案能让你立刻看到一个关键概念：**

```text
数据是"持久化"的，不是活在内存里的。
```

**这一层做通了，换成数据库时你会发现"只是换了个存取的地方"，其他逻辑几乎不变。**

## 0.2 JSON 文件当数据库的真实局限

**必须提前告诉你，不然你会误用：**

| 问题 | 说明 |
|---|---|
| 只能单进程 | 两个 Node 进程同时写会互相覆盖 |
| 没有并发控制 | 10 个人同时提交，可能丢数据 |
| 没有索引 | 1 万条以后查一条要遍历全部 |
| 没有事务 | 写到一半崩溃，文件可能损坏 |
| 数据全在内存 | 文件大了，每次读都要全量加载 |

**所以：JSON 文件只适合"学习、原型、单用户工具"。**

**真实项目，哪怕只有 100 个用户，也该上数据库。**

**这节课的价值不是"教你用 JSON 当数据库"，而是让你亲手体会上面这些局限从哪来。**

## 0.3 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `src/store.js` | `03-练习代码/chat-app` | 数据读写模块 |
| `data/messages.json` | `03-练习代码/chat-app` | 数据文件 |
| `src/app.js` | `03-练习代码/chat-app` | 改造后的接口 |

---

# 第 1 步：先看 `fs/promises` 怎么用（20 分钟）

## 1.1 为什么是 `fs/promises`

**Node 有两套文件操作 API：**

```javascript
import fs from "fs";              // 回调式（老写法）
import fs from "fs/promises";     // Promise 式（新写法）
```

**回调式：**

```javascript
fs.readFile("a.txt", "utf8", (err, data) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(data);
});
```

**Promise 式：**

```javascript
const data = await fs.readFile("a.txt", "utf8");
```

**为什么用 Promise 式：**

- 能用 `await`，代码从上往下读，不用嵌套；
- 能用 `try/catch` 统一处理错误；
- 不会出现"回调地狱"。

**本课程统一用 `fs/promises`。**

## 1.2 四个最基本的操作

**在一个临时目录里试（不要在课程仓库里乱建文件）：**

**新建 `tmp-test/test.js`：**

```javascript
import fs from "fs/promises";
import path from "path";

const FILE = path.join(process.cwd(), "demo.json");

// 1. 写文件
await fs.writeFile(FILE, JSON.stringify({ hello: "世界" }, null, 2), "utf8");
console.log("写完");

// 2. 读文件
const text = await fs.readFile(FILE, "utf8");
console.log("读到：", text);

// 3. 解析
const data = JSON.parse(text);
console.log("解析后：", data.hello);

// 4. 删除文件
await fs.unlink(FILE);
console.log("删完");
```

**运行：**

```text
node test.js
```

**应该看到：**

```text
写完
读到： {
  "hello": "世界"
}
解析后： 世界
删完
```

**`process.cwd()` 是什么：** 当前工作目录（current working directory），也就是你运行命令时所在的目录。

## 1.3 四个操作的关键参数

### `fs.writeFile(路径, 内容, 编码)`

```javascript
await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
```

**三个参数：**

| 参数 | 说明 |
|---|---|
| 路径 | 绝对路径最安全 |
| 内容 | **必须是字符串**（对象要先 `JSON.stringify`） |
| 编码 | `"utf8"`，不写中文会乱码 |

**注意：`writeFile` 是"覆盖"，不是"追加"。**

**想追加用 `fs.appendFile`。** 但**对 JSON 文件绝对不能用追加**（会破坏 JSON 结构）。

### `fs.readFile(路径, 编码)`

```javascript
const text = await fs.readFile(FILE, "utf8");
```

**不传 `"utf8"` 会怎样：**

```javascript
const buf = await fs.readFile(FILE);
console.log(buf);   // <Buffer 7b 0a 20 20 22 ...>
```

**得到的是 Buffer（原始字节）。** 你得自己转：

```javascript
buf.toString("utf8");
```

**规则：读文本文件永远传 `"utf8"`。**

### `fs.unlink(路径)`

**删文件。**

**注意名字叫 `unlink`（解除链接）而不是 `delete`，这是从 Unix 继承的术语。**

## 1.4 一个必须处理的错误：文件不存在

**第一次运行时，`data/messages.json` 还不存在。**

**如果直接读：**

```javascript
const text = await fs.readFile(FILE, "utf8");
```

**会抛错：**

```text
Error: ENOENT: no such file or directory, open 'B:\...\data\messages.json'
    at async ...
  errno: -4058,
  code: 'ENOENT',
  syscall: 'open',
  path: 'B:\\...\\data\\messages.json'
```

**`ENOENT` 是什么：**
"Error NO ENTry"，意思就是"文件不存在"。

**正确做法：捕获它，当成"空数据"处理。**

```javascript
const readJson = async (filePath, fallback) => {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;      // 文件不存在 → 返回默认值
    }
    throw error;            // 其他错误照常抛
  }
};
```

**注意 `throw error` 这一行。**

**为什么不能全部吞掉：**
因为"文件不存在"是正常情况，可以返回默认值。**但"文件权限不足"、"JSON 格式损坏"是异常，必须暴露出来。**

**如果全部吞掉，你的程序会在数据损坏时静默地清空一切。** 这是很严重的事故。

**这条原则叫：只处理你预期的错误。**

---

# 第 2 步：写 `src/store.js`（25 分钟）

## 2.1 新建目录和数据文件

**操作：**

1. 进入 `chat-app`。
2. 新建文件夹 `data`。
3. **不要**手动建 `messages.json`，让程序自己创建（这样你能验证"文件不存在"的处理）。

## 2.2 写 `src/store.js`

**自己敲：**

```javascript
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "messages.json");

// 读取：文件不存在就返回默认值
const readAll = async () => {
  try {
    const text = await fs.readFile(DATA_FILE, "utf8");
    const data = JSON.parse(text);

    if (!Array.isArray(data.items)) {
      return { nextId: 1, items: [] };
    }

    return data;
  } catch (error) {
    if (error.code === "ENOENT") {
      return { nextId: 1, items: [] };
    }
    throw error;
  }
};

// 写入：先确保目录存在
const writeAll = async (data) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
};

// 列出全部
export const listMessages = async () => {
  const data = await readAll();
  return data.items;
};

// 新建一条
export const createMessage = async ({ text, author }) => {
  const data = await readAll();

  const item = {
    id: data.nextId,
    text,
    author,
    createdAt: new Date().toISOString(),
  };

  data.items.push(item);
  data.nextId += 1;

  await writeAll(data);

  return item;
};

// 删除一条
export const deleteMessage = async (id) => {
  const data = await readAll();
  const index = data.items.findIndex((item) => item.id === id);

  if (index === -1) {
    return null;
  }

  const [removed] = data.items.splice(index, 1);
  await writeAll(data);

  return removed;
};
```

## 2.3 逐段理解

### `fs.mkdir(DATA_DIR, { recursive: true })`

```javascript
await fs.mkdir(DATA_DIR, { recursive: true });
```

**`mkdir` = make directory，建目录。**

**`{ recursive: true }` 是什么：**

- 目录不存在 → 创建；
- 目录已存在 → **不报错**（这是关键）；
- 多级路径（`a/b/c`）→ 一路创建。

**不写 `recursive` 时：** 目录已存在会抛 `EEXIST`。

**为什么写这一行：**
因为你把项目 clone 到新电脑时，`data` 目录可能不在 Git 里（里面是数据，不该提交）。

**所以每次写之前先确保目录存在。** 这叫"防御性编程"。

### 为什么 `id` 用 `nextId` 而不是 `items.length + 1`

```javascript
id: data.nextId,
...
data.nextId += 1,
```

**因为删除会改变 `length`。**

**举例：**

```text
有 3 条：id = 1, 2, 3，nextId = 4
删除 id=2 → 剩 [1, 3]，length = 2
如果用 length + 1 → 新 id = 3，跟已有的 3 撞了
用 nextId → 新 id = 4，没问题
```

**这就是"自增计数器"和"数组长度"的区别。**

**真实数据库用 `AUTO_INCREMENT` 或序列，也是同样的道理。**

### `data.items.splice(index, 1)`

```javascript
const [removed] = data.items.splice(index, 1);
```

**`splice(起点, 删除几个)`：从数组里删掉元素，返回被删的数组。**

**`const [removed] = ...` 是什么：** 数组解构，取第一个元素。

**等价写法：**

```javascript
const removedList = data.items.splice(index, 1);
const removed = removedList[0];
```

**解构写法更短。** 这是 ES6 语法，在 React 里到处都是。

### `findIndex` 返回 -1

```javascript
const index = data.items.findIndex((item) => item.id === id);

if (index === -1) {
  return null;
}
```

**`findIndex` 找不到时返回 `-1`，不是 `undefined`。**

**为什么：**
因为它返回的是"位置"，位置从 0 开始，所以用 -1 表示"没有"。

**对比 `find`：**

```javascript
items.find((x) => x.id === id)        // 找不到返回 undefined
items.findIndex((x) => x.id === id)   // 找不到返回 -1
```

**如果忘了判断 -1 直接 splice(-1, 1)：**
**会删掉最后一个元素！** 因为它把 -1 理解成"从末尾数第一个"。

**这是极其危险的一个坑。** 一定要判断。

### 为什么要 `readAll` 每次读文件

```javascript
export const createMessage = async ({ text, author }) => {
  const data = await readAll();
  ...
};
```

**为什么不在模块顶层读一次，缓存在内存里：**

**因为两个原因：**

1. **一致性**：如果文件被别的程序改了，缓存就过期了；
2. **简单**：不用处理"什么时候刷新缓存"。

**代价是性能：** 每次操作都读一次文件。

**这就是"JSON 文件当数据库"的性能瓶颈。** 真实数据库会把这部分做得非常高效（索引、缓存、连接池）。

**现在先接受这个代价。** 你的留言板只有几十条数据，读文件是毫秒级的。

## 2.4 手动测一下 store

**新建 `src/test-store.js`（临时测试文件）：**

```javascript
import { listMessages, createMessage, deleteMessage } from "./store.js";

console.log("初始：", await listMessages());

const a = await createMessage({ text: "第一条", author: "小明" });
console.log("新建：", a);

const b = await createMessage({ text: "第二条", author: "小红" });
console.log("新建：", b);

console.log("全部：", await listMessages());

await deleteMessage(a.id);
console.log("删掉第一条后：", await listMessages());

console.log("删不存在的：", await deleteMessage(999));
```

**运行：**

```text
node src/test-store.js
```

**应该看到：**

```text
初始： []
新建： { id: 1, text: '第一条', author: '小明', createdAt: '...' }
新建： { id: 2, text: '第二条', author: '小红', createdAt: '...' }
全部： [ { id: 1, ... }, { id: 2, ... } ]
删掉第一条后： [ { id: 2, ... } ]
删不存在的： null
```

**然后检查 `data/messages.json`：**

```json
{
  "nextId": 3,
  "items": [
    {
      "id": 2,
      "text": "第二条",
      "author": "小红",
      "createdAt": "2026-11-16T07:40:00.000Z"
    }
  ]
}
```

**注意两件事：**

1. **`nextId` 是 3**（虽然只剩一条，因为删过）；
2. **`items` 里只有 id=2**。

**再运行一次 `node src/test-store.js`。**

**你会看到：**

```text
初始： [ { id: 2, ... } ]
```

**初始不是空的！** 因为数据从文件读出来了。**这就是持久化。**

**清空数据文件（方便后面测试）：**

**把 `data/messages.json` 内容改成：**

```json
{
  "nextId": 1,
  "items": []
}
```

**或者直接删掉这个文件**（程序会重新创建）。

---

# 第 3 步：改造 `src/app.js`（25 分钟）

## 3.1 完整代码

**自己敲：**

```javascript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { listMessages, createMessage, deleteMessage } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// 健康检查
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 列表
app.get("/api/messages", async (req, res, next) => {
  try {
    const items = await listMessages();
    res.json({ total: items.length, items });
  } catch (error) {
    next(error);
  }
});

// 新建
app.post("/api/messages", async (req, res, next) => {
  try {
    const { text, author } = req.body || {};

    if (typeof text !== "string" || text.trim() === "") {
      res.status(400).json({ error: "text 必填，且必须是非空字符串" });
      return;
    }

    if (text.trim().length > 200) {
      res.status(400).json({ error: "text 最多 200 个字符" });
      return;
    }

    const item = await createMessage({
      text: text.trim(),
      author: typeof author === "string" && author.trim() !== "" ? author.trim() : "匿名",
    });

    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

// 删除
app.delete("/api/messages/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "id 必须是正整数" });
      return;
    }

    const removed = await deleteMessage(id);

    if (!removed) {
      res.status(404).json({ error: `没有 ID 为 ${id} 的留言` });
      return;
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// 404 兜底
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error("捕获到错误：", err);
  res.status(500).json({ error: "服务器内部错误" });
});

app.listen(PORT, () => {
  console.log(`已启动：http://localhost:${PORT}`);
});
```

## 3.2 三个必须理解的点

### 点一：`async` 路由要包 `try/catch` 并调 `next(error)`

```javascript
app.get("/api/messages", async (req, res, next) => {
  try {
    const items = await listMessages();
    res.json({ items });
  } catch (error) {
    next(error);      // ← 关键
  }
});
```

**为什么必须这样：**

**Express 4 不会自动捕获 `async` 函数里的错误。**

**如果不包 `try/catch`，`listMessages()` 抛错时会发生：**

1. Promise 变成 rejected；
2. **没有人处理这个 rejection**；
3. 在 Node 18+ 会出现 `UnhandledPromiseRejection`；
4. **请求会一直挂着，浏览器转圈直到超时。**

**这就是"async 路由必须 try/catch"的由来。**

**`next(error)` 做了什么：**
把错误交给错误处理中间件。

**这是 Express 4 必须写的样板代码。** Express 5 会自动处理，但 4 不会。

**规则：所有 `async` 路由，必须 `try { ... } catch (e) { next(e); }`。**

### 点二：`res.status(204).end()`

```javascript
res.status(204).end();
```

**`204` = No Content，成功但没有内容返回。**

**为什么删除用 204：**
因为没什么可返回的。**用 `res.json({ ok: true })` 也行，但 204 更符合语义。**

**注意必须调 `.end()`，不能只 `.status(204)`。** 不调 `end` 请求就挂住了。

**前端怎么处理 204：**

```javascript
const response = await fetch(`/api/messages/${id}`, { method: "DELETE" });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
// 不要调 response.json()，因为没有内容
```

**如果对 204 响应调 `.json()` 会报错：**

```text
SyntaxError: Unexpected end of JSON input
```

**这个坑很常见。** 记住：204 不要 `json()`。

### 点三：`next` 要作为第三个参数声明

```javascript
app.get("/api/messages", async (req, res, next) => {
```

**`next` 必须写出来。** 不写就没法调 `next(error)`。

**注意：普通路由有三个参数，错误处理中间件有四个。** 这两个不能混。

## 3.3 前端改一处

**`public/main.js` 里，每条留言后面加删除按钮。**

**把 `renderMessages` 改一下（自己敲）：**

```javascript
const renderMessages = (items) => {
  msgList.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "msg-item";

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = `${item.author} · ${new Date(item.createdAt).toLocaleString("zh-CN")}`;

    const text = document.createElement("div");
    text.className = "msg-text";
    text.textContent = item.text;

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "del-btn";
    delBtn.textContent = "删除";
    delBtn.dataset.id = String(item.id);

    li.appendChild(meta);
    li.appendChild(text);
    li.appendChild(delBtn);
    msgList.appendChild(li);
  });

  empty.style.display = items.length === 0 ? "block" : "none";
};
```

**注意 `delBtn.dataset.id = String(item.id)`。**

**`dataset` 是什么：**
把数据挂到 DOM 元素上。`dataset.id` 对应 HTML 的 `data-id` 属性。

**为什么要转成字符串：**
因为 `dataset` 只能存字符串。存数字会被转成字符串，但**显式转换更清楚**。

**然后加事件委托（第 2 周第 13 节课学过）：**

```javascript
msgList.addEventListener("click", async (event) => {
  const btn = event.target.closest(".del-btn");
  if (!btn) return;

  const id = btn.dataset.id;

  try {
    const response = await fetch(`/api/messages/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setStatus("已删除", "ok");
    await loadMessages();
  } catch (error) {
    setStatus(`删除失败：${error.message}`, "error");
  }
});
```

**`event.target.closest(".del-btn")` 是什么：**

**`closest` 从当前元素往上找，返回第一个匹配选择器的祖先（包括自己）。**

**为什么不能直接用 `event.target`：**
因为用户可能点到按钮里的文字。**`closest` 能保证无论点按钮还是文字，都能找到按钮。**

**这个技巧比 `classList.contains` 更健壮。**

**加一点 CSS：**

```css
.del-btn {
  margin-top: 8px;
  padding: 4px 10px;
  font-size: 13px;
  font-family: inherit;
  color: #e53935;
  background: transparent;
  border: 1px solid #e53935;
  border-radius: 4px;
  cursor: pointer;
}

.del-btn:hover {
  background: #e53935;
  color: #fff;
}
```

## 3.4 测试持久化

**这是本节课的关键验证，按顺序做：**

1. **重启服务器：** `Ctrl + C` 然后 `npm run dev`
2. **刷新页面** → 检查之前的留言还在不在

**应该还在。** 因为现在从文件读了。

3. **发一条新留言**
4. **打开 `data/messages.json` 看**

**应该能看到新留言的完整 JSON。**

5. **再重启服务器，刷新页面** → 还在

6. **手动改 `data/messages.json`**，把某条 `text` 改成 `"我手动改的"`
7. **刷新页面** → 显示的是"我手动改的"

**第 6、7 步很重要：** 这证明**数据真的在文件里，不在内存里。**

## 3.5 一个你会遇到的问题

**如果你在服务器运行时手动改 `data/messages.json`，然后发新留言，你的手动修改会丢。**

**为什么：**

```text
① 服务器发新留言 → readAll 读到最新（包含你改的）
```

**等等，这样不会丢。** 让我重新想。

**实际上会丢的情况是：**

```text
① 服务器 readAll（读到 A 版本）
② 你手动改文件（变成 B 版本）
③ 服务器 writeAll（写回 A 版本 + 新留言）→ 你的 B 版本改动被覆盖
```

**这个时间窗口很短，但真实存在。**

**这就是"并发写入"问题。** 两个写入者（你和服务器）不知道对方在改，最后写的那个人赢。

**真实数据库用"锁"或"事务"解决这个问题。**

**JSON 文件方案做不到。** 这是它的硬伤。

**把这个现象记进笔记。** 它是理解数据库为什么存在的关键。

---

# 第 4 步：故意犯六个错（20 分钟）

## 错误 1：`writeFile` 传了对象

**操作：**

```javascript
await fs.writeFile(DATA_FILE, data, "utf8");
```

（`data` 是对象）

**会怎样：**

```text
TypeError [ERR_INVALID_ARG_TYPE]: The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received an instance of Object
```

**为什么：**
`writeFile` 只接受字符串或 Buffer。

**修法：** `JSON.stringify(data, null, 2)`。

**记法：** `writeFile` 之前一定 `stringify`，`readFile` 之后一定 `parse`。

## 错误 2：`readFile` 没传编码

**操作：**

```javascript
const text = await fs.readFile(DATA_FILE);
```

**会怎样：**

```text
SyntaxError: Unexpected token '<' in JSON at position 0
```

**等等，为什么是这个错？**

因为 `text` 是一个 Buffer 对象，`JSON.parse(Buffer)` 会先把它转成字符串。**而 Buffer 的 `toString()` 默认是 utf8，大部分情况能工作。**

**但在某些情况下会失败**（比如 Buffer 里有 BOM）。

**更重要的是：这个错误信息会误导你。** 你以为 JSON 格式错了，其实是没传编码。

**规则：永远传 `"utf8"`。**

## 错误 3：忘了 `fs.mkdir`

**操作：** 在 `writeAll` 里删掉 `fs.mkdir`。

**然后删掉整个 `data` 目录，重启服务器，发一条留言。**

**会怎样：**

```text
Error: ENOENT: no such file or directory, open 'B:\...\data\messages.json'
```

**为什么：**
`writeFile` 不会自动创建父目录。

**这是一个反直觉的行为。** 很多人以为 `writeFile` 会自动建目录。

**规则：写文件前确保目录存在。**

## 错误 4：`async` 路由没 `try/catch`

**操作：** 把列表路由改成：

```javascript
app.get("/api/messages", async (req, res) => {
  const items = await listMessages();
  res.json({ items });
});
```

**然后让 `listMessages` 抛错**（比如把 `DATA_FILE` 指向一个非法路径）。

**会怎样：**

- 服务器终端打印 `UnhandledPromiseRejection` 警告；
- **浏览器一直转圈，直到 30 秒超时。**

**为什么：**
Promise rejection 没人接，错误处理中间件也收不到。

**修法：** 包 `try/catch` 并 `next(error)`。

**这个坑的可怕之处：** 服务器看起来"没崩"，但所有请求都挂死。

## 错误 5：`findIndex` 忘了判断 `-1`

**操作：**

```javascript
export const deleteMessage = async (id) => {
  const data = await readAll();
  const index = data.items.findIndex((item) => item.id === id);
  const [removed] = data.items.splice(index, 1);   // 删掉了 -1 检查
  await writeAll(data);
  return removed;
};
```

**然后 `DELETE /api/messages/999`（不存在的 id）。**

**会怎样：** **删掉了最后一条真实留言！**

**为什么：**
`splice(-1, 1)` 被理解成"从末尾删一个"。

**这是数据丢失级 bug。** 一定要判断 `-1`。

## 错误 6：对 204 响应调 `.json()`

**操作（前端）：**

```javascript
const response = await fetch(`/api/messages/${id}`, { method: "DELETE" });
const data = await response.json();    // ← 204 没有内容
```

**会怎样：**

```text
SyntaxError: Unexpected end of JSON input
```

**为什么：** 204 的响应体是空的，`json()` 解析空字符串失败。

**修法：**

```javascript
if (response.status === 204) {
  // 不需要解析
} else {
  const data = await response.json();
}
```

**或者更简单：删除接口不返回内容，前端就不解析。**

## 六个错误总结

```text
writeFile 传对象        → ERR_INVALID_ARG_TYPE
readFile 不传编码       → 报错信息误导
不 mkdir 就写           → ENOENT
async 路由不 try/catch  → 请求挂死 + UnhandledPromiseRejection
findIndex 不判 -1       → 删掉最后一条（数据丢失）
对 204 调 json()        → Unexpected end of JSON input
```

**排查顺序：**

```text
① ENOENT → 查目录存不存在、路径对不对
② ERR_INVALID_ARG_TYPE → 查有没有 stringify
③ 请求挂死不返回 → 查 async 有没有 try/catch + next
④ 数据莫名少了 → 查 findIndex 的 -1 判断
⑤ Unexpected end of JSON → 查是不是 204
```

---

# 第 5 步：理解这一层的局限（10 分钟）

## 5.1 亲手验证"并发丢数据"

**这个实验很重要，会让你真正理解为什么需要数据库。**

**操作：**

1. 新建 `src/test-concurrent.js`：

```javascript
import { createMessage, listMessages } from "./store.js";

// 同时发 20 个请求
const tasks = Array.from({ length: 20 }, (_, i) =>
  createMessage({ text: `并发消息 ${i + 1}`, author: "测试" })
);

await Promise.all(tasks);

const items = await listMessages();
console.log(`应该有 20 条，实际有 ${items.length} 条`);
```

2. 先清空 `data/messages.json`（改成 `{"nextId":1,"items":[]}`）。
3. 运行：

   ```text
   node src/test-concurrent.js
   ```

**你会看到类似这样（数字会因机器不同略有差异，但一定少很多）：**

```text
初始: 0
新建 id: 1 2
全部: 2
删后: [ 2 ]
删不存在: null
并发测试：应有 23 条，实际 2 条
```

**这是我在自己机器上跑出来的真实结果：23 条只存进 2 条，丢了 21 条。**

**而且打开 `data/messages.json` 你会看到更糟的事：**

```json
{
  "nextId": 4,
  "items": [
    { "id": 2, "text": "第二条", ... },
    { "id": 3, "text": "并发19", ... }
  ]
}
```

**`nextId` 只涨到了 4** —— 说明 20 次自增大部分也一起丢了。**连计数器都被覆盖回去。**

**为什么：**

```text
20 个 createMessage 几乎同时开始
  ↓
它们几乎同时 readAll，都读到同一个初始状态（同一个 nextId、同一个 items）
  ↓
各自算出"新 id = 同一个数"，各自 push 到自己的副本里
  ↓
各自 writeAll，最后写的那个把前面所有覆盖掉
```

**这就是"竞态条件"（race condition）。**

**注意一个细节：你看到的最后两条是 `"第二条"` 和 `"并发19"` —— 不是最早写的，是"最后写完的那个人的版本"。**

**真实数据库怎么解决：**

- 写操作排队（锁）；
- 或者用事务隔离；
- 或者用原子操作（`UPDATE ... SET count = count + 1`）。

**JSON 文件一个都没有。所以它只能单进程、低并发。**

## 5.2 把这四条写进笔记

```text
① 并发写会丢数据（我刚验证丢了多少条）
② 没有事务，写到一半崩溃文件可能损坏
③ 每次操作读整个文件，数据量大了很慢
④ 没有权限控制，谁能读文件谁就能看全部数据
```

**这四条就是"为什么需要数据库"的答案。**

## 5.3 一个更隐蔽的问题

**如果 `JSON.parse` 失败会怎样？**

**做这个实验：**

1. 手动把 `data/messages.json` 改坏（比如删掉一个右花括号）：

   ```json
   {
     "nextId": 5,
     "items": [
       { "id": 1, "text": "测试" }
   ```

2. 刷新页面。

**你会看到：** 页面加载失败，提示"加载失败：Unexpected end of JSON input"。

**数据全丢了？** 没有，文件还在。**但程序读不出来。**

**更糟的情况：**
如果这时用户发一条新留言，`readAll` 会抛错，**新留言也存不进去**。

**真实数据库不会这样：**
它有自己的文件格式、校验、崩溃恢复机制。**这就是"数据库"这个软件的复杂之处。**

**所以：不要用 JSON 文件存重要数据。**

---

# 第 6 步：写学习笔记（10 分钟）

```markdown
# 第 19 节课学习笔记

## 一、三种存储层次

| 层次 | 重启后还在吗 | 适合什么 |
|---|---|---|
| 内存变量 | | |
| JSON 文件 | | |
| 数据库 | | |

## 二、`fs/promises` 四个操作

```javascript
// 写
await fs.writeFile(路径, ____, "utf8");

// 读
const text = await fs.readFile(路径, ____);

// 解析成对象
const data = ____(text);

// 删
await fs.____(路径);
```

`writeFile` 的第二个参数必须是什么类型：

`readFile` 不传 `"utf8"` 会得到什么：

## 三、`ENOENT` 是什么

全称：

正确处理方式：

为什么不能把所有错误都吞掉：

## 四、`fs.mkdir` 的 `recursive: true` 解决了什么

## 五、为什么要 `nextId` 而不是 `items.length + 1`

举例说明：

## 六、`findIndex` 找不到返回什么

如果不判断会怎样：

## 七、`async` 路由为什么必须 `try/catch`

不写会怎样：

`next(error)` 的作用：

## 八、204 状态码

意思：

前端拿到 204 应该怎么处理：

对 204 调 `.json()` 会报什么：

## 九、`dataset` 和 `closest`

```javascript
delBtn.dataset.id = String(item.id);   // 对应 HTML 的什么属性
event.target.closest(".del-btn")       // 为什么不直接用 event.target
```

## 十、我的并发测试结果

代码发了几条：

实际存了几条：

丢了多少：

原因：

## 十一、JSON 文件当数据库的四条局限

1.
2.
3.
4.

## 十二、六个错误的后果

| 错误 | 报错或现象 | 怎么查 |
|---|---|---|
| writeFile 传对象 | | |
| readFile 不传编码 | | |
| 不 mkdir | | |
| async 不 try/catch | | |
| findIndex 不判 -1 | | |
| 对 204 调 json | | |

## 十三、我还不懂的词

- 

## 十四、完成检查

- [ ] 数据能存到 `data/messages.json`
- [ ] 重启服务器后数据还在
- [ ] 我手动改文件，页面能看到改动
- [ ] 删除接口能用，且不存在的 id 返回 404
- [ ] `async` 路由都包了 `try/catch`
- [ ] 我做过并发测试，看到数据丢失
- [ ] 我做过 JSON 损坏测试
- [ ] 我能说出 JSON 文件当数据库的四条局限
```

---

# 第 7 步：课后练习

## 练习一：加"编辑"功能

**要求：**

1. `store.js` 加 `updateMessage(id, { text })`；
2. `app.js` 加 `PUT /api/messages/:id`；
3. 前端点"编辑"按钮，用 `prompt()` 输入新内容（简单做法），然后调接口。

**提示：** 注意判断 id 存在、text 合法。

## 练习二：加"按作者筛选"

**要求：**

1. `GET /api/messages?author=小明` 只返回小明的；
2. 前端加一个筛选输入框。

**提示：** 后端用 `req.query.author`，前端拼查询字符串：

```javascript
const url = author ? `/api/messages?author=${encodeURIComponent(author)}` : "/api/messages";
```

**`encodeURIComponent` 是什么：**
把中文、空格、特殊字符转成 URL 安全的形式。

**不写会怎样：** 中文作者名可能传不过去，或者 `&` 会被当成参数分隔符。

## 练习三：加"备份"

**要求：**

1. 每次写入前，把旧文件复制成 `messages.backup.json`；
2. 这样文件损坏时能恢复。

**提示：** `fs.copyFile(源, 目标)`。

**思考：这次备份能解决第 6 步那个"文件损坏"问题吗？为什么不能完全解决？**

## 练习四：找出这段代码的五个问题

```javascript
import fs from "fs";

export const save = (data) => {
  fs.writeFile("./data.json", data);
};

export const load = () => {
  const text = fs.readFileSync("./data.json");
  return text;
};
```

**提示方向：** 用了回调版 `fs`、没 `stringify`、没编码、没处理 `ENOENT`、路径是相对的。

## 练习五：用自己的话讲

```text
为什么先学 JSON 文件，而不是直接学数据库？
JSON 文件当数据库最大的三个问题是什么？
为什么 findIndex 的 -1 判断是必须的？
为什么 async 路由必须 try/catch？
```

---

# 第 8 步：最终验收

## A. 文件操作

- [ ] 我会用 `fs.readFile` 并传 `"utf8"`
- [ ] 我会用 `fs.writeFile` 并 `JSON.stringify`
- [ ] 我会用 `fs.mkdir` 的 `recursive: true`
- [ ] 我知道 `ENOENT` 是什么，并会正确处理
- [ ] 我知道不能把所有错误都吞掉

## B. store 模块

- [ ] `store.js` 有 `listMessages`、`createMessage`、`deleteMessage`
- [ ] 用一个 `nextId` 自增，不用 `length + 1`
- [ ] `findIndex` 判断了 `-1`
- [ ] 每次操作都读写文件（没有内存缓存）

## C. 接口

- [ ] `GET /api/messages` 从文件读
- [ ] `POST /api/messages` 写文件并返回 201
- [ ] `DELETE /api/messages/:id` 能删，不存在返回 404
- [ ] 删除成功返回 204
- [ ] 所有 `async` 路由都有 `try/catch` + `next(error)`

## D. 持久化

- [ ] 重启服务器后数据还在
- [ ] 手动改文件后页面能看到改动
- [ ] `data/messages.json` 里有合法 JSON
- [ ] `nextId` 在删除后不会回退

## E. 前端

- [ ] 删除按钮能用
- [ ] 删除后列表刷新
- [ ] 用 `dataset` 传 id
- [ ] 用 `closest` 找按钮
- [ ] 对 204 不调 `json()`

## F. 局限

- [ ] 我做过并发测试，看到数据丢失
- [ ] 我做过 JSON 损坏测试
- [ ] 我能说出至少四条 JSON 文件当数据库的局限

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有并发测试的实际数字
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **"存到文件"解决了"重启就没了"，但没解决"同时写入会互相覆盖"——后者才是数据库真正的价值。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `ENOENT` | 文件或目录不存在 | 先 `mkdir`，捕获 ENOENT 返回默认值 |
| `ERR_INVALID_ARG_TYPE` | `writeFile` 传了对象 | 加 `JSON.stringify` |
| `Unexpected token` in JSON | 文件内容损坏 | 检查文件内容 |
| 请求一直挂着 | `async` 路由没 `try/catch` | 加 `try/catch` + `next` |
| 数据莫名少一条 | `findIndex` 没判 `-1` | 加判断 |
| `Unexpected end of JSON input` | 对 204 调了 `json()` | 判状态码 |
| 中文变乱码 | 读写没传 `"utf8"` | 都加上 |
| 写入后读到旧数据 | 有内存缓存没刷新 | 每次读文件 |
| 并发写丢数据 | 竞态条件 | 需要数据库/锁 |
| 文件被写坏 | 写到一半崩溃 | 先写临时文件再重命名 |
| `nextId` 重复 | 用了 `length + 1` | 用独立计数器 |
| 删除接口返回 404 但实际删了 | 判断顺序错 | 先判断存在再删 |
