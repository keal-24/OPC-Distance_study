# 第 192 节课学习笔记

## 一、五个网页没有的差异

| | 网页 | 小程序 |
|---|---|---|
| HTTP 库 | | |
| Cookie | | |
| 默认超时 | | |
| 并发上限 | | |
| 上传 | | |

最关键的是哪一条，为什么：

## 二、双凭证

`extractToken` 的顺序：

为什么先看 header：

401 的三个 `code` 分别代表什么：

| code | 含义 | 客户端该做什么 |
|---|---|---|
| TOKEN_EXPIRED | | |
| TOKEN_INVALID | | |
| USER_GONE | | |

## 三、游标分页

为什么不用 `OFFSET`：

"多查一条"怎么判断 `hasMore`：

游标为什么要 base64：

排序键为什么要 `(created_at, id)` 两个字段：

## 四、`onReachBottom`

它会连续触发吗，为什么会：

不防会出什么现象：

`onReachBottomDistance` 设多少合适，为什么：

## 五、`onPullDownRefresh`

要在哪开：

`backgroundTextStyle` 是干什么的：

## 六、`setData` 异步

```js
this.setData({ ... });
this.updateTotal();     // 读到的是什么值？
```

这会导致什么现象：

正确写法：

## 七、`type="number"` vs `type="digit"`

| | number | digit |
|---|---|---|
| 能输整数吗 | | |
| 能输小数点吗 | | |
| 用在哪个字段 | | |

## 八、`picker`

为什么不能用 `<input type="date">`：

正确写法：

## 九、`wx.uploadFile`

`res.data` 是什么类型：

不 `JSON.parse` 会怎样：

`name` 要和什么对上：

`sizeType` 的 `compressed` 和 `original` 分别适合什么：

## 十、五个墙

| 墙 | 现象 | 原因 |
|---|---|---|
| 删 Authorization | | |
| 删 loadingMore | | |
| 删 setData 回调 | | |
| 用 type="number" | | |
| 不 JSON.parse | | |

## 十一、我踩的坑

报错原文：

原因：

怎么修的：

## 十二、我还不懂的词

- 

## 十三、完成检查

- [ ] Bearer 和 Cookie 两种都能通
- [ ] 滚到底自动加载，且不重复
- [ ] 总金额实时准确
- [ ] 上传后图片能显示
- [ ] 五个墙都撞过
