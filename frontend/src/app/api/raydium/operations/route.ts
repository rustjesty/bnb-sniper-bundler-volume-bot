// src/app/api/raydium/[...operation]/route.ts
import { NextRequest } from 'next/server';
import { getServerSideRaydium } from '@/tools/raydium/server-config';
import { operations, Operation } from '@/tools/raydium/operations';

type Props = {
  params: {
    operation: string[]
  }
}

export async function POST(
  request: NextRequest,
  { params }: Props
) {
  try {
    const { connection, owner } = getServerSideRaydium();
    const operationPath = params.operation.join('/') as Operation;
    const operation = operations[operationPath];
    
    if (!operation) {
      return Response.json(
        { error: 'Operation not found' }, 
        { status: 404 }
      );
    }

    const body = await request.json();
    const result = await operation();
    
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}