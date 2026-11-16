# 第 170 节课：错一半也能用

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课你读对了值。这节课要回答一个更难的问题：**客户给的 3000 行里有 47 行是错的，你怎么办？**
> 三个选项：全拒、静默丢、部分成功。**只有第三个能让你收到这笔钱。**

**建议用时**：185 分钟（8 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—3 步（85 分钟）一次，第 4—7 步（100 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 169 节课（`reader.js` 能读出脏文件的正确值）

---

# 第 0 步：三种做法，两种会丢客户（10 分钟）

## 0.1 全拒

```text
"文件有错误，请修正后重试"
```

**客户打开文件，3000 行，他不知道哪 47 行错了。**

**他会做的第一件事：打你电话。** 然后你手工找，找完让他改，他改完再传，你又发现新的错。

**三轮之后他会说"这系统太难用了"。** 而实际上你的代码一行没写错——**你只是没告诉他错在哪。**

## 0.2 静默丢

```text
"导入成功，共 2953 条"
```

**客户会问："我文件里是 3000 条，为什么只有 2953？"**

**你答不上来。** 因为你把 47 行直接 `continue` 掉了，日志也没留。

**这个做法比全拒糟得多。** 全拒至少客户知道数据没进去；静默丢是**客户以为进去了，实际少了**。等他一个月后发现账对不上，损失已经发生了。

## 0.3 部分成功 + 错误报告

```text
"导入完成：成功 2953 条，失败 47 条"
[ 下载失败明细 ]
```

**客户下载一份 Excel，里面是那 47 行 + 一列"失败原因"。**

**他改完这 47 行，再传一次。** 这次传的文件里只有 47 行，前 2953 行已经进去了。

**所以你要保证：同一份文件传两次，不会重复入库。** 这是这一节的第二个核心。

## 0.4 这节课要建立的六个东西

```text
① 一张明确的校验规则表（哪些字段、什么规则、什么错误码）
② 一个收集器（不是遇到错就 return，是收集完所有错再返回）
③ 先全量校验、再批量入库（不是边校验边插）
④ 幂等（同一份文件两次，结果一样）
⑤ 一份可下载的错误文件（带原文件行号）
⑥ 一个导入记录（谁、什么时候、成功多少、失败多少）
```

---

# 第 1 步：先定校验规则（20 分钟）

**不要一边写代码一边想规则。** 先把规则写成表，代码照着表写。

## 1.1 规则表

**新建 `docs/import-rules.md`（或者直接写在笔记里）：**

| 字段 | 必填 | 类型 | 规则 | 错误码 |
|---|---|---|---|---|
| 订单号 | 是 | 文本 | 长度 1—64，只允许字母数字和 `-` `_` | `ORDER_NO_EMPTY` / `ORDER_NO_FORMAT` |
| 客户名称 | 是 | 文本 | 去掉首尾空白后 1—100 字 | `CUSTOMER_EMPTY` / `CUSTOMER_TOO_LONG` |
| 下单日期 | 是 | 日期 | 能解析，且不早于 2000-01-01，不晚于今天 + 1 年 | `DATE_INVALID` / `DATE_RANGE` |
| 数量 | 是 | 整数 | 1—10000 | `QTY_INVALID` / `QTY_RANGE` |
| 单价（元） | 是 | 金额 | > 0 且 ≤ 1000000 | `PRICE_INVALID` / `PRICE_RANGE` |
| 备注 | 否 | 文本 | ≤ 500 字 | `NOTE_TOO_LONG` |
| 订单号 | — | 唯一 | 文件内不能重复；库里不能已存在 | `ORDER_NO_DUP_IN_FILE` / `ORDER_NO_EXISTS` |

**为什么要有错误码：**

```text
只给中文：前端只能把整行标红
有错误码：前端能把"订单号"那一格标红，其他格正常
```

**而且错误码可以统计。**

**跑一次导入，看到 `DATE_INVALID` 出现 40 次——你立刻知道客户那一列日期格式不对，可以直接告诉他"请把日期列设成 2026-11-05 这种格式"，而不是让他一个个找。**

## 1.2 为什么分成"格式错误"和"业务错误"

**因为处理方式不同：**

```text
格式错误（QTY_INVALID）    → 客户改一个格就行
业务错误（ORDER_NO_EXISTS） → 客户要去查系统里已有的单，可能不该改，该删
```

**在错误文件里，这两类要用不同的颜色或者不同的列标出来。**

**这一节先都放一起，但在 `code` 里区分。**

---

# 第 2 步：写校验器（40 分钟）

## 2.1 金额和数量：先定工具函数

**上一节课读出来单价是 `1299`（数字）或者 `"1,299.00"`（文本）。要把它变成一个整数分。**

**新建 `src/money/index.js`：**

```js
function yuanToCents(input) {
  if (input === null || input === undefined) return null;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }

  if (typeof input !== 'string') return null;

  let s = input.trim();
  if (s === '') return null;

  s = s.replace(/[,\s¥$￥]/g, '');

  if (s.startsWith('(') && s.endsWith(')')) {
    s = '-' + s.slice(1, -1);
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;

  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart, decPart = ''] = body.split('.');

  const cents =
    Number(intPart) * 100 + Number((decPart + '00').slice(0, 2));

  if (!Number.isSafeInteger(cents)) return null;

  return neg ? -cents : cents;
}

function centsToYuan(cents) {
  if (!Number.isInteger(cents)) {
    throw new Error('centsToYuan 只接受整数分，收到：' + cents);
  }
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = String(abs % 100).padStart(2, '0');
  return (neg ? '-' : '') + yuan + '.' + fen;
}

module.exports = { yuanToCents, centsToYuan };
```

## 2.2 三处必须讲清

### 为什么 `Math.round(input * 100)` 这里可以用 `Math.round`

**上节课的 README 说 `Math.round(1.005 * 100)` 会错。为什么这里又用它：**

```text
1.005 * 100 = 100.49999999999999  → round = 100  ✗
```

**问题在于"用户输入的 1.005 元"**——**但人民币最小单位是分，`1.005 元` 本身就不是一个合法的金额。**

**所以处理策略分两种：**

```text
路径一（推荐）：文本输入 → 用正则限制最多两位小数 → 整数运算
路径二（兜底）：数字输入 → Math.round(x * 100) → 接受"1.005 会变成 1.00"这个结果
```

**代码里两条路都在：** 文本走正则 + 整数运算（精确），数字走 `Math.round`（已经是浮点了，只能四舍五入）。

**关键认识：一旦值变成了 JS 的 `number`，精度就已经丢了。** 所以**能早一步用字符串处理，就早一步用。**

### 文本路径为什么用整数运算

```js
const [intPart, decPart = ''] = body.split('.');
const cents = Number(intPart) * 100 + Number((decPart + '00').slice(0, 2));
```

**`"1299.5"` → `"1299"` + `"5"` → `129900 + 50 = 129950`。**

**全程没有浮点数参与。** 这是唯一能保证精确的做法。

**`(decPart + '00').slice(0, 2)` 处理"只写了一位小数"的情况：**

```text
"5"    → "500".slice(0,2) → "50"  ✓
"50"   → "5000".slice(0,2) → "50" ✓
""     → "00".slice(0,2) → "00"   ✓
```

### 括号表示负数

```js
if (s.startsWith('(') && s.endsWith(')')) {
  s = '-' + s.slice(1, -1);
}
```

**财务表格里负数写成 `(1,299.00)`，这是会计惯例。**

**不处理的话，`(1299)` 会被正则拒掉，客户会奇怪"我这个数明明是对的"。**

**这个格式在退款、调整单里非常常见。**

## 2.3 写 `src/excel/validate.js`

```js
const { parseDateLoose } = require('./reader');
const { yuanToCents } = require('../money');

const MAX_QTY = 10000;
const MAX_PRICE_CENTS = 100000000;
const MIN_DATE = Date.UTC(2000, 0, 1);

function cleanText(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u3000\s]+/g, ' ').trim();
}

function normalizeOrderNo(v) {
  return cleanText(v).replace(/\s/g, '').toUpperCase();
}

function todayPlusYears(years) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.getTime();
}

function validateRow(rec, ctx) {
  const errors = [];
  const out = {};

  const orderNo = normalizeOrderNo(rec['订单号']);
  if (orderNo === '') {
    errors.push({ field: '订单号', code: 'ORDER_NO_EMPTY', message: '订单号为空' });
  } else if (!/^[A-Z0-9_-]{1,64}$/.test(orderNo)) {
    errors.push({
      field: '订单号',
      code: 'ORDER_NO_FORMAT',
      message: '订单号只能包含字母、数字、- 和 _，长度 1—64',
    });
  } else {
    out.order_no = orderNo;
  }

  const customer = cleanText(rec['客户名称']);
  if (customer === '') {
    errors.push({ field: '客户名称', code: 'CUSTOMER_EMPTY', message: '客户名称为空' });
  } else if (customer.length > 100) {
    errors.push({
      field: '客户名称',
      code: 'CUSTOMER_TOO_LONG',
      message: '客户名称超过 100 字',
    });
  } else {
    out.customer_name = customer;
  }

  const rawDate = rec['下单日期'];
  const date = parseDateLoose(rawDate);
  if (!date) {
    errors.push({
      field: '下单日期',
      code: 'DATE_INVALID',
      message: '日期无法识别：' + String(rawDate),
    });
  } else {
    const t = date.getTime();
    if (t < MIN_DATE) {
      errors.push({ field: '下单日期', code: 'DATE_RANGE', message: '日期早于 2000-01-01' });
    } else if (t > todayPlusYears(1)) {
      errors.push({ field: '下单日期', code: 'DATE_RANGE', message: '日期超过一年以后' });
    } else {
      out.order_date = date;
    }
  }

  const rawQty = rec['数量'];
  const qtyNum =
    typeof rawQty === 'number'
      ? rawQty
      : Number(String(rawQty === null ? '' : rawQty).trim());
  if (!Number.isInteger(qtyNum) || qtyNum < 1) {
    errors.push({
      field: '数量',
      code: 'QTY_INVALID',
      message: '数量必须是正整数：' + String(rawQty),
    });
  } else if (qtyNum > MAX_QTY) {
    errors.push({ field: '数量', code: 'QTY_RANGE', message: '数量超过 ' + MAX_QTY });
  } else {
    out.quantity = qtyNum;
  }

  const rawPrice = rec['单价'];
  const priceCents = yuanToCents(rawPrice);
  if (priceCents === null) {
    errors.push({
      field: '单价',
      code: 'PRICE_INVALID',
      message: '单价格式不对：' + String(rawPrice),
    });
  } else if (priceCents <= 0) {
    errors.push({ field: '单价', code: 'PRICE_RANGE', message: '单价必须大于 0' });
  } else if (priceCents > MAX_PRICE_CENTS) {
    errors.push({
      field: '单价',
      code: 'PRICE_RANGE',
      message: '单价超过 100 万',
    });
  } else {
    out.unit_price_cents = priceCents;
  }

  const note = cleanText(rec['备注']);
  if (note.length > 500) {
    errors.push({ field: '备注', code: 'NOTE_TOO_LONG', message: '备注超过 500 字' });
  } else {
    out.note = note === '' ? null : note;
  }

  if (out.quantity && out.unit_price_cents) {
    out.amount_cents = out.quantity * out.unit_price_cents;
    if (!Number.isSafeInteger(out.amount_cents)) {
      errors.push({ field: '总价', code: 'AMOUNT_OVERFLOW', message: '总价计算溢出' });
    }
  }

  return { rowNumber: rec.__rowNumber, values: out, errors };
}

function validateAll(records) {
  const results = [];
  const seen = new Map();

  for (const rec of records) {
    const r = validateRow(rec);
    results.push(r);

    if (r.values.order_no) {
      const key = r.values.order_no;
      if (seen.has(key)) {
        r.errors.push({
          field: '订单号',
          code: 'ORDER_NO_DUP_IN_FILE',
          message: '文件内第 ' + seen.get(key) + ' 行已有这个订单号',
        });
      } else {
        seen.set(key, r.rowNumber);
      }
    }
  }

  return results;
}

module.exports = { validateRow, validateAll, normalizeOrderNo, cleanText };
```

## 2.4 四个设计点

### 一个函数里不 `return` 错就结束

**看结构：每个字段独立 `if / else`，错误 `push` 进数组，最后一起返回。**

**对比错误的写法：**

```js
if (!orderNo) return { error: '订单号为空' };      // ❌ 客户只看到第一个错
```

**客户改完订单号再传，你又告诉他"客户名称也空"。第三轮他就烦了。**

**一次把所有错都告诉他。**

### `cleanText` 处理全角空格

```js
String(v).replace(/[\u3000\s]+/g, ' ').trim();
```

**`\u3000` 是全角空格。**

**客户从微信里复制的内容、从别的系统导出的内容，经常带全角空格。** 普通的 `trim()` 只去半角空格，去不掉全角。

**不处理会怎样：** 客户名变成 `"　杭州甲乙公司"`（前面一个看不见的字符），你查重的时候永远匹配不上自己录的那条。

**这个坑在第 169 节的脏文件里就埋了。**

### `normalizeOrderNo` 做大写

```js
.replace(/\s/g, '').toUpperCase()
```

**客户这次写 `a001`，下次写 `A001`。** 不统一大小写，你会认为是两个不同的订单，重复入库。

**为什么去空格：** 有的客户会写 `A 001`。

**注意：这个转换要在"校验格式"之前做。** 否则 `A 001` 会被 `ORDER_NO_FORMAT` 拒掉。

### 文件内查重放在 `validateAll`，不放在 `validateRow`

**因为单行校验看不到其他行。**

**`seen` 这个 Map 记录"这个订单号第一次出现在第几行"。** 第二次出现时报错，同时告诉客户"第 4 行已经有这个号了"。

**这句话很有用**——客户能直接跳到第 4 行对比，看是不是重复粘了。

## 2.5 自检点

**新建 `scripts/validate-test.js`：**

```js
const { validateAll } = require('../src/excel/validate');

const rows = [
  { __rowNumber: 4, '订单号': 'A001', '客户名称': '公司甲', '下单日期': 45000, '数量': 3, '单价': '1,299.00', '备注': '' },
  { __rowNumber: 5, '订单号': '', '客户名称': '公司乙', '下单日期': 45001, '数量': 2, '单价': 899, '备注': '' },
  { __rowNumber: 6, '订单号': 'A003', '客户名称': '', '下单日期': 'abc', '数量': 0, '单价': -5, '备注': '' },
  { __rowNumber: 7, '订单号': 'a001', '客户名称': '公司丙', '下单日期': 45002, '数量': 1, '单价': 100, '备注': '' },
];

const results = validateAll(rows);

for (const r of results) {
  console.log('第', r.rowNumber, '行：', r.errors.length === 0 ? '通过' : '失败');
  for (const e of r.errors) {
    console.log('   ', e.code, '|', e.field, '|', e.message);
  }
  if (r.errors.length === 0) {
    console.log('    →', JSON.stringify(r.values));
  }
}
```

**跑：**

```text
node scripts/validate-test.js
```

**期望：**

```text
第 4 行： 通过
    → {"order_no":"A001","customer_name":"公司甲","order_date":"2023-03-15T00:00:00.000Z","quantity":3,"unit_price_cents":129900,"note":null,"amount_cents":389700}
第 5 行： 失败
    ORDER_NO_EMPTY | 订单号 | 订单号为空
第 6 行： 失败
    CUSTOMER_EMPTY | 客户名称 | 客户名称为空
    DATE_INVALID | 下单日期 | 日期无法识别：abc
    QTY_INVALID | 数量 | 数量必须是正整数：0
    PRICE_RANGE | 单价 | 单价必须大于 0
第 7 行： 失败
    ORDER_NO_DUP_IN_FILE | 订单号 | 文件内第 4 行已有这个订单号
```

**四个关键结果，逐个核对：**

```text
① 第 4 行金额：129900 × 3 = 389700 分 = 3897.00 元  ✓
② 第 6 行一次报了四个错  ✓（这就是"不要 return 就结束"的价值）
③ 第 7 行 a001 被转成 A001，和第 4 行撞上了  ✓
④ 第 5 行只报了订单号空，其他字段都对  ✓
```

**第 ③ 条最容易漏。** 如果第 7 行通过了，说明 `normalizeOrderNo` 没做大写。

---

# 第 3 步：订单表（15 分钟）

**导入的数据要落到一张表里。**

**新建 `migrations/008_orders.sql`：**

```sql
create table orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  order_no          text not null,
  customer_name     text not null,
  order_date        date not null,
  quantity          integer not null check (quantity > 0),
  unit_price_cents  integer not null check (unit_price_cents > 0),
  amount_cents      integer not null check (amount_cents > 0),
  note              text,
  status            text not null default 'pending',
  source            text not null default 'import',
  import_job_id     uuid,
  created_at        timestamptz not null default now(),
  unique (tenant_id, order_no)
);

create index orders_tenant_date_idx on orders (tenant_id, order_date desc);
create index orders_tenant_customer_idx on orders (tenant_id, customer_name);

alter table orders enable row level security;
alter table orders force row level security;

create policy tenant_isolation on orders
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**跑：**

```text
npm run migrate
```

**四处要讲：**

### `unique (tenant_id, order_no)`

**又是第 24 周那条规矩：唯一约束必须带 `tenant_id`。**

**不带的话，客户 A 的 `A001` 和客户 B 的 `A001` 会撞。**

**这条约束是幂等的最后一道保险。** 就算你的代码没查重，数据库也会拒。

### `amount_cents` 存下来，不每次算

**因为单价可能会改。**

```text
导入时单价 1299，数量 3，总额 3897
三个月后客户说"这个单价录错了，应该是 1399"
你改了 unit_price_cents
```

**如果总额是每次算出来的，历史订单的总价会跟着变。** 客户看到的报表上个月的数变了，会疯。

**金额一旦确定就要存下来。** 这是财务数据的基本原则。

### `check (quantity > 0)` 这些约束

**应用层校验过了，为什么数据库还要拦：**

```text
① 你的导入脚本可能绕过应用层直接插
② 以后加的接口可能忘了校验
③ 数据库是最后一道门，它能保证"库里没有脏数据"
```

**正经的做法都是两层：应用层给客户友好的提示，数据库层保证数据不脏。**

### `import_job_id`

**记"这条订单是哪次导入进来的"。**

**有什么用：**

```text
客户说"我 11 月 3 号导的那批数据有问题，能撤回吗"
→ 按 import_job_id 一条 SQL 就能筛出来
```

**没有它，你只能问客户"你还记得大概导了哪些吗"。**

---

# 第 4 步：批量入库（35 分钟）

## 4.1 先建导入记录表

**新建 `migrations/009_import_jobs.sql`：**

```sql
create table import_jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  filename      text not null,
  total_rows    integer not null default 0,
  ok_rows       integer not null default 0,
  failed_rows   integer not null default 0,
  skipped_rows  integer not null default 0,
  status        text not null default 'running',
  errors        jsonb not null default '[]'::jsonb,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index import_jobs_tenant_idx on import_jobs (tenant_id, created_at desc);

alter table import_jobs enable row level security;
alter table import_jobs force row level security;

create policy tenant_isolation on import_jobs
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

**为什么要存 `errors` 这个 jsonb：**

**这样客户关掉浏览器、第二天回来，还能下载错误清单。** 不用重新传一次文件。

**但只存前 500 条。** 3000 行全错的时候，把 3000 条错误都塞进 jsonb，这一行会很大。

```js
const errorsToStore = results
  .filter((r) => r.errors.length > 0)
  .slice(0, 500)
  .map((r) => ({ rowNumber: r.rowNumber, errors: r.errors }));
```

**超过 500 条就在响应里说"只展示前 500 条，完整清单请下载文件"。**

## 4.2 写服务层

**新建 `src/imports/service.js`：**

```js
const { readSheet, findHeaderRow, toRecords } = require('../excel/reader');
const { validateAll } = require('../excel/validate');

const REQUIRED_HEADERS = ['订单号', '客户名称', '下单日期', '数量', '单价'];
const OPTIONAL_HEADERS = ['备注'];

async function runImport(db, tenantId, filePath, filename, userId) {
  const job = await db.client.query(
    `insert into import_jobs (tenant_id, filename, created_by)
     values ($1, $2, $3)
     returning id`,
    [tenantId, filename, userId]
  );
  const jobId = job.rows[0].id;

  const { rows } = await readSheet(filePath);

  const header = findHeaderRow(rows, REQUIRED_HEADERS, { threshold: 1 });
  if (!header) {
    await db.client.query(
      `update import_jobs
       set status = 'failed', finished_at = now(),
           errors = $1::jsonb
       where id = $2`,
      [JSON.stringify([{ code: 'HEADER_NOT_FOUND', message: '找不到必需的表头：' + REQUIRED_HEADERS.join('、') }]), jobId]
    );
    return {
      jobId,
      fatal: 'HEADER_NOT_FOUND',
      message: '文件里找不到表头。必需列：' + REQUIRED_HEADERS.join('、'),
    };
  }

  const optHeader = findHeaderRow(rows, OPTIONAL_HEADERS, { threshold: 0.5 });
  if (optHeader && optHeader.index === header.index) {
    Object.assign(header.map, optHeader.map);
  }

  const { records, skipped } = toRecords(rows, header);
  const results = validateAll(records);

  const existingNos = await findExistingOrderNos(
    db,
    tenantId,
    results.filter((r) => r.values.order_no).map((r) => r.values.order_no)
  );

  for (const r of results) {
    if (r.values.order_no && existingNos.has(r.values.order_no)) {
      r.errors.push({
        field: '订单号',
        code: 'ORDER_NO_EXISTS',
        message: '这个订单号系统里已经有了',
      });
    }
  }

  const good = results.filter((r) => r.errors.length === 0);
  const bad = results.filter((r) => r.errors.length > 0);

  let inserted = 0;
  if (good.length > 0) {
    inserted = await bulkInsertOrders(db, tenantId, jobId, good);
  }

  const storedErrors = bad.slice(0, 500).map((r) => ({
    rowNumber: r.rowNumber,
    errors: r.errors,
  }));

  await db.client.query(
    `update import_jobs
     set total_rows = $1, ok_rows = $2, failed_rows = $3, skipped_rows = $4,
         status = 'done', errors = $5::jsonb, finished_at = now()
     where id = $6`,
    [records.length, inserted, bad.length, skipped.length, JSON.stringify(storedErrors), jobId]
  );

  return {
    jobId,
    total: records.length,
    ok: inserted,
    failed: bad.length,
    skipped: skipped.length,
    errorsTruncated: bad.length > 500,
    skippedDetail: skipped.slice(0, 50),
  };
}

async function findExistingOrderNos(db, tenantId, orderNos) {
  if (orderNos.length === 0) return new Set();

  const { rows } = await db.client.query(
    `select order_no from orders
     where tenant_id = $1 and order_no = any($2::text[])`,
    [tenantId, orderNos]
  );

  return new Set(rows.map((r) => r.order_no));
}

async function bulkInsertOrders(db, tenantId, jobId, items) {
  const orderNos = items.map((r) => r.values.order_no);
  const customers = items.map((r) => r.values.customer_name);
  const dates = items.map((r) => r.values.order_date.toISOString().slice(0, 10));
  const qtys = items.map((r) => r.values.quantity);
  const prices = items.map((r) => r.values.unit_price_cents);
  const amounts = items.map((r) => r.values.amount_cents);
  const notes = items.map((r) => r.values.note);

  const { rows } = await db.client.query(
    `insert into orders
       (tenant_id, order_no, customer_name, order_date,
        quantity, unit_price_cents, amount_cents, note, import_job_id)
     select $1, t.order_no, t.customer_name, t.order_date::date,
            t.quantity, t.unit_price_cents, t.amount_cents, t.note, $2
     from unnest($3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::int[], $9::text[])
       as t(order_no, customer_name, order_date, quantity, unit_price_cents, amount_cents, note)
     on conflict (tenant_id, order_no) do nothing
     returning id`,
    [tenantId, jobId, orderNos, customers, dates, qtys, prices, amounts, notes]
  );

  return rows.length;
}

module.exports = { runImport, REQUIRED_HEADERS };
```

## 4.3 四个关键技术点

### `unnest` 一次插完，不用循环

**对比：**

```js
// ❌ 循环 3000 次，3000 次网络往返
for (const item of items) {
  await client.query('insert into orders (...) values (...)', [...]);
}
```

```js
// ✅ 一次网络往返
from unnest($3::text[], $4::text[], ...) as t(...)
```

**3000 行循环插入要 3—10 秒，`unnest` 一次插入是 50—200 毫秒。**

**差 20 倍以上。而且客户在等——他是个老板，正盯着进度条。**

**`unnest` 的写法记住：多个数组并排展开，`as t(列名...)` 给它们起名。**

### `on conflict (tenant_id, order_no) do nothing` + `returning id`

**这两句配在一起有个关键作用：`returning` 只返回"真的插进去了"的行。**

```text
10 条要插，其中 2 条库里已经存在
→ on conflict 跳过那 2 条
→ returning 返回 8 个 id
→ rows.length = 8
```

**所以 `inserted` 的数量是准的，不用另外数。**

**这是幂等的最后一道保险。** 就算 `findExistingOrderNos` 因为并发漏了（另一个请求刚插进去同号订单），`on conflict` 也会拦住。

### `findExistingOrderNos` 只查一次

**3000 行不能 3000 次 `select`。**

**用 `= any($2::text[])` 一次查完。**

**为什么 `= any(数组)` 而不是 `in (...)`：** `in` 要拼 3000 个占位符，SQL 文本会非常长，而且 PostgreSQL 的参数上限是 65535 个。**`any` 只占一个参数位。**

### `threshold: 1` 找必需表头

**第 169 节用的是 `0.5`，这里改成 `1`。**

**因为必需列必须全有。** 少了"单价"这一列，你的导入就没有意义。

**可选列（备注）用 `0.5`，有就用，没有就算了。**

**这就是第 169 节末尾说的"必需列和可选列要分开"。**

---

# 第 5 步：接上接口（20 分钟）

## 5.1 装上传中间件

```text
npm install multer
```

**新建 `src/routes/imports.js`：**

```js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');
const { runImport } = require('../imports/service');
const { buildErrorFile } = require('../excel/error-file');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('只支持 .xlsx 文件，请用 Excel 另存为 .xlsx'), ok);
  },
});

router.use(auth, tenant);

router.post('/', upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: '没有收到文件' });
  }

  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员能导入数据' });
  }

  try {
    const result = await withTenant(req.tenant.id, (db) =>
      runImport(db, req.tenant.id, req.file.path, req.file.originalname, req.user.id)
    );

    res.status(result.fatal ? 422 : 200).json(result);
  } catch (err) {
    next(err);
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
});

router.get('/:jobId/errors.xlsx', async (req, res, next) => {
  try {
    const job = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        'select errors from import_jobs where tenant_id = $1 and id = $2',
        [req.tenant.id, req.params.jobId]
      );
      return r.rows[0];
    });

    if (!job) {
      return res.status(404).json({ error: '导入记录不存在' });
    }

    const buffer = await buildErrorFile(job.errors, req.params.jobId);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', buildContentDisposition('导入失败明细.xlsx'));
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

function buildContentDisposition(filename) {
  const ascii = 'errors.xlsx';
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

module.exports = router;
```

**挂到 `server.js`：**

```js
const importRoutes = require('./routes/imports');
app.use('/api/imports', importRoutes);
```

## 5.2 `withTenant` 里为什么要传 `db`

**看 `runImport(db, ...)` 的签名。** 它要能执行 SQL，但不能自己去拿 `pool`。

**所以 `withTenant` 里的 `db` 必须能跑 SQL。** 第 24 周的设计是"路由里不许有裸 SQL"，但这里是**服务层**，不是路由层。

**给服务层开一个受限的口子是合理的：**

```js
// tenant-db.js 里已有
{ client, conversations, messages, files, users, exportAll }
```

**`db.client` 就是那个口子。第 24 节的检查脚本只扫 `src/routes/`，不扫 `src/imports/`。**

**这是个判断：服务层的 SQL 太多了（订单、导入、支付），全封进仓储方法会让 `tenant-db.js` 变成一个几千行的怪物。**

**折中方案：**

```text
路由层      → 零 SQL，只用仓储方法和 service
service 层  → 可以有 SQL，但必须在 withTenant 里（tenant_id 来自闭包）
```

**这个分层要写进笔记。** 以后加新的 service，都按这个规矩。

## 5.3 上传中间件的一个坑

**`upload.single('file')` 里的 `'file'` 是表单字段名。**

**前端必须用这个名字：**

```js
const fd = new FormData();
fd.append('file', fileInput.files[0]);
```

**写成 `fd.append('xlsx', ...)` 会报：**

```text
MulterError: Unexpected field
```

**这个报错看不出是字段名错了。** 你会去查文件大小限制、查 MIME 类型，都不是。

**记下来：`Unexpected field` = 前端字段名和 `upload.single()` 的参数不一致。**

---

# 第 6 步：错误文件（25 分钟）

**新建 `src/excel/error-file.js`：**

```js
const ExcelJS = require('exceljs');
const { findHeaderRow } = require('./reader');

const FIELD_ORDER = ['订单号', '客户名称', '下单日期', '数量', '单价', '备注'];

async function buildErrorFile(errors, jobId) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'saas-lab';
  wb.created = new Date();

  const ws = wb.addWorksheet('导入失败明细', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: '原始行号', key: 'row', width: 10 },
    { header: '问题字段', key: 'field', width: 16 },
    { header: '错误码', key: 'code', width: 26 },
    { header: '原因', key: 'message', width: 52 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8E8E8' },
  };

  const flat = [];
  for (const item of errors) {
    for (const e of item.errors) {
      flat.push({
        row: item.rowNumber,
        field: e.field || '',
        code: e.code || '',
        message: e.message || '',
      });
    }
  }

  flat.sort((a, b) => a.row - b.row);

  for (const f of flat) {
    const row = ws.addRow(f);
    row.getCell('message').alignment = { wrapText: true, vertical: 'top' };
  }

  ws.autoFilter = { from: 'A1', to: 'D1' };

  const summary = wb.addWorksheet('怎么改');
  summary.columns = [{ width: 100 }];

  [
    '导入失败明细说明',
    '',
    `任务编号：${jobId}`,
    `失败行数：${new Set(flat.map((f) => f.row)).size}`,
    `错误条数：${flat.length}`,
    '',
    '怎么用这份文件',
    '1. 按"原始行号"回到你原来的 Excel 文件，找到对应的那一行',
    '2. 看"原因"那一列，改掉问题字段',
    '3. 只把改好的行复制到一个新文件，重新导入（已经成功的行不用再传）',
    '',
    '常见错误码',
    'ORDER_NO_EMPTY            订单号没填',
    'ORDER_NO_FORMAT           订单号里有不允许的字符（只能用字母、数字、- 和 _）',
    'ORDER_NO_DUP_IN_FILE      同一个订单号在文件里出现了两次',
    'ORDER_NO_EXISTS           这个订单号系统里已经有了',
    'CUSTOMER_EMPTY            客户名称没填',
    'DATE_INVALID              日期看不懂，建议改成 2026-11-05 这种格式',
    'DATE_RANGE                日期太早（2000 年前）或太晚（一年以后）',
    'QTY_INVALID               数量不是正整数',
    'PRICE_INVALID             单价格式不对',
    'PRICE_RANGE               单价必须大于 0 且不超过 100 万',
    'NOTE_TOO_LONG             备注超过 500 字',
  ].forEach((line) => summary.addRow([line]));

  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getRow(7).font = { bold: true };
  summary.getRow(13).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { buildErrorFile };
```

## 6.1 四处设计

### 冻结首行 + 自动筛选

```js
views: [{ state: 'frozen', ySplit: 1 }]
ws.autoFilter = { from: 'A1', to: 'D1' };
```

**500 条错误的时候，客户要往下翻。** 没有冻结，翻到第 300 条就看不见表头了。

**有了自动筛选，客户可以只看 `ORDER_NO_EXISTS` 这一类。** 这一类需要他去系统里查，处理方式和其他不一样。

**这两个属性加起来 20 个字符，客户体验差一大截。**

### `wrapText: true`

**"原因"那一列有长句子。** 不换行的话，单元格会被撑得很宽，或者内容被截掉。

### 单独一个"怎么改"的工作表

**这一页是给客户看的说明，不是给程序看的。**

**为什么放在文件里而不是邮件里：** 客户过两周再打开这个文件，邮件早找不到了。

**而且"常见错误码"那段，能挡掉一半的电话咨询。**

### 为什么只列出"原始行号"和"原因"，不重排整行数据

**看起来"把出错那一行的完整数据也带上"更贴心。但有两个问题：**

```text
① 需要再读一次原文件（要保存原文件或者重新解析）
② 客户看到重复的数据，会分不清"这份是新的还是原来那份"
```

**只给行号 + 原因，让客户回到自己的原文件改。** 他心里清楚改的是哪一份。

**如果客户把原文件弄丢了怎么办：** 导入任务里可以保存原文件（`uploads/` 目录），第 168 节的 `purge.js` 里加个清理规则就行。

---

# 第 7 步：故意全错一次（20 分钟）

**全对的测试看不出容错能力。全错才能看到它有没有崩。**

## 7.1 造一个全错的文件

**新建 `scripts/make-bad.js`：**

```js
const ExcelJS = require('exceljs');
const path = require('path');

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('订单');

  ws.addRow(['订单号', '客户名称', '下单日期', '数量', '单价', '备注']);

  ws.addRow(['', '公司一', 45000, 3, 100, '']);
  ws.addRow(['B001', '', 'abc', 3, 100, '']);
  ws.addRow(['B002', '公司三', 45000, 0, 100, '']);
  ws.addRow(['B003', '公司四', 45000, 3, -1, '']);
  ws.addRow(['B004', '公司五', 45000, 3, 'xxx', '']);
  ws.addRow(['B001', '公司六', 45000, 3, 100, '']);
  ws.addRow(['B005', '公司七', 45000, 999999, 100, '']);
  ws.addRow(['B006', '公司八', 19000101, 3, 100, '']);

  const out = path.join(__dirname, '..', 'tests', 'fixtures', '全错订单.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('已生成', out);
})();
```

**这份文件里 8 行数据，8 行错，而且错的方式各不相同：**

```text
第 2 行  订单号空
第 3 行  客户名空 + 日期 abc
第 4 行  数量 0
第 5 行  单价 -1
第 6 行  单价 xxx
第 7 行  订单号和 B001 重复
第 8 行  数量超上限
第 9 行  日期 19000101（被识别成 1900-01-01，早于 2000）
```

## 7.2 跑导入

**启动服务，用 curl 上传：**

```text
curl -X POST http://localhost:3000/api/imports -b cookies.txt -F "file=@tests/fixtures/全错订单.xlsx"
```

**期望响应：**

```json
{
  "jobId": "...",
  "total": 8,
  "ok": 0,
  "failed": 8,
  "skipped": 0,
  "errorsTruncated": false,
  "skippedDetail": []
}
```

## 7.3 三个必须检查的点

**一、进程有没有崩。**

**如果响应是 `500` 或者连接断开，说明某个错没被处理。**

**常见原因：`values` 里某个字段是 `undefined`，后面 `toISOString()` 时报错。**

**比如日期解析失败时 `out.order_date` 不存在，`bulkInsertOrders` 里 `r.values.order_date.toISOString()` 会抛错。**

**但 `bulkInsertOrders` 只处理 `errors.length === 0` 的行，所以不会碰到。** 这正好说明"先全量校验、再批量入库"的设计是对的——**坏行根本到不了入库那一步。**

**二、错误文件能下载。**

```text
curl -o errors.xlsx http://localhost:3000/api/imports/<jobId>/errors.xlsx -b cookies.txt
```

**打开看，应该有 9 条错误（第 3 行有两个错），行号从 2 开始。**

**三、库里一条都没进去。**

```sql
select count(*) from orders;
```

**必须是 0（或者之前导入的数量不变）。**

**这条最容易出问题：** 如果你的代码是"边校验边插"，坏行会导致事务回滚，但前面已经插进去的好行也一起回滚了。

**这就是为什么"先全量校验、再批量入库"是对的——它让好行不被坏行拖累。**

## 7.4 再测"一半对一半错"

**新建 `scripts/make-half.js`：一半好一半坏，看 `ok` 和 `failed` 是不是都对。**

**期望：`ok: 4, failed: 4`。**

**然后跑第二次（同一份文件）。**

**期望：`ok: 0, failed: 8`** —— 因为那 4 条好的已经在库里了，全部变成 `ORDER_NO_EXISTS`。

**这就是幂等。**

**注意这里的语义：**

```text
第一次：好的入库，坏的报错
第二次：好的变成"已存在"，也报错
```

**客户看到第二次全错会困惑。** 所以响应里要能区分"这次新导入的"和"上次已经导过的"：

```text
"导入完成：新增 0 条，已存在 4 条，格式错误 4 条"
```

**这个提示比"失败 8 条"友好得多。** 在第 170 节先做到能返回数字，第 171 节做完前端时再优化措辞。

---

# 第 8 步：最终验收

## A. 校验

- [ ] 规则表写完了（六个字段 + 唯一性）
- [ ] 一行有多个错时，一次全报出来（第 6 行报了四个）
- [ ] `a001` 和 `A001` 被判为重复
- [ ] 全角空格被清掉了
- [ ] `(1,299.00)` 这种负数格式能解析

## B. 入库

- [ ] `orders` 表有 `unique (tenant_id, order_no)`
- [ ] `amount_cents` 是存下来的，不是算出来的
- [ ] 用的是 `unnest` 批量插入，不是循环
- [ ] `on conflict do nothing returning id` 的 `rowCount` 是真实插入数
- [ ] `import_job_id` 记下来了

## C. 容错

- [ ] 全错的文件导入不崩，返回 8 条失败
- [ ] 一半对一半错时，好数据真的进去了
- [ ] 同一份文件传第二次，`ok` 变成 0
- [ ] 库里没有重复订单

## D. 错误文件

- [ ] 能下载，`Content-Disposition` 里有 `filename*=UTF-8''`
- [ ] 中文文件名不乱码
- [ ] 行号和客户 Excel 里看到的一致
- [ ] 有一个"怎么改"的工作表
- [ ] 首行冻结、有筛选

## E. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我把"路由层零 SQL / service 层可以有 SQL"这个分层写下来了
- [ ] 我记下了 `MulterError: Unexpected field` 的原因

## 提交

```text
git add -A
git commit -m "第170节课: 逐行校验 + 部分成功 + unnest 批量入库 + 错误文件"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `MulterError: Unexpected field` | 前端表单字段名和 `upload.single('file')` 不一致 | 两边都改成 `file` |
| `File too large` | 超过 `limits.fileSize` | 调大上限，或者提示客户分两次导 |
| `只支持 .xlsx 文件` | 客户传的是 `.xls` 或 `.csv` | 让客户用 Excel 另存为 `.xlsx` |
| 导入了 0 条但没报错 | 表头没找到，但代码没返回 `fatal` | 检查 `findHeaderRow` 的 `threshold` |
| 好数据也没进去 | 边校验边插，坏行导致整个事务回滚 | 改成先全量校验、再批量入库 |
| `null value in column "order_date"` | 日期校验失败但记录还是进了 `good` | `good` 的定义是 `errors.length === 0`，检查一下 |
| `duplicate key value violates unique constraint "orders_tenant_id_order_no_key"` | 没写 `on conflict do nothing` | 加上；或者并发场景下本来就该跳过 |
| `rowCount` 比预期少 | `on conflict` 跳过了 | 这是对的，`returning` 只返回真插入的 |
| `bind message supplies N parameters` | `unnest` 的数组数量和占位符对不上 | 数一遍 `$3`—`$9` 和 `t(...)` 里的列 |
| 中文文件名下载后变成乱码 | 只写了 `filename=` 没写 `filename*=` | 用本节 `buildContentDisposition` 那个写法 |
| 错误文件的行号和 Excel 里的对不上 | `readSheet` 用了 `eachRow` 没传 `includeEmpty` | 加 `{ includeEmpty: true }` |
| 客户说"我改完还是导不进去" | 他把整份文件又传了一遍，好的那些变成"已存在" | 提示他只传改好的行；或者把 `ORDER_NO_EXISTS` 当成"跳过"不算失败 |

---

## 本节课要能说出口的一句话

> **导入的正确姿态是"先全部校验、再批量入库、失败的行给一份能直接照着改的清单"；任何"错一行就全废"或者"悄悄跳过"的做法，都是在把问题推给客户。**
