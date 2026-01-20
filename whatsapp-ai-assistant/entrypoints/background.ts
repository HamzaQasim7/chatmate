
import { defineBackground } from 'wxt/utils/define-background';
import OpenAI from 'openai';
import { getSettings } from '@/lib/storage';
import { checkAndResetUsage, incrementUsage } from '@/lib/storage';
import { TONE_CONFIG, MODEL_CONFIG, type ChatContext, type Suggestion, type ToneType } from '@/lib/types';

// FREE TIER API KEY (Now loaded from .env)
const FREE_TIER_API_KEY = (import.meta as any).env.WXT_FREE_TIER_API_KEY || '';

export default defineBackground({
  type: 'module',

  async main() {
    console.log('[WhatsApp AI Background] Script loaded');

    // Initialize settings if needed (optional logging)
    const settings = await getSettings();
    if (!settings.apiKey) {
      console.log('[WhatsApp AI Background] No API key configured');
    }

    // Message listener with proper async response handling
    browser.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
      console.log('[WhatsApp AI Background] Received message:', message.action);

      if (message.action === 'generateSuggestions') {
        generateSuggestions(message.data)
          .then((response) => {
            console.log('[WhatsApp AI Background] Sending response:', response);
            sendResponse(response);
          })
          .catch((error) => {
            console.error('[WhatsApp AI Background] Error:', error);
            sendResponse({ suggestions: [], error: error.message || 'Failed to generate suggestions' });
          });
        return true; // Keep message channel open for async response
      }

      if (message.action === 'regenerate') {
        const customInstruction = message.customInstruction || '';
        getLastContext()
          .then((context) => context ? generateSuggestions(context, customInstruction, true) : { suggestions: [], error: 'No previous context found' })
          .then((response) => { sendResponse(response); })
          .then((response) => { sendResponse(response); })
          .catch((error) => { sendResponse({ suggestions: [], error: error.message || 'Failed to regenerate' }); });
        return true;
      }

      return false;
    });
  },
});

// Production-level system prompts for each tone
const TONE_PROMPTS: Record<ToneType, string> = {
  formal: `You are a Fortune 500 Executive. Write with absolute authority and brevity.
CORE OBJECTIVE:
Your goal is to be respected, not liked. Save the reader's time. 

STYLE RULES:
- Zero formatting. No bold, no lists, no fluff.
- Use "BLUF" (Bottom Line Up Front).
- Never use "I hope this finds you well" or "Please let me know".
- Use strong verbs. "Decide", "Approve", "Proceed".
- Maximum 2-3 sentences.
- If a "No" is required, say it clearly but professionally.

ANTI-PATTERNS (DO NOT DO):
- Do not apologize ("I'm sorry but...").
- Do not over-explain.
- Do not use exclamation marks.

OUTPUT:
One direct, high-impact executive response.`,

  friendly: `You are a high-EQ colleague who radiates warmth.
CORE OBJECTIVE:
Make the user feel heard and validated. Mirror their energy.

STYLE RULES:
- Use specific "softeners" ("Just wanted to...", "Happy to help with this").
- Contractions are mandatory ("I'm", "You're", "Don't").
- If the context matches, 1 tasteful emoji is allowed (e.g., 🙂 or 🙌).
- Reference specific details from their message to show you read it.

ANTI-PATTERNS (DO NOT DO):
- Do not be "Customer Support functional". Be "Coffee Shop casual".
- Do not be toxic positive ("OMG!!!"). Keep it grounded.

OUTPUT:
One warm, genuine, human response.`,

  professional: `You are a Senior Consultant. Reliable, crisp, and "net-positive".
CORE OBJECTIVE:
Move the project or conversation forward efficiently. Build trust through competence.

STYLE RULES:
- Standard punctuation and grammar, but not stiff.
- Focus on "Next Steps" or "Action Items".
- Remove all filler words ("basically", "just", "actually").
- Tone: "Confident Humility".

ANTI-PATTERNS (DO NOT DO):
- Do not use corporate jargon ("synergy", "circle back") unless necessary.
- Do not be cold. "Warm Professionalism" is the key.

OUTPUT:
One capable, trustworthy business response.`,

  natural: `You are a Millennial/Gen-Z user texting on WhatsApp/Slack.
CORE OBJECTIVE:
Be undetectable as an AI. Pass the Turing Test for "Texting".

STYLE RULES:
- **LOWERCASE START IS OK.** Real people don't always capitalize the first letter.
- **LOOSE PUNCTUATION.** You don't need a period at the end of the last sentence.
- **Micro-Lengths.** "Sure thing" or "On it" is often better than a full sentence.
- React to the content, don't just "reply".

ANTI-PATTERNS (DO NOT DO):
- NEVER use "Hello [Name]" or "Best regards". That is for emails, not chat.
- NEVER use compound sentences with "However" or "Therefore".
- NEVER sound helpful. Sound "reactive".

OUTPUT:
One raw, unfiltered, authentic text message.`,

  sales: `You are a Strategic Advisor, not a "Salesperson".
CORE OBJECTIVE:
Uncover pain and gap-sell. Help them buy, don't "sell" them.

STYLE RULES:
- Focus on THEIR problem, not YOUR solution.
- Use "Problem-Aware" language ("It sounds like [Issue] is costing you time...").
- Call to Actions (CTAs) should be "Low Friction" ("Worth a chat?", not "Book a demo").
- Confidence = Conciseness.

ANTI-PATTERNS (DO NOT DO):
- Do not feature-dump.
- Do not use false urgency ("Limited time only").
- Do not sound eager. Be "Prize-Framed" (You are the prize).

OUTPUT:
One strategic, value-focused response that opens a loop.`,

  negotiator: `You are a Master Negotiator (Chris Voss style).
CORE OBJECTIVE:
Use Tactical Empathy to gain leverage. Never split the difference.

STYLE RULES:
- Use "Accusation Audits" ("It might seem like I'm being unreasonable...").
- Use "Calibrated Questions" ("How am I supposed to do that?", "What about this works for you?").
- Tone: "Late Night FM DJ Voice" (Calm, slow, reassuring).
- Mirror their last 3 words if you need more info.

ANTI-PATTERNS (DO NOT DO):
- Do not use the word "Why" (it sounds accusatory). Use "What" or "How".
- Do not rush to a solution. Delaying can be leverage.

OUTPUT:
One calculated, psychologically driven negotiation response.`,
};

async function generateSuggestions(context: ChatContext, customInstruction?: string, bypassCache: boolean = false): Promise<{ suggestions: Suggestion[]; error: string | null }> {
  try {
    console.log('[WhatsApp AI Background] Generating suggestions for:', context.currentMessage.substring(0, 50));

    const settings = await getSettings();

    // BYOK LOGIC:
    // 1. If user has custom key -> Unlimited usage
    // 2. If no custom key -> Use Free Tier Key + Enforce Limit

    let activeApiKey = settings.apiKey;
    let isFreeTier = false;

    if (!activeApiKey) {
      // Use Free Tier
      activeApiKey = FREE_TIER_API_KEY;
      isFreeTier = true;

      if (activeApiKey === 'YOUR_OPENAI_API_KEY_HERE') {
        return { error: 'Admin has not configured the Free Tier API Key yet.', suggestions: [] };
      }

      // CHECK USAGE LIMIT ONLY FOR FREE TIER
      const usage = await checkAndResetUsage();
      if (usage.count >= 20) {
        return { error: 'Free monthly limit reached (20/20). Add your own API Key for unlimited usage.', suggestions: [] };
      }
    } else {
      console.log('[WhatsApp AI Background] Using User Custom API Key (Unlimited)');
    }

    const openai = new OpenAI({
      apiKey: activeApiKey,
      dangerouslyAllowBrowser: true,
    });

    const tone = settings.tone || 'professional';

    // CACHE CHECK (Skip if bypassCache is true)
    const cacheKey = generateCacheKey(tone, customInstruction || '', context.currentMessage);
    if (!bypassCache) {
      const cachedResponse = await getCachedResponse(cacheKey);
      if (cachedResponse) {
        console.log('[WhatsApp AI Background] Cache hit for:', cacheKey);

        const validTone = (TONE_CONFIG[tone] ? tone : 'professional') as ToneType;
        const suggestion: Suggestion = {
          id: '1',
          type: validTone,
          text: cachedResponse,
          icon: '',
        };
        return { suggestions: [suggestion], error: null };
      }
    }

    const systemPrompt = getSystemPrompt(tone, settings.language);
    const userPrompt = buildUserPrompt(context, customInstruction);

    console.log('[WhatsApp AI Background] Using tone:', tone);
    console.log('[WhatsApp AI Background] Calling OpenAI API...');

    const response = await openai.chat.completions.create({
      model: (MODEL_CONFIG[settings.model]?.openAIModel || MODEL_CONFIG['reple-smart'].openAIModel),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || '';
    console.log('[WhatsApp AI Background] AI Response:', content.substring(0, 100));

    // Clean up the response - remove quotes, labels, etc.
    const cleanedResponse = cleanResponse(content);

    const validTone = (TONE_CONFIG[tone] ? tone : 'professional') as ToneType;
    const suggestion: Suggestion = {
      id: '1',
      type: validTone,
      text: cleanedResponse,
      icon: '', // Icon is handled by the UI based on type
    };

    // Save to cache (Always save/overwrite new generation)
    await saveResponseToCache(cacheKey, cleanedResponse);

    // Increment usage count ONLY if using free tier
    if (isFreeTier) {
      await incrementUsage();
      const stats = await checkAndResetUsage();
      // Broadcast usage update to all tabs
      try {
        const tabs = await browser.tabs.query({ url: '*://web.whatsapp.com/*' });
        for (const tab of tabs) {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, { action: 'usageUpdated', stats }).catch(() => { });
          }
        }
      } catch (e) { console.error('Failed to broadcast usage update', e); }
    }

    await saveLastContext(context);

    return { suggestions: [suggestion], error: null };
  } catch (error: any) {
    console.error('[WhatsApp AI Background] OpenAI API error:', error);
    return { error: formatError(error), suggestions: [] };
  }
}

function getSystemPrompt(tone: ToneType, language: string): string {
  let basePrompt = TONE_PROMPTS[tone] || TONE_PROMPTS.professional;

  // Add language instruction
  if (language === 'ur') {
    basePrompt += '\n\nIMPORTANT: Respond in Urdu (you may use Roman Urdu script).';
  } else if (language === 'mixed') {
    basePrompt += '\n\nIMPORTANT: Respond in a natural mix of English and Urdu (Roman Urdu is acceptable). This is common in Pakistani business communication.';
  }

  return basePrompt;
}

function buildUserPrompt(context: ChatContext, customInstruction?: string): string {
  let prompt = '';

  if (context.previousMessages.length > 0) {
    prompt += `CONVERSATION CONTEXT: \n${context.previousMessages.slice(-5).join('\n')} \n\n`;
  }

  prompt += `CLIENT(${context.senderName}) JUST SENT: \n"${context.currentMessage}"\n\n`;

  if (customInstruction) {
    prompt += `USER INSTRUCTION: ${customInstruction} \n\n`;
    prompt += `Follow the USER INSTRUCTION above to modify your response. `;
  }

  prompt += `Generate ONE response based on your instructions.Output ONLY the response text, nothing else - no labels, no quotes, no explanations.`;

  return prompt;
}

function cleanResponse(response: string): string {
  let cleaned = response.trim();

  // Remove common prefixes/labels
  cleaned = cleaned.replace(/^(Response:|Reply:|Here's|Here is|My response:|Suggested response:)/i, '').trim();

  // Remove surrounding quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove markdown formatting
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');

  return cleaned.trim();
}

function formatError(error: any): string {
  if (error.status === 401) return 'Invalid API key. Please check your settings.';
  if (error.status === 429) return 'Rate limit exceeded. Please wait a moment.';
  if (error.status === 500) return 'OpenAI service error. Please try again.';
  if (error.message) return error.message;
  return 'Failed to generate suggestions. Please try again.';
}

async function saveLastContext(context: ChatContext): Promise<void> {
  await browser.storage.local.set({ lastContext: context });
}

async function getLastContext(): Promise<ChatContext | null> {
  const result = await browser.storage.local.get('lastContext');
  return result.lastContext || null;
}

// --- Caching Logic ---

async function getCachedResponse(key: string): Promise<string | null> {
  try {
    const result = await browser.storage.local.get('responseCache');
    const cache = result.responseCache || {};
    return cache[key] || null;
  } catch (e) {
    return null;
  }
}

async function saveResponseToCache(key: string, response: string): Promise<void> {
  try {
    const result = await browser.storage.local.get('responseCache');
    const cache = result.responseCache || {};

    // Limit cache size (simple LRU-like: just delete if too big)
    const keys = Object.keys(cache);
    if (keys.length > 50) {
      delete cache[keys[0]]; // Remove oldest (roughly)
    }

    cache[key] = response;
    await browser.storage.local.set({ responseCache: cache });
  } catch (e) {
    console.error('Cache save error', e);
  }
}

function generateCacheKey(tone: string, instruction: string, message: string): string {
  // Simple hash-like key
  const safeMessage = message.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '');
  return `${tone}_${instruction.slice(0, 10)}_${safeMessage}_${message.length} `;
}
