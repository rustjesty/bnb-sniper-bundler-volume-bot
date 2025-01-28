import { PoolInfoLayout, SqrtPriceMath } from '@raydium-io/raydium-sdk-v2';
import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';

export class ClmmPoolMonitorV2 {
  private connection: Connection;

  constructor(endpoint: string) {
    this.connection = new Connection(endpoint);
  }

  async watchPoolUpdates(callback: (poolAddress: string, price: number) => void) {
    const programId = new PublicKey(PROGRAM_ID);

    const wsId = this.connection.onProgramAccountChange(
      programId,
      (accountInfo) => {
        try {
          if (accountInfo.accountInfo.data.length !== PoolInfoLayout.span) return;
          
          const data = PoolInfoLayout.decode(accountInfo.accountInfo.data);
          const poolAddress = accountInfo.accountId.toBase58();
          const price = SqrtPriceMath.sqrtPriceX64ToPrice(
            data.sqrtPriceX64,
            data.mintDecimalsA,
            data.mintDecimalsB
          );

          callback(poolAddress, price.toNumber());
        } catch (e) {
          console.error('Error processing pool update:', e);
        }
      },
      'confirmed'
    );

    return () => {
      this.connection.removeAccountChangeListener(wsId);
    };
  }
}