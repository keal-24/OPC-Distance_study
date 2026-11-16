# 第 137 节课：统一错误格式

> **这份文件是你（学员）一步一步照着做的操作手册。**
> 今天的标准只有一句：**前端只需要写一次错误处理，就能覆盖所有情况。**
> 而且这条错误提示里，不能出现任何技术细节。

**建议用时**：120 分钟
**你需要先完成**：第 136 节的启动校验
**今天要装**：什么都不用装

---

# 第 0 步：先看你现在有几种错误形状（15 分钟）

## 0.1 五条命令，五种形状

**在你项目里搜一遍"返回错误"的地方：**

```bash
# ① 直接返回字符串
grep -rn 'res\.send("' app/ --include="*.js"

# ② 返回 {error: ...}
grep -rn 'res\.json({ *error' app/ --include="*.js"

# ③ 返回 {message: ...}
grep -rn 'res\.json({ *message' app/ --include="*.js"

# ④ 返回 {ok: false}
grep -rn 'ok: *false' app/ --include="*.js"

# ⑤ 直接 throw
grep -rn "throw new Error" app/ --include="*.js"
```

**大概率你会看到四五种形状混在一起。**

## 0.2 前端要处理这五种

```javascript
// 前端的错误处理（现在的样子）
try {
  const r = await fetch("/api/tickets", {...});
  const j = await r.json();

  if (typeof j === "string") { alert(j); }
  else if (j.error) { alert(j.error); }
  else if (j.message) { alert(j.message); }
  else if (j.ok === false) { alert("操作失败"); }
  else { /* 成功 */ }
} catch (e) {
  alert("网络错误");
}
```

**五个分支，而且都不全 —— 因为后端有十几种返回方式，前端只猜到了五种。**

## 0.3 一个具体的坑

```text
后端某个接口报错时返回：
  res.status(500).send(err.stack)

前端拿到：
  "Error: SQLITE_BUSY: database is locked\n    at Database.prepare (...)"
  → alert 弹出来的是一堆路径和 SQL
  → 客户截图发到群里
```

**这不是"体验不好"，这是"信息泄露"。**

**`err.stack` 里的东西：**

```text
· 绝对路径（你的用户名、项目名）
· 依赖库的版本和位置
· SQL 语句
· 内部函数名（暴露架构）
```

## 0.4 今天的三条产出

```text
app/errors/index.js           错误码表（唯一真相）
app/middleware/error.js       全局错误中间件
app/middleware/not-found.js   404 也走统一格式
```

**核心思想：**

```text
错误 = { ok:false, code, message, trace_id }
        ↑         ↑       ↑         ↑
      固定     可枚举   人能读    能定位
```

**四个字段，前端只需要认识这一种。**

---

# 第 1 步：设计错误码表（30 分钟）

## 1.1 为什么用 `code` 而不是 HTTP 状态码

```text
HTTP 状态码只有 60 多个，且语义宽泛：
  400 可能是"参数缺失"、"格式错"、"太长"、"被拦"
  500 可能是"数据库挂了"、"代码 bug"、"模型超时"

前端拿到 400，能做什么？
  → 只能统一弹"请求有误"

前端拿到 code="TOO_LONG"，能做什么？
  → 能提示"你的消息太长了，请精简到 500 字以内"
  → 能在输入框旁边高亮
  → 能记住"上次因为这个失败" 
```

**`code` 是给程序看的，`message` 是给人看的，HTTP 状态码是给网关看的。三个用途不同。**

## 1.2 完整的错误码表

```javascript
// app/errors/index.js

export const CODES = {
  // ============ 4xx：客户端的问题 ============
  
  // 参数类
  BAD_INPUT: {
    status: 400,
    message: "请求参数不对",
    hint: "检查必填字段和格式",
  },
  EMPTY_INPUT: {
    status: 400,
    message: "消息是空的，请描述一下遇到的问题",
    hint: "至少输入几个字",
  },
  TOO_LONG: {
    status: 400,
    message: "消息太长了，请用几句话简述问题",
    hint: "上限 4000 字",
  },
  BAD_FORMAT: {
    status: 400,
    message: "格式不对，请检查后重试",
    hint: "比如日期写成 2026-11-16",
  },

  // 内容类
  BLOCKED: {
    status: 400,
    message: "这条消息没法处理，请直接描述你遇到的问题",
    hint: "不要包含指令性内容",
  },
  OFFTOPIC: {
    status: 400,
    message: "这条消息看起来和我们的业务无关",
    hint: "这里只处理订单和服务问题",
  },

  // 资源类
  NOT_FOUND: {
    status: 404,
    message: "找不到这条记录",
    hint: "可能已被删除，或者链接过期",
  },
  GONE: {
    status: 410,
    message: "这条记录已经失效了",
    hint: null,
  },

  // 权限类
  UNAUTHORIZED: {
    status: 401,
    message: "请先登录",
    hint: null,
  },
  FORBIDDEN: {
    status: 403,
    message: "你没有权限做这个操作",
    hint: "如果需要，请联系管理员",
  },

  // 频率类
  RATE_LIMITED: {
    status: 429,
    message: "操作太频繁了，请稍等一分钟",
    hint: null,
    retryAfter: 60,
  },

  // 冲突类
  CONFLICT: {
    status: 409,
    message: "这条记录刚刚被修改过，请刷新后重试",
    hint: null,
  },

  // ============ 5xx：服务端的问题 ============
  // 注意：所有 5xx 的 message 都不能透露内部细节

  // 202：不是错误，是"还在处理"
  PROCESSING: {
    status: 202,
    message: "正在核实，2 小时内回复",
    hint: "不需要重复发送",
  },

  UPSTREAM_DOWN: {
    status: 503,
    message: "服务暂时连不上，我们已经在处理",
    hint: "5 分钟内恢复，不需要刷新",
  },
  UPSTREAM_SLOW: {
    status: 504,
    message: "这条处理得比较久，已经转人工",
    hint: "2 小时内回复，不需要重复发送",
  },
  INTERNAL: {
    status: 500,
    message: "处理失败了，我们会跟进",
    hint: "把下面的编号告诉我们，能更快定位",
  },
  UNAVAILABLE: {
    status: 503,
    message: "系统正在维护，请稍后再试",
    hint: null,
  },
};

// 每个 code 的反向校验：有没有漏写 status？
for (const [code, def] of Object.entries(CODES)) {
  if (typeof def.status !== "number") {
    throw new Error(`错误码 ${code} 缺少 status`);
  }
  if (!def.message) {
    throw new Error(`错误码 ${code} 缺少 message`);
  }
}
```

## 1.3 逐条解释三类关键设计

**① `hint` 字段：告诉你"该怎么办"**

```json
{
  "code": "TOO_LONG",
  "message": "消息太长了，请用几句话简述问题",
  "hint": "上限 4000 字"
}
```

**`message` 说"什么错了"，`hint` 说"怎么改"。**

**为什么分开？**

```text
message 要短（一句话，能显示在 toast 里）
hint 可以长（显示在表单校验提示里）
```

**合并成一句话的结果：**

```text
❌ "消息太长了（上限 4000 字），请用几句话简述问题"
   → 一句话塞了两个意思，读起来别扭
```

**② 5xx 的 message 一律不能提内部**

```javascript
// ❌ 全部错误示范
UPSTREAM_DOWN: { message: "OpenAI API 返回 503" }      // 暴露供应商
UPSTREAM_DOWN: { message: "上游服务超时 30s" }           // 暴露架构
UPSTREAM_DOWN: { message: "fetch failed: ECONNREFUSED" } // 暴露技术栈
INTERNAL:      { message: "SQLITE_BUSY: database locked" } // 暴露数据库

// ✅ 正确
UPSTREAM_DOWN: { message: "服务暂时连不上，我们已经在处理" }
INTERNAL:      { message: "处理失败了，我们会跟进" }
```

**"我们已经在处理"这句话很重要** —— 它告诉用户"有人管"，而不是"系统坏了你自己看着办"。

**③ `PROCESSING` 用 202，不用 200 也不用 500**

```text
200 → 前端以为成功了，会把 data 当结果显示
202 → "已接受，还在处理"，语义准确
500 → 前端以为失败了，会提示用户重试（但他不该重试）
```

**202 是这一整周的核心状态码**（第 129、131 节都在用）。

## 1.4 错误类

```javascript
// app/errors/index.js 继续

export class AppError extends Error {
  /**
   * @param {keyof typeof CODES} code
   * @param {object} opts
   * @param {string}  opts.detail   内部细节，只进日志，不返回前端
   * @param {Error}   opts.cause    原始错误，用于串起堆栈
   * @param {boolean} opts.expose   是否可以把 message 给前端（默认 true）
   * @param {object}  opts.extra    额外要返回给前端的字段
   */
  constructor(code, { detail, cause, expose = true, extra } = {}) {
    const def = CODES[code] ?? CODES.INTERNAL;
    super(def.message);

    this.name = "AppError";
    this.code = code in CODES ? code : "INTERNAL";
    this.status = def.status;
    this.hint = def.hint ?? null;
    this.retryAfter = def.retryAfter ?? null;

    this.detail = detail;        // 内部
    this.expose = expose;        // 是否外露
    this.extra = extra;          // 额外字段
    this.cause = cause;

    // 让堆栈从调用处开始，而不是构造函数
    if (Error.captureStackTrace) Error.captureStackTrace(this, AppError);
  }

  toJSON(traceId) {
    return {
      ok: false,
      code: this.code,
      message: this.expose ? this.message : CODES.INTERNAL.message,
      hint: this.expose ? this.hint : CODES.INTERNAL.hint,
      ...(this.retryAfter ? { retry_after_s: this.retryAfter } : {}),
      ...(this.extra ?? {}),
      trace_id: traceId,
    };
  }
}

export function fail(code, opts) {
  throw new AppError(code, opts);
}

// 判断一个错误是不是"我们认识的"
export function isAppError(e) {
  return e instanceof AppError;
}
```

## 1.5 一个必须验证的事

```bash
node -e "
import('./app/errors/index.js').then(({ fail, AppError, CODES }) => {
  console.log('码表共', Object.keys(CODES).length, '个');
  try { fail('TOO_LONG', { detail: '5200 chars' }); }
  catch (e) {
    console.log('code:', e.code, 'status:', e.status);
    console.log('toJSON:', JSON.stringify(e.toJSON('tr_test')));
    console.log('detail:', e.detail);
  }
});
"
```

**期望输出：**

```text
码表共 18 个
code: TOO_LONG status: 400
toJSON: {"ok":false,"code":"TOO_LONG","message":"消息太长了，请用几句话简述问题","hint":"上限 4000 字","trace_id":"tr_test"}
detail: 5200 chars
```

**注意 `detail` 不在 JSON 里** —— 这就是"内部分开"的证明。

---

# 第 2 步：全局错误中间件（35 分钟）★ 核心

## 2.1 完整实现

```javascript
// app/middleware/error.js
import { AppError, CODES, isAppError } from "../errors/index.js";
import { log } from "../lib/logger.js";
import { config } from "../config/index.js";

/**
 * 全局错误处理。必须是最后一个 app.use()。
 * Express 通过"四个参数"识别它为错误中间件，所以 next 不能省。
 */
export function errorMiddleware(err, req, res, next) {
  const traceId = req.traceId ?? "tr_unknown";
  const L = log.child({ trace_id: traceId });

  // ===== ① 归一化：把各种错误变成 AppError =====

  const appErr = normalize(err);

  // ===== ② 记日志（完整细节）=====

  const level = appErr.status >= 500 ? "error" : "warn";

  L[level]("req_error", {
    code: appErr.code,
    status: appErr.status,
    detail: appErr.detail ?? null,
    cause: appErr.cause ? String(appErr.cause.message).slice(0, 200) : null,
    stack: topFrames(appErr, 5),
    method: req.method,
    path: req.path,
    // 不记 body（可能含 PII），只记大小
    body_bytes: Number(req.headers["content-length"] ?? 0),
  });

  // ===== ③ 返回（干净的结构）=====

  // 已经发出去的响应头不能再改
  if (res.headersSent) {
    L.warn("headers_already_sent", { code: appErr.code });
    return next(err);
  }

  res.status(appErr.status);

  if (appErr.retryAfter) {
    res.setHeader("Retry-After", String(appErr.retryAfter));
  }

  res.json(appErr.toJSON(traceId));
}

// ===== 归一化：五种输入，一种输出 =====

function normalize(err) {
  // ① 我们自己抛的
  if (isAppError(err)) return err;

  // ② JSON 解析失败（express.json 抛的）
  if (err?.type === "entity.parse.failed") {
    return new AppError("BAD_FORMAT", {
      detail: `JSON 解析失败: ${err.message}`,
      cause: err,
    });
  }

  // ③ body 太大
  if (err?.type === "entity.too.large") {
    return new AppError("TOO_LONG", {
      detail: `body 超过限制: ${err.limit}`,
      cause: err,
    });
  }

  // ④ 有 status 但没 code（比如旧的 throw new Error 加了 status）
  if (typeof err?.status === "number") {
    const code = statusToCode(err.status);
    return new AppError(code, {
      detail: err.message,
      cause: err,
    });
  }

  // ⑤ 完全不认识的
  return new AppError("INTERNAL", {
    detail: `${err?.name ?? "Error"}: ${err?.message ?? String(err)}`,
    cause: err,
  });
}

function statusToCode(status) {
  const map = {
    400: "BAD_INPUT", 401: "UNAUTHORIZED", 403: "FORBIDDEN",
    404: "NOT_FOUND", 409: "CONFLICT", 429: "RATE_LIMITED",
    500: "INTERNAL", 503: "UNAVAILABLE",
  };
  return map[status] ?? (status >= 500 ? "INTERNAL" : "BAD_INPUT");
}

function topFrames(err, n) {
  const stack = err?.stack ?? "";
  return stack.split("\n").slice(1, n + 1).map((l) => l.trim()).join(" | ");
}

// ===== wrap：让 async 函数的异常能进中间件 =====

export const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

## 2.2 逐段解释五个关键设计

**① 为什么必须四个参数**

```javascript
export function errorMiddleware(err, req, res, next) { }
//                                  ↑ 必须有，哪怕不用
```

**Express 靠 `fn.length === 4` 来识别错误中间件。** 少一个参数它就是个普通中间件，永远不会被错误触发。

**写成 `(err, req, res)` 会静默失效。** 这是最坑的一个细节 —— 没有报错，只是不生效。

**② 为什么 `normalize` 有五条分支**

因为**错误有五种来源，形状各不相同：**

```text
① 你自己 throw 的 AppError        → 已经是标准形状
② express.json() 解析失败          → err.type = "entity.parse.failed"
③ body 太大                        → err.type = "entity.too.large"
④ 别人 throw new Error + 手动加 status → 需要按 status 猜 code
⑤ 完全未知的（第三方库抛的）        → 兜底 INTERNAL
```

**如果只处理 ①，你的日志里会出现一堆"未知错误 500"，而它们其实是参数问题（应该是 400）。**

**③ 为什么 `level` 按 status 分**

```javascript
const level = appErr.status >= 500 ? "error" : "warn";
```

**因为 4xx 是你预期的（用户输错了），5xx 是意外的（你出 bug 了）。**

```text
如果所有错误都记 error 级别：
  → 你的错误日志里有 90% 是"用户输入不对"
  → 真正的 bug 被淹没
  → 你会开始忽略 error 日志
```

**④ 为什么 `headersSent` 要单独判断**

```text
场景：你已经 res.write 了一部分流式响应，然后出错了
  → 响应头已经发出
  → 再 res.status(500).json() 会抛 "Cannot set headers after they are sent"
  → 这个异常又会进错误中间件 → 无限循环
```

**所以要 `if (res.headersSent) return next(err)`** —— 交给 Express 的默认处理器（它会直接断连接）。

**⑤ 为什么不记 `req.body`**

```text
req.body 里可能有：
  · 客户原话（含手机号、地址）
  · 密码（登录接口）
  · token
```

**记了就等于把你精心做的脱敏（第 132 节）全部作废。**

**只记 `body_bytes`** —— 足够你知道"这是个 30 字节的请求"还是"这是个 200KB 的粘贴"。

## 2.3 404 也要走统一格式

```javascript
// app/middleware/not-found.js
import { AppError } from "../errors/index.js";

export function notFoundMiddleware(req, res, next) {
  // 不要直接 res.status(404).json(...)，要 next 给错误中间件
  next(new AppError("NOT_FOUND", {
    detail: `${req.method} ${req.path}`,
  }));
}
```

**为什么不能直接返回？**

```text
直接返回 → 这条 404 不会被记录（你的错误日志里没有它）
next     → 走统一中间件 → 有日志、有 trace_id、有统一样式
```

**而且 404 的量很重要** —— 如果某天 404 突然涨 10 倍，说明有接口被改坏了（前端还在调旧路径）。

## 2.4 接进 `app/index.js`

```javascript
// 顺序很重要
app.use(express.json({ limit: config.server.bodyLimit }));
app.use(traceMiddleware);
app.use(requestLogMiddleware);

app.use("/api", ticketsRouter);

app.get("/health", ...);

// ★ 404 在路由之后
app.use(notFoundMiddleware);

// ★ 错误处理在最后
app.use(errorMiddleware);
```

**顺序错了会怎样：**

```text
errorMiddleware 放在路由之前 → 它接不到路由里的错误
notFoundMiddleware 放在路由之前 → 所有请求都 404
```

## 2.5 一次性验证七种错误

```bash
# ① 参数缺失
curl -s -X POST localhost:3000/api/tickets -H 'Content-Type: application/json' -d '{}' | jq
# 期望：{"ok":false,"code":"EMPTY_INPUT",...}

# ② 超长
curl -s -X POST localhost:3000/api/tickets -H 'Content-Type: application/json' \
  -d "{\"message\":\"$(python3 -c 'print("a"*5000)')\"}" | jq
# 期望：TOO_LONG

# ③ JSON 坏了
curl -s -X POST localhost:3000/api/tickets -H 'Content-Type: application/json' -d '{bad' | jq
# 期望：BAD_FORMAT

# ④ body 太大
dd if=/dev/zero of=/tmp/big.txt bs=1k count=2000 2>/dev/null
curl -s -X POST localhost:3000/api/tickets -H 'Content-Type: application/json' \
  --data-binary @/tmp/big.txt | jq
# 期望：TOO_LONG（entity.too.large）

# ⑤ 找不到
curl -s localhost:3000/api/tickets/99999 | jq
# 期望：NOT_FOUND

# ⑥ 路径不存在
curl -s localhost:3000/api/nonexistent | jq
# 期望：NOT_FOUND（detail 是 GET /api/nonexistent）

# ⑦ 内部错误（手动造一个）
curl -s localhost:3000/api/debug/throw | jq
# 期望：INTERNAL，且 message 是"处理失败了，我们会跟进"
```

**七个全对，这一节就过了。**

**特别注意 ⑦：响应里不能有任何堆栈。** 如果你看到 `Error: xxx at ...`，说明 `normalize` 或 `toJSON` 有问题。

---

# 第 3 步：边界情况（25 分钟）

## 3.1 五种容易漏的情况

**① `throw` 在中间件之外（比如定时任务里）**

```javascript
// 定时任务不是请求，没有 req/res → 错误中间件管不到
setInterval(async () => {
  await doSomething();      // 这里抛错 → unhandledRejection → 进程可能退出
}, 60_000);
```

**必须加全局兜底：**

```javascript
// app/index.js
process.on("unhandledRejection", (reason, promise) => {
  log.error("unhandled_rejection", {
    reason: String(reason?.message ?? reason).slice(0, 300),
    stack: String(reason?.stack ?? "").split("\n").slice(0, 5).join(" | "),
  });
  // 不要 process.exit —— 让进程继续跑，但要能看到
});

process.on("uncaughtException", (err) => {
  log.error("uncaught_exception", {
    message: String(err?.message).slice(0, 300),
    stack: String(err?.stack ?? "").split("\n").slice(0, 5).join(" | "),
  });
  // 这个更严重，但也不要立刻退出 —— 先记下来
});
```

**为什么不能 `process.exit(1)`？**

```text
exit → 容器重启 → 你去看日志发现"启动失败" → 但真正的原因在退出前的日志里
不 exit → 进程可能处于不一致状态，但你能看到完整日志
```

**权衡：如果错误是"内存耗尽"这种，继续跑会越来越糟。但对"某个请求的 promise 没 catch"这种，继续跑完全没问题。**

**推荐：先记日志，然后根据错误类型判断。** 简单起步：不 exit，观察一周再决定。

**② 流式响应中途出错**

```javascript
res.write(`data: ${chunk}\n\n`);     // 已经开始写了
throw new Error("x");                // 这时候错误中间件改不了状态码了
```

**正确做法：**

```javascript
// 在流式接口里自己 try/catch，出错时写一条 error 事件再 end
try {
  for await (const chunk of upstream) {
    res.write(`data: ${chunk}\n\n`);
  }
  res.write("data: [DONE]\n\n");
} catch (e) {
  res.write(`data: ${JSON.stringify({ error: "upstream_failed" })}\n\n`);
  res.write("data: [DONE]\n\n");
} finally {
  res.end();
}
```

**关键：流式接口不能用全局错误中间件处理"中途错误"。** 必须自己处理。

**③ `res.json()` 本身抛错**

```text
你要返回的对象里有循环引用 / BigInt / undefined 的函数
→ res.json 抛 TypeError
→ 进错误中间件 → 又要 res.json → 又抛 → 无限循环
```

**防护：**

```javascript
// 在 errorMiddleware 里用 try/catch 包住最后的 res.json
try {
  res.json(appErr.toJSON(traceId));
} catch (serializeErr) {
  L.error("response_serialize_failed", { err: String(serializeErr.message) });
  res.status(500).type("text/plain").send("处理失败");
}
```

**④ 客户端的连接已经断了**

```javascript
res.on("close", () => { /* 客户端断了 */ });
```

**如果客户端断了之后你还 `res.json()`，Node 会静默忽略（不报错），但你的日志会显示"成功"。**

**加一个检查：**

```javascript
if (req.destroyed || res.writableEnded) {
  L.warn("client_gone", { code: appErr.code });
  return;
}
```

**⑤ 错误里嵌套了敏感信息**

```javascript
throw new AppError("INTERNAL", {
  detail: `调用失败，key=${config.model.primary.key}`   // ❌ detail 里有 key
});
```

**`detail` 虽然不返回前端，但会进日志。** 而日志可能被：

```text
· 上传到第三方日志服务
· 被运维看到
· 被 grep 出来
```

**所以 `detail` 里也不能有 key。** 加一个 lint 检查（第 140 节会做）。

## 3.2 一个必须写的测试

```javascript
// app/middleware/test-error.js
// 直接测中间件，不起服务（第 21 周会把这个变成正式测试）
import { errorMiddleware } from "./error.js";
import { AppError } from "../errors/index.js";

const cases = [
  {
    name: "AppError 直接抛",
    err: new AppError("TOO_LONG", { detail: "5200 chars" }),
    expect: { status: 400, code: "TOO_LONG" },
  },
  {
    name: "未知错误",
    err: new Error("boom"),
    expect: { status: 500, code: "INTERNAL", message: "处理失败了，我们会跟进" },
  },
  {
    name: "JSON 解析失败",
    err: Object.assign(new Error("bad json"), { type: "entity.parse.failed" }),
    expect: { status: 400, code: "BAD_FORMAT" },
  },
  {
    name: "带 status 的旧错误",
    err: Object.assign(new Error("nope"), { status: 404 }),
    expect: { status: 404, code: "NOT_FOUND" },
  },
];

for (const c of cases) {
  const req = { traceId: "tr_test", method: "POST", path: "/api/x", headers: {} };
  let captured = null;
  const res = {
    statusCode: 200,
    headersSent: false,
    status(s) { this.statusCode = s; return this; },
    json(body) { captured = body; return this; },
    setHeader() {},
  };
  errorMiddleware(c.err, req, res, () => {});

  const ok = captured?.code === c.expect.code && res.statusCode === c.expect.status;
  console.log(`${ok ? "✅" : "❌"} ${c.name.padEnd(18)} ${res.statusCode} ${captured?.code}`);
  if (c.expect.message && captured?.message !== c.expect.message) {
    console.log(`   ❌ message 不对：${captured?.message}`);
  }
}
```

**为什么要写这个？**

因为**错误中间件是全系统最容易出 bug 的地方，而且出 bug 时你看不出来** —— 你只会看到"某个接口返回了奇怪的东西"。

**四条断言，10 行代码，能省你两次两小时的调试。**

---

# 第 4 步：让前端只需要写一次（20 分钟）

## 4.1 前端统一处理

```javascript
// public/api.js
export async function callApi(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    });
  } catch (e) {
    // 网络层失败（断网、DNS、CORS）
    throw Object.assign(new Error("网络连接失败，请检查网络"), { code: "NETWORK" });
  }

  const traceId = res.headers.get("X-Trace-Id");

  let body = null;
  try { body = await res.json(); } catch { /* 可能不是 JSON */ }

  if (!body) {
    throw Object.assign(new Error("服务器返回了无法识别的内容"), {
      code: "BAD_RESPONSE",
      traceId,
      status: res.status,
    });
  }

  if (!res.ok || body.ok === false) {
    const err = new Error(body.message ?? "操作失败");
    err.code = body.code ?? "UNKNOWN";
    err.hint = body.hint;
    err.traceId = body.trace_id ?? traceId;
    err.retryAfter = body.retry_after_s;
    err.status = res.status;
    // 202 不是错误，是"处理中"
    err.pending = res.status === 202;
    throw err;
  }

  return body;
}
```

## 4.2 页面上的统一提示

```javascript
// public/ui.js
export function showError(err) {
  if (err.pending) {
    // 202：不是错误，是"在等"
    toast(`⏳ ${err.message}`, { type: "info", duration: 8000 });
    return;
  }

  const tail = err.traceId ? `\n\n编号：${err.traceId}` : "";
  const hint = err.hint ? `\n${err.hint}` : "";

  switch (err.code) {
    case "EMPTY_INPUT":
    case "TOO_LONG":
    case "BAD_FORMAT":
      // 表单类：显示在输入框下面，不用弹窗
      showFieldError(err.message + hint);
      break;

    case "RATE_LIMITED":
      toast(`操作太频繁，请 ${err.retryAfter ?? 60} 秒后重试`, { type: "warn" });
      break;

    case "NOT_FOUND":
      toast("这条记录不存在，可能已被删除", { type: "warn" });
      break;

    case "UNAUTHORIZED":
      location.href = "/login";
      break;

    case "UPSTREAM_DOWN":
    case "UPSTREAM_SLOW":
    case "PROCESSING":
      toast(err.message, { type: "info", duration: 8000 });
      break;

    default:
      // 兜底：显示消息 + 编号
      modal({
        title: "操作失败",
        body: err.message + tail,
        note: "把编号告诉我们，能更快定位",
      });
  }
}
```

## 4.3 这样做的三个收益

**① 新增错误码不需要改前端**

```text
后端加一个 GREETING_TOO_FORMAL 码
前端默认走 default 分支 → 显示 message + trace_id
→ 不用改代码就能用
```

**② `trace_id` 自动出现在用户面前**

```text
客户投诉时能直接念出编号
你 5 秒定位（第 132 节）
```

**③ 202 被正确对待**

```text
普通错误 → 红色提示"失败了"
202     → 蓝色提示"正在处理"，用户不会重复提交
```

**这个区别能减少 40% 的重复提交**（第 129 节讲过）。

---

# 第 5 步：写学习笔记（10 分钟）

填 `NOTES.md`。重点：

- **七种错误的实际返回**（逐个贴）
- **`errorMiddleware(err, req, res)` 三参数的后果**（试试看）
- **`wrap` 忘了用的现象**
- **前端的 `showError` 覆盖了几种 code**

---

# 第 6 步：课后练习

## 练习一：造一个"循环引用"（20 分钟）

```javascript
// app/routes/debug.js（只在 dev 环境挂载）
debugRouter.get("/debug/circular", (req, res) => {
  const a = { name: "a" };
  a.self = a;                    // 循环引用
  res.json({ ok: true, data: a });   // ← 这里会抛 TypeError
});
```

**然后访问它。**

**会发生什么？**

```text
如果没有防护 → 错误进中间件 → 中间件里又 res.json → 又抛 → 
可能无限循环，或者 Express 报 "Cannot set headers after they are sent"
```

**验证你的防护生效了：**

```bash
curl -s localhost:3000/api/debug/circular
# 期望：返回 "处理失败" 文本，不是崩溃、不是挂住
```

**然后在日志里找 `response_serialize_failed`。**

## 练习二：给每个错误码写"用户会怎么想"（20 分钟）

**填这张表，从用户的视角：**

| code | 用户看到 | 用户会怎么做 | 这个结果对吗 |
|---|---|---|---|
| TOO_LONG | | | |
| BLOCKED | | | |
| UPSTREAM_DOWN | | | |
| PROCESSING | | | |
| INTERNAL | | | |

**参考答案框架：**

```text
TOO_LONG       → "消息太长了" → 删减后重发 → 对
BLOCKED        → "没法处理"   → 换个说法重发 → 对（不告诉他是注入检测）
UPSTREAM_DOWN  → "暂时连不上" → 等一下再试 → 部分对（他会刷新，但你不想他刷）
                 改进：加"5 分钟内恢复，不需要刷新"
PROCESSING     → "正在核实"   → 等 → 对
INTERNAL       → "处理失败了" → 找客服 / 放弃 → 对，但"我们会跟进"这句很关键
```

**如果某个码的用户行为是"你不知道他会干什么"，说明这个码的文案有问题。**

## 练习三：判断这个设计错在哪（15 分钟）

```javascript
// 某人的错误处理
app.use((err, req, res) => {
  console.error(err);
  res.status(500).json({
    error: err.message,
    stack: err.stack,
    sql: err.sql,
  });
});
```

**错在哪？至少五条。**

**参考答案：**

```text
① 只有三个参数 → Express 不认它是错误中间件 → 永远不执行
② 全部 500 → 参数错误也是 500，前端无法区分
③ 返回 err.message → 可能是 "SQLITE_BUSY"，暴露技术栈
④ 返回 err.stack → 暴露绝对路径、依赖版本、内部函数名
⑤ 返回 err.sql → 暴露表结构和字段名（SQL 注入的侦察素材）
⑥ console.error 而不是结构化日志 → 查不到、无法关联 trace_id
⑦ 没有 trace_id → 客户投诉时无法定位
```

**第 ① 条是"静默失效"** —— 没有报错，你只会发现"我的错误处理好像没生效"。**这个 bug 能查一下午。**

---

# 第 7 步：交付物 `API-ERRORS.md`

**这一节有一个能直接给客户的产出。** 把它写出来，发给客户时对方会立刻觉得你专业。

```markdown
# 错误码说明

所有接口失败时返回同一结构：

\`\`\`json
{
  "ok": false,
  "code": "TOO_LONG",
  "message": "消息太长了，请用几句话简述问题",
  "hint": "上限 4000 字",
  "trace_id": "tr_20261116_8f3a2b1c"
}
\`\`\`

| code | HTTP | 含义 | 用户该怎么做 |
|---|---|---|---|
| EMPTY_INPUT | 400 | 消息是空的 | 输入几个字 |
| TOO_LONG | 400 | 超过 4000 字 | 精简后再发 |
| BAD_FORMAT | 400 | 格式不对 | 检查后重试 |
| BLOCKED | 400 | 消息无法处理 | 直接描述问题 |
| NOT_FOUND | 404 | 记录不存在 | 确认链接或 id |
| UNAUTHORIZED | 401 | 未登录 | 重新登录 |
| FORBIDDEN | 403 | 无权限 | 联系管理员 |
| RATE_LIMITED | 429 | 太频繁 | 等 60 秒 |
| CONFLICT | 409 | 被同时修改 | 刷新后重试 |
| **PROCESSING** | **202** | **正在人工核实** | **等待，不要重复提交** |
| UPSTREAM_DOWN | 503 | 服务暂时不可用 | 5 分钟后重试 |
| UPSTREAM_SLOW | 504 | 处理超时已转人工 | 等待 2 小时 |
| INTERNAL | 500 | 内部错误 | 把 trace_id 告诉我们 |

**注意 202 不是错误** —— 它表示"已收到，正在处理"，请勿重复提交。
```

**这份文件的三个作用：**

```text
① 前端照着实现错误提示（不用问你）
② 客户知道"什么情况下该重试，什么情况下该等"
③ 你自己在写代码时有据可查
```

---

# 第 8 步：最终验收

## A. 码表

- [ ] `CODES` 至少 15 个，覆盖 4xx 和 5xx
- [ ] 每个码都有 `status` 和 `message`
- [ ] 多数码有 `hint`
- [ ] 5xx 的 message 里没有任何技术词
- [ ] 有 `PROCESSING` = 202

## B. 错误中间件

- [ ] 四个参数（`err, req, res, next`）
- [ ] `normalize` 处理五种来源
- [ ] 4xx 记 warn，5xx 记 error
- [ ] `headersSent` 时交给 next
- [ ] 不记 `req.body`
- [ ] `res.json` 本身抛错有兜底

## C. 七种错误都试过

- [ ] EMPTY_INPUT（缺参数）
- [ ] TOO_LONG（超长）
- [ ] BAD_FORMAT（JSON 坏）
- [ ] TOO_LONG（body 太大）
- [ ] NOT_FOUND（id 不存在）
- [ ] NOT_FOUND（路径不存在）
- [ ] INTERNAL（内部抛错，**响应里没有堆栈**）

## D. 边界

- [ ] `unhandledRejection` / `uncaughtException` 有全局记录
- [ ] 流式接口自己 catch（不走全局中间件）
- [ ] 循环引用不会导致崩溃
- [ ] 客户端断开时不报错也不误记成功

## E. 前端

- [ ] `callApi` 统一处理，`showError` 覆盖主要 code
- [ ] 202 走"提示"不是"报错"
- [ ] `trace_id` 会显示给用户

## F. 交付物

- [ ] `API-ERRORS.md` 写完
- [ ] 表里每个码都有"用户该怎么做"一列

## G. 提交

```bash
git add -A
git commit -m "第137节：统一错误格式，18个码，七种错误全验证"
git push
```

---

## 本节课要能说出口的一句话

> **`code` 给程序看，`message` 给人看，`detail` 只给日志看。三者混在一起，前端就要写五个 if。**

---

# 附：常见问题速查

**Q：为什么 4xx 也记日志？会不会太吵？**

A：**会吵，但你要的是"能统计"。**

```text
不记 → 你不知道"300 个用户因为 TOO_LONG 失败" → 用户默默走了
记（warn 级）→ 你能查"本周 TOO_LONG 127 次，涨了 3 倍" → 说明你该改提示语了
```

**如果太吵，可以只记"首次发生"或"每分钟首次"。** 但不要完全不记。

**Q：`detail` 里的英文错误消息（比如 `SQLITE_BUSY`）也算泄露吗？**

A：**"不返回前端"就够安全。日志里可以有你自己的技术细节。**

**但要注意两点：**

```text
① 日志会不会上传到第三方？会上传 → 先脱敏
② 日志权限谁有？实习生也有 → 那 key / 密码绝对不能进 detail
```

**Q：我的接口有 30 个错误场景，需要 30 个码吗？**

A：**不需要。同一类只用一码。**

```text
30 个场景 → 大概 12–15 个码
比如"标题太长""内容太长""附件太多" → 都是 TOO_LONG，靠 detail 区分
```

**判断方法：前端的处理方式一样吗？**

```text
一样（都是"在输入框下面提示"）→ 用同一个码
不一样（一个要跳登录，一个要弹窗）→ 分两个码
```

**Q：202 到底算不算错误？前端 `res.ok` 是 true 还是 false？**

A：**`res.ok` 是 true（202 在 2xx 范围），但业务上不是"成功完成"。**

**所以判断要用 `body.ok`，不要用 `res.ok`：**

```javascript
if (res.status === 202) { /* 处理中 */ }
else if (!res.ok || body.ok === false) { /* 错误 */ }
else { /* 成功 */ }
```

**这也是为什么我在每个响应里都加了一个 `ok` 字段** —— 让前端不用去猜 HTTP 状态码的语义。

**Q：`errorMiddleware` 里为什么不用 `console.error`？**

A：**因为 `console.error` 会：**

```text
① 不走你的日志文件（只到 stdout）
② 没有结构（无法 jq 查询）
③ 没有 trace_id（无法关联）
④ 没有脱敏（第132节做的全白费）
```

**统一走 `log.error` 是硬规则。**

**Q：客户端断开之后，我的日志里全是 `client_gone`，怎么减少？**

A：**先看数量。**

```text
每天几条 → 正常（用户关页面）
每天几百条 → 有客户端在轮询又立刻放弃，或者有健康检查超时
每天几千条 → 你的接口太慢，用户在等不及就走了
```

**第三种是最重要的信号** —— 它比任何监控指标都直接。**不要急着把它关掉。**
