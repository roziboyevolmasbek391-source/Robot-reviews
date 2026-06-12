import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["recharts"],
  allowedDevOrigins: ["192.168.74.138", "192.168.74.130"],
};

export default nextConfig;

