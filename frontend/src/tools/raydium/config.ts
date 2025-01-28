import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'

// Define types for environment validation
interface EnvironmentConfig {
  privateKey: string;
  rpcUrl: string;
  network: 'mainnet' | 'devnet';
}

// Add this utility function
const parsePrivateKey = (privateKeyString: string): Uint8Array => {
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
      console.log('Not a valid base58 string, trying other formats...');
    }

    // Check if it's a comma-separated string
    if (privateKeyString.includes(',')) {
      const array = privateKeyString.split(',').map(num => parseInt(num.trim()));
      return new Uint8Array(array);
    }

    throw new Error('Unsupported private key format');
  } catch (error) {
    console.error('Error parsing private key:', error);
    throw new Error('Failed to parse private key. Please check the format.');
  }
};

// Environment variable validation with middleware compatibility
export const validateEnvironment = async (request?: Request): Promise<EnvironmentConfig> => {
  // Debug logging
  console.log('Environment validation starting:', {
    hasPrivateKey: !!process.env.SOLANA_PRIVATE_KEY,
    hasRpcUrl: !!process.env.NEXT_PUBLIC_RPC_URL,
    envKeys: Object.keys(process.env)
  });

  // Get environment variables
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  const network = (process.env.SOLANA_NETWORK || 'mainnet') as 'mainnet' | 'devnet';

  // Enhanced error checking with detailed messages
  if (!privateKey) {
    console.error('Private key missing. Available env vars:', Object.keys(process.env));
    throw new Error("No private key found in environment variables");
  }

  if (!rpcUrl) {
    console.error('RPC URL missing. Available env vars:', Object.keys(process.env));
    throw new Error("No RPC URL found in environment variables");
  }

  // Log successful validation
  console.log('Environment validation successful:', {
    hasPrivateKey: true,
    hasRpcUrl: true,
    network
  });

  return { privateKey, rpcUrl, network };
};

// Add RPC connection pool
const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  process.env.NEXT_PUBLIC_FALLBACK_RPC_URL,
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com'
].filter(Boolean) as string[];

class ConnectionPool {
  private connections: Connection[] = [];
  private currentIndex = 0;

  constructor() {
    this.connections = RPC_ENDPOINTS.map(endpoint => 
      new Connection(endpoint, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: false,
        confirmTransactionInitialTimeout: 60000
      })
    );
  }

  getConnection(): Connection {
    const connection = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return connection;
  }
}

const connectionPool = new ConnectionPool();

// Add exponential backoff retry logic
async function withRetry<T>(
  fn: () => Promise<T>, 
  retries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === retries - 1) throw error;
      if (error?.message?.includes('429')) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries reached');
}

// Initialize connection with enhanced error handling
export const initializeConnection = async (request?: Request) => {
  try {
    const { privateKey, rpcUrl, network } = await validateEnvironment(request);

    // Get connection from pool
    const connection = connectionPool.getConnection();

    // Test connection with retry
    await withRetry(async () => {
      await connection.getRecentBlockhash();
    });

    // Create keypair
    let secretKey: Uint8Array;
    try {
      secretKey = parsePrivateKey(privateKey);
      if (secretKey.length !== 64) {
        throw new Error(`Invalid secret key length: ${secretKey.length}`);
      }
    } catch (error) {
      console.error('Private key parsing error:', error);
      throw new Error('Failed to parse private key. Check the format and try again.');
    }

    const owner = Keypair.fromSecretKey(secretKey);

    // Test wallet with retry
    await withRetry(async () => {
      await connection.getBalance(owner.publicKey);
    });

    // Log successful initialization
    console.log('Connection initialized successfully:', {
      publicKey: owner.publicKey.toString(),
      network,
      rpcEndpoint: connection.rpcEndpoint
    });

    return { connection, owner, network };
  } catch (error: any) {
    console.error('Connection initialization error:', error);
    
    // Convert error to a more informative format
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown connection error';
      
    throw new Error(`Raydium initialization failed: ${errorMessage}`);
  }
};

// Initialize with error handling
const { connection, owner, network } = await initializeConnection();

// Export constants
export const txVersion = TxVersion.V0;
const cluster = network === 'devnet' ? 'devnet' : 'mainnet';

// Raydium SDK initialization with retries
let raydium: Raydium | undefined;
export const initSdk = async (params?: { loadToken?: boolean }, retries = 3): Promise<Raydium> => {
  if (raydium) return raydium;

  for (let i = 0; i < retries; i++) {
    try {
      if (connection.rpcEndpoint === clusterApiUrl('mainnet-beta')) {
        console.warn('Using free RPC node might cause unexpected errors. Consider using a paid RPC node.');
      }
      
      console.log(`Connecting to RPC ${connection.rpcEndpoint} in ${cluster}`);
      
      raydium = await Raydium.load({
        owner,
        connection,
        cluster,
        disableFeatureCheck: true,
        disableLoadToken: !params?.loadToken,
        blockhashCommitment: 'finalized',
      });

      // Initialize token account data
      const tokenAccountData = await fetchTokenAccountData();
      raydium.account.updateTokenAccount(tokenAccountData);

      // Set up account change listener
      connection.onAccountChange(owner.publicKey, async () => {
        if (raydium) {
          const updatedData = await fetchTokenAccountData();
          raydium.account.updateTokenAccount(updatedData);
        }
      });

      return raydium;
      
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }

  throw new Error('Failed to initialize Raydium SDK after retries');
};

// Token account data fetching with error handling
export const fetchTokenAccountData = async () => {
  try {
    const solAccountResp = await connection.getAccountInfo(owner.publicKey);
    const tokenAccountResp = await connection.getTokenAccountsByOwner(
      owner.publicKey, 
      { programId: TOKEN_PROGRAM_ID }
    );
    const token2022Req = await connection.getTokenAccountsByOwner(
      owner.publicKey, 
      { programId: TOKEN_2022_PROGRAM_ID }
    );

    return parseTokenAccountResp({
      owner: owner.publicKey,
      solAccountResp,
      tokenAccountResp: {
        context: tokenAccountResp.context,
        value: [...tokenAccountResp.value, ...token2022Req.value],
      },
    });
  } catch (error) {
    console.error('Error fetching token account data:', error);
    throw error;
  }
};

// Export essential objects
export {
  connection,
  owner
};