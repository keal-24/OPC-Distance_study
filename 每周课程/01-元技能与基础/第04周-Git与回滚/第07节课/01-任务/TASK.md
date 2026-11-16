# 第 28 节课：恢复错误修改

**建议用时**：175 分钟

## 本节课要解决的问题

上节课你学会了"冲突时怎么处理"。但真实工作里更常见的是另一种情况：

> **代码已经提交了，甚至已经推到远程了，才发现改错了。**

或者是：

> **改了一半，发现有更好的写法，想把改动扔掉重来。**

或者最惊险的：

> **一不小心 `reset --hard` 了，以为代码全没了。**

**这节课要解决的就是这一类问题：已经发生的事，怎么退回去。**

**这节课你会学到：**

- `restore`、`reset`、`revert`、`checkout` 四个命令到底各管什么（这是最容易搞混的四个）；
- `reset` 的三种模式（`--soft`、`--mixed`、`--hard`），以及它们分别动了哪三个地方；
- `revert` 和 `reset` 的本质区别：**一个改历史，一个加历史**；
- `reflog` —— 你的"后悔药"，能救回"看起来已经删掉"的提交；
- `stash` —— 改一半要切走时的正确做法；
- `clean` —— 清掉未跟踪的垃圾文件；
- **什么时候能救，什么时候救不回来**。

**这节课不学：** `rebase`（第 4 阶段）、`bisect`（找哪个提交引入 bug，第 4 阶段）、图形化工具的历史操作。

**需要多久：** 100 分钟。这节课比上节课危险，**所有操作都在独立的练手仓库里做**。

---

## 第 0 步：先建立一个"随便搞"的仓库（10 分钟）

**为什么要单独的仓库：**

这一节要反复做这些操作：

```text
reset --hard      会永久丢掉未提交的改动
force push        会覆盖远程历史
clean -f          会直接删除文件，不进回收站
```

**在课程仓库里做，你的作业真的会消失。**

### 0.1 新建仓库

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第04周-Git与回滚\第07节课\03-练习代码
   ```

2. 空白处右键 → 新建 → 文件夹，名字：

   ```text
   rescue-lab
   ```

3. 双击进去，点地址栏，输入 `cmd`，按 `Enter`。
4. 依次执行：

```text
git init
```

```text
git config user.name "你的名字"
```

```text
git config user.email "你的邮箱"
```

**应该看到：** `Initialized empty Git repository in ...`

### 0.2 造三个版本的提交

**操作：** 在 `rescue-lab` 里新建 `f.txt`（右键 → 新建 → 文本文档 → 改名 `f.txt` → 扩展名提示点"是"），用 VS Code 打开，敲：

```text
v1
```

保存。然后终端依次执行：

```text
git add .
```

```text
git commit -m "第一次提交：创建 f.txt"
```

**改文件：** 把内容改成

```text
v2
```

保存。提交：

```text
git commit -am "第二次提交：改成 v2"
```

**再改：** 内容改成

```text
v3
```

保存。提交：

```text
git commit -am "第三次提交：改成 v3"
```

### 0.3 确认现在有什么

**操作：**

```text
git log --oneline
```

**应该看到（你的哈希会不同）：**

```text
ac59391 第三次提交：改成 v3
382880b 第二次提交：改成 v2
916f25f 第一次提交：创建 f.txt
```

**这就是你的"时间线"。** 接下来所有操作都在这条线上来回动。

**记下这三个哈希。** 你可以写在纸上，或者开一个记事本。**这一节会反复用到它们。**

**第 0 步做完了。**

---

## 第 1 步：先把四个命令摆清楚（15 分钟）

**这一步不操作，只讲清概念。** 因为如果概念不清，后面每个命令你都会用错。

### 1.1 一张表看懂四个命令

**这是整节课最重要的一张表。建议抄到笔记最上面。**

| 命令 | 改工作区文件？ | 改暂存区？ | 改提交历史？ | 用途 |
|---|---|---|---|---|
| `git restore 文件` | 改（覆盖） | 不动 | 不动 | 丢掉某个文件的未暂存改动 |
| `git restore --staged 文件` | 不动 | 改（撤销暂存） | 不动 | 把文件从暂存区拿回来 |
| `git reset` | 看模式 | 看模式 | 改（移动指针） | 撤销提交（**重写历史**） |
| `git revert` | 改（反向应用） | 不动 | 改（**加一个**新提交） | 撤销某个提交（**不改历史**） |
| `git checkout 文件` | 改 | 不动 | 不动 | 老命令，等于 `restore` |

**三个"地方"是什么：**

```text
工作区（working tree）   ← 你在 VS Code 里看到的文件内容
暂存区（index/staging）  ← git add 之后放的地方
提交历史（HEAD/commits） ← git commit 之后存的地方
```

**一次完整的提交流程：**

```text
改文件（工作区变了）
  ↓ git add
进暂存区（暂存区变了，工作区没变）
  ↓ git commit
进历史（历史多一条，暂存区清空，工作区没变）
```

**记住这个顺序：工作区 → 暂存区 → 历史。**

**四个命令就是在这个链条上往回退：**

```text
restore            → 用暂存区的内容覆盖工作区
restore --staged   → 用历史的内容覆盖暂存区（工作区不动）
reset              → 移动历史指针，顺带可选地改暂存区和工作区
revert             → 在历史末尾加一条"反向"提交
```

### 1.2 最容易搞混的一对：`restore` 和 `reset`

**一句话区别：**

> **`restore` 管文件，`reset` 管提交。**

- 你只想扔掉一个文件的改动，还没提交 → 用 `restore`；
- 你想撤销一个已经提交的记录 → 用 `reset` 或 `revert`。

**很多人一急就用 `reset --hard`，其实只需要 `restore` 一个文件。** 结果把别的文件改动也弄丢了。

### 1.3 最容易搞混的另一对：`reset` 和 `revert`

**一句话区别：**

> **`reset` 是把历史"擦掉重写"，`revert` 是在历史"末尾加一笔撤销"。**

**图解：**

`reset` 之后（撤销第三次提交 C）：

```text
修改前：  A ← B ← C
reset 后：A ← B          （C 从历史里消失了）
```

`revert` 之后（撤销第三次提交 C）：

```text
修改前：  A ← B ← C
revert 后：A ← B ← C ← C'   （C' 的内容等于把 C 反向应用）
```

**什么时候用哪个：**

| 情况 | 用哪个 | 为什么 |
|---|---|---|
| 只在本地，没 push | `reset` | 干净，历史看不出痕迹 |
| 已经 push 了，别人可能拉了 | `revert` | 不改历史，不影响别人 |
| 提交是合并提交 | `revert -m 1` | `reset` 也能做，但 `revert` 更安全 |

**一条铁律：**

```text
已经 push 的提交，永远用 revert，不用 reset。
```

**理由：** `reset` 会让你本地的历史和远程的历史不一致。你再 push 会被拒绝，`--force` 又会破坏别人的仓库。**这是 Git 里最经典的"连锁事故"。**

### 1.4 `checkout` 是哪来的

`git checkout` 是**老命令**，它身兼两职：

- `git checkout 文件` → 现在推荐用 `git restore 文件`；
- `git checkout 分支` → 现在推荐用 `git switch 分支`。

**为什么 Git 要拆开：** 因为一个命令干两件完全不同的事，太容易误操作。

**真实事故：** 有人想"切到某个分支"，打成了 `git checkout f.txt`，结果**把 `f.txt` 的所有未提交改动都丢了**。因为 Git 以为他是要"恢复文件"。

**所以：**

```text
以后只记 restore 和 switch，checkout 认识就行，不用主动用。
```

**但看老文章、老教程时你会看到 `checkout`，要知道它在干什么。**

**第 1 步做完了。概念清楚了再往下。**

---

## 第 2 步：`restore` —— 只丢一个文件的改动（15 分钟）

**这是最安全、最常用的"后悔"。**

### 2.1 场景：改坏了，想恢复成上次提交的样子

**操作：**

1. 打开 `f.txt`，改成：

   ```text
   我改坏了
   ```

2. 保存。
3. 终端确认状态：

```text
git status --short
```

**应该看到：**

```text
 M f.txt
```

**注意这个 `M` 的位置：它在第二列，前面有个空格。**

**列的含义：**

```text
 M f.txt
↑↑
│└─ 第二列：工作区状态
└── 第一列：暂存区状态
```

| 显示 | 意思 |
|---|---|
| `M ` | 已暂存（`git add` 过了） |
| ` M` | 改了但没 `git add` |
| `MM` | `add` 之后又改了 |

**这个"M 在前面还是后面"的细节非常重要** —— 它告诉你改动在哪个阶段。**后面 `reset` 的三种模式全靠它判断。**

4. 现在丢掉这个改动：

```text
git restore f.txt
```

**应该看到：** **没有任何输出**（成功不说话）。

5. 打开文件看：

```text
cat f.txt
```

**输出：**

```text
v3
```

**改动没了，回到上一次提交的样子。**

### 2.2 这个操作能不能撤销

**不能。**

`git restore f.txt` 是**用暂存区的内容覆盖工作区**。你的"我改坏了"这四个字，被直接覆盖掉了，**没有任何记录，`reflog` 也救不回来**。

**为什么 `reflog` 救不回来：** 因为 `reflog` 只记录**提交指针的移动**，不记录工作区文件内容。

**这是 `restore` 和 `reset --hard` 的共同点：未提交的改动，删了就没了。**

### 2.3 `git restore .` 和 `git restore 文件名`

**操作：**

1. 造两个改动：

```text
echo "改A" > f.txt
```

```text
echo "另一个文件" > g.txt
```

（`echo "内容" > 文件名` 是"把内容写进这个文件"，会覆盖原内容。）

2. 看状态：

```text
git status --short
```

**应该看到：**

```text
 M f.txt
?? g.txt
```

**`??` 是什么意思：** "未跟踪" —— Git 从来没见过这个文件，它不在版本控制里。

3. 现在执行：

```text
git restore .
```

**应该看到：** 什么都没变。`g.txt` 还在，`f.txt` 恢复成 `v3`。

**为什么 `g.txt` 没被删：** **`restore` 只管"已跟踪的文件"。** `g.txt` 是 `??` 状态，Git 不认它。

**要清掉 `??` 的文件，得用 `git clean`**（第 6 步讲）。

**`.` 这个点是"当前目录下所有文件"的意思。** 危险在于它会一次恢复所有文件。**如果只想改一个，就写文件名。**

### 2.4 `restore --staged` —— 撤销 `git add`

**场景：** 你 `git add` 了三个文件，然后发现其中一个不该提交。

**操作：**

1. 改文件：

```text
echo "改B" > f.txt
```

2. 加进暂存区：

```text
git add f.txt
```

3. 看状态：

```text
git status --short
```

**应该看到：**

```text
M  f.txt
```

**`M` 跑到第一列了** —— 说明改动已经在暂存区。

4. 撤销暂存：

```text
git restore --staged f.txt
```

**应该看到：**

```text
 M f.txt
```

**`M` 又回到第二列了。**

**关键：文件内容没变！**

```text
cat f.txt
```

**输出：**

```text
改B
```

**这个操作只把"已暂存"变成"未暂存"，你的改动一点没丢。**

**这是四个命令里最安全的一个。** 它做的事就是"把东西从暂存区拿出来，放回工作区"。

### 2.5 `restore --source` —— 从历史版本取内容

**这个功能很多人不知道，但非常好用。**

**场景：** 你昨天改了 `f.txt`，改得不好，想把 `f.txt` 恢复成三天前的样子，**但不想撤销那些提交**。

**操作：**

```text
git restore --source=916f25f f.txt
```

**`916f25f` 换成你自己"第一次提交"的哈希。**

**然后看内容：**

```text
cat f.txt
```

**输出：**

```text
v1
```

**f.txt 变成了第一次提交时的内容。**

**但历史没变：**

```text
git log --oneline
```

**还是三条提交。**

**这个操作做了什么：** 从指定的历史提交里取出那个文件的内容，写进工作区。**它只改工作区，不改历史。**

**注意：`restore --source` 之后文件是"已修改"状态（` M`），要提交才会进历史。**

**实用的场景：**

- 某个配置文件被改乱了，想回到某个已知能跑的版本 → `git restore --source=<哈希> 配置文件`
- 想看看老版本的代码 → 用 `git show <哈希>:文件`（第 24 节课讲过，那个只显示不写入）

**两者的区别：**

| 命令 | 效果 |
|---|---|
| `git show 哈希:文件` | 只在终端**打印**出来，不改任何文件 |
| `git restore --source=哈希 文件` | **写进工作区**，覆盖当前内容 |

**第 2 步做完了。**

---

## 第 3 步：`reset` 的三种模式（25 分钟）

**这是最容易出事的一步。慢慢做，逐个验证。**

### 3.1 `reset` 到底在重置什么

`git reset` 做三件事，**按顺序**：

```text
第 1 件：移动 HEAD 指针（历史位置）        ← 三种模式都做
第 2 件：更新暂存区                        ← --soft 不做，其他都做
第 3 件：更新工作区                        ← 只有 --hard 做
```

**三种模式的区别就是"做到第几件停"。**

| 模式 | 移动 HEAD | 改暂存区 | 改工作区 | 你的改动 |
|---|---|---|---|---|
| `--soft` | 做 | 不做 | 不做 | **全保留，而且在暂存区** |
| `--mixed`（默认） | 做 | 做 | 不做 | **全保留，但在工作区** |
| `--hard` | 做 | 做 | 做 | **全丢** |

**这张表要背下来。** 记不住的话，记住一句话：

```text
soft 只动历史，mixed 动历史和暂存，hard 全动（连文件都改）。
```

### 3.2 先回到三个提交的状态

**操作：**

```text
git stash -u
```

（先把刚才的乱改动收起来，第 5 步会讲 `stash`。现在只要知道它是"临时收起来"。）

```text
git log --oneline
```

**确认能看到三条提交。** 如果只有两条，用：

```text
git reset --hard ac59391
```

（换成你记下的"第三次提交"的哈希。）

### 3.3 `--soft`：只退历史，改动全留着

**操作：**

```text
git reset --soft HEAD~1
```

**`HEAD~1` 是什么：** "HEAD 往前一个提交"。

| 写法 | 意思 |
|---|---|
| `HEAD` | 当前提交 |
| `HEAD~1` | 前一个提交 |
| `HEAD~2` | 前两个提交 |
| `HEAD~3` | 前三个提交 |

**`~` 就是"往前数"的意思。**

**应该看到：** **没有任何输出**（成功不说话）。

**现在验证三件事：**

**① 历史变了吗：**

```text
git log --oneline
```

**输出：**

```text
382880b 第二次提交：改成 v2
916f25f 第一次提交：创建 f.txt
```

**只有两条了。** "第三次提交"从历史里消失了。

**② 文件变了吗：**

```text
cat f.txt
```

**输出：**

```text
v3
```

**还是 `v3`！没变！**

**③ 暂存区呢：**

```text
git status --short
```

**输出：**

```text
M  f.txt
```

**`M` 在第一列 —— 改动还在暂存区里。**

**这三件事合起来说明：`--soft` 把"第三次提交"变回了"已暂存的改动"。**

**这个模式的用途：提交信息写错了，或者提交里混进了不该提交的文件，想重新组织这次提交。**

```text
git reset --soft HEAD~1               ← 退回暂存状态
git restore --staged 不该提交的文件    ← 把它拿出来
git commit -m "正确的提交信息"          ← 重新提交
```

**这是 `--soft` 最经典的用法。**

### 3.4 `--mixed`（默认）：退历史，改动放回工作区

**先恢复状态：**

```text
git commit -am "重新提交v3"
```

**现在又回到三个提交。然后执行：**

```text
git reset HEAD~1
```

**注意：这里没写 `--soft`、`--mixed`、`--hard`。不写模式就是 `--mixed`，这是默认值。**

**这一点很重要：`git reset HEAD~1` 和 `git reset --mixed HEAD~1` 完全一样。**

**应该看到：**

```text
Unstaged changes after reset:
M	f.txt
```

**这次有输出了！** 因为 `--mixed` 改了暂存区，Git 要告诉你"哪些文件变成未暂存了"。

**验证三件事：**

**① 历史：**

```text
git log --oneline
```

两条。（"重新提交v3"没了）

**② 文件：**

```text
cat f.txt
```

**还是 `v3`。**

**③ 暂存区：**

```text
git status --short
```

**输出：**

```text
 M f.txt
```

**这次 `M` 在第二列！**

**对比一下：**

| 模式 | `git status --short` |
|---|---|
| `--soft` | `M  f.txt`（第一列） |
| `--mixed` | ` M f.txt`（第二列） |

**这就是判断"我在哪个阶段"的方法。**

**`--mixed` 的用途：** 提交内容对，但你想重新选择哪些文件进这次提交。

**它比 `--soft` 更常用**，因为大多数人退回是想"重新 `git add` 一遍"。

### 3.5 `--hard`：退历史，改动全丢

**这一步开始危险了。**

**先恢复：**

```text
git checkout -- .
```

（`checkout -- .` 是老写法，等于 `restore .`。这里用它是因为要演示老命令。）

```text
git reset --hard HEAD
```

（`reset --hard HEAD` 就是"回到当前提交"，用来清掉工作区的脏东西。）

**确认现在是三条提交、内容是 v3：**

```text
git log --oneline
```

```text
cat f.txt
```

**然后执行：**

```text
git reset --hard HEAD~1
```

**应该看到：**

```text
HEAD is now at 916f25f 第一次提交：创建 f.txt
```

**注意这句 `HEAD is now at`** —— 它是 `--hard` 特有的输出。`--soft` 和 `--mixed` 不会有这句。

**验证三件事：**

**① 历史：**

```text
git log --oneline
```

**只剩一条！** 第二次和第三次提交都没了。

**② 文件：**

```text
cat f.txt
```

**输出：**

```text
v1
```

**文件内容被改了！** 变成了第一次提交时的 `v1`。

**③ 暂存区：**

```text
git status --short
```

**什么都没有。** 干净的。

**这才是 `--hard` 的完整效果：历史、暂存区、工作区，全部回到那个提交的样子。**

### 3.6 为什么 `--hard` 这么危险

**危险点一：它删的是"文件内容"，不是"记录"。**

刚才 `v2` 和 `v3` 的内容，在你的工作区里**已经不存在了**。文件里就是 `v1`。

**危险点二：如果当时工作区有未提交的改动，也一起没了。**

假设你 `reset --hard` 之前正在改一个新功能，改了一半没提交。**`--hard` 会把这个"改了一半"直接覆盖掉。**

**危险点三：它看起来"很正常"。**

没有报错，没有警告，就一句 `HEAD is now at ...`。你以为只是"退回一下"，实际上文件已经变了。

**危险点四：初学者最常误用它。**

想"取消暂存"，结果打了 `git reset --hard`。想"看看旧版本"，结果打了 `git reset --hard HEAD~5`。

**所以：**

```text
git reset --hard 之前，永远先 git status。
工作区不干净，先 stash 或者 commit。
```

### 3.7 `reset --hard` 之后能不能救

**能，但要靠 `reflog`（第 4 步）。**

**先记住这个结论：提交本身没被"删除"，只是"没有指针指向它了"。** Git 的提交是不可变对象，它还在 `.git/objects` 里，等着被垃圾回收。

**Git 的垃圾回收什么时候跑：** 默认在 `git gc` 时，而 `gc` 会保留 `reflog` 里的记录（默认 90 天）。**所以 90 天内基本都能救。**

**这就是 `reflog` 的价值。**

**第 3 步做完了。三种模式你都亲眼见过了。**

---

## 第 4 步：`reflog` —— 后悔药（15 分钟）

**这一步是整节课最"救命"的内容。**

### 4.1 现在你的仓库是"坏的"

刚才 `reset --hard HEAD~1` 之后，你只有一条提交，文件是 `v1`。

**你要把 `v3` 找回来。**

### 4.2 看 reflog

**操作：**

```text
git reflog
```

**应该看到类似（你的哈希和我的不同）：**

```text
916f25f HEAD@{0}: reset: moving to HEAD~1
382880b HEAD@{1}: reset: moving to HEAD~1
adc78fd HEAD@{2}: commit: 重新提交v3
382880b HEAD@{3}: reset: moving to HEAD~1
ac59391 HEAD@{4}: commit: 第三次提交：改成 v3
382880b HEAD@{5}: commit: 第二次提交：改成 v2
916f25f HEAD@{6}: commit (initial): 第一次提交：创建 f.txt
```

**这就是你的完整操作历史。** 每一次 HEAD 的移动都记着。

**逐列读：**

| 部分 | 意思 |
|---|---|
| `ac59391` | 那次操作之后 HEAD 指向哪个提交 |
| `HEAD@{4}` | 第 4 次操作（数字越大越早） |
| `commit:` | 操作类型 |
| `第三次提交：改成 v3` | 操作说明 |

**`HEAD@{0}` 是最近一次，`HEAD@{1}` 是上一次，往上越来越早。**

### 4.3 reflog 记录了哪些操作

**`reflog` 记的是"HEAD 移动"。所以下面这些都记：**

| 操作 | reflog 里的样子 |
|---|---|
| `git commit` | `commit: 提交信息` |
| `git reset` | `reset: moving to XXX` |
| `git checkout 分支` | `checkout: moving from A to B` |
| `git merge` | `merge 分支: Merge made by...` |
| `git rebase` | `rebase (start): checkout XXX` |
| `git clone` | `clone: from URL` |
| `git pull` | `pull: Fast-forward` |

**不记的：**

- `git add`
- `git restore`
- 改文件
- `git status`

**为什么：** 因为这些**不移动 HEAD**。`reflog` 只关心"HEAD 去哪了"。

**这就是为什么 `restore` 丢掉的改动救不回来** —— 它不产生 HEAD 移动，reflog 里没记录。

### 4.4 把 v3 找回来

**操作：** 在 reflog 里找到那行：

```text
ac59391 HEAD@{4}: commit: 第三次提交：改成 v3
```

**`ac59391` 就是要恢复的哈希。**

**执行：**

```text
git reset --hard ac59391
```

**应该看到：**

```text
HEAD is now at ac59391 第三次提交：改成 v3
```

**验证：**

```text
cat f.txt
```

**输出：**

```text
v3
```

```text
git log --oneline
```

**三条提交都回来了。**

**救回来了。**

### 4.5 另一种救法：`git branch` 建个分支留住

**`reset --hard` 是"把 main 挪过去"。** 还有一种更安全的做法：

```text
git branch rescue ac59391
```

**这句的意思是：建一个叫 `rescue` 的分支，指向 `ac59391` 那个提交。**

**好处：不动 main，不丢任何东西。**

**适合的场景：** 你想"看看那个旧版本是什么样"，但不确定要不要把 main 挪过去。

```text
git branch rescue ac59391     ← 建个分支留着
git switch rescue             ← 切过去看
git switch main               ← 看完了切回来，main 一点没变
```

**这个技巧在"我不确定该不该回退"时特别有用。** 先建分支保险，再决定。

### 4.6 `reflog` 的局限

**局限一：只在本地。**

`reflog` 不是仓库的一部分，它存在 `.git/logs/` 里，**不会 push 到远程**。

**所以：如果你 `clone` 一个新仓库，那边的 reflog 是空的。** 别人的误操作，你救不了。

**局限二：有期限。**

默认 90 天（`gc.reflogExpire`）。超了会被清理。

**局限三：救不了未提交的改动。**

因为 reflog 只记 HEAD 移动。

**局限四：救不了 `git clean -f` 删掉的文件。**

因为那些文件从来没进过 Git。

**所以完整的"能救 / 不能救"表：**

| 情况 | 能救吗 | 用什么 |
|---|---|---|
| `reset --hard` 丢了提交 | 能 | `reflog` + `reset --hard` |
| `reset --hard` 丢了未提交改动 | **不能** | 救不回来 |
| 删了分支 | 能 | `reflog` 或记得哈希 |
| `commit` 后想撤销 | 能 | `reset` 或 `revert` |
| `restore` 丢了文件改动 | **不能** | 救不回来 |
| `clean -f` 删了未跟踪文件 | **不能** | 救不回来（除非有备份） |
| 提交信息写错 | 能 | `commit --amend` |
| 已经 push 的错误 | 能 | `revert` |

**这张表要记住。它会决定你敢不敢按那个命令。**

**第 4 步做完了。**

---

## 第 5 步：`stash` —— 改一半要切走（15 分钟）

**这是最实用的小技巧，但很多人不会。**

### 5.1 场景

**你正在改一个功能，改了一半。突然要紧急修一个线上 bug，需要切到另一个分支。**

**问题：** 直接 `git switch` 会怎样？

**先试试看：**

**操作：** 改 `f.txt`：

```text
echo "改了一半的功能" > f.txt
```

**不要提交。** 然后：

```text
git switch -c hotfix
```

**应该看到：** 切换成功了。

**然后看文件：**

```text
cat f.txt
```

**输出：**

```text
改了一半的功能
```

**改动跟着你过来了！**

### 5.2 为什么改动会跟着走

**因为 Git 切换分支时，如果改动和两个分支都不冲突，它就直接带过去。**

**这看起来很方便，但很危险：**

- 你在 `hotfix` 分支上改的东西，本来是给 `main` 改的；
- 如果你在 `hotfix` 上提交了，**这些改动就进错分支了**；
- 回到 `main` 一看，改的东西不见了，你会以为丢了。

**正确做法有两个：先提交，或者先 stash。**

**什么时候用哪个：**

| 情况 | 做法 |
|---|---|
| 改动已经是一个完整的小步 | 先 `commit` |
| 改了一半，还不成型 | 先 `stash` |

### 5.3 `stash` 的用法

**先回到干净状态：**

```text
git switch main
```

```text
git restore .
```

**然后造一个改一半的状态：**

```text
echo "半成品" > f.txt
```

**执行：**

```text
git stash
```

**应该看到：**

```text
Saved working directory and index state WIP on main: 296717d v1
```

**`WIP` 是什么：** Work In Progress，进行中的工作。Git 自动给你起的名。

**验证：**

```text
cat f.txt
```

**输出：**

```text
v1
```

**改动没了，文件回到提交时的样子。**

**但改动没丢，它在 stash 里：**

```text
git stash list
```

**输出：**

```text
stash@{0}: WIP on main: 296717d v1
```

**`stash@{0}` 就是"第 0 个 stash"。**

### 5.4 取回来

**操作：**

```text
git stash pop
```

**应该看到：**

```text
On branch main
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
```

**然后：**

```text
cat f.txt
```

**输出：**

```text
半成品
```

**改动回来了。而且 `stash list` 空了：**

```text
git stash list
```

**没有输出** —— 因为 `pop` 是"取出来并删掉"。

### 5.5 `pop` 和 `apply` 的区别

| 命令 | 取回改动 | 删掉 stash 记录 |
|---|---|---|
| `git stash pop` | 是 | 是 |
| `git stash apply` | 是 | 否 |

**什么时候用 `apply`：** 你想把同一份改动应用到多个分支上。

```text
git stash apply      ← 取回来，stash 还在
git switch 另一个分支
git stash apply      ← 再应用一次
```

**注意：同一个 stash 应用两次，会冲突。** 第二次应用时那些改动已经在工作区了。

### 5.6 一个重要的坑：未跟踪文件不会进 stash

**操作：**

**先清空：**

```text
git restore .
```

**新建一个文件（不要 `git add`）：**

```text
echo "新文件" > new.txt
```

**然后：**

```text
git stash
```

**应该看到：**

```text
Saved working directory and index state WIP on main: 296717d v1
```

**看起来保存了。但看文件列表：**

```text
dir
```

**输出里还有 `new.txt`！**

**为什么：** `git stash` 默认**不处理未跟踪文件**（`??` 状态）。它只 stash"已跟踪文件的修改"。

**正确做法：加 `-u`**

```text
git stash -u
```

**`-u` 是 `--include-untracked` 的缩写。**

**应该看到：** 这次 `new.txt` 也没了。

**这个坑非常常见。** 很多人 `stash` 完发现"怎么还有个文件没存进去"，就是这个原因。

### 5.7 其他 stash 命令

| 命令 | 作用 |
|---|---|
| `git stash list` | 看所有 stash |
| `git stash show` | 看最新一个 stash 改了哪些文件 |
| `git stash show -p` | 看最新一个 stash 的具体内容 |
| `git stash drop` | 删掉最新一个 stash（不取回） |
| `git stash clear` | 删掉所有 stash |
| `git stash pop stash@{1}` | 取回指定的那个 |

**`git stash clear` 是危险的** —— 清空后没有任何记录，`reflog` 也救不了。**用之前先 `list` 看一眼。**

**第 5 步做完了。**

---

## 第 6 步：`clean` —— 清掉垃圾文件（10 分钟）

**`restore` 清不掉 `??` 的文件。要清它们，用 `clean`。**

### 6.1 先看会删什么

**操作：**

```text
git clean -n
```

**`-n` 是 `--dry-run`（试运行）。它只告诉你"会删什么"，不真删。**

**应该看到：**

```text
Would remove junk.txt
Would remove new.txt
```

**`Would remove` = "将会删除"。**

**这一步必须做。** **`clean -f` 删掉的文件不进回收站，直接消失。**

### 6.2 真的删

**操作：**

```text
git clean -f
```

**应该看到：**

```text
Removing junk.txt
Removing new.txt
```

**验证：**

```text
dir
```

**只剩 `f.txt`。**

### 6.3 `clean` 的参数

| 参数 | 作用 | 危险度 |
|---|---|---|
| `-n` | 只显示会删什么 | 无 |
| `-f` | 真的删文件 | 高（不进回收站） |
| `-d` | 连空目录也删 | 更高 |
| `-x` | **连 `.gitignore` 里的也删** | **极高** |
| `-i` | 交互式，一个个问你 | 低 |

**`-x` 为什么极高危：** 因为它会删掉 `.gitignore` 里的东西 —— **也就是 `node_modules`、`.env` 这些。**

```text
git clean -xfd
```

**这一条在别人的项目里跑一次，可能删掉他几小时的依赖安装，还有他的密钥文件。**

**这是个在网上被警告过无数次的命令。**

**什么时候真的需要 `-x`：** 只有当你想"完全重置到刚 clone 下来的状态"时。**其他任何时候都不要用。**

### 6.4 安全替代：`clean -i`

**操作：**

```text
git clean -i
```

**它会显示一个菜单，让你一个个决定删哪些。**

**应该看到类似：**

```text
Would remove the following items:
  junk.txt
*** Commands ***
    1: clean                2: filter by pattern
    3: select by numbers    4: ask each
    5: quit                 6: help
What now>
```

**这个模式安全得多，因为它让你逐个确认。**

**新手建议：只用 `-n` 和 `-i`，不要直接用 `-f`。**

**第 6 步做完了。**

---

## 第 7 步：`revert` —— 已经 push 了怎么撤（20 分钟）

**这一步解决"最麻烦的情况"。**

### 7.1 先理解 push 之后为什么不能 `reset`

因为真实测试需要"远程仓库"，我们用本地文件夹模拟。

**操作一：建一个"远程"仓库**

```text
cd ..
mkdir remote-demo
cd remote-demo
git init --bare
```

**`--bare` 是什么：** 创建一个"没有工作区"的仓库，专门用来当远程仓库。

**应该看到：** `Initialized empty Git repository in ...`

**操作二：克隆一份来工作**

```text
cd ..
git clone remote-demo work
cd work
git config user.name "你的名字"
git config user.email "你的邮箱"
```

**操作三：提交并推送**

```text
echo v1 > f.txt
```

```text
git add .
```

```text
git commit -m "v1"
```

```text
git push -u origin master
```

**注意：** 如果你的 Git 默认分支是 `main`，这里就是 `git push -u origin main`。

**怎么知道是哪个：**

```text
git branch --show-current
```

**输出 `main` 就用 main，输出 `master` 就用 master。**

**操作四：再提交一次并推送**

```text
echo v2 > f.txt
```

```text
git commit -am "v2"
```

```text
git push
```

**现在远程有两个提交。**

### 7.2 试着用 `reset` 撤销

**操作：**

```text
git reset --hard HEAD~1
```

**本地回到 `v1`。然后推送：**

```text
git push
```

**应该看到：**

```text
To C:/Users/.../remote-demo
 ! [rejected]        main -> main (non-fast-forward)
error: failed to push some refs to 'C:/Users/.../remote-demo'
hint: Updates were rejected because the tip of your current branch is behind
hint: its remote counterpart. If you want to integrate the remote changes,
hint: use 'git pull' before pushing again.
```

**逐句读：**

| 行 | 意思 |
|---|---|
| `! [rejected]` | 被拒绝了 |
| `(non-fast-forward)` | 不是快进（你本地比远程"旧"） |
| `the tip of your current branch is behind` | 你当前分支的顶端**落后于**远程 |
| `use 'git pull' before pushing again` | 建议你先 pull |

**为什么被拒：** 远程已经有 `v2` 这个提交了。你想把远程变成"没有 v2"，**这在 Git 看来是"丢掉别人的提交"**，所以它拒绝。

### 7.3 为什么不能直接 `--force`

**技术上可以：**

```text
git push --force
```

**应该看到：**

```text
 + b391e74...698f079 main -> main (forced update)
```

**`+` 开头 + `(forced update)` = 强制覆盖成功。**

**但后果是什么：**

**如果别人已经拉过 `v2`，他的仓库里还有那个提交。** 他再 push，Git 会拒绝他（和刚才一样）。他如果也 `--force`，你的 `v1` 又被覆盖回去。

**这就是"谁最后 force 谁赢"。** 结果是两个人的历史彻底分叉，代码可能互相丢。

**更糟的情况：** 别人基于 `v2` 写的新代码，在 `v2` 从历史里消失之后，变成了"孤儿提交"。**合并的时候会出一堆莫名其妙的冲突。**

**所以：**

```text
推送过的分支，永远不用 push --force。
```

**有例外吗：** 有。**你自己的分支、绝对没别人用、你确认过。** 但这是很危险的操作，需要明确的团队约定。

### 7.4 正确做法：`revert`

**先把本地和远程同步回来：**

```text
git fetch
```

```text
git reset --hard origin/main
```

（如果分支叫 master，就用 `origin/master`）

**现在本地又回到 `v2`。**

**执行：**

```text
git revert --no-edit HEAD
```

**应该看到：**

```text
[main 4e6a18b] Revert "v2"
 Date: Mon Nov 16 12:20:50 2026 +0800
 1 file changed, 1 insertion(+), 1 deletion(-)
```

**看历史：**

```text
git log --oneline
```

**输出：**

```text
4e6a18b Revert "v2"
ac59391 v2
382880b v1
```

**`v2` 还在历史里！** 只是多了一条 `Revert "v2"`。

**看文件：**

```text
cat f.txt
```

**输出：**

```text
v1
```

**内容退回了。**

**这就是 `revert` 的本质：它不改历史，而是"加一笔反向的操作"。**

**现在可以正常 push 了：**

```text
git push
```

**成功了，没有拒绝。**

**为什么：** 因为这是"快进" —— 你只是在历史上加了一个提交，没有删除任何东西。

### 7.5 `revert` 一个合并提交：必须加 `-m`

**这是 `revert` 唯一会卡住你的地方。**

**先造一个合并提交：**

```text
git switch -c feat
```

```text
echo "功能" > feat.txt
```

```text
git add .
```

```text
git commit -m "feat 添加"
```

```text
git switch main
```

```text
git merge feat -m "合并 feat"
```

**现在 `HEAD` 是合并提交。直接 revert 试试：**

```text
git revert --no-edit HEAD
```

**应该看到：**

```text
error: commit 667070bafb30b0ad5a64c6f9ea3e1b40a2c2d07b is a merge but no -m option was given.
fatal: revert failed
```

**逐句读：**

| 部分 | 意思 |
|---|---|
| `is a merge but no -m option was given` | **它是一个合并提交，但没给 `-m` 参数** |
| `fatal: revert failed` | 致命错误，revert 失败 |

**为什么需要 `-m`：**

合并提交有**两个父提交**。逆操作时，Git 需要知道"以哪个父为主线"。

```text
合并提交 M
├─ parent 1 → main（我合并前所在的分支）
└─ parent 2 → feat（被合并进来的分支）
```

**`-m 1` 的意思：** 以第 1 个父（main）为主线，**撤销第 2 个父（feat）带来的所有改动**。

**`-m 2` 的意思：** 反过来。

**99% 的情况用 `-m 1`。** 因为你是站在 main 上合并别人的东西，要撤的就是"别人的东西"。

**正确操作：**

```text
git revert --no-edit -m 1 HEAD
```

**应该看到：**

```text
[main 5694dca] Revert "合并 feat"
 Date: Mon Nov 16 12:21:11 2026 +0800
 1 file changed, 1 deletion(-)
 delete mode 100644 feat.txt
```

**注意最后一行：`delete mode 100644 feat.txt`**

**`feat.txt` 被删掉了。** 因为撤销"合并 feat"的效果，就是"把 feat 带来的文件都去掉"。

**验证：**

```text
dir
```

**`feat.txt` 没了。**

### 7.6 一个非常隐蔽的坑：revert 合并后再想合并同一个分支

**这是个"看起来无解"的情况。**

**现在你想：** "哎呀，我不该撤销那个合并，再合一次。"

**操作：**

```text
git merge feat
```

**应该看到：**

```text
Already up to date.
```

**`Already up to date` = "已经是最新的了"。但它明明什么东西都没合进来！**

**为什么：** 因为在 Git 看来，`feat` 分支的提交**已经在历史里了**（虽然在历史里的是"合并"和"撤销合并"两个操作）。你已经"合过"了，所以它认为不需要再合。

**这就是 Git 最反直觉的地方之一。**

**怎么解决：**

**方法一（推荐）：撤销那个 revert**

```text
git revert --no-edit HEAD
```

**这句会"撤销撤销操作"** —— 也就是把 `feat` 的内容再加回来。

**验证：**

```text
dir
```

**`feat.txt` 回来了。**

**方法二：`reset` 回到合并之前（只在没 push 时可用）**

```text
git reset --hard HEAD~2
```

```text
git merge feat
```

**方法三：改一下 `feat` 分支再合（不推荐，会产生新提交）**

**记住这个坑：**

```text
revert 一个合并之后，想再合回来，要 revert 那个 revert。
不能直接 merge。
```

**第 7 步做完了。**

---

## 第 8 步：`commit --amend` —— 只改提交信息（10 分钟）

**这不是"恢复"，是"修正"。但很容易和 `reset --soft` 混。**

### 8.1 提交信息写错了

**操作：**

```text
git commit --allow-empty -m "错误的提交信息"
```

**`--allow-empty` 是什么：** 允许"没有改动也提交"。正常情况 Git 会拒绝空提交。这里用它来造一个测试提交。

**然后修正：**

```text
git commit --amend -m "修正后的提交信息"
```

**验证：**

```text
git log --oneline
```

**应该看到：** 最新一条变成了"修正后的提交信息"，**而且哈希变了。**

**为什么哈希变了：** 因为提交哈希是根据"内容 + 提交信息 + 时间 + 父提交"算出来的。**改了任何一个，哈希就变。**

**所以 `--amend` 不是"修改原提交"，是"用一个新的提交替换掉原提交"。** 原提交变成了孤儿（`reflog` 里还能找到）。

### 8.2 `--amend` 的三个用法

| 用法 | 作用 |
|---|---|
| `git commit --amend -m "新信息"` | 只改提交信息 |
| `git commit --amend --no-edit` | 把新加的改动合并进上一个提交，信息不变 |
| `git commit --amend --author="名字 <邮箱>"` | 改作者 |

**第二个最实用：**

```text
哎呀，忘了加一个文件进上一个提交。
```

**做法：**

```text
git add 忘了的文件
```

```text
git commit --amend --no-edit
```

**这个文件就进上一个提交了，提交信息不变。**

### 8.3 `--amend` 的危险

**如果那个提交已经 push 了，`--amend` 会让本地和远程历史不一致。**

**后果和 `reset` 一样：** push 被拒，`--force` 会破坏别人的仓库。

**所以：**

```text
已经 push 的提交，不要 --amend。
```

**第 8 步做完了。**

---

## 第 9 步：完整决策树（15 分钟）

**这一步把前面所有内容压成一张"遇到问题该用哪个命令"的图。**

### 9.1 决策树

```text
你遇到问题了
│
├─ 还没提交，只是改了文件
│   ├─ 想丢掉这个文件的改动 → git restore 文件
│   ├─ 想丢掉所有文件的改动 → git restore .
│   ├─ 已经 git add 了想撤回 → git restore --staged 文件
│   ├─ 想临时收起来 → git stash -u
│   └─ 想清掉未跟踪的垃圾 → git clean -n 然后 git clean -f
│
├─ 已经提交了，还没 push
│   ├─ 只改提交信息 → git commit --amend -m "新信息"
│   ├─ 想重新组织这次提交 → git reset --soft HEAD~1
│   ├─ 想整个撤销这次提交（改动留着）→ git reset HEAD~1
│   ├─ 想整个撤销这次提交（改动也丢）→ git reset --hard HEAD~1
│   └─ 已经 reset 掉了想找回 → git reflog 然后 git reset --hard <哈希>
│
└─ 已经 push 了
    ├─ 想撤销某个提交 → git revert HEAD
    ├─ 合并提交 → git revert -m 1 HEAD
    ├─ revert 了合并想再合 → git revert HEAD（再撤销一次）
    └─ 绝对不要 → git reset 然后 git push --force
```

**把这张图抄到笔记上。** 遇到问题就照着找。

### 9.2 一次完整的"事故复盘"演练

**场景：** 你已经把错误的代码 push 了，现在要撤回。

**完整流程：**

```text
第 1 步：git log --oneline        看要撤哪个提交，记下哈希
第 2 步：git status               确认工作区干净（不干净先 stash）
第 3 步：git revert <哈希>        生成反向提交
第 4 步：验证代码能跑               node / 浏览器 / 测试
第 5 步：git push                 正常推送
第 6 步：通知团队                   "我撤了一个提交，原因是什么"
```

**第 6 步很重要。** 别人可能正在基于那个错误提交工作，你不通知他，他会一脸问号。

**这就是"工程"和"写代码"的区别：** 写代码只管自己，工程要管协作。

---

## 第 10 步：五个必须自己撞的错（15 分钟）

### 错误 1：`reset --hard` 之前没看 `git status`

**操作：**

1. 改一个文件，不提交；
2. 直接 `git reset --hard HEAD`；
3. 看文件。

**你会看到：改动没了，而且 `reflog` 也救不回来。**

**为什么救不回来：** 那些改动从来没进过 Git（没 commit），`reflog` 只记 HEAD 移动。

**教训：** 执行前必看 `git status`。不干净就先 `stash`。

**这个错误我建议你**真的做一次**，感受一下那种"我改的东西全没了"的心情。比看十遍警告有用。**

### 错误 2：以为 `restore --staged` 会丢改动

**操作：**

1. 改文件；
2. `git add`；
3. `git restore --staged 文件`；
4. 看文件内容。

**你会看到：改动还在！**

**教训：** `--staged` 只撤销暂存，不动文件。**这是四个命令里最安全的一个。**

### 错误 3：`stash` 之后以为未跟踪文件也存了

**操作：**

1. 新建一个文件（不 `add`）；
2. `git stash`；
3. `dir`。

**你会看到：那个文件还在。**

**教训：** 必须 `git stash -u`。

### 错误 4：`revert` 合并提交不加 `-m`

**操作：**

1. 造一个合并提交；
2. `git revert HEAD`。

**你会看到：**

```text
error: commit XXX is a merge but no -m option was given.
fatal: revert failed
```

**教训：** 合并提交必须 `-m 1`。

### 错误 5：`revert` 之后直接 `merge` 想合回来

**操作：**

1. `revert -m 1` 撤销一个合并；
2. `git merge 那个分支`。

**你会看到：**

```text
Already up to date.
```

**然后 `dir` 一看，什么都没合进来。**

**教训：** 要 `revert` 那个 `revert`。

---

## 第 11 步：写笔记（10 分钟）

**操作：** 打开：

```text
B:\OPC-Distance_study\每周课程\01-元技能与基础\第04周-Git与回滚\第07节课\02-笔记\NOTES.md
```

**重点填这四栏：**

1. **四个命令的对比表** —— 这是基础；
2. **`reset` 三模式** —— 这是最常搞混的；
3. **决策树** —— 这是实用工具；
4. **能救 / 不能救表** —— 这决定你敢不敢按命令。

**填的时候不要看课件。** 想不起来的再回去翻。

---

## 第 12 步：课后练习

### 练习 1：五个真实场景

**不看课件，写出该用什么命令：**

1. 你改了三个文件，只想去掉其中一个的改动；
2. 你 `git add` 了 `node_modules`，想撤回；
3. 你提交了但信息写错，还没 push；
4. 你 push 的代码有 bug，需要撤销；
5. 你 `reset --hard` 之后发现退错了。

**每题要写：命令 + 一句理由。**

### 练习 2：救回一个"已经消失"的分支

**目标：** 造一个"删了分支、忘了哈希"的情况，用 `reflog` 救回来。

**步骤：**

1. 建分支 `lost`，提交两次；
2. `git branch -D lost`（强制删）；
3. **不要看之前的哈希**；
4. 只用 `git reflog` 把它找回来。

**记录：** 你在 reflog 里看到了什么？用了几步？

### 练习 3：写一份"事故处理卡"

**目标：** 写一张 A4 大小的卡片，贴在你电脑旁边。

**必须包含：**

- 四个命令的一句话区别；
- `reset` 三模式的表；
- 决策树（可以简化为 5 行）；
- "push 过的只用 revert"这一条铁律。

**为什么练这个：** 真出事的时候你会慌，没时间翻笔记。**卡片能救你。**

### 练习 4：模拟一次线上事故

**目标：** 完整走一遍"错误代码已上线，需要撤回"的流程。

**步骤：**

1. 建远程仓库（`git init --bare`）；
2. 克隆、提交一个"有 bug 的版本"、push；
3. `revert` 那个提交；
4. 验证代码恢复；
5. push；
6. **写一份 100 字的"事故通知"**，假设你要发给团队。

**最后一步最重要。** 真实工作中，技术动作只是一半，另一半是沟通。

### 练习 5：解释给自己听

**目标：** 用 200 字，向一个完全不懂 Git 的人解释：

> 为什么 `git reset` 和 `git revert` 都能撤销，但一个安全一个危险？

**为什么要练：** 如果你讲不清，说明你只是记住了命令，没理解原理。**而原理才是能在新情况下做判断的东西。**

---

## 第 13 步：验收清单

### 理解层

- [ ] 我能说出工作区、暂存区、历史三者的关系
- [ ] 我能背出 `restore` / `reset` / `revert` / `checkout` 各管什么
- [ ] 我知道 `restore` 管文件，`reset` 管提交
- [ ] 我知道 `reset` 改历史，`revert` 加历史
- [ ] 我理解 `reset` 三模式分别动了哪几个地方
- [ ] 我知道 `reflog` 只记 HEAD 移动，不记文件内容

### 操作层

- [ ] 我用过 `git restore 文件` 丢掉单个文件的改动
- [ ] 我用过 `git restore --staged` 撤销暂存，并确认文件没变
- [ ] 我用过 `git restore --source=<哈希> 文件`
- [ ] 我用过 `reset --soft`，并确认改动还在暂存区
- [ ] 我用过 `reset --mixed`（默认），并确认改动在工作区
- [ ] 我用过 `reset --hard`，并确认文件内容被改了
- [ ] 我用 `git reflog` 救回过被 `reset --hard` 掉的提交
- [ ] 我用 `git branch 名字 哈希` 留住了旧版本
- [ ] 我用过 `git stash` 和 `git stash pop`
- [ ] 我用过 `git stash -u`
- [ ] 我用过 `git clean -n` 和 `git clean -f`
- [ ] 我用过 `git revert`（普通提交）
- [ ] 我用过 `git revert -m 1`（合并提交）
- [ ] 我用过 `git commit --amend`

### 排错层

- [ ] 我知道 `non-fast-forward` 是什么，以及为什么会出现
- [ ] 我知道 `! [rejected]` 之后不能直接 `--force`
- [ ] 我知道 `is a merge but no -m option was given` 怎么修
- [ ] 我知道 `revert` 合并后 `merge` 会说 `Already up to date`
- [ ] 我知道 `stash` 默认不含未跟踪文件
- [ ] 我知道 `clean -f` 删的文件不进回收站

### 认知层

- [ ] 我能说出"什么能救、什么救不回来"
- [ ] 我知道为什么 push 过的不能用 `reset`
- [ ] 我知道 `--force` 会怎么破坏别人的仓库
- [ ] 我能背出四句话总结

### 笔记

- [ ] `NOTES.md` 填完
- [ ] 我画出了决策树
- [ ] 我做了"事故处理卡"（练习 3）

---

## 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `reset --hard` 后代码全没了 | 它同时改了工作区 | `git reflog` 找回提交；未提交的改动救不回来 |
| `restore` 后改动没了想找回 | `restore` 直接覆盖，无记录 | 救不回来 |
| `git push` 报 `non-fast-forward` | 本地比远程旧 | `git pull` 或 `git fetch` + `reset --hard origin/分支` |
| `git push` 报 `! [rejected]` | 同上 | 不要 `--force`，先同步 |
| `revert` 报 `no -m option` | 撤的是合并提交 | `git revert -m 1 <哈希>` |
| `revert` 后 `merge` 说 `Already up to date` | 那个分支已在历史里 | `revert` 那个 `revert` |
| `stash` 后文件还在 | 那是未跟踪文件 | `git stash -u` |
| `stash pop` 冲突了 | 同一处改动被两边改了 | 按第 27 节课的冲突处理流程做 |
| `clean -f` 删了想恢复 | 不进回收站 | 救不回来，只能用备份 |
| `amend` 后 push 被拒 | 历史变了 | 已经 push 的不该 `amend` |
| `reset` 之后 `git log` 看不到旧提交 | 正常的，指针移了 | `git reflog` |
| 想把某个文件恢复到三天前 | — | `git log -- 文件` 找哈希，再 `git restore --source=哈希 文件` |

---

## 本节课要能说出口的四句话

```text
一、restore 管文件，reset 管提交，revert 管已推送，reflog 管救命。

二、reset 三模式：soft 留暂存，mixed 留工作区，hard 全丢。

三、push 过的，只用 revert，永不用 reset + force。

四、reset --hard 之前，永远先 git status。
```

---

## 附：下一步

**第 4 周到这里结束。你现在会：**

- 建仓库、提交、看历史（第 22—24 节课）
- 分支、合并、处理冲突（第 25—27 节课）
- 恢复错误修改（第 28 节课）

**这四件事合起来，就是"敢改代码"的底气。** 因为你知道改错了能退回去。

**下一周（第 5 周）会回到数据：SQL 和数据库。**

第 19 节课你说过"JSON 文件当数据库有四条局限"，那一周会解决其中三条：

- 并发丢数据 → 数据库有事务和锁；
- 查询慢 → 数据库有索引；
- 数据结构改了要手改代码 → 数据库有 schema。

**第四条（备份和恢复）会在第 6 阶段（上线运维）讲。**

**在进入下一周之前，请确认：**

- [ ] 你的 `chat-app` 已经提交进 Git（第 23 节课的作业）
- [ ] 你知道怎么回到任何一个历史版本
- [ ] 你敢在真实项目里用 `reset --hard` 了（因为你会 `reflog`）
