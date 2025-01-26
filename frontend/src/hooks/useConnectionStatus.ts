// hooks/useConnectionStatus.ts
import { useConnection } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';

export function useConnectionStatus() {
  const { connection } = useConnection();
  const [status, setStatus] = useState<'connected'|'disconnected'>('disconnected');

  useEffect(() => {
    let wsConnection: WebSocket;
    
    const connect = () => {
      wsConnection = new WebSocket(connection.rpcEndpoint.replace('https', 'wss'));
      wsConnection.onopen = () => setStatus('connected');
      wsConnection.onclose = () => setStatus('disconnected');
    };

    connect();
    const heartbeat = setInterval(connect, 30000);

    return () => {
      clearInterval(heartbeat);
      wsConnection?.close();
    };
  }, [connection]);

  return status;
}