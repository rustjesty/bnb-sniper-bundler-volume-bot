const validatePrivateKey = (key: string) => {
  if (!key.match(/^0x[0-9a-fA-F]{64}$/)) {
    throw new Error('Invalid private key format');
  }
};

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
