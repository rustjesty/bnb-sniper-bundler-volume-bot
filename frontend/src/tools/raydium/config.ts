import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'
import { Connection, Keypair, clusterApiUrl, Cluster } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'
import { parsePrivateKey } from '../../utils/keys'

// Configuration constants
const CONFIG = {
  DEFAULT_RPC_URL: 'https://api.mainnet-beta.solana.com',
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

// Environment configuration
const ENV_CONFIG = {
  RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || CONFIG.DEFAULT_RPC_URL,
  NETWORK: process.env.NEXT_PUBLIC_NETWORK || 'mainnet',
  CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet' 
    ? 'devnet' as Cluster 
    : 'mainnet-beta' as Cluster | undefined,
} as const;

// Define types for environment validation
interface EnvironmentConfig {
  privateKey: string;
  rpcUrl: string;
  network: 'mainnet' | 'devnet';
}

// RPC endpoints configuration
const RPC_ENDPOINTS = [
  ENV_CONFIG.RPC_URL,
  CONFIG.DEFAULT_RPC_URL,
].filter(Boolean) as string[];

// Connection Manager implementation
class ConnectionManager {
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

// Raydium Service implementation
class RaydiumService {
  private static instance: RaydiumService;
  private raydium?: Raydium;
  private connectionManager: ConnectionManager;

  private constructor() {
    this.connectionManager = ConnectionManager.getInstance();
  }

  static getInstance(): RaydiumService {
    if (!RaydiumService.instance) {
      RaydiumService.instance = new RaydiumService();
    }
    return RaydiumService.instance;
  }

  private async getWalletFromServer(): Promise<Keypair> {
    const response = await fetch('/api/wallet/init');
    if (!response.ok) {
      throw new Error('Failed to initialize wallet');
    }
    const { keypair } = await response.json();
    return Keypair.fromSecretKey(new Uint8Array(keypair));
  }

  async initialize(): Promise<Raydium> {
    if (this.raydium) return this.raydium;

    if (typeof window === 'undefined') {
      throw new Error('Raydium must be initialized client-side');
    }

    try {
      const connection = this.connectionManager.getConnection();
      const owner = await this.getWalletFromServer();
      
      // Pass cluster as optional parameter
      const cluster = ENV_CONFIG.CLUSTER === 'devnet' ? ENV_CONFIG.CLUSTER : undefined;
      
      this.raydium = await Raydium.load({
        connection,
        owner,
        cluster,
        disableFeatureCheck: true,
        blockhashCommitment: 'finalized',
      });

      return this.raydium;
    } catch (error) {
      console.error('Raydium initialization error:', error);
      throw new Error('Failed to initialize Raydium');
    }
  }

  getConnection(): Connection {
    return this.connectionManager.getConnection();
  }
}

// Export singleton instance getter
export const getRaydiumService = () => RaydiumService.getInstance();

// Convenience initialization function
export const initializeRaydium = async (): Promise<Raydium> => {
  return await getRaydiumService().initialize();
};

// Export constants and types
export {
  CONFIG,
  ENV_CONFIG,
  ConnectionManager,
  RaydiumService,
  TxVersion,
  type EnvironmentConfig,
};