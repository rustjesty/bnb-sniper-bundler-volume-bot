// src/tools/geckoterminal/marketData.ts


import logger from '@/utils/logger';
import { TokenData, PoolData, OHLCVData, geckoTerminalAPI } from '.';

export interface MarketAnalysis {
  token: TokenData;
  topPools: PoolData[];
  priceHistory: OHLCVData[];
  marketMetrics: {
    volatility: number;
    volumeRank: number;
    liquidityScore: number;
    priceScore: number;
  };
}

export class MarketDataHelper {
  /**
   * Get comprehensive market analysis for a token
   */
  public static async analyzeToken(tokenAddress: string): Promise<MarketAnalysis | null> {
    try {
      // Fetch all required data in parallel
      const [token, pools, priceHistory] = await Promise.all([
        geckoTerminalAPI.getTokenData(tokenAddress),
        geckoTerminalAPI.getTokenPools(tokenAddress, 5),
        this.getTokenPriceHistory(tokenAddress)
      ]);

      if (!token) {
        return null;
      }

      // Calculate market metrics
      const marketMetrics = this.calculateMarketMetrics(token, pools, priceHistory);

      return {
        token,
        topPools: pools,
        priceHistory,
        marketMetrics
      };
    } catch (error) {
      logger.error('Error analyzing token:', error);
      return null;
    }
  }

  /**
   * Get token price history across all pools
   */
  private static async getTokenPriceHistory(
    tokenAddress: string,
    timeframe: '1h' | '4h' | '12h' | '1d' = '1d'
  ): Promise<OHLCVData[]> {
    try {
      // Get top pool by volume
      const pools = await geckoTerminalAPI.getTokenPools(tokenAddress, 1);
      if (!pools.length) {
        return [];
      }

      // Get OHLCV data from the top pool
      return await geckoTerminalAPI.getPoolOHLCV(pools[0].address, timeframe);
    } catch (error) {
      logger.error('Error fetching price history:', error);
      return [];
    }
  }

  /**
   * Calculate market metrics for analysis
   */
  private static calculateMarketMetrics(
    token: TokenData,
    pools: PoolData[],
    priceHistory: OHLCVData[]
  ) {
    // Calculate volatility using standard deviation of returns
    const returns = priceHistory.map((candle, i) => {
      if (i === 0) return 0;
      return (candle.close - priceHistory[i - 1].close) / priceHistory[i - 1].close;
    });
    
    const volatility = this.calculateVolatility(returns);

    // Calculate volume rank (0-100)
    const totalVolume = pools.reduce((sum, pool) => sum + pool.volume_24h, 0);
    const volumeRank = Math.min(100, (totalVolume / 1000000) * 10); // Normalize to 0-100

    // Calculate liquidity score (0-100)
    const totalLiquidity = pools.reduce((sum, pool) => sum + pool.liquidity_usd, 0);
    const liquidityScore = Math.min(100, (totalLiquidity / 1000000) * 10); // Normalize to 0-100

    // Calculate price score based on trends
    const priceScore = this.calculatePriceScore(priceHistory);

    return {
      volatility,
      volumeRank,
      liquidityScore,
      priceScore
    };
  }

  /**
   * Calculate volatility using standard deviation
   */
  private static calculateVolatility(returns: number[]): number {
    const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
    const squaredDiffs = returns.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate price score based on trends (0-100)
   */
  private static calculatePriceScore(priceHistory: OHLCVData[]): number {
    if (priceHistory.length < 2) return 50;

    // Calculate short-term trend (last 24 hours)
    const recentPrice = priceHistory[priceHistory.length - 1].close;
    const previousPrice = priceHistory[priceHistory.length - 2].close;
    const shortTermChange = (recentPrice - previousPrice) / previousPrice;

    // Calculate medium-term trend (last 7 days if available)
    const weekAgoIndex = Math.max(0, priceHistory.length - 7);
    const weekAgoPrice = priceHistory[weekAgoIndex].close;
    const mediumTermChange = (recentPrice - weekAgoPrice) / weekAgoPrice;

    // Weight recent price action more heavily
    const score = (shortTermChange * 0.7 + mediumTermChange * 0.3) * 100;
    
    // Normalize to 0-100 range
    return Math.max(0, Math.min(100, score + 50));
  }

  /**
   * Get trending tokens with market analysis
   */
  public static async getTrendingTokensAnalysis(limit: number = 5): Promise<MarketAnalysis[]> {
    try {
      const trendingTokens = await geckoTerminalAPI.getTrendingTokens(limit);
      const analyses = await Promise.all(
        trendingTokens.map(token => this.analyzeToken(token.address))
      );

      return analyses.filter((analysis): analysis is MarketAnalysis => analysis !== null);
    } catch (error) {
      logger.error('Error fetching trending tokens analysis:', error);
      return [];
    }
  }
}