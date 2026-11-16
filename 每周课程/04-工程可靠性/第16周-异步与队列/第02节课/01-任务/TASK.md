# 第 107 节课：为什么慢接口必须挪到后台

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你学会了区分"卡住"和"等着"。今天要回答另一个问题：
> **既然 `await` 不卡服务器，那为什么慢接口还是要改？**

**建议用时**：110 分钟
**你需要先完成**：第 106 节课（`async-lab` 能跑）
**今天要装**：`express`（就这一个）

---

# 第 0 步：先算清一条线（15 分钟）

## 0.1 "慢"的三个不同后果

**这是今天最重要的一张表。** 三个后果，解法完全不同。

| 后果 | 触发条件 | 加机器能解决吗 |
|---|---|---|
| 服务器被卡住 | 同步阻塞代码（CPU 空转、同步 IO） | 能，加机器 |
| **用户等不住** | 任何超过约 10 秒的等待 | **不能** |
| **网关超时** | 超过反向代理/负载均衡的超时（常见 60 秒） | **不能** |

**上节课解决的是第一行，今天解决第二、三行。**

## 0.2 一个必须纠正的误解

```text
"我用了 await，所以服务器不会卡，所以慢接口没问题。"
```

**前半句对，后半句错。**

`await` 确实让服务器能处理别的请求。**但用户还在原地等。** 这期间：

```text
① 浏览器在转圈，用户会刷新 → 你跑第二遍 → 模型 token 烧两倍
② 手机网络断了，请求丢了，但你的服务还在跑 → 白烧钱
③ 中间有网关（Nginx / 云平台 / Cloudflare），60 秒没响应直接 502
   → 你的活干完了，用户拿到的是"502 Bad Gateway"
④ 客户以为没成功，打电话给你 → 你变成人工重试按钮
```

**这就是为什么：不卡服务器 ≠ 可以同步等。**

## 0.3 那条线在哪

```text
< 1 秒       正常，直接同步返回
1—3 秒       可以忍（页面加个 loading）
3—10 秒      勉强，但要有进度反馈
> 10 秒      必须挪到后台，返回任务号
```

**这不是玄学，是用户的耐心。** 超过 10 秒，用户会开始怀疑"是不是坏了"。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的记录 |
| `slow-api/` | `03-练习代码` | 先做一个"错的"，再改成"对的" |

---

# 第 1 步：建项目，先做一个 20 秒的接口（15 分钟）

## 1.1 建项目

在 `03-练习代码` 下新建文件夹 `slow-api`，进去打开终端：

```bash
npm init -y
npm pkg set type=module
npm install express
```

**做完后应该看到：** 目录里有 `package.json`、`node_modules`、`package-lock.json`。

## 1.2 写一个"假装很慢"的业务

新建 `slow.js`：

```javascript
// slow.js
// 假装在干一件重活：解析 200 页 PDF、生成一篇长文……
// 这里用 sleep 代替，因为今天不关心"活"本身，只关心"等"这件事

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function heavyWork(text) {
  // 分 4 段，每段 5 秒，总共 20 秒
  for (let i = 1; i <= 4; i++) {
    await sleep(5000);
    console.log(`  第 ${i}/4 段完成`);
  }

  return {
    summary: `这是对「${text.slice(0, 10)}…」的总结`,
    seconds: 20,
  };
}
```

## 1.3 写接口

新建 `server.js`：

```javascript
// server.js
// 版本一：同步等结果的"错"写法

import express from "express";
import { heavyWork } from "./slow.js";

const app = express();
app.use(express.json());

app.get("/ping", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 慢接口：用户提交文本，等 20 秒拿总结
app.post("/api/report", async (req, res) => {
  const text = req.body.text ?? "默认文本";

  console.log(`[${new Date().toLocaleTimeString()}] 收到请求，开始干活`);

  const result = await heavyWork(text);

  console.log(`[${new Date().toLocaleTimeString()}] 干完了，返回`);

  res.json({ ok: true, data: result });
});

app.listen(3000, () => {
  console.log("服务已启动：http://localhost:3000");
});
```

## 1.4 启动并测一次

```bash
node server.js
```

**开第二个终端，用 curl 打一次并计时（Git Bash 写法，一行到底）：**

```bash
curl -w "\n耗时：%{time_total} 秒\n" -X POST http://localhost:3000/api/report -H "Content-Type: application/json" -d '{"text":"这是一段要被总结的长文本内容"}'
```

**在 cmd 里要做两处改动：** 换行符用 `^`，JSON 外层单引号要换成双引号并转义内部双引号：

```text
-d "{\"text\":\"这是一段要被总结的长文本内容\"}"
```

**你应该看到：**

```text
（等 20 秒，中间什么都不返回）
{"ok":true,"data":{"summary":"…","seconds":20}}
耗时：20.0xx 秒
```

**服务器端终端会依次打出 4 行"第 N/4 段完成"。**

---

# 第 2 步：把问题摆到台面上（20 分钟）

## 2.1 问题一：用户等不住

这 20 秒里，浏览器**一个字节都没收到**。页面上只能是一个转圈的动画。

**用户会在第 8 秒开始刷新页面。** 刷新 = 重新提交 = 第二遍 20 秒。

**自己试一次：**

1. 用 Git Bash 开两个终端窗口，都在第一个请求没返回时打第二个请求；
2. 看服务器终端。

**你应该看到同一个任务的 4 行日志出现了两组，甚至三组。**

**这就是"重复提交"的钱是怎么烧掉的。** 每次模型调用都是真金白银。

## 2.2 问题二：网关超时

你现在是本机直连，没有网关。真实环境长这样：

```text
用户 → Nginx / 云平台 → 你的 Node 进程
```

**任何一环都有超时：**

| 环节 | 常见超时 |
|---|---|
| 浏览器 | 300 秒左右（很长） |
| Nginx `proxy_read_timeout` | 默认 60 秒 |
| 云平台网关 | 15 / 30 / 60 秒不等 |
| Cloudflare | 100 秒 |

**你的活跑了 20 秒，60 秒的网关不会杀你。但客户要"总结 50 篇论文"呢？**

**你会遇到这个经典场景：** 日志里任务明明成功了，用户坚称"报错了"。**因为他拿到的是 504，你的结果没人收。**

## 2.3 问题三：连接一直占着

这 20 秒里，这个 HTTP 连接不能释放。

```text
1000 个用户同时点 → 1000 个连接挂着 20 秒
```

**网关的连接池会满，新用户连不进来。** 这些人连"页面都打不开"。

## 2.4 把三条后果写进笔记

打开 `02-笔记/NOTES.md`，现在就把第 2 节填掉。**趁你还记得刚才看到的日志。**

---

# 第 3 步：改成"立即返回任务号"（30 分钟）

## 3.1 先想清楚要变成什么样

```text
旧：POST /api/report  → 等 20 秒 → 返回结果
新：POST /api/report  → 5 毫秒 → 返回 { jobId: "abc123" }
    GET  /api/jobs/abc123 → 立即可查 → { status: "running", progress: 40 }
    GET  /api/jobs/abc123 → 20 秒后 → { status: "done", result: {...} }
```

**两个动作：交单子、查单子。** 想不出比这更好的模型，就这么干。

## 3.2 新建文件，别改旧的

**新建 `server-v2.js`**（旧的留着，方便对比）：

```javascript
// server-v2.js
// 版本二：立即返回任务号

import express from "express";
import { randomUUID } from "node:crypto";

const app = express();
app.use(express.json());

// 先存内存里（第 108 节换成数据库，今天故意留个坑）
const jobs = new Map();

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// 提交任务：立刻返回
app.post("/api/report", (req, res) => {
  const text = req.body.text ?? "默认文本";

  const job = {
    id: randomUUID().slice(0, 8),
    status: "pending",
    progress: 0,
    createdAt: new Date().toISOString(),
    result: null,
    error: null,
  };

  jobs.set(job.id, job);

  // 注意：这里没有 await
  // 故意不 await —— 让它在后台自己跑，接口马上返回
  runJob(job, text).catch((err) => {
    job.status = "failed";
    job.error = err.message;
    console.error(`[任务 ${job.id}] 未捕获错误：`, err);
  });

  res.status(202).json({ ok: true, jobId: job.id });
});

// 查任务：随时可查
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);

  if (!job) {
    res.status(404).json({ ok: false, error: "任务不存在" });
    return;
  }

  res.json({ ok: true, job });
});

// 真正的活，在接口外面跑
async function runJob(job, text) {
  job.status = "running";

  try {
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      job.progress = i * 25;
      console.log(`[任务 ${job.id}] 进度 ${job.progress}%`);
    }

    job.result = { summary: `「${text.slice(0, 10)}…」的总结` };
    job.status = "done";
    job.progress = 100;
    console.log(`[任务 ${job.id}] 完成`);
  } catch (err) {
    job.status = "failed";
    job.error = err.message;
    console.log(`[任务 ${job.id}] 失败：`, err.message);
  }
}

app.listen(3001, () => {
  console.log("v2 已启动：http://localhost:3001");
});
```

**三个关键点，一个一个确认：**

**① `res.status(202)`，不是 200**

```text
200 = 我干完了，给你结果
202 = 我收到了，还没干完
```

**语义要准。** 前端看到 202 就知道该去轮询，看到 200 就直接拿结果。

**② 调用 `runJob` 时没有 `await`**

```javascript
runJob(job, text);          // 对：不等，立刻往下走
// await runJob(job, text); // 错：又变回同步等了
```

**这一行就是整个改造的核心。** 去掉 `await`，接口就从 20 秒变成 5 毫秒。

**③ 错误必须兜住**

接口已经返回了，没人接这个错。**不兜，任务会永远卡在 `running`，进程还可能被未处理拒绝干掉。**

## 3.3 测一次

**终端 A：**

```bash
node server-v2.js
```

**终端 B：提交任务（应该 5 毫秒返回）**

```bash
curl -w "\n耗时：%{time_total} 秒\n" -X POST http://localhost:3001/api/report -H "Content-Type: application/json" -d '{"text":"这是一段要被总结的长文本"}'
```

**你应该看到：**

```text
{"ok":true,"jobId":"a1b2c3d4"}
耗时：0.00x 秒
```

**5 毫秒 vs 20 秒。这就是今天的全部价值。**

**终端 C：立刻查一次**

```bash
curl http://localhost:3001/api/jobs/a1b2c3d4
```

（把 `a1b2c3d4` 换成你拿到的 id）

**你应该看到 `"status":"pending"` 或 `"running"`，`"progress":0` 或 `25`。**

**过 10 秒再查一次，`progress` 应该变成 50 左右。**

**过 25 秒再查，应该是 `"status":"done"`，`"progress":100`，有 `result`。**

## 3.4 对比一下

| | 旧接口 | 新接口 |
|---|---|---|
| 提交耗时 | 20 秒 | 0.005 秒 |
| 用户看到什么 | 转圈 20 秒 | 立刻"已提交，任务号 xxx" |
| 刷新页面 | 重复跑一遍 | 只是重新查一次状态 |
| 干完时用户在线吗 | 必须在 | 不用，随时来查 |
| 网关超时 | 会杀 | 不会，5 毫秒 |

---

# 第 4 步：故意犯四个错（20 分钟）

## 错误 1：返回 200 而不是 202

把 `res.status(202)` 改成 `res.status(200)`，前端按"成功且拿到结果"处理，结果 `result` 是 `null`。

**现象：** 页面上显示"总结：undefined"。

## 错误 2：`runJob` 里不 `try/catch`

把 `runJob` 的 `try/catch` 去掉，然后在 `slow.js` 里加一行 `throw new Error("模型超时")`。

**现象：**

```text
（接口已经返回 202 了，用户以为成功）
（服务器终端一行红色报错）
（用户永远查不到结果，一直卡在 running）
```

**这是最阴的错误：用户以为成功了，其实什么都没发生。**

## 错误 3：把任务存在内存里

**这个坑今天故意留着，但你要亲眼看到它。**

提交一个任务 → **立刻关掉服务（Ctrl+C）→ 重新 `node server-v2.js`** → 用刚才的 jobId 查。

**你应该看到：**

```json
{"ok":false,"error":"任务不存在"}
```

**任务没了，钱白花了。** 因为 `Map` 在内存里，进程一死就清空。

**这就是第 108 节要解决的第一个问题。**

## 错误 4：没有 `GET` 接口

把 `app.get("/api/jobs/:id")` 注释掉。

**前端拿到 jobId 之后无处可查。** 等于给了用户一张取货单，但仓库没有取货窗口。

---

# 第 5 步：写学习笔记（10 分钟）

把四段都填掉，尤其"三个后果"和"内存丢失"这两块。

---

# 第 6 步：课后练习

## 练习一：给接口加输入校验（10 分钟）

现在的 `/api/report` 什么都能提交。加三条校验：

1. `text` 必须是字符串；
2. 长度 10—5000 字；
3. 不通过返回 `400`，别创建任务。

**为什么要做：** 后台任务烧的是钱，**脏数据不该进队列。**

## 练习二：算一笔账（10 分钟）

假设：

- 模型调用一次 0.03 元；
- 一天 200 个请求；
- 其中 1/5 的用户因为等不住刷新了一次。

**问题：**

1. 每天多烧多少钱？
2. 改成任务号之后，这笔钱还在吗？为什么？
3. 如果不做幂等（第 109 节），用户连点三次会花几倍？

## 练习三：判断该不该改（10 分钟）

下面四个接口，哪些必须改成任务号？

```text
A. 查一条订单：select * from orders where id = ?
B. 生成一份 30 页的行业报告
C. 把 200 张图片压成缩略图
D. 用户登录，验证密码
```

**答案：** B、C 必须改。A、D 都是毫秒级，**改了下场是把自己搞复杂，还引入了任务表。**

**判断标准只有一个：正常情况要跑多久？超过 10 秒就改。**

---

# 第 7 步：最终验收

## A. 两个版本都跑过

- [ ] `server.js` 的 `/api/report` 要等 20 秒
- [ ] `server-v2.js` 的 `/api/report` 5 毫秒返回 jobId
- [ ] 两个版本的耗时数字都记进了笔记

## B. 轮询能用

- [ ] `GET /api/jobs/:id` 能查到 `pending` / `running` / `done`
- [ ] `progress` 会从 0 走到 100
- [ ] 查不存在的 id 返回 404

## C. 四个错都踩过

- [ ] 看到过 200 和 202 的区别
- [ ] 看到过"接口已返回成功、后台悄悄炸了"
- [ ] 亲手把任务弄丢过（重启服务）
- [ ] 知道没有查询接口会怎样

## D. 概念

- [ ] 我能说清"不卡服务器"和"用户等不住"是两件不同的事
- [ ] 我知道 202 和 200 的区别
- [ ] 我知道那条 10 秒的线是怎么来的
- [ ] 我知道为什么 `runJob` 不能 `await`

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 三个后果写清楚了
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **接口的任务不是"把活干完"，是"把活收下"。**
> **干完是后台的事，用户不需要站在门口等。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `Cannot find package 'express'` | 没装或装到别的目录 | 确认在 `slow-api` 里 `npm install express` |
| 提交马上返回，但任务永远 `pending` | `runJob` 没被调用，或进程退出了 | 检查有没有调 `runJob`，终端有没有报错 |
| `curl` 报 `400 Bad Request` | 少 `Content-Type` 或 JSON 写错 | 加 `-H "Content-Type: application/json"`，检查引号转义 |
| 任务一直 `running` | `runJob` 里抛错没接住 | 补 `try/catch`，看终端红色报错 |
| 端口 3001 被占 | 旧进程没关 | `Ctrl+C` 关掉，或换个端口 |
| 查任务 404 | id 抄错，或服务重启过（内存丢了） | 检查 id，这正说明第 108 节要上数据库 |
| 浏览器里请求成功但页面不更新 | 前端没写轮询 | 第 111 节专门做 |
| `UnhandledPromiseRejection` 让进程退出 | `runJob` 返回的 Promise 没人接 | 加 `.catch(console.error)` |
