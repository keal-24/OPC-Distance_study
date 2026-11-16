# 第 64 节课学习笔记

## 一、multipart 请求体的结构

```text
（贴你造出来的前 300 字节，用 ↵ 表示 \r\n）
```

三段分别是什么：

1.
2.
3.

## 二、边界字符串

请求头里声明的：

```text
boundary=____________
```

请求体里的分隔符：

```text
____________
```

两者差在哪：

结束标记：

## 三、为什么需要边界

如果不用边界，怎么区分"文件内容"和"下一段"：

为什么边界必须是随机的：

## 四、为什么不能一次读完整个 body

三个后果：

1.
2.
3.

## 五、`Content-Disposition` 里有什么

```text
Content-Disposition: form-data; name="file"; filename="photo.jpg"
```

| 部分 | 意思 |
|---|---|
| form-data | |
| name | |
| filename | |

`filename` 不存在时，这段是什么：

## 六、内容末尾的 `\r\n`

```javascript
if (body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) {
  contentEnd -= 2;
}
```

不去掉会怎样：

我怎么验证这一点的（三个验证点里的哪一个）：

## 七、`latin1` vs `utf8`

分隔符用哪个，为什么：

文本值用哪个，为什么：

## 八、`parsePartHeaders` 用 `split("\r\n")` 不用 `"\n"`

用 `"\n"` 会怎样：

这和课里哪一节是同一类坑：

## 九、文件名解码的三种情况

| 情况 | 例子 | 怎么处理 |
|---|---|---|
| 明文 | | |
| RFC 2047 | | |
| 百分号 | | |

`decodeURIComponent("100%.jpg")` 会怎样：

所以要：

## 十、lite 版和 busboy 版的内存对比

| 版本 | 12MB 文件的内存增量 |
|---|---|
| lite | |
| busboy | |

为什么差这么多：

## 十一、`limits.fileSize` 的行为

超过限制时它做了什么：

它会不会自动报错：

所以我必须在哪两个地方处理：

1.
2.

## 十二、`pending` 的 `await`

```javascript
busboy.on("finish", async () => {
  await Promise.all(pending);
});
```

不 await 会怎样：

为什么这个 bug 在小文件上看不出来：

## 十三、`.tmp/` 的价值

直接写 `originals/` 的问题：

先写 `.tmp/` 再 `rename` 的好处：

`rename` 是原子操作吗：

## 十四、`.tmp` 有残留说明什么

## 十五、五个实验的现象

| 实验 | 现象 |
|---|---|
| lite vs busboy | |
| 手动设 Content-Type | |
| 25MB 文件 | |
| 中文文件名 | |
| 6 个文件 | |

## 十六、我不懂的词

- 

## 十七、完成检查

- [ ] lite 版三个验证点都过
- [ ] busboy 流式能用
- [ ] `.tmp` → `originals` 的 rename
- [ ] `pending` 有 await
- [ ] 413 生效
- [ ] 失败清理临时文件
- [ ] `uploads/` 在 gitignore
- [ ] `/uploads/xxx` 返回 404
- [ ] 中文名正确

## 十八、卡在哪

（必填）
