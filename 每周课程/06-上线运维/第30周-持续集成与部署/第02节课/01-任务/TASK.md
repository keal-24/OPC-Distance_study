# 第 205 节课：代码检查——让机器挑毛病

> 第 204 节课你让机器打印了一句话。这节课让它**真的看你的代码**。
> 机器不会累、不会"今天心情好就算了"、不会因为赶时间就放过一个拼写错误。这正是你要的。

**建议用时**：110 分钟
**你需要先完成**：第 204 节课（`ci-lab` 里有 `hello.yml`，能跑出绿勾，有 `package.json` 和 `package-lock.json`）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你会自己检查代码，靠三样东西：

```text
① VS Code 里那些红色波浪线（但不一定准，也不一定全）
② 眼睛扫一遍
③ 跑起来看看会不会崩
```

**这三样加起来，能挡住大概一半的问题。**

## 0.2 你以后会遇到什么

```text
① 你写了一个变量叫 usreName，用它的时候写成 userName —— 不报错，值永远是 undefined
② 你在一个函数里声明了 const data，另一个函数里也声明了 const data —— 作用域不同，没报错，但你读代码时搞混了
③ 你删了一个 import，但那行还留着 —— 没用到，不报错，但读的人以为它有用
④ 你写了 if (x = 1) 而不是 if (x === 1) —— 语法合法，逻辑全错
⑤ 一个 400 行的文件，你改了第 200 行，顺手把第 80 行的分号删了 —— 没人发现，三个月后合并冲突时才发现
```

**这五个，运行时都不会崩。** 它们会在某天变成一个"查了三小时"的 bug。

## 0.3 今天要建立的三个概念

```text
① 语法检查（syntax check）：代码能不能被解析，不执行
② 静态检查（lint）：不运行代码，靠规则找出"可疑写法"
③ 退出码（exit code）：CI 判断"成功/失败"的唯一依据
```

**第三个是今天的地基。** 前两个都是工具，第三个是"工具怎么把结论告诉机器"。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `eslint.config.mjs` | `ci-lab/` 根目录 | ESLint 的配置文件 |
| `.github/workflows/check.yml` | `ci-lab/.github/workflows/` | 跑两项检查的工作流 |
| 一次红色 ❌ | Actions 页面 | 必须亲眼见过一次失败 |

**注意最后一行：今天必须看到红。**

**只看过绿勾的人，永远不知道"失败长什么样"，出事时也认不出来。**

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **你的 Windows 电脑 + 浏览器里的 GitHub。** |
| **用哪个终端** | **Git Bash** + 浏览器。 |
| **现在在哪个目录** | <code>cd "B:/OPC-Distance_study/每周课程/06-上线运维/第30周-持续集成与部署/第01节课/03-练习代码/ci-lab"</code><br>（整个第 30 周共用这一个目录） |
| **本节新建什么** | `eslint.config.mjs`<br>`.github/workflows/check.yml` |

## 开工前先跑这一条

确认你没站错地方：

```bash
ls -a
```

**应该看到：**

```text
.
..
.git
.github
package.json
package-lock.json
```

**必须看到 `.git` 和 `.github`。**

## 如果不对

**没有 `.git`** → 第 1 节没 `git init`，回去补。

**没有 `.github`** → 第 1 节的 workflow 没建，回第 204 节第 2 步。

---

# 第 1 步：先在本地跑通（20 分钟）

## 1.1 为什么先在本地跑

**因为 CI 一次要等 30 秒到 2 分钟，本地只要 2 秒。**

**在本地把命令调通，再搬进 CI。** 反过来做，你会把"命令本身写错"和"CI 环境不同"两个问题搅在一起。

## 1.2 准备一个能检查的文件

**`ci-lab` 现在只有一个 `package.json`。加一个真文件。**

**操作：**

1. 打开 `ci-lab`；
2. 新建 `server.js`；
3. 敲：

```javascript
const express = require('express')

const app = express()
const port = 3000

app.get('/', (req, res) => {
  res.send('hello')
})

app.listen(port, () => {
  console.log(`listening on ${port}`)
})
```

**这是第 3 周那个 `chat-app` 的骨架。** 你今天只检查它，不运行它。

## 1.3 第一项检查：`node --check`

**这条命令回答一个问题：这个文件的语法，Node 能不能读懂。**

```bash
node --check server.js
```

**应该看到：什么都没有。**

**没有输出就是成功。** 这很反直觉，但要习惯：

```text
Unix 的传统：成功就闭嘴，失败才说话
```

**验证它真的在工作。** 故意加一个语法错误：

```javascript
const express = require('express')

const app = express()
const port = 3000

app.get('/', (req, res) => {
  res.send('hello'
})
```

**（少了一个右括号）**

**再跑：**

```bash
node --check server.js
```

**应该看到：**

```text
/b/OPC-Distance_study/.../ci-lab/server.js:7
  res.send('hello'
          ^

SyntaxError: missing ) after argument list
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `server.js:7` | 问题在第 7 行 |
| `res.send('hello'` | 把那一行抄给你看 |
| `^` | 指在第 8 个字符的位置 |
| `SyntaxError` | 错误类型：语法错误 |
| `missing ) after argument list` | 少了一个右括号 |

**`^` 指的位置经常不是"错在哪"，而是"读到哪儿发现不对"。**

**这里它在 `'hello'` 后面发现不对，因为参数列表没闭合。真正的错是下一行少了个 `)`。**

**这一条很重要：看报错不要只看行号，要看它说"缺什么"。**

**修回来：**

```bash
git checkout server.js
```

**`git checkout 文件名` 是什么：** 把这个文件恢复成上次提交的样子。**未提交的改动会丢。**

**⚠️ 注意：** 这条命令会**直接丢掉你未提交的修改，不进回收站**。用之前先 `git status` 看一眼。

## 1.4 `node --check` 能查什么、不能查什么

**能查：**

```text
少括号、少引号、少逗号
关键字拼错（fucntion）
不合法的语法结构
```

**不能查：**

```text
变量名拼错（usreName）—— 语法合法
用了没定义的变量 —— 语法合法
if (x = 1) —— 语法合法，是赋值
少 import 一个模块 —— 语法合法（运行时才会报错）
```

**为什么：**

```text
--check 只做"解析"这一步
它把文件变成语法树，成功就退出
它不执行、不分析、不推断
```

**所以 `node --check` 是第一道门，不是唯一一道门。**

## 1.5 一个立刻会遇到的坑：ESM 文件

**在 `ci-lab/package.json` 里，`type` 字段现在是没有的（默认 CommonJS）。**

**现在把 `server.js` 改成 ESM 写法：**

```javascript
import express from 'express'

const app = express()
app.get('/', (req, res) => res.send('ok'))
app.listen(3000)
```

**跑：**

```bash
node --check server.js
```

**应该看到：**

```text
/b/OPC-Distance_study/.../ci-lab/server.js:1
import express from 'express'
^^^^^^

SyntaxError: Cannot use import statement outside a module
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `server.js:1` | 第 1 行 |
| `^^^^^^` | 指出问题在 `import` 这个词上 |
| `Cannot use import statement outside a module` | "你不能在模块外面用 import" |

**"模块"是什么：**

```text
CommonJS（老写法）：require() / module.exports
ES Module（新写法）：import / export
```

**Node 默认把 `.js` 当 CommonJS。** 你写 `import`，它不认识。

**两种修法：**

**修法一：改 `package.json`（推荐，新项目就这么干）**

```json
{
  "name": "ci-lab",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "check": "node --check server.js"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
```

**`"type": "module"` 这一行，让所有 `.js` 都按 ES Module 解析。**

**修法二：把文件改成 `.mjs`**

```bash
mv server.js server.mjs
node --check server.mjs
```

**`.mjs` 后缀永远按 ES Module 处理，不管 `package.json` 怎么写。**

**注意：** 加了 `"type": "module"` 之后，你原来用 `require()` 的文件会全部报错：

```text
ReferenceError: require is not defined in ES module scope, you can use import instead
```

**这是一个"全有或全无"的开关。** 老项目升级时，要么全改，要么用 `.cjs` 后缀保住老文件。

**今天的选择：用 `"type": "module"`。** 因为新代码都该用 `import`。

## 1.6 把检查写进 `npm scripts`

**为什么写进 `scripts`：**

```text
① 短：npm run check，不用记 node --check server.js
② 一致：CI 里跑的命令和本地跑的一模一样
③ 可组合：以后 npm run check 可以变成"检查所有文件"
```

**改 `package.json`：**

```json
{
  "name": "ci-lab",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "check": "node --check server.js"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
```

**跑：**

```bash
npm run check
```

**应该看到：**

```text
> ci-lab@1.0.0 check
> node --check server.js
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `> ci-lab@1.0.0 check` | npm 告诉你"我要跑 `ci-lab` 这个包的 `check` 脚本" |
| `> node --check server.js` | 实际执行的命令 |

**没有第三行，说明成功。**

**这一步的价值：**

```text
从现在起，"怎么检查语法"这个知识，存在 package.json 里
不在你的脑子里，也不在某个文档里
```

**第 3 节课会继续往 `scripts` 里加 `test`，第 4 节课加 `build`。** 你的项目慢慢就有了"标准动作"。

---

# 第 2 步：装 ESLint（25 分钟）

## 2.1 ESLint 是干什么的

**一句话：它按你定的规则，读你的代码，找出"可疑但不违法"的写法。**

**举个例子：**

```javascript
if (x = 1) { }        // 语法合法，但 99% 是笔误
const data = 1        // 声明了 data 但从来没读过
function f(a, a) { }  // 两个同名参数
```

**这三行 Node 都不会报错。ESLint 会。**

## 2.2 安装

**版本会变，以你装到的那一版为准。**

```bash
npm install -D eslint @eslint/js globals
```

**逐项读：**

| 包 | 干什么 |
|---|---|
| `eslint` | 主程序，提供 `npx eslint` 命令 |
| `@eslint/js` | 官方提供的"推荐规则集"（一堆规则名打包在一起） |
| `globals` | 一份"哪些名字是全局变量"的清单（`console`、`process`、`require`…） |

**`-D` 是什么：** `--save-dev`，装到 `devDependencies`。

**为什么要分 `dependencies` 和 `devDependencies`：**

```text
dependencies      → 生产环境要用的（express）
devDependencies   → 只有开发和 CI 要用的（eslint）

部署时可以用 npm ci --omit=dev 只装前者，镜像能小几十 MB
```

**⚠️ 一个连带后果：** 如果你在 CI 里跑 `npm ci --omit=dev`，然后再 `npx eslint .`，会报：

```text
sh: 1: eslint: not found
```

**因为 ESLint 被你省略掉了。** 第 6 个错误会专门讲这个。

**装完看 `package.json`：**

```json
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "eslint": "^9.17.0",
    "globals": "^15.14.0"
  }
```

**`^` 是什么：** 允许升级到"不改变第一位数字"的版本。`^9.17.0` 允许 `9.18.1`，不允许 `10.0.0`。

**为什么要有它：** 让你能拿到安全补丁，又不会某天突然跳大版本把配置搞崩。

## 2.3 写配置文件（这是 ESLint 9 的新格式）

**ESLint 9 换了一套配置格式，叫 flat config。**

**网上大量教程还是老格式 `.eslintrc.json`，那些在 ESLint 9 里已经不默认生效了。**

**新建 `eslint.config.mjs`：**

```javascript
import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'eqeqeq': ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
]
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `import js from '@eslint/js'` | 引入官方推荐规则集 |
| `import globals from 'globals'` | 引入全局变量清单 |
| `export default [ ... ]` | **flat config 就是一个数组**，每项是一段配置 |
| `js.configs.recommended` | 第一段：官方推荐规则 |
| `files: [...]` | 第二段只对 `.js` / `.mjs` 生效 |
| `ecmaVersion: 2022` | 按 2022 年的语法标准解析 |
| `sourceType: 'module'` | 按 ES Module 解析（允许 `import`） |
| `globals.node` | 告诉 ESLint"`process`、`console`、`require` 是存在的" |
| `rules` | 具体规则的开关 |
| `ignores` | 这些目录不检查 |

**为什么文件名是 `.mjs` 不是 `.js`：**

```text
eslint.config.js  → 如果 package.json 有 "type": "module"，它是 ESM
                  → 如果没有，它是 CommonJS，你写的 import 会报错
eslint.config.mjs → 永远是 ESM，不管 package.json 怎么写
```

**用 `.mjs` 是"不用想"的选择。**

## 2.4 四条规则，逐条讲

**`'no-unused-vars': 'warn'`**

```text
声明了但没用过的变量 → 警告
为什么是 warn 不是 error：
  开发时经常先写个变量留着后面用
  设成 error 会天天红，人会开始无视警告
```

**`'no-undef': 'error'`**

```text
用了没定义的变量 → 错误
为什么是 error：
  这基本一定是 bug。打错字、忘了 import、作用域搞错
```

**`'eqeqeq': ['error', 'always']`**

```text
强制用 === 不用 ==
为什么：
  '1' == 1      → true（自动转类型）
  '1' === 1     → false
  null == undefined → true
  null === undefined → false
  这些转换规则反直觉，是 bug 温床
```

**`'no-console': 'off'`**

```text
允许用 console.log
为什么关掉：
  它的默认建议是"生产代码不要 console"
  你一个人做产品，console.log 是最快的排查手段
  等你有正经日志系统了再打开（第 223 节课）
```

**`warn` 和 `error` 的区别很关键：**

| 级别 | 退出码 | CI 会不会红 |
|---|---|---|
| `off` | 0 | 不会 |
| `warn` | **0** | **不会** |
| `error` | 非 0 | **会** |

**这一条今天会反复用到。** 很多人以为"有警告就是失败"，实际上警告不会让 CI 变红。

**想让警告也变红：**

```bash
npx eslint . --max-warnings=0
```

**`--max-warnings=0` 的意思：警告数超过 0 就失败。** 团队项目常用这个，逼大家清零。

## 2.5 跑一次

```bash
npx eslint .
```

**`npx` 是什么：** 从本项目的 `node_modules/.bin` 里找命令执行。找不到才去下载。

**应该看到：什么都没有。**

**又是"成功就闭嘴"。**

**现在故意制造几个问题。** 把 `server.js` 改成：

```javascript
import express from 'express'

const app = express()
const port = 3000
const unusedThing = 'hello'

app.get('/', (req, res) => {
  const name = req.query.name
  if (name == 'admin') {
    res.send(`hi ${name}`)
  } else {
    res.send(`hi ${userName}`)
  }
})

app.listen(port)
```

**跑：**

```bash
npx eslint .
```

**应该看到：**

```text

/b/OPC-Distance_study/.../ci-lab/server.js
   5:7   warning  'unusedThing' is assigned a value but never used  no-unused-vars
  10:7   error    'userName' is not defined                          no-undef
  13:13  warning  'name' is defined but never used                   no-unused-vars

✖ 3 problems (1 error, 2 warnings)
```

**逐行读（这是今天最重要的表格）：**

| 部分 | 意思 |
|---|---|
| 空行 + 文件路径 | 下面这些都属于这个文件 |
| `5:7` | 第 5 行第 7 列 |
| `warning` | 级别：警告，不影响退出码 |
| `'unusedThing' is assigned a value but never used` | 规则给出的说明 |
| `no-unused-vars` | 哪条规则报的（拿去搜文档） |
| `10:7 error` | 第 10 行第 7 列，级别是错误 |
| `'userName' is not defined` | 用了没定义的变量 |
| `✖ 3 problems (1 error, 2 warnings)` | 汇总：1 错 2 警 |

**注意第三条：`13:13 warning 'name' is defined but never used`。**

**第 13 行是 `const name = req.query.name`，`name` 明明被用了（在 `if` 里）。**

**为什么还报"没用过"？**

**因为 `if (name == 'admin')` 用了它，但 ESLint 判断的是"声明了但没读过"。** 这里它确实读过了。

**如果你真的看到这一条，说明你的文件和上面的不完全一样。** 比如你在 `if` 里又写了一次 `const name = ...`，把外层那个遮住了。

**这就是"照抄代码不看报错"的典型后果。**

**正确做法：以你屏幕上真实的行号和内容为准。** 报错说的是"你那个文件的第 13 行"，不是"我这段示例的第 13 行"。

**判断 `unused-vars` 真假的三个检查点：**

```text
① 你是不是在 if / for 里重新声明了同名变量（遮住了外层）
② 你是不是只给它赋了值，从来没有"读"它
③ 你是不是在字符串或注释里写了这个名字（那不算使用）
```

## 2.6 退出码：CI 真正的判据

**跑完之后立刻看：**

```bash
echo $?
```

**应该看到：**

```text
1
```

**`$?` 是什么：** 上一条命令的退出码。**0 是成功，非 0 是失败。**

**现在只剩警告的情况。** 把 `userName` 改成 `name`，再删掉 `unusedThing`：

```bash
npx eslint .
echo $?
```

**应该看到：**

```text
✖ 1 problems (0 errors, 1 warnings)

0
```

**1 个警告，退出码仍然是 0。**

**这就是为什么"CI 是绿的但有一堆警告"—— 警告不影响退出码。**

**想让它变红：**

```bash
npx eslint . --max-warnings=0
echo $?
```

**应该看到：**

```text
✖ 1 problem (0 errors, 1 warning)

1
```

**这一个数字，就是今天全部的重点。**

---

# 第 3 步：把两项检查写进 CI（20 分钟）

## 3.1 先想清楚任务怎么分

**两个选择：**

**选择一：一个 job，两个 step。**

```text
job: check
  step 1: node --check
  step 2: eslint
```

**选择二：两个 job，各跑一项。**

```text
job: syntax   → node --check
job: lint     → eslint
```

**选哪个：**

| | 一个 job | 两个 job |
|---|---|---|
| 速度 | 快一点（只开一台机器） | 慢（两台机器都要 checkout + install） |
| 排查 | 第二步失败要点进去看 | 列表上直接看到哪个红 |
| 额度 | 省 | 费 |

**学习阶段用**一个 job**。** 真实项目里如果检查项目多到 5 个以上，才拆开并行。

## 3.2 写 `check.yml`

**新建 `.github/workflows/check.yml`：**

```yaml
name: check

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

jobs:
  check:
    name: 语法检查 + 代码规范
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: 下载仓库代码
        uses: actions/checkout@v4

      - name: 安装 Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: 安装依赖
        run: npm ci

      - name: 语法检查
        run: npm run check

      - name: 代码规范检查
        run: npm run lint
```

**逐段读新增的三处：**

| 位置 | 内容 | 为什么 |
|---|---|---|
| `name: 语法检查 + 代码规范` | job 的显示名 | Actions 页面列表里看到的就是这个 |
| `timeout-minutes: 10` | 超过 10 分钟强制失败 | 防止卡死烧 6 小时额度 |
| `pull_request` 触发 | 开 PR 时也跑 | 让问题在合并前暴露 |

**`timeout-minutes` 那一条要解释清楚：**

```text
默认超时是 360 分钟（6 小时）
如果某条命令在等输入（比如 docker login 在等密码）
这个 job 会一直挂在那里
挂 6 小时 = 360 分钟额度

设成 10 分钟，最多烧 10 分钟
```

**`name:` 和 job 的 key 是两个东西：**

```yaml
jobs:
  check:                    ← 这是 key，内部用，给 needs 引用
    name: 语法检查 + 代码规范  ← 这是显示名，给人看
```

**第 7 节课的 `needs: check` 用的是 key，不是 name。** 这两个搞混是常见错误。

**注意：`lint` 脚本还没加。** 先在 `package.json` 里加：

```json
  "scripts": {
    "check": "node --check server.js",
    "lint": "eslint . --max-warnings=0"
  },
```

**为什么 CI 里跑 `npm run lint` 而不是直接写 `npx eslint .`：**

```text
跑 npm run lint → 本地和 CI 用的是同一份参数
直接写 npx eslint . → 两处参数容易漂移（一处加了 --max-warnings，一处没加）
```

## 3.3 push 上去看结果

```bash
git add .
git commit -m "第205节课：加 ESLint 和 CI 检查"
git push
```

**去 Actions 页面，应该看到一个新的 workflow `check` 在跑。**

**点进去：**

```text
Jobs
  语法检查 + 代码规范 ✅   35s
```

**注意左边显示的是 `name`，不是 `check`。**

**点开它，看步骤列表：**

```text
✅ Set up job
✅ 下载仓库代码
✅ 安装 Node 22
✅ 安装依赖
✅ 语法检查
✅ 代码规范检查
✅ Complete job
```

**注意最后还有一个 `Post 安装 Node 22`（列表往下滚）：**

```text
✅ Post 安装 Node 22    1s
✅ Complete job
```

**`Post xxx` 是什么：**

```text
action 可以定义"收尾动作"
checkout 的收尾是"清理凭证"
setup-node 的收尾是"保存缓存"
```

**缓存就是在 `Post` 阶段存的。** 这就是为什么第一次跑不会命中。

## 3.4 现在故意让它变红

**操作：** 在 `server.js` 里加一行用未定义变量：

```javascript
app.get('/health', (req, res) => {
  res.json({ ok: true, version: versionNumber })
})
```

**`versionNumber` 没有定义。**

```bash
git add server.js
git commit -m "故意写错：未定义变量"
git push
```

**等 40 秒，看 Actions 页面：**

```text
❌ check
```

**点进去，`代码规范检查` 那一步是红的。**

**日志：**

```text
Run npm run lint
  npm run lint
  shell: /usr/bin/bash -e {0}

> ci-lab@1.0.0 lint
> eslint . --max-warnings=0

/home/runner/work/ci-lab/ci-lab/server.js
  17:25  error  'versionNumber' is not defined  no-undef

✖ 1 problem (1 error, 0 warnings)

Error: Process completed with exit code 1.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `/home/runner/work/ci-lab/ci-lab/server.js` | runner 上的绝对路径。**注意 `ci-lab/ci-lab` 重复了** |
| `17:25` | 第 17 行第 25 列 |
| `error` | 级别是错误，会影响退出码 |
| `'versionNumber' is not defined` | 规则说明 |
| `no-undef` | 规则名 |
| `✖ 1 problem (1 error, 0 warnings)` | 汇总 |
| `Process completed with exit code 1` | **CI 判红的唯一理由** |

**为什么路径是 `ci-lab/ci-lab`：**

```text
runner 的工作目录是 /home/runner/work/仓库名/仓库名
第一层是"这次运行的目录"
第二层是 checkout 下来的仓库
```

**以后你写脚本要注意这个重复。** 用相对路径就不会错。

**现在去仓库首页：**

```text
❌ 故意写错：未定义变量    check    just now
```

**红色的 ❌ 会一直留在这条 commit 旁边。** 这就是"历史记录"的价值 —— 半年后你能看到"哦那天我搞挂过"。

## 3.5 修好，再确认变绿

```javascript
app.get('/health', (req, res) => {
  res.json({ ok: true })
})
```

```bash
git add server.js
git commit -m "修好：去掉未定义变量"
git push
```

**等 40 秒，绿勾。**

**到这里，你已经有了一个"能拦住错误"的流水线。**

**但它只是"告诉你错了"，还拦不住任何人合并。** 那是第 3 节课的内容。

---

# 第 4 步：检查覆盖率（20 分钟）

## 4.1 问题：现在只检查一个文件

**`npm run check` 里写的是 `node --check server.js`。**

**你以后会有 `src/` 目录、十几个文件。手写一个个文件名不现实。**

**而且 `node --check` 只接受一个文件。**

**这是"检查覆盖率"问题，不是 bug。** 但它的后果很严重：**你以为在检查，其实只检查了 1/10。**

## 4.2 写一个跨平台的检查脚本

**为什么不用 `for f in $(ls *.js)`：**

```text
那是 bash 语法
Windows 的 cmd 和 PowerShell 不认
npm scripts 在不同系统上跑的是不同的 shell
```

**用一个 `.mjs` 脚本，三平台一致。**

**安装 glob（一个库，用来按模式找文件）：**

```bash
npm install -D glob
```

**新建 `scripts/check-syntax.mjs`：**

```javascript
import { execFileSync } from 'node:child_process'
import { globSync } from 'glob'

const files = globSync(['**/*.js', '**/*.mjs'], {
  ignore: ['node_modules/**', 'dist/**'],
})

let failed = 0

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
    console.log(`ok    ${file}`)
  } catch (err) {
    failed += 1
    console.log(`FAIL  ${file}`)
    console.log(err.stderr.toString())
  }
}

console.log(`\n检查了 ${files.length} 个文件，失败 ${failed} 个`)

if (failed > 0) {
  process.exit(1)
}
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `execFileSync` | 同步执行一个程序，参数用数组传 |
| `process.execPath` | 当前 Node 的路径（不依赖 PATH 里有 `node`） |
| `stdio: 'pipe'` | 把输出收起来，自己处理 |
| `catch` | 退出码非 0 会抛异常 |
| `globSync(['**/*.js'])` | 递归找所有 `.js` |
| `process.exit(1)` | 有失败就以失败退出，让 CI 变红 |

**为什么用 `execFileSync` 不用 `execSync`：**

```text
execSync('node --check ' + file)  → 走 shell，文件名里有空格或分号就出事
execFileSync('node', ['--check', file]) → 不走 shell，参数原样传
```

**这是第 228 节课"命令注入"的伏笔。** 现在养成习惯。

**改 `package.json`：**

```json
  "scripts": {
    "check": "node scripts/check-syntax.mjs",
    "lint": "eslint . --max-warnings=0"
  },
```

**跑：**

```bash
npm run check
```

**应该看到：**

```text
ok    eslint.config.mjs
ok    server.js
ok    scripts/check-syntax.mjs

检查了 3 个文件，失败 0 个
```

**现在故意让 `scripts/check-syntax.mjs` 之外的一个文件出错试试：**

```bash
echo "const x = {" >> server.js
npm run check
```

**应该看到：**

```text
FAIL  server.js
/b/.../ci-lab/server.js:21
const x = {
          ^

SyntaxError: Unexpected end of input


检查了 3 个文件，失败 1 个
```

**退出码：**

```bash
echo $?
```

```text
1
```

**这就是"检查了所有文件"和"只检查一个文件"的区别。**

## 4.3 只检查"这次改了的文件"（进阶）

**问题：项目大了之后，全量 lint 要 30 秒。**

**优化思路：只检查这次 commit 改过的 `.js` 文件。**

```yaml
      - name: 找出改动的文件
        id: changed
        run: |
          git fetch origin main --depth=1
          FILES=$(git diff --name-only --diff-filter=ACMR origin/main...HEAD -- '*.js' | tr '\n' ' ')
          echo "files=$FILES" >> "$GITHUB_OUTPUT"

      - name: 只检查改动的文件
        if: steps.changed.outputs.files != ''
        run: npx eslint ${{ steps.changed.outputs.files }}
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `id: changed` | 给这一步起个 id，后面用 `steps.changed` 引用 |
| `git fetch ... --depth=1` | 只拉目标分支的最新一个提交（快） |
| `git diff --name-only` | 只列文件名，不列内容 |
| `--diff-filter=ACMR` | 只看新增/复制/修改/重命名，忽略删除 |
| `...HEAD` | 三点语法：从"分叉点"到 HEAD 的差异 |
| `-- '*.js'` | 只看 `.js` 文件 |
| `tr '\n' ' '` | 把换行换成空格，变成一行 |
| `>> "$GITHUB_OUTPUT"` | 把值传给后面的步骤 |
| `if: steps.changed.outputs.files != ''` | 没有改动就跳过这一步 |

**`$GITHUB_OUTPUT` 是什么：**

```text
一个临时文件，路径在环境变量里
你往里写 "名字=值"
后面的步骤就能用 steps.<id>.outputs.<名字> 取到
```

**老写法是 `::set-output name=x::value`，已经废弃。** 网上教程大量还是老写法，抄了会有警告。

**⚠️ 这一节是"进阶"，不是必须。**

**你现在只有 3 个文件，全量检查只要 1 秒。** 这段代码抄进去反而增加出错面。

**我的建议：现在不做。等你有 30 个文件、lint 超过 20 秒了再回来做。**

**放在这里，是让你知道"有这条路"，不是让你今天走。**

---

# 第 5 步：检查要拦住什么（15 分钟）

## 5.1 现在这条流水线拦不住任何人

**现状：**

```text
push → CI 跑 → 红了
       ↓
     你照样可以再 push 一次把它覆盖
     别人照样可以合并 PR（如果你有协作者）
     服务器上照样是坏代码（如果部署不依赖 CI）
```

**CI 只是"一盏灯"。灯红了，但你还能往前走。**

**真正拦住你的是三样东西：**

| 手段 | 拦住什么 |
|---|---|
| 分支保护（required checks） | 红了不许合并 |
| 部署依赖 CI（`needs`） | 检查不过不部署 |
| 自我保护（习惯） | 红了先修，不 `--force` 推 |

## 5.2 分支保护怎么开

**路径（GitHub 界面会变，以你看到的为准）：**

```text
仓库 → Settings → 左侧 Branches → Add branch protection rule
```

**填：**

| 字段 | 填什么 |
|---|---|
| `Branch name pattern` | `main` |
| `Require a pull request before merging` | 勾上 |
| `Require status checks to pass before merging` | 勾上 |
| 下面的搜索框 | 输入 `check`，选中出现的那个 |

**⚠️ 一个限制：私有仓库的分支保护，免费账户可能不支持。**

**你会看到：**

```text
Upgrade to GitHub Pro or make this repository public to enable this feature.
```

**这是 GitHub 的收费策略。** 三个选择：

```text
① 把 ci-lab 改成 Public（学习仓库，没有密钥，可以）
② 买 GitHub Pro（个人 4 美元/月，价格会变）
③ 先不开，靠自觉
```

**学习阶段我建议选 ①：把 `ci-lab` 改成 Public。**

**因为：**

```text
公开仓库的分支保护免费
公开仓库的 Actions 分钟数不限
而你在这个仓库里只放学习代码
```

**但注意：公开之后，第 6 节课配 Secrets 时要格外小心。** 第 209 节课会讲这个。

**改成 Public 的路径：**

```text
Settings → 最下面 Danger Zone → Change repository visibility → Make public
```

**⚠️ 这一步不可逆地"公开过"。** 即使你之后再改回 Private，别人可能已经 clone 或 fork 了。

**所以：改之前先确认仓库里没有任何密钥。** 用这条命令查：

```bash
git log -p | grep -iE "ghp_|sk-|password|secret|token" | head -20
```

**有输出就先处理，别急着公开。**

## 5.3 检查名要写对

**分支保护里让你选的"status check"，名字来自哪里？**

```text
来自 job 的 name 字段
```

**你的 yml 里写的是：**

```yaml
jobs:
  check:
    name: 语法检查 + 代码规范
```

**那列表里出现的可能是：**

```text
语法检查 + 代码规范
```

**实操建议：**

```text
① 先 push 一次，让 CI 跑过至少一次
② 再去分支保护里搜，列表里才会出现这个检查
③ 不要手工输入，从列表里点选
```

**为什么"要跑过至少一次"：**

```text
GitHub 只把"真实出现过的检查名"放进列表
没跑过的检查，列表里根本没有
```

**这就是新手最常见的困惑："为什么我搜不到我的 job 名"。**

## 5.4 红了之后会发生什么

**配好之后，再故意写错一次，然后开一个 PR。**

**PR 页面底部会变成：**

```text
❌ Some checks were not successful
   1 failing check

   Details

🔒 Merging is blocked
   Merging can be performed automatically once the requested changes are addressed.
```

**`Merging is blocked` 这几个字，就是"CI 真的拦住了"。**

**逐块读：**

| 部分 | 意思 |
|---|---|
| `Some checks were not successful` | 有检查没过 |
| `1 failing check` | 1 个失败 |
| `Merging is blocked` | 合并按钮变灰 |
| `Details` | 点进去看是哪个检查 |

**没有这一套，CI 就只是"装饰"。**

**第 3 节课会把这个流程完整走一遍（测试 + 分支保护 + PR）。**

## 5.5 一个人做产品，要不要开 PR

**很多人会问：我一个人，为什么要开 PR，直接推 main 不就行了。**

**三个理由：**

```text
① PR 是"给未来的自己看的变更说明"。半年后 git log 太粗，PR 里有完整讨论
② PR 会强制跑一遍 CI，而且用的是"合并后的结果"，不是分支本身
③ 有些改动你想先看看 CI 怎么说，再决定合不合
```

**但小改动直接推 main 也完全可以。**

**折中做法：**

```text
改一个字、改文案 → 直接推 main
改逻辑、加功能  → 开分支 + PR
```

**这不是规矩，是取舍。** 你要知道自己在取什么舍什么。

---

# 第 6 步：故意犯七个错（25 分钟）

## 错误 1：ESLint 9 没有配置文件

**操作：** 删掉（或改名）`eslint.config.mjs`，然后跑：

```bash
npx eslint .
```

**会怎样：**

```text
Oops! Something went wrong! :(

ESLint: 9.17.0

ESLint couldn't find an eslint.config.(js|mjs|cjs) file.

From ESLint v9.0.0, the default configuration file is now eslint.config.js.
If you are using a .eslintrc.* file, please follow the migration guide
to update your configuration file:
https://eslint.org/docs/latest/use/migrate-to-9.0.0
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `ESLint: 9.17.0` | 你的版本 |
| `couldn't find an eslint.config.(js\|mjs\|cjs) file` | 三种后缀都找过了，没有 |
| `From ESLint v9.0.0, the default configuration file is now eslint.config.js` | 9.0 起换了默认文件名 |
| `If you are using a .eslintrc.* file` | 老格式要迁移 |

**为什么：**

```text
ESLint 8 及以前：配置在 .eslintrc.json / .eslintrc.js，靠"往上找目录"继承
ESLint 9：配置必须是一个叫 eslint.config.* 的文件，靠 import 组合
```

**迁移的核心变化：**

| ESLint 8 | ESLint 9 |
|---|---|
| `.eslintrc.json` | `eslint.config.mjs` |
| `extends: ["eslint:recommended"]` | `js.configs.recommended` |
| `env: { node: true }` | `globals: { ...globals.node }` |
| 配置文件自动往上找 | 只找当前目录这一个 |

**怎么修：** 把配置文件改回 `eslint.config.mjs`。

**怎么提前发现：** 本地跑一遍再 push。

## 错误 2：规则名拼错

**操作：** 在 `eslint.config.mjs` 里把 `no-undef` 写成 `no-undefs`：

```javascript
    rules: {
      'no-undefs': 'error',
    },
```

**会怎样：**

```text
Oops! Something went wrong! :(

ESLint: 9.17.0

TypeError: Key "rules": Key "no-undefs": Could not find "no-undefs" in plugin "@".
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Key "rules"` | 出在 `rules` 这个字段 |
| `Key "no-undefs"` | 你写的那条规则 |
| `Could not find ... in plugin "@"` | 在"内置插件"里找不到这条规则 |

**为什么：**

```text
ESLint 的规则是一张固定表
写错一个字母，就是"这个规则不存在"
ESLint 不会猜测你想写什么（它猜错更糟）
```

**`plugin "@"` 是什么：** 内置规则集在 ESLint 内部被编成"`@`"这个虚拟插件。

**怎么修：** 去官方文档搜规则名，**复制粘贴，不要手打**。

**一个实用技巧：**

```text
VS Code 装 ESLint 插件后，配置文件里写错规则名会有红色波浪线
鼠标悬停能看到 "Unknown rule"
```

## 错误 3：ESM 文件被当成 CommonJS

**操作：** 删掉 `package.json` 里的 `"type": "module"`，然后：

```bash
npm run check
```

**会怎样：**

```text
> ci-lab@1.0.0 check
> node scripts/check-syntax.mjs

FAIL  server.js
/b/OPC-Distance_study/.../ci-lab/server.js:1
import express from 'express'
^^^^^^

SyntaxError: Cannot use import statement outside a module


检查了 3 个文件，失败 1 个
```

**注意这是我自己写的脚本输出的，`FAIL` 是我加的。**

**如果直接 `node --check server.js`，长这样：**

```text
/b/OPC-Distance_study/.../ci-lab/server.js:1
import express from 'express'
^^^^^^

SyntaxError: Cannot use import statement outside a module
```

**为什么：**

```text
"type" 字段缺失 → 默认 "commonjs"
CommonJS 里没有 import 这个语法
所以解析到第一行就崩
```

**注意：这个错误和 "文件不存在" 长得完全不一样。** 新手容易以为是路径问题。

**怎么修（三种，选一个）：**

```text
① package.json 加 "type": "module"
② 文件改名 server.mjs
③ 把代码改成 const express = require('express')
```

**选 ① 或 ②。** ③ 是往回退。

**一个连带问题：**

**加了 `"type": "module"` 之后，`eslint.config.js` 会变成 ESM。**

**如果你之前写的是 `module.exports = [...]`，就会报：**

```text
ReferenceError: module is not defined in ES module scope
```

**所以配置文件用 `.mjs`，永远不会有这个问题。**

## 错误 4：用 `continue-on-error` 把红变绿

**操作：**

```yaml
      - name: 代码规范检查
        run: npm run lint
        continue-on-error: true
```

**会怎样：**

**CI 绿了。**

**日志里还是有一堆 error，但 job 是绿的：**

```text
Run npm run lint
  ...
  17:25  error  'versionNumber' is not defined  no-undef

✖ 1 problem (1 error, 0 warnings)
Error: Process completed with exit code 1.
```

**但整个 job 显示 ✅。**

**为什么：**

```text
continue-on-error: true 的意思是
"这一步失败了，但别让整个 job 失败"
```

**为什么这是坏主意：**

```text
① 你不知道它到底过没过（绿勾但没有信息量）
② 三个月后你会以为"我们一直在检查"，其实从来没生效过
③ 真要检查的时候，已经积压了 200 个错误，没人想修
```

**什么情况下可以用：**

```text
只在"实验性检查"上用，而且同时要:
  - 在日志里显著打印警告
  - 在 issue 里记一条"某检查暂不阻断"
  - 设一个期限
```

**你一个人做产品，没有"别人来盯"，所以：不要用。**

**怎么修：** 删掉那一行。

## 错误 5：脚本里写了 `|| true`

**操作：** 在 `package.json` 里：

```json
    "lint": "eslint . --max-warnings=0 || true"
```

**会怎样：**

**永远退出码 0。永远绿。**

**为什么：**

```bash
命令A || 命令B
# A 失败（非 0）才执行 B
# true 永远返回 0
# 所以整条语句永远返回 0
```

**这个写法的来源：**

```text
有人在本地用 bash，不希望 lint 失败打断自己的操作
就加了 || true
然后复制到 CI 里
```

**为什么在 CI 里是灾难：**

```text
CI 唯一能看的东西就是退出码
你把退出码固定成 0
等于把 CI 的眼睛蒙上
```

**怎么查出来：**

```bash
grep -rn "|| true" .github/ package.json
grep -rn "; exit 0" .github/ package.json
grep -rn "|| echo" .github/ package.json
```

**三条都要查。** 后面两种同样是"掩盖失败"。

**怎么修：** 去掉。

**⚠️ 有一种情况 `|| true` 是合理的：**

```bash
# 清理临时文件，失败无所谓
rm -rf /tmp/build || true
```

**判断标准：** 这一步失败了，会不会影响"这次发布能不能上线"？**会，就不许 `|| true`。**

## 错误 6：管道吃掉了退出码

**操作：** 在 CI 里这么写，想把日志存下来：

```yaml
      - name: 代码规范检查
        run: npm run lint | tee lint.log
```

**会怎样：**

**即使 ESLint 报错，这一步也是绿的。**

**验证（本地就能做）：**

```bash
npx eslint . | tee lint.log
echo $?
```

**应该看到：**

```text
  17:25  error  'versionNumber' is not defined  no-undef

✖ 1 problem (1 error, 0 warnings)

0
```

**退出码是 0。**

**为什么：**

```text
管道 a | b 的退出码，是"最后一条命令"的退出码
b 是 tee，tee 正常写文件 → 退出码 0
a 失败了，但没人看它
```

**这是 shell 最经典的陷阱之一，坑了无数 CI。**

**怎么修（两种）：**

**修法一：`set -o pipefail`**

```yaml
      - name: 代码规范检查
        shell: bash
        run: |
          set -o pipefail
          npm run lint | tee lint.log
```

**`set -o pipefail` 是什么：** 让管道里**任何一条**命令失败，整条管道就失败。

**修法二：不要管道**

```yaml
      - name: 代码规范检查
        run: npm run lint
```

**日志本来就会完整显示在 Actions 页面，`tee` 是多余的。**

**为什么有人加 `tee`：**

```text
想把日志存成文件，后面上传成 artifact
但 Actions 已经有完整日志了，除非你要做"日志分析"，否则不需要
```

**记住这条：任何 `| tee`、`| grep`、`| head` 都会改掉退出码。**

## 错误 7：CI 里没装 ESLint

**操作：** 把 CI 里的安装改成：

```yaml
      - name: 安装依赖
        run: npm ci --omit=dev
```

**会怎样：**

```text
Run npm run lint
  npm run lint
  shell: /usr/bin/bash -e {0}

> ci-lab@1.0.0 lint
> eslint . --max-warnings=0

sh: 1: eslint: not found
Error: Process completed with exit code 127.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `> eslint . --max-warnings=0` | npm 尝试执行这个命令 |
| `sh: 1: eslint: not found` | shell 找不到 `eslint` 这个程序 |
| `exit code 127` | **127 在 Unix 里固定表示"命令不存在"** |

**为什么：**

```text
--omit=dev 跳过了 devDependencies
ESLint 装在 devDependencies 里
所以 node_modules/.bin/eslint 不存在
```

**记住这两个数字：**

```text
126  找到了但没执行权限
127  找不到这个命令
```

**以后看到 127，不要看代码逻辑，先看"这个命令装了吗"。**

**怎么修：**

```text
① CI 里用 npm ci（不 omit）
② 或者把 eslint 挪到 dependencies（不推荐，它不该进生产镜像）
```

**正确做法是 ①。**

**顺便说：生产镜像里也不该有 ESLint。**

**所以第 4 节课的 Dockerfile 里会用多阶段构建：**

```dockerfile
FROM node:22 AS build
RUN npm ci

FROM node:22
RUN npm ci --omit=dev
```

**同一个项目，两个安装策略，各用在对的地方。**

## 错误 8（附加）：只看退出码不看覆盖率

**操作：** 你在 `src/a.js` 里写了一个语法错误，但 `npm run check` 依然绿。

**为什么：**

```json
"check": "node --check server.js"
```

**只检查了 `server.js`。**

**怎么查出来：**

```bash
npm run check
```

**看它到底检查了几个文件。** 如果输出里只有一行，说明你只查了一个。

**或者更直接：**

```bash
ls -R src 2>/dev/null | head
```

**有 `src/` 目录但 `check` 里没提到它，就是漏了。**

**怎么修：** 用第 4.2 节那个 `scripts/check-syntax.mjs`。

**这一条的教训不是"要用脚本"，是：**

> **任何"检查"，都要问一句"它检查了哪些东西"。** 不检查的，等于不存在。

---

# 第 7 步：写学习笔记（10 分钟）

**把下面的模板复制到 `02-笔记/NOTES.md`，然后填空。**

````markdown
# 第 205 节课学习笔记

## 一、`node --check` 查什么、不查什么

能查（3 个）：

1.
2.
3.

不能查（3 个）：

1.
2.
3.

为什么不能查：

## 二、我遇到的 ESM 报错

贴原文：

```text

```

我是怎么修的（选哪种，为什么）：

## 三、ESLint 的四个概念

| 概念 | 一句话 |
|---|---|
| 配置文件 | |
| 规则（rule） | |
| 级别（off/warn/error） | |
| 规则集（configs.recommended） | |

## 四、warn 和 error 的区别

| 级别 | 退出码 | CI 会红吗 |
|---|---|---|
| off | | |
| warn | | |
| error | | |

`--max-warnings=0` 是干什么的：

## 五、我的 `eslint.config.mjs`

贴完整内容：

```javascript

```

我改过的规则（哪条、从什么改成什么、为什么）：

## 六、我的 `check.yml`

贴完整内容：

```yaml

```

`timeout-minutes` 我设了多少，为什么：

## 七、退出码

`echo $?` 我看到的三个值：

| 情况 | 退出码 |
|---|---|
| 全通过 | |
| 只有警告 | |
| 有错误 | |

127 是什么意思：

126 是什么意思：

## 八、七个错误

| 错误 | 现象 | 根本原因 | 怎么查 |
|---|---|---|---|
| 没有配置文件 | | | |
| 规则名拼错 | | | |
| ESM 被当 CJS | | | |
| `continue-on-error` | | | |
| `\|\| true` | | | |
| 管道吃退出码 | | | |
| `--omit=dev` | | | |

## 九、检查覆盖率

我的 `check` 脚本检查了几个文件：

我是怎么确认的：

如果漏了会有什么后果：

## 十、分支保护

我开了吗：

如果没开，为什么（我的选择）：

`Merging is blocked` 长什么样：

## 十一、我还不懂的词

-
-

## 十二、完成检查

- [ ] 我在本地跑通过 `node --check` 和 `npx eslint .`
- [ ] 我见过 ESLint 的三种输出：警告、错误、全通过
- [ ] 我知道 warn 不会让 CI 变红
- [ ] 我的 `check.yml` 在 push 和 PR 时都会跑
- [ ] 我故意写错并看到过红色 ❌
- [ ] 我点进红色日志，逐行读过一遍
- [ ] 我知道 127 是什么意思
- [ ] 我做过 `npm run lint | tee` 的实验，看到退出码被吃掉
````

---

# 第 8 步：课后练习

## 练习一：把 `no-unused-vars` 改成 error

**要求：**

1. 在配置里把 `'no-unused-vars': 'warn'` 改成 `'error'`；
2. 故意留一个没用的变量；
3. 本地跑 `npm run lint`，记退出码；
4. push，看 CI。

**记录：** 退出码变了吗？CI 红了吗？

**思考题：** 为什么很多团队最后还是把它设成 `warn`？

## 练习二：加一条自己的规则

**要求：**

1. 从 ESLint 规则文档里挑一条你没用过的（比如 `prefer-const`、`no-var`、`no-else-return`）；
2. 加进配置；
3. 找一个会触发它的写法，故意写进去；
4. 看报错，再改好。

**记录：** 规则名 / 报错原文 / 修法。

**思考题：** 这条规则防的是什么类型的 bug？

## 练习三：让检查只在 PR 上跑

**要求：**

1. 把 `on:` 改成只有 `pull_request` 和 `workflow_dispatch`；
2. 直接 push 到 main，确认不触发；
3. 开一个分支，改点东西，开 PR；
4. 确认 PR 上跑了。

**记录：** 两次的 Actions 页面分别长什么样。

**思考题：** 如果只有 PR 触发，直接推 main 的改动就没人检查了。这个风险你怎么处理？

## 练习四：制造一次"绿勾但其实是坏的"

**要求：**

1. 用 `continue-on-error: true`；
2. 故意写错；
3. 记录：job 是绿的，但日志里有 error；
4. 改回来。

**记录：** 你怎么在一堆绿勾里发现这个"假绿"？

**思考题：** 如果一个团队有 20 个 job，其中 3 个是 `continue-on-error`，半年后会怎样？

## 练习五：算一次"检查要花多少时间"

**要求：**

1. 记录 `check` job 的总耗时；
2. 点开每一步，记录每步耗时；
3. 找出最慢的一步；
4. 想一个优化办法（缓存？减少 action？并行？）。

**记录：** 表格：步骤名 / 耗时 / 能不能优化。

**思考题：** 如果 `npm ci` 占了 60% 的时间，但缓存命中只有 30%，问题可能在哪？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清 `node --check` 和 ESLint 查的是不同层面的东西
- [ ] 我知道 `warn` 不影响退出码
- [ ] 我知道 CI 只看退出码，不看日志里写了什么
- [ ] 我知道 127 表示"命令不存在"
- [ ] 我知道管道会改掉退出码，需要 `pipefail`

## B. 实操

- [ ] `ci-lab` 里有 `eslint.config.mjs`，是 flat config 格式（导出数组）
- [ ] `package.json` 里有 `check` 和 `lint` 两个脚本
- [ ] `.github/workflows/check.yml` 能跑出绿勾
- [ ] 这个 workflow 在 `push` 和 `pull_request` 时都会触发
- [ ] 我配了 `timeout-minutes`
- [ ] 我用 `workflow_dispatch` 手动重跑过一次

## C. 排错

- [ ] 我见过 `ESLint couldn't find an eslint.config.(js|mjs|cjs) file`
- [ ] 我见过 `Cannot use import statement outside a module`
- [ ] 我见过 `sh: 1: eslint: not found` + `exit code 127`
- [ ] 我做过 `| tee` 的实验，看到退出码是 0
- [ ] 我知道 `continue-on-error` 会让红变绿，并且我不用它

## D. 交付

- [ ] 我至少有过一次红色 ❌ 的提交记录，并且之后修好了
- [ ] 我没有用 `|| true` 或 `; exit 0` 掩盖任何检查
- [ ] 我的 CI 命令和本地 `npm run lint` 完全一致

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 贴了自己的 `eslint.config.mjs` 和 `check.yml`
- [ ] 记录了三个真实的退出码

## 本节课要能说出口的一句话

> **CI 判断成功失败只看退出码；`warn` 是 0，`error` 是非 0，管道和 `|| true` 会把非 0 变成 0 —— 这就是"假绿"的全部来源。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `couldn't find an eslint.config.(js\|mjs\|cjs) file` | ESLint 9 找不到配置 | 建 `eslint.config.mjs` |
| `Could not find "xxx" in plugin "@"` | 规则名拼错 | 文档里复制，不要手打 |
| `Cannot use import statement outside a module` | 文件是 `.js` 但用了 `import` | 加 `"type": "module"` 或改 `.mjs` |
| `require is not defined in ES module scope` | 加了 `type: module` 但代码用 `require` | 改 `import`，或把文件改 `.cjs` |
| `sh: 1: eslint: not found` | 没装 / 被 `--omit=dev` 跳过 | CI 里用 `npm ci`（不 omit） |
| `exit code 127` | 命令不存在 | 先确认装没装 |
| `exit code 126` | 找到了但没执行权限 | `chmod +x` |
| CI 绿但日志里有 error | `continue-on-error` / `\|\| true` | 去掉，全仓 grep 一遍 |
| `npm run lint` 本地红、CI 绿 | 管道或 `\|\| true` | `set -o pipefail` |
| 分支保护搜不到我的检查 | 还没跑过一次 | 先 push 跑一次再来选 |
| `Upgrade to GitHub Pro` | 私有仓库不支持分支保护 | 改 Public 或买 Pro |
| `Merging is blocked` 但检查是绿的 | 有其他 required check 没过 | 看 `Details` 里全部检查 |
| 警告太多没人管 | `warn` 不影响退出码 | 关键规则改 `error` |
| ESLint 太慢 | 全量检查 | 只查改动文件（第 4.3 节） |
| `no-undef` 误报 `console` | 没配 `globals` | `globals: { ...globals.node }` |
