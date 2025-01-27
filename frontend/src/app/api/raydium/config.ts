// src/app/api/raydium/config.ts

import { 
  Raydium, 
  TxVersion, 
  parseTokenAccountResp 
} from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

// Environment validation
const validateEnv = () => {
  const privateKeyString = process.env.SOLANA_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

  if (!privateKeyString) {
    throw new Error('Missing SOLANA_PRIVATE_KEY in environment variables');
  }
  if (!rpcUrl) {
    throw new Error('Missing RPC_URL or NEXT_PUBLIC_SOLANA_RPC_URL in environment variables');
  }

  return { privateKeyString, rpcUrl };
};

// Parse private key
const parsePrivateKey = (privateKeyString: string | number[]) => {
  try {
    if (Array.isArray(privateKeyString)) {
      return new Uint8Array(privateKeyString);
    }
    return new Uint8Array(JSON.parse(privateKeyString));
  } catch (error) {
    throw new Error('Invalid private key format. Must be an array of numbers.');
  }
};

// Initialize connection and owner
const initializeConnection = () => {
  try {
    const { privateKeyString, rpcUrl } = validateEnv();
    const privateKeyArray = parsePrivateKey(privateKeyString);

    // Setup connection with WebSocket endpoint
    const wsEndpoint = rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    
    const connection = new Connection(rpcUrl, {
      wsEndpoint,
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
      confirmTransactionInitialTimeout: 120000 // 2 minutes
    });

    const owner = Keypair.fromSecretKey(privateKeyArray);
    return { connection, owner };
  } catch (error) {
    console.error('Failed to initialize connection:', error);
    throw error;
  }
};

// Initialize basic configuration
const { connection, owner } = initializeConnection();
export const txVersion = TxVersion.V0;

// Token account data fetching with retries
export const fetchTokenAccountData = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const solAccountResp = await connection.getAccountInfo(owner.publicKey);
      const tokenAccountResp = await connection.getTokenAccountsByOwner(
        owner.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );
      const token2022Req = await connection.getTokenAccountsByOwner(
        owner.publicKey,
        { programId: TOKEN_2022_PROGRAM_ID }
      );

      return parseTokenAccountResp({
        owner: owner.publicKey,
        solAccountResp,
        tokenAccountResp: {
          context: tokenAccountResp.context,
          value: [...tokenAccountResp.value, ...token2022Req.value],
        },
      });
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Failed to fetch token account data after retries');
};

// Raydium SDK singleton
class RaydiumSDK {
  private static instance: Raydium | null = null;
  private static isInitializing = false;

  static async initialize(): Promise<Raydium> {
    if (this.isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.initialize();
    }

    if (!this.instance) {
      try {
        this.isInitializing = true;
        
        this.instance = await Raydium.load({
          owner,
          connection,
          // Use mainnet or devnet based on environment
          cluster: process.env.SOLANA_NETWORK === 'devnet' ? 'devnet' : 'mainnet',
          disableFeatureCheck: true,
          // Remove disableGRPC as it's not a valid option
          blockhashCommitment: 'finalized',
          disableLoadToken: false
        });

        // Initialize token account data
        const tokenAccountData = await fetchTokenAccountData();
        this.instance.account.updateTokenAccount(tokenAccountData);

        // Setup account change listener
        connection.onAccountChange(owner.publicKey, async () => {
          if (this.instance) {
            const updatedData = await fetchTokenAccountData();
            this.instance.account.updateTokenAccount(updatedData);
          }
        });

      } catch (error) {
        console.error('Failed to initialize Raydium SDK:', error);
        this.instance = null;
        throw error;
      } finally {
        this.isInitializing = false;
      }
    }

    if (!this.instance) {
      throw new Error('Failed to initialize Raydium SDK');
    }

    return this.instance;
  }

  static async getInstance(): Promise<Raydium> {
    if (!this.instance) {
      return this.initialize();
    }
    return this.instance;
  }
}

// Helper function for retries
export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> => {
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (error?.message?.includes('429')) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
};

// Export main SDK initialization function
export const initSdk = async () => {
  try {
    return await RaydiumSDK.getInstance();
  } catch (error) {
    console.error('Failed to initialize SDK:', error);
    throw error;
  }
};

// Export essential objects
export {
  connection,
  owner
};