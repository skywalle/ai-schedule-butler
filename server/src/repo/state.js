'use strict';

const { getPool } = require('../db');

/* 全站只有一行状态（id 固定 1）：与前端整体替换的同步模型一一对应。 */
const STATE_ID = 1;

async function loadState() {
  const [rows] = await getPool().query(
    'SELECT payload FROM todo_state WHERE id = ?',
    [STATE_ID]
  );
  if (!rows.length) return null;
  const payload = rows[0].payload;
  return typeof payload === 'string' ? JSON.parse(payload) : payload;
}

/* upsert 单条语句原子完成：并发保存不会互相覆盖出脏行。 */
async function upsertState(state) {
  const payload = JSON.stringify(state);
  await getPool().query(
    'INSERT INTO todo_state (id, payload) VALUES (?, ?) ' +
    'ON DUPLICATE KEY UPDATE payload = VALUES(payload)',
    [STATE_ID, payload]
  );
  return state;
}

module.exports = { loadState, upsertState };
