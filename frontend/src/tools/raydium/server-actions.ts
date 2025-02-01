'use server';

//import { getServerSideRaydium } from './server-config';
import { operations, Operation } from './operations';

export type OperationResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function performRaydiumOperation( 
  operationPath: string, 
  params?: Record<string, any>
): Promise<OperationResult> {
  try {
    const { connection, owner } = getServerSideRaydium();
    const operation = operations[operationPath as Operation];

    if (!operation) {
      return {
        success: false,
        error: 'Operation not found'
      };
    }

    const result = await operation();
    return {
      success: true,
      data: result
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
function getServerSideRaydium(): { connection: any; owner: any; } {
  throw new Error('Function not implemented.');
}

