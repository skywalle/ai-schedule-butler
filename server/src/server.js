'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const { getServerConfig } = require('./config');
const { initSchema } = require('./db');
const routeState = require('./route/state');

async function main() {
  const cfg = getServerConfig();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

  /* 数据库不可用就拒绝启动：持久化是全栈化的核心，静默降级会丢数据。 */
  await initSchema();
  await app.register(routeState);

  /* 生产模式一个进程同时供 API 与页面：存在 dist 就托管前端产物。 */
  const dist = path.resolve(__dirname, '../../dist');
  if (fs.existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && req.raw.url.startsWith('/api/')) {
        return reply.code(404).send({ error: '接口不存在: ' + req.raw.url });
      }
      return reply.sendFile('index.html');
    });
  }

  await app.listen({ port: cfg.port, host: cfg.host });
}

main().catch((e) => {
  console.error('[server] 启动失败:', e.message);
  process.exit(1);
});
