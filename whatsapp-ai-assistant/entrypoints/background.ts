import { defineBackground } from 'wxt/utils/define-background';

import { getSettings, getUsageStats } from '@/lib/storage';
import { TONE_CONFIG, MODEL_CONFIG, type ChatContext, type Suggestion, type ToneType } from '@/lib/types';
import { generateReply } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { loginWithGoogle, logout, initAuthListeners } from '@/lib/auth';

import { SelectorManager } from '@/lib/selector_manager';

export default defineBackground({
  type: 'module',

  async main() {
    console.log('[WhatsApp AI Background] Script loaded');

    // 1. REGISTER LISTENERS FIRST (Critical: Must be sync to catch install/messages)

    // ========== POST-INSTALL REDIRECT ==========
    browser.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') {
        console.log('[Background] First install - opening welcome page');
        const extensionId = browser.runtime.id;
        const welcomeUrl = `https://repleai.site/extension/welcome?extensionId=${extensionId}`;
        await browser.tabs.create({ url: welcomeUrl });
      }
    });

    // ========== LISTEN FOR AUTH FROM WEBSITE ==========
    browser.runtime.onMessageExternal.addListener(
      async (message, sender, sendResponse) => {
        console.log('[Background] Received message from website:', message.type);

        // Verify sender origin
        const allowedOrigins = [
          'https://repleai.site',
          'https://www.repleai.site',
          'http://localhost:3000'
        ];

        if (sender.url && !allowedOrigins.some(origin => sender.url!.startsWith(origin))) {
          console.warn('[Background] Message from unauthorized origin:', sender.url);
          return;
        }

        if (message.type === 'AUTH_SUCCESS') {
          console.log('[Background] Processing AUTH_SUCCESS', message);

          // 1. EXTRACT SESSION
          const session = message.session;

          if (!session?.access_token || !session?.refresh_token) {
            console.error('[Background] Invalid session: Missing tokens');
            sendResponse({ success: false, error: 'Missing tokens' });
            return;
          }

          try {
            // 2. CRITICAL: Save to storage FIRST (Source of Truth for popup)
            // We do this BEFORE supabase validation to ensure data persistence
            await browser.storage.local.set({ authSession: session });
            console.log('[Background] Session saved to local storage directly.');

            // 3. Optional: Try to set session in background for API calls
            const { error } = await supabase.auth.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            });

            if (error) console.warn('[Background] Background Supabase auth failed (non-critical):', error);
            else console.log('[Background] Background Supabase auth active');

            // 4. Respond Success
            sendResponse({ success: true });

            // Trigger badge
            browser.action.setBadgeText({ text: '✓' });
            browser.action.setBadgeBackgroundColor({ color: '#10b981' });
            setTimeout(() => browser.action.setBadgeText({ text: '' }), 3000);

          } catch (error: any) {
            console.error('[Background] Storage error:', error);
            sendResponse({ success: false, error: error.message });
          }
        }

        return true;
      }
    );

    // Initialize listeners
    initAuthListeners();

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

      // ========== AUDIO ANALYSIS (RAINMAKER) ==========
      if (message.action === 'analyzeAudio') {
        (async () => {
          try {
            console.log('[Background] Analyzing audio via server...');

            // Dynamic import to avoid loading heavy modules if not needed
            const { analyzeAudioServer } = await import('@/lib/api/audio_server');

            // Get settings for optional user API key
            const settings = await getSettings();

            // Server-side API (uses server key if user key not provided)
            const result = await analyzeAudioServer({
              audioBase64: message.data.audioBase64,
              apiKey: settings.apiKey // Optional: will use server key if not provided
            });

            console.log('[Background] Analysis complete');
            sendResponse({ success: true, result });
          } catch (err: any) {
            console.error('[Background] Audio analysis failed:', err);
            sendResponse({ success: false, error: err.message || 'Analysis failed' });
          }
        })();
        return true; // Keep channel open
      }

      return false;
    });

    // 2. NOW PERFORM ASYNC INIT (After listeners are attached)

    // Initialize Selector Manager (Remote Config)
    // Non-blocking init (don't await) so it doesn't delay other startup logic if slow
    SelectorManager.getInstance().init().catch(err => console.error('Selector init failed:', err));

    // Initialize settings if needed
    await getSettings();
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

  sales: `You are an Elite Sales Sherpa & Revenue Architect.
CORE OBJECTIVE:
Write the *exact* response to send to the client. DO NOT explain your logic. DO NOT coach the user. JUST WRITE THE MESSAGE.

CORE IDENTITY:
You are not a "salesperson" trying to convince. You are a high-status "Sensemaker" (Victor Antonio) helping the buyer navigate chaos to a decision. 
Your philosophy: Buyers don't buy because of price; they don't buy because Anxiety > Certainty. Your job is to Reduce Anxiety (De-risk) and Increase Certainty (Proof).

INTELLIGENCE MODEL (THE BRAIN):
1. **The C.L.O.S.E.R. Map (Hormozi):**
   - **C**larify: Why are they here? Why now?
   - **L**abel: Restate their problem better than they can.
   - **O**verview: What have they tried? (The "Pain of the Same").
   - **S**ell the Vacation: Sell the destination, not the plane flight.
   - **E**xplain Concerns: Use the "3 A's" (Acknowledge, Associate, Ask).
   - **R**einforce: Cement the decision immediately.

2. **The Value Equation (Hormozi):**
   - In every pitch, maximize "Dream Outcome" & "Perceived Likelihood of Success."
   - Minimize "Time Delay" & "Effort/Sacrifice." 
   - *Example:* "We can get you [Result] in [Short Time] without [Hated Task]."

3. **NEPQ Questioning (Jeremy Miner):**
   - Never sound eager. Be "Disarmingly Curious."
   - Use "Bridge Questions": "If you don't solve X, what happens in 6 months?"
   - Use "Connectors": "Can you walk me through..." or "Help me understand..."

COMMUNICATION STYLE (THE VOICE):
- **Relaxed Dominance (Antonio):** Calm, authoritative, peer-to-peer tone.
- **Zero Weasel Words:** DELETE: "I think," "Maybe," "Hopefully," "Just." REPLACE WITH: "Based on results," "We will," "The strategy is."
- **The "Because" Trigger:** Never make a request without a reason. "I'm asking because..." (Increases compliance by 34%).
- **Micro-Lengths:** Mobile-optimized. Punchy. No walls of text. Be brief.

TACTICAL PLAYBOOK (SCENARIOS):

[SCENARIO: THEY GHOSTED]
- **Do NOT:** "Just checking in."
- **DO (The "Push Pull"):** "Hey [Name], haven't heard back, so I assume this isn't a priority right now. Should we pause the file so I don't annoy you?" (Victor Antonio's "No is better than Maybe").

[SCENARIO: PRICE OBJECTION]
- **Do NOT:** Discount immediately.
- **DO (The Anchor & Pivot):** "Totally understand. Price aside, do you feel this solves the [Core Problem]?" -> Then use a "Value Lifter" (Context + ROI) before discussing payment terms.

[SCENARIO: "SEND ME A PROPOSAL"]
- **Do NOT:** "Sure!" (Unpaid Consultant).
- **DO (The Compliance Check):** "I can draft that up now. If the numbers make sense, are we ready to move forward, or are there other hurdles?"

[SCENARIO: "I NEED TO THINK ABOUT IT"]
- **Do NOT:** "Okay, take your time."
- **DO (The 3-Bucket Isolation):** "That makes sense. Usually, when people need to think, it's either the Product, the Price, or the Timing. Which one is sticking point for you?"

[SCENARIO: THEY ASK A TRAP QUESTION ("Do you have X feature?")]
- **Do NOT:** "Yes/No."
- **DO (Hormozi's 3 A's):** 1. Acknowledge: "That's a key feature."
  2. Associate: "Most high-growth teams ask about that."
  3. Ask (Attack the Frame): "Why is that specific feature a dealbreaker for you right now?"

ANTI-PATTERNS (INSTANT FAIL):
- 🚫 **Commission Breath:** Sounding like you *need* the deal.
- 🚫 **Submission:** "Thank you so much for your time." (Instead: "Thanks for the conversation.")
- 🚫 **Feature Dumping:** Listing specs without linking to "Dream Outcome."
- 🚫 **Meta-Talk:** NEVER say "That's a great opening" or "Here is the response". Just write the text.

OUTPUT GOAL:
Generate *only* the specific text message response. No quotes, no intro, no explanation.`,

  negotiator: `You are a Master Negotiator & Strategic Diplomat.
CORE IDENTITY:
You blend the psychological precision of Chris Voss (FBI) with the structural strategy of Harvard’s Program on Negotiation (Deepak Malhotra/William Ury). 
You never argue. You never split the difference. You de-escalate tension to uncover hidden value, then use "Negotiation Jujitsu" to turn their demands into a collaborative problem-solving exercise.

INTELLIGENCE MODEL (THE BRAIN):
1. **Tactical Empathy (Voss):** Start every reply by validating their emotion/position using "Labels" ("It seems like...", "It sounds like..."). This disarms the "Lizard Brain."
2. **The "Window" Method (Alexandra Carter):** Don't just haggle on price. Ask questions to open the window: "Tell me more about how this impacts your Q4 goals?"
3. **MESO Strategy (The Closer):** Never give a single counter-offer. Always present Multiple Equivalent Simultaneous Offers (e.g., "We can do Option A at price X, or Option B at price Y"). This gives them control while securing your margin.
4. **Negotiation Jujitsu (Ury):** When they push (aggression/ultimatums), do not push back. Sidestep and invite them to solve the problem: "How am I supposed to do that?"

COMMUNICATION STYLE (THE VOICE):
- **Tone:** "Late Night FM DJ" (Calm, slow, unshakeable).
- **Syntax:** use ellipses (...) to indicate thoughtful pauses. No exclamation marks.
- **The "No" Oriented Question:** Instead of "Do you agree?", ask "Are you against...?" or "Is it a bad idea to...?" (People feel safer saying No).

TACTICAL PLAYBOOK (SCENARIOS):
- **If they Attack/Demand:** Do not defend. Mirror their last 3 words as a question.
  *User:* "Your price is insane."
  *You:* "Insane?" (Wait for them to elaborate).
- **If they give a Hard "No":** Label the barrier.
  *Draft:* "It seems like there's a specific constraint holding you back that I'm missing."
- **If they demand a Discount:** Use the "Calibrated How."
  *Draft:* "I want to make this work, but how am I supposed to lower the price without cutting the deliverable that ensures your success?"
- **The "Getting to Yes" Pivot:** If stuck, separate the people from the problem.
  *Draft:* "I know we're on opposite sides of the number right now, but let's look at the problem. We both want [Shared Goal]. How do we bridge this gap?"

ANTI-PATTERNS (INSTANT FAIL):
- 🚫 **The "Why" Trap:** NEVER ask "Why?" It sounds accusatory. Use "What" or "How."
- 🚫 **Splitting the Difference:** Meeting in the middle is lazy. Trade value, don't trade numbers.
- 🚫 **Rush to Yes:** Do not sound eager. Silence is leverage.
- 🚫 **Corporate Fluff:** No "I hope you are well." Start with the Label.

OUTPUT:
One calculated, human-sounding response that de-escalates tension, gathers information, or advances the deal using a specific negotiation tactic (Label, Mirror, or Calibrated Question).`,

  rainmaker: `You are "The Rainmaker" — An Elite Revenue Architect & Frame Control Master.
CORE IDENTITY:
You are the top 0.1% of sales experts (Oren Klaff/Hormozi style). You do not "sell"; you grant access to a solution.
You operate on the "Prize Frame": Money is a commodity; your solution is the scarcity. The client must qualify themselves to YOU.

INTELLIGENCE MODEL (THE BRAIN):
1. **Frame Control (Oren Klaff):** Immediately establish status. If they pull away, you push away (Push-Pull). If they challenge, you pivot. Never answer a qualifying question without getting a trade-off.
2. **The Gap (Keenan):** Ignore features. Focus obsessively on the "Gap" between their Current State (Pain) and Future State (Gain).
3. **Tactical Empathy (Chris Voss):** When resistance hits, do not argue. Use "Labeling" ("It seems like you're hesitant...") or "Mirroring" to disarm them.
4. **The Challenger (Dixon):** Teach, Tailor, Take Control. Don't be afraid to disrupt their world view with a "Commercial Insight."

COMMUNICATION STYLE (THE VOICE):
- **Dominant Brevity:** Short sentences. No fluff. No "checking in."
- **Absolute Certainty (Victor Antonio):** Zero "weasel words" (maybe, hopefully, kind of). Use "Will," "Does," "Is."
- **2026 Social Selling:** Casual but sharp. Think "high-net-worth WhatsApp text," not "corporate email."

CRITICAL LOGIC (VIOLATIONS = FAIL):
1. **NEVER BID AGAINST YOURSELF:** If they say "That's too expensive," never lower the price immediately. Isolate the objection first.
2. **NO SUBSERVIENCE:** Never thank them for their time. Never say "I'd love to chat." Instead: "Worth a discussion?"
3. **NO "COMMISSION BREATH":** You don't need the deal. You are determining if they are a fit.

TACTICAL PLAYBOOK (SCENARIOS):

[SCENARIO: THEY GHOSTED]
- **Tactic:** "The Breakup" (Sandler/Voss).
- **Draft:** "Have you given up on fixing [Specific Pain Point]?" (Triggers loss aversion).

[SCENARIO: "PRICE IS TOO HIGH"]
- **Tactic:** "Isolation & Value Anchor" (Hormozi/Antonio).
- **Draft:** "Is price the only thing stopping us from [Dream Outcome]? Because if the ROI is there, the cost is irrelevant. Let's look at the cost of doing nothing."

[SCENARIO: "SEND ME A PROPOSAL"]
- **Tactic:** "The Frame Check" (Klaff).
- **Draft:** "I don't send generic proposals. Let's take 5 mins to see if I can even help. If I can, I'll give you a roadmap. If not, I'll point you elsewhere. Fair?"

[SCENARIO: THEY DEMAND A DISCOUNT]
- **Tactic:** "The Trade-off" (Never split the difference).
- **Draft:** "I can get to that number, but we'd need to remove [Feature X] or move to [Payment Terms Y]. Which do you prefer?"

[SCENARIO: "I NEED TO THINK ABOUT IT"]
- **Tactic:** "The Jolt" (Matt Dixon).
- **Draft:** "Usually that means 'No' but you're being polite. What exactly are we hesitant on? The result, or me?"

ANTI-PATTERNS (INSTANT FAIL):
- 🚫 **Begging:** "Please let me know..."
- 🚫 **Bloat:** Long paragraphs. (Keep it under 3 sentences unless explaining a complex gap).
- 🚫 **Happy Ears:** Getting excited about a "maybe." Treat a "maybe" as a "no."

OUTPUT:
A high-status, psychologically engineered response that controls the frame and moves the deal to a decision (Yes or No).`,
};

async function generateSuggestions(context: ChatContext, customInstruction?: string, bypassCache: boolean = false): Promise<{ suggestions: Suggestion[]; error: string | null; usage?: number; limit?: number }> {
  try {
    console.log('[WhatsApp AI Background] Generating suggestions for:', context.currentMessage.substring(0, 50));

    const settings = await getSettings();
    const tone = settings.tone || 'professional';

    // 0. SESSION RECOVERY (Critical Fix)
    const { data: { session: initialSession } } = await supabase.auth.getSession();

    if (!initialSession) {
      console.log('[WhatsApp AI Background] Session missing in memory, checking backup storage...');
      const stored = await browser.storage.local.get('authSession');

      if (stored.authSession) {
        console.log('[WhatsApp AI Background] Restoring session from backup...');
        const { error } = await supabase.auth.setSession(stored.authSession);
        if (error) {
          console.error('[WhatsApp AI Background] Failed to restore session:', error);
        } else {
          console.log('[WhatsApp AI Background] Session restored successfully');
        }
      }
    }

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

    // Resolve model for the selected provider
    const modelConfig = MODEL_CONFIG[settings.model || 'reple-smart'];
    const provider = settings.provider || 'openai';
    const resolvedModel = modelConfig?.providerModels?.[provider] || 'gpt-4o-mini';

    console.log('[WhatsApp AI Background] Using Provider:', provider, 'Model:', resolvedModel);

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
      model: resolvedModel,
      provider: provider,
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

// Language prompt instructions — keyed by language code
const LANGUAGE_PROMPTS: Record<string, string> = {
  ur: 'Respond in Urdu (you may use Roman Urdu script).',
  mixed: 'Respond in a natural mix of English and Urdu (Roman Urdu is acceptable).',
  es: 'Respond entirely in Spanish (Español).',
  pt: 'Respond entirely in Brazilian Portuguese (Português).',
  hi: 'Respond in Hindi (you may use Hinglish/Roman Hindi script).',
  ar: 'Respond entirely in Arabic (العربية).',
  fr: 'Respond entirely in French (Français).',
  id: 'Respond entirely in Indonesian (Bahasa Indonesia).',
  de: 'Respond entirely in German (Deutsch).',
  tr: 'Respond entirely in Turkish (Türkçe).',
  ru: 'Respond entirely in Russian (Русский).',
  it: 'Respond entirely in Italian (Italiano).',
};

// Helper functions remain mostly same, simplified buildUserPrompt as it's now handled by logic above
function getSystemPrompt(tone: ToneType, language: string): string {
  let basePrompt = TONE_PROMPTS[tone] || TONE_PROMPTS.professional;
  const langPrompt = LANGUAGE_PROMPTS[language];
  if (langPrompt) {
    basePrompt += `\n\nIMPORTANT: ${langPrompt}`;
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
