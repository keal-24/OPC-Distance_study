# 第 66 节课学习笔记

## 一、三种方案对比

| 方案 | 优点 | 缺点 |
|---|---|---|
| 只放磁盘 | | |
| 只放数据库 | | |
| 磁盘 + 元信息 | | |

## 二、`files` 表的 14 个字段

| 字段 | 为什么需要 |
|---|---|
| id | |
| user_id | |
| storage_key | |
| original_name | |
| mime | |
| kind | |
| size | |
| width / height | |
| thumb_small / thumb_medium | |
| sha256 | |
| ref_count | |
| deleted_at | |
| created_at | |

`storage_key` 为什么必须 UNIQUE：

## 三、两种不一致

| 情况 | 名字 | 后果 | 严重吗 |
|---|---|---|---|
| 磁盘有、库没有 | | | |
| 库有、磁盘没有 | | | |

为什么"先库后盘"：

## 四、上传的完整顺序

```text
① 接收 → .tmp/
② 校验
③ 搬到 originals/
④ 写数据库
⑤ 数据库失败 → 回滚③
```

第 ⑤ 步不做会怎样：

## 五、读接口的四个响应头

```javascript
res.setHeader("Content-Type", file.mime);
res.setHeader("Content-Disposition", ...);
res.setHeader("Cache-Control", ...);
res.setHeader("X-Content-Type-Options", ...);
```

逐个说作用：

| 头 | 作用 | 不设的后果 |
|---|---|---|
| Content-Type | | |
| Content-Disposition | | |
| Cache-Control | | |
| X-Content-Type-Options | | |

`nosniff` 防的是什么攻击：

## 六、`filename*=UTF-8''`

为什么不用 `filename="中文.jpg"`：

格式拆解：

```text
inline; filename*=UTF-8''%E4%B8%AD%E6%96%87.jpg
```

## 七、越权访问

Bob 访问 Alice 的文件，应该返回：

为什么不返回 403：

## 八、`clean-orphans.js`

默认 dry-run，加什么参数才真删：

为什么要这样设计：

死记录的处理是软删除还是物理删，为什么：

## 九、21 张原图的总传输量

我 F12 里看到的：

这会带来什么问题（第 68 节要解决）：

## 十、`Cache-Control: public` 的风险

本地为什么测不出来：

真实环境里会怎样：

## 十一、五个实验的现象

| 实验 | 现象 |
|---|---|
| 数据库写入失败 | |
| 去掉回滚 | |
| 手删磁盘文件 | |
| 越权访问 | |
| public 缓存 | |

## 十二、我不懂的词

- 

## 十三、完成检查

- [ ] `files` 表 + 三索引
- [ ] `files.js` 四个函数
- [ ] 上传时"磁盘→数据库"
- [ ] 失败回滚磁盘
- [ ] 读接口归属检查
- [ ] 四个响应头
- [ ] 列表页能显示
- [ ] 孤儿脚本 dry-run
- [ ] 记录了原图传输量

## 十四、卡在哪

（必填）
