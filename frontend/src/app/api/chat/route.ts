import { streamCompletion } from '@/utils/groq';
import logger from '@/utils/logger';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateEnvironment } from '@/lib/validation';
import { PublicKey } from '@solana/web3.js';

// Type definitions
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  message: string;
  history?: Message[];
  publicKey?: string;
  poolId?: string;
}

interface RateLimitEntry {
  count: number;
  timestamp: number;
}

// Constants
const RATE_LIMIT = {
  WINDOW_MS: 60000,
  MAX_REQUESTS: 20,
  CLEANUP_INTERVAL: 300000 // 5 minutes
} as const;

// Rate limiting store with proper typing
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old rate limit entries
const cleanup = () => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now - value.timestamp > RATE_LIMIT.WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
};

// Set up periodic cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(cleanup, RATE_LIMIT.CLEANUP_INTERVAL);
}

// Validation functions
const isRateLimited = (ip: string): boolean => {
  const now = Date.now();
  const userRateLimit = rateLimitStore.get(ip);

  if (!userRateLimit) {
    rateLimitStore.set(ip, { count: 1, timestamp: now });
    return false;
  }

  if (now - userRateLimit.timestamp > RATE_LIMIT.WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, timestamp: now });
    return false;
  }

  if (userRateLimit.count >= RATE_LIMIT.MAX_REQUESTS) {
    return true;
  }

  userRateLimit.count++;
  return false;
};

const validatePublicKey = (key: string): boolean => {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
};

const validatePoolId = (poolId: string): boolean => {
  if (!poolId || typeof poolId !== 'string') return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(poolId);
};

const validateApiKey = (request: NextRequest): string | null => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    if (!token) return null;

    // Check if token is in valid format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(token)) return null;

    return token;
  } catch {
    return null;
  }
};

const validateRequest = (body: ChatRequest): string | null => {
  if (!body.message?.trim()) {
    return 'Message is required';
  }

  if (body.publicKey && !validatePublicKey(body.publicKey)) {
    return 'Invalid public key format';
  }

  if (body.poolId && !validatePoolId(body.poolId)) {
    return 'Invalid pool ID format';
  }

  if (body.history && !Array.isArray(body.history)) {
    return 'History must be an array';
  }

  return null;
};

export async function POST(request: NextRequest) {
  try {
    // Validate environment
    validateEnvironment();

    // Get client IP and check rate limit
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Validate API key
    const apiKey = validateApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    let body: ChatRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const validationError = validateRequest(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    // Prepare messages array
    const messages: Message[] = [
      ...(body.history || []),
      { role: 'user', content: body.message }
    ];

    // Get streaming response
    const chunks: string[] = [];
    await streamCompletion(
      messages,
      (chunk) => chunks.push(chunk),
      apiKey
    );

    // Return combined response
    return NextResponse.json({
      response: chunks.join(''),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Chat API error:', error);

    // Handle specific errors
    if (error instanceof Error) {
      const errorMessages = {
        'Non-base58 character': { message: 'Invalid base58 format', status: 400 },
        'Rate limit exceeded': { message: 'Too many requests', status: 429 },
        'Invalid API key': { message: 'Authentication failed', status: 401 },
        'Network error': { message: 'Service unavailable', status: 503 }
      };

      for (const [key, value] of Object.entries(errorMessages)) {
        if (error.message.includes(key)) {
          return NextResponse.json(
            { error: value.message },
            { status: value.status }
          );
        }
      }
    }

    // Generic error response
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// CORS handling
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}