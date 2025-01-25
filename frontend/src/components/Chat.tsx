import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import  SwapInterface  from '@/components/SwapInterface';
import { streamCompletion } from '@/utils/groq';
import { IconArrowRight, IconBolt, IconCoin, IconWallet, IconMicrophone } from './Icon';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

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
  }
];

const ImageComponent = (props: React.ComponentPropsWithoutRef<'img'>) => (
  <div className="my-4">
    <Image 
      src={props.src || ''} 
      alt={props.alt || ''} 
      width={400}
      height={400}
      className="rounded-lg"
    />
  </div>
);

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

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [swapTokens, setSwapTokens] = useState<{from: string; to: string; amount?: number}>();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<any>(null);

  const isInitialState = messages.length === 0;

  const { isConnected, displayAddress } = useWalletStatus();

  const components = {
    img: ImageComponent
  };

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

      recognition.current.onerror = () => setIsListening(false);
      recognition.current.onend = () => setIsListening(false);
    }
  }, []);

  // Auto-scroll messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Parse trade commands
  const parseTradeCommand = (message: string) => {
    const match = message.match(/swap (\d+\.?\d*) (\w+) (?:for|to) (\w+)/i);
    return match ? {
      amount: parseFloat(match[1]),
      fromToken: match[2],
      toToken: match[3]
    } : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Check for trade command
    const tradeCommand = parseTradeCommand(input);
    if (tradeCommand) {
      setSwapModalVisible(true);
      setSwapTokens({
        from: tradeCommand.fromToken,
        to: tradeCommand.toToken,
        amount: tradeCommand.amount
      });
      return;
    }

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      await streamCompletion(
        [...messages, userMessage],
        (chunk) => {
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            
            if (lastMessage?.role === 'assistant') {
              return [
                ...newMessages.slice(0, -1),
                { ...lastMessage, content: lastMessage.content + chunk }
              ];
            }
            return [...newMessages, { role: 'assistant', content: chunk }];
          });
        }
      );
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I encountered an error. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
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
          <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white font-mono">
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
                  <ReactMarkdown components={components} className="prose dark:prose-invert">
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {swapModalVisible && (
        <SwapInterface
          visible={swapModalVisible}
          onClose={() => setSwapModalVisible(false)}
          tokens={[]} // Pass the tokens array here
          onSwap={async () => ''} // Provide a dummy onSwap function
        />
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
            disabled={isLoading || !input.trim()}
            className="absolute right-2 bottom-2 top-2 px-4 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors duration-200"
          >
            <IconArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
