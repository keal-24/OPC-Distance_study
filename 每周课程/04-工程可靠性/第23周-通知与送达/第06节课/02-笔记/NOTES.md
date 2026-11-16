# 第 160 节课学习笔记

## 一、三条记录的分工

| 记录 | 位置 | 证明什么 | 谁验 |
|---|---|---|---|
| SPF | | | |
| DKIM | | | |
| DMARC | | | |

**缺了会怎样：**

```text
没有 SPF  →
没有 DKIM →
没有 DMARC →
```

## 二、SPF

**格式：**

```text
v=spf1 ____ ____ ____
```

**四种 all 限定符：**

| 写法 | 含义 | 效果 |
|---|---|---|
| -all | | |
| ~all | | |
| ?all | | |
| +all | | |

**三个限制：**

```text
① 只能有 ____ 条 SPF
② DNS 查询上限 ____ 次
③ 记录长度上限 ____ 字符
```

**我的 SPF 记录：**

```text
```

**check-dns.js 的结果：**

```json
```

## 三、DKIM

**原理五步：**

```text
① 
② 
③ 
④ 
⑤ 
```

**我的 selector 是什么：**

**keyLen（公钥长度）是多少：**

**为什么 DKIM 比 SPF 更重要（对齐的概念）：**

```text
From: ____
MAIL FROM: ____
→ SPF 通过但与 From ____ → DMARC ____
→ 只有 DKIM 能与 From ____
```

## 四、DMARC

**格式：**

```text
v=DMARC1; p=____; rua=____; pct=____; adkim=____; aspf=____
```

**四种策略：**

```text
p=none       →
p=quarantine →
p=reject     →
pct=n        →
```

**三步上线：**

```text
阶段一（第 __ 周）：p=____
阶段二（第 __ 周）：p=____ pct=____
阶段三（第 __ 周）：p=____ pct=____
阶段四（第 __ 周）：p=____
```

**为什么不能一上来就 reject：**

**我的 DMARC 记录：**

```text
```

## 五、对齐（alignment）

**宽松 r 和严格 s 的区别：**

```text
宽松：____ 与 ____ 算对齐
严格：____
```

**为什么推荐宽松：**

## 六、DMARC 报告

**报告格式是什么：**

**要读哪几个字段：**

```text
source_ip     →
count         →
dkim / spf    →
header_from   →
```

**报告的唯一价值是什么：**

## 七、验证脚本

**check-dns.js 的输出（三个域名对照）：**

```text
example.com:

gmail.com:

qq.com:
```

**哪个域名最值得学：**

## 八、Gmail 原始头

**我发的测试邮件里 Authentication-Results 是：**

```text
```

**三项都是 pass 吗：**

## 九、域名信誉

**新域名要多久积累信誉：**

**要控制哪两个率：**

```text
退信率 < ____%
投诉率 < ____%
```

**每天的安全发信量：**

```text
第 1 周：____
第 2 周：____
第 3 周：____
```

## 十、常见配置错误

```text
① 两条 SPF 记录  →
② 一上来 p=reject →
③ 没配 rua        →
④ 没有 DKIM       →
```

## 十一、我遇到的卡点

## 十二、我是怎么解决的

## 十三、我还不懂的词

-

## 十四、完成检查

- [ ] SPF 只有一条，有 -all
- [ ] DKIM 公钥 > 300 字符
- [ ] DMARC 有 p 和 rua
- [ ] 知道三步上线
- [ ] check-dns.js 三条全绿
- [ ] 跑过 example/gmail/qq 对照
- [ ] Gmail 原始头三项 pass
- [ ] DNS-SETUP.md 写完
- [ ] 知道信誉要 2–4 周
- [ ] 能用一句话说出"三条是入门，信誉才是门槛"
