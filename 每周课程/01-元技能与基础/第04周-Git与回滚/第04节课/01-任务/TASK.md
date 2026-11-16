# 第 25 节课：创建分支——安全地试新东西

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 前几节课你在 `main` 上直接改。这在"一个人做作业"时没问题，但在真实项目里很危险。
> 这节课学会用分支：**在一条安全的分支上折腾，弄坏了也不影响主代码。**

**建议用时**：100 分钟
**你需要先完成**：第 22—24 节课

---

# 第 0 步：为什么需要分支（10 分钟）

## 0.1 先看一个真实场景

**你要给 chat-app 加一个"导出对话"功能。**

**没有分支，你会这样做：**

```text
① 直接在 main 上改
② 改到一半，发现方案不对
③ 但已经改了 5 个文件
④ 你忘了改之前是什么样
⑤ 想回退，但中间还有几个别的小修复已经提交了
⑥ 灾难
```

**有分支：**

```text
① git switch -c feature-export    新建分支
② 在上面随便改、随便提交
③ 发现方案不对 → 直接切回 main，删掉这个分支
④ main 一点都没受影响
```

**这就是分支的核心价值：**

```text
分支 = 一条独立的实验线
在它上面做任何事，都不影响其他分支
```

## 0.2 分支在真实团队里怎么用

**最常见的四种用途：**

| 用途 | 分支名示例 | 干什么 |
|---|---|---|
| 开发新功能 | `feature-export` | 做完再合并 |
| 修紧急 bug | `hotfix-login` | 修完立刻合并 |
| 试新方案 | `experiment-redis` | 可能永远不合并 |
| 写文档 | `docs-readme` | 独立提交 |

**一句话总结：**

```text
每一件"独立的事"，都该有自己的分支。
```

## 0.3 分支的成本几乎为零

**第 22 节课你已经验证过：**

```text
一个分支 = .git/refs/heads/ 里的一个文件 = 40 字节
```

**建一百个分支也没关系。**

**所以不要"舍不得建分支"。** 该建就建。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `branch-lab/` | `03-练习代码` | 分支练手仓库 |

---

# 第 1 步：`switch` 和 `checkout` 的关系（15 分钟）

## 1.1 先解决一个困惑：为什么有两种命令

**你可能在网上看到两种写法：**

```text
git checkout -b feature      老写法
git switch -c feature        新写法
```

**它们做的完全一样。**

**为什么会有新的：**

**因为 `git checkout` 做的事太多了，容易搞混。**

**`checkout` 能干这些事：**

```text
git checkout 分支名          切分支
git checkout 文件名          丢弃文件改动（危险！）
git checkout 提交哈希        进游离 HEAD
git checkout -b 新分支       建并切分支
```

**一个命令四种用途，一不小心就执行错。**

**`git switch` 被拆出来专门管"切分支"：**

```text
git switch 分支名            切分支
git switch -c 新分支         建并切分支
git switch -                   切回上一个分支
```

**另一部分被拆到 `git restore`：**

```text
git restore 文件名           丢弃文件改动
git restore --staged 文件名  取消暂存
```

## 1.2 本课程统一用新的

| 要做的事 | 用这个（新） | 不要用（老） |
|---|---|---|
| 切分支 | `git switch 分支名` | `git checkout 分支名` |
| 建并切分支 | `git switch -c 新分支` | `git checkout -b 新分支` |
| 丢弃文件改动 | `git restore 文件` | `git checkout 文件` |
| 取消暂存 | `git restore --staged 文件` | `git reset HEAD 文件` |

**为什么推荐新的：**

```text
① 不会误操作（switch 只会切分支，不会丢改动）
② 意图明确（一看就知道要干什么）
③ 官方推荐（Git 2.23 之后引入）
```

**但你必须认识老写法。**

因为：

- 很多教程、AI 生成的命令、老项目文档都用 `checkout`；
- 团队里可能有人习惯老的。

**看到 `checkout` 要知道它在干什么。** 但自己写的时候用新的。

## 1.3 验证两种写法等价

**在 `sandbox` 里试（第 22 节课那个）：**

```text
git switch -c test-new
git branch
```

**应该看到：**

```text
* test-new
  main
```

**再用老写法：**

```text
git switch main
git checkout -b test-old
```

**结果一样。**

**清理：**

```text
git switch main
git branch -D test-new test-old
```

---

# 第 2 步：建第一个功能分支（25 分钟）

## 2.1 建练手仓库

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第04周-Git与回滚\第04节课\03-练习代码
   ```

2. 新建 `branch-lab`，进去，打开终端。
3. 初始化：

   ```text
   git init
   git config user.name "你的名字"
   git config user.email "you@example.com"
   ```

## 2.2 先做基础提交

```text
echo "# 任务清单" > README.md
git add README.md
git commit -m "初始化：项目说明"
```

**现在 main 上有一次提交。**

## 2.3 建功能分支

```text
git switch -c feature-add-task
```

**`-c` 是什么：** create，创建。

**注意输出：**

```text
Switched to a new branch 'feature-add-task'
```

**看现在在哪：**

```text
git branch
```

**输出：**

```text
* feature-add-task
  main
```

**`*` 在前面的是你当前所在的分支。**

## 2.4 在分支上做事

**新建 `task.js`：**

```javascript
const tasks = [];

function addTask(title) {
  if (typeof title !== "string" || title.trim() === "") {
    return null;
  }

  const task = {
    id: tasks.length + 1,
    title: title.trim(),
    done: false,
  };

  tasks.push(task);
  return task;
}

module.exports = { addTask, tasks };
```

```text
git add task.js
git commit -m "添加 addTask 函数"
```

**再提交一次：**

**把 `task.js` 改成（加一个 `listTasks`）：**

```javascript
const tasks = [];

function addTask(title) {
  if (typeof title !== "string" || title.trim() === "") {
    return null;
  }

  const task = {
    id: tasks.length + 1,
    title: title.trim(),
    done: false,
  };

  tasks.push(task);
  return task;
}

function listTasks() {
  return tasks.slice();
}

module.exports = { addTask, listTasks, tasks };
```

```text
git add task.js
git commit -m "添加 listTasks 函数"
```

## 2.5 现在看两个分支的差异

**看当前分支的历史：**

```text
git log --oneline
```

**输出：**

```text
xxxxxxx 添加 listTasks 函数
xxxxxxx 添加 addTask 函数
xxxxxxx 初始化：项目说明
```

**切回 main：**

```text
git switch main
```

**看 main 的历史：**

```text
git log --oneline
```

**输出：**

```text
xxxxxxx 初始化：项目说明
```

**只有一条！**

**这就是分支的核心：main 完全不知道你在功能分支上做了什么。**

## 2.6 验证文件也分开了

**在 main 上：**

```text
dir
```

**只有 `README.md`。`task.js` 不见了。**

**这不是文件被删了。** 它存在于 `feature-add-task` 分支指向的那个提交里。

**切回去验证：**

```text
git switch feature-add-task
dir
```

**`task.js` 又出现了。**

**这个来回切换一定要体验几次。**

**很多人第一次看到"文件消失"会吓一跳。** 理解原理之后就不会慌了。

## 2.7 看分支图

```text
git log --oneline --graph --all
```

**输出：**

```text
* xxxxxxx 添加 listTasks 函数
* xxxxxxx 添加 addTask 函数
* xxxxxxx 初始化：项目说明
```

**注意：还是一条直线。**

**为什么：**
因为 `main` 没有往前走。**两条线还重叠在一起。**

**等 main 也有新提交，就会看到分叉（第 26 节课会做）。**

---

# 第 3 步：分支的六种操作（25 分钟）

## 3.1 列出分支

**基本：**

```text
git branch
```

**输出本地分支，`*` 标出当前的。**

**加上远程分支：**

```text
git branch -a
```

**`-a` 是什么：** all。

**输出会包括 `remotes/origin/main` 这种。**

**`remotes/origin/xxx` 是什么：**
远程仓库里的分支。**`origin` 是默认的远程名字。**

**看每个分支的最新提交和追踪关系：**

```text
git branch -vv
```

**输出类似：**

```text
* feature-add-task 924c558 添加 listTasks 函数
  main             924c558 初始化：项目说明
```

**`-vv` 多显示了"最新提交的哈希和提交信息"。**

**如果配置了远程，还会显示 `[origin/main]` 表示追踪哪个远程分支。**

**看已合并/未合并的分支：**

```text
git branch --merged
git branch --no-merged
```

**为什么这个有用：**

```text
--merged      已经合并进当前分支的 → 可以安全删除
--no-merged   还没合并的 → 删了会丢东西
```

**试试：**

```text
git switch main
git branch --merged
```

**应该只看到 `main` 自己。**

**因为 `feature-add-task` 的两次提交还没进 main。**

**再看未合并的：**

```text
git branch --no-merged
```

**输出：**

```text
  feature-add-task
```

**这就是"删它之前要想清楚"的信号。**

## 3.2 建分支但不切过去

```text
git branch experiment
```

**注意：没有 `-c`。**

**`git branch 名字` 只创建，不切换。**

**验证：**

```text
git branch
```

**输出：**

```text
  experiment
  feature-add-task
* main
```

**你还在 main 上。**

**什么时候用这个：**

```text
想先把分支建好，但暂时不切过去
或者：给某个提交打一个新分支标签（下一节会讲）
```

## 3.3 切换分支

```text
git switch experiment
git switch main
```

**快捷方式：切回上一个分支**

```text
git switch -
```

**`-` 是什么：** "上一个"。

**这相当于按遥控器的"回看"键。** 在两个分支间来回跳时特别方便。

**做实验：**

```text
git switch feature-add-task
git switch -
git switch -
```

**你会发现它在 `main` 和 `feature-add-task` 之间来回跳。**

## 3.4 重命名分支

```text
git branch -m 旧名字 新名字
```

**`-m` 是什么：** move（改名）。

**做实验：**

```text
git branch -m experiment try-redis
git branch
```

**`experiment` 变成了 `try-redis`。**

**重命名当前分支（不写旧名字）：**

```text
git branch -m 新名字
```

## 3.5 删除分支

**安全删除（只能删已合并的）：**

```text
git branch -d 分支名
```

**`-d` 是什么：** delete，会检查"是否已合并"。

**试试删未合并的：**

```text
git branch -d feature-add-task
```

**会拒绝（实测输出）：**

```text
error: the branch 'feature-add-task' is not fully merged
hint: If you are sure you want to delete it, run 'git branch -D feature-add-task'
hint: Disable this message with "git config set advice.forceDeleteBranch false"
```

**这个保护很重要。**

**它在说：**

```text
"这个分支上有 2 个提交，还没合并进任何地方。
 删了之后，那些提交就没有分支指向了。
 你确定吗？"
```

**强制删除（确认不要了）：**

```text
git branch -D feature-add-task
```

**`-D` = `--delete --force`。**

**现在那个分支和它的两次提交都不在分支列表里了。**

**但先不要删。** 第 26 节课要用它做合并练习。

**先删那个空的 `try-redis`：**

```text
git branch -d try-redis
```

**这个能成功，因为它指向的提交和 main 一样（已合并）。**

## 3.6 删除分支后能恢复吗

**这是个重要问题。**

**答案：能，只要你还记得那个提交的哈希。**

**做实验：**

1. 先记下 `feature-add-task` 的最新哈希：

   ```text
   git log --oneline feature-add-task
   ```

   **输出类似：**

   ```text
   a1b2c3d 添加 listTasks 函数
   d4e5f6g 添加 addTask 函数
   ...
   ```

2. 记下 `a1b2c3d`。

3. 强制删掉分支：

   ```text
   git branch -D feature-add-task
   ```

4. 现在"恢复"它：

   ```text
   git branch feature-add-task a1b2c3d
   ```

**分支回来了，指向那个提交。**

**验证：**

```text
git switch feature-add-task
dir
```

**`task.js` 还在，两次提交也在。**

**为什么能恢复：**

```text
删分支只删了 .git/refs/heads/ 里那个小文件
提交对象还在 .git/objects 里
只要有哈希，就能重新建一个指针指过去
```

**这就是第 22 节课"分支只是一个指针"的实用价值。**

**但如果哈希也忘了呢？**

**用 `git reflog`：**

```text
git reflog
```

**输出（类似）：**

```text
a1b2c3d HEAD@{0}: checkout: moving from feature-add-task to main
a1b2c3d HEAD@{1}: commit: 添加 listTasks 函数
d4e5f6g HEAD@{2}: commit: 添加 addTask 函数
...
```

**`reflog` 是什么：**
"reference log"，记录了 HEAD 的每一次移动。

**它记录了你所有的 checkout、commit、reset。**

**所以就算你忘了哈希，也能从 `reflog` 里翻出来。**

**这个命令是"救命工具"。** 以后任何"我东西丢了"的情况，先跑 `git reflog`。

**`reflog` 的记录保留多久：**
默认 90 天（未引用的提交）。**所以别指望太久之前的东西。**

---

# 第 4 步：切分支时的四个危险情况（20 分钟）

## 4.1 危险一：有未提交改动时切分支

**做实验：**

1. 在 `main` 上，改一下 `README.md`（加一行）；
2. **不要提交**；
3. 切分支：

   ```text
   git switch feature-add-task
   ```

**会发生什么？**

**如果两个分支的 `README.md` 一样，会成功切换，改动跟着带过去。**

**验证：**

```text
git status
```

**你会看到 `modified: README.md`。**

**为什么：**
因为改动还在"工作区"，切换分支不会动工作区里"两边都一样"的文件。

**这很危险：**

```text
你以为切到了新分支，改动被隔离了
实际上改动跟着你走，会污染新分支
```

**如果两个分支的 `README.md` 不一样呢？**

**Git 会拒绝：**

```text
error: Your local changes to the following files would be overwritten by checkout:
        README.md
Please commit your changes or stash them before you switch branches.
Aborting
```

**`Your local changes would be overwritten` 是什么：**
"你的本地改动会被覆盖"。

**Git 不让你切，因为切了改动就丢了。**

**两种解法：**

**解法一：提交（如果改动是完整的）**

```text
git add README.md
git commit -m "临时提交"
```

**解法二：暂存起来（`git stash`）**

```text
git stash
git switch feature-add-task
# 干完事回来
git switch main
git stash pop
```

**`stash` 是什么：**
把未提交的改动"收进抽屉"，工作区变干净。**之后再 `pop` 拿出来。**

**这是最常用的"临时收工"工具。**

**继续实验前，先把改动收起来：**

```text
git stash
git status
```

**应该显示干净了。**

**看抽屉里有什么：**

```text
git stash list
```

**输出：**

```text
stash@{0}: WIP on main: 924c558 初始化：项目说明
```

**`WIP` 是什么：** Work In Progress（进行中的工作）。

**拿出来：**

```text
git stash pop
```

**改动回来了。**

**`pop` 和 `apply` 的区别：**

```text
git stash pop      拿出来，并从抽屉里删掉
git stash apply    拿出来，但抽屉里还留一份
```

**大多数情况用 `pop`。**

## 4.2 危险二：在游离 HEAD 上删分支

**回顾第 22 节课：游离 HEAD 是 `git checkout <哈希>` 后的状态。**

**危险在于：**

```text
游离 HEAD 上提交 → 切走 → 提交没分支指向 → 会被清理
```

**而且如果在游离状态下删了分支：**

```text
git branch -D 某个分支
```

**那个分支的提交可能就真的找不回来了**（除非 `reflog` 还有记录）。

**这就是为什么第 22 节课的警告要认真看。**

## 4.3 危险三：切分支时忘了保存文件

**这个和 Git 无关，但很常见。**

**做实验：**

1. 在 VS Code 里打开 `task.js`；
2. 改几行，**不保存**（不按 `Ctrl + S`）；
3. 用终端切分支；
4. 回到 VS Code。

**会发生什么：**

**VS Code 会提示：**

```text
文件已被修改，是否重新加载？
```

**如果你点了"是"，你刚才的改动就丢了。**

**因为：**

```text
Git 切分支时改的是磁盘上的文件
VS Code 里没保存的内容还在内存里
两边冲突了
```

**规则：切分支前先 `Ctrl + S` 保存所有文件。**

**保险做法：切分支前先 `git status`，确认没有意料之外的改动。**

## 4.4 危险四：以为"切分支 = 代码被复制"

**这个误解会导致很奇怪的操作。**

**比如：**

```text
"我建了 10 个分支，会不会占 10 倍空间？"
"我改了一个分支的代码，其他分支的文件也变了吗？"
```

**做实验验证：**

1. 切到 `feature-add-task`；
2. 改 `task.js` 加一行；
3. **不提交**；
4. 切回 `main`。

**看 `task.js` 在 main 上存在吗？**

**不存在**（因为 main 没有这个文件）。

**再切回 `feature-add-task`：**

**你刚才的改动还在吗？**

**在。**

**为什么：**
未提交的改动存在"工作区"，切分支时 Git 会尽量保留它们。

**这个行为很容易造成混乱。**

**规则：切分支前让工作区干净（提交或 stash）。**

**这样每次切换都是"整块换掉"，不会有一半旧一半新的状态。**

---

# 第 5 步：一套规范的分支命名（10 分钟）

## 5.1 为什么命名要规范

**三个月后你看到这些分支：**

```text
test
test2
new
new2
fix
fix-final
fix-final-2
aaa
```

**完全不知道每个是什么。**

## 5.2 推荐命名规则

**本课程统一用这个格式：**

```text
<类型>/<简短描述>
```

**五种类型：**

| 前缀 | 用途 | 例子 |
|---|---|---|
| `feature/` | 新功能 | `feature/export-chat` |
| `fix/` | 修 bug | `fix/login-timeout` |
| `docs/` | 文档 | `docs/readme-setup` |
| `refactor/` | 重构（不改功能） | `refactor/store-split` |
| `experiment/` | 实验（可能丢弃） | `experiment/redis-cache` |

**注意用 `/` 分隔。**

**为什么用 `/`：**

```text
Git 允许分支名带 /
在 .git/refs/heads/ 里会变成子目录
git branch 显示时也会分组
```

**看效果：**

```text
git switch -c feature/export-chat
git switch -c fix/login-timeout
git branch
```

**输出：**

```text
  feature/export-chat
* fix/login-timeout
  main
```

**（有些终端会按前缀分组显示，更清楚。）**

## 5.3 命名要点

**好的分支名：**

```text
feature/export-chat        ✅ 一眼知道做什么
fix/login-timeout          ✅ 知道修什么
docs/add-deploy-guide      ✅ 知道加什么文档
```

**差的分支名：**

```text
feature/new              ❌ 新的什么？
fix                      ❌ 修什么？
zhangsan                 ❌ 人名不是内容
test123                  ❌ 毫无信息
我的分支                  ⚠️ 能用但不推荐（跨平台可能有编码问题）
```

**规则：**

```text
① 小写字母
② 用 - 或 / 分隔
③ 不要空格
④ 不要中文（跨系统可能有编码问题）
⑤ 简短（20 字符以内最好）
⑥ 描述"做什么"，不是"谁做的"
```

**清理实验分支：**

```text
git switch main
git branch -D feature/export-chat fix/login-timeout
```

---

# 第 6 步：故意犯六个错（15 分钟）

## 错误 1：`git switch` 写成了不存在的分支

**操作：**

```text
git switch feature-typo
```

**输出：**

```text
fatal: invalid reference: feature-typo
```

**`invalid reference` 是什么：** 无效的引用（没有这个分支）。

**为什么：**
`switch` 只能切到**已存在**的分支。要新建用 `-c`。

**如果你想新建但忘了 `-c`：**

```text
git switch -c feature-typo
```

## 错误 2：`git branch -d` 删未合并的分支

**操作：**

```text
git branch -d feature-add-task
```

**输出（实测）：**

```text
error: the branch 'feature-add-task' is not fully merged
hint: If you are sure you want to delete it, run 'git branch -D feature-add-task'
hint: Disable this message with "git config set advice.forceDeleteBranch false"
```

**这个提示是保护你的。**

**但如果你确实不要了：**

```text
git branch -D feature-add-task
```

**删之前先想清楚：**

```text
这个分支上的提交，还有别的地方引用吗？
如果没有，删了就真的找不到了（除非 reflog）
```

## 错误 3：切分支前没保存文件

**操作（在 VS Code 里）：**

1. 打开 `README.md`；
2. 加一行字，**不保存**；
3. 在终端 `git switch -c test-unsaved`。

**结果：**

**VS Code 会弹提示"文件已被修改，是否重新加载"。**

**如果你点"是"，改动丢了。**

**规则：切分支前 `Ctrl + S`。**

## 错误 4：以为切分支会带上未提交改动

**操作：**

1. 在 main 上改 `README.md`，不提交；
2. `git switch -c new-branch`；
3. `git status`。

**你会看到 `modified: README.md` 还在。**

**为什么：**
因为改动在"工作区"，切换分支不会把它"留在原分支"。

**要真正"隔离"，必须：**

```text
提交（改动属于这个分支）
或者
stash（收进抽屉）
```

## 错误 5：在游离 HEAD 上建分支然后切走

**操作：**

```text
git checkout HEAD~0     # 进游离状态
git switch -c detached-work
git commit --allow-empty -m "游离分支的提交"
git switch main
git branch -D detached-work
```

**现在那个提交还在吗？**

**在 `git reflog` 里还能找到，但没分支指向。**

**这个实验的目的是让你体会"删分支之后，提交就孤立了"。**

**从 `reflog` 恢复：**

```text
git reflog
```

**找到那个哈希，然后：**

```text
git branch recovered <哈希>
```

## 错误 6：分支名用了空格或中文

**操作：**

```text
git switch -c "my new branch"
```

**Git 会拒绝：**

```text
fatal: 'my new branch' is not a valid branch name
```

**为什么：**
分支名最终要变成文件名（`.git/refs/heads/my new branch`）。**空格在很多场景下会出问题。**

**中文呢：**

```text
git switch -c 功能分支
```

**这个能成功**（Git 允许），**但不推荐。**

**为什么不推荐：**

```text
① 某些 Git 工具/网页界面显示乱码
② 命令行里要处理编码
③ 团队里外国同事看不懂
④ URL 里会变成一长串 %E5%8A%9F...
```

**用英文：`feature/xxx`。**

## 六个错误总结

```text
switch 到不存在的分支  → invalid reference，要加 -c
-d 删未合并分支        → error: not fully merged，想清楚再 -D
切分支前没保存文件      → VS Code 提示，改动可能丢
以为改动会留下         → 切完还在，要提交或 stash
游离 HEAD 建分支再删    → 提交孤立，靠 reflog 找回
分支名有空格/中文       → 报错或显示问题
```

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 25 节课学习笔记

## 一、分支解决什么问题

我的理解：

如果没有分支，加一个新功能时可能遇到什么麻烦：

## 二、`switch` 和 `checkout` 的对比

| 要做的事 | 新命令 | 老命令 |
|---|---|---|
| 切分支 | | |
| 建并切分支 | | |
| 丢弃文件改动 | | |
| 取消暂存 | | |

为什么推荐新的：

为什么还必须认识老的：

## 三、六种分支操作

| 操作 | 命令 |
|---|---|
| 列出本地分支 | |
| 列出含远程 | |
| 看未合并的分支 | |
| 建但不切 | |
| 切分支 | |
| 切回上一个 | |
| 重命名 | |
| 安全删除 | |
| 强制删除 | |

## 四、删分支能恢复吗

能，条件是：

恢复的命令：

如果忘了哈希用什么命令：

`reflog` 保留多久：

## 五、切分支的四个危险

1.
2.
3.
4.

`git stash` 的两个常用命令：

`pop` 和 `apply` 的区别：

## 六、分支命名规范

格式：

五种前缀：

为什么用 `/`：

为什么不用中文：

## 七、六个错误的后果

| 错误 | 报错或现象 | 怎么解决 |
|---|---|---|
| switch 到不存在的 | | |
| -d 删未合并 | | |
| 没保存文件 | | |
| 以为改动会留下 | | |
| 游离 HEAD 建分支再删 | | |
| 分支名有空格 | | |

## 八、我实际做的实验

切分支时 `task.js` 消失又出现，我的感受：

删分支后用哈希恢复，我用的命令：

`git reflog` 里我看到了什么：

## 九、我还不懂的词

- 

## 十、完成检查

- [ ] 我有一个独立的 `branch-lab` 仓库
- [ ] 我做过"切分支后文件消失又出现"的实验
- [ ] 我做过删分支并用哈希恢复的实验
- [ ] 我看过 `git reflog` 的输出
- [ ] 我做过 `git stash` 和 `git stash pop`
- [ ] 我知道 `-d` 和 `-D` 的区别
- [ ] 我知道为什么分支名不用中文
- [ ] 我做过六个错误的实验
```

---

# 第 8 步：课后练习

## 练习一：模拟一次完整的"功能开发"

**要求：**

1. 从 `main` 建分支 `feature/delete-task`；
2. 在 `task.js` 里加 `deleteTask(id)` 函数；
3. 提交；
4. 切回 `main`，确认 `main` 上没有这个函数；
5. 切回分支，确认有；
6. **先不要合并**（第 26 节课会合）。

**记录：每一步 `git status` 和 `git log --oneline` 的输出。**

## 练习二：用 `stash` 处理紧急情况

**场景模拟：**

1. 在 `feature/delete-task` 上改了一半（加了函数但没写完）；
2. **突然** `main` 上有个紧急 bug 要修；
3. 你不想提交半成品。

**要求：**

1. `git stash`；
2. 切到 main，修（随便改一行）并提交；
3. 切回来，`git stash pop`；
4. 确认你的半成品改动回来了。

**思考：为什么 `stash` 比"提交一个半成品"更好？**

## 练习三：制造一个"删了又找回"

**要求：**

1. 建分支，提交一次；
2. **记下哈希**；
3. 删分支（`-D`）；
4. `git reflog` 找到它；
5. 恢复。

**然后回答：如果 `reflog` 的记录过期了（90 天后），还能找回吗？**

## 练习四：找出这段命令的四个问题

```text
git checkout -b "新功能"
git switch feature-new
git branch -d feature-new
git switch -
```

**提示方向：** 中文分支名、没先建就 switch、`-d` 可能拒绝、`-` 在只有一个分支时指向哪。

## 练习五：用自己的话讲

```text
为什么"建分支"几乎不占空间？
为什么切分支时文件会"消失"？
为什么 `-d` 要拒绝删除未合并的分支？
为什么切分支前要让工作区干净？
```

---

# 第 9 步：最终验收

## A. `switch` / `checkout`

- [ ] 我知道 `switch` 和 `checkout` 的对应关系
- [ ] 我主要用 `switch` 和 `restore`
- [ ] 我能看懂别人写的 `checkout`
- [ ] 我会用 `git switch -` 切回上一个

## B. 分支操作

- [ ] 我会用 `git branch` 列出
- [ ] 我会用 `-a` 列出全部
- [ ] 我会用 `-vv` 看最新提交
- [ ] 我会用 `--merged` / `--no-merged`
- [ ] 我会 `git branch 名字` 建但不切
- [ ] 我会 `git switch -c` 建并切
- [ ] 我会 `git branch -m` 重命名
- [ ] 我会 `-d` 安全删除
- [ ] 我会 `-D` 强制删除

## C. 恢复

- [ ] 我知道删分支后能用哈希恢复
- [ ] 我会用 `git reflog` 找丢失的提交
- [ ] 我知道 `reflog` 只保留约 90 天

## D. 危险场景

- [ ] 我知道切分支时未提交改动的行为
- [ ] 我会用 `git stash` / `git stash pop`
- [ ] 我知道 `pop` 和 `apply` 的区别
- [ ] 我知道切分支前要存文件
- [ ] 我知道游离 HEAD 上建分支的风险

## E. 规范

- [ ] 我会用 `feature/` `fix/` `docs/` 等前缀
- [ ] 我的分支名是小写、无空格、无中文
- [ ] 我知道为什么不用中文

## F. 实操

- [ ] `branch-lab` 有至少 2 个分支
- [ ] 我做过"文件消失又出现"实验
- [ ] 我做过删分支再恢复
- [ ] 我做过 stash 流程
- [ ] 我做过六个错误的实验

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有 `reflog` 的实际输出
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **分支是一条可以随时丢弃的实验线，成本只是 40 字节。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `invalid reference` | 分支不存在 | 要新建加 `-c` |
| `not fully merged` | 有未合并提交 | 确认不要了用 `-D` |
| `Your local changes would be overwritten` | 有未提交改动 | 提交或 `stash` |
| 切完分支文件不见了 | 那文件不属于当前分支 | 切回去就有，不是丢失 |
| VS Code 提示"文件已被修改" | 切分支时没保存 | 点重新加载，以后先 `Ctrl + S` |
| 删分支后想要回来 | 分支删了 | `git reflog` 找哈希再 `git branch 名字 哈希` |
| `not a valid branch name` | 名字有空格等非法字符 | 用小写字母和 `-` `/` |
| `reflog` 也找不到了 | 超过 90 天 | 基本找不回，靠远程仓库备份 |
| `stash pop` 冲突 | 改动和当前分支冲突 | 手动解决后 `git stash drop` |
| 分支名显示乱码 | 用了中文 | 规范化英文命名 |
| `switch -` 跳错地方 | "上一个"是你上次离开的分支 | 用 `git branch` 确认现状 |
| 建了很多分支很乱 | 没清理 | `--merged` 找出可删的批量删 |
