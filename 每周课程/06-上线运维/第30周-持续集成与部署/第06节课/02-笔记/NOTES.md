# 第 209 节课学习笔记

> 填空。这一节有两个必须抄原文的东西：一是 `git log` 里搜到的（或者确认没搜到的）结果，二是企业微信返回的 JSON。

---

## 一、密钥泄露的四条路径

1.
2.
3.
4.

哪一条我差点踩到，具体是怎么踩的：

---

## 二、"删掉"和"吊销"的区别

为什么 `git rm .env` 不能解决问题：

```
我查历史用的命令：
我查到的东西（或"没有发现"）：
```

正确的处理顺序（三步）：

1.
2.
3.

**顺序反了会怎样：**

---

## 三、我的 `secrets:check` 脚本

```bash

```

它查了哪几种格式：

它查了 Git 历史吗：

它的三个局限：

1.
2.
3.

---

## 四、Secrets 的三种级别

| 级别 | 在哪配 | 谁能用 | 我用了哪个 |
|---|---|---|---|
| 仓库级 | | | |
| 环境级 | | | |
| 组织级 | | | |

`environment: production` 做了哪三件事：

1.
2.
3.

---

## 五、我的 `permissions`

| 文件 | `permissions` 写了什么 | 为什么这么写 |
|---|---|---|
| `check.yml` | | |
| `test.yml` | | |
| `build.yml` | | |
| `deploy.yml` | | |

为什么"写了 permissions 就是全量替换，不是追加"：

`write-all` 危险在哪（写一个具体后果，不要写"不安全"）：

---

## 六、fork 的 PR

fork 的 PR 里 `secrets` 是什么：

fork 的 PR 里 `GITHUB_TOKEN` 是什么权限：

GitHub 为什么这么设计（写出攻击者的步骤）：

```text
① 攻击者 fork 你的仓库
②
③
④ 所以 secrets 必须是空的
```

`pull_request_target` 为什么危险：

---

## 七、我的 `notify` job

```yaml

```

`needs` 里写了哪几个 job：

`if:` 写的是什么：

我为什么选"只发失败"而不是"成功也发"：

---

## 八、通知结果

企业微信返回的 JSON：

```json

```

我第一次收到通知的时间：

消息内容：

我点了那个链接吗，跳对了没：

**链接里的 `${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}` 换成了什么：**

---

## 九、八个错误

| 错误 | 报错/现象关键词 | 根本原因 |
|---|---|---|
| secret 名字拼错 | | |
| `if:` 里直接用 secrets | | |
| `echo` secret 到日志 | | |
| `permissions` 收得太狠 | | |
| webhook 写进 yml | | |
| `notify` 没有 `needs` | | |
| `needs` 漏了 `deploy` | | |
| 邮件没收到 | | |

---

## 十、我还不懂的词

-

---

## 十一、我卡在哪（写真实内容）

哪一步：

完整报错：

怎么解决的：

---

## 十二、完成检查

- [ ] 我用 `git log` 查过仓库历史里有没有密钥
- [ ] 我有一个 `secrets:check` 脚本，能跑出"没有发现"
- [ ] 所有 workflow 的 `permissions` 都显式写了
- [ ] 我没有用 `write-all`
- [ ] 我建了群机器人，webhook 在 secrets 里，不在 yml 里
- [ ] `notify` job 有 `needs`，覆盖了 test / build / deploy
- [ ] 我收到过一条真实的失败通知，并点开过链接
- [ ] 我知道 `if:` 里不能用 secrets，也知道为什么
