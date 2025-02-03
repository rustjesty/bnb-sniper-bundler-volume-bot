// src/types/chat.ts
import { IconProps } from '@/components/Icon';
import { FC, ChangeEvent, FormEvent } from 'react';

// Core message type
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

// Add SwapDetails interface
export interface SwapDetails {
  outputMint: string;
  inputAmount: number;
  inputMint: string;
  inputDecimal: number;
}

// UI component props
export interface ChatProps {
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  isStreaming: boolean;
}

export interface InputAreaProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isStreaming: boolean;
  isListening: boolean;
  toggleListening: () => void;
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: (e: FormEvent) => void;
}

export interface MessageListProps {
  messages: Message[];
  currentResponse?: string;
  isStreaming?: boolean;
  onRetry?: (message: Message) => void;
  onScroll?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export interface ExamplePrompt {
  title: string;
  prompt: string;
  icon: FC<IconProps>;
}

export interface WelcomeScreenProps {
  examplePrompts: ExamplePrompt[];
  onPromptClick: (prompt: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

// Error handling
export interface ChatError {
  message: string;
  code?: string;
  details?: any;
}