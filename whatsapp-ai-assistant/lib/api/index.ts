import { supabase } from '@/lib/supabase';

interface GenerateReplyParams {
    messages: { role: string; content: string }[];
    tone?: string;
    prompt?: string;
    model?: string;
    provider?: string;
    apiKey?: string;
}

export const generateReply = async (params: GenerateReplyParams): Promise<{ reply: string; usage?: number; limit?: number }> => {
    // 1. Check Session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        throw new Error('Please sign in to generate replies.');
    }

    // 2. Call Edge Function
    const { data, error } = await supabase.functions.invoke('generate-reply', {
        body: params,
    });

    if (error) {
        console.error('Edge Function Error Object:', error);

        // Try to parse the error body if hidden in the context/response
        const errorBody = error.context ? await error.context.json().catch(() => null) : null;
        console.error('Edge Function Error Body:', errorBody);

        const activeMessage = errorBody?.error || error.message || 'Failed to generate reply';

        // Handle Limit Exceeded specifically
        if (error.context?.status === 402 || error.status === 402) {
            throw new Error('Usage limit reached. Please upgrade to Pro.');
        }

        // Specific error for model issues
        if (activeMessage.includes('model') && activeMessage.includes('not exist')) {
            throw new Error(`The model '${params.model}' is not available for your API key.`);
        }

        throw new Error(activeMessage);
    }

    return {
        reply: data.reply,
        usage: data.usage,
        limit: data.limit
    };
};
