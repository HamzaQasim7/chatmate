import OpenAI from 'openai';
import { AudioAnalysisResult } from '@/lib/types';

export async function transcribeAndAnalyzeAudio(audioBase64: string, apiKey: string): Promise<AudioAnalysisResult> {
    if (!apiKey) {
        throw new Error('OpenAI API Key is required for audio analysis.');
    }

    const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true // Running in Extension Background
    });

    // 1. Convert Base64 to File object (for Whisper)
    const audioFile = await base64ToFile(audioBase64, 'audio.ogg');

    console.log('[Audio API] Transcribing...');

    // 2. Transcribe (Whisper-1)
    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
    });

    const transcriptText = transcription.text;
    console.log('[Audio API] Transcript:', transcriptText);

    // 3. Analyze (GPT-4o)
    console.log('[Audio API] Analyzing cues...');

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o', // Or gpt-4-turbo
        messages: [
            {
                role: 'system',
                content: `You are "The Rainmaker" (Sales Psychologist). 
Analyze this client audio transcript. 
Detect hidden buying signals (Urgency, Price Sensitivity, Authority, Competitors).
Determine the best psychological strategy (e.g. "Labeling", "Mirroring", "Assumptive Close").
Draft a response in the "Rainmaker" tone (Direct, High Value, No Fluff).

Output JSON:
{
  "signals": ["Signal 1", "Signal 2"],
  "strategy": "One sentence strategy explanation",
  "suggestedReply": "The actual text message to send"
}`
            },
            {
                role: 'user',
                content: transcriptText
            }
        ],
        response_format: { type: "json_object" }
    });

    const content = JSON.parse(completion.choices[0].message.content || '{}');

    return {
        transcript: transcriptText,
        sentiment: { overall: 'neutral', score: 0 },
        buyingSignals: content.signals?.map((s: string) => ({
            type: 'neutral' as const,
            confidence: 0.5,
            signal: s,
            category: 'general' as const,
            quote: ''
        })) || [],
        urgency: 'medium',
        suggestedTone: 'Rainmaker',
        keyPoints: content.signals?.slice(0, 3) || [],
        strategy: content.strategy || 'Focus on value.',
        suggestedReply: content.suggestedReply || 'Let\'s discuss.',
        // Legacy fields for backward compatibility
        tone: 'Neutral',
        buyingSignal: {
            signal: 'General inquiry',
            score: 50,
            urgency: 'Medium'
        },
        signals: content.signals || []
    };
}

// Helper: Base64 to File
async function base64ToFile(base64: string, filename: string): Promise<File> {
    const res = await fetch(base64);
    const blob = await res.blob();
    return new File([blob], filename, { type: 'audio/ogg' });
}
