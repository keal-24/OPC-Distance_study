# 第 225 节课：密钥保护——泄露一次就够了

> 第 31 周你把 `.env` 建在了服务器上，第 32 周你配好了 HTTPS。
> 但那个 `.env` 里的 key，有没有在哪次 `git add -A` 里被你顺手带走？
> 这一节只做四件事：**数清钥匙、确认不在仓库、走一遍吊销、把服务器权限收紧。**

**建议用时**：120 分钟
**你需要先完成**：第 31 周的服务器部署（`pm2 list` 能看到应用）、第 32 周的域名与 HTTPS（浏览器能打开你的域名）

---

# 第 0 步：为什么密钥要单独上一节课（10 分钟）

## 0.1 你现在会什么

```text
把 key 写进 .env，代码里用 process.env 读
把 .env 写进 .gitignore
在服务器上手动建一份 .env
用 pm2 让应用一直跑着
```

**这四步都对。但它们只解决了"能用"，没解决"没漏"。**

## 0.2 你以后会遇到什么

```text
① 你在群里发了张"跑起来了"的截图，终端里 curl 的命令带着 key
② 赶进度写了 git add -A，那时 .gitignore 还没加 .env
③ 你把调模型的代码放到前端，想着"反正只是调个 API"
④ 客户问"你们的 key 安全吗"，你答不出"多久能停掉"
⑤ 你换了新 key，旧的那个忘了去后台删
```

**任何一件发生，后果都不是"网站挂一会儿"：**

```text
别人用你的 key 调模型     → 账单记在你头上
别人用你的 key 连数据库   → 数据被拖走
别人用你的 key 登服务器   → 服务器变成别人的机器
```

**而且你不会收到任何告警。** 账单月底才出来，数据丢了客户才会打电话。

## 0.3 今天要建立的三个概念

```text
① 密钥（secret）：一段"谁拿到谁就能冒充你"的字符串。
   它比密码更狠 —— 密码泄露你还能改，key 泄露的当下它已经生效了。

② 泄露面：key 可能流出去的所有路径。
   仓库、聊天记录、截图、前端打包文件、日志、崩溃上报、CI 输出。

③ 吊销（revoke）：在服务商后台把一把 key 作废。
   这是你唯一能止血的动作。删文件不是。
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的钥匙清单和演练记录 |
| `key-audit.md` | `03-练习代码` | 钥匙盘点表 + 应急卡 |
| `.env.example` | 你的项目根目录 | 只有字段名、没有值的模板 |

---

# 第 1 步：先数清楚你有几把钥匙（20 分钟）

## 1.1 为什么先列表再查代码

**在检查"有没有泄露"之前，得先知道"有哪些"。**

大部分人答不出"我有几把 key"。不是因为记性差，是因为 key 是**一点点攒起来的**：今天加模型，明天加短信，后天接支付。加的时候都顺手，从来没人整理。

**所以第一步不碰代码，只列表。**

## 1.2 建盘点文件

**操作：**

1. 打开本节 `03-练习代码/`；
2. 新建 `key-audit.md`；
3. 抄进这个表头，内容自己填。

```markdown
| 名称 | 在哪（文件/变量名） | 用途 | 泄露后果 | 在哪吊销 | 上次轮换 |
|---|---|---|---|---|---|
```

**⚠️ 表里只写"名称和位置"，绝不写 key 的值。** 写值的表本身就是新的泄露源。

## 1.3 照着这份清单一条条对

| 类别 | 常见变量名 | 泄露后会怎样 |
|---|---|---|
| 模型 API key | `OPENAI_API_KEY`、`DEEPSEEK_API_KEY` | 别人拿你的钱跑模型，一晚能烧掉一个月预算 |
| 数据库密码 | `DB_PASSWORD`、`DATABASE_URL` | 直接拖库：手机号、聊天记录、支付流水 |
| 会话签名密钥 | `JWT_SECRET`、`SESSION_SECRET` | 能伪造任意用户登录态，包括管理员 |
| 短信 / 邮件 | `SMS_KEY`、`SMTP_PASS` | 用你的账号发诈骗短信，钱你付，责任你担 |
| 支付密钥 | `STRIPE_SECRET`、`WXPAY_KEY` | 退款到自己账上、伪造支付成功 |
| 对象存储 | `OSS_ACCESS_KEY`、`S3_SECRET` | 删你全部文件，或把你这儿当免费图床 |
| 服务器凭据 | SSH 私钥、root 密码 | 服务器归别人，代码和数据都在上面 |
| 代码托管 token | `GITHUB_TOKEN`、`GH_PAT` | 改你的代码、删你的仓库、读私有库 |
| 第三方后台 | 各种 `APP_SECRET` | 以你的身份调他们的接口 |

**填完你会有一个反直觉的发现：**

```text
你以为只有 1 把（模型 key）。
实际数下来通常 5—8 把。
其中至少 2 把，你从来没想过"它也能被偷"。
```

## 1.4 "在哪吊销"这一栏怎么填

**这一栏最重要。** 它决定了出事时你花 3 分钟还是 3 天。

**做法：** 对每把 key 去后台找到"删除 / 禁用"那一页，把路径抄下来。界面会改版，**以你实际看到的为准**。

```text
模型服务        控制台 → API Keys → 找到那把 → Revoke / Delete
GitHub          Settings → Developer settings → Personal access tokens → Delete
腾讯云/阿里云   访问控制 → 访问密钥 → 禁用 / 删除
数据库          没有"吊销"，只能改密码，再改 .env 重启应用
SSH 密钥        服务器上删 ~/.ssh/authorized_keys 里那一行
```

**为什么必须写具体路径：** 出事时你是慌的。慌的时候在后台点错三次，key 就多活十分钟。**十分钟够一个脚本烧掉几十到几百块。**

---

# 第 2 步：确认 .env 不在仓库里（25 分钟）

## 2.1 这一步查两件事

```text
① 现在这个版本里，.env 有没有被 git 管着
② 历史里，.env 有没有出现过
```

**第二件比第一件重要得多。** 很多人只查了第一件就放心了。

## 2.2 先查"现在"

```bash
cd /b/OPC-Distance_study/项目/chat-app
git ls-files | grep -i env
```

**注意：** Git Bash 里盘符写成 `/b/...`，不是 `B:\...`。

**应该看到（干净的情况）：**

```text
.env.example
```

**看到 `.env`、`.env.local`、`.env.production`、`config/.env` 任何一个都是问题。**

**逐行读：**

| 输出 | 意思 | 要不要处理 |
|---|---|---|
| `.env.example` | 模板，只有字段名没有值 | ✅ 正常，应该提交 |
| `.env` | 真的密钥文件被跟踪了 | ❌ 立刻处理 |
| `.env.local` | 本地覆盖文件，通常带真值 | ❌ 立刻处理 |
| `config/.env` | 换个目录藏起来而已 | ❌ 立刻处理 |

**为什么 `.env.example` 该提交：** 它告诉后来的人"需要哪几个变量"，但不告诉他值。

```bash
# .env.example —— 只有名字，没有真值
OPENAI_API_KEY=sk-test-xxxx
DB_PASSWORD=change-me
JWT_SECRET=change-me
```

## 2.3 再查它有没有真的被忽略

```bash
git check-ignore -v .env
```

**应该看到：**

```text
.gitignore:3:.env	.env
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `.gitignore:3:` | 命中的是 `.gitignore` 第 3 行 |
| `.env` | 那一行的规则 |
| 最后的 `.env` | 被挡住的文件 |

**如果什么都不输出**，说明没被忽略。**这是运气，不是安全** —— 下一次 `git add -A` 就带走了。

## 2.4 查历史：这一步才是关键

```bash
git log --all --oneline -- .env
```

**干净：什么都不输出。有问题：**

```text
9a1b2c3 add env
4d5e6f7 初始化项目
```

**逐行读：**

| 片段 | 意思 |
|---|---|
| `9a1b2c3` | 提交哈希（前 7 位） |
| `add env` | 那次提交的说明 |
| `--all` | 查所有分支，不只当前分支 |
| `-- .env` | 只看这个路径 |

**⚠️ `--all` 不能省。** 你曾在某个分支提交过、后来把分支删了，那个提交还在 `objects` 里，`--all` 查得到，不带可能查不到。

## 2.5 把内容打出来

```bash
git log --all -p -- .env
```

**应该看到（真提交过一次的样子）：**

```text
commit 9a1b2c3d4e5f60718293a4b5c6d7e8f901234567
Author: 测试 <test@example.com>
Date:   Tue Sep 9 10:12:31 2025 +0800

    add env

diff --git a/.env b/.env
new file mode 100644
index 0000000..4a5b6c7
--- /dev/null
+++ b/.env
@@ -0,0 +1,3 @@
+OPENAI_API_KEY=sk-test-xxxx
+DB_PASSWORD=test-password-123
+JWT_SECRET=dev-secret
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `commit 9a1b2c3...` | 这次提交的完整哈希 |
| `Date: Tue Sep 9 ...` | **什么时候提交的 —— 这决定了"泄露了多久"** |
| `new file mode 100644` | 当时是新建，权限 644（所有人可读） |
| `--- /dev/null` | 之前没有这个文件 |
| `+++ b/.env` | 之后有了 |
| `+OPENAI_API_KEY=...` | **这一行就是泄露的 key 本身** |

```text
任何人 clone 你的仓库，跑一条 git log -p -- .env，
就能把这几行原样打出来。不需要工具，不需要技术。
```

**这就是"进过 git 就等于永久泄露"。不是"可能泄露"，是"任何人现在就能拿到"。**

## 2.6 别只看 `.env` 这三个字

```bash
git log --all --diff-filter=A --name-only --pretty=format: | sort -u | grep -iE "env|secret|credential|key"
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `--diff-filter=A` | 只看"新增文件"的变更（A = Added） |
| `--name-only` | 只列文件名 |
| `--pretty=format:` | 不要提交信息 |
| `grep -iE "..."` | 筛出可疑名字 |

**正常只应该有 `.env.example`。** 看到 `backup.env`、`.env.bak`、`config.prod.json`、`credentials.json` 都要单独查。

**为什么：** 备份文件、"我就临时放一下"的文件是泄露重灾区。**它们通常不在 `.gitignore` 里，因为写 `.gitignore` 时还没想到会有它们。**

---

# 第 3 步：扫代码里的硬编码（20 分钟）

## 3.1 在源码里搜

```bash
git grep -n "sk-"
```

**应该看到（有问题）：**

```text
server.js:12:  apiKey: "sk-test-xxxx",
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `server.js` | 哪个文件 |
| `12` | 第几行 |
| `apiKey: "sk-test-xxxx",` | **key 就写在这里，明文** |

**为什么用 `git grep` 不用 `grep -r`：** 它只搜被 git 跟踪的文件，自动跳过 `node_modules`。`grep -r` 能搜出几万行噪音。

```bash
git grep -nE "(sk-|ghp_|AKIA|xoxb-)"
git grep -nE "(api[_-]?key|secret|password|token)[\"']?\s*[:=]\s*[\"'][^\"']{6,}"
```

**四条前缀分别是：** 模型服务的 key、GitHub 令牌、AWS 密钥、Slack 令牌。第二条是找"名字 = 一个不算短的字符串"的形状，不精确但能捞出大部分手滑。

**应该看到：**

```text
server.js:12:  apiKey: "sk-test-xxxx",
config.js:4:  const JWT_SECRET = "dev-secret",
scripts/send-sms.js:7:  const password = "test-password-123",
```

## 3.2 搜历史里的 key

**当前干净，不代表历史上没有。**

```bash
git log -S "sk-test-xxxx" --oneline --all
```

**应该看到（有问题）：**

```text
9a1b2c3 加上模型调用
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `-S "sk-test-xxxx"` | 找"这个字符串出现次数发生变化"的提交（叫 pickaxe） |
| `--oneline` | 每个提交一行 |
| `--all` | 所有分支 |

**为什么用 `-S`：** key 是**精确的一段字符串**，你知道它长什么样，直接找它最准。

## 3.3 查前端产物（最容易被忽略）

```text
浏览器要执行你的 JS，就必须把完整源码下载到本地。
用户按 F12 → Sources，或者右键"查看网页源代码"，全都在那儿。
"压缩"只是把变量名变短，字符串还是原样的。
```

```bash
grep -rn "sk-" public/ 2>/dev/null
```

**应该看到（有问题）：**

```text
public/app.js:1:const K="sk-test-xxxx";fetch("/v1/chat",{headers:{Authorization:"Bearer "+K}})
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `public/` | 会被 Nginx 当静态文件直接发给浏览器的目录 |
| `public/app.js:1` | 打包后压成了一行 |
| `const K="sk-test-xxxx"` | **key 明文在客户端代码里** |

**为什么这比提交进 git 更糟：**

```text
进 git：要有人 clone 你的仓库才拿得到（大概率是协作者）
进前端：任何一个打开你网站的人，F12 就能拿到
```

**正确做法只有一条：** 前端永远不碰 key。前端调你的后端，后端拿 key 调模型，后端把结果返回。

**如果你现在就是这样写的，别急着改代码结构。** 先按第 4 步吊销，再改。**顺序不能反。**

## 3.4 改回 `.env` 的写法

**反例：**

```js
const apiKey = "sk-test-xxxx";
const client = new OpenAI({ apiKey });
```

**正例：**

```js
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

**两份文件长得像，意义完全不同：**

| 文件 | 提交吗 | 里面的值 |
|---|---|---|
| `.env` | ❌ 不提交 | 真的 key |
| `.env.example` | ✅ 提交 | 占位符 `sk-test-xxxx` |

**为什么模板里的值也要写成占位符：** 有人会直接 `cp .env.example .env` 然后忘了改。**模板里看着像真的，他就真的用上了。**

## 3.5 启动时检查：缺变量就崩

```js
const REQUIRED = ["OPENAI_API_KEY", "DB_PASSWORD", "JWT_SECRET"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("缺少环境变量：" + missing.join(", "));
  process.exit(1);
}
```

**应该看到（忘了配时）：**

```text
缺少环境变量：JWT_SECRET
```

**然后进程退出，`pm2 list` 里状态变 `errored`。**

**为什么不检查更糟：** 服务起来了，第一个用户调模型时报 401，你会以为是模型服务挂了，查半小时。**宁可起不来，也别带着坏配置对外服务。**

---

# 第 4 步：泄露演练——真走一遍吊销（25 分钟）

## 4.1 顺序：先吊销，再换，最后清代码

```text
① 吊销（revoke）   —— 后台作废旧 key，让它立刻失效
② 换（rotate）     —— 生成新 key，写进 .env，重启应用
③ 清（clean）      —— 删代码里的 key、清 git 历史
```

**为什么不能先清代码：**

```text
你删本地文件时，攻击者手里那份还在有效。
你跑 filter-repo 折腾半小时时，攻击者还在用。
你清完历史松了口气时，账单还在涨。
```

**清代码是"防止下次再泄露"，吊销是"止住这次的血"。止血永远第一。**

**⚠️ 演练只对"你自己刚建的一把测试 key"做。**

## 4.2 造一把测试 key

**操作：** 打开模型服务控制台 → 新建 key → 命名 `drill-2026-11-16` → 写进临时的 `.env.drill`。

```bash
echo 'OPENAI_API_KEY=sk-test-xxxx' > .env.drill
```

**为什么命名要带用途和日期：**

```text
三个月后你看到 drill-2026-11-16，
立刻知道它是什么、什么时候建的、能不能删。
叫 test 的 key 你永远不敢删，因为不知道还有没有代码在用。
```

**命名规范：** `<用途>-<环境>-<年月>`，比如 `chat-prod-202611`、`chat-dev-202611`。

## 4.3 先验证它是活的

```bash
export TEST_KEY="sk-test-xxxx"
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.openai.com/v1/models \
  -H "Authorization: Bearer $TEST_KEY"
```

**应该看到：**

```text
200
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `curl` | 命令行发 HTTP 请求，Windows 10 以后自带 |
| `-s` | 安静模式，不打进度条 |
| `-o /dev/null` | 丢掉响应正文，只留状态码 |
| `-w "%{http_code}\n"` | 只打印状态码 |
| `-H "Authorization: Bearer ..."` | 加请求头，把 key 带上 |

**为什么用 `export` 而不是把 key 写在命令里：** 命令行会进 shell 历史，`history | grep Bearer` 就能翻出完整 key。演练完记得 `unset TEST_KEY`。

## 4.4 去后台吊销，然后验证

**操作：** API Keys 页面 → 找到 `drill-2026-11-16` → `Revoke` / `Delete` → 确认。

**再跑一次 4.3 的 `curl`。**

**应该看到：**

```text
401
```

**逐行读状态码：**

| 状态码 | 意思 | 说明什么 |
|---|---|---|
| `200` | 成功 | ❌ 吊销没生效，或你测的是另一把 |
| `401` | 未授权 | ✅ 这把 key 已经不能用了 |
| `429` | 限流 | ⚠️ **key 还有效**，只是打太快被限了 |

**特别注意 `429`：** 它经常骗人。你以为"报错就是失效"，其实 key 还活着。**看到 401 才算演练通过。**

**现实中的差异：** 叫法不一样（Revoke / Delete / Disable / 禁用），生效时间不一样（一秒到几分钟），有的能恢复有的不能。**保守做法：能禁用就先禁用，观察一天再删。**

## 4.5 换新 key 并让应用用上

**⚠️ 新 key 只显示一次。** 关掉弹窗就再也看不到，只能重建。

```bash
ssh root@47.98.xx.xx
cd /srv/app
nano .env
```

改成 `OPENAI_API_KEY=sk-test-newkey`。**nano 五个键：** 直接打字，`Ctrl + O` 保存，`Enter` 确认，`Ctrl + X` 退出。

```bash
pm2 restart chat-app --update-env
curl -s https://your-domain.com/health
```

**应该看到：**

```text
[PM2] [chat-app](0) ✓
{"ok":true,"model":"connected"}
```

**`--update-env` 为什么不能省：** 不加它，pm2 可能沿用启动时记下的旧环境变量。**你以为换了 key，进程里还是旧的 —— 旧 key 已吊销，于是全站 401。**

**返回 `{"ok":false,"error":"401"}` 怎么办：** 先确认 `.env` 改对了，再 `pm2 restart --update-env`，还不行就 `pm2 delete` 后重新 `start`。

## 4.6 记录耗时

**在 `key-audit.md` 里补：**

```markdown
| 动作 | 结果 | 耗时 |
|---|---|---|
| 吊销 drill-2026-11-16 | 旧 key 返回 401 | 3 分钟 |
| 换新 key + 重启 | /health 返回 ok | 6 分钟 |
| 从发现到恢复 | | 9 分钟 |
```

**这个"耗时"是本节最有价值的数字。**

```text
9 分钟  = 真出事时，损失上限约 9 分钟的调用量
9 小时  = 后台找不到按钮、忘了改服务器、重启没加 --update-env
```

**第一次演练通常要 20—40 分钟。练到 10 分钟以内，才算流程通了。**

---

# 第 5 步：清历史——能清，但要假设已泄露（25 分钟）

## 5.1 先明确态度

```text
清历史的目的不是"消除泄露"，是"防止以后有人再翻出来"。
因为在你清之前，可能已经有人 clone 过了。
clone 过的那份，你永远收不回来。
```

**顺序永远是：先吊销（假设已泄露）→ 再清历史（减少二次泄露面）。**

**⚠️ 下面这条命令会重写整个仓库历史，所有提交哈希都会变。做之前必须备份。**

```bash
cd /b/OPC-Distance_study/项目
git clone --mirror chat-app chat-app-backup.git
```

**应该看到：**

```text
Cloning into bare repository 'chat-app-backup.git'...
done.
```

**`--mirror` 是"连所有分支、tag、远程引用一起复制"，最完整的备份方式。** 恢复时 `git clone chat-app-backup.git 恢复目录`。

## 5.2 装 git-filter-repo

**它不是 git 自带的。**

```bash
pip install git-filter-repo
git filter-repo --version
```

**应该看到（版本号会不同）：**

```text
2.45.0
```

**报 `git: 'filter-repo' is not a git command`：** 装上了但不在 PATH。试 `python -m git_filter_repo --version`；还不行按官方文档装单文件版，**以你实际环境为准**。

**为什么不教 `git filter-branch`：** 官方已标注不推荐，慢，而且容易出错。filter-repo 能做的事它都能做，快十倍。

## 5.3 执行清理

```bash
pwd
git filter-repo --path .env --invert-paths
```

**`pwd` 应该在 `/b/OPC-Distance_study/项目/chat-app`。**

**清理应该看到：**

```text
Parsed 24 commits
New history written in 0.31 seconds; now repacking/cleaning...
HEAD is now at 7c8d9e0 修改首页文案
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Parsed 24 commits` | 扫了 24 个提交 |
| `New history written in 0.31 seconds` | 重写完，用时 0.31 秒 |
| `HEAD is now at 7c8d9e0` | 新 HEAD（**哈希变了**） |

**逐段读命令：**

| 片段 | 意思 |
|---|---|
| `--path .env` | 选中 `.env` 这个路径 |
| `--invert-paths` | **反过来**：除了它，其它都保留 |

**`--invert-paths` 是"排除"。** 不加它，效果变成"只保留 `.env`"，整个项目就没了。

**⚠️ 这个命令还会删掉 `origin` 远程**（防你手滑推上去）。要加回来：

```bash
git remote add origin https://github.com/你的账号/chat-app.git
git remote -v
```

**应该看到：**

```text
origin  https://github.com/你的账号/chat-app.git (fetch)
origin  https://github.com/你的账号/chat-app.git (push)
```

## 5.4 验证并强制推送

```bash
git log --all --oneline -- .env
git log --all -S "sk-test-xxxx" --oneline
```

**两条都应该什么都不输出。**

| 命令 | 查什么 |
|---|---|
| `git log -- .env` | 这个**路径**还在不在历史里 |
| `git log -S "sk-..."` | 这个**字符串**还在不在历史里 |

**第一条空、第二条有，说明 key 写在了别的文件名里（比如 `config.js`）。**

```bash
git push --force origin main
```

**应该看到：**

```text
+ 7c8d9e0...9a1b2c3 main -> main (forced update)
```

**`+` 开头表示强制覆盖，`(forced update)` 是服务端确认。**

**⚠️ 后果：**

```text
① 已 clone 过的人再 pull 会冲突或分叉，必须重新 clone
② 旧提交仍可能在别人本地、在 fork 里、在平台缓存里
③ 所以这一步永远在"已经吊销"之后做，不是用来代替吊销
```

**有协作者就先通知：** "我要重写 main 历史（清掉一个误提交的密钥）。你那边先不要 push，等我推完你重新 clone。"

## 5.5 加一道闸：pre-commit 钩子

**建 `.git/hooks/pre-commit`：**

```bash
#!/bin/sh
if git diff --cached --name-only | grep -qE '(^|/)\.env($|\.)'; then
  echo "❌ 拒绝提交：检测到 .env 相关文件"
  exit 1
fi
```

```bash
chmod +x .git/hooks/pre-commit
```

**⚠️ Windows 的坑：** 文件是 CRLF 时钩子可能不执行，报 `cannot spawn`。用 `dos2unix` 转 LF，或者 VS Code 右下角改成 `LF` 再保存。

**验证（`.env` 已被忽略，所以要 `-f` 强行加）：**

```bash
echo 'X=1' > .env
git add -f .env
git commit -m "试试"
```

**应该看到：**

```text
❌ 拒绝提交：检测到 .env 相关文件
```

**这说明"即使强行 add，也过不了这一关"。** 测完清理：`git reset HEAD .env && rm .env`。

---

# 第 6 步：服务器上的 .env 要收紧（20 分钟）

## 6.1 先看现在的权限

```bash
ssh root@47.98.xx.xx
cd /srv/app
ls -l .env
```

**应该看到（默认，危险）：**

```text
-rw-r--r-- 1 root root 168 Nov 16 09:12 .env
```

**逐位读 `-rw-r--r--`：**

| 位置 | 字符 | 意思 |
|---|---|---|
| 第 1 位 | `-` | 普通文件（`d` 是目录） |
| 2—4 位 | `rw-` | **属主**：可读可写 |
| 5—7 位 | `r--` | **属组**：可读 |
| 8—10 位 | `r--` | **其他人**：可读 |

**问题在最后三位 `r--`。** 这台机器上任何用户都能 `cat .env`。

## 6.2 改成 600 并验证

```bash
chmod 600 .env
ls -l .env
sudo -u www-data cat /srv/app/.env
```

**应该看到：**

```text
-rw------- 1 root root 168 Nov 16 09:12 .env
cat: /srv/app/.env: Permission denied
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `-rw-------` | 只有属主能读写，属组和其他人什么都不行 |
| `sudo -u www-data` | 以 Nginx 的工作用户身份执行 |
| `Permission denied` | **被拒，正是我们要的** |

**为什么是 600 不是 400：** 600 属主还能改（换 key 时要改）。400 只能读，改要先 `chmod`，紧急换 key 时多卡一下。

**为什么用 `www-data` 测：** 那是 Nginx 的工作用户。**Nginx 能读到的文件，就有可能被它以静态文件形式发出去。**

## 6.3 让 Nginx 根本不发 `.env`

**即使权限对了也要加这道。** 因为你以后可能 `chmod -R 755`，或者换个部署方式。

```bash
nano /etc/nginx/sites-available/default
```

**在 `server { ... }` 里加：**

```nginx
location ~ /\.(?!well-known) {
    deny all;
    return 404;
}
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `location ~` | 用正则匹配 URL 路径 |
| `/\.` | 匹配"斜杠后面紧跟一个点" |
| `(?!well-known)` | 但排除 `/.well-known/`（证书验证要用） |
| `deny all;` | 拒绝所有来源 |
| `return 404;` | 返回 404（不是 403） |

**为什么返回 404 而不是 403：** 403 等于告诉扫描器"这里有东西"，404 等于"这里什么都没有"。**这叫"不泄露存在性"，第 227 节还会再用到。**

```bash
nginx -t
systemctl reload nginx
```

**应该看到：**

```text
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**`reload` 本身不输出内容。** 确认：

```bash
systemctl status nginx --no-pager | head -3
```

**应该看到 `Active: active (running)`。**

## 6.4 从外网验证

**回到你自己的 Windows（Git Bash）：**

```bash
curl -I https://your-domain.com/.env
```

**应该看到：**

```text
HTTP/2 404 
server: nginx/1.24.0
content-type: text/html
```

**逐行读：**

| 行 | 意思 | 说明什么 |
|---|---|---|
| `HTTP/2 404` | 找不到 | ✅ 挡住了 |
| `server: nginx/1.24.0` | 服务器软件和版本 | ⚠️ 把版本号告诉了全世界 |
| `content-type: text/html` | 返回错误页 | 不是文件内容 |

**如果看到 `HTTP/2 200` 加 `content-length: 168`，就是没挡住 —— 全世界都能下载你的密钥。** 处理顺序：

```text
① 立刻吊销 .env 里所有 key（不是先改 Nginx）
② 再改 Nginx 配置
③ 再换 key
```

**顺手关掉版本号：** 在 `server {}` 里加 `server_tokens off;`，`nginx -t` 后 `reload`。

```bash
curl -I https://your-domain.com/.env | grep -i server
```

**应该看到：**

```text
server: nginx
```

## 6.5 确认应用还能读到 .env

**权限改完必须验证应用没坏 —— 最容易忘的一步。**

```bash
pm2 restart chat-app --update-env
pm2 describe chat-app | grep -E "exec cwd|script path"
```

**应该看到：**

```text
exec cwd        │ /srv/app
script path     │ /srv/app/server.js
```

**`exec cwd` 不是 `/srv/app` 的话**，`dotenv` 会在错的目录找 `.env`，日志里出现 `缺少环境变量`：

```bash
pm2 delete chat-app
pm2 start server.js --name chat-app --cwd /srv/app
pm2 save
```

**`pm2 save` 不能忘**，否则重启服务器后它又回到旧配置。

---

# 第 7 步：把这件事变成规矩（15 分钟）

## 7.1 三份文件各司其职

```text
.env            真的值，不提交，权限 600
.env.example    字段名，提交，值全是占位符
key-audit.md    钥匙清单，不提交，只写名字不写值
```

**`.gitignore` 里至少这四行：**

```bash
.env
.env.*
!.env.example
key-audit.md
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `.env` | 忽略这个文件 |
| `.env.*` | 忽略 `.env.local`、`.env.production` 等 |
| `!.env.example` | **例外**：模板要提交（`!` 表示"不忽略"） |
| `key-audit.md` | 盘点表也不提交 |

**顺序很重要：** `!.env.example` 必须写在 `.env.*` 后面，**git 后匹配的规则覆盖前面的**。

```bash
git check-ignore -v .env.local .env.example
```

**应该看到：**

```text
.gitignore:2:.env.*	.env.local
```

**`.env.example` 没出现在输出里 —— 这正是对的。**

## 7.2 一把 key 只干一件事

**反例：** 一个 `OPENAI_API_KEY` 同时用于生产、本地开发、跑批脚本、客户 demo。

**结果是你不敢吊销它** —— 一吊销四个地方全挂。**于是你就拖着，拖到账单出来。**

**正例：**

```text
chat-prod-202611     生产
chat-dev-202611      本地开发（额度上限设低）
chat-batch-202611    批量任务
chat-demo-202611     演示
```

**好处：** 泄露只吊销一把；每把能单独设额度；账单能按用途拆开看。

## 7.3 写一张应急卡

```markdown
## 密钥泄露应急卡

1. 判断是哪一把：看账单异常 / 调用日志 / 告警
2. 去后台吊销（路径见盘点表）
3. 立刻验证：curl 应返回 401
4. 生成新 key，命名带日期
5. 服务器改 /srv/app/.env
6. pm2 restart chat-app --update-env
7. curl /health 确认 ok
8. 查账单，看被用了多少
9. 查访问日志，确认没有别的异常
10. 清硬编码、清历史、加 pre-commit 钩子
11. 记一笔：何时、哪一把、多久恢复
```

**第 9 步为什么重要：**

```text
key 泄露往往不是单独发生的。
攻击者拿到 key，通常是因为先拿到了别的 —— 服务器、GitHub、你的电脑。
只换 key 不清入口，等于换了锁但人还在屋里。
```

```bash
tail -n 200 /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head
```

**应该看到：**

```text
    482 47.98.xx.xx
     37 114.114.xx.xx
      9 220.181.xx.xx
```

**逐段读：**

| 片段 | 意思 |
|---|---|
| `awk '{print $1}'` | 取每行第一列（客户端 IP） |
| `sort \| uniq -c` | 排序并计数 |
| `sort -rn \| head` | 按次数倒序，取前 10 |

**第一个通常是你自己或监控探针。陌生 IP 出现几百次且连续请求 → 值得看一眼它请求了什么：**

```bash
grep "114.114.xx.xx" /var/log/nginx/access.log | tail -50
```

## 7.4 定期轮换

| key 类型 | 建议周期 | 理由 |
|---|---|---|
| 模型 API key | 90 天 | 损失可控，太勤容易忘 |
| 数据库密码 | 180 天 | 换密码要停机，成本高 |
| `JWT_SECRET` | 不轻易换 | 一换所有用户掉线 |
| 服务器 SSH 密钥 | 1 年 | 换了要重新分发公钥 |

**`JWT_SECRET` 为什么特殊：** 它不调外部服务，只用来签名。**换掉它 = 之前签发的 token 全部失效 = 所有人被登出。**

**怀疑泄露时不要过渡，直接换。** 因为泄露意味着别人能伪造**任意用户**（含管理员）的登录态。**这时"用户体验"要让位于"止血"。**

---

# 第 8 步：故意犯五个错（30 分钟）

## 错误 1：`.gitignore` 写晚了

**操作：** 先 `git init` → 不建 `.gitignore` → 建 `.env` → `git add -A && git commit -m "初始化"` → 才建 `.gitignore`。

**会怎样：**

```text
[main (root-commit) 3f2a1b0] 初始化
 2 files changed, 4 insertions(+)
 create mode 100644 .env
 create mode 100644 server.js
```

**为什么：** `git add -A` 会把**所有未被忽略的文件**加进暂存区。在你写 `.gitignore` 之前，`.env` 就是"未被忽略"的。

**这就是最真实的泄露场景：不是有人故意提交，是"顺序错了"。**

**怎么修：**

```bash
git rm --cached .env
echo ".env" >> .gitignore
git add .gitignore
git commit -m "移除 .env 并加入忽略"
```

**怎么验证补住了：**

```bash
git ls-files | grep -i env
```

**应该什么都不输出。但紧接着必须查历史：**

```bash
git log --all --oneline -- .env
```

**会看到 `3f2a1b0 初始化`。这说明 `git rm --cached` 只治了最新版本，历史里那份还在。** 要治只能走第 5 步，而且**前提是 key 已经吊销**。

## 错误 2：以为删掉文件就安全了

**操作：** 接着上面，`rm .env` → `git add -A && git commit -m "删掉 env"`。

**会怎样：**

```text
[main 8b9c0d1] 删掉 env
 1 file changed, 3 deletions(-)
 delete mode 100644 .env
```

**看起来干净了。** `ls` 也没有这个文件。你以为结束了。

```bash
git show HEAD~1:.env
```

**应该看到：**

```text
OPENAI_API_KEY=sk-test-xxxx
DB_PASSWORD=test-password-123
JWT_SECRET=dev-secret
```

**逐段读：** `git show` 显示某个对象内容，`HEAD~1` 是上一个提交，`:.env` 是那个提交里的路径。

**为什么：** Git 存的是"每个版本的完整快照"。你"删掉"只是新增了一个"没有 `.env`"的快照，**上一个快照完好地躺在 `objects` 里**。

**这就是第 4 周讲的"提交是快照"，现在你知道它的安全含义了。**

**怎么修：** 先吊销 → `git filter-repo --path .env --invert-paths` → 强制推送。

**怎么验证补住了：**

```bash
git show HEAD~1:.env
```

**应该看到：**

```text
fatal: path '.env' exists on disk, but not in 'HEAD~1'
```

**总之拿不出来了。**

## 错误 3：key 硬编码在代码里

**操作：**

```js
const client = new OpenAI({ apiKey: "sk-test-xxxx" });
```

**会怎样：** 本地跑得好好的，你以为没问题，然后 `git push`，全世界都能 clone。

**为什么比 `.env` 泄露更隐蔽：** `.env` 泄露是一个文件，查一下就知道；硬编码藏在 3000 行里的某一行，你永远想不起来搜。

**怎么查：**

```bash
git grep -nE "sk-[A-Za-z0-9_-]{8,}"
```

**应该看到：**

```text
server.js:3:const client = new OpenAI({ apiKey: "sk-test-xxxx" });
```

**怎么修：** 改成 `process.env.OPENAI_API_KEY`。

**怎么验证补住了：**

```bash
git grep -nE "sk-[A-Za-z0-9_-]{8,}"
```

**剩下 `.env.example:1:OPENAI_API_KEY=sk-test-xxxx` 是允许的。** 判断标准：在 `.env.example` 里是占位符，在 `.js` / `.html` 里是真硬编码。

## 错误 4：把 key 打进前端

**操作：** 在 `public/app.js` 里写：

```js
const KEY = "sk-test-xxxx";
fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
  body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }),
});
```

**会怎样：** 打开页面 → F12 → Network → `app.js` → Response，你看到完整一行 `const KEY="sk-test-xxxx"...`。

**用命令行也能拿到：**

```bash
curl -s https://your-domain.com/app.js | grep -o "sk-[A-Za-z0-9_-]*"
```

**应该看到：**

```text
sk-test-xxxx
```

**一个陌生人不打开浏览器，一条命令就拿到了。**

**为什么压缩救不了：** 压缩只改结构，**字符串常量必须原样保留**，否则代码不能用。

**怎么修：** 把调模型移到后端。

```js
// 后端
app.post("/api/chat", requireLogin, async (req, res) => {
  const r = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: req.body.message }],
  });
  res.json({ reply: r.choices[0].message.content });
});
```

```js
// 前端：只带用户的话，不带 key
await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "hi" }),
});
```

**怎么验证补住了：**

```bash
curl -s https://your-domain.com/app.js | grep -c "sk-"
```

**应该看到 `0`。** `grep -c` 是"数有几行匹配"。

## 错误 5：`.env` 权限 644，Nginx 能直接下载

**操作：** `chmod 644 /srv/app/.env`，站点根目录不小心配成 `/srv/app`，然后浏览器访问 `/.env`。

**会怎样：** 浏览器直接显示 `.env` 的全部内容，没有任何提示。

**为什么：** Nginx 的任务就是"把 root 下文件发给访问者"，**它不判断文件敏不敏感**。你把 `.env` 放进 web 根目录，等于放进公共下载区。

**怎么修（三件一起）：**

```bash
chmod 600 /srv/app/.env
grep -n "root " /etc/nginx/sites-available/default
```

**应该看到：**

```text
root /srv/app/public;
```

**如果是 `root /srv/app;`，那 `.env`、`server.js`、`package.json` 全可能被下载。** 再按 6.3 加 `location ~ /\.` 规则。

**怎么验证补住了：**

```bash
curl -I https://your-domain.com/.env
curl -I https://your-domain.com/server.js
```

**两个都应该是 `HTTP/2 404`。** 如果 `server.js` 是 200，说明整个项目根都暴露了 —— 比 `.env` 泄露还严重。

**顺手检查一个同类问题：`console.log(process.env)` 会把所有 key 打进日志。** 日志默认 644，会上传到你接的日志服务，你还会把它贴到群里问人。改成只打 `req.method`、`req.path`、`req.ip` 三个字段，然后跑 `pm2 logs chat-app --lines 100 --nostream | grep -c "sk-"`，应该得到 `0`。（完整的日志脱敏在第 230 节。）

---

# 第 9 步：写学习笔记（10 分钟）

```markdown
# 第 225 节课学习笔记

## 一、我数出来几把钥匙

| 名称 | 在哪 | 泄露后果 | 在哪吊销 |
|---|---|---|---|
| | | | |

## 二、为什么"先吊销，再清代码"（三句话内）

## 三、我查 .env 历史用的三条命令

`git log --all --oneline -- .env` 在我项目里的输出是：

## 四、两个命令的区别

| | git rm --cached | git filter-repo |
|---|---|---|
| 改了最新版本吗 | | |
| 改了历史吗 | | |
| 要不要强制推送 | | |
| 哈希会变吗 | | |

## 五、吊销演练记录

- 测试 key 的名字：
- 吊销后 curl 状态码：
- 从"决定吊销"到"应用恢复"用了：
- 卡在哪一步：

## 六、服务器权限

`ls -l .env` 改之前 / 之后：

`sudo -u www-data cat /srv/app/.env` 的输出：

`curl -I https://your-domain.com/.env` 的状态码：

## 七、两个"看起来安全其实不安全"的做法

## 八、五个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| .gitignore 写晚了 | | |
| 删文件以为安全 | | |
| key 硬编码 | | |
| key 进前端 | | |
| .env 权限 644 | | |

## 九、我还不懂的词

## 十、完成检查

- [ ] 钥匙清单填完
- [ ] `git ls-files | grep -i env` 只有 `.env.example`
- [ ] `git log --all --oneline -- .env` 是空的
- [ ] 亲手吊销过一把 key，验证返回 401
- [ ] 服务器 `.env` 是 600
- [ ] `curl -I /.env` 返回 404
```

---

# 第 10 步：课后练习

## 练习一：给全部项目做密钥体检

**要求：** 找出你电脑上所有用过的项目（至少 3 个），每个都跑：

```bash
git ls-files | grep -i env
git log --all --oneline -- .env
git grep -nE "sk-[A-Za-z0-9_-]{8,}"
```

**记录：** 几个项目有历史泄露？几个有硬编码？

**思考题：** 某个项目三个月前提交过 `.env`，但里面的 key 你后来换过 —— 还需要处理吗？

**提示：** 想想"当时那把"和"换成的那把"分别从什么时候开始生效。

## 练习二：写自己的 pre-commit 钩子

**要求：**

1. 不只拦 `.env`，还要拦文件名含 `secret` / `credential` / `password` 的，以及内容匹配 `sk-` / `ghp_` / `AKIA` 的；
2. 用 `git diff --cached` 拿到待提交文件列表；
3. 写进 `.git/hooks/pre-commit`。

**记录：** 你的钩子拦住了几个真实文件？

**思考题：** 钩子只在本地生效。别人 clone 之后没有这个钩子，怎么办？

**提示：** 想想 `.git/hooks` 会不会被提交。

## 练习三：把应急卡压到 60 秒能读完

**要求：** 现在是 11 步，压到 6 步以内，每步一行，能贴在显示器边上；但不能丢掉"先吊销"和"验证 401"。

**记录：** 你删了哪几步？为什么可以删？

**思考题：** 如果泄露发生在凌晨 2 点，你只记得住三步，你记哪三步？

## 练习四：算一次"泄露一晚"的成本

**要求：**

1. 查你用的模型服务当前单价（官网，**价格会变**）；
2. 假设攻击者连续跑 8 小时，每秒 5 个请求，每次输入 1000 token、输出 300 token；
3. 算出总 token 和总费用。

**记录：** 这个数字和你一个月服务器费用比，是什么比例？

**思考题：** 如果这个数字让你心疼，"90 天轮换"值不值得？

## 练习五：用一句话说给客户听

**要求：** 写 100 字以内，回答客户："你们把 API key 放在哪里？如果泄露了怎么办？"

**记录：** 写了几版才写顺？

**思考题：** 哪一句是客户最想听的？

**提示：** 客户不关心技术，他关心"我的数据会不会被人看到"和"你会不会及时处理"。

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清"密钥"和"密码"的区别
- [ ] 我能说出至少 5 个泄露面（仓库、前端、日志、截图、CI 输出……）
- [ ] 我知道"进过 git 就是永久泄露"，能说出为什么
- [ ] 我知道吊销和清历史的先后，能说出反了会怎样
- [ ] 我知道 `.env` 和 `.env.example` 的区别，为什么后者要提交

## B. 实操

- [ ] 我用 `git ls-files | grep -i env` 查过当前文件
- [ ] 我用 `git log --all -p -- .env` 看过历史里的 key
- [ ] 我用 `git grep` 扫过硬编码，也扫过前端产物
- [ ] 我亲手吊销过一把 key，`curl` 验证返回 401
- [ ] 我在备份过的仓库上跑过 `git filter-repo`，验证历史为空
- [ ] 我把服务器 `.env` 改成 600，用 `sudo -u www-data` 验证
- [ ] 我加了 Nginx 拒绝规则，`curl -I` 验证 404
- [ ] 我加了 pre-commit 钩子，验证能拦 `git add -f .env`

## C. 排错

- [ ] `filter-repo: command not found` 我知道怎么处理
- [ ] 强制推送被拒时，我知道漏了哪一步
- [ ] `pm2 restart` 后还是 401，我知道要加 `--update-env`
- [ ] `curl -I /.env` 返回 200 时，我知道第一步是吊销
- [ ] 钩子不执行时，我知道可能是 CRLF 或权限

## D. 交付

- [ ] `key-audit.md` 有 5 把以上的 key
- [ ] 每把都写了"在哪吊销"
- [ ] 应急卡 6 步以内，第一步是吊销
- [ ] 演练记录里有耗时数字
- [ ] `.env.example` 已提交，`.env` 没提交

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] "我还不懂的词"有内容
- [ ] 卡住的地方写了真实卡点

## 本节课要能说出口的一句话

> **密钥一旦进过 Git，就等于已经公开了；出事时先吊销，再换，最后才清代码 —— 顺序反了，你换的锁还是那把旧钥匙。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `git check-ignore -v .env` 没输出 | `.gitignore` 没这条规则 | 加上再验证 |
| `.env.example` 也被忽略了 | `!` 写在了 `.env.*` 前面 | 把 `!.env.example` 移后面 |
| `git log -- .env` 有输出但文件不存在 | 历史里有，当前没有 | 走 `filter-repo`，先吊销 |
| `filter-repo` 报 `not a git command` | 装了但不在 PATH | 试 `python -m git_filter_repo` |
| `filter-repo` 后 `push` 被拒 | 历史重写 | `git push --force origin main` |
| 之后 `git remote -v` 是空的 | 它默认删远程（保护机制） | `git remote add origin <url>` |
| 强制推送后同事说代码乱了 | 他的历史已分叉 | 让他删掉重 clone |
| `pm2 restart` 后还是旧 key | 没加 `--update-env` | 加上参数再重启 |
| pm2 报缺少环境变量 | `exec cwd` 不是 `/srv/app` | `pm2 delete` 后用 `--cwd` 重建 |
| `sudo -u www-data cat .env` 能读出 | 权限还是 644 | `chmod 600 .env` |
| `curl -I /.env` 返回 403 不是 404 | 只写了 `deny all` | 加 `return 404;` |
| `nginx -t` 报 `unknown directive` | 配置块放错层级 | `location` 必须在 `server` 里 |
| 钩子不执行，报 `cannot spawn` | CRLF 或没有 `+x` | `chmod +x` + 转 LF |
| 前端搜不到 `sk-` 但 key 还是漏了 | 错误响应体里带了 key | 查错误响应（第 226 节） |
| 吊销后返回 429 | key 还有效，只是限流 | 回后台确认，这不算吊销成功 |
| 换 key 后账单还在涨 | 攻击者可能还有别的入口 | 查访问日志和登录记录 |
| `history \| grep Bearer` 里全是 key | 命令行直接写了 key | 用 `export`，用完 `unset` |
