# 第 113 节课：四种实时方案的取舍

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天不写业务。只做一件事：**用 40 行代码让浏览器里的数字自己往上跳**。
> 看到它跳，你就明白了 SSE 的全部原理 —— 剩下的都是细节。

**建议用时**：100 分钟
**你需要先完成**：前 16 周（会写 Express、会起进程）
**今天要装**：`express`

---

# 第 0 步：先会选，再会写（20 分钟）

## 0.1 四种方案，一张表

| 方案 | 方向 | 一句话原理 | 延迟 | 服务器成本 |
|---|---|---|---|---|
| **轮询** | 浏览器问 | 每 N 秒 `fetch` 一次 | 0 — N 秒 | 随用户数线性涨 |
| **长轮询** | 浏览器问 | 请求挂着不返回，有数据才回，然后立刻再问 | 近实时 | 每个用户占一个连接 |
| **SSE** | 服务器推 | 一个 HTTP 连接不结束，往里写字符串 | 近实时 | 每个用户占一个连接 |
| **WebSocket** | 双向 | 握手升级协议，之后双方随时发 | 近实时 | 每个用户占一个连接 |

**关键区别只有两个维度：谁主动、要不要双向。**

## 0.2 怎么选（照这个顺序问）

```text
① 数据是"只有服务器说"还是"双方都要说"？
   只有服务器说 → SSE
   双方都要说   → WebSocket

② 变化频率高不高？
   每秒几十次以上（光标、游戏） → WebSocket
   每秒几次以内（进度、通知）   → SSE

③ 会不会有成千上万个只用一次的场景？
   会（比如一次页面加载推十条通知）→ 还是 SSE，因为它就是 HTTP，
   能复用你现有的鉴权、Cookie、网关、日志
```

**你上周做的任务进度，答案是 SSE。** 今天就把它的最小版本跑起来。

## 0.3 一个必须知道的事实

**SSE 不是新协议。** 它就是 HTTP 响应，只是：

```text
① Content-Type 是 text/event-stream
② 服务器一直不结束这个响应（不调用 res.end()）
③ 每写一段数据，格式是  data: 内容\n\n
```

**就这三条。** 剩下的都是坑和细节。

---

# 第 1 步：建项目（10 分钟）

在 `03-练习代码` 下新建 `sse-lab`，进去打开终端：

```bash
npm init -y
npm pkg set type=module
npm install express
```

---

# 第 2 步：最小 SSE 服务（25 分钟）

新建 `server.js`：

```javascript
// server.js
// 最小 SSE：每 1 秒推一个数字，永远不结束

import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.type("html").send(`
    <h1>最小 SSE</h1>
    <p>下面这个数字会自己往上跳：</p>
    <div id="n" style="font-size:48px;font-family:monospace">-</div>
    <p id="state" style="color:#888"></p>

    <script>
      const es = new EventSource("/tick");

      es.onopen = () => { document.getElementById("state").textContent = "已连接"; };
      es.onerror = () => { document.getElementById("state").textContent = "连接断了，正在重连…"; };

      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        document.getElementById("n").textContent = data.i;
      };
    </script>
  `);
});

app.get("/tick", (req, res) => {
  // ① 三行头，缺一不可
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // ② 立刻把头发出去，别攒着
  res.flushHeaders();

  let i = 0;

  const timer = setInterval(() => {
    i += 1;

    // ③ 格式：data: 内容 \n\n
    //    两个换行代表"这一条消息结束"
    res.write(`data: ${JSON.stringify({ i, at: Date.now() })}\n\n`);

    if (i >= 1000) i = 0;
  }, 1000);

  // ④ 客户端关掉页面时，必须清理定时器
  req.on("close", () => {
    clearInterval(timer);
    console.log("客户端断开，已清理定时器");
  });
});

app.listen(3000, () => {
  console.log("打开 http://localhost:3000");
});
```

## 2.1 逐行解释（这四段是全周的基础）

**① 三个响应头**

```text
Content-Type: text/event-stream   ← 告诉浏览器"这是事件流，别当普通响应用"
Cache-Control: no-cache           ← 别缓存
Connection: keep-alive            ← 长连接
```

**② `res.flushHeaders()`**

不加这句，Express/Node 可能把响应头攒在缓冲区里不发。**浏览器拿不到 header 就不会进入"接收流"状态，你会以为"没反应"。**

**③ `data: xxx\n\n`**

```text
data: {"i":1}          ← 这一行是数据
                       ← 空行 = 这条消息结束
```

**空行（也就是 `\n\n` 里第二个 `\n`）是分隔符。少了它，浏览器会把下一条粘在上一条后面，`JSON.parse` 直接报错。**

**④ `req.on("close")`**

**这一句最容易被漏，也最致命。** 用户关掉页面，你的 `setInterval` 还在跑 —— **一百个关掉的页面 = 一百个空转的定时器 + 一百个没释放的响应对象。** 这就是内存泄漏。

注意：Node 18+ 里 `req.on("close")` 在客户端断开时会触发；如果发现不触发，改用 `res.on("close", ...)`。

## 2.2 跑它

```bash
node server.js
```

**浏览器打开 `http://localhost:3000`。**

**你应该看到：** 数字每秒 +1，一直跳下去。

**如果它不跳，先别改代码，按 2.3 的清单查。**

## 2.3 打开 F12，看三样东西

**① Network 面板**

找到 `/tick` 这个请求：

```text
Status:  pending          ← 一直没结束，这是对的
Type:    eventsource      ← 浏览器认出来了
Size:    —                ← 流式响应没有总大小
```

**看到 `pending` 就说明成了。** 如果你看到 `200 OK` 且请求已完成，说明你的响应被 `end()` 了。

**② EventStream 标签**

点开 `/tick` 请求，右侧有 `EventStream` 标签，**能看到一条条 `data:` 记录的到达时间。**

**这是排查 SSE 最好的工具。** 每条的时间戳能告诉你"到底是没发，还是发了但被缓冲"。

**③ Console**

不应该有红色报错。如果出现 `EventSource's response has a MIME type ("application/json") that is not "text/event-stream"`，说明 `Content-Type` 没设对。

---

# 第 3 步：用 curl 看原始字节（15 分钟）

**这一步能让你彻底摆脱"猜"。**

```bash
curl -N http://localhost:3000/tick
```

**`-N` 表示关掉 curl 自己的缓冲。** 不加它，你可能要等很久才看到东西（**因为 curl 在攒**，这是 SSE 调试的经典假象）。

**你应该看到每秒多两行：**

```text
data: {"i":1,"at":1763270000000}

data: {"i":2,"at":1763270001000}

```

**注意两个细节：**

```text
① 每条 data 后面跟着一个空行
② 一直是同一个连接，没有断开重连
```

**用 `Ctrl+C` 结束。** 结束之后看服务端终端：

```text
客户端断开，已清理定时器
```

**没看到这一句，说明 `close` 监听没生效 —— 回去检查。**

---

# 第 4 步：故意犯四个错（30 分钟）

**这四个错，每一个都会让你浪费半天。现在一次踩完。**

## 错误 1：忘了两个换行

把 `res.write(\`data: ${JSON.stringify(...)}\n\n\`)` 改成 `\n`（只一个换行）。

**刷新页面 → 数字一直显示 `-`，Console 里报：**

```text
SyntaxError: Unexpected non-whitespace character after JSON at position ...
```

**原因：** 一条消息没结束，第二条直接接在后面，变成：

```text
data: {"i":1}data: {"i":2}
```

**`JSON.parse` 当然炸。** 记住：**`\n\n` 是消息边界，不是排版。**

## 错误 2：在推送后面 `res.end()`

在 `res.write(...)` 后面加一句 `res.end()`。

**现象：**

```text
数字只跳一次
Network 里请求变成 200 OK 已完成
Console 里 EventSource 每秒重连一次（浏览器会自己重连！）
服务端日志疯狂刷"客户端断开"
```

**这个现象特别有教育意义：**

```text
你 end → 浏览器认为"服务器结束了这次流"
       → EventSource 自动重连（这是它的默认行为）
       → 你又 end → 又重连 → 死循环
```

**你会看到每秒一次的重连请求。** 这也是线上"日志被刷爆"的常见原因。

## 错误 3：开了压缩

加两行（先 `npm install compression`）：

```javascript
import compression from "compression";
app.use(compression());
```

**现象：数字不跳了，或者几十秒才一次性出来一批。**

**原因：** 压缩算法要攒够一定量才输出，它不知道你在写"实时流"。

**解法：给 event-stream 跳过压缩**

```javascript
app.use(compression({
  filter: (req, res) => {
    const type = res.getHeader("Content-Type");
    if (type && String(type).includes("text/event-stream")) return false;
    return compression.filter(req, res);
  },
}));
```

**记住这条：SSE 和压缩天然冲突。** 上线后 Nginx 的 `gzip` 是同一个问题。

## 错误 4：没有 `close` 清理

把 `req.on("close", ...)` 整段删掉。

**验证方法：** 刷新页面 5 次，然后看服务端终端。

**你应该看到 5 个定时器同时在跑，每条日志出现 5 次。** 因为它们都没被清理。

**再刷新 50 次，进程开始吃内存。** 真实场景里这是"服务跑了三天就 OOM"的元凶。

---

# 第 5 步：看清"谁在缓冲"（15 分钟）

SSE 出问题，90% 是**某个环节在缓冲你的数据**。链路是这样的：

```text
你的代码 res.write()
   ↓
Node 的 socket 缓冲
   ↓
可能的 compression 中间件
   ↓
可能的反向代理（Nginx / 云平台）
   ↓
浏览器
```

**每一层都可能攒着不发。** 排查顺序：

| 层 | 怎么验证 | 怎么解决 |
|---|---|---|
| 你的代码 | `curl -N` 直连，看有没有实时 | 有 → 问题不在你 |
| Node 缓冲 | 加 `res.flushHeaders()` | 见第 2 步 |
| 压缩中间件 | 临时注释 `app.use(compression())` | 排除 event-stream |
| Nginx | 直连端口（绕过 Nginx）对比 | `proxy_buffering off;` `gzip off;` |
| 浏览器 | 换成 `curl -N` 对比 | 浏览器一般没问题 |

**核心方法：** 一层一层绕过，**哪一层绕过去就正常了，问题就在那一层。**

---

# 第 6 步：写学习笔记（10 分钟）

---

# 第 7 步：课后练习

## 练习一：换成"变化才推"（15 分钟）

现在是无脑每秒推一次。改成：**每秒检查一次数据有没有变，变了才推。**

```javascript
let last = null;

setInterval(() => {
  const now = JSON.stringify({ i: getCounter() });
  if (now === last) return;      // 没变，什么都不发
  last = now;
  res.write(`data: ${now}\n\n`);
}, 1000);
```

**为什么要做：** 这就是"推送省流量"的本质 —— **不是推得快，是没变就不推。**

**进阶思考：** 如果 1000 个连接都在查同一个数据，你还应该每秒查 1000 次吗？（答案：查一次，推给 1000 个连接。第 117 节会用到这个思路。）

## 练习二：给客户解释清楚（10 分钟）

客户说："我要页面上数据一变就刷新，别让我手动点。"

**用不超过五句话，说明你选哪个方案、为什么、以及它有什么代价。**

（提示：代价包括连接数上限、手机切后台会断开、代理服务器可能超时。）

## 练习三：判断四个需求（10 分钟）

```text
A. 客服系统里，用户等待时显示"客服正在输入…"
B. 每天 9 点的报表生成进度
C. 两个人同时编辑同一份文档，看到对方的光标
D. 订单状态变了要通知用户（他可能开着页面，也可能关了）
```

**答案：**

```text
A → SSE（单向，低频）
B → SSE（单向，低频，正是上周那个场景）
C → WebSocket（双向，高频，几十毫秒级）
D → 页面开着用 SSE；关着必须靠短信/微信/邮件（第 23 周）
```

**最后一条最容易漏：** 用户关了页面，SSE 连接就断了。**"推送"永远需要一条"离线兜底"通道。**

---

# 第 8 步：最终验收

## A. 最小 SSE 跑通

- [ ] 浏览器打开，数字每秒 +1
- [ ] Network 里 `/tick` 是 `pending` 状态
- [ ] EventStream 标签里能看到一条条消息
- [ ] `curl -N` 能看到原始字节，`data:` 之间有空白行

## B. 清理正确

- [ ] 关掉页面，服务端打出"客户端断开，已清理定时器"
- [ ] 刷新 5 次，日志里不会出现 5 份重复输出

## C. 四个错都踩过

- [ ] 见过少一个 `\n` 导致的 `JSON.parse` 报错
- [ ] 见过 `res.end()` 导致的每秒重连
- [ ] 见过压缩导致的"不实时"
- [ ] 见过不清理导致的定时器堆积

## D. 会选方案

- [ ] 我能对练习三的四个需求给出方案和理由
- [ ] 我知道 SSE 的本质就是"不结束的 HTTP 响应"
- [ ] 我知道什么情况下必须用 WebSocket

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 四个错的现象我记下来了
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **SSE 不是新协议，是一个"永远不结束的 HTTP 响应"。**
> **你只是往这个响应里一直写字符串，浏览器一直读。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 页面完全没反应 | 没有 `flushHeaders()`，或 `Content-Type` 写错 | 检查三行头 + `flushHeaders` |
| 数字显示 `-`，Console 报 JSON 错 | 少了第二个 `\n` | `data: xxx\n\n` |
| 每秒重连一次 | 服务端 `res.end()` 了 | 删掉 `end()` |
| 数据一次来一大批 | 压缩中间件或代理在缓冲 | 排除 event-stream，关 Nginx 缓冲 |
| `curl` 看不到实时输出 | 没加 `-N` | `curl -N` |
| 内存一直涨 | 没在 `close` 里清理定时器 | `req.on("close", ...)` 或 `res.on("close", ...)` |
| Network 里显示 `200 OK` 已完成 | 响应被结束了 | 同上，别 `end()` |
| 手机锁屏后就不推了 | 系统休眠断网 | 重连机制（第 115 节） |
