'use strict';

const { ping } = require('../db');
const { loadState, upsertState } = require('../repo/state');
const { checkState } = require('../repo/check-state');
const { formatLocalDateTime } = require('../common');

/* 校验不通过返回错误文案而不是抛异常：字段名带下标，前端能直接定位。 */

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
