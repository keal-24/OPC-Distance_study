# 第 77 节课学习笔记

## 一、运行记录为什么不能只写日志

日志文件能做什么：

日志文件做不到什么（举一个你想查的问题）：

数据库表能怎么查：

## 二、`runs` 表字段设计

| 字段 | 类型 | 为什么需要它 | 我以后会用它回答什么问题 |
|---|---|---|---|
| started_at | | | |
| finished_at | | | |
| status | | | |
| step | | | |
| fetched | | | |
| inserted | | | |
| updated | | | |
| failed | | | |
| duration_ms | | | |
| error | | | |

哪个字段是可空的？为什么要可空：

## 三、三种状态的区别

| 状态 | 含义 | 我的真实例子（写你自己的运行编号） |
|---|---|---|
| success | | |
| partial | | |
| failed | | |

只有"成功/失败"两种会漏掉什么：

## 四、我实际跑出来的运行记录

贴 `show-runs.js` 的真实输出（不要手抄）：

```text

```

哪一行是我故意造的失败：

## 五、`err.cause` 是什么

只打印 `err.message` 会看到什么：

取 `err.cause` 之后看到什么：

为什么 Node 的 `fetch` 要这样设计（我的理解）：

## 六、超时和连接拒绝的区别

| | ECONNREFUSED | timeout |
|---|---|---|
| 含义 | | |
| 该谁去修 | | |
| 我该怎么处理 | | |

## 七、`step` 字段为什么有用

如果只有 `status=failed`，我能知道什么：

有了 `step`，我能知道什么：

我的 `GROUP BY step` 结果：

```sql

```

## 八、`cron` 表达式

`*/2 * * * *` 的含义：

`* */2 * * *` 的含义（和上面差在哪）：

`0 3 * * *` 的含义：

## 九、`node-cron` 和 Windows 任务计划

| | node-cron | Windows 任务计划 |
|---|---|---|
| 谁负责计时 | | |
| 电脑重启后 | | |
| 关掉终端后 | | |
| 适合什么场景 | | |

## 十、四个错误的后果

| 错误 | 现象 | 真正的伤害 | 怎么一眼看出来 |
|---|---|---|---|
| 只 `console.log` | | | |
| 只记成功 | | | |
| `step` 不更新 | | | |
| `require` 代替 `spawn` | | | |

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `runs.sql` 单独存在，`db.js` 读它建表
- [ ] `show-tables.js` 输出了 12 个字段
- [ ] `run-once.js` 跑出过 `success`
- [ ] 关掉 mock-server 跑出过 `failed` + `ECONNREFUSED`
- [ ] 造过一条坏数据跑出过 `partial` + `failed=1`
- [ ] 跑出过 timeout，并能和 refused 区分
- [ ] `cron.js` 至少自动触发过 3 次
- [ ] `show-runs.js` 能打印并汇总
- [ ] `data\runs-report.md` 生成了，含三条结论
- [ ] 我跑过 `require("./run-once")` 的错误写法，看到"只跑一次"
