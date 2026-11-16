# 第 50 节课学习笔记

## 一、我第 7 周的账本里有几个用户

```text
（把 npm run report --by=user 的输出贴这里）
```

哪几个是假的？为什么这是个问题：

## 二、注册的六个坑

| 坑 | 后果 |
|---|---|
| | |
| | |
| | |
| | |
| | |
| | |

## 三、表结构

| 字段 | 类型 | 为什么要它 |
|---|---|---|
| id | | |
| email | | |
| password_hash | | |
| nickname | | |
| role | | |
| status | | |
| created_at | | |

为什么 `email` 必须 UNIQUE：

## 四、为什么"先查再插"不可靠

```javascript
// 错
const existing = findByEmail(email);
if (existing) return { ok: false };
db.prepare("INSERT ...").run(...);
```

两个请求同时来时，发生了什么：

我跑并发测试的结果：

```text
（贴输出）
```

## 五、`PRAGMA` 两行

| 语句 | 作用 | 不开会怎样 |
|---|---|---|
| `journal_mode = WAL` | | |
| `foreign_keys = ON` | | |

## 六、迁移为什么包在事务里

如果建表成功但记版本号失败，下次启动会：

## 七、`createUser` 为什么返回对象而不是抛异常

| 情况 | 用异常 | 用返回值 |
|---|---|---|
| 重复邮箱 | | |
| 数据库断了 | | |

**判断标准：**

## 八、`toPublicUser` 的意义

为什么不在查询时直接 `SELECT id, email`：

"安全默认值"这个原则，我在哪些地方见过（回想第 6 周）：

## 九、不泄露存在性

如果把"邮箱已注册"返回给前端，攻击者能做什么：

我的答案：

## 十、`peek.js` 看到的哈希

```text
（贴一条）
哈希长度：
开头是：
```

如果长度是 15，说明什么：

## 十一、`Buffer.byteLength` vs `.length`

```javascript
"密码密码密码密码".length = 
Buffer.byteLength("密码密码密码密码", "utf8") = 
```

bcrypt 的 72 是指哪种单位：

## 十二、`express.static` 指向根目录

会导致哪些文件可被下载：

我实测的结果：

```text
curl /.env → 
curl /data/app.db → 
```

## 十三、五个实验的现象

| 实验 | 现象 |
|---|---|
| 删 await | |
| 改成先查再插 | |
| 去掉 toLowerCase | |
| 返回真实错误 | |
| 200KB body | |

## 十四、我还不懂的词

- 

## 十五、完成检查

- [ ] 四个包装好
- [ ] `users` 表有 UNIQUE
- [ ] 哈希长度 60
- [ ] 重复注册返回"成功"
- [ ] `/.env` 是 404
- [ ] 200KB 被拦
- [ ] 日志无明文密码

## 十六、卡在哪

（必填）
