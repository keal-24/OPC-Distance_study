# 第 200 节课学习笔记

> 填空模板。**这一节的重点是"证据"。** 每条验证命令都要贴真实输出，尤其是"搜到"和"搜不到"两种。

---

## 一、我的 key 现在在哪

`grep -rn "sk-" .` 的结果：

```text

```

我的 `server.js` 里有没有硬编码：

如果有，改成了什么：

我的 `.env` 里有哪些键（值打码）：

```text

```

哪些是机密，哪些不是：

| 变量 | 机密？ | 为什么 |
|---|---|---|
| | | |
| | | |

---

## 二、`dotenv` 在容器里还有用吗

`grep -n dotenv server.js` 的输出：

容器里没有 `.env` 文件时，`dotenv.config()` 会怎样：

为什么"本地能读、容器里读不到"：

---

## 三、三条注入通道

| 方式 | 我试过吗 | 变量在容器里能看到吗 |
|---|---|---|
| `-e KEY=value` | | |
| `--env-file .env` | | |
| Dockerfile `ENV` | | |

优先级实验：

```text
Dockerfile ENV PORT=3000，.env 里 PORT=4000，-e PORT=5000
容器里 echo $PORT 输出：____
```

`docker exec chat-app env` 里我看到的变量（打码）：

```text

```

---

## 四、验证镜像里没有 key

方法一 `ls -a /app` 的输出：

```text

```

方法二全文搜索的输出：

```text
我用的命令：

输出：
```

方法三 `docker history --no-trunc` 里我写的那几层：

```text

```

这三条能证明什么：

不能证明什么：

---

## 五、可见性边界

`docker inspect --format '{{json .Config.Env}}'` 能看到 key 吗：

```text
（贴一段，key 打码）
```

`docker exec chat-app env | grep OPENAI` 的输出：

`/proc/1/environ` 能读到吗：

所以"用环境变量"到底防住了什么、没防住什么：

| 场景 | key 在镜像里 | key 用环境变量 |
|---|---|---|
| 镜像推到公开仓库 | | |
| 客户拿到镜像文件 | | |
| 同事 `docker exec` 进容器 | | |

---

## 六、`.env` 的坑

我的 `.env` 换行符是（CRLF / LF），怎么查的：

`od -c` 的输出：

我的 `.env` 里有没有引号：

加了引号之后，值的末尾是什么：

`--env-file` 用的路径是"我电脑上的"还是"容器里的"：

怎么证明：

---

## 七、`NODE_ENV`

我的 Dockerfile 里有没有 `ENV NODE_ENV=production`：

加了之后，`docker exec chat-app env` 里能看到吗：

`npm ci --omit=dev` 之后，`node_modules` 里少了哪些包：

有没有因为我漏了运行时依赖而报 `Cannot find module`：

---

## 八、fail fast

我加的检查代码：

```js

```

不带 `--env-file` 跑，输出：

```text

```

退出码：

```text

```

如果不加这个检查，这个 bug 会在什么时候被发现：

---

## 九、七个错误

| 错误 | 报错原文关键词 | 修法 |
|---|---|---|
| `.env` 进镜像 | | |
| 忘 `--env-file` | | |
| 引号被保留 | | |
| CRLF | | |
| `--build-arg` 传 key | | |
| `-e` 值有空格 | | |
| 变量名拼错 | | |

---

## 十、我的变量清单

| 变量 | 必填 | 说明 | 默认值 |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

---

## 十一、我还不懂的词

- 

---

## 十二、我卡在哪（写真实内容）

哪一步：

完整报错：

怎么解决：

---

## 十三、完成检查

- [ ] key 不在代码里，不在镜像里，不在 Git 里
- [ ] 我用 `grep` 验证过镜像里搜不到
- [ ] 我的 `.env` 是 LF
- [ ] 缺变量时容器会 `Exited (1)`
- [ ] 我知道 `docker inspect` 能看到 key
