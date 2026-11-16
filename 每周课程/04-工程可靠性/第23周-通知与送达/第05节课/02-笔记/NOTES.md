# 第 159 节课学习笔记

## 一、七个状态

```text
submitted  →
accepted   →
delivered  →
bounced    →
opened     →
complained →
failed     →
```

**哪些是终态：**

## 二、`delivered` 不等于"进收件箱"

**它只证明：**

**可能的结果：**

```text
① 
② 
③ 
```

**所以状态应该停在：**

## 三、转移规则

| from → to | 允许 | 为什么 |
|---|---|---|
| submitted → delivered | | |
| opened → delivered | | |
| delivered → bounced | | |
| bounced → delivered | | |
| submitted → submitted | | |

**12 条测试通过 ____ 条**

## 四、`delivered → bounced` 的时间线

```text
T1：
T2：
T3：
```

**如果不允许会怎样：**

## 五、事件流水

```sql
（贴 mail_event 建表语句）
```

**为什么 mail_log 之外还要 mail_event：**

## 六、webhook 签名

**为什么必须 `express.raw`：**

**签名不对返回什么状态码：**

**处理失败返回什么状态码，为什么：**

## 七、端到端验证

```text
发送后初始状态：____
webhook delivered 后：____
webhook opened 后：____
反向事件（delivered）：ok=____ reason=____
事件流水条数：____
```

## 八、查询接口

```text
GET /api/mail/:messageId      → 
GET /api/mail/by-email/:email → 
GET /api/mail/stats           → 
```

**"客户说没收到"的三步排查：**

```text
① 
② 
③ 
```

**五种可能结果：**

```text
data 为空     →
submitted     →
bounced       →
delivered     →
failed        →
```

## 九、状态分布

**我的实际数字（最近 7 天）：**

```text
total ____
delivered ____  ____%
submitted ____  ____%
bounced   ____  ____%
opened    ____  ____%
```

**覆盖率（delivered+bounced+opened / total）：**

**健康线是多少：**

## 十、webhook 伪造实验

```text
正确签名 → 
错误签名 → 
```

**如果没有签名验证会发生什么：**

## 十一、我遇到的卡点

## 十二、我是怎么解决的

## 十三、我还不懂的词

-

## 十四、完成检查

- [ ] 七状态 + 转移表
- [ ] 12 条测试全过
- [ ] delivered → bounced 允许
- [ ] 事件流水表
- [ ] webhook 签名（raw body）
- [ ] 轮询能跑
- [ ] 端到端四条验证
- [ ] 三个查询接口
- [ ] 三步排查流程
- [ ] 能用一句话说出"delivered 不等于进收件箱"
