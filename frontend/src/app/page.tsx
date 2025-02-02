'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from '@/components/WalletButton';
import dynamic from 'next/dynamic';
import { streamCompletion, Message } from '@/utils/groq';
import logger from '@/utils/logger';

// Dynamically import Chat component
const Chat = dynamic(() => import('@/components/Chat'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>
  ),
});

export default function HomePage() {
  const { connected, publicKey } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    const newMessage: Message = {
      role: 'user', content: message,
      name: undefined,
      function_call: undefined
    };
    setChatMessages(prev => [...prev, newMessage]);

    setIsStreaming(true);
    try {
      await streamCompletion(
        [...chatMessages, newMessage],
        (chunk) => {
          setChatMessages((prevMessages) => {
            const lastMessage = prevMessages[prevMessages.length - 1];
            if (lastMessage.role === 'assistant') {
              return [
                ...prevMessages.slice(0, -1),
                { ...lastMessage, content: lastMessage.content + chunk }
              ];
            }
            return [...prevMessages, { role: 'assistant', content: chunk, name: undefined, function_call: undefined }];
          });
        }
      );
    } catch (error) {
      logger.error('Chat error:', error);
      setChatMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: 'Sorry, I encountered an error. Please try again.',
          name: undefined,
          function_call: undefined
        }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white shadow dark:bg-gray-800 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              JENNA AI
            </h1>
            <div className="flex items-center space-x-4">
              {connected && publicKey && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
                </span>
              )}
              <WalletButton />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <Chat 
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isStreaming={isStreaming}
          />
        </div>
      </main>
    </div>
  );
}