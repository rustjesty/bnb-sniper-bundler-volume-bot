import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { Message, MessageListProps } from './types';

const ImageComponent = ({ src, alt }: { src: string; alt: string }) => (
  <div className="my-4">
    <Image 
      src={src} 
      alt={alt} 
      width={400} 
      height={400} 
      className="rounded-lg"
    />
  </div>
);

const WalletComponent = ({ address, content }: { address: string; content: string }) => (
  <div className="p-2 bg-gray-800 rounded-lg font-mono text-sm break-all">
    <div className="text-gray-400 mb-1">{content.split(address)[0]}</div>
    <div className="text-gray-200">{address}</div>
  </div>
);

const TransactionComponent = ({ content }: { content: string }) => (
  <div className="p-2 bg-gray-800 rounded-lg font-mono text-sm break-all text-gray-200">
    {content}
  </div>
);

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentResponse,
  onScroll,
  isLoading = false,
  error = null
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse]);

  // Message content formatter
  const formatMessageContent = (content: string) => {
    // Check for wallet address pattern
    const addressMatch = content.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (addressMatch && content.includes('address')) {
      const address = addressMatch[0];
      return <WalletComponent address={address} content={content} />;
    }

    // Check for transaction/blockchain content
    if (/balance|SOL|transaction|JENNA/i.test(content)) {
      return <TransactionComponent content={content} />;
    }

    // Default message formatting
    return (
      <ReactMarkdown
        components={{
          img: ImageComponent as any,
          p: ({ children }) => <p className="mb-4">{children}</p>,
          code: ({ node, className, children, ...props }) => {
            return (
              <pre className="p-4 bg-gray-800 rounded-lg overflow-x-auto">
                <code className="text-sm" {...props}>
                  {children}
                </code>
              </pre>
            );
          }
        }}
        className="prose dark:prose-invert max-w-none"
      >
        {content}
      </ReactMarkdown>
    );
  };

  return (
    <div 
      className="w-full max-w-3xl mx-auto space-y-4 overflow-y-auto p-4"
      onScroll={onScroll}
    >
      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Message list */}
      {messages.map((message, index) => (
        <div
          key={index}
          className={`flex ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`max-w-[85%] rounded-lg p-4 ${
              message.role === 'user'
                ? 'bg-purple-500 text-white'
                : 'bg-white dark:bg-gray-800 dark:text-white shadow-md'
            }`}
          >
            {formatMessageContent(message.content)}
          </div>
        </div>
      ))}

      {/* Current streaming response */}
      {currentResponse && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-lg p-4 bg-white dark:bg-gray-800 dark:text-white shadow-md">
            {formatMessageContent(currentResponse)}
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-lg p-4 bg-white dark:bg-gray-800 dark:text-white shadow-md">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </div>
      )}

      {/* Auto-scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;