# 第 60 节课学习笔记

## 一、那个经典 bug

```javascript
const rows = db.prepare("SELECT * FROM users WHERE role = ? LIMIT 20 OFFSET ?").all(role, offset);
const total = db.prepare("SELECT COUNT(*) FROM users").get().c;
```

现象：

用户的判断：

## 二、为什么九成人会写错

两个原因：

1.
2.

## 三、解法：共用 `buildUserWhere`

```javascript
const { where, params } = buildUserWhere(filters);

const total = db.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get(...params);
const rows = db.prepare(`SELECT ... FROM users ${where} ... LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
```

为什么这样就不可能不一致：

**一句话规则：**

## 四、`clampInt` 而不是 `parseInt`

| 输入 | `parseInt` | `clampInt(x, 20, 1, 100)` |
|---|---|---|
| "abc" | | |
| "-5" | | |
| "999999" | | |
| "0" | | |

`pageSize` 为什么必须有上限：

## 五、页码越界

```javascript
const safePage = Math.min(page, totalPages);
```

为什么"拉回最后一页"比"返回空"好：

`requestedPage` 和 `page` 两个都返回，用途是：

## 六、`LIMIT ? OFFSET ?` 的参数顺序

```javascript
.all(...params, pageSize, offset);
```

顺序错了会怎样：

自检方法：

## 七、排序字段必须唯一

用 `ORDER BY role DESC` 翻页，可能出现什么问题：

为什么：

正确做法：

## 八、分页组件的 `start` / `end`

```javascript
const start = (page - 1) * pageSize + 1;
const end = Math.min(page * pageSize, total);
```

page=2, pageSize=20, total=25 时：

start =   end =

`Math.min` 不加会显示什么荒谬文案：

## 九、页码省略

`buildPageList(5, 20)` 返回：

为什么不全部显示：

## 十、`disabled` 而不是隐藏

三个理由：

1.
2.
3.

## 十一、`onGo` 回调为什么不做进组件

如果组件内部直接改 URL，会有什么限制：

## 十二、分页容器为什么要放 `#table` 外面

放里面会：

## 十三、offset 分页的性能

`LIMIT 20 OFFSET 100000` 数据库要做什么：

| 总数 | 能不能用 offset |
|---|---|
| < 1 万 | |
| 1-10 万 | |
| > 10 万 | |

替代方案的名字：

它的优点和缺点：

## 十四、改 `pageSize` 时为什么要重置 page

不重置的现象：

## 十五、五个实验的现象

| 实验 | 现象 |
|---|---|
| COUNT 去掉 WHERE | |
| 去掉越界修正 | |
| pageSize=1000000 | |
| ORDER BY role | |
| pager 放 table 里 | |

## 十六、我还不懂的词

- 

## 十七、完成检查

- [ ] `buildUserWhere` 被两个函数共用
- [ ] `clampInt` 生效
- [ ] 越界拉回
- [ ] 返回 requestedPage
- [ ] 分页控件正常
- [ ] F5 保持页码
- [ ] 后退能用
- [ ] 改筛选回第 1 页
- [ ] 做过五个实验

## 十八、卡在哪

（必填）
