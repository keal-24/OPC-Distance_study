# 第 26 节课：合并分支——把两条线合回一条

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你建了分支，在上面做完了功能。这节课把它合回 `main`。
> 合并听起来简单，但**三种合并方式的结果完全不同**，选错了会让历史变得很难看。

**建议用时**：110 分钟
**你需要先完成**：第 25 节课（`branch-lab` 里有 `feature-add-task` 分支）

---

# 第 0 步：合并到底是什么（10 分钟）

## 0.1 一句话

```text
合并 = 把一条分支上的改动，搬到另一条分支上
```

**方向很重要：**

```text
git switch main        ← 先站到"要接收改动"的分支
git merge feature      ← 然后说"把 feature 合进来"
```

**记住这个顺序：**

```text
先切到目标分支，再 merge 来源分支
```

**搞反了会怎样：**

```text
git switch feature
git merge main
```

**这不是"把 feature 合进 main"，而是"把 main 合进 feature"。**

**结果：main 上完全没有 feature 的东西。**

**这是新手最常见的合并错误。** 合并完发现 main 没变化，以为合并失败了。

## 0.2 合并前必须先想清楚一件事

```text
这两条分支，有没有改过同一个文件的同一部分？
```

**没有 → 自动合并，什么都不用管**
**有 → 会冲突，要人工决定留哪个**（第 27 节课）

## 0.3 三种合并方式

| 方式 | 命令 | 结果 |
|---|---|---|
| 快进 | `git merge 分支`（默认，能快进时） | 指针前移，无新提交 |
| 三方合并 | `git merge 分支`（有分叉时自动） | 生成一个合并提交 |
| 压缩合并 | `git merge --squash 分支` | 把所有改动压成一个新提交 |

**今天三种都做一遍，你会看到完全不同的历史形状。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `merge-lab/` | `03-练习代码` | 合并练手仓库 |

---

# 第 1 步：先造一个"能快进"的场景（20 分钟）

## 1.1 建练手仓库

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第04周-Git与回滚\第05节课\03-练习代码
   ```

2. 新建 `merge-lab`，进去，打开终端。
3. 初始化并做第一次提交：

   ```text
   git init
   git config user.name "你的名字"
   git config user.email "you@example.com"
   echo "# 合并练习" > README.md
   git add README.md
   git commit -m "初始化"
   ```

## 1.2 建分支，在分支上提交两次

```text
git switch -c feature/login
```

**新建 `login.js`：**

```javascript
function login(username, password) {
  if (!username || !password) {
    return { ok: false, error: "用户名和密码都要填" };
  }

  if (password.length < 8) {
    return { ok: false, error: "密码至少 8 位" };
  }

  return { ok: true, user: username };
}

module.exports = { login };
```

```text
git add login.js
git commit -m "添加 login 函数"
```

**改成（加一个校验）：**

```javascript
function login(username, password) {
  if (!username || !password) {
    return { ok: false, error: "用户名和密码都要填" };
  }

  if (password.length < 8) {
    return { ok: false, error: "密码至少 8 位" };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { ok: false, error: "用户名只能包含字母、数字、下划线" };
  }

  return { ok: true, user: username };
}

module.exports = { login };
```

```text
git add login.js
git commit -m "添加用户名字符校验"
```

## 1.3 现在的状态

```text
git log --oneline --graph --all
```

**输出：**

```text
* xxxxxxx 添加用户名字符校验
* xxxxxxx 添加 login 函数
* xxxxxxx 初始化
```

**一条直线。**

**因为 `main` 从建分支之后就没动过。**

**这就是"能快进"的条件：**

```text
目标分支（main）没有自己的新提交
```

## 1.4 合并（快进）

```text
git switch main
```

**关键一步：先站到 main。**

```text
git merge feature/login
```

**输出（实测）：**

```text
Updating f37cdc2..9ad3294
Fast-forward
 login.js | 1 +
 1 file changed, 1 insertion(+)
 create mode 100644 login.js
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Updating f37cdc2..9ad3294` | 从旧哈希更新到新哈希 |
| `Fast-forward` | **快进合并** |
| `login.js \| 1 +` | 改了 1 个文件，1 行新增 |
| `create mode 100644` | 新建文件 |

**注意 `Fast-forward` 这个词。**

**它意味着：没有产生新的提交。**

**验证：**

```text
git log --oneline --graph
```

**输出：**

```text
* xxxxxxx 添加用户名字符校验
* xxxxxxx 添加 login 函数
* xxxxxxx 初始化
```

**还是三个提交，没有"Merge branch..."。**

**但 `main` 已经指向最后一个了。**

**验证：**

```text
git branch -vv
```

**`main` 和 `feature/login` 指向同一个哈希。**

## 1.5 快进合并的本质

**画出来：**

**合并前：**

```text
main
 ↓
[A 初始化]
     ↑
     └── feature/login
         ↓
     [B 添加 login]
         ↓
     [C 添加校验]
```

**合并后（快进）：**

```text
main 和 feature/login 都指向 C
 ↓
[A] → [B] → [C]
```

**只做了一件事：把 `main` 的指针从 A 挪到 C。**

**没有新对象，没有新提交。**

**所以它"快"——真的什么都没做，只是改了指针。**

## 1.6 快进的代价

**问题：历史里看不出"这里有合并过一整个功能"。**

**历史是一条直线：**

```text
[A 初始化]
[B 添加 login]
[C 添加校验]
```

**如果这时你发现 `login.js` 有问题，想知道"这个文件是哪次引进来的"：**

**能看到是 B。但你看不出"B 和 C 是同一个功能分支上的"。**

**对于小功能，这不是问题。对于大功能（10 个提交），就会丢失信息。**

**这就是为什么有些团队要求用 `--no-ff`。**

## 1.7 清理实验分支

```text
git branch -d feature/login
```

**能成功，因为已经合并了。**

---

# 第 2 步：造一个"三方合并"的场景（25 分钟）

## 2.1 这次让 main 也动

**操作：**

1. 建新分支：

   ```text
   git switch -c feature/export
   ```

2. 在分支上做两次提交：

   **新建 `export.js`：**

   ```javascript
   function exportToText(items) {
     return items.map((item) => `${item.id}: ${item.title}`).join("\n");
   }

   module.exports = { exportToText };
   ```

   ```text
   git add export.js
   git commit -m "添加 exportToText 函数"
   ```

3. 再加一个函数：

   **把 `export.js` 改成：**

   ```javascript
   function exportToText(items) {
     return items.map((item) => `${item.id}: ${item.title}`).join("\n");
   }

   function exportToCsv(items) {
     const header = "id,title,done";
     const rows = items.map((item) => `${item.id},"${item.title}",${item.done}`);
     return [header, ...rows].join("\n");
   }

   module.exports = { exportToText, exportToCsv };
   ```

   ```text
   git add export.js
   git commit -m "添加 exportToCsv 函数"
   ```

4. **切回 main，也做一次提交：**

   ```text
   git switch main
   ```

   **改 `README.md`（加一行）：**

   ```text
   # 合并练习

   这个仓库用来练习 Git 合并。
   ```

   ```text
   git add README.md
   git commit -m "更新 README：补充项目说明"
   ```

## 2.2 现在有真正的分叉了

```text
git log --oneline --graph --all
```

**输出（实测形状）：**

```text
* xxxxxxx 更新 README：补充项目说明       ← main 在最新的位置
| * xxxxxxx 添加 exportToCsv 函数        ← feature/export 在最新的位置
| * xxxxxxx 添加 exportToText 函数
|/
* xxxxxxx 初始化                          ← 共同祖先
```

**怎么读这张图：**

```text
从下往上看（时间顺序）
最下面：两条线共同的起点
中间：|/ 表示"在这里分叉"
最上面：两个分叉各自的最新提交
```

**现在"快进"的条件不成立了：**

**因为 main 有自己的新提交（更新 README）。**

**如果快进，就会丢掉 main 的那个提交。**

**所以 Git 必须做"三方合并"。**

## 2.3 三方合并需要"三个东西"

**名字的由来：**

```text
① 共同祖先（base）        → 那个 `初始化` 提交
② 目标分支的最新（ours）   → main 的 `更新 README`
③ 来源分支的最新（theirs） → feature/export 的 `添加 exportToCsv`
```

**合并算法做的事：**

```text
比较 base→ours   得到了什么改动（README 的新增）
比较 base→theirs 得到了什么改动（export.js 的新增）
把两组改动都应用上去
```

**因为两组改动涉及的是不同文件，所以能自动合并。**

## 2.4 先看一眼会合什么

**在合并之前，先看差异：**

```text
git diff main feature/export --stat
```

**输出（实测）：**

```text
 export.js | 2 ++
 README.md | 1 -
 2 files changed, 1 insertion(+), 1 deletion(-)
```

**读法：**

```text
从 main 到 feature/export：
  export.js 会多 2 行（feature 有，main 没有）
  README.md 会少 1 行（main 有，feature 没有）
```

**为什么这很有用：**

```text
合并前你会看到"README 会少一行"——这是对的
因为从 main 的视角看，feature 分支没有 main 后来加的那行
合并时会保留两边，不会真的删掉
```

**`--stat` 的"删一行"容易吓人。** 想看清真相用：

```text
git diff main feature/export -- README.md
```

**能看到具体是哪个提交的差异。**

## 2.5 执行三方合并

```text
git switch main
git merge feature/export
```

**输出（实测）：**

```text
Merge made by the 'ort' strategy.
 export.js | 2 ++
 1 file changed, 2 insertions(+)
 create mode 100644 export.js
```

**注意第一行：`Merge made by the 'ort' strategy.`**

**这和快进的 `Fast-forward` 完全不同。**

**`Merge made` = "生成了一个合并提交"。**

**`ort` 是什么：** Git 的默认合并算法名。**不用记，知道是"自动合并"就行。**

## 2.6 看合并后的图

```text
git log --oneline --graph
```

**输出（实测形状）：**

```text
*   xxxxxxx Merge branch 'feature/export'
|\
| * xxxxxxx 添加 exportToCsv 函数
| * xxxxxxx 添加 exportToText 函数
* | xxxxxxx 更新 README：补充项目说明
|/
* xxxxxxx 初始化
```

**现在图上有分叉和汇合。**

**最上面那个 `Merge branch 'feature/export'` 就是合并提交。**

**看它的两个父提交：**

```text
git cat-file -p HEAD | findstr parent
```

**会输出两行：**

```text
parent xxxxxxx    ← 第一个父：main 上的提交
parent xxxxxxx    ← 第二个父：feature/export 上的提交
```

**这就是"合并提交"的定义：有两个父提交。**

## 2.7 验证文件都在

```text
dir
```

**应该看到：**

```text
README.md
login.js
export.js
```

**两边的改动都在。**

**验证 README 那行没丢：**

```text
type README.md
```

**应该看到"这个仓库用来练习 Git 合并。"这句话。**

**这就是三方合并的价值：两边的改动都保留了。**

---

# 第 3 步：`--no-ff` 强制产生合并提交（15 分钟）

## 3.1 什么时候需要它

**回到第 1 步那个场景：如果 feature/login 还没被合过。**

**现在重新造一个类似的，看 `--no-ff` 的效果。**

```text
git switch -c feature/delete
```

**新建 `delete.js`：**

```javascript
function deleteById(items, id) {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return false;
  items.splice(index, 1);
  return true;
}

module.exports = { deleteById };
```

```text
git add delete.js
git commit -m "添加 deleteById 函数"
```

**再提交一次：**

**改成（加校验）：**

```javascript
function deleteById(items, id) {
  if (!Array.isArray(items)) return false;

  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return false;

  items.splice(index, 1);
  return true;
}

module.exports = { deleteById };
```

```text
git add delete.js
git commit -m "添加数组类型校验"
```

## 3.2 先试默认合并

```text
git switch main
git merge feature/delete
```

**输出（实测）：**

```text
Updating xxxxxxx..xxxxxxx
Fast-forward
 delete.js | 10 ++++++++++
 1 file changed, 10 insertions(+)
 create mode 100644 delete.js
```

**又是快进。**

**看历史：**

```text
git log --oneline --graph -5
```

**输出：**

```text
* xxxxxxx 添加数组类型校验
* xxxxxxx 添加 deleteById 函数
*   xxxxxxx Merge branch 'feature/export'
|\
...
```

**看不出"这两次提交属于一个功能"。**

## 3.3 撤销，改用 `--no-ff`

**现在要撤销这次快进合并。**

```text
git reset --hard HEAD~2
```

**⚠️ 危险命令。** 这会强制把 main 回退两个提交。

**`--hard` 会丢掉工作区改动。** 现在工作区是干净的（都提交了），所以安全。

**验证回退了：**

```text
git log --oneline --graph -3
```

**应该看到 main 回到了合并 export 之后的状态，`delete.js` 不见了。**

**现在用 `--no-ff` 合并：**

```text
git merge --no-ff feature/delete
```

**`--no-ff` 是什么：** "no fast-forward"，即使能快进也**必须**生成合并提交。

**因为没给 `-m`，会弹出编辑器让你写合并信息。**

**如果弹出来的是 Vim（屏幕底部显示 `:` 或者 `~`）：**

1. 不用改内容；
2. 按 `Esc`；
3. 输入 `:wq`；
4. 按回车。

**如果你卡在里面出不来：** 按 `Esc`，然后输入 `:q!`，回车（放弃保存并退出）。

**避免弹编辑器的办法：**

```text
git merge --no-ff -m "合并 feature/delete：添加删除功能" feature/delete
```

**输出（实测）：**

```text
Merge made by the 'ort' strategy.
 delete.js | 10 ++++++++++
 1 file changed, 10 insertions(+)
 create mode 100644 delete.js
```

## 3.4 对比两种图

**默认（快进）：**

```text
* 添加数组类型校验
* 添加 deleteById 函数
* Merge branch 'feature/export'
```

**`--no-ff`：**

```text
*   Merge branch 'feature/delete'
|\
| * 添加数组类型校验
| * 添加 deleteById 函数
|/
* Merge branch 'feature/export'
```

**差别：**

```text
快进       → 看不出这是一个功能分支
--no-ff    → 一眼看出"这两次提交是一起合进来的"
```

## 3.5 该选哪个

**没有绝对对错，看团队规范。**

| 场景 | 建议 |
|---|---|
| 小修小补（改一个错字） | 快进就行 |
| 一个完整功能（多次提交） | `--no-ff` 保留边界 |
| 团队要求线性历史 | 快进 + rebase（第 4 周进阶） |
| 要求"每次合并都有记录" | `--no-ff` |

**GitHub 上点"Merge pull request"默认产生合并提交**（相当于 `--no-ff`）。

**为什么：**
因为要保留"这个 PR 什么时候合进来的"这个信息。**这是协作的核心需求。**

---

# 第 4 步：`--squash` 压缩合并（20 分钟）

## 4.1 它解决什么问题

**场景：你在功能分支上提交了 15 次。**

**这 15 次里有：**

```text
添加功能
修个 typo
调试用的 console.log
删掉 console.log
再改个错字
OAuth 尝试（后来放弃了）
正式实现
...
```

**合并进 main 后，这 15 条垃圾历史就永久留在主干上了。**

**`--squash` 的解法：**

```text
把 15 次提交的所有改动，压成 1 个提交
```

**结果：主线上只多一条：**

```text
实现导出功能
```

**干净。**

## 4.2 做实验

**建分支，提交三次：**

```text
git switch -c feature/report
```

**新建 `report.js`：**

```javascript
function report() {
  return "v1";
}

module.exports = { report };
```

```text
git add report.js
git commit -m "添加 report 基础函数"
```

**改成：**

```javascript
function report() {
  return "v2 - 加了格式";
}

module.exports = { report };
```

```text
git add report.js
git commit -m "改进 report 格式"
```

**改成：**

```javascript
function report() {
  return "v3 - 最终版";
}

module.exports = { report };
```

```text
git add report.js
git commit -m "修正 report 措辞"
```

**现在分支上有三次提交，但它们只改了同一个文件的一行。**

**这就是"试验性提交"的典型样子。**

## 4.3 用 squash 合并

```text
git switch main
git merge --squash feature/report
```

**输出（实测）：**

```text
Updating xxxxxxx..xxxxxxx
Fast-forward
Squash commit -- not updating HEAD
 report.js | 3 +++
 1 file changed, 3 insertions(+)
```

**关键一行：`Squash commit -- not updating HEAD`**

**这句话的意思是：**

```text
"我把改动放进了暂存区，但没有创建提交"
```

**所以 squash **不会**自动生成提交。**

**必须自己再 `commit` 一次。**

**验证：**

```text
git status
```

**输出：**

```text
On branch main
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
        new file:   report.js
```

**改动已经在暂存区了。**

## 4.4 自己提交

```text
git commit -m "实现 report 功能（压缩了 3 次试验提交）"
```

**现在看历史：**

```text
git log --oneline --graph
```

**输出（实测）：**

```text
* xxxxxxx 实现 report 功能（压缩了 3 次试验提交）
*   xxxxxxx Merge branch 'feature/delete'
|\
| * xxxxxxx 添加数组类型校验
| * xxxxxxx 添加 deleteById 函数
|/
*   xxxxxxx Merge branch 'feature/export'
```

**注意：主线上只有一条新提交，没有那三次试验提交。**

**但 `feature/report` 分支上还有那三次。**

**验证：**

```text
git log --oneline feature/report -3
```

**能看到三次提交还在。**

**这说明：**

```text
squash 没有删除任何东西
它只是"把改动复制过来，压成一个提交"
原分支完好无损
```

## 4.5 squash 的好处和代价

**好处：**

```text
① 主干历史干净（一条提交 = 一个功能）
② 那些"改错字""调试""放弃的方案"不会污染主干
③ 代码审查时更容易理解
```

**代价：**

```text
① 丢失了"开发过程"的信息
② 如果以后想 revert 其中某一次试验，找不到了
③ 原分支和 main 的提交没关联（Git 不知道它们是同一个功能）
```

**第三条的后果：**

```text
squash 之后，feature/report 分支上的提交和 main 上的提交是两个不同的对象
虽然改动一样，但哈希不同
所以 git branch --merged 不会认为它已合并
```

**试试看：**

```text
git branch --merged
```

**`feature/report` 可能不在里面。**

**这意味着 `git branch -d feature/report` 会被拒绝：**

```text
error: the branch 'feature/report' is not fully merged
```

**这就是 squash 的一个副作用。**

**解决办法：** 确认改动已经进 main 了，用 `-D` 强制删。

## 4.6 三种合并方式对比

| | 快进 | `--no-ff` | `--squash` |
|---|---|---|---|
| 产生新提交 | 否 | 是（合并提交） | 是（普通提交，需手动） |
| 保留分支内提交 | 是 | 是 | **否**（压成一条） |
| 历史形状 | 直线 | 分叉汇合 | 直线 |
| 能看出"这是功能" | 否 | 是 | 否（但提交信息可以写） |
| `-d` 能删分支 | 能 | 能 | **不能**（要 `-D`） |
| 适合 | 小改动 | 团队协作 | 试验性分支 |

**怎么选（本课程建议）：**

```text
一个人做小功能 → 快进
要保留"这是功能"的痕迹 → --no-ff
分支上有一堆试验性提交 → --squash
```

---

# 第 5 步：合并前的四个检查（15 分钟）

## 5.1 为什么合并前要检查

**合并是"把改动引入主干"的动作。**

**引入错了，会影响所有人。**

**所以合并前必须看清楚。**

## 5.2 四个检查

### 检查一：我在正确的分支上吗

```text
git branch
```

**确认 `*` 在**目标**分支上（通常是 main）。**

**这个检查能避免"合反方向"这个最常见的错误。**

### 检查二：工作区干净吗

```text
git status
```

**必须是：**

```text
nothing to commit, working tree clean
```

**为什么：**

```text
如果工作区有未提交的改动，合并可能会：
① 拒绝执行（比较安全）
② 把改动和合并结果混在一起（危险）
```

**如果有改动：先提交或 `git stash`。**

### 检查三：要合进来的是什么

```text
git diff main feature/xxx --stat
```

**看统计。**

**如果某个文件改动特别大，问一句"为什么"：**

```text
改了一个函数 → 正常，几行
改了整个文件（500 行）→ 可疑，是不是被格式化过？
```

**只看文件名：**

```text
git diff main feature/xxx --name-status
```

**输出：**

```text
M       README.md
A       export.js
D       old-file.js
```

**注意 `D`（删除）。**

**如果看到意外的删除，停下。**

### 检查四：这条分支上有几个提交

```text
git log --oneline main..feature/xxx
```

**`main..feature/xxx` 是什么：**
"在 feature/xxx 上，但不在 main 上的提交"。

**这个语法很重要，记住它。**

**输出：**

```text
xxxxxxx 添加用户名字符校验
xxxxxxx 添加 login 函数
```

**两条。说明这个分支做了两次提交。**

**反向：**

```text
git log --oneline feature/xxx..main
```

**"在 main 上，但不在 feature 上的"——也就是"这个分支落后了多少"。**

**为什么这个检查重要：**

```text
如果显示 50 条提交 → 你确定这是你要合的分支吗？
如果显示 0 条    → 已经合并过了，不用再合
```

## 5.3 一个合并前的完整流程

```text
① git switch main               站到目标分支
② git status                    确认干净
③ git fetch origin              拉取远程最新（有远程时）
④ git log --oneline main..feature/xxx    看会合进什么
⑤ git diff main feature/xxx --stat       看改了什么文件
⑥ git merge feature/xxx         执行合并
⑦ git log --oneline --graph -5  验证结果
⑧ 跑测试 / 打开页面看           验证功能
```

**第 ⑧ 步不能省。**

**合并成功 ≠ 代码能跑。**

**两个分支单独都正常，合起来可能出问题（比如函数签名改了但调用处没改）。**

---

# 第 6 步：故意犯五个错（20 分钟）

## 错误 1：合并方向搞反

**操作：**

1. 建一个分支 `feature/typo`，在上面提交一次；
2. **站在 feature 上**合并 main：

   ```text
   git switch feature/typo
   git merge main
   ```

**输出：**

```text
Already up to date.
```

**`Already up to date` 是什么：** "已经是最新的了"。

**为什么：**
因为 `feature/typo` 是从 `main` 建出来的，**包含了 main 的所有提交**。

**main 上没有"feature 没有的东西"，所以没什么可合的。**

**结果：main 上完全没有 `feature/typo` 的改动。**

**这就是"合反方向"的现象：输出 `Already up to date`，然后你以为合并成功了。**

**正确的做法：**

```text
git switch main
git merge feature/typo
```

**记法：**

```text
merge 的意思是"把别的合进我"
所以要先站到"我"（接收方）上
```

## 错误 2：工作区不干净就合并

**操作：**

1. 在 main 上改 `README.md`，不提交；
2. 合并一个有改动的分支。

**可能的结果：**

**情况 A（改动不冲突）：**

```text
Merge made by the 'ort' strategy.
```

**成功了，但你的未提交改动还混在工作区里。**

**现在 `git status` 会同时显示"你的改动"和"合并的结果"，很难分清。**

**情况 B（改动冲突）：**

```text
error: Your local changes to the following files would be overwritten by merge:
        README.md
Please commit your changes or stash them before you merge.
Aborting
```

**Git 拒绝了，这是好事。**

**规则：合并前 `git status` 必须是干净的。**

## 错误 3：`--squash` 之后忘了 commit

**操作：**

```text
git merge --squash 某个分支
git switch main
```

**（没有 commit 就切走了）**

**会发生什么：**

**改动还在暂存区，但没被提交。**

**切分支时 Git 可能会带着这些暂存内容走，导致混乱。**

**或者你之后忘了这事，那些改动就一直挂着。**

**记住 squash 的那个提示：**

```text
Squash commit -- not updating HEAD
```

**翻译：** "我放了改动，但没建提交"。

**看到这句就必须马上 `git commit`。**

## 错误 4：合并后不看结果

**操作：**

1. 正常合并；
2. 看到 `Merge made by the 'ort' strategy.`；
3. 直接 `git push`。

**问题在哪：**

**"自动合并成功"不代表"代码正确"。**

**最典型的场景：**

**分支 A 改了函数签名：**

```javascript
function login(username) { ... }     // 去掉 password 参数
```

**分支 B 新增了一个调用：**

```javascript
login("user", "pass");               // 还是传两个参数
```

**三方合并会"成功"（因为改的是不同文件的区域），但运行时 `login` 会忽略第二个参数。**

**代码能跑，逻辑错了。**

**这就是"合并冲突"和"语义冲突"的区别：**

```text
合并冲突  → Git 报错，必须人工处理
语义冲突  → Git 不报错，但代码逻辑错了
```

**语义冲突只能靠测试发现。**

**规则：合并后必须跑一遍测试、打开页面点一遍。**

## 错误 5：删不掉已 squash 的分支

**操作：**

```text
git branch -d feature/report
```

**输出：**

```text
error: the branch 'feature/report' is not fully merged
hint: If you are sure you want to delete it, run 'git branch -D feature/report'
```

**为什么它认为"没合并"：**

因为 squash 产生的是一个**全新的提交**（哈希不同），Git 不知道它和原分支的提交内容一样。

**怎么办：**

**先确认改动真的进 main 了：**

```text
git diff main feature/report --stat
```

**如果输出是空的**（说明内容完全相同），就可以安全强删：

```text
git branch -D feature/report
```

**如果没有输出之外的差异，别删。**

## 五个错误总结

```text
方向反了            → Already up to date，main 没变化
工作区不干净        → 拒绝合并，或改动混乱
squash 后忘 commit  → 改动挂着没提交
合并后不验证        → 语义冲突导致逻辑错
squash 分支删不掉   → 需要 -D，但先确认内容相同
```

---

# 第 7 步：写学习笔记（10 分钟）

```markdown
# 第 26 节课学习笔记

## 一、合并的方向

```text
git switch ____      ← 先站到
git merge ____       ← 再合并
```

为什么方向很重要：

方向搞反会看到什么输出：

## 二、三种合并方式

| | 快进 | --no-ff | --squash |
|---|---|---|---|
| 命令 | | | |
| 产生新提交吗 | | | |
| 保留分支内提交吗 | | | |
| 图的形状 | | | |
| 适合什么 | | | |

## 三、快进的条件

什么情况下才能快进：

快进时 `main` 的指针发生了什么：

## 四、三方合并的"三方"

1.
2.
3.

为什么叫"三方"：

## 五、合并提交的标志

怎么在 `git log` 里认出合并提交：

怎么在 `git cat-file -p HEAD` 里确认：

## 六、`--squash` 的特殊行为

它会不会自动 commit：

那句 `Squash commit -- not updating HEAD` 是什么意思：

squash 之后 `git branch -d` 为什么可能拒绝：

## 七、合并前的四个检查

1.
2.
3.
4.

## 八、`main..feature` 这个语法

```text
git log --oneline main..feature
```

意思是：

```text
git log --oneline feature..main
```

意思是：

## 九、合并冲突和语义冲突的区别

合并冲突：

语义冲突：

哪个 Git 会报错：

## 十、五个错误的后果

| 错误 | 现象 | 怎么解决 |
|---|---|---|
| 方向反了 | | |
| 工作区不干净 | | |
| squash 后忘 commit | | |
| 合并后不验证 | | |
| squash 分支删不掉 | | |

## 十一、我实际做的三次合并

快进合并的输出：

三方合并的输出：

squash 合并的输出：

## 十二、我还不懂的词

- 

## 十三、完成检查

- [ ] 我做过快进合并，看到 `Fast-forward`
- [ ] 我做过三方合并，看到 `Merge made by the 'ort' strategy`
- [ ] 我做过 `--no-ff` 合并
- [ ] 我做过 `--squash` 合并，并手动 commit 了
- [ ] 我能看懂 `git log --oneline --graph` 的分叉图
- [ ] 我知道合并要先站到目标分支
- [ ] 我知道合并后必须验证功能
- [ ] 我做过五个错误的实验
```

---

# 第 8 步：课后练习

## 练习一：把 chat-app 的"导出"功能做完整

**要求：**

1. 从课程仓库的 main 建分支 `feature/export-md`；
2. 在 `chat-app` 里加一个"导出为 Markdown"的接口；
3. 提交 2—3 次（包括一次"改错字"这种小提交）；
4. 用 `--squash` 合并回 main；
5. 观察历史里只有一条提交。

**记录：squash 合并前后 `git log --oneline -3` 的输出。**

## 练习二：制造一次"语义冲突"

**要求：**

1. 建分支 A，把某个函数的参数从两个改成一个；
2. 在 main 上新增一处"用两个参数调用"的代码；
3. 合并 A 到 main。

**你会发现：合并成功，没有冲突。**

**然后运行代码，看会发生什么。**

**思考：为什么 Git 发现不了这种问题？应该靠什么发现？**

## 练习三：对比三种合并的图

**要求：**

在一个练手仓库里做三次"同样的改动"，但用三种合并方式：

1. 快进
2. `--no-ff`
3. `--squash`

**然后画出三次的 `git log --oneline --graph`，把三张图并排放在笔记里。**

**回答：如果你要给别人讲"这个功能是什么时候做的"，哪种图最清楚？**

## 练习四：找出这段命令的四个问题

```text
git switch feature/xxx
git merge main
git push
```

**提示方向：** 方向反了、没检查工作区、没验证、没看会合进什么。

## 练习五：用自己的话讲

```text
为什么合并要先切到目标分支？
快进合并"快"在哪？
三方合并的"三方"指哪三个？
--squash 为什么不会自动提交？
为什么"合并成功"不等于"代码正确"？
```

---

# 第 9 步：最终验收

## A. 方向

- [ ] 我知道要先 `switch` 到目标分支再 `merge`
- [ ] 我知道方向搞反会输出 `Already up to date`
- [ ] 我做过"合反方向"的实验

## B. 三种合并

- [ ] 我做过快进，看到 `Fast-forward`
- [ ] 我做过三方合并，看到 `Merge made`
- [ ] 我做过 `--no-ff`
- [ ] 我做过 `--squash` 并手动提交
- [ ] 我能说出三种方式的区别

## C. 读图

- [ ] 我能看懂 `--graph` 的分叉
- [ ] 我知道合并提交有两个父提交
- [ ] 我能用 `git cat-file -p HEAD | findstr parent` 确认

## D. 检查

- [ ] 我知道合并前要 `git status` 干净
- [ ] 我会用 `main..feature` 看会合进什么
- [ ] 我会用 `git diff --stat` 看改了什么文件
- [ ] 我知道合并后必须跑测试

## E. 概念

- [ ] 我能区分"合并冲突"和"语义冲突"
- [ ] 我知道 squash 后 `-d` 可能拒绝删除
- [ ] 我知道 squash 不会自动 commit

## F. 实操

- [ ] `merge-lab` 里有完整的三种合并记录
- [ ] 我的分支图能看出分叉和汇合
- [ ] 我做过五个错误的实验

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 有三次合并的实际输出
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **合并只是把改动搬过来，能不能跑起来要自己验证——Git 不懂你的业务逻辑。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| 输出 `Already up to date` | 方向反了或已合并 | 确认站对了分支 |
| 合并后 main 没变化 | 在错误的分支上 merge | `git switch main` 再合 |
| `Your local changes would be overwritten` | 工作区不干净 | 提交或 `stash` |
| 弹出一个奇怪的编辑器 | 没给 `-m` | 按 `Esc` 输 `:wq` 回车 |
| squash 后没有提交 | 它本来就不自动提交 | 手动 `git commit` |
| `-d` 拒绝删除 | squash 或未合并 | 确认内容已进 main 后 `-D` |
| 合并后代码跑不起来 | 语义冲突 | 看报错、跑测试、核对改动的函数签名 |
| 合并冲突 | 两边改了同一处 | 第 27 节课专门讲 |
| 合并提交信息想改 | 不满意默认的 | 合并时给 `-m`，或用 `git commit --amend` |
| 想撤销一次合并 | 合错了 | `git reset --hard HEAD~1`（危险）或 `git revert -m 1 HEAD` |
| `--no-ff` 之后历史太乱 | 分支太多 | 定期 squash 整理，或用 rebase |
| 合并了大量无关提交 | 分支太旧 | 先 `git merge main` 到分支上同步，再合回来 |
