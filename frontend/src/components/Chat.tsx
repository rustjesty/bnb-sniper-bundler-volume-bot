'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { streamCompletion, Message } from '@/utils/groq';
import { IconArrowRight, IconBolt, IconCoin, IconWallet, IconMicrophone, IconChart, IconSwap, IconHistory } from './Icon';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const EXAMPLE_PROMPTS = [
  {
    title: "Check SOL Price",
    prompt: "What's the current price of Solana?",
    icon: <IconBolt className="w-6 h-6" />
  },
  {
    title: "View JENNA Token",
    prompt: "Show me info about the JENNA token",
    icon: <IconCoin className="w-6 h-6" />
  },
  {
    title: "Analyze Wallet",
    prompt: "Analyze trading performance for a wallet",
    icon: <IconWallet className="w-6 h-6" />
  },
  {
    title: "Market Analysis",
    prompt: "Analyze market trends for top Solana tokens",
    icon: <IconChart className="w-6 h-6" />
  },
  {
    title: "Token Swap",
    prompt: "How to swap SOL for USDC?",
    icon: <IconSwap className="w-6 h-6" />
  },
  {
    title: "Transaction History",
    prompt: "Show my recent transactions",
    icon: <IconHistory className="w-6 h-6" />
  }
];

const ImageComponent = ({ src, alt }: { src: string; alt: string }) => (
  <div className="my-4">
    <Image 
      src={src}
      alt={alt}
      width={400 as const}
      height={400 as const}
      className="rounded-lg"
    />
  </div>
);

interface SwapDetails {
  from: string;
  to: string;
  amount?: number;
}

interface ChatError {
  message: string;
  code?: string;
  details?: any;
}

function useWalletStatus() {
  const { connected, publicKey } = useWallet();
  return {
    isConnected: connected,
    address: publicKey?.toBase58(),
    displayAddress: publicKey ? 
      `${publicKey.toBase58().slice(0,4)}...${publicKey.toBase58().slice(-4)}` : 
      null
  };
}

export interface ChatProps {
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  isStreaming: boolean;
}

const Chat: React.FC<ChatProps> = ({ messages, onSendMessage, isStreaming }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [swapTokens, setSwapTokens] = useState<SwapDetails>();
  const [error, setError] = useState<ChatError | null>(null);
  const [currentResponse, setCurrentResponse] = useState<string>('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<any>(null);

  const isInitialState = messages.length === 0;
  const { isConnected, displayAddress } = useWalletStatus();

  // Auto-scroll messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = false;
      recognition.current.interimResults = false;
      recognition.current.lang = 'en-US';

      recognition.current.onresult = (event: any) => {
        setInput(event.results[0][0].transcript);
      };

      recognition.current.onerror = (event: any) => {
        setError({
          message: `Speech recognition error: ${event.error}`,
          code: 'SPEECH_ERROR'
        });
        setIsListening(false);
      };

      recognition.current.onend = () => setIsListening(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    try {
      const tradeCommand = parseTradeCommand(input);
      if (tradeCommand) {
        setSwapModalVisible(true);
        setSwapTokens(tradeCommand);
        return;
      }

      const userMessage: Message = {
        role: 'user', content: input.trim(),
        name: undefined,
        function_call: undefined
      };
      const allMessages = [...messages, userMessage];
      
      setCurrentResponse('');
      await streamCompletion(allMessages, (chunk) => {
        setCurrentResponse(prev => prev + chunk);
      });

      setInput('');
      setError(null);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Failed to send message',
        code: 'SEND_ERROR',
        details: err
      });
    }
  };

  const parseTradeCommand = (message: string): SwapDetails | null => {
    const match = message.match(/swap (\d+\.?\d*) (\w+) (?:for|to) (\w+)/i);
    if (!match) return null;

    const amount = parseFloat(match[1]);
    if (isNaN(amount) || amount <= 0) return null;

    return {
      amount,
      from: match[2].toUpperCase(),
      to: match[3].toUpperCase()
    };
  };

  const toggleListening = () => {
    if (isListening) {
      recognition.current?.stop();
    } else {
      recognition.current?.start();
      setIsListening(true);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex-0 border-b dark:border-gray-800 p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-mono">
            JENNA AI Assistant
          </h1>
          {isConnected && (
            <div className="text-sm text-gray-900 dark:text-white">
              Connected: {displayAddress}
            </div>
          )}
        </div>
      </div>

      <div className={`flex-1 ${isInitialState ? 'flex items-center justify-center' : 'overflow-y-auto'} p-4`}>
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
            {error.message}
          </div>
        )}

        {isInitialState ? (
          <div className="w-full max-w-2xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-8 text-gray-800 dark:text-gray-200">
              JENNA - Solana Trading Assistant
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {EXAMPLE_PROMPTS.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setInput(prompt.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="flex items-center p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200 dark:border-gray-700"
                >
                  <div className="mr-3 text-purple-500">{prompt.icon}</div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{prompt.title}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{prompt.prompt}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-3xl mx-auto space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white dark:bg-gray-800 dark:text-white shadow-md'
                  }`}
                >
                  <ReactMarkdown 
                    components={{
                      img: ImageComponent as any,
                    }}
                    className="prose dark:prose-invert"
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
            {currentResponse && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg p-4 bg-white dark:bg-gray-800 dark:text-white shadow-md">
                  <ReactMarkdown
                    components={{
                      img: ImageComponent as any,
                    }}
                    className="prose dark:prose-invert"
                  >
                    {currentResponse}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {swapModalVisible && swapTokens && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Swap Tokens</h2>
            <p>From: {swapTokens.from}</p>
            <p>To: {swapTokens.to}</p>
            <p>Amount: {swapTokens.amount}</p>
            <button
              onClick={() => setSwapModalVisible(false)}
              className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex-0 p-4 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <form 
          onSubmit={handleSubmit}
          className="w-full max-w-3xl mx-auto relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask JENNA anything about Solana trading..."
            className="w-full p-4 pr-24 bg-transparent resize-none outline-none dark:text-white font-mono"
            rows={1}
            style={{ maxHeight: '200px' }}
          />
          <button
            type="button"
            onClick={toggleListening}
            className={`absolute right-14 bottom-2 top-2 px-4 ${
              isListening ? 'text-red-500' : 'text-gray-500'
            } hover:text-gray-700 transition-colors duration-200`}
          >
            <IconMicrophone className="w-5 h-5" />
          </button>
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="absolute right-2 bottom-2 top-2 px-4 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors duration-200"
          >
            <IconArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default Chat;