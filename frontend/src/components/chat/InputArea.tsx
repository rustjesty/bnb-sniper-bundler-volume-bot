import React, { ChangeEvent, FormEvent, useRef } from 'react';
import { InputAreaProps } from './types';
import { IconArrowRight, IconMicrophone } from '@/components/Icon';

export const InputArea: React.FC<InputAreaProps> = ({
  input,
  setInput,
  onSubmit,
  isStreaming,
  isListening,
  toggleListening,
  value,
  onChange,
  onSend
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(e as unknown as FormEvent);
    }
  };

  return (
    <div className="flex-0 p-4 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <form 
        onSubmit={onSubmit}
        className="w-full max-w-3xl mx-auto relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask JENNA anything about Solana trading..."
          className="w-full p-4 pr-24 bg-transparent resize-none outline-none dark:text-white font-mono"
          rows={1}
          style={{ maxHeight: '200px' }}
        />
        <button
          type="button"
          onClick={toggleListening}
          className={`absolute right-14 bottom-2 top-2 px-4 ${
            isListening ? 'text-red-500' : 'text-gray-500'
          } hover:text-gray-700 transition-colors duration-200`}
        >
          <IconMicrophone className="w-5 h-5" />
        </button>
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="absolute right-2 bottom-2 top-2 px-4 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors duration-200"
        >
          <IconArrowRight className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};