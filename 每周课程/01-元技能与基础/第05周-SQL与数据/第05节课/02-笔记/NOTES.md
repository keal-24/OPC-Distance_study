# 第 33 节课学习笔记

## 一、INNER vs LEFT（我的实测行数）

```text
INNER JOIN books/authors : ____ 行
LEFT  JOIN authors/books : ____ 行
```

差的那些行是什么：

为什么：

一句话区别：

## 二、"左表"是哪个

```sql
SELECT a.name, b.title
FROM books b
LEFT JOIN authors a ON a.id = b.author_id
```

这里的左表是：________

因为它 `FROM` 后面是：________

结果行数：____（和我预期的一样吗）

## 三、反连接

找出"没有关联数据"的行的写法：

```sql
```

为什么用 `b.id IS NULL` 不用 `b.title IS NULL`：

我能想到的三个反连接场景：

1.
2.
3.

## 四、多对多

三张表结构：

```text
________
  id
  ...

________（中间表）
  ____  → 指向
  ____  → 指向

________
  id
  ...
```

"某本书的所有标签"的 SQL：

```sql
```

"每个标签下多少本书"的 SQL：

```sql
```

## 五、GROUP_CONCAT

用法：

没数据时返回什么（我实测的）：

```text
（贴这里）
```

为什么前端要 `?? ""`：

SQLite 的 `GROUP_CONCAT` 支持内部 `ORDER BY` 吗：

那要排序怎么办：

## 六、N+1 问题

定义：

我的实测耗时（5 条数据）：

```text
N+1  ：____ ms
JOIN ：____ ms
```

为什么小数据测不出来：

判断 N+1 的一句话规则：

## 七、笛卡尔积

忘了 ON 时行数：

```text
books(5) × authors(4) = ____
```

如果两个表各 10000 行会得到多少行：

为什么这会让服务器崩：

## 八、LEFT JOIN 的 WHERE 陷阱

```sql
-- 写法 A
LEFT JOIN books b ON b.author_id = a.id WHERE b.price_cents > 3000

-- 写法 B
LEFT JOIN books b ON b.author_id = a.id AND b.price_cents > 3000
```

A 的结果行数：____
B 的结果行数：____

为什么 A 会退化成 INNER JOIN：

唯一例外（WHERE 里能对右表用的条件）：

## 九、COUNT(*) vs COUNT(列)

在 LEFT JOIN 下：

```text
COUNT(*)       → 空匹配的组得到 ____
COUNT(右表主键) → 空匹配的组得到 ____
```

为什么：

## 十、迁移 chat-app

表结构：

```sql
-- 我写的
```

迁移的关键三步：

1.
2.
3.

为什么包在事务里：

旧 JSON 的 `role: "system"` 怎么处理：

迁移后怎么验证：

## 十一、五个坑的实测结果

| 坑 | 结果 |
|---|---|
| 忘 ON | |
| INNER 丢行 | |
| COUNT(*) | |
| WHERE 筛右表 | |
| GROUP_CONCAT null | |

## 十二、我还不懂的词

- 

## 十三、完成检查

- [ ] join.db 有 4 作者 / 5 书 / 4 标签 / 3 客户 / 5 订单
- [ ] 我实测过 INNER 和 LEFT 的行数差
- [ ] 我知道左表是 FROM 后面那个
- [ ] 我会写反连接
- [ ] 我会写多对多的两个方向查询
- [ ] 我知道 GROUP_CONCAT 没数据返回 null
- [ ] 我能解释 N+1
- [ ] 我知道笛卡尔积的危险
- [ ] 我知道 LEFT JOIN 的 WHERE 陷阱
- [ ] 我知道 LEFT JOIN 计数要用 COUNT(右表主键)
- [ ] chat-app 已迁移到 chat.db
- [ ] 我写了 verify.mjs
- [ ] 旧 JSON 还留着
