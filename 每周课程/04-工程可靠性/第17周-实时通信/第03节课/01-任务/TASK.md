# 第 115 节课：断线、重连、续传

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前两节的连接是"理想网络"。今天把它弄断，看它怎么自己接回来，**以及断掉那段时间的消息怎么办。**

**建议用时**：120 分钟
**你需要先完成**：第 113、114 节（`sse-lab` 有 `sse.js` 和广播）
**今天不装新东西**

---

# 第 0 步：连接一定会断（10 分钟）

## 0.1 七个真实原因

```text
① 用户关了页面、切了 App
② 手机锁屏 → 系统休眠 → 网络断
③ Wi-Fi 切 4G → IP 变了 → 旧连接失效
④ 地铁进隧道 → 网络断 40 秒
⑤ 笔记本合上盖子 2 小时再打开
⑥ 服务端重启（你部署新版本）
⑦ Nginx / 云平台空闲超时（第 114 节那个 60 秒）
```

**没有一条是"异常"。这就是日常。**

## 0.2 所以真正的问题是三个

```text
① 断了之后会不会自己接回来？        → 重连
② 接回来之后，断掉那段数据怎么办？  → 续传
③ 用户知不知道刚才断过？            → 状态提示
```

**三条都做到，才叫"实时功能能交付"。** 缺第二条，用户会看到进度从 70% 跳回 0%。

## 0.3 一个好消息

**`EventSource` 自带重连。** 你什么都不用写：

```text
连接断了 → 浏览器等 3 秒 → 自动重连 → 重连成功 → 继续收数据
```

**坏消息：** 它不知道"你断掉那段时间错过了什么"，**从断点续上是你要自己做的。**

---

# 第 1 步：先看浏览器的自动重连（20 分钟）

## 1.1 现在的代码已经具备条件

`server.js` 里的 `/stream` 用的就是 `EventSource`。**它已经会重连了。**

**验证方法（不用改代码）：**

**① 打开页面，看 Network 面板里的 `/stream`。**

**② 在服务端终端按 `Ctrl+C` 杀掉服务。**

**你应该看到：**

```text
Console: 连接异常，浏览器会自动重连（你的 onerror 打的）
Network: 每隔约 3 秒出现一个新的 /stream 请求，全部失败
页面: "在线连接数" 不再更新
```

**③ 重新 `node server.js`。**

**你应该看到：**

```text
自动恢复，进度条又能动了
你不需要刷新页面
```

**这就是 `EventSource` 的价值。** 用它，重连逻辑是白送的。

## 1.2 用 `retry:` 控制重连间隔

**服务端可以在消息里告诉浏览器"多久后重连"：**

```javascript
res.write("retry: 5000\n\n");     // 5 秒后再连
```

**默认是 3000 毫秒。** 加这一行，能把它改成你要的值。

**什么时候要改：**

```text
服务在重启 → 希望它慢点重连，别把刚起来的服务又打满 → retry: 10000
网络恢复快 → 希望它快点 → retry: 1000
```

## 1.3 什么时候 `EventSource` 不会重连

**这一条很重要，很多人不知道：**

```text
服务端返回 204 No Content     → 浏览器主动放弃，不再重连
服务端返回 4xx（某些情况）    → 可能不再重连
你调用了 es.close()           → 不会重连
```

**所以：** 如果你要对"鉴权失败"做处理，**别指望浏览器重连**，得自己在 `onerror` 里判断并提示用户重新登录。

---

# 第 2 步：续传——补上断掉那段（35 分钟）

## 2.1 原理：`id:` + `Last-Event-ID`

```text
服务端：每条消息带 id: 42
浏览器：记下最后收到的 id
断线重连时：自动带上请求头  Last-Event-ID: 42
服务端：看到这个头，就把 42 之后的消息补发一遍
```

**协议已经帮你做了一半。** 你要做的是**服务端那段"回放"**。

## 2.2 给 `sse.js` 加一个缓冲区

**改 `sse.js`**，在文件开头加：

```javascript
// 环形缓冲：存最近 200 条消息，用于断线续传
const HISTORY_MAX = 200;
const history = [];      // [{ id, event, data }]
let seq = 1;
```

**把 `nextId` 换成 `seq`，`sendTo` 改成这样：**

```javascript
function sendTo(client, event, data) {
  if (!client.alive) return;

  const id = seq++;
  const payload = typeof data === "string" ? data : JSON.stringify(data);

  // 存进历史
  history.push({ id, event, data: payload });
  if (history.length > HISTORY_MAX) history.shift();

  const lines = payload.split("\n").map((l) => `data: ${l}`).join("\n");
  client.res.write(`id: ${id}\nevent: ${event}\n${lines}\n\n`);
}
```

**再加一个回放函数：**

```javascript
export function replay(client, lastEventId) {
  const from = Number(lastEventId);
  if (!Number.isFinite(from)) return 0;

  const missed = history.filter((m) => m.id > from);

  for (const m of missed) {
    const lines = m.data.split("\n").map((l) => `data: ${l}`).join("\n");
    client.res.write(`id: ${m.id}\nevent: ${m.event}\n${lines}\n\n`);
  }

  return missed.length;
}
```

## 2.3 在 `/stream` 里用上它

**改 `server.js` 的 `/stream`：**

```javascript
import { openStream, broadcast, clientCount, replay } from "./sse.js";

app.get("/stream", (req, res) => {
  const lastId = req.headers["last-event-id"];     // ← 浏览器自动带的

  const stream = openStream(req, res);

  if (lastId) {
    const n = replay(stream.client, lastId);
    console.log(`续传：从 #${lastId} 补发了 ${n} 条`);
  }

  broadcast("count", { n: clientCount() });

  req.on("close", () => {
    setTimeout(() => broadcast("count", { n: clientCount() }), 50);
  });
});
```

**这需要 `openStream` 把 `client` 也返回出来。** 改一下返回值：

```javascript
return {
  client,                                     // ← 加这一行
  send: (data) => sendTo(client, "message", data),
  sendEvent: (event, data) => sendTo(client, event, data),
  close: () => { cleanup(); res.end(); },
};
```

## 2.4 验证续传（这是今天最值钱的验证）

**① 打开页面，等进度跑到 40% 左右。**

**② 直接杀掉服务（`Ctrl+C`）。**

**此时进度条停在 40%，不再变化。**

**③ 等 10 秒，再 `node server.js` 起来。**

**④ 看服务端日志：**

```text
续传：从 #12 补发了 5 条
```

**⑤ 看页面：进度条应该从 40% 直接跳到断线期间的最新值，中间不丢。**

**没有这个日志，说明两种情况之一：**

```text
① 浏览器没带 Last-Event-ID 头（检查你的消息里有没有 id:）
② 你的 HISTORY 是空的（新进程启动，内存缓冲清空了）
```

## 2.5 一个必须承认的限制

```text
服务端重启 → 内存里的 history 没了 → 补发不出来
```

**所以进度类的续传，真正的数据源不该是内存，而是数据库：**

```javascript
// 更靠谱的续传：从数据库读"这个任务当前的状态"
if (lastId) {
  const job = db.prepare("SELECT progress, status FROM jobs WHERE id = ?").get(jobId);
  stream.sendEvent("progress", { progress: job.progress, status: job.status });
}
```

**这才是第 117 节要用的方式：**

```text
消息流负责"变化通知"，数据库负责"当前真值"。
重连之后先读一次真值，再接着收通知。
```

**记住这个分工。** 它比"补齐所有丢失的消息"简单一万倍，而且永远不会错。

---

# 第 3 步：`EventSource` 的两个死穴（25 分钟）

## 3.1 死穴一：不能加请求头

```javascript
// 做不到
new EventSource("/stream", { headers: { Authorization: "Bearer xxx" } });
```

**`EventSource` 不支持自定义请求头。** 所以：

```text
要带 token 鉴权 → 只能塞进 URL ?token=xxx（会出现在日志里，不理想）
要 POST 传参数 → 做不到，只能 GET
```

## 3.2 死穴二：只能 GET

**要传复杂参数（一个大的 JSON）就没法用。**

## 3.3 解法：用 `fetch` 自己读流

**现代浏览器支持流式读取响应体：**

```javascript
// 手写 SSE 客户端：能用 POST、能加请求头
async function connectStream() {
  const res = await fetch("/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobId }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 消息以空行分隔
    const parts = buffer.split("\n\n");
    buffer = parts.pop();            // 最后一段可能不完整，留着

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += (data ? "\n" : "") + line.slice(6);
      }

      if (data) handle(event, data);
    }
  }
}
```

**代价：重连要自己写。** 这就是为什么"能用 `EventSource` 就用它"——

| | `EventSource` | `fetch` 手写 |
|---|---|---|
| 自动重连 | **有** | 没有，自己写 |
| 自定义头 | 不行 | 可以 |
| POST | 不行 | 可以 |
| 代码量 | 3 行 | 40 行 + 重连逻辑 |

**判断：** 需要鉴权头 → 手写；只要能 GET → 用 `EventSource`。

## 3.4 手写重连的三个必须

**如果你选了手写，这三点一个都不能少：**

```javascript
let retry = 1000;

async function connect() {
  try {
    await connectStream();
    retry = 1000;                  // ① 成功了要把退避重置
  } catch (err) {
    console.warn("断开，重连中…", err.message);

    // ② 指数退避 + 上限
    await new Promise((r) => setTimeout(r, retry));
    retry = Math.min(retry * 2, 30_000);

    // ③ 必须真的再调一次，否则就永远停了
    connect();
  }
}
```

**最常犯的错：`catch` 里忘了再调 `connect()`。** 结果断开一次就永远不连了，页面看起来"死"了。

---

# 第 4 步：让用户知道断过（20 分钟）

## 4.1 一个必须有的界面状态

```text
连接中…  →  已连接  →  连接断开，正在重连（第 3 次）  →  已连接
```

**为什么必须有：**

```text
用户看到"已连接"但数据不动 → 骂你的产品坏了
用户看到"正在重连" → 他会等，甚至会说"这功能挺稳的"
```

**同样的故障，两种观感。差别就在有没有这个提示。**

## 4.2 改页面

```javascript
let attempts = 0;
const state = document.getElementById("state");

es.onopen = () => {
  attempts = 0;
  state.textContent = "已连接";
  state.style.color = "green";
};

es.onerror = () => {
  attempts += 1;
  state.textContent = `连接断开，正在重连（第 ${attempts} 次）`;
  state.style.color = "orange";
};
```

**注意 `onopen` 里要 `attempts = 0`。** 否则重连成功之后，下次断开显示"第 7 次"，用户以为一直没连上。

## 4.3 页面切回来时要主动查一次

**手机锁屏 10 分钟，回来时连接可能还没恢复。** 别干等：

```javascript
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    // 立刻从数据库拉一次真值，别等流
    refreshFromApi();
    // 如果连接已经死了，重建（EventSource 一般自己会重连，这里兜底）
    if (es.readyState === EventSource.CLOSED) {
      location.reload();
    }
  }
});
```

**`es.readyState` 三个值：**

```text
0 = CONNECTING  正在连
1 = OPEN        已连上
2 = CLOSED      已关闭（不会自己重连了）
```

---

# 第 5 步：故意犯四个错（20 分钟）

## 错误 1：重连后从头推一遍

把 `replay` 的逻辑改成"从第一条开始推"：

```javascript
const missed = history;      // 不看 lastEventId
```

**现象：** 每次重连，页面上的日志突然多出 200 条重复。

**真实后果：** 如果这些消息代表"订单已处理"，你会处理两遍。

## 错误 2：`retry` 设成 100 毫秒

```javascript
res.write("retry: 100\n\n");
```

**现象：** 服务重启的时候，Network 里每 100 毫秒一个请求。**你的服务刚起来就被打满，起不来。**

**这就是"重连风暴"。** 所以默认 3 秒是有道理的。

## 错误 3：`catch` 里忘了重连

用手写 `fetch` 版本，把 `catch` 里的 `connect()` 删掉。

**现象：** 断一次之后永远不动，页面还显示"已连接"。

## 错误 4：不提示用户

把 `onerror` 里的状态提示删掉。

**现象：** 断开时页面完全没变化，数据静止。**用户以为你的进度条卡了，其实是他自己的网断了。**

---

# 第 6 步：写学习笔记（10 分钟）

---

# 第 7 步：课后练习

## 练习一：断网实验（15 分钟）

**这是今天的必做验证，别跳。**

```text
① 打开页面，进度跑到 30%
② 把电脑的 Wi-Fi 关掉（或拔网线）
③ 观察：多久之后 onerror 触发？页面显示什么？
④ 等 30 秒
⑤ 打开 Wi-Fi
⑥ 观察：多久恢复？进度有没有从 30% 继续？
```

**把四个时间点写进笔记：**

| 阶段 | 我测到的时间 |
|---|---|
| 断网 → onerror | |
| 恢复网络 → onopen | |
| 中间丢了多少条消息 | |
| 有没有续传成功 | |

## 练习二：实现"断线兜底查询"（20 分钟）

按第 2.5 节的思路改：

```text
连接成功后，先 GET /api/jobs/:id 拿一次真值（进度、状态）
然后再开始接收流
```

**为什么要先查再听：** 因为流只保证"之后的变化"，**不保证"你断掉那段的补发"**。先拿真值，永远不会错位。

**这就是第 117 节的架构：数据库是真值，流只是通知。**

## 练习三：给客户写一段说明（10 分钟）

客户问："这个实时进度，网络不好会不会卡住？"

**用不超过五句话回答。** 必须包含：

```text
① 断了会自动重连
② 重连后会补上当前真实进度
③ 页面上能看到"正在重连"
④ 极端情况（长时间断网）会退回到"手动刷新一次"
```

---

# 第 8 步：最终验收

## A. 自动重连成立

- [ ] 杀掉服务再起来，页面不刷新也能恢复
- [ ] Console 里能看到 `onerror` → `onopen` 的过程
- [ ] 我知道默认重连间隔是 3 秒，以及怎么改

## B. 续传成立

- [ ] 消息里带 `id:`
- [ ] 重连请求头里有 `Last-Event-ID`
- [ ] 服务端日志打出"续传：从 #N 补发了 M 条"
- [ ] 页面没有出现重复消息

## C. 知道两个死穴

- [ ] 我知道 `EventSource` 不能加请求头
- [ ] 我知道它只能 GET
- [ ] 我会用手写 `fetch` 读流，并且写出了重连逻辑

## D. 用户看得见状态

- [ ] 断开时显示"正在重连（第 N 次）"
- [ ] 重连成功后次数归零
- [ ] 切回页面时会主动查一次真值

## E. 断网实验做过

- [ ] 我关过 Wi-Fi，看到了完整过程
- [ ] 四个时间点记进笔记了
- [ ] 我知道丢的消息是怎么补上的（或为什么不需要补）

## F. 四个错都踩过

- [ ] 见过从头重推导致的重复
- [ ] 见过 `retry: 100` 的重连风暴
- [ ] 见过忘了重连导致永久停止
- [ ] 见过不提示导致用户误判

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] "数据库是真值，流是通知"这句话我用自己的话写过
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **流只负责"通知你变了"，不负责"把历史都告诉你"。**
> **真值永远在数据库，重连之后先查一次真值 —— 这一条能省掉 90% 的续传麻烦。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 断开后不自动重连 | 调了 `es.close()`，或返回 204 | 检查代码；204 表示"别再连了" |
| 重连后进度从 0 开始 | 服务端每条连接都从头推 | 用 `Last-Event-ID` + 回放 |
| 重连后消息重复 | 回放范围算错 | `m.id > lastEventId`，不是 `>=` |
| 服务端日志没有续传 | 消息里没带 `id:` | `id: ${seq++}` 必须有 |
| 服务重启后补不出来 | 历史在内存里，进程重启就没了 | 改成"重连后查数据库真值" |
| 每 100ms 重连一次 | `retry` 设太小 | 3000 以上 |
| 手写 `fetch` 断一次就永久停 | `catch` 里没再调 `connect()` | 补上，并重置退避 |
| 页面显示"已连接"但不动 | 状态提示没更新 | `onerror` 里必须改状态 |
