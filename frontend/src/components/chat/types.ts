// src/components/chat/types.ts
import { IconProps } from '../Icon';
import { FC, ChangeEvent, FormEvent } from 'react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  name: string;  // Made required to match groq.ts
  function_call: {  // Made required to match groq.ts
    name: string;
    arguments: string;
  };
}

export interface SwapDetails {
  from: string;
  to: string;
  amount?: number;
}

export interface ChatError {
  message: string;
  code?: string;
  details?: any;
}

export interface ExamplePrompt {
  title: string;
  prompt: string;
  icon: FC<IconProps>;
}

export interface SwapModalProps {
  isVisible: boolean;
  swapTokens?: SwapDetails;
  onClose: () => void;
}

export interface WelcomeScreenProps {
  examplePrompts: ExamplePrompt[];
  onPromptClick: (prompt: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

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
  isListening: boolean; // Added isListening
  toggleListening: () => void; // Added toggleListening
  value: string; // Added value
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void; // Added onChange
  onSend: (e: FormEvent) => void; // Added onSend
}

export interface MessageListProps {
  messages: Message[];
  currentResponse?: string;
  isStreaming?: boolean;
  onRetry?: (message: Message) => void; // Added onRetry
  onScroll?: () => void; // Add this line
  isLoading?: boolean; // Add this line
  error?: string | null; // Add this line
}