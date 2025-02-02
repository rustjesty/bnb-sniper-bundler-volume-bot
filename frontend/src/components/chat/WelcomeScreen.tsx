import React from 'react';
import { WelcomeScreenProps } from './types';

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  examplePrompts,
  onPromptClick,
  inputRef
}) => {
  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <h2 className="text-3xl font-bold text-center mb-8 text-gray-800 dark:text-gray-200">
        JENNA - Solana Trading Assistant
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {examplePrompts.map((prompt, index) => {
          return (
            <button
              key={index}
              onClick={() => {
                onPromptClick(prompt.prompt);
                inputRef.current?.focus();
              }}
              className="flex items-center p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200 dark:border-gray-700"
            >
              <div className="mr-3 text-purple-500">
                {React.createElement(prompt.icon)} {/* Create element from icon component */}
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {prompt.title}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {prompt.prompt}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};