import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import logger from './logger';

export type ChainType = 'solana' | 'ethereum' | 'invalid';

// Add base58 validation helper
export const isValidBase58 = (value: string): boolean => {
  try {
    if (!value) return false;
    const decoded = bs58.decode(value);
    return decoded.length > 0;
  } catch {
    return false;
  }
};

/**
 * Validates a Solana address using PublicKey and bs58
 */
export const validateSolanaAddress = (address: string): boolean => {
  try {
    // First check base58 format
    if (!isValidBase58(address)) {
      return false;
    }

    // Then check PublicKey validity
    new PublicKey(address);
    
    // Finally check length and character set
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  } catch (error) {
    logger.debug('Invalid Solana address:', error);
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
 * Validates a Solana transaction signature with base58 check
 */
export const validateTransactionHash = (hash: string): boolean => {
  try {
    // Check base58 format first
    if (!isValidBase58(hash)) {
      return false;
    }
    
    // Check signature length
    if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(hash)) {
      return false;
    }
    
    // Try to decode the signature
    const decoded = bs58.decode(hash);
    return decoded.length === 64; // Solana signatures are 64 bytes
  } catch (error) {
    logger.debug('Invalid transaction hash:', error);
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
 * Safe key creation with bs58 validation
 */
export const createSafePublicKey = (value: string): PublicKey | null => {
  try {
    if (!isValidBase58(value)) {
      return null;
    }
    return new PublicKey(value);
  } catch (error) {
    logger.debug('Failed to create PublicKey:', error);
    return null;
  }
};

/**
 * Formats and validates a Solana address with proper checks
 */
export const formatAddress = (address: string, shortForm: boolean = true): string => {
  try {
    // Create PublicKey to validate format
    const pubKey = createSafePublicKey(address);
    if (!pubKey) {
      throw new Error('Invalid address format');
    }
    
    const base58Address = pubKey.toBase58();
    if (shortForm) {
      return `${base58Address.slice(0, 4)}...${base58Address.slice(-4)}`;
    }
    
    return base58Address;
  } catch (error) {
    logger.error('Error formatting address:', error);
    return 'Invalid Address';
  }
};

/**
 * Validates transaction parameters with enhanced checks
 */
export const validateTransactionParams = (params: {
  sender?: string;
  recipient?: string;
  amount?: number;
  programId?: string;
}): { isValid: boolean; error?: string } => {
  try {
    const { sender, recipient, amount, programId } = params;

    // Enhanced validation with base58 checks
    if (sender) {
      if (!isValidBase58(sender)) {
        return { isValid: false, error: 'Invalid sender address format' };
      }
      if (!validateSolanaAddress(sender)) {
        return { isValid: false, error: 'Invalid sender address' };
      }
    }

    if (recipient) {
      if (!isValidBase58(recipient)) {
        return { isValid: false, error: 'Invalid recipient address format' };
      }
      if (!validateSolanaAddress(recipient)) {
        return { isValid: false, error: 'Invalid recipient address' };
      }
    }

    if (programId) {
      if (!isValidBase58(programId)) {
        return { isValid: false, error: 'Invalid program ID format' };
      }
      if (!validateProgramId(programId)) {
        return { isValid: false, error: 'Invalid program ID' };
      }
    }

    if (amount && !validateSolanaAmount(amount)) {
      return { isValid: false, error: 'Invalid amount' };
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

// Enhanced TransactionValidator with better checks
export class TransactionValidator {
  private static readonly MAX_FEE_THRESHOLD = 0.1; // SOL
  private static readonly MIN_CONFIRMATIONS = 1;
  private static readonly CONFIRMATION_TIMEOUT = 60000; // ms
  private static readonly RETRY_INTERVAL = 1000; // ms

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
      // Validate transaction parameters
      if (params) {
        const paramValidation = validateTransactionParams(params);
        if (!paramValidation.isValid) {
          return { isValid: false, error: paramValidation.error };
        }
      }

      // Validate keys in transaction
      if ('version' in transaction) {
        // VersionedTransaction validation
        const message = transaction.message;
        for (const key of message.staticAccountKeys) {
          if (!isValidBase58(key.toBase58())) {
            return { isValid: false, error: 'Invalid account key in transaction' };
          }
        }
      } else {
        // Legacy Transaction validation
        for (const key of transaction.signatures) {
          if (!isValidBase58(key.publicKey.toBase58())) {
            return { isValid: false, error: 'Invalid signature key in transaction' };
          }
        }
      }

      // Check transaction fee
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
    // Validate signature format first
    if (!validateTransactionHash(signature)) {
      return { confirmed: false, error: 'Invalid transaction signature format' };
    }

    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < TransactionValidator.CONFIRMATION_TIMEOUT) {
      try {
        attempts++;
        const status = await this.connection.getSignatureStatus(signature);
        
        if (!status.value) {
          if (attempts > 5) {
            return { confirmed: false, error: 'Transaction not found' };
          }
          await new Promise(resolve => setTimeout(resolve, TransactionValidator.RETRY_INTERVAL));
          continue;
        }

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

        await new Promise(resolve => setTimeout(resolve, TransactionValidator.RETRY_INTERVAL));
      } catch (error) {
        logger.error('Transaction monitoring error:', error);
        if (attempts > 5) {
          return { confirmed: false, error: 'Monitoring failed' };
        }
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