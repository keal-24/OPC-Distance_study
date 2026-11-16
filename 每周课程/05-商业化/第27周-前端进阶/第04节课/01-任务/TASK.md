# 第 186 节课：填完才说错

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 上一节让客户知道"系统在干什么"。这一节让客户知道"**我填错了什么**"。
> 表单是客户跟你交互最密集的地方，**也是客户脾气最差的地方**——他已经决定要用了，你却在最后一步折磨他。

**建议用时**：160 分钟（6 个步骤，含动手敲代码的时间）
**时间怎么排**：一次做不完是正常的。建议分两次：第 0—2 步（95 分钟）一次，第 3—5 步（65 分钟）一次。每个步骤标题后面的括号就是该步的分钟数。
**你需要先完成**：第 185 节（四态跑通，按钮加载态和就近报错能用）

---

# 第 0 步：一次真实的填表过程（15 分钟）

## 0.1 客户填了 12 个字段

```text
① 客户填完 12 个字段
② 点"提交"
③ 页面顶部出现一条红字（他没看见，因为他在看按钮）
④ 或者更糟：按钮变回原样，什么都没发生
⑤ 他再点一次
⑥ 这次看到"请检查表单"（还是不知道该改哪）
⑦ 他往下翻，看到第 3 个字段下面有一行小红字"格式错误"
⑧ 改完，再提交
⑨ "第 7 个字段也不能为空"
⑩ 他又改……
```

**三轮之后，他会关掉页面，或者打电话骂人。**

## 0.2 五个让人放弃的细节

| # | 做法 | 客户的感受 |
|---|---|---|
| 1 | 只在提交时校验 | "为什么我填的时候就不知道" |
| 2 | 错误提示在页面顶部 | "改哪个？" |
| 3 | 提示写"格式不正确" | "什么格式？" |
| 4 | 改完错误提示不消失 | "改了还是错？" |
| 5 | 键盘弹起来挡住输入框 | "看不见我在打什么" |

**这五条，改起来都不难。但每一条都真实地让客户流失。**

## 0.3 这一节要建的四样东西

```text
① 一个校验器（规则写在一处，不散在 HTML 里）
② 时机：什么时候校验，什么时候不校验
③ 提示语：每条都告诉客户"怎么改"
④ 键盘：输入框聚焦时，滚动到可见区域
```

---

# 第 1 步：把校验规则写在一处（40 分钟）

**不要在每个页面的 `submit` 事件里写一堆 `if`。**

## 1.1 新建 `public/js/validate.js`

```js
(function () {
  const RULES = {
    required: (value) => {
      if (value == null) return '请填写这一项';
      if (String(value).trim() === '') return '请填写这一项';
      return null;
    },

    email: (value) => {
      if (!value) return '请填写邮箱';
      const s = String(value).trim();
      if (!s.includes('@')) return '邮箱要包含 @';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '邮箱格式像这样：name@company.com';
      if (s.length > 254) return '邮箱太长了';
      return null;
    },

    mobile: (value) => {
      if (!value) return '请填写手机号';
      const s = String(value).replace(/[\s-]/g, '');
      if (!/^1[3-9]\d{9}$/.test(s)) return '请填写 11 位手机号，以 1 开头';
      return null;
    },

    password: (value) => {
      if (!value) return '请填写密码';
      const s = String(value);
      if (s.length < 8) return '密码至少 8 位，现在还差 ' + (8 - s.length) + ' 位';
      if (s.length > 72) return '密码不要超过 72 位';
      if (!/[a-zA-Z]/.test(s)) return '密码里要有至少一个字母';
      if (!/\d/.test(s)) return '密码里要有至少一个数字';
      return null;
    },

    minLength: (n) => (value) => {
      if (!value) return null;
      const len = String(value).trim().length;
      if (len < n) return '至少要 ' + n + ' 个字，现在 ' + len + ' 个';
      return null;
    },

    maxLength: (n) => (value) => {
      if (!value) return null;
      const len = String(value).trim().length;
      if (len > n) return '最多 ' + n + ' 个字，现在 ' + len + ' 个，超了 ' + (len - n);
      return null;
    },

    positiveInt: (value) => {
      if (!value) return '请填写数量';
      const s = String(value).trim();
      if (!/^\d+$/.test(s)) return '只能填数字，不能有小数或符号';
      if (Number(s) < 1) return '数量至少是 1';
      return null;
    },

    money: (value) => {
      if (!value) return '请填写金额';
      const s = String(value).trim().replace(/[,¥￥\s]/g, '');
      if (!/^\d+(\.\d{1,2})?$/.test(s)) return '金额最多两位小数，比如 1299 或 1299.50';
      if (Number(s) <= 0) return '金额必须大于 0';
      return null;
    },

    date: (value) => {
      if (!value) return '请选择日期';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '日期看不懂，格式像这样：2026-11-05';
      return null;
    },

    sameAs: (getOther, otherLabel) => (value) => {
      if (value !== getOther()) return '两次输入不一致，请检查' + (otherLabel || '');
      return null;
    },
  };

  function validateField(value, ruleList) {
    for (const rule of ruleList) {
      const msg = rule(value);
      if (msg) return msg;
    }
    return null;
  }

  function createForm(schema) {
    const fields = schema.fields || {};
    const state = { values: {}, errors: {}, touched: {}, submitted: false };

    function get(name) {
      return state.values[name];
    }

    function set(name, value) {
      state.values[name] = value;

      if (state.touched[name] || state.submitted) {
        revalidate(name);
      }
    }

    function markTouched(name) {
      state.touched[name] = true;
      revalidate(name);
    }

    function revalidate(name) {
      const def = fields[name];
      if (!def) return;

      const error = validateField(state.values[name], def.rules || []);
      state.errors[name] = error;
      renderError(name, error);
      return error;
    }

    function validateAll() {
      let firstInvalid = null;

      for (const name of Object.keys(fields)) {
        const error = revalidate(name);
        if (error && !firstInvalid) firstInvalid = name;
      }

      return firstInvalid;
    }

    function renderError(name, error) {
      const fieldEl = document.querySelector('[data-field="' + name + '"]');
      if (!fieldEl) return;

      const input = fieldEl.querySelector('.input');
      const errEl = fieldEl.querySelector('[data-error-for="' + name + '"]');

      if (error) {
        fieldEl.classList.add('field--invalid');
        if (input) {
          input.classList.add('input--error');
          input.setAttribute('aria-invalid', 'true');
          input.setAttribute('aria-describedby', name + '-error');
        }
        if (errEl) {
          errEl.textContent = error;
          errEl.id = name + '-error';
        }
      } else {
        fieldEl.classList.remove('field--invalid');
        if (input) {
          input.classList.remove('input--error');
          input.removeAttribute('aria-invalid');
          input.removeAttribute('aria-describedby');
        }
        if (errEl) errEl.textContent = '';
      }
    }

    function bind(root) {
      const scope = root || document;

      scope.querySelectorAll('[data-field]').forEach((fieldEl) => {
        const name = fieldEl.dataset.field;
        const input = fieldEl.querySelector('.input');
        if (!input) return;

        if (state.values[name] === undefined) {
          state.values[name] = input.value;
        }

        input.addEventListener('input', () => {
          state.values[name] = input.value;

          if (state.errors[name]) {
            revalidate(name);
          }
        });

        input.addEventListener('blur', () => {
          markTouched(name);
        });
      });
    }

    async function submit(onSubmit) {
      state.submitted = true;

      const firstInvalid = validateAll();

      if (firstInvalid) {
        focusField(firstInvalid);
        return { ok: false, firstInvalid };
      }

      try {
        const result = await onSubmit({ ...state.values });
        return { ok: true, result };
      } catch (err) {
        if (err.fieldErrors && typeof err.fieldErrors === 'object') {
          let first = null;
          for (const [name, msg] of Object.entries(err.fieldErrors)) {
            state.errors[name] = msg;
            renderError(name, msg);
            if (!first) first = name;
          }
          if (first) focusField(first);
          return { ok: false, serverError: err, firstInvalid: first };
        }

        throw err;
      }
    }

    function focusField(name) {
      const fieldEl = document.querySelector('[data-field="' + name + '"]');
      if (!fieldEl) return;

      const input = fieldEl.querySelector('.input');

      fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (input) {
        setTimeout(() => {
          input.focus({ preventScroll: true });
        }, 300);
      }
    }

    return { bind, set, get, submit, validateAll, state };
  }

  window.Validate = { RULES, createForm, validateField };
})();
```

## 1.2 六个设计决定

### 规则是函数，不是正则

```js
mobile: (value) => {
  if (!value) return '请填写手机号';
  const s = String(value).replace(/[\s-]/g, '');
  if (!/^1[3-9]\d{9}$/.test(s)) return '请填写 11 位手机号，以 1 开头';
  return null;
}
```

**为什么不是 `{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }`：**

```text
① 函数能先做 normalize（去掉空格和横杠）
② 函数能分多个错误分支，给不同的提示
③ 函数能计算（"还差 2 位"）
```

**最后一条最有价值：**

```js
if (s.length < 8) return '密码至少 8 位，现在还差 ' + (8 - s.length) + ' 位';
```

**"还差 2 位"比"密码太短"有用一百倍。** **客户看到就知道该怎么做。**

### 每条提示都写"怎么改"

**对比：**

```text
❌ '手机号格式不正确'
✅ '请填写 11 位手机号，以 1 开头'

❌ '密码太弱'
✅ '密码里要有至少一个字母'

❌ '金额无效'
✅ '金额最多两位小数，比如 1299 或 1299.50'

❌ '日期格式错误'
✅ '日期看不懂，格式像这样：2026-11-05'
```

**判断标准：客户看完这句话，知道下一步做什么吗？**

**不知道就重写。**

### `touched` 和 `submitted` 控制校验时机

**这是这一节最重要的机制。**

```js
input.addEventListener('input', () => {
  state.values[name] = input.value;
  if (state.errors[name]) revalidate(name);   // 只有"已经有错"才实时校验
});

input.addEventListener('blur', () => {
  markTouched(name);                          // 离开时才校验
});
```

**为什么不在每次 `input` 时校验：**

**客户刚输入 `1`，你立刻说"请填写 11 位手机号"——** **他会觉得你在骂他。**

**正确的时机：**

```text
输入中     → 只有"已经有错"才重新校验（让错误能及时消失）
离开输入框 → 校验（blur）
已提交过   → 每次输入都校验（因为客户在改错）
```

**这三条，覆盖了客户实际的操作节奏。**

### 有错时实时校验，让错误"消失得及时"

**看这句：**

```js
if (state.errors[name]) revalidate(name);
```

**客户把手机号补到第 10 位时，红字还在；补到 11 位，红字立刻消失。**

**这个"红字消失"的反馈极其重要——** **它告诉客户"你改对了"，不用再提交一次确认。**

**没有这个，客户改完不敢确定，会反复提交。**

### 提交失败后自动滚到第一个错误并聚焦

```js
function focusField(name) {
  fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => input.focus({ preventScroll: true }), 300);
}
```

**三个细节：**

```text
① scrollIntoView 的 block 用 'center'  → 让字段在屏幕中间，不被键盘挡
② 延迟 300ms 再 focus               → 等滚动动画结束，否则会跳回去
③ focus 用 preventScroll: true       → 否则浏览器会自己再滚一次，位置会乱
```

**第 ③ 条最关键。** **不加 `preventScroll`，浏览器会在聚焦时自动滚动，把你辛苦算好的位置打乱。**

**`block: 'center'` 也很重要：** **`'start'` 会让字段贴着屏幕顶部，如果页面有固定头部，会挡住它。**

### `fieldErrors` 从服务端回来

```js
if (err.fieldErrors && typeof err.fieldErrors === 'object') { ... }
```

**为什么服务端要返回字段级的错误：**

**有些校验只有服务端能做：**

```text
订单号重复（要查数据库）
邮箱已被注册
该时段已被预约
```

**前端校验是"体验"，后端校验是"正确性"。两个都要有。**

**服务端返回这种结构：**

```json
{
  "error": "有 2 个字段需要修改",
  "fieldErrors": {
    "order_no": "这个订单号已经存在",
    "email": "这个邮箱已经注册过了"
  }
}
```

**前端直接用 `renderError` 渲染到对应字段。**

### `aria-invalid` 和 `aria-describedby`

```js
input.setAttribute('aria-invalid', 'true');
input.setAttribute('aria-describedby', name + '-error');
```

**这两个属性是给屏幕阅读器用的。**

**视障客户用读屏软件时，会听到"邮箱，无效，请填写 11 位手机号"。**

**不加的话，他只知道"有个输入框"，不知道有错。**

**这两行成本是零，收益是"你的产品对所有人可用"。**

**而且它也是无障碍合规检查的必查项。**

## 1.3 自检点

**在控制台里试所有规则：**

```js
const R = Validate.RULES;

console.log(R.mobile('13812345678'));    // null
console.log(R.mobile('1381234567'));     // '请填写 11 位手机号，以 1 开头'
console.log(R.mobile('23812345678'));    // 同上
console.log(R.mobile('138-1234-5678'));  // null（横杠被清理）

console.log(R.password('abc'));          // '密码至少 8 位，现在还差 5 位'
console.log(R.password('abcdefgh'));     // '密码里要有至少一个数字'
console.log(R.password('abcdefg1'));     // null

console.log(R.money('1299'));            // null
console.log(R.money('1299.5'));          // null
console.log(R.money('1299.567'));        // '金额最多两位小数...'
console.log(R.money('0'));               // '金额必须大于 0'

console.log(R.email('a@b'));             // '邮箱格式像这样：name@company.com'
console.log(R.email('a@b.com'));         // null
```

**每条都要给不同的、具体的提示。**

---

# 第 2 步：做一个真实的表单（40 分钟）

## 2.1 用组件 + 校验器做"新建订单"

**新建 `public/js/pages/order-new.js`：**

```js
(function () {
  const { Field, Button, money } = window.UI;
  const { createForm } = window.Validate;

  const form = createForm({
    fields: {
      customer_name: { rules: [Validate.RULES.required, Validate.RULES.minLength(2), Validate.RULES.maxLength(100)] },
      quantity: { rules: [Validate.RULES.positiveInt] },
      unit_price: { rules: [Validate.RULES.money] },
      order_date: { rules: [Validate.RULES.date] },
      note: { rules: [Validate.RULES.maxLength(500)] },
    },
  });

  function render() {
    return `
      <form id="order-form" novalidate>
        ${Field({
          name: 'customer_name',
          label: '客户名称',
          required: true,
          placeholder: '比如：杭州甲乙公司',
          hint: '填全称，方便以后对账',
        })}

        ${Field({
          name: 'quantity',
          label: '数量',
          required: true,
          inputmode: 'numeric',
          placeholder: '1',
          hint: '整数，1 以上',
        })}

        ${Field({
          name: 'unit_price',
          label: '单价（元）',
          required: true,
          inputmode: 'decimal',
          placeholder: '1299.00',
          hint: '最多两位小数',
        })}

        ${Field({
          name: 'order_date',
          label: '下单日期',
          required: true,
          type: 'date',
        })}

        ${Field({
          name: 'note',
          label: '备注',
          type: 'textarea',
          maxlength: '500',
          placeholder: '选填，最多 500 字',
        })}

        <div class="action-host">
          ${Button({ label: '保存', variant: 'primary', block: true, type: 'submit' })}
        </div>
      </form>

      <div id="preview" class="card" style="margin-top:16px">
        <div class="list__meta">总金额会在填完后显示</div>
      </div>
    `;
  }

  function bind(root) {
    form.bind(root);

    const formEl = document.getElementById('order-form');

    formEl.addEventListener('input', updatePreview);
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSubmit(e.currentTarget);
    });

    updatePreview();
  }

  function updatePreview() {
    const qty = Number(form.get('quantity') || 0);
    const price = String(form.get('unit_price') || '').replace(/[,¥￥\s]/g, '');
    const cents = Math.round(Number(price) * 100) || 0;
    const box = document.getElementById('preview');
    if (!box) return;

    if (!qty || !cents) {
      box.innerHTML = '<div class="list__meta">总金额会在填完后显示</div>';
      return;
    }

    box.innerHTML = `
      <div class="row row--between">
        <span class="list__meta">总金额</span>
        <span class="list__amount">${money(qty * cents)}</span>
      </div>
    `;
  }

  async function handleSubmit(el) {
    const btn = el.querySelector('button[type="submit"]');

    const result = await window.Action.run(
      btn,
      async () => {
        const outcome = await form.submit(async (values) => {
          const priceCents = Math.round(
            Number(String(values.unit_price).replace(/[,¥￥\s]/g, '')) * 100
          );

          return window.API.post('/api/orders', {
            customerName: values.customer_name,
            quantity: Number(values.quantity),
            unitPriceCents: priceCents,
            orderDate: values.order_date,
            note: values.note || null,
          });
        });

        if (!outcome.ok) {
          const err = new Error('请检查标红的字段');
          err.fieldErrors = form.state.errors;
          throw err;
        }

        return outcome.result;
      },
      { successMessage: '订单已创建' }
    );

    if (result.ok) {
      setTimeout(() => {
        window.location.href = '/orders.html';
      }, 600);
    }
  }

  const main = document.getElementById('main');
  main.innerHTML = render();
  bind(main);
})();
```

## 2.2 四个体验细节

### `novalidate` 关掉浏览器自带的校验

```html
<form id="order-form" novalidate>
```

**为什么：**

**浏览器的气泡提示是这样的：**

```text
"请填写此字段"
```

**它不会说"客户名称至少 2 个字"，也不会在你离开输入框时消失。**

**而且它的样式在每个浏览器都不一样，你没法改。**

**关掉它，用自己的提示。**

**但输入框的 `type="email"` / `type="date"` 还是要保留——** **因为它们能唤起正确的手机键盘。**

### `inputmode` 控制手机键盘

```html
<input inputmode="numeric">   <!-- 数字键盘 -->
<input inputmode="decimal">   <!-- 带小数点的数字键盘 -->
<input inputmode="tel">       <!-- 电话键盘 -->
<input inputmode="email">     <!-- 带 @ 的键盘 -->
```

**手机上，`inputmode` 决定弹出哪个键盘。**

**不写的话，客户在"数量"里要切换到数字键盘——** **多一次操作，多一次放弃的机会。**

**注意：`type="number"` 也能唤起数字键盘，但它有两个问题：**

```text
① 有上下箭头按钮（占地方）
② 允许输入 e / + / -（非法字符）
```

**所以用 `type="text"` + `inputmode="numeric"`。**

**这个组合是移动端表单的标准做法。**

### 实时预览总金额

**这段代码在 `order-new.js` 里已经有了（578—596 行）。这里拆开讲清楚：**

```js
function updatePreview() {
  const qty = Number(form.get('quantity') || 0);
  const price = String(form.get('unit_price') || '').replace(/[,¥￥\s]/g, '');
  const cents = Math.round(Number(price) * 100) || 0;
  const box = document.getElementById('preview');
  if (!box) return;

  if (!qty || !cents) {
    box.innerHTML = '<div class="list__meta">总金额会在填完后显示</div>';
    return;
  }

  box.innerHTML = `
    <div class="row row--between">
      <span class="list__meta">总金额</span>
      <span class="list__amount">${money(qty * cents)}</span>
    </div>
  `;
}
```

**三处要注意：**

```text
① .replace(/[,¥￥\s]/g, '')   客户会粘贴"¥1,299.00"，先把符号和空格去掉
② Math.round(x * 100)        999.99 * 100 在浮点数里是 99998.99999，不 round 会少 1 分
③ if (!box) return;          预览框可能不在当前页面（比如复用了这个 js），先判空
```

**第 ② 条是这一节唯一一个"不算就出错"的地方。**

```js
999.99 * 100            // 99998.99999999999
Math.trunc(999.99*100)  // 99998  ← 少一分，客户会投诉
Math.round(999.99*100)  // 99999  ← 对
```

**客户填了数量和单价，立刻看到"总金额 ¥3,897.00"。**

**这个反馈的价值：**

```text
① 客户能立刻发现"数量填错了"（比如多打一个 0）
② 客户能确认"单价是对的"
③ 减少"提交后发现错了"的挫败
```

**这一个小组件，能显著降低表单的放弃率。**

**注意 `Math.round(Number(price) * 100)`——** **这里用了 `Math.round`，因为预览只是"看看"，不追求精确。**

**真正提交时，后端会用第 172 节的 `toCents` 做严格解析。**

### 提交成功后 600ms 才跳转

```js
setTimeout(() => { window.location.href = '/orders.html'; }, 600);
```

**为什么不等 0ms：**

**因为 toast"订单已创建"需要时间被看见。**

**立刻跳转的话，客户看到的是"页面闪了一下"，不知道成功了没有。**

**600ms 是经验值：足够看到 toast，又不会觉得慢。**

---

# 第 3 步：键盘遮挡（25 分钟）

**这是移动端表单最容易忽略的问题。**

## 3.1 现象

```text
客户点最下面那个输入框
键盘弹起来，占了下半屏
输入框被键盘挡住了
客户看不见自己在打什么
```

**更糟的情况：**

```text
输入框在键盘下方，客户完全看不到光标
但他还在打字
打完抬头看，发现打错了
```

## 3.2 解法一：`scroll-margin-bottom`

**最简单，一行 CSS：**

```css
.input,
textarea.input {
  scroll-margin-bottom: 120px;
}
```

**含义：当浏览器"滚动到可见"时，在元素下方留 120px 空间。**

**这个空间就是给键盘预留的。**

**为什么是 120px：** **手机键盘通常占屏幕高度的 40%—50%，在 667px 高的屏幕上约 300px。**

**但 `scrollIntoView` 的 `block: 'center'` 会把元素放在中间，** **120px 的余量足够。**

## 3.3 解法二：聚焦时主动滚动

**在 `validate.js` 的 `focusField` 里已经做了 `scrollIntoView`。**

**但对"客户自己点的输入框"（不是校验聚焦），也要处理：**

```js
document.addEventListener('focusin', (e) => {
  const el = e.target;

  if (!el.matches('input, textarea, select')) return;

  const rect = el.getBoundingClientRect();
  const viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  const keyboardTop = viewportH - 60;

  if (rect.bottom > keyboardTop) {
    window.scrollBy({
      top: rect.bottom - keyboardTop + 40,
      behavior: 'smooth',
    });
  }
});
```

**`window.visualViewport` 是关键。**

**`window.innerHeight` 在键盘弹起时不会变（iOS Safari 除外），** **而 `visualViewport.height` 会变小。**

**这就是"键盘是否弹起"的判断依据。**

## 3.4 自检点

**用真手机（或者 Chrome 的设备模拟 + 虚拟键盘）测：**

```text
① 点最下面的"备注"输入框
② 键盘弹起
③ 输入框应该滚到键盘上方，能看见
④ 打几个字，确认看得见光标
```

**如果被挡住，先检查有没有 `scroll-margin-bottom`。**

**然后检查 `focusin` 的监听有没有生效（在控制台里打一行日志）。**

---

# 第 4 步：把错误"翻译"给人（20 分钟）

**后端返回的错误，经常是技术语言。**

## 4.1 一个真实的映射表

**新建 `public/js/errors.js`：**

```js
(function () {
  const MESSAGES = {
    'duplicate key value violates unique constraint "orders_tenant_id_order_no_key"':
      '这个订单号已经存在了，换一个或者检查是不是重复导入',

    'violates check constraint "orders_money_check"':
      '金额计算不对，请检查数量和单价',

    'null value in column "customer_name"':
      '客户名称不能为空',

    ENOENT: '文件没找到，可能已经被删除了',

    ECONNREFUSED: '连不上服务器，可能是服务在重启',
  };

  function friendly(err) {
    if (!err) return '未知错误';

    const raw = String(err.message || err);

    for (const [pattern, msg] of Object.entries(MESSAGES)) {
      if (raw.includes(pattern)) return msg;
    }

    if (err.status === 409) return '这个操作和现有数据冲突了，刷新一下再试';
    if (err.status === 413) return '文件太大了，请压缩或者分批上传';
    if (err.status === 429) return '操作太频繁，等几秒再试';
    if (err.status >= 500) return '服务器出了点问题，稍后再试';

    if (raw.length > 120) {
      return '操作失败，详细信息可以联系技术支持';
    }

    return raw;
  }

  window.FriendlyError = { friendly, MESSAGES };
})();
```

## 4.2 三个设计点

### 用 `includes` 匹配片段，不用完全相等

**数据库的错误消息会带表名、列名、约束名。**

**完全相等匹配不上，`includes` 能匹配上关键片段。**

**注意顺序：** **对象里的键按插入顺序遍历，** **所以把具体的（约束名）放在前面，泛化的（状态码）放在后面。**

### 超过 120 字符的错误不直接显示

```js
if (raw.length > 120) {
  return '操作失败，详细信息可以联系技术支持';
}
```

**为什么：**

**数据库的完整错误可能有两百字，包含表结构、SQL 片段。**

**客户看到这个会害怕（"是不是把我数据搞坏了"），而且完全看不懂。**

**给一句"操作失败"，把详细信息写进日志。**

**这是"给客户看的话"和"给你看的话"的分界线。**

### 但日志里要有原文

**`friendly()` 只管显示。** **原始错误要在 `api.js` 里 `console.error` 一次。**

**找到 `public/js/api.js` 里 `if (!res.ok) {` 那一段，在最前面加一行：**

```js
    if (!res.ok) {
      console.error('[api]', path, res.status, body);   // ← 加这一行
      const message =
        (body && body.error) ||
        (res.status === 401 ? '登录已过期，请重新登录' : `请求失败（${res.status}）`);
```

**不要只写 `console.error(err)` 就完了。** **把 `path`、`res.status`、`body` 三个分开写，控制台里才是这个样子的：**

```text
[api] /api/orders 409 {error: "这个订单号已经存在", code: "DUPLICATE_ORDER_NO"}
```

**而不是：**

```text
Error: 这个订单号已经存在
    at request (api.js:38)
```

**第一行能让你三秒内知道"哪个接口、什么状态码、后端的原始回复"。** **第二行你得自己猜。**

**不加的话，客户说"出错了"，你在控制台里什么都看不到。**

---

# 第 5 步：故意做错三次（20 分钟）

## 5.1 错误一：只在提交时校验

**把 `input` 和 `blur` 的监听删掉，只留 `submit` 里的 `validateAll`。**

**填 12 个字段，故意让第 3 个填错。**

**提交，你会看到：**

```text
页面滚到第 3 个字段，红字出现
```

**然后改对，再提交：**

```text
页面滚到第 7 个字段，又一个红字
```

**两轮。**

**改回来。**

**真实客户遇到两轮就会骂人。**

## 5.2 错误二：错误提示写"格式不正确"

**把 `email` 的提示改成：**

```js
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '邮箱格式不正确';
```

**问自己：客户看完这句话，知道该怎么改吗？**

```text
"格式不正确" → 我知道不对，但什么才是对的？
"邮箱格式像这样：name@company.com" → 哦，我漏了 @ 后面
```

**改回来。**

## 5.3 错误三：错误不消失

**把 `input` 事件里那句删掉：**

```js
if (state.errors[name]) revalidate(name);
```

**然后故意填错，改对。**

**红字还在。**

**客户会以为"改了还是错"，然后放弃。**

**改回来。**

---

# 第 6 步：最终验收

## A. 校验器

- [ ] 规则是函数，能先 normalize
- [ ] 每条提示都说"怎么改"
- [ ] 有 `minLength` / `maxLength` 的规则会显示"现在几个字"
- [ ] 手机号、密码、金额都试过边界值

## B. 时机

- [ ] 输入中不校验（除非已经有错）
- [ ] 离开输入框（blur）时校验
- [ ] 提交时全部校验
- [ ] 提交后每次输入都校验

## C. 错误显示

- [ ] 错误在字段下方，不在页面顶部
- [ ] 字段边框变红
- [ ] 提交失败自动滚到第一个错误并聚焦
- [ ] 有 `aria-invalid` 和 `aria-describedby`

## D. 键盘

- [ ] 输入框有 `inputmode`
- [ ] 有 `scroll-margin-bottom`
- [ ] 真机上点最下面那个输入框，不被键盘挡住

## E. 错误翻译

- [ ] 数据库错误能翻译成人话
- [ ] 超过 120 字符的错误显示成"操作失败"
- [ ] 原始错误在控制台里能看到

## F. 三个错误

- [ ] 我删过 `blur` 校验，看到要提交两轮
- [ ] 我改过文案成"格式不正确"，体会到客户看不懂
- [ ] 我删过实时重校验，看到红字不消失

## G. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我把"还差 N 位"这种提示抄下来了
- [ ] 我记下了 `type="text" + inputmode` 这个组合

## 提交

```text
git add -A
git commit -m "第186节课: 表单校验器 + 校验时机 + 就近错误 + 键盘遮挡 + 错误翻译"
git push
```

---

# 附：常见问题速查

| 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 一输入就报错 | 每次 `input` 都校验 | 只有 `errors[name]` 存在时才校验 |
| 改对了红字不消失 | `input` 事件里没重新校验 | 加 `if (errors[name]) revalidate()` |
| 提交后滚错位置 | `scrollIntoView` 用 `block: 'start'` | 用 `'center'` |
| 聚焦后又跳走 | `focus()` 没加 `preventScroll` | 加上 |
| 手机上弹不出数字键盘 | 没写 `inputmode` | 加 `inputmode="numeric"` |
| `type="number"` 里能输 `e` | 数字输入框的特性 | 用 `type="text"` + `inputmode` |
| 输入框被键盘挡住 | 没有 `scroll-margin-bottom` | 加 120px |
| 浏览器弹自己的气泡 | 没加 `novalidate` | 加到 `<form>` |
| 服务端错误显示成大段 SQL | 没翻译 | 用 `FriendlyError` |
| 校验通过了但服务端拒绝 | 前端没做唯一性校验 | 正常的，服务端要返回 `fieldErrors` |

---

## 本节课要能说出口的一句话

> **表单的每一个错误提示都是在回答"客户下一步该做什么"；写"格式不正确"等于什么都没说，写"还差 2 位"客户立刻会改。**
