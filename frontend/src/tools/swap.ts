import { createJupiterApiClient } from '@jup-ag/api';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const jupiterQuoteApi = createJupiterApiClient();
const connection = new Connection(process.env.NEXT_PUBLIC_RPC_URL!, {
  commitment: 'confirmed'
});

export const swapTool = tool(
  async ({ outputMint, inputAmount, inputMint, inputDecimal }) => {
    try {
      const inputAmountWithDecimals = inputAmount * 10 ** inputDecimal;

      const quoteResponse = await jupiterQuoteApi.quoteGet({
        inputMint,
        outputMint, 
        amount: inputAmountWithDecimals,
        slippageBps: 50
      });

      if (!quoteResponse) {
        throw new Error('Unable to fetch quote');
      }

      const swapResponse = await jupiterQuoteApi.swapPost({
        swapRequest: {
          quoteResponse,
          userPublicKey: new PublicKey(inputMint).toString(),
          dynamicComputeUnitLimit: true,
          dynamicSlippage: {
            maxBps: 300
          },
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: 10000000,
              priorityLevel: "high"
            }
          },
          correctLastValidBlockHeight: true
        }
      });

      const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      const simulationResult = await connection.simulateTransaction(transaction, {
        replaceRecentBlockhash: true,
        commitment: 'processed'
      });

      if (simulationResult.value.err) {
        throw new Error(`Simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
      }

      return {
        transaction: transaction.serialize().toString(),
        blockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: swapResponse.lastValidBlockHeight,
        prioritizationFeeLamports: swapResponse.prioritizationFeeLamports
      };

    } catch (error) {
      console.error('Swap error:', error);
      return "error";
    }
  },
  {
    name: "swap",
    description: "Swap tokens using Jupiter exchange V6 API",
    schema: z.object({
      outputMint: z.string().describe("Destination token mint address"),
      inputAmount: z.number().describe("Input amount without decimals"),
      inputMint: z.string().describe("Origin token mint address"),
      inputDecimal: z.number().describe("Input token decimals")
    }),
  },
);