import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import logger from './logger';

export type ChainType = 'solana' | 'ethereum' | 'invalid';

/**
 * Validates a Solana address using PublicKey
 */
export const validateSolanaAddress = (address: string): boolean => {
  try {
    // Use PublicKey for proper validation
    new PublicKey(address);
    // Additional check for length and character set
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  } catch (error) {
    return false;
  }
};

/**
 * Validates an Ethereum address
 */
export const validateEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validates a Solana transaction signature
 */
export const validateTransactionHash = (hash: string): boolean => {
  try {
    // Solana transaction signatures are 88 characters long
    if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(hash)) {
      return false;
    }
    
    // Additional validation logic could be added here
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Determines the chain type from an address
 */
export const getChainType = (address: string): ChainType => {
  try {
    if (!address) return 'invalid';

    // Check for Ethereum address
    if (validateEthereumAddress(address)) {
      return 'ethereum';
    }

    // Check for Solana address
    if (validateSolanaAddress(address)) {
      return 'solana';
    }

    return 'invalid';
  } catch (error) {
    logger.error('Error in getChainType:', error);
    return 'invalid';
  }
};

/**
 * Validates a Solana amount (in SOL)
 */
export const validateSolanaAmount = (amount: number): boolean => {
  try {
    // Check if amount is a valid number
    if (!Number.isFinite(amount)) return false;
    
    // Check if amount is positive
    if (amount <= 0) return false;
    
    // Check for maximum reasonable amount (1 billion SOL)
    if (amount > 1_000_000_000) return false;
    
    // Check decimal places (max 9 decimals for SOL)
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 9) return false;
    
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validates token decimals
 */
export const validateTokenDecimals = (decimals: number): boolean => {
  try {
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 9;
  } catch {
    return false;
  }
};

/**
 * Validates a program ID
 */
export const validateProgramId = (programId: string): boolean => {
  try {
    new PublicKey(programId);
    return true;
  } catch {
    return false;
  }
};

/**
 * Formats and validates a Solana address for display
 */
export const formatAddress = (address: string, shortForm: boolean = true): string => {
  try {
    if (!validateSolanaAddress(address)) {
      throw new Error('Invalid address');
    }
    
    if (shortForm) {
      return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }
    
    return address;
  } catch (error) {
    logger.error('Error formatting address:', error);
    return 'Invalid Address';
  }
};

/**
 * Validates transaction parameters
 */
export const validateTransactionParams = (params: {
  sender?: string;
  recipient?: string;
  amount?: number;
  programId?: string;
}): { isValid: boolean; error?: string } => {
  try {
    const { sender, recipient, amount, programId } = params;

    if (sender && !validateSolanaAddress(sender)) {
      return { isValid: false, error: 'Invalid sender address' };
    }

    if (recipient && !validateSolanaAddress(recipient)) {
      return { isValid: false, error: 'Invalid recipient address' };
    }

    if (amount && !validateSolanaAmount(amount)) {
      return { isValid: false, error: 'Invalid amount' };
    }

    if (programId && !validateProgramId(programId)) {
      return { isValid: false, error: 'Invalid program ID' };
    }

    return { isValid: true };
  } catch (error) {
    logger.error('Error validating transaction params:', error);
    return { isValid: false, error: 'Validation error' };
  }
};

/**
 * Check if an address is a token mint
 */
export const isTokenMint = (address: string): boolean => {
  try {
    if (!validateSolanaAddress(address)) return false;
    
    // Additional token program checks could be added here
    return true;
  } catch {
    return false;
  }
};

export class TransactionValidator {
  private static readonly MAX_FEE_THRESHOLD = 0.1; // SOL
  private static readonly MIN_CONFIRMATIONS = 1;
  private static readonly CONFIRMATION_TIMEOUT = 60000; // ms

  constructor(private connection: Connection) {}

  async validateTransaction(
    transaction: Transaction | VersionedTransaction,
    params?: {
      sender?: string;
      recipient?: string;
      amount?: number;
    }
  ): Promise<ValidationResult> {
    try {
      if (params) {
        const paramValidation = validateTransactionParams(params);
        if (!paramValidation.isValid) {
          return { isValid: false, error: paramValidation.error };
        }
      }

      const fee = await this.connection.getFeeForMessage(
        'version' in transaction ? transaction.message : transaction.compileMessage(),
        'confirmed'
      );

      if (!fee || fee.value === null || fee.value / 1e9 > TransactionValidator.MAX_FEE_THRESHOLD) {
        return { isValid: false, error: 'Transaction fee too high' };
      }

      return { isValid: true };
    } catch (error) {
      logger.error('Transaction validation error:', error);
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Unknown validation error' 
      };
    }
  }

  async monitorTransaction(signature: string): Promise<MonitoringResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < TransactionValidator.CONFIRMATION_TIMEOUT) {
      try {
        const status = await this.connection.getSignatureStatus(signature);
        
        if (!status.value) continue;

        if (status.value.err) {
          return { 
            confirmed: false, 
            error: 'Transaction failed', 
            confirmations: status.value.confirmations ?? undefined
          };
        }

        if (status.value.confirmationStatus === 'finalized' || 
            (status.value.confirmations ?? 0) >= TransactionValidator.MIN_CONFIRMATIONS) {
          return { 
            confirmed: true, 
            confirmations: status.value.confirmations ?? undefined
          };
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error('Transaction monitoring error:', error);
      }
    }

    return { confirmed: false, error: 'Confirmation timeout' };
  }
}

// Export types for use in other modules
export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

export type MonitoringResult = {
  confirmed: boolean;
  error?: string;
  confirmations?: number;
};