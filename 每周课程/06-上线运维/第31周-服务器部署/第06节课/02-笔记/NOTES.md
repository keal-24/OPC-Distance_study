# 第 216 节课 Nginx 学习笔记

## 一、为什么要反向代理

三种做法：

| 做法 | 问题 |
|---|---|
| 直接开 3000 | |
| node 监听 80 | |
| nginx 转 3000 | |

反向代理的四个好处：

1.
2.
3.
4.

## 二、配置结构

| 路径 | 干什么 |
|---|---|
| `/etc/nginx/nginx.conf` | |
| `/etc/nginx/sites-available/` | |
| `/etc/nginx/sites-enabled/` | |
| `/var/log/nginx/access.log` | |
| `/var/log/nginx/error.log` | |

`nginx.conf` 里哪一行把 sites-enabled 加载进来：

## 三、我的配置

```nginx
（把我写的完整配置抄在这里）
```

逐行解释：

| 行 | 意思 |
|---|---|
| `listen 80;` | |
| `server_name _;` | |
| `proxy_pass http://127.0.0.1:3000;` | |
| `proxy_set_header X-Real-IP $remote_addr;` | |

为什么 `proxy_pass` 不写公网 IP：

## 四、`nginx -t`

我的输出：

如果 `-t` 不过就 reload，会发生什么：

## 五、验证

`curl -I http://127.0.0.1` 的完整输出：

哪一行证明"请求到了我的程序"：

`Content-Length` 是多少？欢迎页是多少？

## 六、状态码

| 状态码 | 意思 | 最可能的原因 |
|---|---|---|
| 502 | | |
| 504 | | |
| 404 | | |
| 500 | | |

502 和 500 的区别：

## 七、日志

`access.log` 一行拆开：

| 字段 | 我的值 | 意思 |
|---|---|---|
| IP | | |
| 时间 | | |
| 请求 | | |
| 状态码 | | |
| 字节数 | | |
| User-Agent | | |

`error.log` 里 `connect() failed (111: Connection refused)` 是什么意思：

`journalctl -u nginx` 和 `error.log` 分工：

日志轮转配置在哪，保留几天：

## 八、七个错误的后果

| 错误 | 现象 | 怎么查 |
|---|---|---|
| 不 -t 就 reload | | |
| 没建软链 | | |
| server_name 不匹配 | | |
| proxy_pass 写公网 IP | | |
| 末尾斜杠 | | |
| 两个 default_server | | |
| 浏览器缓存 | | |

## 九、卡在哪

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] 浏览器打开 IP 是我的应用，不是欢迎页
- [ ] `curl -I` 里有 `X-Powered-By: Express`
- [ ] `nginx -t` 通过
- [ ] 我能在 `access.log` 里找到自己刚才那次访问
- [ ] 我知道 `nginx -T` 干什么
