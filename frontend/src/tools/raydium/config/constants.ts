// src/tools/raydium/config/constants.ts
export const RAYDIUM_CONFIG = {
    defaultRpcUrl: 'https://api.mainnet-beta.solana.com',
    network: 'devnet' as const
  };
  
  // src/tools/raydium/config/environment.ts
  import { Connection, Keypair } from '@solana/web3.js';
  import bs58 from 'bs58';
  
  export const validateRaydiumConfig = () => {
    if (typeof window !== 'undefined') {
      // Client-side - only use public variables
      return {
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || RAYDIUM_CONFIG.defaultRpcUrl,
        network: RAYDIUM_CONFIG.network,
        connection: new Connection(process.env.NEXT_PUBLIC_RPC_URL || RAYDIUM_CONFIG.defaultRpcUrl)
      };
    }
  
    // Server-side - can use private variables
    if (!process.env.SOLANA_PRIVATE_KEY) {
      throw new Error('SOLANA_PRIVATE_KEY not found in server environment');
    }
  
    const connection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || RAYDIUM_CONFIG.defaultRpcUrl);
    const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
  
    return {
      connection,
      keypair,
      network: RAYDIUM_CONFIG.network,
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || RAYDIUM_CONFIG.defaultRpcUrl
    };
  };