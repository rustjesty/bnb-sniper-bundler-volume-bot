// src/tools/geckoterminal/marketDataHandler.ts

import { geckoTerminalAPI, TokenData, PoolData, OHLCVData } from './index';
import logger from '@/utils/logger';

export interface MarketMetrics {
  volatility: number;
  volumeRank: number;
  liquidityScore: number;
  priceScore: number;
  rsi: number;
  trendStrength: number;
}

export interface MarketAnalysis {
  token: TokenData;
  topPools: PoolData[];
  priceHistory: OHLCVData[];
  metrics: MarketMetrics;
}

export class MarketDataHandler {
  /**
   * Get token market analysis data with calculations
   */
  public static async getTokenAnalysis(tokenAddress: string): Promise<MarketAnalysis | null> {
    try {
      // Fetch data in parallel
      const [token, pools, priceHistory] = await Promise.all([
        geckoTerminalAPI.getTokenData(tokenAddress),
        geckoTerminalAPI.getTokenPools(tokenAddress, 5),
        this.getTokenPriceHistory(tokenAddress)
      ]);

      if (!token) {
        return null;
      }

      const metrics = this.calculateMarketMetrics(priceHistory, pools);

      return {
        token,
        topPools: pools,
        priceHistory,
        metrics
      };
    } catch (error) {
      logger.error('Error analyzing token:', error);
      return null;
    }
  }

  /**
   * Get multi-timeframe price history
   */
  private static async getTokenPriceHistory(
    tokenAddress: string,
    timeframes: ('1h' | '4h' | '12h' | '1d')[] = ['1d']
  ): Promise<OHLCVData[]> {
    try {
      // Get primary pool first
      const pools = await geckoTerminalAPI.getTokenPools(tokenAddress, 1);
      if (!pools.length) {
        return [];
      }

      // Fetch price history for each timeframe
      const histories = await Promise.all(
        timeframes.map(timeframe => 
          geckoTerminalAPI.getPoolOHLCV(pools[0].address, timeframe)
        )
      );

      // Combine and sort
      return histories
        .flat()
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      logger.error('Error fetching price history:', error);
      return [];
    }
  }

  /**
   * Calculate comprehensive market metrics
   */
  private static calculateMarketMetrics(
    priceHistory: OHLCVData[],
    pools: PoolData[]
  ): MarketMetrics {
    // Calculate volatility
    const returns = priceHistory.map((candle, i) => {
      if (i === 0) return 0;
      return (candle.close - priceHistory[i - 1].close) / priceHistory[i - 1].close;
    });
    const volatility = this.calculateVolatility(returns);

    // Calculate RSI
    const rsi = this.calculateRSI(priceHistory.map(c => c.close));

    // Calculate trend strength
    const trendStrength = this.calculateTrendStrength(priceHistory);

    // Calculate volume rank
    const totalVolume = pools.reduce((sum, pool) => sum + pool.volume_24h, 0);
    const volumeRank = Math.min(100, (totalVolume / 1_000_000) * 10);

    // Calculate liquidity score
    const totalLiquidity = pools.reduce((sum, pool) => sum + pool.liquidity_usd, 0);
    const liquidityScore = Math.min(100, (totalLiquidity / 1_000_000) * 10);

    // Calculate price score based on multiple factors
    const priceScore = this.calculatePriceScore(priceHistory);

    return {
      volatility,
      volumeRank,
      liquidityScore,
      priceScore,
      rsi,
      trendStrength
    };
  }

  /**
   * Calculate price volatility
   */
  private static calculateVolatility(returns: number[]): number {
    const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
    const squaredDiffs = returns.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  private static calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) {
      return 50; // Default neutral value
    }

    const changes = prices.slice(1).map((price, i) => price - prices[i]);
    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? -change : 0);

    const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain) / period;
    const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss) / period;

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate trend strength using moving averages
   */
  private static calculateTrendStrength(priceHistory: OHLCVData[]): number {
    if (priceHistory.length < 20) {
      return 50; // Default neutral value
    }

    const prices = priceHistory.map(c => c.close);
    const ma20 = this.calculateMA(prices, 20);
    const ma50 = this.calculateMA(prices, 50);

    // Compare current MA values
    const currentMA20 = ma20[ma20.length - 1];
    const currentMA50 = ma50[ma50.length - 1];
    const currentPrice = prices[prices.length - 1];

    // Calculate trend strength based on MA relationships
    let strength = 50;

    if (currentPrice > currentMA20 && currentMA20 > currentMA50) {
      strength += 25; // Strong uptrend
    } else if (currentPrice < currentMA20 && currentMA20 < currentMA50) {
      strength -= 25; // Strong downtrend
    }

    // Add momentum factor
    const momentum = (currentPrice - prices[prices.length - 10]) / prices[prices.length - 10];
    strength += momentum * 100;

    // Normalize to 0-100 range
    return Math.max(0, Math.min(100, strength));
  }

  /**
   * Calculate Moving Average
   */
  private static calculateMA(prices: number[], period: number): number[] {
    const mas: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
      mas.push(sum / period);
    }
    return mas;
  }

  /**
   * Calculate price score based on multiple factors
   */
  private static calculatePriceScore(priceHistory: OHLCVData[]): number {
    if (priceHistory.length < 2) {
      return 50;
    }

    // Recent price change
    const recentPrice = priceHistory[priceHistory.length - 1].close;
    const previousPrice = priceHistory[priceHistory.length - 2].close;
    const shortTermChange = (recentPrice - previousPrice) / previousPrice;

    // Volume trend
    const recentVolume = priceHistory[priceHistory.length - 1].volume;
    const avgVolume = priceHistory.reduce((sum, candle) => sum + candle.volume, 0) / priceHistory.length;
    const volumeTrend = recentVolume / avgVolume;

    // Price momentum
    const weekAgoIndex = Math.max(0, priceHistory.length - 7);
    const weekAgoPrice = priceHistory[weekAgoIndex].close;
    const mediumTermChange = (recentPrice - weekAgoPrice) / weekAgoPrice;

    // Combine factors with weights
    const score = (
      shortTermChange * 0.4 +
      (volumeTrend - 1) * 0.3 +
      mediumTermChange * 0.3
    ) * 100;

    // Normalize to 0-100 range
    return Math.max(0, Math.min(100, score + 50));
  }

  /**
   * Get trending tokens with full analysis
   */
  public static async getTrendingTokensAnalysis(limit: number = 5): Promise<MarketAnalysis[]> {
    try {
      const trendingTokens = await geckoTerminalAPI.getTrendingTokens(limit);
      const analyses = await Promise.all(
        trendingTokens.map(token => this.getTokenAnalysis(token.address))
      );

      return analyses.filter((analysis): analysis is MarketAnalysis => analysis !== null);
    } catch (error) {
      logger.error('Error fetching trending tokens analysis:', error);
      return [];
    }
  }
}