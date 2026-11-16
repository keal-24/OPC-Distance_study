# 第 212 节课：远程连接——SSH 与密钥登录

> **上一节课你只确认了"22 端口通"，没真的进去。**
> 这节课要真正走进那台机器，然后把"密码"这条门永久焊死，只留钥匙。
> **这节课有一个操作能让你半小时内进不去自己的服务器。** 看到 ⚠️ 就停下来读两遍。

**建议用时**：110 分钟
**你需要先完成**：第 211 节课（服务器状态"运行中"，知道公网 IP，`ssh -o ConnectTimeout=8` 能看到 `Are you sure...`）

---

# 第 0 步：为什么登录这件事值得一节课（10 分钟）

## 0.1 你现在会什么

你有一台机器、一个 IP、一个 root 密码。

**你还没进去过。**

**没进去过 = 这台机器对你来说只是一串数字。**

## 0.2 你以后会遇到什么

```text
① "服务器上有没有装 node？" —— 你得进去看
② "帮我重启一下服务" —— 你得进去敲
③ "日志在哪？" —— 你得进去找
④ "我密码忘了" —— 你得用另一种方式进去
⑤ "怎么有人在我机器上跑挖矿？" —— 你得从登录日志里看出来
```

**这五件事，全都要先进得去。**

**进不去 = 后面六节课全部为零。**

## 0.3 今天要建立的三个概念

```text
① SSH —— 用一根加密的管子，从你的电脑连到那台机器
② 密钥对 —— 一把锁（公钥，可以给全世界）和一把钥匙（私钥，只在你手里）
③ authorized_keys —— 服务器上那个"允许谁进来"的名单文件
```

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 登录过程记录 + 锁死演练 |
| `ssh-笔记.md` | `03-练习代码` | 你自己建：别名、密钥路径、验证命令 |
| 密钥对 | `C:\Users\你\.ssh\` | `id_ed25519` + `id_ed25519.pub` |
| 别名 | `C:\Users\你\.ssh\config` | `ssh myserver` 能进去 |

**注意最后两行。** 这节课的成果不在课程仓库里，**在你电脑的用户目录里**。

---

# 开工卡：这一节在哪台机器、哪个目录做

> **每节开始前先读这张卡。** 环境和你的实际情况不一致，就先解决环境，别往下看。

| 问题 | 答案 |
|---|---|
| **在哪台机器** | **你的 Windows 电脑（发起连接）+ 刚买的服务器（接受连接）。** |
| **用哪个终端** | **Git Bash。** 用它自带的 `ssh` 和 `ssh-keygen`。<br>**第一次登录要输密码 —— 输密码时屏幕上什么都不显示，包括星号。这是正常的，盲打完回车。** |
| **现在在哪个目录** | <code>mkdir -p ~/.ssh && cd ~/.ssh</code> |
| **本节新建什么** | `id_ed25519` / `id_ed25519.pub`（密钥对）<br>`config`（别名，让 `ssh myserver` 就能进）<br>`ssh-笔记.md`（放回 `第02节课/03-练习代码/`） |

## 开工前先跑这一条

确认你没站错地方：

```bash
ls -la ~/.ssh/
```

**应该看到：**

**两种结果都对：**

```text
# 情况一：已经有密钥（很多教程让你生成过）
id_ed25519
id_ed25519.pub
known_hosts

# 情况二：空的（或目录刚建）
total 0
```

## 如果不对

**已经有 `id_rsa`（老的 RSA 密钥）** → 不用删，这一节会新建 `id_ed25519`，两个可以共存。

---

# 第 1 步：第一次登录（20 分钟）

## 1.1 打开 Git Bash

**操作：**

1. Windows 开始菜单搜 `Git Bash`；
2. 打开。

**你应该看到一个黑窗口，光标在等。**

**为什么用 Git Bash 不用 PowerShell：**

```text
① ssh、ssh-keygen、ssh-copy-id 三个命令它都自带
② 路径写法是 Linux 风格（/c/Users/...），和服务器一致
③ 复制粘贴、字体、颜色都比 PowerShell 顺手
```

**PowerShell 也能用**（Windows 10 以后自带 OpenSSH），但 `ssh-copy-id` 可能没有，要手动做第 5.3 节那一步。

**这一节课件统一用 Git Bash。**

## 1.2 敲第一条命令

```bash
ssh root@47.98.xx.xx
```

**拆开读：**

```text
ssh      一个程序，意思是 "secure shell"，安全地连过去
root     你要用哪个账号登录（root 是最高权限账号）
@        分隔符，"以 root 的身份登录 @ 后面那台机器"
47.98.xx.xx   你的服务器公网 IP（换成你自己的）
```

## 1.3 第一次会问你一个问题

**应该看到：**

```text
The authenticity of host '47.98.xx.xx' can't be established.
ED25519 key fingerprint is SHA256:AbCdEf1234567890abcdefGHIJKLmnopqrstuv.
This key is not known by any of the hosts you have connected to.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `The authenticity of host ... can't be established` | "这台机器我不认识" |
| `ED25519 key fingerprint is SHA256:...` | 这台机器的"指纹"，一串哈希 |
| `This key is not known ...` | 你以前没连过它，我这儿没记录 |
| `Are you sure you want to continue connecting` | 你确定要连吗 |

**这是什么机制：**

**SSH 在防"中间人"。** 它要确认"你连的这台机器，真的是你以为的那台"，而不是别人伪装的。

**第一次连，它当然不认识。** 所以你确认一次，它就把指纹记下来。

**记在哪：**

```text
C:\Users\你\.ssh\known_hosts
```

**以后每次连，它都拿这个文件里的指纹去比对。对不上就报警。**

## 1.4 这里有个坑：要输全 `yes`

**操作：** 输入 `yes`，回车。

**⚠️ 不要只输 `y`。**

**只输 `y` 会看到：**

```text
Please type 'yes' or 'no':
```

**为什么：**

因为这个问题有第三个选项（`[fingerprint]`，让你先看指纹）。只接受 `y` 的话会有歧义，所以 OpenSSH 要求输完整的 `yes`。

**这是个很小的坑，但新手平均在这里卡 30 秒。**

**输 `yes` 之后：**

```text
Warning: Permanently added '47.98.xx.xx' (ED25519) to the list of known hosts.
root@47.98.xx.xx's password:
```

**第一行什么意思：**

```text
Permanently added   → 永久加入（写进 known_hosts 了）
'47.98.xx.xx'       → 哪台机器
(ED25519)           → 用的是哪种密钥算法
```

**以后不再问你这个问题，就是因为这一行。**

## 1.5 输密码：屏幕什么都没有，这是正常的

**`root@47.98.xx.xx's password:` 后面，你开始打字。**

**你会看到：**

```text
root@47.98.xx.xx's password:
```

**光标不动，一个星号都没有，一个字都不显示。**

**这是 Linux 的设计，不是坏了。**

**为什么这样设计：**

```text
如果显示 ******，旁边的人能数出你有几位密码。
如果显示字符，旁边的人直接就看到密码了。
所以：一个都不显示。
```

**规则：**

```text
盲打完你的密码，直接按回车。
打错了？回车，它会让你重来。
```

**⚠️ 不要做这两件事：**

```text
❌ 以为键盘坏了，反复敲，敲了一堆字符进去
❌ 用退格键"修正"你以为打错的地方（其实你根本看不见打了什么）
```

**如果你怀疑打错了：** 按 `Ctrl + U` 清空当前行，重新打。或者直接回车让它失败，重来一次。

## 1.6 登录成功长什么样

**密码对了之后，屏幕会刷出一大段：**

```text
Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-105-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/pro

  System information as of Mon Nov 16 09:12:33 CST 2026

  System load:  0.0               Processes:             102
  Usage of /:   12.3% of 39.51GB  Users logged in:       0
  Memory usage: 18%               IPv4 address for eth0: 10.0.0.12
  Swap usage:   0%

Expanded Security Maintenance for Applications is not enabled.

0 updates can be applied immediately.

Last login: Mon Nov 16 09:05:11 2026 from 113.xx.xx.xx
root@VM-0-12-ubuntu:~#
```

**逐行读：**

| 行 | 意思 | 你要注意什么 |
|---|---|---|
| `Welcome to Ubuntu 22.04.4 LTS` | 系统版本 | 是不是 22.04？不是说明镜像选错了 |
| `System load: 0.0` | 负载，0 表示很闲 | 长期超过 2 说明 CPU 不够 |
| `Usage of /: 12.3% of 39.51GB` | 系统盘用了多少 | 超过 85% 要清理日志 |
| `Memory usage: 18%` | 内存用了多少 | 长期超过 90% 要考虑加 swap |
| `Swap usage: 0%` | 交换分区 | **现在是 0，下节课要给它加上** |
| `IPv4 address for eth0: 10.0.0.12` | **内网** IP | 这不是公网 IP，别搞混 |
| `Last login: ... from 113.xx.xx.xx` | 上次谁从哪登的 | **不是你？有人进来过** |
| `root@VM-0-12-ubuntu:~#` | 提示符 | 你现在在服务器里了 |

**两个容易误解的点：**

**第一：`10.0.0.12` 不是公网 IP。**

云服务器有两张网卡视角：内网（`10.x`、`172.x`）和公网。你从外面连的是公网 IP，机器自己看到的是内网 IP。

**第二：`Last login` 可能是空的。**

第一次登录会显示 `Last login: ... from ...`，如果之前没人登过，这行可能不出现，或者显示创建时间。**这不是错误。**

## 1.7 第一次成功之后，先退出来

```bash
exit
```

**应该看到：**

```text
logout
Connection to 47.98.xx.xx closed.
```

**再连一次：**

```bash
ssh root@47.98.xx.xx
```

**这次不会再问 `Are you sure`，直接到 `password:`。**

**为什么：** 指纹已经写进 `known_hosts` 了。

**这一遍的意义：让你确认"我记住的是这台机器，不是每次都要重新确认"。**

---

# 第 2 步：认识这个新环境（15 分钟）

## 2.1 读懂提示符

**登录后你会看到：**

```text
root@VM-0-12-ubuntu:~#
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `root` | 当前用户 |
| `@` | 分隔符 |
| `VM-0-12-ubuntu` | 主机名（云厂商起的） |
| `:` | 分隔符 |
| `~` | 当前目录。`~` 就是 `/root`（root 用户的家目录） |
| `#` | **你是 root**（超级用户） |
| `$` | 普通用户（如果你看到 `$`，说明权限不够） |

**`#` 和 `$` 的区别非常重要：**

```text
#  → root，什么都能删，包括系统
$  → 普通用户，删系统文件会被拒绝
```

**你以后搜教程，看到提示符是 `$`，说明那一步不需要 root，照抄命令时不要带 `$` 本身。**

**同样，`#` 也不是命令的一部分。**

## 2.2 跑几条命令，看看这台机器

**先看你在哪：**

```bash
pwd
```

**应该看到：**

```text
/root
```

**`pwd` = print working directory，"打印当前工作目录"。Windows 的 `cd`（不带参数）效果类似。**

**看这个目录有什么：**

```bash
ls -la
```

**应该看到类似：**

```text
total 28
drwx------  4 root root 4096 Nov 16 09:12 .
drwxr-xr-x 19 root root 4096 Nov 16 09:12 ..
-rw-r--r--  1 root root 3106 Aug 10 09:12 .bashrc
-rw-r--r--  1 root root  161 Jul  9  2024 .profile
drwx------  2 root root 4096 Nov 16 09:12 .ssh
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `drwx------` | 权限。`d` = 目录，后面九位是权限 |
| `4` | 硬链接数（不用管） |
| `root root` | 属主、属组 |
| `4096` | 大小（字节） |
| `Nov 16 09:12` | 修改时间 |
| `.ssh` | 文件名。**以 `.` 开头的是隐藏文件** |

**为什么有些文件平时看不到：**

`ls` 不带 `-a` 时不显示 `.` 开头的文件。**`.ssh`、`.env`、`.git` 都是隐藏的。**

**这条对你很重要：** 后面你 `ls` 看不到 `.env`，会以为文件没建成功。**加 `-a`。**

**看硬盘：**

```bash
df -h
```

**应该看到：**

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        40G  4.8G   33G  13% /
tmpfs           935M     0  935M   0% /dev/shm
tmpfs           374M  1.1M  373M   1% /run
```

**逐列读：**

| 列 | 意思 |
|---|---|
| `Filesystem` | 哪个磁盘/分区 |
| `Size` | 总容量 |
| `Used` | 已用 |
| `Avail` | 可用 |
| `Use%` | **使用率，这列最重要** |
| `Mounted on` | 挂在哪（`/` 就是根目录） |

**`h` 是什么：** human-readable，把字节换成 G/M，人看得懂。

**看内存：**

```bash
free -h
```

**应该看到：**

```text
               total        used        free      shared  buff/cache   available
Mem:           1.9Gi       347Mi       1.1Gi       1.0Mi       464Mi       1.4Gi
Swap:             0B          0B          0B
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Mem:` | 物理内存。2G 的机器显示 1.9Gi，正常（系统占用一部分） |
| `Swap:` | **交换分区，现在是 0 —— 下节课要加 2G** |
| `available` | 真正"还能用"的量，比 `free` 更准 |

**`buff/cache` 是什么：** 系统拿空闲内存做缓存，随时可以吐出来。**所以不要看到 `free` 很小就慌，看 `available`。**

**看 CPU 和进程：**

```bash
nproc
```

**应该看到：**

```text
2
```

**这就是"2 核"的那个 2。**

**看谁在跑：**

```bash
ps aux
```

**会刷出一大堆。** 你只需要记住这条：

```bash
ps aux | grep node
```

**现在应该看到：**

```text
root        1234  0.0  0.0   8452   892 pts/0    S+   09:20   0:00 grep --color=auto node
```

**只有一行 `grep` 自己，说明没有 node 在跑。**

**这一条以后天天用。** 第 215 节判断"程序到底起没起"就靠它。

> `|` 是什么：管道。把前一个命令的输出，交给后一个命令去过滤。你在 Windows 上没怎么用过，Linux 上到处都是。

## 2.3 复制粘贴

**Git Bash：**

```text
选中 = 自动复制（不用按 Ctrl+C）
右键 = 粘贴
```

**PowerShell：**

```text
选中 + 右键 = 复制
右键 = 粘贴
```

**⚠️ 在 SSH 里不要用 `Ctrl + C` 复制。**

因为 `Ctrl + C` 在终端里的意思是**中断当前命令**。

**你在服务器里按 `Ctrl+C`，会直接杀掉正在跑的东西**（比如正在 `npm ci`）。

## 2.4 中文显示成乱码

**如果你 `cat` 一个中文文件，看到：**

```text
æ–‡ä»¶å†…å®¹
```

**原因是编码不一致（UTF-8 被当成别的编码解）。**

**两个解法：**

```text
① Git Bash 右键 → Options → Text → Locale 改成 zh_CN，Character set 改成 UTF-8
② 不要 cat 中文文件，用 nano 打开看
```

**这一周你会遇到的概率不高，因为服务器上的配置文件基本都是英文。** 但 `.env` 里可能有中文注释，记住这条。

---

# 第 3 步：为什么密码登录必须废掉（15 分钟）

## 3.1 先看一眼现实

**在服务器上跑：**

```bash
grep "Failed password" /var/log/auth.log | wc -l
```

**应该看到类似：**

```text
1863
```

**这才开机几个小时。**

**看具体是谁在试：**

```bash
grep "Failed password" /var/log/auth.log | tail -5
```

**应该看到：**

```text
Nov 16 09:31:02 VM-0-12-ubuntu sshd[2451]: Failed password for root from 45.xx.xx.xx port 51234 ssh2
Nov 16 09:31:03 VM-0-12-ubuntu sshd[2453]: Failed password for invalid user admin from 61.xx.xx.xx port 40221 ssh2
Nov 16 09:31:04 VM-0-12-ubuntu sshd[2455]: Failed password for root from 45.xx.xx.xx port 51236 ssh2
Nov 16 09:31:05 VM-0-12-ubuntu sshd[2457]: Failed password for invalid user test from 103.xx.xx.xx port 33445 ssh2
Nov 16 09:31:06 VM-0-12-ubuntu sshd[2459]: Failed password for root from 45.xx.xx.xx port 51238 ssh2
```

**逐字段读：**

| 字段 | 意思 |
|---|---|
| `Nov 16 09:31:02` | 时间，**一秒钟一条** |
| `VM-0-12-ubuntu` | 你的主机名 |
| `sshd[2451]` | ssh 服务的进程号和 PID |
| `Failed password` | 密码错了 |
| `for root` | 在试 root 账号 |
| `for invalid user admin` | **在试一个根本不存在的账号**（说明是瞎猜的用户名） |
| `from 45.xx.xx.xx` | 攻击者 IP |
| `port 51234` | 对方的源端口（每次都变，没意义） |

**为什么每秒钟都有：**

```text
因为这是全自动的。
有人写了个程序，把全世界的 IP 段扫一遍，逐个试常见密码。
它不在乎你是谁，也不睡觉。
```

**试的密码是什么：**

```text
123456 / password / admin / root / 111111 / qwerty / 12345678 / abc123 ...
```

**这份字典有几十万条。**

## 3.2 结论

**只要你的服务器开着 22 端口、允许密码登录，被爆破就只是时间问题。**

**密码再复杂也没用吗？**

```text
不是"没用"，是"不够"。
强密码能撑很久，但：
① 你不能保证每个接手的人都设强密码
② 密码可能在别处泄露（你在别的网站用过同一个）
③ 爆破是常态，你为什么要把自己放在赌桌上
```

**密钥登录为什么能挡掉 99%：**

```text
爆破程序只会猜密码。
它没有你的私钥文件，所以连"猜"的机会都没有。
```

**这就是这节课的重点。**

---

# 第 4 步：生成你的密钥对（15 分钟）

## 4.1 先搞清楚谁拿什么

**这是最容易搞反的地方，先记这句：**

> **公钥是锁，装在服务器上；私钥是钥匙，永远留在你自己电脑上。**

```text
你的电脑                          服务器
┌──────────────┐                ┌─────────────────────┐
│ id_ed25519   │  ← 私钥，钥匙    │ authorized_keys     │
│ （绝不外传）  │                │ 里面放的是你的公钥    │
│              │                │ （锁）               │
│ id_ed25519.pub│ ──公钥，发过去──→│                     │
└──────────────┘                └─────────────────────┘
```

**登录时发生什么：**

```text
① 你敲 ssh root@IP
② 服务器说："你证明一下你有钥匙"
③ 你的电脑用私钥算一个签名
④ 服务器用 authorized_keys 里的公钥验这个签名
⑤ 对上了 → 放行
```

**关键：私钥从头到尾没有离开你的电脑。** 它只是"参与计算"，不是"发送过去"。

**所以：把私钥拷到服务器上，等于把钥匙插在锁上。**

## 4.2 生成

**操作：在 Git Bash 里（不是服务器里）跑：**

```bash
ssh-keygen -t ed25519 -C "my-laptop-2026"
```

**拆开读：**

```text
ssh-keygen       生成密钥的工具
-t ed25519       类型用 ed25519（比 rsa 更短、更快、更安全）
-C "..."         注释，会写进公钥末尾，用来区分"这是哪台电脑的钥匙"
```

**为什么用 ed25519 不用 rsa：**

```text
rsa 要 4096 位才够安全，生成慢、文件大
ed25519 更短更安全，现代系统全支持
旧的教程都写 -t rsa，那是十年前的习惯
```

**⚠️ 如果你的服务器系统很老（Ubuntu 16 以前），可能不支持 ed25519。** 那就退回 `-t rsa -b 4096`。你买的是 22.04，不用担心。

## 4.3 它会问你三个问题

**第一个问题：**

```text
Generating public/private ed25519 key pair.
Enter file in which to save the key (/c/Users/你/.ssh/id_ed25519):
```

**直接回车。** 用默认路径。

**为什么用默认路径：**

```text
① ssh 默认就去那儿找，不用每次 -i 指定
② 你以后配别名、写脚本，都不用管路径
```

**第二个问题：**

```text
Enter passphrase (empty for no passphrase):
```

**这是"密钥的密码"，不是服务器的密码。**

**你有两个选择：**

| 选择 | 好处 | 代价 |
|---|---|---|
| 直接回车（空） | 登录时一下都不用输 | 别人拿到你的电脑文件就能登 |
| 设一个密码 | 私钥文件被偷了也用不了 | **每次登录都要输一次** |

**建议：**

```text
学习阶段的台式机/家里电脑 → 可以空（回车）
笔记本、公司电脑、可能丢的设备 → 设一个
```

**这节课默认你按回车（空）。** 后面第 7 步的验证会简单很多。

**第三个问题：**

```text
Enter same passphrase again:
```

**再输一遍。刚才按了回车，这里也按回车。**

**成功之后：**

```text
Your identification has been saved in /c/Users/你/.ssh/id_ed25519
Your public key has been saved in /c/Users/你/.ssh/id_ed25519.pub
The key fingerprint is:
SHA256:AbCdEf1234567890abcdefGHIJKLmnopqrstuv my-laptop-2026
The key's randomart image is:
+--[ED25519 256]--+
|      .o+        |
|     . +.o       |
|    . o = .      |
|     . + =       |
|      . S o      |
|       . + .     |
|        . o      |
|         .       |
|                 |
+----[SHA256]-----+
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Your identification has been saved in ...` | **私钥**存这里了（没有 `.pub` 后缀） |
| `Your public key has been saved in ...pub` | **公钥**存这里了 |
| `The key fingerprint is:` | 指纹，用来核对"这两把是不是一对" |
| `randomart image` | 把指纹画成图，人眼比对更快（不用管） |

**那个 `randomart` 图案不用记。** 它是给"电话里核对指纹"用的，你用不上。

## 4.4 文件到底在哪

**Windows 上就是这里：**

```text
C:\Users\你\.ssh\
```

**在 Git Bash 里看：**

```bash
ls -la ~/.ssh
```

**应该看到：**

```text
total 13
drwxr-xr-x 1 你 197609    0 Nov 16 09:40 .
drwxr-xr-x 1 你 197609    0 Nov 16 09:40 ..
-rw------- 1 你 197609  411 Nov 16 09:40 id_ed25519
-rw-r--r-- 1 你 197609   99 Nov 16 09:40 id_ed25519.pub
-rw-r--r-- 1 你 197609  178 Nov 16 09:12 known_hosts
```

**逐行读：**

| 文件 | 权限 | 是什么 |
|---|---|---|
| `id_ed25519` | `-rw-------` | **私钥**。只有你能读，这是对的 |
| `id_ed25519.pub` | `-rw-r--r--` | **公钥**。谁看都无所谓 |
| `known_hosts` | `-rw-r--r--` | 你连过的机器的指纹（第 1.3 节写进去的） |

**⚠️ 如果你看到私钥权限是 `-rw-rw-rw-`（谁都能读），立刻改：**

```bash
chmod 600 ~/.ssh/id_ed25519
```

**为什么：** 有些 ssh 版本会直接拒绝使用"权限过宽"的私钥，报 `Permissions 0644 for ... are too open`。

## 4.5 看一眼两个文件的内容

**公钥：**

```bash
cat ~/.ssh/id_ed25519.pub
```

**应该看到一行：**

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCD my-laptop-2026
```

**拆开读：**

```text
ssh-ed25519      算法名
AAAAC3Nza...     真正的公钥内容（一长串 base64）
my-laptop-2026   你 -C 写的注释
```

**这三段组成"一行"，中间用空格隔开。**

**私钥：**

```bash
head -2 ~/.ssh/id_ed25519
```

**应该看到：**

```text
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
```

**看到 `PRIVATE KEY` 四个字就要警觉。**

**规则：**

```text
✅ 公钥（.pub）可以贴到任何地方：GitHub、服务器、聊天窗口
❌ 私钥永远不贴、不发、不传、不进仓库
```

**⚠️ 如果哪天你把私钥贴到了聊天窗口 / 截图里 / 仓库里：**

```text
立刻重新生成一对（重复第 4.2 节），
把新的公钥装到服务器，
把旧的公钥从 authorized_keys 里删掉。
```

**私钥不像密码能"改"，只能"换"。**

---

# 第 5 步：把公钥装到服务器上（15 分钟）

## 5.1 一条命令搞定

```bash
ssh-copy-id root@47.98.xx.xx
```

**会发生什么：**

```text
/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "/c/Users/你/.ssh/id_ed25519.pub"
The authenticity of host '47.98.xx.xx' can't be established.
...
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed
/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys
root@47.98.xx.xx's password:
```

**这里要输一次密码（最后一次）。**

**然后：**

```text
Number of key(s) added: 1

Now try logging into the machine, with:   "ssh 'root@47.98.xx.xx'"
and check to make sure that only the key(s) you wanted were added.
```

**`Number of key(s) added: 1` 就是成功。**

**如果显示 `0`：**

```text
说明这把公钥已经在服务器上了，不用重复装。
```

## 5.2 它到底做了什么

`ssh-copy-id` 干了三件事：

```text
① 用密码登录一次服务器
② 在你的 ~/.ssh/ 下建目录（如果没有）
③ 把你的公钥追加到 ~/.ssh/authorized_keys 末尾
```

**注意"追加"（append）两个字。**

```text
它不是覆盖，是在文件末尾加一行。
所以你可以装很多把公钥（家里电脑、公司电脑、笔记本各一把）。
```

**这也是为什么你的公钥后面那个注释有用：** 三个月后 `authorized_keys` 里有五行，你靠注释才知道哪行是哪台电脑。

## 5.3 如果没有 `ssh-copy-id`

**PowerShell、或者很老的 Git for Windows 可能没有这个命令：**

```text
ssh-copy-id: command not found
```

**手动做同样的事：**

```bash
cat ~/.ssh/id_ed25519.pub | ssh root@47.98.xx.xx "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

**拆开读：**

```text
cat ~/.ssh/id_ed25519.pub          读你本地的公钥
|                                  把输出交给后面
ssh root@IP "..."                  在服务器上执行引号里的命令
mkdir -p ~/.ssh                    建 .ssh 目录（已存在就不报错）
chmod 700 ~/.ssh                   目录权限：只有本人能进
cat >> ~/.ssh/authorized_keys      追加重定向（>> 是追加，> 是覆盖）
chmod 600 ~/.ssh/authorized_keys   文件权限：只有本人能读写
```

**⚠️ 注意 `>>` 不是 `>`。**

```text
>> 追加，不会删掉已有的公钥
>  覆盖，会把你之前所有的公钥清空 —— 包括你现在正在用的那把
```

**这是个小细节，但用 `>` 的后果是：你把别的设备的登录权限删了。**

## 5.4 权限为什么这么讲究

**SSH 有个安全机制叫 `StrictModes`，默认开着。**

**它会检查：**

```text
① ~/.ssh 目录的属主必须是你自己
② ~/.ssh 目录权限不能是 777/755（别人能写）
③ authorized_keys 不能是"组可写"或"其他人可写"
```

**不满足就拒绝用密钥登录，日志里写：**

```text
Authentication refused: bad ownership or modes for directory /root/.ssh
```

**所以 `700` 和 `600` 不是形式主义，是硬要求。**

| 对象 | 权限 | 意思 |
|---|---|---|
| `~/.ssh` | `700` | 只有我能进 |
| `authorized_keys` | `600` | 只有我能读我写 |
| 私钥 `id_ed25519` | `600` | 只有我能读 |

**记不住数字？记这个：**

```text
目录 700，文件 600。
```

## 5.5 验证：这次不该问密码了

**操作：新开一个 Git Bash 窗口（不要关旧的），跑：**

```bash
ssh root@47.98.xx.xx
```

**应该看到：**

```text
Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-105-generic x86_64)
...
Last login: Mon Nov 16 09:52:10 2026 from 113.xx.xx.xx
root@VM-0-12-ubuntu:~#
```

**没有 `password:` 这一行。**

**这就是成功。**

**如果你设了 passphrase，会看到：**

```text
Enter passphrase for key '/c/Users/你/.ssh/id_ed25519':
```

**这也是成功，只是要输"钥匙的密码"。**

**如果还是问服务器密码：**

```text
说明公钥没装成功 / 权限不对 / 服务器没开公钥认证。
先看第 8 步的错误 6。
```

## 5.6 一个更强的验证方法

**在本地跑（不要登进去）：**

```bash
ssh -o BatchMode=yes -o ConnectTimeout=8 root@47.98.xx.xx "echo 密钥登录成功"
```

**应该看到：**

```text
密钥登录成功
```

**`BatchMode=yes` 是什么：**

```text
禁止一切交互提问。
如果它需要密码，会直接失败，而不是停下来等你输。
```

**为什么这个方法更可靠：**

```text
它能证明"完全不靠密码、不靠人工输入，也能进去"。
你以后写脚本、配 CI，用的就是这种方式。
```

**⚠️ 如果这一步失败，绝对不要进入第 7 步。**

---

# 第 6 步：配个别名，少打一堆字（10 分钟）

## 6.1 为什么需要别名

**现在你每次要打：**

```bash
ssh root@47.98.xx.xx
```

**一天打二十次，就是二十次输入 IP。**

**配完别名之后：**

```bash
ssh myserver
```

**而且换 IP 的时候只改一个文件。**

## 6.2 建配置文件

**文件位置：**

```text
C:\Users\你\.ssh\config
```

**注意：文件名就叫 `config`，没有后缀。**

**在 Git Bash 里：**

```bash
nano ~/.ssh/config
```

**如果提示 `nano: command not found`（Git Bash 没带 nano），用这个：**

```bash
notepad ~/.ssh/config
```

**会弹出一个记事本窗口。** 如果提示"文件不存在，是否新建"，点"是"。

## 6.3 写进去

```text
Host myserver
    HostName 47.98.xx.xx
    User root
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
```

**逐行读：**

| 行 | 意思 |
|---|---|
| `Host myserver` | **你起的名字**，随便叫，`myserver`、`prod`、`chat` 都行 |
| `HostName 47.98.xx.xx` | 真实 IP（**换服务器只改这一行**） |
| `User root` | 用哪个账号登 |
| `IdentityFile ~/.ssh/id_ed25519` | 用哪把私钥 |
| `ServerAliveInterval 60` | 每 60 秒发个心跳，防止"半天不操作就断线" |

**缩进用空格，不要用 Tab。**

**为什么：**

```text
config 的语法是"缩进的行属于上面那个 Host"。
Tab 在有些编辑器里会被转成奇怪的东西，
用 4 个空格最保险。
```

**`~` 是什么：** 在你的电脑上指 `C:\Users\你`，在服务器上指 `/root`。**它是"当前用户的家目录"。**

## 6.4 验证

```bash
ssh myserver
```

**应该直接进：**

```text
Welcome to Ubuntu 22.04.4 LTS ...
root@VM-0-12-ubuntu:~#
```

**如果报这个：**

```text
Bad owner or permissions on /c/Users/你/.ssh/config
```

**说明 config 的权限太宽（Windows 上少见，但 Git Bash 偶尔会遇到）。**

**修：**

```bash
chmod 600 ~/.ssh/config
```

**如果报这个：**

```text
Could not resolve hostname myserver: Name or service not known
```

**说明 ssh 没读到你的 config。** 检查：

```text
① 文件名是不是 config（不是 config.txt）
② 路径是不是 C:\Users\你\.ssh\config
③ Host 那一行有没有拼错
```

**⚠️ Windows 记事本容易把文件存成 `config.txt`。**

**在资源管理器里打开"显示文件扩展名"，确认一下。**

## 6.5 再配一个"跳板"习惯

**你现在有两台机器的时候才会用到，但先记着：**

```text
Host prod
    HostName 47.98.xx.xx
    User root
    IdentityFile ~/.ssh/id_ed25519
```

**以后一台测试、一台正式，就写两个 Host。**

```bash
ssh prod
ssh test
```

**别在生产机器上试新命令。** 这个习惯从你有第二台机器那天开始。

---

# 第 7 步：⚠️ 关掉密码登录（20 分钟，最危险的一步）

## 7.1 先读这一段，不要跳

**这一步做完，服务器只认密钥。密码彻底失效。**

**如果你在关掉之前没确认密钥能用，你会：**

```text
① 关掉密码登录
② 重启 ssh 服务
③ 当前窗口还能用（旧会话没断）
④ 你一关窗口，再连 → Permission denied (publickey)
⑤ 密码也登不上 → 你被锁在门外
```

**这是这一周唯一一个"做错了只能去云控制台救"的操作。**

## 7.2 三道检查，全过才允许继续

**检查一：密钥登录能进（第 5.5 节做过）**

```bash
ssh root@47.98.xx.xx
```

**不问密码，直接进。**

**检查二：非交互也能进（第 5.6 节做过）**

```bash
ssh -o BatchMode=yes root@47.98.xx.xx "echo ok"
```

**输出 `ok`。**

**检查三：现在开着两个窗口**

```text
窗口 A：已经登录在服务器里（一会儿要在这里改配置）
窗口 B：本地，用来测试
```

**为什么必须留一个已登录的窗口：**

```text
万一改错了，窗口 A 还连着，你可以改回来。
窗口 A 一关，你就只能去云控制台了。
```

**⚠️ 三个检查缺一个，都不要往下走。**

## 7.3 备份配置

**在窗口 A（服务器里）跑：**

```bash
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
```

**应该没有任何输出。**

**为什么"没有输出"是好事：**

```text
Linux 的规矩：成功就不说话，失败才嚷嚷。
这条规则你会遇到很多次。
```

**确认备份在：**

```bash
ls -l /etc/ssh/sshd_config*
```

**应该看到：**

```text
-rw-r--r-- 1 root root 3222 Nov 16 09:12 /etc/ssh/sshd_config
-rw-r--r-- 1 root root 3222 Nov 16 10:05 /etc/ssh/sshd_config.bak
```

**两个文件大小一样 = 备份成功。**

## 7.4 打开配置文件

```bash
nano /etc/ssh/sshd_config
```

**nano 的五个键，先记牢：**

```text
Ctrl + O    保存（字母 O，不是零）
Enter       确认文件名
Ctrl + X    退出
Ctrl + W    搜索
Ctrl + K    删掉当前行
```

**在 nano 里找这三行：**

```text
#PasswordAuthentication yes
#PubkeyAuthentication yes
#PermitRootLogin prohibit-password
```

**注意：** 前面的 `#` 表示"这行被注释掉了，用的是默认值"。

## 7.5 改成这样

**用 `Ctrl + W` 搜 `PasswordAuthentication`，把它改成：**

```text
PasswordAuthentication no
```

**再搜 `PubkeyAuthentication`：**

```text
PubkeyAuthentication yes
```

**再搜 `PermitRootLogin`：**

```text
PermitRootLogin prohibit-password
```

**三行都**不要**前面的 `#`。**

**改完的样子：**

```text
PubkeyAuthentication yes
PasswordAuthentication no
PermitRootLogin prohibit-password
```

**逐行读：**

| 配置 | 意思 | 为什么这么设 |
|---|---|---|
| `PubkeyAuthentication yes` | 允许用密钥登录 | 这是你唯一的进门方式，必须开 |
| `PasswordAuthentication no` | **禁止用密码登录** | 爆破程序从此无从下手 |
| `PermitRootLogin prohibit-password` | 允许 root 登录，但**只准用密钥** | 你只有一个账号，还得用 root |

**⚠️ 不要设成 `PermitRootLogin no`。**

**那会把 root 的 SSH 登录彻底关掉。** 你服务器上没有别的账号，等于把自己锁死。

**`prohibit-password` 是什么：** 允许 root 登录，但拒绝密码方式。"prohibit password" = 禁止密码。

**老版本里它叫 `without-password`，意思一样。** 22.04 用 `prohibit-password`。

## 7.6 保存退出

```text
Ctrl + O
Enter
Ctrl + X
```

**回到提示符 `root@VM-0-12-ubuntu:~#`。**

**确认改动生效了：**

```bash
grep -E "^(PasswordAuthentication|PubkeyAuthentication|PermitRootLogin)" /etc/ssh/sshd_config
```

**应该看到：**

```text
PubkeyAuthentication yes
PasswordAuthentication no
PermitRootLogin prohibit-password
```

**如果一行都没有：**

```text
说明你的改动前面还有 #，或者拼错了。
重新打开改。
```

## 7.7 先检查语法

```bash
sshd -t
```

**应该没有任何输出。**

**为什么必须跑这个：**

```text
sshd -t = test，只检查配置对不对，不重启。
配置有语法错，它会告诉你哪一行错。
```

**如果写错了，比如把 `no` 写成 `np`：**

```text
/etc/ssh/sshd_config line 58: Bad yes/no argument: np
```

**修完再跑一次，直到没有输出。**

**⚠️ 这一步没通过就 reload，SSH 会直接起不来。** 你当前窗口还能用，但一关就完了。

## 7.8 重载配置

```bash
systemctl reload ssh
```

**应该没有任何输出。**

**为什么用 `reload` 不用 `restart`：**

```text
reload  重新读配置，已有连接不断
restart 停掉再启动，所有连接断一下
```

**你是通过 SSH 连着这台机器的。** `restart` 有可能把你自己这条连接也断掉。

**`systemctl` 是什么：** Linux 的"服务管理器"。`systemctl reload ssh` = "让 ssh 服务重新读一下配置"。

**确认服务还活着：**

```bash
systemctl status ssh
```

**应该看到：**

```text
● ssh.service - OpenBSD Secure Shell server
     Loaded: loaded (/lib/systemd/system/ssh.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-11-16 10:12:44 CST; 30s ago
       Docs: man:sshd(8)
             man:sshd_config(5)
   Main PID: 2451 (sshd)
      Tasks: 1 (limit: 1100)
     Memory: 1.2M
        CPU: 8ms
     CGroup: /system.slice/ssh.service
             └─"sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups"
```

**只读一行：**

```text
Active: active (running)
```

**这是"活着"。** 看到 `failed` 或 `inactive` 就出事了。

**`q` 退出这个界面。** status 会占满屏幕，按 `q` 回到提示符。

## 7.9 验证密码真的进不来了

**⚠️ 这一步在窗口 B（本地）做，窗口 A 不要关。**

**先测密钥还能进：**

```bash
ssh -o BatchMode=yes root@47.98.xx.xx "echo 密钥正常"
```

**应该看到：**

```text
密钥正常
```

**再测密码进不来：**

```bash
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password root@47.98.xx.xx
```

**应该看到：**

```text
root@47.98.xx.xx: Permission denied (publickey).
```

**这一行就是你要的结果。**

**逐段读：**

| 部分 | 意思 |
|---|---|
| `Permission denied` | 拒绝 |
| `(publickey)` | **服务器只接受 publickey（公钥）这一种方式** |

**`(publickey)` 这个括号里的内容，是"服务器现在允许哪些登录方式"。**

```text
(publickey)                      → 只允许密钥（你要的状态）
(publickey,password)             → 密码还能用（没改成功）
(publickey,password,keyboard-interactive)  → 密码和键盘交互都开着
```

**这一行以后你在报错里会反复看到。看懂它，你就知道服务器到底开了什么。**

## 7.10 ⚠️ 如果你已经被锁死了

**症状：**

```text
ssh root@47.98.xx.xx
root@47.98.xx.xx: Permission denied (publickey).
```

**而你没有可用的私钥。**

**三条救命路，按顺序试：**

**第一条：云控制台的 VNC / 远程连接**

```text
腾讯云轻量：实例详情 → 右上角"登录" → VNC 登录
阿里云轻量：实例详情 → "远程连接" → VNC
```

**它是网页里的一块屏幕，直接连着你的服务器，不经过 SSH。**

**进去之后：**

```bash
nano /etc/ssh/sshd_config
# 把 PasswordAuthentication 改成 yes
systemctl reload ssh
```

**⚠️ VNC 的坑：**

```text
① 无法粘贴（只能手打，长密码会疯）
② 键盘映射可能不对（@ 和 " 常常打不出来）
③ 会话可能几分钟不用就断开
```

**第二条：控制台的"重置密码"**

```text
大部分云厂商支持在控制台重置 root 密码。
重置完，用密码登录（如果密码登录还开着）。
```

**但如果密码登录已经关了，重置密码也没用。** 还是得走 VNC。

**第三条：重装系统（最后手段）**

```text
控制台 → 重装系统 → 选 Ubuntu 22.04
```

**⚠️ 系统盘数据全没。** 你现在的机器上只有刚装的环境，损失不大。**但第 214 节之后就不能这么干了。**

**这件事的教训：**

```text
所有"会把自己关在门外"的操作，都必须先留一扇备用门。
SSH 的备用门 = 云控制台的 VNC。
```

---

# 第 8 步：故意犯七个错（30 分钟）

## 错误 1：输密码时以为键盘坏了

**操作：**

在 `password:` 后面，随便打几个字符，看屏幕。

**会怎样：**

```text
root@47.98.xx.xx's password:
```

**光标一动不动，什么也没有。**

**为什么：**

Linux 的终端不回显密码。**这是设计，不是故障。**

**怎么修：**

```text
盲打完，回车。
打错了就再回车一次重来。
怀疑打错想清空 → Ctrl + U
```

**这一条是新手第一大困惑，你现在知道了。**

## 错误 2：第一次提示输 `y` 而不是 `yes`

**操作：**

在 `Are you sure you want to continue connecting (yes/no/[fingerprint])?` 后面输 `y`。

**会怎样：**

```text
Please type 'yes' or 'no':
```

**光标还在等你。**

**为什么：**

因为选项有三个（`yes`、`no`、还有一个"看指纹"）。只认 `y` 会有歧义。

**怎么修：**

```text
输完整的 yes，回车。
```

**记住：不是 Y，不是 y，是小写的 yes。**

## 错误 3：改完配置不 `sshd -t` 就 reload

**操作：**

1. 打开 `sshd_config`；
2. 把 `PasswordAuthentication no` 故意写成 `PasswordAuthentication np`；
3. 直接 `systemctl reload ssh`。

**会怎样：**

```text
Job for ssh.service failed because the control process exited with error code.
See "systemctl status ssh.service" and "journalctl -xe" for details.
```

**然后 `systemctl status ssh`：**

```text
● ssh.service - OpenBSD Secure Shell server
     Loaded: loaded (/lib/systemd/system/ssh.service; enabled; vendor preset: enabled)
     Active: failed (Result: exit-code) since Mon 2026-11-16 10:30:12 CST; 5s ago
    Process: 2891 ExecStartPre=/usr/sbin/sshd -t (code=exited, status=255/EXCEPTION)
```

**`failed` 就是服务没起来。**

**为什么：**

`reload` 之前 systemd 会先跑一次 `sshd -t`。检查不过，整个 reload 失败，**服务进入 failed 状态**。

**注意：** 你当前这个窗口还连着（旧进程还没死透），但**新连接全进不来**。

**怎么修：**

**如果当前窗口还能用：**

```bash
cp /etc/ssh/sshd_config.bak /etc/ssh/sshd_config
sshd -t
systemctl restart ssh
```

**如果窗口已经关了：**

```text
只能走 VNC。
```

**教训：`sshd -t` 只要一行命令，能救你半小时。**

## 错误 4：密钥没验证就关密码登录（锁死演练）

**操作：**

1. 把 `~/.ssh/id_ed25519` 改名成 `id_ed25519.bak`（模拟"私钥丢了"）；
2. 此时密码登录已经关了；
3. 尝试 `ssh root@47.98.xx.xx`。

**会怎样：**

```text
root@47.98.xx.xx: Permission denied (publickey).
```

**密码也进不去：**

```text
root@47.98.xx.xx: Permission denied (publickey).
```

**为什么：**

```text
服务器只认公钥。
你没有能对上号的私钥。
密码方式被你自己关了。
```

**怎么修：**

```bash
mv ~/.ssh/id_ed25519.bak ~/.ssh/id_ed25519
ssh root@47.98.xx.xx
```

**恢复成功。**

**这个演练一定要做。** 它让你在"没真丢"的情况下体验一次被锁的感觉。

**然后想一个问题：**

> 如果这不是改名，而是你的笔记本真的丢了，你怎么办？

**答案是 VNC。现在就去云控制台找一下那个按钮在哪，别等出事才找。**

## 错误 5：把私钥拷到服务器上

**操作：**

**⚠️ 千万别真做。** 看完这段就行。

```text
scp ~/.ssh/id_ed25519 root@47.98.xx.xx:/root/
```

**会怎样：**

**表面上什么都不会发生。** 你甚至会觉得"这样更方便，服务器上也有钥匙了"。

**实际上：**

```text
① 私钥现在在服务器硬盘上
② 服务器被入侵 → 攻击者拿到私钥
③ 用这把私钥，他能登进你所有装了对应公钥的机器
④ 包括 GitHub（如果你把公钥加到了 GitHub）
```

**为什么错：**

```text
私钥的唯一价值是"只有你有"。
一旦它离开你的电脑，这个价值就归零了。
```

**怎么修：**

```bash
ssh root@47.98.xx.xx "rm /root/id_ed25519"
```

**然后重新生成一对新的，换掉旧的。**

## 错误 6：权限不对，密钥被拒绝

**操作：**

在服务器上故意把 `.ssh` 目录权限改成 755：

```bash
chmod 755 ~/.ssh
```

**然后在本地重连：**

```bash
ssh root@47.98.xx.xx
```

**会怎样：**

```text
root@47.98.xx.xx: Permission denied (publickey).
```

**明明密钥没问题，为什么进不去？**

**看服务器日志（如果还能用 VNC 或另一个会话进）：**

```bash
tail -5 /var/log/auth.log
```

**应该看到：**

```text
Nov 16 10:45:12 VM-0-12-ubuntu sshd[3012]: Authentication refused: bad ownership or modes for directory /root/.ssh
```

**逐段读：**

| 部分 | 意思 |
|---|---|
| `Authentication refused` | 认证被拒绝 |
| `bad ownership or modes` | 属主或权限不对 |
| `for directory /root/.ssh` | 出问题的是这个目录 |

**为什么：**

`StrictModes` 的逻辑是：**如果别人能改你的 `.ssh` 目录，他就能往里塞自己的公钥，那密钥认证就不安全了。**

所以它宁可拒绝，也不冒险。

**怎么修：**

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

**再连，好了。**

## 错误 7：用 `rsa` 生成，但服务器不接受

**操作：**

```bash
ssh-keygen -t rsa -b 1024
ssh-copy-id root@47.98.xx.xx
```

**会怎样：**

**Ubuntu 22.04 的 OpenSSH 8.9 默认不再接受 SHA-1 签名的 RSA 密钥。** 连接时会失败：

```text
Permission denied (publickey).
```

**服务器日志：**

```text
Unable to negotiate with 113.xx.xx.xx port 51234: no matching host key type found.
```

**或者：**

```text
userauth_pubkey: signature algorithm ssh-rsa not in PubkeyAcceptedAlgorithms
```

**为什么：**

```text
ssh-rsa 用的是 SHA-1，已经被证明不安全。
新版本 OpenSSH 默认把它关掉了。
```

**怎么修：**

```bash
ssh-keygen -t ed25519
```

**这就是课件让你用 ed25519 的原因。**

**如果你非要用 RSA：**

```bash
ssh-keygen -t rsa -b 4096
```

**4096 位的 RSA 默认用 SHA-2 签名，能用。**

---

# 第 9 步：写学习笔记（10 分钟）

```markdown
# 第 212 节课学习笔记

## 一、第一次登录的三道关

| 关卡 | 我看到了什么 | 要注意什么 |
|---|---|---|
| `Are you sure...` | | |
| `password:` | | |
| 登录成功的欢迎信息 | | |

## 二、提示符

`root@VM-0-12-ubuntu:~#` 拆开：

| 部分 | 意思 |
|---|---|
| root | |
| VM-0-12-ubuntu | |
| ~ | |
| # | |

`#` 和 `$` 的区别：

## 三、为什么要废掉密码登录

我跑 `grep "Failed password" /var/log/auth.log | wc -l` 得到：

这个数字说明：

## 四、密钥对

| 文件 | 是什么 | 权限 | 能不能给别人 |
|---|---|---|---|
| `id_ed25519` | | | |
| `id_ed25519.pub` | | | |
| `authorized_keys` | | | |

一句话说清公钥和私钥谁给谁：

## 五、`ssh-copy-id` 做了什么

1.
2.
3.

## 六、我的别名配置

（把我 `~/.ssh/config` 的内容抄在这里）

`ssh myserver` 能进吗：

## 七、关密码登录

改了哪三行：

`sshd -t` 输出什么：

验证密码进不来的命令：

输出什么：

## 八、锁死演练

我是怎么模拟被锁的：

`Permission denied (publickey)` 这个括号是什么意思：

如果真被锁了，我的三条路：

1.
2.
3.

云控制台的 VNC 按钮在哪个位置（我去找过吗）：

## 九、七个错误的后果

| 错误 | 现象 | 怎么修 |
|---|---|---|
| 以为键盘坏了 | | |
| 输 y 不是 yes | | |
| 不 `sshd -t` 就 reload | | |
| 没验证就关密码 | | |
| 私钥拷到服务器 | | |
| 权限 755 | | |
| 用 rsa 1024 | | |

## 十、卡在哪

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] 我能用 `ssh myserver` 直接进，不问密码
- [ ] 我确认过 `Permission denied (publickey)`（密码真的进不来了）
- [ ] 我做过锁死演练并恢复
- [ ] 我知道 VNC 按钮在哪
- [ ] 我的私钥权限是 600
```

---

# 第 10 步：课后练习

## 练习一：把登录过程拆成六步

**要求：**

从"敲下 `ssh`"到"看到提示符"，写下中间发生的六件事（提示：DNS/找 IP、22 端口、版本协商、认证、会话、shell）。

**记录：** 每一步出错会看到什么报错？

**思考题：** `Connection refused` 最可能卡在哪一步？

## 练习二：给第二台设备配密钥

**要求：**

1. 如果有第二台电脑（或手机上的 Termius），给它生成一对密钥；
2. 把公钥追加到服务器的 `authorized_keys`；
3. 两台都能登。

**记录：** `authorized_keys` 现在有几行？你怎么区分哪行是哪台？

**思考题：** 如果笔记本丢了，你怎么只删掉那一行？

## 练习三：看一次真实的爆破

**要求：**

1. 隔 1 小时，跑两次 `grep "Failed password" /var/log/auth.log | wc -l`；
2. 记下两个数字；
3. 算一下每小时被尝试多少次。

**记录：** 数字。

**思考题：** 关掉密码登录之后，这个数字还会涨吗？为什么？

## 练习四：故意锁死一次

**要求：**

1. 用 VNC 进一次服务器（不用改任何东西，只是熟悉界面）；
2. 把 `PasswordAuthentication` 改成 `yes`；
3. reload，用密码登一次（成功）；
4. 再改回 `no`，reload，确认密码又进不来了。

**记录：** VNC 界面能不能粘贴？键盘有什么问题？

**思考题：** 为什么"改回去"这件事必须在你还能进去的时候练？

## 练习五：用三句话讲给外行

```text
① SSH 是什么？
② 为什么密钥比密码安全？
③ 为什么关密码登录之前要先验证？
```

**记录：** 对方问了什么？

---

# 第 11 步：最终验收

## A. 概念

- [ ] 我能说清 SSH 在做什么
- [ ] 我知道公钥和私钥谁装在服务器上
- [ ] 我知道 `authorized_keys` 是什么文件
- [ ] 我知道 `#` 和 `$` 的区别
- [ ] 我知道 `Permission denied (publickey)` 括号里的意思

## B. 实操

- [ ] `ssh myserver` 能直接进，不问密码
- [ ] 我配好了 `~/.ssh/config`
- [ ] 我的私钥权限是 600，`.ssh` 目录是 700
- [ ] `ssh -o BatchMode=yes` 能执行远程命令
- [ ] `PasswordAuthentication` 是 `no`
- [ ] `systemctl status ssh` 是 `active (running)`

## C. 排错

- [ ] 我能区分 `timed out`、`refused`、`Permission denied`
- [ ] 我知道 `sshd -t` 输出为空才是通过
- [ ] 我知道 `auth.log` 里 `bad ownership or modes` 怎么修
- [ ] 我知道被锁死之后走 VNC

## D. 交付

- [ ] 密钥对在 `C:\Users\你\.ssh\`
- [ ] `03-练习代码/ssh-笔记.md` 写了别名和验证命令
- [ ] `NOTES.md` 填完
- [ ] **没有把任何私钥内容写进课程仓库**

## E. 笔记

- [ ] 爆破数字记了真实的
- [ ] 锁死演练写了过程
- [ ] 「卡在哪」写了真实内容

## 本节课要能说出口的一句话

> **SSH 是一条加密通道；密码是被全世界机器 7×24 猜的那个东西，密钥是只有你手里才有的那把钥匙 —— 而在扔掉密码之前，你必须先开第二个窗口证明钥匙真能开门。**

---

# 附：常见问题速查

| 现象 | 原因 | 怎么做 |
|---|---|---|
| 输密码时屏幕没反应 | 正常，Linux 不回显 | 盲打完回车 |
| 输 `y` 被要求重输 | 必须输完整 `yes` | 输 `yes` |
| `Connection timed out` | 22 没开 / IP 错 / 机器没起 | 查安全组、核对 IP |
| `Connection refused` | sshd 没跑 / 端口不对 | VNC 进去 `systemctl status ssh` |
| `Permission denied (publickey)` | 没有可用私钥 / 公钥没装 / 权限不对 | 看 `auth.log`，检查 700/600 |
| `Permission denied (publickey,password)` | 密码还开着，但你密码错了 | 核对密码，或改用密钥 |
| `WARNING: UNPROTECTED PRIVATE KEY FILE` | 私钥权限太宽 | `chmod 600 ~/.ssh/id_ed25519` |
| `Authentication refused: bad ownership or modes` | `.ssh` 或 `authorized_keys` 权限不对 | `chmod 700 ~/.ssh`、`chmod 600 authorized_keys` |
| `Host key verification failed` | 服务器重装过，指纹变了 | `ssh-keygen -R 47.98.xx.xx` 再连 |
| `ssh-copy-id: command not found` | 这个 Git Bash 版本没带 | 用 5.3 节的手动命令 |
| `Bad owner or permissions on ...config` | config 权限太宽 | `chmod 600 ~/.ssh/config` |
| `Could not resolve hostname` | config 没读到 / `Host` 拼错 | 检查文件名不是 `config.txt` |
| `Too many authentication failures` | 本地私钥太多，逐个试被拒 | `-o IdentitiesOnly=yes` 或配 `IdentityFile` |
| 改了 sshd 配置后连不上 | 配置错 + 服务 failed | VNC 进去恢复 `.bak` |
| 半天不操作就断线 | 网络/NAT 超时 | config 里加 `ServerAliveInterval 60` |
| 想换端口号 | 改 `Port` 后要同步改安全组 | 这一周不做，容易锁死 |
