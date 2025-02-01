// src/app/api/raydium/amm/swap/route.ts
//import { getServerSideRaydium } from '@/tools/raydium/server-config';
import { swap } from '@/tools/raydium/amm/swap';
import { getServerSideRaydium } from '../config';

export async function POST(req: Request) {
  try {
    const { connection, owner } = getServerSideRaydium();
    const params = await req.json();
    
    const result = await swap();
    return Response.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return Response.json({ error: errorMessage }, { status: 500 });  
  }
}