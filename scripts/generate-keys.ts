// scripts/generate-keys.ts
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const generateKeys = () => {
  // Generate new keypair
  const keypair = Keypair.generate();
  
  // Get different formats
  const base58Key = bs58.encode(keypair.secretKey);
  const arrayKey = Array.from(keypair.secretKey);
  
  console.log('Public Key:', keypair.publicKey.toString());
  console.log('\nPrivate Key Formats:');
  console.log('Base58:', base58Key);
  console.log('Array:', JSON.stringify(arrayKey));
  
  return {
    publicKey: keypair.publicKey.toString(),
    privateKey: {
      base58: base58Key,
      array: arrayKey
    }
  };
};

// Run if called directly
if (require.main === module) {
  generateKeys();
}

export { generateKeys };