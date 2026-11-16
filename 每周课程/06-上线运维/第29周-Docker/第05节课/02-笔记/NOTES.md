# 第 201 节课学习笔记

> 填空模板。**这一节的核心证据是"删之前"和"删之后"两条命令的输出。** 都贴上来。

---

## 一、数据是怎么消失的

我的数据文件在容器里的路径：

这条路径是代码里哪个常量决定的：

不挂载的时候，我写入的数据在：

`docker diff chat-app` 的输出：

```text

```

`docker rm` 删掉的是什么（用我自己的话说）：

---

## 二、rm 前 / rm 后 对比

**不挂载的情况：**

rm 之前 `cat`：

```text

```

rm 之后 `cat`：

```text

```

**挂 `chat-data` 卷的情况：**

rm 之前 `cat`：

```text

```

rm 之后（重新 run，挂同一个卷）`cat`：

```text

```

两次的结果说明什么：

---

## 三、volume 的四个命令

| 命令 | 我敲过吗 | 输出关键内容 |
|---|---|---|
| `docker volume ls` | | |
| `docker volume create` | | |
| `docker volume inspect` | | |
| `docker volume rm` | | |

`docker volume inspect chat-data` 里 `Mountpoint` 是什么：

这个路径我在 Windows 上能打开吗：

---

## 四、挂载详情

`docker inspect --format '{{json .Mounts}}' chat-app` 的输出：

```json

```

| 字段 | 我的值 | 意思 |
|---|---|---|
| `Type` | | |
| `Name` | | |
| `Source` | | |
| `Destination` | | |
| `RW` | | |

`Destination` 是不是 `/app/data`：

如果不是，说明：

---

## 五、bind mount

我的挂载命令：

```bash

```

`$(pwd)` 在我的终端里输出什么：

从宿主机改文件，容器能看到吗（贴命令和输出）：

从容器改文件，宿主机能看到吗：

为什么不需要"同步"：

---

## 六、`node_modules` 被盖掉

只写 `-v "$(pwd):/app"` 时，`docker logs` 的报错：

```text

```

`docker exec chat-app ls /app` 的输出：

```text

```

为什么镜像里的 `node_modules` 不见了：

`-v /app/node_modules` 这一行起了什么作用：

---

## 七、Windows 路径的坑

我的终端是（Git Bash / PowerShell / cmd）：

我有没有遇到路径被翻译（`Destination` 变成 `C:/Program Files/Git/...`）：

我是怎么修的：

| 写法 | 能用吗 | 备注 |
|---|---|---|
| `-v chat-data:/app/data` | | |
| `-v chat-data://app/data` | | |
| `MSYS_NO_PATHCONV=1 docker run ...` | | |
| `-v "$(pwd)/data:/app/data"` | | |

---

## 八、两种挂载的对比

| | volume | bind mount |
|---|---|---|
| 谁管理 | | |
| 文件在哪 | | |
| 能用 VS Code 打开吗 | | |
| 适合什么 | | |
| 生产环境用吗 | | |

我以后打算：数据用____，开发时代码用____。

---

## 九、备份与恢复

我的备份命令：

```bash

```

`tar tzf` 看到的内容：

```text

```

恢复命令：

```bash

```

恢复后 `cat` 的输出：

---

## 十、会删数据的三条命令

| 命令 | 删什么 | 我按错过吗 |
|---|---|---|
| `docker volume prune` | | |
| `docker compose down -v` | | |
| `docker volume rm` | | |

`docker system prune -a` 默认删卷吗：

---

## 十一、七个错误

| 错误 | 现象/报错 | 修法 |
|---|---|---|
| 不挂卷 | | |
| Git Bash 翻译路径 | | |
| 盖掉 `node_modules` | | |
| 卷名打错 | | |
| 权限 denied | | |
| `volume rm` 删不掉 | | |
| 路径带空格 | | |

---

## 十二、我还不懂的词

- 

---

## 十三、我卡在哪（写真实内容）

哪一步：

完整报错：

怎么解决：

---

## 十四、完成检查

- [ ] 我亲眼看到过数据随 `rm` 消失
- [ ] 我用卷让数据活过了 `rm`
- [ ] 我做过 bind mount 双向验证
- [ ] 我备份并恢复过一次
- [ ] 我知道 `Destination` 该是 `/app/data`
- [ ] 我知道哪三条命令会删数据
