import { Connection, VersionedTransaction, PublicKey, Transaction } from '@solana/web3.js';
import logger from './logger';
import { parsePrivateKey } from './keys';
import { tryBase58Decode, isValidBase58 } from './base58';

// Types
interface WalletBalance {
  balance: number;
  address: string;
} 
  
interface TransactionResult {
  signature: string;
  status: 'success' | 'error';
  message: string;
}

interface RPCConfig {
  url: string;
  name: 'quicknode' | 'helius' | 'fallback';
}

interface ConnectionConfig {
  primary: RPCConfig | null;
  fallback: RPCConfig | null;
}

interface ConnectionState {
  connection: Connection;
  lastHealthCheck: number;
  errorCount: number;
}

export class AgentWallet {
  private primaryConnection: ConnectionState | null = null;
  private fallbackConnection: ConnectionState | null = null;
  private isUsingFallback: boolean = false;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 2000;
  private readonly healthCheckInterval = 30000; // 30 seconds

  constructor() {
    // Initialize RPC configurations
    const config = this.initializeConfig();
    
    // Set up connections
    if (config.primary) {
      this.primaryConnection = this.createConnection(config.primary.url);
    }

    if (config.fallback) {
      this.fallbackConnection = this.createConnection(config.fallback.url);
      if (!config.primary) {
        this.primaryConnection = this.fallbackConnection;
      }
    }

    this.baseUrl = process.env.BOT_API_BASE_URL || 
                   process.env.NEXT_PUBLIC_API_BASE_URL || 
                   'http://localhost:3000';

    // Validate configuration
    if (!this.primaryConnection && !this.fallbackConnection) {
      throw new Error('No RPC connections available');
    }
  }

  private initializeConfig(): ConnectionConfig {
    let quickNodeUrl = process.env.NEXT_PUBLIC_QUICKNODE_RPC_URL;
    const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;

    const config: ConnectionConfig = {
      primary: null,
      fallback: null
    };

    if (quickNodeUrl) {
      // Ensure QuickNode URL has proper protocol
      quickNodeUrl = this.validateAndFormatUrl(quickNodeUrl);
      config.primary = {
        url: quickNodeUrl,
        name: 'quicknode'
      };
    }

    if (heliusApiKey) {
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      config[quickNodeUrl ? 'fallback' : 'primary'] = {
        url: heliusUrl,
        name: 'helius'
      };
    }

    // Use public fallback if no other options
    if (!config.primary && !config.fallback) {
      config.primary = {
        url: process.env.NEXT_PUBLIC_FALLBACK_RPC_URL || 'https://api.mainnet-beta.solana.com',
        name: 'fallback'
      };
    }

    return config;
  }

  private validateAndFormatUrl(url: string): string {
    // Remove any trailing slashes
    url = url.trim().replace(/\/+$/, '');
    
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid RPC URL format: ${url}`);
    }
    
    return url;
  }

  // Safe connection creation with validation and health monitoring
  private createConnection(url: string): ConnectionState {
    try {
      const validatedUrl = this.validateAndFormatUrl(url);
      
      const connection = new Connection(validatedUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
        wsEndpoint: undefined,
        fetch: this.createSafeFetch()
      });

      return {
        connection,
        lastHealthCheck: Date.now(),
        errorCount: 0
      };
    } catch (error) {
      logger.error('Connection creation failed:', error);
      throw error;
    }
  }

  // Safe fetch with timeout and retries
  private createSafeFetch() {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const timeout = 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
          headers: {
            ...init?.headers,
            'Content-Type': 'application/json'
          }
        });
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };
  }

  // Connection health monitoring
  private async checkConnectionHealth(state: ConnectionState): Promise<boolean> {
    try {
      const start = performance.now();
      await state.connection.getSlot();
      const latency = performance.now() - start;

      // Update health metrics
      state.lastHealthCheck = Date.now();
      state.errorCount = Math.max(0, state.errorCount - 1);

      return latency < 1000; // Consider healthy if latency < 1s
    } catch (error) {
      state.errorCount++;
      logger.error('Connection health check failed:', error);
      return false;
    }
  }

  // Safe connection getter with health check
  public async getActiveConnection(): Promise<Connection> {
    const now = Date.now();

    // Check primary connection health
    if (!this.isUsingFallback && this.primaryConnection) {
      if (now - this.primaryConnection.lastHealthCheck > this.healthCheckInterval) {
        const isHealthy = await this.checkConnectionHealth(this.primaryConnection);
        if (!isHealthy && this.primaryConnection.errorCount >= 3) {
          this.isUsingFallback = true;
          logger.warn('Switching to fallback connection');
        }
      }
      if (!this.isUsingFallback) {
        return this.primaryConnection.connection;
      }
    }

    // Check fallback connection
    if (this.fallbackConnection) {
      if (now - this.fallbackConnection.lastHealthCheck > this.healthCheckInterval) {
        const isHealthy = await this.checkConnectionHealth(this.fallbackConnection);
        if (!isHealthy && this.fallbackConnection.errorCount >= 3) {
          throw new Error('All connections unhealthy');
        }
      }
      return this.fallbackConnection.connection;
    }

    throw new Error('No available connections');
  }

  public async getBalance(): Promise<WalletBalance> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/wallet`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (!this.isValidBalanceResponse(data)) {
          throw new Error('Invalid balance response format');
        }

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        logger.warn(`Balance fetch attempt ${attempt} failed:`, error);
        
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    throw lastError || new Error('Failed to get wallet balance');
  }


  public async sendSOL(recipient: string, amount: number): Promise<TransactionResult> {
    try {
      // Validate inputs
      if (!this.isValidPublicKey(recipient)) {
        throw new Error('Invalid recipient address');
      }

      if (!this.isValidAmount(amount)) {
        throw new Error('Invalid amount');
      }

      const response = await fetch(`${this.baseUrl}/api/wallet/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          recipient, 
          amount,
          rpcUrl: this.isUsingFallback ? 'helius' : 'quicknode' 
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transaction failed');
      }

      return await response.json();
    } catch (error) {
      logger.error('Error sending SOL:', error);
      throw error;
    }
  }

  public async signAndSendTransaction(transaction: VersionedTransaction): Promise<string> {
    try {
      const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
      
      const response = await fetch(`${this.baseUrl}/api/wallet/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transaction: serializedTransaction,
          rpcUrl: this.isUsingFallback ? 'helius' : 'quicknode' 
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transaction signing failed');
      }

      const result = await response.json();
      return result.signature;
    } catch (error) {
      logger.error('Transaction signing error:', error);
      throw error;
    }
  }

  public async getAddress(): Promise<string> {
    const walletInfo = await this.getBalance();
    return walletInfo.address;
  }

  // Safe initialization with proper validation
  public async initialize(): Promise<boolean> { 
    try {
      const configs = await this.validateConfigs();
      
      // Initialize connections with validated configs
      if (configs.primary) {
        this.primaryConnection = this.createConnection(configs.primary.url);
      }
      if (configs.fallback) {
        this.fallbackConnection = this.createConnection(configs.fallback.url);
      }

      // Verify at least one connection works
      const connection = await this.getActiveConnection();
      const slot = await connection.getSlot();
      
      logger.success('Wallet initialized. Current slot:', slot);
      return true;
    } catch (error) {
      logger.error('Wallet initialization failed:', error);
      return false;
    }
  }

  // Config validation with proper typing
  private async validateConfigs() {
    const configs = this.initializeConfig();
    
    if (!configs.primary && !configs.fallback) {
      throw new Error('No valid RPC configuration found');
    }

    // Validate URLs
    if (configs.primary && !this.isValidUrl(configs.primary.url)) {
      throw new Error('Invalid primary RPC URL');
    }
    if (configs.fallback && !this.isValidUrl(configs.fallback.url)) {
      throw new Error('Invalid fallback RPC URL');
    }

    return configs;
  }

  // URL validation helper
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  public async processWalletText(text: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tokenizer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error('Failed to process text');
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      logger.error('Error processing wallet text:', error);
      throw error;
    }
  }

  public parsePrivateKey(key: string): Uint8Array {
    return parsePrivateKey(key);
  }

  // Validation helpers
  // Public key validation with base58 check
  private isValidPublicKey(address: string): boolean {
    try {
      return isValidBase58(address) && new PublicKey(address) instanceof PublicKey;
    } catch {
      return false;
    }
  }

  private isValidAmount(amount: number): boolean {
    return amount > 0 && Number.isFinite(amount);
  }

  private isValidBalanceResponse(data: any): data is WalletBalance {
    return (
      data &&
      typeof data.balance === 'number' &&
      typeof data.address === 'string' &&
      this.isValidPublicKey(data.address)
    );
  }

  // Transaction validation helper
  private async validateTransaction(
    transaction: VersionedTransaction | Transaction
  ): Promise<boolean> {
    try {
      const connection = await this.getActiveConnection();
      const message = 'version' in transaction 
        ? transaction.message 
        : transaction.compileMessage();
        
      const { value: fee } = await connection.getFeeForMessage(message, 'confirmed');
      return fee !== null && fee !== undefined && fee <= 1e9; // Max 1 SOL fee
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const agentWallet = new AgentWallet();

// TransactionValidator class
export interface TransactionValidationConfig {
  maxFee: number;
  minConfirmations: number;
  timeout: number;
}

export class TransactionValidator {
  private static readonly DEFAULT_CONFIG: TransactionValidationConfig = {
    maxFee: 0.1, // SOL
    minConfirmations: 1,
    timeout: 60000 // ms
  };

  static async validateTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    config: Partial<TransactionValidationConfig> = {}
  ): Promise<{ isValid: boolean; reason?: string }> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    try {
      // Check fee
      const fee = await connection.getFeeForMessage(
        'version' in transaction ? transaction.message : transaction.compileMessage(),
        'confirmed'
      );

      if (!fee.value) {
        return { isValid: false, reason: 'Unable to estimate fee' };
      }

      if (fee.value / 1e9 > finalConfig.maxFee) {
        return { isValid: false, reason: 'Transaction fee too high' };
      }

      // Additional validation logic here
      return { isValid: true };
    } catch (error) {
      logger.error('Transaction validation error:', error);
      return { isValid: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async monitorTransaction(
    signature: string,
    connection: Connection,
    config: Partial<TransactionValidationConfig> = {}
  ): Promise<boolean> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    while (Date.now() - startTime < finalConfig.timeout) {
      try {
        const status = await connection.getSignatureStatus(signature);
        
        if (status.value?.confirmationStatus === 'finalized' || 
            (status.value?.confirmations ?? 0) >= finalConfig.minConfirmations) {
          return true;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error('Transaction monitoring error:', error);
      }
    }

    return false;
  }
}

// ConnectionMonitor class
export class ConnectionMonitor {
  private static readonly LATENCY_THRESHOLD = 1000; // ms
  private static readonly ERROR_THRESHOLD = 3;

  private errorCount = 0;
  private lastLatency = 0;

  constructor(private connection: Connection) {}

  async checkHealth(): Promise<{
    isHealthy: boolean;
    latency: number;
    errorCount: number;
  }> {
    try {
      const start = performance.now();
      await this.connection.getSlot();
      this.lastLatency = performance.now() - start;
      
      const isHealthy = this.lastLatency < ConnectionMonitor.LATENCY_THRESHOLD;
      
      if (!isHealthy) {
        this.errorCount++;
      } else {
        this.errorCount = Math.max(0, this.errorCount - 1);
      }

      return {
        isHealthy,
        latency: this.lastLatency,
        errorCount: this.errorCount
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Connection health check error:', error);
      
      return {
        isHealthy: false,
        latency: this.lastLatency,
        errorCount: this.errorCount
      };
    }
  }

  shouldSwitchEndpoint(): boolean {
    return this.errorCount >= ConnectionMonitor.ERROR_THRESHOLD;
  }

  reset(): void {
    this.errorCount = 0;
    this.lastLatency = 0;
  }
}
