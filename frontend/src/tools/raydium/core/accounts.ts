import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { RAYDIUM_PROGRAMS } from './constants';

export class RaydiumAccounts {
  private static instance: RaydiumAccounts;
  private memcmp = { offset: 0, bytes: '' };

  private constructor() {}

  static getInstance(): RaydiumAccounts {
    if (!RaydiumAccounts.instance) {
      RaydiumAccounts.instance = new RaydiumAccounts();
    }
    return RaydiumAccounts.instance;
  }

  async getAllPoolAccounts(connection: Connection) {
    const [ammv4Pools, clmmPools, cpmmPools] = await Promise.all([
      this.getAmmV4Pools(connection),
      this.getClmmPools(connection),
      this.getCpmmPools(connection)
    ]);

    return [...ammv4Pools, ...clmmPools, ...cpmmPools];
  }

  async getAllPositionAccounts(connection: Connection) {
    return await connection.getProgramAccounts(
      RAYDIUM_PROGRAMS.CLMM,
      {
        filters: [
          { dataSize: 340 }, // Position account size
          { memcmp: { offset: 0, bytes: 'position' } }
        ]
      }
    );
  }

  async getAllFarmAccounts(connection: Connection) {
    return await connection.getProgramAccounts(
      RAYDIUM_PROGRAMS.AMM_V4,
      {
        filters: [
          { dataSize: 280 }, // Farm account size
          { memcmp: { offset: 0, bytes: 'farm' } }
        ]
      }
    );
  }

  private async getAmmV4Pools(connection: Connection) {
    return await connection.getProgramAccounts(
      RAYDIUM_PROGRAMS.AMM_V4,
      {
        filters: [
          { dataSize: 752 }, // AMM v4 pool size
          { memcmp: { offset: 0, bytes: 'amm_v4' } }
        ]
      }
    );
  }

  private async getClmmPools(connection: Connection) {
    return await connection.getProgramAccounts(
      RAYDIUM_PROGRAMS.CLMM,
      {
        filters: [
          { dataSize: 872 }, // CLMM pool size
          { memcmp: { offset: 0, bytes: 'pool' } }
        ]
      }
    );
  }

  private async getCpmmPools(connection: Connection) {
    return await connection.getProgramAccounts(
      RAYDIUM_PROGRAMS.CPMM,
      {
        filters: [
          { dataSize: 680 }, // CPMM pool size
          { memcmp: { offset: 0, bytes: 'pool_seed' } }
        ]
      }
    );
  }

  async getPoolByAddress(connection: Connection, address: PublicKey) {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) return null;
    
    return {
      publicKey: address,
      account: accountInfo
    };
  }

  async getPositionByAddress(connection: Connection, address: PublicKey) {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) return null;

    return {
      publicKey: address,
      account: accountInfo
    };
  }

  async getFarmByAddress(connection: Connection, address: PublicKey) {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) return null;

    return {
      publicKey: address,
      account: accountInfo
    };
  }

  async getTokenAccountsByOwner(connection: Connection, owner: PublicKey) {
    const accounts = await connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );

    return accounts.value.map(account => ({
      publicKey: account.pubkey,
      mint: new PublicKey(account.account.data.parsed.info.mint),
      amount: account.account.data.parsed.info.tokenAmount.amount,
      decimals: account.account.data.parsed.info.tokenAmount.decimals
    }));
  }

  async getMultipleAccounts(connection: Connection, publicKeys: PublicKey[]) {
    const accounts = await connection.getMultipleAccountsInfo(publicKeys);
    return accounts.map((account, index) => 
      account ? {
        publicKey: publicKeys[index],
        account
      } : null
    ).filter((a): a is { publicKey: PublicKey; account: AccountInfo<Buffer> } => a !== null);
  }
}

export const raydiumAccounts = RaydiumAccounts.getInstance();