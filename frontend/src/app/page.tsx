'use client';
//import WalletConnect from '../components/WalletConnect';
import { aiService } from '../ai/ai';

import { useState, useEffect } from 'react';
import { Suspense } from 'react';
import { validateApiKey, streamCompletion, Message } from '@/utils/groq';
import logger from '@/utils/logger';
import { useWallet } from '@solana/wallet-adapter-react'; 
import bs58 from 'bs58';

// Components
import ApiKeyModal from '@/components/ApiKeyModal'; 
import Chat from '@/components/Chat';
import { agentWallet } from '@/utils/wallet';
 
// Constants
const STORAGE_KEYS = {
  API_KEY: 'jenna_api_key',
  WALLET_CONNECTED: 'jenna_wallet_connected'
} as const;

// Add API key validation helper
const isValidStoredApiKey = (apiKey: string): boolean => {
  try {
    // Try to decode the key - if it's not base58, this will throw
    const decoded = bs58.decode(apiKey);
    return decoded.length > 0;
  } catch {
    return false;
  }
};

export default function Home() {
  const { connected } = useWallet();

  // State
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [hasValidApiKey, setHasValidApiKey] = useState(false);
  const [isWalletInitialized, setIsWalletInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [priceAnalysis, setPriceAnalysis] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Check API key and initialize services
  useEffect(() => {
    const initializeServices = async () => {
      try { 
        setIsLoading(true);

        // Check stored API key with improved validation
        const storedApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
        if (storedApiKey && isValidStoredApiKey(storedApiKey)) {
          try {
            const isValid = await validateApiKey(storedApiKey);
            setHasValidApiKey(isValid);
            setIsApiKeyModalOpen(!isValid);
          } catch (error) {
            logger.error('API key validation error:', error);
            setHasValidApiKey(false);
            setIsApiKeyModalOpen(true);
            localStorage.removeItem(STORAGE_KEYS.API_KEY); // Clear invalid key
          }
        } else {
          setIsApiKeyModalOpen(true);
          if (storedApiKey) {
            localStorage.removeItem(STORAGE_KEYS.API_KEY); // Clear invalid key
          }
        }

        // Initialize wallet with better error handling
        try {
          const walletConnected = await agentWallet.initialize();
          setIsWalletInitialized(walletConnected);
          if (walletConnected) {
            localStorage.setItem(STORAGE_KEYS.WALLET_CONNECTED, 'true');
            logger.success('Wallet initialized successfully');
          }
        } catch (error) {
          console.error('Wallet initialization error:', error);
          setIsWalletInitialized(false);
          localStorage.removeItem(STORAGE_KEYS.WALLET_CONNECTED);
          logger.warn('Wallet initialization failed');
        }

      } catch (error) {
        console.error('Service initialization error:', error);
        setIsApiKeyModalOpen(true);
        logger.error('Services initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeServices();
  }, []);

  // Handle API key submission with improved validation
  const handleApiKeySubmit = async (apiKey: string) => {
    try {
      if (!isValidStoredApiKey(apiKey)) {
        throw new Error('Invalid API key format');
      }

      const isValid = await validateApiKey(apiKey);
      if (isValid) {
        localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
        setHasValidApiKey(true);
        setIsApiKeyModalOpen(false);
        logger.success('API key validated and stored');
      } else {
        throw new Error('API key validation failed');
      }
    } catch (error) {
      console.error('API key validation error:', error);
      setHasValidApiKey(false);
      localStorage.removeItem(STORAGE_KEYS.API_KEY);
      // Show error to user (you might want to add an error state and display)
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    if (hasValidApiKey) {
      setIsApiKeyModalOpen(false);
    }
  };

  // Handle wallet connect
  const handleWalletConnect = (address: string) => {
    setWalletAddress(address);
  };

  // Handle wallet disconnect
  const handleWalletDisconnect = () => {
    setWalletAddress(null);
    setPriceAnalysis(null);
  };

  // Fetch and analyze price
  const fetchAndAnalyzePrice = async (tokenAddress: string) => {
    try {
      const analysis = await aiService.fetchAndAnalyzePrice(tokenAddress);
      setPriceAnalysis(analysis);
    } catch (error) {
      logger.error('Error fetching and analyzing price:', error);
      setPriceAnalysis('Error fetching and analyzing price. Please try again.');
    }
  };

  const handleSendMessage = async (message: string) => {
    const newMessage: Message = { role: 'user', content: message };
    setChatMessages([...chatMessages, newMessage]);

    setIsStreaming(true);
    await streamCompletion(
      [...chatMessages, newMessage],
      (chunk) => {
        setChatMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            lastMessage.content += chunk;
            return [...prevMessages.slice(0, -1), lastMessage];
          } else {
            return [...prevMessages, { role: 'assistant', content: chunk }];
          }
        });
      }
    );
    setIsStreaming(false);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Initializing JENNA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="container mx-auto px-4 py-8">
        {/* Main Heading - Keep only one */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            JENNA - Solana Trading Assistant
          </h1>
          
          {/* Wallet Status Indicator */}
          <div className="flex items-center gap-2">
            {connected ? (
              <span className="inline-flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                <span className="text-sm text-gray-600 dark:text-gray-300">Wallet Connected</span>
              </span>
            ) : null}
          </div>
        </div>

        {walletAddress && (
          <div className="mt-8">
            <button
              onClick={() => fetchAndAnalyzePrice(walletAddress)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg"
            >
              Fetch and Analyze Price
            </button>
            {priceAnalysis && (
              <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <pre className="text-sm text-gray-800 dark:text-gray-200">{priceAnalysis}</pre>
              </div>
            )}
          </div>
        )}

        <Suspense 
          fallback={
            <div className="flex justify-center items-center h-64">
              <div className="animate-pulse text-gray-600 dark:text-gray-300">
                Loading Chat...
              </div>
            </div>
          }
        >
          {hasValidApiKey && (
            <Chat 
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isStreaming={isStreaming}
            />
          )}
        </Suspense>

        <ApiKeyModal 
          isOpen={isApiKeyModalOpen}
          onClose={handleModalClose}
          onApiKeySubmit={handleApiKeySubmit}
        />
      </main>
    </div>
  );
}