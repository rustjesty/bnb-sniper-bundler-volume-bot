import React, { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export const WalletManager = () => {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    latency: 0,  
    errorCount: 0,
    currentEndpoint: ''
  });
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let errorCount = 0;
    let latencyInterval: NodeJS.Timeout | null = null;

    const checkConnection = async () => {
      try {
        const start = performance.now();
        await connection.getSlot();
        const latency = performance.now() - start;

        if (mounted) {
          setConnectionStatus(prev => ({
            isConnected: true,
            latency,
            errorCount: 0,
            currentEndpoint: connection.rpcEndpoint
          }));
        }
      } catch (error) {
        errorCount++;
        if (mounted) {
          setConnectionStatus(prev => ({
            ...prev,
            isConnected: false,
            errorCount
          }));

          if (errorCount >= 3) {
            setAlertMessage('Connection issues detected. Switching to backup RPC...');
            setShowAlert(true);
          }
        }
      }
    };

    latencyInterval = setInterval(checkConnection, 30000);
    checkConnection();

    return () => {
      mounted = false;
      clearInterval(latencyInterval);
    };
  }, [connection]);

  useEffect(() => {
    let isMounted = true;

    const updateBalance = async () => {
      if (!publicKey) return;
      try {
        const balance = await connection.getBalance(publicKey);
        if (isMounted) {
          setBalance(balance / LAMPORTS_PER_SOL);
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
      }
    };

    if (connected) {
      updateBalance();
      const id = setInterval(updateBalance, 10000);
      return () => {
        isMounted = false;
        clearInterval(id);
      };
    }
    return () => { isMounted = false; };
  }, [publicKey, connection, connected]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {showAlert && (
        <Alert className="bg-red-50 border-red-200">
          <AlertTitle className="text-red-800">{alertMessage}</AlertTitle>
        </Alert>
      )}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
        connectionStatus.isConnected ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
      }`}>
        <div className={`w-2 h-2 rounded-full ${
          connectionStatus.isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <span className="text-sm">
          {connectionStatus.isConnected 
            ? `Connected (${Math.round(connectionStatus.latency)}ms)` 
            : 'Disconnected'}
        </span>
      </div>
      <div className="flex items-center gap-4 mt-2">
        <WalletMultiButton />
        {connected && balance !== null && (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {balance.toFixed(4)} SOL
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletManager;