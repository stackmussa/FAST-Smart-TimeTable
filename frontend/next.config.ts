import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['192.168.18.82:3000', '192.168.18.82'],
};

export default nextConfig;
