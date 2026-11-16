# 第 55 节课学习笔记

## 一、五种重复提交

| # | 场景 | 谁的问题 | 后果 |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

哪几种占了 90% 的真实案例：

## 二、幂等的定义

```text
GET /api/items/1                    
PUT /api/items/1 {title:"x"}        
POST /api/orders {item:1}           
```

哪两个是幂等的，为什么：

## 三、漏洞版打穿

```text
（贴 3 条订单的输出）
```

用户被扣了：  本应被扣：

## 四、为什么"先查有没有相同订单"不可靠

三个并发请求的执行顺序：

这就是第 50 节的什么问题：

## 五、幂等键的表设计

| 字段 | 作用 | 不写会怎样 |
|---|---|---|
| key | | |
| user_id | | |
| endpoint | | |
| request_hash | | |
| status | | |
| response_code/body | | |

## 六、为什么要靠 `INSERT` 冲突，不靠"先查"

## 七、`status: processing` 什么时候会卡住

业务抛异常时会怎样：

我做的清理方案：

## 八、`res.json` 拦截

```javascript
const originalJson = res.json.bind(res);
res.json = (payload) => { ...; return originalJson(payload); };
```

为什么必须 `bind(res)`：

为什么必须在 `next()` 之前替换：

## 九、前端 key 存哪

| 存储 | 刷新后 | 跨标签页 | 适合吗 |
|---|---|---|---|
| 内存变量 | | | |
| sessionStorage | | | |
| localStorage | | | |

我选：  理由：

## 十、为什么 key 要"跟着用户意图"，不是"跟着请求"

错的写法：

后果：

## 十一、六个场景的预期

| # | 场景 | 预期状态 | 我的实际结果 |
|---|---|---|---|
| 1 | 漏洞版 3 并发 | | |
| 2 | 幂等版 3 并发 | | |
| 3 | 串行 2 次 | | |
| 4 | 同 key 不同 body | | |
| 5 | 没有 key | | |
| 6 | 同 key 不同用户 | | |

## 十二、串号实验

去掉 `user_id` 后，Bob 拿到：

为什么串号比重复扣款更严重：

## 十三、`request_hash` 不完整

只哈希 `itemName` 会怎样：

## 十四、我还不懂的词

- 

## 十五、完成检查

- [ ] 唯一索引含三个字段
- [ ] 靠 INSERT 冲突
- [ ] 检查 request_hash
- [ ] 拦截 res.json
- [ ] key 存 sessionStorage
- [ ] 六个场景全跑过
- [ ] 做过串号实验

## 十六、卡在哪

（必填）
