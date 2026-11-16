# 第 45 节课学习笔记

## 一、三个烧钱入口

| 入口 | 场景 | 我账本里的例子 |
|---|---|---|
| 超长输入 | | |
| 超长输出 | | |
| 超长历史 | | |

## 二、`max_tokens` 四档对比（真实数字）

| max_tokens | 实际输出 token | finish_reason | 字符数 | 成本 |
|---|---|---|---|---|
| 50 | | | | |
| 200 | | | | |
| 800 | | | | |
| 4000 | | | | |

### 截断时的输出长什么样

```text
（把 max_tokens=50 的完整输出贴这里）
```

最后几个字是什么？有标点吗？

## 三、为什么 `max_tokens` 不能单独保证成本上界

```text
最坏成本 = ____________ + ____________
```

`max_tokens` 管的是哪一项：

## 四、我定的 `max_tokens` 及依据

```text
采样次数：
中位数：
P90：
最大值：
我定的值：
依据：
```

## 五、`finish_reason` 和 `truncated`

为什么要把字符串转成布尔：

## 六、20 轮历史的 token 对比

| keepRounds | 实际发送的 promptTokens | 成本 |
|---|---|---|
| 20（不裁） | | |
| 6 | | |
| 3 | | |
| 1 | | |

只带 1 轮时，它还能回答"总结一下改了什么"吗：

## 七、`trimHistory` 保留了哪三样东西

1.
2.
3.

为什么第一条用户消息必须保留（举个例子）：

## 八、`slice(-N)` 的坑

```javascript
const recent = messages.slice(-12);
```

20 条消息时，它会裁掉：

现象是：

## 九、"省略提示"实验

有提示时，问"第 3 个问题是什么"，它答：

没提示时，它答：

结论：

## 十、`LimitError` vs `LlmError`

| 错误 | 谁的问题 | statusCode | 给用户的话 |
|---|---|---|---|
| LimitError | | | |
| LlmError | | | |

为什么要分开：

## 十一、循环依赖

为什么 `limits.js` 不能 import `llm.js`：

我把 `estimateTokens` 挪到了哪里：

## 十二、我还不懂的词

- 

## 十三、完成检查

- [ ] `limits.js` 五个导出齐
- [ ] `tokens.js` 独立
- [ ] `chat` 返回 truncated / historyTrimmed
- [ ] 跑过四档 max_tokens
- [ ] 跑过三种 keepRounds
- [ ] 验证过"只带 1 轮会答不出"

## 十四、卡在哪

（必填）
