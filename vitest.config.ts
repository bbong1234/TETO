import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // 纯逻辑测试，无需浏览器环境
    environment: 'node',
    // Next.js 路径别名映射
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // 排除集成测试和 eval
    exclude: [
      'node_modules/**',
      'eval/**',
      'test/**',
      '.next/**',
    ],
    // 测试文件模式
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
