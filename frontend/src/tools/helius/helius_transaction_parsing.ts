import { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';

interface HeliusEnhancedTransaction {
  timestamp: number;
  fee: number;
  signature: string;
  status: 'success' | 'failed';
  type: string;
  accountData: {
    account: string;
    program: string;
    type: string;
    changeType: string;
    data: any;
  }[];
  tokenTransfers?: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAddress: string;
    symbol: string;
    decimals: number;
  }[];
}

interface ParsedTransactionResult {
  timestamp: string;
  status: 'success' | 'failed';
  type: string;
  fee?: number;
  signature: string;
  amount?: number;
  sender?: string;
  receiver?: string;
  tokenTransfer?: {
    amount: number;
    symbol: string;
    fromAccount: string;
    toAccount: string;
  };
  raw?: HeliusEnhancedTransaction;
}

/**
 * Parse a Solana transaction using the Helius Enhanced Transactions API
 * @param signature The transaction signature to parse
 * @param config Optional configuration object
 * @returns Parsed transaction data
 */
export async function parseTransaction(
  signature: string,
  config?: {
    includeRawData?: boolean;
    apiKey?: string;
    rpcUrl?: string;
  }
): Promise<ParsedTransactionResult> {
  try {
    // Validate signature
    if (!signature || typeof signature !== 'string') {
      throw new Error('Invalid transaction signature');
    }

    // Get API key
    const apiKey = config?.apiKey || process.env.HELIUS_API_KEY;
    if (!apiKey) {
      throw new Error('HELIUS_API_KEY not found');
    }

    // Fetch enhanced transaction data
    const url = `https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [signature] })
    });

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status} - ${response.statusText}`);
    }

    const [transaction] = await response.json() as HeliusEnhancedTransaction[];
    
    if (!transaction) {
      throw new Error('No transaction data returned');
    }

    // Get additional transaction data from RPC if needed
    let additionalData: ParsedTransactionWithMeta | null = null;
    if (config?.rpcUrl) {
      const connection = new Connection(config.rpcUrl);
      additionalData = await connection.getParsedTransaction(signature, 'confirmed');
    }

    // Format response
    const result: ParsedTransactionResult = {
      timestamp: new Date(transaction.timestamp * 1000).toISOString(),
      status: transaction.status,
      type: transaction.type,
      fee: transaction.fee / 1e9, // Convert lamports to SOL
      signature: transaction.signature,
    };

    // Add token transfer data if present
    // Handle token transfers with proper type checking
    const tokenTransfers = transaction.tokenTransfers ?? [];
    if (tokenTransfers.length > 0) {
      const transfer = tokenTransfers[0];
      if (transfer) {
        result.tokenTransfer = {
          amount: transfer.amount / Math.pow(10, transfer.decimals),
          symbol: transfer.symbol,
          fromAccount: transfer.fromUserAccount,
          toAccount: transfer.toUserAccount
        }
    }
    }

    // Add sender/receiver if available
    if (transaction.accountData?.length > 0) {
      const accounts = transaction.accountData.filter(acc => 
        acc.changeType === 'modified' || acc.changeType === 'changed'
      );
      if (accounts.length >= 2) {
        result.sender = accounts[0].account;
        result.receiver = accounts[1].account;
      }
    }

    // Include raw data if requested
    if (config?.includeRawData) {
      result.raw = transaction;
    }

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Transaction parsing error:', errorMessage);
    throw new Error(`Failed to parse transaction: ${errorMessage}`);
  }
}

/**
 * Format transaction data for chat display
 * @param parsedTx Parsed transaction result
 * @returns Formatted string for chat display
 */
export function formatTransactionForChat(parsedTx: ParsedTransactionResult): string {
  const lines = [
    `Transaction Details:`,
    `Status: ${parsedTx.status}`,
    `Type: ${parsedTx.type}`,
    `Timestamp: ${parsedTx.timestamp}`,
  ];

  if (parsedTx.fee) {
    lines.push(`Fee: ${parsedTx.fee} SOL`);
  }

  if (parsedTx.tokenTransfer) {
    lines.push(
      `Token Transfer:`,
      `  Amount: ${parsedTx.tokenTransfer.amount} ${parsedTx.tokenTransfer.symbol}`,
      `  From: ${parsedTx.tokenTransfer.fromAccount}`,
      `  To: ${parsedTx.tokenTransfer.toAccount}`
    );
  }

  return lines.join('\n');
}