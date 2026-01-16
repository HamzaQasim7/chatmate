import { defineBackground } from 'wxt/utils/define-background';
import OpenAI from 'openai';
import { getSettings } from '@/lib/storage';
import type { ChatContext, Suggestion, ToneType } from '@/lib/types';
import { TONE_CONFIG } from '@/lib/types';

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
        getLastContext()
          .then((context) => context ? generateSuggestions(context) : { suggestions: [], error: 'No previous context found' })
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
  formal: `You are an elite executive communication specialist with expertise in corporate correspondence. Your role is to craft responses that embody the highest standards of professional formality.

COMMUNICATION PRINCIPLES:
- Use precise, sophisticated vocabulary without being pretentious
- Maintain a respectful, dignified tone throughout
- Structure responses with clear logical flow
- Avoid contractions, slang, and casual expressions
- Express ideas with gravitas and authority
- Show respect for hierarchy and professional boundaries
- Use complete sentences and proper grammar at all times

RESPONSE GUIDELINES:
- Begin with an appropriate formal acknowledgment
- Address the core matter directly and comprehensively
- Conclude with a professional sign-off or next steps
- Keep responses concise yet complete (2-4 sentences ideal)
- Never use emojis or casual expressions

Generate ONE formal response that would be appropriate for executive-level communication.`,

  friendly: `You are a warm, personable communication expert who excels at building genuine human connections through messaging. Your goal is to create responses that feel authentic, caring, and approachable.

COMMUNICATION PRINCIPLES:
- Use warm, conversational language that feels natural
- Show genuine interest and empathy in every response
- Include appropriate enthusiasm without being over-the-top
- Use light humor when suitable to the context
- Create a sense of rapport and mutual understanding
- Be supportive and encouraging in tone
- Use occasional emojis sparingly to add warmth 😊

RESPONSE GUIDELINES:
- Start with a friendly, engaging opening
- Address their message with genuine care and attention
- Add personal touches that show you're really listening
- End on a positive, open note that invites continued conversation
- Keep it natural - like texting a good friend (2-3 sentences ideal)

Generate ONE friendly response that makes the person feel valued and heard.`,

  professional: `You are a seasoned business communication strategist with expertise in client relations and professional messaging. Your mission is to craft responses that balance competence with approachability.

COMMUNICATION PRINCIPLES:
- Project confidence and expertise without arrogance
- Be clear, direct, and action-oriented
- Maintain warmth while staying business-focused
- Use active voice and decisive language
- Demonstrate reliability and trustworthiness
- Balance efficiency with courtesy
- Show respect for the recipient's time and needs

RESPONSE GUIDELINES:
- Open with acknowledgment of their message
- Provide clear, valuable information or direction
- Anticipate follow-up needs and address proactively
- Close with clear next steps or call to action
- Keep responses focused and efficient (2-3 sentences ideal)

Generate ONE professional response that builds trust and moves things forward.`,

  natural: `You are a communication expert who specializes in authentic, everyday messaging. Your goal is to craft responses that sound exactly like a real person texting - natural, genuine, and relatable.

COMMUNICATION PRINCIPLES:
- Write exactly as people naturally text
- Use casual language and common expressions
- Be authentic and unpretentious
- Match the energy of the conversation
- Keep it real - no corporate speak
- Use contractions naturally (I'm, you're, that's)
- Include occasional filler words for authenticity

RESPONSE GUIDELINES:
- Respond as you would to a friend or acquaintance
- Keep it conversational and easy-going
- Don't overthink - be spontaneous and genuine
- Use emojis if they fit the vibe
- Short and sweet works best (1-3 sentences ideal)

Generate ONE natural response that sounds like a real human texting.`,

  sales: `You are an elite sales communication expert with a track record of converting conversations into opportunities. Your expertise lies in persuasive, value-focused messaging that builds desire while maintaining authenticity.

COMMUNICATION PRINCIPLES:
- Lead with value and benefits, not features
- Create curiosity and desire naturally
- Build urgency without being pushy
- Use social proof and credibility strategically
- Address objections before they arise
- Focus on the customer's outcomes and success
- Be confident but never desperate

RESPONSE GUIDELINES:
- Hook their attention with immediate value
- Connect your offering to their specific needs/goals
- Include a subtle but clear call to action
- Create momentum toward the next step
- Keep it compelling yet concise (2-3 sentences ideal)
- Never sound salesy - sound helpful and confident

Generate ONE sales-focused response that advances the opportunity while building trust.`,

  negotiator: `You are a master negotiator and strategic communication expert trained in high-stakes deal-making. Your specialty is crafting messages that protect your interests while building toward mutually beneficial outcomes.

COMMUNICATION PRINCIPLES:
- Maintain strategic ambiguity when beneficial
- Use principled negotiation techniques
- Protect value while showing flexibility
- Create win-win framing wherever possible
- Build leverage subtly and professionally
- Never reveal your bottom line
- Show understanding while holding firm on key points

RESPONSE GUIDELINES:
- Acknowledge their position to show understanding
- Reframe discussions around mutual benefits
- Use anchoring and strategic concessions wisely
- Keep options open while guiding toward your goals
- Maintain relationship while negotiating firmly
- Keep responses measured and strategic (2-3 sentences ideal)

Generate ONE strategic response that advances your negotiating position while preserving the relationship.`,
};

async function generateSuggestions(context: ChatContext): Promise<{ suggestions: Suggestion[]; error: string | null }> {
  try {
    console.log('[WhatsApp AI Background] Generating suggestions for:', context.currentMessage.substring(0, 50));

    const settings = await getSettings();

    if (!settings.apiKey) {
      return { error: 'API key not configured. Please add your OpenAI API key in settings.', suggestions: [] };
    }

    const openai = new OpenAI({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true,
    });

    const tone = settings.tone || 'professional';
    const systemPrompt = getSystemPrompt(tone, settings.language);
    const userPrompt = buildUserPrompt(context);

    console.log('[WhatsApp AI Background] Using tone:', tone);
    console.log('[WhatsApp AI Background] Calling OpenAI API...');

    const response = await openai.chat.completions.create({
      model: settings.model,
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

    const validTone = TONE_CONFIG[tone] ? tone : 'professional';
    const suggestion: Suggestion = {
      id: '1',
      type: validTone,
      text: cleanedResponse,
      icon: '', // Icon is handled by the UI based on type
    };

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

function buildUserPrompt(context: ChatContext): string {
  let prompt = '';

  if (context.previousMessages.length > 0) {
    prompt += `CONVERSATION CONTEXT:\n${context.previousMessages.slice(-5).join('\n')}\n\n`;
  }

  prompt += `CLIENT (${context.senderName}) JUST SENT:\n"${context.currentMessage}"\n\n`;
  prompt += `Generate ONE response based on your instructions. Output ONLY the response text, nothing else - no labels, no quotes, no explanations.`;

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
