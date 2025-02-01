import { Connection, Commitment } from '@solana/web3.js';
import { cleanEnv, str, num } from 'envalid';

// Environment Validation
const clientEnv = cleanEnv(process.env, {
  NEXT_PUBLIC_RPC_URL: str({
    desc: 'Primary RPC endpoint URL',
    default: 'https://api.mainnet-beta.solana.com'
  }),
  NEXT_PUBLIC_RPC_TIMEOUT: num({
    default: 60_000,
    desc: 'Connection timeout in milliseconds'
  })
});

// Type Definitions
export interface ClientConnectionConfig {
  readonly url: string;
  readonly commitment: Commitment;
  readonly timeout: number;
  readonly priority: number;
}

// Runtime Configuration
export const CLIENT_CONFIG = {
  get endpoints(): ClientConnectionConfig[] {
    return [
      {
        url: clientEnv.NEXT_PUBLIC_RPC_URL,
        commitment: 'confirmed' as Commitment,
        timeout: clientEnv.NEXT_PUBLIC_RPC_TIMEOUT,
        priority: 1
      },
      {
        url: 'https://api.mainnet-beta.solana.com',
        commitment: 'confirmed' as Commitment,
        timeout: 60_000,
        priority: 2
      }
    ].sort((a, b) => a.priority - b.priority);
  },

  get retryPolicy() {
    return {
      maxAttempts: 3,
      baseDelay: 1000,
      backoffFactor: 2
    };
  }
} as const;

// Add createClientConnection function
export function createClientConnection(): Connection {
  const primaryEndpoint = CLIENT_CONFIG.endpoints[0];
  return new Connection(primaryEndpoint.url, {
    commitment: primaryEndpoint.commitment,
    disableRetryOnRateLimit: false,
    confirmTransactionInitialTimeout: primaryEndpoint.timeout
  });
}

// Connection Management
export class ConnectionManager {
  private static instance: ConnectionManager;
  private connections: Map<string, Connection> = new Map();
  private healthStatus: Map<string, boolean> = new Map();

  private constructor() {
    this.initializeConnections();
    this.startHealthChecks();
  }

  private initializeConnections() {
    CLIENT_CONFIG.endpoints.forEach(config => {
      const connection = new Connection(config.url, {
        commitment: config.commitment,
        disableRetryOnRateLimit: false,
        confirmTransactionInitialTimeout: config.timeout
      });
      this.connections.set(config.url, connection);
      this.healthStatus.set(config.url, true);
    });
  }

  private async testEndpointHealth(url: string): Promise<boolean> {
    try {
      const connection = this.connections.get(url)!;
      const slot = await connection.getSlot();
      return typeof slot === 'number' && slot > 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Health check failed for ${url}: ${errorMessage}`);
      return false;
    }
  }

  private async startHealthChecks() {
    setInterval(async () => {
      for (const [url] of this.connections) {
        const isHealthy = await this.testEndpointHealth(url);
        this.healthStatus.set(url, isHealthy);
      }
    }, 30_000); // Check every 30 seconds
  }

  async healthCheck(): Promise<boolean> {
    try {
      const connection = this.getHealthyConnection();
      const slot = await connection.getSlot();
      return typeof slot === 'number' && slot > 0;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      if (CLIENT_CONFIG.endpoints.length === 0) {
        throw new Error('No valid RPC endpoints configured');
      }
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  getHealthyConnection(): Connection {
    const healthyEndpoints = Array.from(this.connections.entries())
      .filter(([url]) => this.healthStatus.get(url))
      .map(([, conn]) => conn);

    if (healthyEndpoints.length === 0) {
      throw new Error('All RPC endpoints unavailable');
    }

    return healthyEndpoints[0]; // Return highest priority healthy connection
  }

  getConnection(): Connection {
    return this.getHealthyConnection();
  }

  async executeWithRetry<T>(
    operation: (connection: Connection) => Promise<T>
  ): Promise<T> {
    let attempt = 0;
    let lastError: Error = new Error('No error occurred yet');

    while (attempt < CLIENT_CONFIG.retryPolicy.maxAttempts) {
      try {
        const connection = this.getHealthyConnection();
        return await operation(connection);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error occurred');
        attempt++;
        
        const delay = CLIENT_CONFIG.retryPolicy.baseDelay * 
          Math.pow(CLIENT_CONFIG.retryPolicy.backoffFactor, attempt);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Operation failed after ${attempt} attempts: ${lastError.message}`);
  }
}

// Client Initialization
export function initializeClient(): void {
  try {
    const manager = ConnectionManager.getInstance();
    console.log('Client RPC endpoints initialized:', 
      CLIENT_CONFIG.endpoints.map(e => e.url));
  } catch (error) {
    console.error('Failed to initialize client configuration:', error);
    throw error;
  }
}

// Type Exports
export type ClientConfig = typeof CLIENT_CONFIG;