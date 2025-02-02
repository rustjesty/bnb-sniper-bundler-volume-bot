import { SOLANA_CONFIG, CHAT_CONFIG } from "./constants";


// Type definitions
interface Config {
  SOLANA: {
    RPC_URL: string;
    NETWORK: string;
    PUBLIC_KEY: string;
    TOKEN_SETTINGS: {
      NAME: string;
      SYMBOL: string;
      DECIMALS: number;
      SUPPLY: number;
      ADDRESS: string;
    };
    TRADING: {
      MIN_CONFIDENCE: number;
      BASE_AMOUNT: number;
      SLIPPAGE: number;
    };
  };
  AI: {
    GROQ: {
      API_KEY: string;
      MODEL: string;
      MAX_TOKENS: number;
      DEFAULT_TEMPERATURE: number;
      MAX_RETRIES: number;
      RETRY_DELAY: number;
    };
  };
  AUTOMATION: {
    CONTENT_GENERATION_INTERVAL: number;
    MARKET_MONITORING_INTERVAL: number;
    COMMUNITY_ENGAGEMENT_INTERVAL: number;
    TWEET_INTERVAL: number;
  };
}

// Simple function to get environment variables with defaults
const getEnvVar = (key: string, defaultValue: string = '') => {
  if (typeof window === 'undefined') {
    return process.env[key] || defaultValue;
  }
  return (window as any)?.__ENV?.[key] || process.env[key] || defaultValue;
};

// Configuration object
export const CONFIG: Config = {
  SOLANA: {
    NETWORK: SOLANA_CONFIG.NETWORK,
    RPC_URL: SOLANA_CONFIG.RPC_URL,
    PUBLIC_KEY: SOLANA_CONFIG.PUBLIC_KEY || '',
    TOKEN_SETTINGS: {
      NAME: 'JENNA',
      SYMBOL: 'JENNA',
      DECIMALS: 9,
      SUPPLY: 100000000,
      ADDRESS: '8hVzPgFopqEQmNNoghr5WbPY1LEjW8GzgbLRwuwHpump'
    },
    TRADING: {
      MIN_CONFIDENCE: 0.7,
      BASE_AMOUNT: 0.1,
      SLIPPAGE: 50, // 0.5% in basis points
    },
  },
  AI: {
    GROQ: {
      API_KEY: getEnvVar('NEXT_PUBLIC_GROQ_API_KEY', ''),
      MODEL: CHAT_CONFIG.MODEL,
      MAX_TOKENS: CHAT_CONFIG.MAX_TOKENS,
      DEFAULT_TEMPERATURE: CHAT_CONFIG.TEMPERATURE,
      MAX_RETRIES: parseInt(getEnvVar('NEXT_PUBLIC_GROQ_MAX_RETRIES', '3')),
      RETRY_DELAY: parseInt(getEnvVar('NEXT_PUBLIC_GROQ_RETRY_DELAY', '1000'))
    },
  },
  AUTOMATION: {
    CONTENT_GENERATION_INTERVAL: 1800000, // 30 minutes
    MARKET_MONITORING_INTERVAL: 300000,   // 5 minutes
    COMMUNITY_ENGAGEMENT_INTERVAL: 3600000, // 1 hour
    TWEET_INTERVAL: 300000                // 5 min
  },
};

// Export individual sections
export const {
  SOLANA,
  AI,
  AUTOMATION
} = CONFIG;