# 第 24 节课：查看历史——找出"这行代码是谁改的"

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你提交了项目。现在历史里有一堆提交。
> 这节课学的是**在历史里查东西**：某个文件改过几次、某一行是谁改的、某个 bug 是哪次引入的。

**建议用时**：100 分钟
**你需要先完成**：第 22、23 节课（有 sandbox 和已提交的 chat-app）

---

# 第 0 步：为什么"查历史"是核心能力（10 分钟）

## 0.1 一个真实场景

**周五下午，网站坏了。** 用户说"上周还能用"。

**你要回答三个问题：**

```text
① 上周到现在，代码改了什么？
② 这个文件最近谁改过？
③ 报错的那一行，是哪次改的？
```

**不会查历史的人：**

```text
翻聊天记录，问同事，重新读一遍所有代码
→ 两小时
```

**会查历史的人：**

```text
git log --since="1 week ago" --oneline
git log -p -- src/app.js
git blame src/app.js
→ 十分钟
```

## 0.2 今天要学的五个命令

```text
git log            看提交列表
git show           看某次提交的完整内容
git diff           看两个状态之间的差异
git blame          看每一行是谁改的
git log -S         搜"某段文字是什么时候加的"
```

**这五个是"历史调查"的主力。** 其他都是它们的参数组合。

## 0.3 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `history.md` | `03-练习代码` | 你的历史调查报告 |

---

# 第 1 步：先造一批可查的历史（20 分钟）

## 1.1 为什么需要更多历史

**你的 `sandbox` 现在只有几次提交。查起来没意思。**

**先造 6 次有意义的提交，才能练出感觉。**

## 1.2 建一个练习仓库

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第04周-Git与回滚\第03节课\03-练习代码
   ```

2. 新建文件夹 `history-lab`。
3. 进去，地址栏输入 `cmd`，确认路径。
4. 初始化：

   ```text
   git init
   git config user.name "你的名字"
   git config user.email "you@example.com"
   ```

## 1.3 按顺序做六次提交

**照着做，每条命令都要真的执行。**

### 提交 1：创建文件

```text
echo # 计算器项目 > README.md
git add README.md
git commit -m "初始化项目：添加 README"
```

### 提交 2：加一个计算函数

**新建 `calc.js`，用记事本或 VS Code 写：**

```javascript
function add(a, b) {
  return a + b;
}

module.exports = { add };
```

```text
git add calc.js
git commit -m "添加 add 函数"
```

### 提交 3：加减法

**把 `calc.js` 改成：**

```javascript
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = { add, subtract };
```

```text
git add calc.js
git commit -m "添加 subtract 函数"
```

### 提交 4：加乘法（故意留个 bug）

**把 `calc.js` 改成：**

```javascript
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a + b;      // ← 故意写错：应该是 a * b
}

module.exports = { add, subtract, multiply };
```

**注意这个 bug：`multiply` 里写成了 `a + b`。**

```text
git add calc.js
git commit -m "添加 multiply 函数"
```

### 提交 5：改 README

**把 `README.md` 改成：**

```text
# 计算器项目

支持 add、subtract、multiply 三个函数。

## 用法

const { add } = require("./calc");
console.log(add(1, 2));
```

```text
git add README.md
git commit -m "更新 README：补充用法说明"
```

### 提交 6：修掉那个 bug

**把 `calc.js` 里的这一行改回来：**

```javascript
function multiply(a, b) {
  return a * b;
}
```

```text
git add calc.js
git commit -m "修复 multiply 用成了加法的问题"
```

## 1.4 现在看历史

```text
git log --oneline
```

**应该看到六条：**

```text
xxxxxxx 修复 multiply 用成了加法的问题
xxxxxxx 更新 README：补充用法说明
xxxxxxx 添加 multiply 函数
xxxxxxx 添加 subtract 函数
xxxxxxx 添加 add 函数
xxxxxxx 初始化项目：添加 README
```

**（哈希值你的会和我不一样，这没关系。）**

**这就是你要调查的"历史现场"。**

**现在有六次提交、两个文件、一个曾经存在的 bug。**

**接下来每个命令都在这上面练。**

---

# 第 2 步：`git log` 的六种用法（25 分钟）

## 2.1 基本用法

```text
git log
```

**会进入一个"分页器"，显示完整信息：**

```text
commit b6a0d70f3e8c9a1b2c3d4e5f6a7b8c9d0e1f2a3 (HEAD -> main)
Author: 测试 <test@example.com>
Date:   Mon Nov 16 11:29:53 2026 +0800

    修复 multiply 用成了加法的问题

commit ...
```

**每一项包含：**

| 部分 | 内容 |
|---|---|
| `commit b6a0d70...` | 完整哈希 + 当前分支指向 |
| `Author:` | 作者和邮箱 |
| `Date:` | 提交时间 |
| 空行之后 | 提交信息 |

**`(HEAD -> main)` 是什么：**
告诉你"HEAD 指向 main，main 指向这个提交"。**这就是第 22 节课的三层指针。**

**怎么退出：**
按 `q`。

**这个一定要记住。** 很多人第一次 `git log` 之后以为终端卡死了。

## 2.2 `--oneline`：只看一行

```text
git log --oneline
```

**输出：**

```text
b6a0d70 修复 multiply 用成了加法的问题
196590b 更新 README：补充用法说明
76450c4 添加 multiply 函数
...
```

**每一项是：短哈希 + 提交信息的第一行。**

**注意"第一行"：** 如果你的提交信息有多行，这里只显示第一行。

**这就是第 23 节课说的"第一行要让 `--oneline` 看得懂"。**

## 2.3 `--stat`：看每次改了哪些文件

```text
git log --stat --oneline
```

**输出会变长：**

```text
b6a0d70 修复 multiply 用成了加法的问题
 calc.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

196590b 更新 README：补充用法说明
 README.md | 8 ++++++++
 1 file changed, 8 insertions(+)
```

**读法：**

```text
calc.js | 2 +-          改了这个文件，2 行变化（1 加 1 删）
README.md | 8 ++++++++  改了 8 行，全是新增
```

**`+` 和 `-` 的数量就是"加了几行、删了几行"。**

**这个用法最实用：** 快速看"每次提交影响了哪些文件"，不用读具体代码。

**只看最近 3 次：**

```text
git log --stat --oneline -3
```

**`-3` 是什么：** 只显示最近 3 条。

## 2.4 `-p`：看具体改了什么

```text
git log -p --oneline -1
```

**`-p` 是什么：** patch，显示每行改动。
**`-1` 是什么：** 只看最近 1 条。

**输出：**

```text
b6a0d70 修复 multiply 用成了加法的问题
diff --git a/calc.js b/calc.js
index 83db48f..4de8fd7 100644
--- a/calc.js
+++ b/calc.js
@@ -1,3 +1,3 @@
 function multiply(a, b) {
-  return a + b;
+  return a * b;
 }
```

**逐行读 diff：**

| 行 | 意思 |
|---|---|
| `diff --git a/calc.js b/calc.js` | 在比较 calc.js 的两个版本 |
| `index 83db48f..4de8fd7 100644` | 改前哈希..改后哈希 + 文件权限 |
| `--- a/calc.js` | 旧版本 |
| `+++ b/calc.js` | 新版本 |
| `@@ -1,3 +1,3 @@` | 旧版本从第 1 行起 3 行，新版本从第 1 行起 3 行 |
| ` function multiply(a, b) {` | 空格开头 = 没变 |
| `-  return a + b;` | `-` 开头 = 删掉的 |
| `+  return a * b;` | `+` 开头 = 新加的 |

**`@@` 那一行怎么读：**

```text
@@ -1,3 +1,3 @@
   ↑   ↑ ↑   ↑
   |   | |   └─ 新版本：从第 1 行开始，共 3 行
   |   | └───── 
   |   └─────── 旧版本：从第 1 行开始，共 3 行
   └─────────── 旧版本标记
```

**这个一定要会读。** 因为**所有 diff 工具（GitHub、VS Code、PR 界面）都用同样的格式。**

## 2.5 筛选：按时间、按作者、按文件

### 按时间

```text
git log --oneline --since="1 hour ago"
git log --oneline --since="2026-11-01"
git log --oneline --until="2026-11-15"
git log --oneline --since="1 week ago" --until="yesterday"
```

**时间表达法很灵活：**

```text
"1 hour ago"
"2 days ago"
"1 week ago"
"2026-11-16"
"yesterday"
"last monday"
```

### 按作者

```text
git log --oneline --author="你的名字"
```

**在团队里这个最常用：** "我上周做了什么"。

### 按文件

```text
git log --oneline -- calc.js
```

**注意 `--` 这个分隔符。**

**为什么需要它：**
因为 Git 要区分"这是分支名/文件名"。

```text
git log --oneline -- calc.js      只显示改了 calc.js 的提交
git log --oneline calc.js         会被理解成"查看 calc.js 这个分支"
```

**规则：跟文件名时，一律加 `--`。**

**试试看：**

```text
git log --oneline -- calc.js
```

**应该只看到 4 条**（提交 2、3、4、6 都改了 `calc.js`，提交 1 和 5 没改）。

```text
git log --oneline -- README.md
```

**应该只看到 2 条**（提交 1 和 5）。

## 2.6 组合筛选

```text
git log --oneline --since="1 week ago" --author="你的名字" -- calc.js
```

**这条命令的意思是：**

```text
最近一周 + 我提交的 + 改过 calc.js 的
```

**这就是"历史调查"的典型用法。**

## 2.7 六种用法总结

| 用法 | 看什么 | 什么时候用 |
|---|---|---|
| `git log` | 完整信息 | 需要看作者、时间 |
| `--oneline` | 一行一条 | 快速扫一遍 |
| `--stat` | 改了哪些文件 | 找"哪次动了这个文件" |
| `-p` | 具体改动 | 看"具体改了什么" |
| `--since` / `--author` | 筛选 | 缩小范围 |
| `-- 文件` | 单文件历史 | 追某个文件 |

**组合起来就是：**

```text
git log --oneline --stat --since="1 week ago" -- calc.js
```

**"最近一周谁改过 calc.js，改了几行"。**

---

# 第 3 步：`git show` 和 `git diff`（25 分钟）

## 3.1 `git show`：看某一次提交

```text
git show HEAD
```

**显示最近一次提交的完整信息 + 具体改动。**

**看指定提交：**

```text
git show 76450c4
```

**（用你自己的哈希）**

**只看统计：**

```text
git show --stat 76450c4
```

**看某次提交里某个文件：**

```text
git show 76450c4:calc.js
```

**注意那个冒号。**

**`<提交>:<文件路径>` 是什么：**
"取出那个提交里那个文件的内容"。

**这个用法非常有用：**

```text
想看"上一次提交时这个文件长什么样"
想看"一个月前这个配置是什么"
```

**注意路径写法：**

```text
git show HEAD:calc.js                 仓库根目录的 calc.js
git show HEAD:src/app.js              子目录里的
git show HEAD:./calc.js               相对当前目录（某些版本支持）
```

**完整路径最保险。**

## 3.2 `git diff`：看两个状态之间的差异

**`diff` 有四种常见用法，容易搞混。**

### 用法一：工作区 vs 暂存区

```text
git diff
```

**意思：我改了但还没 add 的东西。**

**做实验：**

1. 改一下 `calc.js`（随便加个空格）；
2. 运行 `git diff`；
3. 你会看到改动。

**这时候 `git status` 显示 `modified: calc.js`。**

### 用法二：暂存区 vs 上次提交

```text
git diff --staged
```

**意思：我 add 了但还没 commit 的东西。**

**做实验：**

1. 接着上面，`git add calc.js`；
2. 运行 `git diff` → **没有输出**（因为工作区已经和暂存区一样了）；
3. 运行 `git diff --staged` → **看到改动**。

**这两个的区别就是"暂存区"这一层。**

### 用法三：工作区 vs 某次提交

```text
git diff HEAD
```

**意思：我现在的工作区，和上次提交比，差了什么。**

**注意：它包含了"已 add"和"未 add"的所有改动。**

**对比：**

```text
git diff            只显示未 add 的
git diff --staged   只显示已 add 的
git diff HEAD       显示全部（未 add + 已 add）
```

**这个对比非常重要。** 很多人搞不清为什么 `git diff` 看不到自己刚 add 的改动。

### 用法四：两个提交之间

```text
git diff 76450c4 b6a0d70
```

**意思：从提交 A 到提交 B，改了什么。**

**也可以对比分支：**

```text
git diff main feature
```

**意思：feature 分支相对 main 改了什么。**

**这个在合并前很有用：**

```text
git diff main feature --stat
```

**先看统计，再决定要不要细看。**

## 3.3 `--stat` 和 `--name-only`

**不想读每一行，只看统计：**

```text
git diff --stat
git diff --staged --stat
```

**只想看文件名：**

```text
git diff --name-only
git diff --name-status
```

**`--name-status` 会带状态标记：**

```text
M       calc.js
A       newfile.js
D       deleted.js
```

| 标记 | 意思 |
|---|---|
| `M` | Modified，修改 |
| `A` | Added，新增 |
| `D` | Deleted，删除 |
| `R` | Renamed，重命名 |

**这个在"提交前检查"时特别有用**（第 23 节课的那四个检查）。

## 3.4 一个救命用法：`--check`

```text
git diff --check
```

**检查"有没有空白字符错误"（比如行尾多余空格、Tab 和空格混用）。**

**有问题的行会被列出来：**

```text
calc.js:5: trailing whitespace.
+  return a + b; 
```

**为什么重要：**
因为它会让 diff 里出现"看起来没改动但实际改了"的行。**这会掩盖真正的改动。**

**什么时候用：**
提交前跑一下。**很多项目在 CI 里强制检查这个。**

---

# 第 4 步：`git blame`——谁改的（20 分钟）

## 4.1 最基本的用法

```text
git blame calc.js
```

**输出（我在测试仓库里实际跑出来的）：**

```text
196590b4 (测 2026-11-16 11:29:53 +0800 1) line1
b6a0d70f (测 2026-11-16 11:29:54 +0800 2) line2 改了
196590b4 (测 2026-11-16 11:29:53 +0800 3) line3
```

**逐列读：**

| 列 | 内容 |
|---|---|
| `196590b4` | 这次改动来自哪个提交（短哈希） |
| `(测 ...)` | 谁改的、什么时候 |
| `1)` | 这是文件的第几行 |
| `line1` | 那一行的内容 |

**关键理解：**

```text
blame 显示的是"最后修改这一行的那次提交"
不是"创建这个文件的那次提交"
```

**注意第 2 行是 `b6a0d70f`（较新的提交），第 1、3 行是 `196590b4`（较早的提交）。**

**因为只有第 2 行被改过。**

## 4.2 `blame` 是用来干什么的

**不是用来"抓谁写的烂代码"。**

**三个真实用途：**

**用途一：找到一个 bug 的来龙去脉**

```text
看到一行奇怪的代码 → blame → 找到那次提交
→ git show 那个提交 → 看提交信息
→ 原来是为了修复某个特定问题才这么写的
```

**用途二：判断代码能不能改**

```text
这段代码看起来很怪
blame 发现是三个月前某次紧急修复加的
→ 先问清楚再改，可能是为了绕开某个坑
```

**用途三：找相关的人问问题**

```text
这行代码看不懂 → blame → 知道是谁改的 → 去问他
```

**注意：blame 在团队里是敏感操作。**

**如果你的团队文化是"blame 用来追责"，那这个团队有问题。**

**正确的用法是"理解历史"，不是"找人负责"。**

## 4.3 常用参数

### 只看某个范围的行

```text
git blame -L 10,20 calc.js
```

**只看第 10 到 20 行。**

**`-L` 是什么：** line range。

**这个在长文件里很有用。**

### 忽略空白改动

```text
git blame -w calc.js
```

**`-w` 是什么：** ignore whitespace。

**为什么需要：**
如果有人只是重新格式化了文件（改了缩进），`-w` 能让你看到"真正的逻辑改动是谁做的"，而不是"格式化的人"。

### 看到某次提交之前的状态

```text
git blame <某个提交> -- calc.js
```

**意思是：在那个提交的时间点，每一行是谁改的。**

## 4.4 `blame` 的一个陷阱

**如果文件被大改（比如整个文件重写），blame 会显示"所有行都是那次提交"。**

**这时它就没用了。**

**怎么办：**

```text
git blame -w -C -C calc.js
```

**`-C -C` 是什么：**
"复制检测"。**如果某段代码是从别的文件复制过来的，它会追踪到原始来源。**

**`-C` 写两次是"更激进的检测"（也检测同一文件内的移动）。**

**这个用法在"代码被移动/拆分"时特别有用。**

**现在用不上，但要知道有这个。**

## 4.5 一个替代方案：`git log -p -- 文件`

**如果你想看"这个文件完整的历史"，而不是"每行是谁改的"，用这个：**

```text
git log -p -- calc.js
```

**它会按时间倒序显示这个文件的每一次改动。**

**对比：**

| 命令 | 回答什么问题 |
|---|---|
| `git blame` | 这一行是谁改的 |
| `git log -p -- 文件` | 这个文件改过哪些次 |

**两个配合用最有效：**

```text
blame 找到可疑的那一行 → 拿到哈希
→ git show 那个哈希 → 看当时为什么这么改
```

---

# 第 5 步：`-S` 搜索——这段代码什么时候出现的（15 分钟）

## 5.1 问题场景

**你在代码里看到一段奇怪的逻辑：**

```javascript
if (value === "0") {
  value = 0;
}
```

**你想知道：这是谁、什么时候、为什么加的？**

**`git log -- 文件` 会显示所有改动，但太多。**

**你需要"只找包含这段文字的提交"。**

## 5.2 `-S` 的用法

```text
git log --oneline -S "line2 改了"
```

**输出（实测）：**

```text
b6a0d70 修改 b.txt 第二行
```

**只返回了一条：那次"加入或删除"这段文字的提交。**

**`-S` 是什么：**
"pickaxe"（镐）。**它查找"某段文字的出现次数发生变化"的提交。**

**什么叫"出现次数变化"：**

```text
某个提交让它从 0 次变成 1 次 → 命中了（新增）
某个提交让它从 1 次变成 0 次 → 命中了（删除）
某个提交让它从 1 次变成 2 次 → 命中了
某个提交只是把这一行挪了位置（次数不变）→ 不命中
```

**所以 `-S` 找的是"内容的增删"，不是"位置移动"。**

## 5.3 `-G` 和 `-S` 的区别

```text
git log --oneline -G "a \* b"
```

**`-G` 是什么：** 用正则匹配**改动的行**。

**`-S` vs `-G`：**

| | `-S` | `-G` |
|---|---|---|
| 匹配什么 | 字符串出现次数的变化 | 改动行里是否匹配正则 |
| 适合 | 找"这段代码是哪次加的" | 找"哪些改动涉及这种模式" |

**大多数情况用 `-S` 就够。** 需要正则时用 `-G`。

## 5.4 一个更实用的用法：找"删掉的代码"

```text
git log --oneline -S "return a + b" -- calc.js
```

**这会找到所有"加入或删除 `return a + b`"的提交。**

**在你的练习仓库里，应该会找到两条：**

```text
提交 4（添加 multiply，写成了 a + b）
提交 6（修复成 a * b，删掉了 a + b）
```

**这就是"这个 bug 的生命周期"：哪次引入的、哪次修掉的。**

**这个用法在排查"功能什么时候消失的"时特别有用：**

```text
用户说"以前有个导出按钮，现在没了"
→ git log --oneline -S "导出" -- src/
→ 找到删掉它的那次提交
→ git show 那次提交，看提交信息说了什么
```

## 5.5 组合起来：完整的"考古"流程

**假设有一个 bug，你要查清它的来龙去脉。**

```text
第一步：定位可疑代码
  读代码，找到那几行

第二步：看这几行是谁改的
  git blame -L 10,20 文件名

第三步：看那次提交的完整内容
  git show <哈希>

第四步：看提交信息说了什么
  （在 git show 的输出里）

第五步：如果信息不清楚，看这个文件的历史
  git log -p -- 文件名

第六步：如果还是不清楚，找相关的人
  （提交信息里有作者）
```

**这个流程能解决 90% 的"这段代码为什么是这样"的问题。**

---

# 第 6 步：故意犯五个错（15 分钟）

## 错误 1：`git log` 之后以为卡死了

**操作：**

```text
git log
```

**屏幕停住了，底部显示 `:`。**

**这不是卡死，是分页器。**

**怎么退出：** 按 `q`。

**其它分页操作：**

```text
空格      下一页
b         上一页
↑ ↓       逐行滚动
/关键词    搜索
q         退出
```

**`:` 是什么：** 分页器在等你输入命令。

**如果你看到 `(END)`，也是同一回事。**

**不想进分页器：**

```text
git --no-pager log
```

**或者：**

```text
git log --oneline | cat
```

**更简单：**

```text
git config --global core.pager ""
```

**这一行会彻底关掉分页器。**

**但建议留着：** 因为长输出时有分页器更好读。**养成按 `q` 的习惯就行。**

## 错误 2：`git diff` 看不到刚 add 的改动

**操作：**

1. 改 `calc.js`；
2. `git add calc.js`；
3. `git diff`。

**输出是空的。**

**为什么：** `git diff` 只比较"工作区 vs 暂存区"。你 add 之后两边一样了。

**用 `git diff --staged` 才能看到。**

**这个坑几乎每个新手都踩过。**

**记这一句：**

```text
git diff           未 add 的
git diff --staged  已 add 的
git diff HEAD      全部
```

## 错误 3：`git log -- 文件名` 忘了 `--`

**操作：**

```text
git log --oneline calc.js
```

**会看到什么：**

```text
fatal: ambiguous argument 'calc.js': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'
```

**Git 直接告诉你答案了：用 `--` 分隔。**

**为什么：**
Git 不知道 `calc.js` 是分支名还是文件名。**加 `--` 明确说"后面是路径"。**

**规则：**

```text
git log --oneline -- calc.js     ✅
git diff main -- calc.js         ✅
git show HEAD -- calc.js         ✅
```

## 错误 4：`git show 哈希:文件` 路径写错

**操作：**

```text
git show HEAD:./calc.js
```

**可能报错：**

```text
fatal: path './calc.js' exists on disk, but not in 'HEAD'
```

**为什么：**
Git 里的路径是"从仓库根目录算的"，不是"从当前目录算的"。

**正确写法：**

```text
git show HEAD:calc.js
```

**如果文件在子目录：**

```text
git show HEAD:src/app.js
```

**注意：不要写 `./`，也不要用反斜杠。**

## 错误 5：以为 `blame` 显示的是"创建者"

**操作：**

**在你的 `calc.js` 上跑 `blame`，然后看第一行 `function add(a, b) {`。**

**它显示的提交应该是"添加 add 函数"那次。**

**现在把文件整个重写一遍（改缩进、改函数名大小写），然后提交。**

**再跑 `blame`。**

**你会发现：所有行都变成"最后一次提交"了。**

**为什么：**
因为每个行都被改了。**blame 只看"最后一次修改这一行"的提交。**

**这说明：**
`blame` 在文件被大规模格式化/重写后就失效了。**这时要用 `git log -p -- 文件` 看完整历史。**

## 五个错误总结

```text
log 停住              → 按 q 退出
diff 看不到 add 的     → 用 --staged
log -- 忘 --          → 加 -- 分隔
show 哈希:路径 写错    → 从仓库根目录写，不加 ./
blame 当"创建者"      → 它只显示最后一次修改
```

---

# 第 7 步：做一次真实的历史调查（15 分钟）

## 7.1 任务

**在你的 `history-lab` 里，假装你是一个刚接手项目的人。**

**你要回答五个问题，并把答案写进 `history.md`。**

## 7.2 五个问题

**问题一：`multiply` 函数是哪次加的？**

**提示：**

```text
git log --oneline -S "function multiply"
```

**问题二：`multiply` 的 bug 是哪次引入的、哪次修的？**

**提示：**

```text
git log --oneline -S "return a + b" -- calc.js
```

**问题三：`README.md` 改过几次？分别是谁？**

**提示：**

```text
git log --stat -- README.md
```

**问题四：`calc.js` 第 10 行左右现在是谁改的？**

**（看你的文件实际行数）**

**提示：**

```text
git blame -L 8,12 calc.js
```

**问题五：如果我要回退到"添加 subtract 之后、添加 multiply 之前"的状态，该用哪个哈希？**

**提示：**

```text
git log --oneline
git show <某次提交> --stat
```

## 7.3 把答案写进 `history.md`

**自己敲：**

````markdown
# 历史调查报告

## 问题一：multiply 是哪次加的

命令：

输出：

结论：

## 问题二：bug 的生命周期

引入的提交：

修复的提交：

两次之间隔了几次提交：

## 问题三：README 的历史

改过几次：

每次的提交信息和作者：

## 问题四：calc.js 某几行是谁改的

命令：

输出：

结论：

## 问题五：回退该用哪个哈希

目标状态：

哈希：

验证方法（怎么确认那个提交是对的）：

## 我学到的一个新技巧

（写一个你觉得最有用的用法，以及它能解决什么问题）
````

## 7.4 一个额外的小任务

**用 `git show <哈希>:calc.js` 取出"添加 multiply 那次提交"的 `calc.js` 内容，贴到笔记里。**

**然后对比它和现在的版本差在哪。**

**这能让你体会到"任意历史版本都能取出"的能力。**

---

# 第 8 步：写学习笔记（10 分钟）

```markdown
# 第 24 节课学习笔记

## 一、`git log` 的六种用法

| 用法 | 看什么 | 什么时候用 |
|---|---|---|
| git log | | |
| --oneline | | |
| --stat | | |
| -p | | |
| --since / --author | | |
| -- 文件 | | |

## 二、diff 的四种用法（最容易混）

```text
git diff             →
git diff --staged    →
git diff HEAD        →
git diff A B         →
```

我实测的现象（add 之后 `git diff` 还有输出吗）：

## 三、`@@ -1,3 +1,3 @@` 怎么读

```text
@@ -1,3 +1,3 @@
```

第一个 `-1,3`：

`+1,3`：

## 四、`git blame` 的输出

```text
196590b4 (测 2026-11-16 11:29:53 +0800 1) line1
```

每一列是什么：

blame 显示的是"创建者"还是"最后修改者"：

## 五、`-S` 找什么

它匹配的是"字符串出现次数的变化"还是"改动行"：

我用它找到了什么：

## 六、为什么 `git log -- 文件` 要有 `--`

## 七、`git show HEAD:文件` 的路径规则

写 `./calc.js` 会怎样：

正确写法：

## 八、我的历史调查报告

五个问题的答案摘要：

## 九、五个错误的后果

| 错误 | 现象 | 怎么解决 |
|---|---|---|
| log 停住 | | |
| diff 看不到 add 的 | | |
| log -- 忘 -- | | |
| show 路径写错 | | |
| blame 当创建者 | | |

## 十、我还不懂的词

- 

## 十一、完成检查

- [ ] 我在 `history-lab` 里有 6 次提交
- [ ] 我能用 `--stat` 快速看每次改了哪些文件
- [ ] 我能读 `-p` 的 diff 输出
- [ ] 我知道 `diff` / `diff --staged` / `diff HEAD` 的区别
- [ ] 我用 `blame` 找到过某一行是谁改的
- [ ] 我用 `-S` 找到过某段代码是什么时候加的
- [ ] 我能用 `show 哈希:文件` 取出历史版本
- [ ] 我完成了五个问题的调查
- [ ] 我做过五个错误的实验
```

---

# 第 9 步：课后练习

## 练习一：给你的 chat-app 做一次历史调查

**在课程仓库根目录：**

1. 看 `chat-app` 的历史：

   ```text
   git log --oneline -- 每周课程/01-元技能与基础/第03周-后端与对话/第07节课/03-练习代码/chat-app
   ```

2. 看 `src/llm.js` 的历史：

   ```text
   git log -p -- 路径/src/llm.js
   ```

3. 用 `blame` 看 `llm.js` 里 `AbortSignal.timeout` 那一行。

**记录：这几个命令的输出和你在 `history-lab` 里看到的有什么不同（因为文件路径更长）。**

## 练习二：找出"最常被改的文件"

**要求：**

```text
git log --name-only --pretty=format: | sort | uniq -c | sort -rn
```

**这条命令做了什么（逐步解释）：**

```text
--name-only --pretty=format:   只输出文件名，不输出其他信息
| sort                        排序
| uniq -c                      统计每行出现次数
| sort -rn                     按次数倒序
```

**结果：出现次数最多的文件，就是"最常被改的文件"。**

**思考：为什么"最常被改"可能意味着"设计有问题"？**

## 练习三：找出"某次提交之前的文件版本"

**要求：**

1. 在 `history-lab` 里找到"添加 multiply"那次提交的哈希；
2. 用 `git show <哈希>:calc.js` 取出当时的版本；
3. 用 `git show <哈希>~1:calc.js` 取出**它之前**的版本。

**`~1` 是什么：** 上一个提交。

**思考：如果你想看"10 次提交之前"的版本，怎么写？**

## 练习四：找出这段命令的三个问题

```text
git log calc.js
git diff
git blame -L 1,5 ./calc.js
```

**提示方向：** 少了 `--`、`git diff` 可能看不到 add 的、路径不要 `./`。

## 练习五：用自己的话讲

```text
为什么 git log 会"停住"？
为什么 git diff 看不到已经 add 的改动？
为什么 blame 在文件被格式化后就没用了？
-S 和 blame 各解决什么问题？
```

---

# 第 10 步：最终验收

## A. `git log`

- [ ] 我会用 `--oneline`
- [ ] 我会用 `--stat`
- [ ] 我会用 `-p`
- [ ] 我会按时间筛选（`--since`/`--until`）
- [ ] 我会按作者筛选（`--author`）
- [ ] 我会按文件筛选（`-- 文件`）
- [ ] 我知道要看文件名必须加 `--`
- [ ] 我知道按 `q` 退出分页器

## B. `git show`

- [ ] 我会用 `git show <哈希>`
- [ ] 我会用 `git show --stat <哈希>`
- [ ] 我会用 `git show <哈希>:<路径>` 取历史版本
- [ ] 我知道路径要从仓库根目录写

## C. `git diff`

- [ ] 我知道 `git diff` 只看未 add 的
- [ ] 我知道 `git diff --staged` 看已 add 的
- [ ] 我知道 `git diff HEAD` 看全部
- [ ] 我会用 `git diff A B` 比两个提交
- [ ] 我会用 `--stat` / `--name-only` / `--name-status`
- [ ] 我能读 `@@ -1,3 +1,3 @@` 这种行

## D. `git blame`

- [ ] 我会用 `git blame 文件`
- [ ] 我会用 `-L` 限定行范围
- [ ] 我知道 `-w` 是忽略空白改动
- [ ] 我知道 blame 显示的是"最后修改者"

## E. `-S` 搜索

- [ ] 我会用 `git log -S "文字" -- 文件`
- [ ] 我知道它匹配的是"出现次数变化"
- [ ] 我用它找到过 bug 的引入和修复

## F. 实操

- [ ] `history-lab` 有 6 次提交
- [ ] `history.md` 完成了五个问题的调查
- [ ] 我取出过一个历史版本的文件内容
- [ ] 我做过五个错误的实验

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有 diff 四种用法的对比
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **Git 的历史不是"日志"，是可以随时打开、随时取出的完整档案库。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `git log` 停住 | 进了分页器 | 按 `q` |
| `git diff` 看不到改动 | 已 `add` | 用 `--staged` |
| `ambiguous argument` | 路径没加 `--` | `git log -- 文件` |
| `path exists on disk, but not in 'HEAD'` | 路径写法错 | 从仓库根目录写，不加 `./` |
| improve blame 全是同一提交 | 文件被格式化/重写 | 用 `git log -p -- 文件` |
| `git show` 输出太长 | 大提交 | 加 `--stat` 或指定文件 |
| 想看某文件的历史版本 | 不知道怎么写 | `git show HEAD~3:路径/文件` |
| 中文路径报错 | 编码问题 | 加双引号，或用 Git Bash |
| `-S` 搜不到 | 只改了位置没改内容 | 改用 `git log -p` 人工看 |
| 不知道该看哪个提交 | 历史太长 | 用 `--since` + `--author` + `-- 文件` 三重筛选 |
| `--name-status` 的字母看不懂 | 不认识标记 | M=改 A=加 D=删 R=改名 |
| `git diff --check` 报空白错误 | 行尾多余空格 | 编辑器设置"保存时删行尾空格" |
