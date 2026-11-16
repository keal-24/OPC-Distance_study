# 第 114 节课：SSE 服务端细节——事件类型、心跳、连接管理

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课的 SSE 只能推一个数字。今天把它做成**能上线的东西**：
> 分类型推、心跳保活、管理几百条连接、知道浏览器的连接数上限。

**建议用时**：120 分钟
**你需要先完成**：第 113 节课（数字会跳，`curl -N` 能看到字节）
**今天要装**：不装新东西（`express` 上节课装过了）

---

# 第 0 步：一条消息能带四样东西（15 分钟）

## 0.1 完整格式

```text
id: 42                     ← 这条消息的编号（断线续传用，第 115 节）
event: progress            ← 事件类型（前端按类型分别处理）
retry: 3000                ← 断线后多久重连（毫秒，告诉浏览器）
data: {"p":40}             ← 数据本体（可以有多个 data: 行，会拼起来）

                           ← 空行：本条消息结束
```

**四个字段都是可选的，但 `data` 通常必须有。** 只有空行是必须的。

## 0.2 `event:` 的用法（今天的第一件事）

```text
event: progress
data: {"progress":40}

event: log
data: {"text":"开始解析第 3 页"}

event: done
data: {"ok":true}
```

**前端分别监听：**

```javascript
es.addEventListener("progress", (e) => { ... });
es.addEventListener("log", (e) => { ... });
es.addEventListener("done", (e) => { ... });
```

**注意：一旦用了 `event:`，这条消息就**不会**再触发 `onmessage`。**

**这是 SSE 最容易踩的坑：** 你加了 `event: progress`，前端还在用 `es.onmessage`，**结果什么都收不到，控制台也不报错。**

## 0.3 注释行（心跳的基础）

**以冒号开头的行是注释，浏览器会忽略：**

```text
: ping
```

**它的唯一用途：让连接"有数据流过"，防止被中间设备判定为空闲连接而掐断。**

**这是心跳的全部原理。** 没有魔法。

## 0.4 今天要做的四件事

```text
① 封装一个可复用的 SSE 工具（别再每次手写三个 header）
② 管理多条连接（一个 Set + 广播）
③ 加心跳（防代理掐连接）
④ 摸清浏览器那条"6 个连接"的硬限制
```

---

# 第 1 步：封装 SSE 工具（25 分钟）

**继续用 `sse-lab` 项目。** 新建 `sse.js`：

```javascript
// sse.js
// 一个最小的 SSE 工具：初始化、发消息、心跳、清理

const clients = new Set();
let nextId = 1;

/**
 * 把一条 HTTP 响应变成 SSE 连接
 * @returns {{ send: Function, sendEvent: Function, close: Function }}
 */
export function openStream(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // 关键：告诉 Nginx 不要缓冲（第 5 步细讲）
  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders();

  const client = { res, alive: true, joinedAt: Date.now() };
  clients.add(client);

  // 先发一条，让前端知道连上了
  sendTo(client, "ready", { id: nextId++, at: Date.now() });

  // 心跳：每 15 秒一个注释行
  const heartbeat = setInterval(() => {
    if (!client.alive) return;
    res.write(": ping\n\n");
  }, 15_000);

  const cleanup = () => {
    if (!client.alive) return;
    client.alive = false;
    clearInterval(heartbeat);
    clients.delete(client);
    console.log(`连接断开，当前在线 ${clients.size} 条`);
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);

  return {
    send: (data) => sendTo(client, "message", data),
    sendEvent: (event, data) => sendTo(client, event, data),
    close: () => {
      cleanup();
      res.end();
    },
  };
}

// 发一条带类型的消息
function sendTo(client, event, data) {
  if (!client.alive) return;

  const id = nextId++;
  const payload = typeof data === "string" ? data : JSON.stringify(data);

  // 注意：data 里如果有换行，每个换行都要单独加 data: 前缀
  const lines = payload.split("\n").map((l) => `data: ${l}`).join("\n");

  client.res.write(`id: ${id}\nevent: ${event}\n${lines}\n\n`);
}

// 广播给所有人
export function broadcast(event, data) {
  for (const client of clients) {
    sendTo(client, event, data);
  }
}

export function clientCount() {
  return clients.size;
}
```

## 1.1 三处值得停下来看的细节

**① `Cache-Control: no-cache, no-transform`**

`no-transform` 是给中间代理看的：**"别动我的响应体，不许压缩、不许转换"。** 比单纯的 `no-cache` 更硬。

**② `data` 里有换行怎么办**

```javascript
const lines = payload.split("\n").map((l) => `data: ${l}`).join("\n");
```

**SSE 规定：多行数据要写多个 `data:` 行，浏览器会自动用 `\n` 拼回来。**

**如果你直接塞一个带换行的字符串，那条消息会被截断** —— 比如 AI 输出的 Markdown 一定有换行，**不处理就会丢内容**。这是第 116 节流式输出的前置知识。

**③ 三个 `close` 事件都监听**

```javascript
req.on("close", cleanup);
res.on("close", cleanup);
res.on("error", cleanup);
```

**不同 Node 版本、不同网络状况下触发的事件不一样。** 全监听 + `alive` 标记防重复执行，**最稳。**

---

# 第 2 步：一个带类型的真实场景（25 分钟）

**改 `server.js`：把上节课的 `/tick` 换成"三个事件类型"。**

```javascript
// server.js
import express from "express";
import { openStream, broadcast, clientCount } from "./sse.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.type("html").send(`
    <h1>SSE 事件类型</h1>
    <p>在线连接数：<b id="n">-</b></p>
    <div style="display:flex;gap:24px">
      <div>
        <h3>进度</h3>
        <div class="bar" style="width:200px;height:12px;background:#eee">
          <div id="fill" style="height:100%;width:0;background:#2f7"></div>
        </div>
      </div>
      <div>
        <h3>日志</h3>
        <pre id="log" style="width:320px;height:160px;overflow:auto;background:#f6f6f6;padding:8px"></pre>
      </div>
    </div>

    <script>
      const es = new EventSource("/stream");

      es.addEventListener("ready", (e) => {
        console.log("已连接", e.data);
      });

      // 注意：用了 event: 之后，onmessage 收不到任何东西
      es.addEventListener("progress", (e) => {
        const d = JSON.parse(e.data);
        document.getElementById("fill").style.width = d.progress + "%";
      });

      es.addEventListener("log", (e) => {
        const d = JSON.parse(e.data);
        const box = document.getElementById("log");
        box.textContent += d.text + "\\n";
        box.scrollTop = box.scrollHeight;
      });

      es.addEventListener("count", (e) => {
        document.getElementById("n").textContent = JSON.parse(e.data).n;
      });

      es.onerror = () => console.warn("连接异常，浏览器会自动重连");
    </script>
  `);
});

// 建立连接
app.get("/stream", (req, res) => {
  const stream = openStream(req, res);

  // 新连接来了，广播一下人数
  broadcast("count", { n: clientCount() });

  // 连接关掉时也要广播
  req.on("close", () => {
    setTimeout(() => broadcast("count", { n: clientCount() }), 50);
  });
});

// 手动触发一次"干活"，看推送
app.post("/run", (req, res) => {
  res.json({ ok: true });

  let p = 0;
  const timer = setInterval(() => {
    p += 10;
    broadcast("progress", { progress: p });
    broadcast("log", { text: `处理到 ${p}%` });

    if (p >= 100) {
      clearInterval(timer);
      broadcast("log", { text: "完成" });
    }
  }, 400);
});

// 给心跳和人数一个查询口
app.get("/count", (req, res) => res.json({ n: clientCount() }));

app.listen(3000, () => console.log("http://localhost:3000"));
```

## 2.1 验证

**① 开两个浏览器标签访问 `http://localhost:3000`。**

**两边都应该显示"在线连接数：2"。**

**② 用 `curl` 触发一次干活：**

```bash
curl -X POST http://localhost:3000/run
```

**两个标签同时看到进度条动、日志往下滚。** 这就叫"广播"。

**③ 关掉一个标签。**

**另一个标签的数字应该变成 1。** 没变说明你的 `close` 清理没生效。

## 2.2 这一步的真正价值

```text
你第一次做到了"一个事件，推给所有在线的人"。
```

**这就是"多人协作""站内通知""看板同步"的全部底层机制。** 第 119 节只是在这个基础上加业务。

---

# 第 3 步：心跳到底在防什么（20 分钟）

## 3.1 不加心跳会怎样

**你的连接看起来是"空闲"的：**

```text
浏览器 ——连接—— Nginx ——连接—— 你的 Node
```

**中间每一层都有"空闲超时"：**

| 设备 | 默认行为 |
|---|---|
| Nginx `proxy_read_timeout` | **60 秒**没有数据 → 断开 |
| 云平台负载均衡 | 30—120 秒不等 |
| 手机运营商 NAT | 5—30 分钟回收映射 |
| 家用路由器 | 几十分钟 |

**结果：用户把页面放着不动，2 分钟后连接被 Nginx 掐了。** 你再推数据，他收不到 —— **而他的页面看起来是好的，只是永远不更新。**

**这种 bug 客户会描述成："页面放一会儿就不动了，刷新一下又好了。"**

## 3.2 心跳就是"喂一口数据"

```javascript
setInterval(() => {
  res.write(": ping\n\n");     // 注释行，浏览器忽略，但连接上"有流量"
}, 15_000);
```

**15 秒一次，比所有中间层的超时都短。** 这就够了。

## 3.3 验证心跳真的在发

```bash
curl -N http://localhost:3000/stream
```

**不发 `/run`，什么都不做，等 15 秒以上。**

**你应该看到每隔 15 秒出现一行：**

```text
: ping

```

**没有这一行，说明心跳没生效 —— 上线后一定出问题。**

## 3.4 心跳间隔怎么定

```text
太快（1 秒）  → 白占带宽，1000 个连接每秒 1000 次写入
太慢（60 秒） → 刚好和 Nginx 超时撞上，等于没加
15—25 秒      → 安全区间，用这个
```

---

# 第 4 步：浏览器那条 6 个连接的限制（25 分钟）

**这一节会让你少踩一个大坑。**

## 4.1 现象

**原版 HTTP/1.1 规定：同一域名，浏览器最多同时开 6 个连接。**

**SSE 会一直占着一个。** 所以：

```text
你的页面打开了 1 条 SSE  → 还剩 5 个给普通请求，够用
用户开了 6 个标签页 → 6 条 SSE 全部占满 → 第 7 个请求排队
```

**症状：** 用户开了很多标签页之后，**页面上的按钮点了没反应、图片加载不出来**，但你觉得代码没错。

## 4.2 亲手验证一下

**打开同一个页面 6 次（6 个标签），然后第 7 个标签打开一个普通接口，比如 `/count`。**

**在 Chrome 上你可能会看到第 7 个请求一直 `pending`（排队），直到你关掉一个标签。**

> 现代浏览器对 HTTP/1.1 的单域名并发是 6 个；HTTP/2 下这个限制消失（多路复用）。
> 所以答案很清楚：**上 HTTP/2。**

## 4.3 三种解法

| 解法 | 怎么做 | 代价 |
|---|---|---|
| **上 HTTP/2**（推荐） | 用 Caddy，或 Nginx 配 SSL + `http2` | 需要 HTTPS（第 32 周） |
| 合并连接 | 一个页面只开一条 SSE，所有事件走 `event:` 区分 | 需要设计事件协议（今天已经在做） |
| 拆分域名 | `sse.example.com` 单独一个域名 | 多一份证书和配置 |

**你现在能做的：合并连接。** 一个页面一条流，用 `event:` 分发 —— **这就是上一步为什么要按类型推。**

**上 HTTP/2 是第 32 周的事。今天只要记住这个限制存在。**

## 4.4 还有一个上限：`EventSource` 的默认重连

```text
连接断开后，浏览器默认 3 秒重连
如果你有 10 个标签页同时断网恢复 → 10 个连接同时重建 → 小高峰
```

**这不是大问题，但要知道。** 第 115 节会教你 `retry:` 字段怎么用它。

---

# 第 5 步：上线必配的 Nginx 三行（20 分钟）

**本机一切正常，一上线就"不实时"—— 99% 是这里。**

```nginx
location /stream {
    proxy_pass http://127.0.0.1:3000;

    # ① 关掉缓冲，数据来了立刻转发
    proxy_buffering off;
    proxy_cache off;

    # ② 关掉压缩（gzip 会攒数据）
    gzip off;

    # ③ 读超时拉长（否则 60 秒断你）
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    # ④ 告诉上游用 HTTP/1.1（长连接需要）
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```

**四行缺一不可：**

| 配置 | 不加会怎样 |
|---|---|
| `proxy_buffering off` | 数据被 Nginx 攒着，一次来一大批 |
| `gzip off` | 同上（压缩要凑够块才输出） |
| `proxy_read_timeout` | 60 秒准时断你，用户看到"页面放着就不动了" |
| `proxy_http_version 1.1` | 可能被降级成短连接 |

**还有一个更省事的写法**（已经在 `sse.js` 里加了）：

```javascript
res.setHeader("X-Accel-Buffering", "no");
```

**这个响应头专门给 Nginx 看，等价于对这个响应关掉缓冲。** 这样你就不用改 Nginx 配置了 —— **但 `proxy_read_timeout` 还是得改。**

## 5.1 怎么验证线上到底通不通

```bash
# 直连端口（绕过 Nginx）
curl -N http://服务器IP:3000/stream

# 走 Nginx
curl -N https://你的域名/stream
```

**两个都实时 → 没问题。**
**直连实时、走 Nginx 不实时 → 就是上面那三行没配。**

**这个"绕过一层对比"的方法，是排查线上问题的通用手法。**

---

# 第 6 步：故意犯四个错（20 分钟）

## 错误 1：用了 `event:`，前端还在 `onmessage`

把前端 `es.addEventListener("progress", ...)` 改成 `es.onmessage = ...`。

**现象：进度条永远不动，Console 里没有任何报错。**

**原因：** 带 `event:` 的消息只会触发对应的事件名，**`onmessage` 只接收"没有 event 字段"的消息。**

**记住：要么全用 `onmessage`（不带 `event:`），要么全用 `addEventListener`（带 `event:`）。**

## 错误 2：数据里有换行不处理

在 `sendTo` 里把多行处理去掉：

```javascript
client.res.write(`id: ${id}\nevent: ${event}\ndata: ${payload}\n\n`);
```

**然后推一个带换行的 Markdown：**

```bash
curl -X POST http://localhost:3000/run
```

**把 `/run` 里推的内容改成 `{ text: "第一行\n第二行" }`。**

**现象：** 前端 `JSON.parse` 报错，或者只收到"第一行"。

**因为换行把一条消息切成了两半，第二半变成了非法格式。**

## 错误 3：心跳间隔 60 秒

把心跳改成 `60_000`。

**上线后（或本地用 Nginx 反代），会看到连接刚好在 60 秒断一次。** 因为和 `proxy_read_timeout` 撞上了。

**改成 15 秒。**

## 错误 4：不清理连接集合

把 `cleanup` 里的 `clients.delete(client)` 删掉。

**现象：** 关掉所有标签页，`/count` 仍然返回 5、10、20（越来越多）。

**然后你的 `broadcast` 会往已经断掉的响应里写数据，报 `write after end` 错误。**

**真实场景：服务跑一周，`clients` 里堆了几万个死连接，广播一次卡三秒。**

---

# 第 7 步：写学习笔记（10 分钟）

---

# 第 8 步：课后练习

## 练习一：给每条连接加"最后活跃时间"（15 分钟）

在 `clients` 里记 `lastSeenAt`，每次成功 `write` 更新它。

加一个清理任务：**每 60 秒扫一次，超过 5 分钟没写成功的连接强制关掉。**

**为什么要做：** 网络断了不一定触发 `close`（比如拔网线、进程被冻结）。**服务端必须自己能判断"这条连接其实已经死了"。**

## 练习二：只推给"订阅了这个任务的人"（20 分钟）

现在 `broadcast` 给所有人。改成：

```text
连接时带参数：GET /stream?jobId=abc
只推给 jobId 匹配的连接
```

**提示：`clients` 里存 `jobId`，广播时过滤。**

**这是多租户的基础。** 第 24 周会把 `jobId` 换成 `tenantId`，逻辑一模一样。

## 练习三：写清楚你的 Nginx 配置（10 分钟）

不看课件，写出 `location /stream` 那段配置，并给每一行写一句注释。

**写不出来，说明你还没准备好上线。**

---

# 第 9 步：最终验收

## A. 工具封装好了

- [ ] `sse.js` 有 `openStream` / `broadcast` / `clientCount`
- [ ] 三行响应头 + `X-Accel-Buffering`
- [ ] 心跳 15 秒一次
- [ ] 三个 `close` 事件都监听

## B. 事件类型能用

- [ ] 页面能收到 `ready` / `progress` / `log` / `count` 四种
- [ ] 前端用 `addEventListener`，不是 `onmessage`
- [ ] 关掉一个标签，另一个标签的人数会变

## C. 广播成立

- [ ] 两个标签同时看到进度条动
- [ ] 日志两边同步滚动

## D. 心跳验证过

- [ ] `curl -N` 等 15 秒能看到 `: ping`
- [ ] 我知道它是防什么的（Nginx 60 秒超时）

## E. 知道 6 连接限制

- [ ] 我知道 HTTP/1.1 同域名最多 6 个连接
- [ ] 我知道三种解法，以及我这周用哪一种

## F. Nginx 配置能默写

- [ ] `proxy_buffering off`
- [ ] `gzip off`
- [ ] `proxy_read_timeout`
- [ ] `proxy_http_version 1.1`

## G. 四个错都踩过

- [ ] 见过 `event:` + `onmessage` 收不到数据
- [ ] 见过换行导致的消息截断
- [ ] 见过 60 秒被掐
- [ ] 见过 `clients` 不清理导致越积越多

## H. 笔记

- [ ] `NOTES.md` 填完
- [ ] 心跳、6 连接、Nginx 三块都写了
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **SSE 上线后不实时，九成不是代码问题，是中间有人替你缓冲了。**
> **心跳不是为了"保持活着"，是为了让中间每一层都看到"这条连接还有数据在流"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 加了 `event:` 就收不到 | 前端用 `onmessage` | 改 `addEventListener("progress", ...)` |
| 收到的数据被截断 | 内容里有换行没处理 | 每个换行都加 `data: ` 前缀 |
| 页面放着不动，2 分钟后不更新 | 代理空闲超时 | 心跳 15 秒 + `proxy_read_timeout` |
| 开很多标签页后页面卡住 | HTTP/1.1 同域名 6 连接上限 | 合并成一条流，或上 HTTP/2 |
| `write after end` 报错 | 往已关闭的响应写数据 | `cleanup` 里 `clients.delete`，写前判 `alive` |
| 人数不减少 | `close` 清理没生效 | 三个事件都监听 + 打日志 |
| 线上一次来一大批 | Nginx 缓冲 | `proxy_buffering off` + `X-Accel-Buffering: no` |
| `broadcast` 越来越慢 | 死连接没清理 | 加 `lastSeenAt` + 定时清理 |
