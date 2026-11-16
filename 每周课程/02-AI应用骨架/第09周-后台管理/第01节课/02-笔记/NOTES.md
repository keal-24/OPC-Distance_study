# 第 57 节课学习笔记

## 一、今天的三件事

1.
2.
3.

为什么"门锁"要第一天就做：

## 二、三次 curl 的结果

### 不带 Cookie

```text
（贴完整输出，含 HTTP 状态码）
```

### Bob 的 Cookie

```text
（贴）
```

### Alice 的 Cookie

```text
（贴）
```

**结论（三种状态码各代表什么）：**

| 状态码 | 意思 | 谁来处理 |
|---|---|---|
| 401 | | |
| 403 | | |
| 200 | | |

## 三、`adminRouter.use()` 和每个接口各挂一遍

两种写法：

```javascript
// A

// B
```

为什么 B 更好（三条）：

1.
2.
3.

## 四、去掉 `requireRole` 的实验

Bob 用 curl 拿到的响应：

```json
（贴）
```

**这说明"只做页面守卫"的后果是：**

## 五、403 改成 401 的实验

现象（页面层面）：

用户会怎么想：

## 六、XSS 实验

我改的恶意邮箱：

页面现象：

如果不写 `esc()`，攻击者能做什么（举两个比 alert 更严重的）：

1.
2.

**规则：** `${ }` 里凡是来自______的数据，一律 `esc()` 包一层。

## 七、`credentials: "same-origin"`

注释掉之后的现象：

为什么 `fetch` 默认不带 Cookie：

## 八、静态资源路径

```html
<link rel="stylesheet" href="admin.css" />   <!-- 实际请求的是 -->
```

正确写法：

## 九、`min-width: 0`

```css
.sidebar { flex: 0 0 200px; }
.main { flex: 1; min-width: 0; }
```

不加 `min-width: 0`，表格很宽时会：

## 十、`startOfTodayLocal()`

```javascript
return new Date(`${year}-${month}-${day}T00:00:00`).toISOString();
```

为什么不带 `Z`：

带 `Z` 会怎样：

## 十一、`Number(x.total)`

不包会报什么错：

## 十二、`deleted_at` 字段

为什么每个查询都要 `AND deleted_at IS NULL`：

软删除后邮箱仍然占着唯一性，这个问题怎么解决：

## 十三、五个实验的现象

| 实验 | 现象 |
|---|---|
| 去掉 requireRole | |
| 403 改 401 | |
| 去掉 esc | |
| 去掉 credentials | |
| 相对路径 | |

## 十四、我还不懂的词

- 

## 十五、完成检查

- [ ] `admin-routes.js` 有两道锁
- [ ] `app.js` 挂了 admin 路由
- [ ] 401/403/200 三态都验证过
- [ ] 总览页能显示数字
- [ ] Bob 访问显示"没有权限"
- [ ] 做过 XSS 实验
- [ ] 所有动态数据都 esc 了

## 十六、卡在哪

（必填）
