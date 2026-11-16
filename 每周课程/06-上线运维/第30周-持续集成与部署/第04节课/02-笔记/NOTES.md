# 第 207 节课学习笔记

## 一、`COPY . .` 的三个问题

1.
2.
3.

我在镜像里 `ls -la /app` 看到了什么：

## 二、`.dockerignore`

我写了哪些行：

```text

```

哪一行最重要，为什么：

`!` 开头的是什么意思：

## 三、多阶段构建

| 阶段 | 名字 | 干什么 | 会不会进最终镜像 |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

为什么先 `COPY package.json` 再 `COPY src`：

我实测的两次 build 耗时：

| 场景 | `COPY . .` 在前 | 分开拷 |
|---|---|---|
| 改一行源码 | | |
| 改依赖 | | |

## 四、镜像大小

| 版本 | 大小 |
|---|---|
| 最简单的 Dockerfile | |
| 多阶段 + alpine | |

省下来的主要是哪部分：

## 五、三个 tag

| tag | 谁用 | 会不会被覆盖 |
|---|---|---|
| `sha-xxxxxxx` | | |
| `latest` | | |
| 分支名 | | |

为什么"能回滚"的前提是 sha tag：

## 六、我的 `build.yml`

贴完整内容：

```yaml

```

`permissions` 里写了哪两行，各是干什么的：

`${GITHUB_REPOSITORY,,}` 是什么意思：

## 七、GHCR

我的镜像完整地址：

两个 tag 的 digest 一样吗：

我在本地 `docker pull` 成功了吗：

## 八、`needs`

`needs: test` 加在哪个 job 上：

如果 test 挂了，build 会显示什么状态：

`skipped` 算通过吗：

## 九、八个错误

| 错误 | 报错关键词 | 根本原因 |
|---|---|---|
| 没 `packages: write` | | |
| 大写镜像名 | | |
| 只用 latest | | |
| 忘 checkout | | |
| fork PR 推镜像 | | |
| 没有 `.dockerignore` | | |
| tag 里有斜杠 | | |
| 私有镜像服务器拉不到 | | |

## 十、国内网络

我遇到的最慢的一步是：

我的处理办法：

我决定不做什么，为什么：

## 十一、我还不懂的词

-
-

## 十二、完成检查

- [ ] 我的镜像里没有 `.env`、没有 `test/`、没有 `.git`
- [ ] 容器里 `whoami` 输出不是 root
- [ ] 我的镜像有 `sha-xxxxxxx` 和 `latest` 两个 tag
- [ ] 我在本地 `docker pull` 下来并跑通过
- [ ] CI 里 build job 配了 `needs`
- [ ] 我知道 `permissions` 是"全量替换"不是"追加"
- [ ] 我算过"改一行代码重建"要多久
