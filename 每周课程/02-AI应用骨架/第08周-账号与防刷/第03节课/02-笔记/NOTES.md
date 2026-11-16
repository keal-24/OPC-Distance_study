# 第 52 节课学习笔记

## 一、四种存储位置的取舍

| 方式 | XSS 能偷 | 自动发送 | 主要问题 |
|---|---|---|---|
| localStorage 存 token | | | |
| 服务端 session | | | |
| JWT + HttpOnly Cookie | | | |
| JWT + localStorage | | | |

我选的技术：

## 二、JWT 三段

```text
eyJhbGci...J9.eyJ1aWQiOjF9.abc123
└─ header ─┘└─ payload ─┘└─ sign ─┘
```

| 段 | 内容 | 加密了吗 |
|---|---|---|
| header | | |
| payload | | |
| signature | | |

**一句话结论：**

## 三、我的 token 解码后的 payload

```json
（贴你的）
```

| 字段 | 值 | 敏感吗 | 为什么放/不放 |
|---|---|---|---|
| uid | | | |
| role | | | |
| ver | | | |
| iat | | | |
| exp | | | |

## 四、不能放进 payload 的四类

1.
2.
3.
4.

为什么"会变的"不能放：

## 五、Cookie 四个属性

| 属性 | 值 | 防什么 | 设错会怎样 |
|---|---|---|---|
| httpOnly | | | |
| sameSite | | | |
| secure | | | |
| maxAge | | | |

## 六、`sameSite` 三个值

| 值 | 跨站 GET | 跨站 POST | 适用场景 |
|---|---|---|---|
| strict | | | |
| lax | | | |
| none | | | |

`lax` 挡住了什么，没挡住什么：

## 七、`ver` 版本比对

不检查 `ver` 会怎样：

代价是什么：

## 八、`DUMMY_HASH` 消除时间差

不做的后果：

为什么 `prehashIfNeeded` 也要一起用：

## 九、`credentials: "same-origin"`

不加会怎样：

`same-origin` 和 `include` 的区别：

## 十、登出

```javascript
// 错的
window.location.href = "/login.html";

// 对的
await fetch("/api/logout", { method: "POST" });
```

为什么第一种是错的：

## 十一、五个实验的现象

| 实验 | 现象 |
|---|---|
| httpOnly=false | |
| sameSite=none 无 secure | |
| 改密码不递增 ver | |
| 改 Cookie 一个字符 | |
| 改 payload 的 role | |

## 十二、`exp` 和 `maxAge` 不一致

Cookie 7 天 / JWT 1 小时，用户体验是：

Cookie 1 小时 / JWT 7 天，安全问题是：

## 十三、我还不懂的词

- 

## 十四、完成检查

- [ ] `auth.js` 四个函数齐
- [ ] payload 只有 6 个字段
- [ ] Cookie 四个属性齐
- [ ] 401 都清 Cookie
- [ ] 前端有 credentials
- [ ] 登出清 Cookie
- [ ] 改密码能踢人

## 十五、卡在哪

（必填）
