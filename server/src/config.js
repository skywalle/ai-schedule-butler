'use strict';

const { toSafeInt } = require('./common');

/* 配置统一走环境变量：本地默认值保证开箱即用，部署时按需覆盖。 */
function getServerConfig() {
  return {
    host: process.env.SERVER_HOST || '0.0.0.0',
    port: toSafeInt(process.env.SERVER_PORT, 8787, 'SERVER_PORT'),
  };
}

function getDbConfig() {
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: toSafeInt(process.env.MYSQL_PORT, 3306, 'MYSQL_PORT'),
    user: process.env.MYSQL_USER || 'todo',
    password: process.env.MYSQL_PASSWORD || 'todo_day',
    database: process.env.MYSQL_DATABASE || 'todo_day',
    connectionLimit: toSafeInt(process.env.MYSQL_CONNECTION_LIMIT, 5, 'MYSQL_CONNECTION_LIMIT'),
  };
}

module.exports = { getServerConfig, getDbConfig };
