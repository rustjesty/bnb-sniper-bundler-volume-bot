import { 
  createAssociatedTokenAccountInstruction, 
  createTransferInstruction, 
  getAssociatedTokenAddress, 
  getMint 
} from "@solana/spl-token";
import {
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  Connection,
  Keypair
} from "@solana/web3.js";
import bs58 from "bs58";

interface PriorityFeeResponse {
  jsonrpc: string;
  id: string;
  result: {
    priorityFeeEstimate: number;
  };
  error?: any;
}

interface TransactionResult {
  transactionId: string;
  fee: number;
}

/**
 * Sends a transaction with an estimated priority fee
 * @param priorityLevel Priority level ("Min", "Low", "Medium", "High", "VeryHigh", "UnsafeMax")
 * @param amount Amount to send (in SOL for native transfers, or token units for SPL transfers)
 * @param to Recipient's address
 * @param options Additional options including SPL token details
 * @returns Transaction signature and fee
 */
export async function sendTransactionWithPriority(
  priorityLevel: string,
  amount: number,
  to: string,
  options?: {
    splMintAddress?: string;
    rpcUrl?: string;
    privateKey?: string;
  }
): Promise<TransactionResult> {
  try {
    // Initialize connection and wallet
    const connection = new Connection(
      options?.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    const privateKey = options?.privateKey || process.env.NEXT_PUBLIC_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Private key is required');
    }

    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const walletPublicKey = wallet.publicKey;
    const recipient = new PublicKey(to);

    // Handle either SOL or SPL token transfer
    if (!options?.splMintAddress) {
      return await sendNativeSOL(
        connection,
        wallet,
        recipient,
        amount,
        priorityLevel
      );
    } else {
      const splMint = new PublicKey(options.splMintAddress);
      return await sendSPLToken(
        connection,
        wallet,
        recipient,
        splMint,
        amount,
        priorityLevel
      );
    }
  } catch (error) {
    console.error('Transaction error:', error);
    throw new Error(`Failed to send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function sendNativeSOL(
  connection: Connection,
  wallet: Keypair,
  recipient: PublicKey,
  amount: number,
  priorityLevel: string
): Promise<TransactionResult> {
  const transaction = new Transaction();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = wallet.publicKey;

  // Add transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: recipient,
      lamports: amount * LAMPORTS_PER_SOL
    })
  );

  // Get priority fee estimate
  const feeEstimate = await getPriorityFeeEstimate(transaction, priorityLevel);

  // Add compute budget instruction
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: BigInt(feeEstimate)
    })
  );

  // Send and confirm transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet]
  );

  return {
    transactionId: signature,
    fee: feeEstimate
  };
}

async function sendSPLToken(
  connection: Connection,
  wallet: Keypair,
  recipient: PublicKey,
  splMint: PublicKey,
  amount: number,
  priorityLevel: string
): Promise<TransactionResult> {
  // Get token accounts
  const fromAta = await getAssociatedTokenAddress(splMint, wallet.publicKey);
  const toAta = await getAssociatedTokenAddress(splMint, recipient);

  // Get mint info and adjust amount
  const mintInfo = await getMint(connection, splMint);
  const adjustedAmount = BigInt(Math.floor(amount * Math.pow(10, mintInfo.decimals)));

  // Create transaction
  const transaction = new Transaction();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = wallet.publicKey;

  // Get priority fee estimate
  const feeEstimate = await getPriorityFeeEstimate(transaction, priorityLevel);

  // Add compute budget instruction
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: BigInt(feeEstimate)
    })
  );

  // Create recipient's token account if needed
  transaction.add(
    createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      toAta,
      recipient,
      splMint
    )
  );

  // Add transfer instruction
  transaction.add(
    createTransferInstruction(
      fromAta,
      toAta,
      wallet.publicKey,
      adjustedAmount
    )
  );

  // Send and confirm transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet]
  );

  return {
    transactionId: signature,
    fee: feeEstimate
  };
}

async function getPriorityFeeEstimate(
  transaction: Transaction,
  priorityLevel: string
): Promise<number> {
  const response = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'getPriorityFeeEstimate',
        params: [
          {
            transaction: bs58.encode(transaction.serialize()),
            options: { priorityLevel }
          }
        ]
      })
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(`Error fetching priority fee: ${data.error.message}`);
  }

  return data.result.priorityFeeEstimate;
}