// src/app/api/raydium/operations/route.ts
//import { getServerSideRaydium } from '@/tools/raydium/server-config';

import { getServerSideRaydium } from "../serverConfig";

export async function POST(req: Request) {
  try {
    const { connection, owner } = getServerSideRaydium();
    // Handle Raydium operations here
    return Response.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}