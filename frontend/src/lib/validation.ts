import { config } from 'dotenv';

export const validateApiKey = (key: string | undefined): boolean => {
  if (!key) return false;
  return key.length > 0;
};

export const validateEnvironment = () => {
  const requiredVars = ['NEXT_PUBLIC_GROQ_API_KEY'];
  const missing = requiredVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return true;
};