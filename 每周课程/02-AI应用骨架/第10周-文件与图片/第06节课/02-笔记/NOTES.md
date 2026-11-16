# 第 69 节课学习笔记

## 一、浏览器决定"显示还是下载"

看哪个响应头：

| 值 | 行为 |
|---|---|
| inline | |
| attachment | |

## 二、PDF 不显示的三个原因

1.
2.
3.

## 三、为什么 PDF 需要 Range

小图片不需要的原因：

大 PDF 需要的理由：

没有 Range 的症状：

## 四、三个 curl 测试

### 不带 Range

```text
（贴状态码 + 关键头）
```

### bytes=0-99

```text
（贴）
```

### bytes=-100

```text
（贴）
```

## 五、`Content-Range` 的格式

```text
bytes 0-99/20971520
```

| 部分 | 意思 |
|---|---|
| bytes | |
| 0-99 | |
| 20971520 | |

`99` 是包含还是不包含：

`Content-Length` 应该是多少（0-99）：

## 六、`Accept-Ranges`

为什么不管有没有 Range 都要发：

## 七、`HEAD` 请求

不单独处理会怎样：

## 八、非法 Range 的处理

RFC 严格做法是返回：

我选的做法：

为什么（三条）：

1.
2.
3.

## 九、`fs.createReadStream({start, end})`

`end` 是包含的吗：

所以 `chunkSize = `：

## 十、三种限频…（这一节没有，跳过）

## 十一、`<iframe>` 方案的局限

做不了的三个功能：

1.
2.
3.

什么时候必须上 PDF.js：

## 十二、`view.html` 的功能清单

- [ ]
- [ ]
- [ ]
- [ ]

为什么"切换图片"用重新加载而不是无刷新：

## 十三、为什么先 `api()` 再设 `img.src`

反过来的问题：

## 十四、五个实验的现象

| 实验 | 现象 |
|---|---|
| 去掉 Range | |
| Content-Range 少一字节 | |
| attachment | |
| 缩放边界 | |
| 左右切换 | |

## 十五、我不懂的词

- 

## 十六、完成检查

- [ ] `range.js` 两个函数
- [ ] 三种 Range 格式都支持
- [ ] 206 + Content-Range + Content-Length
- [ ] Accept-Ranges 一直发
- [ ] HEAD 不 pipe
- [ ] `?download=1` 能用
- [ ] 单文件详情接口
- [ ] `view.html` 能用
- [ ] 大 PDF 能打开
- [ ] 中文下载名正确

## 十七、卡在哪

（必填）
