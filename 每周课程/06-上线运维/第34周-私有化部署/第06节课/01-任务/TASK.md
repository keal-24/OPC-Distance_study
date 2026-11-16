# 第 237 节课：升级与备份——版本号与回滚

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上一节课你把系统交出去了。客户开始用了。
> 然后客户提了新需求，或者你修了一个 bug，你要**在客户已经装满数据的系统上升级**。
> 这一节课解决两个问题：**升级失败怎么办、数据丢了怎么办。**

**建议用时**：130 分钟
**你需要先完成**：第 236 节课（交接完成）、第 221 节课（做过一次备份恢复）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你以前升级是这样的：

```text
改代码 → docker build -t chat-app:latest . → docker compose up -d
```

**在你自己电脑上，这没问题。坏了重来。**

**在客户生产环境，这套流程有三个致命问题：**

| 问题 | 后果 |
|---|---|
| `latest` 覆盖了旧版本 | 想回滚，旧镜像已经没了 |
| 没备份就升级 | 迁移脚本写错，数据回不来 |
| 没有冒烟检查 | 升级完以为成功，第二天客户说用不了 |

## 0.2 你以后会遇到什么

```text
① 升级到一半，容器起不来，客户在旁边看着。
② 升级成功，但新版本改了表结构，想回滚发现旧版本读不了新数据。
③ 客户说"昨天还好好的"，你发现是三天前那次升级埋的雷。
④ 数据库文件损坏，备份是七天前的，丢七天数据。
⑤ 客户问"你们这次改了什么"，你说不出改了哪几行。
```

**这五件事，全部可以在升级前 30 分钟的准备里避免。**

## 0.3 今天要建立的三个概念

```text
① 版本号：一个能对应到"某个确定的镜像 + 某个确定的数据库结构"的字符串。
② 可恢复的备份：不是"有个备份文件"，是"我试过能恢复回来"。
③ 回滚：不是"把代码改回去"，是"把系统整体退到上一个能用的状态"。
```

**第三个概念最难。** 因为数据库回不去。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `backup.sh` | `03-练习代码` | 备份脚本 |
| `upgrade.sh` | `03-练习代码` | 升级脚本 |
| `rollback.sh` | `03-练习代码` | 回滚脚本 |
| `升级演练记录.md` | `03-练习代码` | 一次失败回滚的完整记录 |

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **只有你的 Windows 电脑。** 升级和回滚脚本都在本机演练，用 `/c/opt/app` 模拟客户的安装目录。 |
| **用哪个终端** | **Git Bash。** |
| **现在在哪个目录** | <code>cd /c/opt/app 2>/dev/null \|\| echo "目录不存在，第 233 节没做"</code> |
| **本节新建什么** | `/c/opt/app/scripts/upgrade.sh`<br>`/c/opt/app/scripts/rollback.sh`<br>`升级演练.md`（升级成功 + 升级失败回滚两次记录） |

## 开工前先跑这一条

确认你没站错地方：

```bash
ls /c/opt/app/scripts/ 2>/dev/null; echo "---"; grep APP_VERSION /c/opt/app/.env 2>/dev/null || echo "还没有 APP_VERSION"
```

**应该看到：**

```text
install.sh
upgrade.sh
rollback.sh
---
APP_VERSION=1.2.0
```

**`scripts/` 里有三个脚本，`.env` 里有版本号。** 有版本号才能谈升级和回滚。

## 如果不对

**`目录不存在，第 233 节没做`** → 回第 233 节建 `/c/opt/app`。

**`还没有 APP_VERSION`** → 先往 `.env` 里加这一行，这一节的升级就是改这个值。

---

# 第 1 步：先把版本号定下来（20 分钟）

## 1.1 版本号用三段式

```text
v1.2.0
 │ │ └── 修订号：修 bug，不改功能，不改表结构
 │ └──── 次版本号：加功能，可能改表结构（向前兼容）
 └────── 主版本号：大改，可能不兼容
```

**什么时候升哪一位：**

| 改动 | 版本变化 | 例子 |
|---|---|---|
| 修一个错别字、改样式 | v1.2.0 → v1.2.1 | 修订 |
| 加一个导出功能 | v1.2.0 → v1.3.0 | 次版本 |
| 换数据库、改架构 | v1.2.0 → v2.0.0 | 主版本 |
| 只改部署配置 | 版本不变，加 `-r2` | v1.2.0-r2 |

**这个规则会变吗：**

```text
不会。这是行业通用约定（语义化版本），不是哪家公司定的。
```

## 1.2 版本号要出现在四个地方

| 位置 | 形式 | 谁看 |
|---|---|---|
| 镜像 tag | `chat-app:1.2.0` | 运维 |
| `/health` 返回 | `{"version":"1.2.0"}` | 你、监控 |
| 页面底部 | `v1.2.0` | 客户（可选） |
| `VERSION` 文件 | `1.2.0` | 构建脚本 |

**四个必须一致。**

**怎么保证一致：**

```bash
# 在项目根目录建一个 VERSION 文件
echo "1.2.0" > VERSION
```

**Dockerfile 里读它：**

```dockerfile
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
```

**构建时传：**

```bash
docker build --build-arg APP_VERSION=$(cat VERSION) -t chat-app:$(cat VERSION) .
```

**`/health` 里读环境变量：**

```js
app.get("/health", async (req, res) => {
  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch (e) {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "ok" : "down",
    version: process.env.APP_VERSION || "unknown",
  });
});
```

**为什么要返回 503 而不是 200：**

```text
监控和负载均衡看状态码。
数据库挂了还返回 200，监控会以为一切正常。
```

## 1.3 打 git tag

```bash
git tag -a v1.2.0 -m "1.2.0：增加文档批量导入"
git push origin v1.2.0
```

**应该看到：**

```text
Enumerating objects: 1, done.
Writing objects: 100% (1/1), 182 bytes | 182.00 KiB/s, done.
Total 1 (delta 0), reused 0 (delta 0)
To github.com:xxx/chat-app.git
 * [new tag]         v1.2.0 -> v1.2.0
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `[new tag]` | 新标签推送成功 |
| `v1.2.0 -> v1.2.0` | 本地和服务端一致 |

**为什么要 tag：**

```text
三个月后客户说"1.2.0 有个 bug"，你要能精确找到那个版本的代码。
只有 tag 能对应"镜像 tag ↔ 代码版本"。
```

## 1.4 验证版本号一致性

```bash
echo "VERSION 文件：$(cat VERSION)"
echo "镜像 tag：$(docker images --format '{{.Tag}}' chat-app | head -1)"
echo "接口返回：$(curl -s http://127.0.0.1/health)"
```

**应该看到：**

```text
VERSION 文件：1.2.0
镜像 tag：1.2.0
接口返回：{"status":"ok","db":"ok","version":"1.2.0"}
```

**逐行读：**

| 行 | 判断 |
|---|---|
| 三个都是 1.2.0 | ✅ 一致 |
| 接口返回 `unknown` | 构建时没传 `APP_VERSION` |
| 镜像 tag 是 `latest` | 没按版本构建 |

**这个检查要在每次升级前后各做一次。**

---

# 第 2 步：备份——不是"有文件"，是"能恢复"（30 分钟）

## 2.1 备份什么

| 内容 | 路径 | 体积 | 丢了会怎样 |
|---|---|---|---|
| 数据库 | `pg_dump` 导出 | 10—500 M | 所有业务数据没了 |
| 上传文件 | `/opt/app/data/uploads/` | 看用量 | 用户上传的附件没了 |
| 配置 | `docker-compose.yml`、`.env`、`nginx/` | 几 K | 要重新配一遍 |
| 证书 | `/opt/app/nginx/certs/` | 几 K | HTTPS 挂 |
| 脚本 | `/opt/app/scripts/` | 几十 K | 要重写 |
| 模型 | `data/ollama/models/` | 4.7 G | 不用备，能重新拷 |

**模型不备份。** 因为它不变，而且太大。

**配置和证书必须备。** 它们小，但重建很麻烦。

## 2.2 备份脚本全文

**文件：`/opt/app/scripts/backup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/app"
BACKUP_ROOT="$APP_DIR/backup"
DATE="$(date +%Y%m%d-%H%M)"
DEST="$BACKUP_ROOT/$DATE"
KEEP_DAYS=30

cd "$APP_DIR"

log() { echo "[$(date '+%F %T')] $*"; }

mkdir -p "$DEST"
chmod 700 "$DEST"

log "备份开始：$DEST"

# 1. 数据库
log "导出数据库"
docker compose exec -T postgres \
  pg_dump -U "$(grep ^DB_USER= .env | cut -d= -f2)" \
          -d "$(grep ^DB_NAME= .env | cut -d= -f2)" \
          -Fc > "$DEST/db.dump"

# 2. 上传文件
log "打包上传文件"
tar -czf "$DEST/uploads.tar.gz" -C "$APP_DIR/data" uploads 2>/dev/null || true

# 3. 配置
log "备份配置"
cp docker-compose.yml .env "$DEST/"
cp -r nginx "$DEST/nginx"
chmod 600 "$DEST/.env"

# 4. 版本信息
cat > "$DEST/meta.txt" <<EOF
备份时间：$(date '+%F %T')
应用版本：$(curl -s http://127.0.0.1/health | sed 's/.*"version":"\([^"]*\)".*/\1/')
镜像列表：
$(docker compose images)
磁盘：
$(df -h "$APP_DIR" | tail -1)
EOF

# 5. 校验
log "生成校验和"
cd "$DEST"
sha256sum db.dump uploads.tar.gz > SHA256SUMS

# 6. 检查大小
DB_SIZE=$(stat -c%s "$DEST/db.dump")
if [ "$DB_SIZE" -lt 1024 ]; then
  log "错误：db.dump 只有 $DB_SIZE 字节，备份可能失败"
  exit 1
fi

# 7. 清理旧备份
log "清理 $KEEP_DAYS 天前的备份"
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +$KEEP_DAYS -exec rm -rf {} \; 2>/dev/null || true

log "备份完成：$(du -sh "$DEST" | cut -f1)"
```

## 2.3 逐段读脚本

| 段 | 关键点 | 不写会怎样 |
|---|---|---|
| `set -euo pipefail` | 出错即停 | 备份失败还继续，最后报"成功" |
| `chmod 700 "$DEST"` | 只有 root 能进 | `.env` 里的密码被别人读到 |
| `pg_dump -Fc` | 自定义格式，可选择性恢复 | 用纯 SQL，恢复慢且不能并行 |
| `-T` | 不用 TTY | 在 cron 里不加 `-T` 会报 "the input device is not a TTY" |
| `grep ^DB_USER= .env` | 从 .env 读用户名 | 写死在脚本里，改了就忘 |
| `tar ... 2>/dev/null \|\| true` | 没有 uploads 也不失败 | 目录不存在时脚本直接退出 |
| `chmod 600 "$DEST/.env"` | **备份里的 .env 含密码** | 备份目录被拷走 = 密码泄露 |
| `meta.txt` | 记录版本和时间 | 三个月后不知道这个备份是哪个版本 |
| `sha256sum` | 校验 | 备份损坏你不知道 |
| `-lt 1024` 检查 | 防止空备份 | 数据库连不上时导出 0 字节，你以为成功 |
| `find -mtime +30 -delete` | 自动清理 | 磁盘被备份写满 |

**`-Fc` 是什么：**

```text
PostgreSQL 的自定义归档格式（custom format）。
比纯 SQL 小，恢复快，可以用 pg_restore 选择性恢复某张表。
```

## 2.4 手工跑一次

```bash
chmod +x /opt/app/scripts/backup.sh
/opt/app/scripts/backup.sh
```

**应该看到：**

```text
[2026-03-11 02:00:01] 备份开始：/opt/app/backup/20260311-0200
[2026-03-11 02:00:01] 导出数据库
[2026-03-11 02:00:03] 打包上传文件
[2026-03-11 02:00:04] 备份配置
[2026-03-11 02:00:04] 生成校验和
[2026-03-11 02:00:04] 清理 30 天前的备份
[2026-03-11 02:00:04] 备份完成：12M
```

**逐行读：**

| 行 | 正常耗时 | 异常信号 |
|---|---|---|
| 导出数据库 | 1—60 秒（看数据量） | 秒回说明库是空的 |
| 打包上传 | 看文件量 | 报错说明目录不存在 |
| 备份配置 | 瞬间 | 报错说明文件缺失 |
| 生成校验和 | 瞬间 | — |
| 完成：12M | 体积合理 | 只有几 K 说明数据库是空的 |

**验证备份内容：**

```bash
ls -lh /opt/app/backup/20260311-0200/
```

**应该看到：**

```text
total 12M
drwx------ 2 root root 4.0K Mar 11 02:00 nginx
-rw------- 1 root root  356 Mar 11 02:00 .env
-rw-r--r-- 1 root root  11M  Mar 11 02:00 db.dump
-rw-r--r-- 1 root root  812 Mar 11 02:00 docker-compose.yml
-rw-r--r-- 1 root root  420 Mar 11 02:00 meta.txt
-rw-r--r-- 1 root root  128 Mar 11 02:00 SHA256SUMS
-rw-r--r-- 1 root root  1.2M Mar 11 02:00 uploads.tar.gz
```

**逐行读：**

| 文件 | 判断 |
|---|---|
| `db.dump` 11M | 合理（假设 3 万条对话） |
| `uploads.tar.gz` 1.2M | 有上传文件 |
| `.env` 权限 600 | ✅ 正确 |
| `meta.txt` | 记录了版本 |

**看 meta：**

```bash
cat /opt/app/backup/20260311-0200/meta.txt
```

**应该看到：**

```text
备份时间：2026-03-11 02:00:04
应用版本：1.2.0
镜像列表：
NAME             IMAGE               COMMAND                  SERVICE    CREATED       STATUS         PORTS
chatapp-app      chat-app:1.2.0      "docker-entrypoint.s…"   app        2 days ago    Up 2 days      3000/tcp
磁盘：
/dev/vdb1       400G   38G  342G  10% /opt/app
```

**`应用版本：1.2.0` 这一行很关键。**

```text
恢复的时候你要知道这个备份是哪个版本的数据。
1.2.0 的备份恢复到 1.3.0 的系统上，可能需要跑迁移。
```

## 2.5 配定时任务

```bash
crontab -e
```

**加一行：**

```text
0 2 * * * /opt/app/scripts/backup.sh >> /opt/app/logs/backup.log 2>&1
```

**验证：**

```bash
crontab -l
```

**应该看到：**

```text
0 2 * * * /opt/app/scripts/backup.sh >> /opt/app/logs/backup.log 2>&1
```

**为什么 `>> log 2>&1`：**

```text
cron 执行的东西你看不到屏幕。
不重定向，出错你永远不知道。
```

**第二天检查：**

```bash
tail -20 /opt/app/logs/backup.log
```

**应该看到昨天的完整输出。**

## 2.6 ⚠️ 备份的三个致命误区

**误区一：备份在本机同一块盘上**

```text
硬盘坏了，系统和备份一起没。
备份必须在另一块盘、另一台机器、或客户的备份服务器上。
```

**正确做法：**

```text
① 客户有备份服务器 → rsync 过去
② 没有 → 至少拷到 /data 之外的另一块盘
③ 内网环境不能上云 → 用移动硬盘定期拷，写进运维手册
```

**误区二：备份里带着密码，随便放**

```text
$DEST/.env 里是数据库密码。
备份目录被拷到 U 盘，密码就跟着走了。
```

**正确做法：**

```text
① 备份目录权限 700
② 备份文件如果要拷出去，先打包加密：
   tar -czf - 20260311-0200 | openssl enc -aes-256-cbc -out backup.tar.gz.enc
③ 密码单独交给客户
```

**误区三：从来没恢复过**

```text
你有一个 30 天的备份，但你不知道能不能恢复。
真出事的时候，第一次尝试恢复。
```

**这一条第 3 步专门练。**

---

# 第 3 步：恢复演练（25 分钟）

## 3.1 为什么必须演练

```text
备份文件存在 ≠ 备份可用。
可能的问题：
① 文件损坏
② pg_dump 版本和 pg_restore 版本不兼容
③ 恢复到一个已经有数据的库，主键冲突
④ 权限不对，恢复失败
```

**这四种，只有真恢复一次才能发现。**

## 3.2 恢复到一个临时库（不影响生产）

**先建一个空库：**

```bash
docker compose exec postgres psql -U chatapp -d postgres -c "CREATE DATABASE chatapp_restore_test;"
```

**应该看到：**

```text
CREATE DATABASE
```

**恢复：**

```bash
docker compose exec -T postgres \
  pg_restore -U chatapp -d chatapp_restore_test --no-owner < /opt/app/backup/20260311-0200/db.dump
```

**应该看到：没有输出。**

**`--no-owner` 是什么：**

```text
恢复时不设置属主。
因为我们用的是不同的账号恢复，设置属主会报"角色不存在"。
```

**如果看到一堆警告：**

```text
pg_restore: warning: errors ignored on restore: 3
```

**要具体看是什么错。** 常见的是扩展不存在（如 `uuid-ossp`），可以忽略；主键冲突不能忽略。

## 3.3 验证数据

```bash
docker compose exec postgres psql -U chatapp -d chatapp_restore_test -c "
SELECT
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM messages) AS messages,
  (SELECT max(created_at) FROM messages) AS latest;
"
```

**应该看到：**

```text
 users | messages |            latest
-------+----------+-------------------------------
    12 |     3284 | 2026-03-11 01:58:42.113+08
(1 row)
```

**逐列读：**

| 列 | 意思 | 判断 |
|---|---|---|
| `users 12` | 12 个用户 | 和后台看到的一致吗 |
| `messages 3284` | 3284 条消息 | 和备份时间点对得上吗 |
| `latest 01:58` | 最后一条是凌晨 1:58 | 备份是 2:00，差 2 分钟，合理 |

**如果 `users` 是 0：**

```text
备份是空的。回去看 backup.sh 的 db.dump 大小检查为什么没拦住。
```

## 3.4 删掉测试库

```bash
docker compose exec postgres psql -U chatapp -d postgres -c "DROP DATABASE chatapp_restore_test;"
```

**应该看到：**

```text
DROP DATABASE
```

**⚠️ 不要在生产库上试恢复。**

```text
DROP DATABASE 会连数据一起删，没有确认，没有回收站。
一定要用 _test 后缀的库。
```

## 3.5 演练记录表

| 项目 | 内容 |
|---|---|
| 演练日期 | 2026-03-11 |
| 备份文件 | `backup/20260311-0200/db.dump` |
| 备份版本 | 1.2.0 |
| 恢复耗时 | 18 秒 |
| 恢复后用户数 | 12 |
| 恢复后消息数 | 3284 |
| 是否一致 | 是 |
| 发现的问题 | 无 |
| 演练人 | XXX |

**这张表要放进《运维手册》，并且每季度更新一次。**

**不更新的后果：**

```text
一年后客户问"备份能恢复吗"，你只能说"应该能"。
```

---

# 第 4 步：升级脚本（30 分钟）

## 4.1 升级的六个阶段

```text
① 备份         —— 出问题能退
② 拉新镜像     —— 离线环境是 load
③ 停旧起新     —— 切换
④ 数据迁移     —— 改表结构
⑤ 冒烟检查     —— 确认能用
⑥ 失败回滚     —— 退回上一版
```

**顺序不能变。** 特别是①必须在③之前。

## 4.2 升级前检查清单

| 检查 | 命令 | 通过标准 |
|---|---|---|
| 当前版本 | `curl -s localhost/health` | 记录版本号 |
| 磁盘空间 | `df -h /opt/app` | 剩余 > 备份大小 × 2 |
| 备份完成 | `ls backup/` 最新目录 | 今天的，且 db.dump > 1K |
| 新镜像在本地 | `docker images` | 有新 tag |
| 迁移脚本 | `ls migrations/` | 有本次的迁移文件 |
| 客户已知情 | 邮件/工单 | 有书面同意 |

**最后一条最容易漏。**

```text
客户不知道你要升级，正好在用，你重启了服务。
客户投诉"系统突然打不开"。
```

## 4.3 upgrade.sh 全文

**文件：`/opt/app/scripts/upgrade.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

NEW_VERSION="${1:-}"
[ -n "$NEW_VERSION" ] || { echo "用法：$0 <新版本号，如 1.3.0>"; exit 1; }

APP_DIR="/opt/app"
cd "$APP_DIR"

log() { echo "[$(date '+%F %T')] $*"; }
fail() { log "失败：$*"; exit 1; }

OLD_VERSION="$(curl -s http://127.0.0.1/health | sed 's/.*"version":"\([^"]*\)".*/\1/')"
[ "$OLD_VERSION" != "unknown" ] || fail "读不到当前版本，先检查服务"
log "当前版本：$OLD_VERSION → 目标版本：$NEW_VERSION"

# ---------- 1. 前置检查 ----------
log "检查新镜像"
docker image inspect "chat-app:$NEW_VERSION" >/dev/null 2>&1 \
  || fail "本地没有 chat-app:$NEW_VERSION，请先 docker load"

log "检查磁盘"
AVAIL=$(df --output=avail -m "$APP_DIR" | tail -1)
[ "$AVAIL" -gt 2048 ] || fail "剩余空间不足 2G（当前 ${AVAIL}M）"

# ---------- 2. 备份 ----------
log "执行备份"
./scripts/backup.sh || fail "备份失败，终止升级"
LATEST_BACKUP="$(ls -td backup/*/ | head -1)"
log "备份位置：$LATEST_BACKUP"

# ---------- 3. 记录当前镜像 ----------
echo "$OLD_VERSION" > /tmp/.rollback_version
log "回滚版本已记录：$OLD_VERSION"

# ---------- 4. 切换镜像 ----------
log "切换 compose 中的镜像版本"
sed -i "s|image: chat-app:.*|image: chat-app:$NEW_VERSION|" docker-compose.yml

# ---------- 5. 起新版本 ----------
log "启动 $NEW_VERSION"
docker compose up -d app || fail "启动失败"

# ---------- 6. 等待健康 ----------
log "等待健康检查"
OK=0
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/health >/dev/null 2>&1; then
    OK=1
    log "健康检查通过（第 ${i} 次）"
    break
  fi
  sleep 2
done
[ "$OK" -eq 1 ] || { log "健康检查超时，准备回滚"; ./scripts/rollback.sh; exit 1; }

# ---------- 7. 冒烟检查 ----------
log "冒烟检查"
SMOKE=$(curl -s http://127.0.0.1/health)
echo "$SMOKE" | grep -q "\"version\":\"$NEW_VERSION\"" \
  || { log "版本号不匹配：$SMOKE"; ./scripts/rollback.sh; exit 1; }
echo "$SMOKE" | grep -q '"db":"ok"' \
  || { log "数据库不可用：$SMOKE"; ./scripts/rollback.sh; exit 1; }

# ---------- 8. 完成 ----------
log "升级完成：$OLD_VERSION → $NEW_VERSION"
log "备份保留在：$LATEST_BACKUP"
docker compose ps
```

## 4.4 逐段读关键行

| 行 | 作用 | 去掉会怎样 |
|---|---|---|
| `[ -n "$NEW_VERSION" ]` | 必须传版本号 | 误操作传空，把镜像 tag 改成空 |
| `docker image inspect` | 新镜像在不在 | 起不来才发现没 load |
| `df --output=avail -m` | 剩余空间（M） | 备份写到一半磁盘满 |
| `backup.sh \|\| fail` | 备份失败就停 | 没备份就升级，出事无法恢复 |
| `echo "$OLD_VERSION" > /tmp/...` | 记下旧版本 | 回滚时不知道退回哪个 |
| `sed -i "s\|image: chat-app:.*\|..."` | 改 compose 里的 tag | 手动改容易漏 |
| `for i in $(seq 1 30)` | 最多等 60 秒 | 无限等，卡死 |
| `grep version` | 确认真的是新版本 | 起了个旧容器也算"起来了" |
| `rollback.sh` | 失败自动回滚 | 停在半坏状态 |

**`sed` 那个写法要注意：**

```bash
sed -i "s|image: chat-app:.*|image: chat-app:$NEW_VERSION|" docker-compose.yml
```

```text
用 | 当分隔符，因为版本号里可能有 /（如 1.3.0-rc1）。
用 / 当分隔符会冲突。
```

## 4.5 版本号改了，`.env` 要不要改

**要。如果新版本有新的环境变量：**

```bash
# 对比新旧 .env.example
diff /opt/offline/offline-package/config/.env.example /opt/app/.env
```

**应该看到：**

```text
12a13
> NEW_FEATURE_ENABLED=true
```

**`12a13` 的意思：**

```text
在第 12 行后追加了第 13 行。
a = add。
```

**加上去：**

```bash
echo "NEW_FEATURE_ENABLED=true" >> /opt/app/.env
```

**再 `up -d`。**

**为什么不在 upgrade.sh 里自动合并：**

```text
.env 里有客户的密码，自动合并容易覆盖。
宁可让人看一眼，也不要自动化出错。
```

---

# 第 5 步：数据迁移要向前兼容（25 分钟）

## 5.1 什么叫"向前兼容"

```text
老数据在新版本里能正常读。
新版本写的数据，老版本尽量也能读（这样回滚才不会丢数据）。
```

**这是回滚能不能成功的关键。**

## 5.2 三种迁移，只有一种安全

**❌ 危险：删列**

```sql
ALTER TABLE users DROP COLUMN phone;
```

```text
新版本不用这个字段了，删掉很干净。
但回滚到旧版本时，旧代码要读 phone，报"column does not exist"。
```

**❌ 危险：改列类型**

```sql
ALTER TABLE messages ALTER COLUMN content TYPE varchar(1000);
```

```text
旧版本写的长文本会被截断或报错。
回滚后写入失败。
```

**✅ 安全：只加不减**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS department varchar(100);
```

```text
新列有默认值或允许为空，旧版本不读它，完全不受影响。
新版本读它，老数据是 NULL，代码要能处理 NULL。
```

## 5.3 迁移脚本怎么组织

```text
migrations/
├── 001_init.sql
├── 002_add_users.sql
├── 003_add_messages_index.sql
├── 004_add_department.sql        ← 本次升级
```

**每次迁移只做一件事，按编号顺序执行。**

**迁移记录表：**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version varchar(50) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

**执行迁移的脚本：**

```bash
#!/usr/bin/env bash
set -euo pipefail
for f in migrations/*.sql; do
  v="$(basename "$f" .sql)"
  applied=$(docker compose exec -T postgres psql -tA -U chatapp -d chatapp \
    -c "SELECT count(*) FROM schema_migrations WHERE version='$v'")
  if [ "$applied" = "0" ]; then
    echo "执行 $v"
    docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U chatapp -d chatapp -f - < "$f"
    docker compose exec -T postgres psql -U chatapp -d chatapp \
      -c "INSERT INTO schema_migrations(version) VALUES ('$v')"
  else
    echo "跳过 $v（已执行）"
  fi
done
```

**逐行读：**

| 行 | 作用 |
|---|---|
| `psql -tA` | 只输出值，不要表头和边框 |
| `count(*)` | 判断有没有执行过 |
| `-v ON_ERROR_STOP=1` | 出错立刻停，不继续执行后面的 |
| `-f -` | 从标准输入读 SQL |

**为什么要有 `schema_migrations` 表：**

```text
没有它，你不知道哪些迁移跑过了。
重复跑 004_add_department，会报 "column already exists"，升级失败。
```

## 5.4 迁移失败怎么办

**现象：**

```text
执行 004_add_department.sql
ERROR:  column "department" of relation "users" already exists
```

**原因：**

```text
这个迁移之前跑过一半（加了列，但没写进 schema_migrations）。
```

**修：**

```sql
-- 先确认列在不在
\d users

-- 如果列在，补记录
INSERT INTO schema_migrations(version) VALUES ('004_add_department');
```

**更好的写法：**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS department varchar(100);
```

**`IF NOT EXISTS` 让迁移可以重复执行（幂等）。**

**这是写迁移脚本的第一原则：**

```text
每个迁移脚本都要能安全地跑两遍。
```

## 5.5 迁移和回滚的关系

```text
如果迁移是"只加列"，回滚时不用改数据库结构，旧代码不读新列就行。
如果迁移是"删列/改类型"，回滚必须恢复备份，会丢掉升级后写入的数据。
```

**所以：**

| 迁移类型 | 回滚方式 | 数据损失 |
|---|---|---|
| 只加列 | 换回旧镜像 | 无 |
| 加表 | 换回旧镜像 | 无 |
| 删列 | 恢复备份 | **升级后的数据全丢** |
| 改类型 | 恢复备份 | **升级后的数据全丢** |

**结论：**

```text
私有化项目里，尽量只用"加"。
要"删"，等两个版本之后，确认不会回滚了再删。
```

---

# 第 6 步：回滚脚本（25 分钟）

## 6.1 回滚不是"撤销升级"

**很多人以为回滚是"把刚才做的事反过来"。**

**实际上不是。回滚是三件事：**

```text
① 把应用镜像换回旧版本        —— 这个容易
② 把数据库结构退回去          —— 这个很难，通常不退
③ 把升级后写入的数据怎么办    —— 这个最难
```

## 6.2 两种回滚，风险完全不同

| 情况 | 做法 | 数据影响 | 耗时 |
|---|---|---|---|
| 迁移是"只加列" | 换回旧镜像 | 升级后的数据都在，旧版本不读新列 | 1—2 分钟 |
| 迁移是"删列/改类型" | 恢复备份 + 换回旧镜像 | **升级后写入的数据全部丢失** | 30 分钟—2 小时 |

**所以回滚脚本要分两步：先试轻的，不行再重的。**

## 6.3 rollback.sh 全文

**文件：`/opt/app/scripts/rollback.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/app"
cd "$APP_DIR"

log() { echo "[$(date '+%F %T')] $*"; }

OLD_VERSION_FILE="/tmp/.rollback_version"
[ -f "$OLD_VERSION_FILE" ] || { log "找不到回滚版本记录，请手动指定"; exit 1; }
OLD_VERSION="$(cat "$OLD_VERSION_FILE")"

CURRENT_VERSION="$(curl -s http://127.0.0.1/health | sed 's/.*"version":"\([^"]*\)".*/\1/' || echo unknown)"
log "当前版本：$CURRENT_VERSION，回滚到：$OLD_VERSION"

# ---------- 1. 确认旧镜像还在 ----------
if ! docker image inspect "chat-app:$OLD_VERSION" >/dev/null 2>&1; then
  log "错误：本地没有 chat-app:$OLD_VERSION，无法快速回滚"
  log "需要从离线包重新 load，或恢复备份"
  exit 1
fi

# ---------- 2. 换回旧镜像 ----------
log "切换镜像到 $OLD_VERSION"
sed -i "s|image: chat-app:.*|image: chat-app:$OLD_VERSION|" docker-compose.yml

log "重启应用"
docker compose up -d app

# ---------- 3. 等待健康 ----------
log "等待健康检查"
OK=0
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/health >/dev/null 2>&1; then
    OK=1
    log "健康检查通过（第 ${i} 次）"
    break
  fi
  sleep 2
done

if [ "$OK" -ne 1 ]; then
  log "回滚后仍不健康。需要恢复备份。"
  log "备份位置：$(ls -td backup/*/ | head -1)"
  log "恢复命令见《运维手册》第 6 节"
  exit 1
fi

# ---------- 4. 冒烟 ----------
SMOKE="$(curl -s http://127.0.0.1/health)"
log "健康状态：$SMOKE"
echo "$SMOKE" | grep -q '"db":"ok"' || log "警告：数据库状态异常"

log "回滚完成：$CURRENT_VERSION → $OLD_VERSION"
log "注意：数据库中可能已包含新版本写入的数据，请验证关键业务"
docker compose ps
```

## 6.4 逐段读

| 段 | 关键 | 为什么 |
|---|---|---|
| 读 `/tmp/.rollback_version` | 回滚目标 | 升级时自动写的 |
| `docker image inspect` 检查旧镜像 | **最容易失败的一步** | 用 latest 的话旧镜像已经没了 |
| `sed` 改回旧 tag | 换镜像 | 不能手工改，容易漏 |
| `up -d app` | 重建容器 | `restart` 不会换镜像 |
| 健康循环 | 确认起来了 | 不确认等于没回滚 |
| 打印备份位置 | 下一步指引 | 起不来时人要立刻知道去哪 |

**⚠️ `/tmp/.rollback_version` 的坑：**

```text
/tmp 在重启后会被清空（某些系统配置了 tmpfs）。
如果升级当天服务器重启了，这个文件就没了，回滚脚本不知道退回哪个版本。
```

**更稳的做法：写到持久目录**

```bash
echo "$OLD_VERSION" > /opt/app/.rollback_version
```

**并且升级成功后，不要立刻删这个文件。**

```text
保留到下一次升级，或者保留 7 天。
```

## 6.5 冒烟检查清单

**"健康检查通过"不等于"系统能用"。**

| 检查 | 命令 | 通过标准 |
|---|---|---|
| 首页 | `curl -I http://127.0.0.1/` | 200 |
| 健康 | `curl -s http://127.0.0.1/health` | `db:ok` |
| 版本 | 同上 | 是目标版本 |
| 登录 | 浏览器登录 | 能进 |
| 问一句 | 页面上问一个固定问题 | 有回答，且内容相关 |
| 历史记录 | 打开历史列表 | 能看到升级前的记录 |
| 上传 | 传一个小文件 | 成功 |
| 日志 | `docker compose logs app --tail 20` | 没有 ERROR |

**八项里至少做前五项。**

**第 6 项最容易被忽略，也最能暴露问题：**

```text
升级后老数据读不出来，是最常见的兼容性 bug。
健康检查发现不了，只有打开列表才看得到。
```

## 6.6 真回滚到备份（最坏情况）

**触发条件：**

```text
旧版本读不了新数据（迁移删了列/改了类型）。
```

**步骤：**

```bash
# ① 停应用，避免继续写入
docker compose stop app

# ② 备份当前数据（哪怕它是坏的，也先留一份）
docker compose exec -T postgres pg_dump -U chatapp -d chatapp -Fc > /tmp/before-restore.dump

# ③ 删库重建
docker compose exec postgres psql -U chatapp -d postgres -c "DROP DATABASE chatapp;"
docker compose exec postgres psql -U chatapp -d postgres -c "CREATE DATABASE chatapp OWNER chatapp;"

# ④ 恢复
docker compose exec -T postgres pg_restore -U chatapp -d chatapp --no-owner < /opt/app/backup/20260311-0200/db.dump

# ⑤ 换回旧镜像并启动
sed -i "s|image: chat-app:.*|image: chat-app:1.2.0|" docker-compose.yml
docker compose up -d app
```

**⚠️ 第 ③ 步是不可逆的。**

```text
DROP DATABASE 没有确认，没有回收站。
执行前必须确认 ② 的备份文件存在且大于 1K：

ls -lh /tmp/before-restore.dump
```

**这就是为什么升级前必须备份：**

```text
升级前的备份是"能回到过去"的唯一手段。
升级后写入的数据，在真回滚时一定会丢。
```

---

# 第 7 步：完整演练一遍（30 分钟）

## 7.1 演练目标

```text
在校验环境里，故意让升级失败，验证 rollback.sh 能救回来。
```

**必须真的做一次。** 只看课件不算。

## 7.2 演练步骤

**准备：**

```bash
# 记录当前状态
curl -s http://127.0.0.1/health
docker compose images
```

**应该看到：**

```text
{"status":"ok","db":"ok","version":"1.2.0"}
```

**第一步：造一个"坏"的新版本**

```bash
# 复制一个镜像，打上 1.3.0 的 tag，但故意让它起不来
docker tag chat-app:1.2.0 chat-app:1.3.0
```

**为什么这样能造出"坏版本"：**

```text
镜像内容一样，但版本号是 1.3.0。
upgrade.sh 的冒烟检查会看 /health 返回的 version 是不是 1.3.0，
而实际返回的是 1.2.0（因为代码里的 APP_VERSION 没变），所以判失败。
这正好模拟了"新版本起来了但不对"的情况。
```

**第二步：跑升级**

```bash
./scripts/upgrade.sh 1.3.0
```

**应该看到：**

```text
[2026-03-11 10:02:01] 当前版本：1.2.0 → 目标版本：1.3.0
[2026-03-11 10:02:01] 检查新镜像
[2026-03-11 10:02:01] 检查磁盘
[2026-03-11 10:02:01] 执行备份
[2026-03-11 10:02:04] 备份位置：backup/20260311-1002/
[2026-03-11 10:02:04] 回滚版本已记录：1.2.0
[2026-03-11 10:02:04] 切换 compose 中的镜像版本
[2026-03-11 10:02:04] 启动 1.3.0
[+] Running 1/1
 ✔ Container chatapp-app  Started
[2026-03-11 10:02:06] 等待健康检查
[2026-03-11 10:02:08] 健康检查通过（第 2 次）
[2026-03-11 10:02:08] 冒烟检查
[2026-03-11 10:02:08] 版本号不匹配：{"status":"ok","db":"ok","version":"1.2.0"}
[2026-03-11 10:02:08] 当前版本：1.2.0，回滚到：1.2.0
...
```

**逐行读：**

| 行 | 说明 |
|---|---|
| `备份位置：backup/20260311-1002/` | **升级前自动备份了** |
| `回滚版本已记录：1.2.0` | 记下了退路 |
| `健康检查通过` | 容器起来了 |
| `版本号不匹配` | **冒烟检查发现了问题** |
| 自动调用 rollback | 不需要人工干预 |

**这就是"升级失败自动回滚"的完整链路。**

**第三步：确认回到了 1.2.0**

```bash
curl -s http://127.0.0.1/health
```

**应该看到：**

```text
{"status":"ok","db":"ok","version":"1.2.0"}
```

```bash
grep "image: chat-app" docker-compose.yml
```

**应该看到：**

```text
    image: chat-app:1.2.0
```

**第四步：验证数据还在**

```bash
docker compose exec postgres psql -U chatapp -d chatapp -c "SELECT count(*) FROM messages;"
```

**应该看到和演练前一样的数字。**

## 7.3 演练记录表

```markdown
# 升级回滚演练记录

| 项目 | 内容 |
|---|---|
| 演练日期 | 2026-03-11 10:02 |
| 演练环境 | 客户现场测试机 / 自建测试环境 |
| 起始版本 | 1.2.0 |
| 目标版本 | 1.3.0（人为构造的失败版本） |
| 失败原因 | 冒烟检查发现版本号不匹配 |
| 是否自动回滚 | 是 |
| 回滚耗时 | 18 秒 |
| 回滚后版本 | 1.2.0 |
| 回滚后数据 | messages 3284 条，与升级前一致 |
| 备份位置 | /opt/app/backup/20260311-1002/ |
| 发现的问题 | /tmp/.rollback_version 在重启后会丢，已改到 /opt/app/ |
| 演练人 | XXX |
| 客户见证 | 张工 |
```

**"发现的问题"这一栏必须写真实内容。**

```text
写"没有问题"说明你没认真做，或者你没看懂。
每次演练都应该发现至少一个小问题。
```

## 7.4 演练要演练的四个场景

| 场景 | 怎么造 | 验证什么 |
|---|---|---|
| 新版本起不来 | 镜像 tag 存在但内容坏 | 健康检查超时 → 回滚 |
| 新版本起来了但版本不对 | 如 7.2 的做法 | 冒烟检查 → 回滚 |
| 数据库连不上 | 改错 `.env` 的密码 | 健康检查 `db:down` → 回滚 |
| 升级后老数据读不出 | 手动删一列 | 冒烟第 6 项（历史列表）→ 恢复备份 |

**四个场景，四种失败方式。**

**做完这四个，你才算真的会回滚。**

---

# 第 8 步：故意犯 6 个错（35 分钟）

## 错误 1：用 `latest` 升级，回滚时旧镜像没了

**操作：**

```bash
docker build -t chat-app:latest .
docker compose up -d
```

**会怎样：**

**一周后要回滚：**

```bash
docker images | grep chat-app
```

```text
chat-app   latest   9a8b7c6d5e4f   2 days ago   182MB
```

**只有一个 `latest`，指向新版本。**

**旧版本被覆盖了。**

```bash
./scripts/rollback.sh
```

```text
[10:20:01] 当前版本：1.3.0，回滚到：1.2.0
[10:20:01] 错误：本地没有 chat-app:1.2.0，无法快速回滚
[10:20:01] 需要从离线包重新 load，或恢复备份
```

**为什么：**

```text
镜像 tag 是"别名"，不是"副本"。
docker build -t chat-app:latest 会把 latest 指向新镜像，
旧镜像变成 <none>（悬空镜像），可能被 docker image prune 清掉。
```

**怎么修：**

```bash
# 现场只能从离线包重新 load
docker load -i /opt/offline/offline-package/images/chat-app-1.2.0.tar
```

**如果没有离线包：**

```text
只能恢复备份（会丢升级后的数据），或者重新构建 1.2.0（需要源码和网络）。
```

**正确做法：**

```text
每次构建都用版本号 tag，永远不用 latest。
chat-app:1.2.0、chat-app:1.3.0 同时保留。
磁盘不够就删更老的（1.1.0），但至少保留当前和上一个。
```

**检查你的 tag 策略：**

```bash
docker images --format '{{.Repository}}:{{.Tag}}' | grep chat-app
```

**应该看到至少两个版本。**

## 错误 2：没备份就升级，迁移删了列

**操作：**

```bash
docker compose up -d app    # 直接起新版本，跳过备份
```

**新版本跑了这个迁移：**

```sql
ALTER TABLE users DROP COLUMN phone;
```

**会怎样：**

**升级成功，跑了两天，客户说新版本有个功能不好用，要退回。**

```bash
./scripts/rollback.sh
```

**回滚成功，但：**

```text
客户：我的用户手机号怎么都没了？
你：旧版本要读 phone 字段，但数据库里已经删了……
```

**为什么：**

```text
DROP COLUMN 是不可逆的。
回滚只换了镜像，数据库结构还是新的（没有 phone 列）。
旧代码查询 SELECT phone FROM users 报错：
ERROR: column "phone" does not exist
```

**怎么修：**

**只能恢复备份：**

```bash
docker compose stop app
docker compose exec -T postgres pg_restore -U chatapp -d chatapp --clean --no-owner \
  < /opt/app/backup/20260309-0200/db.dump
```

**`--clean` 是什么：**

```text
恢复前先 DROP 掉已存在的对象。
不加会报"relation already exists"。
```

**⚠️ 但备份是升级前的，升级后两天的数据全丢。**

**正确做法：**

```text
① 升级前必须备份（upgrade.sh 里已经强制了）
② 迁移只用"加"，不用"删"
③ 要删列，等两个版本，确认不会回滚了再删
```

## 错误 3：用 `restart` 换镜像，没生效

**操作：**

```bash
sed -i 's/image: chat-app:1.2.0/image: chat-app:1.3.0/' docker-compose.yml
docker compose restart app
```

**会怎样：**

```bash
curl -s http://127.0.0.1/health
```

```text
{"status":"ok","db":"ok","version":"1.2.0"}
```

**还是旧版本。**

```bash
docker compose ps
```

```text
NAME           IMAGE             STATUS
chatapp-app    chat-app:1.2.0    Up 3 seconds
```

**为什么：**

```text
restart 只是"重启现有容器"，容器的镜像是创建时定下的，不会因为 compose 文件改了而变。
要换镜像必须"重建容器"，即 up -d（它会发现配置变化，重建）。
```

**怎么修：**

```bash
docker compose up -d app
```

**验证：**

```bash
docker compose ps --format '{{.Name}} {{.Image}}'
```

**应该看到：**

```text
chatapp-app chat-app:1.3.0
```

**记住这一条：**

```text
改配置（镜像、环境变量、端口）→ up -d
只想重启进程 → restart
```

**`up -d` 的智能之处：**

```text
它对比"期望状态"和"当前状态"，只重建有变化的容器。
没变的容器不动。所以它比 down + up 更安全。
```

## 错误 4：迁移脚本重复执行

**操作：**

升级失败，你重跑 `upgrade.sh`。

**会怎样：**

```text
执行 004_add_department.sql
ERROR:  column "department" of relation "users" already exists
```

**升级又失败了。**

**为什么：**

```text
上一次执行到一半：列加上了，但写 schema_migrations 之前失败了。
重跑时列已存在，SQL 报错，脚本 set -e 退出。
```

**怎么修：**

**临时：**

```sql
INSERT INTO schema_migrations(version) VALUES ('004_add_department')
ON CONFLICT DO NOTHING;
```

**根治：迁移脚本要幂等**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS department varchar(100);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
```

**三个 `IF NOT EXISTS`：**

| 语句 | 幂等写法 |
|---|---|
| 加列 | `ADD COLUMN IF NOT EXISTS` |
| 建表 | `CREATE TABLE IF NOT EXISTS` |
| 建索引 | `CREATE INDEX IF NOT EXISTS` |

**不能幂等的操作怎么办：**

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='department') THEN
    ALTER TABLE users ADD COLUMN department varchar(100);
  END IF;
END $$;
```

**`DO $$ ... $$` 是什么：**

```text
PostgreSQL 的匿名代码块，可以写 IF 判断。
$$ 是分隔符，避免里面的引号冲突。
```

## 错误 5：cron 里的 `docker compose exec` 报不是 TTY

**操作：**

```bash
crontab -e
```

```text
0 2 * * * /opt/app/scripts/backup.sh
```

**第二天看日志：**

```text
the input device is not a TTY
```

**为什么：**

```text
docker compose exec 默认要分配一个终端（-T 就是关掉它）。
cron 执行时没有终端，所以报错。
```

**怎么修：**

```bash
docker compose exec -T postgres pg_dump ...
```

**`-T` 的作用：**

```text
不分配伪终端。
适合脚本、cron、CI 这类没有交互终端的场景。
```

**同类问题还有：**

| 命令 | 在 cron 里要加什么 |
|---|---|
| `docker compose exec` | `-T` |
| `docker compose run` | `-T` |
| `ssh` | `-n` 或 `-T` |
| `psql` | 不用，但要设 `PGPASSWORD` |

**验证方法：**

```bash
# 模拟无终端环境
setsid /opt/app/scripts/backup.sh < /dev/null
```

**能跑通，cron 就能跑通。**

## 错误 6：`find -mtime` 写错，把备份全删了

**操作：**

```bash
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +3 -exec rm -rf {} \;
```

**你想写"保留 30 天"，写成了 3。**

**会怎样：**

```bash
ls /opt/app/backup/
```

```text
20260309-0200
20260310-0200
20260311-0200
```

**只剩三天。**

**更糟的情况：**

```bash
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +0 -exec rm -rf {} \;
```

```text
把今天之前的全删了，包括昨天的。
```

**为什么危险：**

```text
find 的 -mtime 按"24 小时"算，不是按日历天。
-mtime +0 意思是"超过 0 个 24 小时"，几乎匹配所有目录。
写错一个数字，备份全没，而且不可恢复。
```

**怎么修：**

**先不加 `-exec`，只打印：**

```bash
find /opt/app/backup -maxdepth 1 -type d -mtime +30 -print
```

**应该看到：**

```text
/opt/app/backup/20260201-0200
/opt/app/backup/20260202-0200
```

**确认要删的是这些，再加 `-exec rm -rf`。**

**更安全的写法：**

```bash
find "$BACKUP_ROOT" -maxdepth 1 -type d -name "20*" -mtime +30 -print0 \
  | xargs -0 -r rm -rf
```

**逐段读：**

| 部分 | 作用 |
|---|---|
| `-name "20*"` | 只匹配日期目录，不匹配其他目录 |
| `-print0` | 用 null 分隔，防止文件名有空格 |
| `xargs -0 -r` | 按 null 分隔读，`-r` 表示没输入就不执行 |

**⚠️ 还有一条铁律：**

```text
任何带 rm -rf 的定时任务，第一次上线必须先跑"只打印"版本，观察一周。
```

---

# 第 9 步：写学习笔记（10 分钟）

**把下面这份模板复制到 `02-笔记/NOTES.md`，然后填。**

````markdown
# 第 237 节课学习笔记

## 一、版本号三段式

```text
v_._.__
```

| 改了什么 | 升哪一位 | 例子 |
|---|---|---|
| 修 bug | | |
| 加功能 | | |
| 换架构 | | |

## 二、版本号必须出现在哪四个地方

1.
2.
3.
4.

## 三、备份清单

| 内容 | 路径 | 体积 | 要不要备 |
|---|---|---|---|
| 数据库 | | | |
| 上传文件 | | | |
| 配置文件 | | | |
| 证书 | | | |
| 模型 | | | |

## 四、我的备份脚本里，哪三行最关键

1.
2.
3.

## 五、恢复演练记录

| 项目 | 内容 |
|---|---|
| 备份文件 | |
| 恢复耗时 | |
| 恢复后用户数 | |
| 恢复后消息数 | |
| 是否一致 | |

## 六、升级六个阶段

1.
2.
3.
4.
5.
6.

## 七、回滚的两种方式

| 情况 | 做法 | 数据影响 |
|---|---|---|
| 迁移只加列 | | |
| 迁移删列/改类型 | | |

## 八、六个错误

| 错误 | 现象 | 修法 |
|---|---|---|
| 用 latest | | |
| 没备份 | | |
| restart 换镜像 | | |
| 迁移重复 | | |
| cron 没 -T | | |
| find 写错 | | |

## 九、我的演练发现了什么问题

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] 我有 backup.sh、upgrade.sh、rollback.sh 三个脚本
- [ ] 我跑通过一次备份
- [ ] 我做过一次恢复演练，数据对得上
- [ ] 我做过一次"升级失败自动回滚"演练
- [ ] 我知道 `restart` 和 `up -d` 的区别
- [ ] 我的迁移脚本是幂等的
````

---

# 第 10 步：课后练习（70 分钟）

## 练习 1：给备份加一个"异地"

**要求：**

在 backup.sh 最后加一步，把备份 rsync 到客户另一台机器（或另一块盘）。

**记录什么：**

```bash
rsync -avz --delete /opt/app/backup/ backup-host:/backup/chat-app/
```

```text
这条命令每部分干什么。
--delete 为什么危险。
```

**思考题：**

```text
如果客户只有一台机器，你怎么做"异地"？写进运维手册的话怎么写？
```

## 练习 2：写一个幂等的迁移

**要求：**

写一个"给 users 加 last_login_at 列 + 建索引"的迁移，要求跑两遍都不报错。

**记录什么：**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);
```

```text
第二遍执行的输出是什么。
```

**思考题：**

```text
如果要"删一列"，怎么写成幂等的？为什么私有化项目里要慎用？
```

## 练习 3：造三个失败场景

**要求：**

按 7.4 的四个场景，至少做三个，记录每次回滚是否成功。

**记录什么：**

| 场景 | 怎么造的 | 症状 | 回滚成功吗 | 耗时 |
|---|---|---|---|---|
| | | | | |

**思考题：**

```text
哪个场景 rollback.sh 救不回来？为什么？
```

## 练习 4：算一次回滚时间

**要求：**

从"发现故障"到"服务恢复"，列出每一步的耗时。

**记录什么：**

| 步骤 | 耗时 |
|---|---|
| 发现问题 | |
| 判断要回滚 | |
| 执行 rollback.sh | |
| 验证 | |
| **合计** | |

**思考题：**

```text
如果客户要求"故障恢复时间 < 30 分钟"，你现在的流程达标吗？
```

## 练习 5：写一页《升级操作手册》

**要求：**

给客户 IT 看的一页纸：什么时候升级、谁来批准、升级时他们要做什么、出事怎么联系。

**记录什么：**

```text
你要求客户做什么（提前通知用户？避开业务高峰？）
你承诺多久完成（含回滚）
```

**思考题：**

```text
如果客户说"我们白天不能停"，你的升级窗口怎么定？
```

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清版本号三段式各升什么时候
- [ ] 我能说清"备份"和"可恢复的备份"的区别
- [ ] 我能说清 `restart` 和 `up -d` 的区别
- [ ] 我能说清为什么迁移要"只加不减"

## B. 实操

- [ ] 我写了 backup.sh、upgrade.sh、rollback.sh
- [ ] 我跑通过备份，备份目录里有 db.dump、uploads、.env、meta
- [ ] 我做过恢复演练，数据条数对得上
- [ ] 我做了一次"升级失败 → 自动回滚"的完整演练
- [ ] 我验证过 `docker compose ps --format '{{.Image}}'` 换镜像成功

## C. 排错

- [ ] 我看到 `column ... already exists` 知道迁移不幂等
- [ ] 我看到 `the input device is not a TTY` 知道要加 `-T`
- [ ] 我看到版本号没变知道用了 `restart`
- [ ] 我知道 `/tmp` 里的文件重启会丢

## D. 交付

- [ ] `03-练习代码/` 里有三个脚本和演练记录
- [ ] 演练记录里有真实的耗时和数据条数
- [ ] 演练记录里写了"发现的问题"
- [ ] 备份脚本里有大小检查和清理策略

## E. 笔记

- [ ] `02-笔记/NOTES.md` 填完
- [ ] 我记录了演练结果
- [ ] 我能说出六个错误里任意四个的修法

## 本节课要能说出口的一句话

> **升级的底气不是"新版本没问题"，是"出问题我能退回去"。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 回滚时旧镜像没了 | 用了 latest | 每次用版本号 tag |
| `column already exists` | 迁移不幂等 | 加 `IF NOT EXISTS` |
| 升级后版本号没变 | 用了 restart | 改用 `up -d` |
| `not a TTY` | cron 里 exec | 加 `-T` |
| 备份只有几 K | 数据库没连上 | 看 pg_dump 报错，加大小检查 |
| 恢复报 `already exists` | 库里有旧对象 | `pg_restore --clean` |
| 备份把磁盘写满 | 没清理策略 | `find -mtime +30` |
| 备份全被删了 | `find` 参数写错 | 先 `-print` 再 `-exec rm` |
| 回滚后数据丢失 | 迁移删了列 | 恢复备份，接受丢数据 |
| 升级后老数据读不出 | 兼容性 bug | 冒烟检查第 6 项：看历史列表 |
| `/tmp/.rollback_version` 没了 | 重启清空 /tmp | 写到 `/opt/app/` |
| 升级时客户正在用 | 没提前通知 | 提前一天书面通知 |

---

## 下一节课要带什么

第 238 节课是这一周的收口：交付文档四件套。

你需要带着：

```text
这一周做的所有东西
install.sh / backup.sh / upgrade.sh / rollback.sh
交接单、售后说明、演练记录
确认单上的验收标准
```

**第 238 节课要把这些东西整理成客户能用的四份文档。**
