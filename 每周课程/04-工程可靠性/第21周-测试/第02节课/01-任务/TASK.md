# 第 142 节课：单元测试（纯函数）

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天写 20 条测试，然后**故意改坏代码 5 次，确认它们都会失败。**
> 后半句比前半句重要 —— 不会失败的测试是摆设。

**建议用时**：120 分钟
**你需要先完成**：第 141 节的 `TEST-PLAN.md`
**今天要装**：什么都不用装（`node --test` 是 Node 内置）

---

# 第 0 步：先跑通一条测试（15 分钟）

## 0.1 确认 Node 版本

```bash
node --version
```

**需要 ≥ 18。** 如果低于 18，先升级（`node --test` 在 18 才稳定）。

## 0.2 建目录

```bash
mkdir -p test
```

## 0.3 第一条测试

**新建 `test/ticket.test.js`：**

```javascript
// test/ticket.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideUrgency } from "../app/services/ticket.js";

test("金额 600 → high", () => {
  assert.equal(decideUrgency("东西坏了", 600), "high");
});
```

```bash
node --test test/
```

**期望输出：**

```text
▶ 金额 600 → high
  ✔ 金额 600 → high (1.2ms)
✔ test/ticket.test.js (2.5ms)

ℹ tests 1
ℹ pass 1
ℹ fail 0
```

**看到 `pass 1` 就说明管道通了。**

## 0.4 立刻做一次"故意破坏"

**把代码改坏：**

```javascript
// app/services/ticket.js
if (Number(amount) >= 500) return "high";
// 改成
if (Number(amount) >= 700) return "high";
```

```bash
node --test test/
```

**必须看到 `fail 1`。**

```text
✖ 金额 600 → high
  AssertionError: Expected "high", actual "medium"
```

**然后改回去。**

**这一步为什么必须做？**

因为 `node --test` 有一个失败模式：**它找不到你的测试文件时，会报 `pass 0 / fail 0` 并返回退出码 0。**

```bash
node --test test/     # 目录不存在 → 0 tests, 退出码 0
```

**如果你只看到"跑完了"，没看到具体测试名，说明它根本没跑。**

**所以第一次必须做破坏实验，确认"改变代码 → 测试变红"。**

---

# 第 1 步：`decideUrgency` 的 20 条（30 分钟）

## 1.1 用 describe 分组

```javascript
// test/ticket.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideUrgency, decideCategory, needsHuman, extractAmount } from "../app/services/ticket.js";

describe("decideUrgency", () => {
  // ===== ① 每个出口 =====
  describe("五个出口", () => {
    test("投诉关键词 → high", () => {
      assert.equal(decideUrgency("我要投诉你们", 0), "high");
    });
    test("金额 ≥ 500 → high", () => {
      assert.equal(decideUrgency("东西坏了", 600), "high");
    });
    test("人身安全 → high", () => {
      assert.equal(decideUrgency("插上就漏电了", 0), "high");
    });
    test("金额 > 0 → medium", () => {
      assert.equal(decideUrgency("东西坏了", 100), "medium");
    });
    test("都不满足 → low", () => {
      assert.equal(decideUrgency("什么时候发货", 0), "low");
    });
  });

  // ===== ② 边界值（最重要） =====
  describe("金额边界", () => {
    test("499 → medium（差 1 元不能进 high）", () => {
      assert.equal(decideUrgency("东西坏了", 499), "medium");
    });
    test("500 → high（刚好过线）", () => {
      assert.equal(decideUrgency("东西坏了", 500), "high");
    });
    test("501 → high", () => {
      assert.equal(decideUrgency("东西坏了", 501), "high");
    });
    test("0 → low（不是 medium）", () => {
      assert.equal(decideUrgency("东西坏了", 0), "low");
    });
    test("1 → medium（最小正数）", () => {
      assert.equal(decideUrgency("东西坏了", 1), "medium");
    });
    test("499.99 → medium（小数不过线）", () => {
      assert.equal(decideUrgency("东西坏了", 499.99), "medium");
    });
    test("500.01 → high", () => {
      assert.equal(decideUrgency("东西坏了", 500.01), "high");
    });
  });

  // ===== ③ 类型异常 =====
  describe("异常输入", () => {
    test("text 为 null 不崩", () => {
      assert.equal(decideUrgency(null, 600), "high");
    });
    test("amount 为 null → Number(null)=0 → low", () => {
      assert.equal(decideUrgency("东西坏了", null), "low");
    });
    test("amount 为字符串数字 → 能识别", () => {
      assert.equal(decideUrgency("东西坏了", "600"), "high");
    });
    test("amount 为非数字字符串 → NaN → low", () => {
      assert.equal(decideUrgency("东西坏了", "abc"), "low");
    });
    test("amount 为 undefined → low", () => {
      assert.equal(decideUrgency("东西坏了", undefined), "low");
    });
    test("空字符串 → low", () => {
      assert.equal(decideUrgency("", 0), "low");
    });
  });

  // ===== ④ 组合 =====
  describe("多条件同时命中", () => {
    test("投诉 + 大金额 → high（不是两倍）", () => {
      assert.equal(decideUrgency("我要投诉，东西坏了", 600), "high");
    });
    test("投诉 + 小金额 → high（关键词优先）", () => {
      assert.equal(decideUrgency("我要投诉，才 30 块", 30), "high");
    });
    test("人身安全 + 小金额 → high", () => {
      assert.equal(decideUrgency("漏电了，30 块的东西", 30), "high");
    });
  });

  // ===== ⑤ 真实输入（来自测试集） =====
  describe("真实输入", () => {
    test("退款 1380", () => {
      assert.equal(
        decideUrgency("上个月二十号申请的退款，到现在还没到账，一共一千三百八", 1380),
        "high"
      );
    });
    test("包装压扁但没事 → low", () => {
      assert.equal(decideUrgency("包装盒有点压扁了，里面东西没事，就是提一句", 0), "low");
    });
    test("客服态度差要投诉 → high", () => {
      assert.equal(decideUrgency("你们的客服太差了我一定要投诉", 0), "high");
    });
  });

  // ===== ⑥ 优先级冲突（保护决策） =====
  describe("优先级冲突", () => {
    test("投诉关键词检查在金额门槛之前", () => {
      // 如果哪天有人把金额检查挪到前面，这条会失败
      assert.equal(decideUrgency("我要投诉", 0), "high");
    });
    test("人身安全的检查在金额之前", () => {
      assert.equal(decideUrgency("着火了", 0), "high");
    });
  });
});
```

```bash
node --test test/
```

**期望：`pass 20 / fail 0`。**

## 1.2 逐段解释三个设计

**① 为什么用 `describe` 分组**

```text
输出长这样：
  ▶ decideUrgency
    ▶ 五个出口
      ✔ 投诉关键词 → high
      ✔ 金额 ≥ 500 → high
    ▶ 金额边界
      ✔ 499 → medium

如果不分组，输出是 20 条平铺，失败时你要找。
分组之后，你能一眼看到"金额边界那组全红了" → 立刻知道问题在哪。
```

**② 为什么 `assert.equal` 不用 `assert.strictEqual`**

```javascript
import assert from "node:assert/strict";
```

**这个 import 里，`assert.equal` 已经是严格相等**（`===`）。

```javascript
// 不加 /strict 时：
assert.equal("1", 1)     // 通过（用 ==）
assert.strictEqual("1", 1)  // 失败

// 加了 /strict 之后：
assert.equal("1", 1)     // 失败（等于 strictEqual）
```

**统一用 `node:assert/strict`，就不会有"为什么这个断言没报错"的困惑。**

**③ 为什么边界值 7 条，比出口 5 条还多**

```text
出口测试保证"每条路走得通"
边界测试保证"路口的位置对"

而 bug 90% 出在路口：
  >= 写成 >
  >= 写成 <=
  金额门槛写成 300
```

**边界测试的密度应该高于出口测试。**

## 1.3 五个破坏实验

**每做完一个，跑一次 `node --test`，确认变红，然后改回。**

```javascript
// 破坏 1：>= 改 >
if (Number(amount) > 500) return "high";
// 期望失败：500 → high（那条）

// 破坏 2：>= 改 <=
if (Number(amount) <= 500) return "high";
// 期望失败：499 → medium、600 → high 两条

// 破坏 3：金额门槛 500 改 300
if (Number(amount) >= 300) return "high";
// 期望失败：499 → medium

// 破坏 4：把金额检查挪到投诉之前
if (Number(amount) >= 500) return "high";
if (/投诉|曝光|律师|起诉/.test(s)) return "high";
// 期望失败：优先级冲突那条（"我要投诉"，0）

// 破坏 5：把 > 0 改成 >= 0
if (Number(amount) >= 0) return "medium";
// 期望失败：0 → low、空字符串 → low
```

**五个都能让测试失败，你的 20 条才是有用的。**

**如果某个破坏没有引起失败** → 说明你缺一条用例 → 补上。

## 1.4 一个你自己会遇到的坑

**破坏 4（调换顺序）大概率不会失败。**

```javascript
// 原版
if (/投诉|曝光|律师|起诉/.test(s)) return "high";
if (Number(amount) >= 500) return "high";

// 调换后
if (Number(amount) >= 500) return "high";
if (/投诉|曝光|律师|起诉/.test(s)) return "high";
```

**为什么不会失败？**

因为**两个条件都返回 `"high"`** —— 顺序不影响结果。

**这说明你那条"优先级冲突"测试写得不对。**

```javascript
// ❌ 这个测试救不了顺序
test("投诉关键词检查在金额门槛之前", () => {
  assert.equal(decideUrgency("我要投诉", 0), "high");
});

// ✅ 需要一个"顺序会影响结果"的场景
```

**但 `decideUrgency` 里没有这样的场景** —— 因为所有 high 分支返回同样的值。

**所以：**

```text
这条测试的真实价值不是"保护顺序"，是"保护'投诉算 high'这个决定"
→ 改个名字，别自欺

真正的"顺序测试"要在 decideCategory 里做
（那里 quality 和 logistics 返回不同的值，顺序会影响结果）
```

**这个发现很重要：** 你必须写"顺序真的会影响结果"的测试，否则你测的是别的。

---

# 第 2 步：`decideCategory` 的优先级（25 分钟）

## 2.1 这里顺序真的会影响结果

```javascript
export function decideCategory(text, modelSaid) {
  if (CATEGORIES.includes(modelSaid)) return modelSaid;
  const s = String(text ?? "");
  if (/坏|裂|碎|假|过期|少件|错货/.test(s)) return "quality";
  if (/没收到|物流|快递|签收|送货/.test(s)) return "logistics";
  if (/退款|退货|赔/.test(s)) return "refund";
  ...
}
```

**"东西碎了，快递送来的" 同时命中 quality 和 logistics —— 返回 quality。**

**把两个 if 调换，返回 logistics。结果变了，所以顺序测试有效。**

```javascript
describe("decideCategory", () => {
  // ===== 模型优先 =====
  describe("模型给的类别", () => {
    test("合法值直接采用", () => {
      assert.equal(decideCategory("东西碎了", "logistics"), "logistics");
    });
    test("非法值走文本判断", () => {
      assert.equal(decideCategory("东西碎了", "INVALID"), "quality");
    });
    test("null 走文本判断", () => {
      assert.equal(decideCategory("东西碎了", null), "quality");
    });
    test("空字符串走文本判断", () => {
      assert.equal(decideCategory("东西碎了", ""), "quality");
    });
  });

  // ===== 六个类别各命中 =====
  describe("文本判断", () => {
    test("quality", () => assert.equal(decideCategory("内胆裂了", null), "quality"));
    test("logistics", () => assert.equal(decideCategory("快递还没到", null), "logistics"));
    test("refund", () => assert.equal(decideCategory("我要退款", null), "refund"));
    test("invoice", () => assert.equal(decideCategory("发票抬头错了", null), "invoice"));
    test("account", () => assert.equal(decideCategory("账号被盗了", null), "account"));
    test("other", () => assert.equal(decideCategory("你们几点上班", null), "other"));
  });

  // ===== ★ 优先级（顺序真的影响） =====
  describe("优先级：quality > logistics > refund", () => {
    test("碎 + 快递 → quality（不是 logistics）", () => {
      assert.equal(decideCategory("快递送来的东西碎了", null), "quality");
    });
    test("碎 + 退款 → quality（不是 refund）", () => {
      assert.equal(decideCategory("东西碎了我要退款", null), "quality");
    });
    test("快递 + 退款 → logistics（不是 refund）", () => {
      assert.equal(decideCategory("快递没到我要退款", null), "logistics");
    });
  });

  // ===== 异常输入 =====
  describe("异常输入", () => {
    test("null 文本 → other", () => {
      assert.equal(decideCategory(null, null), "other");
    });
    test("空文本 → other", () => {
      assert.equal(decideCategory("", null), "other");
    });
    test("数字当文本 → other", () => {
      assert.equal(decideCategory(123, null), "other");
    });
  });
});
```

## 2.2 破坏实验（这次一定会有失败）

```javascript
// 破坏 1：调换 quality 和 logistics
if (/没收到|物流|快递|签收|送货/.test(s)) return "logistics";
if (/坏|裂|碎|假|过期|少件|错货/.test(s)) return "quality";
// 期望失败：「碎 + 快递 → quality」那条

// 破坏 2：删掉 quality 的一个关键词
if (/坏|裂|碎|假|过期|少件/.test(s)) return "quality";    // 删掉"错货"
// 期望失败：如果有"错货"的用例；没失败 → 补一条

// 破坏 3：模型优先改成永远走文本
// 删掉第一行 if (CATEGORIES.includes(modelSaid)) return modelSaid;
// 期望失败：4 条"模型给的类别"全红
```

## 2.3 一个必须想清的决定

**"模型给了合法值就采用" —— 这个决定要不要测？**

```javascript
test("合法值直接采用", () => {
  assert.equal(decideCategory("东西碎了", "logistics"), "logistics");
});
```

**要，而且要在注释里写清"为什么"。**

```javascript
test("模型给的合法类别优先于文本判断", () => {
  // 为什么：模型看到了完整上下文，正则是粗糙兜底
  // 如果哪天改成"文本优先"，这条会失败，提醒你确认这是有意的改动
  assert.equal(decideCategory("东西碎了", "logistics"), "logistics");
});
```

**这条测试保护的是"一个产品决策"，不是"一段代码"。**

---

# 第 3 步：`extractAmount` 的精度（20 分钟）

## 3.1 这个函数有个"已知不精确"

```javascript
export function extractAmount(text) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(元|块|万)/);
  if (m) { ... }
  if (/(千|万)/.test(s)) { ... }   // 只算到千
  return 0;
}
```

**"一千三百八" 返回 1000，不是 1380。**

**这是设计如此（够用于分档），但必须测。**

```javascript
describe("extractAmount", () => {
  describe("阿拉伯数字", () => {
    test("1380元", () => assert.equal(extractAmount("一共 1380 元"), 1380));
    test("500块", () => assert.equal(extractAmount("500 块"), 500));
    test("1.5万", () => assert.equal(extractAmount("1.5 万"), 15000));
    test("无空格", () => assert.equal(extractAmount("1380元"), 1380));
  });

  describe("中文数字（已知不精确）", () => {
    test("一千 → 1000", () => assert.equal(extractAmount("一千块"), 1000));
    test("两千 → 2000", () => assert.equal(extractAmount("两千"), 2000));
    test("★ 一千三百八 → 1000（不是 1380，这是已知精度损失）", () => {
      const v = extractAmount("一千三百八");
      // 断言它落在"千位"附近，而不是精确值
      assert.ok(v >= 1000 && v <= 1380, `得到 ${v}，应在 1000-1380 之间`);
    });
  });

  describe("无金额", () => {
    test("没提钱 → 0", () => assert.equal(extractAmount("东西坏了"), 0));
    test("null → 0", () => assert.equal(extractAmount(null), 0));
  });
});
```

## 3.2 为什么用 `assert.ok(v >= 1000 && v <= 1380)`

**这个写法看起来"不严格"，但它诚实。**

```javascript
// ❌ 假装精确
assert.equal(extractAmount("一千三百八"), 1380);
// → 测试失败 → 你去"修" extractAmount → 引入更多 bug

// ❌ 完全不测
// → 三个月后有人改了正则，返回 0，你都不知道

// ✅ 断言范围
assert.ok(v >= 1000 && v <= 1380);
// → 保护了"它在千位"这个必须成立的性质
// → 不假装它能精确到个位
```

**"对不精确的东西，写不精确的断言"** 是测试设计的一部分。

**把这条写进 `TEST-PLAN.md` 的"已知限制"里。**

---

# 第 4 步：`needsHuman` 的组合（20 分钟）

**这个函数有五个条件，组合爆炸。挑关键组合测。**

```javascript
describe("needsHuman", () => {
  test("urgency=high → true", () => {
    assert.equal(needsHuman({ urgency: "high", amount: 0, text: "东西坏了" }), true);
  });
  test("金额 ≥ 500 → true（即使 urgency 是 low）", () => {
    assert.equal(needsHuman({ urgency: "low", amount: 600, text: "东西坏了" }), true);
  });
  test("提投诉 → true", () => {
    assert.equal(needsHuman({ urgency: "low", amount: 0, text: "我要投诉" }), true);
  });
  test("文本 < 4 字 → true（信息不足）", () => {
    assert.equal(needsHuman({ urgency: "low", amount: 0, text: "退" }), true);
  });
  test("正常咨询 → false", () => {
    assert.equal(needsHuman({ urgency: "low", amount: 0, text: "什么时候发货" }), false);
  });
  test("★ 金额 499 + 不投诉 + 文本够长 → false", () => {
    assert.equal(needsHuman({ urgency: "medium", amount: 499, text: "东西有点划痕" }), false);
  });
  test("★ 金额 500 + 不投诉 → true（边界）", () => {
    assert.equal(needsHuman({ urgency: "medium", amount: 500, text: "东西有点划痕" }), true);
  });
});
```

## 4.1 破坏实验

```javascript
// 破坏：>= 500 改 > 500
if (Number(amount) > 500) return true;
// 期望失败：「金额 500 → true」那条

// 破坏：< 4 改 < 3
if (s.trim().length < 3) return true;
// 期望失败：「文本 < 4 字 → true」（"退"是 1 字，还是 true；需要 3 字的用例）
// → 如果没失败，说明你需要补一条"3 个字"的用例
```

**第二个破坏实验会暴露你的用例不全。补一条：**

```javascript
test("文本正好 3 字 → 应该 true（不足 4 字）", () => {
  assert.equal(needsHuman({ urgency: "low", amount: 0, text: "退货啊" }), true);
});
test("文本正好 4 字 → false（够了）", () => {
  assert.equal(needsHuman({ urgency: "low", amount: 0, text: "退货申请" }), false);
});
```

---

# 第 5 步：跑全部，看覆盖率（15 分钟）

## 5.1 一条命令

```bash
node --test test/
```

**期望：`pass 45+ / fail 0`。**

## 5.2 看覆盖率（就一眼，别追）

```bash
node --test --experimental-test-coverage test/
```

**输出：**

```text
ℹ start of coverage report
ℹ --------------------------------------------------------------
ℹ file                  | line % | branch % | funcs % | uncovered lines
ℹ --------------------------------------------------------------
ℹ  app/services/ticket.js |  98.7 |    95.0  |  100.0  | 42-43
ℹ --------------------------------------------------------------
ℹ all files              |  98.7 |    95.0  |  100.0  |
```

**看三件事：**

```text
① branch % < line %  → 有分支没走到（通常是 else 或某个 if）
② 有 uncovered lines → 那几行从没执行过
③ funcs % < 100      → 有函数完全没测
```

**然后看一眼"42-43 行是什么"，决定要不要补。**

**不要为了把这个数字提到 100% 而写测试。** 只补"42-43 行是业务逻辑"的情况。

## 5.3 一个必须接受的数字

**你的 `ticket.js` 大概会到 95–99%。**

剩下的 1–5% 通常是：

```text
· export const CATEGORIES = [...]  ← 数据，不是逻辑
· 一个防御性的 if (!text) return ...  ← 已经通过 null 用例覆盖了
· 一个 throw（不可能发生的分支）
```

**这些不值得测。**

## 5.4 加进 package.json

```json
{
  "scripts": {
    "test": "cross-env NODE_ENV=test node --test test/",
    "test:watch": "cross-env NODE_ENV=test node --test --watch test/",
    "test:cov": "cross-env NODE_ENV=test node --test --experimental-test-coverage test/"
  }
}
```

```bash
npm test
```

**注意 `NODE_ENV=test`** —— 这样会读 `.env.test`（内存库、短超时、假上游）。

---

# 第 6 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **五个破坏实验，各引起了哪条失败**
- **哪个破坏没引起失败**（说明用例不全）
- **覆盖率数字，uncovered 的是什么**
- **"优先级冲突"测试在 `decideUrgency` 里为什么无效**

---

# 第 7 步：课后练习

## 练习一：给 `classify` 写 8 条（25 分钟）

```javascript
// app/lib/health.js
export function classify(err, res, text) {
  // 五种：RETRY / FALLBACK / FATAL / SLOW / EMPTY
}
```

**8 条用例（来自第 128 节）：**

```javascript
test("连接被拒 → FALLBACK", () => {
  assert.equal(classify(new Error("fetch failed: ECONNREFUSED"), null, null), FAIL.FALLBACK);
});
// ... 再写 7 条
```

**写完做破坏：把 `429` 从 FALLBACK 改成 FATAL，看是否失败。**

## 练习二：找到"顺序真的影响结果"的地方（20 分钟）

**回顾你项目里的所有 `if` 链，找出"调换顺序会改变输出"的：**

```text
decideCategory  → ✅ 会（quality/logistics 返回不同值）
decideUrgency   → ❌ 不会（high 分支都返回 "high"）
guardInput      → ？（取决于你怎么组织）
errorMiddleware.normalize → ？（第一条命中就返回）
```

**为什么这个分析重要？**

因为**只有"顺序影响结果"的地方，才值得写"顺序测试"。** 在 `decideUrgency` 里写顺序测试是自欺。

## 练习三：判断这批测试错在哪（15 分钟）

```javascript
describe("decideUrgency", () => {
  it("能返回 high", () => {
    assert.ok(["high","medium","low"].includes(decideUrgency("投诉", 0)));
  });
  it("能返回 medium", () => {
    assert.ok(["high","medium","low"].includes(decideUrgency("坏了", 100)));
  });
  it("能返回 low", () => {
    assert.ok(["high","medium","low"].includes(decideUrgency("问一下", 0)));
  });
});
```

**错在哪？至少三条。**

**参考答案：**

```text
① 断言太弱：只验"返回值在三个枚举里"，不验"是哪一个"
   → 把 decideUrgency 整个改坏（永远返回 "low"），三条仍然全过
② 没有边界值：499/500/501 从没测
③ 没有异常输入：null / 字符串数字 / NaN
④ 没有"模型给的类别优先"这类决策保护
⑤ "能返回 high" 这个测试名说的不是行为，是"可能性"
```

**第 ① 条是致命伤。** 这三条测试的联合效果是"验证了返回值是字符串" —— 零信息量。

---

# 第 8 步：最终验收

## A. 管道通了

- [ ] `node --version` ≥ 18
- [ ] `test/` 目录存在
- [ ] `node --test test/` 能跑出具体测试名（不是"0 tests"）
- [ ] 第一次就做了破坏实验，确认会变红

## B. `decideUrgency` 20 条

- [ ] 五个出口各有 1 条
- [ ] 金额边界 7 条（含 499/500/501）
- [ ] 类型异常 6 条（null / "600" / "abc" / undefined / 空串）
- [ ] 组合 3 条
- [ ] 真实输入 3 条
- [ ] 优先级冲突 2 条（**且知道这里其实保护不了顺序**）

## C. `decideCategory` 17 条

- [ ] 模型优先 4 条
- [ ] 六个类别各 1 条
- [ ] **优先级 3 条（这里顺序真的影响结果）**
- [ ] 异常输入 3 条

## D. 破坏实验

- [ ] `>=` 改 `>` → 失败
- [ ] `>=` 改 `<=` → 失败
- [ ] 门槛 500 改 300 → 失败
- [ ] 删掉"模型优先"那一行 → 4 条失败
- [ ] 调换 quality/logistics → 优先级测试失败

**至少做成 4 个。** 做不成的说明用例不全，补上。

## E. 覆盖率

- [ ] 跑了 `--experimental-test-coverage`
- [ ] line % ≥ 95
- [ ] 看过 uncovered 的行是什么，判断要不要补
- [ ] **我没有为了提覆盖率而写测试**

## F. `npm test`

- [ ] `package.json` 里有 test / test:watch / test:cov
- [ ] `npm test` 能跑通
- [ ] 带了 `NODE_ENV=test`

## G. 提交

```bash
git add -A
git commit -m "第142节：ticket.test.js 45条，覆盖率XX%，5个破坏实验"
git push
```

---

## 本节课要能说出口的一句话

> **不会失败的测试是摆设。写完必须改坏代码看它会不会红。**

---

# 附：常见问题速查

**Q：`node --test` 输出 `pass 0`，但我明明写了测试。**

A：**三个原因：**

```text
① 文件名不匹配：必须叫 *.test.js / *-test.js / test.js / test/*
② 路径没传对：node --test test/ 要求 test 目录存在
③ 用了旧的 Node：< 18 的 --test 是实验特性，行为不同
```

**加 `--test-reporter=spec` 看详细输出：**

```bash
node --test --test-reporter=spec test/
```

**Q：为什么 `assert.equal` 有时宽松有时严格？**

A：**取决于你 import 哪个：**

```javascript
// A 版：宽松
import assertA from "node:assert";          // equal 用 ==
assertA.equal("600", 600);                  // 通过（你可能不想这样）

// B 版：严格
import assertB from "node:assert/strict";   // equal 用 ===
assertB.equal("600", 600);                  // 失败（这才是你要的）
```

**统一用 `/strict`。** 否则 `assert.equal("600", 600)` 会通过，而你可能想让它失败。

**Q：测试文件里的公共数据（如真实输入样本）放哪？**

A：**`test/fixtures.js`：**

```javascript
// test/fixtures.js
export const REAL_INPUTS = [
  { text: "上个月二十号申请的退款…一共一千三百八", amount: 1380, expect: "high" },
  ...
];
```

**然后用例里 `for (const c of REAL_INPUTS) test(...)` 批量生成。**

**好处：新增一个真实样本只改 fixtures 一处。**

**Q：`describe` 可以嵌套几层？**

A：**两层够用，三层是上限。**

```text
describe("decideUrgency")        ← 第一层：被测对象
  describe("金额边界")           ← 第二层：场景分组
    test("499 → medium")         ← 测试
```

**四层之后输出缩进太深，屏幕放不下。**

**Q：`test` 里能 `await` 吗？**

A：**能，而且这是 `node --test` 最好的特性。**

```javascript
test("异步的东西", async () => {
  const r = await callModel(...);
  assert.equal(r.ok, true);
});
```

**不需要 `done` 回调，不需要特殊配置。**

**Q：测试之间会互相影响吗？**

A：**`node --test` 默认在同一文件内**串行**、跨文件**并行**。**

```text
test/a.test.js 和 test/b.test.js  → 同时跑（不同进程）
a.test.js 内部                     → 顺序跑
```

**所以：**

```text
· 同文件内的测试不能依赖顺序（虽然串行，但顺序不保证稳定）
· 跨文件的测试绝对不能共享数据库
```

**`DB_FILE=:memory:` 完美解决第二条。**

**Q：为什么"优先级冲突"测试在 `decideUrgency` 里无效？**

A：**因为所有 high 分支都返回 `"high"`，调换顺序结果不变。**

```javascript
// 原版
if (投诉) return "high";
if (金额 >= 500) return "high";
// 调换
if (金额 >= 500) return "high";
if (投诉) return "high";
// 输入 ("我要投诉", 0)：原版 high，调换后也 high —— 测不出区别
```

**只有在 `decideCategory` 里（quality 和 logistics 返回不同值），顺序测试才有意义。**

**教训：写测试前先想"这个测试能区分什么"。** 区分不了任何东西的测试，不如不写。
