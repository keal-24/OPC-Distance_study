# 第 23 节课：提交第一个版本——把项目完整入库

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你在 `sandbox` 里练了 Git 的内部结构。这节课做一件实事：**把你第 3 周的对话应用完整提交进 Git。**
> 这不是"跑几条命令"，是要解决四个真实问题：**哪些文件该提交、哪些绝对不能、提交信息怎么写、提交前怎么自查。**

**建议用时**：100 分钟
**你需要先完成**：第 22 节课（懂 blob/tree/commit、HEAD、分支）

---

# 第 0 步：先想清楚什么该提交（10 分钟）

## 0.1 一个真实事故

**有人的仓库里提交了 `node_modules`。**

**后果：**

```text
仓库从 2MB 变成 300MB
每次 clone 要下 300MB
GitHub 提示仓库接近大小限制
删掉也没用——历史里还在，要重写历史
```

**还有更严重的：**

**有人提交了 `.env`，里面有真实的 API 密钥。**

**后果：**

```text
GitHub 上有爬虫 24 小时扫 sk- 开头的字符串
几分钟内密钥就被拿去用了
账单可能是几百美元
```

**这不是吓唬。** 这是每天在发生的事。

## 0.2 三类文件，三种处理

```text
① 必须提交   → 源代码、配置文件（不含密钥）、README、.gitignore
② 绝对不提交 → .env、密钥文件、数据库密码
③ 不该提交   → node_modules、日志、编辑器配置、构建产物
```

**判断方法：**

```text
问自己：这个文件能不能由"其他文件 + 一条命令"重新生成？
能 → 不该提交（node_modules、构建产物）
不能 → 该提交（源代码）
```

**再问一句：**

```text
问自己：这个文件里有不该给别人看的东西吗？
有 → 绝对不提交（.env、私钥）
```

## 0.3 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `第03周 chat-app` 的提交 | 课程仓库 | 你的第一个完整项目入库 |

**今天的成果不在 `03-练习代码` 里，而是"课程仓库里多了一批正确的提交"。**

---

# 第 1 步：先检查你的 chat-app 现状（20 分钟）

## 1.1 找到第 3 周的项目

**打开：**

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第03周-后端与对话\第07节课\03-练习代码\chat-app
```

**如果你没做完第 21 节课：**
用第 20 节课的 `chat-app` 也行（那个也有后端和前端）。**甚至用第 19 节课的都行。**

**重点是"有一个真实的 Node 项目"，不是"必须是最终版"。**

## 1.2 看它现在有什么

**操作：**

1. 在这个目录里打开终端（地址栏输入 `cmd`）。
2. 运行：

   ```text
   dir /b
   ```

**应该看到类似：**

```text
.env
.env.example
.gitignore
data
node_modules
package-lock.json
package.json
public
src
```

## 1.3 逐个判断：该不该提交

**在笔记里填这张表（先自己判断，不确定就打个问号）：**

| 文件/目录 | 提交？ | 理由 |
|---|---|---|
| `.env` | | |
| `.env.example` | | |
| `.gitignore` | | |
| `data/` | | |
| `node_modules/` | | |
| `package-lock.json` | | |
| `package.json` | | |
| `public/` | | |
| `src/` | | |

**自己填完再往下看答案。**

## 1.4 对照答案

| 文件/目录 | 提交？ | 理由 |
|---|---|---|
| `.env` | **❌ 绝对不** | 有真实密钥 |
| `.env.example` | ✅ 必须 | 告诉别人要配哪些变量 |
| `.gitignore` | ✅ 必须 | 规则本身要被记录 |
| `data/` | **❌ 不** | 是运行时数据，每个人的数据不同 |
| `node_modules/` | **❌ 绝对不** | 几万个文件、几百 MB，`npm install` 能重建 |
| `package-lock.json` | ✅ 必须 | 锁定精确版本，保证别人装到一样的依赖 |
| `package.json` | ✅ 必须 | 项目说明书 |
| `public/` | ✅ 必须 | 源代码 |
| `src/` | ✅ 必须 | 源代码 |

## 1.5 三个容易判断错的

### `package-lock.json` 为什么要提交

**很多人以为"有 `package.json` 就够了"。**

**不够。**

**`package.json` 里写的是：**

```json
"express": "^4.22.3"
```

**`^` 意味着"4.x.x 里最新的"。**

**今天安装是 4.22.3，三个月后别人安装可能是 4.25.1。** 那个版本可能有不兼容的改动。

**`package-lock.json` 里写的是精确版本和每个传递依赖的版本。**

**提交它，别人 `npm install` 就装到和你完全一样的依赖。**

**这就是"在我机器上能跑"问题的解法之一。**

### `data/` 为什么不该提交

**因为它是运行时数据。**

**如果你提交了：**

```text
① 你的测试数据（比如"我叫小明"）进了仓库
② 别人 clone 下来看到你的数据
③ 别人跑起来后数据文件冲突，Git 一直提示"有改动"
```

**正确做法：**

**在 `.gitignore` 里加一行 `data/`。**

**然后代码里用 `fs.mkdir(..., { recursive: true })` 自动创建目录**（第 19 节课学过）。

**这样"目录不存在"不是问题。**

### `.env.example` 为什么必须提交

**因为它是"配置清单"。**

**别人 clone 你的项目后：**

```text
看到 .env.example，知道要配 4 个变量
复制成 .env，填上自己的值
就能跑了
```

**没有它，别人不知道要配什么，只能猜或者读源码。**

---

# 第 2 步：检查 `.gitignore`（20 分钟）

## 2.1 看现有的 `.gitignore`

**在 `chat-app` 目录里：**

```text
type .gitignore
```

**如果文件不存在，会报"系统找不到指定的文件"。**

## 2.2 完整的 `.gitignore`

**新建或补全成下面这样，自己敲：**

```text
# 依赖包（几万个文件，npm install 能重建）
node_modules/

# 密钥和环境变量（绝对不能提交）
.env
.env.local
.env.*.local

# 运行时数据
data/

# 日志
*.log
npm-debug.log*
yarn-error.log*

# 编辑器和系统
.vscode/
.idea/
.DS_Store
Thumbs.db

# 构建产物
dist/
build/

# 缓存
.cache/
.parcel-cache/
```

## 2.3 逐行解释几个不直观的

### `.env.*.local`

**`*` 是通配符。**

**这一行匹配：**

```text
.env.development.local
.env.production.local
.env.test.local
```

**为什么不直接写 `.env*`：**

因为那会**把 `.env.example` 也忽略掉**。

**测试一下：**

```text
git check-ignore -v .env.example
```

**如果输出了一行，说明 `.env.example` 被忽略了。** 这是错的。

**正确状态：没有输出**（说明没被忽略）。

**这个坑很常见：** 图省事写了 `.env*`，结果配置模板也提交不上去，别人 clone 下来完全不知道怎么配。

### `data/`

**结尾的 `/` 表示"这是一个目录"。**

**注意：这一行会让 `data` 目录整个不进 Git。**

**这意味着别人 clone 下来没有 `data` 目录。** 代码里必须能自己创建它。

**验证你的代码能处理：**

```text
rmdir /s /q data
npm run dev
```

**应该正常启动，并且发一条消息后 `data` 目录自动出现了。**

**如果启动报 `ENOENT`：** 说明你的 `writeAll` 里没有 `fs.mkdir(..., { recursive: true })`。回去补上（第 19 节课讲过）。

### `.vscode/`

**为什么忽略：**

因为它存的是你个人的编辑器设置（比如窗口布局、打开的标签页）。

**例外：** 如果团队要统一调试配置，可以只提交 `.vscode/launch.json`：

```text
.vscode/*
!.vscode/launch.json
```

**`!` 是什么：** "不忽略"，用来给前面的规则开例外。

**这是个进阶用法，现在知道有这个东西就行。**

## 2.4 验证每条规则都生效

**制造几个"应该被忽略"的文件：**

```text
mkdir node_modules
echo dummy > node_modules\test.js
echo SECRET=fake > .env
echo log > app.log
```

**然后看状态：**

```text
git status
```

**关键：这三个文件都不应该出现在输出里。**

**如果出现了，说明 `.gitignore` 没生效。**

**用 `check-ignore` 逐条查：**

```text
git check-ignore -v node_modules
git check-ignore -v .env
git check-ignore -v app.log
```

**应该输出类似：**

```text
.gitignore:2:node_modules/    node_modules
.gitignore:5:.env             .env
.gitignore:11:*.log           app.log
```

**读法：**

```text
.gitignore 第 2 行的规则 node_modules/ 命中了 node_modules
```

**如果某条没有输出：** 那一行规则没生效。检查拼写。

## 2.5 一个最容易踩的坑

**`.gitignore` 只对"还没被 Git 跟踪的文件"生效。**

**如果你先 `git add` 了 `node_modules`，之后再加 `.gitignore`，它不会自动移除。**

**验证这个问题：**

1. 先把 `node_modules` 加进 Git：

   ```text
   git add node_modules
   ```

2. 现在 `git status` 会看到它在暂存区。

3. 即使 `.gitignore` 里有 `node_modules/`，它还是在。

**怎么修：**

```text
git rm -r --cached node_modules
```

**`--cached` 是什么：**
只从 Git 索引里删掉，**不删本地文件**。

**这是关键参数。** 不加 `--cached` 会把你的 `node_modules` 真的删掉，那就得重新 `npm install`。

**验证修好了：**

```text
git status
```

**`node_modules` 应该不再出现。**

**清理实验文件：**

```text
rmdir /s /q node_modules
del .env
del app.log
```

**注意：`del .env` 删掉的是我们刚造的假 .env。如果你有真的 .env，别删。**

---

# 第 3 步：决定提交的粒度（15 分钟）

## 3.1 一次提交应该包含什么

**核心原则：**

```text
一次提交 = 一件完整的小事
```

**对比：**

```text
❌ 一次提交 50 个文件，信息写"更新"
   → 出了问题不知道是哪个改动引起的

❌ 每个文件一次提交，信息写"改 a.js"、"改 b.js"
   → 历史一堆碎片，看不出做了什么

✅ 一次提交 3-5 个文件，信息写"添加用户列表分页接口"
   → 清晰的"一件事"
✅ 一次提交 1 个文件，信息写"修复分页边界少算一条的 bug"
   → 也是清晰的一件事
```

**判断标准：**

```text
如果这次提交需要"回退"，你希望一起回退哪些文件？
```

**答案就是这次该提交的范围。**

## 3.2 你这个项目该怎么拆

**第一次提交，建议拆成 2—3 次：**

**提交 1：项目骨架**

```text
package.json
package-lock.json
.gitignore
.env.example
README.md（如果没有，现在写一个）
```

**信息：** `初始化项目：npm 配置 + 忽略规则 + 环境变量模板`

**提交 2：后端代码**

```text
src/app.js
src/llm.js
src/store.js
src/mock-llm.js
```

**信息：** `添加后端：Express 接口 + 模型调用 + 文件存储`

**提交 3：前端页面**

```text
public/index.html
public/chat.html
public/main.js
public/chat.js
public/style.css（如果有）
```

**信息：** `添加前端：留言板 + 对话界面`

**为什么这样拆：**

```text
① 每次提交都能看懂做了什么
② 如果前端有问题，可以只回退提交 3
③ 别人看历史能理解你的开发顺序
```

**注意：第一次提交可以合并成一次。**

**为什么：** 因为这是"项目的起点"。**很多项目第一次提交就是"初始版本"一大坨。**

**但第二次之后，就该拆了。**

**本课建议：第一次合并成一次提交，把"初始化项目"做完。** 这样简单，也不会错。

## 3.3 写一个 README

**如果 `chat-app` 里没有 README，现在写一个。**

**自己敲 `README.md`：**

````markdown
# chat-app

一个带记忆的对话应用。第 3 周（第 15—21 节课）的练习项目。

## 功能

- 多会话管理（新建、切换、删除）
- 上下文记忆（每次请求带最近 20 条历史）
- 模型调用（OpenAI 兼容接口）
- 流式错误处理（超时、限流、服务不可用）

## 技术栈

- Node.js 22（ES Module）
- Express 4
- 原生 fetch 调用模型接口
- JSON 文件存储（仅适合单用户）

## 本地运行

1. 安装依赖

   ```text
   npm install
   ```

2. 配置环境变量

   ```text
   copy .env.example .env
   ```

   然后编辑 `.env`，填入你的配置。

3. 启动

   ```text
   npm run dev
   ```

4. 打开 http://localhost:3000/chat.html

## 可选：不配置密钥也能跑

用一个本地假模型：

```text
npm run mock
```

然后把 `.env` 里的 `LLM_BASE_URL` 改成 `http://localhost:4010/v1`。

## 已知限制

- 数据存在 JSON 文件里，**并发写入会丢数据**，只适合单用户
- 没有用户系统，所有人都看到同一份数据
- 没有流式输出，回复要等全部生成完

## 目录结构

```text
src/
├── app.js        服务器入口 + 路由
├── llm.js        模型调用封装
├── store.js      数据读写
└── mock-llm.js   本地假模型（测试用）

public/
├── index.html    留言板
├── chat.html     对话界面
├── main.js       留言板逻辑
└── chat.js       对话逻辑

data/             运行时数据（不提交）
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `LLM_BASE_URL` | 模型接口地址，写到 `/v1` |
| `LLM_API_KEY` | 密钥 |
| `LLM_MODEL` | 模型名称 |
| `LLM_TIMEOUT_MS` | 超时毫秒数，默认 15000 |
| `LLM_MAX_TOKENS` | 最大生成 token，默认 500 |
````

**为什么 README 这么重要：**

```text
三个月后你自己回来，靠它回忆怎么跑
面试官打开你的 GitHub，先看 README
别人想用你的项目，靠它上手
```

**"README 写得好"是它看起来专业的最大原因之一。**

**注意最后两节：**

- **"已知限制"** —— 主动写出局限，比假装完美更专业
- **"环境变量"表** —— 别人不用翻代码就知道要配什么

---

# 第 4 步：正式提交（20 分钟）

## 4.1 先看全局状态

**操作：**

1. 打开课程仓库根目录：

   ```text
   B:\OPC-Distance_study
   ```

2. 在这里打开终端。
3. 运行：

   ```text
   git status
   ```

**你会看到一长串改动。**

**为什么在这里而不是在 `chat-app` 里：**

因为**整个课程仓库是一个 Git 仓库**。`chat-app` 只是它里面的一层目录。

**`git status` 会显示整个仓库的状态。**

**这就是第 22 节课说的"仓库根目录"。**

**确认一下：**

```text
git rev-parse --show-toplevel
```

**应该输出：**

```text
B:/OPC-Distance_study
```

**如果不是，说明你在错误的目录。**

## 4.2 只 add 你的项目

**关键：不要 `git add .`**

**因为那会把这一周所有练习文件、所有笔记、所有 `sandbox` 实验都加进来。**

**正确做法：**

```text
git add 每周课程/01-元技能与基础/第03周-后端与对话/第07节课/03-练习代码/chat-app
```

**这条命令只加这个目录。**

**现在看状态：**

```text
git status
```

**应该看到 `chat-app` 里的文件出现在 `Changes to be committed` 里。**

**关键检查：`node_modules` 和 `.env` 绝对不能出现在里面。**

**如果出现了：**

**立刻停下。**

```text
git restore --staged 每周课程/.../chat-app/node_modules
```

**`--staged` 是什么：** 从暂存区拿出来，改动还在。

**然后回去检查 `.gitignore`。**

## 4.3 一个更保险的做法：先看会加什么

**`git add` 有一个 `-n`（dry run）参数：**

```text
git add -n 每周课程/01-元技能与基础/第03周-后端与对话/第07节课/03-练习代码/chat-app
```

**`-n` 是什么：** "演练"，只显示"会加哪些文件"，**不真的加**。

**输出类似：**

```text
add '每周课程/.../chat-app/.env.example'
add '每周课程/.../chat-app/.gitignore'
add '每周课程/.../chat-app/package.json'
add '每周课程/.../chat-app/public/chat.html'
...
```

**逐个看：**

- [ ] 有没有 `node_modules`？
- [ ] 有没有 `.env`（不是 `.env.example`）？
- [ ] 有没有 `data/`？
- [ ] 有没有 `package-lock.json`？

**确认没问题，再去掉 `-n` 真正 add。**

**这个习惯能救你很多次。** 每次 add 大目录前先 `-n` 看一眼。

## 4.4 确认暂存了什么

```text
git status
```

**或者更精确：**

```text
git diff --staged --stat
```

**`--staged` 是什么：** 看"暂存区 vs 上次提交"的差异。
**`--stat` 是什么：** 只看统计（哪些文件、加删多少行），不显示内容。

**输出类似：**

```text
 .../chat-app/.env.example      |  6 ++++++
 .../chat-app/.gitignore        | 20 +++++++++++++++
 .../chat-app/package.json      | 20 +++++++++++++++
 .../chat-app/package-lock.json | 800 ++++++++++++++++++++++++++++++++++++
 .../chat-app/public/chat.html  | 300 ++++++++++++++
 ...
```

**注意 `package-lock.json` 有 800 行。**

**这是正常的。** 它记录了所有依赖的精确版本。

**为什么这么长还要提交：** 因为它保证了"依赖一致"。

**如果 `node_modules` 被加进来了：**

```text
 .../chat-app/node_modules/accepts/package.json | 30 ++++
 .../chat-app/node_modules/array-flatten/...    | ...
```

**你会看到几百行 `node_modules` 的路径。**

**立刻停止并修正。**

## 4.5 提交

```text
git commit -m "第03周项目：带记忆的对话应用（Express + 模型接入 + JSON 存储）"
```

**如果提交信息想写多行：**

**在 Git Bash 或 PowerShell 里：**

```text
git commit -m "第03周项目：带记忆的对话应用" -m "包含：多会话管理、上下文记忆、超时与错误处理、本地假模型"
```

**两个 `-m` 会生成：**

```text
第03周项目：带记忆的对话应用

包含：多会话管理、上下文记忆、超时与错误处理、本地假模型
```

**第一行是"标题"，后面是"正文"。**

**这是 Git 的惯例：**

```text
第一行：不超过 50 字，一句话说清
空一行
正文：详细说明，可以分段
```

**为什么这样：**
因为 `git log --oneline` 只显示第一行。**第一行要让 `--oneline` 看得懂。**

## 4.6 验证提交

```text
git log --oneline -3
```

**应该看到你的新提交在最上面。**

**看它改了什么：**

```text
git show --stat HEAD
```

**应该看到文件列表和统计。**

**关键检查：里面没有 `node_modules`、`.env`、`data`。**

**再看一眼有没有敏感内容：**

```text
git show HEAD | findstr /i "sk-"
```

**`findstr /i` 是什么：** 不区分大小写搜索。

**如果输出了 `sk-` 开头的东西：**

**立刻停下。这是密钥泄露。**

**处理步骤：**

```text
① 不要 push
② git reset --soft HEAD~1     （撤回提交，改动保留）
③ 从 .gitignore 修正规则
④ git rm --cached <那个文件>
⑤ 重新提交
```

**如果已经 push 了：**
**唯一的正确做法是立刻去后台吊销那个密钥并重新生成。** 删文件没用，历史里还在。

---

# 第 5 步：故意犯五个错（20 分钟）

## 错误 1：`git add .` 加进一切

**操作（在课程仓库根目录）：**

```text
git add .
git status
```

**会看到什么：**

```text
Changes to be committed:
  new file:   每周课程/.../sandbox/...
  new file:   每周课程/.../第01节课/03-练习代码/...
  new file:   每周课程/.../chat-app/node_modules/...（如果有）
  ...
```

**问题：**

- `sandbox` 是练手仓库，不该进课程仓库
- 其他练习文件也在
- 可能还有 `node_modules`

**怎么修：**

```text
git restore --staged .
```

**这条命令把暂存区全部清空，改动都还在工作区。**

**然后重新只 add 你要的那个目录。**

**这个错误我做课件的过程中也犯过。** 用 `git add -A` 之后发现把 `sandbox` 的 `.git` 也一起加进去了。

**教训：在课程仓库里，永远不要用 `git add .` 或 `git add -A`。**

**用具体路径。**

## 错误 2：`node_modules` 已经进了提交

**操作：**

1. 临时把 `.gitignore` 里的 `node_modules/` 注释掉（前面加 `#`）；
2. `git add 那个 chat-app 目录`；
3. `git status` 看——`node_modules` 全在里面了。

**现在怎么修：**

```text
git restore --staged 每周课程/.../chat-app/node_modules
```

**然后恢复 `.gitignore` 里的那一行。**

**注意：`restore --staged` 只是从暂存区拿出来，本地文件都还在。**

**如果你已经 `commit` 了：**

```text
git rm -r --cached 每周课程/.../chat-app/node_modules
git commit -m "从版本库移除 node_modules"
```

**`--cached` 保证本地文件不删。**

**如果你已经 `push` 了：**

**那就麻烦了。** 仓库已经变大了，`git rm` 只是让新提交里没有它，**但历史里还占着空间。**

**需要重写历史（`git filter-repo`），这是进阶操作，本课不要求。**

**教训：`push` 之前一定要检查。**

## 错误 3：提交信息写得太烂

**操作：**

```text
git commit -m "update"
```

**会成功。** Git 不检查信息质量。

**问题在哪：**

**三个月后你打开 `git log --oneline`：**

```text
a1b2c3d update
d4e5f6g update
g7h8i9j 改了一下
j0k1l2m fix
```

**完全不知道每次改了什么。**

**当你发现一个 bug，想找"是哪次引入的"：**

**只能一次次 `git show` 点开看。** 这就是浪费几小时。

**好的提交信息 vs 差的：**

| 差 | 好 |
|---|---|
| `update` | `修复购物车小计多算购物袋的问题` |
| `fix bug` | `修复分页第 2 页少显示一条的问题` |
| `改了一下` | `把日期格式化从 toLocaleString 改成手动补零` |
| `1` | `第23节课：提交第一个版本` |

**如果你已经提交了错误信息：**

```text
git commit --amend -m "正确的信息"
```

**`--amend` 是什么：** 修改最近一次提交。

**注意：`--amend` 会改写提交的哈希。**

**如果已经 push 了，`amend` 之后需要强制推送，可能影响别人。** 团队协作时慎用。

**实测：** 我在自己的测试仓库里试了：

```text
提交前：
e0ae3ca 错的信息
9bc0f61 A

amend 后：
30d0873 修正后的信息
e0ae3ca 错的信息
```

**注意哈希变了（`e0ae3ca` → `30d0873`）。**

## 错误 4：把 `data/` 提交了

**操作：**

1. 暂时从 `.gitignore` 删掉 `data/`；
2. 先跑一下应用，让 `data/` 里有真实数据；
3. `git add` 那个 chat-app 目录。

**会看到什么：**

```text
new file:   每周课程/.../chat-app/data/chat.json
new file:   每周课程/.../chat-app/data/messages.json
```

**问题：**

**这些文件里是你的测试数据。** 比如：

```json
{
  "sessions": [
    { "title": "我叫小明", "messages": [...] }
  ]
}
```

**别人 clone 下来会看到你的对话内容。**

**而且别人跑起来后，这个文件一直被改，Git 会一直提示"有未提交改动"（叫"脏工作区"）。**

**怎么修：**

```text
git restore --staged 每周课程/.../chat-app/data
```

**然后 `.gitignore` 加回 `data/`。**

**验证代码能自己创建目录：**

```text
rmdir /s /q 每周课程\...\chat-app\data
```

**然后启动应用，应该是正常启动，发一条消息后 `data` 目录自动出现。**

## 错误 5：忘了 `.env.example`

**操作：**

**把 `.env.example` 从目录里删掉（或者改名），然后提交。**

**问题：**

**别人 clone 下来后：**

```text
看代码发现用了 process.env.LLM_BASE_URL
但不知道要配哪些变量
不知道值该写成什么样
只能去读 llm.js 源码
```

**这就是"没有 `.env.example` 的痛苦"。**

**`.env.example` 应该长这样（有说明，不是只有变量名）：**

```text
# 模型接口地址。注意要写到 /v1，代码会拼 /chat/completions
LLM_BASE_URL=https://api.example.com/v1

# 你的 API 密钥。不要加引号，不要提交真实值
LLM_API_KEY=在这里填你的密钥

# 模型名称，看你用的服务商提供哪些
LLM_MODEL=example-model

# 超时毫秒数。太短会频繁超时，太长会让用户等太久
LLM_TIMEOUT_MS=15000

# 每次最多生成多少 token，这是成本的硬上限
LLM_MAX_TOKENS=500
```

**注意每一行上面的注释。**

**为什么：** 因为你三个月后也会忘。**注释是给未来的自己看的。**

## 五个错误总结

```text
git add .              → 加进一堆不该加的文件
node_modules 入库       → 仓库爆炸，push 后很难清
提交信息烂             → 三个月后找 bug 花几小时
data/ 入库             → 泄露测试数据，工作区一直脏
忘了 .env.example      → 别人不知道怎么配
```

**提交前的四个必查（背下来）：**

```text
① git add -n <路径>           先看会加什么
② git status                  确认没有 node_modules / .env / data
③ git diff --staged --stat    看清改了哪些文件
④ git show HEAD | findstr /i "sk-"   查有没有密钥
```

---

# 第 6 步：建一个"提交前检查"习惯（10 分钟）

## 6.1 为什么要建这个习惯

**因为提交是"进入历史"的动作。**

**进入历史之后：**

```text
小问题：多一次提交就能修
大问题：需要重写历史，可能影响所有人
```

**所以"进入历史之前"是最后一道闸。**

## 6.2 四个必查动作

**以后每次提交前，按顺序做这四件事：**

### 第一件：`git status`

```text
git status
```

**看两件事：**

- 有没有 `??` 开头的意外文件（新文件）；
- 暂存区里有没有不该有的东西。

### 第二件：`git diff --staged --stat`

```text
git diff --staged --stat
```

**看清"这次改了哪些文件、分别改了多少行"。**

**如果某个文件改动行数特别大（比如 800 行），问一句"为什么会这么大"：**

```text
package-lock.json 800 行 → 正常（依赖锁定）
src/app.js 800 行        → 可疑（你是不是贴了一大段？）
```

### 第三件：查密钥

```text
git diff --staged | findstr /i "sk-"
git diff --staged | findstr /i "password"
git diff --staged | findstr /i "secret"
```

**如果输出里出现真实的值，停下。**

### 第四件：`git log --oneline -3`

```text
git log --oneline -3
```

**看一眼你之前几次提交的信息。**

**如果前三次都是 `update`、`fix`、`改了一下`，你该改改习惯了。**

## 6.3 一个自动化的小技巧

**把检查写成一个脚本。**

**新建 `check-before-commit.bat`（放在仓库根目录，不用提交）：**

```bat
@echo off
echo ===== 1. 状态 =====
git status --short

echo.
echo ===== 2. 暂存区统计 =====
git diff --staged --stat

echo.
echo ===== 3. 密钥检查 =====
git diff --staged | findstr /i "sk- password secret token"
if errorlevel 1 echo   （没有发现可疑字符串）

echo.
echo ===== 4. 最近提交 =====
git log --oneline -3
```

**每次提交前双击运行一下。**

**为什么不提交这个脚本：**
因为它只是你个人的习惯工具。**除非团队要统一，否则不该进仓库。**

**加进 `.gitignore`：**

```text
check-before-commit.bat
```

## 6.4 `git commit` 时的检查清单

**在笔记里写一遍（用你自己的话）：**

```text
提交前我要检查：
1.
2.
3.
4.
```

**以后每次提交前扫一眼这张清单。**

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 23 节课学习笔记

## 一、三类文件

| 类别 | 例子 | 判断方法 |
|---|---|---|
| 必须提交 | | |
| 绝对不提交 | | |
| 不该提交 | | |

## 二、我判断错的文件

我以为该提交的：

实际不该，因为：

## 三、`package-lock.json` 为什么要提交

`package.json` 里的 `^4.22.3` 是什么意思：

只提交 `package.json` 会有什么风险：

## 四、`.env.example` 为什么必须提交

没有它会怎样：

我写的 `.env.example` 有哪些注释：

## 五、`.env.*.local` 为什么不写成 `.env*`

如果写成 `.env*`，会误伤哪个文件：

`git check-ignore -v .env.example` 有输出说明什么：

## 六、`git rm --cached` 和 `git rm` 的区别

`--cached`：

不加 `--cached`：

什么时候用哪个：

## 七、为什么不用 `git add .`

我实际看到的多余文件：

正确的做法：

## 八、提交前的四个检查

1.
2.
3.
4.

## 九、我的提交记录

我这次提交了几次：

每次的信息：

`git show --stat HEAD` 显示改了哪些文件：

## 十、`--amend` 的效果

哈希变了吗：

如果已经 push 了会怎样：

## 十一、五个错误的后果

| 错误 | 现象 | 怎么修 |
|---|---|---|
| git add . | | |
| node_modules 入库 | | |
| 提交信息烂 | | |
| data/ 入库 | | |
| 忘 .env.example | | |

## 十二、我还不懂的词

- 

## 十三、完成检查

- [ ] 我的 chat-app 已经提交进 Git
- [ ] 提交里没有 `node_modules`
- [ ] 提交里没有 `.env`
- [ ] 提交里没有 `data/`
- [ ] 有 `.env.example` 且有注释
- [ ] 有 README，写了怎么跑
- [ ] README 里有"已知限制"
- [ ] 提交信息能让人看懂
- [ ] 我用 `git add -n` 演练过一次
- [ ] 我做过五个错误的实验
```

---

# 第 8 步：课后练习

## 练习一：给这个项目补一个 LICENSE

**要求：**

1. 在 `chat-app` 里加一个 `LICENSE` 文件；
2. 用 MIT 协议（最简单的开源协议）；
3. 提交，信息写清楚。

**为什么：**
因为**没有协议的代码，别人在法律上不能使用。** "开源"不只是"公开"。

**MIT 协议的内容大概是这样（自己写，不要抄全文）：**

```text
MIT License

Copyright (c) 2026 你的名字

Permission is hereby granted, free of charge, ...
```

**如果要完整版，可以查一下"MIT License 模板"。但至少要有：**

- 标题 `MIT License`
- 版权声明行
- 允许使用的说明

## 练习二：写一次"多行提交信息"

**要求：**

1. 改三个文件（比如同时改 README、app.js 的一行注释、加一个空的新文件）；
2. 用两个 `-m` 写标题 + 正文；
3. `git log` 看效果；
4. `git log --oneline` 看只显示标题。

**思考：为什么 `--oneline` 只显示第一行？这对写提交信息有什么要求？**

## 练习三：检查一个真实的风险

**要求：**

1. 在你的项目里搜一遍所有文件，找有没有硬编码的密钥；
2. 用命令：

   ```text
   findstr /s /i "sk- Bearer password secret" *.js *.md *.json
   ```

3. 如果有，改成从 `process.env` 读。

**注意：`sk-xxxx` 这种占位符不用改。** 要改的是真实的密钥。

## 练习四：找出这段操作流程的三个问题

```text
① git add .
② git commit -m "更新"
③ git push
```

**提示方向：** add 了什么、信息质量、push 前没检查。

## 练习五：用自己的话讲

```text
为什么 node_modules 不该提交？
为什么 package-lock.json 该提交？
为什么 .env 绝对不能提交，即使之后删掉也没用？
为什么提交信息的第一行特别重要？
```

---

# 第 9 步：最终验收

## A. 判断能力

- [ ] 我能判断一个文件该不该提交
- [ ] 我知道 `node_modules` 为什么不该提交
- [ ] 我知道 `package-lock.json` 为什么该提交
- [ ] 我知道 `data/` 为什么不该提交
- [ ] 我知道 `.env.example` 为什么必须提交

## B. `.gitignore`

- [ ] 我的 `.gitignore` 有 10 条以上规则
- [ ] `node_modules/` 被忽略
- [ ] `.env` 被忽略
- [ ] `.env.example` **没有**被忽略
- [ ] `data/` 被忽略
- [ ] 我用 `git check-ignore -v` 逐条验证过

## C. 提交质量

- [ ] 我做了至少 1 次提交
- [ ] 提交里没有 `node_modules`
- [ ] 提交里没有 `.env`
- [ ] 提交里没有 `data/`
- [ ] 提交信息能让人看懂做了什么
- [ ] 我有 README，包含"怎么跑"和"已知限制"

## D. 安全检查

- [ ] 我用 `git diff --staged | findstr /i "sk-"` 查过
- [ ] 我没有把真实密钥提交上去
- [ ] 我知道"push 之后才发现密钥泄露"该怎么处理

## E. 操作熟练度

- [ ] 我会用 `git add -n` 演练
- [ ] 我会用 `git diff --staged --stat` 看统计
- [ ] 我会用 `git show --stat HEAD` 验证提交
- [ ] 我会用 `git rm -r --cached` 移除误加的文件
- [ ] 我会用 `git commit --amend` 改提交信息

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有"提交前的四个检查"
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **提交不是"把文件存起来"，是"把一段可解释的历史写进项目"。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `node_modules` 被提交了 | 没 `.gitignore` 或先 add 了 | `git rm -r --cached node_modules` |
| `.env` 被提交了 | 同上 | 立刻吊销密钥 + `git rm --cached .env` |
| `.env.example` 提交不上去 | `.gitignore` 里写了 `.env*` | 改成 `.env.local` 之类具体规则 |
| `data/` 一直显示有改动 | 提交了运行时数据 | `git rm -r --cached data` + 加 ignore |
| `git add .` 加多了 | 没指定路径 | `git restore --staged .` 重来 |
| 提交信息写错了 | 已提交 | `git commit --amend -m "新的"` |
| `--amend` 后 push 被拒 | 哈希变了 | 确认没别人用这个分支再 `push -f` |
| 想撤销最近一次提交但保留改动 | 改错了 | `git reset --soft HEAD~1` |
| `Aborting commit due to empty commit message` | 信息为空 | 写一句话 |
| `package-lock.json` 有冲突 | 多人同时改依赖 | 一般取一边后重新 `npm install` |
| 仓库太大 | 历史里有大文件 | 需要 `git filter-repo`（进阶） |
| 提交后发现有文件忘了加 | 少了一个文件 | 补一个提交，不用 amend |
