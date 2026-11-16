# 第 59 节课学习笔记

## 一、条件不存 URL 的痛点

三个具体场景：

1.
2.
3.

存进 URL 后的四个好处：

1.
2.
3.
4.

## 二、URL 里放什么

| 参数 | 含义 | 默认值 |
|---|---|---|
| q | | |
| role | | |
| status | | |
| page | | |

空值要不要写进 URL：

## 三、条件用数组拼

```javascript
const conditions = [];
const params = [];

conditions.push("deleted_at IS NULL");
conditions.push("role = ?");
params.push(role);
```

为什么不用字符串拼（两个问题）：

1.
2.

## 四、`escapeLike`

不转义 `%` 会怎样：

不转义 `_` 会怎样：

转义后的 SQL：

## 五、五种 curl 测试的结果

| # | 命令 | 结果 |
|---|---|---|
| 1 | 不带参数 | |
| 2 | `q=alice` | |
| 3 | `role=admin` | |
| 4 | `q=%25` | |
| 5 | `q=' OR 1=1--` | |

第 4 和第 5 说明什么：

## 六、`applied` 字段

作用：

不回写控件会发生什么：

## 七、`pushState` vs `replaceState`

| 操作 | 用哪个 | 为什么 |
|---|---|---|
| 搜索框输入 | | |
| 下拉筛选 | | |
| 翻页 | | |

全用 `replaceState` 会怎样：

## 八、防抖

不防抖时输入 `alice` 发几个请求：

防抖 350ms 后：

350ms 这个数字怎么来的：

## 九、回车立即搜

```javascript
if (event.key === "Enter") { ... }
```

为什么不用 `keyCode === 13`：

## 十、`popstate`

不加这个监听，用户点后退会：

## 十一、空状态两种文案

| 情况 | 文案 | 为什么 |
|---|---|---|
| 没筛选且空 | | |
| 有筛选且空 | | |

## 十二、竞态

什么叫竞态：

不加请求序号，可能出现：

## 十三、`ESCAPE '\'` 的反斜杠

```javascript
// JS 源码
"(email LIKE ? ESCAPE '\\')"
```

实际发给 SQLite 的是几个反斜杠：

写错会报什么错：

## 十四、搜索高亮

```javascript
const highlight = (text, keyword) => {
  const safeText = esc(text);
  ...
};
```

为什么必须先 `esc` 再高亮：

反过来会怎样：

## 十五、五个实验的现象

| 实验 | 现象 |
|---|---|
| 去掉防抖 | |
| 去掉 escapeLike | |
| 改 URL 为 role=hacker | |
| 改 URL 为 q=zzzzz | |
| 改存 sessionStorage | |

## 十六、我还不懂的词

- 

## 十七、完成检查

- [ ] 后端支持三个筛选
- [ ] `escapeLike` 生效（`%` 返回 0 条）
- [ ] 白名单校验
- [ ] 前端防抖 350ms
- [ ] URL 带参数
- [ ] F5 刷新不丢
- [ ] 后退能用
- [ ] 空状态分两种

## 十八、卡在哪

（必填）
