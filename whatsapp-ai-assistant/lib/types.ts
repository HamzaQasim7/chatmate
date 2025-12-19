export interface Settings {
  apiKey: string;
  model: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo';
  language: 'en' | 'ur' | 'mixed';
  isEnabled: boolean;
  tone: 'professional' | 'friendly' | 'balanced';
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
  type: 'professional' | 'friendly' | 'quick';
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
