# 第 215 节课学习笔记

## 一、为什么 `node server.js &` 不行

我做的实验：

关窗口后 `curl` 的输出：

机制（哪个信号，谁发的）：

`nohup` 解决了什么，没解决什么：

## 二、四种方案对比

| 方案 | 关窗口不断 | 崩了重启 | 开机自启 |
|---|---|---|---|
| `node server.js` | | | |
| `nohup ... &` | | | |
| pm2 | | | |

## 三、装 pm2

`pm2 -v` 输出：

`which pm2` 输出：

## 四、启动

我在哪个目录启动的：

`pm2 start` 的命令：

`pm2 list` 里我的应用：

| 列 | 我的值 |
|---|---|
| name | |
| pid | |
| status | |
| ↺ | |
| mem | |

`pm2 logs` 里 `injecting env (n)` 的 n 是：

`pm2 describe` 里 `exec cwd` 是：

## 五、端口

`ss -lntp | grep 3000` 的输出：

`127.0.0.1:3000` 和 `0.0.0.0:3000` 的区别：

## 六、三条命令

| 命令 | 解决什么 | 我执行了吗 |
|---|---|---|
| `pm2 start` | | |
| `pm2 save` | | |
| `pm2 startup`（+ 那行 sudo） | | |

`pm2 save` 输出：

`pm2 startup` 让我执行的那行命令（抄下来）：

## 七、重启验证

重启前 `uptime`：

重启后 `uptime`：

重启后 `pm2 list` 的 status 和 ↺：

重启后 `curl` 的状态码：

## 八、日志

日志路径：

`out.log` 和 `error.log` 分别装什么：

`pm2-logrotate` 装了没：

## 九、七个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| `&` 关窗口 | | |
| 在 /root 启动 | | |
| 入口名写错 | | |
| 只 save 不 startup | | |
| startup 那行没执行 | | |
| 改代码不 restart | | |
| 端口占用 | | |

## 十、卡在哪

## 十一、我还不懂的词

-

## 十二、完成检查

- [ ] `pm2 list` 是 online
- [ ] 关窗口再连，服务还在
- [ ] 真的 reboot 过一次，服务自己回来了
- [ ] `injecting env (n)` 的 n 对得上
- [ ] 我知道 `↺` 一直涨意味着什么
