// @ts-nocheck
// Setup: npm i -g supabase
// Deploy: supabase functions deploy generate-reply --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==================== PROVIDER HANDLERS ====================

async function callOpenAI(
    model: string,
    messages: any[],
    apiKey: string
): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 300
        })
    })

    const data = await response.json()
    if (data.error) throw new Error(data.error.message || 'OpenAI API Error')
    return data.choices[0].message.content
}

async function callGemini(
    model: string,
    messages: any[],
    apiKey: string
): Promise<string> {
    // Convert OpenAI format → Gemini format
    // Gemini uses 'model' role instead of 'assistant', and system prompt goes into systemInstruction
    const systemMsg = messages.find((m: any) => m.role === 'system')
    const chatMessages = messages.filter((m: any) => m.role !== 'system')

    const contents = chatMessages.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }))

    const body: any = {
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300,
        }
    }

    // Add system instruction if present
    if (systemMsg) {
        body.systemInstruction = {
            parts: [{ text: systemMsg.content }]
        }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })

    const data = await response.json()

    if (data.error) {
        throw new Error(data.error.message || 'Gemini API Error')
    }

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Gemini returned no content')
    }

    return data.candidates[0].content.parts[0].text
}

async function callClaude(
    model: string,
    messages: any[],
    apiKey: string
): Promise<string> {
    // Claude uses a separate 'system' parameter, not in messages array
    const systemMsg = messages.find((m: any) => m.role === 'system')
    const chatMessages = messages
        .filter((m: any) => m.role !== 'system')
        .map((msg: any) => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }))

    const body: any = {
        model,
        messages: chatMessages,
        max_tokens: 300,
        temperature: 0.7,
    }

    if (systemMsg) {
        body.system = systemMsg.content
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
    })

    const data = await response.json()

    if (data.error) {
        throw new Error(data.error.message || 'Claude API Error')
    }

    if (data.type === 'error') {
        throw new Error(data.error?.message || 'Claude API Error')
    }

    if (!data.content?.[0]?.text) {
        throw new Error('Claude returned no content')
    }

    return data.content[0].text
}

// ==================== MAIN HANDLER ====================

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. AUTHENTICATION
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const {
            data: { user },
        } = await supabaseClient.auth.getUser()

        if (!user) throw new Error('Unauthorized')

        // 2. PARSE REQUEST
        const { messages, tone, prompt, model, provider: rawProvider, apiKey: rawUserApiKey } = await req.json()

        // Clean inputs
        const userApiKey = rawUserApiKey?.trim?.();
        const provider = rawProvider || 'openai';

        // 3. CHECK LIMITS (Business Logic)
        // If user provides their OWN key, they are exempt from limits.
        let usage = 0;
        let limit = 20;

        if (!userApiKey) {
            const { data: subscription } = await supabaseClient
                .from('subscriptions')
                .select('plan_id, status')
                .eq('user_id', user.id)
                .single()

            const currentMonth = new Date().toISOString().slice(0, 7) // '2026-01'

            // Count usage for this month
            const { count } = await supabaseClient
                .from('usage_logs')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .gte('created_at', `${currentMonth}-01`)

            limit = subscription?.plan_id === 'pro' ? 1000 : 20
            usage = count || 0

            if (usage >= limit) {
                return new Response(
                    JSON.stringify({ error: 'Limit exceeded', message: 'Please upgrade to Pro' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
                )
            }
        }

        // 4. AI GENERATION (Provider Router)
        let activeApiKey = userApiKey;
        let finalModel = model;

        // Construct full message history
        const fullMessages = [
            { role: "system", content: prompt || "You are a helpful assistant." },
            ...messages
        ];

        let reply: string;

        if (activeApiKey) {
            // ===== BYOK MODE: Use the user's own key =====
            console.log(`[Generate Reply] BYOK Mode — Provider: ${provider}, Model: ${finalModel}`);

            switch (provider) {
                case 'gemini':
                    reply = await callGemini(finalModel, fullMessages, activeApiKey);
                    break;
                case 'claude':
                    reply = await callClaude(finalModel, fullMessages, activeApiKey);
                    break;
                case 'openai':
                default:
                    reply = await callOpenAI(finalModel, fullMessages, activeApiKey);
                    break;
            }
        } else {
            // ===== FREE TIER: Always use server's OpenAI key =====
            console.log('[Generate Reply] Free Tier — Using SERVER OpenAI KEY');
            finalModel = 'gpt-4o-mini'; // Force cost-efficient model for free tier

            activeApiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
            if (!activeApiKey) throw new Error('Server Config Error: OPENAI_API_KEY missing');

            reply = await callOpenAI(finalModel, fullMessages, activeApiKey);
        }

        console.log('[Generate Reply] Success — Provider:', provider, 'Model:', finalModel);

        // 5. LOG USAGE
        console.log('Attempting to insert usage log for user:', user.id)
        const { error: insertError } = await supabaseClient.from('usage_logs').insert({
            user_id: user.id,
            feature_name: 'generate_response'
        })

        if (insertError) {
            console.error('Failed to insert usage log:', insertError)
        } else {
            console.log('Successfully inserted usage log')
        }

        return new Response(
            JSON.stringify({ reply, usage: usage + 1, limit }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('[Generate Reply] Error:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
