// src/app/api/raydium/route.ts
import { NextResponse } from 'next/server';

import { initializeConnection } from '../../../tools/raydium/config';
import { middleware } from '../../../tools/middleware';

// Enable edge runtime and dynamic behavior
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Apply middleware before handling request
export async function GET(request: Request) {
  try {
    // Run middleware first
    const middlewareResponse = await middleware(request);
    if (middlewareResponse.status !== 200) {
      return middlewareResponse;
    }

    // Initialize Raydium connection
    const { connection, owner, network } = await initializeConnection();
    
    // Test the connection
    const balance = await connection.getBalance(owner.publicKey);
    
    return new Response(JSON.stringify({
      success: true,
      balance: balance / 1e9,
      network,
      publicKey: owner.publicKey.toString()
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('API route error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}