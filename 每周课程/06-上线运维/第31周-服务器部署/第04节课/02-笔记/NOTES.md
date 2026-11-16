# 第 214 节课学习笔记

## 一、三种传代码的方式

| | zip+scp | FileZilla | git clone |
|---|---|---|---|
| 以后怎么更新 | | | |
| 会不会传 node_modules | | | |
| 能不能回滚 | | | |

## 二、为什么放 `/srv/app`

我的部署路径：

`ls -ld /srv/app` 的输出：

## 三、clone

我用的命令：

最后那个 `.` 是什么意思：

`git log -1 --oneline` 的输出：

## 四、目录里有什么、没什么

| 有 | 没有 |
|---|---|
| | |
| | |

`.gitignore` 里挡了哪些：

## 五、`.env`

为什么它不在 git 里：

我建的命令：

我的 `.env` 有几个变量（只写键名）：

`cat -A` 看到了什么（有没有多余空格、`^M`）：

三条格式规则：

1.
2.
3.

权限是多少：

`git check-ignore -v .env` 的输出：

## 六、`npm ci` 和 `npm install`

| | install | ci |
|---|---|---|
| 读什么 | | |
| 改不改 lock | | |
| 删不删 node_modules | | |

我的 `npm ci` 输出（`added ... packages` 那一行）：

有没有看到 `Killed`：

## 七、手动跑一次

`node server.js` 的输出：

`injecting env (n)` 里的 n 是几？和我 `.env` 的变量数对得上吗：

`curl -i` 的状态码：

为什么要改 `app.listen(3000, '127.0.0.1')`：

## 八、七个错误的后果

| 错误 | 现象 | 怎么修 |
|---|---|---|
| clone 到非空目录 | | |
| 等号两边空格 | | |
| 值加引号 | | |
| 忘了建 .env | | |
| 用 npm install | | |
| 提交 .env | | |
| 权限 644 | | |

## 九、卡在哪

## 十、我还不懂的词

-

## 十一、完成检查

- [ ] `/srv/app` 里有完整代码
- [ ] `.env` 是我手动建的，600 权限，`git status` 看不到
- [ ] `git check-ignore -v .env` 有输出
- [ ] `npm ci` 装完了
- [ ] `node server.js` 能起，`curl` 返回 200
- [ ] 跑完已经 `Ctrl+C` 停掉，`ss -lntp | grep 3000` 没输出
