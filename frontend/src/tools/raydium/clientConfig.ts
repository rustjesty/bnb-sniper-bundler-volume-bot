import { Connection } from '@solana/web3.js';

// Client-specific Configuration
export const CLIENT_CONFIG = {
  DEFAULT_RPC_URL: 'https://api.mainnet-beta.solana.com',
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

export const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_RPC_URL || CLIENT_CONFIG.DEFAULT_RPC_URL,
  CLIENT_CONFIG.DEFAULT_RPC_URL,
].filter(Boolean) as string[];

export class ConnectionManager {
  private static instance: ConnectionManager;
  private pool: Connection[];
  private currentIndex = 0;

  private constructor() {
    this.pool = RPC_ENDPOINTS.map(url => 
      new Connection(url, { 
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000
      })
    );
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  getConnection(): Connection {
    const connection = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.pool.length;
    return connection;
  }
}

// Export client-specific functions and types
export const initializeClientConfig = () => {
  // ...initialization logic...
};

export const createClientConnection = () => {
  return ConnectionManager.getInstance().getConnection();
};

// Export client types and utilities
export type ClientConfig = typeof CLIENT_CONFIG;
