# 第 235 节课：数据不出网——本地模型替代

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上一节课你把应用装进了没有网的机房。但你的应用还在调云端大模型。
> 客户说：**"数据一行都不能出我们的内网。"**
> 这一节课把模型也搬进去：**Ollama + 一个 7B 模型，代码只改两个参数。**

**建议用时**：130 分钟
**你需要先完成**：第 234 节课（离线环境能跑起来）、第 3 周（会调模型 API）

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你的应用里有一段这样的代码：

```js
const res = await fetch("https://api.example-llm.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.LLM_API_KEY}`,
  },
  body: JSON.stringify({
    model: "some-large-model",
    messages: [{ role: "user", content: question }],
  }),
});
```

**这段代码有一个致命问题：它把用户的每一句话都发到了公网。**

**在私有化项目里，这一行就是"数据出网"的证据。**

## 0.2 你以后会遇到什么

```text
① 客户安全部门做流量审计，发现服务器在往外发 HTTPS 请求，问：这是什么？
② 客户问：你们这个 AI 是自己算的还是传到外面算的？
③ 你装了本地模型，客户试用后说：回答质量不如你演示的时候。
④ 你发现本地模型一次只能处理 2000 字，客户的长文档问答全废了。
⑤ 你跑了三个用户同时提问，第四个用户的请求排队两分钟。
```

**这五件事，前两件是"能不能交付"，后三件是"交付了能不能验收"。**

## 0.3 今天要建立的三个概念

```text
① 本地推理：模型文件下载到本机，用本机的 CPU/显卡算，不联网。
② OpenAI 兼容接口：Ollama 提供的 API 和 OpenAI 的格式一样，所以代码只改 baseURL 和 model。
③ 效果预期：7B 本地模型和云端大模型差一到两个数量级。这件事必须提前写进验收标准。
```

**第三个概念决定你会不会被验收卡住。**

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的学习记录，含性能测试数据 |
| `llm-client.js` | `03-练习代码` | 改好的模型调用代码 |
| `ollama-compose.yml` | `03-练习代码` | 带 ollama 的编排片段 |
| `模型测试记录.md` | `03-练习代码` | 响应时间、并发、质量对比 |

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **只有你的 Windows 电脑。** 用 Ollama 在本机跑模型，模拟「数据不出网」。 |
| **用哪个终端** | **Git Bash**（跑 Ollama 和改代码）**+ 浏览器**（下载 Ollama）。 |
| **现在在哪个目录** | <code>cd "B:/OPC-Distance_study/每周课程/06-上线运维/第34周-私有化部署/第04节课/03-练习代码"</code> |
| **本节新建什么** | `llm-client.js`（只改 `baseURL` 的版本）<br>`ollama-compose.yml`<br>`模型测试记录.md`（响应时间、并发、质量对比） |

## 开工前先跑这一条

确认你没站错地方：

```bash
ollama --version 2>/dev/null || echo "没装 Ollama（正常，第 1 步会装）"; echo "---"; df -h /c | tail -1
```

**应该看到：**

**两种结果都对：**

```text
ollama version is 0.5.x
---
/dev/sda2       476G  320G  156G  68% /
```

或

```text
没装 Ollama（正常，第 1 步会装）
---
/dev/sda2       476G  320G  156G  68% /
```

**⚠️ 装之前先看磁盘那一行：** Ollama 本体几百 MB，一个 7B 模型 4—5GB。**剩下空间不够 10G 就先清盘。**

## 如果不对

**`没装 Ollama`** → 去 ollama.com 下载 Windows 版，装完**重开一个 Git Bash**（要重启终端才认 PATH）。

**磁盘剩余不到 10G** → 先清盘，不然模型下到一半会失败。

---

# 第 1 步：先认清差距，再动手（20 分钟）

## 1.1 本地模型和云端模型，差在哪

| 维度 | 云端大模型 | 本地 7B 模型 |
|---|---|---|
| 参数量 | 千亿级 | 70 亿 |
| 中文理解 | 好 | 能用，长句和口语会出错 |
| 长文档 | 支持 128K 以上 | 通常 4K—8K |
| 响应速度 | 首字 0.5—2 秒 | **首字 2—10 秒（CPU 更慢）** |
| 并发 | 几十上百 | **1—4 个** |
| 成本 | 按 token 付费 | 一次性硬件投入 |
| 数据出网 | **会** | **不会** |
| 胡说八道 | 少 | **明显更多** |

**最后两行，就是客户为什么选本地模型的原因和代价。**

**你要在方案里同时写这两行。只写"数据不出网"，不写"效果下降"，验收时一定吵。**

## 1.2 硬件要求：这是硬门槛

| 模型规模 | 模型文件 | 内存/显存需求 | 典型硬件 | 体验 |
|---|---|---|---|---|
| 1.5B—3B | 1—2 G | 4 G | 普通办公机 | 快，但经常答非所问 |
| **7B—8B** | **4—5 G** | **8 G** | 8G 内存的服务器 | **能用，慢** |
| 13B—14B | 8—9 G | 16 G | 16G 内存 / 8G 显存 | 好一些，明显慢 |
| 32B | 19—20 G | 32 G | 32G 内存 / 24G 显存 | 接近可用，需要显卡 |
| 70B | 40 G+ | 64 G+ | 多卡 | 私有化项目基本用不起 |

**本课程用 7B。** 因为它能在 8G 内存的机器上跑起来，是"能交付"的最低门槛。

**算一下你客户的机器：**

```text
确认单上写的是 8 核 16G。
16G 内存：系统 2G + postgres 1G + app 1G + 模型 6G = 10G，够。
如果确认单上写的是 8G：系统 2G + postgres 1G + app 1G + 模型 6G = 10G，不够。
```

**8G 内存的机器跑 7B，会和数据库抢内存，最后 OOM。**

**这种情况你要么让客户加内存，要么换 3B 模型。**

## 1.3 有没有 GPU，差别很大

```bash
lspci | grep -i -E "vga|nvidia|3d"
```

**应该看到（有 NVIDIA 显卡）：**

```text
01:00.0 VGA compatible controller: NVIDIA Corporation GA104 [GeForce RTX 3070] (rev a1)
```

**没有显卡的机器：**

```text
00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 630 (Desktop)
```

**或者什么都没有（服务器集显）。**

| 硬件 | 7B 生成速度（大约） | 说明 |
|---|---|---|
| 纯 CPU（8 核） | 3—8 token/秒 | **一句话要等十几秒** |
| 消费级显卡（8G 显存） | 30—60 token/秒 | 体验明显好 |
| 服务器显卡（24G） | 60—100 token/秒 | 接近云端体验 |

**`token` 是什么：**

```text
模型处理文本的最小单位，中文大约 1 个字 = 1—2 个 token。
3 token/秒 意味着每秒输出 2 个字左右，一段 200 字的回答要一分半。
```

**这段话必须让客户听到：**

```text
如果没有显卡，纯 CPU 跑 7B，生成速度大约是每秒 3—8 个 token。
一段 200 字的回答大约需要 30 秒到 1 分钟。
这个速度可以接受，但不能期待"打字机一样"的体验。
```

## 1.4 逐行读：一次真实的性能对比

**同一个问题，问两个模型：**

```text
问题：请用三句话解释什么是"等保 2.0"。
```

| 指标 | 云端大模型 | 本地 7B（CPU） |
|---|---|---|
| 首字时间 | 0.8 秒 | 4.2 秒 |
| 总耗时 | 3.1 秒 | 28.6 秒 |
| 输出字数 | 186 字 | 143 字 |
| 内容准确性 | 准确 | 大体对，把"等级保护"说成了"等级评测" |
| 是否编造 | 无 | 编了一个不存在的标准号 |

**逐行读：**

| 行 | 你要得出的结论 |
|---|---|
| 首字 4.2 秒 | 用户会觉得"卡了一下"，要加 loading 提示 |
| 总耗时 28.6 秒 | 默认 60 秒超时够用，但网络差一点就超 |
| 输出更短 | 7B 容易"说两句就停"，prompt 要更明确 |
| 编造标准号 | **这是最危险的**，面向客户的问答必须加"以文档为准"的约束 |

**这张表要贴进《模型测试记录》，作为验收依据。**

## 1.5 一句话说清取舍

```text
本地模型买到的是"数据不出网"，付出的是"效果和速度"。
这两件事必须同时告诉客户，不能只说一半。
```

---

# 第 2 步：装 Ollama（30 分钟）

## 2.1 Ollama 是什么

**大白话：一个"模型运行器"。**

```text
它负责：下载模型、加载模型到内存、提供一个 HTTP 接口让你调用。
你不需要懂 CUDA、不需要写推理代码，装完就能用。
```

**它和你的应用的关系：**

```text
你的 app  →  HTTP  →  Ollama  →  模型文件  →  CPU/GPU 算
```

**Ollama 不是模型。** 模型是它加载的文件。

## 2.2 在线安装（在你自己的机器上试）

> **⚠️ 这一步需要联网。客户机房不能做。**
> **在客户现场，跳到 2.3。**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**应该看到：**

```text
>>> Installing ollama to /usr/local
>>> Downloading Linux amd64 bundle
######################################################################## 100.0%
>>> Creating ollama user...
>>> Adding ollama user to render group...
>>> Adding ollama user to video group...
>>> Adding current user to ollama group...
>>> Creating ollama systemd service...
>>> Enabling and starting ollama service...
>>> The Ollama API is now available at 127.0.0.1:11434.
>>> Install complete. Run "ollama" from the command line.
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Installing ollama to /usr/local` | 装到 `/usr/local/bin/ollama` |
| `Creating ollama user` | 建了一个专用系统用户 |
| `Adding to render/video group` | 加进显卡相关组，为了能用 GPU |
| `Creating systemd service` | 建了开机自启服务 |
| `API is now available at 127.0.0.1:11434` | **只监听本机**，这是默认的安全设置 |

**验证：**

```bash
ollama --version
```

**应该看到：**

```text
ollama version is 0.5.7
```

**版本号会变，以你装的时候为准。**

## 2.3 离线安装（客户现场用这个）

**在能联网的机器上下载二进制包：**

```bash
curl -fL -O https://github.com/ollama/ollama/releases/download/v0.5.7/ollama-linux-amd64.tgz
```

**应该看到：**

```text
100 1.4G  100 1.4G    0     0  12.4M/s  0:01:52
```

**1.4G。** 比你想的大，因为它带了 CUDA 运行库。

**ARM 机器用：**

```text
ollama-linux-arm64.tgz
```

**拷进内网，解压：**

```bash
sudo tar -xzf ollama-linux-amd64.tgz -C /usr/local
```

**应该看到：没有输出。**

**验证目录：**

```bash
ls /usr/local/bin/ollama
```

**应该看到：**

```text
/usr/local/bin/ollama
```

**`-C /usr/local` 是什么：**

```text
解压到指定目录。
这个 tgz 内部结构是 bin/ollama 和 lib/...，
解压到 /usr/local 后正好变成 /usr/local/bin/ollama。
解压到别的地方，ollama 会找不到自己的库。
```

**验证：**

```bash
ollama --version
```

**应该看到：**

```text
ollama version is 0.5.7
```

**如果报：**

```text
ollama: error while loading shared libraries: libcuda.so.1: cannot open shared object file
```

**说明它想用 GPU 但没找到驱动。**

**不影响 CPU 运行，但会有这个告警。可以忽略，或者装驱动。**

## 2.4 手动配 systemd（离线包没有 install.sh）

**离线安装不会自动建服务，要自己写。**

```bash
sudo useradd -r -s /bin/false -m -d /usr/share/ollama ollama
```

**应该看到：没有输出。**

**`useradd` 参数：**

| 参数 | 意思 |
|---|---|
| `-r` | 系统用户（不用于登录） |
| `-s /bin/false` | 不允许登录 shell |
| `-m` | 建家目录 |
| `-d /usr/share/ollama` | 家目录位置 |

**写 service 文件：**

```bash
sudo tee /etc/systemd/system/ollama.service >/dev/null <<'EOF'
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_MODELS=/opt/app/data/ollama/models"
Environment="OLLAMA_KEEP_ALIVE=30m"

[Install]
WantedBy=multi-user.target
EOF
```

**逐行读：**

| 配置 | 作用 | 为什么这么设 |
|---|---|---|
| `User=ollama` | 用专用用户跑 | 不给 root 权限 |
| `OLLAMA_HOST=127.0.0.1:11434` | **只监听本机** | 不对内网开放 |
| `OLLAMA_MODELS=/opt/app/data/ollama/models` | 模型文件放数据盘 | 不占系统盘，好备份 |
| `OLLAMA_KEEP_ALIVE=30m` | 模型在内存里留 30 分钟 | 避免每次提问都重新加载（重新加载要 10—30 秒） |

**`OLLAMA_KEEP_ALIVE` 很关键：**

```text
默认是 5 分钟。
5 分钟内没人提问，模型就被卸载，下次提问要重新加载。
7B 模型加载要 5—15 秒，用户会感觉"第一次特别慢"。
设成 30m 或 -1（永不过期，但吃内存）体验更好。
```

**建目录并授权：**

```bash
sudo mkdir -p /opt/app/data/ollama/models
sudo chown -R ollama:ollama /opt/app/data/ollama
```

**应该看到：没有输出。**

**启动：**

```bash
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama
```

**验证：**

```bash
systemctl status ollama
```

**应该看到：**

```text
● ollama.service - Ollama Service
     Loaded: loaded (/etc/systemd/system/ollama.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-03-10 14:02:11 CST; 8s ago
   Main PID: 5122 (ollama)
     Memory: 28.4M
```

**注意 `Memory: 28.4M`。**

```text
这是"还没加载模型"时的内存。
加载 7B 之后会涨到 5—6G。看到 28M 不要以为它没工作。
```

## 2.5 验证接口活着

```bash
curl -s http://127.0.0.1:11434/api/tags
```

**应该看到（还没拉模型）：**

```json
{"models":[]}
```

**逐段读：**

```text
{"models":[]}        空数组，说明服务起来了但一个模型都没有
```

**如果没有 curl：**

```bash
wget -qO- http://127.0.0.1:11434/api/tags
```

**如果连 wget 都没有：**

```bash
ollama list
```

**应该看到：**

```text
NAME    ID    SIZE    MODIFIED
```

**表头有，内容空。** 同样说明服务正常。

---

# 第 3 步：把模型搬进去（30 分钟）

## 3.1 在线拉（有网的机器）

```bash
ollama pull qwen2.5:7b
```

**应该看到（进度条会动）：**

```text
pulling manifest
pulling 8daa9615c259: 100% ▕████████████████████████████████▏ 4.7 GB
pulling 2f9c8d1e4b07: 100% ▕████████████████████████████████▏  11 KB
pulling 1a2b3c4d5e6f: 100% ▕████████████████████████████████▏  487 B
verifying sha256 digest
writing manifest
success
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `pulling manifest` | 先拉"这个模型由哪些文件组成"的清单 |
| `4.7 GB` | 模型权重，最大的一块 |
| `11 KB` | 模板（prompt 模板） |
| `487 B` | 参数配置 |
| `verifying sha256 digest` | 校验下载的文件 |
| `success` | 完成 |

**模型名会变。** `qwen2.5:7b` 是写这份课件时有的，以 Ollama 官方模型库为准。

**看有哪些模型可以拉：**

```bash
ollama list
```

**现在应该看到：**

```text
NAME          ID              SIZE      MODIFIED
qwen2.5:7b    845dbda0ea48    4.7 GB    2 minutes ago
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `NAME` | 模型名:标签 |
| `ID` | 内容哈希前 12 位 |
| `SIZE` | 占磁盘多少 |
| `MODIFIED` | 什么时候拉的 |

## 3.2 离线搬：把模型目录整个拷走

**模型文件在哪：**

```bash
ls -lh /usr/share/ollama/.ollama/models/
```

**应该看到：**

```text
total 8.0K
drwxr-xr-x 3 ollama ollama 4.0K Mar 10 14:20 blobs
drwxr-xr-x 2 ollama ollama 4.0K Mar 10 14:20 manifests
```

**两个目录的作用：**

| 目录 | 存什么 |
|---|---|
| `blobs` | 真正的大文件（模型权重），文件名是 sha256 |
| `manifests` | 清单，记录"这个模型由哪些 blob 组成" |

**看 blobs 有多大：**

```bash
du -sh /usr/share/ollama/.ollama/models/blobs
```

**应该看到：**

```text
4.7G    /usr/share/ollama/.ollama/models/blobs
```

**打包：**

```bash
sudo tar -czf /tmp/ollama-models-qwen25-7b.tar.gz \
  -C /usr/share/ollama/.ollama models
```

**应该看到：没有输出。**

```bash
ls -lh /tmp/ollama-models-qwen25-7b.tar.gz
```

**应该看到：**

```text
-rw-r--r-- 1 root root 4.3G Mar 10 14:30 /tmp/ollama-models-qwen25-7b.tar.gz
```

**为什么压缩后只小了一点：**

```text
模型权重是浮点数，压缩率很低。
4.7G 压到 4.3G，别指望压成 1G。
```

**⚠️ 4.3G 已经超过 FAT32 的 4G 上限。**

```text
你的 U 盘必须是 exFAT 或 NTFS。
如果是 FAT32，用第 234 节课的 split 拆包。
```

## 3.3 在内网解包

```bash
sudo mkdir -p /opt/app/data/ollama/models
sudo tar -xzf /opt/offline/ollama-models-qwen25-7b.tar.gz \
  -C /opt/app/data/ollama/models --strip-components=1
sudo chown -R ollama:ollama /opt/app/data/ollama
```

**`--strip-components=1` 是什么：**

```text
压缩包里第一层是 models/ 目录。
--strip-components=1 表示"去掉最前面一层"，
这样解出来是 /opt/app/data/ollama/models/blobs 和 manifests，
而不是 /opt/app/data/ollama/models/models/blobs。
```

**验证：**

```bash
ls /opt/app/data/ollama/models/
```

**应该看到：**

```text
blobs  manifests
```

**重启 ollama 让它读新目录：**

```bash
sudo systemctl restart ollama
```

**验证模型被认出来：**

```bash
ollama list
```

**应该看到：**

```text
NAME          ID              SIZE      MODIFIED
qwen2.5:7b    845dbda0ea48    4.7 GB    3 minutes ago
```

**如果看到空表：**

```text
说明 OLLAMA_MODELS 指错了，或者 manifests 目录层级不对。
检查：
ls /opt/app/data/ollama/models/manifests/registry.ollama.ai/library/qwen2.5/
应该有 tags/ 和 7b 文件。
```

## 3.4 跑第一句话

```bash
ollama run qwen2.5:7b "用一句话解释什么是内网。"
```

**应该看到（第一次会等几秒到几十秒）：**

```text
内网是指在一个组织或机构内部建立的、不与互联网直接连接的计算机网络，
主要用于内部资源共享和信息传递。
```

**第一次为什么慢：**

```text
要先把这个模型从磁盘加载到内存，约 5—20 秒（取决于磁盘和内存速度）。
加载完会保持一段时间（OLLAMA_KEEP_ALIVE），后续提问就快了。
```

**再问一次：**

```bash
ollama run qwen2.5:7b "再说一遍，换个说法。"
```

**应该明显更快。**

**看模型有没有在内存里：**

```bash
ollama ps
```

**应该看到：**

```text
NAME          ID              SIZE      PROCESSOR    UNTIL
qwen2.5:7b    845dbda0ea48    5.2 GB    100% CPU     29 minutes from now
```

**逐列读：**

| 列 | 意思 | 关键 |
|---|---|---|
| `SIZE` | 加载后占的内存 | 比文件大，因为有运行时开销 |
| `PROCESSOR` | 用什么算 | `100% CPU` 表示没用显卡 |
| `UNTIL` | 什么时候卸载 | 由 `KEEP_ALIVE` 决定 |

**如果看到 `100% GPU`，说明显卡用上了。**

**如果是 `100% CPU` 而你客户有显卡：**

```text
说明驱动没装好或者显存不够。
7B 需要约 6G 显存，8G 显卡能放下；4G 显卡会回退到 CPU。
```

---

# 第 4 步：把 Ollama 放进 compose（20 分钟）

## 4.1 为什么用容器跑

| 方式 | 优点 | 缺点 |
|---|---|---|
| 宿主机装 | 性能略好，GPU 直通简单 | 多一个系统服务，迁移麻烦 |
| 容器 | 跟着 compose 一起起，卸载干净 | GPU 要额外配置 |

**本课程用容器，和你的其他服务保持一致。**

## 4.2 compose 片段

**文件：`ollama-compose.yml`（追加到你的主 compose）**

```yaml
services:
  ollama:
    image: ollama/ollama:0.5.7
    container_name: chatapp-ollama
    restart: unless-stopped
    environment:
      OLLAMA_KEEP_ALIVE: 30m
      OLLAMA_NUM_PARALLEL: 2
      OLLAMA_MAX_LOADED_MODELS: 1
    volumes:
      - ./data/ollama:/root/.ollama
    networks:
      - backend
    # 不写 ports。只有 compose 内部能访问。
    mem_limit: 8g
    healthcheck:
      test: ["CMD", "ollama", "list"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"
```

**逐行读：**

| 配置 | 作用 | 为什么 |
|---|---|---|
| `image: ollama/ollama:0.5.7` | 固定版本 | 不同版本模型格式可能不兼容 |
| `OLLAMA_KEEP_ALIVE: 30m` | 模型留内存 30 分钟 | 减少冷启动 |
| `OLLAMA_NUM_PARALLEL: 2` | 同时处理 2 个请求 | 多了会抢内存，反而更慢 |
| `OLLAMA_MAX_LOADED_MODELS: 1` | 只加载一个模型 | 内存不够同时放两个 |
| `./data/ollama:/root/.ollama` | 模型存在宿主目录 | 容器重建不丢模型 |
| **没有 `ports`** | 不对外 | 内网用户不能直接调模型 |
| `mem_limit: 8g` | 限制内存 | 防止模型吃光内存把数据库挤死 |
| `healthcheck: ollama list` | 能列模型就算健康 | 比 `curl` 可靠，不依赖宿主工具 |

**容器里的模型路径是 `/root/.ollama`，不是 `/opt/app/...`。**

```text
因为容器里 ollama 以 root 身份跑，家目录是 /root。
你在宿主机看到的是 ./data/ollama，映射进去就是 /root/.ollama。
这两个路径不要搞混。
```

## 4.3 把模型放进容器挂载目录

```bash
mkdir -p data/ollama/models
tar -xzf /opt/offline/ollama-models-qwen25-7b.tar.gz \
  -C data/ollama/models --strip-components=1
```

**验证：**

```bash
ls data/ollama/models/
```

**应该看到：**

```text
blobs  manifests
```

**起服务：**

```bash
docker compose up -d ollama
```

**应该看到：**

```text
[+] Running 2/2
 ✔ Network app_backend    Created
 ✔ Container chatapp-ollama  Started
```

**等 10 秒，验证：**

```bash
docker compose exec ollama ollama list
```

**应该看到：**

```text
NAME          ID              SIZE      MODIFIED
qwen2.5:7b    845dbda0ea48    4.7 GB    5 minutes ago
```

**如果这里报错：**

```text
Error: could not connect to ollama app, is it running?
```

**先看日志：**

```bash
docker compose logs ollama --tail 30
```

**常见原因：模型目录权限不对。**

```bash
sudo chown -R 1000:1000 data/ollama
docker compose restart ollama
```

**为什么是 1000：**

```text
ollama 官方镜像里用的用户 uid 是 1000。
宿主目录属主不是 1000，容器里就读不了。
```

## 4.4 验证接口

```bash
docker compose exec app node -e "
fetch('http://ollama:11434/api/tags').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))
"
```

**应该看到：**

```text
{"models":[{"name":"qwen2.5:7b","model":"qwen2.5:7b","modified_at":"2026-03-10T06:30:00Z","size":4683087296,"digest":"845dbda0ea48...","details":{"format":"gguf","family":"qwen2","parameter_size":"7.6B","quantization_level":"Q4_K_M"}}]}
```

**逐段读：**

| 字段 | 意思 |
|---|---|
| `name` / `model` | 模型名，调用时用这个 |
| `size` | 字节数，4683087296 约 4.36 G |
| `parameter_size` | 76 亿参数 |
| `quantization_level` | `Q4_K_M`，4 位量化，中等质量 |

**`Q4_K_M` 是什么：**

```text
把模型权重从 16 位浮点压到 4 位，体积小 4 倍，质量损失较小。
7B 模型原始约 15G，量化后 4.4G。
不量化，8G 内存根本跑不动。
```

**为什么用 `docker compose exec app` 而不是在宿主机 curl：**

```text
ollama 没有映射端口，宿主机访问不到 11434。
只有 compose 网络里的容器能访问。
这正好证明了"模型 API 不对外"。
```

---

# 第 5 步：改代码，只换两个参数（25 分钟）

## 5.1 改之前

```js
// llm-client.js（改之前）
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: "https://api.example-llm.com/v1",
});

export async function ask(question) {
  const res = await client.chat.completions.create({
    model: "some-large-model",
    messages: [{ role: "user", content: question }],
  });
  return res.choices[0].message.content;
}
```

## 5.2 改之后

```js
// llm-client.js（改之后）
import OpenAI from "openai";

const BASE_URL = process.env.LLM_BASE_URL || "http://ollama:11434/v1";
const MODEL = process.env.LLM_MODEL || "qwen2.5:7b";

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY || "ollama",  // 本地模型不校验，但不能为空
  baseURL: BASE_URL,
  timeout: 120000,        // 本地模型慢，默认 60 秒不够
  maxRetries: 0,          // 本地服务失败重试也没用，快速失败让用户看到
});

export async function ask(question) {
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "你是企业内部助手。只根据提供的资料回答，资料里没有就说不知道。不要编造。",
      },
      { role: "user", content: question },
    ],
    temperature: 0.3,     // 降低随机性，减少胡说
  });
  return res.choices[0].message.content;
}
```

**只改了这些：**

| 改动 | 从 | 到 |
|---|---|---|
| `baseURL` | 云端地址 | `http://ollama:11434/v1` |
| `model` | 云端模型名 | `qwen2.5:7b` |
| `apiKey` | 真实 key | 任意非空字符串 |
| `timeout` | 默认 | 120000 |
| `temperature` | 默认 1.0 | 0.3 |
| `system` prompt | 没有 | 加了"只根据资料回答" |

**为什么 `apiKey` 不能为空：**

```text
OpenAI SDK 在构造时会检查 apiKey，为空会直接抛错：
The OPENAI_API_KEY environment variable is missing or empty
Ollama 本身不校验这个 key，但 SDK 要。
填 "ollama" 就行。
```

**为什么 `baseURL` 要带 `/v1`：**

```text
SDK 会在 baseURL 后面拼 /chat/completions。
你给 http://ollama:11434，它请求的是 http://ollama:11434/chat/completions，
Ollama 的 OpenAI 兼容接口在 /v1/chat/completions，所以 404。
必须写 http://ollama:11434/v1。
```

## 5.3 环境变量

**`.env` 里加三行：**

```bash
LLM_BASE_URL=http://ollama:11434/v1
LLM_MODEL=qwen2.5:7b
LLM_API_KEY=ollama
```

**为什么用环境变量，不写死：**

```text
① 同一份代码，公网版和私有化版都能用
② 换模型不用改代码
③ 客户现场出问题，改 .env 重启就行
```

## 5.4 用 curl 直接验证接口

**在 `app` 容器里：**

```bash
docker compose exec app node -e "
fetch('http://ollama:11434/v1/chat/completions', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({
    model: 'qwen2.5:7b',
    messages: [{role:'user', content:'说一句你好'}]
  })
}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j, null, 2)))
"
```

**应该看到：**

```json
{
  "id": "chatcmpl-842",
  "object": "chat.completion",
  "created": 1741590000,
  "model": "qwen2.5:7b",
  "system_fingerprint": "fp_ollama",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！有什么可以帮你的吗？"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 9,
    "total_tokens": 21
  }
}
```

**逐段读：**

| 字段 | 意思 | 你要关注什么 |
|---|---|---|
| `object: chat.completion` | 格式和 OpenAI 一致 | SDK 能直接解析 |
| `system_fingerprint: fp_ollama` | 是 Ollama 返回的 | 说明没走云端 |
| `content` | 模型输出 | 中文正常 |
| `finish_reason: stop` | 正常结束 | `length` 表示被截断 |
| `usage` | token 统计 | 用于估算性能 |

**`finish_reason: length` 是什么意思：**

```text
模型输出到了上限被截断。
本地模型默认上下文小，长回答容易被切。
要么提高 num_ctx，要么让 prompt 更简洁。
```

## 5.5 流式输出（体验必须改）

**非流式的问题：**

```text
用户点发送，界面转圈 28 秒，然后一次性出现一大段。
用户会以为卡死了。
```

**改成流式：**

```js
export async function askStream(question, onChunk) {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: question }],
    stream: true,
  });

  let full = "";
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content || "";
    if (delta) {
      full += delta;
      onChunk(delta);        // 每来一小段就推给前端
    }
  }
  return full;
}
```

**为什么流式对本地模型特别重要：**

```text
本地模型总耗时 20—30 秒，但首字只要 3—5 秒。
流式能让用户在 5 秒内看到第一个字，感知上快很多。
非流式只能等 30 秒。
```

**SSE 是什么：**

```text
Server-Sent Events，服务器一段一段往浏览器推送数据。
OpenAI 的 stream: true 用的就是它。
```

---

# 第 6 步：测性能，定验收基线（25 分钟）

## 6.1 为什么要先测

**客户问"多快"，你不能说"还行"。**

**你要能给三个数：**

```text
首字时间：用户点发送后多久看到第一个字
总耗时：一段 200 字的回答要多久
并发：3 个人同时问，会不会排队
```

## 6.2 测一个固定问题

**写一个测试脚本：**

```bash
cat > /tmp/bench.sh <<'EOF'
#!/usr/bin/env bash
Q="请用三句话解释什么是网络安全等级保护。"
for i in 1 2 3; do
  START=$(date +%s.%N)
  OUT=$(docker compose exec -T app node -e "
    fetch('http://ollama:11434/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'qwen2.5:7b',
        messages:[{role:'user',content:'$Q'}]
      })
    }).then(r=>r.json()).then(j=>console.log(j.choices[0].message.content))
  ")
  END=$(date +%s.%N)
  echo "第 $i 次：$(echo "$END - $START" | bc) 秒，字数 $(echo -n "$OUT" | wc -m)"
done
EOF
chmod +x /tmp/bench.sh
/tmp/bench.sh
```

**应该看到：**

```text
第 1 次：31.42 秒，字数 168
第 2 次：27.85 秒，字数 172
第 3 次：26.90 秒，字数 165
```

**逐行读：**

| 观察 | 含义 |
|---|---|
| 第 1 次最慢 | 模型加载（冷启动），后面有缓存 |
| 第 2、3 次接近 | 稳定值，约 27 秒 |
| 字数差不多 | 输出长度稳定，不是偶然 |

**如果客户机器更差：**

```text
4 核 8G 的机器，同样问题可能要 60—90 秒。
这个数字必须提前告诉客户，并写进验收标准。
```

## 6.3 测并发

```bash
for i in 1 2 3; do
  ( docker compose exec -T app node -e "
      const t=Date.now();
      fetch('http://ollama:11434/v1/chat/completions',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'qwen2.5:7b',messages:[{role:'user',content:'说一句关于春天的话'}]})
      }).then(r=>r.json()).then(j=>console.log('请求$i 用时', (Date.now()-t)/1000, '秒'));
    " ) &
done
wait
```

**应该看到（`OLLAMA_NUM_PARALLEL=2`）：**

```text
请求1 用时 41.2 秒
请求2 用时 42.8 秒
请求3 用时 68.4 秒
```

**逐行读：**

| 现象 | 原因 |
|---|---|
| 前两个约 42 秒 | 并行 2 个，各自慢了一点 |
| 第三个 68 秒 | 排队了，等前两个之一结束 |

**如果 `OLLAMA_NUM_PARALLEL=1`：**

```text
三个请求都会变成 27 秒、54 秒、81 秒，明显排队。
```

**怎么定这个值：**

| 机器内存 | 建议 `NUM_PARALLEL` |
|---|---|
| 8G | 1（并行会 OOM） |
| 16G | 2 |
| 32G + 显卡 | 4 |

**不要贪多。** 并发 4 在 16G 机器上会把内存打满，触发 OOM，全部失败。

## 6.4 上下文长度：长文档最容易翻车

**默认上下文通常只有 4096 token。**

```text
4096 token 约等于 2500—3000 个汉字。
一份 10 页的合同可能有 8000 字，直接被截断。
```

**现象：**

```text
用户上传了一份长文档，问"第 8 条讲的是什么"，
模型回答"文档中没有提到"。
不是它不会，是它根本没看到第 8 条。
```

**调大上下文：**

```bash
docker compose exec ollama ollama run qwen2.5:7b "
/set parameter num_ctx 8192
"
```

**或者在你的请求里传：**

```js
const res = await client.chat.completions.create({
  model: MODEL,
  messages,
  // OpenAI 兼容接口不直接支持 num_ctx，要用 Ollama 原生接口
});
```

**Ollama 原生接口支持 `options`：**

```js
const res = await fetch("http://ollama:11434/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "qwen2.5:7b",
    prompt: question,
    options: { num_ctx: 8192 },
  }),
});
```

**⚠️ 代价：**

```text
上下文翻倍，内存占用也接近翻倍。
16G 内存跑 7B + 8K 上下文，已经比较紧张。
32G 更稳。
```

**实用做法：**

```text
① 文档问答不要整篇塞进去，先做检索，只塞相关段落（RAG）
② 单次塞入控制在 2000 字以内
③ 在 prompt 里明确说"只根据以下资料回答"
```

## 6.5 提示词要按本地模型改

**云端能听懂的指令，7B 不一定听懂。**

| 写法 | 7B 的表现 | 改法 |
|---|---|---|
| "帮我总结一下" | 可能开始聊天 | "把下面文字总结成 3 条，每条不超过 20 字" |
| "根据文档回答" | 可能自己编 | "只使用【资料】中的内容回答。资料里没有就回答'资料中未提及'" |
| 长 system prompt | 容易忽略后半段 | 把最重要的约束放最后一句 |

**实测有效的模板：**

```text
你是企业内部的文档助手。

规则：
1. 只使用【资料】中的内容回答。
2. 资料中没有的信息，回答"资料中未提及"。
3. 不要编造数字、日期、条款号。
4. 回答控制在 200 字以内。

【资料】
{{retrieved_context}}

【问题】
{{question}}
```

**为什么把"不要编造"单独列一条：**

```text
7B 模型编造条款号、标准号非常常见。
一条明确的禁令能显著降低（但不能消除）这个问题。
```

---

# 第 7 步：把差距写进验收标准（20 分钟）

## 7.1 三种写法的对比

**❌ 错误写法一：**

```text
模型回答质量达到用户满意。
```

**为什么不行：** "满意"无法测量，客户永远可以说不满意。

**❌ 错误写法二：**

```text
模型效果与演示环境一致。
```

**为什么不行：** 演示用的是云端大模型，物理上不可能一致。

**✅ 正确写法：**

```text
1. 系统能对上传的文档内容给出回答，回答内容与文档不矛盾。
2. 单次提问（不超过 200 字）在 60 秒内返回完整回答。
3. 对文档中明确写出的条款，回答准确率不低于 80%（抽测 20 条）。
4. 资料中不存在的信息，系统回答"资料中未提及"的比例不低于 70%（抽测 10 条）。
5. 不承诺回答质量与公网大模型一致。
```

**逐条读：**

| 条款 | 可测量 | 为什么这么定 |
|---|---|---|
| 1 | 是/否 | "不矛盾"比"正确"宽松，但可判断 |
| 2 | 秒表 | 性能是硬指标，必须写 |
| 3 | 20 条抽测 | 80% 是 7B 的合理水平 |
| 4 | 10 条抽测 | 防编造，70% 说明还有 30% 会编 |
| 5 | 免责 | 防止拿演示效果对比 |

**第 3 条和第 4 条的测试方法：**

```text
准备 20 个问题，答案在文档里能直接找到。
逐个问，记录"答对/答错/部分对"。
20 条里 16 条对，就是 80%。
```

**这个测试要当着客户面做。** 你做完给他看，比他自己试出来好。

## 7.2 怎么跟客户说差距

**不要等验收时解释。第一次演示本地模型时就说。**

**话术（照着念）：**

```text
这一版用的是本地 7B 模型，跑在你们自己的服务器上。
它能做到：文档里的内容能查到、能总结、能回答常见问题。
它做不到：像公网大模型那样写文章、做复杂推理、理解很绕的问法。

差别的原因很简单：公网那个模型有几千亿参数，我们这个 70 亿，差 100 倍。
换来的是：你们的数据一个字都不出机房。

如果某些场景效果不够，我们可以：
① 换更大的模型（要加内存或显卡，费用另计）
② 做检索增强，把相关段落先找出来再喂给它（这个我们能做）
③ 把这类问题引导到人工
```

**这三条"如果不够"的应对，就是你的专业度。**

## 7.3 一页纸：给客户的模型说明

```text
一、模型部署位置
   模型文件存放在服务器 /opt/app/data/ollama/models，不连接任何外部服务。

二、数据流向
   用户提问 → 应用 → 本机模型 → 返回。
   全程在内网完成，不产生任何外部网络请求。

三、性能基线（8 核 16G，无显卡）
   首字响应：3—6 秒
   200 字回答：约 25—35 秒
   并发：2 个（第 3 个开始排队）

四、能力边界
   擅长：文档内容查询、摘要、常见问题回答
   不擅长：复杂推理、创意写作、超长文档（超过 3000 字需分段）

五、与公网大模型的差异
   参数量差约 100 倍，回答质量和速度均有明显差距。
   本方案的价值是数据不出网，不是效果对标。

六、可选的提升手段
   换 13B/32B 模型（需增加内存或显卡）
   检索增强（RAG），先找相关段落再回答
   针对业务场景微调提示词
```

**这份一页纸，验收会上人手一份。**

## 7.4 验证"真的没出网"

**客户最关心这个。给他看证据。**

**方法一：看连接**

```bash
ss -tnp | grep ollama
```

**应该看到：**

```text
ESTAB  0  0  172.18.0.4:11434  172.18.0.3:54321  users:(("ollama",pid=1,fd=8))
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `172.18.0.4:11434` | ollama 容器在 compose 网络里的地址 |
| `172.18.0.3:54321` | 调用方（app 容器） |
| 都是 `172.18.x.x` | **Docker 内部网络地址，不出宿主机** |

**如果看到 `ESTAB ... 93.184.x.x:443`，那就有问题。**

**方法二：断网测试**

```text
把服务器的网线拔掉（或禁用外网网卡），再问一次。
如果能正常回答，说明模型完全在本地。
```

**⚠️ 这个测试要客户同意，且要确认拔的不是内网网线。**

**方法三：看容器网络**

```bash
docker compose exec ollama sh -c "cat /etc/resolv.conf"
```

**应该看到：**

```text
nameserver 127.0.0.11
options ndots:0
```

**`127.0.0.11` 是 Docker 内置 DNS，只能解析 compose 内部服务名。**

```text
它解析不了 www.baidu.com，因为容器网络里没有外部 DNS。
这从机制上证明了：即使模型想联网，也连不出去。
```

---

# 第 8 步：故意犯 6 个错（35 分钟）

## 错误 1：在内网直接 `ollama pull`

**操作：**

```bash
ollama pull qwen2.5:7b
```

**会怎样：**

```text
pulling manifest
Error: pull model manifest: Get "https://registry.ollama.ai/v2/library/qwen2.5/manifests/7b":
dial tcp 104.21.xx.xx:443: i/o timeout
```

**为什么：**

```text
ollama pull 要去 registry.ollama.ai 下载。
内网没有到公网的路由，TCP 连不上，所以是 i/o timeout。
它能解析出 IP（说明有 DNS 或者硬编码），但连不上。
```

**怎么修：**

```text
① 在能联网的机器上 ollama pull
② 打包 ~/.ollama/models
③ 拷进内网，解压到 OLLAMA_MODELS 指向的目录
④ 重启 ollama
```

**具体命令在第 3 步。**

**如果你只有 Windows 机器能上网：**

```text
Windows 装了 Ollama 之后，模型在：
C:\Users\你的用户名\.ollama\models

整个 models 目录拷到 Linux 的 /opt/app/data/ollama/models 下即可，
目录结构是一样的（blobs + manifests）。
```

## 错误 2：只搬了二进制，没搬模型

**操作：**

你 `scp` 了 `/usr/local/bin/ollama` 进内网，觉得完事了。

**会怎样：**

```bash
ollama run qwen2.5:7b
```

```text
Error: model 'qwen2.5:7b' not found, try pulling it first
```

**为什么：**

```text
ollama 只是一个"运行器"，不到 20M。
模型是另外 4.7G 的文件，放在 OLLAMA_MODELS 目录里。
只装运行器，等于装了个空壳。
```

**怎么修：**

```bash
# 确认模型目录
echo $OLLAMA_MODELS
# 或者看 service 文件里的 Environment

ls -lh /opt/app/data/ollama/models/
```

**应该有 `blobs` 和 `manifests` 两个目录，且 `blobs` 是 4.7G。**

**如果没有：**

```bash
tar -xzf ollama-models-qwen25-7b.tar.gz \
  -C /opt/app/data/ollama/models --strip-components=1
systemctl restart ollama
```

**这个问题在现场最尴尬：软件装好了，模型没有，你只能回去拿。**

## 错误 3：内存不够，模型把数据库挤死

**操作：**

在 8G 内存的机器上，同时跑 postgres、app、7B 模型。

**会怎样：**

```bash
docker compose logs postgres --tail 20
```

```text
LOG:  server process (PID 1284) was terminated by signal 9: Killed
LOG:  terminating any other active server processes
FATAL:  the database system is in recovery mode
```

**然后 app 报：**

```text
Error: connect ECONNREFUSED 172.18.0.2:5432
```

**为什么：**

```text
Linux 内存不够时，OOM killer 会挑"占内存最多"的进程杀掉。
通常是 postgres 或 ollama。
signal 9 就是 SIGKILL，OOM killer 干的。
```

**怎么修：**

**先看是谁被杀：**

```bash
dmesg | tail -30
```

**应该看到：**

```text
Out of memory: Killed process 1284 (postgres) total-vm:2048000kB
oom_reaper: reaped process 1284 (postgres)
```

**三个修法，按代价排序：**

| 修法 | 做法 | 代价 |
|---|---|---|
| 换小模型 | 用 3B（约 2G） | 效果更差 |
| 加内存 | 8G → 16G | 客户出钱 |
| 限制模型内存 + 减少并发 | `mem_limit: 5g`、`NUM_PARALLEL=1` | 速度更慢 |

**最不该做的：**

```text
加 swap 硬扛。
swap 上跑模型会慢十倍，而且 SSD 会被写坏。
```

**方案阶段就该算这笔账：**

```text
7B 模型需要 5—6G 内存，加上系统和数据库至少要 8G，
所以总内存至少 16G。确认单上写 8G 的，要在报价前就提出来。
```

## 错误 4：`apiKey` 留空

**操作：**

```js
const client = new OpenAI({
  baseURL: "http://ollama:11434/v1",
});
```

**会怎样：**

```text
Error: The OPENAI_API_KEY environment variable is missing or empty;
either provide it, or instantiate the OpenAI client with an apiKey option,
or set it to a non-empty string.
```

**为什么：**

```text
OpenAI SDK 在构造函数里就检查 apiKey，为空直接抛错，请求都不会发出去。
Ollama 根本不需要 key，但 SDK 不知道。
```

**怎么修：**

```js
const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY || "ollama",
  baseURL: "http://ollama:11434/v1",
});
```

**在 `.env` 里：**

```bash
LLM_API_KEY=ollama
```

**为什么写 `ollama` 而不是随便一个字符串：**

```text
纯约定，一看就知道是本地模型。
有些代理（如 LiteLLM）会认这个值。
```

## 错误 5：默认 60 秒超时

**操作：**

用默认配置调本地模型，问题稍微长一点。

**会怎样：**

```text
APIConnectionTimeoutError: Request timed out.
```

**为什么：**

```text
OpenAI SDK 默认超时 60 秒。
本地 7B 生成 400 字可能需要 60—90 秒，特别是 CPU 机器。
```

**怎么修：**

```js
const client = new OpenAI({
  apiKey: "ollama",
  baseURL: "http://ollama:11434/v1",
  timeout: 180000,     // 3 分钟
  maxRetries: 0,
});
```

**为什么 `maxRetries: 0`：**

```text
超时后自动重试会让用户等更久。
本地服务超时通常是真的慢，不是网络抖动，重试没意义。
让它快速失败，前端提示"回答超时，请把问题拆短一些"。
```

**更好的做法：流式 + 前端超时。**

```text
流式输出时，只要第一个字回来了，就说明没超时。
用 stream 可以规避"总时长"的问题。
```

## 错误 6：把 11434 映射到 0.0.0.0

**操作：**

```yaml
  ollama:
    ports:
      - "11434:11434"
```

**会怎样：**

```bash
ss -lntp | grep 11434
```

```text
LISTEN 0 4096 0.0.0.0:11434 0.0.0.0:* users:(("docker-proxy",pid=7812,fd=4))
```

**内网任何人打开浏览器输 `http://10.20.30.40:11434` 就能看到：**

```text
Ollama is running
```

**并且能直接调模型，绕过你的应用：**

```bash
curl http://10.20.30.40:11434/api/generate -d '{"model":"qwen2.5:7b","prompt":"写一首诗"}'
```

**为什么危险：**

```text
① 绕过你应用里的权限校验
② 绕过内容过滤
③ 任何人都能消耗服务器算力，把服务拖死
④ 安全扫描会报"未授权访问的 AI 服务"
```

**怎么修：**

```yaml
  ollama:
    # 删掉整个 ports 段
```

**如果确实需要从宿主机调试：**

```yaml
  ollama:
    ports:
      - "127.0.0.1:11434:11434"
```

**注意前面的 `127.0.0.1`：**

```text
这样只有本机能访问，内网访问不到。
和 "11434:11434"（等于 0.0.0.0:11434）完全不同。
```

---

# 第 9 步：写学习笔记（10 分钟）

**把下面这份模板复制到 `02-笔记/NOTES.md`，然后填。**

````markdown
# 第 235 节课学习笔记

## 一、本地模型和云端模型的差距

| 维度 | 云端 | 本地 7B |
|---|---|---|
| 参数量 | | |
| 中文理解 | | |
| 长文档 | | |
| 速度 | | |
| 并发 | | |
| 数据出网 | | |

## 二、硬件要求

| 模型 | 文件大小 | 需要内存 | 我的客户机器够吗 |
|---|---|---|---|
| 7B | | | |
| 13B | | | |

我的客户机器：____ 核 / ____ G 内存 / 有无显卡：____

## 三、Ollama 的三个关键路径

| 东西 | 路径 |
|---|---|
| 可执行文件 | |
| 模型目录 | |
| API 地址 | |

## 四、我的性能实测

| 指标 | 第 1 次（冷） | 第 2 次 | 第 3 次 |
|---|---|---|---|
| 总耗时 | | | |
| 输出字数 | | | |

并发 3 个的耗时：

## 五、代码改了哪几个参数

| 参数 | 改前 | 改后 | 为什么 |
|---|---|---|---|
| baseURL | | | |
| model | | | |
| apiKey | | | |
| timeout | | | |
| temperature | | | |

## 六、`apiKey` 为什么不能为空

## 七、六个错误

| 错误 | 报错原文 | 修法 |
|---|---|---|
| 内网 pull | | |
| 没搬模型 | | |
| 内存不足 | | |
| key 为空 | | |
| 超时 | | |
| 端口对外 | | |

## 八、我怎么向客户解释效果差距（写三句话）

1.
2.
3.

## 九、我的验收标准（写 4 条可测量的）

1.
2.
3.
4.

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] 我跑通了一个本地模型
- [ ] 我改过 baseURL 和 model
- [ ] 我测过响应时间和并发
- [ ] 我知道 7B 需要多少内存
- [ ] 我写过可测量的验收标准
- [ ] 我做了至少 4 个错误实验
````

---

# 第 10 步：课后练习（60 分钟）

## 练习 1：跑通一个本地模型

**要求：**

在你自己电脑上装 Ollama，拉一个 7B 或更小的模型，问三个问题。

**记录什么：**

```text
模型名、文件大小。
第一次和第二次的耗时差多少。
回答里有没有明显错误。
```

**思考题：**

```text
如果你的电脑只有 8G 内存，跑 7B 时还能同时开 VS Code 吗？
```

## 练习 2：改代码只换两个参数

**要求：**

把你第 3 周的 `chat-app` 改成可切换：`LLM_BASE_URL` 指向云端或本地。

**记录什么：**

```text
改了哪几行。
切换时除了环境变量还改了什么（应该什么都不用改）。
```

**思考题：**

```text
如果客户既想用本地模型，又想在某些问题上用云端，你怎么设计？
```

## 练习 3：写一个 20 题的抽测表

**要求：**

找一份文档，出 20 个答案能直接在文档里找到的问题，逐个测本地模型。

**记录什么：**

| 题号 | 问题 | 答案在文档里吗 | 模型答对了吗 |
|---|---|---|---|
| 1 | | | |

**正确率：____ / 20 = ____%**

**思考题：**

```text
错的那几题，是"没找到"还是"编造"？这两种错哪种更危险？
```

## 练习 4：验证"不出网"

**要求：**

用 `ss -tnp`、`docker compose exec ollama cat /etc/resolv.conf` 两种方式验证。

**记录什么：**

```text
你看到的连接地址是什么网段。
DNS 是什么地址。
你怎么向客户证明"没有出网"。
```

**思考题：**

```text
如果客户要求"物理断开外网"，你怎么在不拔网线的情况下证明？
```

## 练习 5：算一次硬件账

**要求：**

客户 30 人，每天 500 次提问，要跑 7B。算：内存、磁盘、CPU、能不能扛住并发。

**记录什么：**

| 项 | 计算 | 结果 |
|---|---|---|
| 模型内存 | | |
| 系统 + 数据库 | | |
| 总内存 | | |
| 模型磁盘 | | |
| 峰值并发 | | |

**思考题：**

```text
500 次/天，集中在上午 9—11 点，平均每分钟 4 次。
你的 2 并发扛得住吗？扛不住怎么办？
```

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清 Ollama 是什么、模型文件在哪
- [ ] 我能说清为什么代码只改 `baseURL` 和 `model`
- [ ] 我能说清 7B 模型需要多少内存
- [ ] 我能说清本地模型和云端模型的三个主要差距

## B. 实操

- [ ] 我跑通了一个本地模型，能正常对话
- [ ] 我用 `ollama list` / `ollama ps` 看过状态
- [ ] 我改过代码并成功调用本地模型
- [ ] 我测过响应时间和并发
- [ ] 我用 `ss -tnp` 验证过没有外部连接

## C. 排错

- [ ] 我看到 `model not found` 知道是模型目录没搬
- [ ] 我看到 `Killed` / `signal 9` 知道是 OOM
- [ ] 我看到 `OPENAI_API_KEY ... missing` 知道要填任意非空值
- [ ] 我看到 `Request timed out` 知道要调大 timeout 或改流式

## D. 交付

- [ ] `03-练习代码/` 里有改好的 `llm-client.js`
- [ ] 有带 ollama 的 compose 片段
- [ ] 有模型测试记录（含真实耗时）
- [ ] 验收标准写了 4 条以上可测量的

## E. 笔记

- [ ] `02-笔记/NOTES.md` 填完
- [ ] 我记录了真实性能数据
- [ ] 我能用三句话向客户解释效果差距

## 本节课要能说出口的一句话

> **本地模型买到的是"数据不出门"，代价是"效果打折扣"。这两句话必须一起说。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| `ollama: command not found` | 没装或没在 PATH | 装到 `/usr/local/bin` |
| `model not found` | 模型文件没搬 | 解压 models 到 `OLLAMA_MODELS` |
| `i/o timeout` pulling | 内网无出口 | 离线搬模型 |
| `Killed` / `signal 9` | 内存不足 | 加内存或换小模型 |
| 回答特别慢 | 纯 CPU 推理 | 正常，或加显卡 |
| `OPENAI_API_KEY missing` | key 为空 | 填 `ollama` |
| `Request timed out` | 默认 60 秒 | 调到 180 秒 |
| 404 on `/chat/completions` | baseURL 少了 `/v1` | 改成 `.../v1` |
| 长文档答"未提及" | 上下文被截断 | 提高 `num_ctx` 或做 RAG |
| 编造条款号 | 7B 常见问题 | prompt 加禁令 + 抽测 |
| 模型反复加载 | `KEEP_ALIVE` 太短 | 设 30m |
| 容器里 `ollama list` 失败 | 目录权限不对 | `chown -R 1000:1000` |
| 显存够但用 CPU | 驱动没装 | 装 NVIDIA 驱动，或接受 CPU |

---

## 下一节课要带什么

第 236 节课讲权限交接。你需要带着：

```text
一个能跑的完整环境（app + db + nginx + ollama）
所有账号密码的清单
你自己在系统里留下的所有账号和密钥
```

**第 236 节课要做的第一件事，是把你自己的痕迹清理干净。**
