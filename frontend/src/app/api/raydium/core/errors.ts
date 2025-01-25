

export const ERRORS = {
  CODES: {
    INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
    POOL_NOT_FOUND: 'POOL_NOT_FOUND',
    INVALID_MINT: 'INVALID_MINT',
    SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED',
    TRANSACTION_FAILED: 'TRANSACTION_FAILED'
  },
  MESSAGES: {
    INSUFFICIENT_FUNDS: 'Insufficient funds for transaction',
    POOL_NOT_FOUND: 'Pool not found',
    INVALID_MINT: 'Invalid mint address',
    SLIPPAGE_EXCEEDED: 'Price impact exceeds slippage tolerance',
    TRANSACTION_FAILED: 'Transaction failed'
  }
} as const;