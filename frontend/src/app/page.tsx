'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import { Message, streamCompletion } from '@/utils/groq';
import logger from '@/utils/logger';

// Types
interface ChatProps {
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  isStreaming: boolean;
}

// Dynamic imports
const Chat = dynamic<ChatProps>(() => import('@/components/chat'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center min-h-[600px]">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading JENNA AI...</p>
      </div>
    </div>
  ),
});

export default function HomePage() {
  // State management
  const [mounted, setMounted] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get wallet connection
  const { connected, publicKey } = useWallet();

  // Handle component mounting
  useEffect(() => {
    setMounted(true);
    return () => {
      // Cleanup if needed
      setChatMessages([]);
      setError(null);
    };
  }, []);

  // Message handler with error boundaries
  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isStreaming) return;

    const newMessage: Message = {
      role: 'user',
      content: message.trim(),
      name: 'user',
      function_call: {
        name: '',
        arguments: ''
      }
    };

    try {
      setIsStreaming(true);
      setError(null);
      
      // Add user message
      setChatMessages(prev => [...prev, newMessage]);

      // Stream AI response
      let currentResponse = '';
      
      const updateResponse = (chunk: string) => {
        currentResponse += chunk;
        setChatMessages(prevMessages => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            return [
              ...prevMessages.slice(0, -1),
              {
                ...lastMessage,
                content: currentResponse
              }
            ];
          }
          return [
            ...prevMessages,
            {
              role: 'assistant',
              content: chunk,
              name: 'assistant',
              function_call: {
                name: '',
                arguments: ''
              }
            }
          ];
        });
      };

      await streamCompletion([...chatMessages, newMessage], updateResponse);

    } catch (error) {
      logger.error('Chat error:', error);
      setError('Sorry, I encountered an error. Please try again.');
      
      setChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          name: 'assistant',
          function_call: {
            name: '',
            arguments: ''
          }
        }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // Don't render until mounted
  if (!mounted) return null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Chat Container */}
        <div className="max-w-4xl mx-auto">
          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          {/* Chat Component */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            <Chat
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isStreaming={isStreaming}
            />
          </div>

          {/* Connection Status */}
          {connected && publicKey && (
            <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Connected: {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}