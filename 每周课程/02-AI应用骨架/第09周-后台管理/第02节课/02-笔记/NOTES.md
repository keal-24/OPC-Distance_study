# 第 58 节课学习笔记

## 一、四种状态

| 状态 | 什么时候 | 新手版用户看到 | 用户判断 |
|---|---|---|---|
| 加载中 | | | |
| 有数据 | | | |
| 空 | | | |
| 出错 | | | |

为什么"空"状态最重要：

## 二、`SELECT` 明确列字段

```javascript
// 错
db.prepare("SELECT * FROM users").all();
```

为什么错：

"安全默认值"和 `toPublicUser` 是同一个思路，怎么理解：

## 三、`WHERE ${where}` 拼接安不安全

```javascript
const where = includeDeleted ? "1 = 1" : "deleted_at IS NULL";
```

安全吗？为什么：

什么样的拼接是危险的：

## 四、`ORDER BY id DESC` 而不是 `created_at DESC`

两个原因：

1.
2.

## 五、`renderTable` 的 `render` 和默认值

```javascript
return `<td${cls}>${col.render ? value : esc(value)}</td>`;
```

`col.render` 返回的 HTML 要不要 esc：

所以 `render` 里插入用户数据必须：

## 六、`rowKey` 的用途

`data-key` 让你能做什么：

什么叫"事件委托"：

## 七、状态映射为什么在前端做

后端返回 `status: "active"`，前端显示"正常"。

如果后端直接返回中文，会有什么问题：

`|| ["gray", row.status]` 这个兜底防的是：

## 八、`fmtAgo` + `title`

显示"3 分钟前"，悬停看精确时间。

为什么后台要这样：

## 九、`last_login_at` 更新位置

为什么在"密码验证通过之后"更新，不在之前：

如果放在验证之前会怎样：

## 十、五个实验的现象

| 实验 | 现象 |
|---|---|
| `SELECT *` | |
| 故意 throw | |
| 全软删除 | |
| `ORDER BY ASC` | |
| 1000 条 | |

## 十一、1000 条数据的感受

渲染耗时：

Network 里的 Size：

滚动长度：

三个结论：

1.
2.
3.

## 十二、`ORDER BY` 为什么必须白名单

`ORDER BY ?` 能用占位符吗：

不能用，所以必须：

## 十三、我还不懂的词

- 

## 十四、完成检查

- [ ] `listUsers` 不含 password_hash
- [ ] 按 id 倒序
- [ ] 软删除不出现
- [ ] 三种状态都验证过
- [ ] "最后登录"能显示
- [ ] 恶意昵称不弹 alert
- [ ] 做过 1000 条实验

## 十五、卡在哪

（必填）
