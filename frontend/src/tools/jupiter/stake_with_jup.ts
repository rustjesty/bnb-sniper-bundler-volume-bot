import { 
  Connection, 
  Keypair, 
  VersionedTransaction, 
  PublicKey 
} from "@solana/web3.js";
import bs58 from 'bs58';

interface StakingOptions {
  rpcUrl?: string;
  privateKey?: string;
}

/**
 * Stakes SOL with Jupiter validator
 * @param amount Amount of SOL to stake
 * @param options Optional connection configuration
 * @returns Transaction signature
 */
export async function stakeWithJupiter(
  amount: number,
  options?: StakingOptions
): Promise<string> {
  try {
    // Initialize connection
    const connection = new Connection(
      options?.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    // Initialize wallet
    const privateKey = options?.privateKey || process.env.NEXT_PUBLIC_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Private key is required');
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));

    // Constants
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const JUPSOL_MINT = 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v';

    // Get staking transaction
    const response = await fetch(
      `https://worker.jup.ag/blinks/swap/${SOL_MINT}/${JUPSOL_MINT}/${amount}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account: wallet.publicKey.toBase58(),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch staking transaction: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.transaction) {
      throw new Error('No transaction data received from Jupiter');
    }

    // Deserialize and prepare transaction
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(data.transaction, 'base64')
    );

    // Get and set latest blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.message.recentBlockhash = blockhash;

    // Sign transaction
    transaction.sign([wallet]);

    // Send transaction
    const signature = await connection.sendTransaction(transaction, {
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    // Confirm transaction
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    return signature;

  } catch (error) {
    console.error('Jupiter staking error:', error);
    throw new Error(`jupSOL staking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Helper function to get current jupSOL staking APY
 * @returns Current APY as a percentage
 */
export async function getJupiterStakingApy(): Promise<number> {
  try {
    const response = await fetch('https://worker.jup.ag/blinks/stats');
    if (!response.ok) {
      throw new Error(`Failed to fetch APY: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.apy || 0;
  } catch (error) {
    console.error('Error fetching Jupiter staking APY:', error);
    throw new Error(`Failed to fetch APY: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}