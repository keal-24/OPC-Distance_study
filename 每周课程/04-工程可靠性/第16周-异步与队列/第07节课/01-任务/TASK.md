# 第 112 节课：实战——把长文生成做成完整的异步系统

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前六节是拆开练的零件。今天**从零装一台完整的机器**，并且压测它。
> **今天不再给完整代码。** 六节课你抄过 800 行，该自己写一遍了。

**建议用时**：150 分钟（可以分两次做完）
**你需要先完成**：第 106—111 节全部
**今天不装新东西**

---

# 第 0 步：今天的规则（5 分钟）

## 0.1 三条规矩

```text
① 新建项目 summary-app，不许复制 job-queue 的文件夹
   可以回头看 job-queue 的代码，但要一个文件一个文件重新敲
② 顺序固定：db → worker → api → 页面 → 压测
   顺序错了，你会同时面对三个 bug
③ 每个检查点必须亲手验证过再往下走
   跳一个检查点，最后一定在这里卡住
```

## 0.2 为什么必须重写一遍

```text
抄代码 = 手在动，脑子没动。
重写一遍 = 你要自己决定"这个字段放哪、这个状态下该干什么"。
```

**这一节唯一的目的：让你在没有课件的情况下，能搭出这个东西。**

## 0.3 最终形态

```text
浏览器 ──POST /api/jobs──▶ API 进程 ──INSERT──▶ jobs.db
   ▲                                              │
   │                                              │
   └──GET /api/jobs/:id（1.5 秒一次）──◀──────────┤
                                                  │
                      worker-1 ──claim───────────┤
                      worker-2 ──claim───────────┘
```

**三个角色，一个数据库，零外挂。** 就这一张图，今天要把它跑起来、压明白。

---

# 第 1 步：搭骨架（20 分钟）

## 1.1 创建项目

```bash
mkdir summary-app
cd summary-app
npm init -y
npm pkg set type=module
npm install better-sqlite3 express
```

`.gitignore`：

```text
node_modules/
*.db
*.db-wal
*.db-shm
```

## 1.2 要写的五个文件

```text
summary-app/
├── db.js          表结构 + 连接
├── worker.js      领取、执行、重试、幂等
├── api.js         收任务 + 查任务
├── public/
│   └── index.html 提交 + 轮询
└── load-test.js   压测（第 5 步才写）
```

**先写 `db.js`，其他都别动。**

---

# 第 2 步：`db.js`（25 分钟）

## 2.1 你要建的表

**不看课件，自己回答这五个问题再动手：**

```text
① 一个任务需要哪 15 个字段？（第 108 节的表）
② 哪个字段决定"现在能不能跑"？
③ 哪个字段是"重试上限"的依据？
④ 防止同一个业务时刻重复投递，靠哪个字段？
⑤ 防止重复产生副作用，靠哪张表、哪个约束？
```

**答不出来就回去翻第 108、109、110 节的笔记。** 翻笔记是允许的，**照抄代码不允许。**

## 2.2 检查点 ①

写完后跑：

```bash
node -e "import('./db.js').then(({default: db}) => { console.log(db.prepare(\"select name from sqlite_master where type='table'\").all()); console.log(db.prepare('pragma journal_mode').get()); })"
```

**必须看到：**

```text
[ { name: 'jobs' }, { name: 'sends' } ]
{ journal_mode: 'wal' }
```

**少一个表、或者不是 `wal`，停下来解决。** 带着错表往下写，后面每一步都在补漏洞。

---

# 第 3 步：`worker.js`（40 分钟）

## 3.1 必须有的六件事

```text
① 原子认领（一条 UPDATE ... RETURNING）
② 进度上报（只增不减）
③ 成功：status='done' + progress=100 一次写完
④ 可重试失败：退回 pending，next_run_at 往后推 + 抖动
⑤ 永久失败 / 超上限：dead
⑥ 幂等：副作用写 sends 表，靠 UNIQUE 约束
```

## 3.2 业务逻辑（这次不是假 sleep）

**"长文生成"要真的分段处理，这样才能产生进度：**

```javascript
// 把文本按段落切成 4 段，每段"处理"1.5 秒，产出每段的摘要
function splitIntoParts(text, n = 4) {
  // 你的实现：按句号或空格切，均分成 n 段
  // 长度不够就少切几段，但至少 1 段
}
```

**每处理完一段：**

```text
progress = 该段的百分比
step = `已完成第 ${i}/${n} 段`
```

**最后把 n 段摘要拼起来，写入 `result`。**

## 3.3 检查点 ②

**先别写 API。** 用手工投递验证 worker：

```bash
node -e "
import('./db.js').then(({default: db}) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(\`INSERT INTO jobs (id, type, payload, status, attempts, max_attempts, progress, created_at, next_run_at)
              VALUES (?, 'summarize', ?, 'pending', 0, 3, 0, ?, ?)\`)
    .run(id, JSON.stringify({ text: '这是一段测试文本，用来验证 worker 是否能正常工作。' }), now, now);
  console.log('投递：', id);
});
"
```

**然后 `node worker.js`，盯着它把进度跑完。**

**必须看到：**

```text
领到 xxx，第 1/3 次
进度 25% / 50% / 75% / 100%
完成
```

**再查一次表，`status = done`、`attempts = 1`。**

## 3.4 检查点 ③（最容易漏的一个）

**再跑一次同一个任务，看幂等。**

```bash
node -e "import('./db.js').then(({default: db}) => { db.prepare(\"UPDATE jobs SET status='pending', next_run_at=? WHERE status='done' LIMIT 1\").run(Date.now()); console.log('已改回 pending'); })"
```

**重启 worker，看日志。**

**必须有"副作用已存在，跳过"这一句，而且 `sends` 表里没有新增行。**

**没有这一句，说明你的幂等没写。** 现在补，别等到第 5 步压测时才发现。

---

# 第 4 步：`api.js` + 页面（35 分钟）

## 4.1 API 只要三个路由

```text
POST /api/jobs          提交，返回 202 + jobId
GET  /api/jobs/:id      查询，返回精简字段 + elapsedSec
GET  /api/jobs          列表（可选，20 条最新，方便你自己排查）
```

**注意第 111 节讲过的四个细节：**

```text
① SELECT 只选需要的列
② result 要 JSON.parse
③ 时间差服务器算
④ canRetry 服务器给
```

## 4.2 页面

**可以复制你自己第 111 节写的 `index.html`**（那是你写的，不算抄课件）。

**但要加两个东西：**

```text
① 显示"第 N/3 次尝试"（重试时要让用户知道在重试，不是卡住了）
② 死信时给一个"重新提交"按钮
```

## 4.3 检查点 ④

**开三个终端：`api.js` / `worker.js` / 浏览器。**

**走一遍完整流程，并且在这四处停下来确认：**

```text
① 提交后 1 秒内出现"排队中"
② 进度到 50% 时按 F5，进度不丢
③ 完成后页面显示摘要，Network 里请求停止
④ 提交一个 3 个字的文本 → 立刻变"已放弃"（永久错误）
```

**四条全过，才算这一步完成。**

---

# 第 5 步：压测（30 分钟）

## 5.1 写 `load-test.js`

```javascript
// load-test.js
// 同时投 10 个任务，看两个 worker 怎么分活

const N = Number(process.argv[2] ?? 10);

const text = "这是一段用于压测的文本，长度足够触发分段处理逻辑，我们用它观察进度和并发行为。";

async function main() {
  const start = Date.now();
  const ids = [];

  for (let i = 0; i < N; i++) {
    const res = await fetch("http://localhost:3002/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${text}（第 ${i + 1} 个）` }),
    });
    const data = await res.json();
    ids.push(data.jobId);
  }

  console.log(`已投 ${N} 个，耗时 ${Date.now() - start} 毫秒`);

  // 盯着直到全部结束
  const t0 = Date.now();
  while (true) {
    const rows = await Promise.all(
      ids.map((id) => fetch(`http://localhost:3002/api/jobs/${id}`).then((r) => r.json())),
    );

    const states = rows.map((r) => r.job.status);
    const done = states.filter((s) => s === "done").length;
    const dead = states.filter((s) => s === "dead").length;

    console.log(
      `${Math.round((Date.now() - t0) / 1000)}s  完成 ${done}/${N}  放弃 ${dead}  ` +
      `进度：[${rows.map((r) => String(r.job.progress).padStart(3)).join(" ")}]`,
    );

    if (done + dead === N) break;

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`全部结束，总耗时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
}

main();
```

## 5.2 第一轮：一个 worker

```bash
node load-test.js 10
```

**记下总耗时。**

**再看 worker 的日志：10 个任务是不是一个一个串行跑的？**

## 5.3 第二轮：两个 worker

**开两个终端跑 `node worker.js`，再 `node load-test.js 10`。**

**你应该看到：**

```text
总耗时比第一轮少了一半左右
进度数组里有两组数字在同时往前走
```

**如果两个 worker 各跑各的、总耗时没变快，检查：**

```text
① 两次启动的 workerId 是不是一样（一样就是在跑同一个进程）
② 认领 SQL 是不是一次只返回一行（RETURNING 写了没）
③ 你的任务是不是本身就有全局锁（比如都写同一行）
```

## 5.4 第三轮：中途杀掉一个 worker（必做）

**跑到一半，直接关掉其中一个 worker 的终端（Ctrl+C 或直接关窗口）。**

**观察三件事：**

```text
① 那个 worker 手上的任务，状态是不是停在 running？
② 另一个 worker 会接手吗？（不会，因为 status != 'pending'）
③ 要等多久才会被回收？（你写的阈值是多少？）
```

**然后验证回收：**

```bash
node -e "import('./db.js').then(({default: db}) => console.table(db.prepare(\"select status, count(*) n from jobs group by status\").all()))"
```

**等过回收阈值（第 108 节教你的是 5 分钟，测试时可以临时改成 10 秒），再看一次。**

**你应该看到那个任务被重新执行，最终 `done`。**

## 5.5 第四轮：压一个"故意全失败"的场景

**把 worker 的业务逻辑临时改成必定抛错**（保留 `retryable: true`），投 3 个任务。

**你应该看到：每个任务重试 3 次 → 全部进 `dead`。**

**再查一次 `sends` 表：一条都没有。** 因为活从来没干成过。

**这一轮的意义：** 你确认了"失败的任务不会污染副作用表"。

---

# 第 6 步：把这一周的结论写下来（15 分钟）

**在 `NOTES.md` 里回答这五个问题，每个答案不超过三句话：**

```text
① 为什么长任务不能写在接口里？如果只有 2 秒的任务呢？
② 队列让什么变快了？让什么没有变快？
③ 如果没有唯一索引，重试会导致什么？
④ 两个 worker 为什么不会抢同一个任务？
⑤ 这一周你做的东西，什么时候会不够用？不够用了换什么？
```

**写不出来，说明这周只是敲了代码。**

---

# 第 7 步：课后练习

## 练习一：加一个任务类型（20 分钟）

现在只有 `summarize`。加一个 `translate`：

```text
① payload 里带 targetLang
② worker 按 job.type 分发到不同的处理函数
③ 前端加一个下拉框选"总结 / 翻译"
```

**这题的意义：** 你第一次遇到"一个 worker 处理多种任务"。**注意 `type` 字段就是为这个存在的。**

## 练习二：给死信加一个后台页面（20 分钟）

`GET /api/jobs?status=dead` 列出所有死信，页面上能一键"重新投递"（新建一个任务，payload 复制过去）。

**为什么值得做：** 死信不是终点，是"待人工处理的队列"。**没有界面的死信队列等于黑洞。**

## 练习三：算清你的成本（10 分钟）

```text
一个任务 = 4 次模型调用 × 0.02 元 = 0.08 元
一天 200 个任务
其中 8% 会重试一次，2% 会重试到底（3 次）
```

**问题：**

1. 一天多少钱？
2. 重试占了多少钱？
3. 加幂等之后，重试还会不会重复收费？

---

# 第 8 步：最终验收

## A. 从零能搭出来

- [ ] `summary-app` 是我自己敲的，没有复制 `job-queue` 的文件夹
- [ ] `db.js` 有两张表，WAL 开着
- [ ] `worker.js` 有原子认领、重试、死信、幂等
- [ ] `api.js` 三个路由都能用
- [ ] 页面能提交、能看进度、刷新不丢

## B. 四个检查点都过了

- [ ] ① 表结构正确
- [ ] ② 手工投递能跑完
- [ ] ③ 重跑不重复产生副作用
- [ ] ④ 全链路四条都验证过

## C. 压测

- [ ] 1 个 worker 跑 10 个任务，记下了总耗时
- [ ] 2 个 worker 跑 10 个任务，明显更快
- [ ] 杀掉一个 worker，任务最终被回收并完成
- [ ] 全失败场景，3 次重试后进 `dead`，`sends` 表为空

## D. 概念

- [ ] 我能不看笔记画出"三进程 + 一数据库"的图
- [ ] 我能说清"队列让什么变快、什么没变快"
- [ ] 我知道这一周的东西什么时候不够用

## E. 交付

- [ ] `NOTES.md` 五个问题都答了
- [ ] 代码 commit + push
- [ ] `.gitignore` 里有 `*.db`

---

## 本节课要能说出口的一句话

> **这一周你学会的不是"队列"，是"怎么让一件慢事变得可控"：**
> **能被接住、能被看见、失败能重来、重来不多收钱。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 压测时进度全卡在 0 | worker 没起，或只起了一个而任务串行 | 起两个 worker 再压 |
| 两个 worker 总耗时没变 | 认领 SQL 一次返回多行，或业务里有全局锁 | 检查 `RETURNING` 和共享写入 |
| 杀掉 worker 后任务永远 `running` | 回收逻辑没跑（回收写在主循环里，被杀进程不会执行） | 回收必须由**另一个活着的 worker** 执行，确认还有 worker 在跑 |
| 回收后任务重跑又扣钱 | 幂等没做 | `sends` 表的 UNIQUE 约束 |
| `load-test.js` 报 fetch 失败 | API 没起或端口不对 | 确认 3002 在监听 |
| 压测 10 个任务全是 `dead` | worker 里抛的错是永久错误 | 检查 `retryable` 标记 |
| 两个 worker 日志里 id 相同 | 用了"先查再改" | 改回原子认领 |
