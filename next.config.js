// next.config.js
const nextConfig = {
  allowedDevOrigins: ['192.168.2.59'],
  async headers() {
    return [
      {
        source: '/login/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
};

export default nextConfig;
