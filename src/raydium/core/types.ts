import { PublicKey, Commitment, ConnectionConfig } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export interface RaydiumPoolInfo {
  id: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  lpMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  authority: PublicKey;
  feeAccount: PublicKey;
  poolConfig: PublicKey;
}

export interface RaydiumPoolState {
  status: PoolStatus;
  baseAmount: BN;
  quoteAmount: BN;
  lpSupply: BN;
  startTime: BN;
  lastUpdateTime: BN;
}

export enum PoolStatus {
  UNINITIALIZED = 0,
  INITIALIZED = 1,
  DISABLED = 2,
  ACTIVE = 3
}

export interface TokenInfo {
  mint: PublicKey;
  decimals: number;
  isToken2022: boolean;
}

export interface SwapParams {
  poolId: PublicKey;
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  amount: number;
  slippage: number;
}

export interface PositionInfo {
  poolId: PublicKey;
  owner: PublicKey;
  liquidity: BN;
  tickLower: number;
  tickUpper: number;
  feeGrowthInside: BN;
  tokensOwed: BN;
}

export interface PoolConfig {
  tradeFeeRate: number;
  protocolFeeRate: number;
  fundFeeRate: number;
}

export interface RaydiumErrorJSON {
  name: string;
  message: string;
  code: string;
  details?: any;
}

export enum RaydiumErrorCode {
  INITIALIZATION_FAILED = "INITIALIZATION_FAILED",
  CONNECTION_ERROR = "CONNECTION_ERROR",
  INVALID_PARAMETERS = "INVALID_PARAMETERS"
}

export interface RaydiumError {
  name: string;
  message: string;
  code: RaydiumErrorCode;
  details?: any;
  toJSON(): RaydiumErrorJSON;
}

export interface RaydiumConfig {
  rpcUrl: string;
  cluster: 'mainnet-beta' | 'devnet';
  commitment: Commitment;
  timeout?: number;
}

export interface ConnectionOptions extends ConnectionConfig {
  commitment: Commitment;
  confirmTransactionInitialTimeout: number;
  wsEndpoint?: string;
}

export interface ServiceConfig extends RaydiumConfig {
  maxRetries?: number;
  retryDelay?: number;
}