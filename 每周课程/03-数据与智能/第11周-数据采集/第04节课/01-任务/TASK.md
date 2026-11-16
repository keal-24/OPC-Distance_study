# 第 74 节课：处理分页

> 这节课结束时，你手上有：`第04节课/03-练习代码/collector/fetch-pages.js`（三种分页各抓一遍，都得到 30 条）、`collector/state.json`（断点续抓的状态文件）、`collector/items-paged.json`（抓全的 30 条）。

**时间**：约 120 分钟
**前置**：第 73 节课的 `collector` 项目（会用 cheerio 抽字段，会写检查点）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你会抓**一页**。第 72 节抓了 `/api/items?page=1`，拿到 10 条，打印出来，很开心。

**问题是：那个接口一共 30 条，你只拿到了 10 条。**

而且更麻烦的是 —— **你的程序不会告诉你它只拿了 10 条。**

## 0.2 今天这个坑长什么样

> 你写了个循环，想抓 30 条。跑完打印"共 30 条"，你很高兴，存进数据库。
>
> 三天后你查库：`SELECT COUNT(*) FROM items;` → **20**。
>
> 你回去看日志，一切正常，没有任何报错。
>
> 你把循环打印出来数了一遍：
>
> ```javascript
> let page = 1;
> while (page <= 3) {
>   const res = await fetch("...page=" + page);
>   const body = await res.json();
>   all.push(...body.data);
>   page += 1;
> }
> ```
>
> 逻辑没毛病。**但你抓的是第 1、2、3 页 —— 而对方的页码从 0 开始。**

**分页这件事，难的不是循环，是三件事：**

```text
一、对方的页码规则是什么？（从 1 开始、从 0 开始、还是给游标）
二、什么时候停？（这是唯一必须你自己定的东西，对方不会告诉你）
三、跑到一半断了怎么办？（重头再来一遍？还是接着跑？）
```

**这三件事，任何一件想错，结果都是"程序正常结束，数据不对"。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| page 参数分页 | URL 里带"第几页"，最常见 | 第 2 步，`?page=1&size=10` |
| offset / limit | 跳过前 N 条，取 M 条 | 第 3 步，`?offset=0&limit=10` |
| cursor（游标） | 上一页最后一条的标记，拿它换下一页 | 第 4 步，`?cursor=0` |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `fetch-pages.js` | `第04节课/03-练习代码/collector/` | 三种分页 + 终止条件 + 断点续抓 |
| `state.json` | 同上 | 记到第几页了 |
| `items-paged.json` | 同上 | 抓全的 30 条 |
| `NOTES.md` | `第04节课/02-笔记/` | 第 6 步填 |

---

# 第 1 步：先看清三种分页长什么样（20 分钟）

## 1.1 做什么 / 为什么

**做什么：** 用 `curl.exe` 把 mock-server 的三种分页端点各请求两三次，看清返回结构。

**为什么先看再写：** 因为三种分页的**终止信号完全不同**：

| 分页方式 | 有没有"共几页" | 终止信号 |
|---|---|---|
| page 参数 | 有时有 `total` / `total_pages` | `has_next` 为 false，或返回空数组 |
| offset / limit | 有 `total` | 返回条数少于 `limit`，或返回空数组 |
| cursor | 通常没有 | `next_cursor` 为 `null` |

**先看清有没有"总数"这个字段，你才知道自己能靠什么停。**

## 1.2 操作

**1.** 把上一节的项目复制过来（`node_modules` 一起带，省一次安装）：

```text
cd /d "B:\OPC-Distance_study\每周课程\03-数据与智能\第11周-数据采集\第04节课\03-练习代码"
xcopy /E /I /Y "..\第03节课\03-练习代码\collector" collector
cd collector
del grab-html.js parse-manual.js parse-cheerio.js selector-test.js raw-list.html raw-v2.html
```

**2.** 确认 mock-server 在跑，然后依次请求：

```text
curl.exe -s "http://localhost:3001/api/items?page=1&size=10"
curl.exe -s "http://localhost:3001/api/items?page=3&size=10"
curl.exe -s "http://localhost:3001/api/items?page=4&size=10"
curl.exe -s "http://localhost:3001/api/items-offset?offset=20&limit=10"
curl.exe -s "http://localhost:3001/api/items-offset?offset=30&limit=10"
curl.exe -s "http://localhost:3001/api/items-cursor?cursor=0&limit=10"
curl.exe -s "http://localhost:3001/api/items-cursor?cursor=20&limit=10"
```

## 1.3 屏幕上应该看到什么

**page 参数：**

```text
{"page":1,"size":10,"total":30,"has_next":true,"data":[{...},...]}     ← 10 条
{"page":3,"size":10,"total":30,"has_next":false,"data":[{...},...]}    ← 10 条
{"page":4,"size":10,"total":30,"has_next":false,"data":[]}             ← 0 条
```

**`page=4` 返回 `200` + 空数组，不是 404。** 这一点第 72 节说过，现在它变成实际问题了：**"没有更多"和"出错了"在 HTTP 层面长得一样。**

**offset / limit：**

```text
{"offset":20,"limit":10,"total":30,"data":[...]}    ← 10 条（第 21—30 条）
{"offset":30,"limit":10,"total":30,"data":[]}       ← 0 条
```

**cursor：**

```text
{"cursor":0,"limit":10,"next_cursor":10,"data":[...]}     ← 10 条，下一页游标是 10
{"cursor":20,"limit":10,"next_cursor":null,"data":[...]}  ← 10 条，没有下一页了
```

**把这三组结构记进笔记，它们是三种分页的"指纹"：**

| 分页 | 有什么字段 | 你靠什么判断"还有下一页" |
|---|---|---|
| page | `page` `size` `total` `has_next` | `has_next`（但不可全信，见第 2 步） |
| offset | `offset` `limit` `total` | 拿到的条数是不是等于 `limit` |
| cursor | `cursor` `next_cursor` | `next_cursor` 是不是 `null` |

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `page=3` 只有 5 条 | 你的数据不是 30 条 | `/api/reset` 还原一下 |
| `has_next` 一直是 true | 你请求了 `size=50`，一页就抓完了 30 条 | 看 `data.length`，用 10 试 |
| curl 输出被截断看不清 | 一行太长 | 加 `| more`，或者直接 `node` 里 `console.log` |
| 中文乱码 | cmd 代码页 | `chcp 65001` |

---

# 第 2 步：page 参数分页 + 终止条件（25 分钟）

## 2.1 做什么 / 为什么

**做什么：** 写一个循环，从第 1 页抓到没有数据为止，最后校验"是不是 30 条"。

**为什么终止条件必须自己定：** 因为对方只告诉你 `has_next`，不告诉你"什么时候该信它"。而且真实接口里这三种情况都会出现：

```text
情况 A：最后一页返回空数组，has_next=false        ← 最规范
情况 B：最后一页返回 10 条，has_next=false        ← 刚好满页，容易写错
情况 C：has_next 算错了，最后一页还是 true        ← 真的会发生
```

**我们的做法：三个信号一起用。**

| 优先级 | 信号 | 作用 |
|---|---|---|
| 1 | `data.length === 0` | 最硬：没数据就是没了，立刻停 |
| 2 | `has_next === false` | 提前一格停，省一次请求 |
| 3 | `page > 200` | 兜底：防止对方 `has_next` 永远 true 导致死循环 |

**为什么第 1 条排第一：** 因为它是**数据本身**，不是对方算出来的结论。`has_next` 是对方算的，可能算错；`data` 是对方给的，错不了。

**为什么必须有第 3 条：** 对方如果哪天把 `has_next` 写死成 `true`，你的循环会一直请求下去。**跑一晚上，把对方服务器打了 3 万次。** 这不是假设，这是真实发生的事故。

## 2.2 操作

新建 `fetch-pages.js`，先只写 page 这一种：

```javascript
// fetch-pages.js —— 三种分页各抓一遍
// 用法：node fetch-pages.js（mock-server 要在 3001 端口跑着）

const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3001";
const PAGE_SIZE = 10;
const MAX_PAGE = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function byPage() {
  const all = [];
  let page = 1;

  while (page <= MAX_PAGE) {
    const url = BASE + "/api/items?page=" + page + "&size=" + PAGE_SIZE;
    const res = await fetch(url);
    if (res.status !== 200) {
      throw new Error("第 " + page + " 页返回 HTTP " + res.status);
    }
    const body = await res.json();

    console.log("第 " + page + " 页：拿到 " + body.data.length + " 条，has_next=" + body.has_next);

    if (body.data.length === 0) {
      break;
    }

    all.push(...body.data);

    if (body.has_next === false) {
      break;
    }

    page += 1;
    await sleep(1000);
  }

  if (page > MAX_PAGE) {
    console.log("警告：到了硬上限 " + MAX_PAGE + " 页还没停，可能 has_next 有问题");
  }

  return all;
}

async function main() {
  const rows = await byPage();
  console.log("合计 " + rows.length + " 条");
  console.log("第一条 id=" + rows[0].id + "，最后一条 id=" + rows[rows.length - 1].id);

  const out = path.join(__dirname, "items-paged.json");
  fs.writeFileSync(out, JSON.stringify(rows, null, 2), "utf8");
  console.log("已保存:", out);
}

main();
```

## 2.3 屏幕上应该看到什么

```text
第 1 页：拿到 10 条，has_next=true
第 2 页：拿到 10 条，has_next=true
第 3 页：拿到 10 条，has_next=false
合计 30 条
第一条 id=1，最后一条 id=30
已保存: B:\OPC-Distance_study\...\collector\items-paged.json
```

**注意只有 3 次请求。** 因为第 3 页 `has_next=false` 就直接停了，**没有去请求第 4 页**。这省了一次请求。

**现在做一个对照实验，证明"只信 has_next"会出事：**

把 `if (body.has_next === false) break;` 这一行删掉，其它不动。跑：

```text
第 1 页：拿到 10 条，has_next=true
第 2 页：拿到 10 条，has_next=true
第 3 页：拿到 10 条，has_next=false
第 4 页：拿到 0 条，has_next=false
合计 30 条
```

**数据还是对的**（因为第 4 页是空的，加进去等于没加），**但多发了一次请求。** 这就是"多请求一次"的代价 —— 数据没错，但你在浪费对方的资源，也在浪费自己的时间。

**再做一个实验，证明"只信空数组"也有问题：**

把 `if (body.has_next === false) break;` 删掉，同时把 `if (body.data.length === 0)` 也删掉，只留 `page += 1` 和 `MAX_PAGE`：

```text
第 1 页：拿到 10 条，has_next=true
...
第 200 页：拿到 0 条，has_next=false
警告：到了硬上限 200 页还没停，可能 has_next 有问题
合计 30 条
```

**这就是没有终止条件的后果：200 次请求，其中 196 次是白请求。** 而且如果 `MAX_PAGE` 是 100000，你的脚本会跑到天亮。

## 2.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 一直抓到 0 条 | `page` 从 0 开始试的 | 这个接口从 1 开始，看第 1 步的 curl 输出 |
| 数据里有重复 | 页码从 0 开始但你从 1 开始，或反过来 | 打印每页第一条的 `id`，看有没有重叠 |
| 只有 20 条 | `has_next` 在第 2 页是 false（对方算错） | 这就是"不能只信 has_next"的理由 |
| `throw: 第 4 页返回 HTTP 500` | 对方服务出问题了 | 这个 throw 是对的，让它报出来 |

---

# 第 3 步：offset / limit 分页（15 分钟）

## 3.1 做什么 / 为什么

**做什么：** 用 `offset` 和 `limit` 抓一遍，终止条件是"拿到的少于 limit 条"。

**为什么要学这个：** 因为很多接口没有"页码"，只有"跳过多少条" —— 尤其是数据库直出的接口（`LIMIT 10 OFFSET 20` 就是 SQL 语句）。

**它和 page 分页的关系：**

```text
page=3&size=10  等价于  offset=20&limit=10
公式：offset = (page - 1) * size
```

**终止信号不同：** offset 分页通常没有 `has_next`，你只能靠"这一页给够了没有"判断：

```text
拿到 10 条（= limit）  → 可能还有，继续
拿到 6 条（< limit）   → 到底了，停
拿到 0 条              → 到底了，停
```

## 3.2 操作

在 `fetch-pages.js` 里加一个函数：

```javascript
async function byOffset() {
  const all = [];
  let offset = 0;

  while (offset <= MAX_PAGE * PAGE_SIZE) {
    const url = BASE + "/api/items-offset?offset=" + offset + "&limit=" + PAGE_SIZE;
    const res = await fetch(url);
    if (res.status !== 200) {
      throw new Error("offset=" + offset + " 返回 HTTP " + res.status);
    }
    const body = await res.json();

    console.log("offset=" + offset + "：拿到 " + body.data.length + " 条");

    if (body.data.length === 0) {
      break;
    }

    all.push(...body.data);

    if (body.data.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
    await sleep(1000);
  }

  return all;
}
```

在 `main` 里调用它：

```javascript
async function main() {
  const rows = await byPage();
  console.log("page 分页合计 " + rows.length + " 条");

  const rows2 = await byOffset();
  console.log("offset 分页合计 " + rows2.length + " 条");

  const same = JSON.stringify(rows.map((r) => r.id)) === JSON.stringify(rows2.map((r) => r.id));
  console.log("两种方式拿到的 id 序列一致吗：" + same);

  const out = path.join(__dirname, "items-paged.json");
  fs.writeFileSync(out, JSON.stringify(rows, null, 2), "utf8");
  console.log("已保存:", out);
}
```

## 3.3 屏幕上应该看到什么

```text
第 1 页：拿到 10 条，has_next=true
第 2 页：拿到 10 条，has_next=true
第 3 页：拿到 10 条，has_next=false
page 分页合计 30 条
offset=0：拿到 10 条
offset=10：拿到 10 条
offset=20：拿到 10 条
offset=30：拿到 0 条
offset 分页合计 30 条
两种方式拿到的 id 序列一致吗：true
```

**注意 offset 多请求了一次**（`offset=30` 拿到 0 条），因为最后一页刚好满 10 条，**代码不知道后面还有没有，只能再问一次**。

**这是 offset 分页的必然代价：** 你不知道总数时，必须多问一次才能确认到底了。如果接口返回了 `total`，可以算出来：

```javascript
const totalPages = Math.ceil(body.total / PAGE_SIZE);   // 30/10 = 3
```

**但这个算法有个前提：抓的过程中数据不会增删。** 第 2 步那个"用 has_next 提前停"其实也是在赌同一个假设。**真实项目里，两个都用：先用 total 算，再用空数组兜底。**

## 3.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `offset 分页合计 20 条` | `offset += PAGE_SIZE` 写成了 `offset += 1` | 打印每次请求的 `offset` 看 |
| 有重复数据 | 抓到一半对方插入了新数据，后面的整体后移 | 这就是 cursor 分页存在的理由（第 4 步） |
| 一直请求到上限 | `body.data.length < PAGE_SIZE` 判断写反了 | 是"少于 limit 就停"，不是"等于就停" |

---

# 第 4 步：cursor 分页（20 分钟）

## 4.1 做什么 / 为什么

**做什么：** 用 `cursor` 抓一遍，终止条件是 `next_cursor === null`。

**为什么需要第三种分页：** 因为前两种都有一个致命问题 —— **数据在抓的过程中会变。**

**举个具体的例子：**

```text
你要抓 30 条，用 offset 分页。
你抓完第 1 页（offset=0，拿到 id 1—10）。
这时对方删掉了 id 5。
你抓第 2 页（offset=10），返回的是原来的 id 12—21。
→ id 11 被你漏掉了。
```

**为什么会漏：** 因为 `offset` 是"从开头数第几个"，前面少了一个，后面就整体前移一位。

**cursor 分页不数位置，只认"上一条是谁"：**

```text
第 1 页：cursor=0    → 返回 id 1—10，next_cursor=10
第 2 页：cursor=10   → 返回 id 11—20，next_cursor=20
```

**"给我 id 大于 10 的接下来 10 条"** —— 中间删了谁都不影响，因为你锚定的是 id，不是位置。

**代价：** cursor 分页通常**不能跳到第 5 页**，只能一页一页往下翻。对采集来说这不是问题（我们本来就顺序抓），对用户界面就是问题（用户想跳页）。

## 4.2 操作

再加一个函数：

```javascript
async function byCursor() {
  const all = [];
  let cursor = 0;
  let round = 0;

  while (round < MAX_PAGE) {
    round += 1;
    const url = BASE + "/api/items-cursor?cursor=" + cursor + "&limit=" + PAGE_SIZE;
    const res = await fetch(url);
    if (res.status !== 200) {
      throw new Error("cursor=" + cursor + " 返回 HTTP " + res.status);
    }
    const body = await res.json();

    console.log("第 " + round + " 轮：cursor=" + cursor + " 拿到 " + body.data.length + " 条，next_cursor=" + body.next_cursor);

    if (body.data.length === 0) {
      break;
    }

    all.push(...body.data);

    if (body.next_cursor === null) {
      break;
    }

    cursor = body.next_cursor;
    await sleep(1000);
  }

  return all;
}
```

`main` 改成三种都跑：

```javascript
async function main() {
  const rows = await byPage();
  console.log("page 分页合计 " + rows.length + " 条");

  const rows2 = await byOffset();
  console.log("offset 分页合计 " + rows2.length + " 条");

  const rows3 = await byCursor();
  console.log("cursor 分页合计 " + rows3.length + " 条");

  const ids1 = rows.map((r) => r.id).join(",");
  const ids2 = rows2.map((r) => r.id).join(",");
  const ids3 = rows3.map((r) => r.id).join(",");
  console.log("三种方式结果一致：" + (ids1 === ids2 && ids2 === ids3));

  const out = path.join(__dirname, "items-paged.json");
  fs.writeFileSync(out, JSON.stringify(rows, null, 2), "utf8");
  console.log("已保存:", out);
}
```

## 4.3 屏幕上应该看到什么

```text
第 1 页：拿到 10 条，has_next=true
第 2 页：拿到 10 条，has_next=true
第 3 页：拿到 10 条，has_next=false
page 分页合计 30 条
offset=0：拿到 10 条
offset=10：拿到 10 条
offset=20：拿到 10 条
offset=30：拿到 0 条
offset 分页合计 30 条
第 1 轮：cursor=0 拿到 10 条，next_cursor=10
第 2 轮：cursor=10 拿到 10 条，next_cursor=20
第 3 轮：cursor=20 拿到 10 条，next_cursor=null
cursor 分页合计 30 条
三种方式结果一致：true
```

**三种方式、三次实现、同一个结果。** 这个"一致"的校验很重要 —— 它证明你三种分页都写对了，而不是"碰巧条数一样"。

## 4.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 一直请求同一页 | 忘了 `cursor = body.next_cursor` | 看每轮的 `cursor` 值有没有变 |
| 无限循环 | 判断写成了 `body.next_cursor === undefined` | 接口给的是 `null`，用 `=== null` |
| 少了 1 条 | cursor 用了 `>=` 而不是 `>` | 服务端逻辑是 `id > cursor`，这是标准做法 |
| 三种结果不一致 | 其中一种写错了 | **不要放过这个 false**，逐个打印 id 对比 |

---

# 第 5 步：断点续抓（20 分钟）

## 5.1 做什么 / 为什么

**做什么：** 把"抓到第几页"写进 `state.json`，下次启动时从那里接着抓。

**为什么需要：** 因为真实采集会中断，而且中断的原因都不是你的错：

```text
网断了
电脑睡眠了
对方 429 了
你按了 Ctrl+C
公司下班了你要关机
```

**5000 条要抓 83 分钟（第 71 节算过）。83 分钟里出一次意外，很正常。**

**没有断点续抓：从头再来。** 你已经抓了 4000 条，重跑一遍又是 83 分钟，而且前面 4000 条要重新请求一遍 —— 这是对对方服务器的浪费，也是最容易被封的行为。

**有断点续抓：从第 401 页接着抓。** 17 分钟搞定。

## 5.2 操作

**1.** 加两个函数：

```javascript
const STATE_FILE = path.join(__dirname, "state.json");

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { source: "items", next_page: 1, last_id: 0, done: false };
  }
  const raw = fs.readFileSync(STATE_FILE, "utf8");
  return JSON.parse(raw);
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}
```

**2.** 把 `byPage` 改成支持从中间开始：

```javascript
async function byPage(startPage) {
  const all = [];
  let page = startPage;

  while (page <= MAX_PAGE) {
    const url = BASE + "/api/items?page=" + page + "&size=" + PAGE_SIZE;
    const res = await fetch(url);
    if (res.status !== 200) {
      throw new Error("第 " + page + " 页返回 HTTP " + res.status);
    }
    const body = await res.json();

    console.log("第 " + page + " 页：拿到 " + body.data.length + " 条，has_next=" + body.has_next);

    if (body.data.length === 0) {
      saveState({ source: "items", next_page: page, last_id: 0, done: true });
      break;
    }

    all.push(...body.data);

    const lastId = body.data[body.data.length - 1].id;
    saveState({ source: "items", next_page: page + 1, last_id: lastId, done: false });
    console.log("  已记录断点：next_page=" + (page + 1) + "，last_id=" + lastId);

    if (body.has_next === false) {
      saveState({ source: "items", next_page: page, last_id: lastId, done: true });
      break;
    }

    page += 1;
    await sleep(1000);
  }

  return all;
}
```

**3.** `main` 里读状态：

```javascript
async function main() {
  const state = loadState();
  console.log("读到断点：", state);

  if (state.done === true) {
    console.log("上次已经抓完了（done=true），要重抓就删掉 state.json");
    return;
  }

  const rows = await byPage(state.next_page);
  console.log("本次抓到 " + rows.length + " 条");
}

main();
```

## 5.3 屏幕上应该看到什么

**第一次跑：**

```text
读到断点： { source: 'items', next_page: 1, last_id: 0, done: false }
第 1 页：拿到 10 条，has_next=true
  已记录断点：next_page=2，last_id=10
第 2 页：拿到 10 条，has_next=true
  已记录断点：next_page=3，last_id=20
第 3 页：拿到 10 条，has_next=false
  已记录断点：next_page=4，last_id=30
本次抓到 30 条
```

**`state.json` 的内容：**

```json
{
  "source": "items",
  "next_page": 3,
  "last_id": 30,
  "done": true
}
```

**再跑一次：**

```text
读到断点： { source: 'items', next_page: 3, last_id: 30, done: true }
上次已经抓完了（done=true），要重抓就删掉 state.json
```

**模拟中断：** 在第 2 页抓完后按 `Ctrl + C`，然后 `type state.json`：

```json
{
  "source": "items",
  "next_page": 3,
  "last_id": 20,
  "done": false
}
```

**再跑：**

```text
读到断点： { source: 'items', next_page: 3, last_id: 20, done: false }
第 3 页：拿到 10 条，has_next=false
  已记录断点：next_page=4，last_id=30
本次抓到 10 条
```

**从第 3 页接着抓，只发了 1 次请求。** 这就是断点续抓的全部价值。

**两个设计决定要知道为什么：**

| 决定 | 为什么 |
|---|---|
| 每页抓完就写 `state.json`，不是全部抓完才写 | 因为"全部抓完"这个时刻可能永远不到；每页写完最多丢一页 |
| 同时记 `next_page` 和 `last_id` | `next_page` 给 page 分页用，`last_id` 给 cursor 分页用。两种分页共用一份状态文件 |

## 5.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 每次都从头抓 | `state.json` 没写成功，或 `loadState` 读的路径不对 | `dir state.json` 确认文件在哪 |
| `SyntaxError: Unexpected end of JSON input` | 上次在写文件时被 Ctrl+C 打断，文件只有一半 | 删掉 `state.json` 重抓；生产代码要写临时文件再改名 |
| 断点记错了页 | `next_page` 写成了 `page` | 抓完第 N 页，下一页是 N+1 |
| 想重新抓但被 `done` 拦住 | 逻辑正确 | `del state.json` 再跑 |

---

# 第 6 步：故意犯四个错（15 分钟）

## 错误 1：忘了 `page += 1`

**现象：** 终端每秒钟刷一行，全是同一页：

```text
第 1 页：拿到 10 条，has_next=true
第 1 页：拿到 10 条，has_next=true
第 1 页：拿到 10 条，has_next=true
...
```

**原因：** 循环变量没推进。你的 `while` 条件永远成立。

**怎么查：** 看日志里"第几页"有没有变。三行没变，就一定是有变量没推进。**这也是为什么日志里必须打印页码，而不是只打印"拿到了几条"。**

## 错误 2：把"最后一页刚好满页"当成"还有下一页"

**现象：** 多请求了一次，日志多一行 `第 4 页：拿到 0 条`。

**原因：** 用 `data.length === size` 判断"还有下一页"。数据刚好 30 条、每页 10 条时，第 3 页也是 10 条，所以你又去问了第 4 页。

**怎么查：** 这是"多一次请求"，不是错。**真正错的是反过来：用 `data.length < size` 判断"停了"** —— 如果最后一页刚好满页，你会漏掉它。

**规则：用"空数组"判断停，不要用"少于 limit"判断继续。** 前者永远对，后者依赖"最后一页不满"这个假设。

## 错误 3：页码从 1 开始，代码从 0 开始

**现象：** 抓了 31 条，第一条是 `id=30`（第 3 页的最后一条），后面才是 1—30：

```text
第一页返回：data=[{id:30,...}]     ← page=0 被当成 page=1 处理了
```

**原因：** 你没先 `curl` 看一眼 `page=0` 返回什么。

**怎么查：** 抓完立刻打印 `rows[0].id` 和 `rows[rows.length-1].id`。**如果第一条不是 1，说明页码基准错了。**

## 错误 4：断点文件里存了"当前页"，不是"下一页"

**现象：** 中断后重跑，第 3 页被抓了两遍，数据里出现 10 条重复。

**原因：** `state.json` 里存 `next_page: 2`（刚抓完的那页），恢复时又抓了一遍第 2 页。

**怎么查：** 看 `state.json` 的 `next_page` 和你最后一次看到的"第 N 页"是不是差 1。**规则：抓完第 N 页，存 N+1。**

**这条错误在第 76 节会变得更严重：** 如果你用 `INSERT`（不是 upsert），重复抓的那一页会在库里多出 10 条记录。

---

# 第 7 步：写学习笔记（10 分钟）

**打开 `第04节课/02-笔记/NOTES.md`，按这十一个小标题填，一个字都不要改。**

```markdown
# 第 74 节课学习笔记

## 一、三种分页的"指纹"

| 分页方式 | 返回里有哪些字段 | 我靠什么判断还有下一页 |
|---|---|---|
| page 参数 | | |
| offset / limit | | |
| cursor | | |

## 二、我的三个终止信号

| 优先级 | 信号 | 作用 |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |

## 三、为什么 `has_next` 不能全信

## 四、offset 和 page 的换算关系

`page=3&size=10` 等于 `offset=___&limit=___`

## 五、cursor 分页解决了什么问题

举一个"用 offset 会漏数据"的例子：

## 六、三种方式抓到的条数和 id 序列

| 方式 | 条数 | 第一条 id | 最后一条 id |
|---|---|---|---|
| page | | | |
| offset | | | |
| cursor | | | |

三种结果一致吗：

## 七、断点续抓的状态文件

我的 `state.json` 内容（贴一次抓完的）：

```json

```

为什么每页抓完就写，而不是全部抓完才写：

为什么同时记 `next_page` 和 `last_id`：

## 八、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 忘了 `page += 1` | | |
| 最后一页刚好满页 | | |
| 页码从 0 开始 | | |
| 断点存了当前页 | | |

## 九、第 74 节和第 76 节的关系

断点存错了，第 76 节会出什么事：

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] 三种分页各跑通过一次，都得到 30 条
- [ ] 我打印过每页第一条的 id，确认没有重叠
- [ ] 我中断过一次，并从断点续上了
- [ ] 我看过 `state.json` 的真实内容
- [ ] `items-paged.json` 里有 30 条
- [ ] 我做过去掉终止条件、看着它跑到上限的实验
```

---

# 第 8 步：课后练习

## 练习一：给 offset 分页加上"用 total 提前算页数"

接口返回了 `total`。改成先算 `totalPages = Math.ceil(total / PAGE_SIZE)`，然后 `while (offset < total * ...)` 循环，最后仍用"空数组"兜底。

**跑完对比：** 请求次数从 4 次变成几次？数据还是 30 条吗？

## 练习二：把三种分页抽成一个函数

现在有三个几乎一样的函数。改成：

```javascript
async function collect(fetchPage, getNext, isDone) { ... }
```

要求：**三种分页各写一个 5 行的配置**，循环只有一份。

**做完想一下：** 抽完是更好读了，还是更难读了？**如果只抓一种分页，该不该抽？**

## 练习三：断点续抓支持 cursor 分页

现在 `state.json` 里有 `last_id` 但没用上。改 `byCursor` 让它从 `state.json` 的 `last_id` 开始。

**要求：** 中断后重跑，日志显示的 `cursor` 应该等于上次的 `last_id`。

## 练习四：抓三页 HTML 也做断点续抓

第 73 节的 `/html` 也有分页（`?page=1..3`）。给 HTML 抓取加同样的 `state.json` 机制。

**注意：** 这次的检查点要放在每页，不是全文抓完。**一页结构不对，应该立刻停，不要继续抓第 2 页。**

## 练习五：用自己的话讲清

```text
1. 为什么"什么时候停"必须由抓的人定，而不是对方定？
2. 只用 has_next 判断会出什么事故？只用空数组判断会浪费什么？
3. offset 分页为什么会在"抓的过程中数据变了"时漏数据？cursor 为什么不漏？
4. 断点文件里为什么存"下一页"而不是"当前页"？
5. 断点文件被 Ctrl+C 写坏了，你的程序会怎样？该怎么防？
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出三种分页各自的终止信号
- [ ] 我能解释为什么 `has_next` 不能作为唯一判据
- [ ] 我知道 `page=3&size=10` 等价于 `offset=20&limit=10`
- [ ] 我能举一个"offset 会漏数据"的具体例子
- [ ] 我知道断点文件里该存"下一页"
- [ ] 我能说出硬上限（`MAX_PAGE`）防的是什么

## B. 实操

- [ ] `collector/fetch-pages.js` 三种分页都跑通，各 30 条
- [ ] 打印过每页条数和 `has_next`
- [ ] 三种方式的 id 序列校验输出 `true`
- [ ] `collector/state.json` 存在，`done` 字段正确
- [ ] 中断后重跑，从断点续上，只发了剩下的请求
- [ ] `collector/items-paged.json` 里有 30 条

## C. 排错

- [ ] 日志里页码不变时，我知道是循环变量没推进
- [ ] 数据条数不对时，我先打印每页第一条的 `id`
- [ ] `state.json` 读不出来时，我知道可能被写坏了
- [ ] 崩溃不出来的死循环，我知道加 `MAX_PAGE` 兜底

## D. 笔记

- [ ] 十一个小标题都在，顺序和课件一致
- [ ] 第一节三种分页的字段是我 `curl` 出来的
- [ ] 第七节贴了真实的 `state.json`
- [ ] "我还不懂的词"至少 2 个

## 本节课要能说出口的一句话

> **分页的关键不是循环，是终止条件：用"空数组"当主判据，用 `has_next` 省一次请求，用硬上限兜住死循环；断点文件记的是下一页，不是当前页。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 只抓到一页 | 循环变量有没有推进 | 日志里打印页码，看它变不变 |
| 数据条数少了 | 页码基准（0 还是 1） | 打印第一条 id |
| 数据条数多了、有重复 | 断点存成了当前页 | 抓完第 N 页存 N+1 |
| 一直请求不停止 | `has_next` 永远 true | 加 `MAX_PAGE` 硬上限 |
| 最后一页被漏掉 | 用"少于 limit"判断停 | 改成用"空数组"判断停 |
| cursor 一直是同一个值 | 忘赋值 | `cursor = body.next_cursor` |
| `next_cursor` 判断不生效 | 用了 `undefined` | 接口给的是 `null` |
| `state.json` 解析失败 | 写文件时被中断 | 删掉重抓；生产环境写临时文件再改名 |
| 请求次数比预期多 | 正常现象 | offset 分页必然多问一次 |
| `429` 中途出现 | 间隔太短 | 每页之间 `sleep(1000)` |
