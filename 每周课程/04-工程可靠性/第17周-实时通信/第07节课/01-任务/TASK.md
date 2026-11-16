# 第 119 节课：实战——实时协作看板

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这一周最后一个东西：**两个人同时拖动同一块看板，互相 200 毫秒内看到。**
> 这是"实时"的极限应用场景，也是客户最容易掏钱的演示。

**建议用时**：150 分钟（可以分两次）
**你需要先完成**：第 113—118 节全部
**今天要装**：`better-sqlite3`、`ws`、`express`

---

# 第 0 步：先把需求说清楚（15 分钟）

## 0.1 四条需求

```text
① 两个人打开同一个看板，看到同样的卡片
② 一个人拖动卡片，另一个人的屏幕上 200ms 内跟着动
③ 顶栏显示"谁在线"
④ 两个人同时拖同一张卡片，不能丢数据
```

**第 ④ 条是这一节的真正难点。** 前三条是"广播"，第四条是"冲突"。

## 0.2 为什么不做"完美协同"

**你会搜到 OT、CRDT、Yjs。别碰。**

```text
那些方案解决的是"同一段文字被两个人同时改，逐字合并"。
你现在的需求是"一张卡片的坐标"，粒度粗得多。
用一把 version 就能解决，不需要算法。
```

**判断标准：冲突的粒度。**

| 粒度 | 例子 | 用什么 |
|---|---|---|
| 整条记录 | 卡片位置、订单状态 | **version 乐观锁**（今天） |
| 字段 | 一个人改标题，一个人改颜色 | 按字段合并 |
| 字符 | 同一段文字同时输入 | OT / CRDT（不做） |

**你 99% 的需求在第一行。**

## 0.3 今天的交付

```text
board-app/
├── db.js           cards 表（带 version）
├── server.js       HTTP + WebSocket + 广播 + 乐观锁
└── public/index.html  看板页面（拖拽 + 在线列表）
```

**今天不给完整代码。** 前六节你抄了上千行，这一节自己搭。

---

# 第 1 步：设计协议（25 分钟）

**先设计消息，再写代码。** 这一节的顺序不能反 —— 先写代码的人最后会边写边改协议，然后前端后端全乱。

## 1.1 一张协议表（自己抄到笔记里）

| 方向 | type | 字段 | 什么时候发 |
|---|---|---|---|
| S→C | `snapshot` | `cards[]`, `members[]`, `you` | 连上时 |
| S→C | `member_join` | `id`, `name` | 有人进来 |
| S→C | `member_leave` | `id` | 有人走了 |
| S→C | `card_moved` | `id`, `x`, `y`, `version`, `by` | 有人成功移动了卡片 |
| S→C | `card_rejected` | `id`, `reason`, `current` | 你的移动被拒（版本冲突） |
| C→S | `move` | `id`, `x`, `y`, `version` | 拖动结束时（或节流中） |

**注意两件事：**

```text
① 客户端发的 move 里带 version —— 这是"我以为的当前版本"
② 服务端拒绝时回 card_rejected + current（当前真值），让前端能自愈
```

**没有第 ② 条，前端只能干瞪眼。**

## 1.2 为什么用"卡片"而不是"任务列表"

**坐标是最好演示的冲突场景：** 两个人往不同方向拖，最后一个赢，输的那个看到卡片"弹回去"。

**换成文字你就看不出冲突了。**

---

# 第 2 步：数据表（20 分钟）

**你要建的表（自己写 `db.js`）：**

```text
cards
  id        TEXT PRIMARY KEY
  board     TEXT NOT NULL              -- 哪个看板
  title     TEXT NOT NULL
  x         INTEGER NOT NULL
  y         INTEGER NOT NULL
  version   INTEGER NOT NULL DEFAULT 1 -- 每次修改 +1
  updated_at INTEGER NOT NULL
  updated_by TEXT
```

**三个必须有的索引/约束：**

```sql
CREATE INDEX IF NOT EXISTS idx_cards_board ON cards (board);
```

## 2.1 `version` 是怎么用的

```text
读：拿到 version = 3
改：UPDATE cards SET x=?, y=?, version=version+1 WHERE id=? AND version=3
                                      ↑ 这个条件就是乐观锁
结果：changes = 1 → 我赢了，广播
      changes = 0 → 别人先改了，我输了，回滚
```

**和第 110 节定时任务的乐观锁是同一条 SQL 思路。** 那节课你抄过，今天自己写。

## 2.2 检查点 ①

```bash
node -e "import('./db.js').then(({default: db}) => { console.log(db.prepare(\"select name from sqlite_master where type='table'\").all()); console.log(db.prepare('pragma journal_mode').get()); })"
```

**要有 `cards` 表和 `wal`。**

**再塞 3 张卡片进去**（写个 `seed.js`），坐标随便：

```text
卡片A (100, 100) / 卡片B (300, 100) / 卡片C (500, 100)
```

---

# 第 3 步：服务端（40 分钟）

## 3.1 骨架

```javascript
// server.js
import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import db from "./db.js";

const app = express();
app.use(express.static("public"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// boardId -> Set<socket>
const boards = new Map();
```

**`boards` 的结构和第 117 节的 `watchers`、第 118 节的 `rooms` 是同一个模式。** 你已经写过三次了，这次应该不看课件就能写出来。

## 3.2 连上要做三件事

```text
① 从 URL 拿 board 和 name
② 加入 boards
③ 发 snapshot（所有卡片 + 在线成员 + 自己的 id）
④ 广播 member_join 给其他人
```

**`snapshot` 里必须有 `you`（自己的 id）。** 前端要靠它区分"是我拖的"和"是别人拖的"。

## 3.3 处理 `move`（今天唯一有难度的部分）

**照这个顺序写，别自己发明：**

```javascript
socket.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type !== "move") return;

  const { id, x, y, version } = msg;

  // ① 校验：坐标必须是数字，且在合理范围内
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x < 0 || y < 0 || x > 5000 || y > 5000) return;

  // ② 乐观锁更新
  const info = db.prepare(`
    UPDATE cards
    SET x = ?, y = ?, version = version + 1, updated_at = ?, updated_by = ?
    WHERE id = ? AND board = ? AND version = ?
  `).run(x, y, Date.now(), socket.userId, id, socket.board, version);

  // ③ 赢了：广播给所有人（包括自己，让前端对齐）
  if (info.changes === 1) {
    const row = db.prepare("SELECT id, x, y, version FROM cards WHERE id = ?").get(id);
    broadcast(socket.board, { type: "card_moved", ...row, by: socket.userId });
  } else {
    // ④ 输了：把当前真值回给他，让他自己回滚
    const current = db.prepare("SELECT id, x, y, version FROM cards WHERE id = ?").get(id);
    socket.send(JSON.stringify({
      type: "card_rejected",
      id,
      reason: "这张卡片已经被别人改过",
      current,
    }));
  }
});
```

**四个细节：**

| 细节 | 为什么 |
|---|---|
| `Number.isFinite(x)` | 防止前端传 `NaN` / 字符串，写进数据库变成怪值 |
| 范围校验 | 防止有人把卡片拖到 999999，别人的页面直接空白 |
| `board = ?` | **防越权**。不加这个条件，A 能改 B 看板的卡片 |
| 失败时回 `current` | 前端才能"弹回去"，而不是卡在一个错误位置 |

**第三条是要命的那条。** 所有带 `id` 的 UPDATE 都必须带上"它属于谁"的条件。

## 3.4 广播函数

```javascript
function broadcast(board, payload, except) {
  const set = boards.get(board);
  if (!set) return;

  const text = JSON.stringify(payload);
  for (const s of set) {
    if (s === except) continue;
    if (s.readyState !== 1) continue;
    s.send(text);
  }
}
```

**注意这次是"包括自己"**（`except` 不传）—— 因为服务端可能修正了坐标，**前端要以服务端为准。**

## 3.5 心跳与清理

**照第 118 节抄：**

```text
30 秒 ping 一次，没回 pong 的 terminate()
close 时从 boards 里删掉，广播 member_leave
```

## 3.6 检查点 ②

**先用 `wscat` 或者浏览器控制台手测，别急着写页面：**

```javascript
// 浏览器控制台
const ws = new WebSocket("ws://localhost:3000/?board=b1&name=测试");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.onopen = () => ws.send(JSON.stringify({ type: "move", id: "卡片A的id", x: 200, y: 200, version: 1 }));
```

**你必须看到：**

```text
{ type: "snapshot", cards: [...], members: [...], you: "xxxx" }
{ type: "card_moved", id: "...", x: 200, y: 200, version: 2, by: "xxxx" }
```

**再用错 version 发一次，必须收到 `card_rejected`。**

**两个都对，才进下一步。**

---

# 第 4 步：前端（45 分钟）

## 4.1 拖拽要自己做（不用库）

**原生拖拽 API（`draggable`）够用，而且能控制"什么时候发消息"。**

```javascript
card.addEventListener("pointerdown", (e) => {
  card.setPointerCapture(e.pointerId);
  dragging = { el: card, dx: e.offsetX, dy: e.offsetY };
});

card.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  // ① 本地立刻动（乐观更新）
  const x = e.clientX - dragging.dx;
  const y = e.clientY - dragging.dy;
  card.style.transform = `translate(${x}px, ${y}px)`;

  // ② 节流发消息（关键）
  throttledSend(card.dataset.id, x, y);
});

card.addEventListener("pointerup", () => {
  dragging = null;
  flushSend();     // 松手时补发最后一次
});
```

## 4.2 节流：这是 200ms 的保证

```javascript
// 每 50ms 最多发一次
let pending = null;
let lastSentAt = 0;

function throttledSend(id, x, y) {
  pending = { id, x, y };

  const now = Date.now();
  if (now - lastSentAt < 50) return;

  lastSentAt = now;
  sendMove(pending);
  pending = null;
}

function flushSend() {
  if (pending) {
    sendMove(pending);
    pending = null;
  }
}
```

**为什么必须节流：**

```text
pointermove 在拖动时每秒能触发 60—120 次。
不节流 = 每秒 120 条 WebSocket 消息 × 每个在线的人
        = 你的服务器每秒广播几千条
```

**50ms 节流 = 每秒 20 次。** 视觉上完全够（人眼看不出 50ms 和 16ms 的差别），**服务器压力降 5 倍。**

## 4.3 收到 `card_moved` 时

```javascript
if (m.type === "card_moved") {
  const el = document.querySelector(`[data-id="${m.id}"]`);
  if (!el) return;

  // ① 自己正在拖这张卡：不要动它（会打架）
  if (dragging && dragging.el === el) {
    el.dataset.version = m.version;
    return;
  }

  // ② 别人拖的：直接跟过去
  el.style.transform = `translate(${m.x}px, ${m.y}px)`;
  el.dataset.version = m.version;
}
```

**`dataset.version` 必须更新。** 你下次拖动时要用它做乐观锁，**用旧版本一定被拒。**

## 4.4 收到 `card_rejected` 时（第四条需求）

```javascript
if (m.type === "card_rejected") {
  const el = document.querySelector(`[data-id="${m.id}"]`);
  if (!el) return;

  // ① 弹回服务端的真值
  el.style.transform = `translate(${m.current.x}px, ${m.current.y}px)`;
  el.dataset.version = m.current.version;

  // ② 告诉用户发生了什么（必须，否则他以为卡了）
  toast("这张卡片刚才被别人动过，位置已同步");
}
```

**没有第 ② 步，用户会以为"我的拖动失效了"。**

**一句 toast，决定用户觉得"这功能真稳"还是"这破系统"。**

## 4.5 在线列表

```javascript
function renderMembers(members) {
  document.getElementById("members").innerHTML =
    members.map((m) => `<span class="chip">${escapeHtml(m.name)}</span>`).join("");
}
```

**处理三种消息：**

```text
snapshot     → 整体渲染
member_join  → 加一个
member_leave → 删一个
```

## 4.6 检查点 ③

**两个窗口打开同一个 board，拖动卡片。**

**你要亲眼确认四件事：**

```text
① 另一个窗口 200ms 内跟着动
② 松手之后，位置和服务端一致（刷新一下对比）
③ 关掉一个窗口，另一个的在线列表少一个人
④ 两个人同时拖同一张卡，输的那个看到"弹回 + 提示"
```

**第 ④ 条要练着做：** 两个窗口同时拖，**稍微错开 200ms**，就能稳定复现冲突。

---

# 第 5 步：故意犯五个错（20 分钟）

## 错误 1：不节流，每次 `pointermove` 都发

把 `throttledSend` 换成直接 `sendMove`。

**现象：** 拖动时服务端日志疯狂刷；开两个窗口就明显卡顿。

**极端情况：** 三个人同时拖，你的 Node 单线程被 JSON 序列化占满，**整个服务卡住。**

## 错误 2：`version` 不在前端更新

把 `el.dataset.version = m.version;` 删掉。

**现象：** 你第一次拖动成功，**第二次一定被拒**，然后卡片弹回原位。

**这是最像"玄学 bug"的一个。** 因为第一次好使，用户会觉得"这功能时好时坏"。

## 错误 3：`UPDATE` 不带 `board = ?`

```js
// 错
WHERE id = ? AND version = ?
```

**现象：** 单看板测不出来。**一开第二个看板，A 看板能改 B 看板的卡片。**

**这类 bug 上线后是数据事故。** 收钱的功能里绝不能有。

## 错误 4：自己不接收 `card_moved`

`broadcast(..., socket)` 把自己排除掉。

**现象：** 你拖完，服务端修正了坐标（比如超出边界被 clamp），**但你的页面还停在错误位置。** 刷新之后才对齐。

**规则：位置类状态，永远以服务端回显为准。**

## 错误 5：被拒时不提示

把 `toast(...)` 删掉。

**现象：** 用户拖过去，卡片自己跳回来，**没有任何解释。** 他会再试三次，然后说"你这系统有 bug"。

---

# 第 6 步：写学习笔记（10 分钟）

**这一节的笔记要回答五个问题，每个不超过三句话：**

```text
① 为什么这里用 version 乐观锁，而不是"后发先至"？
② 为什么必须节流？不节流的上限在哪？
③ 为什么服务端要把结果广播回给操作者自己？
④ `board = ?` 这个条件如果不加，会发生什么？
⑤ 什么时候你才需要 OT / CRDT？
```

---

# 第 7 步：课后练习

## 练习一：加"新建卡片"（20 分钟）

```text
① 页面一个"+"按钮 → 本地先插入（乐观）→ 发 create
② 服务端生成 id 和 version，广播 card_created
③ 前端收到后把"临时卡片"替换成真的（用临时 id 匹配）
```

**难点：** 本地临时 id 和服务端 id 的替换。**这是所有"乐观创建"的通用问题。**

## 练习二：加"正在拖动"的视觉提示（15 分钟）

```text
① 拖动开始时发 { type: "drag_start", id }
② 服务端广播给其他人，别人给这张卡加个边框和"张三正在拖动"
③ 松手发 drag_end
④ 3 秒没收到 drag_end 自动清除（防丢消息）
```

**这题练的是"高频可丢"的消息**（第 118 节练习一同一个思路）。

## 练习三：算一下你的广播成本（10 分钟）

```text
10 个人同时在一个看板上拖卡片
每人每秒发 20 条（50ms 节流）
每条广播给 10 个人
```

**问题：**

1. 每秒多少条 WebSocket 发送？
2. 每条消息 100 字节，带宽多少？
3. 如果改成"只在松手时发一次"，数字变成多少？**用户感受会差多少？**

---

# 第 8 步：最终验收

## A. 数据层

- [ ] `cards` 表有 `version` 列
- [ ] 有 `idx_cards_board`
- [ ] `seed.js` 塞进了 3 张卡片

## B. 服务端

- [ ] 连上发 `snapshot`（含 `cards` / `members` / `you`）
- [ ] `move` 用乐观锁，`changes` 判断分支正确
- [ ] 失败时回 `card_rejected` + `current`
- [ ] `UPDATE` 带 `board = ?`
- [ ] 心跳 + `terminate()` 有
- [ ] `close` 时广播 `member_leave`

## C. 前端

- [ ] 拖动跟手，本地立即动
- [ ] 50ms 节流，`pointerup` 补发
- [ ] 收到 `card_moved` 会更新位置和 `dataset.version`
- [ ] 自己在拖的卡不被别人的消息打断
- [ ] 被拒时弹回 + toast

## D. 四条需求都成立

- [ ] 两个窗口看到同样的卡片
- [ ] 拖动 200ms 内同步
- [ ] 在线列表实时变化
- [ ] 同时拖同一张卡，输的一方有提示

## E. 五个错都踩过

- [ ] 见过不节流的刷屏
- [ ] 见过 `version` 不更新导致的"第二次必失败"
- [ ] 见过不带 `board` 的越权
- [ ] 见过不回显导致的位置不对
- [ ] 见过不提示导致的"用户觉得有 bug"

## F. 概念

- [ ] 我能说清"为什么这个场景不需要 CRDT"
- [ ] 我知道什么粒度用什么冲突方案
- [ ] 我知道"位置类状态以服务端为准"

## G. 交付

- [ ] `NOTES.md` 五个问题都答了
- [ ] 代码 commit + push
- [ ] `.gitignore` 有 `*.db` 和 `node_modules`

---

## 本节课要能说出口的一句话

> **实时协作的 90% 是广播，10% 是冲突。**
> **冲突不需要算法，需要的是一条 `WHERE version = ?` 和一个"弹回去"的提示。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 另一个窗口不同步 | 广播没发，或 `readyState` 过滤太严 | 打日志确认 `broadcast` 被调用 |
| 第一次拖成功，第二次弹回 | 前端没更新 `version` | 收到 `card_moved` 就写 `dataset.version` |
| 卡片位置来回跳 | 自己在拖时也响应了别人的消息 | `if (dragging && dragging.el === el) return;` |
| 拖动很卡 | 没节流 | 50ms 节流 + `pointerup` 补发 |
| 换看板能改别人的卡 | `UPDATE` 少了 `board = ?` | 所有写操作都要带归属条件 |
| 关掉窗口在线列表不变 | `close` 没广播，或没清理 `boards` | 两个都要做 |
| 断网后卡片卡死不恢复 | 没有心跳，也没有重连 | 第 118 节那套搬过来 |
| 坐标越界后页面空白 | 没有范围校验 | `x/y` 限制在 0—5000 |
