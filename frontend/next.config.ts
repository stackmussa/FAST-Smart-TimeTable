import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'FAST-Smart-TimeTable';
const basePath = isProd ? `/${repoName}` : '';

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['192.168.18.82:3000', '192.168.18.82'],
  output: 'export',
  basePath: basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
