import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

import { Decimal } from 'decimal.js';
import { DEFAULTS } from '../core/constants';
import { ERRORS } from '../core/errors';
import { RaydiumStateManager } from '../core/state';

export interface QuoteParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: BN;
  slippage?: number;
  maxHops?: number;
}

export interface QuoteResult {
  inputAmount: BN;
  outputAmount: BN;
  route: QuoteRoute[];
  priceImpact: number;
  fee: number;
}

export interface QuoteRoute {
  poolId: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: BN;
  outputAmount: BN;
  fee: number;
}

export class RaydiumQuoteService {
  private stateManager: RaydiumStateManager;

  constructor(private connection: Connection) {
    this.stateManager = RaydiumStateManager.getInstance();
  }

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    await this.stateManager.loadState(this.connection);
    const slippage = params.slippage || DEFAULTS.SLIPPAGE;
    const maxHops = params.maxHops || 1;

    const routes = await this.findBestRoutes(params, maxHops);
    if (routes.length === 0) {
      throw new Error(ERRORS.MESSAGES.POOL_NOT_FOUND);
    }

    const bestRoute = routes[0];
    const priceImpact = this.calculatePriceImpact(bestRoute);

    if (priceImpact > slippage) {
      throw new Error(ERRORS.MESSAGES.SLIPPAGE_EXCEEDED);
    }

    return {
      inputAmount: params.amount,
      outputAmount: this.calculateOutputAmount(bestRoute),
      route: bestRoute,
      priceImpact,
      fee: this.calculateTotalFees(bestRoute)
    };
  }

  private async findBestRoutes(
    params: QuoteParams,
    maxHops: number
  ): Promise<QuoteRoute[][]> {
    const directRoutes = await this.getDirectRoutes(params);
    if (maxHops === 1) return directRoutes;

    const multiHopRoutes = await this.getMultiHopRoutes(params, maxHops);
    return [...directRoutes, ...multiHopRoutes].sort(
      (a, b) => this.calculateOutputAmount(b).toNumber() - this.calculateOutputAmount(a).toNumber()
    );
  }

  private async getDirectRoutes(params: QuoteParams): Promise<QuoteRoute[][]> {
    const pools = this.stateManager.getActivePoolsByToken(params.inputMint)
      .filter(pool => 
        pool.baseVault.equals(params.outputMint) || 
        pool.quoteVault.equals(params.outputMint)
      );

    return pools.map(pool => {
      const isBaseInput = pool.baseVault.equals(params.inputMint);
      const inputAmount = params.amount;
      const outputAmount = this.computeOutputAmount(pool, inputAmount, isBaseInput);

      return [{
        poolId: pool.publicKey,
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        inputAmount,
        outputAmount,
        fee: pool.tradeFeeRate || DEFAULTS.SLIPPAGE
      }];
    });
  }

  private async getMultiHopRoutes(
    params: QuoteParams,
    maxHops: number
  ): Promise<QuoteRoute[][]> {
    const routes: QuoteRoute[][] = [];
    const seen = new Set<string>();

    const findRoutes = async (
      currentMint: PublicKey,
      currentAmount: BN,
      path: QuoteRoute[],
      depth: number
    ) => {
      if (depth >= maxHops) return;

      const pools = this.stateManager.getActivePoolsByToken(currentMint);
      for (const pool of pools) {
        const outputMint = pool.baseVault.equals(currentMint) 
          ? pool.quoteVault 
          : pool.baseVault;

        const routeKey = `${currentMint.toBase58()}-${outputMint.toBase58()}`;
        if (seen.has(routeKey)) continue;
        seen.add(routeKey);

        const isBaseInput = pool.baseVault.equals(currentMint);
        const outputAmount = this.computeOutputAmount(pool, currentAmount, isBaseInput);

        const route: QuoteRoute = {
          poolId: pool.publicKey,
          inputMint: currentMint,
          outputMint,
          inputAmount: currentAmount,
          outputAmount,
          fee: pool.tradeFeeRate || DEFAULTS.SLIPPAGE
        };

        if (outputMint.equals(params.outputMint)) {
          routes.push([...path, route]);
        } else {
          await findRoutes(outputMint, outputAmount, [...path, route], depth + 1);
        }

        seen.delete(routeKey);
      }
    };

    await findRoutes(params.inputMint, params.amount, [], 0);
    return routes;
  }

  private computeOutputAmount(pool: any, inputAmount: BN, isBaseInput: boolean): BN {
    const inputAmountDecimal = new Decimal(inputAmount.toString());
    const baseAmountDecimal = new Decimal(pool.baseAmount.toString());
    const quoteAmountDecimal = new Decimal(pool.quoteAmount.toString());
    const k = baseAmountDecimal.mul(quoteAmountDecimal);

    if (isBaseInput) {
      const newBaseAmount = baseAmountDecimal.add(inputAmountDecimal);
      const newQuoteAmount = k.div(newBaseAmount);
      const outputAmount = quoteAmountDecimal.sub(newQuoteAmount);
      return new BN(outputAmount.floor().toString());
    } else {
      const newQuoteAmount = quoteAmountDecimal.add(inputAmountDecimal);
      const newBaseAmount = k.div(newQuoteAmount);
      const outputAmount = baseAmountDecimal.sub(newBaseAmount);
      return new BN(outputAmount.floor().toString());
    }
  }

  private calculateOutputAmount(route: QuoteRoute[]): BN {
    return route[route.length - 1].outputAmount;
  }

  private calculatePriceImpact(route: QuoteRoute[]): number {
    return route.reduce((total, hop) => {
      const inputValue = new Decimal(hop.inputAmount.toString());
      const outputValue = new Decimal(hop.outputAmount.toString());
      return total + outputValue.div(inputValue).sub(1).abs().toNumber() * 100;
    }, 0);
  }

  private calculateTotalFees(route: QuoteRoute[]): number {
    return route.reduce((total, hop) => total + hop.fee, 0);
  }
}

export const createQuoteService = (connection: Connection) => new RaydiumQuoteService(connection);