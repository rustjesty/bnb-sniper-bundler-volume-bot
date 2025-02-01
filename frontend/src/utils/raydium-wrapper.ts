// utils/raydium-wrapper.ts
import { safeImport } from './base58';
import logger from './logger';
import type { PublicKey } from '@solana/web3.js';

/**
 * Safe wrapper for Raydium module imports
 */
export const RaydiumWrapper = {
  async getModules() {
    try {
      const [
        AmmInfo,
        AmmMarket,
        AmmOps,
        AmmPool,
        ClmmPool,
        ClmmPoolInfo
      ] = await Promise.all([
        safeImport('@/tools/raydium/amm/AmmInfo'),
        safeImport('@/tools/raydium/amm/AmmMarket'),
        safeImport('@/tools/raydium/amm/AmmOps'),
        safeImport('@/tools/raydium/amm/AmmPool'),
        safeImport('@/tools/raydium/clmm/ClmmPool'),
        safeImport('@/tools/raydium/clmm/ClmmPoolInfo')
      ]);

      return {
        AmmInfo,
        AmmMarket,
        AmmOps,
        AmmPool,
        ClmmPool,
        ClmmPoolInfo
      };
    } catch (error) {
      logger.error('Failed to load Raydium modules:', error);
      return null;
    }
  },

  async createPool(params: {
    baseMint: PublicKey;
    quoteMint: PublicKey;
    baseAmount: number;
    quoteAmount: number;
  }) {
    try {
      const modules = await this.getModules();
      if (!modules?.AmmPool) throw new Error('AmmPool module not loaded');
      
      return await (modules.AmmPool as any).createAmmPool(params);
    } catch (error) {
      logger.error('Failed to create pool:', error);
      return null;
    }
  },

  async getPoolInfo(poolId: string) {
    try {
      const modules = await this.getModules();
      if (!modules?.AmmInfo) throw new Error('AmmInfo module not loaded');
      
      return await (modules.AmmInfo as any).fetchRpcPoolInfo(poolId);
    } catch (error) {
      logger.error('Failed to get pool info:', error);
      return null;
    }
  }
};

// Type exports
export type RaydiumModules = Awaited<ReturnType<typeof RaydiumWrapper.getModules>>;