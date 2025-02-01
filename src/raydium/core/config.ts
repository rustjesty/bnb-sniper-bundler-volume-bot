import { RaydiumConfig, ServiceConfig } from './types'

const DEFAULT_CONFIG: RaydiumConfig = {
    commitment: 'confirmed',
    //poolCache: true,
    timeout: 30000,
    rpcUrl: 'https://api.mainnet-beta.solana.com ',
    cluster: 'mainnet-beta'
}

export function createConfig(config?: Partial<RaydiumConfig>): RaydiumConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config
  }
}

export function createServiceConfig(config?: Partial<ServiceConfig>): ServiceConfig {
  return {
    ...DEFAULT_CONFIG,
    maxRetries: 3,
    retryDelay: 1000,
    ...config
  }
}
