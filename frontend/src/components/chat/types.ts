// src/components/chat/types.ts
import { IconProps } from '../Icon';
import { FC } from 'react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  name: string;
  function_call: {
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
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export interface InputAreaProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: (event: React.FormEvent<HTMLFormElement>) => void;
  placeholder?: string;
  input: string;
  setInput: (input: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isStreaming: boolean;
  isListening: boolean;
  toggleListening: () => void;
}

export interface MessageListProps {
  messages: Message[];
  onRetry: (message: Message) => void;
  currentResponse?: string;
  onScroll?: () => void;
  isLoading?: boolean;
  error?: string | null;
}