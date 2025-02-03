import Groq from "groq-sdk";


// src/utils/messageManager.ts
interface Message {
  role: 'user' | 'assistant' | 'function' | 'system'; // Add 'system' role
  content: string;
  name: string; // Make name a required property
  tool_call_id?: {
    name: string;
    arguments: string;
  };
  timestamp: number; // Add timestamp to Message interface
}

interface MessageCache {
  messages: Message[];
  timestamp: number;
  tokenCount: number;
}

export class MessageManager {
  private messages: Message[] = [];
  private readonly maxMessages = 50;
  private readonly maxTokens = 4000; // Buffer for 5000 limit
  private readonly expiryTime = 30 * 60 * 1000; // 30 minutes

  // Add new message with cleanup
  addMessage(message: Message): void {
    this.messages.push(message);
    this.cleanup();
  }

  // Add method to clear messages
  clearMessages(): void {
    this.messages = [];
  }

  // Clean up old messages
  private cleanup(): void {
    // Remove old messages if over max count
    if (this.messages.length > this.maxMessages) {
      const systemMessages = this.messages.filter(m => m.role === 'system');
      const recentMessages = this.messages.slice(-this.maxMessages + systemMessages.length);
      this.messages = [...systemMessages, ...recentMessages];
    }

    // Remove messages if over token limit
    let tokenCount = 0;
    const now = Date.now();
    this.messages = this.messages.filter(msg => {
      tokenCount += this.estimateTokens(msg.content);
      const isRecent = (now - msg.timestamp) < this.expiryTime;
      return tokenCount <= this.maxTokens && isRecent;
    });
  }

  // Estimate token count
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough estimate
  }

  // Get formatted messages for API
  getMessages(): Message[] {
    return this.messages;
  }
}

// src/utils/retryHandler.ts
interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export class RetryHandler {
  constructor(private options: RetryOptions) {}

  async execute<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> {
    let lastError: Error | undefined; // Initialize lastError to undefined
    let attempt = 0;

    while (attempt < this.options.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt === this.options.maxRetries) break;

        const delay = Math.min(
          this.options.baseDelay * Math.pow(2, attempt),
          this.options.maxDelay
        );

        if (onRetry) onRetry(attempt, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Max retries (${this.options.maxRetries}) reached: ${lastError?.message}`);
  }
}

// src/utils/groq.ts
export class GroqService {
  private messageManager: MessageManager;
  private retryHandler: RetryHandler;

  constructor() {
    this.messageManager = new MessageManager();
    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });
  }

  async streamCompletion(
    newMessages: Message[],
    onChunk: (chunk: string) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    // Add new messages
    newMessages.forEach(msg => this.messageManager.addMessage(msg));

    try {
      await this.retryHandler.execute(
        async () => {
          const stream = await this.createCompletionStream(
            this.messageManager.getMessages()
          );

          for await (const chunk of stream) {
            if (chunk.choices[0]?.delta?.content) {
              onChunk(chunk.choices[0].delta.content);
            }
          }
        },
        (attempt, error) => {
          if (onError) {
            onError(new Error(`Retry attempt ${attempt}: ${error.message}`));
          }
        }
      );
    } catch (error) {
      const finalError = error as Error;
      if (onError) {
        onError(new Error(`Final error: ${finalError.message}`));
      }
      throw finalError;
    }
  }

  private async createCompletionStream(messages: Message[]) {
    const groq = new Groq({
      apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY!,
      dangerouslyAllowBrowser: true
    });

    return await groq.chat.completions.create({
      model: 'mixtral-8x7b-32768',
      messages, // Add the missing messages property
      stream: true,
      temperature: 0.7,
      max_tokens: 1000
    });
  }
}