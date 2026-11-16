# 第 185 节课：点了没反应

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 这节课只解决一件事：**任何一块界面，在任何一个时刻，都必须能回答"现在是什么状态"。**
> 听上去像废话。但客户打电话说的最多的一句话就是"**它不动了**"——**因为他看不出是在加载、还是出错、还是本来就没数据。**

**建议用时**：140 分钟
**你需要先完成**：第 184 节（`orders.html` 用组件重写，四个分支都有）

---

# 第 0 步：把"不动了"拆成六种（15 分钟）

## 0.1 客户看到的"不动了"

**他点了"加载更多"，页面没变。可能是：**

```text
① 正在加载（但没有任何提示）
② 加载完了，但没有更多数据
③ 加载失败了（但错误被 catch 了，界面没变）
④ 我的 token 过期了（接口返回 401）
⑤ 我没有权限（接口返回 403）
⑥ 网络断了（请求还没发出，或者超时）
```

**六种情况，客户看到的都是"没反应"。**

**他会做的第一件事：再点一次。**

**然后你会收到"重复请求"、"重复提交"、"重复创建"——** **第 173 节的幂等就是为了防这个，但根因在这里：界面没告诉他状态。**

## 0.2 六种状态，四个界面

```text
① 加载中       → 骨架屏 / 按钮转圈
② 有数据       → 正常列表
③ 空（真的空） → 空状态 + 引导动作
④ 空（筛选空） → 空状态 + "换个条件"
⑤ 出错         → 错误界面 + 重试
⑥ 无权限       → 权限提示 + "联系管理员"
```

**④ 和 ③ 不是一回事，要分开。**
**⑥ 和 ⑤ 也不一样——⑤ 重试可能有救，⑥ 重试永远没用。**

## 0.3 一个反直觉的原则

**"加载中"必须有延迟。**

```js
// ❌ 立刻显示骨架屏
state.loading = true;
render();

// ✅ 200ms 后才显示骨架屏
const timer = setTimeout(() => { state.loading = true; render(); }, 200);
```

**为什么：**

**接口本地只要 30ms。如果立刻显示骨架屏，界面会闪一下：**

```text
列表 → 骨架屏（30ms）→ 列表
```

**这个闪烁比"没反应"更糟——客户以为出问题了。**

**200ms 是经验值：** **低于 200ms 的等待人感觉不到。超过 200ms 才开始需要提示。**

**这个技巧叫"延迟加载态"（delayed loading indicator）。**

**所有骨架屏/加载动画都该这么做。**

---

# 第 1 步：写一个统一的状态容器（35 分钟）

**不要让每个页面自己写一遍 `if (loading) ... if (error) ...`。**

## 1.1 新建 `public/js/state.js`

```js
(function () {
  const { SkeletonList, EmptyState, ErrorState } = window.UI;

  const KIND = {
    LOADING: 'loading',
    READY: 'ready',
    EMPTY: 'empty',
    ERROR: 'error',
    FORBIDDEN: 'forbidden',
  };

  function createAsyncView(options) {
    const {
      container,
      renderData,
      renderSkeleton = () => SkeletonList(5),
      emptyWhen = (data) => !data || (Array.isArray(data) && data.length === 0),
      emptyOptions = {},
      loadingDelayMs = 200,
    } = options;

    if (!container) throw new Error('createAsyncView 需要一个 container');

    let state = { kind: KIND.LOADING, data: null, error: null, meta: {} };
    let loadingTimer = null;
    let requestSeq = 0;

    function paint() {
      if (state.kind === KIND.LOADING) {
        container.innerHTML = renderSkeleton();
        return;
      }

      if (state.kind === KIND.ERROR) {
        container.innerHTML = ErrorState({
          title: state.error.title || '加载失败',
          message: state.error.message,
          retryAction: 'async-retry',
        });
        return;
      }

      if (state.kind === KIND.FORBIDDEN) {
        container.innerHTML = EmptyState({
          title: '没有访问权限',
          text: state.error.message || '请让管理员给你开通权限',
        });
        return;
      }

      if (state.kind === KIND.EMPTY) {
        const opts = typeof emptyOptions === 'function' ? emptyOptions(state) : emptyOptions;
        container.innerHTML = EmptyState(opts);
        return;
      }

      container.innerHTML = renderData(state.data, state.meta);
    }

    function setState(next) {
      state = { ...state, ...next };

      if (state.kind === KIND.LOADING) {
        container.innerHTML = '';
        clearTimeout(loadingTimer);
        loadingTimer = setTimeout(() => {
          if (state.kind === KIND.LOADING) paint();
        }, loadingDelayMs);
        return;
      }

      clearTimeout(loadingTimer);
      paint();
    }

    async function run(fetcher) {
      const seq = ++requestSeq;

      setState({ kind: KIND.LOADING, error: null });

      try {
        const data = await fetcher();

        if (seq !== requestSeq) {
          return state;
        }

        if (emptyWhen(data)) {
          setState({ kind: KIND.EMPTY, data });
          return state;
        }

        setState({ kind: KIND.READY, data });
        return state;
      } catch (err) {
        if (seq !== requestSeq) {
          return state;
        }

        if (err.status === 403) {
          setState({
            kind: KIND.FORBIDDEN,
            error: { message: err.message },
          });
          return state;
        }

        if (err.status === 401) {
          return state;
        }

        setState({
          kind: KIND.ERROR,
          error: {
            title: err.status ? '加载失败（' + err.status + '）' : '网络异常',
            message: friendlyError(err),
          },
        });
        return state;
      }
    }

    function getState() {
      return state;
    }

    return { run, getState, setState, paint };
  }

  function friendlyError(err) {
    if (!navigator.onLine) {
      return '网络好像断了，检查一下 WiFi 或流量';
    }

    if (err.message && /Failed to fetch|NetworkError/i.test(err.message)) {
      return '连不上服务器，可能是网络问题，也可能是服务正在重启';
    }

    if (err.status === 429) {
      return '操作太快了，等几秒再试';
    }

    if (err.status >= 500) {
      return '服务器出了点问题，已经记录了，稍后再试';
    }

    return err.message || '未知错误';
  }

  window.AsyncView = { create: createAsyncView, KIND };
})();
```

## 1.2 五个关键设计

### `loadingDelayMs = 200` 挡住闪烁

**看 `setState` 的分支：**

```js
if (state.kind === KIND.LOADING) {
  container.innerHTML = '';        // 先清空（避免旧数据还显示着）
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    if (state.kind === KIND.LOADING) paint();
  }, loadingDelayMs);
  return;
}
```

**逻辑：**

```text
接口 30ms 返回 → 定时器还没触发 → 直接 paint 数据（永远不显示骨架屏）
接口 800ms 返回 → 200ms 时显示骨架屏 → 800ms 时显示数据
```

**这就是"快的时候不闪，慢的时候有提示"。**

**注意 `container.innerHTML = ''`。**

**为什么先清空：**

**因为"旧数据 + 一个新数据正在加载"是很危险的组合。** **客户会以为看到的还是旧数据，然后在上面做操作。**

**清空 + 骨架屏 = 明确告诉客户"正在换"。**

### 请求序号 `requestSeq` 防"旧结果覆盖新结果"

**没有这个会发生什么：**

```text
① 客户点"待支付"筛选 → 请求 A 发出
② 客户觉得慢，又点"已支付" → 请求 B 发出
③ B 先回来（快）→ 界面显示已支付
④ A 后回来（慢）→ 界面被覆盖成待支付
```

**客户看到的是"我点了已支付，怎么显示待支付"。**

**这是"竞态条件"（race condition），在筛选、搜索、翻页里 100% 会遇到。**

**解法：每个请求带一个序号，回来的时候比对。不是最新的就丢弃。**

```js
const seq = ++requestSeq;
const data = await fetcher();
if (seq !== requestSeq) return state;   // 丢弃
```

**这三行是所有"可取消的请求"的最小实现。**

### `emptyWhen` 是个函数，不是一个判断

```js
emptyWhen = (data) => !data || (Array.isArray(data) && data.length === 0)
```

**为什么是函数：**

**因为不同页面的"空"定义不同：**

```text
订单列表    → 数组长度 0
仪表盘      → 所有指标都是 0
详情页      → 数据是 null
搜索结果    → items 空 AND 关键词非空
```

**默认值覆盖 80% 的情况，特殊的自己传。**

### `friendlyError` 把技术错误变人话

**看这几条：**

```text
!navigator.onLine              → "网络好像断了，检查一下 WiFi"
Failed to fetch                → "连不上服务器"
429                            → "操作太快了，等几秒"
>= 500                         → "服务器出了点问题，已经记录了"
```

**为什么要这么写：**

**客户看到 `Failed to fetch` 的反应是"什么 fetch？"**

**看到"连不上服务器，可能是网络问题，也可能是服务正在重启"——** **他会先看看 WiFi，如果没问题就知道不是自己的错。**

**"已经记录了"这句话很重要。** **它让客户知道"你知道了"，而不是"你要自己解决"。**

**即使你根本没记录，这句话也能降低一半的投诉。**

（但最好真的记录——第 188 节的埋点可以做这件事。）

### 403 和 500 分开

```js
if (err.status === 403) → KIND.FORBIDDEN（"联系管理员"，不给重试按钮）
```

**为什么不让 403 有重试按钮：**

**因为重试一万次还是 403。** **给一个没用的按钮，客户会点十次然后打电话骂你。**

**"没有访问权限，请让管理员给你开通" —— 这一句话就是他能做的唯一的正确操作。**

## 1.3 自检点

**在 `orders.js` 里用它重写：**

```js
const view = AsyncView.create({
  container: document.getElementById('main'),
  emptyOptions: {
    title: '还没有订单',
    text: '第一次使用可以从 Excel 导入历史订单',
    actionLabel: '去导入',
    actionHref: '/imports.html',
  },
  renderData: (orders) => {
    return List({
      items: orders.map(renderOrderRow),
    });
  },
});

view.run(() => API.get('/api/orders'));
```

**然后在控制台里试五种情况：**

```js
// 1. 正常（有数据）
view.run(() => API.get('/api/orders'));

// 2. 空
view.run(() => Promise.resolve([]));

// 3. 错误（500）
view.run(() => Promise.reject(Object.assign(new Error('服务器崩了'), { status: 500 })));

// 4. 无权限（403）
view.run(() => Promise.reject(Object.assign(new Error('没有权限'), { status: 403 })));

// 5. 网络错误
view.run(() => Promise.reject(new Error('Failed to fetch')));
```

**五种都要有对应的界面。**

**注意第 5 种：文案应该是"连不上服务器，可能是网络问题……"，不是"Failed to fetch"。**

---

# 第 2 步：按钮的加载态（30 分钟）

**页面级的四态做完了，但"提交一个表单"是另一回事。**

## 2.1 三个必须处理的状态

```text
① 点击瞬间      → 按钮变灰 + 转圈（防重复点击）
② 成功          → 按钮恢复 + 一条 toast
③ 失败          → 按钮恢复 + 错误提示（在按钮旁边，不在顶部）
```

## 2.2 新建 `public/js/action.js`

```js
(function () {
  const { toast } = window.UI;

  async function runAction(button, fn, options = {}) {
    if (!button) return;

    const originalHtml = button.innerHTML;
    const originalDisabled = button.disabled;

    if (button.dataset.busy === '1') {
      return;
    }

    button.dataset.busy = '1';
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML =
      '<span class="btn__spinner" aria-hidden="true"></span><span>' +
      (options.busyLabel || '处理中') +
      '</span>';

    try {
      const result = await fn();

      if (options.successMessage) {
        toast(options.successMessage);
      }

      return { ok: true, result };
    } catch (err) {
      const message = err && err.message ? err.message : '操作失败';

      showActionError(button, message);

      return { ok: false, error: err };
    } finally {
      delete button.dataset.busy;
      button.disabled = originalDisabled;
      button.classList.remove('is-loading');
      button.innerHTML = originalHtml;
    }
  }

  function showActionError(button, message) {
    const host = button.closest('.action-host') || button.parentElement;

    let box = host.querySelector('.action-error');

    if (!box) {
      box = document.createElement('div');
      box.className = 'action-error';
      host.appendChild(box);
    }

    box.textContent = message;
    box.style.display = 'block';

    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
      box.style.display = 'none';
    }, 6000);
  }

  window.Action = { run: runAction, showError: showActionError };
})();
```

**配套 CSS：**

```css
.action-error {
  display: none;
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: #fdecee;
  color: var(--color-danger);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.action-host {
  position: relative;
}
```

## 2.3 四处关键

### `button.dataset.busy` 是真正的防重点击

**`button.disabled = true` 不够。**

**为什么：**

**`disabled` 是在"同步执行到那一行"之后才生效的。** **如果客户在 10 毫秒内连点两次，第二次可能刚好落在 `disabled = true` 之前。**

**用 `dataset.busy` 做判断，再加上 `disabled`，双保险。**

**而且 `dataset.busy` 在 `finally` 里删掉——** **即使 `fn` 抛错，也能恢复。**

**如果写在 `try` 里，抛错后按钮永远是灰的。** **这是"表单提交失败后按钮点不动"的经典原因。**

### `originalHtml` 保存和恢复

**为什么不用 `button.textContent = ...`：**

**因为按钮里可能有图标、有 span。**

**保存 `innerHTML`，`finally` 里还原，是最稳的做法。**

### 错误显示在按钮旁边

**为什么不在页面顶部显示一条红色的横条：**

**客户点的是"保存"按钮，他眼睛在这。** **错误出现在屏幕上方的横条，他会看不到。**

**`button.closest('.action-host')` 找最近的容器，** **没有就挂在父元素后面。**

**这个"就近显示错误"的原则，和表单校验是同一个。** **第 186 节会展开。**

### 6 秒后自动消失

```js
box._timer = setTimeout(() => { box.style.display = 'none'; }, 6000);
```

**6 秒是经验值：** **短于 3 秒客户看不完，长了会一直挂着影响观感。**

**而且客户再点一次会刷新这条错误（`clearTimeout` 先清掉）。**

## 2.4 自检点

**做一个"保存设置"的按钮：**

```html
<div class="action-host">
  <button class="btn btn--primary btn--block" id="save-btn">保存</button>
</div>
```

```js
document.getElementById('save-btn').addEventListener('click', (e) => {
  Action.run(
    e.currentTarget,
    async () => {
      await new Promise((r) => setTimeout(r, 800));
      throw new Error('测试错误：这个字段不能为空');
    },
    { successMessage: '保存成功' }
  );
});
```

**四个检查：**

```text
① 点击后按钮变灰 + 转圈 + 文字变"处理中"
② 800ms 后按钮恢复
③ 按钮旁边出现红条"测试错误：这个字段不能为空"
④ 6 秒后红条消失
```

**然后快速连点三次：**

**只应该有一次请求。** **看控制台的网络面板，确认只有一个。**

---

# 第 3 步：空状态的四种（25 分钟）

**"空"不是一种状态。**

## 3.1 四种空，四种文案

```text
① 全新用户（从没建过任何东西）
   "还没有订单" + "从 Excel 导入第一批，或者手动新建一笔" + [去导入]

② 筛选后为空
   "这个筛选下没有订单" + "试试「全部」" + [看全部]

③ 搜索无结果
   "没找到「ABC」相关的订单" + "检查一下关键词，或者换个写法" + [清除搜索]

④ 正常但暂时无内容
   "今天还没有新订单" + 不引导（因为这是正常的）
```

**为什么必须区分：**

**客户看到"暂无数据"会想：**

```text
是我没权限吗？
是我筛错了吗？
是系统坏了吗？
本来就该是空的？
```

**四种可能，他不知道自己该做什么。**

**给具体文案 + 一个动作，他立刻知道。**

## 3.2 `emptyOptions` 可以是函数

**看 `state.js`：**

```js
const opts = typeof emptyOptions === 'function' ? emptyOptions(state) : emptyOptions;
```

**所以可以按状态动态决定：**

```js
const view = AsyncView.create({
  container,
  emptyOptions: (state) => {
    if (state.meta.search) {
      return {
        title: '没找到「' + state.meta.search + '」相关的订单',
        text: '检查一下关键词，或者换个写法',
        actionLabel: '清除搜索',
        action: 'clear-search',
      };
    }

    if (state.meta.filter && state.meta.filter !== 'all') {
      return {
        title: '这个筛选下没有订单',
        text: '试试「全部」看看',
        actionLabel: '看全部',
        action: 'clear-filter',
      };
    }

    return {
      title: '还没有订单',
      text: '从 Excel 导入第一批，或者手动新建一笔',
      actionLabel: '去导入',
      actionHref: '/imports.html',
    };
  },
  renderData: ...,
});
```

**这样"空"的文案会自动跟着当前筛选/搜索变。**

**而且 `action` 字段让"清除搜索"这种行为变成可点击的——** **比"请你手动清空搜索框"友好得多。**

## 3.3 空状态的视觉

**看 `ui.js` 里的 `EmptyState`：**

```text
① 一个图标（SVG，不是图片）
② 一句标题（说清"为什么空"）
③ 一句说明（说清"能做什么"）
④ 一个按钮（只给一个，不给三个）
```

**四个里的第 ④ 条最容易做错。**

**给三个按钮（"导入"、"新建"、"看示例"），客户会犹豫。** **给一个，他会点。**

**"选择的成本"是真实存在的。** **主次分明比选项丰富更重要。**

---

# 第 4 步：让"加载中"有层次（20 分钟）

**不是所有加载都一样。**

## 4.1 三种加载

```text
① 首次加载      不知道内容是什么    → 骨架屏（形状像最终内容）
② 刷新 / 换筛选  已有内容，正在更新  → 保留旧内容 + 顶部细进度条
③ 局部加载      只有一小块在变       → 那一块转圈
```

**最常见的错误是：② 也用了 ① 的做法。**

**客户点"刷新"，整个列表消失 → 骨架屏 → 列表出现。**

**这个"消失再出现"的过程让人觉得"数据丢了"。**

**更糟的是：客户可能正在看某一行，刷新后滚到顶部了。**

## 4.2 加一个顶部进度条

**在 `state.js` 里加 `keepWhileLoading` 选项：**

```js
function createAsyncView(options) {
  const { container, renderData, keepWhileLoading = false, ... } = options;
  ...
  function setState(next) {
    state = { ...state, ...next };

    if (state.kind === KIND.LOADING) {
      if (keepWhileLoading && state.data !== null) {
        container.classList.add('is-refreshing');
        showTopBar();
        clearTimeout(loadingTimer);
        loadingTimer = setTimeout(() => {
          if (state.kind === KIND.LOADING) showTopBar();
        }, loadingDelayMs);
        return;
      }

      container.innerHTML = '';
      ...
    }
    ...
  }
}
```

**`showTopBar` 是一个 3px 的横条，从 0 走到 80%，** **数据回来时走到 100% 然后消失。**

```js
function showTopBar() {
  let bar = document.getElementById('top-progress');

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'top-progress';
    document.body.appendChild(bar);
  }

  bar.style.width = '0%';
  bar.style.opacity = '1';

  requestAnimationFrame(() => {
    bar.style.width = '80%';
  });
}

function finishTopBar() {
  const bar = document.getElementById('top-progress');
  if (!bar) return;

  bar.style.width = '100%';

  setTimeout(() => {
    bar.style.opacity = '0';
    setTimeout(() => { bar.style.width = '0%'; }, 200);
  }, 200);
}
```

```css
#top-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  width: 0;
  background: var(--color-primary);
  transition: width 0.4s ease, opacity 0.2s ease;
  z-index: 200;
  opacity: 0;
}
```

## 4.3 为什么是"走到 80% 然后等"

**因为进度条不能"假装知道自己走了多少"。**

```text
❌ 从 0 匀速走到 100%，然后在 40% 的时候卡住
   客户会以为"卡死了"

❌ 一直 90% 不动
   客户会盯着看，越看越烦

✅ 快速到 80%，然后慢下来
   看起来"快完成了"，心理上能等
```

**这是所有进度条（包括 YouTube、GitHub）的做法。**

**它不精确，但它诚实——** **"我不知道还要多久，但我知道还没完成"。**

## 4.4 自检点

**用 `keepWhileLoading: true` 重写订单页，然后：**

```text
① 首次进入 → 骨架屏（因为 state.data 是 null）
② 点"刷新" → 列表还在，顶部出现一条蓝线
③ 蓝线走到 80% 停住
④ 数据回来 → 蓝线走到 100% 消失，列表更新
```

**感受一下这个差别。**

**"消失再出现"和"原地更新"，客户对"系统稳不稳"的判断完全不同。**

---

# 第 5 步：故意断网（20 分钟）

**这是最值得做的一次实验。**

## 5.1 Chrome 的断网模拟

**F12 → Network 标签 → 把 "No throttling" 改成 "Offline"。**

**然后点"刷新"。**

**你的界面应该显示：**

```text
加载失败
网络好像断了，检查一下 WiFi 或流量
[ 重试 ]
```

**如果显示的是 `Failed to fetch` 或者一片空白，说明 `friendlyError` 没生效。**

## 5.2 慢网络

**改成 "Slow 3G"，再点刷新。**

**你会看到：**

```text
① 顶部出现蓝线（或者骨架屏，看有没有 keepWhileLoading）
② 等 3—5 秒
③ 数据出现
```

**这个 5 秒是你真实客户的体验。**

**在办公室 WiFi 上测不出来。** **客户在高铁上、在地下车库、在工厂车间，就是这样。**

## 5.3 一个更狠的：请求超时

**Slow 3G 下，`fetch` 可能等到 30 秒才失败（浏览器默认超时）。**

**客户会盯着屏幕 30 秒。**

**必须加主动超时：**

**改 `api.js`：**

```js
async function request(path, options = {}) {
  const { timeoutMs = 15000, ...rest } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(path, {
      credentials: 'include',
      signal: controller.signal,
      ...rest,
    });
    ...
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('请求超时，网络可能不太好');
      timeoutErr.status = 0;
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

## 5.4 三个数字记下来

```text
15 秒    请求超时（超过这个，客户已经走了）
200ms    加载提示的延迟（低于这个不用提示）
3 秒     客户能等的"有反馈"的时间（超过就要有进度）
```

**这三个数字是这一节的骨架。**

## 5.5 自检点

**用 Slow 3G + 15 秒超时，测一次：**

**如果请求 15 秒没回来，界面应该显示：**

```text
网络异常
请求超时，网络可能不太好
[ 重试 ]
```

**而不是一直转圈。**

**"一直转圈"是最糟的状态——** **客户不知道还要等多久，也不知道该不该放弃。**

**有超时 + 有重试按钮，客户至少知道"我可以重来"。**

---

# 第 6 步：最终验收

## A. 四态

- [ ] 加载中有骨架屏（不是"加载中……"三个字）
- [ ] 空状态有"为什么空"和"能做什么"
- [ ] 错误状态有重试按钮
- [ ] 403 有"联系管理员"（不是重试）
- [ ] 四种状态的文案都不一样

## B. 细节

- [ ] 加载提示有 200ms 延迟（快的时候不闪）
- [ ] 有请求序号防"旧结果覆盖新结果"
- [ ] 刷新时保留旧内容 + 顶部进度条（`keepWhileLoading`）
- [ ] 错误文案是人话（不是 `Failed to fetch`）

## C. 按钮

- [ ] 点击后变灰 + 转圈
- [ ] 连点三次只有一个请求
- [ ] 失败后按钮能恢复（不是永远灰的）
- [ ] 错误显示在按钮旁边

## D. 空状态

- [ ] "完全空"和"筛选空"文案不同
- [ ] "搜索无结果"会显示关键词
- [ ] 每种空状态只给一个动作按钮

## E. 网络

- [ ] 断网能看到"网络好像断了"
- [ ] Slow 3G 下有进度提示
- [ ] 15 秒超时后会显示错误（不是一直转圈）
- [ ] 重试能恢复

## F. 笔记

- [ ] `NOTES.md` 填完
- [ ] 我记下了 15/200/3000 这三个数字
- [ ] 我记下了"进度条走到 80% 然后等"

## 提交

```text
git add -A
git commit -m "第185节课: 异步四态 + 延迟加载态 + 请求竞态 + 按钮防重点击 + 断网体验"
git push
```

---

# 附：常见问题速查

| 现象 | 真正的原因 | 怎么修 |
|---|---|---|
| 骨架屏一闪而过 | 没有 200ms 延迟 | `loadingDelayMs` |
| 点了筛选显示上一个的结果 | 请求竞态 | 加 `requestSeq` |
| 刷新后滚动到顶部 | `innerHTML` 替换 | 用 `keepWhileLoading` 保留 DOM |
| 提交失败后按钮永远灰 | `finally` 里没恢复 | 检查 `finally` |
| 连点创建了两个订单 | 只有 `disabled`，没有 `dataset.busy` | 两个都用 |
| 断网显示 `Failed to fetch` | 没有 `friendlyError` | 加一层翻译 |
| 请求一直不返回 | 没有 `AbortController` | 加 15 秒超时 |
| 403 也显示"重试" | 没区分 403 和 5xx | 分开处理 |
| 空状态显示"暂无数据" | 没区分四种空 | 用 `emptyOptions` 函数 |
| 进度条卡在 40% | 匀速走到 100% | 改成"快速 80% 然后慢" |

---

## 本节课要能说出口的一句话

> **"没反应"是客户对六种状态（加载/空/筛选空/出错/无权限/断网）的统一说法；把每一种都给出不同的界面和动作，客户才不会连点三次。**
