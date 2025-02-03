import { 
  OPEN_BOOK_PROGRAM, 
  Raydium, 
  TxVersion 
} from "@raydium-io/raydium-sdk-v2";
import { 
  MintLayout, 
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { 
  Connection, 
  Keypair, 
  PublicKey 
} from "@solana/web3.js";
import bs58 from 'bs58';

interface CreateMarketOptions {
  rpcUrl?: string;
  privateKey?: string;
}

/**
 * Creates a new Openbook market
 * @param baseMint Base token mint address
 * @param quoteMint Quote token mint address
 * @param lotSize Lot size for the market
 * @param tickSize Tick size for the market
 * @param options Optional connection configuration
 * @returns Array of transaction IDs
 */
export async function createOpenbookMarket(
  baseMint: string | PublicKey,
  quoteMint: string | PublicKey,
  lotSize: number = 1,
  tickSize: number = 0.01,
  options?: CreateMarketOptions
): Promise<string[]> {
  try {
    // Set up connection and wallet
    const connection = new Connection(
      options?.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    const privateKey = options?.privateKey || process.env.NEXT_PUBLIC_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Private key is required');
    }

    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));

    // Convert string addresses to PublicKey if needed
    const baseTokenMint = baseMint instanceof PublicKey ? baseMint : new PublicKey(baseMint);
    const quoteTokenMint = quoteMint instanceof PublicKey ? quoteMint : new PublicKey(quoteMint);

    // Initialize Raydium SDK
    const raydium = await Raydium.load({
      owner: wallet,
      connection: connection,
    });

    // Get mint info
    const [baseMintInfo, quoteMintInfo] = await Promise.all([
      connection.getAccountInfo(baseTokenMint),
      connection.getAccountInfo(quoteTokenMint)
    ]);

    // Validate mint accounts
    if (!baseMintInfo || !quoteMintInfo) {
      throw new Error('Failed to fetch mint information');
    }

    if (
      baseMintInfo.owner.toString() !== TOKEN_PROGRAM_ID.toBase58() ||
      quoteMintInfo.owner.toString() !== TOKEN_PROGRAM_ID.toBase58()
    ) {
      throw new Error(
        "Openbook market only supports TOKEN_PROGRAM_ID mints. For token-2022, please create a Raydium CPMM pool instead."
      );
    }

    // Decode mint layouts
    const baseDecimals = MintLayout.decode(baseMintInfo.data).decimals;
    const quoteDecimals = MintLayout.decode(quoteMintInfo.data).decimals;

    // Create market
    const { execute } = await raydium.marketV2.create({
      baseInfo: {
        mint: baseTokenMint,
        decimals: baseDecimals,
      },
      quoteInfo: {
        mint: quoteTokenMint,
        decimals: quoteDecimals,
      },
      lotSize,
      tickSize,
      dexProgramId: OPEN_BOOK_PROGRAM,
      txVersion: TxVersion.V0,
    });

    // Execute transactions sequentially
    const { txIds } = await execute({ sequentially: true });

    return txIds;

  } catch (error) {
    console.error('Error creating Openbook market:', error);
    throw new Error(`Failed to create market: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}