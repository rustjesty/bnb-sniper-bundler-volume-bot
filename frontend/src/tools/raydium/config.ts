// Keep original imports
import { getServerConnection } from './server-connection';
import { Raydium, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

// Types
import type { 
  ConnectionManager,
  RaydiumService} from './types';

import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, Cluster, ConnectionConfig, clusterApiUrl } from '@solana/web3.js';
import { createServerConnection, EnvironmentConfig, initializeServerConfig } from './serverConfig';
import { createClientConnection, initializeClientConfig } from './clientConfig';
import { ROUTE_CONFIG } from './routeConfig';
import { ServiceConfig } from './core/types';

// Core Exports
export * from './clientConfig';
export * from './serverConfig';
export * from './serviceExports';
export * from './core/accounts';
export * from './core/constants';
export * from './core/errors';
export * from './core/state';

// Environment Utilities
export const isClient = typeof window !== 'undefined';
export const isServer = !isClient;

// Connection Management
let _connection: Connection | undefined;

export const getConnection = (): Connection => {
  if (!_connection) {
    const cluster = networkHelpers.getCluster() || 'mainnet-beta';
    _connection = new Connection(clusterApiUrl(cluster));
  }
  return _connection;
};

// Raydium SDK Management
let raydium: Raydium | undefined;

// IMPORTANT: Keep txVersion as is since it's used across Raydium files
export const txVersion = TxVersion.V0;

// IMPORTANT: Keep initSdk signature as is since it's used across Raydium files
export const initSdk = async (params?: { loadToken?: boolean }) => {
  if (raydium) return raydium;

  const currentOwner = owner();
  const connection = getConnection();
  const cluster = networkHelpers.getCluster(); // Now returns Cluster type

  if (connection.rpcEndpoint === clusterApiUrl('mainnet-beta')) {
    console.warn('using free rpc node might cause unexpected error, strongly suggest uses paid rpc node');
  }

  console.log(`connect to rpc ${connection.rpcEndpoint} in ${cluster}`);

  raydium = await Raydium.load({
    owner: currentOwner,
    connection,
    //cluster,  // Now correctly typed as Cluster
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: 'finalized'
  });

  return raydium;
};

export const owner = (): Keypair => {
  const privateKey = isServer 
    ? process.env.PRIVATE_KEY 
    : process.env.NEXT_PUBLIC_PRIVATE_KEY;
    
  if (!privateKey) throw new Error('Private key is required');
  return Keypair.fromSecretKey(bs58.decode(privateKey));
};

export const fetchTokenAccountData = async () => {
  const currentOwner = owner();
  const connection = getConnection();
  
  const solAccountResp = await connection.getAccountInfo(currentOwner.publicKey);
  const tokenAccountResp = await connection.getTokenAccountsByOwner(currentOwner.publicKey, { 
    programId: TOKEN_PROGRAM_ID 
  });
  const token2022Req = await connection.getTokenAccountsByOwner(currentOwner.publicKey, { 
    programId: TOKEN_2022_PROGRAM_ID 
  });

  const tokenAccountData = parseTokenAccountResp({
    owner: currentOwner.publicKey,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  });

  return tokenAccountData;
};

export const initializeHelpers = {
  async getWalletFromServer(): Promise<Keypair> {
    const response = await fetch('/api/wallet/init');
    if (!response.ok) {
      throw new Error('Failed to initialize wallet');
    }
    const { keypair } = await response.json();
    return Keypair.fromSecretKey(new Uint8Array(keypair));
  },
};

export const errorHandlers = {
  handleInitializationError(error: Error) {
    console.error('Initialization error:', error);
    throw new Error('Failed to initialize');
  },
  handleConfigurationError(error: Error) {
    console.error('Configuration error:', error);
    throw new Error('Invalid configuration');
  },
  handleConnectionError(error: Error) {
    console.error('Connection error:', error);
    throw new Error('Failed to establish connection');
  },
  handleValidationError(error: Error) {
    console.error('Validation error:', error);
    throw new Error('Validation failed');
  },
  handleTypeError(error: Error) {
    console.error('Type error:', error);
    throw new Error('Type mismatch');
  },
};

export const networkHelpers = {
  getCluster(): Cluster {  // Remove undefined from return type
    return process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet' ? 'devnet' : 'mainnet-beta' as Cluster;
  },
};

export const configValidators = {
  validateEnvironmentConfig(config: any): boolean {
    if (!config.rpcUrl) {
      throw new Error('RPC URL is required');
    }
    if (!config.network) {
      throw new Error('Network configuration is required');
    }
    if (!config.privateKey) {
      throw new Error('Private key is required');
    }
    return true;
  },
};

export const getEnvVar = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (!value) {
    console.warn(`Environment variable ${key} is not set. Using fallback value: ${fallback}`);
    return fallback;
  }
  return value;
};

export const getServerEnvVar = (key: string, fallback: string): string => {
  if (isServer) {
    return getEnvVar(key, fallback);
  }
  throw new Error(`Environment variable ${key} is only accessible on the server side.`);
};

export const getClientEnvVar = (key: string, fallback: string): string => {
  if (isClient) {
    return getEnvVar(key, fallback);
  }
  throw new Error(`Environment variable ${key} is only accessible on the client side.`);
};

// Types
export type EnvironmentType = 'client' | 'server';

export interface ConnectionType {
  connection: Connection;
  owner: Keypair;
}

export interface ErrorType {
  message: string;
  code?: number;
}

export type UtilityType = {
  [key: string]: any;
};

// Constants and types exports
export {
  TxVersion,
  type EnvironmentConfig,
};

// Re-export everything
export {
  initializeClientConfig,
  initializeServerConfig,
  createServerConnection,
  getServerConnection,
  RaydiumService,
  ROUTE_CONFIG,
  ConnectionManager
};

export type {
  ConnectionConfig,
  ServiceConfig
};

export const SHARED_CONFIG = {
  defaultCommitment: 'confirmed',
  maxRetries: 3,
  timeout: 30000,
  networks: {
    mainnet: 'mainnet-beta',
    devnet: 'devnet',
    testnet: 'testnet'
  }
};

// Initialize function
export const initialize = async () => {
  if (isServer) {
    return createServerConnection();
  }
  return createClientConnection();
};