import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { serverConnection } from './connection';
import { RaydiumErrorCode } from './types';

// Rate limiting configuration
const RATE_LIMIT = {
  windowMs: 60000,
  maxRequests: 30,
} as const;

// Operation permissions
const PROTECTED_OPERATIONS = new Set([
  'swap',
  'addLiquidity',
  'removeLiquidity',
  'stake',
  'unstake',
]);

// Request tracking for rate limiting
const requestTracker = new Map<string, { count: number; timestamp: number }>();

class MiddlewareError extends Error {
  constructor(
    message: string,
    public readonly code: RaydiumErrorCode,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'MiddlewareError';
  }
}

async function validateRequest(request: NextRequest) {
  // Check environment configuration
  if (!process.env.SOLANA_PRIVATE_KEY) {
    throw new MiddlewareError(
      'Server configuration error: Missing private key',
      RaydiumErrorCode.INITIALIZATION_FAILED,
      500
    );
  }

  if (!process.env.NEXT_PUBLIC_RPC_URL) {
    throw new MiddlewareError(
      'Server configuration error: Missing RPC URL',
      RaydiumErrorCode.CONNECTION_ERROR,
      500
    );
  }

  // Extract operation from URL
  const url = new URL(request.url);
  const operation = url.pathname.split('/').pop();

  // Validate protected operations
  if (operation && PROTECTED_OPERATIONS.has(operation)) {
    const auth = request.headers.get('authorization');
    if (!auth) {
      throw new MiddlewareError(
        'Authorization required',
        RaydiumErrorCode.INVALID_PARAMETERS,
        401
      );
    }
    // Add additional auth validation here
  }

  return { operation };
}

async function checkRateLimit(request: NextRequest): Promise<void> {
  const clientIp = request.headers.get('x-forwarded-for') || 
                  request.headers.get('x-real-ip') || 
                  'unknown';
  const now = Date.now();

  const clientStats = requestTracker.get(clientIp) || { count: 0, timestamp: now };
  
  // Reset counter if window has passed
  if (now - clientStats.timestamp > RATE_LIMIT.windowMs) {
    clientStats.count = 0;
    clientStats.timestamp = now;
  }

  // Check rate limit
  if (clientStats.count >= RATE_LIMIT.maxRequests) {
    throw new MiddlewareError(
      'Rate limit exceeded',
      RaydiumErrorCode.INVALID_PARAMETERS,
      429
    );
  }

  // Update tracker
  clientStats.count++;
  requestTracker.set(clientIp, clientStats);
}

async function initializeConnection() {
  try {
    const connection = serverConnection();
    await connection.getConnection();
  } catch (error) {
    throw new MiddlewareError(
      'Failed to initialize Raydium connection',
      RaydiumErrorCode.CONNECTION_ERROR,
      500
    );
  }
}

export async function middleware(request: NextRequest) {
  try {
    // Validate request and check rate limit
    await Promise.all([
      validateRequest(request),
      checkRateLimit(request),
    ]);

    // Initialize connection only for non-OPTIONS requests
    if (request.method !== 'OPTIONS') {
      await initializeConnection();
    }

    // All checks passed
    return NextResponse.next();
  } catch (error) {
    // Handle known errors
    if (error instanceof MiddlewareError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.statusCode }
      );
    }

    // Handle unknown errors
    console.error('Middleware error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: RaydiumErrorCode.UNKNOWN,
      },
      { status: 500 }
    );
  }
}

// Middleware configuration
export const config = {
  matcher: [
    '/api/raydium/:path*',
    '/api/wallet/:path*',
  ],
};

// Export types for use in API routes
export type { MiddlewareError };
