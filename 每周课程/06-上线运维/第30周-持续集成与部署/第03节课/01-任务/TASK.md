# 第 206 节课：自动测试——测试不过不许合并

> 第 205 节课机器能挑出"写法可疑"的代码，但它不知道**你的功能对不对**。
> 这节课让机器记住"这个功能应该是什么行为"，然后每次改完都替你验证一遍。

**建议用时**：120 分钟
**你需要先完成**：第 205 节课（`check.yml` 能跑绿，`package.json` 里有 `check` 和 `lint` 脚本）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

**你验证功能的方式，是"跑起来点一遍"。**

```text
npm start
→ 打开浏览器
→ 注册
→ 登录
→ 发一条消息
→ 刷新，看还在不在
```

**这一套要 90 秒，而且必须你人在。**

## 0.2 你以后会遇到什么

```text
① 你改了"算价格"那个函数，改完只测了"加入购物车"，忘了测"结算" —— 上线后客户发现总价错了
② 你觉得自己只改了一个按钮颜色，结果把一个工具函数删了 —— 三个页面全挂
③ 凌晨两点改了个 bug，想赶紧上线，不想点 90 秒的验证 —— 直接推了，第二天发现更严重的问题
④ 半年后你想重构一个函数，但不敢动 —— 因为"不知道哪些地方在依赖它的行为"
⑤ 客户说"上个月还好好的"，你想不起上个月改了什么影响了这里
```

**这五个场景的共同点：**

```text
你需要的不是"更仔细"，是"有一个东西能替你把同样的检查做一千遍，而且每次结果一样"
```

## 0.3 今天要建立的三个概念

```text
① 断言（assert）：一句话描述"我期望什么"，不成立就报错
② 测试用例（test case）：一个"输入 → 期望输出"的完整场景
③ 测试运行器（test runner）：把一堆用例跑一遍、汇总结果、给出退出码
```

**第三个是接上一节课的：测试运行器最终也要输出一个退出码给 CI。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `src/price.js` | `ci-lab/src/` | 被测试的业务函数 |
| `test/price.test.js` | `ci-lab/test/` | 3 个测试用例 |
| `.github/workflows/test.yml` | `ci-lab/.github/workflows/` | 跑测试的 CI |
| 一个 `Merging is blocked` | PR 页面 | 测试红了真的合不进去 |

**最后一条今天必须亲眼看到。** 因为"测试不过不许合并"这句话，只有在你自己被拦住过一次之后才算真信。

---

# 第 1 步：先让代码可测（20 分钟）

## 1.1 为什么先要改代码

**你现在 `server.js` 里是这样的：**

```javascript
app.post('/api/order', (req, res) => {
  const items = req.body.items
  let total = 0
  for (const it of items) {
    total += it.price * it.qty
  }
  if (total > 100) {
    total = total * 0.9
  }
  total = total + 8
  res.json({ total })
})
```

**这段代码能不能测：能，但要启动一个 HTTP 服务、造一个请求、解析响应。**

**成本太高，测一次 5 秒。** 所以你不会测。

**问题不在"你懒"，在"这段代码把三件事揉在了一起"：**

```text
① 解析请求（HTTP 层）
② 算价格（业务逻辑）
③ 返回响应（HTTP 层）
```

**只有 ② 需要被反复测试。**

## 1.2 把业务逻辑抽出来

**新建 `src/price.js`：**

```javascript
export function calcTotal(items) {
  if (!Array.isArray(items)) {
    throw new TypeError('items 必须是数组')
  }

  let total = 0
  for (const item of items) {
    if (typeof item.price !== 'number' || typeof item.qty !== 'number') {
      throw new TypeError('price 和 qty 必须是数字')
    }
    total += item.price * item.qty
  }

  if (total > 100) {
    total = total * 0.9
  }

  return Math.round((total + 8) * 100) / 100
}
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `export function` | 导出，测试文件才能 `import` |
| `if (!Array.isArray(items))` | 类型不对就抛错，不返回 `undefined` |
| `throw new TypeError(...)` | 抛一个明确的错误，让调用方知道"你传错了" |
| `total > 100 → * 0.9` | 满 100 打九折 |
| `+ 8` | 固定运费 8 元 |
| `Math.round(x * 100) / 100` | 保留两位小数，避免 `0.1 + 0.2 = 0.30000000000000004` |

**为什么 `Math.round(... * 100) / 100` 而不是 `toFixed(2)`：**

```text
toFixed 返回的是字符串 "108.00"
后面再做加法会变成字符串拼接："108.00" + 8 = "108.008"
```

**这是钱相关代码里最常见的 bug 之一。** 记住：**钱用数字算，只在显示时转字符串。**

## 1.3 `server.js` 改成调用它

```javascript
import express from 'express'
import { calcTotal } from './src/price.js'

const app = express()
app.use(express.json())

app.post('/api/order', (req, res) => {
  try {
    const total = calcTotal(req.body.items)
    res.json({ total })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.listen(3000)
```

**逐段读改动：**

| 部分 | 意思 |
|---|---|
| `app.use(express.json())` | 没有这一行，`req.body` 永远是 `undefined` |
| `try / catch` | 业务函数抛错时，返回 400 而不是 500 |
| `res.status(400)` | 400 = 客户端传错了；500 = 服务端崩了 |

**400 和 500 的区别很关键：**

```text
400 → 是调用方的问题，重试没用，要改请求
500 → 是我的问题，要去查日志
```

**你把所有错误都返回 500，监控里就分不清"客户乱传"和"我真崩了"。**

## 1.4 可测的代码长什么样

**三个特征：**

| 特征 | 反例 | 正例 |
|---|---|---|
| 不依赖外部 | 函数里直接读 `process.env.KEY` | 参数传进来 |
| 不依赖当前时间 | `new Date()` 在函数里 | 时间当参数传进来 |
| 不做 IO | 函数里 `fetch()` 或查数据库 | 外面查好，传进来 |

**为什么：**

```text
测试要"可重复"
如果函数内部读了当前时间、随机数、网络
同一份输入可能得到不同结果 → 测试会时灵时不灵 → 没人信它
```

**这个原则叫"纯函数优先"。** 你不需要把所有代码都写成纯函数，但**核心的业务计算必须是纯的**。

**`calcTotal` 现在满足：输入 items，输出数字，其它什么都不碰。**

---

# 第 2 步：写第一个测试（20 分钟）

## 2.1 建目录和文件

**Node 20 自带测试运行器，不用装任何东西。**

```bash
mkdir -p test
```

**新建 `test/price.test.js`：**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcTotal } from '../src/price.js'

test('两个商品，总价 = 单价×数量 之和 + 运费', () => {
  const items = [
    { price: 10, qty: 2 },
    { price: 20, qty: 1 },
  ]
  assert.strictEqual(calcTotal(items), 48)
})
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `import test from 'node:test'` | 引入内置测试运行器的 `test` 函数 |
| `import assert from 'node:assert/strict'` | 引入断言，**注意 `/strict`** |
| `import { calcTotal } from '../src/price.js'` | 引入被测函数，路径相对当前文件 |
| `test('描述', () => {})` | 定义一个测试用例 |
| `assert.strictEqual(实际值, 期望值)` | 断言两个值严格相等 |

**算一下这个断言对不对：**

```text
10 × 2 = 20
20 × 1 = 20
小计 = 40
40 > 100 ? 不成立 → 不打折
40 + 8 = 48
```

**所以期望值是 48。**

**为什么 `assert/strict` 而不是 `assert`：**

```text
assert.equal(1, '1')          → 通过（宽松，会转类型）
assert/strict 的 equal 就是 strictEqual → 不通过
```

**用 `/strict` 之后，`assert.equal` 自动变成严格相等。** 这样你就不会不小心用了宽松版本。

**这是一个"默认就安全"的选择。** 和 ESLint 的 `eqeqeq` 一个道理。

## 2.2 跑起来

**两种跑法，先试直接的：**

```bash
node --test
```

**应该看到：**

```text
▶ 两个商品，总价 = 单价×数量 之和 + 运费 (0.8ms)
✔ 两个商品，总价 = 单价×数量 之和 + 运费 (0.9ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 52.3
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `▶ 名字 (0.8ms)` | 用例开始 |
| `✔ 名字 (0.9ms)` | 用例通过，耗时 0.9 毫秒 |
| `ℹ tests 1` | 一共 1 个用例 |
| `ℹ pass 1` | 通过 1 个 |
| `ℹ fail 0` | 失败 0 个 |
| `ℹ duration_ms 52.3` | 总耗时 52 毫秒 |

**为什么总耗时 52ms 但用例只有 0.9ms：**

```text
52ms 包含：启动 Node、加载模块、扫描文件、打印报告
0.9ms 才是你的代码真正跑的时间
```

**这个区别以后有用：** 测试从 50ms 涨到 300ms，可能不是你的测试变慢了，是加载的东西变多了。

## 2.3 `node --test` 怎么找到测试文件

**你没告诉它测哪个文件，它自己找的。**

**默认规则（以 Node 20 为准，版本不同可能微调）：**

```text
① 文件名匹配 **/*.test.js / *.test.mjs / *.test.cjs
② 文件名匹配 **/*-test.js / *_test.js / test-*.js
③ 文件名正好是 test.js
④ test/ 目录下的所有 .js 文件
```

**你的文件是 `test/price.test.js`，同时满足 ① 和 ④。**

**这带来一个陷阱：**

```text
如果 test/ 下有一个 helper.js（不是测试，是工具函数）
它也会被当成测试文件跑
跑完发现 0 个用例 → 报"没有测试"
```

**解决办法（两种）：**

```text
① helper 放到 test/ 外面，比如 test-utils/
② helper 命名成 _helper.js（下划线开头的文件会被跳过？—— 不，这不成立）
```

**正确做法是 ①：辅助文件不要放在 `test/` 里。**

**或者显式指定目录：**

```bash
node --test test/price.test.js
```

**指定文件最稳，但每次加测试都要改命令。** 用通配符：

```bash
node --test test/*.test.js
```

**注意：`test/*.test.js` 这个通配符在 Windows 的 cmd 里不会展开。** 它会原样传给 Node。

**所以结论是：**

```text
用 node --test 让它自动扫描（跨平台）
辅助文件不要放在 test/ 里
```

## 2.4 写进 `npm test`

**`package.json`：**

```json
  "scripts": {
    "check": "node scripts/check-syntax.mjs",
    "lint": "eslint . --max-warnings=0",
    "test": "node --test"
  },
```

**跑：**

```bash
npm test
```

**应该看到：**

```text
> ci-lab@1.0.0 test
> node --test

▶ 两个商品，总价 = 单价×数量 之和 + 运费 (0.7ms)
✔ 两个商品，总价 = 单价×数量 之和 + 运费 (0.8ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ duration_ms 48.1
```

**为什么必须包一层 `npm test`：**

```text
① CI 里写 npm test，和本地完全一致
② 以后要加 --test-reporter、--experimental-test-coverage，只改一处
③ 别人（或者半年后的你）看 package.json 就知道怎么跑
```

**第 205 节课已经说过这个原则，这里再强化一次：**

> **`package.json` 的 `scripts` 是你项目的"标准动作清单"。** 不在里面的操作，都是"只有你记得怎么做的操作"。

---

# 第 3 步：把三个测试写全（25 分钟）

## 3.1 一个测试该测什么

**三个层次，从易到难：**

```text
① 正常路径：给正确的输入，得到正确的输出
② 边界情况：0、空数组、刚好等于阈值
③ 错误输入：类型不对、缺字段、null
```

**新手只写 ①。** 但 bug 绝大部分在 ② 和 ③。

## 3.2 测试二：空数组

**追加到 `test/price.test.js`：**

```javascript
test('空数组，只收运费', () => {
  assert.strictEqual(calcTotal([]), 8)
})
```

**算一遍：**

```text
items 为空 → 循环不执行 → total = 0
0 > 100 ? 不成立 → 不打折
0 + 8 = 8
```

**这个测试防的是什么：**

```text
有人把 "if (total > 100)" 改成 "if (total >= 0)"
→ 空购物车也会打折 → 这个测试立刻红
```

**注意：一个测试只断言一件事。** 这样失败时你知道"是这一件事坏了"，不用猜。

## 3.3 测试三：刚好在阈值上

**追加：**

```javascript
test('总价正好 100，不打折（必须大于 100 才打折）', () => {
  const items = [{ price: 100, qty: 1 }]
  assert.strictEqual(calcTotal(items), 108)
})
```

**算一遍：**

```text
100 × 1 = 100
100 > 100 ? 不成立 → 不打折
100 + 8 = 108
```

**为什么专门测 100 这个值：**

```text
> 和 >= 差一个字符
这个测试把"规则到底是哪个"钉死在代码里
以后有人改成 >=，CI 立刻红，他会看到这个测试的名字，就知道"这是产品规则，不是笔误"
```

**这就是测试的第二重价值：**

> **它不只是"验证代码对不对"，它还是"记录产品规则"的地方。**

**三个月后你忘了"满 100 到底含不含 100"，测试名会告诉你。**

## 3.4 测试四：错误输入

**追加：**

```javascript
test('传非数组，抛 TypeError', () => {
  assert.throws(() => calcTotal('not an array'), {
    name: 'TypeError',
    message: 'items 必须是数组',
  })
})
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `assert.throws(fn, expected)` | 断言 `fn` 会抛错 |
| `() => calcTotal(...)` | **必须包成函数**，不能直接调用 |
| `{ name, message }` | 断言错误的类型和消息 |

**为什么必须包成函数：**

```javascript
assert.throws(calcTotal('x'))     // ❌ 这会先执行 calcTotal，抛出未捕获的异常，测试直接崩
assert.throws(() => calcTotal('x')) // ✅ 把调用交给 assert，让它来执行
```

**这是一条非常常见的错误。** 记住：**`assert.throws` 要的是"一个会抛错的函数"，不是"抛错的结果"。**

**为什么连 `message` 一起断言：**

```text
只断言 TypeError → 有人把消息改成英文，测试还是过，但你的前端提示文案变了
连 message 一起断言 → 消息一改就红，逼你确认"这是有意改的吗"
```

**代价：** 改文案会红一次。**这个代价是值得的，因为它提醒你"这是对外接口"。**

## 3.5 测试五：一个异步的（为下一节铺路）

**假设你以后要给订单加"查汇率"，那就是异步的。**

**先在 `src/price.js` 里加一个异步函数：**

```javascript
export async function calcTotalWithRate(items, rateProvider) {
  const rate = await rateProvider()
  return Math.round(calcTotal(items) * rate * 100) / 100
}
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `async` | 返回 Promise |
| `rateProvider` | **把"怎么拿汇率"变成参数** |
| `await rateProvider()` | 调用它，等结果 |

**为什么把 `rateProvider` 当参数传：**

```text
如果函数内部写 fetch('https://api.exchange.com/...')
→ 测试要联网 → CI 里可能连不上 → 测试时灵时不灵
→ 而且每次跑都在花钱调 API

传进来 → 测试时传一个"永远返回 7.2"的假函数 → 0 毫秒、不联网、结果固定
```

**这个技巧叫"依赖注入"，是让代码可测的最重要一招。**

**测试：**

```javascript
test('按汇率换算，异步', async () => {
  const fakeRate = async () => 7.2
  const result = await calcTotalWithRate([{ price: 10, qty: 1 }], fakeRate)
  assert.strictEqual(result, 129.6)
})
```

**算一遍：**

```text
calcTotal([{price:10, qty:1}]) = 10 + 8 = 18
18 × 7.2 = 129.6
```

**注意两处 `async` / `await`：**

```text
test('...', async () => { ... })     ← 测试函数本身要 async
await calcTotalWithRate(...)          ← 等结果
```

**如果漏了 `await` 会怎样：这个第 6 步会专门讲，它是"假绿"的头号来源。**

## 3.6 跑全部

```bash
npm test
```

**应该看到：**

```text
▶ 两个商品，总价 = 单价×数量 之和 + 运费 (0.6ms)
✔ 两个商品，总价 = 单价×数量 之和 + 运费 (0.7ms)
▶ 空数组，只收运费 (0.2ms)
✔ 空数组，只收运费 (0.3ms)
▶ 总价正好 100，不打折（必须大于 100 才打折）
✔ 总价正好 100，不打折（必须大于 100 才打折） (0.2ms)
▶ 传非数组，抛 TypeError
✔ 传非数组，抛 TypeError (0.4ms)
▶ 按汇率换算，异步
✔ 按汇率换算，异步 (0.5ms)

ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ duration_ms 61.7
```

**5 个用例，61 毫秒。**

**对比一下：你手动点一遍要 90 秒。这个 61 毫秒可以跑 1475 遍。**

**而且它不需要你人在。**

## 3.7 一个测试失败长什么样

**把 `calcTotal` 里的 `total + 8` 改成 `total + 10`（模拟"改错了"）。**

```bash
npm test
```

**应该看到：**

```text
✔ 两个商品，总价 = 单价×数量 之和 + 运费 (0.6ms)
✖ 两个商品，总价 = 单价×数量 之和 + 运费 (0.9ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  50 !== 48

      at TestContext.<anonymous> (file:///.../test/price.test.js:10:10)
      ...

ℹ tests 5
ℹ pass 1
ℹ fail 4
ℹ duration_ms 58.2
```

**（这里有两个同名条目，是因为报告器先打"开始"再打"结果"，你的终端可能是分段显示的。）**

**逐行读：**

| 行 | 意思 |
|---|---|
| `✖ 名字` | 这个用例失败了 |
| `AssertionError [ERR_ASSERTION]` | 错误类型：断言失败 |
| `Expected values to be strictly equal` | 说明：期望严格相等 |
| `50 !== 48` | **实际值 50，期望值 48** |
| `at TestContext.<anonymous>` | 出错位置在测试函数的匿名回调里 |
| `price.test.js:10:10` | 你的测试文件的第 10 行 |
| `fail 4` | 4 个失败 |

**`50 !== 48` 的读法：**

```text
左边是"实际算出来的"
右边是"你期望的"
```

**这和很多断言库相反（有些是 expected/actual 反的）。**

**Node 的格式是 `实际 !== 期望`。** 记住这一点，能省你很多"看反了"的时间。

**注意：一个改动导致 4 个测试红了。**

```text
因为 5 个测试里，只有"传非数组"那个不涉及总价计算
其它 4 个都算总价
```

**这就是测试的第三个价值：它告诉你"这个改动影响了几处"。**

**现在改回来：**

```bash
git checkout src/price.js
npm test
```

**应该看到 5 个全绿。**

---

# 第 4 步：写进 CI（20 分钟）

## 4.1 单独的 `test.yml`

**为什么单独一个文件，不塞进 `check.yml`：**

| 理由 | 说明 |
|---|---|
| 职责清楚 | check 管"代码写法"，test 管"功能对不对" |
| 失败好定位 | 列表上直接看到是哪个 workflow 红 |
| 可以分别卡 | 有些项目允许 lint 警告，但不允许测试失败 |
| 以后能加矩阵 | 测 Node 18/20/22 三个版本 |

**代价是每次 push 要多开一台机器。** 对你这个规模，值得。

**新建 `.github/workflows/test.yml`：**

```yaml
name: test

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

jobs:
  test:
    name: 单元测试
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: 下载仓库代码
        uses: actions/checkout@v4

      - name: 安装 Node 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 安装依赖
        run: npm ci

      - name: 跑测试
        run: npm test
```

**这个文件和 `check.yml` 几乎一样，只有最后一步不同。**

**为什么允许这种"重复"：**

```text
两个 workflow 本来就该独立
如果合并成一个，你想"只重跑测试"就做不到
```

**以后要抽公共部分，用"复合 action"（第 7 节课会提一句），现在别抽。**

## 4.2 `cache: 'npm'` 依赖什么

**`cache: 'npm'` 会去找一个锁文件。**

**它找的顺序：**

```text
package-lock.json  →  npm 的
npm-shrinkwrap.json
yarn.lock          →  yarn 的
```

**你必须有其中一个。**

**如果都没有，`setup-node` 会直接失败：**

```text
Error: Dependencies lock file is not found in /home/runner/work/ci-lab/ci-lab. Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `Dependencies lock file is not found` | 找不到锁文件 |
| `/home/runner/work/ci-lab/ci-lab` | 它在哪个目录找的 |
| `Supported file patterns: ...` | 它接受哪几种文件名 |

**为什么要有锁文件才能缓存：**

```text
缓存的 key 是"锁文件内容的哈希"
锁文件没变 → 依赖没变 → 可以复用上次的 node_modules
锁文件变了 → key 变了 → 重新装
```

**没有锁文件，就没有"判断依赖有没有变"的依据，所以它干脆拒绝缓存。**

**这个设计是对的：** 否则会用一份过期的缓存跑测试，得到假结果。

**怎么修：**

```bash
npm install
git add package-lock.json
git commit -m "补上锁文件"
git push
```

**验证锁文件在仓库里：**

```bash
git ls-files | grep lock
```

**应该看到：**

```text
package-lock.json
```

**⚠️ 一个常见错误：`package-lock.json` 被 `.gitignore` 忽略了。**

**检查：**

```bash
grep -n "lock" .gitignore
```

**如果有输出（比如 `package-lock.json`），说明它被忽略了。** 删掉那一行。

**为什么有人忽略锁文件：**

```text
老观念：锁文件是"本地生成的临时文件"
这在"库"项目里有点道理
在"应用"项目里是错的 —— 应用必须锁死依赖版本
```

**你做的是应用，不是给别人用的库。所以锁文件必须进仓库。**

## 4.3 push 看结果

```bash
git add .
git commit -m "第206节课：加单元测试和 CI"
git push
```

**Actions 页面会出现两个 workflow 同时在跑：**

```text
check   ✅
test    ✅
```

**点开 `test`：**

```text
Jobs
  单元测试 ✅   28s
```

**点进去看日志：**

```text
Run npm test
  npm test
  shell: /usr/bin/bash -e {0}

> ci-lab@1.0.0 test
> node --test

▶ 两个商品，总价 = 单价×数量 之和 + 运费 (0.6ms)
...
ℹ tests 5
ℹ pass 5
ℹ fail 0
ℹ duration_ms 61.7
```

**注意：CI 里的输出可能和本地不太一样。**

**如果看到的是这种格式：**

```text
TAP version 13
# Subtest: 两个商品，总价 = 单价×数量 之和 + 运费
ok 1 - 两个商品，总价 = 单价×数量 之和 + 运费
  ---
  duration_ms: 0.7
  ...
1..1
# tests 5
# pass 5
# fail 0
```

**那是 TAP 格式。**

**为什么不一样：**

```text
Node 默认的 reporter 是 "spec"
但它会检测"当前是不是终端（TTY）"
不是终端（比如 CI 的日志）时，会退回 TAP
```

**想强制用好看的格式：**

```json
    "test": "node --test --test-reporter=spec"
```

**`--test-reporter=spec` 强制用 spec 格式，不管是不是终端。**

**我建议加上。** 因为 CI 日志是给人看的，TAP 里的 `ok 1 - xxx` 和 `# pass 5` 读起来累。

## 4.4 矩阵测试（了解即可）

**同一个项目要支持多个 Node 版本时：**

```yaml
jobs:
  test:
    name: Node ${{ matrix.node }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ['18', '20', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm test
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `strategy.matrix.node` | 定义三个值，job 会跑三次 |
| `${{ matrix.node }}` | 每次取一个 |
| `fail-fast: false` | 一个版本失败，其它继续跑完（默认是失败就取消其它） |

**`fail-fast: false` 为什么重要：**

```text
默认 true：Node 18 失败 → 立刻取消 20 和 22
你只知道"18 挂了"，不知道"20 和 22 好不好"
```

**什么时候用矩阵：**

```text
① 你写了一个库，要给很多人用
② 你的生产环境 Node 版本和本地不同
③ 你想知道"升级 Node 会不会挂"
```

**你现在不需要。** 但知道有这么个东西，以后看到 `Node 18 / 20 / 22` 三行绿的截图不会懵。

**⚠️ 矩阵会成倍消耗额度。** 三个版本 = 三次完整安装 + 三次测试。

---

# 第 5 步：让测试真的拦住合并（25 分钟）

## 5.1 先看清"没拦住"是什么样

**现状：测试红了，然后呢？**

```text
你可以继续 push
你可以直接点 Merge（如果你开了 PR）
没有任何东西阻止你
```

**这就是"红着也能合"。**

**它的后果不是"这次上线有问题"，而是：**

```text
第一次红着合 → 你心里有点不安
第二次红着合 → 你开始习惯
第十次红着合 → CI 变成"那个经常红的装饰品"，没人看
```

**半年后你的 CI 是这样的：**

```text
❌ check    ❌ test    ❌ build    ✅ deploy
```

**四个红一个绿，而网站还在跑。** 因为部署那一步根本没检查前面。

**这时候 CI 已经死了。** 它还在跑，还在花钱，但没有提供任何信息。

## 5.2 开分支保护

**路径：**

```text
仓库 → Settings → Branches → Add branch protection rule
```

**填：**

| 字段 | 填什么 |
|---|---|
| `Branch name pattern` | `main` |
| `Require a pull request before merging` | 勾上 |
| `Require approvals` | 不勾（你一个人） |
| `Require status checks to pass before merging` | 勾上 |
| 搜索框 | 选 `单元测试` 和 `语法检查 + 代码规范` |
| `Require branches to be up to date before merging` | 勾上 |

**最后一项是什么意思：**

```text
勾上：PR 分支必须先合并 main 的最新代码，再跑一次 CI
不勾：分支只要"曾经"绿过就行
```

**为什么建议勾上：**

```text
你和 main 都改了同一个文件 → 各自 CI 都绿
合并后可能冲突或逻辑打架
"up to date" 强制你先合一下 main 再验证
```

**代价：** 每次 main 有新提交，你的 PR 要重新跑一遍 CI。

**你一个人做产品，可以勾上。** 因为冲突的概率比团队低，但一旦冲突，没人帮你发现。

## 5.3 走一遍完整的"被拦住"

**这一步必须自己走，看别人截图不算。**

**第 1 步：开分支**

```bash
git checkout -b test/broken
```

**第 2 步：故意改错 `src/price.js`**

```javascript
  if (total > 100) {
    total = total * 0.5
  }
```

**（九折改成五折）**

**第 3 步：提交并推**

```bash
git add src/price.js
git commit -m "故意改错折扣"
git push -u origin test/broken
```

**第 4 步：开 PR**

**页面上会出现一个黄色横条：**

```text
test/broken had recent pushes less than 1 minute ago    [Compare & pull request]
```

**点它，填标题，点 `Create pull request`。**

**第 5 步：等 CI**

**PR 页面底部：**

```text
⏳ Some checks haven't completed yet
   2 in progress
```

**等 40 秒，变成：**

```text
❌ Some checks were not successful
   1 failing, 1 successful

   Details

🔒 Merging is blocked
   Merging can be performed automatically once the requested changes are addressed.
```

**第 6 步：看按钮**

**右下角绿色的 `Merge pull request` 变成了灰色，鼠标放上去是禁止符号。**

**这就是"被拦住"。**

**第 7 步：点 `Details` 进去看是哪一步**

```text
❌ 单元测试 — Failing after 25s
```

**点进去看日志：**

```text
✖ 两个商品，总价 = 单价×数量 之和 + 运费 (1.1ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  33 !== 48

ℹ fail 4
Error: Process completed with exit code 1.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `33 !== 48` | 实际 33（五折后 20+8），期望 48 |
| `fail 4` | 4 个用例红了 |
| `exit code 1` | 测试运行器以失败退出 |
| `Failing after 25s` | 跑了 25 秒后判定失败 |

**第 8 步：修好，看它变绿**

```javascript
  if (total > 100) {
    total = total * 0.9
  }
```

```bash
git add src/price.js
git commit -m "改回九折"
git push
```

**等 30 秒，PR 页面：**

```text
✅ All checks have passed
   2 successful checks

[Merge pull request]   ← 按钮变绿了
```

**第 9 步：合并**

**点 `Merge pull request` → `Confirm merge` → `Delete branch`。**

**然后本地：**

```bash
git checkout main
git pull
git branch -d test/broken
```

**`git branch -d` 和 `-D` 的区别：**

```text
-d  只在"已合并"时删除，安全
-D  强制删除，未合并也删（会丢提交）
```

**用 `-d`。** 它拒绝的时候，说明你有东西没合进去。

## 5.4 "红着也能合"会怎样（一个真实推演）

**假设你没开分支保护，某天测试红了，你想着"这个测试是老问题了，先合"。**

**接下来会发生什么：**

```text
第 1 天：红着合了。你记得这件事。
第 3 天：又红了。你想着"上次也合了"，合了。
第 10 天：你已经不看 CI 了，因为"反正一直是红的"。
第 30 天：真的出了一个 bug，测试也红了。但你没看，因为"红是常态"。
第 45 天：客户报了一个问题。你去看测试，发现有一个红了的用例，名字正好描述了这个问题。
         它红了 15 天。
```

**测试的价值不在"它能发现问题"，在"它发现问题时你会看"。**

**一旦"红"变成常态，它就归零了。**

**所以：测试红了，只有两个选择。**

```text
① 修代码，让它绿
② 删掉这个测试，并且写下"为什么不测这个"
```

**没有第三个选项叫"先合了"。**

---

# 第 6 步：故意犯八个错（25 分钟）

## 错误 1：没有锁文件却开了缓存

**操作：**

```bash
rm package-lock.json
git add -A
git commit -m "删掉锁文件"
git push
```

**会怎样：**

**`setup-node` 那一步直接失败：**

```text
Run actions/setup-node@v4
  with:
    node-version: 20
    cache: npm
    cache-dependency-path: **/package-lock.json
Error: Dependencies lock file is not found in /home/runner/work/ci-lab/ci-lab. Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `with:` 下面三行 | action 收到的参数（GitHub 自动打印） |
| `cache-dependency-path: **/package-lock.json` | 它在找这个模式 |
| `Dependencies lock file is not found` | 没找到 |
| `Supported file patterns: ...` | 它接受这三种 |

**为什么：**

```text
缓存的 key = 锁文件内容的哈希
没有锁文件 → 算不出 key → 不知道"这份缓存对应哪个依赖状态" → 拒绝缓存
```

**怎么修：**

```bash
npm install
git add package-lock.json
git commit -m "恢复锁文件"
git push
```

**为什么这一步最容易在"新项目第一次配 CI"时踩到：**

```text
你本地 npm install 过，锁文件在
但你 `.gitignore` 里可能有一行 package-lock.json
或者你 commit 时用 `git add *.js` 只加了代码
```

**自查：**

```bash
git ls-files | grep -c "package-lock.json"
```

**输出 `1` 才说明它在仓库里。`0` 就是没加。**

## 错误 2：测试文件没被识别

**操作：** 把 `test/price.test.js` 改名成 `test/price.js`。

```bash
mv test/price.test.js test/price.js
git add -A
git commit -m "改个名字"
git push
```

**会怎样：**

**这一步是绿的，但日志里：**

```text
ℹ tests 0
ℹ pass 0
ℹ fail 0
```

**或者：**

```text
Could not find any test files
```

**（Node 版本不同，提示不同。有的版本直接以 0 退出，有的报错。）**

**为什么：**

```text
test/price.js 在 test/ 目录下，应该被规则 ④ 匹配到
但某些版本只扫 test/ 下"看起来像测试"的文件
```

**更常见的情况是：你把测试文件放到了 `src/` 下，叫 `price.js`。**

**那时候它完全不会被当成测试 —— 0 个用例，绿勾。**

**这是最危险的失败方式：不是红，是"什么都没测"却显示绿。**

**怎么发现：**

```bash
npm test 2>&1 | grep -E "tests|pass|fail"
```

**看到 `tests 0` 就是没找到。**

**怎么修（三条规则，记住）：**

```text
① 文件名必须包含 .test. / -test. / _test. ，或者以 test- 开头
② 或者放在 test/ 目录下
③ 最容易记的：一律用 xxx.test.js
```

**额外一条：在 CI 里加一个"必须有测试"的保护。**

**在 `test.yml` 最后加一步：**

```yaml
      - name: 确认测试数量不为 0
        run: |
          OUT=$(npm test 2>&1)
          echo "$OUT"
          echo "$OUT" | grep -qE "tests [1-9]" || { echo "没有任何测试被跑，CI 拒绝通过"; exit 1; }
```

**这段有点绕，逻辑是：**

```text
① 跑测试并抓到输出
② 打印输出（否则日志里看不到）
③ 如果输出里没有 "tests 1" 到 "tests 9" 这种 → 报错退出
```

**为什么要这么做：**

> **"0 个测试通过"和"5 个测试通过"在退出码上是一样的（都是 0）。**

**这种"空跑"是 CI 里最隐蔽的失效模式。**

## 错误 3：异步测试忘了 `await`（假绿 No.1）

**操作：**

```javascript
test('按汇率换算，异步', async () => {
  const fakeRate = async () => 7.2
  const result = calcTotalWithRate([{ price: 10, qty: 1 }], fakeRate)
  assert.strictEqual(result, 129.6)
})
```

**（去掉了 `await`）**

**会怎样：**

```text
✖ 按汇率换算，异步 (1.2ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  Promise { <pending> } !== 129.6
```

**这个还好，会红。**

**真正危险的是这种：**

```javascript
test('按汇率换算，异步', async () => {
  const fakeRate = async () => 7.2
  const result = await calcTotalWithRate([{ price: 10, qty: 1 }], fakeRate)
  assert.strictEqual(result, 129.6)
  await checkSomethingElse()   // ← 忘了 await
})
```

**或者更常见：**

```javascript
test('写数据库', () => {          // ← 忘了 async
  saveToDb({ id: 1 })            // ← 返回 Promise，没人等
  assert.ok(true)                // ← 永远通过
})
```

**会怎样：绿。**

**为什么：**

```text
测试函数同步返回 → 运行器认为"这个用例结束了，通过"
而那个 Promise 还在后台跑
跑失败了也没人看（未处理的 Promise 拒绝，在 Node 20 里会打印警告，但不一定让测试失败）
```

**这个错误叫"假绿"，是测试里最贵的一种 bug：**

```text
你以为测了，其实没测
而且它会一直绿，直到线上出事
```

**怎么防（三条）：**

```text
① 任何涉及 Promise 的测试，函数必须是 async
② 任何 await 表达式前面必须有 await（废话，但真的会忘）
③ 跑完看日志里的用例耗时：如果异步测试耗时 0ms，很可疑
```

**怎么查出一堆漏 `await` 的地方：**

**ESLint 有一条规则专门管这个：`require-await`。**

**加进配置：**

```javascript
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'eqeqeq': ['error', 'always'],
      'no-console': 'off',
      'require-await': 'error',
    },
```

**`require-await` 报的是"你标了 async 但里面没有 await"。**

**它抓不到"忘了 await 某个调用"（那是 `no-floating-promises`，需要 TypeScript 的类型信息）。**

**但 `require-await` 能抓到一半。** 加上。

## 错误 4：`assert.equal` 用了宽松比较

**操作：**

```javascript
import assert from 'node:assert'        // ← 不是 /strict

test('价格返回值是数字', () => {
  assert.equal(calcTotal([]), '8')      // ← 字符串 '8'
})
```

**会怎样：**

**绿。**

**因为 `assert.equal` 是 `==`，`8 == '8'` 成立。**

**为什么这是灾难：**

```text
你的 API 返回了字符串 "8"
前端拿去算 total + 5，得到 "85" 而不是 13
测试一直绿，因为测试自己也宽松
```

**怎么修：**

```javascript
import assert from 'node:assert/strict'
```

**改一行，`assert.equal` 就变成严格相等。**

**或者显式用：**

```javascript
assert.strictEqual(calcTotal([]), 8)
```

**我建议两个都做：**

```text
import 用 /strict（默认安全）
关键断言显式写 strictEqual（读的人不用想）
```

**顺带记一下三个最常用的断言：**

| 断言 | 比什么 |
|---|---|
| `strictEqual(a, b)` | `a === b`，用于数字、字符串、布尔 |
| `deepStrictEqual(a, b)` | 结构和值都相等，用于对象、数组 |
| `throws(fn, expected)` | 会不会抛错、抛什么错 |

**`strictEqual` 比对象会失败：**

```javascript
assert.strictEqual({ a: 1 }, { a: 1 })
// AssertionError: Expected values to be strictly equal:
// 两个对象永远不 === （比的是引用）
```

**比对象要用 `deepStrictEqual`。**

## 错误 5：测试依赖了真实环境

**操作：** 把那个 `rateProvider` 改成直接联网：

```javascript
export async function calcTotalWithRate(items) {
  const res = await fetch('https://api.exchange.com/latest?base=USD&symbols=CNY')
  const data = await res.json()
  return Math.round(calcTotal(items) * data.rates.CNY * 100) / 100
}
```

**测试里：**

```javascript
test('按汇率换算', async () => {
  const result = await calcTotalWithRate([{ price: 10, qty: 1 }])
  assert.ok(result > 0)
})
```

**会怎样（本地可能过，CI 里挂）：**

```text
✖ 按汇率换算 (5002.1ms)
  FetchError: request to https://api.exchange.com/latest failed, reason: getaddrinfo ENOTFOUND api.exchange.com

ℹ fail 1
Error: Process completed with exit code 1.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `5002.1ms` | 卡了 5 秒才失败（在等 DNS 超时） |
| `ENOTFOUND` | DNS 查不到这个域名 |
| `api.exchange.com` | 就是我编的那个域名，真实不存在 |

**即使域名是真实的，也会遇到：**

```text
① 那个 API 那天挂了 → 你的 CI 红，但你代码没问题
② 那个 API 限流 → 你的 CI 随机红
③ 那个 API 收费 → 你每跑一次 CI 都在花钱
④ 那个 API 的返回变了 → 你的测试红，但业务没变
⑤ 你在 CI 里没配密钥 → 401
```

**这五种情况，没有一种是"你的代码有 bug"。**

**但它们都会让 CI 变红，然后你就开始无视红色。**

**怎么修：把外部依赖变成参数（第 3.5 节的 `rateProvider`）。**

**如果实在要测真实的网络请求，有专门的工具（比如 `nock` 拦截 HTTP），但那是进阶内容。**

**你现在只要记住这条原则：**

> **单元测试不联网、不连数据库、不读真实文件。** 需要外部数据，就用参数传进来。

## 错误 6：`npm test` 里写了 `|| true`

**操作：**

```json
    "test": "node --test || true"
```

**会怎样：**

**永远绿。永远。**

**为什么：**

```text
node --test 失败 → 退出码 1
|| true → 执行 true → 退出码 0
npm 看到 0 → 认为脚本成功 → 以 0 退出
CI 看到 0 → 绿
```

**这个错误的变体（都要查）：**

```json
"test": "node --test; exit 0"
"test": "node --test || echo '测试挂了但先不管'"
"test": "node --test | tee test.log"
```

**第三种最隐蔽** —— 管道让退出码变成 `tee` 的（第 205 节课讲过）。

**怎么查：**

```bash
grep -n '"test"' package.json
```

**肉眼检查这一行里有没有 `||`、`;`、`|`。**

**怎么修：**

```json
    "test": "node --test --test-reporter=spec"
```

**干净的一行，没有任何修饰。**

**⚠️ 一个例外：** 有些项目会写成

```json
"test": "node --test || node --test --test-reporter=tap"
```

**这是"格式不支持时降级"，不是"掩盖失败"。** 但它也有问题：第一次失败的声音会被第二次覆盖。

**你现在不需要任何这种写法。**

## 错误 7：测试之间互相影响

**操作：** 写两个测试，共享一个模块级变量：

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'

let counter = 0

test('加一', () => {
  counter += 1
  assert.strictEqual(counter, 1)
})

test('再加一', () => {
  counter += 1
  assert.strictEqual(counter, 2)
})
```

**单独跑：绿。**

**跑全部：绿。**

**但如果你改了执行顺序，或者某个测试失败提前退出：**

```text
第二个测试会看到 counter = 0 → 期望 2 → 红
而这个红和"业务逻辑坏了"长得一模一样
```

**为什么这是灾难：**

```text
① 测试顺序变了 → 结果变了 → 测试不可信
② 某个测试挂了 → 后面的全挂 → 你不知道真正的问题在哪
③ 并行跑（Node 默认在文件级别并行）→ 顺序不可控
```

**怎么修：每个测试自己准备数据。**

```javascript
test('加一', () => {
  let counter = 0
  counter += 1
  assert.strictEqual(counter, 1)
})
```

**原则：**

> **一个测试的通过与否，不能依赖另一个测试有没有跑过。**

**这条原则叫"测试隔离"。** 它比"测试覆盖率"重要得多。

**一个真实项目里的写法（用 `beforeEach`）：**

```javascript
import { test, beforeEach } from 'node:test'

let db

beforeEach(() => {
  db = new Map()   // 每个测试前重置
})
```

**`beforeEach` 是"每个测试跑之前执行一次"。** 还有 `afterEach`、`before`、`after`。

**你现在用不到，但要知道这个工具存在。** 一旦你发现自己开始写 `let xxx = ...` 在文件顶层，就该想到它。

## 错误 8：改了实现，测试全红

**操作：** 你重构了 `calcTotal`，把内部改成"先加运费再打折"：

```javascript
export function calcTotal(items) {
  let subtotal = 0
  for (const item of items) {
    subtotal += item.price * item.qty
  }
  let total = subtotal + 8
  if (subtotal > 100) {
    total = total * 0.9
  }
  return Math.round(total * 100) / 100
}
```

**会怎样：**

```text
✖ 两个商品，总价 = 单价×数量 之和 + 运费
  AssertionError: 48.8 !== 48
```

**48.8 = (40 + 8) × 0.9**

**这个改动是对是错？**

```text
如果产品规则是"商品小计满 100 打九折，运费不参与打折" → 原实现对
如果产品规则是"含运费的总价满 100 打九折" → 新实现对
```

**测试替你把这个分歧暴露出来了。**

**这就是测试最重要的一次对话：**

```text
代码说"我改了"
测试说"你改的不是我记录的那个规则"
你来说"哪个对"
```

**如果没有这个测试，这个改动会静默上线，然后在某个月的账单里被发现。**

**怎么处理：**

```text
① 确认产品规则（问自己/问客户）
② 如果新实现是对的 → 改测试的期望值，并在提交信息里写清"规则变了"
③ 如果原实现是对的 → 改回代码
```

**⚠️ 绝对不要做的事：**

```text
看到红 → 直接把期望值改成实际值 → 绿
```

**这叫"用测试迁就 bug"。** 它会让你的测试变成"记录当前行为"，而不是"记录正确行为"。

**判断标准：**

```text
改期望值之前，你能不能说出"为什么新值是对的"？
说不出来 → 你不该改。
```

---

# 第 7 步：写学习笔记（10 分钟）

**把下面的模板复制到 `02-笔记/NOTES.md`，然后填空。**

````markdown
# 第 206 节课学习笔记

## 一、为什么要把业务逻辑从 `server.js` 抽出来

抽之前测一个功能要：

抽之后测一个功能要：

差多少倍：

## 二、可测的代码有哪三个特征

1.
2.
3.

## 三、我的三个测试

| 测试名 | 输入 | 期望输出 | 防的是什么 bug |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

## 四、`assert` 的三种写法

| 断言 | 比什么 | 什么时候用 |
|---|---|---|
| `strictEqual` | | |
| `deepStrictEqual` | | |
| `throws` | | |

为什么 `import assert from 'node:assert/strict'` 比 `node:assert` 安全：

## 五、`node --test` 怎么找到测试文件

它默认扫哪些文件名（写出三种）：

1.
2.
3.

我踩过的"0 个测试但绿勾"：

## 六、我的 `test.yml`

贴完整内容：

```yaml

```

`cache: 'npm'` 依赖哪个文件：

没有它会报什么（贴原文）：

## 七、测试失败长什么样

贴一次真实的失败输出：

```text

```

Node 的 `实际 !== 期望` 里，哪边是实际：

## 八、分支保护

我开了吗：

配置了哪几个 required check：

`Merging is blocked` 我看到了吗：

被拦住的时候我在想什么：

## 九、八个错误

| 错误 | 现象（红还是假绿） | 根本原因 | 怎么查 |
|---|---|---|---|
| 没锁文件 | | | |
| 测试文件没识别 | | | |
| 忘 `await` | | | |
| `assert.equal` 宽松 | | | |
| 依赖真实网络 | | | |
| `\|\| true` | | | |
| 测试互相影响 | | | |
| 改实现测试全红 | | | |

## 十、假绿的三种来源

1.
2.
3.

我以后怎么防：

## 十一、我还不懂的词

-
-

## 十二、完成检查

- [ ] 我把 `calcTotal` 抽到了独立文件，`server.js` 只是调用它
- [ ] 我写了至少 3 个测试（正常 / 边界 / 错误）
- [ ] 我写了一个 async 测试，并且有 `await`
- [ ] `npm test` 本地 5 个全绿
- [ ] CI 里 `test` workflow 跑出了绿勾
- [ ] 我故意改错，看到过红的测试，并且看懂了 `实际 !== 期望`
- [ ] 我在 PR 上被 `Merging is blocked` 拦住过
- [ ] 我知道"0 个测试通过"也是一个绿勾
````

---

# 第 8 步：课后练习

## 练习一：给"折扣边界"再补三个测试

**要求：**

1. 补 `99.99` 元（不打折）；
2. 补 `100.01` 元（打折）；
3. 补一个小数价格（`{ price: 33.33, qty: 3 }`）。

**记录：** 三个实际值分别是多少？和你手算的一样吗？

**思考题：** `33.33 × 3 = 99.99`，再加 8 是 107.99，要不要打折？你的实现怎么判断的？

## 练习二：制造一次"假绿"然后抓住它

**要求：**

1. 写一个测试，函数是 `async` 但漏了 `await`；
2. 确认它是绿的；
3. 在 CI 里加"确认测试数量不为 0"那一步；
4. 想另一个办法抓住它（提示：看耗时）。

**记录：** 你用什么信号发现它是假的？

**思考题：** 如果一个假绿测试的耗时是 0ms，而真测试是 5ms，这个差异能不能自动化检测？

## 练习三：把测试改成"测行为不测实现"

**要求：**

1. 现在你的测试断言 `calcTotal([]) === 8`；
2. 有人把实现改成"运费从配置读"，默认 8；
3. 你的测试还过吗？
4. 如果不过，说明你测的是实现还是行为？

**记录：** 你的测试在什么改动下"不该红但红了"？

**思考题：** "测行为"和"测实现"的界线在哪？

## 练习四：跑一次完整的"被拦住"

**要求：**

1. 开分支 → 改错 → 推 → 开 PR；
2. 截图 `Merging is blocked`；
3. 修好 → 绿 → 合并 → 删分支；
4. 全程不用 `--force`、不直接推 main。

**记录：** 从开分支到合并，一共几步？

**思考题：** 如果这次改动只是改一个错别字，你还会走这个流程吗？为什么？

## 练习五：算一次测试的时间成本

**要求：**

1. 记录 `npm test` 本地耗时；
2. 记录 CI 里 `test` job 的总耗时；
3. 拆开看：checkout / setup-node / npm ci / test 各多少；
4. 算"测试本身"占多少百分比。

**记录：** 表格。

**思考题：** 如果测试只占 15%，剩下 85% 是环境准备，你该优化什么？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清"断言"和"测试用例"的区别
- [ ] 我知道测试运行器最后输出的是**退出码**，不是"报告"
- [ ] 我知道单元测试不许联网、不连数据库
- [ ] 我知道"0 个测试通过"也是绿勾
- [ ] 我知道"测行为"和"测实现"的差别

## B. 实操

- [ ] 业务逻辑在 `src/price.js`，`server.js` 只做 HTTP 层
- [ ] `test/price.test.js` 里至少 3 个用例，覆盖正常/边界/错误
- [ ] 有一个 `async` 测试，里面有 `await`
- [ ] `package.json` 的 `test` 脚本是干净的一行，没有 `||`、`;`、`|`
- [ ] `.github/workflows/test.yml` 跑出过绿勾
- [ ] 配了 `cache: 'npm'`，并且仓库里有 `package-lock.json`

## C. 排错

- [ ] 我见过 `Dependencies lock file is not found in ...`
- [ ] 我见过 `tests 0` 的假绿
- [ ] 我见过 `AssertionError [ERR_ASSERTION]` 和 `实际 !== 期望`
- [ ] 我见过 `ENOTFOUND`（测试联网导致）
- [ ] 我知道 `assert.throws` 的第一个参数必须是函数

## D. 交付

- [ ] 我在 PR 上被 `Merging is blocked` 拦住过一次
- [ ] 我的分支保护里 required check 包含 `单元测试`
- [ ] 我从分支合并到 main，没有直接推 main
- [ ] 合并后删掉了分支

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 贴了自己的 3 个测试和 `test.yml`
- [ ] "假绿的三种来源"写了真实内容

## 本节课要能说出口的一句话

> **测试不过不许合并，靠的不是"我记得看"，是分支保护里的 required check；而测试本身最容易骗人的地方，是"它根本没跑"和"它跑了但没等结果"。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `Dependencies lock file is not found` | 没有锁文件 / 被 gitignore | `npm install` 后提交 `package-lock.json` |
| `tests 0` 但绿勾 | 测试文件没被识别 | 命名成 `xxx.test.js` 或放 `test/` |
| `Could not find any test files` | 同上 | 同上 |
| `Promise { <pending> } !== 129.6` | 忘了 `await` | 测试函数 `async` + `await` |
| 异步测试 0ms 就过了 | 假绿，Promise 没等 | 同上；加 `require-await` 规则 |
| `assert.equal(1, '1')` 过了 | 用了非 strict 版本 | `import assert from 'node:assert/strict'` |
| `Expected values to be strictly equal` 但看起来相等 | 比的是对象引用 | 用 `deepStrictEqual` |
| `assert.throws` 导致测试直接崩 | 传了调用结果不是函数 | `assert.throws(() => fn())` |
| `ENOTFOUND` / `ECONNREFUSED` | 测试里联网了 | 把依赖变成参数，注入假实现 |
| 测试单独跑过、全跑挂 | 测试之间共享状态 | 每个测试自己准备数据 |
| 改了实现，4 个测试全红 | 正常，说明覆盖面够 | 确认规则，再决定改代码还是改测试 |
| `Merging is blocked` 但检查都绿 | 有别的 required check 没过 | 点 `Details` 看全部 |
| 搜不到 job 名 | 还没跑过 | 先跑一次再选 |
| `exit code 1` 但日志里没有 fail | 可能是 setup 阶段失败 | 往上滚，看 `Run npm ci` 那一步 |
| 测试耗时突然翻倍 | 依赖变多了 / 缓存没命中 | 看 `Post 安装 Node 20` 有没有存缓存 |
