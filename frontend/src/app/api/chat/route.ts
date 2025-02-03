// src/app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { streamCompletion } from '@/utils/groq';

import logger from '@/utils/logger';

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    // Validate API key
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
    if (!apiKey) {
      logger.error('GROQ API key not configured');
      return NextResponse.json(
        { error: 'Service configuration error' },
        { status: 500 }
      );
    }

    // Create streaming response
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Process chat completion with error handling
    streamCompletion(
      messages,
      async (chunk) => {
        try {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`)
          );
        } catch (writeError) {
          logger.error('Stream write error:', writeError);
        }
      }
    ).catch((error) => {
      logger.error('Stream completion error:', error);
    }).finally(() => {
      writer.close().catch((error) => {
        logger.error('Stream close error:', error);
      });
    });

    // Return stream with appropriate headers
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