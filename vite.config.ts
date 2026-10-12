import { defineConfig } from 'vite';

// 开发服务器对所有网卡开放，方便手机连同一局域网直接访问调试
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173
  },
  build: {
    // Phaser 单包较大，放宽告警阈值，不影响功能
    chunkSizeWarningLimit: 2000,
    target: 'es2020'
  }
});
