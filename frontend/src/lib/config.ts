// src/lib/config.ts
export const config = {
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
    network: process.env.NEXT_PUBLIC_NETWORK || 'devnet',
  };