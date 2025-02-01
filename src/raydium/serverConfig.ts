import { Connection, Keypair, Cluster, Commitment } from '@solana/web3.js';
import bs58 from 'bs58';
import { cleanEnv, str } from 'envalid';

// Environment Validation
const serverEnv = cleanEnv(process.env, {
  PRIVATE_KEY: str({
    desc: 'Base58 encoded wallet private key (server only)',
    example: '5Jd7zdgX...'
  }),
  RPC_URL: str({
    desc: 'Secure RPC endpoint URL (server only)',
    example: 'https://pro.raydium.rpcpool.com'
  }),
  NETWORK: str({
    choices: ['mainnet', 'devnet'],
    default: 'mainnet'
  })
});

// Type Definitions
export type NetworkMode = 'mainnet' | 'devnet';
export interface ServerEnvironmentConfig {
  readonly privateKey: string;
  readonly rpcUrl: string;
  readonly network: NetworkMode;
  readonly cluster: Cluster;
  readonly commitment: Commitment;
}

// Runtime Configuration
export const SERVER_CONFIG: Readonly<ServerEnvironmentConfig> = {
  get privateKey(): string {
    return serverEnv.PRIVATE_KEY;
  },

  get rpcUrl(): string {
    return serverEnv.RPC_URL;
  },

  get network(): NetworkMode {
    return serverEnv.NETWORK as NetworkMode;
  },

  get cluster(): Cluster {
    return this.network === 'devnet' ? 'devnet' : 'mainnet-beta';
  },

  get commitment(): Commitment {
    return 'confirmed';
  }
};

// Connection Management
let serverConnection: Connection | null = null;

export function initializeServerConnection(): Connection {
  if (!serverConnection) {
    serverConnection = new Connection(
      SERVER_CONFIG.rpcUrl, 
      {
        commitment: SERVER_CONFIG.commitment,
        disableRetryOnRateLimit: true,
        confirmTransactionInitialTimeout: 60_000
      }
    );
    
    console.log(`Initialized server connection to ${SERVER_CONFIG.cluster}`);
    console.log(`RPC Endpoint: ${SERVER_CONFIG.rpcUrl}`);
  }
  return serverConnection;
}

// New function to validate private key format
export function validatePrivateKey(key: string) {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(key)) {
    throw new Error('Invalid private key format - must be base58 encoded');
  }
  try {
    bs58.decode(key);
  } catch (e) {
    throw new Error('Invalid base58 characters in private key');
  }
}

// Secure Key Handling
let serverKeypair: Keypair | null = null;

export function initializeServerWallet(): Keypair {
  validatePrivateKey(SERVER_CONFIG.privateKey); // Validate the private key
  if (!serverKeypair) {
    try {
      serverKeypair = Keypair.fromSecretKey(
        bs58.decode(SERVER_CONFIG.privateKey)
      );
      
      console.log('Initialized server wallet');
      console.log(`Public Key: ${serverKeypair.publicKey.toBase58()}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize server wallet: ${errorMessage}`);
    }
  }
  return serverKeypair;
}

// Health Check System
export async function performServerHealthCheck(): Promise<boolean> {
  try {
    const connection = initializeServerConnection();
    const slot = await connection.getSlot();
    
    return typeof slot === 'number' && slot > 0;
  } catch (error) {
    console.error('Server health check failed:', error);
    return false;
  }
}

// Secure Initialization Flow
export async function initializeServerEnvironment() {
  try {
    await performServerHealthCheck();
    initializeServerWallet();
    return {
      connection: initializeServerConnection(),
      wallet: initializeServerWallet()
    };
  } catch (error) {
    console.error('Critical server initialization error:', error);
    process.exit(1);
  }
}

// Type Exports
export type ServerConfig = typeof SERVER_CONFIG;

// New function to get server-side Raydium configuration
export function getServerSideRaydium() {
  return {
    connection: initializeServerConnection(),
    owner: initializeServerWallet()
  };
}