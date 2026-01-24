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

        // 2. CHECK LIMITS (The Business Logic)
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

        const limit = subscription?.plan_id === 'pro' ? 1000 : 20
        const usage = count || 0

        if (usage >= limit) {
            return new Response(
                JSON.stringify({ error: 'Limit exceeded', message: 'Please upgrade to Pro' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
            )
        }

        // 3. AI GENERATION (OpenAI)
        const { messages, tone, prompt } = await req.json()
        const apiKey = Deno.env.get('OPENAI_API_KEY')
        if (!apiKey) throw new Error('Server Config Error: OPENAI_API_KEY missing')

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
                model: 'gpt-4o-mini', // Cost-effective default
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
