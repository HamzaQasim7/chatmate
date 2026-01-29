import { supabase } from '@/lib/supabase';
import { AudioAnalysisResult } from '../types';

interface AnalyzeAudioParams {
    audioBase64: string;
    apiKey?: string;
}

/**
 * Analyzes audio via Supabase Edge Function (server-side API key).
 * Follows the same pattern as generateReply.
 */
export const analyzeAudioServer = async (params: AnalyzeAudioParams): Promise<AudioAnalysisResult> => {
    // 1. Check Session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        throw new Error('Please sign in to analyze audio.');
    }

    // 2. Call Edge Function
    const { data, error } = await supabase.functions.invoke('analyze-audio', {
        body: params,
    });

    if (error) {
        console.error('Edge Function Error:', error);
        const errorBody = error.context ? await error.context.json().catch(() => null) : null;
        const activeMessage = errorBody?.error || error.message || 'Failed to analyze audio';
        throw new Error(activeMessage);
    }

    // Return enhanced result with all new fields
    return {
        transcript: data.transcript,
        sentiment: data.sentiment || { overall: 'neutral', score: 0 },
        buyingSignals: data.buyingSignals || [],
        urgency: data.urgency || 'medium',
        suggestedTone: data.suggestedTone || 'Rainmaker',
        keyPoints: data.keyPoints || [],
        strategy: data.strategy || 'Focus on value.',
        suggestedReply: data.suggestedReply || 'Let\'s discuss.',
        // Legacy fields for backward compatibility
        tone: data.tone,
        buyingSignal: data.buyingSignal,
        signals: data.signals
    };
};
