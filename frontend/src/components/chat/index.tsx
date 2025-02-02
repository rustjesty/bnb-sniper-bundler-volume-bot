import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { streamCompletion } from '@/utils/groq';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { WelcomeScreen } from './WelcomeScreen';

import { EXAMPLE_PROMPTS } from './constants';
import { Message, SwapDetails, ChatError, MessageListProps } from './types';
import { SwapModal } from '../SwapModal';


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

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [swapTokens, setSwapTokens] = useState<SwapDetails>();
  const [error, setError] = useState<ChatError | null>(null);
  const [currentResponse, setCurrentResponse] = useState<string>('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null!);
  const recognition = useRef<any>(null);

  const isInitialState = messages.length === 0;
  const { isConnected, displayAddress } = useWalletStatus();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
      setIsStreaming(true);
      const tradeCommand = parseTradeCommand(input);
      if (tradeCommand) {
        setSwapModalVisible(true);
        setSwapTokens(tradeCommand);
        return;
      }

      const userMessage: Message = {
        role: 'user',
        content: input.trim(),
        name: 'user',
        function_call: {
          name: '',
          arguments: ''
        }
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setCurrentResponse('');
      
      await streamCompletion([...messages, userMessage], (chunk) => {
        setCurrentResponse(prev => prev + chunk);
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: currentResponse,
        name: 'assistant',
        function_call: {
          name: '',
          arguments: ''
        }
      }]);
      
      setCurrentResponse('');
      setError(null);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Failed to send message',
        code: 'SEND_ERROR',
        details: err
      });
    } finally {
      setIsStreaming(false);
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
          <WelcomeScreen 
            examplePrompts={EXAMPLE_PROMPTS} 
            onPromptClick={setInput} 
            inputRef={textareaRef} 
          />
        ) : (
          <MessageList 
            messages={messages} 
            currentResponse={currentResponse} 
            onScroll={scrollToBottom} 
            onRetry={(message: Message) => {
              setMessages(prev => prev.filter(m => m !== message));
              setInput(message.content);
            }} 
          />
        )}
      </div>

      <SwapModal
        isVisible={swapModalVisible}
        swapTokens={swapTokens}
        onClose={() => setSwapModalVisible(false)}
      />

      <InputArea
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        isStreaming={isStreaming}
        isListening={isListening}
        toggleListening={toggleListening}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onSend={handleSubmit}
      />
      
      <div ref={messagesEndRef} />
    </div>
  );
};

export default Chat;