# 第 155 节课学习笔记

## 一、邮件原文的结构

```text
（贴假 SMTP 收到的头部前 20 行）
```

**哪一行是"收件方加的"，哪一行是"你发的"：**

## 二、三个概念

```text
发送（submit） → 
投递（deliver）→ 
送达（delivered）→ 
```

**你的代码控制哪一步：**

## 三、假 SMTP

```text
监听端口 ____
存档目录 ____
收到第一封邮件时的大小 ____ 字节
```

**为什么端口用 2525 而不是 25：**

**为什么存成 .eml 而不是打印到控制台：**

## 四、五个头部

| 头部 | 值（我的实际） | 作用 |
|---|---|---|
| Subject | | |
| Message-ID | | |
| Content-Type | | |
| Content-Transfer-Encoding | | |
| MIME-Version | | |

**`=?UTF-8?B?...?=` 解码后是什么：**

## 五、multipart/alternative

**加了 HTML 后 Content-Type 变成：**

**为什么 text 和 html 都要给：**

**为什么"两个版本内容要一致"：**

## 六、你的邮件缺什么

```bash
grep -i "authentication-results\|dkim-signature\|received-spf" maildump/*.eml
```

**结果：**

**这三种头部各由谁添加：**

**缺了会怎样（真发给 Gmail）：**

## 七、退信测试

```text
发给 bounce-test@ 的返回：
  ok: ____
  code: ____
  responseCode: ____
```

**为什么要靠 responseCode 区分：**

## 八、mail_log 表

```sql
（贴你的建表语句）
```

**三个必须有的字段和它们的用途：**

```text
message_id → 
status     → 
created_at → 
```

## 九、一封邮件多大

```text
纯文本 ____ 字节
带 HTML ____ 字节
```

**每天 1000 封 = ____ MB/天**

## 十、我遇到的卡点

## 十一、我是怎么解决的

## 十二、我还不懂的词

-

## 十三、完成检查

- [ ] 假 SMTP 能收邮件并存 .eml
- [ ] 能发到 bounce- 得到 550
- [ ] mailer.js 返回 messageId
- [ ] dump-mail.js 能解析
- [ ] 看到 Subject 是 RFC2047 编码
- [ ] 加了 HTML 变成 multipart/alternative
- [ ] 确认自己的邮件没有 DKIM/Auth-Results
- [ ] mail_log 表 + 两个索引
- [ ] 日志里邮箱脱敏
- [ ] 能用一句话说出"Auth-Results 只出现在收到的邮件里"
