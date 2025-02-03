import { Tool } from "langchain/tools";
import axios from "axios";

interface TokenPrice {
  id: string;
  mintSymbol: string; 
  vsToken: string;
  vsTokenSymbol: string;
  price: number;
}

interface JupiterPriceResponse {
  data: {
    [key: string]: TokenPrice;
  };
}

const TOKEN_MAP: { [key: string]: string } = {
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'SOL': 'So11111111111111111111111111111111111111112',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  // Add more...
};

function isValidMintAddress(address: string): boolean {
  // Solana addresses are 32-44 characters in base58
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

interface PriceCache {
  price: number;
  timestamp: number;
  symbol: string;
}

enum JupiterPriceError {
  INVALID_MINT = 'INVALID_MINT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  INVALID_PRICE = 'INVALID_PRICE'
}

export class JupiterPriceTool extends Tool {
  name = "jupiter_fetch_price";
  description = `Fetch the price of a given token using Jupiter's price API.
  Inputs:
  - tokenId: string, the mint address of the token, e.g., "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"`;

  private readonly jupiterPriceUrl = "https://price.jup.ag/v4/price";
  private readonly usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana USDC mint
  private priceCache: Map<string, PriceCache> = new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL = 500; // 500ms between requests

  constructor() {
    super();
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => 
        setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = now;
  }

  private validatePrice(price: number, symbol: string): boolean {
    if (isNaN(price) || price <= 0) return false;
    
    // Add reasonable price ranges for known tokens
    const priceRanges: { [key: string]: { min: number, max: number } } = {
      'SOL': { min: 0.01, max: 1000000 },
      'USDC': { min: 0.9, max: 1.1 },
      // Add more...
    };
    
    if (priceRanges[symbol]) {
      const { min, max } = priceRanges[symbol];
      return price >= min && price <= max;
    }
    
    return true;
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>, 
    retries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(fn, retries - 1, delay * 2);
    }
  }

  private async batchPriceFetch(tokenIds: string[], batchSize: number = 10): Promise<any[]> {
    const results = [];
    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize);
      const batchResults = await this.fetchMultiplePrices(batch);
      results.push(...JSON.parse(batchResults).prices);
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL));
    }
    return results;
  }

  async _call(input: string): Promise<string> {
    try {
      await this.checkRateLimit();
      
      let tokenId = input.trim();
      
      // Check if input is a symbol and convert to address
      if (TOKEN_MAP[tokenId.toUpperCase()]) {
        tokenId = TOKEN_MAP[tokenId.toUpperCase()];
      }

      // Validate mint address format
      if (!isValidMintAddress(tokenId)) {
        throw new Error('Invalid token mint address format');
      }

      // Check cache
      const cachedPrice = this.priceCache.get(tokenId);
      if (cachedPrice && (Date.now() - cachedPrice.timestamp) < this.CACHE_DURATION) {
        return JSON.stringify({
          status: "success",
          tokenId: tokenId,
          priceInUSDC: cachedPrice.price,
          symbol: cachedPrice.symbol,
          timestamp: new Date(cachedPrice.timestamp).toISOString()
        });
      }

      // Build request URL with both token and USDC for price in USD
      const url = `${this.jupiterPriceUrl}?ids=${tokenId}&vsToken=${this.usdcMint}`;

      const response = await this.retryWithBackoff(() => axios.get<JupiterPriceResponse>(url));
      
      if (!response.data?.data?.[tokenId]) {
        throw new Error(`No price data found for token: ${tokenId}`);
      }

      const priceData = response.data.data[tokenId];

      if (!this.validatePrice(priceData.price, priceData.mintSymbol)) {
        throw new Error(`Invalid price data for token: ${tokenId}`);
      }

      // Cache the price
      this.priceCache.set(tokenId, {
        price: priceData.price,
        timestamp: Date.now(),
        symbol: priceData.mintSymbol
      });

      return JSON.stringify({
        status: "success",
        tokenId: tokenId,
        priceInUSDC: priceData.price,
        symbol: priceData.mintSymbol,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      if (axios.isAxiosError(error)) {
        return JSON.stringify({
          status: "error",
          message: error.response?.data?.message || error.message,
          code: error.code || JupiterPriceError.NETWORK_ERROR,
        });
      }

      const err = error as Error;
      return JSON.stringify({
        status: "error",
        message: err.message,
        code: JupiterPriceError.INVALID_MINT,
        details: {
          providedAddress: input,
          expectedFormat: "32-44 character base58 string"
        }
      });
    }
  }

  async fetchMultiplePrices(tokenIds: string[]): Promise<string> {
    try {
      const ids = tokenIds.map(id => id.trim()).join(',');
      
      // Validate input
      if (!ids) {
        throw new Error('Invalid token IDs provided');
      }

      // Build request URL with both tokens and USDC for price in USD
      const url = `${this.jupiterPriceUrl}?ids=${ids}&vsToken=${this.usdcMint}`;

      const response = await axios.get<JupiterPriceResponse>(url);
      
      const prices = tokenIds.map(tokenId => {
        const priceData = response.data.data[tokenId];
        if (!priceData) {
          throw new Error(`No price data found for token: ${tokenId}`);
        }
        return {
          tokenId: tokenId,
          priceInUSDC: priceData.price,
          symbol: priceData.mintSymbol,
          timestamp: new Date().toISOString()
        };
      });

      return JSON.stringify({
        status: "success",
        prices: prices
      });

    } catch (error) {
      if (axios.isAxiosError(error)) {
        return JSON.stringify({
          status: "error",
          message: error.response?.data?.message || error.message,
          code: error.code || "NETWORK_ERROR",
        });
      }

      const err = error as Error;
      return JSON.stringify({
        status: "error",
        message: err.message,
        code: "UNKNOWN_ERROR",
      });
    }
  }

  // Helper method to format price with appropriate decimals
  private formatPrice(price: number): string {
    if (price < 0.01) {
      return price.toFixed(6);
    }
    if (price < 1) {
      return price.toFixed(4);
    }
    return price.toFixed(2);
  }

  private validateRequest(tokenId: string, vsToken: string = this.usdcMint): void {
    if (!isValidMintAddress(tokenId)) {
      throw new Error(`Invalid token ID format: ${tokenId}`);
    }
    if (!isValidMintAddress(vsToken)) {
      throw new Error(`Invalid vs token format: ${vsToken}`);
    }
  }
}

// Usage example:
/*
const priceTool = new JupiterPriceTool();
const jupiterTokenId = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

try {
  const priceInfo = await priceTool._call(jupiterTokenId);
  console.log(JSON.parse(priceInfo));
} catch (error) {
  console.error('Error fetching price:', error);
}
*/