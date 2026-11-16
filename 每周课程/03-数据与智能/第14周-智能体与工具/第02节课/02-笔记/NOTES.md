# 第 93 节课学习笔记

## 一、工具说明书的三个字段

| 字段 | 给谁看 | 写错的后果 |
|---|---|---|
| name | | |
| description | | |
| parameters | | |

## 二、反例：三个字说明书的后果

它猜了哪三样东西：

实际报的错：

## 三、description 要写清的四件事

1.
2.
3.
4.

## 四、两个正例的对照

| | list_tables | query_stats |
|---|---|---|
| 有没有参数 | | |
| 什么时候该调 | | |
| 我把哪条边界写进了 description | | |

## 五、参数边界：required / enum / pattern / additionalProperties

| 约束 | 卡住什么 | 我写在哪个工具上 |
|---|---|---|
| required | | |
| enum | | |
| pattern | | |
| maximum | | |
| additionalProperties | | |

## 六、我写的校验器覆盖了哪些情况

它能拦住的：

它拦不住的（想一个）：

## 七、八组参数校验的真实结果

```text
（把 node check-tools.js 的完整输出贴进来）
```

哪一组最容易被忽略：

## 八、模型为什么会调错

用你自己的话说，不许写"因为模型笨"：

## 九、四个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| description 写散文 | | |
| 漏 required | | |
| enum 写中文 | | |
| 不写表结构 | | |

## 十、为什么不用 ajv

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `tools.js` 里有四个工具，都能被 `require`
- [ ] 每个工具有 `description`，且写了"什么时候用"
- [ ] `query_stats` 的 `sql` 描述里有完整表结构
- [ ] `validate.js` 能拦住六种错参数
- [ ] `node check-tools.js` 输出 8 行，6 行"不通过"
- [ ] 我做过四个错误实验，看到了 `no such column`
- [ ] 我知道 enum 写错会"不报错但答错"
