import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { raydiumAccounts } from './accounts';
import { DEFAULTS } from './constants';

export interface StateData {
  pools: Map<string, PoolState>;
  positions: Map<string, PositionState>;
  farms: Map<string, FarmState>;
}

interface PoolState {
  tradeFeeRate: number;
  publicKey: PublicKey;
  authority: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseAmount: BN;
  quoteAmount: BN;
  lpSupply: BN;
  lastUpdateTime: BN;
  status: number;
}

interface PositionState {
  publicKey: PublicKey;
  owner: PublicKey;
  poolId: PublicKey;
  liquidity: BN;
  tickLower: number;
  tickUpper: number;
  feeGrowthInside: BN;
  rewardInfos: RewardInfo[];
}

interface FarmState {
  publicKey: PublicKey;
  poolId: PublicKey;
  rewardMint: PublicKey;
  rewardVault: PublicKey;
  rewardRate: BN;
  lastUpdateTime: BN;
  rewardPerShareNet: BN;
}

interface RewardInfo {
  rewardMint: PublicKey;
  earned: BN;
  perShare: BN;
}

export class RaydiumStateManager {
  private static instance: RaydiumStateManager;
  private state: StateData = {
    pools: new Map(),
    positions: new Map(),
    farms: new Map()
  };
  private lastUpdate: number = 0;

  private constructor() {}

  static getInstance(): RaydiumStateManager {
    if (!RaydiumStateManager.instance) {
      RaydiumStateManager.instance = new RaydiumStateManager();
    }
    return RaydiumStateManager.instance;
  }

  async loadState(connection: Connection) {
    const now = Date.now();
    if (now - this.lastUpdate < DEFAULTS.UPDATE_INTERVAL) {
      return;
    }

    await Promise.all([
      this.updatePools(connection),
      this.updatePositions(connection),
      this.updateFarms(connection)
    ]);

    this.lastUpdate = now;
  }

  private async updatePools(connection: Connection) {
    try {
      // Fetch all pool accounts
      const accounts = await raydiumAccounts.getAllPoolAccounts(connection);
      
      this.state.pools.clear();
      accounts.forEach(account => {
        const poolState = this.parsePoolState(account);
        if (poolState) {
          this.state.pools.set(poolState.publicKey.toBase58(), poolState);
        }
      });
    } catch (error) {
      console.error('Failed to update pools:', error);
    }
  }

  private async updatePositions(connection: Connection) {
    try {
      const accounts = await raydiumAccounts.getAllPositionAccounts(connection);
      
      this.state.positions.clear();
      accounts.forEach(account => {
        const positionState = this.parsePositionState(account);
        if (positionState) {
          this.state.positions.set(positionState.publicKey.toBase58(), positionState);
        }
      });
    } catch (error) {
      console.error('Failed to update positions:', error);
    }
  }

  private async updateFarms(connection: Connection) {
    try {
      const accounts = await raydiumAccounts.getAllFarmAccounts(connection);
      
      this.state.farms.clear();
      accounts.forEach(account => {
        const farmState = this.parseFarmState(account);
        if (farmState) {
          this.state.farms.set(farmState.publicKey.toBase58(), farmState);
        }
      });
    } catch (error) {
      console.error('Failed to update farms:', error);
    }
  }

  private parsePoolState(account: any): PoolState | null {
    try {
      return {
        publicKey: account.publicKey,
        authority: account.account.authority,
        baseVault: account.account.baseVault,
        quoteVault: account.account.quoteVault,
        baseAmount: account.account.baseAmount,
        quoteAmount: account.account.quoteAmount,
        lpSupply: account.account.lpSupply,
        lastUpdateTime: account.account.lastUpdateTime,
        status: account.account.status,
        tradeFeeRate: account.account.tradeFeeRate
      };
    } catch {
      return null;
    }
  }

  private parsePositionState(account: any): PositionState | null {
    try {
      return {
        publicKey: account.publicKey,
        owner: account.account.owner,
        poolId: account.account.poolId,
        liquidity: account.account.liquidity,
        tickLower: account.account.tickLower,
        tickUpper: account.account.tickUpper,
        feeGrowthInside: account.account.feeGrowthInside,
        rewardInfos: account.account.rewardInfos.map((info: any) => ({
          rewardMint: info.rewardMint,
          earned: info.earned,
          perShare: info.perShare
        }))
      };
    } catch {
      return null;
    }
  }

  private parseFarmState(account: any): FarmState | null {
    try {
      return {
        publicKey: account.publicKey,
        poolId: account.account.poolId,
        rewardMint: account.account.rewardMint,
        rewardVault: account.account.rewardVault,
        rewardRate: account.account.rewardRate,
        lastUpdateTime: account.account.lastUpdateTime,
        rewardPerShareNet: account.account.rewardPerShareNet
      };
    } catch {
      return null;
    }
  }

  getPool(poolId: string): PoolState | undefined {
    return this.state.pools.get(poolId);
  }

  getPosition(positionId: string): PositionState | undefined {
    return this.state.positions.get(positionId);
  }

  getFarm(farmId: string): FarmState | undefined {
    return this.state.farms.get(farmId);
  }

  getActivePoolsByToken(mint: PublicKey): PoolState[] {
    return Array.from(this.state.pools.values()).filter(pool => 
      pool.status === 1 && (
        pool.baseVault.equals(mint) || 
        pool.quoteVault.equals(mint)
      )
    );
  }

  getUserPositions(owner: PublicKey): PositionState[] {
    return Array.from(this.state.positions.values()).filter(pos => 
      pos.owner.equals(owner)
    );
  }
}

export const raydiumState = RaydiumStateManager.getInstance();