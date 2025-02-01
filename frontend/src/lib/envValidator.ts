import { cleanEnv, str } from 'envalid';

export const validateEnv = () => {
  if (typeof window === 'undefined') {
    // Server-side validation
    cleanEnv(process.env, {
      PRIVATE_KEY: str({
        desc: 'Base58 encoded wallet private key',
        example: '5Jd7zdg...'
      }),
      RPC_URL: str({
        desc: 'Primary RPC endpoint URL',
        example: 'https://pro.raydium.rpcpool.com'
      })
    });
  } else {
    // Client-side validation
    cleanEnv(process.env, {
      NEXT_PUBLIC_RPC_URL: str({
        default: 'https://api.mainnet-beta.solana.com',
        desc: 'Fallback RPC endpoint'
      }),
      NEXT_PUBLIC_SOLANA_CLUSTER: str({
        choices: ['mainnet-beta', 'devnet'],
        default: 'mainnet-beta'
      }),
      NEXT_PUBLIC_DEFAULT_POOL_ID: str({
        desc: 'Default pool ID for the application'
      })
    });
  }
};

// Add to startup sequence
validateEnv();