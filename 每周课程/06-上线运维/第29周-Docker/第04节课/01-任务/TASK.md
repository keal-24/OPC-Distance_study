# 第 200 节课：环境变量与密钥——`.env` 不许进镜像

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 第 199 节课你的容器能跑了，而且页面能打开。但它是"裸跑"的：没有 key、没有配置。
> 今天解决一件事：**怎么把密钥和配置交给容器，同时保证它不进镜像。** 这一节做错了，就是安全事故。

**建议用时**：110 分钟
**你需要先完成**：第 199 节课。具体要求：`chat-app` 容器能起来，浏览器能打开，`docker logs` 能看到你的应用日志。

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

```text
docker build -t chat-app:3.1 .              把项目做成镜像
docker run -d -p 3000:3000 chat-app:3.1     跑起来
docker logs / exec                          看日志、进容器
```

**你的容器现在能跑，但它大概率跑不了真实业务。**

**因为真实业务要调模型，调模型要 key。而 key 不在镜像里。**

## 0.2 你以后会遇到什么

```text
① "我把 key 写进 server.js 了，反正只有我看"
② "镜像推到仓库了，怎么知道 key 有没有进去"
③ "本地要 .env.local，线上要 .env.production，怎么切"
④ "改一个配置要重新 build 一次，太慢"
⑤ "客户问：你们怎么保管我的密钥"
```

**第 ① 条是最常见的安全事故起点。第 ⑤ 条是你以后接单一定会被问到的。**

## 0.3 今天要建立的三个概念

```text
① 构建期 vs 运行期 —— build 的时候发生的事，会永久留在镜像里；run 的时候才发生的事，只在容器里
② 三条注入通道 —— -e 单个、--env-file 一批、compose 的 env_file
③ 可见性边界 —— 环境变量"不进镜像"不等于"看不见"。谁能 exec 进容器，谁就能看到
```

**第 ① 个是今天的分水岭。**

```text
构建期（build）：FROM RUN COPY ENV ARG  →  写进镜像层，永久
运行期（run）  ：-e --env-file -v -p     →  只影响这一个容器，换一个就没了
```

**密钥只能走运行期。**

## 0.4 今天的交付物

| 产出 | 位置 | 内容 |
|---|---|---|
| `server.js` 改造 | `chat-app-docker/` | key 从环境变量读，不写死 |
| `.env` | `chat-app-docker/` | 本地用，不进 Git 不进镜像 |
| `.env.example` | `chat-app-docker/` | 提交进 Git，只有键名没有值 |
| 验证记录 | `NOTES.md` | 三条验证命令的真实输出 |

---

# 第 1 步：先看你的 key 现在在哪（15 分钟）

## 1.1 搜一遍整个项目

**在 `chat-app-docker/` 里打开终端：**

```bash
grep -rn "sk-" . --include="*.js" --include="*.json" --include="*.env"
```

**如果没有输出，很好。**

**如果有输出，比如：**

```text
./server.js:12:const API_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxx"
```

**那是硬编码。今天必须改掉。**

**为什么硬编码最危险：**

```text
① 它在源码里，会进 Git
② 它会进镜像（因为 COPY . . 会拷 server.js）
③ 你改了 key，要改代码、重新 build、重新部署
④ 别人看你代码截图，key 就泄露了
```

**搜别的关键词，看你有没有漏：**

```bash
grep -rniE "api[_-]?key|secret|token|password" . --include="*.js" --include="*.json" | grep -v node_modules
```

**⚠️ 上面这条会搜出很多误报**（比如 `token` 是变量名）。**看的是有没有 `=` 后面跟着一串看起来像密钥的字符。**

## 1.2 看 `.env` 长什么样

```bash
cat .env
```

**应该类似：**

```text
PORT=3000
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.example.com/v1
DATABASE_URL=postgres://user:password@localhost:5432/app
```

**逐行读：**

| 行 | 是什么 |
|---|---|
| `PORT=3000` | 普通配置，不机密 |
| `OPENAI_API_KEY=...` | **机密。泄露要花钱** |
| `OPENAI_BASE_URL=...` | 普通配置（但可能暴露你用哪家服务） |
| `DATABASE_URL=...` | **机密。里面有数据库密码** |

**哪些算"机密"：**

```text
✅ 任何 key、token、password、连接串里的密码
✅ 支付商户号 + 密钥
✅ 第三方平台的 AppSecret
❌ 端口号、日志级别、功能开关
```

## 1.3 看代码怎么读这些变量

**打开 `server.js`，找 `process.env`：**

```js
const apiKey = process.env.OPENAI_API_KEY
```

**如果代码里没有 `dotenv`，那你本地是怎么读 `.env` 的？**

**查：**

```bash
grep -n "dotenv" server.js package.json
```

**应该看到：**

```text
server.js:1:require("dotenv").config()
package.json:15:    "dotenv": "^16.4.5"
```

**`dotenv` 干的事：** 读 `.env` 文件，把里面的 `KEY=VALUE` 塞进 `process.env`。

**⚠️ 关键认知：**

```text
dotenv 读的是"容器里的 .env 文件"
```

**如果你把 `.env` 排除在镜像外（必须排除），容器里就没有 `.env`。**

**那 `dotenv` 读什么？什么都读不到，`process.env.OPENAI_API_KEY` 是 `undefined`。**

**所以：容器化之后，`.env` 文件不该进容器。变量要用 `-e` / `--env-file` 从外面注进去。**

**那 `dotenv` 还有用吗？**

```text
✅ 有用：本地直接 node server.js 的时候，它读你电脑上的 .env
❌ 不用管：在容器里，变量已经在 process.env 里了，dotenv 读不到文件也不报错
```

**`dotenv` 找不到文件时是静默的。** 这一点很坑：你以为它读了，其实没有。

## 1.4 确认 `.env` 没被提交

```bash
cat .gitignore
```

**必须有：**

```text
.env
.env.*
!.env.example
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `.env` | 忽略这个文件 |
| `.env.*` | 忽略 `.env.local`、`.env.production` 等 |
| `!.env.example` | **例外：这个要提交**（感叹号是"不忽略"） |

**检查 Git 有没有已经跟踪它：**

```bash
git ls-files | grep env
```

**如果输出了 `.env`，说明它已经被提交过了。**

**⚠️ 光加 `.gitignore` 没用，历史里还有。**

**处理办法（第 4 周学过）：**

```bash
git rm --cached .env
git commit -m "移除 .env（密钥不进仓库）"
```

**然后去服务商后台吊销那个 key、换新的。** 因为历史里已经有了，别人 clone 就能看到。

**（第 33 周会专门讲密钥泄露的处理流程。）**

---

# 第 2 步：三条注入通道（25 分钟）

## 2.1 通道一：`-e` 单个注入

```bash
docker run -d --name chat-app -p 3000:3000 \
  -e OPENAI_API_KEY=sk-test-123456 \
  -e OPENAI_BASE_URL=https://api.example.com/v1 \
  chat-app:3.1
```

**`\` 是换行续行符。** Git Bash 和 PowerShell 都支持（PowerShell 里是反引号 `` ` ``，不是 `\`）。

**PowerShell 里要写成一行，或者用反引号：**

```powershell
docker run -d --name chat-app -p 3000:3000 -e OPENAI_API_KEY=sk-test-123456 -e OPENAI_BASE_URL=https://api.example.com/v1 chat-app:3.1
```

**验证变量进去了：**

```bash
docker exec chat-app env
```

**应该看到：**

```text
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOSTNAME=8f3a2b1c9d4e
NODE_VERSION=20.18.0
NODE_ENV=production
OPENAI_API_KEY=sk-test-123456
OPENAI_BASE_URL=https://api.example.com/v1
HOME=/root
```

**逐行读（挑重点）：**

| 行 | 从哪来的 |
|---|---|
| `NODE_VERSION=20.18.0` | **基础镜像 `node:20-alpine` 自带的** |
| `NODE_ENV=production` | **你 Dockerfile 里 `ENV` 设的** |
| `OPENAI_API_KEY=...` | **你刚才 `-e` 传的** |
| `HOSTNAME=8f3a...` | Docker 自动设的（容器 ID 前 12 位） |

**三种来源，一层层叠加。**

## 2.2 通道二：`--env-file` 批量注入

**`-e` 一条一条写太麻烦，尤其是五六个变量。**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
```

**`--env-file .env` 的意思是：把这个文件里每一行 `KEY=VALUE` 都变成容器的环境变量。**

**验证：**

```bash
docker exec chat-app env | sort
```

**应该看到 `.env` 里所有的键。**

## 2.3 通道三：Dockerfile 里的 `ENV`

```dockerfile
ENV NODE_ENV=production
ENV PORT=3000
```

**这两条会在 build 时写进镜像。**

**`NODE_ENV` 适合写在这里**，因为它是"这个镜像就是生产用的"这个事实。

**密钥绝对不能写在这里：**

```dockerfile
❌ ENV OPENAI_API_KEY=sk-xxxx
```

**为什么：**

```text
ENV 是构建期指令 → 写进镜像层 → docker history 能看到
                                 → docker inspect 能看到
                                 → 镜像推到哪，key 就到哪
```

**而且删不掉。** 后面再 `ENV OPENAI_API_KEY=` 置空，前一层的值还在镜像里。

## 2.4 优先级：谁覆盖谁

**三个都设了，以哪个为准：**

```text
最高：docker run -e
中间：docker run --env-file
最低：Dockerfile ENV
```

**做个实验：**

```dockerfile
# Dockerfile 里
ENV PORT=3000
```

```text
# .env 里
PORT=4000
```

```bash
docker run -d --name p1 -p 3000:3000 -e PORT=5000 --env-file .env chat-app:3.1
docker exec p1 sh -c 'echo $PORT'
```

**输出：**

```text
5000
```

**`-e` 赢了。**

**去掉 `-e`：**

```bash
docker rm -f p1
docker run -d --name p1 -p 3000:3000 --env-file .env chat-app:3.1
docker exec p1 sh -c 'echo $PORT'
```

```text
4000
```

**`--env-file` 赢了 Dockerfile 的 `ENV`。**

**这个优先级很重要：**

```text
镜像里的 ENV 是"默认值"
--env-file 是"这个环境的配置"
-e 是"临时覆盖，我说了算"
```

**⚠️ 注意：`-e PORT=5000` 改了环境变量，但不会改 `EXPOSE`，也不改端口映射。你的程序如果读 `process.env.PORT`，那它会去听 5000。**

**这时 `-p 3000:3000` 就错了，右边要改成 5000。**

## 2.5 一张对照表

| 方式 | 写在哪 | 进镜像吗 | 什么时候用 |
|---|---|---|---|
| `ENV` in Dockerfile | Dockerfile | **会** | 非机密的默认值（`NODE_ENV`、`TZ`） |
| `ARG` in Dockerfile | Dockerfile | **会留在 history** | 构建参数（npm 源地址），**绝不用来传密钥** |
| `docker run -e` | 命令行 | 不会 | 临时覆盖、调试 |
| `docker run --env-file` | 一个文件 | 不会 | 日常启动 |
| compose `env_file:` | compose 文件 | 不会 | 多服务编排（第 6 节） |
| compose `environment:` | compose 文件 | 不会 | 少量变量，直接写在 yaml 里 |

---

# 第 3 步：验证镜像里搜不到 key（20 分钟）

**这是本节最重要的一步。** 不做这一步，你永远不知道自己有没有漏。

## 3.1 方法一：看文件列表

```bash
docker run --rm chat-app:3.1 ls -a /app
```

**应该看到：**

```text
.  ..  package.json  package-lock.json  public  server.js
```

**不该有 `.env`。**

**有的话：** `.dockerignore` 没写对。

## 3.2 方法二：在镜像里全文搜索

**这是最硬的验证。**

```bash
docker run --rm chat-app:3.1 sh -c "grep -rn 'sk-' /app || echo '✅ 没搜到 key'"
```

**应该看到：**

```text
✅ 没搜到 key
```

**如果有输出，比如：**

```text
/app/.env:2:OPENAI_API_KEY=sk-xxxxxxxx
```

**那就是漏了。**

**逐段读这条命令：**

| 片段 | 意思 |
|---|---|
| `docker run --rm` | 起一个临时容器，跑完自动删 |
| `chat-app:3.1` | 用这个镜像 |
| `sh -c "..."` | 在容器里执行一段 shell |
| `grep -rn 'sk-' /app` | 在 `/app` 里递归搜 `sk-`，`-n` 显示行号 |
| `\|\| echo ...` | 前面失败（没搜到，grep 退出码 1）就打印这句话 |

**为什么用 `|| echo`：**

`grep` 搜不到的时候退出码是 1，会让人误以为"命令失败了"。**用 `||` 接一句"没搜到"，输出就有意义了。**

**搜更多关键词：**

```bash
docker run --rm chat-app:3.1 sh -c "grep -rnE 'sk-[a-zA-Z0-9]{10,}|password|secret' /app || echo '✅ clean'"
```

**注意 `grep` 的 `-E` 是扩展正则，`{10,}` 是"至少 10 个"。**

## 3.3 方法三：查镜像的历史层

**即使文件删了，历史层里可能还有。**

```bash
docker history --no-trunc chat-app:3.1
```

**应该看到（`CREATED BY` 列）：**

```text
IMAGE                                                                     CREATED BY
sha256:a1b2...   CMD ["node" "server.js"]
sha256:b2c3...   EXPOSE map[3000/tcp]
sha256:c3d4...   COPY . . # buildkit
sha256:d4e5...   RUN /bin/sh -c npm config set registry ... && npm ci ... # buildkit
sha256:e5f6...   COPY package*.json ./ # buildkit
sha256:f6a7...   ENV NODE_ENV=production
...
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `CREATED BY` | **每一层的构建指令。这里能看到 `ARG` 的值** |
| `SIZE` | 这一层多大 |
| `COMMENT` | `buildkit.dockerfile.v0` |

**⚠️ `--build-arg` 传的东西会出现在这里。**

**这就是为什么不能用 `ARG` 传密钥**（第 7 步错误 5 演示）。

## 3.4 方法四：把镜像导出，扒开看

**最彻底的办法。适合"我要百分之百确认"。**

```bash
docker save chat-app:3.1 -o /tmp/chat-app.tar
mkdir -p /tmp/img && tar -xf /tmp/chat-app.tar -C /tmp/img
ls /tmp/img
```

**应该看到：**

```text
blobs  index.json  manifest.json  oci-layout  repositories
```

**逐层搜：**

```bash
grep -rl "sk-" /tmp/img/blobs/ 2>/dev/null || echo "✅ 所有层里都没有"
```

**如果有输出，说明某一层里有。**

**注意：`docker save` 出来的是压缩过的层，`grep` 不一定能搜到明文。**

**更可靠的做法是用一个临时容器把每层解开，但太麻烦。**

**实践中，方法二 + 方法三就够了。** 方法四只在"我要给客户一个书面保证"的时候用。

**（镜像里那些层都是 `tar.gz`，明文 key 在压缩流里 `grep` 不到，所以别用方法四的结果当唯一证据。）**

## 3.5 顺便验证运行时的变量是有的

**镜像里搜不到 key，但容器跑起来要有 key。这两件事不矛盾。**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
docker exec chat-app sh -c 'echo "key 长度: ${#OPENAI_API_KEY}"'
```

**应该看到：**

```text
key 长度: 51
```

**用长度验证，不打印内容。** 这个习惯很好：**日志里永远不要打印完整密钥。**

**然后测一下业务通不通：**

```bash
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"message":"你好"}'
```

**应该返回模型的一句话，而不是 401。**

**如果返回 401：** 去第 7 步错误 2/3/4。

---

# 第 4 步：`.env` 文件的写法和四个坑（20 分钟）

## 4.1 基本格式

```text
# 注释行，以 # 开头
PORT=3000
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.example.com/v1
```

**规则：**

| 规则 | 例子 |
|---|---|
| 一行一个 | `PORT=3000` |
| 等号两边**不要空格** | `PORT = 3000` ❌ |
| 值里有空格要加引号 | `APP_NAME="我的 应用"` |
| 不要用中文引号 | `APP_NAME=“我的应用”` ❌ |
| 空行会被跳过 | 可以有空行 |
| `#` 开头是注释 | 整行被忽略 |

**`PORT = 3000` 会怎样：**

**`dotenv` 会读成**：键是 `PORT `（带空格），值是 ` 3000`（带空格）。

**结果 `process.env.PORT` 是 `undefined`。**

**Docker 的 `--env-file` 更严格一点，会直接忽略格式不对的行，或者把整行当成键。**

**总之：等号两边不要空格。**

## 4.2 坑一：引号会被保留

```text
OPENAI_API_KEY="sk-xxxx"
```

**用 `--env-file` 传进去，容器的变量值是：**

```text
"sk-xxxx"
```

**带着两个双引号。**

**因为 Docker 的 `--env-file` 不做引号解析，它把等号后面所有字符原样当值。**

**然后你的请求头变成：**

```text
Authorization: Bearer "sk-xxxx"
```

**服务商返回 401。**

**⚠️ `dotenv`（npm 包）会去掉引号，Docker 的 `--env-file` 不会。** 这是两套解析器，行为不同。

**规则：`.env` 里一律不加引号（除非值里有空格）。**

## 4.3 坑二：Windows 的换行符

**这是 Windows 用户最冤的一个坑。**

**Windows 记事本保存的文件是 CRLF（`\r\n`）。Linux 是 LF（`\n`）。**

**Docker 的 `--env-file` 按 `\n` 切行，切完之后 `\r` 留在值的末尾：**

```text
OPENAI_API_KEY=sk-xxxx\r
```

**你以为传的是 `sk-xxxx`，实际是 `sk-xxxx\r`。**

**现象：**

```text
401 Unauthorized: Incorrect API key provided
```

**你复制粘贴了十次 key，每次都对，就是不认。**

**怎么查（一行命令见分晓）：**

```bash
docker run -d --name t --env-file .env chat-app:3.1 sh -c 'printf "%s" "$OPENAI_API_KEY" | od -c | head -2'
docker logs t
```

**如果输出里有 `\r`：**

```text
0000000   s   k   -   x   x   x   x  \r
```

**那就是 CRLF 的问题。**

**怎么修：**

```text
方法一：VS Code 右下角点 "CRLF"，改成 "LF"，保存
方法二：Git Bash 里跑 sed -i 's/\r$//' .env
方法三：.gitattributes 里配 *.env text eol=lf
```

**推荐方法一。** 改一次，以后都不会犯。

**怎么从根上避免：**

**在 VS Code 里打开 `.env`，右下角会显示 `CRLF` 或 `LF`。** 每次改完看一眼。

**或者给项目加 `.editorconfig`：**

```ini
[*]
end_of_line = lf
```

## 4.4 坑三：值里有 `#` 或空格

```text
PASSWORD=abc#123
```

**多数解析器会把 `#` 当注释开始，值变成 `abc`。**

**修：加引号：**

```text
PASSWORD="abc#123"
```

**但加了引号，Docker 又会保留引号（见 4.2）。**

**这就是 `.env` 的通用麻烦：它没有统一标准。**

**结论：**

```text
密码里有特殊字符 → 换一个密码（重新生成一个纯字母数字的）
真的换不了   → 用 -e 传，并加引号（bash 会去掉引号）
```

**用 `-e` 时，shell 先处理引号：**

```bash
docker run -e 'PASSWORD=abc#123' chat-app:3.1
```

**单引号让 shell 不解释 `#`，Docker 收到的是 `PASSWORD=abc#123`，值里没有引号。**

## 4.5 坑四：`--env-file` 的文件必须存在

```bash
docker run --env-file .env.production chat-app:3.1
```

**如果文件不在：**

```text
docker: open .env.production: no such file or directory.
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `docker: open .env.production` | 打不开这个文件 |
| `no such file or directory` | 文件不存在 |

**注意：这个错误是 Docker 客户端报的，不是引擎。** 因为它要在本机读这个文件，再发给引擎。

**所以 `--env-file` 的路径是"你电脑上的路径"，不是"容器里的路径"。**

**这一点和第 5 节的 `-v` 一样，很容易搞混。**

## 4.6 `.env.example` 的写法

**`.env` 不进 Git，那新人怎么知道要配哪些变量？**

**答案：提交一份 `.env.example`，只有键名，值留空或写假值。**

```text
# .env.example
# 复制成 .env 然后填真实值
PORT=3000
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.example.com/v1
DATABASE_URL=postgres://user:password@localhost:5432/app
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `# 复制成 .env 然后填真实值` | 给新人看的说明 |
| `OPENAI_API_KEY=` | **值留空。填假值也行，但空着更明确** |
| `DATABASE_URL=postgres://user:password@...` | 这里的 `user:password` 是**占位符**，不是真密码 |

**`.gitignore` 里要放行它：**

```text
.env
.env.*
!.env.example
```

**⚠️ 很多人忘了 `!.env.example`，结果模板也没提交，新人来了不知道怎么配。**

---

# 第 5 步：密钥的可见性边界（20 分钟）

## 5.1 环境变量不是加密的

**"用环境变量"经常被说成"安全做法"。这只对了一半。**

**做这个实验，先起容器：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
```

**方法一：`docker inspect` 直接看**

```bash
docker inspect --format '{{json .Config.Env}}' chat-app
```

**输出：**

```text
["PATH=/usr/local/sbin:...","NODE_VERSION=20.18.0","NODE_ENV=production","OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx","OPENAI_BASE_URL=https://api.example.com/v1","HOME=/root"]
```

**你的 key 明文在里面。**

**方法二：`docker exec` + `env`**

```bash
docker exec chat-app env | grep OPENAI
```

```text
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.example.com/v1
```

**方法三：读 `/proc/1/environ`**

```bash
docker exec chat-app sh -c 'tr "\0" "\n" < /proc/1/environ'
```

**同样能看到。**

**结论：**

```text
环境变量能防的是：key 被写进镜像、被推到仓库、被客户拿到镜像文件
环境变量不能防的是：任何能在这台机器上执行 docker 命令的人
```

**所以：**

```text
① 能 docker exec 的人 = 能看到所有密钥。别给不该给的人 SSH 权限
② `docker inspect` 的输出不要贴到群里、不要贴到 issue 里
③ CI 的日志里不要 echo 环境变量
```

## 5.2 为什么还要用环境变量

**因为"进了镜像"和"没进镜像"差别巨大：**

| 场景 | key 在镜像里 | key 用环境变量 |
|---|---|---|
| 镜像推到公开仓库 | ❌ 全世界都能看到 | ✅ 安全 |
| 客户拿到镜像文件 | ❌ 他能扒出来 | ✅ 安全 |
| 镜像留在 CI 缓存 | ❌ 可能被读到 | ✅ 安全 |
| `docker history` | ❌ 可见 | ✅ 不可见 |
| 同事在你机器上 `docker exec` | ❌ 可见 | ❌ 也可见 |

**前四行是"你不可控的扩散"，最后一行是"你本来就该控制的人"。**

**所以我们用环境变量。**

## 5.3 `ARG` 为什么不能传密钥

**先看 `ARG` 是什么：**

```dockerfile
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --omit=dev --registry=$NPM_REGISTRY
```

**`ARG` 是构建时的参数，`docker build --build-arg NPM_REGISTRY=xxx` 传进去。**

**它和 `ENV` 的区别：**

```text
ENV   构建期 + 运行期都能用，会留在最终镜像的环境变量里
ARG   只在构建期可用，默认不留在最终镜像的环境变量里
```

**看起来 `ARG` 更安全。但其实不是。**

**`ARG` 的值会记录在镜像的构建历史里。**

**第 7 步错误 5 会演示：`docker history --no-trunc` 能直接看到 `--build-arg` 的值。**

## 5.4 那真正机密的密钥怎么办

**先说结论：你现在不需要那些方案。**

**你已经有的手段：**

```text
① key 不进镜像（--env-file）
② key 不进 Git（.gitignore）
③ 服务器上 .env 权限设成 600（只有 root 能读）
④ 定期轮换 key
```

**第 ③ 条在服务器上这样做（第 31 周会用到）：**

```bash
chmod 600 /srv/app/.env
ls -l /srv/app/.env
```

```text
-rw------- 1 root root 512 Nov 16 03:20 /srv/app/.env
```

**`-rw-------` 意思是"只有属主能读写"。**

**更高级的方案（现在知道有就行）：**

| 方案 | 是什么 | 什么时候用 |
|---|---|---|
| Docker secrets | Swarm 模式的功能 | 你不上 Swarm，用不上 |
| 云厂商 KMS / Secrets Manager | 密钥存在云上，程序运行时去取 | 客户要求合规时 |
| Vault | 自建密钥管理 | 大公司 |
| 环境变量 + 严格权限 | **你现在这个** | 一个人做产品，够了 |

**不要因为"不够专业"就不做基础的三件事。** 三件事不做，上再多方案也没用。

---

# 第 6 步：让配置可切换（15 分钟）

## 6.1 三个环境，三个文件

```text
.env                本地开发（不进 Git）
.env.production     生产（不进 Git）
.env.example        模板（进 Git）
```

**启动时选文件：**

```bash
# 本地
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1

# 模拟生产
docker run -d --name chat-app-prod -p 3001:3000 --env-file .env.production chat-app:3.1
```

**两个容器同时跑，两套配置，互不干扰。**

**这就是"同一份镜像，不同环境"的样子。**

**⚠️ 注意：镜像必须完全一样。** 如果生产环境用了不同的镜像 tag，那就不是"同一份"了，测试的价值会打折。

## 6.2 `NODE_ENV` 该放哪

**它是"这个镜像的用途"，不是"这次运行的配置"，所以放 Dockerfile：**

```dockerfile
ENV NODE_ENV=production
```

**影响：**

| 库 | `NODE_ENV=production` 之后 |
|---|---|
| Express | 关掉详细错误页，模板缓存开启，性能更好 |
| React（构建时） | 去掉开发警告 |
| 很多库 | 关掉 debug 日志 |

**⚠️ `NODE_ENV=production` 会让某些库**不安装**某些东西。** 如果你的代码依赖开发时的行为，会出问题。

**典型：** 有些项目 `devDependencies` 里有运行时需要的包，`npm ci --omit=dev` 之后跑不起来。**第 198 节课错误里提过。**

## 6.3 启动时缺 key 要立刻报错

**现在的代码：**

```js
const apiKey = process.env.OPENAI_API_KEY
```

**如果没传，`apiKey` 是 `undefined`。程序照跑，直到用户点"发送"才 500。**

**这是最糟的失败方式：** 部署成功、健康检查通过、用户一用就崩。

**改成启动就检查：**

```js
const required = ["OPENAI_API_KEY", "OPENAI_BASE_URL"]
const missing = required.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error("缺少环境变量：" + missing.join(", "))
  process.exit(1)
}
```

**逐行读：**

| 行 | 干什么 |
|---|---|
| `const required = [...]` | 列出"没有就不许启动"的变量 |
| `.filter((k) => !process.env[k])` | 挑出没设的 |
| `if (missing.length > 0)` | 有缺失 |
| `console.error(...)` | **打到 stderr，`docker logs` 能看到** |
| `process.exit(1)` | **退出码 1，容器变成 `Exited (1)`** |

**为什么 `exit(1)` 比"继续跑"好：**

```text
exit(1)     → 容器 Exited(1) → 你一眼看到 → 补变量
继续跑       → 容器 Up       → 用户点发送才 500 → 用户先发现
```

**这个模式叫 "fail fast"（快速失败）。** 第 31 周配 pm2 和健康检查时会再讲。

**验证：**

```bash
docker rm -f chat-app
docker run --rm chat-app:3.1
```

**不加 `--env-file`，应该看到：**

```text
缺少环境变量：OPENAI_API_KEY, OPENAI_BASE_URL
```

**然后容器退出，`echo $?` 是 1。**

## 6.4 配置清单写进 README

**别让"要配哪些变量"只存在你脑子里。**

**在项目 README 里加一张表：**

| 变量 | 必填 | 说明 | 示例 |
|---|---|---|---|
| `OPENAI_API_KEY` | 是 | 模型服务密钥 | `sk-...` |
| `OPENAI_BASE_URL` | 是 | 接口地址 | `https://api.example.com/v1` |
| `PORT` | 否 | 监听端口，默认 3000 | `3000` |
| `DATABASE_URL` | 是 | 数据库连接串 | `postgres://...` |

**这张表以后会变成"交付文档"的一部分（第 34 周）。**

---

# 第 7 步：故意犯七个错（25 分钟）

## 错误 1：`.env` 进了镜像

**操作：** 删掉 `.dockerignore` 里的 `.env` 那一行，重新 build。

```dockerfile
# .dockerignore 里注释掉
# .env
```

```bash
docker build -t chat-app:leak2 .
```

**会怎样：** build 成功。

**验证：**

```bash
docker run --rm chat-app:leak2 sh -c "grep -rn 'sk-' /app || echo clean"
```

**输出：**

```text
/app/.env:2:OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

**你的 key 在镜像里。**

**为什么：**

`COPY . .` 会把上下文里所有文件拷进去。`.dockerignore` 是唯一的拦截。

**怎么修：**

```text
# .dockerignore
node_modules
.env
.env.*
```

**重新 build，再搜一次，应该输出 `clean`。**

**⚠️ 已经泄露的 key 要去后台吊销，不是删镜像。** 镜像可能已经被推走、被缓存、被 `docker save` 过。

## 错误 2：忘了 `--env-file`，key 是 undefined

**操作：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 chat-app:3.1
```

**会怎样：**

**容器起来了（如果你的代码没做 fail fast）：**

```bash
docker ps
```

```text
STATUS
Up 5 seconds
```

**然后你点"发送"：**

```text
POST /api/chat 500 12ms
```

**日志里：**

```bash
docker logs --tail 20 chat-app
```

```text
TypeError: Cannot read properties of undefined (reading 'slice')
    at buildMessages (/app/server.js:24:31)
    at /app/server.js:41:18
```

**或者如果调 API：**

```text
Error: 401 Unauthorized
```

**为什么：**

`process.env.OPENAI_API_KEY` 是 `undefined`。

**`dotenv` 没帮上忙**，因为容器里没有 `.env` 文件，它静默跳过。

**怎么查（最快的办法）：**

```bash
docker exec chat-app sh -c 'echo "key=[$OPENAI_API_KEY]"'
```

**输出：**

```text
key=[]
```

**空的。就是没传进去。**

**怎么修：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
```

**并且按 6.3 加启动检查，让这种错误在启动时就暴露。**

## 错误 3：`.env` 里的引号被保留

**操作：** 把 `.env` 改成：

```text
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxx"
```

**会怎样：**

```bash
docker rm -f chat-app
docker run -d --name chat-app -p 3000:3000 --env-file .env chat-app:3.1
docker exec chat-app sh -c 'printf "%s" "$OPENAI_API_KEY" | od -c | head -2'
```

**输出：**

```text
0000000   "   s   k   -   x   x   x   x   x   x   x   x  "  \n
```

**前后各有一个 `"`。**

**然后调 API：**

```text
401 Unauthorized: Incorrect API key provided: "sk-xxxx".
```

**注意报错里带着引号。** 这是最好的线索。

**为什么：**

`--env-file` 不做引号处理，原样保留。

**怎么修：**

**去掉引号：**

```text
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

**或者如果你必须用 `-e`，让 shell 处理引号：**

```bash
docker run -e "OPENAI_API_KEY=sk-xxxx" ...
```

**shell 会去掉引号，Docker 收到的是干净的值。**

## 错误 4：Windows 换行符 `\r`

**操作：** 用记事本编辑 `.env`，保存，然后：

```bash
docker run -d --name chat-app --env-file .env chat-app:3.1
docker exec chat-app sh -c 'printf "%s" "$OPENAI_API_KEY" | od -c | tail -2'
```

**会怎样：**

```text
0000000   s   k   -   x   x   x   x   x   x   x   x   x  \r
```

**末尾有个 `\r`。**

**现象：**

```text
401 Unauthorized: Incorrect API key provided
```

**key 看起来完全正确，就是不认。**

**怎么查：**

**用 `od -c`（八进制 dump）能看到不可见字符。** `\r` 就是 CR。

**或者：**

```bash
docker exec chat-app sh -c 'echo ${#OPENAI_API_KEY}'
```

**应该 51 个字符，结果 52 —— 多了一个。**

**怎么修：**

```bash
# Git Bash 里直接改
sed -i 's/\r$//' .env
```

**或者 VS Code 打开 `.env`，右下角点 `CRLF` → 选 `LF` → 保存。**

**修完重新起容器。**

**怎么预防：** 项目根目录放一个 `.editorconfig`：

```ini
[*]
end_of_line = lf
insert_final_newline = true
```

## 错误 5：用 `--build-arg` 传密钥

**操作：**

```dockerfile
ARG OPENAI_API_KEY
RUN echo "key 长度: ${#OPENAI_API_KEY}" && npm ci --omit=dev
```

```bash
docker build --build-arg OPENAI_API_KEY=sk-secret-123 -t chat-app:arg .
```

**会怎样：** build 成功，而且你看不到 key（只看到长度）。

**看起来安全。但：**

```bash
docker history --no-trunc chat-app:arg | grep -i "api_key"
```

**输出：**

```text
<missing>  ...  |1 OPENAI_API_KEY=sk-secret-123 /bin/sh -c echo "key 长度: ..." # buildkit
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `\|1 OPENAI_API_KEY=sk-secret-123` | **BuildKit 把 ARG 的值写进了这一层的元数据** |
| `/bin/sh -c echo ...` | 这一层执行的命令 |

**你的 key 明文在历史里。**

**为什么：**

`ARG` 的值需要参与缓存计算，所以必须记录。**它只是"不放进最终容器的环境变量"，不等于"不留在镜像里"。**

**怎么修：**

```text
① 密钥永远不用 --build-arg / ARG 传
② 只用来传非机密（npm 源地址、时区）
③ 已经传过的，那个 key 要吊销
```

**这条是很多人踩过的坑。** 网上大量"用 build-arg 传密钥"的教程都是错的。

## 错误 6：`-e` 的值里有空格，没加引号

**操作：**

```bash
docker run -d --name chat-app -e APP_NAME=我的 应用 -p 3000:3000 chat-app:3.1
```

**会怎样：**

```text
Unable to find image '应用:latest' locally
docker: Error response from daemon: pull access denied for 应用,
repository does not exist or may require 'docker login': denied:
requested access to the resource is denied.
```

**逐段读：**

| 段 | 意思 |
|---|---|
| `Unable to find image '应用:latest'` | **Docker 把 `应用` 当成了镜像名** |
| `pull access denied for 应用` | 想去仓库拉，没权限 |
| `repository does not exist` | 这个镜像不存在 |

**为什么：**

shell 按空格拆参数。

```text
-e APP_NAME=我的      ← 一个参数
应用                  ← 另一个参数（被当成镜像名）
-p 3000:3000
chat-app:3.1          ← 被当成"容器里要执行的命令"
```

**`chat-app:3.1` 变成了 CMD，镜像变成了 `应用`。**

**怎么修：加引号：**

```bash
docker run -d --name chat-app -e "APP_NAME=我的 应用" -p 3000:3000 chat-app:3.1
```

**验证：**

```bash
docker exec chat-app sh -c 'echo "[$APP_NAME]"'
```

```text
[我的 应用]
```

**PowerShell 里要用双引号，而且 `$` 会被解释。** 遇到变量里带 `$` 的时候，用单引号（PowerShell 单引号是字面量）。

## 错误 7：变量名拼错

**操作：**

```bash
docker run -d --name chat-app --env-file .env -e OPEN_API_KEY=sk-xxx -p 3000:3000 chat-app:3.1
```

**你在 `.env` 里写的是 `OPENAI_API_KEY`，命令行里手抖写成 `OPEN_API_KEY`（少了个 `I`）。**

**会怎样：**

```bash
docker exec chat-app sh -c 'env | grep -i open'
```

```text
OPENAI_API_KEY=sk-xxxxxxxx
OPEN_API_KEY=sk-xxx
```

**两个都存在。** 你的代码读 `OPENAI_API_KEY`，拿到的是 `.env` 里那个 —— 所以这次碰巧没坏。

**但如果 `.env` 里没有，只有拼错的那个：**

```text
TypeError: Cannot read properties of undefined
```

**为什么难查：**

**环境变量名没有校验。** 拼错了不会报错，只是"那个变量不存在"。

**怎么查：**

```bash
docker exec chat-app env | sort
```

**把容器里所有变量列出来，和你预期的对一遍。**

**或者用代码检查（6.3 的 fail fast）：**

```text
缺少环境变量：OPENAI_API_KEY
```

**这句话会直接告诉你缺的是哪个名字。**

**怎么修：**

**统一在一处维护变量名。** 比如 `config.js`：

```js
export const config = {
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
}
```

**代码里只用 `config.apiKey`，拼错的地方只有一处。**

---

# 第 8 步：写学习笔记（10 分钟）

**打开 `第04节课/02-笔记/NOTES.md` 填。**

**这一节重点填三处：**

```text
① 我在镜像里搜 key 用的是哪条命令，输出是什么
② .env 文件的换行符是 LF 还是 CRLF（怎么查的）
③ docker inspect 里能看到我的 key 吗（贴打码后的输出）
```

**第 ③ 条会让你对"环境变量安全"这件事有正确的理解。**

---

# 第 9 步：课后练习

## 练习一：做一次完整的泄露演练

**要求：**

1. 故意让 `.env` 进镜像（删掉 `.dockerignore` 里那一行）；
2. build 成 `chat-app:leak`；
3. 用三种方法证明 key 在里面（`ls`、`grep`、`history`）；
4. 修 `.dockerignore`，重建，再证明一次"没有了"。

**记录：** 六条命令的输出。

**思考：如果这个镜像已经推到公开仓库 30 分钟，你第一步应该做什么？删镜像有用吗？**

## 练习二：让程序启动时就崩

**要求：**

1. 按 6.3 加 `required` 检查；
2. build；
3. 不带 `--env-file` 跑；
4. 看日志和退出码。

**记录：** 日志原文 + `docker inspect --format '{{.State.ExitCode}}'`。

**思考：如果你没加这个检查，这个 bug 会在什么时候被发现？谁来发现？**

## 练习三：三个环境，三个容器

**要求：**

1. 建 `.env.dev`、`.env.staging`、`.env.prod`（值都写假的）；
2. 三个容器分别用三个文件，端口 3000 / 3001 / 3002；
3. 每个容器里 `echo $APP_ENV`。

**记录：** 三组端口 + 三组变量值。

**思考：三个容器用的是同一个镜像吗？如果不是，你的测试还有意义吗？**

## 练习四：查一次换行符

**要求：**

1. 用记事本新建一个 `.env.test`，随便写一行 `FOO=bar`；
2. 保存；
3. 起容器，`od -c` 看值的末尾；
4. 用 VS Code 转成 LF，再看一次。

**记录：** 两次 `od -c` 的输出。

**思考：为什么这个坑在 Windows 上特别常见，在 Mac 上几乎没有？**

## 练习五：写一张"变量清单"

**要求：**

1. 打开你的 `chat-app-docker/`，把所有 `process.env.XXX` 找出来：

   ```bash
   grep -rhoE "process\.env\.[A-Z_]+" --include="*.js" . | sort -u
   ```

2. 整理成一张表：变量名 / 必填否 / 说明 / 默认值。

**记录：** 这张表。

**思考：这张表如果给客户看，有没有哪个变量的**名字**本身泄露了信息？**

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清"构建期"和"运行期"的区别
- [ ] 我知道密钥为什么只能走运行期
- [ ] 我知道 `-e` / `--env-file` / Dockerfile `ENV` 的优先级
- [ ] 我知道 `ARG` 会留在 `docker history` 里，不能传密钥
- [ ] 我知道环境变量不是加密的，`docker inspect` 能看到

## B. 实操

- [ ] 我的 `server.js` 里没有硬编码的 key
- [ ] 我的 `.env` 在 `.gitignore` 和 `.dockerignore` 里都有
- [ ] 我有一个 `.env.example`，只有键名
- [ ] 我能用 `--env-file` 启动容器
- [ ] 容器里 `env | grep OPENAI` 能看到变量
- [ ] 我的 `.env` 是 LF 换行（不是 CRLF）

## C. 验证

- [ ] `docker run --rm 镜像 ls -a /app` 里没有 `.env`
- [ ] `docker run --rm 镜像 sh -c "grep -rn 'sk-' /app || echo clean"` 输出 clean
- [ ] `docker history --no-trunc` 里没有 key
- [ ] `docker inspect` 里能看到 key（说明它只活在运行时）

## D. 交付

- [ ] `chat-app` 容器能用 `--env-file` 跑起来，业务通
- [ ] 缺变量时容器 `Exited (1)`，日志说清缺哪个
- [ ] `NOTES.md` 里贴了三条验证命令的真实输出

## E. 笔记

- [ ] 「可见性边界」那张表填了
- [ ] 「我卡在哪」写了真实报错
- [ ] 变量清单写完了

## 本节课要能说出口的一句话

> **密钥只在运行时注入、绝不写进镜像；但环境变量不是保险箱，能进容器的人照样看得见。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `401 Incorrect API key`，key 看起来对 | 值里带引号或 `\r` | `od -c` 看末尾；去引号；转 LF |
| `process.env.XXX` 是 `undefined` | 没传变量 | `--env-file`；`docker exec env` 确认 |
| `docker: open .env: no such file` | 路径不对（客户端读的是你电脑上的文件） | `cd` 到有 `.env` 的目录 |
| `Unable to find image '应用:latest'` | `-e` 的值有空格没加引号 | 加引号 |
| 镜像里能搜到 `sk-` | `.dockerignore` 漏了 `.env` | 补上；重建；**吊销 key** |
| `docker history` 里看到 key | 用了 `--build-arg` | 改用运行时注入；**吊销 key** |
| `Cannot find module 'dotenv'` | `--omit=dev` 把它当开发依赖了 | 移到 `dependencies` |
| 容器 Up 但功能全 500 | 变量没传，代码没做 fail fast | 加启动检查 |
| `.env` 提交进 Git 了 | 忘了 `.gitignore` / 已 `git add` | `git rm --cached`，**吊销 key** |
| `docker exec` 看不到变量 | 变量传给了别的容器 | `docker inspect 名字` 确认 |
| compose 里 `${VAR}` 是空的 | compose 的 `.env` 和应用 `.env` 是两回事 | 第 6 节讲 |
| 改了 `.env` 容器没变 | 环境变量在启动时注入，改文件要重启容器 | `docker rm -f` + 重新 run |
| 想在 CI 里用 key | 别 echo，用平台 secrets | 第 30 周 |
| 客户问密钥怎么保管 | 三条：不进镜像、不进 Git、权限 600 | 写进交付文档 |
