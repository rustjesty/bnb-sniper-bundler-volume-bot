// src/tools/raydium/server-config.ts
import 'server-only'; // Next.js utility to ensure server-side only code

import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export const getServerSideRaydium = () => {
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  
  if (!privateKey || !rpcUrl) {
    throw new Error('Server configuration missing');
  }

  const connection = new Connection(rpcUrl);
  const owner = Keypair.fromSecretKey(bs58.decode(privateKey));

  return { connection, owner };
};