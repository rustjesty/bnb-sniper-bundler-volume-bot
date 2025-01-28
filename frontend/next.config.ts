// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
  },
  webpack: (config: any) => {
    config.resolve = {
      ...config.resolve,
      fallback: {
        fs: false,
        os: false,
        path: false,
        crypto: false,
      }
    };
    return config;
  }
};

export default nextConfig;