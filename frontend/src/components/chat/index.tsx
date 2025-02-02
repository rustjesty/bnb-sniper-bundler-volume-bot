import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { WelcomeScreen } from './WelcomeScreen';
import { SwapModal } from '../SwapModal';
import { EXAMPLE_PROMPTS } from './constants';
import { Message, SwapDetails, ChatError } from './types';

// Define the component props interface
export interface ChatComponentProps {
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  isStreaming: boolean;
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

const Chat: React.FC<ChatComponentProps> = ({
  messages: externalMessages,
  onSendMessage,
  isStreaming: externalIsStreaming
}) => {
  // Local state
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [swapTokens, setSwapTokens] = useState<SwapDetails>();
  const [error, setError] = useState<ChatError | null>(null);
  const [currentResponse, setCurrentResponse] = useState('');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognition = useRef<any>(null);

  // Wallet status
  const { isConnected, displayAddress } = useWalletStatus();

  // Derived state
  const isInitialState = externalMessages.length === 0;

  // Auto-scroll effect
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [externalMessages, scrollToBottom]);

  // Speech recognition setup
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

  // Handle message submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || externalIsStreaming) return;

    try {
      const tradeCommand = parseTradeCommand(input);
      if (tradeCommand) {
        setSwapModalVisible(true);
        setSwapTokens(tradeCommand);
        return;
      }

      const message = input.trim();
      setInput('');
      await onSendMessage(message);
      setError(null);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Failed to send message',
        code: 'SEND_ERROR',
        details: err
      });
    }
  };

  // Parse trade commands
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

  // Toggle speech recognition
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
      {/* Header */}
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

      {/* Main Content */}
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
            messages={externalMessages}
            currentResponse={currentResponse}
          />
        )}
      </div>

      {/* Swap Modal */}
      <SwapModal
        isVisible={swapModalVisible}
        swapTokens={swapTokens}
        onClose={() => setSwapModalVisible(false)}
      />

      {/* Input Area */}
      <InputArea
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        isStreaming={externalIsStreaming}
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