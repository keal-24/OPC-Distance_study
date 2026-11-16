# 第 32 节课学习笔记

## 一、动态 IN

生成占位符的写法：

```javascript
```

为什么空数组不能直接拼：

报错原文：

```text
（贴这里）
```

`all(...arr)` 和 `all(arr)` 的区别：

## 二、条件累加的三段结构

```javascript
const conditions = [];   // 存什么：
const params = [];       // 存什么：

// 最后怎么用：
```

"结构可拼、值不可拼"，这句话我举个例子：

## 三、ORDER BY 白名单

为什么必须白名单：

用户传 `sort=id; DROP TABLE` 会怎样：

我写的白名单：

## 四、多字段搜索

基本写法：

```sql
```

必须加括号的原因：

`LIKE '%x%'` 为什么用不上索引：

转义函数怎么写：

为什么空关键字要跳过：

## 五、中文排序（重点）

`PRAGMA collation_list` 的输出：

```text
（贴这里）
```

SQLite 有哪三种 collation，各管什么：

| collation | 作用 |
|---|---|
| | |
| | |
| | |

`ORDER BY name` 排中文的结果（我实际跑的）：

```text
（贴你的）
```

用 `localeCompare(…,"zh-CN")` 排的结果：

```text
（贴你的）
```

两者差在哪：

三种解法各自的代价：

| 方案 | 优点 | 缺点 |
|---|---|---|
| JS 里排 | | |
| 存拼音字段 | | |
| 自定义 collation | | |

如果要做"拼音排序 + 分页"，我会选哪个方案，为什么：

## 六、NULL 排序

`ORDER BY stock ASC` 时 null 在第几条：

`ORDER BY stock DESC` 时 null 在第几条：

为什么：

`NULLS LAST` 的效果：

`CASE WHEN` 的写法：

```sql
```

## 七、大小写敏感性

| 比较方式 | 敏感吗 |
|---|---|
| `=` | |
| `LIKE`（英文） | |
| `IN` | |
| `ORDER BY` 默认 | |
| `COLLATE NOCASE` | |

`LOWER(name) = ?` 为什么慢：

## 八、我写的 filters.mjs

它支持的参数：

它的返回结构：

它怎么处理垃圾参数：

我测试的坏参数和结果：

```text
（贴这里）
```

## 九、五个坑的实测结果

| 坑 | 结果 |
|---|---|
| `IN ()` | |
| AND/OR 不加括号 | |
| `%` 不转义 | |
| 中文排序 | |
| NULL 排最前 | |

## 十、我还不懂的词

- 

## 十一、完成检查

- [ ] filter.db 有 12 条数据
- [ ] 我会动态生成 IN 占位符
- [ ] 我知道空数组要提前返回
- [ ] 我会写 ORDER BY 白名单
- [ ] 我知道搜索条件必须加括号
- [ ] 我会转义 LIKE 特殊字符
- [ ] 我知道 SQLite 只有三种 collation
- [ ] 我知道 SQLite 排不了中文拼音
- [ ] 我会用 localeCompare 排中文
- [ ] 我知道 NULL 在 ASC 排最前
- [ ] 我会用 NULLS LAST
- [ ] 我写出了 buildProductQuery
- [ ] 我的筛选器对垃圾参数不崩
- [ ] 我做了练习 1 的订单筛选器
