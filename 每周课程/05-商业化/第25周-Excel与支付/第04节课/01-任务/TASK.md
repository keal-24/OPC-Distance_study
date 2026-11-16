# 第 172 节课：一分钱都不能差

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这是整个 36 周里最容易"看起来对、实际错"的一节课。**金额算错不会报错，只会让客户在三个月后拿着账单来找你。**
> 这节课只有一件事：**把"钱"这个东西在代码里管死。**

**建议用时**：145 分钟（8 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—3 步（75 分钟）一次，第 4—7 步（70 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 171 节课（导出能跑，`yuanToCents` / `centsToYuan` 已经有一版）

---

# 第 0 步：先看四个真实的错误（15 分钟）

**下面四段代码都能跑，都不报错，都算错。**

## 0.1 加法

```js
0.1 + 0.2
```

**结果：** `0.30000000000000004`

## 0.2 乘法

```js
19.9 * 3
```

**结果：** `59.699999999999996`

**客户买 3 件，单价 19.9 元，总额应该是 59.70 元。** 你存进库的是 `59.699999999999996`，显示的时候 `toFixed(2)` 变成 `59.70`，看起来对。

**但对账的时候：** 你的 1000 笔订单总额 = `59699.999999999996`，支付平台给的是 `59700.00`。**差 0.000000000004 元，系统判"对不上"。**

## 0.3 四舍五入

```js
Math.round(1.005 * 100)
```

**结果：** `100`（期望 `101`）

**为什么：** `1.005` 在双精度浮点里其实是 `1.00499999999999989341858963598497211933135986328125`。

**乘 100 得到 `100.49999999999999`，`round` 变成 `100`。**

**你会少收一分钱。** 一天一万笔，一百块。

## 0.4 `toFixed` 的坑

```js
(1.005).toFixed(2)
```

**结果：** `"1.00"`（期望 `"1.01"`）

**同样的原因。**

**而且 `toFixed` 还有个更阴的行为：**

```js
(1.335).toFixed(2)    // "1.33"  ← 因为 1.335 实际是 1.33499999...
(1.345).toFixed(2)    // "1.35"
```

**同一个"看起来该进位"的数，一个进一个不进。** 客户发现了会问你为什么。

---

# 第 1 步：定死规矩（10 分钟）

**规矩只有四条，但这四条要写进项目 README，谁都不能破。**

```text
一、数据库里所有金额字段，类型是 integer（存分），名字结尾必须有 _cents。
    不叫 amount，叫 amount_cents。

二、代码里所有金额变量的名字，结尾必须有 Cents。
    不叫 price，叫 priceCents。

三、只有两个地方做单位转换：
    入口（读到外部数据）→ yuanToCents
    出口（显示 / 导出）→ centsToYuan
    中间全程是整数分。

四、任何除法（分摊、折扣、税费）都必须有明确的舍入规则，
    而且"分完的总额"必须等于"分之前的总额"。
```

**第三条是关键。** 中间环节只要出现一次小数，精度就丢了，而且找不回来。

**第四条是这节课最难的部分**，第 5 步专门讲。

## 1.1 命名为什么这么重要

```js
const amount = 389700;        // 这是 3897 元还是 389700 元？
const amountCents = 389700;   // 一眼就知道是 3897.00 元
```

**代码里的金额错误，八成来自"这个变量到底是元还是分"。**

**加上后缀，你在写 `amountCents * 2` 的时候会想一下"乘 2 是对的吗"；写 `amount * 2` 的时候什么都不会想。**

**这个习惯成本是零，收益是避免一次线上事故。**

---

# 第 2 步：把工具函数写对（30 分钟）

## 2.1 完整的 `src/money/index.js`

```js
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

function toCents(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'boolean') return null;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const v = Math.round(input * 100);
    return Number.isSafeInteger(v) ? v : null;
  }

  if (typeof input !== 'string') return null;

  let s = input.trim();
  if (s === '') return null;

  let negative = false;

  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  s = s.replace(/[,\s\u00a0\u3000]/g, '');
  s = s.replace(/^[¥$￥]/, '');

  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }

  if (s === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const [intPart, decPart = ''] = s.split('.');
  const frac = (decPart + '00').slice(0, 2);

  const cents = Number(intPart) * 100 + Number(frac);

  if (!Number.isSafeInteger(cents) || cents > MAX_SAFE_CENTS) return null;

  return negative ? -cents : cents;
}

function fromCents(cents, options = {}) {
  if (!Number.isInteger(cents)) {
    throw new TypeError('fromCents 只接受整数分，收到：' + cents);
  }

  const symbol = options.symbol || '';
  const grouping = options.grouping !== false;

  const negative = cents < 0;
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = String(abs % 100).padStart(2, '0');

  const yuanStr = grouping ? String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(yuan);

  return (negative ? '-' : '') + symbol + yuanStr + '.' + fen;
}

function mulCents(cents, factor) {
  if (!Number.isInteger(cents)) {
    throw new TypeError('mulCents 第一个参数必须是整数分');
  }
  if (typeof factor !== 'number' || !Number.isFinite(factor)) {
    throw new TypeError('mulCents 第二个参数必须是有限数字');
  }

  const raw = cents * factor;

  if (Number.isSafeInteger(raw)) {
    return raw;
  }

  return Math.round(raw);
}

function splitEvenly(totalCents, parts) {
  if (!Number.isInteger(totalCents)) {
    throw new TypeError('splitEvenly 总额必须是整数分');
  }
  if (!Number.isInteger(parts) || parts < 1) {
    throw new TypeError('splitEvenly 份数必须是正整数');
  }

  const base = Math.floor(totalCents / parts);
  let remainder = totalCents - base * parts;

  const out = [];
  for (let i = 0; i < parts; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    out.push(base + extra);
  }

  return out;
}

function splitByWeights(totalCents, weights) {
  if (!Number.isInteger(totalCents)) {
    throw new TypeError('splitByWeights 总额必须是整数分');
  }
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new TypeError('splitByWeights 权重必须是非空数组');
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (!(totalWeight > 0)) {
    throw new TypeError('splitByWeights 权重之和必须大于 0');
  }

  const out = weights.map((w) => Math.floor((totalCents * w) / totalWeight));
  let allocated = out.reduce((a, b) => a + b, 0);
  let remainder = totalCents - allocated;

  let i = 0;
  while (remainder > 0) {
    out[i % out.length] += 1;
    remainder -= 1;
    i += 1;
  }

  while (remainder < 0) {
    out[i % out.length] -= 1;
    remainder += 1;
    i += 1;
  }

  return out;
}

function sumCents(list) {
  let total = 0;
  for (const n of list) {
    if (!Number.isInteger(n)) {
      throw new TypeError('sumCents 只接受整数分');
    }
    total += n;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError('sumCents 溢出');
    }
  }
  return total;
}

module.exports = {
  toCents,
  fromCents,
  mulCents,
  splitEvenly,
  splitByWeights,
  sumCents,
  yuanToCents: toCents,
  centsToYuan: fromCents,
};
```

**注意保留了 `yuanToCents` / `centsToYuan` 这两个别名。** 第 170 节的代码里用的就是它们，不用改。

## 2.2 `mulCents` 为什么要单独存在

**因为"单价（分）× 数量"是出现频率最高的金额运算，而它有个陷阱。**

```js
const priceCents = 1990;    // 19.90 元
const qty = 3;
priceCents * qty            // 5970  ✓ 整数乘法，精确
```

**整数 × 整数永远是整数，这个没问题。那 `mulCents` 存在的意义是什么？**

**在于"折扣"这类需要乘小数的场景：**

```js
const subtotalCents = 5970;
const discount = 0.85;            // 85 折
subtotalCents * discount          // 5074.499999999999
```

**`mulCents(5970, 0.85)` = `Math.round(5074.499999999999)` = `5074`。**

**但还是那个问题：`0.85` 在浮点里不是精确的 0.85。**

**更严格的做法是折扣也用整数表示：**

```js
const discountPermille = 850;     // 千分之 850，即 85 折
const discounted = Math.round((subtotalCents * discountPermille) / 1000);
```

**这样中间量 `5970 * 850 = 5074500` 是精确整数，除以 1000 之后才舍入一次。**

**这就是这一节最重要的思想：**

> **让浮点只出现在最后一步，而且只出现一次。**

**`mulCents` 接受 `factor`，是为了容错（有人传了 0.85）。但你自己写代码时，优先用整数比例。**

## 2.3 `toCents` 为什么先判断 `number` 再判断 `string`

**因为第 169 节的读取器会把 Excel 数字读成 `number`。**

```js
// Excel 里填的 1299.00，读出来是 number 1299
toCents(1299)     // 走 number 分支 → 129900
```

**走 `Math.round(1299 * 100)`，精确。**

**而文本 `"1,299.00"` 走字符串分支，全程整数运算。**

**两条路都能用，但字符串那条更严格（会拒绝三位小数）。**

**如果客户的文件里有一列被 Excel 存成了 `number`，你就只能用第一条路。** 这是常态，接受它。

## 2.4 `fromCents` 为什么用 `Math.floor` + `%`

```js
const yuan = Math.floor(abs / 100);
const fen = String(abs % 100).padStart(2, '0');
```

**对比常见错误写法：**

```js
(abs / 100).toFixed(2)     // ❌ 又回到浮点了，而且有 toFixed 的舍入问题
```

**`Math.floor(abs / 100)` 是整数除法，`abs % 100` 是余数。全程整数。**

**`padStart(2, '0')` 处理 `5` → `"05"`。**

**注意负数：`Math.abs` 之后处理，最后加负号。** 分开处理是为了 `-5` 分能显示成 `-0.05` 而不是 `-0.-5`。

## 2.5 自检点：先写测试，再往下走

**新建 `tests/money.test.js`：**

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  toCents, fromCents, mulCents, splitEvenly, splitByWeights, sumCents,
} = require('../src/money');

test('toCents 文本', () => {
  assert.strictEqual(toCents('1299'), 129900);
  assert.strictEqual(toCents('1,299.00'), 129900);
  assert.strictEqual(toCents('1299.5'), 129950);
  assert.strictEqual(toCents('1299.05'), 129905);
  assert.strictEqual(toCents('  ¥1,299.00  '), 129900);
  assert.strictEqual(toCents('(1299.00)'), -129900);
  assert.strictEqual(toCents('-1299.00'), -129900);
  assert.strictEqual(toCents('(1299.00)'), toCents('-1299'));
});

test('toCents 数字', () => {
  assert.strictEqual(toCents(1299), 129900);
  assert.strictEqual(toCents(1299.5), 129950);
  assert.strictEqual(toCents(0), 0);
  assert.strictEqual(toCents(-5), -500);
});

test('toCents 非法输入', () => {
  assert.strictEqual(toCents(''), null);
  assert.strictEqual(toCents('abc'), null);
  assert.strictEqual(toCents('1299.005'), null);
  assert.strictEqual(toCents(null), null);
  assert.strictEqual(toCents(undefined), null);
  assert.strictEqual(toCents(NaN), null);
  assert.strictEqual(toCents(Infinity), null);
});

test('1.005 这个经典坑', () => {
  const c = toCents('1.005');
  assert.strictEqual(c, null, '三位小数应该被拒绝，而不是悄悄变成 100');

  const n = toCents(1.005);
  assert.strictEqual(n, 100, '数字输入只能接受 1.005 → 1.00 这个损失');
});

test('fromCents', () => {
  assert.strictEqual(fromCents(129900), '1,299.00');
  assert.strictEqual(fromCents(129900, { grouping: false }), '1299.00');
  assert.strictEqual(fromCents(5), '0.05');
  assert.strictEqual(fromCents(0), '0.00');
  assert.strictEqual(fromCents(-5), '-0.05');
  assert.strictEqual(fromCents(-129900), '-1,299.00');
  assert.strictEqual(fromCents(129900, { symbol: '¥' }), '¥1,299.00');
});

test('fromCents 拒绝小数', () => {
  assert.throws(() => fromCents(1299.5), TypeError);
  assert.throws(() => fromCents('1299'), TypeError);
});

test('往返转换', () => {
  const cases = ['0.01', '0.99', '1.00', '19.90', '1299.03', '99999.99'];
  for (const s of cases) {
    const c = toCents(s);
    const back = fromCents(c, { grouping: false });
    assert.strictEqual(back, s, s + ' 往返失败');
  }
});

test('splitEvenly 总额守恒', () => {
  assert.deepStrictEqual(splitEvenly(100, 3), [34, 33, 33]);
  assert.strictEqual(sumCents(splitEvenly(100, 3)), 100);
  assert.deepStrictEqual(splitEvenly(1, 3), [1, 0, 0]);
  assert.strictEqual(sumCents(splitEvenly(1, 3)), 1);
  assert.deepStrictEqual(splitEvenly(0, 3), [0, 0, 0]);
  assert.deepStrictEqual(splitEvenly(-100, 3), [-34, -33, -33]);
});

test('splitEvenly 一百个随机用例都守恒', () => {
  for (let i = 0; i < 100; i++) {
    const total = Math.floor(Math.random() * 1000000);
    const parts = 1 + Math.floor(Math.random() * 20);
    const arr = splitEvenly(total, parts);
    assert.strictEqual(arr.length, parts);
    assert.strictEqual(sumCents(arr), total, 'total=' + total + ' parts=' + parts);
  }
});

test('splitByWeights 总额守恒', () => {
  assert.strictEqual(sumCents(splitByWeights(100, [1, 1, 1])), 100);
  assert.strictEqual(sumCents(splitByWeights(100, [3, 2, 1])), 100);
  assert.strictEqual(sumCents(splitByWeights(1, [1, 1, 1])), 1);
  assert.strictEqual(sumCents(splitByWeights(0, [1, 1])), 0);
});

test('splitByWeights 按比例', () => {
  const r = splitByWeights(1000, [1, 1]);
  assert.deepStrictEqual(r, [500, 500]);

  const r2 = splitByWeights(1000, [3, 1]);
  assert.strictEqual(sumCents(r2), 1000);
  assert.ok(Math.abs(r2[0] - 750) <= 1);
});

test('splitByWeights 参数校验', () => {
  assert.throws(() => splitByWeights(100, []), TypeError);
  assert.throws(() => splitByWeights(100, [0, 0]), TypeError);
  assert.throws(() => splitByWeights(100.5, [1]), TypeError);
});
```

**跑：**

```text
node --test tests/money.test.js
```

**全部通过才算这节课有基础。** 有红的就别往下走——**后面的退款、对账全部建立在这些函数上。**

---

# 第 3 步：金额进库（20 分钟）

## 3.1 检查现有的表

**第 170 节建的 `orders` 表已经是整数分了：**

```sql
unit_price_cents  integer not null check (unit_price_cents > 0)
amount_cents      integer not null check (amount_cents > 0)
```

**对。但这一节要加几个东西。**

## 3.2 新建 `migrations/010_money.sql`

```sql
alter table orders
  add column if not exists discount_cents integer not null default 0,
  add column if not exists tax_cents integer not null default 0,
  add column if not exists paid_cents integer not null default 0,
  add column if not exists refunded_cents integer not null default 0;

alter table orders
  add constraint orders_money_check check (
    discount_cents >= 0
    and tax_cents >= 0
    and paid_cents >= 0
    and refunded_cents >= 0
    and refunded_cents <= paid_cents
    and amount_cents =
        quantity * unit_price_cents - discount_cents + tax_cents
  );
```

**跑：**

```text
npm run migrate
```

## 3.3 三个必须理解的点

### 为什么加 `if not exists`

**因为迁移可能在已经有这些列的库上跑。**

**第 163 节讲过"迁移要能重复跑"。`add column if not exists` 是最便宜的防御。**

**注意：`add constraint` 没有 `if not exists` 语法。** 所以这一条在重复跑时会报：

```text
constraint "orders_money_check" for relation "orders" already exists
```

**处理方式：先 `drop constraint if exists`，再加。**

```sql
alter table orders drop constraint if exists orders_money_check;
alter table orders add constraint orders_money_check check (...);
```

**这一节的代码要先改成这样再跑。** 这是你的第一个练习。

### 那条 `check` 是整个设计的心脏

```sql
amount_cents = quantity * unit_price_cents - discount_cents + tax_cents
```

**数据库会强制校验这个等式。**

**意味着：**

```text
你的代码算错了总额 → insert 失败 → 你立刻知道
```

**而不是三个月后客户发现账不对。**

**这就是"让错误尽早暴露"的具体做法。**

**你可能担心：** 那如果业务上真的要一个特殊的总额（比如"最终优惠价"）呢？

**那就加一个 `manual_amount_cents` 字段，并且把约束改成：**

```sql
amount_cents = coalesce(manual_amount_cents, quantity * unit_price_cents - discount_cents + tax_cents)
```

**但"手工改价"这件事本身要有审计。** 谁改的、为什么改、原价多少。**这一节不做，第 175 节对账时会提到。**

### `refunded_cents <= paid_cents`

**退款不能超过已付。**

**这条约束会拦住"重复退款"——如果第二次退款把 `refunded_cents` 加到超过 `paid_cents`，数据库拒绝。**

**这是第 174 节幂等的最后一道保险。**

## 3.4 自检点

**跑一下迁移，然后故意插一条错的：**

```sql
insert into orders
  (tenant_id, order_no, customer_name, order_date, quantity, unit_price_cents, amount_cents)
values
  ('某个租户id', 'BAD001', '测试', '2026-11-01', 3, 1000, 9999);
```

**期望：**

```text
new row for relation "orders" violates check constraint "orders_money_check"
DETAIL:  Failing row contains (...)
```

**看到这个错误说明约束生效了。**

**把 `9999` 改成 `3000` 再插一次，成功。**

---

# 第 4 步：退款怎么算（25 分钟）

## 4.1 场景

```text
订单：3 件 × 1299.00 元 = 3897.00 元，已付 3897.00
客户要退 1 件
```

**算一下：1299.00 元。**

**但如果客户用了 100 元优惠券呢：**

```text
原价 3897.00，优惠 100.00，实付 3797.00
退 1 件应该退多少？
```

**三种算法，三种答案：**

```text
算法一：按原价退 → 1299.00  （客户赚了，你会亏）
算法二：按比例退 → 3797.00 × 1/3 = 1265.67
算法三：退最后一件 → 3797.00 - 1265.67 × 2 = 1265.66
```

**正确答案是算法二或三（取决于你的规则），但绝不是算法一。**

**这一节用"按比例退"，并且保证"全部退完等于实付"。**

## 4.2 为什么"全部退完必须等于实付"

```text
3 件，实付 3797.00
每件按比例：1265.666... → 四舍五入 1265.67
退三件：1265.67 × 3 = 3797.01
```

**多退了 1 分钱。**

**一万笔订单，就是 100 块。而且客户会发现"全退了还多给我一分"。**

**这就是"分摊"问题：`1265.67 × 3 ≠ 3797.00`。**

**解法在 `splitByWeights` 里：先按比例取整，再把余数一个个补到前几项。**

```js
splitByWeights(379700, [1, 1, 1])
// → [126567, 126567, 126566]  = 1265.67 + 1265.67 + 1265.66 = 3797.00 ✓
```

**总和精确等于总额。**

## 4.3 写退款分摊函数

**新建 `src/money/refund.js`：**

```js
const { splitByWeights, sumCents } = require('./index');

function allocateRefund(order, refundQty) {
  const {
    quantity,
    unit_price_cents: priceCents,
    discount_cents: discountCents,
    tax_cents: taxCents,
    paid_cents: paidCents,
    refunded_cents: refundedCents,
  } = order;

  if (!Number.isInteger(refundQty) || refundQty < 1) {
    throw new TypeError('退款数量必须是正整数');
  }
  if (refundQty > quantity) {
    throw new RangeError('退款数量不能超过购买数量');
  }

  const lines = splitByWeights(paidCents, Array(quantity).fill(1));

  const alreadyRefundedLines = Math.round(
    (refundedCents / paidCents) * quantity
  );

  const start = Math.min(alreadyRefundedLines, quantity);
  const picked = lines.slice(start, start + refundQty);

  const refundCents = sumCents(picked);

  return {
    refundCents,
    lineCents: picked,
    priceCents,
    discountCents,
    taxCents,
    remainingQty: quantity - start - refundQty,
  };
}

function allocateRefundByAmount(order, refundCents) {
  const { paid_cents: paidCents, refunded_cents: refundedCents } = order;

  if (!Number.isInteger(refundCents) || refundCents <= 0) {
    throw new TypeError('退款金额必须是正整数分');
  }

  const refundable = paidCents - refundedCents;

  if (refundCents > refundable) {
    throw new RangeError(
      `退款金额 ${refundCents} 超过可退金额 ${refundable}`
    );
  }

  return {
    refundCents,
    remainingRefundable: refundable - refundCents,
  };
}

module.exports = { allocateRefund, allocateRefundByAmount };
```

## 4.4 这段代码有个明显的问题，你要发现它

**看 `alreadyRefundedLines` 那一句：**

```js
const alreadyRefundedLines = Math.round((refundedCents / paidCents) * quantity);
```

**它通过"已退金额占实付的比例"反推"已退了几件"。**

**这个算法是错的。**

**举一个例子：**

```text
3 件，实付 3797.00（379700 分）
每件的分摊：126567, 126567, 126566
第一次退 1 件：退了 126567
refundedCents = 126567
alreadyRefundedLines = round(126567 / 379700 * 3) = round(0.99997...) = 1  ✓ 对了
```

**但第二次：**

```text
refundedCents = 253134（两件）
alreadyRefundedLines = round(253134 / 379700 * 3) = round(2.0000) = 2  ✓
```

**这次对了。但边界情况呢：**

```text
如果每件分到的不一样（比如分批退款金额不同），比例法就会错。
```

**正确的做法：单独存一个 `refunded_qty` 字段。**

**这就是"用比例反推数量"这个思路的根本问题——信息丢失了。**

**改成存字段：**

```sql
alter table orders add column if not exists refunded_qty integer not null default 0;
```

**然后 `allocateRefund` 直接用 `order.refunded_qty`，不做任何反推。**

**这个改动你现在就做。** 我在正文里把错误的写法也留着，是因为**这种"用一个数反推另一个数"的错误，你会写很多次**——每次都是因为"加个字段太麻烦"。

**加字段的成本：一次迁移。反推的成本：一个你三个月后才发现的 bug。**

## 4.5 修正后的版本

```js
function allocateRefund(order, refundQty) {
  const {
    quantity,
    paid_cents: paidCents,
    refunded_qty: refundedQty,
  } = order;

  if (!Number.isInteger(refundQty) || refundQty < 1) {
    throw new TypeError('退款数量必须是正整数');
  }
  if (refundedQty + refundQty > quantity) {
    throw new RangeError(
      `本次退 ${refundQty} 件，但只剩 ${quantity - refundedQty} 件可退`
    );
  }

  const lines = splitByWeights(paidCents, Array(quantity).fill(1));
  const picked = lines.slice(refundedQty, refundedQty + refundQty);

  return {
    refundCents: sumCents(picked),
    lineCents: picked,
    remainingQty: quantity - refundedQty - refundQty,
  };
}
```

## 4.6 自检点

**写几个用例手工验：**

```js
const { splitByWeights, sumCents } = require('../src/money');

const lines = splitByWeights(379700, [1, 1, 1]);
console.log(lines);                       // [126567, 126567, 126566]
console.log(sumCents(lines));             // 379700  ✓
console.log(sumCents(lines.slice(0, 1))); // 126567
console.log(sumCents(lines.slice(1, 2))); // 126567
console.log(sumCents(lines.slice(2, 3))); // 126566
```

**再验一次"全部退完"：**

```text
126567 + 126567 + 126566 = 379700  ✓ 等于实付，一分不差
```

**把这三个数抄进笔记。** 以后见到别人写的退款逻辑，先拿这个例子试。

---

# 第 5 步：税费（20 分钟）

**中国的场景通常是"含税价"，但你需要能拆出税额。**

```text
客户付 113 元，税率 13%
不含税金额 = 113 / 1.13 = 100.00
税额 = 13.00
```

**`113 / 1.13` 在浮点里是 `99.99999999999999`。** 这就是坑。

## 5.1 用整数算

```js
function extractTaxFromInclusive(totalCents, ratePermille) {
  if (!Number.isInteger(totalCents)) {
    throw new TypeError('totalCents 必须是整数分');
  }
  if (!Number.isInteger(ratePermille) || ratePermille < 0) {
    throw new TypeError('税率必须是非负整数，单位千分之');
  }

  const divisor = 1000 + ratePermille;
  const taxCents = Math.round((totalCents * ratePermille) / divisor);
  const netCents = totalCents - taxCents;

  return { taxCents, netCents };
}
```

**验证：**

```js
extractTaxFromInclusive(11300, 130)   // 113 元，13%
// taxCents = round(11300 * 130 / 1130) = round(1469000 / 1130) = round(1300.0) = 1300
// netCents = 11300 - 1300 = 10000  ✓ 100.00 元
```

**全程整数运算，只在最后一次除法的结果上舍入。**

## 5.2 关键：`netCents = totalCents - taxCents`

**不是 `netCents = round(totalCents / 1130 * 1000)`。**

**因为两次独立舍入，加起来可能不等于总额。**

```text
错误做法：
  tax = round(1300.0) = 1300
  net = round(10000.0) = 10000
  1300 + 10000 = 11300  ✓ 这次对

换个税率：
  总额 100 分，税率 6%（601 分 / 1060）
  tax = round(100 * 60 / 1060) = round(5.66) = 6
  net = round(100 / 1.06) = round(94.34) = 94
  6 + 94 = 100  ✓

再换：
  总额 101 分，税率 6%
  tax = round(101 * 60 / 1060) = round(5.717) = 6
  net = round(101 / 1.06) = round(95.28) = 95
  6 + 95 = 101  ✓

嗯，都碰巧对。但这是因为总数小。
```

**正确的理由不是"这次算对了"，而是"减法保证永远对"。**

> **凡是"总额 = A + B"的场合，只算 A，B 用减法。**

**这条规矩适用于：税额、折扣、手续费、平台抽成、运费。**

## 5.3 含税和不含税两种模式

```text
不含税定价（B2B 常见）：单价 100 元，加 13% 税 → 客户付 113
含税定价（B2C 常见）：单价 113 元，其中 13 元是税
```

**你的系统该支持哪种，取决于客户是谁。**

**但代码里必须只做一种，不能"有时候含税有时候不含"。**

**加一个租户级配置：**

```sql
alter table tenants add column if not exists tax_inclusive boolean not null default true;
alter table tenants add column if not exists tax_rate_permille integer not null default 0;
```

**然后 `allocateRefund` 要能同时处理两种情况。** 这就是为什么我建议 `paid_cents` 一定存下来——**不管你怎么算，客户实际付了多少是确定的。**

---

# 第 6 步：写进订单服务（15 分钟）

**新建 `src/orders/money.js`：**

```js
const { toCents, mulCents, sumCents } = require('../money');

function computeOrderAmounts(input, options = {}) {
  const qty = input.quantity;
  const priceCents = input.unitPriceCents;

  if (!Number.isInteger(qty) || qty < 1) {
    throw new TypeError('数量必须是正整数');
  }
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new TypeError('单价必须是正整数分');
  }

  const subtotalCents = priceCents * qty;

  if (!Number.isSafeInteger(subtotalCents)) {
    throw new RangeError('单价 × 数量超出安全整数范围');
  }

  const discountCents = input.discountCents || 0;
  if (!Number.isInteger(discountCents) || discountCents < 0) {
    throw new TypeError('折扣必须是非负整数分');
  }
  if (discountCents > subtotalCents) {
    throw new RangeError('折扣不能超过小计');
  }

  const afterDiscount = subtotalCents - discountCents;

  let taxCents = 0;
  let amountCents = afterDiscount;

  if (options.taxInclusive && options.taxRatePermille > 0) {
    taxCents = Math.round(
      (afterDiscount * options.taxRatePermille) / (1000 + options.taxRatePermille)
    );
    amountCents = afterDiscount;
  } else if (options.taxRatePermille > 0) {
    taxCents = Math.round((afterDiscount * options.taxRatePermille) / 1000);
    amountCents = afterDiscount + taxCents;
  }

  return {
    quantity: qty,
    unitPriceCents: priceCents,
    subtotalCents,
    discountCents,
    taxCents,
    amountCents,
  };
}

module.exports = { computeOrderAmounts };
```

## 6.1 注意 `amountCents` 的两种含义

**含税模式：`amountCents = afterDiscount`（客户付的就是这个，税在里面）**

**不含税模式：`amountCents = afterDiscount + taxCents`（客户付的是加了税的）**

**而第 170 节的 `check` 约束写的是：**

```sql
amount_cents = quantity * unit_price_cents - discount_cents + tax_cents
```

**含税模式下这个等式不成立！**

**所以约束要改：**

```sql
alter table orders drop constraint if exists orders_money_check;
alter table orders add constraint orders_money_check check (
  discount_cents >= 0
  and tax_cents >= 0
  and paid_cents >= 0
  and refunded_cents >= 0
  and refunded_qty >= 0
  and refunded_qty <= quantity
  and refunded_cents <= paid_cents
  and (
    amount_cents = quantity * unit_price_cents - discount_cents + tax_cents
    or amount_cents = quantity * unit_price_cents - discount_cents
  )
);
```

**或者更清楚：加一个 `tax_inclusive` 字段，约束里判断。**

**这一节用后者：**

```sql
alter table orders add column if not exists tax_inclusive boolean not null default true;
```

```sql
alter table orders drop constraint if exists orders_money_check;
alter table orders add constraint orders_money_check check (
  quantity > 0
  and unit_price_cents > 0
  and discount_cents >= 0
  and tax_cents >= 0
  and paid_cents >= 0
  and refunded_cents >= 0
  and refunded_qty >= 0
  and refunded_qty <= quantity
  and refunded_cents <= paid_cents
  and amount_cents = case
    when tax_inclusive
      then quantity * unit_price_cents - discount_cents
      else quantity * unit_price_cents - discount_cents + tax_cents
  end
);
```

**这个约束现在能表达了。**

**它值多少钱：** 任何一条算错的订单都进不了库。**你的 bug 会变成一个 500 错误，而不是三个月后的对账差异。**

---

# 第 7 步：故意让约束拦你一次（10 分钟）

**这是这一节最有用的一分钟。**

**新建 `scripts/money-test.js`：**

```js
const pool = require('../src/db/pool');
const { computeOrderAmounts } = require('../src/orders/money');

(async () => {
  const t = await pool.query("select id from tenants where slug = 'seed-alpha'");
  const tenantId = t.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id', $1, true)", [String(tenantId)]);

    const amounts = computeOrderAmounts(
      { quantity: 3, unitPriceCents: 129900, discountCents: 10000 },
      { taxInclusive: true, taxRatePermille: 130 }
    );
    console.log('算出来的：', amounts);

    const r = await client.query(
      `insert into orders
        (tenant_id, order_no, customer_name, order_date,
         quantity, unit_price_cents, amount_cents, discount_cents, tax_cents, tax_inclusive)
       values ($1, 'MONEY001', '测试', '2026-11-01', $2, $3, $4, $5, $6, true)
       returning id, amount_cents, tax_cents`,
      [tenantId, amounts.quantity, amounts.unitPriceCents, amounts.amountCents, amounts.discountCents, amounts.taxCents]
    );
    console.log('插进去了：', r.rows[0]);
  } catch (err) {
    console.error('被拦住：', err.message);
  } finally {
    await client.query('rollback');
    client.release();
    await pool.end();
  }
})();
```

**跑，应该成功。**

**然后把 `amountCents` 故意加 1 分：**

```js
const bad = amounts.amountCents + 1;
```

**跑，应该看到：**

```text
被拦住： new row for relation "orders" violates check constraint "orders_money_check"
```

**这一分钟的意义：你以后写任何金额逻辑，只要算错，数据库会当场喊你。**

---

# 第 8 步：最终验收

## A. 规矩

- [ ] 项目 README 里写了"金额一律整数分，变量名带 Cents"
- [ ] 库里所有金额字段都是 `integer`，名字都以 `_cents` 结尾
- [ ] 我知道只有入口和出口做单位转换

## B. 工具函数

- [ ] `tests/money.test.js` 全绿
- [ ] `toCents('1.005')` 返回 `null`（不是 100）
- [ ] `toCents('(1299.00)')` 返回 `-129900`
- [ ] `fromCents(1299.5)` 抛错
- [ ] `splitEvenly` 一百个随机用例总额都守恒
- [ ] 往返转换 `'99999.99'` 精确

## C. 数据库约束

- [ ] `orders_money_check` 存在
- [ ] 含税和不含税两种模式都通过了约束
- [ ] 我故意插了一条错的，被拦住了
- [ ] `refunded_qty <= quantity` 和 `refunded_cents <= paid_cents` 都在

## D. 退款

- [ ] `refunded_qty` 是独立字段，不是靠金额反推
- [ ] `splitByWeights(379700, [1,1,1])` = `[126567, 126567, 126566]`
- [ ] 全部退完等于实付，一分不差
- [ ] 退款超过可退金额会抛错

## E. 税费

- [ ] `extractTaxFromInclusive(11300, 130)` → tax `1300`, net `10000`
- [ ] 我知道 `net` 必须用减法算，不能独立舍入
- [ ] 订单表有 `tax_inclusive` 字段

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我把 `126567 / 126567 / 126566` 这组数抄下来了
- [ ] 我记下了"凡是总额 = A + B，只算 A，B 用减法"

## 提交

```text
git add -A
git commit -m "第172节课: 整数分运算 + 分摊守恒 + 退款与税费 + 数据库金额约束"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `violates check constraint "orders_money_check"` | 你的金额算错了，或者字段顺序填反了 | 这是好事，去查 `computeOrderAmounts` |
| `fromCents 只接受整数分` | 传了浮点 | 检查上游哪里产生了小数 |
| `toCents('1.005')` 返回 `null` | 三位小数被拒 | 这是设计，客户端应该只传两位 |
| `splitByWeights 权重之和必须大于 0` | 传了全 0 | 检查权重来源 |
| 退款后 `refunded_cents` 超过 `paid_cents` | 重复退款 | 用 `refunded_qty` 判断，不要用金额反推 |
| 分摊后总额差 1 分 | 每项独立四舍五入 | 用 `splitByWeights`，先取整再补余数 |
| 税 + 不含税金额 ≠ 总额 | 两个都独立舍入 | 只算一个，另一个用减法 |
| 对账时差 0.0000001 | 中途用了浮点 | 全程整数分 |
| `Number.MAX_SAFE_INTEGER` 溢出 | 单价 × 数量太大 | 加业务上限（单价 ≤ 100 万，数量 ≤ 10000） |
| Excel 导出金额变成科学计数法 | 写进去的是数字 | 写字符串，或者设 `numFmt` |
| 客户说"你们少收了一分" | `Math.round(1.005 * 100)` | 文本路径用正则 + 整数运算 |

---

## 本节课要能说出口的一句话

> **金额只用整数分，浮点只在"文本转整数"和"最后一步除法"各出现一次；任何分摊都要保证"分完加起来等于分之前"，因为差的那一分钱客户能发现，查不出来的是你的信誉。**
