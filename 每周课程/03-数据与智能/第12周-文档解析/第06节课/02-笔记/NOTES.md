# 第 83 节课学习笔记

## 一、三张表各管什么

| 表 | 一行代表什么 | 谁往里写 | 谁读它 |
|---|---|---|---|
| documents | | | |
| sections | | | |
| chunks | | | |

三张表的层级关系（画一下）：

## 二、documents 表的设计理由

| 字段 | 为什么要有 | 不用它会怎样 |
|---|---|---|
| path（UNIQUE） | | |
| status（CHECK 约束） | | |
| content_hash | | |
| char_count / chunk_count | | |
| error | | |
| parsed_at | | |

为什么 `status` 要用 `CHECK` 约束而不是随便存字符串：

## 三、sections 和 page_no 的语义

对 PDF：`page_no` 是什么：

对 txt / docx：`page_no` 是什么：

为什么对 txt 全是 1：

`UNIQUE (doc_id, page_no)` 这条约束防的是什么：

## 四、chunks 表为什么这么设计（W13 要用）

| 字段 | W13 会怎么用它 |
|---|---|
| doc_id | |
| section_id | |
| seq | |
| char_count | |
| token_est | |

`UNIQUE (section_id, seq)` 防的是什么：

为什么 `token_est` 要在入库时算好，而不是每次现算：

## 五、统一接口 parse(filePath)

它的返回值长什么样：

```text

```

为什么所有解析器都要返回同一个结构：

如果要加一种新格式，我要改哪里（列举）：

1.
2.

## 六、错误类型和错误码

我的 `ParseError` 支持哪些 code：

| code | 什么情况下抛 | 下游怎么处理 |
|---|---|---|
| | | |
| | | |
| | | |

为什么"格式不支持"和"文件损坏"要分成两个 code：

## 七、单文件重试怎么做到

`parseOne()` 的返回值（成功/失败分别是什么）：

`markFailed()` 做了什么：

`--list-failed` 的输出：

`--retry` 会重试哪些，不会重试哪些：

为什么"单个文件失败"不能影响整批：

## 八、外键和级联删除

`PRAGMA foreign_keys = ON` 不设会怎样：

级联删除的效果（删一个 document 会发生什么）：

我验证过吗，怎么验证的：

## 九、四个错误的后果

| 错误 | 现象 | 真正的伤害 | 怎么一眼识别 |
|---|---|---|---|
| 忘了开外键 | | | |
| 用 `INSERT OR REPLACE` 更新文档 | | | |
| 把整批文件放一个事务 | | | |
| 存绝对路径 | | | |

为什么"存绝对路径"换台机器就出事：

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] 三张表建好了，`PRAGMA foreign_keys` 是 ON
- [ ] `parse()` 能处理我手上的所有格式
- [ ] `parseOne()` 对成功和失败都返回结构化结果
- [ ] `--list-failed` 能列出失败的文件和原因
- [ ] `--retry` 只重试失败的那些
- [ ] 我删过一个 document，看到 sections 和 chunks 一起消失
- [ ] 我故意让一个文件失败，确认其他文件不受影响
- [ ] 存的是相对路径（`samples/xxx.pdf` 而不是 `B:\...`）
