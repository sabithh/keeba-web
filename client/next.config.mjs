/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/apple-touch-icon.png',
        destination: '/app-icon/180',
      },
      {
        source: '/apple-touch-icon-152x152.png',
        destination: '/app-icon/180',
      },
      {
        source: '/apple-touch-icon-180x180.png',
        destination: '/app-icon/180',
      },
    ];
  },
};

export default nextConfig;
