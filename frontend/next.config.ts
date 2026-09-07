import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

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
  turbopack: {},
};

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === 'development',
  register: true,
  // skipWaiting + clientsClaim live inside workboxOptions for @ducanh2912/next-pwa.
  // skipWaiting: new SW activates immediately (no waiting for tabs to close).
  // clientsClaim: new SW takes control of all existing open tabs straight away.
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
});

export default withPWA(nextConfig);
