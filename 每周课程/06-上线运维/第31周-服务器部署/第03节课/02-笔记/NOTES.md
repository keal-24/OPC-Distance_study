# 第 213 节课学习笔记

## 一、这台机器的原始状态

| 项目 | 值 |
|---|---|
| 系统版本 | |
| 架构 | |
| 内存 | |
| swap | |
| 硬盘 | |

## 二、apt 的三个动词

| 命令 | 干什么 | 类比 |
|---|---|---|
| `apt update` | | |
| `apt upgrade` | | |
| `apt install` | | |

不 `update` 直接 install 会怎样：

## 三、Node 版本

`apt install nodejs` 装出来是：

为什么 Ubuntu 仓库给这么老的版本：

为什么不能用它（写一条报错，或我能想到的后果）：

## 四、NodeSource 做了什么

| 文件 | 内容 |
|---|---|
| `/etc/apt/keyrings/nodesource.gpg` | |
| `/etc/apt/sources.list.d/nodesource.list` | |

`signed-by=` 是什么意思：

## 五、为什么服务器不用 nvm

| 问题 | 说明 |
|---|---|
| 装在哪 | |
| pm2 能找到吗 | |
| 重启后呢 | |

`which node` 我的输出是：

## 六、nginx

`nginx -v` 输出：

`systemctl status nginx` 的 `Loaded` 那一行：

`curl -I http://127.0.0.1` 第一行：

四个路径：

| 路径 | 干什么 |
|---|---|
| `/etc/nginx/nginx.conf` | |
| `/etc/nginx/sites-available/` | |
| `/etc/nginx/sites-enabled/` | |
| `/var/log/nginx/access.log` | |

## 七、swap

为什么要加 swap（写出 `Killed` 和 `dmesg` 的关系）：

| 步骤 | 命令 |
|---|---|
| 建文件 | |
| 改权限 | |
| 格式化 | |
| 启用 | |
| 开机自动 | |

`free -h` 里 Swap 那一行现在是：

`mount -a` 的输出是：

## 八、六个错误的后果

| 错误 | 现象 | 怎么修 |
|---|---|---|
| 不 update | | |
| 用 apt 的 node | | |
| swapfile 权限 | | |
| fstab 写错 | | |
| 以为 nginx 好了 | | |
| 不看 `which node` | | |

## 九、我的环境清单

（把关键几行抄在这里）

## 十、卡在哪

（写真实的那一步，比如"NodeSource 脚本跑到一半没网了"）

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `node -v` 是 v22.x，`which node` 是 `/usr/bin/node`
- [ ] `nginx -v` 有输出，`systemctl status nginx` 是 active
- [ ] `free -h` 里 Swap 是 2.0Gi
- [ ] `/etc/fstab` 里有 swap 那行，`mount -a` 没报错
- [ ] 我跑过一次 `dmesg | grep -i "killed process"`
