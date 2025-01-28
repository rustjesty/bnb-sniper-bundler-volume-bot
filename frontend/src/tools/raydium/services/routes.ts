import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

import { QuoteRoute } from './quote';
import { DEFAULTS } from '../core/constants';
import { RaydiumStateManager } from '../core/state';

export interface RouteOptions {
  maxHops?: number;
  minLiquidity?: number;
  maxImpact?: number;
  excludePools?: PublicKey[];
}

export interface RouteInfo {
  route: QuoteRoute[];
  impact: number;
  executionPrice: number;
  liquidity: number;
  pools: PoolInfo[];
}

interface PoolInfo {
  id: PublicKey;
  liquidity: BN;
  volume24h: BN;
  fee: number;
}

export class RaydiumRouteService {
  private stateManager: RaydiumStateManager;
  private routeCache: Map<string, RouteInfo[]> = new Map();
  private lastCacheUpdate: number = 0;

  constructor(private connection: Connection) {
    this.stateManager = RaydiumStateManager.getInstance();
  }

  async findAllRoutes(
    inputMint: PublicKey,
    outputMint: PublicKey,
    options: RouteOptions = {}
  ): Promise<RouteInfo[]> {
    const cacheKey = this.getCacheKey(inputMint, outputMint, options);
    const cachedRoutes = this.getFromCache(cacheKey);
    if (cachedRoutes) return cachedRoutes;

    await this.stateManager.loadState(this.connection);
    
    const routes = await this.computeAllRoutes(inputMint, outputMint, options);
    this.routeCache.set(cacheKey, routes);
    
    return routes;
  }

  async getBestRoute(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: BN,
    options: RouteOptions = {}
  ): Promise<RouteInfo> {
    const routes = await this.findAllRoutes(inputMint, outputMint, options);
    if (routes.length === 0) {
      throw new Error('No valid routes found');
    }

    return this.selectBestRoute(routes, amount, options);
  }

  private async computeAllRoutes(
    inputMint: PublicKey,
    outputMint: PublicKey,
    options: RouteOptions
  ): Promise<RouteInfo[]> {
    const {
      maxHops = 2,
      minLiquidity = DEFAULTS.MIN_LIQUIDITY,
      excludePools = []
    } = options;

    const routes: RouteInfo[] = [];
    const visited = new Set<string>();

    const findPaths = async (
      currentMint: PublicKey,
      currentPath: QuoteRoute[],
      depth: number
    ) => {
      if (depth >= maxHops) return;

      const pools = this.stateManager.getActivePoolsByToken(currentMint)
        .filter(pool => {
          const poolId = pool.publicKey.toBase58();
          if (excludePools.some(p => p.toBase58() === poolId)) return false;
          if (visited.has(poolId)) return false;
          
          const liquidity = new BN(pool.baseAmount)
            .mul(new BN(pool.quoteAmount));
          return liquidity.gte(new BN(minLiquidity));
        });

      for (const pool of pools) {
        const poolId = pool.publicKey.toBase58();
        visited.add(poolId);

        const nextMint = pool.baseVault.equals(currentMint)
          ? pool.quoteVault
          : pool.baseVault;

        const routeStep: QuoteRoute = {
          poolId: pool.publicKey,
          inputMint: currentMint,
          outputMint: nextMint,
          inputAmount: new BN(0), // Computed during quote
          outputAmount: new BN(0), // Computed during quote
          fee: pool.tradeFeeRate || DEFAULTS.SLIPPAGE
        };

        const newPath = [...currentPath, routeStep];

        if (nextMint.equals(outputMint)) {
          routes.push(this.createRouteInfo(newPath));
        } else {
          await findPaths(nextMint, newPath, depth + 1);
        }

        visited.delete(poolId);
      }
    };

    await findPaths(inputMint, [], 0);
    return routes;
  }

  private createRouteInfo(route: QuoteRoute[]): RouteInfo {
    const pools = route.map(step => {
      const pool = this.stateManager.getPool(step.poolId.toBase58());
      if (!pool) throw new Error(`Pool not found: ${step.poolId.toBase58()}`);
      
      return {
        id: step.poolId,
        liquidity: new BN(pool.baseAmount).mul(new BN(pool.quoteAmount)),
        volume24h: new BN(0), // Implement 24h volume tracking
        fee: step.fee
      };
    });

    const totalLiquidity = pools.reduce(
      (acc, pool) => acc.add(pool.liquidity), 
      new BN(0)
    );

    return {
      route,
      impact: 0, // Computed during quote
      executionPrice: 0, // Computed during quote
      liquidity: totalLiquidity.toNumber(),
      pools
    };
  }

  private selectBestRoute(
    routes: RouteInfo[],
    amount: BN,
    options: RouteOptions
  ): RouteInfo {
    const { maxImpact = DEFAULTS.SLIPPAGE } = options;

    const validRoutes = routes.filter(route => 
      route.impact <= maxImpact &&
      route.liquidity >= DEFAULTS.MIN_LIQUIDITY
    );

    if (validRoutes.length === 0) {
      throw new Error('No routes meeting criteria found');
    }

    return validRoutes.reduce((best, current) => {
      if (current.executionPrice > best.executionPrice) return current;
      if (current.executionPrice === best.executionPrice && 
          current.impact < best.impact) return current;
      return best;
    });
  }

  private getCacheKey(
    inputMint: PublicKey,
    outputMint: PublicKey,
    options: RouteOptions
  ): string {
    return `${inputMint.toBase58()}-${outputMint.toBase58()}-${JSON.stringify(options)}`;
  }

  private getFromCache(key: string): RouteInfo[] | null {
    const now = Date.now();
    if (now - this.lastCacheUpdate > DEFAULTS.UPDATE_INTERVAL) {
      this.routeCache.clear();
      return null;
    }

    return this.routeCache.get(key) || null;
  }
}

export const createRouteService = (connection: Connection) => new RaydiumRouteService(connection);