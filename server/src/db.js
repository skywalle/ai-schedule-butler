'use strict';

const mysql = require('mysql2/promise');
const { getDbConfig } = require('./config');

let pool = null;

/* 连接池做成模块级单例：路由与仓储共用，避免每请求新建连接拖垮库。 */
function getPool() {
  if (!pool) {
    const cfg = getDbConfig();
    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      connectionLimit: cfg.connectionLimit,
      waitForConnections: true,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

/* 建表幂等：首次启动或库被清空时都能自愈，不用手工执行 SQL。 */
async function initSchema() {
  const sql = `
    CREATE TABLE IF NOT EXISTS todo_state (
      id BIGINT PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  await getPool().query(sql);
}

async function ping() {
  await getPool().query('SELECT 1');
}

module.exports = { getPool, initSchema, ping };
