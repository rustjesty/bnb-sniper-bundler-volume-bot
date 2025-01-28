// src/tools/raydium/client-config.ts
import { Connection } from '@solana/web3.js';

export const getClientSideRaydium = () => {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  if (!rpcUrl) throw new Error('RPC URL not configured');
  
  return new Connection(rpcUrl);
};