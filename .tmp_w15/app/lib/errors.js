const TABLE = {
  IMAGE_TOO_LARGE: {
    status: 413,
    user: "这张图太大了（超过 4MB）。用画图打开，另存为 JPEG，或者把长边缩到 1024 像素再传一次。",
  },
  BAD_REQUEST: {
    status: 400,
    user: "这次请求不完整：可能没选图、没填问题，或者提示词太短。补齐再点一次。",
  },
  BAD_IMAGE: {
    status: 400,
    user: "这个文件不是模型能看的图片格式。支持 jpg、png、gif、webp，别的格式先另存成 jpg。",
  },
  CONTENT_FILTER: {
    status: 422,
    user: "这张图被模型的内容审核拦下了，可能是身份证、银行卡、人脸特写这类内容。换一张图，或者手动打码再试。",
  },
  TIMEOUT: {
    status: 504,
    user: "这次等了超过 60 秒还没结果，已经停了。图片太大或者网络不稳，压小一点再试一次。",
  },
  QUOTA: {
    status: 402,
    user: "你的接口额度用完了。去服务商后台看余额，充值后半小时内生效。",
  },
  RATE_LIMIT: {
    status: 429,
    user: "请求太频繁，被限流了。等 10 秒再点一次，不要连续猛点。",
  },
  AUTH: {
    status: 502,
    user: "接口密钥无效。检查 .env 里的 OPENAI_API_KEY 有没有多余空格或者已经过期。",
  },
  BAD_JSON: {
    status: 502,
    user: "模型这次没按 JSON 格式回答，结果不能直接用。点重试，或者把图片裁掉无关部分再试。",
  },
  UPSTREAM: {
    status: 502,
    user: "接口服务端出错了。等一分钟再试，连续失败就去看服务商的状态页。",
  },
  UNKNOWN: {
    status: 500,
    user: "出了没预料到的错误，已经记在终端日志里。把终端最后三行发给我看。",
  },
};

class AppError extends Error {
  constructor(code, detail) {
    super(detail || TABLE[code].user);
    this.name = "AppError";
    this.code = code;
    this.status = TABLE[code].status;
  }
}

function classify(err) {
  if (err && err.code && TABLE[err.code]) {
    return Object.assign({ code: err.code, detail: err.message }, TABLE[err.code]);
  }
  if (err && err.name === "BadRequestError") {
    return Object.assign({ code: "BAD_REQUEST", detail: err.message }, TABLE.BAD_REQUEST);
  }
  if (err && err.type === "entity.too.large") {
    return Object.assign({ code: "IMAGE_TOO_LARGE", detail: err.message }, TABLE.IMAGE_TOO_LARGE);
  }
  if (err && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return Object.assign({ code: "TIMEOUT", detail: err.message }, TABLE.TIMEOUT);
  }
  if (err && err.name === "ContentFilterError") {
    return Object.assign({ code: "CONTENT_FILTER", detail: err.message }, TABLE.CONTENT_FILTER);
  }
  if (err && err.name === "BadJsonError") {
    return Object.assign({ code: "BAD_JSON", detail: err.message }, TABLE.BAD_JSON);
  }
  if (err && (err.status === 401 || err.status === 403)) {
    return Object.assign({ code: "AUTH", detail: err.message }, TABLE.AUTH);
  }
  if (err && err.status === 429) {
    const raw = String(err.raw || err.message || "");
    if (/insufficient_quota|exceeded your current quota/i.test(raw)) {
      return Object.assign({ code: "QUOTA", detail: err.message }, TABLE.QUOTA);
    }
    return Object.assign({ code: "RATE_LIMIT", detail: err.message }, TABLE.RATE_LIMIT);
  }
  if (err && err.status === 400) {
    return Object.assign({ code: "BAD_IMAGE", detail: err.message }, TABLE.BAD_IMAGE);
  }
  if (err && err.status >= 500) {
    return Object.assign({ code: "UPSTREAM", detail: err.message }, TABLE.UPSTREAM);
  }
  return Object.assign({ code: "UNKNOWN", detail: err ? err.message : "未知错误" }, TABLE.UNKNOWN);
}

function isRetryable(code) {
  return code === "TIMEOUT" || code === "RATE_LIMIT" || code === "UPSTREAM";
}

async function withRetry(fn, { retries, baseDelayMs }) {
  const max = retries === undefined ? 2 : retries;
  const base = baseDelayMs === undefined ? 800 : baseDelayMs;
  let lastErr = null;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const info = classify(err);
      if (!isRetryable(info.code) || attempt === max) throw err;
      const wait = base * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

module.exports = { AppError, classify, isRetryable, withRetry, TABLE };
