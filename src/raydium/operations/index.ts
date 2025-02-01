// src/tools/raydium/operations/index.ts
import { Connection, Keypair } from '@solana/web3.js';
import { swap } from '../amm/swap';
import { createPool } from '../clmm/createPool';
import { createFarm } from '../clmm/createFarm';
import { routeSwap } from '../trade/routeSwap';

export const operations = {
  'amm/swap': swap,
  'clmm/createPool': createPool,
  'clmm/createFarm': createFarm,
  'trade/routeSwap': routeSwap,
};

export type Operation = keyof typeof operations;