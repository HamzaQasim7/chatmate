export type ToneType = 'formal' | 'friendly' | 'professional' | 'natural' | 'sales' | 'negotiator' | 'rainmaker';
export type ModelType = 'reple-quick' | 'reple-smart' | 'reple-pro';
export type ProviderType = 'openai' | 'gemini' | 'claude';

export interface Settings {
  provider: ProviderType; // AI provider (openai, gemini, claude)
  apiKey?: string; // Optional: Provider-specific key. If empty, use free tier.
  model: ModelType;
  language: string; // Language code (en, ur, mixed, es, pt, hi, ar, fr, id, de, tr, ru, it)
  isEnabled: boolean;
  tone: ToneType;
  contextWindow: number; // Number of previous messages to include (Default: 5, Max: 10)
}

// Model configuration — maps branded tiers to provider-specific model IDs
export const MODEL_CONFIG: Record<ModelType, {
  label: string;
  description: string;
  providerModels: Record<ProviderType, string>;
  isPro: boolean;
}> = {
  'reple-quick': {
    label: 'Reple Quick',
    description: 'Fastest replies',
    providerModels: {
      openai: 'gpt-4o-mini',
      gemini: 'gemini-2.5-flash-lite',
      claude: 'claude-3-5-haiku-20241022',
    },
    isPro: false,
  },
  'reple-smart': {
    label: 'Reple Smart',
    description: 'Best balance',
    providerModels: {
      openai: 'gpt-4.1-mini',
      gemini: 'gemini-2.5-flash',
      claude: 'claude-sonnet-4-20250514',
    },
    isPro: false,
  },
  'reple-pro': {
    label: 'Reple Pro',
    description: 'Highest quality',
    providerModels: {
      openai: 'gpt-4.1',
      gemini: 'gemini-2.5-pro',
      claude: 'claude-opus-4-20250514',
    },
    isPro: true,
  },
};

// Provider display configuration
export const PROVIDER_CONFIG: Record<ProviderType, {
  label: string;
  icon: string;
  placeholder: string;
  keyPrefix: string;
}> = {
  openai: {
    label: 'OpenAI',
    icon: '/openai-logo.png',
    placeholder: 'sk-...',
    keyPrefix: 'sk-',
  },
  gemini: {
    label: 'Gemini',
    icon: '/gemini-logo.png',
    placeholder: 'AIza...',
    keyPrefix: 'AIza',
  },
  claude: {
    label: 'Claude',
    icon: '/claude-logo.png',
    placeholder: 'sk-ant-...',
    keyPrefix: 'sk-ant-',
  },
};

// Language display configuration — Tier 1 + Tier 2 markets
export const LANGUAGE_CONFIG: Record<string, { label: string; flag: string }> = {
  en: { label: 'English', flag: '🇬🇧' },
  ur: { label: 'Urdu (اردو)', flag: '🇵🇰' },
  mixed: { label: 'Mixed (English + Urdu)', flag: '🇵🇰' },
  // Tier 1 — Top WhatsApp business markets
  es: { label: 'Spanish (Español)', flag: '🇪🇸' },
  pt: { label: 'Portuguese (Português)', flag: '🇧🇷' },
  hi: { label: 'Hindi (हिन्दी)', flag: '🇮🇳' },
  ar: { label: 'Arabic (العربية)', flag: '🇸🇦' },
  // Tier 2 — High-growth markets
  fr: { label: 'French (Français)', flag: '🇫🇷' },
  id: { label: 'Indonesian (Bahasa)', flag: '🇮🇩' },
  de: { label: 'German (Deutsch)', flag: '🇩🇪' },
  tr: { label: 'Turkish (Türkçe)', flag: '🇹🇷' },
  ru: { label: 'Russian (Русский)', flag: '🇷🇺' },
  it: { label: 'Italian (Italiano)', flag: '🇮🇹' },
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
