// src/app/api/raydium/cache/utils.ts
import { BasicPoolInfo } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';

// Define serialized pool info type
interface SerializedPoolInfo {
  id: string;
  version: number;
  mintA: string;
  mintB: string;
}

// Define cache structure
interface PoolCache {
  time: number;
  ammPools: SerializedPoolInfo[];
  clmmPools: SerializedPoolInfo[];
  cpmmPools: SerializedPoolInfo[];
}

class PoolMemoryCache {
  private static instance: PoolMemoryCache;
  private cache: PoolCache = {
    time: 0,
    ammPools: [],
    clmmPools: [],
    cpmmPools: [],
  };

  private constructor() {}

  public static getInstance(): PoolMemoryCache {
    if (!PoolMemoryCache.instance) {
      PoolMemoryCache.instance = new PoolMemoryCache();
    }
    return PoolMemoryCache.instance;
  }

  private convertToBasicPoolInfo(serialized: SerializedPoolInfo): BasicPoolInfo {
    return {
      ...serialized,
      id: new PublicKey(serialized.id),
      mintA: new PublicKey(serialized.mintA),
      mintB: new PublicKey(serialized.mintB),
    } as BasicPoolInfo;
  }

  private serializePoolInfo(pool: BasicPoolInfo): SerializedPoolInfo {
    return {
      id: pool.id.toBase58(),
      version: pool.version,
      mintA: pool.mintA.toBase58(),
      mintB: pool.mintB.toBase58(),
    };
  }

  public readCachePoolData(cacheTime: number = 1000 * 60 * 10) {
    console.log('Reading cache pool data');
    
    if (Date.now() - this.cache.time > cacheTime) {
      console.log('Cache data expired');
      return {
        ammPools: [] as BasicPoolInfo[],
        clmmPools: [] as BasicPoolInfo[],
        cpmmPools: [] as BasicPoolInfo[],
      };
    }

    return {
      ammPools: this.cache.ammPools.map(this.convertToBasicPoolInfo),
      clmmPools: this.cache.clmmPools.map(this.convertToBasicPoolInfo),
      cpmmPools: this.cache.cpmmPools.map(this.convertToBasicPoolInfo),
    };
  }

  public writeCachePoolData(data: {
    ammPools: BasicPoolInfo[];
    clmmPools: BasicPoolInfo[];
    cpmmPools: BasicPoolInfo[];
  }) {
    console.log('Caching all pool basic info...');

    try {
      this.cache = {
        time: Date.now(),
        ammPools: data.ammPools.map(this.serializePoolInfo),
        clmmPools: data.clmmPools.map(this.serializePoolInfo),
        cpmmPools: data.cpmmPools.map(this.serializePoolInfo),
      };

      console.log('Cache pool data success');
    } catch (error) {
      console.error('Cache pool data failed:', error);
    }
  }

  public clearCache() {
    this.cache = {
      time: 0,
      ammPools: [],
      clmmPools: [],
      cpmmPools: [],
    };
  }
}

// Export functions that match the original API
export const readCachePoolData = (cacheTime?: number) => {
  return PoolMemoryCache.getInstance().readCachePoolData(cacheTime);
};

export const writeCachePoolData = (data: {
  ammPools: BasicPoolInfo[];
  clmmPools: BasicPoolInfo[];
  cpmmPools: BasicPoolInfo[];
}) => {
  return PoolMemoryCache.getInstance().writeCachePoolData(data);
};

// Export the class if needed
export { PoolMemoryCache };