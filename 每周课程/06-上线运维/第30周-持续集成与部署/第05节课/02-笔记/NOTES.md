# 第 208 节课学习笔记

## 一、我手动部署的三条命令

1.
2.
3.

为什么"二十秒的手动操作"也值得自动化：

## 二、服务器上的文件

| 文件 | 作用 | 属主/权限 |
|---|---|---|
| `/srv/app/docker-compose.yml` | | |
| `/srv/app/.env` | | |
| `/srv/app/deploy.sh` | | |

为什么 `.env` 要手动建，不能进 Git：

## 三、`set -euo pipefail`

| 参数 | 意思 | 没有它会怎样 |
|---|---|---|
| `-e` | | |
| `-u` | | |
| `-o pipefail` | | |

## 四、幂等

幂等的定义：

我跑了三遍 `deploy.sh`，分别看到：

| 次数 | 输出关键词（Downloaded / up to date / Recreated） |
|---|---|
| 1 | |
| 2 | |
| 3 | |

为什么 `docker compose up -d` 本身是幂等的：

## 五、两把钥匙

| 用途 | 文件名 | 放在哪 | 泄露的后果 |
|---|---|---|---|
| 我自己的登录 | | | |
| CI 部署 | | | |

为什么 CI 不能用自己的私钥（三个理由）：

1.
2.
3.

## 六、`known_hosts`

它防的是什么：

我第一次连服务器看到的提示是什么：

我是怎么核对指纹的（两条命令）：

`StrictHostKeyChecking=no` 到底关掉了什么：

## 七、四个 secrets

| 名字 | 内容 | 从哪来 |
|---|---|---|
| `SSH_PRIVATE_KEY` | | |
| `SSH_HOST` | | |
| `SSH_USER` | | |
| `SSH_KNOWN_HOSTS` | | |

## 八、我的 `deploy` job

贴完整内容：

```yaml

```

`BatchMode=yes` 的作用：

`IdentitiesOnly=yes` 的作用：

`ConnectTimeout=10` 的作用：

## 九、八个错误

| 错误 | 报错关键词 | 根本原因 | 怎么查 |
|---|---|---|---|
| 没有 known_hosts | | | |
| 私钥权限 644 | | | |
| 公钥没加 | | | |
| 没有 docker 组 | | | |
| `.env` 不存在 | | | |
| CRLF 换行 | | | |
| 卡在 yes/no | | | |
| 用密码登录 | | | |

## 十、验证部署成功

我用的三条命令：

1.
2.
3.

为什么"看日志"不如"看 `docker inspect`"：

## 十一、我还不懂的词

-
-

## 十二、完成检查

- [ ] 服务器上 `/srv/app` 有三个文件，`.env` 权限是 600/664
- [ ] `deploy.sh` 有 `set -euo pipefail`，能带参数跑
- [ ] 我手动跑过三遍，确认它是幂等的
- [ ] CI 用的私钥和我的登录私钥是两把
- [ ] 我核对过服务器指纹，没有用 `StrictHostKeyChecking=no`
- [ ] `deploy` job 在 Actions 上跑出了绿勾
- [ ] 我用 `docker inspect` 确认过容器里跑的是新 tag
- [ ] 全程没有手动 SSH 上去敲过部署命令
