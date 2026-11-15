# 第 6 节课：一次改多个文件前先存档——Git 存档点

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你只改一个文件，能靠复制备份兜住。这节课要改**好几个文件**，复制备份就不够用了。
> 你要学会的是一件事：**动手之前先做一个能一键回退的存档点。**

**建议用时**：100 分钟
**你需要先完成**：第 1—5 节课

---

# 第 0 步：为什么复制备份不管用了（5 分钟）

## 0.1 上节课的备份方式，在三个文件时就崩了

上节课你改了 1 个文件，做法是复制成 `report.before.js`。

现在假设你要改 5 个文件：

```text
report.js
format.js
config.js
index.js
README.md
```

**如果都用“复制改名”的方式：**

1. 你要复制 5 次，改 5 个名字；
2. 改到一半发现第 2 个文件改坏了，第 3、4、5 个已经改完了；
3. 你想回到“全都没改”的状态，得手动恢复 5 个文件；
4. 如果你忘了备份第 4 个，就彻底回不去了。

**这种方式撑不住。** 而且你根本记不住“哪次改动改了什么”。

## 0.2 今天要学的东西

```text
Git —— 一个专门记录“文件改动历史”的工具。
```

**`Git` 是什么：**
一个版本管理工具。你可以把它想成“给整个文件夹拍快照的相机”。

- 你按一下快门（commit），它就把当前所有文件的样子记下来；
- 改坏了，你可以回到任何一张快照；
- 它还会记下“这次改了哪几个文件、加了什么、删了什么”。

**`GitHub` 又是什么：**
一个网站，用来存放你的 Git 快照，方便换电脑和给别人看。**Git 是本地工具，GitHub 是网上仓库。** 两者不是一回事。

## 0.3 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `TASK.md` | `01-任务` | 你正在读的这份 |
| `NOTES.md` | `02-笔记` | 你的操作记录 |
| `shop/` 里 5 个文件 | `03-练习代码` | 今天要改的目标 |
| `git-log.md` | `03-练习代码` | 你的提交记录 |

---

# 第 1 步：先确认 Git 装好了（10 分钟）

## 1.1 检查 Git

**操作：**

1. 按 `Win + R`（两个键一起按）。
2. 输入 `cmd`，回车。
3. 在弹出的黑窗口里输入：

   ```text
   git --version
   ```

4. 回车。

**应该看到类似：**

```text
git version 2.55.0.windows.3
```

**只要显示 `git version` 加数字，就是装好了。** 版本号不用和上面一样。

**如果提示 `'git' 不是内部或外部命令`：**

1. 说明没装，或装了但没加到环境变量；
2. 去 `参考手册/01-环境搭建.md` 按步骤装；
3. 装完**关掉所有终端窗口重新打开**再试。

## 1.2 确认课程仓库已经是 Git 仓库

**操作：**

1. 打开文件夹：

   ```text
   B:\OPC-Distance_study
   ```

2. 在空白处右键，选“Open Git Bash here”或“在终端中打开”。
3. 输入：

   ```text
   git status
   ```

4. 回车。

**应该看到类似：**

```text
On branch main
Your branch is up to date with 'origin/main'.
...
```

**如果看到 `fatal: not a git repository`：**
说明这个文件夹还不是 Git 仓库。先确认你 `cd` 到的是 `B:\OPC-Distance_study` 而不是它的子文件夹。

**课程仓库本身是 Git 仓库**，从 GitHub 克隆下来就自带 `.git` 隐藏文件夹。**不用你 `git init`。**

## 1.3 `git status` 是你最常用的命令

```text
git status = 我现在有哪些改动，还没存进快照？
```

**每次动手改代码前后都该跑一次。**

它会告诉你三件事：

- 哪些文件改了（`modified`）；
- 哪些文件是新加的（`untracked`）；
- 现在在哪个分支（`On branch main`）。

**`分支` 是什么：**
先理解成“一条时间线”。你现在在 `main` 这条主时间线上。分支的完整用法第 4 周会讲，今天只用 `main`。

---

# 第 2 步：认识三个概念（15 分钟）

## 2.1 工作区、暂存区、快照

这三个词是 Git 的核心。**不搞懂这三个，后面所有命令都是死记硬背。**

```text
工作区（你正在编辑的文件）
  ↓  git add
暂存区（你挑出来准备存档的改动）
  ↓  git commit
快照（一次完整的记录）
```

### 工作区：你正在编辑的那些文件

**就是你在文件夹里看到的、能直接改的东西。**

你打开 `config.js` 改了一行，保存——这个改动**只在工作区里**。Git 知道你改了，但还不知道你打算把它存进去。

### 暂存区：你“挑出来准备存档”的那些改动

**为什么要有这一层：**

假设你改了 5 个文件，其中 2 个还没改完。如果一次全存，你就把半成品也存进快照了。

暂存区让你**只挑改好的那部分**存档。

```text
git add config.js      ← 只把 config.js 放进暂存区
git commit -m "..."    ← 把暂存区的东西存成快照
```

### 快照：一次记录

一次 `commit` 就是一张快照。它记录了：

- 改了哪些文件；
- 每个文件改成什么样；
- 谁改的、什么时候改的、为什么改（提交信息）。

**快照存下去就不会被悄悄改掉。** 你只能在它之后继续加新快照。

## 2.2 一个比喻：写作业

| Git 概念 | 写作业的对应 |
|---|---|
| 工作区 | 你正在写的草稿纸 |
| `git add` | 把这一页抄到正式作业本上 |
| `git commit` | 合上作业本，写上日期，交给老师 |
| 快照 | 已经交上去的那一版 |
| `git log` | 翻看自己交过哪几版 |

**为什么不能直接 `commit` 不 `add`：**
因为 Git 要给你一次“确认”的机会——你想清楚哪些改动要交，再交。

## 2.3 四个最小命令

```text
git status               ← 看现状
git add <路径>            ← 挑出要存的
git commit -m "说明"      ← 存档，并写一句为什么
git log --oneline        ← 看历史
```

## 2.4 马上自测

不看上面，回答：

1. 我改了文件但没 `add`，这个改动在哪？
2. `add` 之后但没 `commit`，改动在哪？
3. `commit` 之后，改动在哪？

答不出来就回到 2.1 重读。

---

# 第 3 步：准备 5 个要改的文件（15 分钟）

## 3.1 建练习文件夹

**操作：**

1. 打开：

   ```text
   B:\OPC-Distance_study\每周课程\01-元技能与基础\第01周-AI工具\第06节课\03-练习代码
   ```

2. 新建文件夹 `shop`（右键 → 新建 → 文件夹）。

   **说明：`03-练习代码` 里只有一份 `说明.md`。`shop` 文件夹和里面 5 个文件全部要你自己建。**

## 3.2 建 5 个文件

在 `shop` 里建这 5 个文件（新建方法同前：右键 → 新建 → 文本文档 → 改名 → 扩展名提示点“是”）。

**全部要你自己敲，不许复制粘贴。**

**为什么这节课尤其不能复制：**

这节课要让你**亲眼看见一个 bug**——`cartSummary` 会偷偷修改传进来的数组。

如果你复制粘贴，你会觉得“这代码是别人写的，出了怪事很正常”。

如果你自己敲，你会记得自己敲了 `items.push(...)` 这一行，然后你会想：“等等，我为什么在这里 push？这会不会改到外面的东西？”

**那个“等等”的瞬间，就是这节课的全部价值。**

**敲的顺序建议：**

```text
① 先敲 config.js（最短，先建立信心）
② 再敲 format.js
③ 再敲 cart.js（最长，慢慢敲）
④ 再敲 index.js
⑤ 最后敲 README.md
```

**每敲完一个文件保存一次。** 五个都敲完再一起跑。

### 文件 1：`config.js`

```javascript
// 商店配置
const CONFIG = {
  shopName: "小栈便利店",
  currency: "元",
  taxRate: 0.06,
  freeShippingThreshold: 99,
};

module.exports = CONFIG;
```

**`module.exports` 是什么：**
让别的文件能用这个文件里定义的东西。`require("./config")` 就是“把这个文件拿过来用”。

### 文件 2：`format.js`

```javascript
// 金额和文字格式化
function formatMoney(amount) {
  return amount.toFixed(2) + " 元";
}

function formatShopTitle(name) {
  return "【" + name + "】";
}

module.exports = { formatMoney, formatShopTitle };
```

### 文件 3：`cart.js`

```javascript
// 购物车计算
const CONFIG = require("./config");
const { formatMoney } = require("./format");

function calcCart(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = subtotal * CONFIG.taxRate;
  const shipping = subtotal >= CONFIG.freeShippingThreshold ? 0 : 8;
  const total = subtotal + tax + shipping;

  return {
    subtotal,
    tax,
    shipping,
    total,
  };
}

function cartSummary(items) {
  // 每单默认加一个购物袋
  items.push({ name: "购物袋", price: 11, qty: 1 });

  const result = calcCart(items);
  return [
    "小计：" + formatMoney(result.subtotal),
    "税费：" + formatMoney(result.tax),
    "运费：" + formatMoney(result.shipping),
    "应付：" + formatMoney(result.total),
  ].join("\n");
}

module.exports = { calcCart, cartSummary };
```

**先不要纠结 `items.push` 那一行。** 等下会让你自己查它。

### 文件 4：`index.js`

```javascript
// 入口
const CONFIG = require("./config");
const { formatShopTitle } = require("./format");
const { cartSummary } = require("./cart");

const items = [
  { name: "矿泉水", price: 2, qty: 3 },
  { name: "面包", price: 8.5, qty: 2 },
  { name: "牛奶", price: 15, qty: 1 },
];

console.log(formatShopTitle(CONFIG.shopName));
console.log(cartSummary(items));
```

### 文件 5：`README.md`

````markdown
# 小栈便利店（练习）

一个用来练习 Git 存档的小项目。

## 文件说明

- `config.js`：商店配置
- `format.js`：金额和文字格式化
- `cart.js`：购物车计算
- `index.js`：入口

## 运行

```text
node index.js
```
````

## 3.3 跑一次，看到结果

**操作：**

1. 打开终端，`cd` 到 `shop` 文件夹（用 `cd` 加空格，然后把这个文件夹拖进终端窗口）。
2. 输入：

   ```text
   node index.js
   ```

**屏幕上应该看到：**

```text
【小栈便利店】
小计：49.00 元
税费：2.94 元
运费：8.00 元
应付：59.94 元
```

## 3.4 现在自己验算一次

**手算三件商品：**

```text
矿泉水：2 × 3 = 6
面包：8.5 × 2 = 17
牛奶：15 × 1 = 15
合计：6 + 17 + 15 = 38
```

**程序显示小计 49。差 11。**

**记住这个差异。** 第 5 步会让你自己查出来为什么。

**现在先不要改它。** 今天的主题是存档，你需要先有一个“有 bug 但能跑”的状态。

---

# 第 4 步：第一次存档——把“现在能跑的样子”存下来（15 分钟）

## 4.1 为什么先存一次

因为**现在的状态是“能跑但有 bug”**。听起来不值得存，但它是你接下来改动的基准点。

**存档的本质是“留一个可以回来的地方”，不是“留一个完美版本”。**

## 4.2 看现状

**操作：**

1. 回到仓库根目录：

   ```text
   B:\OPC-Distance_study
   ```

2. 在这里打开终端。
3. 输入：

   ```text
   git status
   ```

**你会看到一长串文件，很多是老课程的改动。** 这是正常的，因为前面几节课的东西还没全部提交。

## 4.3 关键：怎么只存今天的

**如果你直接 `git add -A`，会把前面几节课所有东西一起提交。** 这不算错，但不干净。

**今天先学“只提交我这个文件夹”：**

```text
git add 每周课程/01-元技能与基础/第01周-AI工具/第06节课/03-练习代码/shop
```

**这条命令在做什么：**
把 `shop` 文件夹里的所有新文件放进暂存区，其他一概不管。

**中文路径要注意：**
如果终端报错说路径不对，先确认你在仓库根目录（`git status` 能正常输出就说明在）。

## 4.4 确认暂存了什么

```text
git status
```

**现在你应该看到：**

```text
Changes to be committed:
  new file:   每周课程/.../shop/config.js
  new file:   每周课程/.../shop/format.js
  new file:   每周课程/.../shop/cart.js
  new file:   每周课程/.../shop/index.js
  new file:   每周课程/.../shop/README.md
```

**`Changes to be committed` = 已放进暂存区，等着被提交。**

**而其他那些老改动应该在 `Changes not staged for commit` 里。**

**这两个区域的区别，就是 2.1 讲的工作区和暂存区。**

## 4.5 提交

```text
git commit -m "第06节课练习：建立 shop 练习项目（小计有已知偏差）"
```

**提交信息怎么写：**
好的提交信息 = 做了什么 + 为什么 / 现状。

- `第06节课练习：建立 shop 练习项目（小计有已知偏差）` ✓
- `update` ✗（等于没说）
- `改了一下` ✗

**为什么要在信息里写“有已知偏差”：**
因为你以后回看历史，会知道“这一版小计是错的”，不会把它当成正常版本。

## 4.6 看历史

```text
git log --oneline
```

**应该看到类似：**

```text
a1b2c3d 第06节课练习：建立 shop 练习项目（小计有已知偏差）
1d9b5b6 完成全部252节课任务文件
...
```

**最上面那条就是刚才那次。**

**`--oneline` 是什么：**
让每条记录只显示一行（短编号 + 提交信息）。不加它会刷一屏。

**`a1b2c3d` 是什么：**
提交的“编号”，叫哈希值。回退的时候要用它。**你只需要复制前 7 位。**

## 4.7 记下来

在 `shop` 文件夹里新建 `git-log.md`：

```markdown
# 我的 Git 操作记录

## 第 1 次提交

- 提交信息：第06节课练习：建立 shop 练习项目（小计有已知偏差）
- 包含文件：config.js、format.js、cart.js、index.js、README.md
- 哈希：____
- 当时的程序状态：能跑，但小计显示 49，我手算是 38
```

---

# 第 5 步：先查清那个 49 是怎么来的（15 分钟）

## 5.1 不要猜，加打印

**新人最常见的错误：盯着代码看十分钟，猜哪里错了。**

**正确做法：让程序把真实数据打出来。**

**操作：**

1. 在 `shop` 里新建 `debug.js`。
2. 写：

   ```javascript
   const items = [
     { name: "矿泉水", price: 2, qty: 3 },
     { name: "面包", price: 8.5, qty: 2 },
     { name: "牛奶", price: 15, qty: 1 },
   ];

   console.log("调用前，items 有", items.length, "条");
   items.forEach((item) => {
     console.log(" ", item.name, item.price, "×", item.qty, "=", item.price * item.qty);
   });

   const { cartSummary } = require("./cart");
   cartSummary(items);

   console.log("调用后，items 有", items.length, "条");
   items.forEach((item) => {
     console.log(" ", item.name, item.price, "×", item.qty, "=", item.price * item.qty);
   });
   ```

3. 运行 `node debug.js`。

## 5.2 你会看到什么

```text
调用前，items 有 3 条
  矿泉水 2 × 3 = 6
  面包 8.5 × 2 = 17
  牛奶 15 × 1 = 15
调用后，items 有 4 条
  矿泉水 2 × 3 = 6
  面包 8.5 × 2 = 17
  牛奶 15 × 1 = 15
  购物袋 11 × 1 = 11
```

**`6 + 17 + 15 + 11 = 49`。**

**找到了。** 调用 `cartSummary` 之后，`items` 多了一条“购物袋”。

## 5.3 为什么要警惕这种事

**`cartSummary` 的职责是“生成一段文字摘要”**，它不应该修改传进来的数组。

**但它偷改了。** 这就是**副作用**（side effect）。

**副作用是什么：**
一个函数除了“返回结果”之外，还偷偷改变了外部的东西（数组、对象、文件、数据库）。

**为什么副作用危险：**

- 你调用它只是想拿一段文字，结果你的数据被改了；
- 你在别的地方再用这个 `items`，就是脏的；
- 如果循环调用，数组会越来越长。

**这个 bug 在真实项目里非常常见。** 它不报错，只是数字慢慢变得不对。

## 5.4 正确的写法

`cartSummary` 里应该造一份新的数据，而不是改原来的：

```javascript
function cartSummary(items) {
  const withBag = items.concat([{ name: "购物袋", price: 11, qty: 1 }]);
  const result = calcCart(withBag);
  ...
}
```

**`concat` 是什么：**
返回一个新数组，原数组不变。这正是我们要的。

## 5.5 现在记住这条规则

```text
一个函数要么返回结果，要么改变外部状态，不要悄悄两件都做。
```

**这条规则第 8 节课会正式讲（"十条硬规则"）。今天先记住。**

---

# 第 6 步：现在改 3 个文件（15 分钟）

## 6.1 本次需求

```text
1. 商店名从“小栈便利店”改成“凯旋小栈”。
2. 金额显示从“49.00 元”改成“¥49.00”。
3. 修掉“小计多算购物袋”的副作用 bug。
```

**这要改 3 个文件：**

- `config.js`：改店名；
- `format.js`：改金额格式；
- `cart.js`：修 bug。

**注意：`index.js` 和 `README.md` 不用改。但 `index.js` 的输出会变。**
**这是多文件改动的核心特点：不改的文件，输出也可能变。**

## 6.2 改 config.js

找到：

```javascript
shopName: "小栈便利店",
```

改成：

```javascript
shopName: "凯旋小栈",
```

保存。

## 6.3 改 format.js

找到：

```javascript
function formatMoney(amount) {
  return amount.toFixed(2) + " 元";
}
```

改成：

```javascript
function formatMoney(amount) {
  return "¥" + amount.toFixed(2);
}
```

保存。

## 6.4 改 cart.js

找到：

```javascript
function cartSummary(items) {
  // 每单默认加一个购物袋
  items.push({ name: "购物袋", price: 11, qty: 1 });

  const result = calcCart(items);
```

改成：

```javascript
function cartSummary(items) {
  // 每单默认加一个购物袋。concat 会返回新数组，不修改传进来的 items。
  const withBag = items.concat([{ name: "购物袋", price: 11, qty: 1 }]);

  const result = calcCart(withBag);
```

保存。

## 6.5 跑一次

```text
node index.js
```

**应该看到：**

```text
【凯旋小栈】
小计：¥49.00
税费：¥2.94
运费：¥8.00
应付：¥59.94
```

**等等，小计还是 49？**

**对，因为你只是不再“污染原数组”，但购物袋本来就是要算进小计的。** 业务需求是“每单默认加购物袋”，所以 49 是对的。

**那 38 呢？**

38 是“三件商品”的金额。**加了购物袋才是应付的小计。** 所以真正的问题不是“49 错了”，而是**“之前那一版会把购物袋加到调用方的数组里，导致第二次调用变成 60”**。

**验证一下。** 在 `shop` 里新建 `twice.js`（注意是 `shop`，不是 `home`，上一句写错了也照样能跑，但文件会放错地方）：

```javascript
const items = [{ name: "矿泉水", price: 2, qty: 3 }];
const { cartSummary } = require("./cart");

console.log("第一次：");
console.log(cartSummary(items));
console.log("第二次：");
console.log(cartSummary(items));
```

**运行 `node twice.js`。**

**修好前：** 第二次会比第一次多 11。
**修好后：** 两次一样。

**这就是“副作用 bug”的真实表现：单次调用看不出来，重复调用才暴露。**

## 6.6 这个发现要记下来

在 `NOTES.md` 里写清楚：

```text
我一开始以为小计 49 是 bug，其实是业务规则（每单加购物袋）。
真正的 bug 是 cartSummary 修改了调用方的数组，
所以同一批商品调用两次，第二次会多算 11 元。
```

**这个思考过程比“修好 bug”更有价值。** 因为**你以为的 bug 可能不是 bug，真正的 bug 藏在别处。**

---

# 第 7 步：改坏了怎么一键回退（15 分钟）

## 7.1 先故意改坏

**操作：**

1. 打开 `format.js`，把 `"¥"` 改成 `"￥￥"`（两个全角符号，故意写错）。
2. 保存。
3. 运行 `node index.js`。

**你会看到：**

```text
小计：￥￥49.00
```

**现在你想全部退回去。**

## 7.2 三种回退方式，按场景选

### 方式一：还没 add，撤销工作区改动

```text
git restore .
```

**在做什么：** 把工作区里所有已跟踪文件的改动，恢复成上次提交的样子。

**会丢什么：** 你改的全部内容（包括那个正确的修复）。

**不会动什么：** 新建的文件（`untracked`）不会被删。

**只想撤销一个文件：**

```text
git restore 每周课程/01-元技能与基础/第01周-AI工具/第06节课/03-练习代码/shop/format.js
```

### 方式二：已经 add，想从暂存区拿出来

```text
git restore --staged .
```

**在做什么：** 把文件从暂存区退回工作区。**改动还在，只是不再准备提交。**

**这个命令很常用：** 你 `add` 多了，用它撤回来重新挑。

### 方式三：已经 commit，想回退一次提交

**安全版（推荐）：**

```text
git revert HEAD
```

**在做什么：** 新建一次提交，内容正好是“把上一次的改动反过来”。**历史不会被删。**

**为什么推荐：**
它不改写历史，安全。团队协作时必须这么做。

**重置版（慎用）：**

```text
git reset --hard HEAD
```

**在做什么：** 直接丢弃所有未提交的改动，回到上一次提交。

**风险：** 你的未提交工作会**永久消失**，找不回来。

**给小白的选择顺序：**

```text
优先 git restore（撤销改动）
其次 git restore --staged（取消暂存）
再用 git revert（回退一次提交）
最后才 git reset --hard（并且要清楚会丢什么）
```

## 7.3 现在练习方式一

**操作：**

1. 先看看现在脏了什么：

   ```text
   git status
   ```

   应该看到 `modified: shop/config.js`、`modified: shop/format.js`、`modified: shop/cart.js`。

2. 撤销：

   ```text
   git restore .
   ```

3. 再看：

   ```text
   git status
   ```

   那三个 `modified` 全没了。

4. 运行 `node index.js`。

**应该看到输出变回原来的：**

```text
【小栈便利店】
小计：49.00 元
税费：2.94 元
运费：8.00 元
应付：59.94 元
```

**这是你第一次真正“回到过去”。**

**注意：`debug.js`、`twice.js`、`git-log.md` 还在。** 因为它们是新建文件，`restore` 不管。

## 7.4 记下来

在 `git-log.md` 里：

```markdown
## 回退实验

- 我改了什么：format.js 里把 ¥ 改成 ￥￥
- 我用哪个命令回退：git restore .
- 回退后输出变成什么：变回「小栈便利店 / 49.00 元」
- 我确认回退成功的方法：git status 里没有 modified，node index.js 输出恢复
- 回退没动什么：debug.js、twice.js、git-log.md 还在
```

---

# 第 8 步：重新改一遍，这次正常提交（15 分钟）

## 8.1 重新改三个文件

按第 6 步再改一次（`config.js`、`format.js`、`cart.js`）。

## 8.2 分别 add

**为什么分开 add：**
练习“只提交我确认过的改动”。

```text
git add 每周课程/01-元技能与基础/第01周-AI工具/第06节课/03-练习代码/shop/config.js
git status
```

**看输出：** 只有 `config.js` 在 `Changes to be committed` 里，`format.js` 和 `cart.js` 还在下面。

```text
git add 每周课程/01-元技能与基础/第01周-AI工具/第06节课/03-练习代码/shop/format.js
git add 每周课程/01-元技能与基础/第01周-AI工具/第06节课/03-练习代码/shop/cart.js
git status
```

**现在三个都在暂存区了。**

## 8.3 提交

```text
git commit -m "第06节课：shop 改名凯旋小栈，金额改 ¥ 格式，修掉 cartSummary 副作用"
```

## 8.4 看这次到底改了什么

```text
git show --stat HEAD
```

**`HEAD` 是什么：** 指“最新那次提交”。
**`--stat` 是什么：** 只显示统计，不显示每行内容。

**应该看到类似：**

```text
 shop/cart.js    | 4 ++--
 shop/config.js  | 2 +-
 shop/format.js  | 2 +-
 3 files changed, ...
```

**读法：**

- 改了 3 个文件；
- 每个文件后面是“加了多少行、删了多少行”；
- **如果这里出现了 `index.js` 或 `README.md`，说明你多改了。**

**这就是“我到底改了几个文件”的证据。**

## 8.5 看具体改了哪几行

```text
git show HEAD
```

**会显示 diff：**

```text
-  shopName: "小栈便利店",
+  shopName: "凯旋小栈",
```

**`-` 是删的，`+` 是加的。** 和第 5 节课看 diff 一样。

**按 `q` 退出查看。**（Git 会进入分页模式，不按 `q` 会卡住）

## 8.6 记下来

```markdown
## 第 2 次提交

- 提交信息：第06节课：shop 改名凯旋小栈，金额改 ¥ 格式，修掉 cartSummary 副作用
- 改了哪几个文件：config.js、format.js、cart.js
- git show --stat HEAD 显示几个文件改动：3
- 有没有意外改动的文件：没有
```

---

# 第 9 步：把“存档点”变成习惯（10 分钟）

## 9.1 什么时候必须存档

```text
① 让 AI 大规模改动之前
② 一次功能做完、测试通过之后
③ 下班/下课之前
④ 任何"我要试试一个不确定的做法"之前
```

**第 ① 条最关键。**

## 9.2 为什么“让 AI 改之前”必须先存档

因为 AI 可能：

- 改 10 个文件你只看到 3 个；
- 改了配置文件你不知道；
- 删了几行你觉得没用的代码。

**有了存档点，你随时能 `git restore .` 回到改之前。**

## 9.3 一个必须记的坑：先看 status

**在让 AI 改代码之前，先让 `git status` 是干净的。**

**什么叫干净：** 没有未提交的改动。

**如果不干净会怎样：**

1. 你手上还有 5 个没提交的改动；
2. 让 AI 又改了 10 个文件；
3. 改坏了想回退；
4. `git restore .` 把你**原来那 5 个改动也一起丢了**。

**正确流程：**

```text
开工前：git status 确认干净 → 不干净就先 commit
让 AI 改
改完：git status 看它动了哪些文件 → git show 看具体改动
```

## 9.4 `.gitignore` 是什么

**问题：** 有些文件不该进 Git。

- `node_modules`（依赖包，几百 MB）；
- `.env`（存密钥，**绝对不能提交**）；
- 日志文件；
- 系统缓存 `.DS_Store`。

**用法：** 在仓库根目录建一个文件叫 `.gitignore`，里面写规则：

```text
node_modules/
.env
*.log
.DS_Store
```

**每行意思：**

- `node_modules/`：忽略这个文件夹；
- `.env`：忽略这个文件名；
- `*.log`：忽略所有 `.log` 结尾的文件；
- `.DS_Store`：Mac 的缓存文件。

**为什么 `.env` 必须忽略：**
它通常存着数据库密码、API 密钥。**一旦提交到 GitHub，就等于把密码公开。** 即使你之后删掉，历史记录里还有。

**这个坑每年大量新手踩。** 今天先记住：

```text
.env 文件绝对不能提交到 Git。
```

## 9.5 检查一下

在仓库根目录运行：

```text
git check-ignore -v .env
```

**如果显示类似：**

```text
.gitignore:2:.env    .env
```

说明 `.env` 已被忽略，安全。

**如果没有输出，说明没被忽略。** 那以后建 `.env` 时要先加到 `.gitignore`。

---

# 第 10 步：写学习笔记（10 分钟）

```markdown
# 第 6 节课学习笔记

## 一、三个概念

| 概念 | 是什么 | 对应命令 |
|---|---|---|
| 工作区 | | |
| 暂存区 | | |
| 快照 | | |

## 二、四个基本命令

| 命令 | 作用 | 什么时候用 |
|---|---|---|
| `git status` | | |
| `git add` | | |
| `git commit` | | |
| `git log --oneline` | | |

## 三、三种回退方式

| 命令 | 场景 | 风险 |
|---|---|---|
| `git restore .` | | |
| `git restore --staged .` | | |
| `git revert HEAD` | | |
| `git reset --hard HEAD` | | 会丢未提交改动 |

## 四、那个 49 的真相

我一开始以为：

实际是：

真正的 bug 是：

我怎么发现的（用了什么方法）：

## 五、副作用是什么

我的理解：

为什么危险：

正确的写法用了什么方法：

## 六、我实际的操作记录

第 1 次提交：______
第 2 次提交：______
`git show --stat HEAD` 显示几个文件：______

## 七、必须记住的三件事

1. 让 AI 改之前先 `git status`，不干净就先 commit
2. `.env` 绝对不能提交
3. `git reset --hard` 会永久丢失未提交的改动

## 八、我还不懂的词

- 

## 九、完成检查

- [ ] 我能说出工作区、暂存区、快照的区别
- [ ] 我做过 2 次提交
- [ ] 我会只提交指定文件夹
- [ ] 我用 `git show --stat HEAD` 确认过改了哪几个文件
- [ ] 我用 `git restore .` 成功回退过
- [ ] 我自己查出了购物袋是从哪里加进去的
- [ ] 我能解释什么是副作用
- [ ] 我知道让 AI 改代码前要先存档
- [ ] 我知道 `.env` 不能提交
```

---

# 第 11 步：课后练习

## 练习一：验证副作用被修好了

用 `twice.js` 验证：

1. 先 `git restore .` 回到第一次提交的状态（等于是修 bug 之前）；
2. 运行 `node twice.js`，记录两次输出；
3. 再改回修好的版本；
4. 再运行，记录两次输出；
5. 写清两次的差别。

## 练习二：撤销单个文件的改动

1. 改 `shop/README.md` 里的任意一句话；
2. `git status` 确认是 `modified`；
3. 只撤销这一个文件（不要撤销别的）；
4. 确认它恢复了。

写出你用的完整命令。

## 练习三：查看某次提交改了什么

1. `git log --oneline` 找到第 1 次提交的哈希；
2. `git show <哈希> --stat` 看包含哪些文件；
3. `git show <哈希>` 看具体改了什么。

写出你观察到的内容。

## 练习四：想清楚这个场景

**场景：** 你改了 5 个文件，`add` 了其中 3 个，还没 `commit`。这时你发现第 1 个文件改错了，想撤销它。

**问：**

1. 用 `git restore <那个文件>` 能撤销吗？
2. 如果用 `git restore .` 会怎样？
3. 你已经 `add` 的那 3 个会受影响吗？

**先自己想，再实际操作验证。**

## 练习五：用自己的话讲

```text
为什么不能直接 commit，必须先 add？
为什么让 AI 改代码之前要让 git status 是干净的？
为什么 git reset --hard 危险？
为什么 cartSummary 修改 items 是错的？
```

---

# 第 12 步：最终验收

## A. 概念

- [ ] 我能说清工作区、暂存区、快照
- [ ] 我知道 `git add` 和 `git commit` 各做什么
- [ ] 我知道 `HEAD` 指最新提交
- [ ] 我知道 Git 和 GitHub 不是一回事
- [ ] 我知道什么是副作用

## B. 操作

- [ ] `git --version` 能正常输出
- [ ] 我做过至少 2 次提交
- [ ] 我会只 `add` 指定文件夹
- [ ] 我会看 `git status` 的两个区域
- [ ] 我会用 `git log --oneline` 看历史
- [ ] 我会用 `git show --stat HEAD` 确认改了几个文件
- [ ] 我会用 `git show HEAD` 看具体改了哪几行
- [ ] 我用 `git restore .` 成功回退过

## C. 习惯

- [ ] 我知道让 AI 大改之前必须先存档
- [ ] 我知道开工前要确认 `git status` 干净
- [ ] 我知道 `.env` 绝对不能提交
- [ ] 我知道 `git reset --hard` 会永久丢改动

## D. 查 bug

- [ ] 我自己用打印的方式查出了购物袋从哪来
- [ ] 我能解释“单次调用看不出、重复调用才暴露”
- [ ] 我知道修副作用要用 `concat` 这类不改原数组的方法

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] `git-log.md` 有两次提交和一次回退的完整记录
- [ ] “我还不懂的词”有内容

## 本节课要能说出口的一句话

> **存档不是为了保存完美版本，是为了让自己敢动手改。**

---

# 附：常见问题速查

| 情况 | 原因 | 怎么做 |
|---|---|---|
| `git: command not found` | 没装或没加环境变量 | 装好后关掉终端重开 |
| `fatal: not a git repository` | 当前目录不是仓库 | `cd` 到 `B:\OPC-Distance_study` |
| 中文路径报错 | 编码或引号问题 | 路径加英文双引号 |
| `add` 了整个仓库 | 用了 `git add -A` | 只 `add` 具体文件夹 |
| `commit` 提示要配置用户名 | 首次使用没配 | `git config --global user.name "名字"`、`user.email "邮箱"` |
| `git restore .` 后改动全没了 | 它就是这么设计的 | 那是未提交改动，恢复不了 |
| 新建文件没被 restore 删掉 | 它只处理已跟踪文件 | 手动删，或 `git clean -n` 先看 |
| `git show` 卡住不动 | 进入了分页查看 | 按 `q` 退出 |
| 提交信息写错了 | 已提交 | `git commit --amend` 改最近一条（会改历史，谨慎） |
| `.env` 已经提交了 | 忘了加 `.gitignore` | 立即换掉里面的密钥，并从历史清除 |
| `git log` 刷屏 | 没用 `--oneline` | 加 `--oneline`，或按 `q` 退出 |
| 两次 `cartSummary` 结果不同 | 函数修改了传进来的数组 | 用 `concat` 或 `[...items]` 造新数组 |
| 小计和手算不一样 | 可能漏看了业务规则（如默认加购物袋） | 先加打印看真实数据，别靠猜 |
| `git status` 显示一堆无关改动 | 前几节课没提交 | 只 `add` 你今天的文件夹 |
