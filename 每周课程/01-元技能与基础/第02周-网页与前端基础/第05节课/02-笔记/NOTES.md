# 第 12 节课学习笔记

## 一、`const` / `let` / `var`

| 关键字 | 能不能改 | 我用不用 |
|---|---|---|
| const | | |
| let | | |
| var | | |

## 二、六种数据类型

| 类型 | 例子 | typeof 结果 |
|---|---|---|
| 字符串 | | |
| 数字 | | |
| 布尔 | | |
| null | | |
| undefined | | |
| 对象 | | |

`typeof null` 返回什么，为什么：

## 三、`==` 和 `===` 的区别

下面是我自己实际跑出来的结果：

```javascript
console.log(0 == "");              // 
console.log(0 === "");             // 
console.log(null == undefined);    // 
console.log(false == "0");         // 
console.log(100 == "100");         // 
console.log(100 === "100");        // 
```

我的结论：

## 四、模板字符串

老写法：

新写法：

反引号在哪里：

## 五、函数的三种写法

1.
2.
3.

本课程用哪种：

## 六、`return` 的三个坑

1.
2.
3.

## 七、找元素和改内容

| 操作 | 代码 |
|---|---|
| 按 id 找元素 | |
| 读输入框的值 | |
| 改文字内容 | |

`.value` 的类型永远是什么：

## 八、`textContent` 和 `innerHTML`

| | textContent | innerHTML |
|---|---|---|
| 会不会解析标签 | | |
| 该不该用于用户输入 | | |
| 为什么 | | |

## 九、`Number()` 的三个坑

```javascript
console.log(Number(""));         // 
console.log(Number("abc"));      // 
console.log(Number("  100  "));  // 
console.log(Number(" "));        // 
```

## 十、五个错误的后果

| 错误 | 报错或现象 | 怎么查 |
|---|---|---|
| script 放 head | | |
| 忘了 .value | | |
| 用 == | | |
| return 后换行 | | |
| 用 innerHTML | | |

## 十一、我还不懂的词

- 

## 十二、完成检查

- [ ] 我的 JS 文件接上了，控制台能看到输出
- [ ] 我用 const 声明常量，用 let 声明要改的值
- [ ] 我全程没用 var
- [ ] 我用 === 比较，没用 ==
- [ ] 我会写箭头函数
- [ ] 我的函数有参数校验
- [ ] 我能找到页面元素并改它的文字
- [ ] 我知道 .value 永远是字符串
- [ ] 我用了 textContent 不用 innerHTML
- [ ] 点"计算"按钮能得到正确结果
- [ ] 我做过五个错误的实验
