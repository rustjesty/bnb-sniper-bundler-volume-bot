import { CpmmPoolInfoLayout, splAccountLayout } from "@raydium-io/raydium-sdk-v2";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";

export class CpmmPoolMonitor {
  private connection: Connection;
  private vaultToPoolId: { [key: string]: { poolId: string, type: 'base' | 'quote' } } = {};
  private poolInfoCache: {
    [key: string]: {
      poolInfo: ReturnType<typeof CpmmPoolInfoLayout.decode>,
      vaultA: ReturnType<typeof splAccountLayout.decode> | undefined,
      vaultB: ReturnType<typeof splAccountLayout.decode> | undefined
    }
  } = {};

  constructor(endpoint: string) {
    this.connection = new Connection(endpoint);
  }

  async startMonitoring(onUpdate?: (poolId: string, vaultA: Decimal, vaultB: Decimal, price: Decimal) => void) {
    const PROGRAM_ID = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
    const AUTH = 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL';

    const subscriptionIds = [
      this.connection.onProgramAccountChange(
        new PublicKey(PROGRAM_ID),
        async (update) => this.handleAmmUpdate(update, onUpdate),
        {
          filters: [{
            dataSize: CpmmPoolInfoLayout.span
          }]
        }
      ),

      this.connection.onProgramAccountChange(
        TOKEN_PROGRAM_ID,
        async (update) => this.handleVaultUpdate(update, AUTH, onUpdate),
        {
          filters: [{
            memcmp: {
              offset: splAccountLayout.offsetOf('owner'),
              bytes: new PublicKey(AUTH).toBase58()
            }
          }]
        }
      ),

      this.connection.onProgramAccountChange(
        TOKEN_2022_PROGRAM_ID,
        async (update) => this.handleVaultUpdate(update, AUTH, onUpdate),
        {
          filters: [{
            memcmp: {
              offset: splAccountLayout.offsetOf('owner'),
              bytes: new PublicKey(AUTH).toBase58()
            }
          }]
        }
      )
    ];

    return () => {
      subscriptionIds.forEach(id => this.connection.removeAccountChangeListener(id));
    };
  }

  private handleAmmUpdate(update: any, onUpdate?: (poolId: string, vaultA: Decimal, vaultB: Decimal, price: Decimal) => void): void {
    const formatData = CpmmPoolInfoLayout.decode(update.accountInfo.data);
    const pk = update.accountId.toBase58();

    this.poolInfoCache[pk] = { poolInfo: formatData, vaultA: undefined, vaultB: undefined };
    this.vaultToPoolId[formatData.vaultA.toString()] = { poolId: pk, type: 'base' };
    this.vaultToPoolId[formatData.vaultB.toString()] = { poolId: pk, type: 'quote' };
  }

  private handleVaultUpdate(update: any, auth: string, onUpdate?: (poolId: string, vaultA: Decimal, vaultB: Decimal, price: Decimal) => void): void {
    const formatData = splAccountLayout.decode(update.accountInfo.data);
    if (formatData.owner.toString() !== auth) return;

    const pk = update.accountId.toBase58();
    if (!this.vaultToPoolId[pk]) return;

    const poolType = this.vaultToPoolId[pk];
    const poolCache = this.poolInfoCache[poolType.poolId];
    if (!poolCache) return;

    if (poolType.type === 'base') {
      poolCache.vaultA = formatData;
    } else {
      poolCache.vaultB = formatData;
    }

    if (!poolCache.vaultA || !poolCache.vaultB) return;

    const vaultA = new Decimal(poolCache.vaultA.amount
      .sub(poolCache.poolInfo.fundFeesMintA)
      .sub(poolCache.poolInfo.protocolFeesMintA).toString())
      .div(10 ** poolCache.poolInfo.mintDecimalA);

    const vaultB = new Decimal(poolCache.vaultB.amount
      .sub(poolCache.poolInfo.fundFeesMintB)
      .sub(poolCache.poolInfo.protocolFeesMintB).toString())
      .div(10 ** poolCache.poolInfo.mintDecimalB);

    const price = vaultB.div(vaultA);

    if (onUpdate) {
      onUpdate(poolType.poolId, vaultA, vaultB, price);
    }
  }
}