# 第 149 节课学习笔记

## 一、五个 SCAN 能不能救

| 查询 | 能救吗 | 需要什么索引 |
|---|---|---|
| `COUNT(*)` | | |
| `ORDER BY created_at` | | |
| `offset=20000` | | |
| `GROUP BY category` | | |
| `WHERE category` | | |
| `LIKE '%裂%'` | | |

**为什么 `LIKE '%x%'` 救不了：**

## 二、加 `(created_at)` 索引

```text
建索引耗时 ____ ms
改之前 ORDER BY     ____ ms
改之后 ORDER BY     ____ ms
提升 ____ 倍
改之前 offset=20000 ____ ms
改之后 offset=20000 ____ ms
```

**EXPLAIN 变化：**

```text
改之前：
改之后：
```

**`SCAN USING INDEX` 和 `SEARCH USING INDEX` 的区别：**

## 三、加 `(category)` 索引

```text
GROUP BY category   改前 ____ → 改后 ____
WHERE category      改前 ____ → 改后 ____
```

## 四、加"错的"索引

**给 `input` 加索引后：**

```text
LIKE '%裂%' 耗时：____ → ____（变了吗）
EXPLAIN 里有 idx_tickets_input 吗：
```

**为什么优化器忽略它：**

**代价（磁盘/写入）：**

## 五、复合索引

**为什么是 `(category, created_at)` 不是 `(created_at, category)`：**

**加完之后 EXPLAIN：**

```text
```

**有 `TEMP B-TREE` 吗：**

## 六、最左前缀

| 查询 | `(category, created_at)` 能用吗 | 为什么 |
|---|---|---|
| `WHERE category='x'` | | |
| `WHERE category='x' ORDER BY created_at` | | |
| `WHERE created_at > x` | | |
| `ORDER BY created_at` | | |

**为什么 `(created_at)` 单独的索引还要保留：**

## 七、砍掉一个索引

**`idx_tickets_category` 被删掉后，`GROUP BY` 还快吗：**

**删对了还是删错了：**

## 八、八个索引的代价

| 索引数 | 单条 INSERT | 批量 | 库大小 |
|---|---|---|---|
| 3 | | | |
| 8 | | | |

**倍数：**

**为什么基数低的字段（urgency）建索引没用：**

## 九、`INDEXES.md`

**三个索引各服务什么查询：**

```text
① 
② 
③ 
```

**被删掉的索引及原因：**

## 十、我遇到的卡点

## 十一、我是怎么解决的

## 十二、我还不懂的词

-

## 十三、完成检查

- [ ] 四个 SCAN 变快了，LIKE 没变
- [ ] 三个索引，每个能说出服务的查询
- [ ] 验证过最左前缀
- [ ] 加错索引的实测（没变快）
- [ ] 八个索引的写入代价实测
- [ ] INDEXES.md 写完（含被删的）
- [ ] 能用一句话说出"索引对着查询建"
