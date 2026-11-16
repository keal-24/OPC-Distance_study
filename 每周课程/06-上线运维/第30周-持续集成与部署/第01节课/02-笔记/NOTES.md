# 第 204 节课学习笔记

## 一、我原来怎么上线

写出那五条命令：

1.
2.
3.
4.
5.

这五条里，哪一条最容易忘：

## 二、四个词

| 词 | 一句话解释 | 它在我哪个文件里 |
|---|---|---|
| workflow | | |
| job | | |
| step | | |
| runner | | |

## 三、层级关系

不看课件，把这张图画一遍：

```text
workflow
 └──
      └──
```

`job` 之间共享文件吗：

`step` 之间共享文件吗：

## 四、文件必须放在哪

完整路径：

放错了 GitHub 会报什么：

我自查用的命令：

输出是什么：

## 五、我的第一个 `hello.yml`

贴完整内容（包括缩进）：

```yaml

```

`on: push` 和 `on: push: branches: [main]` 的区别：

## 六、runner 自带什么

我跑 `node -v` 看到：

我跑 `npm -v` 看到：

那为什么还要 `actions/setup-node`（两个理由）：

1.
2.

## 七、不写 `actions/checkout` 会怎样

我 `ls -la` 看到的内容：

我的结论：

## 八、`npm ci` 和 `npm install`

| | `npm install` | `npm ci` |
|---|---|---|
| 读哪个文件 | | |
| 会不会改锁文件 | | |
| CI 里该用哪个 | | |

我第一次跑 `npm ci` 报的错（贴原文）：

```text

```

## 九、三种触发方式

| 写法 | 什么时候跑 | 我用它做什么 |
|---|---|---|
| `on: push` | | |
| `on: pull_request` | | |
| `on: workflow_dispatch` | | |

`workflow_dispatch` 的按钮在哪：

它有哪两个限制：

## 十、我踩的错

| 错误 | 现象（有没有报错） | 怎么查出来的 |
|---|---|---|
| 目录少 s | | |
| Tab 缩进 | | |
| 漏 `runs-on` | | |
| 减号缩进错 | | |
| 多行忘 `\|` | | |
| 密钥写进 yml | | |
| 分支过滤挡掉 | | |

## 十一、国内网络

我遇到的慢/失败现象（贴原文）：

```text

```

我做的处理：

我决定不做的一件事，为什么：

## 十二、成本

我这次 CI 跑了多少秒：

按一天 push 10 次算，一个月多少分钟：

占免费额度的百分比：

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
