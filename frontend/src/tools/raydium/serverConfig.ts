import { Keypair } from '@solana/web3.js';

// Server-specific Configuration
export const SERVER_CONFIG = {
  NETWORK: process.env.NEXT_PUBLIC_NETWORK || 'mainnet',
  CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet' 
    ? 'devnet' 
    : 'mainnet-beta',
} as const;

export interface EnvironmentConfig {
  privateKey: string;
  rpcUrl: string;
  network: 'mainnet' | 'devnet';
}

export async function getWalletFromServer(): Promise<Keypair> {
  const response = await fetch('/api/wallet/init');
  if (!response.ok) {
    throw new Error('Failed to initialize wallet');
  }
  const { keypair } = await response.json();
  return Keypair.fromSecretKey(new Uint8Array(keypair));
}

// Export server-specific functions and types
export const initializeServerConfig = () => {
  // ...initialization logic...
};

export const createServerConnection = async () => {
  const keypair = await getWalletFromServer();
  // ...create connection logic...
  return keypair;
};

// Export server types and utilities
export type ServerConfig = typeof SERVER_CONFIG;
