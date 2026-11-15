# 第 16 节课学习笔记

## 一、package.json 五个关键字段

| 字段 | 作用 | 我的项目里是什么值 |
|---|---|---|
| name | | |
| version | | |
| type | | |
| main | | |
| scripts | | |

## 二、`npm run dev` 背后执行的是什么

## 三、CommonJS 和 ES Module

| | CommonJS | ES Module |
|---|---|---|
| 引入 | | |
| 导出 | | |
| 怎么启用 | | |

本课程用哪种：

## 四、`"type": "module"` 之后 require 会怎样

报错原文：

```text
（贴在这里）
```

## 五、import 路径的三种写法

```javascript
import http from "http";              // 
import { CONFIG } from "./config.js"; // 
import x from "../a/b.js";            // 
```

为什么 `"./config.js"` 不能写成 `"config.js"`：

为什么 `.js` 后缀不能省：

## 六、为什么必须监听 error 事件

不监听会怎样：

我遇到的 `EADDRINUSE` 原始报错：

```text
（贴在这里）
```

## 七、`.gitignore` 必须忽略的四类东西

1.
2.
3.
4.

`node_modules` 为什么不提交：

`.env` 为什么不提交：

## 八、`.gitignore` 名字写错怎么查

## 九、拆成三个文件的好处

1.
2.
3.

## 十、`--watch` 的效果

我改了什么文件：

终端输出了什么：

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 我有 `hello-server` 目录，里面有 `package.json`
- [ ] `package.json` 里有 `"type": "module"`
- [ ] `npm run dev` 能启动，且有热重载
- [ ] 我的代码拆成了 config / routes / server 三个文件
- [ ] 访问 /、/about、/api/info、/time 都正常
- [ ] 不存在的路径返回 404
- [ ] `.gitignore` 生效（`git check-ignore` 有输出）
- [ ] 我做过五个错误的实验
- [ ] 我能解释"为什么不能提交 node_modules"
