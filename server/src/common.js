'use strict';

/* 数值型配置先过安全整数校验：端口、连接数传脏值要在启动前暴露。 */
function toSafeInt(v, dflt, name) {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`配置 ${name} 不是安全整数: ${v}`);
  }
  return n;
}

/* 日志与状态记录用本地时间，避免跨时区部署时对照困难。 */
function formatLocalDateTime(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

module.exports = { toSafeInt, formatLocalDateTime };
