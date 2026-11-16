# 第 94 节课学习笔记

## 一、一次请求的四个字段

| 字段 | 值 | 作用 |
|---|---|---|
| model | | |
| messages | | |
| tools | | |
| tool_choice | | |

## 二、tools 参数的结构

把 `query_stats` 那一个工具抄一遍（凭记忆）：

## 三、返回里的 tool_calls 长什么样

```json
（贴一段真实的 tool_calls）
```

`arguments` 是什么类型：

## 四、finish_reason 有哪几种值

| 值 | 意思 | 我该做什么 |
|---|---|---|
| stop | | |
| tool_calls | | |
| length | | |

## 五、假模型是怎么判断的

| 关键词 | 返回的工具 | 参数 |
|---|---|---|
| 有哪些表 / 表结构 | | |
| 这个月 / 多少 | | |
| SO00042 这种订单号 | | |
| 匹配不到 | | |

## 六、我看到的完整返回

把 `node probe.js` 第二段（这个月卖了多少）的完整 JSON 贴进来：

```json
（粘贴）
```

`usage` 里的三个数字是多少：

## 七、真接口与假接口的对照

| 位置 | 真接口 | 假接口 | 我必须怎么处理 |
|---|---|---|---|
| finish_reason | | | |
| content | | | |
| arguments | | | |
| tool_calls 的 id | | | |

## 八、为什么要有假模型

三条理由，用你自己的话说：

## 九、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 忘了传 tools | | |
| arguments 当对象 | | |
| 用 content 判断 | | |
| if (process.env.MOCK) | | |

## 十、MOCK=false 时我改了什么

我有没有真的调过一次真接口（调了/没调）：

一次请求大概多少 token：

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `node probe.js` 打印三段，前两段 `finish_reason` 是 `tool_calls`
- [ ] 我看到 `content` 是 `null`
- [ ] 我看到 `arguments` 是字符串
- [ ] 我知道 `finish_reason` 是唯一可靠的判断依据
- [ ] 我做过四个错误实验
- [ ] 我能说出假模型的三个局限
- [ ] 我的 `.env` 现在还是 `MOCK=true`
