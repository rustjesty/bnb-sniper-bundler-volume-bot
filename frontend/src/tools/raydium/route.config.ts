// src/app/api/raydium/route.config.ts

import { getServerEnv } from '@/lib/env';

export const runtime = 'edge'; // Use Edge Runtime
export const dynamic = 'force-dynamic'; // No caching

export function createRouteHandler() {
  const env = getServerEnv();
  return {
    env,
    // Add other route configuration here
  };
}