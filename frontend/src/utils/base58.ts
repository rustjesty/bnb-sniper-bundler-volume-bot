// utils/base58.ts
import bs58 from 'bs58';
import logger from './logger';
import { Keypair, PublicKey } from '@solana/web3.js';

/**
 * Safe Base58 decoder with validation
 */
export const tryBase58Decode = (str: string | null | undefined): Uint8Array | null => {
  try {
    // Input validation
    if (!str || typeof str !== 'string') {
      return null;
    }
    
    // Base58 format validation
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    if (!base58Regex.test(str)) {
      return null;
    }

    // Attempt decode
    return bs58.decode(str);
  } catch (error) {
    logger.error('Base58 decode error:', error);
    return null;
  }
};

/**
 * Safe Base58 encoder with validation
 */
export const tryBase58Encode = (buffer: Uint8Array | null | undefined): string | null => {
  try {
    if (!buffer || !(buffer instanceof Uint8Array)) {
      return null;
    }
    return bs58.encode(buffer);
  } catch (error) {
    logger.error('Base58 encode error:', error);
    return null;
  }
};

/**
 * Validates if a string is a valid Base58 format
 */
export const isValidBase58 = (str: string | null | undefined): boolean => {
  try {
    if (!str || typeof str !== 'string') {
      return false;
    }
    const decoded = tryBase58Decode(str);
    return decoded !== null;
  } catch {
    return false;
  }
};

/**
 * Safe module importer for Raydium and other modules
 */
export const safeImport = async <T>(
  modulePath: string,
  fallback: T | null = null
): Promise<T | null> => {
  try {
    const importedModule = await import(modulePath);
    return importedModule as T;
  } catch (error) {
    logger.error(`Failed to import ${modulePath}:`, error);
    return fallback;
  }
};

/**
 * Wrapper for Base58 operations with keypair
 */
export const safeKeypairFromString = (privateKeyString: string | null | undefined): Keypair | null => {
  try {
    if (!privateKeyString) return null;
    
    const decoded = tryBase58Decode(privateKeyString);
    if (!decoded) return null;
    
    return Keypair.fromSecretKey(decoded);
  } catch (error) {
    logger.error('Error creating keypair:', error);
    return null;
  }
};

/**
 * Safe PublicKey creator with Base58 validation
 */
export const safePublicKey = (address: string | null | undefined): PublicKey | null => {
  try {
    if (!address) return null;
    
    if (!isValidBase58(address)) {
      return null;
    }
    
    return new PublicKey(address);
  } catch (error) {
    logger.error('Error creating PublicKey:', error);
    return null;
  }
};

// Export types
export type SafeBase58Result<T> = {
  success: boolean;
  data: T | null;
  error?: Error;
};