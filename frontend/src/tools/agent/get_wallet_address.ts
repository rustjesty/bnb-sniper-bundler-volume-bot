import { SolanaAgentKit } from "solana-agent-kit";
import { PublicKey } from "@solana/web3.js";

/**
 * Get the agent's wallet public address
 * @param agent - SolanaAgentKit instance 
 * @returns Promise<string> The base58 encoded public key
 * @throws Error if wallet not initialized
 */
export async function get_wallet_address(agent: SolanaAgentKit): Promise<string> {
  try {
    // Ensure agent is initialized
    if (!agent || !agent.wallet_address) {
      throw new Error("Agent wallet not initialized");
    }

    // Verify it's a valid public key
    const pubkey = new PublicKey(agent.wallet_address);
    
    // Return base58 encoded address
    return pubkey.toBase58();
  } catch (error: any) {
    throw new Error(`Failed to get wallet address: ${error.message}`);
  }
}