import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    /* 监听 0.0.0.0：局域网其他设备可直接访问 dev 服务器。 */
    host: true,
    /* 开发模式把 /api 转给 Fastify，前端不用处理跨域。 */
    proxy: { '/api': 'http://localhost:8787' },
  },
})
