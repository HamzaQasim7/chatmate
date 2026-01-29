// @ts-nocheck
// Deploy: supabase functions deploy analyze-audio --no-verify-jwt

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

        // 2. PARSE REQUEST
        const { audioBase64, apiKey: rawUserApiKey } = await req.json()

        if (!audioBase64) throw new Error('No audio data provided')

        // Clean the user key (trim whitespace)
        const userApiKey = rawUserApiKey?.trim?.();

        // 3. DETERMINE API KEY
        let apiKey = userApiKey;

        if (!apiKey) {
            // FREE TIER (Server Key)
            console.log('[Analyze Audio] Using SERVER KEY (Free Tier)');
            apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
            if (!apiKey) throw new Error('Server Config Error: OPENAI_API_KEY missing');
        } else {
            console.log('[Analyze Audio] Using USER KEY');
        }

        // 4. TRANSCRIBE AUDIO (Whisper)
        // Convert Base64 to Blob for FormData
        const base64Data = audioBase64.split(',')[1] || audioBase64;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: 'audio/ogg' });

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.ogg');
        formData.append('model', 'whisper-1');

        console.log('[Analyze Audio] Transcribing...');
        const transcribeResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        const transcribeData = await transcribeResponse.json();
        if (transcribeData.error) {
            throw new Error(transcribeData.error.message || 'Transcription failed');
        }

        const transcript = transcribeData.text;
        console.log('[Analyze Audio] Transcript:', transcript.substring(0, 50) + '...');

        // 5. ANALYZE TRANSCRIPT (GPT-4o-mini) - ENHANCED PROMPT
        const systemPrompt = `You are an expert sales analyst specializing in identifying buying signals from audio transcriptions.

Analyze the transcribed audio message for:
1. **Buying Signals**: Identify positive, negative, neutral signals and objections
2. **Signal Categories**: price, timing, authority, need, competition, general
3. **Sentiment**: overall emotional tone and confidence score (-1 to 1)
4. **Urgency Level**: high, medium, or low
5. **Key Points**: extract 3-5 most important points
6. **Suggested Tone**: which tone would work best (Rainmaker|Sales|Negotiator|Professional|Friendly|Formal|Natural)
7. **Recommended Response**: draft a strategic reply addressing the key signals

Return a JSON object with this EXACT structure:
{
  "sentiment": {"overall": "positive|negative|neutral", "score": -1 to 1},
  "buyingSignals": [
    {"type": "positive|negative|neutral|objection", "confidence": 0-1, "signal": "description", "category": "price|timing|authority|need|competition|general", "quote": "exact quote from transcript"}
  ],
  "urgency": "high|medium|low",
  "suggestedTone": "Rainmaker",
  "keyPoints": ["point1", "point2", "point3"],
  "strategy": "one-line negotiation strategy",
  "suggestedReply": "strategic reply text"
}`;

        console.log('[Analyze Audio] Analyzing with enhanced prompt...');
        const analyzeResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                response_format: { type: "json_object" },
                temperature: 0.3,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Analyze this audio transcription for buying signals:\n\n"${transcript}"` }
                ]
            })
        });

        const analyzeData = await analyzeResponse.json();
        if (analyzeData.error) {
            throw new Error(analyzeData.error.message || 'Analysis failed');
        }

        const content = JSON.parse(analyzeData.choices[0].message.content);

        // 6. LOG USAGE
        console.log('[Analyze Audio] Logging usage for user:', user.id);
        await supabaseClient.from('usage_logs').insert({
            user_id: user.id,
            feature_name: 'analyze_audio'
        });

        // 7. RETURN ENHANCED RESULT
        return new Response(
            JSON.stringify({
                transcript,
                sentiment: content.sentiment || { overall: 'neutral', score: 0 },
                buyingSignals: content.buyingSignals || [],
                urgency: content.urgency || 'medium',
                suggestedTone: content.suggestedTone || 'Rainmaker',
                keyPoints: content.keyPoints || [],
                strategy: content.strategy || 'Focus on value.',
                suggestedReply: content.suggestedReply || 'Let\'s discuss.',
                // Legacy fields for backward compatibility
                tone: content.sentiment?.overall || 'Neutral',
                buyingSignal: content.buyingSignals?.[0] ? {
                    signal: content.buyingSignals[0].signal,
                    score: Math.round(content.buyingSignals[0].confidence * 100),
                    urgency: content.urgency || 'Medium'
                } : { signal: 'General inquiry', score: 50, urgency: 'Medium' },
                signals: content.buyingSignals?.map((s: any) => s.signal) || []
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('[Analyze Audio] Error:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
