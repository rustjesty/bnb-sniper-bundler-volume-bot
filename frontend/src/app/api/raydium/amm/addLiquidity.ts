import { 
  ApiV3PoolInfoStandardItem,
  TokenAmount,
  toToken,
  Percent,
  AmmV4Keys,
  AmmV5Keys,
} from '@raydium-io/raydium-sdk-v2'
import { initSdk, txVersion } from '../config'
import { isValidAmm } from './utils'
import Decimal from 'decimal.js'

export const addLiquidity = async () => {
  // Initialize Raydium SDK and handle potential null
  const raydiumInstance = await initSdk();
  if (!raydiumInstance) {
    throw new Error('Failed to initialize Raydium SDK');
  }

  // RAY-USDC pool
  const poolId = '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg';
  let poolKeys: AmmV4Keys | AmmV5Keys | undefined;
  let poolInfo: ApiV3PoolInfoStandardItem;

  try {
    if (raydiumInstance.cluster === 'mainnet') {
      // note: api doesn't support get devnet pool info, so in devnet else we go rpc method
      // if you wish to get pool info from rpc, also can modify logic to go rpc method directly
      const data = await raydiumInstance.api.fetchPoolById({ ids: poolId });
      if (!data || !data[0]) {
        throw new Error('Failed to fetch pool data');
      }
      poolInfo = data[0] as ApiV3PoolInfoStandardItem;
    } else {
      // note: getPoolInfoFromRpc method only return required pool data for computing not all detail pool info
      const data = await raydiumInstance.liquidity.getPoolInfoFromRpc({ poolId });
      if (!data) {
        throw new Error('Failed to fetch pool info from RPC');
      }
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    }

    if (!isValidAmm(poolInfo.programId)) {
      throw new Error('Target pool is not AMM pool');
    }

    const inputAmount = '1';

    const r = raydiumInstance.liquidity.computePairAmount({
      poolInfo,
      amount: inputAmount,
      baseIn: true,
      slippage: new Percent(1, 100), // 1%
    });

    const { execute, transaction } = await raydiumInstance.liquidity.addLiquidity({
      poolInfo,
      poolKeys,
      amountInA: new TokenAmount(
        toToken(poolInfo.mintA),
        new Decimal(inputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0)
      ),
      amountInB: new TokenAmount(
        toToken(poolInfo.mintB),
        new Decimal(r.maxAnotherAmount.toExact()).mul(10 ** poolInfo.mintB.decimals).toFixed(0)
      ),
      otherAmountMin: r.minAnotherAmount,
      fixedSide: 'a',
      txVersion,
      // optional: set up priority fee here
      // computeBudgetConfig: {
      //   units: 600000,
      //   microLamports: 46591500,
      // },

      // optional: add transfer sol to tip account instruction. e.g sent tip to jito
      // txTipConfig: {
      //   address: new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5'),
      //   amount: new BN(10000000), // 0.01 sol
      // },
    });

    // Execute transaction
    const { txId } = await execute({ sendAndConfirm: true });
    console.log('liquidity added:', { txId: `https://explorer.solana.com/tx/${txId}` });
    
    return {
      success: true,
      txId,
      explorer: `https://explorer.solana.com/tx/${txId}`
    };

  } catch (error) {
    console.error('Error adding liquidity:', error);
    throw error;
  }
};

// Export the function but don't auto-execute
export default addLiquidity;