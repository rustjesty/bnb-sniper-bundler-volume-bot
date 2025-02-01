// src/app/api/raydium/amm/createAmmPool.ts
import { 
  MARKET_STATE_LAYOUT_V3,
  AMM_V4,
  OPEN_BOOK_PROGRAM,
  FEE_DESTINATION_ID,
  DEVNET_PROGRAM_ID,
} from '@raydium-io/raydium-sdk-v2';
import { initSdk, txVersion } from '../config';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
// Import BN correctly
import BN from 'bn.js';

export const createAmmPool = async () => {
  try {
    const raydium = await initSdk();
    const marketId = new PublicKey(`<you market id here>`);

    // if you are confirmed your market info, don't have to get market info from rpc below
    const marketBufferInfo = await raydium.connection.getAccountInfo(new PublicKey(marketId));
    const { baseMint, quoteMint } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo!.data);

    // check mint info here: https://api-v3.raydium.io/mint/list
    // or get mint info by api: await raydium.token.getTokenInfo('mint address')

    // amm pool doesn't support token 2022
    const baseMintInfo = await raydium.token.getTokenInfo(baseMint);
    const quoteMintInfo = await raydium.token.getTokenInfo(quoteMint);
    const baseAmount = new BN(1000);
    const quoteAmount = new BN(1000);

    if (
      baseMintInfo.programId !== TOKEN_PROGRAM_ID.toBase58() ||
      quoteMintInfo.programId !== TOKEN_PROGRAM_ID.toBase58()
    ) {
      throw new Error(
        'amm pools with openbook market only support TOKEN_PROGRAM_ID mints, if you want to create pool with token-2022, please create cpmm pool instead'
      );
    }

    if (baseAmount.mul(quoteAmount).lte(new BN(1).mul(new BN(10 ** baseMintInfo.decimals)).pow(new BN(2)))) {
      throw new Error('initial liquidity too low, try adding more baseAmount/quoteAmount');
    }

    const { execute, extInfo } = await raydium.liquidity.createPoolV4({
      programId: AMM_V4,
      // programId: DEVNET_PROGRAM_ID.AmmV4, // devnet
      marketInfo: {
        marketId,
        programId: OPEN_BOOK_PROGRAM,
        // programId: DEVNET_PROGRAM_ID.OPENBOOK_MARKET, // devent
      },
      baseMintInfo: {
        mint: baseMint,
        decimals: baseMintInfo.decimals,
      },
      quoteMintInfo: {
        mint: quoteMint,
        decimals: quoteMintInfo.decimals,
      },
      baseAmount: new BN(1000),
      quoteAmount: new BN(1000),

      startTime: new BN(0),
      ownerInfo: {
        useSOLBalance: true,
      },
      associatedOnly: false,
      txVersion,
      feeDestinationId: FEE_DESTINATION_ID,
    });

    const { txId } = await execute({ sendAndConfirm: true });
    console.log(
      'amm pool created! txId: ',
      txId,
      ', poolKeys:',
      Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]: extInfo.address[cur as keyof typeof extInfo.address].toBase58(),
        }),
        {}
      )
    );
  } catch (error) {
    console.error('Error creating AMM pool:', error);
    throw error;
  }
};

export default createAmmPool;