# 第 48 节课学习笔记

## 一、中断要跨几段

```text
[浏览器] → [你的服务] → [上游模型]
```

三段各要做什么：

1.
2.
3.

哪一段没做，后果是什么：

## 二、判断"上游真的停了"的唯一依据

不是看前端，是看：

我这次看到的日志：

```text
（贴假模型的日志原文）
```

## 三、`for await` 的 `break` 为什么不保证停

`for await` 在 break 时会调用什么：

为什么不够：

## 四、`reader.cancel()` 做了三件事

1.
2.
3.

## 五、改造前后对比

| 阶段 | 假模型日志 | 说明 |
|---|---|---|
| 用 `for await` | | |
| 用 `getReader` | | |
| 去掉 `cancel` | | |

## 六、为什么 `req.close` 和 `res.close` 都要监听

只监听 `req.close` 时，我遇到的偶发现象：

## 七、`send` 的 try/catch

不 catch 的后果：

我在日志里看到的错误：

## 八、`ERR_STREAM_DESTROYED`

什么时候出现：

怎么避免：

## 九、`ok: false, status: 499` 为什么是对的

| 字段 | 值 | 为什么 |
|---|---|---|
| ok | false | |
| status | 499 | |
| errCode | ABORTED | |
| estimated | true | |

## 十、三种超时

| 类型 | 我设的值 | 依据 |
|---|---|---|
| 首字超时 | | |
| 空闲超时 | | |
| 总时长 | | |

为什么 `AbortSignal.timeout` 一个不够：

## 十一、`partialUsage` 解决什么问题

## 十二、中断之后还花不花钱

我理解为：

## 十三、我还不懂的词

- 

## 十四、完成检查

- [ ] `chatStream` 用 getReader + cancel
- [ ] 中断时抛 499
- [ ] 服务端监听两个 close
- [ ] `send` 有 try/catch
- [ ] `finally` 里判断 clientClosed
- [ ] 三种超时都实现了
- [ ] 看到"已发出 5/40 字"

## 十五、卡在哪

（必填）
