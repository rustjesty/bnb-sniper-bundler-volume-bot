import { 
  Connection, 
  Keypair, 
  VersionedTransaction 
} from "@solana/web3.js";
import bs58 from 'bs58';

interface PumpFunTokenOptions {
  twitter?: string;
  telegram?: string;
  website?: string;
  initialLiquiditySOL?: number;
  slippageBps?: number;
  priorityFee?: number;
  description?: string;
  rpcUrl?: string;
  privateKey?: string;
}

interface LaunchResponse {
  signature: string;
  mint: string;
  metadataUri: string;
}

/**
 * Upload token metadata to IPFS via Pump.fun
 */
async function uploadMetadata(
  tokenName: string,
  tokenTicker: string,
  description: string,
  imageUrl: string,
  options?: PumpFunTokenOptions,
): Promise<any> {
  // Create metadata object
  const formData = new URLSearchParams();
  formData.append("name", tokenName);
  formData.append("symbol", tokenTicker);
  formData.append("description", description);
  formData.append("showName", "true");

  // Add optional social links
  if (options?.twitter) formData.append("twitter", options.twitter);
  if (options?.telegram) formData.append("telegram", options.telegram);
  if (options?.website) formData.append("website", options.website);

  // Fetch and prepare image
  const imageResponse = await fetch(imageUrl);
  const imageBlob = await imageResponse.blob();
  const files = {
    file: new File([imageBlob], "token_image.png", { type: "image/png" })
  };

  // Create final form data
  const finalFormData = new FormData();
  for (const [key, value] of formData.entries()) {
    finalFormData.append(key, value);
  }
  if (files?.file) {
    finalFormData.append("file", files.file);
  }

  // Upload metadata
  const metadataResponse = await fetch("https://pump.fun/api/ipfs", {
    method: "POST",
    body: finalFormData
  });

  if (!metadataResponse.ok) {
    throw new Error(`Metadata upload failed: ${metadataResponse.statusText}`);
  }

  return await metadataResponse.json();
}

/**
 * Create token launch transaction
 */
async function createTokenTransaction(
  wallet: Keypair,
  mintKeypair: Keypair,
  metadataResponse: any,
  options?: PumpFunTokenOptions,
) {
  const payload = {
    publicKey: wallet.publicKey.toBase58(),
    action: "create",
    tokenMetadata: {
      name: metadataResponse.metadata.name,
      symbol: metadataResponse.metadata.symbol,
      uri: metadataResponse.metadataUri,
    },
    mint: mintKeypair.publicKey.toBase58(),
    denominatedInSol: "true",
    amount: options?.initialLiquiditySOL || 0.0001,
    slippage: options?.slippageBps || 5,
    priorityFee: options?.priorityFee || 0.00005,
    pool: "pump",
  };

  const response = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Transaction creation failed: ${response.status} - ${errorText}`);
  }

  return response;
}

/**
 * Sign and send transaction
 */
async function signAndSendTransaction(
  connection: Connection,
  wallet: Keypair,
  tx: VersionedTransaction,
  mintKeypair: Keypair,
): Promise<string> {
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.message.recentBlockhash = blockhash;
    tx.sign([mintKeypair, wallet]);

    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 5,
    });

    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }

    return signature;
  } catch (error) {
    console.error("Transaction send error:", error);
    if (error instanceof Error && "logs" in error) {
      console.error("Transaction logs:", (error as any).logs);
    }
    throw error;
  }
}

/**
 * Launch a token on Pump.fun
 * @param tokenName Token name
 * @param tokenTicker Token ticker symbol
 * @param description Token description
 * @param imageUrl Token image URL
 * @param options Additional options including connection details
 * @returns Transaction signature, mint address and metadata URI
 */
export async function launchPumpFunToken(
  tokenName: string,
  tokenTicker: string,
  description: string,
  imageUrl: string,
  options?: PumpFunTokenOptions
): Promise<LaunchResponse> {
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
    const mintKeypair = Keypair.generate();

    // Upload metadata
    const metadataResponse = await uploadMetadata(
      tokenName,
      tokenTicker,
      description,
      imageUrl,
      options
    );

    // Create transaction
    const response = await createTokenTransaction(
      wallet,
      mintKeypair,
      metadataResponse,
      options
    );

    // Process and send transaction
    const transactionData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(transactionData));
    const signature = await signAndSendTransaction(connection, wallet, tx, mintKeypair);

    return {
      signature,
      mint: mintKeypair.publicKey.toBase58(),
      metadataUri: metadataResponse.metadataUri,
    };

  } catch (error) {
    console.error("Error launching PumpFun token:", error);
    if (error instanceof Error && "logs" in error) {
      console.error("Transaction logs:", (error as any).logs);
    }
    throw new Error(`Token launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}