// src/tools/raydium/service.ts
import { Connection } from '@solana/web3.js';
import { getClientSideRaydium } from './client-config';
import { swap } from './amm/swap';
import { createAmmPool } from './amm/createAmmPool';
import { createMarket } from './amm/createMarket';
import { createFarm } from './clmm/createFarm';
import { createPool } from './clmm/createPool';
import { fetchRpcPoolInfo } from './amm/fetchRpcPoolInfo'; 
import * as routeSwap from './trade/routeSwap';

export class RaydiumService {
  private connection: Connection;
  private poolInfo: any = null;

  constructor() {
    this.connection = getClientSideRaydium();
  }

  // AMM Operations
  async createPool(params: any) {
    return this.executeOperation('amm/createPool', params);
  }

  async swap(params: any) {
    return this.executeOperation('amm/swap', {
      ...params,
      poolInfo: await this.getPoolInfo()
    });
  }

  // CLMM Operations  
  async createClmmPool(params: any) {
    return this.executeOperation('clmm/createPool', params);
  }

  async createFarm(params: any) {
    return this.executeOperation('clmm/createFarm', params);
  }

  // Trading Operations
  async routeSwap(params: any) {
    return this.executeOperation('trade/routeSwap', params); 
  }

  // Utility Methods
  private async getPoolInfo() {
    if (!this.poolInfo) {
      this.poolInfo = await fetchRpcPoolInfo();
    }
    return this.poolInfo;
  }

  private async executeOperation(endpoint: string, params: any) {
    const response = await fetch(`/api/raydium/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Operation failed');
    }

    return response.json();
  }
}

// Export singleton instance
export const raydiumService = new RaydiumService();