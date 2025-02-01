import { validatePrivateKey } from "@/tools/raydium/serverConfig";

export const validateEnvironment = () => {
  const requiredVars = [
    'PRIVATE_KEY',
    'RPC_URL',
    'NEXT_PUBLIC_DEFAULT_POOL_ID'
  ];

  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  });

  if (process.env.PRIVATE_KEY) {
    validatePrivateKey(process.env.PRIVATE_KEY);
  }
};
