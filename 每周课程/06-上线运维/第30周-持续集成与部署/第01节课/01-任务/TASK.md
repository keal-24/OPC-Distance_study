# 第 204 节课：认识自动化——push 之后机器替你干活

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 29 周你把 `chat-app` 装进了镜像，但每次上线还是自己 SSH 上去敲命令。
> 这节课开始，你把"敲命令"这件事交给一台不属于你的机器。**它在你睡觉的时候也能干活。**

**建议用时**：110 分钟
**你需要先完成**：第 203 节课（`docker compose up -d` 能起全栈）、第 28 节课（会 `git push`、能看懂 `git log`）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

到上一周为止，你的上线流程是这样的：

```bash
git add .
git commit -m "改好了"
git push
```

然后打开终端，SSH 登服务器：

```bash
ssh root@47.98.xx.xx
cd /srv/app
git pull
docker compose build
docker compose up -d
```

**五条命令，一条都不能少，一条都不能错。**

## 0.2 你以后会遇到什么

```text
① 你在外面用手机热点，想改一句文案就上线 —— 没有终端，五条命令敲不了
② 半夜改了个 bug，push 完忘了登服务器 pull —— 客户看到的是旧版本
③ 你 push 的代码有语法错误，本地没测 —— 服务器上容器起不来，网站 502
④ 两个人（你 + 一个兼职）同时改，谁都不知道对方有没有跑过测试
⑤ 半年后你想知道"上周三上线的是哪个版本" —— 没人记得
```

**这五个场景，手动流程全都解决不了。**

不是因为手动"慢"，是因为**手动意味着"只有你在场的时候才会发生"**。

## 0.3 今天要建立的三个概念

```text
① CI（持续集成）：每次 push，机器自动把你的代码拉下来跑一遍检查
② workflow（工作流）：描述"机器要按什么顺序做什么"的那个 yml 文件
③ runner（运行器）：真正执行这些命令的那台机器，不是你的电脑
```

**这三个词你今天必须能用自己的话讲出来。** 讲不出来，后面六节课你只能抄。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `ci-lab/` | `03-练习代码` | 你自己新建的练手仓库（不是课程仓库） |
| `.github/workflows/hello.yml` | `ci-lab/` 里 | 你今天写的第一个工作流 |
| 一个绿勾 | GitHub 的 Actions 页面 | 唯一的验收标准 |

**注意最后一行。** 今天不看"你写了多少"，只看"那个勾是不是绿的"。

---

# 第 1 步：建一个专门练 CI 的仓库（15 分钟）

## 1.1 为什么不能直接在 `chat-app` 里练

**因为接下来你会往仓库里塞一堆东西：**

```text
.github/workflows/*.yml     工作流文件
package-lock.json           锁文件（第 3 节要用）
Dockerfile                  第 4 节要用
一堆故意写错的代码           第 2 节要故意让它变红
```

**而且你会把密钥配到仓库设置里。**

**在 `chat-app` 里练的后果：**

```text
① 你的正式项目多了一堆学习用的 yml，每次 push 都会跑，白烧额度
② 密钥配在正式仓库上，万一泄露，损失是真金白银
③ 第 2 节要故意提交语法错误的代码，你不想让它们在正式仓库的历史里
```

**规则：这一周所有 CI 实验都在 `ci-lab` 里做。**

**这条规则以后一直有效。** 学任何"会影响远端"的东西，先建一个空仓库。

## 1.2 在 GitHub 上建仓库

**操作：**

1. 浏览器打开 `https://github.com`，登录你的账号；
2. 右上角 `+` → `New repository`；
3. 按下表填：

| 字段 | 填什么 | 为什么 |
|---|---|---|
| `Repository name` | `ci-lab` | 名字随便，但别用中文 |
| `Description` | `学习 CI/CD 的练手仓库` | 可留空 |
| `Public / Private` | **选 `Private`** | 学习阶段别公开，避免密钥事故 |
| `Add a README file` | **勾上** | 有 README 才能立刻 clone 出东西 |
| `Add .gitignore` | 选 `Node` | 以后要放 Node 项目 |
| `Choose a license` | 不选 | 练手仓库不需要 |

4. 点 `Create repository`。

**应该看到：**

```text
ci-lab
Private

main  ← 1 branch
```

**`Private` 这三个字必须出现在标题下方。** 如果不是，说明你选了公开，回去 `Settings` → 最下面 `Change repository visibility` 改成 Private。

## 1.3 三个常见状态词

刚建的仓库，你会看到这些词。**先认一遍，别猜：**

| 词 | 意思 |
|---|---|
| `main` | 默认分支的名字（老仓库可能叫 `master`） |
| `0 Commits` / `1 Commit` | 提交次数，勾了 README 就是 1 |
| `Private` | 只有你和被邀请的人能看到 |

**为什么默认分支名很关键：**

```text
你后面写的 on: push: branches: [main]
如果仓库默认分支叫 master，这句就永远不触发。
```

**确认你的默认分支叫什么：**

看仓库首页上方那个下拉框，写着 `main` 还是 `master`。

**记下来，后面每一处都要对得上。**

## 1.4 把它 clone 到本地练手目录

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\06-上线运维\第30周-持续集成与部署\第01节课\03-练习代码
   ```

2. 在这个目录里，地址栏输入 `cmd` 回车（或右键 `Git Bash Here`）；
3. 点仓库页面绿色的 `Code` 按钮，复制 HTTPS 地址；
4. 敲：

```bash
git clone https://github.com/你的用户名/ci-lab.git
cd ci-lab
```

**应该看到：**

```text
Cloning into 'ci-lab'...
remote: Enumerating objects: 5, done.
remote: Counting objects: 100% (5/5), done.
remote: Compressing objects: 100% (4/4), done.
remote: Total 5 (delta 0), reused 0 (delta 0), pack-reused 0
Receiving objects: 100% (5/5), done.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Cloning into 'ci-lab'...` | 正在把远端仓库复制到本地这个文件夹 |
| `remote: Enumerating objects` | 服务器在数"要发给你多少个对象" |
| `Receiving objects: 100%` | 收完了 |
| `delta 0` | 这次没有用到增量压缩（文件太少） |

**验证你在对的地方：**

```bash
pwd
ls -a
```

**应该看到：**

```text
/b/OPC-Distance_study/每周课程/06-上线运维/第30周-持续集成与部署/第01节课/03-练习代码/ci-lab
.  ..  .git  .gitignore  README.md
```

**`.git` 和 `.gitignore` 都在，说明 clone 成功。**

**⚠️ 注意：** 你现在所在的 `ci-lab` 是一个**独立的 Git 仓库**，它嵌套在课程仓库里。这没问题，但 `git status` 只能看到 `ci-lab` 自己的状态，看不到课程仓库的。

**这就是为什么第 1.1 步要单独建它 —— 两边的历史互不干扰。**

---

# 第 2 步：四个词，四张图（20 分钟）

**GitHub Actions 的文档一上来就用这四个词，而且从不解释。**

**结果就是：你抄了一个 yml，能用，但改一个字母就崩，因为你不知道那个字母属于哪一层。**

**这一节把这四个词钉死。**

## 2.1 workflow（工作流）：一个 yml 文件

**大白话：一份"机器的作业单"。**

**一个 workflow = 一个 `.yml` 文件。**

```text
.github/workflows/hello.yml
                        └──── 这一个文件，就是一个 workflow
```

**文件里的第一行通常给它起个名字：**

```yaml
name: hello
```

**这个名字会显示在 GitHub 的 Actions 页面左侧列表里。**

**图：**

```text
┌─────────────────────────────────────────┐
│  .github/workflows/hello.yml            │  ← 一个文件
│                                         │
│  name: hello                            │  ← 它在页面上的名字
│  on: push                               │  ← 什么时候干
│  jobs: ...                              │  ← 干什么
└─────────────────────────────────────────┘
```

**关键理解：一个仓库可以有多个 workflow 文件，它们互相独立。**

```text
.github/workflows/
├── hello.yml        push 时打印一句话
├── lint.yml         push 时检查代码规范
└── deploy.yml       push 到 main 时部署
```

**push 一次，三个文件可能同时被触发，各跑各的。**

## 2.2 job（任务）：workflow 里的一"块"

**大白话：作业单上的一件"大事"。**

**一个 workflow 里可以有多个 job。**

```yaml
jobs:
  build:
    ...
  deploy:
    ...
```

**这里 `build` 和 `deploy` 是两个 job。**

**图：**

```text
┌──────────────────────────────────────────────┐
│  workflow: hello.yml                         │
│                                              │
│  ┌────────────────┐    ┌────────────────┐    │
│  │ job: build     │    │ job: deploy    │    │
│  │                │    │                │    │
│  │ 一台干净的机器  │    │ 另一台干净的机器│    │
│  └────────────────┘    └────────────────┘    │
└──────────────────────────────────────────────┘
```

**最关键的一点：**

```text
默认情况下，两个 job 跑在两台完全不同的机器上。
第一台机器上装的东西，第二台看不到。
```

**这是新手最容易踩的坑：** 在 `build` 里 `npm install`，然后在 `deploy` 里直接 `npm test` —— 会报"找不到模块"。

**因为那是另一台机器，什么都没装。**

**想让 job 之间有顺序，要写 `needs`（第 7 节讲）。**

## 2.3 step（步骤）：job 里的一"步"

**大白话：一件大事里的一个小动作。**

**一个 job 里可以有多个 step，它们按顺序执行。**

```yaml
    steps:
      - name: 打印一句话
        run: echo "hello"
      - name: 看看目录
        run: ls -la
```

**图：**

```text
┌─────────────────────────────────────────────┐
│  job: build（一台机器）                      │
│                                             │
│  step 1  ──→  step 2  ──→  step 3           │
│  echo        ls           npm ci            │
│                                             │
│  同一个目录，同一个环境，一步一步往下走        │
└─────────────────────────────────────────────┘
```

**和 job 相反：同一个 job 里的 step 共享一切。**

```text
step 1 里 cd 到某个目录 → step 2 还在那个目录
step 1 里 npm install   → step 2 能直接用 node_modules
step 1 里 export 的变量 → 默认不带过去（要用 $GITHUB_ENV）
```

**第三条是个例外，第 6 节会讲。**

**step 有两种写法：**

| 写法 | 长什么样 | 用在哪 |
|---|---|---|
| `run:` | 直接写 shell 命令 | 自己敲的命令 |
| `uses:` | 引用别人写好的 action | 下载代码、装 Node、登录镜像仓库 |

```yaml
      - run: echo "我自己敲的命令"

      - uses: actions/checkout@v4
```

**`uses` 后面那一串是什么？**

```text
actions/checkout@v4
└──────┬──────┘ └┬┘
   GitHub 官方账号  版本号
   名叫 checkout
```

**意思是"去 GitHub 上找 `actions` 这个账号的 `checkout` 仓库，用 v4 这个版本"。**

**这个仓库里的代码会在你的 runner 上跑。** 所以第 7 节会讲：**它要从 GitHub 下载，国内会慢。**

## 2.4 runner（运行器）：真正干活的那台机器

**大白话：一台租来的、干净的、用完就扔的电脑。**

**你写 `runs-on: ubuntu-latest`，意思是"给我一台最新版 Ubuntu 的机器"。**

**图：**

```text
你的电脑（Windows 11）          GitHub 的机房
┌──────────────────┐          ┌──────────────────┐
│ 写 yml            │          │ runner           │
│ git push ─────────┼─────────→│ ubuntu-latest    │
│                  │          │                  │
│ 关机了也不影响     │          │ 跑完就销毁         │
└──────────────────┘          └──────────────────┘
```

**四个必须知道的特性：**

| 特性 | 意思 | 后果 |
|---|---|---|
| 干净 | 每次都是全新系统 | 上次装的东西这次没有 |
| 临时 | 跑完就销毁 | 你在里面写的文件不会留到下次 |
| 不是你的 | 在 GitHub 机房 | 你本地的 `.env` 它看不到 |
| 有网 | 能访问外网 | 但访问国内资源可能慢 |

**"跑完就销毁"这一条很重要，举个例子：**

```text
你在 step 里 npm install
→ 装在了 runner 的临时磁盘上
→ job 结束，这台机器被删掉
→ 下次 push，又要重新 npm install
```

**所以第 3 节要配"缓存"。** 不配就是每次重新装，一次多花 40 秒。

**`ubuntu-latest` 现在指向哪个版本？**

```text
2024 年之前：ubuntu-22.04
2025 年前后：ubuntu-24.04
```

**这个映射会变，以 GitHub 文档的 `runner-images` 仓库为准。**

**想固定版本，就写具体的：**

```yaml
runs-on: ubuntu-22.04
```

**学习阶段用 `ubuntu-latest` 就行。** 但你要知道它"会悄悄变"，某天你的脚本突然跑不动，可能就是因为底层系统升级了。

## 2.5 一张总图

**把四个词摞起来：**

```text
仓库
 └── .github/workflows/hello.yml          ← workflow（一个文件）
      │
      ├── name: hello                     ← 页面上的名字
      ├── on: push                        ← 什么时候触发
      │
      └── jobs:
           │
           ├── build                      ← job（一台机器）
           │    ├── runs-on: ubuntu-latest    ← 用哪种机器（runner）
           │    └── steps:                ← step（按顺序执行）
           │         ├── step 1
           │         ├── step 2
           │         └── step 3
           │
           └── deploy                     ← 另一个 job（另一台机器）
                └── ...
```

**背下来这张图的层级关系：**

```text
workflow ⊃ job ⊃ step
runner 是 job 运行的地方
```

**一句话总结：**

> **一个 yml 文件（workflow）里写着若干个任务（job），每个任务在一台临时机器（runner）上按顺序执行若干步骤（step）。**

---

# 第 3 步：文件必须放对位置（15 分钟）

## 3.1 为什么单独讲一节

**因为这是 GitHub Actions 最坑的地方：位置错了，它不报错，它就是什么都不做。**

**你 push 完，刷新页面，看不到任何东西。没有红色，没有提示，什么都没有。**

**你会怀疑网络、怀疑账号、怀疑仓库设置。实际上只是少了一个 `s`。**

## 3.2 正确路径，逐字符拆

```text
.github/workflows/hello.yml
```

**拆开看：**

| 部分 | 必须是什么 | 错一个字符的后果 |
|---|---|---|
| `.github` | 开头有点，全小写 | 写成 `github` → 不触发 |
| `/workflows` | **有 s**，全小写 | 写成 `workflow` → 不触发 |
| `/hello.yml` | 文件名随便 | 但扩展名必须是 `.yml` 或 `.yaml` |

**完整路径必须是：**

```text
仓库根目录/.github/workflows/任意名字.yml
```

**"仓库根目录"是什么意思：**

```text
ci-lab/                       ← 仓库根
├── .github/                  ← 必须在根下
│   └── workflows/
│       └── hello.yml
├── README.md
└── package.json
```

**不能是：**

```text
ci-lab/
└── src/
    └── .github/workflows/hello.yml     ← ❌ 太深了
```

## 3.3 六种常见错位置

**这六种我都见过，每一种都是"完全没反应"：**

```text
❌ .github/workflow/hello.yml          少一个 s
❌ github/workflows/hello.yml          少开头的点
❌ .github/Workflows/hello.yml         大写 W（Windows 不区分，GitHub 区分）
❌ .github/workflows/hello.yaml.bak    多了后缀
❌ workflows/hello.yml                 少 .github 这一层
❌ .github/workflows/hello.yml         但它在子目录里，不在仓库根
```

**怎么自查，一条命令：**

```bash
git ls-files | grep workflows
```

**应该看到：**

```text
.github/workflows/hello.yml
```

**如果输出为空，说明你根本没把这个文件加进 Git。**

**如果输出是别的路径，说明位置错了。**

**`git ls-files` 是什么：** 列出"Git 正在管理的所有文件"。**它只显示已经被 `git add` 过的文件。**

**所以如果文件建好了但没 add，这里也看不到 —— 那也是一种"没反应"的原因。**

## 3.4 Windows 上创建 `.github` 文件夹的坑

**Windows 资源管理器不允许你用鼠标新建一个以点开头的文件夹。**

**你输入 `.github` 会提示"必须键入文件名"。**

**三个办法，任选一个：**

**办法一：命令行（推荐）**

```bash
mkdir -p .github/workflows
```

**`-p` 是什么：** 父目录不存在就一起建。**这句在 Git Bash 里能用，在 cmd 里不行。**

**办法二：在 VS Code 里新建**

在左侧文件树右键 → `New Folder` → 输入 `.github` → VS Code 允许。

**办法三：先建成 `github`，再改名**

在命令行里：

```bash
mv github .github
```

**验证：**

```bash
ls -a
```

**应该看到 ` .github`（前面有个点）。**

## 3.5 为什么 GitHub 要这么设计

**因为它要防止"误触发"。**

```text
如果放在根目录的任何位置都能触发
→ 你在 src/ 里放一个测试用的 yml
→ 每次 push 都会跑，还可能真的去部署
```

**固定在 `.github/workflows/` 的意思是：**

```text
这里面的文件就是"可执行的东西"，
你要放进来，就得明确地放进这个目录。
```

**和第 4 周学的 `.git` 目录一个道理：约定大于配置。位置本身携带含义。**

**代价就是：放错了不会报错。** 这个代价你要记住，因为第 8 步会用这个坑让你犯一次错。

---

# 第 4 步：写第一个 hello.yml（20 分钟）

## 4.1 最小可用版本

**先写一个只有 5 行的，跑通再说。**

**操作：**

1. 在 `ci-lab` 根目录，建目录：

   ```bash
   mkdir -p .github/workflows
   ```

2. 在 VS Code 里打开 `ci-lab` 文件夹；
3. 新建文件 `.github/workflows/hello.yml`；
4. 敲进去（**照着敲，不要复制，YAML 对缩进敏感，复制容易带进看不见的字符**）：

```yaml
name: hello

on: push

jobs:
  say-hi:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Hello from GitHub Actions"
```

**注意最后一行前面是两个空格 + 一个减号 + 一个空格。** 这个格式后面会反复出现。

## 4.2 逐行读这个文件

| 行 | 内容 | 意思 |
|---|---|---|
| 1 | `name: hello` | 这个 workflow 在页面上的名字 |
| 3 | `on: push` | 任何分支的任何一次 push 都触发 |
| 5 | `jobs:` | 下面是任务列表，**冒号后面必须换行，不能写东西** |
| 6 | `  say-hi:` | 一个名叫 `say-hi` 的 job |
| 7 | `    runs-on: ubuntu-latest` | 这个 job 用 Ubuntu 最新版机器跑 |
| 8 | `    steps:` | 下面是步骤列表 |
| 9 | `      - run: echo "..."` | 第一步：执行一条 shell 命令 |

**缩进规则（这一条背下来）：**

```text
第一层：顶格        name / on / jobs
第二层：2 个空格    job 名字（say-hi）
第三层：4 个空格    runs-on / steps
第四层：6 个空格    - run（减号在这一层）
第五层：8 个空格    减号后面的内容如果换行，在这一层
```

**注意 `- run:` 的减号和 `run` 之间有一个空格，这个空格不能省。**

**为什么是 2 个空格：**

YAML 没有规定必须 2 个，但**一旦你选了 2，全文件都得是 2 的倍数**。混用 2 和 4 会报错。

**这一条在第 8 步会让你亲眼看到报错。**

## 4.3 push 上去

```bash
git add .github
git status --short
```

**应该看到：**

```text
A  .github/workflows/hello.yml
```

**`A` 是什么：** Added，新增。

```bash
git commit -m "第204节课：第一个 workflow"
git push
```

**应该看到：**

```text
[main 3f7a1c2] 第204节课：第一个 workflow
 1 file changed, 9 insertions(+)
 create mode 100644 .github/workflows/hello.yml
Enumerating objects: 4, done.
...
To https://github.com/你的用户名/ci-lab.git
   8b2c9d1..3f7a1c2  main -> main
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `create mode 100644` | 新建文件，权限 644（普通读写） |
| `Enumerating objects: 4` | 这次要传 4 个对象（blob + tree + commit + 可能一个父目录 tree） |
| `main -> main` | 本地 main 推到远端 main |

**注意 `9 insertions(+)` —— 刚好是那 9 行。**

**如果行数不对，说明你的文件里混进了空行。** 空行不算错，但计数会对不上，说明你复制了带空行的版本。

## 4.4 去看那个绿勾

**操作：**

1. 回到仓库页面，刷新；
2. 顶部会出现一行黄点：

```text
● 第204节课：第一个 workflow    ci / hello    now
```

3. 点那个黄点后面的 `Details`，或者直接点顶部的 `Actions` 标签；
4. 左侧列表会出现：

```text
All workflows
hello
```

**等 20 到 60 秒，刷新。**

**应该看到：**

```text
✅ hello
   #1  第204节课：第一个 workflow
   main   3f7a1c2   刚刚   in 12s
```

**逐块读：**

| 部分 | 意思 |
|---|---|
| ✅ 绿勾 | 这个 workflow 跑成功了 |
| `#1` | 第 1 次运行（累加编号） |
| `第204节课：第一个 workflow` | 用的是你的 commit 信息 |
| `main` | 触发的分支 |
| `3f7a1c2` | 触发的那次提交（短哈希） |
| `in 12s` | 一共花了 12 秒 |

**12 秒里大部分时间在"分配机器"，不是在你那条 `echo` 上。**

**点进 `#1`：**

**应该看到左边一列：**

```text
Jobs
  say-hi  ✅  10s
```

**再点 `say-hi`，展开每一步：**

```text
✅ Set up job                    2s
✅ Run echo "Hello from GitHub Actions"   0s
✅ Complete job                  0s
```

**`Set up job` 是什么：** 机器开机、装系统、准备环境。**这 2 秒你什么都没做，但它必须发生。**

**点开 `Run echo ...`，应该看到：**

```text
Run echo "Hello from GitHub Actions"
  echo "Hello from GitHub Actions"
  shell: /usr/bin/bash -e {0}
Hello from GitHub Actions
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Run echo "..."` | 这一步的名字（没写 `name` 就用命令本身） |
| `  echo "..."` | GitHub 把你写的命令回显一遍 |
| `shell: /usr/bin/bash -e {0}` | 用 bash 执行，`-e` 表示"任何一句失败就整体失败" |
| `Hello from GitHub Actions` | 真正的输出 |

**`shell: /usr/bin/bash -e {0}` 里的 `-e` 很关键。**

**它的意思是：**

```text
你写三行命令，第二行失败了
→ 整个 step 立刻失败
→ 不会继续跑第三行
```

**这个默认行为救过很多人。** 否则脚本里一句失败被忽略，后面的部署会在错误的前提下继续。

## 4.5 为什么要点进日志里看

**因为"绿勾"只说明最后一句的退出码是 0。**

**它不说明你的命令真的做成了事。**

**举例：**

```bash
curl http://example.com
echo "done"
```

**如果 `curl` 失败了，但最后一句 `echo` 成功，整个 step 仍然是绿的。**

**这就是第 7 节"冒烟检查"为什么要用 `curl -f` 的原因：**

```text
curl       → HTTP 500 也算成功（拿到了响应）
curl -f    → HTTP 500 会让退出码非 0，step 变红
```

**这一条你现在先记住结论，第 210 节课会真的用到。**

---

# 第 5 步：让它真的碰你的代码（20 分钟）

## 5.1 现在的问题是：runner 上没有你的代码

**刚才那个 job 打印了一句话，但它**不知道** `ci-lab` 是什么。**

**验证一下。** 改 `hello.yml`，加一步看看目录里有什么：

```yaml
name: hello

on: push

jobs:
  say-hi:
    runs-on: ubuntu-latest
    steps:
      - name: 看看当前目录有什么
        run: ls -la
```

**push 之后看日志：**

```text
Run ls -la
  ls -la
  shell: /usr/bin/bash -e {0}
total 32
drwxr-xr-x 5 runner runner 4096 Nov 16 09:12 .
drwxr-xr-x 3 runner runner 4096 Nov 16 09:12 ..
drwxr-xr-x 3 runner runner 4096 Nov 16 09:12 work
```

**只有 `work` 一个目录，没有 `README.md`，没有 `package.json`。**

**为什么：**

```text
runner 是一台全新的机器
它只负责"执行你的命令"
它不会自动知道"要执行哪个仓库的代码"
```

**这是一个很反直觉的点：** 你以为 push 了代码，机器就会拿到代码。**不会。**

## 5.2 加 checkout

**`actions/checkout` 就是"把仓库代码下载到 runner"这个动作。**

**完整的文件改成：**

```yaml
name: hello

on: push

jobs:
  say-hi:
    runs-on: ubuntu-latest
    steps:
      - name: 第一步：把仓库代码下载下来
        uses: actions/checkout@v4

      - name: 第二步：看看现在有什么
        run: ls -la
```

**逐行读新增的部分：**

| 行 | 意思 |
|---|---|
| `uses: actions/checkout@v4` | 用一个现成的 action，不要自己写命令 |
| `@v4` | 用它的第 4 个大版本 |

**为什么用 `uses` 不用 `run`：**

```text
自己写大概是这样：git clone https://github.com/xxx/ci-lab.git .
需要处理：token、分支、子模块、浅克隆、大文件……
官方 action 已经把这些都处理好了
```

**push，再看日志：**

```text
Run actions/checkout@v4
Syncing repository: 你的用户名/ci-lab
Getting Git version info
...
/tmp/.../git-credentials
HEAD is now at 3f7a1c2 第204节课：第一个 workflow
```

**然后再看第二步：**

```text
total 44
drwxr-xr-x 6 runner runner 4096 Nov 16 09:15 .
drwxr-xr-x 3 runner runner 4096 Nov 16 09:15 ..
drwxr-xr-x 7 runner runner 4096 Nov 16 09:15 .git
-rw-r--r-- 1 runner runner  120 Nov 16 09:15 .gitignore
-rw-r--r-- 1 runner runner   58 Nov 16 09:15 README.md
```

**`README.md` 出现了。**

**注意还有 `.git` —— checkout 默认会带 Git 历史。**

**这在第 4 节打镜像 tag 时会用到：你要拿 commit 的 sha 当 tag。**

## 5.3 加 setup-node

**两个问题要先搞清楚：**

```text
① ubuntu-latest 里有没有 node？
② 如果有，为什么还要 actions/setup-node？
```

**先答第一个：有。**

**加一步验证：**

```yaml
      - name: 看看自带什么版本
        run: |
          node -v
          npm -v
          git --version
```

**`run: |` 是什么：** 竖线表示"下面是多行命令，整块当一段脚本执行"。**这个符号很重要，第 8 步会讲忘了它会发生什么。**

**日志：**

```text
Run node -v
  node -v
  npm -v
  git --version
  shell: /usr/bin/bash -e {0}
v20.19.4
10.8.2
git version 2.51.0
```

**（具体小版本号每天在变，你的可能不一样，看大版本就行。）**

**所以 runner 自带 Node 20。**

**那为什么还要 `setup-node`？三个理由：**

| 理由 | 说明 |
|---|---|
| 版本不可控 | `ubuntu-latest` 哪天从 Node 20 换成 22，你的项目可能就崩了 |
| 不能指定 | 你想测 Node 18 和老版本兼容，自带的做不到 |
| 没有缓存 | 自带的 npm 不会帮你缓存 `node_modules` |

**第三个理由最实际。**

## 5.4 加 setup-node 和缓存

**改成：**

```yaml
name: hello

on: push

jobs:
  say-hi:
    runs-on: ubuntu-latest
    steps:
      - name: 第一步：下载仓库代码
        uses: actions/checkout@v4

      - name: 第二步：装指定版本的 Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 第三步：确认版本
        run: |
          node -v
          npm -v

      - name: 第四步：装依赖
        run: npm ci
```

**逐行读 `with:` 下面两行：**

| 行 | 意思 |
|---|---|
| `node-version: '20'` | 装 Node 20 的最新小版本 |
| `cache: 'npm'` | 把 npm 的下载缓存存起来，下次直接用 |

**`'20'` 为什么加引号：**

```text
不加引号：YAML 会把它当数字 20
加引号：  YAML 当它是字符串 "20"
setup-node 要的是字符串
```

**YAML 里 `20` 和 `'20'` 是两种东西。** 这个细节在版本号上会咬人，养成加引号的习惯。

**`npm ci` 和 `npm install` 的区别：**

| | `npm install` | `npm ci` |
|---|---|---|
| 读什么 | `package.json` | `package-lock.json`（必须有） |
| 会不会改锁文件 | 会 | **不会** |
| 速度 | 慢 | 快 |
| 适合 | 本地开发 | **CI** |

**CI 里永远用 `npm ci`。** 因为它保证"装出来的依赖和锁文件完全一致"，不受当天 registry 状态影响。

## 5.5 这一步会遇到第一个真错

**`ci-lab` 现在没有 `package.json`，所以 `npm ci` 会失败。**

**日志：**

```text
Run npm ci
  npm ci
  shell: /usr/bin/bash -e {0}
npm error The `npm ci` command can only install with an existing package-lock.json or
npm error npm-shrinkwrap.json with lockfileVersion >= 1. Run an install with npm@5 or
npm error later to generate a package-lock.json file, then try again.
Error: Process completed with exit code 1.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `can only install with an existing package-lock.json` | 没有锁文件，`ci` 拒绝工作 |
| `Run an install with npm@5 or later` | 提示你先跑一次 `npm install` 生成锁文件 |
| `Process completed with exit code 1` | 退出码 1，step 变红 |

**注意最后一行 —— 这就是"红"的来源。**

```text
GitHub 不判断你的命令"做没做成"
它只看退出码 0 还是非 0
```

**修法（本地做）：**

```bash
npm init -y
npm install express
git add package.json package-lock.json
git commit -m "加上 package.json 和锁文件"
git push
```

**`npm init -y` 是什么：** 生成一个默认的 `package.json`，全选 yes。

**`npm install express` 是什么：** 装一个包，顺便生成 `package-lock.json`。

**推上去之后，再看一次日志：**

```text
Run npm ci
  npm ci
  shell: /usr/bin/bash -e {0}
npm warn deprecated ...
added 68 packages, and audited 69 packages in 3s
found 0 vulnerabilities
```

**绿了。**

**`added 68 packages` 说明装成功了。** 68 是 express 的依赖树大小，你的可能不同。

## 5.6 第二次跑，看缓存有没有生效

**再 push 一次（随便改个空格）：**

**日志里会多一段：**

```text
Run actions/setup-node@v4
Found in cache @ /opt/hostedtoolcache/node/20.19.4/x64
Cache hit for: node-cache-Linux-x64-npm-...
Cache restored successfully
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Found in cache @ ...` | Node 20 已经在机器上了，不用下载 |
| `Cache hit` | 缓存命中了 |
| `Cache restored successfully` | 缓存恢复完成 |

**第一次是 `Cache not found for input keys`，第二次才是 `Cache hit`。**

**缓存第一次不会命中，因为缓存是"跑完之后才存"的。**

**这就是为什么缓存有时候"看起来没用" —— 你得跑两次才能看出差别。**

**为什么这样设计：**

```text
runner 每次都是新的，缓存不可能凭空存在
所以第一次跑：没有缓存 → 正常装 → 跑完把缓存打包存起来
第二次跑：  找到缓存 → 直接解压 → 省掉下载时间
```

**存的时候会按 `package-lock.json` 的内容算一个 key。** 锁文件一改，key 就变了，缓存就失效，重新装。

**这个设计很聪明：依赖没变就复用，依赖变了就重装，不会用错缓存。**

---

# 第 6 步：触发的几种写法（15 分钟）

## 6.1 `on:` 能写什么

**`on:` 决定"什么时候跑"。**

**三种最常用的：**

```yaml
on: push                  # push 就触发
on: pull_request          # 有人开 PR 就触发
on: workflow_dispatch     # 只能手动点按钮触发
```

**但真实项目里几乎不会这么裸写。** 因为 `on: push` 是"任何分支的任何一次 push"，包括你随手推的实验分支。

**会浪费额度，也会让页面很乱。**

## 6.2 `push` 加分支过滤

```yaml
on:
  push:
    branches:
      - main
```

**意思：只有 push 到 `main` 才触发。**

**逐行读：**

| 行 | 意思 |
|---|---|
| `on:` | 冒号后换行，下面写细节 |
| `  push:` | 触发类型是 push |
| `    branches:` | 再加一层限制：分支 |
| `      - main` | 只认 main |

**缩进关系：**

```text
on:
  push:              ← 比 on 多 2 空格
    branches:        ← 比 push 多 2 空格
      - main         ← 比 branches 多 2 空格
```

**多层嵌套，每层 2 个空格。** 这就是 YAML 的全部规则。

**多个分支怎么写：**

```yaml
on:
  push:
    branches:
      - main
      - release/**
```

**`release/**` 是什么：** 通配符，匹配所有以 `release/` 开头的分支（`release/1.0`、`release/2024-11`）。

**排除某些分支：**

```yaml
on:
  push:
    branches-ignore:
      - 'docs/**'
```

**`branches` 和 `branches-ignore` 不能同时用。** 这是 GitHub 的限制，同时写会报错。

## 6.3 `pull_request`

```yaml
on:
  pull_request:
    branches:
      - main
```

**意思：有人向 `main` 开 PR（或往 PR 里推新提交）时触发。**

**这个触发有一个新手必踩的坑：**

```text
从 fork 来的 PR，拿不到你的 Secrets。
```

**为什么：**

```text
如果是 fork 来的 PR，代码是陌生人写的
如果 CI 能用你的密钥，他改一行 workflow 就能把密钥发到自己服务器
所以 GitHub 直接不给
```

**这是安全设计，不是 bug。** 第 209 节课会专门讲。

**所以：**

```text
需要密钥的步骤（推送镜像、部署），必须写成"只在 push 到自己的分支时跑"
不能写成"任何 PR 都跑"
```

## 6.4 `workflow_dispatch`：手动按钮

```yaml
on:
  workflow_dispatch:
```

**push 之后，去 Actions 页面：**

```text
左侧列表点 hello
右边出现一行提示：
  This workflow has a workflow_dispatch event trigger.
  [Run workflow ▾]
```

**点 `Run workflow` → 选分支 → 绿色按钮 `Run workflow`。**

**几秒后页面出现一次新的运行。**

**两个必须知道的限制：**

| 限制 | 说明 |
|---|---|
| 只在默认分支上生效 | yml 只在 `main` 上有，才看得到按钮 |
| 可以带参数 | `workflow_dispatch.inputs` 能让你填东西 |

**带参数的写法：**

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: '部署到哪个环境'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production
```

**用的时候：**

```yaml
      - run: echo "部署到 ${{ inputs.environment }}"
```

**`${{ inputs.environment }}` 是什么：** GitHub 的表达式语法，`${{ }}` 里面会被替换成实际值。

**注意是 `inputs`，不是 `github.event.inputs`。** 两种写法都存在，新版推荐 `inputs`。

## 6.5 一个文件写多个触发

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:
```

**三个触发并存，任意一个满足就跑。**

**这是真实项目里最常见的写法。**

**为什么三个都要：**

| 触发 | 什么时候用 |
|---|---|
| `push` | 合进 main 之后，要跑全套 + 部署 |
| `pull_request` | 还没合，先验证一遍，避免合进去才发现坏的 |
| `workflow_dispatch` | 想手动重跑一次（比如线上有问题，想重新部署） |

**`workflow_dispatch` 的实用价值：**

```text
部署脚本挂了 → 修好 → 不想为一个空格产生一次 commit → 直接点按钮重跑
```

## 6.6 一个容易忽略的坑：`paths`

**你的仓库里有文档，也有代码。**

**改一个 `README.md`，也触发全套 CI + 部署，是浪费。**

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

**意思：只改了 markdown 和 docs 目录，不触发。**

**反过来也有：**

```yaml
    paths:
      - 'src/**'
      - 'package.json'
```

**意思：只有这些路径变了才触发。**

**同样，`paths` 和 `paths-ignore` 不能同时用。**

**⚠️ 一个反直觉的后果：**

```text
如果 workflow 用了 paths-ignore: '**.md'
而你的分支保护要求"这个检查必须通过"
→ 只改 md 的 PR 永远不会产生这个检查
→ PR 永远合不进去（一直显示 "Expected — Waiting for status to be reported"）
```

**这就是"配置之间的相互作用"。** 你现在不用处理，但要知道它存在。

---

# 第 7 步：国内网络的现实（20 分钟）

**这一节不讲"应该怎样"，讲"实际会怎样"。**

## 7.1 三个地方会慢

```text
① 拉 action 本身
   actions/checkout、actions/setup-node 都是 GitHub 上的仓库
   runner 要去 github.com 下载 tarball

② 拉 npm 包
   npm ci 默认走 registry.npmjs.org

③ 拉 Docker 镜像
   docker build 的 FROM node:20 要走 Docker Hub
```

**第 ① 个你控制不了太多。第 ② ③ 个能换源。**

## 7.2 拉 action 失败的典型样子

**日志卡在这里很久：**

```text
Run actions/checkout@v4
```

**然后失败：**

```text
Failed to download action 'https://api.github.com/repos/actions/checkout/tarball/v4'
Error: read ECONNRESET
```

**或者：**

```text
Error: Failed to resolve action download info. Error: Service Unavailable
```

**或者 job 一直不动：**

```text
Waiting for a runner to pick up this job...
```

**三种现象，同一个原因：runner 和 GitHub 之间的网络不稳。**

## 7.3 能做的四件事

**第一：重试。**

**页面上右上角有 `Re-run jobs` → `Re-run all jobs`。**

**这不是"笨办法"，这是官方推荐的常态操作。** GitHub 自己的状态页也经常有 `degraded performance`。

**第二：减少 action 的数量。**

**能用 `run:` 解决的，不要引 action。**

```yaml
# ❌ 为了打印一句话引一个 action
- uses: some-org/echo-action@v1
  with:
    message: hello

# ✅ 直接跑命令
- run: echo "hello"
```

**每多一个 `uses`，就多一次下载。** 你的流水线里 action 越少，越不容易卡。

**第三：npm 换源。**

```yaml
      - name: 换成国内源
        run: npm config set registry https://registry.npmmirror.com

      - name: 装依赖
        run: npm ci
```

**注意顺序：换源必须在 `npm ci` 之前。**

**但这样有个副作用：**

```text
package-lock.json 里记的 resolved 地址会变成 npmmirror 的
如果你本地用官方源、CI 用国内源，锁文件里的地址会不一致
```

**更稳的做法是用 `npm ci --registry=...` 一次性指定，不改配置：**

```yaml
      - run: npm ci --registry=https://registry.npmmirror.com
```

**`--registry` 只影响这一次命令，不写进任何文件。**

**第四：开缓存。**

**你第 5.4 步已经配了 `cache: 'npm'`。它省的就是"拉包"的时间。**

**缓存命中时，`npm ci` 从 40 秒降到 8 秒。**

## 7.4 三件不要做的事

**第一：不要把 `StrictHostKeyChecking=no` 那类"关掉校验"的思路搬到 action 上。**

**比如用来源不明的镜像源替换 `actions/checkout`：**

```yaml
# ❌ 绝对不要
- uses: some-mirror/checkout@v4
```

**你不认识那个仓库的主人。他可以在里面加一行，把你的 `GITHUB_TOKEN` 发到他的服务器。**

**这就是供应链攻击。** 2025 年已经发生过多起真实的 action 被投毒事件。

**第二：不要写 `continue-on-error: true` 来"绕过"下载失败。**

```yaml
# ❌ 这会把"下载失败"变成"绿勾"
- uses: actions/checkout@v4
  continue-on-error: true
```

**后果：后面所有步骤都在一个空目录里跑，全部失败，但第一步是绿的，你会以为是别的问题。**

**第三：不要用 `while true` 之类的重试脚本。**

**Actions 有 `retry` 的需求就手动点 `Re-run`。** 写循环重试容易把额度烧光（一次 job 最多跑 6 小时）。

## 7.5 一次跑多久，额度怎么算

**看第 4.4 步那个 `in 12s`。**

**真实项目里一个典型的 CI：**

| 阶段 | 耗时 |
|---|---|
| 分配机器 | 5—20 秒 |
| checkout | 3—10 秒 |
| setup-node（有缓存） | 3—5 秒 |
| `npm ci`（有缓存） | 5—15 秒 |
| 跑测试 | 10—60 秒 |
| **合计** | **约 30 秒—2 分钟** |

**额度计算（私有仓库）：**

```text
一次 2 分钟 × 一天 push 15 次 = 30 分钟/天
30 天 = 900 分钟/月
免费额度 2000 分钟/月 → 够用
```

**但这个"够用"很脆弱：**

```text
如果你配了个每天定时跑的任务，一次 5 分钟
5 × 30 = 150 分钟/月，还好

如果你不小心让 job 卡住了，一次跑满 6 小时上限
360 分钟，一次就吃掉 18% 的月额度
```

**所以第 7 节课会加 `timeout-minutes`。**

**公开仓库不限量 —— 这是 GitHub 的免费策略，用来吸引开源项目。** 学习阶段用私有仓库，是为了避免密钥事故，不是为了省钱。

---

# 第 8 步：故意犯七个错（25 分钟）

**这七个错，每一个都让你"以为没生效"。**

**在 `ci-lab` 里做，做完要改回来。**

## 错误 1：目录名少一个 s

**操作：**

```bash
mkdir -p .github/workflow
mv .github/workflows/hello.yml .github/workflow/hello.yml
git add -A
git commit -m "故意犯错1"
git push
```

**会怎样：**

**什么都没有。**

**去 Actions 页面：**

```text
All workflows

There are no workflow runs yet.
```

**没有红色 ❌，没有报错，没有提示。**

**为什么：**

```text
GitHub 只扫描 .github/workflows/ 这一个目录
.github/workflow/ 对它是"一个普通的、它不认识的目录"
```

**注意：这个错误连"报错"都不会给你。** 这是 GitHub Actions 最坑的地方 —— 它对路径错误保持沉默。

**怎么修：**

```bash
mkdir -p .github/workflows
mv .github/workflow/hello.yml .github/workflows/hello.yml
rmdir .github/workflow
git add -A
git commit -m "修回目录名"
git push
```

**怎么提前发现：**

```bash
git ls-files | grep -i workflow
```

**输出必须正好是 `.github/workflows/xxx.yml`。**

**`-i` 是什么：** 忽略大小写。这样连大小写错也能一起查出来。

## 错误 2：用 Tab 缩进

**操作：**

1. 打开 `hello.yml`；
2. 把 `runs-on` 前面那两个空格，用键盘上的 `Tab` 键替换；
3. push。

**会怎样：**

**这次有报错了，在 Actions 页面：**

```text
Invalid workflow file

You have an error in your yaml syntax on line 8
```

**点进去看详情，或者在 commit 旁边会有红色 ❌ 和一个 `Annotations` 区块：**

```text
.github/workflows/hello.yml#L8
You have an error in your yaml syntax on line 8
```

**为什么：**

```text
YAML 规范明确禁止用 Tab 做缩进。
因为 Tab 的宽度在不同编辑器里不一样（2 格、4 格、8 格），
同一份文件在不同环境里会被解析成不同结构。
```

**注意：这个错误在 GitHub 上才出现。**

**你本地 `git diff` 看不出来 —— 空格和 Tab 在终端里长得一样。**

**怎么查（这一步很实用）：**

**VS Code 里：**

1. `Ctrl + Shift + P`；
2. 输入 `Render Whitespace` → 选 `all`；
3. 现在空格显示成小点 `·`，Tab 显示成箭头 `→`。

**你会立刻看到那个异类。**

**命令行查（Git Bash 也能用）：**

```bash
grep -Pn "\t" .github/workflows/hello.yml
```

**`-P` 是什么：** 用 Perl 正则，这样 `\t` 才能被识别成 Tab。

**应该看到：**

```text
8:	    runs-on: ubuntu-latest
```

**`8:` 后面那一大块空白，如果是 Tab 就会匹配上。**

**有输出就是有问题，没输出就是干净。**

**怎么修：**

1. VS Code 右下角点 `Spaces: 2` 或 `Tab Size`；
2. 选 `Indent Using Spaces`；
3. 全选文件，`Shift + Tab` 再 `Tab` 一次，重新缩进；
4. 或者直接删掉那几行重敲。

**根治办法：**

**在 `ci-lab` 根目录加 `.editorconfig`：**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

**`.editorconfig` 是什么：** 一个约定文件，VS Code（装 EditorConfig 插件后）会自动按它设置缩进。**这样你团队里所有人敲出来的都是空格。**

**为什么 `end_of_line = lf` 也重要：**

```text
Windows 默认换行是 CRLF（两个字符）
Linux 是 LF（一个字符）
yml 里混进 CRLF，某些解析器会报奇怪的错
```

**这一条以后写 shell 脚本时更要命 —— CRLF 的 `.sh` 文件在 Linux 上会报 `bad interpreter: /bin/bash^M`。**

## 错误 3：漏掉 `runs-on`

**操作：** 删掉 `runs-on` 那一行。

```yaml
name: hello

on: push

jobs:
  say-hi:
    steps:
      - run: echo "hi"
```

**会怎样：**

```text
Invalid workflow file

.github/workflows/hello.yml (Line: 6, Col: 3): Required property is missing: runs-on
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `Line: 6, Col: 3` | 第 6 行第 3 列（就是 `steps:` 那个位置） |
| `Required property is missing: runs-on` | 缺少必填属性 `runs-on` |

**为什么：**

```text
GitHub 不知道你要用哪种机器
它不能猜（Windows？macOS？Ubuntu？免费的还是付费的更大的？）
所以这个字段是必填
```

**注意报错位置指在 `steps` 而不是"应该在哪加"。** 这是校验器的通病：**它告诉你"这里开始不对了"，不告诉你"缺的东西该放哪"。**

**怎么修：** 在 `steps:` 上面加回来：

```yaml
  say-hi:
    runs-on: ubuntu-latest
    steps:
```

**`runs-on` 和 `steps` 是同级的，都是 `say-hi` 的子项。** 两个都是 4 个空格。

## 错误 4：`steps` 的减号少缩进一格

**操作：** 把 `- run` 改成 5 个空格（比正确的 6 个少一格）。

```yaml
    steps:
     - run: echo "hi"
```

**会怎样：**

**不一定报错，可能"看起来跑成功了但什么都没做"。**

**如果报错，长这样：**

```text
Invalid workflow file

.github/workflows/hello.yml (Line: 9, Col: 6): Unexpected value ''
```

**为什么有时候不报错：**

```text
YAML 里 5 个空格也是合法的缩进（只要是同一层内一致）
GitHub 可能把它解析成 steps 的一个子项
但那个子项的名字它不认识 → 忽略
→ 跑了一个"零步骤"的 job → 绿勾
```

**这就是最坏的情况：** 绿勾，但你的 `echo` 根本没执行。

**怎么发现：**

**点进 job，看 steps 列表：**

```text
✅ Set up job
✅ Complete job
```

**只有两行，中间你的步骤不见了。**

**记住这个特征：绿勾 + 步骤数不对 = 缩进错位。**

**怎么修：** 统一成 6 个空格（`steps:` 是 4 个，子项是 6 个）。

**规则：`- ` 这个减号属于"列表项"，它比父级的 key 多缩进 2 格。**

## 错误 5：多行命令忘了 `|`

**操作：** 想跑两条命令，写成两行 `run`：

```yaml
      - run: echo "第一句"
        echo "第二句"
```

**会怎样：**

```text
Invalid workflow file

.github/workflows/hello.yml (Line: 10, Col: 9): Unexpected value 'echo'
```

**为什么：**

```text
一个 step 只能有一个 run
你想写第二行命令，但那行的位置在 YAML 看来是"又一个 key"
而 `echo "第二句"` 不是一个合法的 key（key 应该是 xxx: 的形式）
```

**怎么修：用 `|`**

```yaml
      - run: |
          echo "第一句"
          echo "第二句"
```

**逐行读：**

| 部分 | 意思 |
|---|---|
| `run: |` | 竖线表示"下面是多行字符串，原样保留" |
| 缩进 10 空格 | 这些内容都属于 `run` 的值 |

**`|` 和 `>` 的区别（了解一下就够）：**

```yaml
run: |
  echo a
  echo b
# 保留换行 → 两条独立命令

run: >
  echo a
  echo b
# 折叠成一行 → "echo a echo b" → 一条命令，会出错
```

**写 shell 永远用 `|`。** `>` 适合长句子，不适合命令。

**还有一个变体：**

```yaml
      - run: |
          echo "第一句"
          echo "第二句"
        shell: bash
```

**`shell: bash` 可以显式指定。** 默认在 Linux 上就是 bash，写不写都行。但在 Windows runner 上必须写，否则默认是 PowerShell。

## 错误 6：把密钥写进 yml

**操作：** 假装要登录镜像仓库，写：

```yaml
      - name: 登录
        run: docker login ghcr.io -u 你的用户名 -p ghp_xxxxxxxxxxxxxxxxxxxx
```

**会怎样：**

**它可能真的能跑成功。这就是最可怕的地方。**

**然后：**

```text
① 这个 token 永久留在这个 commit 里
② 就算你下一条 commit 删掉，git log 里还有
③ 如果仓库是公开的，爬虫 30 秒内就会扫到
④ GitHub 自己也会检测到（会给你发邮件说 "GitHub personal access token detected"）
```

**为什么 `***` 保护不了你：**

```text
GitHub 会对"看起来像密钥的字符串"打码
但：
  - 它只打码它认识的格式
  - 你 base64 一下就绕过了
  - 你拆成两段拼一下也绕过了
  - 日志本身是明文存储在 GitHub 上的
```

**正确的写法：**

```yaml
      - name: 登录
        run: echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `${{ secrets.GHCR_TOKEN }}` | 从仓库设置里取，yml 里没有真值 |
| `--password-stdin` | 从标准输入读密码，不出现在命令行参数里 |
| `echo "$..." |` | 把密码喂给上一条命令 |

**为什么用 `--password-stdin` 而不是 `-p`：**

```text
-p 密码 → 密码出现在进程列表里，同机器上任何人 ps 一下就看到
--password-stdin → 密码只在管道里，进程列表看不到
```

**这一条在真实服务器上很重要。** CI 里 runner 是你独占的，但也该养成习惯。

**如果已经泄露了怎么办：**

```text
① 立刻去 GitHub → Settings → Developer settings → Tokens 删掉那个 token
② 重新生成一个
③ 不要试图"改写 Git 历史"来掩盖 —— 已经晚了，直接吊销
④ 检查这个 token 有没有被用过（Settings → Security log）
```

**吊销比掩盖重要一百倍。** 第 225 节课会专门讲这个流程。

## 错误 7：push 到分支，但 `on` 只写了 main

**操作：**

```bash
git checkout -b feature/test
echo "test" >> README.md
git add -A
git commit -m "在分支上提交"
git push -u origin feature/test
```

**而 `hello.yml` 里写的是：**

```yaml
on:
  push:
    branches:
      - main
```

**会怎样：**

**Actions 页面**没有任何新运行。**

**但这次和错误 1 不一样 —— 你去仓库的 `Actions` 页面，如果点左侧 `hello`，会看到：**

```text
This workflow has no runs yet.
```

**而且分支切换器里选 `feature/test`，也是空的。**

**为什么：**

```text
push 事件确实发生了
但 branches 过滤器把它挡掉了
被过滤器挡掉 ≠ 报错，就是"这次事件不匹配"
```

**怎么验证"确实是过滤器的问题"：**

**临时把 `on:` 改成：**

```yaml
on:
  push:
```

**push 一次，立刻就能跑。** 这证明配置本身是对的，只是过滤条件不匹配。

**怎么修（推荐）：**

```yaml
on:
  push:
    branches:
      - main
      - 'feature/**'
```

**或者更好的做法：**

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

**让分支上的工作通过 `pull_request` 来验证，而不是通过 `push`。** 这样：
- 分支上随便推，不烧额度
- 开 PR 时跑一次，验证通过才能合

**这就是第 3 节课"测试不过不许合并"的基础。**

## 错误 8（附加）：yml 文件名为中文或带空格

**操作：** 把文件命名成 `hello 工作流.yml`。

**会怎样：**

**能跑，但 URL 里会出现 `%E5%B7%A5%E4%BD%9C%E6%B5%81`。**

**在日志里、在 API 返回里、在你写脚本调 API 时，全是这一串编码。**

**为什么：**

```text
URL 只能用 ASCII 字符
中文会被百分号编码
GitHub 内部用文件名做标识
```

**怎么修：** 文件名只用小写字母、数字、连字符：

```text
✅ hello.yml
✅ ci-test.yml
✅ deploy-production.yml
❌ hello 工作流.yml
❌ Hello.yml（大写虽然能用，但不好看也不好打）
```

**这条不是硬规矩，但会让你少很多麻烦。** 特别是第 5 节课你要用 API 查 workflow 状态的时候。

---

# 第 9 步：写学习笔记（10 分钟）

**把下面这份模板完整复制到 `02-笔记/NOTES.md`，然后填空。**

````markdown
# 第 204 节课学习笔记

## 一、我原来怎么上线（写出那五条命令）

1.
2.
3.
4.
5.

## 二、四个词

| 词 | 一句话解释 | 它在我哪个文件里 |
|---|---|---|
| workflow | | |
| job | | |
| step | | |
| runner | | |

## 三、层级关系

把这张图画一遍（不看课件）：

```text
workflow
 └──
      └──
```

## 四、文件必须放在哪

完整路径：

如果放错了，GitHub 会报什么：

我是怎么自查的（写出那条命令）：

## 五、我的第一个 hello.yml

把完整内容贴在这里（包括所有缩进）：

```yaml

```

`on: push` 和 `on: push: branches: [main]` 的区别：

## 六、runner 自带什么

我跑 `node -v` 看到的结果：

我跑 `npm -v` 看到的结果：

那为什么还要 `actions/setup-node`（写出两个理由）：

1.
2.

## 七、不写 `actions/checkout` 会怎样

我看到的目录列表：

我的结论：

## 八、`npm ci` 和 `npm install` 的区别

| | `npm install` | `npm ci` |
|---|---|---|
| 读哪个文件 | | |
| 会不会改锁文件 | | |
| CI 里该用哪个 | | |

我第一次跑 `npm ci` 报的错（贴原文）：

## 九、三种触发方式

| 写法 | 什么时候跑 | 我用它做什么 |
|---|---|---|
| `on: push` | | |
| `on: pull_request` | | |
| `on: workflow_dispatch` | | |

`workflow_dispatch` 的按钮在哪：

## 十、我踩的七个错

| 错误 | 现象（有没有报错） | 怎么查出来的 |
|---|---|---|
| 目录少 s | | |
| Tab 缩进 | | |
| 漏 runs-on | | |
| 减号缩进错 | | |
| 多行忘 `\|` | | |
| 密钥写进 yml | | |
| 分支过滤挡掉 | | |

## 十一、国内网络

我遇到的慢/失败现象（贴原文）：

我做的处理：

哪一件事我决定不做，为什么：

## 十二、成本

我这次 CI 跑了多少秒：

按一天 push 10 次算，一个月多少分钟：

## 十三、我还不懂的词

-
-

## 十四、完成检查

- [ ] 我有一个独立的 `ci-lab` 私有仓库
- [ ] 我的 `.github/workflows/hello.yml` 跑出了绿勾
- [ ] 我点进日志，逐行看过 `shell: /usr/bin/bash -e {0}` 那一段
- [ ] 我知道不写 `actions/checkout` 时目录里有什么
- [ ] 我配了 `cache: 'npm'`，并看到过第二次的 `Cache hit`
- [ ] 我做过 `workflow_dispatch` 手动触发
- [ ] 七个错误我至少亲眼见过四个
- [ ] 我能不看课件说出 workflow/job/step/runner 的关系
````

---

# 第 10 步：课后练习

## 练习一：把四个词讲给一个不懂的人听

**要求：**

1. 找一个不懂编程的人（或者对着手机录音）；
2. 用 3 分钟讲清 workflow / job / step / runner；
3. **不许用"就是那个……"这类词**；
4. 录音或写下来。

**记录：** 你在哪一句卡住了？

**思考题：** 如果对方问"job 和 step 有什么区别"，你会怎么打比方？

## 练习二：让两个 job 同时跑

**要求：**

1. 在 `hello.yml` 里加第二个 job，名叫 `say-bye`；
2. 它也是 `runs-on: ubuntu-latest`，只跑一句 `echo "bye"`；
3. push，去看 Actions 页面的 job 列表。

**记录：** 两个 job 是同时开始的，还是一个接一个？你怎么看出来的（看时间戳）？

**思考题：** 两个 job 里都 `npm ci`，会省时间还是浪费时间？为什么？

## 练习三：故意让第一步失败，看后面的步骤

**要求：**

1. 写三步：

   ```yaml
         - run: exit 1
         - run: echo "我还会跑吗"
         - run: echo "我呢"
   ```

2. push，看日志。

**记录：** 后两步跑了吗？job 的结论是什么？

**思考题：** 如果第一步是 `npm test` 失败，你希望部署那一步跑吗？

## 练习四：加一个 `workflow_dispatch` 参数

**要求：**

1. 加 `inputs.reason`，类型 `string`，必填；
2. 在 step 里 echo 出来；
3. 手动触发两次，填不同的值。

**记录：** 两次的日志里 `reason` 分别是什么？

**思考题：** 为什么要给"手动重跑"加一个"原因"字段？

## 练习五：算一次真实成本

**要求：**

1. 从 Actions 页面读出你这个 workflow 每次运行的耗时；
2. 假设你一天 push 12 次、一个月 30 天；
3. 算出月消耗分钟数；
4. 对照免费额度 2000 分钟，算剩余百分比。

**记录：** 表格：单次耗时 / 每天次数 / 月总计 / 剩余额度。

**思考题：** 如果把 `on: push` 改成 `on: push: branches: [main]`，你的实际消耗会变成多少？为什么？

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说出 workflow / job / step / runner 各是什么，不用看课件
- [ ] 我知道 job 之间默认不共享文件，step 之间共享
- [ ] 我知道 `ubuntu-latest` 是一台"用完就扔"的机器
- [ ] 我知道 yml 放错位置时 GitHub 不会报错
- [ ] 我知道 `shell: /usr/bin/bash -e {0}` 里的 `-e` 是什么意思

## B. 实操

- [ ] 我的 `ci-lab` 是 **Private** 仓库，并且 clone 到了练手目录
- [ ] `.github/workflows/hello.yml` 有 `name` / `on` / `jobs` / `runs-on` / `steps`
- [ ] 我跑出过绿勾，并且点进去看过完整日志
- [ ] 我用了 `actions/checkout@v4`，看到过 `HEAD is now at ...`
- [ ] 我用了 `actions/setup-node@v4` + `cache: 'npm'`，看到过 `Cache hit`
- [ ] 我跑通过一次 `npm ci`
- [ ] 我用 `workflow_dispatch` 手动触发过至少一次

## C. 排错

- [ ] 我见过 `Invalid workflow file` + `You have an error in your yaml syntax on line N`
- [ ] 我见过 `Required property is missing: runs-on`
- [ ] 我见过 `can only install with an existing package-lock.json`
- [ ] 我知道怎么用 `grep -Pn "\t"` 找 Tab
- [ ] 我知道"绿勾但步骤数不对"意味着缩进错位
- [ ] 我知道路径错的时候**什么报错都没有**

## D. 交付

- [ ] `ci-lab` 仓库里至少有 4 次提交，提交信息说得清干了什么
- [ ] 没有把任何密钥写进 yml
- [ ] `.github/workflows/` 下没有多余的文件（比如 `.bak`）

## E. 笔记

- [ ] `NOTES.md` 填完，没有大片空白
- [ ] "我还不懂的词"写了至少 2 个
- [ ] 贴了自己真实的 `hello.yml` 内容

## 本节课要能说出口的一句话

> **一个 workflow 就是一个 yml 文件，里面写着若干个 job；每个 job 在一台临时的机器上按顺序跑若干 step；它放错目录不会报错，只会什么都不做。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| push 完 Actions 页面空的 | 目录不对（`.github/workflow` 少 s、不在根目录） | `git ls-files \| grep workflows` 自查 |
| `Invalid workflow file` + `yaml syntax on line N` | Tab 缩进 / 冒号后没空格 / 缩进层数错 | VS Code 开 `Render Whitespace`，`grep -Pn "\t"` |
| `Required property is missing: runs-on` | job 下没有 `runs-on` | 加 `runs-on: ubuntu-latest`，和 `steps` 同级 |
| `Unexpected value 'echo'` | 一个 step 写了两个 `run` | 用 `run: \|` 写多行 |
| `Unexpected value ''` 且位置在 `steps` | 减号缩进不对 | 减号比 `steps:` 多 2 空格 |
| 绿勾但我的命令没跑 | step 缩进错位被忽略了 | 点进 job 看步骤数 |
| `can only install with an existing package-lock.json` | 没有锁文件 | 本地 `npm install` 后提交 `package-lock.json` |
| `Cache not found for input keys` | 第一次跑，缓存还没存 | 正常，第二次才会命中 |
| `Failed to download action ...` | 网络不稳 | `Re-run all jobs`；减少 action 数量 |
| `Waiting for a runner to pick up this job...` 很久 | 排队 / 网络 | 等；免费额度高峰会排 |
| 分支上 push 不触发 | `on.push.branches` 没包含这个分支 | 改成 `pull_request` 触发，或加 `'feature/**'` |
| `workflow_dispatch` 按钮不出现 | yml 只在特性分支上 | 合并进默认分支后才有按钮 |
| 两个 job 里都找不到 `node_modules` | job 之间不共享文件 | 每个 job 都要自己 checkout + install |
| 日志里出现 `***` | GitHub 自动打码疑似密钥 | 不代表安全，去吊销那个密钥 |
| 一次 job 跑了很久 | 有交互式命令在等输入 | 加 `timeout-minutes: 10` |
