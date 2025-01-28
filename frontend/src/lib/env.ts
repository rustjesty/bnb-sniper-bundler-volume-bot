// src/lib/env.ts

export const getServerEnv = () => {
    // These environment variables must be defined in .env.local
    const requiredVars = {
      SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
      RPC_URL: process.env.RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    };
  
    const missingVars = Object.entries(requiredVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);
  
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  
    return requiredVars;
  };

export const getApiEnv = () => {
  const requiredVars = {
    API_KEY: process.env.API_KEY,
    API_SECRET: process.env.API_SECRET
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  return requiredVars;
};