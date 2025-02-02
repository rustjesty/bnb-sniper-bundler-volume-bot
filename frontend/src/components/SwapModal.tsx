import React from 'react';
import { SwapModalProps } from './chat/types';


export const SwapModal: React.FC<SwapModalProps> = ({ 
  isVisible, 
  swapTokens, 
  onClose 
}) => {
  if (!isVisible || !swapTokens) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          Confirm Swap
        </h2>
        
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">From:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {swapTokens.amount} {swapTokens.from}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">To:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {swapTokens.to}
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
          >
            Confirm Swap
          </button>
        </div>
      </div>
    </div>
  );
};