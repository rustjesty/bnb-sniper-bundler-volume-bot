// src/tools/geckoterminal/index.ts

import axios from 'axios';
import logger from '@/utils/logger';

// Constants
const BASE_URL = 'https://api.geckoterminal.com/api/v2';
const SOLANA_NETWORK_ID = 'solana';

// Types
export interface TokenData {
  id: string;
  address: string;
  name: string;
  symbol: string;
  price_usd: number;
  volume_24h: number;
  price_change_24h: number;
  market_cap: number;
  pools: PoolData[];
}

export interface PoolData {
  id: string;
  address: string;
  name: string;
  dex: string;
  base_token_price_usd: number;
  quote_token_price_usd: number;
  volume_24h: number;
  liquidity_usd: number;
}

export interface OHLCVData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NetworksResponse {
  data: Array<{
    id: string;
    type: string;
    attributes: {
      name: string;
      chain_id: number;
    };
  }>;
}

// Main GeckoTerminal API class
export class GeckoTerminalAPI {
  private static instance: GeckoTerminalAPI;
  private readonly baseURL: string;
  private rateLimitRemaining: number = 100;
  private rateLimitReset: number = 0;

  private constructor() {
    this.baseURL = BASE_URL;
  }

  public static getInstance(): GeckoTerminalAPI {
    if (!GeckoTerminalAPI.instance) {
      GeckoTerminalAPI.instance = new GeckoTerminalAPI();
    }
    return GeckoTerminalAPI.instance;
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    try {
      // Check rate limit
      if (this.rateLimitRemaining <= 0 && Date.now() < this.rateLimitReset) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        params,
        headers: {
          'Accept': 'application/json'
        }
      });

      // Update rate limit info from headers
      this.rateLimitRemaining = Number(response.headers['x-ratelimit-remaining'] || 100);
      this.rateLimitReset = Number(response.headers['x-ratelimit-reset'] || 0) * 1000;

      return response.data as T;
    } catch (error) {
      logger.error('GeckoTerminal API error:', error);
      throw error;
    }
  }

  /**
   * Get token data by address
   */
  public async getTokenData(tokenAddress: string): Promise<TokenData | null> {
    try {
      const response = await this.makeRequest<any>(
        `/networks/${SOLANA_NETWORK_ID}/tokens/${tokenAddress}`
      );

      if (!response.data) {
        return null;
      }

      const { attributes } = response.data;
      return {
        id: response.data.id,
        address: tokenAddress,
        name: attributes.name,
        symbol: attributes.symbol,
        price_usd: attributes.price_usd || 0,
        volume_24h: attributes.volume_24h || 0,
        price_change_24h: attributes.price_change_24h || 0,
        market_cap: attributes.market_cap || 0,
        pools: attributes.pools || []
      };
    } catch (error) {
      logger.error('Error fetching token data:', error);
      return null;
    }
  }

  /**
   * Get top pools for a token
   */
  public async getTokenPools(tokenAddress: string, limit: number = 10): Promise<PoolData[]> {
    try {
      const response = await this.makeRequest<any>(
        `/networks/${SOLANA_NETWORK_ID}/tokens/${tokenAddress}/pools`,
        { page: 1, limit }
      );

      return response.data.map((pool: any) => ({
        id: pool.id,
        address: pool.attributes.address,
        name: pool.attributes.name,
        dex: pool.attributes.dex,
        base_token_price_usd: pool.attributes.base_token_price_usd || 0,
        quote_token_price_usd: pool.attributes.quote_token_price_usd || 0,
        volume_24h: pool.attributes.volume_24h || 0,
        liquidity_usd: pool.attributes.liquidity_usd || 0
      }));
    } catch (error) {
      logger.error('Error fetching token pools:', error);
      return [];
    }
  }

  /**
   * Get OHLCV data for a pool
   */
  public async getPoolOHLCV(
    poolAddress: string, 
    timeframe: '1h' | '4h' | '12h' | '1d' = '1d',
    limit: number = 100
  ): Promise<OHLCVData[]> {
    try {
      const response = await this.makeRequest<any>(
        `/networks/${SOLANA_NETWORK_ID}/pools/${poolAddress}/ohlcv/${timeframe}`,
        { limit }
      );

      return response.data.map((candle: any) => ({
        timestamp: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
    } catch (error) {
      logger.error('Error fetching OHLCV data:', error);
      return [];
    }
  }

  /**
   * Get trending tokens on Solana
   */
  public async getTrendingTokens(limit: number = 10): Promise<TokenData[]> {
    try {
      const response = await this.makeRequest<any>(
        `/networks/${SOLANA_NETWORK_ID}/trending`,
        { limit }
      );

      return response.data.map((token: any) => ({
        id: token.id,
        address: token.attributes.address,
        name: token.attributes.name,
        symbol: token.attributes.symbol,
        price_usd: token.attributes.price_usd || 0,
        volume_24h: token.attributes.volume_24h || 0,
        price_change_24h: token.attributes.price_change_24h || 0,
        market_cap: token.attributes.market_cap || 0,
        pools: token.attributes.pools || []
      }));
    } catch (error) {
      logger.error('Error fetching trending tokens:', error);
      return [];
    }
  }

  /**
   * Get supported networks
   */
  public async getNetworks(): Promise<NetworksResponse> {
    return this.makeRequest<NetworksResponse>('/networks');
  }
}

// Export singleton instance
export const geckoTerminalAPI = GeckoTerminalAPI.getInstance();