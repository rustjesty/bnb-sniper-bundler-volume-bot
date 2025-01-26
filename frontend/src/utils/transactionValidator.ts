import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import logger from './logger';

export interface TransactionValidationConfig {
  maxFee: number;
  minConfirmations: number;
  timeout: number;
}

export class TransactionValidator {
  private static readonly DEFAULT_CONFIG: TransactionValidationConfig = {
    maxFee: 0.1, // SOL
    minConfirmations: 1,
    timeout: 60000 // ms
  };

  static async validateTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    config: Partial<TransactionValidationConfig> = {}
  ): Promise<{ isValid: boolean; reason?: string }> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    try {
      // Check fee
      const fee = await connection.getFeeForMessage(
        'version' in transaction ? transaction.message : transaction.compileMessage(),
        'confirmed'
      );

      if (!fee.value) {
        return { isValid: false, reason: 'Unable to estimate fee' };
      }

      if (fee.value / 1e9 > finalConfig.maxFee) {
        return { isValid: false, reason: 'Transaction fee too high' };
      }

      // Additional validation logic here
      return { isValid: true };
    } catch (error) {
      logger.error('Transaction validation error:', error);
      return { isValid: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async monitorTransaction(
    signature: string,
    connection: Connection,
    config: Partial<TransactionValidationConfig> = {}
  ): Promise<boolean> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    while (Date.now() - startTime < finalConfig.timeout) {
      try {
        const status = await connection.getSignatureStatus(signature);
        
        if (status.value?.confirmationStatus === 'finalized' || 
            (status.value?.confirmations ?? 0) >= finalConfig.minConfirmations) {
          return true;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error('Transaction monitoring error:', error);
      }
    }

    return false;
  }
}
