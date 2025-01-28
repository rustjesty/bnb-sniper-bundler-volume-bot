// src/tools/raydium/server-config.ts
import 'server-only'; // Next.js utility to ensure server-side only code

import { Connection } from '@solana/web3.js';
//import { RaydiumConfig, ConnectionOptions } from './types';
import { RateLimiter } from './utils/rateLimiter';
import { RequestValidator } from './utils/requestValidator';
import { RaydiumConfig } from './core/types';

interface ServerState {
  isInitialized: boolean;
  lastRequestTime: number;
  requestCount: number;
}

class ServerConnection {
  private static instance: ServerConnection;
  private connection: Connection | null = null;
  private config!: RaydiumConfig;
  private state: ServerState;
  private rateLimiter!: RateLimiter;
  private validator!: RequestValidator;

  private constructor() {
    this.state = {
      isInitialized: false,
      lastRequestTime: 0,
      requestCount: 0
    };

    this.initializeServer();
  }

  private initializeServer() {
    if (!process.env.RPC_PRIVATE_URL || !process.env.API_SECRET_KEY) {
      throw new Error('Missing required server environment variables');
    }

    this.config = {
      rpcUrl: process.env.RPC_PRIVATE_URL,
      cluster: (process.env.SOLANA_CLUSTER as 'mainnet-beta' | 'devnet') || 'mainnet-beta',
      commitment: 'confirmed',
      timeout: 30000
    };

    this.rateLimiter = new RateLimiter({
      maxRequests: 100,
      windowMs: 60000
    });

    this.validator = new RequestValidator({
      apiKey: process.env.API_SECRET_KEY
    });

    this.state.isInitialized = true;
  }

  static createServerInstance(): ServerConnection {
    if (!ServerConnection.instance) {
      ServerConnection.instance = new ServerConnection();
    }
    return ServerConnection.instance;
  }

  async validateRequest(apiKey: string, operation: string): Promise<boolean> {
    if (!this.validator.isValidApiKey(apiKey)) {
      throw new Error('Invalid API key');
    }

    if (!this.rateLimiter.checkLimit(apiKey)) {
      throw new Error('Rate limit exceeded');
    }

    // Log private operation attempt
    console.info(`Private operation requested: ${operation}`);
    return true;
  }

  async executePrivateOperation<T>(
    apiKey: string,
    operation: string,
    handler: () => Promise<T>
  ): Promise<T> {
    await this.validateRequest(apiKey, operation);
    
    try {
      return await handler();
    } catch (error) {
      console.error(`Private operation failed: ${operation}`, error);
      throw error;
    } finally {
      this.updateRequestMetrics(apiKey);
    }
  }

  private updateRequestMetrics(apiKey: string) {
    this.state.lastRequestTime = Date.now();
    this.state.requestCount++;
    this.rateLimiter.incrementCounter(apiKey);
  }

  async getSecureConnection(apiKey: string): Promise<Connection> {
    await this.validateRequest(apiKey, 'getConnection');
    
    if (!this.connection) {
      this.connection = new Connection(this.config.rpcUrl, {
        commitment: this.config.commitment,
        confirmTransactionInitialTimeout: this.config.timeout
      });
    }
    
    return this.connection;
  }

  getServerMetrics(): Readonly<ServerState> {
    return { ...this.state };
  }
}

export const createServerInstance = () => ServerConnection.createServerInstance();