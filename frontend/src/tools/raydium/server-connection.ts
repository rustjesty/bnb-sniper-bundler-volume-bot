import { Connection, Keypair } from '@solana/web3.js';
import type { ServerConfig } from './types';

class ServerConnectionManager {
  private static instance: ServerConnectionManager;
  private connection: Connection | null = null;
  private owner: Keypair | null = null;

  private constructor() {}

  static getInstance(): ServerConnectionManager {
    if (!ServerConnectionManager.instance) {
      ServerConnectionManager.instance = new ServerConnectionManager();
    }
    return ServerConnectionManager.instance;
  }

  getConnection(): Connection {
    if (!this.connection) {
      if (!process.env.NEXT_PUBLIC_RPC_URL) {
        throw new Error('RPC URL not configured');
      }
      this.connection = new Connection(process.env.NEXT_PUBLIC_RPC_URL, 'confirmed');
    }
    return this.connection;
  }

  async getConnectionConfig() {
    if (!this.owner) {
      if (!process.env.SOLANA_PRIVATE_KEY) {
        throw new Error('Private key not configured');
      }
      const privateKeyArray = JSON.parse(process.env.SOLANA_PRIVATE_KEY);
      this.owner = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    }

    const config: ServerConfig = {
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
      cluster: (process.env.NEXT_PUBLIC_CLUSTER || 'mainnet-beta') as any,
      commitment: 'confirmed',
      privateKey: process.env.SOLANA_PRIVATE_KEY!,
      publicKey: this.owner.publicKey.toString(),
      maxConcurrentRequests: 10,
      timeoutMs: 30000,
    };

    return {
      owner: this.owner,
      config,
    };
  }
}

export const getServerConnection = () => ServerConnectionManager.getInstance();
