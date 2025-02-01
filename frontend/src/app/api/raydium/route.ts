// src/app/api/raydium/route.ts
import { NextResponse } from 'next/server';

const RAYDIUM_API_V3_BASE = 'https://api-v3.raydium.io';

// Types based on Raydium V3 API
interface RaydiumResponse<T> {
  id: string;
  success: boolean;
  data?: T;
  msg?: string;
}

interface MainInfo {
  tvl: number;
  volume24: number;
}

interface PoolConfig {
  id: string;
  index: number;
  protocolFeeRate: number;
  tradeFeeRate: number;
  fundFeeRate: number;
}

// Fetch wrapper with Raydium response structure
async function fetchRaydium<T>(endpoint: string): Promise<RaydiumResponse<T>> {
  try {
    const response = await fetch(`${RAYDIUM_API_V3_BASE}${endpoint}`);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      id: Date.now().toString(),
      success: false,
      msg: error.message || 'Failed to fetch from Raydium API'
    };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    
    // Handle different endpoints
    switch (endpoint) {
      case 'info':
        const info = await fetchRaydium<MainInfo>('/main/info');
        return NextResponse.json(info);

      case 'pools':
        const queryParams = new URLSearchParams({
          poolType: searchParams.get('poolType') || 'all',
          poolSortField: searchParams.get('sortField') || 'default',
          sortType: searchParams.get('sortType') || 'desc',
          pageSize: searchParams.get('pageSize') || '10',
          page: searchParams.get('page') || '1'
        });
        
        const pools = await fetchRaydium(`/pools/info/list?${queryParams}`);
        return NextResponse.json(pools);

      case 'clmm-config':
        const clmmConfig = await fetchRaydium('/main/clmm-config');
        return NextResponse.json(clmmConfig);

      case 'version':
        const version = await fetchRaydium('/main/version');
        return NextResponse.json(version);

      case 'chain-time':
        const chainTime = await fetchRaydium('/main/chain-time');
        return NextResponse.json(chainTime);

      default:
        // Default to status check
        return NextResponse.json({
          id: Date.now().toString(),
          success: true,
          data: {
            status: 'operational',
            endpoints: [
              'info',
              'pools',
              'clmm-config',
              'version',
              'chain-time'
            ],
            timestamp: new Date().toISOString()
          }
        });
    }
  } catch (error: any) {
    return NextResponse.json({
      id: Date.now().toString(),
      success: false,
      msg: error.message || 'Internal server error'
    }, { 
      status: 500 
    });
  }
}

// CORS support
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}