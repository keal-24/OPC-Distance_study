# 第 79 节课：读取文字文档

> 这节课结束时，你手上有：`src\read-text.js`，喂给它一个 txt、md 或 docx，它返回 `{ text, encoding, title }`，GBK 和 BOM 都不会再让你看到乱码。

**时间**：约 100 分钟
**前置**：第 78 节课做出来的 `doc-parser\src\detect.js`

---

# 第 0 步：为什么要有这一步（10 分钟）

## 0.1 你现在会什么

你能判断一个文件的真实格式：`text`、`docx`、`pdf`、`xlsx`、`jpeg`。

你也知道 `fs.readFileSync(filePath, "utf8")` 能把文件读成字符串。**这节课要告诉你，这一行代码在中文环境里有一半的时候是错的。**

## 0.2 今天这个坑长什么样

**场景一：** 客户发来一个 `名单.csv`，你用 `readFileSync(path, "utf8")` 读，第一列的表头打印出来是 `"\ufeff姓名"`。你的代码写的是 `row["姓名"]`，全是 `undefined`。你盯着屏幕看，那个"姓名"两个字明明就在那里，但就是取不到值。

**场景二：** 客户发来一个 `通知.txt`，读出来是这样：

```text
����֪֪ͨ
��λ��
```

你以为文件坏了，让客户重发。客户重发三次还是一样。其实文件一点没坏，它是 GBK 编码，你用 UTF-8 解的。

**场景三：** 你在网上搜"乱码 锟斤拷"，看到一堆人说是编码问题，但没人说清这三个字到底怎么来的。你照着改代码，改完还是乱码。

**这三个场景的共同点：** 文件里的字节是对的，你的解码方式是错的。**文字文档的问题，90% 不在"读不出来"，在"读出来是错的，但程序不报错"。**

### 这节课你要准备的文件

| 文件 | 怎么弄出来 |
|---|---|
| `bom.txt` | 记事本里写三行中文（第一行写"会议纪要"），另存为，**编码选 `带有 BOM 的 UTF-8`** |
| `gbk.txt` | 同样的内容，另存为，**编码选 `ANSI`**（中文 Windows 上 ANSI 就是 GBK） |
| `plain.txt` | 同样的内容，另存为，**编码选 `UTF-8`**（不带 BOM） |
| `会议纪要.docx` | 第 78 节已经造过，直接复制过来。**必须用 Word 的"另存为"，不能改后缀** |
| `readme.md` | 第 78 节已经造过 |

`bom.txt` 和 `plain.txt` 内容一模一样，只有编码选项不同。**这两个文件的字节会差 3 个，就是这 3 个字节让你取不到值。**

Windows 11 的记事本在"另存为"对话框底部有一个"编码"下拉框，选项是：`UTF-8`、`带有 BOM 的 UTF-8`、`UTF-16 LE`、`ANSI`。**选错了不会报错，只会得到不同的字节。**

## 0.3 今天的三个概念

| 术语 | 一句话人话 | 今天在哪用 |
|---|---|---|
| BOM（Byte Order Mark） | 文件开头 3 个看不见的字节，告诉程序"我是 UTF-8" | `EF BB BF`，会让第一个字段名多一个字符 |
| 编码（encoding） | 同一段文字，用哪套规则翻译成字节 | UTF-8 一个汉字 3 字节，GBK 一个汉字 2 字节 |
| 兜底（fallback） | 主方案失败时换一套方案再试 | UTF-8 严格解码抛错 → 换 GBK |

## 0.4 今天的交付物

| 文件 | 位置 | 内容 |
|---|---|---|
| `src\read-text.js` | `第02节课\03-练习代码\doc-parser\` | `readTextFile()` 和 `readDocx()` |
| `src\encoding-lab.js` | 同上 | 编码实验，打印字节和结果 |
| `out\docx-lost.md` | 同上 | 记录 docx 转文本丢了什么 |
| `NOTES.md` | `第02节课\02-笔记\` | 学习记录 |

---

# 第 1 步：把项目复制过来（10 分钟）

## 1.1 做什么 / 为什么

从这节课开始，每节课一个检查点。你把上一节的项目复制到本节，改坏了就删掉重来，不会影响上一节的成果。

## 1.2 操作

```text
cd /d B:\OPC-Distance_study\每周课程\03-数据与智能\第12周-文档解析\第02节课\03-练习代码
xcopy "..\..\第01节课\03-练习代码\doc-parser" "doc-parser" /E /I /Y
cd doc-parser
npm install mammoth
```

`xcopy` 的四个参数：

| 参数 | 意思 |
|---|---|
| `/E` | 连空文件夹一起复制 |
| `/I` | 目标是文件夹，别问我 |
| `/Y` | 覆盖时不问 |
| 最后的 `\` | 明确这是目录，不是文件 |

`npm install mammoth` 是这周装的第一个包。它是白名单里的，专门把 docx 转成纯文本。

## 1.3 屏幕上应该看到什么

```text
..\..\第01节课\03-练习代码\doc-parser\package.json
..\..\第01节课\03-练习代码\doc-parser\src\detect.js
..\..\第01节课\03-练习代码\doc-parser\src\detect-report.js
..\..\第01节课\03-练习代码\doc-parser\src\hexdump.js
复制了 4 个文件
```

`npm install`：

```text
added 12 packages, and audited 13 packages in 2s

3 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

`package.json` 里会多出一段：

```json
"dependencies": {
  "mammoth": "^1.8.0"
}
```

**版本号可能不一样，不用管。** 只要 `mammoth` 三个字在就行。

## 1.4 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `xcopy` 问"目标是文件名还是目录" | 目标末尾没加 `\` 或者没加 `/I` | 加上 `/I` |
| `npm ERR! code ENOENT` | 当前目录没有 `package.json` | `dir` 确认在 `doc-parser` 里 |
| `npm ERR! network` | 网络或镜像问题 | 换镜像：`npm config set registry https://registry.npmmirror.com` |
| `mammoth` 装上但 `require` 报错 | 装到了别的目录 | `dir node_modules\mammoth` 确认存在 |

---

# 第 2 步：先用字节看清三种编码（20 分钟）

## 2.1 做什么 / 为什么

在写解码函数之前，先看同一段文字在三种编码下的字节。**你看到字节，才会相信"乱码不是文件坏了"。**

## 2.2 操作

新建 `src\encoding-lab.js`：

```javascript
const fs = require("fs");

function dump(filePath, n = 24) {
  const buf = fs.readFileSync(filePath);
  const head = buf.subarray(0, n);

  const hex = [...head].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  const utf8 = buf.toString("utf8");
  const gbk = new TextDecoder("gbk").decode(buf);

  console.log("=".repeat(70));
  console.log("文件：", filePath, "大小：", buf.length, "字节");
  console.log("前", head.length, "字节：", hex);
  console.log("按 UTF-8 解：", JSON.stringify(utf8.slice(0, 40)));
  console.log("按 GBK  解：", JSON.stringify(gbk.slice(0, 40)));
}

dump("samples\\plain.txt");
dump("samples\\bom.txt");
dump("samples\\gbk.txt");
```

运行：

```text
node src\encoding-lab.js
```

## 2.3 屏幕上应该看到什么

```text
======================================================================
文件： samples\plain.txt 大小： 90 字节
前 24 字节： E4 BC 9A E8 AE AE E7 BA AA E8 A6 81 0D 0A E6 97 B6 E9 97 B4 EF BC 9A
按 UTF-8 解： "会议纪要\r\n时间：2026年11月16日"
按 GBK  解： "浼氳绾\r\n鏃堕棿锛?026骞?1鏈?6鏃?"
======================================================================
文件： samples\bom.txt 大小： 93 字节
前 24 字节： EF BB BF E4 BC 9A E8 AE AE E7 BA AA E8 A6 81 0D 0A E6 97 B6
按 UTF-8 解： "\ufeff会议纪要\r\n时间：2026年11月16日"
按 GBK  解： "锘夸細璁邯\r\n..."
======================================================================
文件： samples\gbk.txt 大小： 60 字节
前 24 字节： BB E1 D2 E9 BC CD D2 AA 0D 0A CA B1 BC E4 A3 BA 32 30 32 36
按 UTF-8 解： "����\r\nʱ��2026"
按 GBK  解： "会议纪要\r\n时间：2026年11月16日"
```

**三种文件，三段信息，逐行对照：**

| 文件 | 大小 | 开头 | UTF-8 解出来 | GBK 解出来 |
|---|---|---|---|---|
| `plain.txt` | 90 | `E4 BC 9A` | 正确 | 乱码（`浼氳`） |
| `bom.txt` | 93 | `EF BB BF` | 正确但开头多 `\ufeff` | 乱码 |
| `gbk.txt` | 60 | `BB E1` | `����` | 正确 |

**注意大小：** 同样一段中文，UTF-8 是 90 字节，GBK 是 60 字节。因为 UTF-8 一个汉字 3 字节，GBK 一个汉字 2 字节。**文件大小本身就是一条线索。**

**注意 `bom.txt` 比 `plain.txt` 大 3 字节。** 那 3 个字节就是 `EF BB BF`。

## 2.4 `\ufeff` 是怎么害人的

BOM 不是一个"看不见的字符"，它是**一个真实的字符**：U+FEFF，叫"零宽不换行空格"。

`JSON.stringify` 会把它老老实实打成 `\ufeff`，所以你能看见。但 `console.log` 打出来是隐形的，你的眼睛看不出来。

**它怎么毁掉一个 CSV：**

```javascript
const text = fs.readFileSync("samples\\bom.csv", "utf8");
const lines = text.split("\n");
const headers = lines[0].split(",");
console.log(headers[0]);          // 打印出来看着是 "姓名"
console.log(headers[0] === "姓名"); // false
console.log(headers[0].length);    // 3，不是 2
```

`headers[0]` 的真实值是 `"\ufeff姓名"`——三个字符。你写 `row["姓名"]`，永远取不到。

**为什么 `trim()` 不一定救得了你：**

`trim()` 确实会去掉开头的 U+FEFF（在 JavaScript 里它算空白字符）。但有两个问题：

1. 你要是按行 `split` 之后再 `trim` 每个字段，能救；但你不知道要 trim，因为你**看不见**它。
2. 如果 BOM 出现在文件中间（拼接文件、日志追加），`trim()` 只处理两头，中间的去不掉。

**正确做法：解码的时候就把 BOM 剥掉，不要留给后面。** 这样后面所有代码都不需要知道 BOM 存在。

## 2.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `bom.txt` 开头不是 `EF BB BF` | 另存时选了"UTF-8"而不是"带有 BOM 的 UTF-8" | 重新另存，注意下拉框 |
| `gbk.txt` 开头不是 `BB E1` | 你的系统区域不是中文，ANSI 不是 GBK | 用 `notepad` 存成 ANSI 后看字节；不是 `BB E1` 就说明不是中文 GBK |
| `RangeError: The "gbk" encoding is not supported` | Node 是 small-icu 构建 | 用官方安装包重装 Node；`node -p "process.config.variables.icu_small"` 输出 `false` 才对 |
| 中文显示成方块 | cmd 代码页不是 936 | 运行 `chcp 936`；或改用 Windows Terminal |

---

# 第 3 步：写 decodeBuffer（30 分钟）

## 3.1 做什么 / 为什么

一个函数，输入 `Buffer`，输出 `{ text, encoding, bom }`。三条规则，按顺序试：

```text
1. 有 BOM → 按 BOM 说的编码解，剥掉 BOM
2. 没有 BOM → 用 UTF-8 严格模式解，成功就返回
3. 严格模式抛错 → 用 GBK 解，返回
```

**关键是第 2 步的"严格模式"。** 默认的 `TextDecoder` 遇到非法字节会替换成 `�`，不报错。你必须加 `{ fatal: true }`，它才会抛错，你才有机会走第 3 步。

## 3.2 操作

新建 `src\read-text.js`：

```javascript
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

function decodeBuffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    const text = new TextDecoder("utf-8").decode(buf.subarray(3));
    return { text, encoding: "utf-8-bom", bom: true };
  }

  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    const text = new TextDecoder("utf-16le").decode(buf.subarray(2));
    return { text, encoding: "utf-16le", bom: true };
  }

  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const text = new TextDecoder("utf-16be").decode(buf.subarray(2));
    return { text, encoding: "utf-16be", bom: true };
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { text, encoding: "utf-8", bom: false };
  } catch (err) {
    const text = new TextDecoder("gbk").decode(buf);
    return { text, encoding: "gbk", bom: false };
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function readTextFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const decoded = decodeBuffer(buf);
  const text = normalizeNewlines(stripBom(decoded.text));

  return {
    title: path.basename(filePath, path.extname(filePath)),
    text,
    encoding: decoded.encoding,
    bom: decoded.bom,
    charCount: text.length,
  };
}

async function readDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  const text = normalizeNewlines(stripBom(result.value));

  return {
    title: path.basename(filePath, path.extname(filePath)),
    text,
    encoding: "docx",
    bom: false,
    charCount: text.length,
    messages: result.messages,
  };
}

module.exports = { decodeBuffer, readTextFile, readDocx, stripBom, normalizeNewlines };

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.log("用法：node src\\read-text.js samples\\gbk.txt");
    process.exit(1);
  }

  const ext = path.extname(target).toLowerCase();

  const run = async () => {
    const result = ext === ".docx" ? await readDocx(target) : readTextFile(target);

    console.log("文件：", target);
    console.log("编码：", result.encoding, "BOM：", result.bom);
    console.log("字符数：", result.charCount);
    console.log("标题：", result.title);
    console.log("前 60 字符（JSON 形式）：");
    console.log(JSON.stringify(result.text.slice(0, 60)));
    console.log("--- 正文预览 ---");
    console.log(result.text.slice(0, 300));
  };

  run().catch((err) => {
    console.error("解析失败：", err.message);
    process.exit(1);
  });
}
```

运行三个文件：

```text
node src\read-text.js samples\plain.txt
node src\read-text.js samples\bom.txt
node src\read-text.js samples\gbk.txt
```

## 3.3 屏幕上应该看到什么

`plain.txt`：

```text
文件： samples\plain.txt
编码： utf-8 BOM： false
字符数： 36
标题： plain
前 60 字符（JSON 形式）：
"会议纪要\n时间：2026年11月16日\n地点：三楼会议室\n参会人：张三、李四、王五"
--- 正文预览 ---
会议纪要
时间：2026年11月16日
地点：三楼会议室
参会人：张三、李四、王五
```

`bom.txt`：

```text
文件： samples\bom.txt
编码： utf-8-bom BOM： true
字符数： 36
前 60 字符（JSON 形式）：
"会议纪要\n时间：2026年11月16日\n地点：三楼会议室\n参会人：张三、李四、王五"
```

**注意 `bom.txt` 的 `JSON.stringify` 输出里没有 `\ufeff`。** 因为 `decodeBuffer` 已经把它剥掉了，`charCount` 也是 36，和 `plain.txt` 一样。**这就是"在入口处解决"的价值：后面所有代码都不用处理 BOM。**

`gbk.txt`：

```text
文件： samples\gbk.txt
编码： gbk BOM： false
字符数： 36
前 60 字符（JSON 形式）：
"会议纪要\n时间：2026年11月16日\n地点：三楼会议室\n参会人：张三、李四、王五"
```

**三种编码，同样的 36 个字符。** 这是今天第一个"做对了"的信号。

## 3.4 逐段解释

**为什么先判 BOM，再判 UTF-8：**

BOM 是明确的声明，优先级最高。`EF BB BF` 开头的文件，即使内容刚好也是合法 UTF-8，你也应该按 BOM 处理并剥掉它。

**为什么 `utf-16be` 很少见还要写：**

Windows 记事本的"Unicode big endian"选项会产出 `FE FF`。遇到不处理，就会掉进 UTF-8 严格模式，抛错，然后被 GBK 解成乱码。**多写三行，少一个客服工单。**

**为什么 `fatal: true` 是整节课的关键：**

```javascript
new TextDecoder("utf-8").decode(gbkBuffer)        // 返回 "����"，不报错
new TextDecoder("utf-8", { fatal: true }).decode(gbkBuffer)  // 抛 TypeError
```

没有 `fatal: true`，你永远进不了 GBK 分支。**"程序没报错"不等于"解析对了"，这是这一节最贵的一句话。**

**为什么 `normalizeNewlines` 单独一个函数：**

Windows 的换行是 `\r\n`，Unix 是 `\n`，老 Mac 是 `\r`。三种混在一个文件里，你按 `\n` 切会留下 `\r` 在行尾。后面用 `=== "北京"` 比较会失败，因为实际是 `"北京\r"`。**统一在入口处转成 `\n`，后面就不用管了。**

**为什么 `stripBom` 还要再调一次：**

`decodeBuffer` 已经处理了 BOM，但 `mammoth` 返回的文本有可能自带 U+FEFF（Word 里复制粘贴会带进来）。这是防御性的一行，成本几乎为零。

## 3.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `gbk.txt` 输出 `����` | `fatal: true` 没加，或者被 try 吞了 | 检查 `new TextDecoder("utf-8", { fatal: true })` |
| `bom.txt` 字符数比 `plain.txt` 多 1 | `stripBom` 没生效 | 打印 `text.charCodeAt(0)` 看是不是 65279 |
| `utf-16be` 解出来是乱码 | `TextDecoder("utf-16be")` 不支持 | 某些 Node 构建只支持 `utf-16le`；改成手动交换字节序 |
| `mammoth is not defined` | 忘了 `require` | 文件顶部加 `const mammoth = require("mammoth")` |
| `Cannot find module 'mammoth'` | 装到了别的目录 | `dir node_modules\mammoth`，不在就重装 |

---

# 第 4 步：把 `锟斤拷` 造出来（15 分钟）

## 4.1 做什么 / 为什么

`锟斤拷` 是中文互联网上最有名的乱码。**大部分人只知道它叫乱码，不知道它是"错两次"的产物。** 你自己造一次，以后看到它就知道数据已经被毁过一轮，原字找不回来了。

## 4.2 操作

新建 `src\mojibake-lab.js`：

```javascript
const cases = [
  { name: "直接用 UTF-8 解 GBK 字节", buf: Buffer.from([0xbb, 0xe1, 0xd2, 0xe9]) },
  { name: "两个替换字符按 GBK 解", buf: Buffer.from([0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd]) },
  { name: "四个替换字符按 GBK 解", buf: Buffer.from([0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd]) },
];

for (const c of cases) {
  console.log("实验：", c.name);
  console.log("  字节：", [...c.buf].map((b) => b.toString(16).toUpperCase()).join(" "));
  console.log("  UTF-8：", JSON.stringify(new TextDecoder("utf-8").decode(c.buf)));
  console.log("  GBK  ：", JSON.stringify(new TextDecoder("gbk").decode(c.buf)));
  console.log("");
}
```

运行：

```text
node src\mojibake-lab.js
```

## 4.3 屏幕上应该看到什么

```text
实验： 直接用 UTF-8 解 GBK 字节
  字节： BB E1 D2 E9
  UTF-8： "����"
  GBK  ： "会议"

实验： 两个替换字符按 GBK 解
  字节： EF BF BD EF BF BD
  UTF-8： "��"
  GBK  ： "锟斤拷"

实验： 四个替换字符按 GBK 解
  字节： EF BF BD EF BF BD EF BF BD EF BF BD
  UTF-8： "����"
  GBK  ： "锟斤拷锟斤拷"
```

## 4.4 这三个字到底怎么来的

链条是这样的：

```text
① 原始文件是 GBK 的 "会议"，字节 BB E1 D2 E9
② 某个程序把它当成 UTF-8 解码
   BB 不是合法 UTF-8 起始字节 → 替换成 U+FFFD
   E1 也不合法 → 替换成 U+FFFD
   结果：两个替换字符，字节 EF BF BD EF BF BD
③ 这段已经坏掉的文本，又被按 GBK 编码保存
   EF BF → 锟
   BD EF → 斤
   BF BD → 拷
④ 你打开看到：锟斤拷
```

**关键结论：**

1. `锟斤拷` 不是"GBK 被当 UTF-8 读"的直接结果。直接读你看到的是 `����`。
2. 它是**第二次错误**的产物：替换字符被当成 GBK 又存了一遍。
3. 到了第 ④ 步，**原始字节已经丢了，任何代码都救不回来。** 你只能拿到原始文件重新解一次。

**这就是为什么"入口处判断编码"比"事后再修"重要。** 修是修不回来的。

## 4.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| GBK 那行显示 `??` | cmd 代码页不是 936 | `chcp 936` 后重跑，或者把输出重定向到文件再用 VS Code 看 |
| 输出 `锟斤拷` 但只有两个字 | 你的字节数组长度不对 | 必须是 6 个字节（3 个两字节组合） |
| `TextDecoder` 报 `gbk` 不支持 | small-icu | 重装官方 Node |

---

# 第 5 步：docx 用 mammoth，说清丢了什么（25 分钟）

## 5.1 做什么 / 为什么

docx 不能"读文本"，它是 zip 包里的一堆 XML。你要么自己解 XML（几百行），要么用 `mammoth`。

`mammoth` 的定位很明确：**把 docx 转成"干净的 HTML 或纯文本"，它不负责还原版式。**

**这意味着它会丢东西。** 你必须知道丢了什么，否则客户问"为什么我的批注没了"，你答不上来。

## 5.2 操作

先造一个"什么都有"的 docx：`samples\复杂文档.docx`。

用 Word 新建，按下面加内容：

```text
1. 页眉：写"公司内部资料"
2. 页脚：写"第 1 页 共 1 页"
3. 标题：一级标题"2026 年采购计划"
4. 正文第一段：加粗一句话，斜体一句话
5. 一个 3 行 2 列的表格
6. 一条批注：选中"采购"两个字，加批注"这里要改成招标"
7. 一条脚注
8. 一张图片（随便插入一个小图）
9. 一个项目符号列表（3 项）
```

保存为 `samples\复杂文档.docx`。

然后写一个对照脚本 `src\docx-lab.js`：

```javascript
const mammoth = require("mammoth");

async function main() {
  const filePath = "samples\\复杂文档.docx";

  const raw = await mammoth.extractRawText({ path: filePath });

  console.log("=== extractRawText 结果 ===");
  console.log("字符数：", raw.value.length);
  console.log("正文：");
  console.log(raw.value);
  console.log("=== messages ===");
  for (const m of raw.messages) {
    console.log("[" + m.type + "]", m.message);
  }

  const html = await mammoth.convertToHtml({ path: filePath });
  console.log("=== convertToHtml 结果（前 400 字符）===");
  console.log(html.value.slice(0, 400));
}

main().catch((err) => {
  console.error("失败：", err.message);
  process.exit(1);
});
```

运行：

```text
node src\docx-lab.js
```

## 5.3 屏幕上应该看到什么

```text
=== extractRawText 结果 ===
字符数： 186
正文：
2026 年采购计划

今年计划采购办公设备一批，预算控制在三十万元以内。采购流程需要经过三家比价。

设备名称	数量	预算
笔记本电脑	10	80000
打印机	2	6000

主要时间节点如下：
办公设备
耗材
维修服务

=== messages ===
=== convertToHtml 结果（前 400 字符）===
<p>2026 年采购计划</p><p>今年计划采购办公设备一批，预算控制在三十万元以内。<strong>采购</strong>流程需要经过三家比价。</p><table><tr><td>设备名称</td><td>数量</td><td>预算</td></tr>...
```

**你造的时候加了九样东西，正文里只剩五样。** 对照一下：

| 你加的东西 | `extractRawText` 里有没有 | 说明 |
|---|---|---|
| 标题文字 | 有 | 文字保留，但"一级标题"这个级别没了 |
| 加粗 / 斜体 | 文字有，格式没有 | 纯文本没有"粗"这个概念 |
| 表格 | 有，单元格之间用 Tab 分隔 | 结构在，但不是二维数组 |
| 页眉"公司内部资料" | **没有** | `extractRawText` 不读页眉 |
| 页脚"第 1 页 共 1 页" | **没有** | 同上 |
| 批注"这里要改成招标" | **没有** | 批注存在 `comments.xml`，不在正文流 |
| 脚注 | **没有** | 脚注也是独立部分 |
| 图片 | **没有** | 图片是二进制，转文本时直接丢 |
| 项目符号列表 | 文字有，符号没有 | 三个词还在，`•` 没了 |

`convertToHtml` 比纯文本多保留了 `<strong>` 和 `<table>`，但页眉、批注、脚注、图片一样没有。

## 5.4 为什么这是对的取舍

你可能会想："那我用 `convertToHtml` 不就行了，保留得更多。"

**不行，理由有三：**

1. **你要的是检索用的文本，不是网页。** 第 13 周的 `chunks` 里存的是纯文本，HTML 标签会变成噪音，还会占用 token。
2. **`convertToHtml` 保留的格式对你的下游没用。** `<strong>` 对"这段话讲什么"没有任何帮助，反而让字数统计和切分变复杂。
3. **真正重要的丢失项（页眉、批注、脚注），`convertToHtml` 一样救不回来。** 多保留的那点格式，换不来关键信息。

**如果客户说"页眉里的合同编号很重要"，怎么办？**

不要改 `mammoth` 的配置（它没有这个选项）。正确做法是：**告诉客户"页眉页脚不在正文里，请把编号写进正文第一段"，或者单独用 `jszip` 解 `word/header1.xml`（这不在本周白名单里，属于第 6 阶段的事）。**

**这就是判断力：不是所有丢失都要在代码里补，有些要在需求上解决。**

## 5.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `Could not find file '[Content_Types].xml' in the zip file` | 文件是 `.doc` 不是 `.docx` | `detectFormat` 应该返回 `ole`，不要送进 mammoth |
| `Could not find the main document part` | 是 xlsx 或 pptx，被误当成 docx | 用第 78 节的分派，别硬来 |
| 输出是 `[object Promise]` | 忘了 `await` | `const raw = await mammoth.extractRawText(...)` |
| 中文变乱码 | 不会发生，mammoth 内部按 XML 解析 | 如果发生，检查是不是读错了文件 |
| `messages` 里有一堆 `unrecognised element` | 文档里有 mammoth 不认识的元素（如文本框） | 正常，记录在 `out\docx-lost.md` 里 |

---

# 第 6 步：统一入口 readDocumentText（15 分钟）

## 6.1 做什么 / 为什么

现在你有 `readTextFile` 和 `readDocx` 两个函数。上层调用者不应该关心"这个文件该用哪个"。

写一个统一入口，**输入路径，输出同样的结构**。这是第 83 节 `parse()` 的雏形。

## 6.2 操作

在 `src\read-text.js` 末尾加：

```javascript
async function readDocumentText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".docx") {
    return await readDocx(filePath);
  }

  if (ext === ".txt" || ext === ".md" || ext === ".csv") {
    return readTextFile(filePath);
  }

  throw new Error("readDocumentText 不支持的扩展名：" + ext);
}
```

把 `module.exports` 改成：

```javascript
module.exports = {
  decodeBuffer,
  readTextFile,
  readDocx,
  readDocumentText,
  stripBom,
  normalizeNewlines,
};
```

再新建 `src\text-report.js`，批量跑一遍：

```javascript
const fs = require("fs");
const path = require("path");
const { detectFormat } = require("./detect");
const { readDocumentText } = require("./read-text");

const dir = process.argv[2] || "samples";

async function main() {
  const files = fs.readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((p) => fs.statSync(p).isFile())
    .sort();

  for (const file of files) {
    const info = detectFormat(file);
    const name = path.basename(file);

    if (info.format !== "text" && info.format !== "docx") {
      console.log("[跳过]", name, "→", info.format);
      continue;
    }

    try {
      const result = await readDocumentText(file);
      console.log(
        "[成功]", name,
        "| 编码:", result.encoding,
        "| 字符:", result.charCount,
        "| 首行:", JSON.stringify(result.text.split("\n")[0].slice(0, 30))
      );
    } catch (err) {
      console.log("[失败]", name, "|", err.message);
    }
  }
}

main();
```

运行：

```text
node src\text-report.js samples
```

## 6.3 屏幕上应该看到什么

```text
[跳过] 报告-改了名.txt → pdf
[跳过] 政策.pdf → pdf
[跳过] 照片.jpg → jpeg
[成功] plain.txt | 编码: utf-8 | 字符: 36 | 首行: "会议纪要"
[成功] bom.txt | 编码: utf-8-bom | 字符: 36 | 首行: "会议纪要"
[成功] gbk.txt | 编码: gbk | 字符: 36 | 首行: "会议纪要"
[成功] readme.md | 编码: utf-8 | 字符: 48 | 首行: "# 我的第一份文档"
[成功] 会议纪要.docx | 编码: docx | 字符: 186 | 首行: "2026 年采购计划"
[成功] 数据.csv | 编码: utf-8 | 字符: 88 | 首行: "姓名,城市,金额"
[跳过] 表格-改了名.txt → xlsx
[跳过] 预算.xlsx → xlsx
[跳过] 文档-没后缀 → docx
```

**注意最后一行 `文档-没后缀 → docx` 被跳过了。** 这是对的：`detectFormat` 说它是 docx，但 `readDocumentText` 只看扩展名，扩展名是空字符串，所以报"不支持"。

**这是一个真实的设计缺陷，也是留给你的练习。** 正确做法是用第 78 节的 `detectFormat` 结果来分派，而不是看扩展名。第 83 节的 `parse()` 会修掉它。

## 6.4 为什么现在不修

因为这一节的主题是"读文字文档"，不是"分派"。**先把一件事做对，再做第二件。** 如果你现在就把 `detectFormat` 接进来，你会同时改两个东西，出错时分不清是编码问题还是分派问题。

第 83 节会把 `readDocumentText` 改造成只接受 `format` 参数的函数，由 `parse()` 负责探测。**今天先让它带着这个缺陷跑通，你才知道缺陷长什么样。**

## 6.5 如果不是这样

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `readDocumentText 不支持的扩展名：` | 文件没有后缀 | 正常，第 83 节修 |
| `数据.csv` 被当纯文本读 | 这一节还没写 CSV 解析器 | 正常，第 80 节做 |
| `readme.md` 首行带 `#` | 没做 Markdown 清洗 | 正常，先保留原样 |
| 某个 docx 报 `Corrupt zip` | 文件损坏或不完整 | 让客户重发，不要试图修复 |

---

# 第 7 步：故意犯 4 个错（15 分钟）

## 错误 1：用宽容模式解 UTF-8

**操作：** 把 `decodeBuffer` 里的 `{ fatal: true }` 删掉。

**现象：** `gbk.txt` 会被判成 `utf-8`，正文是：

```text
编码： utf-8 BOM： false
字符数： 24
"����\nʱ��2026��11��16��"
```

不报错，不抛异常，`charCount` 从 36 变成 24。**如果你只检查"有没有报错"，你会认为成功了。**

**原因：** 宽容模式把非法字节替换成 U+FFFD，一个汉字 2 字节变成 2 个替换字符，长度就变了。**"长度对不上"是编码错误最可靠的信号。**

**怎么查：** 打印 `charCount`，和文件大小对比。中文文本的字符数应该接近"字节数 ÷ 3"（UTF-8）或"字节数 ÷ 2"（GBK）。如果差得远，就是编码错了。

## 错误 2：以为 `trim()` 能解决 BOM

**操作：** 在 `readTextFile` 里把 `stripBom` 去掉，改成 `text.trim()`。

**现象：** 单独跑 `bom.txt` 看起来正常，因为 BOM 在文件最开头，`trim()` 把它去掉了。

**但是**，如果你按行处理：

```javascript
const lines = text.split("\n");
console.log(JSON.stringify(lines[0]));
```

输出是 `"\ufeff会议纪要"`——**`trim()` 只处理整个字符串的两头，不处理每一行。** 你按行切完，第一行开头还带着 BOM。

**原因：** `trim()` 的作用域是整个字符串。你以为它"清理了文本"，其实只清理了第一个字符和最后一个字符。

**怎么查：** 对每一行做 `JSON.stringify`，看有没有 `\ufeff`。或者打印 `line.charCodeAt(0)`，65279 就是它。

## 错误 3：对 `.doc` 用 mammoth

**操作：** 把第 78 节存的 `旧合同.doc` 传给 `readDocx`。

**现象：**

```text
解析失败： Could not find file '[Content_Types].xml' in the zip file
```

（不同版本措辞略有差别，关键词是 `[Content_Types].xml` 或 `main document part`。）

**原因：** `.doc` 是 OLE 复合文档，不是 zip。`mammoth` 一进来就找 zip 的中央目录，找不到就报这个。

**怎么查：** 先跑 `node src\detect.js samples\旧合同.doc`，看到 `format: "ole"` 就不要往下走。**探测的意义就在这里：在调用解析器之前就把不可能的情况拦住。**

## 错误 4：把 `await` 忘了

**操作：** 把 `const result = await mammoth.extractRawText(...)` 改成 `const result = mammoth.extractRawText(...)`。

**现象：**

```text
字符数： undefined
正文： undefined
```

或者 `TypeError: Cannot read properties of undefined (reading 'value')`。

**原因：** `extractRawText` 返回 Promise。不 `await`，你拿到的是 Promise 对象，不是结果。

**怎么查：** 看到 `undefined` 或者 `[object Promise]`，第一反应就是"少了个 await"。

## 四个错误总结

```text
宽容模式解 UTF-8   → 不报错，但字符数变少，正文是 ����
trim() 代替 stripBom → 单文件看着对，按行处理就中招
对 .doc 用 mammoth  → 缺 [Content_Types].xml
忘写 await          → undefined 或 [object Promise]
```

---

# 第 8 步：写学习笔记（10 分钟）

在 `第02节课\02-笔记\NOTES.md` 里写，小标题照下面抄：

## 一、BOM 是什么，为什么它会毁掉一个 CSV

## 二、我造出来的三个编码样本

## 三、UTF-8 严格解码和宽容解码的区别

## 四、GBK 兜底什么时候会误判

## 五、`锟斤拷` 到底是怎么产生的

## 六、docx 转纯文本丢了什么

## 七、mammoth 的 messages 里说了什么

## 八、md 和 txt 的区别（以及为什么先不处理标记）

## 九、四个错误的后果

## 十、我还不懂的词

## 十一、完成检查

---

# 第 9 步：课后练习

## 练习一：加一个编码探测报告

写 `src\encoding-report.js`，遍历 `samples` 里所有 `text` 格式的文件，输出：

```text
plain.txt    utf-8      90 字节  36 字符  每字符 2.50 字节
bom.txt      utf-8-bom  93 字节  36 字符  每字符 2.58 字节
gbk.txt      gbk        60 字节  36 字符  每字符 1.67 字节
```

**要求：** 算出"字节数 ÷ 字符数"，用它来判断编码是否合理。UTF-8 中文大约 3，GBK 中文大约 2。

## 练习二：处理一个"混合编码"的文件

把 `plain.txt` 和 `gbk.txt` 用 `copy /b` 拼起来：

```text
copy /b samples\plain.txt + samples\gbk.txt samples\mixed.txt
```

用它跑 `readTextFile`，观察结果。

**问题：** 为什么一定会错？有没有办法修？（提示：没有完美的办法。真实项目里的做法是"整文件一个编码"，遇到混合文件就报错让人工处理。）

**要求：** 在 `encoding-report.js` 里加一条规则：如果 UTF-8 严格解码失败、GBK 解出来又有大量 `�`，就标记 `encoding: "unknown"`，不要硬猜。

## 练习三：把 `readDocumentText` 改成按 format 分派

**要求：** 函数签名改成 `readDocumentText(filePath, format)`，用第 78 节的 `detectFormat` 结果传进来，不再看扩展名。

改完后 `文档-没后缀` 应该能成功读出，`数据.csv` 仍然走纯文本（第 80 节再改）。

## 练习四：写一份"docx 丢失清单"给客户

在 `out\docx-lost.md` 里，用**客户能看懂的话**写：

- 我们会提取什么；
- 我们不会提取什么（页眉、页脚、批注、脚注、图片、格式）；
- 如果这些信息重要，你需要在文档里怎么改。

**要求：** 不许用"XML""part""namespace"这种词。假设客户不懂技术。

## 练习五：用自己的话讲清

1. 为什么 `new TextDecoder("utf-8").decode()` 解 GBK 文件不报错？这为什么危险？
2. `锟斤拷` 是怎么来的？为什么到了这一步就救不回来了？
3. 为什么 BOM 要在解码时剥掉，而不是在后面用 `trim()`？
4. `mammoth` 丢了页眉，你会怎么跟客户解释？会不会改代码去补？

---

# 第 10 步：最终验收

## A. 概念

- [ ] 我能说清 BOM 是哪三个字节，它为什么会让字段名对不上
- [ ] 我知道 UTF-8 和 GBK 一个汉字各占几字节
- [ ] 我能解释 `fatal: true` 的作用
- [ ] 我知道 `锟斤拷` 是"错两次"的产物
- [ ] 我能列出 `mammoth` 至少丢了四样东西

## B. 实操

- [ ] `doc-parser` 从第 78 节复制过来了，`mammoth` 装好了
- [ ] `samples` 里有 `plain.txt`、`bom.txt`、`gbk.txt`
- [ ] `node src\read-text.js samples\gbk.txt` 输出 `编码： gbk`，正文正确
- [ ] `node src\read-text.js samples\bom.txt` 输出 `BOM： true`，正文没有 `\ufeff`
- [ ] `node src\read-text.js samples\会议纪要.docx` 能读出正文
- [ ] `node src\text-report.js samples` 打印出编码和字符数

## C. 排错

- [ ] 看到 `����` 我知道是编码选错，不是文件坏了
- [ ] 看到字符数明显变少，我知道要查 `fatal: true`
- [ ] 看到 `[Content_Types].xml` 我知道是 `.doc`
- [ ] 看到 `undefined` 我知道先查 `await`
- [ ] 看到 `RangeError: "gbk" is not supported` 我知道是 Node 的 ICU 问题

## D. 笔记

- [ ] `NOTES.md` 十一个小标题都在
- [ ] "我造出来的三个编码样本"那张表填了真实字节
- [ ] `锟斤拷` 的产生链条我自己画了一遍
- [ ] "docx 丢失清单"写完了，客户能看懂

## 本节课要能说出口的一句话

> **文字文档的坑不在读不出来，在读出来是错的却不报错；所以解码要严格，判断要显式，BOM 要在入口剥掉。**

---

# 附：常见问题速查

| 现象 | 先查什么 | 怎么办 |
|---|---|---|
| 正文全是 `����` | 文件是 GBK，被当 UTF-8 | 用 `fatal: true` 走兜底 |
| 字段名取不到 | 开头有 `\ufeff` | 解码时剥 BOM |
| 字符数比预期少一半 | 编码判错 | 打印 `encoding` 和 `charCount` |
| `TypeError: The encoded data was not valid` | 这是正常的信号，不是 bug | 在 catch 里转 GBK |
| `RangeError: "gbk" is not supported` | Node small-icu | 重装官方 Node |
| `Could not find [Content_Types].xml` | 文件是 `.doc` | 让客户另存为 docx |
| `Could not find the main document part` | 是 xlsx 被当 docx | 用 detectFormat 分派 |
| docx 读出 `undefined` | 忘了 `await` | 加 await |
| 页眉内容读不到 | mammoth 不读页眉 | 需求上解决，别改代码硬补 |
| 中文在 cmd 里是方块 | 代码页不是 936 | `chcp 936` |
| `\r` 留在行尾 | 没做换行归一 | 入口统一转 `\n` |
| 文件有 93 字节但只读出 36 字符 | 正常，UTF-8 中文 3 字节一个 | 看"字节÷字符"比例 |
