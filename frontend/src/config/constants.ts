export const JUP_REFERRAL_ADDRESS = '8hVzPgFopqEQmNNoghr5WbPY1LEjW8GzgbLRwuwHpump';

export const SOLANA_CONFIG = {
  RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
  NETWORK: 'mainnet-beta',
  PUBLIC_KEY: process.env.NEXT_PUBLIC_PUBLIC_KEY || ''
};

export const CHAT_CONFIG = {
  MODEL: 'mixtral-8x7b-32768',
  MAX_TOKENS: 1000,
  TEMPERATURE: 0.7
};

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
