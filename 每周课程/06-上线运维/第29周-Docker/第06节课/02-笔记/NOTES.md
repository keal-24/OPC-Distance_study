# 第 202 节课学习笔记

> 填空模板。**这一节有三个"经典报错"，一定要抄原文。** 它们是你以后最快的定位线索。

---

## 一、两个容器为什么连不上

我先起的两个容器分别在什么网络里：

```text

```

`docker network ls` 的输出：

```text

```

我用 `localhost` 连数据库时的报错原文：

```text

```

`errno` 和 `code` 分别是什么：

我用容器 IP 连的时候通了吗：

那个 IP 是多少：

为什么不能把 IP 写进配置：

我用容器名连（默认 bridge）时的报错原文：

```text

```

`ENOTFOUND` 和 `ECONNREFUSED` 的区别：

---

## 二、自定义网络

我建的网叫什么：

`docker network inspect` 里看到的容器：

```text

```

在 app 里解析 `pg` / `postgres` 的结果：

```text

```

`/etc/resolv.conf` 里的 nameserver 是什么：

为什么这个地址（`127.0.0.11`）能解析容器名：

`ping` 测试结果（或 `node -e` 的结果）：

---

## 三、我的 `compose.yaml`

```yaml

```

逐块说明：

| 块 | 我写了什么 | 为什么 |
|---|---|---|
| `services.postgres.image` | | |
| `services.postgres.volumes` | | |
| `services.postgres.healthcheck` | | |
| `services.app.build` | | |
| `services.app.ports` | | |
| `services.app.depends_on` | | |
| `volumes` | | |

`docker compose config` 里我看到的 `DATABASE_URL`（密码打码）：

```text

```

为什么 `ports` 要加引号：

为什么要写 `healthcheck` 而不是只写 `depends_on`：

---

## 四、健康检查

`docker compose ps` 里 `(healthy)` 出现在哪个服务上：

```text

```

从 `up` 到 app 启动，等了多久：

`pg_isready` 返回 0 / 1 分别代表什么：

`start_period` 是干什么的：

如果我把 healthcheck 删掉，`up` 之后 app 会怎样（我观察到）：

```text

```

---

## 五、`depends_on` 的两种写法

```text
短语法：
长语法：
```

区别（一句话）：

`condition` 的三个值：

- `service_started`：
- `service_healthy`：
- `service_completed_successfully`：

---

## 六、常用命令

| 命令 | 我敲过吗 | 它做了什么 |
|---|---|---|
| `docker compose up -d` | | |
| `docker compose up -d --build` | | |
| `docker compose ps` | | |
| `docker compose logs -f app` | | |
| `docker compose exec app sh` | | |
| `docker compose down` | | |
| `docker compose down -v` | | |
| `docker compose config` | | |

`up -d` 和 `docker start` 的区别：

`down` 和 `down -v` 的区别：

---

## 七、两个 `.env`

| | compose 的 `.env` | 应用的 `.env` |
|---|---|---|
| 谁读 | | |
| 什么时候读 | | |
| 会不会进容器 | | |

`env_file` 里的路径是相对谁的：

我用 `${POSTGRES_PASSWORD}` 但没配的时候，`compose config` 显示什么：

---

## 八、七个错误

| 错误 | 报错原文关键词 | 修法 |
|---|---|---|
| 用 `localhost` | | |
| 服务名拼错 | | |
| 没设密码 | | |
| 端口冲突 | | |
| yaml 缩进 | | |
| `docker-compose` | | |
| `version` 字段 | | |

---

## 九、我的网络图

（画在下面，用文字或 ASCII）

```text

```

---

## 十、我还不懂的词

- 

---

## 十一、我卡在哪（写真实内容）

哪一步：

完整报错：

怎么解决：

---

## 十二、完成检查

- [ ] 我知道容器里 `localhost` 是它自己
- [ ] 我验证过自定义网络能按名字解析
- [ ] 我的 compose 文件能 `up -d` 成功
- [ ] 我看到过 `(healthy)` 标记
- [ ] 我知道 `down -v` 会删数据
- [ ] 我能分清两个 `.env`
