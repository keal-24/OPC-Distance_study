# 第 171 节课：十万行不崩

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上节课数据进来了。这节课要把它导出去——**而"导出"是个看起来最简单、最容易把整站搞挂的功能。**
> 客户点一下"导出全部订单"，你的 Node 进程内存飙到 2GB，被杀掉，**所有用户同时 502**。

**建议用时**：120 分钟
**你需要先完成**：第 170 节课（订单能导入，库里有几百条以上数据）

---

# 第 0 步：先造 10 万行数据（15 分钟）

**没有足够的数据，你测不出任何问题。**

**新建 `scripts/seed-orders.js`：**

```js
const pool = require('../src/db/pool');

const TARGET = Number(process.argv[2] || 100000);

(async () => {
  const t = await pool.query("select id, name from tenants where slug = 'seed-alpha'");
  if (t.rowCount === 0) {
    console.log('先跑 node scripts/seed.js');
    await pool.end();
    return;
  }

  const tenantId = t.rows[0].id;
  console.log('往', t.rows[0].name, '里插', TARGET, '条订单');

  const client = await pool.connect();
  try {
    await client.query('begin');

    const batch = 5000;

    for (let start = 0; start < TARGET; start += batch) {
      const size = Math.min(batch, TARGET - start);

      const nos = [];
      const customers = [];
      const dates = [];
      const qtys = [];
      const prices = [];

      for (let i = 0; i < size; i++) {
        const n = start + i + 1;
        nos.push('SEED' + String(n).padStart(7, '0'));
        customers.push('测试客户' + (n % 500));
        dates.push(new Date(Date.UTC(2025, 0, 1) + (n % 700) * 86400000).toISOString().slice(0, 10));
        qtys.push((n % 20) + 1);
        prices.push(9900 + (n % 100));
      }

      await client.query(
        `insert into orders
           (tenant_id, order_no, customer_name, order_date,
            quantity, unit_price_cents, amount_cents, source)
         select $1, t.order_no, t.customer_name, t.order_date::date,
                t.quantity, t.unit_price, t.quantity * t.unit_price, 'seed'
         from unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::int[])
           as t(order_no, customer_name, order_date, quantity, unit_price)
         on conflict (tenant_id, order_no) do nothing`,
        [tenantId, nos, customers, dates, qtys, prices]
      );

      process.stdout.write('.');
    }

    await client.query('commit');
    console.log('\n完成');

    const c = await pool.query(
      'select count(*)::int as n from orders where tenant_id = $1',
      [tenantId]
    );
    console.log('库里现在有', c.rows[0].n, '条');
  } catch (err) {
    await client.query('rollback');
    console.error('失败：', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
```

**跑：**

```text
node scripts/seed-orders.js 100000
```

**大概 10—30 秒。** 你会看到一百个点。

**自检点：查一下总数。**

**注意：100000 条 × 每条约 200 字节，才 20MB。这不算大。但导出时的内存占用不是这个数字，往下看。**

---

# 第 1 步：先写一个"正常做法"，看它怎么死（25 分钟）

## 1.1 最直觉的写法

**新建 `src/excel/writer.js`，先写这一版：**

```js
const ExcelJS = require('exceljs');

async function buildWorkbookNaive(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('订单');

  ws.columns = [
    { header: '订单号', key: 'order_no', width: 16 },
    { header: '客户名称', key: 'customer_name', width: 24 },
    { header: '下单日期', key: 'order_date', width: 14 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '单价（元）', key: 'unit_price', width: 14 },
    { header: '金额（元）', key: 'amount', width: 16 },
  ];

  for (const r of rows) {
    ws.addRow(r);
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { buildWorkbookNaive };
```

## 1.2 接一个导出接口

**新建 `src/routes/exports.js`：**

```js
const express = require('express');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const { withTenant } = require('../db/tenant-db');
const { buildWorkbookNaive } = require('../excel/writer');
const { centsToYuan } = require('../money');

const router = express.Router();
router.use(auth, tenant);

function buildContentDisposition(filename) {
  const ascii = 'export.xlsx';
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

router.get('/orders-naive', async (req, res, next) => {
  try {
    const rows = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select order_no, customer_name,
                to_char(order_date, 'YYYY-MM-DD') as order_date,
                quantity, unit_price_cents, amount_cents
         from orders
         where tenant_id = $1
         order by order_date desc, order_no`,
        [req.tenant.id]
      );
      return r.rows;
    });

    const mapped = rows.map((r) => ({
      order_no: r.order_no,
      customer_name: r.customer_name,
      order_date: r.order_date,
      quantity: r.quantity,
      unit_price: centsToYuan(r.unit_price_cents),
      amount: centsToYuan(r.amount_cents),
    }));

    const buffer = await buildWorkbookNaive(mapped);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', buildContentDisposition('订单明细.xlsx'));
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**挂到 `server.js`：**

```js
const exportRoutes = require('./routes/exports');
app.use('/api/exports', exportRoutes);
```

## 1.3 跑一次，观察内存

**开三个窗口：**

```text
窗口1：npm run dev
窗口2：性能监视器或者任务管理器，找到 node 进程
窗口3：curl 导出
```

**导出命令：**

```text
curl -o out.xlsx http://localhost:3000/api/exports/orders-naive -b cookies.txt
```

**盯着任务管理器里的 node 内存。**

**你会看到它从 50MB 一路涨到 800MB、1.2GB、1.8GB……**

**这时候会发生几件事之一：**

```text
① 涨到 2GB 左右，进程被杀，curl 报 "Empty reply from server"
② 涨到 4GB，Node 报 "JavaScript heap out of memory"
③ 你的电脑卡住了，因为它在疯狂写磁盘（swap）
```

**同时，另一个窗口请求任意接口：**

```text
curl http://localhost:3000/api/me -b cookies.txt
```

**返回 `Could not connect` 或者超时。**

**这就是最典型的"导出拖垮全站"。**

## 1.4 为什么内存涨这么多

**算一下：**

```text
10 万行 × 6 列 = 60 万个单元格
每个单元格在 exceljs 内部是一个对象，约 300—500 字节（含格式、样式、共享字符串的引用）
60 万 × 400 字节 ≈ 240MB
```

**再加上：**

```text
① 原查询结果 rows：10 万个对象，约 40MB
② mapped：又 10 万个对象，约 40MB
③ exceljs 的 workbook 模型：240MB+
④ writeBuffer 时生成的 XML 字符串 + zip 压缩缓冲：再翻一倍
```

**累计接近 800MB—1.5GB。**

**而且 `writeBuffer()` 返回的是一个完整的 `Buffer`，整个文件都在内存里。**

**客户点两次导出（或者两个人同时点），内存直接翻倍。**

---

# 第 2 步：改成流式（40 分钟）

**思路：不把整个工作簿攒在内存里，而是"写一行、吐一行"。**

**Excel 文件本质是个 zip 包，里面几个 XML。只要按顺序往 zip 里写，就不需要把全部内容攒在内存里。**

## 2.1 换用流式 API

**在 `src/excel/writer.js` 里加：**

```js
const ExcelJS = require('exceljs');
const { centsToYuan } = require('../money');

const COLUMNS = [
  { header: '订单号', key: 'order_no', width: 16 },
  { header: '客户名称', key: 'customer_name', width: 24 },
  { header: '下单日期', key: 'order_date', width: 14 },
  { header: '数量', key: 'quantity', width: 10 },
  { header: '单价（元）', key: 'unit_price', width: 14 },
  { header: '金额（元）', key: 'amount', width: 16 },
];

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.font = { bold: true, size: 11 };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F2F2' },
  };
  row.alignment = { vertical: 'middle' };
  row.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'F1' };
}

async function streamOrders(client, tenantId, outputStream, filters = {}) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: outputStream,
    useStyles: true,
    useSharedStrings: false,
  });

  workbook.creator = 'saas-lab';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('订单明细');
  ws.columns = COLUMNS;

  ws.getRow(1).values = COLUMNS.map((c) => c.header);
  styleHeader(ws);
  ws.getRow(1).commit();

  let lastDate = null;
  let lastNo = '';
  let count = 0;

  const pageSize = 2000;
  let hasMore = true;

  while (hasMore) {
    const { rows } = await client.query(
      `select order_no, customer_name,
              to_char(order_date, 'YYYY-MM-DD') as order_date,
              quantity, unit_price_cents, amount_cents
       from orders
       where tenant_id = $1
         and ($2::date is null or order_date >= $2::date)
         and ($3::date is null or order_date <= $3::date)
         and (order_date, order_no) < ($4::date, $5::text)
       order by order_date desc, order_no desc
       limit $6`,
      [
        tenantId,
        filters.from || null,
        filters.to || null,
        lastDate || new Date(Date.UTC(9999, 11, 31)),
        lastNo || '\uffff',
        pageSize,
      ]
    );

    if (rows.length === 0) {
      hasMore = false;
      break;
    }

    for (const r of rows) {
      ws.addRow({
        order_no: r.order_no,
        customer_name: r.customer_name,
        order_date: r.order_date,
        quantity: r.quantity,
        unit_price: centsToYuan(r.unit_price_cents),
        amount: centsToYuan(r.amount_cents),
      }).commit();

      lastDate = r.order_date;
      lastNo = r.order_no;
      count += 1;
    }

    if (rows.length < pageSize) {
      hasMore = false;
    }
  }

  await workbook.commit();

  return count;
}

module.exports = { buildWorkbookNaive, streamOrders, COLUMNS };
```

## 2.2 五个关键点

### `WorkbookWriter` 而不是 `Workbook`

**`ExcelJS.stream.xlsx.WorkbookWriter` 直接往一个可写流里写，不在内存里攒。**

**注意：它一旦开始写，就不能再 `addWorksheet` 加新表了。** 所有工作表要在 `commit()` 之前加完。

**这一节只导一个表，没问题。第 175 节的对账报表可能有多个表，要注意这个限制。**

### `useSharedStrings: false`

**共享字符串表是 Excel 的一个优化：相同文本只存一次，单元格存索引。**

**好处：** 文件小（重复的公司名只存一次）。
**坏处：** 必须知道全文才能写，**没法流式。**

**关掉它，文件会大一些（我们的测试数据里客户名重复 500 次，会明显变大），但能流式。**

**这个取舍要记下来：** 导出时文件体积 vs 内存占用。**客户能接受 20MB 的文件，不能接受 502。**

### `.commit()` 每行都要调

```js
ws.addRow({...}).commit();
```

**不调 `commit()`，行会留在内存里，流式就白做了。**

**这是最容易漏的一句。** 而且漏了不报错——**你会以为流式生效了，测小数据都正常，10 万行时照样崩。**

**同理，表头那一行也要 `commit()`。**

### 用游标翻页，不用 `OFFSET`

**看 `where` 里那一句：**

```sql
and (order_date, order_no) < ($4::date, $5::text)
```

**这是"键集分页"（keyset pagination）。**

**对比 `OFFSET`：**

```sql
-- ❌ 越往后越慢
select ... order by order_date desc limit 2000 offset 98000;
-- 数据库要先读出 98000 行，再丢掉
```

```sql
-- ✅ 每页都一样快
select ... where (order_date, order_no) < (...) order by ... limit 2000;
-- 直接从索引跳到那个位置
```

**10 万行用 `OFFSET`，最后一页要扫 10 万行，全部页加起来是 O(n²)。**

**用整行的复合比较 `(a, b) < (x, y)` 是 PostgreSQL 的语法糖，等价于 `a < x or (a = x and b < y)`。**

**能这么写的前提：排序键是唯一的组合。** 这里 `(order_date, order_no)` 因为 `order_no` 在租户内唯一，所以组合唯一，不会漏行。

**注意 `\uffff` 这个鬼东西。**

**第一次查询时 `lastNo` 是空的，需要给它一个"比所有字符串都大"的初值。**

**`'\uffff'` 是 Unicode 里最大的可打印字符。** 加上 `lastDate` 的 `9999-12-31`，第一页的条件是"小于 (9999-12-31, \uffff)"，也就是全部。

**这个写法有点脏，但有效。另一种写法是判断"是不是第一页"，用两个不同的 SQL。** 这里选了前者，因为只需要一条 SQL。

### 返回 `count`

**只在内存里累加一个数字，不攒行数据。**

**导出完成后可以给客户返回"共导出 100000 条"。**

---

# 第 3 步：接上流式接口（20 分钟）

**在 `src/routes/exports.js` 里加：**

```js
const { streamOrders } = require('../excel/writer');

router.get('/orders', async (req, res, next) => {
  const from = req.query.from || null;
  const to = req.query.to || null;

  const filename =
    '订单明细-' +
    new Date().toISOString().slice(0, 10) +
    (from ? '-' + from : '') +
    (to ? '-' + to : '') +
    '.xlsx';

  let client = null;

  try {
    const t = await withTenant(req.tenant.id, async (db) => {
      client = db.client;
      return true;
    });
  } catch (err) {
    return next(err);
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', buildContentDisposition(filename));
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const count = await streamOrders(client, req.tenant.id, res, { from, to });

    res.setHeader('X-Export-Rows', String(count));
  } catch (err) {
    console.error('[export] 失败：', err.message);

    if (!res.headersSent) {
      res.status(500).json({ error: '导出失败' });
    } else {
      res.end();
    }
  }
});
```

## 3.1 这段代码有问题，必须讲清

**问题在 `withTenant` 那一块。**

**`withTenant` 的语义是"一个事务，用完回滚或提交"。这里我们只想借一个 `client` 用很久（导出整个过程），不是在事务里做一件短事。**

**但它会自动 `commit` 并 `release`。什么时候？`fn` 返回的时候。**

**`fn` 返回了，`client` 就被还回池子了，后面 `streamOrders` 还在用它，就会报错。**

**正确的做法：给 `tenant-db.js` 加一个专门的方法。**

**在 `src/db/tenant-db.js` 里加：**

```js
async function borrowForTenant(tenantId, fn) {
  if (!tenantId) {
    throw new Error('borrowForTenant 需要一个租户 id');
  }

  const client = await pool.connect();

  try {
    await client.query('begin');

    await client.query("select set_config('app.tenant_id', $1, true)", [
      String(tenantId),
    ]);

    const result = await fn(client);

    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withTenant, borrowForTenant };
```

**然后接口改成：**

```js
router.get('/orders', async (req, res, next) => {
  const from = req.query.from || null;
  const to = req.query.to || null;

  const filename = /* 同上 */;

  try {
    await borrowForTenant(req.tenant.id, async (client) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', buildContentDisposition(filename));
      res.setHeader('X-Accel-Buffering', 'no');

      const count = await streamOrders(client, req.tenant.id, res, { from, to });
      res.setHeader('X-Export-Rows', String(count));
    });
  } catch (err) {
    console.error('[export] 失败：', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: '导出失败' });
    } else {
      res.end();
    }
  }
});
```

**现在 `client` 是在 `fn` 内部用的，`fn` 返回后才 `release`。顺序对了。**

## 3.2 但这样有个副作用：事务开了一整场

**导出 10 万行要 5—15 秒。这 15 秒里，事务一直开着，一个连接被占着。**

**问题：**

```text
① 并发导出 10 个人 → 占了 10 个连接 → 池子满了
② 长事务会让 PostgreSQL 的 vacuum 无法回收死行
③ 如果导出中途客户端断开，事务要等超时才回滚
```

**更好的做法：不用事务，只借连接并设上下文。**

**但 RLS 需要 `app.tenant_id`，而 `set_config(..., true)` 是事务级的。**

**解法：用会话级设置 `set_config(..., false)`，并在归还前重置。**

```js
async function borrowForTenant(tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query("select set_config('app.tenant_id', $1, false)", [String(tenantId)]);
    return await fn(client);
  } finally {
    await client.query("select set_config('app.tenant_id', '', false)").catch(() => {});
    client.release();
  }
}
```

**两个关键点：**

```text
① 第三个参数 false → 会话级
② finally 里必须重置成空串再 release
```

**第 ② 条绝对不能漏。** 忘了重置，这条连接被下一个请求拿走时，还带着上一个租户的身份——**第 165 节讲的"数据串户"事故。**

**这一节先按"会话级 + finally 重置"这个版本做。** 但你要在笔记里记下：**`borrowForTenant` 是全局最容易出事的一个函数，改动它之前先想三遍。**

## 3.3 `X-Accel-Buffering: no`

**这个响应头是给 Nginx 看的：告诉它不要缓冲这个响应，直接透传给客户端。**

**不加会怎样：** 生产环境前面有 Nginx 时，Nginx 会先攒满整个响应再发。**用户的浏览器在 15 秒内看不到任何字节，会以为卡死了。**

**本地开发（没有 Nginx）看不到这个差别，部署时才出现。**

**这个头加上没坏处。**

## 3.4 自检点：再跑一次，盯内存

```text
curl -o out.xlsx http://localhost:3000/api/exports/orders -b cookies.txt
```

**观察三件事：**

```text
① node 内存：应该稳定在 100—200MB，不随行数增长
② 文件能打开：10 万行、表头加粗、首行冻结
③ 导出过程中另一个窗口请求 /api/me：应该立刻返回
```

**第 ③ 条是关键。** 如果它卡住了，说明连接池被占满，或者 Node 的事件循环被阻塞。

**注意流式导出时 CPU 还是会有峰值**（zip 压缩要用 CPU）。**如果导出的同时其他接口变慢，那是 CPU 不够，不是内存问题。** 第 22 周（性能）会讲怎么处理。

## 3.5 对比一下两个文件大小

```text
out-naive.xlsx（如果是生成的）   vs   out.xlsx
```

**流式版本会大一些**，因为关了 `useSharedStrings`。

**大概大 20%—40%。** 10 万行、20MB 的差距，客户用微信传不了，但用企业微信/钉钉/邮件附件都能传。

**如果客户嫌大：** 让他加日期范围筛选。**这才是正解，不是去优化文件格式。**

---

# 第 4 步：中文文件名（15 分钟）

**这是导出功能里最"小"但最高频的问题。**

## 4.1 错误的写法

```js
res.setHeader('Content-Disposition', 'attachment; filename="订单明细.xlsx"');
```

**结果：**

```text
Chrome：下载得到 "download" 或者乱码
微信内置浏览器：乱码
Safari：乱码
```

**原因：** HTTP 头必须是 ASCII（ISO-8859-1）。**中文直接放进头里，有的服务器会拒绝，有的时候会被转成乱码。**

## 4.2 正确的写法（RFC 5987）

```js
function buildContentDisposition(filename) {
  const ascii = 'export.xlsx';
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
```

**两部分：**

```text
filename="export.xlsx"                 给老浏览器看的兜底（纯 ASCII，不乱码，但名字难看）
filename*=UTF-8''%E8%AE%A2%E5%8D%95...  给新浏览器看的，UTF-8 编码
```

**`filename*` 是 RFC 5987 定义的"扩展参数"，`*` 号就是标记。**

**`UTF-8''` 那部分：前面是字符集，中间是空的语言标记，后面是百分号编码的文件名。**

**两个都写，浏览器会优先用 `filename*`。**

**这个写法必须一字不差。** 少一个单引号、多一个空格，浏览器就退回用 `filename`，客户看到的是 `export.xlsx`。

## 4.3 验证

**用 curl 看响应头：**

```text
curl -I http://localhost:3000/api/exports/orders -b cookies.txt
```

**应该看到：**

```text
Content-Disposition: attachment; filename="export.xlsx"; filename*=UTF-8''%E8%AE%A2%E5%8D%95%E6%98%8E%E7%BB%86-2026-11-16.xlsx
```

**然后在浏览器里真的下一次。**

**注意：curl 的 `-o` 不看 `Content-Disposition`，它按你给的路径存。** 必须用浏览器测。

## 4.4 文件名里不能有什么

```text
/ \ : * ? " < > |      → Windows 不允许，下载会失败
换行符                 → 头注入漏洞
开头是 . 或 -          → 有些系统会当成选项
```

**写一个清理函数：**

```js
function safeFilename(name) {
  return String(name)
    .replace(/[/\\:*?"<>|\r\n]/g, '_')
    .replace(/^[.\-]+/, '')
    .slice(0, 100) || 'export.xlsx';
}
```

**换行符那一项最要紧：**

```js
// 如果 filename 里有 \r\n，攻击者可以注入任意响应头
res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
// name = 'a.xlsx\r\nSet-Cookie: admin=1'
```

**这不是理论。所有把用户输入拼进响应头的地方都要清理。**

**在这个场景里，文件名有一部分来自 `req.query.from`（日期范围）。** 客户可能传 `?from=2026-01-01\r\nX: y`。

**必须清理。**

---

# 第 5 步：大文件怎么办（20 分钟）

**10 万行流式导出没问题。100 万行呢？**

## 5.1 算一下

```text
100 万行 × 每行约 100 字节（流式写出去就丢）
= 内存不是问题

但：
① 客户下载 200MB 的文件要 5—20 分钟（看网速）
② 他的 Excel 打开 100 万行要 1—3 分钟，还可能直接崩
③ 你的连接被占用 20 分钟
```

**所以"能导"和"该导"是两件事。**

## 5.2 三个应对

**一、强制加时间范围**

```text
导出必须带 from 和 to，且跨度不超过 12 个月
```

**这是最有效的限制。** 因为客户真正需要的从来不是"全部"，是"这个月"或"这个季度"。

**二、给个上限**

```js
const MAX_ROWS = 50000;

if (count > MAX_ROWS) {
  return res.status(413).json({
    error: '数据量太大（' + count + ' 条），请缩小日期范围后重试',
    maxRows: MAX_ROWS,
    hint: '建议按季度或按月导出',
  });
}
```

**413 是 "Payload Too Large"。语义上略有偏差（它本来是给上传用的），但前端容易识别。**

**更准确的做法是 400 + 说明。**

**三、超大数据改成"异步任务 + 下载链接"**

```text
客户点导出 → 立即返回 "任务已提交，稍后邮件通知"
后台慢慢生成 → 生成完存到磁盘/对象存储
邮件里给一个下载链接（带时效）
```

**这才是正确处理超大导出的方式。第 16 周（异步与队列）已经学过队列，这里可以直接用。**

**这一节不做，但你要知道"同步导出"有天花板。**

## 5.3 这一节要实现的版本

```js
router.get('/orders', async (req, res, next) => {
  const from = req.query.from || null;
  const to = req.query.to || null;

  const MAX_ROWS = 50000;

  try {
    const count = await withTenant(req.tenant.id, async (db) => {
      const r = await db.client.query(
        `select count(*)::int as n from orders
         where tenant_id = $1
           and ($2::date is null or order_date >= $2::date)
           and ($3::date is null or order_date <= $3::date)`,
        [req.tenant.id, from, to]
      );
      return r.rows[0].n;
    });

    if (count === 0) {
      return res.status(404).json({ error: '这个范围内没有数据' });
    }

    if (count > MAX_ROWS) {
      return res.status(400).json({
        error: `数据量 ${count} 条，超过单次导出上限 ${MAX_ROWS} 条`,
        hint: '请按季度或按月分开导出',
        count,
        maxRows: MAX_ROWS,
      });
    }

    const filename = safeFilename(
      '订单明细-' + new Date().toISOString().slice(0, 10) +
      (from ? '-从' + from : '') + (to ? '-到' + to : '') + '.xlsx'
    );

    await borrowForTenant(req.tenant.id, async (client) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', buildContentDisposition(filename));
      res.setHeader('X-Accel-Buffering', 'no');

      await streamOrders(client, req.tenant.id, res, { from, to });
    });
  } catch (err) {
    console.error('[export]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: '导出失败' });
    } else {
      res.end();
    }
  }
});
```

**注意 `count === 0` 返回 404 这个细节。**

**客户点了导出，得到 0 行数据，下载一个只有表头的文件——他会不会以为出了问题？**

**当然会。** 明确告诉他"这个范围没有数据"更友好。

**但反过来：如果客户就是要个空模板呢？**

**这时候该给另一个接口 `/api/exports/orders-template`，返回只有表头的文件。**

**两个需求，两个接口。不要用一个接口猜客户想要什么。**

---

# 第 6 步：故意制造一次写入失败（15 分钟）

**流式导出有个隐藏问题：** 一旦开始往 `res` 写，**HTTP 头就已经发出去了，不能再改状态码。**

## 6.1 制造失败

**在 `streamOrders` 里临时加一行，让第 5001 行抛错：**

```js
if (count === 5000) {
  throw new Error('故意炸的');
}
```

**然后导出 10000 行（先跑 `node scripts/seed-orders.js 10000`）。**

**你会看到：**

```text
curl: (18) transfer closed with outstanding read data remaining
```

**而且 `out.xlsx` 是个损坏的文件（打不开）。**

**服务端日志：**

```text
[export] 失败：故意炸的
```

**关键问题：客户拿到一个下载了一半的坏文件，而且不知道发生了什么。**

## 6.2 怎么改进

**方案一：先写到一个临时文件，写完再流给客户端。**

```js
const tmp = path.join(uploadDir, 'export-' + randomUUID() + '.xlsx');
const ws = fs.createWriteStream(tmp);
await streamOrders(client, tenantId, ws, filters);
// 写完了，才发头
res.setHeader(...);
fs.createReadStream(tmp).pipe(res).on('finish', () => fs.unlink(tmp, () => {}));
```

**优点：** 失败时能给正确的 500，客户不会拿到坏文件。
**缺点：** 磁盘要能放下整个文件（几分之一秒的延迟）。

**这是更稳的做法。** 10 万行的文件大概 10—20MB，磁盘上放一下毫无压力。

**方案二：先发一个很小的"占位"响应，用前端轮询真实状态。**

**太复杂。** 一条导出不值得。

**方案三：接受它，但至少把错误记下来。**

**这是最小做法：`res.end()` 让客户端尽快失败，日志里记清。客户重新点一次。**

## 6.3 这一节选方案一

**改成写临时文件：**

```js
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const tmpDir = path.join(__dirname, '..', '..', 'uploads', 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

async function exportToFile(client, tenantId, filters) {
  const tmpPath = path.join(tmpDir, randomUUID() + '.xlsx');
  const ws = fs.createWriteStream(tmpPath);

  try {
    const count = await streamOrders(client, tenantId, ws, filters);
    await new Promise((resolve, reject) => {
      ws.on('finish', resolve);
      ws.on('error', reject);
      ws.end();
    });
    return { tmpPath, count };
  } catch (err) {
    ws.destroy();
    fs.promises.unlink(tmpPath).catch(() => {});
    throw err;
  }
}
```

**然后接口：**

```js
await borrowForTenant(req.tenant.id, async (client) => {
  const { tmpPath, count } = await exportToFile(client, req.tenant.id, { from, to });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', buildContentDisposition(filename));
  res.setHeader('Content-Length', String(fs.statSync(tmpPath).size));

  const rs = fs.createReadStream(tmpPath);
  rs.pipe(res);
  rs.on('close', () => fs.promises.unlink(tmpPath).catch(() => {}));
  rs.on('error', () => {
    fs.promises.unlink(tmpPath).catch(() => {});
    res.end();
  });
});
```

## 6.4 三个要点

### `Content-Length` 现在能给了

**流式直接写 `res` 的时候，不知道总长度，只能靠 `Transfer-Encoding: chunked`。**

**有了临时文件，`statSync().size` 就是准确的长度。**

**好处：** 浏览器能显示下载进度条和预计剩余时间。**客户看到"还剩 30 秒"和看到"一直转圈"是完全不同的体验。**

### `close` 和 `finish` 的区别

```text
finish  → 数据写完了
close   → 底层的流真的关了
```

**清理临时文件要挂在 `close` 上。** 挂 `finish` 有时候文件还在被读。

**而且 `close` 和 `error` 都要清理，两个都挂。** 漏一个就是磁盘上留一堆垃圾。

### 临时文件目录要能自动清理

**客户下载到一半关掉浏览器，`close` 会触发，文件会被删。**

**但如果进程崩了呢？文件留在那里。**

**加一个启动时的清理：**

```js
fs.readdirSync(tmpDir).forEach((f) => {
  const p = path.join(tmpDir, f);
  const age = Date.now() - fs.statSync(p).mtimeMs;
  if (age > 24 * 3600 * 1000) fs.unlink(p, () => {});
});
```

**放 `server.js` 启动时跑一次。** 超过 24 小时的临时文件，肯定是没人要了。

## 6.5 自检点

**再故意炸一次（第 5001 行抛错）：**

```text
curl: 得到 500 和 JSON 错误
out.xlsx: 不存在，或者是个空文件
uploads/tmp/: 空的
```

**这次客户全程都知道发生了什么。**

---

# 第 7 步：最终验收

## A. 数据

- [ ] 库里有 10 万条订单（`seed-orders.js` 跑过）
- [ ] 我知道 10 万行的文件大概多大

## B. 对比实验

- [ ] 我用 `orders-naive` 导出过，看到内存涨到 1GB+
- [ ] 导出期间另一个接口超时
- [ ] 换成流式后内存稳定在 200MB 以内
- [ ] 导出期间另一个接口正常返回

## C. 流式实现

- [ ] 用的是 `ExcelJS.stream.xlsx.WorkbookWriter`
- [ ] 每行都 `.commit()`
- [ ] 表头那行也 `.commit()`
- [ ] `useSharedStrings: false`
- [ ] 用键集分页，不是 `OFFSET`

## D. 连接

- [ ] `borrowForTenant` 的 `finally` 里重置了 `app.tenant_id`
- [ ] 我知道如果忘了重置会出什么事故
- [ ] 导出期间 RLS 正常（导出的只有自己租户的数据）

## E. 文件名

- [ ] `Content-Disposition` 里有 `filename*=UTF-8''`
- [ ] 在浏览器里下了，中文名正常
- [ ] `safeFilename` 清掉了危险字符
- [ ] 我知道换行符能造成头注入

## F. 失败处理

- [ ] 写临时文件，不是直接写 `res`
- [ ] 有 `Content-Length`，浏览器能显示进度
- [ ] 失败时返回正确的 500
- [ ] 临时文件被清理了

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了"同步导出的上限"和"超大文件该怎么做"

## 提交

```text
git add -A
git commit -m "第171节课: 流式导出 + 键集分页 + 中文文件名 + 临时文件"
git push
```

---

# 附：常见问题速查

| 报错 / 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| `JavaScript heap out of memory` | 用了 `Workbook` 不是 `WorkbookWriter` | 换成流式 |
| 内存不降 | `addRow` 后面没 `commit()` | 每行都 commit |
| 文件下载下来打不开 | 写 `res` 中途出错，客户端拿到半个 zip | 改成写临时文件再 pipe |
| 中文文件名变 `export.xlsx` | 只写了 `filename`，没写 `filename*` | 两个都写 |
| 中文文件名乱码 | 用了 `filename` 塞中文 | `encodeURIComponent` + `filename*` |
| `Cannot set headers after they are sent` | 已经开始写 `res` 了还想 `setHeader` | 头要在第一次写之前设完 |
| 导出卡在最后一页 | `OFFSET` 分页，越翻越慢 | 改成键集分页 |
| 导出漏行 | 键集分页的排序键组合不唯一 | 排序键必须能唯一确定一行 |
| 导出到一半连接断了 | 客户端超时 / 网络问题 | 加 `X-Accel-Buffering: no`，或改用异步任务 |
| 导出期间所有接口都慢 | CPU 被 zip 压缩占满 | 限制并发导出数，或者挪到后台任务 |
| `uploads/tmp` 越来越大 | 临时文件没清理 | `close` 和 `error` 都要 unlink，加启动清理 |
| 客户说"导出的数和我看到的不一致" | 权限或筛选条件不同 | 导出和列表用同一个查询函数 |

---

## 本节课要能说出口的一句话

> **导出不是"查出来拼成 Excel"，是"一边查一边写出去"；只要把整个结果集攒在内存里，行数一多就会把整站拖死，而客户只会说"你们网站很卡"。**
