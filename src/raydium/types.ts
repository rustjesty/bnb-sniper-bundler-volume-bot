import { Connection, Keypair, type Cluster } from '@solana/web3.js';
import { Raydium } from '@raydium-io/raydium-sdk-v2';

// Base configuration types
export interface BaseConfig {
  rpcUrl: string;
  cluster: Cluster;
  commitment: 'processed' | 'confirmed' | 'finalized';
}

// Client-specific configuration
export interface ClientConfig extends BaseConfig {
  maxRetries: number;
  retryDelay: number;
  wsEndpoint?: string | null;
}

// Server-specific configuration
export interface ServerConfig extends BaseConfig {
  privateKey: string;
  publicKey: string;
  maxConcurrentRequests: number;
  timeoutMs: number;
}

// Connection options
export interface ConnectionOptions {
  commitment: string;
  confirmTransactionInitialTimeout: number;
  wsEndpoint?: string;
  disableRetryOnRateLimit?: boolean;
}

// Service interfaces
export interface RaydiumService {
  connection: Connection;
  raydium?: Raydium;
  initialize(): Promise<Raydium>;
}

export interface ConnectionManager {
  getConnection(): Connection;
  reconnect(): Connection;
}

// Operation parameters
export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippage: number;
  isInputAmount: boolean;
}

export interface PoolParams {
  baseMint: string;
  quoteMint: string;
  baseAmount: number;
  quoteAmount: number;
}

export interface LiquidityParams {
  poolId: string;
  amount: number;
  isAdd: boolean;
}

// Response types
export interface TransactionResponse {
  signature: string;
  status: 'success' | 'error';
  error?: string;
}

export interface PoolInfo {
  id: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  baseReserve: number;
  quoteReserve: number;
  lpSupply: number;
}

// Error types
export interface RaydiumError {
  code: string;
  message: string;
  details?: unknown;
}

// Utility types
export type RpcEndpoint = {
  url: string;
  name: 'primary' | 'fallback';
  weight: number;
};

export type ConnectionState = {
  isHealthy: boolean;
  latency: number;
  errorCount: number;
  lastChecked: number;
};

// Type guards
export const isRaydiumError = (error: unknown): error is RaydiumError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
};

// Enums
export enum RaydiumErrorCode {
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  WALLET_ERROR = 'WALLET_ERROR',
  TRANSACTION_ERROR = 'TRANSACTION_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

// Constants
export const DEFAULT_CONFIG: Partial<ClientConfig> = {
  maxRetries: 3,
  retryDelay: 1000,
  commitment: 'confirmed',
} as const;

// Export groups
export type {
  // Service types
  Raydium,
  Connection,
  Keypair,
  
  // Configuration types
  ClientConfig as RaydiumClientConfig,
  ServerConfig as RaydiumServerConfig,
  
  // Operation types
  SwapParams as RaydiumSwapParams,
  PoolParams as RaydiumPoolParams,
  LiquidityParams as RaydiumLiquidityParams,
  
  // Response types
  TransactionResponse as RaydiumTransactionResponse,
  PoolInfo as RaydiumPoolInfo,
};

export type RaydiumErrorType = 
  | 'INITIALIZATION_FAILED'
  | 'CONNECTION_ERROR'
  | 'INVALID_PARAMETERS'
  | 'UNKNOWN';
