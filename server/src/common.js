'use strict';

const { DateTime } = require('luxon');

const TZ = 'Asia/Shanghai';

/* 数值型配置先过安全整数校验：端口、连接数传脏值要在启动前暴露。 */
function toSafeInt(v, dflt, name) {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`配置 ${name} 不是安全整数: ${v}`);
  }
  return n;
}

/* 日志与状态记录锁死上海时区：跨时区部署也能直接对照，不用心算换算。 */
function formatLocalDateTime(d) {
  return DateTime.fromMillis(d.getTime(), { zone: TZ }).toFormat('yyyy-LL-dd HH:mm:ss');
}

module.exports = { toSafeInt, formatLocalDateTime };
