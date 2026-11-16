# 第 53 节课学习笔记

## 一、IDOR 是什么

一句话：

为什么它排第一：

## 二、那个有漏洞的接口

```javascript
app.get("/api/items/:id", requireAuth, (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  res.json(item);
});
```

它检查了什么：  它漏了什么：

## 三、打穿记录

```text
（贴 attack:idor 里"⚠️ 别人的"那几行）
```

扫了 20 个 id，拿到 ___ 条别人的数据：

## 四、`visibility` 字段为什么没起作用

数据库里有这个字段，但代码没看它。

这说明什么：

## 五、三种修法对比

| 修法 | 写法 | 优点 | 缺点 |
|---|---|---|---|
| 先查再判断 | | | |
| 查询带条件 | | | |
| `userId` 必填参数 | | | |

我选：

## 六、为什么"不是你的"要返回 404

如果返回 403，攻击者能推出什么：

## 七、`UPDATE` / `DELETE` 也要防

我实测"只防 GET 不防 DELETE"的结果：

```text
curl -X DELETE /api/items/3（Bob 的数据，用 Alice 的 Cookie）
HTTP 状态：
Bob 登录后看到的列表：
```

## 八、`user_id` 不能从请求参数取

```javascript
// 错
const { userId, title } = req.body;
createItem(userId, { title });
```

攻击者传 `{"userId": 2}` 会发生什么：

## 九、角色和归属是两层

| 场景 | 归属判断 | 角色判断 |
|---|---|---|
| 普通用户删自己的 | | |
| 普通用户删别人的 | | |
| 管理员删别人的 | | |

## 十、为什么 `req.user.role` 要来自数据库

改角色后，旧 JWT 里的 `role` 是：

如果只用 JWT 的 `role`，要多长时间才生效：

## 十一、`id` 校验

```javascript
Number("abc") = 
if (!Number.isInteger(id) || id <= 0) 
```

不校验会怎样：

## 十二、自测脚本

七个测试分别测什么：

1.
2.
3.
4.
5.
6.
7.

为什么要写成测试，而不是手动点一遍：

## 十三、四个实验的现象

| 实验 | 现象 |
|---|---|
| 改成 unsafe | |
| 只改 GET | |
| 403 代替 404 | |
| id=abc | |

## 十四、我还不懂的词

- 

## 十五、完成检查

- [ ] `items` 表有 user_id + 索引
- [ ] 三个 safe 函数都带条件
- [ ] 列表按 user_id 过滤
- [ ] 全部返回 404
- [ ] `requireRole` 能用
- [ ] 跑过 attack:idor
- [ ] test:auth 七条全过

## 十六、卡在哪

（必填）
