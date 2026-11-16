# 第 153 节课学习笔记

## 一、五种排序的耗时

| 排序 | P50 | 走索引 |
|---|---|---|
| `created_at DESC` | | |
| `id DESC` | | |
| `category, created_at DESC` | | |
| `LENGTH(input) DESC` | | |
| `id*2 DESC` | | |
| `need_human DESC, created_at DESC` | | |

**为什么函数排序比"无索引字段排序"更慢：**

## 二、三种"不可直接排序"

| 情况 | 为什么 | 解法 |
|---|---|---|
| 函数 | | |
| 多表聚合 | | |
| 业务公式 | | |

## 三、预计算列

```sql
ALTER TABLE tickets ADD COLUMN ____ INTEGER NOT NULL DEFAULT 0;
CREATE INDEX ____ ON tickets(____ DESC);
```

**写入时怎么维护：**

**更新时怎么保证同步（三种防法）：**

**我选了哪种：**

## 四、回填

```sql
UPDATE tickets SET input_len = LENGTH(input) WHERE input_len = 0;
```

**回填了 ____ 行，耗时 ____ ms**

**如果不回填会发生什么：**

## 五、预计算的效果

```text
ORDER BY LENGTH(input)  ____ ms
ORDER BY input_len      ____ ms
快 ____ 倍
```

**EXPLAIN：**

```text
```

**有 TEMP B-TREE 吗：**

## 六、热度公式

```text
hot_score = 

```

**为什么用 log：**

**为什么有时间衰减：**

**为什么小数除法要写 `3600000.0`：**

## 七、定时算 vs 实时算

```text
定时算   ____ ms
实时算   ____ ms
快 ____ 倍
```

**只算最近 30 天，能省多少：**

## 八、新内容立刻可见

**如果 5 分钟延迟不可接受，我选：**

```text
[ ] 写入时立刻算一次
[ ] 混合排序（新的按时间，老的按热度）
[ ] 接受不准确
```

**理由：**

## 九、稳定排序

**检查结果：**

```bash
grep -rn "ORDER BY" app/repos/ --include="*.js"
```

**有几条缺 id 兜底：**

**稳定性测试结果（20 条同分）：**

```text
只按 hot_score：重复 ____ 条
hot_score + id：重复 ____ 条
```

**为什么"小数据量恰好稳定"不能依赖：**

## 十、urgency 排序的坑

```javascript
["high", "medium", "low"].sort()   // →
```

**所以 `ORDER BY urgency DESC` 的结果是：**

**解法：**

## 十一、我遇到的卡点

## 十二、我是怎么解决的

## 十三、我还不懂的词

-

## 十四、完成检查

- [ ] 五种排序实测
- [ ] 预计算列 + 索引（含 DESC）
- [ ] 历史数据回填
- [ ] 更新时同步（触发器或统一函数）
- [ ] EXPLAIN 无 TEMP B-TREE
- [ ] 热度定时算（只算 30 天）
- [ ] 新工单立刻算一次
- [ ] 所有 ORDER BY 带 id
- [ ] 稳定性测试
- [ ] 排序决策表
- [ ] 能用一句话说出"ORDER BY 函数索引就死"
