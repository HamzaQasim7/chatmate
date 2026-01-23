export type ToneType = 'formal' | 'friendly' | 'professional' | 'natural' | 'sales' | 'negotiator' | 'rainmaker';
export type ModelType = 'reple-quick' | 'reple-smart' | 'reple-pro';

export interface Settings {
  apiKey?: string; // Optional: User's custom key. If empty, use free tier.
  model: ModelType;
  language: 'en' | 'ur' | 'mixed';
  isEnabled: boolean;
  tone: ToneType;
}

// Model configuration
export const MODEL_CONFIG: Record<ModelType, { label: string; description: string; openAIModel: string; isPro: boolean }> = {
  'reple-quick': {
    label: 'Reple Quick',
    description: 'Fast replies',
    openAIModel: 'gpt-3.5-turbo',
    isPro: false
  },
  'reple-smart': {
    label: 'Reple Smart',
    description: 'Best balance',
    openAIModel: 'gpt-4o-mini',
    isPro: false
  },
  'reple-pro': {
    label: 'Reple Pro',
    description: 'Highest quality',
    openAIModel: 'gpt-4o',
    isPro: true
  }
};

export interface UsageStats {
  count: number;
  lastReset: number; // timestamp
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
  rainmaker: {
    icon: '⚡',
    label: 'The Rainmaker',
    description: 'Expert Sales & Negotiation Strategy'
  },
};
