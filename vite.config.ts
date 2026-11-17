import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    /* 开发模式把 /api 转给 Fastify，前端不用处理跨域。 */
    proxy: { '/api': 'http://localhost:8787' },
  },
})
