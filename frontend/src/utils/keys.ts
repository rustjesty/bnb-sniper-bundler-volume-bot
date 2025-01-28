import bs58 from 'bs58';
import logger from './logger';

export const parsePrivateKey = (privateKeyString: string): Uint8Array => {
  try {
    // Check if it's a JSON array
    if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
      const array = JSON.parse(privateKeyString);
      return new Uint8Array(array);
    }

    // Check if it's a base58 string
    try {
      const decoded = bs58.decode(privateKeyString);
      if (decoded.length === 64) {
        return decoded;
      }
    } catch (e) {
      logger.warn('Not a valid base58 string, trying other formats...');
    }

    // Check if it's a comma-separated string
    if (privateKeyString.includes(',')) {
      const array = privateKeyString.split(',').map(num => parseInt(num.trim()));
      return new Uint8Array(array);
    }

    throw new Error('Unsupported private key format');
  } catch (error) {
    logger.error('Error parsing private key:', error);
    throw new Error('Failed to parse private key. Please check the format.');
  }
};
