// src/app/api/wallet/init/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { parsePrivateKey } from '@/utils/keys';

// Error Types
enum RaydiumErrorCode {
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

interface RaydiumErrorData {
  name: string;
  message: string;
  code: RaydiumErrorCode;
  details?: any;
}

class RaydiumError extends Error {
  name: string;
  code: RaydiumErrorCode;
  details?: any;

  constructor({ name, message, code, details }: RaydiumErrorData) {
    super(message);
    this.name = name;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details
    };
  }

  static create(data: RaydiumErrorData): RaydiumError {
    return new RaydiumError(data);
  }
}

// Rate limiting
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 10;
const requests = new Map<string, number[]>();

// Environment validation
function validateEnvironment() {
  const requiredEnvVars = [
    'SOLANA_PRIVATE_KEY',
    'NEXT_PUBLIC_RPC_URL',
    'NEXT_PUBLIC_NETWORK'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw RaydiumError.create({
      name: 'EnvironmentError',
      message: `Missing environment variables: ${missing.join(', ')}`,
      code: RaydiumErrorCode.VALIDATION_ERROR
    });
  }
}

// Security middleware
async function validateRequest(req: NextRequest): Promise<void> {
  // Check method
  if (req.method !== 'GET') {
    throw RaydiumError.create({
      name: 'ValidationError',
      message: 'Only GET method is allowed',
      code: RaydiumErrorCode.VALIDATION_ERROR
    });
  }

  // Rate limiting
  const ip = req.headers.get('x-forwarded-for') || 
             req.headers.get('x-real-ip') || 
             'unknown';

  if (ip !== 'unknown') {
    const now = Date.now();
    const clientRequests = requests.get(ip) || [];
    const recentRequests = clientRequests.filter(time => now - time < RATE_LIMIT_WINDOW);

    if (recentRequests.length >= MAX_REQUESTS) {
      throw RaydiumError.create({
        name: 'RateLimitError',
        message: 'Too many requests',
        code: RaydiumErrorCode.VALIDATION_ERROR
      });
    }

    requests.set(ip, [...recentRequests, now]);
  }
}

// Error status mapping
const ERROR_STATUS_MAP: Record<RaydiumErrorCode, number> = {
  [RaydiumErrorCode.INVALID_PARAMETERS]: 400,
  [RaydiumErrorCode.INITIALIZATION_FAILED]: 500,
  [RaydiumErrorCode.CONNECTION_ERROR]: 503,
  [RaydiumErrorCode.VALIDATION_ERROR]: 400
};

function getErrorStatus(code: RaydiumErrorCode): number {
  return ERROR_STATUS_MAP[code] || 500;
}

export async function GET(request: NextRequest) {
  try {
    // Validate environment
    validateEnvironment();

    // Validate request
    await validateRequest(request);

    // Process private key
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      throw RaydiumError.create({
        name: 'ConfigError',
        message: 'Missing SOLANA_PRIVATE_KEY',
        code: RaydiumErrorCode.VALIDATION_ERROR
      });
    }

    try {
      const secretKey = parsePrivateKey(privateKey);
      return NextResponse.json({
        status: 'success',
        data: {
          keypair: Array.from(secretKey),
          timestamp: Date.now(),
          network: process.env.NEXT_PUBLIC_NETWORK
        }
      });
    } catch (error) {
      throw RaydiumError.create({
        name: 'WalletError',
        message: 'Failed to process private key',
        code: RaydiumErrorCode.INVALID_PARAMETERS,
        details: error
      });
    }
  } catch (error) {
    const raydiumError = error instanceof RaydiumError
      ? error
      : RaydiumError.create({
          name: 'InitializationError',
          message: 'Wallet initialization failed',
          code: RaydiumErrorCode.INITIALIZATION_FAILED,
          details: error
        });

    return NextResponse.json(
      raydiumError.toJSON(),
      { status: getErrorStatus(raydiumError.code) }
    );
  }
}