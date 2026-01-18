import React from 'react';
import { Copy, Send, Loader2 } from 'lucide-react';
import type { Suggestion } from '@/lib/types';
import { TONE_CONFIG } from '@/lib/types';

interface SuggestionCardProps {
  suggestion: Suggestion | null;
  loading?: boolean;
  onCopy: (text: string) => void;
  onInsert: (text: string) => void;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  loading,
  onCopy,
  onInsert,
}) => {
  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 mb-3">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-whatsapp-green" />
        </div>
      </div>
    );
  }

  if (!suggestion) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-3 hover:bg-gray-100 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{TONE_CONFIG[suggestion.type].icon}</span>
        <span className="font-medium text-sm capitalize">{suggestion.type}</span>
      </div>
      <p className="text-sm text-gray-700 mb-3 leading-relaxed">{suggestion.text}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onCopy(suggestion.text)}
          className="flex items-center gap-1 px-3 py-1.5 bg-whatsapp-green text-white rounded-md text-xs font-medium hover:bg-whatsapp-dark transition-colors"
        >
          <Copy size={14} />
          Copy
        </button>
        <button
          onClick={() => onInsert(suggestion.text)}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50 transition-colors"
        >
          <Send size={14} />
          Insert
        </button>
      </div>
    </div>
  );
};
