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
    description: 'Fastest replies',
    openAIModel: 'gpt-5-nano',
    isPro: false
  },
  'reple-smart': {
    label: 'Reple Smart',
    description: 'Best balance',
    openAIModel: 'gpt-4.1-mini',
    isPro: false
  },
  'reple-pro': {
    label: 'Reple Pro',
    description: 'Highest quality',
    openAIModel: 'gpt-4.1',
    isPro: true
  }
};

export interface UsageStats {
  count: number;
  limit?: number;
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
  usage?: number;
  limit?: number;
}

// Enhanced BuyingSignal type with categories and confidence
export interface BuyingSignal {
  type: 'positive' | 'negative' | 'neutral' | 'objection';
  confidence: number; // 0-1
  signal: string;
  category: 'price' | 'timing' | 'authority' | 'need' | 'competition' | 'general';
  quote: string; // Exact quote from transcript
}

// Enhanced AudioAnalysisResult with rich analysis data
export interface AudioAnalysisResult {
  transcript: string;
  language?: string;
  duration?: number;
  sentiment: {
    overall: 'positive' | 'negative' | 'neutral';
    score: number; // -1 to 1
  };
  buyingSignals: BuyingSignal[];
  urgency: 'high' | 'medium' | 'low';
  suggestedTone: string;
  keyPoints: string[];
  strategy: string;
  suggestedReply: string;
  // Legacy fields for backward compatibility
  tone?: string;
  buyingSignal?: {
    signal: string;
    score: number;
    urgency: string;
  };
  signals?: string[];
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
