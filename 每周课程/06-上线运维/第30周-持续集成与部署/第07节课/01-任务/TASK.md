# 第 210 节课：收口——一条完整的流水线

> 前六节课你造了六个零件：触发、检查、测试、构建、部署、通知。
> 这节课把它们接成一条线，并且补上最后两个零件：**冒烟检查**和**自动回滚**。
> 从今天起，你的上线动作只有一个：`git push`。

**建议用时**：140 分钟
**你需要先完成**：第 209 节课（通知能收到）、第 208 节课（`deploy` 能跑通）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

**你有一条能跑的流水线，但它有一个缺口：**

```text
test ✅ → build ✅ → deploy ✅ → ？
```

**`deploy` 显示绿勾，只代表"SSH 命令执行完了"。**

**它不代表：**

```text
① 容器真的起来了
② 应用真的能响应请求
③ 数据库连接是通的
④ 新版本没有把某个接口改坏
```

**`docker compose up -d` 成功，容器可能 3 秒后就崩了。**

**这就是"部署成功"和"服务可用"的区别。**

## 0.2 你以后会遇到什么

```text
① 新版本少了一个环境变量，容器启动就退出，网站 502 了 40 分钟
② 新版本代码有个死循环，健康检查能过，但一请求就超时
③ 你部署完就睡了，第二天客户说"昨晚十点开始就打不开"
④ 你发现问题，手动回滚，但发现自己不记得上一个版本是哪个 sha
⑤ 回滚到上个版本，发现上个版本也有问题（因为它也没做过冒烟检查）
```

**这五个场景，需要两样东西：**

```text
① 冒烟检查：部署完立刻验证"关键功能还活着"
② 自动回滚：验证不过就自己退回上一个版本，不用等你醒
```

## 0.3 今天要建立的三个概念

```text
① 流水线（pipeline）：一串有依赖关系的 job，前一环失败后面不跑
② 冒烟检查（smoke test）：部署后对"真实运行的服务"做的最少验证
③ 回滚（rollback）：把服务切回上一个已知可用的版本
```

**三个词里最难的是第三个。** 因为"回滚"要求你**在部署前就准备好退路**。

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录 |
| `/srv/app/deploy.sh` | 服务器上 | 部署 + 记录上一个版本 |
| `/srv/app/rollback.sh` | 服务器上 | 切回上一个版本 |
| `.github/workflows/pipeline.yml` | `ci-lab/.github/workflows/` | 五个 job 的完整流水线 |
| 一次成功的回滚 | Actions 页面 | 必须亲手触发过一次 |

**最后一条：回滚必须演练。**

**没演练过的回滚，和没有回滚是一样的。**

---

# 第 1 步：先画出整条线（15 分钟）

## 1.1 五个 job，四条依赖

```text
push 到 main
   │
   ▼
┌────────┐
│  test  │  跑单元测试
└───┬────┘
    │ needs
    ▼
┌────────┐
│ build  │  构建镜像 + 推 GHCR（sha tag）
└───┬────┘
    │ needs
    ▼
┌────────┐
│ deploy │  SSH 上去 pull + up -d
└───┬────┘
    │ needs
    ▼
┌────────┐
│  smoke │  curl /health + curl 关键接口
└───┬────┘
    │
    ├── 通过 ──→ 结束（绿）
    │
    └── 失败 ──→ ┌──────────┐
                 │ rollback │  切回上一个 sha
                 └────┬─────┘
                      │
                      ▼
                 ┌──────────┐
                 │  notify  │  发一条"失败了，已回滚"
                 └──────────┘
```

**为什么是"一条线"而不是"并行"：**

```text
并行只能省时间，不能保证顺序
而"测试不过不构建、构建不过不部署"是这条流水线的全部价值
```

**唯一可以并行的是 `notify`：** 它应该"无论如何都跑"。

## 1.2 为什么回滚要放在 CI 里

**你也可以"手动回滚"：**

```bash
ssh root@47.98.xx.xx
/srv/app/rollback.sh
```

**但那样的话：**

```text
① 你必须醒着
② 你必须发现"出问题了"
③ 你必须记得"回滚命令是什么"
```

**放在 CI 里的好处：**

```text
① 冒烟检查一失败，5 秒内就回滚
② 回滚动作被记录在 Actions 里（有时间戳、有日志）
③ 你第二天能看到"昨晚自动回滚了一次，原因是 xxx"
```

**这就是"自动化"的真正含义：**

> **不是"让你少敲几条命令"，是"在你不在场的时候，系统也能做出正确决定"。**

## 1.3 回滚的前提：上一个版本必须有名字

**回滚的完整逻辑是：**

```text
当前跑的是 sha-3f7a1c2
上一个跑的是 sha-a1b2c3d
→ 出问题 → 把 compose 指向 sha-a1b2c3d
```

**所以服务器上必须记着"上一个是谁"。**

**这就是为什么第 207 节课反复强调"不要只用 latest"：**

```text
如果用 latest：
  现在 = latest
  上一个 = latest（同名，已经被覆盖）
  → 无法回滚
```

**记住这条链：**

```text
sha tag → 能回滚
latest  → 不能回滚
```

---

# 第 2 步：改服务器上的两个脚本（30 分钟）

## 2.1 为什么先改服务器

**因为 CI 只是"调用者"。**

**先让"部署"和"回滚"这两个动作在服务器上各自能独立成功，再让 CI 去调。**

**顺序反过来，你会把"脚本 bug"和"CI 配置 bug"搅在一起。**

## 2.2 新版的 `deploy.sh`

**它比第 208 节课的版本多了三件事：**

```text
① 部署前，把当前版本记到 .previous_sha
② 部署后做一次本地健康检查（失败就自己退回去）
③ 部署成功，更新 .current_sha
```

**完整内容：**

```bash
#!/usr/bin/env bash
set -euo pipefail

NEW_SHA="${1:?用法: deploy.sh <短sha>}"

APP_DIR=/srv/app
IMAGE_PREFIX="ghcr.io/yourname/ci-lab"
HEALTH_URL="http://127.0.0.1:3000/health"
MAX_TRIES=30
SLEEP_SEC=2

cd "$APP_DIR"

echo "=== 部署开始 $(date -Is) ==="
echo "目标版本: sha-${NEW_SHA}"

for f in docker-compose.yml .env; do
  if [ ! -f "$f" ]; then
    echo "错误：找不到 $APP_DIR/$f"
    exit 1
  fi
done

if ! docker compose version > /dev/null 2>&1; then
  echo "错误：docker compose 不可用"
  exit 1
fi

CURRENT_SHA="$(cat .current_sha 2>/dev/null || echo none)"
echo "当前版本: ${CURRENT_SHA}"

if [ "$CURRENT_SHA" != "none" ] && [ "$CURRENT_SHA" != "$NEW_SHA" ]; then
  echo "$CURRENT_SHA" > .previous_sha
  echo "已记录上一个版本: ${CURRENT_SHA}"
fi

if grep -q "^APP_IMAGE=" .env; then
  sed -i "s|^APP_IMAGE=.*|APP_IMAGE=${IMAGE_PREFIX}:sha-${NEW_SHA}|" .env
else
  echo "APP_IMAGE=${IMAGE_PREFIX}:sha-${NEW_SHA}" >> .env
fi

grep "^APP_IMAGE=" .env

echo "--- 拉取镜像 ---"
docker compose pull app

echo "--- 启动容器 ---"
docker compose up -d --no-deps app

echo "--- 等待健康检查 ---"
OK=0
for i in $(seq 1 "$MAX_TRIES"); do
  if curl -fsS --max-time 3 "$HEALTH_URL" > /dev/null 2>&1; then
    echo "第 ${i} 次检查通过"
    OK=1
    break
  fi
  echo "第 ${i} 次检查未通过，等 ${SLEEP_SEC} 秒"
  sleep "$SLEEP_SEC"
done

if [ "$OK" -ne 1 ]; then
  echo "=== 健康检查失败，开始回滚 ==="
  docker compose logs --tail=50 app
  if [ -f .previous_sha ]; then
    PREV="$(cat .previous_sha)"
    if [ "$PREV" != "none" ] && [ -n "$PREV" ]; then
      echo "回滚到 sha-${PREV}"
      sed -i "s|^APP_IMAGE=.*|APP_IMAGE=${IMAGE_PREFIX}:sha-${PREV}|" .env
      docker compose pull app || true
      docker compose up -d --no-deps app || true
    fi
  else
    echo "没有上一个版本可回滚"
  fi
  exit 1
fi

echo "$NEW_SHA" > .current_sha
rm -f .previous_sha

echo "=== 部署成功 $(date -Is) ==="
docker compose ps app
```

**逐段读（重点看新增的四段）：**

| 段 | 意思 | 为什么 |
|---|---|---|
| `for f in docker-compose.yml .env` | 检查前提条件 | 提前失败，报错清楚 |
| `docker compose version` | 检查 docker 可用 | 在干净的机器上会第一时间暴露 |
| `CURRENT_SHA="$(cat .current_sha ...)"` | 读当前版本，读不到就是 `none` | 第一次部署时文件不存在 |
| `.previous_sha` 记录 | **只在版本真的变了才记** | 重复部署同一个版本不该覆盖"上一个" |
| `curl -fsS --max-time 3` | 健康检查 | `-f` 让 500 也失败；`--max-time` 防止卡死 |
| `for i in $(seq 1 30)` | 最多试 30 次，每次隔 2 秒 | 最多等 60 秒 |
| `OK=1` | 用一个标志变量 | 因为 for 循环里 `break` 之后还要判断 |
| `rm -f .previous_sha` | 成功后清空"上一个" | 避免下次部署时误用 |

**为什么用 `for i in $(seq 1 30)` 而不是 `while true`：**

```text
while true 如果没有 break，永远不退出
for 有天然上限
```

**为什么不用 `until curl ...; do sleep 2; done`：**

```text
它同样没有上限
如果服务永远起不来，脚本永远不返回
→ CI 的 timeout-minutes 到了才被杀
→ 那时候你已经分不清"是健康检查卡住"还是"SSH 断了"
```

**"有上限的重试"是运维脚本的基本要求。**

## 2.3 一个必须理解的设计：`.current_sha` 和 `.previous_sha`

**两个文件的语义：**

```text
.current_sha   现在跑的是哪个版本
.previous_sha  上一个成功跑过的版本（只在"这次部署成功后"才被清掉）
```

**时序图：**

```text
初始状态：
  没有 .current_sha，没有 .previous_sha

第一次部署 sha-aaa：
  CURRENT = none
  → 不写 .previous_sha
  → 部署 aaa
  → 健康检查通过
  → .current_sha = aaa
  → 删 .previous_sha

第二次部署 sha-bbb：
  CURRENT = aaa
  → .previous_sha = aaa
  → 部署 bbb
  → 健康检查通过
  → .current_sha = bbb
  → 删 .previous_sha

第三次部署 sha-ccc（健康检查失败）：
  CURRENT = bbb
  → .previous_sha = bbb
  → 部署 ccc
  → 健康检查失败
  → 回滚到 bbb
  → exit 1
  → .current_sha 还是 bbb（没改成 ccc）
  → .previous_sha 还是 bbb（因为没走到"成功"那一步）
```

**注意最后一次：`.current_sha` 和 `.previous_sha` 都是 bbb。**

**这会让"下一次回滚"变成"回滚到 bbb"—— 而它本来就是 bbb。**

**这是一个可以接受的瑕疵：**

```text
因为回滚是"幂等"的
回滚到当前版本 = 什么都不做 = 无害
```

**想更严谨的话，可以在成功回滚后：**

```bash
rm -f .previous_sha
```

**但那样你就丢了"再退一步"的能力。**

**取舍：**

```text
保留 .previous_sha → 可以再退一步（但它可能是同一个）
删掉 .previous_sha → 干净，但只有一个退路
```

**我选保留。** 因为"再退一步"在真实事故里有用（有时候要退两个版本）。

## 2.4 单独的回滚脚本 `rollback.sh`

**为什么单独写一个，而不是"再调一次 deploy.sh"：**

```text
deploy.sh 需要"目标 sha"这个参数
回滚时你不想手动算"上一个是什么"
```

**内容：**

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/srv/app
IMAGE_PREFIX="ghcr.io/yourname/ci-lab"
HEALTH_URL="http://127.0.0.1:3000/health"

cd "$APP_DIR"

echo "=== 回滚开始 $(date -Is) ==="

if [ ! -f .previous_sha ]; then
  echo "错误：没有 .previous_sha，无法回滚"
  echo "当前版本: $(cat .current_sha 2>/dev/null || echo 未知)"
  exit 1
fi

PREV="$(cat .previous_sha)"
CURRENT="$(cat .current_sha 2>/dev/null || echo none)"

echo "当前版本: ${CURRENT}"
echo "回滚到:   ${PREV}"

if [ "$PREV" = "$CURRENT" ]; then
  echo "上一个版本和当前版本相同，无需回滚"
  exit 0
fi

sed -i "s|^APP_IMAGE=.*|APP_IMAGE=${IMAGE_PREFIX}:sha-${PREV}|" .env
grep "^APP_IMAGE=" .env

docker compose pull app
docker compose up -d --no-deps app

echo "--- 等待健康检查 ---"
OK=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "$HEALTH_URL" > /dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 2
done

if [ "$OK" -ne 1 ]; then
  echo "=== 回滚后健康检查仍失败 ==="
  docker compose logs --tail=80 app
  echo "当前状态需要人工介入"
  exit 2
fi

echo "$PREV" > .current_sha
rm -f .previous_sha

echo "=== 回滚成功，当前版本 sha-${PREV} ==="
docker compose ps app
```

**逐段读差异：**

| 段 | 为什么 |
|---|---|
| `没有 .previous_sha → 报错退出` | 可能你刚部署过第一次，还没有"上一个" |
| `PREV = CURRENT → 直接成功退出` | 幂等：回滚到同一个版本等于什么都不做 |
| 健康检查失败 → `exit 2` | **用不同的退出码区分"回滚失败"和"没有可回滚的"** |

**退出码的语义设计：**

```text
0  回滚成功（或无需回滚）
1  没有可回滚的版本（配置/状态问题）
2  回滚执行了但服务仍然不可用（严重事故，需要人）
```

**为什么这很重要：**

```text
CI 里可以区分：
  exit 1 → 记录"没有退路"，发通知
  exit 2 → 记录"严重事故"，可能需要打电话
```

**你已经在前面的课里见过这个思路（400 vs 500、126 vs 127）。**

**好的程序用退出码传递"发生了什么"，不只是"成没成"。**

## 2.5 给两个脚本加执行权限并测试

```bash
chmod +x /srv/app/deploy.sh /srv/app/rollback.sh
ls -l /srv/app/*.sh
```

**应该看到：**

```text
-rwxr-xr-x 1 root root 2410 Nov 16 14:20 /srv/app/deploy.sh
-rwxr-xr-x 1 root root 1822 Nov 16 14:20 /srv/app/rollback.sh
```

**测试 1：先部署两次，制造出 `.previous_sha`**

```bash
/srv/app/deploy.sh 3f7a1c2
/srv/app/deploy.sh a1b2c3d
```

**应该看到第二次的输出里有：**

```text
当前版本: 3f7a1c2
已记录上一个版本: 3f7a1c2
```

**验证文件：**

```bash
cat /srv/app/.current_sha
cat /srv/app/.previous_sha
```

**应该看到：**

```text
a1b2c3d
3f7a1c2
```

**测试 2：回滚**

```bash
/srv/app/rollback.sh
```

**应该看到：**

```text
=== 回滚开始 2025-11-16T14:26:03+08:00 ===
当前版本: a1b2c3d
回滚到:   3f7a1c2
APP_IMAGE=ghcr.io/yourname/ci-lab:sha-3f7a1c2
...
=== 回滚成功，当前版本 sha-3f7a1c2 ===
```

**再验证：**

```bash
cat /srv/app/.current_sha
ls /srv/app/.previous_sha
```

**应该看到：**

```text
3f7a1c2
ls: cannot access '/srv/app/.previous_sha': No such file or directory
```

**`ls` 报"不存在"是对的** —— 回滚成功后删掉了 `.previous_sha`。

**测试 3：连续回滚两次**

```bash
/srv/app/rollback.sh; echo "退出码: $?"
```

**应该看到：**

```text
=== 回滚开始 ... ===
错误：没有 .previous_sha，无法回滚
当前版本: 3f7a1c2
退出码: 1
```

**这就是"没有退路"的表现。**

**⚠️ 这个状态很危险：**

```text
如果你连续部署了两次，又回滚了一次
→ .previous_sha 被删了
→ 再出问题，你只能手动指定一个 sha
```

**生产环境里，更好的做法是保留一个"版本列表"而不是"单个上一个"。**

**改成 `.history`（每行一个 sha，最多 5 个）会更好，但脚本复杂度上升。**

**你现在用单个 `.previous_sha` 够用。** 但要知道这个局限。

---

# 第 3 步：写 `pipeline.yml`（40 分钟）

## 3.1 为什么新建一个文件，而不是改 `build.yml`

**因为最后要"一个文件说清整条线"。**

**现在你的仓库里有：**

```text
check.yml    语法 + lint
test.yml     单元测试（还负责卡 PR）
build.yml    test + build + deploy + notify
```

**改完之后：**

```text
check.yml     保留（PR 时卡代码规范）
test.yml      保留（PR 时卡测试）
pipeline.yml  新增：main 分支的完整上线流程
```

**为什么不全合并成一个：**

```text
PR 需要"快速反馈"（只跑 check + test，30 秒）
main 需要"完整流程"（跑全套 + 部署，3 分钟）
两者的触发条件和目标不同，混在一起会很乱
```

**这就是"关注点分离"：**

```text
check.yml / test.yml  → 回答"这段代码能不能合"
pipeline.yml          → 回答"这个提交能不能上线"
```

**然后删掉 `build.yml`（它的职责被 pipeline.yml 接管）。**

```bash
git rm .github/workflows/build.yml
```

## 3.2 完整文件

**新建 `.github/workflows/pipeline.yml`：**

```yaml
name: pipeline

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pipeline-main
  cancel-in-progress: false

env:
  IMAGE_PREFIX: ghcr.io/${{ github.repository }}

jobs:
  test:
    name: 1-测试
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm test -- --test-reporter=spec
      - run: npm run secrets:check

  build:
    name: 2-构建镜像
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.meta.outputs.image }}
      sha: ${{ steps.meta.outputs.sha }}
    steps:
      - uses: actions/checkout@v4

      - name: 计算镜像地址和短 sha
        id: meta
        run: |
          REPO="$(echo "${GITHUB_REPOSITORY}" | tr '[:upper:]' '[:lower:]')"
          SHORT="${GITHUB_SHA::7}"
          echo "image=ghcr.io/${REPO}" >> "$GITHUB_OUTPUT"
          echo "sha=${SHORT}" >> "$GITHUB_OUTPUT"

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/setup-buildx-action@v3

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ steps.meta.outputs.image }}:sha-${{ steps.meta.outputs.sha }}
            ${{ steps.meta.outputs.image }}:latest
          cache-from: type=gha
          cache-to: type=gha,scope=pipeline

  deploy:
    name: 3-部署
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: production
    permissions:
      contents: read
    steps:
      - name: 准备 SSH
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "${{ secrets.SSH_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - name: 执行部署
        run: |
          ssh -i ~/.ssh/deploy_key \
              -o IdentitiesOnly=yes \
              -o BatchMode=yes \
              -o ConnectTimeout=10 \
              -o ServerAliveInterval=15 \
              "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}" \
              "/srv/app/deploy.sh ${{ needs.build.outputs.sha }}"

      - name: 清理私钥
        if: always()
        run: rm -f ~/.ssh/deploy_key

  smoke:
    name: 4-冒烟检查
    needs: [build, deploy]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - name: 准备 SSH
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "${{ secrets.SSH_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - name: 检查 /health
        run: |
          ssh -i ~/.ssh/deploy_key \
              -o IdentitiesOnly=yes \
              -o BatchMode=yes \
              -o ConnectTimeout=10 \
              "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}" \
              "curl -fsS --max-time 5 http://127.0.0.1:3000/health"

      - name: 检查进程版本
        run: |
          ssh -i ~/.ssh/deploy_key \
              -o IdentitiesOnly=yes \
              -o BatchMode=yes \
              -o ConnectTimeout=10 \
              "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}" \
              "docker inspect ci-lab-app --format '{{.Config.Image}}' | grep -q 'sha-${{ needs.build.outputs.sha }}'"

      - name: 清理私钥
        if: always()
        run: rm -f ~/.ssh/deploy_key

  rollback:
    name: 5-自动回滚
    needs: [build, deploy, smoke]
    if: failure()
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: 准备 SSH
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "${{ secrets.SSH_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - name: 执行回滚
        run: |
          set +e
          ssh -i ~/.ssh/deploy_key \
              -o IdentitiesOnly=yes \
              -o BatchMode=yes \
              -o ConnectTimeout=10 \
              "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}" \
              "/srv/app/rollback.sh"
          CODE=$?
          echo "rollback 退出码: ${CODE}"
          if [ "$CODE" -eq 0 ]; then
            echo "回滚成功"
          elif [ "$CODE" -eq 1 ]; then
            echo "没有可回滚的版本，需要人工检查"
          else
            echo "回滚后服务仍不可用，需要立刻处理"
          fi
          exit "$CODE"

      - name: 清理私钥
        if: always()
        run: rm -f ~/.ssh/deploy_key

  notify:
    name: 6-通知
    needs: [test, build, deploy, smoke, rollback]
    if: always() && (contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled'))
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: 发到企业微信
        env:
          WEBHOOK: ${{ secrets.WECOM_WEBHOOK }}
          REPO: ${{ github.repository }}
          SHA: ${{ github.sha }}
          RESULT: ${{ toJSON(needs) }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          if [ -z "$WEBHOOK" ]; then
            echo "WECOM_WEBHOOK 为空"
            exit 1
          fi

          SUMMARY="$(echo "$RESULT" | node -e '
            let raw = ""
            process.stdin.on("data", (d) => (raw += d))
            process.stdin.on("end", () => {
              const needs = JSON.parse(raw)
              const lines = Object.entries(needs).map(
                ([name, info]) => `${name}: ${info.result}`
              )
              process.stdout.write(lines.join("\n"))
            })
          ')"

          TEXT="流水线异常
          仓库: ${REPO}
          提交: ${SHA:0:7}
          各阶段:
          ${SUMMARY}
          查看: ${RUN_URL}"

          BODY="$(node -e 'console.log(JSON.stringify({msgtype:"text",text:{content:process.argv[1]}}))' "$TEXT")"

          RESP="$(curl -sS -X POST "$WEBHOOK" -H 'Content-Type: application/json' -d "$BODY")"
          echo "响应: $RESP"
          echo "$RESP" | grep -q '"errcode":0' || { echo "通知发送失败"; exit 1; }
```

**这个文件 170 多行。下面逐块解释，不要跳。**

## 3.3 `concurrency`：防止两次部署打架

```yaml
concurrency:
  group: pipeline-main
  cancel-in-progress: false
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `group: pipeline-main` | 同一个组里同一时间只允许一个运行 |
| `cancel-in-progress: false` | **不取消正在跑的那个，让新的排队** |

**为什么需要它：**

**没有它的时候，你连续 push 两次：**

```text
push A → 运行 1 开始（正在部署 sha-aaa）
push B → 运行 2 开始（同时部署 sha-bbb）

两个 SSH 同时执行 deploy.sh
→ 都去 sed .env
→ 一个人写 aaa，一个人写 bbb
→ docker compose up -d 被调两次
→ 最终状态不确定
→ .current_sha / .previous_sha 可能错乱
```

**这就是"竞态条件"（race condition）。**

**加了 `concurrency` 之后：**

```text
运行 1 开始 → 运行 2 排队
运行 1 结束 → 运行 2 开始（用最新的代码）
```

**`cancel-in-progress: false` 还是 `true`：**

| 值 | 行为 | 适合 |
|---|---|---|
| `false` | 排队，一个一个来 | **部署**（不能中途取消） |
| `true` | 取消旧的，只跑最新的 | 测试、检查（旧的结果没意义） |

**为什么部署不能 `true`：**

```text
部署执行到一半被取消
→ 容器可能是"旧的停了、新的没起来"
→ 网站 502
```

**⚠️ `concurrency` 的 group 是**全仓库唯一**的。**

**如果你有多个环境（staging / production），要写不同的 group：**

```yaml
concurrency:
  group: pipeline-${{ github.ref_name }}
```

**否则 staging 的部署会阻塞 production。**

## 3.4 `outputs`：把 build 的结果传给后面

```yaml
    outputs:
      image: ${{ steps.meta.outputs.image }}
      sha: ${{ steps.meta.outputs.sha }}
```

**为什么需要：**

```text
deploy job 需要知道"部署哪个 sha"
它有 github.sha，但那是 40 位的
而镜像 tag 是 7 位的
```

**也可以直接在 deploy 里算 `${GITHUB_SHA::7}`。但用 `outputs` 更明确。**

**为什么更明确：**

```text
① "哪个 sha 被构建了"这件事，build 说了算
② deploy 不需要知道"怎么算这个 sha"
③ 以后改了 tag 规则（比如加 `v1-` 前缀），只改一处
```

**`needs.build.outputs.sha` 的读法：**

```text
needs         → 所有依赖的 job
.build        → 名叫 build 的那个
.outputs.sha  → 它的 outputs 里的 sha
```

**⚠️ `outputs` 只在 job 成功时才有值。**

**如果 build 失败，deploy 根本不会跑（因为有 `needs`），所以不会读到空值。**

**但如果你给 deploy 加了 `if: always()`，就会读到空值，然后部署一个 `sha-` 的空 tag。**

**这是一个真实的坑。**

## 3.5 `environment: production`

```yaml
    environment: production
```

**它做的三件事（第 209 节课讲过）：**

```text
① 只注入 production 环境下的 secrets
② 在仓库首页的 Deployments 里留一条记录
③ 可以加保护规则（需要 Pro）
```

**为什么 deploy 要加、smoke 不加：**

```text
deploy 是"改变生产状态"的动作 → 应该有环境记录
smoke 只是"读一下" → 不需要
```

**⚠️ 加了 `environment` 之后，仓库级 secret 会**被环境级同名 secret 覆盖**。**

**如果你的 `SSH_PRIVATE_KEY` 只在仓库级，而 production 环境里有一个同名的（哪怕是空的），会用环境级的。**

**这是"找不到原因"的经典问题。** 检查顺序：

```text
① 环境级有没有同名 secret
② 环境级的是不是空的
③ 环境保护规则有没有拦住
```

## 3.6 `smoke` job 的两个检查

**检查一：应用能不能响应**

```bash
curl -fsS --max-time 5 http://127.0.0.1:3000/health
```

**为什么走 SSH 在服务器上 curl，而不是从 runner 直连：**

```text
① 你的 3000 只绑 127.0.0.1（第 208 节课刻意这么做的）
② runner 在公网，连不到
③ 而且"从公网能连"是另一件事（第 31 周配了 Nginx 再测）
```

**检查二：跑的是不是新版本**

```bash
docker inspect ci-lab-app --format '{{.Config.Image}}' | grep -q 'sha-3f7a1c2'
```

**为什么需要这一条：**

```text
有一种情况：
  部署脚本执行了
  docker compose pull 拉到的是旧的（tag 缓存）
  up -d 没重建容器（因为它认为镜像没变）
  → 服务健康，但跑的是旧版本
  → 只查 /health 会通过
```

**`grep -q` 让"找不到"时返回非 0，从而让 step 失败。**

**这就是"检查要说清检查什么"。**

**只查 `/health` 的盲区：**

```text
① 旧版本也有 /health → 通过
② 新版本少了个环境变量但 /health 不依赖它 → 通过
③ 数据库连不上但 /health 不查数据库 → 通过
```

**所以：**

```text
/health  → 只能证明"进程活着"
版本检查 → 只能证明"部署的是对的东西"
```

**两个都做，才覆盖了"部署成功"的最低标准。**

**更完整的冒烟检查（第 221 节课会做）：**

```bash
curl -fsS http://127.0.0.1:3000/api/version
curl -fsS -X POST http://127.0.0.1:3000/api/echo -d '{"a":1}' -H 'Content-Type: application/json'
```

**关键业务接口也要打一下。** 但现在你只有一个 `/health`，先这样。

## 3.7 `rollback` job 的 `if: failure()`

```yaml
    needs: [build, deploy, smoke]
    if: failure()
```

**它的行为：**

| 情况 | rollback 跑吗 |
|---|---|
| test 失败 | ❌ 不跑（不在 needs 里，而且 build 都被 skip 了） |
| build 失败 | ✅ 跑 |
| deploy 失败 | ✅ 跑 |
| smoke 失败 | ✅ 跑 |
| 全部成功 | ❌ 不跑 |

**⚠️ "build 失败也回滚"是对的吗：**

```text
build 失败 → 镜像没推上去
→ 服务器上什么都没变
→ rollback.sh 会"回滚到上一个版本"
→ 而当前版本就是上一个版本
→ 脚本检测到 PREV == CURRENT → 退出 0，什么都不做
```

**所以是安全的。** 这也是为什么 `rollback.sh` 里要有那个判断。

**如果 build 失败但 `deploy` 也没跑，`.previous_sha` 没被改过，`rollback.sh` 会回滚到"上一次部署前的版本"——可能就是当前版本。安全。**

**这种"无操作也是正确操作"的设计，叫幂等回滚。**

## 3.8 为什么 rollback 里的 ssh 要 `set +e`

```yaml
        run: |
          set +e
          ssh ... "/srv/app/rollback.sh"
          CODE=$?
```

**因为 `run:` 默认是 `bash -e`（一条失败就退出）。**

**有 `-e` 的时候：**

```text
ssh 返回 2 → 脚本立刻退出 → CODE 那行根本没执行 → 你拿不到退出码
```

**`set +e` 关掉这个行为，让你能"接住"退出码。**

**然后 `exit "$CODE"` 把它原样传出去。**

**为什么要在意退出码：**

```text
回滚成功（0）→ 通知里说"已回滚"
没有退路（1）→ 通知里说"需要人工"
回滚也失败（2）→ 这条消息必须足够醒目
```

**如果都 exit 0，这三种情况在 Actions 上看起来一样。**

## 3.9 `notify` 的 `toJSON(needs)`

```yaml
          RESULT: ${{ toJSON(needs) }}
```

**它会把整个 `needs` 上下文变成 JSON 字符串：**

```json
{
  "test": { "result": "success", "outputs": {} },
  "build": { "result": "success", "outputs": { "image": "ghcr.io/...", "sha": "3f7a1c2" } },
  "deploy": { "result": "success", "outputs": {} },
  "smoke": { "result": "failure", "outputs": {} },
  "rollback": { "result": "success", "outputs": {} }
}
```

**然后用 Node 解析它，生成：**

```text
test: success
build: success
deploy: success
smoke: failure
rollback: success
```

**⚠️ `toJSON(needs)` 里包含 `outputs`。**

**你的 outputs 里有镜像地址，没有密钥。但如果哪天你加了"output 一个 token"，它就会进通知。**

**所以：**

```text
不要把密钥放进 job outputs
outputs 是"公开给下游 job 的"，不是"保险箱"
```

**实际上 GitHub 会对 outputs 里的 secret 值打码，但**不要依赖这个**。**

---

# 第 4 步：跑一次完整流程（20 分钟）

## 4.1 第一次跑

```bash
git add .
git commit -m "第210节课：完整流水线"
git push
```

**Actions 页面：**

```text
pipeline
  #1  第210节课：完整流水线
    1-测试        ✅ 34s
    2-构建镜像    ✅ 1m 22s
    3-部署        ✅ 26s
    4-冒烟检查    ✅ 8s
    5-自动回滚    ⊘ skipped
    6-通知        ⊘ skipped
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `4-冒烟检查 ✅ 8s` | 8 秒里大部分是 SSH 握手，真正的 curl 只有几十毫秒 |
| `5-自动回滚 ⊘` | 因为没失败，`if: failure()` 不成立 |
| `6-通知 ⊘` | 因为 `always() && (failure || cancelled)` 不成立 |

**⚠️ 注意最后一行：通知被 skip 了。**

**这是设计如此（只发异常）。**

**但这也意味着：** 如果哪天你"以为它会发"，实际不会。**所以第 209 节课要求你"必须收到过一次"。**

## 4.2 现在故意让冒烟检查失败

**怎么让"部署成功但健康检查失败"：**

**改 `server.js` 的 `/health`，让它返回 500：**

```javascript
app.get('/health', (req, res) => {
  res.status(500).json({ ok: false })
})
```

**等等，这样 `deploy.sh` 里的健康检查就会失败，会自己回滚，`smoke` 根本跑不到。**

**这正是设计的效果。但我们想测的是"CI 里的回滚 job"。**

**两个选择：**

**选择 A：让 `deploy.sh` 的健康检查"假通过"，但 smoke 失败。**

**改 `/health` 返回 200 但内容不对，并且让 smoke 检查内容：**

**在 `smoke` 里加一步：**

```yaml
      - name: 检查返回内容
        run: |
          ssh ... "curl -fsS --max-time 5 http://127.0.0.1:3000/health" | grep -q '"ok":true'
```

**然后让 `/health` 返回：**

```javascript
app.get('/health', (req, res) => {
  res.json({ ok: false, reason: '故意' })
})
```

**这样：**

```text
deploy.sh 的 curl -f → 200 → 通过
smoke 的 grep '"ok":true' → 找不到 → 失败
→ rollback 触发
```

**这是最干净的方式。** 用选择 A。

**完整改动：**

```javascript
app.get('/health', (req, res) => {
  res.json({ ok: false, reason: '第210节课演示' })
})
```

**`smoke` job 的 `/health` 那一步改成：**

```yaml
      - name: 检查 /health
        run: |
          BODY="$(ssh -i ~/.ssh/deploy_key \
              -o IdentitiesOnly=yes \
              -o BatchMode=yes \
              -o ConnectTimeout=10 \
              "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}" \
              "curl -fsS --max-time 5 http://127.0.0.1:3000/health")"
          echo "响应: $BODY"
          echo "$BODY" | grep -q '"ok":true' || { echo "健康检查内容不对"; exit 1; }
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `BODY="$(ssh ...)"` | 把远程输出抓进变量 |
| `echo "响应: $BODY"` | 打印出来（否则日志里看不到） |
| `grep -q '"ok":true'` | 找这个子串 |
| `\|\| { echo ...; exit 1; }` | 找不到就失败 |

**⚠️ `grep -q '"ok":true'` 依赖 JSON 的格式（没有空格）。**

**如果 `JSON.stringify` 输出 `{"ok":true}`，这是对的。**

**但如果你用了 `JSON.stringify(obj, null, 2)`，会变成：**

```json
{
  "ok": true
}
```

**那里有空格，`"ok":true` 匹配不上。**

**更稳的写法：**

```bash
echo "$BODY" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'
```

**`[[:space:]]*` 是什么：** 零个或多个空白字符（POSIX 字符类）。

**这样两种格式都能匹配。**

**如果你想更严谨，用 `node -e` 解析 JSON：**

```bash
echo "$BODY" | node -e '
  let raw = ""
  process.stdin.on("data", (d) => (raw += d))
  process.stdin.on("end", () => {
    const j = JSON.parse(raw)
    process.exit(j.ok === true ? 0 : 1)
  })
'
```

**这个"用真正的解析器而不是字符串匹配"的习惯，在解析 API 响应时很重要。**

## 4.3 看回滚发生

```bash
git add .
git commit -m "故意让健康检查返回 ok:false"
git push
```

**等 3 分钟。** **Actions 页面：**

```text
pipeline
  #2  故意让健康检查返回 ok:false
    1-测试        ✅ 33s
    2-构建镜像    ✅ 1m 18s
    3-部署        ✅ 27s
    4-冒烟检查    ❌ 12s
    5-自动回滚    ✅ 31s
    6-通知        ✅ 9s
```

**点开 `4-冒烟检查`：**

```text
Run BODY="$(ssh ...)"
  ...
响应: {"ok":false,"reason":"第210节课演示"}
健康检查内容不对
Error: Process completed with exit code 1.
```

**点开 `5-自动回滚`：**

```text
Run set +e
  ...
=== 回滚开始 2025-11-16T15:02:41+08:00 ===
当前版本: b7c8d9e
回滚到:   3f7a1c2
APP_IMAGE=ghcr.io/yourname/ci-lab:sha-3f7a1c2
...
=== 回滚成功，当前版本 sha-3f7a1c2 ===
rollback 退出码: 0
回滚成功
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `当前版本: b7c8d9e` | 这次坏掉的那个 |
| `回滚到: 3f7a1c2` | 上一个版本 |
| `回滚成功` | 服务已经恢复 |
| `rollback 退出码: 0` | 我自己的日志，把退出码打出来 |

**点开 `6-通知`，你的群里应该有：**

```text
流水线异常
仓库: yourname/ci-lab
提交: b7c8d9e
各阶段:
test: success
build: success
deploy: success
smoke: failure
rollback: success
查看: https://github.com/...
```

**注意 `smoke: failure` 和 `rollback: success`。**

**这条消息告诉你三件事：**

```text
① 部署本身成功了
② 但冒烟检查发现服务不对
③ 已经自动回滚，现在是旧版本在跑
```

**这就是一条"能让人立刻行动"的通知。**

**对比一下"流水线失败"这种消息 —— 你还得点进去查半天。**

## 4.4 验证线上真的回滚了

```bash
ssh root@47.98.xx.xx "cat /srv/app/.current_sha; docker inspect ci-lab-app --format '{{.Config.Image}}'"
```

**应该看到：**

```text
3f7a1c2
ghcr.io/yourname/ci-lab:sha-3f7a1c2
```

**两个一致，说明回滚真的生效了。**

**再访问一次：**

```bash
ssh root@47.98.xx.xx "curl -fsS http://127.0.0.1:3000/health"
```

**应该看到旧版本的正常响应：**

```text
{"ok":true,"uptime":93.4}
```

**⚠️ 现在把代码改回来：**

```javascript
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() })
})
```

```bash
git add .
git commit -m "恢复 /health"
git push
```

**否则你下次部署的还是坏版本。**

---

# 第 5 步：把流水线做扎实（20 分钟）

## 5.1 加一个"总超时"

**每个 job 都有 `timeout-minutes`，但整个 workflow 没有。**

**如果 5 个 job 每个都跑满 10 分钟，一共 50 分钟。**

**最坏情况下：**

```text
1-测试     卡 10 分钟
2-构建     卡 20 分钟
3-部署     卡 10 分钟
4-冒烟     卡 5 分钟
5-回滚     卡 10 分钟
合计 55 分钟
```

**这一个 push 就烧掉 55 分钟额度。**

**给 workflow 加总超时（GitHub 支持的方式是给每个 job 设，没有一个"workflow 级"的 timeout）：**

**所以只能逐 job 收紧：**

```yaml
  test:
    timeout-minutes: 8
  build:
    timeout-minutes: 15
  deploy:
    timeout-minutes: 6
  smoke:
    timeout-minutes: 3
  rollback:
    timeout-minutes: 6
  notify:
    timeout-minutes: 3
```

**合计 41 分钟。** 还是一个不小的数，但比 55 好。

**怎么定这个数：**

```text
先跑 5 次，看 P95 耗时
timeout = P95 × 2
```

**例如 `build` 平均 1m20s，P95 是 1m50s，那 timeout 设 4 分钟就够。**

**我上面写的 15 分钟是"宽裕值"，你可以收得更紧。**

**⚠️ 设得太紧的后果：**

```text
某天依赖下载慢，build 跑了 5 分钟
→ 被 timeout 杀掉
→ 你以为是代码问题，其实是网速
```

**宁可宽一点，也不要天天误杀。**

## 5.2 加一个"部署后清理旧镜像"

**服务器磁盘会被镜像填满。**

**每次部署拉一个新镜像（148MB），旧的不删。** 20 次之后 3GB。

**在 `deploy.sh` 的最后加：**

```bash
echo "--- 清理 7 天前的悬空镜像 ---"
docker image prune -f --filter "until=168h" || true
```

**`docker image prune -f --filter "until=168h"` 是什么：**

```text
删除"没有被任何容器使用"且"创建超过 168 小时（7 天）"的镜像
```

**⚠️ 危险点：**

```text
"没有被任何容器使用"包括"上一个版本的镜像"（如果容器已经切到新版本）
→ 如果你想回滚，那个镜像可能已经被删了
→ 回滚时 docker compose pull 会重新拉（如果 GHCR 上还有）
→ 但如果 GHCR 上也删了，就拉不到了
```

**所以 `until=168h`（7 天）是安全边界：**

```text
7 天内的镜像不会被删
回滚通常发生在"几分钟内"，不会超过 7 天
```

**⚠️ 绝对不要用 `docker system prune -a`。**

```text
-a 会删掉所有"没被使用"的镜像
包括你的基础镜像 node:20-alpine
包括上一个版本（如果暂时没容器用它）
下次部署要重新下载 50MB+
```

**`docker system prune -a` 在服务器上是"删库级"的操作。** 第 229 节课会再提。

**验证清理效果：**

```bash
ssh root@47.98.xx.xx "docker images | head -20; df -h /"
```

**应该看到镜像数量稳定，磁盘使用率不持续上涨。**

## 5.3 让 `deploy.sh` 支持"跳过健康检查"

**有些时候你确实想部署一个"健康检查过不了但你要看日志"的版本。**

**加一个环境变量开关：**

```bash
if [ "${SKIP_HEALTHCHECK:-0}" = "1" ]; then
  echo "⚠️ 跳过健康检查（SKIP_HEALTHCHECK=1）"
  echo "$NEW_SHA" > .current_sha
  exit 0
fi
```

**`${SKIP_HEALTHCHECK:-0}` 是什么：** 变量没设时用默认值 `0`。

**⚠️ 这个开关很危险。**

```text
它让"部署成功"不再等于"服务可用"
而你半年后会忘记这个开关存在
```

**更安全的做法：不要这个开关。** 真想看日志，就 SSH 上去 `docker compose logs`。

**我把它写出来，是为了让你看到"方便"和"可靠"的冲突，而不是让你用它。**

**判断标准：**

```text
任何"跳过检查"的开关，都会在某个深夜被用来"赶紧上线"
然后那个深夜就变成了事故夜
```

## 5.4 一个真实的改进：区分"部署失败"和"冒烟失败"

**现在的 `rollback` 在两种情况下都跑：**

```text
deploy 失败 → rollback
smoke 失败  → rollback
```

**但"deploy 失败"时，`rollback.sh` 读的 `.previous_sha` 是本次部署写入的。**

**如果 `deploy.sh` 在"写 .previous_sha"之后、"健康检查"之前崩了：**

```text
.previous_sha = 上一个版本（正确）
.current_sha  = 还是老版本（因为没走到最后）
容器状态      = 未知（可能已经切到新镜像但没起来）
```

**`rollback.sh` 会：**

```text
PREV = 上一个版本
CURRENT = 老版本
PREV == CURRENT → "无需回滚" → exit 0
```

**但容器可能真的挂了**（新镜像起来了又崩了，但 `.current_sha` 还没更新）。

**这就是"状态文件"和"实际状态"不一致的问题。**

**修法：`rollback.sh` 不要只信 `.current_sha`，还要看容器实际跑的是什么：**

```bash
ACTUAL_IMAGE="$(docker inspect ci-lab-app --format '{{.Config.Image}}' 2>/dev/null || echo none)"
echo "容器实际镜像: ${ACTUAL_IMAGE}"
```

**然后判断"要回滚到的版本"是否等于"容器实际版本"：**

```bash
if echo "$ACTUAL_IMAGE" | grep -q "sha-${PREV}$"; then
  echo "容器已经是 ${PREV}，只需确认健康状态"
else
  echo "容器不是 ${PREV}，执行回滚"
  ...
fi
```

**⚠️ 这会让脚本变复杂。**

**这就是运维脚本的真相：**

> **每一条"更严谨"的判断，都是从一个真实的坑里长出来的。**

**你现在不用加这个。** 但要知道它的存在。

---

# 第 6 步：故意犯八个错（30 分钟）

## 错误 1：`needs` 写了不存在的 job

**操作：**

```yaml
  rollback:
    needs: [build, deploy, smoke, test]
```

**但 test 已经在更上游，而且你想写 `tests`：**

```yaml
    needs: [build, deploy, smoke, tests]
```

**会怎样：**

```text
Invalid workflow file

The workflow is not valid. .github/workflows/pipeline.yml (Line: 118, Col: 5):
Job 'rollback' depends on unknown job 'tests'.
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `Line: 118, Col: 5` | 精确到行和列 |
| `Job 'rollback'` | 出错的 job |
| `depends on unknown job 'tests'` | **它依赖一个不存在的 job** |

**为什么这个报错很清楚：**

```text
因为 GitHub 在"解析文件"阶段就能检查出依赖图不完整
不需要真的跑
```

**⚠️ 但不是所有 needs 错误都这么清楚。**

**比如循环依赖：**

```yaml
  a:
    needs: [b]
  b:
    needs: [a]
```

**会报：**

```text
The workflow is not valid. ... Circular dependency between jobs.
```

**`Circular` 是什么意思：** 循环。A 等 B，B 等 A，永远等不到。

**怎么修：** 要么删一个依赖，要么拆成两个 workflow。

## 错误 2：冒烟检查没用 `-f`

**操作：**

```bash
curl -sS http://127.0.0.1:3000/health
```

**（去掉了 `-f`）**

**会怎样：**

**即使服务返回 500，curl 的退出码也是 0。**

**验证（本地）：**

```bash
curl -sS https://httpbin.org/status/500
echo "退出码: $?"
```

**应该看到：**

```text
退出码: 0
```

**加上 `-f`：**

```bash
curl -fsS https://httpbin.org/status/500
echo "退出码: $?"
```

**应该看到：**

```text
curl: (22) The requested URL returned error: 500
退出码: 22
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `curl: (22)` | curl 的错误码 22 = HTTP 错误 |
| `returned error: 500` | 服务器返回 500 |
| `退出码: 22` | 这一行让 step 失败 |

**为什么 `curl` 默认不把 HTTP 错误当失败：**

```text
从 curl 的角度，"拿到一个 500 响应"也是一次成功的 HTTP 请求
它完成了"发请求、收响应"的工作
```

**这个设计曾经很合理（curl 是个通用工具），但对"健康检查"是灾难。**

**必须记住：健康检查永远用 `curl -f`。**

**⚠️ 但 `-f` 有一个盲区：**

```text
它只检查 HTTP 状态码
如果服务返回 200 但内容是 {"ok":false}，它照样通过
```

**所以完整写法是"状态码 + 内容"都检查：**

```bash
BODY="$(curl -fsS --max-time 5 http://127.0.0.1:3000/health)"
echo "$BODY" | grep -q '"ok":true'
```

**两行，缺一不可。**

## 错误 3：回滚也失败（`exit 2`）

**操作：** 让 `rollback.sh` 里的 `docker compose pull` 失败（比如把 `IMAGE_PREFIX` 改错）。

**会怎样：**

```text
=== 回滚开始 ... ===
当前版本: b7c8d9e
回滚到:   3f7a1c2
APP_IMAGE=ghcr.io/yourname/ci-lab-wrong:sha-3f7a1c2
Error response from daemon: denied
```

**然后 `set -e` 让脚本直接退出，退出码是 1（`docker compose pull` 的）。**

**注意：这种情况下 `rollback.sh` 的 `exit 2` 根本没执行到。**

**所以 `exit 2` 只覆盖"回滚执行了但健康检查不过"这一种情况。**

**更完整的写法要把 `pull` 的失败也接住：**

```bash
if ! docker compose pull app; then
  echo "回滚时拉镜像失败"
  exit 2
fi
```

**`if ! command` 是什么：** 命令失败（非 0）时执行 then 分支。

**这样三种退出码才真的有意义：**

```text
0  回滚成功
1  没有可回滚的版本
2  回滚过程出错 / 回滚后仍不可用
```

**为什么这个区分重要：**

```text
exit 1 → 通知"需要人工指定版本"
exit 2 → 通知"服务可能已经挂了，快去看"
```

**两种情况的紧急程度完全不同。**

## 错误 4：没有 `concurrency`，两次部署打架

**操作：** 删掉 `concurrency:`。

**然后快速 push 两次：**

```bash
git commit --allow-empty -m "a" && git push
sleep 5
git commit --allow-empty -m "b" && git push
```

**会怎样：**

**两次运行同时进行：**

```text
pipeline #5  1-测试 ✅  2-构建 ✅  3-部署 ⏳
pipeline #6  1-测试 ✅  2-构建 ⏳
```

**等 #5 部署到一半，#6 也到部署：**

```text
运行 A: sed -i APP_IMAGE=sha-aaa
运行 B: sed -i APP_IMAGE=sha-bbb
运行 A: docker compose up -d     ← 用 bbb 的 .env
运行 B: docker compose up -d     ← 用 bbb 的 .env
运行 A: echo aaa > .current_sha
运行 B: echo bbb > .current_sha
```

**最终状态可能：**

```text
容器跑 bbb，.current_sha 写的是 aaa
→ 下次回滚会"回滚到 aaa"，而容器本来就是 aaa
→ 你以为回滚了，其实什么都没变
```

**这就是"状态文件撒谎"。**

**怎么修：**

```yaml
concurrency:
  group: pipeline-main
  cancel-in-progress: false
```

**这就是第 3.3 节的内容。**

**⚠️ 一个更隐蔽的问题：`concurrency` 的 group 在"整个仓库"范围内生效，包括不同 workflow。**

**如果 `test.yml` 也用了 `group: pipeline-main`，它会和 pipeline 抢。**

**所以 group 名字要唯一。**

## 错误 5：回滚用了 `latest`

**操作：** 把 `rollback.sh` 里的镜像地址改成 `:latest`。

```bash
sed -i "s|^APP_IMAGE=.*|APP_IMAGE=${IMAGE_PREFIX}:latest|" .env
```

**会怎样：**

**它会"成功"，然后你的服务还是坏的。**

**为什么：**

```text
latest 指向"最后一次推送的镜像"
而最后一次推送的，就是你刚部署的那个坏版本
→ 回滚把 APP_IMAGE 改成 latest
→ pull 拉到的还是坏版本
→ 健康检查还是失败
→ exit 2
```

**更糟的情况：**

```text
如果坏版本的镜像推了 latest，回滚"成功"了（因为 latest 的 digest 和坏版本一样）
但你以为回滚到了旧版本
→ 你去看 .current_sha，写的是 sha-aaa
→ 但容器跑的是坏版本
→ 两个不一致，你彻底糊涂了
```

**怎么修：**

```bash
APP_IMAGE=${IMAGE_PREFIX}:sha-${PREV}
```

**必须用 sha。**

**这就是第 207 节课那句"能回滚的前提是每个版本都有不会被覆盖的名字"的最终体现。**

**一条自检：**

```bash
grep -n "latest" /srv/app/*.sh
```

**输出应该为空。**

**`deploy.sh` 里可以推 latest（给人看），但**不能**用 latest 部署。**

## 错误 6：`rollback` 的 `if` 写成 `if: success()`

**操作：**

```yaml
  rollback:
    needs: [build, deploy, smoke]
    if: success()
```

**会怎样：**

**rollback 永远不会跑。**

**因为 `success()` 的意思是"所有 needs 都成功"。**

**而你想让它在失败时跑。**

**这是一个逻辑反转错误，而且它不报错。**

**表现：**

```text
4-冒烟检查 ❌
5-自动回滚 ⊘ skipped
6-通知     ✅（发了"失败"通知，但没有回滚）
```

**你怎么发现：**

```text
看到"冒烟失败"和"回滚 skipped"同时出现
```

**怎么修：**

```yaml
    if: failure()
```

**或者更明确：**

```yaml
    if: contains(needs.*.result, 'failure')
```

**⚠️ 另一个变体：`if: always()`。**

```yaml
    if: always()
```

**这会让 rollback 在"全部成功"时也跑。**

**那时候 `.previous_sha` 已经被 `deploy.sh` 删了（部署成功后删的）**，所以 `rollback.sh` 会报"没有 .previous_sha" 并 `exit 1`。

**结果是：**

```text
一次成功的部署，因为 rollback job 失败，整个 pipeline 显示红
→ 通知发出去"流水线异常"
→ 你半夜被叫醒，说"部署成功了但流水线红了"
```

**这是"假警报"，比"没有警报"更伤信任。**

## 错误 7：`smoke` 只查了本机，没查版本

**操作：** 删掉"检查进程版本"那一步。

**会怎样：**

**有一种情况会漏过去：**

```text
deploy.sh 执行了
docker compose pull 因为某个原因没拉到新镜像（但没报错，比如 tag 已存在本地）
docker compose up -d 认为"镜像没变"，没重建容器
服务健康（旧版本也健康）
smoke 的 /health 通过
→ 流水线全绿
→ 但线上跑的是旧版本
```

**这种情况真的会发生吗：**

```text
会。特别是：
① 你重跑了一次 pipeline（同一个 sha）
② 服务器上那个 tag 的镜像已经存在（digest 相同）
③ compose 判断"无需重建"
```

**这时候"没部署"其实是正确的（版本没变）。**

**但还有另一种情况：**

```text
你在服务器上手动改过 .env（把 APP_IMAGE 改成了别的）
deploy.sh 的 sed 没生效（比如格式不匹配）
up -d 用的是你手改的值
→ 部署"成功"，但版本不对
```

**版本检查能抓住这个。**

**怎么修：加回来。**

```yaml
      - name: 检查进程版本
        run: |
          ssh ... "docker inspect ci-lab-app --format '{{.Config.Image}}' | grep -q 'sha-${{ needs.build.outputs.sha }}'"
```

**为什么这一条比 `/health` 更有价值：**

```text
/health  → 证明"有个进程在跑"
版本检查 → 证明"跑的是我要的那个进程"
```

**两个加起来才是"部署成功"。**

## 错误 8：冒烟检查打的是公网 80 端口（第 31 周才会遇到）

**操作：**

```bash
curl -fsS http://47.98.xx.xx/health
```

**会怎样：**

**现在会失败：**

```text
curl: (7) Failed to connect to 47.98.xx.xx port 80: Connection refused
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `curl: (7)` | 连接失败 |
| `port 80` | 你打的是 80 |
| `Connection refused` | 对方明确拒绝（不是超时） |

**为什么 `refused` 而不是 `timeout`：**

```text
refused  → 包到了，但那个端口没有程序在听
timeout  → 包没到（防火墙丢了 / 路由不通）
```

**这个区别能帮你判断"是服务没起"还是"网络不通"。**

**现在你的服务器上：**

```text
80 端口：没有 Nginx（第 31 周才装）
3000 端口：绑在 127.0.0.1，公网访问不到
```

**所以"公网检查"现在做不了。**

**第 31 周装了 Nginx 之后，冒烟检查要加两层：**

```text
第一层（现在就有）：服务器本机 curl 127.0.0.1:3000  → 证明进程活着
第二层（第 31 周加）：runner 直接 curl http://域名/health → 证明"Nginx + 端口 + 程序"整条链通
```

**为什么两层都要：**

```text
只查第一层 → Nginx 挂了、证书过期了、安全组关了，你都发现不了
只查第二层 → 出问题时不知道是 Nginx 还是程序
```

**这是"分层排查"的思路，和《参考手册》里那张"六步排查表"是同一个道理。**

---

# 第 7 步：写学习笔记（10 分钟）

**把下面的模板复制到 `02-笔记/NOTES.md`，然后填空。**

````markdown
# 第 210 节课学习笔记

## 一、我这条流水线的五个 job

| job | 干什么 | needs | 失败会怎样 |
|---|---|---|---|
| test | | | |
| build | | | |
| deploy | | | |
| smoke | | | |
| rollback | | | |

## 二、画一遍流水线

用 text 画（不看课件）：

```text

```

哪一步是"可以并行"的，为什么没并行：

## 三、"部署成功"和"服务可用"的区别

部署成功只代表：

服务可用还需要：

## 四、服务器上的三个状态文件

| 文件 | 内容 | 谁写 | 什么时候删 |
|---|---|---|---|
| `.current_sha` | | | |
| `.previous_sha` | | | |
| `.env` 的 `APP_IMAGE` | | | |

为什么"部署成功后要删 `.previous_sha`"：

## 五、回滚的三个退出码

| 退出码 | 含义 | 通知里该说什么 |
|---|---|---|
| 0 | | |
| 1 | | |
| 2 | | |

## 六、我的 `pipeline.yml`

贴 `build` job 的 `outputs` 部分：

```yaml

```

贴 `smoke` job 的检查部分：

```yaml

```

为什么冒烟要检查"版本"而不只检查 `/health`：

## 七、`concurrency`

我配的 group 是什么：

`cancel-in-progress` 我选了 true 还是 false，为什么：

如果没有它会怎样（描述一次真实的并发）：

## 八、我演练的回滚

我用了什么办法让冒烟检查失败：

| job | 结果 |
|---|---|
| 3-部署 | |
| 4-冒烟检查 | |
| 5-自动回滚 | |
| 6-通知 | |

回滚后我在服务器上验证的三条命令：

1.
2.
3.

## 九、八个错误

| 错误 | 现象 | 根本原因 |
|---|---|---|
| needs 写错 | | |
| 没有 `-f` | | |
| 回滚也失败 | | |
| 没有 concurrency | | |
| 用 latest 回滚 | | |
| `if: success()` | | |
| 没查版本 | | |
| 打公网 80 | | |

## 十、这节课之后，我还想加什么

1.
2.
3.

## 十一、我还不懂的词

-
-

## 十二、完成检查

- [ ] 我的仓库里有一条完整的 `pipeline.yml`，六个 job
- [ ] 我完整跑通过一次全绿
- [ ] 我故意让冒烟检查失败，看到过自动回滚
- [ ] 我收到过一条带 `smoke: failure` / `rollback: success` 的通知
- [ ] 我在服务器上验证过 `.current_sha` 和 `docker inspect` 一致
- [ ] 我的 `rollback.sh` 不会用 `latest`
- [ ] 我配了 `concurrency`
- [ ] 我知道 `curl -f` 和 `curl` 的区别
````

---

# 第 8 步：课后练习

## 练习一：把 `check` 合并进流水线

**要求：**

1. 现在 `check.yml`（lint）和 `pipeline.yml` 的 test job 有重复；
2. 把 lint 从 `check.yml` 里去掉，只在 `pipeline.yml` 里跑；
3. 但保留 `check.yml` 在 PR 时跑。

**记录：** 改完之后，PR 和 main 各跑哪些检查？

**思考题：** 如果 lint 只在 pipeline 里跑，那"PR 里 lint 不过"就发现不了。这个风险怎么处理？

## 练习二：给冒烟检查加一个业务接口

**要求：**

1. 在 `server.js` 里加 `GET /api/version`，返回 `{ version: '1.0.0', sha: process.env.GIT_SHA || 'unknown' }`；
2. Dockerfile 里通过 `ARG` 把 sha 传进去（提示：`ARG GIT_SHA` + `ENV GIT_SHA=$GIT_SHA`）；
3. smoke 里检查 `sha` 和 `needs.build.outputs.sha` 一致。

**记录：** 你的 `ARG` / `ENV` 写法，以及 build 时怎么传 `--build-arg`。

**思考题：** 把 sha 打进镜像，算不算"泄露信息"？

## 练习三：让回滚也发通知

**要求：**

1. 现在的通知是"统一发一条"；
2. 改成"回滚成功发一条绿的、回滚失败发一条红的"；
3. 企业微信支持 `msgtype: markdown`，可以试试加颜色。

**记录：** 你用的消息格式。

**思考题：** 如果回滚失败（exit 2），这条消息应该包含哪些信息才能让人"立刻行动"？

## 练习四：演练一次"回滚也失败"

**要求：**

1. 在服务器上把 `IMAGE_PREFIX` 改错；
2. 让冒烟检查失败；
3. 看回滚的退出码和通知内容；
4. 改回来。

**记录：** 服务最终是什么状态？你是怎么恢复的？

**思考题：** 如果这时候你人在外面没有电脑，你会怎么办？（提示：云控制台的 VNC）

## 练习五：算一次"这条流水线一个月花多少额度"

**要求：**

1. 记录一次完整运行的耗时（从 push 到通知）；
2. 假设一天 push 10 次、一个月 30 天；
3. 算月消耗；
4. 对比免费额度 2000 分钟。

**记录：** 表格：单次耗时 / 每天次数 / 月总计 / 占比。

**思考题：** 如果超了，你会先砍哪一步？为什么不是砍测试？

---

# 第 9 步：最终验收

## A. 概念

- [ ] 我能说清"部署成功"和"服务可用"的区别
- [ ] 我知道回滚的前提是"上一个版本有不会被覆盖的名字"
- [ ] 我知道冒烟检查要查"状态码 + 内容 + 版本"三样
- [ ] 我知道 `concurrency` 防的是什么
- [ ] 我知道 `curl -f` 和 `curl` 的退出码差异

## B. 实操

- [ ] `pipeline.yml` 有 test / build / deploy / smoke / rollback / notify 六个 job
- [ ] `build` 有 `outputs`，`deploy` 用 `needs.build.outputs.sha`
- [ ] `smoke` 检查了 `/health` 和实际镜像版本
- [ ] `rollback` 有 `needs` 和 `if: failure()`
- [ ] 配了 `concurrency`，`cancel-in-progress: false`
- [ ] 服务器上 `deploy.sh` 会写 `.previous_sha`，`rollback.sh` 会读它
- [ ] 所有脚本都不用 `latest` 做部署

## C. 排错

- [ ] 我见过 `depends on unknown job 'xxx'`
- [ ] 我见过 `curl: (7) Failed to connect` 和 `curl: (22) ... error: 500` 的区别
- [ ] 我见过 `rollback` 显示 `⊘ skipped`（`if` 写错时）
- [ ] 我见过一次"回滚也失败"的场景
- [ ] 我知道 `exit 1` 和 `exit 2` 在通知里应该怎么区分

## D. 交付

- [ ] 我完整演练过一次"部署 → 冒烟失败 → 自动回滚 → 通知"
- [ ] 回滚后我在服务器上验证过 `.current_sha` 和容器镜像一致
- [ ] 通知里能看出"哪个阶段失败、有没有回滚"
- [ ] 我的流水线里没有任何密钥的明文

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 画了流水线图
- [ ] 记录了回滚演练的每一步结果

## 本节课要能说出口的一句话

> **一条流水线的价值不在"它能自动上线"，在"它能在上线失败时自己退回来，并且告诉你发生了什么"；而能不能退回来，取决于你在部署之前有没有给上一个版本留一个不会被覆盖的名字。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `depends on unknown job 'xxx'` | `needs` 里的名字拼错 | 对照 `jobs` 下的 key |
| `Circular dependency between jobs` | A 等 B，B 等 A | 删一个依赖或拆 workflow |
| `smoke` 通过但服务是坏的 | `curl` 没加 `-f` / 没查内容 | 加 `-f` + `grep` 内容 |
| `smoke` 通过但跑的是旧版本 | 没查镜像 tag | 加 `docker inspect` 检查 |
| `rollback` 一直 skipped | `if: success()` 或没有 `needs` | 改 `if: failure()` |
| 全部成功但 pipeline 红 | rollback 用了 `if: always()` | 改成 `failure()` |
| 两次 push 部署打架 | 没有 `concurrency` | 加 group |
| `concurrency` 阻塞了别的 workflow | group 名字冲突 | 用唯一的 group 名 |
| 回滚后还是坏版本 | 用了 `latest` | 用 `sha-xxx` |
| 回滚报"没有 .previous_sha" | 只部署过一次 | 正常，需要人工指定版本 |
| 回滚 exit 2 | 回滚后健康检查仍失败 | 看 `docker compose logs`，可能需要人工 |
| `docker compose pull` 报 `denied` | 私有镜像没登录 / 地址错 | 检查登录和镜像地址 |
| 部署超时 | 某个命令在等输入 | 加 `BatchMode=yes` / `timeout-minutes` |
| 磁盘满了 | 旧镜像堆积 | `docker image prune -f --filter until=168h` |
| 通知没发 | `WEBHOOK` 为空 / 返回 errcode 非 0 | 看 `响应:` 那一行 |
| `toJSON(needs)` 里没有某个 job | 那个 job 没在 `needs` 里 | 补上 |
| 部署后容器 3 秒就退出 | 缺环境变量 / 端口占用 | `docker compose logs --tail=50 app` |
