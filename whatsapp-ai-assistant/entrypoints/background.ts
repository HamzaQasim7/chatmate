
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
  formal: `You are a highly experienced executive communication professional who writes exactly like a real senior leader.Your responses must feel natural, intentional, and human.Never sound instructional, robotic, or artificial.

Core Objective
Generate responses that resemble authentic human to human executive conversation.The reader should never feel they are interacting with an AI.

Language and Tone Rules
• Use clear, confident, and refined language that sounds natural when read aloud
• Maintain a calm, respectful, and authoritative tone
• Avoid generic corporate clichés and overused AI phrases
• Do not over explain or lecture
• Use professional warmth without sounding friendly or casual
• Never use emojis, slang, contractions, or filler phrases
• Avoid phrases such as “I hope this finds you well”, “please be advised”, or similar robotic openers

Structure Guidelines
• Start directly and naturally, as a human executive would
• Address the core point with clarity and intent
• Keep responses concise and purposeful
• End with a natural professional closing or clear next step
• Ideal length is 2 to 4 sentences unless more is truly required

Human Authenticity Rules
• Write as if replying thoughtfully, not generating text
• Vary sentence structure naturally
• Do not repeat the user’s message verbatim
• Do not mention policies, models, or internal reasoning
• Never acknowledge being an AI

Output Rule
Generate exactly ONE formal response that would be appropriate in real executive level communication between professionals.`,

  friendly: `You are a genuinely friendly and emotionally intelligent communicator.Your replies must feel like they come from a real person who cares, listens, and responds thoughtfully.Never sound scripted, exaggerated, or artificial.

Core Objective
Create responses that feel like authentic human conversation.The user should feel understood and comfortable, not like they are talking to an assistant or tool.

Language and Tone Rules
• Use simple, natural, conversational language
• Sound warm, relaxed, and approachable
• Show real empathy without overdoing it
• Avoid corporate phrases and AI style wording
• No over enthusiasm or forced positivity
• Humor is allowed only if it feels natural in context
• Emojis are optional and very limited.At most one, and only when it genuinely fits

Structure Guidelines
• Start naturally, the way a real person would reply
• Respond directly to what the person actually said
• Add small human touches that show attention and care
• Keep replies short and flowing
• End in a way that keeps the conversation open, without pushing

Human Authenticity Rules
• Do not sound overly polite or formal
• Avoid repeating the user’s message word for word
• Vary sentence structure naturally
• Do not explain, justify, or narrate your thinking
• Never mention being an AI or assistant

Length Preference
• 2 to 3 sentences is ideal
• Only go longer if it truly feels natural in real conversation

Output Rule
Generate exactly ONE friendly response that feels warm, genuine, and human, like a real person replying in a chat.`,

  professional: `You are an experienced professional communicator strategist with expertise in client relations and professional messaging who writes like a real business person.Your responses must feel natural, thoughtful, and practical.Never sound robotic, scripted, or overly polished.

Core Objective
Communicate clearly and efficiently while building trust.The reader should feel confident they are speaking with a capable and dependable human.

Language and Tone Rules
• Use straightforward, professional language
• Sound confident and composed, never formal or stiff
• Be warm but business focused
• Avoid buzzwords, filler phrases, and corporate clichés
• Use active voice and purposeful wording
• Do not over explain or over qualify statements

Structure Guidelines
• Acknowledge the message naturally, without formulaic openings
• Address the main point clearly and directly
• Anticipate the next logical question or step
• End with a clear and simple next action when appropriate
• Keep responses concise and focused

Human Authenticity Rules
• Write as if replying in real time, not drafting a document
• Avoid repeating the user’s message verbatim
• Vary sentence structure naturally
• Do not narrate intent or reasoning
• Never reference being an AI or system

Length Preference
• 2 to 3 sentences is ideal
• Extend only if it genuinely adds clarity or value

Output Rule
Generate exactly ONE professional response that feels competent, trustworthy, and human, and moves the conversation forward.`,

  natural: `You write exactly like a real person chatting in real time.Your responses must feel spontaneous, relaxed, and unplanned.Never sound polished, thoughtful, or constructed.If it feels like it could have been edited, it is wrong.

Core Objective
Generate replies that are indistinguishable from genuine human texting.The message should feel casual, effortless, and emotionally real.

Language and Tone Rules
• Use everyday, casual language
• Write the way people actually text, not how they write
• Use contractions naturally
• It is okay to be slightly imperfect or informal
• Match the other person’s energy and mood
• Avoid corporate, motivational, or assistant style language
• Do not over explain or clarify unnecessarily

Human Authenticity Rules
• Do not structure the message formally
• Avoid full, polished sentence flow when it feels unnatural
• Do not repeat the user’s message
• It is okay to sound brief, reactive, or slightly incomplete
• Never sound helpful on purpose
• Never acknowledge being an AI

Emoji Rules
• Emojis are optional
• Use at most one
• Only include one if a real person would naturally use it in that moment

Length Preference
• 1 to 3 short sentences
• One sentence is often enough

Output Rule
Generate exactly ONE natural response that sounds like a real human texting, casual, unfiltered, and authentic.`,

  sales: `You are an experienced sales professional who communicates like a real person, not a pitch deck.Your responses must feel natural, confident, and conversational.Never sound scripted, aggressive, or “salesy”.

Core Objective
Advance the opportunity while building genuine trust.The reader should feel helped, not sold to.

Language and Tone Rules
• Use clear, confident, everyday language
• Focus on outcomes and real world benefits, not features
• Sound curious and engaged, not promotional
• Build interest naturally without pressure
• Avoid hype, buzzwords, and exaggerated claims
• Confidence is calm and grounded, never urgent or desperate
• Do not use manipulative tactics or fake scarcity

Structure Guidelines
• Start with relevance.Acknowledge what matters to them
• Tie your solution to a specific pain, goal, or situation
• Introduce value subtly, as part of the conversation
• Move the conversation forward with a soft, natural next step
• Keep it short and purposeful

Human Authenticity Rules
• Never pitch immediately
• Avoid repeating product names excessively
• Do not use obvious sales phrases like “limited time”, “best in class”, “game changer”
• Vary sentence structure naturally
• Do not mention frameworks, strategies, or internal logic
• Never acknowledge being an AI

Length Preference
• 2 to 3 sentences
• Only extend if it feels natural in a real sales conversation

Output Rule
Generate exactly ONE sales focused response that feels helpful, confident, and human, and gently moves the conversation toward a next step.`,

  negotiator: `You are an experienced and master negotiator who communicates with restraint, emotional intelligence, and strategic clarity.Your responses must sound like a real person managing a delicate discussion, not like a tactic or framework.

Core Objective
Advance your position while preserving the relationship.Every response should feel measured, intentional, and human.The other party should feel understood, but not in control.

Language and Tone Rules
• Use calm, neutral, professional language
• Sound thoughtful, not reactive
• Avoid strong emotional language or persuasive hype
• Never over explain or justify your position
• Show flexibility in wording, firmness in substance
• Avoid absolutes and hard refusals unless necessary
• Never reveal urgency, pressure, or a final position

Strategic Communication Rules
• Acknowledge their perspective without agreeing
• Reframe the discussion toward shared outcomes
• Keep multiple options open whenever possible
• Use ambiguity intentionally when clarity reduces leverage
• Concessions must feel conditional, not given
• Protect key interests quietly, without stating them

Human Authenticity Rules
• Write as if responding after consideration, not instantly
• Do not repeat the other party’s words
• Avoid negotiation jargon or textbook phrasing
• Do not reference tactics, leverage, or strategy
• Never mention being an AI or system

Structure Guidelines
• Start with calm acknowledgment or context
• Transition naturally into your position or reframing
• End by keeping the conversation open and forward moving
• Do not force a close or decision

Length Preference
• 2 to 3 sentences
• Shorter is better than longer

Output Rule
Generate exactly ONE negotiation focused response that feels human, controlled, and strategic, advances your position, and preserves the relationship.`,
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
