# 第 118 节课：WebSocket 双向通信

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前五节都是"服务器说、浏览器听"。今天换成**双方都能说**。
> 你会写一个最小的聊天室 —— 不是为了做聊天，是为了拿到"双向"这个能力。

**建议用时**：120 分钟
**你需要先完成**：第 113—117 节（SSE 全都会，知道它和 WebSocket 的区别）
**今天要装**：`ws`

---

# 第 0 步：什么时候真的需要双向（10 分钟）

## 0.1 三个判据

```text
① 浏览器要主动、频繁地发东西给服务器（输入中、光标位置、拖拽、游戏操作）
② 延迟要求 < 300ms
③ 一来一回的节奏由用户操作决定，不是定时
```

**满足任意两条，才上 WebSocket。** 只满足第①条但每秒才一次，SSE + POST 就够。

## 0.2 一张对比表（今天会反复用）

| | SSE | WebSocket |
|---|---|---|
| 方向 | 服务器 → 浏览器 | 双向 |
| 协议 | HTTP | 握手后升级为独立协议 |
| 浏览器 API | `EventSource`（3 行） | `WebSocket` + 自己写重连 |
| 自动重连 | **有** | **没有** |
| 断线续传 | `Last-Event-ID` | 没有，自己实现 |
| 请求头（鉴权） | 不支持 | 握手时可以用 Cookie，或首条消息带 token |
| 二进制 | 不行 | 行 |
| 穿透代理 | 好（就是 HTTP） | 差一点（有些代理会掐升级） |
| 代码量 | 少 | 多 |

**看最后两行：** SSE 代码少、穿代理稳；WebSocket 灵活，但**重连、心跳、鉴权、背压全要自己写**。

## 0.3 今天的交付

```text
一个聊天室：两个浏览器打开，互相能收到消息
带：房间、心跳、断线重连、发送队列
```

---

# 第 1 步：建项目（15 分钟）

在 `03-练习代码` 下新建 `ws-lab`：

```bash
npm init -y
npm pkg set type=module
npm install express ws
```

**关键认知：WebSocket 不是一个独立服务器，它是"挂在 HTTP 服务器上的一次升级"。**

```javascript
import http from "node:http";
import { WebSocketServer } from "ws";

const server = http.createServer(app);        // 普通 HTTP
const wss = new WebSocketServer({ server });  // 挂在同一个端口上
```

**所以你可以：8000 端口既是网页，又是 WebSocket。** 不用开两个端口。

---

# 第 2 步：最小 echo（20 分钟）

新建 `server.js`：

```javascript
// server.js
import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";

const app = express();

app.get("/", (req, res) => {
  res.type("html").send(`
    <h1>最小 WebSocket</h1>
    <input id="msg" value="你好" />
    <button id="send">发送</button>
    <pre id="log" style="background:#f6f6f6;padding:10px;height:200px;overflow:auto"></pre>

    <script>
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);

      const log = (s) => {
        const box = document.getElementById("log");
        box.textContent += s + "\\n";
        box.scrollTop = box.scrollHeight;
      };

      ws.onopen = () => log("[已连接]");
      ws.onmessage = (e) => log("[收到] " + e.data);
      ws.onclose = () => log("[已断开]");
      ws.onerror = () => log("[出错]");

      document.getElementById("send").onclick = () => {
        const text = document.getElementById("msg").value;
        ws.send(text);
        log("[发出] " + text);
      };
    </script>
  `);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (socket, req) => {
  console.log("有人连上了：", req.socket.remoteAddress);

  socket.on("message", (raw) => {
    const text = raw.toString();
    console.log("收到：", text);
    socket.send(`你说的是：${text}`);      // 原样回给他
  });

  socket.on("close", () => console.log("断开了"));
});

server.listen(3000, () => console.log("http://localhost:3000"));
```

## 2.1 验证

**打开 `http://localhost:3000`，点发送。**

**你应该看到：**

```text
[已连接]
[发出] 你好
[收到] 你说的是：你好
```

**打开 F12 → Network → WS 标签（不是 All），点开那条连接：**

```text
绿色箭头 = 你发的
红色箭头 = 服务器发的
```

**⚠️ 注意：WebSocket 的帧在 Network 的 `Messages` 标签里看，不是 `Response`。**

很多人第一次用 WebSocket 找不到"服务器发了什么"，就是因为它在另一个标签页里。

## 2.2 一个必须知道的细节

```javascript
socket.on("message", (raw) => {
  const text = raw.toString();     // raw 是 Buffer，不是字符串
});
```

**忘了 `.toString()`，你拿到的是 `<Buffer 48 65 6c>`。** 这是 WebSocket 和 SSE 最大的手感差别：**它是二进制协议，数据是 Buffer。**

---

# 第 3 步：房间与广播（30 分钟）

**现在的问题是：A 发的消息 B 收不到。** 因为 `socket.send` 只回给发送者。

## 3.1 三种广播

```javascript
// ① 回给发送者
socket.send(...)

// ② 发给所有人（包括自己）
wss.clients.forEach((c) => { if (c.readyState === 1) c.send(...) })

// ③ 发给除了自己以外的所有人
wss.clients.forEach((c) => { if (c !== socket && c.readyState === 1) c.send(...) })
```

**`readyState === 1` 就是 `OPEN`。** 不加这个判断，往已关闭的连接 `send` 会抛错。

## 3.2 加房间

**把 `server.js` 换成这个（保留页面，加房间逻辑）：**

```javascript
import { randomUUID } from "node:crypto";

// roomId -> Set<socket>
const rooms = new Map();

function join(roomId, socket) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(socket);
  socket.roomId = roomId;
}

function leave(socket) {
  const set = rooms.get(socket.roomId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) rooms.delete(socket.roomId);
}

function broadcast(roomId, payload, except) {
  const set = rooms.get(roomId);
  if (!set) return 0;

  const text = JSON.stringify(payload);
  let n = 0;

  for (const s of set) {
    if (s === except) continue;
    if (s.readyState !== 1) continue;
    s.send(text);
    n += 1;
  }
  return n;
}

wss.on("connection", (socket, req) => {
  // 房间从 URL 参数来：ws://host/?room=abc&name=张三
  const url = new URL(req.url, "http://localhost");
  const roomId = url.searchParams.get("room") ?? "lobby";
  const name = url.searchParams.get("name") ?? `访客${Math.random().toString(16).slice(2, 6)}`;

  socket.userId = randomUUID().slice(0, 8);
  socket.name = name;

  join(roomId, socket);

  console.log(`${name} 进入 ${roomId}，当前 ${rooms.get(roomId).size} 人`);

  // 告诉房间里的其他人：有人来了
  broadcast(roomId, { type: "system", text: `${name} 加入了`, at: Date.now() }, socket);

  // 告诉新来的人：现在有谁
  socket.send(JSON.stringify({
    type: "welcome",
    self: socket.userId,
    members: [...rooms.get(roomId)].map((s) => ({ id: s.userId, name: s.name })),
  }));

  socket.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "chat") {
      broadcast(roomId, {
        type: "chat",
        from: socket.name,
        fromId: socket.userId,
        text: String(msg.text ?? "").slice(0, 500),
        at: Date.now(),
      });
    }
  });

  socket.on("close", () => {
    leave(socket);
    broadcast(roomId, { type: "system", text: `${name} 离开了`, at: Date.now() });
    console.log(`${name} 离开 ${roomId}`);
  });

  socket.on("error", () => {});
});

// 给接口查一下房间人数（方便验证）
app.get("/api/rooms", (req, res) => {
  const out = {};
  for (const [id, set] of rooms) out[id] = set.size;
  res.json(out);
});
```

## 3.3 页面改成"房间聊天"

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>房间聊天</title>
  <style>
    body { font-family: system-ui, "Microsoft YaHei", sans-serif; max-width: 640px; margin: 40px auto; }
    #log { background:#f6f6f6; padding:10px; height:280px; overflow:auto; }
    .line { margin:2px 0; }
    .sys { color:#999; font-size:13px; }
    .me { color:#06c; }
  </style>
</head>
<body>
  <h1>房间聊天</h1>

  <p>
    房间：<input id="room" value="lobby" size="8" />
    名字：<input id="name" value="我" size="6" />
    <button id="join">连接</button>
    <span id="conn" style="color:#999">未连接</span>
  </p>

  <div id="log"></div>

  <p>
    <input id="msg" size="40" placeholder="说点什么" />
    <button id="send">发送</button>
  </p>

  <script>
    let ws = null;
    let myId = null;
    let retry = 1000;
    let queue = [];          // 断线期间要发的消息

    const log = (html, cls = "") => {
      const box = document.getElementById("log");
      const div = document.createElement("div");
      div.className = "line " + cls;
      div.innerHTML = html;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    };

    function connect() {
      const room = document.getElementById("room").value;
      const name = document.getElementById("name").value;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";

      ws = new WebSocket(`${proto}//${location.host}/?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`);

      ws.onopen = () => {
        retry = 1000;
        document.getElementById("conn").textContent = "已连接";
        document.getElementById("conn").style.color = "green";

        // 把断线期间攒的消息发出去
        for (const m of queue) ws.send(m);
        queue = [];
      };

      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);

        if (m.type === "welcome") {
          myId = m.self;                 // ← 服务端告诉我"我是谁"
          log(`你是 ${m.self}，房间里有 ${m.members.length} 人`, "sys");
        } else if (m.type === "system") {
          log(m.text, "sys");
        } else if (m.type === "chat") {
          log(`<b>${m.from}</b>：${escapeHtml(m.text)}`, m.fromId === myId ? "me" : "");
        }
      };

      ws.onclose = () => {
        document.getElementById("conn").textContent = `断开，${retry / 1000} 秒后重连`;
        document.getElementById("conn").style.color = "orange";
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30_000);     // 指数退避
      };

      ws.onerror = () => {};
    }

    document.getElementById("join").onclick = () => {
      if (ws) ws.close();
      document.getElementById("log").innerHTML = "";
      connect();
    };

    document.getElementById("send").onclick = () => {
      const input = document.getElementById("msg");
      const text = input.value.trim();
      if (!text) return;

      const payload = JSON.stringify({ type: "chat", text });

      if (ws && ws.readyState === 1) ws.send(payload);
      else queue.push(payload);         // 没连上就先存着

      input.value = "";
    };
  </script>
</body>
</html>
```

**注意 `welcome` 里那一行 `myId = m.self;`。** 它是"给自己说的话上色"的依据 —— 服务端告诉你"你是谁"，前端才知道哪条是自己发的。

## 3.4 验证

**① 两个浏览器窗口都打开 `http://localhost:3000`，房间都填 `lobby`，名字不同。**

**② 点"连接"。**

**两边都应该看到：**

```text
你是 xxxxxxxx，房间里有 2 人
xxx 加入了
```

**③ 在 A 里发消息。**

**B 应该立刻收到。A 自己也应该看到（`broadcast` 没排除自己）。**

**④ 查人数：**

```bash
curl http://localhost:3000/api/rooms
```

**应该返回 `{"lobby":2}`。**

**⑤ 关掉 B。**

**A 应该看到"xxx 离开了"，人数变成 1。**

---

# 第 4 步：心跳——WebSocket 的半开连接（25 分钟）

## 4.1 一个 MUST 处理的问题

**WebSocket 有个毛病：网络断了，双方都不知道。**

```text
用户进电梯 → 网络断
你的服务器：socket 还是"打开"状态，还能 send（数据进了黑洞）
用户的浏览器：也以为还连着
```

**这叫"半开连接"。** SSE 有代理超时帮你兜底，**WebSocket 没有。**

**结果：** 你的 `rooms` 里堆着几百个死连接，`broadcast` 每次都往黑洞里发。

## 4.2 解法：心跳 + 超时踢人

**`ws` 库有内置的 ping/pong：**

```javascript
const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  socket.isAlive = true;

  // 收到 pong 就标记活着
  socket.on("pong", () => { socket.isAlive = true; });
});

// 每 30 秒：没回 pong 的直接踢掉
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      console.log("踢掉一个僵尸连接");
      socket.terminate();          // 注意：terminate 不是 close
      continue;
    }

    socket.isAlive = false;
    socket.ping();                 // 发 ping，等着对面回 pong
  }
}, 30_000);

wss.on("close", () => clearInterval(heartbeat));
```

## 4.3 为什么是 `terminate()` 不是 `close()`

```text
close()      → 优雅关闭，要等对面回应。对面已经死了，就一直等
terminate()  → 直接掐断，立刻释放资源
```

**对已经死掉的连接，必须 `terminate()`。** 这是新手最容易搞错的地方。

## 4.4 验证心跳

**验证"半开连接"最好的办法：**

```text
① 两个浏览器连上
② 在 Windows 上：控制面板 → 网络连接 → 禁用网卡（或者直接拔网线/关 Wi-Fi）
③ 等 60 秒以上
④ 看服务端日志：应该打出"踢掉一个僵尸连接"
⑤ 重新连网，前端应该自己重连（因为你写了指数退避）
```

**如果没有这一步，你的服务上线后永远在"内存慢慢涨、广播越来越慢"。**

---

# 第 5 步：故意犯五个错（20 分钟）

## 错误 1：`socket.send` 不判 `readyState`

把 `broadcast` 里的 `if (s.readyState !== 1) continue;` 删掉。

**现象：** 有人刚好断开时，服务端抛 `Error: WebSocket is not open`，**可能带崩整个进程**（如果没人处理 `error` 事件）。

## 错误 2：忘了 `.toString()`

把 `raw.toString()` 改成 `raw`。

**现象：** `JSON.parse(Buffer)` 报错，或者日志里全是 `<Buffer ...>`。

## 错误 3：不做心跳

把 `heartbeat` 那段删掉。

**现象（要等才行）：** 关掉 Wi-Fi 后，服务端 `wss.clients.size` 一直不减少。**过一小时你的房间里有几十个鬼。**

## 错误 4：前端不重连

把 `ws.onclose` 里的 `setTimeout(connect, retry)` 删掉。

**现象：** 断一次就永久死。**页面还显示"已连接"。**

## 错误 5：没有发送队列

把 `queue.push(payload)` 改成直接 `alert("没连上")`。

**现象：** 用户打字打到一半网络抖了一下，**按发送没反应，内容丢了，用户骂人。**

---

# 第 6 步：写学习笔记（10 分钟）

---

# 第 7 步：课后练习

## 练习一：加"正在输入"（20 分钟）

```text
① 输入框 input 事件 → 每 300ms 最多发一次 { type: "typing" }
② 服务端广播给房间里其他人
③ 其他人显示"张三正在输入…"，2 秒没收到新 typing 就消失
```

**这题的价值：** 你第一次做"**高频、低价值、可丢**"的消息。

**你必须想清楚：** 这种消息**不需要可靠送达**，丢了就丢了。所以别给它加重试和幂等 —— 那会让系统复杂十倍。

## 练习二：算一下你的连接上限（15 分钟）

一条 WebSocket 连接在你的服务器上大概占多少内存？

**实测方法：**

```javascript
setInterval(() => {
  const mem = process.memoryUsage();
  console.log(`连接 ${wss.clients.size} 条，堆内存 ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`);
}, 10_000);
```

**开 10 个、50 个窗口，记下两组数字，算平均值。**

**然后回答：** 4G 内存的服务器，能撑多少条？（**留一半给别的东西**）

## 练习三：写清楚"为什么不用 SSE"（10 分钟）

假设客户的需求是："客服系统，客服和用户互相发消息。"

**用三段话说明：**

```text
① 这个需求为什么不能只用 SSE
② 用 SSE 的话要怎么凑（POST + SSE），代价是什么
③ 用 WebSocket 的话，你要自己多写哪些东西（列四项）
```

**这题没有标准答案，但你必须能当场跟客户讲清楚。**

---

# 第 8 步：最终验收

## A. 最小 echo 通

- [ ] 发一条收一条
- [ ] F12 → Network → WS → Messages 里能看到收发帧
- [ ] 我知道 `raw` 是 Buffer，要 `.toString()`

## B. 房间成立

- [ ] 两个窗口同房间互相能收到
- [ ] 不同房间收不到（改一个 room 参数试）
- [ ] 有人进出会广播"加入了/离开了"
- [ ] `/api/rooms` 人数正确

## C. 心跳成立

- [ ] `ping` / `pong` 逻辑写对了
- [ ] 用的是 `terminate()` 不是 `close()`
- [ ] 断网 60 秒后服务端会踢掉僵尸连接

## D. 前端健壮

- [ ] 断开后指数退避重连
- [ ] 断线期间的消息进队列，重连后发出
- [ ] 页面能看到"断开，N 秒后重连"

## E. 五个错都踩过

- [ ] 见过 `readyState` 不判导致的报错
- [ ] 见过 Buffer 没转字符串
- [ ] 见过不做心跳导致的鬼连接
- [ ] 见过不重连导致永久死
- [ ] 见过没队列导致消息丢失

## F. 概念

- [ ] 我能说清 SSE 和 WebSocket 的六条区别
- [ ] 我知道 WebSocket 没有自动重连
- [ ] 我知道"高频可丢"的消息不该加重试

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 连接内存的实测数字记了
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **WebSocket 给你双向，代价是"什么都要自己写"：重连、心跳、队列、背压。**
> **SSE 没有双向，但它把重连和续传白送给你。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 连不上，报 404 | WebSocket 路径被 Express 路由吃了 | `new WebSocketServer({ server })` 挂在 http server 上 |
| `WebSocket is not open` | 往已关闭的连接 send | `readyState === 1` 判断 |
| 收到 `<Buffer ...>` | 没 `.toString()` | `raw.toString()` |
| 断网后服务端还有连接 | 没有心跳 | 30 秒 ping + `terminate()` |
| `close()` 卡住不返回 | 对面已经死了 | 用 `terminate()` |
| 前端断一次就死 | 没写重连 | `onclose` 里 `setTimeout(connect, retry)` |
| 重连风暴 | 退避没有上限 | `retry = Math.min(retry * 2, 30000)` |
| 消息发出去没反应 | 连接还没 OPEN | 加发送队列，`onopen` 时补发 |
| 代理后连不上 | 中间设备不支持 upgrade | Nginx 加 `proxy_set_header Upgrade $http_upgrade;` 和 `Connection "upgrade"` |
