import { ApiPoolInfoV4, Market, MARKET_STATE_LAYOUT_V3, SPL_MINT_LAYOUT } from "@raydium-io/raydium-sdk-v2";
import { Connection, PublicKey } from '@solana/web3.js';
import base58 from "bs58";

export class NewAmmPoolMonitor {
  private connection: Connection;
  
  constructor(endpoint: string) {
    this.connection = new Connection(endpoint);
  }

  async monitorNewPools(callback: (poolInfo: ApiPoolInfoV4) => void) {
    const PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
    const CREATE_POOL_FEE_ACCOUNT = '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5';

    return this.connection.onLogs(
      new PublicKey(CREATE_POOL_FEE_ACCOUNT),
      async (logs) => {
        if (logs.err || !logs.logs.length) return;

        try {
          const tx = await this.connection.getParsedTransaction(logs.signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (!tx || tx.meta?.err) return;

          const accounts = tx.transaction.message.accountKeys.map(key => key.pubkey.toString());
          
          if (!tx.meta) return;
          for (const ix of tx.meta.innerInstructions?.flatMap(inner => inner.instructions) || []) {
            if (ix.programId.toString() !== PROGRAM_ID) continue;

            if ('data' in ix) {
              const decodedData = base58.decode(ix.data);
              if (decodedData[0] !== 1) continue;
            } else {
              continue;
            }

            const poolId = accounts[4];
            console.log(new Date().toJSON(), 'new pool Id: ', poolId);

            const [baseMint, quoteMint, market] = await this.connection.getMultipleAccountsInfo([
              new PublicKey(accounts[8]),
              new PublicKey(accounts[9]),
              new PublicKey(accounts[16]),
            ]);

            if (!baseMint || !quoteMint || !market) throw Error('Failed to fetch account info');

            const baseMintInfo = SPL_MINT_LAYOUT.decode(baseMint.data);
            const quoteMintInfo = SPL_MINT_LAYOUT.decode(quoteMint.data);
            const marketInfo = MARKET_STATE_LAYOUT_V3.decode(market.data);

            const poolInfo: ApiPoolInfoV4 = {
              id: accounts[4],
              baseMint: accounts[8],
              quoteMint: accounts[9],
              lpMint: accounts[7],
              baseDecimals: baseMintInfo.decimals,
              quoteDecimals: quoteMintInfo.decimals,
              lpDecimals: baseMintInfo.decimals,
              version: 4,
              programId: PROGRAM_ID,
              authority: accounts[5],
              openOrders: accounts[6],
              targetOrders: accounts[12],
              baseVault: accounts[10],
              quoteVault: accounts[11],
              withdrawQueue: PublicKey.default.toString(),
              lpVault: PublicKey.default.toString(),
              marketVersion: 3,
              marketProgramId: market.owner.toString(),
              marketId: accounts[16],
              marketAuthority: Market.getAssociatedAuthority({ 
                programId: market.owner, 
                marketId: new PublicKey(accounts[16]) 
              }).publicKey.toString(),
              marketBaseVault: marketInfo.baseVault.toString(),
              marketQuoteVault: marketInfo.quoteVault.toString(),
              marketBids: marketInfo.bids.toString(),
              marketAsks: marketInfo.asks.toString(),
              marketEventQueue: marketInfo.eventQueue.toString(),
              lookupTableAccount: PublicKey.default.toString()
            };

            callback(poolInfo);
          }
        } catch (error) {
          console.error('Error processing new pool:', error);
        }
      },
      'confirmed'
    );
  }
}