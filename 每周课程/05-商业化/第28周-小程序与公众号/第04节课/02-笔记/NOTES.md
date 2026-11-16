# 第 193 节课学习笔记

## 一、完整链路

画出从 `wx.login()` 到拿到 `token` 的六步：

1.
2.
3.
4.
5.
6.

## 二、`code`

有效期多久：

能用几次：

为什么设计成一次性的：

## 三、三个 id

| id | 唯一范围 | 用它做什么 |
|---|---|---|
| openid | | |
| unionid | | |
| user_id（我的） | | |

把 `openid` 当主键会出什么事：

## 四、`session_key`

它是干什么的：

能下发到前端吗，为什么：

它绝对不能出现在哪三个地方：

1.
2.
3.

## 五、`code2session`

错误码翻译：

| errcode | 原始含义 | 我翻译成什么 |
|---|---|---|
| 40029 | | |
| 45011 | | |
| 40163 | | |
| 40226 | | |

为什么 URL 参数要 `encodeURIComponent`：

不编码会出什么现象（为什么是偶发的）：

## 六、表

`unique (app_id, open_id)` 为什么不是 `(tenant_id, open_id)`：

`user_id` 为什么可以为 null：

`union_id` 为什么要单独存：

`last_login_at` 有什么用：

## 七、`loginPromise`

不做并发合并会发生什么：

```text
小程序启动 → 3 个请求同时发
三个都 401 →
```

`.finally(() => { loginPromise = null })` 是干什么的：

## 八、启动登录

`onLaunch` 里为什么要先登录：

`globalData.ready` 怎么用：

`await` 一个 rejected promise 会怎样：

## 九、为什么登录接口不能用 pool

`wechat_users` / `invite_codes` 都有 `force RLS` 之后，用 `pool.query` 查出来是几行：

`pool.query` 查 `wechat_users` 实际报的错（如果有）：

为什么这个接口"不可能"设 `app.tenant_id`（把死循环写出来）：

`systemPool` 是怎么绕过去的：

**我列出的"还不知道租户就要读表"的位置（至少四个）：**

| 位置 | 表 | 用什么 |
|---|---|---|
| | | |
| | | |
| | | |

## 十、邀请码的设计

码里为什么必须绑一个具体的 `user_id`：

`for update` 不加会发生什么：

为什么 `attempts` 的检查要放在 `used_at` 之前：

`randomCode` 为什么用 `crypto` 不用 `Math.random`：

生成新码时为什么要把旧码作废：

## 十一、needBind 为什么不能返回 401

如果返回 401，客户端会发生什么：

`bindTicket` 和 `token` 的差别（payload / 有效期 / 能调什么）：

## 十二、三个错误

### 返回 session_key

我在哪看到了它：

### 用 openid 当身份

行不通的两个原因：

1.
2.

### 删掉 45011

客户看到的报错：

## 十三、我踩的坑

报错原文：

原因：

怎么修的：

## 十四、我还不懂的词

- 

## 十五、完成检查

- [ ] 响应里没有 `session_key`
- [ ] token payload 是 `{ uid }`
- [ ] `loginPromise` 生效（三个请求只换一次 token）
- [ ] 知道登录必须用 systemPool，不是 pool
- [ ] 知道 needBind 不能返回 401
- [ ] 知道 for update 是防同码两用的唯一手段
- [ ] 跑通了绑定六种情况（未绑定 / 绑定成功 / 码重复 / 码不存在 / 已绑定 / token 可用）
