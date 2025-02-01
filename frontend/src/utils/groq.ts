// Core imports
import { Groq } from 'groq-sdk';
import { LAMPORTS_PER_SOL, PublicKey, Connection, Transaction } from '@solana/web3.js';
import { SolanaAgentKit } from 'solana-agent-kit';

// Local utility imports
import { getSolanaPrice, getTrendingSolanaTokens } from './coingecko';
import { getSolanaBalance, getTransactionDetails } from './helius';
import { formatAddress, validateSolanaAddress, validateTransactionHash, validateTransactionParams } from './validation';
import { agentWallet } from './wallet';
import { getTokenInfo, swapSolToToken, executeSwap, getSwapQuote } from './jup';
import { requestDevnetAirdrop } from './airdrop';
import logger from './logger';
import { getTrendingTokens } from './birdeye';

// Document and template imports
import { SYSTEM_TEMPLATE } from './DefaultRetrievalText';
import { processDocuments, formatRetrievalResults, DocumentChunk, RetrievalOptions } from './DocumentRetrieval';

// Tool and feature imports
import { getSignature } from './getSignature';
import { fetch_tx, calc_tx_freq, calc_vol, calc_profitability, calc_dex_diversity, calc_stabel_token_vol, calc_final_score } from './helper';
import { ScoringWalletKit } from './scoringWallet';
import markdownToHTML from './markdownToHTML';
import { getPortfolio, rebalancePortfolio } from './portfolio';
import { TransactionProcessor } from './transactions';
import { transactionSenderAndConfirmationWaiter } from './transactionSender';
import { create_image } from '@/tools/agent/create_image';
import { getTokenDataByAddress, getTokenDataByTicker } from '@/tools/dexscreener';
import { getAssetsByOwner } from '@/tools/helius';
import { getRecentTransactions } from '@/tools/helius/get_recent_transactions';
import { parseTransaction } from '@/tools/helius/helius_transaction_parsing';
import { sendTransactionWithPriorityFee } from '@/tools/helius/send_transaction_with_priority';
import { stakeWithJup } from '@/tools/jupiter/stake_with_jup';
import { trade } from '@/tools/jupiter/trade';
import { openbookCreateMarket } from '@/tools/openbook/openbook_create_market';
import { launchPumpFunToken } from '@/tools/pumpfun/launch_pumpfun_token';
import { swapTool } from '@/tools/swap';
import { CHAT_TEMPLATE, CONDENSE_QUESTION_TEMPLATE, QA_TEMPLATE, REPHRASE_TEMPLATE } from './RetrievalPrompts';
import { AmmInfo, AmmMarket, AmmOps, AmmPool, ClmmDecrease, ClmmFarm, ClmmHarvest, ClmmIncrease, ClmmMarketMaker, ClmmNewPosition, ClmmPool, ClmmPoolInfo, ClmmRewards, FarmStake } from '@/tools/raydium';
import { geckoTerminalAPI } from '@/tools/geckoterminal';
import { MarketDataHelper } from '@/tools/geckoterminal/marketData';
import { tryBase58Decode, isValidBase58, safePublicKey } from '@/utils/base58';
import { RaydiumWrapper } from '@/utils/raydium-wrapper';


// Constants
const BALANCE_CACHE_DURATION = 10000; // 10 seconds
const balanceCache = new Map<string, { balance: number; timestamp: number }>();

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Templates and Personalities
const JENNA_PERSONALITY = `You are JENNA, a specialized AI assistant focused on Solana blockchain and cryptocurrency trading.
- Always maintain a professional but friendly tone
- Focus on providing accurate, data-driven insights
- Explain complex concepts clearly and concisely
- Stay up-to-date with Solana ecosystem developments
- Prioritize risk management and responsible trading practices
- If unsure, acknowledge limitations rather than speculate`;

// Interfaces and Types
interface PromptConfig {
  maxTokens: number;
  temperature: number;
  topP: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string; 
  function_call?: any;
}

// Configurations
const DEFAULT_CONFIGS: Record<string, PromptConfig> = {
  condense: {
    maxTokens: 256,
    temperature: 0.7,
    topP: 1.0
  },
  qa: {
    maxTokens: 512,
    temperature: 0.8,
    topP: 0.9
  },
  chat: {
    maxTokens: 1024,
    temperature: 0.9,
    topP: 0.95
  },
  rephrase: {
    maxTokens: 256,
    temperature: 0.7,
    topP: 0.9
  }
};

const RATE_LIMIT = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 3500,
  TOKEN_LIMIT: 5000
};

// Available functions for the AI
const functions = [
  {
    name: 'getSolanaPrice',
    description: 'Get current Solana price and market data',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getTrendingSolanaTokens',
    description: 'Get trending Solana tokens by market cap',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getWalletBalance',
    description: 'Get SOL balance for a wallet address',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Solana wallet address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'reviewTransaction',
    description: 'Review transaction details',
    parameters: {
      type: 'object',
      properties: {
        hash: {
          type: 'string',
          description: 'Transaction hash to review'
        }
      },
      required: ['hash']
    }
  },
  {
    name: 'getAgentBalance',
    description: 'Get agent wallet balance',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'requestDevnetAirdrop',
    description: 'Request devnet SOL airdrop',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Recipient address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'swapSolToToken',
    description: 'Swap SOL to another token',
    parameters: {
      type: 'object',
      properties: {
        amountInSol: {
          type: 'number',
          description: 'Amount of SOL to swap'
        },
        outputMint: {
          type: 'string',
          description: 'Output token mint address'
        }
      },
      required: ['amountInSol']
    }
  },
  {
    name: 'getJupiterQuote',
    description: 'Get a swap quote from Jupiter aggregator',
    parameters: {
      type: 'object',
      properties: {
        inputMint: {
          type: 'string',
          description: 'Input token mint address'
        },
        outputMint: {
          type: 'string',
          description: 'Output token mint address'
        },
        amount: {
          type: 'number',
          description: 'Amount of input token to swap'
        }
      },
      required: ['inputMint', 'outputMint', 'amount']
    }
  },
  {
    name: 'getTrendingTokensData',
    description: 'Get trending tokens data from Birdeye',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of trending tokens to fetch',
          default: 10
        },
        minLiquidity: {
          type: 'number',
          description: 'Minimum liquidity in USD',
          default: 10000
        }
      },
      required: []
    }
  },
  {
    name: 'getDetailedTokenInfo',
    description: 'Get detailed information about a specific token',
    parameters: {
      type: 'object',
      properties: {
        mintAddress: {
          type: 'string',
          description: 'Token mint address to get information for'
        },
        includePrice: {
          type: 'boolean',
          description: 'Whether to include price data',
          default: true
        },
        includeLiquidity: {
          type: 'boolean',
          description: 'Whether to include liquidity data',
          default: true
        }
      },
      required: ['mintAddress']
    }
  },
  {
    name: 'getTokenInfo',
    description: 'Get detailed information about a specific token',
    parameters: {
      type: 'object',
      properties: {
        mintAddress: {
          type: 'string',
          description: 'Token mint address to get information for'
        }
      },
      required: ['mintAddress']
    }
  },
  {
    name: 'getSolanaBalance',
    description: 'Get SOL balance for a wallet address',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Solana wallet address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'getSolanaBalanceDetails',
    description: 'Get detailed SOL balance including USD value',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Solana wallet address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'getDetailedTransaction',
    description: 'Get detailed transaction information',
    parameters: {
      type: 'object',
      properties: {
        signature: {
          type: 'string',
          description: 'Transaction signature'
        }
      },
      required: ['signature']
    }
  },
  {
    name: 'analyzeWalletActivity',
    description: 'Analyze wallet transaction patterns and activity',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Wallet address to analyze'
        },
        transactionLimit: {
          type: 'number',
          description: 'Number of transactions to analyze',
          default: 10
        }
      },
      required: ['address']
    }
  },
  {
    name: 'handleMarkdownResponse',
    description: 'Convert markdown response to HTML',
    parameters: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: 'Markdown content to convert'
        }
      },
      required: ['markdown']
    }
  },
  {
    name: 'getPortfolioStatus',
    description: 'Get wallet portfolio status',
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Wallet address'
        }
      },
      required: ['walletAddress']
    }
  },
  {
    name: 'executeRebalance',
    description: 'Execute portfolio rebalancing',
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Wallet address'
        },
        targetAllocation: {
          type: 'object',
          description: 'Target allocation percentages',
          additionalProperties: {
            type: 'string'
          }
        }
      },
      required: ['walletAddress', 'targetAllocation']
    }
  },
  {
    name: 'condenseQuestion',
    description: 'Condense a follow-up question with chat history context',
    parameters: {
      type: 'object',
      properties: {
        chatHistory: {
          type: 'string',
          description: 'Previous chat history'
        },
        question: {
          type: 'string',
          description: 'Follow-up question'
        }
      },
      required: ['chatHistory', 'question']
    }
  },
  {
    name: 'rephraseMessage',
    description: 'Rephrase message to be clearer and Solana-trading focused',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to rephrase'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'getWalletScoring',
    description: 'Get detailed wallet activity scoring',
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Wallet address to analyze'
        },
        rpcUrl: {
          type: 'string',
          description: 'RPC URL for connection',
          default: 'https://api.mainnet-beta.solana.com'
        }
      },
      required: ['walletAddress']
    }
  },
  {
    name: 'getWalletHistory',
    description: 'Get wallet transaction history',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Wallet address'
        },
        limit: {
          type: 'number',
          description: 'Number of transactions',
          default: 10
        }
      },
      required: ['address']
    }
  },
  {
    name: 'calculateWalletRisk',
    description: 'Calculate wallet risk metrics',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Wallet address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'analyzeDexUsage',
    description: 'Analyze DEX usage patterns',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Wallet address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'getDetailedTransactionHistory',
    description: 'Get detailed transaction history for a wallet',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Wallet address'
        },
        limit: {
          type: 'number',
          description: 'Number of transactions',
          default: 10
        }
      },
      required: ['address']
    }
  },
  {
    name: 'getWalletMetrics',
    description: 'Get transaction metrics for wallet',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Wallet address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'handleTransaction',
    description: 'Handle transaction sending and confirmation',
    parameters: {
      type: 'object',
      properties: {
        connection: {
          type: 'object',
          description: 'Solana connection object'
        },
        serializedTx: {
          type: 'string',
          description: 'Serialized transaction buffer'
        },
        blockhash: {
          type: 'object',
          description: 'Blockhash with expiry'
        }
      },
      required: ['connection', 'serializedTx', 'blockhash']
    }
  },
  {
    name: 'validateAddress',
    description: 'Validate a Solana address or transaction',
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Address or transaction hash to validate'
        },
        type: {
          type: 'string',
          enum: ['address', 'transaction'],
          description: 'Type of validation to perform'
        }
      },
      required: ['input', 'type']
    }
  },
  {
    name: 'validateTransaction',
    description: 'Validate transaction parameters',
    parameters: {
      type: 'object',
      properties: {
        sender: {
          type: 'string',
          description: 'Sender address'
        },
        recipient: {
          type: 'string',
          description: 'Recipient address'
        },
        amount: {
          type: 'number',
          description: 'Transaction amount'
        }
      },
      required: ['sender', 'recipient', 'amount']
    }
  },
  {
    name: 'initializeWallet',
    description: 'Initialize agent wallet connection',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getWalletConnection',
    description: 'Get active RPC connection status',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'processWalletText',
    description: 'Process and analyze wallet text input',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to analyze'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'generateImage',
    description: 'Generate images using Groq',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image description'
        },
        size: {
          type: 'string',
          enum: ['256x256', '512x512', '1024x1024'],
          default: '1024x1024'
        },
        n: {
          type: 'number',
          description: 'Number of images',
          default: 1
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'getTokenData',
    description: 'Get token data from Jupiter',
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Token address or ticker'
        },
        byTicker: {
          type: 'boolean',
          description: 'Search by ticker instead of address',
          default: false
        }
      },
      required: ['input']
    }
  },
  {
    name: 'getTokenDataInfo',
    description: 'Get detailed token data',
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Token address or ticker'
        },
        inputType: {
          type: 'string',
          enum: ['address', 'ticker'],
          default: 'address'
        }
      },
      required: ['input']
    }
  },
  {
    name: 'getWalletAssets',
    description: 'Get token assets owned by a wallet',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Wallet address'
        },
        limit: {
          type: 'number',
          description: 'Number of assets to retrieve',
          default: 10
        }
      },
      required: ['address']
    }
  },
  {
    name: 'getRecentTxs',
    description: 'Get recent transactions for a wallet',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Wallet address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'parseTransaction',
    description: 'Parse a Solana transaction using Helius API',
    parameters: {
      type: 'object',
      properties: {
        transactionId: {
          type: 'string',
          description: 'Transaction ID to parse'
        }
      },
      required: ['transactionId']
    }
  },
  {
    name: 'sendHighPriorityTransaction',
    description: 'Send a transaction with high priority fee',
    parameters: {
      type: 'object',
      properties: {
        priorityLevel: {
          type: 'string',
          description: 'Priority level for the transaction'
        },
        amount: {
          type: 'number',
          description: 'Amount of SOL to send'
        },
        to: {
          type: 'string',
          description: 'Recipient wallet address'
        },
        splmintAddress: {
          type: 'string',
          description: 'SPL token mint address (optional)',
          default: null
        }
      },
      required: ['priorityLevel', 'amount', 'to']
    }
  },
  {
    name: 'createAmmPool',
    description: 'Create a new Raydium AMM pool',
    parameters: {
      type: 'object',
      properties: {
        baseMint: { type: 'string', description: 'Base token mint address' },
        quoteMint: { type: 'string', description: 'Quote token mint address' },
        baseAmount: { type: 'number', description: 'Initial base token amount' },
        quoteAmount: { type: 'number', description: 'Initial quote token amount' }
      },
      required: ['baseMint', 'quoteMint', 'baseAmount', 'quoteAmount']
    }
  },
  {
    name: 'addLiquidity',
    description: 'Add liquidity to Raydium AMM pool',
    parameters: {
      type: 'object',
      properties: {
        poolId: { type: 'string', description: 'Pool ID' },
        baseAmount: { type: 'number', description: 'Base token amount' },
        quoteAmount: { type: 'number', description: 'Quote token amount' }
      },
      required: ['poolId', 'baseAmount', 'quoteAmount']
    }
  },
  {
    name: 'createClmmPool',
    description: 'Create a new Raydium CLMM pool',
    parameters: {
      type: 'object',
      properties: {
        mint1: { type: 'string', description: 'First token mint address' },
        mint2: { type: 'string', description: 'Second token mint address' },
        initialPrice: { type: 'number', description: 'Initial price' }
      },
      required: ['mint1', 'mint2', 'initialPrice']
    }
  },
  {
    name: 'manageFarmRewards',
    description: 'Manage farming rewards for CLMM pool',
    parameters: {
      type: 'object',
      properties: {
        poolId: { type: 'string', description: 'Pool ID' },
        rewardMint: { type: 'string', description: 'Reward token mint address' },
        rewardRate: { type: 'number', description: 'Rewards per second' },
        duration: { type: 'number', description: 'Duration in seconds' }
      },
      required: ['poolId', 'rewardMint', 'rewardRate']
    }
  },
  {
    name: 'harvestRewards',
    description: 'Harvest farming rewards',
    parameters: {
      type: 'object',
      properties: {
        poolId: { type: 'string', description: 'Pool ID' },
        positionId: { type: 'string', description: 'Position ID' }
      },
      required: ['poolId', 'positionId']
    }
  },
  {
    name: 'getRaydiumPoolInfo',
    description: 'Get detailed information about a Raydium pool',
    parameters: {
      type: 'object',
      properties: {
        poolId: { type: 'string', description: 'Pool ID' },
        poolType: { type: 'string', enum: ['AMM', 'CLMM', 'CPMM'], description: 'Pool type' }
      },
      required: ['poolId', 'poolType']
    }
  },
  {
    name: 'createMarket',
    description: 'Create a new Openbook market for Raydium',
    parameters: {
      type: 'object',
      properties: {
        baseMint: { type: 'string' },
        quoteMint: { type: 'string' },
        lotSize: { type: 'number' },
        tickSize: { type: 'number' }
      },
      required: ['baseMint', 'quoteMint', 'lotSize', 'tickSize']
    }
  },
  {
    name: 'createClmmPosition',
    description: 'Create a new CLMM position',
    parameters: {
      type: 'object',
      properties: {
        poolId: { type: 'string' },
        tickLower: { type: 'number' },
        tickUpper: { type: 'number' },
        amount: { type: 'number' }
      },
      required: ['poolId', 'tickLower', 'tickUpper', 'amount']
    }
  },
  {
    name: 'modifyClmmPosition',
    description: 'Modify CLMM position liquidity',
    parameters: {
      type: 'object',
      properties: {
        positionId: { type: 'string' },
        operation: { type: 'string', enum: ['increase', 'decrease'] },
        amount: { type: 'number' }
      },
      required: ['positionId', 'operation', 'amount']
    }
  },
  {
    name: 'createFarm',
    description: 'Create a new Raydium farm',
    parameters: {
      type: 'object',
      properties: {
        poolId: { type: 'string' },
        rewardMints: { type: 'array', items: { type: 'string' } }
      },
      required: ['poolId', 'rewardMints']
    }
  },
  {
    name: 'stakeFarm',
    description: 'Stake LP tokens in farm',
    parameters: {
      type: 'object',
      properties: {
        farmId: { type: 'string' },
        amount: { type: 'number' }
      },
      required: ['farmId', 'amount']
    }
  },
  {
    name: 'fetchMarketMaker',
    description: 'Get market maker info for CLMM pool',
    parameters: {
      type: 'object',
      properties: {
        poolId: { type: 'string' },
        positionRange: { type: 'number' }
      },
      required: ['poolId']
    }
  },
  {
    name: 'executeSwap',
    description: 'Execute token swap through chat',
    parameters: {
      type: 'object',
      properties: {
        fromToken: { type: 'string' },
        toToken: { type: 'string' },
        amount: { type: 'number' },
        slippage: { type: 'number', default: 1 }
      },
      required: ['fromToken', 'toToken', 'amount']
    }
  },
  {
    name: 'getGeckoTokenInfo',
    description: 'Get detailed token information from GeckoTerminal',
    parameters: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Token contract address'
        }
      },
      required: ['tokenAddress']
    }
  },
  {
    name: 'getGeckoTokenPools',
    description: 'Get liquidity pools for a token from GeckoTerminal',
    parameters: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Token contract address'
        },
        limit: {
          type: 'number',
          description: 'Number of pools to return',
          default: 5
        }
      },
      required: ['tokenAddress']
    }
  },
  {
    name: 'getGeckoTokenPriceHistory',
    description: 'Get token price history from GeckoTerminal',
    parameters: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Token contract address'
        },
        timeframe: {
          type: 'string',
          enum: ['1h', '4h', '12h', '1d'],
          default: '1d',
          description: 'Timeframe for price data'
        }
      },
      required: ['tokenAddress']
    }
  },
  {
    name: 'getGeckoTrendingTokens',
    description: 'Get trending tokens from GeckoTerminal',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of trending tokens to return',
          default: 10
        }
      },
      required: []
    }
  },
  {
    name: 'analyzeGeckoToken',
    description: 'Get comprehensive token analysis from GeckoTerminal',
    parameters: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Token contract address'
        }
      },
      required: ['tokenAddress']
    }
  }
];

// Core client functions
const createGroqClient = (apiKey: string) => {
  return new Groq({
    apiKey,
    dangerouslyAllowBrowser: true
  });
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Main API functions
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const groq = createGroqClient(apiKey);
    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'test' }],
      model: 'mixtral-8x7b-32768'
    });
    return !!response;
  } catch (error) {
    console.error('API Key validation error:', error);
    return false;
  }
}

// Helper functions

export async function retrieveAndFormatDocuments(
  documents: DocumentChunk[],
  options: RetrievalOptions = {}
): Promise<string> {
  const results = await processDocuments(documents, options);
  return formatRetrievalResults(results);
}

// Main streaming completion function
export async function streamCompletion(
  messages: Message[],
  onChunk: (chunk: string) => void,
  providedApiKey?: string
): Promise<void> {
  const apiKey = providedApiKey || localStorage.getItem('jenna_api_key');
  if (!apiKey) throw new Error('API key not found');

  const groq = createGroqClient(apiKey);
  let retries = 0;

  // Create an instance of SolanaAgentKit
  const agent = new SolanaAgentKit(
    process.env.SOLANA_PRIVATE_KEY!,  // Provide the private key
    'https://api.mainnet-beta.solana.com', // Provide the RPC URL
    apiKey // Provide the OpenAI API key
  );

  while (retries < RATE_LIMIT.MAX_RETRIES) {
    try {
      // Add system message first
      const formattedMessages = [
        {
          role: 'system' as const,
          content: JENNA_PERSONALITY
        },
        ...messages.map(msg => {
          if (msg.role === 'function') {
            return {
              role: 'function' as const,
              name: msg.name!,
              content: msg.content,
              function_call: msg.function_call
            };
          }
          return {
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
            ...(msg.name && { name: msg.name }),
            ...(msg.function_call && { function_call: msg.function_call })
          };
        })
      ];

      const stream = await groq.chat.completions.create({
        model: 'mixtral-8x7b-32768',
        messages: formattedMessages as any, // Type assertion to avoid TypeScript errors
        stream: true,
        temperature: 0.7,
        max_tokens: 1000,
        functions,
        function_call: 'auto'
      });

      let functionCallInProgress = false;
      let functionName = '';
      let functionArgs = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta.function_call) {
          functionCallInProgress = true;
          functionName = delta.function_call.name || functionName;
          functionArgs += delta.function_call.arguments || '';
          continue;
        }

        if (functionCallInProgress && !delta.function_call) {
          functionCallInProgress = false;
          try {
            let result;
            switch (functionName) {
              case 'stakeWithJup':
                const { amount } = JSON.parse(functionArgs);
                result = await stakeWithJup(agent, amount);
                onChunk(`\nStaking Transaction Signature: ${ result } \n`);
                break;
              
              case 'getSolanaPrice':
                result = await getSolanaPrice();
                onChunk(`\nCurrent Solana Market Data: \n\n`);
                onChunk(`Price: $${ result.price.toFixed(2) } \n`);
                onChunk(`24h Change: ${ result.price_change_24h.toFixed(2) }%\n`);
                onChunk(`Market Cap: $${ (result.market_cap / 1e9).toFixed(2) } B\n`);
                break;

              case 'getTrendingSolanaTokens':
                result = await getTrendingSolanaTokens();
                onChunk('\nTrending Solana Tokens:\n\n');
                result.forEach((token, index) => {
                  onChunk(`${ index + 1 }. ${ token.name } (${ token.symbol }) \n`);
                  onChunk(`   Price: $${ token.price.toFixed(6) } \n`);
                  onChunk(`   24h Change: ${ token.price_change_24h.toFixed(2) }%\n\n`);
                });
                break;

              case 'getWalletBalance':
                const { address } = JSON.parse(functionArgs);
                if (!validateSolanaAddress(address)) {
                  onChunk("\nInvalid Solana address provided. Please check the address and try again.\n");
                  break;
                }
                
                const balanceResult = await getCachedBalance(address);
                onChunk(`\nWallet Balance: \n\n`);
                onChunk(`SOL: ${ balanceResult.toFixed(4) } \n`);
                onChunk(`USD Value: $${ (balanceResult * (await getSolanaPrice()).price).toFixed(2) } \n`);
                break;

              case 'reviewTransaction':
                const { hash } = JSON.parse(functionArgs);
                if (!validateTransactionHash(hash)) {
                  onChunk("\nInvalid transaction hash. Please provide a valid Solana transaction signature.\n");
                  break;
                } 

                const txDetails = await getTransactionDetails(hash);
                const signature = getSignature(txDetails as unknown as Transaction); 
                onChunk(`\nTransaction Details: \n\n`);
                onChunk(`Status: ${ txDetails.status } \n`);
                onChunk(`Timestamp: ${ txDetails.timestamp } \n`);
                onChunk(`Signature: ${ signature } \n`);
                if (txDetails.amount) {
                  onChunk(`Amount: ${ (txDetails.amount / LAMPORTS_PER_SOL).toFixed(4) } SOL\n`);
                }
                if (txDetails.fee) {
                  onChunk(`Fee: ${ txDetails.fee } SOL\n`);
                }
                break;

              case 'getAgentBalance':
                const walletInfo = await agentWallet.getBalance();
                const solPrice = (await getSolanaPrice()).price;
                const usdBalance = walletInfo.balance * solPrice;
                
                onChunk(`\nJENNA Wallet Status: \n\n`);
                onChunk(`Balance: ${ walletInfo.balance.toFixed(4) } SOL\n`);
                onChunk(`USD Value: $${ usdBalance.toFixed(2) } \n`);
                onChunk(`Address: ${ walletInfo.address } \n`);
                break;

              case 'requestDevnetAirdrop':
                const { address: airdropAddress } = JSON.parse(functionArgs);
                if (!validateSolanaAddress(airdropAddress)) {
                  onChunk("\nInvalid address for airdrop. Please provide a valid Solana address.\n");
                  break;
                }

                const airdropResult = await requestDevnetAirdrop(airdropAddress);
                onChunk(`\nDevnet Airdrop Status: \n\n`);
                onChunk(`Status: ${ airdropResult.status } \n`);
                if (airdropResult.signature) {
                  onChunk(`Signature: ${ airdropResult.signature } \n`);
                }
                break;

              case 'swapSolToToken':
                const { amountInSol, outputMint: targetMint = USDC_MINT } = JSON.parse(functionArgs);
                
                if (amountInSol < 0.001) {
                  onChunk("\nMinimum swap amount is 0.001 SOL.\n");
                  break;
                }

                const swapResult = await swapSolToToken(amountInSol, targetMint);
                if (swapResult.status === 'success') {
                  onChunk(`\nSwap Executed Successfully: \n\n`);
                  onChunk(`Amount: ${ amountInSol } SOL\n`);
                  onChunk(`Signature: ${ swapResult.signature } \n`);
                } else {
                  onChunk(`\nSwap Failed: ${ swapResult.message } \n`);
                }
                break;

              case 'getJupiterQuote':
                const quoteParams = JSON.parse(functionArgs);
                try {
                  const quote = await getSwapQuote(
                    Number(quoteParams.amount),
                    quoteParams.outputMint
                  );
                  
                  if (quote) {
                    onChunk(`\nSwap Quote Details: \n\n`);
                    onChunk(`Input Amount: ${ quote.inAmount } \n`);
                    onChunk(`Output Amount: ${ quote.outAmount } \n`);
                    onChunk(`Price Impact: ${ Number(quote.priceImpactPct).toFixed(2) }%\n`);
                    onChunk(`Slippage: ${ quote.slippageBps / 100 }%\n`);
                  } else {
                    onChunk("\nNo quote available for these parameters.\n");
                  }
                } catch (error) {
                  onChunk("\nFailed to fetch swap quote. Please verify token addresses and amount.\n");
                }
                break;

              case 'getTrendingTokensData': 
                try {
                  const { limit = 10 } = JSON.parse(functionArgs);
                  const trendingTokens = await getTrendingTokens();
                  
                  onChunk('\nTrending Tokens on Birdeye:\n\n');
                  trendingTokens.slice(0, limit).forEach((token, index) => {
                    onChunk(`${ index + 1 }. ${ token.name } (${ token.symbol }) \n`);
                    onChunk(`   Price: $${ token.price.toFixed(6) } \n`);
                    onChunk(`   24h Volume: $${ token.volume24h.toLocaleString() } \n`);
                    onChunk(`   Liquidity: $${ token.liquidity.toLocaleString() } \n\n`);
                  });
                } catch (error) {
                  onChunk("\nFailed to fetch trending tokens data. Please try again later.\n");
                }
                break;

              case 'getTokenInfo':
                const { mintAddress } = JSON.parse(functionArgs);
                result = await getTokenInfo(mintAddress);
                if (result) {
                  onChunk(`\nToken Information: \n\n`);
                  onChunk(`Name: ${ result.name } \n`);
                  onChunk(`Symbol: ${ result.symbol } \n`);
                  onChunk(`Price: $${ result.price.toFixed(6) } \n`);
                  onChunk(`Liquidity: $${ result.liquidity.toFixed(2) } \n`);
                } else {
                  onChunk("\nToken information not found.\n");
                }
                break;

              case 'getSolanaBalance':
                const { address: solanaAddress } = JSON.parse(functionArgs);
                if (!validateSolanaAddress(solanaAddress)) {
                  onChunk("\nInvalid Solana address provided. Please check the address and try again.\n");
                  break;
                }
                const balance = await getSolanaBalance(solanaAddress);
                onChunk(`\nWallet Balance: \n\n`);
                onChunk(`SOL: ${ Number(balance).toFixed(4) } \n`);
                onChunk(`USD Value: $${ (Number(balance) * (await getSolanaPrice()).price).toFixed(2) } \n`);
                break;

              case 'getSolanaBalanceDetails':
                try {
                  const { address } = JSON.parse(functionArgs);
                  const balanceInfo = await getSolanaBalance(address);
                  
                  onChunk(`\nBalance Details: \n`);
                  onChunk(`SOL Balance: ${ balanceInfo.balance.toFixed(4) } \n`);
                  onChunk(`USD Value: $${ balanceInfo.balanceInUSD.toFixed(2) } \n`);
                  onChunk(`Last Updated: ${ balanceInfo.timestamp } \n`);
                } catch (error) {
                  onChunk("\nFailed to fetch balance details. Please verify the address.\n");
                }
                break;

              case 'getDetailedTransaction':
                try {
                  const { signature } = JSON.parse(functionArgs);
                  const txInfo = await getTransactionDetails(signature);

                  onChunk(`\nTransaction Details: \n`);
                  onChunk(`Status: ${ txInfo.status } \n`);
                  onChunk(`Type: ${ txInfo.type } \n`);
                  onChunk(`Timestamp: ${ txInfo.timestamp } \n`);
                  if (txInfo.amount) onChunk(`Amount: ${ txInfo.amount } SOL\n`);
                  if (txInfo.fee) onChunk(`Fee: ${ txInfo.fee } SOL\n`);
                  if (txInfo.tokenTransfer) {
                    onChunk(`Token Transfer: ${ txInfo.tokenTransfer.amount } ${ txInfo.tokenTransfer.symbol } \n`);
                  }
                } catch (error) {
                  onChunk("\nFailed to fetch transaction details. Please verify the signature.\n");
                }
                break;

              case 'analyzeWalletActivity':
                try {
                  const { address, transactionLimit = 10 } = JSON.parse(functionArgs);
                  const publicKey = new PublicKey(address);
                  const walletKit = new ScoringWalletKit('https://api.mainnet-beta.solana.com'); // Provide the rpcUrl
                  
                  await fetch_tx(walletKit, publicKey, transactionLimit);
                  
                  const txFrequency = calc_tx_freq(walletKit);
                  const volume = calc_vol(walletKit);
                  const profitability = calc_profitability(walletKit);
                  const dexDiversity = calc_dex_diversity(walletKit);
                  const stablecoinVolume = calc_stabel_token_vol(walletKit);
                  const finalScore = calc_final_score(walletKit);

                  onChunk(`\nWallet Analysis: \n\n`);
                  onChunk(`Transaction Frequency Score: ${ (txFrequency * 100).toFixed(2) }%\n`);
                  onChunk(`Trading Volume: ${ volume.toFixed(2) } SOL\n`);
                  onChunk(`Estimated P & L: ${ profitability.toFixed(2) } SOL\n`);
                  onChunk(`DEX Diversity Score: ${ (dexDiversity / 10 * 100).toFixed(2) }%\n`);
                  onChunk(`Stablecoin Volume: $${ stablecoinVolume.toFixed(2) } \n`);
                  onChunk(`Overall Score: ${ (finalScore * 100).toFixed(2) }%\n`);
                } catch (error) {
                  onChunk("\nFailed to analyze wallet activity. Please verify the address and try again.\n");
                }
                break;

              case 'handleMarkdownResponse':
                try {
                  const { markdown } = JSON.parse(functionArgs);
                  const html = markdownToHTML(markdown);
                  onChunk(html);
                } catch (error) {
                  onChunk("Failed to convert markdown to HTML");
                }
                break;

              case 'getPortfolioStatus':
                try {
                  const { walletAddress } = JSON.parse(functionArgs);
                  const portfolio = await getPortfolio(walletAddress);

                  onChunk(`\nPortfolio Overview: \n`);
                  onChunk(`Total Value: $${ portfolio.totalValueUSD.toFixed(2) } \n\n`);
                  onChunk(`Asset Allocation: \n`);
                  portfolio.assets.forEach(asset => {
                    onChunk(`${ asset.symbol }: ${ asset.amount.toFixed(4) } ($${ asset.valueUSD.toFixed(2) }) - ${ portfolio.percentages[asset.symbol] } \n`);
                  });
                } catch (error) {
                  onChunk("\nFailed to fetch portfolio data.\n");
                }
                break;

              case 'executeRebalance':
                try {
                  const { walletAddress, targetAllocation } = JSON.parse(functionArgs);
                  const currentPortfolio = await getPortfolio(walletAddress);
                  const result = await rebalancePortfolio(currentPortfolio, targetAllocation, true);

                  onChunk(`\nRebalancing Result: ${ result.status } \n`);
                  if (result.trades) {
                    onChunk(`\nRequired Trades: \n`);
                    result.trades.forEach(trade => {
                      onChunk(`${ trade.from } -> ${ trade.to }: ${ trade.percentage }%\n`);
                    });
                  }
                  if (result.message) {
                    onChunk(`\nMessage: ${ result.message } \n`);
                  }
                } catch (error) {
                  onChunk("\nPortfolio rebalancing failed.\n");
                }
                break;

              case 'condenseQuestion':
                try {
                  const { chatHistory, question } = JSON.parse(functionArgs);
                  const condensedPrompt = CONDENSE_QUESTION_TEMPLATE
                    .replace('{chat_history}', chatHistory)
                    .replace('{question}', question);
                  
                  const groqResponse = await groq.chat.completions.create({
                    model: 'mixtral-8x7b-32768',
                    messages: [{ role: 'user', content: condensedPrompt }],
                    ...DEFAULT_CONFIGS.condense
                  });
                  
                  onChunk(groqResponse.choices[0]?.message?.content || '');
                } catch (error) {
                  onChunk("\nFailed to condense question.\n");
                }
                break;

              case 'rephraseMessage':
                try {
                  const { message } = JSON.parse(functionArgs);
                  const rephrasePrompt = REPHRASE_TEMPLATE.replace('{question}', message);
                  
                  const groqResponse = await groq.chat.completions.create({
                    model: 'mixtral-8x7b-32768',
                    messages: [{ role: 'user', content: rephrasePrompt }],
                    ...DEFAULT_CONFIGS.rephrase
                  });
                  
                  onChunk(groqResponse.choices[0]?.message?.content || '');
                } catch (error) {
                  onChunk("\nFailed to rephrase message.\n");
                }
                break;

              case 'getWalletScoring':
                try {
                  const { walletAddress, rpcUrl = 'https://api.mainnet-beta.solana.com' } = JSON.parse(functionArgs);
                  const publicKey = new PublicKey(walletAddress);
                  const scoringKit = new ScoringWalletKit(rpcUrl);

                  await scoringKit.fetchTx(publicKey);
                  const metrics = scoringKit.getMetrics();

                  onChunk(`\nWallet Scoring Analysis: \n\n`);
                  onChunk(`Transaction Frequency: ${ (metrics.frequency * 100).toFixed(1) }%\n`);
                  onChunk(`Trading Volume: ${ (metrics.volume * 100).toFixed(1) }%\n`);
                  onChunk(`Profitability: ${ (metrics.profitability * 100).toFixed(1) }%\n`);
                  onChunk(`DEX Diversity: ${ (metrics.dexDiversity * 100).toFixed(1) }%\n`);
                  onChunk(`Stablecoin Activity: ${ (metrics.stablecoinActivity * 100).toFixed(1) }%\n`);
                  onChunk(`Risk Score: ${ (metrics.riskyContracts * 100).toFixed(1) }%\n`);
                  onChunk(`\nOverall Score: ${ (metrics.finalScore * 100).toFixed(1) }%\n`);
                } catch (error) {
                  onChunk("\nFailed to analyze wallet scoring.\n");
                }
                break;

              case 'getWalletHistory':
                try {
                  const { address, limit = 10 } = JSON.parse(functionArgs);
                  const publicKey = new PublicKey(address);
                  const kit = new ScoringWalletKit(process.env.NEXT_PUBLIC_RPC_URL!);
                  await kit.fetchTx(publicKey, limit);

                  onChunk(`\nTransaction History: \n\n`);
                  onChunk(`Total Transactions: ${ kit.getTransactionCount() } \n`);
                } catch (error) {
                  onChunk("\nFailed to fetch wallet history.\n");
                }
                break;

              case 'calculateWalletRisk':
                try {
                  const { address } = JSON.parse(functionArgs);
                  const publicKey = new PublicKey(address);
                  const kit = new ScoringWalletKit(process.env.NEXT_PUBLIC_RPC_URL!);
                  
                  await kit.fetchTx(publicKey);
                  const riskScore = kit.calcRiskContract();
                  const stableTokenVol = kit.calcStableTokenVol();

                  onChunk(`\nRisk Analysis: \n`);
                  onChunk(`Risk Score: ${ (riskScore * 100).toFixed(1) }%\n`);
                  onChunk(`Stable Token Volume: $${ stableTokenVol.toFixed(2) } \n`);
                } catch (error) {
                  onChunk("\nFailed to calculate wallet risk.\n");
                }
                break;

              case 'analyzeDexUsage':
                try {
                  const { address } = JSON.parse(functionArgs);
                  const publicKey = new PublicKey(address);
                  const kit = new ScoringWalletKit(process.env.NEXT_PUBLIC_RPC_URL!);
                  
                  await kit.fetchTx(publicKey);
                  const diversity = kit.calcDexDiversity();
                  const volume = kit.calcVol();

                  onChunk(`\nDEX Usage Analysis: \n`);
                  onChunk(`DEX Diversity Score: ${ (diversity * 100).toFixed(1) }%\n`);
                  onChunk(`Trading Volume: ${ volume.toFixed(2) } SOL\n`);
                } catch (error) {
                  onChunk("\nFailed to analyze DEX usage.\n");
                }
                break;

              case 'getDetailedTransactionHistory':
                try {
                  const { address, limit = 10 } = JSON.parse(functionArgs);
                  const processor = new TransactionProcessor(process.env.NEXT_PUBLIC_RPC_URL!);
                  const transactions = await processor.getTransactions(address, limit);

                  onChunk(`\nTransaction History: \n\n`);
                  transactions.forEach((tx, i) => {
                    onChunk(`${ i + 1 }. ${ tx.signature } \n`);
                    onChunk(`   Time: ${ new Date(tx.timestamp * 1000).toLocaleString() } \n`);
                    onChunk(`   Status: ${ tx.success ? 'Success' : 'Failed' } \n`);
                    if (tx.amount) onChunk(`   Amount: ${ tx.amount } SOL\n`);
                    if (tx.tokenTransfers?.length) {
                      onChunk(`   Token Transfers: ${
  tx.tokenTransfers.map(t =>
    `${t.amount} ${t.token.slice(0, 4)}...`).join(', ')
} \n`);
                    }
                    onChunk(`   Fee: ${ tx.fee } SOL\n\n`);
                  });
                } catch (error) {
                  onChunk("\nFailed to fetch transaction history.\n");
                }
                break;

              case 'getWalletMetrics':
                try {
                  const { address } = JSON.parse(functionArgs);
                  const processor = new TransactionProcessor(process.env.NEXT_PUBLIC_RPC_URL!);
                  const metrics = await processor.getTransactionMetrics(address);

                  onChunk(`\nWallet Metrics: \n\n`);
                  onChunk(`Total Volume: ${ metrics.totalVolume.toFixed(4) } SOL\n`);
                  onChunk(`Success Rate: ${ metrics.successRate.toFixed(1) }%\n`);
                  onChunk(`Average Transaction: ${ metrics.averageAmount.toFixed(4) } SOL\n`);
                  onChunk(`Unique Tokens: ${ metrics.uniqueTokens.length } \n`);
                  onChunk(`Program Interactions: ${
  Array.from(metrics.programInteractions.entries())
  .map(([prog, count]) => `\n   ${prog.slice(0, 8)}... (${count} times)`)
  .join('')
} \n`);
                } catch (error) {
                  onChunk("\nFailed to calculate wallet metrics.\n");
                }
                break;

              case 'handleTransaction':
                try {
                  const { connection, serializedTx, blockhash } = JSON.parse(functionArgs);
                  const txResponse = await transactionSenderAndConfirmationWaiter({
                    connection: new Connection(connection),
                    serializedTransaction: Buffer.from(serializedTx),
                    blockhashWithExpiryBlockHeight: blockhash
                  });

                  if (txResponse) {
                    onChunk(`\nTransaction Confirmed: \n`);
                    onChunk(`Signature: ${ txResponse.transaction.signatures[0] } \n`);
                    onChunk(`Block: ${ txResponse.slot } \n`);
                    onChunk(`Fee: ${ txResponse.meta?.fee } lamports\n`);
                  } else {
                    onChunk(`\nTransaction expired or failed.\n`);
                  }
                } catch (error) {
                  onChunk(`\nTransaction failed: ${ error instanceof Error ? error.message : 'Unknown error occurred' } \n`);
                }
                break;

              case 'validateAddress':
                try {
                  const { input, type } = JSON.parse(functionArgs);
                  const isValid = type === 'address' 
                    ? validateSolanaAddress(input)
                    : validateTransactionHash(input);
                    
                  if (isValid) {
                    const chainType = getChainType(input);
                    onChunk(`\nValidation Result: Valid ${ chainType } ${ type } \n`);
                    if (type === 'address') {
                      onChunk(`Formatted: ${ formatAddress(input) } \n`);
                    }
                  } else {
                    onChunk(`\nValidation Result: Invalid ${ type } \n`);
                  }
                } catch (error) {
                  onChunk("\nValidation failed.\n");
                }
                break;

              case 'validateTransaction':
                try {
                  const params = JSON.parse(functionArgs);
                  const validation = validateTransactionParams(params);
                  
                  if (validation.isValid) {
                    onChunk(`\nTransaction parameters are valid\n`);
                    onChunk(`Sender: ${ formatAddress(params.sender) } \n`);
                    onChunk(`Recipient: ${ formatAddress(params.recipient) } \n`);
                    onChunk(`Amount: ${ params.amount } SOL\n`);
                  } else {
                    onChunk(`\nValidation Error: ${ validation.error } \n`);
                  }
                } catch (error) {
                  onChunk("\nTransaction validation failed.\n");
                }
                break;

              case 'initializeWallet':
                try {
                  const success = await agentWallet.initialize();
                  onChunk(`\nWallet Initialization: ${ success ? 'Successful' : 'Failed' } \n`);
                } catch (error) {
                  onChunk("\nFailed to initialize wallet\n");
                }
                break;

              case 'getWalletConnection':
                try {
                  const connection = await agentWallet.getActiveConnection();
                  const slot = await connection.getSlot();
                  onChunk(`\nConnection Status: \n`);
                  onChunk(`Active: ${ !!connection } \n`);
                  onChunk(`Current Slot: ${ slot } \n`);
                  onChunk(`Using Fallback: ${ agentWallet['isUsingFallback'] } \n`);
                } catch (error) {
                  onChunk("\nFailed to get wallet connection status\n");
                }
                break;

              case 'processWalletText':
                try {
                  const { text } = JSON.parse(functionArgs);
                  const result = await agentWallet.processWalletText(text);
                  onChunk(`\nText Analysis Result: \n`);
                  onChunk(`Embedding: ${ JSON.stringify(result) } \n`);
                } catch (error) {
                  onChunk("\nFailed to process wallet text\n");
                }
                break;

              case 'generateImage':
                try {
                  const { prompt, size = '1024x1024', n = 1 } = JSON.parse(functionArgs);
                  
                  const agent = new SolanaAgentKit(
                    process.env.SOLANA_PRIVATE_KEY!,  // Provide the private key
                    'https://api.mainnet-beta.solana.com', // Provide the RPC URL
                    process.env.GROQ_API_KEY!// Provide the OpenAI API key, ensure it's a string
                  );
          
                  const result = await create_image(agent, prompt, size, n);
          
                  onChunk(`\nImage Generation Results: \n`);
                  result.images.forEach((image, i) => {
                    onChunk(`Image ${ i + 1 }: ${ image } \n`);
                  });
                  onChunk(`\nMetadata: \n`);
                  onChunk(`Model: ${ result.metadata?.model } \n`);
                  onChunk(`Generation Time: ${ result.metadata?.inferenceTime } ms\n`);
                } catch (error) {
                  const parsedError = JSON.parse((error as Error).message);
                  onChunk(`\nImage Generation Failed: \n`);
                  onChunk(`Error Code: ${ parsedError.code } \n`);
                  onChunk(`Message: ${ parsedError.message } \n`);
                }
                break;

              case 'getTokenData':
                try {
                  const { input, byTicker = false } = JSON.parse(functionArgs);
                  let tokenData;

                  if (byTicker) {
                    tokenData = await getTokenDataByTicker(input);
                  } else {
                    tokenData = await getTokenDataByAddress(new PublicKey(input));
                  }

                  if (tokenData) {
                    onChunk(`\nToken Information: \n`);
                    onChunk(`Name: ${ tokenData.name } \n`);
                    onChunk(`Symbol: ${ tokenData.symbol } \n`);
                    onChunk(`Address: ${ tokenData.address } \n`);
                    onChunk(`Decimals: ${ tokenData.decimals } \n`);
                    
                    if (tokenData.extensions) {
                      if (tokenData.extensions.coingeckoId) {
                        onChunk(`CoinGecko: ${ tokenData.extensions.coingeckoId } \n`);
                      }
                      if (tokenData.extensions.website) {
                        onChunk(`Website: ${ tokenData.extensions.website } \n`);
                      }
                      if (tokenData.extensions.twitter) {
                        onChunk(`Twitter: ${ tokenData.extensions.twitter } \n`);
                      }
                    }
                    
                    if (tokenData.tags?.length) {
                      onChunk(`Tags: ${ tokenData.tags.join(', ') } \n`);
                    }
                  } else {
                    onChunk(`\nToken not found.\n`);
                  }
                } catch (error) {
                  onChunk(`\nError fetching token data: ${ error instanceof Error ? error.message : 'Unknown error' } \n`);
                }
                break;

              case 'getWalletAssets':
                try {
                  const { address, limit = 10 } = JSON.parse(functionArgs);
                  const assets = await getAssetsByOwner(null, new PublicKey(address), limit);
                  
                  onChunk(`\nWallet Assets: \n\n`);
                  assets.forEach((asset: any) => {
                    onChunk(`Token: ${ asset.symbol } \n`);
                    onChunk(`Mint: ${ asset.mint } \n`);
                    onChunk(`Amount: ${ asset.amount / Math.pow(10, asset.decimals) } \n`);
                    onChunk(`Decimals: ${ asset.decimals } \n\n`);
                  });

                  if (assets.length === 0) {
                    onChunk(`No assets found for this wallet.\n`);
                  }
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                  onChunk(`\nFailed to fetch wallet assets: ${ errorMessage } \n`);
                }
                break;

              case 'getRecentTxs':
                try {
                  const { address } = JSON.parse(functionArgs);
                  const transactions = await getRecentTransactions(address);

                  onChunk(`\nRecent Transactions: \n\n`);
                  transactions.forEach(tx => {
                    onChunk(`Type: ${ tx.type } \n`);
                    onChunk(`Status: ${ tx.status } \n`);
                    onChunk(`Time: ${ tx.timestamp } \n`);
                    onChunk(`From: ${ tx.from } \n`);
                    onChunk(`To: ${ tx.to } \n`);
                    if (tx.amount) {
                      onChunk(`Amount: ${ tx.amount } ${ tx.token } \n`);
                    }
                    onChunk(`Signature: ${ tx.signature } \n\n`);
                  });

                  if (transactions.length === 0) {
                    onChunk(`No recent transactions found.\n`);
                  }
                } catch (error) {
                  onChunk(`\nFailed to fetch transactions: ${ error instanceof Error ? error.message : 'Unknown error' } \n`);
                }
                break;

              case 'parseTransaction':
                try {
                  const { transactionId } = JSON.parse(functionArgs);
                  const agent = new SolanaAgentKit(
                    process.env.SOLANA_PRIVATE_KEY!,  // Provide the private key
                    'https://api.mainnet-beta.solana.com',
                    process.env.GROQ_API_KEY! // Provide the RPC URL
                  );
                  const parsedData = await parseTransaction(agent, transactionId);
                  
                  onChunk(`\nParsed Transaction Data: \n\n`);
                  onChunk(JSON.stringify(parsedData, null, 2));
                } catch (error) {
                  onChunk(`\nFailed to parse transaction: ${ error instanceof Error ? error.message : 'Unknown error' } \n`);
                }
                break;

              case 'sendHighPriorityTransaction':
                try {
                  const { priorityLevel, amount, to, splmintAddress } = JSON.parse(functionArgs);
                  const agent = new SolanaAgentKit(
                    process.env.SOLANA_PRIVATE_KEY!,  // Provide the private key
                    'https://api.mainnet-beta.solana.com' ,
                    process.env.GROQ_API_KEY! // Provide the RPC URL
                  );
                  const recipient = new PublicKey(to);
                  const transactionResult = await sendTransactionWithPriorityFee(agent, priorityLevel, amount, recipient, splmintAddress ? new PublicKey(splmintAddress) : undefined);
                  
                  onChunk(`\nTransaction Sent: \n\n`);
                  onChunk(`Transaction ID: ${ transactionResult.transactionId } \n`);
                  onChunk(`Priority Fee: ${ transactionResult.fee } microLamports\n`);
                } catch (error) {
                  onChunk(`\nFailed to send transaction: ${ error instanceof Error ? error.message : 'Unknown error' } \n`);
                }
                break;

              case 'openbookCreateMarket':
                const { baseMint, quoteMint, lotSize, tickSize } = JSON.parse(functionArgs);
                result = await openbookCreateMarket(agent, new PublicKey(baseMint), new PublicKey(quoteMint), lotSize, tickSize);
                onChunk(`\nMarket Created Successfully: \n\n`);
                onChunk(`Transaction IDs: ${ result.join(', ') } \n`);
                break;

              case 'launchPumpFunToken':
                const { name, symbol, initialSupply, decimals } = JSON.parse(functionArgs);
                result = await launchPumpFunToken(agent, name, symbol, initialSupply, decimals);
                onChunk(`\nPumpFun Token Launched Successfully: \n\n`);
                onChunk(`Token Address: ${ result.mint } \n`);
                onChunk(`Transaction ID: ${ result.signature } \n`);
                break;

              case 'swap':
                const { outputMint, inputAmount, inputMint, inputDecimal } = JSON.parse(functionArgs);
                result = await swapTool.invoke({ outputMint, inputAmount, inputMint, inputDecimal });
                onChunk(`\nSwap Transaction Result: \n\n`);
                onChunk(`Transaction ID: ${result} \n`);
                break;

              case 'createAmmPool':
                try {
                  const { baseMint, quoteMint, baseAmount, quoteAmount } = JSON.parse(functionArgs);
                  const result = await AmmPool.createAmmPool() as unknown as { poolId: string; txId: string };
                  onChunk(`\nAMM Pool Created:\nPool ID: ${result.poolId}\nTransaction: ${result.txId}\n`);
                } catch (error) {
                  onChunk(`\nFailed to create AMM pool: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'addLiquidity': 
                try {
                  const { poolId, baseAmount, quoteAmount } = JSON.parse(functionArgs);
                  const result = await AmmOps.addLiquidity() as { txId: string };
                  onChunk(`\nLiquidity Added:\nTransaction: ${result.txId}\n`);
                } catch (error) {
                  onChunk(`\nFailed to add liquidity: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'createClmmPool':
                try {
                  const { mint1, mint2, initialPrice } = JSON.parse(functionArgs);
                  const result = await ClmmPool.createPool() as { poolId: string; txId: string };
                  onChunk(`\nCLMM Pool Created:\nPool ID: ${result.poolId}\nTransaction: ${result.txId}\n`);
                } catch (error) {
                  onChunk(`\nFailed to create CLMM pool: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'manageFarmRewards':
                try {
                  const { poolId, rewardMint, rewardRate, duration } = JSON.parse(functionArgs);
                  await ClmmRewards.setFarmRewards();
                  onChunk(`\nFarm Rewards Updated Successfully\n`);
                } catch (error) {
                  onChunk(`\nFailed to manage farm rewards: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'harvestRewards':
                try {
                  const { poolId, positionId } = JSON.parse(functionArgs);
                  const result = await ClmmHarvest.harvestAllRewards();
                  onChunk(`\nRewards Harvested:\nTransaction: ${result}\n`);
                } catch (error) {
                  onChunk(`\nFailed to harvest rewards: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'getRaydiumPoolInfo':
                try {
                  const { poolType } = JSON.parse(functionArgs);
                  let info;
                  switch (poolType) {
                    case 'AMM':
                      info = await AmmInfo.fetchRpcPoolInfo();
                      break;
                    case 'CLMM':
                      info = await ClmmPoolInfo.fetchRpcPoolInfo();
                      break;
                    default:
                      throw new Error('Unsupported pool type');
                  }
                  onChunk(`\nPool Information:\n${JSON.stringify(info, null, 2)}\n`);
                } catch (error) {
                  onChunk(`\nFailed to get pool info: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;

              case 'createMarket':
                try {
                  const { baseMint, quoteMint, lotSize, tickSize } = JSON.parse(functionArgs);
                  const result = await AmmMarket.createMarket() as { marketId: string; txId: string };
                  onChunk(`\nMarket Created:\nMarket ID: ${result.marketId}\nTransaction: ${result.txId}\n`);
                } catch (error) {
                  onChunk(`\nFailed to create market: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'createClmmPosition':
                try {
                  const { poolId, tickLower, tickUpper, amount } = JSON.parse(functionArgs);
                  const result = await ClmmNewPosition.createPosition() as { positionId: string; txId: string };
                  onChunk(`\nPosition Created:\nPosition ID: ${result.positionId}\nTransaction: ${result.txId}\n`);
                } catch (error) {
                  onChunk(`\nFailed to create position: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'modifyClmmPosition':
                try {
                  const { operation } = JSON.parse(functionArgs);
                  const result = operation === 'increase' 
                    ? await ClmmIncrease.increaseLiquidity()
                    : await ClmmDecrease.decreaseLiquidity();
                  onChunk(`\nPosition Modified:\nTransaction: ${result}\n`);
                } catch (error) {
                  onChunk(`\nFailed to modify position: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'createFarm':
                try {
                  const { poolId, rewardMints } = JSON.parse(functionArgs);
                  onChunk(`\nFarm Created Successfully\n`);
                } catch (error) {
                  onChunk(`\nFailed to create farm: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'stakeFarm':
                try {
                  const { farmId, amount } = JSON.parse(functionArgs);
                  const result = await FarmStake.stake() as { txId: string };
                  onChunk(`\nStake Successful:\nTransaction: ${result.txId}\n`);
                } catch (error) {
                  onChunk(`\nFailed to stake: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;
            
              case 'fetchMarketMaker':
                try {
                  const { poolId, positionRange } = JSON.parse(functionArgs);
                  const result = await ClmmMarketMaker.getInfo({
                    poolId: new PublicKey(poolId),
                    positionRange
                  });
                  onChunk(`\nMarket Maker Info:\n${JSON.stringify(result, null, 2)}\n`);
                } catch (error) {
                  onChunk(`\nFailed to fetch market maker info: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;

              case 'executeSwap':
                try {
                  const { fromToken, toToken, amount } = JSON.parse(functionArgs);
                  const swapResult = await swapTool.invoke({
                    outputMint: toToken,
                    inputAmount: amount,
                    inputMint: fromToken,
                    inputDecimal: 9 
                  });
                  onChunk(`Swap executed: ${swapResult}\n`);
                } catch (error) {
                  onChunk(`Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
                }
                break;

              case 'getGeckoTokenInfo':
              case 'getGeckoTokenPools':
              case 'getGeckoTokenPriceHistory':
              case 'getGeckoTrendingTokens':
              case 'analyzeGeckoToken':
                await handleGeckoTerminalFunctions(functionName, functionArgs, onChunk);
                break;
            }
          } catch (error) {
            console.error('Function execution error:', error);
            onChunk('\nAn error occurred while processing your request. Please try again.\n');
          }
        }

        try {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch (chunkError) {
          logger.error('Error processing chunk:', chunkError);
          continue;
        }
      }

      return; // Success, exit the retry loop

    } catch (error: any) {
      retries++;
      
      // Handle rate limiting
      if (error?.status === 429) {
        logger.warn(`Rate limited.Attempt ${ retries } of ${ RATE_LIMIT.MAX_RETRIES } `);
        if (retries < RATE_LIMIT.MAX_RETRIES) {
          await delay(RATE_LIMIT.RETRY_DELAY);
          continue;
        }
      }

      // Handle other errors
      logger.error('Groq API error:', error);
      
      // Provide user-friendly error message
      let errorMessage = "\nI apologize, but I encountered an error. ";
      if (error?.status === 429) {
        errorMessage += "I'm receiving too many requests right now.";
      } else if (error?.status === 400) {
        errorMessage += "I wasn't able to process that request properly.";
      } else {
        errorMessage += "Please try again.";
      }

      onChunk(errorMessage);
      
      if (retries >= RATE_LIMIT.MAX_RETRIES) {
        throw error;
      }
    }
  }
}

// Non-streaming completion function
export async function botCompletion(
  messages: Message[],
  providedApiKey?: string
): Promise<string> {
  const apiKey = providedApiKey;
  if (!apiKey) throw new Error('API key not found');

  const groq = createGroqClient(apiKey);
  let retries = 0;

  while (retries < RATE_LIMIT.MAX_RETRIES) {
    try {
      const formattedMessages = [
        {
          role: 'system',
          content: JENNA_PERSONALITY,
        },
        ...messages.map(msg => {
          if (msg.role === 'function') {
            return {
              role: 'function' as const,
              name: msg.name!,
              content: msg.content,
              function_call: msg.function_call
            };
          }
          return {
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
            ...(msg.name && { name: msg.name }),
            ...(msg.function_call && { function_call: msg.function_call })
          };
        })
      ];

      const completion = await groq.chat.completions.create({
        model: 'mixtral-8x7b-32768',
        messages: formattedMessages as any, // Type assertion to avoid TypeScript errors
        temperature: 0.7,
        max_tokens: 1000,
        functions,
        function_call: 'auto'
      });

      const response = completion.choices[0]?.message;
      return response?.content || '';

    } catch (error) {
      retries++;
      
      if (retries < RATE_LIMIT.MAX_RETRIES) {
        await delay(RATE_LIMIT.RETRY_DELAY);
        continue;
      }
      
      logger.error('Groq API error:', error);
      return "I apologize, but I encountered an error. Please try again.";
    }
  }

  return "Maximum retries reached. Please try again later.";
}

// Helper function for balance caching
async function getCachedBalance(address: string): Promise<number> {
  const now = Date.now();
  const cached = balanceCache.get(address);
  
  if (cached && (now - cached.timestamp) < BALANCE_CACHE_DURATION) {
    return cached.balance;
  }
  
  const balance = await agentWallet.getBalance();
  balanceCache.set(address, {
    balance: balance.balance,
    timestamp: now
  });
  
  return balance.balance;
}

// Helper function for transaction type determination
function getChainType(hash: string): 'ethereum' | 'solana' {
  return hash.startsWith('0x') && hash.length === 66 ? 'ethereum' : 'solana';
}

// Trade execution helper
export async function executeTradeCommand(message: string, wallet: any) {
  const amount = parseFloat(message);
  if (isNaN(amount)) {
    return null;
  }
  const parsedCommand = await executeSwap('SOL', 'USDC', amount, USDC_MINT);
  if (parsedCommand) {
    const { outputToken, inputToken } = JSON.parse(parsedCommand);
    return trade(
      wallet,
      new PublicKey(outputToken),
      amount,
      new PublicKey(inputToken),
      50 // 0.5% slippage converted to basis points
    );
  }
  return null;
}

async function handleGeckoTerminalFunctions(functionName: string, functionArgs: string, onChunk: (chunk: string) => void) {
  try {
    const args = JSON.parse(functionArgs);

    switch (functionName) {
      case 'getGeckoTokenInfo':
        const tokenInfo = await geckoTerminalAPI.getTokenData(args.tokenAddress);
        if (tokenInfo) {
          onChunk('\nToken Information:\n\n');
          onChunk(`Name: ${tokenInfo.name}\n`);
          onChunk(`Symbol: ${tokenInfo.symbol}\n`);
          onChunk(`Price: $${tokenInfo.price_usd.toFixed(6)}\n`);
          onChunk(`24h Volume: $${tokenInfo.volume_24h.toLocaleString()}\n`);
          onChunk(`24h Change: ${tokenInfo.price_change_24h.toFixed(2)}%\n`);
          onChunk(`Market Cap: $${tokenInfo.market_cap.toLocaleString()}\n`);
        } else {
          onChunk('\nToken information not found.\n');
        }
        break;

     
    }
  } catch (error) {
    logger.error('GeckoTerminal function error:', error);
    onChunk('\nAn error occurred while processing GeckoTerminal data.\n');
  }
}


