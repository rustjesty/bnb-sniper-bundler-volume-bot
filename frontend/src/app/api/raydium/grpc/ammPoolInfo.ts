import { liquidityStateV4Layout, splAccountLayout } from "@raydium-io/raydium-sdk-v2";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";
import base58 from "bs58";

const PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const AUTH = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';

export class AmmPoolMonitor {
  private connection: Connection;
  private vaultToPoolId: { [key: string]: { poolId: string, type: 'base' | 'quote' } } = {};
  private poolInfoCache: { 
    [key: string]: { 
      poolInfo: ReturnType<typeof liquidityStateV4Layout.decode>, 
      vaultA: ReturnType<typeof splAccountLayout.decode> | undefined, 
      vaultB: ReturnType<typeof splAccountLayout.decode> | undefined 
    } 
  } = {};

  constructor(endpoint: string) {
    this.connection = new Connection(endpoint);
  }

  async startMonitoring() {
    // Monitor AMM updates
    const ammSubscriptionId = this.connection.onProgramAccountChange(
      new PublicKey(PROGRAM_ID),
      (accountInfo) => {
        if (accountInfo.accountInfo.data.length !== liquidityStateV4Layout.span) return;
        this.handleAmmUpdate(accountInfo);
      },
      'confirmed'
    );

    // Monitor vault updates
    const vaultSubscriptionId = this.connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      (accountInfo) => {
        if (!this.isVaultAccount(accountInfo.accountInfo.data)) return;
        this.handleVaultUpdate(accountInfo);
      },
      'confirmed'
    );

    return () => {
      this.connection.removeAccountChangeListener(ammSubscriptionId);
      this.connection.removeAccountChangeListener(vaultSubscriptionId);
    };
  }

  private isVaultAccount(data: Buffer): boolean {
    try {
      const accountInfo = splAccountLayout.decode(data);
      return accountInfo.owner.toString() === AUTH;
    } catch {
      return false;
    }
  }

  private handleAmmUpdate(update: any) {
    const data = update.accountInfo.data;
    const formatData = liquidityStateV4Layout.decode(data);
    const pk = update.accountId.toBase58();

    this.poolInfoCache[pk] = { poolInfo: formatData, vaultA: undefined, vaultB: undefined };
    this.vaultToPoolId[formatData.baseVault.toString()] = { poolId: pk, type: 'base' };
    this.vaultToPoolId[formatData.quoteVault.toString()] = { poolId: pk, type: 'quote' };
  }

  private handleVaultUpdate(update: any) {
    const data = update.accountInfo.data;
    const formatData = splAccountLayout.decode(data);
    const pk = update.accountId.toBase58();

    if (!this.vaultToPoolId[pk]) return;

    const poolType = this.vaultToPoolId[pk];
    const poolCache = this.poolInfoCache[poolType.poolId];

    if (poolType.type === 'base') {
      poolCache.vaultA = formatData;
    } else {
      poolCache.vaultB = formatData;
    }

    if (!poolCache.vaultA || !poolCache.vaultB) return;

    const vaultA = new Decimal(poolCache.vaultA.amount
      .sub(poolCache.poolInfo.baseNeedTakePnl)
      .toString())
      .div(10 ** poolCache.poolInfo.baseDecimal.toNumber());

    const vaultB = new Decimal(poolCache.vaultB.amount
      .sub(poolCache.poolInfo.quoteNeedTakePnl)
      .toString())
      .div(10 ** poolCache.poolInfo.quoteDecimal.toNumber());

    console.log(poolType.poolId, vaultA.toString(), vaultB.toString(), vaultB.div(vaultA).toString());
  }
}