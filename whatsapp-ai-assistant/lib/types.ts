export type ToneType = 'formal' | 'friendly' | 'professional' | 'natural' | 'sales' | 'negotiator';

export interface Settings {
  apiKey: string;
  model: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo';
  language: 'en' | 'ur' | 'mixed';
  isEnabled: boolean;
  tone: ToneType;
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isIncoming: boolean;
}

export interface Suggestion {
  id: string;
  type: ToneType;
  text: string;
  icon: string;
}

export interface ChatContext {
  senderName: string;
  currentMessage: string;
  previousMessages: string[];
}

export interface APIResponse {
  suggestions: Suggestion[];
  error?: string;
}

// Tone configuration with icons and labels
export const TONE_CONFIG: Record<ToneType, { icon: string; label: string; description: string }> = {
  formal: {
    icon: '📋',
    label: 'Formal',
    description: 'Corporate & official tone'
  },
  friendly: {
    icon: '😊',
    label: 'Friendly',
    description: 'Warm & approachable'
  },
  professional: {
    icon: '💼',
    label: 'Professional',
    description: 'Business-focused & competent'
  },
  natural: {
    icon: '💬',
    label: 'Natural',
    description: 'Casual & conversational'
  },
  sales: {
    icon: '🎯',
    label: 'Sales Expert',
    description: 'Persuasive & value-focused'
  },
  negotiator: {
    icon: '🤝',
    label: 'Expert Negotiator',
    description: 'Strategic & diplomatic'
  },
};
