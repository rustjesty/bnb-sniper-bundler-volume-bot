'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import { Message } from '@/components/chat/types';
import { ChatComponentProps } from '@/components/chat';
import logger from '@/utils/logger';

const Chat = dynamic<ChatComponentProps>(() => import('@/components/chat'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>
  ),
});

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    setMounted(true);
    
    // Check for API key
    if (!process.env.NEXT_PUBLIC_GROQ_API_KEY) {
      setError('API key not configured. Please check your environment variables.');
    }
  }, []);

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isStreaming) return;

    // Create new message with correct type
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
      setMessages(prev => [...prev, newMessage]);

      // Send message to API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, newMessage] })
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                setMessages(prev => {
                  const lastMessage = prev[prev.length - 1];
                  if (lastMessage?.role === 'assistant') {
                    return [
                      ...prev.slice(0, -1),
                      { ...lastMessage, content: lastMessage.content + data.content }
                    ];
                  }
                  return [...prev, { role: 'assistant', content: data.content, name: 'assistant', function_call: { name: '', arguments: '' } }];
                });
              } catch (e) {
                console.error('Error parsing response:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Chat error:', error);
      setError('Failed to send message. Please try again.');
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          name: 'assistant',
          function_call: { name: '', arguments: '' }
        }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}
          <Chat
            messages={messages}
            onSendMessage={handleSendMessage}
            isStreaming={isStreaming}
          />
        </div>
      </main>
    </div>
  );
}