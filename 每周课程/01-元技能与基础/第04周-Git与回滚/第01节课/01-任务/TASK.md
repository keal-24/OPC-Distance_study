# 第 22 节课：认识版本记录——Git 到底在管什么

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 1 周第 6 节课你学过 `add`、`commit`、`restore`。这节课往下走一层：**搞清楚 Git 内部那几个东西到底是什么。**
> 讲不清内部结构，你以后遇到"改分支丢代码"、"合并冲突"、"reset 之后文件没了"，永远只能死记命令。

**建议用时**：100 分钟
**你需要先完成**：第 1—21 节课（有一堆提交过的文件）

---

# 第 0 步：为什么还要再学一遍 Git（10 分钟）

## 0.1 你现在会什么

第 1 周你学会了四个命令：

```text
git status       看现状
git add          挑出要提交的
git commit -m    存档
git log          看历史
```

**这够用，但你只会"线性"用一个分支。**

## 0.2 你以后会遇到什么

```text
① "我想试一个新做法，但不想弄坏现在的代码"
② "两个人同时改了同一个文件，怎么合"
③ "我不小心 reset 了，代码没了"
④ "这个 bug 是哪次提交引入的"
⑤ "改到一半发现思路错了，想只扔掉这一部分"
```

**这五个场景，只用 `add/commit/log` 解决不了。**

## 0.3 今天要建立的三个概念

```text
① 提交（commit）到底是什么东西
② HEAD 是什么
③ 分支（branch）到底是什么
```

**这三个搞清楚了，第 23—28 节课的命令你都能自己推出来，不用背。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `sandbox/` | `03-练习代码` | 你的练手仓库（不是课程仓库） |

---

# 第 1 步：先建一个独立的练手仓库（15 分钟）

## 1.1 为什么不能直接在课程仓库里练

**因为接下来要做的实验包括：**

```text
删分支
强制回退
制造冲突
reset --hard
```

**这些操作在课程仓库里做，可能把你的作业弄丢。**

**规则：危险操作一律在练手仓库里做。**

**这条规则以后一直有效。** 学 Git 的每一个新命令，都先在练手仓库试。

## 1.2 建 sandbox

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第04周-Git与回滚\第01节课\03-练习代码
   ```

2. 新建文件夹 `sandbox`。
3. **进入 `sandbox`**（重要：后面的命令都在这个目录里执行）。
4. 在地址栏输入 `cmd` 打开终端。

**验证当前目录：**

```text
cd
```

**输出里必须有 `sandbox`。**

## 1.3 初始化仓库

```text
git init
```

**应该看到：**

```text
Initialized empty Git repository in B:/.../sandbox/.git/
```

**`git init` 做了什么：**
在目录里创建一个 `.git` 文件夹。

**这个文件夹就是 Git 的全部"记忆"。**

## 1.4 看一眼 `.git` 里有什么

```text
dir .git
```

**你会看到类似：**

```text
HEAD
config
description
hooks
info
objects
refs
```

**这四个先记住名字：**

| 名字 | 是什么 |
|---|---|
| `HEAD` | 一个文件，写着"你现在在哪" |
| `objects` | 所有内容都存这里（压缩过的） |
| `refs` | 分支和标签的指针 |
| `config` | 这个仓库的配置 |

**现在不用懂细节。** 但这四个名字后面都会用到。

**注意：`.git` 目录不要手动改。** 改了很可能整个仓库坏掉。

## 1.5 配置用户名和邮箱

**如果是第一次在这台电脑上用 Git：**

```text
git config --global user.name "你的名字"
git config --global user.email "you@example.com"
```

**`--global` 是什么意思：** 全局配置，所有仓库共用。

**如果只想给这个仓库配（不带 `--global`）：**

```text
git config user.name "你的名字"
git config user.email "you@example.com"
```

**为什么需要这个：**
因为每次提交都会记录"谁提交的"。没配的话，`git commit` 会报错：

```text
Author identity unknown

*** Please tell me who you are.

Run

  git config --global user.email "you@example.com"
  git config --global user.name "You Name"
```

**这就是"Git 不知道你是谁"。** 按提示配一次就好。

**验证：**

```text
git config --list
```

**应该能看到 `user.name` 和 `user.email`。**

---

# 第 2 步：提交到底是什么（25 分钟）

## 2.1 先做第一次提交

**创建文件：**

```text
echo # 我的练手项目 > README.md
```

**`echo xxx > 文件名` 是什么：** 把 `xxx` 写进这个文件（会覆盖）。

**看状态：**

```text
git status
```

**应该看到：**

```text
On branch main

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        README.md

nothing added to commit but untracked files present (use "git add" to track)
```

**逐句读：**

| 行 | 意思 |
|---|---|
| `On branch main` | 你在 main 分支上 |
| `No commits yet` | 还没有任何提交 |
| `Untracked files` | 这些文件 Git 还没开始管 |
| `README.md` | 就是那个新文件 |

**`Untracked`（未跟踪）是什么：**
Git 看见了这个文件，但**没有记录过它**。它不在版本管理里。

**关键理解：** 一个文件从"未跟踪"到"被管理"，必须经过 `git add`。

## 2.2 add 之后发生了什么

```text
git add README.md
git status
```

**现在变成：**

```text
On branch main

No commits yet

Changes to be committed:
  (use "git rm --cached <file>..." to unstage)
        new file:   README.md
```

**`Changes to be committed` = 已放进暂存区。**

**`new file:` 是什么：** Git 知道这是一个新文件（之前没记录过）。

## 2.3 看一眼 Git 内部存了什么

**这一步很关键，会让你真正理解 Git。**

```text
git ls-files --stage
```

**应该看到类似：**

```text
100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 0       README.md
```

**拆开读：**

```text
100644                                    文件权限
e69de29bb2d1d6434b8b29ae775ad8c2e48c5391  内容的哈希值（SHA-1）
0                                         暂存区编号
README.md                                 文件路径
```

**哈希值是什么：**

一串 40 个十六进制字符，**由文件内容算出来的**。

```text
同样的内容 → 永远得到同样的哈希
内容变一点 → 哈希完全不同
```

**这是 Git 的核心机制：用哈希值标识内容。**

**为什么这样设计：**

```text
① 内容相同就不用重复存（自动去重）
② 内容有没有被篡改，算一下哈希就知道
③ 每个版本有唯一编号，可以精确定位
```

**你的文件内容现在真的存在 Git 里了吗？**

**是的。** 它存在 `.git/objects` 里。

```text
dir .git\objects
```

**你会看到一些两字符的文件夹名（比如 `e6`）。**

**进去看：**

```text
dir .git\objects\e6
```

**会看到文件名 `9de29bb2d1d6434b8b29ae775ad8c2e48c5391`。**

**`e6` + `9de29bb...` = 完整的哈希 `e69de29bb...`。**

**Git 把哈希的前两位当文件夹名，后 38 位当文件名。** 这样文件不会全堆在一个目录里。

**现在打开那个文件看看：**

```text
type .git\objects\e6\9de29bb2d1d6434b8b29ae775ad8c2e48c5391
```

**你会看到一堆乱码。**

**为什么是乱码：**
因为 Git 把内容 **zlib 压缩**了。

**想解开看：**

```text
git cat-file -p e69de29
```

**应该看到：**

```text
# 我的练手项目
```

**`git cat-file -p <哈希>` 是什么：**
按哈希值取出内容并打印。**这就是"从 Git 里读回一个对象"。**

**这个命令以后很有用：**
当你想看"某次提交里某个文件是什么样"，就可以用它。

## 2.4 现在提交

```text
git commit -m "第一次提交：创建 README"
```

**应该看到：**

```text
[main (root-commit) 49be3ae] 第一次提交：创建 README
 1 file changed, 1 insertion(+)
 create mode 100644 README.md
```

**逐项读：**

| 部分 | 意思 |
|---|---|
| `main` | 在 main 分支 |
| `(root-commit)` | 这是第一个提交（没有父提交） |
| `49be3ae` | 提交的哈希（短版，前 7 位） |
| `1 file changed` | 改了 1 个文件 |
| `1 insertion(+)` | 加了 1 行 |
| `create mode 100644` | 新建文件，权限 644 |

**注意 `49be3ae` 和之前那个 `e69de29` 不一样。**

**为什么：**

```text
e69de29...  是 README.md 内容的哈希
49be3ae...  是这次"提交对象"的哈希
```

**提交对象里包含：**

```text
① 指向的文件树（tree）的哈希
② 父提交的哈希（第一次提交没有）
③ 作者和提交者信息
④ 时间
⑤ 提交信息
```

**看一个提交对象的真实内容：**

```text
git cat-file -p HEAD
```

**应该看到类似：**

```text
tree 8a1b2c3d...
author 测试 <test@example.com> 1763275000 +0800
committer 测试 <test@example.com> 1763275000 +0800

第一次提交：创建 README
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `tree ...` | 这次提交对应的"目录快照" |
| `author ...` | 作者 + 时间戳 + 时区 |
| `committer ...` | 提交者 + 时间戳 + 时区 |
| 空行之后 | 提交信息 |

**`tree` 是什么：**
一个"目录树对象"，记录"这个版本里有哪些文件、每个文件对应哪个哈希"。

**看这个 tree：**

```text
git cat-file -p HEAD^{tree}
```

**`HEAD^{tree}` 是什么：** 取 `HEAD` 指向的那个提交的 tree。

**应该看到：**

```text
100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391    README.md
```

**`blob` 是什么：** Git 里存文件内容的对象类型。

**三种对象类型：**

| 类型 | 存什么 |
|---|---|
| `blob` | 文件内容 |
| `tree` | 目录结构（哪些文件、对哪个 blob） |
| `commit` | 一次提交（tree + 父提交 + 作者 + 信息） |

**现在你看到了 Git 的真实结构：**

```text
commit 49be3ae
  └── tree 8a1b2c3d
        └── blob e69de29  (README.md 的内容)
```

**这就叫"内容寻址存储"。**

## 2.5 一个必须理解的结论

```text
Git 不是"记录每次改了什么"，而是"记录每个版本完整的样子"。
```

**为什么这么说：**

**每次提交都有一个 tree，tree 里列出了所有文件。**

**看起来像是存了很多份完整文件，实际上不会浪费空间**，因为：

```text
没变的文件，哈希一样，Git 就复用同一个 blob，不重复存。
```

**所以你改了 100 个文件里的 1 个，第 100 次提交里只会多 1 个新 blob。**

**这个机制叫"内容去重"。** 它是 Git 又快又省空间的原因。

---

# 第 3 步：HEAD 是什么（15 分钟）

## 3.1 看 HEAD 文件

```text
type .git\HEAD
```

**应该输出：**

```text
ref: refs/heads/main
```

**逐字读：**

```text
ref:              这是一个"引用"（指向别处）
refs/heads/main   指向 refs/heads/main 这个文件
```

**再看那个文件：**

```text
type .git\refs\heads\main
```

**应该输出一个 40 位的哈希（你的会和我的不同）：**

```text
49be3ae1f2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7
```

**这就是你最新那次提交的完整哈希。**

## 3.2 所以 HEAD 是什么

```text
HEAD  →  refs/heads/main  →  最新提交的哈希
```

**三层指针。**

**用一句话说：**

> **HEAD 的意思是"你现在站在哪儿"。**

**它指向你当前所在的分支，分支指向最新的提交。**

## 3.3 用命令验证

```text
git rev-parse HEAD
```

**输出完整哈希。**

```text
git rev-parse --abbrev-ref HEAD
```

**输出当前分支名：**

```text
main
```

**这两个命令在实际脚本里很有用。**

## 3.4 HEAD 的三种写法

**Git 里可以这样引用提交：**

| 写法 | 意思 |
|---|---|
| `HEAD` | 最新那次提交 |
| `HEAD~1` | 上一次提交（父提交） |
| `HEAD~3` | 往前数 3 次 |
| `HEAD^` | 同 `HEAD~1`（合并提交时 `^2` 指第二个父提交） |
| `49be3ae` | 用哈希（前 7 位就够） |

**`~` 和 `^` 的区别（合并提交时才不同）：**

```text
HEAD~2     一直沿第一父提交往前数 2 次
HEAD^2     第二个父提交（只有合并提交才有）
```

**现在只有一个提交，`HEAD~1` 会报错：**

```text
fatal: ambiguous argument 'HEAD~1': unknown revision or path not in the working tree.
```

**这是正常的。** 等有了多次提交再试。

## 3.5 一个反直觉的点

**HEAD 不是"最新提交"，是"你所在的位置"。**

**这两者的区别在"游离 HEAD"（detached HEAD）时会暴露。**

**做一个实验：**

```text
git checkout --detach
```

**看状态：**

```text
git status
```

**应该看到：**

```text
HEAD detached at 49be3ae
nothing to commit, working tree clean
```

**`HEAD detached` 是什么：**
HEAD 不再指向分支，而是**直接指向某个提交**。

**现在看 HEAD 文件：**

```text
type .git\HEAD
```

**变成直接一个哈希了：**

```text
49be3ae1f2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7
```

**不再是 `ref: refs/heads/main`。**

**危险在哪：**

```text
在游离 HEAD 状态下提交，新提交不属于任何分支。
一旦切走，这些提交就"找不到"了（虽然还在，但没分支指向它）。
```

**试试看：**

1. 在游离状态下改个文件提交：

   ```text
   echo "游离状态的内容" > detached.txt
   git add detached.txt
   git commit -m "游离提交"
   ```

2. 现在切回 main：

   ```text
   git checkout main
   ```

**会看到警告：**

```text
Warning: you are leaving 1 commit behind, not connected to
any of your branches:

  7a8b9c0 游离提交

If you want to keep it by creating a new branch, this may be a good time
to do so with:

 git branch <new-branch-name> 7a8b9c0

Switched to branch 'main'
```

**这个警告非常重要：**

```text
"你正在离开 1 个提交，它没有连接到任何分支"
```

**意思是：那个提交还在（在 objects 里），但没有任何分支指向它。** 如果不管它，Git 以后会清理掉。

**怎么救：**

**按提示做：**

```text
git branch save-detached 7a8b9c0
```

**现在那个提交有分支指向了，不会丢。**

**验证：**

```text
git branch
```

**应该看到两个分支：**

```text
* main
  save-detached
```

**这个实验一定要做。** 它是"代码莫名消失"最常见的原因之一。

**清理掉这个实验分支：**

```text
git branch -D save-detached
```

**`-D` 是什么：** 强制删除（因为还没合并，普通 `-d` 会拒绝）。

---

# 第 4 步：分支到底是什么（25 分钟）

## 4.1 先破除最大的误解

**很多人以为"分支是把代码复制一份"。**

**不是的。**

**分支只是一个"文件"，里面写着一个哈希值。**

**验证：**

```text
git branch
```

**输出：**

```text
* main
```

**`*` 表示"你现在在这个分支上"。**

**现在建一个新分支：**

```text
git branch test
```

**再列一次：**

```text
git branch
```

**输出：**

```text
* main
  test
```

**看两个分支的文件：**

```text
type .git\refs\heads\main
type .git\refs\heads\test
```

**你会发现：两个文件的内容完全一样，都是同一个哈希。**

**这就证明：建分支没复制任何代码，只是新建了一个指向同一提交的文件。**

**占用的空间：几十个字节。**

**所以"多建分支"完全不用担心成本。** 建一百个分支也没关系。

## 4.2 切换分支时发生了什么

```text
git checkout test
```

**应该看到：**

```text
Switched to branch 'test'
```

**现在看 HEAD：**

```text
type .git\HEAD
```

**变成：**

```text
ref: refs/heads/test
```

**只改了 HEAD 里的三个字符（`main` → `test`）。**

**工作目录里的文件变了吗？**

```text
git status
dir
```

**文件没变，状态是干净的。**

**为什么：**
因为两个分支指向**同一个提交**。同一个提交对应同样的文件内容，所以工作目录不需要动。

## 4.3 现在在新分支上提交

```text
echo "只有 test 分支有这个文件" > test-only.txt
git add test-only.txt
git commit -m "在 test 分支添加文件"
```

**现在看两个分支指向哪里：**

```text
type .git\refs\heads\main
type .git\refs\heads\test
```

**你会发现：**

```text
main  还是旧哈希
test  变成了新哈希
```

**这就是分支的本质：**

```text
分支 = 一个指向某次提交的指针
提交 = 让当前分支的指针往前移动一格
```

**现在切回 main：**

```text
git checkout main
```

**检查文件：**

```text
dir
```

**`test-only.txt` 不见了！**

**别慌，它没丢。** 它存在于 test 分支指向的那个提交里。

**证据：**

```text
git checkout test
dir
```

**又出现了。**

**这就是"切换分支"的真实行为：把工作目录换成那个分支对应的样子。**

## 4.4 一张图理解

**你现在仓库的形状：**

```text
        test 分支
           ↓
    [提交2: 加 test-only.txt]
           ↓
    [提交1: 创建 README]
           ↑
        main 分支
```

**`git log --oneline --graph --all` 能画出来：**

```text
* 7a8b9c0 在 test 分支添加文件
* 49be3ae 第一次提交：创建 README
```

**注意：现在只有一条线，因为 main 没有新提交。**

**让 main 也往前走一步：**

```text
git checkout main
echo "main 的内容" > main-only.txt
git add main-only.txt
git commit -m "在 main 分支添加文件"
```

**现在再看图：**

```text
git log --oneline --graph --all
```

**你会看到真正的分叉：**

```text
* 3ba7a74 在 main 分支添加文件
| * 7a8b9c0 在 test 分支添加文件
|/  
* 49be3ae 第一次提交：创建 README
```

**这就是"分支图"。**

**读法：**

```text
最上面两个点：两个分支各自的最新提交
中间的 |/   ：两条线在这里汇合（共同祖先）
最下面      ：它们共同的起点
```

**`--all` 是什么：** 显示所有分支，不只当前分支。
**`--graph` 是什么：** 用字符画出分支结构。

**这个命令以后你会天天用。** 建议记住：

```text
git log --oneline --graph --all
```

## 4.5 合并到底在做什么

**现在把 test 合进来：**

```text
git merge test
```

**应该看到：**

```text
Merge made by the 'ort' strategy.
 test-only.txt | 1 +
 1 file changed, 1 insertion(+)
 create mode 100644 test-only.txt
```

**`ort` 是什么：** Git 的合并策略名（"Ostensibly Recursive's Twin"）。**不用管名字，知道是"自动合并"就行。**

**现在看图：**

```text
git log --oneline --graph --all
```

**你会看到：**

```text
*   f2e3d4c Merge branch 'test'
|\  
| * 7a8b9c0 在 test 分支添加文件
* | 3ba7a74 在 main 分支添加文件
|/  
* 49be3ae 第一次提交：创建 README
```

**注意最上面多了一个提交：`Merge branch 'test'`。**

**这个"合并提交"有两次父提交**（所以图上有两条线汇入）。

**看它：**

```text
git cat-file -p HEAD
```

**你会看到两行 `parent`：**

```text
tree ...
parent 3ba7a74...     ← 第一个父：main 上的提交
parent 7a8b9c0...     ← 第二个父：test 上的提交
author ...
committer ...

Merge branch 'test'
```

**这就是"合并提交"的定义：有两个或更多父提交的提交。**

## 4.6 一个重要的对比：快进合并

**刚才的合并产生了"合并提交"，因为它有分叉。**

**如果没分叉呢？**

**做这个实验：**

```text
git checkout -b fast
echo "fast 内容" > fast.txt
git add fast.txt
git commit -m "fast 分支的提交"
```

**现在 main 没动过，fast 往前走了一步。这是"线性"的。**

**切回 main 合并：**

```text
git checkout main
git merge fast
```

**输出不一样了：**

```text
Updating 3ba7a74..9c8d7e6
Fast-forward
 fast.txt | 1 +
 1 file changed, 1 insertion(+)
 create mode 100644 fast.txt
```

**`Fast-forward` 是什么：**
"快进"。**没有产生新的提交，只是把 main 的指针往前挪了一下。**

**为什么能快进：**
因为 main 一直没动，fast 是直接从 main 长出来的。**合并只需要"让 main 追上去"。**

**对比两种合并：**

| | 快进（Fast-forward） | 三方合并（产生合并提交） |
|---|---|---|
| 条件 | 目标分支没动过 | 两边都有新提交 |
| 结果 | 指针前移，无新提交 | 新建一个合并提交 |
| 图 | 一条直线 | 出现分叉再汇合 |
| 历史 | 干净 | 保留"这里合并过" |

**想看两种区别，用 `--no-ff` 强制产生合并提交：**

```text
git checkout -b noff
echo "noff 内容" > noff.txt
git add noff.txt
git commit -m "noff 分支的提交"
git checkout main
git merge --no-ff noff
```

**`--no-ff` 是什么：** "no fast-forward"，即使能快进也要生成一个合并提交。

**看到什么：**

```text
Merge made by the 'ort' strategy.
 noff.txt | 1 +
```

**为什么真实团队常用 `--no-ff`：**

因为它保留了"这是一个功能分支，在这里合并进来"的信息。

**快进的代价：** 历史是一条直线，看不出"哪些提交是同一个功能"。

**这是一个团队规范问题，没有绝对对错。** 你以后加入团队要遵守他们的规范。

---

# 第 5 步：故意犯五个错（20 分钟）

## 错误 1：在错误的目录 `git init`

**操作：**

1. `cd` 到 `sandbox` 的**上一级**（`03-练习代码`）；
2. 运行 `git init`。

**会怎样：** 在 `03-练习代码` 里创建了一个 `.git`。

**问题：**
这样 `03-练习代码` 变成了一个仓库，`sandbox` 成了它里面的普通目录。**两个仓库嵌套，非常混乱。**

**怎么查：**

```text
git rev-parse --show-toplevel
```

**会告诉你"当前仓库的根目录在哪里"。**

**如果输出的不是你想要的目录，说明你 `init` 错了地方。**

**怎么修：**

删掉那个多余的 `.git` 目录：

```text
rmdir /s /q .git
```

**⚠️ 警告：** `rmdir /s /q .git` 会删除整个仓库历史。**只在"刚 init 错的空仓库"上用。** 有任何提交都不能这么干。

## 错误 2：忘了 `git add`

**操作：**

```text
echo "忘了加" > forgot.txt
git commit -m "想提交"
```

**会怎样：**

```text
On branch main
nothing added to commit but untracked files present (use "git add" to track)
```

**为什么：** `commit` 只提交**暂存区**里的东西。没 `add` 的改动不在暂存区。

**这就是第 1 周学的"工作区 / 暂存区 / 快照"三层。**

**注意：Git 不会"顺手帮你提交所有改动"。** 这是它的设计——让你必须明确"我要提交什么"。

## 错误 3：提交信息为空

**操作：**

```text
git add forgot.txt
git commit -m ""
```

**会怎样：**

```text
Aborting commit due to empty commit message.
```

**`Aborting` 是什么：** 中止。

**为什么：**
Git 强制要求提交信息非空。**因为半年后你会需要它。**

**好的提交信息长什么样：**

```text
✅ 修复购物车小计多算购物袋的问题
✅ 第22节课：认识版本记录
✅ add: 用户列表分页接口

❌ update
❌ 改了一下
❌ fix
❌ .
```

**判断标准：**

```text
只看这一行，能不能知道"这次改了什么、为什么改"？
```

## 错误 4：在游离 HEAD 上提交然后切走

**这个实验你已经做过了（第 3.5 步）。**

**再强调一次危险在哪：**

```text
游离 HEAD 上提交 → 切走 → 那些提交不属于任何分支 → 会被 Git 清理
```

**Git 会给警告，但很多人不看警告就按了回车。**

**规则：看到 `HEAD detached` 就先别提交。**

**如果你已经提交了，用 `git branch 新名字 <哈希>` 救回来。**

## 错误 5：以为分支复制了代码

**操作：** 建 10 个分支：

```text
git branch b1
git branch b2
git branch b3
...
```

**然后看 `.git` 目录大小：**

```text
dir .git\refs\heads
```

**你会看到 11 个很小的文件（每个几十字节）。**

**整个仓库大小没变。**

**这个实验的目的是破除"分支很重"的误解。**

**结论：**

```text
分支 = 一个 40 字节的文件
建分支的成本几乎为零
所以应该大胆用分支
```

**真实团队的做法：**

```text
每个新功能 → 一个新分支
修 bug → 一个新分支
试新想法 → 一个新分支
合完就删掉
```

**这就是为什么 Git 工作流里到处都是分支。**

---

# 第 6 步：把三个概念连起来（10 分钟）

## 6.1 一张总图

```text
HEAD
 ↓
refs/heads/main
 ↓
提交 C（最新）
 ↓ parent
提交 B
 ↓ parent
提交 A（第一个）
```

**每个提交里有一个 tree：**

```text
提交 C
 └── tree
      ├── blob (README.md 的内容)
      ├── blob (main-only.txt 的内容)
      └── blob (test-only.txt 的内容)
```

**每次提交都是一个"完整的目录快照"，通过 tree 指过去。**

**没变的文件，复用同一个 blob。** 所以不会爆炸。

## 6.2 三个概念的一句话总结

```text
提交（commit）= 一次完整的目录快照，有唯一哈希，指向父提交
HEAD         = 你当前站在哪里（通常指向一个分支）
分支（branch）= 一个 40 字节的文件，存着一个提交的哈希
```

## 6.3 由此可以推出所有命令的行为

**不用背，自己推：**

**问题：`git checkout test` 做了什么？**

```text
① 把 HEAD 改成 ref: refs/heads/test
② 把工作目录换成 test 指向的那个提交的样子
```

**问题：`git commit` 做了什么？**

```text
① 把暂存区的内容生成新的 tree 和 blob
② 创建新的 commit 对象，parent 指向当前提交
③ 把当前分支的文件内容改成新 commit 的哈希
```

**问题：`git merge test` 做了什么？**

```text
① 找到两个分支的共同祖先
② 如果目标分支没动过 → 指针前移（快进）
③ 如果都动过 → 三方合并，生成合并提交
④ 如果同一行被两边改过 → 冲突，需要人工处理
```

**问题：`git reset --hard HEAD~1` 做了什么？**

```text
① 把当前分支指向 HEAD~1（上一次提交）
② 把暂存区和工作目录都强制换成那个提交的样子
→ 你的未提交改动全部丢失
```

**能推出这些，你就不需要背命令了。**

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 22 节课学习笔记

## 一、为什么不能直接在课程仓库里练

## 二、`git init` 创建了什么

`.git` 里我看到的四个东西：

| 名字 | 是什么 |
|---|---|
| HEAD | |
| objects | |
| refs | |
| config | |

## 三、Git 的三种对象

| 类型 | 存什么 |
|---|---|
| blob | |
| tree | |
| commit | |

我在 `git cat-file -p HEAD` 里看到了什么：

## 四、一个文件从"未跟踪"到"被提交"经历哪三步

1.
2.
3.

## 五、HEAD 是什么

一句话：

`type .git\HEAD` 输出什么：

`type .git\refs\heads\main` 输出什么：

## 六、分支是什么

一句话：

建一个分支占了多大空间（我的观察）：

`git branch test` 之后，`.git\refs\heads\main` 和 `test` 的内容一样吗：

## 七、`git log --oneline --graph --all` 我看懂了什么

画一下我的仓库现在的图：

## 八、快进合并和三方合并的区别

| | 快进 | 三方合并 |
|---|---|---|
| 条件 | | |
| 有没有新提交 | | |
| 图长什么样 | | |

## 九、游离 HEAD

`HEAD detached` 是什么意思：

在游离状态提交后切走，Git 会警告什么：

我用了什么命令救回来：

## 十、五个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 在错目录 init | | |
| 忘 add | | |
| 提交信息为空 | | |
| 游离 HEAD 提交 | | |
| 以为分支复制代码 | | |

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 我有一个独立的 `sandbox` 仓库
- [ ] 我用 `git cat-file` 看过 blob 和 commit 对象的真实内容
- [ ] 我知道 HEAD 文件里写的是什么
- [ ] 我验证过"建分支不复制代码"
- [ ] 我看懂了自己的分支图
- [ ] 我做过快进合并和三方合并，看到两种输出
- [ ] 我做过游离 HEAD 实验，并用 `git branch <名字> <哈希>` 救回了提交
- [ ] 我做过五个错误的实验
```

---

# 第 8 步：课后练习

## 练习一：用 `cat-file` 探索

**要求：**

1. `git log --oneline` 拿到至少 3 个提交的哈希；
2. 对每个提交运行 `git cat-file -p <哈希>`；
3. 对每个 tree 运行 `git cat-file -p <tree哈希>`；
4. 对其中一个 blob 运行 `git cat-file -p <blob哈希>`。

**记录：** 每个提交的 parent 是谁？能不能画出完整的链？

**额外：** 用 `git cat-file -t <哈希>` 看类型（`commit` / `tree` / `blob`）。

## 练习二：故意不 add 就 commit

**要求：**

1. 新建一个文件；
2. 不 `add`，直接 `git commit -m "试试"`；
3. 记录输出；
4. 然后 `git add` 再 `git commit`。

**思考：为什么 Git 不"自动 add 所有改动"？如果自动 add，会有什么风险？**

## 练习三：画一次完整的分支图

**要求：**

1. 从 main 建分支 `a`，在 `a` 上提交 2 次；
2. 切回 main，提交 1 次；
3. 从 main 建分支 `b`，在 `b` 上提交 1 次；
4. 把 `b` 合并进 main；
5. 把 `a` 合并进 main。

**然后运行 `git log --oneline --graph --all`，把结果画在纸上。**

**回答：main 现在有几个父提交？`a` 的两次提交在图上是什么位置？**

## 练习四：制造一次游离 HEAD 并救回

**要求：**

1. `git checkout <某个旧提交的哈希>`（进入游离状态）；
2. 改文件、提交；
3. `git checkout main`；
4. 记录 Git 的警告原文；
5. 用 `git branch rescue <哈希>` 救回；
6. 验证 `rescue` 分支里有你的提交。

## 练习五：用自己的话讲

```text
为什么"建分支"不消耗空间？
为什么 Git 说"记录每个版本完整的样子"，但又不会重复存文件？
为什么 HEAD 是"你所在的位置"而不是"最新提交"？
```

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出 `.git` 里四个关键部分是干什么的
- [ ] 我能区分 blob / tree / commit 三种对象
- [ ] 我知道 HEAD 文件里写的是什么
- [ ] 我知道分支只是一个指针文件
- [ ] 我知道"提交 = 完整快照 + 父提交指针"

## B. 实操

- [ ] 我能独立 `git init` 一个仓库并配好用户信息
- [ ] 我会用 `git cat-file -p` 查看对象
- [ ] 我会用 `git ls-files --stage` 看暂存区
- [ ] 我会用 `git rev-parse` 查哈希
- [ ] 我会用 `git branch` 建、列、删分支
- [ ] 我会用 `git checkout` 切换分支
- [ ] 我会用 `git log --oneline --graph --all` 看结构

## C. 合并

- [ ] 我做过快进合并，看到 `Fast-forward`
- [ ] 我做过三方合并，看到 `Merge made by the 'ort' strategy`
- [ ] 我知道 `--no-ff` 的作用
- [ ] 我能看懂分叉图

## D. 危险场景

- [ ] 我知道游离 HEAD 的危险
- [ ] 我用 `git branch <名字> <哈希>` 救回过提交
- [ ] 我知道 `rmdir /s /q .git` 只能用在空仓库上
- [ ] 我知道所有危险实验都应该在 `sandbox` 里做

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有自己仓库的分支图
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **Git 不记录"改动"，它记录"每个版本的完整样子"；分支不是复制代码，只是一个写着哈希的小文件。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `Author identity unknown` | 没配用户名邮箱 | `git config --global user.name/email` |
| `fatal: not a git repository` | 不在仓库里 | `cd` 到仓库根目录 |
| `nothing added to commit` | 忘了 `git add` | 先 add |
| `Aborting commit due to empty commit message` | 提交信息为空 | 写一句话 |
| `HEAD detached at xxx` | 游离 HEAD | 用 `git branch` 指向它或 `git switch -` 回去 |
| 切分支后文件消失 | 那个文件不属于当前分支 | 正常，切回去就有 |
| `HEAD~1` 报错 | 提交数不够 | 只有一次提交时没有父提交 |
| `error: Your local changes would be overwritten` | 有未提交改动 | 先提交或 `git stash` |
| `fatal: A branch named 'x' already exists` | 分支已存在 | 换个名字或 `git branch -D` 先删 |
| `git branch -d` 拒绝删除 | 分支未合并 | 确认不要了用 `-D` |
| 分支图看不懂 | 不熟 `--graph` | 多画几次，从下往上看 |
| `.git` 目录很大 | 历史里有过大文件 | 需要 `filter-repo` 清理（进阶） |
