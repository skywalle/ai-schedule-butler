'use strict';

const { ping } = require('../db');
const { loadState, upsertState } = require('../repo/state');
const { formatLocalDateTime } = require('../common');

/* 校验不通过返回错误文案而不是抛异常：字段名带下标，前端能直接定位。 */
function checkState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return 'state 缺失或不是对象';
  }
  if (!Array.isArray(state.items)) return 'state.items 必须是数组';
  if (state.items.length > 5000) return 'state.items 超出上限 5000';
  for (let i = 0; i < state.items.length; i++) {
    const it = state.items[i];
    if (!it || typeof it !== 'object') return `state.items[${i}] 不是对象`;
    if (typeof it.t !== 'string' || !it.t.trim()) return `state.items[${i}].t 为空`;
    if (!Number.isSafeInteger(it.id)) return `state.items[${i}].id 不是安全整数`;
  }
  return null;
}

module.exports = async function routeState(app) {
  app.get('/api/health', async () => {
    await ping();
    return { ok: true, time: formatLocalDateTime(new Date()) };
  });

  app.get('/api/state', async () => {
    const state = await loadState();
    return { state };
  });

  app.put('/api/state', async (req, reply) => {
    const err = checkState(req.body && req.body.state);
    if (err) return reply.code(400).send({ error: err });
    await upsertState(req.body.state);
    return { ok: true };
  });
};
