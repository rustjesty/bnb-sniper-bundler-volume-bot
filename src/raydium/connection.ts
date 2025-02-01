import { Connection } from '@solana/web3.js';

let connectionInstance: Connection | null = null;

export function serverConnection() {
  if (!connectionInstance) {
    connectionInstance = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL!,
      'confirmed'
    );
  }
  return {
    getConnection: () => connectionInstance!
  };
}
