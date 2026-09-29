import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// React Compiler 默认关闭（实验特性，06 §1.1）；REACT_COMPILER=1 时开启
const enableCompiler = process.env.REACT_COMPILER === '1';

export default defineConfig({
  plugins: [react({ compiler: enableCompiler }), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@blocksuite/affine'] }, // 源码消费，不预打包（05 §2.1；T0.2 后生效）
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
      '/ws': { target: 'ws://localhost:3001', ws: true, changeOrigin: false }, // Phase 2（09）
    },
  },
});
