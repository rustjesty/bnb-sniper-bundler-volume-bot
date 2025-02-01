import { PublicKey } from '@solana/web3.js';

export const RAYDIUM_PROGRAMS = {
  AMM_V4: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
  CLMM: new PublicKey('CLMMCnJkvxpz8LE6zk4T4zhSPsJ8n2nMqVZywpGg6rj'),
  CPMM: new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK')
} as const;

export const SEEDS = {
  AMM: {
    POOL: 'amm_v4',
    AUTHORITY: 'amm_authority_v4',
    TARGET_ORDERS: 'target_orders_v4',
    OPEN_ORDERS: 'open_orders_v4'
  },
  CLMM: {
    POOL: 'pool',
    POSITION: 'position',
    TICK: 'tick',
    OBSERVATION: 'observation'
  },
  CPMM: {
    POOL: 'pool_seed',
    AUTHORITY: 'pool_authority',
    VAULT: 'pool_vault'
  }
} as const;

export const DEFAULTS = {
  SLIPPAGE: 0.5, // 0.5%
  PRIORITY_FEE: 1000, // 1000 lamports
  COMPUTE_UNITS: 200_000,
  MIN_SOL_BALANCE: 0.05, // 0.05 SOL minimum for transactions
  UPDATE_INTERVAL: 60_000, // 1 minute state update interval
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  MIN_LIQUIDITY: 1000 // Add minimum liquidity threshold
} as const;