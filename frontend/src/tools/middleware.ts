// src/app/api/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Make middleware both exportable and a middleware function
export async function middleware(request: NextRequest | Request) {
  // Check environment variables
  if (!process.env.SOLANA_PRIVATE_KEY) {
    return NextResponse.json(
      { error: 'Server configuration error: Missing private key' },
      { status: 500 }
    );
  }

  if (!process.env.NEXT_PUBLIC_RPC_URL) {
    return NextResponse.json(
      { error: 'Server configuration error: Missing RPC URL' },
      { status: 500 }
    );
  }

  // If all checks pass
  return NextResponse.json({ success: true }, { status: 200 });
}

// Config for Next.js middleware
export const config = {
  matcher: '/api/raydium/:path*',
};