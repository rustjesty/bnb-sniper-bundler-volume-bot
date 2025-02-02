// src/components/chat/constants.ts
import { ExamplePrompt } from './types';
import { 
  IconBolt, 
  IconCoin, 
  IconWallet, 
  IconChart, 
  IconSwap, 
  IconHistory 
} from '../Icon';

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    title: "Check SOL Price",
    prompt: "What's the current price of Solana?",
    icon: IconBolt
  },
  {
    title: "View JENNA Token",
    prompt: "Show me info about the JENNA token",
    icon: IconCoin
  },
  {
    title: "Analyze Wallet",
    prompt: "Analyze trading performance for a wallet",
    icon: IconWallet
  },
  {
    title: "Market Analysis",
    prompt: "Analyze market trends for top Solana tokens",
    icon: IconChart
  },
  {
    title: "Token Swap",
    prompt: "How to swap SOL for USDC?",
    icon: IconSwap
  },
  {
    title: "Transaction History",
    prompt: "Show my recent transactions",
    icon: IconHistory
  }
];