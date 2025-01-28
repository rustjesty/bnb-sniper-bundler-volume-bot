// src/tools/raydium/client-config.ts
import { Connection, Commitment } from '@solana/web3.js';
import { RaydiumConfig, ConnectionOptions } from './core/types';
import { EnvironmentValidator } from './validation';


const DEFAULT_CONFIG: RaydiumConfig = {
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  cluster: 'mainnet-beta',
  commitment: 'confirmed' as Commitment
};

const DEFAULT_CONNECTION_OPTIONS: ConnectionOptions = {
  commitment: 'confirmed' as Commitment,
  confirmTransactionInitialTimeout: 60000,
  wsEndpoint: undefined // Disable WebSocket for browser
};

interface ClientState {
  isLoading: boolean;
  error: Error | null;
  retryCount: number;
  lastRetryTime: number;
}

class ClientConnection {
  private static instance: ClientConnection;
  private connection: Connection | null = null;
  private config!: RaydiumConfig;
  private state: ClientState;
  private maxRetries = 3;
  private retryDelay = 1000;

  private constructor() {
    this.state = {
      isLoading: false,
      error: null,
      retryCount: 0,
      lastRetryTime: 0
    };

    this.initializeConfig();
  }

  private initializeConfig() {
    try {
      EnvironmentValidator.validateClientEnv();
      
      this.config = {
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_CONFIG.rpcUrl,
        cluster: (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as 'mainnet-beta' | 'devnet') || DEFAULT_CONFIG.cluster,
        commitment: (process.env.NEXT_PUBLIC_COMMITMENT_LEVEL as Commitment) || DEFAULT_CONFIG.commitment
      };

      EnvironmentValidator.validateConfig(this.config);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  static createClientInstance(): ClientConnection {
    if (!ClientConnection.instance) {
      ClientConnection.instance = new ClientConnection();
    }
    return ClientConnection.instance;
  }

  async getConnection(): Promise<Connection> {
    try {
      this.state.isLoading = true;
      
      if (!this.connection) {
        this.connection = await this.createConnectionWithRetry();
      }
      
      return this.connection;
    } finally {
      this.state.isLoading = false;
    }
  }

  private async createConnectionWithRetry(): Promise<Connection> {
    while (this.state.retryCount < this.maxRetries) {
      try {
        const connection = new Connection(
          this.config.rpcUrl, 
          {
            commitment: this.config.commitment,
            confirmTransactionInitialTimeout: DEFAULT_CONNECTION_OPTIONS.confirmTransactionInitialTimeout,
            wsEndpoint: DEFAULT_CONNECTION_OPTIONS.wsEndpoint
          }
        );
        await connection.getLatestBlockhash();
        return connection;
      } catch (error) {
        await this.handleRetry(error as Error);
      }
    }
    throw new Error('Failed to establish connection after multiple retries');
  }

  private async handleRetry(error: Error) {
    this.state.retryCount++;
    this.state.error = error;
    this.state.lastRetryTime = Date.now();
    
    const delay = this.retryDelay * Math.pow(2, this.state.retryCount - 1);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private handleError(error: Error) {
    this.state.error = error;
    console.error('[Raydium Client Error]:', error);
  }

  getClientState(): Readonly<ClientState> {
    return { ...this.state };
  }

  async reconnect(): Promise<Connection> {
    this.connection = null;
    this.state.retryCount = 0;
    this.state.error = null;
    return this.getConnection();
  }

  getConfig(): Readonly<RaydiumConfig> {
    return { ...this.config };
  }
}

export const createClientInstance = () => ClientConnection.createClientInstance();
export const getClientConnection = () => ClientConnection.createClientInstance();