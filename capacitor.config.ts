import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android 壳应用加载线上 TETO 站点（Next.js API 在服务端，不能纯离线打包）。
 * 构建前设置环境变量 CAPACITOR_SERVER_URL，例如：
 *   https://your-app.vercel.app
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.replace(/\/$/, '');

const config: CapacitorConfig = {
  appId: 'com.teto.app',
  appName: 'TETO',
  webDir: 'public',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          androidScheme: 'https',
          cleartext: serverUrl.startsWith('http://'),
        },
      }
    : {}),
  android: {
    allowMixedContent: false,
  },
};

export default config;
