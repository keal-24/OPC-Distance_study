# 第 27 节课：处理冲突

**建议用时**：165 分钟

## 本节课要解决的问题

上节课你学会了合并。但真实合并不会每次都顺利。

**这节课要解决的是：两个分支改了同一个地方，Git 不知道该听谁的。**

这不是报错，也不是你做错了。这是 Git 在说：

> 我判断不了，你来定。

**不会处理冲突，你就不敢用分支。** 不敢用分支，就只能所有人挤在一条线上改代码，最后互相覆盖。

**这节课你会学到：**

- 冲突是怎么产生的，为什么 Git 不自己决定；
- `<<<<<<<` `=======` `>>>>>>>` 这三个标记怎么读；
- 五种冲突类型（内容冲突、新增冲突、修改/删除冲突、删除/删除冲突、重命名冲突）；
- 三种解决方式：手动改、保留我这版、保留他那版；
- 怎么反悔（`--abort`）；
- 一个必须知道的坑：**冲突标记会被提交进 Git 历史**。

**这节课不学：** `git rebase` 的冲突处理（那是第 4 阶段的内容）、合并工具（图形界面）、`rerere`（自动记住解决方案）。这节课只用命令行手动解决。

**需要多久：** 90 分钟。其中至少 50 分钟是你自己在动手撞冲突。

---

## 第 0 步：建立本节课的练手仓库（10 分钟）

**为什么又要新建一个仓库：**

因为解决冲突的过程会反复制造"两边都改"的状态。在课程仓库里做，你分不清哪个是你的作业、哪个是冲突残留。

### 0.1 新建文件夹

**操作：**

1. 打开文件夹：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第04周-Git与回滚\第06节课\03-练习代码
   ```

2. 在空白处点鼠标右键 → 新建 → 文件夹。
3. 文件夹名字输入：

   ```text
   conflict-lab
   ```

4. 按 `Enter`。

**应该看到：** 出现一个叫 `conflict-lab` 的文件夹。

### 0.2 进这个文件夹打开终端

**操作：**

1. 双击进入 `conflict-lab`。
2. 点一下窗口上方的**地址栏**（显示路径的那一长条）。
3. 把里面的路径全选（`Ctrl + A`），输入：

   ```text
   cmd
   ```

4. 按 `Enter`。

**应该看到：** 弹出一个黑色（或深色）窗口，标题栏显示 `cmd.exe`，光标前面显示的路径以 `conflict-lab>` 结尾。

**如果弹出的窗口路径不是 conflict-lab：**
关掉它，重新进一次文件夹，确认地址栏显示的是 `...\conflict-lab`。

### 0.3 初始化仓库

**操作：** 在黑窗口里依次输入下面三行，每输入一行按一次 `Enter`。

```text
git init
```

```text
git config user.name "你的名字"
```

```text
git config user.email "你的邮箱"
```

**`user.name` 和 `user.email` 是什么：**
Git 每次提交都要记录"是谁提交的"。这两个命令就是告诉它。

**引号里的内容换成你自己的**，比如：

```text
git config user.name "张三"
git config user.email "zhangsan@example.com"
```

**应该看到：**

- 第一行输出 `Initialized empty Git repository in ...`
- 后两行**没有任何输出**。没有输出就是成功。这是命令行的规矩：成功不说话，失败才说话。

**如果 `git init` 报 `'git' 不是内部或外部命令`：**
说明 Git 没装好，或者装完没重开终端。去 `参考手册/01-环境搭建.md` 的 Git 部分重新装一遍，装完**关掉所有终端窗口再开**。

### 0.4 建一个配置文件

**操作：**

1. 在 `conflict-lab` 文件夹里，空白处右键 → 新建 → 文本文档。
2. 文件名改成：

   ```text
   config.js
   ```

3. 弹出"如果改变文件扩展名"提示，点"**是**"。
4. 右键这个文件 → 打开方式 → Visual Studio Code。
5. **自己一个字符一个字符敲**下面这段（不要复制）：

```javascript
const CONFIG = {
  siteName: "小栈",
  themeColor: "blue",
  pageSize: 10,
};

module.exports = CONFIG;
```

6. `Ctrl + S` 保存。

**这段代码在干什么（逐行读）：**

```javascript
const CONFIG = {          // 声明一个常量，名字叫 CONFIG，它是一个对象
  siteName: "小栈",        // 站点名字，字符串
  themeColor: "blue",     // 主题颜色，字符串
  pageSize: 10,           // 每页显示多少条，数字
};                        // 对象到这里结束，注意末尾有个分号

module.exports = CONFIG;  // 把这个对象导出，别的文件可以 require 它
```

**为什么用这个文件做冲突演示：**
因为它很短，一眼能看出哪几行被改过。真实项目里冲突可能出现在一个 800 行的文件里，那时候你要靠搜索 `<<<<<<<` 定位。

### 0.5 提交第一个版本

**操作：** 在终端里依次输入：

```text
git add .
```

```text
git commit -m "初始：创建 config.js"
```

**应该看到：** 类似

```text
[main (root-commit) 7a3d210] 初始：创建 config.js
 1 file changed, 7 insertions(+)
 create mode 100644 config.js
```

**`7a3d210` 是什么：** 这次提交的编号（哈希）。**你的和我的肯定不一样**，因为里面包含时间。不要照抄我的。

**第一步做完了。** 现在你有一个只有一次提交的干净仓库。

---

## 第 1 步：制造冲突（15 分钟）

**为什么要故意制造冲突：**

因为你以后遇到的冲突都是"不小心"产生的。**只有先故意造出来，你才知道它是怎么长出来的。** 就像学医要先认识健康的解剖结构，才能看出病变。

### 1.1 建一个功能分支

**操作：** 输入：

```text
git switch -c feature/dark
```

**`switch -c` 的两个字母 `-c` 是 `create`（创建）的缩写。** 意思是"新建一个分支，然后切过去"。

**应该看到：**

```text
Switched to a new branch 'feature/dark'
```

**确认自己在哪个分支：** 输入：

```text
git branch
```

**应该看到：** 两行，`feature/dark` 前面有个星号 `*`。

```text
* feature/dark
  main
```

**星号表示"我现在在这个分支上"。**

### 1.2 在分支上改两处

**操作：**

1. 用 Visual Studio Code 打开 `config.js`。
2. 把 `themeColor: "blue"` 改成：

   ```text
   themeColor: "dark-blue"
   ```

3. 把 `pageSize: 10` 改成：

   ```text
   pageSize: 20
   ```

4. `Ctrl + S` 保存。

**改完应该是这样：**

```javascript
const CONFIG = {
  siteName: "小栈",
  themeColor: "dark-blue",   // ← 改了
  pageSize: 20,              // ← 改了
};
```

5. 在终端提交：

```text
git commit -am "dark 分支：改主题色和分页"
```

**`-am` 是什么：** 两个参数合在一起。
- `-a` = 自动把所有**已跟踪**文件的修改加进暂存区（不用先 `git add`）；
- `-m` = 后面跟提交信息。

**注意：`-a` 只对"已经被 Git 跟踪过的文件"有效。** 新建的文件还是必须 `git add`。这个区别在第 6 节课讲过，这里再确认一次。

**应该看到：** `1 file changed, 2 insertions(+), 2 deletions(-)`

### 1.3 切回主分支改另一处

**操作：**

```text
git switch main
```

**应该看到：** `Switched to branch 'main'`

**现在打开 `config.js` 看一眼。**

**你会看到：**

```javascript
const CONFIG = {
  siteName: "小栈",
  themeColor: "blue",
  pageSize: 10,
};
```

**刚才改的两处不见了！**

**为什么？** 因为那些改动在 `feature/dark` 分支上。切回 `main`，文件内容就恢复成 `main` 最后一次提交的样子。

**这不是丢数据，是切换。** 第 25 节课你已经见过这个现象了。

### 1.4 在 main 上改第三处

**操作：**

1. 把 `siteName: "小栈"` 改成：

   ```text
   siteName: "小栈便利店"
   ```

2. `Ctrl + S` 保存。
3. 提交：

```text
git commit -am "main：改站点名"
```

**现在的状态：**

```text
main 分支：改了 siteName（第 2 行）
feature/dark 分支：改了 themeColor 和 pageSize（第 3、4 行）
```

**两个分支改的是不同的行，但都在同一个对象里。** 这就是冲突的土壤。

### 1.5 执行合并

**操作：** 输入：

```text
git merge feature/dark
```

**应该看到：** 注意，这一次不再是上节课那种漂亮的 `Merge made by`，而是：

```text
Auto-merging config.js
CONFLICT (content): Merge conflict in config.js
Automatic merge failed; fix conflicts and then commit the result.
```

**逐句读这三行：**

| 输出 | 意思 |
|---|---|
| `Auto-merging config.js` | Git 试着自动合并这个文件 |
| `CONFLICT (content): Merge conflict in config.js` | **内容冲突**：同一个文件里同一块地方，两边改得不一样 |
| `Automatic merge failed; fix conflicts and then commit the result.` | 自动合并失败，你手动解决，然后再提交 |

**注意最后一句：`and then commit the result`。**

**Git 没有失败，它在等你做决定。** 合并流程还在进行中，只是暂停了。

**第一步做完了。冲突已经造出来了。**

---

## 第 2 步：读懂冲突标记（20 分钟）

**这一步是整节课最重要的。** 90% 的人怕冲突，是因为不会读那三个标记。

### 2.1 打开冲突文件

**操作：** 在 Visual Studio Code 里打开 `config.js`。

**你会看到：**

```javascript
const CONFIG = {
<<<<<<< HEAD
  siteName: "小栈便利店",
  themeColor: "blue",
  pageSize: 10,
=======
  siteName: "小栈",
  themeColor: "dark-blue",
  pageSize: 20,
>>>>>>> feature/dark
};

module.exports = CONFIG;
```

**这不再是合法的 JavaScript 了。** 如果你现在 `node config.js`，会报错。

**先别管报错，先把标记读懂。**

### 2.2 三个标记的含义

```text
<<<<<<< HEAD
```

**七个小于号 + 空格 + `HEAD`。**

意思是：**下面这段内容来自"我当前所在的分支"（也就是 main）。**

`HEAD` 在这里就代表 main，因为你的 HEAD 指向 main。

```text
=======
```

**七个等号。**

意思是：**上面那段是我的，下面那段是对方的，分界线在这里。**

```text
>>>>>>> feature/dark
```

**七个大于号 + 空格 + 分支名。**

意思是：**对方那段内容到这里结束，它来自 `feature/dark` 分支。**

### 2.3 完整结构图

```text
<<<<<<< HEAD                    ← 开始：我的版本
  siteName: "小栈便利店",
  themeColor: "blue",
  pageSize: 10,
=======                         ← 分界：我的结束，对方的开始
  siteName: "小栈",
  themeColor: "dark-blue",
  pageSize: 20,
>>>>>>> feature/dark            ← 结束：对方版本结束
```

**一段一段看：**

| 行 | 来源 | 内容 |
|---|---|---|
| `siteName: "小栈便利店"` | 我的（main） | 我改过的 |
| `themeColor: "blue"` | 我的（main） | 原来的 |
| `pageSize: 10` | 我的（main） | 原来的 |
| `siteName: "小栈"` | 对方的（feature/dark） | 原来的 |
| `themeColor: "dark-blue"` | 对方的（feature/dark） | 对方改过的 |
| `pageSize: 20` | 对方的（feature/dark） | 对方改过的 |

### 2.4 一个非常重要的认知

**看这张表，你会发现一件事：**

```text
我只改了 siteName
对方只改了 themeColor 和 pageSize
```

**如果 Git 聪明到能逐行判断，它应该自动合并成：**

```javascript
siteName: "小栈便利店",
themeColor: "dark-blue",
pageSize: 20,
```

**为什么它没这么干？**

**因为 Git 是按"块"（hunk）比较的，不是按"行"。** 这几行挨在一起，被当成一整块。这一块两边都改过，Git 就无法确定该保留哪些行。

**这就是冲突的本质：不是"改错了"，是"超出 Git 的判断能力"。**

**顺带一个推论：改动之间隔得越远，越不容易冲突。** 所以"每个人负责不同文件"是最省事的协作方式。

### 2.5 用 git status 看当前状态

**操作：** 输入：

```text
git status
```

**应该看到：**

```text
On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   config.js

no changes added to commit (use "git add" and "git commit -a")
```

**逐句读：**

| 输出 | 意思 |
|---|---|
| `You have unmerged paths.` | 你有"未合并的路径"——有文件卡在冲突里 |
| `fix conflicts and run "git commit"` | Git 在告诉你下一步该干什么 |
| `use "git merge --abort" to abort the merge` | 也可以反悔，取消这次合并 |
| `both modified: config.js` | **两边都改了这个文件** |

**`git status --short` 更简洁：**

**操作：** 输入：

```text
git status --short
```

**你会看到：**

```text
UU config.js
```

**`UU` 是什么意思：** `both modified` 的缩写（Updated by both / Unmerged 两种说法都有，记住 `UU` = 两边都改）。

**其他你会遇到的冲突代码：**

| 代码 | 意思 | 什么情况 |
|---|---|---|
| `UU` | both modified | 两边都改了同一块内容 |
| `AA` | both added | 两边都新建了同名文件 |
| `DU` | deleted by us | 我删了，对方改了 |
| `UD` | deleted by them | 对方删了，我改了 |

**这四个代码要在第 3 步全部遇到。**

### 2.6 用 git diff 看冲突（双栏格式）

**操作：** 输入：

```text
git diff
```

**你会看到一种**从来没见过的格式**：**

```text
diff --cc config.js
index 3d88000,4a1bf4d..0000000
--- a/config.js
+++ b/config.js
@@@ -1,7 -1,7 +1,13 @@@
  const CONFIG = {
++<<<<<<< HEAD
 +  siteName: "小栈便利店",
 +  themeColor: "blue",
 +  pageSize: 10,
++=======
+   siteName: "小栈",
+   themeColor: "dark-blue",
+   pageSize: 20,
++>>>>>>> feature/dark
  };
  
  module.exports = CONFIG;
```

**和平时的 diff 有三个区别：**

**区别一：文件名前面是 `--cc`，不是 `--`。**

`--cc` 是 "combined diff"（组合差异）的缩写。**看到 `--cc` 就知道这是冲突状态。**

**区别二：行首有两列符号，不是一列。**

```text
++<<<<<<< HEAD
 +  siteName: "小栈便利店",
+   siteName: "小栈",
```

**第一列是"相对于我的版本"，第二列是"相对于对方的版本"。**

- `++` 表示这一行在两边都不存在（是新加的标记行）；
- ` +` 表示这一行只在**我的**版本里有；
- `+ ` 表示这一行只在**对方的**版本里有；
- `  ` 表示两边都一样（未改动的上下文）。

**区别三：`@@@@` 是四个 at，不是两个。**

平时是 `@@ -1,3 +1,3 @@`（两个 at），冲突时是 `@@@ -1,7 -1,7 +1,13 @@@`（三个 at，因为要对比两个父版本）。

**`-1,7 -1,7 +1,13` 怎么读：**

| 部分 | 意思 |
|---|---|
| `-1,7` | 我的版本，从第 1 行起 7 行 |
| `-1,7` | 对方的版本，从第 1 行起 7 行 |
| `+1,13` | 合并后现在是 13 行（7 + 7 - 1 重复的上下文，加上三个标记行） |

**这个格式不用背。** 你只要记住：**看到 `--cc` 和 `@@@`，就知道自己在看冲突。**

### 2.7 一个新手最容易犯的错

**不要用 `git diff` 来判断"冲突在哪"。**

**为什么：** 上面那一坨双栏格式，对新手来说很难读。而且它把标记行和内容混在一起。

**正确做法：直接打开文件，搜索 `<<<<<<<`。**

在 Visual Studio Code 里按 `Ctrl + F`，输入：

```text
<<<<<<<
```

**它会跳到第一个冲突处。** 再按 `Enter` 跳到下一个。

**一个文件里可以有多个冲突块。** 每个块都是独立的一组标记。真实项目里一个文件几十个冲突块很常见——**那就意味着这几十处都要逐个决策**。

**第二步做完了。你已经能读懂冲突标记了。**

---

## 第 3 步：三种解决方式（25 分钟）

### 3.1 先做最重要的一次决定

**在做任何操作之前，先问自己一个问题：**

> **这一块，我到底想要什么结果？**

**不是"选我的"或"选他的"，而是"我想要的最终代码长什么样"。**

**可能的结果有三种：**

1. **只要我的** —— 对方那版不要了；
2. **只要他的** —— 我的那版不要了；
3. **两个都要（合并）** —— 这最常见，也最需要动脑。

**这节课的这次冲突，正确答案是第 3 种：**

```javascript
const CONFIG = {
  siteName: "小栈便利店",      // 我的（改名）
  themeColor: "dark-blue",    // 他的（深色主题）
  pageSize: 20,               // 他的（改分页）
};
```

**为什么：** 站点改名和深色主题是两件**不冲突的事**。没理由放弃任何一个。

**这就是关键：冲突是 Git 判断不了，不是"两个需求互斥"。** 大多数情况下，你都能找到一个"两个都要"的结果。

### 3.2 方式一：手动改（最常用，也最该练）

**操作：**

1. 在 Visual Studio Code 里把整个文件内容改成：

```javascript
const CONFIG = {
  siteName: "小栈便利店",
  themeColor: "dark-blue",
  pageSize: 20,
};

module.exports = CONFIG;
```

2. **把三个标记行全部删掉。**
3. `Ctrl + S` 保存。

**怎么确认自己删干净了：** 按 `Ctrl + F`，搜：

```text
<<<<<<<
```

**应该看到"没有结果"（`No results`）。**

**再搜一次：**

```text
>>>>>>>
```

**也应该是 `No results`。**

**搜 `=======` 要小心** —— 它可能匹配到代码里的注释分隔线。看上下文判断。

**为什么必须删干净：**

`<<<<<<<` 这些符号不是 JavaScript 语法。留在文件里，程序跑起来会报：

```text
SyntaxError: Unexpected token '<<'
```

**这是个很痛苦的错。** 因为它说"第 2 行有问题"，而你会盯着 `const CONFIG = {` 看半天，看不出问题。

**记住这个错：看到 `Unexpected token '<<'`，第一反应就是搜 `<<<<<<<`。**

### 3.3 用 node 验证改对了

**操作：** 在终端输入：

```text
node -e "console.log(require('./config.js'))"
```

**`-e` 是什么：** `evaluate`，让 Node 直接执行引号里的代码，不建文件。

**这行在干什么：** `require("./config.js")` 加载配置文件，`console.log` 打印出来。

**应该看到：**

```text
{ siteName: '小栈便利店', themeColor: 'dark-blue', pageSize: 20 }
```

**如果报 `SyntaxError: Unexpected token '<<'`：** 标记没删干净，回去搜。

**如果报 `Cannot find module`：** 你不在 `conflict-lab` 目录里。输入 `cd` 确认路径。

**这一步非常重要。** 很多人"解决"完冲突就直接提交，从来不验证。**结果把语法错的代码提交进去了。**

### 3.4 标记已解决

**操作：** 输入：

```text
git add config.js
```

**为什么还要 add：** `git add` 在这里不是"准备提交"，而是告诉 Git：**"这个文件的冲突我处理完了。"**

**再加一个小知识：** 只有 `git add` 之后，Git 才认为这个文件"已解决"。光改文件不改索引，`git status` 还是显示 `UU`。

**应该看到：** `git status --short` 变成了：

```text
M  config.js
```

**`M` 在左边第一列 = 已暂存。** `UU` 不见了。

### 3.5 提交这次合并

**操作：**

```text
git commit -m "合并 feature/dark：采用深色主题和新站名"
```

**应该看到：**

```text
[main f48c78a] 合并 feature/dark：采用深色主题和新站名
```

**看一眼图：**

```text
git log --oneline --graph
```

**应该看到：**

```text
*   f48c78a 合并 feature/dark：采用深色主题和新站名
|\
| * eac711d dark 分支：改主题色和分页
* | 636bb5e main：改站点名
|/
* 7a3d210 初始：创建 config.js
```

**这个图形状说明：** 两条线在 `f48c78a` 汇合了。**这是一个真正的合并提交。**

**验证它有两个父提交：**

```text
git cat-file -p HEAD
```

**应该看到两行 `parent`：**

```text
tree bb0fed1a6438053cc22826af7c19f29d365f7fb0
parent 636bb5e091a6852750dc1f2b5d386737a1876baa
parent eac711df701bcc423bf29f13d4640d3544cef678
author 测 <t@e.com> 1794802535 +0800
```

**两个 `parent` = 合并提交。** 普通提交只有一个 `parent`。

**这是判断"是不是合并提交"最准确的方法。**

### 3.6 方式二：直接要我这版（`--ours`）

**什么时候用：** 你明确知道对方那版不要了。

**先重新制造一次冲突：** 输入：

```text
git switch -c test-ours
```

然后改一行再提交，切回 main 改同一行再提交，再合并。**你会再次看到冲突。**

（完整命令在下面 3.8 的"练习"里给出，这里先说操作方式。）

**冲突状态下，输入：**

```text
git checkout --ours config.js
```

**`--ours` 的意思是"我们这一方的版本"。** 在 `git merge` 时，"ours" 就是**你当前所在的分支**（也就是 main）。

**应该看到：** `Updated 1 path from the index`

**打开文件：** 冲突标记没了，全是 main 的内容。

**关键：`UU` 状态还在！**

```text
git status --short
```

**输出：**

```text
UU config.js
```

**为什么：** `checkout --ours` 只是**把文件内容换成了我这一版**，它**没有告诉 Git "我解决完了"**。

**必须再 `git add`：**

```text
git add config.js
```

**然后在提交前确认内容对：**

```text
node -e "console.log(require('./config.js'))"
```

**这个"还要再 add"的细节，很多教程都不说，但它经常让人困惑** —— 明明文件看着好了，`git commit` 还是被拒绝。

### 3.7 方式三：直接要他那版（`--theirs`）

**操作：** 冲突状态下输入：

```text
git checkout --theirs config.js
```

**`--theirs` 的意思是"他们那一方的版本"** —— 也就是你 `git merge` 后面跟的那个分支。

**应该看到：** 文件内容变成了对方那版，同样**还是要 `git add`**。

**一个非常容易搞混的点：**

`--ours` / `--theirs` 在**不同的命令里含义不同**：

| 命令 | `--ours` 指谁 | `--theirs` 指谁 |
|---|---|---|
| `git merge` 冲突时 | 我当前所在的分支 | 被合并进来的分支 |
| `git rebase` 冲突时 | **被合并进来的分支**（反了！） | **我当前所在的分支** |

**`rebase` 时是反的。** 这个坑极深，等你学 `rebase` 时会再讲。**现在只要记住：`merge` 时跟直觉一致。**

### 3.8 我这版和对方那版都错的时候

**这是真实工作中最常见的情况：两边都不完整。**

比如这次冲突：

- 我的版本：改了站名，但主题色还是旧的；
- 他的版本：改了主题色，但站名还是旧的。

**正确结果：手写第三版。**

```javascript
const CONFIG = {
  siteName: "小栈便利店",
  themeColor: "dark-blue",
  pageSize: 20,
};
```

**这个结果既不是 `--ours` 也不是 `--theirs`，是"我自己写的"。**

**这是应该被鼓励的做法。** `--ours` / `--theirs` 只在"我确定对方那版完全不要"时才用。

**大多数冲突的正确解法是：手动写第三版。**

---

## 第 4 步：反悔（10 分钟）

**为什么要有这个：** 有时候你一进冲突状态就慌了，或者发现自己合错了分支。

### 4.1 取消这次合并

**操作：** 冲突状态下输入：

```text
git merge --abort
```

**`abort` 是"中止"的意思。**

**应该看到：** 通常**没有任何输出**（Linux/Mac 上也可能有提示）。

**验证：**

```text
git status
```

**应该看到：**

```text
On branch main
nothing to commit, working tree clean
```

**再看文件：**

```text
cat config.js
```

**内容恢复成了合并前的样子。** 冲突标记没了。

**`--abort` 恢复了什么：**

- 文件内容 → 合并前的状态；
- 暂存区 → 合并前的状态；
- `MERGE_HEAD` 文件 → 被删掉（合并状态结束）。

**`--abort` 有多可靠：** 非常可靠。**只要你还没 commit，随时可以 abort。**

**但注意：它会丢掉你在冲突期间做的所有修改。** 如果你已经手动改了半个文件，`--abort` 一按全没了。

**所以：改之前先想清楚。真想反悔就早点反悔。**

### 4.2 已经 commit 了怎么反悔

`--abort` 只管"还没提交"的阶段。

**如果已经 `git commit` 了：**

```text
git reset --hard HEAD~1
```

**这句的意思：** 把 main 退回到上一个提交（也就是合并之前）。

**`--hard` 是危险的：** 它会**丢掉所有未提交的改动**。执行前先 `git status` 确认干净。

**更安全的做法：** 如果这个合并已经 push 到远程了，**不要 `reset`**，用：

```text
git revert -m 1 HEAD
```

**`-m 1` 是什么：** 合并提交有两个父，`-m 1` 表示"以第一个父（也就是 main）为主线，撤销另一个父带来的改动"。

**为什么不 `reset`：** 因为别人可能已经拉到这个合并了。`reset` 会让你和别人的历史不一致。

**这是第 28 节课的详细内容，这里先知道有这么回事。**

### 4.3 一个真实场景：合错了分支

**场景：** 你在 `main` 上想合并 `feature/a`，结果手滑打了 `git merge feature/b`。

**如果还没 commit：**

```text
git merge --abort
```

**干净利落。这就是 `--abort` 存在的最大意义。**

**如果已经 commit 了：** 用 `revert -m 1`。

---

## 第 5 步：四种冲突类型（20 分钟）

**前面练的都是"两边都改同一块内容"（`UU`）。真实项目里还有三种。**

**这一步要你全部撞一遍。**

### 5.1 类型一：内容冲突（`UU`）—— 已经练过了

**触发条件：** 两边都改了同一个文件的同一块区域。

**`git status --short` 显示：**

```text
UU config.js
```

**解法：** 手动改 / `--ours` / `--theirs`，然后 `git add`。

### 5.2 类型二：新增冲突（`AA`）

**触发条件：** 两个分支各自新建了一个**同名文件**，内容不同。

**为什么算冲突：** Git 不知道要保留哪个文件的内容。是合并？是选一个？它判断不了。

**动手做：**

**操作一：** 在新的练手环境里做。先建一个干净仓库：

```text
cd ..
mkdir addadd-lab
cd addadd-lab
git init
git config user.name "你的名字"
git config user.email "你的邮箱"
```

**操作二：** 建基线并提交：

```text
echo base > base.txt
git add .
git commit -m "初始"
```

**操作三：** 在 `main` 上新建 `add.txt`：

```text
echo "main的add文件" > add.txt
git add .
git commit -m "main：添加 add.txt"
```

**操作四：** 切到新分支，新建同名文件（内容不同）：

```text
git switch -c other
echo "other的add文件" > add.txt
git add .
git commit -m "other：添加 add.txt（内容不同）"
```

**操作五：** 切回 main 合并：

```text
git switch main
git merge other
```

**应该看到：**

```text
Auto-merging add.txt
CONFLICT (add/add): Merge conflict in add.txt
Automatic merge failed; fix conflicts and then commit the result.
```

**注意 `CONFLICT (add/add)`** —— 这是"两边都新增"的类型。

**看文件内容：**

```text
cat add.txt
```

**应该看到：**

```text
<<<<<<< HEAD
main的add文件
=======
other的add文件
>>>>>>> other
```

**标记结构和内容冲突一样，只是这次整个文件都在标记里。**

**`git status --short`：**

```text
AA add.txt
```

**解法：** 和内容冲突一样。手动改、`--ours`、`--theirs`，然后 `git add`。

**清理现场：**

```text
git merge --abort
```

### 5.3 类型三：修改/删除冲突（`UD` 或 `DU`）

**触发条件：** 一方删除了文件，另一方修改了它。

**为什么算冲突：** Git 不知道该"删掉"还是该"保留修改后的版本"。

**这是最危险的冲突类型**，因为它很容易被误处理成"文件消失"。

**动手做：**

**操作一：** 建新练手仓库：

```text
cd ..
mkdir moddel-lab
cd moddel-lab
git init
git config user.name "你的名字"
git config user.email "你的邮箱"
```

**操作二：** 基线：

```text
echo "原始内容" > del.txt
echo base > base.txt
git add .
git commit -m "初始"
```

**操作三：** 建分支，删除文件：

```text
git switch -c other
git rm del.txt
git commit -m "other：删除 del.txt"
```

**`git rm` 是什么：** 删文件 + 把删除操作加进暂存区。等于 `del 文件` 加 `git add`。

**操作四：** 切回 main，修改同一个文件：

```text
git switch main
echo "main修改了del.txt" > del.txt
git commit -am "main：修改 del.txt"
```

**注意：切回 main 后 `del.txt` 又出现了**，因为 main 分支上它还在。

**操作五：** 合并：

```text
git merge other
```

**应该看到：**

```text
CONFLICT (modify/delete): del.txt deleted in other and modified in HEAD.  Version HEAD of del.txt left in tree.
Automatic merge failed; fix conflicts and then commit the result.
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `CONFLICT (modify/delete)` | 修改/删除冲突 |
| `del.txt deleted in other` | 对方分支把它删了 |
| `and modified in HEAD` | 我这一方改了它 |
| `Version HEAD of del.txt left in tree` | **Git 把"我这版"留在工作区了** |

**最后那句非常重要：Git 默认把"修改过的那版"留在磁盘上，把"要删除的那个意图"藏在状态里。**

**`git status --short`：**

```text
UD del.txt
```

**`UD` = Updated by us, Deleted by them（我改了，对方删了）。**

**`git status` 完整版会说：**

```text
deleted by them: del.txt
```

**现在有两个选择：**

**选择 A：接受删除。** 输入：

```text
git rm del.txt
```

**选择 B：保留我这版。** 输入：

```text
git add del.txt
```

**看到区别了吗：同样的冲突，两个命令给出完全相反的结果。**

- `git rm` = "我同意删掉"
- `git add` = "我要保留这个文件"

**这是整节课最容易搞错的地方。** 很多人在这个场景下随手 `git add .`，结果本该删掉的文件被保留了，或者本该保留的被删了。

**动手：选 B（保留我这版）**

```text
git add del.txt
git commit -m "合并 other：保留 del.txt（我这版有修改）"
```

**验证：**

```text
cat del.txt
```

**应该看到 `main修改了del.txt`。**

### 5.4 类型四：删除/删除冲突

**触发条件：** 两个分支都删了同一个文件，**但删除方式不同**（这种情况罕见）。

**实际中更常见的是：两边都删了同一个文件，Git 会直接接受，不报冲突。** 因为它们的结果一致。

**只有一种情况会报：** 一边用 `git rm`，另一边用文件系统删除且没有 `git add`，导致一边认为"已删除"，另一边认为"还在"。

**这个类型不用专门练。** 知道有这么回事就行。

### 5.5 类型五：重命名冲突

**触发条件：** 一边重命名了文件，另一边修改了这个文件。

**Git 会怎么处理：** 大部分情况下它能自动识别重命名（因为它比较内容相似度），把修改应用到新名字上。

**如果识别失败，会报 `CONFLICT (rename/delete)` 或 `CONFLICT (rename/rename)`。**

**这个类型也不用专门练。** 记住：**看到 `rename` 字样，说明一边改名了一边动了内容，你需要判断"新名字对不对、内容该放哪"。**

### 5.6 五种冲突速查表

| `status` 代码 | 类型 | 触发场景 | 解法 |
|---|---|---|---|
| `UU` | 内容冲突 | 两边改同一块 | 手动改 / `--ours` / `--theirs` + `git add` |
| `AA` | 新增冲突 | 两边建同名新文件 | 同上 |
| `UD` | 我改他删 | 我改了，对方删了 | `git add` 保留 / `git rm` 接受删除 |
| `DU` | 我删他改 | 我删了，对方改了 | 同上，但方向相反 |
| `UU`（重命名） | 改名冲突 | 一边改名一边改内容 | 手动处理，注意文件该叫什么 |

**把这五个代码背下来。** 看到 `git status --short` 里的两个字母，就知道怎么处理。

---

## 第 6 步：最危险的一个坑（15 分钟）

**这一步是整节课最该记住的内容。**

### 6.1 直接 commit 会被拒绝

**先制造一个冲突**（用 `conflict-lab` 那个仓库）：

```text
cd ..\conflict-lab
git switch -c test-commit
```

改 `config.js` 里的一行，提交，切回 main 改同一行，提交，合并。

**冲突状态下，直接输入：**

```text
git commit -m "想直接提交"
```

**应该看到：**

```text
error: Committing is not possible because you have unmerged files.
hint: Fix them up in the work tree, and then use 'git add/rm <file>'
hint: as appropriate to mark resolution and make a commit.
fatal: Exiting because of an unresolved conflict.
```

**逐句读：**

| 行 | 意思 |
|---|---|
| `error: Committing is not possible because you have unmerged files.` | 不可能提交，因为你有未合并的文件 |
| `hint: Fix them up in the work tree...` | 提示：在工作区修好它们 |
| `hint: and use 'git add/rm <file>' as appropriate to mark resolution` | 用 `git add` 或 `git rm` 标记已解决 |
| `fatal: Exiting because of an unresolved conflict.` | 致命错误：因为有未解决的冲突，退出 |

**好消息：Git 在这里保护了你。** 不加 `-a` 的 `git commit` 会拒绝提交。

### 6.2 但是 `-a` 会绕过保护

**这是最坑的地方。**

**现在输入：**

```text
git commit -am "想直接提交"
```

**`-a` 会自动把"所有已跟踪文件的修改"加进暂存区** —— **包括那些还带着冲突标记的文件。**

**应该看到：提交成功了。**

```text
[main 265907b] 想直接提交
```

**现在打开文件看：**

```text
cat config.js
```

**你会看到：**

```text
<<<<<<< HEAD
  siteName: "小栈便利店",
=======
  siteName: "小栈",
>>>>>>> feature/dark
```

**冲突标记被提交进 Git 历史了。**

**而且程序已经跑不起来了：**

```text
node -e "console.log(require('./config.js'))"
```

**报：**

```text
SyntaxError: Unexpected token '<<'
```

### 6.3 这个坑为什么危险

**危险点一：`git commit -a` 是你最常用的命令。**

第 6 节课就教了 `git commit -am "信息"`，因为它方便。**但在冲突状态下，它是个陷阱。**

**危险点二：提交成功了，没有任何警告。**

`git status` 会说 `working tree clean`（因为确实提交了）。你以为一切正常。

**危险点三：如果这时候 push 了，整个团队都会拉到蓝屏级别的代码。**

### 6.4 怎么检查自己有没有踩

**提交前，永远先看一眼：**

```text
git status --short
```

**如果看到任何以 `U`、`A`、`D` 开头的两个字母组合，说明有未解决冲突。**

| 有冲突 | 没有冲突 |
|---|---|
| `UU` `AA` `UD` `DU` | `M ` `A ` `D ` `??` |

**关键区别：冲突代码的字母在"两列都占"或者"第一列是 U/A/D 第二列也是 U/D"。**

**更靠得住的检查：搜标记。**

提交之前，输入：

```text
git grep -n "<<<<<<<"
```

**`git grep` 是在"已跟踪文件"里搜索。**

**如果没有冲突标记，它什么都不输出（退出码 1）。有的话会列出文件和行号。**

**这就是最可靠的"上线前检查"。**

### 6.5 已经提交了怎么救

**如果还没 push：**

```text
git reset --soft HEAD~1
```

**`--soft` 只退回提交，改动全留着。** 然后重新解决冲突。

**如果已经 push 了：**

不能 `reset`（会破坏别人的历史）。用：

```text
git revert HEAD
```

**`revert` 会生成一个新提交，内容是把上一个提交的改动反向应用。**

**这会在历史里留下"错误提交 + 撤销提交"两条记录。** 难看，但安全。

**然后重新解决冲突，再提交一次。**

### 6.6 一条铁律

```text
任何 git commit 之前，先跑 git status --short。
看到 UU / AA / UD / DU，停下来解决，不要提交。
```

**把这个写在你的笔记最上面。**

---

## 第 7 步：为什么会有冲突（认知部分）（10 分钟）

**这一步不讲操作，讲一件事：怎么少遇到冲突。**

### 7.1 冲突的三个根源

| 根源 | 说明 | 怎么避免 |
|---|---|---|
| **改同一块地方** | 两个人改了相邻的行 | 分工按文件/模块，不要两人改同一文件 |
| **分支活得太久** | 分支开了两周才合并，期间 main 变了一大堆 | 小步提交、频繁合并（每天或每两天） |
| **格式化成灾** | 有人用 Prettier 全文件重新格式化，整个文件都变了 | 统一格式化配置（`.prettierrc`），提交前统一跑 |

**第三个是最冤的。** 内容一个字没改，只是缩进变了、引号从单引号变双引号，结果整文件冲突。

**这个在第 4 阶段（工程可靠性）会有专门的课讲代码格式化。**

### 7.2 一个真实的比例

**在正常协作的项目里：**

- 80% 的冲突是"改同一块地方"（可以通过分工避免）；
- 15% 是"分支活太久"（可以通过频繁合并避免）；
- 5% 是"格式化"（可以通过统一配置避免）。

**也就是说：95% 的冲突是流程问题，不是 Git 的问题。**

**冲突多，说明团队协作方式有问题，不是 Git 难用。**

### 7.3 合并前先看一眼差异

**这是最实用的一招。**

**合并前，先看两个分支差在哪：**

```text
git log --oneline main..feature/dark
```

**意思是：`feature/dark` 有、但 `main` 没有的提交。**

**再看具体改了什么：**

```text
git diff main feature/dark --stat
```

**如果看到两个分支都改了同一个文件，你就知道要冲突了。** 可以提前想好怎么合。

**养成习惯：合并前先 `git diff --stat`，心里有数。**

---

## 第 8 步：完整流程演练（15 分钟）

**这一步把前面所有内容串成一个完整的、可以背下来的流程。**

### 8.1 冲突处理的七步法

```text
第 1 步：git status --short
         → 看哪些文件冲突，记下 UU / AA / UD / DU

第 2 步：打开冲突文件
         → 搜 <<<<<<<，找到所有冲突块

第 3 步：逐个冲突块决策
         → 问自己"最终代码要什么样"（不是"选谁"）

第 4 步：删掉三个标记行
         → 确认搜不到 <<<<<<< 和 >>>>>>>

第 5 步：验证代码能跑
         → node 跑一遍 / 打开浏览器看一眼

第 6 步：git add 标记已解决
         → git status --short 确认 UU 变成 M

第 7 步：git commit
         → 提交前再跑一次 git status --short
```

**这七步要背下来。** 遇到冲突就照着走。

### 8.2 你现在的任务是完整走一遍

**操作：** 在 `conflict-lab` 里做一次完整流程，但这次要**故意留一个错**，用来验证第 5 步的价值。

**步骤：**

1. 造冲突（你已经会了）；
2. 手动改，但**故意留一个语法错误**（比如少一个引号）；
3. `git add`；
4. `git commit`（第 5 步跳过验证）；
5. 运行 `node -e "console.log(require('./config.js'))"`；
6. 看到 `SyntaxError`；
7. 用 `git reset --soft HEAD~1` 退回；
8. 修好语法；
9. 重新 `git add` 和 `git commit`。

**这个练习的目的：让你亲身感受到"跳过验证"的代价。**

**代价有多大：** 如果没跳过这一步，你 10 秒就发现问题了。跳过之后，你要用 `reset`、重新提交，花 3 分钟。**而且如果已经 push 了，代价是整个团队。**

### 8.3 图形化工具要不要用

**Visual Studio Code 有内置的冲突解决界面：**

**它会显示：**

```text
Accept Current Change | Accept Incoming Change | Accept Both Changes | Compare Changes
```

**四个按钮的含义：**

| 按钮 | 等于 |
|---|---|
| Accept Current Change | `git checkout --ours` |
| Accept Incoming Change | `git checkout --theirs` |
| Accept Both Changes | 两边都留（顺序：我的在前） |
| Compare Changes | 打开对比视图 |

**要不要用：**

- **前 10 次用手动改。** 你必须知道那四个按钮背后是什么。
- **熟练之后可以用按钮。** 它更快，尤其是一个文件里有 20 个冲突块时。

**但注意：`Accept Both Changes` 经常给出错误的顺序。** 它只是把我的粘在前面、他的粘在后面。**如果逻辑上有依赖（比如先声明后使用），它给的顺序可能是错的。**

**所以：即使点按钮，也要看一眼结果。**

---

## 第 9 步：五个必须自己撞的错（15 分钟）

**每个都要真的做一遍，看一眼报错，然后修好。**

### 错误 1：标记没删干净就提交

**操作：**

1. 造冲突；
2. 只删了 `<<<<<<<` 和 `>>>>>>>`，**故意留着 `=======`**；
3. `git add` + `git commit`；
4. 运行程序。

**你会看到：**

```text
SyntaxError: Unexpected token '='
```

**为什么：** `=======` 不是合法 JavaScript。

**怎么查：** `git grep -n "======="` —— 注意这个搜索可能匹配注释里的分隔线。

**教训：** 三个标记是一组，必须一起删。

### 错误 2：忘记 `git add` 就 `git commit`

**操作：**

1. 造冲突；
2. 手动改好文件并保存；
3. **直接 `git commit -m "xxx"`**。

**你会看到：**

```text
error: Committing is not possible because you have unmerged files.
fatal: Exiting because of an unresolved conflict.
```

**为什么：** 改了文件不等于"告诉 Git 已解决"。**Git 看的是索引，不是文件内容。**

**教训：** 改完必须 `git add`。

### 错误 3：用 `-a` 绕过保护

**操作：**

1. 造冲突；
2. 什么都不改；
3. `git commit -am "直接提交"`。

**你会看到：提交成功了。**

**然后在项目里搜：**

```text
git grep "<<<<<<<"
```

**你会看到冲突标记被提交进了历史。**

**为什么：** `-a` 会自动暂存所有已跟踪文件的修改，包括带标记的。

**教训：** 冲突状态下禁用 `-a`。

### 错误 4：`--abort` 之后以为改动还在

**操作：**

1. 造冲突；
2. 手动改了一大半；
3. `git merge --abort`；
4. 打开文件看。

**你会看到：你的修改全没了。**

**为什么：** `--abort` 恢复到合并前状态，包括文件内容。

**教训：** `--abort` 前想清楚。真的想留改动，先 `git stash` 或者复制文件。

### 错误 5：`git add .` 在冲突状态下

**操作：**

1. 造一个"两边都新增同名文件"的冲突（`AA`）；
2. **只处理了其中一个文件**；
3. `git add .`；
4. `git status --short`。

**你会看到：** 另一个文件也被标记成已解决（`A `），但它里面还有冲突标记。

**为什么：** `git add .` 会把所有文件都加进去，不管里面有没有标记。

**教训：** 冲突状态下，**逐个文件 `git add`**，不要用 `git add .`。

---

## 第 10 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第04周-Git与回滚\第06节课\02-笔记\NOTES.md
```

**按里面的空自己填。** 不要抄课件，用你自己的话。

**重点填这三栏：**

1. **三个标记各是什么意思** —— 这是基础；
2. **五种 `status` 代码** —— 这是判断依据；
3. **七步法** —— 这是肌肉记忆。

---

## 第 11 步：课后练习（不占课堂时间）

### 练习 1：你遇过最麻烦的冲突

**回想一下（或者去翻你以前的作业）：** 有没有哪次两个文件互相引用、改了一个忘了改另一个，导致程序报错？

**那不是 Git 冲突，是"语义冲突"。** 写 200 字描述它，说明：

- 表面上改的是哪里；
- 实际坏掉的是哪里；
- 你怎么发现的。

**为什么练这个：** Git 只能发现"文本冲突"。**文本不冲突但逻辑坏掉的情况，才是真正难查的。**

### 练习 2：三个分支的交叉冲突

**目标：** 造一个"三个分支互相冲突"的场景。

**步骤：**

1. 建 `a`、`b`、`c` 三个分支，都基于同一个基线；
2. 三个分支改同一行，内容各不相同；
3. 先把 `a` 合进 main（成功）；
4. 再把 `b` 合进 main（冲突，解决）；
5. 再把 `c` 合进 main（冲突，解决）。

**记录：** 第 5 步冲突时，`--ours` 指的是什么？是 main 还是 a？

**答案会让你有点意外。**

### 练习 3：写一份团队冲突规范

**目标：** 假设你带一个 3 人小队，写一份 300 字的"冲突处理规范"。

**必须包含：**

- 提交前必须做什么检查；
- 遇到 `UD` 怎么判断；
- 什么情况下允许用 `--theirs`；
- 谁有权决定"两个都不要，重写"。

**这个练习的价值：** 你以后接项目、带人，这份规范能直接用。

### 练习 4：把一个冲突"演"出来

**目标：** 录一段 3 分钟的屏幕录像（用系统自带录屏就行），演示：

1. 制造冲突；
2. 读出三个标记；
3. 手动解决；
4. 验证；
5. 提交。

**为什么要录：** 因为"讲明白"比"做对"难得多。**你能讲明白，才是真会了。**

**如果以后你录课卖，这段就是现成的素材。**

---

## 第 12 步：验收清单

**全部勾上才算学完。**

### 理解层

- [ ] 我能说出 `<<<<<<<` `=======` `>>>>>>>` 各是什么意思
- [ ] 我知道 `HEAD` 在冲突标记里代表什么
- [ ] 我能解释"为什么 Git 不自己决定"
- [ ] 我知道 Git 是按"块"比较，不是按"行"
- [ ] 我理解"冲突不是错误，是需要人决策"

### 操作层

- [ ] 我独立造出过一次内容冲突（`UU`）
- [ ] 我独立造出过一次新增冲突（`AA`）
- [ ] 我独立造出过一次修改/删除冲突（`UD`）
- [ ] 我用过 `git checkout --ours`
- [ ] 我用过 `git checkout --theirs`
- [ ] 我知道 `--ours` 之后还要 `git add`
- [ ] 我用过 `git merge --abort`
- [ ] 我用 `git rm` 和 `git add` 处理过 `UD` 的两种选择
- [ ] 我提交过一个真正的合并提交，并用 `git cat-file` 确认它有两个 `parent`

### 排错层

- [ ] 我知道 `SyntaxError: Unexpected token '<<'` 该怎么查
- [ ] 我知道 `git commit` 被拒绝（unmerged files）该怎么处理
- [ ] 我知道 `commit -a` 会绕过保护，并且亲自验证过
- [ ] 我知道 `--abort` 会丢掉改动
- [ ] 我知道冲突状态下不能用 `git add .`

### 认知层

- [ ] 我能说出冲突的三个根源
- [ ] 我知道"95% 的冲突是流程问题"
- [ ] 我知道合并前应该先 `git diff --stat` 看一眼
- [ ] 我能背出冲突处理的七步法

### 笔记

- [ ] `NOTES.md` 填完，没有大片空白
- [ ] 我记下了自己实际的 `git status --short` 输出
- [ ] 我记下了自己遇到的一次真实报错原文

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `git commit` 报 `unmerged files` | 有文件还没 `git add` | 逐个 `git add`，别用 `.` |
| 文件里有 `<<<<<<<` 但 status 是干净的 | 用 `-a` 提交进去了 | `git grep "<<<<<<<"` 找出来，`git reset --soft HEAD~1` 退回 |
| `Unexpected token '<<'` | 标记没删 | `Ctrl + F` 搜 `<<<<<<<` |
| `Unexpected token '='` | 只删了首尾，留了 `=======` | 搜 `=======`，看上下文判断 |
| `--abort` 后改动没了 | 它的作用就是恢复到合并前 | 下次先 `git stash` |
| `--ours` 之后文件好了但 commit 还是被拒 | 没 `git add` | `git add 文件` |
| `UD` 状态下不知道该 `add` 还是 `rm` | 判断"要文件还是要删除" | 要文件 → `git add`；要删除 → `git rm` |
| 合并方向搞反了 | `switch` 到错的分支再 merge | `git merge --abort`，`switch` 对再合 |
| 冲突文件太多，一个个改太慢 | 正常的 | 用 VS Code 的按钮，但每个都要看一眼结果 |
| 已经 push 了错误合并 | 不能 `reset` | `git revert -m 1 HEAD` |
| `git status` 显示 `both added` | 两边建了同名新文件 | 手动合并内容，然后 `git add` |
| 解决完冲突忘了提交，关了终端 | 合并状态还在（`MERGE_HEAD` 文件还在） | 重新 `git status` 看，继续做完 |

---

## 本节课要能说出口的四句话

```text
一、冲突不是错误，是 Git 说"我判断不了，你来定"。

二、不要问"选谁的"，要问"最终代码该长什么样"。

三、解决完必须 git add，否则 Git 不知道你已经处理了。

四、提交前永远先跑 git status --short，看到 U 开头的就停下来。
```

---

## 附：下一步

**第 28 节课会讲：已经提交错了怎么救。**

这节课你学会了"冲突时怎么处理"。但真实工作中更常见的场景是：

> **代码已经提交了，甚至已经 push 了，才发现改错了。**

那时候 `--abort` 已经没用了（因为它只管未提交状态）。你要用 `reset`、`revert`、`restore`、`reflog`。

**那节课会讲清这四个命令的区别，以及"什么时候能救、什么时候救不回来"。**
