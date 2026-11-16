# 第 104 节课学习笔记

## 一、六种错误的真实指纹

| 编号 | 触发方式 | name | status | message 特征（终端原文片段） |
|---|---|---|---|---|
| IMG_TOO_LARGE | | | | |
| BAD_FORMAT | | | | |
| CONTENT_FILTER | | | | |
| TIMEOUT | | | | |
| AUTH | | | | |
| BAD_RESPONSE | | | | |

哪几种能靠 `err.name` 识别：

哪几种必须靠 `status`：

哪几种只能靠 `message`：

## 二、为什么 `CONTENT_FILTER` 最危险

它的 HTTP 状态码是：

只判断 `res.ok` 会怎样：

`finish_reason` 在哪里看：

我确认过 `lib\vision.js` 里有这个分支吗：

## 三、为什么必须带 `err.status`

如果抛错时不带 status，`classify()` 会怎么办：

我的代码里每一处 `throw` 都带了吗（列出来）：

```text

```

## 四、哪些能重试

| 错误码 | 可重试 | 理由 |
|---|---|---|
| IMG_TOO_LARGE | | |
| BAD_FORMAT | | |
| CONTENT_FILTER | | |
| TIMEOUT | | |
| RATE_LIMITED | | |
| QUOTA | | |
| BAD_RESPONSE | | |
| AUTH | | |
| NETWORK | | |
| UNKNOWN | | |

"未知默认不重试"的理由：

## 五、429 的两种含义

| message 含什么 | 属于 | 可重试 | 用户话术 |
|---|---|---|---|
| | | | |
| | | | |

分不清会怎样：

## 六、指数退避的参数

| 参数 | 我用的值 | 理由 |
|---|---|---|
| baseMs | | |
| maxMs | | |
| maxAttempts | | |
| 抖动范围 | | |

三次重试的理论总等待：

用户能忍多久（我的判断）：

UI 上要不要提示"重试中"：

## 七、抖动的必要性

没有抖动会发生什么：

`0.5 + Math.random() * 0.5` 的含义：

## 八、`detail` 和 `userMessage` 的分界

| 字段 | 给谁看 | 我在哪里写它 |
|---|---|---|
| code | | |
| userMessage | | |
| detail | | |
| status | | |

举两个"detail 泄露出去会出事"的例子：

1.
2.

## 九、测试结果

`test-classify.js`：通过 ___ / ___

`test-retry.js`：

| 组 | 调用次数 | 耗时 | 符合预期 |
|---|---|---|---|
| 1 不可重试 | | | |
| 2 可重试一直失败 | | | |
| 3 第 2 次成功 | | | |

## 十、四个错误的后果

| 错误 | 现象 | 真正的伤害 | 一眼识别 |
|---|---|---|---|
| 只判 `res.ok` | | | |
| 一律重试 | | | |
| 返回 detail | | | |
| 假设非 200 | | | |

这四个错误的共同点：

## 十一、我要加进自检清单的 10 条

1.
2.
3.
4.
5.
6.
7.
8.
9.
10.

## 十二、我还不懂的词

-

## 十三、完成检查

- [ ] `error-lab.js` 至少触发了四种真实错误
- [ ] 我把真实指纹填进了第一节的表
- [ ] `test-classify.js` 12/12 通过
- [ ] `test-retry.js` 第 1 组 1 次调用、耗时 < 50ms
- [ ] `test-retry.js` 第 2 组 3 次调用、耗时 > 100ms
- [ ] `/api/demo/err/xxx` 返回的 JSON 里没有 detail
- [ ] 服务器日志里有 detail
- [ ] 状态码 413 / 422 / 503 / 500 都对
- [ ] `out\error-matrix.md` 填完了
- [ ] 我知道 `finish_reason` 在哪看
