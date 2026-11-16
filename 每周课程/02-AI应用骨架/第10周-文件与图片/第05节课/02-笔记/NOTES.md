# 第 68 节课学习笔记

## 一、不做缩略图的代价

20 张原图（压缩后）的总传输：

4G 下加载时间：
弱网下：

做了缩略图后：

倍数：

## 二、为什么"前端缩放"不算数

```html
<img src="/api/files/1/raw" style="width:300px" />
```

三个问题：

1.
2.
3.

## 三、两种尺寸

| 尺寸 | maxSide | quality | 用途 |
|---|---|---|---|
| small | | | |
| medium | | | |

为什么只做两种：

## 四、命名可反推

```javascript
thumbKeyOf("abc.jpg", "small") = 
```

可反推带来四个好处：

1.
2.
3.
4.

## 五、`makeThumb` 为什么复用 `compressImage`

不复用会有什么风险：

## 六、失败时删半成品

```javascript
await fs.promises.unlink(outputPath).catch(() => {});
```

不删会怎样：

## 七、为什么缩略图生成在 `createFile` 之后

反过来（先生成再入库）的问题：

## 八、302 而不是 404

```javascript
return res.redirect(302, `/api/files/${file.id}/raw`);
```

为什么：

代价：

## 九、缓存时间

| 资源 | max-age |
|---|---|
| 原图 | |
| 缩略图 | |

为什么缩略图可以更长：

`private` 为什么必须：

## 十、传输量对比（实测）

| 方案 | 20 张总传输 |
|---|---|
| 原图 | |
| 缩略图 small | |

倍数：

## 十一、`rebuild-thumbs` 的两个参数

| 参数 | 作用 |
|---|---|
| `--apply` | |
| `--force` | |

什么时候用 `--force`：

为什么只处理 `kind='image'`：

## 十二、`removeThumbs` 为什么不需要数据库字段

## 十三、方案 A vs 方案 B

| | A（现在） | B（保留原图） |
|---|---|---|
| 磁盘 | | |
| 详情页质量 | | |
| 能下载原图 | | |

电商选哪个，社交选哪个：

## 十四、五个实验的现象

| 实验 | 现象 |
|---|---|
| 传输量对比 | |
| 删缩略图 302 | |
| force 重建 | |
| 竖拍方向 | |
| 第二次刷新 | |

## 十五、我不懂的词

- 

## 十六、完成检查

- [ ] `THUMB_SPECS` + `makeThumb`
- [ ] `thumbs.js` 四个函数
- [ ] 上传后生成 + 更新数据库
- [ ] 失败不影响上传
- [ ] `thumb` 接口有权属检查
- [ ] 302 降级
- [ ] 缓存 1 天
- [ ] `rebuild` dry-run + force
- [ ] 记录了传输量对比
- [ ] 竖拍方向正确

## 十七、卡在哪

（必填）
