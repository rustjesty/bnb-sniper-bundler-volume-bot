import { Raydium } from '@raydium-io/raydium-sdk-v2';
import { ConnectionManager } from './clientConfig';
import { getWalletFromServer } from './serverConfig';
import { Connection } from '@solana/web3.js';

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

  async initialize(): Promise<Raydium> {
    if (this.raydium) return this.raydium;

    if (typeof window === 'undefined') {
      throw new Error('Raydium must be initialized client-side');
    }

    try {
      const connection = this.connectionManager.getConnection();
      const owner = await getWalletFromServer();
      
      const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet' ? 'devnet' : undefined;
      
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

export const getRaydiumService = () => RaydiumService.getInstance();
export const initializeRaydium = async (): Promise<Raydium> => {
  return await getRaydiumService().initialize();
};
