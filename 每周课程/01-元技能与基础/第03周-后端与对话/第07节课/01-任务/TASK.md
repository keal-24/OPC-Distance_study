# 第 21 节课：做出第一个完整应用——带记忆的对话

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你能和模型说话了。但它**不记得上一句**。
> 这节课把它做成一个真正能用的东西：**记得上下文、能开新对话、能看历史。**

**建议用时**：130 分钟
**你需要先完成**：第 20 节课（能调通模型）

---

# 第 0 步：为什么它"不记得"（10 分钟）

## 0.1 一个让你困惑的现象

**上节课的应用：**

```text
你：我叫小明
模型：你好，小明。

你：我叫什么？
模型：抱歉，我不知道你的名字。
```

**明明刚说过，为什么它不知道？**

## 0.2 因为模型没有"记忆"

**这是最重要的一课，必须彻底想明白。**

**模型接口是"无状态"的。**

```text
每次请求，都是独立的一次
服务器不保存任何东西
模型不记得上一次你说过什么
```

**那为什么 ChatGPT 能记得？**

**因为每次发请求时，客户端把"整个对话历史"一起发过去了。**

## 0.3 一次请求的真实内容

**你以为发了：**

```json
{ "message": "我叫什么？" }
```

**实际上要发：**

```json
{
  "messages": [
    { "role": "system", "content": "你是一个助手" },
    { "role": "user", "content": "我叫小明" },
    { "role": "assistant", "content": "你好，小明。" },
    { "role": "user", "content": "我叫什么？" }
  ]
}
```

**模型看到的是完整对话，所以它"记得"。**

**关键认知：**

```text
记忆不存在于模型里，存在你的数据库里。
每次请求都要把历史重新发一遍。
```

## 0.4 这件事带来三个必须解决的问题

```text
① 历史存在哪   → 存文件（今天）/ 存数据库（第 5 周）
② 历史多长     → token 有上限，不能无限发
③ 怎么区分不同对话 → 一个"会话 id"
```

**今天的课就是解决这三个。**

## 0.5 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `src/store.js` | `03-练习代码/chat-app` | 会话和消息的存储 |
| `src/app.js` | `03-练习代码/chat-app` | 带历史的对话接口 |
| `public/chat.html` | `03-练习代码/chat-app` | 会话列表 + 对话区 |

---

# 第 1 步：设计数据结构（15 分钟）

## 1.1 要存什么

**一个"会话"里有很多"消息"。**

```text
会话（session）
├── id
├── title        会话标题（用第一条消息生成）
├── createdAt
└── messages     消息列表
    ├── role: "user" | "assistant"
    ├── content
    └── createdAt
```

**为什么要有"会话"这一层：**

因为没有它，所有消息混在一起，**你没法开新话题**。

**就像微信：你可以有多个聊天窗口，每个窗口是一个会话。**

## 1.2 数据结构设计

**`data/chat.json` 的结构：**

```json
{
  "nextSessionId": 2,
  "sessions": [
    {
      "id": 1,
      "title": "关于学习计划的讨论",
      "createdAt": "2026-11-16T08:00:00.000Z",
      "messages": [
        {
          "role": "user",
          "content": "帮我制定一个学习计划",
          "createdAt": "2026-11-16T08:00:00.000Z"
        },
        {
          "role": "assistant",
          "content": "好的，建议每天……",
          "createdAt": "2026-11-16T08:00:05.000Z"
        }
      ]
    }
  ]
}
```

**为什么 `messages` 嵌在 `sessions` 里，而不是单独一个数组：**

**因为查询几乎总是"某个会话的消息"。** 嵌套访问更快、结构更清晰。

**代价：** 想查"所有含某个词的消息"要遍历两层。**这个问题数据库能解决。**

## 1.3 先想清楚三个边界

**在写代码之前，先回答这三个问题：**

**问题一：历史太长怎么办？**

模型有 token 上限（比如 8k、32k）。**发太多会被拒或截断。**

**今天的做法：只取最近 20 条。**

```javascript
const history = session.messages.slice(-20);
```

**`slice(-20)` 是什么：** 取最后 20 个。

**为什么是 20：**
因为 20 条消息、每条几百字，大概 2-4k token，**远低于模型上限，也控制了成本。**

**问题二：会话标题怎么来？**

**用第一条用户消息的前 20 个字。**

```javascript
const title = text.slice(0, 20);
```

**为什么不额外调一次模型生成标题：**
因为那要花钱、要时间。**20 个字够用了。**

**问题三：消息存哪一份？**

**这里有个容易搞错的地方：**

```text
浏览器内存里有一份（用于显示）
服务器文件里有一份（用于持久化 + 发历史）
```

**两份必须一致。**

**怎么保证：**
**每次发消息后，服务器返回完整的最新会话，前端整体重新渲染。**

**这叫"服务器是唯一真相源"（single source of truth）。**

**为什么不各存一份然后同步：**
因为会不一致。**网络断了、页面刷新了、两个人同时改……各种情况下都会错。**

---

# 第 2 步：写存储层（30 分钟）

## 2.1 在 `src/store.js` 里加会话相关函数

**保留第 19 节课的留言板函数，追加下面这些。**

**自己敲：**

```javascript
// ========== 会话存储（追加在原有代码后面） ==========

const CHAT_FILE = path.join(DATA_DIR, "chat.json");

const readChat = async () => {
  try {
    const text = await fs.readFile(CHAT_FILE, "utf8");
    const data = JSON.parse(text);

    if (!Array.isArray(data.sessions)) {
      return { nextSessionId: 1, sessions: [] };
    }

    return data;
  } catch (error) {
    if (error.code === "ENOENT") {
      return { nextSessionId: 1, sessions: [] };
    }
    throw error;
  }
};

const writeChat = async (data) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CHAT_FILE, JSON.stringify(data, null, 2), "utf8");
};

// 列出所有会话（只返回摘要，不返回消息，省流量）
export const listSessions = async () => {
  const data = await readChat();

  return data.sessions.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    messageCount: s.messages.length,
  }));
};

// 新建会话
export const createSession = async (title = "新对话") => {
  const data = await readChat();

  const session = {
    id: data.nextSessionId,
    title: title.slice(0, 30),
    createdAt: new Date().toISOString(),
    messages: [],
  };

  data.sessions.push(session);
  data.nextSessionId += 1;

  await writeChat(data);

  return session;
};

// 拿单个会话（含消息）
export const getSession = async (id) => {
  const data = await readChat();
  return data.sessions.find((s) => s.id === id) || null;
};

// 往会话里追加一条消息
export const appendMessage = async (sessionId, { role, content }) => {
  const data = await readChat();
  const session = data.sessions.find((s) => s.id === sessionId);

  if (!session) {
    return null;
  }

  const message = {
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  session.messages.push(message);

  // 第一条用户消息自动成为标题
  if (session.messages.filter((m) => m.role === "user").length === 1 && role === "user") {
    session.title = content.slice(0, 20);
  }

  await writeChat(data);

  return message;
};

// 删除会话
export const deleteSession = async (id) => {
  const data = await readChat();
  const index = data.sessions.findIndex((s) => s.id === id);

  if (index === -1) {
    return null;
  }

  const [removed] = data.sessions.splice(index, 1);
  await writeChat(data);

  return removed;
};
```

## 2.2 三个设计决策

### 决策一：`listSessions` 不返回消息内容

```javascript
return data.sessions.map((s) => ({
  id: s.id,
  title: s.title,
  createdAt: s.createdAt,
  messageCount: s.messages.length,     // 只给数量
}));
```

**为什么不返回完整消息：**

**因为列表页不需要。**

**如果有 50 个会话，每个 100 条消息，一次返回就是 5000 条消息。** 前端只显示标题，这 5000 条全是浪费。

**这叫"按需加载"。** 真实项目里，列表接口和数据详情接口一定是分开的。

### 决策二：标题自动生成只做一次

```javascript
if (session.messages.filter((m) => m.role === "user").length === 1 && role === "user") {
  session.title = content.slice(0, 20);
}
```

**`filter(...).length === 1` 的意思是：这是第一条用户消息。**

**为什么加这个条件：**

不加的话，**每发一条消息，标题都会被改成最新的那句。** 会话列表会一直变，很难找。

**规则：标题只在第一次发言时定。**

### 决策三：`appendMessage` 返回 `null` 表示会话不存在

```javascript
if (!session) {
  return null;
}
```

**为什么不在 store 里抛错：**

因为"会话不存在"是**业务上的正常情况**（用户可能删了、或者 id 传错）。

**store 层只管数据，判断"要不要报错"是路由层的事。**

**这叫"分层职责"。** store 不关心 HTTP 状态码。

## 2.3 手动测一下

**新建 `src/test-chat.js`：**

```javascript
import {
  listSessions,
  createSession,
  getSession,
  appendMessage,
  deleteSession,
} from "./store.js";

console.log("初始会话数：", (await listSessions()).length);

const s = await createSession();
console.log("新会话：", s.id);

await appendMessage(s.id, { role: "user", content: "我叫小明，请记住" });
await appendMessage(s.id, { role: "assistant", content: "好的，小明。" });
await appendMessage(s.id, { role: "user", content: "我叫什么？" });

const full = await getSession(s.id);
console.log("标题：", full.title);
console.log("消息数：", full.messages.length);
console.log("第一条：", full.messages[0]);
console.log("最后一条：", full.messages[full.messages.length - 1]);

console.log("列表：", await listSessions());
```

**运行：**

```text
node src/test-chat.js
```

**应该看到：**

```text
初始会话数： 0
新会话： 1
标题： 我叫小明，请记住
消息数： 3
第一条： { role: 'user', content: '我叫小明，请记住', createdAt: '...' }
最后一条： { role: 'user', content: '我叫什么？', createdAt: '...' }
列表： [ { id: 1, title: '我叫小明，请记住', createdAt: '...', messageCount: 3 } ]
```

**注意标题是"我叫小明，请记住"** —— 用第一条用户消息的前 20 字。

---

# 第 3 步：改造对话接口（35 分钟）

## 3.1 五个接口

```text
GET    /api/sessions              列出所有会话
POST   /api/sessions              新建会话
GET    /api/sessions/:id          拿单个会话（含消息）
DELETE /api/sessions/:id          删除会话
POST   /api/sessions/:id/messages 发消息（核心）
```

**为什么发消息挂在 `/sessions/:id/messages` 下面：**

因为它**属于某个会话**。REST 风格的 URL 应该体现"从属关系"。

**对比：**

```text
POST /api/chat                   ← 不体现从属，不知道往哪个会话发
POST /api/sessions/3/messages    ← 清晰：往会话 3 发消息
```

## 3.2 写接口

**在 `src/app.js` 里加。自己敲：**

```javascript
import {
  listSessions,
  createSession,
  getSession,
  appendMessage,
  deleteSession,
} from "./store.js";
import { chat, LlmError } from "./llm.js";

const MAX_HISTORY = 20;

// 列出会话
app.get("/api/sessions", async (req, res, next) => {
  try {
    const items = await listSessions();
    res.json({ total: items.length, items });
  } catch (error) {
    next(error);
  }
});

// 新建会话
app.post("/api/sessions", async (req, res, next) => {
  try {
    const session = await createSession();
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

// 单个会话
app.get("/api/sessions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "id 必须是正整数" });
      return;
    }

    const session = await getSession(id);

    if (!session) {
      res.status(404).json({ error: `没有 ID 为 ${id} 的会话` });
      return;
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
});

// 删除会话
app.delete("/api/sessions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "id 必须是正整数" });
      return;
    }

    const removed = await deleteSession(id);

    if (!removed) {
      res.status(404).json({ error: `没有 ID 为 ${id} 的会话` });
      return;
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// 发消息（核心）
app.post("/api/sessions/:id/messages", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { content } = req.body || {};

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "id 必须是正整数" });
      return;
    }

    if (typeof content !== "string" || content.trim() === "") {
      res.status(400).json({ error: "content 必填，且必须是非空字符串" });
      return;
    }

    if (content.length > 2000) {
      res.status(400).json({ error: "content 最多 2000 个字符" });
      return;
    }

    const session = await getSession(id);

    if (!session) {
      res.status(404).json({ error: `没有 ID 为 ${id} 的会话` });
      return;
    }

    // 1. 先把用户消息存进去
    await appendMessage(id, { role: "user", content: content.trim() });

    // 2. 取最近 N 条历史，加上 system 提示，发给模型
    const latest = await getSession(id);
    const history = latest.messages.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let result;

    try {
      result = await chat([
        { role: "system", content: "你是一个友好的中文助手。回答简洁，控制在两百字以内。" },
        ...history,
      ]);
    } catch (error) {
      // 模型失败：把用户消息留在这里，返回错误，让用户可以重试
      if (error instanceof LlmError) {
        console.error(`[LLM] ${error.userMessage} | ${error.detail}`);
        res.status(error.statusCode).json({
          error: error.userMessage,
          session: await getSession(id),
        });
        return;
      }
      throw error;
    }

    // 3. 把模型回复也存进去
    await appendMessage(id, { role: "assistant", content: result.content });

    const final = await getSession(id);

    res.json({
      reply: result.content,
      usage: result.usage,
      finishReason: result.finishReason,
      session: final,
    });
  } catch (error) {
    next(error);
  }
});
```

## 3.3 逐段理解五个关键决策

### 决策一：先把用户消息存起来，再调模型

```javascript
await appendMessage(id, { role: "user", content: content.trim() });
...
result = await chat([...history]);
```

**为什么不一起存：**

**因为模型可能失败。**

**如果等模型成功再一起存，模型挂掉时用户的输入就丢了。** 用户会很生气："我打了 300 字，你告诉我有错误，字没了。"

**先存用户消息，失败后用户还能看到自己说了什么，可以重试。**

**这是"不丢用户数据"的基本原则。**

### 决策二：`...history` 展开

```javascript
await chat([
  { role: "system", content: "你是一个友好的中文助手..." },
  ...history,
]);
```

**`...history` 做了什么：** 把数组摊开，和前面的 system 消息合并成一个数组。

**等价写法：**

```javascript
const messages = [{ role: "system", content: "..." }];
messages.push(...history);   // 或 messages.concat(history)
await chat(messages);
```

**注意顺序：`system` 必须在最前面。** 有些模型对顺序敏感。

### 决策三：`slice(-MAX_HISTORY)`

```javascript
const history = latest.messages.slice(-MAX_HISTORY).map(...)
```

**只取最近 20 条。**

**为什么不取全部：**

**因为 token 有上限。**

**假如一个会话聊了 200 轮，每轮 200 字，一次请求就是 8 万字 ≈ 12 万 token。** 大多数模型直接拒绝。

**而且成本是线性增长的。** 第 200 轮比第 1 轮贵 200 倍。

**这是所有对话应用必须处理的问题。** 生产环境的做法更复杂（滑动窗口 + 摘要 + 向量检索），第 13 周会讲。

### 决策四：`.map((m) => ({ role, content }))`

```javascript
.map((m) => ({ role: m.role, content: m.content }))
```

**为什么要"只取两个字段"：**

因为存的消息里有 `createdAt`，但模型接口**不认识这个字段**。

**直接把带 `createdAt` 的对象发过去会怎样：**

有些厂商的接口会**报错**"unexpected field"。有些会忽略。**不能赌。**

**规则：发给外部接口的数据，只带它需要的字段。**

### 决策五：模型失败时返回 `session`

```javascript
res.status(error.statusCode).json({
  error: error.userMessage,
  session: await getSession(id),
});
```

**为什么要带上 `session`：**

因为用户消息已经存进去了。**前端需要拿到最新的会话，才能把用户那条消息显示出来。**

**如果只返回 `error`，前端就不知道"我这条消息到底存了没"。**

**这是"API 设计要考虑前端的需要"。**

## 3.4 测接口

**启动服务器，用 curl 测：**

```text
curl -X POST http://localhost:3000/api/sessions
```

**应该返回：**

```json
{"id":1,"title":"新对话","createdAt":"...","messages":[]}
```

```text
curl -X POST http://localhost:3000/api/sessions/1/messages -H "Content-Type: application/json" -d "{\"content\":\"我叫小明\"}"
```

**（假模型要开着）**

**应该返回：**

```json
{
  "reply": "你说的是「我叫小明」。这是模拟回复。",
  "usage": { ... },
  "session": { "id": 1, "title": "我叫小明", "messages": [ ...两条... ] }
}
```

**再发一条：**

```text
curl -X POST http://localhost:3000/api/sessions/1/messages -H "Content-Type: application/json" -d "{\"content\":\"我叫什么？\"}"
```

**注意：假模型不会真的"记住"，它只是拼字符串。但你可以验证"历史确实发了过去"。**

**怎么验证：** 在假模型里打印收到的 `messages` 长度。

**在 `mock-llm.js` 里的 `req.on("end")` 里加一行：**

```javascript
console.log(`收到 ${messages.length} 条消息：`, messages.map((m) => m.role).join(", "));
```

**重启假模型，再发一条。**

**你应该看到：**

```text
收到 5 条消息： system, user, assistant, user, assistant
```

**等等，为什么是 5 条？**

**因为你的会话里已经有 4 条（user/assistant × 2），加上 system，再加这次的新 user，共 5 条。**

**这就是"历史被完整发送"的证据。**

---

# 第 4 步：前端界面（30 分钟）

## 4.1 界面结构

```text
┌─────────────┬──────────────────────────┐
│ 会话列表     │  对话区                   │
│             │  ┌────────────────────┐  │
│ + 新对话     │  │ 用户：我叫小明      │  │
│             │  │ 模型：你好，小明。  │  │
│ 我叫小明     │  └────────────────────┘  │
│ 学习计划     │  ┌────────────────────┐  │
│ 关于报价     │  │ 输入框              │  │
│             │  └────────────────────┘  │
└─────────────┴──────────────────────────┘
```

**这是最常见的对话应用布局。**

## 4.2 `public/chat.html`

**自己敲（完整替换上节课的 chat.html）：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>对话应用</title>
  <style>
    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #333;
      background: #f5f5f5;
      height: 100vh;
      display: flex;
      overflow: hidden;
    }

    /* 左侧会话列表 */
    .sidebar {
      width: 240px;
      flex-shrink: 0;
      background: #fff;
      border-right: 1px solid #e0e0e0;
      display: flex;
      flex-direction: column;
    }

    .sidebar-head {
      padding: 16px;
      border-bottom: 1px solid #e0e0e0;
    }

    .btn-new {
      width: 100%;
      padding: 10px;
      font-size: 14px;
      font-family: inherit;
      color: #fff;
      background: #1a73e8;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }

    .btn-new:hover { background: #1765cc; }

    .session-list {
      flex: 1;
      overflow-y: auto;
      list-style: none;
      margin: 0;
      padding: 8px;
    }

    .session-item {
      position: relative;
      padding: 10px 32px 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .session-item:hover { background: #f0f0f0; }
    .session-item.active { background: #e8f0fe; color: #1a73e8; }

    .session-item .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-item .count {
      font-size: 12px;
      color: #999;
      margin-top: 2px;
    }

    .session-del {
      position: absolute;
      top: 50%;
      right: 6px;
      transform: translateY(-50%);
      width: 22px;
      height: 22px;
      padding: 0;
      font-size: 14px;
      line-height: 1;
      color: #999;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      display: none;
    }

    .session-item:hover .session-del { display: block; }
    .session-del:hover { background: #ffebee; color: #c62828; }

    /* 右侧对话区 */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .chat-head {
      padding: 14px 20px;
      background: #fff;
      border-bottom: 1px solid #e0e0e0;
      font-size: 15px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .empty-hint {
      color: #999;
      text-align: center;
      padding-top: 40px;
      font-size: 14px;
    }

    .msg {
      margin-bottom: 18px;
      display: flex;
      flex-direction: column;
    }

    .msg.user { align-items: flex-end; }
    .msg.assistant { align-items: flex-start; }

    .msg-bubble {
      max-width: 76%;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 15px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .msg.user .msg-bubble { background: #1a73e8; color: #fff; }
    .msg.assistant .msg-bubble { background: #fff; }
    .msg.error .msg-bubble { background: #ffebee; color: #c62828; }

    .msg-time {
      font-size: 12px;
      color: #aaa;
      margin-top: 4px;
    }

    .composer {
      border-top: 1px solid #e0e0e0;
      background: #fff;
      padding: 12px 20px 16px;
    }

    .composer textarea {
      width: 100%;
      padding: 10px 12px;
      font-size: 15px;
      font-family: inherit;
      border: 1px solid #d0d0d0;
      border-radius: 8px;
      outline: none;
      resize: none;
      min-height: 60px;
      max-height: 160px;
    }

    .composer textarea:focus {
      border-color: #1a73e8;
      box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
    }

    .composer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }

    .composer-meta { font-size: 13px; color: #999; }

    .btn-send {
      padding: 9px 22px;
      font-size: 15px;
      font-family: inherit;
      color: #fff;
      background: #1a73e8;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }

    .btn-send:hover { background: #1765cc; }
    .btn-send:disabled { background: #b0bec5; cursor: not-allowed; }

    @media (max-width: 640px) {
      .sidebar { width: 150px; }
      .msg-bubble { max-width: 88%; }
    }
  </style>
</head>
<body>

  <aside class="sidebar">
    <div class="sidebar-head">
      <button type="button" class="btn-new" id="newBtn">+ 新对话</button>
    </div>
    <ul class="session-list" id="sessionList"></ul>
  </aside>

  <main class="main">
    <div class="chat-head" id="chatHead">请选择或新建一个对话</div>

    <div class="messages" id="messages">
      <p class="empty-hint">还没有消息</p>
    </div>

    <div class="composer">
      <textarea id="input" placeholder="说点什么…… Ctrl + Enter 发送" maxlength="2000"></textarea>
      <div class="composer-row">
        <span class="composer-meta" id="meta"></span>
        <button type="button" class="btn-send" id="sendBtn" disabled>发送</button>
      </div>
    </div>
  </main>

  <script src="chat.js"></script>
</body>
</html>
```

## 4.3 `public/chat.js`

**自己敲：**

```javascript
const sessionList = document.querySelector("#sessionList");
const chatHead = document.querySelector("#chatHead");
const messagesEl = document.querySelector("#messages");
const input = document.querySelector("#input");
const sendBtn = document.querySelector("#sendBtn");
const newBtn = document.querySelector("#newBtn");
const meta = document.querySelector("#meta");

let currentSessionId = null;
let sessions = [];

const api = async (url, options = {}) => {
  const response = await fetch(url, options);
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = new Error((data && data.error) || `HTTP ${response.status}`);
    error.payload = data;
    throw error;
  }

  return data;
};

// ========== 渲染会话列表 ==========
const renderSessions = () => {
  sessionList.innerHTML = "";

  sessions.forEach((s) => {
    const li = document.createElement("li");
    li.className = "session-item" + (s.id === currentSessionId ? " active" : "");
    li.dataset.id = String(s.id);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = s.title || "新对话";

    const count = document.createElement("div");
    count.className = "count";
    count.textContent = `${s.messageCount} 条消息`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "session-del";
    del.textContent = "×";
    del.title = "删除这个对话";

    li.appendChild(title);
    li.appendChild(count);
    li.appendChild(del);
    sessionList.appendChild(li);
  });
};

// ========== 渲染消息 ==========
const renderMessages = (session) => {
  messagesEl.innerHTML = "";

  if (!session || session.messages.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-hint";
    p.textContent = session ? "还没有消息，说点什么吧" : "请选择或新建一个对话";
    messagesEl.appendChild(p);
    return;
  }

  session.messages.forEach((m) => {
    const wrap = document.createElement("div");
    wrap.className = `msg ${m.role}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = m.content;

    const time = document.createElement("div");
    time.className = "msg-time";
    time.textContent = new Date(m.createdAt).toLocaleString("zh-CN");

    wrap.appendChild(bubble);
    wrap.appendChild(time);
    messagesEl.appendChild(wrap);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
};

const appendError = (text) => {
  const wrap = document.createElement("div");
  wrap.className = "msg error";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

// ========== 加载会话列表 ==========
const loadSessions = async () => {
  const data = await api("/api/sessions");
  sessions = data.items;
  renderSessions();
};

// ========== 打开某个会话 ==========
const openSession = async (id) => {
  const session = await api(`/api/sessions/${id}`);
  currentSessionId = id;
  chatHead.textContent = session.title || "新对话";
  sendBtn.disabled = false;
  renderMessages(session);
  renderSessions();
};

// ========== 新建会话 ==========
newBtn.addEventListener("click", async () => {
  try {
    const session = await api("/api/sessions", { method: "POST" });
    await loadSessions();
    await openSession(session.id);
    input.focus();
  } catch (error) {
    alert(`新建失败：${error.message}`);
  }
});

// ========== 点击会话列表 ==========
sessionList.addEventListener("click", async (event) => {
  const delBtn = event.target.closest(".session-del");
  const item = event.target.closest(".session-item");

  if (!item) return;

  const id = Number(item.dataset.id);

  if (delBtn) {
    if (!confirm("确定删除这个对话？")) return;

    try {
      await api(`/api/sessions/${id}`, { method: "DELETE" });
      if (currentSessionId === id) {
        currentSessionId = null;
        chatHead.textContent = "请选择或新建一个对话";
        messagesEl.innerHTML = '<p class="empty-hint">请选择或新建一个对话</p>';
        sendBtn.disabled = true;
      }
      await loadSessions();
    } catch (error) {
      alert(`删除失败：${error.message}`);
    }
    return;
  }

  try {
    await openSession(id);
  } catch (error) {
    alert(`打开失败：${error.message}`);
  }
});

// ========== 发送消息 ==========
const send = async () => {
  if (currentSessionId === null) return;

  const content = input.value.trim();
  if (content === "") return;

  sendBtn.disabled = true;
  meta.textContent = "模型思考中……";

  // 乐观显示：先把自己说的话显示出来，不等服务器
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = content;
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  input.value = "";

  const started = performance.now();

  try {
    const data = await api(`/api/sessions/${currentSessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    renderMessages(data.session);
    await loadSessions();

    const seconds = ((performance.now() - started) / 1000).toFixed(2);
    const tokens = data.usage ? ` · ${data.usage.total_tokens} tokens` : "";
    meta.textContent = `${seconds}s${tokens}`;
  } catch (error) {
    appendError(error.message);
    meta.textContent = "";

    // 服务器可能已经存了用户消息，用它刷新
    if (error.payload && error.payload.session) {
      renderMessages(error.payload.session);
    } else {
      await openSession(currentSessionId);
    }
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
};

sendBtn.addEventListener("click", send);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    send();
  }
});

// 输入框自动增高
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

// ========== 初始化 ==========
loadSessions().then(() => {
  if (sessions.length > 0) {
    openSession(sessions[sessions.length - 1].id);
  }
});
```

## 4.4 五个值得单独说的设计

### 设计一：`api()` 统一封装

```javascript
const api = async (url, options = {}) => {
  const response = await fetch(url, options);
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = new Error((data && data.error) || `HTTP ${response.status}`);
    error.payload = data;
    throw error;
  }

  return data;
};
```

**为什么要封装：**

**因为这段逻辑每个请求都要用：**

- 发请求；
- 判断响应是不是 JSON；
- 判断 `response.ok`；
- 抛出带 `payload` 的错误。

**封装后，每个调用点只需要 `await api(...)`，不用重复七行。**

**`content-type` 判断为什么必要：**
因为 204（删除成功）没有响应体，204 也没有 `application/json`。**直接 `json()` 会报错。**

**这是第 19 节课那个坑的通用解法。**

### 设计二：`error.payload` 传递服务器数据

```javascript
const error = new Error(...);
error.payload = data;
throw error;
```

**为什么：**

因为错误响应里可能带着**有用的数据**。比如模型失败时我们返回了 `session`。

**如果只抛 `message`，前端就丢了 `session`。**

**这是"错误也要携带上下文"的设计。**

### 设计三：乐观显示

```javascript
// 乐观显示：先把自己说的话显示出来，不等服务器
const wrap = document.createElement("div");
wrap.className = "msg user";
...
messagesEl.appendChild(wrap);
```

**为什么：**

因为网络可能要等 1-3 秒。**如果等服务器返回才显示，用户会觉得"卡了"。**

**先显示自己说的话，用户立刻看到反馈。** 这叫"乐观更新"（optimistic UI）。

**风险：** 如果请求失败，这条消息其实没存进去。

**所以失败后要 `renderMessages(error.payload.session)` 或 `openSession(...)` 重新渲染**，把"假的那条"清掉。

**这是"乐观更新必须配对失败回滚"。**

### 设计四：`renderMessages(data.session)` 整体重渲染

```javascript
renderMessages(data.session);
```

**为什么每次都整体重渲染，而不是"追加一条"：**

**因为服务器是唯一真相源。**

**整体重渲染的好处：**

- 简单，不会不一致；
- 服务器返回什么就显示什么；
- 不用管"这条是新的还是旧的"。

**代价：** 每次都重建 DOM，性能不如增量更新。

**但对话消息量小（几十条），完全够用。**

**什么时候需要增量更新：**
几千条消息、或者需要动画。**现在不用考虑。**

### 设计五：`loadSessions()` 用最后一条

```javascript
loadSessions().then(() => {
  if (sessions.length > 0) {
    openSession(sessions[sessions.length - 1].id);
  }
});
```

**为什么打开最后一个：**

因为 `sessions` 是按创建顺序追加的，**最后一个是最新的。** 用户最可能想继续最近那个对话。

**这是"默认行为要符合直觉"。**

## 4.5 测试清单

**把假模型和应用都启动起来，逐项测：**

- [ ] 打开页面，自动打开最后一个会话（如果是空的就显示提示）
- [ ] 点"+ 新对话"，左侧多一条，右侧变空
- [ ] 发一条消息，立刻看到自己说的话（蓝色气泡）
- [ ] 等回复出现（白色气泡）
- [ ] 再发一条，**两条历史都在**
- [ ] 刷新页面，消息还在
- [ ] 点另一个会话，切换过去了
- [ ] 切回来，消息还在
- [ ] 悬停会话，出现删除按钮
- [ ] 删除一个会话，列表少一条
- [ ] 删除当前会话，右侧回到空白
- [ ] 输入"慢一点"，等超时后出现红色错误
- [ ] 输入"出错了"，出现红色错误
- [ ] 错误后，之前发的消息还在

**最后一项最重要，一定要测。**

---

# 第 5 步：验证"记忆"到底来自哪（15 分钟）

## 5.1 这个实验必须做

**目标：亲眼确认"记忆来自数据库，不是来自模型"。**

**操作：**

1. **在应用里发两条消息：**

   ```text
   你：我叫小明
   你：我叫什么？
   ```

2. **看服务器终端**（假模型会打印收到的消息数）

3. **现在做这个实验：**

   打开 `data/chat.json`，把第一个会话的 `messages` 数组**手动清空**：

   ```json
   {
     "nextSessionId": 2,
     "sessions": [
       {
         "id": 1,
         "title": "我叫小明",
         "createdAt": "...",
         "messages": []
       }
     ]
   }
   ```

4. **刷新页面，打开那个会话**

**你会看到：** 消息列表空了。

5. **发一条新消息"你好"**

6. **看假模型的输出**

**你会发现：** 它只收到 `system` 和这一条 `user`，**之前的两条完全没了。**

## 5.2 结论

```text
模型从来没有"记住"任何东西。
它每次看到的，都是你这一次发过去的那几条消息。
"记忆"完全是你的数据库在承担。
```

**把这个结论写进笔记。这是本课最重要的一句话。**

## 5.3 一个延伸思考

**既然历史是数据库里的，那就可以做这些事：**

- 修改历史里某条消息，然后重新发（"编辑重答"）；
- 删除历史里某条消息（"删掉这句话"）；
- 把 A 会话的消息复制到 B 会话；
- 搜索历史里的关键词。

**所有"AI 记忆"类功能，本质都是"操作数据库里的消息列表"。**

**想明白这一点，你就不会再觉得 AI 应用神秘了。**

---

# 第 6 步：故意犯六个错（20 分钟）

## 错误 1：只发当前消息，不发历史

**操作：** 在 `app.js` 里把 `...history` 去掉：

```javascript
result = await chat([
  { role: "system", content: "..." },
  { role: "user", content: content.trim() },
]);
```

**会怎样：** 模型永远不记得上一句。**每句话都像第一次聊天。**

**这就是上节课的状态。**

## 错误 2：把 `createdAt` 一起发给模型

**操作：** 去掉 `.map`：

```javascript
const history = latest.messages.slice(-MAX_HISTORY);
```

**会怎样：** 假模型不校验，所以看不出来。

**但真模型可能报 400：** `Unrecognized request argument: createdAt`。

**规则：外部接口只发它认识的字段。**

## 错误 3：模型失败时把用户消息也删了

**操作：** 把"先存用户消息"移到模型调用成功之后。

**会怎样：** 输入"慢一点"超时后，**用户打的那段话消失了。**

**用户的感受：** "我写了半天，你告诉我出错了，字还没了。"

**这是最伤用户的一种 bug。**

## 错误 4：不做 `slice(-MAX_HISTORY)`

**操作：** 把全部历史发过去。

**然后连续发 30 条消息。**

**会怎样：**

- 假模型不限制，所以能跑；
- **但请求体越来越大，响应越来越慢**；
- 换真模型后，**很可能因为超过 token 上限而报错**。

**怎么观察：** 在假模型的日志里看"收到 N 条消息"，N 一直涨。

## 错误 5：删除会话不判断"是不是当前打开的"

**操作：** 在删除处理里去掉 `if (currentSessionId === id)` 那段。

**会怎样：** 删掉当前会话后，右侧还显示已删除的消息。**再发一条会返回 404。**

**为什么：** 前端状态和服务器不一致了。

**修法：** 删除后如果删的是当前会话，要清空右侧并禁用发送。

## 错误 6：不判 `response.ok` 就 `json()`

**操作：** 在 `api()` 里去掉 `if (!response.ok) throw`。

**然后发一条超长消息（超过 2000 字）。**

**会怎样：** 服务器返回 400 + `{"error":"content 最多 2000 个字符"}`。

**如果不判 `ok`：** 前端会把 `data` 当成成功响应，`data.session` 是 `undefined`，`renderMessages(undefined)` 清空页面。

**用户看到：所有消息突然消失。** 而实际上服务器里还在。

**这就是"不判 ok 会导致状态错乱"。**

## 六个错误总结

```text
不发历史              → 模型"失忆"
多发 createdAt        → 真模型 400
模型失败删用户消息     → 最伤用户
不限制历史长度        → token 爆炸、变慢
删会话不更新前端       → 状态不一致、404
不判 ok 就 json()     → 页面被清空
```

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 21 节课学习笔记

## 一、为什么模型"不记得"

我的理解：

那 ChatGPT 为什么记得：

一次请求真正发过去的内容（画出结构）：

## 二、本课最重要的结论

> 记忆不存在于 ______，存在于 ______。

## 三、数据结构

```json
（默写会话的结构）
```

为什么 messages 嵌在 sessions 里：

为什么列表接口不返回消息内容：

## 四、三个必须处理的边界

| 问题 | 我的做法 | 为什么 |
|---|---|---|
| 历史太长 | | |
| 会话标题 | | |
| 消息存哪一份 | | |

## 五、为什么先存用户消息再调模型

如果反过来会怎样：

## 六、为什么要 `.map` 只取两个字段

多发 `createdAt` 会怎样：

## 七、`MAX_HISTORY = 20` 的取舍

为什么不能太大：

为什么不能太小：

## 八、乐观更新

是什么：

好处：

风险：

失败后怎么回滚：

## 九、我的"记忆"验证实验

我清空了哪个文件的什么内容：

清空后模型收到了几条消息：

结论：

## 十、六个错误的后果

| 错误 | 现象 | 用户感受 |
|---|---|---|
| 不发历史 | | |
| 多发 createdAt | | |
| 模型失败删用户消息 | | |
| 不限制历史长度 | | |
| 删会话不更新前端 | | |
| 不判 ok 就 json() | | |

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 能新建会话
- [ ] 能切换会话
- [ ] 能删除会话
- [ ] 发消息后刷新页面，消息还在
- [ ] 同一会话里多轮对话，历史都发给了模型
- [ ] 我手动清空文件后，模型"失忆"了
- [ ] 超时后用户消息还在
- [ ] 我做过六个错误的实验
```

---

# 第 8 步：课后练习

## 练习一：加"重新生成"

**要求：**

1. 每条模型回复下面加"重新生成"按钮；
2. 点击后删掉这条模型回复，用同样的历史再请求一次。

**提示：** 需要一个 `DELETE /api/sessions/:id/messages/:index` 接口，或者直接在服务端实现"重答"。

**思考：** 为什么"重新生成"其实是"删掉最后一条 assistant 消息，然后重发请求"？

## 练习二：加"编辑我的消息"

**要求：**

1. 每条用户消息可以点击编辑；
2. 编辑后，**删掉这条之后的所有消息**，然后重新请求。

**为什么要删掉后面的：**

因为历史必须一致。如果用户改了第 2 句，第 3、4 句是基于旧的第 2 句产生的，**逻辑上已经不成立了。**

**这是所有对话应用的标准做法。**

## 练习三：加"会话搜索"

**要求：**

1. 侧边栏加一个搜索框；
2. 输入关键词，只显示标题匹配的会话。

**提示：** 前端过滤 `sessions` 数组就行。

**思考：** 现在只能搜标题，因为列表接口不返回消息内容。**如果要搜消息内容，该怎么改？代价是什么？**

## 练习四：加"导出对话"

**要求：**

1. 一个"导出"按钮；
2. 把当前会话导出成 Markdown 文件下载。

**提示：**

```javascript
const blob = new Blob([markdown], { type: "text/markdown" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "对话.md";
a.click();
URL.revokeObjectURL(url);
```

**为什么要 `revokeObjectURL`：**
不释放会一直占内存。**这是容易漏的一步。**

## 练习五：用自己的话讲

```text
为什么模型不记得上一句？
"记忆"到底存在哪里？
为什么要先存用户消息再调模型？
为什么每次都要把历史重新发一遍？
```

---

# 第 9 步：最终验收

## A. 理解

- [ ] 我能解释"模型无状态"
- [ ] 我知道"记忆"存在数据库里
- [ ] 我知道每次请求都要发完整历史
- [ ] 我做过"清空文件后模型失忆"的实验

## B. 数据结构

- [ ] `data/chat.json` 结构正确
- [ ] 会话有 `id`、`title`、`createdAt`、`messages`
- [ ] 消息有 `role`、`content`、`createdAt`
- [ ] 用 `nextSessionId` 自增

## C. 接口

- [ ] `GET /api/sessions` 返回摘要（不含消息）
- [ ] `POST /api/sessions` 新建，返回 201
- [ ] `GET /api/sessions/:id` 返回完整会话
- [ ] `DELETE /api/sessions/:id` 删除，返回 204
- [ ] `POST /api/sessions/:id/messages` 能对话
- [ ] 会话不存在返回 404
- [ ] 空 content 返回 400

## D. 对话逻辑

- [ ] 先存用户消息，再调模型
- [ ] 取最近 20 条作为历史
- [ ] 历史只发 `role` 和 `content`
- [ ] `system` 在最前面
- [ ] 模型成功后存 assistant 消息
- [ ] 模型失败时返回 `session`
- [ ] 返回完整的最新会话

## E. 前端

- [ ] 有会话列表，可切换
- [ ] 可新建、可删除
- [ ] 悬停显示删除按钮
- [ ] 可删除当前会话且状态正确
- [ ] 消息分左右气泡
- [ ] 乐观显示用户消息
- [ ] 失败后重新渲染（清掉假消息）
- [ ] 请求期间按钮禁用
- [ ] `Ctrl + Enter` 发送
- [ ] 输入框自动增高
- [ ] 用 `textContent` 渲染

## F. 稳定性

- [ ] 刷新页面消息还在
- [ ] 超时后用户消息还在
- [ ] 删除当前会话不报错
- [ ] 控制台无红色报错

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有"清空文件"实验记录
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **模型从来不记得你，是你在每次请求时替它记住了全部。**

---

# 第 10 步：这一周的收尾

## 10.1 你这一周做出了什么

```text
第 15 节课：一个能返回文字的服务器
第 16 节课：一个有条理的项目结构
第 17 节课：一套 Express 路由和中间件
第 18 节课：前后端第一次真正通信
第 19 节课：数据能持久化到文件
第 20 节课：能调通大模型，且处理了五种失败
第 21 节课：一个能记住上下文的完整对话应用
```

**七个东西，最后一个已经"像个产品"了。**

## 10.2 周验收

- [ ] 这一周每节课都有 commit
- [ ] 每节课的 `NOTES.md` 都有内容
- [ ] 我有一个能真正对话的应用
- [ ] 我知道模型为什么"不记得"，也知道怎么让它记得
- [ ] 我能用假模型测完整个流程，不花一分钱

## 10.3 提交这一周

```text
git add 每周课程/01-元技能与基础/第03周-后端与对话
git commit -m "第03周完成：服务器 + Express + 持久化 + 模型接入 + 对话应用"
git push
```

**提交前必须确认：**

```text
git status
```

**看有没有 `.env` 出现在列表里。**

**如果有，立刻停下：**

```text
git rm --cached 每周课程/.../chat-app/.env
```

**然后确认 `.gitignore` 里有 `.env`。**

## 10.4 更新 CONTEXT.md

**在根目录 `CONTEXT.md` 的"我的作品"里加：**

```markdown
- 第 3 周：带记忆的对话应用
  路径：每周课程/01-元技能与基础/第03周-后端与对话/第07节课/03-练习代码/chat-app
  技术：Node.js + Express + JSON 文件存储 + 模型接口
  功能：多会话、上下文记忆、超时与错误处理
  注意：数据存在 JSON 文件里，只适合单用户
```

## 10.5 三个自问

1. 如果模型接口挂了，我的应用会怎样？
2. 如果一个会话聊了 100 轮，会发生什么？
3. 如果我把这个应用给 10 个人同时用，会发生什么？

**第一个能答，说明第 20 节课学到位了。**
**第二个能答，说明第 21 节课学到位了。**
**第三个答不出来，说明你该学第 5 周的数据库了。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 模型不记得上一句 | 没发历史 | 拼上 `...history` |
| 真模型报 400 | 历史里带了 `createdAt` | `.map` 只取两个字段 |
| 请求越来越慢 | 历史无限增长 | `slice(-20)` |
| 超时后用户消息消失 | 先调模型后存消息 | 先存再调 |
| 删除会话后页面错乱 | 没清 `currentSessionId` | 删除后重置状态 |
| 所有消息突然消失 | 不判 `ok` 就 `renderMessages` | 判 `response.ok` |
| 204 响应报 JSON 错 | 对 204 调 `json()` | 判 `content-type` |
| 会话标题一直变 | 每次发言都改标题 | 只在第一条用户消息时改 |
| 刷新页面消息没了 | 存在前端内存里 | 存服务器 |
| 多个会话混在一起 | 没有 sessionId | 发消息带上会话 id |
| `EADDRINUSE` | 端口被占 | 关旧进程 |
| 页面 404 但接口正常 | 静态目录路径错 | 查 `express.static` |
