// src/app/api/token/[ticker]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const COMMON_TOKENS = {
  'USDC': {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
  },
  'SOL': {
    address: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    symbol: 'SOL',
    name: 'Solana',
  },
  'JENNA': {
    address: '8hVzPgFopqEQmNNoghr5WbPY1LEjW8GzgbLRwuwHpump',
    decimals: 9,
    symbol: 'JENNA',
    name: 'JENNA Token',
  }
} as const;

// Proper type definition for context
type Context = {
  params: {
    ticker: string;
  };
};

export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const ticker = context.params.ticker.toUpperCase();

    // Input validation
    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    // Check if token exists in common tokens
    const tokenData = COMMON_TOKENS[ticker as keyof typeof COMMON_TOKENS];
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      tokenData: {
        ...tokenData,
        price: 0,
        volume24h: 0,
        marketCap: 0,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Token data error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Failed to fetch token data',
        code: error.code || 'UNKNOWN_ERROR'
      },
      { status: 500 }
    );
  }
}

// Search endpoint
export async function POST(request: NextRequest) {
  try {
    const { search } = await request.json();

    if (!search) {
      return NextResponse.json(
        { error: 'Search term is required' },
        { status: 400 }
      );
    }

    const searchTerm = search.toUpperCase();
    const results = Object.entries(COMMON_TOKENS)
      .filter(([symbol]) => symbol.includes(searchTerm))
      .map(([_, data]) => data);

    return NextResponse.json({
      status: 'success',
      results
    });

  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Search failed',
        code: error.code || 'UNKNOWN_ERROR'
      },
      { status: 500 }
    );
  }
}