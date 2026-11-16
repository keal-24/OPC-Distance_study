# 第 19 节课学习笔记

## 一、三种存储层次

| 层次 | 重启后还在吗 | 适合什么 |
|---|---|---|
| 内存变量 | | |
| JSON 文件 | | |
| 数据库 | | |

## 二、`fs/promises` 四个操作

```javascript
// 写
await fs.writeFile(路径, ____, "utf8");

// 读
const text = await fs.readFile(路径, ____);

// 解析成对象
const data = ____(text);

// 删
await fs.____(路径);
```

`writeFile` 的第二个参数必须是什么类型：

`readFile` 不传 `"utf8"` 会得到什么：

## 三、`ENOENT` 是什么

全称：

正确处理方式：

为什么不能把所有错误都吞掉：

## 四、`fs.mkdir` 的 `recursive: true` 解决了什么

## 五、为什么要 `nextId` 而不是 `items.length + 1`

举例说明：

## 六、`findIndex` 找不到返回什么

如果不判断会怎样：

## 七、`async` 路由为什么必须 `try/catch`

不写会怎样：

`next(error)` 的作用：

## 八、204 状态码

意思：

前端拿到 204 应该怎么处理：

对 204 调 `.json()` 会报什么：

## 九、`dataset` 和 `closest`

```javascript
delBtn.dataset.id = String(item.id);   // 对应 HTML 的什么属性
event.target.closest(".del-btn")       // 为什么不直接用 event.target
```

## 十、我的并发测试结果

代码发了几条：

实际存了几条：

丢了多少：

`nextId` 变成了多少：

原因：

## 十一、JSON 文件当数据库的四条局限

1.
2.
3.
4.

## 十二、六个错误的后果

| 错误 | 报错或现象 | 怎么查 |
|---|---|---|
| writeFile 传对象 | | |
| readFile 不传编码 | | |
| 不 mkdir | | |
| async 不 try/catch | | |
| findIndex 不判 -1 | | |
| 对 204 调 json | | |

## 十三、我还不懂的词

- 

## 十四、完成检查

- [ ] 数据能存到 `data/messages.json`
- [ ] 重启服务器后数据还在
- [ ] 我手动改文件，页面能看到改动
- [ ] 删除接口能用，且不存在的 id 返回 404
- [ ] `async` 路由都包了 `try/catch`
- [ ] 我做过并发测试，看到数据丢失
- [ ] 我做过 JSON 损坏测试
- [ ] 我能说出 JSON 文件当数据库的四条局限
