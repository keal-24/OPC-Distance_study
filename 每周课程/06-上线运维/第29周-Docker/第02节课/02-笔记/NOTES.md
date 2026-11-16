# 第 198 节课学习笔记

> 填空模板。**没有真实数字的笔记等于没写。** 下面每一处都要贴你自己机器上的输出。

---

## 一、我的项目副本

我复制过来的文件（打勾）：

- [ ] `package.json`
- [ ] `package-lock.json`
- [ ] 入口文件：`____________`
- [ ] `public/`
- [ ] `src/`
- [ ] `data/`
- [ ] `.env`

我的入口文件路径（相对项目根）：

我的应用监听端口：

`server.js` 里 `listen` 那一行原文：

```js

```

有没有把监听地址改成 `0.0.0.0`：

---

## 二、`.dockerignore`

我写的完整内容：

```text

```

我为什么排除 `node_modules`：

我为什么必须排除 `.env`：

build 时 `transferring context` 是多少 MB：

如果这个数字很大，我怀疑是：

---

## 三、第一个 Dockerfile（能跑就行版）

```dockerfile

```

`docker build` 花了多久：

`docker run -d -p 3000:3000` 之后，浏览器能不能打开：

---

## 四、分层与缓存

`docker history chat-app:1.0` 里，我自己写的指令是几层：

我改了一行 `server.js` 再 build，输出里哪些是 `CACHED`：

```text

```

哪些重新跑了：

```text

```

改顺序之后（`COPY package*.json` 在前）：

```text

```

两次 build 的耗时对比：

| 顺序 | 耗时 | `RUN npm ci` 是否 CACHED |
|---|---|---|
| `COPY . .` 在前 | | |
| `package*.json` 在前 | | |

---

## 五、正式版 Dockerfile

```dockerfile

```

逐条说明我为什么这么写（至少 4 条）：

1.
2.
3.
4.

`npm ci` 和 `npm install` 的区别（一句话）：

`--omit=dev` 省掉了什么：

`EXPOSE` 到底做了什么：

`CMD ["node", "server.js"]` 为什么用方括号：

---

## 六、镜像大小对比

```text
| 镜像 | 基础镜像 | 大小 |
|---|---|---|
| chat-app:1.0 | node:20 | |
| chat-app:2.0 | node:20-alpine | |
```

差了多少：

省下来的主要是什么：

---

## 七、七个错误

| 错误 | 报错原文关键词 | 我是怎么修的 |
|---|---|---|
| 没有 `.dockerignore`，`.env` 进镜像 | | |
| `COPY . .` 在前，缓存全废 | | |
| `COPY failed: file not found` | | |
| `Cannot find module` | | |
| `npm ci ... not in sync` | | |
| `invalid reference format` | | |
| 上下文选错，1.2GB | | |

---

## 八、`.env` 泄露验证

`docker run --rm 镜像 cat /app/.env` 我看到的输出（把 key 打码）：

```text

```

恢复 `.dockerignore` 之后再跑一次，输出是什么：

这说明什么：

---

## 九、我还不懂的词

- 
- 

---

## 十、我卡在哪（写真实内容）

卡在哪一步：

完整报错：

最后怎么解决的：

---

## 十一、完成检查

- [ ] 我有 `chat-app-docker/` 副本，里面有 lock 文件
- [ ] `.dockerignore` 里有 `node_modules` 和 `.env`
- [ ] 改代码后 build，`RUN npm ci` 是 `CACHED`
- [ ] 两个版本镜像大小不同，我能说出差在哪
- [ ] 我验证过 `.env` 没进镜像
- [ ] 容器跑起来浏览器能打开
