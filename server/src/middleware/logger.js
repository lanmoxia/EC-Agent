"use strict";

function pad(n) { return String(n).padStart(2, "0"); }

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function logger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const code = res.statusCode;
    const color = code >= 500 ? "\x1b[31m" : code >= 400 ? "\x1b[33m" : "\x1b[32m";
    console.log(`${timestamp()} ${color}${code}\x1b[0m ${req.method} ${req.originalUrl} ${ms}ms`);
  });
  next();
}

module.exports = logger;
