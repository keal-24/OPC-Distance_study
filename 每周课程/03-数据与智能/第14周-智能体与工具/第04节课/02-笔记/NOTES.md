# 第 95 节课学习笔记

## 一、tool_call 的三个字段

| 字段 | 是什么 | 我用它做什么 |
|---|---|---|
| id | | |
| function.name | | |
| function.arguments | | |

## 二、执行前必须先做什么

一句话：

如果跳过这一步，模型给 `{"order_no":"SO99999"}` 会怎样：

## 三、dispatch 的五步

1.
2.
3.
4.
5.

哪一步最重要，为什么：

## 四、角色为 tool 的消息长什么样

```json
（贴一条真实的 role:"tool" 消息）
```

`content` 是什么类型：

## 五、tool_call_id 为什么必须对上

一句话：

我验证的方式：

## 六、我在 messages 里看到的完整结构

```json
（贴 single-step.js 打印的 messages 数组）
```

一共几条？分别是什么角色：

## 七、三个真实失败

| 输入 | 谁拦住的 | 返回的 error |
|---|---|---|
| 不存在的订单 | | |
| 缺 sql | | |
| limit 传 "10" | | |

## 八、失败为什么也要回传

如果不回传，模型下一轮会做什么：

## 九、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 漏 assistant 消息 | | |
| tool_call_id 抄错 | | |
| 结果放成 user | | |
| 异常没接住 | | |

## 十、黑名单和只读连接

黑名单能拦住什么：

黑名单拦不住什么：

为什么说 `readonly: true` 才是真正的防线：

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `node single-step.js 这个月卖了多少` 输出 22 和 23269.11
- [ ] 我看到 messages 里 assistant 的 `content` 是 `null`
- [ ] 我的 tool 消息 `tool_call_id` 和 assistant 里的一致
- [ ] `bad-calls.js` 七行输出都对
- [ ] 我做过去掉 `readonly` 的实验，看到 `attempt to write a readonly database`
- [ ] 我做过四个错误实验
- [ ] 我能说出"失败也要回传"的理由
