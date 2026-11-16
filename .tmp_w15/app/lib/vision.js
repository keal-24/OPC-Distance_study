const { MOCK, mockChatCompletion } = require("./mock");
const config = require("./config");

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error("等待模型超过 " + ms + " 毫秒，放弃了");
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function toDataUrl(base64, mime) {
  return "data:" + mime + ";base64," + base64;
}

function pickAnswer(data) {
  const choice = data && data.choices && data.choices[0];
  if (!choice) {
    const err = new Error("接口返回里没有 choices 字段");
    err.name = "BadResponseError";
    throw err;
  }
  if (choice.finish_reason === "content_filter") {
    const err = new Error("模型拒绝回答：内容审核未通过");
    err.name = "ContentFilterError";
    throw err;
  }
  const content = choice.message ? choice.message.content : null;
  if (content === null || content === undefined) {
    const err = new Error("模型返回了空内容，finish_reason=" + choice.finish_reason);
    err.name = "EmptyContentError";
    throw err;
  }
  return { text: content, usage: data.usage || null, finishReason: choice.finish_reason };
}

function buildMessages(prompt, base64, mime, detail) {
  return [
    {
      role: "system",
      content: "你是一个看图助手。只描述图片上真实存在的内容，看不清就直说看不清，不要猜。",
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: toDataUrl(base64, mime || "image/jpeg"),
            detail: detail || "auto",
          },
        },
      ],
    },
  ];
}

async function analyzeImage({ base64, mime, prompt, detail, timeoutMs, scenario }) {
  if (!MOCK && !config.VISION_MODEL) {
    throw new Error("没有配置 VISION_MODEL：请在 .env 里填你账号可用的视觉模型名，或者保持 MOCK=true");
  }

  const messages = buildMessages(prompt, base64, mime, detail);
  const ms = timeoutMs || config.TIMEOUT;

  if (MOCK) {
    const fake = await withTimeout(mockChatCompletion({ messages: messages, mockScenario: scenario }), ms);
    return pickAnswer(fake);
  }

  const res = await fetch(config.BASE_URL + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.API_KEY,
    },
    body: JSON.stringify({ model: config.VISION_MODEL, messages: messages }),
    signal: AbortSignal.timeout(ms),
  });

  const raw = await res.text();

  if (!res.ok) {
    const err = new Error("接口返回 HTTP " + res.status + "：" + raw.slice(0, 300));
    err.status = res.status;
    err.raw = raw;
    throw err;
  }

  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const err = new Error("接口返回的不是 JSON，前 200 个字符是：" + raw.slice(0, 200));
    err.name = "BadJsonError";
    err.status = res.status;
    throw err;
  }

  return pickAnswer(data);
}

module.exports = { analyzeImage, toDataUrl, buildMessages, withTimeout, pickAnswer };
