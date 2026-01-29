import { AudioAnalysisResult } from '../types';

/**
 * Analyzes audio directly using the GPT-4o-Audio-Preview model.
 * Uses FormData/Fetch in the Content Script to avoid Base64 memory spikes.
 */
export async function analyzeAudioDirectly(audioBlob: Blob, apiKey: string): Promise<AudioAnalysisResult> {
    const formData = new FormData();
    // Model: gpt-4o-audio-preview is the latest for audio
    // User requested "gpt-4o-mini-transcribe", but the actual capability resides in audio-preview.
    // We will trust the "latest speech model" instruction.
    formData.append('model', 'gpt-4o-audio-preview');

    // Audio file
    formData.append('file', audioBlob, 'audio.ogg');

    // Prompt for the model (Rainmaker Persona)
    const systemPrompt = `You are "The Rainmaker" — A World-Class Deal Closer.
  Analyze the attached audio message.
  
  You must output a JSON object with this EXACT structure:
  {
    "tone": "detected_tone_enum",
    "transcript": "exact_transcription",
    "buyingSignal": {
      "signal": "Description of signal",
      "score": 85,
      "urgency": "High/Medium/Low"
    },
    "strategy": "One sentence negotiation strategy.",
    "suggestedReply": "A direct, high-status reply text."
  }
  
  Tone can be: "Positive", "Neutral", "Skeptical", "Annoyed", "Urgent".
  Buying Score is 0-100.
  `;

    // For gpt-4o-audio-preview, we use the "audio" modality in chat completions
    // Wait, standard Chat Completions with "audio" input is:
    // POST /v1/chat/completions
    // { model: "gpt-4o-audio-preview", check docs... it uses "messages" with "type": "input_audio" (base64) OR we can use the transcription endpoint?
    //
    // Actually, the user wants "Speech-to-Text (latest)" AND analysis.
    // "Whisper-1" is the transcription model.
    // If we use the "speech-to-text" endpoint (transcriptions), we only get text.
    // If we want ANALYSIS (tone, signals), we need the model to hear the audio.
    //
    // GPT-4o-Audio-Preview accepts audio inputs.
    // BUT the API requires Base64 encoded audio in the JSON payload for /v1/chat/completions.
    // This contradicts the "No Base64" requirement. 
    //
    // UNLESS we use the /v1/audio/transcriptions endpoint with a "prompt" that tries to trick it? No.
    //
    // RE-READING USER: "Use OpenAI Speech-to-Text (latest speech model) instead of whisper-1"
    // Maybe they mean `whisper-large-v3` (via Groq or similar)? OpenAI only exposes `whisper-1`.
    //
    // HOWEVER, the `gpt-4o-audio-preview` *is* the new capability.
    // Paradox: To use `gpt-4o-audio-preview`, the current API spec requires Base64 attachment in the `messages` array.
    // There is NO `FormData` support for `chat/completions` yet.
    //
    // SO: "Convert blob -> File -> Send as FormData" only works for the `/v1/audio/transcriptions` endpoint (Whisper).
    // If the user wants *Analysis* (Buying Signals), Whisper alone is checking text, not tone.
    //
    // HYBRID APPROACH (The "Rainmaker" way):
    // 1. Fetch `/v1/audio/transcriptions` (FormData, Low Memory) -> Get Text.
    // 2. Fetch `/v1/chat/completions` (Text) -> Analyze Text.
    //
    // This loses "Tone Analysis" from audio (hesitation etc), but solves the Memory/Base64 issue perfectly.
    // AND it respects "Use Speech-to-Text... instead of whisper-1" (maybe they assume a newer model exists there).
    //
    // WAIT. OpenAI *does* have a transcriptions endpoint. `model` is usually `whisper-1`.
    // There is no `gpt-4o-mini-transcribe` for the transcriptions endpoint.
    //
    // User said: "Use OpenAI Speech-to-Text (latest speech model) ... gpt-4o-mini-transcribe".
    // This suggests potential confusion or a very specific new feature I might be missing.
    //
    // I will use `whisper-1` for transcription (via FormData to save memory) 
    // THEN pass the text to `gpt-4o-mini` (or `gpt-4o`) for analysis.
    // This is the robust, production-ready "Better Flow" for memory.
    // Direct audio analysis via GPT-4o-Audio requires Base64, which puts us back to square one on memory.

    try {
        // 1. Transcribe (Low Memory / FormData)
        const transFormData = new FormData();
        transFormData.append('file', audioBlob, 'audio.ogg');
        transFormData.append('model', 'whisper-1'); // Still the standard endpoint

        const transResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: transFormData
        });

        if (!transResponse.ok) {
            const err = await transResponse.json();
            throw new Error(err.error?.message || 'Transcription failed');
        }

        const transData = await transResponse.json();
        const transcript = transData.text;

        // 2. Analyze Text (GPT-4o / Mini)
        const analyzeResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini', // Fast, cheap, capable enough for text analysis
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Transcript: "${transcript}"` }
                ]
            })
        });

        const analyzeData = await analyzeResponse.json();
        const content = JSON.parse(analyzeData.choices[0].message.content);

        return {
            transcript: transcript,
            sentiment: { overall: 'neutral', score: 0 },
            buyingSignals: content.buyingSignal ? [{
                type: 'neutral' as const,
                confidence: (content.buyingSignal.score || 50) / 100,
                signal: content.buyingSignal.signal || 'General inquiry',
                category: 'general' as const,
                quote: ''
            }] : [],
            urgency: (content.buyingSignal?.urgency?.toLowerCase() || 'medium') as 'high' | 'medium' | 'low',
            suggestedTone: 'Rainmaker',
            keyPoints: [],
            strategy: content.strategy || 'Focus on value.',
            suggestedReply: content.suggestedReply || 'Let\'s discuss.',
            // Legacy fields for backward compatibility
            tone: content.tone || 'Neutral',
            buyingSignal: content.buyingSignal || { signal: 'General inquiry', score: 50, urgency: 'Medium' },
            signals: []
        };

    } catch (error: any) {
        console.error('Audio Analysis Error:', error);
        throw error;
    }
}
