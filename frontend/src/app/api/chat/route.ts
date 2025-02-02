// src/app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { streamCompletion } from '@/utils/groq';
import { Message } from '@/components/chat/types';
import logger from '@/utils/logger';

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    // Validate GROQ API key
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ API key not configured');
    }

    // Return a streaming response
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Process chat completion
    streamCompletion(messages as Message[], async (chunk) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
    }).finally(() => writer.close());

    // Return the stream with appropriate headers
    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}