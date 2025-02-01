// src/tools/raydium/service.ts
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair } from '@solana/web3.js';
import type {  RaydiumService } from './types';
import { getClientConnection } from './client-config';
import { getServerConnection } from './server-connection';

// Error types for better error handling
class RaydiumError extends Error {
  static wallet(arg0: string, error: unknown) {
    throw new Error('Method not implemented.');
  }
  static initialization(arg0: string, error: unknown) {
    throw new Error('Method not implemented.');
  }
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'RaydiumError';
  }
}

abstract class BaseRaydiumService implements RaydiumService {
  protected _raydium?: Raydium;
  protected _connection: Connection;
  protected _owner?: Keypair;

  constructor(connection: Connection) {
    this._connection = connection;
  }

  get connection(): Connection {
    return this._connection;
  }

  get raydium(): Raydium | undefined {
    return this._raydium;
  }

  abstract initialize(): Promise<Raydium>;
}

export class ClientRaydiumService extends BaseRaydiumService {
  private static instance: ClientRaydiumService;
  private clientConnection!: Connection;

  private constructor() {
    if (typeof window === 'undefined') {
      throw new RaydiumError(
        'ClientRaydiumService must be initialized in browser context',
        'INVALID_CONTEXT'
      );
    }
    super(null as any); // Temporary assignment, will be replaced in async init
  }

  static async getInstance(): Promise<ClientRaydiumService> {
    if (!ClientRaydiumService.instance) {
      ClientRaydiumService.instance = new ClientRaydiumService();
      await ClientRaydiumService.instance.init();
    }
    return ClientRaydiumService.instance;
  }

  private async init() {
    const conn = await getClientConnection().getConnection();
    this._connection = conn;
    this.clientConnection = conn;
  }

  private async getWalletFromServer(): Promise<Keypair> {
    try {
      const response = await fetch('/api/wallet/init');
      if (!response.ok) {
        throw new RaydiumError(
          'Failed to initialize wallet',
          'WALLET_INIT_FAILED'
        );
      }
      
      const { keypair } = await response.json();
      return Keypair.fromSecretKey(new Uint8Array(keypair));
    } catch (error) {
      throw new RaydiumError(
        `Wallet initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'WALLET_INIT_ERROR'
      );
    }
  }

  async initialize(): Promise<Raydium> {
    if (this._raydium) return this._raydium;

    try {
      this._owner = await this.getWalletFromServer();
      const config = getClientConnection().getConfig();
      
      this._raydium = await Raydium.load({
        connection: this.connection,
        owner: this._owner,
        cluster: config.cluster === 'devnet' ? 'devnet' : undefined,
        disableFeatureCheck: true,
        blockhashCommitment: config.commitment,
      });

      return this._raydium;
    } catch (error) {
      throw new RaydiumError(
        `Raydium initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_ERROR'
      );
    }
  }

  // Utility method to reset the service
  async reset(): Promise<void> {
    this._raydium = undefined;
    this._owner = undefined;
    this._connection = await getClientConnection().getConnection();
  }
}

export class ServerRaydiumService extends BaseRaydiumService {
  private static instance: ServerRaydiumService;

  private constructor() {
    if (typeof window !== 'undefined') {
      throw new RaydiumError(
        'ServerRaydiumService must be initialized server-side',
        'INVALID_CONTEXT'
      );
    }
    super(getServerConnection().getConnection());
  }

  static getInstance(): ServerRaydiumService {
    if (!ServerRaydiumService.instance) {
      ServerRaydiumService.instance = new ServerRaydiumService();
    }
    return ServerRaydiumService.instance;
  }

  async initialize(): Promise<Raydium> {
    if (this._raydium) return this._raydium;

    try {
      const { owner, config } = await getServerConnection().getConnectionConfig();
      this._owner = owner;

      this._raydium = await Raydium.load({
        connection: this.connection,
        owner: this._owner,
        cluster: config.cluster === 'devnet' ? 'devnet' : undefined,
        disableFeatureCheck: true,
        blockhashCommitment: config.commitment,
      });

      return this._raydium;
    } catch (error) {
      throw new RaydiumError(
        `Server Raydium initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SERVER_INIT_ERROR'
      );
    }
  }
}

// Factory function to get the appropriate service based on context
export const getRaydiumService = async (): Promise<RaydiumService> => {
  if (typeof window === 'undefined') {
    return ServerRaydiumService.getInstance();
  }
  return await ClientRaydiumService.getInstance();
};

// Convenience initialization function
export const initializeRaydium = async (): Promise<Raydium> => {
  return await (await getRaydiumService()).initialize();
};

// Export error types for handling
export { RaydiumError };