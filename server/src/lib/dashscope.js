"use strict";

const https = require("https");
const http = require("http");
const config = require("../config");

/**
 * 向 DashScope chat/completions 发送请求，返回模型回复文本。
 * @param {object[]} contentItems  messages[0].content 数组，每项为 {type, ...}
 * @param {object}   [opts]
 * @param {number}   [opts.maxTokens=4000]
 * @returns {Promise<string>}
 */
function callDashScope(contentItems, opts = {}) {
  const { apiKey, baseUrl, model } = config.dashscope;
  const maxTokens = opts.maxTokens || 4000;

  const payload = JSON.stringify({
    model,
    messages: [{ role: "user", content: contentItems }],
    stream: false,
    max_tokens: maxTokens,
  });

  const url = new URL(baseUrl.replace(/\/?$/, "/") + "chat/completions");
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`DashScope API ${res.statusCode}: ${data.slice(0, 500)}`));
        }
        try {
          resolve(JSON.parse(data)?.choices?.[0]?.message?.content || data);
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { callDashScope };
