# 第 62 节课学习笔记

## 一、为什么两种角色不够

场景：

方案 A（给 admin）的问题：
方案 B（给 user）的问题：

## 二、三种角色各自的权限

| 角色 | 权限 |
|---|---|
| user | |
| operator | |
| admin | |

## 三、`can()` 的实现

```javascript
export const can = (role, permission) => {
  const list = ROLE_PERMISSIONS[role];
  if (!Array.isArray(list)) return false;
  return list.includes(permission);
};
```

未知角色返回：

为什么这是安全默认值（deny by default）：

## 四、`permissionsOf` 为什么要返回副本

```javascript
// 错
return ROLE_PERMISSIONS[role] || [];

// 对
return [...(ROLE_PERMISSIONS[role] || [])];
```

不复制会怎样（我做的实验）：

后果的严重性：

## 五、为什么权限用常量

```javascript
can(role, PERMISSIONS.USER_DELETE)   // 好
can(role, "user.delete")             // 坏
```

打错字时两种写法的区别：

## 六、`/api/me` 返回 permissions

```javascript
res.json({ user: req.user, permissions: permissionsOf(req.user.role) });
```

为什么前端不自己写 role→permission 映射（三个理由）：

1.
2.
3.

## 七、`requirePermission` 的位置

```javascript
adminRouter.use(requireAuth);
adminRouter.delete("/users/:id", requirePermission(...), handler);
```

为什么 `requirePermission` 必须在 `requireAuth` 之后：

顺序反了的现象：

## 八、PATCH 的两段检查

```javascript
if (!can(req.user.role, PERMISSIONS.USER_UPDATE)) { 403 }
if (role !== undefined && !can(req.user.role, PERMISSIONS.USER_ROLE)) { 403 }
```

为什么不能简单挂一个 `requirePermission`：

只检查第一段会怎样（垂直提权）：

## 九、五个 curl 测试的结果

| # | 测试 | 期望 | 实际 |
|---|---|---|---|
| 1 | operator 读列表 | 200 | |
| 2 | operator 改昵称 | 200 | |
| 3 | operator 改角色 | 403 | |
| 4 | operator 删用户 | 403 | |
| 5 | user 进后台 | 403 FORBIDDEN | |

## 十、403 返回的字段

```javascript
{ error, code: "NO_PERMISSION", required, yourRole }
```

`required` 和 `yourRole` 的用途：

为什么还要区分 `FORBIDDEN`（进不了后台）和 `NO_PERMISSION`（能进但没这个权限）：

## 十一、垂直提权

定义：

我的实验（把 USER_ROLE 检查注释掉）：

后果：

## 十二、`disabled` 和隐藏的区别

角色下拉没有权限时，为什么禁用而不是隐藏：

## 十三、五个实验的现象

| 实验 | 现象 |
|---|---|
| operator 提权 | |
| permissionsOf 不复制 | |
| 前端不按权限显示 | |
| 给 operator 加删除 | |
| 未知角色 | |

## 十四、我还不懂的词

- 

## 十五、完成检查

- [ ] `permissions.js` 四个导出
- [ ] 三种角色
- [ ] `requirePermission` 能用
- [ ] `/api/me` 返回权限
- [ ] 每个接口挂权限
- [ ] PATCH 两段检查
- [ ] 前端按权限显示
- [ ] 五个 curl 测试全对
- [ ] 做过提权实验

## 十六、卡在哪

（必填）
