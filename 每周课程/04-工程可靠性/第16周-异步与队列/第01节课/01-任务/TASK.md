# 第 106 节课：区分同步和异步

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天不写任何业务功能，只做一件事：**亲眼看见"卡住"和"等着"的区别**。
> 这个区别看不清，后面六节课全是背命令。

**建议用时**：100 分钟
**你需要先完成**：第 3 周（`chat-app` 能跑）、第 4 周（会 commit）
**今天不装任何新东西**，只用你电脑上已有的 Node

---

# 第 0 步：先把三个词钉死（15 分钟）

## 0.1 同步 = 排队，一件做完才做下一件

```text
同步：我去银行柜台，柜员处理我这一单的时候，后面的人只能站着等
```

**在代码里：**

```javascript
const a = 做事一();   // 这一行不结束，下一行不会开始
const b = 做事二();
```

## 0.2 异步 = 单子交出去，先去干别的

```text
异步：我取号、把材料交上去、坐旁边等叫号
      这期间柜员在办别人的单子，我也能刷手机
```

**在代码里：**

```javascript
const 单号 = 交上去();      // 立刻拿到一个"凭证"（Promise）
const 别的 = 做别的事();    // 这行马上执行，不用等
const 结果 = await 单号;    // 等它真的好了，才取结果
```

## 0.3 关键认知：Node 只有一个线程

这一条必须刻在脑子里：

```text
Node 的 JavaScript 代码，全程只有一个线程在跑。
同一时刻，只有一行 JS 在执行。
```

**所以：**

| 情况 | 会不会卡住整个服务 | 为什么 |
|---|---|---|
| `while` 空转 3 秒 | **会** | CPU 被这行占着，别的代码一行都插不进来 |
| `await sleep(3000)` | **不会** | 线程让出来了，靠定时器回来叫它 |
| `await fetch(慢接口)` | **不会** | 线程让出来了，等操作系统告诉你数据到了 |
| `fs.readFileSync` 读 500MB | **会** | 同步 API，读完才返回 |
| `JSON.parse` 一个 100MB 字符串 | **会** | 纯 CPU 计算，没有让出的机会 |

**"异步"不是多开线程，是"这件事不用 CPU 的时候，把线程让出去"。**

## 0.4 今天要产出的东西

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的记录（有三张表要填实测数字） |
| `async-lab/` | `03-练习代码` | 你今天自己建的项目 |

---

# 第 1 步：建实验项目（10 分钟）

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\04-工程可靠性\第16周-异步与队列\第01节课\03-练习代码
   ```

2. 在这里新建文件夹 `async-lab`，进这个文件夹。
3. 在这个文件夹里打开终端（地址栏输入 `cmd` 回车，或右键"在终端中打开"）。
4. 初始化项目：

   ```text
   npm init -y
   npm pkg set type=module
   ```

**为什么要 `type=module`：**

```text
不加这一行，你用不了 import 语法，只能写 require。
这一周所有示例都写 import 版本 —— 新代码都这么写。
```

**做完后应该看到：** `async-lab/` 里有 `package.json`，里面有一行 `"type": "module"`。

**验证一下：**

```bash
node -e "console.log(process.version)"
```

**记下你的 Node 版本，写进笔记。** 低于 18 的话，这周的示例会有语法报错，先去装新的。

---

# 第 2 步：第一个实验——同步阻塞（15 分钟）

## 2.1 写代码

新建文件 `sync-block.js`：

```javascript
// sync-block.js
// 目的：让你亲眼看到"CPU 被占住"是什么意思

const start = Date.now();

console.log("开始空转");

// 这 3 秒里，CPU 一直在算这一个条件，
// 整个进程（包括所有其他请求）都动不了
while (Date.now() - start < 3000) {
  // 故意什么都不做
}

console.log("空转结束，用了", Date.now() - start, "毫秒");
```

## 2.2 跑它

```bash
node sync-block.js
```

**你应该看到：**

```text
开始空转
空转结束，用了 3001 毫秒
```

中间停了 3 秒，终端什么都没输出。

## 2.3 现在换成"等待"

新建文件 `async-wait.js`：

```javascript
// async-wait.js
// 目的：同样是 3 秒，但这次线程是空闲的

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const start = Date.now();

console.log("开始等待");

// 到这一行，JS 线程直接让出去，什么都不占
await sleep(3000);

console.log("等待结束，用了", Date.now() - start, "毫秒");
```

```bash
node async-wait.js
```

**表面上看，输出一模一样。** 都是 3 秒。

**区别在哪？** 两个文件都在运行时，**只有第二个能响应别的请求**。下一步就证明给你看。

---

# 第 3 步：用一个 HTTP 服务把区别放大（25 分钟）

## 3.1 写服务

新建文件 `server.js`：

```javascript
// server.js
// 同一个服务里放两个慢接口：一个同步阻塞，一个异步等待

import http from "node:http";

// 同步阻塞版：占着 CPU 空转
function blockFor(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // 空转
  }
}

// 异步等待版：交出线程，等定时器
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = http.createServer(async (req, res) => {
  const url = req.url;

  // 快速接口：用来测试"服务还活着吗"
  if (url === "/ping") {
    res.end("pong\n");
    return;
  }

  // 阻塞 3 秒
  if (url === "/block") {
    blockFor(3000);
    res.end("阻塞版完成\n");
    return;
  }

  // 等待 3 秒
  if (url === "/wait") {
    await sleep(3000);
    res.end("等待版完成\n");
    return;
  }

  res.statusCode = 404;
  res.end("not found\n");
});

server.listen(3000, () => {
  console.log("服务已启动：http://localhost:3000");
  console.log("测试地址：/ping  /block  /wait");
});
```

## 3.2 启动

```bash
node server.js
```

**做完后应该看到：**

```text
服务已启动：http://localhost:3000
测试地址：/ping  /block  /wait
```

**这个终端不要关。** 下面所有测试都靠它。

## 3.3 第一轮测试：阻塞接口有没有拖死服务

**开第二个终端。** 按顺序做：

**① 先确认服务正常：**

```bash
curl http://localhost:3000/ping
```

看到 `pong` 说明服务活着。

**② 同时打两个 `/block`：**

Windows 的 cmd 里没有 `&`，用两个终端窗口各跑一条：

```bash
# 终端 A
curl http://localhost:3000/block

# 终端 B（在 A 还没返回时就敲）
curl http://localhost:3000/block
```

**记下两条命令各自用了多久。** 用 Git Bash 可以加时间：

```bash
curl -w "\n耗时：%{time_total} 秒\n" http://localhost:3000/block
```

**你应该看到：**

```text
第一个：耗时 3.0x 秒
第二个：耗时 6.0x 秒
```

**第二个白白多等了 3 秒。** 因为它排队等第一个跑完。

**③ 阻塞期间打 `/ping`：**

重新来一次：终端 A 跑 `/block`，**立刻**在终端 B 敲：

```bash
curl -w "\n耗时：%{time_total} 秒\n" http://localhost:3000/ping
```

**你应该看到 `/ping` 也要等 3 秒左右才回 `pong`。**

这就是最致命的地方：**一个用户的慢请求，把所有人的请求都堵住了。**

## 3.4 第二轮测试：换成 `/wait`

**① 同时打两个 `/wait`：**

```bash
# 终端 A
curl -w "\n耗时：%{time_total} 秒\n" http://localhost:3000/wait

# 终端 B
curl -w "\n耗时：%{time_total} 秒\n" http://localhost:3000/wait
```

**你应该看到：两条都是 3.0x 秒，不是 3 秒和 6 秒。**

**② 等待期间打 `/ping`：**

终端 A 跑 `/wait`，立刻终端 B 跑 `/ping`。

**`/ping` 应该 0.0x 秒就回，几乎不耗时。**

## 3.5 把四个数字填进笔记

| 测试 | 你实测的耗时 | 这说明什么 |
|---|---|---|
| 单个 `/block` | 3.0x 秒 | 基准 |
| 两个 `/block` 中的第二个 | 6.0x 秒 | 排队 = 卡住 |
| `/block` 期间的 `/ping` | 3.0x 秒 | 慢请求拖死所有人 |
| 两个 `/wait` | 3.0x + 3.0x 秒 | 并发 = 不排队 |
| `/wait` 期间的 `/ping` | 0.0x 秒 | 服务一直是活的 |

**这五个格子填完，你就真的懂什么叫"阻塞"了。** 只背定义不算。

---

# 第 4 步：异步的三种写法（20 分钟）

## 4.1 回调（老写法，看懂就行，别写）

新建 `callback.js`：

```javascript
// 老写法：回调地狱
import fs from "node:fs";

fs.readFile("package.json", "utf8", (err, data) => {
  if (err) {
    console.error("读失败了：", err.message);
    return;
  }
  console.log("读到", data.length, "个字符");

  fs.writeFile("copy.json", data, (err2) => {
    if (err2) {
      console.error("写失败了：", err2.message);
      return;
    }
    console.log("写完了");
  });
});
```

**为什么现在不这么写：** 三层嵌套还能看，十层就没法看了，而且 `err` 要一层层判。

## 4.2 Promise

新建 `promise.js`：

```javascript
import fs from "node:fs/promises";   // 注意是 /promises

fs.readFile("package.json", "utf8")
  .then((data) => {
    console.log("读到", data.length, "个字符");
    return fs.writeFile("copy.json", data);
  })
  .then(() => {
    console.log("写完了");
  })
  .catch((err) => {
    console.error("出错了：", err.message);
  });
```

**比回调好在：** `catch` 一个地方兜住所有错。

## 4.3 async / await（以后都写这个）

新建 `await.js`：

```javascript
import fs from "node:fs/promises";

async function main() {
  try {
    const data = await fs.readFile("package.json", "utf8");
    console.log("读到", data.length, "个字符");
    await fs.writeFile("copy.json", data);
    console.log("写完了");
  } catch (err) {
    console.error("出错了：", err.message);
  }
}

main();
```

**三段代码干的是同一件事。** 第三种最好读，**以后一律写这种。**

---

# 第 5 步：顺序 await 和并行的区别（15 分钟）

## 5.1 顺序执行（慢）

新建 `sequential.js`：

```javascript
// 三次调用，一次等一次
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 假装是一次"接口调用"，实际就是等 1 秒
async function fakeApi(name) {
  await sleep(1000);
  return `${name} 完成`;
}

const start = Date.now();

const a = await fakeApi("A");
const b = await fakeApi("B");
const c = await fakeApi("C");

console.log(a, b, c);
console.log("总耗时：", Date.now() - start, "毫秒");
```

```bash
node sequential.js
```

**你应该看到总耗时 300x 毫秒。**

## 5.2 并行执行（快）

新建 `parallel.js`：

```javascript
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fakeApi(name) {
  await sleep(1000);
  return `${name} 完成`;
}

const start = Date.now();

// 先全部"交上去"，再一起等
const [a, b, c] = await Promise.all([
  fakeApi("A"),
  fakeApi("B"),
  fakeApi("C"),
]);

console.log(a, b, c);
console.log("总耗时：", Date.now() - start, "毫秒");
```

```bash
node parallel.js
```

**你应该看到总耗时 100x 毫秒。**

## 5.3 什么时候能并行

```text
能并行：三次调用互相不依赖 —— 查三个城市的天气
不能并行：后一次要用前一次的结果 —— 先登录拿 token，再用 token 查数据
```

**判断方法：把第二行代码的执行顺序调换，结果会变吗？会变就不能并行。**

---

# 第 6 步：故意犯五个错（20 分钟）

这五个坑，**每一个你以后都会踩一次**。现在踩，成本最低。

## 错误 1：忘了 `await`

新建 `wrong-1.js`：

```javascript
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function work() {
  await sleep(1000);
  return "结果";
}

const result = work();          // 忘了 await
console.log("拿到：", result);   // 你以为拿到"结果"
console.log("它其实是什么：", result instanceof Promise);
```

**你应该看到：**

```text
拿到： Promise { <pending> }
它其实是什么： true
```

**最坑的是：这段代码不报错。** 你把一个 Promise 当字符串用，可能一路带到数据库里，存成 `[object Promise]`。

**唯一能发现的办法：看到 `Promise { <pending> }` 就知道漏了 await。**

## 错误 2：`await` 写在 `for` 循环里，慢十倍

新建 `wrong-2.js`：

```javascript
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ids = [1, 2, 3, 4, 5];

// 错：一次一个
const start1 = Date.now();
for (const id of ids) {
  await sleep(200);            // 5 次 × 200ms = 1000ms
}
console.log("for + await：", Date.now() - start1, "毫秒");

// 对：一起发出去
const start2 = Date.now();
await Promise.all(ids.map((id) => sleep(200)));   // 全部一起，200ms
console.log("Promise.all：", Date.now() - start2, "毫秒");
```

**两个数字会差 5 倍。**

**什么时候循环里可以 `await`：** 后面要限速（一次只发一个，防被封 IP），或者后一次依赖前一次。**否则一律 `Promise.all`。**

## 错误 3：在 `forEach` 里 `await`，等于没写

新建 `wrong-3.js`：

```javascript
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function task(n) {
  await sleep(100 * n);
  console.log("完成", n);
}

async function main() {
  console.log("开始");

  // 错：forEach 不吃 async 函数，它不会等
  [1, 2, 3].forEach(async (n) => {
    await task(n);
  });

  console.log("forEach 后面的代码（其实还没跑完）");

  await sleep(500);
  console.log("结束");
}

main();
```

**你应该看到"开始" → "forEach 后面的代码" → 然后才"完成 1/2/3"。**

**顺序反了就是证据：`forEach` 根本没等。** 要顺序就用 `for...of`，要并行就用 `Promise.all(ids.map(...))`。

## 错误 4：`try/catch` 抓不到忘了 await 的错

新建 `wrong-4.js`：

```javascript
async function boom() {
  throw new Error("这里炸了");
}

async function main() {
  try {
    boom();             // 没有 await
    console.log("try 里没报错，以为成功了");
  } catch (err) {
    console.log("catch 抓到了：", err.message);
  }

  // 这个错会变成"未处理的 Promise 拒绝"，直接把进程干掉
}

main();
```

**你应该看到：**

```text
try 里没报错，以为成功了
（然后一行红色报错，进程退出）
```

**记住：`try/catch` 只抓得住 await 之后的错，抓不住没人管的 Promise。**

## 错误 5：`fetch` 没有超时，能挂到天荒地老

新建 `wrong-5.js`：

```javascript
// 打一个永远不回应的地址（10.255.255.1 是保留地址，连不上也不拒绝）
try {
  console.log("开始请求，没有超时设置…");
  const res = await fetch("http://10.255.255.1/api");
  console.log("回来了：", res.status);
} catch (err) {
  console.log("出错了：", err.message);
}
```

**跑它，然后按 `Ctrl+C`。** 你会发现等了很久也不报错 —— **它会一直挂着。**

**这就是你现在代码里的隐患。** 加超时的写法：

```javascript
const res = await fetch("http://10.255.255.1/api", {
  signal: AbortSignal.timeout(5000),   // 5 秒必断
});
```

**Node 18+ 才有 `AbortSignal.timeout`。** 你的版本不够就写 `AbortController` + `setTimeout`（自己查，这里不铺开）。

**规则：所有外部请求（模型接口、第三方 API、短信网关）必须设超时。** 不设就是给未来的自己埋雷。

---

# 第 7 步：写学习笔记（10 分钟）

打开 `02-笔记/NOTES.md`，把三张表填满。**不要空着"卡在哪"。**

---

# 第 8 步：课后练习

## 练习一：把 `/block` 改成 10 秒，看会发生什么（10 分钟）

改 `server.js` 里的 `blockFor(3000)` 成 `blockFor(10000)`，重启服务，然后：

1. 开三个终端，同时打 `/block`；
2. 第三个的耗时是多少？
3. 这期间 `/ping` 能通吗？

**把三个数字写进笔记。** 这就是"一个用户毁掉整个服务"的真实样子。

## 练习二：找出下面这段代码的四个问题（10 分钟）

```javascript
app.get("/api/report", async (req, res) => {
  const data = fs.readFileSync("./big.json", "utf8");
  const json = JSON.parse(data);

  for (const id of json.ids) {
    const detail = await fetch(`https://api.example.com/detail/${id}`);
    json.details.push(detail);
  }

  res.json(json);
});
```

**四个问题：**

1.
2.
3.
4.

**参考答案在下面，先自己想十分钟。**

<details>
<summary>点开看答案</summary>

1. **`readFileSync` 同步读文件** —— 文件越大，整个进程卡越久。应该 `await fs.readFile`。
2. **`for` 循环里 `await fetch`** —— 100 个 id 就是 100 次串行，应该 `Promise.all` + 限流。
3. **`fetch` 没设超时** —— 任何一个第三方接口挂住，整个请求永远不返回。
4. **接口是同步等结果的** —— 这段活可能要几十秒，用户等不住。**这是本周主题：这种接口必须改成"立即返回任务号"。**

</details>

## 练习三：用自己的话讲（5 分钟）

对着空气讲一遍，讲不顺就说明没懂：

```text
为什么 `while` 空转会卡住服务，而 `await sleep(3000)` 不会？
```

---

# 第 9 步：最终验收

## A. 跑通

- [ ] `sync-block.js` 跑过，看到 3001 毫秒
- [ ] `async-wait.js` 跑过
- [ ] `server.js` 能启动，`/ping` `/block` `/wait` 三个地址都通

## B. 实测

- [ ] 两个 `/block` 的耗时分别是 3 秒和 6 秒
- [ ] `/block` 期间 `/ping` 也被拖住
- [ ] 两个 `/wait` 都是 3 秒，没有排队
- [ ] `/wait` 期间 `/ping` 是毫秒级

**这四条数字填进笔记了吗？没填等于没做。**

## C. 三种写法

- [ ] `callback.js` / `promise.js` / `await.js` 三个都跑通了
- [ ] 我能说出三者的优缺点

## D. 顺序与并行

- [ ] `sequential.js` 约 3000 毫秒
- [ ] `parallel.js` 约 1000 毫秒
- [ ] 我能判断一段代码能不能并行

## E. 五个错

- [ ] 我看到过 `Promise { <pending> }`
- [ ] 我知道 `for` + `await` 慢在哪
- [ ] 我知道 `forEach` + `async` 为什么不管用
- [ ] 我知道漏 `await` 时 `try/catch` 抓不住
- [ ] 我知道 `fetch` 不设超时会挂死

## F. 概念

- [ ] 我能说清 Node 是单线程，那"异步"到底在等什么
- [ ] 我知道哪些操作会阻塞（CPU 计算、同步 IO），哪些不会（定时器、网络）

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 三张表都有真实数字
- [ ] "我还不懂的词"有内容

---

## 本节课要能说出口的一句话

> **异步不会让事情变快，它只是让你在等的时候能去干别的。**
> **而 CPU 被占住的时候，什么都干不了。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `SyntaxError: Cannot use import statement outside a module` | 没加 `type=module` | `npm pkg set type=module` |
| `await` 报 `SyntaxError: await is only valid in async functions` | 顶层 await 不支持的旧版本 | 升级 Node，或包一层 `async function main()` |
| `curl` 不是内部或外部命令 | 在 cmd 里没有 curl 老版本 | 用 Git Bash，或用浏览器打开地址 |
| 两个 `/block` 都是 3 秒 | 你在两个不同的进程/两个浏览器标签，浏览器能并发但服务端还是串行 | 确认打的是同一个服务端口，看服务端日志 |
| `/ping` 很快，不觉得卡 | 打的时机不对 | `/block` 敲完立刻打 `/ping`，别等它返回 |
| 端口 3000 被占用 | 上次的服务没关 | 关掉旧终端，或改端口 3001 |
| `Promise { <pending> }` 打印出来 | 漏了 `await` | 补 `await`，或 `.then()` |
| 进程莫名其妙退出，没有任何提示 | 未处理的 Promise 拒绝 | 加 `process.on("unhandledRejection", console.error)` |
