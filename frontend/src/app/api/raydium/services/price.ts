import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { RaydiumStateManager } from '../core/state';
import { DEFAULTS } from '../core/constants';
import { Decimal } from 'decimal.js';
import { ERRORS } from '../core/errors';

export interface TokenPriceInfo {
  price: number;
  volume24h: number;
  priceChange24h: number;
  liquidity: number;
}

export interface PriceRoute {
  poolId: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  price: number;
  impact: number;
  liquidity: number;
}

export class RaydiumPriceService {
  private stateManager: RaydiumStateManager;
  private priceCache: Map<string, TokenPriceInfo> = new Map();
  private lastCacheUpdate: number = 0;

  constructor(private connection: Connection) {
    this.stateManager = RaydiumStateManager.getInstance();
  }

  async getTokenPrice(mint: PublicKey): Promise<TokenPriceInfo> {
    await this.updatePriceCache();
    const cachedPrice = this.priceCache.get(mint.toBase58());
    
    if (cachedPrice) {
      return cachedPrice;
    }

    const pools = this.stateManager.getActivePoolsByToken(mint);
    if (pools.length === 0) {
      throw new Error(ERRORS.MESSAGES.POOL_NOT_FOUND);
    }

    const priceInfo = await this.calculateTokenPrice(mint, pools);
    this.priceCache.set(mint.toBase58(), priceInfo);
    
    return priceInfo;
  }

  async findBestRoute(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: BN
  ): Promise<PriceRoute[]> {
    await this.stateManager.loadState(this.connection);
    
    const directPools = this.findDirectPools(inputMint, outputMint);
    const routes: PriceRoute[] = [];

    for (const pool of directPools) {
      try {
        const route = await this.calculateRoute(pool, inputMint, outputMint, amount);
        if (route) {
          routes.push(route);
        }
      } catch (error) {
        console.error('Error calculating route:', error);
        continue;
      }
    }

    return routes.sort((a, b) => b.price - a.price);
  }

  private async updatePriceCache() {
    const now = Date.now();
    if (now - this.lastCacheUpdate < DEFAULTS.UPDATE_INTERVAL) {
      return;
    }

    await this.stateManager.loadState(this.connection);
    this.lastCacheUpdate = now;
  }

  private async calculateTokenPrice(
    mint: PublicKey, 
    pools: any[]
  ): Promise<TokenPriceInfo> {
    const prices: number[] = [];
    let totalVolume = new Decimal(0);
    let totalLiquidity = new Decimal(0);

    for (const pool of pools) {
      const isBase = pool.baseVault.equals(mint);
      const baseAmount = new Decimal(pool.baseAmount.toString());
      const quoteAmount = new Decimal(pool.quoteAmount.toString());

      if (isBase) {
        prices.push(quoteAmount.div(baseAmount).toNumber());
        totalLiquidity = totalLiquidity.add(baseAmount.mul(quoteAmount));
      } else {
        prices.push(baseAmount.div(quoteAmount).toNumber());
        totalLiquidity = totalLiquidity.add(baseAmount.mul(quoteAmount));
      }
    }

    const weightedPrice = prices.reduce((acc, price) => acc + price, 0) / prices.length;
    const priceChange24h = 0; // Implement 24h price tracking

    return {
      price: weightedPrice,
      volume24h: totalVolume.toNumber(),
      priceChange24h,
      liquidity: totalLiquidity.toNumber()
    };
  }

  private findDirectPools(inputMint: PublicKey, outputMint: PublicKey) {
    return Array.from(this.stateManager.getActivePoolsByToken(inputMint))
      .filter(pool => 
        (pool.baseVault.equals(inputMint) && pool.quoteVault.equals(outputMint)) ||
        (pool.baseVault.equals(outputMint) && pool.quoteVault.equals(inputMint))
      );
  }

  private async calculateRoute(
    pool: any,
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: BN
  ): Promise<PriceRoute | null> {
    const isBaseToQuote = pool.baseVault.equals(inputMint);
    const inputAmount = new Decimal(amount.toString());
    
    const baseAmount = new Decimal(pool.baseAmount.toString());
    const quoteAmount = new Decimal(pool.quoteAmount.toString());
    const k = baseAmount.mul(quoteAmount);

    let outputAmount: Decimal;
    let price: number;
    let impact: number;

    if (isBaseToQuote) {
      const newBaseAmount = baseAmount.add(inputAmount);
      outputAmount = k.div(newBaseAmount);
      price = quoteAmount.div(baseAmount).toNumber();
      impact = quoteAmount.sub(outputAmount).div(quoteAmount).mul(100).toNumber();
    } else {
      const newQuoteAmount = quoteAmount.add(inputAmount);
      outputAmount = k.div(newQuoteAmount);
      price = baseAmount.div(quoteAmount).toNumber();
      impact = baseAmount.sub(outputAmount).div(baseAmount).mul(100).toNumber();
    }

    if (impact > DEFAULTS.SLIPPAGE) {
      return null;
    }

    return {
      poolId: new PublicKey(pool.publicKey),
      inputMint,
      outputMint,
      price,
      impact,
      liquidity: k.toNumber()
    };
  }
}

export const createPriceService = (connection: Connection) => new RaydiumPriceService(connection);