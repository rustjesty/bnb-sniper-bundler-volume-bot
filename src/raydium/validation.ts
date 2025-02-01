import { RaydiumConfig } from './core/types';

export class EnvironmentValidator {
  static validateServerEnv() {
    throw new Error('Method not implemented.');
  }
  static validateClientEnv(): void {
    const requiredVars = [
      'NEXT_PUBLIC_RPC_URL',
      'NEXT_PUBLIC_SOLANA_CLUSTER'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  static validateConfig(config: RaydiumConfig): void {
    if (!config.rpcUrl) {
      throw new Error('RPC URL is required');
    }
    
    if (!['mainnet-beta', 'devnet'].includes(config.cluster)) {
      throw new Error('Invalid cluster specified');
    }

    if (!['confirmed', 'finalized', 'processed'].includes(config.commitment)) {
      throw new Error('Invalid commitment level');
    }
  }
}
