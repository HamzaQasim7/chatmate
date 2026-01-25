// @ts-nocheck
// Setup: npm i -g supabase
// Deploy: supabase functions deploy generate-reply --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

        // 2. PARSE REQUEST (Moved up to access apiKey)
        const { messages, tone, prompt, model, apiKey: rawUserApiKey } = await req.json()

        // Clean the user key (trim whitespace)
        const userApiKey = rawUserApiKey?.trim?.();

        // 3. CHECK LIMITS (The Business Logic)
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

        // 4. AI GENERATION (OpenAI)
        let apiKey = userApiKey;
        let finalModel = model;

        if (apiKey) {
            // PRO TIER (User Key)
            console.log('[Generate Reply] Using USER KEY');
            const allowedModels = ['gpt-5-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'];
            finalModel = allowedModels.includes(model) ? model : 'gpt-4.1-mini';
        } else {
            // FREE TIER (Server Key)
            console.log('[Generate Reply] Using SERVER KEY (Free Tier)');
            finalModel = 'gpt-4o-mini';

            apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
            if (!apiKey) throw new Error('Server Config Error: OPENAI_API_KEY missing');
        }

        console.log('[Generate Reply] Final Model:', finalModel);
        if (apiKey) console.log('[Generate Reply] Key Prefix:', apiKey.substring(0, 10) + '...');


        // Construct full message history for OpenAI
        const fullMessages = [
            { role: "system", content: prompt || "You are a helpful assistant." },
            ...messages
        ];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: finalModel,
                messages: fullMessages,
                temperature: 0.7,
                max_tokens: 300
            })
        })

        const data = await response.json()

        if (data.error) {
            throw new Error(data.error.message || 'OpenAI API Error')
        }

        const reply = data.choices[0].message.content

        // 4. LOG USAGE
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
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
