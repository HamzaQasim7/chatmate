import { defineBackground } from 'wxt/sandbox';
import OpenAI from 'openai';
import { getSettings } from '@/lib/storage';
import type { ChatContext, Suggestion } from '@/lib/types';

export default defineBackground({
  type: 'module',
  
  main() {
    console.log('WhatsApp AI Assistant: Background script loaded');

    // Listen for messages from content script
    browser.runtime.onMessage.addListener(async (message, sender) => {
      if (message.action === 'generateSuggestions') {
        return await generateSuggestions(message.data);
      }
      
      if (message.action === 'regenerate') {
        // Get last context from storage and regenerate
        const lastContext = await getLastContext();
        if (lastContext) {
          return await generateSuggestions(lastContext);
        }
        return { suggestions: [], error: 'No previous context found' };
      }
    });
  },
});

async function generateSuggestions(context: ChatContext) {
  try {
    const settings = await getSettings();
    
    if (!settings.apiKey) {
      return {
        error: 'API key not configured. Please add your OpenAI API key in settings.',
        suggestions: [],
      };
    }

    const openai = new OpenAI({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true, // For extension usage
    });

    const systemPrompt = getSystemPrompt(settings.language);
    const userPrompt = formatUserPrompt(context);

    const response = await openai.chat.completions.create({
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiResponse = response.choices[0]?.message?.content || '';
    const suggestions = parseAIResponse(aiResponse);

    // Save context for regeneration
    await saveLastContext(context);

    return { suggestions, error: null };
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    return {
      error: formatError(error),
      suggestions: [],
    };
  }
}

function getSystemPrompt(language: string): string {
  const prompts = {
    en: "You are a professional communication assistant for a freelancer communicating with clients on WhatsApp. Generate 3 different response suggestions with these tones: 1) PROFESSIONAL (formal and business-like), 2) FRIENDLY (warm and approachable), 3) QUICK (brief and to-the-point). Keep all responses concise (2-3 sentences max). Focus on clear, helpful communication.",
    
    ur: "آپ ایک فری لانسر کے لیے پروفیشنل کمیونیکیشن اسسٹنٹ ہیں جو واٹس ایپ پر کلائنٹس سے بات کر رہا ہے۔ 3 مختلف جوابات تیار کریں: 1) PROFESSIONAL (رسمی اور بزنس لائق), 2) FRIENDLY (دوستانہ اور گرمجوش), 3) QUICK (مختصر اور واضح)۔ سب جوابات مختصر رکھیں (2-3 جملے)۔",
    
    mixed: "You are a professional communication assistant. Generate 3 response suggestions in a mix of English and Urdu (Roman Urdu is acceptable). Tones: 1) PROFESSIONAL (formal), 2) FRIENDLY (warm), 3) QUICK (brief). Keep responses concise (2-3 sentences).",
  };

  return prompts[language as keyof typeof prompts] || prompts.en;
}

function formatUserPrompt(context: ChatContext): string {
  const contextStr = context.previousMessages.length > 0
    ? `Previous conversation:\n${context.previousMessages.join('\n')}\n\n`
    : '';

  return `${contextStr}Client (${context.senderName}) just sent: "${context.currentMessage}"

Generate 3 response options in this EXACT format:

1. PROFESSIONAL:
[Your professional response here]

2. FRIENDLY:
[Your friendly response here]

3. QUICK:
[Your quick response here]`;
}

function parseAIResponse(response: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  
  // Parse professional suggestion
  const professionalMatch = response.match(/1\.\s*PROFESSIONAL:\s*\n([\s\S]*?)(?=\n2\.|$)/i);
  if (professionalMatch) {
    suggestions.push({
      id: '1',
      type: 'professional',
      text: professionalMatch[1].trim(),
      icon: '🎯',
    });
  }

  // Parse friendly suggestion
  const friendlyMatch = response.match(/2\.\s*FRIENDLY:\s*\n([\s\S]*?)(?=\n3\.|$)/i);
  if (friendlyMatch) {
    suggestions.push({
      id: '2',
      type: 'friendly',
      text: friendlyMatch[1].trim(),
      icon: '😊',
    });
  }

  // Parse quick suggestion
  const quickMatch = response.match(/3\.\s*QUICK:\s*\n([\s\S]*?)$/i);
  if (quickMatch) {
    suggestions.push({
      id: '3',
      type: 'quick',
      text: quickMatch[1].trim(),
      icon: '⚡',
    });
  }

  // Fallback: if parsing failed, try to extract any numbered items
  if (suggestions.length === 0) {
    const lines = response.split('\n').filter(line => line.trim());
    let currentType: 'professional' | 'friendly' | 'quick' = 'professional';
    let currentText = '';

    for (const line of lines) {
      if (line.match(/1\.|professional/i)) {
        if (currentText) {
          suggestions.push({
            id: String(suggestions.length + 1),
            type: currentType,
            text: currentText.trim(),
            icon: currentType === 'professional' ? '🎯' : currentType === 'friendly' ? '😊' : '⚡',
          });
        }
        currentType = 'professional';
        currentText = line.replace(/1\.|professional:/gi, '').trim();
      } else if (line.match(/2\.|friendly/i)) {
        if (currentText) {
          suggestions.push({
            id: String(suggestions.length + 1),
            type: currentType,
            text: currentText.trim(),
            icon: currentType === 'professional' ? '🎯' : currentType === 'friendly' ? '😊' : '⚡',
          });
        }
        currentType = 'friendly';
        currentText = line.replace(/2\.|friendly:/gi, '').trim();
      } else if (line.match(/3\.|quick/i)) {
        if (currentText) {
          suggestions.push({
            id: String(suggestions.length + 1),
            type: currentType,
            text: currentText.trim(),
            icon: currentType === 'professional' ? '🎯' : currentType === 'friendly' ? '😊' : '⚡',
          });
        }
        currentType = 'quick';
        currentText = line.replace(/3\.|quick:/gi, '').trim();
      } else {
        currentText += ' ' + line.trim();
      }
    }

    if (currentText && suggestions.length < 3) {
      suggestions.push({
        id: String(suggestions.length + 1),
        type: currentType,
        text: currentText.trim(),
        icon: currentType === 'professional' ? '🎯' : currentType === 'friendly' ? '😊' : '⚡',
      });
    }
  }

  return suggestions;
}

function formatError(error: any): string {
  if (error.status === 401) return 'Invalid API key. Please check your settings.';
  if (error.status === 429) return 'Rate limit exceeded. Please wait a moment.';
  if (error.status === 500) return 'OpenAI service error. Please try again.';
  return 'Failed to generate suggestions. Please try again.';
}

async function saveLastContext(context: ChatContext) {
  await browser.storage.local.set({ lastContext: context });
}

async function getLastContext(): Promise<ChatContext | null> {
  const result = await browser.storage.local.get('lastContext');
  return result.lastContext || null;
}
