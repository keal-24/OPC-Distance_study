# 第 51 节课学习笔记

## 一、三个词的分界

| 词 | 能否还原 | 需要密钥 | 例子 | 用途 |
|---|---|---|---|---|
| 编码 | | | | |
| 加密 | | | | |
| 哈希 | | | | |

判断标准一句话：

## 二、Base64 不是加密

```javascript
Buffer.from('{"password":"123456"}').toString('base64') = 
```

两行就能还原，所以：

## 三、bcrypt 哈希的解剖

```text
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
```

| 部分 | 内容 | 长度 |
|---|---|---|
| `$2a$` | | |
| `10` | | |
| 盐 | | |
| 哈希值 | | |

为什么同一个密码两次哈希不同：

## 四、bcrypt 轮数实测

| 轮数 | 计算次数 | 中位耗时 |
|---|---|---|
| 4 | | |
| 6 | | |
| 8 | | |
| 10 | | |
| 12 | | |
| 14 | | |

我选的轮数：  理由：

## 五、SHA-256 vs bcrypt

```text
SHA-256 单核：___ 次/秒
bcrypt  单核：___ 次/秒
慢 ___ 倍
```

100 万个候选密码：

| 算法 | 耗时 |
|---|---|
| SHA-256 | |
| bcrypt | |

为什么不能"SHA-256 + 盐"就完事：

## 六、72 字节限制

```javascript
const a = "a".repeat(72) + "X";
const b = "a".repeat(72) + "Y";
await bcrypt.compare(b, await bcrypt.hash(a, 10))  // 
```

为什么是 true：

`"密码".length` 和 `Buffer.byteLength("密码","utf8")` 各是多少：

## 七、为什么不强制"大小写数字符号"

NIST 的建议是什么：

组合规则会让人怎么变形：

举一个"不满足组合规则但很安全"的密码：

## 八、`errors` 和 `warnings` 分开的意义

## 九、`score` 为什么只用来显示，不用来拦截

## 十、重置流程

```text
① 
② 
③ 
④ 
⑤ 
⑥ 
⑦ 
```

## 十一、重置 token 为什么存哈希

为什么这里用 SHA-256 而不是 bcrypt：

## 十二、`token_version` 解决什么问题

场景：

如果改密码后不递增会怎样：

## 十三、计时攻击

两种写法的响应时间：

```javascript
// A
if (!user) return res.status(401).json({ error: "邮箱或密码错误" });

// B
const match = await bcrypt.compare(password, user.password_hash);
if (!match) return res.status(401).json({ error: "邮箱或密码错误" });
```

A 用 ___ ms，B 用 ___ ms，攻击者能推出什么：

修法：

## 十四、`prehashIfNeeded` 的 `sha256:` 前缀

## 十五、五个实验的现象

| 实验 | 现象 |
|---|---|
| rounds=4 | |
| 改用 SHA-256 | |
| token 用两次 | |
| 100 字节密码 | |

## 十六、我还不懂的词

- 

## 十七、完成检查

- [ ] `password.js` 四个导出齐
- [ ] 跑过六档轮数
- [ ] 跑过 crack 对比
- [ ] 走过一遍重置流程
- [ ] 知道 72 字节是什么单位
- [ ] 知道计时攻击怎么修

## 十八、卡在哪

（必填）
