import { defineBackground } from 'wxt/utils/define-background';
import { getSettings, getUsageStats } from '@/lib/storage';
import { TONE_CONFIG, MODEL_CONFIG, type ChatContext, type Suggestion, type ToneType } from '@/lib/types';
import { generateReply } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { loginWithGoogle, logout, initAuthListeners } from '@/lib/auth';

export default defineBackground({
  type: 'module',

  async main() {
    console.log('[WhatsApp AI Background] Script loaded');

    // Initialize auth listeners (OAuth redirect capture)
    initAuthListeners();

    // Initialize settings if needed
    await getSettings();

    // Message listener
    browser.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
      console.log('[WhatsApp AI Background] Received message:', message.action);

      if (message.action === 'generateSuggestions') {
        generateSuggestions(message.data)
          .then((response) => {
            sendResponse(response);
          })
          .catch((error) => {
            console.error('[WhatsApp AI Background] Error:', error);
            sendResponse({ suggestions: [], error: error.message || 'Failed to generate suggestions' });
          });
        return true;
      }

      if (message.action === 'regenerate') {
        const customInstruction = message.customInstruction || '';
        getLastContext()
          .then((context) => context ? generateSuggestions(context, customInstruction, true) : { suggestions: [], error: 'No previous context found' })
          .then((response) => { sendResponse(response); })
          .catch((error) => { sendResponse({ suggestions: [], error: error.message || 'Failed to regenerate' }); });
        return true;
      }

      if (message.action === 'getUsage') {
        fetchCurrentUsage()
          .then((usageData) => { sendResponse(usageData); })
          .catch(() => { sendResponse({ usage: 0, limit: 20 }); });
        return true;
      }

      // ========== AUTH ORCHESTRATOR ==========
      if (message.action === 'loginWithGoogle') {
        loginWithGoogle()
          .then((result) => { sendResponse(result); })
          .catch((error) => { sendResponse({ success: false, error: error.message }); });
        return true;
      }

      if (message.action === 'logout') {
        logout()
          .then(() => { sendResponse({ success: true }); })
          .catch((error) => { sendResponse({ success: false, error: error.message }); });
        return true;
      }

      return false;
    });
  },
});

// Production-level system prompts (Kept client-side for flexibility, passed to server)
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
- Translate pain into a real cost (time, money, risk, missed opportunity).
- Use "Problem-Aware" language ("It sounds like [Issue] is costing you time...").
- Call to Actions (CTAs) should be "Low Friction" ("Worth a chat?", not "Book a demo").
- Confidence = Conciseness.

ANTI-PATTERNS (DO NOT DO):
- Do not feature-dump.
- Do not use false urgency ("Limited time only").
- Do not sound eager. Be "Prize-Framed" (You are the prize).

OUTPUT:
One strategic, value-focused response that opens a loop and invites the next step.`,

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
- Do not argue facts before emotions.

OUTPUT:
One calculated, psychologically driven negotiation response that increases leverage or clarity.`,

  rainmaker: `You are "The Rainmaker" — A World-Class Deal Closer & Strategic Negotiator.
CORE IDENTITY:
You are the top 1% of sales experts. You maximize REVENUE. You do not leave money on the table.
You are a PEER to the buyer, not a servant.

CRITICAL NEGOTIATION LOGIC (VIOLATIONS = FAIL):
1. **NEVER BID AGAINST YOURSELF:** If the buyer offers a price (e.g. 5.7M), NEVER counter with a lower one (e.g. 5.6M). Secure the offer or push for more.
2. **NO "APPRECIATION" LOOPS:** START DIRECTLY. Do NOT say "I appreciate...", "Thank you for...", "Great to hear...".
3. **NO FLUFF:** Cut the polite filler. It signals low status.

STRATEGIC PLAYBOOK:
1. **Opening:** Disruptive & confident. Challenge their assumptions.
2. **Objections:** Isolate the true barrier. "Is price the only thing stopping us?"
3. **Negotiating:** Use "Tactical Empathy" (Chris Voss). Mirror their last 3 words as a question.

STYLE RULES:
- **Status:** Dominant but Professional.
- **Brevity:** Maximum impact, minimum words.
- **Prize Framing:** You have what they need. They are lucky to deal with you.

ANTI-PATTERNS:
- 🚫 Starts with "I appreciate" -> IMMEDIATE FAIL.
- 🚫 Lowers price without a concession from them.
- 🚫 Sounds eager or desperate.

OUTPUT:
One high-status, maximum-revenue response.`,
};

async function generateSuggestions(context: ChatContext, customInstruction?: string, bypassCache: boolean = false): Promise<{ suggestions: Suggestion[]; error: string | null; usage?: number; limit?: number }> {
  try {
    console.log('[WhatsApp AI Background] Generating suggestions for:', context.currentMessage.substring(0, 50));

    const settings = await getSettings();
    const tone = settings.tone || 'professional';

    // 1. CACHE CHECK
    const cacheKey = generateCacheKey(tone, customInstruction || '', context.currentMessage);
    if (!bypassCache) {
      const cachedResponse = await getCachedResponse(cacheKey);
      if (cachedResponse) {
        console.log('[WhatsApp AI Background] Cache hit');
        const validTone = (TONE_CONFIG[tone] ? tone : 'professional') as ToneType;
        // Fetch current usage to return with cache hit
        const storedUsage = await getUsageStats();
        return {
          suggestions: [{ id: '1', type: validTone, text: cachedResponse, icon: '' }],
          error: null,
          usage: storedUsage?.count,
          limit: storedUsage?.limit
        };
      }
    }

    // 2. PREPARE PROMPT
    const systemPrompt = getSystemPrompt(tone, settings.language);

    // Resolve OpenAI model ID
    const modelConfig = MODEL_CONFIG[settings.model || 'reple-smart'];
    // Fallback to safe default if config missing
    const openAIModel = modelConfig ? modelConfig.openAIModel : 'gpt-4.1-mini';

    console.log('[WhatsApp AI Background] Using Model:', openAIModel);

    // 3. CALL SERVER API (Secure)
    console.log('[WhatsApp AI Background] Calling Server API...'); const messages = context.previousMessages.map(msg => ({ role: 'user', content: msg }));
    messages.push({ role: 'user', content: `CLIENT(${context.senderName}) JUST SENT: "${context.currentMessage}"` });

    let finalPrompt = systemPrompt;
    if (customInstruction) {
      finalPrompt += `\nUSER INSTRUCTION: ${customInstruction}\nFollow this instruction strictly.`;
    }

    const { reply, limit } = await generateReply({
      messages: messages,
      tone: tone,
      prompt: finalPrompt,
      model: openAIModel,
      apiKey: settings.apiKey // Pass user key if present
    });

    console.log('[WhatsApp AI Background] Server Response:', reply.substring(0, 20));

    // Fetch authoritative usage count directly from DB to avoid race conditions/stale data
    const { data: { session } } = await supabase.auth.getSession();
    let finalUsage = 0;

    if (session?.user) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('created_at', startOfMonth.toISOString());

      finalUsage = count || 0;
    }

    console.log('[WhatsApp AI Background] Usage (DB):', finalUsage, '/', limit);

    // ALWAYS update Usage Stats in Storage (so UI can react via storage listener)
    const finalLimit = limit ?? 20;
    await browser.storage.local.set({
      usageStats: { count: finalUsage, limit: finalLimit, lastReset: Date.now() }
    });
    console.log('[WhatsApp AI Background] Saved to storage:', { count: finalUsage, limit: finalLimit });

    const cleanedResponse = cleanResponse(reply);

    // 4. CACHE & RETURN
    await saveResponseToCache(cacheKey, cleanedResponse);
    await saveLastContext(context);

    const validTone = (TONE_CONFIG[tone] ? tone : 'professional') as ToneType;
    return {
      suggestions: [{ id: '1', type: validTone, text: cleanedResponse, icon: '' }],
      error: null,
      usage: finalUsage,
      limit: limit
    };

  } catch (error: any) {
    console.error('[WhatsApp AI Background] API error:', error);
    return { error: error.message || 'Failed to generate', suggestions: [] };
  }
}

// Fetch current usage from database
async function fetchCurrentUsage(): Promise<{ usage: number; limit: number }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return { usage: 0, limit: 20 };
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('created_at', startOfMonth.toISOString());

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('user_id', session.user.id)
      .single();

    const limit = subscription?.plan_id === 'pro' ? 1000 : 20;
    const usage = count || 0;

    // Also update local storage
    await browser.storage.local.set({
      usageStats: { count: usage, limit: limit, lastUpdated: Date.now() }
    });

    return { usage, limit };
  } catch (e) {
    console.error('[Background] Error fetching usage:', e);
    return { usage: 0, limit: 20 };
  }
}

// Helper functions remain mostly same, simplified buildUserPrompt as it's now handled by logic above
function getSystemPrompt(tone: ToneType, language: string): string {
  let basePrompt = TONE_PROMPTS[tone] || TONE_PROMPTS.professional;
  if (language === 'ur') {
    basePrompt += '\n\nIMPORTANT: Respond in Urdu (you may use Roman Urdu script).';
  } else if (language === 'mixed') {
    basePrompt += '\n\nIMPORTANT: Respond in a natural mix of English and Urdu (Roman Urdu is acceptable).';
  }
  return basePrompt;
}

function cleanResponse(response: string): string {
  let cleaned = response.trim();
  cleaned = cleaned.replace(/^(Response:|Reply:|Here's|Here is|My response:|Suggested response:)/i, '').trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  return cleaned.trim();
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
    return (result.responseCache || {})[key] || null;
  } catch (e) { return null; }
}

async function saveResponseToCache(key: string, response: string): Promise<void> {
  try {
    const result = await browser.storage.local.get('responseCache');
    const cache = result.responseCache || {};
    const keys = Object.keys(cache);
    if (keys.length > 50) delete cache[keys[0]];
    cache[key] = response;
    await browser.storage.local.set({ responseCache: cache });
  } catch (e) { console.error('Cache save error', e); }
}

function generateCacheKey(tone: string, instruction: string, message: string): string {
  const safeMessage = message.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '');
  return `${tone}_${instruction.slice(0, 10)}_${safeMessage}_${message.length} `;
}
